'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const TAB_ID = 7;
const ORIGIN = 'https://example.com';
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
};

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function event() {
  const listeners = new Set();
  return {
    addListener: listener => listeners.add(listener),
    removeListener: listener => listeners.delete(listener),
    emit: (...args) => [...listeners].forEach(listener => listener(...args))
  };
}

function createHarness({ owned = false, shared = true, enableFails = false, attachFails = false } = {}) {
  let now = 0, nextTimer = 0;
  const timers = new Map(), owners = new Map(), events = [];
  if (owned) owners.set(TAB_ID, 'agent');
  const context = {
    console, URL,
    setTimeout(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    fsbAgentRegistryInstance: { getOwner: tabId => owners.get(tabId) },
    FsbConsentPolicyStore: {
      readPolicies: async () => ({}),
      getConsentForOrigin: () => ({ mode: 'auto' })
    },
    FsbNetworkCaptureRedactor: {
      redactRequest: request => ({ method: request.method, path: new URL(request.url).pathname })
    },
    chrome: {
      debugger: {
        async attach(target) {
          events.push(['attach', target.tabId]);
          if (attachFails) throw new Error('Another debugger is already attached');
        },
        async detach(target) {
          events.push(['detach', target.tabId]);
          context.chrome.debugger.onDetach.emit(target);
        },
        async sendCommand(target, method) {
          events.push([method, target.tabId]);
          if (enableFails && method === 'Network.enable') throw new Error('Network.enable failed');
          return {};
        },
        onDetach: event(), onEvent: event()
      },
      tabs: { onRemoved: event() }
    }
  };
  vm.createContext(context);
  for (const file of ['cdp-lease.js', 'debugger-sessions.js', 'keyboard-emulator.js', 'network-capture.js']) {
    if (file === 'debugger-sessions.js' && !shared) continue;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/utils', file), 'utf8'), context);
  }
  vm.runInContext('globalThis.keyboardEmulator = new KeyboardEmulator();', context);

  async function advance(ms) {
    const until = now + ms;
    await settle();
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
      await settle();
    }
    now = until;
  }

  return {
    context, owners, events, advance,
    capture: context.FsbNetworkCapture,
    sessions: context.FsbDebuggerSessions,
    lease: context.FsbCdpLease,
    keyboard: context.keyboardEmulator,
    count: method => events.filter(([name]) => name === method).length,
    start: options => context.FsbNetworkCapture.startSession(ORIGIN, { tabId: TAB_ID, maxMs: 1000, ...options })
  };
}

for (const ending of ['explicit', 'time-bound', 'count-bound']) {
  test(`discovery releases its temporary debugger after ${ending} completion`, async () => {
    const h = createHarness();
    assert.equal((await h.start({ maxCount: 1 })).ok, true);
    assert.equal(h.keyboard.debuggerAttached, false, 'keyboard never acquired the attachment');
    assert.equal(h.keyboard.isAttachedTo(TAB_ID), true, 'shared attachment is visible to input');
    if (ending === 'explicit') h.capture.endSession('complete');
    else if (ending === 'time-bound') await h.advance(1000);
    else h.capture._onCdpEvent({ tabId: TAB_ID }, 'Network.requestWillBeSent', {
      requestId: 'r1', type: 'XHR', request: { method: 'GET', url: ORIGIN + '/api/items' }
    });
    await settle();
    assert.equal(h.count('detach'), 1);
    assert.equal(h.sessions.isAttachedTo(TAB_ID), false);
    assert.equal(h.lease._queues.size, 0);
    assert.deepEqual(h.events, [['attach', TAB_ID], ['Network.enable', TAB_ID], ['Network.disable', TAB_ID], ['detach', TAB_ID]]);
    if (ending === 'count-bound') assert.equal(h.capture._getLastEndedCalls()[0].path, '/api/items');
  });
}

test('repeated and superseding discovery sessions clean up each attachment', async () => {
  const h = createHarness();
  assert.equal((await h.start()).ok, true);
  assert.equal((await h.start()).ok, true);
  assert.equal(h.count('detach'), 1, 'superseded capture detaches before the next starts');
  h.capture.endSession('complete');
  await settle();
  assert.equal((await h.start()).ok, true);
  h.capture.endSession('complete');
  await settle();
  assert.equal(h.count('attach'), 3);
  assert.equal(h.count('detach'), 3);
  assert.equal(h.sessions.isAttachedTo(TAB_ID), false);
  assert.equal(h.lease._queues.size, 0);
});

test('failed Network.enable releases a temporary debugger and its lease', async () => {
  const h = createHarness({ enableFails: true });
  assert.equal((await h.start()).reason, 'RECIPE_CAPTURE_ENABLE_FAILED');
  assert.equal(h.count('detach'), 1);
  assert.equal(h.sessions.isAttachedTo(TAB_ID), false);
  assert.equal(h.lease._queues.size, 0);
});

for (const enableFails of [false, true]) {
  test(`controlled tabs retain their established debugger after capture ${enableFails ? 'failure' : 'completion'}`, async () => {
    const h = createHarness({ owned: true, enableFails });
    await h.sessions.retain(TAB_ID);
    const result = await h.start();
    assert.equal(result.ok, !enableFails);
    h.capture.endSession('complete');
    await settle();
    assert.equal(h.count('attach'), 1);
    assert.equal(h.count('detach'), 0);
    assert.equal(h.sessions.isReady(TAB_ID), true);
    h.owners.delete(TAB_ID);
    await h.sessions.releaseUnowned();
    assert.equal(h.count('detach'), 1);
    assert.equal(h.sessions.isAttachedTo(TAB_ID), false);
  });
}

test('a foreign debugger is never detached or adopted by discovery', async () => {
  const h = createHarness({ attachFails: true });
  assert.equal((await h.start()).reason, 'RECIPE_CAPTURE_ATTACH_FAILED');
  assert.equal(h.count('attach'), 1);
  assert.equal(h.count('detach'), 0);
  assert.equal(h.sessions.isAttachedTo(TAB_ID), false);
  assert.equal(h.lease._queues.size, 0);
});

test('queued keyboard input starts only after Network.disable and detach settle', async () => {
  const h = createHarness();
  assert.equal((await h.start()).ok, true);
  const disable = deferred(), detach = deferred();
  const originalSend = h.context.chrome.debugger.sendCommand;
  const originalDetach = h.context.chrome.debugger.detach;
  h.context.chrome.debugger.sendCommand = async (target, method, params) => {
    const result = await originalSend(target, method, params);
    if (method === 'Network.disable') await disable.promise;
    return result;
  };
  h.context.chrome.debugger.detach = async target => {
    await detach.promise;
    return originalDetach(target);
  };
  h.capture.endSession('complete');
  const input = h.lease.run(TAB_ID, async () => {
    assert.equal((await h.keyboard.sendKeyEvent(TAB_ID, 'keyDown', 'a', {})).success, true);
    await h.keyboard.detachDebugger(TAB_ID);
  });
  await settle();
  assert.equal(h.count('Input.dispatchKeyEvent'), 0);
  disable.resolve();
  await settle();
  assert.equal(h.count('Input.dispatchKeyEvent'), 0, 'detach still holds the capture lease');
  detach.resolve();
  await input;
  assert.equal(h.count('Input.dispatchKeyEvent'), 1);
  assert.equal(h.count('attach'), 2, 'input establishes a fresh attachment after capture cleanup');
  assert.equal(h.count('detach'), 2);
  assert.equal(h.lease._queues.size, 0);
});

for (const inputHolds of [false, true]) {
  test(`standalone capture ${inputHolds ? 'preserves keyboard ownership' : 'detaches its temporary debugger'}`, async () => {
    const h = createHarness({ shared: false });
    if (inputHolds) await h.keyboard.attachDebugger(TAB_ID);
    assert.equal((await h.start()).ok, true);
    h.capture.endSession('complete');
    await settle();
    assert.equal(h.count('detach'), inputHolds ? 0 : 1);
    assert.equal(h.lease._queues.size, 0);
    if (inputHolds) await h.keyboard.detachDebugger(TAB_ID);
  });
}
