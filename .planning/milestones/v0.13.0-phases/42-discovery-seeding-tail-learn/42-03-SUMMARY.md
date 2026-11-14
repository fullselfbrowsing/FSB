---
phase: 42-discovery-seeding-tail-learn
plan: 03
subsystem: api
tags: [capability-catalog, resolve, seed, tier, learn-pending, discovery-seeds]

requires:
  - phase: 42-discovery-seeding-tail-learn
    provides: 42-02 (FsbNetworkCapture.getSeedForOrigin seed accessor)
provides:
  - "capability-catalog.js resolve() seed->T2 branch in the descriptor-only fallback (+ _seedForOrigin accessor)"
  - "tests/seed-resolve-t2.test.js (seeded->T2 / unseeded->T3 / learned-first / no-fabrication / backing:learn leg)"
affects: [42-04-affordance, 42-05-battery]

tech-stack:
  added: []
  patterns:
    - "Resolve-time seed lookup: a would-be-T3 descriptor on a seeded origin upgrades to T2 (NO recipe) via a branch, never a descriptor re-stamp or data-shape change (INV-01)"

key-files:
  created:
    - tests/seed-resolve-t2.test.js
  modified:
    - extension/utils/capability-catalog.js

key-decisions:
  - "Default to the resolve-time seed lookup (CONTEXT discretion) so descriptors + the INV-01 catalog/djb2 shape are untouched"
  - "The seed branch sits in the no-entry descriptor-only fallback, AFTER the LEARN-04 learned-first check, so a learned T2 still outranks on the next visit"
  - "T2-seed carries NO recipe field -- the router's RECIPE_LEARN_PENDING leg fires (never fabricate a credentialed call from a seed)"

patterns-established:
  - "Pattern: _seedForOrigin(origin) typeof-guarded accessor parallel to _getLearned/_getDescriptor"

requirements-completed: [DSEED-01]

duration: 1min
completed: 2026-06-26
---

# Phase 42 Plan 03: resolve() Seed->T2 Branch Summary

**A seeded-origin descriptor that would resolve T3-DOM now resolves T2 (learn-pending) with NO recipe via a minimal resolve-time seed lookup, so the seeded tail upgrades onto the learn path — while an unseeded origin stays T3, the LEARN-04 learned-first check still outranks, and the INV-01 catalog/djb2 shape is untouched.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-06-26T19:47:35Z
- **Completed:** 2026-06-26T19:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `capability-catalog.js`: a `_seedForOrigin(origin)` accessor (parallel to `_getLearned`/`_getDescriptor`, typeof-guarded over `FsbNetworkCapture.getSeedForOrigin`) + the seed->T2 branch in the no-entry descriptor-only fallback. A would-be-T3 descriptor (backing 'dom'/absent) whose origin is seeded resolves `{ tier:'T2', descriptor }` with **NO recipe field**; an unseeded origin stays `{ tier:'T3', descriptor }`.
- The LEARN-04 learned-first check (lines 316-332) is byte-unchanged — a learned T2 returns its recipe BEFORE the seed branch is ever reached (the seed branch only runs in the no-learned fallback).
- `tests/seed-resolve-t2.test.js` (12/12 GREEN): seeded->T2 (no recipe), unseeded->T3, backing:'learn'->T2 via the existing leg, unknown slug->null, and learned-first outranks with the learned recipe.

## Task Commits

1. **Task 1: resolve() seed->T2 branch + _seedForOrigin** - `cee03790` (feat)
2. **Task 2: seed-resolve-t2 test** - `f7044ade` (test)

## Files Created/Modified
- `extension/utils/capability-catalog.js` - `_seedForOrigin` accessor + the seed->T2 branch in resolve()'s descriptor-only fallback (the `else -> T3` case)
- `tests/seed-resolve-t2.test.js` - the seeded->T2 / unseeded->T3 / learned-first / no-fabrication proof

## Reference for Plan 04
- The seed->T2 leg carries **NO recipe field**, so Plan 04's affordance assumes the T2-no-recipe leg (`entry.recipe` is undefined -> the router's `RECIPE_LEARN_PENDING` branch fires).
- The resolve branch location: the no-entry descriptor-only fallback in `resolve()`; the `_seedForOrigin` accessor sits next to `_getLearned`/`_getDescriptor`.
- No recipe is fabricated (confirmed by the test's `!('recipe' in seeded)` assertion).

## Decisions Made
- Resolve-time seed lookup (not a `backing:'learn'` re-stamp at import) per the CONTEXT discretion default — keeps descriptors + the catalog data shape untouched.
- The seed branch only fires for a PRESENT descriptor; a genuinely-unknown slug still returns null (RECIPE_NOT_FOUND), so search-surfaceable-but-uninvocable semantics are preserved.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Plan 04 (the RECIPE_LEARN_PENDING affordance) consumes the T2-no-recipe leg this plan produces.
- INV-01 (catalog-inline-shape, no-dead-entry) + learned-t2-outranking remain GREEN — the seed branch is purely additive.

---
*Phase: 42-discovery-seeding-tail-learn*
*Completed: 2026-06-26*

## Self-Check: PASSED

All files exist; both task commits (cee03790, f7044ade) present.
