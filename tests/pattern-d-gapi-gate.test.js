'use strict';

/**
 * Phase 47 -- Pattern-D / GAPI bridge gate controls.
 *
 * Run: node tests/pattern-d-gapi-gate.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const GATE_PATH = path.join(REPO_ROOT, 'scripts', 'verify-pattern-d-gapi-gate.mjs');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

(async function run() {
  console.log('--- Phase 47: Pattern-D / GAPI bridge gate controls ---');

  const gate = await import(pathToFileURL(GATE_PATH).href);
  const catalog = require(CATALOG_PATH);

  check(typeof gate.validateCurrentPatternDGate === 'function',
    'validateCurrentPatternDGate() is exported');
  check(typeof gate.validateBridgeRows === 'function',
    'validateBridgeRows() is exported');
  check(typeof gate.validateSeparateOriginNegativeControls === 'function',
    'validateSeparateOriginNegativeControls() is exported');
  check(typeof gate.isApprovedGapiBridgeRow === 'function',
    'isApprovedGapiBridgeRow() is exported for the approved Google Analytics bridge contract');

  const current = gate.validateCurrentPatternDGate(catalog);
  check(current.failures.length === 0,
    'current catalog keeps Pattern-D/GAPI candidates disabled' +
    (current.failures.length ? ': ' + current.failures.join(' | ') : ''));
  check(current.counts.patternD > 0 && (current.counts.gapi > 0 || current.counts.approvedGapi > 0),
    'gate is non-vacuous: Pattern-D rows exist and GAPI is represented by pending candidates or approved bridge rows');
  check(current.counts.gapi === 0 && current.counts.approvedGapi === 8,
    'Google Analytics is represented as 8 approved read-only GAPI bridge rows, not pending GAPI candidates');

  const ganalyticsRows = current.report.rows.filter(function(row) { return row && row.app === 'ganalytics'; });
  check(ganalyticsRows.length === 8 && ganalyticsRows.every(gate.isApprovedGapiBridgeRow),
    'all Google Analytics rows match the approved read-only T1a handler-backed GAPI bridge contract');

  const supabaseRows = current.report.rows.filter(function(row) { return row && row.app === 'supabase'; });
  const supabaseReadyRows = supabaseRows.filter(function(row) { return row.readiness === 't1-ready'; });
  const supabaseGuardedRows = supabaseRows.filter(function(row) { return row.readiness === 't1-guarded-fail-closed'; });
  check(supabaseRows.length === 26 &&
      supabaseReadyRows.length === 19 &&
      supabaseGuardedRows.length === 7 &&
      supabaseRows.every(function(row) {
        return row.routeFeasibility === 'same-origin-proven' &&
          row.resolvedTier === 'T1a' &&
          row.proof === 'handler' &&
          row.hasHandlerProof === true &&
          row.hasRecipeProof === false;
      }),
    'Supabase rows are approved T1a page-read/guarded handlers, not pending Pattern-D candidates');

  const patternDecision = gate.bridgeDecisionFor({ routeFeasibility: 'pattern-d-candidate' });
  check(patternDecision.executionEnabled === false &&
    patternDecision.status === 'rejected-pending-explicit-bridge',
    'Pattern-D decision explicitly keeps execution disabled');
  const gapiDecision = gate.bridgeDecisionFor({ routeFeasibility: 'gapi-bridge-candidate' });
  check(gapiDecision.executionEnabled === false &&
    gapiDecision.status === 'rejected-pending-gapi-consent-bridge',
    'unapproved pending GAPI decision explicitly keeps execution disabled');

  const fakeReady = gate.validateBridgeRows([{
    slug: 'linear.synthetic_ready',
    routeFeasibility: 'pattern-d-candidate',
    readiness: 't1-ready',
    resolvedTier: 'T1a',
    hasHandlerProof: true,
    hasRecipeProof: false,
    proof: 'handler',
  }]);
  check(fakeReady.failures.some(function(f) { return f.indexOf('linear.synthetic_ready') !== -1; }),
    'synthetic Pattern-D t1-ready row fails');

  const fakeGapi = gate.validateBridgeRows([{
    slug: 'gmail.synthetic_recipe',
    routeFeasibility: 'gapi-bridge-candidate',
    readiness: 'discovery-pending',
    resolvedTier: 'T1b',
    hasHandlerProof: false,
    hasRecipeProof: true,
    proof: 'recipe',
  }]);
  check(fakeGapi.failures.some(function(f) { return f.indexOf('gmail.synthetic_recipe') !== -1; }),
    'synthetic GAPI recipe-backed row fails before bridge approval');

  const malformedApproved = gate.validateApprovedGapiBridgeRows([{
    slug: 'ganalytics.synthetic_write',
    app: 'ganalytics',
    service: 'analytics.google.com',
    sideEffectClass: 'write',
    readiness: 't1-ready',
    resolvedTier: 'T1a',
    routeFeasibility: 'same-origin-proven',
    proof: 'handler',
    hasHandlerProof: true,
    hasRecipeProof: false,
  }]);
  check(malformedApproved.failures.some(function(f) { return f.indexOf('ganalytics.synthetic_write') !== -1; }),
    'malformed Google Analytics approved-bridge row fails unless it is read-only and handler-backed');

  const negative = gate.validateSeparateOriginNegativeControls();
  check(negative.failures.length === 0,
    'separate-origin negative controls classify fail-closed' +
    (negative.failures.length ? ': ' + negative.failures.join(' | ') : ''));

  console.log('\npattern-d-gapi-gate: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: pattern-d-gapi-gate threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
