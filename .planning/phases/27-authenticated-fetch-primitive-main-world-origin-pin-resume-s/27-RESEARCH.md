# Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar - Research

**Researched:** 2026-06-20
**Domain:** Chrome MV3 extension — page MAIN-world authenticated `fetch`, origin-pinning, SW-eviction survival, closed-vocabulary recipe execution
**Confidence:** HIGH (all integration points read on `automation-worktree` at the cited line anchors; the only LOW-confidence item is the live GitHub HTML-shape assertion, which is human-gated by design)

This is an **implementation-readiness** research document. The milestone-level "what stack / what architecture / what pitfalls" research is already done and locked in `27-CONTEXT.md` (D-01..D-16) — this document does NOT repeat it. Its job is to hand the planner the exact patterns to clone, the exact API surfaces, and the exact edits, so every plan task is executable without guesswork.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The 16 decisions D-01..D-16 from `27-CONTEXT.md` are LOCKED. Reproduced here in compressed form; the planner must honor each verbatim. The HOW for each is in the body of this research.

- **D-01:** NEW `extension/utils/capability-fetch.js`, dual-export IIFE. Exports (a) `capabilityFetchInPage` — self-contained `func` for `executeScript({world:'MAIN'})`; (b) SW-side `executeBoundSpec(spec, tabId)` wrapper that normalizes `{ success, status, data | error, code? }`. Recipe contributes ONLY the bound spec (data) via `args`.
- **D-02 (HARD):** Add `capability-fetch.js` to `RECIPE_PATH_ALLOWLIST` in `scripts/verify-recipe-path-guard.mjs` AND keep it free of `eval` / `new Function` / `import(` (even in comments/strings). Check 4 fails CI closed otherwise.
- **D-03:** The in-page `func` is serialization-safe — NO closure symbols, NO importScripts globals (including `jmespath`), NO sibling helpers. Everything arrives in `args[0]` (the spec) or is defined inline.
- **D-04:** SW injection reuses the existing ownership-gated `tabId`. ONE hardcoded recipe driven directly — no MCP tool, no router.
- **D-05:** `csrfSource` `{ from:'meta'|'cookie', selector?, header }` consumed INSIDE the page, BEFORE the request; threaded into `headers[csrfSource.header]`, then `fetch(url, { method, headers, body, credentials:'include' })`.
- **D-06:** `from:'response'` deferred to Phase 29. v1 covers `from:'meta'` (and `from:'cookie'` at the planner's discretion).
- **D-07:** The read-only `extract` (JMESPath) runs **SW-SIDE** via `getFSBJmespath()`; the in-page func returns the parsed JSON body (size-capped). Auth material never crosses — only response data.
- **D-08:** Origin-pin enforced at TWO points (interpreter self-consistency + fetch-wrapper active-tab-origin), both before any side effect.
- **D-09:** Interpreter folds `spec.query` into the URL BEFORE the pin re-assertion.
- **D-10:** Wrap invoke in the `run_task` resume-sidecar (`mcp-task-store.js`), write `in_progress` snapshot with `current_step:'BEFORE_API_REQUEST'` BEFORE `executeScript`; terminal snapshot then delete on success. REUSE `writeSnapshot`/`readSnapshot`/`deleteSnapshot`.
- **D-11:** On SW-wake: MUTATING method + in-flight snapshot → `RECOVERY_AMBIGUOUS`, surfaced, never blind-retried; idempotent GET may re-issue. Reuse Lattice ResumePolicy marker taxonomy.
- **D-12:** Add `RECOVERY_AMBIGUOUS` to `mcp/src/errors.ts` via the same verbatim-passthrough extension point as `RECIPE_*`/`TRIGGER_*`. Return with BOTH `code` and `errorCode` set. INV-01-safe.
- **D-13:** Hardcoded recipe `github.com` → `GET /notifications`, `authStrategy: same-origin-cookie`, in `catalog/recipes/`. Read-only idempotent GET, no CSRF coupling.
- **D-14:** Assert 200-not-302 AND/OR `<meta name="user-login">` non-empty. Session rides HttpOnly `_gh_sess`/`logged_in`.
- **D-15:** CI gate = zero-framework `node tests/*.test.js` (mocked `chrome.*`, stubbed `executeScript`). Live logged-in-shape assertion = human-gated UAT (`human_needed`).
- **D-16:** Reserve `github.com` → `POST /_graphql` `csrf-header-scrape` as the FETCH-02 exemplar, exercised only after FETCH-01 is green.

### Claude's Discretion

(Copied verbatim from CONTEXT.md — the planner decides these.)

- Exact internal split between `capabilityFetchInPage` and the SW `executeBoundSpec` wrapper (one file recommended; the interpreter's no-network charter (26-D-11) must be preserved — the `executeScript` call must NOT live in `capability-interpreter.js`).
- Whether `from:'cookie'` CSRF is wired in v1 or only `from:'meta'` (the hardcoded GET needs neither; planner decides if a minimal cookie path ships now for FETCH-02 readiness).
- The mid-mutation ambiguity code name if the planner prefers `FETCH_RECOVERY_AMBIGUOUS` over the generic `RECOVERY_AMBIGUOUS` (recommended: align with the Lattice marker string `RECOVERY_AMBIGUOUS`).
- The size cap for the response body returned across the `executeScript` boundary for SW-side extract.
- Standalone helper vs inlined logic for the in-page CSRF read (must stay serialization-safe per D-03).

### Deferred Ideas (OUT OF SCOPE)

- `from:'response'` CSRF sourcing — Phase 29.
- `POST /_graphql` CSRF exemplar wiring — reserved for FETCH-02 but only after `same-origin-cookie` GET is green (still in Phase 27 if time allows; otherwise early Phase 29).
- Consent gate / per-origin Off-Ask-Auto — Phase 30. (Phase 27's recipe runs ungated, which is why origin-pin must hold even on an un-governed path.)
- MCP `invoke_capability` surface + router + autopilot parity — Phase 28/29.
- CDP Network discovery / learned recipes — Phase 31.
- Recipe-rot / self-healing / 7-provider parity gate — Phase 32.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FETCH-01** | Authenticated API call executes in the page MAIN world via the existing `execute_js` seam so first-party HttpOnly/SameSite cookies attach automatically. | §"executeScript MAIN-world return contract" + §"Code Examples → capabilityFetchInPage". The seam is `tool-executor.js:382-394` / `mcp-bridge-client.js:915-937`. The new func sets `credentials:'include'` (from the `same-origin-cookie` auth stub at `capability-auth-strategies.js:65-69`). |
| **FETCH-02** | Fetch primitive scrapes and sends per-form CSRF tokens + required headers declared by the recipe's auth-strategy. | §"CSRF live-scrape (in-page)" + §"Code Examples". `csrfSource` descriptor read in-page (`from:'meta'`→`document.querySelector(sel).content`); threaded into `headers[csrfSource.header]`. The descriptor is produced by `bindAuthStrategy('csrf-header-scrape', …)` at `capability-auth-strategies.js:75-82`. |
| **FETCH-03** | Origin-pinning enforced inside the interpreter; cross-origin rejected before any side effect. | §"Origin-pin (two-point enforcement)". Interpreter slot at `capability-interpreter.js:128-129` (pre-flagged); fetch-wrapper active-tab check. Schema already gates `endpoint`/`origin` patterns (`capability-recipe-schema.js:95-108`). |
| **FETCH-04** | In-flight call survives MV3 SW eviction via `run_task` resume-sidecar; mid-mutation ambiguity is `RECOVERY_AMBIGUOUS`, never blind-retried. | §"Resume-sidecar (mcp-task-store public API + cadence)" + §"ResumePolicy classification". Reuse `mcp-task-store.js:128-167` + the cadence at `mcp-bridge-client.js:1442-1458`. Lattice taxonomy at `lattice-runtime-adapter.js:281-307`. |
| **FETCH-05** | Smoke test asserts the logged-in (not logged-out) data shape returns from the chosen execution context against a real HttpOnly-cookie site. | §"Validation Architecture" + §"Test harness to clone". CI: clone `tests/capability-interpreter.test.js` (mocked `chrome.*`, stubbed `executeScript` recorder via `tests/fixtures/run-task-harness.js`). Live: human-gated UAT (`human_needed`). |
</phase_requirements>

## Summary

Phase 27 is almost entirely **integration plumbing against already-built seams**, not green-field design. Every piece it needs exists and was read at its line anchor: the MAIN-world `executeScript` injection seam (two live copies), the bound-spec contract emitted by the Phase 26 interpreter, the four auth-strategy spec-shaping stubs, the `run_task` resume-sidecar (`writeSnapshot`/`readSnapshot`/`deleteSnapshot` + a proven 30s-heartbeat/subscribe-time/terminal write cadence), the Lattice `BEFORE_API_REQUEST → RECOVERY_AMBIGUOUS` ResumePolicy marker taxonomy, the `RECIPE_*`/`TRIGGER_*` verbatim-error-passthrough extension point in `errors.ts`, the fail-closed CI guard with its allowlist, the vendored `jmespath` global reachable via `getFSBJmespath()`, and the zero-framework test convention with a shared `installChromeMock`/`installVirtualClock`/`createStorageArea` harness. **No existing code calls `interpretRecipe` yet — Phase 27 builds the first caller** (verified: grep for `interpretRecipe` outside its own module returns only a background.js comment).

The net new surface is small and bounded: one new file (`capability-fetch.js`) with an in-page `func` + an SW `executeBoundSpec` wrapper; two pre-flagged edits inside `interpretRecipe` (fold `query` into the URL, then re-assert origin); one allowlist line + one `errors.ts` line; one additive `importScripts`; one hardcoded recipe JSON; and one CI-side test file. The two genuinely tricky constraints — both already understood and locked — are (1) the in-page `func` is **stringified and re-parsed in the page**, so it can reference NOTHING from the SW scope (no `jmespath`, no helpers, no closures), which is exactly why `extract` runs SW-side after the parsed body crosses back; and (2) the new file lands inside the `extension/utils/capability-*.js` glob that Check 4 of the CI guard enumerates from disk, so omitting the allowlist entry fails CI by omission, and a single `eval(`/`new Function`/`import(` substring anywhere in the file (including comments) fails Check 1.

**Primary recommendation:** Clone the `mcp-bridge-client.js:915-937` `_handleExecuteJS` injection shape into `executeBoundSpec`, swapping the `new Function(userCode)` body for a fixed self-contained `capabilityFetchInPage(spec)` func; wrap the call in the `mcp-task-store.js` sidecar using the snake_case envelope and the `BEFORE_API_REQUEST` step marker; run `extract` SW-side via `getFSBJmespath().search(body, spec.extract)` on the returned (size-capped) JSON; enforce origin twice (interpreter + wrapper); and prove all of it in CI with a stubbed `executeScript` recorder, deferring only the live logged-in-shape assertion to a `human_needed` UAT.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Authenticated `fetch` (cookies attach) | **Page MAIN world** (injected `func`) | — | Wall 2: only page context carries first-party HttpOnly/SameSite cookies; a SW `fetch()` is extension-origin (CORS + SameSite withheld). |
| CSRF token scrape | **Page MAIN world** (in `func`, before request) | — | The DOM/`document.cookie` the token lives in only exists in the page; scraping it in the SW is impossible (no document). |
| Read-only `extract` (JMESPath) | **Service worker** (`executeBoundSpec`, after body returns) | — | D-07: keeps the in-page func tiny + serialization-safe; reuses the real vendored `jmespath` engine via `getFSBJmespath()`. |
| Origin-pin (URL self-consistency) | **Service worker** (`interpretRecipe`) | — | D-08(1): the interpreter already owns recipe→spec binding; the pin guards the effective URL before it ever leaves the SW. No-network charter preserved. |
| Origin-pin (session correctness) | **Service worker** (`executeBoundSpec`, before `executeScript`) | — | D-08(2): active-tab origin must equal `spec.origin` or cookies attach to the wrong session; checked in the wrapper, the only place that knows the tab. |
| SW-eviction survival snapshot | **Service worker** (`mcp-task-store.js` → `chrome.storage.session`) | — | FETCH-04: hot-state must persist across SW teardown; `chrome.storage.session` is the proven vehicle (run_task sidecar). |
| Mid-mutation ambiguity classification | **Service worker** (thin classifier at fetch layer, mirroring Lattice markers) | Lattice taxonomy (reference) | D-11: the method (idempotent vs mutating) is known only at the fetch layer; reuse the marker STRINGS, not necessarily the Lattice function (see §ResumePolicy). |
| Typed-error surfacing to MCP host | **MCP server** (`mcp/src/errors.ts`) | — | D-12: the host maps `code`/`errorCode` → message; `RECOVERY_AMBIGUOUS` registered alongside `RECIPE_*`. |
| Recipe = data only (no executable fields) | **Catalog JSON** (`catalog/recipes/*.json`) | CI guard (enforcement) | Wall 1: recipe is closed-vocabulary data; the bundled interpreter/fetcher is the only code. |

## Standard Stack

No new external packages. Phase 27 is pure FSB code reusing already-vendored libraries. The "stack" is the set of existing modules it integrates.

### Core (all already present and read at anchors)
| Module / Asset | Location | Purpose in Phase 27 | Provenance |
|----------------|----------|---------------------|------------|
| MAIN-world `executeScript` seam | `extension/ai/tool-executor.js:382-394`, `extension/ws/mcp-bridge-client.js:915-937` | The injection pattern to clone (fixed `func`, not `eval`/`new Function`). | [VERIFIED: read on automation-worktree] |
| `interpretRecipe` (bound-spec emitter) | `extension/utils/capability-interpreter.js:235-324` | Consumes recipe→spec; Phase 27 adds the `query`-fold + origin-pin at the pre-flagged slots. | [VERIFIED: read] |
| `bindAuthStrategy` + `AUTH_HANDLERS` | `extension/utils/capability-auth-strategies.js:59-116` | Supplies `credentials:'include'` (cookie) and `csrfSource` descriptor in the spec. | [VERIFIED: read] |
| `validateRecipe` + `RECIPE_SCHEMA` | `extension/utils/capability-recipe-schema.js:79-148, 231-299` | The closed-vocabulary gate the hardcoded recipe must pass. | [VERIFIED: read] |
| `mcp-task-store.js` resume-sidecar | `extension/utils/mcp-task-store.js:128-167` | `writeSnapshot`/`readSnapshot`/`deleteSnapshot`/`listInFlightSnapshots`/`hydrate`. | [VERIFIED: read] |
| Lattice ResumePolicy taxonomy | `extension/ai/lattice-runtime-adapter.js:281-307` | The `BEFORE_API_REQUEST → ON_ERROR_SW_EVICTION_MID_REQUEST` / non-safe → `RECOVERY_AMBIGUOUS` marker map. | [VERIFIED: read] |
| `errors.ts` typed-passthrough | `mcp/src/errors.ts:54-68, 100-135` | `CODE_ONLY_ERROR_KEYS` set + `resolveErrorKey` regex — the `RECOVERY_AMBIGUOUS` registration point. | [VERIFIED: read] |
| `verify-recipe-path-guard.mjs` | `scripts/verify-recipe-path-guard.mjs:84-91, 105-135, 257-281` | `RECIPE_PATH_ALLOWLIST` + Check 1 grep + Check 4 disk-glob drift fail. | [VERIFIED: read] |
| Vendored `jmespath` global | loaded at `extension/background.js:119`; reached via `getFSBJmespath()` (`capability-interpreter.js:76-78`) | SW-side `extract` execution: `getFSBJmespath().search(data, expr)`. | [VERIFIED: read] |
| Zero-framework test harness | `tests/fixtures/run-task-harness.js` (`installChromeMock`, `installVirtualClock`, `createStorageArea`) | The mock substrate for the FETCH-05 CI suite. | [VERIFIED: read] |
| Hardcoded-recipe fixture dir | `catalog/recipes/` (currently only `_fixtures/`) | Where the `github.com` proof recipe lands. | [VERIFIED: `ls`] |

### Supporting
| Asset | Location | When to Use |
|-------|----------|-------------|
| `valid-recipe.json` | `catalog/recipes/_fixtures/valid-recipe.json` | The exact recipe JSON template to mirror for the GitHub recipe (field set: schemaVersion, id, origin, endpoint, method, authStrategy, params?, request?, extract?, csrf?). |
| `tests/mcp-task-store.test.js` | repo `tests/` | The `node:assert` + `installChromeMock` round-trip pattern for asserting the `BEFORE_API_REQUEST` snapshot write/read/delete in FETCH-04. |
| `tests/recipe-path-guard.test.js` | repo `tests/` | Confirms the guard still passes after the allowlist edit; clone-check for the FETCH side. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-page func returns parsed JSON body for SW-side extract (D-07) | Run JMESPath in-page | REJECTED by D-03 — the `jmespath` global is NOT in the page scope; referencing it throws `ReferenceError` against real sites (passes stubbed-executeScript unit tests, fails live). |
| Cloning the `mcp-bridge-client.js` `new Function` seam structurally | Reusing `execute_js` route directly | REJECTED by D-02/Wall-1 — `execute_js` runs user/model code (`eval`/`new Function`); the recipe path must be dynamic-code-free. Clone the **injection shape**, not the eval body. |
| Adding `RECOVERY_AMBIGUOUS` to `CODE_ONLY_ERROR_KEYS` (errors.ts:54) | Extending the regex at errors.ts:133 | Both work and are INV-01-safe. The set is the cleaner single-token add; the regex is for whole families. Recommend the **set** (one line, explicit). See §"errors.ts edit". |

**Installation:** None. `npm install` adds nothing. The only manifest-adjacent change is the additive `importScripts('utils/capability-fetch.js')` in `background.js` (no manifest/permission edit — consistent with CAP-05).

**Version verification:** N/A — no new packages. The three relevant vendored libs (`jmespath`, `minisearch`, `@cfworker/json-schema`) were already pinned and shipped in Phase 26 (CAP-05); Phase 27 adds zero dependencies.

## Package Legitimacy Audit

> Not applicable — Phase 27 installs **no external packages**. The Standard Stack is entirely existing in-repo modules plus three already-vendored libraries shipped in Phase 26. No npm/PyPI/crates install occurs. slopcheck/registry verification is moot.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages installed).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
  ONE hardcoded recipe (catalog/recipes/github-notifications.json)
  { schemaVersion, id, origin:"https://github.com", endpoint:"/notifications",
    method:"GET", authStrategy:"same-origin-cookie", extract:"..." }
          |
          |  (Phase 27 test/driver loads it directly — NO MCP tool, NO router yet, D-04)
          v
  +-------------------------------------------------------------+
  |  SERVICE WORKER                                             |
  |                                                             |
  |  interpretRecipe(recipe, args)        [capability-         |
  |    1. validateRecipe (closed vocab)    interpreter.js,     |
  |    2. validate invoke args             MODIFIED]           |
  |    3. templateEndpoint -> path                              |
  |    4. buildRequest -> {query,headers,body}                  |
  |    5. assemble base spec                                    |
  |  ** D-09: FOLD spec.query INTO spec.url **                  |
  |  ** D-08(1): re-assert new URL(url,origin).origin==origin **|
  |    6. bindAuthStrategy -> +credentials:'include' (+csrf?)   |
  |          |                                                  |
  |          v  bound spec {url, method, headers, body,         |
  |             authStrategy, origin, credentials, csrfSource?, |
  |             extract}                                        |
  |          |                                                  |
  |  executeBoundSpec(spec, tabId)        [capability-fetch.js, |
  |    a. resolve active/owned tab origin   NEW — SW half]     |
  |  ** D-08(2): assert tab.origin === spec.origin **          |
  |    b. writeSnapshot(taskId,{status:in_progress,             |
  |         current_step:'BEFORE_API_REQUEST', method, origin}) |
  |         -> chrome.storage.session  [mcp-task-store.js REUSE]|
  |    c. chrome.scripting.executeScript({world:'MAIN',         |
  |         func: capabilityFetchInPage, args:[spec]}) ---------+--+
  |    ...await InjectionResult...                              |  |
  |    d. results[0].result -> {ok,status,body|error}          |  |
  |    e. extract: getFSBJmespath().search(body, spec.extract) |  |
  |    f. writeSnapshot(terminal) then deleteSnapshot(taskId)  |  |
  |    g. return {success,status,data|error,code?}             |  |
  +-----------------------------------------------------------+--+
                                                               |
                          (func stringified + re-parsed)       |
                                                               v
  +-------------------------------------------------------------+
  |  PAGE MAIN WORLD  (tab on https://github.com)              |
  |                                                             |
  |  capabilityFetchInPage(spec):     [capability-fetch.js,    |
  |    - if spec.csrfSource: scrape     NEW — page half, D-03  |
  |        from 'meta'  -> document.querySelector(sel).content  |
  |        from 'cookie'-> parse document.cookie                |
  |        headers[csrfSource.header] = token                   |
  |    - fetch(spec.url, {method, headers, body,                |
  |        credentials:'include'})  <-- HttpOnly _gh_sess       |
  |        cookie attaches automatically (Wall 2)               |
  |    - read status; parse JSON (or text); SIZE-CAP            |
  |    - return {ok, status, body, finalUrl}                    |
  |    (auth material NEVER returned — only response data)      |
  +-------------------------------------------------------------+

  ON SW WAKE (eviction reconciliation):
    listInFlightSnapshots() -> any 'BEFORE_API_REQUEST' snapshot
      method in {POST,PUT,PATCH,DELETE} -> RECOVERY_AMBIGUOUS (surface; NEVER retry)
      method == GET (idempotent)        -> may re-issue
    -> errors.ts surfaces RECOVERY_AMBIGUOUS verbatim to MCP host (D-12)
```

### Recommended Project Structure
```
extension/utils/
  capability-fetch.js        # NEW: capabilityFetchInPage (page func) + executeBoundSpec (SW wrapper)
  capability-interpreter.js  # MODIFIED: fold query into url + origin-pin re-assert (slots :128-129, :300-312)
extension/
  background.js              # MODIFIED: additive importScripts('utils/capability-fetch.js') AFTER interpreter+jmespath
scripts/
  verify-recipe-path-guard.mjs  # MODIFIED: +1 line in RECIPE_PATH_ALLOWLIST
mcp/src/
  errors.ts                  # MODIFIED: register RECOVERY_AMBIGUOUS in CODE_ONLY_ERROR_KEYS
catalog/recipes/
  github-notifications.json  # NEW: the hardcoded GET proof recipe
  github-graphql.json        # NEW (reserved): the POST /_graphql CSRF exemplar (FETCH-02)
tests/
  capability-fetch.test.js   # NEW: CI-side smoke (stubbed executeScript recorder)
package.json                 # MODIFIED: append the new test to scripts.test chain
```

### Pattern 1: MAIN-world injection with a FIXED func (clone of `_handleExecuteJS`)
**What:** `chrome.scripting.executeScript` stringifies `func`, re-parses it in the page, runs it with `args` spread, and returns an array of `InjectionResult`; read `results[0].result`.
**When to use:** `executeBoundSpec` — the SW half of `capability-fetch.js`.
**Source:** `extension/ws/mcp-bridge-client.js:915-961` (verified seam).
```javascript
// Source: extension/ws/mcp-bridge-client.js:915-961 (clone the SHAPE; replace the func body)
const results = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  world: 'MAIN',
  func: (userCode) => { /* ... runs in page ... returns a serializable object ... */ },
  args: [code],
});
const injectionResult = results && results[0];      // array of InjectionResult
if (!injectionResult) {
  return { success: false, error: 'No result from script execution' };
}
const resultValue = injectionResult.result;          // the func's return value (structured-cloned)
if (resultValue && resultValue.error) {
  return { success: false, error: resultValue.error };
}
return { success: true, result: resultValue ? resultValue.value : 'undefined' };
```

### Pattern 2: Dual-export IIFE module shell (clone of `mcp-task-store.js` / interpreter)
**What:** A single IIFE that assigns a global (for SW `importScripts`) AND `module.exports` (for Node tests). Lazy `globalThis.chrome` reference so the module loads under the Node harness where chrome is mocked after load.
**When to use:** The new `capability-fetch.js`.
**Source:** `extension/utils/mcp-task-store.js:1, 59-61, 177-194`.
```javascript
// Source: extension/utils/mcp-task-store.js shell (verified)
(function(global) {
  'use strict';
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
  // ... capabilityFetchInPage(spec) {...}  (the page func — fully self-contained)
  // ... async function executeBoundSpec(spec, tabId) {...}  (the SW wrapper)
  var exportsObj = { capabilityFetchInPage: capabilityFetchInPage, executeBoundSpec: executeBoundSpec };
  global.FsbCapabilityFetch = exportsObj;             // SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportsObj; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

### Pattern 3: Resume-sidecar write cadence around a bounded async op
**What:** subscribe-time `in_progress` write → (heartbeat ticks, not needed for a single bounded fetch) → terminal write → delete. For a single bounded fetch the cadence collapses to: write `BEFORE_API_REQUEST` snapshot, do the op, write terminal, delete.
**Source:** `extension/ws/mcp-bridge-client.js:1442-1458` (subscribe-time write) + `mcp-task-store.js` API.
```javascript
// Source: mcp-bridge-client.js:1444-1456 (subscribe-time snapshot shape — snake_case envelope)
const _store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
if (_store && typeof _store.writeSnapshot === 'function') {
  await _store.writeSnapshot(taskId, {
    task_id: taskId,
    status: 'in_progress',
    started_at: Date.now(),
    last_heartbeat_at: Date.now(),
    originating_mcp_call_id: /* ... */ null,
    target_tab_id: tabId,
    current_step: 'BEFORE_API_REQUEST',   // <-- Phase 27 marker (D-10); existing code uses a number here
    method: spec.method,                  // <-- Phase 27 addition for D-11 classification
    origin: spec.origin,                  // <-- Phase 27 addition
    ai_cycle_count: 0,
    last_dom_hash: null,
  }).catch(() => { /* best-effort — never block the fetch on persistence */ });
}
```

### Anti-Patterns to Avoid
- **Referencing `jmespath` (or any SW global / sibling helper / closure var) inside `capabilityFetchInPage`:** the func is stringified and re-parsed in the page — those symbols do not exist there. Throws `ReferenceError` ONLY against real sites; a stubbed-executeScript unit test never executes the body, so this passes CI and fails live. (This is precisely why D-07 runs `extract` SW-side.)
- **Issuing the fetch from the SW (`globalThis.fetch` in the worker):** extension-origin request → CORS preflight + SameSite cookies withheld → silently logged-out shape. Wall 2 anti-pattern.
- **Routing the recipe fetch through the legacy `execute_js` seam to "reuse" it:** that seam uses `eval`/`new Function` (user/model trust class). The recipe path must be dynamic-code-free (Wall 1 / D-02). Clone the injection SHAPE, define a FIXED func.
- **Appending `query` to the URL AFTER the origin-pin check:** a `{var}`-injected query param could re-target the request post-validation. Fold query into the URL FIRST (D-09), then pin.
- **Blind-retrying a mutating method after an ambiguous eviction:** double-mutation. Surface `RECOVERY_AMBIGUOUS` (D-11). The first proof recipe is a GET specifically to keep the happy path idempotent.
- **Returning auth material across the executeScript boundary:** only the (non-secret) response body crosses back; the cookie stays in the browser's jar and is never read by JS.
- **Forgetting the allowlist line:** Check 4 globs `extension/utils/capability-*.js` from disk and fails CI if `capability-fetch.js` is absent from `RECIPE_PATH_ALLOWLIST` (bypass-by-omission).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JMESPath evaluation of `extract` | A hand-rolled path subset in the page func | `getFSBJmespath().search(data, expr)` SW-side | The full vendored engine already ships (`background.js:119`); a subset diverges from real recipes and bloats the serialization-sensitive page func. |
| SW-eviction survival | A new storage scheme / new key | `mcp-task-store.js` `writeSnapshot`/`readSnapshot`/`deleteSnapshot` (key `fsbRunTaskRegistry`, versioned envelope, empty-map-removes-key) | Proven `chrome.storage.session` machinery from Phase 239; PITFALLS Pitfall 7 says reuse, do not reinvent. |
| Mid-mutation policy vocabulary | New ad-hoc state names | Lattice marker strings `BEFORE_API_REQUEST` / `ON_ERROR_SW_EVICTION_MID_REQUEST` / `RECOVERY_AMBIGUOUS` (`lattice-runtime-adapter.js:281-307`) | One shared taxonomy across the runtime; the planner reuses the STRINGS (the Lattice `resume()` reads `state._currentStepName` — see the field-name caveat in §ResumePolicy). |
| Recipe validation | A second validator | `validateRecipe` (`capability-recipe-schema.js`) via `interpretRecipe` | Already the closed-vocabulary gate; the GitHub recipe must pass it unchanged. |
| Typed-error surfacing | A new MCP error-message arm | The `RECIPE_*`/`TRIGGER_*` verbatim-passthrough at `errors.ts:107, 133` | One-line registration; INV-01-safe (no tool schema touched). |
| Endpoint templating / query encoding | New string interpolation | The interpreter's `templateEndpoint` + `buildRequest` (`capability-interpreter.js:131-213`) — already encodeURIComponent-escapes | Phase 26 already solved template-injection safety; Phase 27 only folds the existing `query` map into the URL. |

**Key insight:** Phase 27 is a wiring phase. Nearly every "how do I do X" already has a blessed answer in the codebase; the risk is re-implementing one of these and diverging. The ONE genuinely new algorithm is the in-page `func` body (CSRF scrape + `fetch` + size-capped parse) — and even that is a ~30-line self-contained function modeled on the cited OpenTabs `fetchFromPage` archetype.

## Runtime State Inventory

> Phase 27 is a **greenfield feature addition** (new file + additive edits), NOT a rename/refactor/migration. This section is included for completeness because the phase touches persisted `chrome.storage.session` state; each category is answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The `run_task` sidecar writes to `chrome.storage.session` key `fsbRunTaskRegistry` (`mcp-task-store.js:51`). Phase 27 writes ADDITIONAL records (the fetch snapshot) under the SAME envelope with `current_step:'BEFORE_API_REQUEST'`. No schema migration — the envelope already accepts arbitrary `current_step` values (existing code writes numbers; Phase 27 writes a string). | Code edit only (new writer); no data migration. Confirm the SW-wake reconciliation in `mcp-bridge-client.js` tolerates a string `current_step` (it only filters on `status==='in_progress'` at `mcp-task-store.js:166`, so a string step is safe). |
| Live service config | None. No external service (n8n / Datadog / Tailscale / Cloudflare) holds any Phase-27 string. The only "external" target is `github.com`, which holds nothing FSB-owned. | None — verified by the phase scope (one hardcoded recipe, no service registration). |
| OS-registered state | None. No Task Scheduler / pm2 / launchd / systemd registration. The extension SW is the only runtime. | None — verified: Phase 27 adds no OS-level registration. |
| Secrets / env vars | None. The authenticated session uses the user's EXISTING browser cookies (`_gh_sess`, `logged_in`), which FSB never reads, names, or persists. No new secret key, no new env var. | None — verified: auth material stays in the browser cookie jar (GOV-06 posture, enforced early here). |
| Build artifacts | `background.js` is an esbuild input (per `26-CONTEXT` D-05 note). The additive `importScripts('utils/capability-fetch.js')` line is a source edit; after it lands, the extension bundle must be rebuilt so the new module is included. The CI guard's Check 4 reads `extension/utils/` from disk, so the new file is picked up at build time. | Reinstall/rebuild the extension after adding the importScripts line (standard for any new SW module). |

**Nothing found in categories Live service config / OS-registered state / Secrets:** stated explicitly above — none, verified by phase scope.

## Common Pitfalls

### Pitfall 1: The in-page func silently captures SW scope
**What goes wrong:** `capabilityFetchInPage` references `getFSBJmespath()`, a helper from `capability-fetch.js`, or any closure variable. Against a stubbed `executeScript` (CI) the func body never runs, so tests pass. Against a real page the stringified func throws `ReferenceError: jmespath is not defined`.
**Why it happens:** `chrome.scripting.executeScript` serializes `func` via `Function.prototype.toString` and re-parses it in an isolated page realm — no closure, no SW globals.
**How to avoid:** The func takes EVERYTHING via `args[0]` (the spec). `extract` runs SW-side AFTER the body returns (D-07). Keep the func a single top-level function with only inline locals. Add a unit assertion that `capabilityFetchInPage.toString()` contains no `jmespath`/`getFSB`/`require`/`importScripts` substring (cheap static guard).
**Warning signs:** any free identifier in the func that isn't a Web API (`document`, `fetch`, `JSON`, `URL`) or an `args` field.

### Pitfall 2: CI fails by omission (allowlist drift)
**What goes wrong:** the new `capability-fetch.js` is added but not registered in `RECIPE_PATH_ALLOWLIST`; CI goes red with "exists on disk but is NOT on the recipe-path allowlist."
**Why it happens:** Check 4 (`verify-recipe-path-guard.mjs:261-281`) globs `extension/utils/capability-*.js` from disk and fails closed on any unlisted match.
**How to avoid:** add `'extension/utils/capability-fetch.js'` to the array at `verify-recipe-path-guard.mjs:84-91` IN THE SAME plan/task that creates the file. Then keep the file free of `eval(` / `new Function` / `import(` even in comments and string literals (Check 1, `:105-135`, uses word-boundary regexes — so even a comment "// no eval(" trips it).
**Warning signs:** the words `eval`, `new Function`, `import(` appearing anywhere in the new file; the file present but `npm run validate:extension` red.

### Pitfall 3: Origin-pin checks the wrong thing (URL but not session)
**What goes wrong:** the interpreter confirms `new URL(endpoint, origin).origin === recipe.origin`, but the active tab is on a DIFFERENT origin. The fetch runs in that tab's MAIN world → cookies for the wrong origin (or none) → logged-out shape or, worse, a same-named cookie from an attacker-controlled tab.
**Why it happens:** the interpreter check is self-consistency only; it cannot know the tab. "Right URL, wrong tab/session" passes the first check.
**How to avoid:** enforce BOTH (D-08): (1) interpreter URL self-consistency after folding query; (2) wrapper asserts active/owned tab origin === `spec.origin` immediately before `executeScript`. Both before any side effect.
**Warning signs:** a single origin check; cookies attaching from a tab whose origin ≠ `spec.origin`.

### Pitfall 4: Mid-mutation double-execution after eviction
**What goes wrong:** SW is evicted mid-POST; on wake the snapshot shows `BEFORE_API_REQUEST` and the code blindly re-issues → the mutation runs twice (e.g., two comments posted).
**Why it happens:** an in-flight snapshot is ambiguous for non-idempotent methods — the request may or may not have reached the server.
**How to avoid:** classify by method on wake (D-11): mutating + in-flight → `RECOVERY_AMBIGUOUS`, surfaced, NEVER retried; GET may re-issue. Phase 27's proof recipe is a GET to keep the happy path safe; the mutation path is asserted via a synthetic POST snapshot in CI (no live mutation).
**Warning signs:** any unconditional retry of a snapshot whose method ∈ {POST,PUT,PATCH,DELETE}.

### Pitfall 5: The `extract` JMESPath crosses the serialization boundary the wrong way
**What goes wrong:** the func returns a huge response body (e.g., a multi-MB HTML page) across the `executeScript` return; structured-clone of a giant string is slow / the body is HTML not JSON and `JSON.parse` throws inside the func, losing the status signal.
**Why it happens:** GitHub web routes increasingly serve embedded-React/Turbo HTML, not clean JSON (D-14 caveat); naive `JSON.parse` of the body discards the 200-vs-302 status that is the real signal.
**How to avoid:** the func reads `response.status` and `response.url` (for redirect detection) FIRST, then attempts `response.json()` inside a try/catch, falling back to a size-capped `response.text()`; it returns `{ ok, status, finalUrl, body }` where `body` is JSON-or-text and capped at the planner-chosen size (Claude's discretion). SW-side, run `extract` only when `body` is parsed JSON; the logged-in assertion uses `status`/`finalUrl`/a meta-tag substring, not a JSON field (D-14).
**Warning signs:** `JSON.parse` outside a try/catch in the func; no size cap; the logged-in assertion depending on a clean JSON body.

## Code Examples

> These are implementation-ready sketches grounded in the verified seams. The planner should treat them as the patterns to clone; exact size caps / cookie-path inclusion are Claude's discretion per CONTEXT.md.

### capabilityFetchInPage — the self-contained page func (FETCH-01/FETCH-02)
```javascript
// Source pattern: mcp-bridge-client.js:918-935 (injection func shape) + OpenTabs fetchFromPage archetype
// D-03: FULLY self-contained. References only Web APIs (document, fetch, JSON, URL) and args[0].
// NO jmespath, NO sibling helpers, NO closures. extract runs SW-side (D-07).
function capabilityFetchInPage(spec) {
  return (async () => {
    try {
      var headers = Object.assign({}, spec.headers || {});
      // FETCH-02: CSRF live-scrape, in-page, BEFORE the request (D-05).
      if (spec.csrfSource && spec.csrfSource.header) {
        var token = null;
        if (spec.csrfSource.from === 'meta' && spec.csrfSource.selector) {
          var el = document.querySelector(spec.csrfSource.selector);
          token = el ? (el.getAttribute('content') || el.content || null) : null;
        } else if (spec.csrfSource.from === 'cookie') {
          // minimal cookie parse (planner's discretion whether to ship in v1)
          var m = ('; ' + document.cookie).split('; ' + spec.csrfSource.selector + '=');
          token = (m.length === 2) ? decodeURIComponent(m.pop().split(';').shift()) : null;
        }
        if (token) { headers[spec.csrfSource.header] = token; }
      }
      var init = {
        method: spec.method || 'GET',
        headers: headers,
        credentials: 'include',           // FETCH-01: first-party HttpOnly cookies attach (Wall 2)
        redirect: 'manual'                // so a 302 -> /login is observable as the logged-out signal (D-14)
      };
      if (spec.body && spec.method !== 'GET' && spec.method !== 'HEAD') {
        init.body = (typeof spec.body === 'string') ? spec.body : JSON.stringify(spec.body);
      }
      var resp = await fetch(spec.url, init);
      var status = resp.status;
      var finalUrl = resp.url;
      var redirected = resp.type === 'opaqueredirect' || (status >= 300 && status < 400);
      // Read body defensively; size-cap (CAP value is planner's discretion).
      var CAP = 256 * 1024;
      var text = '';
      try { text = await resp.text(); } catch (e) { text = ''; }
      if (text.length > CAP) { text = text.slice(0, CAP); }
      var json = null;
      try { json = JSON.parse(text); } catch (e) { json = null; }
      // Return ONLY non-secret response data. No cookies, no auth material.
      return { ok: resp.ok, status: status, finalUrl: finalUrl, redirected: redirected,
               json: json, text: json ? null : text };
    } catch (err) {
      return { error: (err && err.message) ? err.message : String(err) };
    }
  })();
}
```
> Note: `executeScript` awaits a Promise returned by the func (Chrome supports async `func`; the IIFE-async form above is the safest serialization-stable shape — the function declaration stringifies cleanly).

### executeBoundSpec — the SW wrapper (FETCH-03 session-pin, FETCH-04 sidecar, FETCH-07 extract)
```javascript
// Source pattern: mcp-bridge-client.js:915-961 (executeScript read) + mcp-task-store.js (sidecar) + getFSBJmespath
async function executeBoundSpec(spec, tabId) {
  // FETCH-03 (D-08 part 2): active/owned tab origin MUST equal spec.origin before any side effect.
  var c = _getChrome();
  var tab = (c && c.tabs && c.tabs.get) ? await c.tabs.get(tabId) : null;
  var tabOrigin = null;
  try { tabOrigin = tab && tab.url ? new URL(tab.url).origin : null; } catch (e) { tabOrigin = null; }
  if (!tabOrigin || tabOrigin !== spec.origin) {
    return { success: false, code: 'RECIPE_ORIGIN_MISMATCH', errorCode: 'RECIPE_ORIGIN_MISMATCH',
             error: 'active tab origin ' + tabOrigin + ' != recipe origin ' + spec.origin };
  }

  // FETCH-04 (D-10): write BEFORE_API_REQUEST snapshot before executeScript.
  var store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
  var taskId = /* planner-chosen stable id, e.g. 'cap_fetch_' + spec.origin + '_' + Date.now() */;
  if (store && store.writeSnapshot) {
    await store.writeSnapshot(taskId, {
      task_id: taskId, status: 'in_progress', started_at: Date.now(),
      last_heartbeat_at: Date.now(), target_tab_id: tabId,
      current_step: 'BEFORE_API_REQUEST', method: spec.method, origin: spec.origin
    });
  }

  var results;
  try {
    results = await c.scripting.executeScript({
      target: { tabId: tabId }, world: 'MAIN',
      func: capabilityFetchInPage, args: [spec]
    });
  } catch (err) {
    // executeScript itself threw (restricted page, tab gone). Terminal + delete.
    if (store && store.writeSnapshot) {
      await store.writeSnapshot(taskId, { task_id: taskId, status: 'error', current_step: 'AFTER_API_REQUEST',
        method: spec.method, origin: spec.origin });
    }
    if (store && store.deleteSnapshot) { await store.deleteSnapshot(taskId); }
    return { success: false, error: 'executeScript failed: ' + (err && err.message ? err.message : String(err)) };
  }

  var r = results && results[0] ? results[0].result : null;
  // Terminal snapshot then delete (single bounded op — no heartbeat needed).
  if (store && store.writeSnapshot) {
    await store.writeSnapshot(taskId, { task_id: taskId, status: r && !r.error ? 'complete' : 'error',
      current_step: 'AFTER_API_REQUEST', method: spec.method, origin: spec.origin });
  }
  if (store && store.deleteSnapshot) { await store.deleteSnapshot(taskId); }

  if (!r) { return { success: false, error: 'no result from page fetch' }; }
  if (r.error) { return { success: false, error: r.error }; }

  // D-07: SW-side read-only extract via the vendored jmespath global.
  var data = r.json;
  if (spec.extract && data != null) {
    var jp = (typeof FsbCapabilityInterpreter !== 'undefined' && FsbCapabilityInterpreter.getFSBJmespath)
      ? FsbCapabilityInterpreter.getFSBJmespath() : null;
    if (jp && typeof jp.search === 'function') {
      try { data = jp.search(r.json, spec.extract); } catch (e) { /* leave data as raw json */ }
    }
  }
  return { success: true, status: r.status, finalUrl: r.finalUrl, redirected: r.redirected,
           data: data, text: r.text };
}
```

### interpretRecipe edit — fold query + origin-pin (FETCH-03 part 1, D-08/D-09)
```javascript
// Source: capability-interpreter.js:305-315 — the assembly slot. Insert AFTER step 5 (spec assembled,
// query built at :311) and BEFORE step 6 (bindAuthStrategy at :318). The :128-129 comment pre-flags this.
// 5b. D-09: fold the built query map into the URL BEFORE the pin (guards the TRUE request target).
var effectiveUrl = templated.url;
var qkeys = Object.keys(built.query || {});
if (qkeys.length) {
  var qs = qkeys.map(function(k){ return encodeURIComponent(k) + '=' + built.query[k]; }).join('&');
  // built.query values are ALREADY encodeURIComponent-escaped (buildRequest, :206). Do not double-encode.
  effectiveUrl = templated.url + (templated.url.indexOf('?') === -1 ? '?' : '&') + qs;
}
// 5c. D-08(1): origin-pin re-assertion against the EFFECTIVE url (relative -> resolved against origin).
var resolved;
try { resolved = new URL(effectiveUrl, recipe.origin); } catch (e) { resolved = null; }
if (!resolved || resolved.origin !== recipe.origin) {
  return createRecipeError('RECIPE_ORIGIN_MISMATCH', { url: effectiveUrl, origin: recipe.origin });
}
// then set spec.url = effectiveUrl (replacing the bare templated.url at :307) and proceed to step 6.
```
> The dual-field typed-error shape (`createRecipeError`, `:85-93`) and the no-network charter (26-D-11 — NO `executeScript`/`fetch` in this file) are preserved: the interpreter still only validates/binds/returns. `RECIPE_ORIGIN_MISMATCH` is a new RECIPE_* code that already surfaces verbatim via the existing `errors.ts` regex (`/RECIPE_.+/`) — no errors.ts change needed for IT (only `RECOVERY_AMBIGUOUS` needs registering).

### errors.ts edit — register RECOVERY_AMBIGUOUS (D-12)
```typescript
// Source: mcp/src/errors.ts:54-68 (CODE_ONLY_ERROR_KEYS). RECOMMENDED edit: add one member.
const CODE_ONLY_ERROR_KEYS = new Set([
  // ...existing members...
  'TOOL_REMOVED',
  // v0.9.99 Native Capability Catalog (Phase 27 FETCH-04): mid-mutation eviction ambiguity.
  // Surfaced verbatim so the MCP host can distinguish "ambiguous — ask the user" from a generic rejection.
  'RECOVERY_AMBIGUOUS',
]);
```
> Alternative (functionally equivalent): extend the regex at `:133` to `/^(TRIGGER_.+|RECIPE_.+|RECOVERY_AMBIGUOUS|...)$/`. The set add is cleaner for a single token. Either is INV-01-safe (no MCP tool schema touched). The `RECIPE_*` family — including the new `RECIPE_ORIGIN_MISMATCH` — already matches the existing `/RECIPE_.+/` arm and needs no edit.

### verify-recipe-path-guard.mjs edit — allowlist (D-02)
```javascript
// Source: scripts/verify-recipe-path-guard.mjs:84-91 — add the new capability module.
const RECIPE_PATH_ALLOWLIST = [
  'extension/utils/capability-recipe-schema.js',
  'extension/utils/capability-interpreter.js',
  'extension/utils/capability-auth-strategies.js',
  'extension/utils/capability-fetch.js',          // <-- Phase 27 (FETCH-01) — REQUIRED or Check 4 fails closed
  'extension/lib/cfworker-json-schema.min.js',
  'extension/lib/jmespath.min.js',
  'extension/lib/minisearch.min.js',
];
```

### background.js edit — additive importScripts wiring (D-04, load order)
```javascript
// Source: background.js:119-122 (the Phase 26 capability block). Load AFTER the interpreter so
// FsbCapabilityInterpreter.getFSBJmespath is available to executeBoundSpec, and AFTER jmespath (:119).
// The interpreter itself loads after auth-strategies (:124-129 region). Place capability-fetch LAST
// of the capability family:
try { importScripts('utils/capability-fetch.js'); } catch (e) { console.error('[FSB] Failed to load capability-fetch.js:', e.message); }
```
> Concrete required order (all already satisfied for the deps): `jmespath.min.js` (:119) → `cfworker-json-schema.min.js` (:121) → `capability-recipe-schema.js` (:122) → `capability-auth-strategies.js` → `capability-interpreter.js` → **`capability-fetch.js` (NEW, last)**. `mcp-task-store.js` (:34) loads far earlier, so `globalThis.FsbMcpTaskStore` is already present.

### The hardcoded GitHub recipe (D-13) — validated against the closed schema
```json
{
  "schemaVersion": 1,
  "id": "github.notifications",
  "origin": "https://github.com",
  "endpoint": "/notifications",
  "method": "GET",
  "authStrategy": "same-origin-cookie",
  "extract": "@"
}
```
**Schema validation (mental check against `capability-recipe-schema.js:79-148`):**
- `schemaVersion: 1` — matches `const: FSB_RECIPE_SCHEMA_VERSION` (=1). PASS.
- `id` — non-empty string. PASS.
- `origin: "https://github.com"` — matches `^https?://[^/?#\s]+$` (bare origin, no path). PASS.
- `endpoint: "/notifications"` — matches `^/(?!/)(?:[^\s]*)$`, no `..`. PASS.
- `method: "GET"` — in the verb enum. PASS.
- `authStrategy: "same-origin-cookie"` — in the four-member enum. PASS.
- `params`/`request` omitted — both optional. PASS (no `{var}` in endpoint, so the templater needs no args).
- `extract: "@"` — a string (JMESPath identity, returns the whole body); the live assertion uses status/meta, not this field, so `@` is a harmless placeholder. Alternatively omit `extract` entirely (it's optional). PASS.
- `csrf` omitted — only required when `authStrategy === 'csrf-header-scrape'` (the if/then at :143-147). PASS.

> **Closed-vocabulary flag:** NONE. Every field used is in the closed vocabulary; no field needs to be added to the schema. The recipe is accept-fixture-shaped — it should be added to `catalog/recipes/` (NOT `_fixtures/`, since `_fixtures/` is the Phase-26 accept/reject test set; per D-13 the real recipe lands directly under `catalog/recipes/`). If the planner wants it ALSO exercised by the CI guard's fixture check, note that Check 2 only scans `catalog/recipes/_fixtures/` (`verify-recipe-path-guard.mjs:140`), so a copy named `valid-github-notifications.json` in `_fixtures/` would be validated at build time too (optional, recommended for a free closed-vocab proof).

### Reserved FETCH-02 exemplar (D-16) — POST /_graphql with CSRF
```json
{
  "schemaVersion": 1,
  "id": "github.graphql",
  "origin": "https://github.com",
  "endpoint": "/_graphql",
  "method": "POST",
  "authStrategy": "csrf-header-scrape",
  "csrf": { "from": "meta", "selector": "input[name=authenticity_token]", "header": "X-CSRF-Token" }
}
```
> Held in reserve; exercised only AFTER the GET proof is green. Note the `selector` targets an `input[name=authenticity_token]` — the in-page scrape for `from:'meta'` reads `.content`, but an `<input>` value lives in `.value`, not `.content`. The planner must either (a) special-case `input` selectors to read `.value` in `capabilityFetchInPage`, or (b) keep `from:'meta'` strictly for `<meta>` tags and add an `input`-shaped read path. This is a FETCH-02 detail, flagged here so it is not a surprise. [ASSUMED — exact GitHub CSRF DOM shape; verify live in the FETCH-02 sub-task.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome.tabs.executeScript` (MV2) | `chrome.scripting.executeScript({world:'MAIN', func, args})` (MV3) | MV3 (2021+) | The seam Phase 27 uses; already the FSB standard (two live call sites). `world:'MAIN'` is what gives page-realm cookie access. |
| Recipe logic as fetched code (OpenTabs npm-per-plugin) | Closed-vocabulary recipe DATA + bundled interpreter | This milestone (Wall 1) | Phase 27's recipe is pure data; the only code is the bundled `capability-fetch.js` on the CI-guarded allowlist. |
| Background-SW `fetch` for "API" calls | Page-MAIN-world `fetch` with `credentials:'include'` | This milestone (Wall 2) | The load-bearing correctness property FETCH-01/FETCH-05 prove. |

**Deprecated/outdated:**
- Running `extract` (JMESPath) in the page func — superseded by the SW-side D-07 decision (serialization safety). Do not re-introduce.
- Any reliance on a clean JSON body from GitHub web routes — superseded by the status/meta-tag assertion (D-14); GitHub increasingly serves Turbo/React HTML.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `github.com/notifications` returns HTTP 200 with a `<meta name="user-login" content="…">` when logged in, and 302→`/login?return_to=…` when logged out. | §FETCH-05, D-14 | If the exact meta name or redirect shape changed, the LIVE UAT assertion needs adjusting. LOW impact: this is exactly what the human-gated UAT verifies against the live page; CI never depends on it. CONTEXT.md records a 2026-06-20 live probe; re-verify in the UAT step. |
| A2 | GitHub session cookies `_gh_sess` and `logged_in` are `HttpOnly` (JS-unreadable), so a logged-in shape is obtainable ONLY via page-context `credentials:'include'`. | §FETCH-05, D-14 | If a cookie were JS-readable, the "page-context is necessary" claim weakens — but the mechanic (cookies attach in page context) still holds. LOW impact. |
| A3 | The GitHub `/_graphql` CSRF token lives in `input[name=authenticity_token]` (`.value`), not a `<meta>` tag. | §Reserved FETCH-02 exemplar | Affects only the RESERVED FETCH-02 recipe, not the FETCH-01 proof. The in-page scrape's `.content` vs `.value` read must match the real element. Flagged for live verification in the FETCH-02 sub-task. |
| A4 | `chrome.scripting.executeScript` awaits an async `func` and returns its resolved value in `results[0].result` (structured-cloneable). | §executeScript contract | If async return weren't awaited, the func would need a sync return. Mitigation: the IIFE-async shape returns a Promise that Chrome MV3 awaits (documented behavior + matches FSB's existing async-capable usage). MEDIUM→LOW: verify in the first CI test by stubbing a resolved-Promise return. |
| A5 | A string `current_step` value (`'BEFORE_API_REQUEST'`) coexists safely with the existing numeric `current_step` writers in the same `fsbRunTaskRegistry` envelope. | §Runtime State Inventory, D-10 | The reconciliation filters only on `status==='in_progress'` (`mcp-task-store.js:166`), never on `current_step` type, so mixed types are safe. Verified by reading the filter. LOW. |

**Note:** Items A1/A2/A3 are the externally-dependent claims (GitHub's live behavior). By design (D-15), CI never depends on them — they are asserted only by the human-gated UAT. This is the correct mock-vs-live split, not a gap.

## Open Questions

1. **Task-id scheme for the fetch sidecar snapshot.**
   - What we know: the sidecar keys records by a `task_id` string (`mcp-task-store.js:128`). The existing run_task writer uses the run/session id.
   - What's unclear: Phase 27 has no MCP call id yet (no `invoke_capability` until Phase 28). What stable id keys the fetch snapshot?
   - Recommendation: synthesize a deterministic-enough id at the wrapper (e.g. `'cap_fetch_' + spec.origin + '_' + Date.now()`), documented as Claude's discretion. It only needs to be unique within the in-flight window and discoverable by `listInFlightSnapshots()` on wake. The CI test can assert the snapshot exists under whatever id the wrapper returns.

2. **Does Phase 27 reuse the Lattice `resume()` function or define a thin local classifier?**
   - What we know: `lattice-runtime-adapter.js:281-307` `resume(snapshot)` reads `snapshot.payload` (a JSON STRING) and classifies on `state._currentStepName` (camelCase). The mcp-task-store envelope uses `current_step` (snake_case) and is NOT a `{payload:"<json>"}` shape.
   - What's unclear: the two shapes don't line up — Lattice's `resume()` expects `snapshot.payload` JSON-string with `_currentStepName`; the task-store snapshot is a flat object with `current_step`.
   - Recommendation: **define a thin local classifier at the fetch layer** that REUSES the Lattice marker STRINGS (`'BEFORE_API_REQUEST'`, `'RECOVERY_AMBIGUOUS'`) but reads the task-store's flat `current_step`/`method` fields. Do NOT try to feed a task-store snapshot into Lattice's `resume()` — the field names differ. This matches CONTEXT.md D-11 ("reuses the Lattice ResumePolicy marker taxonomy") which says reuse the *taxonomy*, not necessarily the function. Flag this field-name mismatch prominently for the planner.

3. **Where is the SW-wake reconciliation for the fetch snapshot triggered?**
   - What we know: the run_task reconciliation lives in `mcp-bridge-client.js` (`listInFlightSnapshots` → resolve with `sw_evicted`), around :1536-1562.
   - What's unclear: Phase 27 has no MCP call to resolve on wake (the fetch is driven directly, not via a long-lived run_task). Is the reconciliation a no-op surfaced only when the same recipe is re-invoked?
   - Recommendation: for Phase 27's direct-drive proof, the "reconciliation" can be a function `classifyOnWake(snapshot)` that the NEXT invoke (or the CI test) calls against any leftover `in_progress` snapshot, returning `RECOVERY_AMBIGUOUS` for a mutating method. Full wake-time auto-resolution belongs to the Phase 28 MCP surface. The CI test asserts the classifier directly (synthetic POST snapshot → `RECOVERY_AMBIGUOUS`), which proves FETCH-04 without a live eviction.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` (run the test suite) | FETCH-05 CI suite | ✓ | system node | — |
| `chrome.scripting` MAIN-world | FETCH-01 (live) | live browser only | MV3 | CI stubs it via `installChromeMock` + a stubbed `executeScript` recorder; live path is human-gated. |
| Vendored `jmespath` | D-07 extract | ✓ (shipped Phase 26) | `extension/lib/jmespath.min.js` | none needed. |
| `mcp-task-store.js` + `chrome.storage.session` | FETCH-04 | ✓ (Phase 239) | in-repo | CI uses the in-memory `createStorageArea` from the harness. |
| Logged-in `github.com` browser session | FETCH-05 (live UAT) | human-provided | — | **No CI fallback by design** — the live logged-in-shape assertion is `human_needed` (D-15). |
| Built `mcp/build/errors.js` | D-12 passthrough test | ✓ (built earlier in `scripts.test` chain) | in-repo | `npm --prefix mcp run build` runs before the capability tests in the chain. |

**Missing dependencies with no fallback:**
- A logged-in `github.com` session for the LIVE assertion — intentionally human-gated (`human_needed`), not a blocker for CI green.

**Missing dependencies with fallback:**
- Live `chrome.scripting`/browser — CI uses the stubbed `executeScript` recorder; the live behavior is the human UAT.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Zero-framework Node scripts — `node tests/*.test.js`, each its own process. Two in-repo idioms: (a) `passed`/`failed` counters + `check(cond,msg)` + `process.exit(failed>0?1:0)` (`tests/capability-interpreter.test.js`); (b) `node:assert` + named cases (`tests/mcp-task-store.test.js`). Either is acceptable; (a) matches the capability family. |
| Config file | none — the chain is the `"test"` script in root `package.json:17`. |
| Quick run command | `node tests/capability-fetch.test.js` |
| Full suite command | `npm test` (runs the whole chain; the capability tests are at the tail) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | Mock vs Live | File Exists? |
|--------|----------|-----------|-------------------|--------------|-------------|
| FETCH-01 | The injected func sets `credentials:'include'` and is structurally serialization-safe; the wrapper reads `results[0].result`. | unit (mock) | `node tests/capability-fetch.test.js` | **MOCK** — stubbed `executeScript` recorder captures the `{world:'MAIN', func, args}` call; assert `func.toString()` contains `credentials` and `'include'` and contains NO `jmespath`/`getFSB`/`require` substring. | ❌ Wave 0 |
| FETCH-02 | Given a `csrfSource` spec, the func threads the scraped token into `headers[csrfSource.header]` before fetch. | unit (mock) | `node tests/capability-fetch.test.js` | **MOCK** — run `capabilityFetchInPage` in Node with a stubbed `document.querySelector` + stubbed `fetch` recorder; assert the recorded request headers include the CSRF header. | ❌ Wave 0 |
| FETCH-03 | (1) interpreter rejects a cross-origin/protocol-relative effective URL with `RECIPE_ORIGIN_MISMATCH`; (2) wrapper rejects when active-tab origin ≠ `spec.origin`, BEFORE `executeScript`. | unit (mock) | `node tests/capability-fetch.test.js` (+ extend `tests/capability-interpreter.test.js`) | **MOCK** — feed a recipe whose query folds to a foreign origin → interpreter returns the typed error; set the mock tab origin ≠ spec.origin → wrapper returns mismatch AND the `executeScript` recorder stays empty (no side effect). | ❌ Wave 0 |
| FETCH-04 | Before `executeScript`, a `BEFORE_API_REQUEST` snapshot is written; on success it is deleted; a synthetic mutating-method in-flight snapshot classifies to `RECOVERY_AMBIGUOUS` (never retried); a GET snapshot is re-issuable. | unit (mock) | `node tests/capability-fetch.test.js` | **MOCK** — `installChromeMock` (real in-memory `chrome.storage.session`); assert via `readSnapshot` the `BEFORE_API_REQUEST` record existed during the call and is gone after; call the thin classifier with a POST snapshot → `RECOVERY_AMBIGUOUS`, with a GET snapshot → re-issuable. | ❌ Wave 0 |
| FETCH-05 | The logged-in (not logged-out) data shape returns from the page MAIN world against real `github.com`. | **split**: CI proves the WIRING; live proves the SHAPE | CI: `node tests/capability-fetch.test.js` (end-to-end through the stubbed seam against a fixture body). LIVE: human-gated UAT. | **MOCK (CI):** drive the GitHub recipe through `interpretRecipe → executeBoundSpec` with `executeScript` stubbed to return a fixture `{status:200, json:{…}, finalUrl:'https://github.com/notifications'}`; assert the wrapper threads origin-pin + sidecar + extract and returns the success shape. **LIVE (`human_needed`):** a human, logged in to GitHub, runs the recipe in a real tab and confirms status 200 (not 302→/login) and a non-empty `<meta name="user-login">`. | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node tests/capability-fetch.test.js` (the phase's quick gate).
- **Per wave merge:** `npm test` (full chain — the capability tests run at the tail after `npm --prefix mcp run build`).
- **Phase gate:** Full suite green + `node scripts/verify-recipe-path-guard.mjs` PASS (the allowlist + dynamic-code-free proof) before `/gsd:verify-work`. The LIVE FETCH-05 assertion is recorded `human_needed` and does NOT block CI green (it joins the project's existing live-browser UAT debt ledger in STATE.md).

### The mock-vs-live split (the load-bearing FETCH-05 detail)
- **CI can prove (and must):** the wrapper builds the correct `{world:'MAIN', func, args:[spec]}` call; the func sets `credentials:'include'`; CSRF threads into the declared header; origin is pinned at BOTH points and a mismatch short-circuits before any `executeScript`; the `BEFORE_API_REQUEST` snapshot is written before and deleted after; a mutating-method in-flight snapshot classifies to `RECOVERY_AMBIGUOUS`; `extract` runs SW-side via `getFSBJmespath().search`; the success/error shapes normalize; `RECOVERY_AMBIGUOUS` + `RECIPE_ORIGIN_MISMATCH` surface verbatim through the built `errors.ts`. ALL via mocks/stubs/fixtures — no network, no browser.
- **CI cannot prove (only a live browser can):** that real GitHub HttpOnly cookies actually attach in the page MAIN world and yield a LOGGED-IN body shape (not logged-out). This is the one property that the entire phase exists to de-risk, and it is irreducibly a live-browser observation. Recorded as a `human_needed` UAT scenario (mirroring the Phase 25 PhantomStream live-UAT posture already in STATE.md's deferred ledger).
- **Why this split is correct, not a cop-out:** the cookie-attach behavior is a property of Chrome + GitHub, not of FSB's code; FSB's code (the wiring) is fully testable and IS tested. Asserting cookie-attach in CI would require a logged-in fixture session, which cannot exist in CI without shipping a real GitHub credential — explicitly forbidden (GOV-06 / auth-stays-local). The human UAT is the right and only place for the shape assertion.

### Wave 0 Gaps
- [ ] `tests/capability-fetch.test.js` — covers FETCH-01..05 (CI side). Clone the loader + recorder scaffold from `tests/capability-interpreter.test.js` (cfworker IIFE via `vm.runInThisContext`, `installChromeMock`, stubbed `executeScript`, built-`errors.js` dynamic import for the passthrough check).
- [ ] Append `&& node tests/capability-fetch.test.js` to the `"test"` chain in `package.json:17` (after `recipe-path-guard.test.js`).
- [ ] A `human_needed` UAT scenario file for the live logged-in-shape assertion (follow the existing `XX-HUMAN-UAT.md` convention — see STATE.md deferred ledger entries for Phase 25). FSB records live-browser assertions as `human_needed`; there is no in-test `human_needed` marker convention (grep found none) — the convention lives in the phase's HUMAN-UAT doc, not in `tests/`.
- [ ] (Optional, recommended) `catalog/recipes/_fixtures/valid-github-notifications.json` so the CI guard's Check 2 fixture run validates the recipe shape at build time too.
- [ ] Extend `tests/capability-interpreter.test.js` (or add cases in the new file) for the `query`-fold + `RECIPE_ORIGIN_MISMATCH` interpreter changes, including the protocol-relative `//evil.com` rejection.

## Security Domain

`security_enforcement` is not disabled in config (absent = enabled), so this section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control (in this phase) |
|---------------|---------|----------------------------------|
| V2 Authentication | yes | Reuse the browser's existing session via `credentials:'include'` in page context; FSB never handles credentials directly. No new auth code. |
| V3 Session Management | yes | HttpOnly session cookies (`_gh_sess`) stay in the browser jar; FSB never reads, copies, or persists them. The response body that crosses the `executeScript` boundary is non-secret data only. |
| V4 Access Control | yes | **Origin-pin (two points, D-08)** is the access-control spine: a recipe bound to origin X may only hit origin X, AND the request only fires when the active tab is on origin X. Cross-origin rejected before any side effect. This is the credential-replay-weapon mitigation (PITFALLS Pitfall 3). |
| V5 Input Validation | yes | The recipe is validated by the closed-vocabulary `validateRecipe` (`@cfworker/json-schema`, eval-free); endpoint templating encodeURIComponent-escapes every param (`capability-interpreter.js:138`); protocol-relative/`..`-traversal endpoints are schema-rejected (`:104-108`). The folded query must NOT double-encode (built.query is already escaped). |
| V6 Cryptography | no | No crypto in Phase 27. (Recipe SIGN-01/02 Ed25519 verification is Phase 30.) |
| V7 Errors & Logging | yes | Typed errors surfaced verbatim (`RECOVERY_AMBIGUOUS`, `RECIPE_ORIGIN_MISMATCH`) without leaking secrets; the response body (potential PII) is NOT logged here (audit log is Phase 30 / GOV-05). |

### Known Threat Patterns for {MV3 page-context authenticated fetch}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-origin credential replay ("recipe for X fired against Y while logged into Y") | Elevation of Privilege / Spoofing | Origin-pin BOTH at the interpreter (URL self-consistency, after query-fold) AND at the wrapper (active-tab origin === spec.origin), before any side effect (D-08). |
| Protocol-relative re-target (`//evil.com`) | Tampering | Schema pattern rejects `//`-prefixed endpoints (`:104-108`); interpreter re-resolves `new URL(effectiveUrl, origin)` and rejects origin drift (D-08(1)). |
| Query-param re-target after validation | Tampering | Fold `spec.query` into the URL BEFORE the pin (D-09) so the pin guards the TRUE target. |
| Auth material exfiltration across the boundary | Information Disclosure | The func returns ONLY response data; cookies never read by JS, never returned, never persisted (GOV-06 posture enforced early). Size-cap the returned body. |
| Double-mutation on SW-eviction recovery | Tampering / Repudiation | Mutating method + in-flight snapshot → `RECOVERY_AMBIGUOUS`, surfaced, never blind-retried (D-11). |
| Dynamic-code injection via the recipe path | Elevation of Privilege | Wall 1: `capability-fetch.js` is dynamic-code-free and on the CI-guard allowlist; recipe carries only data via `args`, never code (D-01/D-02). |
| Template injection into URL/headers | Tampering | encodeURIComponent on every substituted param; unfilled/unknown placeholders rejected with a typed error (Phase 26 `templateEndpoint`/`buildRequest`, reused unchanged). |

## Project Constraints (from CLAUDE.md)

No project-root `./CLAUDE.md` exists. The user's global instructions apply:
- **NO EMOJIS** anywhere — in source, logs, markdown, or comments. All new files (`capability-fetch.js`, the recipe JSON, the test) must be ASCII-only, matching the existing capability modules' "NO EMOJIS, ASCII-only source" header convention.
- **Never run applications automatically** — the live FETCH-05 UAT is human-initiated; do not auto-launch the browser.
- **Browser automation policy** — N/A to authoring; relevant only if a human-driven live check uses FSB MCP tools.

These bind every Phase 27 plan. (Also note the in-repo convention from Phase 26: recipe-path source files are kept free of dynamic-code substrings even in comments — a hard CI requirement, not just style.)

## Sources

### Primary (HIGH confidence) — read directly on `automation-worktree`, 2026-06-20
- `extension/utils/capability-interpreter.js` — `interpretRecipe`, the `query`-built-unappended slot (:300-312), the deferred origin-pin comment (:128-129), `getFSBJmespath()` (:76-78), `createRecipeError` (:85-93), spec assembly (:305-315).
- `extension/utils/capability-auth-strategies.js` — `AUTH_HANDLERS` (:59-83), `same-origin-cookie`→`credentials:'include'` (:65-69), `csrf-header-scrape`→`csrfSource` default (:75-82), `bindAuthStrategy` (:108-116).
- `extension/utils/capability-recipe-schema.js` — `RECIPE_SCHEMA` closed vocabulary (:79-148), origin/endpoint patterns (:95-108), `csrf` if/then (:131-147), `validateRecipe` (:231-299).
- `extension/utils/mcp-task-store.js` — public API `writeSnapshot`/`readSnapshot`/`deleteSnapshot`/`listInFlightSnapshots`/`hydrate` (:128-175), envelope shape (:13-31), empty-map-removes-key (:103-108).
- `extension/ws/mcp-bridge-client.js` — `_handleExecuteJS` MAIN-world seam (:908-962), subscribe-time snapshot write cadence (:1442-1458), heartbeat/terminal cadence (:1270-1366), SW-wake reconciliation (:1536-1562).
- `extension/ai/tool-executor.js` — `execute_js` MAIN-world seam (:374-400), `executeTool` route resolution (:665-695).
- `extension/ai/lattice-runtime-adapter.js` — ResumePolicy `resume()` + marker taxonomy (:281-307) [NB: reads `state._currentStepName`, camelCase, from a `snapshot.payload` JSON string — differs from task-store's flat `current_step`].
- `mcp/src/errors.ts` — `CODE_ONLY_ERROR_KEYS` (:54-68), `resolveErrorKey` + `RECIPE_*`/`TRIGGER_*` regex (:100-135).
- `scripts/verify-recipe-path-guard.mjs` — `RECIPE_PATH_ALLOWLIST` (:84-91), Check 1 grep + FORBIDDEN patterns (:105-135), Check 2 fixture run (:137-234), Check 4 disk-glob drift fail (:257-281).
- `extension/background.js` — capability/lib importScripts block + load order (:106-129), `mcp-task-store.js` load (:34).
- `tests/capability-interpreter.test.js` — the zero-framework clone target (loader via `vm.runInThisContext`, `installChromeMock`, stubbed `executeScript` recorder :74-97, built-`errors.js` passthrough check :251-266).
- `tests/fixtures/run-task-harness.js` — `installChromeMock` / `installVirtualClock` / `createStorageArea` surface.
- `tests/mcp-task-store.test.js` — `node:assert` + round-trip snapshot pattern for FETCH-04.
- `catalog/recipes/_fixtures/valid-recipe.json` — the recipe-JSON field-set template.
- `package.json:17,31,32` — the `"test"` chain, `validate:extension`, `ci` scripts.

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`, `SUMMARY.md` (milestone research, dated 2026-06-19) — cited by CONTEXT.md `<canonical_refs>`; not re-derived here.
- GitHub REST `/notifications` endpoint existence — https://docs.github.com/en/rest/activity/notifications (confirms the endpoint; does NOT cover web-route logged-out HTML behavior).

### Tertiary (LOW confidence — verify at execution / human UAT)
- The live `github.com/notifications` 200-vs-302 + `<meta name="user-login">` behavior and `_gh_sess`/`logged_in` HttpOnly flags — per CONTEXT.md's 2026-06-20 live probe; re-verified-in-UAT, never a CI dependency (A1/A2).
- The `/_graphql` CSRF DOM shape (`input[name=authenticity_token]`) for the reserved FETCH-02 exemplar (A3).

## Metadata

**Confidence breakdown:**
- Standard stack (existing modules + seams): HIGH — every integration point read at its line anchor on the working branch; no new packages.
- Architecture (where each capability runs): HIGH — fully constrained by the locked decisions and the read seams; the responsibility map is unambiguous.
- Pitfalls: HIGH — derived from the verified serialization behavior, the read CI-guard logic, and the locked origin/mutation decisions.
- Validation architecture: HIGH for the mock-provable CI surface; the one LOW item (live GitHub shape) is human-gated by explicit design (D-15), not an unresolved gap.
- The two cross-seam caveats flagged for the planner (ResumePolicy field-name mismatch `current_step` vs `_currentStepName`; the `input.value` vs `meta.content` CSRF read for the reserved FETCH-02 recipe) are the only places where naive cloning would break.

**Research date:** 2026-06-20
**Valid until:** ~2026-07-20 for the in-repo seams (stable; would only drift if the cited files are refactored). The live GitHub assertion (A1/A2/A3) should be re-confirmed at UAT time regardless of date, since it depends on GitHub's web UI which can change without notice.

## RESEARCH COMPLETE
