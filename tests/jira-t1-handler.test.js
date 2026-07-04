#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'jira.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'jira.js');
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
  'jira.get_issue',
  'jira.get_myself',
  'jira.get_project',
  'jira.get_transitions',
  'jira.list_boards',
  'jira.list_comments',
  'jira.list_issue_types',
  'jira.list_priorities',
  'jira.list_projects',
  'jira.list_sprints',
  'jira.search_issues',
  'jira.search_users'
];

const GUARDED_SLUGS = [
  'jira.add_comment',
  'jira.add_watcher',
  'jira.assign_issue',
  'jira.create_issue',
  'jira.delete_issue',
  'jira.link_issues',
  'jira.transition_issue',
  'jira.update_issue'
];

function makeCtx(responseForSpec) {
  const calls = [];
  return {
    calls,
    ctx: {
      origin: 'https://acme.atlassian.net',
      tabId: 77,
      async executeBoundSpec(spec, tabId) {
        calls.push({ spec, tabId });
        return responseForSpec ? responseForSpec(spec, tabId) : { success: true, status: 200, data: {} };
      }
    }
  };
}

(async function run() {
  console.log('--- Jira T1 handler regression ---');

  const jira = require(HANDLER_PATH);
  const extJira = require(EXT_HANDLER_PATH);
  check(JSON.stringify(Object.keys(extJira).sort()) === JSON.stringify(Object.keys(jira).sort()),
    'extension Jira handler exports match canonical handler exports');

  for (const slug of READ_SLUGS) {
    check(jira[slug] && jira[slug].tier === 'T1a'
      && jira[slug].origin === 'https://example.atlassian.net'
      && jira[slug].sideEffectClass === 'read'
      && typeof jira[slug].handle === 'function',
      slug + ' is a T1a read handler on the representative Atlassian tenant');
  }

  for (const slug of GUARDED_SLUGS) {
    const expectedClass = slug === 'jira.delete_issue' ? 'destructive' : 'write';
    check(jira[slug] && jira[slug].tier === 'T1a'
      && jira[slug].origin === 'https://example.atlassian.net'
      && jira[slug].sideEffectClass === expectedClass
      && typeof jira[slug].handle === 'function',
      slug + ' is a guarded T1a mutation handler');
  }

  const projectsCtx = makeCtx(function(spec) {
    return spec.url.indexOf('/rest/api/3/project/search') !== -1
      ? { success: true, status: 200, data: { values: [], total: 0 } }
      : { success: false, code: 'unexpected-url' };
  });
  const projects = await jira['jira.list_projects'].handle({
    query: 'FSB',
    max_results: 5,
    start_at: 10
  }, projectsCtx.ctx);
  check(projects && projects.success === true
    && projectsCtx.calls.length === 1
    && projectsCtx.calls[0].spec.url === 'https://acme.atlassian.net/rest/api/3/project/search?query=FSB&maxResults=5&startAt=10'
    && projectsCtx.calls[0].spec.origin === 'https://acme.atlassian.net'
    && projectsCtx.calls[0].spec.method === 'GET'
    && projectsCtx.calls[0].spec.authStrategy === 'same-origin-cookie',
    'jira.list_projects builds one tenant-pinned same-origin REST GET spec');

  const boardsCtx = makeCtx(function(spec) {
    return spec.url.indexOf('/rest/agile/1.0/board') !== -1
      ? { success: true, status: 200, data: { values: [{ id: 1, name: 'Board' }], total: 1 } }
      : { success: false, code: 'unexpected-url' };
  });
  const boards = await jira['jira.list_boards'].handle({
    project_key: 'KAN',
    type: 'scrum'
  }, boardsCtx.ctx);
  check(boards && boards.success === true
    && boardsCtx.calls[0].spec.url === 'https://acme.atlassian.net/rest/agile/1.0/board?projectKeyOrId=KAN&type=scrum&maxResults=50&startAt=0',
    'jira.list_boards uses the tenant-pinned Agile REST base with safe defaults');

  const badOriginCalls = [];
  const badOrigin = await jira['jira.get_myself'].handle({}, {
    origin: 'https://atlassian.net.evil.example',
    tabId: 78,
    async executeBoundSpec() {
      badOriginCalls.push(true);
      return { success: true, status: 200, data: {} };
    }
  });
  check(badOrigin && badOrigin.success === false
    && badOrigin.reason === 'jira-tenant-origin-unavailable'
    && badOriginCalls.length === 0,
    'Jira rejects non-tenant origins before building any bound spec');

  const wrongShapeCtx = makeCtx(function() {
    return { success: true, status: 200, data: '<html>sign in</html>' };
  });
  const wrongShape = await jira['jira.get_myself'].handle({}, wrongShapeCtx.ctx);
  check(wrongShape && wrongShape.success === false
    && wrongShape.reason === 'jira-logged-out-or-shape-mismatch',
    'Jira logged-out or wrong-shape reads fall back instead of returning success');

  let guardedExecuted = false;
  const guarded = await jira['jira.create_issue'].handle({ project_key: 'KAN', summary: 'Demo' }, {
    origin: 'https://acme.atlassian.net',
    async executeBoundSpec() {
      guardedExecuted = true;
      return { success: true };
    }
  });
  check(guarded && guarded.success === false
    && guarded.reason === 'unverified-jira-create-issue-mutation'
    && guardedExecuted === false,
    'jira.create_issue is guarded fail-closed and never calls executeBoundSpec');

  const readiness = await import(pathToFileURL(REPORT_PATH).href);
  const report = readiness.reportReadiness(require(CATALOG_PATH));
  const readyFailures = READ_SLUGS.filter(function(slug) {
    const row = bySlug(report.rows, slug);
    return !row || row.readiness !== 't1-ready' || row.resolvedTier !== 'T1a';
  });
  check(readyFailures.length === 0,
    'Jira read rows resolve t1-ready T1a' +
    (readyFailures.length ? ': ' + readyFailures.join(', ') : ''));

  const guardedFailures = GUARDED_SLUGS.filter(function(slug) {
    const row = bySlug(report.rows, slug);
    return !row || row.readiness !== 't1-guarded-fail-closed' || row.resolvedTier !== 'T1a';
  });
  check(guardedFailures.length === 0,
    'Jira write rows resolve t1-guarded-fail-closed T1a' +
    (guardedFailures.length ? ': ' + guardedFailures.join(', ') : ''));

  console.log('\njira-t1-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: Jira T1 handler test threw:', err && err.message ? err.message : err);
  process.exit(1);
});
