# Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 9 (2 NEW SW modules, 1 NEW handler dir, 4 MODIFIED source/build, 2 NEW tests)
**Analogs found:** 9 / 9 (every file has an exact or strong in-repo analog — this phase is wiring of shipped primitives)

> All anchors below were re-read on `automation-worktree` 2026-06-21. Line numbers are live. The planner should copy these excerpts directly into PLAN action sections — they are not paraphrases.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `extension/utils/capability-router.js` (NEW) | service / dispatcher (pure SW module) | request-response (tier switch + typed fall-through) | `extension/utils/capability-interpreter.js` (shell+tail+typed-error) + `mcp-tool-dispatcher.js:2202-2220` (the body it absorbs) | exact (shell) + lifted-body |
| `extension/utils/capability-catalog.js` (NEW) | model / registry (pure SW module) | transform / lookup (slug -> `{tier, handler\|recipe, descriptor}`) | `extension/utils/capability-search.js` (dual-export shell + `getRecipeBySlug` slug map + `_stableSortByOwnedService` origin bias) | role-match (shell + map shape) |
| `catalog/handlers/*.js` (NEW, 5-10) | service / handler (imperative, bundled CODE) | request-response (builds bound spec -> `executeBoundSpec`) | `catalog/recipes/github-notifications.json` (data shape the handler reproduces in code) + `capability-fetch.js:272-298` (the `executeBoundSpec` contract it calls) | role-match (no imperative-handler precedent exists yet) |
| `extension/ws/mcp-tool-dispatcher.js` (MODIFIED) | controller / route handler | request-response | self — `handleCapabilitiesInvokeMessageRoute:2198-2221` (body becomes T1b) + `handleCapabilitiesSearchMessageRoute:2172-2190` (the SW-side origin/tabId resolve) | exact (self-rewire) |
| `extension/ai/tool-executor.js` (MODIFIED) | controller / autopilot dispatch | request-response (event-driven from agent loop) | self — `trigger` branch `:402-423` (SHAPE) + `buildAutopilotTriggerParams:55-74` + `executeTool:665-673` (the pre-switch dispatch point) | exact (self, but DIFFERENT hook point — see Pitfall in §Shared Patterns) |
| `extension/background.js` (MODIFIED) | config / SW bootstrap | batch (importScripts load order) | self — `:119-163` capability-family `importScripts` block | exact (self, additive) |
| `scripts/verify-recipe-path-guard.mjs` (MODIFIED) | config / CI guard | batch (allowlist array) | self — `RECIPE_PATH_ALLOWLIST:85-103` | exact (self, append 2 entries) |
| `scripts/package-extension.mjs` (MODIFIED) | config / build step | file-I/O (read dir -> generate dual-export IIFE under `extension/`) | self — recipe-index build step `:41-89` (`FsbRecipeIndex`) | exact (self, clone the step) |
| `tests/capability-router.test.js` + `tests/capability-autopilot-parity.test.js` (NEW) | test | request-response (unit, mocked) | `tests/capability-fetch.test.js` (chrome-stub + executeScript recorder) + `tests/capability-mcp-surface.test.js` (registry-hash + out-of-registry + mapFSBError passthrough) | exact (both patterns exist) |

---

## Pattern Assignments

### `extension/utils/capability-router.js` (NEW — service/dispatcher, request-response)

**Analogs:** `capability-interpreter.js` (module shell + dual-export tail + typed-error helper) ; `mcp-tool-dispatcher.js:2202-2220` (the routerless body that becomes the T1b tier).

**Dual-export IIFE tail — copy verbatim** (`capability-interpreter.js:372-385`; identical shape in `capability-search.js:226-241` and `capability-fetch.js:430-441`):
```javascript
  // ---- Export shape (mirror value-extractor.js:218-229) -------------------

  var exportsObj = {
    interpretRecipe: interpretRecipe,
    templateEndpoint: templateEndpoint,
    getFSBJmespath: getFSBJmespath
  };

  global.FsbCapabilityInterpreter = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;                    // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
For the router this becomes `global.FsbCapabilityRouter = { invoke: invoke }` with the same `(function (global) { 'use strict'; ... })(typeof globalThis !== 'undefined' ? globalThis : this)` wrapper.

**Typed fall-through error helper — clone `createRecipeError`** (`capability-interpreter.js:85-93`). This dual-field shape is load-bearing: it is what survives the `/^RECIPE_.+$/` MCP passthrough verbatim (no `errors.ts` edit):
```javascript
  function createRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }
```
Router emits this for: `RECIPE_NOT_FOUND` (no catalog entry / no recipe), `RECIPE_LEARN_PENDING` (T2 stub), `RECIPE_DOM_FALLBACK_PENDING` (T3 seam, NO `executeTool`). All three match `/^RECIPE_.+$/` (D-07, CAT-05). Reason-code NAMES are planner discretion; only the regex match is mandatory.

**Core pattern — the T1b tier IS this lifted body** (`mcp-tool-dispatcher.js:2202-2220`). Lift `getRecipeBySlug -> interpretRecipe -> executeBoundSpec` into the router's `case 'T1b'`; the router uses `typeof`-guarded globals (NOT direct refs) so it stays Node-unit-testable:
```javascript
  const recipe = FsbCapabilitySearch.getRecipeBySlug(payload.slug);
  if (!recipe) {
    return { success: false, code: 'RECIPE_NOT_FOUND', errorCode: 'RECIPE_NOT_FOUND', error: 'RECIPE_NOT_FOUND', slug: payload.slug };
  }
  const interpreted = FsbCapabilityInterpreter.interpretRecipe(recipe, payload.params || {});
  if (!interpreted || interpreted.success !== true) {
    return interpreted;                                  // typed RECIPE_* returned verbatim
  }
  // Resolve tabId: explicit payload.tab_id, else the active/owned tab.
  let tabId = Number.isFinite(payload.tab_id) ? payload.tab_id : null;
  if (tabId === null) {
    try {
      const t = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = t[0] ? t[0].id : null;
    } catch (e) {
      tabId = null;
    }
  }
  return await FsbCapabilityFetch.executeBoundSpec(interpreted.spec, tabId);
```
The router must NOT call `chrome.*` or `fetch` itself (keeps it eval-free + allowlist-clean — Anti-Pattern: do NOT fold into `capability-interpreter.js`). The proposed full shape is in RESEARCH.md §Pattern 1 (lines 224-287) and is consistent with these anchors.

**typeof-guarded global accessor convention** (`capability-search.js:57-69`) — the router reads its collaborators this way so Node tests inject stubs:
```javascript
  function _getMiniSearch() {
    return (typeof MiniSearch !== 'undefined' && MiniSearch) ? MiniSearch : null; // UMD global (background.js:120)
  }
```
Mirror as `_catalog()` / `_search()` / `_interp()` / `_fetch()` returning `typeof Fsb* !== 'undefined' ? Fsb* : null`.

---

### `extension/utils/capability-catalog.js` (NEW — model/registry, transform/lookup)

**Analog:** `capability-search.js` — same dual-export shell (above), the slug->recipe map accessor, and the owned-service (origin-bias) re-rank.

**Registry accessor shape — mirror `getRecipeBySlug`** (`capability-search.js:222-224`). The catalog's `resolve(slug, origin)` is the authoritative tier keying; this is the minimal map-lookup precedent:
```javascript
  // ---- invoke lookup (used by Plan 03) ---------------------------------------
  function getRecipeBySlug(slug) {
    return _slugToRecipe[slug] || null;
  }
```
Catalog returns `{ tier, handler|recipe, descriptor }` per slug (D-01). Per RESEARCH Open Q3: a slug is EITHER T1a OR T1b, declared explicitly — no runtime tie-break; origin bias affects search ranking only, never tier choice.

**Origin-bias lever — reuse the owned-service partition** (`capability-search.js:209-219`). This is the existing "origin first" re-rank the catalog/router can reuse for tier biasing (CAT-01 "biased by tab origin"); `ORIGIN_BOOST = 4` at `:55` is the tunable lever:
```javascript
  // Stable re-rank: owned-service hits first, original relative order preserved.
  function _stableSortByOwnedService(hits, ownedService) {
    var owned = [];
    var rest = [];
    for (var i = 0; i < hits.length; i++) {
      var svc = hits[i] && hits[i].service;
      if (svc && svc.indexOf(ownedService) !== -1) { owned.push(hits[i]); }
      else { rest.push(hits[i]); }
    }
    return owned.concat(rest);
  }
```

**D-04 relationship:** the Phase-28 `_slugToRecipe` map (`getRecipeBySlug`) remains the T1b recipe source; the catalog references it OR the planner extends it. Either combined-module or two-module is acceptable (Claude's Discretion) provided interpreter purity is preserved. Recommend two modules to keep registry-data and routing-logic separately testable.

---

### `catalog/handlers/*.js` (NEW — service/handler, request-response; the T1a zero-install head)

**Analogs:** `catalog/recipes/github-notifications.json` (the data shape a handler reproduces imperatively) ; `capability-fetch.js:272-298` (the `executeBoundSpec` contract + origin-pin every handler call inherits). NB: **no imperative-handler precedent exists in the repo today** — `catalog/handlers/` is absent (verified). This is the one genuinely new code shape; RESEARCH §Code Examples (lines 434-465) gives the proposed interface.

**The recipe data shape the handler builds in code** (`catalog/recipes/github-notifications.json`, full file):
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

**The execution contract a handler MUST call (never re-implement)** — `executeBoundSpec` does the SECOND active-tab origin-pin BEFORE any side effect (`capability-fetch.js:272-298`). A T1a handler builds spec(s) and calls `ctx.executeBoundSpec(spec, ctx.tabId)`; it NEVER calls `chrome.scripting.executeScript` itself, so the pin stays on the head path (D-12, Pitfall 3 credential-replay):
```javascript
  async function executeBoundSpec(spec, tabId) {
    var c = _getChrome();
    var store = _getTaskStore();

    // ---- 1. Active-tab origin pin (FETCH-03 part 2, D-08 part 2). -----------
    var tab = null;
    if (c && c.tabs && typeof c.tabs.get === 'function') {
      try {
        tab = await c.tabs.get(tabId);
      } catch (tabErr) {
        tab = null;
      }
    }
    var tabOrigin = null;
    try {
      tabOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
    } catch (originErr) {
      tabOrigin = null;
    }
    if (!tabOrigin || tabOrigin !== (spec && spec.origin)) {
      // Dual-field typed error BEFORE any executeScript side effect.
      return _typedError('RECIPE_ORIGIN_MISMATCH', {
        url: spec && spec.url,
        origin: spec && spec.origin,
        tabOrigin: tabOrigin
      });
    }
```

**Handler interface (proposed, planner finalizes — Claude's Discretion + RESEARCH Open Q2):** one module per service exporting a slug-keyed object via the dual-export tail; each entry `{ tier:'T1a', origin, sideEffectClass, async handle(args, ctx) }` where `ctx = { origin, tabId, executeBoundSpec, interpretRecipe }`. RESEARCH §Code Examples lines 436-463 has the GitHub-seed example.

**Head-service selection (CAT-02, D-09):** RESEARCH §Head-Service Selection (lines 467-491) proposes 7 services with a 5-service MVP (GitHub-notifications T1b seed, GitHub-issues T1a persisted-query, Slack T1a split-token, Notion T1a `/api/v3` multi-call, Reddit-inbox T1b). **Decisive constraint:** the handler MUST target the web app's own first-party origin (e.g. `github.com/notifications`, NOT `api.github.com`) — the session cookie does not cross to the API subdomain. **All internal endpoint paths are `[ASSUMED]` and MUST be captured against a live authenticated tab before authoring** (RESEARCH Assumptions A2/A3/A4).

---

### `extension/ws/mcp-tool-dispatcher.js` (MODIFIED — controller/route handler, request-response)

**Analog:** self. Rewire `handleCapabilitiesInvokeMessageRoute` so its body becomes ONE call to the router; keep the route table and wire names byte-identical (INV-01).

**Current handler to rewire** (`mcp-tool-dispatcher.js:2198-2221`, the full body shown in the router section above). After D-03 the inline `getRecipeBySlug->interpretRecipe->executeBoundSpec` moves INTO the router's T1b tier and this handler becomes (RESEARCH §Code Examples lines 377-394):
```javascript
async function handleCapabilitiesInvokeMessageRoute({ payload }) {
  if (typeof FsbCapabilityRouter === 'undefined' || typeof FsbCapabilityRouter.invoke !== 'function') {
    return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT,
      { error: 'Capability router unavailable' });
  }
  // ... resolve tabId + origin SW-side (the search-handler pattern below) ...
  return await FsbCapabilityRouter.invoke(payload.slug, payload.params || {}, { origin, tabId });
}
```

**SW-side origin/tabId resolution — copy from the search handler** (`mcp-tool-dispatcher.js:2178-2186`). The model NEVER supplies the authoritative origin (D-11); `payload.origin` is an override only:
```javascript
  let ownedOrigin = payload.origin || null;
  if (!ownedOrigin) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      ownedOrigin = (tabs[0] && tabs[0].url) ? new URL(tabs[0].url).origin : null;
    } catch (e) {
      ownedOrigin = null;
    }
  }
```

**Route table — DO NOT TOUCH** (`mcp-tool-dispatcher.js:111-112`). The two wire names and the handler bindings stay byte-identical so the frozen registry hash never moves:
```javascript
  'mcp:capabilities-search': { routeFamily: 'capabilities', handler: handleCapabilitiesSearchMessageRoute },
  'mcp:capabilities-invoke': { routeFamily: 'capabilities', handler: handleCapabilitiesInvokeMessageRoute },
```

---

### `extension/ai/tool-executor.js` (MODIFIED — controller/autopilot dispatch, request-response)

**Analog:** self — the `trigger` branch SHAPE (`:402-423`) + `buildAutopilotTriggerParams` (`:55-74`). **CRITICAL: the hook point is DIFFERENT from `trigger`** — see §Shared Patterns › Autopilot Pitfall.

**The `trigger` branch — the SHAPE to mirror** (`tool-executor.js:402-423`): strip ownership, call the SW-global, wrap in `makeResult`. The capability branch reproduces this exactly but targets `globalThis.FsbCapabilityRouter.invoke(...)` instead of `globalThis.fsbTriggerDispatchToolRequest(...)`:
```javascript
      case 'trigger':
      case 'stop_trigger':
      case 'get_trigger_status':
      case 'list_triggers': {
        const dispatch = (typeof globalThis !== 'undefined') ? globalThis.fsbTriggerDispatchToolRequest : null;
        if (typeof dispatch !== 'function') {
          return makeResult({
            success: false,
            error: 'fsbTriggerDispatchToolRequest unavailable'
          });
        }

        const finalParams = buildAutopilotTriggerParams(params, tabId);
        const response = await dispatch(tool.name, finalParams, { tabId, source: 'autopilot' });
        const success = response && response.success !== false;
        return makeResult({
          success,
          hadEffect: autopilotTriggerHadEffect(tool.name, response),
          error: success ? null : (response?.error || response?.errorCode || null),
          result: response
        });
      }
```

**Ownership-strip helper — reuse verbatim** (`tool-executor.js:55-74`). Removes `agent_id`/`ownership_token`, normalizes the tab alias, injects `tab_id`:
```javascript
function buildAutopilotTriggerParams(params, tabId) {
  const cleaned = Object.assign({}, params || {});
  const ownershipFields = ['agent_id', 'agentId', 'ownership_token', 'ownershipToken'];
  const tabAliasFields = ['tab_id', 'tabId', 'target_tab_id', 'targetTabId'];
  for (const field of ownershipFields) {
    delete cleaned[field];
  }
  if (Object.prototype.hasOwnProperty.call(cleaned, 'targetTabId')
      && !Object.prototype.hasOwnProperty.call(cleaned, 'target_tab_id')) {
    cleaned.target_tab_id = cleaned.targetTabId;
    delete cleaned.targetTabId;
  }
  const hasTabAlias = tabAliasFields.some((field) => (
    Object.prototype.hasOwnProperty.call(cleaned, field)
  ));
  if (!hasTabAlias && Number.isFinite(Number(tabId))) {
    cleaned.tab_id = Number(tabId);
  }
  return cleaned;
}
```

**`makeResult` result shape — wrap the router response** (`tool-executor.js:45-52`):
```javascript
function makeResult({ success, hadEffect = false, error = null, navigationTriggered = false, result = null }) {
  return {
    success: Boolean(success),
    hadEffect: Boolean(hadEffect),
    error: error || null,
    navigationTriggered: Boolean(navigationTriggered),
    result: result || null
  };
```

---

### `extension/background.js` (MODIFIED — config/SW bootstrap, batch)

**Analog:** self — the capability-family `importScripts` block (`:122-155`). Add the router + catalog AFTER `capability-search.js` (they read `FsbCapabilitySearch.getRecipeBySlug`), each in its own tolerant `try/catch`. The proven additive pattern (every line is `try { importScripts(...) } catch (e) { console.error(...) }`):
```javascript
try { importScripts('utils/capability-auth-strategies.js'); } catch (e) { console.error('[FSB] Failed to load capability-auth-strategies.js:', e.message); }
try { importScripts('utils/capability-interpreter.js'); } catch (e) { console.error('[FSB] Failed to load capability-interpreter.js:', e.message); }
...
try { importScripts('catalog/recipe-index.generated.js'); } catch (e) { console.error('[FSB] Failed to load recipe-index.generated.js:', e.message); }
try { importScripts('utils/capability-search.js'); } catch (e) { console.error('[FSB] Failed to load capability-search.js:', e.message); }
```
Slot order: `... capability-search.js` -> `capability-catalog.js` -> `capability-router.js` (router reads the catalog) -> (if a generated handler index) `catalog/handler-index.generated.js` or the per-handler `importScripts`. `background.js` is a byte-frozen esbuild input — additive lines only (D-05).

---

### `scripts/verify-recipe-path-guard.mjs` (MODIFIED — config/CI guard, batch)

**Analog:** self — `RECIPE_PATH_ALLOWLIST` (`:85-103`). Append `'extension/utils/capability-router.js'` and `'extension/utils/capability-catalog.js'` IN THE SAME PLAN that creates them (Check 4 enumerates `extension/utils/capability-*.js` from disk and FAILS CLOSED on any absent entry — Pitfall 4). Both modules must be free of `eval`/`new Function`/`import(` even in comments. The array (note the Phase-27/28 precedent comments showing how prior modules were appended):
```javascript
const RECIPE_PATH_ALLOWLIST = [
  'extension/utils/capability-recipe-schema.js',
  'extension/utils/capability-interpreter.js',
  'extension/utils/capability-auth-strategies.js',
  // Phase 27 (FETCH-01, D-02): registered AHEAD of the file's creation ...
  'extension/utils/capability-fetch.js',
  // Phase 28 (SURF-04, D-04): the MiniSearch index + slug->recipe map module.
  // Added IN THE SAME PLAN that creates the file (Pitfall 5) ...
  'extension/utils/capability-search.js',
  'extension/lib/cfworker-json-schema.min.js',
  'extension/lib/jmespath.min.js',
  'extension/lib/minisearch.min.js',
];
```
NB: `catalog/handlers/*.js` are NOT under `extension/utils/` and are reviewed bundled CODE, so they are NOT subject to this `extension/utils/capability-*.js` allowlist — but they ARE the "imperative code lives only in bundled handlers" Wall-1 surface (verify the planner does not accidentally place handler logic under `extension/utils/`).

---

### `scripts/package-extension.mjs` (MODIFIED — config/build step, file-I/O)

**Analog:** self — the D-16 recipe-index build step (`:41-89`). Clone it to ship `catalog/handlers/` under `extension/` (handlers are CODE, so unlike recipes they cannot be JSON-inlined — copy the files OR generate a `handler-index.generated.js` manifest; D-10, Pitfall 5). The existing step (the exact pattern to clone — read dir, build a dual-export IIFE string, `writeFileSync` UNDER `extension/`):
```javascript
const CATALOG_ROOT = join(ROOT, 'catalog');
const recipes = readJsonDir(join(CATALOG_ROOT, 'recipes'));
const descriptors = readJsonDir(join(CATALOG_ROOT, 'descriptors'));

const generatedDir = join(EXT_ROOT, 'catalog');
mkdirSync(generatedDir, { recursive: true });
const generatedPath = join(generatedDir, 'recipe-index.generated.js');
const catalogData = JSON.stringify({ recipes, descriptors }, null, 2);
const generatedSource =
  '// GENERATED by scripts/package-extension.mjs -- DO NOT EDIT BY HAND.\n' +
  ...
  '(function(global) {\n' +
  "  'use strict';\n" +
  '  var DATA = ' + catalogData + ';\n' +
  '  global.FsbRecipeIndex = DATA;\n' +
  "  if (typeof module !== 'undefined' && module.exports) { module.exports = DATA; }\n" +
  '})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
writeFileSync(generatedPath, generatedSource, 'utf8');
```
For handlers: copy each `catalog/handlers/*.js` to `extension/catalog/handlers/` (they are already valid dual-export IIFEs) and/or emit a `handler-index.generated.js` listing them, so the existing zip-of-`EXT_ROOT` picks them up. Without this, T1a slugs route to `RECIPE_NOT_FOUND` in a packaged build only (the 28-D-16 trap).

---

### `tests/capability-router.test.js` + `tests/capability-autopilot-parity.test.js` (NEW — test)

**Analogs:** `tests/capability-fetch.test.js` (zero-framework + chrome-stub + executeScript recorder + origin-pin assertion) ; `tests/capability-mcp-surface.test.js` (registry-hash unmoved + out-of-registry + `mapFSBError` passthrough).

**Zero-framework harness — copy verbatim** (`capability-fetch.test.js:72-83`; identical in `capability-mcp-surface.test.js:65-75`):
```javascript
let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}
```
End with `process.exit(failed > 0 ? 1 : 0)`.

**Chrome-stub + executeScript recorder — the pattern for the origin-pin / T1a tests** (`capability-fetch.test.js:132-160`). `installChromeMock` from `tests/fixtures/run-task-harness`; the recorder captures the `{world:'MAIN', target, func, args:[spec]}` call:
```javascript
(async function driveHappyPath() {
  const recorder = [];
  let snapshotDuring = null;
  const handle = harness.installChromeMock({ tabs: [{ id: 11, url: 'https://github.com/notifications' }] });
  const store = freshRequireStore(); // binds the lazy chrome ref to THIS mock's storage.session
  handle.chrome.scripting = {
    async executeScript(opts) {
      recorder.push(opts);
      ...
      return [{ result: {
        ok: true, status: 200, finalUrl: 'https://github.com/notifications',
        redirected: false, json: { items: [{ id: 1 }, { id: 2 }] }, text: null
      } }];
    }
  };
  ...
  check(recorder.length === 1, 'FETCH-01: executeBoundSpec fired exactly one executeScript ...');
```

**Origin-mismatch / no-side-effect assertion — the T3-no-exec and origin-pin pattern** (`capability-fetch.test.js:210-221`). A wrong-origin tab yields the dual-field `RECIPE_ORIGIN_MISMATCH` and the recorder stays EMPTY (no side effect). The router's T3-seam test mirrors this: assert a `RECIPE_DOM_FALLBACK_PENDING` reason AND that `executeTool`/`chrome.scripting` was never called:
```javascript
  const recorderMM = [];
  const handleMM = harness.installChromeMock({ tabs: [{ id: 22, url: 'https://evil.example/x' }] });
  ...
  const mm = await Fmm.executeBoundSpec({ url: '/notifications', method: 'GET', origin: 'https://github.com' }, 22);
  check(mm && mm.success === false && mm.code === 'RECIPE_ORIGIN_MISMATCH' && mm.errorCode === 'RECIPE_ORIGIN_MISMATCH',
    'FETCH-03: active-tab origin mismatch -> dual-field RECIPE_ORIGIN_MISMATCH ...');
  check(recorderMM.length === 0,
    'FETCH-03: the mismatch fired NO executeScript (recorder EMPTY -- no side effect ...');
```

**Out-of-registry + hash-unmoved assertion — the INV-01 / Anti-Pattern-1 guard for the parity test** (`capability-mcp-surface.test.js:151-173`). The parity test folds in: neither capability tool is in `TOOL_REGISTRY` (so `getPublicTools()` never lists them):
```javascript
  const td = require(path.join(REPO_ROOT, 'mcp', 'ai', 'tool-definitions.cjs'));
  const nonTriggerTools = td.TOOL_REGISTRY.filter(function (tool) {
    return TRIGGER_TOOL_NAMES.indexOf(tool.name) < 0;
  });
  const actualHash = registryHash(nonTriggerTools);
  check(
    actualHash === EXPECTED_NON_TRIGGER_REGISTRY_HASH,
    'EXPECTED_NON_TRIGGER_REGISTRY_HASH is unchanged -- the two new tools are out-of-registry (INV-01)'
  );
  ...
  const registryNames = td.TOOL_REGISTRY.map(function (t) { return t.name; });
  check(registryNames.indexOf('invoke_capability') === -1,
    'invoke_capability is NOT in TOOL_REGISTRY (must stay out-of-registry)');
```

**mapFSBError passthrough — the typed-reason verbatim assertion (CAT-05)** (`capability-mcp-surface.test.js:235-254`; same dynamic-import-the-built-errors-module pattern as `capability-fetch.test.js:329-332`). Reuse for `RECIPE_NOT_FOUND` / `RECIPE_LEARN_PENDING` / `RECIPE_DOM_FALLBACK_PENDING`:
```javascript
  const { mapFSBError } = await import(errorsUrl);
  const unknownSlugResult = {
    success: false, code: 'RECIPE_NOT_FOUND', errorCode: 'RECIPE_NOT_FOUND',
    error: 'RECIPE_NOT_FOUND', slug: ...
  };
  const mapped = mapFSBError(unknownSlugResult);
  check(mappedText.indexOf('RECIPE_NOT_FOUND') !== -1,
    'mapFSBError surfaces RECIPE_NOT_FOUND verbatim for an unknown slug');
```

**Append both new files to the test chain** — `package.json` `scripts.test` ends with `... && node tests/capability-mcp-surface.test.js`. Append the two new tests AFTER it (the same place Phase 28 appended). The chain runs `npm --prefix mcp run build` mid-way (already present), which the MCP-surface assertions require.

---

## Shared Patterns

### Two front doors, one SW-global engine (CAT-04 / INV-02) — the `trigger` precedent

**Source:** `globalThis.fsbTriggerDispatchToolRequest` — DEFINED once in `extension/background.js:5219`, called by BOTH front doors. This is the EXACT model for `globalThis.FsbCapabilityRouter`.
**Apply to:** `mcp-tool-dispatcher.js` (front door 1) and `tool-executor.js` (front door 2).

Front door 1 (MCP dispatcher, `mcp-tool-dispatcher.js:1587-1593`):
```javascript
  const dispatch = (typeof globalThis !== 'undefined') ? globalThis.fsbTriggerDispatchToolRequest : null;
  if (typeof dispatch !== 'function') {
    return createMcpRouteError(toolName, (route && route.routeFamily) || 'trigger', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'trigger_dispatch_unavailable',
      error: 'fsbTriggerDispatchToolRequest unavailable'
    });
  }
```
Front door 2 (autopilot, `tool-executor.js:406`):
```javascript
        const dispatch = (typeof globalThis !== 'undefined') ? globalThis.fsbTriggerDispatchToolRequest : null;
```
Both call the SAME global -> same engine -> same origin-pin. Parity is at the runtime layer, NOT the tool layer. The capability equivalent: both doors call `globalThis.FsbCapabilityRouter.invoke(...)`.

### Autopilot Pitfall — the capability branch is NOT a `switch` case (load-bearing)

**Source:** `extension/ai/tool-executor.js:665-673` (the dispatch gate that runs BEFORE the `_route` switch).
**Apply to:** `tool-executor.js` — the NEW capability branch.

```javascript
async function executeTool(name, params, tabId, options = {}) {
  const tool = _te_getToolByName(name);

  if (!tool) {
    return makeResult({
      success: false,
      error: `Unknown tool: ${name}`
    });
  }
  ...
  switch (tool._route) {   // <-- only reached AFTER a registry hit
```
The `trigger` branch lives INSIDE `executeBackgroundTool`'s `switch`, which is only reached after `_te_getToolByName(name)` resolves the tool from `TOOL_REGISTRY`. The capability tools are **out-of-registry** (INV-01), so `_te_getToolByName('invoke_capability')` returns `null` and `executeTool` returns `Unknown tool` at line 668-673 BEFORE the switch. **The capability branch MUST be a guard at the TOP of `executeTool` (before `_te_getToolByName`)**, e.g.:
```javascript
const CAPABILITY_TOOL_NAMES = new Set(['invoke_capability', 'search_capabilities']);
async function executeTool(name, params, tabId, options = {}) {
  if (CAPABILITY_TOOL_NAMES.has(name)) return executeCapabilityToolForAutopilot(name, params, tabId);
  const tool = _te_getToolByName(name);
  ...
```
CONTEXT permits "a pre-switch special-case inside `executeTool()`" (Claude's Discretion). RESEARCH §Code Examples lines 397-431 has the full `executeCapabilityToolForAutopilot` shape. (RESEARCH Pitfall 1, lines 335-340 — VERIFIED.)

### LLM visibility — the model can't see the capability tools

**Source:** `extension/ai/agent-loop.js:673-678` — `getPublicTools()` maps ONLY `_al_TOOL_REGISTRY`.
**Apply to:** `agent-loop.js` `buildSystemPrompt` (additive string ONLY; the `setTimeout` iterator stays byte-untouched — INV-04).
```javascript
function getPublicTools() {
  return _al_TOOL_REGISTRY.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}
```
Because the tools are out-of-registry (correct, protects INV-01), they are absent from the LLM tool list. For autopilot to ORIGINATE a capability call, surface a tiny system-prompt hint (NOT 2 tool schemas). RESEARCH Open Q1 (lines 518-521): recommend gating the requirement on the parity test (branch routes correctly) + a minimal hint; full autopilot-originated use is a later refinement. **Confirm scope at plan-check.**

### Origin-pin holds on EVERY tier path (27-D-08 / D-12)

**Source:** `capability-fetch.js:291-298` (active-tab pin, excerpted in the handler section) + `capability-interpreter.js` first pin (`:338-357`).
**Apply to:** the router (T1b), every T1a handler. The router routes; it NEVER re-targets. Every credentialed call goes through `executeBoundSpec`, which re-pins. A mismatch returns `RECIPE_ORIGIN_MISMATCH` with NO side effect. The router is not a pin bypass.

### Typed fall-through error shape (CAT-05)

**Source:** `capability-interpreter.js:85-93` (`createRecipeError`) — excerpted in the router section. The dual-field `{success:false, code, errorCode, error}` is the ONLY shape that survives `/^RECIPE_.+$/` (`mcp/src/errors.ts:137`) verbatim.
**Apply to:** the router (all fall-through reasons) and every handler failure return.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `catalog/handlers/*.js` (the imperative HANDLER shape) | service/handler | request-response | `catalog/handlers/` does not exist today (verified — `catalog/` holds only `recipes/` + `descriptors/`). The DATA shape (`github-notifications.json`) and the EXECUTION contract (`executeBoundSpec`) both have analogs, but the imperative-handler-as-code idiom is new this phase. Planner uses RESEARCH §Code Examples (lines 434-465) for the interface and the dual-export tail (above) for the shell. |

Everything else has a direct in-repo analog. No file requires falling back to RESEARCH-only patterns for its core shell/wiring.

---

## Metadata

**Analog search scope:** `extension/utils/` (capability family), `extension/ws/mcp-tool-dispatcher.js`, `extension/ai/{tool-executor,agent-loop}.js`, `extension/background.js`, `scripts/{verify-recipe-path-guard,package-extension}.mjs`, `catalog/{recipes,descriptors}/`, `tests/capability-*.test.js`, root `package.json`.
**Files scanned (read):** 12 source/test/config + 2 catalog JSON.
**Pattern extraction date:** 2026-06-21 (branch `automation-worktree`).
**Numbering note:** research files use pre-final numbering — research "Phase 28" == this actual Phase 29.
