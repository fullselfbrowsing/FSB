'use strict';

const assert = require('assert');
const path = require('path');
const fixtures = require('./fixtures/delegation-events');

const STORE_PATH = path.join(__dirname, '..', 'extension', 'utils', 'delegation-event-store.js');
const CONTROLLER_PATH = path.join(__dirname, '..', 'extension', 'utils', 'delegation-controller.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'extension', 'utils', 'agent-registry.js');

const CLAUDE_PROVIDER = Object.freeze({ id: 'claude-code', label: 'Claude Code' });
const OPENCODE_PROVIDER = Object.freeze({ id: 'opencode', label: 'OpenCode' });
const CLAUDE_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'claude-code',
  label: 'Claude Code',
  profileVersion: '2.1.177',
  authState: 'unknown',
  billingKind: 'subscription',
});
const OPENCODE_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'opencode',
  label: 'OpenCode',
  profileVersion: '1.14.25',
  authState: 'unknown',
  billingKind: 'unknown',
});
const CODEX_CHATGPT_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'codex',
  label: 'Codex',
  profileVersion: '0.142.5',
  authState: 'chatgpt',
  billingKind: 'subscription',
});
const CODEX_API_ACCEPTED_IDENTITY = Object.freeze({
  providerId: 'codex',
  label: 'Codex',
  profileVersion: '0.142.5',
  authState: 'api_key',
  billingKind: 'api',
});
const SECTION_ARGUMENT_INDEX = process.argv.indexOf('--section');
const SELECTED_SECTION = SECTION_ARGUMENT_INDEX === -1
  ? null
  : process.argv[SECTION_ARGUMENT_INDEX + 1];

if (SECTION_ARGUMENT_INDEX !== -1 && !SELECTED_SECTION) {
  throw new Error('--section requires a value');
}

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

function freshRegistryModule() {
  delete require.cache[require.resolve(REGISTRY_PATH)];
  return require(REGISTRY_PATH);
}

function installSessionStorage(initial = {}) {
  const previous = globalThis.chrome;
  const data = clone(initial);
  let writeError = null;
  let rejectedWritesRemaining = 0;
  const rejectedWriteCalls = new Set();
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
          if (rejectedWriteCalls.delete(setCalls)) {
            throw new Error(`write ${setCalls} rejected`);
          }
          if (rejectedWritesRemaining > 0) {
            rejectedWritesRemaining -= 1;
            throw new Error('one-shot write rejected');
          }
          if (writeError) throw writeError;
          Object.assign(data, clone(update));
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
        },
      },
      local: {
        async get() { return {}; },
        async set() {},
        async remove() {},
      },
    },
    tabs: {
      async query() { return [{ id: 71, incognito: false, windowId: 7 }]; },
      async get(tabId) {
        if (tabId !== 71) throw new Error(`No tab with id: ${tabId}`);
        return { id: 71, incognito: false, windowId: 7 };
      },
    },
  };

  return {
    data,
    get setCalls() { return setCalls; },
    rejectWrites(error = new Error('write rejected')) { writeError = error; },
    rejectNextWrites(count = 1) { rejectedWritesRemaining = count; },
    rejectWriteAt(callNumber) { rejectedWriteCalls.add(callNumber); },
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
    activeTabs: [],
    liveTabs: [],
    registry: [],
  };
  const deps = {
    eventStore: store,
    clock: { now: () => 1720000000000 },
    cancel: async (input) => {
      calls.cancel.push(clone(input));
      return { delegationId: input.delegationId, status: 'cancelled' };
    },
    status: async (input) => { calls.status.push(clone(input)); },
    hold: async (input) => { calls.hold.push(clone(input)); },
    resume: async (input) => { calls.resume.push(clone(input)); },
    getActiveTab: async (input) => { calls.activeTabs.push(clone(input)); return null; },
    getLiveTabIds: async (input) => { calls.liveTabs.push(clone(input)); return []; },
    registry: {
      bindDelegation() { calls.registry.push('bind'); },
      hydrate() { calls.registry.push('hydrate'); },
      getAgentForDelegation() { return null; },
      listDelegationMappings() { return []; },
      getDelegationReleaseReceipt() { return null; },
    },
    ...overrides,
  };
  if (deps.registry && typeof deps.registry.listDelegationMappings !== 'function') {
    deps.registry.listDelegationMappings = () => [];
  }
  return { deps, calls };
}

function makeRecoveryDeps(store, options = {}) {
  const generations = options.generations || new Map();
  const heartbeatOwners = options.heartbeatOwners || new Set();
  const recoveryCalls = {
    loadGeneration: [],
    saveGeneration: [],
    clearGeneration: [],
    retainHeartbeat: [],
    releaseHeartbeat: [],
  };
  const overrides = { ...(options.overrides || {}) };
  const harness = makeDeps(store, {
    loadGeneration: async ({ delegationId }) => {
      recoveryCalls.loadGeneration.push(delegationId);
      return generations.get(delegationId) || null;
    },
    saveGeneration: async ({ delegationId, generation }) => {
      recoveryCalls.saveGeneration.push({ delegationId, generation });
      generations.set(delegationId, generation);
    },
    clearGeneration: async ({ delegationId }) => {
      recoveryCalls.clearGeneration.push(delegationId);
      generations.delete(delegationId);
    },
    retainHeartbeat: (delegationId) => {
      recoveryCalls.retainHeartbeat.push(delegationId);
      if (heartbeatOwners.has(delegationId)) return false;
      heartbeatOwners.add(delegationId);
      return true;
    },
    releaseHeartbeat: (delegationId) => {
      recoveryCalls.releaseHeartbeat.push(delegationId);
      return heartbeatOwners.delete(delegationId);
    },
    getConnectionSnapshot: () => ({
      state: 'connected',
      consecutiveMisses: 0,
      lastAckAt: null,
    }),
    ...overrides,
  });
  return {
    ...harness,
    generations,
    heartbeatOwners,
    recoveryCalls,
  };
}

function supervisorStatus(generation, active = [], restartLosses = [], routeLosses = []) {
  return { generation, active, restartLosses, routeLosses };
}

async function seedRunningLedger(store, controllerModule, delegationId) {
  const controller = controllerModule.create(makeDeps(store).deps);
  await controller.hydrate();
  await controller.start(startInput(delegationId));
  await controller.acceptEvent(eventInput(delegationId, fixtures.initEvent, {
    timestamp: 1720000000000,
    state: 'running',
    client: { id: 'claude-code', label: 'Claude Code' },
  }));
  return controller;
}

function eventInput(delegationId, event, context = {}) {
  let canonicalContext = context;
  if (context && Object.getPrototypeOf(context) === Object.prototype) {
    const keys = Reflect.ownKeys(context);
    const hasOnlyDataKeys = keys.every((key) => {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(context, key);
      return descriptor && Object.hasOwn(descriptor, 'value');
    });
    if (hasOnlyDataKeys) {
      canonicalContext = { ...context };
      for (const legacyField of ['authState', 'billingKind', 'client', 'label',
        'profileVersion', 'providerId', 'usd']) {
        delete canonicalContext[legacyField];
      }
    }
  }
  return { delegationId, event, context: canonicalContext };
}

function startInput(delegationId, extra = {}) {
  const input = { ...extra };
  const provider = input.provider || CLAUDE_PROVIDER;
  const profileVersion = input.profileVersion || '2.1.177';
  delete input.provider;
  delete input.profileVersion;
  return {
    delegationId,
    acceptedIdentity: {
      providerId: provider.id,
      label: provider.label,
      profileVersion,
      authState: 'unknown',
      billingKind: provider.id === 'claude-code' ? 'subscription' : 'unknown',
    },
    ...input,
  };
}

function acceptedStartInput(delegationId, acceptedIdentity = CLAUDE_ACCEPTED_IDENTITY, extra = {}) {
  return { delegationId, acceptedIdentity, ...extra };
}

function acceptedStoreContext(value = {}, acceptedIdentity = CLAUDE_ACCEPTED_IDENTITY) {
  const out = { ...value, acceptedIdentity };
  for (const legacyField of ['authState', 'billingKind', 'client', 'label',
    'profileVersion', 'providerId', 'usd']) {
    delete out[legacyField];
  }
  return out;
}

async function acceptSuccessfulFinal(controller, delegationId, timestamp) {
  await controller.acceptEvent(eventInput(delegationId, fixtures.resultEvent, {
    timestamp,
    state: 'completed',
    billingKind: 'subscription',
  }));
  return controller.acceptEvent(eventInput(delegationId, fixtures.terminalEvent, {
    timestamp: timestamp + 1,
    terminalCode: 'completed',
    treeSettled: true,
  }));
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

async function runAcceptedIdentityFoundation() {
  await test('accepts, snapshots, settles, and hydrates one immutable exact identity', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      await controller.hydrate();
      const claudeId = 'delegation_identity_claude_6501';
      const openCodeId = 'delegation_identity_opencode_6501';
      const mutableOpenCodeIdentity = clone(OPENCODE_ACCEPTED_IDENTITY);
      const write = storage.deferWrites();
      const openCodeStarting = controller.start(acceptedStartInput(
        openCodeId,
        mutableOpenCodeIdentity,
      ));
      mutableOpenCodeIdentity.providerId = 'claude-code';
      mutableOpenCodeIdentity.label = 'Claude Code';
      mutableOpenCodeIdentity.profileVersion = 'mutated-after-acceptance';
      await write.started;
      write.resolve();
      const openCodeStarted = await openCodeStarting;
      await controller.start(acceptedStartInput(claudeId));

      exactKeys(openCodeStarted.snapshot, [
        'v', 'delegationId', 'acceptedIdentity', 'provider', 'state', 'connection',
        'entries', 'summary', 'activeTab', 'hold', 'terminal', 'hydrated',
      ]);
      assert.deepStrictEqual(openCodeStarted.snapshot.acceptedIdentity, OPENCODE_ACCEPTED_IDENTITY);
      assert.deepStrictEqual(openCodeStarted.snapshot.provider, OPENCODE_PROVIDER);
      assert.strictEqual(openCodeStarted.snapshot.entries[0].init.profileVersion, '1.14.25');
      assert(Object.isFrozen(openCodeStarted.snapshot.acceptedIdentity));

      const result = await controller.acceptEvent(eventInput(
        openCodeId,
        fixtures.hostileOpenCodeResultEvent,
        { timestamp: 1720000000001, state: 'completed' },
      ));
      assert.strictEqual(result.sequence, 2);
      assert.strictEqual(result.metrics.billingKind, 'unknown');
      assert.strictEqual(result.metrics.usd, null);
      const terminal = await controller.acceptEvent(eventInput(
        openCodeId,
        fixtures.terminalEvent,
        { timestamp: 1720000000002, terminalCode: 'completed', treeSettled: true },
      ));
      assert.strictEqual(terminal.sequence, 3);
      assert.deepStrictEqual(controller.getSnapshot(openCodeId).acceptedIdentity,
        OPENCODE_ACCEPTED_IDENTITY);

      modules = freshModules();
      controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1, 'terminal OpenCode run is not resurrected');
      assert.strictEqual(restored[0].delegationId, claudeId);
      assert.deepStrictEqual(restored[0].acceptedIdentity, CLAUDE_ACCEPTED_IDENTITY);
      assert.deepStrictEqual(restored[0].provider, CLAUDE_PROVIDER);
      assert.strictEqual(restored[0].entries[0].init.profileVersion, '2.1.177');
      assert(Object.isFrozen(restored[0].acceptedIdentity));
    } finally {
      storage.restore();
    }
  });

  await test('rejects invalid starts, identity drift, legacy identity fields, and USD attempts', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const controller = controllerModule.create(makeDeps(store).deps);
      await controller.hydrate();

      for (const [index, acceptedIdentity] of [
        null,
        { ...CLAUDE_ACCEPTED_IDENTITY, profileVersion: null },
        { ...CLAUDE_ACCEPTED_IDENTITY, billingKind: 'api' },
        { ...CLAUDE_ACCEPTED_IDENTITY, extra: true },
        Object.assign(Object.create({ polluted: true }), CLAUDE_ACCEPTED_IDENTITY),
        Object.assign({ ...CLAUDE_ACCEPTED_IDENTITY }, { [Symbol('identity')]: true }),
      ].entries()) {
        await expectCode(
          () => controller.start(acceptedStartInput(
            `delegation_invalid_identity_${index}_6501`,
            acceptedIdentity,
          )),
          'unsupported_provider',
        );
      }

      let accessorReads = 0;
      const accessorIdentity = { ...CLAUDE_ACCEPTED_IDENTITY };
      Object.defineProperty(accessorIdentity, 'billingKind', {
        enumerable: true,
        get() { accessorReads += 1; return 'subscription'; },
      });
      await expectCode(
        () => controller.start(acceptedStartInput(
          'delegation_accessor_identity_6501',
          accessorIdentity,
        )),
        'unsupported_provider',
      );
      assert.strictEqual(accessorReads, 0);

      const id = 'delegation_identity_drift_6501';
      await controller.start(acceptedStartInput(id));
      for (const [index, acceptedIdentity] of [
        OPENCODE_ACCEPTED_IDENTITY,
        { ...CLAUDE_ACCEPTED_IDENTITY, profileVersion: 'different-real-profile' },
      ].entries()) {
        await expectCode(
          controller.acceptEvent(eventInput(id, fixtures.stateEvent, {
            timestamp: 1720000000010 + index,
            acceptedIdentity,
          })),
          'unsupported_provider',
        );
      }
      for (const context of [
        { client: CLAUDE_PROVIDER },
        { profileVersion: '2.1.177' },
        { billingKind: 'subscription' },
        { authState: 'unknown' },
        { usd: 0 },
      ]) {
        await expectCode(
          controller.acceptEvent({ delegationId: id, event: fixtures.stateEvent, context }),
          'invalid_delegation_event',
        );
      }
      assert.strictEqual(controller.getSnapshot(id).entries.length, 1,
        'rejected drift cannot consume a sequence or mutate the run');
      assert.deepStrictEqual(controller.getSnapshot(id).acceptedIdentity,
        CLAUDE_ACCEPTED_IDENTITY);
    } finally {
      storage.restore();
    }
  });
}

async function runCodexAcceptedIdentity() {
  await test('round-trips both accepted Codex billing modes through result, terminal, and hydration', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      await controller.hydrate();
      const chatgptId = 'delegation_codex_chatgpt_6507';
      const apiId = 'delegation_codex_api_key_6507';

      const chatgptStarted = await controller.start(acceptedStartInput(
        chatgptId,
        CODEX_CHATGPT_ACCEPTED_IDENTITY,
      ));
      const apiStarted = await controller.start(acceptedStartInput(
        apiId,
        CODEX_API_ACCEPTED_IDENTITY,
      ));
      for (const [started, identity] of [
        [chatgptStarted, CODEX_CHATGPT_ACCEPTED_IDENTITY],
        [apiStarted, CODEX_API_ACCEPTED_IDENTITY],
      ]) {
        assert.deepStrictEqual(started.snapshot.acceptedIdentity, identity);
        assert.deepStrictEqual(started.snapshot.provider, { id: 'codex', label: 'Codex' });
        assert.strictEqual(started.snapshot.entries[0].init.profileVersion, '0.142.5');
        assert(Object.isFrozen(started.snapshot.acceptedIdentity));
      }

      await controller.acceptEvent(eventInput(chatgptId, fixtures.resultEvent, {
        timestamp: 1720000000001,
        state: 'completed',
      }));
      await controller.acceptEvent(eventInput(apiId, fixtures.resultEvent, {
        timestamp: 1720000000002,
        state: 'completed',
      }));
      assert.deepStrictEqual(
        {
          billingKind: controller.getSnapshot(chatgptId).summary.billingKind,
          usd: controller.getSnapshot(chatgptId).summary.usd,
        },
        { billingKind: 'subscription', usd: null },
      );
      assert.deepStrictEqual(
        {
          billingKind: controller.getSnapshot(apiId).summary.billingKind,
          usd: controller.getSnapshot(apiId).summary.usd,
        },
        { billingKind: 'api', usd: null },
      );

      await controller.acceptEvent(eventInput(chatgptId, fixtures.terminalEvent, {
        timestamp: 1720000000003,
        terminalCode: 'completed',
        treeSettled: true,
      }));
      const settled = controller.getSnapshot(chatgptId);
      assert.strictEqual(settled.state, 'completed');
      assert.strictEqual(settled.summary.state, 'completed');
      assert.deepStrictEqual(settled.acceptedIdentity, CODEX_CHATGPT_ACCEPTED_IDENTITY);

      modules = freshModules();
      controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      const hydrated = await controller.hydrate();
      assert.strictEqual(hydrated.length, 1, 'settled ChatGPT run is not resurrected');
      assert.strictEqual(hydrated[0].delegationId, apiId);
      assert.deepStrictEqual(hydrated[0].acceptedIdentity, CODEX_API_ACCEPTED_IDENTITY);
      assert.strictEqual(hydrated[0].entries[0].init.profileVersion, '0.142.5');
      assert.strictEqual(hydrated[0].summary.billingKind, 'api');
      assert.strictEqual(hydrated[0].summary.usd, null);
      assert.strictEqual(hydrated[0].hydrated, true);
    } finally {
      storage.restore();
    }
  });

  await test('rejects Codex auth, billing, profile, shape, and USD drift before sequence mutation', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const controller = controllerModule.create(makeDeps(store).deps);
      await controller.hydrate();
      const id = 'delegation_codex_drift_6507';
      await controller.start(acceptedStartInput(id, CODEX_API_ACCEPTED_IDENTITY));

      for (const acceptedIdentity of [
        CODEX_CHATGPT_ACCEPTED_IDENTITY,
        { ...CODEX_API_ACCEPTED_IDENTITY, profileVersion: '0.144.6' },
        { ...CODEX_API_ACCEPTED_IDENTITY, extra: true },
      ]) {
        await expectCode(
          controller.acceptEvent(eventInput(id, fixtures.stateEvent, {
            timestamp: 1720000000010,
            acceptedIdentity,
          })),
          'unsupported_provider',
        );
      }
      await expectCode(
        controller.acceptEvent({
          delegationId: id,
          event: fixtures.resultEvent,
          context: { timestamp: 1720000000020, usd: 0.01 },
        }),
        'invalid_delegation_event',
      );
      assert.strictEqual(controller.getSnapshot(id).entries.length, 1);
      assert.deepStrictEqual(controller.getSnapshot(id).acceptedIdentity,
        CODEX_API_ACCEPTED_IDENTITY);
    } finally {
      storage.restore();
    }
  });
}

(async () => {
  console.log('--- Phase 61 Plan 02: delegation controller ---');

  if (SELECTED_SECTION === 'accepted-identity-foundation') {
    await runAcceptedIdentityFoundation();
    console.log('\n--- delegation controller summary ---');
    console.log('  passed:', passed);
    console.log('  failed:', failed);
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }
  if (SELECTED_SECTION === 'codex-accepted-identity') {
    await runCodexAcceptedIdentity();
    console.log('\n--- delegation controller summary ---');
    console.log('  passed:', passed);
    console.log('  failed:', failed);
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }
  if (SELECTED_SECTION !== null) throw new Error(`unknown section: ${SELECTED_SECTION}`);

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
        'refreshActiveTab', 'getSnapshot', 'subscribe',
      ]);
      await expectCode(() => controller.subscribe(() => {}), 'delegation_not_hydrated');
      await controller.hydrate();
      await expectCode(() => controller.start(startInput('short')), 'invalid_delegation_id');
    } finally {
      storage.restore();
    }
  });

  await test('start accepts only exact canonical identities and captures an immutable copy', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const controller = controllerModule.create(makeDeps(store).deps);
      await controller.hydrate();

      await expectCode(
        () => controller.start({ delegationId: 'delegation_missing_provider_6410' }),
        'unsupported_provider',
      );
      for (const [index, acceptedIdentity] of [
        null,
        { ...OPENCODE_ACCEPTED_IDENTITY, label: 'Open Code' },
        { ...OPENCODE_ACCEPTED_IDENTITY, providerId: 'OpenCode' },
        { ...OPENCODE_ACCEPTED_IDENTITY, providerId: 'codex', label: 'Codex' },
        { ...OPENCODE_ACCEPTED_IDENTITY, extra: true },
        Object.assign(Object.create({ polluted: true }), OPENCODE_ACCEPTED_IDENTITY),
      ].entries()) {
        await expectCode(
          () => controller.start({
            delegationId: `delegation_invalid_provider_${index}_6410`,
            acceptedIdentity,
          }),
          'unsupported_provider',
        );
      }

      let getterCalls = 0;
      const accessorIdentity = { ...OPENCODE_ACCEPTED_IDENTITY };
      Object.defineProperties(accessorIdentity, {
        providerId: { enumerable: true, get() { getterCalls += 1; return 'opencode'; } },
      });
      await expectCode(
        () => controller.start({
          delegationId: 'delegation_accessor_provider_6410',
          acceptedIdentity: accessorIdentity,
        }),
        'unsupported_provider',
      );
      assert.strictEqual(getterCalls, 0, 'provider validation never invokes caller accessors');

      const mutableIdentity = { ...OPENCODE_ACCEPTED_IDENTITY };
      const starting = controller.start({
        delegationId: 'delegation_mutable_provider_6410',
        acceptedIdentity: mutableIdentity,
      });
      mutableIdentity.providerId = 'claude-code';
      mutableIdentity.label = 'Claude Code';
      const started = await starting;
      assert.deepStrictEqual(started.snapshot.provider, OPENCODE_PROVIDER);
      assert(Object.isFrozen(started.snapshot.provider));
      assert.deepStrictEqual(started.snapshot.entries[0].init.client, OPENCODE_PROVIDER);
      assert.strictEqual(started.snapshot.entries[0].init.profileVersion, '1.14.25');
    } finally {
      storage.restore();
    }
  });

  await test('concurrent Claude and OpenCode runs append durably and hydrate silently without relabeling', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      await controller.hydrate();
      const claudeId = 'delegation_concurrent_claude_6410';
      const openCodeId = 'delegation_concurrent_opencode_6410';
      await Promise.all([
        controller.start(startInput(claudeId, { profileVersion: 'claude-profile-6410' })),
        controller.start({
          delegationId: openCodeId,
          acceptedIdentity: {
            ...OPENCODE_ACCEPTED_IDENTITY,
            profileVersion: 'opencode-profile-6410',
          },
        }),
      ]);

      const delivered = [];
      controller.subscribe((event) => delivered.push(event));
      const write = storage.deferWrites();
      let appendSettled = false;
      const appending = controller.acceptEvent(eventInput(openCodeId, fixtures.initEvent, {
        timestamp: 1720000000001,
        state: 'running',
        profileVersion: 'opencode-profile-6410',
      })).then((entry) => {
        appendSettled = true;
        return entry;
      });
      await write.started;
      await Promise.resolve();
      assert.strictEqual(appendSettled, false);
      assert.strictEqual(controller.getSnapshot(openCodeId).entries.length, 1);
      assert.strictEqual(delivered.length, 0, 'OpenCode fanout waits for the durable append');
      write.resolve();
      assert.strictEqual((await appending).sequence, 2);
      assert.strictEqual(delivered.length, 1);

      await controller.acceptEvent(eventInput(claudeId, fixtures.initEvent, {
        timestamp: 1720000000001,
        state: 'running',
        profileVersion: 'claude-profile-6410',
      }));
      assert.deepStrictEqual(controller.getSnapshot(claudeId).provider, CLAUDE_PROVIDER);
      assert.deepStrictEqual(controller.getSnapshot(openCodeId).provider, OPENCODE_PROVIDER);
      assert.deepStrictEqual(controller.getSnapshot(claudeId).entries.map((entry) => entry.sequence), [1, 2]);
      assert.deepStrictEqual(controller.getSnapshot(openCodeId).entries.map((entry) => entry.sequence), [1, 2]);

      modules = freshModules();
      controller = modules.controllerModule.create(makeDeps(modules.store).deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 2);
      const restoredById = new Map(restored.map((snapshot) => [snapshot.delegationId, snapshot]));
      assert.deepStrictEqual(restoredById.get(claudeId).provider, CLAUDE_PROVIDER);
      assert.deepStrictEqual(restoredById.get(openCodeId).provider, OPENCODE_PROVIDER);
      assert.strictEqual(restoredById.get(claudeId).entries[0].init.profileVersion, 'claude-profile-6410');
      assert.strictEqual(restoredById.get(openCodeId).entries[0].init.profileVersion, 'opencode-profile-6410');
      let replayed = 0;
      controller.subscribe(() => { replayed += 1; });
      assert.strictEqual(replayed, 0, 'hydration never replays persisted announcements');

      const openCodeResult = await controller.acceptEvent(eventInput(
        openCodeId,
        fixtures.hostileOpenCodeResultEvent,
        { timestamp: 1720000000002, state: 'completed' },
      ));
      assert.strictEqual(openCodeResult.state, 'running');
      assert.strictEqual(openCodeResult.metrics.inputTokens, 30);
      assert.strictEqual(openCodeResult.metrics.outputTokens, 40);
      assert.strictEqual(openCodeResult.metrics.totalTokens, 70);
      assert.strictEqual(openCodeResult.metrics.billingKind, 'unknown');
      assert.strictEqual(openCodeResult.metrics.usd, null);
      assert.strictEqual(controller.getSnapshot(openCodeId).terminal, null);
      assert.strictEqual(controller.getSnapshot(claudeId).entries.length, 2);

      await controller.acceptEvent(eventInput(openCodeId, fixtures.terminalEvent, {
        timestamp: 1720000000003,
        terminalCode: 'agent_failed',
        treeSettled: true,
      }));
      await acceptSuccessfulFinal(controller, claudeId, 1720000000004);
      assert.deepStrictEqual(controller.getSnapshot(openCodeId).terminal, {
        code: 'agent_failed',
        releasedTabCount: 0,
      });
      assert.deepStrictEqual(controller.getSnapshot(claudeId).terminal, {
        code: 'completed',
        releasedTabCount: 0,
      });
      assert.strictEqual(
        JSON.stringify(storage.data).includes(fixtures.rawNativeCanary),
        false,
      );
    } finally {
      storage.restore();
    }
  });

  await test('durable start commit gates subscriber fanout and start acceptance', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const { deps } = makeDeps(store);
      const controller = controllerModule.create(deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      const delivered = [];
      controller.subscribe((event) => delivered.push(event));
      const deferred = storage.deferWrites();
      let settled = false;
      const accepting = controller.start(startInput(id, {
        profileVersion: 'profile-v61-start',
      })).then((result) => {
        settled = true;
        return result;
      });
      await deferred.started;
      await Promise.resolve();
      assert.strictEqual(settled, false);
      assert.strictEqual(delivered.length, 0);
      const before = controller.getSnapshot(id);
      assert.strictEqual(before.state, 'starting');
      assert.strictEqual(before.entries.length, 0);
      deferred.resolve();
      const started = await accepting;
      const entry = started.snapshot.entries[0];
      assert.strictEqual(started.code, 'started');
      assert.strictEqual(entry.sequence, 1);
      assert.strictEqual(entry.kind, 'init');
      assert.strictEqual(entry.state, 'starting');
      assert.strictEqual(entry.init.profileVersion, 'profile-v61-start');
      assert.strictEqual(delivered.length, 1);
      const runtimeEvent = delivered[0];
      exactKeys(runtimeEvent, ['announceSequence', 'snapshot', 'type']);
      assert.strictEqual(runtimeEvent.type, 'FSB_DELEGATION_UPDATED');
      assert.strictEqual(runtimeEvent.announceSequence, 1);
      exactKeys(runtimeEvent.snapshot, [
        'v', 'delegationId', 'acceptedIdentity', 'provider', 'state',
        'connection', 'entries', 'summary', 'activeTab', 'hold', 'terminal',
        'hydrated',
      ]);
      assert.strictEqual(runtimeEvent.snapshot.entries.length, 1);
      assert.deepStrictEqual(runtimeEvent.snapshot.entries[0], entry);
      assert.strictEqual(runtimeEvent.snapshot.state, 'starting');
      assert.strictEqual(storage.setCalls, 1);
      assert(Object.isFrozen(runtimeEvent));
      assert(Object.isFrozen(runtimeEvent.snapshot.entries));
    } finally {
      storage.restore();
    }
  });

  await test('prototype-named connection inputs remain outside the closed state machine', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const controller = controllerModule.create(makeDeps(store).deps);
      await controller.hydrate();
      const id = 'delegation_prototype_connection_6104';
      const started = await controller.start(startInput(id, {
        connection: 'constructor',
      }));
      assert.strictEqual(started.snapshot.connection, 'connected',
        'prototype property names cannot enter the start connection enum');
      const reconciled = await controller.reconcile({
        delegationId: id,
        connection: '__proto__',
        status: null,
      });
      assert.strictEqual(reconciled.snapshot.connection, 'disconnected',
        'prototype property names cannot bypass disconnected reconciliation');
    } finally {
      storage.restore();
    }
  });

  await test('worker eviction after start commit restores the run before provider activity', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let harness = makeRecoveryDeps(modules.store);
      let controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_start_eviction_gap';
      await controller.start(startInput(id, { profileVersion: 'profile-v61-eviction' }));

      modules = freshModules();
      harness = makeRecoveryDeps(modules.store);
      controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      assert.strictEqual(restored[0].delegationId, id);
      assert.strictEqual(restored[0].state, 'starting');
      assert.strictEqual(restored[0].entries.length, 1);
      assert.strictEqual(restored[0].entries[0].kind, 'init');
      assert.strictEqual(restored[0].entries[0].init.profileVersion, 'profile-v61-eviction');
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, [id]);
    } finally {
      storage.restore();
    }
  });

  await test('unavailable storage cancels first and retains authority without false terminal fanout', async () => {
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
      let listenerCalls = 0;
      controller.subscribe(() => { listenerCalls += 1; order.push('listener'); });
      storage.rejectWrites();
      await expectCode(
        controller.start(startInput(id, { profileVersion: 'profile-v61-unavailable' })),
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
      assert.strictEqual(snapshot.state, 'stopping');
      assert.strictEqual(snapshot.terminal, null,
        'without a durable tombstone the controller cannot claim terminal settlement');
    } finally {
      storage.restore();
    }
  });

  await test('later append failure commits cleanup and terminal atomically without resurrection', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const harness = makeRecoveryDeps(modules.store);
      let controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_late_persistence_failure';
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext));
      const delivered = [];
      controller.subscribe((event) => delivered.push(event));

      storage.rejectNextWrites(1);
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.toolUseEvent, {
          ...fixtures.baseContext,
          timestamp: fixtures.baseContext.timestamp + 1,
        })),
        'delegation_persistence_failed',
      );
      const key = `${modules.store.STORAGE_KEY_PREFIX}${id}`;
      assert.strictEqual(storage.data[key].terminal, true);
      assert.strictEqual(storage.data[key].terminalCode, 'delegation_persistence_failed');
      assert.strictEqual(storage.data[key].entries.length, 3,
        'failed provider event is absent and one canonical terminal row is committed');
      assert.strictEqual(storage.data[key].entries[2].state, 'failed');
      assert.strictEqual(delivered.length, 1,
        'typed failure fans out only after the tombstone write succeeds');
      assert.deepStrictEqual(delivered[0].snapshot.terminal, {
        code: 'delegation_persistence_failed',
        releasedTabCount: 0,
      });

      modules = freshModules();
      const reloaded = makeRecoveryDeps(modules.store);
      controller = modules.controllerModule.create(reloaded.deps);
      assert.deepStrictEqual(await controller.hydrate(), [],
        'terminal tombstone excludes the failed run from wake hydration');
      assert.deepStrictEqual(reloaded.recoveryCalls.retainHeartbeat, []);
    } finally {
      storage.restore();
    }
  });

  await test('persistence quarantine survives release failure and reloads into exact retry', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const id = 'delegation_persistence_release_retry';
      let releaseAttempts = 0;
      let cancelAttempts = 0;
      let registryMapped = false;
      const registry = {
        async bindDelegation() { registryMapped = true; return { ok: true }; },
        getAgentForDelegation(delegationId) {
          return registryMapped && delegationId === id ? 'agent-persistence-retry' : null;
        },
        listDelegationMappings() {
          return registryMapped
            ? [{ delegationId: id, agentId: 'agent-persistence-retry' }]
            : [];
        },
        getDelegationReleaseReceipt() { return null; },
        async releaseDelegation() {
          releaseAttempts += 1;
          if (releaseAttempts === 1) {
            return {
              ok: false,
              code: 'delegation_release_persistence_failed',
              releasedTabCount: 0,
            };
          }
          return { ok: true, code: 'delegation_released', releasedTabCount: 2 };
        },
      };
      const cancel = async (input) => {
        cancelAttempts += 1;
        return { delegationId: input.delegationId, status: 'cancelled' };
      };
      let harness = makeDeps(modules.store, { registry, cancel });
      let controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext));
      await controller.bindRegisteredAgent({ delegationId: id, agentId: 'agent-persistence-retry' });

      storage.rejectNextWrites(1);
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.toolUseEvent, {
          ...fixtures.baseContext,
          timestamp: fixtures.baseContext.timestamp + 1,
        })),
        'delegation_persistence_failed',
      );
      const key = `${modules.store.STORAGE_KEY_PREFIX}${id}`;
      assert.strictEqual(storage.data[key].terminal, false);
      assert.deepStrictEqual(storage.data[key].cleanupPending, {
        code: 'delegation_persistence_failed',
        cancellationConfirmed: true,
        agentId: 'agent-persistence-retry',
      });
      assert.strictEqual(releaseAttempts, 1);
      assert.strictEqual(cancelAttempts, 1);

      modules = freshModules();
      harness = makeDeps(modules.store, { registry, cancel });
      controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      assert.strictEqual(restored[0].state, 'stopping');
      const retried = await controller.stop({ delegationId: id });
      assert.strictEqual(retried.ok, true);
      assert.strictEqual(retried.code, 'delegation_persistence_failed');
      assert.deepStrictEqual(retried.snapshot.terminal, {
        code: 'delegation_persistence_failed',
        releasedTabCount: 2,
      });
      assert.strictEqual(releaseAttempts, 2);
      assert.strictEqual(cancelAttempts, 1);
      assert.strictEqual(storage.data[key].terminal, true);
      assert.strictEqual(storage.data[key].cleanupPending, null);
    } finally {
      storage.restore();
    }
  });

  await test('release receipt survives terminal-write failure and reload with exact count', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let registryModule = freshRegistryModule();
      let registry = new registryModule.AgentRegistry({ now: () => 1720000000000 });
      const registered = await registry.registerAgent();
      const binding = await registry.bindTab(registered.agentId, 71);
      assert(binding && binding.ownershipToken);

      const id = 'delegation_receipt_reload';
      const ackObservations = [];
      let originalAcknowledge = registry.acknowledgeDelegationRelease.bind(registry);
      registry.acknowledgeDelegationRelease = async (input) => {
        ackObservations.push(clone(storage.data[`${modules.store.STORAGE_KEY_PREFIX}${id}`]));
        return originalAcknowledge(input);
      };
      let harness = makeDeps(modules.store, {
        registry,
        cancel: async () => {
          throw new Error('tree is already settled; cancellation must not run');
        },
      });
      let controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      await controller.start(startInput(id));
      await controller.bindRegisteredAgent({ delegationId: id, agentId: registered.agentId });
      await controller.acceptEvent(eventInput(id, fixtures.resultEvent, {
        timestamp: 1720000000100,
        billingKind: 'subscription',
      }));

      const terminalWriteCall = storage.setCalls + 3;
      storage.rejectWriteAt(terminalWriteCall);
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.terminalEvent, {
          timestamp: 1720000000101,
          terminalCode: 'completed',
          treeSettled: true,
        })),
        'delegation_persistence_failed',
      );
      assert.strictEqual(storage.setCalls, terminalWriteCall);
      assert.deepStrictEqual(ackObservations, [],
        'receipt acknowledgement never precedes durable terminal evidence');

      const ledgerKey = `${modules.store.STORAGE_KEY_PREFIX}${id}`;
      const registryKey = registryModule.FSB_AGENT_REGISTRY_STORAGE_KEY;
      assert.strictEqual(storage.data[ledgerKey].terminal, false);
      assert.deepStrictEqual(storage.data[ledgerKey].cleanupPending, {
        code: 'completed',
        cancellationConfirmed: true,
        agentId: registered.agentId,
      });
      const firstReceipt = storage.data[registryKey].delegationReleaseReceipts[id];
      assert.strictEqual(firstReceipt.releasedTabCount, 1);
      assert.strictEqual(firstReceipt.acknowledged, false);
      assert.strictEqual(storage.data[registryKey].delegations, undefined);

      modules = freshModules();
      registryModule = freshRegistryModule();
      registry = new registryModule.AgentRegistry({ now: () => 1720000000200 });
      await registry.hydrate();
      assert.deepStrictEqual(
        await registry.releaseDelegation({ delegationId: id, agentId: registered.agentId }),
        { ok: true, code: 'delegation_already_released', releasedTabCount: 1 },
      );
      originalAcknowledge = registry.acknowledgeDelegationRelease.bind(registry);
      registry.acknowledgeDelegationRelease = async (input) => {
        ackObservations.push(clone(storage.data[ledgerKey]));
        return originalAcknowledge(input);
      };
      harness = makeDeps(modules.store, {
        registry,
        cancel: async () => {
          throw new Error('confirmed cleanup must not cancel twice');
        },
      });
      controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      assert.strictEqual(restored[0].state, 'stopping');

      const retried = await controller.stop({ delegationId: id });
      assert.strictEqual(retried.ok, true);
      assert.strictEqual(retried.code, 'completed');
      assert.deepStrictEqual(retried.snapshot.terminal, {
        code: 'completed',
        releasedTabCount: 1,
      });
      assert.strictEqual(ackObservations.length, 1);
      assert.strictEqual(ackObservations[0].terminal, true);
      assert.strictEqual(ackObservations[0].terminalCode, 'completed');
      assert.strictEqual(ackObservations[0].cleanupPending, null);
      assert.strictEqual(
        storage.data[registryKey].delegationReleaseReceipts[id].acknowledged,
        true,
      );
    } finally {
      storage.restore();
    }
  });

  await test('2,000-row recovered run terminalizes without row 2,001 or replay', async () => {
    const bootstrap = freshModules();
    const id = 'delegation_controller_terminal_boundary';
    const template = bootstrap.store.project(fixtures.stateEvent, acceptedStoreContext({
      delegationId: id,
      sequence: 1,
      timestamp: 1720000000000,
      state: 'running',
      title: 'bounded state',
    }));
    const entries = Array.from(
      { length: bootstrap.store.MAX_ENTRIES_PER_DELEGATION },
      (_, index) => ({ ...clone(template), sequence: index + 1 }),
    );
    const key = `${bootstrap.store.STORAGE_KEY_PREFIX}${id}`;
    const storage = installSessionStorage({
      [key]: {
        ...fixtures.makePersistedEnvelope(entries, { delegationId: id }),
        acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY,
        cleanupPending: null,
      },
    });
    try {
      const { store, controllerModule } = freshModules();
      const harness = makeDeps(store, {
        cancel: async () => {
          throw new Error('settled final must not cancel');
        },
      });
      let controller = controllerModule.create(harness.deps);
      const hydrated = await controller.hydrate();
      assert.strictEqual(hydrated.length, 1);
      assert.strictEqual(hydrated[0].entries.length, store.MAX_ENTRIES_PER_DELEGATION);
      const terminalEntry = await controller.acceptEvent(eventInput(id, fixtures.terminalEvent, {
        timestamp: 1720000000100,
        terminalCode: 'completed',
        treeSettled: true,
      }));
      assert.strictEqual(terminalEntry, null);
      assert.deepStrictEqual(controller.getSnapshot(id).terminal, {
        code: 'completed',
        releasedTabCount: 0,
      });
      assert.strictEqual(storage.data[key].terminal, true);
      assert.strictEqual(storage.data[key].terminalCode, 'completed');
      assert.strictEqual(storage.data[key].cleanupPending, null);
      assert.strictEqual(storage.data[key].entries.length, store.MAX_ENTRIES_PER_DELEGATION);
      assert.strictEqual(storage.data[key].entries.at(-1).sequence, store.MAX_ENTRIES_PER_DELEGATION);

      const reloaded = freshModules();
      controller = reloaded.controllerModule.create(makeDeps(reloaded.store).deps);
      assert.deepStrictEqual(await controller.hydrate(), []);
    } finally {
      storage.restore();
    }
  });

  await test('quota and corrupt canonical entries fan out only after a terminal marker', async () => {
    for (const code of ['delegation_quota_exceeded', 'delegation_ledger_corrupt']) {
      const { store, controllerModule } = freshModules();
      let appendCalls = 0;
      const persistedEntries = [];
      const fakeStore = {
        async hydrateNonterminal() { return []; },
        async appendBeforeFanout(id, event, context) {
          appendCalls += 1;
          if (appendCalls === 1) {
            const entry = store.project(event, {
              ...context,
              delegationId: id,
              sequence: 1,
            });
            persistedEntries.push(entry);
            return entry;
          }
          if (code === 'delegation_ledger_corrupt') {
            return {
              delegationId: id,
              sequence: 3,
            };
          }
          const error = new Error(code);
          error.code = code;
          throw error;
        },
        async markCleanupPending(id, cleanup) {
          return {
            v: 1,
            delegationId: id,
            acceptedIdentity: clone(cleanup.acceptedIdentity),
            terminal: false,
            terminalCode: null,
            cleanupPending: {
              code: cleanup.code,
              cancellationConfirmed: cleanup.cancellationConfirmed,
              agentId: cleanup.agentId,
            },
            entries: clone(persistedEntries),
          };
        },
        async markTerminal(id, terminal) {
          const entry = store.project(terminal.event, {
            ...terminal.context,
            delegationId: id,
            sequence: persistedEntries.length + 1,
            terminalCode: terminal.code,
          });
          persistedEntries.push(entry);
          return {
            v: 1,
            delegationId: id,
            acceptedIdentity: clone(terminal.context.acceptedIdentity),
            terminal: true,
            terminalCode: terminal.code,
            cleanupPending: null,
            entries: clone(persistedEntries),
          };
        },
      };
      const { deps, calls } = makeDeps(fakeStore);
      const controller = controllerModule.create(deps);
      await controller.hydrate();
      const id = `delegation_${code}`;
      await controller.start(startInput(id));
      let delivered = 0;
      controller.subscribe(() => { delivered += 1; });
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.stateEvent)),
        code,
      );
      assert.strictEqual(delivered, 1);
      assert.strictEqual(controller.getSnapshot(id).terminal.code, code);
      assert.deepStrictEqual(calls.cancel, [{ delegationId: id, code }]);
      assert.strictEqual(controller.getSnapshot(id).entries.length, 2);
      assert.strictEqual(controller.getSnapshot(id).entries[1].state, 'failed');
    }
  });

  await test('forced module reload hydrates exact display rows silently with no execution side effects', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      let mappedAgentId = null;
      const registry = {
        async bindDelegation(input) {
          mappedAgentId = input.agentId;
          return { ok: true };
        },
        getAgentForDelegation() { return mappedAgentId; },
        listDelegationMappings() {
          return mappedAgentId
            ? [{ delegationId: fixtures.baseContext.delegationId, agentId: mappedAgentId }]
            : [];
        },
        getDelegationReleaseReceipt() { return null; },
      };
      let harness = makeDeps(modules.store, { registry });
      let controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = fixtures.baseContext.delegationId;
      await controller.start(startInput(id));
      await controller.bindRegisteredAgent({ delegationId: id, agentId: 'agent-reload-proof' });
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext));
      await controller.acceptEvent(eventInput(id, fixtures.toolUseEvent, {
        ...fixtures.baseContext,
        timestamp: fixtures.baseContext.timestamp + 1,
      }));

      modules = freshModules();
      harness = makeDeps(modules.store, { registry });
      controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      exactKeys(restored[0], [
        'v', 'delegationId', 'acceptedIdentity', 'provider', 'state',
        'connection', 'entries', 'summary', 'activeTab', 'hold', 'terminal',
        'hydrated',
      ]);
      assert.strictEqual(restored[0].delegationId, id);
      assert.strictEqual(restored[0].hydrated, true);
      assert.strictEqual(restored[0].connection, 'disconnected');
      assert.deepStrictEqual(restored[0].entries.map((entry) => entry.sequence), [1, 2, 3]);
      assert.deepStrictEqual(restored[0].entries.map((entry) => entry.kind), ['init', 'init', 'tool-call']);
      assert.deepStrictEqual(restored[0].provider, { id: 'claude-code', label: 'Claude Code' });
      assert.deepStrictEqual(harness.calls, {
        cancel: [], status: [], hold: [], resume: [], activeTabs: [], liveTabs: [], registry: [],
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
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, fixtures.baseContext));
      storage.clear();

      modules = freshModules();
      const harness = makeDeps(modules.store);
      controller = modules.controllerModule.create(harness.deps);
      assert.deepStrictEqual(await controller.hydrate(), []);
      assert.strictEqual(controller.getSnapshot(id), null);
      assert.deepStrictEqual(harness.calls, {
        cancel: [], status: [], hold: [], resume: [], activeTabs: [], liveTabs: [], registry: [],
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
    const first = bootstrap.project(fixtures.initEvent, acceptedStoreContext(fixtures.baseContext));
    const second = bootstrap.project(fixtures.stateEvent, acceptedStoreContext({
      ...fixtures.baseContext,
      sequence: 2,
    }));
    const key = `${bootstrap.STORAGE_KEY_PREFIX}${id}`;
    const cases = [
      [first, clone(first)],
      [first, { ...clone(first), title: 'conflicting duplicate' }],
      [first, { ...clone(second), sequence: 3 }],
    ];
    for (const entries of cases) {
      const envelope = {
        ...fixtures.makePersistedEnvelope(entries),
        acceptedIdentity: CLAUDE_ACCEPTED_IDENTITY,
        cleanupPending: null,
      };
      const storage = installSessionStorage({ [key]: envelope });
      try {
        const { store, controllerModule } = freshModules();
        const harness = makeDeps(store);
        const controller = controllerModule.create(harness.deps);
        await expectCode(controller.hydrate(), 'delegation_ledger_corrupt');
        await expectCode(() => controller.subscribe(() => {}), 'delegation_not_hydrated');
        assert.deepStrictEqual(harness.calls, {
          cancel: [], status: [], hold: [], resume: [], activeTabs: [], liveTabs: [], registry: [],
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
      await controller.start(startInput(id));
      let goodCalls = 0;
      controller.subscribe(() => { throw new Error('bad subscriber'); });
      controller.subscribe(() => { goodCalls += 1; });
      const entry = await controller.acceptEvent(eventInput(id, fixtures.stateEvent, {
        ...fixtures.baseContext,
        state: 'running',
      }));
      assert.strictEqual(entry.sequence, 2);
      assert.strictEqual(goodCalls, 1);
      assert.strictEqual(controller.getSnapshot(id).entries.length, 2);
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
        await controller.start(startInput(id));
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
        assert.strictEqual(envelope.entries.length, 2);
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
      const firstStart = controller.start(startInput(id));
      const duplicateStart = controller.start(startInput(id));
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
      assert.strictEqual(envelope.entries.length, 2);
      assert.strictEqual(envelope.entries[0].state, 'starting');
      assert.strictEqual(envelope.entries[1].state, 'stopped');
    } finally {
      storage.restore();
    }
  });

  await test('post-cleanup final-vs-stop ordering chooses exactly one winner in both directions', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const harness = makeDeps(store);
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      const finalFirstId = 'delegation_final_first';
      await controller.start(startInput(finalFirstId));
      const streamedResult = await controller.acceptEvent(eventInput(finalFirstId, fixtures.resultEvent, {
        timestamp: 1720000000200,
        state: 'completed',
        billingKind: 'subscription',
      }));
      assert.strictEqual(streamedResult.state, 'running');
      assert.strictEqual(controller.getSnapshot(finalFirstId).terminal, null,
        'streamed result alone retains lifecycle authority');
      const finalFirst = controller.acceptEvent(eventInput(finalFirstId, fixtures.terminalEvent, {
        timestamp: 1720000000201,
        terminalCode: 'completed',
        treeSettled: true,
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
      await controller.start(startInput(stopFirstId));
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
      assert.strictEqual(envelope.entries.length, 3);
      assert.strictEqual(envelope.entries[0].kind, 'init');
      assert.strictEqual(envelope.entries[1].kind, 'init');
      assert.strictEqual(envelope.entries[2].state, 'stopped');
    } finally {
      storage.restore();
    }
  });

  await test('streamed result retains ownership through delayed and failed cleanup', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const released = [];
      const cancelled = [];
      const registry = {
        async bindDelegation() { return { ok: true }; },
        async releaseDelegation({ delegationId }) {
          released.push(delegationId);
          return { ok: true, releasedTabCount: 1 };
        },
      };
      const harness = makeDeps(store, {
        registry,
        cancel: async (input) => {
          cancelled.push(clone(input));
          return {
            delegationId: input.delegationId,
            status: input.delegationId === failedId ? 'failed' : 'already_terminal',
          };
        },
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      const delayedId = 'delegation_delayed_cleanup';
      await controller.start(startInput(delayedId));
      await controller.bindRegisteredAgent({ delegationId: delayedId, agentId: 'agent-delayed' });
      const streamed = await controller.acceptEvent(eventInput(delayedId, fixtures.resultEvent, {
        timestamp: 1720000000600,
        billingKind: 'subscription',
      }));
      assert.strictEqual(streamed.state, 'running');
      assert.strictEqual(controller.getSnapshot(delayedId).terminal, null);
      assert.strictEqual(controller.getSnapshot(delayedId).summary.state, 'running');
      assert.deepStrictEqual(released, [], 'result emission cannot release browser authority');

      await controller.acceptEvent(eventInput(delayedId, fixtures.terminalEvent, {
        timestamp: 1720000000601,
        terminalCode: 'completed',
        treeSettled: true,
      }));
      assert.deepStrictEqual(released, [delayedId],
        'post-cleanup final evidence releases exact ownership once');
      assert.strictEqual(controller.getSnapshot(delayedId).summary.state, 'completed');

      const failedId = 'delegation_cleanup_failure';
      await controller.start(startInput(failedId));
      await controller.bindRegisteredAgent({ delegationId: failedId, agentId: 'agent-cleanup-failed' });
      await controller.acceptEvent(eventInput(failedId, fixtures.resultEvent, {
        timestamp: 1720000000700,
        billingKind: 'subscription',
      }));
      await expectCode(
        controller.acceptEvent(eventInput(failedId, fixtures.terminalEvent, {
          timestamp: 1720000000701,
          terminalCode: 'tree_unsettled',
          treeSettled: false,
        })),
        'tree_unsettled',
      );
      assert.strictEqual(controller.getSnapshot(failedId).terminal, null);
      assert.deepStrictEqual(released, [delayedId],
        'cleanup failure retains ownership even after a streamed result');
      assert.deepStrictEqual(cancelled, [{ delegationId: failedId, code: 'tree_unsettled' }]);
      assert.deepStrictEqual(
        storage.data[`${store.STORAGE_KEY_PREFIX}${failedId}`].cleanupPending,
        {
          code: 'tree_unsettled',
          cancellationConfirmed: false,
          agentId: 'agent-cleanup-failed',
        },
      );
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
      await controller.start(startInput(finalId));
      await controller.acceptEvent(eventInput(finalId, fixtures.initEvent, {}));
      await clock.tick(119999);
      await controller.acceptEvent(eventInput(finalId, fixtures.resultEvent, {
        state: 'completed',
        billingKind: 'subscription',
      }));
      await controller.acceptEvent(eventInput(finalId, fixtures.terminalEvent, {
        terminalCode: 'completed',
        treeSettled: true,
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
      await controller.start(startInput(silenceId));
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
      await controller.start(startInput(wallId));
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

  await test('eviction and reconnect preserve absolute wall and silence deadlines', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const base = 1720000000000;
      const wallId = 'delegation_absolute_wall_deadline';
      await modules.store.appendBeforeFanout(wallId, fixtures.initEvent, acceptedStoreContext({
        timestamp: base,
        state: 'running',
        client: { id: 'claude-code', label: 'Claude Code' },
      }));
      await modules.store.appendBeforeFanout(
        wallId,
        { type: 'state', sessionId: null, payload: {} },
        acceptedStoreContext({
          timestamp: base + 1,
          state: 'held',
          title: 'Delegation held',
          detail: null,
        }),
      );

      modules = freshModules();
      const wakeClock = createFakeClock(base + (20 * 60 * 1000));
      let harness = makeDeps(modules.store, {
        clock: wakeClock,
        registry: {
          getAgentForDelegation(delegationId) {
            return delegationId === wallId ? 'agent-wall-deadline' : null;
          },
          listDelegationMappings() {
            return [{ delegationId: wallId, agentId: 'agent-wall-deadline' }];
          },
          getDelegationReleaseReceipt() { return null; },
        },
      });
      let controller = modules.controllerModule.create(harness.deps);
      const wallRestored = await controller.hydrate();
      assert.strictEqual(wallRestored[0].state, 'held');
      await wakeClock.tick((25 * 60 * 1000) - 1);
      assert.strictEqual(controller.getSnapshot(wallId).terminal, null,
        'evicted run remains active until its original wall deadline');
      await wakeClock.tick(1);
      assert.deepStrictEqual(controller.getSnapshot(wallId).terminal, {
        code: 'wall_clock_timeout',
        releasedTabCount: 0,
      });

      const silenceId = 'delegation_absolute_silence_deadline';
      await modules.store.appendBeforeFanout(silenceId, fixtures.initEvent, acceptedStoreContext({
        timestamp: base + 3000000,
        state: 'running',
        client: { id: 'claude-code', label: 'Claude Code' },
      }));
      modules = freshModules();
      const silenceBase = base + 3000000;
      const reconnectClock = createFakeClock(silenceBase + 60000);
      const generation = 'generation_absolute_deadline_61';
      harness = makeRecoveryDeps(modules.store, {
        overrides: { clock: reconnectClock },
      });
      controller = modules.controllerModule.create(harness.deps);
      await controller.hydrate();
      const live = supervisorStatus(generation, [{ delegationId: silenceId, state: 'running' }]);
      await controller.reconcile({ delegationId: silenceId, connection: 'connected', status: live });
      await reconnectClock.tick(30000);
      await controller.reconcile({ delegationId: silenceId, connection: 'disconnected' });
      await controller.reconcile({ delegationId: silenceId, connection: 'connected', status: live });
      await reconnectClock.tick(29999);
      assert.strictEqual(controller.getSnapshot(silenceId).terminal, null,
        'disconnect and reconnect cannot mint a fresh silence budget');
      await controller.reconcile({ delegationId: silenceId, connection: 'disconnected' });
      await controller.reconcile({ delegationId: silenceId, connection: 'connected', status: live });
      await reconnectClock.tick(1);
      assert.deepStrictEqual(controller.getSnapshot(silenceId).terminal, {
        code: 'event_silence_timeout',
        releasedTabCount: 0,
      });
      assert.strictEqual(
        harness.calls.cancel.filter((call) => call.delegationId === silenceId).length,
        1,
      );
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
        controller.start(startInput(firstId)),
        controller.start(acceptedStartInput(secondId, OPENCODE_ACCEPTED_IDENTITY)),
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
      assert.deepStrictEqual(firstBeforeStop.provider, CLAUDE_PROVIDER);
      assert.deepStrictEqual(secondAfterTimeout.provider, OPENCODE_PROVIDER);
      assert.strictEqual(firstBeforeStop.state, 'running');
      assert.strictEqual(firstBeforeStop.terminal, null);
      assert.deepStrictEqual(firstBeforeStop.entries.map((entry) => entry.sequence), [1, 2, 3]);
      assert.deepStrictEqual(secondAfterTimeout.terminal, {
        code: 'event_silence_timeout',
        releasedTabCount: 0,
      });
      assert.deepStrictEqual(secondAfterTimeout.entries.map((entry) => entry.sequence), [1, 2, 3]);
      assert.strictEqual(secondAfterTimeout.entries[2].state, 'failed');

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
            { tabId: 17, ownershipToken: 'sealed-token-17' },
            { tabId: 11, ownershipToken: 'sealed-token-11' },
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
        getActiveTab: async () => {
          order.push('active-tab');
          return { tabId: 11 };
        },
        getLiveTabIds: async (input) => {
          order.push('live-tabs');
          assert.deepStrictEqual(input.tabIds, [11, 17]);
          return [11, 17];
        },
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
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
      const bound = await controller.bindRegisteredAgent({ delegationId: id, agentId: 'agent-61-02' });
      assert.strictEqual(bound.ok, true);
      await controller.reconcile({
        delegationId: id,
        connection: 'connected',
        activeTab: { tabId: 11, owned: true, canTakeControl: true },
      });

      const held = await controller.takeControl({ delegationId: id });
      assert.strictEqual(held.code, 'held');
      exactKeys(held.runtimeEvent, ['announceSequence', 'snapshot', 'type']);
      exactKeys(held.snapshot.activeTab, ['canTakeControl', 'owned', 'tabId']);
      exactKeys(held.snapshot.hold, ['expiresAt', 'tabIds']);
      assert.deepStrictEqual(held.snapshot.hold.tabIds, [11, 17]);
      assert.deepStrictEqual(
        order.slice(0, 5),
        ['bind:agent-61-02', 'active-tab', 'owned-tabs', 'daemon-hold', 'seal-all-tabs'],
      );
      let envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
      assert.deepStrictEqual(envelope.entries.map((entry) => entry.state), ['starting', 'running', 'held']);

      const resumed = await controller.resume({ delegationId: id });
      assert.strictEqual(resumed.code, 'resumed');
      assert.strictEqual(resumed.snapshot.state, 'running');
      assert.strictEqual(resumed.snapshot.hold, null);
      assert.deepStrictEqual(resumed.snapshot.activeTab, {
        tabId: 11,
        owned: true,
        canTakeControl: true,
      });
      assert(order.indexOf('live-tabs') < order.indexOf('restore-all-tabs'));
      assert(order.indexOf('restore-all-tabs') < order.indexOf('daemon-resume'));
      envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
      assert.deepStrictEqual(envelope.entries.map((entry) => entry.state), ['starting', 'running', 'held', 'running']);

      const stopped = await controller.stop({ delegationId: id });
      assert.strictEqual(stopped.code, 'stopped');
      assert.deepStrictEqual(stopped.snapshot.terminal, {
        code: 'stopped',
        releasedTabCount: 2,
      });
      assert.strictEqual(order.filter((item) => item === 'release-all-tabs').length, 1);
      assert.strictEqual(harness.calls.cancel.length, 1);
      envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
      assert.deepStrictEqual(
        envelope.entries.map((entry) => entry.state),
        ['starting', 'running', 'held', 'running', 'stopped'],
      );
      assert.strictEqual(clock.pending(), 0);
    } finally {
      storage.restore();
    }
  });

  await test('active-tab eligibility is controller-derived from the exact delegation mapping', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      let activeTabId = 71;
      let mappedAgentId = 'agent-active-tab-authority';
      let mappedDelegationId = null;
      let ownedTabs = [
        { tabId: 71, ownershipToken: 'token-71' },
        { tabId: 72, ownershipToken: 'token-72' },
      ];
      const registry = {
        async bindDelegation(input) {
          mappedDelegationId = input.delegationId;
          return { ok: true };
        },
        getAgentForDelegation() { return mappedAgentId; },
        listDelegationMappings() {
          return mappedDelegationId && mappedAgentId
            ? [{ delegationId: mappedDelegationId, agentId: mappedAgentId }]
            : [];
        },
        getDelegationOwnedTabs(input) {
          exactKeys(input, ['agentId', 'delegationId']);
          assert.strictEqual(input.agentId, mappedAgentId);
          return clone(ownedTabs);
        },
      };
      const { deps } = makeDeps(store, {
        registry,
        getActiveTab: async (input) => {
          exactKeys(input, ['delegationId']);
          return { tabId: activeTabId };
        },
      });
      const controller = controllerModule.create(deps);
      await controller.hydrate();
      const id = 'delegation_active_tab_authority';
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
      await controller.bindRegisteredAgent({ delegationId: id, agentId: mappedAgentId });

      const exactOwned = await controller.refreshActiveTab({ delegationId: id });
      assert.deepStrictEqual(exactOwned.activeTab, {
        tabId: 71,
        owned: true,
        canTakeControl: true,
      });

      activeTabId = 99;
      const unrelated = await controller.refreshActiveTab({ delegationId: id });
      assert.strictEqual(unrelated.activeTab, null);

      activeTabId = 71;
      mappedAgentId = null;
      const mappingLost = await controller.refreshActiveTab({ delegationId: id });
      assert.strictEqual(mappingLost.activeTab, null);

      await expectCode(() => controller.refreshActiveTab({
        delegationId: id,
        activeTabId: 71,
        owned: true,
      }), 'invalid_delegation_id');
      assert.strictEqual(controller.getSnapshot(id).activeTab, null,
        'caller-supplied ownership never changes the canonical snapshot');

      mappedAgentId = 'agent-active-tab-authority';
      ownedTabs = [{ tabId: 71, ownershipToken: '' }];
      const incompleteAuthority = await controller.refreshActiveTab({ delegationId: id });
      assert.strictEqual(incompleteAuthority.activeTab, null,
        'missing ownership token metadata fails closed');
    } finally {
      storage.restore();
    }
  });

  await test('take-control derives the active identity and cancels exact runs after confirmed-hold failures', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const clock = createFakeClock();
      const order = [];
      const ownedTabs = [
        { tabId: 11, ownershipToken: 'ownership-11' },
        { tabId: 17, ownershipToken: 'ownership-17' },
      ];
      const registry = {
        async bindDelegation() { return { ok: true }; },
        async getDelegationOwnedTabs(input) {
          order.push(`owned:${input.delegationId}`);
          return clone(ownedTabs);
        },
        async sealHoldLease(input) {
          order.push(`seal:${input.delegationId}`);
          assert.deepStrictEqual(input.ownedTabs, ownedTabs);
          if (input.delegationId === 'delegation_seal_failure') {
            return { ok: false, code: 'resume_ownership_lost' };
          }
          return { ok: true, expiresAt: clock.now() + 300000 };
        },
        async releaseDelegation(input) {
          order.push(`release:${input.delegationId}`);
          return { ok: true, releasedTabCount: 2 };
        },
      };
      const harness = makeDeps(store, {
        clock,
        registry,
        getActiveTab: async (input) => {
          order.push(`active:${input.delegationId}`);
          return {
            tabId: input.delegationId === 'delegation_wrong_active' ? 99 : 11,
          };
        },
        hold: async (input) => {
          order.push(`hold:${input.delegationId}`);
          if (input.delegationId === 'delegation_hold_failure') {
            return { delegationId: input.delegationId, status: 'hold_failed' };
          }
          return { delegationId: input.delegationId, status: 'held' };
        },
        cancel: async (input) => {
          harness.calls.cancel.push(clone(input));
          order.push(`cancel:${input.delegationId}`);
          return { delegationId: input.delegationId, status: 'cancelled' };
        },
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      async function ready(id) {
        await controller.start(startInput(id));
        await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
        await controller.bindRegisteredAgent({ delegationId: id, agentId: `agent-${id}` });
      }

      const wrongId = 'delegation_wrong_active';
      await ready(wrongId);
      const wrong = await controller.takeControl({ delegationId: wrongId, activeTabId: 11 });
      assert.strictEqual(wrong.code, 'active_tab_not_owned');
      assert.strictEqual(wrong.snapshot.state, 'running');
      assert.strictEqual(order.includes(`hold:${wrongId}`), false);
      assert.strictEqual(harness.calls.cancel.some((call) => call.delegationId === wrongId), false);

      const holdFailureId = 'delegation_hold_failure';
      await ready(holdFailureId);
      const holdFailure = await controller.takeControl({ delegationId: holdFailureId });
      assert.strictEqual(holdFailure.ok, false);
      assert.strictEqual(holdFailure.code, 'agent_failed');
      assert.strictEqual(holdFailure.snapshot.terminal.code, 'agent_failed');
      assert(order.indexOf(`hold:${holdFailureId}`) < order.indexOf(`cancel:${holdFailureId}`));
      assert.strictEqual(order.includes(`seal:${holdFailureId}`), false);

      const sealFailureId = 'delegation_seal_failure';
      await ready(sealFailureId);
      const sealFailure = await controller.takeControl({ delegationId: sealFailureId });
      assert.strictEqual(sealFailure.ok, false);
      assert.strictEqual(sealFailure.code, 'resume_ownership_lost');
      assert(order.indexOf(`hold:${sealFailureId}`) < order.indexOf(`seal:${sealFailureId}`));
      assert(order.indexOf(`seal:${sealFailureId}`) < order.indexOf(`cancel:${sealFailureId}`));
      assert(order.indexOf(`cancel:${sealFailureId}`) < order.indexOf(`release:${sealFailureId}`));

      for (const id of [holdFailureId, sealFailureId]) {
        const envelope = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
        assert.strictEqual(envelope.terminal, true);
        assert.strictEqual(envelope.entries.filter((entry) => entry.kind === 'state'
          && (entry.state === 'failed' || entry.state === 'stopped')).length, 1);
      }
    } finally {
      storage.restore();
    }
  });

  await test('resume rejects partial live identity sets and re-seals before cancel when daemon resume fails', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      const clock = createFakeClock();
      const order = [];
      const ownedTabs = [
        { tabId: 11, ownershipToken: 'ownership-11' },
        { tabId: 17, ownershipToken: 'ownership-17' },
      ];
      const sealCounts = new Map();
      const registry = {
        async bindDelegation() { return { ok: true }; },
        async getDelegationOwnedTabs() { return clone(ownedTabs); },
        async sealHoldLease(input) {
          const count = (sealCounts.get(input.delegationId) || 0) + 1;
          sealCounts.set(input.delegationId, count);
          order.push(`${count === 1 ? 'seal' : 'reseal'}:${input.delegationId}`);
          assert.deepStrictEqual(input.ownedTabs, ownedTabs);
          return { ok: true, expiresAt: clock.now() + 300000 };
        },
        async restoreHoldLease(input) {
          order.push(`restore:${input.delegationId}:${input.liveTabIds.join(',')}`);
          if (input.liveTabIds.length !== 2) {
            return { ok: false, code: 'resume_ownership_lost' };
          }
          return { ok: true };
        },
        async releaseDelegation(input) {
          order.push(`release:${input.delegationId}`);
          return { ok: true, releasedTabCount: 2 };
        },
      };
      const harness = makeDeps(store, {
        clock,
        registry,
        getActiveTab: async () => ({ tabId: 11 }),
        getLiveTabIds: async (input) => {
          order.push(`live:${input.delegationId}`);
          return input.delegationId === 'delegation_partial_resume' ? [11] : [11, 17];
        },
        hold: async (input) => ({ delegationId: input.delegationId, status: 'held' }),
        resume: async (input) => {
          order.push(`resume:${input.delegationId}`);
          return input.delegationId === 'delegation_daemon_resume_failure'
            ? { delegationId: input.delegationId, status: 'resume_failed' }
            : { delegationId: input.delegationId, status: 'running' };
        },
        cancel: async (input) => {
          harness.calls.cancel.push(clone(input));
          order.push(`cancel:${input.delegationId}`);
          return { delegationId: input.delegationId, status: 'already_terminal' };
        },
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();

      async function readyAndHold(id) {
        await controller.start(startInput(id));
        await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
        await controller.bindRegisteredAgent({ delegationId: id, agentId: `agent-${id}` });
        const held = await controller.takeControl({ delegationId: id });
        assert.strictEqual(held.code, 'held');
      }

      const partialId = 'delegation_partial_resume';
      await readyAndHold(partialId);
      const partial = await controller.resume({ delegationId: partialId, liveTabIds: [11, 17] });
      assert.strictEqual(partial.code, 'resume_ownership_lost');
      assert.strictEqual(order.includes(`resume:${partialId}`), false);
      assert(order.indexOf(`live:${partialId}`) < order.indexOf(`restore:${partialId}:11`));
      assert(order.indexOf(`restore:${partialId}:11`) < order.indexOf(`cancel:${partialId}`));
      assert.strictEqual(sealCounts.get(partialId), 1);

      const daemonFailureId = 'delegation_daemon_resume_failure';
      await readyAndHold(daemonFailureId);
      const daemonFailure = await controller.resume({ delegationId: daemonFailureId });
      assert.strictEqual(daemonFailure.code, 'resume_ownership_lost');
      assert.strictEqual(sealCounts.get(daemonFailureId), 2);
      assert(order.indexOf(`restore:${daemonFailureId}:11,17`) < order.indexOf(`resume:${daemonFailureId}`));
      assert(order.indexOf(`resume:${daemonFailureId}`) < order.indexOf(`reseal:${daemonFailureId}`));
      assert(order.indexOf(`reseal:${daemonFailureId}`) < order.indexOf(`cancel:${daemonFailureId}`));
      assert(order.indexOf(`cancel:${daemonFailureId}`) < order.indexOf(`release:${daemonFailureId}`));
    } finally {
      storage.restore();
    }
  });

  await test('Stop persists unconfirmed cleanup and retries cancellation after worker reload', async () => {
    const storage = installSessionStorage();
    try {
      let { store, controllerModule } = freshModules();
      let cancelCalls = 0;
      let releaseCalls = 0;
      let stopRegistryMapped = false;
      const registry = {
        async bindDelegation() { stopRegistryMapped = true; return { ok: true }; },
        getAgentForDelegation(delegationId) {
          return stopRegistryMapped && delegationId === 'delegation_tree_unsettled_stop'
            ? 'agent-tree-unsettled'
            : null;
        },
        listDelegationMappings() {
          return stopRegistryMapped
            ? [{
              delegationId: 'delegation_tree_unsettled_stop',
              agentId: 'agent-tree-unsettled',
            }]
            : [];
        },
        getDelegationReleaseReceipt() { return null; },
        async releaseDelegation() {
          releaseCalls += 1;
          return { ok: true, releasedTabCount: 1 };
        },
      };
      const cancel = async (input) => {
        cancelCalls += 1;
        return {
          delegationId: input.delegationId,
          status: cancelCalls === 1 ? 'failed' : 'cancelled',
        };
      };
      let harness = makeDeps(store, {
        cancel,
        registry,
      });
      let controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_tree_unsettled_stop';
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
      await controller.bindRegisteredAgent({ delegationId: id, agentId: 'agent-tree-unsettled' });

      const first = controller.stop({ delegationId: id });
      const duplicate = controller.stop({ delegationId: id });
      assert.strictEqual(first, duplicate);
      const result = await first;
      assert.strictEqual(result.code, 'tree_unsettled');
      assert.strictEqual(result.snapshot.terminal, null);
      assert.strictEqual(result.snapshot.state, 'stopping');
      assert.strictEqual(cancelCalls, 1);
      assert.strictEqual(releaseCalls, 0);
      const key = `${store.STORAGE_KEY_PREFIX}${id}`;
      assert.strictEqual(storage.data[key].terminal, false);
      assert.strictEqual(storage.data[key].terminalCode, null);
      assert.deepStrictEqual(storage.data[key].cleanupPending, {
        code: 'stopped',
        cancellationConfirmed: false,
        agentId: 'agent-tree-unsettled',
      });
      assert.strictEqual(storage.data[key].entries.length, 2);

      ({ store, controllerModule } = freshModules());
      harness = makeDeps(store, {
        cancel,
        registry,
      });
      controller = controllerModule.create(harness.deps);
      const hydrated = await controller.hydrate();
      assert.strictEqual(hydrated.length, 1);
      assert.strictEqual(hydrated[0].state, 'stopping');
      assert.strictEqual(hydrated[0].terminal, null);

      const retried = await controller.stop({ delegationId: id });
      assert.strictEqual(retried.ok, true);
      assert.strictEqual(retried.code, 'stopped');
      assert.deepStrictEqual(retried.snapshot.terminal, {
        code: 'stopped',
        releasedTabCount: 1,
      });
      assert.strictEqual(cancelCalls, 2);
      assert.strictEqual(releaseCalls, 1);
      assert.strictEqual(storage.data[key].terminal, true);
      assert.strictEqual(storage.data[key].terminalCode, 'stopped');
      assert.strictEqual(storage.data[key].cleanupPending, null);
      assert.strictEqual(storage.data[key].entries.length, 3);
    } finally {
      storage.restore();
    }
  });

  await test('transport route loss never releases ownership before exact cancellation settlement', async () => {
    const storage = installSessionStorage();
    try {
      const { store, controllerModule } = freshModules();
      let releaseCalls = 0;
      const harness = makeDeps(store, {
        cancel: async () => { throw Object.assign(new Error('route unavailable'), {
          code: 'bridge_topology_changed',
        }); },
        registry: {
          async bindDelegation() { return { ok: true }; },
          async releaseDelegation() {
            releaseCalls += 1;
            return { ok: true, releasedTabCount: 1 };
          },
        },
      });
      const controller = controllerModule.create(harness.deps);
      await controller.hydrate();
      const id = 'delegation_route_loss_cleanup';
      await controller.start(startInput(id));
      await controller.acceptEvent(eventInput(id, fixtures.initEvent, {}));
      await controller.bindRegisteredAgent({ delegationId: id, agentId: 'agent-route-loss' });

      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.terminalEvent, {
          terminalCode: 'route_lost',
          treeSettled: false,
        })),
        'tree_unsettled',
      );

      assert.strictEqual(controller.getSnapshot(id).terminal, null);
      assert.strictEqual(controller.getSnapshot(id).state, 'stopping');
      assert.strictEqual(releaseCalls, 0,
        'topology failure retains exact tab ownership while cancellation is unconfirmed');
      const ledger = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
      assert.strictEqual(ledger.terminal, false);
      assert.strictEqual(ledger.terminalCode, null);
      assert.deepStrictEqual(ledger.cleanupPending, {
        code: 'route_lost',
        cancellationConfirmed: false,
        agentId: 'agent-route-loss',
      });
    } finally {
      storage.restore();
    }
  });

  await test('structured registry release failures retain authority and permit typed retry', async () => {
    for (const item of [
      { name: 'mapping mismatch', code: 'delegation_mapping_mismatch', finalPath: false },
      { name: 'ownership mismatch', code: 'delegation_mapping_mismatch', finalPath: false },
      { name: 'release persistence', code: 'delegation_release_persistence_failed', finalPath: true },
    ]) {
      const storage = installSessionStorage();
      try {
        const { store, controllerModule } = freshModules();
        const id = `delegation_release_${item.name.replace(/\s+/g, '_')}`;
        let releaseAttempts = 0;
        let cancelAttempts = 0;
        const registry = {
          async bindDelegation() { return { ok: true }; },
          async releaseDelegation() {
            releaseAttempts += 1;
            if (releaseAttempts === 1) {
              return { ok: false, code: item.code, releasedTabCount: 0 };
            }
            return { ok: true, code: 'delegation_released', releasedTabCount: 2 };
          },
        };
        const harness = makeDeps(store, {
          registry,
          cancel: async (input) => {
            cancelAttempts += 1;
            return { delegationId: input.delegationId, status: 'cancelled' };
          },
        });
        const controller = controllerModule.create(harness.deps);
        await controller.hydrate();
        await controller.start(startInput(id));
        await controller.bindRegisteredAgent({ delegationId: id, agentId: `agent-${id}` });

        if (item.finalPath) {
          await controller.acceptEvent(eventInput(id, fixtures.resultEvent, {
            timestamp: 1720000000800,
            billingKind: 'subscription',
          }));
          await expectCode(
            controller.acceptEvent(eventInput(id, fixtures.terminalEvent, {
              timestamp: 1720000000801,
              terminalCode: 'completed',
              treeSettled: true,
            })),
            item.code,
          );
        } else {
          const blocked = await controller.stop({ delegationId: id });
          assert.strictEqual(blocked.ok, false, `${item.name} cannot report successful Stop`);
          assert.strictEqual(blocked.code, item.code);
        }

        const blockedSnapshot = controller.getSnapshot(id);
        assert.strictEqual(blockedSnapshot.terminal, null, `${item.name} remains nonterminal`);
        assert.strictEqual(blockedSnapshot.state, 'stopping');
        const ledger = storage.data[`${store.STORAGE_KEY_PREFIX}${id}`];
        assert.strictEqual(ledger.terminal, false);
        assert.deepStrictEqual(ledger.cleanupPending, {
          code: item.finalPath ? 'completed' : 'stopped',
          cancellationConfirmed: true,
          agentId: `agent-${id}`,
        }, `${item.name} persists an exact cleanup retry marker`);
        assert.strictEqual(releaseAttempts, 1);

        const retried = await controller.stop({ delegationId: id });
        assert.strictEqual(retried.ok, true, `${item.name} allows exact cleanup retry`);
        const expectedCode = item.finalPath ? 'completed' : 'stopped';
        assert.strictEqual(retried.code, expectedCode);
        assert.deepStrictEqual(retried.snapshot.terminal, {
          code: expectedCode,
          releasedTabCount: 2,
        });
        assert.strictEqual(releaseAttempts, 2);
        assert.strictEqual(cancelAttempts, item.finalPath ? 0 : 1,
          'confirmed cancellation is not repeated during release retry');
      } finally {
        storage.restore();
      }
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
        async getDelegationOwnedTabs() {
          return [{ tabId: 31, ownershipToken: 'sealed-token-31' }];
        },
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
        getActiveTab: async () => ({ tabId: 31 }),
        getLiveTabIds: async () => [31],
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
        await controller.start(startInput(id));
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
      const holding = controller.takeControl({ delegationId: overlapId });
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
        (await controller.takeControl({ delegationId: expiryId })).code,
        'held',
      );
      await clock.tick(300000);
      assert.deepStrictEqual(controller.getSnapshot(expiryId).terminal, {
        code: 'hold_expired',
        releasedTabCount: 1,
      });

      const lostId = 'delegation_resume_lost';
      await ready(lostId);
      await controller.takeControl({ delegationId: lostId });
      const lost = await controller.resume({ delegationId: lostId });
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

  await test('forced wake restores one heartbeat owner and only observes same-generation live state', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const id = 'delegation_wake_same_generation';
      await seedRunningLedger(modules.store, modules.controllerModule, id);

      modules = freshModules();
      const generation = 'generation_wake_same_6106';
      const generations = new Map([[id, generation]]);
      const statusReads = [];
      const liveStatus = supervisorStatus(generation, [{ delegationId: id, state: 'running' }]);
      const harness = makeRecoveryDeps(modules.store, {
        generations,
        overrides: {
          status: async (input) => {
            statusReads.push(clone(input));
            return liveStatus;
          },
        },
      });
      const controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      assert.strictEqual(restored[0].hydrated, true);
      assert.strictEqual(restored[0].connection, 'disconnected');
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, [id]);
      assert.deepStrictEqual([...harness.heartbeatOwners], [id]);

      const delivered = [];
      controller.subscribe((event) => delivered.push(event));
      assert.deepStrictEqual(delivered, [], 'hydrated history is silent before live reconcile');

      const observed = await controller.reconcile({
        delegationId: id,
        connection: 'connected',
      });
      exactKeys(observed, ['announceSequence', 'snapshot', 'type']);
      assert.strictEqual(observed.announceSequence, null);
      assert.strictEqual(observed.snapshot.connection, 'connected');
      assert.strictEqual(observed.snapshot.state, 'running');
      assert.strictEqual(observed.snapshot.terminal, null);
      exactKeys(observed.snapshot.provider, ['id', 'label']);
      assert.deepStrictEqual(statusReads, [{ delegationId: id }]);
      assert.deepStrictEqual(harness.recoveryCalls.saveGeneration, []);

      await controller.reconcile({ delegationId: id, connection: 'connected' });
      assert.strictEqual(statusReads.length, 2, 'duplicate status observes without replaying work');
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, [id]);
      assert.strictEqual(controller.getSnapshot(id).entries.length, 2);

      const disconnected = await controller.reconcile({
        delegationId: id,
        connection: 'disconnected',
      });
      assert.strictEqual(disconnected.snapshot.connection, 'disconnected');
      assert.strictEqual(disconnected.snapshot.state, 'running');
      assert.strictEqual(disconnected.snapshot.terminal, null);
      assert.strictEqual(statusReads.length, 2, 'disconnected reconciliation sends no status request');
      assert.deepStrictEqual(harness.calls.cancel, []);

      const terminalEntry = await acceptSuccessfulFinal(controller, id, 1720000001000);
      assert.strictEqual(terminalEntry.sequence, 4);
      assert.strictEqual(delivered[delivered.length - 1].announceSequence, 4);
      assert.deepStrictEqual(harness.recoveryCalls.releaseHeartbeat, [id]);
      assert.deepStrictEqual(harness.recoveryCalls.clearGeneration, [id]);
      assert.strictEqual(harness.heartbeatOwners.size, 0);
      assert.strictEqual(generations.has(id), false);

      await controller.reconcile({ delegationId: id, connection: 'connected', status: liveStatus });
      await expectCode(
        controller.acceptEvent(eventInput(id, fixtures.resultEvent, {
          timestamp: 1720000001001,
          state: 'completed',
        })),
        'delegation_already_terminal',
      );
      assert.deepStrictEqual(harness.recoveryCalls.releaseHeartbeat, [id]);
      const envelope = storage.data[`${modules.store.STORAGE_KEY_PREFIX}${id}`];
      assert.strictEqual(envelope.entries.filter((entry) => entry.state === 'completed').length, 1);
    } finally {
      storage.restore();
    }
  });

  await test('restart loss requires both prior generation change and matching explicit disposition', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const ids = {
        pending: 'delegation_generation_change_pending',
        lost: 'delegation_generation_change_lost',
        same: 'delegation_same_generation_disposition',
        malformed: 'delegation_malformed_status_pending',
      };
      const seed = modules.controllerModule.create(makeDeps(modules.store).deps);
      await seed.hydrate();
      for (const id of Object.values(ids)) {
        await seed.start(startInput(id));
        await seed.acceptEvent(eventInput(id, fixtures.initEvent, {
          timestamp: 1720000000000,
          state: 'running',
        }));
      }

      modules = freshModules();
      const oldGeneration = 'generation_before_wake_6106';
      const newGeneration = 'generation_after_wake_6106';
      const generations = new Map(Object.values(ids).map((id) => [id, oldGeneration]));
      const harness = makeRecoveryDeps(modules.store, { generations });
      const controller = modules.controllerModule.create(harness.deps);
      assert.strictEqual((await controller.hydrate()).length, 4);
      assert.strictEqual(harness.heartbeatOwners.size, 4);

      const pending = await controller.reconcile({
        delegationId: ids.pending,
        connection: 'connected',
        status: supervisorStatus(newGeneration),
      });
      assert.strictEqual(pending.snapshot.connection, 'disconnected');
      assert.strictEqual(pending.snapshot.state, 'running');
      assert.strictEqual(pending.snapshot.terminal, null);
      assert.strictEqual(generations.get(ids.pending), oldGeneration);

      const restartLoss = {
        delegationId: ids.lost,
        code: 'daemon_restart_lost_run',
        recoveredAt: 1720000000100,
      };
      const lost = await controller.reconcile({
        delegationId: ids.lost,
        connection: 'connected',
        status: supervisorStatus(newGeneration, [], [restartLoss]),
      });
      assert.strictEqual(lost.code, 'daemon_restart_lost_run');
      assert.strictEqual(lost.snapshot.state, 'restart_lost');
      assert.deepStrictEqual(lost.snapshot.terminal, {
        code: 'daemon_restart_lost_run',
        releasedTabCount: 0,
      });
      assert.strictEqual(harness.heartbeatOwners.has(ids.lost), false);

      const sameGeneration = await controller.reconcile({
        delegationId: ids.same,
        connection: 'connected',
        status: supervisorStatus(oldGeneration, [], [{
          delegationId: ids.same,
          code: 'daemon_restart_lost_run',
          recoveredAt: 1720000000200,
        }]),
      });
      assert.strictEqual(sameGeneration.snapshot.connection, 'disconnected');
      assert.strictEqual(sameGeneration.snapshot.state, 'running');
      assert.strictEqual(sameGeneration.snapshot.terminal, null);

      const malformedWithExtra = {
        ...supervisorStatus(newGeneration, [{
          delegationId: ids.malformed,
          state: 'running',
        }]),
        extra: true,
      };
      const malformed = await controller.reconcile({
        delegationId: ids.malformed,
        connection: 'connected',
        status: malformedWithExtra,
      });
      assert.strictEqual(malformed.snapshot.connection, 'connected');
      assert.strictEqual(malformed.snapshot.state, 'running');
      assert.strictEqual(malformed.snapshot.terminal, null);
      assert.strictEqual(generations.get(ids.malformed), oldGeneration);

      const pendingLoss = await controller.reconcile({
        delegationId: ids.pending,
        connection: 'connected',
        status: supervisorStatus(newGeneration, [], [{
          delegationId: ids.pending,
          code: 'daemon_restart_lost_run',
          recoveredAt: 1720000000300,
        }]),
      });
      assert.strictEqual(pendingLoss.code, 'daemon_restart_lost_run');
      assert.strictEqual(pendingLoss.snapshot.state, 'restart_lost');

      await acceptSuccessfulFinal(controller, ids.same, 1720000000400);
      await acceptSuccessfulFinal(controller, ids.malformed, 1720000000500);
      assert.deepStrictEqual(harness.calls.cancel, [], 'confirmed restart loss never sends cancel');
      assert.strictEqual(harness.heartbeatOwners.size, 0);
      for (const id of Object.values(ids)) {
        assert.strictEqual(
          harness.recoveryCalls.releaseHeartbeat.filter((value) => value === id).length,
          1,
        );
        const envelope = storage.data[`${modules.store.STORAGE_KEY_PREFIX}${id}`];
        assert.strictEqual(envelope.entries.filter((entry) => (
          entry.state === 'restart_lost' || entry.state === 'completed'
        )).length, 1);
      }
    } finally {
      storage.restore();
    }
  });

  await test('same-generation route loss survives worker reload and terminalizes exactly once', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const id = 'delegation_route_loss_wake_exact';
      await seedRunningLedger(modules.store, modules.controllerModule, id);

      modules = freshModules();
      const generation = 'generation_route_loss_wake_6106';
      const generations = new Map([[id, generation]]);
      const harness = makeRecoveryDeps(modules.store, { generations });
      let controller = modules.controllerModule.create(harness.deps);
      const restored = await controller.hydrate();
      assert.strictEqual(restored.length, 1);
      assert.strictEqual(restored[0].terminal, null);

      const routeLoss = {
        delegationId: id,
        code: 'route_lost',
        lostAt: 1720000000100,
      };
      const settled = await controller.reconcile({
        delegationId: id,
        connection: 'connected',
        status: supervisorStatus(generation, [], [], [routeLoss]),
      });
      assert.strictEqual(settled.code, 'route_lost');
      assert.deepStrictEqual(settled.snapshot.terminal, {
        code: 'route_lost',
        releasedTabCount: 0,
      });
      assert.strictEqual(settled.snapshot.state, 'failed');
      assert.deepStrictEqual(harness.calls.cancel, [],
        'daemon route-loss evidence already proves cancellation cleanup');
      assert.deepStrictEqual(harness.recoveryCalls.releaseHeartbeat, [id]);
      assert.deepStrictEqual(harness.recoveryCalls.clearGeneration, [id]);
      const ledger = storage.data[`${modules.store.STORAGE_KEY_PREFIX}${id}`];
      assert.strictEqual(ledger.terminal, true);
      assert.strictEqual(ledger.terminalCode, 'route_lost');
      assert.strictEqual(ledger.entries.filter((entry) => entry.state === 'failed').length, 1);

      await controller.reconcile({
        delegationId: id,
        connection: 'connected',
        status: supervisorStatus(generation, [], [], [routeLoss]),
      });
      assert.strictEqual(ledger.entries.filter((entry) => entry.state === 'failed').length, 1);

      modules = freshModules();
      const reloadedHarness = makeRecoveryDeps(modules.store, { generations });
      controller = modules.controllerModule.create(reloadedHarness.deps);
      assert.deepStrictEqual(await controller.hydrate(), [],
        'terminal route-loss evidence cannot replay or adopt work on the next wake');
      assert.deepStrictEqual(reloadedHarness.calls.cancel, []);
      assert.deepStrictEqual(reloadedHarness.recoveryCalls.retainHeartbeat, []);
    } finally {
      storage.restore();
    }
  });

  await test('route loss is never inferred from absence or mismatched status evidence', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const ids = {
        absent: 'delegation_route_loss_absent',
        mismatch: 'delegation_route_loss_mismatch',
        generation: 'delegation_route_loss_generation',
        active: 'delegation_route_loss_active_overlap',
        malformed: 'delegation_route_loss_malformed',
        unknownGeneration: 'delegation_route_loss_unknown_generation',
      };
      const seed = modules.controllerModule.create(makeDeps(modules.store).deps);
      await seed.hydrate();
      for (const id of Object.values(ids)) {
        await seed.start(startInput(id));
        await seed.acceptEvent(eventInput(id, fixtures.initEvent, {
          timestamp: 1720000000000,
          state: 'running',
        }));
      }

      modules = freshModules();
      const generation = 'generation_route_loss_negative_6106';
      const generations = new Map(Object.values(ids)
        .filter((id) => id !== ids.unknownGeneration)
        .map((id) => [id, generation]));
      const harness = makeRecoveryDeps(modules.store, { generations });
      const controller = modules.controllerModule.create(harness.deps);
      assert.strictEqual((await controller.hydrate()).length, Object.keys(ids).length);

      const evidence = (delegationId) => ({
        delegationId,
        code: 'route_lost',
        lostAt: 1720000000200,
      });
      const cases = [
        [ids.absent, supervisorStatus(generation)],
        [ids.mismatch, supervisorStatus(generation, [], [], [evidence(ids.absent)])],
        [ids.generation, supervisorStatus(
          'generation_route_loss_other_6106',
          [],
          [],
          [evidence(ids.generation)],
        )],
        [ids.active, supervisorStatus(
          generation,
          [{ delegationId: ids.active, state: 'running' }],
          [],
          [evidence(ids.active)],
        )],
        [ids.malformed, {
          ...supervisorStatus(generation),
          routeLosses: [{ ...evidence(ids.malformed), secret: 'must-not-be-accepted' }],
        }],
        [ids.unknownGeneration, supervisorStatus(
          generation,
          [],
          [],
          [evidence(ids.unknownGeneration)],
        )],
      ];
      for (const [id, status] of cases) {
        const observed = await controller.reconcile({
          delegationId: id,
          connection: 'connected',
          status,
        });
        assert.strictEqual(observed.snapshot.terminal, null, `${id} remains nonterminal`);
        assert.strictEqual(observed.snapshot.state, 'running', `${id} remains observational`);
      }
      assert.deepStrictEqual(harness.calls.cancel, []);

      for (const id of Object.values(ids)) {
        await acceptSuccessfulFinal(controller, id, 1720000001000);
      }
    } finally {
      storage.restore();
    }
  });

  await test('wake-held status restores only an exact sealed lease and cancels a mismatch', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const exactId = 'delegation_wake_held_exact';
      const mismatchId = 'delegation_wake_held_mismatch';
      for (const id of [exactId, mismatchId]) {
        await modules.store.appendBeforeFanout(id, fixtures.initEvent, acceptedStoreContext({
          timestamp: 1720000000000,
          state: 'running',
          client: { id: 'claude-code', label: 'Claude Code' },
        }));
        await modules.store.appendBeforeFanout(
          id,
          { type: 'state', sessionId: null, payload: {} },
          acceptedStoreContext({
            timestamp: 1720000000001,
            state: 'held',
            title: 'Delegation held',
            detail: null,
          }),
        );
      }

      modules = freshModules();
      const generation = 'generation_held_wake_6106';
      const agentIds = new Map([
        [exactId, 'agent-wake-exact'],
        [mismatchId, 'agent-wake-mismatch'],
      ]);
      const released = [];
      const ownedTabs = [
        { tabId: 71, ownershipToken: 'sealed-token-71' },
        { tabId: 73, ownershipToken: 'sealed-token-73' },
      ];
      const registry = {
        getAgentForDelegation(delegationId) { return agentIds.get(delegationId) || null; },
        listDelegationMappings() {
          return Array.from(agentIds, ([delegationId, agentId]) => ({ delegationId, agentId }));
        },
        getDelegationHoldLease({ delegationId }) {
          if (delegationId !== exactId) {
            return { ok: false, code: 'resume_ownership_lost' };
          }
          return {
            ok: true,
            code: 'hold_lease_present',
            activeTabId: 71,
            ownedTabs,
            expiresAt: 1720000300000,
          };
        },
        async releaseDelegation({ delegationId }) {
          released.push(delegationId);
          return { ok: true, releasedTabCount: 2 };
        },
      };
      const generations = new Map([
        [exactId, generation],
        [mismatchId, generation],
      ]);
      const harness = makeRecoveryDeps(modules.store, {
        generations,
        overrides: { registry },
      });
      const controller = modules.controllerModule.create(harness.deps);
      assert.strictEqual((await controller.hydrate()).length, 2);
      const status = supervisorStatus(generation, [
        { delegationId: exactId, state: 'held' },
        { delegationId: mismatchId, state: 'held' },
      ]);

      const exact = await controller.reconcile({
        delegationId: exactId,
        connection: 'connected',
        status,
      });
      assert.strictEqual(exact.announceSequence, null);
      assert.strictEqual(exact.snapshot.state, 'held');
      assert.deepStrictEqual(exact.snapshot.hold, {
        tabIds: [71, 73],
        expiresAt: 1720000300000,
      });
      assert.deepStrictEqual(exact.snapshot.activeTab, {
        tabId: 71,
        owned: false,
        canTakeControl: false,
      });
      assert.strictEqual(exact.snapshot.entries.length, 2, 'status observation appends no replay row');

      const mismatch = await controller.reconcile({
        delegationId: mismatchId,
        connection: 'connected',
        status,
      });
      assert.strictEqual(mismatch.code, 'resume_ownership_lost');
      assert.deepStrictEqual(mismatch.snapshot.terminal, {
        code: 'resume_ownership_lost',
        releasedTabCount: 2,
      });
      assert.deepStrictEqual(harness.calls.cancel, [{
        delegationId: mismatchId,
        code: 'resume_ownership_lost',
      }]);
      assert.deepStrictEqual(released, [mismatchId]);
      assert.strictEqual(harness.heartbeatOwners.has(mismatchId), false);

      await acceptSuccessfulFinal(controller, exactId, 1720000001000);
      assert.deepStrictEqual(released, [mismatchId, exactId]);
      assert.strictEqual(harness.heartbeatOwners.size, 0);
    } finally {
      storage.restore();
    }
  });

  await test('wake rejects persisted tab activity without exact registry authority', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const id = 'delegation_wake_missing_registry_authority';
      await modules.store.appendBeforeFanout(id, fixtures.initEvent, acceptedStoreContext({
        timestamp: 1720000000000,
        state: 'running',
        client: { id: 'claude-code', label: 'Claude Code' },
      }));
      await modules.store.appendBeforeFanout(id, fixtures.toolUseEvent, acceptedStoreContext({
        timestamp: 1720000000001,
        state: 'running',
        toolName: 'mcp__fsb__navigate',
        tabId: 71,
      }));

      modules = freshModules();
      const registry = {
        getAgentForDelegation() { return null; },
        listDelegationMappings() { return []; },
        getDelegationReleaseReceipt() { return null; },
      };
      const harness = makeRecoveryDeps(modules.store, {
        overrides: { registry },
      });
      const controller = modules.controllerModule.create(harness.deps);
      await assert.rejects(
        controller.hydrate(),
        (error) => error && error.code === 'delegation_binding_rejected',
        'tab-bearing ledger cannot hydrate after its exact registry mapping disappears',
      );
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, [],
        'rejected authority evidence never retains a heartbeat or starts reconciliation');

      const missingHarness = makeRecoveryDeps(modules.store);
      missingHarness.deps.registry = {};
      const missingController = modules.controllerModule.create(missingHarness.deps);
      await assert.rejects(
        missingController.hydrate(),
        (error) => error && error.code === 'delegation_binding_rejected',
        'nonterminal hydration rejects when the registry read authority is unavailable',
      );
      assert.deepStrictEqual(missingHarness.recoveryCalls.retainHeartbeat, [],
        'missing registry authority installs no recovered heartbeat owner');
    } finally {
      storage.restore();
    }
  });

  await test('every active registry mapping requires one addressable nonterminal ledger', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const missingId = 'delegation_missing_ledger_6104';
      let registry = {
        listDelegationMappings() {
          return [{ delegationId: missingId, agentId: 'agent-missing-ledger' }];
        },
        getDelegationReleaseReceipt() { return null; },
      };
      let harness = makeRecoveryDeps(modules.store, { overrides: { registry } });
      let controller = modules.controllerModule.create(harness.deps);
      await assert.rejects(
        controller.hydrate(),
        (error) => error && error.code === 'delegation_binding_rejected',
        'a registry mapping cannot survive without a nonterminal ledger',
      );
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, []);

      const terminalId = 'delegation_terminal_mapping_6104';
      const seed = await seedRunningLedger(modules.store, modules.controllerModule, terminalId);
      await acceptSuccessfulFinal(seed, terminalId, 1720000001000);
      modules = freshModules();
      registry = {
        listDelegationMappings() {
          return [{ delegationId: terminalId, agentId: 'agent-terminal-mapping' }];
        },
        getDelegationReleaseReceipt() { return null; },
      };
      harness = makeRecoveryDeps(modules.store, { overrides: { registry } });
      controller = modules.controllerModule.create(harness.deps);
      await assert.rejects(
        controller.hydrate(),
        (error) => error && error.code === 'delegation_binding_rejected',
        'a terminal ledger cannot conceal a still-active registry mapping',
      );
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, []);
    } finally {
      storage.restore();
    }
  });

  await test('hydrate rejects persisted ledger ids outside the live server-id grammar', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      await modules.store.appendBeforeFanout('bad.id', fixtures.initEvent, acceptedStoreContext({
        timestamp: 1720000000000,
        state: 'running',
        client: { id: 'claude-code', label: 'Claude Code' },
      }));
      modules = freshModules();
      const harness = makeRecoveryDeps(modules.store);
      const controller = modules.controllerModule.create(harness.deps);
      await assert.rejects(
        controller.hydrate(),
        (error) => error && error.code === 'delegation_ledger_corrupt',
        'unaddressable persisted identity fails before timers or heartbeats',
      );
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, []);
    } finally {
      storage.restore();
    }
  });

  await test('hydrate rejects more persisted active ledgers than the runtime can own', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      for (let index = 0; index < 65; index += 1) {
        const id = `delegation_hydration_cap_${String(index).padStart(2, '0')}`;
        await modules.store.appendBeforeFanout(id, fixtures.initEvent, acceptedStoreContext({
          timestamp: 1720000000000 + index,
          state: 'running',
          client: { id: 'claude-code', label: 'Claude Code' },
        }));
      }

      modules = freshModules();
      const harness = makeRecoveryDeps(modules.store);
      const controller = modules.controllerModule.create(harness.deps);
      await assert.rejects(
        controller.hydrate(),
        (error) => error && error.code === 'delegation_ledger_corrupt',
        'a persisted 65-ledger set fails before allocating active controller state',
      );
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, [],
        'over-limit hydration retains no heartbeat owners');
      assert.strictEqual(harness.heartbeatOwners.size, 0);
    } finally {
      storage.restore();
    }
  });

  await test('terminal ledger or cleared session yields no recovered run or heartbeat owner', async () => {
    const storage = installSessionStorage();
    try {
      let modules = freshModules();
      const terminalId = 'delegation_terminal_while_asleep';
      const seed = await seedRunningLedger(modules.store, modules.controllerModule, terminalId);
      await acceptSuccessfulFinal(seed, terminalId, 1720000001000);

      modules = freshModules();
      let harness = makeRecoveryDeps(modules.store, {
        generations: new Map([[terminalId, 'generation_stale_terminal_6106']]),
      });
      let controller = modules.controllerModule.create(harness.deps);
      assert.deepStrictEqual(await controller.hydrate(), []);
      assert.strictEqual(controller.getSnapshot(terminalId), null);
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, []);
      assert.strictEqual(harness.heartbeatOwners.size, 0);

      storage.clear();
      modules = freshModules();
      harness = makeRecoveryDeps(modules.store);
      controller = modules.controllerModule.create(harness.deps);
      assert.deepStrictEqual(await controller.hydrate(), []);
      assert.strictEqual(controller.getSnapshot(terminalId), null);
      assert.deepStrictEqual(harness.recoveryCalls.retainHeartbeat, []);
      assert.strictEqual(harness.heartbeatOwners.size, 0);
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
