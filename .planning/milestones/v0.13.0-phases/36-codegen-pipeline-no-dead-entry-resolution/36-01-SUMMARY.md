---
phase: 36-codegen-pipeline-no-dead-entry-resolution
plan: 01
subsystem: codegen-pipeline
tags: [opentabs, zod, tsx, json-schema, descriptor-catalog, wall-1, denylist-gate, todoist, provenance]

# Dependency graph
requires:
  - phase: 35-denylist-expansion-import-classification-gate
    provides: "classifyGate(items, opts) dual-export + service-denylist.js classify()/load() (the denylist-first emit gate the importer calls before writing)"
  - phase: 35-denylist-expansion-import-classification-gate
    provides: "vendor/opentabs-snapshot/{PIN.md,_provenance.json} SHA pin (4b170216, MIT) + catalog/descriptors/_fixtures/_provenance.json apps:[] scaffold"
provides:
  - "scripts/import-opentabs-catalog.mjs: build-time tsx importer (z.toJSONSchema -> closed params; recursive Wall-1 forbidden-field pre-scan; side-effect inference verb-map+GraphQL/RPC-carve-out+override, fail-safe-high; classifyGate-before-emit; FLAT provenance-stamped emit)"
  - "The flat-emit descriptor contract: catalog/descriptors/opentabs__<service-stem>__<op>.json with provenance carried IN-descriptor (the opentabs/ namespace is the filename prefix + provenance.source, NOT a physical subdir -- readJsonDir is non-recursive)"
  - "7 emitted todoist smoke descriptors (read/write/destructive across the api + apiVoid transport helpers) + the filled catalog _provenance.json apps[]"
  - "Reconciled extension/catalog/recipe-index.generated.js snapshot (8 -> 15 descriptors; INV-01 byte-stable wrapper/djb2)"
  - "package.json phase-wide CI registration: zod/tsx/@opentabs-dev/plugin-sdk as devDependencies; verify-catalog-crosscheck.mjs + 7 Phase-36 test files registered as passing stubs"
affects: [37-breadth-a, 38-breadth-b, 39-breadth-c, 40-depth-1, 41-depth-2, 36-02-no-dead-entry-resolve, 36-03-crosscheck-gate, 36-04-inline-eval]

# Tech tracking
tech-stack:
  added: [zod@4.4.3 (devDep), tsx@4.22.4 (devDep), "@opentabs-dev/plugin-sdk@0.0.113 (devDep)"]
  patterns:
    - "Build-time-only metadata import: tsx transpiles vendored OpenTabs TS on import(); handle() bodies NEVER execute (no fetch/document at build); zod/sdk are devDeps, never shipped (Wall 1)"
    - "Hermetic SDK/transport stubs (sdk-stub.ts, todoist-api.ts) so import() resolves defineTool/OpenTabsPlugin/api/apiVoid without dragging the real SDK's DOM/fetch surface into the importer's graph"
    - "z.toJSONSchema(input) is the closed-params contract for free (z.object() emits additionalProperties:false by default); strip only $schema; let .transform() throw loud"
    - "Recursive forbidden-field pre-scan over the FLATTENED JSON Schema (a SEPARATE Wall-1 guard from verify-recipe-path-guard.mjs, which scans recipe-path FILES not descriptor FIELD names)"
    - "Side-effect inference: GraphQL/RPC carve-out (name decides, never auto-read) -> named/generic helper method -> op-name verb -> override floor, all MAX-merged fail-safe-high; raw signals persisted into provenance for the Plan-03 re-derive"
    - "Co-locate the snapshot regen with the emit (one coherent commit) so this plan's own validate:extension assertion is satisfiable the moment descriptors land"

key-files:
  created:
    - scripts/import-opentabs-catalog.mjs
    - scripts/verify-catalog-crosscheck.mjs (stub; Plan 03 fills)
    - vendor/opentabs-snapshot/plugins/todoist/package.json
    - vendor/opentabs-snapshot/plugins/todoist/src/{index.ts,sdk-stub.ts,todoist-api.ts}
    - vendor/opentabs-snapshot/plugins/todoist/src/tools/{schemas,create-task,list-tasks,get-task,update-task,delete-task,close-task,reopen-task}.ts
    - tests/import-extraction.test.js
    - tests/import-forbidden-prescan.test.js
    - tests/import-classify-gate-call.test.js
    - "catalog/descriptors/opentabs__todoist__*.json (7 flat descriptors)"
    - "tests/{catalog-crosscheck,no-dead-entry,catalog-inline-shape,head-handler-cap}.test.js (stubs; Plans 02/03/04 fill)"
  modified:
    - package.json (devDeps + test/validate:extension chains)
    - package-lock.json
    - extension/catalog/recipe-index.generated.js (regenerated, +390/-0)
    - catalog/descriptors/_fixtures/_provenance.json (apps[] filled)
    - tests/provenance-scaffold.test.js (catalog-side apps[] now filled by Phase 36)

key-decisions:
  - "Vendored a hermetic sdk-stub.ts + transport stub (RESEARCH Alternatives hardening) instead of importing the real @opentabs-dev/plugin-sdk index, because its index re-exports dom.js/fetch.js/storage.js -- DOM/fetch transitive surface the importer must not drag in. The SDK stays a pinned devDependency (lockfile + Wall-1 audit) but the vendored todoist source imports defineTool/OpenTabsPlugin from the local stub."
  - "Flat emit (RESEARCH A1): opentabs__<svc>__<op>.json with provenance in-descriptor; readJsonDir non-recursion verified in BOTH package-extension.mjs and validate-extension.mjs, so a subdir would be silently dropped."
  - "service = the authoritative upstream urlPattern host (app.todoist.com from *://app.todoist.com/*); serviceStem = todoist for the slug (todoist.<op>). app.todoist.com classifies benign (0 classifyGate failures)."
  - "Vendored a representative 7-op Tasks slice (not all 34 todoist ops) -- enough to prove the machinery across read (GET via api), write (POST via api/apiVoid), and destructive (DELETE via apiVoid). Full surface is Phases 37-39."

patterns-established:
  - "tsx-importer + hermetic-stub: vendored OpenTabs metadata imports from local stubs; the importer reads .name/.description/.input/.group/.summary only; handle() never runs"
  - "classifyGate-before-emit (denylist-first floor): gateItems() awaits Denylist.load() then classifyGate(); a non-empty failures[] aborts the entire emit (writes nothing)"
  - "fail-safe-high side-effect derivation with provenance-persisted signals (transportHelper/httpMethod/opNameVerb) so downstream gates re-derive without re-parsing TS"

requirements-completed: [CGEN-01]

# Metrics
duration: ~22min
completed: 2026-06-24
---

# Phase 36 Plan 01: OpenTabs Descriptor Importer + Flat Emit + Catalog Snapshot Regen Summary

**Build-time tsx importer that turns the pinned OpenTabs todoist plugin metadata into 7 flat closed-`params` (additionalProperties:false) provenance-stamped descriptors -- gated by Phase-35's classifyGate and a recursive Wall-1 forbidden-field pre-scan before emit -- then regenerates the committed catalog snapshot (8->15 descriptors) so validate:extension reconciles, with zod/tsx/sdk as devDependencies only (no runtime ships).**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-24T16:40Z (approx)
- **Completed:** 2026-06-24T17:02:44Z
- **Tasks:** 4
- **Files modified/created:** 33 files (2705 insertions, 7 deletions across the 4 task commits)

## Accomplishments
- `scripts/import-opentabs-catalog.mjs`: the load-bearing build-time emit path -- `z.toJSONSchema(input)` closed-params extraction, recursive forbidden-field pre-scan (script/expr/transform/code/fn/js at any depth), side-effect inference (verb-map + GraphQL/RPC carve-out + override table, fail-safe-high MAX), `classifyGate()` after `Denylist.load()` BEFORE any write, FLAT provenance-stamped emit, and the `_provenance.json` apps[] fill.
- Vendored a hermetic metadata-only 7-op Tasks slice of the OpenTabs todoist plugin (SHA 4b170216) under `vendor/opentabs-snapshot/plugins/todoist/` -- Wall 1 holds (no dist/, no handle() runtime; the importer's import() never touches the real SDK's DOM/fetch surface).
- 7 emitted todoist descriptors with correct side-effect classes (list/get -> read; create/update/close/reopen -> write; delete -> destructive) + closed params + provenance signals; the catalog snapshot regenerated to inline them (descriptors 8 -> 15) with the IIFE/djb2 wrapper byte-stable (INV-01, +390/-0).
- package.json hardened (zod/tsx/sdk -> devDependencies only) + the whole phase's tests/gate registered as passing stubs so CI stays green across every wave.

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden dependency surface + scaffold phase-wide CI registration** - `f47b26b6` (chore)
2. **Task 2: Vendor todoist metadata + write the importer (extraction + provenance + flat emit + classifyGate-before-emit)** - `c9685625` (feat)
3. **Task 3: The Wall-1 recursive forbidden-field pre-scan** - `3044df46` (feat)
4. **Task 4: Regenerate the committed catalog snapshot so validate:extension reconciles** - `68280a09` (feat)

_TDD tasks (2 and 3): tests were authored and confirmed RED before the implementation made them GREEN, but each task is a single coherent commit per the sequential executor's one-commit-per-task contract._

## Files Created/Modified
- `scripts/import-opentabs-catalog.mjs` - the build-time tsx importer (exports toClosedParams/collectPropertyNames/preScanForbidden/assertCleanParams/inferSideEffect/verbPrefix/gateItems/extractDescriptors/runImport)
- `scripts/verify-catalog-crosscheck.mjs` - passing dual-export STUB (exit 0 + no-op crossCheck) registered in validate:extension; Plan 03 fills the real derived-vs-declared gate
- `vendor/opentabs-snapshot/plugins/todoist/**` - hermetic metadata slice (package.json with the authoritative urlPatterns; index.ts; sdk-stub.ts; todoist-api.ts; 7 tool .ts + schemas.ts)
- `catalog/descriptors/opentabs__todoist__*.json` - 7 flat closed-params provenance-stamped descriptors
- `catalog/descriptors/_fixtures/_provenance.json` - apps[] filled with the todoist entry (SHA + emitted slugs)
- `extension/catalog/recipe-index.generated.js` - regenerated snapshot (+390/-0; todoist descriptors inlined into DATA.descriptors)
- `package.json` / `package-lock.json` - zod/tsx/@opentabs-dev/plugin-sdk devDeps; 7 tests + crosscheck registered
- `tests/import-{extraction,forbidden-prescan,classify-gate-call}.test.js` - the 3 importer tests (real)
- `tests/{catalog-crosscheck,no-dead-entry,catalog-inline-shape,head-handler-cap}.test.js` - passing stubs (Plans 02/03/04 fill)
- `tests/provenance-scaffold.test.js` - updated so the catalog-side apps[] assertion reflects Phase 36 filling it

## Decisions Made
- Vendored a hermetic SDK stub + transport stub instead of importing the real SDK index (which re-exports DOM/fetch modules). The SDK remains a pinned devDependency (satisfies the acceptance check + Wall-1 audit) but is never in the importer's actual import graph.
- Flat emit (A1) with in-descriptor provenance; the `opentabs/` namespace is the filename prefix + `provenance.source`, not a subdir (readJsonDir non-recursion verified in both readers).
- `service` is the authoritative upstream urlPattern host `app.todoist.com`; the slug stem is `todoist`. Verified `app.todoist.com` classifies benign through classifyGate (0 failures).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated tests/provenance-scaffold.test.js stale `apps: []` assertion**
- **Found during:** Task 2 (vendor + importer; the importer fills the catalog-side _provenance.json apps[])
- **Issue:** The Phase-35 provenance-scaffold test asserted the CATALOG-side `_provenance.json` had `apps.length === 0`. Phase 36's defined job is to FILL that apps[] (the plan's own must_haves + the scaffold's own `_note` say Phase 36 extends it), so the assertion was stale the moment the importer ran -- it would fail `npm test` for the rest of the milestone.
- **Fix:** Changed only the catalog-side assertion to require a non-empty apps[] where every entry pins the SHA + source 'opentabs' + names >=1 emitted descriptor. The VENDOR-side assertion (the authoritative pin) still asserts `apps: []` unchanged.
- **Files modified:** tests/provenance-scaffold.test.js
- **Verification:** `node tests/provenance-scaffold.test.js` -> PASS=17 FAIL=0 (was 15/1)
- **Committed in:** c9685625 (Task 2 commit)

**2. [Rule 3 - Blocking] Restructured import-classify-gate-call.test.js to run the end-to-end emit under tsx**
- **Found during:** Task 2 (the test's end-to-end emit check)
- **Issue:** The test runs under plain `node` (as `npm test` invokes it), but the importer's `runImport()` does `await import(index.ts)` which requires the tsx loader to transpile the vendored TS; under plain node it threw ERR_MODULE_NOT_FOUND. `tsx/esm` programmatic registration warns/refuses under modern node.
- **Fix:** The test imports the module under plain node for the `gateItems` checks (which never import the plugin TS), and runs the end-to-end emit the documented way -- as a `node --import tsx ...` child process -- then asserts the flat descriptors exist. This is the faithful "the gate is wired before emit; the benign path writes" proof.
- **Files modified:** tests/import-classify-gate-call.test.js
- **Verification:** `node tests/import-classify-gate-call.test.js` -> PASS (6 checks)
- **Committed in:** c9685625 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were necessary to keep CI green and to make the classify-gate test runnable under the standard `npm test` harness. No scope creep -- both touch only test files this plan owns; the importer/emit/snapshot contract is exactly as the plan specified.

## Known Stubs

These are INTENTIONAL CI-green scaffolds (the plan's `must_haves` register them so CI stays green at every wave; later plans fill the bodies in-place WITHOUT re-touching package.json):

| File | Status | Filled by | Reason it does not block this plan |
|------|--------|-----------|------------------------------------|
| `scripts/verify-catalog-crosscheck.mjs` | passing dual-export stub (exit 0, no-op `crossCheck`) | Plan 36-03 | The real derived-vs-declared cross-check is CGEN-02 (Plan 03). The importer already STAMPS the side-effect class + persists the raw signals; this gate verifies them later. |
| `tests/catalog-crosscheck.test.js` | passing stub | Plan 36-03 | CGEN-02 acceptance. |
| `tests/no-dead-entry.test.js` | passing stub | Plan 36-02 | CGEN-03 (the resolve() fallback) is Plan 02. |
| `tests/catalog-inline-shape.test.js` | passing stub | Plan 36-04 | CGEN-04 IIFE/djb2 structural lock is Plan 04 (this plan already proves the regen reconciles + is additive-only). |
| `tests/head-handler-cap.test.js` | passing stub | Plan 36-04 | The HEAD_HANDLER_MODULES cap assertion is Plan 04 (this plan adds zero head handlers). |

All emitted descriptors carry real `params` (no empty/placeholder data); the importer's own emit path is fully wired, not stubbed.

## Issues Encountered
- The real `@opentabs-dev/plugin-sdk` index re-exports DOM/fetch modules; resolved by the hermetic stub (documented hardening), keeping the importer's import graph free of that surface while still pinning the SDK as a devDependency.
- The dist zip (`dist/fsb-extension-v0.9.91.zip`) that package-extension.mjs rebuilds is gitignored and correctly excluded from commits.

## User Setup Required
None - no external service configuration required. (zod/tsx/@opentabs-dev/plugin-sdk install cleanly from the public npm registry; all slopcheck-cleared in RESEARCH. jiti deliberately excluded.)

## Next Phase Readiness
- The emit path + the flat-descriptor contract + the classifyGate-before-emit floor + the Wall-1 pre-scan are proven on the todoist smoke set. Phases 37-39 reuse `scripts/import-opentabs-catalog.mjs` batch by batch (add app stems to SMOKE_APPS / a breadth list; the machinery is unchanged).
- Plan 36-02 (CGEN-03) wires the `capability-catalog.js resolve()` descriptor-only fallback so the 7 (now-searchable) todoist slugs resolve to a non-null tier; the descriptors stamp `backing:'dom'` -> the T3 leg, exactly as the resolve() branch expects.
- Plan 36-03 (CGEN-02) replaces the `verify-catalog-crosscheck.mjs` stub with the real fail-safe-high derived-vs-declared gate; the importer already persists `provenance.signals` (transportHelper/httpMethod/opNameVerb) for it to re-derive.
- Plan 36-04 (CGEN-04) locks the IIFE/djb2 shape + the HEAD_HANDLER_MODULES cap and extends the eval harness.

## Self-Check: PASSED

- All 10 key created files verified on disk (importer, crosscheck stub, a representative emitted descriptor, the filled _provenance.json, the regenerated snapshot, the vendored index, the 3 importer tests, the SUMMARY).
- All 4 task commits verified in git log (f47b26b6, c9685625, 3044df46, 68280a09).
- The committed `extension/catalog/recipe-index.generated.js` contains the inlined `todoist.` slugs (the emit + snapshot reconcile landed in one coherent commit).
- `npm run validate:extension` exits 0 (validate-extension reconciled, recipe-path-guard, classification-gate, crosscheck stub); the 3 importer tests + provenance-scaffold + capability-search-eval all pass.

---
*Phase: 36-codegen-pipeline-no-dead-entry-resolution*
*Completed: 2026-06-24*
