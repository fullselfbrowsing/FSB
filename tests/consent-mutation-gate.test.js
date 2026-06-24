'use strict';

/**
 * Phase 30 plan 01 (GOV-03, relaxed) -- mutation-gate under the OPT-OUT posture.
 *
 * Under the "fully open" (opt-out) default, read-Auto == write-Auto: the former
 * mutating-elevation gate (GOV-03/D-04) is NO LONGER applied at the invoke gate.
 * On an origin under mode 'auto' (or the global 'auto' default):
 *   - a GET slug is allowed,
 *   - a POST/PUT/PATCH/DELETE slug is ALSO allowed (no separate opt-in),
 *   - the per-origin `mutating` flag is retained in storage but inert at the gate,
 *   - but an explicitly Off origin still blocks (the per-origin opt-out path).
 * The denylist remains the one hard block.
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
  console.log('--- GOV-03 (relaxed): read-Auto == write-Auto under opt-out ---');
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

  // ---- a POST on Auto is now ALLOWED (write-Auto == read-Auto under opt-out) ----
  const postGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(postGate && postGate.decision === 'allow',
    'POST on Auto origin -> allow (mutating-elevation no longer gates invoke)');

  // ---- a T1a 'write' descriptor on Auto is also ALLOWED now ----
  const writeDescriptorGate = await Gate.evaluate({
    origin: ORIGIN, slug: 'slack.chat.postMessage',
    entry: { tier: 'T1a', descriptor: { sideEffectClass: 'write' } }
  });
  check(writeDescriptorGate && writeDescriptorGate.decision === 'allow',
    "T1a 'write' descriptor on Auto origin -> allow (write no longer requires elevation)");

  // ---- the per-origin mutating flag is now inert: setting it does not change the
  //      decision (the POST was already allowed) ----
  await Store.setOriginMutating(ORIGIN, true);
  const postGate2 = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(postGate2 && postGate2.decision === 'allow',
    'POST stays allowed regardless of the (now-inert) per-origin mutating flag');

  // ---- every MUTATING_METHODS verb is ALLOWED under Auto (opt-out) ----
  await Store.setOriginMutating(ORIGIN, false); // even with the flag false
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const g = await Gate.evaluate({
      origin: ORIGIN, slug: 'github.issues.mutate', method: m,
      entry: { tier: 'T1a', sideEffectClass: 'mutating' }
    });
    check(g && g.decision === 'allow',
      m + ' on Auto origin -> allow (writes no longer gated under the opt-out default)');
  }

  // ---- but an explicitly Off origin still blocks writes (the opt-out path) ----
  await Store.setOriginMode(ORIGIN, 'off');
  const offPost = await Gate.evaluate({
    origin: ORIGIN, slug: 'github.issues.create', method: 'POST',
    entry: { tier: 'T1a', sideEffectClass: 'mutating' }
  });
  check(offPost && offPost.decision !== 'allow' && offPost.error && offPost.error.code === 'RECIPE_CONSENT_REQUIRED',
    'an explicitly Off origin still blocks writes (per-origin opt-out)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('consent-mutation-gate.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
