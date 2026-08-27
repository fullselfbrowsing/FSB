// Guard against re-injection - content scripts can be injected multiple times
// Use globalThis which works in both service workers (self) and content scripts (window)
if (globalThis.__FSB_AUTOMATION_LOGGER_LOADED__) {
  console.log('[FSB] automation-logger.js already loaded, skipping');
} else {
  // Mark as loaded
  globalThis.__FSB_AUTOMATION_LOGGER_LOADED__ = true;
  console.log('[FSB] automation-logger.js loading');

  // Automation Logger for FSB v0.9.90
  // Provides structured logging for debugging automation loops

  const TRUSTED_MESSAGE = Object.freeze({
    LOG_REPLACE: 'fsb:automation-log-replace',
    LOG_LOAD: 'fsb:automation-log-load',
    SESSION_SAVE: 'fsb:automation-session-save',
    SESSION_LOAD: 'fsb:automation-session-load',
    SESSION_LIST: 'fsb:automation-session-list',
    SESSION_DELETE: 'fsb:automation-session-delete',
    SESSION_CLEAR: 'fsb:automation-session-clear',
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

  function trustedReplaceAutomationLogs(logs) {
    const store = getTrustedFeatureStore();
    if (store && typeof store.replaceAutomationLogs === 'function') {
      return Promise.resolve(store.replaceAutomationLogs(logs));
    }
    return sendTrustedFeatureMessage({ action: TRUSTED_MESSAGE.LOG_REPLACE, logs });
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

  function getSafePersistedText(value, maxChars) {
    return String(value === undefined || value === null ? '' : value)
      .slice(0, maxChars)
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, '[redacted]')
      .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/gi, '[redacted]')
      .replace(/\b(?:api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]');
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
    if (normalizedStatus === 'stopped') return 'stopped';
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

  class AutomationLogger {
    constructor() {
      this.logs = [];
      this.maxLogs = 5000;
      this.logLevel = 'debug';
      this.maxSessionLogs = 1000;
      this.storageMode = 'full';
      this.actionRecords = [];
      this._persistTimer = null;
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
      const actionRecords = this.getSessionActionRecords(sessionId);
      return {
        version: '1.0', id: sessionId,
        metadata: {
          task: session.task, startTime: session.startTime,
          endTime: session.endTime, status: session.status,
          actionCount: actionRecords.length
        },
        steps: actionRecords.map((record, index) => ({
          stepNumber: index + 1, timestamp: record.timestamp,
          action: { tool: record.tool, params: record.params || {} },
          targeting: {
            selectorTried: record.selectorTried,
            selectorUsed: record.selectorUsed,
            elementFound: record.elementFound,
            coordinatesUsed: record.coordinatesUsed
          },
          result: {
            success: record.success, error: record.error,
            hadEffect: record.hadEffect, diagnostic: record.diagnostic
          },
          duration: record.duration
        })),
        summary: {
          totalSteps: actionRecords.length,
          successfulSteps: actionRecords.filter(r => r.success).length,
          failedSteps: actionRecords.filter(r => !r.success).length
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

    async persistLogs() {
      // Guard against invalidated extension context (service worker killed mid-timer)
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
      try {
        const recentLogs = filterPersistedSessionLogs(this.logs).slice(-100);
        await trustedReplaceAutomationLogs(recentLogs);
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
        if (result && Array.isArray(result.logs)) this.logs = result.logs;
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

    async saveSession(sessionId, sessionData = {}) {
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
          existing.status = sessionData.status || existing.status;
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
          existing.outcome = normalizedOutcome.outcome;
          existing.outcomeDetails = normalizedOutcome.outcomeDetails;
          existing.result = normalizedOutcome.result;
          existing.completionMessage = normalizedOutcome.completionMessage;
          existing.error = normalizedOutcome.error;
          existing.blocker = normalizedOutcome.blocker;
          existing.nextStep = normalizedOutcome.nextStep;
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
              .map(a => ({ tool: a.tool, result: { success: true }, timestamp: a.timestamp }));
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
            // Persist actionHistory for session replay (successful actions only, capped at 100)
            actionHistory: (sessionData.actionHistory || [])
              .filter(a => a.result?.success)
              .slice(-100)
              .map(a => ({ tool: a.tool, result: { success: true }, timestamp: a.timestamp }))
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

    async deleteSession(sessionId) {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
      try {
        const result = await trustedDeleteAutomationSession(sessionId);
        return !!result && result.ok === true;
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

    async clearAllSessions() {
      // Guard against invalidated extension context
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) return false;
      try {
        const result = await trustedClearAutomationSessions();
        if (!result || result.ok !== true) return false;
        this._domSnapshots = {};
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
