(function(global) {
  'use strict';

  /**
   * Background-owned delegation lifecycle authority.
   *
   * The controller deliberately keeps its mutable records private. Persisted
   * ledger entries are the only event values allowed to update a record or
   * reach subscribers: appendBeforeFanout() must resolve first, and its
   * returned canonical entry is then applied verbatim.
   */

  var SNAPSHOT_VERSION = 1;
  var RUNTIME_EVENT_TYPE = 'FSB_DELEGATION_UPDATED';
  var delegationProviders = global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('./delegation-providers.js');
  }
  var WALL_CLOCK_TIMEOUT_MS = 45 * 60 * 1000;
  var EVENT_SILENCE_TIMEOUT_MS = 120 * 1000;
  var HOLD_LEASE_MS = 5 * 60 * 1000;
  var STATUS_ACTIVE_LIMIT = 64;
  var STATUS_RESTART_LOSS_LIMIT = 128;
  var STATUS_ROUTE_LOSS_LIMIT = 128;
  var SERVER_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
  var ACCEPTED_IDENTITY_KEYS = [
    'providerId', 'label', 'profileVersion', 'authState', 'billingKind'
  ];

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

  var VALID_CONNECTIONS = Object.freeze({
    connected: true,
    disconnected: true,
    offline: true,
    unpaired: true,
    unsupported: true
  });

  var PERSISTENCE_CODES = Object.freeze({
    delegation_persistence_failed: true,
    delegation_quota_exceeded: true,
    delegation_ledger_corrupt: true
  });

  var CLEANUP_BLOCKED_CODES = Object.freeze({
    delegation_mapping_mismatch: true,
    delegation_release_persistence_failed: true
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

  function _error(code, message) {
    var error = new Error(message || code);
    error.name = 'DelegationControllerError';
    error.code = code;
    return error;
  }

  function _isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    } catch (_errorIgnored) {
      return false;
    }
  }

  function _hasExactKeys(value, keys) {
    if (!_isPlainRecord(value)) return false;
    var actual;
    try {
      actual = Reflect.ownKeys(value);
      for (var keyIndex = 0; keyIndex < actual.length; keyIndex += 1) {
        if (typeof actual[keyIndex] !== 'string') return false;
        var descriptor = Object.getOwnPropertyDescriptor(value, actual[keyIndex]);
        if (!descriptor
          || descriptor.enumerable !== true
          || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      }
      actual = actual.slice().sort();
    } catch (_errorIgnored) {
      return false;
    }
    var expected = keys.slice().sort();
    if (actual.length !== expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  function _hasOwn(table, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
  }

  function _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function _deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { _deepFreeze(value[key]); });
    return value;
  }

  function _copyOwnDataValue(value, depth, budget) {
    if (value === null || typeof value !== 'object') return { ok: true, value: value };
    if (depth > 4 || budget.count >= 512) return { ok: false, value: null };
    var keys;
    var isArray = Array.isArray(value);
    try {
      var proto = Object.getPrototypeOf(value);
      if ((!isArray && proto !== Object.prototype && proto !== null)
        || (isArray && proto !== Array.prototype)) return { ok: false, value: null };
      keys = Reflect.ownKeys(value);
    } catch (_errorIgnored) {
      return { ok: false, value: null };
    }
    if (isArray) {
      if (keys.length !== value.length + 1 || keys[keys.length - 1] !== 'length') {
        return { ok: false, value: null };
      }
      var arrayCopy = [];
      for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
        if (keys[arrayIndex] !== String(arrayIndex)) return { ok: false, value: null };
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, String(arrayIndex));
        if (!arrayDescriptor
          || arrayDescriptor.enumerable !== true
          || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')) {
          return { ok: false, value: null };
        }
        budget.count += 1;
        var arrayItem = _copyOwnDataValue(arrayDescriptor.value, depth + 1, budget);
        if (!arrayItem.ok) return arrayItem;
        arrayCopy.push(arrayItem.value);
      }
      return { ok: true, value: arrayCopy };
    }
    var recordCopy = proto === null ? Object.create(null) : {};
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (typeof key !== 'string') return { ok: false, value: null };
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); }
      catch (_descriptorError) { return { ok: false, value: null }; }
      if (!descriptor
        || descriptor.enumerable !== true
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return { ok: false, value: null };
      }
      budget.count += 1;
      var item = _copyOwnDataValue(descriptor.value, depth + 1, budget);
      if (!item.ok) return item;
      recordCopy[key] = item.value;
    }
    return { ok: true, value: recordCopy };
  }

  function _copyOwnDataRecord(value) {
    if (value === null || value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
      if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    } catch (_errorIgnored) {
      return null;
    }
    var copied;
    try { copied = _copyOwnDataValue(value, 0, { count: 0 }); }
    catch (_copyError) { return null; }
    return copied.ok ? copied.value : null;
  }

  function _acceptedIdentity(value) {
    return delegationProviders
      && typeof delegationProviders.validateAcceptedAgentIdentity === 'function'
      ? delegationProviders.validateAcceptedAgentIdentity(value)
      : null;
  }

  function _sameAcceptedIdentity(left, right) {
    if (!left || !right) return false;
    for (var index = 0; index < ACCEPTED_IDENTITY_KEYS.length; index += 1) {
      var key = ACCEPTED_IDENTITY_KEYS[index];
      if (left[key] !== right[key]) return false;
    }
    return true;
  }

  function _providerFromAcceptedIdentity(identity) {
    return identity
      ? _deepFreeze({ id: identity.providerId, label: identity.label })
      : null;
  }

  function _summaryState(state) {
    if (state === 'running') return 'running';
    if (state === 'completed') return 'completed';
    if (state === 'stopped') return 'stopped';
    if (state === 'restart_lost') return 'restart_lost';
    return 'failed';
  }

  function _normalizeTerminalCode(value, eventStore) {
    if (eventStore && typeof eventStore.normalizeTerminalCode === 'function') {
      return eventStore.normalizeTerminalCode(value);
    }
    return typeof value === 'string' && _hasOwn(VALID_TERMINAL_CODES, value)
      ? value
      : 'unknown_failure';
  }

  function _terminalState(code) {
    if (code === 'completed') return 'completed';
    if (code === 'stopped' || code === 'cancelled') return 'stopped';
    if (code === 'daemon_restart_lost_run') return 'restart_lost';
    return 'failed';
  }

  function _normalizeCleanupPending(value, eventStore) {
    if (value === null || value === undefined) return null;
    if (!_hasExactKeys(value, ['agentId', 'cancellationConfirmed', 'code'])
      || typeof value.cancellationConfirmed !== 'boolean'
      || (value.agentId !== null
        && (typeof value.agentId !== 'string'
          || !value.agentId
          || value.agentId.length > 128))) {
      return null;
    }
    var code = _normalizeTerminalCode(value.code, eventStore);
    if (code !== value.code) return null;
    return {
      code: code,
      cancellationConfirmed: value.cancellationConfirmed,
      agentId: value.agentId
    };
  }

  function _summaryFromEntry(entry) {
    if (!entry || !entry.metrics) return null;
    return {
      inputTokens: entry.metrics.inputTokens,
      outputTokens: entry.metrics.outputTokens,
      totalTokens: entry.metrics.totalTokens,
      turns: entry.metrics.turns,
      durationMs: entry.metrics.durationMs,
      billingKind: entry.metrics.billingKind,
      usd: entry.metrics.usd,
      toolCalls: _clone(entry.metrics.toolCalls),
      state: _summaryState(entry.state)
    };
  }

  function _latestSummary(entries) {
    for (var i = entries.length - 1; i >= 0; i--) {
      var summary = _summaryFromEntry(entries[i]);
      if (summary) return summary;
    }
    return null;
  }

  function _firstEntryTimestamp(entries) {
    return entries.length > 0 && Number.isSafeInteger(entries[0].timestamp)
      ? entries[0].timestamp
      : null;
  }

  function _lastEntryTimestamp(entries) {
    var last = entries.length > 0 ? entries[entries.length - 1] : null;
    return last && Number.isSafeInteger(last.timestamp) ? last.timestamp : null;
  }

  function _normalizeSupervisorStatus(value) {
    if (!_hasExactKeys(value, ['active', 'generation', 'restartLosses', 'routeLosses'])
      || typeof value.generation !== 'string'
      || !SERVER_ID_PATTERN.test(value.generation)
      || !Array.isArray(value.active)
      || value.active.length > STATUS_ACTIVE_LIMIT
      || !Array.isArray(value.restartLosses)
      || value.restartLosses.length > STATUS_RESTART_LOSS_LIMIT
      || !Array.isArray(value.routeLosses)
      || value.routeLosses.length > STATUS_ROUTE_LOSS_LIMIT) {
      return null;
    }
    var activeIds = Object.create(null);
    var active = [];
    for (var activeIndex = 0; activeIndex < value.active.length; activeIndex++) {
      var activeRow = value.active[activeIndex];
      if (!_hasExactKeys(activeRow, ['delegationId', 'state'])
        || typeof activeRow.delegationId !== 'string'
        || !SERVER_ID_PATTERN.test(activeRow.delegationId)
        || (activeRow.state !== 'running'
          && activeRow.state !== 'held'
          && activeRow.state !== 'stopping')
        || activeIds[activeRow.delegationId]) {
        return null;
      }
      activeIds[activeRow.delegationId] = true;
      active.push({ delegationId: activeRow.delegationId, state: activeRow.state });
    }
    var lossIds = Object.create(null);
    var restartLosses = [];
    for (var lossIndex = 0; lossIndex < value.restartLosses.length; lossIndex++) {
      var loss = value.restartLosses[lossIndex];
      if (!_hasExactKeys(loss, ['code', 'delegationId', 'recoveredAt'])
        || typeof loss.delegationId !== 'string'
        || !SERVER_ID_PATTERN.test(loss.delegationId)
        || loss.code !== 'daemon_restart_lost_run'
        || !Number.isSafeInteger(loss.recoveredAt)
        || loss.recoveredAt < 0
        || lossIds[loss.delegationId]
        || activeIds[loss.delegationId]) {
        return null;
      }
      lossIds[loss.delegationId] = true;
      restartLosses.push({
        delegationId: loss.delegationId,
        code: loss.code,
        recoveredAt: loss.recoveredAt
      });
    }
    var routeLossIds = Object.create(null);
    var routeLosses = [];
    for (var routeLossIndex = 0; routeLossIndex < value.routeLosses.length; routeLossIndex++) {
      var routeLoss = value.routeLosses[routeLossIndex];
      if (!_hasExactKeys(routeLoss, ['code', 'delegationId', 'lostAt'])
        || typeof routeLoss.delegationId !== 'string'
        || !SERVER_ID_PATTERN.test(routeLoss.delegationId)
        || routeLoss.code !== 'route_lost'
        || !Number.isSafeInteger(routeLoss.lostAt)
        || routeLoss.lostAt < 0
        || routeLossIds[routeLoss.delegationId]
        || lossIds[routeLoss.delegationId]
        || activeIds[routeLoss.delegationId]) {
        return null;
      }
      routeLossIds[routeLoss.delegationId] = true;
      routeLosses.push({
        delegationId: routeLoss.delegationId,
        code: routeLoss.code,
        lostAt: routeLoss.lostAt
      });
    }
    return {
      generation: value.generation,
      active: active,
      restartLosses: restartLosses,
      routeLosses: routeLosses
    };
  }

  function _normalizeHeldLease(value, timestamp) {
    if (!_hasExactKeys(value, ['activeTabId', 'code', 'expiresAt', 'ok', 'ownedTabs'])
      || value.ok !== true
      || value.code !== 'hold_lease_present'
      || !Number.isSafeInteger(value.activeTabId)
      || value.activeTabId < 0
      || !Number.isSafeInteger(value.expiresAt)
      || value.expiresAt <= timestamp
      || value.expiresAt > timestamp + HOLD_LEASE_MS
      || !Array.isArray(value.ownedTabs)
      || value.ownedTabs.length === 0) {
      return null;
    }
    var ids = Object.create(null);
    var ownedTabs = [];
    for (var index = 0; index < value.ownedTabs.length; index++) {
      var row = value.ownedTabs[index];
      if (!_hasExactKeys(row, ['ownershipToken', 'tabId'])
        || !Number.isSafeInteger(row.tabId)
        || row.tabId < 0
        || typeof row.ownershipToken !== 'string'
        || row.ownershipToken.length === 0
        || ids[row.tabId]) {
        return null;
      }
      ids[row.tabId] = true;
      ownedTabs.push({ tabId: row.tabId, ownershipToken: row.ownershipToken });
    }
    if (!ids[value.activeTabId]) return null;
    ownedTabs.sort(function(left, right) { return left.tabId - right.tabId; });
    return {
      activeTabId: value.activeTabId,
      ownedTabs: ownedTabs,
      expiresAt: value.expiresAt
    };
  }

  function _newRecord(delegationId, options) {
    options = options || {};
    var acceptedIdentity = _acceptedIdentity(options.acceptedIdentity);
    var provider = _providerFromAcceptedIdentity(acceptedIdentity);
    return {
      delegationId: delegationId,
      acceptedIdentity: acceptedIdentity,
      provider: provider,
      state: _hasOwn(VALID_STATES, options.state) ? options.state : 'starting',
      connection: _hasOwn(VALID_CONNECTIONS, options.connection) ? options.connection : 'connected',
      entries: Array.isArray(options.entries) ? options.entries.slice() : [],
      summary: options.summary || null,
      activeTab: null,
      hold: null,
      holdOwnedTabs: null,
      terminal: null,
      cleanupPending: options.cleanupPending || null,
      hydrated: options.hydrated === true,
      agentId: typeof options.agentId === 'string' ? options.agentId : null,
      daemonGeneration: null,
      heartbeatRetained: false,
      heartbeatRetainPromise: null,
      heartbeatReleasePromise: null,
      operationTail: Promise.resolve(),
      persistenceFailure: null,
      startPromise: null,
      holdPromise: null,
      resumePromise: null,
      stopPromise: null,
      terminalPromise: null,
      cancelPromise: null,
      releasePromise: null,
      wallTimer: null,
      silenceTimer: null,
      holdTimer: null,
      startedAt: Number.isSafeInteger(options.startedAt) ? options.startedAt : null,
      lastEventAt: Number.isSafeInteger(options.lastEventAt) ? options.lastEventAt : null,
      expectedRegistration: true
    };
  }

  function _snapshot(record) {
    return _deepFreeze({
      v: SNAPSHOT_VERSION,
      delegationId: record.delegationId,
      acceptedIdentity: record.acceptedIdentity ? _clone(record.acceptedIdentity) : null,
      provider: record.provider ? _clone(record.provider) : null,
      state: record.state,
      connection: record.connection,
      entries: _clone(record.entries),
      summary: record.summary ? _clone(record.summary) : null,
      activeTab: record.activeTab ? _clone(record.activeTab) : null,
      hold: record.hold ? _clone(record.hold) : null,
      terminal: record.terminal ? _clone(record.terminal) : null,
      hydrated: record.hydrated === true
    });
  }

  function create(options) {
    options = options || {};
    var eventStore = options.eventStore;
    if (!eventStore
      || typeof eventStore.appendBeforeFanout !== 'function'
      || typeof eventStore.hydrateNonterminal !== 'function'
      || typeof eventStore.markCleanupPending !== 'function'
      || typeof eventStore.markTerminal !== 'function') {
      throw _error('delegation_controller_invalid_dependency', 'eventStore is required');
    }

    var clock = options.clock || {};
    var now = typeof clock.now === 'function'
      ? function() { return clock.now(); }
      : function() { return Date.now(); };
    var schedule = typeof clock.setTimeout === 'function'
      ? function(callback, delay) { return clock.setTimeout(callback, delay); }
      : function(callback, delay) { return setTimeout(callback, delay); };
    var unschedule = typeof clock.clearTimeout === 'function'
      ? function(timer) { clock.clearTimeout(timer); }
      : function(timer) { clearTimeout(timer); };
    var cancel = typeof options.cancel === 'function'
      ? options.cancel
      : function() { return Promise.resolve(); };
    var statusOperation = typeof options.status === 'function'
      ? options.status
      : function() { return Promise.resolve({ ok: true, connection: 'connected' }); };
    var holdOperation = typeof options.hold === 'function'
      ? options.hold
      : function() { return Promise.resolve({ ok: false, code: 'unsupported_provider' }); };
    var resumeOperation = typeof options.resume === 'function'
      ? options.resume
      : function() { return Promise.resolve({ ok: false, code: 'unsupported_provider' }); };
    var getActiveTab = typeof options.getActiveTab === 'function'
      ? options.getActiveTab
      : function() { return Promise.resolve(null); };
    var getLiveTabIds = typeof options.getLiveTabIds === 'function'
      ? options.getLiveTabIds
      : function() { return Promise.resolve([]); };
    var loadGeneration = typeof options.loadGeneration === 'function'
      ? options.loadGeneration
      : function() { return Promise.resolve(null); };
    var saveGeneration = typeof options.saveGeneration === 'function'
      ? options.saveGeneration
      : function() { return Promise.resolve(); };
    var clearGeneration = typeof options.clearGeneration === 'function'
      ? options.clearGeneration
      : function() { return Promise.resolve(); };
    var retainHeartbeat = typeof options.retainHeartbeat === 'function'
      ? options.retainHeartbeat
      : function() { return false; };
    var releaseHeartbeat = typeof options.releaseHeartbeat === 'function'
      ? options.releaseHeartbeat
      : function() { return false; };
    var getConnectionSnapshot = typeof options.getConnectionSnapshot === 'function'
      ? options.getConnectionSnapshot
      : function() { return null; };
    var registry = options.registry || null;
    var records = new Map();
    var listeners = new Set();
    var hydrated = false;
    var hydratePromise = null;
    var provisional = null;

    function _requireHydrated() {
      if (!hydrated) throw _error('delegation_not_hydrated', 'hydrate must complete first');
    }

    function _requireId(delegationId) {
      if (typeof delegationId !== 'string' || !SERVER_ID_PATTERN.test(delegationId)) {
        throw _error('invalid_delegation_id', 'an exact server delegation id is required');
      }
      return delegationId;
    }

    function _emit(record, announceSequence) {
      var runtimeEvent = _deepFreeze({
        type: RUNTIME_EVENT_TYPE,
        snapshot: _snapshot(record),
        announceSequence: Number.isSafeInteger(announceSequence) ? announceSequence : null
      });
      listeners.forEach(function(listener) {
        try { listener(runtimeEvent); } catch (_errorIgnored) { /* listener isolation */ }
      });
      return runtimeEvent;
    }

    function _enqueue(record, operation) {
      var next = record.operationTail.then(operation, operation);
      record.operationTail = next.then(function() {}, function() {});
      return next;
    }

    function _clearTimer(record, field) {
      if (record[field] === null || record[field] === undefined) return;
      try { unschedule(record[field]); } catch (_ignored) { /* best-effort timer clear */ }
      record[field] = null;
    }

    function _clearTimers(record) {
      _clearTimer(record, 'wallTimer');
      _clearTimer(record, 'silenceTimer');
      _clearTimer(record, 'holdTimer');
    }

    function _unrefTimer(timer) {
      if (timer && typeof timer.unref === 'function') {
        try { timer.unref(); } catch (_ignored) { /* browser timers are numeric */ }
      }
      return timer;
    }

    function _queueTimeout(record, code) {
      if (record.terminalPromise || record.terminal) return;
      _enqueue(record, function() {
        return _settle(record, code, { cancel: true });
      }).catch(function() { /* terminal failure remains queryable */ });
    }

    function _armWallClock(record) {
      _clearTimer(record, 'wallTimer');
      if (!Number.isSafeInteger(record.startedAt)) record.startedAt = now();
      var delay = Math.max(0, record.startedAt + WALL_CLOCK_TIMEOUT_MS - now());
      record.wallTimer = _unrefTimer(schedule(function() {
        record.wallTimer = null;
        _queueTimeout(record, 'wall_clock_timeout');
      }, delay));
    }

    function _armSilence(record) {
      _clearTimer(record, 'silenceTimer');
      if (record.terminalPromise || record.terminal || record.state === 'held') return;
      if (!Number.isSafeInteger(record.lastEventAt)) {
        record.lastEventAt = Number.isSafeInteger(record.startedAt) ? record.startedAt : now();
      }
      var delay = Math.max(0, record.lastEventAt + EVENT_SILENCE_TIMEOUT_MS - now());
      record.silenceTimer = _unrefTimer(schedule(function() {
        record.silenceTimer = null;
        _queueTimeout(record, 'event_silence_timeout');
      }, delay));
    }

    function _refreshSilence(record, timestamp) {
      var observedAt = Number.isSafeInteger(timestamp) ? Math.min(timestamp, now()) : now();
      if (!Number.isSafeInteger(record.lastEventAt) || observedAt > record.lastEventAt) {
        record.lastEventAt = observedAt;
      }
      _armSilence(record);
    }

    function _armHoldExpiry(record, expiresAt) {
      _clearTimer(record, 'holdTimer');
      var delay = Math.max(0, expiresAt - now());
      record.holdTimer = _unrefTimer(schedule(function() {
        record.holdTimer = null;
        _queueTimeout(record, 'hold_expired');
      }, delay));
    }

    function _eventContextForRecord(record, value) {
      var context = _copyOwnDataRecord(value);
      if (!context) {
        throw _error('invalid_delegation_event', 'event context must be an exact own-data record');
      }
      var forbiddenIdentityFields = [
        'authState', 'billingKind', 'client', 'label', 'profileVersion',
        'providerId', 'usd'
      ];
      for (var index = 0; index < forbiddenIdentityFields.length; index += 1) {
        if (Object.prototype.hasOwnProperty.call(context, forbiddenIdentityFields[index])) {
          throw _error(
            'invalid_delegation_event',
            'event context cannot introduce accepted identity fields or usd'
          );
        }
      }
      if (!record.acceptedIdentity) {
        throw _error('delegation_ledger_corrupt', 'accepted identity authority is missing');
      }
      if (Object.prototype.hasOwnProperty.call(context, 'acceptedIdentity')) {
        var claimedIdentity = _acceptedIdentity(context.acceptedIdentity);
        if (!claimedIdentity || !_sameAcceptedIdentity(record.acceptedIdentity, claimedIdentity)) {
          throw _error('unsupported_provider', 'event accepted identity changed');
        }
      }
      context.acceptedIdentity = record.acceptedIdentity;
      if (!Number.isSafeInteger(context.timestamp) || context.timestamp < 0) {
        context.timestamp = now();
      }
      return _deepFreeze(context);
    }

    function _applyEntry(record, entry, options) {
      options = options || {};
      var expected = record.entries.length + 1;
      if (!entry
        || entry.delegationId !== record.delegationId
        || entry.sequence !== expected) {
        throw _error('delegation_ledger_corrupt', 'canonical entry sequence or identity is invalid');
      }
      if (!record.acceptedIdentity) {
        throw _error('delegation_ledger_corrupt', 'canonical accepted identity is missing');
      }
      if (entry.init
        && (!entry.init.client
          || entry.init.client.id !== record.acceptedIdentity.providerId
          || entry.init.client.label !== record.acceptedIdentity.label
          || entry.init.profileVersion !== record.acceptedIdentity.profileVersion)) {
        throw _error('delegation_ledger_corrupt', 'canonical entry accepted identity changed');
      }
      if (entry.metrics
        && (entry.metrics.billingKind !== record.acceptedIdentity.billingKind
          || entry.metrics.usd !== null)) {
        throw _error('delegation_ledger_corrupt', 'canonical entry billing identity changed');
      }
      record.entries.push(entry);
      if (options.deferTerminalState !== true) record.state = entry.state;
      var summary = _summaryFromEntry(entry);
      if (summary) record.summary = summary;
      if (options.refreshSilence !== false) _refreshSilence(record, entry.timestamp);
      if (options.notify === false) return null;
      return _emit(record, entry.sequence);
    }

    function _persistenceCode(error) {
      return error && _hasOwn(PERSISTENCE_CODES, error.code)
        ? error.code
        : 'delegation_persistence_failed';
    }

    async function _appendStateEntry(record, state, title, detail) {
      var canonicalEntry;
      try {
        canonicalEntry = await eventStore.appendBeforeFanout(
          record.delegationId,
          { type: 'state', sessionId: null, payload: {} },
          _eventContextForRecord(record, {
            timestamp: now(),
            state: state,
            title: title,
            detail: detail || null
          })
        );
      } catch (error) {
        return _failPersistence(record, error);
      }
      if (!canonicalEntry
        || canonicalEntry.delegationId !== record.delegationId
        || canonicalEntry.sequence !== record.entries.length + 1) {
        return _failPersistence(
          record,
          _error('delegation_ledger_corrupt', 'canonical entry sequence or identity is invalid')
        );
      }
      return canonicalEntry;
    }

    function _retainHeartbeatOnce(record) {
      if (record.heartbeatRetained) return Promise.resolve(true);
      if (record.heartbeatRetainPromise) return record.heartbeatRetainPromise;
      record.heartbeatRetainPromise = Promise.resolve().then(function() {
        return retainHeartbeat(record.delegationId);
      }).then(function() {
        record.heartbeatRetained = true;
        return true;
      }).catch(function() {
        return false;
      });
      return record.heartbeatRetainPromise;
    }

    function _releaseHeartbeatOnce(record) {
      if (!record.heartbeatRetained) return Promise.resolve(false);
      if (record.heartbeatReleasePromise) return record.heartbeatReleasePromise;
      record.heartbeatReleasePromise = Promise.resolve().then(function() {
        return releaseHeartbeat(record.delegationId);
      }).catch(function() {
        return false;
      }).then(function(result) {
        record.heartbeatRetained = false;
        return result;
      });
      return record.heartbeatReleasePromise;
    }

    async function _rememberGeneration(record, generation) {
      if (record.daemonGeneration === generation) return;
      record.daemonGeneration = generation;
      try {
        await saveGeneration({
          delegationId: record.delegationId,
          generation: generation
        });
      } catch (_generationWriteError) { /* later wakes remain classification-pending */ }
    }

    async function _forgetGeneration(record) {
      record.daemonGeneration = null;
      try {
        await clearGeneration({ delegationId: record.delegationId });
      } catch (_generationClearError) { /* terminal ledgers are never hydrated */ }
    }

    function _cancelOnce(record, code) {
      if (!record.cancelPromise) {
        var attempt = Promise.resolve().then(function() {
          return cancel({ delegationId: record.delegationId, code: code });
        }).then(function(result) {
          if ((!result
            || (result.status !== 'cancelled' && result.status !== 'already_terminal'))
            && record.cancelPromise === attempt) {
            record.cancelPromise = null;
          }
          return result;
        }, function(error) {
          if (record.cancelPromise === attempt) record.cancelPromise = null;
          throw error;
        });
        record.cancelPromise = attempt;
      }
      return record.cancelPromise;
    }

    function _releaseOnce(record) {
      if (!record.releasePromise) {
        record.releasePromise = Promise.resolve().then(function() {
          if (!record.agentId || !registry || typeof registry.releaseDelegation !== 'function') {
            return { ok: true, code: 'nothing_to_release', releasedTabCount: 0 };
          }
          return registry.releaseDelegation({
            delegationId: record.delegationId,
            agentId: record.agentId
          });
        }).then(function(result) {
          if (!result || result.ok !== true) {
            var failureCode = result && _hasOwn(CLEANUP_BLOCKED_CODES, result.code)
              ? result.code
              : 'delegation_release_persistence_failed';
            return {
              ok: false,
              code: failureCode,
              result: result || null,
              releasedTabCount: 0
            };
          }
          var count = result && Number.isSafeInteger(result.releasedTabCount)
            && result.releasedTabCount >= 0
            ? result.releasedTabCount
            : 0;
          return { ok: true, code: result.code || 'delegation_released', result: result, releasedTabCount: count };
        }).catch(function() {
          return {
            ok: false,
            code: 'delegation_release_persistence_failed',
            result: null,
            releasedTabCount: 0
          };
        }).then(function(release) {
          if (release.ok !== true) record.releasePromise = null;
          return release;
        });
      }
      return record.releasePromise;
    }

    function _failPersistence(record, error) {
      if (!record.persistenceFailure) {
        var code = _persistenceCode(error);
        _clearTimers(record);
        record.persistenceFailure = Promise.resolve().then(function() {
          return _settle(record, code, { cancel: true });
        }).catch(function(markerError) {
          record.persistenceFailure = null;
          record.state = 'stopping';
          record.terminal = null;
          throw markerError;
        });
      }
      return record.persistenceFailure.then(
        function() { throw error; },
        function() { throw error; }
      );
    }

    async function _commitCleanupBoundary(record, code, cancellationConfirmed) {
      var envelope = await eventStore.markCleanupPending(record.delegationId, {
        code: code,
        cancellationConfirmed: cancellationConfirmed === true,
        agentId: record.agentId || null,
        acceptedIdentity: record.acceptedIdentity
      });
      var marker = envelope && _normalizeCleanupPending(envelope.cleanupPending, eventStore);
      if (!marker
        || marker.code !== code
        || marker.cancellationConfirmed !== (cancellationConfirmed === true)
        || marker.agentId !== (record.agentId || null)
        || !_sameAcceptedIdentity(envelope.acceptedIdentity, record.acceptedIdentity)
        || envelope.terminal !== false) {
        throw _error('delegation_ledger_corrupt', 'cleanup marker did not commit exactly');
      }
      record.cleanupPending = marker;
      record.state = 'stopping';
      return marker;
    }

    async function _commitTerminal(record, code, release, options) {
      options = options || {};
      if (!record.cleanupPending
        || record.cleanupPending.code !== code
        || record.cleanupPending.cancellationConfirmed !== true) {
        throw _error('delegation_ledger_corrupt', 'terminal cleanup boundary is not confirmed');
      }
      var beforeLength = record.entries.length;
      var envelope = await eventStore.markTerminal(record.delegationId, {
        code: code,
        event: { type: 'terminal', sessionId: null, payload: {} },
        context: {
          acceptedIdentity: record.acceptedIdentity,
          timestamp: Number.isSafeInteger(options.timestamp) ? options.timestamp : now(),
          title: 'Delegation ended',
          detail: null
        }
      });
      if (!envelope
        || envelope.terminal !== true
        || envelope.terminalCode !== code
        || envelope.cleanupPending !== null
        || !_sameAcceptedIdentity(envelope.acceptedIdentity, record.acceptedIdentity)
        || !Array.isArray(envelope.entries)
        || (envelope.entries.length !== beforeLength
          && envelope.entries.length !== beforeLength + 1)) {
        throw _error('delegation_ledger_corrupt', 'terminal transition did not commit exactly');
      }
      var terminalEntry = envelope.entries.length === beforeLength + 1
        ? envelope.entries[envelope.entries.length - 1]
        : null;
      if (terminalEntry) {
        _applyEntry(record, terminalEntry, {
          notify: false,
          deferTerminalState: true,
          refreshSilence: false
        });
      }
      record.cleanupPending = null;
      record.state = _terminalState(code);
      if (record.summary) record.summary.state = _summaryState(record.state);
      record.terminal = {
        code: code,
        releasedTabCount: release.releasedTabCount || 0
      };
      if (record.agentId
        && registry
        && typeof registry.acknowledgeDelegationRelease === 'function') {
        try {
          await registry.acknowledgeDelegationRelease({
            delegationId: record.delegationId,
            agentId: record.agentId
          });
        } catch (_receiptAckError) { /* bounded stale receipt remains safe */ }
      }
      await _releaseHeartbeatOnce(record);
      await _forgetGeneration(record);
      var runtimeEvent = _emit(record, terminalEntry ? terminalEntry.sequence : null);
      return _deepFreeze({
        ok: true,
        code: code,
        entry: terminalEntry,
        releasedTabCount: record.terminal.releasedTabCount,
        runtimeEvent: runtimeEvent,
        snapshot: _snapshot(record)
      });
    }

    function _settle(record, requestedCode, options) {
      if (record.terminalPromise) return record.terminalPromise;
      options = options || {};
      var code = record.cleanupPending
        ? record.cleanupPending.code
        : _normalizeTerminalCode(requestedCode, eventStore);
      _clearTimers(record);
      var settlement = Promise.resolve().then(async function() {
        var cancellationConfirmed = record.cleanupPending
          ? record.cleanupPending.cancellationConfirmed === true
          : options.cancel === false;
        if (!cancellationConfirmed
          && (record.cleanupPending || options.cancel !== false)) {
          try {
            var cancelResult = await _cancelOnce(record, code);
            cancellationConfirmed = !!cancelResult
              && (cancelResult.status === 'cancelled'
                || cancelResult.status === 'already_terminal');
          } catch (_cancelError) {
            cancellationConfirmed = false;
          }
        }

        if (!record.cleanupPending
          || record.cleanupPending.cancellationConfirmed !== cancellationConfirmed) {
          await _commitCleanupBoundary(record, code, cancellationConfirmed);
        }

        if (!cancellationConfirmed) {
          record.state = 'stopping';
          record.terminal = null;
          var cancellationRuntimeEvent = _emit(record, null);
          return _deepFreeze({
            ok: false,
            code: 'tree_unsettled',
            entry: null,
            releasedTabCount: 0,
            runtimeEvent: cancellationRuntimeEvent,
            snapshot: _snapshot(record)
          });
        }

        var release = { ok: true, code: 'nothing_to_release', releasedTabCount: 0 };
        if (record.cleanupPending.cancellationConfirmed) {
          release = await _releaseOnce(record);
          if (release.ok !== true) {
            record.state = 'stopping';
            record.terminal = null;
            var cleanupRuntimeEvent = _emit(record, null);
            return _deepFreeze({
              ok: false,
              code: release.code,
              entry: null,
              releasedTabCount: 0,
              runtimeEvent: cleanupRuntimeEvent,
              snapshot: _snapshot(record)
            });
          }
        }

        return _commitTerminal(record, code, release, options);
      });
      record.terminalPromise = settlement;
      settlement.then(function(result) {
        if (result && result.ok !== true && record.terminalPromise === settlement) {
          record.terminalPromise = null;
        }
      }, function() {
        if (record.terminalPromise === settlement) record.terminalPromise = null;
        record.state = 'stopping';
        record.terminal = null;
      });
      return settlement;
    }

    function hydrate() {
      if (hydratePromise) return hydratePromise;
      hydratePromise = Promise.resolve().then(function() {
        return eventStore.hydrateNonterminal();
      }).then(async function(ledgers) {
        if (!Array.isArray(ledgers) || ledgers.length > STATUS_ACTIVE_LIMIT) {
          throw _error('delegation_ledger_corrupt', 'hydration result exceeds the active delegation limit');
        }
        if (!registry || typeof registry.listDelegationMappings !== 'function') {
          throw _error('delegation_binding_rejected', 'registry mapping authority is unavailable');
        }
        var mappingRows;
        try {
          mappingRows = registry.listDelegationMappings();
        } catch (_mappingSnapshotError) {
          throw _error('delegation_binding_rejected', 'registry mapping snapshot failed');
        }
        if (mappingRows && typeof mappingRows.then === 'function') {
          throw _error('delegation_binding_rejected', 'registry mapping snapshots must be synchronous');
        }
        if (!Array.isArray(mappingRows) || mappingRows.length > STATUS_ACTIVE_LIMIT) {
          throw _error('delegation_binding_rejected', 'registry mapping snapshot is invalid');
        }
        var mappingByDelegation = new Map();
        var mappedAgents = new Set();
        mappingRows.forEach(function(row) {
          if (!_hasExactKeys(row, ['delegationId', 'agentId'])
            || typeof row.delegationId !== 'string'
            || !SERVER_ID_PATTERN.test(row.delegationId)
            || typeof row.agentId !== 'string'
            || row.agentId.length === 0
            || row.agentId.length > 128
            || mappingByDelegation.has(row.delegationId)
            || mappedAgents.has(row.agentId)) {
            throw _error('delegation_binding_rejected', 'registry mapping snapshot is invalid');
          }
          mappingByDelegation.set(row.delegationId, row.agentId);
          mappedAgents.add(row.agentId);
        });
        var restored = new Map();
        ledgers.forEach(function(ledger) {
          if (!ledger
            || typeof ledger.delegationId !== 'string'
            || !SERVER_ID_PATTERN.test(ledger.delegationId)
            || restored.has(ledger.delegationId)) {
            throw _error('delegation_ledger_corrupt', 'hydrated ledger identity is invalid');
          }
          var entries = Array.isArray(ledger.entries) ? ledger.entries.slice() : [];
          var acceptedIdentity = _acceptedIdentity(ledger.acceptedIdentity);
          if (!acceptedIdentity) {
            throw _error('delegation_ledger_corrupt', 'hydrated accepted identity is invalid');
          }
          var cleanupPending = _normalizeCleanupPending(ledger.cleanupPending, eventStore);
          if (ledger.cleanupPending !== undefined
            && ledger.cleanupPending !== null
            && !cleanupPending) {
            throw _error('delegation_ledger_corrupt', 'hydrated cleanup marker is invalid');
          }
          var state = cleanupPending
            ? 'stopping'
            : (entries.length > 0 ? entries[entries.length - 1].state : 'idle');
          var record = _newRecord(ledger.delegationId, {
            acceptedIdentity: acceptedIdentity,
            state: state,
            connection: 'disconnected',
            entries: entries,
            summary: _latestSummary(entries),
            startedAt: _firstEntryTimestamp(entries),
            lastEventAt: _lastEntryTimestamp(entries),
            cleanupPending: cleanupPending,
            agentId: cleanupPending && cleanupPending.agentId,
            hydrated: true
          });
          var hasTabAuthorityEvidence = entries.some(function(entry) {
            return entry
              && entry.tool
              && Number.isSafeInteger(entry.tool.tabId)
              && entry.tool.tabId > 0;
          });
          if (registry && typeof registry.listDelegationMappings === 'function') {
            var restoredAgentId = mappingByDelegation.get(ledger.delegationId) || null;
            if (typeof restoredAgentId === 'string' && restoredAgentId.length > 0) {
              if (cleanupPending
                && cleanupPending.agentId
                && cleanupPending.agentId !== restoredAgentId) {
                throw _error('delegation_binding_rejected', 'cleanup and registry mapping disagree');
              }
              record.agentId = restoredAgentId;
              record.expectedRegistration = false;
            } else if (cleanupPending && cleanupPending.agentId) {
              var releaseReceipt = null;
              if (typeof registry.getDelegationReleaseReceipt === 'function') {
                try {
                  releaseReceipt = registry.getDelegationReleaseReceipt({
                    delegationId: ledger.delegationId,
                    agentId: cleanupPending.agentId
                  });
                } catch (_receiptReadError) {
                  throw _error('delegation_binding_rejected', 'registry receipt read failed');
                }
              }
              if (releaseReceipt && typeof releaseReceipt.then === 'function') {
                throw _error('delegation_binding_rejected', 'registry receipt reads must be synchronous');
              }
              if (!releaseReceipt || releaseReceipt.agentId !== cleanupPending.agentId) {
                throw _error('delegation_binding_rejected', 'cleanup authority proof is missing');
              }
              record.agentId = cleanupPending.agentId;
              record.expectedRegistration = false;
            } else if (hasTabAuthorityEvidence || state === 'held') {
              throw _error('delegation_binding_rejected', 'persisted tab authority has no registry mapping');
            }
          }
          restored.set(ledger.delegationId, record);
        });
        mappingByDelegation.forEach(function(_agentId, delegationId) {
          if (!restored.has(delegationId)) {
            throw _error('delegation_binding_rejected', 'registry mapping has no nonterminal ledger');
          }
        });
        records = restored;
        await Promise.all(Array.from(records.values()).map(async function(record) {
          try {
            var generation = await loadGeneration({ delegationId: record.delegationId });
            if (typeof generation === 'string' && SERVER_ID_PATTERN.test(generation)) {
              record.daemonGeneration = generation;
            }
          } catch (_generationReadError) { /* missing metadata means classification-pending */ }
          await _retainHeartbeatOnce(record);
          if (!record.cleanupPending) {
            _armWallClock(record);
            if (record.state !== 'held') _armSilence(record);
          }
        }));
        hydrated = true;
        return _deepFreeze(Array.from(records.values()).map(_snapshot));
      }).catch(function(error) {
        hydratePromise = null;
        throw error;
      });
      return hydratePromise;
    }

    function subscribe(listener) {
      _requireHydrated();
      if (typeof listener !== 'function') {
        throw _error('invalid_delegation_listener', 'listener must be a function');
      }
      listeners.add(listener);
      var active = true;
      return function unsubscribe() {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    }

    function start(input) {
      _requireHydrated();
      input = input || {};
      var delegationId = _requireId(input.delegationId);
      var acceptedIdentity = _acceptedIdentity(input.acceptedIdentity);
      if (!acceptedIdentity) {
        throw _error('unsupported_provider', 'an exact accepted identity is required');
      }
      if (records.has(delegationId)) {
        var existing = records.get(delegationId);
        if (!_sameAcceptedIdentity(existing.acceptedIdentity, acceptedIdentity)) {
          throw _error('unsupported_provider', 'delegation accepted identity changed');
        }
        if (existing.startPromise) return existing.startPromise;
        existing.startPromise = Promise.resolve(_deepFreeze({
          ok: true,
          code: 'already_started',
          snapshot: _snapshot(existing)
        }));
        return existing.startPromise;
      }
      if (provisional && provisional.delegationId !== delegationId) {
        throw _error('delegation_start_in_progress', 'another provisional start is active');
      }
      provisional = { delegationId: delegationId };
      var record = _newRecord(delegationId, {
        acceptedIdentity: acceptedIdentity,
        state: 'starting',
        connection: _hasOwn(VALID_CONNECTIONS, input.connection) ? input.connection : 'connected',
        hydrated: true
      });
      record.startedAt = now();
      record.lastEventAt = record.startedAt;
      records.set(delegationId, record);
      record.startPromise = _enqueue(record, async function() {
        var canonicalEntry;
        try {
          canonicalEntry = await eventStore.appendBeforeFanout(
            delegationId,
            { type: 'delegation.started', sessionId: null, payload: {} },
            {
              timestamp: record.startedAt,
              state: 'starting',
              acceptedIdentity: record.acceptedIdentity,
              model: null,
              allowedTools: []
            }
          );
        } catch (error) {
          return _failPersistence(record, error);
        }
        if (!canonicalEntry
          || canonicalEntry.delegationId !== record.delegationId
          || canonicalEntry.sequence !== 1) {
          return _failPersistence(
            record,
            _error('delegation_ledger_corrupt', 'canonical start entry sequence or identity is invalid')
          );
        }

        record.startedAt = canonicalEntry.timestamp;
        record.lastEventAt = canonicalEntry.timestamp;
        _armWallClock(record);
        _applyEntry(record, canonicalEntry, { notify: false });
        await _retainHeartbeatOnce(record);
        var runtimeEvent = _emit(record, canonicalEntry.sequence);
        return _deepFreeze({
          ok: true,
          code: 'started',
          runtimeEvent: runtimeEvent,
          snapshot: _snapshot(record)
        });
      });
      provisional = null;
      return record.startPromise;
    }

    function acceptEvent(input) {
      _requireHydrated();
      if (!_hasExactKeys(input, ['context', 'delegationId', 'event'])) {
        return Promise.reject(_error('invalid_delegation_event', 'event input shape is invalid'));
      }
      var delegationId;
      try { delegationId = _requireId(input.delegationId); } catch (error) { return Promise.reject(error); }
      var record = records.get(delegationId);
      if (!record) return Promise.reject(_error('unknown_delegation', 'delegation is not registered'));
      var context;
      try {
        context = _eventContextForRecord(record, input.context);
      } catch (error) {
        return Promise.reject(error);
      }
      return _enqueue(record, async function() {
        if (record.terminal || record.terminalPromise) {
          throw _error('delegation_already_terminal', 'delegation is already terminal');
        }
        if (record.cleanupPending) {
          throw _error('delegation_cleanup_pending', 'delegation cleanup remains incomplete');
        }
        if (input.event.type === 'terminal') {
          var terminalResult = await _settle(
            record,
            context.terminalCode || 'unknown_failure',
            { cancel: context.treeSettled !== true, timestamp: context.timestamp }
          );
          if (terminalResult.ok !== true) {
            throw _error(terminalResult.code, 'delegation cleanup remains incomplete');
          }
          return terminalResult.entry;
        }
        var canonicalEntry;
        try {
          canonicalEntry = await eventStore.appendBeforeFanout(delegationId, input.event, context);
        } catch (error) {
          return _failPersistence(record, error);
        }
        if (!canonicalEntry
          || canonicalEntry.delegationId !== record.delegationId
          || canonicalEntry.sequence !== record.entries.length + 1) {
          return _failPersistence(
            record,
            _error('delegation_ledger_corrupt', 'canonical entry sequence or identity is invalid')
          );
        }

        _applyEntry(record, canonicalEntry);
        return canonicalEntry;
      });
    }

    function getSnapshot(delegationId) {
      _requireHydrated();
      delegationId = _requireId(delegationId);
      var record = records.get(delegationId);
      return record ? _snapshot(record) : null;
    }

    function reconcile(input) {
      _requireHydrated();
      input = input || {};
      var record = records.get(_requireId(input.delegationId));
      if (!record) return null;
      return _enqueue(record, async function() {
        if (record.terminal) return _snapshot(record);
        if (record.cleanupPending) {
          var cleanupResult = await _settle(record, record.cleanupPending.code, { cancel: false });
          return cleanupResult.snapshot;
        }
        var connection = _hasOwn(VALID_CONNECTIONS, input.connection) ? input.connection : null;
        if (!connection) {
          try {
            var connectionSnapshot = await getConnectionSnapshot();
            if (connectionSnapshot && _hasOwn(VALID_CONNECTIONS, connectionSnapshot.state)) {
              connection = connectionSnapshot.state;
            }
          } catch (_connectionError) { /* a missing bridge is disconnected, not restart evidence */ }
        }

        var rawStatus = input.status;
        if (rawStatus === undefined && connection !== 'disconnected') {
          try {
            rawStatus = await statusOperation({ delegationId: record.delegationId });
          } catch (_statusError) {
            connection = 'disconnected';
          }
        }
        if (!connection && rawStatus && _hasOwn(VALID_CONNECTIONS, rawStatus.connection)) {
          connection = rawStatus.connection;
        }
        var status = _normalizeSupervisorStatus(rawStatus);
        if (!status) {
          record.connection = connection || 'disconnected';
          return _emit(record, null);
        }

        var active = null;
        for (var activeIndex = 0; activeIndex < status.active.length; activeIndex++) {
          if (status.active[activeIndex].delegationId === record.delegationId) {
            active = status.active[activeIndex];
            break;
          }
        }
        var restartLoss = null;
        for (var lossIndex = 0; lossIndex < status.restartLosses.length; lossIndex++) {
          if (status.restartLosses[lossIndex].delegationId === record.delegationId) {
            restartLoss = status.restartLosses[lossIndex];
            break;
          }
        }
        var routeLoss = null;
        for (var routeLossIndex = 0; routeLossIndex < status.routeLosses.length; routeLossIndex++) {
          if (status.routeLosses[routeLossIndex].delegationId === record.delegationId) {
            routeLoss = status.routeLosses[routeLossIndex];
            break;
          }
        }

        var priorGeneration = record.daemonGeneration;
        if (priorGeneration && priorGeneration !== status.generation) {
          record.connection = 'disconnected';
          if (restartLoss && !active) {
            return _settle(record, 'daemon_restart_lost_run', { cancel: false });
          }
          return _emit(record, null);
        }
        if (!priorGeneration) {
          if (!active) {
            record.connection = 'disconnected';
            return _emit(record, null);
          }
          await _rememberGeneration(record, status.generation);
        }

        if (!active) {
          record.connection = 'disconnected';
          if (priorGeneration === status.generation && routeLoss) {
            return _settle(record, 'route_lost', { cancel: false });
          }
          return _emit(record, null);
        }

        record.connection = 'connected';
        if (active.state === 'held') {
          var agentId = record.agentId;
          if (!agentId && registry && typeof registry.getAgentForDelegation === 'function') {
            try { agentId = await registry.getAgentForDelegation(record.delegationId); }
            catch (_agentReadError) { agentId = null; }
          }
          var leaseResult = null;
          if (typeof agentId === 'string'
            && agentId.length > 0
            && registry
            && typeof registry.getDelegationHoldLease === 'function') {
            try {
              leaseResult = await registry.getDelegationHoldLease({
                delegationId: record.delegationId,
                agentId: agentId
              });
            } catch (_leaseReadError) { leaseResult = null; }
          }
          var lease = _normalizeHeldLease(leaseResult, now());
          if (!lease) {
            return _settle(record, 'resume_ownership_lost', { cancel: true });
          }
          record.agentId = agentId;
          record.expectedRegistration = false;
          record.state = 'held';
          record.hold = {
            tabIds: lease.ownedTabs.map(function(tab) { return tab.tabId; }),
            expiresAt: lease.expiresAt
          };
          record.holdOwnedTabs = _clone(lease.ownedTabs);
          record.activeTab = {
            tabId: lease.activeTabId,
            owned: false,
            canTakeControl: false
          };
          _clearTimer(record, 'silenceTimer');
          _armHoldExpiry(record, lease.expiresAt);
          if (record.wallTimer === null) _armWallClock(record);
          return _emit(record, null);
        }

        if (active.state === 'running' && (record.state === 'held' || record.hold)) {
          return _settle(record, 'resume_ownership_lost', { cancel: true });
        }
        record.state = active.state;
        if (active.state === 'running') {
          record.hold = null;
          record.holdOwnedTabs = null;
          _clearTimer(record, 'holdTimer');
          if (record.wallTimer === null) _armWallClock(record);
          if (record.silenceTimer === null) _armSilence(record);
        } else {
          _clearTimer(record, 'silenceTimer');
          if (record.wallTimer === null) _armWallClock(record);
        }
        return _emit(record, null);
      });
    }

    function bindRegisteredAgent(input) {
      _requireHydrated();
      input = input || {};
      var record = records.get(_requireId(input.delegationId));
      if (!record || typeof input.agentId !== 'string' || input.agentId.length === 0) {
        return Promise.resolve({ ok: false, code: 'delegation_binding_rejected' });
      }
      return _enqueue(record, async function() {
        if (record.terminal
          || record.terminalPromise
          || !record.expectedRegistration
          || (record.state !== 'starting' && record.state !== 'running')
          || (record.agentId && record.agentId !== input.agentId)) {
          return { ok: false, code: 'delegation_binding_rejected' };
        }
        if (registry && typeof registry.bindDelegation === 'function') {
          var bound = await registry.bindDelegation({
            delegationId: record.delegationId,
            agentId: input.agentId
          });
          if (!bound || bound.ok === false) {
            return { ok: false, code: (bound && bound.code) || 'delegation_binding_rejected' };
          }
        }
        record.agentId = input.agentId;
        record.expectedRegistration = false;
        return _deepFreeze({
          ok: true,
          delegationId: record.delegationId,
          agentId: record.agentId
        });
      });
    }

    function preflight() {
      return _deepFreeze({ ok: true, state: 'preflighting' });
    }

    function awaitConsent() {
      return _deepFreeze({ ok: true, state: 'awaiting_consent' });
    }

    function _recordForOperation(input) {
      var delegationId = null;
      if (typeof input === 'string') delegationId = input;
      else if (input && typeof input.delegationId === 'string') delegationId = input.delegationId;
      if (!delegationId) {
        var candidates = Array.from(records.values()).filter(function(record) {
          return !record.terminal && !record.terminalPromise;
        });
        if (candidates.length === 1) return candidates[0];
        throw _error('invalid_delegation_id', 'an exact server delegation id is required');
      }
      var record = records.get(_requireId(delegationId));
      if (!record) throw _error('unknown_delegation', 'delegation is not registered');
      return record;
    }

    function _closedOperationResult(ok, code, record, runtimeEvent) {
      return _deepFreeze({
        ok: ok === true,
        code: code,
        runtimeEvent: runtimeEvent || null,
        snapshot: _snapshot(record)
      });
    }

    async function _refreshActiveTabRecord(record) {
      var activeTab;
      try {
        activeTab = await getActiveTab({ delegationId: record.delegationId });
      } catch (_activeTabError) {
        activeTab = null;
      }
      var activeTabId = activeTab && Number.isSafeInteger(activeTab.tabId)
        ? activeTab.tabId
        : (Number.isSafeInteger(activeTab) ? activeTab : null);

      if (!Number.isSafeInteger(activeTabId) || record.terminal || record.terminalPromise) {
        record.activeTab = null;
        return _snapshot(record);
      }

      // A sealed hold lease is the only authority for associating an
      // unowned tab with a held delegation. This lets the presentation hide
      // Resume when the user activates some unrelated tab without consulting
      // registry storage or slicing identifiers locally.
      if ((record.state === 'held' || record.state === 'resuming') && record.hold) {
        record.activeTab = record.hold.tabIds.indexOf(activeTabId) !== -1
          ? { tabId: activeTabId, owned: false, canTakeControl: false }
          : null;
        return _snapshot(record);
      }

      if (record.state !== 'running') {
        record.activeTab = null;
        return _snapshot(record);
      }

      var agentId = record.agentId;
      if (!agentId && registry && typeof registry.getAgentForDelegation === 'function') {
        try {
          agentId = await registry.getAgentForDelegation(record.delegationId);
          if (agentId && typeof agentId === 'object') agentId = agentId.agentId;
        } catch (_mappingError) {
          agentId = null;
        }
      }
      if (typeof agentId !== 'string'
        || agentId.length === 0
        || !registry
        || typeof registry.getDelegationOwnedTabs !== 'function') {
        record.activeTab = null;
        return _snapshot(record);
      }

      var ownedResult;
      try {
        ownedResult = await registry.getDelegationOwnedTabs({
          delegationId: record.delegationId,
          agentId: agentId
        });
      } catch (_ownedTabsError) {
        ownedResult = null;
      }
      var ownedTabs = Array.isArray(ownedResult)
        ? ownedResult
        : (ownedResult && Array.isArray(ownedResult.ownedTabs) ? ownedResult.ownedTabs : []);
      var seen = Object.create(null);
      var completeOwnedSet = ownedTabs.length > 0 && ownedTabs.every(function(tab) {
        if (!tab
          || !Number.isSafeInteger(tab.tabId)
          || tab.tabId < 0
          || typeof tab.ownershipToken !== 'string'
          || tab.ownershipToken.length === 0
          || seen[tab.tabId]) return false;
        seen[tab.tabId] = true;
        return true;
      });
      record.agentId = agentId;
      record.activeTab = completeOwnedSet && seen[activeTabId]
        ? { tabId: activeTabId, owned: true, canTakeControl: true }
        : null;
      return _snapshot(record);
    }

    function refreshActiveTab(input) {
      _requireHydrated();
      input = input || {};
      if (!_hasExactKeys(input, ['delegationId'])) {
        return Promise.reject(_error('invalid_delegation_id', 'an exact server delegation id is required'));
      }
      var record;
      try { record = _recordForOperation(input); } catch (error) { return Promise.reject(error); }
      return _enqueue(record, function() {
        return _refreshActiveTabRecord(record);
      });
    }

    function takeControl(input) {
      _requireHydrated();
      input = input || {};
      var record;
      try { record = _recordForOperation(input); } catch (error) { return Promise.reject(error); }
      if (record.holdPromise) return record.holdPromise;
      if (record.state === 'held') {
        return Promise.resolve(_closedOperationResult(true, 'already_held', record, null));
      }
      if (record.terminal || record.terminalPromise) {
        return Promise.resolve(_closedOperationResult(false, 'already_terminal', record, null));
      }
      if (record.state !== 'running') {
        return Promise.resolve(_closedOperationResult(false, 'invalid_transition', record, null));
      }

      var pendingHold = _enqueue(record, async function() {
        if (record.state !== 'running' || record.terminal || record.terminalPromise) {
          return _closedOperationResult(false, record.terminal ? 'already_terminal' : 'invalid_transition', record, null);
        }
        record.state = 'holding';
        var holdingEvent = _emit(record, null);

        var activeTab;
        try {
          activeTab = await getActiveTab({ delegationId: record.delegationId });
        } catch (_activeTabError) {
          activeTab = null;
        }
        var activeTabId = activeTab && Number.isSafeInteger(activeTab.tabId)
          ? activeTab.tabId
          : (Number.isSafeInteger(activeTab) ? activeTab : null);
        if (!Number.isSafeInteger(activeTabId)) {
          record.state = 'running';
          return _closedOperationResult(false, 'active_tab_not_owned', record, _emit(record, null));
        }

        var agentId = record.agentId;
        if (!agentId && registry && typeof registry.getAgentForDelegation === 'function') {
          try {
            agentId = await registry.getAgentForDelegation(record.delegationId);
            if (agentId && typeof agentId === 'object') agentId = agentId.agentId;
          } catch (_mappingError) {
            agentId = null;
          }
        }
        if (typeof agentId !== 'string' || agentId.length === 0
          || !registry
          || typeof registry.getDelegationOwnedTabs !== 'function'
          || typeof registry.sealHoldLease !== 'function') {
          record.state = 'running';
          return _closedOperationResult(false, 'delegation_binding_rejected', record, _emit(record, null));
        }
        record.agentId = agentId;

        var ownedResult;
        try {
          ownedResult = await registry.getDelegationOwnedTabs({
            delegationId: record.delegationId,
            agentId: agentId
          });
        } catch (_ownedTabsError) {
          record.state = 'running';
          return _closedOperationResult(false, 'delegation_binding_rejected', record, _emit(record, null));
        }
        var ownedTabs = Array.isArray(ownedResult)
          ? ownedResult
          : (ownedResult && Array.isArray(ownedResult.ownedTabs) ? ownedResult.ownedTabs : []);
        var ownershipTokens = Object.create(null);
        var completeOwnedSet = ownedTabs.length > 0 && ownedTabs.every(function(tab) {
          if (!tab
            || !Number.isSafeInteger(tab.tabId)
            || tab.tabId < 0
            || typeof tab.ownershipToken !== 'string'
            || tab.ownershipToken.length === 0
            || ownershipTokens[tab.tabId]) {
            return false;
          }
          ownershipTokens[tab.tabId] = true;
          return true;
        });
        var activeOwned = ownedTabs.some(function(tab) {
          return tab && tab.tabId === activeTabId;
        });
        if (!completeOwnedSet || !activeOwned) {
          record.state = 'running';
          return _closedOperationResult(false, 'active_tab_not_owned', record, _emit(record, null));
        }

        var held;
        try {
          held = await holdOperation({ delegationId: record.delegationId });
        } catch (_holdError) {
          held = null;
        }
        if (!held || (held.ok !== true && held.status !== 'held')) {
          var holdFailureCode = (held && held.code) || 'agent_failed';
          await _settle(record, holdFailureCode, { cancel: true });
          return _closedOperationResult(false, holdFailureCode, record, null);
        }

        var expiresAt = now() + HOLD_LEASE_MS;
        var sealed;
        try {
          sealed = await registry.sealHoldLease({
            delegationId: record.delegationId,
            agentId: agentId,
            activeTabId: activeTabId,
            ownedTabs: ownedTabs,
            expiresAt: expiresAt
          });
        } catch (_sealError) {
          sealed = null;
        }
        if (!sealed || sealed.ok === false) {
          await _settle(record, (sealed && sealed.code) || 'resume_ownership_lost', { cancel: true });
          return _closedOperationResult(false, (sealed && sealed.code) || 'resume_ownership_lost', record, null);
        }
        if (Number.isSafeInteger(sealed.expiresAt)) expiresAt = sealed.expiresAt;
        var tabIds = ownedTabs.map(function(tab) { return tab.tabId; }).sort(function(a, b) { return a - b; });
        record.hold = { tabIds: tabIds, expiresAt: expiresAt };
        record.holdOwnedTabs = _clone(ownedTabs);
        record.activeTab = { tabId: activeTabId, owned: false, canTakeControl: false };
        _clearTimer(record, 'silenceTimer');
        _armHoldExpiry(record, expiresAt);
        var heldEntry = await _appendStateEntry(record, 'held', 'Delegation held');
        _applyEntry(record, heldEntry, { notify: false, refreshSilence: false });
        return _closedOperationResult(true, 'held', record, _emit(record, heldEntry.sequence) || holdingEvent);
      });
      record.holdPromise = pendingHold;
      pendingHold.then(function() {
        if (record.holdPromise === pendingHold) record.holdPromise = null;
      }, function() {
        if (record.holdPromise === pendingHold) record.holdPromise = null;
      });
      return pendingHold;
    }

    function resumeDelegation(input) {
      _requireHydrated();
      input = input || {};
      var record;
      try { record = _recordForOperation(input); } catch (error) { return Promise.reject(error); }
      if (record.resumePromise) return record.resumePromise;
      if (record.terminal || record.terminalPromise) {
        return Promise.resolve(_closedOperationResult(false, 'already_terminal', record, null));
      }
      if (record.state === 'running') {
        return Promise.resolve(_closedOperationResult(true, 'already_running', record, null));
      }
      if (record.state !== 'held') {
        return Promise.resolve(_closedOperationResult(false, 'invalid_transition', record, null));
      }

      var pendingResume = _enqueue(record, async function() {
        if (record.state !== 'held' || !record.hold) {
          return _closedOperationResult(false, 'invalid_transition', record, null);
        }
        record.state = 'resuming';
        _emit(record, null);
        _clearTimer(record, 'holdTimer');

        var liveTabIds;
        try {
          liveTabIds = await getLiveTabIds({
            delegationId: record.delegationId,
            tabIds: record.hold.tabIds.slice()
          });
        } catch (_liveTabsError) {
          liveTabIds = [];
        }
        if (!Array.isArray(liveTabIds)) liveTabIds = [];
        var restored = { ok: false, code: 'resume_ownership_lost' };
        if (registry && typeof registry.restoreHoldLease === 'function') {
          try {
            restored = await registry.restoreHoldLease({
              delegationId: record.delegationId,
              agentId: record.agentId,
              liveTabIds: liveTabIds
            });
          } catch (_restoreError) { /* the sealed lease remains authoritative */ }
        }
        if (!restored || restored.ok === false) {
          await _settle(record, (restored && restored.code) || 'resume_ownership_lost', { cancel: true });
          return _closedOperationResult(false, (restored && restored.code) || 'resume_ownership_lost', record, null);
        }

        var resumed;
        try {
          resumed = await resumeOperation({ delegationId: record.delegationId });
        } catch (_resumeError) {
          resumed = null;
        }
        if (!resumed || (resumed.ok !== true && resumed.status !== 'running' && resumed.status !== 'resumed')) {
          var resumeFailureCode = (resumed && resumed.code) || 'resume_ownership_lost';
          if (registry
            && typeof registry.sealHoldLease === 'function'
            && Array.isArray(record.holdOwnedTabs)
            && record.activeTab
            && Number.isSafeInteger(record.activeTab.tabId)) {
            try {
              await registry.sealHoldLease({
                delegationId: record.delegationId,
                agentId: record.agentId,
                activeTabId: record.activeTab.tabId,
                ownedTabs: _clone(record.holdOwnedTabs),
                expiresAt: now() + HOLD_LEASE_MS
              });
            } catch (_resealError) { /* exact cancellation remains authoritative */ }
          }
          await _settle(record, resumeFailureCode, { cancel: true });
          return _closedOperationResult(false, resumeFailureCode, record, null);
        }

        var activeTabId = record.activeTab ? record.activeTab.tabId : record.hold.tabIds[0];
        record.hold = null;
        record.holdOwnedTabs = null;
        record.activeTab = Number.isSafeInteger(activeTabId)
          ? { tabId: activeTabId, owned: true, canTakeControl: true }
          : null;
        var runningEntry = await _appendStateEntry(record, 'running', 'Delegation resumed');
        _applyEntry(record, runningEntry, { notify: false, refreshSilence: false });
        _refreshSilence(record, runningEntry.timestamp);
        return _closedOperationResult(true, 'resumed', record, _emit(record, runningEntry.sequence));
      });
      record.resumePromise = pendingResume;
      pendingResume.then(function() {
        if (record.resumePromise === pendingResume) record.resumePromise = null;
      }, function() {
        if (record.resumePromise === pendingResume) record.resumePromise = null;
      });
      return pendingResume;
    }

    function stop(input) {
      _requireHydrated();
      input = input || {};
      var record;
      try { record = _recordForOperation(input); } catch (error) { return Promise.reject(error); }
      if (record.stopPromise) return record.stopPromise;
      if (record.terminal) {
        return Promise.resolve(_closedOperationResult(true, 'already_terminal', record, null));
      }
      record.stopPromise = _enqueue(record, async function() {
        if (record.terminal) return _closedOperationResult(true, 'already_terminal', record, null);
        record.state = 'stopping';
        _emit(record, null);
        var settled = await _settle(record, 'stopped', { cancel: true });
        return _closedOperationResult(settled.ok === true, settled.code, record, settled.runtimeEvent);
      });
      record.stopPromise.then(function(result) {
        if (result && result.ok !== true && record.stopPromise) record.stopPromise = null;
      }, function() {
        record.stopPromise = null;
      });
      return record.stopPromise;
    }

    return Object.freeze({
      preflight: preflight,
      awaitConsent: awaitConsent,
      start: start,
      acceptEvent: acceptEvent,
      takeControl: takeControl,
      resume: resumeDelegation,
      stop: stop,
      hydrate: hydrate,
      reconcile: reconcile,
      bindRegisteredAgent: bindRegisteredAgent,
      refreshActiveTab: refreshActiveTab,
      getSnapshot: getSnapshot,
      subscribe: subscribe
    });
  }

  var exportsObj = Object.freeze({
    SNAPSHOT_VERSION: SNAPSHOT_VERSION,
    RUNTIME_EVENT_TYPE: RUNTIME_EVENT_TYPE,
    create: create
  });

  global.FsbDelegationController = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})(typeof globalThis !== 'undefined' ? globalThis : this);
