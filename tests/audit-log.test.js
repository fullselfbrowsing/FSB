'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-05) -- audit-log RED contract.
 *
 * Wave 0 RED test: extension/utils/audit-log.js does NOT exist yet (Plan 02
 * clones diagnostics-ring-buffer.js). Fails loudly today (require throws); turns
 * GREEN when Plan 02 ships the LOCKED FsbAuditLog surface. Never silently passes.
 *
 * LOCKED interface (30-01-PLAN.md <interfaces>):
 *   STORAGE_KEY = 'fsbAuditLog'   PAYLOAD_VERSION = 1   MAX_ENTRIES = 200
 *   append(entry) -> Promise<void>   // field-WHITELIST { ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error? }
 *   getEntries(opts) -> Promise<{ entries, clearedAt? }>   // opts.clear === true clears
 *   getDistinctOrigins() -> Promise<string[]>   // distinct origins (drives the consent opt-out list)
 *   _reset()
 *
 * GOV-05 sampled (clone of tests/diagnostics-ring-buffer.test.js):
 *   - a persisted record has EXACTLY the whitelisted keys (+ optional error),
 *     never args/body/headers,
 *   - the ring FIFO-trims at MAX_ENTRIES,
 *   - getEntries({clear:true}) empties the ring and returns clearedAt.
 *
 * Chrome stub: in-memory chrome.storage.local (the diagnostics-ring idiom).
 *
 * Run: node tests/audit-log.test.js
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

// The exact whitelist (D-10). The audit entry must carry these and ONLY these
// (error optional).
const REQUIRED_KEYS = ['ts', 'origin', 'slug', 'method', 'sideEffectClass', 'consentDecision', 'outcome'];
const OPTIONAL_KEYS = ['error'];

(async () => {
  console.log('--- GOV-05 audit-log entry schema + FIFO (RED until Plan 02) ---');
  installChromeStorageStub();

  const AUDIT_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'audit-log.js');
  const Audit = require(AUDIT_PATH);

  check(typeof Audit === 'object' && Audit, 'audit-log module loads (require)');
  check(Audit.STORAGE_KEY === 'fsbAuditLog', "STORAGE_KEY === 'fsbAuditLog'");
  check(Audit.PAYLOAD_VERSION === 1, 'PAYLOAD_VERSION === 1');
  check(Audit.MAX_ENTRIES === 200, 'MAX_ENTRIES === 200');
  check(typeof Audit.append === 'function', 'exports append');
  check(typeof Audit.getEntries === 'function', 'exports getEntries');
  check(typeof Audit.getDistinctOrigins === 'function', 'exports getDistinctOrigins');
  check(typeof Audit._reset === 'function', 'exports _reset (test hook)');

  if (typeof Audit._reset === 'function') Audit._reset();

  // ---- entry shape: EXACTLY the whitelisted keys (+ optional error) ----
  await Audit.append({
    ts: 1718000000000,
    origin: 'https://github.com',
    slug: 'github.notifications',
    method: 'GET',
    sideEffectClass: 'read',
    consentDecision: 'allow',
    // LO-01: use the writer's real outcome vocabulary ('ok'), not 'success'.
    outcome: 'ok',
    // non-whitelisted fields that MUST NOT survive:
    args: { token: 'secret-xoxc' },
    body: 'should-not-persist',
    headers: { authorization: 'Bearer leak' }
  });
  const r1 = await Audit.getEntries({});
  check(r1 && Array.isArray(r1.entries) && r1.entries.length === 1, 'append persists one entry');
  const e = r1.entries[0];
  for (const k of REQUIRED_KEYS) {
    check(Object.prototype.hasOwnProperty.call(e, k), "entry has whitelisted key '" + k + "'");
  }
  const extraKeys = Object.keys(e).filter((k) => REQUIRED_KEYS.indexOf(k) === -1 && OPTIONAL_KEYS.indexOf(k) === -1);
  check(extraKeys.length === 0, 'entry carries NO non-whitelisted key (got extras: ' + JSON.stringify(extraKeys) + ')');
  check(!('args' in e) && !('body' in e) && !('headers' in e),
    'args/body/headers are NOT persisted (field whitelist, D-10)');

  // ---- FIFO trim at MAX_ENTRIES ----
  if (typeof Audit._reset === 'function') Audit._reset();
  for (let i = 0; i < 205; i++) {
    await Audit.append({
      ts: i, origin: 'https://github.com', slug: 'slug-' + i, method: 'GET',
      sideEffectClass: 'read', consentDecision: 'allow', outcome: 'ok'
    });
  }
  const r2 = await Audit.getEntries({});
  check(r2.entries.length === 200, 'ring trims to MAX_ENTRIES (200) FIFO');
  check(r2.entries[0].slug === 'slug-5', 'first 5 entries dropped (FIFO; oldest first trimmed)');
  check(r2.entries[199].slug === 'slug-204', 'newest entry preserved');

  // ---- getEntries({clear:true}) empties + returns clearedAt ----
  const r3 = await Audit.getEntries({ clear: true });
  check(r3.entries.length === 200, 'clear returns the existing entries');
  check(typeof r3.clearedAt === 'number', 'clear returns a clearedAt timestamp');
  const r4 = await Audit.getEntries({});
  check(r4.entries.length === 0, 'after clear the ring is empty');

  // ---- getDistinctOrigins(): distinct, non-empty origins across outcomes ----
  // Drives the per-origin consent list -- a BLOCKED invoke still registers its
  // origin so the user can opt it out (the github.com-never-appears fix).
  if (typeof Audit._reset === 'function') Audit._reset();
  if (typeof Audit.getDistinctOrigins === 'function') {
    await Audit.append({ ts: 1, origin: 'https://github.com', slug: 'a', method: 'GET', sideEffectClass: 'read', consentDecision: 'allow', outcome: 'ok' });
    await Audit.append({ ts: 2, origin: 'https://github.com', slug: 'b', method: 'POST', sideEffectClass: 'mutate', consentDecision: 'off', outcome: 'blocked', error: 'RECIPE_CONSENT_REQUIRED' });
    await Audit.append({ ts: 3, origin: 'https://slack.com', slug: 'c', method: 'GET', sideEffectClass: 'read', consentDecision: 'allow', outcome: 'ok' });
    const origins = await Audit.getDistinctOrigins();
    check(Array.isArray(origins), 'getDistinctOrigins returns an array');
    check(origins.length === 2, 'getDistinctOrigins de-duplicates (2 distinct origins from 3 entries)');
    check(origins.indexOf('https://github.com') !== -1, 'a BLOCKED-outcome origin (github.com) is included (opt-out visibility)');
    check(origins.indexOf('https://slack.com') !== -1, 'a second distinct origin (slack.com) is included');
  }

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('audit-log.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
