(function(global) {
  'use strict';

  /**
   * Provider-neutral, write-before-fanout delegation ledger.
   *
   * Every accepted supervisor event is projected through a closed allowlist,
   * assigned its sequence inside one serialized read-modify-write turn, and
   * durably written to chrome.storage.session before it is returned. Raw
   * provider events, prompts, page content, process data, and credentials are
   * never representable in the persisted envelope.
   */

  var PAYLOAD_VERSION = 1;
  var STORAGE_KEY_PREFIX = 'fsbDelegationLedger:v1:';
  var MAX_ENTRIES_PER_DELEGATION = 2000;
  var MAX_ENTRY_BYTES = 4 * 1024;
  var MAX_AGGREGATE_BYTES = 6 * 1024 * 1024;
  // Appends stop below the public aggregate ceiling so a compact terminal
  // tombstone can always quarantine a ledger after a quota-triggered failure.
  var TERMINAL_MARKER_HEADROOM_BYTES = 32 * 1024;
  var MAX_PRESENTATION_CHARS = 256;
  var MAX_ID_CHARS = 128;
  var MAX_TOOL_NAME_CHARS = 128;
  var MAX_ALLOWED_TOOL_CHARS = 96;
  var MAX_ALLOWED_TOOLS = 16;
  var MAX_TOOL_COUNT_ROWS = 128;
  var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;

  var ENTRY_KEYS = [
    'delegationId', 'detail', 'init', 'kind', 'metrics', 'retry', 'sequence',
    'state', 'timestamp', 'title', 'tool', 'v'
  ];
  var LEGACY_ENVELOPE_KEYS = ['delegationId', 'entries', 'terminal', 'terminalCode', 'v'];
  var ENVELOPE_KEYS = [
    'cleanupPending', 'delegationId', 'entries', 'terminal', 'terminalCode', 'v'
  ];
  var CLEANUP_PENDING_KEYS = ['agentId', 'cancellationConfirmed', 'code'];
  var INIT_KEYS = ['allowedTools', 'client', 'model', 'profileVersion', 'sessionId'];
  var CLIENT_KEYS = ['id', 'label'];
  var TOOL_KEYS = ['argsSummary', 'callId', 'durationMs', 'name', 'status', 'tabId'];
  var RETRY_KEYS = ['attempt', 'class', 'delayMs', 'maxAttempts'];
  var METRICS_KEYS = [
    'billingKind', 'durationMs', 'inputTokens', 'outputTokens', 'toolCalls',
    'totalTokens', 'turns', 'usd'
  ];
  var TOOL_COUNT_KEYS = ['count', 'name'];

  var VALID_STATES = Object.freeze({
    idle: true,
    preflighting: true,
    awaiting_consent: true,
    starting: true,
    running: true,
    holding: true,
    held: true,
    resuming: true,
    stopping: true,
    completed: true,
    failed: true,
    stopped: true,
    restart_lost: true
  });
  var VALID_KINDS = Object.freeze({
    init: true,
    'tool-call': true,
    retry: true,
    result: true,
    state: true
  });
  var VALID_TOOL_STATUSES = Object.freeze({
    running: true,
    succeeded: true,
    failed: true,
    unknown: true
  });
  var VALID_RETRY_CLASSES = Object.freeze({
    api_retry: true,
    transport_retry: true,
    tool_retry: true,
    unknown: true
  });
  var VALID_BILLING_KINDS = Object.freeze({
    subscription: true,
    api: true,
    unknown: true
  });
  var VALID_TERMINAL_CODES = Object.freeze({
    completed: true,
    stopped: true,
    cancelled: true,
    start_rejected: true,
    wall_clock_timeout: true,
    event_silence_timeout: true,
    delegation_persistence_failed: true,
    delegation_quota_exceeded: true,
    delegation_ledger_corrupt: true,
    route_lost: true,
    agent_offline: true,
    agent_unpaired: true,
    unsupported_provider: true,
    hold_expired: true,
    resume_ownership_lost: true,
    daemon_restart_lost_run: true,
    agent_protocol_drift: true,
    tree_unsettled: true,
    agent_failed: true,
    unknown_failure: true
  });

  function DelegationStoreError(code, message) {
    this.name = 'DelegationStoreError';
    this.code = code;
    this.message = message || code;
    if (Error.captureStackTrace) Error.captureStackTrace(this, DelegationStoreError);
  }
  DelegationStoreError.prototype = Object.create(Error.prototype);
  DelegationStoreError.prototype.constructor = DelegationStoreError;

  function _fail(code, message) {
    throw new DelegationStoreError(code, message);
  }

  function _quota(message) {
    _fail('delegation_quota_exceeded', message);
  }

  function _corrupt(message) {
    _fail('delegation_ledger_corrupt', message);
  }

  function _persistence(message) {
    _fail('delegation_persistence_failed', message);
  }

  function _isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function _hasExactKeys(value, keys) {
    if (!_isPlainRecord(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    if (actual.length !== expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  function _characterLength(value) {
    return Array.from(value).length;
  }

  function _boundedString(value, maxChars, field, nullable, allowEmpty) {
    if (value === null || value === undefined) {
      if (nullable) return null;
      _persistence(field + ' is required');
    }
    if (typeof value !== 'string') {
      if (nullable) return null;
      _persistence(field + ' must be a string');
    }
    if (_characterLength(value) > maxChars) _quota(field + ' exceeds its character limit');
    if (!nullable && !allowEmpty && value.length === 0) _persistence(field + ' must not be empty');
    return value;
  }

  function _boundedId(value, field, nullable) {
    return _boundedString(value, MAX_ID_CHARS, field, nullable);
  }

  function _nonnegativeIntegerOrNull(value) {
    return typeof value === 'number'
      && Number.isFinite(value)
      && Number.isInteger(value)
      && value >= 0
      && value <= MAX_SAFE_INTEGER
      ? value
      : null;
  }

  function _nonnegativeNumberOrNull(value) {
    return typeof value === 'number'
      && Number.isFinite(value)
      && value >= 0
      && value <= MAX_SAFE_INTEGER
      ? value
      : null;
  }

  function _utf8Bytes(value) {
    try {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
      if (typeof Buffer !== 'undefined') return Buffer.byteLength(value, 'utf8');
    } catch (_error) {
      _persistence('serialization failed');
    }
    _persistence('UTF-8 encoder unavailable');
  }

  function _serializedBytes(value) {
    var serialized;
    try {
      serialized = JSON.stringify(value);
    } catch (_error) {
      _persistence('serialization failed');
    }
    if (typeof serialized !== 'string') _persistence('serialization failed');
    return _utf8Bytes(serialized);
  }

  function _clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      _persistence('serialization failed');
    }
  }

  function _deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { _deepFreeze(value[key]); });
    return value;
  }

  function _value(context, payload, camelKey, snakeKey) {
    if (context && context[camelKey] !== undefined) return context[camelKey];
    if (payload && payload[camelKey] !== undefined) return payload[camelKey];
    if (snakeKey && payload && payload[snakeKey] !== undefined) return payload[snakeKey];
    return undefined;
  }

  function _normalizeClient(value) {
    if (value === null || value === undefined) return null;
    if (!_isPlainRecord(value)) return null;
    if (value.id !== 'claude-code' || value.label !== 'Claude Code') return null;
    return { id: 'claude-code', label: 'Claude Code' };
  }

  function _normalizeAllowedTools(value) {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) _persistence('allowedTools must be an array');
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var tool = _boundedString(value[i], MAX_ALLOWED_TOOL_CHARS, 'allowedTools', false);
      if (seen[tool]) continue;
      seen[tool] = true;
      out.push(tool);
      if (out.length > MAX_ALLOWED_TOOLS) _quota('allowedTools exceeds its item limit');
    }
    return out;
  }

  function _normalizeToolCounts(value) {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) _persistence('toolCalls must be an array');
    var counts = Object.create(null);
    var order = [];
    for (var i = 0; i < value.length; i++) {
      var row = value[i];
      if (!_isPlainRecord(row)) _persistence('toolCalls row must be a record');
      var name = _boundedString(row.name, MAX_TOOL_NAME_CHARS, 'toolCalls.name', false);
      var count = _nonnegativeIntegerOrNull(row.count);
      if (count === null) _persistence('toolCalls.count must be a bounded nonnegative integer');
      if (counts[name] === undefined) {
        order.push(name);
        counts[name] = count;
      } else {
        var combined = counts[name] + count;
        if (!Number.isSafeInteger(combined)) _quota('toolCalls count overflow');
        counts[name] = combined;
      }
    }
    if (order.length > MAX_TOOL_COUNT_ROWS) _quota('toolCalls exceeds its row limit');
    return order.map(function(name) { return { name: name, count: counts[name] }; });
  }

  function _normalizeTerminalCode(value) {
    return typeof value === 'string' && VALID_TERMINAL_CODES[value]
      ? value
      : 'unknown_failure';
  }

  function _eventType(event) {
    if (!event || typeof event.type !== 'string') _persistence('event type is required');
    if (event.type === 'delegation.started') return 'init';
    if (event.type === 'tool-use') return 'tool_use';
    if (event.type === 'tool-result') return 'tool_result';
    return event.type;
  }

  function _deriveState(type, payload, context) {
    if (type === 'result') {
      // A streamed result contains the durable summary, but the supervisor
      // still owns process-tree cleanup. Only a later explicit terminal row
      // may transition the ledger out of running.
      return 'running';
    }
    if (type === 'terminal') {
      var terminal = _normalizeTerminalCode(context && context.terminalCode);
      if (terminal === 'completed') return 'completed';
      if (terminal === 'stopped' || terminal === 'cancelled') return 'stopped';
      if (terminal === 'daemon_restart_lost_run') return 'restart_lost';
      return 'failed';
    }
    if (context && typeof context.state === 'string' && VALID_STATES[context.state]) {
      return context.state;
    }
    return type === 'state' ? 'idle' : 'running';
  }

  function _defaultTitle(type, payload, context) {
    var name = _value(context, payload, 'toolName', 'tool_name');
    if (typeof name !== 'string' || name.length === 0) name = 'unknown';
    switch (type) {
      case 'init': return 'Claude Code connected';
      case 'tool_use': return 'Tool started: ' + name;
      case 'tool_result': return 'Tool finished: ' + name;
      case 'retry': return 'Retrying agent request';
      case 'result': return payload && payload.is_error === true ? 'Delegation failed' : 'Delegation completed';
      case 'terminal': return 'Delegation ended';
      case 'assistant': return 'Agent activity';
      case 'assistant_delta': return 'Agent response updated';
      case 'user': return 'Tool response received';
      case 'diagnostic': return 'Agent diagnostic';
      default: return 'Delegation state updated';
    }
  }

  function _projectInit(event, payload, context) {
    return {
      client: _normalizeClient(_value(context, payload, 'client')),
      profileVersion: _boundedId(_value(context, payload, 'profileVersion', 'profile_version'), 'profileVersion', true),
      model: _boundedId(_value(context, payload, 'model'), 'model', true),
      sessionId: _boundedId(_value(context, { sessionId: event.sessionId }, 'sessionId', 'session_id'), 'sessionId', true),
      allowedTools: _normalizeAllowedTools(_value(context, payload, 'allowedTools', 'tools'))
    };
  }

  function _projectTool(type, payload, context) {
    var callId = _value(context, payload, 'callId', type === 'tool_result' ? 'tool_use_id' : 'id');
    var name = _value(context, payload, 'toolName', 'name');
    var status = _value(context, payload, 'toolStatus', 'status');
    if (!VALID_TOOL_STATUSES[status]) {
      if (type === 'tool_use') status = 'running';
      else if (payload && payload.is_error === true) status = 'failed';
      else if (type === 'tool_result') status = 'succeeded';
      else status = 'unknown';
    }
    return {
      callId: _boundedId(callId, 'tool.callId', true),
      name: _boundedString(typeof name === 'string' && name.length > 0 ? name : 'unknown', MAX_TOOL_NAME_CHARS, 'tool.name', false),
      tabId: _nonnegativeIntegerOrNull(_value(context, payload, 'tabId', 'tab_id')),
      argsSummary: _boundedString(_value(context, payload, 'argsSummary', 'args_summary'), MAX_PRESENTATION_CHARS, 'tool.argsSummary', true),
      status: status,
      durationMs: _nonnegativeIntegerOrNull(_value(context, payload, 'durationMs', 'duration_ms'))
    };
  }

  function _projectRetry(payload, context) {
    var retryClass = _value(context, payload, 'retryClass', 'class');
    if (!VALID_RETRY_CLASSES[retryClass]) {
      retryClass = payload && payload.subtype === 'api_retry' ? 'api_retry' : 'unknown';
    }
    return {
      class: retryClass,
      attempt: _nonnegativeIntegerOrNull(_value(context, payload, 'attempt')),
      maxAttempts: _nonnegativeIntegerOrNull(_value(context, payload, 'maxAttempts', 'max_retries')),
      delayMs: _nonnegativeIntegerOrNull(_value(context, payload, 'delayMs', 'retry_delay_ms'))
    };
  }

  function _projectMetrics(payload, context) {
    var usage = payload && _isPlainRecord(payload.usage) ? payload.usage : {};
    var inputTokens = _nonnegativeIntegerOrNull(_value(context, usage, 'inputTokens', 'input_tokens'));
    var outputTokens = _nonnegativeIntegerOrNull(_value(context, usage, 'outputTokens', 'output_tokens'));
    var totalTokens = _nonnegativeIntegerOrNull(_value(context, usage, 'totalTokens', 'total_tokens'));
    if (totalTokens === null && inputTokens !== null && outputTokens !== null) {
      var sum = inputTokens + outputTokens;
      totalTokens = Number.isSafeInteger(sum) ? sum : null;
    }
    var billingKind = _value(context, payload, 'billingKind', 'billing_kind');
    if (!VALID_BILLING_KINDS[billingKind]) billingKind = 'unknown';
    var usd = billingKind === 'api'
      ? _nonnegativeNumberOrNull(_value(context, payload, 'usd'))
      : null;
    return {
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      totalTokens: totalTokens,
      turns: _nonnegativeIntegerOrNull(_value(context, payload, 'turns', 'num_turns')),
      durationMs: _nonnegativeIntegerOrNull(_value(context, payload, 'durationMs', 'duration_ms')),
      billingKind: billingKind,
      usd: usd,
      toolCalls: _normalizeToolCounts(_value(context, payload, 'toolCalls', 'tool_calls'))
    };
  }

  /** Pure, closed projection. Sequence/timestamp are supplied by the caller. */
  function project(event, context) {
    context = context || {};
    if (!_hasExactKeys(event, ['payload', 'sessionId', 'type'])) {
      _persistence('normalized event must have exact type/sessionId/payload keys');
    }
    if (!_isPlainRecord(event.payload)) _persistence('event payload must be a record');

    var delegationId = _boundedId(context.delegationId, 'delegationId', false);
    var sequence = context.sequence;
    var timestamp = context.timestamp;
    if (!Number.isSafeInteger(sequence) || sequence < 1) _persistence('sequence must be a positive integer');
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) _persistence('timestamp must be a nonnegative integer');

    var payload = event.payload;
    var type = _eventType(event);
    var kind = 'state';
    if (type === 'init') kind = 'init';
    else if (type === 'tool_use' || type === 'tool_result') kind = 'tool-call';
    else if (type === 'retry') kind = 'retry';
    else if (type === 'result') kind = 'result';
    else if (!Object.prototype.hasOwnProperty.call({
      assistant: true,
      assistant_delta: true,
      user: true,
      diagnostic: true,
      state: true,
      terminal: true
    }, type)) {
      _persistence('unsupported normalized event type');
    }

    var titleValue = context.title !== undefined ? context.title : _defaultTitle(type, payload, context);
    var detailValue = context.detail !== undefined ? context.detail : null;
    var entry = {
      v: PAYLOAD_VERSION,
      delegationId: delegationId,
      sequence: sequence,
      timestamp: timestamp,
      kind: kind,
      state: _deriveState(type, payload, context),
      title: _boundedString(titleValue, MAX_PRESENTATION_CHARS, 'title', false, true),
      detail: _boundedString(detailValue, MAX_PRESENTATION_CHARS, 'detail', true),
      init: kind === 'init' ? _projectInit(event, payload, context) : null,
      tool: kind === 'tool-call' ? _projectTool(type, payload, context) : null,
      retry: kind === 'retry' ? _projectRetry(payload, context) : null,
      metrics: kind === 'result' ? _projectMetrics(payload, context) : null
    };
    _assertValidEntry(entry, delegationId, sequence, false);
    if (_serializedBytes(entry) > MAX_ENTRY_BYTES) _quota('entry exceeds serialized byte limit');
    return _deepFreeze(entry);
  }

  function _assertNullableBoundedInteger(value, field) {
    if (value !== null && _nonnegativeIntegerOrNull(value) === null) _corrupt(field + ' is invalid');
  }

  function _assertValidInit(value) {
    if (!_hasExactKeys(value, INIT_KEYS)) _corrupt('init payload shape is invalid');
    if (value.client !== null) {
      if (!_hasExactKeys(value.client, CLIENT_KEYS)
        || value.client.id !== 'claude-code'
        || value.client.label !== 'Claude Code') _corrupt('init client is invalid');
    }
    ['profileVersion', 'model', 'sessionId'].forEach(function(field) {
      if (value[field] !== null
        && (typeof value[field] !== 'string' || _characterLength(value[field]) > MAX_ID_CHARS)) {
        _corrupt('init ' + field + ' is invalid');
      }
    });
    if (!Array.isArray(value.allowedTools) || value.allowedTools.length > MAX_ALLOWED_TOOLS) {
      _corrupt('init allowedTools is invalid');
    }
    var seen = Object.create(null);
    value.allowedTools.forEach(function(tool) {
      if (typeof tool !== 'string' || !tool || _characterLength(tool) > MAX_ALLOWED_TOOL_CHARS || seen[tool]) {
        _corrupt('init allowedTools is invalid');
      }
      seen[tool] = true;
    });
  }

  function _assertValidTool(value) {
    if (!_hasExactKeys(value, TOOL_KEYS)) _corrupt('tool payload shape is invalid');
    if (value.callId !== null
      && (typeof value.callId !== 'string' || _characterLength(value.callId) > MAX_ID_CHARS)) {
      _corrupt('tool callId is invalid');
    }
    if (typeof value.name !== 'string' || !value.name || _characterLength(value.name) > MAX_TOOL_NAME_CHARS) {
      _corrupt('tool name is invalid');
    }
    if (value.argsSummary !== null
      && (typeof value.argsSummary !== 'string' || _characterLength(value.argsSummary) > MAX_PRESENTATION_CHARS)) {
      _corrupt('tool argsSummary is invalid');
    }
    if (!VALID_TOOL_STATUSES[value.status]) _corrupt('tool status is invalid');
    _assertNullableBoundedInteger(value.tabId, 'tool tabId');
    _assertNullableBoundedInteger(value.durationMs, 'tool durationMs');
  }

  function _assertValidRetry(value) {
    if (!_hasExactKeys(value, RETRY_KEYS) || !VALID_RETRY_CLASSES[value.class]) {
      _corrupt('retry payload shape is invalid');
    }
    _assertNullableBoundedInteger(value.attempt, 'retry attempt');
    _assertNullableBoundedInteger(value.maxAttempts, 'retry maxAttempts');
    _assertNullableBoundedInteger(value.delayMs, 'retry delayMs');
  }

  function _assertValidMetrics(value) {
    if (!_hasExactKeys(value, METRICS_KEYS) || !VALID_BILLING_KINDS[value.billingKind]) {
      _corrupt('metrics payload shape is invalid');
    }
    ['inputTokens', 'outputTokens', 'totalTokens', 'turns', 'durationMs'].forEach(function(field) {
      _assertNullableBoundedInteger(value[field], 'metrics ' + field);
    });
    if (value.usd !== null && _nonnegativeNumberOrNull(value.usd) === null) _corrupt('metrics usd is invalid');
    if (value.billingKind !== 'api' && value.usd !== null) _corrupt('non-api metrics cannot contain usd');
    if (!Array.isArray(value.toolCalls) || value.toolCalls.length > MAX_TOOL_COUNT_ROWS) {
      _corrupt('metrics toolCalls is invalid');
    }
    var seen = Object.create(null);
    value.toolCalls.forEach(function(row) {
      if (!_hasExactKeys(row, TOOL_COUNT_KEYS)
        || typeof row.name !== 'string'
        || !row.name
        || _characterLength(row.name) > MAX_TOOL_NAME_CHARS
        || _nonnegativeIntegerOrNull(row.count) === null
        || seen[row.name]) _corrupt('metrics toolCalls row is invalid');
      seen[row.name] = true;
    });
  }

  function _assertValidEntry(entry, delegationId, expectedSequence, corruptMode) {
    var fail = corruptMode ? _corrupt : _persistence;
    if (!_hasExactKeys(entry, ENTRY_KEYS)) fail('entry shape is invalid');
    if (entry.v !== PAYLOAD_VERSION
      || entry.delegationId !== delegationId
      || entry.sequence !== expectedSequence
      || !Number.isSafeInteger(entry.timestamp)
      || entry.timestamp < 0
      || !VALID_KINDS[entry.kind]
      || !VALID_STATES[entry.state]
      || typeof entry.title !== 'string'
      || _characterLength(entry.title) > MAX_PRESENTATION_CHARS
      || (entry.detail !== null
        && (typeof entry.detail !== 'string' || _characterLength(entry.detail) > MAX_PRESENTATION_CHARS))) {
      fail('entry value is invalid');
    }
    var expectedInit = entry.kind === 'init';
    var expectedTool = entry.kind === 'tool-call';
    var expectedRetry = entry.kind === 'retry';
    var expectedMetrics = entry.kind === 'result';
    if ((entry.init !== null) !== expectedInit
      || (entry.tool !== null) !== expectedTool
      || (entry.retry !== null) !== expectedRetry
      || (entry.metrics !== null) !== expectedMetrics) {
      fail('entry typed payload exclusivity is invalid');
    }
    if (expectedInit) _assertValidInit(entry.init);
    if (expectedTool) _assertValidTool(entry.tool);
    if (expectedRetry) _assertValidRetry(entry.retry);
    if (expectedMetrics) _assertValidMetrics(entry.metrics);
    if (_serializedBytes(entry) > MAX_ENTRY_BYTES) {
      if (corruptMode) _corrupt('persisted entry exceeds serialized byte limit');
      _quota('entry exceeds serialized byte limit');
    }
  }

  function _assertValidEnvelope(envelope, delegationId) {
    var legacy = _hasExactKeys(envelope, LEGACY_ENVELOPE_KEYS);
    if (!legacy && !_hasExactKeys(envelope, ENVELOPE_KEYS)) {
      _corrupt('ledger envelope shape is invalid');
    }
    if (envelope.v !== PAYLOAD_VERSION || envelope.delegationId !== delegationId) {
      _corrupt('ledger identity is invalid');
    }
    if (typeof envelope.terminal !== 'boolean') _corrupt('ledger terminal flag is invalid');
    if (envelope.terminalCode !== null
      && (typeof envelope.terminalCode !== 'string' || !VALID_TERMINAL_CODES[envelope.terminalCode])) {
      _corrupt('ledger terminal code is invalid');
    }
    if (envelope.terminal !== (envelope.terminalCode !== null)) _corrupt('ledger terminal fields disagree');
    var cleanupPending = legacy ? null : envelope.cleanupPending;
    if (cleanupPending !== null) {
      if (!_hasExactKeys(cleanupPending, CLEANUP_PENDING_KEYS)
        || typeof cleanupPending.cancellationConfirmed !== 'boolean'
        || typeof cleanupPending.code !== 'string'
        || !VALID_TERMINAL_CODES[cleanupPending.code]
        || (cleanupPending.agentId !== null
          && (typeof cleanupPending.agentId !== 'string'
            || !cleanupPending.agentId
            || _characterLength(cleanupPending.agentId) > MAX_ID_CHARS))
        || envelope.terminal) {
        _corrupt('ledger cleanup marker is invalid');
      }
    }
    if (!Array.isArray(envelope.entries) || envelope.entries.length > MAX_ENTRIES_PER_DELEGATION) {
      _corrupt('ledger entries are invalid');
    }
    for (var i = 0; i < envelope.entries.length; i++) {
      _assertValidEntry(envelope.entries[i], delegationId, i + 1, true);
    }
    return envelope;
  }

  function _storageArea() {
    var chromeApi = typeof globalThis !== 'undefined' ? globalThis.chrome : null;
    var area = chromeApi && chromeApi.storage && chromeApi.storage.session;
    if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
      _persistence('chrome.storage.session is unavailable');
    }
    return area;
  }

  async function _read(keys) {
    try {
      var value = await _storageArea().get(keys);
      return value && typeof value === 'object' ? value : {};
    } catch (error) {
      if (error && error.code && /^delegation_/.test(error.code)) throw error;
      _persistence('session storage read failed');
    }
  }

  async function _write(update) {
    try {
      await _storageArea().set(update);
    } catch (error) {
      if (error && error.code && /^delegation_/.test(error.code)) throw error;
      _persistence('session storage write failed');
    }
  }

  function _key(delegationId) {
    return STORAGE_KEY_PREFIX + delegationId;
  }

  function _emptyEnvelope(delegationId) {
    return {
      v: PAYLOAD_VERSION,
      delegationId: delegationId,
      terminal: false,
      terminalCode: null,
      cleanupPending: null,
      entries: []
    };
  }

  function _validatedLedgerRows(all) {
    var rows = [];
    var aggregateBytes = 0;
    Object.keys(all).sort().forEach(function(key) {
      if (key.indexOf(STORAGE_KEY_PREFIX) !== 0) return;
      var delegationId = key.slice(STORAGE_KEY_PREFIX.length);
      if (!delegationId || _characterLength(delegationId) > MAX_ID_CHARS) {
        _corrupt('ledger storage key is invalid');
      }
      var envelope = _assertValidEnvelope(all[key], delegationId);
      aggregateBytes += _serializedBytes(envelope);
      rows.push({ delegationId: delegationId, envelope: envelope });
    });
    if (aggregateBytes > MAX_AGGREGATE_BYTES) {
      _corrupt('persisted aggregate ledger exceeds quota');
    }
    return rows;
  }

  var _storageTail = Promise.resolve();
  function _withStorageLock(operation) {
    var next = _storageTail.then(operation, operation);
    _storageTail = next.then(function() {}, function() {});
    return next;
  }

  function _ledgerBytesFromStorage(all, replacementKey, replacementEnvelope) {
    var total = 0;
    var replacementSeen = false;
    Object.keys(all).forEach(function(key) {
      if (key.indexOf(STORAGE_KEY_PREFIX) !== 0) return;
      var value = key === replacementKey ? replacementEnvelope : all[key];
      if (key === replacementKey) replacementSeen = true;
      total += _serializedBytes(value);
    });
    if (!replacementSeen && replacementEnvelope) total += _serializedBytes(replacementEnvelope);
    return total;
  }

  async function appendBeforeFanout(delegationId, event, context) {
    delegationId = _boundedId(delegationId, 'delegationId', false);
    context = context || {};
    return _withStorageLock(async function() {
      var key = _key(delegationId);
      var stored = await _read(null);
      var current = stored[key] === undefined ? _emptyEnvelope(delegationId) : stored[key];
      _assertValidEnvelope(current, delegationId);
      if (current.terminal) _persistence('cannot append to a terminal ledger');
      if (current.cleanupPending) _persistence('cannot append while cleanup is pending');
      if (current.entries.length >= MAX_ENTRIES_PER_DELEGATION) {
        _quota('delegation entry count limit reached');
      }
      var projectionContext = Object.assign({}, context, {
        delegationId: delegationId,
        sequence: current.entries.length + 1,
        timestamp: Number.isSafeInteger(context.timestamp) && context.timestamp >= 0
          ? context.timestamp
          : Date.now()
      });
      var entry = project(event, projectionContext);
      var next = {
        v: PAYLOAD_VERSION,
        delegationId: delegationId,
        terminal: false,
        terminalCode: null,
        cleanupPending: null,
        entries: current.entries.concat([entry])
      };
      _assertValidEnvelope(next, delegationId);
      if (_ledgerBytesFromStorage(stored, key, next)
          > MAX_AGGREGATE_BYTES - TERMINAL_MARKER_HEADROOM_BYTES) {
        _quota('aggregate delegation ledger limit reached');
      }
      var update = {};
      update[key] = next;
      await _write(update);
      return _deepFreeze(_clone(entry));
    });
  }

  async function hydrateNonterminal() {
    return _withStorageLock(async function() {
      var all = await _read(null);
      var ledgers = [];
      _validatedLedgerRows(all).forEach(function(row) {
        if (!row.envelope.terminal) ledgers.push(_clone(row.envelope));
      });
      return _deepFreeze(ledgers);
    });
  }

  /**
   * Return only ids whose current-schema ledger is durably terminal after the
   * entire persisted ledger namespace passes the canonical entry, sequence,
   * identity, per-entry, and aggregate validators. Release-proof callers must
   * not infer terminal state from a top-level flag or a partially valid row.
   */
  async function readDurablyTerminalDelegations(delegationIds) {
    if (!Array.isArray(delegationIds)) {
      _persistence('delegationIds must be an array');
    }
    if (delegationIds.length > 128) {
      _quota('delegationIds exceeds its item limit');
    }
    var wanted = new Set();
    delegationIds.forEach(function(delegationId) {
      wanted.add(_boundedId(delegationId, 'delegationId', false));
    });
    return _withStorageLock(async function() {
      var all = await _read(null);
      var terminal = [];
      _validatedLedgerRows(all).forEach(function(row) {
        if (wanted.has(row.delegationId)
          && row.envelope.terminal === true
          && row.envelope.cleanupPending === null
          && _hasExactKeys(row.envelope, ENVELOPE_KEYS)) {
          terminal.push(row.delegationId);
        }
      });
      return Object.freeze(terminal);
    });
  }

  /**
   * Commit the durable no-replay boundary before any registry authority is
   * released. A worker wake may hydrate this row, but must treat it only as
   * an exact cleanup retry, never as an ordinary live delegation.
   */
  async function markCleanupPending(delegationId, cleanup) {
    delegationId = _boundedId(delegationId, 'delegationId', false);
    return _withStorageLock(async function() {
      var key = _key(delegationId);
      var all = await _read(null);
      var current = all[key] === undefined
        ? _emptyEnvelope(delegationId)
        : _assertValidEnvelope(all[key], delegationId);
      if (current.terminal) _persistence('cannot quarantine a terminal ledger');
      var marker = {
        code: _normalizeTerminalCode(cleanup && cleanup.code),
        cancellationConfirmed: !!(cleanup && cleanup.cancellationConfirmed === true),
        agentId: cleanup && cleanup.agentId !== null && cleanup.agentId !== undefined
          ? _boundedId(cleanup.agentId, 'cleanupPending.agentId', false)
          : null
      };
      if (current.cleanupPending) {
        if (current.cleanupPending.code !== marker.code
          || current.cleanupPending.agentId !== marker.agentId
          || (current.cleanupPending.cancellationConfirmed === true
            && marker.cancellationConfirmed !== true)) {
          _corrupt('cleanup marker conflicts with persisted ledger');
        }
        if (current.cleanupPending.cancellationConfirmed === marker.cancellationConfirmed) {
          return _deepFreeze(_clone(current));
        }
        var promoted = {
          v: PAYLOAD_VERSION,
          delegationId: delegationId,
          terminal: false,
          terminalCode: null,
          cleanupPending: marker,
          entries: current.entries.slice()
        };
        _assertValidEnvelope(promoted, delegationId);
        if (_ledgerBytesFromStorage(all, key, promoted) > MAX_AGGREGATE_BYTES) {
          _quota('aggregate delegation ledger limit reached');
        }
        var promotionUpdate = {};
        promotionUpdate[key] = promoted;
        await _write(promotionUpdate);
        return _deepFreeze(_clone(promoted));
      }
      var next = {
        v: PAYLOAD_VERSION,
        delegationId: delegationId,
        terminal: false,
        terminalCode: null,
        cleanupPending: marker,
        entries: current.entries.slice()
      };
      _assertValidEnvelope(next, delegationId);
      if (_ledgerBytesFromStorage(all, key, next) > MAX_AGGREGATE_BYTES) {
        _quota('aggregate delegation ledger limit reached');
      }
      var update = {};
      update[key] = next;
      await _write(update);
      return _deepFreeze(_clone(next));
    });
  }

  async function markTerminal(delegationId, terminal) {
    delegationId = _boundedId(delegationId, 'delegationId', false);
    return _withStorageLock(async function() {
      var key = _key(delegationId);
      var all = await _read(null);
      var current = all[key] === undefined
        ? _emptyEnvelope(delegationId)
        : _assertValidEnvelope(all[key], delegationId);
      var candidate = typeof terminal === 'string'
        ? terminal
        : terminal && terminal.code;
      var code = _normalizeTerminalCode(candidate);
      if (current.terminal) {
        if (current.terminalCode !== code) _corrupt('terminal code conflicts with persisted ledger');
        return _deepFreeze(_clone(current));
      }
      if (current.cleanupPending && current.cleanupPending.code !== code) {
        _corrupt('terminal code conflicts with cleanup marker');
      }
      if (current.cleanupPending
        && current.cleanupPending.cancellationConfirmed !== true) {
        _persistence('cannot mark terminal before cancellation confirmation');
      }
      var entries = current.entries.slice();
      if (terminal && _isPlainRecord(terminal.event)
        && entries.length < MAX_ENTRIES_PER_DELEGATION) {
        var terminalContext = _isPlainRecord(terminal.context)
          ? Object.assign({}, terminal.context)
          : {};
        terminalContext.delegationId = delegationId;
        terminalContext.sequence = entries.length + 1;
        terminalContext.terminalCode = code;
        terminalContext.timestamp = Number.isSafeInteger(terminalContext.timestamp)
          && terminalContext.timestamp >= 0
          ? terminalContext.timestamp
          : Date.now();
        entries.push(project(terminal.event, terminalContext));
      }
      var next = {
        v: PAYLOAD_VERSION,
        delegationId: delegationId,
        terminal: true,
        terminalCode: code,
        cleanupPending: null,
        entries: entries
      };
      _assertValidEnvelope(next, delegationId);
      if (_ledgerBytesFromStorage(all, key, next) > MAX_AGGREGATE_BYTES) {
        _quota('aggregate delegation ledger limit reached');
      }
      var update = {};
      update[key] = next;
      await _write(update);
      return _deepFreeze(_clone(next));
    });
  }

  var exportsObj = Object.freeze({
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    STORAGE_KEY_PREFIX: STORAGE_KEY_PREFIX,
    MAX_ENTRIES_PER_DELEGATION: MAX_ENTRIES_PER_DELEGATION,
    MAX_ENTRY_BYTES: MAX_ENTRY_BYTES,
    MAX_AGGREGATE_BYTES: MAX_AGGREGATE_BYTES,
    MAX_PRESENTATION_CHARS: MAX_PRESENTATION_CHARS,
    MAX_ID_CHARS: MAX_ID_CHARS,
    MAX_TOOL_NAME_CHARS: MAX_TOOL_NAME_CHARS,
    MAX_ALLOWED_TOOL_CHARS: MAX_ALLOWED_TOOL_CHARS,
    MAX_ALLOWED_TOOLS: MAX_ALLOWED_TOOLS,
    MAX_TOOL_COUNT_ROWS: MAX_TOOL_COUNT_ROWS,
    DelegationStoreError: DelegationStoreError,
    project: project,
    appendBeforeFanout: appendBeforeFanout,
    hydrateNonterminal: hydrateNonterminal,
    readDurablyTerminalDelegations: readDurablyTerminalDelegations,
    markCleanupPending: markCleanupPending,
    markTerminal: markTerminal,
    normalizeTerminalCode: _normalizeTerminalCode,
    serializedBytes: _serializedBytes
  });

  global.FsbDelegationEventStore = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})(typeof globalThis !== 'undefined' ? globalThis : this);
