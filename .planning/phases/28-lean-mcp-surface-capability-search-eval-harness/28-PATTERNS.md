# Phase 28: Lean MCP Surface + Capability Search + Eval Harness - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 12 (5 NEW, 7 MODIFIED)
**Analogs found:** 12 / 12 (every file has a verified live-tree analog)

> Every excerpt below was read directly from `automation-worktree` HEAD. Line numbers are current as of 2026-06-20. The planner should mirror these excerpts byte-for-byte into `<read_first>` + `<action>` fields. **Adapt names/weights only inside the Claude's-Discretion areas flagged in CONTEXT.**

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `mcp/src/tools/capabilities.ts` (NEW) | tool-registration (MCP) | request-response | `mcp/src/tools/vault.ts:20-131` + `mcp/src/tools/observability.ts:84-111` | exact (two precedents: out-of-registry + read-only data tool) |
| `mcp/src/runtime.ts` (MOD) | config / wiring | request-response | `runtime.ts:42` (`registerVaultTools` call-site) | exact |
| `mcp/src/queue.ts` (MOD) | service (queue) | request-response | `queue.ts:30-45` (`readOnlyTools` Set) | exact |
| `extension/utils/capability-search.js` (NEW) | service / store (SW module) | CRUD + transform (index build/query/persist) | `capability-interpreter.js:1-2,374-385` (dual-export IIFE shell) + vendored `minisearch.min.js` API | role-match (shell exact; index logic is the one genuinely-new piece) |
| `extension/ws/mcp-tool-dispatcher.js` (MOD) | controller / route table | request-response (search) + event-driven (invoke) | `MCP_PHASE199_MESSAGE_ROUTES:84-116` + `handleSearchMemoryMessageRoute:2141-2159` + ownership/tab resolution `:178-298` + `boundedPositiveInt:1413` | exact |
| `extension/ws/mcp-bridge-client.js` (MOD) | controller / bridge delegate | request-response | switch `:455-509` + `_handleSearchMemory:1657-1664` + `_getActiveTab:517-520` | exact |
| `extension/background.js` (MOD) | bootstrap / loader | event-driven (SW startup) | `importScripts` order block `:119-143` | exact |
| `scripts/verify-recipe-path-guard.mjs` (MOD) | config / CI guard | batch | `RECIPE_PATH_ALLOWLIST:85-98` + Check 4 `:264-297` | exact |
| `scripts/package-extension.mjs` (MOD) | build script | batch / file-I/O | `:35-65` (manifest read + zip of `extension/` only) | role-match (no catalog-copy precedent exists yet — this is the D-16 gap) |
| `catalog/descriptors/*.json` + `_fixtures/` (NEW) | data (descriptor docs) | static data | `catalog/recipes/github-notifications.json` + `catalog/recipes/_fixtures/valid-recipe.json` | role-match (descriptor is a NEW doc shape; recipe is the sibling) |
| `tests/capability-search-eval.test.js` (NEW) | test (eval gate) | batch | `tests/capability-interpreter.test.js:1-60` (zero-framework convention) | exact |
| `tests/capability-mcp-surface.test.js` (NEW) | test (INV-01 proof) | batch | `tests/capability-interpreter.test.js` convention + `tests/tool-definitions-parity.test.js:44-63` (hash assert) | exact |

---

## Pattern Assignments

### `mcp/src/tools/capabilities.ts` (NEW — tool-registration, request-response)

**Analog A (out-of-registry + queue.enqueue serialize):** `mcp/src/tools/vault.ts`
**Analog B (read-only progressive-disclosure data tool):** `mcp/src/tools/observability.ts` (`search_memory`)

**Imports pattern** — copy verbatim from `vault.ts:1-7`:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
```
> Note: `vault.ts:1` imports `McpServer` as a VALUE (`import { McpServer }`), not `import type`. The RESEARCH code-example used `import type` — prefer the live `vault.ts` form (value import) since `capabilities.ts` only references the type, both compile; match the existing file's convention.

**Function signature + security-boundary doc-comment** — `vault.ts:12-25`:
```typescript
/**
 * SECURITY: These tools are registered directly (not via TOOL_REGISTRY)
 * to maintain an explicit security boundary. ...
 */
export function registerVaultTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
```
> Mirror as `registerCapabilityTools(server, bridge, queue, agentScope): void`. The doc-comment must state "registered directly (not via TOOL_REGISTRY)" — this is the INV-01 intent marker.

**Read-only tool body (`search_capabilities`)** — model on `observability.ts:84-111` (`search_memory`), the read-only schema-on-hit precedent. Note `search_memory` STILL calls `queue.enqueue` even though it bypasses:
```typescript
server.tool(
  'search_memory',
  'Search FSB\'s memory system ... Returns memories ranked by relevance ...',
  {
    query: z.string().describe('Natural language search query'),
    domain: z.string().optional().describe('Filter by domain (e.g., "amazon.com")'),
    type: z.enum([...]).optional().describe('Filter by memory type'),
    topN: z.coerce.number().int().positive().finite().optional().describe('Max results to return (default: 5)'),
  },
  async ({ query, domain, type, topN }) => {
    if (!bridge.isConnected) {
      return mapFSBError({ success: false, error: 'extension_not_connected' });
    }
    return queue.enqueue('search_memory', async () => {        // <-- enqueue() bypasses because name is in readOnlyTools Set
      ...
      const result = await bridge.sendAndWait(
        { type: 'mcp:search-memory', payload: { query, filters, options } },
        { timeout: 5_000 },
      );
      return mapFSBError(result);
    });
  },
);
```
> For `search_capabilities`: zod shape `{ query: z.string(), origin: z.string().optional(), topN: z.coerce.number().int().positive().finite().optional() }` (D-10); `queue.enqueue('search_capabilities', ...)`; `bridge.sendAndWait({ type: 'mcp:capabilities-search', payload: { query, origin, topN } }, { timeout: 5_000 })`. **Load-bearing:** `'search_capabilities'` MUST also be added to the `queue.ts` Set (next file) or the enqueue serializes instead of bypassing.

**Mutating tool body (`invoke_capability`) — `queue.enqueue` serialize + `sendAgentScopedBridgeMessage`** — model on `vault.ts:55-80` (`fill_credential`):
```typescript
server.tool(
  'fill_credential',
  '...',
  {
    domain: z.string().optional().describe('...'),
    tab_id: z.coerce.number().int().positive().finite().optional().describe('...'),
  },
  async ({ domain, tab_id }) => {
    if (!bridge.isConnected) {
      return mapFSBError({ success: false, error: 'extension_not_connected' });
    }
    return queue.enqueue('fill_credential', async () => {       // <-- NOT in readOnlyTools -> serialized
      const targetTabId = typeof tab_id === 'number' ? tab_id : null;
      const payload: Record<string, unknown> = { domain };
      if (tab_id !== undefined) payload.tab_id = tab_id;
      const result = await sendAgentScopedBridgeMessage(
        bridge, agentScope, 'mcp:fill-credential', payload,
        { timeout: 15_000, targetTabId },
      );
      return mapFSBError(result);
    });
  },
);
```
> For `invoke_capability`: GENERIC zod shape `{ slug: z.string(), params: z.record(z.any()).optional(), tab_id: z.coerce.number().int().positive().finite().optional() }` (D-10 — a static schema cannot express per-recipe params; validation is SW-side). `queue.enqueue('invoke_capability', ...)`; build `payload = { slug, params: params || {} }`, conditionally add `tab_id`; `sendAgentScopedBridgeMessage(bridge, agentScope, 'mcp:capabilities-invoke', payload, { timeout: 30_000, targetTabId })`. Longer timeout than search because invoke does a real network round-trip (`use_payment_method` uses `125_000`; 30s is the planner's call).

**Error surfacing — no edit needed.** A bad slug returns `RECIPE_NOT_FOUND` from the dispatcher; it surfaces verbatim via the passthrough regex (see Shared Patterns → Typed-error passthrough).

---

### `mcp/src/runtime.ts` (MOD — config/wiring)

**Analog:** the `registerVaultTools` call-site at `runtime.ts:42`.

**Import block** (`runtime.ts:6-13`) + **call block** (`runtime.ts:36-43`):
```typescript
import { registerVaultTools } from './tools/vault.js';
// ...
  registerVaultTools(server, bridge, queue, agentScope);
  registerAutopilotTools(server, bridge, queue, agentScope);
```
> Add `import { registerCapabilityTools } from './tools/capabilities.js';` to the import block, and `registerCapabilityTools(server, bridge, queue, agentScope);` after `registerVaultTools(...)` at `:42` (before or after `registerAutopilotTools` — order is irrelevant for out-of-registry tools). All `register*Tools` use the identical `(server, bridge, queue, agentScope)` 4-arg signature.

---

### `mcp/src/queue.ts` (MOD — service/queue, request-response)

**Analog:** the `readOnlyTools` Set literal + the `enqueue` bypass at `queue.ts:30-54`.

**The Set + bypass mechanism** (`queue.ts:30-54`):
```typescript
  private readonly readOnlyTools = new Set([
    ...registryReadOnly,
    // Non-registry read-only tools
    'get_task_status',
    'get_site_guides',
    'get_memory',
    'get_extension_config',
    'list_sessions',
    'get_session_detail',
    'get_logs',
    'search_memory',          // <-- the exact precedent to mirror
    'get_memory_stats',
    'list_agents',
    'get_agent_stats',
    'get_agent_history',
  ]);

  async enqueue<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    if (this.readOnlyTools.has(toolName)) {
      return fn();                 // bypass — immediate execute
    }
    // ... else push to queue + process()
  }
```
> **Single-line change:** add `'search_capabilities',` to the "Non-registry read-only tools" block (e.g. right after `'search_memory',`). Do NOT add `'invoke_capability'` — it must serialize. This Set is the entire read-only/queued split (SURF-05); no other file decides it.

---

### `extension/utils/capability-search.js` (NEW — service/store SW module, CRUD+transform)

**Analog (shell):** `extension/utils/capability-interpreter.js` (dual-export IIFE).
**Analog (API surface):** vendored `extension/lib/minisearch.min.js` (UMD global `MiniSearch`).
> This is the ONE genuinely-new logic file. The IIFE SHELL is a byte-exact clone; the index build/snapshot/restore body is new (RESEARCH Code Examples lines 386-490 is the verified reference implementation — the planner should treat it as the starting draft).

**IIFE shell — open** (`capability-interpreter.js:1-2`):
```javascript
(function(global) {
  'use strict';
```

**typeof-guarded vendored-global accessor** (`capability-interpreter.js:55-72` — the exact pattern to clone for reaching `MiniSearch`, `chrome`, and the catalog global):
```javascript
  function getFSBRecipeSchema() {
    return (typeof FsbCapabilityRecipeSchema !== 'undefined' && FsbCapabilityRecipeSchema)
      ? FsbCapabilityRecipeSchema : null;
  }
```
> Clone as `_getMiniSearch()` (guards `typeof MiniSearch`), `_getChrome()` (guards `globalThis.chrome`), `_getCatalog()` (guards `typeof FsbRecipeIndex` — the build-time generated catalog global, D-16). Same `typeof X !== 'undefined' && X ? X : null` idiom. This is why the module loads cleanly under the Node test harness (the global may be absent → degrade, never throw).

**IIFE shell — close + dual export** (`capability-interpreter.js:374-385`):
```javascript
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
> Mirror exactly: `global.FsbCapabilitySearch = exportsObj;` + the `module.exports` guard + the `(typeof globalThis ... ? globalThis : this)` invocation. Export surface (per RESEARCH): `{ buildOrRestore, search, getRecipeBySlug, deriveSideEffect }`.

**Side-effect-class derivation source** — `capability-fetch.js:228` (the frozen `MUTATING_METHODS` set the descriptor's `sideEffectClass` is cross-checked against, D-02):
```javascript
  var MUTATING_METHODS = { POST: true, PUT: true, PATCH: true, DELETE: true };
```
> Mirror as `deriveSideEffect(method)`: `DELETE` → `'destructive'`, `POST/PUT/PATCH` → `'mutate'`, else (`GET/HEAD`) → `'read'`. The descriptor authors `sideEffectClass` but the index build cross-checks it against the recipe's `method`.

**LOAD-BEARING minisearch round-trip constraint (Pitfall 3, verified in vendored source):** `MiniSearch.loadJSON(json, options)` THROWS `'loadJSON should be given the same options used when serializing the index'` if `options` is absent or differs from construction. Keep the construction options in a **module-level constant** (`INDEX_OPTIONS = { idField:'slug', fields:[...], storeFields:[...] }`) and pass that SAME constant to BOTH `new MiniSearch(INDEX_OPTIONS)` and `MiniSearch.loadJSON(json, INDEX_OPTIONS)`. Snapshot to `chrome.storage.local['fsbCapabilityIndex']` as `{ catalogVersion, index: ms.toJSON() }`; on wake, `loadJSON` only when `catalogVersion` matches, else `addAll(descriptors)` + re-snapshot (D-05). Never rebuild on every wake.

**Origin-bias lever:** field `boost` (static field weighting, e.g. `{ intentSynonyms: 3 }`) + `boostDocument(id, term, storedFields)` per-doc multiplier reading `storedFields.service` (D-11). Origin is resolved SW-side in the DISPATCHER (next file), passed in as an arg — `capability-search.js` never reads `chrome.tabs`. **Open Question 1:** confirm the exact `boostDocument` arg order against the vendored 7.2.0 source at implementation; fall back to a post-`search` re-rank by `service` if the signature differs.

**CI-guard coupling (Pitfall 5, FAIL-CLOSED):** this file MUST be added to `RECIPE_PATH_ALLOWLIST` in `verify-recipe-path-guard.mjs` IN THE SAME PLAN it is created (Check 4 enumerates `extension/utils/capability-*.js` from disk and fails on any not on the allowlist). Keep the source free of the literal strings `eval(`, `new Function`, `import(` — even in comments (the guard scans comments).

---

### `extension/ws/mcp-tool-dispatcher.js` (MOD — controller/route table)

**Analog (route registration):** `MCP_PHASE199_MESSAGE_ROUTES:84-116`.
**Analog (standalone handler):** `handleSearchMemoryMessageRoute:2141-2159`.
**Analog (origin/tab resolution):** `executeBoundSpec` origin pattern + the ownership-gate tab resolution.
**Analog (topN clamp):** `boundedPositiveInt:1413`.

**Route table entries** (`mcp-tool-dispatcher.js:84-116` — note the `handler:` form, used by `search-memory`, vs the `helperName:` form):
```javascript
const MCP_PHASE199_MESSAGE_ROUTES = {
  // ...
  'mcp:search-memory': { routeFamily: 'observability', handler: handleSearchMemoryMessageRoute },
  'mcp:get-memory': { routeFamily: 'observability', handler: handleGetMemoryMessageRoute },
  // ...
};
```
> Add two entries (RESEARCH lines 497-498):
> ```javascript
> 'mcp:capabilities-search': { routeFamily: 'capabilities', handler: handleCapabilitiesSearchMessageRoute },
> 'mcp:capabilities-invoke': { routeFamily: 'capabilities', handler: handleCapabilitiesInvokeMessageRoute },
> ```
> Both use the standalone `handler:` form (like `search-memory`), NOT `helperName:`. The bridge-client `_handleX` methods (next file) delegate INTO `dispatchMcpMessageRoute`, which then calls these handlers.

**Standalone handler template** (`handleSearchMemoryMessageRoute:2141-2159` — the exact shape: availability guard → resolve → clamp → call → `{ success:true, results }`):
```javascript
async function handleSearchMemoryMessageRoute({ payload }) {
  if (typeof memoryManager === 'undefined' || typeof memoryManager?.search !== 'function') {
    return createMcpRouteError('search_memory', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Memory search unavailable' });
  }
  const filters = payload.filters || { ... };
  const options = {
    ...(payload.options || {}),
    topN: boundedPositiveInt(payload.options?.topN || payload.topN || payload.limit, 5, 25)
  };
  const results = await memoryManager.search(payload.query || '', filters, options);
  return {
    success: true,
    results: (Array.isArray(results) ? results : []).slice(0, options.topN).map(sanitizeMemoryEntry)
  };
}
```
> `handleCapabilitiesSearchMessageRoute`: guard `typeof FsbCapabilitySearch === 'undefined' || typeof FsbCapabilitySearch.search !== 'function'` → `createMcpRouteError('search_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability search unavailable' })`; resolve owned-tab origin SW-side (see below); clamp `topN` via `boundedPositiveInt(payload.topN, 5, 5)`; `const results = FsbCapabilitySearch.search(payload.query || '', ownedOrigin, topN)`; `return { success: true, results }`.
>
> `handleCapabilitiesInvokeMessageRoute` (RESEARCH lines 518-532): guard all three engine globals present; `recipe = FsbCapabilitySearch.getRecipeBySlug(payload.slug)`; if absent → `return { success:false, code:'RECIPE_NOT_FOUND', errorCode:'RECIPE_NOT_FOUND', error:'RECIPE_NOT_FOUND', slug: payload.slug }` (dual-field shape — see Shared Patterns); `interpreted = FsbCapabilityInterpreter.interpretRecipe(recipe, payload.params || {})`; if `interpreted.success !== true` return `interpreted` verbatim (typed `RECIPE_*` passthrough); resolve `tabId`; `return await FsbCapabilityFetch.executeBoundSpec(interpreted.spec, tabId)`.

**`boundedPositiveInt` helper** (`mcp-tool-dispatcher.js:1413` — reuse, do not rebuild):
```javascript
function boundedPositiveInt(value, defaultValue, maxValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, maxValue);
}
```

**Un-spoofable owned-tab origin resolution** — the `executeBoundSpec` pattern at `capability-fetch.js:285-291`:
```javascript
    var tabOrigin = null;
    try {
      tabOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
    } catch (originErr) {
      tabOrigin = null;
    }
```
> In the search handler (RESEARCH lines 505-512): `var ownedOrigin = payload.origin || null;` (optional override) then `if (!ownedOrigin) { try { var tabs = await chrome.tabs.query({ active: true, currentWindow: true }); ownedOrigin = (tabs[0] && tabs[0].url) ? new URL(tabs[0].url).origin : null; } catch (e) { ownedOrigin = null; } }`. The model NEVER supplies the authoritative origin — the `origin` param is a non-authoritative override only. For invoke `tabId`: explicit `payload.tab_id` else `chrome.tabs.query({ active:true, currentWindow:true })[0].id`.

> **Ownership-gate context (for the planner's awareness, NOT to copy wholesale):** `checkOwnershipGate` / `_resolveTabIdForGate` (`:178-298`) is the agent-scoped tab-ownership chokepoint for the AUTOPILOT/agent path. Phase 28 runs UNGATED (consent gate is Phase 30) — the dispatcher handlers resolve the active/owned tab via `chrome.tabs.query` directly (the `search_memory` precedent doesn't gate either). The two-point origin-pin still holds because `executeBoundSpec` re-asserts `tabOrigin === spec.origin` (`capability-fetch.js:291`) before any side effect. Do NOT add a new fetch path that bypasses that pin.

---

### `extension/ws/mcp-bridge-client.js` (MOD — controller/bridge delegate)

**Analog (switch case):** the `_handleMessage` switch at `:455-509`.
**Analog (delegate method):** `_handleSearchMemory:1657-1664`.
**Analog (active tab):** `_getActiveTab:517-520`.

**Switch cases** (`:455-509` — each message type returns `this._handleX(payload)`):
```javascript
      case 'mcp:search-memory':
        return this._handleSearchMemory(payload);
      // ...
      case 'mcp:list-credentials':
        return this._handleListCredentials();
      case 'mcp:fill-credential':
        return this._handleFillCredential(payload);
      // ...
      default:
        throw new Error('Unknown MCP message type: ' + type);
```
> Add two cases BEFORE the `default`:
> ```javascript
> case 'mcp:capabilities-search': return this._handleCapabilitiesSearch(payload);
> case 'mcp:capabilities-invoke': return this._handleCapabilitiesInvoke(payload);
> ```

**Delegating handler template** (`_handleSearchMemory:1657-1664` — delegates straight into `dispatchMcpMessageRoute`):
```javascript
  async _handleSearchMemory(payload) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:search-memory',
      payload,
      client: this
    });
    return response || {};
  }
```
> Clone twice:
> ```javascript
> async _handleCapabilitiesSearch(payload) {
>   const response = await dispatchMcpMessageRoute({ type: 'mcp:capabilities-search', payload, client: this });
>   return response || {};
> }
> async _handleCapabilitiesInvoke(payload) {
>   const response = await dispatchMcpMessageRoute({ type: 'mcp:capabilities-invoke', payload, client: this });
>   return response || {};
> }
> ```
> `_getActiveTab:517-520` (`const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab;`) is the active-tab helper if a handler needs it — but for these two the origin/tab resolution lives in the DISPATCHER handler, so the bridge delegates are thin pass-throughs.

---

### `extension/background.js` (MOD — bootstrap/loader)

**Analog:** the capability-family `importScripts` order block at `:119-143`.

**The order block** (`background.js:119-143` — each wrapped in `try/catch`, additive only):
```javascript
try { importScripts('lib/jmespath.min.js'); } catch (e) { console.error('[FSB] Failed to load jmespath.min.js:', e.message); }
try { importScripts('lib/minisearch.min.js'); } catch (e) { console.error('[FSB] Failed to load minisearch.min.js:', e.message); }
try { importScripts('lib/cfworker-json-schema.min.js'); } catch (e) { console.error('[FSB] Failed to load cfworker-json-schema.min.js:', e.message); }
try { importScripts('utils/capability-recipe-schema.js'); } catch (e) { console.error('[FSB] Failed to load capability-recipe-schema.js:', e.message); }
// ...
try { importScripts('utils/capability-auth-strategies.js'); } catch (e) { console.error('[FSB] Failed to load capability-auth-strategies.js:', e.message); }
try { importScripts('utils/capability-interpreter.js'); } catch (e) { console.error('[FSB] Failed to load capability-interpreter.js:', e.message); }
// ...
try { importScripts('utils/capability-fetch.js'); } catch (e) { console.error('[FSB] Failed to load capability-fetch.js:', e.message); }
```
> `minisearch.min.js` is ALREADY loaded at `:120` ("not wired until Phase 28"). Add, AFTER `capability-fetch.js` at `:143` (RESEARCH line 492):
> ```javascript
> try { importScripts('catalog/recipe-index.generated.js'); } catch (e) { console.error('[FSB] Failed to load recipe-index.generated.js:', e.message); }
> try { importScripts('utils/capability-search.js'); } catch (e) { console.error('[FSB] Failed to load capability-search.js:', e.message); }
> ```
> Load order is load-bearing: `minisearch.min.js` (the `MiniSearch` global) and `recipe-index.generated.js` (the `FsbRecipeIndex` catalog global) must both precede `capability-search.js`. Then invoke `FsbCapabilitySearch.buildOrRestore()` at SW startup (the build-or-restore is async; fire it after the import block). Keep edits ADDITIVE — `background.js` is byte-frozen as an esbuild input; do not reorder existing lines.

---

### `scripts/verify-recipe-path-guard.mjs` (MOD — config/CI guard)

**Analog:** the `RECIPE_PATH_ALLOWLIST` array `:85-98` + the pre-registration precedent for `capability-fetch.js` `:89-94`.

**The allowlist** (`:85-98`):
```javascript
const RECIPE_PATH_ALLOWLIST = [
  'extension/utils/capability-recipe-schema.js',
  'extension/utils/capability-interpreter.js',
  'extension/utils/capability-auth-strategies.js',
  // Phase 27 (FETCH-01, D-02): registered AHEAD of the file's creation ...
  'extension/utils/capability-fetch.js',
  'extension/lib/cfworker-json-schema.min.js',
  'extension/lib/jmespath.min.js',
  'extension/lib/minisearch.min.js',
];
```
> Add `'extension/utils/capability-search.js',` to the array (the `capability-fetch.js` comment at `:89-94` is the exact precedent for pre-registering before/with file creation — Check 1 skips a not-yet-existent path; Check 4 only FAILS on a disk file ABSENT from the allowlist). **This MUST land in the same plan that creates `capability-search.js`** — Check 4 (`:288-297`) enumerates `extension/utils/capability-*.js` from disk and pushes a failure for any not on the allowlist (FAIL-CLOSED).

**Check 4 (the fail-closed disk-drift enforcement, for awareness)** (`:288-296`):
```javascript
for (const f of capabilityFiles) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(f) === -1) {
    failures.push(
      `allowlist drift: '${f}' exists on disk but is NOT on the recipe-path allowlist ...`
    );
  }
}
```

---

### `scripts/package-extension.mjs` (MOD — build script, batch/file-I/O)

**Analog (closest):** the manifest-read + zip-of-`extension/`-only flow at `:35-67`. **No catalog-copy precedent exists yet — this is the D-16 gap.**

**Current state** (`:55-67` — zips `EXT_ROOT` (= `extension/`) ONLY; `catalog/` is top-level and excluded):
```javascript
try {
  execFileSync('zip', ['-r', '-q', zipPath, '.', '-x', ...excludes], {
    cwd: EXT_ROOT,
    stdio: 'inherit',
  });
} catch (error) {
  if (error.code === 'ENOENT') {
    fail('zip CLI is required to build the extension archive');
  }
  process.exit(error.status || 1);
}
console.log(`package-extension: wrote ${zipPath.replace(`${ROOT}/`, '')}`);
```
**Available helpers already imported** (`:4-11`): `execFileSync`, `existsSync`, `mkdirSync`, `readFileSync`, `rmSync` from `node:fs`; `dirname`, `join`, `resolve` from `node:path`; `ROOT`, `EXT_ROOT`, `DIST_DIR` constants; `fail(message)` helper.
> **Recommended (D-16 discretion, RESEARCH Primary recommendation):** generate a build-time `extension/catalog/recipe-index.generated.js` dual-export IIFE bundling `{ recipes, descriptors }` (read `catalog/recipes/*.json` + `catalog/descriptors/*.json`, emit `global.FsbRecipeIndex = { recipes, descriptors }` + the `module.exports` guard) BEFORE the `zip` step — MV3-cold-start-safe (no SW `fetch` race). The generated file then ships because it lives under `extension/`. **Alternative:** copy `catalog/` into `extension/catalog/` before the zip and `fetch(chrome.runtime.getURL('catalog/...'))` at startup (more fragile under SW eviction). Use `writeFileSync` (add to the `node:fs` import) for the generator. **Build-step ordering:** the generator must run before `zip`, and must regenerate whenever `catalog/` changes. Add a CI assertion (in `capability-mcp-surface.test.js` or a packaging test) that the generated artifact exists and exports a non-empty `descriptors` array (Open Question 3).
> **Naming caution:** `extension/catalog/recipe-index.generated.js` is NOT `extension/utils/capability-*.js`, so it does NOT trip the Check-4 allowlist glob — good. Keep generated source free of `eval(`/`new Function`/`import(` literals anyway (defensive; it's pure data).

---

### `catalog/descriptors/*.json` + `catalog/descriptors/_fixtures/` (NEW — data)

**Analog (sibling recipe):** `catalog/recipes/github-notifications.json`.
**Analog (fixtures dir precedent):** `catalog/recipes/_fixtures/valid-recipe.json`.

**Sibling recipe (the closed-vocab doc the descriptor pairs with, by `slug` == recipe `id`)** — `catalog/recipes/github-notifications.json`:
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
> The recipe carries NO synonyms/description — that vocabulary is FROZEN + CI-guarded (Phase 26). The NEW descriptor doc shape (D-01, RESEARCH lines 552-562):
> ```json
> {
>   "slug": "github.notifications",
>   "service": "github.com",
>   "intentSynonyms": ["show my github notifications", "check github alerts", "list unread github notifications", "what's new on github"],
>   "description": "List your unread GitHub notifications",
>   "actionVerb": "list",
>   "sideEffectClass": "read"
> }
> ```
> `slug` MUST equal the recipe `id`. `sideEffectClass` is authored but cross-checked at index-build against the recipe `method` (GET → `read`, D-02). `intentSynonyms` are MANDATORY (terse endpoint names are the #1 recall-failure mode, Pitfall 1).

**Fixtures shape (params sub-document for schema-on-hit)** — `catalog/recipes/_fixtures/valid-recipe.json`:
```json
{
  "schemaVersion": 1,
  "id": "example.get-thing",
  "origin": "https://example.com",
  "endpoint": "/api/{id}",
  "method": "GET",
  "authStrategy": "same-origin-cookie",
  "params": {
    "type": "object",
    "properties": { "id": { "type": "string" } },
    "required": ["id"]
  },
  "request": { "query": { "id": "{id}" } },
  "extract": "data.items[*].name"
}
```
> The eval seed (D-14) lives under `catalog/descriptors/_fixtures/` as `seed-descriptors.json` (~6-12 synthetic head capabilities with near-neighbor `send`/`post`/`message` services so ranking can FAIL on a naive index, Open Question 2) + `intent-cases.json` (`[{ intent, expectedSlug }]` with 3-5 paraphrases each) + minimal sibling recipes carrying `params` for schema-on-hit. Test data lives OUTSIDE the shipped runtime (like `catalog/recipes/_fixtures/`) — not `node --check`'d, not packaged, not on the recipe-path CI guard.

---

### `tests/capability-search-eval.test.js` (NEW — eval gate, batch)

**Analog:** the zero-framework convention in `tests/capability-interpreter.test.js:1-60`.

**Convention header + counters + check + exit** (`capability-interpreter.test.js:40-60`, the FSB standalone-test shape):
```javascript
const fs = require('fs');
const path = require('path');
// ...
let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    // failed++ ; console.log('  FAIL:', msg)
  }
}
// ... at end: process.exit(failed > 0 ? 1 : 0);
```
> The eval-specific gate (RESEARCH lines 565-585): `const MiniSearch = require('../extension/lib/minisearch.min.js')` (UMD require works in Node), require the seed descriptors + intent fixtures, build the index with the SAME `INDEX_OPTIONS` as `capability-search.js`, loop fixtures computing `recall@5` (`expectedSlug` in top-5 hit IDs) + `wrongInvoke` (top-1 `id !== expectedSlug`), then `assert(recall >= 0.9)` AND `assert(wrongRate === 0)` (D-13, non-negotiable), `process.exit` non-zero on failure. Also assert the `toJSON`→`loadJSON(json, OPTIONS)` round-trip yields identical results (SURF-04) and hits ≤ 5 carry `params` + `sideEffectClass` (SURF-01).

---

### `tests/capability-mcp-surface.test.js` (NEW — INV-01 proof, batch)

**Analog (convention):** `tests/capability-interpreter.test.js` (zero-framework).
**Analog (hash assert + registry list):** `tests/tool-definitions-parity.test.js:44-63`.

**The frozen hash + stable-stringify** (`tool-definitions-parity.test.js:52-63`):
```javascript
const EXPECTED_NON_TRIGGER_REGISTRY_HASH = 'ad6efb8cc3275d964488b67222129b1c0278c5c3b69c64888d926beb89a3926b';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function(out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}
```
> `capability-mcp-surface.test.js` asserts (D-15): (a) the BUILT MCP module exposes `search_capabilities` + `invoke_capability` on the wire (dynamic-import the built `mcp/build/...` — `npm --prefix mcp run build` runs earlier in the test chain, the `mcp-recovery-messaging.test.js` precedent); (b) the `tool-definitions-parity` registry hash is UNCHANGED (the existing `tests/tool-definitions-parity.test.js` already proves this — this test can re-assert or simply require co-running it). Also assert the queue split: `'search_capabilities'` bypasses / `'invoke_capability'` enqueues (SURF-05), and unknown slug → `RECIPE_NOT_FOUND` (SURF-02). Do NOT add the two tools to `TOOL_REGISTRY` or the hash moves and this test (plus `tool-definitions-parity`) reds.

**Wire-up to the test chain** (`package.json:17` — the `&&`-chain ENDS with `... && node tests/capability-fetch.test.js`):
> Append `&& node tests/capability-search-eval.test.js && node tests/capability-mcp-surface.test.js` to the `test` script after `capability-fetch.test.js`. `ci` (`:32`) runs `npm test`, so both gate automatically. Zero framework install needed.

---

## Shared Patterns

### Out-of-registry registration (INV-01 lock) — applies to `capabilities.ts`
**Source:** `mcp/src/tools/vault.ts:12-25` (the security-boundary doc-comment + `server.tool()` calls that NEVER touch `TOOL_REGISTRY`).
**Apply to:** `capabilities.ts` — both `search_capabilities` and `invoke_capability` register ONLY via `server.tool()`. The frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (`tool-definitions-parity.test.js:52` = `ad6efb8cc...`) never moves because `TOOL_REGISTRY` (55 entries) is untouched. This is the entire INV-01 strategy — adding to the registry would red `tool-definitions-parity.test.js` AND force autopilot exposure via `getPublicTools()`.

### Read-only / queued split — applies to `capabilities.ts` + `queue.ts`
**Source:** `mcp/src/queue.ts:30-54` (the `readOnlyTools` Set + the `enqueue` `if (has) return fn()` bypass).
```typescript
async enqueue<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
  if (this.readOnlyTools.has(toolName)) { return fn(); }
  // else serialize via queue
}
```
**Apply to:** `search_capabilities` (add name to Set → bypass) and `invoke_capability` (NOT in Set → serialized). BOTH tools still WRAP their body in `queue.enqueue(name, fn)` — the Set membership alone decides bypass-vs-serialize (the `search_memory` vs `fill_credential` contrast).

### Typed-error passthrough (free `RECIPE_NOT_FOUND`) — applies to `capabilities.ts` + dispatcher invoke handler
**Source:** `mcp/src/errors.ts:137`.
```javascript
if (explicitCode && /^(TRIGGER_.+|RECIPE_.+|INVALID_TRIGGER_ID|INVALID_TAB_ID|LIFECYCLE_UNAVAILABLE|REFRESH_POLL_INTERVAL_TOO_LOW)$/.test(explicitCode)) {
  return explicitCode;
}
```
**Apply to:** the invoke handler returns the dual-field error shape `{ success:false, code:'RECIPE_NOT_FOUND', errorCode:'RECIPE_NOT_FOUND', error:'RECIPE_NOT_FOUND', slug }`. The `/^RECIPE_.+$/` arm surfaces it VERBATIM through `mapFSBError` — `RECIPE_NOT_FOUND` is currently unused anywhere, so it is free to introduce with **no `errors.ts` edit** (D-07). `interpretRecipe`'s own typed `RECIPE_*` returns (e.g. `RECIPE_SCHEMA_INVALID`, `RECIPE_ORIGIN_MISMATCH`) pass through the same arm.

### Dual-field typed-error shape — applies to dispatcher handlers
**Source:** `mcp-tool-dispatcher.js:190-198` (`createMcpOwnershipError`) — the `{ success:false, code, errorCode, error, ...extra }` shape every SW-side route error uses.
```javascript
function createMcpOwnershipError(code, extra = {}) {
  return { success: false, code, errorCode: code, error: code, ...extra };
}
```
**Apply to:** the `RECIPE_NOT_FOUND` return and any handler-availability error (use `createMcpRouteError(tool, family, MCP_ROUTE_RECOVERY_HINT, { error })` for the "engine unavailable" arms, mirroring `handleSearchMemoryMessageRoute:2143`).

### Un-spoofable owned-tab origin resolution — applies to dispatcher handlers
**Source:** `extension/utils/capability-fetch.js:285-291` (`new URL(tab.url).origin` with try/catch → null).
**Apply to:** both new dispatcher handlers resolve the origin/tab SW-side from `chrome.tabs.query({ active:true, currentWindow:true })`; the model-supplied `origin`/`tab_id` are optional, non-authoritative overrides. The engine's `executeBoundSpec` re-asserts `tabOrigin === spec.origin` before any side effect — do NOT introduce a fetch path that skips that re-assertion (Wall 2 / V1 Architecture).

### Dual-export IIFE module shell — applies to `capability-search.js` (+ the generated `recipe-index.generated.js`)
**Source:** `capability-interpreter.js:1-2` (open) + `:374-385` (close):
```javascript
(function(global) {
  'use strict';
  // ... typeof-guarded accessors + logic ...
  var exportsObj = { /* public surface */ };
  global.FsbCapabilitySearch = exportsObj;
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportsObj; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
**Apply to:** `capability-search.js` (`global.FsbCapabilitySearch`) and the generated `recipe-index.generated.js` (`global.FsbRecipeIndex = { recipes, descriptors }`). The SW reads the global after `importScripts`; Node tests `require()` the `module.exports`. typeof-guarded accessors (`capability-interpreter.js:55-72`) let the module load under the Node harness where vendored globals may be absent.

### Zero-framework test convention — applies to both new tests
**Source:** `tests/capability-interpreter.test.js:53-60` — `let passed=0; let failed=0; function check(cond,msg){...}` + `process.exit(failed>0?1:0)`. UMD `require('../extension/lib/minisearch.min.js')` works in Node. The built-MCP-module dynamic import after `npm --prefix mcp run build` (already earlier in the chain) is the `mcp-recovery-messaging.test.js` precedent.
**Apply to:** `capability-search-eval.test.js` (gate via `assert`) and `capability-mcp-surface.test.js` (wire-presence + hash unchanged). Append both to `package.json:17` after `capability-fetch.test.js`.

---

## No Analog Found

None. Every file in scope has a verified live-tree analog. The two files with the WEAKEST analog (still classified as role-match, not "no analog") are:

| File | Role | Data Flow | Why weaker |
|------|------|-----------|------------|
| `scripts/package-extension.mjs` (catalog-ship step) | build script | batch | No existing catalog-copy/generate code — this is the D-16 gap by design. The analog is the surrounding manifest-read + zip flow (`:35-67`) and the esbuild/generated-file precedent; the catalog generator body is new. |
| `extension/utils/capability-search.js` (index body) | service/store | CRUD+transform | The IIFE SHELL is a byte-exact clone of `capability-interpreter.js`, but the minisearch build/snapshot/restore + `boostDocument` body is the one genuinely-new logic in the phase. RESEARCH Code Examples (lines 386-490) is the verified reference draft. |

---

## Metadata

**Analog search scope:** `mcp/src/tools/`, `mcp/src/` (runtime, queue, errors), `extension/ws/` (dispatcher, bridge-client), `extension/utils/` (interpreter, fetch), `extension/background.js`, `scripts/` (recipe-path-guard, package-extension), `catalog/recipes/` (+ `_fixtures/`), `tests/` (capability-interpreter, tool-definitions-parity), `package.json`.
**Files scanned (read):** 19 source files across MCP server + extension SW + build scripts + tests.
**Verification:** every line-number citation re-confirmed against `automation-worktree` HEAD on 2026-06-20 (the RESEARCH anchors held; minor drift noted inline — e.g. `vault.ts` ends at `:131` not `:130`, `interpretRecipe` param-validation is `:264-292`, all non-material).
**Pattern extraction date:** 2026-06-20
