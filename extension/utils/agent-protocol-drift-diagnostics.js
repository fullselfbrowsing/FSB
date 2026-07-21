// Sanitized, pre-throttled reporting for authoritative agent protocol drift.

(function(global) {
  'use strict';

  var REPORT_WINDOW_MS = 10000;
  var MAX_ADAPTER_TIMESTAMPS = 2;
  var MAX_PROFILE_VERSION_LENGTH = 128;
  var MAX_EVENT_INDEX = 4097;
  var MAX_ISSUE_PATHS = 16;
  var MAX_ISSUE_PATH_LENGTH = 128;
  var delegationProviders = global && global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('./delegation-providers.js');
  }

  var EXPECTED_BY_REASON = Object.freeze({
    configuration_surface: 'known_event_shape',
    counter_overflow: 'bounded_jsonl',
    duplicate_id: 'known_event_shape',
    duplicate_init: 'single_init_session',
    duplicate_result: 'single_terminal_result',
    event_after_result: 'single_terminal_result',
    event_before_init: 'single_init_session',
    invalid_json: 'bounded_jsonl',
    invalid_order: 'known_event_shape',
    invalid_shape: 'known_event_shape',
    invalid_utf8: 'bounded_jsonl',
    line_too_large: 'bounded_jsonl',
    missing_result: 'single_terminal_result',
    provider_error: 'adapter_contract',
    session_mismatch: 'single_init_session',
    stream_too_large: 'bounded_jsonl',
    unknown_event_type: 'known_event_shape',
    unknown_stream_event: 'known_event_shape',
    unknown_system_subtype: 'known_event_shape'
  });

  var REASONS_BY_ADAPTER = Object.freeze({
    'claude-code': Object.freeze([
      'configuration_surface',
      'duplicate_init',
      'duplicate_result',
      'event_after_result',
      'event_before_init',
      'invalid_json',
      'invalid_shape',
      'invalid_utf8',
      'line_too_large',
      'missing_result',
      'session_mismatch',
      'unknown_event_type',
      'unknown_stream_event',
      'unknown_system_subtype'
    ]),
    opencode: Object.freeze([
      'counter_overflow',
      'duplicate_id',
      'duplicate_result',
      'event_after_result',
      'event_before_init',
      'invalid_json',
      'invalid_order',
      'invalid_shape',
      'invalid_utf8',
      'line_too_large',
      'missing_result',
      'provider_error',
      'session_mismatch',
      'stream_too_large',
      'unknown_event_type'
    ])
  });

  var SAFE_ISSUE_PATH_SEGMENTS = Object.freeze({
    attachments: true,
    attempt: true,
    cache: true,
    callID: true,
    compacted: true,
    content: true,
    cost: true,
    end: true,
    error: true,
    event: true,
    hooks: true,
    id: true,
    ignored: true,
    input: true,
    is_error: true,
    max_retries: true,
    mcp_servers: true,
    message: true,
    messageID: true,
    metadata: true,
    name: true,
    output: true,
    part: true,
    plugins: true,
    read: true,
    reason: true,
    reasoning: true,
    retry_delay_ms: true,
    session_id: true,
    sessionID: true,
    shape: true,
    snapshot: true,
    start: true,
    state: true,
    status: true,
    subtype: true,
    synthetic: true,
    text: true,
    time: true,
    timestamp: true,
    title: true,
    tokens: true,
    tool: true,
    tools: true,
    total: true,
    type: true,
    write: true
  });

  var REQUIRED_KEYS = Object.freeze([
    'adapterId',
    'profileVersion',
    'reason',
    'expected',
    'eventIndex',
    'issuePaths'
  ]);
  var PROFILE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
  var _lastAdmittedByAdapter = new Map();

  function hasOwn(table, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
  }

  function readExactDataRecord(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      if (Object.getPrototypeOf(value) !== Object.prototype) return null;
      var keys = Reflect.ownKeys(value);
      if (keys.length !== REQUIRED_KEYS.length) return null;
      var descriptors = Object.getOwnPropertyDescriptors(value);
      var record = {};
      for (var index = 0; index < REQUIRED_KEYS.length; index += 1) {
        var key = REQUIRED_KEYS[index];
        if (keys.indexOf(key) === -1) return null;
        var descriptor = descriptors[key];
        if (!descriptor
          || descriptor.enumerable !== true
          || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        record[key] = descriptor.value;
      }
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        if (typeof keys[keyIndex] !== 'string'
          || REQUIRED_KEYS.indexOf(keys[keyIndex]) === -1) return null;
      }
      return record;
    } catch (_error) {
      return null;
    }
  }

  function isSafeIssuePath(value) {
    if (typeof value !== 'string'
      || value.length === 0
      || value.length > MAX_ISSUE_PATH_LENGTH) return false;
    var segments = value.split('.');
    if (segments.length === 0) return false;
    for (var index = 0; index < segments.length; index += 1) {
      var segment = segments[index];
      if (!segment
        || (!/^\d+$/.test(segment) && !hasOwn(SAFE_ISSUE_PATH_SEGMENTS, segment))) {
        return false;
      }
    }
    return true;
  }

  function readIssuePaths(value) {
    try {
      if (!Array.isArray(value)
        || Object.getPrototypeOf(value) !== Array.prototype
        || value.length > MAX_ISSUE_PATHS) return null;
      var keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys[keys.length - 1] !== 'length') return null;
      var paths = [];
      for (var index = 0; index < value.length; index += 1) {
        if (keys[index] !== String(index)) return null;
        var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor
          || descriptor.enumerable !== true
          || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          || !isSafeIssuePath(descriptor.value)) return null;
        paths.push(descriptor.value);
      }
      return Object.freeze(paths);
    } catch (_error) {
      return null;
    }
  }

  function validateAgentProtocolDriftDetail(detail) {
    var record = readExactDataRecord(detail);
    if (!record
      || typeof record.adapterId !== 'string'
      || typeof record.profileVersion !== 'string'
      || record.profileVersion.length > MAX_PROFILE_VERSION_LENGTH
      || !PROFILE_VERSION_PATTERN.test(record.profileVersion)
      || typeof record.reason !== 'string'
      || typeof record.expected !== 'string'
      || !Number.isSafeInteger(record.eventIndex)
      || record.eventIndex < 1
      || record.eventIndex > MAX_EVENT_INDEX
      || !delegationProviders
      || typeof delegationProviders.get !== 'function') return null;

    var provider = delegationProviders.get(record.adapterId);
    var reasons = provider && hasOwn(REASONS_BY_ADAPTER, provider.id)
      ? REASONS_BY_ADAPTER[provider.id]
      : null;
    var issuePaths = readIssuePaths(record.issuePaths);
    if (!provider
      || !reasons
      || reasons.indexOf(record.reason) === -1
      || !hasOwn(EXPECTED_BY_REASON, record.reason)
      || EXPECTED_BY_REASON[record.reason] !== record.expected
      || !issuePaths) return null;

    return Object.freeze({
      adapterId: provider.id,
      profileVersion: record.profileVersion,
      reason: record.reason,
      expected: record.expected,
      eventIndex: record.eventIndex,
      issuePaths: issuePaths
    });
  }

  function readInjectedFunction(options, key) {
    try {
      if (!options || (typeof options !== 'object' && typeof options !== 'function')) {
        return { present: false, value: null };
      }
      var descriptor = Object.getOwnPropertyDescriptor(options, key);
      if (!descriptor) return { present: false, value: null };
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return { present: true, value: null };
      }
      return {
        present: true,
        value: typeof descriptor.value === 'function' ? descriptor.value : null
      };
    } catch (_error) {
      return { present: true, value: null };
    }
  }

  function resolveClock(options) {
    var injected = readInjectedFunction(options, 'now');
    if (injected.present) return injected.value;
    return function() { return Date.now(); };
  }

  function resolveSink(options) {
    var injected = readInjectedFunction(options, 'rateLimitedWarn');
    if (injected.present) return injected.value;
    try {
      return global && typeof global.rateLimitedWarn === 'function'
        ? global.rateLimitedWarn
        : null;
    } catch (_error) {
      return null;
    }
  }

  function rememberAdmission(adapterId, timestamp) {
    if (!_lastAdmittedByAdapter.has(adapterId)
      && _lastAdmittedByAdapter.size >= MAX_ADAPTER_TIMESTAMPS) return false;
    _lastAdmittedByAdapter.set(adapterId, timestamp);
    return true;
  }

  function reportAgentProtocolDrift(detail, options) {
    try {
      var safeDetail = validateAgentProtocolDriftDetail(detail);
      if (!safeDetail) return false;
      var nowFn = resolveClock(options);
      if (typeof nowFn !== 'function') return false;
      var timestamp = nowFn();
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) {
        return false;
      }
      var hasPrevious = _lastAdmittedByAdapter.has(safeDetail.adapterId);
      var previous = hasPrevious ? _lastAdmittedByAdapter.get(safeDetail.adapterId) : null;
      if (hasPrevious && timestamp >= previous && timestamp - previous < REPORT_WINDOW_MS) {
        return false;
      }
      if (!rememberAdmission(safeDetail.adapterId, timestamp)) return false;

      var sink = resolveSink(options);
      if (typeof sink === 'function') {
        try {
          sink(
            'BG',
            'agent-protocol-drift',
            'Agent protocol drift detected',
            {
              adapterId: safeDetail.adapterId,
              profileVersion: safeDetail.profileVersion,
              reason: safeDetail.reason,
              expected: safeDetail.expected,
              eventIndex: safeDetail.eventIndex,
              issuePaths: safeDetail.issuePaths.slice()
            }
          );
        } catch (_error) {
          // Diagnostics must never affect terminal settlement.
        }
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  function _resetForTests() {
    _lastAdmittedByAdapter = new Map();
  }

  function _getTrackedAdapterCount() {
    return _lastAdmittedByAdapter.size;
  }

  var api = Object.freeze({
    EXPECTED_BY_OBSERVED: EXPECTED_BY_REASON,
    EXPECTED_BY_REASON: EXPECTED_BY_REASON,
    REASONS_BY_ADAPTER: REASONS_BY_ADAPTER,
    MAX_ADAPTER_TIMESTAMPS: MAX_ADAPTER_TIMESTAMPS,
    REPORT_WINDOW_MS: REPORT_WINDOW_MS,
    validateAgentProtocolDriftDetail: validateAgentProtocolDriftDetail,
    reportAgentProtocolDrift: reportAgentProtocolDrift,
    _getTrackedAdapterCount: _getTrackedAdapterCount,
    _resetForTests: _resetForTests
  });

  if (global) global.FsbAgentProtocolDriftDiagnostics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
