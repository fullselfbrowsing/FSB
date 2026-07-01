#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'confluence.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'confluence.js');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

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

function bySlug(rows, slug) {
  return rows.find(function(row) { return row && row.slug === slug; }) || null;
}

const READ_SLUGS = [
  'confluence.get_page',
  'confluence.get_page_children',
  'confluence.get_space',
  'confluence.get_user_profile',
  'confluence.list_comment_replies',
  'confluence.list_comments',
  'confluence.list_inline_comments',
  'confluence.list_labels',
  'confluence.list_page_attachments',
  'confluence.list_page_versions',
  'confluence.list_pages',
  'confluence.list_spaces',
  'confluence.search'
];

const GUARDED_SLUGS = [
  'confluence.add_label',
  'confluence.create_comment',
  'confluence.create_inline_comment',
  'confluence.create_page',
  'confluence.delete_comment',
  'confluence.delete_page',
  'confluence.remove_label',
  'confluence.update_page'
];

function makeCtx(responseForSpec) {
  const calls = [];
  return {
    calls,
    ctx: {
      url: 'https://acme.atlassian.net/wiki/spaces/ENG/pages/123',
      tabId: 88,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        return responseForSpec ? responseForSpec(spec, tabId) : { success: true, status: 200, data: {} };
      }
    }
  };
}

(async function run() {
  console.log('--- Confluence T1 handler regression ---');

  const confluence = require(HANDLER_PATH);
  const extConfluence = require(EXT_HANDLER_PATH);
  check(JSON.stringify(Object.keys(extConfluence).sort()) === JSON.stringify(Object.keys(confluence).sort()),
    'extension Confluence handler exports match canonical handler exports');

  for (const slug of READ_SLUGS) {
    check(confluence[slug] && confluence[slug].tier === 'T1a'
      && confluence[slug].origin === 'https://example.atlassian.net'
      && confluence[slug].sideEffectClass === 'read'
      && typeof confluence[slug].handle === 'function',
      slug + ' is a T1a read handler on the representative Confluence tenant');
  }

  for (const slug of GUARDED_SLUGS) {
    const expectedClass = slug.indexOf('delete_') !== -1 || slug === 'confluence.remove_label' ? 'destructive' : 'write';
    check(confluence[slug] && confluence[slug].tier === 'T1a'
      && confluence[slug].origin === 'https://example.atlassian.net'
      && confluence[slug].sideEffectClass === expectedClass
      && typeof confluence[slug].handle === 'function',
      slug + ' is a guarded T1a mutation handler');
  }

  const pagesCtx = makeCtx(function(spec) {
    return spec.url.indexOf('/wiki/api/v2/spaces/SPACE/pages') !== -1
      ? { success: true, status: 200, data: { results: [], _links: {} } }
      : { success: false, code: 'unexpected-url' };
  });
  const pages = await confluence['confluence.list_pages'].handle({
    space_id: 'SPACE',
    limit: 5,
    sort: '-modified-date',
    cursor: 'next'
  }, pagesCtx.ctx);
  check(pages && pages.success === true
    && pagesCtx.calls.length === 1
    && pagesCtx.calls[0].spec.url === 'https://acme.atlassian.net/wiki/api/v2/spaces/SPACE/pages?limit=5&sort=-modified-date&cursor=next'
    && pagesCtx.calls[0].spec.origin === 'https://acme.atlassian.net'
    && pagesCtx.calls[0].spec.method === 'GET'
    && pagesCtx.calls[0].spec.authStrategy === 'same-origin-cookie',
    'confluence.list_pages builds one tenant-pinned same-origin v2 REST GET spec');

  const searchCtx = makeCtx(function(spec) {
    return spec.url.indexOf('/wiki/rest/api/search') !== -1
      ? { success: true, status: 200, data: { results: [], totalSize: 0, size: 0 } }
      : { success: false, code: 'unexpected-url' };
  });
  const search = await confluence['confluence.search'].handle({
    cql: 'type=page',
    limit: 10,
    start: 2
  }, searchCtx.ctx);
  check(search && search.success === true
    && searchCtx.calls[0].spec.url === 'https://acme.atlassian.net/wiki/rest/api/search?cql=type%3Dpage&limit=10&start=2',
    'confluence.search builds a tenant-pinned v1 REST search spec');

  const profileCtx = makeCtx(function(spec) {
    return spec.url.indexOf('/wiki/rest/api/user/current') !== -1
      ? { success: true, status: 200, data: { accountId: 'abc', displayName: 'Ada' } }
      : { success: false, code: 'unexpected-url' };
  });
  const profile = await confluence['confluence.get_user_profile'].handle({}, profileCtx.ctx);
  check(profile && profile.success === true
    && profileCtx.calls[0].spec.url === 'https://acme.atlassian.net/wiki/rest/api/user/current',
    'confluence.get_user_profile defaults to the current-user REST endpoint without scraping page metadata');

  const badOriginCalls = [];
  const badOrigin = await confluence['confluence.list_spaces'].handle({}, {
    origin: 'https://atlassian.net.evil.example',
    tabId: 89,
    async executeBoundSpec() {
      badOriginCalls.push(true);
      return { success: true, status: 200, data: {} };
    }
  });
  check(badOrigin && badOrigin.success === false
    && badOrigin.reason === 'confluence-tenant-origin-unavailable'
    && badOriginCalls.length === 0,
    'Confluence rejects non-tenant origins before building any bound spec');

  const wrongShapeCtx = makeCtx(function() {
    return { success: true, status: 200, data: '<html>sign in</html>' };
  });
  const wrongShape = await confluence['confluence.get_page'].handle({ page_id: '123' }, wrongShapeCtx.ctx);
  check(wrongShape && wrongShape.success === false
    && wrongShape.reason === 'confluence-logged-out-or-shape-mismatch',
    'Confluence logged-out or wrong-shape reads fall back instead of returning success');

  let guardedExecuted = false;
  const guarded = await confluence['confluence.create_page'].handle({ space_id: 'S', title: 'Demo', body: '<p>Demo</p>' }, {
    origin: 'https://acme.atlassian.net',
    async executeBoundSpec() {
      guardedExecuted = true;
      return { success: true };
    }
  });
  check(guarded && guarded.success === false
    && guarded.reason === 'unverified-confluence-create-page-mutation'
    && guardedExecuted === false,
    'confluence.create_page is guarded fail-closed and never calls executeBoundSpec');

  const readiness = await import(pathToFileURL(REPORT_PATH).href);
  const report = readiness.reportReadiness(require(CATALOG_PATH));
  const readyFailures = READ_SLUGS.filter(function(slug) {
    const row = bySlug(report.rows, slug);
    return !row || row.readiness !== 't1-ready' || row.resolvedTier !== 'T1a';
  });
  check(readyFailures.length === 0,
    'Confluence read rows resolve t1-ready T1a' +
    (readyFailures.length ? ': ' + readyFailures.join(', ') : ''));

  const guardedFailures = GUARDED_SLUGS.filter(function(slug) {
    const row = bySlug(report.rows, slug);
    return !row || row.readiness !== 't1-guarded-fail-closed' || row.resolvedTier !== 'T1a';
  });
  check(guardedFailures.length === 0,
    'Confluence write rows resolve t1-guarded-fail-closed T1a' +
    (guardedFailures.length ? ': ' + guardedFailures.join(', ') : ''));

  console.log('\nconfluence-t1-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: Confluence T1 handler test threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
