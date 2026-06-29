'use strict';

/**
 * Phase 44 / Plan 03 -- readiness gate positive and negative controls.
 *
 * Run: node tests/t1-readiness-gate.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const GATE_PATH = path.join(REPO_ROOT, 'scripts', 'verify-t1-readiness-gate.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function cloneRows(rows) {
  return rows.map(function(row) { return Object.assign({}, row); });
}

(async function run() {
  console.log('--- Phase 44: T1 readiness gate controls ---');

  const catalog = require(CATALOG_PATH);
  const mod = await import(pathToFileURL(GATE_PATH).href);
  check(typeof mod.validateReadinessGate === 'function', 'validateReadinessGate() is exported');
  check(typeof mod.validateReadinessRows === 'function', 'validateReadinessRows() is exported');

  const positive = mod.validateReadinessGate(catalog);
  check(positive.failures.length === 0,
    'current committed catalog passes the readiness gate' +
    (positive.failures.length ? ': ' + positive.failures.join(' | ') : ''));

  const baseRows = positive.report.rows;
  const fakeReady = cloneRows(baseRows);
  fakeReady[0] = Object.assign({}, fakeReady[0], {
    slug: 'phase44.fake_ready_without_proof',
    readiness: 't1-ready',
    resolvedTier: 'T3',
    backing: 'dom',
    proof: 'none',
    hasHandlerProof: false,
    hasRecipeProof: false,
  });
  const fakeReadyFailures = mod.validateReadinessRows(fakeReady, { expectedDescriptorCount: fakeReady.length }).failures;
  check(fakeReadyFailures.some(function(f) { return f.indexOf('fake_ready_without_proof') !== -1; }),
    'synthetic t1-ready row without handler/recipe proof fails');

  const fakeHandler = cloneRows(baseRows);
  fakeHandler[0] = Object.assign({}, fakeHandler[0], {
    slug: 'phase44.fake_handler_missing_registry',
    backing: 'handler',
    readiness: 'discovery-pending',
    resolvedTier: 'T3',
    proof: 'none',
    hasHandlerProof: false,
    hasRecipeProof: false,
  });
  const fakeHandlerFailures = mod.validateReadinessRows(fakeHandler, { expectedDescriptorCount: fakeHandler.length }).failures;
  check(fakeHandlerFailures.some(function(f) { return f.indexOf('fake_handler_missing_registry') !== -1; }),
    'synthetic handler-backed row with no T1a resolver proof fails');

  const guardedReady = cloneRows(baseRows);
  const guardedIndex = guardedReady.findIndex(function(row) { return row.slug === 'github.issues.create'; });
  if (guardedIndex !== -1) {
    guardedReady[guardedIndex] = Object.assign({}, guardedReady[guardedIndex], {
      readiness: 't1-ready',
      hasHandlerProof: true,
      resolvedTier: 'T1a',
    });
  }
  const guardedFailures = mod.validateReadinessRows(guardedReady, { expectedDescriptorCount: guardedReady.length }).failures;
  check(guardedFailures.some(function(f) { return f.indexOf('github.issues.create') !== -1; }),
    'guarded write mislabeled t1-ready fails');

  const duplicateRows = cloneRows(baseRows);
  duplicateRows.push(Object.assign({}, duplicateRows[0]));
  const duplicateFailures = mod.validateReadinessRows(duplicateRows, { expectedDescriptorCount: duplicateRows.length }).failures;
  check(duplicateFailures.some(function(f) { return f.indexOf('duplicate slug') !== -1; }),
    'duplicate slug rows fail');

  console.log('\nt1-readiness-gate: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: t1-readiness-gate threw:', err && err.message ? err.message : err);
  process.exit(1);
});
