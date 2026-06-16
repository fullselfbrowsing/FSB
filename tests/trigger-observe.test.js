'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS:', label);
  } catch (err) {
    failed++;
    console.error('  FAIL:', label);
    console.error('    ', err && err.message ? err.message : err);
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeNode(opts) {
  opts = opts || {};
  const attrs = Object.assign({}, opts.attrs || {});
  const node = {
    tagName: (opts.tag || 'div').toUpperCase(),
    textContent: opts.text || '',
    value: opts.value || '',
    id: opts.id || '',
    dataset: Object.assign({}, opts.dataset || {}),
    attributes: attrs,
    parentElement: null,
    parentNode: null,
    _isConnected: opts.connected !== false,
    get isConnected() { return this._isConnected; },
    set isConnected(v) { this._isConnected = !!v; },
    getAttribute(name) {
      if (name === 'role' && opts.role) return opts.role;
      if (name === 'data-testid' && opts.testid) return opts.testid;
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    }
  };
  if (opts.parent) {
    node.parentElement = opts.parent;
    node.parentNode = opts.parent;
  }
  return node;
}

const windowListeners = {};
const sendMessages = [];
let timerSeq = 0;
let timers = new Map();
let queryResolver = () => null;
let queryCalls = 0;
let observeCount = 0;
let disconnectCount = 0;
const observerInstances = [];

function resetRuntime() {
  sendMessages.length = 0;
  timers = new Map();
  timerSeq = 0;
  queryCalls = 0;
  observeCount = 0;
  disconnectCount = 0;
  observerInstances.length = 0;
}

function flushTimers() {
  const batch = Array.from(timers.entries());
  timers.clear();
  batch.forEach(([, fn]) => fn());
}

function StubObserver(callback) {
  this.callback = callback;
  this.observeCalls = [];
  this.disconnectCalls = 0;
  observerInstances.push(this);
}
StubObserver.prototype.observe = function(target, options) {
  observeCount++;
  this.observeCalls.push({ target, options });
};
StubObserver.prototype.disconnect = function() {
  disconnectCount++;
  this.disconnectCalls++;
};

const FSB = {
  _modules: {},
  elementCache: new Map(),
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  sanitizeSelector(selector) { return selector; },
  querySelectorWithShadow(selector) {
    queryCalls++;
    return queryResolver(selector);
  }
};

const sandbox = {
  window: {
    FSB,
    __FSB_SKIP_INIT__: false,
    addEventListener(type, fn) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(fn);
    }
  },
  chrome: {
    runtime: {
      sendMessage(payload) {
        sendMessages.push(payload);
        return { catch() {} };
      }
    }
  },
  MutationObserver: StubObserver,
  setTimeout(fn) {
    timerSeq++;
    timers.set(timerSeq, fn);
    return timerSeq;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  module: { exports: {} },
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Date,
  Math,
  Error,
  console
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

const modulePath = path.join(__dirname, '..', 'extension', 'content', 'trigger-observe.js');
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), vm.createContext(sandbox), {
  filename: 'trigger-observe.js'
});

const triggerObserve = sandbox.module.exports;
const messagingPath = path.join(__dirname, '..', 'extension', 'content', 'messaging.js');
const messagingSource = fs.readFileSync(messagingPath, 'utf8');

function triggerReadBlock() {
  const caseIndex = messagingSource.indexOf("case 'triggerRead':");
  assert.notEqual(caseIndex, -1, 'triggerRead case exists in messaging.js');
  const returnIndex = messagingSource.indexOf('return true;', caseIndex);
  assert.notEqual(returnIndex, -1, 'triggerRead case keeps async return true');
  return messagingSource.slice(caseIndex, returnIndex + 'return true;'.length);
}

function invokeWindowEvent(type, event) {
  (windowListeners[type] || []).forEach((fn) => fn(event || {}));
}

console.log('--- Phase 16 Plan 01: trigger-observe content module ---');

check('triggerRead returns ELEMENT_NOT_FOUND before value extraction', () => {
  const block = triggerReadBlock();
  const missingIndex = block.indexOf('ELEMENT_NOT_FOUND');
  const readIndex = block.indexOf('readValue');
  assert.notEqual(missingIndex, -1, 'ELEMENT_NOT_FOUND branch present');
  assert.match(block, /reason\s*:\s*['"]element_not_found['"]/, 'typed element_not_found reason present');
  assert.notEqual(readIndex, -1, 'readValue call still present for successful reads');
  assert.ok(missingIndex < readIndex, 'missing-element branch appears before readValue extraction');
  assert.match(block, /success\s*:\s*true/, 'success path remains typed as success true');
  assert.match(block, /ok\s*:\s*true/, 'success path remains typed as ok true');
});

check('optsFor text/number observes childList + characterData + subtree only', () => {
  assert.deepEqual(plain(triggerObserve.optsFor('text')), { childList: true, characterData: true, subtree: true });
  assert.deepEqual(plain(triggerObserve.optsFor('number')), { childList: true, characterData: true, subtree: true });
});

check('optsFor attribute uses attributeFilter only', () => {
  assert.deepEqual(plain(triggerObserve.optsFor('attribute', 'data-price')), {
    attributes: true,
    attributeFilter: ['data-price']
  });
});

check('readValue emits the locked text and attribute shapes', () => {
  const textNode = makeNode({ text: '  $42  ' });
  assert.deepEqual(plain(triggerObserve.readValue(textNode, 'text')), { text: '$42' });
  const input = makeNode({ tag: 'input', value: '  17  ' });
  assert.deepEqual(plain(triggerObserve.readValue(input, 'number')), { text: '17' });
  const attrNode = makeNode({ attrs: { 'data-price': '  99  ' } });
  assert.deepEqual(plain(triggerObserve.readValue(attrNode, 'attribute', 'data-price')), {
    text: '99',
    attributes: { 'data-price': '99' }
  });
});

check('one mutation burst coalesces to one triggerValueChanged report', () => {
  triggerObserve.disconnectAll();
  resetRuntime();
  const container = makeNode({ id: 'price-card' });
  const leaf = makeNode({ text: '  $12  ', parent: container });
  queryResolver = () => leaf;
  const started = triggerObserve.start('trg_burst', '#price', 'text');
  assert.equal(started.ok, true);
  observerInstances[0].callback([{ type: 'characterData' }]);
  observerInstances[0].callback([{ type: 'childList' }, { type: 'childList' }]);
  assert.equal(sendMessages.length, 0);
  flushTimers();
  assert.equal(sendMessages.length, 1);
  assert.equal(sendMessages[0].action, 'triggerValueChanged');
  assert.equal(sendMessages[0].trigger_id, 'trg_burst');
  assert.deepEqual(plain(sendMessages[0].value), { text: '$12' });
});

check('idempotent start disconnects prior observer before re-observe', () => {
  triggerObserve.disconnectAll();
  resetRuntime();
  const container = makeNode({ role: 'status' });
  const leaf = makeNode({ text: 'one', parent: container });
  queryResolver = () => leaf;
  assert.equal(triggerObserve.start('trg_same', '#same', 'text').ok, true);
  const first = observerInstances[0];
  assert.equal(triggerObserve.start('trg_same', '#same', 'text').ok, true);
  assert.equal(first.disconnectCalls, 1);
  assert.equal(observerInstances.length, 2);
  assert.equal(triggerObserve.registry.size, 1);
});

check('stale armed dataset marker does not block a fresh observer start', () => {
  triggerObserve.disconnectAll();
  resetRuntime();
  const container = makeNode({ role: 'status' });
  const leaf = makeNode({
    text: 'fresh',
    parent: container,
    dataset: { fsbTriggerArmed: 'trg_stale' }
  });
  queryResolver = () => leaf;

  const started = triggerObserve.start('trg_stale', '#stale', 'text');
  assert.equal(started.ok, true);
  assert.equal(started.already, undefined);
  assert.equal(observerInstances.length, 1);
  assert.equal(triggerObserve.registry.size, 1);
});

check('leak test: disconnectAll pairs every observe with disconnect and empties registry', () => {
  triggerObserve.disconnectAll();
  resetRuntime();
  const nodes = {
    '#a': makeNode({ text: 'a', parent: makeNode({ id: 'a-root' }) }),
    '#b': makeNode({ text: 'b', parent: makeNode({ id: 'b-root' }) }),
    '#c': makeNode({ text: 'c', parent: makeNode({ id: 'c-root' }) })
  };
  queryResolver = (selector) => nodes[selector];
  assert.equal(triggerObserve.start('trg_a', '#a', 'text').ok, true);
  assert.equal(triggerObserve.start('trg_b', '#b', 'text').ok, true);
  assert.equal(triggerObserve.start('trg_c', '#c', 'text').ok, true);
  assert.equal(observeCount, 3);
  triggerObserve.disconnectAll();
  assert.equal(disconnectCount, observeCount);
  assert.equal(triggerObserve.registry.size, 0);
});

check('persisted pagehide keeps observers; non-persisted pagehide and beforeunload disconnect', () => {
  triggerObserve.disconnectAll();
  resetRuntime();
  const container = makeNode({ id: 'cache-root' });
  const leaf = makeNode({ text: 'cache', parent: container });
  queryResolver = () => leaf;
  triggerObserve.start('trg_cache', '#cache', 'text');
  invokeWindowEvent('pagehide', { persisted: true });
  assert.equal(disconnectCount, 0);
  assert.equal(triggerObserve.registry.size, 1);
  invokeWindowEvent('pagehide', { persisted: false });
  assert.equal(disconnectCount, 1);
  assert.equal(triggerObserve.registry.size, 0);

  triggerObserve.start('trg_unload', '#cache', 'text');
  invokeWindowEvent('beforeunload', {});
  assert.equal(triggerObserve.registry.size, 0);
  assert.equal(disconnectCount, 2);
});

check('flush re-resolves each batch and retries after a stale disconnected cache hit', () => {
  triggerObserve.disconnectAll();
  resetRuntime();
  const container = makeNode({ id: 'swap-root' });
  const initial = makeNode({ text: 'old', parent: container });
  queryResolver = () => initial;
  assert.equal(triggerObserve.start('trg_swap', '#swap', 'text').ok, true);

  const stale = makeNode({ text: 'stale', parent: container, connected: false });
  const fresh = makeNode({ text: 'fresh', parent: container });
  FSB.elementCache.set('#swap', stale);
  let sequence = [stale, fresh];
  queryCalls = 0;
  queryResolver = () => sequence.shift() || fresh;
  observerInstances[0].callback([{ type: 'childList' }]);
  flushTimers();

  assert.equal(queryCalls, 2);
  assert.equal(sendMessages.length, 1);
  assert.deepEqual(plain(sendMessages[0].value), { text: 'fresh' });
});

check('source invariants: setTimeout debounce, no rAF, no document.body target', () => {
  const src = fs.readFileSync(modulePath, 'utf8');
  assert(src.includes('setTimeout'), 'setTimeout debounce present');
  assert(!src.includes('requestAnimationFrame'), 'requestAnimationFrame absent');
  assert(!/\.observe\(document\.body/.test(src), 'document.body is not the observe target');
  assert(src.includes('if (!e.persisted) disconnectAll();'), 'BF-cache persisted pagehide keeps observers');
});

console.log('\n--- trigger-observe summary ---');
console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
