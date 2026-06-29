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

  const current = gate.validateCurrentPatternDGate(catalog);
  check(current.failures.length === 0,
    'current catalog keeps Pattern-D/GAPI candidates disabled' +
    (current.failures.length ? ': ' + current.failures.join(' | ') : ''));
  check(current.counts.patternD > 0 && current.counts.gapi > 0,
    'gate is non-vacuous: Pattern-D and GAPI candidate rows both exist');

  const patternDecision = gate.bridgeDecisionFor({ routeFeasibility: 'pattern-d-candidate' });
  check(patternDecision.executionEnabled === false &&
    patternDecision.status === 'rejected-pending-explicit-bridge',
    'Pattern-D decision explicitly keeps execution disabled');
  const gapiDecision = gate.bridgeDecisionFor({ routeFeasibility: 'gapi-bridge-candidate' });
  check(gapiDecision.executionEnabled === false &&
    gapiDecision.status === 'rejected-pending-gapi-consent-bridge',
    'GAPI decision explicitly keeps execution disabled');

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
