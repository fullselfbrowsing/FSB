---
phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
plan: 02
subsystem: api
tags: [recipe-as-data, interpreter, auth-strategy, cfworker, json-schema, jmespath, mv3, service-worker, iife, errors-passthrough]

# Dependency graph
requires:
  - phase: 26-01
    provides: "extension/utils/capability-recipe-schema.js (validateRecipe + RECIPE_SCHEMA), the three vendored libs (CfworkerJsonSchema/jmespath/MiniSearch), and the catalog/recipes/_fixtures/ accept fixture"
provides:
  - "extension/utils/capability-auth-strategies.js -- frozen AUTH_HANDLERS registry (four spec-shaping stubs) + bindAuthStrategy (typed RECIPE_OPCODE_INVALID for unknown strategy)"
  - "extension/utils/capability-interpreter.js -- interpretRecipe: validate-bind-emit-spec that STOPS before the network; emits { url, method, headers, body, query, authStrategy, csrfSource?/_authNeed?/credentials?, origin, extract }"
  - "mcp/src/errors.ts -- RECIPE_.+ added to the verbatim-passthrough regex (codes surface, not collapsed to action_rejected)"
  - "additive importScripts wiring in background.js (auth-strategies then interpreter, after the Plan 01 lib+schema block)"
  - "tests/capability-interpreter.test.js -- 26-assertion binding + no-network-proof + invoke-param + errors.ts passthrough suite"
affects: [phase-27-authenticated-fetch, phase-28-mcp-search, phase-29-catalog-router, plan-03-ci-guard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frozen enum->bundled-stub auth-strategy registry (Object.freeze keyed by the authStrategy enum); the recipe selects a handler by id, never carries handler logic (Wall-1 code-vs-data line)"
    - "Spec-shaping stub: shape(spec, recipe) RETURNS a new spec (Object.assign, no input mutation) declaring Phase-27 needs (credentials / _authNeed / csrfSource); performs NO I/O (D-12)"
    - "Hand-rolled {var} endpoint templater (D-04): String.replace over /\\{([a-zA-Z0-9_]+)\\}/g, encodeURIComponent each param, internal typed-throw on unfilled placeholder caught and converted to a typed RETURN (public API never throws)"
    - "Static param->placement map (request.query/header/body) filled from validated args; query values URL-encoded, header/body raw; no arbitrary header/body construction from server strings (ASVS V5.2)"
    - "typeof-guarded sibling-module + vendored-global accessors (getFSBRecipeSchema/getFSBAuthStrategies/getFSBRecipeValidator/getFSBJmespath) so the module degrades to a typed RECIPE_SCHEMA_INVALID when a dependency is absent"

key-files:
  created:
    - extension/utils/capability-auth-strategies.js
    - extension/utils/capability-interpreter.js
    - tests/capability-interpreter.test.js
  modified:
    - extension/background.js
    - mcp/src/errors.ts
    - package.json

key-decisions:
  - "Reused Plan 01's validateRecipe verbatim as the recipe-schema gate (no re-implementation); the interpreter delegates step 1 and returns the typed RECIPE_* result as-is, so a bad method/authStrategy enum surfaces RECIPE_OPCODE_INVALID and an unknown/forbidden field surfaces RECIPE_UNKNOWN_FIELD without duplicating the cfworker error-mapping logic"
  - "Invoke args validated against recipe.params only when recipe.params is present (it is an optional, intentionally-open JSON-Schema sub-document); a fresh CfworkerJsonSchema.Validator(recipe.params, '2020-12', false) is constructed per call so invalid args return RECIPE_SCHEMA_INVALID before any binding"
  - "bindAuthStrategy is exercised by the interpreter for EVERY recipe (the enum->bundled-stub dispatch is the binding step); its unknown-strategy rejection is defense-in-depth beyond the schema enum and is asserted directly in the suite because a recipe carrying an unknown strategy is already rejected upstream by validateRecipe"
  - "The bound spec carries recipe.extract UNEVALUATED (string or null); jmespath is reached only through getFSBJmespath() and never run against a live response in Phase 26 (D-14) -- the extract RUN is Phase 27"
  - "errors.ts edit is the single one-line regex extension (RECIPE_.+ joined to the TRIGGER_.+ alternation at the verbatim-passthrough); no new FSB_ERROR_MESSAGES/LAYER_LABELS entry -- RECIPE_* codes fall through buildLayeredDetail's default arm ('Tool returned error code: RECIPE_*'), acceptable for Phase 26 (the dispatcher route is Phase 28). INV-01 honored: no MCP tool schema or TOOL_REGISTRY touched"

patterns-established:
  - "No-network boundary proof: the interpreter test installs a chrome.scripting.executeScript recorder AND a globalThis.fetch recorder and asserts BOTH are called 0 times across the whole suite -- the load-bearing Phase 26/27 Wall-2 assertion"
  - "Recipe-path source files kept free of dynamic-code AND network/browser-API substrings (eval(/new Function/import(/fetch/chrome.scripting) even in comments, pre-satisfying the Plan 03 CI-guard allowlist scan"

requirements-completed: [CAP-02, CAP-03]

# Metrics
duration: 7min
completed: 2026-06-20
---

# Phase 26 Plan 02: Bundled Interpreter (validate-bind-emit-spec) Summary

**Eval-free service-worker interpreter that validates a recipe + invoke args, binds them to a frozen four-member auth-strategy registry, templates the endpoint with encodeURIComponent-escaped params, and emits a bound request spec -- then STOPS before any network call (proven by a recorder asserting chrome.scripting.executeScript and fetch are each invoked 0 times), plus the RECIPE_* family added to the MCP error passthrough so the typed codes surface verbatim.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-20T04:45:57Z
- **Completed:** 2026-06-20T04:52:58Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Authored the closed, frozen `AUTH_HANDLERS` registry of four spec-shaping stubs (`none`, `same-origin-cookie`, `bearer-from-storage`, `csrf-header-scrape`) plus `bindAuthStrategy`, which returns a typed `RECIPE_OPCODE_INVALID` for any strategy outside the enum (defense-in-depth) and performs zero I/O (CAP-02, D-08/D-12).
- Authored `interpretRecipe` (CAP-02/CAP-03): reuses Plan 01's `validateRecipe`, validates invoke args against `recipe.params` via the eval-free cfworker validator, templates the endpoint with a hand-rolled `{var}` replacer (D-04), applies the static `request` placement map, assembles the bound spec, and binds the auth strategy -- emitting `{ url, method, headers, body, query, authStrategy, csrfSource?/_authNeed?/credentials?, origin, extract }` and stopping before the network (D-11). `extract` is carried unevaluated for Phase 27 (D-14).
- Proved the Phase 26/27 boundary holds with the load-bearing no-network assertion: a chrome.scripting.executeScript recorder AND a globalThis.fetch recorder are each called 0 times across the 26-assertion suite.
- Added the `RECIPE_.+` family to the `mcp/src/errors.ts` verbatim-passthrough regex (D-15) and proved via the built mcp module that `RECIPE_SCHEMA_INVALID`/`RECIPE_OPCODE_INVALID` surface verbatim, not collapsed to `action_rejected`. INV-01 preserved (no tool schema touched).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the closed auth-strategy handler registry (spec-shaping stubs)** - `0c06fe69` (feat)
2. **Task 2: Author the interpreter (validate-bind-emit-spec, stops before the network) + wire importScripts** - `34b28efe` (feat)
3. **Task 3: Interpreter test (binding + no-network proof) + errors.ts RECIPE_ passthrough + wire** - `81d751eb` (test)

**Plan metadata:** committed separately (docs: complete plan)

_Note: Task 2 carried `tdd="true"`; per this plan's task structure the proving suite lives in Task 3 (the `test` commit), exactly as Plan 01 handled its `tdd` Task 2. Task 2 was authored against the documented `<behavior>` contract and verified by an inline behavioral smoke (valid case + all four auth variants + bad-enum + bad-args + missing-placeholder) before Task 3's 26-assertion suite locked it in._

## Files Created/Modified
- `extension/utils/capability-auth-strategies.js` - Dual-export IIFE (global `FsbCapabilityAuthStrategies` + `module.exports`). Frozen `AUTH_HANDLERS` keyed exactly by the four `authStrategy` enum members, each value a `shape(spec, recipe)` stub returning a new spec; `bindAuthStrategy(strategy, spec, recipe)` returns the typed `RECIPE_OPCODE_INVALID` shape for an unknown strategy. Zero `eval(`/`new Function`/`import(`/`fetch`/`chrome.` substrings.
- `extension/utils/capability-interpreter.js` - Dual-export IIFE (global `FsbCapabilityInterpreter` + `module.exports`). `interpretRecipe(recipe, args)` (validate -> bind -> emit spec, never the network), the hand-rolled `templateEndpoint` `{var}` replacer, the static `buildRequest` placement-map filler, and the typeof-guarded accessors. Zero `eval(`/`new Function`/`import(`/`fetch(`/`chrome.scripting` substrings.
- `tests/capability-interpreter.test.js` - Zero-framework 26-assertion suite. vm-loads the cfworker IIFE, requires the schema + auth-strategies + interpreter modules, installs the executeScript + fetch recorders, and asserts the binding behaviors, the no-network proof (both recorders at 0), and the errors.ts verbatim passthrough (via the built `mcp/build/errors.js`).
- `extension/background.js` - Two additive `importScripts` lines (`utils/capability-auth-strategies.js` then `utils/capability-interpreter.js`), each try/catch-wrapped, loaded AFTER the Plan 01 lib + schema block (D-05; additive only, byte-freeze respected).
- `mcp/src/errors.ts` - One-line regex extension: `RECIPE_.+` joined to the `TRIGGER_.+` verbatim-passthrough alternation in `resolveErrorKey` (errors.ts:122), with an explanatory comment. No other change.
- `package.json` - Appended `&& node tests/capability-interpreter.test.js` to the end of `scripts.test` (after the Plan 01 `capability-recipe-schema.test.js` entry).

## Decisions Made
- **Delegated the recipe gate to Plan 01's `validateRecipe`** rather than re-mapping cfworker errors in the interpreter -- the typed `RECIPE_*` codes (including the Plan 01 mapping-order fix for bad enums) are inherited for free, keeping the interpreter focused on bind+emit.
- **`recipe.params` validation is conditional on its presence** -- it is the one intentionally-open JSON-Schema sub-document; a fresh `CfworkerJsonSchema.Validator(recipe.params, '2020-12', false)` per call validates invoke args and yields `RECIPE_SCHEMA_INVALID` before binding.
- **The bound spec also carries a `query` field** (the filled `request.query` placement map) alongside `headers`/`body` -- Phase 27 needs the resolved query map to assemble the final URL; this is a superset of the plan's listed spec keys, not a deviation (the plan lists the auth-relevant keys; the static placement output is part of "build { query, headers, body }" in the action).
- **The unknown-opcode test calls `bindAuthStrategy` directly** because a recipe carrying an unknown `authStrategy` is already rejected by `validateRecipe`'s enum (returning `RECIPE_OPCODE_INVALID`); the direct call proves the interpreter's defense-in-depth layer independently, exactly as the plan's Task 3 action (c) specifies.

## Deviations from Plan

None - plan executed exactly as written.

The only non-mechanical authoring choice was wording the new modules' comments to avoid the literal substrings `fetch` and `chrome.` (and the dynamic-code patterns), which the task acceptance criteria require to be ZERO in these files and which the Plan 03 CI-guard allowlist scans even in comments. This is a faithful implementation of the stated acceptance criteria (and matches the precedent Plan 01 set for its schema module), not a change to plan scope or behavior.

## Issues Encountered
- The conductor workspace is a git worktree (`.git` is a file) on branch `automation-worktree`, as the prompt's `<sequential_execution>` block describes (worktrees disabled for this project; sequential executor on the working tree). Confirmed `automation-worktree` is not a protected ref (not main/master/develop/trunk/release/*); normal atomic commits with hooks were used (no `--no-verify`), matching how Plan 01 committed.
- The working tree carried pre-existing uncommitted changes unrelated to this plan (showcase, extension/dist, ws-client.js, package-lock.json, several tests). Every commit staged ONLY this plan's task-specific files individually; the unrelated changes were left untouched.
- `mcp/build/errors.js` is a gitignored build artifact regenerated by the `npm --prefix mcp run build` step (which runs both standalone here and mid-chain in `npm test`); only the source `mcp/src/errors.ts` was committed.

## Known Stubs
The four auth-strategy handlers are intentional spec-shaping STUBS per D-12: they DECLARE what the Phase 27 authenticated MAIN-world request will need (`credentials:'include'`, `_authNeed:{kind:'bearer',source:'storage'}`, `csrfSource:{from,selector,header}`) but perform no I/O. This is the deliberate Phase 26/27 boundary, documented in 26-CONTEXT.md (D-11/D-12) and 26-PLAN.md's scope, not a data stub -- no UI renders empty data and no consumer receives placeholder values in Phase 26. The cookie-carrying request, the live CSRF scrape, the origin-pin enforcement, and the `extract` RUN are scheduled for Phase 27 (FETCH-01..05).

## User Setup Required
None - no external service configuration required. No `npm install` was run (the three libs were already vendored by Plan 01; no new dependency was added).

## Next Phase Readiness
- Plan 03 (the CI guard) can add `extension/utils/capability-interpreter.js` and `extension/utils/capability-auth-strategies.js` to its recipe-path allowlist immediately -- both are already free of `eval`/`new Function`/`import(`/`fetch`/`chrome.scripting` even in comments, and `validate:extension` parses all 266 extension JS files clean.
- Phase 27 can consume the bound spec contract directly: `interpretRecipe` emits `{ url, method, headers, body, query, authStrategy, csrfSource?, _authNeed?, credentials?, origin, extract }`; the authenticated MAIN-world request, live CSRF scrape, origin-pin, and the `extract` (jmespath) RUN are its scope.
- `mcp/src/errors.ts` now surfaces the `RECIPE_*` family verbatim; the dispatcher route that carries a `RECIPE_*` result to a tool response is Phase 28.
- No blockers.

## Self-Check: PASSED

All 3 created files verified present on disk and all 3 task commits (`0c06fe69`, `34b28efe`, `81d751eb`) verified in git history (see Self-Check command output appended below).

---
*Phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard*
*Completed: 2026-06-20*
