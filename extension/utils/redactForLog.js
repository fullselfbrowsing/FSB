// utils/redactForLog.js -- FSB Phase 211-03 diagnostic logging helpers.
// Exposes globalThis.redactForLog (shape-only payload redaction) and
// globalThis.rateLimitedWarn (one warn per (prefix, category) per 10s with
// counter rollup). Both helpers are pure functions over an in-memory state
// table; they do not touch chrome.storage directly. Persistence is via
// utils/diagnostics-ring-buffer.js which this module references lazily via
// globalThis.fsbDiagnostics so load order is forgiving.
//
// Layered prefixes (D-11):
//   DLG  -- dialog relay (content/dom-stream.js dialog open/close)
//   DOM  -- content stream (mutation/scroll/overlay/snapshot/ready dispatch)
//   BG   -- background runtime
//   WS   -- websocket transport
//   SYNC -- Sync tab UI (reserved for Phase 213)
//
// Redaction rule (D-12 / PITFALLS.md P11):
//   Default behavior is "log shape, not content".
//   URLs        -> URL(x).origin only (no path/query/fragment).
//   strings     -> { kind, length }.
//   Errors      -> { kind: 'error', name, message } -- NO stack.
//   responses   -> { kind: 'response', statusCode }.
//   arrays      -> { kind: 'array', length }.
//   objects     -> { kind: 'object', keys: <count> }.
//   other       -> { kind: typeof value }.

(function() {
  'use strict';

  var FSB_BRIDGE_SECRET_PATTERN = /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;
  var FSB_BRIDGE_SECRET_REPLACEMENT = '[REDACTED_FSB_BRIDGE_SECRET]';

  function redactBridgeSecretsInString(value) {
    if (typeof value !== 'string') return value;
    return value.replace(FSB_BRIDGE_SECRET_PATTERN, FSB_BRIDGE_SECRET_REPLACEMENT);
  }

  function redactForLog(value, hint) {
    if (value === null || value === undefined) {
      return { kind: 'empty' };
    }
    if (typeof value === 'string') {
      // URL detection: treat http(s) prefixes as URL-like.
      if (/^https?:\/\//i.test(value)) {
        try {
          var u = new URL(value);
          return { kind: 'url', origin: u.origin };
        } catch (e) {
          return { kind: 'url', length: value.length };
        }
      }
      return { kind: hint || 'text', length: value.length };
    }
    if (value instanceof Error) {
      return {
        kind: 'error',
        name: value.name,
        message: redactBridgeSecretsInString(value.message || '')
      };
    }
    if (Array.isArray(value)) {
      return { kind: 'array', length: value.length };
    }
    // HTTP-Response-like: has a numeric status property.
    if (typeof value === 'object' && typeof value.status === 'number') {
      return { kind: 'response', statusCode: value.status };
    }
    if (typeof value === 'object') {
      try {
        return { kind: 'object', keys: Object.keys(value).slice(0, 10).length };
      } catch (e) {
        return { kind: 'object', keys: 0 };
      }
    }
    return { kind: typeof value };
  }

  // Rate-limit state: one entry per (prefix, category) key.
  var _rateLimitTable = new Map();
  var WINDOW_MS = 10000;

  function rateLimitedWarn(prefix, category, message, redactedContext) {
    var key = String(prefix) + '::' + String(category);
    var safePrefix = redactBridgeSecretsInString(String(prefix));
    var safeCategory = redactBridgeSecretsInString(String(category));
    var safeMessage = redactBridgeSecretsInString(String(message));
    var now = Date.now();
    var entry = _rateLimitTable.get(key);
    var shouldEmit = !entry || (now - entry.lastWarnTs >= WINDOW_MS);

    if (shouldEmit) {
      var suppressedSuffix = (entry && entry.suppressedCount > 0)
        ? ' (suppressed ' + entry.suppressedCount + ' in last 10s)' : '';
      try {
        console.warn('[FSB ' + safePrefix + '] ' + safeMessage + suppressedSuffix, redactedContext || {});
      } catch (e) { /* console may be missing in exotic contexts */ }
      _rateLimitTable.set(key, { lastWarnTs: now, suppressedCount: 0 });
    } else {
      entry.suppressedCount = (entry.suppressedCount || 0) + 1;
      _rateLimitTable.set(key, entry);
    }

    // Always append to ring buffer (export captures everything regardless of
    // console rate-limiting). D-09: { ts, level, prefix, category, message, redactedContext }.
    try {
      var diag = (typeof globalThis !== 'undefined' && globalThis.fsbDiagnostics)
        ? globalThis.fsbDiagnostics : null;
      if (diag && typeof diag.append === 'function') {
        diag.append({
          ts: now,
          level: 'warn',
          prefix: safePrefix,
          category: safeCategory,
          message: safeMessage,
          redactedContext: redactedContext || {}
        });
      }
    } catch (e) { /* best-effort; ring buffer not yet loaded */ }
  }

  // Variant for level: 'debug' entries (D-10: SPA-navigation downgrade path).
  // Does NOT call console.warn; only appends to ring buffer.
  function logDebugToRing(prefix, category, message, redactedContext) {
    try {
      var diag = (typeof globalThis !== 'undefined' && globalThis.fsbDiagnostics)
        ? globalThis.fsbDiagnostics : null;
      if (diag && typeof diag.append === 'function') {
        diag.append({
          ts: Date.now(),
          level: 'debug',
          prefix: redactBridgeSecretsInString(String(prefix)),
          category: redactBridgeSecretsInString(String(category)),
          message: redactBridgeSecretsInString(String(message)),
          redactedContext: redactedContext || {}
        });
      }
    } catch (e) { /* best-effort */ }
  }

  // Test hook: reset the rate-limit table (used by tests/redact-for-log.test.js).
  function _resetRateLimitTable() {
    _rateLimitTable = new Map();
  }

  // Expose on globalThis so SW and content-script contexts can both use it.
  if (typeof globalThis !== 'undefined') {
    globalThis.redactBridgeSecretsInString = redactBridgeSecretsInString;
    globalThis.redactForLog = redactForLog;
    globalThis.rateLimitedWarn = rateLimitedWarn;
    globalThis.logDebugToRing = logDebugToRing;
    globalThis._fsbRateLimitReset = _resetRateLimitTable;
  }

  // Also export for CommonJS so tests can require() this file directly.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      redactBridgeSecretsInString: redactBridgeSecretsInString,
      redactForLog: redactForLog,
      rateLimitedWarn: rateLimitedWarn,
      logDebugToRing: logDebugToRing,
      _resetRateLimitTable: _resetRateLimitTable
    };
  }
})();
