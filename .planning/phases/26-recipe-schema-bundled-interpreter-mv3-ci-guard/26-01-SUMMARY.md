---
phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
plan: 01
subsystem: api
tags: [json-schema, cfworker, jmespath, minisearch, mv3, service-worker, recipe-as-data, esbuild, iife]

# Dependency graph
requires:
  - phase: (none)
    provides: greenfield-additive; first plan of the v0.9.99 Native Capability Catalog milestone
provides:
  - "extension/lib/cfworker-json-schema.min.js — eval-free JSON Schema validator IIFE (global CfworkerJsonSchema)"
  - "extension/lib/minisearch.min.js — vendored UMD (global MiniSearch), shipped per CAP-05, wired Phase 28"
  - "extension/lib/jmespath.min.js — vendored UMD (lowercase global jmespath) for read-only extract"
  - "extension/utils/capability-recipe-schema.js — RECIPE_SCHEMA + FSB_RECIPE_SCHEMA_VERSION + validateRecipe (typed RECIPE_* returns)"
  - "catalog/recipes/_fixtures/*.json — shared accept/reject fixture set (single source of truth for the Plan 03 CI guard)"
  - "additive importScripts boot chain for the three libs + the recipe-schema module"
affects: [phase-27-authenticated-fetch, phase-28-mcp-search, phase-29-catalog-router, plan-02-interpreter, plan-03-ci-guard, errors.ts-RECIPE-family]

# Tech tracking
tech-stack:
  added: ["@cfworker/json-schema@4.1.1 (IIFE-bundled, vendored)", "jmespath@0.16.0 (vendored UMD)", "minisearch@7.2.0 (vendored UMD)"]
  patterns:
    - "Build-time esbuild one-off IIFE bundle emitting to extension/lib/ (NOT the esbuild.config.js ENTRIES array, which emits to extension/dist/)"
    - "Dual-export IIFE SW module (global + module.exports) cloned from trigger-store.js/value-extractor.js"
    - "typeof-guarded vendored-global accessor (getFSBRecipeValidator) cloned from ws-client.js getFSBLZStringCodec"
    - "Closed-vocabulary JSON Schema (additionalProperties:false at every structural level) + defense-in-depth forbidden-name pre-scan"
    - "Typed RECIPE_* RETURN shape (code + errorCode both set) cloned from createMcpOwnershipError"

key-files:
  created:
    - extension/lib/cfworker-json-schema.min.js
    - extension/lib/minisearch.min.js
    - extension/lib/jmespath.min.js
    - extension/utils/capability-recipe-schema.js
    - catalog/recipes/_fixtures/valid-recipe.json
    - catalog/recipes/_fixtures/reject-field-script.json
    - catalog/recipes/_fixtures/reject-field-expr.json
    - catalog/recipes/_fixtures/reject-field-transform.json
    - catalog/recipes/_fixtures/reject-field-code.json
    - catalog/recipes/_fixtures/reject-field-fn.json
    - catalog/recipes/_fixtures/reject-field-js.json
    - catalog/recipes/_fixtures/reject-unknown-field.json
    - catalog/recipes/_fixtures/reject-bad-method.json
    - catalog/recipes/_fixtures/reject-bad-authstrategy.json
    - tests/capability-recipe-schema.test.js
  modified:
    - extension/background.js
    - package.json

key-decisions:
  - "cfworker IIFE-bundled (not vendored raw) because a top-level import/export is a SyntaxError under importScripts in a classic service worker — the durable runtime reason, independent of the Node-version-fragile node --check rationale"
  - "Error-mapping order classifies schemaVersion const and method/authStrategy enum failures BEFORE the generic additionalProperties check, because cfworker emits a root additionalProperties error alongside enum/const failures (verified live)"
  - "Forbidden script-like names rejected by a top-level pre-scan that names the offending field (additionalProperties:false alone yields a generic location — Pitfall 2)"
  - "authStrategy enum locked at four members (D-08); persisted-query-hash / split-token deferred to the Phase 29 bundled-handler head"
  - "format:'uri' on origin ONLY; endpoint uses a leading-slash pattern (Pitfall 4 — cfworker asserts uri format in 2020-12)"
  - "Fixtures live at repo-root catalog/recipes/_fixtures/ (validate-extension only walks dirs under extension/, so they are not node --check'd; they are test data, not shipped runtime recipes)"

patterns-established:
  - "esbuild one-off to extension/lib/ documented as package.json scripts.build:cfworker; the built file is committed like every other lib/*.min.js"
  - "Recipe-path source files are kept free of dynamic-code substrings even in comments, pre-satisfying the Plan 03 CI-guard allowlist scan"

requirements-completed: [CAP-01, CAP-05]

# Metrics
duration: 8min
completed: 2026-06-20
---

# Phase 26 Plan 01: Recipe Schema + Vendored Libraries Summary

**Closed-vocabulary recipe JSON Schema (@cfworker/json-schema, eval-free) that rejects all six forbidden script-like fields, unknown fields, and bad method/authStrategy enums with typed RECIPE_* codes, plus the three capability libraries vendored into the extension package with no manifest/permission change.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-20T04:31:36Z
- **Completed:** 2026-06-20T04:40:13Z
- **Tasks:** 3
- **Files modified:** 17 (15 created, 2 modified)

## Accomplishments
- Vendored the three capability libraries into `extension/lib/`: `@cfworker/json-schema` IIFE-bundled (global `CfworkerJsonSchema`, eval-free), `minisearch` and `jmespath` UMD as-is — all pass `node --check` as classic scripts and expose their globals (CAP-05).
- Authored the versioned, closed-vocabulary `RECIPE_SCHEMA` and a `validateRecipe` that RETURNS (never throws) precise typed `RECIPE_UNKNOWN_FIELD` / `RECIPE_OPCODE_INVALID` / `RECIPE_SCHEMA_INVALID` codes (CAP-01).
- Wired the four additive `importScripts` lines into the service-worker boot chain (libs-before-module order) with no manifest/permission change (D-05).
- Delivered the shared `catalog/recipes/_fixtures/` accept/reject set and a 25-assertion zero-framework test suite proving CAP-01, wired into `npm test`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor the three libraries + wire importScripts** - `9c6ad4fc` (feat)
2. **Task 2: Author the closed-vocabulary recipe JSON Schema module** - `00ae33b8` (feat)
3. **Task 3: Create fixtures + the schema accept/reject test suite (CAP-01)** - `03aef84f` (test)

**Plan metadata:** committed separately (docs: complete plan)

_Note: Task 2 carried `tdd="true"`; per the plan's task structure the proving suite lives in Task 3 (test commit), so Task 2 was authored against the documented `<behavior>` contract and verified by an inline behavioral smoke (28/28) before Task 3's fixture-driven suite (25/25) locked it in._

## Files Created/Modified
- `extension/lib/cfworker-json-schema.min.js` - Eval-free JSON Schema validator, IIFE-bundled from `node_modules/@cfworker/json-schema/dist/esm/index.js` via the repo-pinned esbuild (global `CfworkerJsonSchema`, exposes `.Validator`).
- `extension/lib/minisearch.min.js` - Vendored UMD (global `MiniSearch`); ships per CAP-05, not wired until Phase 28.
- `extension/lib/jmespath.min.js` - Vendored UMD (lowercase global `jmespath`) for the read-only `extract` field; the live read runs in Phase 27.
- `extension/utils/capability-recipe-schema.js` - Dual-export IIFE; `RECIPE_SCHEMA`, `FSB_RECIPE_SCHEMA_VERSION = 1`, `getFSBRecipeValidator`, `validateRecipe` (typed RECIPE_* returns, forbidden-name pre-scan).
- `catalog/recipes/_fixtures/valid-recipe.json` - Canonical accept fixture (`id`, schemaVersion 1, origin, endpoint, GET, same-origin-cookie, params, request, extract).
- `catalog/recipes/_fixtures/reject-field-{script,expr,transform,code,fn,js}.json` - One reject fixture per forbidden script-like name.
- `catalog/recipes/_fixtures/reject-unknown-field.json` - Valid recipe + a `foo` out-of-vocabulary field.
- `catalog/recipes/_fixtures/reject-bad-method.json` - method `CONNECT` (out of the five-verb enum).
- `catalog/recipes/_fixtures/reject-bad-authstrategy.json` - authStrategy `persisted-query-hash` (out of the four-member enum).
- `tests/capability-recipe-schema.test.js` - Zero-framework accept/reject suite; vm-loads the cfworker IIFE before requiring the module; 25 assertions.
- `extension/background.js` - Additive `importScripts` block: `jmespath` -> `minisearch` -> `cfworker-json-schema` -> `capability-recipe-schema` (each try/catch wrapped).
- `package.json` - Added `scripts.build:cfworker`; appended the suite to the end of `scripts.test`; recorded the three libs in `dependencies` (already installed in node_modules).

## Decisions Made
- **cfworker MUST be IIFE-bundled, not vendored raw** — a top-level `import`/`export` is a SyntaxError under `importScripts` in a classic service worker. This is the durable runtime reason (the "node --check fails on Node 20" rationale in D-02 is version-fragile and passes on the repo's Node 25). Cited in the background.js comment and the commit.
- **Error-mapping ordering** — `schemaVersion` const and `method`/`authStrategy` enum failures are classified BEFORE the generic `additionalProperties` check (see Deviations Rule 1).
- **`params` is the one intentionally-open object** — it holds a user-authored JSON-Schema sub-document validated against invoke args downstream, so its internal shape is not locked; every other structural object (`request`, `csrf`, top level) is `additionalProperties:false`.
- **`csrf` required-when-`csrf-header-scrape`** expressed via JSON-Schema `if/then` (verified live against cfworker).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the validateRecipe error-mapping order vs the RESEARCH example**
- **Found during:** Task 2 (Author the closed-vocabulary recipe JSON Schema module)
- **Issue:** The RESEARCH.md code example (lines 336-348) checks for an `additionalProperties` failure FIRST, then enum failures. A live probe of `@cfworker/json-schema@4.1.1` showed that when a KNOWN field fails its `enum`/`const` (e.g. `method:'CONNECT'`, `authStrategy:'persisted-query-hash'`, `schemaVersion:2`), cfworker emits a root `#/additionalProperties` error ALONGSIDE the enum/const error. Following the RESEARCH order would mis-classify a bad method/authStrategy/schemaVersion as `RECIPE_UNKNOWN_FIELD` instead of the `RECIPE_OPCODE_INVALID` / `RECIPE_SCHEMA_INVALID` the plan's `<behavior>` requires.
- **Fix:** Ordered the mapping as: forbidden-name pre-scan -> schemaVersion const (`RECIPE_SCHEMA_INVALID`) -> method/authStrategy enum (`RECIPE_OPCODE_INVALID`) -> additionalProperties (`RECIPE_UNKNOWN_FIELD`) -> fallback (`RECIPE_SCHEMA_INVALID`).
- **Files modified:** extension/utils/capability-recipe-schema.js
- **Verification:** 28/28 inline behavioral assertions and 25/25 fixture-suite assertions green; `reject-bad-method.json` and `reject-bad-authstrategy.json` correctly return `RECIPE_OPCODE_INVALID`.
- **Committed in:** `00ae33b8` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Removed literal dynamic-code substrings from the schema module's comments**
- **Found during:** Task 2 (Author the closed-vocabulary recipe JSON Schema module)
- **Issue:** The schema module's docblock originally described the eval-free constraint using the literal phrase "ZERO eval / new Function / import()". The Plan 03 CI guard (D-16/D-17) scans this exact file's text — including comments and strings (RESEARCH Pitfall 3) — for `eval(`, `new Function`, `import(`, and would fail the build on those comment substrings. The plan's own Task 2 verify command also flagged it.
- **Fix:** Reworded the comment to describe the constraint without the literal trigger patterns ("dynamic-code-free … no run-string-as-code, no function-from-string, no dynamic module loader"). Confirmed the file (and all four recipe-path files) contain zero matches of the guard regex even in comments.
- **Files modified:** extension/utils/capability-recipe-schema.js
- **Verification:** `grep -E '\beval\s*\(|\bnew\s+Function\b|\bimport\s*\('` returns empty for the module and all three vendored libs; the plan's Task 2 verify command now prints "schema module clean".
- **Committed in:** `00ae33b8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes were necessary for correctness — the mapping-order fix makes `validateRecipe` return the typed codes the plan's `<behavior>` and acceptance criteria demand; the comment fix pre-satisfies the Plan 03 CI-guard allowlist that this plan explicitly stages for. No scope creep; no architectural change.

## Issues Encountered
- The conductor workspace is a git worktree (`.git` is a file) on branch `automation-worktree`, despite the prompt's note that worktrees are disabled. Confirmed `automation-worktree` is not a protected ref (not main/master/develop/trunk/release/*) and is the branch the agent was spawned on, so normal atomic commits are correct and safe.
- The working tree carried pre-existing uncommitted changes unrelated to this plan (showcase files, ws-client.js, dist, STATE.md, package-lock.json, several tests). All commits staged ONLY this plan's task-specific files; the unrelated changes were left untouched.
- `package.json` already carried the three libs in `dependencies` as an uncommitted working-tree change (pre-staged for this phase). They were committed in Task 1 alongside `build:cfworker` as part of Task 1's "vendor the three libraries" scope.

## Known Stubs
None. `minisearch` is vendored but deliberately not yet wired into any runtime path — this is an explicit CAP-05 requirement ("the three libs ship"), with wiring scheduled for Phase 28 (search). It is a planned vendor-now/wire-later artifact, not a data stub: no UI renders empty data and no consumer receives placeholder values.

## User Setup Required
None - no external service configuration required. The three libraries were already installed in `node_modules`; no `npm install` was run.

## Next Phase Readiness
- The validator global (`CfworkerJsonSchema`) and the typed-return schema module are in place — Plan 02 (the bundled interpreter: validate -> bind -> emit boundRequestSpec) can build on `RECIPE_SCHEMA` + `validateRecipe` directly.
- The `catalog/recipes/_fixtures/` set is the single source of truth ready for Plan 03's CI guard (allowlist grep + accept/reject fixture run); all four recipe-path files are already eval-free even in comments.
- `mcp/src/errors.ts` does NOT yet carry the `RECIPE_*` family — adding `RECIPE_.+` to the verbatim-passthrough regex is a downstream task (RESEARCH names errors.ts:122 as the one-line copy-target; not in this plan's scope).
- No blockers.

## Self-Check: PASSED

All 15 created files verified present on disk (3 vendored libs, the schema module, 10 fixtures, the test suite) and all 3 task commits (`9c6ad4fc`, `00ae33b8`, `03aef84f`) verified in git history.

---
*Phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard*
*Completed: 2026-06-20*
