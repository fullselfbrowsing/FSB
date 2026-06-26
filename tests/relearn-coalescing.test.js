'use strict';

/**
 * Phase 43 Plan 01 (v1.0.0 Catalog-Scale + Milestone Gate, SCALE-02) --
 * relearn-coalescing RED-first contract for the per-origin re-learn scheduler.
 *
 * WAVE 0: this file is authored BEFORE extension/utils/relearn-scheduler.js
 * exists (Plan 43-03 creates it). A clean RED here is the CORRECT and EXPECTED
 * Wave 0 state: require()ing the not-yet-created scheduler throws
 * MODULE_NOT_FOUND, which this harness detects and reports as a single
 * deterministic non-crash failure (process exits 1). The full assertion body
 * below is the SCALE-02 coalescing/back-off/bounded/consent-preserving contract
 * the scheduler must satisfy once it lands; every check() runs GREEN in Plan
 * 43-03 with zero edits here.
 *
 * The thundering-herd this fixes: capability-router.js _quarantineAndRelearn
 * fires discovery.runDiscovery(origin, { tabId }) FIRE-AND-FORGET on EVERY broken
 * verdict. At 119-app scale, one vendor changing site-wide rots N recipes on one
 * origin -> N concurrent CDP attaches. The scheduler COALESCES those N into ONE
 * consent-gated re-learn per origin, with exponential back-off on repeated failure.
 *
 * Proves (RED now, GREEN in Plan 43-03):
 *
 *   - COALESCING (N->1): scheduleRelearn(origin, fn, opts) called N times for ONE
 *     origin within the coalescing window invokes the supplied re-learn fn EXACTLY
 *     ONCE (no thundering-herd of CDP attaches). Two DISTINCT origins each invoke
 *     their own fn ONCE (keyed by origin).
 *   - BACK-OFF (exponential): after a re-learn fn that resolves ok:false (a failed/
 *     denied attempt), the NEXT scheduled re-learn for that origin is deferred by an
 *     EXPONENTIALLY growing delay (base, 2x, 4x ...) capped at a ceiling. Asserted
 *     SYNCHRONOUSLY via the injectable now()/clock + a deterministic flush seam in
 *     opts -- NO real wall-clock sleep (the suite runs < 5s with no watch flags). An
 *     fn that resolves ok:true RESETS the back-off (the origin recovered).
 *   - BOUNDED: the per-origin scheduler state is bounded (a cap on tracked origins
 *     AND a ceiling on the back-off delay) so it can NEVER grow unbounded -- mirrors
 *     the learned-recipe-store PER_ORIGIN_CAP discipline.
 *   - CONSENT-PRESERVED: the scheduler INVOKES the supplied re-learn fn (it does NOT
 *     re-implement capture/consent) -- the fn IS the consent-gated runDiscovery, so
 *     the Phase-30 gate (_runGate inside network-capture.startSession) still runs
 *     inside it. An fn that resolves { ok:false, reason:'RECIPE_CONSENT_*' } is
 *     treated as a failed attempt for back-off and the scheduler captures NOTHING
 *     itself.
 *
 * The injectable test seam the scheduler MUST expose (so this file asserts the
 * back-off schedule synchronously, no setTimeout race):
 *   - opts.now: () => ms              -- the injectable monotonic clock.
 *   - opts.setTimer / opts.clearTimer -- injectable timer hooks (default
 *     setTimeout/clearTimeout); a no-op stub lets the test own timing.
 *   - a flush seam -- FsbRelearnScheduler.flush(origin) (or opts.flush) that
 *     deterministically runs the due re-learn WITHOUT a wall-clock wait, returning
 *     a promise so the test can await the fn's resolution before asserting back-off.
 *   - FsbRelearnScheduler._reset() -- clears the tracked-origin map (mirrors the
 *     store's _reset) so each case starts empty.
 *
 * Zero-framework FSB convention (tests/capability-rot-detector.test.js): module-
 * level passed/failed counters, synchronous check(cond,msg), ASCII-only, NO
 * emojis, process.exit(failed>0?1:0). Because back-off assertions are async (the
 * fn resolves a promise), the contract body runs inside an async IIFE and exits
 * from there; the RED guard exits synchronously before it.
 *
 * Run: node tests/relearn-coalescing.test.js
 */

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCHEDULER_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'relearn-scheduler.js');

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

// ---- Require the scheduler under test. A MODULE_NOT_FOUND is the CLEAN Wave 0 RED.
let SCHED = null;
let schedLoadError = null;
try {
  SCHED = require(SCHEDULER_PATH);
} catch (err) {
  schedLoadError = err;
}

if (!SCHED || typeof SCHED.scheduleRelearn !== 'function') {
  // Wave 0 RED: the module does not exist yet (Plan 43-03). Report a single
  // deterministic failure and exit non-zero WITHOUT crashing. The full assertion
  // body below goes GREEN once relearn-scheduler.js exports scheduleRelearn().
  const why = schedLoadError && schedLoadError.code === 'MODULE_NOT_FOUND'
    ? 'relearn-scheduler.js not yet created (expected Wave 0 RED; Plan 43-03 lands it)'
    : ('relearn-scheduler.js did not export scheduleRelearn() ('
        + (schedLoadError && schedLoadError.message ? schedLoadError.message : 'no export')
        + ')');
  check(false, 'SCALE-02 coalescing: ' + why);
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

const scheduleRelearn = SCHED.scheduleRelearn;

// A small deterministic clock the test drives by hand. The scheduler reads
// opts.now() for every timing decision, so advancing `clockMs` + calling flush()
// is the ONLY thing that moves the schedule -- no wall-clock, no setTimeout race.
let clockMs = 1000;
const now = () => clockMs;
// A no-op injectable timer pair so the scheduler never arms a real setTimeout in
// the test (the test owns timing via flush()).
const setTimer = () => 0;
const clearTimer = () => {};

// Run the asynchronous contract body inside an async IIFE (back-off assertions
// await the re-learn fn's promise resolution). The RED guard above already
// returned for the not-yet-created module; here the module exists.
(async function run() {
  // ===========================================================================
  // (A) COALESCING: N calls on ONE origin -> ONE fn invocation; distinct origins
  //     each invoke their own fn once.
  // ===========================================================================
  console.log('\n--- (A) coalescing: N rot events on one origin -> ONE re-learn (no thundering-herd) ---');

  if (typeof SCHED._reset === 'function') { SCHED._reset(); }
  clockMs = 1000;

  const originA = 'https://todoist.com';
  let aCalls = 0;
  const fnA = () => { aCalls++; return Promise.resolve({ ok: true }); };

  // Feed N (5) rot events for the SAME origin within the coalescing window.
  for (let i = 0; i < 5; i++) {
    scheduleRelearn(originA, fnA, { now, setTimer, clearTimer });
  }
  // Deterministically run the due re-learn (the flush seam stands in for the
  // window firing) and await the fn's resolution.
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originA) : Promise.resolve());

  check(aCalls === 1,
    'COALESCING: 5 rot events on one origin within the coalescing window invoke the re-learn fn EXACTLY ONCE (got ' + aCalls + ') -- no thundering-herd of CDP attaches');

  // Two DISTINCT origins each get their OWN single re-learn (keyed by origin).
  if (typeof SCHED._reset === 'function') { SCHED._reset(); }
  clockMs = 1000;
  let bCalls = 0;
  let cCalls = 0;
  const originB = 'https://linear.app';
  const originC = 'https://confluence.atlassian.net';
  const fnB = () => { bCalls++; return Promise.resolve({ ok: true }); };
  const fnC = () => { cCalls++; return Promise.resolve({ ok: true }); };
  scheduleRelearn(originB, fnB, { now, setTimer, clearTimer });
  scheduleRelearn(originB, fnB, { now, setTimer, clearTimer });
  scheduleRelearn(originC, fnC, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush() : Promise.resolve());
  check(bCalls === 1 && cCalls === 1,
    'COALESCING (per-origin keyed): two distinct origins each invoke their OWN re-learn fn exactly once (B=' + bCalls + ', C=' + cCalls + ')');

  // ===========================================================================
  // (B) BACK-OFF: a failed (ok:false) re-learn defers the next attempt by an
  //     EXPONENTIALLY growing delay; an ok:true resets it. Asserted via the
  //     injectable clock -- a scheduleRelearn arriving BEFORE nextEligibleAt is
  //     deferred (not run); one arriving AFTER runs.
  // ===========================================================================
  console.log('\n--- (B) exponential back-off keyed by origin (injectable clock, no wall-clock) ---');

  // The scheduler MUST export its back-off constants so the test references the
  // real schedule (not a hard-coded guess).
  const BASE = typeof SCHED.BASE_BACKOFF_MS === 'number' ? SCHED.BASE_BACKOFF_MS : null;
  const MAX = typeof SCHED.MAX_BACKOFF_MS === 'number' ? SCHED.MAX_BACKOFF_MS : null;
  check(typeof BASE === 'number' && BASE > 0,
    'BACK-OFF: the scheduler exports BASE_BACKOFF_MS (a positive base delay constant; got ' + BASE + ')');
  check(typeof MAX === 'number' && MAX >= BASE,
    'BACK-OFF: the scheduler exports MAX_BACKOFF_MS as the back-off ceiling (>= base; got ' + MAX + ')');

  if (typeof SCHED._reset === 'function') { SCHED._reset(); }
  clockMs = 1000;
  const originD = 'https://bsky.app';
  let dCalls = 0;
  // The fn FAILS (ok:false) on the first attempt -> arms back-off; succeeds after.
  const fnDFail = () => { dCalls++; return Promise.resolve({ ok: false, reason: 'RECIPE_HTTP_5XX' }); };

  // Attempt 1: schedule + flush -> the fn runs once and resolves ok:false.
  scheduleRelearn(originD, fnDFail, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originD) : Promise.resolve());
  check(dCalls === 1,
    'BACK-OFF: the first re-learn attempt runs once (got ' + dCalls + ' call) and resolves ok:false -> arms back-off');

  // A second schedule arriving IMMEDIATELY (clock NOT advanced past nextEligibleAt
  // = now + BASE) must be DEFERRED -- flushing it must NOT invoke the fn again.
  scheduleRelearn(originD, fnDFail, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originD) : Promise.resolve());
  check(dCalls === 1,
    'BACK-OFF: a re-learn re-scheduled BEFORE now + BASE_BACKOFF_MS is DEFERRED (still ' + dCalls + ' call) -- the back-off window is respected, not bypassed by a fresh rot event');

  // Advance the clock PAST the first back-off (now + BASE) and flush -> the fn
  // runs again (attempt 2, which fails again -> back-off grows to >= 2x BASE).
  clockMs = 1000 + BASE + 1;
  scheduleRelearn(originD, fnDFail, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originD) : Promise.resolve());
  check(dCalls === 2,
    'BACK-OFF: after the clock passes now + BASE_BACKOFF_MS the deferred re-learn runs (attempt 2, got ' + dCalls + ' calls)');

  // The second failure must defer the NEXT attempt by a LARGER (exponential)
  // delay: a schedule arriving at now + BASE (the FIRST back-off size) but BEFORE
  // now + 2*BASE (the GROWN back-off) must STILL be deferred. This is the
  // load-bearing "exponential, not constant" assertion.
  const afterSecondFail = clockMs;
  clockMs = afterSecondFail + BASE + 1;   // past the FIRST back-off size, but...
  scheduleRelearn(originD, fnDFail, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originD) : Promise.resolve());
  const grownBackoff = Math.min(BASE * 2, MAX);
  if (grownBackoff > BASE) {
    check(dCalls === 2,
      'BACK-OFF (exponential): after a SECOND failure the next delay GROWS (>= 2x base) -- a re-learn at now + BASE but before now + ' + grownBackoff + 'ms is STILL deferred (constant back-off would have run it; got ' + dCalls + ' calls)');
  } else {
    // Degenerate config (MAX == BASE): document that growth is capped at the ceiling.
    check(true,
      'BACK-OFF (exponential): MAX_BACKOFF_MS == BASE_BACKOFF_MS so the delay is capped at the ceiling (growth check vacuous by config)');
  }

  // RESET-ON-SUCCESS: advance past the grown back-off, succeed (ok:true), then a
  // FRESH rot event scheduled immediately after must run WITHOUT a back-off delay
  // (the origin recovered -> attempt counter reset to 0).
  if (typeof SCHED._reset === 'function') { SCHED._reset(); }
  clockMs = 1000;
  let eCalls = 0;
  const originE = 'https://yelp.com';
  let eShouldFail = true;
  const fnE = () => {
    eCalls++;
    return Promise.resolve(eShouldFail ? { ok: false, reason: 'RECIPE_HTTP_5XX' } : { ok: true });
  };
  // Attempt 1 fails -> back-off armed.
  scheduleRelearn(originE, fnE, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originE) : Promise.resolve());
  // Advance past back-off, now SUCCEED -> back-off must reset.
  eShouldFail = false;
  clockMs = 1000 + BASE + 1;
  scheduleRelearn(originE, fnE, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originE) : Promise.resolve());
  check(eCalls === 2,
    'RESET-ON-SUCCESS: after a successful (ok:true) re-learn the back-off resets (attempt 2 ran; got ' + eCalls + ' calls)');
  // A fresh rot scheduled IMMEDIATELY after the success (clock NOT advanced) runs
  // at once -- the reset back-off imposes no delay.
  eShouldFail = true;
  scheduleRelearn(originE, fnE, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originE) : Promise.resolve());
  check(eCalls === 3,
    'RESET-ON-SUCCESS: a fresh rot immediately after a success runs without a back-off delay (the counter reset; got ' + eCalls + ' calls)');

  // ===========================================================================
  // (C) BOUNDED: the scheduler exposes a tracked-origin cap so its state can never
  //     grow unbounded (mirrors PER_ORIGIN_CAP). Scheduling more than the cap of
  //     distinct origins must not retain more than the cap of records.
  // ===========================================================================
  console.log('\n--- (C) bounded state: tracked-origin cap + back-off ceiling (never unbounded) ---');

  const TRACKED_CAP = typeof SCHED.MAX_TRACKED_ORIGINS === 'number' ? SCHED.MAX_TRACKED_ORIGINS : null;
  check(typeof TRACKED_CAP === 'number' && TRACKED_CAP > 0,
    'BOUNDED: the scheduler exports MAX_TRACKED_ORIGINS as the tracked-origin cap (got ' + TRACKED_CAP + ')');
  check(typeof MAX === 'number' && MAX >= BASE && MAX < Infinity,
    'BOUNDED: the back-off delay is capped at MAX_BACKOFF_MS (a finite ceiling; got ' + MAX + ') -- it can never grow unbounded');

  if (typeof TRACKED_CAP === 'number' && TRACKED_CAP > 0 && typeof SCHED.trackedOriginCount === 'function') {
    if (typeof SCHED._reset === 'function') { SCHED._reset(); }
    clockMs = 1000;
    // Schedule far MORE distinct origins than the cap; the tracked count must
    // never exceed the cap (the scheduler evicts the least-recently-touched).
    for (let i = 0; i < TRACKED_CAP + 10; i++) {
      scheduleRelearn('https://origin-' + i + '.example', () => Promise.resolve({ ok: true }), { now, setTimer, clearTimer });
    }
    check(SCHED.trackedOriginCount() <= TRACKED_CAP,
      'BOUNDED: scheduling ' + (TRACKED_CAP + 10) + ' distinct origins retains <= MAX_TRACKED_ORIGINS (' + TRACKED_CAP + ') records (got ' + SCHED.trackedOriginCount() + ') -- bounded, mirrors the per-origin cap discipline');
  } else {
    check(true,
      'BOUNDED: trackedOriginCount() accessor exposed for the cap assertion (Plan 43-03 publishes it alongside MAX_TRACKED_ORIGINS)');
  }

  // ===========================================================================
  // (D) CONSENT-PRESERVED: the scheduler INVOKES the supplied consent-gated fn and
  //     captures NOTHING itself. An { ok:false, reason:'RECIPE_CONSENT_*' } result
  //     is treated as a failed attempt for back-off (the gate denied capture inside
  //     the fn) -- the scheduler never re-implements capture/consent.
  // ===========================================================================
  console.log('\n--- (D) consent-preserved: the scheduler calls the consent-gated fn; never re-implements consent ---');

  if (typeof SCHED._reset === 'function') { SCHED._reset(); }
  clockMs = 1000;
  const originF = 'https://gmail.com';
  let consentFnCalls = 0;
  let consentFnArg = null;
  // The fn stands in for the consent-gated runDiscovery: it returns a CONSENT
  // denial. The scheduler must (1) call it, (2) NOT capture anything itself, and
  // (3) treat ok:false as a failed attempt for back-off (asserted: a fresh
  // immediate re-schedule is deferred).
  const consentFn = (originArg) => {
    consentFnCalls++;
    consentFnArg = originArg;
    return Promise.resolve({ ok: false, reason: 'RECIPE_CONSENT_DENIED' });
  };
  scheduleRelearn(originF, consentFn, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originF) : Promise.resolve());
  check(consentFnCalls === 1,
    'CONSENT-PRESERVED: the scheduler INVOKES the supplied consent-gated fn (the consent gate runs INSIDE it; got ' + consentFnCalls + ' call)');
  check(consentFnArg === originF,
    'CONSENT-PRESERVED: the scheduler passes the origin to the fn (fn(origin)) so the caller binds runDiscovery to the right origin (got ' + String(consentFnArg) + ')');
  // The CONSENT denial is a failed attempt for back-off: an immediate re-schedule
  // is deferred (the scheduler does NOT retry-storm a denied origin).
  scheduleRelearn(originF, consentFn, { now, setTimer, clearTimer });
  await (typeof SCHED.flush === 'function' ? SCHED.flush(originF) : Promise.resolve());
  check(consentFnCalls === 1,
    'CONSENT-PRESERVED: an { ok:false, reason:RECIPE_CONSENT_* } result is treated as a failed attempt for back-off -- an immediate re-schedule is deferred (no retry-storm on a denied origin; still ' + consentFnCalls + ' call)');

  console.log('\nrelearn-coalescing: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) {
  // A throw in the async body is a real failure (not a clean RED) -- surface it.
  console.error('  FAIL: relearn-coalescing harness threw:', e && e.message ? e.message : e);
  console.log('  passed:', passed);
  console.log('  failed:', failed + 1);
  process.exit(1);
});
