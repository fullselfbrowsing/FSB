#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'clickup.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'clickup.js');
const FETCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-fetch.js');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const CONTRACT_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 't1-port-contract.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

const READ_SLUGS = [
  'clickup.get_current_user',
  'clickup.get_custom_fields',
  'clickup.get_folder',
  'clickup.get_folders',
  'clickup.get_goals',
  'clickup.get_list',
  'clickup.get_lists',
  'clickup.get_space',
  'clickup.get_spaces',
  'clickup.get_workspace',
  'clickup.get_workspace_members',
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
  return rows.find((row) => row && row.slug === slug) || null;
}

function installClickUpPage(fetchImpl, apiBase) {
  const storage = {
    cuHandshake: JSON.stringify({
      'team-1': {
        workspaceId: 'team-1',
        shardId: 'shard-1',
        appEnvironment: {
          apiUrlBase: apiBase || 'https://api.clickup.com/api',
          websocketUrl: 'wss://app.clickup.com/ws',
        },
      },
    }),
  };
  const prior = {
    location: globalThis.location,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    jwt: globalThis.__cu_captured_jwt,
    team: globalThis.__cu_captured_team_id,
  };
  globalThis.location = { origin: 'https://app.clickup.com' };
  globalThis.__cu_captured_jwt = 'clickup-jwt-TEST-SYNTHETIC';
  globalThis.__cu_captured_team_id = 'team-1';
  globalThis.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
  };
  globalThis.fetch = fetchImpl;
  return function restore() {
    if (prior.location === undefined) delete globalThis.location; else globalThis.location = prior.location;
    if (prior.localStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prior.localStorage;
    if (prior.fetch === undefined) delete globalThis.fetch; else globalThis.fetch = prior.fetch;
    if (prior.jwt === undefined) delete globalThis.__cu_captured_jwt; else globalThis.__cu_captured_jwt = prior.jwt;
    if (prior.team === undefined) delete globalThis.__cu_captured_team_id; else globalThis.__cu_captured_team_id = prior.team;
  };
}

async function testHandler() {
  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/clickup.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/clickup.js exists');
  check(fs.readFileSync(HANDLER_PATH, 'utf8') === fs.readFileSync(EXT_HANDLER_PATH, 'utf8'),
    'extension ClickUp handler mirrors catalog handler');

  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const sourceFailures = contract.validateHandlerSource(fs.readFileSync(HANDLER_PATH, 'utf8'), {
    slug: 'clickup',
    handlerFile: 'clickup.js',
  }).failures;
  check(sourceFailures.length === 0,
    'ClickUp handler source passes T1 source safety scan' +
    (sourceFailures.length ? ': ' + sourceFailures.join(' | ') : ''));

  const handlers = freshRequire(HANDLER_PATH);
  check(READ_SLUGS.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://app.clickup.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function'),
    'all ClickUp descriptors expose T1a read handlers pinned to app.clickup.com');

  const calls = [];
  const out = await handlers['clickup.get_spaces'].handle({ workspace_id: 'team-1', include_archived: true }, {
    tabId: 72,
    async executeBoundPageRead(request, tabId) {
      calls.push({ request, tabId });
      return { success: true, status: 200, data: { spaces: [] } };
    },
  });
  check(out && out.success === true
      && calls.length === 1
      && calls[0].tabId === 72
      && calls[0].request.origin === 'https://app.clickup.com'
      && calls[0].request.namespace === 'clickup'
      && calls[0].request.action === 'get_spaces'
      && calls[0].request.args.workspace_id === 'team-1',
    'clickup.get_spaces dispatches one bounded ClickUp page-read request');

  const noPrimitive = await handlers['clickup.get_current_user'].handle({}, {});
  check(noPrimitive && noPrimitive.success === false
      && noPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && noPrimitive.reason === 'clickup-page-read-primitive-unavailable',
    'ClickUp handler fails closed when page-read primitive is unavailable');
}

async function testPageRead() {
  const fetchMod = freshRequire(FETCH_PATH);
  const calls = [];
  const restore = installClickUpPage(async function(url, init) {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      type: 'basic',
      async json() {
        return [
          { id: 'space-1', name: 'Engineering', color: '#7B68EE', private: false, archived: false, multiple_assignees: true },
        ];
      },
    };
  });
  try {
    const out = await fetchMod.capabilityPageReadInPage({
      origin: 'https://app.clickup.com',
      namespace: 'clickup',
      action: 'get_spaces',
      args: { include_archived: false },
    });
    check(out && out.success === true
        && out.data.spaces[0].id === 'space-1'
        && out.data.spaces[0].name === 'Engineering',
      'ClickUp page-read maps workspace spaces');
    check(calls.length === 1
        && calls[0].url === 'https://api.clickup.com/api/hierarchy/v1/project?team=team-1&include_archived=false'
        && calls[0].init.method === 'GET'
        && calls[0].init.credentials === 'include'
        && calls[0].init.headers.Authorization === 'Bearer clickup-jwt-TEST-SYNTHETIC',
      'ClickUp page-read uses page JWT and handshake API base inside the origin-pinned page function');
  } finally {
    restore();
  }

  const rejectedCalls = [];
  const restoreRejected = installClickUpPage(async function(url, init) {
    rejectedCalls.push({ url, init });
    return { ok: true, status: 200, type: 'basic', async json() { return {}; } };
  }, 'https://evil.example/api');
  try {
    const out = await fetchMod.capabilityPageReadInPage({
      origin: 'https://app.clickup.com',
      namespace: 'clickup',
      action: 'get_current_user',
      args: {},
    });
    check(out && out.success === false
        && out.code === 'RECIPE_DOM_FALLBACK_PENDING'
        && out.reason === 'clickup-auth-unavailable'
        && rejectedCalls.length === 0,
      'ClickUp page-read rejects non-ClickUp handshake API bases before fetch');
  } finally {
    restoreRejected();
  }
}

async function testReadiness() {
  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(require(CATALOG_PATH));
  const failures = READ_SLUGS.filter((slug) => {
    const row = bySlug(report.rows, slug);
    return !row || row.readiness !== 't1-ready' || row.resolvedTier !== 'T1a' || row.hasHandlerProof !== true;
  });
  check(failures.length === 0,
    'ClickUp read rows resolve t1-ready T1a with handler proof' +
    (failures.length ? ': ' + failures.join(', ') : ''));
}

(async function run() {
  console.log('--- ClickUp T1 readiness regression ---');
  await testHandler();
  await testPageRead();
  await testReadiness();
  console.log('\nclickup-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: ClickUp T1 readiness test threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
