'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-02) -- consent-policy-store RED contract.
 *
 * Wave 0 RED test: the module extension/utils/consent-policy-store.js does NOT
 * exist yet (Plan 02 creates it). This test FAILS LOUDLY today -- the require()
 * at load throws MODULE_NOT_FOUND -- and turns GREEN only when Plan 02 ships the
 * LOCKED FsbConsentPolicyStore surface. It NEVER silently passes (no try/catch
 * swallow around the require; an absent module exits non-zero).
 *
 * Asserts the LOCKED interface (from 30-01-PLAN.md <interfaces>):
 *   STORAGE_KEY = 'fsbConsentPolicies'   PAYLOAD_VERSION = 1
 *   envelope: { v:1, defaultMode:'off', policies: { [origin]: { mode, mutating } } }
 *   getConsentForOrigin(envelope, origin) -> { mode, mutating }  (DEFAULT mode 'off', mutating false)
 *   readPolicies() -> Promise<envelope>   (chrome.storage.local; null-safe)
 *   setOriginMode(origin, mode) -> Promise<void>
 *   setOriginMutating(origin, allowed) -> Promise<void>
 *   _reset() test hook
 *
 * Behavior sampled (GOV-02): default-OFF on an empty envelope; Off/Ask/Auto
 * round-trip through setOriginMode + readPolicies; Auto is per-origin (NO global
 * enable key in the envelope).
 *
 * Chrome stub: in-memory chrome.storage.local, cloned from
 * tests/diagnostics-ring-buffer.test.js's storage idiom (a Map-backed get/set).
 *
 * Zero-framework: passed/failed counters + synchronous check(cond,msg) +
 * process.exit(failed>0?1:0).
 *
 * Run: node tests/consent-policy-store.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// ---- In-memory chrome.storage.local stub (diagnostics-ring idiom) -----------
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
        },
        remove(key, cb) {
          const list = Array.isArray(key) ? key : [key];
          for (const k of list) { store.delete(k); }
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
  console.log('--- GOV-02 consent-policy-store (RED until Plan 02) ---');
  installChromeStorageStub();

  // require AT TOP LEVEL of the IIFE -- a MISSING module throws here and the
  // process exits non-zero (the intended Wave-0 RED). NOT wrapped in try/catch.
  const STORE_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'consent-policy-store.js');
  const Store = require(STORE_PATH);

  check(typeof Store === 'object' && Store, 'consent-policy-store module loads (require)');
  check(Store.STORAGE_KEY === 'fsbConsentPolicies', "STORAGE_KEY === 'fsbConsentPolicies'");
  check(Store.PAYLOAD_VERSION === 1, 'PAYLOAD_VERSION === 1');
  check(typeof Store.getConsentForOrigin === 'function', 'exports getConsentForOrigin');
  check(typeof Store.readPolicies === 'function', 'exports readPolicies');
  check(typeof Store.setOriginMode === 'function', 'exports setOriginMode');
  check(typeof Store.setOriginMutating === 'function', 'exports setOriginMutating');
  check(typeof Store._reset === 'function', 'exports _reset (test hook)');

  if (typeof Store._reset === 'function') Store._reset();

  // ---- default-OFF on an empty envelope (GOV-01/GOV-02) ----
  const empty = { v: 1, defaultMode: 'off', policies: {} };
  const d = Store.getConsentForOrigin(empty, 'https://github.com');
  check(d && d.mode === 'off', "getConsentForOrigin(empty) -> mode 'off' (default-OFF)");
  check(d && d.mutating === false, 'getConsentForOrigin(empty) -> mutating false');

  // ---- an unseen origin on a freshly read store is OFF ----
  const env0 = await Store.readPolicies();
  check(env0 && env0.v === 1, 'readPolicies() returns a versioned envelope (v:1)');
  check(env0 && env0.defaultMode === 'off', 'readPolicies() defaultMode is off');
  const unseen = Store.getConsentForOrigin(env0, 'https://unseen.example.com');
  check(unseen && unseen.mode === 'off', 'unseen origin is OFF after a fresh read');

  // ---- Off/Ask/Auto round-trip through setOriginMode + readPolicies ----
  const ORIGIN = 'https://github.com';
  for (const mode of ['ask', 'auto', 'off']) {
    await Store.setOriginMode(ORIGIN, mode);
    const env = await Store.readPolicies();
    const got = Store.getConsentForOrigin(env, ORIGIN);
    check(got && got.mode === mode, "setOriginMode('" + ORIGIN + "','" + mode + "') round-trips through readPolicies");
  }

  // ---- elevated mutating opt-in is a SEPARATE per-origin flag (GOV-03) ----
  await Store.setOriginMode(ORIGIN, 'auto');
  let env = await Store.readPolicies();
  check(Store.getConsentForOrigin(env, ORIGIN).mutating === false, 'read-Auto does NOT imply mutating (mutating false)');
  await Store.setOriginMutating(ORIGIN, true);
  env = await Store.readPolicies();
  check(Store.getConsentForOrigin(env, ORIGIN).mutating === true, 'setOriginMutating(origin,true) flips the elevated opt-in');

  // ---- Auto is per-origin, NEVER a global switch (GOV-02) ----
  // The persisted envelope must carry NO global enable key (e.g. enabled/global/
  // enableAll/autoAll); Auto lives strictly under policies[origin].mode.
  env = await Store.readPolicies();
  const FORBIDDEN_GLOBAL_KEYS = ['enabled', 'global', 'enableAll', 'autoAll', 'allOrigins'];
  for (const k of FORBIDDEN_GLOBAL_KEYS) {
    check(!Object.prototype.hasOwnProperty.call(env, k),
      "envelope has NO global enable key '" + k + "' (Auto is per-origin only)");
  }
  // a DIFFERENT origin is unaffected by github.com being Auto (no global bleed)
  check(Store.getConsentForOrigin(env, 'https://other.example.com').mode === 'off',
    'a different origin stays OFF while github.com is Auto (per-origin isolation)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  // A MISSING module (Wave-0 RED) lands here -> non-zero exit, loud failure.
  console.error('consent-policy-store.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
