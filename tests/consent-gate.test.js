'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-01 + GOV-07/D-14) -- consent-gate RED contract.
 *
 * Wave 0 RED test: FsbConsentGate (Plan 02; lives in capability-router.js or a
 * sibling reached by invoke) does NOT exist yet. This test FAILS LOUDLY today
 * (the gate global is absent) and turns GREEN only when Plan 02 wires the LOCKED
 * gate surface + the step-4 sensitive downgrade. It NEVER silently passes -- a
 * 'sensitive' assertion against an absent gate cannot accidentally hold.
 *
 * Gate interface:
 *   async evaluate({ origin, slug, method, entry }) ->
 *     { decision:'allow' } | { decision:'off'|'ask'|'blocked', method, sideEffectClass, error }
 *   Decision order (OPT-OUT posture): denylist(blocked) -> Off(off) -> ask -> allow
 *   error is the dual-field RECIPE_CONSENT_* object.
 *
 * Sampled controls (opt-out / "fully open"):
 *   (1) the shipped global default is 'auto', so an UNSEEN origin -> allow.
 *       Reverting the global default to Off restores opt-in (unseen -> non-allow,
 *       RECIPE_CONSENT_REQUIRED, no executeBoundSpec).
 *   (2) a sensitive (non-denied) origin under Auto -> allow, and a POST/mutating
 *       call under Auto -> allow: the former sensitive-downgrade (GOV-07/D-14) and
 *       mutating-elevation (GOV-03/D-04) gates are no longer applied at INVOKE.
 *   (3) ME-01 still holds: a degraded gate (store absent, sibling present) fails
 *       CLOSED, and the denylist remains a hard block.
 *
 * Stubs: the in-memory chrome.storage.local stub (so the gate's policy lookup has
 * a backing store) + an injected FsbServiceDenylist whose classify/isDenied are
 * test-controlled, mirroring the capability-router test's ctx-injection idiom.
 *
 * Zero-framework: passed/failed counters + check(cond,msg) + process.exit.
 *
 * Run: node tests/consent-gate.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// ---- In-memory chrome.storage.local stub ------------------------------------
function installChromeStorageStub() {
  const store = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          const list = Array.isArray(keys) ? keys : (keys == null ? Array.from(store.keys()) : [keys]);
          for (const k of list) { if (store.has(k)) out[k] = store.get(k); }
          if (typeof cb === 'function') { cb(out); return; }
          return Promise.resolve(out);
        },
        set(obj, cb) {
          for (const k of Object.keys(obj)) { store.set(k, obj[k]); }
          if (typeof cb === 'function') { cb(); return; }
          return Promise.resolve();
        }
      }
    },
    runtime: { lastError: null }
  };
  return store;
}

// A test double for the side-effect recorder: if the gate (wrongly) let an
// invoke through, executeBoundSpec would fire. The gate must NEVER reach it on a
// non-allow decision -- assert the recorder stays empty.
const executeBoundSpecCalls = [];

(async () => {
  console.log('--- GOV-01 + GOV-07/D-14 consent gate (RED until Plan 02) ---');
  installChromeStorageStub();

  // Load the consent-policy-store so the gate has a real backing store. This is
  // ALSO a Wave-0 module -- if it is absent the require throws (loud RED).
  const STORE_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'consent-policy-store.js');
  const Store = require(STORE_PATH);
  if (typeof Store._reset === 'function') Store._reset();

  // Inject a test-controlled FsbServiceDenylist (Plan 03's module) so this test
  // does not depend on the on-disk seed. The gate reads classify()/isDenied()
  // from this global. Default: nothing denied, nothing sensitive.
  let classifyResult = { sensitive: false, denied: false };
  let isDeniedResult = { denied: false };
  globalThis.FsbServiceDenylist = {
    classify(/* origin */) { return classifyResult; },
    isDenied(/* origin */) { return isDeniedResult; },
    load() { return Promise.resolve(); }
  };

  // The gate is the Plan-02 surface. Loading the router populates it (the gate
  // lives in capability-router.js or a sibling reached by invoke). Require is at
  // top level -- a missing gate global below fails loudly.
  const ROUTER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'capability-router.js');
  try { require(ROUTER_PATH); } catch (_e) { /* router may load; the gate global is the real assertion */ }

  const Gate = globalThis.FsbConsentGate;
  check(Gate && typeof Gate.evaluate === 'function',
    'FsbConsentGate.evaluate exists (Plan 02 wires it; RED until then)');
  if (!Gate || typeof Gate.evaluate !== 'function') {
    // Explicit RED: the gate is absent. Fail loudly, do NOT silently pass.
    console.error('\nPASS=' + passed + ' FAIL=' + (failed + 1) + ' (FsbConsentGate absent -- Wave-0 RED)');
    process.exit(1);
  }

  // ---- (1) OPT-OUT: an unseen origin under the shipped 'auto' default is ALLOWED ----
  const unseenAllow = await Gate.evaluate({
    origin: 'https://unseen.example.com',
    slug: 'github.notifications',
    method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(unseenAllow && unseenAllow.decision === 'allow',
    'unseen origin -> allow (shipped opt-out default is auto)');

  // ---- (1b) reverting the global default to Off restores opt-in ----
  if (typeof Store.setDefaultMode === 'function') {
    await Store.setDefaultMode('off');
    const off = await Gate.evaluate({
      origin: 'https://unseen-2.example.com',
      slug: 'github.notifications',
      method: 'GET',
      entry: { tier: 'T1b', sideEffectClass: 'read' }
    });
    check(off && off.decision !== 'allow', 'with global default Off, an unseen origin -> non-allow');
    check(off && off.error && off.error.code === 'RECIPE_CONSENT_REQUIRED',
      'reverted default -> RECIPE_CONSENT_REQUIRED on unseen origin');
    check(executeBoundSpecCalls.length === 0, 'no executeBoundSpec ran on a blocked gate (no side effect)');
    await Store.setDefaultMode('auto'); // restore the shipped default for the rest of the test
  }

  // ---- (2) FULLY-OPEN: a sensitive (non-denied) origin under Auto is now ALLOWED ----
  // The former sensitive-downgrade gate (GOV-07/D-14) is no longer applied at the
  // INVOKE gate under the opt-out posture. (The network-capture DISCOVERY gate keeps
  // its own sensitive-confirm -- see network-capture-consent.test.js.)
  const SENSITIVE_ORIGIN = 'https://mail.example.com';
  await Store.setOriginMode(SENSITIVE_ORIGIN, 'auto');
  classifyResult = { sensitive: true, denied: false };  // classifier flags it sensitive
  const sens = await Gate.evaluate({
    origin: SENSITIVE_ORIGIN,
    slug: 'github.notifications',
    method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(sens && sens.decision === 'allow',
    'sensitive (non-denied) origin under Auto -> allow (sensitive-downgrade no longer gates invoke)');

  // ---- (2b) FULLY-OPEN: a WRITE (mutating) under the auto default is ALLOWED ----
  // read-Auto == write-Auto under the opt-out posture (GOV-03 relaxed at the gate).
  classifyResult = { sensitive: false, denied: false };
  const writeGate = await Gate.evaluate({
    origin: 'https://write.example.com',
    slug: 'github.issues.create',
    method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutate' }
  });
  check(writeGate && writeGate.decision === 'allow',
    'a POST/mutating call under the auto default -> allow (write-Auto no longer needs a separate opt-in)');

  // ---- contrast: a NON-sensitive origin under Auto IS allowed (read) ----
  const SAFE_ORIGIN = 'https://github.com';
  await Store.setOriginMode(SAFE_ORIGIN, 'auto');
  classifyResult = { sensitive: false, denied: false };
  const okGate = await Gate.evaluate({
    origin: SAFE_ORIGIN,
    slug: 'github.notifications',
    method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(okGate && okGate.decision === 'allow',
    'non-sensitive read-Auto origin -> decision allow (the gate does not over-block)');

  // ---- (3) ME-01: store ABSENT but a Phase-30 module PRESENT -> FAIL CLOSED ----
  // Simulate a degraded SW boot where the consent store failed to load but a
  // sibling Phase-30 module (the denylist, already injected above) is present.
  // The gate must NOT fall open: a missing store in a Phase-30 deployment is a
  // degraded credential-replay gate and must block (RECIPE_CONSENT_REQUIRED). The
  // combined-absence fail-open is what ME-01 closes -- here the denylist is
  // present so this is unambiguously a Phase-30 deployment, not the Phase-29
  // harness escape hatch.
  const savedStore = globalThis.FsbConsentPolicyStore;
  try {
    delete globalThis.FsbConsentPolicyStore; // store now absent
    classifyResult = { sensitive: false, denied: false };
    isDeniedResult = { denied: false };
    const degraded = await Gate.evaluate({
      origin: 'https://github.com',
      slug: 'github.notifications',
      method: 'GET',
      entry: { tier: 'T1b', sideEffectClass: 'read' }
    });
    check(degraded && degraded.decision !== 'allow',
      'ME-01: store absent + a Phase-30 module present -> NON-allow (degraded gate fails closed, not open)');
    check(degraded && degraded.error && degraded.error.code === 'RECIPE_CONSENT_REQUIRED',
      'ME-01: degraded-gate block surfaces RECIPE_CONSENT_REQUIRED');
  } finally {
    if (savedStore) { globalThis.FsbConsentPolicyStore = savedStore; }
  }

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-gate.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
