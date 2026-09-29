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
 *     read-only/message traffic JOINs an exact agentId+tabId session when a
 *     tab identity is supplied, with agent-only recency fallback otherwise.
 * Each recorded call folds one resolved MCP dispatch into an in-memory
 * open-session record keyed by the agent's current task. Tabs are child tracks
 * inside that record; the visualSession sidecar drives overlay presentation,
 * while complete_task / partial_task / fail_task close the logical recording.
 *
 * On close the assembled session flows through the DIRECT service-worker
 * automationLogger global -- NEVER chrome.runtime.sendMessage, which does
 * not loop back inside the SW -- for history/replay. Long-term memory is
 * created only when the MCP client later supplies a terminal summary through
 * complete_task / partial_task / fail_task; recorder close never invokes an
 * AI provider. createSession(overrides) remains the runtime schema factory,
 * with a manual same-keys object under bare Node.
 *
 * Persisted actionHistory remains as a compatibility view. A parallel
 * replayEntries timeline retains the sanitized wire invocation, route,
 * target, capability identity, result, and failure state used to build the
 * signed fsb-lattice-replay/v1 manifest. Params and results are cloned and
 * recursively redacted under secret-bearing keys;
 * text/value are additionally redacted when field metadata identifies a
 * sensitive target. Ordinary replay-critical url/selector/text values remain
 * exact. Users can disable future MCP recording and configure MCP-only
 * retention in Advanced Settings; the default retention window is 30 days.
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
 *     for the same agentId. Capability invocations are the deliberate
 *     exception and can birth a capability-only session.
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
  var FSB_MCP_MEMORY_CANDIDATES_KEY = 'fsbMcpMemoryCandidates';
  var FSB_MCP_MEMORY_CANDIDATES_VERSION = 1;
  var FSB_MCP_REDACTION_VERSION_KEY = 'fsbMcpRedactionVersion';
  var FSB_MCP_REDACTION_VERSION = 5;
  var FSB_MCP_SESSION_ALARM_PREFIX = 'fsbMcpSession:';
  var FSB_MCP_SESSION_IDLE_ALARM_PREFIX = FSB_MCP_SESSION_ALARM_PREFIX + 'idle:';
  var FSB_MCP_SESSION_RETENTION_ALARM = FSB_MCP_SESSION_ALARM_PREFIX + 'retention';
  var FSB_MCP_RECORDING_ENABLED_KEY = 'fsbMcpSessionRecordingEnabled';
  var FSB_MCP_RETENTION_DAYS_KEY = 'fsbMcpSessionRetentionDays';
  var FSB_MCP_RECORDER_BACKEND_KEY = 'fsbMcpRecorderBackend';
  var FSB_MCP_RECORDER_BACKEND_JOURNAL = 'journal-v2';
  var FSB_MCP_RECORDER_BACKEND_LEGACY = 'legacy-v1';
  var FSB_MCP_RETENTION_DEFAULT_DAYS = 30;
  var FSB_MCP_RETENTION_MIN_DAYS = 1;
  var FSB_MCP_RETENTION_MAX_DAYS = 365;
  var FSB_MCP_RETENTION_ALARM_PERIOD_MINUTES = 24 * 60;
  var MCP_MEMORY_CANDIDATE_TTL_MS = 5 * 60 * 1000;
  var MCP_MEMORY_CANDIDATE_CAP = 50;

  // Mirrors MCP_VISUAL_LIFECYCLE_DEATH_MS
  // (extension/utils/mcp-visual-session-lifecycle.js:79) -- a sliding 60s
  // idle window re-armed on every recorded dispatch. The recorder owns a
  // separate chrome.alarms namespace so expiry wakes an evicted MV3 worker.
  var MCP_SESSION_IDLE_DEATH_MS = 60000;

  // In-memory actionHistory cap -- matches the saveSession persistence cap
  // (automation-logger.js slice(-100)) so memory cannot grow unbounded on a
  // long-lived agent session.
  var MCP_SESSION_ACTION_HISTORY_CAP = 100;
  var MCP_SESSION_REPLAY_ENTRY_CAP = 100;

  // Results from read routes retain their full redacted value in the v2
  // journal. Action routes retain a compact acknowledgement projection; this
  // prevents a write response that happens to carry a page snapshot from
  // becoming a second multi-megabyte recording payload.
  var JOURNAL_FULL_RESULT_TOOLS = Object.freeze({
    read_page: 1, 'mcp:read-page': 1, get_text: 1, getText: 1,
    get_attribute: 1, getAttribute: 1, get_dom_snapshot: 1, 'mcp:get-dom': 1,
    get_page_snapshot: 1, 'mcp:get-page-snapshot': 1,
    wait_for_stable: 1, waitForDOMStable: 1,
    wait_for_element: 1, waitForElement: 1,
    list_tabs: 1, 'mcp:get-tabs': 1, read_sheet: 1, readsheet: 1,
    get_site_guide: 1, 'mcp:get-site-guides': 1,
    search_memory: 1, 'mcp:search-memory': 1,
    search_capabilities: 1, 'mcp:capabilities-search': 1,
    get_trigger_status: 1, 'mcp:get-trigger-status': 1,
    list_triggers: 1, 'mcp:list-triggers': 1,
    get_task_status: 1, 'mcp:get-status': 1,
    list_sessions: 1, 'mcp:list-sessions': 1,
    get_session_detail: 1, get_session_replay: 1,
    get_logs: 1, get_memory_stats: 1,
    'mcp:get-session': 1, 'mcp:get-session-replay': 1,
    'mcp:get-logs': 1, 'mcp:get-memory': 1, 'mcp:get-diagnostics': 1
  });
  var JOURNAL_ACTION_RESULT_FIELDS = Object.freeze([
    'success', 'status', 'error', 'errorCode', 'code', 'message',
    'url', 'resultingUrl', 'tabId', 'title', 'domain', 'id',
    'receipt', 'receiptCid', 'signerKid', 'manifestHash',
    'clicked', 'changed', 'alreadyClosed', 'recovered', 'shape',
    'updatedRows', 'updatedColumns', 'updatedCells', 'updatedSheets'
  ]);
  var JOURNAL_RESULT_PROJECTION_ACTION = 'journal-action-v1';
  var JOURNAL_RESULT_PROJECTION_FULL = 'journal-full-v1';
  var JOURNAL_TASK_SOURCE_TOOL = 'tool';
  var JOURNAL_TASK_SOURCE_CAPABILITY = 'capability';
  var JOURNAL_TASK_SOURCE_VISUAL = 'visual-session';

  // Values under these keys are never useful for replay and must not enter
  // the buffer, history, raw logs, or long-term memory.
  var SENSITIVE_KEY_PATTERN = /pass(word)?|secret|token|credential|api[-_ ]?key|authorization|cookie|session[-_ ]?id|private[-_ ]?key/i;
  // Generic text/value params and content-action result echoes remain
  // replayable unless their surrounding target metadata identifies a
  // credential or payment-secret field.
  var SENSITIVE_TARGET_PATTERN = /pass(word)?|secret|token|credential|api[-_ ]?key|authorization|auth[-_ ]?code|one[-_ ]?time|otp|cvv|cvc|(?:^|[^a-z0-9])cc[-_ ]?(?:number|csc|cvc|cvv)(?:$|[^a-z0-9])|card[-_ ]?(number|no)|security[-_ ]?code/i;
  // PIN needs token semantics: a bare alternation would also match ordinary
  // targets such as "shipping", "shopping", and "opinion". Camel-case and
  // acronym boundaries are split before applying non-letter boundaries so
  // paymentPin/PINCode remain sensitive alongside pin, pin_code, and pin-code.
  var SENSITIVE_PIN_TOKEN_PATTERN = /(?:^|[^a-z])pin(?:$|[^a-z])/i;
  var SENSITIVE_TARGET_METADATA_KEY_PATTERN = /selector|field|name|input|target|autocomplete|type|label|placeholder|element/i;
  var SENSITIVE_TEXT_KEY_PATTERN = /^(text|value|typed|actualValue|expectedValue|finalTextContent|previousValue)$/i;
  var REDACTED_VALUE = '[REDACTED]';
  var SENSITIVE_URL_PARAM_NAMES = Object.freeze({
    code: 1,
    auth: 1,
    key: 1,
    signature: 1,
    sig: 1,
    sign: 1,
    hash: 1,
    hmac: 1,
    jwt: 1,
    policy: 1,
    session: 1,
    sid: 1,
    awsaccesskeyid: 1,
    'key-pair-id': 1,
    googleaccessid: 1
  });
  var SENSITIVE_URL_PARAM_PREFIXES = ['x-amz-', 'x-goog-'];
  var AZURE_SAS_PARAM_NAMES = Object.freeze({
    sig: 1, se: 1, sp: 1, sv: 1, sr: 1, st: 1, skoid: 1, sktid: 1,
    skt: 1, ske: 1, sks: 1, skv: 1, spr: 1, sip: 1, ss: 1, srt: 1
  });
  // Keep this deliberately narrow and aligned with network-capture-redactor.js:
  // recognizable credential prefixes are safe to mask without treating ordinary
  // long slugs or IDs as secrets.
  var URL_TOKEN_SHAPES = [
    /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/,
    /^(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/,
    /^gh[opsur]_[A-Za-z0-9]{20,}/,
    /^xox[bcpars]-[A-Za-z0-9-]{8,}/,
    /^(AKIA|ASIA)[A-Z0-9]{16}/,
    /^ya29\.[A-Za-z0-9_-]+/,
    /^u![A-Za-z0-9_-]+/
  ];

  // Wire-verb -> actionHistory compatibility names. The signed manifest uses
  // replayEntries and therefore keeps the original wire verb unchanged.
  var MCP_REPLAY_TOOL_NAME_MAP = Object.freeze({
    go_back: 'goBack',
    go_forward: 'goForward'
  });

  // ---- In-memory state ----------------------------------------------------

  // key = the first agentId::tabKey observed for a task. Later tabs join the
  // same value and are represented by stable logical tab names on replay steps.
  var _openSessions = new Map();
  // key = source session id; value = safe, short-lived correlation metadata.
  var _memoryCandidates = new Map();
  // Monotonic guard for the autopilot-format session id (session_<ms>):
  // same-ms births within THIS recorder get last+1. Cross-engine same-ms
  // collision accepted per locked design.
  var _lastGeneratedSessionTs = 0;
  var _recordingEnabled = true;
  var _retentionDays = FSB_MCP_RETENTION_DEFAULT_DAYS;
  var _recorderBackend = FSB_MCP_RECORDER_BACKEND_JOURNAL;
  var _initializationPromise = Promise.resolve();
  var _recordQueue = Promise.resolve();

  // ---- Test seams (mirroring mcp-metrics-recorder.js) ---------------------

  var _storageShim = null;
  var _localStorageShim = null;
  var _alarmShim = null;
  var _timeShim = null;

  function _setStorageShim(shim) {
    _storageShim = shim;
  }

  function _setLocalStorageShim(shim) {
    _localStorageShim = shim;
  }

  function _setAlarmShim(shim) {
    _alarmShim = shim;
  }

  // shim = { now }. Pass null to restore real time.
  function _setTimeShim(shim) {
    _timeShim = shim || null;
  }

  function _now() {
    if (_timeShim && typeof _timeShim.now === 'function') return _timeShim.now();
    return Date.now();
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

  function _resolveLocalStorage() {
    if (_localStorageShim) return _localStorageShim;
    var c = _getChrome();
    if (c && c.storage && c.storage.local) return c.storage.local;
    return null;
  }

  function _resolveAlarms() {
    if (_alarmShim) return _alarmShim;
    var c = _getChrome();
    if (c && c.alarms) return c.alarms;
    return null;
  }

  function _getAutomationLogger() {
    return (typeof globalThis !== 'undefined' && globalThis.automationLogger) ? globalThis.automationLogger : null;
  }

  function _getJournal() {
    return (typeof globalThis !== 'undefined' && globalThis.FsbMcpLatticeJournal)
      ? globalThis.FsbMcpLatticeJournal
      : null;
  }

  // ---- Replay-value cloning + redaction ------------------------------------

  // Clone through the same JSON-compatible boundary chrome.storage uses.
  function cloneReplayValue(value, fallback) {
    var clone;
    try {
      clone = JSON.parse(JSON.stringify(value === undefined ? null : value));
    } catch (_e) {
      return fallback;
    }
    if (clone === null && fallback !== null) return fallback;
    return clone;
  }

  function _keyLooksUrlLike(key) {
    if (typeof key !== 'string') return false;
    return /^(url|uri|href)$/i.test(key) ||
      /(?:Url|URL|Uri|URI|Href|HREF)$/.test(key) ||
      /(?:^|[_-])(?:url|uri|href)$/i.test(key);
  }

  function _urlValueLooksTokenShaped(value) {
    if (typeof value !== 'string' || value.length === 0) return false;
    var candidate = value;
    try { candidate = decodeURIComponent(value); } catch (_e) { /* use the raw value */ }
    for (var i = 0; i < URL_TOKEN_SHAPES.length; i++) {
      if (URL_TOKEN_SHAPES[i].test(candidate)) return true;
    }
    return false;
  }

  function _isSensitiveUrlParamName(name) {
    if (typeof name !== 'string' || name.length === 0) return false;
    var lower = name.toLowerCase();
    if (SENSITIVE_KEY_PATTERN.test(lower) || SENSITIVE_URL_PARAM_NAMES[lower] === 1) return true;
    for (var i = 0; i < SENSITIVE_URL_PARAM_PREFIXES.length; i++) {
      if (lower.indexOf(SENSITIVE_URL_PARAM_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function _sensitiveUrlQueryKeys(searchParams) {
    var entries = [];
    searchParams.forEach(function (value, key) {
      entries.push({ key: key, lowerKey: String(key).toLowerCase(), value: value });
    });
    var hasAzureSignature = entries.some(function (entry) { return entry.lowerKey === 'sig'; });
    var keys = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (_isSensitiveUrlParamName(entry.key) ||
          _urlValueLooksTokenShaped(entry.value) ||
          (hasAzureSignature && AZURE_SAS_PARAM_NAMES[entry.lowerKey] === 1)) {
        keys.push(entry.key);
      }
    }
    return keys;
  }

  function _fragmentLooksSensitive(hash) {
    if (typeof hash !== 'string' || hash.length < 2) return false;
    var body = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    var decoded = body;
    try { decoded = decodeURIComponent(body); } catch (_e) { /* use the raw fragment */ }
    var candidates = decoded === body ? [body] : [body, decoded];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      var segments = candidate.split(/[\/?#&=]/);
      for (var s = 0; s < segments.length; s++) {
        if (_urlValueLooksTokenShaped(segments[s])) return true;
      }
      var queryCandidates = [candidate];
      var queryIndex = candidate.indexOf('?');
      if (queryIndex !== -1) queryCandidates.push(candidate.slice(queryIndex + 1));
      for (var q = 0; q < queryCandidates.length; q++) {
        if (queryCandidates[q].indexOf('=') === -1) continue;
        try {
          if (_sensitiveUrlQueryKeys(new URLSearchParams(queryCandidates[q])).length > 0) return true;
        } catch (_e2) { /* keep inspecting other fragment forms */ }
      }
    }
    return false;
  }

  function _sanitizeUrlForPersistence(url) {
    if (typeof url !== 'string' || url.length === 0) return null;
    var parsed;
    try {
      parsed = new URL(url);
    } catch (_e) {
      return null;
    }

    var changed = false;
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      changed = true;
    }

    var sensitiveQueryKeys = _sensitiveUrlQueryKeys(parsed.searchParams);
    for (var i = 0; i < sensitiveQueryKeys.length; i++) {
      parsed.searchParams.delete(sensitiveQueryKeys[i]);
      changed = true;
    }

    if (_fragmentLooksSensitive(parsed.hash)) {
      parsed.hash = '';
      changed = true;
    }

    var pathSegments = parsed.pathname.split('/');
    for (var p = 0; p < pathSegments.length; p++) {
      if (_urlValueLooksTokenShaped(pathSegments[p])) {
        pathSegments[p] = ':token';
        changed = true;
      }
    }
    if (changed) parsed.pathname = pathSegments.join('/');

    // Preserve benign URLs byte-for-byte. URL#toString is used only after a
    // redaction, where normalization cannot reduce replay fidelity further than
    // removal of the credential itself already does.
    return changed ? parsed.toString() : url;
  }

  function _targetMetadataLooksSensitive(value) {
    if (SENSITIVE_TARGET_PATTERN.test(value)) return true;
    var tokenized = value
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return SENSITIVE_PIN_TOKEN_PATTERN.test(tokenized);
  }

  function _targetLooksSensitive(node, depth) {
    if (!node || typeof node !== 'object' || depth > 6) return false;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        if (_targetLooksSensitive(node[i], depth + 1)) return true;
      }
      return false;
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var value = node[key];
      if (SENSITIVE_KEY_PATTERN.test(key)) return true;
      if (SENSITIVE_TARGET_METADATA_KEY_PATTERN.test(key) &&
          typeof value === 'string' && _targetMetadataLooksSensitive(value)) {
        return true;
      }
      if (value && typeof value === 'object' && _targetLooksSensitive(value, depth + 1)) return true;
    }
    return false;
  }

  function _redactSensitiveValuesInPlace(node, sensitiveTarget) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        _redactSensitiveValuesInPlace(node[i], sensitiveTarget);
      }
      return;
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (SENSITIVE_KEY_PATTERN.test(key) || (sensitiveTarget && SENSITIVE_TEXT_KEY_PATTERN.test(key))) {
        node[key] = REDACTED_VALUE;
      } else if (_keyLooksUrlLike(key) && typeof node[key] === 'string') {
        node[key] = _sanitizeUrlForPersistence(node[key]) || REDACTED_VALUE;
      } else {
        _redactSensitiveValuesInPlace(node[key], sensitiveTarget);
      }
    }
  }

  function _sanitizeReplayValue(value, fallback, sensitiveTarget) {
    var clone = cloneReplayValue(value, fallback);
    if (clone && typeof clone === 'object') {
      _redactSensitiveValuesInPlace(clone, sensitiveTarget === true);
    }
    return clone;
  }

  function cloneParamsForReplay(params) {
    // Internal callers may supply a response as arguments[1] so opaque element
    // references can inherit credential metadata without changing this exported
    // helper's one-argument API shape.
    var result = arguments.length > 1 ? arguments[1] : null;
    var sensitiveTarget = _targetLooksSensitive(params, 0) || _targetLooksSensitive(result, 0);
    var clone = _sanitizeReplayValue(params, {}, sensitiveTarget);
    return (clone && typeof clone === 'object' && !Array.isArray(clone)) ? clone : {};
  }

  function cloneResultForReplay(result, params) {
    var sensitiveTarget = _targetLooksSensitive(params, 0) || _targetLooksSensitive(result, 0);
    var clone = _sanitizeReplayValue(result, {}, sensitiveTarget);
    _sanitizeReplaySummaryFieldsInPlace(clone, 0);
    return clone;
  }

  function _sanitizeReplaySummaryFieldsInPlace(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach(function (item) { _sanitizeReplaySummaryFieldsInPlace(item, depth + 1); });
      return;
    }
    Object.keys(node).forEach(function (key) {
      if (typeof node[key] === 'string' &&
          /^(?:error|message|summary|reason|blocker|nextStep|description|detail)$/i.test(key)) {
        node[key] = _sanitizeSummaryText(node[key], 5000);
      } else if (node[key] && typeof node[key] === 'object') {
        _sanitizeReplaySummaryFieldsInPlace(node[key], depth + 1);
      }
    });
  }

  function _sanitizeActionHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-MCP_SESSION_ACTION_HISTORY_CAP).map(function (entry) {
      var item = (entry && typeof entry === 'object') ? entry : {};
      return {
        tool: typeof item.tool === 'string' ? item.tool : '',
        params: cloneParamsForReplay(item.params, item.result),
        result: cloneResultForReplay(item.result, item.params),
        timestamp: typeof item.timestamp === 'number' ? item.timestamp : null,
        logicalTab: typeof item.logicalTab === 'string' ? item.logicalTab : 'primary'
      };
    });
  }

  function _sanitizeReplayContext(context) {
    if (!context || typeof context !== 'object') return {};
    var clone = _sanitizeReplayValue(context, {}, false);
    if (!clone || typeof clone !== 'object' || Array.isArray(clone)) clone = {};
    if (typeof clone.targetUrl === 'string') {
      clone.targetUrl = _sanitizeUrlForPersistence(clone.targetUrl);
    }
    if (typeof clone.targetOrigin === 'string') {
      try {
        var originUrl = new URL(clone.targetOrigin);
        clone.targetOrigin = (originUrl.protocol === 'http:' || originUrl.protocol === 'https:')
          ? originUrl.origin
          : null;
      } catch (_e) {
        clone.targetOrigin = null;
      }
    }
    return clone;
  }

  function _sanitizeReplayEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.slice(-MCP_SESSION_REPLAY_ENTRY_CAP).map(function (entry) {
      var item = entry && typeof entry === 'object' ? entry : {};
      var payload = _sanitizeRequestPayload(item.requestPayload || {}, item.response);
      var safeContext = _sanitizeReplayContext(item.replayContext);
      var rawTargetUrl = item.replayContext && typeof item.replayContext.targetUrl === 'string'
        ? item.replayContext.targetUrl
        : null;
      return {
        tool: typeof item.tool === 'string' ? item.tool : '',
        requestPayload: payload,
        response: cloneResultForReplay(item.response, payload.params),
        success: item.success !== false,
        dispatcher_route: typeof item.dispatcher_route === 'string' ? item.dispatcher_route : 'unknown',
        timestamp: typeof item.timestamp === 'number' ? item.timestamp : null,
        replayContext: safeContext,
        redactedInputs: item.redactedInputs === true ||
          _replayInputWasRedacted(item.tool, item.requestPayload || {}, payload),
        targetRedacted: item.targetRedacted === true ||
          (rawTargetUrl !== null && safeContext.targetUrl !== rawTargetUrl)
      };
    });
  }

  function _sanitizePersistedReplayRecord(replay) {
    if (!replay || typeof replay !== 'object') return replay;
    var sanitized = cloneReplayValue(replay, null);
    if (!sanitized || !sanitized.manifest || !Array.isArray(sanitized.manifest.steps)) return sanitized;
    var originalManifest = JSON.stringify(sanitized.manifest);
    sanitized.manifest.provenance = sanitized.provenance === 'legacy-import' ? 'legacy-import' : 'capture';
    var originalStartUrl = sanitized.manifest.startUrl;
    var safeStartUrl = _sanitizeUrlForPersistence(originalStartUrl);
    if (typeof originalStartUrl === 'string') sanitized.manifest.startUrl = safeStartUrl;
    var startRedacted = sanitized.manifest.startUrlState === 'redacted' ||
      (typeof originalStartUrl === 'string' && originalStartUrl !== safeStartUrl);
    var startMissing = typeof safeStartUrl !== 'string' || !/^https?:\/\//i.test(safeStartUrl);
    var tabStartStates = Object.create(null);

    if (Array.isArray(sanitized.manifest.tabs)) {
      sanitized.manifest.tabs = sanitized.manifest.tabs.map(function (tab, index) {
        if (!tab || typeof tab !== 'object') return tab;
        var logicalTab = typeof tab.id === 'string' && tab.id ? tab.id : (index === 0 ? 'primary' : 'tab-' + String(index + 1));
        var originalTabStartUrl = tab.startUrl;
        var safeTabStartUrl = _sanitizeUrlForPersistence(originalTabStartUrl);
        var tabStartRedacted = tab.startUrlState === 'redacted' ||
          (typeof originalTabStartUrl === 'string' && originalTabStartUrl !== safeTabStartUrl);
        var tabStartMissing = typeof safeTabStartUrl !== 'string' || !/^https?:\/\//i.test(safeTabStartUrl);
        tab.id = logicalTab;
        if (typeof originalTabStartUrl === 'string') tab.startUrl = safeTabStartUrl;
        tab.startOrigin = safeTabStartUrl ? (function () {
          try { return new URL(safeTabStartUrl).origin; } catch (_error) { return null; }
        })() : null;
        tab.startUrlState = tabStartRedacted ? 'redacted' : (tabStartMissing ? 'missing' : 'ready');
        tabStartStates[logicalTab] = tab.startUrlState;
        return tab;
      });
    }
    if (!tabStartStates.primary) {
      tabStartStates.primary = startRedacted ? 'redacted' : (startMissing ? 'missing' : 'ready');
    }

    sanitized.manifest.steps = sanitized.manifest.steps.map(function (step) {
      if (!step || typeof step !== 'object') return step;
      var originalArguments = step.arguments && typeof step.arguments === 'object' ? step.arguments : {};
      var safeArguments = cloneParamsForReplay(originalArguments, step.result);
      var argumentsRedacted = _containsRedactedReplayValue(safeArguments) ||
        _differsAtSourcePaths(originalArguments, safeArguments);
      step.arguments = safeArguments;
      if (Object.prototype.hasOwnProperty.call(step, 'result')) {
        step.result = cloneResultForReplay(step.result, originalArguments);
      }
      if (step.target && typeof step.target === 'object' && typeof step.target.url === 'string') {
        var originalTargetUrl = step.target.url;
        step.target.url = _sanitizeUrlForPersistence(originalTargetUrl);
        if (step.target.url !== originalTargetUrl) step.target.redacted = true;
      }
      var logicalTab = typeof step.target?.logicalTab === 'string' ? step.target.logicalTab : 'primary';
      var tabStartState = tabStartStates[logicalTab] || 'missing';
      var tabStartRedacted = tabStartState === 'redacted';
      var tabStartMissing = tabStartState === 'missing';
      if (argumentsRedacted || step.target?.redacted === true || tabStartRedacted || tabStartMissing) {
        var availability = step.replay && step.replay.availability;
        if (availability === 'ready' || availability === 'approval-once' || availability === 'approval-per-step') {
          step.inputState = 'redacted';
          step.replay = {
            risk: 'inspect-only',
            availability: 'needs-input',
            reason: tabStartRedacted
              ? 'This tab\'s recorded starting URL contained sensitive input that was redacted'
              : (tabStartMissing
                ? 'This tab does not contain a safe HTTP(S) starting URL'
                : 'Sensitive input was redacted')
          };
        }
      }
      return step;
    });
    sanitized.manifest.startOrigin = safeStartUrl ? (function () {
      try { return new URL(safeStartUrl).origin; } catch (_error) { return null; }
    })() : null;
    sanitized.manifest.startUrlState = startRedacted ? 'redacted' :
      (startMissing ? 'missing' : 'ready');

    if (JSON.stringify(sanitized.manifest) !== originalManifest) {
      sanitized.integrity = 'pending';
      sanitized.manifestHash = null;
      sanitized.receipt = null;
      sanitized.receiptCid = null;
      sanitized.signerKid = null;
      sanitized.lastRun = null;
      sanitized.error = null;
      if (globalThis.FsbLatticeReplay && typeof globalThis.FsbLatticeReplay.replayCounts === 'function') {
        sanitized.counts = globalThis.FsbLatticeReplay.replayCounts(sanitized.manifest.steps);
      }
    }
    return sanitized;
  }

  function _sanitizeRequestPayload(payload, result) {
    var clone = _sanitizeReplayValue(payload, {}, false);
    if (!clone || typeof clone !== 'object' || Array.isArray(clone)) clone = {};
    var sourceParams = payload && typeof payload.params === 'object' ? payload.params : {};
    clone.params = cloneParamsForReplay(sourceParams, result);
    return clone;
  }

  function _containsRedactedReplayValue(value) {
    if (value === REDACTED_VALUE) return true;
    if (Array.isArray(value)) return value.some(_containsRedactedReplayValue);
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some(function (key) {
      return _containsRedactedReplayValue(value[key]);
    });
  }

  function _replayInvocationPayload(tool, payload) {
    var source = cloneReplayValue(payload, {});
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    if (tool === 'mcp:capabilities-invoke' || tool === 'invoke_capability') {
      var capability = {
        slug: typeof source.slug === 'string' ? source.slug : null,
        params: source.params && typeof source.params === 'object' ? source.params : {}
      };
      if (typeof source.origin === 'string') capability.origin = source.origin;
      return capability;
    }
    if (typeof tool === 'string' && tool.indexOf('mcp:') === 0) {
      [
        'agentId', 'agent_id', 'ownershipToken', 'ownership_token',
        'connectionId', 'connection_id', 'visualSession', 'client'
      ].forEach(function (key) { delete source[key]; });
      return source;
    }
    return source.params && typeof source.params === 'object' ? source.params : {};
  }

  function _differsAtSourcePaths(source, sanitized) {
    if (source === sanitized) return false;
    if (source === null || sanitized === null || typeof source !== typeof sanitized) return true;
    if (Array.isArray(source)) {
      if (!Array.isArray(sanitized) || source.length !== sanitized.length) return true;
      return source.some(function (item, index) {
        return _differsAtSourcePaths(item, sanitized[index]);
      });
    }
    if (source && typeof source === 'object') {
      if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return true;
      return Object.keys(source).some(function (key) {
        return !Object.prototype.hasOwnProperty.call(sanitized, key) ||
          _differsAtSourcePaths(source[key], sanitized[key]);
      });
    }
    return source !== sanitized;
  }

  function _replayInputWasRedacted(tool, rawPayload, sanitizedPayload) {
    var source = _replayInvocationPayload(tool, rawPayload);
    var sanitized = _replayInvocationPayload(tool, sanitizedPayload);
    return _containsRedactedReplayValue(sanitized) || _differsAtSourcePaths(source, sanitized);
  }

  function _countCharacter(value, character) {
    var count = 0;
    for (var i = 0; i < value.length; i++) {
      if (value.charAt(i) === character) count++;
    }
    return count;
  }

  function _splitTrailingSummaryPunctuation(value) {
    var core = value;
    var suffix = '';
    var openingByClosing = { ')': '(', ']': '[', '}': '{' };
    while (core) {
      var tail = core.charAt(core.length - 1);
      var strip = /[.,;:!?]/.test(tail);
      if (!strip && openingByClosing[tail]) {
        strip = _countCharacter(core, tail) > _countCharacter(core, openingByClosing[tail]);
      }
      if (!strip) break;
      suffix = tail + suffix;
      core = core.slice(0, -1);
    }
    return { core: core, suffix: suffix };
  }

  function _sanitizeEmbeddedSummaryUrls(text) {
    return text.replace(/\bhttps?:\/\/[^\s<>"']+/gi, function (candidate) {
      var parts = _splitTrailingSummaryPunctuation(candidate);
      var sanitized = _sanitizeUrlForPersistence(parts.core);
      return sanitized ? sanitized + parts.suffix : candidate;
    });
  }

  function _sanitizeStandaloneSummaryTokens(text) {
    return text.replace(/[A-Za-z0-9][A-Za-z0-9._!~-]+/g, function (candidate) {
      var parts = _splitTrailingSummaryPunctuation(candidate);
      return _urlValueLooksTokenShaped(parts.core)
        ? REDACTED_VALUE + parts.suffix
        : candidate;
    });
  }

  function _sanitizeSummaryText(value, maxLength) {
    if (typeof value !== 'string') return '';
    var limit = maxLength || 2000;
    // Bound attacker-controlled work before parsing while retaining enough
    // lookahead to recognize a credential that crosses the public field cap.
    // The public cap is enforced only after URL normalization and redaction.
    var text = value.trim().slice(0, limit + 4096);
    text = text.replace(/\b(password|passwd|secret|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|authorization|credential|private[_ -]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, function (_match, label) {
      return label + ': ' + REDACTED_VALUE;
    });
    text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer ' + REDACTED_VALUE);
    text = _sanitizeEmbeddedSummaryUrls(text);
    text = _sanitizeStandaloneSummaryTokens(text);
    return text.slice(0, limit);
  }

  function _sanitizeSummaryTextList(values, maxLength) {
    if (!Array.isArray(values)) return [];
    return values.map(function (value) {
      return _sanitizeSummaryText(value, maxLength);
    }).filter(Boolean);
  }

  function _sanitizePersistedMcpSessionText(session) {
    if (!session || typeof session !== 'object') return session;
    session.task = _sanitizeSummaryText(session.task, 2000);
    if (Array.isArray(session.visualReasons)) {
      session.visualReasons = _sanitizeSummaryTextList(session.visualReasons, 2000);
    }

    var fieldLimits = {
      result: 2000,
      completionMessage: 5000,
      error: 1000,
      blocker: 1000,
      nextStep: 1000
    };
    Object.keys(fieldLimits).forEach(function (field) {
      if (typeof session[field] === 'string') {
        session[field] = _sanitizeSummaryText(session[field], fieldLimits[field]);
      }
    });

    var details = session.outcomeDetails;
    if (details && typeof details === 'object') {
      var detailLimits = {
        reason: 1000,
        summary: 2000,
        blocker: 1000,
        nextStep: 1000,
        result: 5000,
        error: 1000
      };
      Object.keys(detailLimits).forEach(function (field) {
        if (typeof details[field] === 'string') {
          details[field] = _sanitizeSummaryText(details[field], detailLimits[field]);
        }
      });
    }
    return session;
  }

  // ---- Recording policy + initialization queue ----------------------------

  function clampRetentionDays(value) {
    var days = (typeof value === 'number') ? value : parseInt(value, 10);
    if (!isFinite(days)) days = FSB_MCP_RETENTION_DEFAULT_DAYS;
    days = Math.floor(days);
    if (days < FSB_MCP_RETENTION_MIN_DAYS) return FSB_MCP_RETENTION_MIN_DAYS;
    if (days > FSB_MCP_RETENTION_MAX_DAYS) return FSB_MCP_RETENTION_MAX_DAYS;
    return days;
  }

  async function _loadRecordingPolicy() {
    var storage = _resolveLocalStorage();
    if (!storage || typeof storage.get !== 'function') {
      _recordingEnabled = true;
      _retentionDays = FSB_MCP_RETENTION_DEFAULT_DAYS;
      _recorderBackend = FSB_MCP_RECORDER_BACKEND_JOURNAL;
      return;
    }
    try {
      var stored = await storage.get([
        FSB_MCP_RECORDING_ENABLED_KEY,
        FSB_MCP_RETENTION_DAYS_KEY,
        FSB_MCP_RECORDER_BACKEND_KEY
      ]);
      _recordingEnabled = !stored || stored[FSB_MCP_RECORDING_ENABLED_KEY] !== false;
      _retentionDays = clampRetentionDays(stored && stored[FSB_MCP_RETENTION_DAYS_KEY]);
      _recorderBackend = stored && stored[FSB_MCP_RECORDER_BACKEND_KEY] === FSB_MCP_RECORDER_BACKEND_LEGACY
        ? FSB_MCP_RECORDER_BACKEND_LEGACY
        : FSB_MCP_RECORDER_BACKEND_JOURNAL;
    } catch (_e) {
      _recordingEnabled = true;
      _retentionDays = FSB_MCP_RETENTION_DEFAULT_DAYS;
      _recorderBackend = FSB_MCP_RECORDER_BACKEND_JOURNAL;
    }
  }

  function _snapshotEntry(entry) {
    var sourcePayload = (entry.requestPayload && typeof entry.requestPayload === 'object')
      ? entry.requestPayload
      : {};
    var sourceParams = (sourcePayload.params && typeof sourcePayload.params === 'object')
      ? sourcePayload.params
      : {};
    var sanitizedPayload = _sanitizeRequestPayload(sourcePayload, entry.response);
    var safeContext = _sanitizeReplayContext(entry.replayContext);
    var rawTargetUrl = entry.replayContext && typeof entry.replayContext.targetUrl === 'string'
      ? entry.replayContext.targetUrl
      : null;
    return {
      client: entry.client,
      tool: entry.tool,
      requestPayload: sanitizedPayload,
      response: cloneResultForReplay(entry.response, sourceParams),
      success: entry.success,
      dispatcher_route: entry.dispatcher_route,
      tabId: entry.tabId,
      replayContext: safeContext,
      redactedInputs: entry.redactedInputs === true ||
        _replayInputWasRedacted(entry.tool, sourcePayload, sanitizedPayload),
      targetRedacted: entry.targetRedacted === true ||
        (rawTargetUrl !== null && safeContext.targetUrl !== rawTargetUrl)
    };
  }

  function _journalUsesFullResult(entry) {
    if (JOURNAL_FULL_RESULT_TOOLS[entry && entry.tool] === 1) return true;
    var context = entry && entry.replayContext && typeof entry.replayContext === 'object'
      ? entry.replayContext
      : {};
    var sideEffectClass = typeof context.sideEffectClass === 'string'
      ? context.sideEffectClass.toLowerCase()
      : '';
    return sideEffectClass === 'read' || sideEffectClass === 'read-only' || sideEffectClass === 'readonly';
  }

  function _compactJournalActionResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return { success: result !== false };
    }
    var compact = {};
    for (var i = 0; i < JOURNAL_ACTION_RESULT_FIELDS.length; i++) {
      var key = JOURNAL_ACTION_RESULT_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(result, key)) compact[key] = result[key];
    }
    if (!Object.prototype.hasOwnProperty.call(compact, 'success')) {
      compact.success = result.success !== false;
    }
    return compact;
  }

  function projectJournalResult(result, params, projection) {
    var source = projection === JOURNAL_RESULT_PROJECTION_ACTION
      ? _compactJournalActionResult(result)
      : result;
    return cloneResultForReplay(source, params && typeof params === 'object' ? params : {});
  }

  // V2 snapshotting happens only after cheap retention checks. Request data is
  // cloned/redacted once; large read results remain complete while action
  // acknowledgements are projected before cloning.
  function _snapshotJournalEntry(entry) {
    var sourcePayload = entry && entry.requestPayload && typeof entry.requestPayload === 'object'
      ? entry.requestPayload
      : {};
    var sourceParams = sourcePayload.params && typeof sourcePayload.params === 'object'
      ? sourcePayload.params
      : {};
    var safePayload = _sanitizeRequestPayload(sourcePayload, entry && entry.response);
    var resultProjection = _journalUsesFullResult(entry)
      ? JOURNAL_RESULT_PROJECTION_FULL
      : JOURNAL_RESULT_PROJECTION_ACTION;
    var safeContext = _sanitizeReplayContext(entry && entry.replayContext);
    var rawTargetUrl = entry && entry.replayContext && typeof entry.replayContext.targetUrl === 'string'
      ? entry.replayContext.targetUrl
      : null;
    var sidecar = sourcePayload.visualSession && typeof sourcePayload.visualSession === 'object'
      ? sourcePayload.visualSession
      : null;
    var hasVisualTask = sidecar && typeof sidecar.visualReason === 'string' && sidecar.visualReason;
    var hasCapabilityTask = entry.tool === 'mcp:capabilities-invoke' && typeof sourcePayload.slug === 'string' && sourcePayload.slug;
    var task = hasVisualTask
      ? _sanitizeSummaryText(sidecar.visualReason, 2000)
      : (hasCapabilityTask
        ? 'Capability: ' + _sanitizeSummaryText(sourcePayload.slug, 500)
        : _sanitizeSummaryText(String(entry.tool || 'MCP agent session'), 2000));
    var taskSource = hasVisualTask
      ? JOURNAL_TASK_SOURCE_VISUAL
      : (hasCapabilityTask ? JOURNAL_TASK_SOURCE_CAPABILITY : JOURNAL_TASK_SOURCE_TOOL);
    return {
      agentId: typeof sourcePayload.agentId === 'string' ? sourcePayload.agentId : '',
      recordingRunId: typeof sourcePayload.recordingRunId === 'string' ? sourcePayload.recordingRunId : '',
      recordingCallId: typeof sourcePayload.recordingCallId === 'string' ? sourcePayload.recordingCallId : null,
      client: entry.client,
      task: task,
      taskSource: taskSource,
      tool: entry.tool,
      requestPayload: safePayload,
      response: projectJournalResult(entry.response, sourceParams, resultProjection),
      resultProjection: resultProjection,
      success: entry.success,
      dispatcher_route: entry.dispatcher_route,
      tabId: entry.tabId,
      replayContext: safeContext,
      redactedInputs: entry.redactedInputs === true ||
        _replayInputWasRedacted(entry.tool, sourcePayload, safePayload),
      targetRedacted: entry.targetRedacted === true ||
        (rawTargetUrl !== null && safeContext.targetUrl !== rawTargetUrl)
    };
  }

  function _legacyCanRetainRawEntry(entry) {
    if (!_recordingEnabled || !entry || typeof entry !== 'object' || entry.tool === 'run_task') return false;
    var payload = entry.requestPayload && typeof entry.requestPayload === 'object'
      ? entry.requestPayload
      : {};
    var agentId = payload.agentId;
    if (typeof agentId !== 'string' || !agentId) return false;
    var params = payload.params && typeof payload.params === 'object' ? payload.params : {};
    var tabId = _resolveNumericTabId(entry, params, payload);
    var sidecar = payload.visualSession && typeof payload.visualSession === 'object'
      ? payload.visualSession
      : null;
    var capabilityBirth = entry.tool === 'mcp:capabilities-invoke' && Number.isFinite(tabId);
    if (sidecar || capabilityBirth) return true;
    return !!(_findSessionForAgentTab(agentId, tabId) || _findMostRecentSessionForAgent(agentId));
  }

  function _enqueueRecorderMutation(fn) {
    var run = function () {
      return Promise.resolve(_initializationPromise).catch(function () { /* initialize fail-open */ }).then(fn);
    };
    var next = _recordQueue.then(run, run);
    _recordQueue = next.catch(function () { /* keep queue alive */ });
    return next;
  }

  function _closeAllOpenSessions(reason) {
    var keys = Array.from(_openSessions.keys());
    for (var i = 0; i < keys.length; i++) closeSession(keys[i], reason);
  }

  async function _requestRetentionPrune() {
    var logger = _getAutomationLogger();
    if (logger && typeof logger.pruneMcpSessions === 'function') {
      try { await logger.pruneMcpSessions(_retentionDays); } catch (_e) { /* best-effort */ }
    }
    var journal = _getJournal();
    if (journal && typeof journal.prune === 'function') {
      try { await journal.prune(_retentionDays); } catch (_e2) { /* best-effort */ }
    }
  }

  async function _applyRecordingPolicy(enabled, retentionDays, flushOnDisable, recorderBackend) {
    var wasEnabled = _recordingEnabled;
    _recordingEnabled = enabled !== false;
    _retentionDays = clampRetentionDays(retentionDays);
    if (recorderBackend === FSB_MCP_RECORDER_BACKEND_LEGACY || recorderBackend === FSB_MCP_RECORDER_BACKEND_JOURNAL) {
      _recorderBackend = recorderBackend;
    }
    if (flushOnDisable && wasEnabled && !_recordingEnabled) {
      _closeAllOpenSessions('recording_disabled');
      var journal = _getJournal();
      if (journal && typeof journal.degradeOpenRuns === 'function') {
        await journal.degradeOpenRuns('recording_disabled');
      }
    }
    _scheduleRetentionAlarm();
    await _requestRetentionPrune();
    if (typeof globalThis !== 'undefined' && globalThis.FsbLatticeReplay &&
        typeof globalThis.FsbLatticeReplay.resumePendingSeals === 'function') {
      globalThis.FsbLatticeReplay.resumePendingSeals().catch(function () { /* retry next wake */ });
    }
  }

  // ---- Open-session buffer persistence (eviction survival) ----------------

  // Serialized through a small promise-chain lock like _withRecordLock in
  // mcp-metrics-recorder.js so two persists cannot interleave their
  // read-modify-write cycles.
  var _persistLock = Promise.resolve();
  var _alarmLock = Promise.resolve();

  function _withPersistLock(fn) {
    var next = _persistLock.then(fn, fn);
    _persistLock = next.catch(function () { /* keep chain alive */ });
    return next;
  }

  function _withAlarmLock(fn) {
    var next = _alarmLock.then(fn, fn);
    _alarmLock = next.catch(function () { /* keep chain alive */ });
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
    if (!storage) return true;
    try {
      var nextRecords = (records && typeof records === 'object') ? records : {};
      if (Object.keys(nextRecords).length === 0) {
        // Remove the storage key when records is empty (mcp-task-store.js
        // pattern) -- no stale envelope sitting in storage forever.
        if (typeof storage.remove === 'function') {
          await storage.remove(FSB_MCP_SESSION_BUFFER_KEY);
        }
        return true;
      }
      if (typeof storage.set !== 'function') return false;
      var toWrite = {};
      toWrite[FSB_MCP_SESSION_BUFFER_KEY] = {
        v: FSB_MCP_SESSION_BUFFER_VERSION,
        records: nextRecords
      };
      await storage.set(toWrite);
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function _readMemoryCandidateEnvelope() {
    var storage = _resolveSessionStorage();
    if (!storage || typeof storage.get !== 'function') {
      return { v: FSB_MCP_MEMORY_CANDIDATES_VERSION, records: {} };
    }
    try {
      var stored = await storage.get([FSB_MCP_MEMORY_CANDIDATES_KEY]);
      var payload = stored ? stored[FSB_MCP_MEMORY_CANDIDATES_KEY] : null;
      if (!payload || payload.v !== FSB_MCP_MEMORY_CANDIDATES_VERSION ||
          !payload.records || typeof payload.records !== 'object') {
        return { v: FSB_MCP_MEMORY_CANDIDATES_VERSION, records: {} };
      }
      return payload;
    } catch (_e) {
      return { v: FSB_MCP_MEMORY_CANDIDATES_VERSION, records: {} };
    }
  }

  async function _writeMemoryCandidateEnvelope(records) {
    var storage = _resolveSessionStorage();
    if (!storage) return true;
    try {
      var nextRecords = (records && typeof records === 'object') ? records : {};
      if (Object.keys(nextRecords).length === 0) {
        if (typeof storage.remove === 'function') await storage.remove(FSB_MCP_MEMORY_CANDIDATES_KEY);
        return true;
      }
      if (typeof storage.set !== 'function') return false;
      var toWrite = {};
      toWrite[FSB_MCP_MEMORY_CANDIDATES_KEY] = {
        v: FSB_MCP_MEMORY_CANDIDATES_VERSION,
        records: nextRecords
      };
      await storage.set(toWrite);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function _serializeMemoryCandidate(candidate) {
    return {
      sessionId: candidate.sessionId,
      agentId: candidate.agentId,
      tabId: candidate.tabId,
      tabIds: Array.isArray(candidate.tabIds) ? candidate.tabIds.slice() : [],
      task: candidate.task,
      client: candidate.client,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      closedAt: candidate.closedAt,
      expiresAt: candidate.expiresAt,
      lastUrl: _sanitizeUrlForMemory(candidate.lastUrl),
      actionCount: candidate.actionCount,
      toolNames: Array.isArray(candidate.toolNames) ? candidate.toolNames.slice(-MCP_SESSION_ACTION_HISTORY_CAP) : []
    };
  }

  function _pruneMemoryCandidates(now) {
    var changed = false;
    _memoryCandidates.forEach(function (candidate, sessionId) {
      if (!candidate || candidate.expiresAt <= now) {
        _memoryCandidates.delete(sessionId);
        changed = true;
      }
    });
    if (_memoryCandidates.size > MCP_MEMORY_CANDIDATE_CAP) {
      var retained = Array.from(_memoryCandidates.values())
        .sort(function (a, b) { return b.closedAt - a.closedAt; })
        .slice(0, MCP_MEMORY_CANDIDATE_CAP);
      _memoryCandidates.clear();
      for (var i = 0; i < retained.length; i++) {
        _memoryCandidates.set(retained[i].sessionId, retained[i]);
      }
      changed = true;
    }
    return changed;
  }

  function _persistMemoryCandidates() {
    return _withPersistLock(async function () {
      _pruneMemoryCandidates(_now());
      var records = {};
      _memoryCandidates.forEach(function (candidate, sessionId) {
        records[sessionId] = _serializeMemoryCandidate(candidate);
      });
      await _writeMemoryCandidateEnvelope(records);
    });
  }

  function _sanitizeAutomationLogEntry(log) {
    var originalData = log && log.data && typeof log.data === 'object' ? log.data : {};
    // MCP session ids are generated internal correlation keys, not user
    // credentials. Keep this exact field so automationLogger can associate
    // raw rows with the session index during retention pruning; nested or
    // unrelated session-id-shaped fields remain covered by the redactor.
    var correlationSessionId = typeof originalData.sessionId === 'string' && originalData.sessionId
      ? originalData.sessionId
      : null;
    var clone = _sanitizeReplayValue(log, {}, false);
    if (!clone || typeof clone !== 'object') return {};
    var data = clone.data && typeof clone.data === 'object' ? clone.data : null;
    if (data && correlationSessionId) data.sessionId = correlationSessionId;
    if (data && typeof originalData.task === 'string') {
      data.task = _sanitizeSummaryText(originalData.task, 2000);
    }
    if (data && data.action && typeof data.action === 'object') {
      var originalAction = originalData.action && typeof originalData.action === 'object' ? originalData.action : {};
      data.action.params = cloneParamsForReplay(originalAction.params, originalData.result);
      data.result = cloneResultForReplay(originalData.result, originalAction.params);
    }
    return clone;
  }

  async function _scrubPersistedMcpData() {
    var bufferEnvelope = await _readBufferEnvelope();
    var bufferRecords = bufferEnvelope.records || {};
    var mcpSessionIds = new Set();
    Object.keys(bufferRecords).forEach(function (key) {
      var record = bufferRecords[key];
      if (record && typeof record === 'object') {
        if (typeof record.sessionId === 'string' && record.sessionId) mcpSessionIds.add(record.sessionId);
        record.task = _sanitizeSummaryText(record.task, 2000);
        record.visualReasons = _sanitizeSummaryTextList(record.visualReasons, 2000);
        record.lastUrl = _sanitizeUrlForPersistence(record.lastUrl);
        record.actionHistory = _sanitizeActionHistory(record.actionHistory);
        record.replayEntries = _sanitizeReplayEntries(record.replayEntries);
      }
    });
    var bufferScrubbed = await _writeBufferEnvelope(bufferRecords);

    var storage = _resolveLocalStorage();
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') return;
    var scrubLocalStorage = async function () {
      try {
        var stored = await storage.get([
          FSB_MCP_REDACTION_VERSION_KEY,
          'fsbSessionLogs',
          'fsbSessionIndex',
          'automationLogs'
        ]);
        if (Number(stored && stored[FSB_MCP_REDACTION_VERSION_KEY]) >= FSB_MCP_REDACTION_VERSION) return;

        var sessionLogs = stored && stored.fsbSessionLogs && typeof stored.fsbSessionLogs === 'object'
          ? stored.fsbSessionLogs
          : {};
        Object.keys(sessionLogs).forEach(function (sessionId) {
          var session = sessionLogs[sessionId];
          if (session && session.mode === 'mcp-agent') {
            mcpSessionIds.add(sessionId);
            _sanitizePersistedMcpSessionText(session);
            session.lastUrl = _sanitizeUrlForPersistence(session.lastUrl);
            session.actionHistory = _sanitizeActionHistory(session.actionHistory);
            session.replay = _sanitizePersistedReplayRecord(session.replay);
            if (Array.isArray(session.logs)) {
              session.logs = session.logs.map(_sanitizeAutomationLogEntry);
            }
          }
        });

        var sessionIndex = Array.isArray(stored && stored.fsbSessionIndex)
          ? stored.fsbSessionIndex
          : [];
        sessionIndex.forEach(function (entry) {
          if (entry && entry.mode === 'mcp-agent' && typeof entry.id === 'string' && entry.id) {
            mcpSessionIds.add(entry.id);
            _sanitizePersistedMcpSessionText(entry);
            var fullSession = sessionLogs[entry.id];
            if (fullSession && fullSession.replay) {
              entry.replayIntegrity = fullSession.replay.integrity || null;
              entry.replayProvenance = fullSession.replay.provenance || null;
              entry.replayableCount = fullSession.replay.counts?.executable || 0;
              entry.replayBlockedCount = fullSession.replay.counts?.blocked || 0;
            }
          }
        });

        var automationLogs = Array.isArray(stored && stored.automationLogs)
          ? stored.automationLogs.map(function (log) {
            var sessionId = log && log.data && log.data.sessionId;
            return mcpSessionIds.has(sessionId) ? _sanitizeAutomationLogEntry(log) : log;
          })
          : [];
        var next = {
          fsbSessionLogs: sessionLogs,
          fsbSessionIndex: sessionIndex,
          automationLogs: automationLogs
        };
        if (bufferScrubbed) next[FSB_MCP_REDACTION_VERSION_KEY] = FSB_MCP_REDACTION_VERSION;
        await storage.set(next);
      } catch (_e) {
        // Leave the version marker unset so the next worker startup retries.
      }
    };

    var logger = _getAutomationLogger();
    if (logger && typeof logger.withSessionMutationLock === 'function') {
      await logger.withSessionMutationLock(scrubLocalStorage);
    } else {
      await scrubLocalStorage();
    }
  }

  function _serializeRecord(session) {
    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      recordingRunId: typeof session.recordingRunId === 'string' ? session.recordingRunId : null,
      tabId: session.tabId,
      tabIds: Array.isArray(session.tabIds) ? session.tabIds.slice() : [],
      logicalTabs: cloneReplayValue(session.logicalTabs || {}, {}),
      task: _sanitizeSummaryText(session.task, 2000),
      client: session.client,
      startTime: session.startTime,
      lastActivityAt: session.lastActivityAt,
      deadlineAt: session.deadlineAt,
      lastUrl: _sanitizeUrlForPersistence(session.lastUrl),
      visualReasons: _sanitizeSummaryTextList(session.visualReasons, 2000),
      actionHistory: session.actionHistory.slice(),
      replayEntries: _sanitizeReplayEntries(session.replayEntries),
      startUrl: _sanitizeUrlForPersistence(session.startUrl),
      startUrlRedacted: session.startUrlRedacted === true,
      startOrigin: typeof session.startOrigin === 'string' ? session.startOrigin : null,
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
  // action tap wins; otherwise nested action params precede the top-level tab
  // fields used by direct read routes such as mcp:read-page / mcp:get-dom.
  function _resolveNumericTabId(entry, params, payload) {
    var explicit = _numericTabId(entry.tabId);
    if (explicit !== null) return explicit;
    var snake = _numericTabId(params.tab_id);
    if (snake !== null) return snake;
    var camel = _numericTabId(params.tabId);
    if (camel !== null) return camel;
    var topSnake = _numericTabId(payload && payload.tab_id);
    if (topSnake !== null) return topSnake;
    return _numericTabId(payload && payload.tabId);
  }

  function _sessionHasTab(session, numericTabId) {
    if (!session || numericTabId === null) return false;
    if (session.tabId === numericTabId) return true;
    return Array.isArray(session.tabIds) && session.tabIds.indexOf(numericTabId) !== -1;
  }

  function _findSessionForAgentTab(agentId, numericTabId) {
    if (numericTabId === null) return null;
    var direct = _openSessions.get(agentId + '::' + _tabKeyPart(numericTabId)) || null;
    if (direct) return direct;
    var found = null;
    _openSessions.forEach(function (session) {
      if (!found && session.agentId === agentId && _sessionHasTab(session, numericTabId)) found = session;
    });
    return found;
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

  function _findLegacySessionForCorrelation(agentId, recordingRunId) {
    if (typeof agentId !== 'string' || !agentId || typeof recordingRunId !== 'string' || !recordingRunId) return null;
    var found = null;
    _openSessions.forEach(function (session) {
      if (!found && session.agentId === agentId && session.recordingRunId === recordingRunId) found = session;
    });
    return found;
  }

  function _registerSessionTab(session, numericTabId) {
    if (!session) return 'primary';
    session.tabIds = Array.isArray(session.tabIds) ? session.tabIds : [];
    session.logicalTabs = session.logicalTabs && typeof session.logicalTabs === 'object'
      ? session.logicalTabs
      : {};
    if (numericTabId === null) {
      return session.tabId !== null && session.logicalTabs[String(session.tabId)]
        ? session.logicalTabs[String(session.tabId)]
        : 'primary';
    }
    var tabKey = String(numericTabId);
    if (typeof session.logicalTabs[tabKey] === 'string') return session.logicalTabs[tabKey];
    var tabIndex = session.tabIds.indexOf(numericTabId);
    if (tabIndex === -1) {
      session.tabIds.push(numericTabId);
      tabIndex = session.tabIds.length - 1;
    }
    var logicalTab = tabIndex === 0 ? 'primary' : 'tab-' + String(tabIndex + 1);
    session.logicalTabs[tabKey] = logicalTab;
    if (session.tabId === null) session.tabId = numericTabId;
    return logicalTab;
  }

  // ---- Client-authored memory correlation ---------------------------------

  function _buildMemoryCandidate(session, endTime) {
    var tabIds = [];
    var candidateTabIds = Array.isArray(session.tabIds) ? session.tabIds : [];
    for (var i = 0; i < candidateTabIds.length; i++) {
      var candidateTabId = _numericTabId(candidateTabIds[i]);
      if (candidateTabId !== null && tabIds.indexOf(candidateTabId) === -1) tabIds.push(candidateTabId);
    }
    var primaryTabId = _numericTabId(session.tabId);
    if (primaryTabId !== null && tabIds.indexOf(primaryTabId) === -1) tabIds.unshift(primaryTabId);
    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      tabId: primaryTabId,
      tabIds: tabIds,
      task: _sanitizeSummaryText(session.task, 2000),
      client: session.client,
      startTime: session.startTime,
      endTime: endTime,
      closedAt: endTime,
      expiresAt: endTime + MCP_MEMORY_CANDIDATE_TTL_MS,
      lastUrl: _sanitizeUrlForMemory(session.lastUrl),
      actionCount: session.actionHistory.length,
      toolNames: session.actionHistory.map(function (entry) { return String(entry && entry.tool || ''); }).filter(Boolean)
    };
  }

  function _registerMemoryCandidate(session, endTime) {
    var candidate = _buildMemoryCandidate(session, endTime);
    _memoryCandidates.set(candidate.sessionId, candidate);
    _pruneMemoryCandidates(endTime);
    _persistMemoryCandidates().catch(function () { /* best-effort */ });
    return candidate;
  }

  async function _restoreMemoryCandidates() {
    var envelope = await _readMemoryCandidateEnvelope();
    var records = envelope.records || {};
    var now = _now();
    _memoryCandidates.clear();
    Object.keys(records).forEach(function (sessionId) {
      var record = records[sessionId];
      if (!record || typeof record !== 'object' || typeof record.agentId !== 'string' ||
          typeof record.sessionId !== 'string' || !Number.isFinite(record.expiresAt) || record.expiresAt <= now) {
        return;
      }
      var restoredTabId = _numericTabId(record.tabId);
      var restoredTabIds = [];
      var recordTabIds = Array.isArray(record.tabIds) ? record.tabIds : [];
      for (var i = 0; i < recordTabIds.length; i++) {
        var recordTabId = _numericTabId(recordTabIds[i]);
        if (recordTabId !== null && restoredTabIds.indexOf(recordTabId) === -1) restoredTabIds.push(recordTabId);
      }
      if (restoredTabId !== null && restoredTabIds.indexOf(restoredTabId) === -1) {
        restoredTabIds.unshift(restoredTabId);
      }
      _memoryCandidates.set(record.sessionId, {
        sessionId: record.sessionId,
        agentId: record.agentId,
        tabId: restoredTabId,
        tabIds: restoredTabIds,
        task: typeof record.task === 'string' ? record.task : 'MCP agent session',
        client: typeof record.client === 'string' ? record.client : 'unknown',
        startTime: Number.isFinite(record.startTime) ? record.startTime : now,
        endTime: Number.isFinite(record.endTime) ? record.endTime : now,
        closedAt: Number.isFinite(record.closedAt) ? record.closedAt : now,
        expiresAt: record.expiresAt,
        lastUrl: _sanitizeUrlForMemory(record.lastUrl),
        actionCount: Number.isFinite(record.actionCount) ? Math.max(0, Math.floor(record.actionCount)) : 0,
        toolNames: Array.isArray(record.toolNames)
          ? record.toolNames.filter(function (name) { return typeof name === 'string'; }).slice(-MCP_SESSION_ACTION_HISTORY_CAP)
          : []
      });
    });
    _pruneMemoryCandidates(now);
    await _persistMemoryCandidates();
  }

  function _findOutcomeTarget(agentId, tabId) {
    var candidatesPruned = _pruneMemoryCandidates(_now());
    if (candidatesPruned) _persistMemoryCandidates().catch(function () { /* best-effort */ });

    if (tabId !== null) {
      var exactOpen = _findSessionForAgentTab(agentId, tabId);
      if (exactOpen) return { kind: 'open', value: exactOpen };
      var exactClosed = Array.from(_memoryCandidates.values())
        .filter(function (candidate) { return candidate.agentId === agentId && _sessionHasTab(candidate, tabId); })
        .sort(function (a, b) { return b.closedAt - a.closedAt; });
      return exactClosed.length > 0 ? { kind: 'closed', value: exactClosed[0] } : null;
    }

    var open = [];
    _openSessions.forEach(function (session) {
      if (session.agentId === agentId) open.push({ kind: 'open', value: session });
    });
    // A live logical run is authoritative even when older closed candidates
    // from this process remain inside their short memory-correlation window.
    if (open.length === 1) return open[0];
    if (open.length > 1) return null;
    var closed = [];
    _memoryCandidates.forEach(function (candidate) {
      if (candidate.agentId === agentId) closed.push({ kind: 'closed', value: candidate });
    });
    return closed.length === 1 ? closed[0] : null;
  }

  function _snapshotTaskOutcome(input) {
    var params = input && input.params && typeof input.params === 'object' ? input.params : {};
    var payload = input && input.payload && typeof input.payload === 'object' ? input.payload : {};
    return {
      tool: input && input.tool,
      agentId: typeof payload.agentId === 'string' ? payload.agentId : '',
      recordingRunId: typeof payload.recordingRunId === 'string' ? payload.recordingRunId : '',
      recordingCallId: typeof payload.recordingCallId === 'string' ? payload.recordingCallId : null,
      tabId: _numericTabId(params.tab_id) !== null ? _numericTabId(params.tab_id) : _numericTabId(params.tabId),
      summary: _sanitizeSummaryText(params.summary, 2000),
      blocker: _sanitizeSummaryText(params.blocker, 1000),
      nextStep: _sanitizeSummaryText(params.next_step || params.nextStep, 1000),
      reason: _sanitizeSummaryText(params.reason, 1000)
    };
  }

  function _normalizeTaskOutcome(snapshot) {
    if (!snapshot || !snapshot.agentId) return null;
    if (snapshot.tool === 'complete_task' && snapshot.summary) {
      return { tool: snapshot.tool, outcome: 'success', status: 'completed', text: snapshot.summary, summary: snapshot.summary };
    }
    if (snapshot.tool === 'partial_task' && snapshot.summary && snapshot.blocker) {
      var partialText = snapshot.summary + '\nBlocker: ' + snapshot.blocker;
      if (snapshot.nextStep) partialText += '\nNext step: ' + snapshot.nextStep;
      return {
        tool: snapshot.tool,
        outcome: 'partial',
        status: 'partial',
        text: partialText,
        summary: snapshot.summary,
        blocker: snapshot.blocker,
        nextStep: snapshot.nextStep,
        reason: snapshot.reason || 'blocked'
      };
    }
    if (snapshot.tool === 'fail_task' && snapshot.reason) {
      return {
        tool: snapshot.tool,
        outcome: 'failure',
        status: 'failed',
        text: snapshot.reason,
        reason: snapshot.reason,
        error: snapshot.reason
      };
    }
    return null;
  }

  function _lifecycleSessionFields(outcome) {
    if (!outcome || typeof outcome !== 'object') return {};
    return {
      status: outcome.status,
      outcome: outcome.outcome,
      outcomeDetails: {
        outcome: outcome.outcome,
        reason: outcome.reason || (outcome.outcome === 'failure' ? 'error' : 'completed'),
        summary: outcome.summary || null,
        blocker: outcome.blocker || null,
        nextStep: outcome.nextStep || null,
        result: outcome.outcome === 'failure' ? null : outcome.text,
        error: outcome.error || null
      },
      result: outcome.summary || null,
      completionMessage: outcome.outcome === 'failure' ? null : outcome.text,
      error: outcome.error || null,
      blocker: outcome.blocker || null,
      nextStep: outcome.nextStep || null
    };
  }

  function _closeReasonSessionFields(reason) {
    if (reason === 'expired') {
      return _lifecycleSessionFields({
        status: 'stopped',
        outcome: 'stopped',
        reason: 'idle_timeout',
        text: null
      });
    }
    if (reason === 'recording_disabled') {
      return _lifecycleSessionFields({
        status: 'stopped',
        outcome: 'stopped',
        reason: 'recording_disabled',
        text: null
      });
    }
    return { status: 'completed' };
  }

  async function _updateClosedSessionOutcome(sessionId, outcome) {
    var logger = _getAutomationLogger();
    if (!logger || typeof logger.updateSessionOutcome !== 'function') return false;
    try {
      return (await logger.updateSessionOutcome(sessionId, _lifecycleSessionFields(outcome))) === true;
    } catch (_e) {
      return false;
    }
  }

  function _resolveTaskMemoryFactory() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.createTaskMemory === 'function') {
      return globalThis.createTaskMemory;
    }
    if (typeof createTaskMemory === 'function') return createTaskMemory;
    return null;
  }

  function _resolveMemoryStorage() {
    if (typeof globalThis !== 'undefined' && globalThis.memoryStorage) return globalThis.memoryStorage;
    if (typeof memoryStorage !== 'undefined') return memoryStorage;
    return null;
  }

  function _domainFromUrl(url) {
    if (typeof url !== 'string' || !url) return null;
    try { return new URL(url).hostname || null; } catch (_e) { return null; }
  }

  function _sanitizeUrlForMemory(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      var parsed = new URL(url);
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch (_e) {
      return null;
    }
  }

  async function _storeClientTaskMemory(candidate, outcome) {
    var factory = _resolveTaskMemoryFactory();
    var storage = _resolveMemoryStorage();
    if (!factory || !storage || typeof storage.add !== 'function') return false;
    try {
      if (typeof storage.getAll === 'function') {
        var existing = await storage.getAll();
        if (Array.isArray(existing) && existing.some(function (memory) {
          return memory && memory.sourceSessionId === candidate.sessionId;
        })) {
          return true;
        }
      }
      var domain = _domainFromUrl(candidate.lastUrl);
      var memory = factory(outcome.text, {
        sourceSessionId: candidate.sessionId,
        domain: domain,
        taskType: 'mcp-agent',
        tags: ['mcp-agent', 'mcp-client-summary', outcome.outcome],
        confidence: 1,
        source: 'mcp-client',
        mcpClient: candidate.client
      }, {
        session: {
          task: _sanitizeSummaryText(candidate.task, 2000),
          outcome: outcome.outcome,
          domain: domain,
          duration: Math.max(0, candidate.endTime - candidate.startTime),
          iterationCount: candidate.actionCount,
          finalUrl: candidate.lastUrl,
          timeline: candidate.toolNames.map(function (toolName) {
            return { action: toolName, target: '', url: null, result: '', timestamp: null };
          }),
          failures: outcome.outcome === 'failure' ? [outcome.reason] : []
        },
        learned: { selectors: [], siteStructure: [], patterns: [] },
        procedures: []
      });
      return (await storage.add(memory)) !== false;
    } catch (_e) {
      return false;
    }
  }

  async function _recordTaskOutcomeNow(snapshot) {
    var outcome = _normalizeTaskOutcome(snapshot);
    if (!outcome) return { stored: false, reason: 'invalid_outcome' };
    var target = _findOutcomeTarget(snapshot.agentId, snapshot.tabId);
    if (!target) return { stored: false, reason: 'no_unambiguous_session' };

    var candidate = target.value;
    var wasClosed = target.kind === 'closed';
    if (target.kind === 'open') {
      candidate = closeSession(target.value.key, 'task_status', outcome);
    }
    if (!candidate) return { stored: false, reason: 'no_persistable_session' };

    // Consume before storage so the first terminal outcome wins even if the
    // local memory write fails. Session history remains available either way.
    _memoryCandidates.delete(candidate.sessionId);
    try { await _persistMemoryCandidates(); } catch (_e) { /* keep lifecycle writes independent */ }
    if (wasClosed) {
      await _updateClosedSessionOutcome(candidate.sessionId, outcome);
    }
    var stored = await _storeClientTaskMemory(candidate, outcome);
    return { stored: stored, sessionId: candidate.sessionId };
  }

  function recordTaskOutcome(input) {
    try {
      if (!input || typeof input !== 'object') return;
      if (!_recordingEnabled) return;
      var inputPayload = input.payload && typeof input.payload === 'object' ? input.payload : {};
      if (typeof inputPayload.agentId !== 'string' || !inputPayload.agentId) return;
      var snapshot = _snapshotTaskOutcome(input);
      _enqueueRecorderMutation(async function () {
        // Startup initialization may load a persisted opt-out after the
        // fire-and-forget caller passes the fast-path check above.
        if (!_recordingEnabled) return { stored: false, reason: 'recording_disabled' };
        var outcome = _normalizeTaskOutcome(snapshot);
        if (!outcome) return { stored: false, reason: 'invalid_outcome' };
        var journal = _getJournal();
        var hasJournalIdentity = !!(journal && typeof journal.validRunSidecar === 'function' &&
          journal.validRunSidecar(snapshot.recordingRunId));
        var legacyCorrelation = _findLegacySessionForCorrelation(snapshot.agentId, snapshot.recordingRunId);
        var useJournal = false;
        if (hasJournalIdentity && !legacyCorrelation) {
          useJournal = _recorderBackend === FSB_MCP_RECORDER_BACKEND_JOURNAL;
          if (!useJournal && typeof journal.hasCorrelation === 'function') {
            useJournal = await journal.hasCorrelation(snapshot.agentId, snapshot.recordingRunId);
          }
        }
        if (useJournal && typeof journal.recordTaskOutcome === 'function') {
          var payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
          var journalEntry = _snapshotJournalEntry({
            client: payload.visualSession && payload.visualSession.client,
            tool: input.tool,
            requestPayload: payload,
            response: input.response,
            success: !(input.response && input.response.success === false),
            dispatcher_route: 'task-status',
            tabId: snapshot.tabId,
            replayContext: { routeFamily: 'lifecycle' }
          });
          var result = await journal.recordTaskOutcome(journalEntry, outcome);
          if (result && result.candidate) {
            var stored = await _storeClientTaskMemory(result.candidate, outcome);
            return { stored: stored, sessionId: result.candidate.sessionId };
          }
          return result;
        }
        return _recordTaskOutcomeNow(snapshot);
      })
        .catch(function () { /* lifecycle responses never depend on memory */ });
    } catch (_e) { /* fire-and-forget */ }
  }

  // ---- MV3-survivable alarms ----------------------------------------------

  function _idleAlarmName(sessionId) {
    return FSB_MCP_SESSION_IDLE_ALARM_PREFIX + sessionId;
  }

  function _findSessionById(sessionId) {
    var found = null;
    _openSessions.forEach(function (session) {
      if (!found && session.sessionId === sessionId) found = session;
    });
    return found;
  }

  function _armIdleAlarm(session) {
    var alarms = _resolveAlarms();
    if (!alarms || typeof alarms.create !== 'function' || !session) return;
    var name = _idleAlarmName(session.sessionId);
    var when = session.deadlineAt;
    _withAlarmLock(async function () {
      await alarms.create(name, { when: when });
    }).catch(function () { /* lazy sweep remains the fallback */ });
  }

  function _disarmIdleAlarm(session) {
    var alarms = _resolveAlarms();
    if (!alarms || typeof alarms.clear !== 'function' || !session) return;
    var name = _idleAlarmName(session.sessionId);
    _withAlarmLock(async function () {
      await alarms.clear(name);
    }).catch(function () { /* best-effort */ });
  }

  function _scheduleRetentionAlarm() {
    var alarms = _resolveAlarms();
    if (!alarms || typeof alarms.create !== 'function') return;
    _withAlarmLock(async function () {
      // Do not postpone the daily sweep every time MV3 spins up a fresh
      // worker. chrome.alarms persists independently of worker lifetime.
      if (typeof alarms.get === 'function') {
        try {
          var existing = await new Promise(function (resolve) {
            try {
              var maybePromise = alarms.get(FSB_MCP_SESSION_RETENTION_ALARM, function (alarm) {
                resolve(alarm || null);
              });
              if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(function (alarm) { resolve(alarm || null); }, function () { resolve(null); });
              }
            } catch (_getErr) {
              resolve(null);
            }
          });
          if (existing) return;
        } catch (_e) { /* fall through and create it */ }
      }
      await alarms.create(FSB_MCP_SESSION_RETENTION_ALARM, {
        delayInMinutes: FSB_MCP_RETENTION_ALARM_PERIOD_MINUTES,
        periodInMinutes: FSB_MCP_RETENTION_ALARM_PERIOD_MINUTES
      });
    }).catch(function () { /* startup/save pruning still enforces retention */ });
  }

  async function _handleAlarmNow(alarm) {
    if (!alarm || typeof alarm.name !== 'string' || !alarm.name.startsWith(FSB_MCP_SESSION_ALARM_PREFIX)) {
      return { handled: false };
    }
    if (alarm.name === FSB_MCP_SESSION_RETENTION_ALARM) {
      await _requestRetentionPrune();
      return { handled: true, action: 'retention_pruned' };
    }
    if (!alarm.name.startsWith(FSB_MCP_SESSION_IDLE_ALARM_PREFIX)) {
      return { handled: true, action: 'ignored_unknown' };
    }
    var sessionId = alarm.name.slice(FSB_MCP_SESSION_IDLE_ALARM_PREFIX.length);
    var session = _findSessionById(sessionId);
    if (!session) return { handled: true, action: 'missing' };
    if (session.deadlineAt <= _now()) {
      closeSession(session.key, 'expired');
      return { handled: true, action: 'closed', sessionId: sessionId };
    }
    _armIdleAlarm(session);
    return { handled: true, action: 'rearmed', sessionId: sessionId };
  }

  function handleAlarm(alarm) {
    var journal = _getJournal();
    if (journal && alarm && typeof alarm.name === 'string' &&
        ((journal.IDLE_ALARM_PREFIX && alarm.name.indexOf(journal.IDLE_ALARM_PREFIX) === 0) ||
          alarm.name === journal.RETENTION_ALARM) && typeof journal.handleAlarm === 'function') {
      return journal.handleAlarm(alarm, _retentionDays);
    }
    return _enqueueRecorderMutation(function () { return _handleAlarmNow(alarm); });
  }

  // Lazy sweep: close any open session whose deadline has passed. Runs at
  // the top of every recordDispatch as a defensive backup to chrome.alarms.
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
   * schema session object and hand it to history via a DIRECT global. A safe
   * short-lived candidate is retained for a later MCP-authored task summary.
   * Never throws.
   *
   * @param {string} key - logical task map key (the task's first agentId::tabKey).
   * @param {string} reason - 'final' | 'expired' | 'recording_disabled' | 'task_status'.
   */
  function closeSession(key, reason, lifecycleOutcome) {
    try {
      var session = _openSessions.get(key);
      if (!session) return null;
      _openSessions.delete(key);
      _disarmIdleAlarm(session);
      _persistOpenSessions();

      // >=1-invocation persistence gate. Read-only bursts still cannot birth;
      // capability invocation is the explicit sidecar-less birth case.
      if (session.sawActionTool !== true || session.actionHistory.length < 1) return null;

      var endTime = _now();
      var normalizedLifecycle = lifecycleOutcome && typeof lifecycleOutcome === 'object'
        ? lifecycleOutcome
        : null;
      var closeFields = normalizedLifecycle
        ? _lifecycleSessionFields(normalizedLifecycle)
        : _closeReasonSessionFields(reason);
      var safeTask = _sanitizeSummaryText(session.task, 2000) || 'MCP agent session';
      var overrides = {
        id: session.sessionId,
        task: safeTask,
        status: closeFields.status,
        startTime: session.startTime,
        endTime: endTime,
        tabId: session.tabId,
        tabIds: Array.isArray(session.tabIds) ? session.tabIds.slice() : [],
        tabCount: Array.isArray(session.tabIds) ? session.tabIds.length : (session.tabId === null ? 0 : 1),
        taskRunId: session.sessionId,
        actionHistory: session.actionHistory,
        iterationCount: session.actionHistory.length,
        lastUrl: _sanitizeUrlForPersistence(session.lastUrl),
        mode: 'mcp-agent',
        mcpClient: session.client
      };
      Object.assign(overrides, closeFields);

      if (typeof globalThis !== 'undefined' && globalThis.FsbLatticeReplay &&
          typeof globalThis.FsbLatticeReplay.createReplayRecord === 'function') {
        try {
          overrides.replay = globalThis.FsbLatticeReplay.createReplayRecord({
            sessionId: session.sessionId,
            task: safeTask,
            status: closeFields.status,
            outcome: closeFields.outcome,
            outcomeDetails: closeFields.outcomeDetails,
            startTime: session.startTime,
            endTime: endTime,
            startUrl: session.startUrl,
            startUrlRedacted: session.startUrlRedacted === true,
            lastUrl: session.lastUrl,
            mode: 'mcp-agent',
            client: session.client
          }, session.replayEntries, 'capture');
        } catch (_e) { /* actionHistory remains the compatibility source */ }
      }

      var memoryCandidate = _registerMemoryCandidate(session, endTime);

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
              logger.logSessionStart(session.sessionId, safeTask, session.tabId);
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
            if (overrides.replay && saveResult && typeof saveResult.then === 'function' &&
                typeof globalThis !== 'undefined' && globalThis.FsbLatticeReplay &&
                typeof globalThis.FsbLatticeReplay.sealPersistedSession === 'function') {
              saveResult.then(function () {
                return globalThis.FsbLatticeReplay.sealPersistedSession(session.sessionId);
              }).catch(function () { /* retry a pending seal on a later wake */ });
            }
          }
        } catch (_e) { /* never let history persistence break close */ }
      }

      return memoryCandidate;
    } catch (_outerErr) {
      try {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
          console.debug('[FSB MCP Session Recorder] close failed:',
            _outerErr && _outerErr.message ? _outerErr.message : _outerErr);
        }
      } catch (_e) { /* ignore */ }
      return null;
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
  function _recordDispatchNow(entry) {
    try {
      if (!entry || typeof entry !== 'object') return;
      if (!_recordingEnabled) return;
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
      var numericTabId = _resolveNumericTabId(entry, params, payload);
      var sidecar = (payload.visualSession && typeof payload.visualSession === 'object')
        ? payload.visualSession
        : null;
      var replayContext = entry.replayContext && typeof entry.replayContext === 'object'
        ? entry.replayContext
        : {};
      var capabilityBirth = entry.tool === 'mcp:capabilities-invoke' && Number.isFinite(numericTabId);

      var session = null;
      var key = null;

      if (sidecar || capabilityBirth) {
        // Action calls across every tab join the agent's one live logical task.
        // Prefer an exact restored legacy track, then the agent's current run.
        session = _findSessionForAgentTab(agentId, numericTabId)
          || _findMostRecentSessionForAgent(agentId);
        key = session ? session.key : agentId + '::' + _tabKeyPart(numericTabId);
        if (!session) {
          var sessionId = _generateSessionId();
          var task = (sidecar && typeof sidecar.visualReason === 'string' && sidecar.visualReason.length > 0)
            ? _sanitizeSummaryText(sidecar.visualReason, 2000)
            : (capabilityBirth && typeof payload.slug === 'string' && payload.slug
              ? 'Capability: ' + _sanitizeSummaryText(payload.slug, 500)
              : String(entry.tool));
          var client = (sidecar && typeof sidecar.client === 'string' && sidecar.client.length > 0)
            ? sidecar.client
            : ((typeof entry.client === 'string' && entry.client.length > 0) ? entry.client : 'unknown');
          var targetUrl = typeof replayContext.targetUrl === 'string'
            ? _sanitizeUrlForPersistence(replayContext.targetUrl)
            : null;
          session = {
            key: key,
            sessionId: sessionId,
            agentId: agentId,
            recordingRunId: typeof payload.recordingRunId === 'string' ? payload.recordingRunId : null,
            tabId: numericTabId,
            tabIds: [],
            logicalTabs: {},
            task: task,
            client: client,
            startTime: now,
            lastActivityAt: now,
            deadlineAt: now + MCP_SESSION_IDLE_DEATH_MS,
            lastUrl: null,
            startUrl: targetUrl,
            startUrlRedacted: entry.targetRedacted === true,
            startOrigin: typeof replayContext.targetOrigin === 'string' ? replayContext.targetOrigin : null,
            visualReasons: [],
            actionHistory: [],
            replayEntries: [],
            sawActionTool: false
          };
          _openSessions.set(key, session);
          _registerSessionTab(session, numericTabId);
          // Seed session-bound logs so saveSession's empty-logs gate passes.
          var birthLogger = _getAutomationLogger();
          if (birthLogger && typeof birthLogger.logSessionStart === 'function') {
            try { birthLogger.logSessionStart(sessionId, task, numericTabId); } catch (_e) { /* best-effort */ }
          }
        }
        session.sawActionTool = true;
      } else {
        // Read-only routes join the current logical task. Exact tab attribution
        // is preferred, while a newly encountered tab becomes another track.
        // No open session -> ignore
        // (this structurally enforces that ordinary reads never birth).
        session = _findSessionForAgentTab(agentId, numericTabId)
          || _findMostRecentSessionForAgent(agentId);
        if (!session) return;
        key = session.key;
      }

      // Append the action in replay shape {tool, params, result, timestamp}.
      // storedTool applies the replay-name map; the guards below (navigate
      // lastUrl) keep matching on the raw wire verb.
      var storedTool = MCP_REPLAY_TOOL_NAME_MAP[entry.tool] || entry.tool;
      var replayParams = cloneParamsForReplay(params, entry.response);
      var replayResult = cloneResultForReplay(entry.response, params);
      var logicalTab = _registerSessionTab(session, numericTabId);
      session.actionHistory.push({
        tool: storedTool,
        params: replayParams,
        result: replayResult,
        timestamp: now,
        logicalTab: logicalTab
      });
      if (session.actionHistory.length > MCP_SESSION_ACTION_HISTORY_CAP) {
        session.actionHistory.splice(0, session.actionHistory.length - MCP_SESSION_ACTION_HISTORY_CAP);
      }

      session.replayEntries = Array.isArray(session.replayEntries) ? session.replayEntries : [];
      var entryReplayContext = _sanitizeReplayContext(replayContext);
      entryReplayContext.logicalTab = logicalTab;
      session.replayEntries.push({
        tool: entry.tool,
        requestPayload: _sanitizeRequestPayload(payload, entry.response),
        response: replayResult,
        success: entry.success !== false,
        dispatcher_route: entry.dispatcher_route,
        timestamp: now,
        replayContext: entryReplayContext,
        redactedInputs: entry.redactedInputs === true,
        targetRedacted: entry.targetRedacted === true
      });
      if (session.replayEntries.length > MCP_SESSION_REPLAY_ENTRY_CAP) {
        session.replayEntries.splice(0, session.replayEntries.length - MCP_SESSION_REPLAY_ENTRY_CAP);
      }
      if (!session.startUrl && typeof replayContext.targetUrl === 'string') {
        session.startUrl = _sanitizeUrlForPersistence(replayContext.targetUrl);
        session.startUrlRedacted = entry.targetRedacted === true;
      }
      if (!session.startOrigin && typeof replayContext.targetOrigin === 'string') {
        session.startOrigin = replayContext.targetOrigin;
      }

      // lastUrl supplies safe domain/final-URL metadata to client-authored
      // task memories.
      if (entry.tool === 'navigate' && typeof params.url === 'string' && params.url.length > 0 && entry.success) {
        session.lastUrl = _sanitizeUrlForPersistence(params.url);
      }

      if (sidecar && typeof sidecar.visualReason === 'string' && sidecar.visualReason.length > 0 &&
          session.visualReasons.indexOf(_sanitizeSummaryText(sidecar.visualReason, 2000)) === -1) {
        session.visualReasons.push(_sanitizeSummaryText(sidecar.visualReason, 2000));
      }

      var logger = _getAutomationLogger();
      if (logger && typeof logger.logAction === 'function') {
        try {
          logger.logAction(session.sessionId, { tool: storedTool, params: replayParams }, replayResult);
        } catch (_e) { /* best-effort */ }
      }

      // Sliding 60s idle window (mirrors mcp-visual-session-lifecycle
      // semantics): every recorded call re-arms the deadline.
      session.lastActivityAt = now;
      session.deadlineAt = now + MCP_SESSION_IDLE_DEATH_MS;

      // is_final belongs to the visual overlay lifecycle. Closing recording
      // here split one multi-tab task into one session per overlay. Terminal
      // task-status tools now own the recording boundary; idle expiry remains
      // the fail-safe when a client omits one.
      _armIdleAlarm(session);
      _persistOpenSessions();
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

  function recordDispatch(entry) {
    try {
      if (!entry || typeof entry !== 'object') return;
      _enqueueRecorderMutation(async function () {
        if (!_recordingEnabled || entry.tool === 'run_task') return;
        var payload = entry.requestPayload && typeof entry.requestPayload === 'object'
          ? entry.requestPayload
          : {};
        if (typeof payload.agentId !== 'string' || !payload.agentId) return;

        var journal = _getJournal();
        var hasJournalIdentity = !!(journal && typeof journal.validRunSidecar === 'function' &&
          journal.validRunSidecar(payload.recordingRunId));
        var legacyCorrelation = _findLegacySessionForCorrelation(payload.agentId, payload.recordingRunId);
        var useJournal = false;
        if (hasJournalIdentity && !legacyCorrelation) {
          useJournal = _recorderBackend === FSB_MCP_RECORDER_BACKEND_JOURNAL;
          if (!useJournal && typeof journal.hasCorrelation === 'function') {
            useJournal = await journal.hasCorrelation(payload.agentId, payload.recordingRunId);
          }
        }
        if (useJournal) {
          if (typeof journal.recordDispatch === 'function') {
            if (payload.recordingCallId && typeof journal.hasCall === 'function') {
              var duplicate = false;
              try {
                duplicate = await journal.hasCall(
                  payload.agentId,
                  payload.recordingRunId,
                  payload.recordingCallId
                );
              } catch (error) {
                if (typeof journal.markRecordingGap === 'function') {
                  await journal.markRecordingGap({
                    agentId: payload.agentId,
                    recordingRunId: payload.recordingRunId,
                    client: entry.client,
                    tool: entry.tool
                  }, error);
                }
                return;
              }
              if (duplicate) return;
            }
            await journal.recordDispatch(_snapshotJournalEntry(entry));
          }
          return;
        }

        // Legacy-only sessions keep their original projection, but the
        // expensive snapshot now happens after the open-session retention
        // check instead of before the recorder queue.
        _sweepExpired(_now());
        if (!_legacyCanRetainRawEntry(entry)) return;
        _recordDispatchNow(_snapshotEntry(entry));
      })
        .catch(function () { /* fire-and-forget */ });
    } catch (_e) { /* fire-and-forget */ }
  }

  function _snapshotCallIdentity(identity) {
    var source = identity && typeof identity === 'object' ? identity : {};
    return {
      agentId: typeof source.agentId === 'string' ? source.agentId : '',
      recordingRunId: typeof source.recordingRunId === 'string' ? source.recordingRunId : '',
      recordingCallId: typeof source.recordingCallId === 'string' ? source.recordingCallId : '',
      client: typeof source.client === 'string' ? source.client : 'unknown',
      task: typeof source.task === 'string' ? source.task : '',
      taskSource: typeof source.taskSource === 'string' ? source.taskSource : 'tool',
      tool: typeof source.tool === 'string' ? source.tool : ''
    };
  }

  function beginCall(identity, leaseMs) {
    var snapshot = _snapshotCallIdentity(identity);
    return _enqueueRecorderMutation(async function () {
      if (!_recordingEnabled) return { accepted: false, reason: 'recording_disabled' };
      var journal = _getJournal();
      if (!journal || typeof journal.beginCall !== 'function' ||
          typeof journal.validRunSidecar !== 'function' ||
          !journal.validRunSidecar(snapshot.recordingRunId) || !snapshot.agentId || !snapshot.recordingCallId) {
        return { accepted: false, reason: 'journal_unavailable' };
      }
      var useJournal = _recorderBackend === FSB_MCP_RECORDER_BACKEND_JOURNAL;
      if (!useJournal && typeof journal.hasCorrelation === 'function') {
        useJournal = await journal.hasCorrelation(snapshot.agentId, snapshot.recordingRunId);
      }
      if (!useJournal) return { accepted: false, reason: 'legacy_backend' };
      return journal.beginCall(snapshot, leaseMs);
    });
  }

  function endCall(identity) {
    var snapshot = _snapshotCallIdentity(identity);
    return _enqueueRecorderMutation(async function () {
      var journal = _getJournal();
      if (!journal || typeof journal.endCall !== 'function' ||
          typeof journal.validRunSidecar !== 'function' ||
          !journal.validRunSidecar(snapshot.recordingRunId) || !snapshot.agentId || !snapshot.recordingCallId) {
        return { ended: false, reason: 'journal_unavailable' };
      }
      return journal.endCall(snapshot);
    });
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
        tabId: input.tabId,
        replayContext: input.replayContext
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
            recordingRunId: typeof record.recordingRunId === 'string' ? record.recordingRunId : null,
            tabId: (typeof record.tabId === 'number' && isFinite(record.tabId)) ? record.tabId : null,
            tabIds: Array.isArray(record.tabIds)
              ? record.tabIds.map(_numericTabId).filter(function (tabId) { return tabId !== null; })
              : [],
            logicalTabs: record.logicalTabs && typeof record.logicalTabs === 'object'
              ? cloneReplayValue(record.logicalTabs, {})
              : {},
            task: _sanitizeSummaryText(record.task, 2000) || 'MCP agent session',
            client: (typeof record.client === 'string' && record.client.length > 0) ? record.client : 'unknown',
            startTime: (typeof record.startTime === 'number') ? record.startTime : now,
            lastActivityAt: (typeof record.lastActivityAt === 'number') ? record.lastActivityAt : now,
            deadlineAt: (typeof record.deadlineAt === 'number') ? record.deadlineAt : 0,
            lastUrl: _sanitizeUrlForPersistence(record.lastUrl),
            visualReasons: _sanitizeSummaryTextList(record.visualReasons, 2000),
            actionHistory: _sanitizeActionHistory(record.actionHistory),
            replayEntries: _sanitizeReplayEntries(record.replayEntries),
            startUrl: _sanitizeUrlForPersistence(record.startUrl),
            startUrlRedacted: record.startUrlRedacted === true,
            startOrigin: typeof record.startOrigin === 'string' ? record.startOrigin : null,
            sawActionTool: record.sawActionTool === true
          };
          _registerSessionTab(session, session.tabId);
          _openSessions.set(key, session);
          if (session.deadlineAt <= now) {
            closeSession(key, 'expired');
          } else {
            _armIdleAlarm(session);
          }
        }
        // Sync the envelope with whatever survived the restore pass.
        _persistOpenSessions();
      } catch (_e) { /* best-effort */ }
    })();
  }

  async function _initializeRecorder() {
    await _loadRecordingPolicy();
    var journal = _getJournal();
    if (journal && typeof journal.initialize === 'function') {
      await journal.initialize(_retentionDays).catch(function () { /* v2 failures surface per session */ });
    }
    await _scrubPersistedMcpData();
    await _restoreMemoryCandidates();
    await _restoreFromBuffer();
    if (!_recordingEnabled) {
      _closeAllOpenSessions('recording_disabled');
    }
    _scheduleRetentionAlarm();
    await _requestRetentionPrune();
    if (typeof globalThis !== 'undefined' && globalThis.FsbLatticeReplay &&
        typeof globalThis.FsbLatticeReplay.resumePendingSeals === 'function') {
      await globalThis.FsbLatticeReplay.resumePendingSeals().catch(function () { /* retry on the next wake */ });
    }
  }

  function _registerStorageListener() {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.onChanged ||
        typeof c.storage.onChanged.addListener !== 'function') return;
    c.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local' || !changes) return;
      if (!changes[FSB_MCP_RECORDING_ENABLED_KEY] && !changes[FSB_MCP_RETENTION_DAYS_KEY] &&
          !changes[FSB_MCP_RECORDER_BACKEND_KEY]) return;

      var hasEnabledChange = !!changes[FSB_MCP_RECORDING_ENABLED_KEY];
      var hasRetentionChange = !!changes[FSB_MCP_RETENTION_DAYS_KEY];
      var hasBackendChange = !!changes[FSB_MCP_RECORDER_BACKEND_KEY];
      var changedEnabled = hasEnabledChange
        ? changes[FSB_MCP_RECORDING_ENABLED_KEY].newValue !== false
        : null;
      var changedRetentionDays = hasRetentionChange
        ? changes[FSB_MCP_RETENTION_DAYS_KEY].newValue
        : null;
      var changedBackend = hasBackendChange && changes[FSB_MCP_RECORDER_BACKEND_KEY].newValue === FSB_MCP_RECORDER_BACKEND_LEGACY
        ? FSB_MCP_RECORDER_BACKEND_LEGACY
        : FSB_MCP_RECORDER_BACKEND_JOURNAL;

      _enqueueRecorderMutation(function () {
        // Resolve unchanged fields when this queued mutation actually runs;
        // a second onChanged event may have been queued before the first one
        // updates the in-memory policy.
        var nextEnabled = hasEnabledChange ? changedEnabled : _recordingEnabled;
        var nextRetentionDays = hasRetentionChange ? changedRetentionDays : _retentionDays;
        var nextBackend = hasBackendChange ? changedBackend : _recorderBackend;
        return _applyRecordingPolicy(nextEnabled, nextRetentionDays, true, nextBackend);
      }).catch(function () { /* best-effort */ });
    });
  }

  // ---- Test seams -----------------------------------------------------------

  function _peekOpenSessions() {
    var out = {};
    _openSessions.forEach(function (session, key) {
      out[key] = _serializeRecord(session);
    });
    return out;
  }

  function _peekMemoryCandidates() {
    var out = {};
    _memoryCandidates.forEach(function (candidate, sessionId) {
      out[sessionId] = _serializeMemoryCandidate(candidate);
    });
    return out;
  }

  function _resetForTests() {
    _openSessions.forEach(function (session) {
      _disarmIdleAlarm(session);
    });
    _openSessions.clear();
    _memoryCandidates.clear();
    _lastGeneratedSessionTs = 0;
    _recordingEnabled = true;
    _retentionDays = FSB_MCP_RETENTION_DEFAULT_DAYS;
    _recorderBackend = FSB_MCP_RECORDER_BACKEND_JOURNAL;
    _initializationPromise = Promise.resolve();
    _recordQueue = Promise.resolve();
    _persistLock = Promise.resolve();
    _alarmLock = Promise.resolve();
  }

  function _startInitializationForTests() {
    _initializationPromise = _initializeRecorder().catch(function () { /* fail-open */ });
    return _initializationPromise;
  }

  function _applyPolicyForTests(enabled, retentionDays, recorderBackend) {
    return _enqueueRecorderMutation(function () {
      return _applyRecordingPolicy(enabled, retentionDays, true, recorderBackend);
    });
  }

  async function _drainForTests() {
    await Promise.resolve(_initializationPromise).catch(function () { /* ignore */ });
    await Promise.resolve(_recordQueue).catch(function () { /* ignore */ });
    await Promise.resolve(_persistLock).catch(function () { /* ignore */ });
    await Promise.resolve(_alarmLock).catch(function () { /* ignore */ });
  }

  // ---- Registration ---------------------------------------------------------

  var _api = {
    recordDispatch: recordDispatch,
    recordAction: recordAction,
    recordTaskOutcome: recordTaskOutcome,
    beginCall: beginCall,
    endCall: endCall,
    handleAlarm: handleAlarm,
    cloneParamsForReplay: cloneParamsForReplay,
    cloneResultForReplay: cloneResultForReplay,
    projectJournalResult: projectJournalResult,
    sanitizeSummaryTextForPersistence: _sanitizeSummaryText,
    // Compatibility alias retained for existing tests/callers.
    redactParams: cloneParamsForReplay,
    FSB_MCP_SESSION_BUFFER_KEY: FSB_MCP_SESSION_BUFFER_KEY,
    FSB_MCP_MEMORY_CANDIDATES_KEY: FSB_MCP_MEMORY_CANDIDATES_KEY,
    FSB_MCP_REDACTION_VERSION_KEY: FSB_MCP_REDACTION_VERSION_KEY,
    FSB_MCP_REDACTION_VERSION: FSB_MCP_REDACTION_VERSION,
    FSB_MCP_SESSION_ALARM_PREFIX: FSB_MCP_SESSION_ALARM_PREFIX,
    FSB_MCP_SESSION_RETENTION_ALARM: FSB_MCP_SESSION_RETENTION_ALARM,
    FSB_MCP_RECORDING_ENABLED_KEY: FSB_MCP_RECORDING_ENABLED_KEY,
    FSB_MCP_RETENTION_DAYS_KEY: FSB_MCP_RETENTION_DAYS_KEY,
    FSB_MCP_RECORDER_BACKEND_KEY: FSB_MCP_RECORDER_BACKEND_KEY,
    FSB_MCP_RECORDER_BACKEND_JOURNAL: FSB_MCP_RECORDER_BACKEND_JOURNAL,
    FSB_MCP_RECORDER_BACKEND_LEGACY: FSB_MCP_RECORDER_BACKEND_LEGACY,
    FSB_MCP_RETENTION_DEFAULT_DAYS: FSB_MCP_RETENTION_DEFAULT_DAYS,
    MCP_SESSION_IDLE_DEATH_MS: MCP_SESSION_IDLE_DEATH_MS,
    MCP_MEMORY_CANDIDATE_TTL_MS: MCP_MEMORY_CANDIDATE_TTL_MS,
    _setStorageShim: _setStorageShim,
    _setLocalStorageShim: _setLocalStorageShim,
    _setAlarmShim: _setAlarmShim,
    _setTimeShim: _setTimeShim,
    _peekOpenSessions: _peekOpenSessions,
    _peekMemoryCandidates: _peekMemoryCandidates,
    _resetForTests: _resetForTests,
    _restoreFromBuffer: _restoreFromBuffer,
    _restoreMemoryCandidates: _restoreMemoryCandidates,
    _scrubPersistedMcpData: _scrubPersistedMcpData,
    _startInitializationForTests: _startInitializationForTests,
    _applyPolicyForTests: _applyPolicyForTests,
    _drainForTests: _drainForTests,
    _getPolicyForTests: function () {
      return { recordingEnabled: _recordingEnabled, retentionDays: _retentionDays, recorderBackend: _recorderBackend };
    }
  };

  // Service-worker classic-script surface (object-literal registration
  // mirroring mcp-metrics-recorder.js).
  globalThis.fsbMcpSessionRecorder = _api;

  // Node CommonJS surface for the test harness.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = _api;
  }

  // Queue every dispatch behind one startup pass. Policy loads before the
  // buffer restore, preventing a slow storage read from overwriting live
  // actions accepted after service-worker startup.
  _registerStorageListener();
  try {
    _initializationPromise = _initializeRecorder().catch(function () { /* fail-open */ });
  } catch (_e) { /* best-effort */ }
})();
