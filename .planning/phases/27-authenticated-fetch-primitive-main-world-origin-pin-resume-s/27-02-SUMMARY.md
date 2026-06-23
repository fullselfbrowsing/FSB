---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
plan: 02
subsystem: api
tags: [capability-fetch, main-world, credentialed-fetch, origin-pin, resume-sidecar, csrf-scrape, jmespath-extract, mv3-service-worker, ci-mock]

# Dependency graph
requires:
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: validateRecipe + closed RECIPE_SCHEMA; interpretRecipe (bound spec with credentials:'include' for same-origin-cookie); getFSBJmespath accessor; the recipe-path CI guard + allowlist; createRecipeError dual code+errorCode
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    plan: 01
    provides: interpretRecipe folds spec.query into spec.url + re-asserts the origin-pin against the effective target (RECIPE_ORIGIN_MISMATCH); RECOVERY_AMBIGUOUS registered in built mcp/build/errors.js; extension/utils/capability-fetch.js pre-registered on RECIPE_PATH_ALLOWLIST (existsSync pre-check in guard Check 1)
provides:
  - extension/utils/capability-fetch.js (NEW, on the allowlist): capabilityFetchInPage (FIXED page-MAIN-world func, serialization-safe) + executeBoundSpec (SW wrapper -- active-tab pin + resume-sidecar + SW-side extract) + classifyOnWake (thin local mid-mutation classifier)
  - The Wall-2 spine: a same-origin credentialed fetch runs in the page MAIN world via chrome.scripting.executeScript({world:'MAIN', func, args:[spec]}) with credentials:'include' (never a background-SW fetch); first-party HttpOnly cookies attach in the page realm
  - Active-tab session pin (D-08 part 2): executeBoundSpec asserts chrome.tabs.get(tabId).url origin === spec.origin and returns a dual-field RECIPE_ORIGIN_MISMATCH with NO executeScript side effect on mismatch (complements Plan 01's interpreter pin)
  - BEFORE_API_REQUEST resume-sidecar (D-10) wrapping the fetch via the reused FsbMcpTaskStore (write in_progress -> executeScript -> terminal -> delete, all best-effort)
  - classifyOnWake (D-11): a mutating-method (POST/PUT/PATCH/DELETE) in-flight snapshot -> RECOVERY_AMBIGUOUS (never blind-retried); GET/HEAD -> a re-issuable verdict; boundary -> SAFE
  - The hardcoded github.com GET /notifications proof recipe (+ a _fixtures copy) and tests/capability-fetch.test.js (FETCH-01..05 CI mock half) wired into the npm test chain
affects: [27-03 live human-gated UAT + resume-sidecar wake reconciliation, 28 lean-mcp-surface (search_capabilities/invoke_capability will call executeBoundSpec), 29 from-response CSRF + learned recipes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Serialization-isolated page func: a FIXED named function injected via executeScript({world:'MAIN', func, args:[spec]}) references ONLY Web APIs + args[0] -- no closure/import/SW-global -- proven by a func.toString() static guard (no jmespath/getFSB/require/importScripts)"
    - "Second-layer (active-tab) origin pin: re-assert the OWNED tab's live origin === spec.origin in the SW wrapper before any executeScript, so cookies can only attach on the intended origin (defends 'right URL, wrong tab session')"
    - "Collapsed resume-sidecar cadence: a single bounded fetch needs no 30s heartbeat -- write BEFORE_API_REQUEST -> executeScript -> terminal -> delete, all best-effort, never blocking the fetch"
    - "Thin local eviction classifier reusing Lattice marker STRINGS but reading the FLAT snake_case task-store envelope (current_step+method) -- never feeds a task-store snapshot into Lattice resume() (CAVEAT-1)"
    - "SW-side read-only extract: JMESPath runs in the worker via getFSBJmespath().search AFTER the body crosses back, because the engine is not in page scope (D-07)"
    - "Node test parity for the jmespath global: globalThis.jmespath = require(bundle) makes getFSBJmespath() resolve the engine, matching importScripts('lib/jmespath.min.js') in the SW"

key-files:
  created:
    - extension/utils/capability-fetch.js
    - catalog/recipes/github-notifications.json
    - catalog/recipes/_fixtures/valid-github-notifications.json
    - tests/capability-fetch.test.js
    - .planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-02-SUMMARY.md
  modified:
    - extension/background.js
    - package.json

key-decisions:
  - "Task 1 implemented capabilityFetchInPage fully and shipped executeBoundSpec/classifyOnWake as honest placeholders so the export object lists all three names at every commit; Task 2 replaced the placeholders with the real implementations (keeps each commit's module surface stable and loadable)"
  - "CAVEAT-2 read path resolved by tagName: el.tagName==='input' reads .value (the reserved /_graphql input[name=authenticity_token]); otherwise getAttribute('content')||.content for meta -- a wrong read yields a missing token, not a wrong-origin request (T-27-10)"
  - "Task id scheme cap_fetch_<origin>_<Date.now()> -- unique in the in-flight window and discoverable by listInFlightSnapshots(); current_step is the STRING 'BEFORE_API_REQUEST' (existing writers use a number; safe, reconciliation filters only on status==='in_progress')"
  - "classifyOnWake treats AFTER_API_REQUEST and absent/empty markers as SAFE (no in-flight request); only a non-safe in-flight marker with a mutating method surfaces RECOVERY_AMBIGUOUS; GET in-flight returns ON_ERROR_SW_EVICTION_MID_REQUEST (re-issuable)"
  - "from:'response' CSRF is NOT implemented in-page (D-06, deferred to Phase 29); from:'cookie' ships a minimal document.cookie parse keyed by the selector"

patterns-established:
  - "Serialization-isolated MAIN-world func + func.toString() static safety guard"
  - "Second-layer active-tab origin pin before executeScript"
  - "Collapsed best-effort resume-sidecar around a single bounded fetch"
  - "Thin local mid-mutation classifier (flat snapshot, reused marker strings)"

requirements-completed: [FETCH-01, FETCH-02, FETCH-03, FETCH-04, FETCH-05]

# Metrics
duration: 7min
completed: 2026-06-20
---

# Phase 27 Plan 02: Authenticated MAIN-World Fetch Primitive Summary

**capability-fetch.js now ships the Wall-2 spine -- a FIXED, serialization-safe page-MAIN-world fetch (capabilityFetchInPage) that carries first-party HttpOnly cookies via credentials:'include', scrapes CSRF in-page (.value for input / .content for meta), plus a SW wrapper (executeBoundSpec) that pins the active-tab origin a SECOND time before any side effect, wraps the fetch in a BEFORE_API_REQUEST resume-sidecar, runs the read-only JMESPath extract SW-side, and a thin classifyOnWake that surfaces mid-mutation ambiguity as RECOVERY_AMBIGUOUS and never blind-retries -- all dynamic-code-free, additively wired into background.js, and proven end-to-end in CI with a stubbed executeScript recorder.**

## Performance

- **Duration:** ~7 min (this plan's execution)
- **Completed:** 2026-06-20
- **Tasks:** 3
- **Files:** 5 created (1 source module, 2 recipe JSON, 1 test, 1 summary), 2 modified (background.js, package.json)

## Accomplishments
- D-01/D-03 (Wall-1): created `extension/utils/capability-fetch.js` as a dual-export IIFE mirroring `mcp-task-store.js`, with `capabilityFetchInPage` a FIXED self-contained page func referencing only Web APIs (document, fetch, JSON, URL, Object) + `args[0]` -- proven by a `func.toString()` static guard that asserts the body contains `credentials`/`include` and NONE of `jmespath`/`getFSB`/`require`/`importScripts`/`FsbMcpTaskStore`/`FsbCapabilityInterpreter`. Zero `eval`/`new Function`/`import(` even in comments; ASCII-only.
- FETCH-01/FETCH-02: the in-page func fetches with `credentials:'include'` + `redirect:'manual'`, scrapes CSRF BEFORE the request into `headers[csrfSource.header]` (`.value` for an `<input>` per CAVEAT-2/D-16, `.content`/`getAttribute('content')` for `<meta>`), reads status+url first, size-caps the body at 256KB, JSON.parses defensively, and returns only `{ ok, status, finalUrl, redirected, json, text }` -- never cookies/auth (T-27-08).
- FETCH-03 part 2 (D-08 part 2): `executeBoundSpec` resolves the active/owned tab origin via `chrome.tabs.get(tabId)` and returns a dual-field `RECIPE_ORIGIN_MISMATCH` with NO `executeScript` side effect when `tabOrigin != spec.origin` (T-27-07).
- FETCH-04 (D-10/D-11): a `BEFORE_API_REQUEST` in_progress snapshot (with `method`+`origin`) is written via the reused `FsbMcpTaskStore` before `executeScript`, terminal-written then deleted on completion (best-effort); `classifyOnWake` reads the FLAT snake_case `current_step`+`method` and returns `RECOVERY_AMBIGUOUS` for a mutating-method in-flight snapshot (never blind-retried), a re-issuable verdict for GET/HEAD, `SAFE` for boundary markers (CAVEAT-1, T-27-09).
- D-07: the read-only JMESPath extract runs SW-side via `FsbCapabilityInterpreter.getFSBJmespath().search(json, spec.extract)` AFTER the body returns (raw json on throw/absent engine).
- FETCH-05: the hardcoded `github.com GET /notifications` recipe (`same-origin-cookie`, `extract:'@'`) validates against the closed schema; a `_fixtures` copy lets the guard's Check 2 validate it at build time; `tests/capability-fetch.test.js` (26 PASS) drives `interpretRecipe -> executeBoundSpec` through a stubbed `executeScript` recorder to a logged-in-shape success result and asserts the built errors module surfaces `RECOVERY_AMBIGUOUS` verbatim (not `action_rejected`).
- background.js: one additive `importScripts('utils/capability-fetch.js')` LAST of the capability family (after `capability-interpreter.js`); no manifest/permission change (D-05).

## Task Commits

Each task was committed atomically:

1. **Task 1: capability-fetch.js shell + serialization-safe capabilityFetchInPage (FETCH-01/FETCH-02)** - `f6d27f56` (feat)
2. **Task 2: executeBoundSpec active-tab pin + sidecar + SW-side extract, classifyOnWake, background wiring (FETCH-03/04)** - `0d7b47d2` (feat)
3. **Task 3: hardcoded github recipe (+fixture) + capability-fetch CI suite + npm test chain (FETCH-01..05)** - `94fa6685` (test)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP/REQUIREMENTS in the final docs commit)_

_Note: Tasks 1 and 2 are TDD-tagged. The plan's task split puts the source in Tasks 1+2 and the dedicated CI suite in Task 3 (mirroring Plan 01's split). RED/GREEN was driven by one-off node probes against the harness mock at each step (Task 1: serialization-safety toString probe; Task 2: a 13-assertion origin-pin / snapshot-lifecycle / SW-extract / classifyOnWake probe -- 12/13 green inline, the 1 miss being a probe-only jmespath-loader artifact, then 3/3 green once the loader matched the SW's importScripts global), and the formal RED-then-GREEN suite lands in Task 3's commit (26 PASS / 0 FAIL)._

## Files Created/Modified
- `extension/utils/capability-fetch.js` (NEW, 443 lines) - the three exports `{ capabilityFetchInPage, executeBoundSpec, classifyOnWake }`; lazy `_getChrome()`; typeof-guarded `_getTaskStore()`/`_getJmespathEngine()`; dual-field `_typedError`; best-effort snapshot helpers. On the recipe-path allowlist (Plan 01); dynamic-code-free; ASCII-only.
- `extension/background.js` - one additive `try { importScripts('utils/capability-fetch.js'); } catch ... ` line after the `capability-interpreter.js` line (load order: interpreter before fetch so `getFSBJmespath` exists; `mcp-task-store.js` loads far earlier). No reorder.
- `catalog/recipes/github-notifications.json` (NEW) - the FETCH-05 proof recipe.
- `catalog/recipes/_fixtures/valid-github-notifications.json` (NEW) - identical copy for the guard's Check 2.
- `tests/capability-fetch.test.js` (NEW, 340 lines) - zero-framework CI suite (26 PASS) covering FETCH-01..05.
- `package.json` - appended `&& node tests/capability-fetch.test.js` to `scripts.test` after `recipe-path-guard.test.js`.

## Decisions Made
- Followed the plan's D-01/D-03/D-04/D-05/D-06/D-07/D-08/D-10/D-11/D-13/D-15/D-16 decisions as specified. The non-trivial calls: (1) Task 1 shipped `executeBoundSpec`/`classifyOnWake` as honest placeholders so each commit's export surface is stable and the module always loads, with the real bodies landing in Task 2; (2) the CAVEAT-2 read path is selected by `el.tagName` (`input` -> `.value`, else `.content`); (3) the CI suite loads the jmespath engine via `globalThis.jmespath = require('extension/lib/jmespath.min.js')` because the UMD bundle ends `})(typeof exports==='undefined' ? this.jmespath={} : exports)` -- under `require` it populates `module.exports`, which set on `globalThis.jmespath` is exactly what `getFSBJmespath()` (reading the bare global) resolves, matching the SW's `importScripts('lib/jmespath.min.js')`.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations; no architectural changes; no out-of-scope fixes. Both CI gates and all grep confirmations passed on the first verified run of each task.

## Authentication Gates
None - no auth gate occurred. This plan installs no packages (zero new dependencies; the three capability libs shipped in Phase 26) and configures no external service. The single property that requires a real authenticated browser session (real GitHub HttpOnly cookies attach -> a logged-in body shape) is NOT a code property -- it is a Chrome+GitHub behavior, deferred by design to Plan 03's human-gated UAT (D-15).

## Threat Surface
All threat-register items for this plan (T-27-06 dynamic code, T-27-07 active-tab origin mismatch, T-27-08 auth-material disclosure, T-27-09 double-mutation on eviction, T-27-10 CSRF .value/.content misread, T-27-11 oversized body, T-27-SC package installs) are mitigated as designed and asserted by the CI suite or the recipe-path guard. No NEW security surface beyond the plan's `<threat_model>` was introduced: no new network endpoint family (one hardcoded github.com GET recipe), no new auth path beyond the same-origin-cookie strategy bound by the Phase 26 interpreter, no schema change, no manifest/permission change.

## Known Stubs
None - no stub patterns (hardcoded empty values flowing to UI, placeholder text, or unwired data sources) were introduced. `from:'response'` CSRF is intentionally NOT implemented in-page (D-06, deferred to Phase 29); the schema carries the enum member but this plan's proof recipe is a GET that needs no CSRF, so no stub blocks the plan's goal.

## Issues Encountered
- A Task 2 inline probe initially showed the SW-side extract returning the raw json instead of the extracted value. Diagnosed (not a code bug) as a probe-only loader artifact: `vm.runInThisContext` of the jmespath UMD bundle does not bind `globalThis.jmespath` (the bundle assigns `this.jmespath` on the `runInThisContext` realm, not the outer global), so `getFSBJmespath()` returned null. The fix (used in the Task 3 suite) is `globalThis.jmespath = require(bundle)`, which mirrors the SW's `importScripts` global; the re-run was 3/3 green and the `executeBoundSpec` extract code was confirmed correct unchanged.

## User Setup Required
None - no external service configuration required. This plan installs no packages and changes no manifest/permission (CAP-05 posture preserved).

## Next Phase Readiness
- The bound-spec execution path (`executeBoundSpec(spec, tabId)`) is the seam Phase 28's lean MCP surface (`search_capabilities` + `invoke_capability`) will call after resolving an owned tab; the resume-sidecar snapshot it writes is the surface Plan 03's SW-wake reconciliation will enumerate (via `listInFlightSnapshots()`) and classify (via `classifyOnWake`). The reserved `/_graphql` CSRF exemplar and `from:'response'` are the Phase 29 follow-ups.
- No blockers. The interpreter's no-network charter (26-D-11) is untouched (this plan adds the network call in a SEPARATE module). The single deferred property (live logged-in shape) is the explicit Plan 03 human-gated UAT.

## Self-Check: PASSED

- Files verified present: extension/utils/capability-fetch.js, extension/background.js, catalog/recipes/github-notifications.json, catalog/recipes/_fixtures/valid-github-notifications.json, tests/capability-fetch.test.js, package.json, 27-02-SUMMARY.md
- Commits verified present: f6d27f56 (Task 1), 0d7b47d2 (Task 2), 94fa6685 (Task 3)
- Plan verifications: node tests/capability-fetch.test.js exit 0 (26 PASS / 0 FAIL); node scripts/verify-recipe-path-guard.mjs exit 0 (PASS, 4 on-disk capability modules all allowlisted); github recipe validateRecipe success; capabilityFetchInPage func body contains zero jmespath/getFSB/require/importScripts; getFSBJmespath called SW-side in executeBoundSpec; background.js loads capability-fetch.js last of the capability family; the capability tail of the npm test chain (recipe-schema, interpreter 51/0, guard test 5/0, capability-fetch 26/0) runs clean after npm --prefix mcp run build with no regression.

---
*Phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s*
*Completed: 2026-06-20*
