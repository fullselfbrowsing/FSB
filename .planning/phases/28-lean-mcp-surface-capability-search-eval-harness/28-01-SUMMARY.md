---
phase: 28-lean-mcp-surface-capability-search-eval-harness
plan: 01
subsystem: api
tags: [minisearch, capability-search, eval-harness, mv3-service-worker, recall, chrome-storage]

# Dependency graph
requires:
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: closed recipe schema + RECIPE_PATH_ALLOWLIST + recipe-path CI guard + vendored minisearch.min.js
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    provides: MUTATING_METHODS side-effect source + executeBoundSpec + the one real github.notifications recipe
provides:
  - extension/utils/capability-search.js (MiniSearch index + slug->recipe map + INDEX_OPTIONS + buildOrRestore/buildIndex/search/getRecipeBySlug/deriveSideEffect)
  - catalog/descriptors/*.json (the D-01 descriptor doc shape) + a near-neighbor eval seed set
  - tests/capability-search-eval.test.js (recall@5>=0.9 AND wrong-invoke=0 milestone gate, wired into npm test)
  - a build-time catalog-ship step (extension/catalog/recipe-index.generated.js FsbRecipeIndex IIFE) + SW-startup load
affects: [Plan 28-02, Plan 28-03, Plan 28-04, Phase 29 catalog-router]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level INDEX_OPTIONS constant reused at BOTH new MiniSearch(INDEX_OPTIONS) and loadJSON(JSON.stringify(snapshot), INDEX_OPTIONS) and exported so the eval test shares one source of truth (no options drift)"
    - "Separate capability-descriptor doc (intentSynonyms/service/actionVerb/sideEffectClass) keyed by slug; the Phase 26 closed recipe schema stays byte-untouched"
    - "Build-time generated dual-export IIFE (FsbRecipeIndex) ships top-level catalog/ data into the extension package; MV3-cold-start-safe (no SW fetch race)"
    - "Eval seed stresses ranking with near-neighbors so a naive single-field index FAILS the wrong-invoke=0 gate"

key-files:
  created:
    - extension/utils/capability-search.js
    - catalog/descriptors/github-notifications.json
    - catalog/descriptors/_fixtures/seed-descriptors.json
    - catalog/descriptors/_fixtures/seed-recipes.json
    - catalog/descriptors/_fixtures/intent-cases.json
    - tests/capability-search-eval.test.js
  modified:
    - scripts/verify-recipe-path-guard.mjs
    - scripts/package-extension.mjs
    - extension/background.js
    - package.json
    - .gitignore

key-decisions:
  - "INDEX_OPTIONS is a single module-level constant reused at construction + loadJSON and exported for the eval test; loadJSON gets JSON.stringify(toJSON()) because toJSON returns an object and the vendored minisearch wants a JSON string"
  - "catalogVersion is a djb2 content hash over sorted descriptor slugs + recipe count (not just a length stamp) so a same-count catalog edit still invalidates a stale snapshot (Assumption A5 upgraded)"
  - "search() applies origin bias via boostDocument(id, term, stored) (signature confirmed in the vendored source) with a stable post-search re-rank by owned-service as the documented fallback (Open Question 1)"
  - "buildIndex cross-checks the authored descriptor sideEffectClass against the recipe-derived class (recipe.method wins) so a mis-authored descriptor cannot under-state a destructive call in a search hit"
  - "extension/catalog/recipe-index.generated.js is a gitignored build artifact (regenerated at package time, would go stale if committed); background.js tolerates its dev-tree absence"

patterns-established:
  - "Pattern: dual-export IIFE SW module reaching vendored globals (MiniSearch, chrome, FsbRecipeIndex) only through typeof-guarded accessors so it loads under the Node harness"
  - "Pattern: a new extension/utils/capability-*.js is added to RECIPE_PATH_ALLOWLIST in the SAME edit that creates it (Check 4 fail-closed)"
  - "Pattern: a near-neighbor-seeded recall@k + wrong-invoke eval gate whose threshold is provably non-trivial (naive index fails)"

requirements-completed: [SURF-04, SURF-06, SURF-01]

# Metrics
duration: 8min
completed: 2026-06-21
---

# Phase 28 Plan 01: Capability-Search Index + Eval Harness Summary

**A persisted MiniSearch capability index (intent synonyms + service + verb + side-effect, snapshotted to chrome.storage.local under fsbCapabilityIndex) with schema-on-hit + origin bias, the catalog shipped into the extension package via a build-time FsbRecipeIndex IIFE, and a near-neighbor eval gate that holds recall@5=1.000 / wrong-invoke=0.000 (and which a naive single-field index fails).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-21T03:31:55Z
- **Completed:** 2026-06-21T03:40:xx Z
- **Tasks:** 4
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments
- Stood up `extension/utils/capability-search.js` — the one genuinely-new logic file in the phase — with the load-bearing `INDEX_OPTIONS` reuse (construction + `loadJSON`), schema-on-hit hits (`slug/service/sideEffectClass/description/score/params`), origin bias via `boostDocument`, a `<=5` cap, the slug->recipe map, and `buildOrRestore()` snapshot/restore (D-04/D-05/D-08/D-11), registered on `RECIPE_PATH_ALLOWLIST` (guard green).
- Delivered the milestone eval gate `tests/capability-search-eval.test.js`: recall@5 >= 0.9 AND wrong-invoke = 0 over 36 seeded near-neighbor fixtures, plus the toJSON/loadJSON round-trip (and the loadJSON-without-options throw) and a schema-on-hit + cap assertion. Wired into the npm `test` chain after `capability-fetch.test.js`.
- Authored the real `github.notifications` descriptor (D-01) and a 12-capability synthetic seed with send/post/message near-neighbors and a read/mutate/destructive contrast — proven non-trivial: a naive description-only index scores wrong-invoke=0.222 and fails the gate.
- Shipped the catalog into the extension package (D-16): `scripts/package-extension.mjs` now generates `extension/catalog/recipe-index.generated.js` (`FsbRecipeIndex` dual-export IIFE) before zipping, and `background.js` loads it then `capability-search.js` then fires `buildOrRestore()` at SW startup (additive only).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author catalog descriptors + seeded eval fixtures** - `8875a64f` (feat)
2. **Task 2: capability-search.js (MiniSearch index + slug->recipe map) + allowlist entry** - `bd274a0e` (feat)
3. **Task 3: capability-search eval gate + npm test wiring** - `1fb5f9bd` (test)
4. **Task 4: Ship catalog into the package + SW-startup load** - `d83aa5a8` (feat)

_TDD tasks 2 and 3: the verified RESEARCH reference draft (Task 2) and the proven module (Task 3) collapsed RED->GREEN into a single passing commit; the eval gate itself is the standing RED->GREEN proof and is green._

## Files Created/Modified
- `extension/utils/capability-search.js` (created) - MiniSearch instance + slug->recipe map + INDEX_OPTIONS + buildOrRestore/buildIndex/search/getRecipeBySlug/deriveSideEffect; dual-export IIFE; eval-free; on the recipe-path allowlist.
- `catalog/descriptors/github-notifications.json` (created) - the D-01 descriptor for the one real recipe (slug == github.notifications, sideEffectClass read).
- `catalog/descriptors/_fixtures/seed-descriptors.json` (created) - 12 synthetic head-capability descriptors with near-neighbor send/post/message services + read/mutate/destructive contrast.
- `catalog/descriptors/_fixtures/seed-recipes.json` (created) - one recipe per seed descriptor (id == slug) with method (sideEffect cross-check) + a params JSON-Schema (schema-on-hit).
- `catalog/descriptors/_fixtures/intent-cases.json` (created) - 36 intent -> expectedSlug pairs (3 paraphrases each) with near-neighbor disambiguation.
- `tests/capability-search-eval.test.js` (created) - recall@5 + wrong-invoke gate + round-trip + schema-on-hit/cap; reuses the module's INDEX_OPTIONS/buildIndex/search.
- `scripts/verify-recipe-path-guard.mjs` (modified) - added extension/utils/capability-search.js to RECIPE_PATH_ALLOWLIST.
- `scripts/package-extension.mjs` (modified) - generate extension/catalog/recipe-index.generated.js (FsbRecipeIndex) from catalog/recipes/*.json + catalog/descriptors/*.json before zipping; _fixtures/ excluded.
- `extension/background.js` (modified, additive) - importScripts catalog/recipe-index.generated.js then utils/capability-search.js after capability-fetch.js, then FsbCapabilitySearch.buildOrRestore() at startup under a typeof guard.
- `package.json` (modified) - appended `&& node tests/capability-search-eval.test.js` after capability-fetch.test.js (surface test intentionally NOT added — Plan 04).
- `.gitignore` (modified) - ignore extension/catalog/ (deterministic build artifact regenerated at package time).

## Decisions Made
- **INDEX_OPTIONS single constant + JSON-string loadJSON:** the vendored minisearch `toJSON()` returns an object but `loadJSON` requires a JSON string and the SAME options object (it throws otherwise, verified). The module passes `JSON.stringify(snapshot.index)` + the exported `INDEX_OPTIONS` to `loadJSON`; the eval test imports that same constant.
- **Content-hash catalogVersion (djb2 over sorted slugs + recipe count):** more robust than the RESEARCH `length + ':' + version` sketch against same-count catalog edits (Assumption A5 upgraded, still dependency-free, still arithmetic-only — no dynamic-code on the recipe path).
- **boostDocument origin bias + stable service re-rank fallback:** the vendored source confirms `boostDocument(id, term, stored)`; the search() also re-ranks owned-service hits to the front as the documented Open-Question-1 fallback, so an arg-order drift cannot defeat the bias.
- **sideEffectClass integrity cross-check at build:** when a paired recipe exists, its method-derived class wins over the authored descriptor class, so a mis-authored descriptor cannot under-state a destructive hit (D-02 integrity).
- **Generated catalog is a gitignored build artifact:** like `extension/dist/`, `extension/catalog/recipe-index.generated.js` is regenerated by the packaging step and would go stale if committed; `background.js` tolerates its dev-tree absence (degrades to an empty catalog).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Eval test exercised the module's internal search() before populating the internal index**
- **Found during:** Task 3 (eval-harness gate)
- **Issue:** The schema-on-hit + cap assertions call the module's `search()`, which reads the module-level internal `_ms` index. `_ms` is only populated by `buildOrRestore()` (async); the first eval run called `search()` without awaiting it, so `search()` returned `[]` and the "every hit carries params" check failed (0 hits to evaluate).
- **Fix:** Wrapped the `search()`-based assertions in an async IIFE that `await`s `CapabilitySearch.buildOrRestore()` (with the seed planted on `global.FsbRecipeIndex`) before running them and exiting; added an explicit "returns hits after buildOrRestore" assertion so a future empty-index regression is caught directly.
- **Files modified:** tests/capability-search-eval.test.js
- **Verification:** `node tests/capability-search-eval.test.js` -> 11 passed, 0 failed, exit 0 (recall@5=1.000, wrong-invoke=0.000).
- **Committed in:** `1fb5f9bd` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was confined to the test's own async sequencing; it strengthened the gate (added an explicit hits-after-restore assertion) and introduced no scope creep. No runtime/module behavior changed.

## Issues Encountered
- **Trivially-perfect first recall (Open Question 2 watch):** the tuned index hit recall@5=1.000 / wrong-invoke=0.000 on the first run. Per Task 3's instruction this only counts if the gate can actually FAIL — confirmed by measuring a naive description-only index on the same seed: recall@5=0.972 but **wrong-invoke=0.222**, which fails the non-negotiable wrong-invoke=0 gate. So the seed genuinely stresses ranking and the intentSynonyms boost is load-bearing; threshold left at recall@5>=0.9 AND wrong-invoke=0 (D-13).

## Known Stubs
None that block the plan's goal. The build-time `FsbRecipeIndex` catalog global is absent in a raw dev tree (it is generated only by `scripts/package-extension.mjs`); `capability-search.js` and `background.js` intentionally degrade to an empty catalog in that case (typeof guards), and a packaged build populates it (verified: 1 recipe + 1 descriptor ship). This is the designed D-16 behavior, not an unresolved stub.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The search index + slug->recipe map + `getRecipeBySlug` + `search()` are ready for the MCP surface (Plan 28-02 `capabilities.ts` two-tool registration) and the dispatcher/bridge routes (Plan 28-03), and the `invoke_capability` direct path (slug -> interpretRecipe -> executeBoundSpec) can consume `getRecipeBySlug`.
- Plan 28-04 will add `tests/capability-mcp-surface.test.js` (INV-01 hash-unchanged + two tools on wire) and append it to the npm test chain — deliberately NOT added here.
- The catalog now ships in the packaged extension, so a packaged build has a non-empty index.

## Self-Check: PASSED

- All 6 created source/fixture files + the SUMMARY exist on disk.
- All 4 task commits (`8875a64f`, `bd274a0e`, `1fb5f9bd`, `d83aa5a8`) exist in git history.
- Plan-close gates green: `node scripts/verify-recipe-path-guard.mjs` (exit 0), `node tests/capability-search-eval.test.js` (11 passed, recall@5=1.000, wrong-invoke=0.000), `node scripts/package-extension.mjs` (1 recipe + 1 descriptor shipped). Adjacent capability/guard tests (recipe-path-guard, capability-interpreter, capability-fetch, capability-recipe-schema) still PASS.

---
*Phase: 28-lean-mcp-surface-capability-search-eval-harness*
*Completed: 2026-06-21*
