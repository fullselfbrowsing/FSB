---
phase: 37-breadth-a-dev-productivity-least-sensitive
plan: 02
subsystem: api
tags: [opentabs, capability-search, descriptors, stem-overrides, classification-gate, backing-status, atlassian, crosscheck, tsx, zod]

# Dependency graph
requires:
  - phase: 37-breadth-a-dev-productivity-least-sensitive
    plan: 01
    provides: "the FROZEN breadth machinery reused verbatim: enumerateBatchApps (directory enumeration), STEM_OVERRIDES (jira/confluence/cloudflare/datadog), MED-03 app-disambiguated synthSynonyms, backingFor='dom', the merge-time classifyGate batch-coverage gate, feedSeedDescriptors eval seed-feeding, the generalized no-dead-entry loader, and the breadth-search-return real-corpus proof"
  - phase: 36-codegen-pipeline-no-dead-entry-resolution
    provides: "the tsx/zod importer, shared side-effect-class.mjs (verb-map + GraphQL/RPC carve-out + override floor + fail-safe-high), the resolve() descriptor-only T3/T2 fallback, the catalog inlining (readJsonDir/IIFE/djb2 INV-01), verify-catalog-crosscheck.mjs"
provides:
  - "clickup (4 ops) + jira (5 ops) + confluence (4 ops) + airtable (5 ops) vendored as hermetic metadata-only slices + their 18 emitted opentabs__* descriptors"
  - "Proof the breadth contract reuses verbatim for a NEW sub-batch with ZERO machinery change (the thing 38/39 rely on): vendoring 4 dirs + running the importer was sufficient"
  - "The jira != confluence STEM_OVERRIDES distinctness proven on the SHARED *.atlassian.net host (T-37-08): distinct opentabs__jira__*/opentabs__confluence__* slug families, each tops its OWN slug, wrong-invoke=0"
  - "The destructive-class crosscheck exercised at breadth: airtable.delete_record classes destructive (DELETE method + delete_record override floor); no jira/confluence/airtable write under-states as read"
affects: [37-03, 37-04, 38-breadth-b, 39-breadth-c, 40-depth-1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-only sub-batch against frozen machinery: vendor N app dirs (metadata-only slices) -> enumerateBatchApps picks them up -> run the importer -> regen snapshot -> extend eval, with NO edit to the importer/search/gate"
    - "Two apps on a SHARED host (jira/confluence both *.atlassian.net) emit distinct slug families via the dir-name-keyed STEM_OVERRIDES -- the host collision never collapses them"
    - "Idempotent re-emit: re-running the importer leaves existing linear/asana/todoist descriptors byte-identical; only the new app descriptors + the importer-maintained seed/_provenance change"

key-files:
  created:
    - "vendor/opentabs-snapshot/plugins/clickup/** (package.json, sdk-stub.ts, index.ts, clickup-api.ts, 4 tools)"
    - "vendor/opentabs-snapshot/plugins/jira/** (package.json, sdk-stub.ts, index.ts, jira-api.ts, 5 tools)"
    - "vendor/opentabs-snapshot/plugins/confluence/** (package.json, sdk-stub.ts, index.ts, confluence-api.ts, 4 tools)"
    - "vendor/opentabs-snapshot/plugins/airtable/** (package.json, sdk-stub.ts, index.ts, airtable-api.ts, 5 tools incl destructive delete-record)"
    - "catalog/descriptors/opentabs__clickup__*.json (4), opentabs__jira__*.json (5), opentabs__confluence__*.json (4), opentabs__airtable__*.json (5)"
  modified:
    - "vendor/opentabs-snapshot/PIN.md (Phase 37 batch A sub-batch 2 row appended)"
    - "extension/catalog/recipe-index.generated.js (snapshot regenerated: 24->42 descriptors; INV-01 IIFE/djb2 unchanged)"
    - "catalog/descriptors/_fixtures/seed-descriptors.json (importer seed-fed 28->46; NOT hand-edited)"
    - "catalog/descriptors/_fixtures/_provenance.json (importer-maintained apps[])"
    - "catalog/descriptors/_fixtures/intent-cases.json (+22 new-app read/write/destructive eval cases)"
    - "tests/breadth-search-return.test.js (corpus 16->34 ops + jira!=confluence distinctness proof + new collision probes)"

key-decisions:
  - "jira/confluence use the REST `api`/`apiVoid` transport (Jira Cloud platform REST v3 + Confluence Cloud REST), NOT GraphQL -- so the side-effect class derives from the named-verb helper + {method:'...'} literal + op-name verb (matching the upstream Atlassian REST shape; linear's GraphQL pattern is only for genuinely-GraphQL apps)"
  - "package.json was NOT modified: the new apps' search-return assertions extend the ALREADY-registered tests/breadth-search-return.test.js rather than adding a new test file, so no npm test-chain registration change is needed (the plan's files_modified listed package.json optimistically)"
  - "airtable.delete_record uses apiVoid {method:'DELETE'} so the destructive signal is unambiguous on BOTH axes (DELETE method class + the delete_record SIDE_EFFECT_OVERRIDES floor) -- the crosscheck destructive proof is belt-and-suspenders"

patterns-established:
  - "Pattern (PROVEN reusable): a dev/productivity sub-batch is genuinely data-only -- vendoring the slices + running the frozen importer emitted the descriptors, seed-fed the eval, and passed every gate with no machinery touch. 37-03/04/38/39 inherit this exact flow."

requirements-completed: []  # BRDTH-01 continued (spans 37-04 + 38/39); not marked globally complete after plan 2 (continuation framing)

# Metrics
duration: ~10min
completed: 2026-06-25
---

# Phase 37 Plan 02: clickup / jira / confluence / airtable (data-only sub-batch) Summary

**The breadth contract reused VERBATIM for a second sub-batch with zero machinery change — vendoring clickup/jira/confluence/airtable as metadata-only slices + running the frozen 37-01 importer emitted 18 descriptors, seed-fed the eval, and passed every gate; jira and confluence emit DISTINCT slug families on the shared *.atlassian.net host via STEM_OVERRIDES (wrong-invoke=0), and airtable.delete_record classes destructive through the crosscheck.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-25
- **Tasks:** 2 (both committed atomically on `automation`)
- **Files:** 58 source files (35 vendored-slice files + PIN.md in Task 1; 18 emitted descriptors + snapshot + 4 fixture/test files in Task 2)

## Accomplishments
- **Four metadata-only slices vendored (Wall 1):** clickup (REST, 4 ops), jira (REST, 5 ops), confluence (REST, 4 ops), airtable (REST, 5 ops incl the destructive `delete_record`). Each mirrors the todoist/linear hermetic shape: a verbatim `sdk-stub.ts` identity factory + an inert `api`/`apiVoid` transport stub that throws if ever executed; every tool carries a real `z.object` input and a never-run `handle` whose comment names the upstream method. No `dist/`, no executed `handle()`, no runtime `.js`.
- **Imported via the FROZEN machinery (no importer edit):** `node scripts/import-opentabs-catalog.mjs` enumerated the four new dirs automatically and emitted `opentabs__clickup__*`/`opentabs__jira__*`/`opentabs__confluence__*`/`opentabs__airtable__*` (24->42 descriptors), seed-fed `seed-descriptors.json` (28->46), and the merge-time `classifyGate` passed (all four origins classify safe).
- **jira != confluence on the shared host (T-37-08 spoofing mitigation):** both derive to `atlassian.net`, but the dir-name-keyed `STEM_OVERRIDES` gave each a distinct canonical stem -> distinct slug families (`jira.create_issue` vs `confluence.create_page`). `breadth-search-return.test.js` proves each intent tops its OWN slug (jira-intent -> jira.*, confluence-intent -> confluence.*), never cross-invoking on the shared host.
- **Destructive crosscheck at breadth (T-37-06):** `airtable.delete_record` classes destructive (apiVoid `{method:'DELETE'}` + the `delete_record` override floor); all create/update/add ops class write; all get/list/search ops class read. `verify-catalog-crosscheck.mjs` passes (34 descriptors, no under-stated mutating op).
- **Snapshot regenerated, INV-01 held:** `recipe-index.generated.js` grew to 42 descriptors; the IIFE wrapper + `global.FsbRecipeIndex = DATA` + `module.exports` dual-export tail are byte-stable (only the DATA literal grew). `validate:extension` exits 0 (285 JS files parsed clean).
- **Eval extended and green:** `intent-cases.json` gained 22 new-app read/write/destructive cases (including BOTH a jira AND a confluence write); `capability-search-eval.test.js` -> recall@5=1.000, wrong-invoke=0.000 over 86 fixtures; serialized index 23.7KB < 50KB, cold-start 0.55ms < 10ms (the SCALE-01 budget holds at the larger size). `no-dead-entry.test.js` (generalized loader) checks the new descriptor-only slugs -> all resolve to a non-null T3 seam.

## Task Commits

1. **Task 1: Vendor clickup + jira + confluence + airtable metadata slices** — `8c144510` (feat) — four hermetic metadata-only slices (jira/confluence dirs named to hit STEM_OVERRIDES) + PIN.md per-phase log row.
2. **Task 2: Import via the frozen machinery + regen snapshot + extend eval** — `a55e9756` (feat) — 18 emitted descriptors (jira!=confluence distinct), snapshot regen (42 descriptors), +22 intent-cases, breadth-search-return extended to 34 ops + the jira!=confluence distinctness proof.

**Plan metadata:** (this docs commit) — SUMMARY + STATE + ROADMAP.

## Files Created/Modified
- `vendor/opentabs-snapshot/plugins/{clickup,jira,confluence,airtable}/**` — the four vendored metadata slices (package.json + sdk-stub.ts + index.ts + `<app>-api.ts` + per-op tool files).
- `vendor/opentabs-snapshot/PIN.md` — Phase 37 batch A sub-batch 2 row appended (append-only log).
- `catalog/descriptors/opentabs__{clickup,jira,confluence,airtable}__*.json` — 18 emitted closed-vocab descriptors (jira/confluence distinct via STEM_OVERRIDES).
- `extension/catalog/recipe-index.generated.js` — snapshot regenerated (42 descriptors; INV-01 IIFE/djb2 unchanged).
- `catalog/descriptors/_fixtures/{seed-descriptors,_provenance}.json` — importer-maintained (seed-fed + provenance apps[]); NOT hand-edited.
- `catalog/descriptors/_fixtures/intent-cases.json` — +22 new-app eval cases (read/write/destructive across the four apps, incl a jira AND a confluence write).
- `tests/breadth-search-return.test.js` — corpus filter broadened to the new apps (16->34 ops), count assertion updated, COLLISION_SET grown, and an explicit jira!=confluence distinctness block added.

## Decisions Made
- **jira/confluence transport = REST, not GraphQL.** Atlassian Cloud (Jira platform REST v3, Confluence Cloud REST) is REST, so the slices use the `api`/`apiVoid` helpers with explicit `{method:'...'}` literals. The side-effect derivation classes each op by the named-verb helper + method literal + op-name verb (linear's GraphQL carve-out is reserved for genuinely-GraphQL apps).
- **package.json untouched.** The new apps' search-return assertions extend the already-registered `breadth-search-return.test.js`, so no test-chain registration change was needed. (The plan's `files_modified` optimistically listed package.json; no edit was required — documented as a benign deviation below.)
- **Backing stays `dom` (canonical field value).** The dev/productivity batch has no hand-port (depth is Phases 40-41) and no seed (discovery is Phase 42); descriptors are decoupled from invocable (discovery-pending), exactly the breadth contract — not a stub that blocks the plan goal.

## Deviations from Plan

### Benign scope clarification (no auto-fix needed)

**1. [Plan files_modified vs actual] package.json NOT modified**
- **Found during:** Task 2 (extending the eval/proof tests).
- **Issue:** The plan frontmatter `files_modified` lists `package.json`, anticipating a possible new test-file registration.
- **Resolution:** The new-app search-return + jira!=confluence distinctness assertions were added to the EXISTING, already-registered `tests/breadth-search-return.test.js` (and the eval cases to the already-iterated `intent-cases.json`), so no npm test-chain registration change was needed. Editing package.json would have been a no-op churn. No machinery file was touched (importer/search/gates frozen per 37-01).
- **Files modified:** none beyond the planned set.
- **Commit:** N/A (a non-change).

Otherwise: plan executed exactly as written. No Rule 1-4 deviations; no auto-fixes required; the frozen machinery emitted, gated, and seed-fed the sub-batch with zero machinery change (the contract-reuse claim the plan set out to prove).

## Issues Encountered
None. The importer enumerated the four new dirs automatically, classifyGate passed on the first run, and every gate (validate:extension, crosscheck, no-dead-entry, breadth-search-return, capability-search-eval) went green without iteration.

## Threat Model Disposition
- **T-37-01 (unclassified origin -> EoP):** mitigated — the merge-time classifyGate ran over all four batch origins (app.clickup.com, *.atlassian.net jira+confluence, airtable.com); all classify safe and passed; the build still aborts on any unclassified origin (proven by the untouched breadth-batch-gate fixture test).
- **T-37-06 (write/destructive under-stated as read):** mitigated — airtable.delete_record classes destructive; jira/confluence create/update/add class write; verify-catalog-crosscheck.mjs exit 0 (no under-statement).
- **T-37-08 (jira/confluence host collision -> spoofed routing):** mitigated — STEM_OVERRIDES gives distinct stems; the eval + breadth-search-return assert each tops its OWN slug on the shared host with wrong-invoke=0.
- **T-37-04 (forbidden field name -> Wall 1):** mitigated — the importer's recursive forbidden-field pre-scan (unchanged) ran on every emitted op; import-forbidden-prescan + recipe-path-guard + provenance-scaffold green (no runtime .js vendored).
- **T-37-SC (package installs):** N/A — no new packages this plan (data-only vendoring).

## Known Stubs
None that block the plan goal. All 18 descriptors carry `backing:'dom'` (the canonical "discovery-pending" seam value) by design: Phase 37 imports descriptors as DATA and decouples discoverable from invocable — real hand-ported handlers are Phases 40-41 (depth) and discovery seeding is Phase 42. A `dom`-backed descriptor returns from search annotated `discovery-pending` (never a confident invocable hit) and resolves to the T3 DOM-fallback seam (verified by no-dead-entry). This is the intended breadth contract, not an unfinished stub.

## Next Phase Readiness
- The contract is re-proven reusable: 37-03/04 (and 38/39) can vendor data-only slices that `enumerateBatchApps` picks up automatically; STEM_OVERRIDES already covers the remaining collision hosts (cloudflare/datadog).
- `validate:extension` exit 0; crosscheck + no-dead-entry + the eval (86 fixtures) + breadth-search-return (34 ops) green on the grown corpus; the merge-time batch gate still aborts on an unclassified origin.
- No blockers.

## Self-Check: PASSED

- Created files verified present: clickup/jira/confluence/airtable `src/index.ts`, airtable `delete-record.ts`, `opentabs__jira__create_issue.json`, `opentabs__confluence__create_page.json`, `opentabs__airtable__delete_record.json`, the regenerated `recipe-index.generated.js`, and this SUMMARY.
- Commits verified in git history: `8c144510` (Task 1 — vendored slices), `a55e9756` (Task 2 — import + snapshot + eval).
- Verification re-run green on the grown corpus: `validate:extension` / `verify-catalog-crosscheck.mjs` / `no-dead-entry` / `breadth-search-return` (34 ops, jira!=confluence) / `capability-search-eval` (86 fixtures, recall@5=1.000 wrong-invoke=0.000) / breadth-batch-gate / backing-status-annotation all exit 0.

---
*Phase: 37-breadth-a-dev-productivity-least-sensitive*
*Completed: 2026-06-25*
