/**
 * MCP Session Recorder -- assembles MCP-agent browsing sessions and lands
 * them in the SAME logs/history/replay/memory pipeline autopilot runs use.
 *
 * Quick task 260707-7id (+ review-fix follow-up). Two hook points feed it:
 *   - Bridge-level ACTION tap: MCPBridgeClient._recordMcpSessionAction
 *     (extension/ws/mcp-bridge-client.js, called from _handleExecuteAction)
 *     invokes recordAction() for EVERY action tool -- content, cdp, and
 *     background routes alike -- carrying the ownership-resolved tabId. The
 *     dispatcher tool route only ever saw background-routed actions, so the
 *     tap lives where all three routes converge.
 *   - Dispatcher message-route hook: dispatchMcpMessageRoute's finally block
 *     in extension/ws/mcp-tool-dispatcher.js calls recordDispatch() so
 *     read-only/message traffic JOINs open sessions by agentId.
 * Each recorded call folds one resolved MCP dispatch into an in-memory
 * open-session record keyed agentId+tabId; the visualSession sidecar drives
 * the lifecycle (birth on first action tool, close on isFinal or 60s idle).
 *
 * On close the assembled session flows through DIRECT service-worker
 * globals -- NEVER chrome.runtime.sendMessage, which does not loop back
 * inside the SW:
 *   - globalThis.automationLogger.saveSession(sessionId, session) -- the
 *     fsbSessionLogs/fsbSessionIndex history store (mode + mcpClient badge
 *     fields carried by this task's automation-logger.js change).
 *   - extractAndStoreMemories(sessionId, session) -- background.js memory
 *     handoff; verified to tolerate a missing AI instance.
 *   - createSession(overrides) -- ai/session-schema.js factory when present
 *     (SW runtime); a manual same-keys object under bare Node.
 *
 * Persisted actionHistory entries are {tool, params, result, timestamp} so
 * the existing replay engine (background.js loadReplayableSession /
 * executeReplaySequence) consumes MCP sessions unmodified. params get a
 * KEY-TARGETED sensitive-value redaction (password/secret/token/credential/
 * api-key/authorization -- threat T-q7id-01) while replay-critical values
 * (url, selector, text) persist raw.
 *
 * Open sessions survive MV3 SW eviction via a chrome.storage.session
 * versioned envelope (key fsbMcpSessionBuffer, v1 -- envelope pattern
 * mirrors utils/mcp-task-store.js: canonical empty on missing/mismatched/
 * malformed; storage key removed when records is empty).
 *
 * Never-record rules:
 *   - run_task dispatches are skipped entirely (they alias to
 *     mcp:start-automation and the automation engine already records that
 *     run -- recording here would double sessions).
 *   - Read-only bursts (agentId but never a visualSession sidecar) never
 *     birth sessions; sidecar-less calls only JOIN an already-open session
 *     for the same agentId.
 *
 * recordDispatch NEVER throws and never returns a meaningful value
 * (fire-and-forget contract, threat T-q7id-02) -- the dispatcher further
 * insulates the call sites in their own try/catch as defence in depth.
 *
 * Loading: background.js pulls this file as a classic script right after
 * utils/mcp-metrics-recorder.js. Lazy globalThis.chrome access keeps the
 * module require()-able under plain Node for the test harness at
 * tests/mcp-session-recorder.test.js.
 *
 * @module extension/utils/mcp-session-recorder
 */

(function () {
  'use strict';

  // ---- Constants ----------------------------------------------------------

  var FSB_MCP_SESSION_BUFFER_KEY = 'fsbMcpSessionBuffer';
  var FSB_MCP_SESSION_BUFFER_VERSION = 1;

  // Mirrors MCP_VISUAL_LIFECYCLE_DEATH_MS
  // (extension/utils/mcp-visual-session-lifecycle.js:79) -- a sliding 60s
  // idle window re-armed on every recorded dispatch. Deliberately NOT read
  // from that module: the recorder keeps its OWN timer so the two
  // lifecycles stay decoupled.
  var MCP_SESSION_IDLE_DEATH_MS = 60000;

  // In-memory actionHistory cap -- matches the saveSession persistence cap
  // (automation-logger.js slice(-100)) so memory cannot grow unbounded on a
  // long-lived agent session.
  var MCP_SESSION_ACTION_HISTORY_CAP = 100;

  // Key-targeted redaction pattern (threat T-q7id-01). VALUES of matching
  // keys are replaced before any persist; everything else persists raw for
  // replay fidelity. Note ownershipToken never enters actionHistory because
  // only payload.params is recorded, but the pattern also catches a
  // params-level token if one ever appears.
  var SENSITIVE_KEY_PATTERN = /pass(word)?|secret|token|credential|api[-_]?key|authorization/i;

  // Wire-verb -> legacy replay-name map. The replay engine's whitelist
  // (background.js loadReplayableSession replayableTools) speaks the content
  // script's camelCase verb namespace, and almost every action tool's wire
  // verb already matches it (type_text ships as 'type', press_enter as
  // 'pressEnter', ...). The only replay-worthy mismatches are the
  // background-routed history tools, whose wire verb is their snake_case
  // tool name. Non-replayable verbs (cdp*, dragdrop, siteSearch, tab ops)
  // store verbatim -- the replay filter drops them naturally, exactly as it
  // does for autopilot sessions.
  var MCP_REPLAY_TOOL_NAME_MAP = Object.freeze({
    go_back: 'goBack',
    go_forward: 'goForward'
  });

  // ---- In-memory state ----------------------------------------------------

  // key = agentId + '::' + tabKey; value = open-session record.
  var _openSessions = new Map();
  // key -> idle-timer handle (kept out of the session record so records
  // serialize cleanly into the storage envelope).
  var _idleTimers = new Map();
  // Monotonic guard for the autopilot-format session id (session_<ms>):
  // same-ms births within THIS recorder get last+1. Cross-engine same-ms
  // collision accepted per locked design.
  var _lastGeneratedSessionTs = 0;

  // ---- Test seams (mirroring mcp-metrics-recorder.js) ---------------------

  var _storageShim = null;
  var _timeShim = null;

  function _setStorageShim(shim) {
    _storageShim = shim;
  }

  // shim = { now, setTimeout, clearTimeout } (any subset). Pass null to
  // restore real time.
  function _setTimeShim(shim) {
    _timeShim = shim || null;
  }

  function _now() {
    if (_timeShim && typeof _timeShim.now === 'function') return _timeShim.now();
    return Date.now();
  }

  function _setIdleTimeout(fn, ms) {
    if (_timeShim && typeof _timeShim.setTimeout === 'function') return _timeShim.setTimeout(fn, ms);
    return setTimeout(fn, ms);
  }

  function _clearIdleTimeout(handle) {
    if (_timeShim && typeof _timeShim.clearTimeout === 'function') return _timeShim.clearTimeout(handle);
    return clearTimeout(handle);
  }

  // ---- Lazy global accessors ----------------------------------------------

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  function _resolveSessionStorage() {
    if (_storageShim) return _storageShim;
    var c = _getChrome();
    if (c && c.storage && c.storage.session) return c.storage.session;
    return null;
  }

  function _getAutomationLogger() {
    return (typeof globalThis !== 'undefined' && globalThis.automationLogger) ? globalThis.automationLogger : null;
  }

  // ---- Redaction -----------------------------------------------------------

  // Replace the VALUE under a sensitive key. Uses the shape-only
  // globalThis.redactForLog helper when available (lazy guard exactly like
  // audit-log.js), else the literal '[REDACTED]'. NEVER shape-redacts whole
  // params -- that would destroy replay fidelity.
  function _redactValue(value) {
    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis.redactForLog === 'function') {
        return globalThis.redactForLog(value);
      }
    } catch (_e) { /* fall through to literal */ }
    return '[REDACTED]';
  }

  function _redactSensitiveKeysInPlace(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        _redactSensitiveKeysInPlace(node[i]);
      }
      return;
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        node[key] = _redactValue(node[key]);
      } else {
        _redactSensitiveKeysInPlace(node[key]);
      }
    }
  }

  // Deep-clone via JSON round-trip (try/catch fallback to {}), then walk the
  // clone replacing values under sensitive keys. url/selector/text persist
  // raw -- the replay engine consumes recorded params unmodified.
  function redactParams(params) {
    var clone;
    try {
      clone = JSON.parse(JSON.stringify(params === undefined ? null : params));
    } catch (_e) {
      return {};
    }
    if (!clone || typeof clone !== 'object') return {};
    _redactSensitiveKeysInPlace(clone);
    return clone;
  }

  // ---- Open-session buffer persistence (eviction survival) ----------------

  // Serialized through a small promise-chain lock like _withRecordLock in
  // mcp-metrics-recorder.js so two persists cannot interleave their
  // read-modify-write cycles.
  var _persistLock = Promise.resolve();

  function _withPersistLock(fn) {
    var next = _persistLock.then(fn, fn);
    _persistLock = next.catch(function () { /* keep chain alive */ });
    return next;
  }

  async function _readBufferEnvelope() {
    var storage = _resolveSessionStorage();
    if (!storage || typeof storage.get !== 'function') {
      return { v: FSB_MCP_SESSION_BUFFER_VERSION, records: {} };
    }
    try {
      var stored = await storage.get([FSB_MCP_SESSION_BUFFER_KEY]);
      var payload = stored ? stored[FSB_MCP_SESSION_BUFFER_KEY] : null;
      if (!payload || typeof payload !== 'object') {
        return { v: FSB_MCP_SESSION_BUFFER_VERSION, records: {} };
      }
      if (payload.v !== FSB_MCP_SESSION_BUFFER_VERSION) {
        return { v: FSB_MCP_SESSION_BUFFER_VERSION, records: {} };
      }
      if (!payload.records || typeof payload.records !== 'object') {
        return { v: FSB_MCP_SESSION_BUFFER_VERSION, records: {} };
      }
      return payload;
    } catch (_e) {
      return { v: FSB_MCP_SESSION_BUFFER_VERSION, records: {} };
    }
  }

  async function _writeBufferEnvelope(records) {
    var storage = _resolveSessionStorage();
    if (!storage) return;
    try {
      var nextRecords = (records && typeof records === 'object') ? records : {};
      if (Object.keys(nextRecords).length === 0) {
        // Remove the storage key when records is empty (mcp-task-store.js
        // pattern) -- no stale envelope sitting in storage forever.
        if (typeof storage.remove === 'function') {
          await storage.remove(FSB_MCP_SESSION_BUFFER_KEY);
        }
        return;
      }
      if (typeof storage.set !== 'function') return;
      var toWrite = {};
      toWrite[FSB_MCP_SESSION_BUFFER_KEY] = {
        v: FSB_MCP_SESSION_BUFFER_VERSION,
        records: nextRecords
      };
      await storage.set(toWrite);
    } catch (_e) { /* best-effort -- persistence must never break recording */ }
  }

  function _serializeRecord(session) {
    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      tabId: session.tabId,
      task: session.task,
      client: session.client,
      startTime: session.startTime,
      lastActivityAt: session.lastActivityAt,
      deadlineAt: session.deadlineAt,
      lastUrl: session.lastUrl,
      visualReasons: session.visualReasons.slice(),
      actionHistory: session.actionHistory.slice(),
      sawActionTool: session.sawActionTool === true
    };
  }

  // Fire-and-forget snapshot of every open session into the versioned
  // envelope. Called after every state mutation.
  function _persistOpenSessions() {
    try {
      _withPersistLock(async function () {
        var records = {};
        _openSessions.forEach(function (session, key) {
          records[key] = _serializeRecord(session);
        });
        await _writeBufferEnvelope(records);
      });
    } catch (_e) { /* best-effort */ }
  }

  // ---- Session identity helpers -------------------------------------------

  function _generateSessionId() {
    // Autopilot session id format (background.js: `session_${Date.now()}`)
    // with a monotonic same-ms guard scoped to this recorder.
    var ts = _now();
    if (ts <= _lastGeneratedSessionTs) {
      ts = _lastGeneratedSessionTs + 1;
    }
    _lastGeneratedSessionTs = ts;
    return 'session_' + ts;
  }

  function _numericTabId(raw) {
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return parseInt(raw, 10);
    return null;
  }

  function _tabKeyPart(numericTabId) {
    return numericTabId === null ? 'none' : String(numericTabId);
  }

  // Tab identity for session keying. Precedence mirrors the boundary
  // conventions end to end: an explicitly resolved tabId from the bridge
  // action tap wins; otherwise wire params carry snake_case tab_id (the MCP
  // schema field, preserved by PARAM_TRANSFORMS -- same order as
  // resolveAgentTabOrError in utils/agent-tab-resolver.js); camelCase tabId
  // last for back-compat with dispatcher-injected routeParams.
  function _resolveNumericTabId(entry, params) {
    var explicit = _numericTabId(entry.tabId);
    if (explicit !== null) return explicit;
    var snake = _numericTabId(params.tab_id);
    if (snake !== null) return snake;
    return _numericTabId(params.tabId);
  }

  // JOIN attribution fallback: the open session with matching agentId that
  // has the most recent lastActivityAt, any tabId -- mirrors
  // resolveMcpClientLabel's per-agent semantics.
  function _findMostRecentSessionForAgent(agentId) {
    var best = null;
    _openSessions.forEach(function (session) {
      if (session.agentId !== agentId) return;
      if (!best || session.lastActivityAt > best.lastActivityAt) best = session;
    });
    return best;
  }

  // ---- Idle timer (sliding 60s window) ------------------------------------

  function _disarmIdleTimer(key) {
    var handle = _idleTimers.get(key);
    if (handle !== undefined) {
      try { _clearIdleTimeout(handle); } catch (_e) { /* ignore */ }
      _idleTimers.delete(key);
    }
  }

  function _armIdleTimer(session) {
    var key = session.key;
    _disarmIdleTimer(key);
    var delay = session.deadlineAt - _now();
    if (delay < 0) delay = 0;
    try {
      var handle = _setIdleTimeout(function () {
        try {
          _idleTimers.delete(key);
          var live = _openSessions.get(key);
          if (!live) return;
          if (live.deadlineAt <= _now()) {
            closeSession(key, 'expired');
          } else {
            // Stale timer (deadline slid forward without a re-arm) -- re-arm
            // for the remaining window instead of closing early.
            _armIdleTimer(live);
          }
        } catch (_e) { /* never throw out of a timer */ }
      }, delay);
      _idleTimers.set(key, handle);
    } catch (_e) { /* timers unavailable -- lazy sweep still closes expired */ }
  }

  // Lazy sweep: close any open session whose deadline has passed. Runs at
  // the top of every recordDispatch so expiry works even if timers were
  // lost (SW eviction between dispatches).
  function _sweepExpired(now) {
    var expiredKeys = [];
    _openSessions.forEach(function (session, key) {
      if (session.deadlineAt <= now) expiredKeys.push(key);
    });
    for (var i = 0; i < expiredKeys.length; i++) {
      closeSession(expiredKeys[i], 'expired');
    }
  }

  // ---- Session close --------------------------------------------------------

  /**
   * Close an open session: remove it from the map, then (if it saw at least
   * one action tool and holds at least one actionHistory entry) build the
   * schema session object and hand it to the history + memory pipeline via
   * DIRECT globals. Never throws.
   *
   * @param {string} key - agentId::tabKey map key.
   * @param {string} _reason - 'final' | 'expired' (diagnostic only).
   */
  function closeSession(key, _reason) {
    try {
      var session = _openSessions.get(key);
      if (!session) return;
      _openSessions.delete(key);
      _disarmIdleTimer(key);
      _persistOpenSessions();

      // >=1-action persistence gate (defence in depth -- the JOIN rule
      // already prevents sidecar-less births).
      if (session.sawActionTool !== true || session.actionHistory.length < 1) return;

      var endTime = _now();
      var overrides = {
        id: session.sessionId,
        task: session.task,
        status: 'completed',
        startTime: session.startTime,
        endTime: endTime,
        tabId: session.tabId,
        actionHistory: session.actionHistory,
        iterationCount: session.actionHistory.length,
        lastUrl: session.lastUrl,
        mode: 'mcp-agent',
        mcpClient: session.client
      };

      // createSession is a SW global at runtime (ai/session-schema.js loads
      // as a classic script) but absent in bare Node and absent at this
      // module's load time -- always lazy-guard.
      var sessionObject = (typeof createSession === 'function')
        ? createSession(overrides)
        : Object.assign({}, overrides);

      var logger = _getAutomationLogger();
      if (logger) {
        // saveSession gates on session-bound logs (automation-logger.js:709
        // returns false when getSessionLogs(sessionId) is empty). Birth
        // seeds logs via logSessionStart, but a session restored after SW
        // eviction has an EMPTY in-memory log buffer -- re-seed one
        // session-bound entry so the gate passes.
        try {
          if (typeof logger.getSessionLogs === 'function' &&
              typeof logger.logSessionStart === 'function') {
            var existingLogs = logger.getSessionLogs(session.sessionId);
            if (!existingLogs || existingLogs.length === 0) {
              logger.logSessionStart(session.sessionId, session.task, session.tabId);
            }
          }
        } catch (_e) { /* best-effort */ }

        // DIRECT global call -- chrome.runtime.sendMessage does NOT loop
        // back inside the SW, so message-passing here would silently drop.
        try {
          if (typeof logger.saveSession === 'function') {
            var saveResult = logger.saveSession(session.sessionId, sessionObject);
            if (saveResult && typeof saveResult.catch === 'function') {
              saveResult.catch(function () { /* best-effort */ });
            }
          }
        } catch (_e) { /* never let history persistence break close */ }
      }

      // Memory handoff -- background.js extractAndStoreMemories tolerates a
      // missing AI instance and calls memoryManager.add unconditionally.
      // Absent under bare Node: skip silently.
      try {
        if (typeof extractAndStoreMemories === 'function') {
          var memoryResult = extractAndStoreMemories(session.sessionId, sessionObject);
          if (memoryResult && typeof memoryResult.catch === 'function') {
            memoryResult.catch(function () { /* fire-and-forget */ });
          }
        }
      } catch (_e) { /* never let memory handoff break close */ }
    } catch (_outerErr) {
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[FSB MCP Session Recorder] close failed:',
            _outerErr && _outerErr.message ? _outerErr.message : _outerErr);
        }
      } catch (_e) { /* ignore */ }
    }
  }

  // ---- recordDispatch (public surface) -------------------------------------

  /**
   * Record a single resolved MCP dispatch. Fire-and-forget: NEVER throws,
   * never returns a meaningful value, never alters the dispatcher's resolved
   * value or thrown error (threat T-q7id-02).
   *
   * Entry shape mirrors the metrics recorder hook exactly, plus an optional
   * resolved tab identity supplied by the bridge action tap:
   *   { client, tool, requestPayload, response, success, dispatcher_route,
   *     tabId? }
   *
   * @param {object} entry - The dispatch context from the dispatcher finally.
   */
  function recordDispatch(entry) {
    try {
      if (!entry || typeof entry !== 'object') return;
      var payload = (entry.requestPayload && typeof entry.requestPayload === 'object')
        ? entry.requestPayload
        : {};
      var agentId = payload.agentId;
      if (typeof agentId !== 'string' || agentId.length === 0) return;

      // run_task aliases to mcp:start-automation and the automation engine
      // already records that run -- recording it here would double sessions.
      if (entry.tool === 'run_task') return;

      var now = _now();
      _sweepExpired(now);

      var params = (payload.params && typeof payload.params === 'object') ? payload.params : {};
      var numericTabId = _resolveNumericTabId(entry, params);
      var sidecar = (payload.visualSession && typeof payload.visualSession === 'object')
        ? payload.visualSession
        : null;

      var session = null;
      var key = null;

      if (sidecar) {
        // Action tool call -- the sidecar exists ONLY on mutating action
        // tools. Look up (or birth) the session keyed agentId+tabId.
        key = agentId + '::' + _tabKeyPart(numericTabId);
        session = _openSessions.get(key) || null;
        if (!session) {
          var sessionId = _generateSessionId();
          var task = (typeof sidecar.visualReason === 'string' && sidecar.visualReason.length > 0)
            ? sidecar.visualReason
            : String(entry.tool);
          var client = (typeof sidecar.client === 'string' && sidecar.client.length > 0)
            ? sidecar.client
            : ((typeof entry.client === 'string' && entry.client.length > 0) ? entry.client : 'unknown');
          session = {
            key: key,
            sessionId: sessionId,
            agentId: agentId,
            tabId: numericTabId,
            task: task,
            client: client,
            startTime: now,
            lastActivityAt: now,
            deadlineAt: now + MCP_SESSION_IDLE_DEATH_MS,
            lastUrl: null,
            visualReasons: [],
            actionHistory: [],
            sawActionTool: false
          };
          _openSessions.set(key, session);
          // Seed session-bound logs so saveSession's empty-logs gate passes.
          var birthLogger = _getAutomationLogger();
          if (birthLogger && typeof birthLogger.logSessionStart === 'function') {
            try { birthLogger.logSessionStart(sessionId, task, numericTabId); } catch (_e) { /* best-effort */ }
          }
        }
        session.sawActionTool = true;
      } else {
        // Read-only tool route or message route -- JOIN the most recently
        // active open session for this agentId. No open session -> ignore
        // (this structurally enforces the >=1-action persistence gate:
        // read-only calls never birth sessions).
        session = _findMostRecentSessionForAgent(agentId);
        if (!session) return;
        key = session.key;
      }

      // Append the action in replay shape {tool, params, result, timestamp}.
      // storedTool applies the replay-name map; the guards below (navigate
      // lastUrl) keep matching on the raw wire verb.
      var storedTool = MCP_REPLAY_TOOL_NAME_MAP[entry.tool] || entry.tool;
      var redactedParams = redactParams(params);
      session.actionHistory.push({
        tool: storedTool,
        params: redactedParams,
        result: entry.response,
        timestamp: now
      });
      if (session.actionHistory.length > MCP_SESSION_ACTION_HISTORY_CAP) {
        session.actionHistory.splice(0, session.actionHistory.length - MCP_SESSION_ACTION_HISTORY_CAP);
      }

      // lastUrl feeds extractAndStoreMemories' domain fallback.
      if (entry.tool === 'navigate' && typeof params.url === 'string' && params.url.length > 0 && entry.success) {
        session.lastUrl = params.url;
      }

      if (sidecar && typeof sidecar.visualReason === 'string' && sidecar.visualReason.length > 0 &&
          session.visualReasons.indexOf(sidecar.visualReason) === -1) {
        session.visualReasons.push(sidecar.visualReason);
      }

      var logger = _getAutomationLogger();
      if (logger && typeof logger.logAction === 'function') {
        try {
          logger.logAction(session.sessionId, { tool: storedTool, params: redactedParams }, entry.response);
        } catch (_e) { /* best-effort */ }
      }

      // Sliding 60s idle window (mirrors mcp-visual-session-lifecycle
      // semantics): every recorded call re-arms the deadline.
      session.lastActivityAt = now;
      session.deadlineAt = now + MCP_SESSION_IDLE_DEATH_MS;

      // Tolerate both isFinal (wire spec) and snake_case is_final.
      var isFinal = sidecar !== null && (sidecar.isFinal === true || sidecar.is_final === true);
      if (isFinal) {
        // Close AFTER the append so the final action is part of the history.
        // closeSession persists the buffer update itself.
        closeSession(key, 'final');
      } else {
        _armIdleTimer(session);
        _persistOpenSessions();
      }
    } catch (_outerErr) {
      // Whole-body safety net -- never throw out of the recorder.
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[FSB MCP Session Recorder]',
            _outerErr && _outerErr.message ? _outerErr.message : _outerErr);
        }
      } catch (_e) { /* ignore */ }
    }
  }

  /**
   * Bridge-level action entry point (MCPBridgeClient._recordMcpSessionAction).
   * Thin adapter onto recordDispatch: same fire-and-forget contract, plus the
   * ownership-resolved tabId so session keying never depends on re-parsing
   * caller params.
   *
   * @param {object} input - { client, tool, params, payload, response,
   *   success, tabId }
   */
  function recordAction(input) {
    try {
      if (!input || typeof input !== 'object') return;
      recordDispatch({
        client: input.client,
        tool: input.tool,
        requestPayload: (input.payload && typeof input.payload === 'object')
          ? input.payload
          : { tool: input.tool, params: input.params || {}, agentId: input.agentId },
        response: input.response,
        success: input.success !== false,
        dispatcher_route: 'bridge-action',
        tabId: input.tabId
      });
    } catch (_e) { /* fire-and-forget */ }
  }

  // ---- Eviction restore -----------------------------------------------------

  /**
   * Rehydrate open sessions from the storage envelope. Sessions whose
   * deadline already passed close (and persist) immediately; live ones
   * re-arm for the remaining window. Fire-and-forget at module load;
   * exposed underscored so tests can drive the path deterministically.
   *
   * @returns {Promise<void>}
   */
  function _restoreFromBuffer() {
    return (async function () {
      try {
        var envelope = await _readBufferEnvelope();
        var records = envelope.records || {};
        var keys = Object.keys(records);
        if (keys.length === 0) return;
        var now = _now();
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var record = records[key];
          if (!record || typeof record !== 'object' || typeof record.sessionId !== 'string') continue;
          var session = {
            key: key,
            sessionId: record.sessionId,
            agentId: (typeof record.agentId === 'string') ? record.agentId : '',
            tabId: (typeof record.tabId === 'number' && isFinite(record.tabId)) ? record.tabId : null,
            task: (typeof record.task === 'string' && record.task.length > 0) ? record.task : 'MCP agent session',
            client: (typeof record.client === 'string' && record.client.length > 0) ? record.client : 'unknown',
            startTime: (typeof record.startTime === 'number') ? record.startTime : now,
            lastActivityAt: (typeof record.lastActivityAt === 'number') ? record.lastActivityAt : now,
            deadlineAt: (typeof record.deadlineAt === 'number') ? record.deadlineAt : 0,
            lastUrl: (typeof record.lastUrl === 'string') ? record.lastUrl : null,
            visualReasons: Array.isArray(record.visualReasons) ? record.visualReasons : [],
            actionHistory: Array.isArray(record.actionHistory) ? record.actionHistory : [],
            sawActionTool: record.sawActionTool === true
          };
          _openSessions.set(key, session);
          if (session.deadlineAt <= now) {
            closeSession(key, 'expired');
          } else {
            _armIdleTimer(session);
          }
        }
        // Sync the envelope with whatever survived the restore pass.
        _persistOpenSessions();
      } catch (_e) { /* best-effort */ }
    })();
  }

  // ---- Test seams -----------------------------------------------------------

  function _peekOpenSessions() {
    var out = {};
    _openSessions.forEach(function (session, key) {
      out[key] = _serializeRecord(session);
    });
    return out;
  }

  function _resetForTests() {
    _openSessions.forEach(function (_session, key) {
      _disarmIdleTimer(key);
    });
    _openSessions.clear();
    _idleTimers.clear();
    _lastGeneratedSessionTs = 0;
  }

  // ---- Registration ---------------------------------------------------------

  var _api = {
    recordDispatch: recordDispatch,
    recordAction: recordAction,
    redactParams: redactParams,
    FSB_MCP_SESSION_BUFFER_KEY: FSB_MCP_SESSION_BUFFER_KEY,
    MCP_SESSION_IDLE_DEATH_MS: MCP_SESSION_IDLE_DEATH_MS,
    _setStorageShim: _setStorageShim,
    _setTimeShim: _setTimeShim,
    _peekOpenSessions: _peekOpenSessions,
    _resetForTests: _resetForTests,
    _restoreFromBuffer: _restoreFromBuffer
  };

  // Service-worker classic-script surface (object-literal registration
  // mirroring mcp-metrics-recorder.js).
  globalThis.fsbMcpSessionRecorder = _api;

  // Node CommonJS surface for the test harness.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _api;
  }

  // Fire-and-forget eviction restore at module load. Async storage read
  // resolves AFTER the SW's synchronous startup script completes, so
  // automationLogger / createSession / extractAndStoreMemories globals are
  // all present by the time any expired session closes.
  try {
    var _restorePromise = _restoreFromBuffer();
    if (_restorePromise && typeof _restorePromise.catch === 'function') {
      _restorePromise.catch(function () { /* best-effort */ });
    }
  } catch (_e) { /* best-effort */ }
})();
