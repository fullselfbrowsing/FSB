---
phase: 36-codegen-pipeline-no-dead-entry-resolution
plan: 04
subsystem: testing
tags: [minisearch, capability-search, catalog-inline, djb2, cold-start, eval-harness, INV-01, CGEN-04]

# Dependency graph
requires:
  - phase: 36-01
    provides: "the FLAT opentabs__todoist__*.json descriptors emitted + the recipe-index.generated.js snapshot regenerated/committed (15 descriptors) via the unchanged readJsonDir/IIFE path"
  - phase: 28
    provides: "the capability-search index layer (INDEX_OPTIONS, buildIndex, _computeCatalogVersion djb2) + the capability-search-eval.test.js recall@5/wrong-invoke harness"
provides:
  - "tests/catalog-inline-shape.test.js: locks the recipe-index.generated.js IIFE wrapper + dual-export tail + deterministic/change-sensitive djb2 catalogVersion + byte-identical idempotent regen (INV-01) and asserts the emitted todoist slugs inlined"
  - "tests/head-handler-cap.test.js: HEAD_HANDLER_MODULES.length <= 30 (==3 today) parsed from the catalog source -- breadth = descriptors-only CI gate"
  - "extended capability-search-eval smoke category (todoist near-neighbors): recall@5>=0.9 + wrong-invoke==0 + serialized-index<50KB + loadJSON+first-search<10ms cold-start machinery"
affects: [37-breadth-dev-productivity, 43-catalog-scale-milestone-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural/regex shape-lock over the generated IIFE (NOT a full-file byte diff) so grown DATA cannot falsely red INV-01"
    - "In-memory regen mirror (readJsonDir + IIFE assembly) byte-compared to the committed snapshot WITHOUT rewriting it -- a VERIFIER asserts idempotency without re-owning the artifact"
    - "Cold-start budget as a unit assert (serialized-size + loadJSON+first-search timing) co-located in the existing eval harness"

key-files:
  created:
    - tests/catalog-inline-shape.test.js
    - tests/head-handler-cap.test.js
  modified:
    - tests/capability-search-eval.test.js
    - catalog/descriptors/_fixtures/seed-descriptors.json
    - catalog/descriptors/_fixtures/intent-cases.json

key-decisions:
  - "Plan 04 is a VERIFIER: it reads/asserts the Plan-01-committed recipe-index.generated.js and never lists it in files_modified, never regenerates-and-commits it, and never asserts against a pre-emit baseline (the in-memory regen mirror proves idempotency byte-for-byte without touching the file on disk)"
  - "HEAD_HANDLER_MODULES is a PRIVATE var (not exported) -> the cap test parses the array literal from capability-catalog.js source, which is the stronger freeze (locks the source declaration the head is built against, immune to runtime registration)"
  - "Smoke near-neighbors (asana.create_task / linear.create_issue) added to _fixtures/ alongside the 7 todoist ops so the wrong-invoke gate is genuinely exercised by cross-app create_* pressure; NO seed-recipes added (descriptor-only indexing is the realistic case and seed-recipes.json is not in files_modified)"

patterns-established:
  - "Shape-lock precedent reuse: zero-framework check(cond,msg)/passed-failed/process.exit mirror of recipe-schema-lock.test.js"
  - "_fixtures/ near-neighbor corpus extension is data-only -> no shipped-snapshot change -> validate:extension stays green (readJsonDir non-recursion excludes _fixtures/)"

requirements-completed: [CGEN-04]

# Metrics
duration: 7min
completed: 2026-06-24
---

# Phase 36 Plan 04: Catalog Inlining Shape-Lock + Smoke Eval Re-Pass + Cold-Start Budget Summary

**Locked the recipe-index.generated.js IIFE/djb2 inline shape (INV-01, byte-stable + idempotent), re-passed the capability-search eval on the todoist smoke category (recall@5=1.000, wrong-invoke=0.000 over 58 fixtures), and added the SW cold-start budget machinery (serialized index 9.9KB < 50KB; loadJSON+first-search 0.58ms < 10ms) plus the HEAD_HANDLER_MODULES<=30 cap -- all as a VERIFIER that never re-owns the Plan-01 snapshot.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-24T17:23:35Z (approx; parent of first task commit)
- **Completed:** 2026-06-24T17:31:00Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- **Inline-shape lock (Task 1):** `tests/catalog-inline-shape.test.js` (14 checks) VERIFIES the Plan-01-reconciled snapshot: the `(function(global){...})` IIFE wrapper + `global.FsbRecipeIndex = DATA` + `module.exports = DATA` dual-export tail are structurally intact (regex, not byte-diff, so the 8->15 descriptor growth does not falsely red); all 7 emitted todoist slugs are inlined in `DATA.descriptors` (Pitfall-1 subdir-drop guard); an in-memory regen over the same on-disk corpus reproduces the committed bytes EXACTLY (idempotent, restore-not-rebuild) without rewriting the file; and `_computeCatalogVersion` (djb2 over sorted slugs) is deterministic over the same corpus and shifts when a slug is added.
- **Head cap (Task 1):** `tests/head-handler-cap.test.js` parses `HEAD_HANDLER_MODULES` from `capability-catalog.js` and asserts length <= 30 (== 3 today: github/slack/notion), making "breadth = descriptors-only, the head never sprawls into imperative handlers" a CI failure (T-36-13).
- **Smoke eval re-pass (Task 2):** extended `_fixtures/seed-descriptors.json` with 11 non-shipping near-neighbors (7 todoist ops + asana create/list + linear create) and `_fixtures/intent-cases.json` with 24 todoist intent phrases; the existing harness re-passes recall@5=1.000 + wrong-invoke=0.000 over 58 fixtures with the cross-app `create_*` pressure (todoist vs asana vs linear vs github) genuinely exercised.
- **Cold-start budget (Task 2):** added the two SCALE-01 asserts to the eval harness using the SAME `INDEX_OPTIONS` -- serialized smoke index 9.9KB < 50KB and `loadJSON(serialized, INDEX_OPTIONS) + first search` 0.58ms < 10ms -- so the measurement machinery exists before breadth lands (Phase 43 re-runs it at full scale).

## Task Commits

Each task was committed atomically:

1. **Task 1: Inline-shape lock + head-cap assertion** - `da54dff6` (test)
2. **Task 2: Smoke-category eval re-pass + cold-start budget asserts** - `7245e29b` (test)

## Files Created/Modified
- `tests/catalog-inline-shape.test.js` - (created) VERIFIES the Plan-01 snapshot IIFE/djb2 shape + idempotent regen + todoist inlined (INV-01); does NOT re-own the snapshot.
- `tests/head-handler-cap.test.js` - (created) parses HEAD_HANDLER_MODULES from source; asserts length <= 30 (== 3 today).
- `tests/capability-search-eval.test.js` - (modified) +2 CGEN-04 asserts (serialized < 50KB; loadJSON+first-search < 10ms) after the existing recall/wrong-invoke gate; no harness logic rewrite.
- `catalog/descriptors/_fixtures/seed-descriptors.json` - (modified) +11 non-shipping todoist/asana/linear near-neighbor descriptors (cross-app wrong-invoke pressure).
- `catalog/descriptors/_fixtures/intent-cases.json` - (modified) +24 todoist intent phrases (3-4 per smoke op).

## Decisions Made
- **VERIFIER discipline (not a regen owner):** the snapshot test reads `extension/catalog/recipe-index.generated.js` via `require()` and proves idempotency by mirroring `package-extension.mjs`'s `readJsonDir`+IIFE assembly IN MEMORY and byte-comparing to the committed file -- it never rewrites the file, never lists it in files_modified, and never asserts a pre-emit baseline. Confirmed git-clean before and after (including after the plan's end-to-end `package-extension.mjs` idempotency `<verify>` step).
- **Parse-the-source for the head cap:** `HEAD_HANDLER_MODULES` is a private `var` inside the catalog IIFE (the module exports `resolve`/`registerHandler`/`seedHeadHandlers`/... but not the manifest), so the cap test extracts the array literal via regex -- the stronger freeze (locks the declaration, immune to runtime registration drift).
- **Descriptor-only near-neighbors, no seed-recipes:** the added smoke fixtures are descriptor-only (no paired recipe), which is the realistic breadth case (`buildIndex` falls back to the descriptor's authored `sideEffectClass`); `seed-recipes.json` is deliberately untouched (not in files_modified).

## Deviations from Plan

None - plan executed exactly as written. The plan's premise (Plan 01 Task 4 already regenerated + committed the snapshot with the FLAT todoist descriptors inlined) was verified TRUE before any test was written: the committed snapshot is git-clean and contains all 7 `todoist.*` slugs (15 descriptors total). No Rule 1/2/3 auto-fixes were required; no Rule 4 architectural decisions arose.

## Issues Encountered
None. (One early false alarm: an initial `grep -c "opentabs__todoist"` against the snapshot returned 0 because the inlined SLUG is `todoist.create_task`, not the FILENAME pattern `opentabs__todoist__*`; re-grepping for the real slug confirmed all 7 todoist slugs and 42 todoist references are present in the committed snapshot. No code impact.)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CGEN-04 satisfied: the generated catalog (committed by Plan 01) is inlined via the unchanged `readJsonDir`/IIFE/djb2 path with a stable, deterministic `catalogVersion`; a same-corpus regen is byte-identical idempotent; the todoist slugs are present; the smoke eval re-passes (recall@5>=0.9, wrong-invoke==0); the SW cold-start parse stays within budget; HEAD_HANDLER_MODULES stays capped.
- Phase 36 (CGEN-01..04) is now fully executed across Plans 01-04 (codegen importer + no-dead-entry resolve() fallback + side-effect cross-check + this inline/scale proof). The cold-start measurement machinery and the head-cap gate are in place for Phase 37 breadth (each new descriptor batch re-runs the eval harness; Phase 43 re-runs the size/cold-start gate at the full ~2,523-descriptor scale).
- No blockers. The shipped snapshot is untouched by this plan; `npm run validate:extension` (validate + recipe-path-guard + classification-gate + catalog-crosscheck) is green.

## Self-Check: PASSED

- Created files exist: `tests/catalog-inline-shape.test.js`, `tests/head-handler-cap.test.js`, `36-04-SUMMARY.md` (all FOUND).
- Modified files exist: `tests/capability-search-eval.test.js`, `_fixtures/seed-descriptors.json`, `_fixtures/intent-cases.json` (all FOUND).
- Commits exist: `da54dff6` (Task 1), `7245e29b` (Task 2) (both FOUND).
- All verifications exit 0: `node tests/catalog-inline-shape.test.js`, `node tests/head-handler-cap.test.js`, `node tests/capability-search-eval.test.js`, `npm run validate:extension`.
- Shipped snapshot `extension/catalog/recipe-index.generated.js` is git-clean (VERIFIER did not re-own it).

---
*Phase: 36-codegen-pipeline-no-dead-entry-resolution*
*Completed: 2026-06-24*
