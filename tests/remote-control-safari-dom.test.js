/**
 * Dashboard remote control on Safari: every input is driven through the
 * content script's DOM fallbacks, never the debugger.
 *
 * ws-client.js runs in a vm with a fake chrome.tabs / chrome.scripting, and a
 * globalThis.FsbPlatform stub shaped like the Safari build's. The assertions
 * are on the messages the real handlers send, so they cover the mapping from
 * dashboard payloads to content verbs, the keep-the-session-on-a-miss policy,
 * and the inject-and-retry path for a tab without the content script.
 *
 * Without FsbPlatform (Chrome), the same handlers must still take the CDP path.
 *
 * Run: node tests/remote-control-safari-dom.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'ws-client.js'), 'utf8');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  passAssert(ok, msg + (ok ? '' : ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'));
}

const SAFARI = { id: 'safari', caps: { cdp: false, trustedInput: false, sidePanel: false } };
const TAB = 5;

/**
 * @param {Object} opts
 * @param {Object|null} opts.platform - FsbPlatform stub, or null for Chrome
 * @param {Function} [opts.onAction] - (message, callIndex) => content result, or throws
 * @param {Function} [opts.onInject] - called for scripting.executeScript; may throw
 */
function createHarness({ platform, onAction, onInject }) {
  const actions = [];
  const injections = [];
  const cdpCalls = [];
  const wsSent = [];
  const context = {
    console: { log() {}, warn() {}, error() {} },
    URL, Set, Date, Promise, Math, JSON, Object, Array, Number, String, Error,
    setTimeout, clearTimeout,
    WebSocket: function WebSocket() {},
    executeCDPToolDirect: async (call, tabId) => {
      cdpCalls.push({ tool: call.tool, tabId });
      return { success: true };
    },
    chrome: {
      runtime: { lastError: null, sendMessage() {} },
      tabs: {
        sendMessage(tabId, message, options, callback) {
          if (typeof callback === 'function') {
            // _waitForContentScriptReady's readiness ping.
            callback({ ready: true });
            return undefined;
          }
          actions.push({ tabId, message, options });
          try {
            return Promise.resolve(onAction ? onAction(message, actions.length - 1) : { success: true });
          } catch (err) {
            return Promise.reject(err);
          }
        }
      },
      scripting: {
        async executeScript(details) {
          injections.push(details);
          if (onInject) onInject(details);
          return [];
        }
      }
    }
  };
  if (platform) context.FsbPlatform = platform;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(WS_SRC + `
globalThis.__rc = {
  click: handleRemoteClick,
  key: handleRemoteKey,
  scroll: handleRemoteScroll,
  start(tabId) { _remoteControlActive = true; _streamingTabId = tabId; },
  active() { return _remoteControlActive; },
  failures() { return getFSBTransportDiagnostics().forwardFailures; }
};
`, context);
  context.__fsbWsInstance = { send(type, payload) { wsSent.push({ type, payload }); }, serverHashKey: 'k' };
  context.__rc.start(TAB);
  return { rc: context.__rc, actions, injections, cdpCalls, wsSent };
}

function sentStates(h) {
  return h.wsSent.filter((m) => m.type === 'ext:remote-control-state').map((m) => m.payload);
}

(async function run() {
  console.log('\n=== 1. each dashboard input maps to its DOM verb ===');
  {
    const h = createHarness({ platform: SAFARI });
    // Dashboard modifier bitmask: alt=1, ctrl=2, meta=4, shift=8.
    await h.rc.click({ x: 10, y: 20, button: 'left', modifiers: 4 | 8 });
    await h.rc.key({ type: 'insertText', key: 'a', code: 'KeyA', text: 'a', modifiers: 0 });
    await h.rc.key({ type: 'keyDown', key: 'Backspace', code: 'Backspace', text: '', modifiers: 2 });
    await h.rc.key({ type: 'keyUp', key: 'Backspace', code: 'Backspace', text: '', modifiers: 2 });
    await h.rc.scroll({ x: 1, y: 2, deltaY: 100 });

    passAssertEqual(h.actions.map((a) => a.message.tool),
      ['pointerClickAt', 'domInsertTextAt', 'domKeyPress', 'wheelScrollAt'],
      'click, text, keyDown and scroll each send one content verb; keyUp sends none');
    passAssertEqual(h.actions[0].message.params,
      { x: 10, y: 20, altKey: false, ctrlKey: false, metaKey: true, shiftKey: true },
      'click decodes the modifier bitmask, including meta');
    passAssertEqual(h.actions[1].message.params, { text: 'a', clearFirst: false },
      'text is inserted at the focus without clearing the field');
    passAssertEqual(h.actions[2].message.params,
      { key: 'Backspace', code: 'Backspace', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false },
      'keyDown carries key, code and modifiers');
    passAssertEqual(h.actions[3].message.params, { x: 1, y: 2, deltaX: 0, deltaY: 100 },
      'scroll fills a missing delta with 0');
    passAssert(h.actions.every((a) => a.message.action === 'executeAction' && a.tabId === TAB),
      'every verb goes to the remote-control tab as executeAction');
    passAssert(h.actions.every((a) => a.options && a.options.frameId === 0),
      'every verb targets the top frame only');
    passAssertEqual(h.cdpCalls.length, 0, 'the debugger path is never reached');
    passAssert(h.rc.active(), 'the session stays active');
  }

  console.log('\n=== 2. a miss on the page keeps the session ===');
  {
    const h = createHarness({
      platform: SAFARI,
      onAction: () => ({ success: false, error: 'No element at (10, 20)' })
    });
    await h.rc.click({ x: 10, y: 20, modifiers: 0 });
    passAssert(h.rc.active(), 'still active after "No element at"');
    passAssertEqual(sentStates(h).length, 0, 'no state change is broadcast to the dashboard');
    const last = h.rc.failures().slice(-1)[0] || {};
    passAssertEqual(last.event, 'remote-control-dispatch-missed', 'the miss is recorded locally');
    passAssert(/No element at/.test(last.error || ''), 'with the content script\'s reason');
  }

  console.log('\n=== 3. a tab without the content script gets it injected, then the verb is retried ===');
  {
    const h = createHarness({
      platform: SAFARI,
      onAction: (_message, index) => {
        if (index === 0) throw new Error('Could not establish connection. Receiving end does not exist.');
        return { success: true };
      }
    });
    await h.rc.click({ x: 10, y: 20, modifiers: 0 });
    passAssertEqual(h.injections.length, 1, 'content scripts injected once');
    passAssertEqual(h.injections[0].target, { tabId: TAB, allFrames: false }, 'into the top frame of the remote-control tab');
    passAssert(Array.isArray(h.injections[0].files) && h.injections[0].files.includes('content/actions.js'),
      'with the content script file list');
    passAssertEqual(h.actions.map((a) => a.message.tool), ['pointerClickAt', 'pointerClickAt'],
      'the verb is sent again after injection');
    passAssert(h.rc.active(), 'the session stays active');
  }

  console.log('\n=== 4. a tab that cannot be reached ends the session with retarget-required ===');
  {
    const h = createHarness({
      platform: SAFARI,
      onAction: () => { throw new Error('Could not establish connection. Receiving end does not exist.'); },
      onInject: () => { throw new Error('No tab with id: 5'); }
    });
    await h.rc.key({ type: 'insertText', key: 'a', text: 'a', modifiers: 0 });
    passAssert(!h.rc.active(), 'the session is ended');
    const states = sentStates(h);
    passAssertEqual(states.length, 1, 'one state change is broadcast');
    passAssertEqual(states[0] && { enabled: states[0].enabled, reason: states[0].reason },
      { enabled: false, reason: 'retarget-required' },
      'retarget-required, not debugger-blocked');
  }

  console.log('\n=== 5. Chrome (no FsbPlatform) keeps the CDP path ===');
  {
    const h = createHarness({ platform: null });
    await h.rc.click({ x: 10, y: 20, modifiers: 0 });
    await h.rc.scroll({ x: 1, y: 2, deltaY: 100 });
    passAssertEqual(h.cdpCalls.map((c) => c.tool), ['cdpClickAt', 'cdpScrollAt'],
      'click and scroll go to executeCDPToolDirect');
    passAssertEqual(h.actions.length, 0, 'no DOM verb is sent');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
