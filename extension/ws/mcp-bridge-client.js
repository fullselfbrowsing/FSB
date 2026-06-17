/**
 * MCP Bridge Client for FSB Chrome Extension
 *
 * Connects to the local MCP server's WebSocket bridge on ws://localhost:7225.
 * Routes incoming MCP tool requests to the extension's existing action handlers
 * and sends results back. Auto-reconnects with exponential backoff.
 *
 * This runs alongside the existing dashboard relay (ws-client.js) -- both
 * connections are independent and always-on.
 */

const MCP_BRIDGE_URL = 'ws://localhost:7225';
const MCP_BRIDGE_STATE_KEY = 'mcpBridgeState';
const MCP_RECONNECT_ALARM = 'fsb-mcp-bridge-reconnect';
const MCP_RECONNECT_BASE_MS = 2000;
const MCP_RECONNECT_MAX_MS = 30000;
const MCP_PING_INTERVAL_MS = 25000;
const MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS = new Set(['open_tab', 'close_tab']);
// Phase 241 D-07 / D-08 -- mirror of agent-registry.js RECONNECT_GRACE_MS.
// On bridge _ws.onclose the bridge asks the registry to stage release for
// every agent stamped with the current connection_id; that staged release
// fires after this many ms unless the bridge reconnects under the prior
// connection_id and cancels it. setTimeout (not the Chrome alarms API) is
// authoritative because the alarms API minimum delay is 30s, well above the
// 10s default grace. Hydrate-time recovery in agent-registry.js covers the
// SW-eviction-during-grace case via the persisted stagedReleases envelope.
const RECONNECT_GRACE_MS = 10000;

class MCPBridgeClient {
  constructor() {
    this._ws = null;
    this._reconnectDelay = MCP_RECONNECT_BASE_MS;
    this._reconnectTimer = null;
    this._pingTimer = null;
    this._intentionalClose = false;
    this._connected = false;
    this._status = 'idle';
    this._lastWakeReason = null;
    this._wakeCount = 0;
    this._lastConnectAttemptAt = null;
    this._lastConnectedAt = null;
    this._lastDisconnectedAt = null;
    this._lastDisconnectReason = null;
    this._nextReconnectAt = null;
    this._reconnectAttemptCount = 0;
    // Phase 241 D-08 -- per-bridge-connect connection_id state.
    // _connectionId is minted at every _ws.onopen via crypto.randomUUID() and
    // threaded through agent:register so the registry can stamp it on each
    // freshly minted agent. _lastKnownConnectionId carries the prior id from
    // _ws.onclose -> next _ws.onopen so the staged release for the prior id
    // can be cancelled on a fast reconnect (within RECONNECT_GRACE_MS).
    this._connectionId = null;
    this._lastKnownConnectionId = null;
  }

  getState() {
    return {
      status: this._status,
      connected: this._connected,
      url: MCP_BRIDGE_URL,
      reconnectDelayMs: this._reconnectDelay,
      maxReconnectDelayMs: MCP_RECONNECT_MAX_MS,
      nextReconnectAt: this._nextReconnectAt,
      reconnectAttemptCount: this._reconnectAttemptCount,
      wakeCount: this._wakeCount,
      lastWakeReason: this._lastWakeReason,
      lastConnectAttemptAt: this._lastConnectAttemptAt,
      lastConnectedAt: this._lastConnectedAt,
      lastDisconnectedAt: this._lastDisconnectedAt,
      lastDisconnectReason: this._lastDisconnectReason,
      updatedAt: this._timestamp()
    };
  }

  recordWake(reason) {
    this._lastWakeReason = reason || 'unknown';
    this._wakeCount += 1;
    this._persistState({ status: this._status || 'waking' });
  }

  /**
   * Start the connection. Safe to call multiple times.
   */
  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      this._persistState();
      return;
    }

    this._intentionalClose = false;
    this._status = 'connecting';
    this._lastConnectAttemptAt = this._timestamp();
    this._persistState();

    try {
      this._ws = new WebSocket(MCP_BRIDGE_URL);
    } catch (err) {
      console.log('[FSB MCP Bridge] WebSocket construction failed:', err.message);
      this._ws = null;
      this._connected = false;
      this._status = 'disconnected';
      this._lastDisconnectedAt = this._timestamp();
      this._lastDisconnectReason = 'construct_failed:' + (err.message || 'unknown');
      this._persistState();
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      console.log('[FSB MCP Bridge] Connected to local MCP bridge');
      this._connected = true;
      this._status = 'connected';
      this._reconnectDelay = MCP_RECONNECT_BASE_MS;
      this._nextReconnectAt = null;
      this._lastConnectedAt = this._timestamp();
      this._lastDisconnectReason = null;
      this._clearReconnectAlarm();
      this._persistState();
      this._startPing();
      // Phase 241 D-08 -- mint a fresh connection_id at onopen.
      // crypto.randomUUID is available in MV3 service workers and Node 18+.
      // The defensive fallback ensures the bridge never throws even if the
      // global is absent (Pitfall: should never trigger in practice).
      this._connectionId = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : (Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10));
      // Phase 241 D-08 -- cancel any staged release left over from the prior
      // connection_id. _lastKnownConnectionId holds the id that was active
      // when onclose fired so we can find the staging entry the registry
      // recorded for it. Best-effort: a missing registry / missing helper is
      // never fatal; the staged release will simply expire normally.
      try {
        const reg = globalThis.fsbAgentRegistryInstance;
        if (reg && typeof reg.cancelStagedRelease === 'function' && this._lastKnownConnectionId) {
          const cancelP = reg.cancelStagedRelease(this._lastKnownConnectionId);
          if (cancelP && typeof cancelP.catch === 'function') {
            cancelP.catch(() => { /* best-effort */ });
          }
        }
      } catch (_e) { /* best-effort */ }
      this._lastKnownConnectionId = this._connectionId;
      // v0.9.69 telemetry follow-up: reset the dispatcher's connection-scoped
      // MCP client label cache. The cache fallback fills in non-action route
      // recordDispatch rows (agent:register / mcp:get-tabs / mcp:get-dom /
      // mcp:get-diagnostics / mcp:read-page) which never carry a
      // visualSession.client sidecar. Clearing on every fresh open prevents
      // a prior client's label from leaking across reconnects to a different
      // MCP client process holding the localhost:7225 port. Best-effort:
      // the dispatcher is loaded into the same SW global scope, but defend
      // against a load-order race by feature-checking the function.
      try {
        if (typeof globalThis.clearLastKnownMcpClientLabel === 'function') {
          globalThis.clearLastKnownMcpClientLabel();
        }
      } catch (_e) { /* best-effort */ }
      // Phase 239 plan 03 -- best-effort reconciliation of any in-flight
      // run_task snapshots that survived an SW eviction. Authoritative
      // settle still lives server-side in autopilot.ts via sw_evicted.
      try { this._reconcileInFlightTasksOnConnect(); } catch (_e) { /* best-effort */ }
    };

    this._ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this._ws.onclose = () => {
      console.log('[FSB MCP Bridge] Disconnected from local MCP bridge');
      this._connected = false;
      this._status = 'disconnected';
      this._lastDisconnectedAt = this._timestamp();
      this._lastDisconnectReason = this._intentionalClose
        ? 'intentional_close'
        : (this._lastDisconnectReason === 'socket_error' ? 'socket_error' : 'socket_close');
      // Phase 241 D-08 -- stage release for ALL agents stamped with the
      // current connection_id. The registry resolves the agentIds snapshot
      // at stage time (Q2 resolution) so a fresh agent claimed under a
      // different bridge connect after this point is NOT swept up by the
      // expiring grace timer. Best-effort: never let registry errors block
      // the existing reconnect schedule below.
      try {
        const reg = globalThis.fsbAgentRegistryInstance;
        if (reg && typeof reg.stageReleaseByConnectionId === 'function' && this._connectionId) {
          const stageP = reg.stageReleaseByConnectionId(this._connectionId, RECONNECT_GRACE_MS);
          if (stageP && typeof stageP.catch === 'function') {
            stageP.catch(() => { /* best-effort */ });
          }
        }
      } catch (_e) { /* best-effort */ }
      // Phase 239 plan 03 -- arm reconciler for the next connect cycle.
      this._inFlightTasksReconciled = false;
      this._persistState();
      this._stopPing();
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (err) => {
      // Errors are followed by onclose, so reconnect happens there
      this._lastDisconnectReason = 'socket_error';
    };
  }

  /**
   * Gracefully disconnect.
   */
  disconnect() {
    this._intentionalClose = true;
    this._stopPing();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._clearReconnectAlarm();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
    this._status = 'disconnected';
    this._lastDisconnectedAt = this._timestamp();
    this._lastDisconnectReason = 'intentional_close';
    this._nextReconnectAt = null;
    this._persistState();
  }

  get isConnected() {
    return this._connected;
  }

  /**
   * Phase 241 D-08 -- expose the current per-bridge-connect connection_id
   * so any code path that wants to thread it into outbound payloads can read
   * it sync without depending on the private field. Returns null pre-connect
   * or after disconnect-then-reset (reset only happens on intentional close;
   * during reconnect the prior id is preserved on _lastKnownConnectionId so
   * the cancel-on-reopen flow can find it).
   */
  getConnectionId() {
    return this._connectionId || null;
  }

  // --------------------------------------------------------------------------
  // Reconnect
  // --------------------------------------------------------------------------

  _scheduleReconnect() {
    if (this._intentionalClose) return;
    if (this._reconnectTimer) return;

    this._reconnectAttemptCount += 1;
    const jitter = Math.random() * 500;
    const delay = Math.min(this._reconnectDelay + jitter, MCP_RECONNECT_MAX_MS);
    this._status = 'reconnecting';
    this._nextReconnectAt = this._timestamp(Date.now() + delay);
    this._persistState({ status: 'reconnecting' });
    this._scheduleReconnectAlarm(delay);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, MCP_RECONNECT_MAX_MS);
      this.connect();
    }, delay);
  }

  _timestamp(time = Date.now()) {
    return new Date(time).toISOString();
  }

  _persistState(patch = {}) {
    if (typeof chrome === 'undefined' || !chrome.storage?.session || typeof chrome.storage.session.set !== 'function') return;

    const state = {
      ...this.getState(),
      ...patch,
      updatedAt: this._timestamp()
    };

    try {
      const result = chrome.storage.session.set({ [MCP_BRIDGE_STATE_KEY]: state });
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          console.warn('[FSB MCP Bridge] Failed to persist bridge state:', err.message || String(err));
        });
      }
    } catch (err) {
      console.warn('[FSB MCP Bridge] Failed to persist bridge state:', err.message || String(err));
    }
  }

  _clearReconnectAlarm() {
    const alarms = typeof chrome !== 'undefined' ? chrome.alarms : null;
    if (!alarms || typeof alarms.clear !== 'function') return;

    try {
      const result = alarms.clear(MCP_RECONNECT_ALARM);
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (err) {
      // Alarm cleanup is best-effort; reconnect state remains authoritative.
    }
  }

  _scheduleReconnectAlarm(delayMs) {
    const alarms = typeof chrome !== 'undefined' ? chrome.alarms : null;
    if (!alarms || typeof alarms.create !== 'function') return;

    try {
      const result = alarms.create(MCP_RECONNECT_ALARM, { delayInMinutes: 0.5 });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (err) {
      // The in-memory timer still retries while the service worker is alive.
    }
  }

  // --------------------------------------------------------------------------
  // Keepalive
  // --------------------------------------------------------------------------

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: 'mcp:ping', ts: Date.now() }));
      }
    }, MCP_PING_INTERVAL_MS);
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Message handling
  // --------------------------------------------------------------------------

  _send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  _sendResult(id, payload) {
    this._send({ id, type: 'mcp:result', payload });
  }

  _sendError(id, error) {
    this._send({ id, type: 'mcp:error', payload: { success: false, error } });
  }

  _sendProgress(id, progressData) {
    this._send({ id, type: 'mcp:progress', payload: progressData });
  }

  async _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Ignore pong responses
    if (msg.type === 'mcp:pong') return;

    const { id, type, payload } = msg;
    if (!id || !type) return;

    try {
      const result = await this._routeMessage(type, payload || {}, id);
      this._sendResult(id, { success: true, ...result });
    } catch (err) {
      this._sendError(id, err.message || 'Unknown error');
    }
  }

  /**
   * Route an MCP message type to the appropriate extension handler.
   * Returns the result payload.
   */
  async _routeMessage(type, payload, id) {
    switch (type) {
      // Phase 240/246 agent lifecycle handshake. Server opens every connection
      // with agent:register; without these cases the switch's default throws
      // "Unknown MCP message type" and every subsequent tool rejects.
      case 'agent:register':
      case 'agent:release':
      case 'agent:status':
        return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

      case 'mcp:get-tabs':
        return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

      case 'mcp:get-diagnostics':
        return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

      case 'mcp:get-dom':
        return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

      case 'mcp:read-page':
        return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

      case 'mcp:trigger':
      case 'mcp:stop-trigger':
      case 'mcp:get-trigger-status':
      case 'mcp:list-triggers':
        return dispatchMcpMessageRoute({ type, payload, client: this, mcpMsgId: id });

      case 'mcp:start-visual-session':
        return this._handleStartVisualSession(payload);

      case 'mcp:end-visual-session':
        return this._handleEndVisualSession(payload);

      case 'mcp:execute-action':
        return this._handleExecuteAction(payload);

      case 'mcp:start-automation':
        return this._handleStartAutomation(payload, id);

      // Phase 239 plan 03 -- D-05 SW-wake snapshot lookup route.
      // Server-side autopilot.ts run_task catches Bridge disconnected and asks
      // the extension (after reconnect) for the persisted snapshot so the tool
      // can resolve with sw_evicted: true + partial_state.
      // Correlation key is `agentId` (per the <interfaces> block at top of plan).
      case 'mcp:get-task-snapshot':
        return this._handleGetTaskSnapshot(payload, id);

      case 'mcp:stop-automation':
        return this._handleStopAutomation(payload);

      case 'mcp:get-status':
        return this._handleGetStatus();

      case 'mcp:get-config':
        return this._handleGetConfig();

      case 'mcp:get-site-guides':
        return this._handleGetSiteGuides(payload);

      case 'mcp:get-page-snapshot':
        return this._handleGetPageSnapshot(payload);

      case 'mcp:get-memory':
        return this._handleGetMemory(payload);

      case 'mcp:list-sessions':
        return this._handleListSessions(payload);

      case 'mcp:get-session':
        return this._handleGetSession(payload);

      case 'mcp:get-logs':
        return this._handleGetLogs(payload);

      case 'mcp:search-memory':
        return this._handleSearchMemory(payload);

      case 'mcp:create-agent':
        return this._handleAgentAction('createAgent', payload);

      case 'mcp:list-agents':
        return this._handleAgentAction('listAgents', payload);

      case 'mcp:run-agent':
        return this._handleAgentAction('runAgent', payload);

      case 'mcp:stop-agent':
        return this._handleAgentAction('stopAgent', payload);

      case 'mcp:delete-agent':
        return this._handleAgentAction('deleteAgent', payload);

      case 'mcp:toggle-agent':
        return this._handleAgentAction('toggleAgent', payload);

      case 'mcp:get-agent-stats':
        return this._handleAgentAction('getAgentStats', payload);

      case 'mcp:get-agent-history':
        return this._handleAgentAction('getAgentHistory', payload);

      // Vault tools (Phase 195) -- secrets never cross WebSocket
      case 'mcp:list-credentials':
        return this._handleListCredentials();

      case 'mcp:fill-credential':
        return this._handleFillCredential(payload);

      case 'mcp:list-payments':
        return this._handleListPayments();

      case 'mcp:use-payment-method':
        return this._handleUsePaymentMethod(payload);

      default:
        throw new Error('Unknown MCP message type: ' + type);
    }
  }

  // --------------------------------------------------------------------------
  // Handler implementations
  // Uses background.js functions directly (same service worker scope via importScripts)
  // --------------------------------------------------------------------------

  async _getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /**
   * Send message to content script using background.js's sendMessageWithRetry.
   * This ensures content scripts are injected before sending, handling the
   * MV3 content script lifecycle properly.
   */
  async _sendToContentScript(tabId, message) {
    // sendMessageWithRetry is defined in background.js (same scope)
    if (typeof sendMessageWithRetry === 'function') {
      return await sendMessageWithRetry(tabId, message);
    }
    // Fallback: inject then send directly
    if (typeof ensureContentScriptInjected === 'function') {
      await ensureContentScriptInjected(tabId);
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  async _handleGetTabs(payload = {}) {
    return dispatchMcpToolRoute({ tool: 'list_tabs', params: payload, client: this });
  }

  async _handleGetDOM(payload) {
    const { agentId } = payload || {};
    // Phase 246 D-02: read tools resolve via the agent-scoped registry
    // (single-tab agent or explicit tab_id). Legacy:* agents fall through to
    // active-tab semantics via the resolver's first-line branch. The resolver
    // returns either {tabId, ownershipToken, skipGate} or a plain-object
    // error envelope (NO_OWNED_TAB / AMBIGUOUS_TAB / NO_ACTIVE_TAB /
    // AGENT_REGISTRY_UNAVAILABLE) that surfaces directly as the response.
    const params = (payload && payload.params) || payload || {};
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return resolved;
    }
    const response = await this._sendToContentScript(resolved.tabId, {
      action: 'getDOM',
      maxElements: payload.maxElements || 50,
    });
    return response;
  }

  async _handleReadPage(payload) {
    const { agentId } = payload || {};
    // Phase 246 D-02: see _handleGetDOM rationale.
    const params = (payload && payload.params) || payload || {};
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return resolved;
    }
    const response = await this._sendToContentScript(resolved.tabId, {
      action: 'readPage',
      full: payload.full || false,
    });
    return response;
  }

  async _handleStartVisualSession(payload = {}) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:start-visual-session',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleEndVisualSession(payload = {}) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:end-visual-session',
      payload,
      client: this
    });
    return response || {};
  }

  /**
   * Phase 256 Plan 03 -- fire the implicit visual-session lifecycle tick on
   * an action-tool call. The hook runs AFTER the v0.9.60 ownership gate
   * (resolveAgentTabOrError) passes AND AFTER a concrete tabId is known,
   * BEFORE the underlying action executes. See .planning/v0.9.62-CONTRACT.md
   * Field Bundle section and .planning/phases/256-.../256-CONTEXT.md ordering.
   *
   * Sidecar field SHAPE (per Phase 256 Plan 02):
   *   payload.visualSession = { visualReason, client, isFinal }
   *
   * Tabs where the sidecar is absent (no visualSession on payload) get a
   * no-op -- zero-overhead path for any caller that bypasses the server-side
   * Phase 255 schema layer. Read-only MCP tools never reach this code path
   * (they route through different methods like _handleGetDOM / _handleReadPage).
   *
   * Requirements satisfied: TIMEOUT-01 (implicit start) + TIMEOUT-02 (sliding
   * re-arm) + TIMEOUT-05 (ownership-gating wins, by virtue of being called
   * AFTER resolved.success === true).
   */
  async _recordVisualSessionTickIfPresent(tabId, agentId, payload) {
    if (typeof MCPVisualSessionLifecycleUtils === 'undefined') return;
    if (typeof MCPVisualSessionLifecycleUtils.recordVisualSessionTick !== 'function') return;
    const sidecar = payload && payload.visualSession;
    if (!sidecar || typeof sidecar !== 'object') return;
    if (!Number.isFinite(tabId) || tabId <= 0) return;
    if (typeof agentId !== 'string' || !agentId) return;
    try {
      await MCPVisualSessionLifecycleUtils.recordVisualSessionTick(tabId, agentId, {
        visualReason: typeof sidecar.visualReason === 'string' ? sidecar.visualReason : '',
        client: typeof sidecar.client === 'string' ? sidecar.client : '',
        isFinal: sidecar.isFinal === true
      });
    } catch (err) {
      // Non-blocking: lifecycle failures must not break the underlying action.
      // The overlay simply does not light up. The action still executes per
      // the Phase 256 design (lifecycle is informational, not gating).
      console.warn('[FSB MCP] recordVisualSessionTick failed (non-blocking):', err && err.message);
    }
  }

  /**
   * Phase 257 -- explicit completion via is_final: true.
   *
   * Companion to _recordVisualSessionTickIfPresent. Fires AFTER the
   * action's change_report resolves successfully, in BOTH the resolved-tab
   * branch and the bootstrap (open_tab / switch_tab) branch of
   * _handleExecuteAction.
   *
   * Behaviour:
   *   - No-op when MCPVisualSessionLifecycleUtils is not loaded.
   *   - No-op when payload.visualSession sidecar is absent.
   *   - No-op when sidecar.isFinal !== true (existing Phase 256 60s sliding
   *     window remains the clear path in that case).
   *   - On is_final === true: invokes clearVisualSession(tabId, { reason:
   *     'is_final' }) which deletes the storage entry, cancels the
   *     mcpVisualDeath:<tabId> alarm, and broadcasts the v0.9.36 clear
   *     payload to the content script. Idempotent on no-entry per
   *     Phase 256 helper semantics.
   *   - Errors are swallowed (non-blocking): the underlying action's return
   *     value is unaffected. console.warn carries the message for diagnostics.
   *
   * Requirements satisfied: COMPLETE-01 (caller signals via is_final),
   * COMPLETE-02 (immediate clear post-change_report), COMPLETE-03
   * (idempotent on no active session -- delegated to clearVisualSession).
   */
  async _clearVisualSessionIfFinal(tabId, agentId, payload) {
    if (typeof MCPVisualSessionLifecycleUtils === 'undefined') return;
    if (typeof MCPVisualSessionLifecycleUtils.clearVisualSession !== 'function') return;
    const sidecar = payload && payload.visualSession;
    if (!sidecar || typeof sidecar !== 'object') return;
    if (sidecar.isFinal !== true) return;
    if (!Number.isFinite(tabId) || tabId <= 0) return;
    if (typeof agentId !== 'string' || !agentId) return;
    try {
      await MCPVisualSessionLifecycleUtils.clearVisualSession(tabId, { reason: 'is_final' });
    } catch (err) {
      // Non-blocking: lifecycle failures must not break the underlying action.
      console.warn('[FSB MCP] clearVisualSession (is_final) failed (non-blocking):', err && err.message);
    }
  }

  async _handleExecuteAction(payload) {
    // Phase 246 D-13: resolver replaces _getActiveTab; legacy:* surfaces fall
    // through to active-tab via the resolver's first-line branch.
    //
    // Phase 247: tab bootstrap/recovery tools are a deliberate exception to
    // the "resolve an already-owned target first" rule. open_tab creates the
    // first owned tab; switch_tab may claim an unowned tab; navigate may need
    // to recover from chrome://newtab/ when the agent owns zero tabs.
    const agentId = (payload && payload.agentId) || null;
    const params = payload && payload.params ? payload.params : {};
    const toolName = payload && payload.tool;
    const toolDef = typeof getToolByName === 'function' ? getToolByName(toolName) : null;
    const usesDispatcherSyntheticChangeReport = MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS.has(toolName);

    const buildRouteParams = (extra) => ({
      ...params,
      ...(extra || {}),
      ...(agentId ? { agentId } : {}),
      ...(payload && payload.ownershipToken ? { ownershipToken: payload.ownershipToken } : {}),
      ...(payload && payload.connectionId ? { connectionId: payload.connectionId } : {})
    });

    const dispatchBackground = async (tabIdForDispatch, routeParams) => {
      const tab = Number.isFinite(tabIdForDispatch) ? { id: tabIdForDispatch } : null;
      return this._handleExecuteBackground(tab, payload, toolDef, routeParams);
    };

    const dispatchWithoutResolvedTab = async (routeParams) => {
      const tabIdForReport = Number.isFinite(routeParams && routeParams.tabId) ? routeParams.tabId : null;
      const executeFn = async () => dispatchBackground(tabIdForReport, routeParams);
      if (typeof wrapWithChangeReport === 'function' && !usesDispatcherSyntheticChangeReport) {
        return wrapWithChangeReport({
          toolName,
          tabId: tabIdForReport,
          params,
          execute: executeFn
        });
      }
      return executeFn();
    };

    if (toolName === 'open_tab' || toolName === 'switch_tab') {
      // Phase 256 Plan 03 -- bootstrap branch lifecycle tick.
      // open_tab / switch_tab create or claim the destination tab; the tabId
      // is known only AFTER the dispatch returns. Fire the lifecycle tick
      // POST-dispatch on success; ownership has been established by the
      // dispatcher itself (open_tab mints the agent's first owned tab;
      // switch_tab passes through checkOwnershipGate's CLAIMABLE recovery
      // arm in mcp-tool-dispatcher.js line 258).
      const dispatched = await dispatchWithoutResolvedTab(buildRouteParams());
      // Conservative success check: dispatched.success === true AND a tabId
      // on the response. open_tab returns `tabId`; switch_tab returns `tabId`.
      // Skip the tick if the dispatch failed (no overlay for a failed action).
      if (dispatched && dispatched.success === true) {
        const resolvedTabId = Number.isFinite(dispatched && dispatched.tabId) ? dispatched.tabId : null;
        if (resolvedTabId !== null) {
          await this._recordVisualSessionTickIfPresent(resolvedTabId, agentId, payload);
          // Phase 257 -- explicit completion. When the caller marks this
          // bootstrap call as the final action of the task, clear the visual
          // session immediately rather than waiting for the 60s sliding-window
          // timer. Gated by sidecar.isFinal === true inside the helper.
          await this._clearVisualSessionIfFinal(resolvedTabId, agentId, payload);
        }
      }
      return dispatched;
    }

    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      if (toolName === 'navigate' && resolved.code === 'NO_OWNED_TAB') {
        // Codex PR #33 P2 -- navigate bootstrap parity with open_tab/switch_tab.
        // The NO_OWNED_TAB branch creates the agent's first owned tab via
        // navigate's dispatcher path; mirror the post-dispatch visual-session
        // lifecycle from lines 705-728 so the implicit visual session is
        // started/refreshed on success and final-cleared when sidecar.isFinal.
        const dispatched = await dispatchWithoutResolvedTab(buildRouteParams());
        if (dispatched && dispatched.success === true) {
          const resolvedTabId = Number.isFinite(dispatched && dispatched.tabId) ? dispatched.tabId : null;
          if (resolvedTabId !== null) {
            await this._recordVisualSessionTickIfPresent(resolvedTabId, agentId, payload);
            await this._clearVisualSessionIfFinal(resolvedTabId, agentId, payload);
          }
        }
        return dispatched;
      }
      // Surface plain-object error envelope; bridge serializes to MCP shape.
      return resolved;
    }

    // Phase 246 D-16: feed the resolved tabId into routeParams so
    // _resolveTabIdForGate (camelCase only) finds it and the gate's tab-arm
    // fires. EXCEPTION: legacy:* surfaces (resolved.skipGate === true) MUST
    // NOT push tabId into routeParams -- the gate's tab-arm SKIPS for legacy
    // surfaces (Phase 240's D-02 carve-out preserved). See Pitfall 3.
    const tabId = resolved.tabId;
    const tab = { id: tabId };

    // Phase 256 Plan 03 -- implicit visual-session lifecycle tick.
    // Runs AFTER resolveAgentTabOrError approves the tab + agent pairing
    // (v0.9.60 ownership gate) and BEFORE the underlying executeFn fires.
    // TIMEOUT-05 ownership-gating-wins: this line is unreachable when
    // resolved.success === false above.
    await this._recordVisualSessionTickIfPresent(tabId, agentId, payload);

    const routeParams = {
      ...params,
      ...(resolved.skipGate ? {} : { tabId }),
      ...(agentId ? { agentId } : {}),
      ...(payload && payload.ownershipToken ? { ownershipToken: payload.ownershipToken } : {}),
      ...(payload && payload.connectionId ? { connectionId: payload.connectionId } : {})
    };

    // Phase 245: route the dispatch through wrapWithChangeReport when the
    // tool's _emitChangeReport flag is true and the global toggle is on.
    // The wrapper short-circuits to executeFn() when either gate is off, so
    // adding this wrap is zero-overhead for read tools / opt-out tools / when
    // fsbChangeReportsEnabled is false.
    const executeFn = async () => {
      if (toolDef && toolDef._route === 'background') {
        return this._handleExecuteBackground(tab, payload, toolDef, routeParams);
      }
      // Default: send to content script (content-routed or unknown tools)
      return this._sendToContentScript(tabId, {
        action: 'executeAction',
        tool: payload.tool,
        params,
        source: 'mcp-manual',
      });
    };

    let actionResult;
    if (typeof wrapWithChangeReport === 'function' && !usesDispatcherSyntheticChangeReport) {
      actionResult = await wrapWithChangeReport({
        toolName: payload.tool,
        tabId,
        params,
        execute: executeFn
      });
    } else {
      actionResult = await executeFn();
    }

    // Phase 257 -- explicit completion. When the caller marks this action as
    // the final action of the task, clear the visual session immediately
    // rather than waiting for the 60s sliding-window timer. Fires AFTER
    // change_report resolves (wrapWithChangeReport awaits the report before
    // returning) so the user sees the action's effect land first, then the
    // overlay vanishes. Gated by sidecar.isFinal === true inside the helper.
    await this._clearVisualSessionIfFinal(tabId, agentId, payload);

    return actionResult;
  }

  /**
   * Handle background-routed tools directly in the service worker.
   * Special-cases execute_js (chrome.scripting.executeScript); others
   * dispatch via chrome.runtime.sendMessage to background.js onMessage handler.
   *
   * Phase 246 D-16: accepts a routeParams arg from _handleExecuteAction
   * containing the resolver-fed tabId (camelCase) plus agentId/ownershipToken/
   * connectionId. Falls back to rebuilding from payload for back-compat
   * with any caller that does not pass routeParams.
   */
  async _handleExecuteBackground(tab, payload, toolDef, routeParams) {
    const toolName = payload.tool;
    const params = payload.params || {};

    // Phase 246 D-16: routeParams already built by caller (skipGate-aware).
    // Fall back to legacy reconstruction only if a caller bypassed
    // _handleExecuteAction (defensive; preserves Phase 245 back-compat).
    if (!routeParams) {
      routeParams = {
        ...params,
        ...(payload && payload.agentId ? { agentId: payload.agentId } : {}),
        ...(payload && payload.ownershipToken ? { ownershipToken: payload.ownershipToken } : {}),
        ...(payload && payload.connectionId ? { connectionId: payload.connectionId } : {})
      };
    }

    // Special handler for execute_js -- uses chrome.scripting.executeScript directly
    if (toolName === 'execute_js') {
      return this._handleExecuteJS(tab, params);
    }

    if (typeof hasMcpToolRoute === 'function' && hasMcpToolRoute(toolName)) {
      return dispatchMcpToolRoute({ tool: payload.tool, params: routeParams, client: this, tab, payload });
    }

    if (toolName === 'fill_credential' || toolName === 'fill_payment_method') {
      const bgAction = toolDef._contentVerb || toolName;
      const response = await this._dispatchToBackground({
        action: bgAction,
        ...params,
        tabId: tab.id,
      });
      return response;
    }

    if (typeof createMcpRouteError === 'function') {
      return createMcpRouteError(toolName, 'background', `Unsupported MCP background route: ${toolName}`);
    }

    return {
      success: false,
      errorCode: 'mcp_route_unavailable',
      tool: toolName,
      routeFamily: 'background',
      recoveryHint: 'Use a supported MCP browser/tab route.',
      error: `Unsupported MCP background route: ${toolName}`
    };
  }

  /**
   * Execute arbitrary JavaScript in the active tab's MAIN world.
   * Uses chrome.scripting.executeScript (same pattern as background.js:5945).
   * Per D-01: MAIN world gives full page DOM access.
   */
  async _handleExecuteJS(tab, params) {
    const code = params.code;
    if (!code || typeof code !== 'string') {
      throw new Error('execute_js requires a "code" parameter (string)');
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (userCode) => {
          try {
            // Use Function constructor to execute in page context
            // This allows return values and multi-statement code
            const fn = new Function(userCode);
            const result = fn();
            // Serialize result for message passing
            if (result === undefined) return { value: 'undefined' };
            if (result === null) return { value: 'null' };
            if (typeof result === 'object') {
              try { return { value: JSON.stringify(result) }; }
              catch { return { value: String(result) }; }
            }
            return { value: String(result) };
          } catch (execError) {
            return { error: execError.message || String(execError) };
          }
        },
        args: [code],
      });

      // chrome.scripting.executeScript returns an array of InjectionResult
      const injectionResult = results && results[0];
      if (!injectionResult) {
        return { success: false, error: 'No result from script execution' };
      }

      const resultValue = injectionResult.result;
      if (resultValue && resultValue.error) {
        return { success: false, error: resultValue.error };
      }

      return {
        success: true,
        result: resultValue ? resultValue.value : 'undefined',
        tool: 'execute_js',
      };
    } catch (err) {
      // chrome.scripting.executeScript can throw for restricted pages (chrome://, etc.)
      return {
        success: false,
        error: `execute_js failed: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Dispatch a request through background.js's onMessage handler.
   * Since we're in the same service worker scope, we simulate the
   * chrome.runtime.onMessage pattern by calling the handler directly.
   */
  _dispatchToBackground(request) {
    return new Promise((resolve) => {
      // Trigger the onMessage listener in background.js
      // The listener uses sendResponse callback pattern
      const fakeMessageEvent = new CustomEvent('fsb-mcp-internal', {
        detail: { request, resolve }
      });

      // Direct dispatch: call the handler via the existing message listener
      // background.js's chrome.runtime.onMessage handler is not directly callable,
      // so we use chrome.runtime.sendMessage which loops back within the service worker
      chrome.runtime.sendMessage(request, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || {});
      });
    });
  }

  async _handleStartAutomation(payload, mcpMsgId) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:start-automation',
      payload,
      client: this,
      mcpMsgId
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to start automation');
    }

    const sessionId = response.sessionId;

    // Listen for automation completion via message listener
    //
    // Phase 225-01: chrome.runtime.sendMessage() does NOT loop back to
    // chrome.runtime.onMessage listeners registered in the SAME service-worker
    // context. background.js (this same SW) is the broadcaster, so the runtime
    // listener below would never fire in real Chrome -- run_task hung at the
    // 300s timeout while autopilot finished in 40-186s.
    //
    // Fix: subscribe to globalThis.fsbAutomationLifecycleBus too. background.js
    // dispatches terminal events (automationComplete / automationError) on this
    // EventTarget alongside chrome.runtime.sendMessage. Either path resolves
    // the promise. We keep the chrome.runtime.onMessage listener for harness
    // tests (tests/mcp-bridge-client-lifecycle.test.js asserts that path) and
    // for any future cross-context broadcasters.
    // Phase 239 plan 02 -- 30s setInterval heartbeat ticker scoped to each
    // _handleStartAutomation Promise; paired clearInterval in settle prevents
    // ticker leak across many invocations (RESEARCH Pitfall 2). Writes to
    // chrome.storage.session via globalThis.FsbMcpTaskStore on every tick AND
    // on settle (D-04 cadence). Plan 03 adds 600s ceiling raise + sw_evicted/
    // partial_outcome resolve discipline; the heartbeat scope established
    // here is the host of those new resolve sources.
    return new Promise((resolve) => {
      let settled = false;

      // Phase 239 plan 02 -- closure-scope heartbeat state.
      const heartbeatStartedAt = Date.now();
      let lastHeartbeatAt = heartbeatStartedAt;
      let heartbeatTickCount = 0;

      const fireHeartbeat = async () => {
        if (settled) return; // Pitfall 5 guard -- single-resolve invariant
        const sessions = (typeof activeSessions !== 'undefined') ? activeSessions : null;
        const session = (sessions && typeof sessions.get === 'function') ? sessions.get(sessionId) : null;
        lastHeartbeatAt = Date.now();
        heartbeatTickCount += 1;

        const payload = {
          timestamp: lastHeartbeatAt,
          sessionId,
          taskId: sessionId,           // taskId === sessionId in v0.9.60 single-task scope
          alive: true,
          step: (session && session.iterationCount) || 0,
          elapsed_ms: lastHeartbeatAt - heartbeatStartedAt,
          current_url: (session && session.lastKnownUrl) || null,
          ai_cycles: (session && session.iterationCount) || 0,
          last_action: (session && session._lastActionSummary) || null,
        };

        // D-02 wire: emit notifications/progress with rich D-01 fields. The
        // server-side autopilot.ts onProgress callback re-shapes these into
        // params._meta on the JSON-RPC notification.
        try { this._sendProgress(mcpMsgId, payload); } catch (_e) { /* best-effort */ }

        // D-04 cadence: write snapshot on every tick.
        // Phase 239 WR-02 -- re-check settled flag AFTER _sendProgress and
        // its implicit microtask boundary; settle() may have run between the
        // top-of-fireHeartbeat guard and this point and already written the
        // terminal snapshot. Without this re-check, the heartbeat's
        // 'in_progress' write can race-overwrite settle's terminal write,
        // leaving the persisted snapshot stuck at in_progress and confusing
        // _reconcileInFlightTasksOnConnect on the next bridge reconnect.
        if (settled) return;
        try {
          const store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
          if (store && typeof store.writeSnapshot === 'function') {
            await store.writeSnapshot(sessionId, {
              task_id: sessionId,
              status: 'in_progress',
              started_at: heartbeatStartedAt,
              last_heartbeat_at: lastHeartbeatAt,
              originating_mcp_call_id: mcpMsgId,
              target_tab_id: (session && session.tabId) || null,
              current_step: (session && session.iterationCount) || 0,
              ai_cycle_count: (session && session.iterationCount) || 0,
              last_dom_hash: (session && session.lastDOMHash) || null,
            });
          }
        } catch (_e) { /* best-effort persistence */ }
      };

      const settle = (value, source) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(heartbeatTimer);  // Phase 239 plan 02 -- paired teardown
        chrome.runtime.onMessage.removeListener(runtimeListener);
        if (lifecycleBus && typeof lifecycleBus.removeEventListener === 'function') {
          lifecycleBus.removeEventListener('automationComplete', busCompleteHandler);
          lifecycleBus.removeEventListener('automationError', busErrorHandler);
        }

        // Phase 239 plan 02 -- D-04 terminal write (state transition to
        // complete/error/stopped/partial). sw_evicted / partial_outcome
        // snapshots come from Plan 03's resolve handlers and write 'partial'
        // BEFORE calling settle; this branch is the happy path.
        try {
          const store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
          if (store && typeof store.writeSnapshot === 'function') {
            let terminalStatus = 'complete';
            if (value && value.status === 'error') terminalStatus = 'error';
            else if (value && (value.status === 'stopped' || value.stopped)) terminalStatus = 'stopped';
            else if (value && (value.status === 'partial' || value.partial)) terminalStatus = 'partial';
            store.writeSnapshot(sessionId, {
              task_id: sessionId,
              status: terminalStatus,
              started_at: heartbeatStartedAt,
              last_heartbeat_at: Date.now(),
              originating_mcp_call_id: mcpMsgId,
              target_tab_id: (value && value.tabId) || null,
              current_step: heartbeatTickCount,
              ai_cycle_count: heartbeatTickCount,
              last_dom_hash: null,
              final_result: value,
            }).catch(() => { /* best-effort */ });
          }
        } catch (_e) { /* never block resolve on persistence */ }

        try {
          const redact = (typeof globalThis !== 'undefined' && typeof globalThis.redactForLog === 'function')
            ? globalThis.redactForLog
            : (v) => v;
          console.log('[FSB MCP] run_task completion sent', redact({
            sessionId,
            status: value && value.status,
            source
          }));
        } catch (_e) { /* logging never blocks resolution */ }
        resolve(value);
      };

      // Phase 239 plan 03 -- raise 300s ceiling to 600s safety net per D-06
      // and emit partial_outcome resolution shape so MCP host salvages
      // partial state. The lifecycle bus is now the everyday resolve source
      // (Plan 01 made it fire reliably from all 5 cleanup paths); this
      // safety net stays in place as a true backstop until SC#5 UAT proves
      // zero dropped events.
      const RUN_TASK_SAFETY_NET_MS = 600_000;

      const timeout = setTimeout(async () => {
        // Pitfall 5 guard mirror -- if the lifecycle bus already settled,
        // settle() at the bottom of this callback is a no-op. We still do
        // the snapshot read because the async work is wrapped in best-effort
        // try/catches and the cost is bounded.
        let partial_state = null;
        try {
          var store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
          if (store && typeof store.readSnapshot === 'function') {
            partial_state = await store.readSnapshot(sessionId);
          }
        } catch (_e) { /* best-effort -- partial_state stays null */ }

        // D-04: pre-settle write of 'partial' status (state transition;
        // settle's existing terminal write would otherwise mark this as
        // 'complete'). Write BEFORE settle so the snapshot reflects the
        // timeout disposition. If the lifecycle bus fires between this
        // write and the settle call, settle's existing terminal write at
        // the end will overwrite with 'complete'/'stopped'/'error' -- this
        // is the correct behavior because the lifecycle event was the
        // actual outcome.
        try {
          if (store && typeof store.writeSnapshot === 'function' && partial_state) {
            await store.writeSnapshot(sessionId, {
              ...partial_state,
              status: 'partial',
              final_result: { partial_outcome: 'timeout' },
            });
          }
        } catch (_e) { /* best-effort */ }

        // D-06: resolve with partial_outcome -- single-resolve invariant
        // via settle (which holds the settled-flag guard).
        settle({
          sessionId,
          success: true,
          partial_outcome: 'timeout',
          partial_state,
          hint: 'lifecycle event missing -- audit cleanup paths',
        }, 'safety_net_600s');
      }, RUN_TASK_SAFETY_NET_MS);

      // Phase 239 plan 02 -- start the 30s heartbeat ticker. First _sendProgress
      // fires at t=30s (we deliberately do NOT fire-immediate so the legacy
      // automationProgress payload shape stays sent[0] for back-compat tests).
      // We DO write a subscribe-time snapshot to chrome.storage.session so
      // D-04 "every state transition" is honored: idle -> in_progress is a
      // state transition.
      const heartbeatTimer = setInterval(fireHeartbeat, 30_000);
      try {
        const _store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
        if (_store && typeof _store.writeSnapshot === 'function') {
          _store.writeSnapshot(sessionId, {
            task_id: sessionId,
            status: 'in_progress',
            started_at: heartbeatStartedAt,
            last_heartbeat_at: heartbeatStartedAt,
            originating_mcp_call_id: mcpMsgId,
            target_tab_id: null,
            current_step: 0,
            ai_cycle_count: 0,
            last_dom_hash: null,
          }).catch(() => { /* best-effort */ });
        }
      } catch (_e) { /* never block subscribe on persistence */ }

      const handleProgress = (message) => {
        const actionSummary = message.actionSummary
          || message.currentAction
          || (message.type === 'automationProgress' ? message.action : null);
        this._sendProgress(mcpMsgId, {
          taskId: sessionId,
          progress: message.progress || 0,
          phase: message.phase || 'executing',
          eta: message.eta || null,
          action: actionSummary || null,
        });
      };

      const handleComplete = (message, source) => {
        settle({
          sessionId,
          status: message.outcome || message.result?.status || (message.partial ? 'partial' : 'completed'),
          result: message.result || {},
        }, source);
      };

      const handleError = (message, source) => {
        settle({
          sessionId,
          status: 'error',
          error: message.error || 'Unknown automation error',
        }, source);
      };

      const runtimeListener = (message) => {
        const eventType = message?.type || message?.action;
        if (message?.sessionId !== sessionId) return;

        if (eventType === 'automationProgress') return handleProgress(message);
        if (eventType === 'automationComplete') return handleComplete(message, 'chrome.runtime');
        if (eventType === 'automationError') return handleError(message, 'chrome.runtime');
      };

      const lifecycleBus = (typeof globalThis !== 'undefined') ? globalThis.fsbAutomationLifecycleBus : null;

      const busCompleteHandler = (event) => {
        const message = event && event.detail;
        if (!message || message.sessionId !== sessionId) return;
        handleComplete(message, 'lifecycleBus');
      };

      const busErrorHandler = (event) => {
        const message = event && event.detail;
        if (!message || message.sessionId !== sessionId) return;
        handleError(message, 'lifecycleBus');
      };

      chrome.runtime.onMessage.addListener(runtimeListener);
      if (lifecycleBus && typeof lifecycleBus.addEventListener === 'function') {
        lifecycleBus.addEventListener('automationComplete', busCompleteHandler);
        lifecycleBus.addEventListener('automationError', busErrorHandler);
      }
    });
  }

  async _handleStopAutomation(payload = {}) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:stop-automation',
      payload,
      client: this
    });
    return response || { stopped: true };
  }

  /**
   * Phase 239 plan 03 -- D-05 SW-wake snapshot lookup handler.
   *
   * The MCP server's run_task tool catches the bridge disconnect rejection
   * (mcp/src/bridge.ts disconnect() rejects pendingRequests with
   * 'Bridge disconnected') and, after the bridge reconnects, sends an
   * mcp:get-task-snapshot request with payload.agentId so the server can
   * resolve the originating run_task call with sw_evicted: true +
   * partial_state from the persisted heartbeat snapshot.
   *
   * Correlation key is `agentId` (LOCKED for v0.9.60 single-task semantics).
   * The extension-side heartbeat snapshots written by Plan 02 are keyed by
   * `sessionId` (which is the same string identity as `agentId` post-Phase-237
   * wiring). Phase 240+ may migrate to a per-task ID; documented as a
   * follow-up.
   */
  async _handleGetTaskSnapshot(payload, _mcpMsgId) {
    const agentId = payload && payload.agentId;
    let snapshot = null;
    try {
      var store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
      if (store && typeof store.readSnapshot === 'function' && agentId) {
        snapshot = await store.readSnapshot(agentId);
      }
    } catch (_e) { /* best-effort */ }
    return { success: true, snapshot };
  }

  /**
   * Phase 239 plan 03 -- best-effort SW-wake reconciliation.
   *
   * After a bridge reconnect, walk the persisted in-flight snapshots and mark
   * each as 'partial' with sw_evicted disposition. The originating run_task
   * tool's sw_evicted catch (server side, in mcp/src/tools/autopilot.ts) is
   * the AUTHORITATIVE settle path -- this method only updates record-keeping
   * for diagnostics. Do NOT attempt to RESUME automation from here (that is
   * D-05 Option B, explicitly out of scope per CONTEXT.md).
   */
  async _reconcileInFlightTasksOnConnect() {
    if (this._inFlightTasksReconciled) return;
    this._inFlightTasksReconciled = true;

    try {
      var store = (typeof globalThis !== 'undefined') ? globalThis.FsbMcpTaskStore : null;
      if (!store || typeof store.listInFlightSnapshots !== 'function') return;

      const inFlight = await store.listInFlightSnapshots();
      for (const snapshot of inFlight) {
        await store.writeSnapshot(snapshot.task_id, {
          ...snapshot,
          status: 'partial',
          final_result: { sw_evicted: true, last_heartbeat_at: snapshot.last_heartbeat_at },
        });
      }
    } catch (_e) { /* best-effort reconciliation */ }
  }

  async _handleGetStatus() {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-status',
      payload: {},
      client: this
    });
    return response || {};
  }

  async _handleGetConfig() {
    const config = await chrome.storage.local.get([
      'selectedModel', 'selectedProvider', 'defaultModel',
      'maxIterations', 'domOptimization', 'maxDOMElements',
    ]);
    return { config };
  }

  async _handleGetSiteGuides(payload) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-site-guides',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleGetPageSnapshot(payload = {}) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-page-snapshot',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleGetMemory(payload) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-memory',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleListSessions(payload = {}) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:list-sessions',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleGetSession(payload) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-session',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleGetLogs(payload) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:get-logs',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleSearchMemory(payload) {
    const response = await dispatchMcpMessageRoute({
      type: 'mcp:search-memory',
      payload,
      client: this
    });
    return response || {};
  }

  async _handleAgentAction(action, payload) {
    const response = await this._dispatchToBackground({
      action,
      ...payload,
    });
    return response || {};
  }

  // --------------------------------------------------------------------------
  // Vault handlers (Phase 195) -- secrets never leave the extension
  // --------------------------------------------------------------------------

  async _handleListCredentials() {
    const response = await this._dispatchToBackground({ action: 'getAllCredentials' });
    if (!response || !response.success) {
      return { success: false, error: response?.error || 'Failed to list credentials' };
    }
    // Strip passwords -- return domain + username only (MCP-01)
    const credentials = (response.credentials || []).map(c => ({
      domain: c.domain,
      username: c.username,
    }));
    return { success: true, credentials };
  }

  async _handleFillCredential(payload) {
    // Phase 246 D-13 vault overturn: vault tools join the agent-scoped
    // surface. Resolver picks the tab; URL still derived from chrome.tabs.get
    // (we need the URL for domain derivation; resolver returns only tabId).
    const agentId = (payload && payload.agentId) || null;
    const params = (payload && payload.params) || payload || {};
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return resolved;
    }
    let tab;
    try {
      tab = await chrome.tabs.get(resolved.tabId);
    } catch (_e) {
      return { success: false, error: 'Resolved tabId ' + resolved.tabId + ' could not be loaded' };
    }
    if (!tab?.url) return { success: false, error: 'No URL on resolved tab' };

    let domain;
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      return { success: false, error: 'Cannot determine domain from resolved tab URL' };
    }

    // Lookup credential in vault (stays in extension)
    const credResponse = await this._dispatchToBackground({
      action: 'getFullCredential',
      domain,
    });
    if (!credResponse?.success || !credResponse.credential) {
      return { success: false, error: 'No credential found for ' + domain };
    }

    // Send fill command to content script -- password travels bg->content only (MCP-02)
    const result = await this._sendToContentScript(resolved.tabId, {
      action: 'executeAction',
      tool: 'fillCredentialFields',
      params: {
        username: credResponse.credential.username,
        password: credResponse.credential.password,
      },
    });
    return result || { success: false, error: 'Fill failed' };
  }

  async _handleListPayments() {
    const response = await this._dispatchToBackground({ action: 'getAllPaymentMethods' });
    if (!response || !response.success) {
      return { success: false, error: response?.error || 'Failed to list payment methods' };
    }
    // Return masked metadata only -- no full card or CVV (MCP-03)
    const paymentMethods = (response.paymentMethods || []).map(pm => ({
      id: pm.id,
      cardBrand: pm.cardBrand,
      last4: pm.last4,
      cardholderName: pm.cardholderName,
      expiryMonth: pm.expiryMonth,
      expiryYearLast2: pm.expiryYearLast2,
    }));
    return { success: true, paymentMethods };
  }

  async _handleUsePaymentMethod(payload) {
    const { paymentMethodId } = payload;
    if (!paymentMethodId) return { success: false, error: 'paymentMethodId is required' };

    // Phase 246 D-13 vault overturn: vault tools join the agent-scoped
    // surface. Resolver picks the tab; URL still derived from chrome.tabs.get.
    const agentId = (payload && payload.agentId) || null;
    const params = (payload && payload.params) || payload || {};
    const resolved = await (typeof globalThis !== 'undefined' && typeof globalThis.resolveAgentTabOrError === 'function'
      ? globalThis.resolveAgentTabOrError(agentId, params, this)
      : { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId });
    if (resolved.success === false) {
      return resolved;
    }
    let tab;
    try {
      tab = await chrome.tabs.get(resolved.tabId);
    } catch (_e) {
      return { success: false, error: 'Resolved tabId ' + resolved.tabId + ' could not be loaded' };
    }
    if (!tab?.url) return { success: false, error: 'No URL on resolved tab' };

    // Derive merchant domain from resolved tab (MCP-04: not from MCP payload)
    let merchantDomain;
    try {
      merchantDomain = new URL(tab.url).hostname;
    } catch {
      merchantDomain = tab.url;
    }

    // Lookup full payment method in vault (stays in extension)
    const pmResponse = await this._dispatchToBackground({
      action: 'getFullPaymentMethod',
      id: paymentMethodId,
    });
    if (!pmResponse?.success || !pmResponse.paymentMethod) {
      return { success: false, error: 'Payment method not found' };
    }
    const pm = pmResponse.paymentMethod;

    // Confirmation gate: two-phase broadcast + listener (MCP-04)
    // Pattern: register listener FIRST, then send confirmation request
    const confirmResult = await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(confirmHandler);
        resolve({ approved: false, reason: 'timeout' });
      }, 120_000);

      function confirmHandler(request, sender, sendResponse) {
        if (request.action === 'paymentFillApproved' && request.paymentMethodId === paymentMethodId) {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(confirmHandler);
          resolve({ approved: true });
          sendResponse({ received: true });
        } else if (request.action === 'paymentFillDenied' && request.paymentMethodId === paymentMethodId) {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(confirmHandler);
          resolve({ approved: false, reason: 'user_declined' });
          sendResponse({ received: true });
        }
      }

      chrome.runtime.onMessage.addListener(confirmHandler);

      chrome.runtime.sendMessage({
        action: 'paymentFillConfirmation',
        paymentMethodId,
        cardBrand: pm.cardBrand || 'unknown',
        last4: pm.last4 || (pm.cardNumber ? pm.cardNumber.slice(-4) : '****'),
        merchantDomain,
      }).catch(() => {
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(confirmHandler);
        resolve({ approved: false, reason: 'sidepanel_unavailable' });
      });
    });
    if (!confirmResult.approved) {
      const reason = confirmResult.reason || 'user_declined';
      const errorMsg = reason === 'sidepanel_unavailable'
        ? 'Payment confirmation requires the FSB sidepanel to be open'
        : reason === 'timeout'
          ? 'Payment confirmation timed out (2 minutes)'
          : 'User declined payment fill';
      return { success: false, error: errorMsg };
    }

    // Fill payment fields on the resolved tab -- full card data travels bg->content only
    const result = await this._sendToContentScript(resolved.tabId, {
      action: 'executeAction',
      tool: 'fillPaymentFields',
      params: {
        cardNumber: pm.cardNumber,
        expiryMonth: pm.expiryMonth,
        expiryYear: pm.expiryYear,
        cvv: pm.cvv,
        cardholderName: pm.cardholderName,
        billingName: pm.billingName,
        addressLine1: pm.addressLine1,
        addressLine2: pm.addressLine2,
        city: pm.city,
        stateRegion: pm.stateRegion,
        postalCode: pm.postalCode,
        country: pm.country,
      },
    });
    return result || { success: false, error: 'Payment fill failed' };
  }
}

// Global instance
const mcpBridgeClient = new MCPBridgeClient();
