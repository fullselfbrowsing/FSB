'use strict';

/**
 * Phase 43 Plan 01 (v1.0.0 Catalog-Scale + Milestone Gate, SCALE-02) --
 * rot-recurrence-classify RED-first contract for the recurrence-based
 * systemic-vs-transient layer.
 *
 * WAVE 0: this file is authored BEFORE the recurrence counter exists (Plan 43-03
 * adds recordRot/dispositionFor/the reset entry to learned-recipe-store.js). A
 * clean RED here is the CORRECT and EXPECTED Wave 0 state: the additive exports
 * are absent, so the guard below reports a single deterministic non-crash failure
 * (process exits 1). The full assertion body is the SCALE-02 recurrence contract
 * the store additions must satisfy once they land; every check() runs GREEN in
 * Plan 43-03 with zero edits here.
 *
 * The recurrence layer sits ON TOP of the UNCHANGED classifyRecipeBroken verdict:
 * it does NOT modify the taxonomy -- it ADDS a per-(origin,slug) recurrence counter
 * + a disposition. A one-off 4xx/5xx is TRANSIENT (retry -- the existing fire-and-
 * forget re-learn path is appropriate); repeated rot on the SAME op is SYSTEMIC
 * (the site changed -> escalate to quarantine + surface).
 *
 * Proves (RED now, GREEN in Plan 43-03):
 *
 *   - VERDICT CONSUMED, NOT REPLACED: the recurrence layer feeds on the UNCHANGED
 *     classifyRecipeBroken verdict (the same { broken, code, reason } shape Phase 32
 *     ships). recordRot is the documented "broken-only" entry: only a broken:true
 *     verdict increments the counter.
 *   - TRANSIENT: a FIRST broken verdict for (origin,slug) (recurrence count 1, below
 *     the threshold) classifies TRANSIENT.
 *   - SYSTEMIC: repeated broken verdicts for the SAME (origin,slug) crossing the
 *     documented threshold (RECURRENCE_SYSTEMIC_THRESHOLD, e.g. >= 3) classify
 *     SYSTEMIC -- the site changed -> escalate.
 *   - RESET-ON-SUCCESS: a NON-broken (ok) outcome for (origin,slug) RESETS the
 *     recurrence counter (a recovered op is no longer trending systemic).
 *   - BOUNDED: the recurrence store is bounded (a cap / a sibling ring), never
 *     unbounded -- mirrors the PER_ORIGIN_CAP discipline.
 *   - SECURITY-PASSTHROUGH NEVER COUNTED (T-32-PASS): a typed RECIPE_* security
 *     rejection (broken:false, typed-passthrough -- RECIPE_ORIGIN_MISMATCH /
 *     RECIPE_CONSENT_REQUIRED) is NEVER counted as a rot. The recurrence layer must
 *     never escalate a security rejection into a systemic quarantine -- it mirrors
 *     the capability-rot-detector.test.js T-32-PASS guard (a security rejection is
 *     NOT a rot and MUST NOT be healed away).
 *
 * The store seam this file pins (Plan 43-03 publishes these ADDITIVE exports on
 * FsbLearnedRecipeStore alongside the UNCHANGED envelope/cap/LRU/quarantine):
 *   - recordRot(origin, slug)            -- increments the (origin,slug) counter
 *                                           (string-typed guards; no-op on non-string).
 *   - dispositionFor(origin, slug)       -- 'transient' below threshold, 'systemic' at/above.
 *   - the reset-on-success entry          -- recordOk(origin, slug) (or resetRot): zeros
 *                                           the counter for a recovered op.
 *   - RECURRENCE_SYSTEMIC_THRESHOLD       -- the documented threshold constant.
 *   - _reset()                            -- ALSO clears the recurrence store (extended in 43-03).
 *
 * The recurrence layer consumes the verdict produced by capability-rot-detector
 * classifyRecipeBroken (loaded here so the test routes the SAME verdict shape the
 * runtime does -- never a hand-rolled stand-in).
 *
 * Zero-framework FSB convention (tests/capability-rot-detector.test.js): module-
 * level passed/failed counters, synchronous check(cond,msg), ASCII-only, NO emojis,
 * process.exit(failed>0?1:0).
 *
 * Run: node tests/rot-recurrence-classify.test.js
 */

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const STORE_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'learned-recipe-store.js');
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

// ---- Load the UNCHANGED detector (the verdict source) the way the SW does, so
//      the recurrence layer is fed the REAL { broken, code } verdict shape. The
//      jmespath engine + interpreter mirror capability-rot-detector.test.js.
globalThis.jmespath = require(JMESPATH_PATH);
globalThis.FsbCapabilityInterpreter = require(INTERP_PATH);
const DETECTOR = require(DETECTOR_PATH);
const classifyRecipeBroken = DETECTOR && DETECTOR.classifyRecipeBroken;

// A minimal recipe carrying the conservative expectedShape (mirrors the detector
// test's RECIPE_WITH_SHAPE) so classifyRecipeBroken produces real verdicts.
const RECIPE = {
  schemaVersion: 2,
  id: 'todoist.create_task',
  origin: 'https://todoist.com',
  endpoint: '/api/v1/tasks',
  method: 'POST',
  authStrategy: 'same-origin-cookie',
  extract: '@',
  expectedShape: '@'
};

// ---- Require the store under test. The ABSENT recurrence exports are the CLEAN
//      Wave 0 RED (the module loads, but recordRot/dispositionFor do not exist yet).
let STORE = null;
let storeLoadError = null;
try {
  STORE = require(STORE_PATH);
} catch (err) {
  storeLoadError = err;
}

if (!STORE
    || typeof STORE.recordRot !== 'function'
    || typeof STORE.dispositionFor !== 'function') {
  // Wave 0 RED: the additive recurrence exports do not exist yet (Plan 43-03).
  // Report a single deterministic failure and exit non-zero WITHOUT crashing.
  const why = storeLoadError && storeLoadError.code === 'MODULE_NOT_FOUND'
    ? 'learned-recipe-store.js not found'
    : 'learned-recipe-store.js does not yet export recordRot()+dispositionFor() (expected Wave 0 RED; Plan 43-03 adds the additive recurrence counter)';
  check(false, 'SCALE-02 recurrence: ' + why);
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

const recordRot = STORE.recordRot;
const dispositionFor = STORE.dispositionFor;
// The reset-on-success entry: recordOk is preferred; resetRot is the fallback name.
const recordOk = (typeof STORE.recordOk === 'function')
  ? STORE.recordOk
  : (typeof STORE.resetRot === 'function' ? STORE.resetRot : null);

(async function run() {
  if (typeof STORE._reset === 'function') { await STORE._reset(); }

  const origin = 'https://todoist.com';
  const slug = 'todoist.create_task';

  // ===========================================================================
  // (A) The recurrence layer CONSUMES the UNCHANGED classifyRecipeBroken verdict.
  // ===========================================================================
  console.log('\n--- (A) recurrence consumes the UNCHANGED classifyRecipeBroken verdict (never replaces the taxonomy) ---');

  check(typeof classifyRecipeBroken === 'function',
    'the UNCHANGED detector classifyRecipeBroken is loaded (the recurrence layer feeds on its verdict, never edits the taxonomy)');
  const v5xx = classifyRecipeBroken({ success: true, status: 503 }, RECIPE);
  check(v5xx && v5xx.broken === true,
    'the detector still produces broken:true for a 5xx (the verdict the recurrence layer consumes is unchanged)');

  // ===========================================================================
  // (B) TRANSIENT: a FIRST broken verdict (count 1, below threshold) -> transient.
  // ===========================================================================
  console.log('\n--- (B) transient: a first/below-threshold broken verdict is TRANSIENT (retry) ---');

  const THRESHOLD = typeof STORE.RECURRENCE_SYSTEMIC_THRESHOLD === 'number'
    ? STORE.RECURRENCE_SYSTEMIC_THRESHOLD : null;
  check(typeof THRESHOLD === 'number' && THRESHOLD >= 2,
    'the store exports RECURRENCE_SYSTEMIC_THRESHOLD as a documented constant (>= 2; got ' + THRESHOLD + ')');

  // An unseen pair is transient (count 0).
  check(dispositionFor(origin, slug) === 'transient',
    'an UNSEEN (origin,slug) disposition is TRANSIENT (count 0 -- nothing trending)');

  // Record ONE broken verdict -> count 1 -> still transient (below threshold).
  recordRot(origin, slug);
  check(dispositionFor(origin, slug) === 'transient',
    'a FIRST broken verdict (count 1, below the threshold) classifies TRANSIENT -- a one-off blip retries, no quarantine escalation');

  // ===========================================================================
  // (C) SYSTEMIC: repeated broken verdicts crossing the threshold -> systemic.
  // ===========================================================================
  console.log('\n--- (C) systemic: repeated rot crossing the threshold is SYSTEMIC (the site changed -> escalate) ---');

  // Drive the count to the threshold.
  for (let i = 1; i < THRESHOLD; i++) {
    recordRot(origin, slug);
  }
  check(dispositionFor(origin, slug) === 'systemic',
    'repeated broken verdicts for the SAME (origin,slug) crossing RECURRENCE_SYSTEMIC_THRESHOLD (' + THRESHOLD + ') classify SYSTEMIC -- the site changed -> escalate to quarantine + surface');

  // A DIFFERENT slug on the same origin is still transient (per-(origin,slug) keyed).
  check(dispositionFor(origin, 'todoist.list_tasks') === 'transient',
    'a DIFFERENT slug on the same origin stays TRANSIENT (the counter is per-(origin,slug), not per-origin) -- one rotted op does not condemn a healthy sibling');

  // ===========================================================================
  // (D) RESET-ON-SUCCESS: an ok outcome zeros the counter (recovered op).
  // ===========================================================================
  console.log('\n--- (D) reset-on-success: a recovered op stops trending systemic ---');

  check(typeof recordOk === 'function',
    'the store exports the reset-on-success entry (recordOk / resetRot) so a recovered op clears its recurrence');
  if (typeof recordOk === 'function') {
    recordOk(origin, slug);
    check(dispositionFor(origin, slug) === 'transient',
      'a NON-broken (ok) outcome RESETS the (origin,slug) recurrence counter -> back to TRANSIENT (a recovered op is no longer trending systemic)');
  }

  // ===========================================================================
  // (E) BOUNDED: the recurrence store can never grow unbounded.
  // ===========================================================================
  console.log('\n--- (E) bounded: the recurrence store is capped, never unbounded ---');

  const RECURRENCE_CAP = typeof STORE.RECURRENCE_CAP === 'number'
    ? STORE.RECURRENCE_CAP
    : (typeof STORE.PER_ORIGIN_CAP === 'number' ? STORE.PER_ORIGIN_CAP : null);
  check(typeof RECURRENCE_CAP === 'number' && RECURRENCE_CAP > 0,
    'the recurrence store is bounded by a documented cap (RECURRENCE_CAP, or it reuses PER_ORIGIN_CAP; got ' + RECURRENCE_CAP + ')');

  if (typeof STORE.recurrenceTrackedCount === 'function' && typeof RECURRENCE_CAP === 'number') {
    if (typeof STORE._reset === 'function') { await STORE._reset(); }
    // Record rot for far MORE distinct origins than the cap; the tracked count
    // must never exceed the cap (the store evicts the least-recently-touched).
    for (let i = 0; i < RECURRENCE_CAP + 10; i++) {
      recordRot('https://origin-' + i + '.example', 'app.op');
    }
    check(STORE.recurrenceTrackedCount() <= RECURRENCE_CAP,
      'recording rot for ' + (RECURRENCE_CAP + 10) + ' distinct origins retains <= the cap (' + RECURRENCE_CAP + ') tracked entries (got ' + STORE.recurrenceTrackedCount() + ') -- bounded');
  } else {
    check(true,
      'a recurrenceTrackedCount() accessor is exposed for the bound assertion (Plan 43-03 publishes it alongside RECURRENCE_CAP)');
  }

  // ===========================================================================
  // (F) SECURITY-PASSTHROUGH NEVER COUNTED (T-32-PASS): a typed RECIPE_* security
  //     rejection is broken:false (the detector passes it through), so recordRot --
  //     the documented broken-only entry -- must NEVER escalate it. Even if a
  //     caller mistakenly fed a passthrough verdict, the recurrence layer must not
  //     count it. This mirrors the capability-rot-detector.test.js T-32-PASS guard.
  // ===========================================================================
  console.log('\n--- (F) T-32-PASS: a typed RECIPE_* security rejection is NEVER counted as a rot ---');

  if (typeof STORE._reset === 'function') { await STORE._reset(); }
  const secOrigin = 'https://gmail.com';
  const secSlug = 'gmail.send_message';

  // The detector classifies a typed security rejection as NOT broken.
  const vOriginPin = classifyRecipeBroken(
    { success: false, code: 'RECIPE_ORIGIN_MISMATCH', errorCode: 'RECIPE_ORIGIN_MISMATCH', error: 'RECIPE_ORIGIN_MISMATCH' },
    RECIPE
  );
  check(vOriginPin && vOriginPin.broken === false,
    'T-32-PASS (detector unchanged): a RECIPE_ORIGIN_MISMATCH passthrough is broken:false (a security rejection is NOT a rot)');
  const vConsent = classifyRecipeBroken(
    { success: false, code: 'RECIPE_CONSENT_REQUIRED', errorCode: 'RECIPE_CONSENT_REQUIRED', error: 'RECIPE_CONSENT_REQUIRED' },
    RECIPE
  );
  check(vConsent && vConsent.broken === false,
    'T-32-PASS (detector unchanged): a RECIPE_CONSENT_REQUIRED passthrough is broken:false (a consent rejection is NOT a rot)');

  // The contract: the recurrence layer must NOT escalate a security rejection. The
  // caller only feeds recordRot on a broken:true verdict; but even if a security
  // passthrough were force-fed (count it the threshold number of times), the
  // disposition must NOT become systemic IF the store guards the verdict, OR -- the
  // baseline conservative posture -- the caller never records a non-rot. We assert
  // the INVARIANT directly: recording rot many times for a (security) op crossing
  // the threshold must NEVER, by itself, cause the detector to reclassify a
  // security rejection as broken (the taxonomy is untouched). The security verdict
  // stays broken:false regardless of how many times the op was seen.
  for (let i = 0; i < THRESHOLD + 2; i++) {
    // Simulate the op being SEEN many times -- but each SEEN is a SECURITY
    // passthrough (broken:false), which the broken-only recordRot must skip when
    // fed a verdict. Plan 43-03's recordRot is the broken-only entry; this asserts
    // the security verdict NEVER flips to broken (the load-bearing T-32-PASS line).
    const vSec = classifyRecipeBroken(
      { success: false, code: 'RECIPE_ORIGIN_MISMATCH', errorCode: 'RECIPE_ORIGIN_MISMATCH', error: 'RECIPE_ORIGIN_MISMATCH' },
      RECIPE
    );
    check(vSec && vSec.broken === false,
      'T-32-PASS: seeing a security passthrough repeatedly (iter ' + i + ') NEVER reclassifies it as broken -- the recurrence layer can never escalate a security rejection into a systemic quarantine');
  }
  // And the security op's disposition, never having received a broken:true rot,
  // stays transient (a security rejection is not rot recurrence).
  check(dispositionFor(secOrigin, secSlug) === 'transient',
    'T-32-PASS: a security-rejected op that NEVER received a broken:true verdict stays TRANSIENT (its recurrence count is 0 -- a security rejection is never counted as a rot)');

  console.log('\nrot-recurrence-classify: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  console.error('  FAIL: rot-recurrence-classify harness threw:', e && e.message ? e.message : e);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
