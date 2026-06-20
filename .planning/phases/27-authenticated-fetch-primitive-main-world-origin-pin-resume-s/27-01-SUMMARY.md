---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
plan: 01
subsystem: api
tags: [capability-recipe, origin-pin, mv3-service-worker, mcp-errors, ci-guard, jmespath, cfworker-json-schema]

# Dependency graph
requires:
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: validateRecipe + closed-vocabulary RECIPE_SCHEMA; the bound-spec interpreter (interpretRecipe) with the assembly slot + deferred-pin comment; createRecipeError dual code+errorCode helper; the recipe-path CI guard + six-file allowlist; the RECIPE_* errors.ts verbatim-passthrough regex
provides:
  - interpretRecipe now folds spec.query into the URL (D-09) then re-asserts the origin-pin (D-08 part 1) against the EFFECTIVE post-fold target, rejecting cross-origin AND protocol-relative effective targets with the new typed RECIPE_ORIGIN_MISMATCH (dual code+errorCode) before any side effect
  - spec.url carries the TRUE effective request target (templated path + folded query), the contract Plan 02's capability-fetch.js consumes
  - RECOVERY_AMBIGUOUS registered in mcp/src/errors.ts CODE_ONLY_ERROR_KEYS and present in the built mcp/build/errors.js (FETCH-04 surfacing prerequisite)
  - extension/utils/capability-fetch.js registered on RECIPE_PATH_ALLOWLIST ahead of the file's creation; the recipe-path CI guard stays green
  - guard Check 1 now tolerates a registered-but-not-yet-on-disk recipe-path file via an existsSync pre-check (without weakening the present-file scan or the disk-drift check)
affects: [27-02 capability-fetch.js MAIN-world primitive, 27-03 resume-sidecar, 28 lean-mcp-surface, FETCH-03, FETCH-04, FETCH-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Query-fold-before-origin-pin: fold the built query map into the URL BEFORE re-asserting the origin so the pin guards the true effective target (a query-injected re-target cannot evade validation)"
    - "Effective-target origin re-assertion: new URL(effectiveUrl, recipe.origin).origin === recipe.origin as interpreter-side defense-in-depth beyond the recipe schema's endpoint pattern"
    - "Ahead-of-creation allowlist registration: a recipe-path module may be named on the CI-guard allowlist before its file exists; Check 1 existsSync-skips it, Check 4 (disk-drift) enforces it once it lands"

key-files:
  created:
    - .planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-01-SUMMARY.md
  modified:
    - extension/utils/capability-interpreter.js
    - tests/capability-interpreter.test.js
    - mcp/src/errors.ts
    - scripts/verify-recipe-path-guard.mjs

key-decisions:
  - "Folded query VALUES are not re-encoded when appended (already encodeURIComponent-escaped by buildRequest); only the key is encoded (T-27-04 accepted non-issue, data-correctness)"
  - "The interpreter origin-pin rejection branch is defense-in-depth: a fully schema-valid recipe folds to a /-rooted same-origin URL, so the most reachable cross-origin/protocol-relative effective target is a single-leading-slash endpoint whose next char(s) are backslashes (/\\evil.com, /\\\\evil.com) -- schema-valid but the WHATWG URL parser normalizes the backslash to a slash and re-targets the host"
  - "RECOVERY_AMBIGUOUS registered via the CODE_ONLY_ERROR_KEYS Set add (single token) rather than extending the resolveErrorKey regex; both are INV-01-safe, the Set is one explicit line"
  - "RECIPE_ORIGIN_MISMATCH needs NO errors.ts edit -- the existing /RECIPE_.+/ passthrough already surfaces it verbatim"

patterns-established:
  - "Query-fold-before-origin-pin (D-09 before D-08)"
  - "existsSync pre-check for ahead-of-creation recipe-path allowlist entries"

requirements-completed: [FETCH-03, FETCH-04]

# Metrics
duration: 27min
completed: 2026-06-20
---

# Phase 27 Plan 01: Authenticated-Fetch Foundational Seams Summary

**interpretRecipe now folds spec.query into the URL then re-asserts the origin-pin against the effective target (rejecting cross-origin AND protocol-relative with typed RECIPE_ORIGIN_MISMATCH before any side effect), RECOVERY_AMBIGUOUS is registered in the built MCP errors module, and capability-fetch.js is pre-registered on the recipe-path CI guard allowlist -- all with the interpreter's no-network charter (26-D-11) intact.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-06-20T07:39:59Z (phase execution start)
- **Completed:** 2026-06-20
- **Tasks:** 3
- **Files modified:** 4 (1 source, 1 test, 1 MCP source, 1 CI guard)

## Accomplishments
- D-09 query-fold + D-08(1) origin-pin re-assertion landed at the pre-flagged interpreter assembly slot; a cross-origin or protocol-relative effective target returns RECIPE_ORIGIN_MISMATCH (dual code+errorCode) before any caller acts on the spec; spec.url carries the true effective request target.
- Interpreter test extended with query-fold success (no double-encode, ?/& join), cross-origin rejection, protocol-relative rejection, empty-query no-op, and a no-side-effect (executeScript/fetch recorders unchanged) assertion on every rejection. 51 PASS / 0 FAIL.
- RECOVERY_AMBIGUOUS registered in CODE_ONLY_ERROR_KEYS and verified present in the rebuilt mcp/build/errors.js (FETCH-04 surfacing prerequisite); INV-01-safe (no MCP tool schema touched).
- extension/utils/capability-fetch.js registered on RECIPE_PATH_ALLOWLIST ahead of its Wave-2 creation; the recipe-path CI guard stays green (PASS).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fold query into URL then re-assert origin-pin in interpretRecipe (RECIPE_ORIGIN_MISMATCH)** - `f5597254` (feat)
2. **Task 2: Extend the interpreter test for query-fold + RECIPE_ORIGIN_MISMATCH (incl. protocol-relative)** - `6b8d6b30` (test)
3. **Task 3: Register RECOVERY_AMBIGUOUS in errors.ts + add capability-fetch.js to the recipe-path allowlist** - `8d7a4dbd` (feat)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP/REQUIREMENTS in the final docs commit)_

_Note: Task 1 is TDD-tagged; RED was confirmed by probe (the foreign endpoint bound successfully before the edit) and GREEN by the interpreter suite. The dedicated RED/GREEN test cases land in Task 2's commit per the plan's task split (Task 1 = interpreter source, Task 2 = test file)._

## Files Created/Modified
- `extension/utils/capability-interpreter.js` - Added step 5b (query-fold, D-09) and step 5c (origin-pin re-assertion against the effective URL, D-08 part 1) between the assembled spec and bindAuthStrategy; new RECIPE_ORIGIN_MISMATCH code via createRecipeError; spec.url set to effectiveUrl; updated the :128 deferred-pin comment. No fetch/chrome.scripting/executeScript/eval/new Function/import( introduced.
- `tests/capability-interpreter.test.js` - New section 6d (FETCH-03 a/b/c/d): query-fold into spec.url, cross-origin and protocol-relative RECIPE_ORIGIN_MISMATCH rejections with recorder-unchanged assertions, empty-query no-op; updated the existing spec.url assertion to the folded effective URL.
- `mcp/src/errors.ts` - Added RECOVERY_AMBIGUOUS to CODE_ONLY_ERROR_KEYS (Phase 27 FETCH-04 mid-mutation eviction ambiguity), surfaced verbatim by resolveErrorKey.
- `scripts/verify-recipe-path-guard.mjs` - Registered extension/utils/capability-fetch.js on RECIPE_PATH_ALLOWLIST; added an existsSync pre-check to Check 1 so a registered-but-absent recipe-path file is skipped without recording a failure (imported existsSync).

## Decisions Made
- Followed the plan's D-02/D-08/D-09/D-12 decisions as specified. The one non-trivial reachability call: because the recipe schema gates `endpoint` to a single-leading-slash non-protocol-relative path and buildRequest escapes every query value, a SCHEMA-VALID recipe can only ever fold to a /-rooted same-origin effective URL. The interpreter's pin is therefore defense-in-depth; the genuine reachable cross-origin/protocol-relative effective target used in tests is the backslash-after-leading-slash form (`/\\evil.com` -> https://evil.com, `/\\\\evil.com` -> //evil.com), which the schema's leading-`//` guard permits but the WHATWG URL parser normalizes to a host re-target. This is exactly the effective-target escape the pin exists to catch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Guard Check 1 failed on the ahead-of-creation allowlist entry (existsSync pre-check added)**
- **Found during:** Task 3 (registering capability-fetch.js on the recipe-path allowlist)
- **Issue:** The plan asserted Check 1 would "skip a not-yet-existent path (safeRead null -> continue)" and the guard would stay green. In fact `safeRead` PUSHES an ENOENT failure before returning null, so registering capability-fetch.js (which does not exist until Plan 02) made `node scripts/verify-recipe-path-guard.mjs` FAIL with exit 1 -- contradicting the Task 3 acceptance criterion "exits 0 (PASS) even though capability-fetch.js does not exist yet."
- **Fix:** Added `import { existsSync } from 'node:fs'` and an `if (!existsSync(abs)) continue;` pre-check at the top of Check 1's loop, before `safeRead`. A registered-but-absent recipe-path file is now skipped WITHOUT recording a failure (an absent file trivially contains no forbidden construct). Check 1 still fully scans every PRESENT file; Check 4 (disk-drift) is unaffected and still fails on any on-disk capability module missing from the allowlist.
- **Files modified:** scripts/verify-recipe-path-guard.mjs (same Task 3 file)
- **Verification:** Guard PASSes (exit 0, "7 recipe-path files clean ... 3 on-disk capability modules all on the allowlist"); planted-eval via FSB_RECIPE_GUARD_EXTRA_ALLOWLIST still fails the guard (exit 1); tests/recipe-path-guard.test.js 5 passed / 0 failed; all six existing recipe-path files confirmed present and scanned.
- **Committed in:** `8d7a4dbd` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix is required for the Task 3 acceptance criterion to hold and is the minimal change that preserves the guard's full security intent (present-file scan + disk-drift enforcement both intact). No scope creep -- it touches only the Task 3 file and only the read-skip behavior for absent registered paths.

## Issues Encountered
- The existing `spec.url === '/api/abc%20123'` assertion in the interpreter suite broke after Task 1 (the fixture carries `request.query {id}`, so spec.url is now the folded `/api/abc%20123?id=abc%20123`). This is the intended new contract (acceptance criterion: spec.url is assigned effectiveUrl). Updated the assertion to the folded value with an explanatory comment; committed with the test extensions in Task 2.

## User Setup Required
None - no external service configuration required. This plan installs no packages (npm --prefix mcp run build compiles existing source only; Package Legitimacy Gate N/A per threat model T-27-SC).

## Next Phase Readiness
- The folded+pinned spec contract, the RECOVERY_AMBIGUOUS code, and the pre-armed allowlist are ready for Plan 02's `extension/utils/capability-fetch.js` (MAIN-world authenticated fetch + active-tab session pin, D-08 part 2). When Plan 02 writes that file, the recipe-path guard's Check 1 will begin scanning it (existsSync true) and Check 4 already requires it on the allowlist.
- No blockers. The interpreter's no-network charter (26-D-11) is preserved and re-proven (executeScript/fetch 0-call assertions green across the suite, including the new rejection cases).

## Self-Check: PASSED

- Files verified present: capability-interpreter.js, tests/capability-interpreter.test.js, mcp/src/errors.ts, scripts/verify-recipe-path-guard.mjs, 27-01-SUMMARY.md
- Commits verified present: f5597254 (Task 1), 6b8d6b30 (Task 2), 8d7a4dbd (Task 3)
- Plan verifications: interpreter test exit 0 (51/0); npm --prefix mcp run build exit 0 + RECOVERY_AMBIGUOUS in built errors.js; recipe-path guard exit 0 (PASS); no dynamic-code constructs in the interpreter.

---
*Phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s*
*Completed: 2026-06-20*
