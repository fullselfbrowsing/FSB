---
phase: 43-catalog-scale-milestone-gate
plan: 01
subsystem: self-heal-test-scaffolds
tags: [SCALE-01, SCALE-02, wave-0, red-first, self-heal, scale-gate]
requires:
  - tests/capability-rot-detector.test.js (the zero-framework RED-first pattern)
  - extension/utils/learned-recipe-store.js (the seam the recurrence/degraded contracts pin)
  - extension/utils/capability-rot-detector.js (the UNCHANGED verdict the recurrence layer consumes)
provides:
  - tests/relearn-coalescing.test.js (RED-first N->1 coalescing + back-off contract)
  - tests/rot-recurrence-classify.test.js (RED-first systemic-vs-transient recurrence contract)
  - tests/app-degraded-surfacing.test.js (RED-first degraded/needs-re-port accessor contract)
  - the 3 self-heal tests registered in the npm test chain (the milestone gate runs them)
  - the confirmed SCALE-01 scale gate (full-corpus-scale.test.js) position + budget
affects:
  - Plan 43-03 (implements the scheduler + recurrence + degraded accessor against these contracts)
tech-stack:
  added: []
  patterns:
    - zero-framework RED-first scaffolds (MODULE_NOT_FOUND / absent-export -> one deterministic exit-1)
    - injectable now()/clock + flush seam for synchronous back-off assertion (no wall-clock)
    - chrome.storage.local stub for sync-mirror population (learned-recipe-store.test.js idiom)
key-files:
  created:
    - tests/relearn-coalescing.test.js
    - tests/rot-recurrence-classify.test.js
    - tests/app-degraded-surfacing.test.js
  modified:
    - package.json (3 self-heal tests appended to the test chain after capability-rot-detector)
decisions:
  - "The scheduler export seam Plan 43-03 must publish: FsbRelearnScheduler / scheduleRelearn(origin, fn, opts) + flush(origin) + _reset() + BASE_BACKOFF_MS + MAX_BACKOFF_MS + MAX_TRACKED_ORIGINS + trackedOriginCount()"
  - "The recurrence seam Plan 43-03 must publish on FsbLearnedRecipeStore: recordRot(origin, slug) + dispositionFor(origin, slug) + recordOk(origin, slug) (or resetRot) + RECURRENCE_SYSTEMIC_THRESHOLD + RECURRENCE_CAP (or reuse PER_ORIGIN_CAP) + recurrenceTrackedCount()"
  - "The degraded seam Plan 43-03 must publish on FsbLearnedRecipeStore: getOriginHealth(origin) -> { degraded, status, origin } where status is 'ok' (healthy) / 'needs-re-port' (degraded)"
metrics:
  duration: ~5 min
  completed: 2026-06-26
---

# Phase 43 Plan 01: Self-Heal Test Scaffolds + Scale-Gate Confirm Summary

Authored the three SCALE-02 self-heal RED-first contract tests (per-origin re-learn
coalescing/back-off, recurrence-based systemic-vs-transient, app-level degraded surfacing)
BEFORE the scheduler/recurrence/degraded code exists, registered all three in the `npm test`
chain so the milestone gate runs them, and confirmed `full-corpus-scale.test.js` is already
the authoritative SCALE-01 scale gate at budget (1.371MB / 11.5ms / 621B / 2314 descriptors).

## What Shipped

### Three RED-first self-heal test files

| File | npm test position | Lines | RED reason (clean Wave-0) |
|------|-------------------|-------|----------------------------|
| `tests/relearn-coalescing.test.js` | 199 of 223 | 326 | `relearn-scheduler.js` MODULE_NOT_FOUND |
| `tests/rot-recurrence-classify.test.js` | 200 of 223 | 288 | store has no `recordRot`/`dispositionFor` export |
| `tests/app-degraded-surfacing.test.js` | 201 of 223 | 232 | store has no `getOriginHealth` export |

All three are placed right after `capability-rot-detector.test.js` (position 198) and before
`import-extraction.test.js`. Each exits 1 cleanly (a single deterministic non-crash failure),
which is the CORRECT Wave-0 state -- the module/exports they require are created in Plan 43-03.

### The export names each RED test requires (so Plan 43-03 publishes EXACTLY these)

**`relearn-coalescing.test.js` -> `extension/utils/relearn-scheduler.js`:**
- `FsbRelearnScheduler` (global) + `module.exports`
- `scheduleRelearn(origin, fn, opts)` -- the entry point
- `flush(origin)` -- the deterministic test-seam that runs the due re-learn (returns a promise)
- `_reset()` -- clears the tracked-origin map
- `BASE_BACKOFF_MS`, `MAX_BACKOFF_MS` -- named back-off constants (base + ceiling)
- `MAX_TRACKED_ORIGINS` -- the tracked-origin cap (bound)
- `trackedOriginCount()` -- the bound assertion accessor
- `opts` seams: `opts.now` (clock), `opts.setTimer`/`opts.clearTimer` (injectable timers)

**`rot-recurrence-classify.test.js` -> additive on `extension/utils/learned-recipe-store.js`:**
- `recordRot(origin, slug)` -- broken-only counter increment
- `dispositionFor(origin, slug)` -> `'transient'` (below threshold) / `'systemic'` (at/above)
- `recordOk(origin, slug)` (preferred) or `resetRot(origin, slug)` -- reset-on-success
- `RECURRENCE_SYSTEMIC_THRESHOLD` (>= 2) -- the documented threshold constant
- `RECURRENCE_CAP` (or reuse `PER_ORIGIN_CAP`) + `recurrenceTrackedCount()` -- the bound
- `_reset()` extended to ALSO clear the recurrence store

**`app-degraded-surfacing.test.js` -> additive on `extension/utils/learned-recipe-store.js`:**
- `getOriginHealth(origin)` -> `{ degraded:boolean, status:string, origin:string }`
  - live origin -> `{ degraded:false, status:'ok', origin }`
  - all-quarantined origin -> `{ degraded:true, status:'needs-re-port', origin }`
  - unknown/un-hydrated origin -> `{ degraded:false }` (never throws)

### Confirmed SCALE-01 scale gate (no edit -- a grep-verified fact)

`tests/full-corpus-scale.test.js` is ALREADY in the `npm test` chain at position **222 of 223**
(second-to-last, before `no-orphan-descriptor`). It is the authoritative SCALE-01 scale gate.
Run directly it passes at the current budget:

- serialized index = **1404.1KB (1.371MB)** over **2314 descriptors** (< 2MB budget)
- **621.4 bytes/descriptor** FLAT (< 700 -- the real params-leak regression signal)
- cold-start loadJSON + first search = **11.53ms** (best of 5) (< 100ms SW-wake budget)
- 2314 descriptors > 2000 (full-corpus, not a smoke slice)
- 8 passed, 0 failed

## Contract Design Notes (for Plan 43-03)

- The coalescing test uses an injectable `now()` clock + a no-op `setTimer`/`clearTimer` pair +
  a `flush(origin)` seam so the back-off schedule is asserted SYNCHRONOUSLY (no setTimeout race,
  the suite runs < 5s with no watch flags). The scheduler MUST honor `opts.now` for every timing
  decision and expose `flush` to run the due re-learn on demand.
- The back-off contract is "exponential, NOT constant": after a SECOND failure, a re-schedule
  arriving at `now + BASE` (the first back-off size) but before `now + 2*BASE` (the grown size)
  must STILL be deferred. A constant back-off would run it -- that is the discriminating assertion.
- The recurrence test loads the REAL `classifyRecipeBroken` (jmespath + interpreter planted as in
  `capability-rot-detector.test.js`) so the recurrence layer is fed the SAME `{ broken, code }`
  verdict shape the runtime produces -- never a hand-rolled stand-in. The taxonomy stays UNCHANGED.
- T-32-PASS guard: a typed `RECIPE_ORIGIN_MISMATCH` / `RECIPE_CONSENT_REQUIRED` is `broken:false`,
  so `recordRot` (broken-only) must never count it -- the recurrence layer can never escalate a
  security rejection into a systemic quarantine.
- The degraded test drives a `chrome.storage.local` stub so `promote`/`quarantine` populate the
  sync mirror `getOriginHealth` reads (the same `_syncMirror` source `getLearnedSync` uses).

## Deviations from Plan

None - plan executed exactly as written. All three tasks landed their contracts, all three RED
files exit 1 cleanly, all three + the scale gate are confirmed in the npm test chain.

## Self-Check: PASSED

- tests/relearn-coalescing.test.js: FOUND (exits 1, clean RED)
- tests/rot-recurrence-classify.test.js: FOUND (exits 1, clean RED)
- tests/app-degraded-surfacing.test.js: FOUND (exits 1, clean RED)
- package.json: all three + full-corpus-scale.test.js present in test chain
- Commits: 395df4ae, 5d61712f, 9988aba4 all present
