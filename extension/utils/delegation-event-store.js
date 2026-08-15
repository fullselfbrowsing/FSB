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
  var STORAGE_LAYOUT_VERSION = 2;
  var STORAGE_CATALOG_KEY = 'fsbDelegationLedgerCatalog:v2';
  var STORAGE_CHUNK_KEY_PREFIX = 'fsbDelegationLedgerChunk:v2:';
  var STORAGE_CHUNK_ENTRIES = 32;
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
  var delegationProviders = global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('./delegation-providers.js');
  }

  var ENTRY_KEYS = [
    'delegationId', 'detail', 'init', 'kind', 'metrics', 'retry', 'sequence',
    'state', 'timestamp', 'title', 'tool', 'v'
  ];
  var ACCEPTED_IDENTITY_KEYS = [
    'providerId', 'label', 'profileVersion', 'authState', 'billingKind'
  ];
  var ENVELOPE_KEYS = [
    'acceptedIdentity', 'cleanupPending', 'delegationId', 'entries',
    'terminal', 'terminalCode', 'v'
  ];
  var CATALOG_KEYS = ['delegationIds', 'v'];
  var MANIFEST_KEYS = [
    'acceptedIdentity', 'activeEntries', 'cleanupPending', 'delegationId',
    'entriesBytes', 'entryCount', 'envelopeBytes', 'sealedChunkCount',
    'terminal', 'terminalCode', 'v'
  ];
  var CHUNK_KEYS = ['delegationId', 'entries', 'index', 'v'];
  var CLEANUP_PENDING_KEYS = ['agentId', 'cancellationConfirmed', 'code'];
  var INIT_KEYS = ['allowedTools', 'client', 'model', 'profileVersion', 'sessionId'];
  var CLIENT_KEYS = ['id', 'label'];
  var TOOL_KEYS = ['callId', 'durationMs', 'name', 'status', 'tabId'];
  var LEGACY_TOOL_KEYS = [
    'argsSummary', 'callId', 'durationMs', 'name', 'status', 'tabId'
  ];
  var RETRY_KEYS = ['attempt', 'class', 'delayMs', 'maxAttempts'];
  var METRICS_KEYS = [
    'billingKind', 'durationMs', 'inputTokens', 'outputTokens', 'toolCalls',
    'totalTokens', 'turns', 'usd'
  ];
  var TOOL_COUNT_KEYS = ['count', 'name'];
  var CONTEXT_KEYS = Object.freeze({
    acceptedIdentity: true,
    allowedTools: true,
    attempt: true,
    callId: true,
    delayMs: true,
    delegationId: true,
    detail: true,
    durationMs: true,
    inputTokens: true,
    maxAttempts: true,
    model: true,
    outputTokens: true,
    retryClass: true,
    sequence: true,
    sessionId: true,
    state: true,
    tabId: true,
    terminalCode: true,
    timestamp: true,
    title: true,
    toolCalls: true,
    toolName: true,
    toolStatus: true,
    totalTokens: true,
    turns: true,
  });

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

  function _ownDataKeys(value, allowNullPrototype) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
      var proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && !(allowNullPrototype && proto === null)) return null;
      var keys = Reflect.ownKeys(value);
      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        if (typeof key !== 'string') return null;
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor
            || descriptor.enumerable !== true
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      }
      return keys;
    } catch (_error) {
      return null;
    }
  }

  function _isPlainRecord(value) {
    return _ownDataKeys(value, true) !== null;
  }

  function _hasExactKeys(value, keys) {
    var ownKeys = _ownDataKeys(value, true);
    if (!ownKeys) return false;
    var actual = ownKeys.slice().sort();
    var expected = keys.slice().sort();
    if (actual.length !== expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  function _isDenseDataArray(value) {
    if (!Array.isArray(value)) return false;
    try {
      var ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1 || ownKeys[ownKeys.length - 1] !== 'length') {
        return false;
      }
      var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor
          || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
          || lengthDescriptor.value !== value.length) return false;
      for (var index = 0; index < value.length; index += 1) {
        if (ownKeys[index] !== String(index)) return false;
        var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor
            || descriptor.enumerable !== true
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  function _hasOwn(table, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
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

  function _canonicalProviderForClient(value) {
    if (value === null || value === undefined) return null;
    if (_ownDataKeys(value, false) === null
        || !_hasExactKeys(value, CLIENT_KEYS)
        || !delegationProviders
        || typeof delegationProviders.get !== 'function') return null;
    try {
      var id = Object.getOwnPropertyDescriptor(value, 'id').value;
      var label = Object.getOwnPropertyDescriptor(value, 'label').value;
      var metadata = delegationProviders.get(id);
      if (!metadata || label !== metadata.label) return null;
      return metadata;
    } catch (_error) {
      return null;
    }
  }

  function _normalizeAcceptedIdentity(value, corruptMode) {
    var identity = delegationProviders
      && typeof delegationProviders.validateAcceptedAgentIdentity === 'function'
      ? delegationProviders.validateAcceptedAgentIdentity(value)
      : null;
    if (!identity) {
      if (corruptMode) _corrupt('accepted identity is invalid');
      _persistence('accepted identity must be one exact canonical five-field record');
    }
    return identity;
  }

  function _sameAcceptedIdentity(left, right) {
    if (!left || !right) return false;
    for (var index = 0; index < ACCEPTED_IDENTITY_KEYS.length; index += 1) {
      var key = ACCEPTED_IDENTITY_KEYS[index];
      if (left[key] !== right[key]) return false;
    }
    return true;
  }

  function _clientFromAcceptedIdentity(identity) {
    return Object.freeze({ id: identity.providerId, label: identity.label });
  }

  function _normalizeAllowedTools(value) {
    if (value === null || value === undefined) return [];
    if (!_isDenseDataArray(value)) _persistence('allowedTools must be a dense data array');
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
    if (!_isDenseDataArray(value)) _persistence('toolCalls must be a dense data array');
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

  function _snapshotContext(value) {
    if (value === null || value === undefined) return Object.freeze({});
    var keys = _ownDataKeys(value, false);
    if (!keys) _persistence('context must be an exact own-data record');
    var out = {};
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (!_hasOwn(CONTEXT_KEYS, key)) _persistence('context contains an unknown field');
      var fieldValue;
      try {
        fieldValue = Object.getOwnPropertyDescriptor(value, key).value;
      } catch (_error) {
        _persistence('context descriptor inspection failed');
      }
      if (key === 'acceptedIdentity') {
        out.acceptedIdentity = _normalizeAcceptedIdentity(fieldValue, false);
      } else if (key === 'allowedTools') {
        out.allowedTools = _normalizeAllowedTools(fieldValue);
      } else if (key === 'toolCalls') {
        out.toolCalls = _normalizeToolCounts(fieldValue);
      } else {
        if (fieldValue !== null
            && fieldValue !== undefined
            && typeof fieldValue === 'object') {
          _persistence('context fields must contain only closed scalar data');
        }
        if (key === 'model' && fieldValue !== null && fieldValue !== undefined) {
          _persistence('provider model metadata cannot enter delegation persistence');
        }
        out[key] = fieldValue;
      }
    }
    return _deepFreeze(out);
  }

  function _normalizeTerminalCode(value) {
    return typeof value === 'string' && _hasOwn(VALID_TERMINAL_CODES, value)
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
    if (context && typeof context.state === 'string' && _hasOwn(VALID_STATES, context.state)) {
      return context.state;
    }
    return type === 'state' ? 'idle' : 'running';
  }

  function _defaultTitle(type, payload, context) {
    var name = _value(context, payload, 'toolName', 'tool_name');
    if (typeof name !== 'string' || name.length === 0) name = 'unknown';
    switch (type) {
      case 'init': {
        return context.acceptedIdentity.label + ' connected';
      }
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
    var identity = context.acceptedIdentity;
    return {
      client: _clientFromAcceptedIdentity(identity),
      profileVersion: identity.profileVersion,
      // The closed entry shape remains stable, but provider model identity is
      // never accepted into new durable entries.
      model: null,
      sessionId: _boundedId(_value(context, { sessionId: event.sessionId }, 'sessionId', 'session_id'), 'sessionId', true),
      allowedTools: _normalizeAllowedTools(_value(context, payload, 'allowedTools', 'tools'))
    };
  }

  function _projectTool(type, payload, context) {
    var callId = _value(context, payload, 'callId', type === 'tool_result' ? 'tool_use_id' : 'id');
    var name = _value(context, payload, 'toolName', 'name');
    var status = _value(context, payload, 'toolStatus', 'status');
    if (!_hasOwn(VALID_TOOL_STATUSES, status)) {
      if (type === 'tool_use') status = 'running';
      else if (payload && payload.is_error === true) status = 'failed';
      else if (type === 'tool_result') status = 'succeeded';
      else status = 'unknown';
    }
    return {
      callId: _boundedId(callId, 'tool.callId', true),
      name: _boundedString(typeof name === 'string' && name.length > 0 ? name : 'unknown', MAX_TOOL_NAME_CHARS, 'tool.name', false),
      tabId: _nonnegativeIntegerOrNull(_value(context, payload, 'tabId', 'tab_id')),
      status: status,
      durationMs: _nonnegativeIntegerOrNull(_value(context, payload, 'durationMs', 'duration_ms'))
    };
  }

  function _projectRetry(payload, context) {
    var retryClass = _value(context, payload, 'retryClass', 'class');
    if (!_hasOwn(VALID_RETRY_CLASSES, retryClass)) {
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
    var tokens = payload && _isPlainRecord(payload.tokens) ? payload.tokens : {};
    var inputValue = _value(context, usage, 'inputTokens', 'input_tokens');
    var outputValue = _value(context, usage, 'outputTokens', 'output_tokens');
    var totalValue = _value(context, usage, 'totalTokens', 'total_tokens');
    if (inputValue === undefined) inputValue = _value(null, tokens, 'input');
    if (outputValue === undefined) outputValue = _value(null, tokens, 'output');
    if (totalValue === undefined) totalValue = _value(null, tokens, 'total');
    var inputTokens = _nonnegativeIntegerOrNull(inputValue);
    var outputTokens = _nonnegativeIntegerOrNull(outputValue);
    var totalTokens = _nonnegativeIntegerOrNull(totalValue);
    if (totalTokens === null && inputTokens !== null && outputTokens !== null) {
      var sum = inputTokens + outputTokens;
      totalTokens = Number.isSafeInteger(sum) ? sum : null;
    }
    var billingKind = context.acceptedIdentity.billingKind;
    // Neither shipped agent provider exposes authoritative dollar billing.
    // Payload/context dollar claims are deliberately non-representable.
    var usd = null;
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
    context = _snapshotContext(context);
    if (!context.acceptedIdentity) {
      _persistence('projection requires accepted identity authority');
    }
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
          || !_canonicalProviderForClient(value.client)) {
        _corrupt('init client is invalid');
      }
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
    if (!_hasOwn(VALID_TOOL_STATUSES, value.status)) _corrupt('tool status is invalid');
    _assertNullableBoundedInteger(value.tabId, 'tool tabId');
    _assertNullableBoundedInteger(value.durationMs, 'tool durationMs');
  }

  function _assertValidRetry(value) {
    if (!_hasExactKeys(value, RETRY_KEYS) || !_hasOwn(VALID_RETRY_CLASSES, value.class)) {
      _corrupt('retry payload shape is invalid');
    }
    _assertNullableBoundedInteger(value.attempt, 'retry attempt');
    _assertNullableBoundedInteger(value.maxAttempts, 'retry maxAttempts');
    _assertNullableBoundedInteger(value.delayMs, 'retry delayMs');
  }

  function _assertValidMetrics(value) {
    if (!_hasExactKeys(value, METRICS_KEYS) || !_hasOwn(VALID_BILLING_KINDS, value.billingKind)) {
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
      || !_hasOwn(VALID_KINDS, entry.kind)
      || !_hasOwn(VALID_STATES, entry.state)
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

  function _withoutLegacyToolPresentation(entry) {
    if (!_hasExactKeys(entry, ENTRY_KEYS)
      || entry.kind !== 'tool-call'
      || !_hasExactKeys(entry.tool, LEGACY_TOOL_KEYS)) {
      return { entry: entry, migrated: false };
    }
    // `argsSummary` used to be an allowed presentation field. Do not inspect,
    // stringify, clone, or retain its value: reconstruct only the approved
    // tool identity/status metadata before canonical validation.
    return {
      migrated: true,
      entry: {
        v: entry.v,
        delegationId: entry.delegationId,
        sequence: entry.sequence,
        timestamp: entry.timestamp,
        kind: entry.kind,
        state: entry.state,
        title: entry.title,
        detail: entry.detail,
        init: entry.init,
        tool: {
          callId: entry.tool.callId,
          name: entry.tool.name,
          tabId: entry.tool.tabId,
          status: entry.tool.status,
          durationMs: entry.tool.durationMs
        },
        retry: entry.retry,
        metrics: entry.metrics
      }
    };
  }

  function _assertEntryAcceptedIdentity(entry, acceptedIdentity) {
    if (entry.init !== null
      && (!entry.init.client
        || entry.init.client.id !== acceptedIdentity.providerId
        || entry.init.client.label !== acceptedIdentity.label
        || entry.init.profileVersion !== acceptedIdentity.profileVersion)) {
      _corrupt('persisted init identity changed');
    }
    if (entry.metrics !== null
      && (entry.metrics.billingKind !== acceptedIdentity.billingKind
        || entry.metrics.usd !== null)) {
      _corrupt('persisted billing identity changed');
    }
  }

  function _assertValidEnvelope(envelope, delegationId) {
    if (!_hasExactKeys(envelope, ENVELOPE_KEYS)) {
      _corrupt('ledger envelope shape is invalid');
    }
    if (envelope.v !== PAYLOAD_VERSION || envelope.delegationId !== delegationId) {
      _corrupt('ledger identity is invalid');
    }
    if (typeof envelope.terminal !== 'boolean') _corrupt('ledger terminal flag is invalid');
    if (envelope.terminalCode !== null
      && (typeof envelope.terminalCode !== 'string'
        || !_hasOwn(VALID_TERMINAL_CODES, envelope.terminalCode))) {
      _corrupt('ledger terminal code is invalid');
    }
    if (envelope.terminal !== (envelope.terminalCode !== null)) _corrupt('ledger terminal fields disagree');
    var acceptedIdentity = _normalizeAcceptedIdentity(envelope.acceptedIdentity, true);
    var cleanupPending = envelope.cleanupPending;
    if (cleanupPending !== null) {
      if (!_hasExactKeys(cleanupPending, CLEANUP_PENDING_KEYS)
        || typeof cleanupPending.cancellationConfirmed !== 'boolean'
        || typeof cleanupPending.code !== 'string'
        || !_hasOwn(VALID_TERMINAL_CODES, cleanupPending.code)
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
    var migrated = false;
    var normalizedEntries = [];
    for (var i = 0; i < envelope.entries.length; i++) {
      var normalized = _withoutLegacyToolPresentation(envelope.entries[i]);
      var entry = normalized.entry;
      migrated = migrated || normalized.migrated;
      _assertValidEntry(entry, delegationId, i + 1, true);
      _assertEntryAcceptedIdentity(entry, acceptedIdentity);
      normalizedEntries.push(entry);
    }
    if (!migrated) return envelope;
    return {
      v: envelope.v,
      delegationId: envelope.delegationId,
      acceptedIdentity: envelope.acceptedIdentity,
      terminal: envelope.terminal,
      terminalCode: envelope.terminalCode,
      cleanupPending: envelope.cleanupPending,
      entries: normalizedEntries
    };
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

  function _chunkKey(delegationId, index) {
    return STORAGE_CHUNK_KEY_PREFIX + delegationId + ':' + index;
  }

  function _emptyEnvelope(delegationId, acceptedIdentity) {
    return {
      v: PAYLOAD_VERSION,
      delegationId: delegationId,
      acceptedIdentity: acceptedIdentity,
      terminal: false,
      terminalCode: null,
      cleanupPending: null,
      entries: []
    };
  }

  var _storageTail = Promise.resolve();
  function _withStorageLock(operation) {
    var next = _storageTail.then(operation, operation);
    _storageTail = next.then(function() {}, function() {});
    return next;
  }

  var _namespaceReady = false;
  var _catalogIds = [];
  var _aggregateBytes = 0;
  var _knownEnvelopeBytes = Object.create(null);

  function _catalogForIds(ids) {
    return { v: STORAGE_LAYOUT_VERSION, delegationIds: ids.slice() };
  }

  function _assertValidCatalog(catalog) {
    if (!_hasExactKeys(catalog, CATALOG_KEYS)
      || catalog.v !== STORAGE_LAYOUT_VERSION
      || !_isDenseDataArray(catalog.delegationIds)) {
      _corrupt('delegation ledger catalog is invalid');
    }
    var previous = null;
    for (var index = 0; index < catalog.delegationIds.length; index += 1) {
      var delegationId = catalog.delegationIds[index];
      if (typeof delegationId !== 'string'
        || !delegationId
        || _characterLength(delegationId) > MAX_ID_CHARS
        || (previous !== null && previous >= delegationId)) {
        _corrupt('delegation ledger catalog ids are invalid');
      }
      previous = delegationId;
    }
    return catalog;
  }

  function _envelopeFromManifest(manifest, entries) {
    return {
      v: PAYLOAD_VERSION,
      delegationId: manifest.delegationId,
      acceptedIdentity: manifest.acceptedIdentity,
      terminal: manifest.terminal,
      terminalCode: manifest.terminalCode,
      cleanupPending: manifest.cleanupPending,
      entries: entries
    };
  }

  function _canonicalEnvelopeBytes(manifest, entriesBytes) {
    var emptyBytes = _serializedBytes(_envelopeFromManifest(manifest, []));
    return emptyBytes - 2 + entriesBytes;
  }

  function _assertValidManifest(manifest, delegationId) {
    if (!_hasExactKeys(manifest, MANIFEST_KEYS)
      || manifest.v !== STORAGE_LAYOUT_VERSION
      || manifest.delegationId !== delegationId) {
      _corrupt('delegation ledger manifest shape is invalid');
    }
    _assertValidEnvelope(_envelopeFromManifest(manifest, []), delegationId);
    if (_nonnegativeIntegerOrNull(manifest.entryCount) === null
      || manifest.entryCount > MAX_ENTRIES_PER_DELEGATION
      || _nonnegativeIntegerOrNull(manifest.sealedChunkCount) === null
      || !_isDenseDataArray(manifest.activeEntries)
      || manifest.activeEntries.length > STORAGE_CHUNK_ENTRIES
      || manifest.entryCount !== (
        manifest.sealedChunkCount * STORAGE_CHUNK_ENTRIES + manifest.activeEntries.length
      )
      || _nonnegativeIntegerOrNull(manifest.entriesBytes) === null
      || manifest.entriesBytes < 2
      || _nonnegativeIntegerOrNull(manifest.envelopeBytes) === null
      || manifest.envelopeBytes !== _canonicalEnvelopeBytes(manifest, manifest.entriesBytes)
      || manifest.envelopeBytes > MAX_AGGREGATE_BYTES) {
      _corrupt('delegation ledger manifest accounting is invalid');
    }
    var firstSequence = manifest.sealedChunkCount * STORAGE_CHUNK_ENTRIES + 1;
    for (var index = 0; index < manifest.activeEntries.length; index += 1) {
      var normalized = _withoutLegacyToolPresentation(manifest.activeEntries[index]);
      if (normalized.migrated) _corrupt('v2 manifest contains a legacy entry');
      _assertValidEntry(normalized.entry, delegationId, firstSequence + index, true);
      _assertEntryAcceptedIdentity(normalized.entry, manifest.acceptedIdentity);
    }
    return manifest;
  }

  function _assertValidChunk(chunk, delegationId, index) {
    if (!_hasExactKeys(chunk, CHUNK_KEYS)
      || chunk.v !== STORAGE_LAYOUT_VERSION
      || chunk.delegationId !== delegationId
      || chunk.index !== index
      || !_isDenseDataArray(chunk.entries)
      || chunk.entries.length !== STORAGE_CHUNK_ENTRIES) {
      _corrupt('delegation ledger chunk shape is invalid');
    }
    var firstSequence = index * STORAGE_CHUNK_ENTRIES + 1;
    for (var row = 0; row < chunk.entries.length; row += 1) {
      var normalized = _withoutLegacyToolPresentation(chunk.entries[row]);
      if (normalized.migrated) _corrupt('v2 chunk contains a legacy entry');
      _assertValidEntry(normalized.entry, delegationId, firstSequence + row, true);
    }
    return chunk;
  }

  function _reconstructEnvelope(manifest, chunks) {
    var entries = [];
    for (var index = 0; index < manifest.sealedChunkCount; index += 1) {
      var key = _chunkKey(manifest.delegationId, index);
      if (!Object.prototype.hasOwnProperty.call(chunks, key)) {
        _corrupt('delegation ledger chunk is missing');
      }
      var chunk = _assertValidChunk(chunks[key], manifest.delegationId, index);
      entries = entries.concat(chunk.entries);
    }
    entries = entries.concat(manifest.activeEntries);
    if (entries.length !== manifest.entryCount) {
      _corrupt('delegation ledger entry count is invalid');
    }
    var envelope = _envelopeFromManifest(manifest, entries);
    var normalized = _assertValidEnvelope(envelope, manifest.delegationId);
    if (normalized !== envelope) _corrupt('v2 ledger contains a legacy entry');
    if (_serializedBytes(entries) !== manifest.entriesBytes
      || _serializedBytes(envelope) !== manifest.envelopeBytes) {
      _corrupt('delegation ledger aggregate accounting changed');
    }
    return envelope;
  }

  async function _readEnvelopeForManifest(manifest) {
    var keys = [];
    for (var index = 0; index < manifest.sealedChunkCount; index += 1) {
      keys.push(_chunkKey(manifest.delegationId, index));
    }
    var chunks = keys.length > 0 ? await _read(keys) : {};
    return _reconstructEnvelope(manifest, chunks);
  }

  function _manifestFromEnvelope(envelope) {
    var sealedChunkCount = envelope.entries.length === 0
      ? 0
      : Math.floor((envelope.entries.length - 1) / STORAGE_CHUNK_ENTRIES);
    var activeStart = sealedChunkCount * STORAGE_CHUNK_ENTRIES;
    return {
      v: STORAGE_LAYOUT_VERSION,
      delegationId: envelope.delegationId,
      acceptedIdentity: envelope.acceptedIdentity,
      terminal: envelope.terminal,
      terminalCode: envelope.terminalCode,
      cleanupPending: envelope.cleanupPending,
      entryCount: envelope.entries.length,
      sealedChunkCount: sealedChunkCount,
      entriesBytes: _serializedBytes(envelope.entries),
      envelopeBytes: _serializedBytes(envelope),
      activeEntries: envelope.entries.slice(activeStart)
    };
  }

  function _chunksFromEnvelope(envelope, manifest) {
    var chunks = [];
    for (var index = 0; index < manifest.sealedChunkCount; index += 1) {
      chunks.push({
        v: STORAGE_LAYOUT_VERSION,
        delegationId: envelope.delegationId,
        index: index,
        entries: envelope.entries.slice(
          index * STORAGE_CHUNK_ENTRIES,
          (index + 1) * STORAGE_CHUNK_ENTRIES
        )
      });
    }
    return chunks;
  }

  function _setNamespaceState(rows) {
    var ids = [];
    var aggregateBytes = 0;
    var known = Object.create(null);
    rows.forEach(function(row) {
      ids.push(row.delegationId);
      aggregateBytes += row.manifest.envelopeBytes;
      known[row.delegationId] = row.manifest.envelopeBytes;
    });
    if (aggregateBytes > MAX_AGGREGATE_BYTES) {
      _corrupt('persisted aggregate ledger exceeds quota');
    }
    _catalogIds = ids;
    _aggregateBytes = aggregateBytes;
    _knownEnvelopeBytes = known;
    _namespaceReady = true;
  }

  async function _loadV2Namespace(catalog) {
    _assertValidCatalog(catalog);
    var manifestKeys = catalog.delegationIds.map(_key);
    var storedManifests = manifestKeys.length > 0 ? await _read(manifestKeys) : {};
    var rows = [];
    var chunkKeys = [];
    catalog.delegationIds.forEach(function(delegationId) {
      var key = _key(delegationId);
      if (!Object.prototype.hasOwnProperty.call(storedManifests, key)) {
        _corrupt('catalog-listed delegation manifest is missing');
      }
      var manifest = _assertValidManifest(storedManifests[key], delegationId);
      for (var index = 0; index < manifest.sealedChunkCount; index += 1) {
        chunkKeys.push(_chunkKey(delegationId, index));
      }
      rows.push({ delegationId: delegationId, manifest: manifest, envelope: null });
    });
    var chunks = chunkKeys.length > 0 ? await _read(chunkKeys) : {};
    rows.forEach(function(row) {
      row.envelope = _reconstructEnvelope(row.manifest, chunks);
    });
    _setNamespaceState(rows);
    return rows;
  }

  async function _migrateLegacyNamespace(all) {
    var rows = [];
    Object.keys(all).sort().forEach(function(key) {
      if (key.indexOf(STORAGE_KEY_PREFIX) !== 0) return;
      var delegationId = key.slice(STORAGE_KEY_PREFIX.length);
      if (!delegationId || _characterLength(delegationId) > MAX_ID_CHARS) {
        _corrupt('ledger storage key is invalid');
      }
      var envelope = _assertValidEnvelope(all[key], delegationId);
      var manifest = _manifestFromEnvelope(envelope);
      _assertValidManifest(manifest, delegationId);
      rows.push({ delegationId: delegationId, manifest: manifest, envelope: envelope });
    });
    var aggregateBytes = rows.reduce(function(total, row) {
      return total + row.manifest.envelopeBytes;
    }, 0);
    if (aggregateBytes > MAX_AGGREGATE_BYTES) {
      _corrupt('persisted aggregate ledger exceeds quota');
    }
    var ids = rows.map(function(row) { return row.delegationId; });
    var update = {};
    update[STORAGE_CATALOG_KEY] = _catalogForIds(ids);
    rows.forEach(function(row) {
      update[_key(row.delegationId)] = row.manifest;
      _chunksFromEnvelope(row.envelope, row.manifest).forEach(function(chunk) {
        update[_chunkKey(row.delegationId, chunk.index)] = chunk;
      });
    });
    await _write(update);
    _setNamespaceState(rows);
    return rows;
  }

  async function _loadNamespace(force) {
    if (_namespaceReady && !force) return null;
    var catalogRow = await _read(STORAGE_CATALOG_KEY);
    if (Object.prototype.hasOwnProperty.call(catalogRow, STORAGE_CATALOG_KEY)) {
      return _loadV2Namespace(catalogRow[STORAGE_CATALOG_KEY]);
    }
    return _migrateLegacyNamespace(await _read(null));
  }

  async function _currentManifest(delegationId) {
    await _loadNamespace(false);
    var listed = _catalogIds.indexOf(delegationId) !== -1;
    var key = _key(delegationId);
    var stored = await _read(key);
    var present = Object.prototype.hasOwnProperty.call(stored, key);
    if (listed !== present) {
      _corrupt(listed
        ? 'catalog-listed delegation manifest is missing'
        : 'delegation manifest is absent from the catalog');
    }
    if (!present) return null;
    var manifest = _assertValidManifest(stored[key], delegationId);
    if (_knownEnvelopeBytes[delegationId] !== manifest.envelopeBytes) {
      _corrupt('delegation manifest changed outside the serialized store');
    }
    return manifest;
  }

  function _emptyManifest(delegationId, acceptedIdentity) {
    return _manifestFromEnvelope(_emptyEnvelope(delegationId, acceptedIdentity));
  }

  function _metadataManifest(current, terminal, terminalCode, cleanupPending) {
    var next = {
      v: STORAGE_LAYOUT_VERSION,
      delegationId: current.delegationId,
      acceptedIdentity: current.acceptedIdentity,
      terminal: terminal,
      terminalCode: terminalCode,
      cleanupPending: cleanupPending,
      entryCount: current.entryCount,
      sealedChunkCount: current.sealedChunkCount,
      entriesBytes: current.entriesBytes,
      envelopeBytes: 0,
      activeEntries: current.activeEntries.slice()
    };
    next.envelopeBytes = _canonicalEnvelopeBytes(next, next.entriesBytes);
    return _assertValidManifest(next, next.delegationId);
  }

  function _manifestWithEntry(current, entry, terminal, terminalCode, cleanupPending) {
    var preparedChunk = null;
    var activeEntries;
    var sealedChunkCount = current.sealedChunkCount;
    if (current.activeEntries.length === STORAGE_CHUNK_ENTRIES) {
      preparedChunk = {
        v: STORAGE_LAYOUT_VERSION,
        delegationId: current.delegationId,
        index: current.sealedChunkCount,
        entries: current.activeEntries.slice()
      };
      activeEntries = [entry];
      sealedChunkCount += 1;
    } else {
      activeEntries = current.activeEntries.concat([entry]);
    }
    var entryBytes = _serializedBytes(entry);
    var entriesBytes = current.entryCount === 0
      ? 2 + entryBytes
      : current.entriesBytes + 1 + entryBytes;
    var next = {
      v: STORAGE_LAYOUT_VERSION,
      delegationId: current.delegationId,
      acceptedIdentity: current.acceptedIdentity,
      terminal: terminal,
      terminalCode: terminalCode,
      cleanupPending: cleanupPending,
      entryCount: current.entryCount + 1,
      sealedChunkCount: sealedChunkCount,
      entriesBytes: entriesBytes,
      envelopeBytes: 0,
      activeEntries: activeEntries
    };
    next.envelopeBytes = _canonicalEnvelopeBytes(next, entriesBytes);
    _assertValidManifest(next, next.delegationId);
    return { manifest: next, preparedChunk: preparedChunk };
  }

  function _nextAggregateBytes(current, next) {
    return _aggregateBytes - (current ? current.envelopeBytes : 0) + next.envelopeBytes;
  }

  function _idsWith(delegationId) {
    var ids = _catalogIds.concat([delegationId]);
    ids.sort();
    return ids;
  }

  async function _commitManifest(current, next, preparedChunk) {
    if (preparedChunk) {
      var preparedKey = _chunkKey(next.delegationId, preparedChunk.index);
      var existing = await _read(preparedKey);
      if (Object.prototype.hasOwnProperty.call(existing, preparedKey)) {
        var existingChunk = _assertValidChunk(
          existing[preparedKey],
          next.delegationId,
          preparedChunk.index
        );
        if (JSON.stringify(existingChunk.entries) !== JSON.stringify(preparedChunk.entries)) {
          _corrupt('prepared delegation chunk conflicts with the active manifest');
        }
      } else {
        var chunkUpdate = {};
        chunkUpdate[preparedKey] = preparedChunk;
        await _write(chunkUpdate);
      }
    }
    var update = {};
    update[_key(next.delegationId)] = next;
    var isNew = !current;
    var nextIds = isNew ? _idsWith(next.delegationId) : _catalogIds;
    if (isNew) update[STORAGE_CATALOG_KEY] = _catalogForIds(nextIds);
    await _write(update);
    _aggregateBytes = _nextAggregateBytes(current, next);
    _knownEnvelopeBytes[next.delegationId] = next.envelopeBytes;
    if (isNew) _catalogIds = nextIds;
  }

  async function appendBeforeFanout(delegationId, event, context) {
    delegationId = _boundedId(delegationId, 'delegationId', false);
    // Capture and validate caller-owned data synchronously, before the first
    // storage await can give mutable references a chance to drift.
    context = _snapshotContext(context);
    var acceptedIdentity = context.acceptedIdentity;
    if (!acceptedIdentity) _persistence('append requires accepted identity authority');
    return _withStorageLock(async function() {
      var persisted = await _currentManifest(delegationId);
      var current = persisted || _emptyManifest(delegationId, acceptedIdentity);
      if (!_sameAcceptedIdentity(current.acceptedIdentity, acceptedIdentity)) {
        _persistence('accepted identity changed after delegation acceptance');
      }
      if (current.terminal) _persistence('cannot append to a terminal ledger');
      if (current.cleanupPending) _persistence('cannot append while cleanup is pending');
      if (current.entryCount >= MAX_ENTRIES_PER_DELEGATION) {
        _quota('delegation entry count limit reached');
      }
      var projectionContext = {};
      Object.keys(context).forEach(function(key) { projectionContext[key] = context[key]; });
      projectionContext.delegationId = delegationId;
      projectionContext.sequence = current.entryCount + 1;
      projectionContext.timestamp = Number.isSafeInteger(context.timestamp) && context.timestamp >= 0
        ? context.timestamp
        : Date.now();
      var entry = project(event, projectionContext);
      var pending = _manifestWithEntry(current, entry, false, null, null);
      if (_nextAggregateBytes(persisted, pending.manifest)
          > MAX_AGGREGATE_BYTES - TERMINAL_MARKER_HEADROOM_BYTES) {
        _quota('aggregate delegation ledger limit reached');
      }
      await _commitManifest(persisted, pending.manifest, pending.preparedChunk);
      return _deepFreeze(_clone(entry));
    });
  }

  async function hydrateNonterminal() {
    return _withStorageLock(async function() {
      var rows = await _loadNamespace(true);
      var ledgers = [];
      rows.forEach(function(row) {
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
      var terminal = [];
      var rows = await _loadNamespace(true);
      rows.forEach(function(row) {
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
    var cleanupIdentity = cleanup && cleanup.acceptedIdentity !== undefined
      ? _normalizeAcceptedIdentity(cleanup.acceptedIdentity, false)
      : null;
    return _withStorageLock(async function() {
      var persisted = await _currentManifest(delegationId);
      var current = persisted || (cleanupIdentity
        ? _emptyManifest(delegationId, cleanupIdentity)
        : null);
      if (!current) _persistence('cannot quarantine a delegation without accepted identity');
      if (cleanupIdentity
        && !_sameAcceptedIdentity(current.acceptedIdentity, cleanupIdentity)) {
        _persistence('cleanup accepted identity changed');
      }
      if (current.terminal) _persistence('cannot quarantine a terminal ledger');
      var currentEnvelope = persisted
        ? await _readEnvelopeForManifest(current)
        : _emptyEnvelope(delegationId, current.acceptedIdentity);
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
          return _deepFreeze(_clone(currentEnvelope));
        }
        var promoted = _metadataManifest(current, false, null, marker);
        if (_nextAggregateBytes(persisted, promoted) > MAX_AGGREGATE_BYTES) {
          _quota('aggregate delegation ledger limit reached');
        }
        await _commitManifest(persisted, promoted, null);
        var promotedEnvelope = _envelopeFromManifest(promoted, currentEnvelope.entries.slice());
        _assertValidEnvelope(promotedEnvelope, delegationId);
        return _deepFreeze(_clone(promotedEnvelope));
      }
      var next = _metadataManifest(current, false, null, marker);
      if (_nextAggregateBytes(persisted, next) > MAX_AGGREGATE_BYTES) {
        _quota('aggregate delegation ledger limit reached');
      }
      await _commitManifest(persisted, next, null);
      var nextEnvelope = _envelopeFromManifest(next, currentEnvelope.entries.slice());
      _assertValidEnvelope(nextEnvelope, delegationId);
      return _deepFreeze(_clone(nextEnvelope));
    });
  }

  async function markTerminal(delegationId, terminal) {
    delegationId = _boundedId(delegationId, 'delegationId', false);
    var terminalContext = terminal && _isPlainRecord(terminal.context)
      ? _snapshotContext(terminal.context)
      : Object.freeze({});
    return _withStorageLock(async function() {
      var current = await _currentManifest(delegationId);
      if (!current) _persistence('cannot terminate a delegation without accepted identity');
      if (terminalContext.acceptedIdentity
        && !_sameAcceptedIdentity(current.acceptedIdentity, terminalContext.acceptedIdentity)) {
        _persistence('terminal accepted identity changed');
      }
      var candidate = typeof terminal === 'string'
        ? terminal
        : terminal && terminal.code;
      var code = _normalizeTerminalCode(candidate);
      var currentEnvelope = await _readEnvelopeForManifest(current);
      if (current.terminal) {
        if (current.terminalCode !== code) _corrupt('terminal code conflicts with persisted ledger');
        return _deepFreeze(_clone(currentEnvelope));
      }
      if (current.cleanupPending && current.cleanupPending.code !== code) {
        _corrupt('terminal code conflicts with cleanup marker');
      }
      if (current.cleanupPending
        && current.cleanupPending.cancellationConfirmed !== true) {
        _persistence('cannot mark terminal before cancellation confirmation');
      }
      var terminalEntry = null;
      if (terminal && _isPlainRecord(terminal.event)
        && current.entryCount < MAX_ENTRIES_PER_DELEGATION) {
        var projectedTerminalContext = {};
        Object.keys(terminalContext).forEach(function(key) {
          projectedTerminalContext[key] = terminalContext[key];
        });
        projectedTerminalContext.delegationId = delegationId;
        projectedTerminalContext.sequence = current.entryCount + 1;
        projectedTerminalContext.terminalCode = code;
        projectedTerminalContext.acceptedIdentity = current.acceptedIdentity;
        projectedTerminalContext.timestamp = Number.isSafeInteger(terminalContext.timestamp)
          && terminalContext.timestamp >= 0
          ? terminalContext.timestamp
          : Date.now();
        terminalEntry = project(terminal.event, projectedTerminalContext);
      }
      var pending = terminalEntry
        ? _manifestWithEntry(current, terminalEntry, true, code, null)
        : { manifest: _metadataManifest(current, true, code, null), preparedChunk: null };
      if (_nextAggregateBytes(current, pending.manifest) > MAX_AGGREGATE_BYTES) {
        _quota('aggregate delegation ledger limit reached');
      }
      await _commitManifest(current, pending.manifest, pending.preparedChunk);
      var entries = currentEnvelope.entries.slice();
      if (terminalEntry) entries.push(terminalEntry);
      var nextEnvelope = _envelopeFromManifest(pending.manifest, entries);
      _assertValidEnvelope(nextEnvelope, delegationId);
      return _deepFreeze(_clone(nextEnvelope));
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
