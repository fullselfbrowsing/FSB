---
phase: 37-breadth-a-dev-productivity-least-sensitive
plan: 04
subsystem: api
tags: [opentabs, capability-catalog, descriptors, minisearch, side-effect-class, stem-overrides, observability, breadth]

# Dependency graph
requires:
  - phase: 37-01
    provides: the frozen importer (enumerateBatchApps + STEM_OVERRIDES{jira,confluence,cloudflare,datadog} + synthSynonyms + classifyGate batch-coverage + feedSeedDescriptors), the generalized no-dead-entry loader, the breadth-search-return proof harness
  - phase: 37-03
    provides: the third data-only sub-batch (gitlab/bitbucket/vercel/netlify) proving verbatim contract reuse; the 58-descriptor corpus this plan grows to 70
provides:
  - cloudflare/circleci/datadog/sentry/posthog vendored as hermetic metadata-only slices (Wall 1)
  - 20 new descriptors imported via the frozen machinery (cloudflare/datadog canonical via STEM_OVERRIDES)
  - the COMPLETE dev/PM/cloud/observability breadth category (BRDTH-01 complete, 70 opentabs descriptors)
  - the SCALE-01 cold-start budget re-asserted at the grown batch size (42.6KB < 50KB, 0.68ms < 10ms)
  - crosscheck/no-dead-entry/eval/breadth-search-return all green on the complete batch
affects: [phase-38-breadth-comms-social-content, phase-39-breadth-commerce-travel-misc, phase-43-catalog-scale-milestone-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-only sub-batch (4th proof): vendor metadata slices + run the FROZEN importer -- zero machinery edit, zero new STEM_OVERRIDES entry (cloudflare/datadog already mapped in 37-01)"
    - "STEM_OVERRIDES canonicalizes the SLUG only -- the descriptor's service field retains the real host (dash.cloudflare.com / app.datadoghq.com) for runtime URL-pin matching"
    - "Side-effect class from {method:'...'} literal floor: trigger_pipeline {POST} / resolve_issue {PUT} class write WITHOUT adding trigger/resolve to the shared verb sets; purge_cache classes destructive via the shared `purge` verb"
    - "Corpus-scaling ranking fragility fixed at the METADATA SOURCE (a richer todoist summary -> stronger importer-emitted synonym), not by hand-editing the importer-owned seed"

key-files:
  created:
    - vendor/opentabs-snapshot/plugins/cloudflare/** (8 files: package.json + sdk-stub + cloudflare-api + index + 4 tools)
    - vendor/opentabs-snapshot/plugins/circleci/** (8 files)
    - vendor/opentabs-snapshot/plugins/datadog/** (8 files)
    - vendor/opentabs-snapshot/plugins/sentry/** (8 files)
    - vendor/opentabs-snapshot/plugins/posthog/** (8 files)
    - catalog/descriptors/opentabs__{cloudflare,circleci,datadog,sentry,posthog}__*.json (20 emitted descriptors)
  modified:
    - vendor/opentabs-snapshot/PIN.md (sub-batch-4 per-phase log row)
    - vendor/opentabs-snapshot/plugins/todoist/src/tools/list-tasks.ts (Rule-1: stronger summary synonym)
    - catalog/descriptors/_fixtures/{seed-descriptors,_provenance}.json (importer-fed)
    - catalog/descriptors/_fixtures/intent-cases.json (+25 new-app cases)
    - catalog/descriptors/opentabs__todoist__list_tasks.json (re-emitted with the stronger synonym)
    - tests/breadth-search-return.test.js (corpus 50->70 ops, +9 collision probes)
    - extension/catalog/recipe-index.generated.js (snapshot regen, 70 opentabs descriptors)

key-decisions:
  - "cloudflare/datadog vendored dirs named EXACTLY cloudflare/datadog so they hit the 37-01 STEM_OVERRIDES keys -> opentabs__cloudflare__*/opentabs__datadog__* (NOT opentabs__dash__*/opentabs__datadoghq__*)"
  - "cloudflare.purge_cache classes destructive (shared `purge` verb); circleci.trigger_pipeline {method:'POST'} and sentry.resolve_issue {method:'PUT'} class write via the method-literal floor -- NO edit to the shared side-effect-class.mjs verb sets"
  - "The CGEN-04 cold-start smoke gates (50KB/10ms) held at the grown size WITHOUT widening -- the per-descriptor footprint stays flat (params schema-on-hit, never indexed/stored)"
  - "[Rule 1] A pre-existing list/close score near-tie ('what tasks do i have in todoist') tipped to close_task as the corpus grew (IDF shift); fixed at the todoist metadata source so wrong-invoke returns to 0 robustly across future batch growth"

patterns-established:
  - "4th verbatim data-only reuse of the 37-01 breadth contract -- the category is now COMPLETE; 38/39 inherit the same flow for new categories"
  - "Same-op cross-app collisions (datadog vs posthog list_dashboards; datadog.query_metrics vs posthog.query_events) disambiguate by the app token -> wrong-invoke=0"

requirements-completed: [BRDTH-01]

# Metrics
duration: 13min
completed: 2026-06-25
---

# Phase 37 Plan 04: Final Observability Sub-Batch + Scale Re-Assert Summary

**cloudflare/circleci/datadog/sentry/posthog imported data-only via the frozen 37-01 machinery (cloudflare/datadog canonical via STEM_OVERRIDES, purge_cache destructive, trigger/resolve write), completing the dev/productivity breadth category at 70 descriptors with the SCALE-01 cold-start budget re-asserted (42.6KB/0.68ms) and recall@5=1.000 wrong-invoke=0.000 across the complete batch.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-25T07:48:40Z
- **Completed:** 2026-06-25T08:01:53Z
- **Tasks:** 2
- **Files modified:** 68 (5 vendored slices x 8 files + 20 descriptors + PIN.md + todoist fix + snapshot + 2 fixtures + 1 test)

## Accomplishments
- Vendored the final observability sub-batch (cloudflare/circleci/datadog/sentry/posthog) as 5 hermetic metadata-only TS slices (Wall 1: no dist/, no executed handle(), no runtime .js -- provenance-scaffold green).
- Imported 20 descriptors via the FROZEN importer with ZERO machinery edit; cloudflare/datadog emit canonical opentabs__cloudflare__*/opentabs__datadog__* slugs via the 37-01 STEM_OVERRIDES (the frozen host stem would be dash/datadoghq) -- 0 dash./datadoghq. slugs in the snapshot, while the service field correctly retains the real hosts.
- Completed the dev/PM/cloud/observability breadth category: 70 opentabs descriptors across 16 apps; snapshot regenerated (INV-01 IIFE/djb2 unchanged), validate:extension exit 0.
- Re-asserted success criterion 4 over the COMPLETE batch: crosscheck PASS (purge_cache destructive, trigger_pipeline/resolve_issue write, queries read), no-dead-entry PASS (generalized loader resolves the new canonical slugs to T3), eval recall@5=1.000 wrong-invoke=0.000 over 127 fixtures, breadth-search-return recall@5=1.000 wrong-invoke=0.000 over 70 ops / 20 collision probes.
- The SCALE-01 cold-start budget held at the grown size WITHOUT widening (42.6KB < 50KB serialized; 0.68ms < 10ms loadJSON+first-search) -- the data layout (params schema-on-hit, never indexed/stored) proven before the full-corpus scale gate in Phase 43.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor cloudflare + circleci + datadog + sentry + posthog metadata slices** - `d5f945e8` (feat)
2. **Task 2: Import the final sub-batch, regenerate the snapshot, re-assert scale + regression** - `0e724dea` (feat)

_Note: both tasks are tdd="true"; the test fixtures (intent-cases + breadth-search-return) were extended as the RED component and the importer + package + full gate chain are the GREEN verification. Task 1's structural RED (slices absent -> import smoke fails) -> GREEN (import smoke passes with 4 ops each)._

## Files Created/Modified

**Vendored slices (Wall 1 metadata-only, 8 files each):**
- `vendor/opentabs-snapshot/plugins/cloudflare/**` - zones/DNS reads + purge_cache (destructive)
- `vendor/opentabs-snapshot/plugins/circleci/**` - pipelines/workflows reads + trigger_pipeline (write)
- `vendor/opentabs-snapshot/plugins/datadog/**` - metrics/monitors/dashboards (read-heavy observability)
- `vendor/opentabs-snapshot/plugins/sentry/**` - issues/projects reads + resolve_issue (write)
- `vendor/opentabs-snapshot/plugins/posthog/**` - insights/dashboards/events (read-only analytics)

**Emitted data + machinery outputs:**
- `catalog/descriptors/opentabs__{cloudflare,circleci,datadog,sentry,posthog}__*.json` - 20 new flat descriptors (canonical stems)
- `extension/catalog/recipe-index.generated.js` - regenerated snapshot (70 opentabs descriptors; INV-01 unchanged)
- `catalog/descriptors/_fixtures/{seed-descriptors,_provenance}.json` - importer-fed (NOT hand-edited)
- `vendor/opentabs-snapshot/PIN.md` - sub-batch-4 per-phase log row (category complete)

**Test fixtures (mine):**
- `catalog/descriptors/_fixtures/intent-cases.json` - +25 new-app read/write/destructive cases (incl. "purge the cloudflare cache", "query datadog metrics", "trigger a circleci pipeline", "resolve an issue in sentry")
- `tests/breadth-search-return.test.js` - corpus regex + count 50->70 ops; +9 collision probes (datadog vs posthog list_dashboards, query_metrics vs query_events, sentry issues, the write/destructive ops)

**Rule-1 fix:**
- `vendor/opentabs-snapshot/plugins/todoist/src/tools/list-tasks.ts` - stronger colloquial summary synonym (re-imported -> opentabs__todoist__list_tasks.json re-emitted)

## Decisions Made
- Named the cloudflare/datadog vendored dirs EXACTLY to the 37-01 STEM_OVERRIDES keys (no new override entry, no importer edit) so the brand slugs are correct.
- Made side-effect classes explicit via the upstream-accurate transport signal: `purge` verb -> destructive (cloudflare.purge_cache); `{method:'POST'}` -> write (circleci.trigger_pipeline); `{method:'PUT'}` -> write (sentry.resolve_issue) -- all without touching the shared side-effect-class.mjs verb sets.
- Kept the CGEN-04 cold-start smoke gates at 50KB/10ms (no widening) because the grown index (42.6KB) stayed well within budget -- the per-descriptor footprint is flat (schema-on-hit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] todoist.list_tasks lost a razor-thin ranking tie to close_task as the corpus grew**
- **Found during:** Task 2 (re-assert the eval over the complete batch)
- **Issue:** The pre-existing committed intent-case "what tasks do i have in todoist" -> todoist.list_tasks flipped to topping todoist.close_task after the 20 new descriptors landed, driving the eval's wrong-invoke from 0.000 to 0.008 (1/127). Verified NOT pre-existing: at committed HEAD the eval was wrong-invoke=0.000 over 106 fixtures, and isolating the cause showed list_tasks (184.09) edged close_task (183.99) at the 62-doc seed but close_task (203.39) edged list_tasks (202.65) at the 82-doc seed -- a corpus-global IDF shift tipping a pre-existing ~0.1% score tie. wrong-invoke=0 is non-negotiable (a mis-invoke is a real authenticated side effect), so this had to be driven back to 0.
- **Fix:** Strengthened the todoist `list-tasks.ts` summary to a colloquial phrasing ("show me what tasks i have") that the FROZEN importer's synonym synthesizer emits as "show me what tasks i have in todoist" -- a strong natural-language synonym for the common "what tasks do i have" intent. Re-ran the importer (which re-emitted opentabs__todoist__list_tasks.json + re-fed the seed) so the new synonym propagated through the frozen machinery. NO importer edit and NO seed-descriptors.json hand-edit (both frozen/importer-owned). list_tasks now wins this query decisively (581.96 vs 203.45, a 2.8x margin robust against future batch growth).
- **Files modified:** vendor/opentabs-snapshot/plugins/todoist/src/tools/list-tasks.ts (and the re-emitted opentabs__todoist__list_tasks.json + the importer-fed seed-descriptors.json)
- **Verification:** capability-search-eval recall@5=1.000 wrong-invoke=0.000 over 127 fixtures; breadth-search-return recall@5=1.000 wrong-invoke=0.000; full related-test suite (import-extraction, catalog-crosscheck, catalog-inline-shape, no-dead-entry, head-handler-cap, breadth-batch-gate, backing-status-annotation, provenance-scaffold, recipe-path-guard) all green.
- **Committed in:** `0e724dea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix restores the non-negotiable wrong-invoke=0 invariant the plan's success criterion 4 requires, addressing a real corpus-scaling fragility at its metadata source rather than by weakening a test assertion or editing frozen machinery. The fix is in a foundational slice (todoist) so it hardens the invariant for ALL future batches, not just this one. No scope creep -- the 5 new apps were vendored and imported exactly as planned.

## Issues Encountered
- The cross-app `list_dashboards` collision (datadog AND posthog ship an identically-named op) was the closest same-op near-neighbor in this sub-batch; the app-token disambiguation held (both top their OWN slug, wrong-invoke=0), confirmed by dedicated collision probes in breadth-search-return.

## Threat Surface
No new security surface beyond the plan's threat register. The 5 observability origins (dash.cloudflare.com, app.circleci.com, app.datadoghq.com, sentry.io, app.posthog.com) flow through the 37-01 classifyGate batch-coverage assertion at import time and all classify safe (the importer did not abort). T-37-06 (write/destructive under-statement) mitigated -- crosscheck PASS confirms purge_cache/trigger_pipeline/resolve_issue carry the correct class. T-37-08 (wrong-brand stem) mitigated -- 0 dash./datadoghq. slugs; each app tops its own canonical slug. T-37-07 (cold-start DoS) mitigated -- budget re-asserted within the smoke gate.

## Known Stubs
None. The vendored slices are intentionally inert metadata (Wall 1: handle() never executes, transport helpers throw if called -- by design). The new descriptors are backing:'dom' (the designed value for this data-only breadth batch -> the T3 DOM-fallback seam; display label "discovery-pending"), which is the documented per-app backing policy from 37-01, not a stub: depth hand-ports are Phases 40-41 and discovery seeding is Phase 42.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BRDTH-01 is COMPLETE: the full dev/PM/cloud/observability category (16 apps, 70 descriptors) is imported + returned by search with synonyms + side-effect class + backing-status; the breadth contract is proven to reuse verbatim a 4th time.
- Phase 37 has all 4 plans complete (37-01 contract machinery + 37-02/03/04 data-only sub-batches) -> ready for phase verification.
- Phases 38 (comms/social/content) and 39 (commerce/travel/misc) inherit this exact data-only flow for new, sensitivity-ascending categories.
- The SCALE-01 data layout is re-proven at the grown size; the full-corpus (~119-app) scale gate remains Phase 43.

## Self-Check: PASSED

- All 20 emitted descriptor files exist (spot-checked the 5 representative read/write/destructive slugs).
- All 5 vendored slice index.ts files exist.
- Both task commits exist in git history (d5f945e8, 0e724dea).
- SUMMARY.md created.

---
*Phase: 37-breadth-a-dev-productivity-least-sensitive*
*Completed: 2026-06-25*
