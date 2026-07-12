'use strict';

// In Chrome extension importScripts context, TOOL_REGISTRY and getToolByName
// are globals from ai/tool-definitions.js. In Node.js/tests, fall back to require().
var _mcp_defs = (typeof TOOL_REGISTRY !== 'undefined')
  ? { TOOL_REGISTRY, getToolByName }
  : (typeof require !== 'undefined' ? require('../ai/tool-definitions.js') : {});
var _mcp_getToolByName = _mcp_defs.getToolByName;

// Phase 245 D-07: global toggle for change_report emission. Hydrated from
// chrome.storage.local.fsbChangeReportsEnabled at module load and refreshed
// via chrome.storage.onChanged. Default true. When false, the dispatcher
// skips harvest instrumentation entirely (zero overhead).
let fsbChangeReportsEnabled = true;
try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
      && typeof chrome.storage.local.get === 'function') {
    chrome.storage.local.get('fsbChangeReportsEnabled', (data) => {
      try {
        const v = data && data.fsbChangeReportsEnabled;
        if (typeof v === 'boolean') fsbChangeReportsEnabled = v;
      } catch (_e) { /* hydration best-effort */ }
    });
    if (chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
      chrome.storage.onChanged.addListener((changes, area) => {
        try {
          if (area === 'local' && changes && Object.prototype.hasOwnProperty.call(changes, 'fsbChangeReportsEnabled')) {
            const nv = changes.fsbChangeReportsEnabled.newValue;
            if (typeof nv === 'boolean') fsbChangeReportsEnabled = nv;
          }
        } catch (_e) { /* listener best-effort */ }
      });
    }
  }
} catch (_e) { /* chrome.storage unavailable in test harness; default stays true */ }

function _getChangeReportsEnabled() { return fsbChangeReportsEnabled; }
function _setChangeReportsEnabledForTest(v) { fsbChangeReportsEnabled = !!v; }
var _mcp_visual_defs = (typeof MCPVisualSessionUtils !== 'undefined')
  ? MCPVisualSessionUtils
  : (typeof require !== 'undefined' ? require('../utils/mcp-visual-session.js') : {});
var _mcp_normalizeVisualClientLabel = _mcp_visual_defs.normalizeMcpVisualClientLabel;
var _mcp_getAllowedVisualClientLabels = _mcp_visual_defs.getAllowedMcpVisualClientLabels;

const MCP_NAVIGATION_RECOVERY_TOOLS = ['navigate', 'open_tab', 'switch_tab', 'list_tabs'];
const MCP_ROUTE_RECOVERY_HINT = 'Use an explicitly supported MCP route or a navigation recovery tool.';
const MCP_PHASE199_EXCLUDED_BACKGROUND_TOOLS = new Set(['fill_credential', 'fill_payment_method']);
const MCP_CLAIMABLE_RECOVERY_TOOLS = new Set(['navigate', 'switch_tab']);

// Quick task 260524-7n9 -- storage key that mirrors the per-agent client-label
// cache (_agentClientLabelCache, declared further below) to chrome.storage.session
// so popup + sidepanel UI surfaces (different contexts from the SW where the
// in-memory cache lives) can read the canonical MCP client name for the chip.
// Map shape: { [agentId: string]: clientLabel: string }, e.g.
//   { 'agent_aaa': 'Claude', 'agent_bbb': 'Codex' }.
// Persistence is fire-and-forget on the dispatcher hot path; the helper
// _persistAgentClientLabel below catches every failure mode.
const FSB_AGENT_CLIENT_LABELS_KEY = 'fsbAgentClientLabels';

const MCP_PHASE199_TOOL_ROUTES = {
  navigate: { routeFamily: 'browser', handler: handleNavigateRoute },
  go_back: { routeFamily: 'browser', handler: handleNavigationHistoryRoute },
  go_forward: { routeFamily: 'browser', handler: handleNavigationHistoryRoute },
  refresh: { routeFamily: 'browser', handler: handleNavigationHistoryRoute },
  open_tab: { routeFamily: 'browser', handler: handleOpenTabRoute },
  switch_tab: { routeFamily: 'browser', handler: handleSwitchTabRoute },
  close_tab: { routeFamily: 'browser', handler: handleCloseTabRoute },
  list_tabs: { routeFamily: 'browser', handler: handleListTabsRoute },
  start_visual_session: { routeFamily: 'visual-session', messageType: 'mcp:start-visual-session', handler: handleToolAliasRoute },
  end_visual_session: { routeFamily: 'visual-session', messageType: 'mcp:end-visual-session', handler: handleToolAliasRoute },
  execute_js: { routeFamily: 'browser', handler: handleExecuteJsRoute },
  upload_file: { routeFamily: 'browser', handler: handleUploadFileRoute },
  run_task: { routeFamily: 'autopilot', messageType: 'mcp:start-automation', handler: handleToolAliasRoute },
  stop_task: { routeFamily: 'autopilot', messageType: 'mcp:stop-automation', handler: handleToolAliasRoute },
  get_task_status: { routeFamily: 'autopilot', messageType: 'mcp:get-status', handler: handleToolAliasRoute },
  trigger: { routeFamily: 'trigger', messageType: 'mcp:trigger', handler: handleToolAliasRoute },
  stop_trigger: { routeFamily: 'trigger', messageType: 'mcp:stop-trigger', handler: handleToolAliasRoute },
  get_trigger_status: { routeFamily: 'trigger', messageType: 'mcp:get-trigger-status', handler: handleToolAliasRoute },
  list_triggers: { routeFamily: 'trigger', messageType: 'mcp:list-triggers', handler: handleToolAliasRoute },
  get_site_guide: { routeFamily: 'read-only', messageType: 'mcp:get-site-guides', handler: handleToolAliasRoute },
  get_page_snapshot: { routeFamily: 'read-only', messageType: 'mcp:get-page-snapshot', handler: handleToolAliasRoute },
  list_sessions: { routeFamily: 'observability', messageType: 'mcp:list-sessions', handler: handleToolAliasRoute },
  get_session_detail: { routeFamily: 'observability', messageType: 'mcp:get-session', handler: handleToolAliasRoute },
  get_logs: { routeFamily: 'observability', messageType: 'mcp:get-logs', handler: handleToolAliasRoute },
  search_memory: { routeFamily: 'observability', messageType: 'mcp:search-memory', handler: handleToolAliasRoute },
  get_memory_stats: { routeFamily: 'observability', messageType: 'mcp:get-memory', handler: handleToolAliasRoute },
  read_page: { routeFamily: 'read-only', messageType: 'mcp:read-page', handler: handleToolAliasRoute },
  get_dom_snapshot: { routeFamily: 'read-only', messageType: 'mcp:get-dom', handler: handleToolAliasRoute },
  report_progress: { routeFamily: 'task-status', handler: handleReportProgressRoute },
  complete_task: { routeFamily: 'task-status', handler: handleCompleteTaskRoute },
  partial_task: { routeFamily: 'task-status', handler: handlePartialTaskRoute },
  fail_task: { routeFamily: 'task-status', handler: handleFailTaskRoute }
};

const MCP_PHASE199_MESSAGE_ROUTES = {
  'mcp:get-tabs': { routeFamily: 'read-only', helperName: '_handleGetTabs' },
  'mcp:get-diagnostics': { routeFamily: 'diagnostics', handler: handleGetDiagnosticsMessageRoute },
  'mcp:get-site-guides': { routeFamily: 'read-only', handler: handleGetSiteGuidesRoute },
  'mcp:get-page-snapshot': { routeFamily: 'read-only', handler: handleGetPageSnapshotRoute },
  'mcp:get-dom': { routeFamily: 'read-only', helperName: '_handleGetDOM' },
  'mcp:read-page': { routeFamily: 'read-only', helperName: '_handleReadPage' },
  'mcp:start-visual-session': { routeFamily: 'visual-session', handler: handleStartVisualSessionRoute },
  'mcp:end-visual-session': { routeFamily: 'visual-session', handler: handleEndVisualSessionRoute },
  'mcp:start-automation': { routeFamily: 'autopilot', handler: handleStartAutomationRoute },
  'mcp:stop-automation': { routeFamily: 'autopilot', handler: handleStopAutomationRoute },
  'mcp:get-status': { routeFamily: 'autopilot', handler: handleGetStatusRoute },
  'mcp:trigger': { routeFamily: 'trigger', handler: handleTriggerToolMessageRoute },
  'mcp:stop-trigger': { routeFamily: 'trigger', handler: handleTriggerToolMessageRoute },
  'mcp:get-trigger-status': { routeFamily: 'trigger', handler: handleTriggerToolMessageRoute },
  'mcp:list-triggers': { routeFamily: 'trigger', handler: handleTriggerToolMessageRoute },
  'mcp:list-sessions': { routeFamily: 'observability', handler: handleListSessionsMessageRoute },
  'mcp:get-session': { routeFamily: 'observability', handler: handleGetSessionMessageRoute },
  'mcp:get-logs': { routeFamily: 'observability', handler: handleGetLogsMessageRoute },
  'mcp:search-memory': { routeFamily: 'observability', handler: handleSearchMemoryMessageRoute },
  'mcp:get-memory': { routeFamily: 'observability', handler: handleGetMemoryMessageRoute },
  // Phase 28/29 (SURF-01/SURF-02 + CAT D-03): lean two-tool capability surface. capabilities-search
  // is read-only (the owned-tab origin is resolved authoritatively SW-side, un-spoofable; D-11) and
  // returns <=5 ranked schema-on-hit hits. capabilities-invoke now calls the shared
  // FsbCapabilityRouter.invoke(...) -- the one engine both front doors hit (INV-02); the old
  // routerless body (getRecipeBySlug -> interpretRecipe -> executeBoundSpec) moved INTO the router's
  // T1b tier. The reroute is INTERNAL-ONLY: these wire names and handler bindings are byte-unchanged,
  // so the frozen INV-01 registry hash never moves. Typed RECIPE_* reasons surface verbatim via the
  // existing errors.ts /^RECIPE_.+$/ passthrough (no errors.ts edit).
  'mcp:capabilities-search': { routeFamily: 'capabilities', handler: handleCapabilitiesSearchMessageRoute },
  'mcp:capabilities-invoke': { routeFamily: 'capabilities', handler: handleCapabilitiesInvokeMessageRoute },
  // Phase 31 (DISC-01, D-01): the user-initiated, time-boxed discovery trigger. An
  // INTERNAL-ONLY message route with SW-side tabId resolution; the consent-gated
  // origin is read from the ACTUAL target tab (ME-02), not from payload.origin -- a
  // supplied payload.origin must match the tab origin or the route rejects. It is a
  // control surface, NOT an MCP tool schema -- it does NOT enter
  // TOOL_REGISTRY / getPublicTools, so the frozen INV-01 tool-definitions parity hash
  // is UNMOVED (gated by tool-definitions-parity + capability-mcp-surface).
  'mcp:capabilities-discover': { routeFamily: 'capabilities', handler: handleCapabilitiesDiscoverMessageRoute },
  // Phase 242: single-step ownership-gated history back. handleBackRoute
  // performs history.length precheck, chrome.tabs.goBack, settle race,
  // 5-status classification, and bindTab parity (D-08). Background-tab
  // compatible: NEVER calls chrome.tabs.update inside the handler body.
  'mcp:go-back':    { routeFamily: 'browser', handler: handleBackRoute },
  // Phase 238: agent identity routes. Resolve through globalThis.fsbAgentRegistryInstance
  // (Phase 237 registry surface). Phase 240 will validate ownership at every dispatch
  // boundary; Phase 238 is structural setup only.
  'agent:register': { routeFamily: 'agent', handler: handleAgentRegisterRoute },
  'agent:release':  { routeFamily: 'agent', handler: handleAgentReleaseRoute },
  'agent:status':   { routeFamily: 'agent', handler: handleAgentStatusRoute }
};

const MCP_TRIGGER_MESSAGE_TO_TOOL_NAME = {
  'mcp:trigger': 'trigger',
  'mcp:stop-trigger': 'stop_trigger',
  'mcp:get-trigger-status': 'get_trigger_status',
  'mcp:list-triggers': 'list_triggers'
};

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

function createMcpInvalidParamsError(tool, error, extra = {}) {
  const routeFamily = extra.routeFamily || 'browser';
  const rest = { ...extra };
  delete rest.routeFamily;
  return createMcpRouteError(tool, routeFamily, 'Provide the required MCP tool parameters and retry.', {
    errorCode: 'mcp_route_invalid_params',
    error,
    ...rest
  });
}

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
    excludedBackgroundTools: Array.from(MCP_PHASE199_EXCLUDED_BACKGROUND_TOOLS),
    navigationRecoveryTools: MCP_NAVIGATION_RECOVERY_TOOLS.slice()
  };
}

// ---- Phase 240 ownership gate ------------------------------------------
// D-06: single chokepoint at dispatchMcpToolRoute. D-07: synchronous; no
// await between gate check and route.handler invocation. The cached
// metadata on the registry record (Phase 240 plan 01) eliminates the need
// for any chrome.tabs.get round-trip at dispatch time. Plain-object error
// pattern matches Phase 238 createMcpRouteError shape.

function _resolveTabIdForGate(tool, params, payload) {
  const tabIdParam = params && Number.isFinite(params.tabId) ? params.tabId : null;
  const tabIdPayload = payload && Number.isFinite(payload.tabId) ? payload.tabId : null;
  if (tabIdParam !== null) return tabIdParam;
  if (tabIdPayload !== null) return tabIdPayload;
  // Tools that create a tab or do not target one: gate skips the tabId arm.
  // (open_tab creates; list_tabs enumerates; navigate without explicit tabId
  // resolves via getActiveTabFromClient inside the handler -- gate cannot
  // resolve sync, so the handler's own bindTab call (D-08) is the backstop.)
  return null;
}

function createMcpOwnershipError(code, extra = {}) {
  return {
    success: false,
    code,
    errorCode: code,
    error: code,
    ...extra
  };
}

function getRegistryOwner(reg, tabId) {
  return (reg && typeof reg.getOwner === 'function') ? (reg.getOwner(tabId) || null) : null;
}

function checkClaimableTargetBeforeSideEffect({ tool, tabId, agentId, ownershipToken }) {
  const reg = (typeof globalThis !== 'undefined') ? globalThis.fsbAgentRegistryInstance : null;
  if (!reg || !Number.isFinite(tabId)) return null;
  if (!agentId || (typeof reg.hasAgent === 'function' && !reg.hasAgent(agentId))) {
    return createMcpOwnershipError('AGENT_NOT_REGISTERED', { requestingAgentId: agentId || null });
  }
  const ownerAgentId = getRegistryOwner(reg, tabId);
  if (ownerAgentId && ownerAgentId !== agentId) {
    return createMcpOwnershipError('TAB_NOT_OWNED', { ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId });
  }
  if (ownerAgentId === agentId
      && typeof reg.isOwnedBy === 'function'
      && !reg.isOwnedBy(tabId, agentId, ownershipToken)) {
    return createMcpOwnershipError('TAB_NOT_OWNED', { ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId });
  }
  return null;
}

async function bindClaimedTabOrError({ tool, tabId, agentId }) {
  if (!agentId || !Number.isFinite(tabId)
      || typeof globalThis === 'undefined'
      || !globalThis.fsbAgentRegistryInstance
      || typeof globalThis.fsbAgentRegistryInstance.bindTab !== 'function') {
    return null;
  }
  try {
    const bindResult = await globalThis.fsbAgentRegistryInstance.bindTab(agentId, tabId);
    if (!bindResult) {
      const ownerAgentId = getRegistryOwner(globalThis.fsbAgentRegistryInstance, tabId);
      return createMcpOwnershipError('TAB_NOT_OWNED', {
        tool,
        ownerAgentId,
        requestedTabId: tabId,
        requestingAgentId: agentId
      });
    }
    return bindResult;
  } catch (error) {
    return createMcpRouteError(tool, 'browser', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'ownership_bind_failed',
      tabId,
      error: error.message || String(error)
    });
  }
}

// Sync reads the gate consumes via the `reg` alias (= globalThis.fsbAgentRegistryInstance):
//   reg.hasAgent, reg.isOwnedBy, reg.getOwner,
//   globalThis.fsbAgentRegistryInstance.getTabMetadata,
//   reg.getAgentWindowId
// All Map.get-shaped lookups; D-07 same-microtask discipline preserved.
function checkOwnershipGate({ tool, params, payload }) {
  const reg = (typeof globalThis !== 'undefined') ? globalThis.fsbAgentRegistryInstance : null;
  if (!reg) return null; // pre-Phase-237 boot or test harness without registry; graceful pass

  const src = (payload && Object.keys(payload).length) ? payload : (params || {});
  const agentId = src.agentId || null;
  const ownershipToken = src.ownershipToken || null;

  if (!agentId || (typeof reg.hasAgent === 'function' && !reg.hasAgent(agentId))) {
    return createMcpOwnershipError('AGENT_NOT_REGISTERED', { requestingAgentId: agentId });
  }

  const tabId = _resolveTabIdForGate(tool, params, payload);
  if (tabId === null) return null; // tab-creating tool or active-tab-resolved-later; agent-only check passed

  // 1. Token-aware ownership (D-04).
  if (typeof reg.isOwnedBy === 'function' && !reg.isOwnedBy(tabId, agentId, ownershipToken)) {
    const ownerAgentId = getRegistryOwner(reg, tabId);
    if (!ownerAgentId && MCP_CLAIMABLE_RECOVERY_TOOLS.has(tool)) {
      // Phase 247: recovery tools may claim unowned tabs. Other-agent tabs
      // still reject above; same-agent token mismatches still reject because
      // ownerAgentId is non-null.
    } else {
      return createMcpOwnershipError('TAB_NOT_OWNED', { ownerAgentId, requestedTabId: tabId, requestingAgentId: agentId });
    }
  }

  // 2. Incognito reject (D-10 / OWN-05).
  const meta = (typeof reg.getTabMetadata === 'function') ? reg.getTabMetadata(tabId) : null;
  if (meta && meta.incognito === true) {
    return createMcpOwnershipError('TAB_INCOGNITO_NOT_SUPPORTED', { tabId });
  }

  // 3. Cross-window reject (Open Q2: per-agent windowId pinning). Set-once on
  // first bindTab; null pin means "not yet pinned" -- skip this arm.
  if (meta && Number.isFinite(meta.windowId) && typeof reg.getAgentWindowId === 'function') {
    const pinnedWindowId = reg.getAgentWindowId(agentId);
    if (Number.isFinite(pinnedWindowId) && pinnedWindowId !== meta.windowId) {
      return createMcpOwnershipError('TAB_OUT_OF_SCOPE', { tabId, reason: 'cross_window' });
    }
  }

  return null; // pass
}

// Extracts the canonical MCP client label from a bridge payload.
//
// Callers of dispatchMcpToolRoute / dispatchMcpMessageRoute pass `client: this`
// (the MCPBridgeClient INSTANCE OBJECT) for downstream helper invocation,
// restricted-response synthesis, etc. The telemetry recorder
// (extension/utils/mcp-metrics-recorder.js) expects a STRING client label and
// falls back to 'unknown' when given anything else -- which silently turned
// every production telemetry_events.mcp_client into 'unknown'.
//
// The canonical normalised label is carried on the bridge payload as
// `payload.visualSession.client`. The MCP server attaches it in
// mcp/src/tools/manual.ts buildVisualSessionSidecar after the
// normalizeMcpVisualClientLabel allowlist gate (mcp/src/tools/visual-session.ts).
// This helper extracts it for the recordDispatch call sites so telemetry
// records the real client name without changing the bridge-object semantics
// the rest of the dispatch flow relies on.
function extractMcpClientLabel(payload) {
  if (payload && payload.visualSession && typeof payload.visualSession.client === 'string') {
    const label = payload.visualSession.client.trim();
    if (label.length > 0) return label;
  }
  return 'unknown';
}

// Per-agent cache of the last canonical MCP client label observed on an
// action-tool payload. Non-action message routes (agent:register, mcp:get-tabs,
// mcp:get-dom, mcp:get-diagnostics, mcp:read-page) never carry a
// `visualSession.client` -- the sidecar is built only by manual-tool dispatch
// in mcp/src/tools/manual.ts. Without this cache every non-action recordDispatch
// row lands on 'unknown' even when a real client is connected.
//
// Why keyed by agentId, NOT a single module-wide slot:
//   The bridge runs in hub mode (mcp/src/bridge.ts) and serves MULTIPLE
//   concurrent relay clients (one per MCP-client process: Claude, Codex,
//   Cursor, ...) across the same extension WebSocket. A single global slot
//   would let Client A's action seed the cache, then misattribute Client B's
//   payload-less get-tabs / get-dom call as Client A. Codex review on PR #59
//   (P2) called this out; we key by `payload.agentId` (injected by
//   mcp/src/agent-bridge.ts buildAgentPayload on every post-register message)
//   so each relay client's fallback is isolated.
//
// Lifecycle:
//   - cleared by clearLastKnownMcpClientLabel() from mcp-bridge-client.js
//     `_ws.onopen` so a different MCP client reconnecting on the same port
//     never inherits the prior client's labels.
//   - written by resolveMcpClientLabel(payload) whenever the payload carries
//     BOTH a real allowlist label AND an agentId.
//   - read by resolveMcpClientLabel(payload) when the payload itself does not
//     carry a label but DOES carry an agentId (fallback BEFORE 'unknown').
//
// The very first agent:register message has neither agentId nor
// visualSession.client (the MCP server learns its agent_id from the response),
// so it still records 'unknown' -- acceptable since exactly one such message
// fires per relay-client session.
const _agentClientLabelCache = new Map();

// Quick task 260524-8qv -- Codex PR #78 Findings 1 + 4 (P2). Serialize every
// chrome.storage.session read/write/remove for the per-agent client-label map
// so:
//   (a) Finding 1 -- two concurrent resolveMcpClientLabel persists in hub
//       mode cannot both read the prior map, mutate private copies, and race
//       to set(). Without serialization the second write silently overwrites
//       the first, dropping one client's label.
//   (b) Finding 4 -- clearLastKnownMcpClientLabel's session.remove submitted
//       AFTER an in-flight _persistAgentClientLabel cannot be re-populated by
//       the persist's late-arriving set(), which would resurrect stale
//       labels after a bridge reconnect.
// Mirrors the agent-registry.js _registryChain pattern (lines 180..185)
// verbatim shape: .then(fn, fn) so a rejection does not poison the chain;
// .catch(() => {}) on assignment so _labelStorageChain itself never holds a
// rejected promise (which would leak to UnhandledRejection). Module-scope
// (NOT instance-scope); the MV3 service worker is single-threaded so one
// chain serializes all callers. After SW eviction the chain is reborn as
// Promise.resolve() -- correct because no operations are in-flight on a
// freshly-spawned SW.
var _labelStorageChain = Promise.resolve();
function _withLabelStorageLock(fn) {
  var next = _labelStorageChain.then(fn, fn);
  _labelStorageChain = next.catch(function () { /* swallow so chain continues */ });
  return next;
}

function _payloadAgentId(payload) {
  if (payload && typeof payload.agentId === 'string' && payload.agentId.length > 0) {
    return payload.agentId;
  }
  return null;
}

// Quick task 260524-7n9 -- mirror an agent -> canonical-MCP-client-label
// mapping into chrome.storage.session so the popup + sidepanel can show
// "owned by Claude" (etc.) in the owner-chip instead of "owned by agent_<hex>".
//
// Hot-path discipline:
//   - Fire-and-forget from resolveMcpClientLabel (which lives on the
//     dispatcher hot path inside the recordDispatch finally blocks).
//   - Returns synchronously at the first guard when chrome.storage.session
//     is unavailable (Node test harness; restricted contexts).
//   - Wrapped in try/catch so a storage hiccup can NEVER throw into
//     resolveMcpClientLabel's return path.
//   - Skips no-op writes (label already matches) to avoid storms on hot
//     dispatch paths where the same agent fires identical labels rapidly.
//   - Never persists 'unknown' -- callers gate on label !== 'unknown'
//     before invoking this helper.
async function _persistAgentClientLabel(agentId, label) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return;
    if (typeof agentId !== 'string' || agentId.length === 0) return;
    if (typeof label !== 'string' || label.length === 0) return;
    // Quick task 260524-8qv -- Codex PR #78 Finding 1 (P2). The get/set pair
    // MUST run inside _withLabelStorageLock so a concurrent persist for a
    // different agentId cannot observe the same prior map, mutate its own
    // copy, and race to set() (lost-update). The early-return guards above
    // stay OUTSIDE the lock -- no reason to serialize a no-op.
    return _withLabelStorageLock(async function () {
      const prior = await chrome.storage.session.get([FSB_AGENT_CLIENT_LABELS_KEY]);
      const existing = prior && prior[FSB_AGENT_CLIENT_LABELS_KEY];
      const map = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? existing : {};
      if (map[agentId] === label) return; // no-op write -- avoid storm of identical writes on hot dispatch paths
      map[agentId] = label;
      const payload = {};
      payload[FSB_AGENT_CLIENT_LABELS_KEY] = map;
      await chrome.storage.session.set(payload);
    });
  } catch (_e) { /* swallow -- diagnostic-only path */ }
}

function resolveMcpClientLabel(payload) {
  const fromPayload = extractMcpClientLabel(payload);
  const agentId = _payloadAgentId(payload);
  if (fromPayload !== 'unknown') {
    if (agentId) {
      _agentClientLabelCache.set(agentId, fromPayload);
      // Quick task 260524-7n9 -- fire-and-forget mirror to chrome.storage.session.
      // NOT awaited: resolveMcpClientLabel MUST stay synchronous so the two
      // recordDispatch call sites continue to receive a plain string. The
      // helper's own try/catch handles every failure mode.
      _persistAgentClientLabel(agentId, fromPayload);
    }
    return fromPayload;
  }
  if (agentId) {
    const cached = _agentClientLabelCache.get(agentId);
    if (typeof cached === 'string' && cached.length > 0) {
      return cached;
    }
  }
  return 'unknown';
}

function clearLastKnownMcpClientLabel() {
  _agentClientLabelCache.clear();
  // Quick task 260524-7n9 -- best-effort, non-throwing storage clear so a
  // fresh bridge reconnect does not inherit the prior bridge's persisted
  // labels. The in-memory _agentClientLabelCache.clear() above is the
  // authoritative reset; this storage.remove is the mirror.
  //
  // Quick task 260524-8qv -- Codex PR #78 Finding 4 (P2). The remove MUST
  // run inside _withLabelStorageLock so submission order is honored relative
  // to any in-flight _persistAgentClientLabel. A persist submitted BEFORE
  // this clear writes first, then this clear wipes the map; a persist
  // submitted AFTER this clear sees the cleared state. Either ordering ends
  // in a correct invariant. The in-memory _agentClientLabelCache.clear()
  // STAYS outside the lock -- it is synchronous and authoritative; the
  // storage remove is a mirror.
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session
        && typeof chrome.storage.session.remove === 'function') {
      // Fire-and-forget; bridge reconnect must not stall on storage.
      _withLabelStorageLock(function () {
        return chrome.storage.session.remove(FSB_AGENT_CLIENT_LABELS_KEY).catch(function () {});
      });
    }
  } catch (_e) { /* swallow */ }
}

// Test-only accessor for the per-agent slot. Kept underscored to discourage
// runtime callers; the resolver's return value is the supported surface.
function _peekLastKnownMcpClientLabel(agentId) {
  if (typeof agentId === 'string' && agentId.length > 0) {
    return _agentClientLabelCache.has(agentId) ? _agentClientLabelCache.get(agentId) : null;
  }
  return _agentClientLabelCache.size === 0 ? null : Object.fromEntries(_agentClientLabelCache);
}

async function dispatchMcpToolRoute({ tool, params = {}, client = null, tab = null, payload = {} }) {
  const route = MCP_PHASE199_TOOL_ROUTES[tool];
  if (!route) {
    return createMcpRouteError(tool, 'tool', MCP_ROUTE_RECOVERY_HINT);
  }

  if (typeof route.handler !== 'function') {
    return createMcpRouteError(tool, route.routeFamily, MCP_ROUTE_RECOVERY_HINT);
  }

  // Phase 240 D-06 / D-07: inline ownership gate. Sync; no await between gate
  // check and route.handler invocation. Same microtask discipline.
  const gateResult = checkOwnershipGate({ tool, params, payload });
  if (gateResult) return gateResult;

  // Phase 271 / v0.9.69 -- MCP analytics chokepoint. recordDispatch fires in
  // finally on BOTH success and failure paths; errors do NOT skip recording.
  // The recorder's own try/catch insulates this dispatcher from any internal
  // recorder failure, but we wrap the call in a second try/catch as defence
  // in depth: the metrics call MUST NEVER alter the dispatcher's resolved
  // value or thrown error. Early-return paths above (!route, handler missing,
  // gateResult) intentionally do NOT call recordDispatch -- those are
  // dispatcher-internal errors where no tool actually ran.
  //
  // CR-01 (271-REVIEW.md): When invoked via a tool route alias, the outer
  // tool route is responsible for recording. The `_mcpMetricsSuppressInner`
  // flag below is propagated by handleToolAliasRoute into
  // dispatchMcpMessageRoute and suppresses the inner message-route recording
  // to prevent double-counting. The outer dispatchMcpToolRoute ALWAYS records
  // (with dispatcher_route: 'tool'); the inner dispatchMcpMessageRoute
  // skips its finally when the flag is true. Non-alias handlers ignore the
  // flag, so this is a no-op for the 13 non-alias tool routes.
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
    try {
      if (
        typeof globalThis !== 'undefined' &&
        globalThis.fsbMcpMetricsRecorder &&
        typeof globalThis.fsbMcpMetricsRecorder.recordDispatch === 'function'
      ) {
        // Fire-and-forget; intentionally NOT awaited so a slow storage write
        // never blocks the dispatcher's return to the WS client.
        globalThis.fsbMcpMetricsRecorder.recordDispatch({
          client: resolveMcpClientLabel(payload),
          tool,
          requestPayload: payload,
          response,
          success,
          dispatcher_route: 'tool'
        });
      }
    } catch (_e) { /* defence in depth -- never let metrics break dispatch */ }
  }
}

async function dispatchMcpMessageRoute({ type, payload = {}, client = null, mcpMsgId = null, _mcpMetricsSuppressInner = false }) {
  const route = MCP_PHASE199_MESSAGE_ROUTES[type];
  if (!route) {
    return createMcpRouteError(type, 'message', MCP_ROUTE_RECOVERY_HINT);
  }

  const restrictedReadResponse = await buildRestrictedResponseIfReadRoute({ type, client, payload });
  if (restrictedReadResponse) return restrictedReadResponse;

  // Phase 271 / v0.9.69 -- MCP analytics chokepoint (message surface). Same
  // try/finally pattern as dispatchMcpToolRoute: recorder fires from finally
  // on BOTH success and failure paths and on both terminal arms (route.handler
  // and client.helperName). Early-return paths (!route, restricted-read
  // synthesis) do NOT record -- the route never ran.
  let response = undefined;
  let success = false;
  try {
    if (typeof route.handler === 'function') {
      try {
        response = await route.handler({ type, payload: payload || {}, client, mcpMsgId, route });
        success = !(response && typeof response === 'object' && response.success === false);
        return response;
      } catch (error) {
        response = await maybeBuildRestrictedResponse({ error, tool: type, client });
        success = false;
        return response;
      }
    }

    if (!client || typeof client[route.helperName] !== 'function') {
      const restrictedResponse = await buildRestrictedResponseIfActive({ client, tool: type, error: new Error('Bridge client helper unavailable') });
      if (restrictedResponse) {
        response = restrictedResponse;
        success = !(restrictedResponse && restrictedResponse.success === false);
        return restrictedResponse;
      }
      response = createMcpRouteError(type, 'message', MCP_ROUTE_RECOVERY_HINT, { error: 'Bridge client helper unavailable' });
      success = false;
      return response;
    }

    try {
      response = await client[route.helperName](payload || {}, mcpMsgId);
      success = !(response && typeof response === 'object' && response.success === false);
      return response;
    } catch (error) {
      response = await maybeBuildRestrictedResponse({ error, tool: type, client });
      success = false;
      return response;
    }
  } finally {
    // CR-01 (271-REVIEW.md): when invoked via a tool route alias, the outer
    // dispatchMcpToolRoute is responsible for recording. The
    // `_mcpMetricsSuppressInner` flag suppresses the inner message-route
    // recording to prevent double-counting for the 14 alias-routed tools
    // (run_task, read_page, get_dom_snapshot, ...). Direct WS message
    // dispatches (the normal path) leave the flag at its default `false`
    // and continue to record as before.
    //
    // IMPORTANT: do NOT use `if (flag) return;` inside this finally block --
    // a bare `return` from a finally OVERRIDES the try block's return value
    // (the return propagates as `undefined`, swallowing the handler's real
    // response). Instead, gate the recordDispatch call itself so the try
    // block's return value flows through unchanged.
    if (!_mcpMetricsSuppressInner) {
      try {
        if (
          typeof globalThis !== 'undefined' &&
          globalThis.fsbMcpMetricsRecorder &&
          typeof globalThis.fsbMcpMetricsRecorder.recordDispatch === 'function'
        ) {
          globalThis.fsbMcpMetricsRecorder.recordDispatch({
            client: resolveMcpClientLabel(payload),
            tool: type,
            requestPayload: payload,
            response,
            success,
            dispatcher_route: 'message'
          });
        }
      } catch (_e) { /* defence in depth -- never let metrics break dispatch */ }
    }
  }
}

function buildRestrictedMcpResponse({ currentUrl, pageType, tool, error }) {
  return {
    success: false,
    errorCode: 'restricted_active_tab',
    error: error?.message || String(error || 'Active tab is restricted'),
    currentUrl: currentUrl || '',
    pageType: pageType || 'Restricted page',
    tool: tool || null,
    validRecoveryTools: MCP_NAVIGATION_RECOVERY_TOOLS.slice()
  };
}

async function buildRestrictedResponseIfReadRoute({ type, client, payload }) {
  if (type !== 'mcp:read-page' && type !== 'mcp:get-dom') return null;
  const tool = type === 'mcp:read-page' ? 'read_page' : 'get_dom_snapshot';

  if (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function') {
    return buildRestrictedResponseForResolvedTab({ tool, client, payload });
  }

  // No resolver wired up (e.g. isolated test harnesses) -- unchanged pre-fix
  // behavior: check the OS-active tab.
  const activeTab = await getActiveTabFromClient(client).catch(() => null);
  const currentUrl = activeTab?.url || '';
  if (!isRestrictedMcpUrl(currentUrl)) return null;

  return buildRestrictedMcpResponse({
    currentUrl,
    pageType: getPageTypeDescriptionForMcp(currentUrl),
    tool,
    error: 'Active tab is restricted'
  });
}

// Checks restriction on the CALLER'S ACTUAL TARGET tab (via the same
// resolveAgentTabOrError the real _handleGetDOM/_handleReadPage handlers use)
// instead of Chrome's OS-focused tab. Any resolution failure defers to the
// real handler (returns null) rather than guessing -- the real handler makes
// the identical resolveAgentTabOrError call and already returns its error
// shape verbatim, so duplicating that logic here would risk disagreeing with it.
async function buildRestrictedResponseForResolvedTab({ tool, client, payload }) {
  const agentId = (payload && payload.agentId) || null;
  const params = (payload && payload.params) || payload || {}; // matches _handleGetDOM/_handleReadPage

  let resolved;
  try {
    resolved = await globalThis.resolveAgentTabOrError(agentId, params, client);
  } catch (_e) {
    return null;
  }
  if (!resolved || resolved.success === false || !Number.isFinite(resolved.tabId)) {
    return null;
  }

  let tab;
  try {
    tab = await getChromeTabsApi().get(resolved.tabId);
  } catch (_e) {
    return null;
  }

  const currentUrl = (tab && tab.url) || '';
  if (!isRestrictedMcpUrl(currentUrl)) return null;

  return buildRestrictedMcpResponse({
    currentUrl,
    pageType: getPageTypeDescriptionForMcp(currentUrl),
    tool,
    error: 'Active tab is restricted'
  });
}

async function maybeBuildRestrictedResponse({ error, tool, client }) {
  const restrictedResponse = await buildRestrictedResponseIfActive({ client, tool, error });
  if (restrictedResponse) return restrictedResponse;
  throw error;
}

async function buildRestrictedResponseIfActive({ client, tool, error }) {
  const activeTab = await getActiveTabFromClient(client).catch(() => null);
  const currentUrl = activeTab?.url || '';
  if (!isRestrictedMcpUrl(currentUrl)) {
    return null;
  }

  return buildRestrictedMcpResponse({
    currentUrl,
    pageType: getPageTypeDescriptionForMcp(currentUrl),
    tool,
    error
  });
}

async function getActiveTabFromClient(client) {
  if (client && typeof client._getActiveTab === 'function') {
    return client._getActiveTab();
  }
  const tabsApi = getChromeTabsApi();
  const tabs = await tabsApi.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

function getChromeTabsApi() {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    throw new Error('chrome.tabs API unavailable');
  }
  return chrome.tabs;
}

function isRestrictedMcpUrl(url) {
  if (!url) return true;
  if (typeof isRestrictedURL === 'function' && isRestrictedURL(url)) return true;
  const restrictedPages = [
    'about:blank',
    'about:newtab',
    'chrome://newtab/',
    'chrome://settings/',
    'chrome://extensions/',
    'chrome://history/',
    'chrome://downloads/'
  ];
  if (restrictedPages.some(page => url.startsWith(page))) return true;
  const restrictedProtocols = ['chrome://', 'chrome-extension://', 'moz-extension://', 'edge://', 'about:', 'file://'];
  return restrictedProtocols.some(protocol => url.startsWith(protocol));
}

function getPageTypeDescriptionForMcp(url) {
  if (!url) return 'Restricted page';
  if (url.startsWith('chrome://')) return 'Chrome internal page';
  if (url.startsWith('chrome-extension://')) return 'Chrome extension page';
  if (url.startsWith('edge://')) return 'Edge internal page';
  if (url.startsWith('about:')) return 'Browser internal page';
  if (url.startsWith('file://')) return 'Local file';
  return 'Restricted page';
}

function getDomainFromUrl(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

function sanitizeTab(tab) {
  return {
    id: tab?.id ?? null,
    title: tab?.title || 'Untitled Tab',
    isActive: Boolean(tab?.active),
    domain: getDomainFromUrl(tab?.url),
    windowId: tab?.windowId ?? null
  };
}

function sanitizeSingleTab(tool, tab, extra = {}) {
  return {
    success: true,
    tool,
    tabId: tab?.id ?? null,
    url: tab?.url || '',
    domain: getDomainFromUrl(tab?.url),
    title: tab?.title || '',
    ...extra
  };
}

function shouldEmitSyntheticChangeReport(tool) {
  const toolDef = (typeof _mcp_getToolByName === 'function') ? _mcp_getToolByName(tool) : null;
  return !!(fsbChangeReportsEnabled && toolDef && toolDef._emitChangeReport === true);
}

function attachOpenTabChangeReport(response, params) {
  if (!response || response.success !== true || !shouldEmitSyntheticChangeReport('open_tab')) {
    return response;
  }
  const afterUrl = response.url || (params && typeof params.url === 'string' ? params.url : 'about:blank');
  response.change_report = {
    url: { before: null, after: afterUrl, changed: true },
    title_changed: false,
    dialogs_opened: [],
    nodes_added: [],
    nodes_removed: [],
    attrs_changed: [],
    inputs_changed: {},
    focus_shift: null,
    mutation_count: 0,
    settle_ms: 0,
    truncated: false,
    partial: true
  };
  return response;
}

function attachCloseTabChangeReport(response, tab) {
  if (!response || response.success !== true || !shouldEmitSyntheticChangeReport('close_tab')) {
    return response;
  }
  response.change_report = {
    url: { before: (tab && tab.url) || '', after: null, changed: true },
    title_changed: false,
    dialogs_opened: [],
    nodes_added: [],
    nodes_removed: [],
    attrs_changed: [],
    inputs_changed: {},
    focus_shift: null,
    mutation_count: 0,
    settle_ms: 0,
    truncated: false,
    partial: true
  };
  return response;
}

function hasActiveAutomationSessionForTab(tabId) {
  if (!Number.isFinite(tabId)) return false;
  const sessions = getActiveSessionsMap();
  for (const session of sessions.values()) {
    if (!session || session.isBackgroundAgent) continue;
    if (session.tabId === tabId || session.originalTabId === tabId || session.previousTabId === tabId) {
      return true;
    }
  }
  return false;
}

async function handleNavigateRoute({ params, client, tab }) {
  const { agentId } = params || {};
  // Phase 240: agentId now load-bearing for the bindTab D-08 site below.
  if (!params?.url || typeof params.url !== 'string') {
    return createMcpInvalidParamsError('navigate', 'navigate requires url');
  }

  try {
    getChromeTabsApi();
    const targetTabId = Number.isFinite(params.tabId)
      ? params.tabId
      : (tab && Number.isFinite(tab.id) ? tab.id : null);

    if (targetTabId === null) {
      const createdTab = await chrome.tabs.create({ url: params.url, active: false });
      const bindResult = await bindClaimedTabOrError({ tool: 'navigate', tabId: createdTab && createdTab.id, agentId });
      if (bindResult && bindResult.success === false) return bindResult;
      const extra = (bindResult && bindResult.ownershipToken)
        ? { ownershipToken: bindResult.ownershipToken }
        : {};
      return sanitizeSingleTab('navigate', createdTab, extra);
    }

    const ownershipPrecheck = checkClaimableTargetBeforeSideEffect({
      tool: 'navigate',
      tabId: targetTabId,
      agentId,
      ownershipToken: params.ownershipToken
    });
    if (ownershipPrecheck) return ownershipPrecheck;

    // Phase 243 plan 02 (BG-04): stamp lastAgentNavigationAt BEFORE the
    // chrome.tabs.update so the webNavigation.onCommitted listener suppresses
    // its agent-tab-user-navigation emission within the 500ms window for
    // user-initiated transitionTypes (link / typed) the commit produces.
    try {
      if (typeof globalThis !== 'undefined'
          && globalThis.fsbAgentRegistryInstance
          && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
        globalThis.fsbAgentRegistryInstance.stampAgentNavigation(targetTabId);
      }
    } catch (_e) { /* best-effort */ }
    const updatedTab = await chrome.tabs.update(targetTabId, { url: params.url });

    // Phase 240 D-08: bindTab on the navigated tab BEFORE returning success
    // so the originating agent owns the tab; the freshly minted ownershipToken
    // threads back through sanitizeSingleTab so AgentScope can capture it.
    let bindResult = await bindClaimedTabOrError({ tool: 'navigate', tabId: targetTabId, agentId });
    if (bindResult && bindResult.success === false) return bindResult;
    const extra = (bindResult && bindResult.ownershipToken)
      ? { ownershipToken: bindResult.ownershipToken }
      : {};
    return sanitizeSingleTab('navigate', { ...updatedTab, id: targetTabId, url: updatedTab?.url || params.url }, extra);
  } catch (error) {
    return createMcpRouteError('navigate', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: error.message || String(error) });
  }
}

async function handleNavigationHistoryRoute({ tool, params, client }) {
  const { agentId } = params || {};
  // Phase 240: agentId now load-bearing for the bindTab D-08 site below.
  let targetTabId = Number.isFinite(params?.tabId) ? params.tabId : null;
  try {
    getChromeTabsApi();
    const activeTab = await getActiveTabFromClient(client);
    if (!activeTab?.id && targetTabId === null) {
      return createMcpRouteError(tool, 'browser', 'Use list_tabs or open_tab to find a navigable tab before retrying.', {
        errorCode: 'no_active_tab',
        error: 'No active tab available for navigation'
      });
    }

    targetTabId = targetTabId === null ? activeTab.id : targetTabId;
    // Phase 243 plan 02 (BG-04): stamp BEFORE chrome.tabs.goBack/goForward/
    // reload so the webNavigation.onCommitted listener suppresses its
    // agent-tab-user-navigation emission within the 500ms window. The
    // auto_bookmark / reload transitionTypes both fall in
    // USER_INITIATED_TRANSITIONS and would otherwise trip a false positive.
    try {
      if (typeof globalThis !== 'undefined'
          && globalThis.fsbAgentRegistryInstance
          && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
        globalThis.fsbAgentRegistryInstance.stampAgentNavigation(targetTabId);
      }
    } catch (_e) { /* best-effort */ }
    if (tool === 'go_back') {
      await chrome.tabs.goBack(targetTabId);
    } else if (tool === 'go_forward') {
      await chrome.tabs.goForward(targetTabId);
    } else {
      await chrome.tabs.reload(targetTabId);
    }

    // Phase 240 D-08: bindTab on the navigated tab BEFORE returning success.
    let bindResult = null;
    if (agentId
        && typeof globalThis !== 'undefined'
        && globalThis.fsbAgentRegistryInstance
        && typeof globalThis.fsbAgentRegistryInstance.bindTab === 'function'
        && Number.isFinite(targetTabId)) {
      try {
        bindResult = await globalThis.fsbAgentRegistryInstance.bindTab(agentId, targetTabId);
      } catch (_e) {
        bindResult = null;
      }
    }
    const response = { success: true, tool, tabId: targetTabId };
    if (bindResult && bindResult.ownershipToken) {
      response.ownershipToken = bindResult.ownershipToken;
    }
    return response;
  } catch (error) {
    return {
      success: false,
      errorCode: 'navigation_unavailable',
      tool,
      tabId: targetTabId,
      error: error.message || String(error)
    };
  }
}

// ---- Phase 242 'back' MCP tool helpers ---------------------------------
// Single-step ownership-gated history-back. Order in declaration:
//   waitForBackSettle  -- helper used by handleBackRoute settle race.
//   classifyBackOutcome -- helper used by handleBackRoute status mapping.
//   handleBackRoute     -- the route entry exposed via MCP_PHASE199_MESSAGE_ROUTES.
// Hard invariants (BACK-02..BACK-05, D-08):
//   * No chrome.tabs.update reference anywhere in this section
//     (background-tab compatibility).
//   * The 5-code status discriminator is canonical:
//       'ok' | 'no_history' | 'cross_origin' | 'bf_cache' | 'fragment_only'.
//   * Phase 240 ownership gate is invoked at the TOP of handleBackRoute
//     because dispatchMcpMessageRoute does NOT inline-gate message routes
//     today (only dispatchMcpToolRoute does, line 194).

/**
 * Race three legs to detect when chrome.tabs.goBack has settled:
 *   1. chrome.tabs.onUpdated 'complete' for the target tab.
 *   2. window 'pageshow' event observed inside the post-back document via
 *      chrome.scripting.executeScript injection. Captures event.persisted
 *      so the caller can distinguish BF-cache restoration.
 *   3. Hard 2s timeout (caller passes timeoutMs).
 * Self-cleans the onUpdated listener and the timeout regardless of which
 * leg wins. Resolves at most once via the `finished` guard.
 *
 * @param {number} tabId  Target tab id (must be finite).
 * @param {number} timeoutMs  Outer hard cap (ms). RESEARCH lines 333-371.
 * @returns {Promise<{method:'pageshow'|'onUpdated'|'timeout', persisted: boolean|null}>}
 */
function waitForBackSettle(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      try { cleanup(); } catch (_e) { /* swallow */ }
      resolve(result);
    };

    let onUpdatedListener = null;
    let timeoutHandle = null;

    const cleanup = () => {
      if (onUpdatedListener && typeof chrome !== 'undefined'
          && chrome.tabs && chrome.tabs.onUpdated
          && typeof chrome.tabs.onUpdated.removeListener === 'function') {
        try { chrome.tabs.onUpdated.removeListener(onUpdatedListener); } catch (_e) {}
      }
      onUpdatedListener = null;
      if (timeoutHandle !== null) {
        try { clearTimeout(timeoutHandle); } catch (_e) {}
        timeoutHandle = null;
      }
    };

    // Leg 1: chrome.tabs.onUpdated 'complete'.
    if (typeof chrome !== 'undefined'
        && chrome.tabs && chrome.tabs.onUpdated
        && typeof chrome.tabs.onUpdated.addListener === 'function') {
      onUpdatedListener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo && changeInfo.status === 'complete') {
          finish({ method: 'onUpdated', persisted: null });
        }
      };
      try { chrome.tabs.onUpdated.addListener(onUpdatedListener); } catch (_e) { onUpdatedListener = null; }
    }

    // Leg 2: pageshow via injected one-shot listener.
    if (typeof chrome !== 'undefined' && chrome.scripting
        && typeof chrome.scripting.executeScript === 'function') {
      // Inner timeout deliberately above the outer budget so the outer
      // Promise.race's timeout leg always resolves first when no pageshow.
      const innerTimeoutMs = Math.max(timeoutMs + 500, 2500);
      const inject = async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (innerTimeout) => new Promise((res) => {
              const handler = (event) => {
                window.removeEventListener('pageshow', handler);
                res({ method: 'pageshow', persisted: !!event.persisted });
              };
              window.addEventListener('pageshow', handler, { once: true });
              setTimeout(() => {
                try { window.removeEventListener('pageshow', handler); } catch (_e) {}
                res({ method: 'pageshow', persisted: null, timeout: true });
              }, innerTimeout);
            }),
            args: [innerTimeoutMs]
          });
          if (Array.isArray(results) && results.length > 0) {
            const inner = results[0] && results[0].result;
            if (inner && inner.method === 'pageshow' && inner.timeout !== true) {
              finish({ method: 'pageshow', persisted: !!inner.persisted });
            }
          }
        } catch (_e) {
          // Intentional swallow per RESEARCH line 350-356: chrome:// pages
          // and other restricted contexts cannot host injection. Let the
          // other legs decide the outcome.
        }
      };
      inject();
    }

    // Leg 3: hard timeout.
    timeoutHandle = setTimeout(() => {
      finish({ method: 'timeout', persisted: null });
    }, Math.max(0, timeoutMs));
  });
}

/**
 * Map pre/post URL components + settle outcome to the canonical 5-status
 * discriminator. Mirrors RESEARCH lines 376-396 with the Pitfall-1 SPA
 * carve-out (timeout + URL changed + same origin -> 'ok', not 'bf_cache').
 *
 * Resolution order (first match wins):
 *   1. preUrl === postUrl                        -> 'ok' (defensive; SPA replaceState).
 *   2. same origin + same pathname + same search + different hash -> 'fragment_only'.
 *   3. preOrigin && postOrigin && preOrigin !== postOrigin -> 'cross_origin'.
 *   4. settled.method === 'pageshow' && settled.persisted === true -> 'bf_cache'.
 *   5. settled.method === 'timeout' && postUrl === preUrl -> 'bf_cache'.
 *   6. default                                            -> 'ok'.
 *
 * Note: case (1) returns 'ok' rather than a no-op marker because callers
 * upstream (Phase 240 gate + handleBackRoute) treat 'ok' as the success
 * baseline; SPA replaceState scenarios where the URL is identical are
 * indistinguishable from idempotent back without observable state change,
 * so 'ok' is the truthful classification.
 *
 * WR-02 best-effort caveat: the 'bf_cache' discriminator is only as
 * accurate as the pageshow leg of waitForBackSettle. That leg injects
 * its listener via chrome.scripting.executeScript AFTER chrome.tabs.goBack
 * has already fired (handleBackRoute step 5 -> step 6), so a same-origin
 * BF-cache restoration whose pageshow event fires before the listener
 * lands will fall through to the 'ok' default branch instead of being
 * classified as 'bf_cache'. Callers relying on 'bf_cache' for snapshot
 * invalidation should treat 'ok' as best-effort and may occasionally
 * shadow a missed BF-cache event.
 *
 * Note: 'no_history' is decided upstream by handleBackRoute's
 * history.length precheck (step 4); this helper only classifies the
 * post-goBack settle outcome.
 *
 * @param {object} args
 * @param {string} args.preUrl    URL from chrome.tabs.get BEFORE goBack.
 * @param {string} args.postUrl   URL from chrome.tabs.get AFTER settle.
 * @param {string} args.preOrigin URL.origin parsed from preUrl, or '' on parse failure.
 * @param {string} args.postOrigin URL.origin parsed from postUrl, or '' on parse failure.
 * @param {{method:string,persisted:boolean|null}} args.settled  waitForBackSettle output.
 * @returns {'ok'|'cross_origin'|'bf_cache'|'fragment_only'}
 */
function classifyBackOutcome({ preUrl, postUrl, preOrigin, postOrigin, settled }) {
  if (preUrl === postUrl) {
    // Defensive: SPA replaceState back may not change observable URL.
    return 'ok';
  }

  // Fragment-only: same origin + same pathname + same search, different hash.
  let prePath = '', preSearch = '', preHash = '';
  let postPath = '', postSearch = '', postHash = '';
  try { const u = new URL(preUrl); prePath = u.pathname; preSearch = u.search; preHash = u.hash; } catch (_e) {}
  try { const u = new URL(postUrl); postPath = u.pathname; postSearch = u.search; postHash = u.hash; } catch (_e) {}
  if (preOrigin && postOrigin && preOrigin === postOrigin
      && prePath === postPath && preSearch === postSearch && preHash !== postHash) {
    return 'fragment_only';
  }

  if (preOrigin && postOrigin && preOrigin !== postOrigin) {
    return 'cross_origin';
  }

  if (settled && settled.method === 'pageshow' && settled.persisted === true) {
    return 'bf_cache';
  }

  // Pitfall-1: timeout with URL change is the SPA case -- classify as 'ok'.
  // Only timeout WITHOUT URL change is treated as bf_cache.
  if (settled && settled.method === 'timeout' && postUrl === preUrl) {
    return 'bf_cache';
  }

  return 'ok';
}

/**
 * Phase 242 BACK-02..BACK-05: handle the 'mcp:go-back' bridge message.
 *
 * Flow (synchronous up to first await; D-07 gate discipline):
 *   1. Defensive ownership gate (since dispatchMcpMessageRoute does NOT
 *      inline-gate message routes today; the inline gate lives only in
 *      dispatchMcpToolRoute at line 194). Cross-agent calls reject here
 *      with TAB_NOT_OWNED + ownerAgentId before any chrome API touches.
 *   2. Resolve targetTabId (payload.tabId or active tab).
 *   3. Capture pre-back URL via chrome.tabs.get.
 *   4. history.length precheck via chrome.scripting.executeScript. On
 *      depth <= 1 OR injection failure (chrome:// etc.), return
 *      { status: 'no_history', resultingUrl: preUrl, historyDepth }
 *      WITHOUT calling chrome.tabs.goBack.
 *   5. chrome.tabs.goBack -- background-tab safe (no chrome.tabs.update).
 *   6. waitForBackSettle race (pageshow / onUpdated complete / 2s timeout).
 *   7. chrome.tabs.get post-back. If tab closed mid-flight, return
 *      { errorCode: 'tab_closed_during_back' } (Pitfall 5).
 *   8. classifyBackOutcome -> 5-code status.
 *   9. bindTab parity (D-08 mirrors handleNavigationHistoryRoute lines
 *      431-443 exactly) so cross-origin back refreshes the
 *      (agentId, tabId, ownershipToken) triple.
 *
 * @param {object} args
 * @param {string} args.type     'mcp:go-back'.
 * @param {object} args.payload  Bridge envelope payload (agentId, ownershipToken, tabId?).
 * @param {object} [args.client] Optional bridge client (active-tab resolver).
 * @returns {Promise<object>}    Either { success:true, status, resultingUrl, historyDepth, tabId, ownershipToken? }
 *                               or a Phase 240 reject {success:false, code:'TAB_NOT_OWNED', ...}
 *                               or createMcpRouteError-shaped error.
 */
async function handleBackRoute({ payload = {}, client = null }) {
  // 1. Defensive ownership gate (mirror dispatchMcpToolRoute line 194).
  // dispatchMcpMessageRoute does not inline-gate today; this defensive call
  // ensures cross-agent calls reject before any side effect.
  const gateResult = checkOwnershipGate({ tool: 'back', params: {}, payload });
  if (gateResult) return gateResult;

  const agentId = (payload && payload.agentId) || null;

  // 2. Resolve targetTabId.
  let targetTabId = (payload && Number.isFinite(payload.tabId)) ? payload.tabId : null;
  try {
    getChromeTabsApi();
  } catch (error) {
    return createMcpRouteError('back', 'browser', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'navigation_unavailable',
      error: error.message || String(error)
    });
  }

  if (targetTabId === null) {
    let activeTab = null;
    try {
      activeTab = await getActiveTabFromClient(client);
    } catch (_e) {
      activeTab = null;
    }
    if (!activeTab || !Number.isFinite(activeTab.id)) {
      return createMcpRouteError('back', 'browser', 'Use list_tabs or open_tab to find a navigable tab before retrying.', {
        errorCode: 'no_active_tab',
        error: 'No active tab available for back navigation'
      });
    }
    targetTabId = activeTab.id;

    // WR-01: The gate above (step 1) ran with payload.tabId omitted, which
    // causes _resolveTabIdForGate to skip the tab-ownership arm entirely.
    // Now that we have a concrete tabId, re-run the gate so a registered-
    // but-non-owning agent cannot drive history-back on a tab it does not
    // own. The gate is sync and cheap; thread the resolved tabId through a
    // fresh payload object to preserve the existing contract.
    const recheck = checkOwnershipGate({
      tool: 'back',
      params: {},
      payload: { ...payload, tabId: targetTabId }
    });
    if (recheck) return recheck;
  }

  // 3. Capture pre-back state.
  let preTab = null;
  try {
    preTab = await chrome.tabs.get(targetTabId);
  } catch (error) {
    return createMcpRouteError('back', 'browser', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'tab_unavailable',
      tabId: targetTabId,
      error: error.message || String(error)
    });
  }
  const preUrl = (preTab && typeof preTab.url === 'string') ? preTab.url : '';
  let preOrigin = '';
  try { preOrigin = new URL(preUrl).origin; } catch (_e) { preOrigin = ''; }

  // 4. history.length precheck (BACK-02). Failure modes (chrome://, no
  // permission, tab in restricted context) all collapse to 'no_history'
  // fail-closed: never call goBack on an unverifiable history length.
  let historyDepth = 0;
  let prechecked = false;
  try {
    if (chrome && chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: () => window.history.length
      });
      if (Array.isArray(results) && results.length > 0) {
        const raw = results[0] && results[0].result;
        if (Number.isFinite(raw)) {
          historyDepth = raw;
          prechecked = true;
        }
      }
    }
  } catch (_e) {
    // Restricted contexts (chrome://, devtools, etc.) -- fall through to
    // the no_history fail-closed branch below.
    prechecked = false;
  }
  if (!prechecked || historyDepth <= 1) {
    return {
      success: true,
      status: 'no_history',
      resultingUrl: preUrl,
      historyDepth: prechecked ? historyDepth : 1,
      tabId: targetTabId,
      tool: 'back'
    };
  }

  // 5. Fire goBack. NEVER call the focus-stealing tabs update API here
  //    (D-08 background-tab posture; verification gate excludes the literal
  //    method call from this handler body).
  // Phase 243 plan 02 (BG-04): stamp BEFORE chrome.tabs.goBack so the
  // webNavigation.onCommitted listener suppresses its
  // agent-tab-user-navigation emission within the 500ms window. Phase 242
  // back transitionType auto_bookmark falls in USER_INITIATED_TRANSITIONS;
  // this is the canonical false-positive vector the suppression guards.
  try {
    if (typeof globalThis !== 'undefined'
        && globalThis.fsbAgentRegistryInstance
        && typeof globalThis.fsbAgentRegistryInstance.stampAgentNavigation === 'function') {
      globalThis.fsbAgentRegistryInstance.stampAgentNavigation(targetTabId);
    }
  } catch (_e) { /* best-effort */ }
  try {
    await chrome.tabs.goBack(targetTabId);
  } catch (error) {
    return {
      success: false,
      errorCode: 'navigation_unavailable',
      tool: 'back',
      tabId: targetTabId,
      error: error.message || String(error)
    };
  }

  // 6. Settle race (BACK-04).
  const settled = await waitForBackSettle(targetTabId, 2000);

  // 7. Read post-back state.
  let postTab = null;
  try {
    postTab = await chrome.tabs.get(targetTabId);
  } catch (error) {
    return {
      success: false,
      errorCode: 'tab_closed_during_back',
      tool: 'back',
      tabId: targetTabId,
      error: error.message || String(error)
    };
  }
  const postUrl = (postTab && typeof postTab.url === 'string') ? postTab.url : '';
  let postOrigin = '';
  try { postOrigin = new URL(postUrl).origin; } catch (_e) { postOrigin = ''; }

  // 8. Classify (BACK-03).
  const status = classifyBackOutcome({ preUrl, postUrl, preOrigin, postOrigin, settled });

  // 9. bindTab parity (D-08): mirror handleNavigationHistoryRoute exactly so
  // cross-origin back refreshes the (agentId, tabId, ownershipToken) triple.
  let bindResult = null;
  if (agentId
      && typeof globalThis !== 'undefined'
      && globalThis.fsbAgentRegistryInstance
      && typeof globalThis.fsbAgentRegistryInstance.bindTab === 'function'
      && Number.isFinite(targetTabId)) {
    try {
      bindResult = await globalThis.fsbAgentRegistryInstance.bindTab(agentId, targetTabId);
    } catch (_e) {
      bindResult = null;
    }
  }

  const response = {
    success: true,
    status,
    resultingUrl: postUrl,
    historyDepth,
    tabId: targetTabId,
    tool: 'back'
  };
  if (bindResult && bindResult.ownershipToken) {
    response.ownershipToken = bindResult.ownershipToken;
  }
  return response;
}

async function handleOpenTabRoute({ params }) {
  const { agentId } = params || {};
  // Phase 240: agentId now load-bearing for the bindTab D-08 site below.
  try {
    getChromeTabsApi();
    // Phase 246 D-05: default to background; explicit active:true required to
    // steal focus. This eliminates the "open_tab steals user focus mid-task"
    // multi-agent UX bug. The bindTab + ownershipToken contract (D-08) below
    // is preserved byte-for-byte.
    const tab = await chrome.tabs.create({ url: params.url || 'about:blank', active: params.active === true });

    // Phase 240 D-08: bindTab on the freshly created tab BEFORE returning
    // success. open_tab claims a tab no other agent has touched, so the
    // bind is unconditional once the create succeeds.
    let bindResult = null;
    if (agentId
        && typeof globalThis !== 'undefined'
        && globalThis.fsbAgentRegistryInstance
        && typeof globalThis.fsbAgentRegistryInstance.bindTab === 'function'
        && tab && Number.isFinite(tab.id)) {
      try {
        bindResult = await globalThis.fsbAgentRegistryInstance.bindTab(agentId, tab.id);
      } catch (_e) {
        bindResult = null;
      }
    }
    const extra = (bindResult && bindResult.ownershipToken)
      ? { ownershipToken: bindResult.ownershipToken }
      : {};
    return attachOpenTabChangeReport(sanitizeSingleTab('open_tab', tab, extra), params);
  } catch (error) {
    return createMcpRouteError('open_tab', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: error.message || String(error) });
  }
}

// Phase 34: MCP front door for upload_file. Tab ownership is already enforced
// by resolveAgentTabOrError + checkOwnershipGate before this runs; the shared
// background helper (executeUploadFile) owns the denylist + audit chokepoint.
async function handleUploadFileRoute({ params, tab }) {
  const p = params || {};
  const targetTabId = Number.isFinite(p.tabId)
    ? p.tabId
    : (tab && Number.isFinite(tab.id) ? tab.id : null);
  if (!Number.isFinite(targetTabId)) {
    return createMcpInvalidParamsError('upload_file', 'upload_file requires a resolved tab');
  }
  if (typeof p.selector !== 'string' || !p.selector.trim()) {
    return createMcpInvalidParamsError('upload_file', 'upload_file requires a selector');
  }
  if (typeof p.file_path !== 'string' || !p.file_path.trim()) {
    return createMcpInvalidParamsError('upload_file', 'upload_file requires file_path');
  }
  const uploadFn = (typeof globalThis !== 'undefined' && typeof globalThis.executeUploadFile === 'function')
    ? globalThis.executeUploadFile
    : null;
  if (!uploadFn) {
    return createMcpRouteError('upload_file', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: 'upload handler unavailable' });
  }
  try {
    const result = await uploadFn(targetTabId, p.selector, p.file_path);
    if (result && result.success) {
      return { success: true, tool: 'upload_file', method: result.method, selector: result.selector, file: result.file };
    }
    return createMcpRouteError('upload_file', 'browser', MCP_ROUTE_RECOVERY_HINT, {
      error: (result && result.error) || 'upload_file failed',
      reason: result && result.reason
    });
  } catch (error) {
    return createMcpRouteError('upload_file', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: error.message || String(error) });
  }
}

async function handleSwitchTabRoute({ params }) {
  const { agentId } = params || {};
  if (!Number.isFinite(params?.tabId)) {
    return createMcpInvalidParamsError('switch_tab', 'switch_tab requires numeric tabId');
  }

  try {
    getChromeTabsApi();
    const ownershipPrecheck = checkClaimableTargetBeforeSideEffect({
      tool: 'switch_tab',
      tabId: params.tabId,
      agentId,
      ownershipToken: params.ownershipToken
    });
    if (ownershipPrecheck) return ownershipPrecheck;

    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const previousTabId = currentTab ? currentTab.id : null;

    // switch_tab is background-safe by default. Its explicit active:true flag
    // is the only foreground escape hatch for MCP tab selection.
    const toolDef = (typeof _mcp_getToolByName === 'function')
      ? _mcp_getToolByName('switch_tab')
      : null;
    const forceForeground = !!(toolDef && toolDef._forceForeground === true && params.active === true);

    let tab = await chrome.tabs.get(params.tabId);
    const bindResult = await bindClaimedTabOrError({ tool: 'switch_tab', tabId: params.tabId, agentId });
    if (bindResult && bindResult.success === false) return bindResult;

    if (forceForeground) {
      tab = await chrome.tabs.update(params.tabId, { active: true });
      if (chrome.tabs.get) {
        tab = await chrome.tabs.get(params.tabId);
      }
      if (typeof chrome !== 'undefined' && chrome.windows?.update && tab?.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    }

    const extra = (bindResult && bindResult.ownershipToken)
      ? { ownershipToken: bindResult.ownershipToken }
      : {};
    return sanitizeSingleTab('switch_tab', tab, { tabId: params.tabId, previousTabId, ...extra });
  } catch (error) {
    return createMcpRouteError('switch_tab', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: error.message || String(error), tabId: params.tabId });
  }
}

async function handleCloseTabRoute({ params }) {
  const tabId = params && Number.isFinite(params.tabId) ? params.tabId : null;
  if (!Number.isFinite(tabId)) {
    return createMcpInvalidParamsError('close_tab', 'close_tab requires numeric tabId');
  }

  try {
    getChromeTabsApi();
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.active === true && params.allow_active !== true) {
      return createMcpRouteError('close_tab', 'browser', 'Pass allow_active:true only if you intentionally want to close the active tab.', {
        errorCode: 'active_tab_close_rejected',
        tabId,
        error: 'close_tab refused to close the active tab without allow_active:true'
      });
    }

    await chrome.tabs.remove(tabId);
    if (typeof globalThis !== 'undefined'
        && globalThis.fsbAgentRegistryInstance
        && typeof globalThis.fsbAgentRegistryInstance.releaseTab === 'function') {
      try {
        await globalThis.fsbAgentRegistryInstance.releaseTab(tabId);
      } catch (_e) { /* chrome.tabs.onRemoved also performs registry cleanup */ }
    }

    return attachCloseTabChangeReport({
      success: true,
      tool: 'close_tab',
      tabId,
      closed: true,
      wasActive: Boolean(tab && tab.active)
    }, tab);
  } catch (error) {
    return createMcpRouteError('close_tab', 'browser', MCP_ROUTE_RECOVERY_HINT, {
      error: error.message || String(error),
      tabId
    });
  }
}

async function handleListTabsRoute({ params }) {
  const { agentId } = params || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  try {
    getChromeTabsApi();
    const queryOptions = {};
    if (params?.currentWindowOnly === true) {
      queryOptions.currentWindow = true;
    }

    const tabs = await chrome.tabs.query(queryOptions);
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sanitizedTabs = tabs.map(sanitizeTab);
    return {
      success: true,
      tool: 'list_tabs',
      tabs: sanitizedTabs,
      activeTabId: activeTab?.id ?? null,
      totalTabs: sanitizedTabs.length
    };
  } catch (error) {
    return createMcpRouteError('list_tabs', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: error.message || String(error) });
  }
}

async function handleExecuteJsRoute({ payload } = {}) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  return createMcpRouteError('execute_js', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: 'execute_js remains handled by the bridge client direct scripting path' });
}

async function handleGetSiteGuideRoute({ params, client }) {
  if (!client || typeof client._handleGetSiteGuides !== 'function') {
    return createMcpRouteError('get_site_guide', 'browser', MCP_ROUTE_RECOVERY_HINT, { error: 'Bridge client site guide helper unavailable' });
  }
  return client._handleGetSiteGuides(params);
}

function boundedString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function boundedPositiveInt(value, defaultValue, maxValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, maxValue);
}

function isPromptOrRawResponseLog(entry) {
  const logType = entry?.data?.logType || entry?.logType || null;
  return logType === 'prompt' || logType === 'rawResponse';
}

function isSensitiveKey(key) {
  return /password|passcode|token|secret|apikey|api_key|authorization|credential|cardnumber|card_number|cvv|cvc|vault|payment|privatekey|private_key/i.test(String(key || ''));
}

function sanitizeValue(value, options = {}, depth = 0) {
  const maxString = options.maxString || 1000;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, maxString);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const maxArray = options.maxArray || 50;
    return value.slice(0, maxArray).map(item => sanitizeValue(item, options, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= (options.maxDepth || 3)) return '[object]';
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      output[key] = sanitizeValue(item, options, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, maxString);
}

function sanitizeLogEntry(entry) {
  return sanitizeValue(entry || {}, { maxString: 1000, maxArray: 50, maxDepth: 4 });
}

function filterAndCapLogs(logs, limit) {
  const cappedLimit = boundedPositiveInt(limit, 50, 200);
  return (Array.isArray(logs) ? logs : [])
    .filter(entry => !isPromptOrRawResponseLog(entry))
    .slice(-cappedLimit)
    .map(sanitizeLogEntry);
}

function sanitizeSessionMetadata(session) {
  if (!session || typeof session !== 'object') return null;
  const sanitized = sanitizeValue(session, { maxString: 1000, maxArray: 100, maxDepth: 4 });
  delete sanitized.logs;
  delete sanitized.actionHistory;
  return sanitized;
}

function sanitizeActionHistoryEntry(action) {
  const params = (action?.params && typeof action.params === 'object') ? action.params : {};
  const result = (action?.result && typeof action.result === 'object') ? action.result : {};
  return {
    tool: action?.tool || null,
    timestamp: action?.timestamp || null,
    iteration: action?.iteration || null,
    ...(params.selector ? { selector: boundedString(params.selector, 250) } : {}),
    ...(params.url ? { domain: getDomainFromUrl(params.url) } : {}),
    result: {
      success: Boolean(result.success),
      ...(result.error ? { error: boundedString(result.error, 500) } : {})
    }
  };
}

function sanitizeSessionDetail(session) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const sanitized = sanitizeSessionMetadata(session);
  sanitized.logs = filterAndCapLogs(session.logs || [], 200);
  if (Array.isArray(session.actionHistory)) {
    sanitized.actionHistory = session.actionHistory.slice(-100).map(sanitizeActionHistoryEntry);
  }
  // Phase 233: defensive iteration intent log (toolCallLog) — captures every
  // tool call the LLM emitted regardless of whether actionHistory recorded it.
  if (Array.isArray(session.toolCallLog)) {
    sanitized.toolCallLog = session.toolCallLog.slice(-200);
  }
  return sanitized;
}

function sanitizeMemoryEntry(memory) {
  return {
    id: memory?.id || null,
    type: memory?.type || null,
    text: String(memory?.text || '').slice(0, 500),
    metadata: sanitizeValue(memory?.metadata || {}, { maxString: 500, maxArray: 25, maxDepth: 3 })
  };
}

function getMemoryListStorageUsageBytes(memories) {
  try {
    return new Blob([JSON.stringify(memories || [])]).size;
  } catch (_) {
    try {
      return JSON.stringify(memories || []).length;
    } catch (__) {
      return 0;
    }
  }
}

function getActiveSessionsMap() {
  return (typeof activeSessions !== 'undefined' && activeSessions instanceof Map) ? activeSessions : new Map();
}

function callCallbackHandler(handlerName, request, sender = {}, routeFamily = 'autopilot') {
  const handler = typeof globalThis !== 'undefined' ? globalThis[handlerName] : null;
  const directHandler = typeof handler === 'function'
    ? handler
    : (handlerName === 'handleStartAutomation' && typeof handleStartAutomation === 'function')
      ? handleStartAutomation
      : (handlerName === 'handleStopAutomation' && typeof handleStopAutomation === 'function')
        ? handleStopAutomation
        : null;

  if (typeof directHandler !== 'function') {
    return Promise.resolve(createMcpRouteError(request?.action || handlerName, routeFamily, MCP_ROUTE_RECOVERY_HINT, { error: `${handlerName} unavailable` }));
  }

  return new Promise((resolve) => {
    try {
      const result = directHandler(request, sender, (response) => resolve(response || {}));
      if (result && typeof result.catch === 'function') {
        result.catch((error) => resolve({ success: false, error: error.message || String(error) }));
      }
    } catch (error) {
      resolve({ success: false, error: error.message || String(error) });
    }
  });
}

// CR-01 (271-REVIEW.md): handleToolAliasRoute is the bridge between the two
// dispatchers for the 14 alias-routed tools. When invoked via a tool route
// alias, the outer tool route (dispatchMcpToolRoute) is responsible for
// recording. This handler propagates the `_mcpMetricsSuppressInner` flag
// passed in by dispatchMcpToolRoute into the inner dispatchMcpMessageRoute
// call so the inner finally skips its recordDispatch -- preventing the
// double-write that would otherwise inflate every alias-routed metric by 2x.
async function handleToolAliasRoute({ params, client, route, _mcpMetricsSuppressInner }) {
  return dispatchMcpMessageRoute({
    type: route.messageType,
    payload: params || {},
    client,
    _mcpMetricsSuppressInner
  });
}

async function handleTriggerToolMessageRoute({ type, payload = {}, route }) {
  const toolName = MCP_TRIGGER_MESSAGE_TO_TOOL_NAME[type] || null;
  if (!toolName) {
    return createMcpRouteError(type, 'trigger', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'mcp_trigger_route_unknown',
      error: `Unknown trigger route message type ${type}`
    });
  }

  const dispatch = (typeof globalThis !== 'undefined') ? globalThis.fsbTriggerDispatchToolRequest : null;
  if (typeof dispatch !== 'function') {
    return createMcpRouteError(toolName, (route && route.routeFamily) || 'trigger', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'trigger_dispatch_unavailable',
      error: 'fsbTriggerDispatchToolRequest unavailable'
    });
  }

  const requestPayload = payload || {};
  const normalizedPayload = {
    ...requestPayload,
    tabId: requestPayload.tabId ?? requestPayload.tab_id ?? requestPayload.target_tab_id
  };
  const gateResult = checkOwnershipGate({
    tool: toolName,
    params: normalizedPayload,
    payload: normalizedPayload
  });
  if (gateResult) return gateResult;

  const context = {
    agentId: normalizedPayload.agentId,
    ownershipToken: normalizedPayload.ownershipToken,
    tabId: normalizedPayload.tabId,
    source: 'mcp'
  };
  return dispatch(toolName, normalizedPayload, context);
}

async function handleStartVisualSessionRoute({ payload, client }) {
  const { agentId } = payload || {};
  // Phase 240 D-09: agentId is threaded into handleStartMcpVisualSession so
  // the same-agent resume / cross-agent reject branch in
  // McpVisualSessionManager.startSession can fire on production dispatch.
  const clientLabel = _mcp_normalizeVisualClientLabel(payload?.clientLabel || payload?.client);
  if (!clientLabel) {
    return createMcpRouteError('start_visual_session', 'visual-session', 'Retry with one of the approved MCP client labels.', {
      errorCode: 'invalid_client_label',
      error: 'Unapproved MCP client label',
      clientLabel: payload?.clientLabel || payload?.client || null,
      allowedClients: _mcp_getAllowedVisualClientLabels()
    });
  }

  const task = boundedString(payload?.task, 500);
  if (!task) {
    return createMcpInvalidParamsError('start_visual_session', 'start_visual_session requires task', { routeFamily: 'visual-session' });
  }

  // Phase 246 D-09: resolver replaces active-tab fetch for MCP agents.
  // Single mental model across read/visual/action surfaces. Legacy:* and
  // missing-agentId callers preserve the prior active-tab path so existing
  // contract tests continue to behave byte-for-byte.
  let tab;
  let resolvedFromRegistry = false;
  const isLegacyOrMissingAgent = (typeof agentId !== 'string' || !agentId || agentId.startsWith('legacy:'));
  if (isLegacyOrMissingAgent) {
    tab = await getActiveTabFromClient(client);
    if (!tab?.id) {
      return createMcpRouteError('start_visual_session', 'visual-session', 'Use navigate, open_tab, switch_tab, or list_tabs to move to a normal webpage first.', {
        errorCode: 'no_active_tab',
        error: 'No active tab available for visual session'
      });
    }
  } else {
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, payload || {}, client)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return createMcpRouteError('start_visual_session', 'visual-session', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: resolved.code,
        error: 'Tab resolution failed: ' + resolved.code,
        agentId: resolved.agentId,
        ...(resolved.tabIds ? { tabIds: resolved.tabIds } : {})
      });
    }
    resolvedFromRegistry = true;
    // Registry path returned tabId only; fetch tab metadata for
    // restricted-page detection.
    try {
      tab = await chrome.tabs.get(resolved.tabId);
    } catch (_e) {
      return createMcpRouteError('start_visual_session', 'visual-session', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: 'tab_unavailable',
        error: 'Resolved tabId ' + resolved.tabId + ' could not be loaded'
      });
    }
    if (!tab?.id) {
      return createMcpRouteError('start_visual_session', 'visual-session', 'Use navigate, open_tab, switch_tab, or list_tabs to move to a normal webpage first.', {
        errorCode: 'no_active_tab',
        error: 'No active tab available for visual session'
      });
    }
  }
  // Reference resolvedFromRegistry to silence unused-var hints. The flag
  // is informational and may be consumed by future diagnostics.
  void resolvedFromRegistry;

  if (isRestrictedMcpUrl(tab.url || '')) {
    return buildRestrictedMcpResponse({
      currentUrl: tab.url || '',
      pageType: getPageTypeDescriptionForMcp(tab.url || ''),
      tool: 'start_visual_session',
      error: 'Active tab is restricted'
    });
  }

  if (hasActiveAutomationSessionForTab(tab.id)) {
    return createMcpRouteError('start_visual_session', 'visual-session', 'Wait for the current FSB automation to finish or stop it before starting a client-owned visual session.', {
      errorCode: 'visual_surface_busy',
      error: 'FSB automation already owns the active visual surface on this tab',
      tabId: tab.id
    });
  }

  return callCallbackHandler(
    'handleStartMcpVisualSession',
    {
      action: 'startMcpVisualSession',
      tabId: tab.id,
      clientLabel,
      task,
      detail: boundedString(payload?.detail, 1000),
      agentId: typeof agentId === 'string' && agentId ? agentId : null
    },
    { tab: { id: tab.id } }
  );
}

async function handleEndVisualSessionRoute({ payload }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const sessionToken = boundedString(payload?.sessionToken || payload?.session_token, 200);
  if (!sessionToken) {
    return createMcpInvalidParamsError('end_visual_session', 'end_visual_session requires sessionToken', { routeFamily: 'visual-session' });
  }

  return callCallbackHandler(
    'handleEndMcpVisualSession',
    {
      action: 'endMcpVisualSession',
      sessionToken,
      reason: boundedString(payload?.reason, 100)
    },
    {}
  );
}

// Phase 238: agent identity routes. Resolve through the Phase 237 registry
// surface (globalThis.fsbAgentRegistryInstance). Phase 240 will validate
// ownership at every dispatch boundary; Phase 238 is structural setup only.

function sanitizeMcpClientInfo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const sanitized = {};
  if (typeof value.name === 'string') sanitized.name = value.name.slice(0, 200);
  if (typeof value.version === 'string') sanitized.version = value.version.slice(0, 200);
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function isPlainMcpEvidenceMap(value) {
  return !!value && typeof value === 'object'
    && !Array.isArray(value)
    && Object.prototype.toString.call(value) === '[object Object]';
}

function runMcpAgentProviderWrite(method, ...args) {
  try {
    const providers = globalThis.FsbMcpAgentProviders;
    if (!providers || typeof providers[method] !== 'function') return;
    const result = providers[method](...args);
    if (result && typeof result.catch === 'function') {
      result.catch(() => { /* best-effort evidence write */ });
    }
  } catch (_e) { /* best-effort evidence write */ }
}

async function handleAgentRegisterRoute({ payload, client } = {}) {
  const reg = globalThis.fsbAgentRegistryInstance;
  if (!reg || typeof reg.registerAgent !== 'function') {
    return { success: false, errorCode: 'agent_registry_unavailable', error: 'AgentRegistry not initialized' };
  }
  // D-12: ignore caller-supplied agentId; registry mints fresh via crypto.randomUUID().
  const minted = await reg.registerAgent();
  // Phase 241 D-03: cap-rejection branch -- the registry returns a typed
  // AGENT_CAP_REACHED envelope when the active count is at the cap. Surface
  // it upstream as { success:false, code, cap, active } so the MCP server's
  // AgentScope can throw a typed error instead of treating the response as a
  // successful mint.
  if (minted && minted.code === 'AGENT_CAP_REACHED') {
    return {
      success: false,
      code: 'AGENT_CAP_REACHED',
      cap: minted.cap,
      active: minted.active
    };
  }
  const agentId = minted && minted.agentId;
  const agentIdShort = (minted && minted.agentIdShort)
    || ((globalThis.FsbAgentRegistry && typeof globalThis.FsbAgentRegistry.formatAgentIdForDisplay === 'function')
      ? globalThis.FsbAgentRegistry.formatAgentIdForDisplay(agentId || '')
      : (typeof agentId === 'string' ? agentId.slice(0, 12) : ''));
  // Phase 241 D-08: capture per-bridge connection_id from the caller's payload
  // and stamp it on the agent record so a later bridge onclose can stage all
  // matching agents for grace-window release. The bridge mints the UUID at
  // onopen and threads it through every agent:register; the registry's
  // findAgentByConnectionId path keys off this stamp.
  const connectionId = (payload && typeof payload.connectionId === 'string' && payload.connectionId.length > 0)
    ? payload.connectionId
    : (client && typeof client.getConnectionId === 'function' ? client.getConnectionId() : null);
  if (connectionId && typeof reg.stampConnectionId === 'function') {
    try { reg.stampConnectionId(agentId, connectionId); } catch (_e) { /* best-effort */ }
  }
  const clientInfo = sanitizeMcpClientInfo(payload && payload.clientInfo);
  if (clientInfo) {
    if (typeof reg.stampClientInfo === 'function') {
      try { reg.stampClientInfo(agentId, clientInfo); } catch (_e) { /* best-effort */ }
    }
    runMcpAgentProviderWrite('recordConnected', agentId, clientInfo);
  }
  if (isPlainMcpEvidenceMap(payload && payload.platforms)) {
    runMcpAgentProviderWrite('replaceInstalled', payload.platforms);
  }
  console.log('[FSB MCP Dispatcher] agent:register minted ' + agentIdShort);
  // Phase 272 / BEAT-09 sub-requirement: active-agent counter feeds the
  // telemetry beat's active_agent_count field. Read-modify-write under
  // best-effort semantics -- a dropped increment is acceptable telemetry
  // quality cost; throwing here would crash the MCP dispatch chokepoint.
  // Placed AFTER the cap check returns (so AGENT_CAP_REACHED does NOT
  // increment) and AFTER stampConnectionId (so connection_id binding still
  // races independently of counter writes).
  try {
    const cur = await chrome.storage.local.get(['fsbActiveAgentsCount']);
    const n = (cur && typeof cur.fsbActiveAgentsCount === 'number' && cur.fsbActiveAgentsCount >= 0)
      ? Math.floor(cur.fsbActiveAgentsCount)
      : 0;
    await chrome.storage.local.set({ fsbActiveAgentsCount: n + 1 });
  } catch (_e) { /* best-effort */ }
  // Phase 240 Open Q1 resolution: agent:register response carries an empty
  // ownershipTokens map at register time. Subsequent bindTab-firing handlers
  // include `ownershipToken: <new>` in their per-call response; the MCP
  // server's AgentScope (Plan 03 owns server-side AgentScope wiring)
  // accumulates them per-tab.
  // Phase 241 D-08: reflect connectionId on the response so AgentScope can
  // capture it (server-side) -- additive field; older callers ignore it.
  return { success: true, agentId, agentIdShort, ownershipTokens: {}, connectionId: connectionId };
}

async function handleAgentReleaseRoute({ payload } = {}) {
  const reg = globalThis.fsbAgentRegistryInstance;
  if (!reg || typeof reg.releaseAgent !== 'function') {
    return { success: false, errorCode: 'agent_registry_unavailable', error: 'AgentRegistry not initialized' };
  }
  const agentId = payload && payload.agentId;
  if (!agentId) {
    return createMcpInvalidParamsError('agent:release', 'agent:release requires agentId', { routeFamily: 'agent' });
  }
  const reason = (payload && payload.reason) || 'mcp-explicit';
  const result = await reg.releaseAgent(agentId, reason);
  // The Phase 237 registry returns a plain boolean today; future evolution may
  // return { released, releasedTabIds }. Accept either shape defensively.
  const released = (result === true) || !!(result && result.released);
  // Phase 272 / BEAT-09 sub-requirement: clamp-to-zero decrement on release.
  // Per CONTEXT.md "Guard against negative counts (clamp to 0)". Best-effort:
  // storage failures are swallowed so a dropped decrement never crashes the
  // dispatcher chokepoint (threat T-272-04 / T-272-08).
  if (released) {
    try {
      const cur = await chrome.storage.local.get(['fsbActiveAgentsCount']);
      const n = (cur && typeof cur.fsbActiveAgentsCount === 'number' && cur.fsbActiveAgentsCount > 0)
        ? Math.floor(cur.fsbActiveAgentsCount)
        : 0;
      await chrome.storage.local.set({ fsbActiveAgentsCount: Math.max(0, n - 1) });
    } catch (_e) { /* best-effort */ }
  }
  return { success: true, released };
}

async function handleAgentStatusRoute({ payload } = {}) {
  const reg = globalThis.fsbAgentRegistryInstance;
  if (!reg || typeof reg.getAgentTabs !== 'function') {
    return { success: false, errorCode: 'agent_registry_unavailable', error: 'AgentRegistry not initialized' };
  }
  const agentId = payload && payload.agentId;
  if (!agentId) {
    return createMcpInvalidParamsError('agent:status', 'agent:status requires agentId', { routeFamily: 'agent' });
  }
  const tabIds = reg.getAgentTabs(agentId) || [];
  const fmt = (globalThis.FsbAgentRegistry && typeof globalThis.FsbAgentRegistry.formatAgentIdForDisplay === 'function')
    ? globalThis.FsbAgentRegistry.formatAgentIdForDisplay
    : (id) => String(id || '').slice(0, 12);
  return { success: true, agentId, agentIdShort: fmt(agentId), tabIds };
}

async function handleStartAutomationRoute({ payload, client }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const tab = await getActiveTabFromClient(client);
  if (!tab?.id) {
    return createMcpRouteError('run_task', 'autopilot', 'Use navigate, open_tab, switch_tab, or list_tabs to move to a normal webpage first.', {
      errorCode: 'no_active_tab',
      error: 'No active tab available for automation'
    });
  }

  return callCallbackHandler(
    'handleStartAutomation',
    {
      action: 'startAutomation',
      task: payload.task,
      tabId: tab.id,
      source: 'mcp'
    },
    { tab: { id: tab.id } }
  );
}

async function handleStopAutomationRoute({ payload, client }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const tab = await getActiveTabFromClient(client).catch(() => null);

  // Phase 225-01 (Task 2): MCP stop_task tool ships no sessionId in its
  // schema, so payload.sessionId is undefined and handleStopAutomation cannot
  // find anything in storage. Resolve to the in-flight session via the active
  // sessions map (same source get_task_status uses for currentSessionId).
  let sessionId = payload && payload.sessionId;
  if (!sessionId) {
    const sessions = getActiveSessionsMap();
    const ids = Array.from(sessions.keys());
    if (ids.length > 0) {
      sessionId = ids[0];
      try {
        const redact = (typeof globalThis !== 'undefined' && typeof globalThis.redactForLog === 'function')
          ? globalThis.redactForLog
          : (v) => v;
        console.log('[FSB MCP] stop_task resolved in-flight session', redact({ sessionId }));
      } catch (_e) { /* logging never blocks dispatch */ }
    }
  }

  if (!sessionId) {
    return {
      success: false,
      errorCode: 'session_not_found',
      tool: 'stop_task',
      routeFamily: 'autopilot',
      error: 'No active automation session to stop',
      recoveryHint: 'Use get_task_status to confirm whether a session is running before calling stop_task.'
    };
  }

  return callCallbackHandler(
    'handleStopAutomation',
    {
      action: 'stopAutomation',
      sessionId
    },
    tab?.id ? { tab: { id: tab.id } } : {}
  );
}

async function handleGetStatusRoute({ payload } = {}) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
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

async function handleGetPageSnapshotRoute({ payload, client }) {
  const { agentId } = payload || {};
  // Phase 246 D-02: get_page_snapshot routes via the agent-scoped resolver.
  // Legacy:* agents fall through to active-tab semantics via the resolver's
  // first-line branch. Single-tab MCP agents auto-resolve; multi-tab agents
  // must pass tab_id to disambiguate (resolver returns AMBIGUOUS_TAB).
  const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
    ? globalThis.resolveAgentTabOrError(agentId, payload || {}, client)
    : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
  if (resolved.success === false) {
    return createMcpRouteError('get_page_snapshot', 'read-only', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: resolved.code,
      error: 'Tab resolution failed: ' + resolved.code,
      agentId: resolved.agentId,
      ...(resolved.tabIds ? { tabIds: resolved.tabIds } : {})
    });
  }

  // The resolver returns tabId only; restricted-page detection still needs
  // the URL, so fetch the tab metadata via chrome.tabs.get.
  let tab;
  try {
    tab = await chrome.tabs.get(resolved.tabId);
  } catch (_e) {
    return createMcpRouteError('get_page_snapshot', 'read-only', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'tab_unavailable',
      error: 'Resolved tabId ' + resolved.tabId + ' could not be loaded'
    });
  }

  if (isRestrictedMcpUrl(tab.url || '')) {
    return buildRestrictedMcpResponse({
      currentUrl: tab.url || '',
      pageType: getPageTypeDescriptionForMcp(tab.url || ''),
      tool: 'get_page_snapshot',
      error: 'Active tab is restricted'
    });
  }

  const charBudget = boundedPositiveInt(payload?.charBudget, 12000, 32000);
  const maxElements = boundedPositiveInt(payload?.maxElements, 80, 250);

  const sendToContentScript = (typeof client?._sendToContentScript === 'function')
    ? (tabId, message) => client._sendToContentScript(tabId, message)
    : (tabId, message) => new Promise((resolve, reject) => {
        try {
          getChromeTabsApi();
          chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response || {});
          });
        } catch (error) {
          reject(error);
        }
      });

  try {
    const response = await sendToContentScript(resolved.tabId, {
      action: 'getMarkdownSnapshot',
      options: { charBudget, maxElements }
    });
    if (response && response.success && response.markdownSnapshot) {
      return {
        success: true,
        tool: 'get_page_snapshot',
        snapshot: response.markdownSnapshot,
        elementCount: response.elementCount || 0,
        url: tab.url || '',
        tabId: resolved.tabId
      };
    }
    return createMcpRouteError('get_page_snapshot', 'read-only', MCP_ROUTE_RECOVERY_HINT, {
      error: (response && response.error) || 'Snapshot unavailable'
    });
  } catch (error) {
    return createMcpRouteError('get_page_snapshot', 'read-only', MCP_ROUTE_RECOVERY_HINT, {
      error: error.message || String(error)
    });
  }
}

async function handleGetSiteGuidesRoute({ payload }) {
  const task = payload.task || payload.query || '';
  const url = payload.url || payload.domain || '';
  let guide = null;

  if (task && typeof getGuideForTask === 'function') {
    guide = getGuideForTask(task, url);
  } else if (url && typeof getGuideForUrl === 'function') {
    guide = getGuideForUrl(url);
  }

  return { success: true, guide: guide || null };
}

async function handleGetDiagnosticsMessageRoute() {
  const helper = (typeof globalThis !== 'undefined' && typeof globalThis.collectMcpDiagnosticsSnapshot === 'function')
    ? globalThis.collectMcpDiagnosticsSnapshot
    : (typeof collectMcpDiagnosticsSnapshot === 'function' ? collectMcpDiagnosticsSnapshot : null);

  if (typeof helper !== 'function') {
    return createMcpRouteError('mcp:get-diagnostics', 'diagnostics', MCP_ROUTE_RECOVERY_HINT, {
      error: 'Background diagnostics helper unavailable'
    });
  }

  return helper();
}

async function handleListSessionsMessageRoute({ payload }) {
  if (typeof automationLogger === 'undefined' || typeof automationLogger?.listSessions !== 'function') {
    return createMcpRouteError('list_sessions', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Automation logger sessions unavailable' });
  }

  const limit = boundedPositiveInt(payload.limit, 50, 50);
  const sessions = await automationLogger.listSessions();
  return {
    success: true,
    sessions: (Array.isArray(sessions) ? sessions : []).slice(0, limit).map(sanitizeSessionMetadata).filter(Boolean)
  };
}

function buildInFlightSessionSnapshot(sessionId, session) {
  if (!session || typeof session !== 'object') return null;
  const lastAction = Array.isArray(session.actionHistory) && session.actionHistory.length > 0
    ? session.actionHistory[session.actionHistory.length - 1]
    : null;
  return {
    sessionId,
    final: false,
    status: session.status || 'in-flight',
    startedAt: session.startTime || null,
    iterationCount: session.iterationCount || 0,
    maxIterations: session.maxIterations || null,
    actionCount: Array.isArray(session.actionHistory) ? session.actionHistory.length : 0,
    currentAction: lastAction ? sanitizeActionHistoryEntry(lastAction) : null,
    taskDescription: typeof session.task === 'string' ? boundedString(session.task, 500) : null,
    tabId: typeof session.tabId === 'number' ? session.tabId : null,
    lastUrl: typeof session.lastUrl === 'string' ? session.lastUrl : null,
    note: 'In-flight session: no terminal outcome yet. Re-query after completion (or via list_sessions) for full history.'
  };
}

async function handleGetSessionMessageRoute({ payload }) {
  if (!payload.sessionId) {
    return createMcpInvalidParamsError('get_session_detail', 'get_session_detail requires sessionId', { routeFamily: 'observability' });
  }
  if (typeof automationLogger === 'undefined' || typeof automationLogger?.loadSession !== 'function') {
    return createMcpRouteError('get_session_detail', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Automation logger session loader unavailable' });
  }

  const session = await automationLogger.loadSession(payload.sessionId);
  if (session) {
    return {
      success: true,
      session: sanitizeSessionDetail(session)
    };
  }

  // Phase 225-01 (Task 2): historical lookup missed -- fall back to in-flight
  // sessions. Active sessions live in the activeSessions map (same source
  // currentSessionId is derived from in handleGetStatusRoute) and are NOT yet
  // in the history store. Without this fallback, get_session_detail returns
  // "Session not found" while the session is actively running.
  const activeSessions = getActiveSessionsMap();
  const liveSession = activeSessions.get(payload.sessionId);
  if (liveSession) {
    try {
      const redact = (typeof globalThis !== 'undefined' && typeof globalThis.redactForLog === 'function')
        ? globalThis.redactForLog
        : (v) => v;
      console.log('[FSB MCP] get_session_detail resolved in-flight session', redact({ sessionId: payload.sessionId, status: liveSession.status }));
    } catch (_e) { /* logging never blocks dispatch */ }
    return {
      success: true,
      session: buildInFlightSessionSnapshot(payload.sessionId, liveSession),
      inFlight: true
    };
  }

  return {
    success: false,
    errorCode: 'session_not_found',
    tool: 'get_session_detail',
    routeFamily: 'observability',
    error: `Session ${payload.sessionId} not found in active or historical sessions`,
    recoveryHint: 'Use list_sessions to see historical sessions, or get_task_status to check for an active session.'
  };
}

async function handleGetLogsMessageRoute({ payload }) {
  if (typeof automationLogger === 'undefined') {
    return createMcpRouteError('get_logs', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Automation logger unavailable' });
  }

  const requestedLimit = payload.count || payload.limit || 50;
  const logs = payload.sessionId && typeof automationLogger.getSessionLogs === 'function'
    ? automationLogger.getSessionLogs(payload.sessionId)
    : typeof automationLogger.getRecentLogs === 'function'
      ? automationLogger.getRecentLogs(boundedPositiveInt(requestedLimit, 50, 200))
      : [];
  const sanitizedLogs = filterAndCapLogs(logs, requestedLimit);
  return {
    success: true,
    logs: sanitizedLogs,
    count: sanitizedLogs.length
  };
}

async function handleSearchMemoryMessageRoute({ payload }) {
  if (typeof memoryManager === 'undefined' || typeof memoryManager?.search !== 'function') {
    return createMcpRouteError('search_memory', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Memory search unavailable' });
  }

  const filters = payload.filters || {
    ...(payload.domain ? { domain: payload.domain } : {}),
    ...(payload.type ? { type: payload.type } : {})
  };
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

// Phase 28 SURF-01: read-only capability search. Non-legacy MCP agents resolve
// the owned tab before origin biasing (D-11); payload.origin is only an expected
// origin hint on that path. Legacy/missing-agent callers keep active-tab/origin-
// override compatibility. Returns { success:true, results } capped at <=5 hits.
async function handleCapabilitiesSearchMessageRoute({ payload, client }) {
  if (typeof FsbCapabilitySearch === 'undefined' || typeof FsbCapabilitySearch.search !== 'function') {
    return createMcpRouteError('search_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability search unavailable' });
  }
  payload = payload || {};
  const { agentId } = payload;
  const isLegacyOrMissingAgent = (typeof agentId !== 'string' || !agentId || agentId.startsWith('legacy:'));

  let ownedOrigin = null;
  if (isLegacyOrMissingAgent) {
    ownedOrigin = payload.origin || null;
    if (!ownedOrigin) {
      const requestedTabId = Number.isFinite(payload.tab_id) ? payload.tab_id : null;
      try {
        const tab = requestedTabId !== null ? await chrome.tabs.get(requestedTabId) : await getActiveTabFromClient(client);
        ownedOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
      } catch (e) {
        ownedOrigin = null;
      }
    }
  } else {
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, payload || {}, client)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return createMcpRouteError('search_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: resolved.code,
        error: 'Tab resolution failed: ' + resolved.code,
        agentId: resolved.agentId,
        ...(resolved.tabIds ? { tabIds: resolved.tabIds } : {})
      });
    }
    let tab = null;
    try {
      tab = await chrome.tabs.get(resolved.tabId);
    } catch (_e) {
      return createMcpRouteError('search_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: 'tab_unavailable',
        error: 'Resolved tabId ' + resolved.tabId + ' could not be loaded'
      });
    }
    try {
      ownedOrigin = (tab && tab.url) ? new URL(tab.url).origin : null;
    } catch (_e) {
      ownedOrigin = null;
    }
    if (payload.origin && ownedOrigin && payload.origin !== ownedOrigin) {
      return createMcpRouteError('search_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: 'RECIPE_CONSENT_REQUIRED',
        error: 'RECIPE_CONSENT_REQUIRED',
        reason: 'supplied origin does not match the target tab origin'
      });
    }
  }
  const topN = boundedPositiveInt(payload.topN, 5, 5);
  const results = FsbCapabilitySearch.search(payload.query || '', ownedOrigin, topN);
  return { success: true, results };
}

// Phase 29 SURF/CAT D-03 (the internal-only reroute): invoke now calls the shared
// FsbCapabilityRouter.invoke(...) -- the ONE engine both front doors hit (INV-02). The old
// routerless body (getRecipeBySlug -> interpretRecipe -> executeBoundSpec) moved INTO the
// router's T1b tier (Plan 02); this handler is now a single router call. The wire names and
// the route table are byte-unchanged, so the frozen INV-01 registry hash never moves and the
// two capability tools stay OUTSIDE TOOL_REGISTRY. The target tab is resolved
// SW-side: non-legacy MCP agents must pass through the ownership-aware agent
// resolver, while legacy/missing-agent callers preserve the active/explicit-tab
// path. The origin is then derived from the ACTUAL resolved tab; payload.origin is
// only accepted as a matching hint. The router routes but never re-targets -- the
// two-point origin-pin still holds downstream in executeBoundSpec. Typed RECIPE_*
// fall-through reasons (RECIPE_NOT_FOUND / RECIPE_LEARN_PENDING /
// RECIPE_DOM_FALLBACK_PENDING) surface verbatim via the existing errors.ts
// /^RECIPE_.+$/ passthrough (no errors.ts edit). The reroute is internal-only --
// there is no second invoke path (INV-02).
async function handleCapabilitiesInvokeMessageRoute({ payload, client }) {
  if (typeof FsbCapabilityRouter === 'undefined' || typeof FsbCapabilityRouter.invoke !== 'function') {
    return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability router unavailable' });
  }
  payload = payload || {};
  const { agentId } = payload;
  const isLegacyOrMissingAgent = (typeof agentId !== 'string' || !agentId || agentId.startsWith('legacy:'));

  let tab = null;
  if (isLegacyOrMissingAgent) {
    const requestedTabId = Number.isFinite(payload.tab_id) ? payload.tab_id : null;
    try {
      tab = requestedTabId !== null ? await chrome.tabs.get(requestedTabId) : await getActiveTabFromClient(client);
    } catch (_e) {
      tab = null;
    }
  } else {
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, payload || {}, client)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: resolved.code,
        error: 'Tab resolution failed: ' + resolved.code,
        agentId: resolved.agentId,
        ...(resolved.tabIds ? { tabIds: resolved.tabIds } : {})
      });
    }
    try {
      tab = await chrome.tabs.get(resolved.tabId);
    } catch (_e) {
      return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT, {
        errorCode: 'tab_unavailable',
        error: 'Resolved tabId ' + resolved.tabId + ' could not be loaded'
      });
    }
  }

  const tabId = Number.isFinite(tab?.id) ? tab.id : null;
  let origin = null;
  try {
    origin = (tab && tab.url) ? new URL(tab.url).origin : null;
  } catch (_e) {
    origin = null;
  }
  if (payload.origin && origin && payload.origin !== origin) {
    return createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT, {
      errorCode: 'RECIPE_CONSENT_REQUIRED',
      error: 'RECIPE_CONSENT_REQUIRED',
      reason: 'supplied origin does not match the target tab origin'
    });
  }
  // Capability-call overlay treatment: emit a distinct "calling" status
  // before dispatch and a "guarded" status on a typed pending/blocked
  // result, so the on-page overlay shows something other than the generic
  // DOM-action phases for a first-party API call. capability-router.js
  // itself stays untouched (pure module, no chrome.* access by charter) --
  // this is presentation-layer instrumentation at the front door only.
  // A cheap, side-effect-free resolve() preview (the same pure lookup
  // invoke() performs internally) gives us descriptor/tier for the chip,
  // without duplicating router dispatch logic.
  if (tabId !== null) {
    try {
      var previewEntry = (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
        && typeof FsbCapabilityCatalog.resolve === 'function')
        ? FsbCapabilityCatalog.resolve(payload.slug, origin)
        : null;
      var previewService = (previewEntry && previewEntry.descriptor && previewEntry.descriptor.service) || origin || '';
      var previewReady = !!(previewEntry && (previewEntry.tier === 'T1a' || previewEntry.tier === 'T1b' || previewEntry.tier === 'T0'));
      var previewStoppable = Array.from(getActiveSessionsMap().values()).some(function(s) { return s && s.tabId === tabId && s.status === 'running'; });
      sendSessionStatus(tabId, {
        phase: 'calling',
        guarded: false,
        capability: {
          chipText: previewService + ' · ' + String(payload.slug || ''),
          guarded: false,
          readinessLabel: previewReady ? 'T1 ready' : 'Guarded',
          readinessClass: previewReady ? 'ready' : 'guarded',
          noteText: null
        },
        stoppable: previewStoppable
      });
    } catch (_previewErr) {
      // Non-blocking: overlay preview is best-effort, never gates the real invoke.
    }
  }

  var invokeResult = await FsbCapabilityRouter.invoke(payload.slug, payload.params || {}, {
    origin,
    tabId,
    url: (tab && typeof tab.url === 'string') ? tab.url : ''
  });

  if (tabId !== null && invokeResult && invokeResult.success === false && invokeResult.code) {
    try {
      var guardedNoteText = (typeof FSBOverlayStateUtils !== 'undefined' && FSBOverlayStateUtils.mapCapabilityErrorToNote)
        ? FSBOverlayStateUtils.mapCapabilityErrorToNote(invokeResult.code)
        : null;
      if (guardedNoteText) {
        sendSessionStatus(tabId, {
          phase: 'calling',
          guarded: true,
          capability: {
            chipText: (origin || '') + ' · ' + String(payload.slug || ''),
            guarded: true,
            noteText: guardedNoteText
          },
          stoppable: false
        });
      }
    } catch (_guardedErr) {
      // Non-blocking: overlay status is best-effort, never alters the real result.
    }
  }

  return invokeResult;
}

// Phase 31 DISC-01 / D-01: the user-initiated, time-boxed discovery trigger. This
// INTERNAL-ONLY route resolves the attach target SW-side: tabId comes from explicit
// payload.tab_id, else the active/owned tab. The session origin is then read from the
// ACTUAL resolved tab (chrome.tabs.get -> new URL(tab.url).origin), NOT from
// payload.origin (ME-02): because the debugger attaches to tabId and the consent gate
// must apply to the origin that is actually attached, the gated origin is derived from
// the un-spoofable tab origin (the D-11 pattern). A supplied payload.origin is a hint
// that must MATCH the tab's real origin or the route rejects (RECIPE_CONSENT_REQUIRED)
// -- a caller can no longer pair a consented origin with a different tab to land the
// debugger banner on an un-gated origin. It then runs the promote-after-replay
// discovery session (FsbDiscoverySession.runDiscovery), which itself enforces the
// Phase-30 consent gate INSIDE FsbNetworkCapture.startSession BEFORE any debugger
// attach (a default-OFF / denied / sensitive-unconfirmed origin returns a
// RECIPE_CONSENT_* reason and NOTHING is captured). This route registers via the
// message-route table ONLY -- it is NOT added to TOOL_REGISTRY and NOT to
// getPublicTools (INV-01): the discovery trigger is a control surface, not an MCP
// tool schema, so the frozen tool-definitions parity hash never moves. The session
// bounds (maxMs/maxCount) fall back to the capture module's own defaults when absent;
// confirmed_sensitive is threaded as the extra-confirm flag for a sensitive origin.
async function handleCapabilitiesDiscoverMessageRoute({ payload }) {
  if (typeof FsbDiscoverySession === 'undefined' || typeof FsbDiscoverySession.runDiscovery !== 'function') {
    return createMcpRouteError('discover_capabilities', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability discovery unavailable' });
  }
  payload = payload || {};
  // Resolve tabId SW-side: explicit payload.tab_id, else the active/owned tab.
  let tabId = Number.isFinite(payload.tab_id) ? payload.tab_id : null;
  if (tabId === null) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0] ? tabs[0].id : null;
    } catch (e) {
      // active-tab lookup failed; leave tabId null. The consent gate + same-origin
      // filter inside the capture session fail closed on a null origin/tabId.
    }
  }
  // ME-02: resolve the AUTHORITATIVE origin from the ACTUAL resolved tab (the
  // un-spoofable D-11 pattern the invoke path uses), NOT from payload.origin. The
  // discovery session attaches the debugger to `tabId` and surfaces the "DevTools is
  // debugging this tab" banner on it; the Phase-30 consent gate must therefore be
  // evaluated against the origin that is actually attached. Taking the origin from a
  // caller-supplied payload.origin verbatim let a caller pair origin=benign.com
  // (consented, non-sensitive) with tab_id=<a bank.com tab>, so the gate passed for
  // benign.com while the attach + banner landed on the un-gated bank.com. We read the
  // real origin from the tab and gate THAT.
  let origin = null;
  if (tabId !== null) {
    try {
      const tab = await chrome.tabs.get(tabId);
      origin = (tab && tab.url) ? new URL(tab.url).origin : null;
    } catch (e) {
      // tab lookup/URL parse failed; leave origin null -> the gate fails closed.
      origin = null;
    }
  }
  // If the caller ALSO supplied payload.origin, it is a non-authoritative hint: it
  // must MATCH the tab's real origin or we reject (the gated origin and the attach
  // target must be the same value). A mismatch is a spoof attempt -> fail closed.
  if (payload.origin && origin && payload.origin !== origin) {
    return createMcpRouteError(
      'discover_capabilities',
      'capabilities',
      MCP_ROUTE_RECOVERY_HINT,
      { error: 'RECIPE_CONSENT_REQUIRED', reason: 'supplied origin does not match the target tab origin' }
    );
  }
  // Session bounds: explicit numeric overrides only; otherwise undefined so the
  // capture module applies its own DEFAULT_MAX_MS / DEFAULT_MAX_COUNT.
  const maxMs = Number.isFinite(payload.max_ms) ? payload.max_ms : undefined;
  const maxCount = Number.isFinite(payload.max_count) ? payload.max_count : undefined;
  return await FsbDiscoverySession.runDiscovery(origin, {
    tabId,
    maxMs,
    maxCount,
    confirmedSensitive: !!payload.confirmed_sensitive
  });
}

async function handleGetMemoryMessageRoute({ payload }) {
  if (typeof memoryManager === 'undefined' || typeof memoryManager?.getAll !== 'function') {
    return createMcpRouteError('get_memory_stats', 'observability', MCP_ROUTE_RECOVERY_HINT, { error: 'Memory manager unavailable' });
  }

  const memories = await memoryManager.getAll();
  const memoryList = Array.isArray(memories) ? memories : [];
  if (payload.statsOnly === true) {
    const byType = {};
    for (const memory of memoryList) {
      const type = memory?.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }
    return {
      success: true,
      stats: {
        total: memoryList.length,
        byType,
        storageUsageBytes: getMemoryListStorageUsageBytes(memoryList)
      }
    };
  }

  const limit = boundedPositiveInt(payload.limit, 25, 100);
  return {
    success: true,
    memories: memoryList.slice(0, limit).map(sanitizeMemoryEntry),
    total: memoryList.length
  };
}

async function handleReportProgressRoute({ params, payload }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const message = boundedString(params?.message, 500);
  if (!message) {
    return createMcpInvalidParamsError('report_progress', 'report_progress requires message', { routeFamily: 'task-status' });
  }

  const sessionToken = boundedString(params?.session_token || params?.sessionToken, 200);
  if (sessionToken) {
    return callCallbackHandler(
      'handleMcpVisualSessionTaskStatus',
      {
        action: 'mcpVisualSessionTaskStatus',
        tool: 'report_progress',
        sessionToken,
        message
      },
      {},
      'visual-session'
    );
  }

  if (typeof automationLogger !== 'undefined' && automationLogger?.info) {
    automationLogger.info('MCP progress report', { message });
  }

  return { success: true, tool: 'report_progress', hadEffect: false, message };
}

async function handleCompleteTaskRoute({ params, payload }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const summary = boundedString(params?.summary, 2000);
  if (!summary) {
    return createMcpInvalidParamsError('complete_task', 'complete_task requires summary', { routeFamily: 'task-status' });
  }

  const sessionToken = boundedString(params?.session_token || params?.sessionToken, 200);
  if (sessionToken) {
    return callCallbackHandler(
      'handleMcpVisualSessionTaskStatus',
      {
        action: 'mcpVisualSessionTaskStatus',
        tool: 'complete_task',
        sessionToken,
        summary
      },
      {},
      'visual-session'
    );
  }

  return { success: true, tool: 'complete_task', status: 'completed', hadEffect: false, summary };
}

async function handlePartialTaskRoute({ params, payload }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const summary = boundedString(params?.summary, 2000);
  const blocker = boundedString(params?.blocker, 1000);
  if (!summary || !blocker) {
    return createMcpInvalidParamsError('partial_task', 'partial_task requires summary and blocker', { routeFamily: 'task-status' });
  }

  const nextStep = boundedString(params?.next_step, 1000);
  const reason = boundedString(params?.reason, 100);
  const sessionToken = boundedString(params?.session_token || params?.sessionToken, 200);
  if (sessionToken) {
    return callCallbackHandler(
      'handleMcpVisualSessionTaskStatus',
      {
        action: 'mcpVisualSessionTaskStatus',
        tool: 'partial_task',
        sessionToken,
        summary,
        blocker,
        ...(nextStep ? { nextStep } : {}),
        ...(reason ? { reason } : {})
      },
      {},
      'visual-session'
    );
  }

  return {
    success: true,
    tool: 'partial_task',
    status: 'partial',
    hadEffect: false,
    summary,
    blocker,
    ...(nextStep ? { nextStep } : {}),
    ...(reason ? { reason } : {})
  };
}

async function handleFailTaskRoute({ params, payload }) {
  const { agentId } = payload || {};
  // Phase 240 will validate agent_id; Phase 238 deliberately ignores it.
  void agentId;
  const reason = boundedString(params?.reason, 1000);
  if (!reason) {
    return createMcpInvalidParamsError('fail_task', 'fail_task requires reason', { routeFamily: 'task-status' });
  }

  const sessionToken = boundedString(params?.session_token || params?.sessionToken, 200);
  if (sessionToken) {
    return callCallbackHandler(
      'handleMcpVisualSessionTaskStatus',
      {
        action: 'mcpVisualSessionTaskStatus',
        tool: 'fail_task',
        sessionToken,
        reason
      },
      {},
      'visual-session'
    );
  }

  return { success: false, tool: 'fail_task', status: 'failed', hadEffect: false, error: reason, reason };
}

// =============================================================================
// Phase 245 -- change_report harvest wrap-around (D-01 / D-04 / D-07 / D-09)
// =============================================================================
//
// wrapWithChangeReport orchestrates a MutationObserver harvest before/after
// any dispatched action tool when:
//   1. The tool's _emitChangeReport flag is true (D-05/D-06)
//   2. fsbChangeReportsEnabled is true (D-07)
// Otherwise it just runs the action with zero overhead.
//
// Architecture:
// - Page-context harvest is injected via chrome.scripting.executeScript so the
//   observer can see real DOM mutations. before/after page state are captured
//   in the same injected calls.
// - buildChangeReport / applyChangeReportSizeCap are pure functions that come
//   from utils/action-verification.js (importScripted into the SW). They run
//   in SW context with serialized mutation records.
// - 500ms safety net (D-09) caps total wait. partial:true is set on hit.
// - Cross-origin transition (D-08) skips DOM inspection and emits URL-only
//   report with cross_origin:true.
// - All harvest failures are swallowed (try/catch); the underlying action
//   result is never blocked by report failures.
//
// Returns the original response with `change_report` (and optionally
// `change_report_hint`) attached, or the unmodified response on any error.

const _CHANGE_REPORT_SAFETY_NET_MS = 500;

// Page-context harvest start: captures beforeState and starts a scoped
// MutationObserver. Stores the handle on window.__fsbChangeReportHandle.
// This function is serialized and injected via chrome.scripting.executeScript;
// it must be self-contained (no closures over SW scope).
function _fsbHarvestStartInPage(targetSelector) {
  try {
    function getClassName(el) {
      if (!el) return '';
      const cn = el.className;
      if (typeof cn === 'string') return cn;
      if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
      return '';
    }
    function buildSel(el) {
      if (!el || typeof el.tagName !== 'string') return null;
      const id = (typeof el.getAttribute === 'function') ? el.getAttribute('id') : null;
      if (id) return '#' + id;
      const cn = getClassName(el);
      if (cn) {
        const first = cn.trim().split(/\s+/)[0];
        if (first) return el.tagName.toLowerCase() + '.' + first;
      }
      return el.tagName.toLowerCase();
    }
    function captureState() {
      const state = {
        url: window.location.href,
        title: document.title,
        elementCount: document.querySelectorAll('*').length,
        inputValues: {},
        activeElementSelector: null,
        timestamp: Date.now()
      };
      const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
      for (let i = 0; i < inputs.length && i < 20; i++) {
        const inp = inputs[i];
        const key = inp.id || inp.name || ('input_' + i);
        state.inputValues[key] = inp.value || inp.textContent || '';
      }
      const ae = document.activeElement;
      if (ae && ae !== document.body) state.activeElementSelector = buildSel(ae);
      return state;
    }
    function resolveScope(sel) {
      let target = null;
      if (sel) { try { target = document.querySelector(sel); } catch (_) { target = null; } }
      if (!target) return document.documentElement;
      let cur = target.parentElement, steps = 0;
      while (cur && steps < 3) {
        const tag = (cur.tagName || '').toLowerCase();
        if (tag === 'form' || tag === 'dialog' || tag === 'main') return cur;
        cur = cur.parentElement; steps++;
      }
      return cur || target.parentElement || document.documentElement;
    }
    const beforeState = captureState();
    const root = resolveScope(targetSelector);
    if (typeof MutationObserver === 'undefined' || !root) {
      window.__fsbChangeReportHandle = { beforeState, mutations: [], startedAt: Date.now(), noObserver: true };
      return { ok: true, beforeState };
    }
    const handle = { beforeState, mutations: [], startedAt: Date.now() };
    const observer = new MutationObserver((records) => {
      for (let i = 0; i < records.length; i++) handle.mutations.push(records[i]);
    });
    try {
      observer.observe(root, {
        subtree: true, childList: true,
        attributes: true, attributeOldValue: true,
        characterData: true, characterDataOldValue: true
      });
      handle.observer = observer;
    } catch (_) { /* observation failed; handle continues with empty mutations */ }
    window.__fsbChangeReportHandle = handle;
    return { ok: true, beforeState };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// Page-context harvest stop: serializes mutation records, captures afterState,
// disconnects the observer, returns plain-data shape buildChangeReport accepts.
function _fsbHarvestStopInPage() {
  try {
    function getClassName(el) {
      if (!el) return '';
      const cn = el.className;
      if (typeof cn === 'string') return cn;
      if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
      return '';
    }
    function buildSel(el) {
      if (!el || typeof el.tagName !== 'string') return null;
      const id = (typeof el.getAttribute === 'function') ? el.getAttribute('id') : null;
      if (id) return '#' + id;
      const cn = getClassName(el);
      if (cn) {
        const first = cn.trim().split(/\s+/)[0];
        if (first) return el.tagName.toLowerCase() + '.' + first;
      }
      return el.tagName.toLowerCase();
    }
    function captureState() {
      const state = {
        url: window.location.href,
        title: document.title,
        elementCount: document.querySelectorAll('*').length,
        inputValues: {},
        activeElementSelector: null,
        timestamp: Date.now()
      };
      const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
      for (let i = 0; i < inputs.length && i < 20; i++) {
        const inp = inputs[i];
        const key = inp.id || inp.name || ('input_' + i);
        state.inputValues[key] = inp.value || inp.textContent || '';
      }
      const ae = document.activeElement;
      if (ae && ae !== document.body) state.activeElementSelector = buildSel(ae);
      return state;
    }
    function serializeNode(n) {
      if (!n) return null;
      // Some properties (className via SVGAnimatedString) require special handling;
      // we pre-compute selector + tag + text snippet so the SW-side builder
      // does not need DOM access.
      const tag = (typeof n.tagName === 'string') ? n.tagName : null;
      if (!tag) return { tagName: null }; // text/comment node placeholder
      const id = (typeof n.getAttribute === 'function') ? n.getAttribute('id') : null;
      const cn = getClassName(n);
      // Preserve buildNodeSelector heuristic results so SW-side builder logic
      // produces identical selectors.
      const text = (n.textContent || '').slice(0, 200);
      const role = (typeof n.getAttribute === 'function') ? n.getAttribute('role') : null;
      const isDialog = (tag.toLowerCase() === 'dialog')
        || role === 'dialog' || role === 'alertdialog'
        || (cn && /(^|\s)(modal|popup)(\s|$)/i.test(cn));
      const offsetWidth = (typeof n.offsetWidth === 'number') ? n.offsetWidth : 0;
      // Synthesize the fields the SW-side buildChangeReport reads:
      // tagName (for `typeof === 'string'` check), getAttribute (for selector
      // + role + isDialog), className (for selector), textContent (for snippet),
      // offsetWidth (for visibility check inside isDialogNode).
      return {
        tagName: tag,
        _id: id,
        _className: cn,
        _role: role,
        _isDialog: isDialog && offsetWidth > 0,
        _text: text,
        _selector: id ? ('#' + id) : (cn ? (tag.toLowerCase() + '.' + cn.trim().split(/\s+/)[0]) : tag.toLowerCase()),
        offsetWidth: offsetWidth,
        // Synthesize getAttribute on the wire so SW-side filter rules
        // (isNoiseMutation reads attributeName, oldValue) keep working when
        // pushed through this serializer.
        getAttribute(name) {
          if (name === 'id') return this._id;
          if (name === 'class') return this._className;
          if (name === 'role') return this._role;
          return null;
        },
        get className() { return this._className; }
      };
    }
    const handle = window.__fsbChangeReportHandle;
    if (!handle) return { ok: true, mutations: [], afterState: captureState(), settle_ms: 0 };
    if (handle.observer && typeof handle.observer.disconnect === 'function') {
      try { handle.observer.disconnect(); } catch (_) { /* idempotent */ }
    }
    const settle_ms = Date.now() - (handle.startedAt || Date.now());
    const serialized = [];
    for (let i = 0; i < handle.mutations.length; i++) {
      const rec = handle.mutations[i];
      const added = [];
      if (rec.addedNodes) for (let j = 0; j < rec.addedNodes.length; j++) added.push(serializeNode(rec.addedNodes[j]));
      const removed = [];
      if (rec.removedNodes) for (let j = 0; j < rec.removedNodes.length; j++) removed.push(serializeNode(rec.removedNodes[j]));
      serialized.push({
        type: rec.type,
        attributeName: rec.attributeName || null,
        oldValue: rec.oldValue == null ? null : String(rec.oldValue),
        target: serializeNode(rec.target),
        addedNodes: added,
        removedNodes: removed
      });
    }
    const afterState = captureState();
    delete window.__fsbChangeReportHandle;
    return { ok: true, mutations: serialized, afterState, settle_ms };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// Wait for DOM-stable in the page (no mutations for 300ms). Best-effort; the
// safety net in the SW caller caps total wait at 500ms.
function _fsbWaitStableInPage() {
  try {
    return new Promise((resolve) => {
      let lastTick = Date.now();
      const target = document.body || document.documentElement;
      if (!target || typeof MutationObserver === 'undefined') return resolve(true);
      const obs = new MutationObserver(() => { lastTick = Date.now(); });
      obs.observe(target, { subtree: true, childList: true, attributes: true });
      const interval = setInterval(() => {
        if (Date.now() - lastTick > 300) {
          obs.disconnect();
          clearInterval(interval);
          resolve(true);
        }
      }, 50);
      // Hard cap at 450ms (under 500ms safety net) so SW-side race resolves
      // cleanly without leaking the interval.
      setTimeout(() => { try { obs.disconnect(); clearInterval(interval); resolve(true); } catch (_) {} }, 450);
    });
  } catch (_) { return Promise.resolve(true); }
}

// Resolve the buildChangeReport / applyChangeReportSizeCap exports. In SW
// context they live on globalThis (importScripts'd). In Node tests they
// live on require().
function _resolveChangeReportBuilders() {
  if (typeof buildChangeReport === 'function' && typeof applyChangeReportSizeCap === 'function') {
    return { buildChangeReport, applyChangeReportSizeCap };
  }
  if (typeof globalThis !== 'undefined'
      && typeof globalThis.buildChangeReport === 'function'
      && typeof globalThis.applyChangeReportSizeCap === 'function') {
    return {
      buildChangeReport: globalThis.buildChangeReport,
      applyChangeReportSizeCap: globalThis.applyChangeReportSizeCap
    };
  }
  if (typeof require !== 'undefined') {
    try {
      const av = require('../utils/action-verification.js');
      if (av && typeof av.buildChangeReport === 'function' && typeof av.applyChangeReportSizeCap === 'function') {
        return av;
      }
    } catch (_) { /* not available */ }
  }
  return null;
}

function _resolveTargetSelector(params) {
  if (!params || typeof params !== 'object') return null;
  if (typeof params.selector === 'string' && params.selector.length > 0) return params.selector;
  if (typeof params.elementId === 'string' && params.elementId.length > 0) return params.elementId;
  if (typeof params.sourceSelector === 'string' && params.sourceSelector.length > 0) return params.sourceSelector;
  return null;
}

async function _injectFn(tabId, func, args) {
  if (typeof chrome === 'undefined' || !chrome.scripting || typeof chrome.scripting.executeScript !== 'function') {
    return null;
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args: args || []
    });
    return results && results[0] ? results[0].result : null;
  } catch (_) {
    return null;
  }
}

async function _safeGetTabUrl(tabId) {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.get !== 'function') return null;
    const t = await chrome.tabs.get(tabId);
    return (t && typeof t.url === 'string') ? t.url : null;
  } catch (_) { return null; }
}

function _originOf(url) {
  if (!url) return null;
  try { return new URL(url).origin; } catch (_) { return null; }
}

/**
 * Wrap an action tool dispatch with a change_report harvest.
 *
 * @param {Object} ctx
 * @param {string} ctx.toolName
 * @param {number|null} ctx.tabId
 * @param {Object} ctx.params
 * @param {Function} ctx.execute - async () => response  (the actual tool dispatch)
 * @returns {Promise<Object>} response, possibly with .change_report attached
 */
async function wrapWithChangeReport(ctx) {
  const toolName = ctx && ctx.toolName;
  const tabId = ctx && Number.isFinite(ctx.tabId) ? ctx.tabId : null;
  const params = (ctx && ctx.params) || {};
  const execute = ctx && ctx.execute;
  if (typeof execute !== 'function') {
    return { success: false, error: 'wrapWithChangeReport requires execute callback' };
  }

  // Gate 1: per-tool flag
  const toolDef = (typeof _mcp_getToolByName === 'function') ? _mcp_getToolByName(toolName) : null;
  const flagOn = !!(toolDef && toolDef._emitChangeReport === true);
  // Gate 2: global toggle
  const globalOn = !!fsbChangeReportsEnabled;

  if (!flagOn || !globalOn || !Number.isFinite(tabId)) {
    return execute();
  }

  // Begin harvest. If injection fails (cross-origin start, restricted page,
  // missing chrome.scripting), skip wrap and run action without change_report.
  const beforeUrl = await _safeGetTabUrl(tabId);
  const targetSelector = _resolveTargetSelector(params);
  const startResult = await _injectFn(tabId, _fsbHarvestStartInPage, [targetSelector]);
  const startedHarvest = !!(startResult && startResult.ok);

  let response;
  try {
    response = await execute();
  } catch (err) {
    // Surface the error; harvest cleanup happens below.
    response = { success: false, error: err && err.message ? err.message : String(err) };
  }

  if (!startedHarvest) return response;

  // Race waitStable vs 500ms safety net. partial:true on safety hit.
  let partial = false;
  try {
    const stableP = _injectFn(tabId, _fsbWaitStableInPage, []);
    const safetyP = new Promise((resolve) => setTimeout(() => resolve('safety'), _CHANGE_REPORT_SAFETY_NET_MS));
    const winner = await Promise.race([stableP, safetyP]);
    partial = (winner === 'safety');
  } catch (_) { partial = true; }

  try {
    const afterUrl = await _safeGetTabUrl(tabId);
    const beforeOrigin = _originOf(beforeUrl);
    const afterOrigin = _originOf(afterUrl);
    const crossOrigin = !!(beforeOrigin && afterOrigin && beforeOrigin !== afterOrigin);

    let stop = null;
    if (!crossOrigin) {
      stop = await _injectFn(tabId, _fsbHarvestStopInPage, []);
    }

    const builders = _resolveChangeReportBuilders();
    if (!builders) {
      // Builder unavailable; clean up the page-side handle and skip.
      if (!crossOrigin) await _injectFn(tabId, _fsbHarvestStopInPage, []);
      return response;
    }

    let beforeState = (startResult && startResult.beforeState) || {};
    let afterState = (stop && stop.afterState) || { url: afterUrl };
    let mutations = (stop && stop.mutations) || [];
    let settleMs = (stop && typeof stop.settle_ms === 'number') ? stop.settle_ms : 0;

    if (crossOrigin) {
      beforeState = beforeState || { url: beforeUrl };
      afterState = { url: afterUrl };
      mutations = [];
    }

    const raw = builders.buildChangeReport(
      beforeState,
      afterState,
      mutations,
      { crossOrigin, settleMs }
    );
    if (partial) raw.partial = true;
    const capped = builders.applyChangeReportSizeCap(raw);
    const report = capped && capped.report ? capped.report : raw;
    const truncated = !!(capped && capped.truncated);

    if (response && typeof response === 'object') {
      response.change_report = report;
      if (truncated) response.change_report_hint = 'truncated; call read_page for full state';
    }
  } catch (err) {
    // Never block tool response on report failure.
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[FSB MCP Dispatcher] change_report harvest failed:', err && err.message ? err.message : err);
      }
    } catch (_) { /* logging never throws */ }
  }

  return response;
}

const _mcp_dispatcher_exports = {
  dispatchMcpToolRoute,
  dispatchMcpMessageRoute,
  hasMcpToolRoute,
  hasMcpMessageRoute,
  getMcpRouteContracts,
  buildRestrictedMcpResponse,
  MCP_NAVIGATION_RECOVERY_TOOLS,
  createMcpRouteError,
  MCP_PHASE199_TOOL_ROUTES,
  MCP_PHASE199_MESSAGE_ROUTES,
  MCP_PHASE199_EXCLUDED_BACKGROUND_TOOLS,
  // Phase 238: agent identity route handlers exported for unit-test access.
  handleAgentRegisterRoute,
  handleAgentReleaseRoute,
  handleAgentStatusRoute,
  // Phase 245: change_report harvest wrap-around + toggle accessors (test-only).
  wrapWithChangeReport,
  _getChangeReportsEnabled,
  _setChangeReportsEnabledForTest,
  // Telemetry client-label extraction (regression guard against the
  // bridge-object-as-client leak that recorded every event as 'unknown').
  extractMcpClientLabel,
  // Connection-scoped fallback resolver + cache reset (regression guard
  // against the non-action message route 'unknown' leak: agent:register,
  // mcp:get-tabs, mcp:get-dom, mcp:get-diagnostics, mcp:read-page).
  resolveMcpClientLabel,
  clearLastKnownMcpClientLabel,
  _peekLastKnownMcpClientLabel,
  // Quick task 260524-7n9 -- storage key that mirrors the per-agent
  // client-label cache to chrome.storage.session so popup + sidepanel
  // surfaces (different contexts from the SW where _agentClientLabelCache
  // lives) can read it and render "owned by <ClientName>" in the chip.
  FSB_AGENT_CLIENT_LABELS_KEY
};

if (typeof globalThis !== 'undefined') {
  globalThis.fsbMcpToolDispatcher = _mcp_dispatcher_exports;
  globalThis.dispatchMcpToolRoute = dispatchMcpToolRoute;
  globalThis.dispatchMcpMessageRoute = dispatchMcpMessageRoute;
  globalThis.hasMcpToolRoute = hasMcpToolRoute;
  globalThis.hasMcpMessageRoute = hasMcpMessageRoute;
  globalThis.getMcpRouteContracts = getMcpRouteContracts;
  globalThis.buildRestrictedMcpResponse = buildRestrictedMcpResponse;
  globalThis.MCP_NAVIGATION_RECOVERY_TOOLS = MCP_NAVIGATION_RECOVERY_TOOLS;
  globalThis.createMcpRouteError = createMcpRouteError;
  // Phase 245: expose harvest wrapper to mcp-bridge-client.js (which runs in
  // the same SW global scope) so action-tool dispatch can opt into the
  // change_report wrap-around without a circular import.
  globalThis.wrapWithChangeReport = wrapWithChangeReport;
  // Surface the connection-scoped client-label cache reset so the bridge
  // client can clear it on every fresh _ws.onopen (different MCP client
  // attaching on the same port must not inherit the prior client's label).
  globalThis.clearLastKnownMcpClientLabel = clearLastKnownMcpClientLabel;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _mcp_dispatcher_exports;
}
