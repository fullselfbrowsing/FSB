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
 *   5. In the Safari service worker only, `WebSocket` throws SecurityError
 *      (guardWorkerWebSocket below): a real one deadlocks the worker's process.
 *      caps.tintsGrayscaleToolbarIcon tells utils/action-icon.js to keep its
 *      toolbar frames out of Safari's grayscale tint.
 *   6. runtime.onSuspend gets a no-op stand-in when Safari lacks it, because
 *      background.js registers on it at top level.
 *
 * This file is loaded two different ways:
 *   - service worker: PREPENDED verbatim to build/safari/background.js by
 *     scripts/build-safari.mjs. It is deliberately NOT script-imported,
 *     because tests/lattice-provider-bridge-smoke.test.js pins background.js
 *     to exactly 334 script-import mentions / 330 call sites.
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
  // Docking. Safari has no side panel, so the workspace window takes the
  // left-hand WORKSPACE_WIDTH of the browser window it was opened from, and
  // that window is narrowed to make room: the pair fills the original footprint.
  var DOCK_MIN_CONTENT_WIDTH = 700;  // never squeeze the browser window below this
  var DOCK_TOLERANCE = 2;            // px of slack when comparing window bounds
  var DOCK_FOLLOW_MS = 400;          // follow poll, where windows.onBoundsChanged is missing
  var DOCK_SETTLE_MS = 600;          // how long a move of the workspace may take to land
  // The panel inside the page (content/panel-host.js) and the calls its page
  // makes back to the worker.
  var PANEL_STATE_KEY = 'fsbSafariPanel';
  var PANEL_WIDTH = 420;
  var PANEL_REPLY_MS = 1500;         // how long a tab's content script gets to answer
  var FRAME_RPC_PORT = 'fsb-frame-rpc';
  var FRAME_RPC_MS = 8000;           // a lookup the worker never answers must not hang the panel
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
  // Service-worker WebSocket guard
  //
  // Safari runs an extension's background service worker on its WebContent
  // process's MAIN thread (WorkerMainRunLoop). In a worker, `new WebSocket()`
  // goes through WorkerThreadableWebSocketChannel, which hands setup to the
  // main thread and blocks on a semaphore until it finishes. Here the worker
  // IS the main thread, so it waits on itself and the process deadlocks. Every
  // later fetch, extension resource load and extension page in that process
  // hangs with it, and Safari abandons the background after about two minutes
  // (WKWebExtensionContextErrorDomain Code=6). Seen on Safari 26.5 / macOS 26.6
  // by sampling the stuck process.
  //
  // Throwing SecurityError synchronously makes each caller fail fast instead:
  // the MCP bridge already reads a construct-time SecurityError as "pin
  // transport=native", and ws/ws-client.js schedules its usual reconnect.
  // Extension pages are not workers and keep the real WebSocket.
  // ---------------------------------------------------------------------------

  function isServiceWorker(g) {
    return !!g && typeof g.ServiceWorkerGlobalScope === 'function' && g instanceof g.ServiceWorkerGlobalScope;
  }

  function guardWorkerWebSocket(g) {
    var Native = g.WebSocket;
    if (typeof Native !== 'function' || Native.__fsbSafariWorkerGuard) return false;
    function WebSocket() {
      var msg = 'WebSocket is unavailable in the Safari extension service worker';
      if (typeof g.DOMException === 'function') throw new g.DOMException(msg, 'SecurityError');
      var err = new Error(msg);
      err.name = 'SecurityError';
      throw err;
    }
    WebSocket.prototype = Native.prototype;
    // readyState comparisons (`socket.readyState === WebSocket.OPEN`) still run
    // against native-transport sockets, so the constants must survive.
    WebSocket.CONNECTING = typeof Native.CONNECTING === 'number' ? Native.CONNECTING : 0;
    WebSocket.OPEN = typeof Native.OPEN === 'number' ? Native.OPEN : 1;
    WebSocket.CLOSING = typeof Native.CLOSING === 'number' ? Native.CLOSING : 2;
    WebSocket.CLOSED = typeof Native.CLOSED === 'number' ? Native.CLOSED : 3;
    WebSocket.__fsbSafariWorkerGuard = true;
    g.WebSocket = WebSocket;
    return true;
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
      nativeMessaging: !isChrome,
      // Safari tints any toolbar icon it detects as grayscale, so
      // utils/action-icon.js draws its frames from the warm-white copy of the
      // tile and keeps that faint color in every frame.
      tintsGrayscaleToolbarIcon: !isChrome
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

  // Verbs with no DOM equivalent whose CDP handler has its own path for this
  // platform, so ai/tool-executor.js sends them to the handler instead of
  // failing them: utils/screenshot-capture.js captures through
  // tabs.captureVisibleTab when chrome.debugger is missing.
  var CDP_PLATFORM_HANDLED = ['cdpCaptureScreenshot'];

  // ---------------------------------------------------------------------------
  // Workspace surface (Safari has no sidePanel; we use a popup-type window)
  // ---------------------------------------------------------------------------

  // dock, while the workspace window is docked to a browser window:
  //   { contentWindowId, panelWindowId, panelWidth, content, panel, rev }
  // content and panel are { left, top, width, height } as last applied, and rev
  // goes up every time the worker docks or re-snaps the pair.
  var _workspace = { path: DEFAULT_WORKSPACE_PATH, windowId: null, tabId: null, lastContentTabId: null, dock: null };
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
      path: _workspace.path,
      dock: _workspace.dock
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
          // Unlike the ids above, a cleared dock has to reach every context:
          // the page that follows the browser window must stop when the
          // worker undocks, and the worker must see where the page moved it.
          if (Object.prototype.hasOwnProperty.call(saved, 'dock')) _workspace.dock = saved.dock || null;
        }
        if (data && data[CONTENT_TAB_KEY] != null) _workspace.lastContentTabId = data[CONTENT_TAB_KEY];
        var panel = data && data[PANEL_STATE_KEY];
        if (panel && panel.windows && typeof panel.windows === 'object') _panel.windows = panel.windows;
        resolve();
      }
      try {
        var out = c.storage.session.get([WORKSPACE_STATE_KEY, CONTENT_TAB_KEY, PANEL_STATE_KEY], apply);
        if (out && typeof out.then === 'function') out.then(apply, function () { resolve(); });
      } catch (_e) { resolve(); }
    });
  }

  // ---------------------------------------------------------------------------
  // Docking the workspace window to a browser window
  // ---------------------------------------------------------------------------

  function boundsOf(win) {
    return { left: win.left, top: win.top, width: win.width, height: win.height };
  }

  function hasBounds(win) {
    if (!win) return false;
    var values = [win.left, win.top, win.width, win.height];
    for (var i = 0; i < values.length; i++) {
      if (typeof values[i] !== 'number' || !isFinite(values[i])) return false;
    }
    return true;
  }

  function near(a, b) { return Math.abs(a - b) <= DOCK_TOLERANCE; }

  function sameBounds(a, b) {
    return near(a.left, b.left) && near(a.top, b.top) && near(a.width, b.width) && near(a.height, b.height);
  }

  /** Where the workspace sits: flush against the left edge of its browser window. */
  function besideBounds(win, width) {
    return { left: win.left - width, top: win.top, width: width, height: win.height };
  }

  function canDock(c) {
    return !!(c && c.windows && typeof c.windows.get === 'function' && typeof c.windows.update === 'function');
  }

  /**
   * The browser window the workspace should sit beside: the one a toolbar click
   * came from, the window of the tab an automation started on, or the last
   * focused one. Null when there is nothing to dock to, or that window is
   * fullscreen or minimized: the workspace then floats, as it always did.
   */
  async function dockTarget(c, opts) {
    if (!canDock(c)) return null;
    var win = null;
    try {
      if (opts.windowId != null) {
        win = await invoke(c.windows.get, c.windows, [opts.windowId]);
      } else if (opts.tabId != null) {
        var tab = c.tabs && typeof c.tabs.get === 'function'
          ? await invoke(c.tabs.get, c.tabs, [opts.tabId]) : null;
        if (tab && tab.windowId != null) win = await invoke(c.windows.get, c.windows, [tab.windowId]);
      } else if (typeof c.windows.getLastFocused === 'function') {
        win = await invoke(c.windows.getLastFocused, c.windows, [{ windowTypes: ['normal'] }]);
      }
    } catch (_e) { return null; }
    if (!win || win.id == null || win.id === _workspace.windowId) return null;
    if (win.type && win.type !== 'normal') return null;
    if (win.state === 'fullscreen' || win.state === 'locked-fullscreen' || win.state === 'minimized') return null;
    return hasBounds(win) ? win : null;
  }

  /**
   * Make room for the workspace beside `win` and return the bounds it should
   * take. Null when the pair cannot be docked, and `win` is then as it was.
   */
  async function dockBeside(c, win) {
    var dock = _workspace.dock;
    var rev = ((dock && dock.rev) || 0) + 1;
    // Already docked to this window, and it is no wider than the dock left it:
    // the workspace only needs putting back on its edge. A window the user has
    // widened since is treated as new, and gives up a fresh strip.
    if (dock && dock.contentWindowId === win.id && win.width <= dock.content.width + DOCK_TOLERANCE) {
      dock.content = boundsOf(win);
      dock.panel = besideBounds(win, dock.panelWidth);
      dock.rev = rev;
      return dock.panel;
    }
    if (win.width - WORKSPACE_WIDTH < DOCK_MIN_CONTENT_WIDTH) return null;
    // The browser window gives up its left-hand strip: it moves right and narrows.
    var update = { left: win.left + WORKSPACE_WIDTH, top: win.top, width: win.width - WORKSPACE_WIDTH, height: win.height };
    if (win.state === 'maximized') update.state = 'normal';
    var applied = null;
    try {
      await invoke(c.windows.update, c.windows, [win.id, update]);
      // A browser may still be applying the frame when update() resolves.
      for (var look = 0; look < 3 && !applied; look++) {
        if (look > 0) await new Promise(function (resolve) { setTimeout(resolve, 80); });
        var seen = await invoke(c.windows.get, c.windows, [win.id]);
        if (hasBounds(seen) && near(seen.width, update.width) && near(seen.left, update.left)) applied = seen;
      }
    } catch (_e) { return null; }
    if (!applied) {
      // The browser did not take the new bounds, so there is no room to dock into.
      try { await invoke(c.windows.update, c.windows, [win.id, boundsOf(win)]); } catch (_e2) { /* best effort */ }
      return null;
    }
    _workspace.dock = {
      contentWindowId: win.id,
      panelWindowId: _workspace.windowId,
      panelWidth: WORKSPACE_WIDTH,
      content: boundsOf(applied),
      panel: besideBounds(applied, WORKSPACE_WIDTH),
      rev: rev
    };
    return _workspace.dock.panel;
  }

  /**
   * Give the docked browser window its width back, but only while it still has
   * the width the dock left it with: a window the user has resized is theirs.
   */
  async function undock(c) {
    var dock = _workspace.dock;
    if (!dock) return;
    _workspace.dock = null;
    persistWorkspace();
    if (!canDock(c)) return;
    try {
      var win = await invoke(c.windows.get, c.windows, [dock.contentWindowId]);
      if (!hasBounds(win) || (win.state && win.state !== 'normal')) return;
      if (!near(win.width, dock.content.width)) return;
      await invoke(c.windows.update, c.windows, [win.id, {
        left: win.left - dock.panelWidth, top: win.top, width: win.width + dock.panelWidth, height: win.height
      }]);
    } catch (_e) { /* the browser window is gone */ }
  }

  /** Where the workspace goes for this open, or null to leave it floating. */
  async function dockFor(c, opts) {
    var target = await dockTarget(c, opts);
    if (!target) return null;
    // Docked to another browser window until now: that one gets its width back.
    if (_workspace.dock && _workspace.dock.contentWindowId !== target.id) await undock(c);
    return dockBeside(c, target);
  }

  /**
   * Keep the docked workspace on the edge of its browser window while that
   * window moves or resizes. This runs in the workspace page, which lives
   * exactly as long as its window: the worker can be evicted at any moment and
   * an alarm cannot fire often enough. It only ever moves the workspace, and
   * only in answer to the browser window changing, so it cannot chase its own
   * updates. A workspace the user drags away stays where they put it until the
   * next open docks it again.
   */
  function followDock(options) {
    options = options || {};
    var c = api();
    if (_frameReal) return Promise.resolve(null);
    if (!canDock(c) || typeof c.windows.getCurrent !== 'function') return Promise.resolve(null);
    var selfId = null;
    // What this page last saw or applied: { rev, contentWindowId, content,
    // panel, settleUntil, detached }. panel is null while a move is landing.
    var last = null;
    var settleMs = typeof options.settleMs === 'number' ? options.settleMs : DOCK_SETTLE_MS;
    var busy = false;
    var timer = null;

    async function tick() {
      if (busy || selfId == null) return;
      busy = true;
      try {
        await hydrateWorkspace();
        var dock = _workspace.dock;
        if (!dock || dock.panelWindowId !== selfId) { last = null; return; }
        var win = null;
        // A browser window that closed leaves the dock for the worker to clear.
        try { win = await invoke(c.windows.get, c.windows, [dock.contentWindowId]); } catch (_e) { last = null; return; }
        var self = await invoke(c.windows.get, c.windows, [selfId]);
        if (!hasBounds(win) || !hasBounds(self)) return;
        if (win.state && win.state !== 'normal') return;
        if (!last || last.rev !== dock.rev || last.contentWindowId !== dock.contentWindowId) {
          // Docked or re-snapped by an open since this page last looked. Where
          // the workspace itself ended up is read once the move has landed: a
          // browser may still be applying it when the call that made it
          // resolves, and a late landing must not read as the user's drag.
          last = {
            rev: dock.rev, contentWindowId: dock.contentWindowId, content: boundsOf(win),
            panel: null, settleUntil: Date.now() + settleMs, detached: false
          };
          return;
        }
        if (last.detached) return;
        if (!last.panel) {
          if (Date.now() >= last.settleUntil) last.panel = boundsOf(self);
        } else if (!sameBounds(self, last.panel)) {
          last.detached = true;
          return;
        }
        if (sameBounds(win, last.content)) return;
        var edge = besideBounds(win, self.width);
        await invoke(c.windows.update, c.windows, [selfId, edge]);
        last.content = boundsOf(win);
        last.panel = null;
        last.settleUntil = Date.now() + settleMs;
        // Closing the workspace restores the width against this record. An
        // open that docked again in the meantime owns it, so re-read first.
        await hydrateWorkspace();
        var current = _workspace.dock;
        if (!current || current.rev !== last.rev || current.panelWindowId !== selfId) return;
        current.content = last.content;
        current.panel = edge;
        persistWorkspace();
      } catch (_e) { /* the next change tries again */ } finally { busy = false; }
    }

    return invoke(c.windows.getCurrent, c.windows, []).then(function (self) {
      // Only the popup-type workspace window is ever docked.
      if (!self || self.id == null || (self.type && self.type !== 'popup')) return null;
      selfId = self.id;
      if (options.poll !== false) {
        if (c.windows.onBoundsChanged && typeof c.windows.onBoundsChanged.addListener === 'function') {
          c.windows.onBoundsChanged.addListener(function () { tick(); });
          tick();
        } else if (typeof globalScope.setInterval === 'function') {
          timer = globalScope.setInterval(tick, DOCK_FOLLOW_MS);
        }
      }
      return {
        tick: tick,
        stop: function () {
          if (timer != null && typeof globalScope.clearInterval === 'function') globalScope.clearInterval(timer);
          timer = null;
        }
      };
    }, function () { return null; });
  }

  // ---------------------------------------------------------------------------
  // In-page panel
  //
  // Safari has no side panel, and a workspace window cannot sit beside a
  // full-screen browser window. So wherever the page can hold it, the panel is
  // FSB's own page in an iframe that content/panel-host.js pins to the left
  // edge of the web page. The worker places it. The page inside is the same
  // ui/sidepanel.html the workspace window shows.
  // ---------------------------------------------------------------------------

  var _panelHost = false;         // true in the context that places panels: the worker
  var _panel = { windows: {} };   // windowId -> true while the panel is on in that window

  function persistPanel() {
    var payload = {};
    payload[PANEL_STATE_KEY] = { windows: _panel.windows };
    writeSession(payload);
  }

  // The panel's page sits in a cross-origin frame, out of reach of the page
  // inspector, so what the worker did for it goes to the extension log.
  function panelLog(message, data) {
    try {
      var logger = typeof automationLogger !== 'undefined' ? automationLogger : globalScope.automationLogger;
      if (logger && typeof logger.info === 'function') logger.info('[Panel] ' + message, data || {});
    } catch (_e) { /* a log line is never worth a failure */ }
  }

  // Only web pages can hold the panel. A tab whose address the browser will not
  // reveal is tried anyway: the injection settles it.
  function canHostPanel(tab) {
    if (!tab || tab.id == null || tab.windowId == null) return false;
    if (tab.windowId === _workspace.windowId) return false;
    return typeof tab.url !== 'string' || !tab.url || /^https?:\/\//i.test(tab.url);
  }

  async function panelTabFor(c, opts) {
    try {
      if (opts.tabId != null && typeof c.tabs.get === 'function') {
        return await invoke(c.tabs.get, c.tabs, [opts.tabId]);
      }
      if (opts.windowId != null && typeof c.tabs.query === 'function') {
        var active = await invoke(c.tabs.query, c.tabs, [{ active: true, windowId: opts.windowId }]);
        return (active && active[0]) || null;
      }
    } catch (_e) { return null; }
    return resolveTargetTab();
  }

  /** Ask the tab's content script about its panel. Its answer, or null. */
  async function panelMessage(c, tabId, action, extra) {
    var message = { action: action };
    if (extra) Object.keys(extra).forEach(function (key) { message[key] = extra[key]; });
    try {
      var reply = await Promise.race([
        invoke(c.tabs.sendMessage, c.tabs, [tabId, message, { frameId: 0 }]),
        // Safari does not fail a send to a tab with no content script quickly.
        new Promise(function (resolve) { setTimeout(function () { resolve(null); }, PANEL_REPLY_MS); })
      ]);
      return reply && typeof reply === 'object' ? reply : null;
    } catch (_e) { return null; }
  }

  async function showPanel(c, tab) {
    if (!canHostPanel(tab)) return false;
    var show = { url: c.runtime.getURL(_workspace.path), width: PANEL_WIDTH };
    var reply = await panelMessage(c, tab.id, 'fsbPanelShow', show);
    if (!reply) {
      // No content script answered, so there is none to probe: inject one.
      var ensure = globalScope.ensureContentScriptInjected;
      if (typeof ensure !== 'function') return false;
      try {
        if (typeof globalScope.fsbNoteContentScriptAbsent === 'function') globalScope.fsbNoteContentScriptAbsent(tab.id);
      } catch (_e) { /* best effort */ }
      try { await ensure(tab.id); } catch (_e2) { return false; }
      reply = await panelMessage(c, tab.id, 'fsbPanelShow', show);
    }
    return !!(reply && reply.shown === true);
  }

  async function hidePanelIn(c, windowId) {
    delete _panel.windows[windowId];
    persistPanel();
    try {
      var tabs = await invoke(c.tabs.query, c.tabs, [{ windowId: windowId }]);
      (tabs || []).forEach(function (tab) {
        if (tab && tab.id != null) panelMessage(c, tab.id, 'fsbPanelHide');
      });
    } catch (_e) { /* the window is gone */ }
  }

  /**
   * Show the panel for this open, or close it when a toolbar click finds it
   * already showing, as Chrome's own side panel toggles. Null when the page
   * cannot hold a panel, which leaves the workspace window to open instead.
   */
  async function openPanel(c, opts) {
    if (!c.tabs || typeof c.tabs.sendMessage !== 'function') return null;
    var tab = await panelTabFor(c, opts);
    if (!canHostPanel(tab)) {
      panelLog('this page cannot hold the panel, opening the workspace window', { tabId: tab ? tab.id : null });
      return null;
    }
    // A toolbar click names its window and no tab. An automation names a tab,
    // and must never close the panel it is about to report into.
    var fromToolbar = opts.windowId != null && opts.tabId == null;
    if (fromToolbar && _panel.windows[tab.windowId]) {
      var state = await panelMessage(c, tab.id, 'fsbPanelState');
      if (state && state.shown === true) {
        await hidePanelIn(c, tab.windowId);
        panelLog('closed', { windowId: tab.windowId });
        return { surface: 'panel', tabId: tab.id, closed: true };
      }
    }
    if (!(await showPanel(c, tab))) {
      panelLog('the page did not take the panel, opening the workspace window', { tabId: tab.id });
      return null;
    }
    _panel.windows[tab.windowId] = true;
    persistPanel();
    panelLog('shown', { tabId: tab.id, windowId: tab.windowId });
    // One surface at a time: the panel replaces an open workspace window.
    if (_workspace.windowId != null && c.windows && typeof c.windows.remove === 'function') {
      try { invoke(c.windows.remove, c.windows, [_workspace.windowId]).catch(function () {}); } catch (_e) { /* ignore */ }
    }
    return { surface: 'panel', tabId: tab.id };
  }

  // ---------------------------------------------------------------------------
  // Calls from the panel's page to the worker
  //
  // An extension page embedded in a web page has the whole extension API on
  // Safari, but a tabs.* or windows.* lookup made from it takes the host page
  // down (WebKit bug 327823; seen on Safari 26.5 with tabs.query, getCurrent,
  // windows.getCurrent, getAll and getLastFocused). Events, runtime messaging,
  // storage and i18n are fine there. So inside the panel those two namespaces
  // are stand-ins that ask the worker, over a port, to make the call.
  // ---------------------------------------------------------------------------

  var FRAME_RPC_METHODS = {
    tabs: ['query', 'get', 'getCurrent', 'create', 'update', 'remove', 'reload', 'goBack', 'goForward', 'duplicate'],
    windows: ['get', 'getAll', 'getCurrent', 'getLastFocused', 'create', 'update', 'remove']
  };

  function copyOf(source, extra) {
    var out = {};
    Object.keys(source || {}).forEach(function (key) { out[key] = source[key]; });
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  /** Worker side: make one call for the panel that sits in sender.tab. */
  async function answerFrameRpc(c, call, sender) {
    var ns = call.ns;
    var method = call.method;
    var args = Array.isArray(call.args) ? call.args.slice() : [];
    var host = sender.tab;
    if (ns === 'fsbPanel') {
      if (method === 'hostTab') return invoke(c.tabs.get, c.tabs, [host.id]);
      if (method === 'close') {
        // The close may be what woke the worker. Until the saved panel state
        // is back, _panel.windows is empty and saving it would erase every
        // other window's panel.
        if (_hydrating) { try { await _hydrating; } catch (_e) { /* best effort */ } }
        await hidePanelIn(c, host.windowId);
        return true;
      }
      if (method === 'openOptions') { await invoke(c.runtime.openOptionsPage, c.runtime, []); return true; }
      throw new Error('Unknown panel call: ' + method);
    }
    var allowed = FRAME_RPC_METHODS[ns];
    if (!allowed || allowed.indexOf(method) === -1 || !c[ns]) {
      throw new Error(ns + '.' + method + ' is not available to the panel');
    }
    // "Current" is the tab and window the panel sits in. The worker has neither.
    if (ns === 'tabs') {
      if (method === 'getCurrent') return invoke(c.tabs.get, c.tabs, [host.id]);
      if (method === 'query' && args[0] && typeof args[0] === 'object') {
        var query = copyOf(args[0]);
        if (query.currentWindow === true || query.lastFocusedWindow === true) {
          delete query.currentWindow;
          delete query.lastFocusedWindow;
          query.windowId = host.windowId;
        }
        args[0] = query;
      }
      if (method === 'create' && args[0] && typeof args[0] === 'object' && args[0].windowId == null) {
        args[0] = copyOf(args[0], { windowId: host.windowId });
      }
      var takesTabId = method === 'update' || method === 'reload' || method === 'goBack' || method === 'goForward';
      if (takesTabId && typeof args[0] !== 'number') args.unshift(host.id);
    } else {
      if (method === 'getCurrent' || method === 'getLastFocused') {
        return invoke(c.windows.get, c.windows, [host.windowId].concat(args.slice(0, 1)));
      }
      if ((method === 'get' || method === 'update' || method === 'remove') && args[0] === c.windows.WINDOW_ID_CURRENT
          && typeof args[0] === 'number') {
        args[0] = host.windowId;
      }
    }
    if (typeof c[ns][method] !== 'function') throw new Error(ns + '.' + method + ' is not available to the panel');
    return invoke(c[ns][method], c[ns], args);
  }

  /** Worker side: answer the panel pages' ports. */
  function serveFrameRpc(c) {
    if (!c.runtime || !c.runtime.onConnect || typeof c.runtime.onConnect.addListener !== 'function') return;
    c.runtime.onConnect.addListener(function (port) {
      if (!port || port.name !== FRAME_RPC_PORT) return;
      var sender = port.sender || {};
      // Only FSB's own page, embedded in a tab, may make these calls.
      if (!sender.tab || sender.tab.id == null || !isExtensionUrl(sender.url) || !(sender.frameId > 0)) {
        try { port.disconnect(); } catch (_e) { /* ignore */ }
        return;
      }
      port.onMessage.addListener(function (call) {
        if (!call || call.id == null) return;
        var answer = function (reply) {
          reply.id = call.id;
          try { port.postMessage(reply); } catch (_e) { /* the panel is gone */ }
        };
        answerFrameRpc(c, call, sender).then(
          function (value) {
            panelLog('call answered', { call: call.ns + '.' + call.method, tabId: sender.tab.id });
            answer({ value: value === undefined ? null : value });
          },
          function (error) {
            var message = String((error && error.message) || error);
            panelLog('call failed', { call: call.ns + '.' + call.method, tabId: sender.tab.id, error: message });
            answer({ error: message });
          }
        );
      });
    });
  }

  var _frameReal = null;   // in the panel's page: the browser's own API object
  var _rpcPort = null;
  var _rpcSeq = 0;
  var _rpcWaiting = {};

  /** An extension page shown inside a web page: the in-page panel. */
  function isEmbeddedPage(g) {
    if (!isExtensionPage(g)) return false;
    try { return g.top !== g.self; } catch (_e) { return true; }
  }

  function rpcPort() {
    if (_rpcPort) return _rpcPort;
    var port = _frameReal.runtime.connect({ name: FRAME_RPC_PORT });
    port.onMessage.addListener(function (reply) {
      var waiting = reply && _rpcWaiting[reply.id];
      if (!waiting) return;
      delete _rpcWaiting[reply.id];
      if (reply.error) waiting.reject(new Error(reply.error));
      else waiting.resolve(reply.value);
    });
    port.onDisconnect.addListener(function () {
      if (_rpcPort === port) _rpcPort = null;
      var pending = _rpcWaiting;
      _rpcWaiting = {};
      Object.keys(pending).forEach(function (id) { pending[id].reject(new Error('The background worker went away')); });
    });
    _rpcPort = port;
    return port;
  }

  /** Panel side: have the worker make a call. Promise, or callback if one is passed. */
  function frameRpc(ns, method, args) {
    var list = Array.prototype.slice.call(args || []);
    var callback = list.length && typeof list[list.length - 1] === 'function' ? list.pop() : null;
    var promise = new Promise(function (resolve, reject) {
      var id = ++_rpcSeq;
      _rpcWaiting[id] = { resolve: resolve, reject: reject };
      setTimeout(function () {
        if (!_rpcWaiting[id]) return;
        delete _rpcWaiting[id];
        reject(new Error(ns + '.' + method + ' was not answered'));
      }, FRAME_RPC_MS);
      try {
        rpcPort().postMessage({ id: id, ns: ns, method: method, args: list });
      } catch (error) {
        delete _rpcWaiting[id];
        _rpcPort = null;
        reject(error);
      }
    });
    if (!callback) return promise;
    promise.then(function (value) { callback(value); }, function () { callback(undefined); });
    return undefined;
  }

  /**
   * Panel side: swap the global chrome/browser for a copy whose tabs and
   * windows ask the worker. The browser's own object cannot have those two
   * replaced, but the global that names it can be. False when it could not be
   * done, and then the page must not run.
   */
  function installFrameFacade(g) {
    var real = api(g);
    if (!real || !real.runtime || typeof real.runtime.connect !== 'function' || typeof Proxy !== 'function') return false;
    function standIn(ns) {
      var native = real[ns] || {};
      return new Proxy({}, {
        get: function (_target, name) {
          if (typeof name !== 'string') return undefined;
          var value = native[name];
          // Events and constants are safe in an embedded page and stay native.
          if (/^on[A-Z]/.test(name) || (value !== undefined && typeof value !== 'function')) return value;
          return function () { return frameRpc(ns, name, arguments); };
        }
      });
    }
    var facade = Object.create(real);
    ['tabs', 'windows'].forEach(function (ns) {
      Object.defineProperty(facade, ns, { value: standIn(ns), enumerable: true, configurable: true, writable: true });
    });
    try {
      g.chrome = facade;
      g.browser = facade;
    } catch (_e) { return false; }
    if (g.chrome !== facade) return false;
    _frameReal = real;
    // runtime.openOptionsPage opens a tab from this page: the same hazard.
    try {
      real.runtime.openOptionsPage = function () { return frameRpc('fsbPanel', 'openOptions', arguments); };
    } catch (_e2) { /* it stays the browser's own */ }
    return true;
  }

  async function openWorkspace(opts) {
    opts = opts || {};
    var c = api();
    if (!c) throw unavailable('openWorkspace', 'no extension API');
    // Inside the in-page panel there is nothing to open: this is it.
    if (_frameReal) return { surface: 'panel' };
    // A stale window id is self-healing: windows.update rejects on a window the
    // user closed while the worker was down, and the catch below falls through
    // to windows.create.
    if (_hydrating) { try { await _hydrating; } catch (_e) { /* best effort */ } }
    // The workspace page keeps the dock record current as the browser window
    // moves, so read it again before docking against it.
    if (canDock(c)) { try { await hydrateWorkspace(); } catch (_e) { /* best effort */ } }
    if (opts.path) _workspace.path = opts.path;
    var url = c.runtime.getURL(_workspace.path);

    // 0. The panel inside the page, wherever the page can hold one. Only the
    //    worker can place it. A page that asks gets the window below.
    if (_panelHost) {
      var inPage = await openPanel(c, opts);
      if (inPage) return inPage;
    }

    // 1. Focus an existing workspace window, back beside the browser window
    //    this open came from.
    if (_workspace.windowId != null && c.windows && typeof c.windows.update === 'function') {
      try {
        var focus = { focused: true };
        var spot = await dockFor(c, opts);
        if (spot) { focus.left = spot.left; focus.top = spot.top; focus.width = spot.width; focus.height = spot.height; }
        await invoke(c.windows.update, c.windows, [_workspace.windowId, focus]);
        if (_workspace.dock) {
          _workspace.dock.panelWindowId = _workspace.windowId;
          persistWorkspace();
        }
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
    //    docked beside the browser so the user watches the agent work. Where
    //    it cannot be docked it opens wherever the browser puts it.
    if (c.windows && typeof c.windows.create === 'function') {
      var place = await dockFor(c, opts);
      try {
        var createInfo = { url: url, type: 'popup', width: WORKSPACE_WIDTH, height: WORKSPACE_HEIGHT };
        if (place) {
          createInfo.left = place.left;
          createInfo.top = place.top;
          createInfo.width = place.width;
          createInfo.height = place.height;
        }
        var win = await invoke(c.windows.create, c.windows, [createInfo]);
        if (win && win.id != null) {
          _workspace.windowId = win.id;
          if (win.tabs && win.tabs.length && win.tabs[0] && win.tabs[0].id != null) {
            _workspace.tabId = win.tabs[0].id;
          }
          if (place && _workspace.dock) {
            _workspace.dock.panelWindowId = win.id;
            // A browser may place a new window by its own rules: move it once.
            if (!hasBounds(win) || !sameBounds(win, place)) {
              try {
                await invoke(c.windows.update, c.windows, [win.id, {
                  left: place.left, top: place.top, width: place.width, height: place.height
                }]);
              } catch (_e2) { /* it stays where it opened */ }
            }
          }
          persistWorkspace();
          return { surface: 'window', windowId: _workspace.windowId, tabId: _workspace.tabId };
        }
      } catch (_e) { /* fall through to tab */ }
      // No window to dock after all: the browser window gets its width back.
      if (place) await undock(c);
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
    // The in-page panel is closed by the worker, which owns its state.
    if (_frameReal) {
      frameRpc('fsbPanel', 'close', []).catch(function () {});
      return;
    }
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
    // The in-page panel drives the page it sits in.
    if (_frameReal) {
      try { return await frameRpc('fsbPanel', 'hostTab', []); } catch (_e) { return null; }
    }
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
        if (isContentTab(known)) return known;
      } catch (_e) { _workspace.lastContentTabId = null; }
    }

    // Cold cache. The unscoped query below returns the active tab of EVERY
    // window in no particular order, so with two browser windows it can hand
    // back a background one. Ask for the focused content window first.
    var lastFocused = await lastFocusedContentTab(c);
    if (lastFocused) return lastFocused;

    var active = await invoke(c.tabs.query, c.tabs, [{ active: true }]);
    if (Array.isArray(active)) {
      for (var i = 0; i < active.length; i += 1) {
        if (isContentTab(active[i])) return active[i];
      }
    }
    return null;
  }

  /** A real browser window that is not the FSB workspace itself. */
  function isContentWindow(windowId) {
    return typeof windowId === 'number' && windowId >= 0 && windowId !== _workspace.windowId;
  }

  /**
   * A tab the agent may act on. The URL check alone is not enough: a tab whose
   * URL the browser withholds reads as a content page, and the workspace's own
   * tab must never be one, so its window rules it out as well.
   */
  function isContentTab(tab) {
    if (!tab || tab.id == null || isExtensionUrl(tab.url)) return false;
    return tab.windowId == null || isContentWindow(tab.windowId);
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

  // windowTypes:['normal'] skips the workspace, which is a popup window. A
  // browser that ignores the filter can still return the workspace; the
  // isContentWindow check turns that into a miss rather than a wrong answer.
  async function lastFocusedContentTab(c) {
    if (!c.windows || typeof c.windows.getLastFocused !== 'function') return null;
    try {
      var win = await invoke(c.windows.getLastFocused, c.windows, [{ windowTypes: ['normal'] }]);
      if (win && isContentWindow(win.id)) return await activeContentTabIn(c, win.id);
    } catch (_e) { /* no normal window open */ }
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
          if (isContentTab(tab)) {
            _workspace.lastContentTabId = tab.id;
            persistContentTab();
          }
          // The panel lives in its page: a tab switched to needs its own.
          if (tab && _panel.windows[tab.windowId]) showPanel(c, tab);
        }).catch(function () {});
      }));
    }
    if (c.tabs.onUpdated && typeof c.tabs.onUpdated.addListener === 'function') {
      // And so does every page loaded in a window that has the panel on.
      c.tabs.onUpdated.addListener(whenHydrated(function (_tabId, info, tab) {
        if (!info || info.status !== 'complete' || !tab) return;
        if (!_panel.windows[tab.windowId] || tab.active === false) return;
        showPanel(c, tab);
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
        var dock = _workspace.dock;
        if (dock && dock.panelWindowId === windowId) {
          // The workspace closed: its browser window gets the width back. The
          // record names the workspace itself, because a page that closes its
          // own window has already cleared the id below.
          undock(c);
        } else if (dock && dock.contentWindowId === windowId) {
          _workspace.dock = null;
          persistWorkspace();
        }
        if (windowId === _workspace.windowId) {
          _workspace.windowId = null;
          _workspace.tabId = null;
          persistWorkspace();
        }
        if (_panel.windows[windowId]) {
          delete _panel.windows[windowId];
          persistPanel();
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

    if (isServiceWorker(scope) && guardWorkerWebSocket(scope)) result.installed.push('WebSocket.workerGuard');

    // Safari's service worker has no runtime.onSuspend, and background.js
    // registers on it at top level. addListener on undefined throws a
    // TypeError that aborts the worker's initial evaluation, which Safari
    // reports as the background failing to load.
    if (c.runtime && !c.runtime.onSuspend) {
      c.runtime.onSuspend = noopEvent();
      result.installed.push('runtime.onSuspend');
    }

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

    if (opts.trackTabs !== false) {
      trackContentTabs();
      // The context that tracks tabs is the worker: it places the in-page
      // panel and answers the calls its page cannot make for itself.
      _panelHost = true;
      serveFrameRpc(c);
    }

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
    CDP_PLATFORM_HANDLED: CDP_PLATFORM_HANDLED,
    install: install,
    unavailable: unavailable,
    openWorkspace: openWorkspace,
    closeSurface: closeSurface,
    followDock: followDock,
    embedded: false,
    isEmbeddedPage: isEmbeddedPage,
    installFrameFacade: installFrameFacade,
    resolveTargetTab: resolveTargetTab,
    registerLoopback: registerLoopback,
    captureLoopback: captureLoopback,
    dispatchLoopback: dispatchLoopback,
    isLoopbackMessage: isLoopbackMessage,
    _workspaceState: function () { return _workspace; },
    _panelState: function () { return _panel; },
    _reset: function () {
      _installed = false;
      _hydrating = null;
      _localListeners.length = 0;
      _loopbackDepth = 0;
      _capturingLoopback = false;
      _workspace = { path: DEFAULT_WORKSPACE_PATH, windowId: null, tabId: null, lastContentTabId: null, dock: null };
      _panel = { windows: {} };
      _panelHost = false;
      _frameReal = null;
      _rpcPort = null;
      _rpcWaiting = {};
      FsbPlatform.embedded = false;
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
    var embedded = isEmbeddedPage(globalScope);
    if (embedded && !installFrameFacade(globalScope)) {
      // Without the stand-ins this page's own tab lookups would take the host
      // page down with it. Stop here: the scripts after this one never load.
      try { globalScope.stop(); } catch (_e) { /* ignore */ }
    } else {
      FsbPlatform.embedded = embedded;
      FsbPlatform.install({ loopback: false, trackTabs: false });
      // In the workspace window this keeps it beside its browser window. Every
      // other extension page is not a popup-type window and gets nothing.
      if (!embedded) followDock();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FsbPlatform: FsbPlatform, detect: detect, buildCaps: buildCaps };
  }

  try {
    console.log(TAG, 'boot: platform=' + FsbPlatform.id);
  } catch (_e) { /* swallow if console unavailable */ }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
