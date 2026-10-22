---
phase: 36-codegen-pipeline-no-dead-entry-resolution
plan: 02
subsystem: api
tags: [capability-router, capability-catalog, no-dead-entry, descriptor-fallback, T3-DOM, T2-learn, FsbRecipeIndex]

# Dependency graph
requires:
  - phase: 36-01
    provides: "the emitted opentabs__todoist__*.json descriptor corpus (flat catalog/descriptors/*.json with backing:'dom') + the no-dead-entry.test.js stub"
  - phase: 29 (v0.9.99 substrate)
    provides: "capability-catalog.js resolve() + REGISTRY + the typeof-guarded _search/_getRecipeBySlug accessor pattern; capability-router.js invoke() switch(entry.tier) that already maps T3->RECIPE_DOM_FALLBACK_PENDING / T2(no-recipe)->RECIPE_LEARN_PENDING / default->RECIPE_NOT_FOUND"
provides:
  - "resolve() descriptor-only no-dead-entry fallback: a searchable slug (in FsbRecipeIndex.descriptors, no REGISTRY handler, no recipe) -> {tier:'T3'} (backing:'dom'/absent) or {tier:'T2'} (backing:'learn'), never null/RECIPE_NOT_FOUND"
  - "_recipeIndex()/_getDescriptor(slug) typeof-guarded accessors reading FsbRecipeIndex.descriptors directly (Option A; one-file change)"
  - "tests/no-dead-entry.test.js: the CGEN-03 invariant harness (every searchable slug -> non-null seam tier; unknown -> null) over the REAL emitted corpus"
  - "tests/capability-router.test.js: the Pitfall-3 sibling proof (descriptor-only invoke -> typed seam reason via the REAL resolve(), never RECIPE_NOT_FOUND)"
affects: [37-breadth-a, 38-breadth-b, 39-breadth-c, 42-discovery-seeding, 43-catalog-scale]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decouple discoverable from invocable: a descriptor is searchable the moment it lands; resolve()'s fallback guarantees an actionable typed seam reason (T3/T2) instead of a dead RECIPE_NOT_FOUND"
    - "Decision B seam signal: desc.backing === 'learn' ? 'T2' : 'T3' read directly off the descriptor (no Phase-42 seed-source dependency); T2 carries NO recipe (never fabricate a credentialed call)"
    - "Test against the REAL emitted corpus + the REAL resolve(): the harness loads the same opentabs__todoist__*.json set package-extension inlines, and the router proof loads the actual capability-catalog.js (not the in-memory stub) so it exercises the live fallback end-to-end"

key-files:
  created:
    - tests/no-dead-entry.test.js
  modified:
    - extension/utils/capability-catalog.js
    - tests/capability-router.test.js

key-decisions:
  - "Used desc.backing === 'learn' ? 'T2' : 'T3' directly in the branch (the ARCHITECTURE Decision-B contract) rather than the RESEARCH's tentative _isSeededOrigin helper -- the plan's must_haves + Task-1 action mandate the backing form, and it needs no Phase-42 seed source; the T2 leg is proven by a synthetic backing:'learn' fixture"
  - "Option A accessor: _getDescriptor reads FsbRecipeIndex.descriptors directly (capability-search.js exports no getDescriptorBySlug), keeping the load-bearing change to ONE file"
  - "The router descriptor-only proof loads the REAL capability-catalog.js as globalThis.FsbCapabilityCatalog (every other router block uses an in-memory stub) so it drives the actual resolve() fallback -- this is the genuine Pitfall-3 proof, not a re-assertion of the stub"

patterns-established:
  - "No-dead-entry invariant: every slug search_capabilities can surface MUST resolve() to a non-null tier in {T0,T1a,T1b,T2,T3}; a CI harness asserts it over the live corpus + a negative control (unknown -> null)"
  - "EXACT seam-tier literals: the fallback returns exactly 'T2'/'T3' so the router's UNCHANGED switch maps them; any other string hits default -> RECIPE_NOT_FOUND (the bug)"

requirements-completed: [CGEN-03]

# Metrics
duration: 8min
completed: 2026-06-24
---

# Phase 36 Plan 02: resolve() No-Dead-Entry Fallback Summary

**The single load-bearing runtime edit (CGEN-03): capability-catalog.js resolve() gains a descriptor-only fallback so a searchable-but-unbacked slug resolves to {tier:'T3'} (DOM) by default or {tier:'T2'} (learn) when backing:'learn', proven by a corpus-wide no-dead-entry harness and a router invoke proof that the seam reason is RECIPE_DOM_FALLBACK_PENDING / RECIPE_LEARN_PENDING, never RECIPE_NOT_FOUND -- zero router edits.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-24T17:05Z
- **Completed:** 2026-06-24T17:13Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- **The fallback branch (Task 1):** replaced the bare `if (!entry) return null;` in `resolve()` with a single descriptor-only branch -- `_getDescriptor(slug)` (a typeof-guarded read of `FsbRecipeIndex.descriptors`, mirroring `_search`/`_getRecipeBySlug`) -> `{tier: desc.backing === 'learn' ? 'T2' : 'T3', descriptor}` with NO recipe field; a genuinely-unknown slug still returns null. Added `_recipeIndex()`/`_getDescriptor()` module-level accessors.
- **The no-dead-entry harness (Task 2):** `tests/no-dead-entry.test.js` loads the REAL emitted 7-descriptor todoist corpus (the same flat set `package-extension` inlines) + a synthetic `backing:'learn'` descriptor, sets `FsbRecipeIndex`, requires the catalog, and asserts every searchable slug -> a non-null seam tier in `{T0,T1a,T1b,T2,T3}`; `backing:'dom'` -> T3, `backing:'learn'` -> T2 (no recipe); negative control: an out-of-corpus slug -> null. Passes 9/0.
- **The router invoke proof (Task 2):** extended `tests/capability-router.test.js` (not rewritten) with a block that loads the REAL `capability-catalog.js` (not the in-memory stub) with `FsbRecipeIndex.descriptors` populated and drives an actual `invoke` -- a descriptor-only slug -> dual-field `RECIPE_DOM_FALLBACK_PENDING` (backing:'learn' -> `RECIPE_LEARN_PENDING`), explicitly asserted NOT `RECIPE_NOT_FOUND`; an unknown slug still -> `RECIPE_NOT_FOUND`. Router went 41 -> 46 checks, zero regressions.
- **Zero router edits + Wall-1 clean:** the router's `switch(entry.tier)` is untouched (it already maps T3/T2 to the typed reasons); the edit is a pure typeof-guarded read so `capability-catalog.js` stays on the recipe-path-guard allowlist (`verify-recipe-path-guard.mjs` green; `validate:extension` exits 0).

## Task Commits

Each task was committed atomically (branch `automation`, hooks on, no AI attribution):

1. **Task 1: resolve() descriptor-only no-dead-entry fallback + _getDescriptor accessor** - `2624c545` (feat)
2. **Task 2: no-dead-entry harness + router descriptor-only invoke proof** - `7e0aecc5` (test)

_Note: Task 1 was TDD -- the RED step was an ephemeral inline node assertion (proven failing pre-edit: resolve() returned null for descriptor-only slugs; `RED CONFIRMED -- FAIL {"dom":null,"learn":null,"unk":null}`); the durable RED->GREEN proof lives in Task 2's committed harness, so Task 1 is a single GREEN feat commit._

## Files Created/Modified
- `extension/utils/capability-catalog.js` - Added `_recipeIndex()`/`_getDescriptor(slug)` accessors next to `_search`/`_getRecipeBySlug`; replaced `if (!entry) return null;` in `resolve()` with the descriptor-only fallback branch (`backing:'learn' ? 'T2' : 'T3'`, no recipe; unknown -> null). +53 lines.
- `tests/no-dead-entry.test.js` - Replaced the Plan-01 stub with the Mechanic-3 invariant harness over the REAL emitted corpus + a synthetic learn descriptor + a negative control. (already registered in package.json -- untouched.)
- `tests/capability-router.test.js` - Extended with the Pitfall-3 sibling proof driving the REAL resolve() fallback through `invoke` (5 new assertions); added a `CATALOG_PATH` const. Existing assertions unchanged.

## Decisions Made
- **`desc.backing === 'learn' ? 'T2' : 'T3'` (not `_isSeededOrigin`):** 36-RESEARCH Mechanic 3 floated an `_isSeededOrigin` helper but then recommended the direct `backing` form (no Phase-42 seed source exists this phase); the plan's `must_haves` + Task-1 `<action>` mandate the `backing` form. The T2 leg is exercised by a synthetic `backing:'learn'` descriptor since all 7 shipped smoke descriptors are `backing:'dom'`.
- **Option A `_getDescriptor` (direct `FsbRecipeIndex.descriptors` read):** `capability-search.js` exports no `getDescriptorBySlug`, so reading the generated global directly keeps the load-bearing change to ONE file (the plan's explicit recommendation).
- **Router proof loads the REAL catalog:** every existing router block installs an in-memory `FsbCapabilityCatalog` stub; the new block loads the actual `capability-catalog.js` so it proves the live `resolve()` fallback end-to-end (the genuine Pitfall-3 proof), with prior `FsbRecipeIndex`/`FsbCapabilityCatalog` globals saved and restored around the block.

## Deviations from Plan

None - plan executed exactly as written. No deviation rules (1-4) triggered; no auth gates; no architectural changes. The one judgment call (the `_isSeededOrigin` vs `backing` form) was already resolved by the plan in favor of the `backing` form, which I followed.

## Issues Encountered
None. The descriptor-only `app.todoist.com` write reaches the T3 seam without being blocked by the consent gate (todoist is non-sensitive; the seam reason is returned regardless of the consent decision), so the router proof passed first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **CGEN-03 is closed:** the no-dead-entry invariant is now enforced by `tests/no-dead-entry.test.js`. The moment Phases 37-39 land the ~2,523 breadth descriptors, the SAME harness (re-run over the grown corpus) proves none is a searchable-but-uninvocable dead entry -- each new descriptor inherits the T3 (or T2 when Phase 42 stamps `backing:'learn'`) seam automatically.
- **Phase 42 (Discovery Seeding) hook:** when seeds land, stamping a descriptor `backing:'learn'` flips its resolve() to the T2 (learn-pending) leg with zero further catalog changes -- the branch already reads the flag.
- **Phase 43 (scale) note documented in code:** at full scale, memoize a `slug->descriptor` map in `_getDescriptor` (the descriptors array is static post-load) to replace the smoke-scale linear scan.
- **No blockers.** `node tests/no-dead-entry.test.js` (9/0), `node tests/capability-router.test.js` (46/0), `node scripts/verify-recipe-path-guard.mjs`, and `npm run validate:extension` all exit 0.

## Self-Check: PASSED

- `extension/utils/capability-catalog.js` - FOUND (modified, contains `_getDescriptor`)
- `tests/no-dead-entry.test.js` - FOUND (real harness, 9/0)
- `tests/capability-router.test.js` - FOUND (extended, 46/0)
- Commit `2624c545` (Task 1) - FOUND
- Commit `7e0aecc5` (Task 2) - FOUND

---
*Phase: 36-codegen-pipeline-no-dead-entry-resolution*
*Completed: 2026-06-24*
