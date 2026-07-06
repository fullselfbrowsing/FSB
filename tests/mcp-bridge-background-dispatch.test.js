'use strict';

/**
 * mcp-bridge-background-dispatch.test.js
 *
 * Covers the same-context dispatch fix for vault/payment MCP tools:
 *
 * mcp-bridge-client.js is evaluated inside the background service worker,
 * and chrome.runtime.sendMessage() never delivers to onMessage listeners in
 * the sender's own context (the Phase 225-01 constraint). background.js now
 * exposes globalThis.fsbDispatchInternalMessage, which invokes its named
 * onMessage handler (fsbHandleRuntimeMessage) directly with a synthetic
 * sender, and _dispatchToBackground prefers it over sendMessage.
 *
 * Part A -- bridge behavior (vm-loaded mcp-bridge-client.js): prefers the
 *   global, falls back to sendMessage when absent, error envelopes, MCP-01
 *   secret strip end-to-end, agent-action deprecation short-circuit.
 * Part B -- wrapper behavior (fsbDispatchInternalMessage extracted from
 *   background.js): sync/async respond, no-response, throw, double-respond,
 *   timeout, synthetic sender shape.
 * Part C -- source-contract pins on background.js and mcp-bridge-client.js.
 *
 * Harness copied from tests/mcp-bridge-client-lifecycle.test.js (repo
 * convention: copy, don't share), extended with a chrome.runtime.sendMessage
 * mock and an optional fsbDispatchInternalMessage context seed.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

function toPlainObject(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// vm-created objects carry a foreign Object.prototype; normalize both sides
// so deep comparison is structural (same approach as the lifecycle test).
function assertDeepEqual(actual, expected, msg) {
  assert(util.isDeepStrictEqual(toPlainObject(actual), toPlainObject(expected)), `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function assertNoSecrets(value, msg) {
  const serialized = JSON.stringify(value || {});
  assert(!/password|cardNumber|cvv|apiKey/i.test(serialized), msg);
}

function createStorageArea(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
      }
      if (typeof keys === 'object') {
        const out = {};
        Object.keys(keys).forEach((key) => {
          out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
        });
        return out;
      }
      return { ...store };
    },
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => {
        delete store[key];
      });
    }
  };
}

function createFakeTimers() {
  const timeouts = [];
  const intervals = [];
  return {
    timeouts,
    intervals,
    setTimeout(fn, delay) {
      const timer = { fn, delay, cleared: false };
      timeouts.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    setInterval(fn, delay) {
      const timer = { fn, delay, cleared: false };
      intervals.push(timer);
      return timer;
    },
    clearInterval(timer) {
      if (timer) timer.cleared = true;
    }
  };
}

function createRuntimeOnMessageMock() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    }
  };
}

function createChromeMock() {
  const session = createStorageArea();
  const local = createStorageArea();
  const alarms = new Map();
  const sendMessageCalls = [];
  const runtime = {
    id: 'dispatch-test-extension',
    onMessage: createRuntimeOnMessageMock(),
    lastError: undefined,
    // Callback-style sendMessage; scenario overrides via _sendMessageImpl.
    sendMessage(request, callback) {
      sendMessageCalls.push(request);
      if (typeof runtime._sendMessageImpl === 'function') {
        runtime._sendMessageImpl(request, callback);
        return;
      }
      if (typeof callback === 'function') callback({});
    },
    _sendMessageImpl: null,
    _sendMessageCalls: sendMessageCalls
  };
  return {
    runtime,
    storage: { session, local },
    alarms: {
      async create(name, options) {
        alarms.set(name, { name, ...options });
      },
      async clear(name) {
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
      }
    }
  };
}

function createFakeWebSocketClass(options = {}) {
  const sockets = [];

  class FakeWebSocket {
    constructor(url) {
      if (options.throwOnConstruct) {
        throw new Error('server unavailable');
      }
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      sockets.push(this);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      if (typeof this.onopen === 'function') this.onopen();
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose();
    }

    send(payload) {
      this.sent.push(payload);
    }
  }

  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  FakeWebSocket._sockets = sockets;
  return FakeWebSocket;
}

function buildClientHarness(options = {}) {
  const chrome = createChromeMock();
  const timers = createFakeTimers();
  const FakeWebSocket = createFakeWebSocketClass(options);
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;

  const context = {
    chrome,
    WebSocket: FakeWebSocket,
    console,
    Math: deterministicMath,
    Date,
    EventTarget,
    CustomEvent,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    dispatchMcpMessageRoute: options.dispatchMcpMessageRoute || (async () => ({ success: true })),
    globalThis: {}
  };
  context.globalThis = context;
  if (typeof options.fsbDispatchInternalMessage === 'function') {
    context.fsbDispatchInternalMessage = options.fsbDispatchInternalMessage;
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  const footer = `
this.__dispatchTest = {
  MCPBridgeClient,
  mcpBridgeClient
};
`;
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });

  return {
    chrome,
    timers,
    context,
    sockets: FakeWebSocket._sockets,
    exports: context.__dispatchTest
  };
}

// ---------------------------------------------------------------------------
// Part A -- bridge behavior
// ---------------------------------------------------------------------------

async function runPrefersInternalDispatchCase() {
  console.log('\n--- A1/A3/A4: _dispatchToBackground prefers globalThis.fsbDispatchInternalMessage ---');

  const dispatchCalls = [];
  let dispatchResult = Promise.resolve({ success: true, credentials: [] });
  const harness = buildClientHarness({
    fsbDispatchInternalMessage(request) {
      dispatchCalls.push(request);
      return dispatchResult;
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const request = { action: 'getAllCredentials' };
  dispatchResult = Promise.resolve({ success: true, credentials: [{ domain: 'example.com', username: 'u' }] });
  const response = await client._dispatchToBackground(request);
  assertEqual(dispatchCalls.length, 1, 'internal dispatch invoked exactly once');
  assertEqual(dispatchCalls[0], request, 'internal dispatch received the exact request object');
  assertEqual(harness.chrome.runtime._sendMessageCalls.length, 0, 'chrome.runtime.sendMessage never called when the global exists');
  assertDeepEqual(response, { success: true, credentials: [{ domain: 'example.com', username: 'u' }] }, 'internal dispatch response passes through unchanged');

  // A3: rejection surfaces as a { success:false, error } envelope, never a throw.
  dispatchResult = Promise.reject(new Error('boom'));
  const rejected = await client._dispatchToBackground({ action: 'getAllPaymentMethods' });
  assertDeepEqual(rejected, { success: false, error: 'boom' }, 'internal dispatch rejection becomes an error envelope');

  // A4: undefined response coerces to {}.
  dispatchResult = Promise.resolve(undefined);
  const empty = await client._dispatchToBackground({ action: 'getFullCredential' });
  assertDeepEqual(empty, {}, 'undefined internal dispatch response coerces to {}');
}

async function runSendMessageFallbackCase() {
  console.log('\n--- A2: _dispatchToBackground falls back to sendMessage when the global is absent ---');

  const harness = buildClientHarness();
  const client = harness.exports.mcpBridgeClient;
  const runtime = harness.chrome.runtime;

  runtime._sendMessageImpl = (request, callback) => {
    callback({ success: true, via: 'sendMessage' });
  };
  const response = await client._dispatchToBackground({ action: 'getAllCredentials' });
  assertEqual(runtime._sendMessageCalls.length, 1, 'fallback path calls chrome.runtime.sendMessage');
  assertDeepEqual(response, { success: true, via: 'sendMessage' }, 'fallback response passes through unchanged');

  // Port-closed shape (pre-fix behavior) still maps to an error envelope.
  runtime._sendMessageImpl = (request, callback) => {
    runtime.lastError = { message: 'The message port closed before a response was received.' };
    callback(undefined);
    runtime.lastError = undefined;
  };
  const portClosed = await client._dispatchToBackground({ action: 'getAllCredentials' });
  assertDeepEqual(
    portClosed,
    { success: false, error: 'The message port closed before a response was received.' },
    'fallback lastError becomes a { success:false, error } envelope'
  );

  // Undefined callback response (no lastError) coerces to {}.
  runtime._sendMessageImpl = (request, callback) => {
    callback(undefined);
  };
  const empty = await client._dispatchToBackground({ action: 'getAllCredentials' });
  assertDeepEqual(empty, {}, 'undefined fallback response coerces to {}');
}

async function runListCredentialsSecretStripCase() {
  console.log('\n--- A5: mcp:list-credentials end-to-end strips secrets (MCP-01) ---');

  const dispatchCalls = [];
  const harness = buildClientHarness({
    fsbDispatchInternalMessage(request) {
      dispatchCalls.push(request);
      return Promise.resolve({
        success: true,
        credentials: [
          { domain: 'example.com', username: 'alice', password: 'hunter2' },
          { domain: 'shop.test', username: 'bob', password: 's3cret' }
        ]
      });
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const result = await client._routeMessage('mcp:list-credentials', {}, 'msg-1');
  assertEqual(dispatchCalls.length, 1, 'list-credentials dispatches once through the internal path');
  assertDeepEqual(dispatchCalls[0], { action: 'getAllCredentials' }, 'list-credentials sends the getAllCredentials action');
  assertEqual(result.success, true, 'list-credentials succeeds via internal dispatch');
  assertDeepEqual(
    result.credentials,
    [
      { domain: 'example.com', username: 'alice' },
      { domain: 'shop.test', username: 'bob' }
    ],
    'credentials reduced to domain + username'
  );
  assertNoSecrets(result, 'list-credentials response contains no password material');
}

async function runAgentActionDeprecationCase() {
  console.log('\n--- A6: agent actions short-circuit with a deprecation envelope ---');

  const dispatchCalls = [];
  const harness = buildClientHarness({
    fsbDispatchInternalMessage(request) {
      dispatchCalls.push(request);
      return Promise.resolve({ success: true });
    }
  });
  const client = harness.exports.mcpBridgeClient;

  const result = await client._routeMessage('mcp:create-agent', { name: 'legacy' }, 'msg-2');
  assertEqual(result.success, false, 'create-agent reports failure');
  assertEqual(result.errorCode, 'agent_management_deprecated', 'create-agent returns the deprecation errorCode');
  assert(/createAgent/.test(result.error || ''), 'deprecation message names the requested action');
  assertEqual(dispatchCalls.length, 0, 'deprecated agent action never dispatches to background');

  const stats = await client._routeMessage('mcp:get-agent-stats', {}, 'msg-3');
  assertEqual(stats.errorCode, 'agent_management_deprecated', 'get-agent-stats returns the deprecation errorCode');
  assertEqual(dispatchCalls.length, 0, 'no agent action reaches the dispatch path');
}

// ---------------------------------------------------------------------------
// Part B -- fsbDispatchInternalMessage wrapper (extracted from background.js)
// ---------------------------------------------------------------------------

function extractWrapperSource(backgroundSource) {
  const anchor = 'function fsbDispatchInternalMessage(request) {';
  const start = backgroundSource.indexOf(anchor);
  if (start === -1) throw new Error('fsbDispatchInternalMessage anchor not found in background.js');
  let depth = 0;
  for (let i = start + anchor.length - 1; i < backgroundSource.length; i++) {
    const ch = backgroundSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return backgroundSource.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced braces while extracting fsbDispatchInternalMessage');
}

function buildWrapperHarness(handlerImpl) {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const wrapperSource = extractWrapperSource(backgroundSource);
  const timers = createFakeTimers();
  const handlerCalls = [];

  const context = {
    chrome: { runtime: { id: 'wrapper-test-extension' } },
    FSB_INTERNAL_DISPATCH_TIMEOUT_MS: 20000,
    fsbHandleRuntimeMessage(request, sender, sendResponse) {
      handlerCalls.push({ request, sender });
      return handlerImpl(request, sender, sendResponse);
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    Promise,
    console
  };
  context.globalThis = context;

  vm.runInNewContext(
    `${wrapperSource}\nthis.__wrapper = fsbDispatchInternalMessage;`,
    context,
    { filename: 'background.js#fsbDispatchInternalMessage' }
  );

  return { dispatch: context.__wrapper, timers, handlerCalls };
}

async function runWrapperBehaviorCases() {
  console.log('\n--- B: fsbDispatchInternalMessage wrapper semantics ---');

  // B1 + B7: synchronous sendResponse resolves; synthetic sender shape.
  {
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      sendResponse({ ok: 1 });
      return undefined;
    });
    const result = await harness.dispatch({ action: 'getAllCredentials' });
    assertDeepEqual(result, { ok: 1 }, 'sync sendResponse resolves the promise');
    assertEqual(harness.handlerCalls.length, 1, 'handler invoked exactly once');
    assertEqual(harness.handlerCalls[0].sender.id, 'wrapper-test-extension', 'synthetic sender.id matches chrome.runtime.id (passes own-extension guard)');
    assertEqual(harness.handlerCalls[0].sender.fsbInternal, 'mcp-bridge', 'synthetic sender is tagged fsbInternal: mcp-bridge');
  }

  // B2: return true + async sendResponse resolves; safety timer cleared.
  {
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      Promise.resolve().then(() => sendResponse({ ok: 2 }));
      return true;
    });
    const result = await harness.dispatch({ action: 'getFullCredential' });
    assertDeepEqual(result, { ok: 2 }, 'async sendResponse (return true) resolves the promise');
    assertEqual(harness.timers.timeouts.length, 1, 'async path arms exactly one safety timer');
    assertEqual(harness.timers.timeouts[0].delay, 20000, 'safety timer uses FSB_INTERNAL_DISPATCH_TIMEOUT_MS');
    assertEqual(harness.timers.timeouts[0].cleared, true, 'safety timer cleared once the handler responds');
  }

  // B3: no response + return !== true mirrors closed-port semantics.
  {
    const harness = buildWrapperHarness(() => undefined);
    const result = await harness.dispatch({ action: 'createAgent' });
    assertEqual(result.success, false, 'no-response handler yields success:false');
    assert(/no response for action: createAgent/.test(result.error || ''), 'no-response envelope names the action');
    assertEqual(harness.timers.timeouts.length, 0, 'no safety timer armed when the handler declines the channel');
  }

  // B4: synchronous handler throw becomes an error envelope.
  {
    const harness = buildWrapperHarness(() => {
      throw new Error('kaboom');
    });
    const result = await harness.dispatch({ action: 'getAllPaymentMethods' });
    assertDeepEqual(result, { success: false, error: 'kaboom' }, 'handler throw becomes { success:false, error }');
  }

  // B5: double sendResponse -- first wins, second dropped.
  {
    const harness = buildWrapperHarness((request, sender, sendResponse) => {
      sendResponse({ first: true });
      sendResponse({ second: true });
      return undefined;
    });
    const result = await harness.dispatch({ action: 'getAllCredentials' });
    assertDeepEqual(result, { first: true }, 'first sendResponse wins; late responses dropped');
  }

  // B6: return true + never respond -> timeout envelope when the timer fires.
  {
    const harness = buildWrapperHarness(() => true);
    const pending = harness.dispatch({ action: 'getFullPaymentMethod' });
    assertEqual(harness.timers.timeouts.length, 1, 'never-responding handler leaves the safety timer armed');
    assertEqual(harness.timers.timeouts[0].cleared, false, 'safety timer not cleared while pending');
    harness.timers.timeouts[0].fn();
    const result = await pending;
    assertEqual(result.success, false, 'timeout yields success:false');
    assert(/timed out after 20000ms for action: getFullPaymentMethod/.test(result.error || ''), 'timeout envelope names the timeout and action');
  }
}

// ---------------------------------------------------------------------------
// Part C -- source-contract pins
// ---------------------------------------------------------------------------

function runSourceContractCase() {
  console.log('\n--- C: source-contract pins ---');

  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const backgroundSnippets = [
    'const fsbHandleRuntimeMessage = (request, sender, sendResponse) => {',
    'chrome.runtime.onMessage.addListener(fsbHandleRuntimeMessage);',
    'function fsbDispatchInternalMessage(request) {',
    'globalThis.fsbDispatchInternalMessage = fsbDispatchInternalMessage;'
  ];
  for (const snippet of backgroundSnippets) {
    assert(backgroundSource.includes(snippet), `background.js includes ${snippet}`);
  }

  const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
  assert(bridgeSource.includes('globalThis.fsbDispatchInternalMessage'), 'mcp-bridge-client.js prefers globalThis.fsbDispatchInternalMessage');
  assert(bridgeSource.includes('agent_management_deprecated'), 'mcp-bridge-client.js carries the agent deprecation errorCode');
  assert(!bridgeSource.includes('fsb-mcp-internal'), 'dead fsb-mcp-internal CustomEvent scaffolding removed');
}

// ---------------------------------------------------------------------------

async function run() {
  await runPrefersInternalDispatchCase();
  await runSendMessageFallbackCase();
  await runListCredentialsSecretStripCase();
  await runAgentActionDeprecationCase();
  await runWrapperBehaviorCases();
  runSourceContractCase();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
