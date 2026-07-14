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
  var PROVIDER_ID = 'claude-code';
  var PROVIDER_LABEL = 'Claude Code';

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

  function _error(code, message) {
    var error = new Error(message || code);
    error.name = 'DelegationControllerError';
    error.code = code;
    return error;
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

  function _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function _deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach(function(key) { _deepFreeze(value[key]); });
    return value;
  }

  function _closedProvider(value) {
    if (value === null) return null;
    if (value && value.id === PROVIDER_ID) {
      return { id: PROVIDER_ID, label: PROVIDER_LABEL };
    }
    return null;
  }

  function _summaryState(state) {
    if (state === 'completed') return 'completed';
    if (state === 'stopped') return 'stopped';
    if (state === 'restart_lost') return 'restart_lost';
    return 'failed';
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

  function _providerFromEntries(entries) {
    for (var i = 0; i < entries.length; i++) {
      var init = entries[i] && entries[i].init;
      if (init && init.client && init.client.id === PROVIDER_ID) {
        return { id: PROVIDER_ID, label: PROVIDER_LABEL };
      }
    }
    return null;
  }

  function _latestSummary(entries) {
    for (var i = entries.length - 1; i >= 0; i--) {
      var summary = _summaryFromEntry(entries[i]);
      if (summary) return summary;
    }
    return null;
  }

  function _newRecord(delegationId, options) {
    options = options || {};
    return {
      delegationId: delegationId,
      provider: _closedProvider(options.provider),
      state: VALID_STATES[options.state] ? options.state : 'starting',
      connection: VALID_CONNECTIONS[options.connection] ? options.connection : 'connected',
      entries: Array.isArray(options.entries) ? options.entries.slice() : [],
      summary: options.summary || null,
      activeTab: null,
      hold: null,
      terminal: null,
      hydrated: options.hydrated === true,
      agentId: null,
      eventTail: Promise.resolve(),
      persistenceFailure: null
    };
  }

  function _snapshot(record) {
    return _deepFreeze({
      v: SNAPSHOT_VERSION,
      delegationId: record.delegationId,
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
      || typeof eventStore.markTerminal !== 'function') {
      throw _error('delegation_controller_invalid_dependency', 'eventStore is required');
    }

    var clock = options.clock || {};
    var now = typeof clock.now === 'function'
      ? function() { return clock.now(); }
      : function() { return Date.now(); };
    var cancel = typeof options.cancel === 'function'
      ? options.cancel
      : function() { return Promise.resolve(); };
    var records = new Map();
    var listeners = new Set();
    var hydrated = false;
    var hydratePromise = null;
    var provisional = null;

    function _requireHydrated() {
      if (!hydrated) throw _error('delegation_not_hydrated', 'hydrate must complete first');
    }

    function _requireId(delegationId) {
      if (typeof delegationId !== 'string' || delegationId.length === 0) {
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

    function _applyEntry(record, entry) {
      var expected = record.entries.length + 1;
      if (!entry
        || entry.delegationId !== record.delegationId
        || entry.sequence !== expected) {
        throw _error('delegation_ledger_corrupt', 'canonical entry sequence or identity is invalid');
      }
      record.entries.push(entry);
      record.state = entry.state;
      var summary = _summaryFromEntry(entry);
      if (summary) record.summary = summary;
      if (!record.provider && entry.init && entry.init.client) {
        record.provider = _closedProvider(entry.init.client);
      }
      return _emit(record, entry.sequence);
    }

    function _persistenceCode(error) {
      return error && PERSISTENCE_CODES[error.code]
        ? error.code
        : 'delegation_persistence_failed';
    }

    function _failPersistence(record, error) {
      if (!record.persistenceFailure) {
        var code = _persistenceCode(error);
        record.persistenceFailure = Promise.resolve().then(function() {
          return cancel({ delegationId: record.delegationId, code: code });
        }).catch(function() {
          // The persistence error remains authoritative even when cancellation
          // transport is unavailable. No subscriber is notified in either case.
        }).then(function() {
          record.state = 'failed';
          record.terminal = { code: code, releasedTabCount: 0 };
          return code;
        });
      }
      return record.persistenceFailure.then(function() { throw error; });
    }

    function hydrate() {
      if (hydratePromise) return hydratePromise;
      hydratePromise = Promise.resolve().then(function() {
        return eventStore.hydrateNonterminal();
      }).then(function(ledgers) {
        if (!Array.isArray(ledgers)) {
          throw _error('delegation_ledger_corrupt', 'hydration result must be an array');
        }
        var restored = new Map();
        ledgers.forEach(function(ledger) {
          if (!ledger || typeof ledger.delegationId !== 'string' || restored.has(ledger.delegationId)) {
            throw _error('delegation_ledger_corrupt', 'hydrated ledger identity is invalid');
          }
          var entries = Array.isArray(ledger.entries) ? ledger.entries.slice() : [];
          var state = entries.length > 0 ? entries[entries.length - 1].state : 'idle';
          var record = _newRecord(ledger.delegationId, {
            provider: _providerFromEntries(entries),
            state: state,
            connection: 'disconnected',
            entries: entries,
            summary: _latestSummary(entries),
            hydrated: true
          });
          restored.set(ledger.delegationId, record);
        });
        records = restored;
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
      if (records.has(delegationId)) return _snapshot(records.get(delegationId));
      if (provisional && provisional.delegationId !== delegationId) {
        throw _error('delegation_start_in_progress', 'another provisional start is active');
      }
      provisional = { delegationId: delegationId };
      var record = _newRecord(delegationId, {
        provider: input.provider || { id: PROVIDER_ID, label: PROVIDER_LABEL },
        state: 'starting',
        connection: VALID_CONNECTIONS[input.connection] ? input.connection : 'connected',
        hydrated: true
      });
      records.set(delegationId, record);
      provisional = null;
      return _snapshot(record);
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
      var context = _isPlainRecord(input.context) ? Object.assign({}, input.context) : {};
      if (!Number.isSafeInteger(context.timestamp) || context.timestamp < 0) context.timestamp = now();

      var operation = record.eventTail.then(function() {
        return eventStore.appendBeforeFanout(delegationId, input.event, context);
      }).then(function(canonicalEntry) {
        _applyEntry(record, canonicalEntry);
        return canonicalEntry;
      }).catch(function(error) {
        return _failPersistence(record, error);
      });
      record.eventTail = operation.then(function() {}, function() {});
      return operation;
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
      if (VALID_CONNECTIONS[input.connection]) record.connection = input.connection;
      return _emit(record, null);
    }

    function bindRegisteredAgent(input) {
      _requireHydrated();
      input = input || {};
      var record = records.get(_requireId(input.delegationId));
      if (!record || typeof input.agentId !== 'string' || input.agentId.length === 0) {
        return { ok: false, code: 'delegation_binding_rejected' };
      }
      if (record.agentId && record.agentId !== input.agentId) {
        return { ok: false, code: 'delegation_binding_rejected' };
      }
      record.agentId = input.agentId;
      return { ok: true, delegationId: record.delegationId, agentId: record.agentId };
    }

    function preflight(input) {
      return { ok: true, state: 'preflighting', input: input || null };
    }

    function awaitConsent(input) {
      return { ok: true, state: 'awaiting_consent', input: input || null };
    }

    function unsupportedTransition() {
      return Promise.reject(_error('delegation_transition_unavailable', 'transition is not available yet'));
    }

    return Object.freeze({
      preflight: preflight,
      awaitConsent: awaitConsent,
      start: start,
      acceptEvent: acceptEvent,
      takeControl: unsupportedTransition,
      resume: unsupportedTransition,
      stop: unsupportedTransition,
      hydrate: hydrate,
      reconcile: reconcile,
      bindRegisteredAgent: bindRegisteredAgent,
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
