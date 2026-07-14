'use strict';

const assert = require('assert');
const path = require('path');
const fixtures = require('./fixtures/delegation-events');

const STORE_PATH = path.join(__dirname, '..', 'extension', 'utils', 'delegation-event-store.js');
const CONTROLLER_PATH = path.join(__dirname, '..', 'extension', 'utils', 'delegation-controller.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  PASS:', name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL:', name, '--', error && error.stack ? error.stack : error);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactKeys(value, keys) {
  assert.deepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function freshModules() {
  delete require.cache[require.resolve(STORE_PATH)];
  delete require.cache[require.resolve(CONTROLLER_PATH)];
  return {
    store: require(STORE_PATH),
    controllerModule: require(CONTROLLER_PATH),
  };
}

function installSessionStorage(initial = {}) {
  const previous = globalThis.chrome;
  const data = clone(initial);
  let writeError = null;
  let gate = null;
  let startedResolve = null;
  let setCalls = 0;

  globalThis.chrome = {
    storage: {
      session: {
        async get(keys) {
          if (keys == null) return clone(data);
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const key of list) if (Object.hasOwn(data, key)) out[key] = clone(data[key]);
          return out;
        },
        async set(update) {
          setCalls += 1;
          if (startedResolve) startedResolve();
          if (gate) await gate.promise;
          if (writeError) throw writeError;
          Object.assign(data, clone(update));
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
        },
      },
    },
  };

  return {
    data,
    get setCalls() { return setCalls; },
    rejectWrites(error = new Error('write rejected')) { writeError = error; },
    clear() { for (const key of Object.keys(data)) delete data[key]; },
    deferWrites() {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      const started = new Promise((done) => { startedResolve = done; });
      gate = { promise, resolve };
      return {
        started,
        resolve() {
          const current = gate;
          gate = null;
          startedResolve = null;
          current.resolve();
        },
      };
    },
    restore() {
      if (previous === undefined) delete globalThis.chrome;
      else globalThis.chrome = previous;
    },
  };
}

function makeDeps(store, overrides = {}) {
  const calls = {
    cancel: [],
    status: [],
    hold: [],
    resume: [],
    registry: [],
  };
  const deps = {
    eventStore: store,
    clock: { now: () => 1720000000000 },
    cancel: async (input) => { calls.cancel.push(clone(input)); },
    status: async (input) => { calls.status.push(clone(input)); },
    hold: async (input) => { calls.hold.push(clone(input)); },
    resume: async (input) => { calls.resume.push(clone(input)); },
    registry: {
      bindDelegation() { calls.registry.push('bind'); },
      hydrate() { calls.registry.push('hydrate'); },
    },
    ...overrides,
  };
  return { deps, calls };
}

function eventInput(delegationId, event, context = {}) {
  return { delegationId, event, context };
}

async function expectCode(value, code) {
  let caught = null;
  try {
    if (typeof value === 'function') await value();
    else await value;
  } catch (error) {
    caught = error;
  }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code);
  return caught;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function flushAsync() {
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createFakeClock(start = 1720000000000) {
  let current = start;
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => current,
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: current + delay, callback, id });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async tick(milliseconds) {
      const target = current + milliseconds;
      while (true) {
        const due = [...timers.values()]
          .filter((timer) => timer.at <= target)
          .sort((left, right) => left.at - right.at || left.id - right.id)[0];
        if (!due) break;
        timers.delete(due.id);
        current = due.at;
        due.callback();
        await flushAsync();
      }
      current = target;
      await flushAsync();
    },
    pending() {
      return timers.size;
    },
  };
}

function terminalState(code) {
  if (code === 'completed') return 'completed';
  if (code === 'stopped' || code === 'cancelled') return 'stopped';
  if (code === 'daemon_restart_lost_run') return 'restart_lost';
  return 'failed';
}

(async () => {
  console.log('--- Phase 61 Plan 02: delegation controller ---');

  await test('exports one closed controller factory and exact instance API', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      exactKeys(controllerModule, ['RUNTIME_EVENT_TYPE', 'SNAPSHOT_VERSION', 'create']);
      assert.strictEqual(controllerModule.RUNTIME_EVENT_TYPE, 'FSB_DELEGATION_UPDATED');
      assert.strictEqual(controllerModule.SNAPSHOT_VERSION, 1);
      assert.strictEqual(globalThis.FsbDelegationController, controllerModule);
      const { deps } = makeDeps(store);
      const controller = controllerModule.create(deps);
      exactKeys(controller, [
        'preflight', 'awaitConsent', 'start', 'acceptEvent', 'takeControl',
        'resume', 'stop', 'hydrate', 'reconcile', 'bindRegisteredAgent',
        'getSnapshot', 'subscribe',
      ]);
      await expectCode(() => controller.subscribe(() => {}), 'delegation_not_hydrated');
      await controller.hydrate();
    } finally {
      storage.restore();
    }
  });

  await test('deferred persistence is the commit point for state and subscriber fanout', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const { deps } = makeDeps(store);
      const controller = controllerModule.create(deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      controller.start({ delegationId: id });
      const delivered = [];
      controller.subscribe((event) => delivered.push(event));
      const deferred = storage.deferWrites();
      let settled = false;
      const accepting = controller.acceptEvent(eventInput(id, fixtures.initEvent, {
        ...fixtures.baseContext,
        timestamp: 1720000000001,
      })).then((entry) => {
        settled = true;
        return entry;
      });
      await deferred.started;
      await Promise.resolve();
      assert.strictEqual(settled, false);
      assert.strictEqual(delivered.length, 0);
      const before = controller.getSnapshot(id);
      assert.strictEqual(before.state, 'starting');
      assert.strictEqual(before.entries.length, 0);
      deferred.resolve();
      const entry = await accepting;
      assert.strictEqual(entry.sequence, 1);
      assert.strictEqual(delivered.length, 1);
      const runtimeEvent = delivered[0];
      exactKeys(runtimeEvent, ['announceSequence', 'snapshot', 'type']);
      assert.strictEqual(runtimeEvent.type, 'FSB_DELEGATION_UPDATED');
      assert.strictEqual(runtimeEvent.announceSequence, 1);
      exactKeys(runtimeEvent.snapshot, [
        'v', 'delegationId', 'provider', 'state', 'connection', 'entries',
        'summary', 'activeTab', 'hold', 'terminal', 'hydrated',
      ]);
      assert.strictEqual(runtimeEvent.snapshot.entries.length, 1);
      assert.deepStrictEqual(runtimeEvent.snapshot.entries[0], entry);
      assert.strictEqual(runtimeEvent.snapshot.state, 'running');
      assert.strictEqual(storage.setCalls, 1);
      assert(Object.isFrozen(runtimeEvent));
      assert(Object.isFrozen(runtimeEvent.snapshot.entries));
    } finally {
      storage.restore();
    }
  });

  await test('write rejection cancels first, fails closed, and never fans out', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const order = [];
      const { deps, calls } = makeDeps(store, {
        cancel: async (input) => {
          order.push('cancel');
          calls.cancel.push(clone(input));
        },
      });
      const controller = controllerModule.create(deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      controller.start({ delegationId: id });
      let listenerCalls = 0;
      controller.subscribe(() => { listenerCalls += 1; order.push('listener'); });
      storage.rejectWrites();
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext)),
        'delegation_persistence_failed',
      );
      assert.deepStrictEqual(order, ['cancel']);
      assert.deepStrictEqual(calls.cancel, [{
        delegationId: id,
        code: 'delegation_persistence_failed',
      }]);
      assert.strictEqual(listenerCalls, 0);
      const snapshot = controller.getSnapshot(id);
      assert.strictEqual(snapshot.entries.length, 0);
      assert.strictEqual(snapshot.state, 'failed');
      assert.deepStrictEqual(snapshot.terminal, {
        code: 'delegation_persistence_failed',
        releasedTabCount: 0,
      });
    } finally {
      storage.restore();
    }
  });

  await test('quota and corrupt canonical entries use typed cancellation with no fanout', async () => {
    for (const code of ['delegation_quota_exceeded', 'delegation_ledger_corrupt']) {
      const fakeStore = {
        async hydrateNonterminal() { return []; },
        async appendBeforeFanout(id) {
          if (code === 'delegation_ledger_corrupt') {
            return {
              delegationId: id,
              sequence: 2,
            };
          }
          const error = new Error(code);
          error.code = code;
          throw error;
        },
        async markTerminal() {},
      };
      const { controllerModule } = freshModules();
      const { deps, calls } = makeDeps(fakeStore);
      const controller = controllerModule.create(deps);
      await controller.hydrate();
      const id = `delegation_${code}`;
      controller.start({ delegationId: id });
      let delivered = 0;
      controller.subscribe(() => { delivered += 1; });
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.stateEvent)),
        code,
      );
      assert.strictEqual(delivered, 0);
      assert.deepStrictEqual(calls.cancel, [{ delegationId: id, code }]);
      assert.strictEqual(controller.getSnapshot(id).entries.length, 0);
    }
  });

  await test('forced module reload hydrates exact display rows silently with no execution side effects', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let harness = makeDeps(modules.store);
      let controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      controller.start({ delegationId: id });
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext));
      await controller.acceptEvent(eventInput(id, fixtures.toolUseEvent, {
        ...fixtures.baseContext,
        timestamp: fixtures.baseContext.timestamp + 1,
      }));

      modules = freshModules();
      harness = makeDeps(modules.store);
      controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      exactKeys(restored[0], [
        'v', 'delegationId', 'provider', 'state', 'connection', 'entries',
        'summary', 'activeTab', 'hold', 'terminal', 'hydrated',
      ]);
      assert.strictEqual(restored[0].delegationId, id);
      assert.strictEqual(restored[0].hydrated, true);
      assert.strictEqual(restored[0].connection, 'disconnected');
      assert.deepStrictEqual(restored[0].entries.map((entry) => entry.sequence), [1, 2]);
      assert.deepStrictEqual(restored[0].entries.map((entry) => entry.kind), ['init', 'tool-call']);
      assert.deepStrictEqual(restored[0].provider, { id: 'claude-code', label: 'Claude Code' });
      assert.deepStrictEqual(harness.calls, {
        cancel: [], status: [], hold: [], resume: [], registry: [],
      });
      let hydratedReplay = 0;
      controller.subscribe(() => { hydratedReplay += 1; });
      assert.strictEqual(hydratedReplay, 0);
    } finally {
      storage.restore();
    }
  });

  await test('cleared session reload returns no records and never claims continuity', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      controller.start({ delegationId: id });
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext));
      storage.clear();

      modules = freshModules();
      const harness = makeDeps(modules.store);
      controller = modules.controllerModule.create(harness.deps);
      assert.deepStrictEqual(await controller.hydrate(), []);
      assert.strictEqual(controller.getSnapshot(id), null);
      assert.deepStrictEqual(harness.calls, {
        cancel: [], status: [], hold: [], resume: [], registry: [],
      });
    } finally {
      storage.restore();
    }
  });

  await test('persisted duplicate, conflict, and gap corruption abort hydration without replay', async () => {
    const bootstrapStorage = installSessionStorage();
    let bootstrap;
    try {
      bootstrap = freshModules().store;
    } finally {
      bootstrapStorage.restore();
    }
    const id = fixtures.baseContext.delegationId;
    const first = bootstrap.project(fixtures.initEvent, fixtures.baseContext);
    const second = bootstrap.project(fixtures.stateEvent, {
      ...fixtures.baseContext,
      sequence: 2,
    });
    const key = `${bootstrap.STORAGE_KEY_PREFIX}${id}`;
    const cases = [
      [first, clone(first)],
      [first, { ...clone(first), title: 'conflicting duplicate' }],
      [first, { ...clone(second), sequence: 3 }],
    ];
    for (const entries of cases) {
      const envelope = fixtures.makePersistedEnvelope(entries);
      const storage = installSessionStorage({ [key]: envelope });
      try {
        const { store, controllerModule } = freshModules();
        const harness = makeDeps(store);
        const controller = controllerModule.create(harness.deps);
        await expectCode(controller.hydrate(), 'delegation_ledger_corrupt');
        await expectCode(() => controller.subscribe(() => {}), 'delegation_not_hydrated');
        assert.deepStrictEqual(harness.calls, {
          cancel: [], status: [], hold: [], resume: [], registry: [],
        });
      } finally {
        storage.restore();
      }
    }
  });

  await test('listener exceptions are isolated after the persisted commit', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const controller = controllerModule.create(makeDeps(store).deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      controller.start({ delegationId: id });
      let goodCalls = 0;
      controller.subscribe(() => { throw new Error('bad subscriber'); });
      controller.subscribe(() => { goodCalls += 1; });
      const entry = await controller.acceptEvent(eventInput(id, fixtures.stateEvent, {
        ...fixtures.baseContext,
        state: 'running',
      }));
      assert.strictEqual(entry.sequence, 1);
      assert.strictEqual(goodCalls, 1);
      assert.strictEqual(controller.getSnapshot(id).entries.length, 1);
    } finally {
      storage.restore();
    }
  });

  await test('closed terminal table persists exact mappings and collapses unknown diagnostics', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const harness = makeDeps(store);
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const codes = [
        'completed', 'stopped', 'cancelled', 'start_rejected',
        'wall_clock_timeout', 'event_silence_timeout',
        'delegation_persistence_failed', 'delegation_quota_exceeded',
        'delegation_ledger_corrupt', 'route_lost', 'agent_offline',
        'agent_unpaired', 'unsupported_provider', 'hold_expired',
        'resume_ownership_lost', 'daemon_restart_lost_run',
        'agent_protocol_drift', 'tree_unsettled', 'agent_failed',
        'unknown_failure',
      ];
      const cases = codes.map((code) => ({ code, input: code })).concat([{
        code: 'unknown_failure',
        input: 'provider_private_terminal_diagnostic',
      }]);

      for (const [index, item] of cases.entries()) {
        const id = `delegation_terminal_${index}`;
        await controller.start({ delegationId: id });
        const entry = await controller.acceptEvent(eventInput(id, fixtures.terminalEvent, {
          timestamp: 1720000000100 + index,
          terminalCode: item.input,
          treeSettled: true,
        }));
        const snapshot = controller.getSnapshot(id);
        assert.strictEqual(entry.state, terminalState(item.code));
        assert.strictEqual(snapshot.state, terminalState(item.code));
        exactKeys(snapshot.terminal, ['code', 'releasedTabCount']);
        assert.deepStrictEqual(snapshot.terminal, {
          code: item.code,
          releasedTabCount: 0,
        });
        const envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
        assert.strictEqual(envelope.terminal, true);
        assert.strictEqual(envelope.terminalCode, item.code);
        assert.strictEqual(envelope.entries.length, 1);
      }

      assert.deepStrictEqual(harness.calls.cancel, []);
      assert.strictEqual(
        JSON.stringify(storage.data).includes('provider_private_terminal_diagnostic'),
        false,
      );
    } finally {
      storage.restore();
    }
  });

  await test('start-vs-stop and duplicate stop coalesce to one terminal settlement', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const harness = makeDeps(store);
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_start_stop_race';
      const firstStart = controller.start({ delegationId: id });
      const duplicateStart = controller.start({ delegationId: id });
      assert.strictEqual(firstStart, duplicateStart);
      const firstStop = controller.stop({ delegationId: id });
      const duplicateStop = controller.stop({ delegationId: id });
      assert.strictEqual(firstStop, duplicateStop);

      const [started, stopped] = await Promise.all([firstStart, firstStop]);
      assert.strictEqual(started.code, 'started');
      assert.strictEqual(stopped.code, 'stopped');
      assert.deepStrictEqual(harness.calls.cancel, [{ delegationId: id, code: 'stopped' }]);
      const snapshot = controller.getSnapshot(id);
      assert.strictEqual(snapshot.state, 'stopped');
      assert.deepStrictEqual(snapshot.terminal, { code: 'stopped', releasedTabCount: 0 });
      const envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
      assert.strictEqual(envelope.terminal, true);
      assert.strictEqual(envelope.terminalCode, 'stopped');
      assert.strictEqual(envelope.entries.length, 1);
      assert.strictEqual(envelope.entries[0].state, 'stopped');
    } finally {
      storage.restore();
    }
  });

  await test('final-vs-stop ordering chooses exactly one winner in both directions', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const harness = makeDeps(store);
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      const finalFirstId = 'delegation_final_first';
      await controller.start({ delegationId: finalFirstId });
      const finalFirst = controller.acceptEvent(eventInput(finalFirstId, fixtures.resultEvent, {
        timestamp: 1720000000200,
        state: 'completed',
        billingKind: 'subscription',
      }));
      const lateStop = controller.stop({ delegationId: finalFirstId });
      const [finalEntry, lateStopResult] = await Promise.all([finalFirst, lateStop]);
      assert.strictEqual(finalEntry.state, 'completed');
      assert.strictEqual(lateStopResult.code, 'already_terminal');
      const finalSnapshot = controller.getSnapshot(finalFirstId);
      assert.deepStrictEqual(finalSnapshot.terminal, {
        code: 'completed',
        releasedTabCount: 0,
      });
      exactKeys(finalSnapshot.summary, [
        'inputTokens', 'outputTokens', 'totalTokens', 'turns', 'durationMs',
        'billingKind', 'usd', 'toolCalls', 'state',
      ]);
      assert.strictEqual(finalSnapshot.summary.billingKind, 'subscription');
      assert.strictEqual(finalSnapshot.summary.usd, null);
      assert.strictEqual(finalSnapshot.summary.state, 'completed');
      assert.strictEqual(
        harness.calls.cancel.filter((call) => call.delegationId === finalFirstId).length,
        0,
      );

      const stopFirstId = 'delegation_stop_first';
      await controller.start({ delegationId: stopFirstId });
      await controller.acceptEvent(eventInput(stopFirstId, fixtures.initEvent, {
        ...fixtures.baseContext,
        timestamp: 1720000000300,
      }));
      const stopFirst = controller.stop({ delegationId: stopFirstId });
      const lateFinal = expectCode(
        controller.acceptEvent(eventInput(stopFirstId, fixtures.resultEvent, {
          timestamp: 1720000000301,
          state: 'completed',
        })),
        'delegation_already_terminal',
      );
      const stopResult = await stopFirst;
      await lateFinal;
      assert.strictEqual(stopResult.code, 'stopped');
      assert.deepStrictEqual(controller.getSnapshot(stopFirstId).terminal, {
        code: 'stopped',
        releasedTabCount: 0,
      });
      assert.strictEqual(
        harness.calls.cancel.filter((call) => call.delegationId === stopFirstId).length,
        1,
      );
      const envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${stopFirstId}`];
      assert.strictEqual(envelope.terminal, true);
      assert.strictEqual(envelope.entries.length, 1);
      assert.strictEqual(envelope.entries[0].kind, 'init');
    } finally {
      storage.restore();
    }
  });

  await test('event-silence and wall-clock watchdogs race finals exactly once', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const clock = createFakeClock();
      const harness = makeDeps(store, { clock });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      const finalId = 'delegation_final_beats_timeout';
      await controller.start({ delegationId: finalId });
      await controller.acceptEvent(eventInput(finalId, fixtures.initEvent, {}));
      await clock.tick(119999);
      await controller.acceptEvent(eventInput(finalId, fixtures.resultEvent, {
        state: 'completed',
        billingKind: 'subscription',
      }));
      await clock.tick(1);
      assert.deepStrictEqual(controller.getSnapshot(finalId).terminal, {
        code: 'completed',
        releasedTabCount: 0,
      });
      assert.strictEqual(
        harness.calls.cancel.filter((call) => call.delegationId === finalId).length,
        0,
      );

      const silenceId = 'delegation_silence_timeout';
      await controller.start({ delegationId: silenceId });
      await controller.acceptEvent(eventInput(silenceId, fixtures.initEvent, {}));
      await clock.tick(120000);
      assert.deepStrictEqual(controller.getSnapshot(silenceId).terminal, {
        code: 'event_silence_timeout',
        releasedTabCount: 0,
      });
      assert.strictEqual(
        harness.calls.cancel.filter((call) => call.delegationId === silenceId).length,
        1,
      );

      const wallId = 'delegation_wall_timeout';
      await controller.start({ delegationId: wallId });
      await controller.acceptEvent(eventInput(wallId, fixtures.initEvent, {}));
      for (let index = 0; index < 22; index += 1) {
        await clock.tick(119000);
        await controller.acceptEvent(eventInput(wallId, fixtures.stateEvent, {
          state: 'running',
        }));
      }
      await clock.tick(82000);
      assert.deepStrictEqual(controller.getSnapshot(wallId).terminal, {
        code: 'wall_clock_timeout',
        releasedTabCount: 0,
      });
      assert.strictEqual(
        harness.calls.cancel.filter((call) => call.delegationId === wallId).length,
        1,
      );
      for (const id of [finalId, silenceId, wallId]) {
        const envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
        assert.strictEqual(envelope.terminal, true);
        assert.strictEqual(
          harness.calls.cancel.filter((call) => call.delegationId === id).length <= 1,
          true,
        );
      }
      assert.strictEqual(clock.pending(), 0);
    } finally {
      storage.restore();
    }
  });

  await test('simultaneous delegations keep interleaved events timers and Stop isolated', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const clock = createFakeClock();
      const harness = makeDeps(store, { clock });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const firstId = 'delegation_parallel_first';
      const secondId = 'delegation_parallel_second';
      await Promise.all([
        controller.start({ delegationId: firstId }),
        controller.start({ delegationId: secondId }),
      ]);
      await controller.acceptEvent(eventInput(firstId, fixtures.initEvent, {}));
      await controller.acceptEvent(eventInput(secondId, fixtures.initEvent, {}));
      await clock.tick(119000);
      await controller.acceptEvent(eventInput(firstId, fixtures.toolUseEvent, {
        state: 'running',
        toolName: 'mcp__fsb__search_capabilities',
      }));
      await clock.tick(2000);

      const firstBeforeStop = controller.getSnapshot(firstId);
      const secondAfterTimeout = controller.getSnapshot(secondId);
      assert.strictEqual(firstBeforeStop.state, 'running');
      assert.strictEqual(firstBeforeStop.terminal, null);
      assert.deepStrictEqual(firstBeforeStop.entries.map((entry) => entry.sequence), [1, 2]);
      assert.deepStrictEqual(secondAfterTimeout.terminal, {
        code: 'event_silence_timeout',
        releasedTabCount: 0,
      });
      assert.deepStrictEqual(secondAfterTimeout.entries.map((entry) => entry.sequence), [1]);

      const stopped = await controller.stop({ delegationId: firstId });
      assert.strictEqual(stopped.code, 'stopped');
      assert.deepStrictEqual(controller.getSnapshot(firstId).terminal, {
        code: 'stopped',
        releasedTabCount: 0,
      });
      assert.deepStrictEqual(
        harness.calls.cancel.map((call) => call.delegationId).sort(),
        [firstId, secondId].sort(),
      );
      assert.strictEqual(
        storage.data[`${store.STORAGE_KEY_PREFIX}${firstId}`].terminalCode,
        'stopped',
      );
      assert.strictEqual(
        storage.data[`${store.STORAGE_KEY_PREFIX}${secondId}`].terminalCode,
        'event_silence_timeout',
      );
      assert.strictEqual(clock.pending(), 0);
    } finally {
      storage.restore();
    }
  });

  await test('take-control seals every owned tab and resume restores the full lease before daemon resume', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const clock = createFakeClock();
      const order = [];
      const registry = {
        async bindDelegation(input) {
          order.push(`bind:${input.agentId}`);
          return { ok: true };
        },
        async getDelegationOwnedTabs() {
          order.push('owned-tabs');
          return [
            { tabId: 17, token: 'sealed-token-17' },
            { tabId: 11, token: 'sealed-token-11' },
          ];
        },
        async sealHoldLease(input) {
          order.push('seal-all-tabs');
          exactKeys(input, ['activeTabId', 'agentId', 'delegationId', 'expiresAt', 'ownedTabs']);
          assert.deepStrictEqual(input.ownedTabs.map((tab) => tab.tabId).sort(), [11, 17]);
          return { ok: true, expiresAt: clock.now() + 300000 };
        },
        async restoreHoldLease(input) {
          order.push('restore-all-tabs');
          exactKeys(input, ['agentId', 'delegationId', 'liveTabIds']);
          assert.deepStrictEqual(input.liveTabIds, [11, 17]);
          return { ok: true };
        },
        async releaseDelegation() {
          order.push('release-all-tabs');
          return { ok: true, releasedTabCount: 2 };
        },
      };
      const harness = makeDeps(store, {
        clock,
        registry,
        hold: async () => {
          order.push('daemon-hold');
          return { ok: true, status: 'held' };
        },
        resume: async () => {
          order.push('daemon-resume');
          return { ok: true, status: 'resumed' };
        },
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_hold_resume_success';
      await controller.start({ delegationId: id });
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
      const bound = await controller.bindRegisteredAgent({ delegationId: id, agentId: 'agent-61-02' });
      assert.strictEqual(bound.ok, true);
      await controller.reconcile({
        delegationId: id,
        connection: 'connected',
        activeTab: { tabId: 11, owned: true, canTakeControl: true },
      });

      const held = await controller.takeControl({ delegationId: id, activeTabId: 11 });
      assert.strictEqual(held.code, 'held');
      exactKeys(held.runtimeEvent, ['announceSequence', 'snapshot', 'type']);
      exactKeys(held.snapshot.activeTab, ['canTakeControl', 'owned', 'tabId']);
      exactKeys(held.snapshot.hold, ['expiresAt', 'tabIds']);
      assert.deepStrictEqual(held.snapshot.hold.tabIds, [11, 17]);
      assert.deepStrictEqual(
        order.slice(0, 4),
        ['bind:agent-61-02', 'owned-tabs', 'daemon-hold', 'seal-all-tabs'],
      );

      const resumed = await controller.resume({ delegationId: id, liveTabIds: [11, 17] });
      assert.strictEqual(resumed.code, 'resumed');
      assert.strictEqual(resumed.snapshot.state, 'running');
      assert.strictEqual(resumed.snapshot.hold, null);
      assert.deepStrictEqual(resumed.snapshot.activeTab, {
        tabId: 11,
        owned: true,
        canTakeControl: true,
      });
      assert(order.indexOf('restore-all-tabs') < order.indexOf('daemon-resume'));

      const stopped = await controller.stop({ delegationId: id });
      assert.strictEqual(stopped.code, 'stopped');
      assert.deepStrictEqual(stopped.snapshot.terminal, {
        code: 'stopped',
        releasedTabCount: 2,
      });
      assert.strictEqual(order.filter((item) => item === 'release-all-tabs').length, 1);
      assert.strictEqual(harness.calls.cancel.length, 1);
      assert.strictEqual(clock.pending(), 0);
    } finally {
      storage.restore();
    }
  });

  await test('hold-stop overlap, hold expiry, and lost resume ownership each settle once', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const clock = createFakeClock();
      const holdGate = deferred();
      const holdStarted = deferred();
      let holdCalls = 0;
      const releases = [];
      const registry = {
        async bindDelegation() { return { ok: true }; },
        async getDelegationOwnedTabs() { return [{ tabId: 31, token: 'sealed-token-31' }]; },
        async sealHoldLease() { return { ok: true, expiresAt: clock.now() + 300000 }; },
        async restoreHoldLease(input) {
          if (input.delegationId === 'delegation_resume_lost') {
            return { ok: false, code: 'resume_ownership_lost' };
          }
          return { ok: true };
        },
        async releaseDelegation(input) {
          releases.push(input.delegationId);
          return { ok: true, releasedTabCount: 1 };
        },
      };
      const harness = makeDeps(store, {
        clock,
        registry,
        hold: async () => {
          holdCalls += 1;
          if (holdCalls === 1) {
            holdStarted.resolve();
            await holdGate.promise;
          }
          return { ok: true, status: 'held' };
        },
        resume: async () => ({ ok: true, status: 'resumed' }),
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      async function ready(id) {
        await controller.start({ delegationId: id });
        await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
        await controller.bindRegisteredAgent({ delegationId: id, agentId: `agent-${id}` });
        await controller.reconcile({
          delegationId: id,
          connection: 'connected',
          activeTab: { tabId: 31, owned: true, canTakeControl: true },
        });
      }

      const overlapId = 'delegation_hold_stop_overlap';
      await ready(overlapId);
      const holding = controller.takeControl({ delegationId: overlapId, activeTabId: 31 });
      await holdStarted.promise;
      const stopping = controller.stop({ delegationId: overlapId });
      holdGate.resolve();
      const [held, stopped] = await Promise.all([holding, stopping]);
      assert.strictEqual(held.code, 'held');
      assert.strictEqual(stopped.code, 'stopped');
      assert.deepStrictEqual(controller.getSnapshot(overlapId).terminal, {
        code: 'stopped',
        releasedTabCount: 1,
      });

      const expiryId = 'delegation_hold_expiry';
      await ready(expiryId);
      assert.strictEqual(
        (await controller.takeControl({ delegationId: expiryId, activeTabId: 31 })).code,
        'held',
      );
      await clock.tick(300000);
      assert.deepStrictEqual(controller.getSnapshot(expiryId).terminal, {
        code: 'hold_expired',
        releasedTabCount: 1,
      });

      const lostId = 'delegation_resume_lost';
      await ready(lostId);
      await controller.takeControl({ delegationId: lostId, activeTabId: 31 });
      const lost = await controller.resume({ delegationId: lostId, liveTabIds: [31] });
      assert.strictEqual(lost.code, 'resume_ownership_lost');
      assert.deepStrictEqual(controller.getSnapshot(lostId).terminal, {
        code: 'resume_ownership_lost',
        releasedTabCount: 1,
      });

      for (const id of [overlapId, expiryId, lostId]) {
        assert.strictEqual(
          harness.calls.cancel.filter((call) => call.delegationId === id).length,
          1,
        );
        assert.strictEqual(releases.filter((value) => value === id).length, 1);
        const envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
        assert.strictEqual(envelope.terminal, true);
        assert.strictEqual(envelope.entries.filter((entry) => entry.state === 'stopped'
          || entry.state === 'failed').length <= 1, true);
      }
      assert.strictEqual(clock.pending(), 0);
    } finally {
      storage.restore();
    }
  });

  await test('reconcile keeps disconnect distinct from restart loss and emits only closed shapes', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const harness = makeDeps(store, {
        status: async (input) => {
          harness.calls.status.push(clone(input));
          return { connection: 'disconnected' };
        },
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_reconcile_restart_boundary';
      await controller.start({ delegationId: id });
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));

      const disconnectedEvent = await controller.reconcile({ delegationId: id });
      exactKeys(disconnectedEvent, ['announceSequence', 'snapshot', 'type']);
      assert.strictEqual(disconnectedEvent.announceSequence, null);
      assert.strictEqual(disconnectedEvent.snapshot.connection, 'disconnected');
      assert.strictEqual(disconnectedEvent.snapshot.state, 'running');
      assert.strictEqual(disconnectedEvent.snapshot.terminal, null);
      exactKeys(disconnectedEvent.snapshot.provider, ['id', 'label']);
      assert.strictEqual(harness.calls.status.length, 1);
      assert.strictEqual(harness.calls.cancel.length, 0);

      const restart = await controller.reconcile({
        delegationId: id,
        recoveryDisposition: 'daemon_restart_lost_run',
      });
      assert.strictEqual(restart.code, 'daemon_restart_lost_run');
      exactKeys(restart.snapshot, [
        'v', 'delegationId', 'provider', 'state', 'connection', 'entries',
        'summary', 'activeTab', 'hold', 'terminal', 'hydrated',
      ]);
      assert.strictEqual(restart.snapshot.state, 'restart_lost');
      assert.deepStrictEqual(restart.snapshot.terminal, {
        code: 'daemon_restart_lost_run',
        releasedTabCount: 0,
      });
      assert.deepStrictEqual(harness.calls.cancel, [{
        delegationId: id,
        code: 'daemon_restart_lost_run',
      }]);
    } finally {
      storage.restore();
    }
  });

  console.log('\n--- delegation controller summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exitCode = failed > 0 ? 1 : 0;
})().catch((error) => {
  console.error('delegation-controller.test.js: FATAL');
  console.error(error);
  process.exitCode = 2;
});
