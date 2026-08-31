// utils/diagnostics-ring-buffer.js -- FSB Phase 211-03 diagnostic ring buffer.
// FIFO 100 entries persisted to chrome.storage.local.fsb_diagnostics_ring.
// Entry shape (D-09):
//   { ts, level, prefix, category, message, redactedContext: { origin?, lengths?, statusCode?, kind? } }
//
// Phase 211 ships back-end only (D-08). Phase 213 wires the Sync tab "Export
// diagnostics" button to chrome.runtime.sendMessage({ action: 'exportDiagnostics' })
// which background.js handles by calling getDiagnosticEntries({ clear?: true }).

(function() {
  'use strict';

  var STORAGE_KEY = 'fsb_diagnostics_ring';
  var MAX_ENTRIES = 100;
  var MAX_CONTEXT_DEPTH = 4;
  var MAX_OBJECT_KEYS = 20;
  var MAX_ARRAY_ITEMS = 100;
  var FSB_BRIDGE_SECRET_PATTERN = /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
  var FSB_BRIDGE_SECRET_REPLACEMENT = '[REDACTED_FSB_BRIDGE_SECRET]';

  // In-memory shadow for synchronous appends; reconciled with chrome.storage on every write.
  var _inMemoryRing = [];

  function _redactBridgeSecretString(value) {
    if (typeof value !== 'string') return value;
    try {
      var shared = (typeof globalThis !== 'undefined')
        ? globalThis.redactBridgeSecretsInString : null;
      if (typeof shared === 'function') {
        var sharedResult = shared(value);
        if (typeof sharedResult === 'string') return sharedResult;
      }
    } catch (e) { /* use the private fallback */ }
    return value.replace(FSB_BRIDGE_SECRET_PATTERN, FSB_BRIDGE_SECRET_REPLACEMENT);
  }

  function _shapeSafeValue(value) {
    if (Array.isArray(value)) return { kind: 'array', length: value.length };
    if (value && typeof value === 'object') {
      try {
        return { kind: 'object', keys: Math.min(Object.keys(value).length, MAX_OBJECT_KEYS) };
      } catch (e) {
        return { kind: 'object', keys: 0 };
      }
    }
    if (value === null || value === undefined) return { kind: 'empty' };
    return { kind: typeof value };
  }

  function _sanitizeDiagnosticValue(value, depth) {
    if (typeof value === 'string') return _redactBridgeSecretString(value);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    if (value === undefined) return { kind: 'empty' };
    if (typeof value !== 'object') return _shapeSafeValue(value);

    if (value instanceof Error) {
      return {
        kind: 'error',
        name: _redactBridgeSecretString(String(value.name || 'Error')),
        message: _redactBridgeSecretString(String(value.message || ''))
      };
    }

    if (depth >= MAX_CONTEXT_DEPTH) return _shapeSafeValue(value);

    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map(function(item) {
        return _sanitizeDiagnosticValue(item, depth + 1);
      });
    }

    var result = {};
    var keys;
    try {
      keys = Object.keys(value).slice(0, MAX_OBJECT_KEYS);
    } catch (e) {
      return { kind: 'object', keys: 0 };
    }
    for (var i = 0; i < keys.length; i++) {
      var rawKey = keys[i];
      var safeKey = _redactBridgeSecretString(rawKey);
      try {
        result[safeKey] = _sanitizeDiagnosticValue(value[rawKey], depth + 1);
      } catch (e) {
        result[safeKey] = { kind: 'unavailable' };
      }
    }
    return result;
  }

  function _makeSafeEntry(entry) {
    var whitelisted = {
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
      level: String(entry.level || 'warn'),
      prefix: String(entry.prefix || ''),
      category: String(entry.category || ''),
      message: String(entry.message || ''),
      redactedContext: (entry.redactedContext && typeof entry.redactedContext === 'object')
        ? entry.redactedContext : {}
    };
    return {
      ts: whitelisted.ts,
      level: _redactBridgeSecretString(whitelisted.level),
      prefix: _redactBridgeSecretString(whitelisted.prefix),
      category: _redactBridgeSecretString(whitelisted.category),
      message: _redactBridgeSecretString(whitelisted.message),
      redactedContext: _sanitizeDiagnosticValue(whitelisted.redactedContext, 0)
    };
  }

  function _hasChromeStorage() {
    return typeof chrome !== 'undefined'
      && chrome.storage
      && chrome.storage.local
      && typeof chrome.storage.local.get === 'function'
      && typeof chrome.storage.local.set === 'function';
  }

  function appendDiagnosticEntry(entry) {
    if (!entry || typeof entry !== 'object') return Promise.resolve();
    // Defensive copy with explicit field whitelist to prevent accidental disclosure.
    var safe = _makeSafeEntry(entry);
    _inMemoryRing.push(safe);
    if (_inMemoryRing.length > MAX_ENTRIES) {
      _inMemoryRing.splice(0, _inMemoryRing.length - MAX_ENTRIES); // FIFO trim
    }
    if (!_hasChromeStorage()) {
      return Promise.resolve();
    }
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get([STORAGE_KEY], function(stored) {
          var ring = (stored && Array.isArray(stored[STORAGE_KEY])) ? stored[STORAGE_KEY] : [];
          ring = ring.filter(function(item) {
            return item && typeof item === 'object';
          }).map(_makeSafeEntry);
          ring.push(safe);
          if (ring.length > MAX_ENTRIES) {
            ring = ring.slice(ring.length - MAX_ENTRIES);
          }
          var update = {};
          update[STORAGE_KEY] = ring;
          chrome.storage.local.set(update, function() {
            // chrome.runtime.lastError is best-effort; no throw, no log spam.
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function getDiagnosticEntries(opts) {
    var shouldClear = !!(opts && opts.clear === true);
    if (!_hasChromeStorage()) {
      var snap = _inMemoryRing.slice();
      if (shouldClear) {
        _inMemoryRing = [];
        return Promise.resolve({ entries: snap, clearedAt: Date.now() });
      }
      return Promise.resolve({ entries: snap });
    }
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get([STORAGE_KEY], function(stored) {
          var ring = (stored && Array.isArray(stored[STORAGE_KEY])) ? stored[STORAGE_KEY] : [];
          ring = ring.filter(function(item) {
            return item && typeof item === 'object';
          }).map(_makeSafeEntry);
          if (!shouldClear) {
            resolve({ entries: ring });
            return;
          }
          var update = {};
          update[STORAGE_KEY] = [];
          chrome.storage.local.set(update, function() {
            _inMemoryRing = [];
            resolve({ entries: ring, clearedAt: Date.now() });
          });
        });
      } catch (e) {
        resolve({ entries: _inMemoryRing.slice() });
      }
    });
  }

  // Test hook: reset the in-memory ring (used by tests/diagnostics-ring-buffer.test.js).
  function _resetRing() {
    _inMemoryRing = [];
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.fsbDiagnostics = {
      append: appendDiagnosticEntry,
      get: getDiagnosticEntries,
      _reset: _resetRing,
      STORAGE_KEY: STORAGE_KEY,
      MAX_ENTRIES: MAX_ENTRIES
    };
  }

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
