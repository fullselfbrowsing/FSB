'use strict';

/**
 * Phase 30 plan 01 (v0.9.99 -- GOV-06) -- audit-log no-secret SECURITY contract.
 *
 * Wave 0 RED test: extension/utils/audit-log.js does NOT exist yet (Plan 02).
 * Fails loudly today (require throws); turns GREEN when Plan 02 ships the
 * field-whitelist append + redactForLog pass-through. Never silently passes.
 *
 * GOV-06 / D-11: NO auth substring (cookie / token / csrf / xoxc / _gh_sess /
 * bearer / authorization) may survive in the persisted ring. The append() input
 * objects carry those substrings in NON-whitelisted fields (args/body/headers/
 * cookies); after append, NONE of the substrings may appear anywhere in
 * JSON.stringify(getEntries()). This is the security assertion -- a == 0
 * substring-count over the WHOLE serialized ring, not a per-field check that
 * could miss a leak.
 *
 * IMPORTANT (T-30-03): the secret substrings are seeded into NON-whitelisted
 * input fields only. The whitelisted fields (origin/slug/method/...) carry benign
 * values, so a passing test genuinely proves the whitelist+redaction dropped the
 * secrets -- it is not a trivially-green assertion over already-clean data.
 *
 * Chrome stub: in-memory chrome.storage.local.
 *
 * Run: node tests/audit-log-no-secret.test.js
 */

const path = require('path');

// Load the shape-only redactor onto globalThis so audit-log's _safeError routes
// a free-form error.message through it (HI-02: the message must be reduced to a
// content-free shape, not persisted verbatim).
require(path.resolve(__dirname, '..', 'extension', 'utils', 'redactForLog.js'));

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

// The forbidden auth substrings (D-11). Distinctive sentinel VALUES embedded in
// non-whitelisted fields so a leak is unambiguous.
const FORBIDDEN_SUBSTRINGS = [
  'cookie', 'token', 'csrf', 'xoxc', '_gh_sess', 'bearer', 'authorization',
  // distinctive sentinel values:
  'xoxc-12345-secret', 'gho_LEAKEDTOKEN', 'SESSIONCOOKIEVALUE', 'CSRFTOKEN9999', 'Bearer abc.def.ghi',
  // HI-02 sentinel: a secret embedded INSIDE error.message (the gap the prior
  // test missed -- it seeded secrets only in error SIBLING fields).
  'access_token=SECRETLEAK123', 'SECRETLEAK123'
];

(async () => {
  console.log('--- GOV-06 audit-log no-secret (RED until Plan 02) ---');
  installChromeStorageStub();

  const AUDIT_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'audit-log.js');
  const Audit = require(AUDIT_PATH);
  check(typeof Audit.append === 'function', 'audit-log exports append (RED until Plan 02)');
  if (typeof Audit._reset === 'function') Audit._reset();

  // Append several entries whose NON-whitelisted fields are saturated with secrets.
  // The whitelisted fields stay benign.
  await Audit.append({
    ts: 1, origin: 'https://github.com', slug: 'github.notifications', method: 'GET',
    sideEffectClass: 'read', consentDecision: 'allow', outcome: 'success',
    args: { authenticity_token: 'CSRFTOKEN9999', cookie: 'SESSIONCOOKIEVALUE' },
    headers: { authorization: 'Bearer abc.def.ghi', 'x-csrf-token': 'CSRFTOKEN9999' },
    body: 'token=gho_LEAKEDTOKEN&xoxc=xoxc-12345-secret',
    cookies: '_gh_sess=SESSIONCOOKIEVALUE'
  });
  await Audit.append({
    ts: 2, origin: 'https://app.slack.com', slug: 'slack.send', method: 'POST',
    sideEffectClass: 'mutating', consentDecision: 'allow', outcome: 'success',
    error: { name: 'Error', message: 'failed', token: 'xoxc-12345-secret', bearer: 'Bearer abc.def.ghi' }
  });
  // HI-02: a secret embedded directly IN error.message must NOT survive verbatim.
  // _safeError reduces the free-form message to a content-free shape (keeping only
  // the benign error NAME), so the sentinel cannot leak through the message path.
  await Audit.append({
    ts: 3, origin: 'https://api.x.com', slug: 'x.fetch', method: 'GET',
    sideEffectClass: 'read', consentDecision: 'allow', outcome: 'error',
    error: { name: 'FetchError', message: 'failed to fetch https://api.x.com/u?access_token=SECRETLEAK123' }
  });

  const r = await Audit.getEntries({});
  const serialized = JSON.stringify(r.entries);

  for (const sub of FORBIDDEN_SUBSTRINGS) {
    const idx = serialized.toLowerCase().indexOf(sub.toLowerCase());
    check(idx === -1, "NO auth substring '" + sub + "' survives in the persisted ring");
  }

  // sanity: the benign whitelisted data DID persist (the test is not green merely
  // because the ring is empty).
  check(serialized.indexOf('github.notifications') !== -1, 'benign whitelisted slug persisted (ring is not empty)');
  check(serialized.indexOf('https://github.com') !== -1, 'benign whitelisted origin persisted');
  // HI-02: the benign error NAME is kept (control-plane class label) even though
  // the secret-bearing message text is reduced to a content-free shape -- proving
  // the redaction dropped the secret without nuking the useful name.
  check(serialized.indexOf('FetchError') !== -1, 'benign error NAME survives (message shape-redacted, name kept)');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('audit-log-no-secret.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
