# Phase 18: Shared Tool Registry & Dispatcher Wiring - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 20
**Analogs found:** 20 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `extension/ai/tool-definitions.js` | config | request-response | existing entries in `extension/ai/tool-definitions.js` | exact |
| `mcp/ai/tool-definitions.cjs` | config | request-response | byte-identical mirror of `extension/ai/tool-definitions.js` | exact |
| `mcp/src/tools/read-only.ts` | route | request-response | existing read-only tool registration in `mcp/src/tools/read-only.ts` | exact |
| `mcp/src/tools/manual.ts` | route | request-response | existing manual action registration in `mcp/src/tools/manual.ts` | role-match |
| `mcp/src/tools/triggers.ts` | route | request-response | `mcp/src/tools/read-only.ts` and `mcp/src/tools/autopilot.ts` | role-match |
| `mcp/src/runtime.ts` | config | request-response | existing registrar wiring in `mcp/src/runtime.ts` | exact |
| `mcp/src/queue.ts` | utility | request-response | existing registry-derived read-only bypass in `mcp/src/queue.ts` | exact |
| `extension/ws/mcp-tool-dispatcher.js` | route | request-response | existing direct tool/message routes in `extension/ws/mcp-tool-dispatcher.js` | exact |
| `extension/ws/mcp-bridge-client.js` | service | request-response | existing background route dispatch in `extension/ws/mcp-bridge-client.js` | exact |
| `extension/background.js` | controller | event-driven | existing trigger helpers in `extension/background.js` | exact |
| `tests/tool-definitions-parity.test.js` | test | transform | existing byte-identity and schema sanity assertions | exact |
| `tests/visual-session-schema-lock.test.js` | test | transform | existing action vs read-only schema-lock assertions | exact |
| `tests/mcp-tool-routing-contract.test.js` | test | request-response | existing direct route contract assertions | exact |
| `tests/mcp-tool-smoke.test.js` | test | request-response | existing MCP registration, bridge, and queue assertions | exact |
| `tests/trigger-tool-dispatcher.test.js` | test | event-driven | `tests/trigger-lifecycle.test.js`, `tests/trigger-store.test.js`, `tests/trigger-refresh-poll.test.js` | role-match |
| `tests/trigger-store.test.js` | test | CRUD | existing snapshot round-trip and hydrate tests | exact |
| `tests/trigger-lifecycle.test.js` | test | event-driven | existing lifecycle seam and source-contract tests | exact |
| `tests/trigger-refresh-poll.test.js` | test | event-driven | existing refresh-poll source-contract tests | exact |
| `tests/trigger-observe.test.js` | test | event-driven | existing content observer/read tests | exact |
| `tests/trigger-observe-pulse.test.js` | test | event-driven | existing pulse overlay tests | exact |

## Pattern Assignments

### `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs` (config, request-response)

**Analog:** existing shared registry entries in `extension/ai/tool-definitions.js`

**Registry shape and metadata pattern** (lines 1-8, 78-86):
```javascript
 * Canonical Tool Registry for FSB Browser Automation
 *
 * Single source of truth for all 52 browser automation tool definitions.
 * Shared between autopilot (agent loop) and MCP server.
 *
 * Per D-11/D-12: Each tool is a plain object with JSON Schema inputSchema
 * and routing metadata (_route, _readOnly, _contentVerb, _cdpVerb).
```

```javascript
 * @typedef {Object} ToolDefinition
 * @property {string} name - snake_case tool name (per D-01)
 * @property {string} description - When to use, what it does, related tools
 * @property {Object} inputSchema - JSON Schema object with type, properties, required
 * @property {'content'|'cdp'|'background'} _route - Execution route
 * @property {boolean} _readOnly - True for read-only tools that bypass mutation queue
```

**Action-tool pattern** (lines 100-120):
```javascript
withVisualSessionFields({
  name: 'execute_js',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute in the page...' },
      tab_id: { type: 'number', description: 'Optional. Tab id this action targets...' }
    },
    required: ['code']
  },
  _route: 'background',
  _readOnly: false,
  _contentVerb: null,
  _cdpVerb: null,
  _forceForeground: false,
  _emitChangeReport: true
}),
```

**Read-only/background pattern for companion tools** (lines 1025-1039, 1066-1085):
```javascript
{
  name: 'list_tabs',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  _route: 'background',
  _readOnly: true,
  _contentVerb: null,
  _cdpVerb: null,
  _forceForeground: false,
  _emitChangeReport: false
},
```

```javascript
{
  name: 'get_site_guide',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domain name to get guide for...' }
    },
    required: ['domain']
  },
  _route: 'background',
  _readOnly: true,
  _contentVerb: null,
  _cdpVerb: null,
  _forceForeground: false,
  _emitChangeReport: false
},
```

**Registry helper/export pattern** (lines 1226-1260):
```javascript
function getToolByName(name) {
  return TOOL_REGISTRY.find(t => t.name === name) || null;
}

function getReadOnlyTools() {
  return TOOL_REGISTRY.filter(t => t._readOnly);
}

function getToolsByRoute(route) {
  return TOOL_REGISTRY.filter(t => t._route === route);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TOOL_REGISTRY,
    getToolByName,
    getReadOnlyTools,
    getToolsByRoute,
    VISUAL_SESSION_FIELDS,
    VISUAL_SESSION_REQUIRED,
    withVisualSessionFields
  };
}
```

**Apply to Phase 18:**
- Add `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` in `extension/ai/tool-definitions.js`.
- Keep `mcp/ai/tool-definitions.cjs` byte-identical by copying the extension file, matching the MCP build script (`mcp/package.json` lines 42-45).
- `trigger` should be `_route: 'background'`, `_readOnly: false` unless the planner chooses a trigger-specific direct registrar.
- `stop_trigger`, `get_trigger_status`, and `list_triggers` should use the read-only/bypass metadata shape even though `stop_trigger` mutates runtime state.

---

### `mcp/src/tools/read-only.ts` (route, request-response)

**Analog:** existing read-only registration and message map

**Imports pattern** (lines 1-8):
```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { MCPMessageType } from '../types.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import { TOOL_REGISTRY, jsonSchemaToZod } from './schema-bridge.js';
```

**Message map pattern** (lines 26-64):
```typescript
const MESSAGE_TYPE_MAP: Record<
  string,
  (params: Record<string, unknown>) => BridgeMessage
> = {
  read_page: (p) => ({
    type: 'mcp:read-page',
    payload: { full: p.full, ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) },
  }),
  list_tabs: () => ({
    type: 'mcp:get-tabs',
    payload: {},
  }),
  get_page_snapshot: (p) => ({
    type: 'mcp:get-page-snapshot',
    payload: { ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) },
  }),
};
```

**Registration and bypass pattern** (lines 90-135):
```typescript
export function registerReadOnlyTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  const readOnlyTools = TOOL_REGISTRY.filter(t => t._readOnly);

  for (const tool of readOnlyTools) {
    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const messageBuilder = MESSAGE_TYPE_MAP[tool.name];

    if (!messageBuilder) {
      continue;
    }

    const timeout = TIMEOUT_OVERRIDES[tool.name] ?? 30_000;

    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (params: Record<string, unknown>) => {
        if (!bridge.isConnected) {
          return mapFSBError({ success: false, error: 'extension_not_connected' });
        }
        return queue.enqueue(tool.name, async () => {
          const targetTabId = typeof params.tab_id === 'number' ? params.tab_id : null;
          const built = messageBuilder(params);
          const result = await sendAgentScopedBridgeMessage(
            bridge,
            agentScope,
            built.type,
            built.payload as Record<string, unknown>,
            { timeout, targetTabId },
          );
          return mapFSBError(result);
        });
      },
    );
  }
}
```

**Apply to Phase 18:**
- If companions stay in `read-only.ts`, add message builders for `stop_trigger`, `get_trigger_status`, and `list_triggers`.
- Use `sendAgentScopedBridgeMessage` so `agentId`, `ownershipToken`, and explicit `tab_id` routing are preserved.
- Add timeout overrides: short for status/list/stop, bounded for `trigger` if it is also registered here or in a new registrar.

---

### `mcp/src/tools/manual.ts` (route, request-response)

**Analog:** existing manual mutation registration

**Manual path warning pattern** (lines 29-35):
```typescript
 * Runs at the dispatch chokepoint for every action tool (registered by
 * registerManualTools below). Read-only tools bypass this validator
 * entirely because they are registered through registerReadOnlyTools
 * (mcp/src/tools/read-only.ts), which does not import this function.
```

**Mutation queue pattern to avoid for companions** (lines 168-198):
```typescript
return queue.enqueue(toolName, async () => {
  try {
    const basePayload: Record<string, unknown> = { tool: fsbVerb, params };
    if (visualSession) {
      basePayload.visualSession = visualSession;
    }
    const result = await sendAgentScopedBridgeMessage(
      bridge,
      agentScope,
      'mcp:execute-action',
      basePayload,
      { timeout, targetTabId: targetTabIdFromParams(params) },
    );
    return mapFSBError(result);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return mapFSBError({ success: false, error: errMsg });
  }
});
```

**Registry filter pattern** (lines 207-255):
```typescript
export function registerManualTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  const manualTools = TOOL_REGISTRY.filter((t: ToolDefinition) => !t._readOnly);

  for (const tool of manualTools) {
    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const fsbVerb = tool._contentVerb || tool._cdpVerb || tool.name;
    const transform = PARAM_TRANSFORMS[tool.name];

    server.tool(
      tool.name,
      description,
      zodShape,
      async (params: Record<string, unknown>) => {
        const rejection = validateVisualSessionFields(tool.name, params);
        if (rejection) return rejection;
        const visualSession = buildVisualSessionSidecar(params);
        const cleanedParams = stripVisualSessionFields(params);
        const finalParams = transform ? transform(cleanedParams) : cleanedParams;
        return execAction(bridge, queue, agentScope, tool.name, fsbVerb, finalParams, visualSession);
      },
    );
  }
}
```

**Apply to Phase 18:**
- Do not let `stop_trigger`, `get_trigger_status`, or `list_triggers` land only here; this path requires visual-session fields and serializes through the mutation queue.
- If `trigger` is `_readOnly: false`, explicitly decide whether `manual.ts` owns it in Phase 18. Research recommends a trigger-specific registrar to avoid Phase 19 queue migration.
- If a new `mcp/src/tools/triggers.ts` owns trigger registration, exclude the trigger family from `manualTools` to avoid duplicate MCP handlers.

---

### `mcp/src/tools/triggers.ts` (route, request-response)

**Analog:** `mcp/src/tools/autopilot.ts` for direct cancellation/status plus `mcp/src/tools/read-only.ts` for registry/Zod conversion

**Direct cancellation pattern** from `mcp/src/tools/autopilot.ts` (lines 207-225):
```typescript
server.tool(
  'stop_task',
  'Cancel the currently running automation task...',
  {},
  async () => {
    if (!bridge.isConnected) {
      return mapFSBError({ success: false, error: 'extension_not_connected' });
    }
    const result = await sendAgentScopedBridgeMessage(
      bridge,
      agentScope,
      'mcp:stop-automation',
      {},
      { timeout: 10_000 },
    );
    return mapFSBError(result);
  },
);
```

**Status-through-bypass pattern** from `mcp/src/tools/autopilot.ts` (lines 227-247):
```typescript
server.tool(
  'get_task_status',
  'Check whether a task is currently running and its progress...',
  {},
  async () => {
    if (!bridge.isConnected) {
      return mapFSBError({ success: false, error: 'extension_not_connected' });
    }
    return queue.enqueue('get_task_status', async () => {
      const result = await sendAgentScopedBridgeMessage(
        bridge,
        agentScope,
        'mcp:get-status',
        {},
        { timeout: 5_000, includeOwnershipToken: false },
      );
      return mapFSBError(result);
    });
  },
);
```

**Agent-scoped payload pattern** from `mcp/src/agent-bridge.ts` (lines 50-67, 70-92):
```typescript
async function buildAgentPayload(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  basePayload: Record<string, unknown>,
  options: AgentScopedSendOptions,
): Promise<Record<string, unknown>> {
  const agentId = await agentScope.ensure(bridge);
  options.onAgentId?.(agentId);

  const payload: Record<string, unknown> = { ...basePayload, agentId };
  if (options.includeOwnershipToken !== false) {
    const ownershipToken = currentOwnershipToken(agentScope, options.targetTabId ?? null);
    if (ownershipToken) payload.ownershipToken = ownershipToken;
  }
  return payload;
}
```

```typescript
export async function sendAgentScopedBridgeMessage(
  bridge: WebSocketBridge,
  agentScope: AgentScope,
  type: MCPMessageType,
  basePayload: Record<string, unknown>,
  options: AgentScopedSendOptions = {},
): Promise<Record<string, unknown>> {
  let payload = await buildAgentPayload(bridge, agentScope, basePayload, options);
  let result = await bridge.sendAndWait({ type, payload }, sendOptions);
  captureOwnershipToken(agentScope, result);
  return result;
}
```

**Apply to Phase 18:**
- New registrar should import `TOOL_REGISTRY`, `jsonSchemaToZod`, `sendAgentScopedBridgeMessage`, and `mapFSBError`.
- Register all four tools from registry definitions, not hand-written schemas.
- Send bounded message types such as `mcp:trigger`, `mcp:stop-trigger`, `mcp:get-trigger-status`, and `mcp:list-triggers`.
- Keep `stop_trigger` direct or queue-bypassing like `stop_task`, not queued behind the target work.

---

### `mcp/src/runtime.ts` (config, request-response)

**Analog:** existing registrar wiring

**Import and registration pattern** (lines 6-13, 35-42):
```typescript
import { registerAutopilotTools } from './tools/autopilot.js';
import { registerVisualSessionTools } from './tools/visual-session.js';
import { registerManualTools } from './tools/manual.js';
import { registerReadOnlyTools } from './tools/read-only.js';
import { registerObservabilityTools } from './tools/observability.js';
import { registerAgentTools } from './tools/agents.js';
import { registerVaultTools } from './tools/vault.js';
import { registerResources } from './resources/index.js';
```

```typescript
registerVisualSessionTools(server, bridge, queue, agentScope);
registerManualTools(server, bridge, queue, agentScope);
registerReadOnlyTools(server, bridge, queue, agentScope);
registerObservabilityTools(server, bridge, queue, agentScope);
registerAgentTools(server, bridge, queue, agentScope);
registerVaultTools(server, bridge, queue, agentScope);
registerAutopilotTools(server, bridge, queue, agentScope);
registerResources(server, bridge);
```

**Apply to Phase 18:**
- If `mcp/src/tools/triggers.ts` is created, import and call `registerTriggerTools(server, bridge, queue, agentScope)`.
- Register it before or instead of paths that would duplicate the trigger handlers. Prefer before `registerManualTools` only if `manual.ts` excludes those names.

---

### `mcp/src/queue.ts` (utility, request-response)

**Analog:** existing registry-derived read-only bypass

**Registry import pattern** (lines 1-12):
```typescript
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toolDefs = require(path.resolve(__dirname, '../ai/tool-definitions.cjs'));
const registryReadOnly: string[] = toolDefs.getReadOnlyTools().map((t: { name: string }) => t.name);
```

**Bypass pattern** (lines 28-54):
```typescript
private readonly readOnlyTools = new Set([
  ...registryReadOnly,
  'get_task_status',
  'get_site_guides',
  'get_memory',
  'list_sessions',
  'get_session_detail',
  'get_logs',
  'search_memory',
  'get_memory_stats',
]);

async enqueue<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
  if (this.readOnlyTools.has(toolName)) {
    return fn();
  }
  return new Promise<T>((resolve, reject) => {
    this.queue.push({ execute: fn as () => Promise<unknown>, resolve, reject });
    this.process();
  });
}
```

**Apply to Phase 18:**
- If companions are marked `_readOnly: true`, `TaskQueue` picks them up automatically from `registryReadOnly`.
- If `stop_trigger` is not `_readOnly: true`, add it to the explicit bypass set. The locked requirement is scheduling behavior, not semantic purity.
- Add a direct unit assertion that an unresolved queued mutation does not delay `stop_trigger`, `get_trigger_status`, or `list_triggers`.

---

### `extension/ws/mcp-tool-dispatcher.js` (route, request-response)

**Analog:** existing direct route contracts and background/autopilot handlers

**Route table pattern** (lines 50-78):
```javascript
const MCP_PHASE199_TOOL_ROUTES = {
  navigate: { routeFamily: 'browser', handler: handleNavigateRoute },
  open_tab: { routeFamily: 'browser', handler: handleOpenTabRoute },
  list_tabs: { routeFamily: 'browser', handler: handleListTabsRoute },
  run_task: { routeFamily: 'autopilot', messageType: 'mcp:start-automation', handler: handleToolAliasRoute },
  stop_task: { routeFamily: 'autopilot', messageType: 'mcp:stop-automation', handler: handleToolAliasRoute },
  get_task_status: { routeFamily: 'autopilot', messageType: 'mcp:get-status', handler: handleToolAliasRoute },
  get_site_guide: { routeFamily: 'read-only', messageType: 'mcp:get-site-guides', handler: handleToolAliasRoute },
  get_page_snapshot: { routeFamily: 'read-only', messageType: 'mcp:get-page-snapshot', handler: handleToolAliasRoute },
  read_page: { routeFamily: 'read-only', messageType: 'mcp:read-page', handler: handleToolAliasRoute },
  get_dom_snapshot: { routeFamily: 'read-only', messageType: 'mcp:get-dom', handler: handleToolAliasRoute },
};
```

**Message route pattern** (lines 80-108):
```javascript
const MCP_PHASE199_MESSAGE_ROUTES = {
  'mcp:get-tabs': { routeFamily: 'read-only', helperName: '_handleGetTabs' },
  'mcp:get-site-guides': { routeFamily: 'read-only', handler: handleGetSiteGuidesRoute },
  'mcp:get-page-snapshot': { routeFamily: 'read-only', handler: handleGetPageSnapshotRoute },
  'mcp:start-automation': { routeFamily: 'autopilot', handler: handleStartAutomationRoute },
  'mcp:stop-automation': { routeFamily: 'autopilot', handler: handleStopAutomationRoute },
  'mcp:get-status': { routeFamily: 'autopilot', handler: handleGetStatusRoute },
  'agent:register': { routeFamily: 'agent', handler: handleAgentRegisterRoute },
  'agent:release':  { routeFamily: 'agent', handler: handleAgentReleaseRoute },
  'agent:status':   { routeFamily: 'agent', handler: handleAgentStatusRoute }
};
```

**Contract export pattern** (lines 133-154):
```javascript
function hasMcpToolRoute(tool) {
  return Object.prototype.hasOwnProperty.call(MCP_PHASE199_TOOL_ROUTES, tool);
}

function hasMcpMessageRoute(type) {
  return Object.prototype.hasOwnProperty.call(MCP_PHASE199_MESSAGE_ROUTES, type);
}

function getMcpRouteContracts() {
  return {
    toolRoutes: Object.fromEntries(Object.entries(MCP_PHASE199_TOOL_ROUTES).map(([tool, route]) => [
      tool,
      { routeFamily: route.routeFamily, handler: route.handler.name, ...(route.messageType ? { messageType: route.messageType } : {}) }
    ])),
    messageRoutes: Object.fromEntries(Object.entries(MCP_PHASE199_MESSAGE_ROUTES).map(([type, route]) => [
      type,
      { routeFamily: route.routeFamily, ...(route.helperName ? { helperName: route.helperName } : {}), ...(route.handler ? { handler: route.handler.name } : {}) }
    ])),
  };
}
```

**Ownership gate pattern** (lines 240-283):
```javascript
function checkOwnershipGate({ tool, params, payload }) {
  const reg = (typeof globalThis !== 'undefined') ? globalThis.fsbAgentRegistryInstance : null;
  if (!reg) return null;

  const src = (payload && Object.keys(payload).length) ? payload : (params || {});
  const agentId = src.agentId || null;
  const ownershipToken = src.ownershipToken || null;

  if (!agentId || (typeof reg.hasAgent === 'function' && !reg.hasAgent(agentId))) {
    return createMcpOwnershipError('AGENT_NOT_REGISTERED', { requestingAgentId: agentId });
  }

  const tabId = _resolveTabIdForGate(tool, params, payload);
  if (tabId === null) return null;

  if (typeof reg.isOwnedBy === 'function' && !reg.isOwnedBy(tabId, agentId, ownershipToken)) {
    const ownerAgentId = getRegistryOwner(reg, tabId);
    return createMcpOwnershipError('TAB_NOT_OWNED', { ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId });
  }

  return null;
}
```

**Dispatch/error pattern** (lines 379-445):
```javascript
async function dispatchMcpToolRoute({ tool, params = {}, client = null, tab = null, payload = {} }) {
  const route = MCP_PHASE199_TOOL_ROUTES[tool];
  if (!route) {
    return createMcpRouteError(tool, 'tool', MCP_ROUTE_RECOVERY_HINT);
  }

  if (typeof route.handler !== 'function') {
    return createMcpRouteError(tool, route.routeFamily, MCP_ROUTE_RECOVERY_HINT);
  }

  const gateResult = checkOwnershipGate({ tool, params, payload });
  if (gateResult) return gateResult;

  let response = undefined;
  let success = false;
  try {
    response = await route.handler({
      tool,
      params: params || {},
      client,
      tab,
      payload,
      route,
      _mcpMetricsSuppressInner: true
    });
    success = !(response && typeof response === 'object' && response.success === false);
    return response;
  } finally {
    // metrics recorder is fire-and-forget and must not affect dispatch result
  }
}
```

**Stop/status analogs** (lines 1810-1854, 1856-1874):
```javascript
async function handleStopAutomationRoute({ payload, client }) {
  const tab = await getActiveTabFromClient(client).catch(() => null);
  let sessionId = payload && payload.sessionId;
  if (!sessionId) {
    const sessions = getActiveSessionsMap();
    const ids = Array.from(sessions.keys());
    if (ids.length > 0) {
      sessionId = ids[0];
    }
  }

  if (!sessionId) {
    return {
      success: false,
      errorCode: 'session_not_found',
      tool: 'stop_task',
      routeFamily: 'autopilot',
      error: 'No active automation session to stop'
    };
  }

  return callCallbackHandler(
    'handleStopAutomation',
    { action: 'stopAutomation', sessionId },
    tab?.id ? { tab: { id: tab.id } } : {}
  );
}
```

```javascript
async function handleGetStatusRoute({ payload } = {}) {
  const sessions = getActiveSessionsMap();
  const sessionIds = Array.from(sessions.keys());
  const firstSession = sessionIds.length > 0 ? sessions.get(sessionIds[0]) : null;
  return {
    status: 'ready',
    activeSessions: sessions.size,
    sessionIds,
    currentSessionId: sessionIds[0] || null,
    currentTask: firstSession?.task || null,
    currentStartTime: firstSession?.startTime || null,
    currentIterationCount: firstSession?.iterationCount || 0,
    currentMaxIterations: firstSession?.maxIterations || 100,
    currentActionCount: firstSession?.actionHistory?.length || 0
  };
}
```

**Apply to Phase 18:**
- Add all four trigger tool route entries to `MCP_PHASE199_TOOL_ROUTES`.
- If using dedicated message types, add matching `MCP_PHASE199_MESSAGE_ROUTES`.
- Route family should be stable, for example `trigger`.
- Handler functions should be bounded request-response shims that call background trigger helpers; they must not own observer loops or alarm decisions.
- Keep ownership checks at dispatcher/background boundaries and include `trigger_id`, `target_tab_id`, `agent_id`, and `ownershipToken` in route params.

---

### `extension/ws/mcp-bridge-client.js` (service, request-response)

**Analog:** existing background-routed registry dispatch

**Switch message pattern** (lines 397-442):
```javascript
case 'mcp:get-tabs':
  return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

case 'mcp:execute-action':
  return this._handleExecuteAction(payload);

case 'mcp:start-automation':
  return this._handleStartAutomation(payload, id);

case 'mcp:stop-automation':
  return this._handleStopAutomation(payload);

case 'mcp:get-status':
  return this._handleGetStatus();

case 'mcp:get-site-guides':
  return this._handleGetSiteGuides(payload);

case 'mcp:get-page-snapshot':
  return this._handleGetPageSnapshot(payload);
```

**Background registry route dispatch pattern** (lines 843-889):
```javascript
async _handleExecuteBackground(tab, payload, toolDef, routeParams) {
  const toolName = payload.tool;
  const params = payload.params || {};

  if (!routeParams) {
    routeParams = {
      ...params,
      ...(payload && payload.agentId ? { agentId: payload.agentId } : {}),
      ...(payload && payload.ownershipToken ? { ownershipToken: payload.ownershipToken } : {}),
      ...(payload && payload.connectionId ? { connectionId: payload.connectionId } : {})
    };
  }

  if (toolName === 'execute_js') {
    return this._handleExecuteJS(tab, params);
  }

  if (typeof hasMcpToolRoute === 'function' && hasMcpToolRoute(toolName)) {
    return dispatchMcpToolRoute({ tool: payload.tool, params: routeParams, client: this, tab, payload });
  }

  if (typeof createMcpRouteError === 'function') {
    return createMcpRouteError(toolName, 'background', `Unsupported MCP background route: ${toolName}`);
  }
}
```

**Apply to Phase 18:**
- If trigger tools arrive through `mcp:execute-action`, the existing `hasMcpToolRoute()` path is the closest analog.
- If the MCP registrar sends new message types directly, add switch cases that call `dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id })`.
- Preserve the route-unavailable failure behavior for any background-routed registry tool lacking a dispatcher route.

---

### `extension/background.js` (controller, event-driven)

**Analog:** existing trigger runtime orchestration and alarm/value-report handlers

**Import order pattern** (lines 35-50):
```javascript
// Phase 14 Plan 03 (v0.11.0): trigger survivability modules.
try { importScripts('utils/value-extractor.js'); } catch (e) { console.error('[FSB] Failed to load value-extractor.js:', e.message); }
try { importScripts('utils/trigger-store.js'); } catch (e) { console.error('[FSB] Failed to load trigger-store.js:', e.message); }
try { importScripts('utils/trigger-manager.js'); } catch (e) { console.error('[FSB] Failed to load trigger-manager.js:', e.message); }
try { importScripts('utils/trigger-lifecycle.js'); } catch (e) { console.error('[FSB] Failed to load trigger-lifecycle.js:', e.message); }
```

**Ownership validation pattern** (lines 3416-3490):
```javascript
function fsbTriggerValidateRefreshPollOwnership(snap) {
  const tabId = Number(snap && snap.target_tab_id);
  const rawAgentId = snap && snap.agent_id;
  const agentId = (typeof rawAgentId === 'string') ? rawAgentId.trim() : '';

  if (!Number.isFinite(tabId)) {
    return Object.assign({ ok: false, code: 'INVALID_TAB_ID' }, base);
  }
  if (!agentId) {
    return Object.assign({ ok: false, code: 'AGENT_NOT_REGISTERED' }, base, {
      requestedTabId: tabId,
      requestingAgentId: agentId || null
    });
  }

  const registry = globalThis && globalThis.fsbAgentRegistryInstance;
  if (!registry) {
    return Object.assign({ ok: false, code: 'AGENT_REGISTRY_UNAVAILABLE' }, base, {
      requestedTabId: tabId,
      requestingAgentId: agentId
    });
  }

  const owner = (typeof registry.getOwner === 'function') ? registry.getOwner(tabId) : null;
  if (owner && owner !== agentId) {
    return { ok: false, code: 'TAB_NOT_OWNED', ownerAgentId: owner, requestedTabId: tabId, requestingAgentId: agentId };
  }

  if (typeof registry.isOwnedBy === 'function' && registry.isOwnedBy(tabId, agentId, snapshotOwnershipToken) === false) {
    return { ok: false, code: 'TAB_NOT_OWNED', ownerAgentId: owner || null, requestedTabId: tabId, requestingAgentId: agentId };
  }

  return { ok: true, tabId, agentId, registry };
}
```

**Observe start/stop pattern** (lines 3503-3570):
```javascript
function fsbTriggerObserveMessage(snap) {
  return {
    action: 'triggerObserveStart',
    trigger_id: fsbTriggerSnapshotId(snap),
    selector: snap.selector,
    extract: fsbTriggerExtractKind(snap),
    attrName: fsbTriggerAttrName(snap)
  };
}

async function fsbTriggerStartObserveForSnapshot(snap, reason) {
  const triggerId = fsbTriggerSnapshotId(snap);
  const tabId = Number(snap && snap.target_tab_id);
  if (!triggerId || !Number.isFinite(tabId) || !snap.selector) {
    return { ok: false, reason: 'invalid_snapshot' };
  }
  await ensureContentScriptInjected(tabId);
  const observeResult = await fsbTriggerSendTabMessage(tabId, fsbTriggerObserveMessage(snap));
  const pulseResult = await fsbTriggerSendTabMessage(tabId, {
    action: 'triggerPulseStart',
    selector: snap.selector,
    reason: reason || 'trigger-watch'
  });
  await fsbTriggerArmObserveWatchdog(triggerId);
  return { ok: observeResult.ok !== false, observe: observeResult, pulse: pulseResult };
}

async function fsbTriggerStopObserveForSnapshot(snap) {
  const triggerId = fsbTriggerSnapshotId(snap);
  const tabId = Number(snap && snap.target_tab_id);
  if (!triggerId || !Number.isFinite(tabId)) return;
  await fsbTriggerSendTabMessage(tabId, { action: 'triggerObserveStop', trigger_id: triggerId });
  await fsbTriggerSendTabMessage(tabId, { action: 'triggerPulseStop', trigger_id: triggerId });
}
```

**Refresh-poll tick pattern** (lines 3680-3800):
```javascript
async function fsbTriggerRunRefreshPollTick(triggerId, snap) {
  if (!fsbTriggerIsRefreshPollSnapshot(snap)) {
    return { ok: true, ignored: true };
  }

  const ownership = fsbTriggerValidateRefreshPollOwnership(snap);
  if (!ownership || ownership.ok !== true) {
    return fsbTriggerMarkRefreshPollAttention(
      triggerId,
      snap,
      'ownership_failed',
      ownership || { code: 'OWNERSHIP_VALIDATION_FAILED' }
    );
  }

  await chrome.tabs.reload(tabId);
  await fsbTriggerWaitForRefreshPollReady(tabId);
  readResult = await fsbTriggerSendRefreshPollRead(tabId, snap);

  const value = readResult.value;
  snap.reported_value = (typeof value.text === 'string')
    ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
    : snap.last_value;
  snap.last_reported_at = now;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);

  seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
    name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
  });

  return { ok: true, action: 'evaluated', result: seamResult };
}
```

**Value-report pattern** (lines 3852-3900):
```javascript
async function fsbTriggerHandleValueReport(request, sender) {
  const triggerId = request && typeof request.trigger_id === 'string' ? request.trigger_id : null;
  if (!triggerId) return { ok: false, reason: 'invalid_trigger_id' };

  const snap = await FsbTriggerStore.readSnapshot(triggerId);
  if (!snap || snap.status !== 'armed') {
    return { ok: true, ignored: true };
  }

  const value = request.value && typeof request.value === 'object' ? request.value : {};
  const now = Date.now();
  snap.reported_value = (typeof value.text === 'string')
    ? value.text.slice(0, FSB_TRIGGER_REPORTED_TEXT_MAX)
    : snap.last_value;
  snap.last_reported_at = now;
  await FsbTriggerStore.writeSnapshot(triggerId, snap);

  let seamResult = await FsbTriggerLifecycle.handleTriggerAlarm({
    name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId
  });

  if (seamResult && seamResult.action === 'fired') {
    await fsbTriggerClearObserveWatchdog(triggerId);
    await fsbTriggerStopObserveForSnapshot(Object.assign({}, snap, {
      target_tab_id: Number.isFinite(senderTabId) ? senderTabId : snap.target_tab_id
    }));
  }

  return { ok: true, result: seamResult };
}
```

**Alarm dispatch pattern** (lines 13966-13995):
```javascript
if (typeof FsbTriggerLifecycle !== 'undefined'
    && alarm
    && typeof alarm.name === 'string'
    && alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) {
  try {
    const refreshPoll = await fsbTriggerHandleRefreshPollAlarm(alarm);
    if (refreshPoll && refreshPoll.handled) return;
    await FsbTriggerLifecycle.handleTriggerAlarm(alarm);
  } catch (err) {
    console.warn('[FSB TRG] handleTriggerAlarm failed (non-blocking):', err && err.message);
  }
  return;
}

if (alarm
    && typeof alarm.name === 'string'
    && alarm.name.startsWith(FSB_TRIGGER_OBSERVE_WATCHDOG_PREFIX)) {
  try {
    await fsbTriggerHandleObserveWatchdog(alarm);
  } catch (err) {
    console.warn('[FSB TRG] live-observe watchdog failed (non-blocking):', err && err.message);
  }
  return;
}
```

**Manager arm pattern** from `extension/utils/trigger-manager.js` (lines 634-687):
```javascript
function armTrigger(spec) {
  return _withArmLock(async function() {
    var safeSpec = (spec && typeof spec === 'object') ? spec : {};
    var armed = (store && typeof store.listArmedSnapshots === 'function')
      ? await store.listArmedSnapshots()
      : [];
    var active = Array.isArray(armed) ? armed.length : 0;
    var cap = getCap();
    if (active >= cap) {
      return { error: 'TRIGGER_CAP_REACHED', code: 'TRIGGER_CAP_REACHED', cap: cap, active: active };
    }

    var snapshot = {
      trigger_id: safeSpec.trigger_id,
      status: 'armed',
      condition: safeSpec.condition,
      baseline: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
      last_value: (safeSpec.baseline === undefined) ? null : safeSpec.baseline,
      was_satisfied: false,
      selector: safeSpec.selector,
      target_tab_id: safeSpec.target_tab_id,
      agent_id: safeSpec.agent_id,
      ownership_token: (typeof ownershipToken === 'string' && ownershipToken) ? ownershipToken : undefined,
      armed_at: now,
      deadline_at: now + ttl
    };

    var armedResult = await lifecycle.armTrigger(snapshot);
    var merged = (armedResult && typeof armedResult === 'object') ? armedResult : {};
    merged.trigger_id = snapshot.trigger_id;
    return merged;
  });
}
```

**Lifecycle clear/status source pattern** from `extension/utils/trigger-lifecycle.js` (lines 301-310, 346-377):
```javascript
async function clearTrigger(triggerId) {
  if (!triggerId || typeof triggerId !== 'string') {
    return { ok: false, reason: 'invalid_trigger_id' };
  }
  var store = _getStore();
  if (store) {
    await store.deleteSnapshot(triggerId);
  }
  await clearAlarm(TRIGGER_ALARM_PREFIX + triggerId);
  return { ok: true, cleared: true };
}
```

```javascript
async function handleTriggerAlarm(alarm) {
  var snap = await store.readSnapshot(triggerId);
  if (!snap) {
    return { ok: true, action: 'noop_no_entry' };
  }

  if (snap.status === 'fired' || snap.status === 'stopped') {
    return { ok: true, action: 'noop_terminal' };
  }
}
```

**Store projection pattern** from `extension/utils/trigger-store.js` (lines 145-180):
```javascript
async function readSnapshot(triggerId) {
  if (!triggerId || typeof triggerId !== 'string') return null;
  var envelope = await _readEnvelope();
  return envelope.records[triggerId] || null;
}

async function listArmedSnapshots() {
  var envelope = await _readEnvelope();
  return Object.keys(envelope.records)
    .map(function(k) { return envelope.records[k]; })
    .filter(function(s) { return s && s.status === 'armed'; });
}

async function hydrate() {
  return await _readEnvelope();
}
```

**Apply to Phase 18:**
- Add bounded background handlers near existing trigger helpers, not inside MCP server code.
- `trigger`: resolve/bind owner, read baseline through `triggerRead` or supplied initial read path, call `FsbTriggerManager.armTrigger(spec)`, read the stored snapshot, then start live observe or schedule refresh-poll via existing helpers/lifecycle.
- `stop_trigger`: read `FsbTriggerStore.readSnapshot(trigger_id)`, validate ownership, call `fsbTriggerStopObserveForSnapshot(snapshot)`, call `fsbTriggerClearObserveWatchdog(trigger_id)`, then call `FsbTriggerLifecycle.clearTrigger(trigger_id)`. Missing/terminal should return success with `stopped:false`.
- `get_trigger_status`: read `FsbTriggerStore.readSnapshot(trigger_id)` and project fields from snapshot plus `Date.now()` elapsed/remaining values.
- `list_triggers`: call `FsbTriggerStore.hydrate()` and enumerate records. Default to active and attention states; do not reconstruct from alarm names.

---

## Shared Patterns

### Authentication and Ownership

**Source:** `extension/ws/mcp-tool-dispatcher.js`, `extension/utils/agent-registry.js`, `extension/background.js`

**Apply to:** dispatcher routes, background handlers, stop/status/list projections

```javascript
// extension/utils/agent-registry.js lines 573-578
AgentRegistry.prototype.isOwnedBy = function(tabId, agentId, ownershipToken) {
  if (this._tabOwners.get(tabId) !== agentId) return false;
  if (ownershipToken === undefined) return true;
  var meta = this._tabMetadata.get(tabId);
  if (!meta) return false;
  return meta.ownershipToken === ownershipToken;
};
```

```javascript
// extension/ws/mcp-tool-dispatcher.js lines 175-183
function createMcpOwnershipError(code, extra = {}) {
  return {
    success: false,
    code,
    errorCode: code,
    error: code,
    ...extra
  };
}
```

### Error Handling

**Source:** `extension/ws/mcp-tool-dispatcher.js`, `mcp/src/tools/manual.ts`

**Apply to:** all new MCP/background handlers

```javascript
// extension/ws/mcp-tool-dispatcher.js lines 110-130
function createMcpRouteError(tool, routeFamily, recoveryHint = MCP_ROUTE_RECOVERY_HINT, extra = {}) {
  return {
    success: false,
    errorCode: extra.errorCode || 'mcp_route_unavailable',
    tool,
    routeFamily,
    recoveryHint: extra.recoveryHint || recoveryHint || MCP_ROUTE_RECOVERY_HINT,
    error: extra.error || `Missing direct MCP route for ${tool}`,
    ...extra
  };
}
```

```typescript
// mcp/src/tools/manual.ts lines 193-197
} catch (err: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err);
  console.error(`[FSB Manual] ${toolName}: EXCEPTION - ${errMsg}`);
  return mapFSBError({ success: false, error: errMsg });
}
```

### Content Message Verbs

**Source:** `extension/content/messaging.js`

**Apply to:** `extension/background.js` trigger arm/stop/read helpers

```javascript
// extension/content/messaging.js lines 1268-1281
case 'triggerObserveStart':
  const result = FSB.triggerObserve.start(
    request.trigger_id,
    request.selector,
    request.extract,
    request.attrName || request.attribute
  );
  sendResponse(result || { ok: false, reason: 'no_result' });
  return true;
```

```javascript
// extension/content/messaging.js lines 1288-1297
case 'triggerObserveStop':
  FSB.triggerObserve.stop(request.trigger_id);
  sendResponse({ success: true });
  return true;
```

```javascript
// extension/content/messaging.js lines 1303-1336
case 'triggerRead':
  const blockedPage = fsbClassifyTriggerReadBlockedPage();
  if (blockedPage) {
    sendResponse({ success: false, ok: false, code: 'TRIGGER_PAGE_BLOCKED' });
    return;
  }
  const selector = request.selector;
  const leaf = selector ? FSB.querySelectorWithShadow(selector) : null;
  if (!leaf) {
    sendResponse({ success: false, ok: false, code: 'ELEMENT_NOT_FOUND', reason: 'element_not_found', selector });
    return;
  }
  const value = FSB.triggerObserve.readValue(leaf, request.extract, request.attrName || request.attribute);
  sendResponse({ success: true, ok: true, value });
  return true;
```

```javascript
// extension/content/messaging.js lines 1343-1382
case 'triggerPulseStart':
  const el = FSB.querySelectorWithShadow(request.selector);
  if (el) {
    FSB.actionGlowOverlay.showPulse(el);
    sendResponse({ success: true });
  }
  return true;

case 'triggerPulseStop':
  FSB.actionGlowOverlay.clearPulse();
  sendResponse({ success: true });
  return true;
```

### Provider Visibility

**Source:** `extension/ai/agent-loop.js`, `extension/ai/tool-use-adapter.js`

**Apply to:** provider/autopilot visibility test assertions

```javascript
// extension/ai/agent-loop.js lines 651-656
function getPublicTools() {
  return _al_TOOL_REGISTRY.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}
```

```javascript
// extension/ai/tool-use-adapter.js lines 37-80
function formatToolsForProvider(tools, provider) {
  function cleanSchema(schema) {
    if (!schema) return { type: 'object', properties: {} };
    const cleaned = { ...schema };
    if (Array.isArray(cleaned.required) && cleaned.required.length === 0) {
      delete cleaned.required;
    }
    return cleaned;
  }

  switch (provider) {
    case 'anthropic':
      return tools.map(t => ({ name: t.name, description: t.description, input_schema: cleanSchema(t.inputSchema) }));
    case 'gemini':
      return [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: cleanSchema(t.inputSchema) })) }];
    default:
      return tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: cleanSchema(t.inputSchema) } }));
  }
}
```

## Test Patterns

### `tests/tool-definitions-parity.test.js`

**Analog:** byte identity plus additive schema checks

```javascript
// lines 43-49
const extBuf = fs.readFileSync(extPath);
const mcpBuf = fs.readFileSync(mcpPath);
check(
  Buffer.compare(extBuf, mcpBuf) === 0,
  'tool-definitions.js and tool-definitions.cjs are byte-identical (' + extBuf.length + ' bytes each)'
);
```

```javascript
// lines 68-76
const td = require('../mcp/ai/tool-definitions.cjs');
const readTools = ['read_page', 'get_text', 'get_attribute', 'get_dom_snapshot', 'get_page_snapshot', 'read_sheet'];
readTools.forEach(function(name) {
  const t = td.getToolByName(name);
  check(!!t, 'read tool ' + name + ' exists in TOOL_REGISTRY');
  if (t) {
    check(!!t.inputSchema.properties.tab_id, name + ' has tab_id in inputSchema.properties');
    check(!(t.inputSchema.required || []).includes('tab_id'), name + ' tab_id is OPTIONAL (not in required)');
  }
});
```

**Apply:** add explicit checks that the four trigger tools exist, old tools are still present, `stop_trigger`/status/list are `_readOnly: true`, and `trigger` has no duplicate MCP-only schema.

### `tests/visual-session-schema-lock.test.js`

**Analog:** pinned classification lists and schema field assertions

```javascript
// lines 48-64
const VISUAL_SESSION_ACTION_TOOLS = [
  'click', 'type_text', 'navigate', 'scroll', 'drag', 'select_option',
  'press_key', 'press_enter', 'drag_drop', 'hover', 'focus', 'clear_input',
  'check_box', 'drop_file', 'click_and_hold', 'double_click', 'right_click',
  'click_at', 'scroll_at', 'double_click_at', 'drag_variable_speed',
  'set_attribute', 'insert_text', 'search', 'refresh', 'go_back',
  'go_forward', 'open_tab', 'close_tab', 'switch_tab', 'execute_js',
  'select_text_range', 'scroll_to_top', 'scroll_to_bottom',
  'scroll_to_element', 'fill_sheet'
];

const VISUAL_SESSION_READ_ONLY_TOOLS = [
  'read_sheet', 'read_page', 'get_text', 'get_attribute',
  'get_dom_snapshot', 'list_tabs', 'get_page_snapshot', 'get_site_guide',
  'search_memory', 'report_progress', 'complete_task', 'partial_task',
  'fail_task', 'wait_for_element', 'wait_for_stable'
];
```

```javascript
// lines 107-128
for (const name of VISUAL_SESSION_READ_ONLY_TOOLS) {
  const tool = getToolByName(name);
  check(tool._readOnly === true, name + ': _readOnly is true (read-only classification)');
  const props = (tool.inputSchema && tool.inputSchema.properties) || {};
  check(!props.visual_reason, name + ': inputSchema.properties does NOT contain visual_reason');
  check(!props.client, name + ': inputSchema.properties does NOT contain client');
  check(!props.is_final, name + ': inputSchema.properties does NOT contain is_final');
}

check(getReadOnlyTools().length === 15,
  'getReadOnlyTools() returns exactly 15 entries');
```

**Apply:** update pinned counts and lists so trigger companions are locked as no-visual-field bypass tools. If `trigger` stays action-like, pin whether it requires visual fields or is registered by a separate trigger registrar.

### `tests/mcp-tool-routing-contract.test.js`

**Analog:** direct route and background registry coverage

```javascript
// lines 32-55
const requiredPublicRoutes = [
  'navigate',
  'go_back',
  'go_forward',
  'refresh',
  'open_tab',
  'switch_tab',
  'close_tab',
  'list_tabs',
  'start_visual_session',
  'end_visual_session',
  'run_task',
  'stop_task',
  'get_task_status',
  'get_site_guide',
  'list_sessions',
  'get_session_detail',
  'get_logs',
  'search_memory',
  'get_memory_stats',
  'read_page',
  'get_dom_snapshot',
  'get_page_snapshot'
];
```

```javascript
// lines 257-303
const expectedTools = unique(groups.flatMap(group => groupDefinitions[group].tools));
for (const toolName of expectedTools) {
  const hasRoute = typeof hasMcpToolRoute === 'function'
    ? safeCall(hasMcpToolRoute, [toolName], `hasMcpToolRoute(${toolName})`)
    : false;
  assert(hasRoute === true, `Missing direct MCP route for tool ${toolName}`);
}

const backgroundTools = TOOL_REGISTRY
  .filter(tool => tool._route === 'background')
  .map(tool => tool.name);

for (const toolName of backgroundTools) {
  if (phase199VaultExclusions.has(toolName)) continue;
  const hasRoute = typeof hasMcpToolRoute === 'function'
    ? safeCall(hasMcpToolRoute, [toolName], `hasMcpToolRoute(${toolName})`)
    : false;
  assert(hasRoute === true, `background TOOL_REGISTRY tool ${toolName} has a direct route contract`);
}
```

**Apply:** add trigger route group or extend an existing group so all four tools must return `hasMcpToolRoute(name) === true`. The background registry loop should also fail if a new background trigger tool lacks a route.

### `tests/mcp-tool-smoke.test.js`

**Analog:** packaged handler, bridge message, direct/queue classification assertions

```javascript
// lines 67-123
const runtimeModule = await loadBuildModule('runtime.js');
const readOnlyModule = await loadBuildModule(pathJoin('tools', 'read-only.js'));
const manualModule = await loadBuildModule(pathJoin('tools', 'manual.js'));
const autopilotModule = await loadBuildModule(pathJoin('tools', 'autopilot.js'));

const harness = createToolHarness({
  bridgeResponses: {
    'mcp:get-tabs': { success: true, tabs: [{ id: 7, active: true, url: 'https://example.com' }] },
    'mcp:execute-action': ({ payload }) => ({ success: true, executed: payload.tool }),
    'mcp:start-automation': { success: true, sessionId: 'smoke-session', status: 'started' },
    'mcp:stop-automation': { success: true, stopped: true },
  },
});

const agentScope = await loadAgentScope();
readOnlyModule.registerReadOnlyTools(harness.server, harness.bridge, harness.queue, agentScope);
manualModule.registerManualTools(harness.server, harness.bridge, harness.queue, agentScope);
autopilotModule.registerAutopilotTools(harness.server, harness.bridge, harness.queue, agentScope);
```

```javascript
// lines 242-247
const stopTaskCall = await invokeTool(harness, 'stop_task');
assertDeepEqual(
  stopTaskCall && stopTaskCall.message,
  { type: 'mcp:stop-automation', payload: { agentId: 'agent_test_smoke', ownershipToken: 'token_test_smoke' } },
  'stop_task routes through mcp:stop-automation with agentId payload (Phase 238 includes agentId; Phase 240 strengthens with ownershipToken)',
);
```

```javascript
// lines 306-318
const DIRECT_TOOLS = new Set(['stop_task', 'start_visual_session', 'end_visual_session']);
for (const toolName of requiredSmokeTools.filter((name) => !DIRECT_TOOLS.has(name))) {
  assert(harness.queueCalls.includes(toolName), `${toolName} passes through the shared queue surface`);
}
assert(!harness.queueCalls.includes('stop_task'), 'stop_task stays direct so cancellation does not wait behind queued work');
```

**Apply:** add four trigger smoke tools, bridge responses for their message types, and queue/direct assertions. `stop_trigger` should be asserted direct or read-only bypass, not ordinary mutation queue.

### `tests/mcp-smoke-harness.js`

**Analog:** queue/bridge call recorder

```javascript
// lines 325-370
function createToolHarness(options = {}) {
  const handlers = new Map();
  const bridgeCalls = [];
  const queueCalls = [];

  const bridge = {
    isConnected: options.connected !== false,
    async sendAndWait(message, sendOptions) {
      bridgeCalls.push({ message, options: sendOptions });
      if (message && message.type === 'agent:register') {
        return {
          success: true,
          agentId: 'agent_test_smoke',
          agentIdShort: 'agent_test',
          ownershipTokens: {},
          ownershipToken: 'token_test_smoke'
        };
      }
      return { success: true, type: message.type, payload: message.payload };
    },
  };

  const queue = {
    async enqueue(toolName, fn) {
      queueCalls.push(toolName);
      return fn();
    },
  };
```

**Apply:** reuse `queueCalls` and `bridgeCalls` rather than building a second smoke harness.

### `tests/trigger-tool-dispatcher.test.js` (new)

**Analog:** `tests/trigger-lifecycle.test.js`, `tests/trigger-store.test.js`, `tests/trigger-refresh-poll.test.js`

**Fresh module harness pattern** from `tests/trigger-lifecycle.test.js` (lines 162-198):
```javascript
function setupSeamHarness() {
  const chromeMock = createChromeMock();
  global.chrome = chromeMock;

  delete require.cache[STORE_MODULE_PATH];
  delete require.cache[LIFECYCLE_MODULE_PATH];
  delete require.cache[MANAGER_MODULE_PATH];
  delete require.cache[EXTRACTOR_MODULE_PATH];

  const store = require(STORE_MODULE_PATH);
  const extractor = require(EXTRACTOR_MODULE_PATH);
  const lc = require(LIFECYCLE_MODULE_PATH);
  const manager = require(MANAGER_MODULE_PATH);

  return { chromeMock, store, extractor, lc, manager };
}
```

**Store projection pattern** from `tests/trigger-store.test.js` (lines 128-179):
```javascript
await mod.writeSnapshot('a', makeSnapshot({ trigger_id: 'a', status: 'armed' }));
await mod.writeSnapshot('b', makeSnapshot({ trigger_id: 'b', status: 'fired' }));
await mod.writeSnapshot('c', makeSnapshot({ trigger_id: 'c', status: 'stopped' }));
const armed = await mod.listArmedSnapshots();
assert.strictEqual(armed.length, 1, 'exactly one armed snapshot');
assert.strictEqual(armed[0].trigger_id, 'a', 'armed snapshot is trigger a');

await mod.writeSnapshot('one', makeSnapshot({ trigger_id: 'one' }));
await mod.writeSnapshot('two', makeSnapshot({ trigger_id: 'two' }));
const env = await mod.hydrate();
assert.strictEqual(env.v, 1, 'envelope version is 1');
assert.deepStrictEqual(Object.keys(env.records).sort(), ['one', 'two'], 'records keys are one + two');
```

**Background source invariant pattern** from `tests/trigger-lifecycle.test.js` (lines 792-812):
```javascript
const bgPath = path.resolve(__dirname, '..', 'extension', 'background.js');
const src = fs.readFileSync(bgPath, 'utf8');
const valueBlockStart = src.indexOf("case 'triggerValueChanged':");
const valueBlockEnd = src.indexOf("case 'domStreamSnapshot':", valueBlockStart);
const valueBlock = valueBlockStart >= 0 && valueBlockEnd > valueBlockStart
  ? src.slice(valueBlockStart, valueBlockEnd)
  : '';

check(src.includes("'content/trigger-observe.js'"), 'U.1 trigger-observe.js registered in CONTENT_SCRIPT_FILES');
check(valueBlock.includes("case 'triggerValueReport':"), 'U.3 dual value-report action names accepted');
check(src.includes('reported_value'), 'U.5 reported_value is written before seam dispatch');
check(src.includes('FsbTriggerLifecycle.handleTriggerAlarm'), 'U.7 value report drives existing lifecycle seam');
```

**Refresh-poll order assertion pattern** from `tests/trigger-refresh-poll.test.js` (lines 429-448, 491-498):
```javascript
check(/async\s+function\s+fsbTriggerSendRefreshPollRead\s*\(/.test(src),
  'J.1 fsbTriggerSendRefreshPollRead helper exists');
check(/async\s+function\s+fsbTriggerRunRefreshPollTick\s*\(/.test(src),
  'J.2 fsbTriggerRunRefreshPollTick helper exists');
check(validateIdx >= 0 && reloadIdx >= 0 && validateIdx < reloadIdx,
  'J.3 ownership validation appears before chrome.tabs.reload');
check(reportedIdx >= 0 && handleIdx >= 0 && reportedIdx < handleIdx,
  'J.8 reported_value is staged before handleTriggerAlarm');
check(!/status\s*=\s*['"]fired['"]/.test(block) && !/status\s*:\s*['"]fired['"]/.test(block),
  'J.10 refresh-poll background helpers do not set fired status');
```

```javascript
check(/triggerPulseStart/.test(block), 'M.1 refresh-poll helper restarts triggerPulseStart');
check(handleIdx >= 0 && latestIdx >= 0 && handleIdx < latestIdx,
  'M.3 latest snapshot is re-read after handleTriggerAlarm');
check(armedIdx >= 0 && pulseIdx >= 0 && armedIdx < pulseIdx,
  'M.4 status armed check appears before pulse restart');
```

**Apply:** create focused tests for:
- arm delegates to `FsbTriggerManager.armTrigger(spec)` and starts watcher based on stored snapshot watch mode.
- stop reads snapshot first, sends `triggerObserveStop` and `triggerPulseStop`, clears watchdog, then calls `clearTrigger`.
- missing/terminal stop returns successful idempotent response.
- status/list project from store snapshots, including `needs_attention` and `blocked`.
- cross-agent stop/status/list reject using snapshot owner fields.

## No Analog Found

All inferred files have close in-repo analogs. If the planner creates a separate projection helper such as `extension/utils/trigger-status.js`, use `extension/utils/trigger-store.js` for storage reads and `extension/utils/trigger-lifecycle.js` for dual-export IIFE style; there is no dedicated status-projection module today.

## Metadata

**Analog search scope:** `extension/ai`, `extension/ws`, `extension/utils`, `extension/content`, `mcp/src`, `mcp/ai`, `tests`
**Files scanned:** 24 source/test files plus phase context and research
**Pattern extraction date:** 2026-06-16

