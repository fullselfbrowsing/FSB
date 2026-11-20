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
 *   7. sidePanel polyfill -> popup window, find-or-focus; 7c to 7i dock that
 *      window beside the browser window, follow it, and restore on close;
 *      7j to 7m the panel inside the page, and its page's calls to the worker
 *   8. resolveTargetTab() never returns an extension page
 *   9. Lattice loopback round-trip + re-entrancy cap
 *  10. CDP_DOM_FALLBACKS covers every _route:'cdp' verb
 *  11. source hygiene
 *  12. Safari service worker: WebSocket guard + runtime.onSuspend stand-in
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

  // Safari has no side panel, so the workspace window docks to the browser
  // window instead: it takes the left-hand 460px, the browser window moves
  // over and narrows to make room, the workspace page follows it around, and
  // closing the workspace hands the strip back. One set of windows and one session
  // store are shared by the worker's adapter and the page's, as in the browser.
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
  const dockWorld = () => {
    const wins = new Map();
    const store = {};
    const log = { create: [], update: [], remove: [], removed: [] };
    const world = {
      wins, store, log, lastFocused: null, tabWindow: null, ignoreBounds: false, ignorePosition: false, misplace: false,
      add(win) { wins.set(win.id, Object.assign({ type: 'normal', state: 'normal' }, win)); return world; },
      // `self` is the window windows.getCurrent() reports in this scope.
      scope(self, overrides) {
        return safariLikeScope((s) => {
          const w = s.chrome.windows;
          w.get = (id) => (wins.has(id)
            ? Promise.resolve(Object.assign({}, wins.get(id)))
            : Promise.reject(new Error('No window with id ' + id)));
          w.getCurrent = () => w.get(self);
          w.getLastFocused = () => w.get(world.lastFocused);
          w.update = (id, info) => {
            log.update.push([id, Object.assign({}, info)]);
            if (!wins.has(id)) return Promise.reject(new Error('No window with id ' + id));
            if (!(world.ignoreBounds && wins.get(id).type === 'normal')) {
              for (const key of ['left', 'top', 'width', 'height', 'state']) {
                if (world.ignorePosition && wins.get(id).type === 'normal' && (key === 'left' || key === 'top')) continue;
                if (info[key] !== undefined) wins.get(id)[key] = info[key];
              }
            }
            return Promise.resolve(Object.assign({}, wins.get(id)));
          };
          w.create = (info) => {
            log.create.push(Object.assign({}, info));
            const placed = world.misplace || info.left === undefined;
            wins.set(5, {
              id: 5, type: 'popup', state: 'normal',
              left: placed ? 20 : info.left, top: placed ? 20 : info.top, width: info.width, height: info.height
            });
            return Promise.resolve(Object.assign({ tabs: [{ id: 55 }] }, wins.get(5)));
          };
          w.remove = (id) => { log.remove.push(id); wins.delete(id); return Promise.resolve(); };
          w.onRemoved = { addListener(fn) { log.removed.push(fn); } };
          s.chrome.tabs.get = (id) => Promise.resolve({ id, url: 'https://example.com/', windowId: world.tabWindow });
          s.chrome.storage.session.get = () => Promise.resolve(JSON.parse(JSON.stringify(store)));
          s.chrome.storage.session.set = (p) => { Object.assign(store, JSON.parse(JSON.stringify(p))); return Promise.resolve(); };
          if (overrides) overrides(s);
        });
      },
      async worker(overrides) {
        const scope = world.scope(null, overrides);
        const plat = loadAdapter(scope);
        plat.install();
        await settle();
        return { scope, plat, open: (o) => scope.chrome.sidePanel.open(o) };
      }
    };
    return world;
  };
  const flat = (b) => [b.left, b.top, b.width, b.height].join(' ');
  const json = (v) => JSON.stringify(v);

  console.log('\n=== 7c. the workspace docks beside the browser window it was opened from ===');
  const dWorld = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 })
    .add({ id: 2, left: 0, top: 0, width: 1200, height: 800 });
  const dWorker = await dWorld.worker();
  const dOpened = await dWorker.open({ windowId: 1 });
  passAssertEqual(dOpened.surface, 'window', 'open() still resolves with a window surface');
  passAssertEqual(json(dWorld.log.update[0]), json([1, { left: 560, top: 50, width: 940, height: 900 }]),
    'the browser window moves over and narrows by the workspace width');
  passAssertEqual(dWorld.log.create.length, 1, 'exactly one windows.create');
  passAssertEqual(dWorld.log.create[0].type + ' ' + flat(dWorld.log.create[0]), 'popup 100 50 460 900',
    'the workspace takes the freed strip on the left: same top and height, flush with the browser window');
  passAssertEqual(dWorld.log.update.length, 1, 'a workspace created where it was asked for is not moved again');
  const dDock = dWorld.store.fsbSafariWorkspace.dock;
  passAssert(dDock && dDock.contentWindowId === 1 && dDock.panelWindowId === 5 && dDock.panelWidth === 460
    && dDock.content.width === 940 && dDock.rev === 1, 'the dock is persisted with both window ids');

  console.log('\n=== 7d. re-open re-snaps the workspace, without a second window or a second squeeze ===');
  dWorld.log.update.length = 0;
  await dWorker.open({ windowId: 1 });
  passAssertEqual(dWorld.log.create.length, 1, 're-open never creates a second workspace');
  passAssertEqual(json(dWorld.log.update), json([[5, { focused: true, left: 100, top: 50, width: 460, height: 900 }]]),
    'one update: focus the workspace and put it back on the edge');
  passAssertEqual(flat(dWorld.wins.get(1)), '560 50 940 900', 'the browser window is not moved or narrowed twice');
  passAssertEqual(dWorld.store.fsbSafariWorkspace.dock.rev, 2, 'and the re-snap is stamped for the page that follows');

  console.log('\n=== 7e. opening from another browser window moves the dock there ===');
  dWorld.log.update.length = 0;
  await dWorker.open({ windowId: 2 });
  passAssertEqual(flat(dWorld.wins.get(1)), '100 50 1400 900', 'the window it left gets its strip back, exactly');
  passAssertEqual(flat(dWorld.wins.get(2)), '460 0 740 800', 'the new one moves over and narrows');
  passAssertEqual(flat(dWorld.wins.get(5)), '0 0 460 800', 'and the workspace takes its left edge');
  passAssertEqual(dWorld.log.create.length, 1, 'still the same workspace window');
  passAssertEqual(dWorld.store.fsbSafariWorkspace.dock.contentWindowId, 2, 'the record names the new browser window');

  console.log('\n=== 7f. the workspace page follows its browser window ===');
  const fPage = loadAdapter(dWorld.scope(5));
  fPage.install({ loopback: false, trackTabs: false });
  const follower = await fPage.followDock({ poll: false, settleMs: 0 });
  passAssert(!!follower && typeof follower.tick === 'function', 'the workspace page gets a follower');
  dWorld.log.update.length = 0;
  await follower.tick();
  passAssertEqual(dWorld.log.update.length, 0, 'its first look is only a baseline');
  Object.assign(dWorld.wins.get(2), { left: 760, top: 80 });
  await follower.tick();
  passAssertEqual(json(dWorld.log.update), json([[5, { left: 300, top: 80, width: 460, height: 800 }]]),
    'a moved browser window takes the workspace with it');
  dWorld.log.update.length = 0;
  await follower.tick();
  passAssertEqual(dWorld.log.update.length, 0, 'and its own move does not set it off again');
  Object.assign(dWorld.wins.get(2), { width: 900, height: 700 });
  await follower.tick();
  passAssertEqual(json(dWorld.log.update), json([[5, { left: 300, top: 80, width: 460, height: 700 }]]),
    'a resized browser window keeps the workspace on its edge, at its height');
  passAssertEqual(dWorld.wins.get(2).width, 900, 'the follower never resizes the browser window');
  passAssertEqual(dWorld.store.fsbSafariWorkspace.dock.content.width, 900, 'and the record keeps that window current');
  dWorld.log.update.length = 0;
  Object.assign(dWorld.wins.get(2), { state: 'fullscreen', left: 0, top: 0, width: 1728, height: 1117 });
  await follower.tick();
  passAssertEqual(dWorld.log.update.length, 0, 'a fullscreen browser window is left alone');
  Object.assign(dWorld.wins.get(2), { state: 'normal', left: 760, top: 80, width: 900, height: 700 });
  await follower.tick();
  passAssertEqual(dWorld.log.update.length, 0, 'and so is one that came back where it was');
  Object.assign(dWorld.wins.get(5), { left: 2000, top: 300 });
  await follower.tick();
  Object.assign(dWorld.wins.get(2), { left: 800 });
  await follower.tick();
  passAssertEqual(dWorld.log.update.length, 0, 'a workspace the user dragged away is not pulled back');
  await dWorker.open({ windowId: 2 });
  passAssertEqual(flat(dWorld.wins.get(5)), '340 80 460 700', 'until the next open docks it again');
  dWorld.log.update.length = 0;
  await follower.tick();
  Object.assign(dWorld.wins.get(2), { left: 900 });
  await follower.tick();
  passAssertEqual(json(dWorld.log.update), json([[5, { left: 440, top: 80, width: 460, height: 700 }]]),
    'after which it follows again');
  const otherPage = loadAdapter(dWorld.scope(2));
  otherPage.install({ loopback: false, trackTabs: false });
  passAssertEqual(await otherPage.followDock({ poll: false }), null, 'an extension page in a normal window follows nothing');
  {
    // A browser may still be moving the workspace when update() resolves. A
    // move that lands late must not be read as the user dragging it away.
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    const pageScope = world.scope(5);
    let pending = null;
    pageScope.chrome.windows.update = (id, info) => {
      world.log.update.push([id, Object.assign({}, info)]);
      pending = () => Object.assign(world.wins.get(id), info);
      return Promise.resolve({ id });
    };
    const page = loadAdapter(pageScope);
    page.install({ loopback: false, trackTabs: false });
    const slow = await page.followDock({ poll: false, settleMs: 60 });
    await slow.tick();
    world.log.update.length = 0;
    Object.assign(world.wins.get(1), { left: 700 });
    await slow.tick();
    passAssertEqual(json(world.log.update), json([[5, { left: 240, top: 50, width: 460, height: 900 }]]),
      'the follower asks for the move');
    await slow.tick();
    pending();
    await slow.tick();
    Object.assign(world.wins.get(1), { left: 800 });
    await slow.tick();
    passAssertEqual(json(world.log.update[1]), json([5, { left: 340, top: 50, width: 460, height: 900 }]),
      'a move that lands late is not mistaken for the user dragging the workspace');
    pending();
    await new Promise((r) => setTimeout(r, 90));
    await slow.tick();
    Object.assign(world.wins.get(5), { left: 30 });
    await slow.tick();
    Object.assign(world.wins.get(1), { left: 900 });
    await slow.tick();
    passAssertEqual(world.log.update.length, 2, 'while a drag after it has landed still detaches');
  }

  console.log('\n=== 7g. closing the workspace gives the browser window its width back ===');
  // The page clears the window id before its window is gone, so the worker
  // must recognise the workspace from the dock record itself.
  fPage.closeSurface();
  passAssertEqual(dWorld.log.remove[0], 5, 'the page closes its own workspace window');
  passAssertEqual(dWorld.store.fsbSafariWorkspace.workspaceWindowId, null, 'and clears the window id');
  dWorld.log.removed.forEach((fn) => fn(5));
  await settle();
  passAssertEqual(flat(dWorld.wins.get(2)), '440 80 1360 700', 'the browser window takes back the strip the workspace held');
  passAssertEqual(dWorld.store.fsbSafariWorkspace.dock, null, 'and the dock is cleared');
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    world.wins.get(1).width = 800;
    world.wins.delete(5);
    world.log.removed.forEach((fn) => fn(5));
    await settle();
    passAssertEqual(world.wins.get(1).width, 800, 'a browser window the user resized since is left as they made it');
    passAssertEqual(world.store.fsbSafariWorkspace.dock, null, 'though the dock is still cleared');
  }
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    world.wins.delete(1);
    world.log.removed.forEach((fn) => fn(1));
    await settle();
    passAssertEqual(world.store.fsbSafariWorkspace.dock, null, 'a closed browser window drops the dock');
    passAssertEqual(world.store.fsbSafariWorkspace.workspaceWindowId, 5, 'and leaves the workspace open');
  }

  console.log('\n=== 7h. where it cannot dock, the workspace opens as it always did ===');
  const floats = async (label, setup, opts) => {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    setup(world);
    const before = flat(world.wins.get(1));
    const worker = await world.worker();
    await worker.open(opts || { windowId: 1 });
    const made = world.log.create[0] || {};
    passAssert(world.log.create.length === 1 && made.left === undefined && made.top === undefined
      && made.width === 460 && made.height === 920, label + ': the workspace opens unplaced, at its own size');
    passAssertEqual(flat(world.wins.get(1)), before, label + ': the browser window is as it was');
    passAssert(!world.store.fsbSafariWorkspace.dock, label + ': no dock is recorded');
  };
  await floats('too narrow', (world) => { world.wins.get(1).width = 1100; });
  await floats('fullscreen', (world) => { world.wins.get(1).state = 'fullscreen'; });
  await floats('minimized', (world) => { world.wins.get(1).state = 'minimized'; });
  await floats('no bounds', (world) => { delete world.wins.get(1).left; });
  await floats('bounds ignored', (world) => { world.ignoreBounds = true; });
  await floats('size taken but not the position', (world) => { world.ignorePosition = true; });
  await floats('unknown window', () => {}, { windowId: 99 });
  await floats('no window to go by', () => {}, {});
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    world.lastFocused = 1;
    const worker = await world.worker();
    await worker.open({});
    passAssertEqual(flat(world.wins.get(5)), '100 50 460 900', 'with no hint it docks to the last focused browser window');
  }
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    world.tabWindow = 1;
    const worker = await world.worker();
    await worker.open({ tabId: 11 });
    passAssertEqual(flat(world.wins.get(5)), '100 50 460 900', 'a tab hint docks to that tab\'s window');
  }
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900, state: 'maximized' });
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    passAssertEqual(json(world.log.update[0]), json([1, { left: 560, top: 50, width: 940, height: 900, state: 'normal' }]),
      'a maximized browser window is un-maximized as it is narrowed');
  }
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    world.misplace = true;
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    passAssertEqual(json(world.log.update[1]), json([5, { left: 100, top: 50, width: 460, height: 900 }]),
      'a workspace the browser placed elsewhere is moved to the edge once');
    passAssertEqual(world.log.update.length, 2, 'and only once');
  }
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    const worker = await world.worker((s) => { s.chrome.windows.create = () => Promise.reject(new Error('no windows')); });
    const opened = await worker.open({ windowId: 1 });
    passAssertEqual(opened.surface, 'tab', 'a workspace that could not be created still falls back to a tab');
    passAssertEqual(flat(world.wins.get(1)), '100 50 1400 900', 'and the browser window gets its strip back');
    passAssert(!world.store.fsbSafariWorkspace.dock, 'with no dock left behind');
  }

  console.log('\n=== 7i. the dock survives a worker recycle ===');
  {
    const world = dockWorld().add({ id: 1, left: 100, top: 50, width: 1400, height: 900 });
    await (await world.worker()).open({ windowId: 1 });
    const recycled = await world.worker();
    const state = recycled.plat._workspaceState();
    passAssert(state.windowId === 5 && state.dock && state.dock.contentWindowId === 1 && state.dock.panelWindowId === 5,
      'a fresh worker reads the workspace and its dock back');
    world.log.update.length = 0;
    await recycled.open({ windowId: 1 });
    passAssertEqual(world.log.create.length, 1, 'and re-opens without a second workspace');
    passAssertEqual(flat(world.wins.get(1)), '560 50 940 900', 'or a second squeeze');
    world.wins.delete(5);
    world.log.removed.forEach((fn) => fn(5));
    await settle();
    passAssertEqual(flat(world.wins.get(1)), '100 50 1400 900', 'and still restores the strip when the workspace closes');
  }

  // Where the page can hold it, the panel is FSB's own page inside the web
  // page, placed by the worker through content/panel-host.js. One world: the
  // browser's tabs, what each page's content script would answer, the worker's
  // adapter, and the adapter of a panel page embedded in a tab.
  const panelWorld = () => {
    const store = {};
    const log = { sent: [], created: [], removed: [], injected: [], absent: [], optionsOpened: 0, calls: [] };
    const listeners = { updated: [], activated: [], tabRemoved: [], windowRemoved: [], connect: [] };
    const tabs = new Map();
    const pages = new Map();   // tabId -> { script: has a content script, shown: panel showing }
    const world = {
      store, log, listeners, tabs, pages, failInjection: false,
      tab(tab, page) {
        tabs.set(tab.id, Object.assign({ active: true, url: 'https://example.com/' }, tab));
        pages.set(tab.id, Object.assign({ script: true, shown: false }, page));
        return world;
      },
      chromeFor(self) {
        return (s) => {
          s.chrome.tabs.get = (id) => (tabs.has(id) ? Promise.resolve(Object.assign({}, tabs.get(id))) : Promise.reject(new Error('No tab ' + id)));
          s.chrome.tabs.query = (q) => {
            log.calls.push(['tabs.query', Object.assign({}, q)]);
            return Promise.resolve(Array.from(tabs.values())
              .filter((t) => (q.windowId == null || t.windowId === q.windowId) && (q.active == null || t.active === q.active))
              .map((t) => Object.assign({}, t)));
          };
          s.chrome.tabs.update = (id, info) => { log.calls.push(['tabs.update', id, Object.assign({}, info)]); return Promise.resolve(Object.assign({}, tabs.get(id), info)); };
          s.chrome.tabs.sendMessage = (tabId, message) => {
            log.sent.push([tabId, message.action]);
            const pg = pages.get(tabId);
            // Safari resolves empty when no content script is there to answer.
            if (!pg || !pg.script) return Promise.resolve(undefined);
            if (message.action === 'fsbPanelShow') pg.shown = true;
            if (message.action === 'fsbPanelHide') pg.shown = false;
            return Promise.resolve({ success: true, shown: pg.shown });
          };
          s.chrome.tabs.onUpdated = { addListener: (fn) => listeners.updated.push(fn) };
          s.chrome.tabs.onActivated = { addListener: (fn) => listeners.activated.push(fn) };
          s.chrome.tabs.onRemoved = { addListener: (fn) => listeners.tabRemoved.push(fn) };
          s.chrome.tabs.TAB_ID_NONE = -1;
          s.chrome.windows.get = (id) => { log.calls.push(['windows.get', id]); return Promise.resolve({ id, type: 'normal', state: 'fullscreen' }); };
          s.chrome.windows.create = (info) => { log.created.push(info); return Promise.resolve({ id: 5, tabs: [{ id: 55 }] }); };
          s.chrome.windows.remove = (id) => { log.removed.push(id); return Promise.resolve(); };
          s.chrome.windows.onRemoved = { addListener: (fn) => listeners.windowRemoved.push(fn) };
          s.chrome.windows.onFocusChanged = { addListener() {} };
          s.chrome.windows.WINDOW_ID_CURRENT = -2;
          s.chrome.runtime.openOptionsPage = () => { log.optionsOpened++; return Promise.resolve(); };
          s.chrome.runtime.onConnect = { addListener: (fn) => listeners.connect.push(fn) };
          // A page connecting reaches the worker with the sender the browser
          // would attach: the tab and frame the page sits in.
          s.chrome.runtime.connect = (info) => {
            const side = () => {
              const handlers = { message: [], disconnect: [] };
              return {
                name: info.name, handlers,
                onMessage: { addListener: (fn) => handlers.message.push(fn) },
                onDisconnect: { addListener: (fn) => handlers.disconnect.push(fn) }
              };
            };
            const near = side();
            const far = side();
            near.postMessage = (m) => setTimeout(() => far.handlers.message.forEach((fn) => fn(JSON.parse(JSON.stringify(m)))), 0);
            far.postMessage = (m) => setTimeout(() => near.handlers.message.forEach((fn) => fn(JSON.parse(JSON.stringify(m)))), 0);
            near.disconnect = () => far.handlers.disconnect.forEach((fn) => fn());
            // The other side learns of a disconnect on a later turn, as in the browser.
            far.disconnect = () => { world.refused = true; setTimeout(() => near.handlers.disconnect.forEach((fn) => fn()), 0); };
            far.sender = self;
            listeners.connect.forEach((fn) => fn(far));
            return near;
          };
          s.chrome.storage.session.get = () => Promise.resolve(JSON.parse(JSON.stringify(store)));
          s.chrome.storage.session.set = (p) => { Object.assign(store, JSON.parse(JSON.stringify(p))); return Promise.resolve(); };
        };
      },
      async worker() {
        const scope = safariLikeScope(world.chromeFor(null));
        scope.ensureContentScriptInjected = async (tabId) => {
          log.injected.push(tabId);
          if (world.failInjection) throw new Error('Cannot access this page');
          pages.get(tabId).script = true;
          return true;
        };
        scope.fsbNoteContentScriptAbsent = (tabId) => log.absent.push(tabId);
        const plat = loadAdapter(scope);
        plat.install();
        await settle();
        return { scope, plat, open: (o) => scope.chrome.sidePanel.open(o) };
      },
      // The panel's own page: an extension page, but not the top frame.
      async panelPage(sender) {
        const scope = safariLikeScope(world.chromeFor(sender));
        scope.location = { protocol: 'safari-web-extension:' };
        scope.document = {};
        scope.self = scope;
        scope.top = {};
        scope.stop = () => { scope.stopped = true; };
        const real = scope.chrome;
        const plat = loadAdapter(scope);
        await settle();
        return { scope, plat, real };
      }
    };
    return world;
  };
  const HOST = { tab: { id: 11, windowId: 1 }, frameId: 7, url: 'safari-web-extension://sfr/ui/sidepanel.html' };

  console.log('\n=== 7j. the panel opens inside the page, where the page can hold it ===');
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 }).tab({ id: 12, windowId: 1, active: false });
    const worker = await world.worker();
    const opened = await worker.open({ windowId: 1 });
    passAssertEqual(opened.surface + ' ' + opened.tabId, 'panel 11', 'a toolbar click shows the panel in the window\'s active tab');
    passAssertEqual(json(world.log.sent), json([[11, 'fsbPanelShow']]), 'by asking that page\'s content script');
    passAssertEqual(world.log.created.length, 0, 'and opens no window');
    passAssertEqual(json(world.store.fsbSafariPanel), json({ windows: { 1: true } }), 'the window is recorded as having the panel on');
    passAssertEqual(world.log.injected.length, 0, 'a page that answers is not injected into again');

    world.log.sent.length = 0;
    const closed = await worker.open({ windowId: 1 });
    passAssert(closed.surface === 'panel' && closed.closed === true, 'a second toolbar click closes it, as Chrome\'s side panel toggles');
    await settle();
    passAssert(world.pages.get(11).shown === false && world.log.sent.some((m) => m[0] === 12 && m[1] === 'fsbPanelHide'),
      'in every tab of that window');
    passAssertEqual(json(world.store.fsbSafariPanel), json({ windows: {} }), 'and the window is no longer recorded');

    await worker.open({ tabId: 11 });
    const again = await worker.open({ tabId: 11 });
    passAssert(world.pages.get(11).shown === true && !again.closed, 'an automation opening its tab never closes the panel it reports into');
  }
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 }, { script: false });
    const worker = await world.worker();
    const opened = await worker.open({ windowId: 1 });
    passAssertEqual(opened.surface, 'panel', 'a page with no content script yet still gets the panel');
    passAssertEqual(json([world.log.absent, world.log.injected]), json([[11], [11]]),
      'after an injection that skips probing a page that has just said nothing');
    passAssertEqual(json(world.log.sent), json([[11, 'fsbPanelShow'], [11, 'fsbPanelShow']]), 'and a second ask');
  }
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 });
    const worker = await world.worker();
    worker.plat._workspaceState().windowId = 5;
    await worker.open({ windowId: 1 });
    passAssertEqual(json(world.log.removed), json([5]), 'the panel replaces an open workspace window: one surface at a time');
  }

  console.log('\n=== 7k. where it cannot, the workspace window opens as before ===');
  for (const [label, setup] of [
    ['an extension page', (world) => world.tab({ id: 11, windowId: 1, url: 'safari-web-extension://sfr/ui/control_panel.html' })],
    ['a page FSB may not touch', (world) => { world.tab({ id: 11, windowId: 1 }, { script: false }); world.failInjection = true; }],
    ['a window with no tab to show it in', () => {}]
  ]) {
    const world = panelWorld();
    setup(world);
    const worker = await world.worker();
    const opened = await worker.open({ windowId: 1 });
    passAssert(opened.surface === 'window' && world.log.created.length === 1, label + ': falls back to the workspace window');
    passAssert(!world.store.fsbSafariPanel || !world.store.fsbSafariPanel.windows[1], label + ': and records no panel');
  }
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 });
    const scope = safariLikeScope(world.chromeFor(null));
    const plat = loadAdapter(scope);
    plat.install({ loopback: false, trackTabs: false });
    await settle();
    const opened = await scope.chrome.sidePanel.open({ windowId: 1 });
    passAssert(opened.surface === 'window' && world.log.sent.length === 0, 'an extension page never places a panel: only the worker does');
  }

  console.log('\n=== 7l. the panel is put back as its window loads and switches pages ===');
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 }).tab({ id: 12, windowId: 1, active: false }).tab({ id: 21, windowId: 2 });
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    const fire = async (list, ...args) => { list.forEach((fn) => fn(...args)); await settle(); };
    world.pages.get(11).shown = false;   // a navigation replaced the document
    world.log.sent.length = 0;
    await fire(world.listeners.updated, 11, { status: 'complete' }, world.tabs.get(11));
    passAssert(world.pages.get(11).shown === true, 'a page that finished loading gets its panel back');
    world.log.sent.length = 0;
    await fire(world.listeners.updated, 11, { status: 'loading' }, world.tabs.get(11));
    await fire(world.listeners.updated, 12, { status: 'complete' }, world.tabs.get(12));
    await fire(world.listeners.updated, 21, { status: 'complete' }, world.tabs.get(21));
    passAssertEqual(world.log.sent.length, 0, 'but not a page still loading, a background tab, or a window without the panel');
    Object.assign(world.tabs.get(11), { active: false });
    Object.assign(world.tabs.get(12), { active: true });
    await fire(world.listeners.activated, { tabId: 12, windowId: 1 });
    passAssert(world.pages.get(12).shown === true, 'a tab switched to gets its own panel');
    await fire(world.listeners.activated, { tabId: 21, windowId: 2 });
    passAssert(world.pages.get(21).shown === false, 'in a window without the panel it does not');
    await fire(world.listeners.windowRemoved, 1);
    passAssertEqual(json(world.store.fsbSafariPanel), json({ windows: {} }), 'a closed window is forgotten');
    const recycled = await world.worker();
    passAssertEqual(json(recycled.plat._panelState()), json({ windows: {} }), 'and a fresh worker reads the panel record back');
  }

  console.log('\n=== 7m. inside the panel, tab and window lookups go through the worker ===');
  // On Safari such a lookup made from an embedded extension page takes the
  // host page down (WebKit bug 327823), so the panel's page must never make one.
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 }).tab({ id: 12, windowId: 1, active: false }).tab({ id: 21, windowId: 2 });
    const worker = await world.worker();
    await worker.open({ windowId: 1 });
    const page = await world.panelPage(HOST);
    const c = page.scope.chrome;
    passAssert(page.plat.embedded === true && c !== page.real && page.scope.browser === c, 'the page\'s chrome and browser are replaced by a stand-in');
    passAssert(Object.getPrototypeOf(c) === page.real && c.runtime === page.real.runtime && c.storage === page.real.storage,
      'that is the browser\'s own API for everything else');
    passAssert(c.tabs !== page.real.tabs && c.windows !== page.real.windows, 'except tabs and windows');
    passAssert(c.tabs.onActivated === page.real.tabs.onActivated && c.windows.onFocusChanged === page.real.windows.onFocusChanged,
      'whose events stay the browser\'s own');
    passAssertEqual(c.tabs.TAB_ID_NONE, -1, 'and whose constants read through');
    passAssert(typeof c.sidePanel.open === 'function', 'the usual shims are installed on top');

    world.log.calls.length = 0;
    const found = await c.tabs.query({ active: true, currentWindow: true });
    passAssertEqual(json(found.map((t) => t.id)), json([11]), 'tabs.query is answered by the worker');
    passAssertEqual(json(world.log.calls[0]), json(['tabs.query', { active: true, windowId: 1 }]),
      'with "current window" meaning the window the panel sits in');
    const viaCallback = await new Promise((resolve) => c.tabs.query({ windowId: 2 }, resolve));
    passAssertEqual(json(viaCallback.map((t) => t.id)), json([21]), 'callback style works too');
    passAssertEqual((await c.tabs.getCurrent()).id, 11, 'tabs.getCurrent is the tab the panel sits in');
    world.log.calls.length = 0;
    await c.windows.getCurrent();
    passAssertEqual(json(world.log.calls[0]), json(['windows.get', 1]), 'windows.getCurrent is that tab\'s window');
    world.log.calls.length = 0;
    await c.tabs.update({ url: 'https://example.org/' });
    passAssertEqual(json(world.log.calls[0]), json(['tabs.update', 11, { url: 'https://example.org/' }]), 'tabs.update with no id acts on that tab');
    let refusal = null;
    try { await c.tabs.executeScript({ code: '1' }); } catch (e) { refusal = e.message; }
    passAssertEqual(refusal, 'tabs.executeScript is not available to the panel', 'a call that is not on the list is refused');
    await c.runtime.openOptionsPage();
    passAssertEqual(world.log.optionsOpened, 1, 'runtime.openOptionsPage, which opens a tab, is made by the worker too');

    passAssertEqual((await page.plat.resolveTargetTab()).id, 11, 'the panel drives the page it sits in');
    passAssertEqual((await page.plat.openWorkspace({})).surface, 'panel', 'opening the workspace from inside it is a no-op');
    passAssertEqual(await page.plat.followDock({ poll: false }), null, 'and it follows no window');
    page.plat.closeSurface();
    await settle();
    passAssert(world.pages.get(11).shown === false && !world.store.fsbSafariPanel.windows[1], 'closing it asks the worker, which hides the panel and forgets the window');
  }
  {
    // The close is what woke an evicted worker, so it lands before the saved
    // panel record is read back. Answering it from the empty in-memory record
    // saved {windows: {}} and erased the other window's panel.
    const world = panelWorld().tab({ id: 11, windowId: 1 }).tab({ id: 21, windowId: 2 });
    world.store.fsbSafariPanel = { windows: { 1: true, 2: true } };
    let openGate;
    const gate = new Promise((r) => { openGate = r; });
    const scope = safariLikeScope((s) => {
      world.chromeFor(null)(s);
      s.chrome.storage.session.get = () => {
        const snapshot = JSON.parse(JSON.stringify(world.store));
        return gate.then(() => snapshot);
      };
    });
    const plat = loadAdapter(scope);
    plat.install();
    const page = await world.panelPage(HOST);
    page.plat.closeSurface();
    await settle();
    openGate();
    await settle();
    passAssertEqual(json(world.store.fsbSafariPanel), json({ windows: { 2: true } }),
      'a close that wakes the worker forgets only its own window');
    passAssertEqual(json(plat._panelState()), json({ windows: { 2: true } }), 'and the worker\'s own record agrees');
  }
  {
    const world = panelWorld().tab({ id: 11, windowId: 1 });
    await world.worker();
    const stranger = await world.panelPage({ tab: { id: 11, windowId: 1 }, frameId: 0, url: 'https://example.com/' });
    let refused = null;
    try { await stranger.scope.chrome.tabs.query({}); } catch (e) { refused = e.message; }
    passAssert(world.refused === true && refused === 'The background worker went away', 'the worker hangs up on anything but its own embedded page');
  }
  {
    // A browser that will not let the global be replaced: the page must not run.
    const world = panelWorld().tab({ id: 11, windowId: 1 });
    const scope = safariLikeScope(world.chromeFor(HOST));
    const real = scope.chrome;
    Object.defineProperty(scope, 'chrome', { get: () => real, set() {}, configurable: false });
    Object.assign(scope, { location: { protocol: 'safari-web-extension:' }, document: {}, self: scope, top: {} });
    scope.stop = () => { scope.stopped = true; };
    const plat = loadAdapter(scope);
    passAssert(scope.stopped === true && plat.embedded === false && !real.sidePanel,
      'where the stand-in cannot be installed the panel page is stopped before its own scripts run');
  }
  {
    const top = safariLikeScope();
    Object.assign(top, { location: { protocol: 'safari-web-extension:' }, document: {} });
    top.self = top;
    top.top = top;
    const real = top.chrome;
    const plat = loadAdapter(top);
    passAssert(plat.embedded === false && top.chrome === real, 'a top-level extension page keeps the browser\'s own API');
  }

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

  console.log('\n=== 8b2. a cold cache resolves to the focused window, not any window ===');
  // An unscoped {active:true} query returns every window's active tab in no
  // particular order. With the background window listed first, only the
  // last-focused lookup gets the right one.
  {
    const unscoped = [{ id: 30, url: 'https://background.example.com/' }, { id: 70, url: 'https://focused.example.com/' }];
    const coldScope = (lastFocused, getInfoLog) => safariLikeScope((s) => {
      const byWindow = { 3: [unscoped[0]], 5: [{ id: 55, url: 'safari-web-extension://sfr/ui/sidepanel.html' }], 7: [unscoped[1]] };
      s.chrome.tabs.query = (q) => Promise.resolve(
        q && typeof q.windowId === 'number' ? (byWindow[q.windowId] || []) : unscoped);
      s.chrome.tabs.get = () => Promise.reject(new Error('gone'));
      if (lastFocused !== undefined) {
        s.chrome.windows.getLastFocused = (info) => {
          if (getInfoLog) getInfoLog.push(info);
          return lastFocused instanceof Error ? Promise.reject(lastFocused) : Promise.resolve(lastFocused);
        };
      }
    });
    const load = (scope) => {
      const plat = loadAdapter(scope);
      plat.install({ loopback: false, trackTabs: false });
      plat._workspaceState().windowId = 5;
      return plat;
    };

    const infos = [];
    passAssertEqual((await load(coldScope({ id: 7 }, infos)).resolveTargetTab()).id, 70,
      'uses the last-focused window\'s active tab');
    passAssert(infos.length === 1 && JSON.stringify(infos[0].windowTypes) === '["normal"]',
      'asks for normal windows only, which excludes the popup workspace');
    passAssertEqual((await load(coldScope({ id: 5 })).resolveTargetTab()).id, 30,
      'a browser that returns the workspace anyway falls back to the unscoped query');
    passAssertEqual((await load(coldScope(new Error('No window'))).resolveTargetTab()).id, 30,
      'a rejected getLastFocused falls back to the unscoped query');
    passAssertEqual((await load(coldScope(undefined)).resolveTargetTab()).id, 30,
      'no windows.getLastFocused falls back to the unscoped query');
  }

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

  console.log('\n=== 8d. the workspace tab is ruled out by its window, not just its URL ===');
  {
    // If Safari withholds the workspace tab's URL, the URL check alone reads it
    // as a content page; the dashboard relay would then navigate or drive FSB's
    // own window.
    let activatedListener = null;
    const wScope = safariLikeScope((s) => {
      s.chrome.tabs.onActivated = { addListener(fn) { activatedListener = fn; } };
      s.chrome.tabs.get = (id) => Promise.resolve(id === 55
        ? { id: 55, windowId: 5 }
        : { id, windowId: 7, url: 'https://seven.example.com/' });
      s.chrome.tabs.query = () => Promise.resolve([
        { id: 55, windowId: 5 },
        { id: 70, windowId: 7, url: 'https://seven.example.com/' }
      ]);
    });
    const wPlat = loadAdapter(wScope);
    wPlat.install();
    const wState = wPlat._workspaceState();
    wState.windowId = 5;
    wState.lastContentTabId = 70;
    passAssert(typeof activatedListener === 'function', 'trackContentTabs registers tabs.onActivated');
    activatedListener({ tabId: 55, windowId: 5 });
    await new Promise((r) => setTimeout(r, 0));
    passAssertEqual(wState.lastContentTabId, 70, 'activating the URL-less workspace tab does not adopt it');

    wState.lastContentTabId = 55;
    const picked = await wPlat.resolveTargetTab();
    passAssertEqual(picked && picked.id, 70, 'a cached id that points at the workspace tab is passed over');
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
    'adapter source contains no importScripts token (background.js pins 330/326)');

  console.log('\n=== 12. Safari service worker: WebSocket guard + runtime.onSuspend ===');
  {
    // Safari runs the background worker on its WebContent main thread, where
    // `new WebSocket()` deadlocks the whole process. The guard must turn that
    // into a synchronous SecurityError, which the MCP bridge classifies as
    // 'security' and pins transport=native on.
    function NativeWebSocket(url) { this.url = url; }
    NativeWebSocket.CONNECTING = 0;
    NativeWebSocket.OPEN = 1;
    NativeWebSocket.CLOSING = 2;
    NativeWebSocket.CLOSED = 3;
    function workerScope(base) {
      function ServiceWorkerGlobalScope() {}
      const scope = Object.create(ServiceWorkerGlobalScope.prototype);
      Object.assign(scope, base);
      scope.ServiceWorkerGlobalScope = ServiceWorkerGlobalScope;
      scope.WebSocket = NativeWebSocket;
      return scope;
    }
    function constructError(Ctor) {
      try { new Ctor('ws://localhost:7225'); return null; } catch (err) { return err; }
    }

    const sw = workerScope(safariLikeScope());
    const swRes = loadAdapter(sw).install();
    passAssert(swRes.installed.includes('WebSocket.workerGuard'), 'install() reports the worker WebSocket guard');
    passAssert(sw.WebSocket !== NativeWebSocket, 'the worker WebSocket is replaced on Safari');
    const err = constructError(sw.WebSocket);
    passAssertEqual(err && err.name, 'SecurityError', 'new WebSocket() throws SecurityError synchronously');
    passAssertEqual(sw.WebSocket.OPEN, 1, 'WebSocket.OPEN survives the guard');
    passAssertEqual(sw.WebSocket.CONNECTING, 0, 'WebSocket.CONNECTING survives the guard');
    passAssertEqual(sw.WebSocket.CLOSED, 3, 'WebSocket.CLOSED survives the guard');
    passAssert(sw.WebSocket.prototype === NativeWebSocket.prototype, 'the native prototype is kept');

    const guarded = sw.WebSocket;
    const again = loadAdapter(sw).install({ force: true });
    passAssert(sw.WebSocket === guarded && !again.installed.includes('WebSocket.workerGuard'),
      'a forced second install() does not wrap the guard again');

    const swDom = workerScope(safariLikeScope());
    swDom.DOMException = DOMException;
    loadAdapter(swDom).install();
    const domErr = constructError(swDom.WebSocket);
    passAssert(domErr instanceof DOMException && domErr.name === 'SecurityError',
      'a DOMException SecurityError is thrown when the scope has DOMException');

    const page = safariLikeScope();
    page.WebSocket = NativeWebSocket;
    loadAdapter(page).install({ loopback: false, trackTabs: false });
    passAssert(page.WebSocket === NativeWebSocket, 'an extension page keeps the real WebSocket (not a worker)');

    const chromeSw = workerScope(chromeLikeScope());
    loadAdapter(chromeSw).install();
    passAssert(chromeSw.WebSocket === NativeWebSocket, 'Chrome service worker WebSocket is untouched');

    // background.js calls chrome.runtime.onSuspend.addListener at top level;
    // Safari's worker has no onSuspend, so the unguarded call aborted it.
    const susp = safariLikeScope();
    const suspRes = loadAdapter(susp).install();
    passAssert(suspRes.installed.includes('runtime.onSuspend'), 'install() reports the runtime.onSuspend stand-in');
    let threw = false;
    try { susp.chrome.runtime.onSuspend.addListener(() => {}); } catch (_e) { threw = true; }
    passAssert(!threw, 'runtime.onSuspend.addListener no longer throws on Safari');

    const own = { addListener() {}, removeListener() {}, hasListener() { return true; } };
    const kept = safariLikeScope((s) => { s.chrome.runtime.onSuspend = own; });
    const keptRes = loadAdapter(kept).install();
    passAssert(kept.chrome.runtime.onSuspend === own && !keptRes.installed.includes('runtime.onSuspend'),
      'a native runtime.onSuspend is left alone');

    const chromeNoSusp = chromeLikeScope();
    loadAdapter(chromeNoSusp).install();
    passAssert(chromeNoSusp.chrome.runtime.onSuspend === undefined, 'Chrome runtime is not given an onSuspend stand-in');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  process.exit(1);
});
