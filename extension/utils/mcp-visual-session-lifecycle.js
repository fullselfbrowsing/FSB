/**
 * extension/utils/mcp-visual-session-lifecycle.js
 *
 * v0.9.62 implicit visual-session lifecycle helpers.
 *
 * Source-of-truth references:
 *   - .planning/v0.9.62-CONTRACT.md       (field-bundle keys: visual_reason, client, is_final;
 *                                          badge allowlist citation; error names)
 *   - .planning/phases/256-sliding-window-lifecycle-implicit-start-60s-death-timer-sw-eviction-replay/256-CONTEXT.md
 *                                         (per-tab entry shape; alarm + storage namespace decisions;
 *                                          MV3 SW-startup restore semantics; chrome.tabs.onRemoved cleanup)
 *
 * Purpose:
 *   Pure-helper module that owns the v0.9.62 sliding-window lifecycle state machine.
 *   Per-tab persistence in chrome.storage.session under key mcpVisualSession:<tabId>.
 *   MV3 SW-survivable death timers via chrome.alarms named mcpVisualDeath:<tabId>.
 *   Auto-clear, re-arm, restore-after-SW-eviction, and tab-close-cleanup paths.
 *
 * Important boot-order note:
 *   Importing this module does NOT change runtime behaviour on its own. Phase 256
 *   Plan 03 wires the chokepoint integration (recordVisualSessionTick calls), the
 *   chrome.alarms.onAlarm listener, the chrome.tabs.onRemoved listener, and the
 *   SW-startup restoreVisualSessionLifecyclesFromStorage call. This module exposes
 *   the helpers; the SW glue layer drives them.
 *
 * Namespace discipline (collision avoidance confirmed 2026-05-11):
 *   - Storage key prefix mcpVisualSession: does NOT collide with v0.9.36's single
 *     storage key 'fsbMcpVisualSessions' (background.js line 2098, map shape).
 *   - Alarm name prefix mcpVisualDeath: does NOT collide with 'fsb-mcp-bridge-reconnect'
 *     (MCP_RECONNECT_ALARM) or 'fsb-domstream-watchdog'.
 *
 * Defense in depth:
 *   - Phase 255 (mcp/src/tools/manual.ts) rejects bad client labels with
 *     BADGE_NOT_ALLOWED at the MCP server schema layer BEFORE the bridge forwards
 *     payloads to the extension SW. recordVisualSessionTick re-runs
 *     normalizeMcpVisualClientLabel anyway (T-256-01-01) so a future caller-bypass
 *     surface cannot smuggle a freeform label into the overlay.
 *   - v0.9.60 ownership gating in _handleExecuteAction is the primary defense
 *     against cross-agent hijack on a single tab. recordVisualSessionTick still
 *     checks entry.agentId vs caller agentId on update (T-256-01-04) as
 *     belt-and-suspenders before mutating state.
 *
 * Module export pattern mirrors extension/utils/mcp-visual-session.js (v0.9.36 utils):
 *   - IIFE wraps the surface.
 *   - Public functions and constants attach to a single global namespace
 *     (globalThis.MCPVisualSessionLifecycleUtils) for SW (importScripts) consumers.
 *   - CommonJS module.exports for Node test access.
 *
 * ASCII only. No emojis. No em-dashes between sentences (uses -- per project conventions).
 */
(function(global) {
  'use strict';

  /**
   * chrome.storage.session key prefix for the v0.9.62 per-tab lifecycle entry.
   * Full key shape: 'mcpVisualSession:<tabId>'.
   */
  var MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX = 'mcpVisualSession:';

  /**
   * chrome.alarms name prefix for the v0.9.62 sliding-window death timer.
   * Full name shape: 'mcpVisualDeath:<tabId>'.
   *
   * Chrome MV3 production-build alarm minimum delay is 30 seconds. The v0.9.62
   * sliding-window TTL is 60 seconds, so the death timer is comfortably above the
   * minimum and the alarm fires reliably. Test environments that load this module
   * via Node mock the chrome.alarms surface entirely.
   */
  var MCP_VISUAL_LIFECYCLE_ALARM_PREFIX = 'mcpVisualDeath:';

  /**
   * Sliding-window TTL for the implicit visual session, in milliseconds.
   * deadlineAt = lastTickAt + MCP_VISUAL_LIFECYCLE_DEATH_MS.
   *
   * Matches the v0.9.36 MCP_VISUAL_SESSION_DEGRADE_AFTER_MS (60_000 ms) so the
   * implicit lifecycle window aligns with the explicit-session degrade window
   * the overlay renderer already knows about.
   */
  var MCP_VISUAL_LIFECYCLE_DEATH_MS = 60000;

  /**
   * Compose the per-tab chrome.storage.session key.
   * @param {number} tabId
   * @returns {string|null} 'mcpVisualSession:<tabId>' on a finite positive integer; null otherwise.
   */
  function storageKeyForTab(tabId) {
    var numericTabId = Number(tabId);
    if (!Number.isFinite(numericTabId) || numericTabId <= 0) return null;
    return MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX + String(numericTabId);
  }

  /**
   * Compose the per-tab chrome.alarms name.
   * @param {number} tabId
   * @returns {string|null} 'mcpVisualDeath:<tabId>' on a finite positive integer; null otherwise.
   */
  function alarmNameForTab(tabId) {
    var numericTabId = Number(tabId);
    if (!Number.isFinite(numericTabId) || numericTabId <= 0) return null;
    return MCP_VISUAL_LIFECYCLE_ALARM_PREFIX + String(numericTabId);
  }

  /**
   * Resolve the v0.9.36 utils module from the SW global or CommonJS scope.
   * The lifecycle module is loaded via importScripts AFTER mcp-visual-session.js
   * in extension/background.js, so global.MCPVisualSessionUtils is set at module
   * evaluation time in the SW. In Node tests the caller assigns
   * global.MCPVisualSessionUtils = require('.../mcp-visual-session.js') before
   * requiring this file.
   *
   * @returns {object} The v0.9.36 utils export object.
   * @throws {Error} If the v0.9.36 utils module is not loaded.
   */
  function getVisualSessionUtils() {
    var utils = global && global.MCPVisualSessionUtils;
    if (!utils || typeof utils !== 'object') {
      throw new Error('MCPVisualSessionUtils is not loaded; mcp-visual-session.js must be importScripts-ed before mcp-visual-session-lifecycle.js');
    }
    return utils;
  }

  /**
   * Best-effort no-throw wrapper around chrome.storage.session.get for a single key.
   * @param {string} key
   * @returns {Promise<object|null>} Stored entry on success; null when absent or on error.
   */
  async function readStorageEntry(key) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return null;
    try {
      var bag = await chrome.storage.session.get(key);
      var entry = bag && bag[key];
      return entry && typeof entry === 'object' ? entry : null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Best-effort no-throw wrapper around chrome.storage.session.set.
   * @param {string} key
   * @param {object} entry
   * @returns {Promise<boolean>} True on success; false on error or missing chrome.storage.session.
   */
  async function writeStorageEntry(key, entry) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return false;
    try {
      var payload = {};
      payload[key] = entry;
      await chrome.storage.session.set(payload);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Best-effort no-throw wrapper around chrome.storage.session.remove.
   * @param {string} key
   * @returns {Promise<boolean>} True on success; false on error or missing chrome.storage.session.
   */
  async function deleteStorageEntry(key) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return false;
    try {
      await chrome.storage.session.remove(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Best-effort no-throw wrapper around chrome.alarms.clear for a single alarm name.
   * @param {string} name
   * @returns {Promise<boolean>} True on success (whether or not an alarm existed); false on error.
   */
  async function clearAlarm(name) {
    if (typeof chrome === 'undefined' || !chrome.alarms || typeof chrome.alarms.clear !== 'function') return false;
    try {
      await chrome.alarms.clear(name);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Best-effort no-throw wrapper around chrome.alarms.create.
   * @param {string} name
   * @param {object} alarmInfo  Chrome alarmInfo object; we pass { when: deadlineAt }.
   * @returns {Promise<boolean>} True on success; false on error.
   */
  async function createAlarm(name, alarmInfo) {
    if (typeof chrome === 'undefined' || !chrome.alarms || typeof chrome.alarms.create !== 'function') return false;
    try {
      await chrome.alarms.create(name, alarmInfo);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Compose a v0.9.36-compatible "session" object from a lifecycle entry so we can
   * reuse buildMcpVisualSessionStatus / buildMcpVisualSessionClearStatus from the
   * v0.9.36 utils module. Keeps the overlay payload byte-compatible with what the
   * existing content-script renderer already accepts.
   *
   * @param {object} entry Lifecycle entry from storage.
   * @param {object} options Optional overrides: { lastUpdateAt, version }.
   * @returns {object|null} Synthetic v0.9.36 session shape, or null if entry is missing.
   */
  function composeSessionShapeFromEntry(entry, options) {
    if (!entry || typeof entry !== 'object') return null;
    var opts = options || {};
    var lastUpdateAt = Number.isFinite(opts.lastUpdateAt) ? Number(opts.lastUpdateAt) : (Number.isFinite(entry.lastTickAt) ? Number(entry.lastTickAt) : Date.now());
    var version = Number.isFinite(opts.version) ? Number(opts.version) : 1;
    return {
      sessionToken: 'lifecycle:' + String(entry.tabId),
      clientLabel: entry.client,
      tabId: Number(entry.tabId),
      task: entry.visualReason || 'FSB Automating',
      detail: '',
      version: version,
      createdAt: Number.isFinite(entry.startedAt) ? Number(entry.startedAt) : lastUpdateAt,
      lastUpdateAt: lastUpdateAt,
      phase: 'planning',
      lifecycle: 'running',
      statusText: entry.visualReason || 'Working',
      animatedHighlights: true
    };
  }

  /**
   * Broadcast the running-state overlay payload via the SW-global sendSessionStatus.
   * sendSessionStatus is defined in extension/background.js (line 512) and is
   * available because both files share the SW global scope via importScripts.
   *
   * @param {object} entry Lifecycle entry from storage.
   * @returns {Promise<boolean>} True if a broadcast was attempted; false on missing sendSessionStatus.
   */
  async function broadcastRunningStatus(entry) {
    var utils = getVisualSessionUtils();
    if (typeof utils.buildMcpVisualSessionStatus !== 'function') return false;
    var sessionShape = composeSessionShapeFromEntry(entry);
    if (!sessionShape) return false;
    var statusData = utils.buildMcpVisualSessionStatus(sessionShape, {});
    if (!statusData) return false;
    var sender = global && typeof global.sendSessionStatus === 'function' ? global.sendSessionStatus : null;
    if (!sender) return false;
    try {
      await sender(sessionShape.tabId, statusData);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Broadcast the clear-state overlay payload via the SW-global sendSessionStatus.
   * Uses buildMcpVisualSessionClearStatus which returns phase: 'ended', mapped to
   * lifecycle: 'cleared' by extension/utils/overlay-state.js for the content-script
   * renderer at extension/content/messaging.js line 1106.
   *
   * @param {object} entry Lifecycle entry from storage.
   * @param {string} reason Clear reason string (default 'timeout').
   * @returns {Promise<boolean>} True if a broadcast was attempted; false on missing sendSessionStatus.
   */
  async function broadcastClearStatus(entry, reason) {
    var utils = getVisualSessionUtils();
    if (typeof utils.buildMcpVisualSessionClearStatus !== 'function') return false;
    var sessionShape = composeSessionShapeFromEntry(entry, { version: 2 });
    if (!sessionShape) return false;
    var clearStatus = utils.buildMcpVisualSessionClearStatus(sessionShape, { reason: reason || 'timeout' });
    if (!clearStatus) return false;
    var sender = global && typeof global.sendSessionStatus === 'function' ? global.sendSessionStatus : null;
    if (!sender) return false;
    try {
      await sender(sessionShape.tabId, clearStatus);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Trim and normalise a visual_reason string from caller input.
   * @param {*} raw
   * @returns {string} Trimmed string (possibly empty).
   */
  function normalizeVisualReason(raw) {
    return String(raw == null ? '' : raw).trim();
  }

  /**
   * Record a single visual-session lifecycle tick for the given tab + agent.
   *
   * Satisfies TIMEOUT-01 (implicit start on first action call) and TIMEOUT-02
   * (sliding 60s death-timer re-arm on every subsequent action call).
   *
   * @param {number} tabId Chrome tab id (finite positive integer).
   * @param {string} agentId v0.9.60 agent identity (agent_<uuid>).
   * @param {object} fields  { visualReason: string, client: string, isFinal?: boolean }.
   * @returns {Promise<object>} { ok: true, entry, action: 'created'|'updated' } on success;
   *                            { ok: false, reason: string } on validation / state errors.
   */
  async function recordVisualSessionTick(tabId, agentId, fields) {
    var numericTabId = Number(tabId);
    if (!Number.isFinite(numericTabId) || numericTabId <= 0) {
      return { ok: false, reason: 'invalid_tab_id' };
    }
    if (typeof agentId !== 'string' || agentId.trim().length === 0) {
      return { ok: false, reason: 'invalid_agent_id' };
    }
    var trimmedAgentId = agentId.trim();
    if (!fields || typeof fields !== 'object') {
      return { ok: false, reason: 'invalid_fields' };
    }

    var trimmedReason = normalizeVisualReason(fields.visualReason);
    if (!trimmedReason) {
      return { ok: false, reason: 'invalid_visual_reason' };
    }

    var utils = getVisualSessionUtils();
    var canonicalClient = (typeof utils.normalizeMcpVisualClientLabel === 'function')
      ? utils.normalizeMcpVisualClientLabel(fields.client)
      : null;
    if (!canonicalClient) {
      // T-256-01-01 defense in depth. Phase 255 BADGE_NOT_ALLOWED is the primary
      // gate at the MCP server schema layer; this is the second layer in case a
      // future caller-bypass surface emerges.
      return { ok: false, reason: 'client_not_allowed' };
    }

    var storageKey = storageKeyForTab(numericTabId);
    var alarmName = alarmNameForTab(numericTabId);
    if (!storageKey || !alarmName) {
      return { ok: false, reason: 'invalid_tab_id' };
    }

    var existingEntry = await readStorageEntry(storageKey);

    if (existingEntry && existingEntry.agentId && existingEntry.agentId !== trimmedAgentId) {
      // T-256-01-04 defense in depth. v0.9.60 ownership gate in the dispatcher
      // is the primary defense; this is the second layer that prevents lifecycle
      // state from being mutated by a non-owner even if the dispatcher gate is
      // bypassed in a future code path.
      return { ok: false, reason: 'agent_mismatch' };
    }

    var now = Date.now();
    var deadlineAt = now + MCP_VISUAL_LIFECYCLE_DEATH_MS;
    var isFinal = fields.isFinal === true;

    var nextEntry;
    var action;
    if (existingEntry) {
      // Update: preserve startedAt + agentId + client; refresh tick + deadline + reason + isFinal.
      nextEntry = {
        tabId: numericTabId,
        agentId: trimmedAgentId,
        client: existingEntry.client || canonicalClient,
        visualReason: trimmedReason,
        startedAt: Number.isFinite(existingEntry.startedAt) ? Number(existingEntry.startedAt) : now,
        lastTickAt: now,
        deadlineAt: deadlineAt,
        isFinal: isFinal,
        // Phase 10 FINT-16 -- driver discriminator (CONTEXT.md D-01). Preserves
        // existing entry value when present (backward-compat with pre-Phase-10
        // entries that lacked the field). Autopilot ticks pass driver: 'autopilot';
        // MCP ticks omit the field and default to 'mcp'.
        driver: existingEntry.driver || (fields.driver === 'autopilot' ? 'autopilot' : 'mcp')
      };
      action = 'updated';
    } else {
      // Create: fresh entry with startedAt == now.
      nextEntry = {
        tabId: numericTabId,
        agentId: trimmedAgentId,
        client: canonicalClient,
        visualReason: trimmedReason,
        startedAt: now,
        lastTickAt: now,
        deadlineAt: deadlineAt,
        isFinal: isFinal,
        // Phase 10 FINT-16 -- driver discriminator (CONTEXT.md D-01).
        driver: fields.driver === 'autopilot' ? 'autopilot' : 'mcp'
      };
      action = 'created';
    }

    var wrote = await writeStorageEntry(storageKey, nextEntry);
    if (!wrote) {
      return { ok: false, reason: 'storage_write_failed' };
    }

    // Always re-arm the death timer: clear any prior alarm then create the new one.
    await clearAlarm(alarmName);
    var armed = await createAlarm(alarmName, { when: deadlineAt });
    if (!armed) {
      // Storage is the source of truth; if alarm arming failed the entry still
      // exists and Plan 03's SW-startup restore can re-arm on the next wake. We
      // do not roll back the storage write because the tick is still semantically
      // recorded. Telemetry / logging is a separate surface owned by Plan 03.
    }

    await broadcastRunningStatus(nextEntry);

    return { ok: true, entry: nextEntry, action: action };
  }

  /**
   * Clear the visual session for a tab (auto-clear path or explicit clear).
   *
   * Behaviour:
   *   - Deletes the storage entry.
   *   - Clears the matching alarm.
   *   - Broadcasts the v0.9.36-compatible clear-status payload to the tab's
   *     content script (unless options.skipBroadcast is true).
   *   - Missing entry is a no-op (still clears the alarm for safety).
   *
   * @param {number} tabId
   * @param {object} options { reason?: string, skipBroadcast?: boolean }
   * @returns {Promise<object>} { ok: true, action: 'cleared'|'noop', entry?: object } on success;
   *                            { ok: false, reason: string } on validation errors.
   */
  async function clearVisualSession(tabId, options) {
    var storageKey = storageKeyForTab(tabId);
    var alarmName = alarmNameForTab(tabId);
    if (!storageKey || !alarmName) {
      return { ok: false, reason: 'invalid_tab_id' };
    }

    var opts = options || {};
    var reason = (typeof opts.reason === 'string' && opts.reason.trim().length > 0) ? opts.reason.trim() : 'timeout';
    var skipBroadcast = opts.skipBroadcast === true;

    var entry = await readStorageEntry(storageKey);
    if (!entry) {
      // Safety: clear alarm anyway in case storage was wiped externally.
      await clearAlarm(alarmName);
      return { ok: true, action: 'noop' };
    }

    if (!skipBroadcast) {
      await broadcastClearStatus(entry, reason);
    }

    await deleteStorageEntry(storageKey);
    await clearAlarm(alarmName);

    return { ok: true, action: 'cleared', entry: entry };
  }

  /**
   * Tab-close cleanup hook. Called from Plan 03's chrome.tabs.onRemoved listener.
   *
   * Drops the storage entry and the alarm without broadcasting (the tab is gone;
   * sendSessionStatus would fail anyway).
   *
   * @param {number} tabId
   * @returns {Promise<object>} Result from clearVisualSession with skipBroadcast: true.
   */
  async function handleVisualSessionLifecycleTabRemoved(tabId) {
    return clearVisualSession(tabId, { reason: 'tab_closed', skipBroadcast: true });
  }

  /**
   * Handle a chrome.alarms.onAlarm event for an mcpVisualDeath:<tabId> alarm.
   *
   * Satisfies TIMEOUT-03 (auto-clear after the 60s sliding window). The handler
   * is the SOLE deletion path for the auto-clear case; explicit clears and tab
   * removals route through clearVisualSession / handleVisualSessionLifecycleTabRemoved.
   *
   * Behaviour:
   *   - Returns { ok: false, reason: 'not_our_alarm' } if alarm.name does not
   *     match MCP_VISUAL_LIFECYCLE_ALARM_PREFIX. Plan 03's onAlarm fan-out
   *     should pre-filter, but this is defense-in-depth.
   *   - Returns { ok: false, reason: 'malformed_alarm_name' } if the tabId
   *     suffix cannot be parsed as a finite positive integer.
   *   - Returns { ok: true, action: 'noop_no_entry' } if the storage entry has
   *     already been cleared by another path (tab close, explicit clear, or
   *     Phase 257 is_final immediate-clear).
   *   - If Date.now() >= entry.deadlineAt, clears the session via
   *     clearVisualSession(tabId, { reason: 'timeout' }). Auto-clear path.
   *   - If Date.now() < entry.deadlineAt (Chrome alarm fired early or clock
   *     skew, T-256-01-06), reschedules a fresh alarm with when=entry.deadlineAt
   *     and DOES NOT delete the storage entry. Returns { ok: true, action:
   *     'rescheduled', entry, remainingMs }.
   *
   * @param {{ name: string }} alarm Chrome alarm object.
   * @returns {Promise<object>} Outcome descriptor (see Behaviour above).
   */
  async function handleVisualSessionLifecycleAlarm(alarm) {
    if (!alarm || typeof alarm !== 'object' || typeof alarm.name !== 'string') {
      return { ok: false, reason: 'not_our_alarm' };
    }
    if (alarm.name.indexOf(MCP_VISUAL_LIFECYCLE_ALARM_PREFIX) !== 0) {
      return { ok: false, reason: 'not_our_alarm' };
    }

    var suffix = alarm.name.slice(MCP_VISUAL_LIFECYCLE_ALARM_PREFIX.length);
    var tabId = Number(suffix);
    if (!Number.isFinite(tabId) || tabId <= 0) {
      return { ok: false, reason: 'malformed_alarm_name' };
    }

    var storageKey = storageKeyForTab(tabId);
    if (!storageKey) {
      return { ok: false, reason: 'malformed_alarm_name' };
    }

    var entry = await readStorageEntry(storageKey);
    if (!entry) {
      // T-256-01-05: stale alarm with no backing storage entry. The clear path
      // ran via another route; do not broadcast a spurious clear payload.
      return { ok: true, action: 'noop_no_entry' };
    }

    var now = Date.now();
    var deadlineAt = Number(entry.deadlineAt);
    if (!Number.isFinite(deadlineAt)) {
      // Malformed entry: best-effort clear so the SW does not loop.
      await clearVisualSession(tabId, { reason: 'malformed_entry' });
      return { ok: true, action: 'cleared', entry: entry, reason: 'malformed_entry' };
    }

    if (now >= deadlineAt) {
      // TIMEOUT-03 auto-clear path.
      await clearVisualSession(tabId, { reason: 'timeout' });
      return { ok: true, action: 'cleared', entry: entry };
    }

    // T-256-01-06 clock-skew defense: alarm fired before the deadline. Reschedule
    // a fresh alarm with the original deadline and leave the storage entry intact.
    var alarmName = alarmNameForTab(tabId);
    await createAlarm(alarmName, { when: deadlineAt });
    return { ok: true, action: 'rescheduled', entry: entry, remainingMs: deadlineAt - now };
  }

  /**
   * Replay every persisted lifecycle entry on SW startup.
   *
   * Satisfies TIMEOUT-04 (MV3 SW-eviction replay): the death-timer arithmetic
   * does NOT silently reset on SW wake -- alarms are re-armed with the ORIGINAL
   * deadlineAt so the sliding window survives SW eviction transparently.
   *
   * Behaviour:
   *   - Reads all keys from chrome.storage.session.
   *   - Filters to those matching MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX.
   *   - Drops malformed entries (missing tabId / agentId / client / deadlineAt
   *     or wrong types) via chrome.storage.session.remove.
   *   - For each well-formed entry:
   *       * If Date.now() >= entry.deadlineAt, calls clearVisualSession(tabId,
   *         { reason: 'timeout' }). The clear broadcast fails silently for closed
   *         tabs via the existing sendSessionStatus delivery-retry path.
   *       * Otherwise calls chrome.alarms.create with when=entry.deadlineAt.
   *
   * Plan 03 calls this once at SW startup. Subsequent SW wakes from the alarm
   * fire route through handleVisualSessionLifecycleAlarm.
   *
   * @returns {Promise<object>} { ok: true, restored: number, cleared: number, dropped: number }.
   */
  async function restoreVisualSessionLifecyclesFromStorage() {
    var counters = { restored: 0, cleared: 0, dropped: 0 };

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) {
      return Object.assign({ ok: true }, counters);
    }

    var bag = null;
    try {
      bag = await chrome.storage.session.get(null);
    } catch (_error) {
      return Object.assign({ ok: false, reason: 'storage_read_failed' }, counters);
    }
    if (!bag || typeof bag !== 'object') {
      return Object.assign({ ok: true }, counters);
    }

    var now = Date.now();
    var keys = Object.keys(bag);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf(MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX) !== 0) continue;

      var entry = bag[key];
      var tabIdFromKey = Number(key.slice(MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX.length));
      var malformed = false;

      if (!entry || typeof entry !== 'object') {
        malformed = true;
      } else {
        var entryTabId = Number(entry.tabId);
        var entryDeadline = Number(entry.deadlineAt);
        if (!Number.isFinite(entryTabId) || entryTabId <= 0) malformed = true;
        else if (typeof entry.agentId !== 'string' || entry.agentId.trim().length === 0) malformed = true;
        else if (typeof entry.client !== 'string' || entry.client.trim().length === 0) malformed = true;
        else if (!Number.isFinite(entryDeadline)) malformed = true;
        else if (Number.isFinite(tabIdFromKey) && tabIdFromKey > 0 && tabIdFromKey !== entryTabId) malformed = true;
      }

      if (malformed) {
        await deleteStorageEntry(key);
        counters.dropped += 1;
        continue;
      }

      var entryDeadlineAt = Number(entry.deadlineAt);
      var entryTabIdNumber = Number(entry.tabId);

      if (now >= entryDeadlineAt) {
        // Auto-clear path. Fires the v0.9.36 clear payload to the content
        // script if the tab is still alive; sendSessionStatus' delivery-retry
        // path swallows errors for closed tabs.
        await clearVisualSession(entryTabIdNumber, { reason: 'timeout' });
        counters.cleared += 1;
      } else {
        // TIMEOUT-04: re-arm with the ORIGINAL deadlineAt.
        var alarmNameRestore = alarmNameForTab(entryTabIdNumber);
        await createAlarm(alarmNameRestore, { when: entryDeadlineAt });
        counters.restored += 1;
      }
    }

    return Object.assign({ ok: true }, counters);
  }

  // --- Module exports (mirrors v0.9.36 utils export pattern at mcp-visual-session.js:553-575) ---

  var exportsObj = {
    MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX: MCP_VISUAL_LIFECYCLE_STORAGE_KEY_PREFIX,
    MCP_VISUAL_LIFECYCLE_ALARM_PREFIX: MCP_VISUAL_LIFECYCLE_ALARM_PREFIX,
    MCP_VISUAL_LIFECYCLE_DEATH_MS: MCP_VISUAL_LIFECYCLE_DEATH_MS,
    recordVisualSessionTick: recordVisualSessionTick,
    clearVisualSession: clearVisualSession,
    handleVisualSessionLifecycleTabRemoved: handleVisualSessionLifecycleTabRemoved,
    handleVisualSessionLifecycleAlarm: handleVisualSessionLifecycleAlarm,
    restoreVisualSessionLifecyclesFromStorage: restoreVisualSessionLifecyclesFromStorage
  };

  global.MCPVisualSessionLifecycleUtils = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
