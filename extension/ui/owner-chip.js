/**
 * Phase 243 plan 03 (UI-02) -- pure helpers for the popup/sidepanel
 * "owned by Agent X" read-only chip.
 *
 * Per CONTEXT D-05: when the active tab is owned by a non-self agent (i.e. the
 * registry says ownerAgentId !== mySurface), display an informational chip
 * `owned by <ownerAgentIdShort>` in the popup or sidepanel header. The chip is
 * READ-ONLY -- no click handler, no enforcement (Threat T-243-03-03).
 *
 * Hidden when:
 *   - ownerAgentId is null/undefined (unowned tab)
 *   - ownerAgentId === mySurface (popup owns its own popup-driven tab; or
 *     sidepanel owns its own sidepanel-driven tab)
 *
 * Shown when:
 *   - ownerAgentId is a non-legacy agent_<uuid> AND mySurface is legacy:popup
 *     or legacy:sidepanel (cross-surface ownership IS shown -- the user wants
 *     to know an MCP agent is driving the visible tab).
 *   - ownerAgentId is legacy:sidepanel and mySurface is legacy:popup (and vice
 *     versa). Cross-surface display IS allowed and informative -- only the
 *     SAME-surface case is suppressed.
 *
 * agentIdShort is produced upstream by the canonical formatAgentIdForDisplay
 * helper from extension/utils/agent-registry.js. This module never slices IDs
 * locally (Phase 243 RESEARCH anti-pattern).
 *
 * Classic-script load shape: registers on globalThis for popup/sidepanel
 * consumption AND exports for Node tests.
 */
(function(global) {
  'use strict';

  /**
   * @param {string|null|undefined} ownerAgentId - The active tab's owner per the registry.
   * @param {string} mySurface - 'legacy:popup' or 'legacy:sidepanel' (the calling surface).
   * @returns {boolean} true when the chip should render.
   */
  function shouldShowOwnerChip(ownerAgentId, mySurface) {
    if (!ownerAgentId || typeof ownerAgentId !== 'string') return false;
    if (!mySurface || typeof mySurface !== 'string') return false;
    if (ownerAgentId === mySurface) return false;
    return true;
  }

  /**
   * @param {string} ownerAgentIdShort - Pre-formatted display string.
   * @returns {string} The chip text. Always begins with "owned by ".
   */
  function buildChipText(ownerAgentIdShort) {
    var label = (ownerAgentIdShort === undefined || ownerAgentIdShort === null)
      ? '' : String(ownerAgentIdShort).trim();
    return 'owned by ' + label;
  }

  /**
   * Compute the display label for an ownerAgentId.
   *   - legacy:* -> the literal id (e.g. 'legacy:popup')
   *   - agent_<uuid> -> formatAgentIdForDisplay output (6 hex chars)
   *   - anything else -> the raw id (defensive fallback)
   *
   * @param {string} ownerAgentId
   * @param {function} formatAgentIdForDisplay - The SSOT helper from agent-registry.js.
   * @returns {string}
   */
  function ownerLabelFor(ownerAgentId, formatAgentIdForDisplay) {
    if (!ownerAgentId || typeof ownerAgentId !== 'string') return '';
    if (ownerAgentId.indexOf('legacy:') === 0) return ownerAgentId;
    if (typeof formatAgentIdForDisplay === 'function') {
      var short = formatAgentIdForDisplay(ownerAgentId);
      if (short) return short;
    }
    return ownerAgentId;
  }

  /**
   * Look up the owner of a given tabId in the persisted registry envelope.
   * The envelope shape (Phase 237 D-03 + Phase 240 D-04) is:
   *   { v: 1, records: { '<agentId>': { tabIds: number[], tabId?: number, ... }, ... } }
   *
   * Returns the agentId string whose record contains tabId, or null. The lookup
   * is a flat scan -- the registry is bounded (FSB_AGENT_CAP_MAX = 64 per
   * agent-registry.js:55) so this is O(64) worst case, well below any UI budget.
   *
   * @param {object|null|undefined} envelope - The chrome.storage.session value.
   * @param {number} tabId
   * @returns {string|null}
   */
  function findOwnerInEnvelope(envelope, tabId) {
    if (!envelope || typeof envelope !== 'object') return null;
    if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return null;
    var records = envelope.records;
    if (!records || typeof records !== 'object') return null;
    var keys = Object.keys(records);
    for (var i = 0; i < keys.length; i++) {
      var rec = records[keys[i]];
      if (!rec || typeof rec !== 'object') continue;
      if (Array.isArray(rec.tabIds) && rec.tabIds.indexOf(tabId) !== -1) {
        return keys[i];
      }
      if (rec.tabId === tabId) {
        return keys[i];
      }
    }
    return null;
  }

  /**
   * Phase 11 FINT-19 -- look up the friendly client label for a tab from
   * the visual-session lifecycle storage.
   *
   * Reads chrome.storage.session at key 'mcpVisualSession:' + tabId
   * (matches MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX from
   * mcp-visual-session-lifecycle.js:58). Returns the trimmed
   * entry.client value (Phase 10 D-01 lifecycle shape) when present,
   * otherwise null. Phase 10 FINT-16 + RESEARCH Section 1.A guarantee
   * that entry.client is pre-normalized to the 14-entry allowlist
   * (verified at mcp-visual-session-lifecycle.js:325-333 write-side
   * gate); this consumer does NOT re-validate against the allowlist.
   *
   * Storage read is injected via the storageReadFn parameter for
   * testability (D-06): production callers pass
   * (key) => chrome.storage.session.get(key); Node tests pass a
   * mock function.
   *
   * Best-effort: any error (invalid input, throw inside storage read,
   * missing entry, malformed shape) returns null. Never throws.
   *
   * @param {number} tabId
   * @param {function} storageReadFn  Async fn (key: string) -> bag
   * @returns {Promise<string|null>}
   */
  async function lookupClientLabel(tabId, storageReadFn) {
    if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId <= 0) return null;
    if (typeof storageReadFn !== 'function') return null;
    var key = 'mcpVisualSession:' + tabId;
    try {
      var bag = await storageReadFn(key);
      var entry = bag && bag[key];
      if (!entry || typeof entry !== 'object') return null;
      if (typeof entry.client !== 'string') return null;
      var trimmed = entry.client.trim();
      if (trimmed.length === 0) return null;
      return trimmed;
    } catch (_e) {
      return null;
    }
  }

  var exportsObj = {
    shouldShowOwnerChip: shouldShowOwnerChip,
    buildChipText: buildChipText,
    ownerLabelFor: ownerLabelFor,
    findOwnerInEnvelope: findOwnerInEnvelope,
    lookupClientLabel: lookupClientLabel
  };

  global.FSBOwnerChip = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
