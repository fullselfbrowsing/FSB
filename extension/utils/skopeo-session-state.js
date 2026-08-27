(function() {
  'use strict';

  var STORAGE_KEY_PREFIX = 'skopeoSession:';
  var PREPARED_ACTIVE_REASON = 'prepared-awaiting-commit';

  var STATUS = Object.freeze({
    OFF: 'off',
    STARTING: 'starting',
    ACTIVE: 'active',
    TERMINATING: 'terminating'
  });

  function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }

  function isGeneration(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }

  function isTimestamp(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function isKnownStatus(value) {
    return value === STATUS.OFF ||
      value === STATUS.STARTING ||
      value === STATUS.ACTIVE ||
      value === STATUS.TERMINATING;
  }

  function isTerminationReason(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isReasonValidForStatus(status, reason) {
    if (status === STATUS.STARTING) return reason === null;
    if (status === STATUS.ACTIVE) {
      return reason === null || reason === PREPARED_ACTIVE_REASON;
    }
    if (status === STATUS.TERMINATING) return isTerminationReason(reason);
    if (status === STATUS.OFF) {
      return reason === null || isTerminationReason(reason);
    }
    return false;
  }

  function hasValidTerminalBoundary(status, generation, terminalGeneration) {
    if (status === STATUS.OFF || status === STATUS.TERMINATING) {
      return terminalGeneration === generation;
    }
    return terminalGeneration < generation;
  }

  function copyRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    if (!isPositiveInteger(record.tabId)) return null;
    if (!isGeneration(record.generation)) return null;
    if (!isKnownStatus(record.status)) return null;
    if (!isGeneration(record.terminalGeneration)) return null;
    if (record.terminalGeneration > record.generation) return null;
    if (!hasValidTerminalBoundary(record.status, record.generation, record.terminalGeneration)) {
      return null;
    }
    if (!isTimestamp(record.updatedAt)) return null;
    if (!isReasonValidForStatus(record.status, record.reason)) return null;

    return {
      tabId: record.tabId,
      generation: record.generation,
      status: record.status,
      terminalGeneration: record.terminalGeneration,
      updatedAt: record.updatedAt,
      reason: record.reason
    };
  }

  function storageKeyForTab(tabId) {
    if (!isPositiveInteger(tabId)) return null;
    return STORAGE_KEY_PREFIX + String(tabId);
  }

  function createOffState(tabId, generation, now) {
    if (generation === undefined) generation = 0;
    if (now === undefined) now = Date.now();
    if (!isPositiveInteger(tabId) || !isGeneration(generation) || !isTimestamp(now)) {
      return null;
    }

    return {
      tabId: tabId,
      generation: generation,
      status: STATUS.OFF,
      terminalGeneration: generation,
      updatedAt: now,
      reason: null
    };
  }

  function beginGeneration(previous, tabId, now) {
    if (now === undefined) now = Date.now();
    if (!isPositiveInteger(tabId) || !isTimestamp(now)) return null;

    var current = previous == null
      ? createOffState(tabId, 0, now)
      : copyRecord(previous);
    if (!current) return null;
    if (current.tabId !== tabId || current.status !== STATUS.OFF) return current;

    var priorGeneration = Math.max(current.generation, current.terminalGeneration);
    if (priorGeneration >= Number.MAX_SAFE_INTEGER) return current;

    return {
      tabId: tabId,
      generation: priorGeneration + 1,
      status: STATUS.STARTING,
      terminalGeneration: current.terminalGeneration,
      updatedAt: now,
      reason: null
    };
  }

  function markActive(current, generation, now, reason) {
    if (now === undefined) now = Date.now();
    if (reason === undefined) reason = null;

    var record = copyRecord(current);
    if (!record) return null;
    if (!isGeneration(generation) || !isTimestamp(now)) return record;
    if (reason !== null && reason !== PREPARED_ACTIVE_REASON) return record;
    if (record.generation !== generation) return record;
    if (record.status === STATUS.ACTIVE) return record;
    if (record.status !== STATUS.STARTING) return record;

    return {
      tabId: record.tabId,
      generation: record.generation,
      status: STATUS.ACTIVE,
      terminalGeneration: record.terminalGeneration,
      updatedAt: now,
      reason: reason
    };
  }

  function clearActiveReason(current, generation, now) {
    if (now === undefined) now = Date.now();

    var record = copyRecord(current);
    if (!record) return null;
    if (!isGeneration(generation) || !isTimestamp(now)) return record;
    if (record.generation !== generation || record.status !== STATUS.ACTIVE) return record;
    if (record.reason !== PREPARED_ACTIVE_REASON) return record;

    return {
      tabId: record.tabId,
      generation: record.generation,
      status: record.status,
      terminalGeneration: record.terminalGeneration,
      updatedAt: now,
      reason: null
    };
  }

  function beginTermination(current, generation, reason, now) {
    if (now === undefined) now = Date.now();

    var record = copyRecord(current);
    if (!record) return null;
    if (!isGeneration(generation) || !isTimestamp(now)) return record;
    if (!isTerminationReason(reason)) return record;
    if (record.generation !== generation) return record;
    if (record.status === STATUS.TERMINATING || record.status === STATUS.OFF) return record;
    if (record.status !== STATUS.STARTING && record.status !== STATUS.ACTIVE) return record;

    return {
      tabId: record.tabId,
      generation: record.generation,
      status: STATUS.TERMINATING,
      terminalGeneration: generation,
      updatedAt: now,
      reason: reason.trim()
    };
  }

  function finishTermination(current, generation, now) {
    if (now === undefined) now = Date.now();

    var record = copyRecord(current);
    if (!record) return null;
    if (!isGeneration(generation) || !isTimestamp(now)) return record;
    if (record.generation !== generation || record.status !== STATUS.TERMINATING) {
      return record;
    }

    return {
      tabId: record.tabId,
      generation: record.generation,
      status: STATUS.OFF,
      terminalGeneration: record.terminalGeneration,
      updatedAt: now,
      reason: record.reason
    };
  }

  function acceptsGeneration(current, generation) {
    var record = copyRecord(current);
    if (!record || !isGeneration(generation)) return false;
    if (record.generation !== generation) return false;
    return record.status === STATUS.STARTING || record.status === STATUS.ACTIVE;
  }

  function reduceSession(current, event) {
    var hasCurrent = current !== null && current !== undefined;
    var record = hasCurrent ? copyRecord(current) : null;
    if (hasCurrent && !record) return null;
    if (!event || typeof event !== 'object' || Array.isArray(event)) return record;
    if (typeof event.type !== 'string') return record;
    if (!isPositiveInteger(event.tabId) || !isTimestamp(event.now)) return record;
    if (record && record.tabId !== event.tabId) return record;

    switch (event.type) {
      case 'BEGIN':
        return beginGeneration(record, event.tabId, event.now);
      case 'READY':
        return markActive(
          record,
          event.generation,
          event.now,
          event.reason === undefined ? null : event.reason
        );
      case 'COMMIT_READY':
        return clearActiveReason(record, event.generation, event.now);
      case 'TERMINATE':
        return beginTermination(record, event.generation, event.reason, event.now);
      case 'FINISH':
        return finishTermination(record, event.generation, event.now);
      default:
        return record;
    }
  }

  var api = Object.freeze({
    STATUS: STATUS,
    storageKeyForTab: storageKeyForTab,
    createOffState: createOffState,
    beginGeneration: beginGeneration,
    markActive: markActive,
    clearActiveReason: clearActiveReason,
    beginTermination: beginTermination,
    finishTermination: finishTermination,
    acceptsGeneration: acceptsGeneration,
    reduceSession: reduceSession
  });

  globalThis.FSBSkopeoSessionState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
