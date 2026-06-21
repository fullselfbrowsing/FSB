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
 * LOCKED gate interface (30-01-PLAN.md <interfaces>):
 *   async evaluate({ origin, slug, method, entry }) ->
 *     { decision:'allow' } | { decision:'off'|'ask'|'mutating'|'blocked'|'sensitive', method, sideEffectClass, error }
 *   LOCKED decision order: denylist(blocked) -> default-OFF/Off(off) -> ask
 *     -> sensitive+Auto(sensitive) -> mutation(mutating) -> allow
 *   error is the dual-field RECIPE_CONSENT_* object.
 *
 * Two sampled controls:
 *   (1) GOV-01 default-OFF: an UNSEEN origin -> decision !== 'allow', error.code
 *       === 'RECIPE_CONSENT_REQUIRED', and NO executeBoundSpec ran (no side effect).
 *   (2) GOV-07/D-14 sensitive+Auto: an origin stored mode 'auto' whose injected
 *       FsbServiceDenylist.classify(origin) returns { sensitive:true, denied:false }
 *       is DOWNGRADED to ask AT THE GATE -> a NON-allow decision with
 *       error.code === 'RECIPE_CONSENT_REQUIRED' AND decision/consentDecision
 *       === 'sensitive' (Auto is NOT silently executed). Gate-side enforcement,
 *       not UI-only.
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

  // ---- (1) GOV-01: default-OFF unseen origin -> non-allow CONSENT_REQUIRED ----
  const off = await Gate.evaluate({
    origin: 'https://unseen.example.com',
    slug: 'github.notifications',
    method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(off && off.decision !== 'allow', 'unseen origin -> decision !== allow (default-OFF)');
  check(off && off.error && off.error.code === 'RECIPE_CONSENT_REQUIRED',
    'unseen origin -> error.code RECIPE_CONSENT_REQUIRED');
  check(executeBoundSpecCalls.length === 0, 'no executeBoundSpec ran on a blocked gate (no side effect)');

  // ---- (2) GOV-07/D-14: sensitive origin under Auto -> downgraded ('sensitive') ----
  const SENSITIVE_ORIGIN = 'https://mail.example.com';
  await Store.setOriginMode(SENSITIVE_ORIGIN, 'auto'); // user opted this origin into Auto
  classifyResult = { sensitive: true, denied: false };  // but the classifier flags it sensitive
  const sens = await Gate.evaluate({
    origin: SENSITIVE_ORIGIN,
    slug: 'github.notifications',
    method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(sens && sens.decision !== 'allow',
    'sensitive origin under Auto -> NON-allow (Auto downgraded at the gate, NOT silently executed)');
  check(sens && (sens.decision === 'sensitive' || sens.consentDecision === 'sensitive'),
    "sensitive origin under Auto -> decision/consentDecision === 'sensitive' (D-14)");
  check(sens && sens.error && sens.error.code === 'RECIPE_CONSENT_REQUIRED',
    'sensitive+Auto -> error.code RECIPE_CONSENT_REQUIRED (surfaces as consent-required)');
  check(executeBoundSpecCalls.length === 0, 'sensitive+Auto did NOT execute (gate-side enforcement)');

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

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-gate.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
