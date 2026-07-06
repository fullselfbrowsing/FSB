---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
plan: 05
subsystem: api
tags: [minisearch, capability-catalog, capability-router, learned-recipes, declarative-replay, trusted-provenance]

# Dependency graph
requires:
  - phase: 31-01
    provides: "RECIPE_PATH_ALLOWLIST pre-arm for the capability-* modules; the Wave-0 RED suites (learned-search-add, learned-t2-outranking)"
  - phase: 31-03
    provides: "FsbLearnedRecipeStore (per-origin versioned store) with getLearned/promote/quarantine; the catalog _getLearned accessor target"
  - phase: 31-04
    provides: "the 'local' trusted-provenance exemption in capability-signature + capability-interpreter (the interpreter short-circuits to the synchronous bind for trustedProvenance:'local')"
  - phase: 28
    provides: "capability-search.js INDEX_OPTIONS / _ms / _slugToRecipe / buildOrRestore / _computeCatalogVersion snapshot under fsbCapabilityIndex"
  - phase: 29
    provides: "capability-catalog.js resolve (per-slug tier registry) + capability-router.js invoke + _runDeclarativeTier replay path + the T2 RECIPE_LEARN_PENDING stub"
provides:
  - "capability-search.js addLearnedRecipe(recipe, descriptor): mutates the ONE INDEX_OPTIONS MiniSearch index + the slug->recipe map and re-persists the fsbCapabilityIndex snapshot with a bumped catalogVersion (LEARN-03/D-14)"
  - "capability-catalog.js resolve() learned-first via _getLearned: a learned T2 recipe for the active origin outranks a generic T1b by resolve order (LEARN-04/D-15 Option A)"
  - "capability-router.js case 'T2' dispatches a learned recipe through _runDeclarativeTier with trustedProvenance:'local'; RECIPE_LEARN_PENDING stub fires only when none is attached"
  - "_runDeclarativeTier optional 6th interpretOpts param threaded into interpretRecipe (T0/T1b omit it -> the bare-core exempt-by-source head path stays byte-identical)"
affects: [31-06 (background.js capture-session glue calls synthesize + promoteAfterReplay; addLearnedRecipe consumes the synthesized descriptor), phase-32 (heals quarantined / flaggedForPhase32 learned recipes)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse-not-reconstruct on the single MiniSearch instance: addLearnedRecipe _ms.discard(slug) + _ms.add(doc) on the EXISTING INDEX_OPTIONS index (never a fresh index) so loadJSON never throws options-drift (Pitfall 5)"
    - "Snapshot version bump = content-hash over the grown descriptor set + a strictly monotonic learned-add suffix (guarantees the stored catalogVersion always differs, even on a re-promotion that adds no new slug)"
    - "Catalog Option A outranking: resolve checks the learned store FIRST (synchronous getLearnedSync), so learned wins by resolve order with NO router tie-break"
    - "Loader-vouch provenance threading: the router passes trustedProvenance:'local' as the LOADER's vouch (HI-01); the recipe payload never self-declares trust; T0/T1b omit the opts and stay exempt-by-source"

key-files:
  created: []
  modified:
    - "extension/utils/capability-search.js - addLearnedRecipe feeds the one index + slug map + bumped snapshot"
    - "extension/utils/capability-catalog.js - resolve learned-first; _getLearned accessor (getLearnedSync-backed)"
    - "extension/utils/capability-router.js - case 'T2' learned dispatch; _runDeclarativeTier interpretOpts thread"

key-decisions:
  - "_getLearned uses the store's SYNCHRONOUS getLearnedSync because resolve() is synchronous (the router reads the resolved recipe immediately); absent store/accessor degrades to null and resolve falls through to the REGISTRY (Phase-29 behavior preserved)"
  - "catalogVersion bump appends a strictly monotonic +learned<N> suffix so the stored snapshot version DIFFERS unconditionally (a content-hash alone could collide on a re-promotion of an already-counted slug)"
  - "addLearnedRecipe mutates _ms in place and re-snapshots via _ms.toJSON(); it NEVER constructs a second MiniSearch (the new MS( count stays 2: one comment, one buildIndex)"
  - "_runDeclarativeTier gains an OPTIONAL 6th param; the T0/T1b call sites pass nothing so interpretRecipe sees undefined opts -> the exempt-by-source bare-core path is byte-identical"

patterns-established:
  - "Pattern 1: Mutate the single INDEX_OPTIONS MiniSearch instance for incremental adds (discard-then-add for re-promotion safety); re-snapshot with a bumped version so the SW-restart restore includes the new entry"
  - "Pattern 2: Learned-first resolve order (Option A) realizes outranking purely at the catalog with no router tie-break logic"
  - "Pattern 3: Trusted-provenance is threaded by the LOADER as an interpret opt, never read from the payload (HI-01)"

requirements-completed: [LEARN-03, LEARN-04]

# Metrics
duration: 12min
completed: 2026-06-23
---

# Phase 31 Plan 05: Learned Recipes Search + Catalog/Router Wiring Summary

**addLearnedRecipe feeds the one MiniSearch index + slug map with a bumped snapshot, and catalog resolve checks the per-origin learned store FIRST so a learned T2 recipe outranks a generic T1b and dispatches through _runDeclarativeTier with the 'local' provenance vouch.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-23 (single sequential session)
- **Completed:** 2026-06-23
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- **LEARN-03 / D-14:** `capability-search.js` `addLearnedRecipe(recipe, descriptor)` mutates the EXISTING `_ms` (built with `INDEX_OPTIONS`) and wires `_slugToRecipe[recipe.id]` — the learned slug is findable via `search()` AND `getRecipeBySlug` on this and the next visit. It re-persists the `fsbCapabilityIndex` snapshot with a BUMPED `catalogVersion`, and a simulated SW-restart `loadJSON(snapshot, INDEX_OPTIONS)` does NOT throw "same options" (Pitfall 5) — the learned entry survives the restore.
- **LEARN-04 / D-15 (Option A):** `capability-catalog.js` `resolve(slug, origin)` checks `_getLearned(slug, origin)` BEFORE the REGISTRY, so a learned T2 recipe for the active origin OUTRANKS a generic T1b for the same slug by resolve order — origin-scoped (a different origin falls through to the generic tier, Pitfall 6).
- **Router T2 dispatch:** `capability-router.js` `case 'T2'` now dispatches an attached learned recipe through `_runDeclarativeTier(..., { trustedProvenance: 'local' })`; the `RECIPE_LEARN_PENDING` stub fires ONLY when no learned recipe is attached. `_runDeclarativeTier` gained an optional 6th `interpretOpts` param threaded into `interpretRecipe`; T0/T1b omit it so the bare-core exempt-by-source head path is byte-identical.
- Both Wave-0 RED suites turned GREEN; the eval/router/head/mcp-surface/autopilot/iterator regression suites all stay GREEN; all three files remain dynamic-code-free (the recipe-path guard PASSES).

## Task Commits

Each task was committed atomically:

1. **Task 1: addLearnedRecipe on capability-search.js (feed the one index + slug map + re-snapshot)** - `71c6d3b6` (feat)
2. **Task 2: catalog resolve learned-first (_getLearned) + router T2 learned dispatch (trustedProvenance:'local')** - `9ac23967` (feat)

**Plan metadata:** see the final `docs(31-05)` commit.

_Note: the Wave-0 RED test commits for both suites landed in an earlier wave; these two GREEN commits turn them green._

## Files Created/Modified
- `extension/utils/capability-search.js` - Added `addLearnedRecipe(recipe, descriptor)` (mutates `_ms` + `_slugToRecipe`, bumped snapshot), `_learnedDescriptors` + `_learnedAddSeq` bookkeeping, export entry.
- `extension/utils/capability-catalog.js` - Added `_learnedStore()` + `_getLearned(slug, origin)` accessors; prepended a learned-first check to `resolve`; exposed `_getLearned` on the export object.
- `extension/utils/capability-router.js` - Added an optional 6th `interpretOpts` param to `_runDeclarativeTier`, threaded into `interpretRecipe`; replaced the `case 'T2'` stub with the learned-dispatch-or-stub.

## Decisions Made
- **`_getLearned` is synchronous (uses `getLearnedSync`):** `resolve()` is synchronous and the router reads the resolved recipe immediately, so an async `getLearned()` cannot surface a recipe inside `resolve`. The accessor degrades to `null` when the store or its sync accessor is absent — `resolve` then falls through to the REGISTRY exactly as in Phase 29.
- **Monotonic snapshot-version suffix:** the bumped `catalogVersion` is the content hash over the grown descriptor set PLUS a strictly monotonic `+learned<N>` suffix, guaranteeing the stored version differs even when a re-promotion adds no new slug (a content hash alone could collide).
- **`new MS(` count unchanged (2):** `addLearnedRecipe` mutates `_ms` in place; it never constructs a second index (the eval acceptance criterion).

## Deviations from Plan

None - plan executed exactly as written. The three additive edits match RESEARCH Pattern 6 and the plan's `<interfaces>`/`<action>` blocks verbatim; no auto-fixes, no architectural changes, no blocking issues.

## Issues Encountered
- **Sync vs async resolve (anticipated by the test):** the real `FsbLearnedRecipeStore` (Plan 31-03) exposes only the async `getLearned`, while `resolve` is synchronous. The RED test stub deliberately provides a synchronous `getLearnedSync`, signalling the intended seam. Resolved by making `_getLearned` call `getLearnedSync` (degrading to `null` when absent). See **Known Stubs** for the production follow-up.

## Known Stubs

**1. `FsbLearnedRecipeStore.getLearnedSync` is not yet implemented in the production store**
- **File:** `extension/utils/capability-catalog.js` (`_getLearned`) reads `FsbLearnedRecipeStore.getLearnedSync`; `extension/utils/learned-recipe-store.js` exports only the async `getLearned`.
- **Effect:** In production today `_getLearned` returns `null` (the typeof guard short-circuits), so `resolve` falls through to the REGISTRY and a learned recipe is NOT yet surfaced synchronously. The catalog/router wiring is complete and correct (the test proves it with a stub that provides `getLearnedSync`); the remaining link is a synchronous in-memory mirror on the store.
- **Why intentional / out of scope here:** Plan 31-05's `files_modified` is scoped to the three capability-* files (search/catalog/router) and explicitly excludes `learned-recipe-store.js`. Adding a `getLearnedSync` mirror is a store-module change.
- **Resolution:** A follow-up store edit (the in-memory per-origin mirror populated on `promote`/`readAll`, exposed as `getLearnedSync`) is required to light up end-to-end learned routing in production. This does NOT block 31-06 (capture-session glue), which calls `addLearnedRecipe` + `promote` directly; it gates only the live `resolve`-time surfacing of a learned recipe.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `addLearnedRecipe` is ready for 31-06's capture-session glue (synthesize -> replay -> `addLearnedRecipe` + store `promote`).
- The catalog/router learned-dispatch path is wired and tested; production end-to-end surfacing awaits the store's `getLearnedSync` mirror (see Known Stubs).
- INV-01 (capability tools out of TOOL_REGISTRY), INV-02 (one engine), INV-04 (iterator untouched), the consent gate (Phase 30), and the executeBoundSpec origin-pin are all unchanged — confirmed by the unregressed mcp-surface / autopilot-parity / iterator-guard / router suites.

## Self-Check: PASSED

- FOUND: `extension/utils/capability-search.js`
- FOUND: `extension/utils/capability-catalog.js`
- FOUND: `extension/utils/capability-router.js`
- FOUND: `.planning/phases/31-network-capture-discovery-recipe-synthesis-learned-recipes/31-05-SUMMARY.md`
- FOUND: commit `71c6d3b6` (Task 1)
- FOUND: commit `9ac23967` (Task 2)

---
*Phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes*
*Completed: 2026-06-23*
