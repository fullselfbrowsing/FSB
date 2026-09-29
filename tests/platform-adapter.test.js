/**
 * Unit tests for extension/utils/platform-adapter.js
 *
 * The adapter is the Safari port's central shim. Its single most important
 * property is that it is a HARD NO-OP on Chrome -- if install() mutates
 * anything on a Chromium runtime the entire 626-file suite is at risk.
 *
 * Test sections (in order):
 *   1. detect() -- forced override + capability heuristics
 *   2. caps derivation
 *   3. install() on Chrome mutates NOTHING
 *   4. install() on Safari: chrome.debugger shim semantics
 *   5. install() on Safari: offscreen / system.memory shims
 *   6. install() idempotence
 *   7. sidePanel polyfill -> popup window, find-or-focus
 *   8. resolveTargetTab() never returns an extension page
 *   9. Lattice loopback round-trip + re-entrancy cap
 *  10. CDP_DOM_FALLBACKS covers every _route:'cdp' verb
 *
 * Run: node tests/platform-adapter.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MODULE_PATH = path.join(__dirname, '..', 'extension', 'utils', 'platform-adapter.js');
const SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(actual === expected, msg + ' (got ' + JSON.stringify(actual) + ')');
}

/**
 * Evaluate the adapter against a synthetic global scope. The adapter is an
 * IIFE that takes its scope as an argument, so we can instantiate it many
 * times over different fake runtimes without cross-talk.
 */
function loadAdapter(scope) {
  const sandbox = scope;
  sandbox.console = sandbox.console || { log() {}, warn() {}, error() {} };
  const fn = new Function('globalThis', 'self', 'module', SOURCE + '\nreturn globalThis.FsbPlatform;');
  return fn(sandbox, sandbox, undefined);
}

function chromeLikeScope() {
  return {
    chrome: {
      runtime: { id: 'abc', getURL: (p) => 'chrome-extension://abc/' + p, onMessage: { addListener() {}, removeListener() {} }, sendMessage() {} },
      debugger: { attach() {}, detach() {}, sendCommand() {}, onEvent: { addListener() {} }, onDetach: { addListener() {} } },
      sidePanel: { open() {}, setOptions() {}, close() {}, setPanelBehavior() {} },
      offscreen: { hasDocument() {}, createDocument() {} },
      tabs: { query() {}, get() {}, create() {}, update() {}, onActivated: { addListener() {} }, onRemoved: { addListener() {} } },
      windows: { create() {}, update() {}, remove() {}, onRemoved: { addListener() {} } },
      storage: { session: { set() {} } }
    }
  };
}

function safariLikeScope(overrides) {
  const calls = { windowsCreate: [], tabsCreate: [], windowsUpdate: [], tabsUpdate: [], windowsRemove: [] };
  const scope = {
    __FSB_FORCE_PLATFORM__: 'safari',
    _calls: calls,
    chrome: {
      runtime: {
        id: 'sfr',
        getURL: (p) => 'safari-web-extension://sfr/' + p,
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage() { return Promise.resolve(); }
      },
      tabs: {
        query: () => Promise.resolve([]),
        get: (id) => Promise.resolve({ id, url: 'https://example.com/' }),
        create: (o) => { calls.tabsCreate.push(o); return Promise.resolve({ id: 77 }); },
        update: (id, o) => { calls.tabsUpdate.push([id, o]); return Promise.resolve({ id }); },
        onActivated: { addListener() {} },
        onRemoved: { addListener() {} }
      },
      windows: {
        create: (o) => { calls.windowsCreate.push(o); return Promise.resolve({ id: 5, tabs: [{ id: 55 }] }); },
        update: (id, o) => { calls.windowsUpdate.push([id, o]); return Promise.resolve({ id }); },
        remove: (id) => { calls.windowsRemove.push(id); return Promise.resolve(); },
        onRemoved: { addListener() {} }
      },
      storage: { session: { set: () => Promise.resolve() } }
    }
  };
  if (overrides) overrides(scope);
  return scope;
}

(async function run() {
  console.log('\n=== 1. detect() ===');
  passAssertEqual(loadAdapter({ __FSB_FORCE_PLATFORM__: 'safari' }).id, 'safari', 'forced override -> safari');
  passAssertEqual(loadAdapter({ __FSB_FORCE_PLATFORM__: 'chrome', chrome: {} }).id, 'chrome', 'forced override -> chrome');
  passAssertEqual(loadAdapter(chromeLikeScope()).id, 'chrome', 'sidePanel+debugger+offscreen present -> chrome');
  passAssertEqual(loadAdapter({ chrome: { runtime: { getURL: (p) => 'safari-web-extension://x/' + p } } }).id,
    'safari', 'safari-web-extension:// getURL -> safari');
  // The shape of a CHROME content script: chrome.runtime, but none of the
  // privileged namespaces. Safari content scripts look identical apart from the
  // URL scheme, which is why detection keys on getURL and not on debugger.
  passAssertEqual(loadAdapter({ chrome: { runtime: { getURL: (p) => 'chrome-extension://x/' + p } } }).id,
    'chrome', 'chrome-extension:// getURL -> chrome (content-script shape)');
  passAssertEqual(loadAdapter({ chrome: { runtime: {} } }).id, 'chrome', 'runtime with no getURL -> chrome (safe default)');
  passAssertEqual(loadAdapter({}).id, 'chrome', 'no extension API at all -> chrome (safe default)');

  console.log('\n=== 2. caps ===');
  const chromeCaps = loadAdapter(chromeLikeScope()).caps;
  passAssert(chromeCaps.cdp && chromeCaps.trustedInput && chromeCaps.sidePanel && chromeCaps.offscreen, 'chrome caps all true');
  passAssertEqual(chromeCaps.nativeMessaging, false, 'chrome nativeMessaging false');
  const safariCaps = loadAdapter(safariLikeScope()).caps;
  passAssert(!safariCaps.cdp && !safariCaps.trustedInput && !safariCaps.sidePanel && !safariCaps.offscreen, 'safari caps all false');
  passAssertEqual(safariCaps.nativeMessaging, true, 'safari nativeMessaging true');

  console.log('\n=== 3. install() on Chrome mutates NOTHING ===');
  const cScope = chromeLikeScope();
  const beforeKeys = Object.keys(cScope.chrome).sort().join(',');
  const beforeDebugger = cScope.chrome.debugger;
  const beforeSidePanel = cScope.chrome.sidePanel;
  const beforeSend = cScope.chrome.runtime.sendMessage;
  const beforeAdd = cScope.chrome.runtime.onMessage.addListener;
  const cPlat = loadAdapter(cScope);
  const res = cPlat.install();
  passAssertEqual(Object.keys(cScope.chrome).sort().join(','), beforeKeys, 'chrome key set unchanged');
  passAssert(cScope.chrome.debugger === beforeDebugger, 'chrome.debugger identity unchanged');
  passAssert(cScope.chrome.sidePanel === beforeSidePanel, 'chrome.sidePanel identity unchanged');
  passAssert(cScope.chrome.runtime.sendMessage === beforeSend, 'runtime.sendMessage NOT wrapped on Chrome');
  passAssert(cScope.chrome.runtime.onMessage.addListener === beforeAdd, 'onMessage.addListener NOT wrapped on Chrome');
  passAssertEqual(res.installed.length, 0, 'install() reports zero installs on Chrome');
  passAssert(cScope.chrome.runtime.__fsbLoopbackInstalled === undefined, 'no loopback marker on Chrome');

  console.log('\n=== 4. chrome.debugger shim semantics ===');
  const sScope = safariLikeScope();
  const sPlat = loadAdapter(sScope);
  sPlat.install();
  passAssert(!!sScope.chrome.debugger, 'debugger namespace installed');
  let attachErr = null;
  try { await sScope.chrome.debugger.attach({ tabId: 1 }, '1.3'); } catch (e) { attachErr = e; }
  passAssertEqual(attachErr && attachErr.code, 'capability_unavailable', 'attach() rejects with capability_unavailable');
  let cmdErr = null;
  try { await sScope.chrome.debugger.sendCommand({ tabId: 1 }, 'Input.dispatchMouseEvent', {}); } catch (e) { cmdErr = e; }
  passAssertEqual(cmdErr && cmdErr.code, 'capability_unavailable', 'sendCommand() rejects with capability_unavailable');
  let detachOk = false;
  try { await sScope.chrome.debugger.detach({ tabId: 1 }); detachOk = true; } catch (_e) { detachOk = false; }
  passAssert(detachOk, 'detach() RESOLVES (every CDP site ends in finally{await detach()})');
  let evtOk = true;
  try {
    sScope.chrome.debugger.onEvent.addListener(() => {});
    sScope.chrome.debugger.onDetach.addListener(() => {});
  } catch (_e) { evtOk = false; }
  passAssert(evtOk, 'onEvent/onDetach addListener are callable no-ops');

  console.log('\n=== 5. offscreen + system.memory ===');
  passAssertEqual(await sScope.chrome.offscreen.hasDocument(), true,
    'offscreen.hasDocument() resolves TRUE so ensureLatticeOffscreen early-exits');
  let memErr = null;
  try { await sScope.chrome.system.memory.getInfo(); } catch (e) { memErr = e; }
  passAssertEqual(memErr && memErr.code, 'capability_unavailable', 'system.memory.getInfo rejects typed');

  console.log('\n=== 6. idempotence ===');
  const firstDebugger = sScope.chrome.debugger;
  const again = sPlat.install();
  passAssertEqual(again.installed.length, 0, 'second install() is a no-op');
  passAssert(sScope.chrome.debugger === firstDebugger, 'debugger identity stable across installs');

  console.log('\n=== 7. sidePanel polyfill -> popup window ===');
  const wScope = safariLikeScope();
  const wPlat = loadAdapter(wScope);
  wPlat.install();
  const opened = await wScope.chrome.sidePanel.open({ tabId: 11 });
  passAssertEqual(opened.surface, 'window', 'open() resolves with a window surface');
  passAssertEqual(wScope._calls.windowsCreate.length, 1, 'exactly one windows.create');
  passAssertEqual(wScope._calls.windowsCreate[0].type, 'popup', "windows.create type is 'popup'");
  passAssert(/ui\/sidepanel\.html$/.test(wScope._calls.windowsCreate[0].url), 'window opens ui/sidepanel.html');
  passAssertEqual(wScope._calls.tabsCreate.length, 0, 'no tab created when windows.create succeeds');
  await wScope.chrome.sidePanel.open({ tabId: 11 });
  passAssertEqual(wScope._calls.windowsCreate.length, 1, 're-open FOCUSES, never creates a second workspace');
  passAssertEqual(wScope._calls.windowsUpdate.length, 1, 're-open called windows.update({focused:true})');
  passAssertEqual(wScope._calls.windowsUpdate[0][1].focused, true, 'focus flag set');

  console.log('\n=== 7b. tab fallback when windows.create rejects ===');
  const tScope = safariLikeScope((s) => {
    s.chrome.windows.create = () => Promise.reject(new Error('no windows'));
  });
  const tPlat = loadAdapter(tScope);
  tPlat.install();
  const tOpened = await tScope.chrome.sidePanel.open({});
  passAssertEqual(tOpened.surface, 'tab', 'falls back to a tab surface');
  passAssertEqual(tScope._calls.tabsCreate.length, 1, 'exactly one tabs.create in fallback');

  console.log('\n=== 8. resolveTargetTab() excludes extension pages ===');
  const rScope = safariLikeScope((s) => {
    s.chrome.tabs.query = () => Promise.resolve([
      { id: 90, url: 'safari-web-extension://sfr/ui/sidepanel.html' },
      { id: 91, url: 'https://news.example.com/' }
    ]);
    s.chrome.tabs.get = () => Promise.reject(new Error('gone'));
  });
  const rPlat = loadAdapter(rScope);
  rPlat.install();
  const target = await rPlat.resolveTargetTab();
  passAssertEqual(target && target.id, 91, 'skips the extension page, returns the content tab');

  const emptyScope = safariLikeScope((s) => {
    s.chrome.tabs.query = () => Promise.resolve([{ id: 92, url: 'safari-web-extension://sfr/ui/sidepanel.html' }]);
    s.chrome.tabs.get = () => Promise.reject(new Error('gone'));
  });
  const ePlat = loadAdapter(emptyScope);
  ePlat.install();
  passAssertEqual(await ePlat.resolveTargetTab(), null, 'returns null when only extension pages exist');

  // Extension PAGES install with trackTabs:false, so only the service worker
  // updates lastContentTabId. Without a re-read per call the page would keep
  // driving whatever tab was active when the workspace window opened, however
  // many times the user switched tabs afterwards.
  let readCount = 0;
  const staleScope = safariLikeScope((s) => {
    s.chrome.storage.session.get = () => {
      readCount += 1;
      // 1st read is install-time hydrate; the worker moves on afterwards.
      return Promise.resolve({ fsbSafariContentTab: readCount <= 1 ? 42 : 43 });
    };
    s.chrome.tabs.get = (id) => Promise.resolve({ id, url: 'https://example.com/' });
  });
  const stalePlat = loadAdapter(staleScope);
  stalePlat.install({ loopback: false, trackTabs: false });
  const moved = await stalePlat.resolveTargetTab();
  passAssertEqual(moved && moved.id, 43, 're-reads the persisted record instead of trusting the hydrated id');
  passAssert(readCount >= 2, 'resolveTargetTab() performed its own storage read');

  console.log('\n=== 8b. window focus retargets the content tab ===');
  // Switching to a window whose tab is already active fires no onActivated,
  // so window focus is the only signal that the user moved.
  let focusListener = null;
  const persisted = [];
  const fScope = safariLikeScope((s) => {
    const byWindow = {
      5: [{ id: 55, url: 'safari-web-extension://sfr/ui/sidepanel.html' }],
      7: [{ id: 70, url: 'https://seven.example.com/' }]
    };
    s.chrome.tabs.query = (q) => Promise.resolve(
      q && typeof q.windowId === 'number' ? (byWindow[q.windowId] || []) : [{ id: 99, url: 'https://any.example.com/' }]);
    s.chrome.windows.onFocusChanged = { addListener(fn) { focusListener = fn; } };
    s.chrome.storage.session.set = (p) => { persisted.push(p); return Promise.resolve(); };
  });
  const fPlat = loadAdapter(fScope);
  fPlat.install();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const fState = fPlat._workspaceState();
  fState.windowId = 5;
  passAssert(typeof focusListener === 'function', 'trackContentTabs registers windows.onFocusChanged');

  focusListener(7);
  await tick();
  passAssertEqual(fState.lastContentTabId, 70, 'focusing a window adopts its active content tab');
  passAssert(persisted.some((p) => p.fsbSafariContentTab === 70), 'and persists it');

  fState.lastContentTabId = 11;
  focusListener(-1);
  focusListener(5);
  await tick();
  passAssertEqual(fState.lastContentTabId, 11, 'WINDOW_ID_NONE and the workspace window are ignored');

  passAssertEqual((await fPlat.resolveTargetTab({ windowId: 7 })).id, 70,
    'a windowId hint beats a stale cached tab');
  passAssertEqual((await fPlat.resolveTargetTab({ windowId: 5 })).id, 11,
    'a workspace-window hint falls through to the cache');
  passAssertEqual((await fPlat.resolveTargetTab()).id, 11, 'no hint still uses the cache');

  console.log('\n=== 8c. the content tab has exactly one writer ===');
  // A page's lastContentTabId is only as fresh as its last hydrate. Closing the
  // workspace from a page used to persist that stale id over the worker's.
  {
    const writes = [];
    const pScope = safariLikeScope((s) => {
      s.chrome.storage.session.get = () => Promise.resolve({
        fsbSafariWorkspace: { workspaceWindowId: 5, workspaceTabId: 55 },
        fsbSafariContentTab: 42
      });
      s.chrome.storage.session.set = (p) => { writes.push(p); return Promise.resolve(); };
    });
    const pPlat = loadAdapter(pScope);
    pPlat.install({ loopback: false, trackTabs: false });
    await tick();
    pPlat.closeSurface();
    passAssertEqual(pScope._calls.windowsRemove[0], 5, 'page closes the workspace window');
    const record = writes.map((p) => p.fsbSafariWorkspace).filter(Boolean).pop();
    passAssert(record && record.workspaceWindowId === null, 'page clears the window record');
    passAssert(writes.every((p) => !('fsbSafariContentTab' in p)), 'page never writes the content tab');
  }

  // An event that wakes an evicted worker runs before install()'s hydration
  // lands. The listener must wait for it, or it cannot recognise the workspace
  // window and the repair is skipped.
  {
    let openGate;
    const gate = new Promise((r) => { openGate = r; });
    let windowRemoved = null;
    const writes = [];
    const wScope = safariLikeScope((s) => {
      s.chrome.storage.session.get = () => gate.then(() => ({
        fsbSafariWorkspace: { workspaceWindowId: 5, workspaceTabId: 55 },
        fsbSafariContentTab: 42
      }));
      s.chrome.storage.session.set = (p) => { writes.push(p); return Promise.resolve(); };
      s.chrome.windows.onRemoved = { addListener(fn) { windowRemoved = fn; } };
    });
    const wPlat = loadAdapter(wScope);
    wPlat.install();
    windowRemoved(5);   // fires before hydration
    await tick();
    passAssertEqual(writes.length, 0, 'nothing is written before hydration lands');
    openGate();
    await tick();
    const wState = wPlat._workspaceState();
    passAssertEqual(wState.windowId, null, 'restarted worker still recognises and clears the closed workspace');
    const record = writes.map((p) => p.fsbSafariWorkspace).filter(Boolean).pop();
    passAssert(record && record.workspaceWindowId === null, 'and persists the cleared record');
    passAssertEqual(wState.lastContentTabId, 42, 'the content tab survives');
    passAssert(writes.every((p) => !('fsbSafariContentTab' in p)), 'closing the workspace does not touch the content tab');
  }

  console.log('\n=== 9. Lattice loopback ===');
  const lScope = safariLikeScope();
  const lPlat = loadAdapter(lScope);
  lPlat.install();
  lPlat.captureLoopback(() => {
    lScope.chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type !== 'lattice-provider-execute') return false;
      setTimeout(() => sendResponse({ ok: true, echo: msg.requestId }), 0);
      return true;
    });
  });
  const loopRes = await lScope.chrome.runtime.sendMessage({ type: 'lattice-provider-execute', requestId: 'r1' });
  passAssert(loopRes && loopRes.ok === true && loopRes.echo === 'r1', 'lattice-* message loops back in-context');

  // REGRESSION: background.js registers fsbHandleRuntimeMessage long before the
  // build epilogue imports the Lattice host, and its `default:` branch answers
  // any message with no request.action -- which is every lattice-* envelope. If
  // capture were global it would claim the reply first and the host would never
  // see the message, so every LLM call on Safari would fail.
  const oScope = safariLikeScope();
  const oPlat = loadAdapter(oScope);
  oPlat.install();
  let hostSaw = false;
  oScope.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      default: sendResponse({ error: 'Unknown action' });
    }
  });
  oPlat.captureLoopback(() => {
    oScope.chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type !== 'lattice-provider-execute') return false;
      hostSaw = true;
      sendResponse({ ok: true });
      return true;
    });
  });
  const ordered = await oScope.chrome.runtime.sendMessage({ type: 'lattice-provider-execute', requestId: 'r2' });
  passAssert(hostSaw, 'the Lattice host receives the message even though a catch-all router registered first');
  passAssert(ordered && ordered.ok === true,
    'the catch-all router does not hijack the reply (got ' + JSON.stringify(ordered) + ')');

  let passthrough = false;
  const pScope = safariLikeScope((s) => {
    s.chrome.runtime.sendMessage = () => { passthrough = true; return Promise.resolve('real'); };
  });
  const pPlat = loadAdapter(pScope);
  pPlat.install();
  await pScope.chrome.runtime.sendMessage({ action: 'startAutomation' });
  passAssert(passthrough, 'non-lattice messages pass through to the real sendMessage');

  let unclaimed = await lScope.chrome.runtime.sendMessage({ type: 'lattice-unknown' });
  passAssertEqual(unclaimed, undefined, 'unclaimed lattice message resolves undefined');

  console.log('\n=== 9b. re-entrancy cap ===');
  const rcScope = safariLikeScope();
  const rcPlat = loadAdapter(rcScope);
  rcPlat.install();
  rcPlat.captureLoopback(() => {
    rcScope.chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // Unconditionally re-send. Without the depth cap this recurses forever.
      // Each level propagates whatever it received so the cap error surfaces at
      // the outermost caller instead of being absorbed by an intermediate level.
      rcScope.chrome.runtime.sendMessage({ type: 'lattice-loop' }).then(
        (v) => sendResponse(v === undefined ? 'ok' : v),
        (err) => sendResponse('capped:' + err.message)
      );
      return true;
    });
  });
  const capped = await rcScope.chrome.runtime.sendMessage({ type: 'lattice-loop' });
  passAssert(typeof capped === 'string' && capped.indexOf('capped:fsb_loopback_depth_exceeded') === 0,
    'unbounded re-entrancy terminates via the depth cap (got ' + JSON.stringify(capped) + ')');

  console.log('\n=== 9c. extension pages self-install ===');
  {
    // MV3's script-src 'self' forbids an inline <script>, so ui/*.html can only
    // add the <script src> tag. If the adapter did not self-install there,
    // chrome.sidePanel would stay undefined and ui/onboarding.js:673 would fall
    // through to openPopupFallback() instead of opening the workspace.
    const pageScope = safariLikeScope();
    pageScope.document = {};
    pageScope.location = { protocol: 'safari-web-extension:' };
    const pagePlat = loadAdapter(pageScope);
    passAssert(!!(pageScope.chrome.sidePanel && typeof pageScope.chrome.sidePanel.open === 'function'),
      'an extension page gets chrome.sidePanel without calling install() itself');
    passAssert(!!pageScope.chrome.debugger, 'an extension page gets the chrome.debugger shim too');
    // A page must NOT take the worker-only wiring.
    passAssert(!pageScope.chrome.runtime.__fsbLoopbackInstalled,
      'an extension page does not wrap sendMessage with the in-SW loopback');
    passAssertEqual(pagePlat.id, 'safari', 'page scope still detects safari');

    // A CONTENT script has the site's scheme, so it must be left untouched.
    const csScope = safariLikeScope();
    csScope.document = {};
    csScope.location = { protocol: 'https:' };
    loadAdapter(csScope);
    passAssert(!csScope.chrome.sidePanel, 'a content script is NOT installed into');

    // The service worker has no document; the build preamble installs it.
    const swScope = safariLikeScope();
    loadAdapter(swScope);
    passAssert(!swScope.chrome.sidePanel, 'the service worker is not auto-installed (preamble does it)');
  }

  console.log('\n=== 10. CDP_DOM_FALLBACKS coverage ===');
  const toolDefs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ai', 'tool-definitions.js'), 'utf8');
  const cdpVerbs = new Set();
  const verbRe = /_cdpVerb:\s*'([A-Za-z]+)'/g;
  let m;
  while ((m = verbRe.exec(toolDefs)) !== null) cdpVerbs.add(m[1]);
  const adapter = loadAdapter(safariLikeScope());
  const map = adapter.CDP_DOM_FALLBACKS;
  const noFallback = adapter.CDP_NO_DOM_FALLBACK;
  passAssert(cdpVerbs.size > 0, 'found _cdpVerb entries in tool-definitions.js (found ' + cdpVerbs.size + ')');
  let missing = [];
  cdpVerbs.forEach((v) => { if (!map[v] && !noFallback.includes(v)) missing.push(v); });
  passAssertEqual(missing.length, 0, 'every _cdpVerb has a DOM fallback or is explicitly unavailable' + (missing.length ? ' -- missing: ' + missing.join(',') : ''));
  passAssertEqual(noFallback.filter((v) => map[v]).length, 0, 'no verb is both mapped and declared unavailable');

  console.log('\n=== 11. source hygiene ===');
  passAssert(!/\bimportScripts\b/.test(SOURCE),
    'adapter source contains no importScripts token (background.js pins 333/329)');

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
