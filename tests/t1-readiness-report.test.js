'use strict';

/**
 * Phase 44 / Plan 01 -- T1 readiness report invariants.
 *
 * Run: node tests/t1-readiness-report.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function bySlug(rows, slug) {
  return rows.find(function(row) { return row && row.slug === slug; }) || null;
}

(async function run() {
  console.log('--- Phase 44: T1 readiness report invariants ---');

  const catalog = require(CATALOG_PATH);
  const mod = await import(pathToFileURL(REPORT_PATH).href);
  check(typeof mod.reportReadiness === 'function', 'reportReadiness() is exported');
  check(typeof mod.validateReadinessReport === 'function', 'validateReadinessReport() is exported');

  const report = mod.reportReadiness(catalog);
  const rows = report.rows;
  check(Array.isArray(rows), 'report.rows is an array');
  check(rows.length === catalog.descriptors.length,
    'row count equals descriptor count (' + rows.length + ' rows)');

  const validation = mod.validateReadinessReport(report, catalog);
  check(validation.failures.length === 0,
    'validateReadinessReport() passes the committed catalog' +
    (validation.failures.length ? ': ' + validation.failures.join(' | ') : ''));

  const required = [
    'slug',
    'app',
    'service',
    'sideEffectClass',
    'backing',
    'resolvedTier',
    'readiness',
    'originClass',
    'authPattern',
    'routeFeasibility',
    'nextAction',
  ];
  let missingRequired = [];
  for (const row of rows) {
    for (const field of required) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        missingRequired.push(row.slug + ':' + field);
      }
    }
  }
  check(missingRequired.length === 0,
    'every row has the required readiness fields' +
    (missingRequired.length ? ' -- missing: ' + missingRequired.slice(0, 10).join(', ') : ''));

  const knownReady = [
    'github.notifications',
    'reddit.inbox',
    'github.issues.list',
    'netlify.list_sites',
    'netlify.get_site',
    'netlify.list_deploys',
    'netlify.list_forms',
    'bitbucket.list_workspaces',
    'bitbucket.list_repositories',
    'bitbucket.get_repository',
    'circleci.get_current_user',
    'circleci.list_pipelines',
    'circleci.get_project',
    'circleci.get_pipeline',
    'circleci.get_pipeline_workflows',
    'circleci.get_workflow',
    'circleci.get_workflow_jobs',
    'circleci.get_job',
    'circleci.get_job_artifacts',
    'circleci.get_job_tests',
    'vercel.get_user',
    'vercel.list_teams',
    'vercel.list_projects',
    'vercel.get_project',
    'vercel.list_deployments',
    'vercel.get_deployment',
    'vercel.list_domains',
    'notion.getSpaces',
    'notion.create_page',
    'notion.update_page',
    'notion.create_database',
    'notion.create_database_item',
    'slack.chat.postMessage',
  ];
  const readyOffenders = [];
  for (const slug of knownReady) {
    const row = bySlug(rows, slug);
    if (row && row.readiness !== 't1-ready') readyOffenders.push(slug + ' -> ' + row.readiness);
  }
  check(readyOffenders.length === 0,
    'known executable recipe/head slugs are t1-ready' +
    (readyOffenders.length ? ' -- ' + readyOffenders.join(', ') : ''));

  const guarded = [
    'github.issues.create',
    'gitlab.create_issue',
    'gitlab.create_merge_request',
    'gitlab.create_note',
    'slack.send_message',
  ];
  const guardedOffenders = [];
  for (const slug of guarded) {
    const row = bySlug(rows, slug);
    if (!row || row.readiness !== 't1-guarded-fail-closed') {
      guardedOffenders.push(slug + ' -> ' + (row ? row.readiness : 'missing'));
    }
  }
  check(guardedOffenders.length === 0,
    'known guarded writes are t1-guarded-fail-closed, not t1-ready' +
    (guardedOffenders.length ? ' -- ' + guardedOffenders.join(', ') : ''));

  const domResolvedT3Offenders = rows.filter(function(row) {
    return row.backing === 'dom' &&
      row.resolvedTier === 'T3' &&
      row.originClass !== 'denied' &&
      row.readiness !== 'discovery-pending';
  });
  check(domResolvedT3Offenders.length === 0,
    'backing:dom rows resolved to T3 remain discovery-pending unless a stronger state exists' +
    (domResolvedT3Offenders.length ? ' -- ' + domResolvedT3Offenders.slice(0, 5).map(function(row) { return row.slug; }).join(', ') : ''));

  const learnCatalog = {
    recipes: catalog.recipes,
    descriptors: catalog.descriptors.concat([{
      slug: 'phase44.synthetic_learn',
      service: 'example.com',
      sideEffectClass: 'read',
      backing: 'learn',
      intentSynonyms: ['phase 44 synthetic learn'],
      description: 'Synthetic learn-pending descriptor for report tests',
      actionVerb: 'read',
    }]),
  };
  const learnReport = mod.reportReadiness(learnCatalog);
  const learnRow = bySlug(learnReport.rows, 'phase44.synthetic_learn');
  check(learnRow && learnRow.readiness === 'learn-pending' && learnRow.resolvedTier === 'T2',
    'backing:learn rows are learn-pending');

  const badReady = rows.filter(function(row) {
    return row.readiness === 't1-ready' &&
      (['T0', 'T1a', 'T1b'].indexOf(row.resolvedTier) === -1 || !(row.hasHandlerProof || row.hasRecipeProof));
  });
  check(badReady.length === 0,
    'no t1-ready row lacks T0/T1a/T1b handler/recipe proof' +
    (badReady.length ? ' -- ' + badReady.map(function(row) { return row.slug; }).join(', ') : ''));

  console.log('\nt1-readiness-report: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: t1-readiness-report threw:', err && err.message ? err.message : err);
  process.exit(1);
});
