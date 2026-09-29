'use strict';

/**
 * Phase 246 plan 01 -- Agent-scoped tab resolver.
 *
 * Single chokepoint for picking a target tab for an MCP-routed tool call.
 * Consumed by:
 *   - extension/ws/mcp-bridge-client.js _handleGetDOM, _handleReadPage,
 *     _handleExecuteAction, _handleFillCredential, _handleUsePaymentMethod
 *   - extension/ws/mcp-tool-dispatcher.js handleGetPageSnapshotRoute,
 *     handleStartVisualSessionRoute (Plan 02)
 *
 * Decisions covered:
 *   D-01 -- registry-driven resolution (1 owned tab use, 0 owned
 *           NO_OWNED_TAB, 2+ owned tabs use selectedTabId when valid,
 *           otherwise AMBIGUOUS_TAB)
 *   D-04 -- legacy:<surface> first-line branch falls through to active tab
 *           via client._getActiveTab(), tagged skipGate:true so the gate's
 *           tab-arm is skipped (legacy synthesis does not track per-tab
 *           ownership tokens against arbitrary user-active tabs)
 *   D-12 -- shared error code surface (NO_OWNED_TAB / AMBIGUOUS_TAB /
 *           NO_ACTIVE_TAB / AGENT_REGISTRY_UNAVAILABLE)
 *   OWN-READ -- explicit non-legacy tab ids are checked against the
 *           authoritative owned-tab set before any direct read/action path
 *           can touch Chrome. Only navigate may opt into claiming a truly
 *           unowned tab; another agent's tab always rejects.
 *
 * Returns either a resolved tab descriptor:
 *   { tabId: number, ownershipToken: string|null, skipGate: boolean }
 * or a plain-object error envelope (Phase 240 shape):
 *   { success: false, code: string, agentId?: string, tabIds?: number[] }
 */

(function (exports) {
  /**
   * Resolve the target tab for an MCP-routed tool call.
   *
   * @param {string} agentId   Agent identifier (or 'legacy:<surface>').
   * @param {object} params    Caller-supplied tool params (may include tab_id
   *                           or tabId; both accepted for snake/camel split).
   * @param {object} client    Bridge client (provides _getActiveTab for the
   *                           legacy fall-through branch).
   * @param {object} [options]
   * @param {boolean} [options.allowUnownedClaim] Permit a recovery caller to
   *                           continue with a tab that has no owner. This does
   *                           not permit cross-agent access.
   * @returns {Promise<{tabId:number, ownershipToken:string|null, skipGate:boolean}
   *           | {success:false, code:string, agentId?:string, tabIds?:number[]}>}
   */
  async function resolveAgentTabOrError(agentId, params, client, options) {
    // D-04 legacy:* branch -- first line, single rule.
    // skipGate:true signals the call site NOT to push tabId into routeParams
    // (preserves Phase 240's tab-arm-skip path for legacy popup/sidepanel/
    // autopilot surfaces, which do not track per-tab ownership tokens against
    // arbitrary user-active tabs after a tab switch).
    if (typeof agentId === 'string' && agentId.startsWith('legacy:')) {
      const tab = (client && typeof client._getActiveTab === 'function')
        ? await client._getActiveTab()
        : null;
      if (!tab || !Number.isFinite(tab.id)) {
        return { success: false, code: 'NO_ACTIVE_TAB', agentId };
      }
      return { tabId: tab.id, ownershipToken: null, skipGate: true };
    }

    // Registry authority is required before accepting any non-legacy target.
    const reg = (typeof globalThis !== 'undefined') ? globalThis.fsbAgentRegistryInstance : null;
    if (!reg || typeof reg.getAgentTabs !== 'function') {
      return { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId };
    }
    if (typeof agentId !== 'string' || agentId.length === 0
        || (typeof reg.hasAgent === 'function' && !reg.hasAgent(agentId))) {
      return { success: false, code: 'AGENT_NOT_REGISTERED', agentId };
    }
    const owned = reg.getAgentTabs(agentId);
    if (owned === null) {
      return { success: false, code: 'AGENT_NOT_REGISTERED', agentId };
    }
    if (!Array.isArray(owned)) {
      return { success: false, code: 'AGENT_REGISTRY_UNAVAILABLE', agentId };
    }
    const tabIds = owned.filter(Number.isFinite);

    // Explicit tab_id from caller. Direct content/CDP/read/vault routes do
    // not all pass through dispatchMcpToolRoute, so the resolver itself must
    // reject foreign targets rather than relying on a later gate.
    // Snake-case form is the MCP boundary convention; camelCase is retained
    // for already-normalized extension callers.
    const explicitTabId = params && Number.isFinite(params.tab_id)
      ? params.tab_id
      : (params && Number.isFinite(params.tabId) ? params.tabId : null);
    if (explicitTabId !== null) {
      if (tabIds.indexOf(explicitTabId) !== -1) {
        return { tabId: explicitTabId, ownershipToken: null, skipGate: false };
      }
      const hasOwnerAuthority = typeof reg.getOwner === 'function';
      const ownerAgentId = hasOwnerAuthority ? (reg.getOwner(explicitTabId) || null) : null;
      if (options
          && options.allowUnownedClaim === true
          && hasOwnerAuthority
          && ownerAgentId === null) {
        return { tabId: explicitTabId, ownershipToken: null, skipGate: false };
      }
      return {
        success: false,
        code: 'TAB_NOT_OWNED',
        agentId,
        requestingAgentId: agentId,
        requestedTabId: explicitTabId,
        ownerAgentId
      };
    }

    // Registry path -- D-01 three branches.
    if (tabIds.length === 0) {
      return { success: false, code: 'NO_OWNED_TAB', agentId };
    }
    if (tabIds.length > 1) {
      const selectedTabId = (typeof reg.getSelectedTabId === 'function')
        ? reg.getSelectedTabId(agentId)
        : null;
      if (Number.isFinite(selectedTabId) && tabIds.indexOf(selectedTabId) !== -1) {
        return { tabId: selectedTabId, ownershipToken: null, skipGate: false };
      }
      return { success: false, code: 'AMBIGUOUS_TAB', agentId, tabIds: tabIds.slice() };
    }
    return { tabId: tabIds[0], ownershipToken: null, skipGate: false };
  }

  exports.resolveAgentTabOrError = resolveAgentTabOrError;

  // Browser SW global registration so call sites can consult the resolver
  // without tracking an importScripts symbol.
  if (typeof globalThis !== 'undefined') {
    globalThis.resolveAgentTabOrError = resolveAgentTabOrError;
  }
})(typeof module !== 'undefined' && module.exports ? module.exports : {});
