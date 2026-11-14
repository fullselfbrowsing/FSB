---
phase: 37-breadth-a-dev-productivity-least-sensitive
plan: 01
subsystem: api
tags: [opentabs, capability-search, minisearch, descriptors, classification-gate, backing-status, med-03, tsx, zod]

# Dependency graph
requires:
  - phase: 36-codegen-pipeline-no-dead-entry-resolution
    provides: "the tsx/zod importer (import-opentabs-catalog.mjs), shared side-effect-class.mjs (verb-map + GraphQL/RPC carve-out + override floor + fail-safe-high), the resolve() descriptor-only no-dead-entry fallback (T3/T2), the catalog inlining (readJsonDir/IIFE/djb2, INV-01), the smoke-eval harness + cold-start budget"
  - phase: 35-denylist-expansion-import-time-classification-gate
    provides: "verify-classification-gate.mjs classifyGate + service-denylist.js classify(); the vendored OpenTabs snapshot pin (SHA 4b170216 + MIT) + _provenance.json scaffold"
provides:
  - "The breadth CONTRACT machinery 37-02/03/04 (and 38/39) reuse verbatim: importer batch-enumeration (enumerateBatchApps replaces hardcoded SMOKE_APPS), STEM_OVERRIDES for the 4 collision hosts (jira/confluence/cloudflare/datadog), MED-03 app-disambiguated synonym generator, a backing enum per descriptor, a merge-time classifyGate batch-coverage gate, and eval seed-feeding (feedSeedDescriptors)"
  - "Backing-status carried through capability-search.js: every search() hit carries backing + backingStatus (display label) + invocable (true iff handler/recipe) so a pending-only descriptor is never a confident invocable hit"
  - "Vendored linear (GraphQL, 5 ops) + asana (REST, 4 ops) metadata slices + their emitted descriptors"
  - "The no-dead-entry corpus loader GENERALIZED to all opentabs__*.json (was a todoist-only false-green)"
  - "3 Wave-0 proof tests (breadth-search-return, breadth-batch-gate, backing-status-annotation) registered in the npm test chain"
affects: [37-02, 37-03, 37-04, 38-breadth-b, 39-breadth-c, 40-depth-1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Directory-enumerated batch import (enumerateBatchApps) excluding head-owned + already-imported + fixture dirs -- idempotent flat emit"
    - "Per-app serviceStem OVERRIDE map (STEM_OVERRIDES keyed by vendored dir name) so collision hosts emit distinct canonical slugs"
    - "App/origin token in EVERY synthesized intent synonym (MED-03 disambiguation) + drop the broken '<verb> a <plural-noun>' form"
    - "backing enum (recipe/handler/learn/dom) carried descriptor -> buildIndex storeField -> search() annotation (invocable + backingStatus display label)"
    - "Merge-time classifyGate batch-coverage assertion: the build aborts (exit 1) on any unclassified batch origin -- the per-batch gate 38/39 inherit"
    - "Eval seed-feeding: the importer mirrors each emitted descriptor's searchable shape into _fixtures/seed-descriptors.json so the eval has an indexed descriptor per slug"
    - "Real-corpus collision proof (breadth-search-return) is the load-bearing MED-03 signal; the eval-side intent-cases are a seed-fed secondary signal"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/linear/** (package.json, sdk-stub.ts, index.ts, linear-api.ts, 5 tools)"
    - "vendor/opentabs-snapshot/plugins/asana/** (package.json, sdk-stub.ts, index.ts, asana-api.ts, 4 tools)"
    - "catalog/descriptors/opentabs__linear__*.json (5), opentabs__asana__*.json (4)"
    - "catalog/descriptors/_fixtures/batch-unclassified-origin.fixture.json"
    - "tests/breadth-search-return.test.js, tests/breadth-batch-gate.test.js, tests/backing-status-annotation.test.js"
  modified:
    - "scripts/import-opentabs-catalog.mjs (enumeration + STEM_OVERRIDES + MED-03 synonyms + backing + batch gate + seed-feeding)"
    - "extension/utils/capability-search.js (backing storeField + buildIndex + search() invocable/backingStatus annotation)"
    - "tests/no-dead-entry.test.js (generalized loader + widened backing assertion)"
    - "catalog/descriptors/{github-issues,github-issues-create,github-notifications,notion-load-page,notion-spaces,slack-message,slack-conversations-list,reddit-inbox}.json (backing backfill)"
    - "extension/catalog/recipe-index.generated.js (snapshot regen), catalog/descriptors/_fixtures/{seed-descriptors,intent-cases}.json, package.json"

key-decisions:
  - "BRDTH-01/02/03 are OWNED by Phase 37 but span 37-04 (and continue into 38/39); 37-01 establishes + proves the contract machinery on linear/asana/todoist -- the requirement checkboxes stay Pending until the breadth batch completes (per REQUIREMENTS.md continuation framing)"
  - "The GENUINE MED-03 wrong-invoke=0 proof is breadth-search-return over the REAL emitted corpus; the eval intent-cases are a redundant seed-fed secondary signal (planned)"
  - "backing FIELD value is the canonical resolve()-seam enum (recipe/handler/learn/dom); 'discovery-pending'/'learn-pending' is the search DISPLAY label only (backingStatus) -> no resolve() change, lower risk"

patterns-established:
  - "Pattern: a new dev/productivity app is vendored as a metadata slice + picked up automatically by enumerateBatchApps -> 37-02/03/04 are genuinely data-only against frozen machinery"
  - "Pattern: search annotation distinguishes day-one-invocable (handler/recipe) from discovery-pending (dom/learn) by the backing enum -- T-37-02 mitigation"

requirements-completed: []  # BRDTH-01/02/03 are advanced + their contract proven here, but span 37-04/38/39; not marked globally complete after plan 1

# Metrics
duration: ~30min (Task-4 resume + closeout; Tasks 1-3 landed in the prior interrupted session)
completed: 2026-06-25
---

# Phase 37 Plan 01: Breadth Contract Machinery + linear/asana + Wave-0 Proofs Summary

**The breadth contract 38/39 reuse verbatim — importer batch-enumeration + STEM_OVERRIDES for the 4 collision hosts + MED-03 app-disambiguated synonyms + a backing enum carried through search annotation + a merge-time classifyGate batch gate + eval seed-feeding — proven on the linear/asana/todoist create_\* collision set with wrong-invoke=0 over the REAL emitted corpus.**

## Performance

- **Duration:** ~30 min (Task-4 resume + closeout after a transient-socket interruption; Tasks 1-3 landed earlier)
- **Completed:** 2026-06-25
- **Tasks:** 4 (Tasks 1-3 machinery landed in 05e1a0e1/2f031c2d/347fb67b; Task 4 proof tests + registration completed this session)
- **Files modified:** 55 source files across the plan (17 vendored linear/asana, 16 emitted opentabs descriptors, importer + search + no-dead-entry loader, 3 Wave-0 tests, snapshot regen, corpus backfill)

## Accomplishments
- **BRDTH-01 contract machinery:** the importer enumerates the vendored batch (`enumerateBatchApps` replaces hardcoded `SMOKE_APPS=['todoist']`), canonicalizes the stem for the 4 collision hosts (`STEM_OVERRIDES` = jira/confluence/cloudflare/datadog so `*.atlassian.net` jira/confluence no longer collide and dash.cloudflare.com/app.datadoghq.com get brand stems), emits app-disambiguated grammatically-clean synonyms (MED-03 fix), and feeds the eval seed — so 37-02/03/04 are genuinely data-only against corrected, frozen machinery.
- **BRDTH-03 backing-status:** `backing` flows descriptor → `buildIndex` storeField → `search()` annotation; every hit carries `backing` (canonical enum), `backingStatus` (display label: dom→`discovery-pending`, learn→`learn-pending`), and `invocable` (true iff handler/recipe). The shipped corpus is backfilled (github/slack/notion heads → `handler`; declarative tail → `dom`).
- **BRDTH-02 merge-time batch gate:** `runImport()` aborts the build on any unclassified batch origin (the per-batch denylist-coverage gate 38/39 inherit).
- **The GENUINE MED-03 collision proof:** `breadth-search-return.test.js` indexes the REAL emitted linear/asana/todoist descriptors and asserts recall@5=1.000 + wrong-invoke=0 on the cross-app create_* near-neighbor set ("create an issue in linear" tops `linear.create_issue`; "create a task in asana" tops `asana.create_task`; "create a task in todoist" tops `todoist.create_task`; none cross-invokes).
- **No-dead-entry loader generalized** from `opentabs__todoist__` to ALL `opentabs__*.json` (the Phase-36 filter was a false-green for every new app) — linear/asana descriptor-only slugs are now genuinely checked for non-null T3/T2 resolution.

## Task Commits

1. **Task 1: Vendor linear + asana metadata slices** — `05e1a0e1` (feat) — linear (GraphQL, 5 ops) + asana (REST, 4 ops) hermetic metadata slices.
2. **Task 2: Extend the importer** — `2f031c2d` (feat) — enumeration + STEM_OVERRIDES + MED-03 synonyms + backing enum + merge-time batch gate + eval seed-feeding.
3. **Task 3: Backing through search + corpus backfill + generalized no-dead-entry loader + snapshot regen** — `347fb67b` (feat).
4. **Task 4 (BRDTH-02 artifacts): batch-gate test + unclassified-origin fixture** — `586d4421` (test).
5. **Task 4 (BRDTH-01/03 proofs): real-corpus collision proof + backing annotation proof + eval seed + registration** — `2b668afa` (test).

**Plan metadata:** `<docs-commit>` (docs: SUMMARY + STATE + ROADMAP)

_Note: this plan was RESUMED — Tasks 1-3 + the importer/search/corpus machinery landed in the first three feat commits before a transient socket error interrupted the prior executor; Task-4's proof tests + registration + this SUMMARY were completed in the resume session._

## Files Created/Modified
- `scripts/import-opentabs-catalog.mjs` — `enumerateBatchApps`, `STEM_OVERRIDES`/`displayServiceStem`, rewritten `synthSynonyms` (MED-03), `backingFor`, merge-time `classifyGate` batch assertion, `feedSeedDescriptors`.
- `extension/utils/capability-search.js` — `backing` in `INDEX_OPTIONS.storeFields`, carried in `buildIndex`'s mapper, annotated in `search()` (`backing`/`backingStatus`/`invocable`) + parity in `addLearnedRecipe`.
- `tests/breadth-search-return.test.js` — the real-corpus MED-03 collision proof (BRDTH-01).
- `tests/breadth-batch-gate.test.js` + `catalog/descriptors/_fixtures/batch-unclassified-origin.fixture.json` — the merge-time batch-gate proof (BRDTH-02).
- `tests/backing-status-annotation.test.js` — the handler-vs-dom invocability annotation proof (BRDTH-03).
- `tests/no-dead-entry.test.js` — generalized loader (all `opentabs__*.json`) + widened backing assertion.
- `vendor/opentabs-snapshot/plugins/{linear,asana}/**` + `catalog/descriptors/opentabs__{linear,asana}__*.json` — the vendored slices + emitted descriptors.
- `catalog/descriptors/{github-*,notion-*,slack-*,reddit-inbox}.json` — backing backfill (handler / dom).
- `extension/catalog/recipe-index.generated.js` — snapshot regenerated (INV-01 IIFE/djb2 unchanged; DATA literal grows).
- `catalog/descriptors/_fixtures/{seed-descriptors,intent-cases}.json` — seed-fed emitted slugs + cross-app create_* eval fixtures.
- `package.json` — 3 new tests registered in the `test` chain after `head-handler-cap.test.js`.

## Decisions Made
- BRDTH-01/02/03 are advanced and their contract proven here, but the requirements explicitly span 37-04 (and continue into 38/39). The REQUIREMENTS.md checkboxes are left **Pending** — marking them globally complete after plan 1 would be premature against the continuation framing. The contract machinery + the first 3 apps are done; the breadth batch completes at 37-04.
- The load-bearing wrong-invoke=0 MED-03 signal is `breadth-search-return.test.js` over the REAL emitted corpus; the eval's cross-app create_* intent-cases are a redundant, seed-fed secondary signal (as planned).
- The descriptor `backing` field value stays the canonical resolve()-seam enum (`recipe`/`handler`/`learn`/`dom`); `discovery-pending`/`learn-pending` is the search DISPLAY label only (`backingStatus`) — no `resolve()` change, lower risk.

## Deviations from Plan

None — plan executed as written. (The plan was resumed mid-Task-4 after a transient socket error; the committed Task 1-3 work was verified intact via `git log` + a full re-run of validate:extension / eval / no-dead-entry before the remaining Task-4 artifacts were added. No committed work was redone.)

## Issues Encountered
- A `*/` sequence inside the block comment of the first draft of `breadth-search-return.test.js` (listing `opentabs__linear__*/opentabs__asana__*/...`) prematurely closed the JS comment and threw a SyntaxError. Reworded the comment to avoid the `*/` token; the test then passed (recall@5=1.000, wrong-invoke=0.000). No production code affected.

## User Setup Required
None — no external service configuration required. Phase 37 adds NO new packages (zod/tsx/@opentabs-dev/plugin-sdk already devDeps from Phase 36).

## Next Phase Readiness
- The breadth machinery is FROZEN: 37-02 (clickup/jira/confluence/airtable) can vendor data-only slices that `enumerateBatchApps` picks up automatically; `STEM_OVERRIDES` already gives jira/confluence distinct stems.
- `validate:extension` exit 0; crosscheck + no-dead-entry + the eval harness green on the grown corpus; the 3 Wave-0 proofs registered in the npm test chain.
- No blockers.

## Self-Check: PASSED

- Created files verified present: `tests/breadth-search-return.test.js`, `tests/breadth-batch-gate.test.js`, `tests/backing-status-annotation.test.js`, `catalog/descriptors/_fixtures/batch-unclassified-origin.fixture.json`, this SUMMARY.
- Commits verified in git history: `586d4421` (batch-gate artifacts), `2b668afa` (real-corpus collision + backing annotation proofs + registration). (Tasks 1-3: `05e1a0e1`, `2f031c2d`, `347fb67b`.)
- Verification re-run green: `breadth-search-return` / `breadth-batch-gate` / `backing-status-annotation` / `capability-search-eval` / `no-dead-entry` / `catalog-crosscheck` / `verify-catalog-crosscheck.mjs` / `validate:extension` all exit 0.

---
*Phase: 37-breadth-a-dev-productivity-least-sensitive*
*Completed: 2026-06-25*
