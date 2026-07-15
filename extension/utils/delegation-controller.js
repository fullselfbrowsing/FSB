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
  var WALL_CLOCK_TIMEOUT_MS = 45 * 60 * 1000;
  var EVENT_SILENCE_TIMEOUT_MS = 120 * 1000;
  var HOLD_LEASE_MS = 5 * 60 * 1000;

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

  function _normalizeTerminalCode(value, eventStore) {
    if (eventStore && typeof eventStore.normalizeTerminalCode === 'function') {
      return eventStore.normalizeTerminalCode(value);
    }
    return typeof value === 'string' && VALID_TERMINAL_CODES[value]
      ? value
      : 'unknown_failure';
  }

  function _terminalState(code) {
    if (code === 'completed') return 'completed';
    if (code === 'stopped' || code === 'cancelled') return 'stopped';
    if (code === 'daemon_restart_lost_run') return 'restart_lost';
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
      holdOwnedTabs: null,
      terminal: null,
      hydrated: options.hydrated === true,
      agentId: null,
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
      startedAt: null,
      lastEventAt: null,
      expectedRegistration: true
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
      record.wallTimer = _unrefTimer(schedule(function() {
        record.wallTimer = null;
        _queueTimeout(record, 'wall_clock_timeout');
      }, WALL_CLOCK_TIMEOUT_MS));
    }

    function _refreshSilence(record) {
      _clearTimer(record, 'silenceTimer');
      if (record.terminalPromise || record.terminal || record.state === 'held') return;
      record.lastEventAt = now();
      record.silenceTimer = _unrefTimer(schedule(function() {
        record.silenceTimer = null;
        _queueTimeout(record, 'event_silence_timeout');
      }, EVENT_SILENCE_TIMEOUT_MS));
    }

    function _armHoldExpiry(record, expiresAt) {
      _clearTimer(record, 'holdTimer');
      var delay = Math.max(0, expiresAt - now());
      record.holdTimer = _unrefTimer(schedule(function() {
        record.holdTimer = null;
        _queueTimeout(record, 'hold_expired');
      }, delay));
    }

    function _applyEntry(record, entry, options) {
      options = options || {};
      var expected = record.entries.length + 1;
      if (!entry
        || entry.delegationId !== record.delegationId
        || entry.sequence !== expected) {
        throw _error('delegation_ledger_corrupt', 'canonical entry sequence or identity is invalid');
      }
      record.entries.push(entry);
      if (options.deferTerminalState !== true) record.state = entry.state;
      var summary = _summaryFromEntry(entry);
      if (summary) record.summary = summary;
      if (!record.provider && entry.init && entry.init.client) {
        record.provider = _closedProvider(entry.init.client);
      }
      if (options.refreshSilence !== false) _refreshSilence(record);
      if (options.notify === false) return null;
      return _emit(record, entry.sequence);
    }

    function _persistenceCode(error) {
      return error && PERSISTENCE_CODES[error.code]
        ? error.code
        : 'delegation_persistence_failed';
    }

    async function _appendStateEntry(record, state, title) {
      var canonicalEntry;
      try {
        canonicalEntry = await eventStore.appendBeforeFanout(
          record.delegationId,
          { type: 'state', sessionId: null, payload: {} },
          { timestamp: now(), state: state, title: title, detail: null }
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

    function _cancelOnce(record, code) {
      if (!record.cancelPromise) {
        record.cancelPromise = Promise.resolve().then(function() {
          return cancel({ delegationId: record.delegationId, code: code });
        });
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
          var count = result && Number.isSafeInteger(result.releasedTabCount)
            && result.releasedTabCount >= 0
            ? result.releasedTabCount
            : 0;
          return { result: result || null, releasedTabCount: count };
        });
      }
      return record.releasePromise;
    }

    function _failPersistence(record, error) {
      if (!record.persistenceFailure) {
        var code = _persistenceCode(error);
        _clearTimers(record);
        record.persistenceFailure = _cancelOnce(record, code).catch(function() {
          // The persistence error remains authoritative even when cancellation
          // transport is unavailable. No subscriber is notified in either case.
        }).then(function() { return _releaseOnce(record); }).catch(function() {
          return { releasedTabCount: 0 };
        }).then(function(release) {
          record.state = 'failed';
          record.terminal = {
            code: code,
            releasedTabCount: release.releasedTabCount || 0
          };
          return code;
        });
      }
      return record.persistenceFailure.then(function() { throw error; });
    }

    function _settle(record, requestedCode, options) {
      if (record.terminalPromise) return record.terminalPromise;
      options = options || {};
      var code = _normalizeTerminalCode(requestedCode, eventStore);
      _clearTimers(record);
      record.terminalPromise = Promise.resolve().then(async function() {
        var settledCode = code;
        var terminalEntry = options.entry || null;
        if (options.cancel !== false) {
          try {
            var cancelResult = await _cancelOnce(record, settledCode);
            if (!cancelResult
              || (cancelResult.status !== 'cancelled'
                && cancelResult.status !== 'already_terminal')) {
              settledCode = 'tree_unsettled';
            }
          } catch (_cancelError) {
            settledCode = 'tree_unsettled';
          }
        }

        var release = { releasedTabCount: 0 };
        if (settledCode !== 'tree_unsettled') {
          try { release = await _releaseOnce(record); } catch (_releaseError) { /* release zero, touch nothing else */ }
        }

        try {
          if (!terminalEntry) {
            terminalEntry = await eventStore.appendBeforeFanout(
              record.delegationId,
              { type: 'terminal', sessionId: null, payload: {} },
              {
                timestamp: now(),
                terminalCode: settledCode,
                title: 'Delegation ended',
                detail: null
              }
            );
            if (!terminalEntry
              || terminalEntry.delegationId !== record.delegationId
              || terminalEntry.sequence !== record.entries.length + 1) {
              throw _error('delegation_ledger_corrupt', 'canonical entry sequence or identity is invalid');
            }
          }
          await eventStore.markTerminal(record.delegationId, { code: settledCode });
        } catch (storageError) {
          var persistenceCode = _persistenceCode(storageError);
          try { await _cancelOnce(record, persistenceCode); } catch (_cancelError) { /* preserve storage error */ }
          record.state = 'failed';
          record.terminal = {
            code: persistenceCode,
            releasedTabCount: release.releasedTabCount || 0
          };
          throw storageError;
        }

        if (terminalEntry) {
          _applyEntry(record, terminalEntry, {
            notify: false,
            deferTerminalState: true,
            refreshSilence: false
          });
        }
        record.state = _terminalState(settledCode);
        if (record.summary) record.summary.state = _summaryState(record.state);
        record.terminal = {
          code: settledCode,
          releasedTabCount: release.releasedTabCount || 0
        };
        var runtimeEvent = _emit(record, terminalEntry ? terminalEntry.sequence : null);
        return _deepFreeze({
          ok: true,
          code: settledCode,
          releasedTabCount: record.terminal.releasedTabCount,
          runtimeEvent: runtimeEvent,
          snapshot: _snapshot(record)
        });
      });
      return record.terminalPromise;
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
      if (records.has(delegationId)) {
        var existing = records.get(delegationId);
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
        provider: input.provider || { id: PROVIDER_ID, label: PROVIDER_LABEL },
        state: 'starting',
        connection: VALID_CONNECTIONS[input.connection] ? input.connection : 'connected',
        hydrated: true
      });
      record.startedAt = now();
      record.lastEventAt = record.startedAt;
      records.set(delegationId, record);
      _armWallClock(record);
      _refreshSilence(record);
      provisional = null;
      var runtimeEvent = _emit(record, null);
      record.startPromise = Promise.resolve(_deepFreeze({
        ok: true,
        code: 'started',
        runtimeEvent: runtimeEvent,
        snapshot: _snapshot(record)
      }));
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
      var context = _isPlainRecord(input.context) ? Object.assign({}, input.context) : {};
      if (!Number.isSafeInteger(context.timestamp) || context.timestamp < 0) context.timestamp = now();
      return _enqueue(record, async function() {
        if (record.terminal || record.terminalPromise) {
          throw _error('delegation_already_terminal', 'delegation is already terminal');
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

        var terminalCode = null;
        if (canonicalEntry.kind === 'result'
          || canonicalEntry.state === 'completed'
          || canonicalEntry.state === 'failed'
          || canonicalEntry.state === 'stopped'
          || canonicalEntry.state === 'restart_lost') {
          if (input.event.type === 'terminal' && context.terminalCode) {
            terminalCode = context.terminalCode;
          } else if (canonicalEntry.state === 'completed') terminalCode = 'completed';
          else if (canonicalEntry.state === 'stopped') terminalCode = 'stopped';
          else if (canonicalEntry.state === 'restart_lost') terminalCode = 'daemon_restart_lost_run';
          else terminalCode = context.terminalCode || 'agent_failed';
        }

        if (terminalCode) {
          await _settle(record, terminalCode, {
            entry: canonicalEntry,
            cancel: input.event.type !== 'result' && context.treeSettled !== true
          });
          return canonicalEntry;
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
        var resolved = input;
        if (!VALID_CONNECTIONS[resolved.connection]
          && !resolved.terminalCode
          && !resolved.recoveryDisposition) {
          resolved = await statusOperation({ delegationId: record.delegationId });
          resolved = resolved || {};
        }
        var explicitTerminal = resolved.terminalCode
          || (resolved.recoveryDisposition === 'daemon_restart_lost_run'
            ? 'daemon_restart_lost_run'
            : null);
        if (explicitTerminal) {
          return _settle(record, explicitTerminal, { cancel: explicitTerminal !== 'completed' });
        }
        if (VALID_CONNECTIONS[resolved.connection]) record.connection = resolved.connection;
        if (resolved.activeTab
          && Number.isSafeInteger(resolved.activeTab.tabId)
          && typeof resolved.activeTab.owned === 'boolean'
          && typeof resolved.activeTab.canTakeControl === 'boolean') {
          record.activeTab = {
            tabId: resolved.activeTab.tabId,
            owned: resolved.activeTab.owned,
            canTakeControl: resolved.activeTab.canTakeControl
          };
        }
        if (record.connection === 'connected') {
          if (record.wallTimer === null) _armWallClock(record);
          if (record.state !== 'held' && record.silenceTimer === null) _refreshSilence(record);
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
        _refreshSilence(record);
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
        return _closedOperationResult(true, settled.code, record, settled.runtimeEvent);
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
