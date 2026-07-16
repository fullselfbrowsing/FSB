// Sanitized, pre-throttled reporting for authoritative agent protocol drift.

(function(global) {
  'use strict';

  var REPORT_WINDOW_MS = 10000;
  var MAX_LABEL_LENGTH = 64;
  var MAX_ADAPTER_TIMESTAMPS = 1;
  var CANONICAL_ADAPTER_ID = 'claude-code';

  var EXPECTED_BY_OBSERVED = Object.freeze({
    invalid_utf8: 'bounded_jsonl',
    invalid_json: 'bounded_jsonl',
    line_too_large: 'bounded_jsonl',
    invalid_shape: 'known_event_shape',
    configuration_surface: 'known_event_shape',
    unknown_event_type: 'known_event_shape',
    unknown_stream_event: 'known_event_shape',
    unknown_system_subtype: 'known_event_shape',
    event_before_init: 'single_init_session',
    duplicate_init: 'single_init_session',
    session_mismatch: 'single_init_session',
    missing_result: 'single_terminal_result',
    duplicate_result: 'single_terminal_result',
    event_after_result: 'single_terminal_result',
    protocol_drift: 'adapter_contract'
  });

  var REQUIRED_KEYS = Object.freeze(['adapterId', 'expected', 'observed']);
  var _lastAdmittedByAdapter = new Map();

  function isSafeLabel(value) {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= MAX_LABEL_LENGTH;
  }

  function readExactDataRecord(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

      var prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return null;

      var keys = Reflect.ownKeys(value);
      if (keys.length !== REQUIRED_KEYS.length) return null;
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        if (typeof keys[keyIndex] !== 'string' || REQUIRED_KEYS.indexOf(keys[keyIndex]) === -1) {
          return null;
        }
      }

      var descriptors = Object.getOwnPropertyDescriptors(value);
      var record = {};
      for (var requiredIndex = 0; requiredIndex < REQUIRED_KEYS.length; requiredIndex += 1) {
        var requiredKey = REQUIRED_KEYS[requiredIndex];
        var descriptor = descriptors[requiredKey];
        if (!descriptor
            || descriptor.enumerable !== true
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          return null;
        }
        record[requiredKey] = descriptor.value;
      }
      return record;
    } catch (_error) {
      return null;
    }
  }

  function validateAgentProtocolDriftDetail(detail) {
    var record = readExactDataRecord(detail);
    if (!record
        || !isSafeLabel(record.adapterId)
        || !isSafeLabel(record.expected)
        || !isSafeLabel(record.observed)
        || record.adapterId !== CANONICAL_ADAPTER_ID
        || !Object.prototype.hasOwnProperty.call(EXPECTED_BY_OBSERVED, record.observed)
        || EXPECTED_BY_OBSERVED[record.observed] !== record.expected) {
      return null;
    }

    return Object.freeze({
      adapterId: record.adapterId,
      expected: record.expected,
      observed: record.observed
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
        && _lastAdmittedByAdapter.size >= MAX_ADAPTER_TIMESTAMPS) {
      var oldestKey = _lastAdmittedByAdapter.keys().next().value;
      _lastAdmittedByAdapter.delete(oldestKey);
    }
    _lastAdmittedByAdapter.set(adapterId, timestamp);
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

      rememberAdmission(safeDetail.adapterId, timestamp);

      var sink = resolveSink(options);
      if (typeof sink === 'function') {
        try {
          sink(
            'BG',
            'agent-protocol-drift',
            'Agent protocol drift detected',
            {
              adapterId: safeDetail.adapterId,
              expected: safeDetail.expected,
              observed: safeDetail.observed
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
    EXPECTED_BY_OBSERVED: EXPECTED_BY_OBSERVED,
    MAX_ADAPTER_TIMESTAMPS: MAX_ADAPTER_TIMESTAMPS,
    REPORT_WINDOW_MS: REPORT_WINDOW_MS,
    validateAgentProtocolDriftDetail: validateAgentProtocolDriftDetail,
    reportAgentProtocolDrift: reportAgentProtocolDrift,
    _getTrackedAdapterCount: _getTrackedAdapterCount,
    _resetForTests: _resetForTests
  });

  if (global) {
    global.FsbAgentProtocolDriftDiagnostics = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
