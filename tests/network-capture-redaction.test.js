'use strict';

/**
 * Phase 31 plan 01 (v0.9.99 -- DISC-03 / LEARN-02) -- THE capture redaction
 * security RED contract.
 *
 * Wave 0 RED test: extension/utils/network-capture-redactor.js does NOT exist yet
 * (Wave 2). The require() at load throws MODULE_NOT_FOUND and exits non-zero (the
 * RED). It turns GREEN only when Wave 2 ships the shape-only redactor (RESEARCH
 * Pattern 2). NEVER silently passes.
 *
 * This is THE security test (T-31-01-LEAK): it feeds a request carrying EVERY auth
 * carrier + a query string + a populated body, then asserts the redacted artifact
 * is SHAPE ONLY -- and, the audit-log-no-secret.test.js discipline, STRINGIFIES the
 * WHOLE redacted output and asserts NONE of the secret substrings survive.
 *
 * Asserts (DISC-03 / LEARN-02 / D-05..D-08):
 *   redactRequest(request) -> { method, path, origin, headerNames }
 *     - NO query string: path is the pathname only, no '?' anywhere (D-06)
 *     - headerNames contains NONE of authorization/cookie/x-csrf-token/x-api-key/
 *       a bearer-named header (auth carriers removed entirely, D-07)
 *     - NO header VALUES anywhere; NO `body` field (D-06)
 *   redactResponse(response) -> { status, mimeType }
 *     - ONLY status + mimeType; NO body, NO header values (D-08)
 *   The serialized JSON of the WHOLE redacted artifact contains none of the secret
 *   substrings (no-secret guarantee).
 *
 * Zero-framework: passed/failed + check(cond,msg) + process.exit(failed>0?1:0).
 *
 * Run: node tests/network-capture-redaction.test.js
 */

const path = require('path');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const REDACTOR_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'network-capture-redactor.js');

// The exact secret substrings that MUST NOT survive into any redacted artifact.
const SECRET_TOKEN = 'sk-LIVE-SECRETtoken-DEADBEEF';
const SESSION_VALUE = 'SESSIONcookieVALUE-99';
const CSRF_VALUE = 'CSRFtoken-AAA111';
const APIKEY_VALUE = 'APIKEY-ZZZ999';
const BEARER_VALUE = 'BEARERjwt-XYZ';
const QUERY_TOKEN = 'querytokenABC';
const BODY_SECRET = 'bodyPASSWORD-hunter2';

(async () => {
  console.log('--- DISC-03/LEARN-02 capture redaction no-secret (RED until Wave 2) ---');

  // require AT TOP LEVEL -- a MISSING redactor throws here (the loud RED).
  const Redactor = require(REDACTOR_PATH);
  check(typeof Redactor === 'object' && Redactor, 'network-capture-redactor module loads (require)');
  check(typeof Redactor.redactRequest === 'function', 'exports redactRequest');
  check(typeof Redactor.redactResponse === 'function', 'exports redactResponse');

  // ---- a hostile-rich request carrying EVERY secret carrier ----
  const rawRequest = {
    method: 'POST',
    url: 'https://example.com/api/items/42?session=' + QUERY_TOKEN + '&token=' + QUERY_TOKEN + '#frag',
    headers: {
      'Authorization': 'Bearer ' + SECRET_TOKEN,
      'Cookie': 'sid=' + SESSION_VALUE,
      'X-CSRF-Token': CSRF_VALUE,
      'X-Api-Key': APIKEY_VALUE,
      'X-My-Bearer-Header': BEARER_VALUE,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    // a populated body that MUST NOT persist (D-06)
    postData: JSON.stringify({ password: BODY_SECRET, username: 'alice' })
  };

  const red = Redactor.redactRequest(rawRequest);
  check(red && typeof red === 'object', 'redactRequest returns an object');

  // ---- NO query string: path is pathname only, no '?' (D-06) ----
  check(red && red.path === '/api/items/42', "redacted path is the pathname only ('/api/items/42', NO query, D-06)");
  check(red && typeof red.path === 'string' && red.path.indexOf('?') === -1, 'redacted path contains NO "?" (query dropped)');
  check(red && red.origin === 'https://example.com', 'redacted origin is the bare origin');
  check(red && red.method === 'POST', 'redacted method is preserved (shape)');

  // ---- headerNames: auth carriers removed; names only; no values (D-07) ----
  check(red && Array.isArray(red.headerNames), 'redacted headerNames is an array');
  const names = (red && red.headerNames) || [];
  const lowerNames = names.map(function (n) { return String(n).toLowerCase(); });
  for (const carrier of ['authorization', 'cookie', 'x-csrf-token', 'x-api-key']) {
    check(lowerNames.indexOf(carrier) === -1, "auth carrier '" + carrier + "' is REMOVED from headerNames (D-07)");
  }
  // any *bearer* header name is also removed
  check(!lowerNames.some(function (n) { return n.indexOf('bearer') !== -1; }), 'any *bearer* header name is removed (D-07)');
  // benign header NAMES may remain (names only, no values)
  check(lowerNames.indexOf('content-type') !== -1 || lowerNames.indexOf('accept') !== -1,
    'benign header NAMES survive (names only -- the shape, D-07)');

  // ---- NO body field anywhere (D-06) ----
  check(!('body' in red) && !('postData' in red), 'redacted request has NO body / postData field (D-06)');

  // ---- redactResponse: status + mimeType ONLY (D-08) ----
  const rawResponse = {
    status: 200,
    statusText: 'OK',
    mimeType: 'application/json',
    headers: { 'Set-Cookie': 'sid=' + SESSION_VALUE, 'X-Api-Key': APIKEY_VALUE },
    // a body that must NEVER be read/persisted (D-08)
    body: JSON.stringify({ secret: BODY_SECRET })
  };
  const redResp = Redactor.redactResponse(rawResponse);
  check(redResp && redResp.status === 200, 'redactResponse returns status (shape, D-08)');
  check(redResp && redResp.mimeType === 'application/json', 'redactResponse returns mimeType (shape, D-08)');
  check(redResp && !('body' in redResp), 'redactResponse has NO body field (D-08)');
  check(redResp && !('headers' in redResp), 'redactResponse has NO headers field (no header values, D-08)');
  // only status + mimeType keys (no leakage surface)
  const respKeys = Object.keys(redResp || {}).sort();
  check(respKeys.length === 2 && respKeys[0] === 'mimeType' && respKeys[1] === 'status',
    'redactResponse exposes ONLY {status, mimeType} (no extra leakage surface)');

  // ---- THE no-secret assertion: stringify the WHOLE artifact, grep for EVERY secret ----
  const serialized = JSON.stringify({ request: red, response: redResp });
  const SECRETS = [
    { name: 'authorization bearer token', v: SECRET_TOKEN },
    { name: 'cookie session value', v: SESSION_VALUE },
    { name: 'csrf token value', v: CSRF_VALUE },
    { name: 'api key value', v: APIKEY_VALUE },
    { name: 'bearer header value', v: BEARER_VALUE },
    { name: 'query token', v: QUERY_TOKEN },
    { name: 'body password', v: BODY_SECRET }
  ];
  for (const s of SECRETS) {
    check(serialized.indexOf(s.v) === -1, 'serialized redacted artifact contains NO ' + s.name + ' (no-secret, LEARN-02)');
  }
  // generic substrings the audit-log discipline also forbids in a shape
  for (const sub of ['?', 'password', 'Bearer ', SESSION_VALUE, CSRF_VALUE]) {
    check(serialized.indexOf(sub) === -1, "serialized redacted artifact contains NO '" + sub + "' substring");
  }

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('network-capture-redaction.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
