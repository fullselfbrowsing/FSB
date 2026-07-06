---
phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
plan: 03
subsystem: ci
tags: [ci-guard, static-analysis, wall-1, recipe-as-data, allowlist, eval-ban, json-schema, cfworker, fixtures, mv3]

# Dependency graph
requires:
  - phase: 26-01
    provides: "extension/utils/capability-recipe-schema.js (validateRecipe + RECIPE_SCHEMA), the three vendored libs (cfworker-json-schema/jmespath/minisearch), and catalog/recipes/_fixtures/ accept+reject set"
  - phase: 26-02
    provides: "extension/utils/capability-interpreter.js + extension/utils/capability-auth-strategies.js on the recipe path (both already eval-free even in comments)"
provides:
  - "scripts/verify-recipe-path-guard.mjs -- Node static-analysis CI guard: hardcoded six-file allowlist grep for eval/new Function/import( + accept/reject fixture run + negative self-assertion that the three sanctioned execute_js sites are NOT on the allowlist; honors a test-only FSB_RECIPE_GUARD_EXTRA_ALLOWLIST seam"
  - "tests/recipe-path-guard.test.js -- spawn test: guard exit 0 on the clean tree + exit non-zero on a planted-eval temp file (named in the FAIL output, cleaned up in finally)"
  - "package.json scripts.validate:extension chains the guard (runs in the CI extension job before npm test, feeds ci/all-green); scripts.test appends the spawn test"
affects: [phase-27-authenticated-fetch, phase-28-mcp-search, phase-29-catalog-router, phase-31-recipe-synthesis, phase-32-self-heal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Node-builtins-only static-analysis CI gate (failures[] accumulator + safeRead + process.exit(1)-on-fail) cloned from scripts/verify-store-listing.mjs, but .mjs ESM using createRequire(import.meta.url) + node:vm to load the CJS schema module and the cfworker IIFE for the fixture check"
    - "Explicit HARDCODED recipe-path file allowlist (NOT a glob, NOT a directory walk) so the guard scans ONLY the recipe path and never the three sanctioned MAIN-world execute_js sites (D-17 trust-class separation)"
    - "Precise word-boundary forbidden patterns (/\\beval\\s*\\(/, /\\bnew\\s+Function\\b/, /\\bimport\\s*\\(/) so minified vendored libs do not false-positive on innocent substrings (retrieval/evaluate/important)"
    - "Negative self-assertion: the guard asserts the three sanctioned sites are NOT on its own allowlist (defends against allowlist drift turning the build red on sanctioned code)"
    - "Build-time closed-vocabulary proof: the guard re-runs RECIPE_SCHEMA over catalog/recipes/_fixtures (valid-* accepted, reject-* rejected), independent of the runtime test suite"
    - "Test-only override seam (FSB_RECIPE_GUARD_EXTRA_ALLOWLIST, comma-separated, appended before the grep) so the spawn test can plant an eval file and prove the guard flips non-zero; documented as test-only in a header comment, never set in CI"
    - "spawn-a-guard test (spawnSync('node',[script]) + exit-code/stdout assertions; passed/failed counters) cloned from tests/verify-store-listing.test.js; the planted forbidden construct is assembled from string fragments so the test's own source carries no literal forbidden token"

key-files:
  created:
    - scripts/verify-recipe-path-guard.mjs
    - tests/recipe-path-guard.test.js
  modified:
    - package.json

key-decisions:
  - "The allowlist is the EXACT six recipe-path files hardcoded (D-17), NOT a whole-extension grep -- a broad grep would false-positive on the three verified sanctioned execute_js sites (tool-executor.js:387 eval(jsCode), mcp-bridge-client.js:922 new Function(userCode), lattice-runtime-adapter.js:66 import('lattice') in a comment), which legitimately run dynamic code in MAIN world (a different trust class)"
  - "Forbidden patterns use precise word boundaries so the minified jmespath/minisearch/cfworker bundles do not trip on innocent substrings; verified all six allowlisted files have ZERO matches on the clean tree"
  - "The guard is an .mjs (matching the verify-store-listing.mjs analog) but needs CommonJS interop for the fixture check: createRequire(import.meta.url) to require the CJS schema module and node:vm runInThisContext to load the cfworker IIFE global -- the guard is CI tooling NOT on the recipe-path allowlist, so this dynamic load does not (and must not) trip the guard itself"
  - "Wired via Option 1 (chain into validate:extension) per D-18: the existing .github/workflows/ci.yml extension job already runs `npm run validate:extension` before `npm test` and all-green needs [extension, mcp-smoke, website], so chaining covers BOTH CI and local with NO ci.yml edit (verified empty diff)"
  - "Fixtures are classified by filename (valid-* = accept, reject-* = reject) and asserted against validateRecipe(...).success (the schema module returns .success, not .valid); the guard fails if any accept is rejected or any reject is accepted, and fails if zero accepts or zero rejects were exercised (defends against an empty/renamed fixture dir silently passing)"

patterns-established:
  - "A standing build-time Wall-1 enforcement: any future commit that reintroduces eval/new Function/import( on the six recipe-path files turns CI red; proven to flip by the planted-eval spawn test via the documented test-only env seam"
  - "Guard + spawn-test source files are themselves kept OFF the allowlist they scan (they contain the literal forbidden patterns as regex/string fragments by necessity), and the test plants its forbidden construct from assembled fragments to keep its own source token-clean"

requirements-completed: [CAP-04]

# Metrics
duration: 3min
completed: 2026-06-20
---

# Phase 26 Plan 03: Recipe-Path CI Guard (CAP-04) Summary

**A Node static-analysis CI guard that makes the Wall-1 "no code fetched as data" line unbreakable at build time forever: it greps an explicit hardcoded six-file recipe-path allowlist for `eval`/`new Function`/`import(` (failing the build on any hit), re-runs the closed-vocabulary RECIPE_SCHEMA over the accept/reject fixtures (failing if any out-of-vocabulary recipe is accepted), and asserts the three sanctioned MAIN-world `execute_js` sites are NOT on its allowlist so it never false-positives on sanctioned code -- chained into `npm run validate:extension` so the CI extension job enforces it on every build feeding `ci / all-green`, with no `ci.yml` edit.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-20T04:58:05Z
- **Completed:** 2026-06-20T05:00:52Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Authored `scripts/verify-recipe-path-guard.mjs` (CAP-04, D-16/D-17): three checks in one Node-builtins gate -- (1) an explicit hardcoded six-file recipe-path allowlist grepped for the three forbidden dynamic-code constructs with precise word-boundary patterns; (2) a fixture run that loads the cfworker IIFE, requires the recipe-schema module, and asserts every `valid-*` fixture is accepted and every `reject-*` fixture is rejected; (3) a negative self-assertion that none of the three sanctioned `execute_js` sites is on the allowlist.
- Exposed a documented test-only `FSB_RECIPE_GUARD_EXTRA_ALLOWLIST` seam so the build-time guard can be pointed at a planted-eval fixture to prove it flips red.
- Authored `tests/recipe-path-guard.test.js` (D-19 suite c): spawns the guard and asserts exit 0 + a PASS line on the clean tree, then writes a temp planted-eval file, points the guard at it via the env seam, and asserts the guard exits non-zero AND names the planted file -- cleaning the temp file up in a `finally`.
- Wired the guard into the gate (D-18): `scripts.validate:extension` now runs `validate-extension.mjs && verify-recipe-path-guard.mjs`, so the existing CI `extension` job runs it before `npm test` and feeds `ci / all-green`; `scripts.test` appends the spawn test. No `.github/workflows/ci.yml` edit was needed (verified empty diff).

## Task Commits

Each task was committed atomically (hooks ran; no `--no-verify`):

1. **Task 1: Author the recipe-path CI guard (allowlist grep + fixtures + negative self-assertion)** - `b42356f0` (feat)
2. **Task 2: Spawn test (clean PASS + planted-eval FAIL) + wire the guard into validate:extension and scripts.test** - `84c20c59` (test)

**Plan metadata:** committed separately (docs: complete plan).

## Files Created/Modified
- `scripts/verify-recipe-path-guard.mjs` - The CI guard. Node-builtins-only (`node:fs`, `node:path`, `node:url`, `node:module` `createRequire`, `node:vm`). `RECIPE_PATH_ALLOWLIST` is the exact six recipe-path files; `SANCTIONED_SITES` is the three excluded MAIN-world sites; `FORBIDDEN` is the three word-boundary patterns. Check 1 greps each allowlisted (+ any env-seam) file; Check 2 vm-loads the cfworker IIFE, requires the schema module, and runs `validateRecipe` over `catalog/recipes/_fixtures/*.json` classified by filename; Check 3 asserts no sanctioned site is on the allowlist. `process.exit(1)` with named failures on any miss, `process.exit(0)` + a PASS line otherwise.
- `tests/recipe-path-guard.test.js` - Zero-framework spawn test cloning `tests/verify-store-listing.test.js`. Assertion A: clean-tree guard exit 0 + PASS in stdout. Assertion B: a temp planted-eval file (forbidden construct assembled from string fragments so this source stays token-clean) on the env-seam allowlist makes the guard exit non-zero and name the file; temp file removed in `finally`. 5 assertions, all green.
- `package.json` - Two surgical edits: `scripts.validate:extension` changed from `node scripts/validate-extension.mjs` to `node scripts/validate-extension.mjs && node scripts/verify-recipe-path-guard.mjs`; `scripts.test` appends `&& node tests/recipe-path-guard.test.js` after the Plan 02 `capability-interpreter.test.js` entry. No other change.

## Decisions Made
- **Hardcoded allowlist, not a whole-tree grep (D-17)** - the guard scans only the six recipe-path files. The three sanctioned sites (`tool-executor.js:387` `eval(jsCode)`, `mcp-bridge-client.js:922` `new Function(userCode)`, `lattice-runtime-adapter.js:66` `import('lattice')` in a comment) legitimately run dynamic code in MAIN world (a different trust class) and are deliberately excluded; a negative self-assertion proves they stay off the allowlist even under future drift.
- **Precise word-boundary forbidden patterns** - `/\beval\s*\(/`, `/\bnew\s+Function\b/`, `/\bimport\s*\(/` so the minified vendored libs do not false-positive on innocent substrings (`retrieval`, `evaluate`, `important`). Verified all six allowlisted files have zero matches on the clean tree.
- **`.mjs` guard with CommonJS interop for the fixture check** - matches the `verify-store-listing.mjs` analog but uses `createRequire(import.meta.url)` to require the CJS schema module and `node:vm` `runInThisContext` to populate `globalThis.CfworkerJsonSchema` (the same loader the Plan 01 test uses). The guard is CI tooling that is NOT on the allowlist it scans, so this dynamic load is allowed and does not self-flag.
- **Wired via Option 1 (chain into `validate:extension`), no `ci.yml` edit (D-18)** - the CI `extension` job already runs `npm run validate:extension` before `npm test`, and `all-green` needs `[extension, mcp-smoke, website]`, so chaining covers both CI and local runs. `git diff .github/workflows/ci.yml` is empty.
- **Fixtures classified by filename and asserted on `.success`** - `valid-*` must return `success === true`, `reject-*` must return `success === false`. The guard also fails if zero accepts or zero rejects were exercised, so a renamed/emptied fixture dir cannot silently pass.

## Deviations from Plan

None - plan executed exactly as written.

The plan's `<interfaces>` block described the fixture check as `validateRecipe(...).valid` / `valid:true`, but the actual Plan 01 schema module returns `{ success: true }` / `{ success: false, code, ... }` (confirmed by reading `extension/utils/capability-recipe-schema.js` and `tests/capability-recipe-schema.test.js`). The guard therefore asserts `.success`, exactly matching the live contract and the Task 1 action text ("assert validateRecipe(JSON.parse(file)).success === true"). This is faithful implementation against the real interface, not a scope change.

## Issues Encountered
- The conductor workspace is a git worktree (`.git` is a file) on branch `automation-worktree`, as the `<sequential_execution>` block notes (sequential executor on the working tree). Confirmed `automation-worktree` is not a protected ref (not main/master/develop/trunk/release/*); normal atomic commits with hooks were used (no `--no-verify`), matching Plans 01 and 02.
- The working tree carried pre-existing uncommitted changes unrelated to this plan (showcase files, extension/dist, several tests). Every commit staged ONLY this plan's task-specific files individually (`scripts/verify-recipe-path-guard.mjs`, `tests/recipe-path-guard.test.js`, `package.json`); the unrelated changes were left untouched.
- The `gsd-sdk query` state handlers in this environment expect NAMED flags (`--phase`, `--plan`, `--duration`, `--summary`) rather than positional args; the metric and decision updates were re-issued with flags and succeeded.

## Known Stubs
None. The guard is a complete, exercised build-time gate: it exits 0 on the clean tree and is proven to flip non-zero on a planted-eval via the spawn test. `minisearch` remains a vendored-but-unwired lib (a Plan 01 CAP-05 artifact, scheduled for Phase 28) but it IS on this guard's allowlist and IS scanned, so it is covered by Wall-1 enforcement now even though it is not yet wired into a runtime path.

## Threat Flags
None. This plan adds CI tooling and a test only; it introduces no new network endpoint, auth path, file-access pattern, or trust-boundary schema change beyond the recipe path the threat model already covers. The guard itself is the mitigation for T-26-03 / T-26-03b / T-26-01 in the plan's threat register.

## User Setup Required
None - no external service configuration required. No `npm install` was run (no new dependency; the guard uses only Node built-ins, and the cfworker bundle + schema module + fixtures were vendored by Plans 01/02).

## Next Phase Readiness
- CAP-04 is locked: the Wall-1 "no code fetched as data" line is now enforced at build time. Any future commit that reintroduces `eval`/`new Function`/`import(` on the six recipe-path files, or that loosens the closed vocabulary so an out-of-vocabulary recipe is accepted, turns `ci / all-green` red.
- Phase 26 is complete (CAP-01..05 all delivered: schema + libs in Plan 01, interpreter + auth stubs + RECIPE_ passthrough in Plan 02, the CI guard here).
- Phase 27 (authenticated MAIN-world fetch, FETCH-01..05) can build on the bound-spec contract from Plan 02 with the guard standing watch: when Phase 27 adds the live fetch + CSRF scrape + extract RUN, those land in MAIN-world `execute_js` / new files OUTSIDE the recipe-path allowlist (the sanctioned trust class), so the guard will not flag them -- but if any of it were ever placed on a recipe-path file it would correctly fail.
- If a future plan adds a new recipe-path file (e.g. a bundled-handler module in Phase 29), it must be ADDED to `RECIPE_PATH_ALLOWLIST` in `scripts/verify-recipe-path-guard.mjs` to bring it under Wall-1 enforcement.
- No blockers.

## Self-Check: PASSED

Both created files verified present on disk (`scripts/verify-recipe-path-guard.mjs`, `tests/recipe-path-guard.test.js`) and both task commits (`b42356f0`, `84c20c59`) verified in git history. The committed `package.json` carries the guard reference in `scripts.validate:extension` and the spawn-test reference in `scripts.test`. The full plan verification block is green: `node scripts/verify-recipe-path-guard.mjs` exits 0, `node tests/recipe-path-guard.test.js` exits 0, `npm run validate:extension` exits 0 (running both `validate-extension.mjs` and the guard), and `git diff .github/workflows/ci.yml` is empty.

---
*Phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard*
*Completed: 2026-06-20*
