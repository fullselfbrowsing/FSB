'use strict';

const assert = require('assert');
const path = require('path');
const fixtures = require('./fixtures/delegation-events');

const STORE_PATH = path.join(
  __dirname,
  '..',
  'extension',
  'utils',
  'delegation-event-store.js',
);
const CONTROLLER_PATH = path.join(
  __dirname,
  '..',
  'extension',
  'utils',
  'delegation-controller.js',
);
const PROVIDERS_PATH = path.join(
  __dirname,
  '..',
  'extension',
  'utils',
  'delegation-providers.js',
);
const FEED_PATH = path.join(
  __dirname,
  '..',
  'extension',
  'ui',
  'delegation-feed.js',
);
const SAMPLE_COUNTS = [250, 500, 1000];
const MAX_DOUBLING_RATIO = 2.25;
const MAX_1000_READ_BYTES = 16 * 1024 * 1024;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function freshStore() {
  delete require.cache[require.resolve(STORE_PATH)];
  return require(STORE_PATH);
}

class MeasuredSessionStorage {
  constructor(initial = {}) {
    this.data = clone(initial);
    this.readBytes = 0;
    this.writeBytes = 0;
    this.reads = [];
  }

  async get(keys) {
    let out;
    if (keys === null || keys === undefined) {
      out = clone(this.data);
    } else {
      out = {};
      const requested = Array.isArray(keys) ? keys : [keys];
      for (const key of requested) {
        if (Object.hasOwn(this.data, key)) out[key] = clone(this.data[key]);
      }
    }
    this.readBytes += serializedBytes(out);
    this.reads.push(keys === null || keys === undefined ? null : clone(keys));
    return out;
  }

  async set(update) {
    const cloned = clone(update);
    this.writeBytes += serializedBytes(cloned);
    Object.assign(this.data, cloned);
  }

  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
  }

  resetMeasurements() {
    this.readBytes = 0;
    this.writeBytes = 0;
    this.reads = [];
  }
}

async function measureStorage(count, unrelatedBytes = 0) {
  const previousChrome = globalThis.chrome;
  const initial = unrelatedBytes > 0
    ? { unrelatedSessionPayload: 'u'.repeat(unrelatedBytes) }
    : {};
  const session = new MeasuredSessionStorage(initial);
  globalThis.chrome = { storage: { session } };
  try {
    const store = freshStore();
    await store.hydrateNonterminal();
    const discoveryReadBytes = session.readBytes;
    session.resetMeasurements();
    const delegationId = 'delegation_perf_storage';
    for (let index = 0; index < count; index += 1) {
      await store.appendBeforeFanout(
        delegationId,
        fixtures.stateEvent,
        {
          acceptedIdentity: {
            providerId: 'claude-code',
            label: 'Claude Code',
            profileVersion: '2.1.177',
            authState: 'unknown',
            billingKind: 'subscription',
          },
          timestamp: 1720000000000 + index,
          state: 'running',
          title: 'Streaming response',
          detail: null,
        },
      );
    }
    assert.equal(session.reads.includes(null), false,
      'hot appends never rediscover all session storage');
    return {
      discoveryReadBytes,
      hotReadBytes: session.readBytes,
      hotWriteBytes: session.writeBytes,
    };
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
}

async function measureWarmWake(unrelatedBytes = 0) {
  const previousChrome = globalThis.chrome;
  const session = new MeasuredSessionStorage(unrelatedBytes > 0
    ? { unrelatedSessionPayload: 'u'.repeat(unrelatedBytes) }
    : {});
  globalThis.chrome = { storage: { session } };
  try {
    let store = freshStore();
    await store.hydrateNonterminal();
    for (let index = 0; index < 64; index += 1) {
      await store.appendBeforeFanout('delegation_perf_warm_wake', fixtures.stateEvent, {
        acceptedIdentity: {
          providerId: 'claude-code',
          label: 'Claude Code',
          profileVersion: '2.1.177',
          authState: 'unknown',
          billingKind: 'subscription',
        },
        timestamp: 1720000000000 + index,
        state: 'running',
        title: 'Streaming response',
        detail: null,
      });
    }
    store = freshStore();
    session.resetMeasurements();
    const hydrated = await store.hydrateNonterminal();
    assert.equal(hydrated[0].entries.length, 64);
    assert.equal(session.reads.includes(null), false,
      'catalog-backed worker wakes never read unrelated session storage');
    return session.readBytes;
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
}

function assertLinear(samples, field, label) {
  for (let index = 1; index < samples.length; index += 1) {
    const ratio = samples[index][field] / samples[index - 1][field];
    assert(
      ratio < MAX_DOUBLING_RATIO,
      `${label} doubling ratio ${ratio.toFixed(3)} must stay below ${MAX_DOUBLING_RATIO}`,
    );
  }
}

async function measureRuntimePayloads(count) {
  delete require.cache[require.resolve(CONTROLLER_PATH)];
  const controllerModule = require(CONTROLLER_PATH);
  const projectionStore = freshStore();
  const sequences = new Map();
  const fakeStore = {
    async hydrateNonterminal() { return []; },
    async appendBeforeFanout(delegationId, event, context) {
      const sequence = (sequences.get(delegationId) || 0) + 1;
      sequences.set(delegationId, sequence);
      return projectionStore.project(event, {
        ...context,
        delegationId,
        sequence,
      });
    },
    async markCleanupPending() { throw new Error('terminal path is not used'); },
    async markTerminal() { throw new Error('terminal path is not used'); },
  };
  const controller = controllerModule.create({
    eventStore: fakeStore,
    clock: {
      now: () => 1720000000000,
      setTimeout: () => 1,
      clearTimeout() {},
    },
    retainHeartbeat: () => true,
    releaseHeartbeat: () => true,
    registry: {
      listDelegationMappings: () => [],
      getDelegationReleaseReceipt: () => null,
      getAgentForDelegation: () => null,
    },
  });
  await controller.hydrate();
  let payloadBytes = 0;
  let payloadCount = 0;
  let maximumPayloadBytes = 0;
  controller.subscribe((runtimeEvent) => {
    assert.deepStrictEqual(
      Object.keys(runtimeEvent).sort(),
      ['announceSequence', 'entry', 'type', 'view'],
    );
    assert.equal(Object.hasOwn(runtimeEvent.view, 'entries'), false);
    assert.equal(runtimeEvent.view.lastSequence, runtimeEvent.entry.sequence);
    const bytes = serializedBytes(runtimeEvent);
    payloadBytes += bytes;
    payloadCount += 1;
    maximumPayloadBytes = Math.max(maximumPayloadBytes, bytes);
  });
  const delegationId = 'delegation_perf_runtime';
  const acceptedIdentity = {
    providerId: 'claude-code',
    label: 'Claude Code',
    profileVersion: '2.1.177',
    authState: 'unknown',
    billingKind: 'subscription',
  };
  await controller.start({ delegationId, acceptedIdentity });
  for (let index = 1; index < count; index += 1) {
    await controller.acceptEvent({
      delegationId,
      event: fixtures.stateEvent,
      context: {
        timestamp: 1720000000000 + index,
        state: 'running',
        title: 'Streaming response',
        detail: null,
      },
    });
  }
  assert.equal(payloadCount, count);
  assert(maximumPayloadBytes < 16 * 1024,
    'each runtime update remains independently bounded');
  return { payloadBytes, maximumPayloadBytes };
}

let domMutations = 0;

class PerfNode {
  constructor(tagName, text) {
    this.tagName = tagName ? String(tagName).toUpperCase() : null;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.className = '';
    this.open = false;
    this._text = text === undefined ? '' : String(text);
    this._listeners = Object.create(null);
    this.removals = 0;
  }

  appendChild(child) {
    domMutations += 1;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    domMutations += 1;
    this.removals += 1;
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    domMutations += 1;
    this.attributes[name] = String(value);
  }

  addEventListener(type, listener) {
    this._listeners[type] = listener;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  set textContent(value) {
    domMutations += 1;
    this.children = [];
    this._text = String(value);
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }
}

function findFirst(root, tagName) {
  const wanted = String(tagName).toUpperCase();
  if (root.tagName === wanted) return root;
  for (const child of root.children) {
    const found = findFirst(child, wanted);
    if (found) return found;
  }
  return null;
}

function stateEntry(sequence) {
  return {
    v: 1,
    delegationId: 'delegation_perf_dom',
    sequence,
    timestamp: 1720000000000 + sequence,
    kind: 'state',
    state: 'running',
    title: 'Streaming response',
    detail: null,
    init: null,
    tool: null,
    retry: null,
    metrics: null,
  };
}

function measureDomMutations(count) {
  const providers = require(PROVIDERS_PATH);
  globalThis.document = {
    createElement: (tagName) => new PerfNode(tagName),
    createTextNode: (text) => new PerfNode(null, text),
  };
  delete require.cache[require.resolve(FEED_PATH)];
  const feed = require(FEED_PATH);
  const acceptedIdentity = clone(providers.createAcceptedAgentIdentity('claude-code', 'unknown'));
  const firstEntry = {
    v: 1,
    delegationId: 'delegation_perf_dom',
    sequence: 1,
    timestamp: 1720000000001,
    kind: 'tool-call',
    state: 'running',
    title: 'Tool call',
    detail: null,
    init: null,
    tool: {
      callId: 'perf-call-1',
      name: 'mcp__fsb__read_page',
      tabId: 42,
      status: 'running',
      durationMs: null,
    },
    retry: null,
    metrics: null,
  };
  const snapshot = {
    v: 1,
    delegationId: 'delegation_perf_dom',
    acceptedIdentity,
    provider: { id: 'claude-code', label: 'Claude Code' },
    state: 'running',
    connection: 'connected',
    entries: [firstEntry],
    summary: null,
    activeTab: null,
    hold: null,
    terminal: null,
    hydrated: true,
  };
  const container = new PerfNode('div');
  assert.equal(feed.render(container, snapshot, { hydrated: true }).ok, true);
  const firstRow = container.children[0];
  const disclosure = findFirst(container, 'details');
  disclosure.open = true;
  domMutations = 0;
  container.removals = 0;
  for (let sequence = 2; sequence <= count; sequence += 1) {
    const nextEntry = stateEntry(sequence);
    const update = {
      type: 'FSB_DELEGATION_UPDATED',
      view: {
        v: 1,
        delegationId: snapshot.delegationId,
        acceptedIdentity: clone(acceptedIdentity),
        provider: { id: 'claude-code', label: 'Claude Code' },
        state: 'running',
        connection: 'connected',
        lastSequence: sequence,
        summary: null,
        activeTab: null,
        hold: null,
        terminal: null,
      },
      entry: nextEntry,
      announceSequence: sequence,
    };
    const applied = feed.applyRuntimeUpdate(container, snapshot, update);
    assert.equal(applied.ok, true);
    assert.equal(applied.completedRender, false);
  }
  assert.strictEqual(container.children[0], firstRow);
  assert.strictEqual(findFirst(container, 'details'), disclosure);
  assert.equal(disclosure.open, true);
  assert.equal(container.removals, 0, 'normal streaming performs zero feed clears');
  assert.equal(container.children.length, count);
  return { domMutations };
}

(async () => {
  console.log('--- delegation streaming performance regression ---');

  const storageSamples = [];
  for (const count of SAMPLE_COUNTS) storageSamples.push(await measureStorage(count));
  assertLinear(storageSamples, 'hotReadBytes', 'storage read bytes');
  assertLinear(storageSamples, 'hotWriteBytes', 'storage write bytes');
  assert(
    storageSamples[2].hotReadBytes < MAX_1000_READ_BYTES,
    `1,000-event hot reads must stay below ${MAX_1000_READ_BYTES} bytes`,
  );

  const ordinary = await measureStorage(128);
  const withUnrelated = await measureStorage(128, 512 * 1024);
  assert(withUnrelated.discoveryReadBytes - ordinary.discoveryReadBytes >= 512 * 1024,
    'unrelated session data is observed during one legacy discovery');
  assert.equal(withUnrelated.hotReadBytes, ordinary.hotReadBytes,
    'unrelated session data adds zero hot-path read bytes');
  assert.equal(
    await measureWarmWake(512 * 1024),
    await measureWarmWake(),
    'unrelated session data adds zero catalog-backed worker-wake read bytes',
  );

  const runtimeSamples = [];
  for (const count of SAMPLE_COUNTS) runtimeSamples.push(await measureRuntimePayloads(count));
  assertLinear(runtimeSamples, 'payloadBytes', 'runtime payload bytes');

  const domSamples = SAMPLE_COUNTS.map((count) => measureDomMutations(count));
  assertLinear(domSamples, 'domMutations', 'DOM mutations');

  console.log('  storage hot read bytes:', storageSamples.map((row) => row.hotReadBytes).join(', '));
  console.log('  storage hot write bytes:', storageSamples.map((row) => row.hotWriteBytes).join(', '));
  console.log('  runtime payload bytes:', runtimeSamples.map((row) => row.payloadBytes).join(', '));
  console.log('  DOM mutations:', domSamples.map((row) => row.domMutations).join(', '));
  console.log('delegation-streaming-performance: PASS');
})().catch((error) => {
  console.error('delegation-streaming-performance: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
