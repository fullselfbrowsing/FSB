'use strict';

/**
 * Phase 45 / Plan 01 -- reusable T1 port contract unit tests.
 *
 * Run: node tests/t1-port-contract.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'scripts', 'lib', 't1-port-contract.mjs');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function baseProofs() {
  return {
    originPin: true,
    executeBoundSpecOnly: true,
    loggedOutGuard: true,
    expectedShapeGuard: true,
    noSecretLogging: true,
    consentCompatibility: true,
    routerParity: true,
    fallbackByteStable: true,
    noPerAppMcpTool: true,
    noOpenTabsRuntime: true,
  };
}

(async function run() {
  console.log('--- Phase 45: T1 port contract library ---');

  const mod = await import(pathToFileURL(CONTRACT_PATH).href);
  check(typeof mod.validatePortContract === 'function', 'validatePortContract() is exported');
  check(typeof mod.validateHandlerSource === 'function', 'validateHandlerSource() is exported');
  check(typeof mod.renderT1PortChecklist === 'function', 'renderT1PortChecklist() is exported');

  const readContract = {
    slug: 'phase45.read',
    portType: mod.PORT_TYPES.SAME_ORIGIN_READ,
    sideEffectClass: 'read',
    origin: 'https://example.com',
    execution: { kind: mod.EXECUTION_KINDS.HANDLER, enabled: true },
    proofs: baseProofs(),
    fallback: { code: mod.FALLBACK_CODE, dualField: true },
  };
  check(mod.validatePortContract(readContract).failures.length === 0,
    'complete same-origin read contract passes');

  const missingBound = JSON.parse(JSON.stringify(readContract));
  missingBound.slug = 'phase45.missing_bound';
  missingBound.proofs.executeBoundSpecOnly = false;
  const missingBoundFailures = mod.validatePortContract(missingBound).failures;
  check(missingBoundFailures.some(function(f) { return f.indexOf('executeBoundSpecOnly') !== -1; }),
    'missing executeBoundSpec-only proof fails');

  const activeWrite = {
    slug: 'phase45.active_write',
    portType: mod.PORT_TYPES.SAME_ORIGIN_WRITE,
    sideEffectClass: 'write',
    origin: 'https://example.com',
    execution: { kind: mod.EXECUTION_KINDS.HANDLER, enabled: true },
    proofs: baseProofs(),
    fallback: { code: mod.FALLBACK_CODE, dualField: true },
    writeActivation: { status: 'active' },
  };
  const activeWriteFailures = mod.validatePortContract(activeWrite).failures;
  check(activeWriteFailures.some(function(f) { return f.indexOf('liveMutationUat') !== -1; }),
    'active write without live UAT evidence fails');

  const guardedWrite = {
    slug: 'phase45.guarded_write',
    portType: mod.PORT_TYPES.GUARDED_WRITE,
    sideEffectClass: 'write',
    origin: 'https://example.com',
    execution: { kind: mod.EXECUTION_KINDS.HANDLER, enabled: true },
    proofs: Object.assign(baseProofs(), { guardedWriteFailClosed: true }),
    fallback: { code: mod.FALLBACK_CODE, dualField: true },
    writeActivation: { status: 'guarded-fail-closed' },
  };
  check(mod.validatePortContract(guardedWrite).failures.length === 0,
    'guarded write with byte-stable fail-closed proof passes');

  const separateCandidate = {
    slug: 'phase45.pattern_d_candidate',
    portType: mod.PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE,
    sideEffectClass: 'read',
    execution: { kind: mod.EXECUTION_KINDS.CANDIDATE, enabled: true },
    proofs: Object.assign(baseProofs(), { negativeControlFailClosed: true }),
    fallback: { code: mod.FALLBACK_CODE, dualField: true },
    patternDDecision: 'candidate until Pattern-D approved',
  };
  const candidateFailures = mod.validatePortContract(separateCandidate).failures;
  check(candidateFailures.some(function(f) { return f.indexOf('execution.enabled === false') !== -1; }),
    'executable separate-origin candidate fails');

  const disabledCandidate = JSON.parse(JSON.stringify(separateCandidate));
  disabledCandidate.execution.enabled = false;
  check(mod.validatePortContract(disabledCandidate).failures.length === 0,
    'disabled separate-origin candidate with negative-control proof passes without write activation UAT');

  const sourceFailures = mod.validateHandlerSource(
    'async function bad(){ chrome.scripting.executeScript({}); fetch("/api"); console.log(token); eval("1"); }',
    { slug: 'phase45.bad_source' }
  ).failures;
  check(sourceFailures.length >= 4,
    'handler source scan catches direct browser scripting, direct fetch, secret console logging, and eval');

  const checklist = mod.renderT1PortChecklist({
    slug: 'phase45.rendered',
    app: 'phase45',
    service: 'example.com',
    sideEffectClass: 'read',
    runtimeOrigin: 'https://example.com',
    routeFeasibility: 'same-origin-read-candidate',
    proof: 'handler',
  });
  check(checklist.indexOf('executeBoundSpec') !== -1 &&
      checklist.indexOf('Logged-out guard') !== -1 &&
      checklist.indexOf('Router parity') !== -1,
    'rendered checklist includes executeBoundSpec, logged-out guard, and router parity');

  console.log('\nt1-port-contract: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('  FAIL: t1-port-contract threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
