#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_HANDLER = path.join(ROOT, 'catalog', 'handlers', 'gmaps.js');
const EXT_HANDLER = path.join(ROOT, 'extension', 'catalog', 'handlers', 'gmaps.js');
const FETCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-fetch.js');
const CATALOG_PATH = path.join(ROOT, 'extension', 'utils', 'capability-catalog.js');
const INDEX_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(ROOT, 'scripts', 'report-t1-readiness.mjs');
const CONTRACT_PATH = path.join(ROOT, 'scripts', 'lib', 't1-port-contract.mjs');
const EVIDENCE_PATH = path.join(ROOT, 'catalog', 'write-activation-evidence.json');

const READ_SLUGS = [
  'gmaps.get_current_view',
  'gmaps.get_directions_info',
  'gmaps.get_directions_url',
  'gmaps.get_map_url',
  'gmaps.get_place_details',
  'gmaps.get_place_url',
  'gmaps.navigate_to_directions',
  'gmaps.navigate_to_location',
  'gmaps.navigate_to_place',
  'gmaps.navigate_to_search',
  'gmaps.search_nearby',
  'gmaps.search_places',
  'gmaps.share_location',
  'gmaps.toggle_layer',
  'gmaps.zoom_map'
];

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

function bySlug(rows, slug) {
  return rows.find(function(row) { return row && row.slug === slug; }) || null;
}

(async function run() {
  console.log('--- Google Maps T1 readiness proof ---');

  check(fs.existsSync(CATALOG_HANDLER), 'catalog/handlers/gmaps.js exists');
  check(fs.existsSync(EXT_HANDLER), 'extension/catalog/handlers/gmaps.js exists');
  check(fs.existsSync(CATALOG_HANDLER) && fs.existsSync(EXT_HANDLER)
      && fs.readFileSync(CATALOG_HANDLER, 'utf8') === fs.readFileSync(EXT_HANDLER, 'utf8'),
    'extension Google Maps handler mirrors catalog handler');

  const source = fs.existsSync(CATALOG_HANDLER) ? fs.readFileSync(CATALOG_HANDLER, 'utf8') : '';
  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const sourceValidation = contract.validateHandlerSource(source, { slug: 'gmaps', handlerFile: 'gmaps.js' });
  check(sourceValidation.failures.length === 0,
    'gmaps handler passes T1 handler source guard' +
    (sourceValidation.failures.length ? ' -- ' + sourceValidation.failures.join(', ') : ''));

  const handlers = freshRequire(CATALOG_HANDLER);
  check(READ_SLUGS.every(function(slug) {
    return handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://www.google.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function';
  }), 'Google Maps read slugs are T1a reads pinned to www.google.com');
  check(handlers['gmaps.set_travel_mode']
      && handlers['gmaps.set_travel_mode'].tier === 'T1a'
      && handlers['gmaps.set_travel_mode'].origin === 'https://www.google.com'
      && handlers['gmaps.set_travel_mode'].sideEffectClass === 'write'
      && typeof handlers['gmaps.set_travel_mode'].handle === 'function',
    'gmaps.set_travel_mode is a guarded write handler');

  const directions = await handlers['gmaps.get_directions_url'].handle({
    origin: 'San Francisco',
    destination: 'Oakland',
    travel_mode: 'walking'
  });
  check(directions && directions.success === true
      && directions.data.url === 'https://www.google.com/maps/dir/San%20Francisco/Oakland/data=!4m2!4m1!3e2',
    'gmaps.get_directions_url builds deterministic walking directions URL');

  const mapUrl = await handlers['gmaps.get_map_url'].handle({
    type: 'location',
    lat: 38,
    lng: -85,
    zoom: 12
  });
  check(mapUrl && mapUrl.success === true
      && mapUrl.data.url === 'https://www.google.com/maps/@38,-85,12z',
    'gmaps.get_map_url builds deterministic location URL');

  const placeUrl = await handlers['gmaps.get_place_url'].handle({ query: 'Fixture Cafe' });
  check(placeUrl && placeUrl.success === true
      && placeUrl.data.url === 'https://www.google.com/maps/place/Fixture%20Cafe',
    'gmaps.get_place_url builds deterministic place URL');

  const pageCalls = [];
  const viewOut = await handlers['gmaps.get_current_view'].handle({}, {
    tabId: 42,
    async executeBoundPageRead(request, tabId) {
      pageCalls.push({ request, tabId });
      return { success: true, status: 200, data: { view: { lat: 38.25, lng: -85.75, zoom: 14 } } };
    }
  });
  check(viewOut && viewOut.success === true
      && pageCalls.length === 1
      && pageCalls[0].tabId === 42
      && pageCalls[0].request.origin === 'https://www.google.com'
      && pageCalls[0].request.namespace === 'gmaps'
      && pageCalls[0].request.action === 'get_current_view',
    'gmaps.get_current_view dispatches one bounded Maps page-read request');

  const specCalls = [];
  const searchOut = await handlers['gmaps.search_places'].handle({
    query: 'coffee',
    lat: 38.25,
    lng: -85.75,
    radius: 1000,
    max_results: 2
  }, {
    tabId: 7,
    async executeBoundSpec(spec, tabId) {
      specCalls.push({ spec, tabId });
      return {
        success: true,
        status: 200,
        text: ")]}'\n[\"0xabc:0xdef\",\"0xabc:0xdef\",\"0x111:0x222\"]"
      };
    }
  });
  check(searchOut && searchOut.success === true
      && specCalls.length === 1
      && specCalls[0].tabId === 7
      && specCalls[0].spec.origin === 'https://www.google.com'
      && specCalls[0].spec.url.indexOf('https://www.google.com/search?') === 0
      && searchOut.data.places.length === 2
      && searchOut.data.places[0].place_id === '0xabc:0xdef'
      && searchOut.data.places[1].place_id === '0x111:0x222',
    'gmaps.search_places uses same-origin executeBoundSpec and de-dupes place IDs');

  const embedded = JSON.stringify([[
    '0xaaa:0xbbb',
    'Fixture Cafe',
    [[0, -85.1, 38.2]],
    [null, null, 38.21, -85.11],
    'padding padding padding padding padding padding padding'
  ]]);
  const state = JSON.stringify([null, null, null, [embedded]]);
  const detailOut = await handlers['gmaps.get_place_details'].handle({ query: 'Fixture Cafe' }, {
    tabId: 8,
    async executeBoundSpec(spec, tabId) {
      specCalls.push({ spec, tabId });
      return {
        success: true,
        status: 200,
        text: '<script>window.APP_INITIALIZATION_STATE = ' + state + '; window.APP_FLAGS = {};</script>'
      };
    }
  });
  check(detailOut && detailOut.success === true
      && detailOut.data.place.name === 'Fixture Cafe'
      && detailOut.data.place.place_id === '0xaaa:0xbbb'
      && detailOut.data.place.lat === 38.21
      && detailOut.data.place.lng === -85.11,
    'gmaps.get_place_details maps first-party initialization state into a place detail');

  const guardCalls = [];
  const guardOut = await handlers['gmaps.set_travel_mode'].handle({ travel_mode: 'transit' }, {
    async executeBoundSpec() { guardCalls.push('spec'); },
    async executeBoundPageRead() { guardCalls.push('page'); }
  });
  check(guardOut && guardOut.success === false
      && guardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && guardOut.errorCode === guardOut.code
      && guardOut.error === guardOut.code
      && guardOut.fellBackToDom === true
      && guardCalls.length === 0,
    'gmaps.set_travel_mode is guarded fail-closed and calls no execution primitive');

  const fetchMod = freshRequire(FETCH_PATH);
  const priorLocation = globalThis.location;
  const priorState = globalThis.APP_INITIALIZATION_STATE;
  try {
    globalThis.location = {
      origin: 'https://www.google.com',
      href: 'https://www.google.com/maps/search/coffee/@38.25,-85.75,14z'
    };
    delete globalThis.APP_INITIALIZATION_STATE;
    const pageOut = await fetchMod.capabilityPageReadInPage({
      origin: 'https://www.google.com',
      namespace: 'gmaps',
      action: 'get_current_view',
      args: {}
    });
    check(pageOut && pageOut.success === true
        && pageOut.data.view.lat === 38.25
        && pageOut.data.view.lng === -85.75
        && pageOut.data.view.zoom === 14
        && pageOut.data.view.query === 'coffee',
      'Maps page-read branch derives current view from location.href');
  } finally {
    if (priorLocation === undefined) { delete globalThis.location; } else { globalThis.location = priorLocation; }
    if (priorState === undefined) { delete globalThis.APP_INITIALIZATION_STATE; } else { globalThis.APP_INITIALIZATION_STATE = priorState; }
  }

  const previousIndex = global.FsbRecipeIndex;
  try {
    global.FsbRecipeIndex = require(INDEX_PATH);
    const catalog = freshRequire(CATALOG_PATH);
    freshRequire(CATALOG_HANDLER);
    catalog.seedHeadHandlers();
    const resolved = catalog.resolve('gmaps.get_map_url', 'https://www.google.com');
    check(resolved && resolved.tier === 'T1a' && resolved.origin === 'https://www.google.com',
      'capability catalog resolves gmaps.get_map_url as T1a');

    const reportMod = await import(pathToFileURL(REPORT_PATH).href);
    const report = reportMod.reportReadiness(global.FsbRecipeIndex, {
      resolveFn: function(slug, origin) { return catalog.resolve(slug, origin); }
    });
    const notReady = READ_SLUGS.filter(function(slug) {
      const row = bySlug(report.rows, slug);
      return !row || row.readiness !== 't1-ready';
    });
    const guardedRow = bySlug(report.rows, 'gmaps.set_travel_mode');
    check(notReady.length === 0 && guardedRow && guardedRow.readiness === 't1-guarded-fail-closed',
      'readiness report marks Maps reads ready and travel-mode write guarded' +
      (notReady.length ? ' -- not ready: ' + notReady.join(', ') : ''));
  } finally {
    if (previousIndex === undefined) { delete global.FsbRecipeIndex; } else { global.FsbRecipeIndex = previousIndex; }
  }

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  check(Array.isArray(evidence.guardedWrites)
      && evidence.guardedWrites.some(function(row) {
        return row && row.slug === 'gmaps.set_travel_mode'
          && row.failClosedReason === 'unverified-gmaps-set-travel-mode-mutation';
      }),
    'write activation evidence records gmaps.set_travel_mode as guarded fail-closed');

  console.log('\ngmaps-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL (gmaps-t1-ready):', err && err.stack ? err.stack : err);
  process.exit(1);
});
