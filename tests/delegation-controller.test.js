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

  console.log('\n--- delegation controller summary ---');
  console.log('  passed:', passed);
  console.log('  failed:', failed);
  process.exitCode = failed > 0 ? 1 : 0;
})().catch((error) => {
  console.error('delegation-controller.test.js: FATAL');
  console.error(error);
  process.exitCode = 2;
});
