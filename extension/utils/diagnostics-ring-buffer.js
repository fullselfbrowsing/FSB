// utils/diagnostics-ring-buffer.js -- storage-free diagnostic client/ring.
// Durable writes are delegated to the background-owned trusted feature store.
(function() {
  'use strict';

  var STORAGE_KEY = 'fsb_diagnostics_ring';
  var MAX_ENTRIES = 100;
  var DIAGNOSTIC_APPEND = 'fsb:diagnostic-append';
  var DIAGNOSTIC_GET = 'fsb:diagnostic-get';
  var FSB_BRIDGE_SECRET_PATTERN = /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
  var FSB_BRIDGE_SECRET_REPLACEMENT = '[REDACTED_FSB_BRIDGE_SECRET]';
  var _inMemoryRing = [];

  function _redactBridgeSecrets(value) {
    var text = String(value === undefined || value === null ? '' : value);
    try {
      var shared = typeof globalThis !== 'undefined'
        ? globalThis.redactBridgeSecretsInString
        : null;
      if (typeof shared === 'function') {
        var sharedResult = shared(text);
        if (typeof sharedResult === 'string') return sharedResult;
      }
    } catch (_error) {
      // Fall through to the private fail-closed scrubber.
    }
    return text.replace(FSB_BRIDGE_SECRET_PATTERN, FSB_BRIDGE_SECRET_REPLACEMENT);
  }

  function _redactText(value, maxChars) {
    return _redactBridgeSecrets(value)
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, '[redacted]')
      .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/gi, '[redacted]')
      .replace(/\b(?:api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
      .slice(0, maxChars);
  }

  function _safeContext(value) {
    var input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var safe = {};
    if (typeof input.origin === 'string') safe.origin = _redactText(input.origin, 256);
    if (Number.isFinite(Number(input.statusCode))) safe.statusCode = Number(input.statusCode);
    if (typeof input.kind === 'string') safe.kind = _redactText(input.kind, 64);
    if (input.lengths && typeof input.lengths === 'object' && !Array.isArray(input.lengths)) {
      safe.lengths = {};
      Object.keys(input.lengths).slice(0, 8).forEach(function(key) {
        if (/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key) && Number.isFinite(Number(input.lengths[key]))) {
          safe.lengths[key] = Number(input.lengths[key]);
        }
      });
    }
    return safe;
  }

  function _safeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return {
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
      level: _redactText(entry.level || 'warn', 16),
      prefix: _redactText(entry.prefix || '', 48),
      category: _redactText(entry.category || '', 64),
      message: _redactText(entry.message || '', 512),
      redactedContext: _safeContext(entry.redactedContext)
    };
  }

  function _trustedStore() {
    var store = typeof globalThis !== 'undefined' ? globalThis.fsbTrustedLocalFeatureStore : null;
    return store && typeof store === 'object' ? store : null;
  }

  function _sendFixed(message) {
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return Promise.resolve(null);
    }
    return new Promise(function(resolve) {
      try {
        chrome.runtime.sendMessage(message, function(response) {
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

  function appendDiagnosticEntry(entry) {
    var safe = _safeEntry(entry);
    if (!safe) return Promise.resolve();
    _inMemoryRing.push(safe);
    if (_inMemoryRing.length > MAX_ENTRIES) {
      _inMemoryRing.splice(0, _inMemoryRing.length - MAX_ENTRIES);
    }

    var store = _trustedStore();
    if (store && typeof store.appendDiagnosticEntry === 'function') {
      return Promise.resolve(store.appendDiagnosticEntry(safe)).then(function() {}, function() {});
    }
    return _sendFixed({ action: DIAGNOSTIC_APPEND, entry: safe }).then(function() {});
  }

  async function getDiagnosticEntries(options) {
    var clear = !!(options && options.clear === true);
    var store = _trustedStore();
    if (store && typeof store.getDiagnosticEntries === 'function') {
      try {
        return await store.getDiagnosticEntries({ clear: clear });
      } catch (_error) {
        // The in-memory ring below is the bounded fail-quiet fallback.
      }
    } else {
      var remote = await _sendFixed({ action: DIAGNOSTIC_GET, clear: clear });
      if (remote && remote.ok === true && Array.isArray(remote.entries)) {
        return {
          entries: remote.entries,
          ...(clear && Number.isFinite(remote.clearedAt) ? { clearedAt: remote.clearedAt } : {})
        };
      }
    }

    var snapshot = _inMemoryRing.slice();
    if (clear) {
      _inMemoryRing = [];
      return { entries: snapshot, clearedAt: Date.now() };
    }
    return { entries: snapshot };
  }

  function _resetRing() {
    _inMemoryRing = [];
  }

  var api = {
    append: appendDiagnosticEntry,
    get: getDiagnosticEntries,
    _reset: _resetRing,
    STORAGE_KEY: STORAGE_KEY,
    MAX_ENTRIES: MAX_ENTRIES
  };

  if (typeof globalThis !== 'undefined') globalThis.fsbDiagnostics = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      appendDiagnosticEntry: appendDiagnosticEntry,
      getDiagnosticEntries: getDiagnosticEntries,
      _resetRing: _resetRing,
      STORAGE_KEY: STORAGE_KEY,
      MAX_ENTRIES: MAX_ENTRIES
    };
  }
})();
