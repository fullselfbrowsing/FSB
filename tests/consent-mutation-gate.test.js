'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-03) -- mutation-gate RED contract.
 *
 * Wave 0 RED test: FsbConsentGate (Plan 02) does NOT exist yet. Turns GREEN when
 * Plan 02 wires the mutation step (step 5 of the LOCKED decision order). Fails
 * loudly today; never silently passes.
 *
 * GOV-03 / D-04: read-Auto does NOT imply write-Auto. The side-effect class is
 * derived from MUTATING_METHODS ({POST,PUT,PATCH,DELETE}, capability-fetch.js:228)
 * + recipe/handler sideEffectClass. On an origin set to read-Auto (mode 'auto',
 * mutating false):
 *   - a GET slug is allowed,
 *   - a POST slug yields decision !== 'allow' with error.code
 *     'RECIPE_CONSENT_MUTATING_REQUIRED',
 *   - after setOriginMutating(origin, true) the SAME POST is allowed.
 *
 * Stubs: in-memory chrome.storage.local + injected non-sensitive FsbServiceDenylist.
 *
 * Zero-framework: passed/failed counters + check(cond,msg) + process.exit.
 *
 * Run: node tests/consent-mutation-gate.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

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

(async () => {
  console.log('--- GOV-03 mutation gate: read-Auto != write-Auto (RED until Plan 02) ---');
  installChromeStorageStub();

  const STORE_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'consent-policy-store.js');
  const Store = require(STORE_PATH);
  if (typeof Store._reset === 'function') Store._reset();

  // Non-sensitive, non-denied origin so only the mutation step gates it.
  globalThis.FsbServiceDenylist = {
    classify() { return { sensitive: false, denied: false }; },
    isDenied() { return { denied: false }; },
    load() { return Promise.resolve(); }
  };

  const ROUTER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'capability-router.js');
  try { require(ROUTER_PATH); } catch (_e) { /* gate global is the real assertion */ }

  const Gate = globalThis.FsbConsentGate;
  check(Gate && typeof Gate.evaluate === 'function',
    'FsbConsentGate.evaluate exists (Plan 02 wires the mutation step; RED until then)');
  if (!Gate || typeof Gate.evaluate !== 'function') {
    console.error('\nPASS=' + passed + ' FAIL=' + (failed + 1) + ' (FsbConsentGate absent -- Wave-0 RED)');
    process.exit(1);
  }

  const ORIGIN = 'https://github.com';
  await Store.setOriginMode(ORIGIN, 'auto'); // read-Auto, mutating still false

  // ---- a GET on read-Auto is allowed ----
  const getGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.notifications', method: 'GET',
    entry: { tier: 'T1b', sideEffectClass: 'read' }
  });
  check(getGate && getGate.decision === 'allow', 'GET on read-Auto origin -> allow');

  // ---- a POST on read-Auto is BLOCKED with the mutating-required code ----
  const postGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(postGate && postGate.decision !== 'allow', 'POST on read-Auto origin -> NOT allow (write != read)');
  check(postGate && postGate.error && postGate.error.code === 'RECIPE_CONSENT_MUTATING_REQUIRED',
    'POST on read-Auto -> error.code RECIPE_CONSENT_MUTATING_REQUIRED');
  check(postGate && (postGate.decision === 'mutating' || postGate.sideEffectClass === 'mutating'),
    "the blocked POST is classified mutating (decision 'mutating' / sideEffectClass 'mutating')");

  // ---- after the elevated opt-in, the SAME POST is allowed ----
  await Store.setOriginMutating(ORIGIN, true);
  const postGate2 = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(postGate2 && postGate2.decision === 'allow',
    'after setOriginMutating(origin,true) the same POST is allowed (elevated opt-in)');

  // ---- every MUTATING_METHODS verb is gated under read-Auto ----
  await Store.setOriginMutating(ORIGIN, false); // revoke the elevated opt-in
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const g = await Gate.evaluate({
      origin: ORIGIN, slug: 'github.issues.mutate', method: m,
      entry: { tier: 'T1a', sideEffectClass: 'mutating' }
    });
    check(g && g.decision !== 'allow' && g.error && g.error.code === 'RECIPE_CONSENT_MUTATING_REQUIRED',
      m + ' on read-Auto origin -> RECIPE_CONSENT_MUTATING_REQUIRED (MUTATING_METHODS coverage)');
  }

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-mutation-gate.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
