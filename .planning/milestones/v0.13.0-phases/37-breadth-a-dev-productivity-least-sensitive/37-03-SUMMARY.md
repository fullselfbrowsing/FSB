---
phase: 37-breadth-a-dev-productivity-least-sensitive
plan: 03
subsystem: api
tags: [opentabs, capability-search, descriptors, classification-gate, backing-status, crosscheck, gitlab, bitbucket, vercel, netlify, tsx, zod]

# Dependency graph
requires:
  - phase: 37-breadth-a-dev-productivity-least-sensitive
    plan: 01
    provides: "the FROZEN breadth machinery reused verbatim: enumerateBatchApps (directory enumeration), STEM_OVERRIDES, MED-03 app-disambiguated synthSynonyms, backingFor='dom', the merge-time classifyGate batch-coverage gate, feedSeedDescriptors eval seed-feeding, the generalized no-dead-entry loader, and the breadth-search-return real-corpus proof"
  - phase: 37-breadth-a-dev-productivity-least-sensitive
    plan: 02
    provides: "the proven data-only sub-batch flow (vendor N dirs + run the importer + regen + extend eval, zero machinery edit) -- 37-03 is the third instance of that exact flow"
  - phase: 36-codegen-pipeline-no-dead-entry-resolution
    provides: "the tsx/zod importer, shared side-effect-class.mjs (verb-map + GraphQL/RPC carve-out + override floor + fail-safe-high), the resolve() descriptor-only T3/T2 fallback, the catalog inlining (readJsonDir/IIFE/djb2 INV-01), verify-catalog-crosscheck.mjs"
provides:
  - "gitlab (4 ops) + bitbucket (4 ops) + vercel (4 ops) + netlify (4 ops) vendored as hermetic metadata-only slices + their 16 emitted opentabs__* descriptors (the code-hosting + deploy slice)"
  - "Re-proof that the breadth contract reuses verbatim with ZERO machinery change AND zero STEM_OVERRIDES entry -- all four hosts (gitlab.com/bitbucket.org/vercel.com/app.netlify.com) derive their correct stems unaided"
  - "The write-op crosscheck exercised on four new mutating ops: gitlab.create_merge_request / bitbucket.create_pull_request / vercel.create_deployment / netlify.create_deploy all class write (never read); crosscheck PASS (T-37-06 mitigated)"
  - "merge-request (gitlab) vs pull-request (bitbucket) and deployment (vercel) vs deploy (netlify) proven to disambiguate by app/origin in the real-corpus collision set (wrong-invoke=0)"
affects: [37-04, 38-breadth-b, 39-breadth-c, 40-depth-1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-only sub-batch against frozen machinery (third instance): vendor 4 app dirs (metadata-only slices) -> enumerateBatchApps picks them up -> run the importer -> regen snapshot -> extend eval, with NO edit to the importer/search/gate and NO STEM_OVERRIDES entry"
    - "A REST write op is made crosscheck-unambiguous by referencing `api` with an explicit {method:'POST'} literal in its (never-run) handle closure -- the importer's static signal scan reads the helper + method literal so the op-name verb AND the method both class write"
    - "Idempotent re-emit: re-running the importer leaves the existing 42 descriptors byte-identical; only the 16 new app descriptors + the importer-maintained seed/_provenance change"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/gitlab/** (package.json, sdk-stub.ts, index.ts, gitlab-api.ts, 4 tools: list/get/create_issue + create_merge_request)"
    - "vendor/opentabs-snapshot/plugins/bitbucket/** (package.json, sdk-stub.ts, index.ts, bitbucket-api.ts, 4 tools: list/get/create_pull_request + list_repositories)"
    - "vendor/opentabs-snapshot/plugins/vercel/** (package.json, sdk-stub.ts, index.ts, vercel-api.ts, 4 tools: list/get_deployment + list_projects + create_deployment)"
    - "vendor/opentabs-snapshot/plugins/netlify/** (package.json, sdk-stub.ts, index.ts, netlify-api.ts, 4 tools: list/get_site + list_deploys + create_deploy)"
    - "catalog/descriptors/opentabs__gitlab__*.json (4), opentabs__bitbucket__*.json (4), opentabs__vercel__*.json (4), opentabs__netlify__*.json (4)"
  modified:
    - "vendor/opentabs-snapshot/PIN.md (Phase 37 batch A sub-batch 3 row appended)"
    - "extension/catalog/recipe-index.generated.js (snapshot regenerated: 42->58 descriptors; INV-01 IIFE/djb2 unchanged, only DATA grew)"
    - "catalog/descriptors/_fixtures/seed-descriptors.json (importer seed-fed 46->62; NOT hand-edited)"
    - "catalog/descriptors/_fixtures/_provenance.json (importer-maintained apps[])"
    - "catalog/descriptors/_fixtures/intent-cases.json (+20 new-app read/write eval cases)"
    - "tests/breadth-search-return.test.js (corpus 34->50 ops + 5 new collision probes: merge-request vs pull-request, deployment vs deploy)"

key-decisions:
  - "gitlab/bitbucket use the REST `api`/`apiVoid` transport (GitLab REST API v4 + Bitbucket Cloud REST 2.0), NOT GraphQL -- even though both upstreams are GraphQL/REST-mixed, the REST shape with explicit {method:'POST'} literals makes the create_* write class unambiguous via the op-name verb + the method literal, exactly as the plan's interfaces block directs (use the create/list/get op-name verb the shared module recognizes). linear's GraphQL carve-out is reserved for genuinely-GraphQL apps."
  - "NO STEM_OVERRIDES entry was added: gitlab.com->gitlab, bitbucket.org->bitbucket, vercel.com->vercel, and app.netlify.com->netlify (via the leading 'app.' strip) all derive correctly through the frozen host-derivation -- the sub-batch is genuinely data-only against the corrected Plan-01 machinery."
  - "package.json was NOT modified: the new apps' search-return assertions extend the ALREADY-registered tests/breadth-search-return.test.js rather than adding a new test file, so no npm test-chain registration change is needed (the plan's files_modified did not list package.json, consistent with 37-02)."
  - "The four sdk-stub.ts files are verbatim copies of the Plan-01/02 stub (only the single in-comment app-name reference differs) -- the Wall-1 'VERBATIM copy' requirement; tests/provenance-scaffold.test.js confirms vendor/ still contains no runtime .js."

patterns-established:
  - "Pattern (re-proven, third time): a dev/cloud sub-batch is genuinely data-only -- vendoring the slices + running the frozen importer emitted the descriptors, seed-fed the eval, and passed every gate with no machinery touch and no STEM_OVERRIDES entry. 37-04/38/39 inherit this exact flow."
  - "Pattern: a code-hosting/deploy app's write op (create_merge_request/create_pull_request/create_deployment/create_deploy) is classed write by the op-name 'create' verb AND reinforced by the {method:'POST'} literal -- belt-and-suspenders for T-37-06."

requirements-completed: []  # BRDTH-01 continued (spans 37-04 + 38/39); not marked globally complete after plan 3 (continuation framing, consistent with 37-01/02)

# Metrics
duration: ~12min
completed: 2026-06-25
---

# Phase 37 Plan 03: gitlab / bitbucket / vercel / netlify (data-only sub-batch) Summary

**The code-hosting + deploy sub-batch (16 descriptors) imported through the FROZEN 37-01 machinery with ZERO importer edit and ZERO STEM_OVERRIDES entry -- all four hosts derive their correct stems unaided, four new create_* write ops class write (crosscheck PASS), snapshot regenerated to 58 descriptors, eval grown to 106 fixtures green (recall@5=1.000, wrong-invoke=0).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-25T07:29Z
- **Completed:** 2026-06-25T07:41Z
- **Tasks:** 2 (both TDD)
- **Files modified/created:** 54 (33 new vendored slice files + PIN.md + 16 new descriptor JSONs + 4 fixture/snapshot/test files)

## Accomplishments
- Vendored gitlab/bitbucket/vercel/netlify as hermetic metadata-only TS slices (Wall 1: verbatim sdk-stub, inert api/apiVoid throwers, NO dist/, NO executed handle()); all four import under tsx with >=4 ops each.
- Ran `node scripts/import-opentabs-catalog.mjs` with ZERO machinery edit -- enumerateBatchApps auto-discovered the 4 new dirs and emitted 16 descriptors (42->58 on disk; 50 emitted by the importer); the merge-time classifyGate passed (all four origins classify safe); feedSeedDescriptors seed-fed all 16 new slugs (46->62).
- All four new write ops (gitlab.create_merge_request, bitbucket.create_pull_request, vercel.create_deployment, netlify.create_deploy) class **write**, never read; verify-catalog-crosscheck.mjs PASS (50 descriptors, no under-statement) -- T-37-06 mitigated.
- Snapshot regenerated (58 descriptors; INV-01 IIFE first-line byte-identical, djb2/dual-export structure preserved, only DATA grew); `npm run validate:extension` exits 0 with the full chained gate green (recipe-path-guard, classification-gate, crosscheck).
- Eval extended: capability-search-eval recall@5=1.000 wrong-invoke=0.000 over **106 fixtures** (+20); breadth-search-return 50 ops / 12 collision probes green incl. the new merge-request-vs-pull-request and deployment-vs-deploy near-neighbor pairs; SCALE-01 holds (index 32.3KB<50KB, cold-start 0.67ms<10ms).

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor gitlab + bitbucket + vercel + netlify metadata slices** - `d2b7f0e9` (feat)
2. **Task 2: Import the sub-batch via the Plan-01 importer, regenerate the snapshot, extend the eval** - `720b2994` (feat)

**Plan metadata:** (this SUMMARY + STATE.md + ROADMAP.md) - committed separately as `docs(37-03)`.

_Note: both tasks are tdd="true"; the importer-is-run-not-written nature of the work (the frozen machinery emits the descriptors) meant each task's RED was the failing acceptance verification and GREEN was the slice/emit landing -- committed as a single feat per task rather than separate test/feat commits, since there is no hand-written production code to test-drive (the slices are metadata, the gates are pre-existing)._

## Files Created/Modified

**Vendored slices (created, Task 1):**
- `vendor/opentabs-snapshot/plugins/gitlab/**` - GitLab REST slice: list_issues, get_issue, create_issue, create_merge_request
- `vendor/opentabs-snapshot/plugins/bitbucket/**` - Bitbucket REST slice: list_pull_requests, get_pull_request, create_pull_request, list_repositories
- `vendor/opentabs-snapshot/plugins/vercel/**` - Vercel REST slice: list_deployments, get_deployment, list_projects, create_deployment
- `vendor/opentabs-snapshot/plugins/netlify/**` - Netlify REST slice: list_sites, get_site, list_deploys, create_deploy
- `vendor/opentabs-snapshot/PIN.md` - appended the Phase 37 batch A sub-batch 3 per-phase log row

**Emitted + regenerated (Task 2):**
- `catalog/descriptors/opentabs__{gitlab,bitbucket,vercel,netlify}__*.json` (16) - the emitted closed-vocab descriptors
- `extension/catalog/recipe-index.generated.js` - snapshot regenerated 42->58 descriptors (INV-01 unchanged)
- `catalog/descriptors/_fixtures/seed-descriptors.json` - importer seed-fed 46->62 (NOT hand-edited)
- `catalog/descriptors/_fixtures/_provenance.json` - importer-maintained apps[]
- `catalog/descriptors/_fixtures/intent-cases.json` - +20 read/write eval cases for the new apps
- `tests/breadth-search-return.test.js` - corpus filter + count (34->50) + 5 new collision probes

## Decisions Made
See key-decisions in the frontmatter. In brief: REST `api`/`apiVoid` transport with explicit {method:'POST'} literals for the gitlab/bitbucket write ops (not GraphQL) to make the write class unambiguous; no STEM_OVERRIDES entry (all four stems derive correctly); package.json untouched (extended the already-registered breadth-search-return test); verbatim sdk-stub copies (Wall-1).

## Deviations from Plan

None - plan executed exactly as written.

The frozen machinery (importer, side-effect-class.mjs, capability-search.js, the gates, the no-dead-entry/eval harnesses) was run, never edited. The plan's prediction that this sub-batch is genuinely data-only against the corrected Plan-01 machinery (no STEM_OVERRIDES, no importer edit) held exactly: vendoring the four slices + running the importer was sufficient, and every gate stayed green on the grown 58-descriptor corpus.

## Issues Encountered
None. All four origins classified safe on the first classifyGate run; all create_* ops classed write on the first crosscheck; the eval and breadth-search-return passed at recall@5=1.000 / wrong-invoke=0 without any synonym/fixture tuning iteration.

## User Setup Required
None - no external service configuration required (data-only vendoring; no new packages installed, T-37-SC accept).

## Next Phase Readiness
- 37-03 complete (plan 3 of 4). The breadth corpus is now 58 descriptors across 11 dev/productivity apps (linear/asana/todoist/clickup/jira/confluence/airtable/gitlab/bitbucket/vercel/netlify).
- 37-04 is the final Phase-37 sub-batch (e.g. cloudflare/datadog/sentry/posthog/circleci -- STEM_OVERRIDES already covers cloudflare/datadog). The data-only flow is now proven three times; 37-04 inherits it verbatim.
- No blockers. INV-01 IIFE/djb2 unchanged; validate:extension exit 0; all gates green.

## Self-Check: PASSED

- All created files verified present (4 slice index.ts, 4 create_* write descriptors, the regenerated snapshot, this SUMMARY).
- Both task commits verified in git log: `d2b7f0e9` (Task 1), `720b2994` (Task 2).

---
*Phase: 37-breadth-a-dev-productivity-least-sensitive*
*Completed: 2026-06-25*
