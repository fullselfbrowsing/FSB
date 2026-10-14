// Guard against re-injection - content scripts can be injected multiple times
// Use globalThis which works in both service workers (self) and content scripts (window)
if (globalThis.__FSB_AUTOMATION_LOGGER_LOADED__) {
  console.log('[FSB] automation-logger.js already loaded, skipping');
} else {
  // Mark as loaded
  globalThis.__FSB_AUTOMATION_LOGGER_LOADED__ = true;
  console.log('[FSB] automation-logger.js loading');

  // Automation Logger for FSB
  // Provides structured logging for debugging automation loops

  const TRUSTED_MESSAGE = Object.freeze({
    LOG_REPLACE: 'fsb:automation-log-replace',
    LOG_LOAD: 'fsb:automation-log-load',
    SESSION_SAVE: 'fsb:automation-session-save',
    SESSION_LOAD: 'fsb:automation-session-load',
    SESSION_LIST: 'fsb:automation-session-list',
    SESSION_DELETE: 'fsb:automation-session-delete',
    SESSION_CLEAR: 'fsb:automation-session-clear',
    SESSION_UPDATE_OUTCOME: 'fsb:automation-session-update-outcome',
    SESSION_PRUNE_MCP: 'fsb:automation-session-prune-mcp',
    SNAPSHOT_LOAD: 'fsb:automation-dom-snapshot-load'
  });

  function getTrustedFeatureStore() {
    const store = globalThis.fsbTrustedLocalFeatureStore;
    return store && typeof store === 'object' ? store : null;
  }

  function sendTrustedFeatureMessage(message) {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response || null);
        });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function trustedMessageByteLength(value) {
    const serialized = JSON.stringify(value) || '';
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).length;
    return unescape(encodeURIComponent(serialized)).length;
  }

  function trustedReplaceAutomationLogs(logs) {
    const boundedLogs = (Array.isArray(logs) ? logs : []).slice(-AUTOMATION_LOGS_PERSISTED_TAIL);
    while (boundedLogs.length && trustedMessageByteLength({
      action: TRUSTED_MESSAGE.LOG_REPLACE,
      logs: boundedLogs
    }) > 240000) boundedLogs.shift();
    const store = getTrustedFeatureStore();
    if (store && typeof store.replaceAutomationLogs === 'function') {
      return Promise.resolve(store.replaceAutomationLogs(boundedLogs));
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.LOG_REPLACE, logs: boundedLogs });
  }

  function trustedLoadAutomationLogs() {
    const store = getTrustedFeatureStore();
    if (store && typeof store.loadAutomationLogs === 'function') {
      return Promise.resolve(store.loadAutomationLogs());
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.LOG_LOAD });
  }

  function trustedSaveAutomationSession(sessionId, session, snapshots) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.saveAutomationSession === 'function') {
      return Promise.resolve(store.saveAutomationSession(sessionId, session, snapshots));
    }
    return sendTrustedFeatureMessage({
      action: TRUSTED_MESSAGE.SESSION_SAVE,
      sessionId,
      session,
      snapshots
    });
  }

  function trustedLoadAutomationSession(sessionId) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.loadAutomationSession === 'function') {
      return Promise.resolve(store.loadAutomationSession(sessionId));
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.SESSION_LOAD, sessionId });
  }

  function trustedListAutomationSessions() {
    const store = getTrustedFeatureStore();
    if (store && typeof store.listAutomationSessions === 'function') {
      return Promise.resolve(store.listAutomationSessions());
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.SESSION_LIST });
  }

  function trustedDeleteAutomationSession(sessionId) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.deleteAutomationSession === 'function') {
      return Promise.resolve(store.deleteAutomationSession(sessionId));
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.SESSION_DELETE, sessionId });
  }

  function trustedClearAutomationSessions() {
    const store = getTrustedFeatureStore();
    if (store && typeof store.clearAutomationSessions === 'function') {
      return Promise.resolve(store.clearAutomationSessions());
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.SESSION_CLEAR });
  }

  function trustedUpdateAutomationSessionOutcome(sessionId, outcome) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.updateAutomationSessionOutcome === 'function') {
      return Promise.resolve(store.updateAutomationSessionOutcome(sessionId, outcome));
    }
    return sendTrustedFeatureMessage({
      action: TRUSTED_MESSAGE.SESSION_UPDATE_OUTCOME,
      sessionId,
      outcome
    });
  }

  function trustedPruneMcpAutomationSessions(retentionDays) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.pruneMcpAutomationSessions === 'function') {
      return Promise.resolve(store.pruneMcpAutomationSessions(retentionDays));
    }
    return sendTrustedFeatureMessage({
      action: TRUSTED_MESSAGE.SESSION_PRUNE_MCP,
      retentionDays
    });
  }

  function trustedLoadAutomationDOMSnapshots(sessionId) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.loadAutomationDOMSnapshots === 'function') {
      return Promise.resolve(store.loadAutomationDOMSnapshots(sessionId));
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.SNAPSHOT_LOAD, sessionId });
  }

  function getSafeSnapshotOrigin(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : '';
    } catch (_error) {
      return '';
    }
  }

  const FSB_BRIDGE_SECRET_PATTERN = /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;

  function getSafePersistedText(value, maxChars) {
    let text = String(value === undefined || value === null ? '' : value);
    try {
      if (typeof globalThis.redactBridgeSecretsInString === 'function') {
        const sharedResult = globalThis.redactBridgeSecretsInString(text);
        if (typeof sharedResult === 'string') text = sharedResult;
      } else {
        text = text.replace(FSB_BRIDGE_SECRET_PATTERN, '[REDACTED_FSB_BRIDGE_SECRET]');
      }
    } catch (_error) {
      text = text.replace(FSB_BRIDGE_SECRET_PATTERN, '[REDACTED_FSB_BRIDGE_SECRET]');
    }
    return text
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, '[redacted]')
      .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/gi, '[redacted]')
      .replace(/\b(?:api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
      .slice(0, maxChars);
  }

  function getSafePersistedLogData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const safe = {};
    ['logType', 'provider', 'category', 'action', 'reason', 'sessionId'].forEach((key) => {
      if (typeof data[key] === 'string') safe[key] = getSafePersistedText(data[key], 96);
    });
    ['statusCode', 'durationMs', 'iterationCount', 'actionCount', 'tabId'].forEach((key) => {
      if (Number.isFinite(Number(data[key]))) safe[key] = Number(data[key]);
    });
    if (typeof data.success === 'boolean') safe.success = data.success;
    return safe;
  }

  function filterPersistedSessionLogs(sessionLogs) {
    return (sessionLogs || []).filter(log => {
      const logType = log?.data?.logType || log?.logType || null;
      return logType !== 'prompt' && logType !== 'rawResponse';
    }).slice(-500).map(log => ({
      timestamp: Number.isFinite(Date.parse(log?.timestamp)) ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
      level: getSafePersistedText(log?.level || 'info', 16),
      message: getSafePersistedText(log?.message || '', 512),
      data: getSafePersistedLogData(log?.data)
    }));
  }

  const SESSION_HISTORY_CAP_PER_MODE = 50;

  function capPersistedSessionHistory(sessionIndex, sessionStorage) {
    const counts = { autopilot: 0, mcp: 0 };
    const removedIds = [];
    const retainedIndex = (sessionIndex || []).filter(entry => {
      const storedSession = entry?.id ? sessionStorage?.[entry.id] : null;
      const mode = storedSession ? storedSession.mode : entry?.mode;
      const bucket = mode === 'mcp-agent' ? 'mcp' : 'autopilot';
      if (counts[bucket] < SESSION_HISTORY_CAP_PER_MODE) {
        counts[bucket]++;
        return true;
      }
      if (entry?.id) {
        removedIds.push(entry.id);
        delete sessionStorage[entry.id];
      }
      return false;
    });
    return { retainedIndex, removedIds };
  }

  function filterAutomationLogsBySession(logs, sessionIds, removeAllSessionLogs = false) {
    const ids = sessionIds instanceof Set ? sessionIds : new Set(sessionIds || []);
    return (Array.isArray(logs) ? logs : []).filter(log => {
      const sessionId = log?.data?.sessionId;
      if (typeof sessionId !== 'string' || !sessionId) return true;
      return !(removeAllSessionLogs || ids.has(sessionId));
    });
  }

  function getPersistedCommandList(sessionData = {}, fallbackTask = '') {
    const commands = Array.isArray(sessionData.commands)
      ? sessionData.commands.filter(command => typeof command === 'string' && command.trim().length > 0)
      : [];

    if (commands.length > 0) {
      return commands.slice(-25);
    }

    if (typeof fallbackTask === 'string' && fallbackTask.trim().length > 0) {
      return [fallbackTask];
    }

    return [];
  }

  function getPersistedTextValue(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return null;
  }

  function normalizePersistedOutcomeValue(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'error') return 'failure';
    return ['success', 'partial', 'failure', 'stopped'].includes(normalized) ? normalized : null;
  }

  function derivePersistedOutcomeFromStatus(status) {
    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (!normalizedStatus) return 'success';
    if (normalizedStatus === 'partial') return 'partial';
    if (normalizedStatus === 'stopped' || normalizedStatus === 'expired') return 'stopped';
    if (normalizedStatus === 'error' || normalizedStatus === 'failed' || normalizedStatus === 'stuck' || normalizedStatus === 'replay_failed') {
      return 'failure';
    }
    return 'success';
  }

  function normalizePersistedOutcomeFields(sessionData = {}, existing = null) {
    const incomingDetails = sessionData.outcomeDetails && typeof sessionData.outcomeDetails === 'object'
      ? sessionData.outcomeDetails
      : {};
    const existingDetails = existing?.outcomeDetails && typeof existing.outcomeDetails === 'object'
      ? existing.outcomeDetails
      : {};
    const status = getPersistedTextValue(sessionData.status, existing?.status) || 'completed';
    const outcome = normalizePersistedOutcomeValue(sessionData.outcome) ||
      normalizePersistedOutcomeValue(incomingDetails.outcome) ||
      normalizePersistedOutcomeValue(existing?.outcome) ||
      normalizePersistedOutcomeValue(existingDetails.outcome) ||
      derivePersistedOutcomeFromStatus(status);
    const summary = getPersistedTextValue(
      sessionData.result,
      incomingDetails.summary,
      existing?.result,
      existingDetails.summary,
      sessionData.completionMessage,
      existing?.completionMessage
    );
    const blocker = getPersistedTextValue(
      sessionData.blocker,
      incomingDetails.blocker,
      existing?.blocker,
      existingDetails.blocker
    );
    const nextStep = getPersistedTextValue(
      sessionData.nextStep,
      incomingDetails.nextStep,
      existing?.nextStep,
      existingDetails.nextStep
    );
    const error = outcome === 'failure'
      ? getPersistedTextValue(
        sessionData.error,
        incomingDetails.error,
        existing?.error,
        existingDetails.error
      )
      : null;
    const completionMessage = getPersistedTextValue(
      sessionData.completionMessage,
      incomingDetails.result,
      existing?.completionMessage,
      existingDetails.result,
      summary,
      error
    );
    const reason = getPersistedTextValue(
      sessionData.reason,
      incomingDetails.reason,
      existingDetails.reason
    ) || (
      outcome === 'partial' ? 'blocked'
        : outcome === 'failure' ? 'error'
          : outcome === 'stopped' ? 'stopped'
            : 'completed'
    );

    return {
      outcome,
      result: summary || completionMessage || null,
      completionMessage: outcome === 'failure' ? null : (completionMessage || null),
      error,
      blocker,
      nextStep,
      outcomeDetails: {
        outcome,
        reason,
        summary: summary || null,
        blocker: blocker || null,
        nextStep: nextStep || null,
        result: completionMessage || null,
        error: error || null
      }
    };
  }

  function applyPersistedOutcomeFields(target, status, normalized) {
    if (!target || !normalized) return target;
    target.status = status || target.status || 'completed';
    target.outcome = normalized.outcome;
    target.outcomeDetails = normalized.outcomeDetails;
    target.result = normalized.result;
    target.completionMessage = normalized.completionMessage;
    target.error = normalized.error;
    target.blocker = normalized.blocker;
    target.nextStep = normalized.nextStep;
    return target;
  }

  function hydratePersistedSessionRecord(sessionId, sessionData = {}) {
    if (!sessionData || typeof sessionData !== 'object') return null;
    const normalized = normalizePersistedOutcomeFields(sessionData, sessionData);
    return {
      ...sessionData,
      id: sessionData.id || sessionId,
      outcome: normalized.outcome,
      outcomeDetails: normalized.outcomeDetails,
      result: normalized.result,
      completionMessage: normalized.completionMessage,
      error: normalized.error,
      blocker: normalized.blocker,
      nextStep: normalized.nextStep
    };
  }

  function formatPersistedOutcomeLabel(outcome) {
    if (outcome === 'failure') return 'Failure';
    if (!outcome) return 'Unknown';
    return outcome.charAt(0).toUpperCase() + outcome.slice(1);
  }

  function buildPersistedSessionMetadata(sessionId, sessionData = {}, existing = null) {
    const commands = getPersistedCommandList(sessionData, sessionData.task || existing?.lastTask || existing?.task || '');
    const lastTask = sessionData.task || existing?.lastTask || commands[commands.length - 1] || existing?.task || 'Unknown task';
    const lastCommandAt = sessionData.lastCommandAt || existing?.lastCommandAt || sessionData.startTime || Date.now();

    return {
      conversationId: sessionData.conversationId || existing?.conversationId || null,
      uiSurface: sessionData.uiSurface || existing?.uiSurface || 'unknown',
      historySessionId: sessionData.historySessionId || existing?.historySessionId || sessionId,
      commandCount: sessionData.commandCount || existing?.commandCount || commands.length || 1,
      commands,
      lastTask,
      lastCommandAt
    };
  }

  function getSafeReplayValue(value, depth = 0) {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return getSafePersistedText(value, 2048);
    if (depth >= 6) return null;
    if (Array.isArray(value)) {
      return value.slice(0, 100).map(item => getSafeReplayValue(item, depth + 1));
    }
    if (!value || typeof value !== 'object') return null;
    const safe = {};
    Object.keys(value).slice(0, 32).forEach((key) => {
      if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(key)) return;
      safe[key] = getSafeReplayValue(value[key], depth + 1);
    });
    return safe;
  }

  function getSafeReplayUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
      return getSafePersistedText(value, 4096);
    } catch (_error) {
      return null;
    }
  }

  function getSafeReplayCounts(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      total: Math.max(0, Math.min(100, Number(input.total) || 0)),
      executable: Math.max(0, Math.min(100, Number(input.executable) || 0)),
      approvalRequired: Math.max(0, Math.min(100, Number(input.approvalRequired) || 0)),
      blocked: Math.max(0, Math.min(100, Number(input.blocked) || 0))
    };
  }

  function getSafeReplayStep(step, index) {
    if (!step || typeof step !== 'object') return null;
    const target = step.target && typeof step.target === 'object' ? step.target : {};
    const replay = step.replay && typeof step.replay === 'object' ? step.replay : {};
    const capability = step.capability && typeof step.capability === 'object'
      ? {
          capabilityId: getSafePersistedText(step.capability.capabilityId || '', 128) || null,
          sideEffectClass: getSafePersistedText(step.capability.sideEffectClass || '', 32) || null,
          service: getSafePersistedText(step.capability.service || '', 96) || null,
          tier: getSafePersistedText(step.capability.tier || '', 32) || null
        }
      : null;
    return {
      id: getSafePersistedText(step.id || `step-${index + 1}`, 128),
      index: Number.isFinite(Number(step.index)) ? Number(step.index) : index,
      timestamp: Number.isFinite(Number(step.timestamp)) ? Number(step.timestamp) : null,
      tool: getSafePersistedText(step.tool || '', 128),
      route: getSafePersistedText(step.route || 'legacy', 64),
      arguments: getSafeReplayValue(step.arguments || {}, 0),
      result: getSafeReplayValue(step.result || {}, 0),
      success: step.success !== false,
      target: {
        logicalTab: getSafePersistedText(target.logicalTab || 'primary', 128),
        url: getSafeReplayUrl(target.url),
        origin: getSafeSnapshotOrigin(target.origin || target.url) || null,
        redacted: target.redacted === true
      },
      ...(step.inputState === 'redacted' ? { inputState: 'redacted' } : {}),
      ...(capability ? { capability } : {}),
      replay: {
        risk: getSafePersistedText(replay.risk || 'inspect-only', 32),
        availability: getSafePersistedText(replay.availability || 'unsupported', 32),
        reason: replay.reason == null ? null : getSafePersistedText(replay.reason, 256)
      }
    };
  }

  function cloneReplayRecordForPersistence(replay) {
    if (!replay || typeof replay !== 'object' || !replay.manifest || typeof replay.manifest !== 'object') {
      return null;
    }
    const manifest = replay.manifest;
    const source = manifest.source && typeof manifest.source === 'object' ? manifest.source : {};
    const outcome = manifest.outcome && typeof manifest.outcome === 'object' ? manifest.outcome : {};
    const steps = (Array.isArray(manifest.steps) ? manifest.steps : [])
      .slice(0, 100)
      .map(getSafeReplayStep)
      .filter(Boolean);
    const tabs = (Array.isArray(manifest.tabs) ? manifest.tabs : []).slice(0, 32).map((tab, index) => ({
      id: getSafePersistedText(tab?.id || `tab-${index + 1}`, 128),
      order: Number.isFinite(Number(tab?.order)) ? Number(tab.order) : index,
      startUrl: getSafeReplayUrl(tab?.startUrl),
      startOrigin: getSafeSnapshotOrigin(tab?.startOrigin || tab?.startUrl) || null,
      startUrlState: getSafePersistedText(tab?.startUrlState || 'missing', 16)
    }));
    return {
      version: getSafePersistedText(replay.version || '1.0', 16),
      integrity: getSafePersistedText(replay.integrity || 'pending', 16),
      provenance: getSafePersistedText(replay.provenance || 'capture', 32),
      manifest: {
        kind: getSafePersistedText(manifest.kind || '', 64),
        version: Number.isFinite(Number(manifest.version)) ? Number(manifest.version) : 1,
        provenance: getSafePersistedText(manifest.provenance || replay.provenance || 'capture', 32),
        sessionId: getSafePersistedText(manifest.sessionId || '', 128),
        task: getSafePersistedText(manifest.task || '', 2000),
        recordedAt: Number.isFinite(Number(manifest.recordedAt)) ? Number(manifest.recordedAt) : Date.now(),
        source: {
          mode: getSafePersistedText(source.mode || 'mcp-agent', 32),
          client: source.client == null ? null : getSafePersistedText(source.client, 96)
        },
        startUrl: getSafeReplayUrl(manifest.startUrl),
        startOrigin: getSafeSnapshotOrigin(manifest.startOrigin || manifest.startUrl) || null,
        startUrlState: getSafePersistedText(manifest.startUrlState || 'missing', 16),
        tabs,
        outcome: {
          status: getSafePersistedText(outcome.status || 'unknown', 32),
          outcome: outcome.outcome == null ? null : getSafePersistedText(outcome.outcome, 24),
          reason: outcome.reason == null ? null : getSafePersistedText(outcome.reason, 1000)
        },
        steps
      },
      manifestHash: replay.manifestHash == null ? null : getSafePersistedText(replay.manifestHash, 256),
      receipt: getSafeReplayValue(replay.receipt, 0),
      receiptCid: replay.receiptCid == null ? null : getSafePersistedText(replay.receiptCid, 256),
      signerKid: replay.signerKid == null ? null : getSafePersistedText(replay.signerKid, 256),
      counts: getSafeReplayCounts(replay.counts),
      error: replay.error == null ? null : getSafePersistedText(replay.error, 512)
    };
  }

  // Persisted tail of the in-memory log ring. Large enough that a short delegated run
  // (register, open_tab, navigate, read, result: ~40-80 lines) survives a service-worker
  // restart or an extension reload and is still readable through get_logs.
  // var: this file guards against re-injection but must tolerate re-evaluation.
  var AUTOMATION_LOGS_PERSISTED_TAIL = 400;

  class AutomationLogger {
    constructor() {
      this.logs = [];
      this.maxLogs = 5000;
      this.logLevel = 'debug';
      this.maxSessionLogs = 1000;
      this.storageMode = 'full';
      this.actionRecords = [];
      this._persistTimer = null;
      // Session history and MCP-retention both mutate the same three storage
      // keys. Keep every read-modify-write cycle on one chain so simultaneous
      // MCP closes cannot replace each other's saves.
      this._sessionMutationLock = Promise.resolve();
    }

    _withSessionMutationLock(fn) {
      const next = this._sessionMutationLock.then(fn, fn);
      this._sessionMutationLock = next.catch(() => {});
      return next;
    }

    withSessionMutationLock(fn) {
      if (typeof fn !== 'function') return Promise.resolve(undefined);
      return this._withSessionMutationLock(fn);
    }

    _removeInMemorySessionArtifacts(sessionIds, removeAllSessionArtifacts = false) {
      const ids = sessionIds instanceof Set ? sessionIds : new Set(sessionIds || []);
      const shouldRemove = sessionId => (
        typeof sessionId === 'string' &&
        sessionId.length > 0 &&
        (removeAllSessionArtifacts || ids.has(sessionId))
      );

      this.logs = (this.logs || []).filter(log => !shouldRemove(log?.data?.sessionId));
      this.actionRecords = (this.actionRecords || []).filter(record => !shouldRemove(record?.sessionId));

      if (removeAllSessionArtifacts) {
        this._domSnapshots = {};
      } else if (this._domSnapshots) {
        ids.forEach(sessionId => delete this._domSnapshots[sessionId]);
      }
    }

    log(level, message, data = null) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data
      };

      this.logs.push(entry);

      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }

      const consoleMethod = level === 'error' ? 'error' :
                           level === 'warn' ? 'warn' :
                           'log';
      console[consoleMethod](`[FSB ${level.toUpperCase()}]`, message, data || '');

      // PERF: Debounce persistLogs to batch writes every 2 seconds
      if (!this._persistTimer) {
        this._persistTimer = setTimeout(() => {
          this.persistLogs();
          this._persistTimer = null;
        }, 2000);
      }
    }

    error(message, data) { this.log('error', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    info(message, data) { this.log('info', message, data); }
    debug(message, data) { this.log('debug', message, data); }

    logSessionStart(sessionId, task, tabId) {
      this.info('Automation session started', {
        sessionId, task, tabId,
        startTime: new Date().toISOString()
      });
    }

    logIteration(sessionId, iterationCount, domHash, stuckCounter) {
      this.debug(`Iteration ${iterationCount}`, {
        sessionId, iterationCount, domHash, stuckCounter,
        isStuck: stuckCounter >= 3
      });
    }

    logAction(sessionId, action, result) {
      const level = result?.success ? 'info' : 'warn';
      this.log(level, `Action ${action.tool} ${result?.success ? 'succeeded' : 'failed'}`, {
        sessionId, action, result,
        timestamp: new Date().toISOString()
      });
    }

    logAIResponse(sessionId, reasoning, actions, taskComplete) {
      this.info('AI response received', {
        sessionId,
        actionCount: actions?.length || 0,
        actions: actions?.map(a => `${a.tool}(${JSON.stringify(a.params)})`),
        taskComplete
      });
    }

    logStuckDetection(sessionId, stuckCounter, lastActions) {
      this.warn('Automation may be stuck', {
        sessionId, stuckCounter,
        lastActions: lastActions.slice(-5).map(a => ({
          tool: a.tool, success: a.result?.success, error: a.result?.error
        }))
      });
    }

    logSessionEnd(sessionId, status, totalActions, duration) {
      this.info('Automation session ended', {
        sessionId, status, totalActions,
        duration: `${duration}ms`,
        durationReadable: this.formatDuration(duration)
      });
    }

    logFollowUpCommand(sessionId, task, commandCount) {
      this.info('Follow-up command in conversation', {
        sessionId,
        task,
        commandCount,
        timestamp: new Date().toISOString()
      });
    }

    logPrompt(sessionId, systemPrompt, userPrompt, iteration) {
      this.debug('AI Prompt', {
        sessionId, iteration, logType: 'prompt',
        systemPrompt: systemPrompt ? systemPrompt.substring(0, 5000) : '',
        userPrompt: userPrompt ? userPrompt.substring(0, 10000) : '',
        systemPromptLength: systemPrompt?.length || 0,
        userPromptLength: userPrompt?.length || 0
      });
    }

    logRawResponse(sessionId, rawResponse, parseSuccess, iteration = null) {
      this.debug('AI Raw Response', {
        sessionId, iteration, logType: 'rawResponse',
        rawResponse: rawResponse ? rawResponse.substring(0, 10000) : '',
        rawResponseLength: rawResponse?.length || 0,
        parseSuccess,
        truncated: (rawResponse?.length || 0) > 10000
      });
    }

    logReasoning(sessionId, reasoning, iteration = null) {
      this.info('AI Reasoning', {
        sessionId, iteration, logType: 'reasoning',
        situationAnalysis: reasoning?.situationAnalysis || '',
        goalAssessment: reasoning?.goalAssessment || '',
        reasoning: reasoning?.reasoning || '',
        confidence: reasoning?.confidence || 'unknown'
      });
    }

    logDOMState(sessionId, domState, iteration) {
      const elements = domState?.elements || [];

      // Handle delta payloads where elements array is empty but _totalElements tracks the real count
      let elementCount = elements.length;
      let deltaInfo = null;
      if (domState?._isDelta && domState?.type === 'delta') {
        elementCount = domState._totalElements || 0;
        const added = domState.changes?.added?.length || 0;
        const removed = domState.changes?.removed?.length || 0;
        const modified = domState.changes?.modified?.length || 0;
        deltaInfo = `delta: +${added}/-${removed}/~${modified}`;
      }

      const elementSummary = elements.slice(0, 50).map(el => ({
        type: el.type, id: el.id || '',
        text: el.text ? el.text.substring(0, 50) : '',
        selector: el.selectors?.[0] || ''
      }));

      this.debug(`DOM State: ${elementCount} elements${deltaInfo ? ` (${deltaInfo})` : ''}`, {
        sessionId, iteration, logType: 'domState',
        url: domState?.url || '', title: domState?.title || '',
        elementCount,
        isDelta: !!domState?._isDelta,
        deltaInfo,
        elementSummary,
        pageState: domState?.pageContext?.pageState || null,
        pageTypes: domState?.pageContext?.pageTypes || null
      });

      // Store full DOM snapshot separately for scrape data
      this._storeDOMSnapshot(sessionId, iteration, domState);
    }

    _storeDOMSnapshot(sessionId, iteration, domState) {
      if (!domState || !sessionId) return;

      // Skip delta payloads -- they don't contain full element arrays
      if (domState._isDelta && domState.type === 'delta') return;

      const elements = domState.elements || [];
      if (elements.length === 0) return;

      const url = domState.url || '';

      // Initialize in-memory snapshot accumulator
      if (!this._domSnapshots) this._domSnapshots = {};
      if (!this._domSnapshots[sessionId]) this._domSnapshots[sessionId] = [];

      // Deduplicate by URL: only store one snapshot per unique URL per session
      const existingIndex = this._domSnapshots[sessionId].findIndex(s => s.url === url);
      if (existingIndex !== -1) {
        // Replace with newer snapshot for same URL
        this._domSnapshots[sessionId].splice(existingIndex, 1);
      }

      // Clean elements: strip truly useless fields, cap text length
      const cleanedElements = elements.map(el => {
        const cleaned = { ...el };
        // Remove fields useless for scraping
        delete cleaned.visualProperties;
        delete cleaned.isNew;
        delete cleaned.cluster;
        // Cap text to 500 chars (up from 50 in truncated logs, but not unlimited)
        if (cleaned.text && cleaned.text.length > 500) {
          cleaned.text = cleaned.text.substring(0, 500);
        }
        return cleaned;
      });

      const snapshot = {
        url,
        title: domState.title || '',
        timestamp: Date.now(),
        iteration,
        elementCount: cleanedElements.length,
        elements: cleanedElements,
        htmlContext: domState.htmlContext || null,
        pageContext: domState.pageContext || null,
        scrollPosition: domState.scrollPosition || null,
        viewport: domState.viewport || null
      };

      this._domSnapshots[sessionId].push(snapshot);

      // Cap snapshots per session to prevent unbounded memory growth
      const MAX_SNAPSHOTS_PER_SESSION = 30;
      if (this._domSnapshots[sessionId].length > MAX_SNAPSHOTS_PER_SESSION) {
        this._domSnapshots[sessionId].shift(); // Drop oldest
      }
    }

    async getDOMSnapshots(sessionId) {
      // First check in-memory accumulator
      if (this._domSnapshots && this._domSnapshots[sessionId]) {
        return this._domSnapshots[sessionId];
      }
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return [];
      // Then ask the fixed trusted feature bridge.
      try {
        const result = await trustedLoadAutomationDOMSnapshots(sessionId);
        return result && Array.isArray(result.snapshots) ? result.snapshots : [];
      } catch (error) {
        if (chrome.runtime?.id) {
          console.error('[FSB Logger] Failed to load DOM snapshots:', error);
        }
        return [];
      }
    }

    exportDOMSnapshots(sessionId, snapshots) {
      if (!snapshots || snapshots.length === 0) return null;
      return {
        version: '1.0',
        sessionId,
        exportedAt: new Date().toISOString(),
        pageCount: snapshots.length,
        pages: snapshots.map(snap => ({
          url: snap.url,
          title: snap.title,
          capturedAt: new Date(snap.timestamp).toISOString(),
          iteration: snap.iteration,
          elementCount: snap.elementCount,
          elements: snap.elements,
          htmlContext: snap.htmlContext,
          pageContext: snap.pageContext,
          scrollPosition: snap.scrollPosition,
          viewport: snap.viewport
        }))
      };
    }

    logContentMessage(sessionId, direction, messageType, payload = null, result = null) {
      this.debug('Content Script Message', {
        sessionId, logType: 'contentMessage',
        direction, messageType,
        success: result?.success
      });
    }

    logTokenUsage(sessionId, model, inputTokens, outputTokens, source, iteration = null) {
      this.info('Token Usage', {
        sessionId, iteration, logType: 'tokenUsage',
        model: model || 'unknown',
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        totalTokens: (inputTokens || 0) + (outputTokens || 0)
      });
    }

    logTiming(sessionId, category, operation, durationMs, details = {}) {
      this.debug('Timing', {
        sessionId, logType: 'timing',
        category, operation, durationMs, ...details
      });
    }

    logComm(sessionId, direction, type, success, details = {}) {
      const level = success ? 'debug' : 'warn';
      this.log(level, 'Communication', {
        sessionId, logType: 'comm',
        direction, type, success, ...details
      });
    }

    logRecovery(sessionId, issue, action, result, details = {}) {
      const level = result === 'success' ? 'info' : 'warn';
      this.log(level, 'Recovery', {
        sessionId, logType: 'recovery',
        issue, action, result, ...details
      });
    }

    logNavigation(sessionId, type, from, to, details = {}) {
      this.info('Navigation', {
        sessionId, logType: 'navigation', type,
        from: from ? from.substring(0, 200) : '',
        to: to ? to.substring(0, 200) : '',
        ...details
      });
    }

    logDOMOperation(sessionId, operation, metrics = {}, details = {}) {
      this.debug('DOM Operation', {
        sessionId, logType: 'domOperation',
        operation, ...metrics, ...details
      });
    }

    logActionExecution(sessionId, tool, phase, details = {}) {
      const level = phase === 'complete' && details.success === false ? 'warn' : 'debug';
      this.log(level, 'Action Execution', {
        sessionId, logType: 'actionExec',
        tool, phase, ...details
      });
    }

    logActionRecord(record) {
      if (!record || !record.tool || !record.timestamp) {
        this.warn('Invalid action record', { record });
        return;
      }
      const level = (!record.success || !record.elementFound) ? 'warn' : 'info';
      this.log(level, 'Action Record', { ...record, logType: 'actionRecord' });
      this.actionRecords.push(record);
      if (this.actionRecords.length > 500) {
        this.actionRecords = this.actionRecords.slice(-250);
      }
    }

    getSessionActionRecords(sessionId) {
      return this.actionRecords.filter(r => r.sessionId === sessionId);
    }

    async getReplayData(sessionId) {
      const session = await this.loadSession(sessionId);
      if (!session) return null;
      let prepared = null;
      if (globalThis.FsbLatticeReplay && typeof globalThis.FsbLatticeReplay.prepareReplay === 'function') {
        try {
          prepared = await globalThis.FsbLatticeReplay.prepareReplay(sessionId);
        } catch (_e) {
          // A temporarily unavailable offscreen host must not make persisted
          // history disappear. Fall back to the stored manifest/history below.
        }
      }
      let replayRecord = prepared?.replay || session.replay || null;
      if (!replayRecord && globalThis.FsbLatticeReplay &&
          typeof globalThis.FsbLatticeReplay.createLegacyReplayRecord === 'function') {
        replayRecord = globalThis.FsbLatticeReplay.createLegacyReplayRecord(session);
      }
      const manifestSteps = replayRecord?.manifest?.steps;
      const steps = Array.isArray(manifestSteps)
        ? manifestSteps
        : (session.actionHistory || []).map((record, index) => ({
          id: 'legacy-step-' + String(index + 1),
          index,
          timestamp: record.timestamp,
          tool: record.tool,
          arguments: record.params || {},
          result: record.result || {},
          success: record.result?.success !== false,
          replay: { risk: 'write', availability: 'approval-once', reason: 'Imported legacy action' }
        }));
      return {
        version: replayRecord?.version || '1.0', id: sessionId,
        metadata: {
          task: session.task, startTime: session.startTime,
          endTime: session.endTime, status: session.status,
          actionCount: steps.length,
          integrity: replayRecord?.integrity || 'legacy',
          provenance: replayRecord?.provenance || 'legacy-import',
          manifestHash: replayRecord?.manifestHash || null
        },
        steps: steps.map((record, index) => ({
          stepNumber: index + 1, timestamp: record.timestamp,
          action: { tool: record.tool, params: record.arguments || {} },
          targeting: {
            url: record.target?.url || null,
            origin: record.target?.origin || null,
            logicalTab: record.target?.logicalTab || 'primary'
          },
          result: {
            success: record.success !== false,
            error: record.result?.error || null,
            recorded: record.result || {}
          },
          route: record.route || 'legacy',
          capability: record.capability || null,
          replay: record.replay || null
        })),
        summary: {
          totalSteps: steps.length,
          successfulSteps: steps.filter(r => r.success !== false).length,
          failedSteps: steps.filter(r => r.success === false).length,
          executableSteps: replayRecord?.counts?.executable ?? steps.length,
          approvalRequiredSteps: replayRecord?.counts?.approvalRequired ?? 0,
          blockedSteps: replayRecord?.counts?.blocked ?? 0
        }
      };
    }

    async exportHumanReadable(sessionId) {
      const session = await this.loadSession(sessionId);
      if (!session) return 'Session not found.';
      const replay = await this.getReplayData(sessionId);
      const outcomeLabel = formatPersistedOutcomeLabel(session.outcome);
      const lines = [];
      lines.push('=' .repeat(80));
      lines.push('FSB AUTOMATION SESSION REPORT');
      lines.push('='.repeat(80));
      lines.push(`Session ID: ${session.id}`);
      lines.push(`Task: ${session.task}`);
      lines.push(`Status: ${session.status}`);
      lines.push(`Outcome: ${outcomeLabel}`);
      if (session.outcomeDetails?.summary) lines.push(`Summary: ${session.outcomeDetails.summary}`);
      if (session.outcomeDetails?.blocker) lines.push(`Blocker: ${session.outcomeDetails.blocker}`);
      if (session.outcomeDetails?.nextStep) lines.push(`Next step: ${session.outcomeDetails.nextStep}`);
      if (session.error) lines.push(`Error: ${session.error}`);
      lines.push(`Steps: ${replay?.summary?.successfulSteps || 0}/${replay?.summary?.totalSteps || 0} successful`);
      lines.push('');
      (replay?.steps || []).forEach(step => {
        const status = step.result.success ? '[OK]' : '[FAILED]';
        lines.push(`${status} Step ${step.stepNumber}: ${step.action.tool}`);
        lines.push(`    Selector: ${step.targeting.selectorUsed || step.targeting.selectorTried || 'N/A'}`);
      });
      return lines.join('\n');
    }

    logAPI(sessionId, provider, operation, details = {}) {
      this.debug('API', {
        sessionId, logType: 'api', provider, operation, ...details
      });
    }

    logServiceWorker(event, details = {}) {
      this.debug('Service Worker', {
        logType: 'serviceWorker', event, ...details
      });
    }

    logInit(component, status, details = {}) {
      const level = status === 'failed' ? 'error' : 'info';
      this.log(level, 'Init', {
        logType: 'init', component, status, ...details
      });
    }

    logQueue(sessionId, operation, details = {}) {
      this.debug('Queue', {
        sessionId, logType: 'queue', operation, ...details
      });
    }

    logCache(sessionId, operation, key, details = {}) {
      this.debug('Cache', {
        sessionId, logType: 'cache', operation,
        key: key ? key.substring(0, 100) : '', ...details
      });
    }

    logValidation(sessionId, type, valid, details = {}) {
      const level = valid ? 'debug' : 'warn';
      this.log(level, 'Validation', {
        sessionId, logType: 'validation', type, valid, ...details
      });
    }

    formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
      return `${seconds}s`;
    }

    getRecentLogs(count = 50) { return this.logs.slice(-count); }
    getSessionLogs(sessionId) { return this.logs.filter(log => log.data?.sessionId === sessionId); }
    clearLogs() {
      this.logs = [];
      // Cancel any pending debounced write and persist immediately
      if (this._persistTimer) {
        clearTimeout(this._persistTimer);
        this._persistTimer = null;
      }
      this.persistLogs();
    }

    // Flush any pending debounced log writes (call at session end)
    flush() {
      if (this._persistTimer) {
        clearTimeout(this._persistTimer);
        this._persistTimer = null;
        this.persistLogs();
      }
    }

    persistLogs() {
      return this.withSessionMutationLock(() => this._persistLogsUnlocked());
    }

    async _persistLogsUnlocked() {
      // Guard against invalidated extension context (service worker killed mid-timer)
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
      try {
        const recentLogs = filterPersistedSessionLogs(this.logs)
          .slice(-AUTOMATION_LOGS_PERSISTED_TAIL);
        const result = await trustedReplaceAutomationLogs(recentLogs);
        if (!result || result.ok !== true) throw new Error('Trusted log persistence failed');
      } catch (error) {
        // Only log if context is still valid (avoid noisy errors during shutdown)
        if (chrome.runtime?.id) {
          console.error('Failed to persist logs:', error);
        }
      }
    }

    async loadLogs() {
      // Guard against invalidated extension context (service worker killed or extension reloaded)
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
      try {
        const result = await trustedLoadAutomationLogs();
        const persisted = result && Array.isArray(result.logs) ? result.logs : [];
        if (persisted.length === 0) return;
        // Merge, never replace: a fresh service worker has already logged its own
        // boot entries, and the previous worker's tail is what explains the run
        // that happened just before a restart or reload.
        const seen = new Set(this.logs.map((entry) => (entry && entry.timestamp) + '|' + (entry && entry.message)));
        const older = persisted.filter((entry) => entry && !seen.has(entry.timestamp + '|' + entry.message));
        this.logs = older.concat(this.logs).slice(-this.maxLogs);
      } catch (error) {
        // Only log if context is still valid (avoid noisy errors during shutdown)
        if (chrome.runtime?.id) {
          console.error('Failed to load logs:', error);
        }
      }
    }

    exportLogs() {
      const logsJson = JSON.stringify(this.logs, null, 2);
      const blob = new Blob([logsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return { url, filename: `fsb-automation-logs-${timestamp}.json` };
    }

    generateReport(sessionId = null) {
      const relevantLogs = sessionId ? this.getSessionLogs(sessionId) : this.logs;
      return {
        totalLogs: relevantLogs.length,
        errors: relevantLogs.filter(l => l.level === 'error').length,
        warnings: relevantLogs.filter(l => l.level === 'warn').length
      };
    }

    saveSession(sessionId, sessionData = {}) {
      return this.withSessionMutationLock(() => this._saveSessionUnlocked(sessionId, sessionData));
    }

    async _saveSessionUnlocked(sessionId, sessionData = {}) {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
      try {
        const sessionLogs = this.getSessionLogs(sessionId);
        const persistedLogs = filterPersistedSessionLogs(sessionLogs);
        if (sessionLogs.length === 0 && persistedLogs.length === 0) return false;

        const loaded = await trustedLoadAutomationSession(sessionId);
        let savedSession = loaded && loaded.session
          ? hydratePersistedSessionRecord(sessionId, loaded.session)
          : null;

        if (savedSession) {
          // APPEND MODE: Update existing session entry
          const existing = savedSession;
          const metadata = buildPersistedSessionMetadata(sessionId, sessionData, existing);
          const normalizedOutcome = normalizePersistedOutcomeFields(sessionData, existing);
          // Merge logs: add only new logs (those with timestamps after existing endTime)
          const newLogs = persistedLogs.filter(log => Date.parse(log.timestamp) > (existing.endTime || 0));
          existing.logs = filterPersistedSessionLogs(existing.logs || []);
          if (newLogs.length > 0) {
            existing.logs = filterPersistedSessionLogs(existing.logs.concat(newLogs));
          }
          existing.endTime = Date.now();
          existing.actionCount = sessionData.actionHistory?.length || existing.actionCount;
          existing.iterationCount = sessionData.iterationCount || existing.iterationCount;
          existing.conversationId = metadata.conversationId;
          existing.uiSurface = metadata.uiSurface;
          existing.historySessionId = metadata.historySessionId;
          existing.commandCount = metadata.commandCount;
          existing.commands = metadata.commands;
          existing.lastTask = metadata.lastTask;
          existing.lastCommandAt = metadata.lastCommandAt;
          existing.totalCost = sessionData.totalCost || existing.totalCost || 0;
          existing.totalInputTokens = sessionData.totalInputTokens || existing.totalInputTokens || 0;
          existing.totalOutputTokens = sessionData.totalOutputTokens || existing.totalOutputTokens || 0;
          // Quick 260707-7id: session source discriminator + MCP client label
          existing.mode = sessionData.mode || existing.mode || 'autopilot';
          existing.mcpClient = sessionData.mcpClient || existing.mcpClient || null;
          existing.taskRunId = sessionData.taskRunId || existing.taskRunId || sessionId;
          existing.tabIds = Array.isArray(sessionData.tabIds)
            ? sessionData.tabIds.slice()
            : (Array.isArray(existing.tabIds) ? existing.tabIds : []);
          existing.tabCount = Number.isFinite(sessionData.tabCount)
            ? sessionData.tabCount
            : (Number.isFinite(existing.tabCount) ? existing.tabCount : existing.tabIds.length);
          applyPersistedOutcomeFields(existing, sessionData.status || existing.status, normalizedOutcome);
          // Update task to show the latest command
          if (metadata.commands.length > 1) {
            existing.task = metadata.commands.map((cmd, i) => `[${i + 1}] ${cmd}`).join(' | ');
          } else if (metadata.lastTask) {
            existing.task = metadata.lastTask;
          }
          // Persist actionHistory for session replay (successful actions only, capped at 100)
          if (sessionData.actionHistory) {
            existing.actionHistory = (sessionData.actionHistory || [])
              .filter(a => a.result?.success)
              .slice(-100)
              .map(a => ({
                tool: getSafePersistedText(a.tool || '', 64),
                result: { success: true },
                timestamp: Number.isFinite(Number(a.timestamp)) ? Number(a.timestamp) : Date.now(),
                logicalTab: getSafePersistedText(a.logicalTab || 'primary', 128)
              }));
          }
          if (sessionData.replay) {
            existing.replay = cloneReplayRecordForPersistence(sessionData.replay) || existing.replay || null;
          }
          savedSession = existing;
        } else {
          // NEW MODE: Create session entry
          const metadata = buildPersistedSessionMetadata(sessionId, sessionData);
          const normalizedOutcome = normalizePersistedOutcomeFields(sessionData);
          savedSession = {
            id: sessionId,
            task: metadata.commands.length > 1
              ? metadata.commands.map((cmd, i) => `[${i + 1}] ${cmd}`).join(' | ')
              : (metadata.lastTask || 'Unknown task'),
            startTime: sessionData.startTime || Date.now(),
            endTime: Date.now(),
            status: sessionData.status || 'completed',
            tabId: sessionData.tabId || null,
            tabIds: Array.isArray(sessionData.tabIds) ? sessionData.tabIds.slice() : [],
            tabCount: Number.isFinite(sessionData.tabCount)
              ? sessionData.tabCount
              : (Array.isArray(sessionData.tabIds) ? sessionData.tabIds.length : (sessionData.tabId == null ? 0 : 1)),
            taskRunId: sessionData.taskRunId || sessionId,
            // Quick 260707-7id: session source discriminator + MCP client label
            mode: sessionData.mode || 'autopilot',
            mcpClient: sessionData.mcpClient || null,
            actionCount: sessionData.actionHistory?.length || 0,
            iterationCount: sessionData.iterationCount || 0,
            conversationId: metadata.conversationId,
            uiSurface: metadata.uiSurface,
            historySessionId: metadata.historySessionId,
            commandCount: metadata.commandCount,
            commands: metadata.commands,
            lastTask: metadata.lastTask,
            lastCommandAt: metadata.lastCommandAt,
            totalCost: sessionData.totalCost || 0,
            totalInputTokens: sessionData.totalInputTokens || 0,
            totalOutputTokens: sessionData.totalOutputTokens || 0,
            outcome: normalizedOutcome.outcome,
            outcomeDetails: normalizedOutcome.outcomeDetails,
            result: normalizedOutcome.result,
            completionMessage: normalizedOutcome.completionMessage,
            error: normalizedOutcome.error,
            blocker: normalizedOutcome.blocker,
            nextStep: normalizedOutcome.nextStep,
            logs: filterPersistedSessionLogs(sessionLogs),
            replay: cloneReplayRecordForPersistence(sessionData.replay),
            // Persist actionHistory for session replay (successful actions only, capped at 100)
            actionHistory: (sessionData.actionHistory || [])
              .filter(a => a.result?.success)
              .slice(-100)
              .map(a => ({
                tool: getSafePersistedText(a.tool || '', 64),
                result: { success: true },
                timestamp: Number.isFinite(Number(a.timestamp)) ? Number(a.timestamp) : Date.now(),
                logicalTab: getSafePersistedText(a.logicalTab || 'primary', 128)
              }))
          };
        }

        const snapshots = (this._domSnapshots && this._domSnapshots[sessionId])
          ? this._domSnapshots[sessionId].slice(-30).map(snapshot => ({
            url: getSafeSnapshotOrigin(snapshot?.url),
            timestamp: Number.isFinite(Number(snapshot?.timestamp)) ? Number(snapshot.timestamp) : Date.now(),
            iteration: Number.isFinite(Number(snapshot?.iteration)) ? Number(snapshot.iteration) : 0,
            elementCount: Number.isFinite(Number(snapshot?.elementCount)) ? Number(snapshot.elementCount) : 0
          }))
          : [];
        const snapshotCount = snapshots.length;
        savedSession.domSnapshotCount = snapshotCount;
        const result = await trustedSaveAutomationSession(sessionId, savedSession, snapshots);
        if (!result || result.ok !== true) return false;
        const removedIds = new Set([
          ...(Array.isArray(result.evictedIds) ? result.evictedIds : []),
          ...(Array.isArray(result.prunedIds) ? result.prunedIds : [])
        ]);
        if (removedIds.size > 0) this._removeInMemorySessionArtifacts(removedIds);
        if (this._domSnapshots) delete this._domSnapshots[sessionId];

        console.log(`[FSB Logger] Session ${sessionId} saved with ${savedSession.logs?.length || 0} total logs, ${snapshotCount} DOM snapshots`);
        return true;
      } catch (error) {
        if (chrome.runtime?.id) {
          console.error('[FSB Logger] Failed to save session:', error);
        }
        return false;
      }
    }

    pruneMcpSessions(retentionDays = 30) {
      return this.withSessionMutationLock(() => this._pruneMcpSessionsUnlocked(retentionDays));
    }

    updateSessionOutcome(sessionId, sessionData = {}) {
      return this.withSessionMutationLock(() => this._updateSessionOutcomeUnlocked(sessionId, sessionData));
    }

    async _updateSessionOutcomeUnlocked(sessionId, sessionData = {}) {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id ||
          typeof sessionId !== 'string' || !sessionId) return false;
      try {
        const status = getPersistedTextValue(sessionData.status) || 'completed';
        const normalized = normalizePersistedOutcomeFields(sessionData, { status });
        const result = await trustedUpdateAutomationSessionOutcome(sessionId, {
          status: getSafePersistedText(status, 32),
          outcome: getSafePersistedText(normalized.outcome, 24),
          reason: getSafePersistedText(normalized.outcomeDetails?.reason || '', 64),
          summary: getSafePersistedText(normalized.outcomeDetails?.summary || '', 512),
          result: getSafePersistedText(normalized.result || '', 512),
          completionMessage: getSafePersistedText(normalized.completionMessage || '', 512),
          error: getSafePersistedText(normalized.error || '', 256),
          blocker: getSafePersistedText(normalized.blocker || '', 512),
          nextStep: getSafePersistedText(normalized.nextStep || '', 512)
        });
        return !!result && result.ok === true;
      } catch (error) {
        if (chrome.runtime?.id) {
          console.error('[FSB Logger] Failed to update session outcome:', error);
        }
        return false;
      }
    }

    async _pruneMcpSessionsUnlocked(retentionDays = 30) {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return { removed: 0, ids: [] };
      try {
        let days = typeof retentionDays === 'number' ? retentionDays : parseInt(retentionDays, 10);
        if (!Number.isFinite(days)) days = 30;
        days = Math.min(365, Math.max(1, Math.floor(days)));
        const result = await trustedPruneMcpAutomationSessions(days);
        if (!result || result.ok !== true) return { removed: 0, ids: [] };
        const removedIds = Array.isArray(result.ids) ? result.ids : [];
        if (removedIds.length > 0) this._removeInMemorySessionArtifacts(new Set(removedIds));
        return { removed: Number(result.removed) || removedIds.length, ids: removedIds };
      } catch (error) {
        if (chrome.runtime?.id) {
          console.error('[FSB Logger] Failed to prune MCP sessions:', error);
        }
        return { removed: 0, ids: [] };
      }
    }
    async loadSession(sessionId) {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
      try {
        const result = await trustedLoadAutomationSession(sessionId);
        const session = result && result.session ? result.session : null;
        return hydratePersistedSessionRecord(sessionId, session);
      } catch (error) {
        if (chrome.runtime?.id) {
          console.error('[FSB Logger] Failed to load session:', error);
        }
        return null;
      }
    }

    async listSessions() {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return [];
      try {
        const result = await trustedListAutomationSessions();
        return (result && Array.isArray(result.sessions) ? result.sessions : [])
          .map(entry => hydratePersistedSessionRecord(entry?.id, entry))
          .filter(Boolean);
      } catch (error) {
        return [];
      }
    }

    deleteSession(sessionId) {
      return this.withSessionMutationLock(() => this._deleteSessionUnlocked(sessionId));
    }

    async _deleteSessionUnlocked(sessionId) {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id ||
          typeof sessionId !== 'string' || !sessionId) return false;
      try {
        const result = await trustedDeleteAutomationSession(sessionId);
        if (!result || result.ok !== true) return false;
        this._removeInMemorySessionArtifacts(new Set([sessionId]));
        return true;
      } catch (error) {
        return false;
      }
    }

    async exportSession(sessionId) {
      const session = await this.loadSession(sessionId);
      if (!session) return `Session ${sessionId} not found.`;
      const outcomeLabel = formatPersistedOutcomeLabel(session.outcome);
      const lines = [];
      lines.push('='.repeat(80));
      lines.push('FSB Automation Session Report');
      lines.push('='.repeat(80));
      lines.push(`Session ID: ${session.id}`);
      lines.push(`Task: ${session.task}`);
      lines.push(`Started: ${new Date(session.startTime).toLocaleString()}`);
      lines.push(`Ended: ${new Date(session.endTime).toLocaleString()}`);
      lines.push(`Status: ${session.status.toUpperCase()}`);
      lines.push(`Outcome: ${outcomeLabel.toUpperCase()}`);
      if (session.outcomeDetails?.summary) lines.push(`Summary: ${session.outcomeDetails.summary}`);
      if (session.outcomeDetails?.blocker) lines.push(`Blocker: ${session.outcomeDetails.blocker}`);
      if (session.outcomeDetails?.nextStep) lines.push(`Next Step: ${session.outcomeDetails.nextStep}`);
      if (session.error) lines.push(`Error: ${session.error}`);
      lines.push(`Duration: ${this.formatDuration(session.endTime - session.startTime)}`);
      lines.push(`Total Actions: ${session.actionCount}`);
      lines.push('');
      lines.push('SESSION LOGS');
      lines.push('-'.repeat(80));
      (session.logs || []).forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        lines.push(`[${time}] [${log.level.toUpperCase()}] ${log.message}`);
      });
      lines.push('');
      lines.push(`Report generated: ${new Date().toLocaleString()}`);
      return lines.join('\n');
    }

    clearAllSessions() {
      return this.withSessionMutationLock(() => this._clearAllSessionsUnlocked());
    }

    async _clearAllSessionsUnlocked() {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
      try {
        const result = await trustedClearAutomationSessions();
        if (!result || result.ok !== true) return false;
        this._removeInMemorySessionArtifacts([], true);
        return true;
      } catch (error) {
        return false;
      }
    }
  }

  // Create singleton and attach to globalThis (works in both service workers and content scripts)
  // Do NOT call loadLogs() eagerly -- chrome.storage may not be ready during importScripts init.
  // Logs load lazily on first addLog/getLogs call, or when explicitly triggered.
  globalThis.automationLogger = new AutomationLogger();
}

// Export from globalThis - use var because it can be re-declared safely
var automationLogger = globalThis.automationLogger;
