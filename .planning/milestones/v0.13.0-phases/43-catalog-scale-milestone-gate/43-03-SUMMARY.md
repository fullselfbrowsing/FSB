---
phase: 43-catalog-scale-milestone-gate
plan: 03
subsystem: self-heal-scheduler-impl
tags: [SCALE-02, self-heal, coalescing, back-off, recurrence, degraded-surfacing, additive]
requires:
  - tests/relearn-coalescing.test.js (the RED contract from 43-01)
  - tests/rot-recurrence-classify.test.js (the RED contract from 43-01)
  - tests/app-degraded-surfacing.test.js (the RED contract from 43-01)
  - extension/utils/learned-recipe-store.js (the substrate the recurrence/degraded attach to)
  - extension/utils/discovery-session.js (the consent-gated runDiscovery the scheduler invokes)
provides:
  - extension/utils/relearn-scheduler.js (per-origin coalescing + exponential back-off, additive, bounded, consent-preserving)
  - additive recordRot/dispositionFor/recordOk/recurrenceTrackedCount on the learned store (systemic-vs-transient)
  - additive getOriginHealth(origin) degraded/needs-re-port accessor on the learned store
  - SW importScripts wiring for relearn-scheduler.js (off the recipe-path allowlist by construction)
affects:
  - Plan 43-04 (the milestone gate asserts the 3 self-heal tests green)
tech-stack:
  added: []
  patterns:
    - dual-export IIFE module shell (mirrors learned-recipe-store.js)
    - injectable now()/setTimer/clearTimer + flush seam for deterministic back-off assertion
    - null-proto bounded in-memory maps with LRU eviction (mirrors _syncMirror + PER_ORIGIN_CAP)
key-files:
  created:
    - extension/utils/relearn-scheduler.js
  modified:
    - extension/utils/learned-recipe-store.js (additive recurrence counter + getOriginHealth)
    - extension/background.js (additive importScripts after discovery-session.js)
decisions:
  - "The scheduler is NOT named capability-* (it only schedules a consent-gated fn call, never binds/executes a recipe) so it is off the recipe-path allowlist by construction -- Wall-1 holds with no allowlist edit"
  - "No router-side adoption: relearn-coalescing.test.js pins only the scheduler module's own coalescing behavior (per 43-01's interface note), so capability-router.js _quarantineAndRelearn is UNTOUCHED -- the router-side route-through is a confirmed-by-milestone-gate follow-up, not in this plan's scope"
  - "The recurrence counter + getOriginHealth are in-memory + bounded (like _syncMirror), not persisted -- a fresh SW restart re-accumulates (the conservative direction: a restart never carries a stale systemic verdict)"
  - "Scheduler constants: COALESCE_WINDOW_MS=2000, BASE_BACKOFF_MS=5000, MAX_BACKOFF_MS=300000 (5min ceiling), MAX_TRACKED_ORIGINS=64; recurrence: RECURRENCE_SYSTEMIC_THRESHOLD=3, RECURRENCE_CAP=PER_ORIGIN_CAP(24)"
metrics:
  duration: ~6 min
  completed: 2026-06-26
---

# Phase 43 Plan 03: SCALE-02 Self-Heal Implementation Summary

THE NET-NEW SELF-HEAL. Turned the three 43-01 RED contracts GREEN by building the per-origin
re-learn coalescing/back-off scheduler, the per-(origin,slug) recurrence-based
systemic-vs-transient counter, and the app-level degraded/needs-re-port accessor -- ALL additive,
bounded, consent-gated, and fail-safe atop the shipped Phase-32 self-heal substrate.

## What Shipped

### `extension/utils/relearn-scheduler.js` (NET-NEW, 305 lines)

The debounce layer for the thundering-herd: `capability-router.js _quarantineAndRelearn` fires
`discovery.runDiscovery(origin, { tabId })` FIRE-AND-FORGET on every broken verdict; at 119-app
scale one vendor changing site-wide rots N recipes on one origin -> N concurrent CDP attaches.
The scheduler coalesces those N into ONE consent-gated re-learn per origin.

- **COALESCING:** `scheduleRelearn(origin, fn, opts)` called N times for one origin within the
  coalescing window (`COALESCE_WINDOW_MS=2000`) collapses to ONE fn invocation. Keyed by origin;
  distinct origins are independent.
- **BACK-OFF:** exponential, keyed by origin -- `BASE_BACKOFF_MS=5000`, doubled per failed attempt,
  capped at `MAX_BACKOFF_MS=300000` (5 min). A re-schedule arriving before `nextEligibleAt` is
  deferred; an ok:true resets the attempt counter. Computed against an injectable `opts.now`/clock
  + a `flush(origin)` seam so the schedule is asserted SYNCHRONOUSLY (no wall-clock, suite < 5s).
- **BOUNDED:** `MAX_TRACKED_ORIGINS=64` with LRU eviction (least-recently-touched) + the finite
  back-off ceiling -- state can never grow unbounded. `trackedOriginCount()` exposes the bound.
- **CONSENT-PRESERVING + FAIL-SAFE:** invokes only the supplied `fn(origin)` (the caller passes the
  consent-gated runDiscovery bound to the origin) -- never re-implements capture/consent. An ok:false
  (e.g. RECIPE_CONSENT_*) / throw / rejection is treated as a failed attempt for back-off; the
  scheduler captures NOTHING itself.
- **Wall-1 by construction:** NOT named capability-*.js, dynamic-code-FREE, dual-export IIFE.

### Additive recurrence counter + degraded accessor on `learned-recipe-store.js`

PURELY ADDITIVE (the envelope/cap/LRU/quarantine/getLearnedSync/promote contract is byte-unchanged;
`git diff` confirms the only edits are the `_reset` body + the exportsObj additions):

- **`recordRot(origin, slug)`** -- the broken-only recurrence increment; **`dispositionFor(origin, slug)`**
  -> `'transient'` below `RECURRENCE_SYSTEMIC_THRESHOLD=3`, `'systemic'` at/above; **`recordOk(origin, slug)`**
  -> reset-on-success. Bounded by `RECURRENCE_CAP=PER_ORIGIN_CAP(24)` with LRU eviction; null-proto at
  both levels (the `_syncMirror` ME-03 discipline). The recurrence consumes the UNCHANGED
  `classifyRecipeBroken` verdict (a typed RECIPE_* security passthrough is broken:false and is NEVER
  counted -- T-32-PASS).
- **`getOriginHealth(origin)`** -> `{ degraded:false, status:'ok', origin }` for an origin with >=1 live
  non-quarantined recipe; `{ degraded:true, status:'needs-re-port', origin }` when all learned recipes
  are quarantined (or the only live ones crossed systemic). Reads the same synchronous `_syncMirror`
  `getLearnedSync` uses; never throws; an unknown/un-hydrated origin returns the defined healthy default.

### `extension/background.js` (additive importScripts)

One try/catch'd `importScripts('utils/relearn-scheduler.js')` after `discovery-session.js` (line 243).
No manifest/permission change.

## Gates GREEN

- `node tests/relearn-coalescing.test.js`: 16/0 (coalescing N->1, exponential back-off, bounded, consent-preserved)
- `node tests/rot-recurrence-classify.test.js`: 19/0 (transient/systemic threshold, reset-on-success, bounded, T-32-PASS)
- `node tests/app-degraded-surfacing.test.js`: 14/0 (healthy vs degraded/needs-re-port, visible-not-silent, additive-non-breaking)
- `node scripts/verify-recipe-path-guard.mjs`: PASS (relearn-scheduler.js NOT on the allowlist -- 9 capability
  modules unchanged; Wall-1 holds by construction)
- `npm run validate:extension`: exit 0 (validate-extension parses 287 JS files clean incl the new module;
  classification-gate / crosscheck / no-dup-stem / origin-class / no-orphan all green)
- Regression (UNCHANGED): `capability-rot-detector` (taxonomy), `capability-router` (executeBoundSpec/tier
  dispatch), `consent-chokepoint` + `consent-mutation-gate` (the consent gate), `learned-recipe-store` +
  `learned-t2-outranking` + `seed-resolve-t2` (cap/LRU/quarantine/getLearnedSync) -- all pass.

## Whether relearn-coalescing.test.js required router-side adoption

It did NOT -- as anticipated in 43-01's interface note, the RED test pins only the scheduler module's
OWN coalescing/back-off/bounded/consent-preserving behavior (it constructs its own spy fn and asserts the
scheduler's debounce of it). So `capability-router.js _quarantineAndRelearn` is UNTOUCHED. Nothing
router-side was wired; the consent gate, executeBoundSpec, and tier dispatch are byte-unchanged.

## Deviations from Plan

None - plan executed exactly as written. All three RED contracts turned GREEN with zero edits to the
test files; the additions are additive/bounded/consent-gated/fail-safe; the consent gate, executeBoundSpec,
tier dispatch, classifyRecipeBroken taxonomy, and per-origin cap/LRU/quarantine are all unchanged.

## Self-Check: PASSED

- extension/utils/relearn-scheduler.js: FOUND (scheduleRelearn + flush + _reset + constants)
- extension/utils/learned-recipe-store.js: FOUND (recordRot/dispositionFor/recordOk/getOriginHealth additive)
- extension/background.js: FOUND (importScripts('utils/relearn-scheduler.js') present)
- Commits: e7a35406 (scheduler), 44bdd2fa (recurrence+degraded), edf2c981 (SW wiring) all present
