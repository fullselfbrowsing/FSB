/**
 * Tests the CDP -> DOM route flip in extension/ai/tool-executor.js.
 *
 * On Safari the seven _route:'cdp' tools have no trusted-input path. Rather
 * than hard-fail, executeCdpTool re-routes them to the DOM equivalents in
 * content/actions.js. Three properties matter:
 *
 *   1. CHROME REGRESSION GUARD -- with FsbPlatform absent (Chrome, and every
 *      Node harness) the cdpHandler must still be called. This is the assertion
 *      that proves the Safari work did not change Chrome behaviour.
 *   2. The shared tool-registry object must NOT be mutated: tool-definitions
 *      is pinned by SHA-256 in tests/tool-definitions-parity.test.js.
 *   3. Every _cdpVerb must map to a DOM verb that actually exists in
 *      content/actions.js -- a typo here would silently dead-end a tool --
 *      or be declared in CDP_NO_DOM_FALLBACK and fail with a typed error.
 *
 * Run: node tests/cdp-degradation-routing.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

const ROOT = path.join(__dirname, '..');
const ACTIONS_SRC = fs.readFileSync(path.join(ROOT, 'extension', 'content', 'actions.js'), 'utf8');

// Load the adapter into a synthetic safari-like scope to read its real map.
function loadAdapter(forced) {
  const scope = { __FSB_FORCE_PLATFORM__: forced, chrome: { runtime: {} }, console: { log() {} } };
  const src = fs.readFileSync(path.join(ROOT, 'extension', 'utils', 'platform-adapter.js'), 'utf8');
  new Function('globalThis', 'self', 'module', src)(scope, scope, undefined);
  return scope.FsbPlatform;
}

const defs = require('../extension/ai/tool-definitions.js');

function withPlatform(platform, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'FsbPlatform');
  const prev = globalThis.FsbPlatform;
  if (platform === undefined) delete globalThis.FsbPlatform;
  else globalThis.FsbPlatform = platform;
  try { return fn(); } finally {
    if (had) globalThis.FsbPlatform = prev; else delete globalThis.FsbPlatform;
  }
}

(async function run() {
  // chrome.tabs.sendMessage stub shared by the content route
  const sent = [];
  globalThis.chrome = {
    tabs: { sendMessage: async (tabId, msg) => { sent.push({ tabId, msg }); return { success: true, ok: 1 }; } },
    runtime: {}
  };

  const { executeTool } = require('../extension/ai/tool-executor.js');
  const safariPlatform = loadAdapter('safari');

  console.log('\n=== 1. CHROME REGRESSION GUARD: no FsbPlatform -> cdpHandler still used ===');
  await withPlatform(undefined, async () => {
    let calledWith = null;
    const res = await executeTool('click_at', { x: 1, y: 2 }, 7, {
      cdpHandler: async (verb, params, tabId) => { calledWith = { verb, params, tabId }; return { success: true }; }
    });
    passAssert(calledWith !== null, 'cdpHandler WAS called on Chrome');
    passAssertEqual(calledWith && calledWith.verb, 'cdpClickAt', 'received the CDP verb');
    passAssertEqual(calledWith && calledWith.tabId, 7, 'received the tabId');
    passAssert(res.success === true, 'result succeeds');
  });
  const sentDuringChrome = sent.length;
  passAssertEqual(sentDuringChrome, 0, 'Chrome path sent ZERO content-script messages');

  console.log('\n=== 2. Safari: routes to the mapped DOM verb ===');
  await withPlatform(safariPlatform, async () => {
    sent.length = 0;
    let cdpCalled = false;
    const res = await executeTool('click_at', { x: 3, y: 4 }, 9, {
      cdpHandler: async () => { cdpCalled = true; return { success: true }; }
    });
    passAssert(!cdpCalled, 'cdpHandler NOT called on Safari');
    passAssertEqual(sent.length, 1, 'exactly one content-script dispatch');
    passAssertEqual(sent[0].msg.action, 'executeAction', 'dispatched via executeAction');
    passAssertEqual(sent[0].msg.tool, 'pointerClickAt', 'mapped to the DOM verb');
    passAssertEqual(sent[0].tabId, 9, 'preserved the tabId');
    passAssertEqual(JSON.stringify(sent[0].msg.params), JSON.stringify({ x: 3, y: 4 }), 'params passed through');
    passAssert(res.success === true, 'result succeeds');
  });

  console.log('\n=== 3. Safari path works with NO cdpHandler at all ===');
  await withPlatform(safariPlatform, async () => {
    sent.length = 0;
    const res = await executeTool('drag', { startX: 0, startY: 0, endX: 5, endY: 5 }, 2, {});
    passAssert(res.success === true, 'succeeds without a cdpHandler (Safari never has one)');
    passAssertEqual(sent[0].msg.tool, 'pointerDrag', 'drag -> pointerDrag');
  });

  console.log('\n=== 4. unmapped CDP verb -> typed capability_unavailable ===');
  await withPlatform(safariPlatform, async () => {
    const stripped = Object.assign(Object.create(Object.getPrototypeOf(safariPlatform)), safariPlatform, {
      CDP_DOM_FALLBACKS: {}
    });
    await withPlatform(stripped, async () => {
      sent.length = 0;
      const res = await executeTool('click_at', { x: 1, y: 1 }, 1, {});
      passAssert(res.success === false, 'fails');
      passAssert(/capability_unavailable/.test(res.error), 'error is typed capability_unavailable');
      passAssert(/click_at/.test(res.error), 'error names the tool');
      passAssertEqual(sent.length, 0, 'no content dispatch for an unmapped verb');
    });
  });

  console.log('\n=== 4b. capture_screenshot has no DOM fallback -> capability_unavailable ===');
  await withPlatform(safariPlatform, async () => {
    sent.length = 0;
    const res = await executeTool('capture_screenshot', {}, 1, {});
    passAssert(res.success === false, 'fails on Safari');
    passAssert(/capability_unavailable/.test(res.error), 'error is typed capability_unavailable');
    passAssertEqual(sent.length, 0, 'no content dispatch');
  });

  console.log('\n=== 5. the shared registry object is NOT mutated ===');
  {
    const tool = defs.getToolByName('click_at');
    const before = JSON.stringify(tool);
    await withPlatform(safariPlatform, async () => {
      await executeTool('click_at', { x: 1, y: 1 }, 1, {});
    });
    passAssert(JSON.stringify(defs.getToolByName('click_at')) === before,
      'registry entry unchanged (tool-definitions-parity pins its SHA-256)');
    // CDP tools ship _contentVerb:null in the registry. The route flip must
    // leave it null -- if it had been written in place, the DOM verb would
    // leak into the pinned registry and into mcp/ai/tool-definitions.cjs.
    passAssertEqual(tool._contentVerb, null, '_contentVerb still null on the shared tool (not overwritten)');
  }

  console.log('\n=== 6. every _cdpVerb maps to a DOM verb that EXISTS in actions.js ===');
  {
    const map = safariPlatform.CDP_DOM_FALLBACKS;
    const noFallback = safariPlatform.CDP_NO_DOM_FALLBACK;
    const cdpTools = defs.TOOL_REGISTRY.filter((t) => t._route === 'cdp');
    passAssert(cdpTools.length === 8, `found ${cdpTools.length} _route:'cdp' tools (expected 8)`);
    for (const t of cdpTools) {
      if (noFallback.includes(t._cdpVerb)) continue;
      const domVerb = map[t._cdpVerb];
      passAssert(!!domVerb, `${t.name} (${t._cdpVerb}) has a mapping`);
      if (domVerb) {
        passAssert(ACTIONS_SRC.includes(`tools.${domVerb} =`),
          `${domVerb} is defined in content/actions.js`);
      }
    }
  }

  console.log('\n=== 7. remote control degrades on EVERY input path, not just keys ===');
  {
    // The adapter's attach shim rejects with a message containing "debugger",
    // and classifyFSBRemoteControlDispatchFailure pattern-matches that word to
    // 'debugger-blocked' -- which broadcasts ownership 'external-debugger' and
    // kills the session. So click / key / scroll must all bail out BEFORE
    // reaching executeCDPToolDirect.
    const WS_SRC = fs.readFileSync(path.join(ROOT, 'extension', 'ws', 'ws-client.js'), 'utf8');
    passAssert(/function _fsbRemoteControlCdpUnavailable\(/.test(WS_SRC),
      'ws-client.js defines the shared capability guard');
    for (const type of ['dash:remote-click', 'dash:remote-key', 'dash:remote-scroll']) {
      passAssert(WS_SRC.includes(`_fsbRemoteControlCdpUnavailable('${type}', payload, tabId)`),
        `${type} is guarded before dispatch`);
    }
    // Proof that the misclassification is real, so the guard cannot be dropped:
    // run the classifier's own pattern against the shim's real error message.
    const patternLine = WS_SRC.match(/if \((\/[^\n]+\/i)\.test\(message\)\) return 'debugger-blocked';/);
    passAssert(!!patternLine, "found the 'debugger-blocked' classifier pattern");
    if (patternLine) {
      const shimMessage = safariPlatform.unavailable('chrome.debugger.attach').message;
      passAssert(eval(patternLine[1]).test(shimMessage),
        'the shim error WOULD be classified debugger-blocked without the guard (' + shimMessage + ')');
    }
  }

  console.log('\n=== 8. the click-and-hold fallback gets the long action timeout ===');
  {
    // cdpClickAndHold sleeps for the caller's holdMs in the service worker,
    // where nothing caps it. Its DOM replacement sleeps in the CONTENT script,
    // under messaging.js's executeAction timeout -- 10s unless the verb is on
    // the long-timeout list. click_and_hold documents itself for record buttons
    // and long-press menus, so a holdMs at or above 10s is an ordinary request
    // and would otherwise report a spurious timeout after the press completed.
    const MSG_SRC = fs.readFileSync(path.join(ROOT, 'extension', 'content', 'messaging.js'), 'utf8');
    const listLine = MSG_SRC.match(/const longTimeoutTools = \[([^\]]*)\]/);
    passAssert(!!listLine, 'found longTimeoutTools in content/messaging.js');
    if (listLine) {
      passAssert(listLine[1].includes("'pointerClickAndHoldAt'"),
        'pointerClickAndHoldAt is exempt from the 10s executeAction timeout');
    }
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
