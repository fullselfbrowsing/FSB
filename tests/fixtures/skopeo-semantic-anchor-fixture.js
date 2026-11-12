'use strict';

const assert = require('node:assert/strict');
const {
  SkopeoResourceLedger,
  assertExactZero
} = require('../helpers/skopeo-resource-ledger.js');

// The same object deliberately follows the virtualization transition file-A -> file-B -> file-A.
const ABA_TRANSITION = Object.freeze(['file-A', 'file-B', 'file-A']);

class FixtureEventTarget {
  constructor(label) {
    this.label = label;
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    if (typeof listener !== 'function') return;
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, capture: normalizeCapture(options) });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener, options) {
    const capture = normalizeCapture(options);
    const entries = this.listeners.get(type) || [];
    const index = entries.findIndex(entry => entry.listener === listener && entry.capture === capture);
    if (index >= 0) entries.splice(index, 1);
    this.listeners.set(type, entries);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== 'string') throw new TypeError('fixture event.type is required');
    event.target = event.target || this;
    event.currentTarget = this;
    for (const entry of (this.listeners.get(event.type) || []).slice()) {
      entry.listener.call(this, event);
    }
    return true;
  }

  listenerCount() {
    let count = 0;
    for (const entries of this.listeners.values()) count += entries.length;
    return count;
  }
}

function normalizeCapture(options) {
  return options === true || !!(options && options.capture);
}

class ManualFrameQueue {
  constructor(record) {
    this.record = record;
    this.nextId = 1;
    this.frames = new Map();
    this.now = 1000;
  }

  request(callback) {
    if (typeof callback !== 'function') throw new TypeError('frame callback is required');
    const id = this.nextId++;
    this.frames.set(id, callback);
    this.record('frame-request', { frameId: id });
    return id;
  }

  cancel(id) {
    if (!this.frames.delete(id)) return false;
    this.record('frame-cancel', { frameId: id });
    return true;
  }

  drainOne() {
    const first = this.frames.entries().next();
    if (first.done) return false;
    const [id, callback] = first.value;
    this.frames.delete(id);
    this.now += 16;
    this.record('frame-drain', { frameId: id });
    callback(this.now);
    return true;
  }

  drainAll(limit = 32) {
    let drained = 0;
    while (this.frames.size && drained < limit) {
      this.drainOne();
      drained += 1;
    }
    if (this.frames.size) throw new Error('manual frame queue exceeded drain bound');
    return drained;
  }

  get size() {
    return this.frames.size;
  }
}

function rect(input = {}) {
  const left = Number(input.left ?? 100);
  const top = Number(input.top ?? 100);
  const width = Number(input.width ?? 120);
  const height = Number(input.height ?? 32);
  return Object.freeze({
    left,
    top,
    width,
    height,
    right: Number(input.right ?? left + width),
    bottom: Number(input.bottom ?? top + height),
    x: Number(input.x ?? left),
    y: Number(input.y ?? top)
  });
}

function semanticIdentity(kind, id) {
  return Object.freeze({ kind, id });
}

function createDeferred(label, record) {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const handle = {
    label,
    state: 'pending',
    promise,
    settle(value) {
      if (this.state !== 'pending') throw new Error(`${label} is already ${this.state}`);
      this.state = 'settled';
      record('resolver-settle', { label });
      resolvePromise(value);
    },
    reject(error = new Error(`${label} rejected`)) {
      if (this.state !== 'pending') throw new Error(`${label} is already ${this.state}`);
      this.state = 'rejected';
      record('resolver-reject', { label });
      rejectPromise(error);
    }
  };
  return handle;
}

function createSemanticAnchorFixture(options = {}) {
  const events = [];
  let sequence = 0;
  let rowRect = rect(options.rect);
  let connected = true;
  let semanticId = 'file-A';
  let order = 0;
  const resolverHandles = [];
  const observerInstances = [];
  const ledger = options.resourceLedger || new SkopeoResourceLedger('semantic-anchor-fixture');

  function record(type, detail = {}) {
    const event = Object.freeze({ sequence: ++sequence, type, ...detail });
    events.push(event);
    return event;
  }

  const frames = new ManualFrameQueue(record);
  const window = new FixtureEventTarget('window');
  const visualViewport = new FixtureEventTarget('visualViewport');
  window.innerWidth = Number(options.width || 1024);
  window.innerHeight = Number(options.height || 768);
  window.visualViewport = visualViewport;
  window.requestAnimationFrame = frames.request.bind(frames);
  window.cancelAnimationFrame = frames.cancel.bind(frames);
  window.performance = { now: () => frames.now };

  const document = {
    defaultView: window,
    body: Object.freeze({ fixtureBody: true })
  };
  window.document = document;

  const row = {
    nodeType: 1,
    ownerDocument: document,
    get semanticId() { return semanticId; },
    get fixtureOrder() { return order; },
    get isConnected() { return connected; },
    getBoundingClientRect() { return rowRect; },
    contains(candidate) { return candidate === row; }
  };

  const range = {
    __fixtureRange: true,
    get startContainer() { return row; },
    get endContainer() { return row; },
    get commonAncestorContainer() { return row; },
    get collapsed() { return false; },
    getBoundingClientRect() { return rowRect; }
  };

  const observationRoot = {
    nodeType: 1,
    fixtureRoot: true,
    get isConnected() { return true; },
    contains(target) {
      return target === row || target === range || (target && target.target === row);
    }
  };

  class FixtureMutationObserver {
    constructor(callback) {
      if (typeof callback !== 'function') throw new TypeError('MutationObserver callback is required');
      this.callback = callback;
      this.connected = false;
      this.root = null;
      observerInstances.push(this);
    }
    observe(rootTarget) {
      this.connected = true;
      this.root = rootTarget;
      record('observer-observe', { narrowRoot: rootTarget === observationRoot });
    }
    disconnect() {
      this.connected = false;
      record('observer-disconnect');
    }
    trigger(records = [{ type: 'attributes', target: row }]) {
      if (!this.connected) return false;
      record('observer-trigger');
      this.callback(records, this);
      return true;
    }
  }
  window.MutationObserver = FixtureMutationObserver;

  const authority = {
    generation: Number(options.generation || 1),
    contextEpoch: Number(options.contextEpoch || 1),
    semanticIdentity: semanticIdentity('drive-file', 'file-A'),
    bindingEpoch: null
  };

  function candidateForRow(candidateOptions = {}) {
    const useRange = candidateOptions.range === true;
    return Object.freeze({
      kind: useRange ? 'range' : 'node',
      target: useRange ? range : row,
      claimedIdentity: semanticIdentity(
        candidateOptions.identityKind || 'drive-file',
        candidateOptions.claimedId || semanticId
      )
    });
  }

  function targetFor(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    return candidate.kind === 'range' ? candidate.target.commonAncestorContainer : candidate.target;
  }

  function resolveCandidates(locatorRecords, request) {
    const locatorSnapshot = Array.from(locatorRecords || [], locator => Object.freeze({ ...locator }));
    const label = `resolver-${resolverHandles.length + 1}`;
    record('resolve', {
      label,
      locatorCount: locatorSnapshot.length,
      anchorId: request && request.anchorId,
      bindingEpoch: request && request.bindingEpoch
    });
    const handle = createDeferred(label, record);
    handle.locators = Object.freeze(locatorSnapshot);
    handle.request = request;
    resolverHandles.push(handle);
    return handle.promise;
  }

  function validateCandidate(candidate, descriptor, request) {
    const target = targetFor(candidate);
    const liveId = target && target.semanticId;
    const proof = Object.freeze({
      semanticIdentity: semanticIdentity(
        descriptor && descriptor.semanticIdentity && descriptor.semanticIdentity.kind || 'drive-file',
        liveId || ''
      )
    });
    record('validate', {
      anchorId: descriptor && descriptor.anchorId,
      liveId,
      bindingEpoch: request && request.bindingEpoch
    });
    return proof;
  }

  function isCurrent(tuple) {
    const matches = !!tuple &&
      tuple.generation === authority.generation &&
      tuple.contextEpoch === authority.contextEpoch &&
      tuple.semanticIdentity &&
      tuple.semanticIdentity.kind === authority.semanticIdentity.kind &&
      tuple.semanticIdentity.id === authority.semanticIdentity.id &&
      (authority.bindingEpoch === null || tuple.bindingEpoch === authority.bindingEpoch);
    record('is-current', { result: matches, bindingEpoch: tuple && tuple.bindingEpoch });
    return matches;
  }

  function onWithdraw(payload) {
    record('withdraw', payload || {});
  }

  function onCommit(payload) {
    record('commit', payload || {});
  }

  const abortController = new AbortController();

  const fixture = {
    ABA_TRANSITION,
    events,
    ledger,
    frames,
    window,
    document,
    visualViewport,
    observationRoot,
    row,
    range,
    authority,
    abortController,
    resolverHandles,
    observerInstances,
    candidateForRow,
    createRegistryOptions(overrides = {}) {
      return {
        generation: authority.generation,
        signal: abortController.signal,
        window,
        document,
        observationRoot,
        resourceLedger: ledger,
        resolveCandidates,
        validateCandidate,
        isCurrent,
        onWithdraw,
        onCommit,
        ...overrides
      };
    },
    setAuthority(next = {}) {
      if (Object.prototype.hasOwnProperty.call(next, 'generation')) authority.generation = next.generation;
      if (Object.prototype.hasOwnProperty.call(next, 'contextEpoch')) authority.contextEpoch = next.contextEpoch;
      if (Object.prototype.hasOwnProperty.call(next, 'semanticIdentity')) {
        authority.semanticIdentity = semanticIdentity(next.semanticIdentity.kind, next.semanticIdentity.id);
      }
      if (Object.prototype.hasOwnProperty.call(next, 'bindingEpoch')) authority.bindingEpoch = next.bindingEpoch;
      record('authority-change', { ...next });
    },
    reuseAs(nextId, signalKind = null) {
      semanticId = String(nextId);
      record('row-reuse', { semanticId });
      if (signalKind) this.dispatchSignal(signalKind);
      return row;
    },
    negativeControlReuse(nextId) {
      semanticId = String(nextId);
      record('negative-control', { semanticId, signalDispatched: false });
      return row;
    },
    detach(signalKind = null) {
      connected = false;
      record('row-detach');
      if (signalKind) this.dispatchSignal(signalKind);
    },
    reattach(signalKind = null) {
      connected = true;
      record('row-reattach');
      if (signalKind) this.dispatchSignal(signalKind);
    },
    reorder(nextOrder, signalKind = null) {
      order = Number(nextOrder);
      record('row-reorder', { order });
      if (signalKind) this.dispatchSignal(signalKind);
    },
    setRect(nextRect, signalKind = null) {
      rowRect = rect(nextRect);
      record('rect-change', { rect: rowRect });
      if (signalKind) this.dispatchSignal(signalKind);
    },
    dispatchSignal(kind) {
      if (kind === 'mutation') {
        const observer = observerInstances.find(instance => instance.connected);
        if (observer) return observer.trigger();
        return false;
      }
      if (kind === 'scroll' || kind === 'resize') {
        window.dispatchEvent({ type: kind });
        return true;
      }
      if (kind === 'zoom') {
        visualViewport.dispatchEvent({ type: 'resize' });
        return true;
      }
      if (kind === 'navigation') {
        window.dispatchEvent({ type: 'popstate' });
        return true;
      }
      throw new TypeError(`unknown fixture signal: ${String(kind)}`);
    },
    clearEvents() { events.length = 0; },
    eventTypes() { return events.map(event => event.type); },
    latest(type) { return events.filter(event => event.type === type).at(-1) || null; },
    async flushAsync(turns = 8) {
      for (let index = 0; index < turns; index += 1) await Promise.resolve();
    }
  };

  return fixture;
}

async function runFixtureSelfTest() {
  const fixture = createSemanticAnchorFixture();
  assert.deepEqual(ABA_TRANSITION, ['file-A', 'file-B', 'file-A']);
  assert.equal(fixture.row.semanticId, 'file-A');
  const rowIdentity = fixture.row;
  fixture.negativeControlReuse('file-B');
  assert.strictEqual(fixture.row, rowIdentity, 'virtualization preserves object identity');
  assert.equal(fixture.row.semanticId, 'file-B');
  assert.equal(fixture.frames.size, 0, 'negative control dispatches no scheduling signal');
  fixture.reuseAs('file-A');
  assert.strictEqual(fixture.row, rowIdentity, 'ABA returns through the same object');

  const first = fixture.frames.request(() => fixture.events.push({ type: 'manual-callback' }));
  const second = fixture.frames.request(() => fixture.events.push({ type: 'manual-callback-2' }));
  assert.equal(fixture.frames.size, 2, 'manual frame queue is visibly drainable');
  fixture.frames.cancel(first);
  assert.equal(fixture.frames.drainOne(), true);
  assert.equal(fixture.frames.size, 0);
  assert.ok(second > first);

  const pending = fixture.createRegistryOptions().resolveCandidates(
    [{ kind: 'drive-item-id', value: 'file-A' }],
    { anchorId: 'fixture-anchor', bindingEpoch: 1 }
  );
  fixture.resolverHandles[0].settle([fixture.candidateForRow()]);
  const candidates = await pending;
  assert.strictEqual(candidates[0].target, fixture.row, 'deferred resolver returns the live row only when settled');
  assertExactZero(fixture.ledger.snapshot(), 'fixture self-test owns no ledger resources by itself');
  console.log('skopeo-semantic-anchor fixture self-test: PASS');
}

module.exports = {
  ABA_TRANSITION,
  FixtureEventTarget,
  ManualFrameQueue,
  rect,
  semanticIdentity,
  createDeferred,
  createSemanticAnchorFixture,
  runFixtureSelfTest
};

if (require.main === module) {
  runFixtureSelfTest().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
