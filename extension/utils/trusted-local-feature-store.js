// Background-only persistence authority for legacy FSB feature data.
(function(root, factory) {
  'use strict';

  var api = factory();
  root.FsbTrustedLocalFeatureStore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var KEY = Object.freeze({
    DIAGNOSTICS: 'fsb_diagnostics_ring',
    AUTOMATION_LOGS: 'automationLogs',
    SESSION_LOGS: 'fsbSessionLogs',
    SESSION_INDEX: 'fsbSessionIndex',
    DOM_SNAPSHOTS: 'fsbDOMSnapshots',
    ELEMENT_CACHE_SIZE: 'elementCacheSize',
    CAPTCHA_ENABLED: 'captchaSolverEnabled',
    CAPTCHA_API_KEY: 'captchaApiKey'
  });

  var LIMITS = Object.freeze({
    DIAGNOSTIC_ENTRIES: 100,
    DIAGNOSTIC_MESSAGE_CHARS: 512,
    DIAGNOSTIC_RESPONSE_BYTES: 65536,
    AUTOMATION_LOG_ENTRIES: 100,
    AUTOMATION_LOG_BATCH: 100,
    AUTOMATION_MESSAGE_CHARS: 512,
    AUTOMATION_RESPONSE_BYTES: 131072,
    SESSION_COUNT: 50,
    SESSION_LOG_ENTRIES: 500,
    SESSION_ACTION_ENTRIES: 100,
    SESSION_COMMAND_ENTRIES: 25,
    SESSION_RESPONSE_BYTES: 262144,
    DOM_SNAPSHOT_SESSIONS: 20,
    DOM_SNAPSHOTS_PER_SESSION: 30,
    MESSAGE_BYTES: 262144,
    SITEKEY_CHARS: 2048
  });

  var MESSAGE = Object.freeze({
    DIAGNOSTIC_APPEND: 'fsb:diagnostic-append',
    DIAGNOSTIC_GET: 'fsb:diagnostic-get',
    AUTOMATION_LOG_REPLACE: 'fsb:automation-log-replace',
    AUTOMATION_LOG_LOAD: 'fsb:automation-log-load',
    AUTOMATION_SESSION_SAVE: 'fsb:automation-session-save',
    AUTOMATION_SESSION_LOAD: 'fsb:automation-session-load',
    AUTOMATION_SESSION_LIST: 'fsb:automation-session-list',
    AUTOMATION_SESSION_DELETE: 'fsb:automation-session-delete',
    AUTOMATION_SESSION_CLEAR: 'fsb:automation-session-clear',
    AUTOMATION_DOM_SNAPSHOT_LOAD: 'fsb:automation-dom-snapshot-load',
    ELEMENT_CACHE_GET: 'fsb:element-cache-config-get',
    ELEMENT_CACHE_CHANGED: 'fsb:element-cache-config-changed'
  });

  var MESSAGE_ACTIONS = new Set(Object.keys(MESSAGE).map(function(key) {
    return MESSAGE[key];
  }).filter(function(action) {
    return action !== MESSAGE.ELEMENT_CACHE_CHANGED;
  }));

  function byteLength(value) {
    var text = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text || '').length;
    return unescape(encodeURIComponent(text || '')).length;
  }

  function boundedText(value, maxChars) {
    if (value === undefined || value === null) return '';
    return String(value).slice(0, maxChars);
  }

  function redactText(value, maxChars) {
    return boundedText(value, maxChars)
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, '[redacted]')
      .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/gi, '[redacted]')
      .replace(/\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
      .replace(/\bpermission[-_ ]?id\s*[:=]?\s*[A-Za-z0-9_-]+/gi, '[redacted]')
      .replace(/raw\s+(?:remote|provider)\s+error/gi, 'remote failure');
  }

  function safeNumber(value, fallback, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(min, Math.min(max, number));
  }

  function safeTimestamp(value, now) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : now();
  }

  function safeOrigin(value) {
    if (typeof value !== 'string' || value.length > 2048) return undefined;
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
      return parsed.origin;
    } catch (_error) {
      return undefined;
    }
  }

  function safeLengths(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    var output = {};
    Object.keys(value).slice(0, 8).forEach(function(key) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key)) return;
      if (!Number.isFinite(Number(value[key]))) return;
      output[key] = safeNumber(value[key], 0, 0, 100000000);
    });
    return Object.keys(output).length ? output : undefined;
  }

  function safeDiagnosticEntry(entry, now) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    var context = entry.redactedContext && typeof entry.redactedContext === 'object'
      ? entry.redactedContext : {};
    var safeContext = {};
    var origin = safeOrigin(context.origin);
    if (origin) safeContext.origin = origin;
    if (Number.isFinite(Number(context.statusCode))) {
      safeContext.statusCode = safeNumber(context.statusCode, 0, 0, 999);
    }
    if (typeof context.kind === 'string') safeContext.kind = redactText(context.kind, 64);
    var lengths = safeLengths(context.lengths);
    if (lengths) safeContext.lengths = lengths;
    return {
      ts: safeTimestamp(entry.ts, now),
      level: redactText(entry.level || 'warn', 16),
      prefix: redactText(entry.prefix || '', 48),
      category: redactText(entry.category || '', 64),
      message: redactText(entry.message || '', LIMITS.DIAGNOSTIC_MESSAGE_CHARS),
      redactedContext: safeContext
    };
  }

  function safeAutomationData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    var safe = {};
    var textKeys = ['logType', 'provider', 'category', 'action', 'reason', 'sessionId'];
    textKeys.forEach(function(key) {
      if (typeof data[key] === 'string') safe[key] = redactText(data[key], 96);
    });
    var numberKeys = ['statusCode', 'durationMs', 'iterationCount', 'actionCount', 'tabId'];
    numberKeys.forEach(function(key) {
      if (Number.isFinite(Number(data[key]))) safe[key] = safeNumber(data[key], 0, -1, 1000000000);
    });
    if (typeof data.success === 'boolean') safe.success = data.success;
    return safe;
  }

  function safeAutomationLog(log, now) {
    if (!log || typeof log !== 'object' || Array.isArray(log)) return null;
    var parsedTime = Date.parse(log.timestamp);
    return {
      timestamp: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date(now()).toISOString(),
      level: redactText(log.level || 'info', 16),
      message: redactText(log.message || '', LIMITS.AUTOMATION_MESSAGE_CHARS),
      data: safeAutomationData(log.data)
    };
  }

  function safeSessionId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) return null;
    if (value === '__proto__' || value === 'prototype' || value === 'constructor') return null;
    return value;
  }

  function safeStringList(value, count, chars) {
    if (!Array.isArray(value)) return [];
    return value.filter(function(item) {
      return typeof item === 'string';
    }).slice(-count).map(function(item) {
      return redactText(item, chars);
    });
  }

  function safeOutcomeDetails(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return {
      outcome: redactText(value.outcome || '', 24) || null,
      reason: redactText(value.reason || '', 64) || null,
      summary: redactText(value.summary || '', 512) || null,
      blocker: redactText(value.blocker || '', 512) || null,
      nextStep: redactText(value.nextStep || '', 512) || null,
      result: redactText(value.result || '', 512) || null,
      error: redactText(value.error || '', 256) || null
    };
  }

  function safeActionHistory(value, now) {
    if (!Array.isArray(value)) return [];
    return value.slice(-LIMITS.SESSION_ACTION_ENTRIES).map(function(action) {
      if (!action || typeof action !== 'object') return null;
      return {
        tool: redactText(action.tool || '', 64),
        timestamp: safeTimestamp(action.timestamp, now),
        success: action.result && typeof action.result.success === 'boolean'
          ? action.result.success : false
      };
    }).filter(Boolean);
  }

  function safeSession(sessionId, session, now) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    var id = safeSessionId(sessionId || session.id);
    if (!id) return null;
    var logs = Array.isArray(session.logs) ? session.logs : [];
    var safe = {
      id: id,
      task: redactText(session.task || 'Unknown task', 512),
      startTime: safeTimestamp(session.startTime, now),
      endTime: safeTimestamp(session.endTime, now),
      status: redactText(session.status || 'completed', 32),
      tabId: Number.isInteger(session.tabId) && session.tabId > 0 ? session.tabId : null,
      actionCount: safeNumber(session.actionCount, 0, 0, 1000000),
      domSnapshotCount: safeNumber(session.domSnapshotCount, 0, 0, LIMITS.DOM_SNAPSHOTS_PER_SESSION),
      iterationCount: safeNumber(session.iterationCount, 0, 0, 1000000),
      conversationId: typeof session.conversationId === 'string' ? redactText(session.conversationId, 128) : null,
      uiSurface: redactText(session.uiSurface || 'unknown', 32),
      historySessionId: typeof session.historySessionId === 'string' ? redactText(session.historySessionId, 128) : id,
      commandCount: safeNumber(session.commandCount, 0, 0, 1000000),
      commands: safeStringList(session.commands, LIMITS.SESSION_COMMAND_ENTRIES, 512),
      lastTask: redactText(session.lastTask || session.task || '', 512) || null,
      lastCommandAt: safeTimestamp(session.lastCommandAt || session.endTime, now),
      totalCost: safeNumber(session.totalCost, 0, 0, 1000000000),
      totalInputTokens: safeNumber(session.totalInputTokens, 0, 0, 1000000000),
      totalOutputTokens: safeNumber(session.totalOutputTokens, 0, 0, 1000000000),
      outcome: redactText(session.outcome || '', 24) || null,
      outcomeDetails: safeOutcomeDetails(session.outcomeDetails),
      result: redactText(session.result || '', 512) || null,
      completionMessage: redactText(session.completionMessage || '', 512) || null,
      error: redactText(session.error || '', 256) || null,
      blocker: redactText(session.blocker || '', 512) || null,
      nextStep: redactText(session.nextStep || '', 512) || null,
      logs: logs.slice(-LIMITS.SESSION_LOG_ENTRIES).map(function(log) {
        return safeAutomationLog(log, now);
      }).filter(Boolean),
      actionHistory: safeActionHistory(session.actionHistory, now)
    };
    while (safe.logs.length && byteLength(safe) > LIMITS.SESSION_RESPONSE_BYTES) safe.logs.shift();
    if (byteLength(safe) > LIMITS.SESSION_RESPONSE_BYTES) return null;
    return safe;
  }

  function safeIndexEntry(session) {
    return {
      id: session.id,
      task: session.task,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      actionCount: session.actionCount,
      domSnapshotCount: safeNumber(session.domSnapshotCount, 0, 0, LIMITS.DOM_SNAPSHOTS_PER_SESSION),
      totalCost: session.totalCost,
      outcome: session.outcome,
      outcomeDetails: session.outcomeDetails,
      result: session.result,
      completionMessage: session.completionMessage,
      error: session.error,
      blocker: session.blocker,
      nextStep: session.nextStep,
      conversationId: session.conversationId,
      uiSurface: session.uiSurface,
      historySessionId: session.historySessionId,
      commandCount: session.commandCount,
      commands: session.commands,
      lastTask: session.lastTask,
      lastCommandAt: session.lastCommandAt
    };
  }

  function safeSnapshots(value, now) {
    if (!Array.isArray(value)) return [];
    return value.slice(-LIMITS.DOM_SNAPSHOTS_PER_SESSION).map(function(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return null;
      var origin = safeOrigin(snapshot.url);
      return {
        origin: origin || null,
        timestamp: safeTimestamp(snapshot.timestamp, now),
        iteration: safeNumber(snapshot.iteration, 0, 0, 1000000),
        elementCount: safeNumber(snapshot.elementCount, 0, 0, 1000000)
      };
    }).filter(Boolean);
  }

  function hasExactOwnKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) {
      return key === wanted[index];
    });
  }

  function create(options) {
    options = options || {};
    var chromeApi = options.chrome || (typeof chrome !== 'undefined' ? chrome : null);
    var now = typeof options.now === 'function' ? options.now : Date.now;
    if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local) {
      throw new Error('TRUSTED_STORAGE_UNAVAILABLE');
    }
    var localArea = chromeApi.storage.local;
    var writeLane = Promise.resolve();

    function get(keys) {
      return Promise.resolve(localArea.get(keys));
    }

    function set(update) {
      return Promise.resolve(localArea.set(update));
    }

    function remove(keys) {
      return Promise.resolve(localArea.remove(keys));
    }

    function withWrite(work) {
      var result = writeLane.then(work, work);
      writeLane = result.catch(function() {});
      return result;
    }

    async function appendDiagnosticEntry(entry) {
      var safe = safeDiagnosticEntry(entry, now);
      if (!safe) throw new Error('INVALID_DIAGNOSTIC');
      return withWrite(async function() {
        var stored = await get([KEY.DIAGNOSTICS]);
        var entries = Array.isArray(stored[KEY.DIAGNOSTICS]) ? stored[KEY.DIAGNOSTICS] : [];
        entries = entries.map(function(item) { return safeDiagnosticEntry(item, now); }).filter(Boolean);
        entries.push(safe);
        entries = entries.slice(-LIMITS.DIAGNOSTIC_ENTRIES);
        while (entries.length && byteLength({ entries: entries }) > LIMITS.DIAGNOSTIC_RESPONSE_BYTES) entries.shift();
        var update = {};
        update[KEY.DIAGNOSTICS] = entries;
        await set(update);
        return { ok: true };
      });
    }

    async function getDiagnosticEntries(options) {
      var clear = !!(options && options.clear === true);
      var read = async function() {
        var stored = await get([KEY.DIAGNOSTICS]);
        var entries = Array.isArray(stored[KEY.DIAGNOSTICS]) ? stored[KEY.DIAGNOSTICS] : [];
        entries = entries.map(function(item) { return safeDiagnosticEntry(item, now); }).filter(Boolean)
          .slice(-LIMITS.DIAGNOSTIC_ENTRIES);
        while (entries.length && byteLength({ entries: entries }) > LIMITS.DIAGNOSTIC_RESPONSE_BYTES) entries.shift();
        if (clear) {
          var update = {};
          update[KEY.DIAGNOSTICS] = [];
          await set(update);
        }
        var response = { entries: entries };
        if (clear) response.clearedAt = now();
        return response;
      };
      return clear ? withWrite(read) : read();
    }

    async function appendAutomationLogs(logs) {
      var safeLogs = (Array.isArray(logs) ? logs : []).slice(-LIMITS.AUTOMATION_LOG_BATCH)
        .map(function(log) { return safeAutomationLog(log, now); }).filter(Boolean);
      return withWrite(async function() {
        var stored = await get([KEY.AUTOMATION_LOGS]);
        var existing = Array.isArray(stored[KEY.AUTOMATION_LOGS]) ? stored[KEY.AUTOMATION_LOGS] : [];
        var combined = existing.concat(safeLogs).slice(-LIMITS.AUTOMATION_LOG_ENTRIES);
        var update = {};
        update[KEY.AUTOMATION_LOGS] = combined;
        await set(update);
        return { ok: true, count: combined.length };
      });
    }

    async function replaceAutomationLogs(logs) {
      var safeLogs = (Array.isArray(logs) ? logs : []).slice(-LIMITS.AUTOMATION_LOG_ENTRIES)
        .map(function(log) { return safeAutomationLog(log, now); }).filter(Boolean);
      return withWrite(async function() {
        var update = {};
        update[KEY.AUTOMATION_LOGS] = safeLogs;
        await set(update);
        return { ok: true, count: safeLogs.length };
      });
    }

    async function loadAutomationLogs() {
      var stored = await get([KEY.AUTOMATION_LOGS]);
      var logs = Array.isArray(stored[KEY.AUTOMATION_LOGS]) ? stored[KEY.AUTOMATION_LOGS] : [];
      logs = logs.slice(-LIMITS.AUTOMATION_LOG_ENTRIES).map(function(log) {
        return safeAutomationLog(log, now);
      }).filter(Boolean);
      while (logs.length && byteLength({ logs: logs }) > LIMITS.AUTOMATION_RESPONSE_BYTES) logs.shift();
      return { logs: logs };
    }

    async function loadAutomationSession(sessionId) {
      var id = safeSessionId(sessionId);
      if (!id) return { session: null };
      var stored = await get([KEY.SESSION_LOGS]);
      var sessions = stored[KEY.SESSION_LOGS] && typeof stored[KEY.SESSION_LOGS] === 'object'
        ? stored[KEY.SESSION_LOGS] : {};
      return { session: safeSession(id, sessions[id], now) };
    }

    async function saveAutomationSession(sessionId, session, snapshots) {
      var id = safeSessionId(sessionId);
      var safeRecord = safeSession(id, session, now);
      if (!id || !safeRecord) throw new Error('INVALID_SESSION');
      var safeSnapshotList = safeSnapshots(snapshots, now);
      return withWrite(async function() {
        var stored = await get([KEY.SESSION_LOGS, KEY.SESSION_INDEX, KEY.DOM_SNAPSHOTS]);
        var sessions = stored[KEY.SESSION_LOGS] && typeof stored[KEY.SESSION_LOGS] === 'object'
          ? stored[KEY.SESSION_LOGS] : {};
        var index = Array.isArray(stored[KEY.SESSION_INDEX]) ? stored[KEY.SESSION_INDEX] : [];
        var allSnapshots = stored[KEY.DOM_SNAPSHOTS] && typeof stored[KEY.DOM_SNAPSHOTS] === 'object'
          ? stored[KEY.DOM_SNAPSHOTS] : {};

        safeRecord.domSnapshotCount = safeSnapshotList.length;
        sessions[id] = safeRecord;
        index = index.filter(function(entry) { return entry && entry.id !== id; });
        index.unshift(safeIndexEntry(safeRecord));
        index = index.slice(0, LIMITS.SESSION_COUNT);
        var retainedIds = new Set(index.map(function(entry) { return entry.id; }));
        Object.keys(sessions).forEach(function(candidate) {
          if (!retainedIds.has(candidate)) delete sessions[candidate];
        });

        if (safeSnapshotList.length) allSnapshots[id] = safeSnapshotList;
        else delete allSnapshots[id];
        var snapshotIds = Object.keys(allSnapshots);
        snapshotIds.sort(function(a, b) {
          return index.findIndex(function(entry) { return entry.id === a; }) -
            index.findIndex(function(entry) { return entry.id === b; });
        });
        snapshotIds.slice(LIMITS.DOM_SNAPSHOT_SESSIONS).forEach(function(candidate) {
          delete allSnapshots[candidate];
        });

        var update = {};
        update[KEY.SESSION_LOGS] = sessions;
        update[KEY.SESSION_INDEX] = index;
        update[KEY.DOM_SNAPSHOTS] = allSnapshots;
        await set(update);
        return { ok: true };
      });
    }

    async function listAutomationSessions() {
      var stored = await get([KEY.SESSION_INDEX]);
      var entries = Array.isArray(stored[KEY.SESSION_INDEX]) ? stored[KEY.SESSION_INDEX] : [];
      var sessions = entries.slice(0, LIMITS.SESSION_COUNT).map(function(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        var safeRecord = safeSession(entry.id, entry, now);
        return safeRecord ? safeIndexEntry(safeRecord) : null;
      }).filter(Boolean);
      while (sessions.length && byteLength({ sessions: sessions }) > LIMITS.SESSION_RESPONSE_BYTES) {
        sessions.pop();
      }
      return { sessions: sessions };
    }

    async function deleteAutomationSession(sessionId) {
      var id = safeSessionId(sessionId);
      if (!id) return { ok: false };
      return withWrite(async function() {
        var stored = await get([KEY.SESSION_LOGS, KEY.SESSION_INDEX, KEY.DOM_SNAPSHOTS]);
        var sessions = stored[KEY.SESSION_LOGS] && typeof stored[KEY.SESSION_LOGS] === 'object'
          ? stored[KEY.SESSION_LOGS] : {};
        var index = Array.isArray(stored[KEY.SESSION_INDEX]) ? stored[KEY.SESSION_INDEX] : [];
        var snapshots = stored[KEY.DOM_SNAPSHOTS] && typeof stored[KEY.DOM_SNAPSHOTS] === 'object'
          ? stored[KEY.DOM_SNAPSHOTS] : {};
        delete sessions[id];
        delete snapshots[id];
        var update = {};
        update[KEY.SESSION_LOGS] = sessions;
        update[KEY.SESSION_INDEX] = index.filter(function(entry) { return entry && entry.id !== id; });
        update[KEY.DOM_SNAPSHOTS] = snapshots;
        await set(update);
        return { ok: true };
      });
    }

    async function clearAutomationSessions() {
      return withWrite(async function() {
        await remove([KEY.SESSION_LOGS, KEY.SESSION_INDEX, KEY.DOM_SNAPSHOTS]);
        return { ok: true };
      });
    }

    async function loadAutomationDOMSnapshots(sessionId) {
      var id = safeSessionId(sessionId);
      if (!id) return { snapshots: [] };
      var stored = await get([KEY.DOM_SNAPSHOTS]);
      var snapshots = stored[KEY.DOM_SNAPSHOTS] && typeof stored[KEY.DOM_SNAPSHOTS] === 'object'
        ? stored[KEY.DOM_SNAPSHOTS][id] : [];
      return { snapshots: safeSnapshots(snapshots, now) };
    }

    async function getElementCacheConfig() {
      var stored = await get([KEY.ELEMENT_CACHE_SIZE]);
      return { elementCacheSize: safeNumber(stored[KEY.ELEMENT_CACHE_SIZE], 100, 10, 1000) };
    }

    async function getCaptchaSettings() {
      var stored = await get([KEY.CAPTCHA_ENABLED, KEY.CAPTCHA_API_KEY]);
      return {
        enabled: stored[KEY.CAPTCHA_ENABLED] === true,
        apiKey: typeof stored[KEY.CAPTCHA_API_KEY] === 'string'
          ? stored[KEY.CAPTCHA_API_KEY].slice(0, 512) : ''
      };
    }

    function subscribeElementCacheConfig(listener) {
      if (typeof listener !== 'function' || !chromeApi.storage.onChanged ||
          typeof chromeApi.storage.onChanged.addListener !== 'function') return function() {};
      var onChanged = function(changes, areaName) {
        if (areaName !== 'local' || !changes || !changes[KEY.ELEMENT_CACHE_SIZE]) return;
        listener(safeNumber(changes[KEY.ELEMENT_CACHE_SIZE].newValue, 100, 10, 1000));
      };
      chromeApi.storage.onChanged.addListener(onChanged);
      return function() {
        if (typeof chromeApi.storage.onChanged.removeListener === 'function') {
          chromeApi.storage.onChanged.removeListener(onChanged);
        }
      };
    }

    function isAuthorizedSender(sender) {
      return !!(sender && sender.id === chromeApi.runtime.id && sender.tab &&
        Number.isInteger(sender.tab.id) && sender.tab.id > 0);
    }

    function createMessageHandler() {
      return function(message, sender, sendResponse) {
        if (!isAuthorizedSender(sender)) {
          sendResponse({ ok: false, code: 'UNAUTHORIZED_SENDER' });
          return false;
        }
        if (!message || !MESSAGE_ACTIONS.has(message.action)) {
          sendResponse({ ok: false, code: 'UNKNOWN_ACTION' });
          return false;
        }
        if (byteLength(message) > LIMITS.MESSAGE_BYTES) {
          sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
          return false;
        }

        var work;
        switch (message.action) {
          case MESSAGE.DIAGNOSTIC_APPEND:
            if (!hasExactOwnKeys(message, ['action', 'entry']) ||
                !hasExactOwnKeys(message.entry, ['ts', 'level', 'prefix', 'category', 'message', 'redactedContext']) ||
                typeof message.entry.message !== 'string' ||
                message.entry.message.length > LIMITS.DIAGNOSTIC_MESSAGE_CHARS) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = appendDiagnosticEntry(message.entry).then(function() { return { ok: true }; });
            break;
          case MESSAGE.DIAGNOSTIC_GET:
            if (!hasExactOwnKeys(message, ['action', 'clear']) || typeof message.clear !== 'boolean') {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = getDiagnosticEntries({ clear: message.clear }).then(function(result) {
              return Object.assign({ ok: true }, result);
            });
            break;
          case MESSAGE.AUTOMATION_LOG_REPLACE:
            if (!hasExactOwnKeys(message, ['action', 'logs']) || !Array.isArray(message.logs) ||
                message.logs.length > LIMITS.AUTOMATION_LOG_BATCH) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = replaceAutomationLogs(message.logs);
            break;
          case MESSAGE.AUTOMATION_LOG_LOAD:
            if (!hasExactOwnKeys(message, ['action'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = loadAutomationLogs().then(function(result) { return Object.assign({ ok: true }, result); });
            break;
          case MESSAGE.AUTOMATION_SESSION_SAVE:
            if (!hasExactOwnKeys(message, ['action', 'sessionId', 'session', 'snapshots'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = saveAutomationSession(message.sessionId, message.session, message.snapshots);
            break;
          case MESSAGE.AUTOMATION_SESSION_LOAD:
            if (!hasExactOwnKeys(message, ['action', 'sessionId'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = loadAutomationSession(message.sessionId).then(function(result) { return Object.assign({ ok: true }, result); });
            break;
          case MESSAGE.AUTOMATION_SESSION_LIST:
            if (!hasExactOwnKeys(message, ['action'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = listAutomationSessions().then(function(result) { return Object.assign({ ok: true }, result); });
            break;
          case MESSAGE.AUTOMATION_SESSION_DELETE:
            if (!hasExactOwnKeys(message, ['action', 'sessionId'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = deleteAutomationSession(message.sessionId);
            break;
          case MESSAGE.AUTOMATION_SESSION_CLEAR:
            if (!hasExactOwnKeys(message, ['action'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = clearAutomationSessions();
            break;
          case MESSAGE.AUTOMATION_DOM_SNAPSHOT_LOAD:
            if (!hasExactOwnKeys(message, ['action', 'sessionId'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = loadAutomationDOMSnapshots(message.sessionId).then(function(result) { return Object.assign({ ok: true }, result); });
            break;
          case MESSAGE.ELEMENT_CACHE_GET:
            if (!hasExactOwnKeys(message, ['action'])) {
              sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
              return false;
            }
            work = getElementCacheConfig().then(function(result) { return Object.assign({ ok: true }, result); });
            break;
          default:
            sendResponse({ ok: false, code: 'UNKNOWN_ACTION' });
            return false;
        }

        Promise.resolve(work).then(sendResponse, function() {
          sendResponse({ ok: false, code: 'FEATURE_STORAGE_FAILED' });
        });
        return true;
      };
    }

    return Object.freeze({
      ready: function() { return Promise.resolve(true); },
      appendDiagnosticEntry: appendDiagnosticEntry,
      getDiagnosticEntries: getDiagnosticEntries,
      appendAutomationLogs: appendAutomationLogs,
      replaceAutomationLogs: replaceAutomationLogs,
      loadAutomationLogs: loadAutomationLogs,
      saveAutomationSession: saveAutomationSession,
      loadAutomationSession: loadAutomationSession,
      listAutomationSessions: listAutomationSessions,
      deleteAutomationSession: deleteAutomationSession,
      clearAutomationSessions: clearAutomationSessions,
      loadAutomationDOMSnapshots: loadAutomationDOMSnapshots,
      getElementCacheConfig: getElementCacheConfig,
      getCaptchaSettings: getCaptchaSettings,
      subscribeElementCacheConfig: subscribeElementCacheConfig,
      createMessageHandler: createMessageHandler
    });
  }

  return Object.freeze({
    LIMITS: LIMITS,
    MESSAGE: MESSAGE,
    create: create
  });
});
