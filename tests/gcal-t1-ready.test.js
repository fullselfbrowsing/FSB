#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const harness = require('./fixtures/run-task-harness');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_HANDLER = path.join(ROOT, 'catalog', 'handlers', 'gcal.js');
const EXT_HANDLER = path.join(ROOT, 'extension', 'catalog', 'handlers', 'gcal.js');
const FETCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-fetch.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

(async function run() {
  console.log('--- Google Calendar T1 readiness proof ---');

  check(fs.existsSync(CATALOG_HANDLER), 'catalog/handlers/gcal.js exists');
  check(fs.existsSync(EXT_HANDLER), 'extension/catalog/handlers/gcal.js exists');
  check(fs.existsSync(CATALOG_HANDLER) && fs.existsSync(EXT_HANDLER)
    && fs.readFileSync(CATALOG_HANDLER, 'utf8') === fs.readFileSync(EXT_HANDLER, 'utf8'),
    'extension Google Calendar handler mirrors catalog handler');

  const src = fs.existsSync(CATALOG_HANDLER) ? fs.readFileSync(CATALOG_HANDLER, 'utf8') : '';
  check(!/chrome\.(?:scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bXMLHttpRequest\s*\(|document\.cookie|localStorage|sessionStorage/.test(src),
    'gcal handler has no direct network, browser credential, or storage APIs');

  const handlers = freshRequire(CATALOG_HANDLER);
  const readSlugs = [
    'gcal.get_calendar',
    'gcal.get_colors',
    'gcal.get_event',
    'gcal.get_setting',
    'gcal.list_calendars',
    'gcal.list_event_instances',
    'gcal.list_events',
    'gcal.list_settings',
    'gcal.search_events'
  ];
  const guardedSlugs = [
    'gcal.create_calendar',
    'gcal.create_event',
    'gcal.delete_calendar',
    'gcal.delete_event',
    'gcal.move_event',
    'gcal.query_freebusy',
    'gcal.quick_add_event',
    'gcal.update_calendar',
    'gcal.update_event'
  ];

  check(readSlugs.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://calendar.google.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function'),
    'Google Calendar read slugs are T1a reads pinned to calendar.google.com');
  check(guardedSlugs.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://calendar.google.com'
      && handlers[slug].sideEffectClass !== 'read'
      && typeof handlers[slug].handle === 'function'),
    'Google Calendar mutation/freebusy slugs are guarded non-read handlers');

  const pageCalls = [];
  const readOut = await handlers['gcal.list_events'].handle({ calendar_id: 'primary', max_results: 5 }, {
    tabId: 42,
    async executeBoundPageRead(request, tabId) {
      pageCalls.push({ request, tabId });
      return { success: true, status: 200, data: { items: [] } };
    },
    async executeBoundSpec() {
      throw new Error('gcal reads must use executeBoundPageRead, not executeBoundSpec');
    }
  });
  check(readOut && readOut.success === true
      && pageCalls.length === 1
      && pageCalls[0].tabId === 42
      && pageCalls[0].request.origin === 'https://calendar.google.com'
      && pageCalls[0].request.namespace === 'gcal'
      && pageCalls[0].request.action === 'list_events'
      && pageCalls[0].request.args.calendar_id === 'primary',
    'gcal.list_events dispatches one bounded Calendar page-read request');

  const guardCalls = [];
  const guardOut = await handlers['gcal.create_event'].handle({ summary: 'Planning' }, {
    async executeBoundSpec() { guardCalls.push('spec'); },
    async executeBoundPageRead() { guardCalls.push('page'); }
  });
  check(guardOut && guardOut.success === false
      && guardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && guardOut.errorCode === guardOut.code
      && guardOut.error === guardOut.code
      && guardOut.fellBackToDom === true
      && guardCalls.length === 0,
    'gcal.create_event is guarded fail-closed and calls no execution primitive');

  const fetchMod = freshRequire(FETCH_PATH);
  const priorLocation = globalThis.location;
  const priorGapi = globalThis.gapi;
  try {
    globalThis.location = { origin: 'https://calendar.google.com' };
    globalThis.gapi = {
      client: {
        request(opts) {
          return Promise.resolve({
            status: 200,
            result: {
              path: opts.path,
              params: opts.params
            }
          });
        }
      }
    };
    const pageOut = await fetchMod.capabilityPageReadInPage({
      origin: 'https://calendar.google.com',
      namespace: 'gcal',
      action: 'list_events',
      args: { calendar_id: 'primary', max_results: 5 }
    });
    check(pageOut && pageOut.success === true
        && pageOut.data.path === '/calendar/v3/calendars/primary/events'
        && pageOut.data.params.maxResults === 5,
      'Calendar page-read branch calls page-owned gapi.client.request with the expected path and params');
  } finally {
    if (priorLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorLocation; }
    if (priorGapi === undefined) { delete globalThis.gapi; } else { globalThis.gapi = priorGapi; }
  }

  const chromeHandle = harness.installChromeMock({ tabs: [{ id: 99, url: 'https://calendar.google.com/calendar/u/0/r' }] });
  chromeHandle.chrome.scripting = {
    async executeScript(opts) {
      return [{ result: { success: true, status: 200, data: { namespace: opts.args[0].namespace } } }];
    }
  };
  try {
    const wrapped = await fetchMod.executeBoundPageRead({
      origin: 'https://calendar.google.com',
      namespace: 'gcal',
      action: 'get_colors',
      args: {}
    }, 99);
    check(wrapped && wrapped.success === true && wrapped.data.namespace === 'gcal',
      'executeBoundPageRead injects the Calendar request only after the active-tab origin pin passes');
  } finally {
    chromeHandle.restore();
  }

  console.log('\ngcal-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL (gcal-t1-ready):', err && err.stack ? err.stack : err);
  process.exit(1);
});
