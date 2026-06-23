'use strict';

/**
 * Phase 32 Plan 01 (v0.9.99 Native Capability Catalog -- Self-Healing Fallback +
 * Recipe-Rot) -- capability-rot-detector taxonomy + expectedShape unit suite.
 * WAVE 0: this file is authored BEFORE extension/utils/capability-rot-detector.js
 * exists (Plan 02 creates it). A clean RED here is the CORRECT and EXPECTED Wave 0
 * state: requiring the not-yet-created module throws MODULE_NOT_FOUND, which this
 * harness detects and reports as a single deterministic non-crash failure. The
 * full assertion body below is the HEAL-02 / HEAL-04 contract the detector must
 * satisfy once it lands; every check() runs GREEN in Plan 02 with zero edits here.
 *
 * Proves (RED now, GREEN in Plan 02):
 *
 *   - HEAL-04 taxonomy (D-01, RESEARCH Pattern 2 decision table): classifyRecipeBroken
 *     keys off the executeBoundSpec normalized result shape (capability-fetch.js
 *     :336-384) to distinguish recipe-broken (4xx/5xx, fetch-failed, expectedShape-
 *     mismatch) from a legitimate no-results (200 + valid shape + empty set --
 *     RETURNED VERBATIM, never masked) from logged-out (redirected:true -> surfaced,
 *     NOT healed).
 *   - HEAL-04 never-mask guard (RESEARCH Open Question 1 / Pitfall 2): a present-but-
 *     empty container of the EXPECTED kind (e.g. data:[] under expectedShape:'@') is
 *     a REAL empty outcome -> broken === false ("0 results passes"). Only a missing
 *     path / wrong-kind body (login-HTML, null where an object/array was expected)
 *     fails expectedShape -> RECIPE_EXPIRED ("login-HTML fails").
 *   - T-32-PASS security passthrough (Pitfall 3): a dual-field RECIPE_ORIGIN_MISMATCH
 *     (and a RECIPE_CONSENT_REQUIRED) result classifies NOT broken -- a security
 *     rejection MUST NEVER be healed away as a rot.
 *   - HEAL-02 expectedShape (D-05/D-06, RESEARCH Pattern 3): validateExpectedShape
 *     asserts the read PATH resolves to a present container (structure, never values);
 *     a present non-empty value passes; a present empty array/object of the expected
 *     kind passes (conservative D-06); a null / missing path fails.
 *   - T-32-LEAK (V7 redaction posture): the suite reads result.data / result.text
 *     fields but NEVER console.logs a raw body -- modeling the no-body-in-logs posture
 *     the Plan-02 detector must follow.
 *
 * Zero-framework FSB convention (tests/capability-recipe-schema.test.js +
 * tests/tool-definitions-parity.test.js): module-level passed/failed counters,
 * synchronous check(cond,msg), process.exit(failed>0?1:0). ASCII-only, NO emojis.
 * globalThis.jmespath is set to the vendored engine (mirrors capability-router.test
 * .js:84) so the detector's validateExpectedShape reaches getFSBJmespath().
 *
 * Run: node tests/capability-rot-detector.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DETECTOR_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-rot-detector.js');
const JMESPATH_PATH = path.join(REPO_ROOT, 'extension', 'lib', 'jmespath.min.js');
const INTERP_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-interpreter.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// ---- Set the jmespath engine global the way the SW + capability-router.test.js
//      do (capability-router.test.js:84). The detector's validateExpectedShape
//      reaches it via FsbCapabilityInterpreter.getFSBJmespath() (which returns the
//      lowercase `jmespath` global). Load the interpreter too so getFSBJmespath
//      resolves if the detector routes through it. In Wave 0 RED the detector
//      require() below fails first; these still load so the harness is structurally
//      valid the moment the module appears.
globalThis.jmespath = require(JMESPATH_PATH);
const FsbInterp = require(INTERP_PATH);
globalThis.FsbCapabilityInterpreter = FsbInterp;

// ---- Require the detector under test. A MODULE_NOT_FOUND is the CLEAN Wave 0 RED.
let DETECTOR = null;
let detectorLoadError = null;
try {
  DETECTOR = require(DETECTOR_PATH);
} catch (err) {
  detectorLoadError = err;
}

if (!DETECTOR || typeof DETECTOR.classifyRecipeBroken !== 'function'
    || typeof DETECTOR.validateExpectedShape !== 'function') {
  // Wave 0 RED: the module does not exist yet (Plan 02). Report a single
  // deterministic failure and exit non-zero WITHOUT crashing -- the require
  // structure itself is proven valid (jmespath + interpreter loaded). The full
  // assertion body below goes GREEN once capability-rot-detector.js exports both
  // classifyRecipeBroken() and validateExpectedShape().
  const why = detectorLoadError && detectorLoadError.code === 'MODULE_NOT_FOUND'
    ? 'capability-rot-detector.js not yet created (expected Wave 0 RED; Plan 02 lands it)'
    : ('capability-rot-detector.js did not export classifyRecipeBroken()+validateExpectedShape() ('
        + (detectorLoadError && detectorLoadError.message ? detectorLoadError.message : 'no export')
        + ')');
  check(false, 'HEAL-02/04: ' + why);
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

const classifyRecipeBroken = DETECTOR.classifyRecipeBroken;
const validateExpectedShape = DETECTOR.validateExpectedShape;

// A minimal recipe carrying the conservative expectedShape='@' assertion (the read
// path itself resolving -- RESEARCH Pattern 3). extract:'@' mirrors the github-
// notifications shape. capturedAt is the optional ISO rot-age stamp (D-05).
const RECIPE_WITH_SHAPE = {
  schemaVersion: 2,
  id: 'github.notifications',
  origin: 'https://github.com',
  endpoint: '/notifications',
  method: 'GET',
  authStrategy: 'same-origin-cookie',
  extract: '@',
  expectedShape: '@',
  capturedAt: '2026-01-01T00:00:00.000Z'
};
// A recipe whose expectedShape requires the `items` key path to resolve.
const RECIPE_WITH_ITEMS_SHAPE = {
  schemaVersion: 2,
  id: 'github.notifications.items',
  origin: 'https://github.com',
  endpoint: '/notifications',
  method: 'GET',
  authStrategy: 'same-origin-cookie',
  extract: 'items',
  expectedShape: 'items'
};

// ===========================================================================
// (A) classifyRecipeBroken -- the full HEAL-04 decision table (RESEARCH Pattern 2).
//     Each synthetic result mirrors an executeBoundSpec normalized shape
//     (capability-fetch.js: success :377-384, failure :336/:356/:359, pin :293).
// ===========================================================================
console.log('\n--- (A) classifyRecipeBroken taxonomy (HEAL-04, RESEARCH Pattern 2 decision table) ---');

// 4xx/5xx -> broken -> fallback.
const v404 = classifyRecipeBroken({ success: true, status: 404 }, RECIPE_WITH_SHAPE);
check(v404 && v404.broken === true,
  'HEAL-04: success:true status:404 -> broken === true (HTTP 4xx -> fallback)');
const v503 = classifyRecipeBroken({ success: true, status: 503 }, RECIPE_WITH_SHAPE);
check(v503 && v503.broken === true,
  'HEAL-04: success:true status:503 -> broken === true (HTTP 5xx -> fallback)');

// 302->login (redirected:true) -> logged-out -> surfaced verbatim, NOT healed.
const vRedir = classifyRecipeBroken({ success: true, redirected: true, status: 200 }, RECIPE_WITH_SHAPE);
check(vRedir && vRedir.broken === false,
  'HEAL-04: success:true redirected:true -> broken === false (logged-out is surfaced, NOT healed)');
check(vRedir && vRedir.code === 'RECIPE_LOGGED_OUT',
  "HEAL-04: a 302->login carries code 'RECIPE_LOGGED_OUT' (the load-bearing logged-out line, D-01)");

// 200 + valid shape + EMPTY set -> legitimate no-results -> RETURNED VERBATIM.
// The load-bearing HEAL-04 "never mask a real no-results" line: data:[] under
// expectedShape:'@' is a present-but-empty container of the expected kind -> NOT
// broken (RESEARCH Open Question 1 / Pitfall 2 -- "0 results passes").
const vEmpty = classifyRecipeBroken({ success: true, status: 200, data: [] }, RECIPE_WITH_SHAPE);
check(vEmpty && vEmpty.broken === false,
  'HEAL-04: 0 results passes -- success:true status:200 data:[] under expectedShape "@" -> broken === false (a real empty outcome is NEVER masked)');

// 200 but the body is login-HTML / wrong-kind that the expectedShape path fails ->
// broken -> RECIPE_EXPIRED. The load-bearing "login-HTML fails" rot line.
const vLoginHtml = classifyRecipeBroken(
  { success: true, status: 200, data: '<html>login</html>' },
  RECIPE_WITH_ITEMS_SHAPE
);
check(vLoginHtml && vLoginHtml.broken === true,
  'HEAL-04: login-HTML fails -- success:true status:200 data:"<html>login</html>" under expectedShape "items" -> broken === true');
check(vLoginHtml && vLoginHtml.code === 'RECIPE_EXPIRED',
  "HEAL-04: a login-HTML / wrong-kind body that fails expectedShape carries code 'RECIPE_EXPIRED'");

// data:null where the expectedShape path needs a container -> broken -> RECIPE_EXPIRED.
const vNullData = classifyRecipeBroken(
  { success: true, status: 200, data: null },
  RECIPE_WITH_ITEMS_SHAPE
);
check(vNullData && vNullData.broken === true && vNullData.code === 'RECIPE_EXPIRED',
  "HEAL-04: success:true status:200 data:null under expectedShape 'items' -> broken === true (RECIPE_EXPIRED)");

// fetch-failed (success:false, error) -> broken -> RECIPE_EXPIRED.
const vFetchFail = classifyRecipeBroken({ success: false, error: 'no result from page fetch' }, RECIPE_WITH_SHAPE);
check(vFetchFail && vFetchFail.broken === true,
  "HEAL-04: success:false error:'no result from page fetch' -> broken === true (fetch-failed -> fallback)");
check(vFetchFail && vFetchFail.code === 'RECIPE_EXPIRED',
  "HEAL-04: a fetch-failed result carries code 'RECIPE_EXPIRED'");

// A bare success with no expectedShape and a present body -> NOT broken.
const vOk = classifyRecipeBroken({ success: true, status: 200, data: { ok: true } },
  { schemaVersion: 2, id: 'x', origin: 'https://x.com', endpoint: '/y', method: 'GET', authStrategy: 'none' });
check(vOk && vOk.broken === false,
  'HEAL-04: success:true status:200 with a present body and no expectedShape -> broken === false (returned verbatim)');

// ===========================================================================
// (B) Security passthrough (T-32-PASS, Pitfall 3, threat T-32-PASS): a typed
//     RECIPE_ORIGIN_MISMATCH / RECIPE_CONSENT_REQUIRED dual-field rejection is NOT
//     a rot and MUST NOT trigger a fallback. A security rejection must never be
//     healed away.
// ===========================================================================
console.log('\n--- (B) typed security passthrough is NOT a rot (T-32-PASS, Pitfall 3) ---');

const vOriginPin = classifyRecipeBroken(
  { success: false, code: 'RECIPE_ORIGIN_MISMATCH', errorCode: 'RECIPE_ORIGIN_MISMATCH', error: 'RECIPE_ORIGIN_MISMATCH' },
  RECIPE_WITH_SHAPE
);
check(vOriginPin && vOriginPin.broken === false,
  'T-32-PASS: RECIPE_ORIGIN_MISMATCH passthrough (not broken) -- a security rejection is NOT a rot and MUST NOT fall back');

const vConsent = classifyRecipeBroken(
  { success: false, code: 'RECIPE_CONSENT_REQUIRED', errorCode: 'RECIPE_CONSENT_REQUIRED', error: 'RECIPE_CONSENT_REQUIRED' },
  RECIPE_WITH_SHAPE
);
check(vConsent && vConsent.broken === false,
  'T-32-PASS: RECIPE_CONSENT_REQUIRED passthrough (not broken) -- a consent rejection is NOT a rot and MUST NOT fall back');

// A NON-typed failure (plain success:false, no RECIPE_* code) IS a rot -- this is
// the discriminator that keeps the passthrough narrow to typed security codes only.
const vPlainFail = classifyRecipeBroken({ success: false, error: 'executeScript failed: page threw' }, RECIPE_WITH_SHAPE);
check(vPlainFail && vPlainFail.broken === true,
  'T-32-PASS: a plain success:false WITHOUT a typed RECIPE_* code IS broken (the passthrough is narrow to typed security codes)');

// ===========================================================================
// (C) validateExpectedShape -- the conservative structural predicate (HEAL-02,
//     D-06, RESEARCH Pattern 3): assert the read PATH resolves to a present
//     container, NEVER that values are non-empty.
// ===========================================================================
console.log('\n--- (C) validateExpectedShape conservative structural predicate (HEAL-02, D-06) ---');

// A present non-empty value passes.
check(validateExpectedShape({ items: [{ id: 1 }] }, 'items') === true,
  'HEAL-02: validateExpectedShape -- a present non-empty value at the path passes');
check(validateExpectedShape({ ok: true }, '@') === true,
  'HEAL-02: validateExpectedShape -- a present non-empty object under "@" passes');

// A present EMPTY array/object of the EXPECTED kind passes (conservative D-06 --
// "0 results" is shape-intact, never a false RECIPE_EXPIRED).
check(validateExpectedShape([], '@') === true,
  'HEAL-02: validateExpectedShape -- a present empty array under "@" passes (conservative D-06: 0 results is shape-intact)');
check(validateExpectedShape({ items: [] }, 'items') === true,
  'HEAL-02: validateExpectedShape -- a present empty array at the expected path passes (never a false RECIPE_EXPIRED)');

// A null / missing path / wrong-kind fails.
check(validateExpectedShape(null, '@') === false,
  'HEAL-02: validateExpectedShape -- a null body fails (no container resolves)');
check(validateExpectedShape({ other: 1 }, 'items') === false,
  'HEAL-02: validateExpectedShape -- a missing path fails (the items key does not resolve)');
check(validateExpectedShape('<html>login</html>', 'items') === false,
  'HEAL-02: validateExpectedShape -- a login-HTML string body fails the items path (wrong kind)');

console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
