(function(global) {
  'use strict';

  var MCP_VISUAL_CLIENT_LABELS = [
    'Claude',
    'Codex',
    'ChatGPT',
    'Perplexity',
    'Windsurf',
    'Cursor',
    'Antigravity',
    'OpenCode',
    'OpenClaw',
    'OpenClaw 🦀',
    'Grok',
    'Gemini',
    'Hermes',
    // Phase 10 FINT-16 -- autopilot driver discriminator (D-02)
    'FSB Autopilot',
    // Quick task 260608-6nm -- Tier-1 MCP clients (modelcontextprotocol.io clients + awesome-mcp-clients + Nimbalyst 2026)
    'Cline',
    'Continue',
    'Zed',
    'VS Code',
    'Copilot',
    'JetBrains',
    'Xcode',
    'Eclipse',
    'Cody',
    'Roo Code',
    'Kiro',
    'Goose'
  ];

  var CLIENT_LABEL_MAP = Object.create(null);
  MCP_VISUAL_CLIENT_LABELS.forEach(function(label) {
    CLIENT_LABEL_MAP[toClientLabelKey(label)] = label;
  });

  var MCP_VISUAL_SESSION_FINAL_CLEAR_DELAY_MS = 3200;
  var MCP_VISUAL_SESSION_DEGRADE_AFTER_MS = 60000;
  var MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS = 120000;

  function toClientLabelKey(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
  }

  function normalizeMcpVisualClientLabel(raw) {
    var key = toClientLabelKey(raw);
    return key ? (CLIENT_LABEL_MAP[key] || null) : null;
  }

  function isAllowedMcpVisualClientLabel(raw) {
    return !!normalizeMcpVisualClientLabel(raw);
  }

  function getAllowedMcpVisualClientLabels() {
    return MCP_VISUAL_CLIENT_LABELS.slice();
  }

  function createMcpVisualSessionToken() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'mcpv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeText(value, fallback) {
    var text = String(value == null ? '' : value).trim();
    return text || (fallback || '');
  }

  function normalizeLifecycle(value, fallback) {
    var lifecycle = normalizeText(value, '');
    if (lifecycle === 'final' || lifecycle === 'cleared' || lifecycle === 'running') {
      return lifecycle;
    }
    return fallback || 'running';
  }

  function normalizeResult(value) {
    var result = normalizeText(value, '');
    if (result === 'success' || result === 'partial' || result === 'error') {
      return result;
    }
    return '';
  }

  function cloneStructuredValue(value) {
    if (!value || typeof value !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return null;
    }
  }

  function McpVisualSessionManager() {
    this._sessionsByToken = new Map();
    this._tokenByTabId = new Map();
  }

  McpVisualSessionManager.prototype.startSession = function(input) {
    var canonicalClientLabel = normalizeMcpVisualClientLabel(input && input.clientLabel);
    if (!canonicalClientLabel) {
      return { errorCode: 'invalid_client_label' };
    }

    var tabId = Number(input && input.tabId);
    if (!Number.isFinite(tabId) || tabId <= 0) {
      return { errorCode: 'no_active_tab' };
    }

    var task = normalizeText(input && input.task, 'FSB Automating');
    var detail = normalizeText(input && input.detail, '');
    var now = Number.isFinite(input && input.now) ? input.now : Date.now();
    var existingToken = this._tokenByTabId.get(tabId) || null;
    var replacedSession = existingToken ? (this._sessionsByToken.get(existingToken) || null) : null;

    // Phase 240 D-09 + D-03 + Open Q4 dual-layer rejection.
    // The dispatcher gate (Plan 02) catches cross-agent on the
    // start_visual_session tool path; this layer catches the same-tab-
    // different-agent re-entry case specific to visual sessions, AND the
    // same-agent resume case (D-03). The legacy displacement code path
    // below still fires for tabs with NO registry owner, preserving the
    // v0.9.36 idempotent-startSession contract for unowned tabs.
    var existingSession = existingToken ? (this._sessionsByToken.get(existingToken) || null) : null;
    var registryOwner = (typeof globalThis !== 'undefined' &&
                         globalThis.fsbAgentRegistryInstance &&
                         typeof globalThis.fsbAgentRegistryInstance.getOwner === 'function')
      ? globalThis.fsbAgentRegistryInstance.getOwner(tabId) : null;

    if (existingSession && input && typeof input.agentId === 'string' && registryOwner) {
      if (registryOwner !== input.agentId) {
        // D-09: cross-agent reject. The existing session is left untouched
        // (no version bump, no token rotation) so the legitimate owner can
        // continue operating.
        return { errorCode: 'tab_owned_by_other_agent', ownerAgentId: registryOwner };
      }
      // D-03: same-agent re-entry RESUMES the prior session (NOT
      // endSession-then-start). Mutate the existing session in place;
      // preserve sessionToken so getTokenForTab returns the SAME token
      // (idempotent contract). Caller-supplied task/detail update the
      // session; lastUpdateAt + version bump happen here.
      existingSession.task = normalizeText(input && input.task, existingSession.task);
      existingSession.detail = normalizeText(input && input.detail, existingSession.detail);
      existingSession.lastUpdateAt = now;
      existingSession.version = (existingSession.version || 1) + 1;
      // Phase 240 D-03 (WR-02): when the prior session reached terminal
      // lifecycle ('final' with finalClearAt + result), reset those
      // fields so the resumed session presents a fresh running state.
      // Without this, the overlay state machine keeps rendering the
      // completed final card under a new task title.
      if (existingSession.lifecycle === 'final') {
        existingSession.lifecycle = 'running';
        existingSession.phase = 'planning';
        existingSession.finalClearAt = null;
        existingSession.finalClearReason = '';
        existingSession.result = '';
        existingSession.reason = '';
        existingSession.statusText = existingSession.detail || 'Ready to begin';
      }
      // Re-store (no-op for live reference, but keeps intent explicit).
      this._sessionsByToken.set(existingToken, existingSession);
      return { session: cloneSession(existingSession), resumed: true };
    }

    if (existingToken) {
      this._sessionsByToken.delete(existingToken);
    }

    var sessionToken = normalizeText(input && input.sessionToken, createMcpVisualSessionToken());
    var session = {
      sessionToken: sessionToken,
      clientLabel: canonicalClientLabel,
      tabId: tabId,
      task: task,
      detail: detail,
      version: 1,
      createdAt: now,
      lastUpdateAt: now,
      phase: 'planning',
      lifecycle: 'running',
      statusText: detail || 'Ready to begin',
      animatedHighlights: true
    };

    this._sessionsByToken.set(sessionToken, session);
    this._tokenByTabId.set(tabId, sessionToken);

    return {
      session: cloneSession(session),
      replacedSession: cloneSession(replacedSession)
    };
  };

  McpVisualSessionManager.prototype.getSession = function(sessionToken) {
    return cloneSession(this._sessionsByToken.get(normalizeText(sessionToken, '')) || null);
  };

  McpVisualSessionManager.prototype.getTokenForTab = function(tabId) {
    return this._tokenByTabId.get(Number(tabId)) || null;
  };

  McpVisualSessionManager.prototype.restoreSession = function(record) {
    var restored = restoreMcpVisualSessionRecord(record);
    if (!restored) {
      return { errorCode: 'invalid_session_record' };
    }

    var existingSession = this._sessionsByToken.get(restored.sessionToken) || null;
    if (existingSession && this._tokenByTabId.get(existingSession.tabId) === restored.sessionToken && existingSession.tabId !== restored.tabId) {
      this._tokenByTabId.delete(existingSession.tabId);
    }

    var existingToken = this._tokenByTabId.get(restored.tabId) || null;
    var replacedSession = existingToken ? (this._sessionsByToken.get(existingToken) || null) : null;
    if (existingToken && existingToken !== restored.sessionToken) {
      this._sessionsByToken.delete(existingToken);
    }

    this._sessionsByToken.set(restored.sessionToken, restored);
    this._tokenByTabId.set(restored.tabId, restored.sessionToken);

    return {
      session: cloneSession(restored),
      replacedSession: cloneSession(replacedSession)
    };
  };

  McpVisualSessionManager.prototype.updateSession = function(sessionToken, patch) {
    var token = normalizeText(sessionToken, '');
    var session = this._sessionsByToken.get(token);
    if (!session) return null;

    var nextPatch = patch || {};
    session.version = Number.isFinite(nextPatch.version) ? nextPatch.version : (session.version + 1);
    session.lastUpdateAt = Number.isFinite(nextPatch.lastUpdateAt) ? nextPatch.lastUpdateAt : Date.now();

    if (nextPatch.task !== undefined) {
      session.task = normalizeText(nextPatch.task, session.task || 'FSB Automating');
    }
    if (nextPatch.detail !== undefined) {
      session.detail = normalizeText(nextPatch.detail, '');
    }
    if (Number.isFinite(nextPatch.tabId) && nextPatch.tabId > 0 && nextPatch.tabId !== session.tabId) {
      this._tokenByTabId.delete(session.tabId);
      session.tabId = Number(nextPatch.tabId);
      this._tokenByTabId.set(session.tabId, token);
    }
    applyVisualSessionPatch(session, nextPatch);

    return cloneSession(session);
  };

  McpVisualSessionManager.prototype.endSession = function(sessionToken, options) {
    var token = normalizeText(sessionToken, '');
    var session = this._sessionsByToken.get(token);
    if (!session) return null;

    var opts = options || {};
    var clearedSession = {
      sessionToken: session.sessionToken,
      clientLabel: session.clientLabel,
      tabId: session.tabId,
      task: session.task,
      detail: session.detail,
      version: Number.isFinite(opts.version) ? opts.version : (session.version + 1),
      createdAt: session.createdAt,
      lastUpdateAt: Number.isFinite(opts.lastUpdateAt) ? opts.lastUpdateAt : Date.now(),
      reason: normalizeText(opts.reason, 'ended')
    };

    this._sessionsByToken.delete(token);
    if (this._tokenByTabId.get(session.tabId) === token) {
      this._tokenByTabId.delete(session.tabId);
    }

    return clearedSession;
  };

  function applyVisualSessionPatch(session, patch) {
    if (!session || !patch || typeof patch !== 'object') return;

    if (patch.phase !== undefined) {
      session.phase = normalizeText(patch.phase, session.phase || 'planning');
    }

    if (patch.lifecycle !== undefined) {
      session.lifecycle = normalizeLifecycle(patch.lifecycle, session.lifecycle || 'running');
    }

    if (patch.statusText !== undefined) {
      session.statusText = normalizeText(
        patch.statusText,
        session.detail || session.task || 'Working'
      );
    }

    if (patch.taskSummary !== undefined) {
      var taskSummary = normalizeText(patch.taskSummary, '');
      if (taskSummary) session.taskSummary = taskSummary;
      else delete session.taskSummary;
    }

    if (patch.result !== undefined) {
      var result = normalizeResult(patch.result);
      if (result) session.result = result;
      else delete session.result;
    }

    if (patch.reason !== undefined) {
      var reason = normalizeText(patch.reason, '');
      if (reason) session.reason = reason;
      else delete session.reason;
    }

    if (patch.display !== undefined) {
      var display = cloneStructuredValue(patch.display);
      if (display && typeof display === 'object') session.display = display;
      else delete session.display;
    }

    if (patch.progress !== undefined) {
      var progress = cloneStructuredValue(patch.progress);
      if (progress && typeof progress === 'object') session.progress = progress;
      else delete session.progress;
    }

    if (patch.animatedHighlights !== undefined) {
      session.animatedHighlights = patch.animatedHighlights !== false;
    }

    if (patch.finalClearAt !== undefined) {
      if (Number.isFinite(patch.finalClearAt) && patch.finalClearAt > 0) {
        session.finalClearAt = Number(patch.finalClearAt);
      } else {
        delete session.finalClearAt;
      }
    }

    if (patch.finalClearReason !== undefined) {
      var finalClearReason = normalizeText(patch.finalClearReason, '');
      if (finalClearReason) session.finalClearReason = finalClearReason;
      else delete session.finalClearReason;
    }
  }

  function cloneSession(session) {
    return session ? {
      sessionToken: session.sessionToken,
      clientLabel: session.clientLabel,
      tabId: session.tabId,
      task: session.task,
      detail: session.detail,
      version: session.version,
      createdAt: session.createdAt,
      lastUpdateAt: session.lastUpdateAt,
      phase: session.phase || 'planning',
      lifecycle: normalizeLifecycle(session.lifecycle, 'running'),
      statusText: session.statusText || session.detail || session.task || 'Working',
      animatedHighlights: session.animatedHighlights !== false,
      ...(session.taskSummary ? { taskSummary: session.taskSummary } : {}),
      ...(session.result ? { result: session.result } : {}),
      ...(session.reason ? { reason: session.reason } : {}),
      ...(session.display ? { display: cloneStructuredValue(session.display) } : {}),
      ...(session.progress ? { progress: cloneStructuredValue(session.progress) } : {}),
      ...(Number.isFinite(session.finalClearAt) ? { finalClearAt: session.finalClearAt } : {}),
      ...(session.finalClearReason ? { finalClearReason: session.finalClearReason } : {})
    } : null;
  }

  function serializeMcpVisualSessionRecord(session) {
    return cloneSession(session);
  }

  function restoreMcpVisualSessionRecord(record) {
    if (!record || typeof record !== 'object') return null;

    var sessionToken = normalizeText(record.sessionToken, '');
    var clientLabel = normalizeMcpVisualClientLabel(record.clientLabel);
    var tabId = Number(record.tabId);
    if (!sessionToken || !clientLabel || !Number.isFinite(tabId) || tabId <= 0) {
      return null;
    }

    var createdAt = Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now();
    var lastUpdateAt = Number.isFinite(record.lastUpdateAt) ? Number(record.lastUpdateAt) : createdAt;
    var version = Number.isFinite(record.version) && Number(record.version) > 0 ? Number(record.version) : 1;
    var task = normalizeText(record.task, 'FSB Automating');
    var detail = normalizeText(record.detail, '');
    var statusText = normalizeText(record.statusText, detail || task || 'Working');
    var restored = {
      sessionToken: sessionToken,
      clientLabel: clientLabel,
      tabId: tabId,
      task: task,
      detail: detail,
      version: version,
      createdAt: createdAt,
      lastUpdateAt: lastUpdateAt,
      phase: normalizeText(record.phase, 'planning'),
      lifecycle: normalizeLifecycle(record.lifecycle, 'running'),
      statusText: statusText,
      animatedHighlights: record.animatedHighlights !== false
    };

    var taskSummary = normalizeText(record.taskSummary, '');
    if (taskSummary) restored.taskSummary = taskSummary;

    var result = normalizeResult(record.result);
    if (result) restored.result = result;

    var reason = normalizeText(record.reason, '');
    if (reason) restored.reason = reason;

    var display = cloneStructuredValue(record.display);
    if (display && typeof display === 'object') restored.display = display;

    var progress = cloneStructuredValue(record.progress);
    if (progress && typeof progress === 'object') restored.progress = progress;

    if (Number.isFinite(record.finalClearAt) && Number(record.finalClearAt) > 0) {
      restored.finalClearAt = Number(record.finalClearAt);
    }

    var finalClearReason = normalizeText(record.finalClearReason, '');
    if (finalClearReason) restored.finalClearReason = finalClearReason;

    return restored;
  }

  function buildMcpVisualSessionStatus(session, overrides) {
    if (!session) return null;
    var opts = overrides || {};
    var status = {
      sessionToken: session.sessionToken,
      version: Number.isFinite(opts.version) ? opts.version : session.version,
      clientLabel: session.clientLabel,
      phase: normalizeText(opts.phase, session.phase || 'planning'),
      lifecycle: normalizeLifecycle(opts.lifecycle, session.lifecycle || 'running'),
      taskName: normalizeText(opts.taskName, session.task || 'FSB Automating'),
      statusText: normalizeText(
        opts.statusText,
        opts.detail !== undefined
          ? opts.detail
          : (session.statusText || session.detail || session.task || 'Working')
      ),
      taskSummary: normalizeText(opts.taskSummary, session.taskSummary || ''),
      animatedHighlights: opts.animatedHighlights !== undefined
        ? opts.animatedHighlights !== false
        : (session.animatedHighlights !== false)
    };

    var result = normalizeResult(opts.result !== undefined ? opts.result : session.result);
    if (result) status.result = result;

    var reason = normalizeText(opts.reason !== undefined ? opts.reason : session.reason, '');
    if (reason) status.reason = reason;

    var display = cloneStructuredValue(opts.display !== undefined ? opts.display : session.display);
    if (display && typeof display === 'object') status.display = display;

    var progress = cloneStructuredValue(opts.progress !== undefined ? opts.progress : session.progress);
    if (progress && typeof progress === 'object') status.progress = progress;

    if (Number.isFinite(opts.progressPercent)) status.progressPercent = opts.progressPercent;

    return status;
  }

  function buildMcpVisualSessionClearStatus(session, overrides) {
    if (!session) return null;
    var opts = overrides || {};
    return {
      sessionToken: session.sessionToken,
      version: Number.isFinite(opts.version) ? opts.version : session.version,
      clientLabel: session.clientLabel,
      phase: 'ended',
      reason: normalizeText(opts.reason, session.reason || 'ended')
    };
  }

  function buildMcpVisualSessionWaitingStatus(session) {
    return buildMcpVisualSessionStatus(session, {
      phase: 'waiting',
      lifecycle: 'running',
      statusText: 'Waiting for MCP client',
      taskSummary: session.taskSummary || session.task,
      display: {
        title: session.taskSummary || session.task || 'FSB Automating',
        subtitle: 'Waiting for MCP client',
        detail: session.detail || 'Reconnect or send another progress update'
      },
      progress: {
        mode: 'indeterminate',
        label: 'Waiting'
      }
    });
  }

  function planMcpVisualSessionReplay(record, options) {
    var session = restoreMcpVisualSessionRecord(record);
    if (!session) {
      return { action: 'ignore', reason: 'invalid_session_record' };
    }

    var opts = options || {};
    var now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
    var degradeAfterMs = Number.isFinite(opts.degradeAfterMs)
      ? Number(opts.degradeAfterMs)
      : MCP_VISUAL_SESSION_DEGRADE_AFTER_MS;
    var orphanAfterMs = Number.isFinite(opts.orphanAfterMs)
      ? Number(opts.orphanAfterMs)
      : MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS;
    var idleAgeMs = Math.max(0, now - session.lastUpdateAt);

    if (session.lifecycle === 'final') {
      if (!Number.isFinite(session.finalClearAt) || session.finalClearAt <= now) {
        return {
          action: 'clear',
          reason: normalizeText(session.finalClearReason, session.reason || session.result || 'complete'),
          idleAgeMs: idleAgeMs,
          session: session
        };
      }

      return {
        action: 'replay',
        mode: 'final',
        idleAgeMs: idleAgeMs,
        clearAfterMs: Math.max(0, session.finalClearAt - now),
        session: session,
        status: buildMcpVisualSessionStatus(session)
      };
    }

    if (idleAgeMs > orphanAfterMs) {
      return {
        action: 'clear',
        reason: 'timeout',
        idleAgeMs: idleAgeMs,
        session: session
      };
    }

    if (idleAgeMs > degradeAfterMs) {
      return {
        action: 'replay',
        mode: 'degraded',
        idleAgeMs: idleAgeMs,
        session: session,
        status: buildMcpVisualSessionWaitingStatus(session)
      };
    }

    return {
      action: 'replay',
      mode: 'running',
      idleAgeMs: idleAgeMs,
      session: session,
      status: buildMcpVisualSessionStatus(session)
    };
  }

  var exportsObj = {
    MCP_VISUAL_CLIENT_LABELS: MCP_VISUAL_CLIENT_LABELS,
    MCP_VISUAL_SESSION_FINAL_CLEAR_DELAY_MS: MCP_VISUAL_SESSION_FINAL_CLEAR_DELAY_MS,
    MCP_VISUAL_SESSION_DEGRADE_AFTER_MS: MCP_VISUAL_SESSION_DEGRADE_AFTER_MS,
    MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS: MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS,
    McpVisualSessionManager: McpVisualSessionManager,
    createMcpVisualSessionToken: createMcpVisualSessionToken,
    normalizeMcpVisualClientLabel: normalizeMcpVisualClientLabel,
    isAllowedMcpVisualClientLabel: isAllowedMcpVisualClientLabel,
    getAllowedMcpVisualClientLabels: getAllowedMcpVisualClientLabels,
    serializeMcpVisualSessionRecord: serializeMcpVisualSessionRecord,
    restoreMcpVisualSessionRecord: restoreMcpVisualSessionRecord,
    planMcpVisualSessionReplay: planMcpVisualSessionReplay,
    buildMcpVisualSessionStatus: buildMcpVisualSessionStatus,
    buildMcpVisualSessionClearStatus: buildMcpVisualSessionClearStatus
  };

  global.MCPVisualSessionUtils = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
