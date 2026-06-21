(function(global) {
  'use strict';

  /**
   * Phase 30 plan 02 (v0.9.99 -- GOV-05/GOV-06; D-09/D-10/D-11/D-12) --
   * audit-log.js
   *
   * The append-only, SECRET-FREE audit ring for capability invocations. Every
   * invoke outcome (blocked or allowed) appends ONE record so the user has a
   * tamper-evident trail of what ran, against which origin, and how the consent
   * gate decided -- with ZERO credentials (D-11). This is the accountability half
   * of the credential-replay safety spine.
   *
   * Cloned from diagnostics-ring-buffer.js:27-122 VERBATIM in structure (the
   * in-memory _inMemoryRing shadow, the defensive field-whitelist copy on append,
   * the FIFO trim at MAX_ENTRIES, the chrome.storage.local get/push/trim/set, the
   * getEntries({clear}) export, the _reset test hook) -- only the entry SCHEMA is
   * swapped.
   *
   * Entry schema (D-10 -- a strict FIELD WHITELIST; args/body/headers/cookies/
   * tokens are NEVER referenced in the append path, so they cannot leak by
   * construction):
   *   { ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error? }
   *
   * Redaction (D-11): origin collapses to its origin via globalThis.redactForLog
   * (a full URL -> origin only; no path/query). The optional error is reduced to
   * its name + message ONLY -- read directly off error.name / error.message via
   * String() so sibling fields (a token/bearer slipped onto an error object) are
   * structurally excluded; no stack, no body. The remaining whitelisted fields are
   * benign control-plane values, String()-coerced.
   *
   * Bounded + exportable (D-12): MAX_ENTRIES 200, FIFO-trimmed; getEntries({clear})
   * returns then empties the ring (the user export/clear). Retention is documented
   * in docs/LEGAL.md.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js. The
   * service worker reads global.FsbAuditLog after importScripts; Node tests
   * require() the module.exports.
   *
   * Wall-1: this module is on RECIPE_PATH_ALLOWLIST (Plan 01 pre-arm) because the
   * Plan-02 consent gate appends to it at the invoke chokepoint -- so it is kept
   * dynamic-code-FREE (no run-string-as-code / function-from-string / dynamic
   * module loader constructs, even in comments; the guard scans comments).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Constants -----------------------------------------------------------

  var STORAGE_KEY = 'fsbAuditLog';
  var PAYLOAD_VERSION = 1;
  var MAX_ENTRIES = 200;

  // In-memory shadow for synchronous appends; reconciled with chrome.storage on
  // every write (the diagnostics-ring ordering, RESEARCH Pitfall 7).
  var _inMemoryRing = [];

  function _hasChromeStorage() {
    return typeof chrome !== 'undefined'
      && chrome.storage
      && chrome.storage.local
      && typeof chrome.storage.local.get === 'function'
      && typeof chrome.storage.local.set === 'function';
  }

  // ---- redaction helper (lazy globalThis.redactForLog, like redactForLog.js
  //      references fsbDiagnostics -- forgiving load order) --------------------
  function _redact() {
    return (typeof globalThis !== 'undefined' && typeof globalThis.redactForLog === 'function')
      ? globalThis.redactForLog : null;
  }

  // ---- origin -> origin-only string (D-11) ---------------------------------
  // redactForLog collapses a URL to { kind:'url', origin }. A non-URL string
  // yields { kind, length } (no origin) -> we coerce to '' so a stray
  // non-origin value cannot leak its content into the ring.
  function _safeOrigin(origin) {
    if (typeof origin !== 'string' || !origin) { return ''; }
    var redact = _redact();
    if (redact) {
      var r = redact(origin);
      return (r && typeof r.origin === 'string') ? r.origin : '';
    }
    // No redactor available (degraded). Fall back to a parsed origin so we still
    // never persist a path/query; an unparseable value collapses to ''.
    try {
      return new URL(origin).origin;
    } catch (_e) {
      return '';
    }
  }

  // ---- error -> { name, message } ONLY (D-11) ------------------------------
  // Reads ONLY the two sub-fields by name and String()-coerces them. A token /
  // bearer / cookie slipped onto the error object is NOT a name/message field, so
  // it is structurally excluded. No stack, no body. Returns undefined when there
  // is no error so the key stays optional.
  function _safeError(error) {
    if (error === null || error === undefined) { return undefined; }
    var name = '';
    var message = '';
    if (typeof error === 'string') {
      message = error;
    } else if (typeof error === 'object') {
      if (typeof error.name === 'string') { name = error.name; }
      if (typeof error.message === 'string') { message = error.message; }
    }
    // Compose a name/message-only string. Both empty -> a bare '' marker so the
    // presence of an error is still recorded without any payload.
    if (name && message) { return String(name) + ': ' + String(message); }
    if (name) { return String(name); }
    return String(message);
  }

  // ---- append(entry) -> Promise<void> --------------------------------------
  // Builds the safe record by the strict field whitelist (D-10), routes each
  // field through redaction (D-11), pushes to the in-memory shadow + persists to
  // chrome.storage.local with FIFO trim. args/body/headers/cookies are NEVER
  // read here -- the schema excludes them by construction.
  function append(entry) {
    if (!entry || typeof entry !== 'object') { return Promise.resolve(); }
    var safe = {
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
      origin: _safeOrigin(entry.origin),
      slug: String(entry.slug || ''),
      method: String(entry.method || ''),
      sideEffectClass: String(entry.sideEffectClass || ''),
      consentDecision: String(entry.consentDecision || ''),
      outcome: String(entry.outcome || '')
    };
    // The error key is OPTIONAL -- only add it when an error is present so a
    // clean record carries exactly the seven required keys.
    var safeError = _safeError(entry.error);
    if (safeError !== undefined) {
      safe.error = safeError;
    }

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
      } catch (_e) {
        resolve();
      }
    });
  }

  // ---- getEntries(opts) -> Promise<{ entries, clearedAt? }> ----------------
  // Returns the ring newest-last. opts.clear === true returns then empties the
  // ring and stamps clearedAt (the D-12 user export/clear).
  function getEntries(opts) {
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
      } catch (_e) {
        resolve({ entries: _inMemoryRing.slice() });
      }
    });
  }

  // ---- _reset() -- test hook (mirror diagnostics-ring _resetRing) -----------
  function _reset() {
    _inMemoryRing = [];
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ----
  var exportsObj = {
    STORAGE_KEY: STORAGE_KEY,
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    MAX_ENTRIES: MAX_ENTRIES,
    append: append,
    getEntries: getEntries,
    _reset: _reset
  };

  global.FsbAuditLog = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;     // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
