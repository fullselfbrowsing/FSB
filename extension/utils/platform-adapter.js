/**
 * FSB Safari port -- platform detection + capability shim.
 *
 * FSB targets Chrome MV3 as its source of truth. Safari Web Extensions lack
 * three Chrome-proprietary namespaces that FSB uses: chrome.debugger (CDP),
 * chrome.sidePanel, and chrome.offscreen. Rather than fork extension/ or edit
 * the ~115 CDP call sites, this module installs stand-in namespaces so the
 * existing call sites degrade through their EXISTING try/catch paths.
 *
 * Design rules:
 *   1. install() is a hard NO-OP on Chrome. Nothing is patched, no globals are
 *      replaced. Chrome behaviour must stay byte-identical.
 *   2. Everything is capability-gated, never user-agent sniffed. The Safari
 *      build sets globalThis.__FSB_FORCE_PLATFORM__ so production is
 *      deterministic; detect() heuristics are only a fallback.
 *   3. debugger.detach() RESOLVES rather than rejecting -- every CDP call site
 *      ends in `finally { await chrome.debugger.detach(...) }` and detaching
 *      something that was never attached is trivially successful. Only attach
 *      and sendCommand reject, with a typed capability_unavailable error.
 *   4. offscreen.hasDocument() resolves TRUE so ensureLatticeOffscreen() takes
 *      its existing `if (has) return;` early-exit and never calls
 *      createDocument. Zero edits to background.js for the offscreen path.
 *
 * This file is loaded two different ways:
 *   - service worker: PREPENDED verbatim to build/safari/background.js by
 *     scripts/build-safari.mjs. It is deliberately NOT script-imported,
 *     because tests/lattice-provider-bridge-smoke.test.js pins background.js
 *     to exactly 333 script-import mentions / 329 call sites.
 *   - UI pages: a <script> tag, first in the document.
 * It is not injected into content pages; no content-script module consumes it.
 */

'use strict';

(function (globalScope) {
  var TAG = '[FSB Platform]';
  var DEFAULT_WORKSPACE_PATH = 'ui/sidepanel.html';
  var WORKSPACE_STATE_KEY = 'fsbSafariWorkspace';
  var CONTENT_TAB_KEY = 'fsbSafariContentTab';
  var WORKSPACE_WIDTH = 460;
  var WORKSPACE_HEIGHT = 920;
  var LOOPBACK_PREFIX = 'lattice-';
  var LOOPBACK_MAX_DEPTH = 4;

  // ---------------------------------------------------------------------------
  // chrome/browser handle
  // ---------------------------------------------------------------------------

  function api(scope) {
    var g = scope || globalScope;
    return g.chrome || g.browser || null;
  }

  /**
   * Promise-wrap an extension API that may be promise-style (Safari, MV3) or
   * callback-style (older shapes and most test mocks).
   */
  function invoke(fn, thisArg, args) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(value) {
        if (settled) return;
        settled = true;
        var c = api();
        var lastErr = c && c.runtime && c.runtime.lastError;
        if (lastErr) { reject(new Error(lastErr.message || String(lastErr))); return; }
        resolve(value);
      }
      var out;
      try {
        out = fn.apply(thisArg, args.concat([done]));
      } catch (err) {
        if (settled) return;
        settled = true;
        reject(err);
        return;
      }
      if (out && typeof out.then === 'function') {
        out.then(function (v) { if (!settled) { settled = true; resolve(v); } },
                 function (e) { if (!settled) { settled = true; reject(e); } });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Typed capability errors
  // ---------------------------------------------------------------------------

  function unavailable(feature, detail) {
    var msg = 'capability_unavailable: ' + feature + ' is not supported on this platform';
    if (detail) msg += ' (' + detail + ')';
    var err = new Error(msg);
    err.code = 'capability_unavailable';
    err.feature = feature;
    err.platform = FsbPlatform.id;
    if (detail) err.detail = detail;
    return err;
  }

  function rejectUnavailable(feature) {
    return function () {
      var detail = arguments.length > 1 && typeof arguments[1] === 'string' ? arguments[1] : null;
      return Promise.reject(unavailable(feature, detail));
    };
  }

  function noopEvent() {
    return {
      addListener: function () {},
      removeListener: function () {},
      hasListener: function () { return false; }
    };
  }

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------

  function detect(scope) {
    var g = scope || globalScope;
    if (g.__FSB_FORCE_PLATFORM__ === 'safari' || g.__FSB_FORCE_PLATFORM__ === 'chrome') {
      return g.__FSB_FORCE_PLATFORM__;
    }
    var c = g.chrome || g.browser || null;
    if (!c) return 'chrome';
    // POSITIVE signal only. The extension URL scheme is the one discriminator
    // available in every extension context -- and absence of chrome.debugger
    // cannot be used as a general platform discriminator because content
    // scripts have the same restricted namespace shape in both browsers:
    // neither browser hands a content script the privileged namespaces, so
    // "no chrome.debugger" describes a Chrome content script just as well as
    // it describes Safari.
    try {
      if (c.runtime && typeof c.runtime.getURL === 'function' &&
          c.runtime.getURL('').indexOf('safari-web-extension:') === 0) return 'safari';
    } catch (_e) { /* getURL unavailable in this context */ }
    if (typeof g.safari !== 'undefined') return 'safari';
    return 'chrome';
  }

  function buildCaps(id) {
    var isChrome = id === 'chrome';
    return {
      cdp: isChrome,
      trustedInput: isChrome,
      sidePanel: isChrome,
      offscreen: isChrome,
      systemMemory: isChrome,
      networkBodies: isChrome,
      nativeMessaging: !isChrome
    };
  }

  // ---------------------------------------------------------------------------
  // CDP verb -> content-script DOM tool. Lives here rather than in
  // ai/tool-definitions.js because tests/tool-definitions-parity.test.js pins a
  // SHA-256 over the whole tool registry, cross-checked against
  // mcp/ai/tool-definitions.cjs. Adding a field there would break both files.
  // ---------------------------------------------------------------------------

  var CDP_DOM_FALLBACKS = {
    cdpClickAt: 'pointerClickAt',
    cdpClickAndHold: 'pointerClickAndHoldAt',
    cdpDrag: 'pointerDrag',
    cdpDragVariableSpeed: 'pointerDragVariableSpeed',
    cdpScrollAt: 'wheelScrollAt',
    cdpInsertText: 'domInsertTextAt',
    cdpDoubleClickAt: 'pointerDoubleClickAt'
  };

  // _cdpVerbs with no DOM equivalent. tool-executor answers these with a typed
  // capability_unavailable on Safari rather than faking a result: a DOM
  // re-render is not the composited page image capture_screenshot promises.
  var CDP_NO_DOM_FALLBACK = ['cdpCaptureScreenshot'];

  // ---------------------------------------------------------------------------
  // Workspace surface (Safari has no sidePanel; we use a popup-type window)
  // ---------------------------------------------------------------------------

  var _workspace = { path: DEFAULT_WORKSPACE_PATH, windowId: null, tabId: null, lastContentTabId: null };
  // In-flight hydrateWorkspace() read, awaited by openWorkspace().
  var _hydrating = null;

  function extensionOrigin() {
    var c = api();
    if (!c || !c.runtime || typeof c.runtime.getURL !== 'function') return null;
    try { return c.runtime.getURL(''); } catch (_e) { return null; }
  }

  function isExtensionUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    var origin = extensionOrigin();
    if (origin && url.indexOf(origin) === 0) return true;
    return /^(chrome|safari-web)-extension:\/\//.test(url);
  }

  function writeSession(payload) {
    var c = api();
    if (!c || !c.storage || !c.storage.session || typeof c.storage.session.set !== 'function') return;
    try {
      var r = c.storage.session.set(payload);
      if (r && typeof r.catch === 'function') r.catch(function () {});
    } catch (_e) { /* best effort */ }
  }

  /** The workspace window record. Pages and the worker both open and close it. */
  function persistWorkspace() {
    var payload = {};
    payload[WORKSPACE_STATE_KEY] = {
      workspaceWindowId: _workspace.windowId,
      workspaceTabId: _workspace.tabId,
      path: _workspace.path
    };
    writeSession(payload);
  }

  /**
   * The content tab lives under its OWN key, written only by the context that
   * runs trackContentTabs() -- the service worker. A page's copy is whatever it
   * last hydrated. While it shared the window record, a page closing the
   * workspace wrote that stale id over the worker's, and the agent went back to
   * driving a tab the user had long since left.
   */
  function persistContentTab() {
    var payload = {};
    payload[CONTENT_TAB_KEY] = _workspace.lastContentTabId;
    writeSession(payload);
  }

  /**
   * Read the persisted record back into _workspace.
   *
   * _workspace is module state, so it is empty again after every service-worker
   * recycle. Without this, openWorkspace() skips both of its focus branches and
   * calls windows.create again -- the user accumulates one more FSB workspace
   * window every time the worker is evicted. storage.session is the right home:
   * it survives a worker restart and is wiped on browser restart, which is
   * exactly the lifetime of a window id.
   */
  function hydrateWorkspace() {
    var c = api();
    if (!c || !c.storage || !c.storage.session || typeof c.storage.session.get !== 'function') {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      function apply(data) {
        var saved = data && data[WORKSPACE_STATE_KEY];
        if (saved) {
          if (saved.workspaceWindowId != null) _workspace.windowId = saved.workspaceWindowId;
          if (saved.workspaceTabId != null) _workspace.tabId = saved.workspaceTabId;
          if (typeof saved.path === 'string' && saved.path) _workspace.path = saved.path;
        }
        if (data && data[CONTENT_TAB_KEY] != null) _workspace.lastContentTabId = data[CONTENT_TAB_KEY];
        resolve();
      }
      try {
        var out = c.storage.session.get([WORKSPACE_STATE_KEY, CONTENT_TAB_KEY], apply);
        if (out && typeof out.then === 'function') out.then(apply, function () { resolve(); });
      } catch (_e) { resolve(); }
    });
  }

  async function openWorkspace(opts) {
    opts = opts || {};
    var c = api();
    if (!c) throw unavailable('openWorkspace', 'no extension API');
    // A stale window id is self-healing: windows.update rejects on a window the
    // user closed while the worker was down, and the catch below falls through
    // to windows.create.
    if (_hydrating) { try { await _hydrating; } catch (_e) { /* best effort */ } }
    if (opts.path) _workspace.path = opts.path;
    var url = c.runtime.getURL(_workspace.path);

    // 1. Focus an existing workspace window.
    if (_workspace.windowId != null && c.windows && typeof c.windows.update === 'function') {
      try {
        await invoke(c.windows.update, c.windows, [_workspace.windowId, { focused: true }]);
        return { surface: 'window', windowId: _workspace.windowId, tabId: _workspace.tabId };
      } catch (_e) { _workspace.windowId = null; }
    }

    // 2. Focus an existing workspace tab (tab-fallback mode).
    if (_workspace.tabId != null && c.tabs && typeof c.tabs.update === 'function') {
      try {
        await invoke(c.tabs.update, c.tabs, [_workspace.tabId, { active: true }]);
        return { surface: 'tab', tabId: _workspace.tabId };
      } catch (_e) { _workspace.tabId = null; }
    }

    // 3. Create a popup-type window: a real extension page, persistent, and
    //    parkable beside the browser so the user watches the agent work.
    if (c.windows && typeof c.windows.create === 'function') {
      try {
        var win = await invoke(c.windows.create, c.windows, [{
          url: url, type: 'popup', width: WORKSPACE_WIDTH, height: WORKSPACE_HEIGHT
        }]);
        if (win && win.id != null) {
          _workspace.windowId = win.id;
          if (win.tabs && win.tabs.length && win.tabs[0] && win.tabs[0].id != null) {
            _workspace.tabId = win.tabs[0].id;
          }
          persistWorkspace();
          return { surface: 'window', windowId: _workspace.windowId, tabId: _workspace.tabId };
        }
      } catch (_e) { /* fall through to tab */ }
    }

    // 4. Last resort: a plain extension tab.
    if (c.tabs && typeof c.tabs.create === 'function') {
      var tab = await invoke(c.tabs.create, c.tabs, [{ url: url, active: true }]);
      if (tab && tab.id != null) {
        _workspace.tabId = tab.id;
        persistWorkspace();
        return { surface: 'tab', tabId: _workspace.tabId };
      }
    }

    throw unavailable('openWorkspace', 'no window or tab API available');
  }

  function closeSurface() {
    var c = api();
    if (FsbPlatform.id === 'chrome') {
      if (globalScope.close) { try { globalScope.close(); } catch (_e) { /* ignore */ } }
      return;
    }
    if (!c) return;
    if (_workspace.windowId != null && c.windows && typeof c.windows.remove === 'function') {
      try { invoke(c.windows.remove, c.windows, [_workspace.windowId]).catch(function () {}); } catch (_e) { /* ignore */ }
      _workspace.windowId = null;
      _workspace.tabId = null;
      persistWorkspace();
      return;
    }
    if (globalScope.close) { try { globalScope.close(); } catch (_e) { /* ignore */ } }
  }

  /**
   * Resolve the CONTENT tab the agent should act on.
   *
   * On Safari the workspace is its own popup window, which makes a
   * {active:true, currentWindow:true} query actively WRONG (currentWindow is
   * the FSB window). So currentWindow is deliberately absent from this chain.
   */
  async function resolveTargetTab(opts) {
    var c = api();
    if (!c || !c.tabs || typeof c.tabs.query !== 'function') return null;

    // REFRESH BEFORE TRUSTING THE CACHE. _workspace is per-CONTEXT module
    // state, and only the service worker runs trackContentTabs() -- extension
    // pages install with trackTabs:false, because a page tracking tabs would
    // persistWorkspace() its own null window/tab ids over the worker's. So an
    // extension page's lastContentTabId is whatever hydrateWorkspace() read at
    // install time and never moves again; without this re-read the workspace
    // keeps driving the tab that was active when it opened, no matter how many
    // times the user switches tabs afterwards.
    if (_hydrating) { try { await _hydrating; } catch (_e) { /* best effort */ } }
    await hydrateWorkspace();

    // A focus-change caller knows the window the user just moved to. Asking it
    // directly beats the cache, which the worker updates asynchronously.
    if (opts && isContentWindow(opts.windowId)) {
      var focused = await activeContentTabIn(c, opts.windowId);
      if (focused) return focused;
    }

    if (_workspace.lastContentTabId != null && typeof c.tabs.get === 'function') {
      try {
        var known = await invoke(c.tabs.get, c.tabs, [_workspace.lastContentTabId]);
        if (known && known.id != null && !isExtensionUrl(known.url)) return known;
      } catch (_e) { _workspace.lastContentTabId = null; }
    }

    var active = await invoke(c.tabs.query, c.tabs, [{ active: true }]);
    if (Array.isArray(active)) {
      for (var i = 0; i < active.length; i += 1) {
        if (active[i] && active[i].id != null && !isExtensionUrl(active[i].url)) return active[i];
      }
    }
    return null;
  }

  /** A real browser window that is not the FSB workspace itself. */
  function isContentWindow(windowId) {
    return typeof windowId === 'number' && windowId >= 0 && windowId !== _workspace.windowId;
  }

  async function activeContentTabIn(c, windowId) {
    try {
      var tabs = await invoke(c.tabs.query, c.tabs, [{ active: true, windowId: windowId }]);
      if (Array.isArray(tabs)) {
        for (var i = 0; i < tabs.length; i += 1) {
          if (tabs[i] && tabs[i].id != null && !isExtensionUrl(tabs[i].url)) return tabs[i];
        }
      }
    } catch (_e) { /* window closed mid-query */ }
    return null;
  }

  /**
   * Run a tracking listener against the persisted state, not bare module state.
   * An event that wakes an evicted worker runs its listeners before install()'s
   * hydration lands, so _workspace is still empty: windows.onRemoved would not
   * recognise the workspace window and skip the repair, and any persist would
   * write those empty ids over the saved record. Re-reading on every event also
   * picks up a workspace a page opened, which this context never saw.
   */
  function whenHydrated(fn) {
    return function () {
      var args = arguments;
      Promise.resolve(_hydrating)
        .then(hydrateWorkspace)
        .then(function () { fn.apply(null, args); })
        .catch(function () {});
    };
  }

  function trackContentTabs() {
    var c = api();
    if (!c || !c.tabs) return;
    if (c.tabs.onActivated && typeof c.tabs.onActivated.addListener === 'function') {
      c.tabs.onActivated.addListener(whenHydrated(function (info) {
        if (!info || info.tabId == null) return;
        if (typeof c.tabs.get !== 'function') return;
        invoke(c.tabs.get, c.tabs, [info.tabId]).then(function (tab) {
          if (tab && !isExtensionUrl(tab.url)) {
            _workspace.lastContentTabId = tab.id;
            persistContentTab();
          }
        }).catch(function () {});
      }));
    }
    // Switching to another window whose tab is already active fires no
    // onActivated, so without this the agent keeps driving the previous
    // window's tab.
    if (c.windows && c.windows.onFocusChanged && typeof c.windows.onFocusChanged.addListener === 'function'
        && typeof c.tabs.query === 'function') {
      c.windows.onFocusChanged.addListener(whenHydrated(function (windowId) {
        if (!isContentWindow(windowId)) return;
        activeContentTabIn(c, windowId).then(function (tab) {
          if (!tab) return;
          _workspace.lastContentTabId = tab.id;
          persistContentTab();
        });
      }));
    }
    if (c.tabs.onRemoved && typeof c.tabs.onRemoved.addListener === 'function') {
      c.tabs.onRemoved.addListener(whenHydrated(function (tabId) {
        if (tabId === _workspace.lastContentTabId) {
          _workspace.lastContentTabId = null;
          persistContentTab();
        }
        if (tabId === _workspace.tabId) {
          _workspace.tabId = null;
          _workspace.windowId = null;
          persistWorkspace();
        }
      }));
    }
    if (c.windows && c.windows.onRemoved && typeof c.windows.onRemoved.addListener === 'function') {
      c.windows.onRemoved.addListener(whenHydrated(function (windowId) {
        if (windowId === _workspace.windowId) {
          _workspace.windowId = null;
          _workspace.tabId = null;
          persistWorkspace();
        }
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Lattice in-SW loopback.
  //
  // chrome.runtime.sendMessage never delivers back into the sender's own
  // context, so once the Lattice host is script-imported INTO the service
  // worker its listeners would never hear the bridge. Wrapping sendMessage +
  // onMessage.addListener closes the circuit without editing either
  // ai/lattice-provider-bridge.js or offscreen/lattice-host.js.
  //
  // CAPTURE IS SCOPED, NOT GLOBAL. Registering every onMessage listener would
  // put background.js's fsbHandleRuntimeMessage in the loopback fan-out, and
  // its `default: sendResponse({ error: 'Unknown action' })` branch answers any
  // message with no request.action -- which is every lattice-* envelope. Since
  // it registers before the Lattice host is imported, it would claim the reply
  // first and the host would never see the message. So only listeners
  // registered inside captureLoopback() join the fan-out; the Safari build
  // epilogue wraps the Lattice host's script import in exactly that.
  // ---------------------------------------------------------------------------

  var _localListeners = [];
  var _loopbackDepth = 0;
  var _capturingLoopback = false;

  function isLoopbackMessage(msg) {
    return !!(msg && typeof msg.type === 'string' && msg.type.indexOf(LOOPBACK_PREFIX) === 0);
  }

  function registerLoopback(listener) {
    if (typeof listener === 'function' && _localListeners.indexOf(listener) === -1) {
      _localListeners.push(listener);
    }
  }

  /**
   * Run fn with loopback capture armed: every onMessage.addListener call it
   * makes also joins the in-SW fan-out. Synchronous on purpose -- the Safari
   * epilogue's script import must stay inside the service worker's initial
   * evaluation, and a promise-based scope could not guarantee that.
   */
  function captureLoopback(fn) {
    var prev = _capturingLoopback;
    _capturingLoopback = true;
    try {
      return typeof fn === 'function' ? fn() : undefined;
    } finally {
      _capturingLoopback = prev;
    }
  }

  function dispatchLoopback(message) {
    if (_loopbackDepth >= LOOPBACK_MAX_DEPTH) {
      return Promise.reject(new Error('fsb_loopback_depth_exceeded: ' + LOOPBACK_MAX_DEPTH));
    }
    var listeners = _localListeners.slice();
    var c = api();
    var sender = { id: (c && c.runtime && c.runtime.id) || 'fsb-loopback' };

    return new Promise(function (resolve) {
      var settled = false;
      var pending = 0;
      function respond(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      _loopbackDepth += 1;
      try {
        for (var i = 0; i < listeners.length; i += 1) {
          if (settled) break;
          var keepAlive = false;
          try {
            keepAlive = listeners[i](message, sender, respond);
          } catch (_e) {
            keepAlive = false;
          }
          if (keepAlive === true) pending += 1;
        }
      } finally {
        _loopbackDepth -= 1;
      }
      if (!settled && pending === 0) resolve(undefined);
    });
  }

  function installLoopback(c) {
    if (!c || !c.runtime) return false;
    var onMessage = c.runtime.onMessage;
    if (!onMessage || typeof onMessage.addListener !== 'function') return false;
    if (typeof c.runtime.sendMessage !== 'function') return false;
    if (c.runtime.__fsbLoopbackInstalled) return false;

    var realAdd = onMessage.addListener.bind(onMessage);
    var realRemove = typeof onMessage.removeListener === 'function'
      ? onMessage.removeListener.bind(onMessage)
      : null;
    var realSend = c.runtime.sendMessage.bind(c.runtime);

    onMessage.addListener = function (fn) {
      if (_capturingLoopback) registerLoopback(fn);
      return realAdd(fn);
    };
    if (realRemove) {
      onMessage.removeListener = function (fn) {
        var idx = _localListeners.indexOf(fn);
        if (idx !== -1) _localListeners.splice(idx, 1);
        return realRemove(fn);
      };
    }
    c.runtime.sendMessage = function () {
      var args = Array.prototype.slice.call(arguments);
      if (isLoopbackMessage(args[0])) {
        var cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
        var p = dispatchLoopback(args[0]);
        if (cb) { p.then(cb, function () { cb(undefined); }); return undefined; }
        return p;
      }
      return realSend.apply(null, args);
    };
    c.runtime.__fsbLoopbackInstalled = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // install()
  // ---------------------------------------------------------------------------

  var _installed = false;

  function install(opts) {
    opts = opts || {};
    var scope = opts.scope || globalScope;
    var c = opts.chrome || api(scope);
    var result = { installed: [], platform: FsbPlatform.id };

    // Hard no-op on Chrome. Nothing is patched.
    if (FsbPlatform.id === 'chrome') return result;
    if (_installed && !opts.force) return result;
    if (!c) return result;

    if (!c.debugger) {
      c.debugger = {
        attach: rejectUnavailable('chrome.debugger.attach'),
        sendCommand: rejectUnavailable('chrome.debugger.sendCommand'),
        // Resolves: every CDP site ends in `finally { await detach() }`, and
        // detaching what was never attached is trivially successful.
        detach: function () { return Promise.resolve(); },
        getTargets: function () { return Promise.resolve([]); },
        onEvent: noopEvent(),
        onDetach: noopEvent()
      };
      result.installed.push('debugger');
    }

    if (!c.sidePanel) {
      c.sidePanel = {
        setOptions: function (o) {
          if (o && typeof o.path === 'string' && o.path) _workspace.path = o.path;
          return Promise.resolve();
        },
        getOptions: function () {
          return Promise.resolve({ path: _workspace.path, enabled: true });
        },
        // Resolving open() is what keeps the frozen gesture dance in
        // background.js:15757-15830 on its success branch: it awaits
        // openPromise first and only falls back to windows.create on reject.
        open: function (o) { return openWorkspace(o || {}); },
        // Deliberate no-op: never auto-close a user's workspace window.
        close: function () { return Promise.resolve(); },
        setPanelBehavior: function () { return Promise.resolve(); }
      };
      result.installed.push('sidePanel');
    }

    if (!c.offscreen) {
      c.offscreen = {
        // TRUE so ensureLatticeOffscreen() takes its `if (has) return;`
        // early-exit and never calls createDocument.
        hasDocument: function () { return Promise.resolve(true); },
        createDocument: function () { return Promise.resolve(); },
        closeDocument: function () { return Promise.resolve(); }
      };
      result.installed.push('offscreen');
    }

    if (!c.system || !c.system.memory) {
      c.system = c.system || {};
      c.system.memory = { getInfo: rejectUnavailable('chrome.system.memory.getInfo') };
      result.installed.push('system.memory');
    }

    // Both default ON so the service-worker call site stays `install()`.
    // Extension pages opt out: they never send a lattice-* message, and tab
    // tracking is the worker's job -- a page doing it would just keep a second,
    // divergent copy of _workspace.
    if (opts.loopback !== false && installLoopback(c)) result.installed.push('runtime.loopback');

    // Fire-and-forget: openWorkspace() awaits _hydrating before it decides
    // whether a workspace window already exists.
    _hydrating = hydrateWorkspace().then(function () { _hydrating = null; });

    if (opts.trackTabs !== false) trackContentTabs();

    _installed = true;
    return result;
  }

  // ---------------------------------------------------------------------------
  // Public surface
  // ---------------------------------------------------------------------------

  var FsbPlatform = {
    id: detect(globalScope),
    detect: detect,
    caps: null,
    CDP_DOM_FALLBACKS: CDP_DOM_FALLBACKS,
    CDP_NO_DOM_FALLBACK: CDP_NO_DOM_FALLBACK,
    install: install,
    unavailable: unavailable,
    openWorkspace: openWorkspace,
    closeSurface: closeSurface,
    resolveTargetTab: resolveTargetTab,
    registerLoopback: registerLoopback,
    captureLoopback: captureLoopback,
    dispatchLoopback: dispatchLoopback,
    isLoopbackMessage: isLoopbackMessage,
    _workspaceState: function () { return _workspace; },
    _reset: function () {
      _installed = false;
      _hydrating = null;
      _localListeners.length = 0;
      _loopbackDepth = 0;
      _capturingLoopback = false;
      _workspace = { path: DEFAULT_WORKSPACE_PATH, windowId: null, tabId: null, lastContentTabId: null };
      FsbPlatform.id = detect(globalScope);
      FsbPlatform.caps = buildCaps(FsbPlatform.id);
    }
  };
  FsbPlatform.caps = buildCaps(FsbPlatform.id);

  globalScope.FsbPlatform = FsbPlatform;
  globalScope.fsbOpenWorkspace = openWorkspace;

  /**
   * An extension PAGE (ui/*.html), as opposed to the service worker or a
   * content script. The discriminator is the document's own scheme: a content
   * script's location is the SITE's, never the extension's.
   */
  function isExtensionPage(g) {
    if (!g || typeof g.document === 'undefined' || !g.document) return false;
    var loc = g.location;
    if (!loc || typeof loc.protocol !== 'string') return false;
    return /^(chrome|safari-web|moz)-extension:$/.test(loc.protocol);
  }

  // Extension pages have no other way to call install(): MV3's
  // `script-src 'self'` forbids the inline <script> that would do it, and a
  // <script src> tag is all the page markup can add. Without this,
  // chrome.sidePanel stays undefined on Safari and ui/onboarding.js falls
  // through to openPopupFallback() instead of opening the workspace.
  //
  // The service worker is installed explicitly by the Safari build preamble
  // (it wants the loopback and tab tracking a page does not), and content
  // scripts are deliberately left alone -- neither browser hands them these
  // namespaces, and wrapping a content script's sendMessage would break its
  // route to the worker.
  if (FsbPlatform.id !== 'chrome' && isExtensionPage(globalScope)) {
    FsbPlatform.install({ loopback: false, trackTabs: false });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FsbPlatform: FsbPlatform, detect: detect, buildCaps: buildCaps };
  }

  try {
    console.log(TAG, 'boot: platform=' + FsbPlatform.id);
  } catch (_e) { /* swallow if console unavailable */ }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
