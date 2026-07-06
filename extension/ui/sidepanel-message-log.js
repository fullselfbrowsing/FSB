/**
 * Phase 12 FINT-23 -- pure-helper sidecar for the side panel's
 * per-conversation persistent message log.
 *
 * Storage key: 'fsbConversationMessages' (CONTEXT D-01 + D-02).
 * Envelope: { v: 1, byConv: { '<convId>': log, ... }, lru: ['<convId>', ...] }.
 * Log: { v: 1, messages: [{role, content, timestamp, kind}, ...], lastWriteAt, createdAt }.
 * Cap: 50 conversations; tail-eviction on 51st insert (D-04).
 * Debounce: 200ms per convId; clear-and-replace (D-03).
 *
 * Test-seam: sidecar performs ZERO host-extension API calls. The caller
 * owns envelope read/write; the debouncer accepts injected setTimeoutFn +
 * clearTimeoutFn so Node tests advance simulated time deterministically.
 *
 * Classic-script load shape: registers on globalThis for sidepanel
 * consumption AND exports for Node tests. Mirrors
 * extension/ui/sidepanel-tab-conv-store.js (Phase 11 sidecar).
 */
(function(global) {
  'use strict';

  var STORAGE_KEY = 'fsbConversationMessages';
  var DEFAULT_CAP = 50;
  var DEFAULT_DEBOUNCE_MS = 200;
  var ENVELOPE_VERSION = 1;
  var ALLOWED_ROLES = { user: true, assistant: true };
  var ALLOWED_KINDS = { text: true, progress: true, tool: true, error: true };

  /**
   * Produce a fresh empty envelope. New object every call so callers cannot
   * accidentally share state through a shared reference.
   * @returns {object} { v: 1, byConv: {}, lru: [] }
   */
  function emptyEnvelope() {
    return { v: ENVELOPE_VERSION, byConv: {}, lru: [] };
  }

  /**
   * Defensive shape check. Required at every public-API entry so corrupted
   * envelopes (e.g., from DevTools-mutated storage) degrade safely.
   * @param {*} env
   * @returns {boolean}
   */
  function isValidEnvelope(env) {
    if (!env || typeof env !== 'object') return false;
    if (env.v !== ENVELOPE_VERSION) return false;
    if (!env.byConv || typeof env.byConv !== 'object') return false;
    if (!Array.isArray(env.lru)) return false;
    return true;
  }

  /**
   * Normalize a conversationId. Returns null on invalid input.
   * @param {*} convId
   * @returns {string|null}
   */
  function _normalizeConvId(convId) {
    if (typeof convId !== 'string') return null;
    if (convId.length === 0) return null;
    return convId;
  }

  /**
   * Move the convId to the head of the LRU list (MRU position). Idempotent on
   * missing. Mutates envelope.lru in place.
   * @param {object} envelope
   * @param {string} convId
   */
  function _touchLru(envelope, convId) {
    if (!isValidEnvelope(envelope)) return;
    var key = _normalizeConvId(convId);
    if (key === null) return;
    var idx = envelope.lru.indexOf(key);
    if (idx !== -1) envelope.lru.splice(idx, 1);
    envelope.lru.unshift(key);
  }

  /**
   * Drop entries beyond `cap` from the tail (LRU end). Idempotent. Also reaps
   * any byConv entries not present in the lru array (defense vs corruption).
   * Mutates envelope in place.
   * @param {object} envelope
   * @param {number} cap
   */
  function _enforceLruCap(envelope, cap) {
    if (!isValidEnvelope(envelope)) return;
    var effectiveCap = (typeof cap === 'number' && cap >= 0) ? cap : DEFAULT_CAP;
    while (envelope.lru.length > effectiveCap) {
      var tailKey = envelope.lru.pop();
      if (tailKey) delete envelope.byConv[tailKey];
    }
    var lruSet = {};
    for (var i = 0; i < envelope.lru.length; i++) lruSet[envelope.lru[i]] = true;
    var byConvKeys = Object.keys(envelope.byConv);
    for (var j = 0; j < byConvKeys.length; j++) {
      if (!lruSet[byConvKeys[j]]) delete envelope.byConv[byConvKeys[j]];
    }
  }

  /**
   * Validate a message payload. Rejects unknown role or kind values, missing
   * content, or non-numeric timestamp.
   * @param {*} msg
   * @returns {boolean}
   */
  function _isValidMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (typeof msg.role !== 'string' || !ALLOWED_ROLES[msg.role]) return false;
    if (typeof msg.content !== 'string') return false;
    if (typeof msg.timestamp !== 'number' || !Number.isFinite(msg.timestamp)) return false;
    if (typeof msg.kind !== 'string' || !ALLOWED_KINDS[msg.kind]) return false;
    // QT-wnz Codex-4 -- OPTIONAL sessionId + terminal fields. Validate ONLY
    // when defined (preserves backward-compat: existing rows without these
    // fields keep validating).
    if (msg.sessionId !== undefined && typeof msg.sessionId !== 'string') return false;
    if (msg.terminal !== undefined && typeof msg.terminal !== 'boolean') return false;
    return true;
  }

  /**
   * Append a message to the per-convId log. Lazy-creates the per-convId log on
   * first call. Updates lastWriteAt + LRU. Enforces cap. Mutates envelope in
   * place.
   * @param {object} envelope
   * @param {string} convId
   * @param {{role:string, content:string, timestamp:number, kind:string}} msg
   * @returns {boolean} true on success, false on invalid input
   */
  function appendMessage(envelope, convId, msg) {
    if (!isValidEnvelope(envelope)) return false;
    var key = _normalizeConvId(convId);
    if (key === null) return false;
    if (!_isValidMessage(msg)) return false;
    var log = envelope.byConv[key];
    var now = Date.now();
    if (!log || typeof log !== 'object' || !Array.isArray(log.messages)) {
      log = {
        v: ENVELOPE_VERSION,
        messages: [],
        lastWriteAt: now,
        createdAt: now
      };
      envelope.byConv[key] = log;
    }
    // QT-wnz Codex-4 -- conditionally include sessionId + terminal so rows
    // without these fields look identical to pre-wnz rows (backward-compat
    // for getMessages consumers + on-disk envelope shape).
    var row = {
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      kind: msg.kind
    };
    if (typeof msg.sessionId === 'string') row.sessionId = msg.sessionId;
    if (msg.terminal === true) row.terminal = true;
    log.messages.push(row);
    log.lastWriteAt = now;
    _touchLru(envelope, key);
    _enforceLruCap(envelope, DEFAULT_CAP);
    return true;
  }

  /**
   * Peek-only fetch. NO mutation. Returns an empty array on missing.
   * @param {object} envelope
   * @param {string} convId
   * @returns {Array}
   */
  function getMessages(envelope, convId) {
    if (!isValidEnvelope(envelope)) return [];
    var key = _normalizeConvId(convId);
    if (key === null) return [];
    var log = envelope.byConv[key];
    if (!log || !Array.isArray(log.messages)) return [];
    var out = [];
    for (var i = 0; i < log.messages.length; i++) {
      var m = log.messages[i];
      // QT-wnz Codex-4 -- conditionally include sessionId + terminal so
      // legacy consumers see identical shape; new consumers see the
      // optional fields when present.
      var row = { role: m.role, content: m.content, timestamp: m.timestamp, kind: m.kind };
      if (typeof m.sessionId === 'string') row.sessionId = m.sessionId;
      if (m.terminal === true) row.terminal = true;
      out.push(row);
    }
    return out;
  }

  /**
   * QT-wnz Codex-4 -- idempotency check for terminal completion messages.
   * Returns true if any message in convId's log has sessionId === sessionId
   * AND terminal === true. Used by sidepanel automationComplete handler to
   * skip duplicate persist+render when background or another sidepanel
   * context has already written the terminal.
   *
   * @param {object} envelope
   * @param {string} convId
   * @param {string} sessionId
   * @returns {boolean}
   */
  function hasTerminalForSession(envelope, convId, sessionId) {
    if (!isValidEnvelope(envelope)) return false;
    var key = _normalizeConvId(convId);
    if (key === null) return false;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
    var log = envelope.byConv[key];
    if (!log || !Array.isArray(log.messages)) return false;
    for (var i = 0; i < log.messages.length; i++) {
      var m = log.messages[i];
      if (m && m.sessionId === sessionId && m.terminal === true) return true;
    }
    return false;
  }

  /**
   * Remove the conversation log entry from byConv + the lru order. Idempotent
   * on missing. Mutates envelope in place.
   * @param {object} envelope
   * @param {string} convId
   */
  function dropConversationMessages(envelope, convId) {
    if (!isValidEnvelope(envelope)) return;
    var key = _normalizeConvId(convId);
    if (key === null) return;
    delete envelope.byConv[key];
    var idx = envelope.lru.indexOf(key);
    if (idx !== -1) envelope.lru.splice(idx, 1);
  }

  /**
   * Factory producing a per-convId debouncer with clear-and-replace semantics.
   * Each call to schedule(convId, cb) clears any pending timer for that convId
   * AND replaces it with a fresh debounceMs timer. flush(convId) forces
   * synchronous timer cancel + immediate callback fire. flushAll() iterates
   * over all pending convIds + flushes each. cancel(convId) clears the timer
   * without firing the callback.
   *
   * Dependency-injected setTimeoutFn + clearTimeoutFn so smoke tests can
   * synchronously advance simulated time. Defaults to globalThis setTimeout /
   * clearTimeout.
   *
   * @param {{debounceMs?:number, setTimeoutFn?:function, clearTimeoutFn?:function}} [opts]
   * @returns {{schedule:function, flush:function, flushAll:function, cancel:function, _hasPending:function}}
   */
  function createDebouncer(opts) {
    opts = opts || {};
    var debounceMs = (typeof opts.debounceMs === 'number' && opts.debounceMs >= 0)
      ? opts.debounceMs
      : DEFAULT_DEBOUNCE_MS;
    var _setTimeoutFn = (typeof opts.setTimeoutFn === 'function')
      ? opts.setTimeoutFn
      : function (fn, ms) { return setTimeout(fn, ms); };
    var _clearTimeoutFn = (typeof opts.clearTimeoutFn === 'function')
      ? opts.clearTimeoutFn
      : function (id) { return clearTimeout(id); };
    var _pending = {};

    function schedule(convId, cb) {
      var key = _normalizeConvId(convId);
      if (key === null || typeof cb !== 'function') return;
      var existing = _pending[key];
      if (existing && existing.timerId !== null) {
        _clearTimeoutFn(existing.timerId);
      }
      var entry = { timerId: null, cb: cb };
      _pending[key] = entry;
      entry.timerId = _setTimeoutFn(function () {
        entry.timerId = null;
        delete _pending[key];
        try { Promise.resolve(cb()).catch(function () {}); }
        catch (_e) { /* swallow */ }
      }, debounceMs);
    }

    async function flush(convId) {
      var key = _normalizeConvId(convId);
      if (key === null) return;
      var entry = _pending[key];
      if (!entry) return;
      if (entry.timerId !== null) _clearTimeoutFn(entry.timerId);
      delete _pending[key];
      try { await Promise.resolve(entry.cb()); }
      catch (_e) { /* swallow */ }
    }

    async function flushAll() {
      var keys = Object.keys(_pending);
      for (var i = 0; i < keys.length; i++) {
        await flush(keys[i]);
      }
    }

    function cancel(convId) {
      var key = _normalizeConvId(convId);
      if (key === null) return;
      var entry = _pending[key];
      if (!entry) return;
      if (entry.timerId !== null) _clearTimeoutFn(entry.timerId);
      delete _pending[key];
    }

    function _hasPending(convId) {
      var key = _normalizeConvId(convId);
      if (key === null) return false;
      return _pending[key] !== undefined;
    }

    return {
      schedule: schedule,
      flush: flush,
      flushAll: flushAll,
      cancel: cancel,
      _hasPending: _hasPending
    };
  }

  var exportsObj = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_CAP: DEFAULT_CAP,
    DEFAULT_DEBOUNCE_MS: DEFAULT_DEBOUNCE_MS,
    ENVELOPE_VERSION: ENVELOPE_VERSION,
    emptyEnvelope: emptyEnvelope,
    isValidEnvelope: isValidEnvelope,
    appendMessage: appendMessage,
    getMessages: getMessages,
    dropConversationMessages: dropConversationMessages,
    hasTerminalForSession: hasTerminalForSession,
    _touchLru: _touchLru,
    _enforceLruCap: _enforceLruCap,
    createDebouncer: createDebouncer
  };

  global.FSBSidepanelMessageLog = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
