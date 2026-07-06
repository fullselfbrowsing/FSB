# Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 9 (3 NEW, 4 MODIFIED, 2 REUSE)
**Analogs found:** 9 / 9 (every integration point has a concrete in-repo analog read at its line anchor)

This map saves the executor from re-discovering patterns. Phase 27 is a WIRING phase against already-built seams; nearly every "how do I do X" has a blessed in-repo answer. The risk is re-implementing one and diverging, or naively cloning one of the two flagged cross-seam caveats. Both caveats are called out inline below.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `extension/utils/capability-fetch.js` (NEW) | utility/service (dual-export IIFE) | request-response (page MAIN-world fetch) | `extension/utils/mcp-task-store.js` (module shell) + `extension/ws/mcp-bridge-client.js:908-962` (`_handleExecuteJS` injection shape) | exact (shell) + exact (seam) |
| `extension/utils/capability-interpreter.js` (MODIFIED) | service (binder) | transform (recipe -> bound spec) | its own `templateEndpoint` / `buildRequest` / `createRecipeError` patterns | exact (self-analog) |
| `extension/background.js` (MODIFIED) | config (SW bootstrap) | n/a (importScripts wiring) | `background.js:104-133` `importScripts('lib/...')` / `importScripts('utils/capability-*.js')` block | exact |
| `mcp/src/errors.ts` (MODIFIED) | utility (error mapper) | transform (code -> message) | `errors.ts:54-68` `CODE_ONLY_ERROR_KEYS` + `:100-135` `resolveErrorKey` (RECIPE_*/TRIGGER_* passthrough) | exact (self-analog) |
| `scripts/verify-recipe-path-guard.mjs` (MODIFIED) | config/test (CI guard) | n/a (allowlist entry) | `verify-recipe-path-guard.mjs:84-91` `RECIPE_PATH_ALLOWLIST` (3 existing capability entries) | exact (self-analog) |
| `extension/utils/mcp-task-store.js` (REUSE) | store | event-driven (snapshot persist) | call pattern in `mcp-bridge-client.js:1320-1369` (write cadence) | exact (call-site analog) |
| `extension/ai/lattice-runtime-adapter.js` (REUSE) | utility (classifier taxonomy) | event-driven (eviction classify) | `lattice-runtime-adapter.js:281-307` `resume()` marker strings | role-match (STRINGS only; see CAVEAT-1) |
| `catalog/recipes/*.json` (NEW) | model (recipe data) | n/a (declarative config) | `catalog/recipes/_fixtures/valid-recipe.json` + closed schema `capability-recipe-schema.js:79-148` | exact |
| `tests/capability-fetch.test.js` (NEW) | test | n/a | `tests/capability-interpreter.test.js` (loader + stubbed executeScript recorder) + `tests/recipe-path-guard.test.js` (spawn) + `tests/mcp-task-store.test.js` (storage round-trip) | exact |

---

## Pattern Assignments

### `extension/utils/capability-fetch.js` (NEW -- utility/service, request-response)

The home of (a) `capabilityFetchInPage` (self-contained page `func`) + (b) `executeBoundSpec(spec, tabId)` (SW wrapper). Two analogs: the MODULE SHELL and the INJECTION SEAM.

**Analog A (module shell):** `extension/utils/mcp-task-store.js:1-2, 59-61, 189-194` (also mirrored verbatim by `capability-interpreter.js` and `capability-auth-strategies.js`).

Dual-export IIFE + lazy `globalThis.chrome` accessor (so the module loads under the Node harness where chrome is mocked AFTER load):
```javascript
// mcp-task-store.js:1-2, 59-61
(function(global) {
  'use strict';
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
  // ... capabilityFetchInPage(spec) {...}  executeBoundSpec(spec, tabId) {...}
```
```javascript
// mcp-task-store.js:189-194 -- close shape
  global.FsbCapabilityFetch = exportsObj;            // SW importScripts consumer
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportsObj; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
**Copy:** the IIFE wrapper, the `_getChrome()` lazy accessor, the `global.Fsb*` + `module.exports` dual export, the leading `NO EMOJIS, ASCII-only source.` header block.
**Differs:** new global name `FsbCapabilityFetch`; exports `{ capabilityFetchInPage, executeBoundSpec }`. Reach sibling globals via typeof-guard, NOT closure: `getFSBJmespath` lives on `FsbCapabilityInterpreter` (see SW-side extract below), `writeSnapshot` etc. on `FsbMcpTaskStore`.

**Analog B (MAIN-world injection seam):** `extension/ws/mcp-bridge-client.js:908-962` (`_handleExecuteJS`). The `executeScript` call shape + result-read shape to mirror in `executeBoundSpec`:
```javascript
// mcp-bridge-client.js:915-948 -- CLONE THE SHAPE, REPLACE THE func BODY
const results = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  world: 'MAIN',
  func: (userCode) => { /* runs in page; returns a serializable object */ },
  args: [code],
});
const injectionResult = results && results[0];          // array of InjectionResult
if (!injectionResult) { return { success: false, error: 'No result from script execution' }; }
const resultValue = injectionResult.result;             // structured-cloned return value
if (resultValue && resultValue.error) { return { success: false, error: resultValue.error }; }
return { success: true, result: resultValue ? resultValue.value : 'undefined' };
```
(The sibling seam `tool-executor.js:382-394` has the same `executeScript({target:{tabId}, world:'MAIN', func, args:[code]})` shape with `eval(jsCode)` at `:387`.)
**Copy:** the `executeScript({target:{tabId}, world:'MAIN', func, args:[spec]})` call, the `results && results[0]` guard, the `injectionResult.result` read, the outer try/catch returning `{success:false, error:'... failed: ...'}` on a thrown `executeScript` (restricted page / tab gone).
**Differs (HARD -- D-02/Wall-1):** the `func` is a FIXED named function `capabilityFetchInPage(spec)`, NOT `new Function(userCode)` (mcp-bridge-client.js:922) and NOT `eval(jsCode)` (tool-executor.js:387). Those two seams run user/model code (a different trust class) and are the SANCTIONED_SITES the CI guard forbids on the allowlist. `capability-fetch.js` lands ON the allowlist, so it MUST contain ZERO `eval` / `new Function` / `import(` -- even in comments or strings (Check 1 is a word-boundary regex; "// no eval(" trips it).

**In-page `func` (D-03 serialization-safe) -- self-contained, references only Web APIs (`document`, `fetch`, `JSON`, `URL`) + `args[0]`:** RESEARCH.md:356-405 gives the implementation-ready sketch. Key load-bearing properties to copy:
- CSRF scrape BEFORE the request (D-05): `from:'meta'` -> `document.querySelector(sel).content`; thread into `headers[spec.csrfSource.header]`. (CAVEAT-2: the reserved FETCH-02 recipe's selector is `input[name=authenticity_token]`, whose token is in `.value` not `.content` -- if `from:'cookie'`/`input` ships, special-case the read. The FETCH-01 GET needs neither.)
- `fetch(spec.url, { method, headers, body, credentials:'include', redirect:'manual' })` -- `credentials:'include'` is what makes cookies attach (FETCH-01); `redirect:'manual'` keeps a 302->/login observable (D-14).
- Read `status`/`finalUrl` FIRST, then `response.text()` size-capped (CAP value = Claude's discretion), then `JSON.parse` inside try/catch. Return `{ ok, status, finalUrl, redirected, json, text }`. NEVER return auth material -- only response data.
**Differs from the seam:** the seam's func returns `{value}`/`{error}`; the fetch func returns the richer `{ ok, status, finalUrl, json, text }` shape, and runs NO jmespath (extract is SW-side, D-07 -- see CAVEAT-1's sibling Pitfall 1).

**SW-side `extract` (D-07)** -- run the read-only JMESPath AFTER the body crosses back, via the interpreter's accessor (the engine is NOT in page scope):
```javascript
// capability-interpreter.js:76-78 -- the accessor to reach from executeBoundSpec
function getFSBJmespath() {
  return (typeof jmespath !== 'undefined' && jmespath) ? jmespath : null;
}
```
Reach it as `FsbCapabilityInterpreter.getFSBJmespath()` then `jp.search(r.json, spec.extract)` inside a try/catch (leave data raw on throw). RESEARCH.md:460-468 shows the exact guard.

**Typed-error RETURN shape (origin-mismatch + ambiguous)** -- copy `createRecipeError`'s dual-field discipline from the interpreter:
```javascript
// capability-interpreter.js:85-93 -- BOTH code AND errorCode AND error set
function createRecipeError(code, extra) {
  var out = { success: false, code: code, errorCode: code, error: code };
  if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; } } }
  return out;
}
```
**Copy:** set BOTH `code` and `errorCode` (errors.ts `resolveErrorKey` reads either) on the wrapper's `RECIPE_ORIGIN_MISMATCH` (active-tab pin, D-08 part 2) and `RECOVERY_AMBIGUOUS` (D-12) returns.

---

### `extension/utils/capability-interpreter.js` (MODIFIED -- service, transform)

Two pre-flagged edits inside `interpretRecipe`: fold `spec.query` into the URL (D-09), then re-assert origin (D-08 part 1). NO network call may be added (26-D-11 -- the `executeScript`/`fetch` MUST NOT live here).

**Analog (self):** the spec-assembly block + the deferred-pin comment.

Deferred-pin comment the schema author pre-flagged (the slot to fill):
```javascript
// capability-interpreter.js:128-129
// public API never throws. Origin-pin (request origin == recipe.origin) is
// ENFORCED IN PHASE 27 (FETCH-03); here we only build the templated path.
```
Spec assembly -- `query` is built at `:311` (`built.query`) but NOT appended to `url` (`:307`); `bindAuthStrategy` is at `:318`. **The fold + pin insert goes BETWEEN line 315 (spec assembled) and line 318 (auth binding):**
```javascript
// capability-interpreter.js:305-318 -- the assembly slot
var spec = {
  url: templated.url,                                   // :307 -- replace with effectiveUrl after fold
  method: recipe.method,
  headers: built.headers,
  body: built.body,
  query: built.query,                                   // :311 -- already encodeURIComponent-escaped (buildRequest :206)
  authStrategy: recipe.authStrategy,
  origin: recipe.origin,
  extract: (typeof recipe.extract === 'string') ? recipe.extract : null
};
// <-- INSERT D-09 fold + D-08(1) pin HERE -->
var shaped = authMod.bindAuthStrategy(recipe.authStrategy, spec, recipe);  // :318
```
**Copy:** the existing `createRecipeError('RECIPE_...', {...})` RETURN idiom (`:85-93`, used throughout) for the new `RECIPE_ORIGIN_MISMATCH`. `built.query` values are ALREADY `encodeURIComponent`-escaped (`buildRequest` -> `fillPlacementMap(..., true)` at `:206`) -- do NOT double-encode when folding. RESEARCH.md:478-492 gives the exact fold+pin sketch (build `qs`, append with `?`/`&`, `new URL(effectiveUrl, recipe.origin)`, reject on `.origin !== recipe.origin`).
**Differs:** add a new RECIPE_* code (`RECIPE_ORIGIN_MISMATCH`); it surfaces verbatim via the EXISTING `errors.ts` `/RECIPE_.+/` regex -- NO errors.ts edit needed for it (only `RECOVERY_AMBIGUOUS` needs registering). The schema already rejects protocol-relative `//evil.com` and `..` (`:104-108`), but the interpreter MUST still re-resolve the EFFECTIVE (post-query-fold) URL.

---

### `extension/background.js` (MODIFIED -- config, importScripts wiring)

One additive `importScripts('utils/capability-fetch.js')` line, LAST of the capability family.

**Analog (self):** the Phase 26 capability/lib importScripts block.
```javascript
// background.js:119-133 -- the precedent block (each wrapped in try/catch)
try { importScripts('lib/jmespath.min.js'); } catch (e) { console.error('[FSB] Failed to load jmespath.min.js:', e.message); }
// ...
try { importScripts('utils/capability-recipe-schema.js'); } catch (e) { console.error('[FSB] Failed to load capability-recipe-schema.js:', e.message); }
// ...
try { importScripts('utils/capability-auth-strategies.js'); } catch (e) { console.error('[FSB] Failed to load capability-auth-strategies.js:', e.message); }
```
**Copy:** the exact `try { importScripts('utils/capability-fetch.js'); } catch (e) { console.error('[FSB] Failed to load capability-fetch.js:', e.message); }` one-liner shape (also the original `importScripts('lib/lz-string.min.js')` precedent the comment cites).
**Differs:** placement -- it loads LAST of the capability family, AFTER `capability-interpreter.js` (so `FsbCapabilityInterpreter.getFSBJmespath` exists for `executeBoundSpec`) and AFTER `jmespath.min.js` (`:119`). `mcp-task-store.js` loads far earlier (~`:34`), so `globalThis.FsbMcpTaskStore` is already present. Additive only (D-05; background.js is byte-frozen as an esbuild input -- comment at `:117-118`/`:131-132`).

---

### `mcp/src/errors.ts` (MODIFIED -- utility, transform)

Register `RECOVERY_AMBIGUOUS` so the host can distinguish "ambiguous -- ask the user" from a generic rejection (D-12). INV-01-safe (no tool schema touched).

**Analog (self):** the `CODE_ONLY_ERROR_KEYS` set + the `RECIPE_*`/`TRIGGER_*` verbatim-passthrough.
```typescript
// errors.ts:54-68 -- the set (RECOMMENDED single-token add; last member is TOOL_REMOVED at :67)
const CODE_ONLY_ERROR_KEYS = new Set([
  'NO_OWNED_TAB', 'AMBIGUOUS_TAB', /* ...existing... */
  'TOOL_REMOVED',
  // v0.9.99 Native Capability Catalog (Phase 27 FETCH-04): mid-mutation eviction ambiguity.
  'RECOVERY_AMBIGUOUS',                                  // <-- ADD THIS MEMBER
]);
```
The passthrough that already makes it surface (read by `resolveErrorKey`):
```typescript
// errors.ts:104-109 -- reads errorCode then code; set membership returns it verbatim
const explicitCode = typeof fsbResult?.errorCode === 'string'
  ? fsbResult.errorCode
  : (typeof fsbResult?.code === 'string' ? fsbResult.code : '');
if (FSB_ERROR_MESSAGES[explicitCode] || CODE_ONLY_ERROR_KEYS.has(explicitCode)) {
  return explicitCode;
}
```
**Copy:** add ONE member to the Set (cleaner than extending the `:133` regex `/^(TRIGGER_.+|RECIPE_.+|...)$/` -- both are INV-01-safe; the set is one explicit line). The `RECIPE_*` family (incl. the new `RECIPE_ORIGIN_MISMATCH`) ALREADY matches the `:133` regex -- no edit for it.
**Differs:** the built `mcp/build/errors.js` is what the test imports (the `scripts.test` chain runs `npm --prefix mcp run build` before the capability tests). The passthrough test mirrors `capability-interpreter.test.js:252-266` (dynamic-import the built module, assert the code surfaces and is NOT collapsed to `action_rejected`).

---

### `scripts/verify-recipe-path-guard.mjs` (MODIFIED -- config/test, allowlist)

Add `capability-fetch.js` to `RECIPE_PATH_ALLOWLIST` IN THE SAME task that creates the file -- or Check 4 (disk-glob drift) fails CI by omission (HARD, D-02).

**Analog (self):** the existing three capability entries.
```javascript
// verify-recipe-path-guard.mjs:84-91 -- add the new module (preserve ordering with the other capability-*.js)
const RECIPE_PATH_ALLOWLIST = [
  'extension/utils/capability-recipe-schema.js',
  'extension/utils/capability-interpreter.js',
  'extension/utils/capability-auth-strategies.js',
  'extension/utils/capability-fetch.js',                // <-- ADD (FETCH-01) or Check 4 fails closed
  'extension/lib/cfworker-json-schema.min.js',
  'extension/lib/jmespath.min.js',
  'extension/lib/minisearch.min.js',
];
```
Why it's mandatory (the fail-closed loop):
```javascript
// verify-recipe-path-guard.mjs:261-280 -- Check 4 enumerates capability-*.js FROM DISK
capabilityFiles = readdirSync(CAPABILITY_DIR_ABS)
  .filter((n) => /^capability-.*\.js$/.test(n))
  .map((n) => `${CAPABILITY_DIR_REL}/${n}`);
// ... for (const f of capabilityFiles) if (RECIPE_PATH_ALLOWLIST.indexOf(f) === -1) failures.push("exists on disk but is NOT on the recipe-path allowlist");
```
**Copy:** one string literal, repo-relative, in the capability cluster (before the `lib/` entries).
**Differs:** nothing else -- the file is hardcoded by design (NOT a glob). Do NOT touch `SANCTIONED_SITES` (`:96-100`) or the `FORBIDDEN` regexes (`:105-109`).

---

### `extension/utils/mcp-task-store.js` (REUSE -- store, event-driven)

Write a `BEFORE_API_REQUEST` snapshot BEFORE `executeScript`, terminal-then-delete on success (D-10). REUSE -- do NOT modify, do NOT reinvent (PITFALLS Pitfall 7).

**Public surface (read at anchor):** `mcp-task-store.js:128-167`
```javascript
// mcp-task-store.js:128-167 -- the surface to call
async function writeSnapshot(taskId, snapshot) { /* :128 -- no-ops on bad input */ }
async function readSnapshot(taskId) { /* :139 -- null when unknown */ }
async function deleteSnapshot(taskId) { /* :149 -- idempotent; empties key when last record gone */ }
async function listInFlightSnapshots() { /* :162 -- filters status === 'in_progress' */ }
```
**Call-site analog (the write cadence to mirror):** `mcp-bridge-client.js:1320-1331` (in_progress) + `:1358-1369` (terminal). The snake_case envelope:
```javascript
// mcp-bridge-client.js:1321-1331 -- in_progress snapshot shape (mirror, adapt fields)
await store.writeSnapshot(sessionId, {
  task_id: sessionId,
  status: 'in_progress',
  started_at: heartbeatStartedAt,
  last_heartbeat_at: lastHeartbeatAt,
  originating_mcp_call_id: mcpMsgId,
  target_tab_id: (session && session.tabId) || null,
  current_step: (session && session.iterationCount) || 0,   // <-- existing writers put a NUMBER here
  ai_cycle_count: (session && session.iterationCount) || 0,
  last_dom_hash: (session && session.lastDOMHash) || null,
});
```
**Copy:** the snake_case envelope keys (`task_id`, `status:'in_progress'`, `started_at`, `last_heartbeat_at`, `target_tab_id`); the `if (store && typeof store.writeSnapshot === 'function')` guard; the `.catch(() => {})` best-effort posture (never block the fetch on persistence); the terminal-write-then-delete sequence.
**Differs (Phase 27 additions):** `current_step:'BEFORE_API_REQUEST'` is a STRING (existing writers use a number -- this is SAFE: reconciliation filters only on `status==='in_progress'` at `mcp-task-store.js:166`, never on `current_step` type, per RESEARCH A5). Add `method: spec.method` and `origin: spec.origin` for the D-11 classifier. The cadence COLLAPSES (single bounded fetch, no 30s heartbeat): write `BEFORE_API_REQUEST` -> `executeScript` -> terminal -> `deleteSnapshot`. Task-id scheme is Claude's discretion (e.g. `'cap_fetch_' + spec.origin + '_' + Date.now()`; must be unique in the in-flight window + discoverable by `listInFlightSnapshots()`).

---

### `extension/ai/lattice-runtime-adapter.js` (REUSE -- classifier taxonomy, event-driven)

Reuse the ResumePolicy marker STRINGS for the mid-mutation classifier (D-11). **CAVEAT-1 below: reuse the STRINGS, NOT the function.**

**Analog (the taxonomy):** `lattice-runtime-adapter.js:281-307`
```javascript
// lattice-runtime-adapter.js:281-306 -- DO NOT FEED A TASK-STORE SNAPSHOT INTO THIS
resume: async function resume(snapshot) {
  if (!snapshot || typeof snapshot.payload !== 'string') { return 'RECOVERY_AMBIGUOUS'; }
  let state;
  try { state = JSON.parse(snapshot.payload); } catch (err) { return 'RECOVERY_AMBIGUOUS'; }
  // ...
  const marker = state._currentStepName;                 // <-- camelCase, from a payload JSON STRING
  if (marker === 'BEFORE_API_REQUEST') { return 'ON_ERROR_SW_EVICTION_MID_REQUEST'; }
  // ...
  return 'RECOVERY_AMBIGUOUS';
}
```
**Copy:** the marker string vocabulary -- `'BEFORE_API_REQUEST'`, `'ON_ERROR_SW_EVICTION_MID_REQUEST'`, `'RECOVERY_AMBIGUOUS'` -- and the classification intent (non-safe boundary -> `RECOVERY_AMBIGUOUS`).

> **CAVEAT-1 (field-name mismatch -- naive cloning breaks here):** Lattice's `resume()` reads `snapshot.payload` (a JSON STRING) and classifies on `state._currentStepName` (camelCase). The mcp-task-store envelope is a FLAT object with `current_step` (snake_case) and is NOT a `{payload:"<json>"}` shape. **Define a THIN LOCAL classifier at the fetch layer** that REUSES the marker strings but reads the task-store's flat `current_step` + `method`. Do NOT pass a task-store snapshot to Lattice's `resume()`. Classifier logic (D-11): mutating method (POST/PUT/PATCH/DELETE) + in-flight snapshot -> `RECOVERY_AMBIGUOUS` (surface, NEVER blind-retry); GET -> re-issuable. CI asserts the classifier directly with a synthetic POST snapshot (no live eviction).

---

### `catalog/recipes/*.json` (NEW -- model, declarative config)

The hardcoded `github.com -> GET /notifications` proof recipe (+ reserved `/_graphql` CSRF exemplar). Lands under `catalog/recipes/` (NOT `_fixtures/` -- that dir is the Phase-26 accept/reject test set).

**Analog (field-set template):** `catalog/recipes/_fixtures/valid-recipe.json`
```json
{
  "schemaVersion": 1,
  "id": "example.get-thing",
  "origin": "https://example.com",
  "endpoint": "/api/{id}",
  "method": "GET",
  "authStrategy": "same-origin-cookie",
  "params": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] },
  "request": { "query": { "id": "{id}" } },
  "extract": "data.items[*].name"
}
```
**Closed-vocabulary gate it MUST pass:** `capability-recipe-schema.js:79-148` (read at anchor):
- `origin` pattern `^https?://[^/?#\s]+$` -- bare origin, no path (`:95`).
- `endpoint` pattern `^/(?!/)(?:[^\s]*)$` + `not` `(^|/)\.\.(/|$)` -- single leading slash, no protocol-relative, no `..` (`:104-108`).
- `method` enum `['GET','POST','PUT','PATCH','DELETE']` (`:110`); `authStrategy` enum 4 members (`:112`).
- `csrf` object `required:['from','header']`, `from` enum `['meta','cookie','response']` (`:131-140`); MANDATORY only when `authStrategy==='csrf-header-scrape'` (if/then `:143-147`).
**Copy (FETCH-01 GET, D-13):** drop `params`/`request` (no `{var}`), keep `same-origin-cookie`, `extract:"@"` (or omit -- optional). RESEARCH.md:535-556 gives the validated recipe + the field-by-field schema check.
**Differs / reserved (FETCH-02, D-16):** the `/_graphql` POST recipe adds `"csrf": { "from":"meta", "selector":"input[name=authenticity_token]", "header":"X-CSRF-Token" }` -- held in reserve, exercised only AFTER the GET is green. See CAVEAT-2 (`.value` vs `.content`). **Optional:** also drop a `valid-github-notifications.json` copy into `_fixtures/` so the CI guard's Check 2 (`verify-recipe-path-guard.mjs:140`, scans only `_fixtures/`) validates the shape at build time too (free closed-vocab proof).

---

### `tests/capability-fetch.test.js` (NEW -- test) + `package.json` (MODIFIED)

Zero-framework CI suite for FETCH-01..05 (CI side; live shape is human-gated UAT, D-15).

**Analog A (loader + stubbed executeScript recorder + no-network proof):** `tests/capability-interpreter.test.js`
```javascript
// capability-interpreter.test.js:74-97 -- the executeScript recorder + fetch recorder to clone
const executeScriptCalls = [];
const chromeHandle = harness.installChromeMock({});
chromeHandle.chrome.scripting = {
  executeScript: function () { executeScriptCalls.push(Array.prototype.slice.call(arguments)); return Promise.resolve([]); }
};
// ... vm.runInThisContext(cfworker) -> require(SCHEMA) -> require(AUTH) -> require(INTERP)
```
errors.ts passthrough check (built module, dynamic import):
```javascript
// capability-interpreter.test.js:252-266 -- clone for RECOVERY_AMBIGUOUS + RECIPE_ORIGIN_MISMATCH
const { mapFSBError } = await import(pathToFileURL(path.join(REPO_ROOT, 'mcp', 'build', 'errors.js')).href);
const out = mapFSBError({ success: false, code: 'RECOVERY_AMBIGUOUS' });
// assert text includes 'RECOVERY_AMBIGUOUS' and NOT 'action_rejected'
```
**Analog B (storage round-trip for the snapshot assertion):** `tests/mcp-task-store.test.js:35-53` -- `freshRequireStore()` (drops require cache so the lazy chrome ref binds the new mock), `makeSnapshot(overrides)`, `installChromeMock()` backing real in-memory `chrome.storage.session`. Use it to assert the `BEFORE_API_REQUEST` record exists DURING the call (via `readSnapshot`) and is gone AFTER.
**Analog C (counters + run convention):** `tests/recipe-path-guard.test.js:37-42` -- `passed`/`failed` + `check(label,cond,detail)` + `process.exit(failed>0?1:0)`. (The capability family uses the `check(cond,msg)` form from `capability-interpreter.test.js:56-64`; either is acceptable.)
**Copy:** the `installChromeMock` + stubbed `executeScript` recorder substrate; assert `func.toString()` contains `credentials`/`'include'` and NO `jmespath`/`getFSB`/`require`/`importScripts` substring (cheap static guard for Pitfall 1); drive the GitHub recipe through `interpretRecipe -> executeBoundSpec` with `executeScript` stubbed to return a fixture `{status:200, json:{...}, finalUrl:'https://github.com/notifications'}`.
**Differs:** the recorder must also let the test INSPECT the captured `{world:'MAIN', func, args:[spec]}` call (FETCH-01/02/03 assert on it) and short-circuit (origin mismatch -> recorder stays EMPTY = no side effect). Add the in-page-func unit run (stub `document.querySelector` + `fetch` recorder, assert CSRF header threaded). RESEARCH.md:641-664 maps each FETCH-0x requirement to its exact mock assertion.

**`package.json` chain:** append `&& node tests/capability-fetch.test.js` to `scripts.test` (`package.json:17`) AFTER the current tail `... && node tests/recipe-path-guard.test.js`.

---

## Shared Patterns

### Typed-error dual-field RETURN (never throw)
**Source:** `extension/utils/capability-interpreter.js:85-93` (`createRecipeError`); identical copy in `capability-auth-strategies.js:91-99`.
**Apply to:** every failure exit of `executeBoundSpec` and the interpreter edit.
```javascript
var out = { success: false, code: code, errorCode: code, error: code };  // BOTH code AND errorCode AND error
```
Set BOTH `code` and `errorCode` so `errors.ts resolveErrorKey` (`:104-109`) surfaces the code from either field. Used for `RECIPE_ORIGIN_MISMATCH` (interpreter + wrapper) and `RECOVERY_AMBIGUOUS` (wrapper).

### Dual-export IIFE + lazy globalThis.chrome
**Source:** `extension/utils/mcp-task-store.js:1-2, 59-61, 189-194` (mirrored by interpreter + auth-strategies).
**Apply to:** the new `capability-fetch.js`. Lazy `_getChrome()` so the module loads under the Node harness where chrome is mocked after load; `global.Fsb*` for SW `importScripts` + `module.exports` for Node `require`.

### Best-effort persistence (never block on storage)
**Source:** `extension/ws/mcp-bridge-client.js:1318-1333` (`try { ... writeSnapshot ... } catch (_e) {}` + `.catch(() => {})`).
**Apply to:** every `writeSnapshot`/`deleteSnapshot` call in `executeBoundSpec`. Persistence failure must NEVER crash the SW or block the fetch.

### typeof-guarded sibling-global access (NO closure/import)
**Source:** `capability-interpreter.js:55-78` (`getFSBRecipeSchema`/`getFSBAuthStrategies`/`getFSBJmespath`) -- each returns null when its global is absent.
**Apply to:** reaching `FsbMcpTaskStore` and `FsbCapabilityInterpreter.getFSBJmespath` from `executeBoundSpec` (SW side). The IN-PAGE func reaches NOTHING this way -- it is serialization-isolated (D-03).

### NO EMOJIS / ASCII-only source header
**Source:** every capability module ends its doc block with `* NO EMOJIS, ASCII-only source.` (`capability-interpreter.js:47`, `capability-auth-strategies.js:39`).
**Apply to:** `capability-fetch.js`, the recipe JSON, the test. Hard project constraint (global CLAUDE.md) AND the in-repo recipe-path convention: keep dynamic-code substrings (`eval`, `new Function`, `import(`) out of the source ENTIRELY, even comments.

---

## No Analog Found

None. Every Phase 27 file maps to a concrete in-repo analog read at its line anchor. The ONE genuinely new algorithm is the in-page `func` BODY (CSRF scrape + `credentials:'include'` fetch + size-capped defensive parse) -- a ~30-line self-contained function modeled on the OpenTabs `fetchFromPage` archetype, with the implementation-ready sketch already in RESEARCH.md:356-405. It has no direct in-repo analog because no prior FSB code issues a recipe-derived authenticated page fetch (the two `executeScript` seams run user/model code, a different trust class).

---

## Two Cross-Seam Caveats (where naive cloning breaks)

1. **ResumePolicy field name:** Lattice `resume()` (`lattice-runtime-adapter.js:281-307`) reads `state._currentStepName` (camelCase) from a `snapshot.payload` JSON STRING; the mcp-task-store envelope is a FLAT object with `current_step` (snake_case). Reuse the marker STRINGS in a THIN LOCAL classifier; do NOT feed a task-store snapshot into Lattice's `resume()`.
2. **CSRF DOM read:** `from:'meta'` reads `.content` (correct for `<meta>` tags). The RESERVED FETCH-02 recipe's selector `input[name=authenticity_token]` holds its token in `.value`, not `.content`. Only matters if `from:'cookie'`/`input` ships in v1; the FETCH-01 GET needs no CSRF. [A3 -- verify live in the FETCH-02 sub-task.]

---

## Metadata

**Analog search scope:** `extension/utils/` (capability-* modules + mcp-task-store), `extension/ws/mcp-bridge-client.js`, `extension/ai/` (tool-executor, lattice-runtime-adapter), `mcp/src/errors.ts`, `scripts/verify-recipe-path-guard.mjs`, `catalog/recipes/`, `tests/`, `extension/background.js`, `package.json`.
**Files scanned (read at anchor):** 14 source/test/config files + 1 fixture recipe.
**Pattern extraction date:** 2026-06-20
