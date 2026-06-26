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

  // =========================================================================
  // PHASE 42 (DSEED-02) EXTENSION -- the 119-app auth-carrier no-leak at scale.
  // Three APPENDED blocks (the existing cases above stay GREEN + UNCHANGED):
  //   (1) 119-app HEADER-carrier universe: NONE of the carrier NAMES survive in
  //       headerNames; NO sentinel/token VALUE survives anywhere.
  //   (2) PATH-token-in-segment (the SC3 sink-#1 vector): a token shape embedded in
  //       a URL PATH SEGMENT is masked to ':tok'; ZERO sentinel token substring in
  //       red.path OR the serialized artifact.
  //   (3) BENIGN-slug NEGATIVE (no false-positive): a hyphenated org/repo slug
  //       survives LITERAL (NOT masked) so legitimate recipe templates still match.
  //
  // RED-FIRST: blocks (1)+(2) FAIL against the not-yet-extended redactor (carrier
  // NAMES + path tokens survive); Plan 02 (denylist extension + _shapeUrl path
  // scrub) turns them GREEN. Block (3) is GREEN today and MUST STAY GREEN.
  // =========================================================================
  console.log('--- DSEED-02: 119-app auth-carrier universe no-leak (RED until Plan 02) ---');

  // ---- (1) 119-app HEADER-carrier universe -------------------------------------
  // The auth-carrier NAME universe audited from the vendored *-api.ts getAuth()/
  // header-construction structs: the SC-named carriers PLUS a representative spread
  // of the cross-app families. Each is seeded as a header NAME with a DISTINCTIVE
  // sentinel VALUE (so a passing no-VALUE assertion is non-vacuous).
  const H = (n) => n; // identity, for readability of the carrier-name list
  const HEADER_CARRIERS = [
    // SC-named
    H('session_api_key'), H('csrf_token'), H('csrftoken'), H('linear-client-id'), H('organization'),
    // cross-app X- families
    H('x-csrf-token'), H('x-csrftoken'), H('x-xsrf-token'), H('x-amz-security-token'), H('x-amz-date'),
    H('x-auth-token'), H('x-session-token'), H('x-api-key'), H('x-airtable-application-id'),
    H('x-airbnb-api-key'), H('x-ig-app-id'), H('x-modhash'), H('x-thd-customer-token'),
    H('x-booking-csrf-token'), H('x-stripe-csrf-token'), H('x-dd-csrf-token'), H('x-twitter-auth-type'),
    H('x-notion-active-user-header'), H('x-restli-protocol-version'), H('x-org'),
    // bare / underscore auth carriers
    H('authorization'), H('cookie'), H('sessionid'), H('auth-token'), H('xsrftoken'),
    H('access_token'), H('id_token'), H('refresh_token')
  ];
  // distinctive sentinel VALUES (each value is unique so a leak is unambiguous)
  const HV_PREFIX = 'SENTINELvalue119_';
  const TOKEN_SHAPED_VALUE_SK = 'sk_' + 'live_DISTINCThdr119ABCDEFGH';
  const TOKEN_SHAPED_VALUE_JWT = 'eyJhbGciOiJIUzI1NiHDR119.payloadDISTINCThdr.sigDISTINCThdr';
  const hostileHeaders = {};
  HEADER_CARRIERS.forEach((name, i) => { hostileHeaders[name] = HV_PREFIX + i + '_' + name; });
  // a token-shaped value parked in a benign-NAME header (the structure-only floor:
  // even a NAME NOT on the denylist must leak no VALUE -- the loop never reads values)
  hostileHeaders['x-unknown-benign-carrier'] = TOKEN_SHAPED_VALUE_SK;
  hostileHeaders['x-another-unknown'] = TOKEN_SHAPED_VALUE_JWT;
  hostileHeaders['Content-Type'] = 'application/json';

  const hostileReq = {
    method: 'POST',
    url: 'https://app.example.com/v1/widgets/42',
    headers: hostileHeaders
  };
  const hostileResp = {
    status: 200, mimeType: 'application/json',
    headers: { 'Set-Cookie': 'sid=' + HV_PREFIX + 'resp' }
  };
  const redHostile = Redactor.redactRequest(hostileReq);
  const redHostileResp = Redactor.redactResponse(hostileResp);

  // (a) NONE of the auth-carrier NAMES survive in headerNames (RED until Plan 02)
  const hostileNames = ((redHostile && redHostile.headerNames) || []).map((n) => String(n).toLowerCase());
  for (const carrier of HEADER_CARRIERS) {
    check(hostileNames.indexOf(carrier.toLowerCase()) === -1,
      "119-app: auth carrier name '" + carrier + "' is REMOVED from headerNames");
  }
  // (b) the serialized whole artifact (the learned-recipe-envelope-shaped sink)
  //     contains NONE of the sentinel VALUES nor the token-shaped VALUES.
  const hostileSerialized = JSON.stringify({ request: redHostile, response: redHostileResp });
  HEADER_CARRIERS.forEach((name, i) => {
    const v = HV_PREFIX + i + '_' + name;
    check(hostileSerialized.indexOf(v) === -1, "119-app: header sentinel VALUE for '" + name + "' does NOT survive");
  });
  // the structure-only floor: a token-shaped VALUE in an UNKNOWN-name header never
  // appears (the loop reads names only -- this is GREEN today, the keystone floor).
  check(hostileSerialized.indexOf(TOKEN_SHAPED_VALUE_SK) === -1,
    'structure-only floor: sk_live_ VALUE in an UNKNOWN-name header never appears (names-only loop)');
  check(hostileSerialized.indexOf(TOKEN_SHAPED_VALUE_JWT) === -1,
    'structure-only floor: JWT-shaped VALUE in an UNKNOWN-name header never appears (names-only loop)');
  check(hostileSerialized.indexOf(HV_PREFIX) === -1,
    '119-app: NO sentinel-value prefix substring survives anywhere in the artifact');

  // ---- (2) PATH-token-in-segment (the SC3 sink-#1 vector, RED until Plan 02) ----
  // Each distinctive token shape rides a URL PATH SEGMENT. Run through redactRequest;
  // BOTH red.path AND the serialized artifact must contain ZERO of the sentinel token
  // substrings (each token-shaped segment masked to ':tok').
  const JWT_PATH = 'eyJhbGciOiJIUzPATH.payloadDISTINCTjwtPATH.sigDISTINCTjwtPATH';
  const SK_PATH = 'sk_' + 'live_DISTINCTSENTINEL123pathABCDEFG';
  const GHO_PATH = 'gho_DISTINCTtokenPATH1234567890abcdef';
  const XOX_PATH = 'xoxb-DISTINCTslackPATH-1234567890';
  // A REAL-shaped AWS access key id: 'AKIA' + exactly 16 [A-Z0-9] (the actual leak
  // vector). 'AKIA' + 'DISTINCTAWS9X99Z' = 4 + 16 = 20 chars, matching the precise
  // ^(AKIA|ASIA)[A-Z0-9]{16}$ shape the scrub masks.
  const AKIA_PATH = 'AKIADISTINCTAWS9X99Z';
  const YA29_PATH = 'ya29.DISTINCTgoogleOAuthPATHtoken';
  const USHARE_PATH = 'u!aHR0cHM_DISTINCT-ABshareIdPATH';
  const PATH_TOKEN_CASES = [
    { url: 'https://app.example.com/auth/callback/' + JWT_PATH, sentinel: 'DISTINCTjwtPATH', label: 'JWT in OAuth callback path' },
    { url: 'https://app.example.com/reset/' + JWT_PATH, sentinel: 'DISTINCTjwtPATH', label: 'JWT in reset path' },
    { url: 'https://app.example.com/s/' + SK_PATH, sentinel: 'DISTINCTSENTINEL123', label: 'stripe sk_live_ in path' },
    { url: 'https://app.example.com/x/' + GHO_PATH, sentinel: 'DISTINCTtokenPATH', label: 'github gho_ in path' },
    { url: 'https://app.example.com/i/' + XOX_PATH, sentinel: 'DISTINCTslackPATH', label: 'slack xoxb- in path' },
    { url: 'https://app.example.com/k/' + AKIA_PATH, sentinel: 'DISTINCTAWS', label: 'aws AKIA in path' },
    { url: 'https://app.example.com/g/' + YA29_PATH, sentinel: 'DISTINCTgoogleOAuthPATH', label: 'google ya29. in path' },
    { url: 'https://app.example.com/shares/' + USHARE_PATH + '/driveItem', sentinel: 'DISTINCT-ABshareIdPATH', label: 'MS Graph u! share-id in path' }
  ];
  for (const tc of PATH_TOKEN_CASES) {
    const r = Redactor.redactRequest({ method: 'GET', url: tc.url, headers: {} });
    const ser = JSON.stringify({ request: r, response: redResp });
    check(r && typeof r.path === 'string' && r.path.indexOf(tc.sentinel) === -1,
      'path-token: ' + tc.label + ' -- sentinel ABSENT from red.path (masked)');
    check(ser.indexOf(tc.sentinel) === -1,
      'path-token: ' + tc.label + ' -- sentinel ABSENT from serialized artifact');
    // non-vacuous: the masked path must show the ':tok' placeholder (proves the scrub
    // fired, not that URL parsing silently dropped the segment).
    check(r && typeof r.path === 'string' && r.path.indexOf(':tok') !== -1,
      'path-token: ' + tc.label + " -- ':tok' placeholder present in red.path (scrub fired)");
  }

  // ---- (3) BENIGN-slug NEGATIVE (no false-positive; GREEN today + after Plan 02) ----
  // A benign hyphenated org/repo slug must survive LITERAL (NOT masked to :tok), so a
  // legitimate recipe template still matches the real path on replay.
  const benignReq = { method: 'GET', url: 'https://github.example.com/orgs/my-long-organization-name/repos', headers: {} };
  const benignRed = Redactor.redactRequest(benignReq);
  check(benignRed && typeof benignRed.path === 'string' && benignRed.path.indexOf('my-long-organization-name') !== -1,
    'benign-slug: hyphenated org slug "my-long-organization-name" SURVIVES literal in red.path (no false-positive)');
  check(benignRed && typeof benignRed.path === 'string' && benignRed.path === '/orgs/my-long-organization-name/repos',
    'benign-slug: the whole benign path is preserved verbatim (NOT masked to :tok)');
  // additional benign shapes the precise distinctive-prefix set must NOT mask:
  const benignReq2 = { method: 'GET', url: 'https://app.example.com/pages/my-document-title-2024/edit', headers: {} };
  const benignRed2 = Redactor.redactRequest(benignReq2);
  check(benignRed2 && benignRed2.path.indexOf('my-document-title-2024') !== -1,
    'benign-slug: a long hyphenated document title survives literal (no over-match)');
  const benignReq3 = { method: 'GET', url: 'https://dashboard.stripe.com/v1/charges', headers: {} };
  const benignRed3 = Redactor.redactRequest(benignReq3);
  check(benignRed3 && benignRed3.path === '/v1/charges',
    'benign-slug: a normal REST path (/v1/charges) survives literal');

  console.log('\nPASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('network-capture-redaction.test.js RED/failed:', err && err.message ? err.message : err);
  process.exit(1);
});
