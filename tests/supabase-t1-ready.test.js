#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_HANDLER = path.join(ROOT, 'catalog', 'handlers', 'supabase.js');
const EXT_HANDLER = path.join(ROOT, 'extension', 'catalog', 'handlers', 'supabase.js');
const FETCH_PATH = path.join(ROOT, 'extension', 'utils', 'capability-fetch.js');
const CATALOG_PATH = path.join(ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(ROOT, 'scripts', 'report-t1-readiness.mjs');
const CONTRACT_PATH = path.join(ROOT, 'scripts', 'lib', 't1-port-contract.mjs');

const READ_SLUGS = [
  'supabase.generate_types',
  'supabase.get_api_keys',
  'supabase.get_function',
  'supabase.get_organization',
  'supabase.get_performance_advisors',
  'supabase.get_postgrest_config',
  'supabase.get_project',
  'supabase.get_project_health',
  'supabase.get_project_logs',
  'supabase.get_security_advisors',
  'supabase.list_backups',
  'supabase.list_buckets',
  'supabase.list_functions',
  'supabase.list_migrations',
  'supabase.list_organization_members',
  'supabase.list_organizations',
  'supabase.list_projects',
  'supabase.list_secrets',
  'supabase.list_sql_snippets',
];

const GUARDED_SLUGS = [
  'supabase.create_secrets',
  'supabase.delete_function',
  'supabase.delete_secrets',
  'supabase.pause_project',
  'supabase.restore_project',
  'supabase.run_query',
  'supabase.run_read_only_query',
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

function mockResponse(data, status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    type: 'basic',
    async json() {
      return data;
    },
  };
}

(async function run() {
  console.log('--- Supabase T1 readiness proof ---');

  check(fs.existsSync(CATALOG_HANDLER), 'catalog/handlers/supabase.js exists');
  check(fs.existsSync(EXT_HANDLER), 'extension/catalog/handlers/supabase.js exists');
  check(fs.readFileSync(CATALOG_HANDLER, 'utf8') === fs.readFileSync(EXT_HANDLER, 'utf8'),
    'extension Supabase handler mirrors catalog handler');

  const source = fs.readFileSync(CATALOG_HANDLER, 'utf8');
  const contract = await import(pathToFileURL(CONTRACT_PATH).href);
  const sourceFailures = contract.validateHandlerSource(source, {
    slug: 'supabase',
    handlerFile: 'supabase.js',
  }).failures;
  check(sourceFailures.length === 0,
    'Supabase handler source passes T1 source safety scan' +
    (sourceFailures.length ? ': ' + sourceFailures.join(' | ') : ''));
  check(!/document\.cookie|localStorage|sessionStorage/.test(source),
    'Supabase handler does not read cookies or browser storage directly');

  const handlers = freshRequire(CATALOG_HANDLER);
  check(Object.keys(handlers).length === 26, 'Supabase handler exports all 26 descriptor slugs');
  check(READ_SLUGS.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://supabase.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function'),
    'all Supabase read descriptors are T1a reads pinned to supabase.com');
  check(GUARDED_SLUGS.every((slug) => handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://supabase.com'
      && handlers[slug].sideEffectClass !== 'read'
      && typeof handlers[slug].handle === 'function'),
    'all Supabase mutation descriptors are guarded non-read handlers');

  const pageCalls = [];
  const readOut = await handlers['supabase.list_projects'].handle({}, {
    tabId: 61,
    async executeBoundPageRead(request, tabId) {
      pageCalls.push({ request, tabId });
      return { success: true, status: 200, data: { projects: [] } };
    },
    async executeBoundSpec() {
      throw new Error('Supabase reads must use executeBoundPageRead, not executeBoundSpec');
    },
  });
  check(readOut && readOut.success === true
      && pageCalls.length === 1
      && pageCalls[0].tabId === 61
      && pageCalls[0].request.origin === 'https://supabase.com'
      && pageCalls[0].request.namespace === 'supabase'
      && pageCalls[0].request.action === 'list_projects',
    'Supabase read delegates to the bounded page-read primitive');

  const guardCalls = [];
  const guardOut = await handlers['supabase.pause_project'].handle({ ref: 'abcdefghijklmnopqrst' }, {
    async executeBoundSpec() { guardCalls.push('spec'); },
    async executeBoundPageRead() { guardCalls.push('page'); },
  });
  check(guardOut && guardOut.success === false
      && guardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && guardOut.errorCode === guardOut.code
      && guardOut.error === guardOut.code
      && guardOut.fellBackToDom === true
      && guardCalls.length === 0,
    'Supabase guarded mutation fails closed without execution primitive calls');

  const fetchMod = freshRequire(FETCH_PATH);
  const priorLocation = globalThis.location;
  const priorLocalStorage = globalThis.localStorage;
  const priorFetch = globalThis.fetch;
  const fetchCalls = [];
  try {
    globalThis.location = { origin: 'https://supabase.com' };
    globalThis.localStorage = {
      getItem(key) {
        if (key !== 'supabase.dashboard.auth.token') return null;
        return JSON.stringify({
          access_token: 'sbp_test_token_value',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
      },
    };
    globalThis.fetch = async function(url, init) {
      fetchCalls.push({ url: String(url), init });
      if (String(url) === 'https://api.supabase.com/v1/projects') {
        return mockResponse([{
          id: 'abcdefghijklmnopqrst',
          name: 'Example',
          organization_id: 'org_123',
          region: 'us-east-1',
          status: 'ACTIVE_HEALTHY',
          created_at: '2026-07-01T00:00:00Z',
        }], 200);
      }
      if (String(url).indexOf('/analytics/endpoints/logs.all') !== -1) {
        return mockResponse({ result: [{ id: 'log_1', event_message: 'ok' }] }, 200);
      }
      return mockResponse({}, 404);
    };

    const pageOut = await fetchMod.capabilityPageReadInPage({
      origin: 'https://supabase.com',
      namespace: 'supabase',
      action: 'list_projects',
      args: {},
    });
    check(pageOut && pageOut.success === true
        && pageOut.data.projects[0].id === 'abcdefghijklmnopqrst'
        && fetchCalls[0].url === 'https://api.supabase.com/v1/projects'
        && fetchCalls[0].init.credentials === 'omit'
        && fetchCalls[0].init.headers.Authorization === 'Bearer sbp_test_token_value',
      'Supabase page-read branch reads page auth and calls the Management API without returning auth material');

    const logsOut = await fetchMod.capabilityPageReadInPage({
      origin: 'https://supabase.com',
      namespace: 'supabase',
      action: 'get_project_logs',
      args: { ref: 'abcdefghijklmnopqrst', source: 'auth' },
    });
    const logUrl = fetchCalls[1] && fetchCalls[1].url;
    check(logsOut && logsOut.success === true
        && logsOut.data.logs[0].id === 'log_1'
        && logUrl.indexOf('/projects/abcdefghijklmnopqrst/analytics/endpoints/logs.all') !== -1
        && decodeURIComponent(logUrl).indexOf('auth_logs') !== -1,
      'Supabase logs page-read uses the reviewed log-source allowlist');

    const badSource = await fetchMod.capabilityPageReadInPage({
      origin: 'https://supabase.com',
      namespace: 'supabase',
      action: 'get_project_logs',
      args: { ref: 'abcdefghijklmnopqrst', source: 'bad_table;drop' },
    });
    check(badSource && badSource.success === false
        && badSource.reason === 'supabase-log-source-unsupported',
      'Supabase logs page-read rejects unsupported log sources before fetch');
  } finally {
    if (priorLocation === undefined) delete globalThis.location;
    else globalThis.location = priorLocation;
    if (priorLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorLocalStorage;
    if (priorFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = priorFetch;
  }

  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(require(CATALOG_PATH));
  for (const slug of READ_SLUGS) {
    const row = bySlug(report.rows, slug);
    check(row && row.readiness === 't1-ready'
        && row.resolvedTier === 'T1a'
        && row.hasHandlerProof === true,
      slug + ' is t1-ready with handler proof');
  }
  for (const slug of GUARDED_SLUGS) {
    const row = bySlug(report.rows, slug);
    check(row && row.readiness === 't1-guarded-fail-closed'
        && row.resolvedTier === 'T1a'
        && row.hasHandlerProof === true,
      slug + ' is guarded fail-closed with handler proof');
  }

  console.log('\nsupabase-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: supabase-t1-ready threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
