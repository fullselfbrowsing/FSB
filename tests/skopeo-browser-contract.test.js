/**
 * Real-Chrome mechanics contract for the production Skopeo content stack.
 *
 * This runner intentionally uses only Node built-ins. It loads the classic
 * production script from a local file, records browser-computed state into one
 * DOM result node, and removes its isolated Chrome profile in every outcome.
 */

'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const url = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const SHELL_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-shell.js');
const RUNTIME_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-runtime.js');
const COMPOSER_PATH = path.join(ROOT, 'extension', 'content', 'skopeo-adaptive-composer.js');
const SHELL_RED_MARKER = 'skopeo hud shell renderer contract: RED';
const ASK_SHELL_RED_MARKER = 'skopeo ask shell contract: RED';

const RESOURCE_KEYS = Object.freeze([
  'roots',
  'listeners',
  'observers',
  'timeouts',
  'intervals',
  'animationFrames',
  'animations',
  'focusHooks',
  'pointerSurfaces',
  'pendingRenders',
  'popoverTopLayer'
]);

// Local Chrome mechanics remain distinct from live_approved host evidence.
// The adaptive catalog contract exercises these representative genres through
// the same shell/runtime rather than installing a genre-specific content bundle.
const ADAPTIVE_GENRES = Object.freeze([
  'reader-knowledge',
  'communication',
  'document-editor',
  'worklist-record',
  'dashboard-admin',
  'transactional',
  'media-feed',
  'generic-app',
  'drive-docs-deep-pack'
]);

const STORAGE_SENTINEL_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2dC46GPLDGHL3UG1geWLmHe0KQu6rIVq3M4RUtkg58niFksdIF/wi+YpTk5jRvAbCJV9rdQ1wOfCOBHFFFpno28DQCopGFfHwWhfUX9yUi2oStAXLCnOAzw6NUxRzjSneI4BCf22Vd/xYoyTmaOMi3ZOy7mn4cZ+fobLnujX/gori1b69rRoCpviXeP9h/CaAVH5KwWMe8DeEolz9+HHw4nzWsy77AaV36VFfPAvDrHjy6u0uqtIMyL2A4kvvZ9hIC45qEXRW2DIf0leJM7kVJxlJJp9DP9/7AnWPP+iH7sAK8USU3IEy9ySWbSDV8Z8jhxYqNX1SA2Khp7PDi4BuwIDAQAB';

const CHROME_PATHS = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/google/chrome/chrome',
  '/snap/bin/chromium'
]);

function resolveChrome() {
  const searched = [];
  const candidates = [];
  if (process.env.CHROME_BIN) candidates.push(process.env.CHROME_BIN);
  candidates.push(...CHROME_PATHS);
  for (const candidate of candidates) {
    if (!candidate || searched.includes(candidate)) continue;
    searched.push(candidate);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return { executable: candidate, searched };
    } catch (_error) {
      // Keep searching documented local executable paths.
    }
  }
  assert.fail('Required local Chrome executable not found. Searched:\n' + searched.map(value => '  - ' + value).join('\n'));
}

function shellRendererSeamState() {
  const shell = fs.readFileSync(SHELL_PATH, 'utf8');
  const runtime = fs.readFileSync(RUNTIME_PATH, 'utf8');
  const composer = fs.readFileSync(COMPOSER_PATH, 'utf8');
  new Function(shell);
  new Function(runtime);
  new Function(composer);
  assert.match(runtime, /renderContractView\s*\(/,
    'controlled shell RED requires the already-installed content routing seam');
  assert.match(runtime, /withdrawContractProjection\s*\(/,
    'controlled shell RED requires synchronous runtime withdrawal');
  assert.match(composer, /validateContractViewModel\s*\(/,
    'controlled shell RED requires the closed contract model validator');
  assert.match(composer, /skopeo-contract-view\/1/,
    'controlled shell RED requires the Phase 57 model version');
  return Object.freeze({
    renderContractView: /\brenderContractView\s*\(/.test(shell)
  });
}

function runShellRendererControlledRed() {
  assert.deepEqual(shellRendererSeamState(), Object.freeze({ renderContractView: false }),
    'controlled shell RED is valid only while the exact production renderer is absent');
  console.log(SHELL_RED_MARKER);
}

function askShellSeamState() {
  const shell = fs.readFileSync(SHELL_PATH, 'utf8');
  const runtime = fs.readFileSync(RUNTIME_PATH, 'utf8');
  const composer = fs.readFileSync(COMPOSER_PATH, 'utf8');
  new Function(shell);
  new Function(runtime);
  new Function(composer);
  assert.match(runtime, /composeContractAsk\s*\(/,
    'controlled Ask shell RED preserves the installed content Ask lifecycle');
  assert.match(composer, /skopeo-contract-ask\/1/,
    'controlled Ask shell RED preserves the closed Ask model version');
  return Object.freeze({
    ask: /\brenderContractAsk\s*\(/.test(shell),
    confirmation: /\brenderContractConfirmation\s*\(/.test(shell)
  });
}

function runAskShellControlledRed() {
  assert.deepEqual(askShellSeamState(), Object.freeze({ ask: false, confirmation: false }),
    'controlled Ask shell RED is valid only while both Phase 58 renderers are absent');
  console.log(ASK_SHELL_RED_MARKER);
}

function fixtureHtml(scriptUrls) {
  function escapedScriptUrl(name) {
    return String(scriptUrls[name]).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
  const escapedSchemaUrl = escapedScriptUrl('schema');
  const escapedRouterUrl = escapedScriptUrl('router');
  const escapedResolverUrl = escapedScriptUrl('resolver');
  const escapedRegistryUrl = escapedScriptUrl('registry');
  const escapedAdaptersUrl = escapedScriptUrl('adapters');
  const escapedHudSchemaUrl = escapedScriptUrl('hudSchema');
  const escapedComposerUrl = escapedScriptUrl('composer');
  const escapedRenderersUrl = escapedScriptUrl('renderers');
  const escapedShellUrl = escapedScriptUrl('shell');
  const escapedRuntimeUrl = escapedScriptUrl('runtime');
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Skopeo browser contract</title></head>
<body>
  <pre id="skopeo-contract-result"></pre>
  <script>
    window.__skopeoRuntimeListeners = [];
    window.chrome = {
      runtime: {
        id: 'skopeo-browser-contract-fixture',
        onMessage: {
          addListener: function (listener) { window.__skopeoRuntimeListeners.push(listener); },
          removeListener: function (listener) {
            var index = window.__skopeoRuntimeListeners.indexOf(listener);
            if (index >= 0) window.__skopeoRuntimeListeners.splice(index, 1);
          }
        },
        sendMessage: function () { return Promise.resolve({ success: true }); }
      }
    };
  </script>
  <script src="${escapedSchemaUrl}"></script>
  <script src="${escapedRouterUrl}"></script>
  <script src="${escapedResolverUrl}"></script>
  <script src="${escapedRegistryUrl}"></script>
  <script src="${escapedAdaptersUrl}"></script>
  <script src="${escapedHudSchemaUrl}"></script>
  <script src="${escapedComposerUrl}"></script>
  <script src="${escapedRenderersUrl}"></script>
  <script src="${escapedShellUrl}"></script>
  <script src="${escapedRuntimeUrl}"></script>
  <script>
  (async function () {
    'use strict';
    var resultNode = document.getElementById('skopeo-contract-result');
    var keys = ${JSON.stringify(RESOURCE_KEYS)};

    function snapshot(shell) {
      var source = shell.getResourceSnapshot();
      var result = {};
      keys.forEach(function (key) { result[key] = source[key]; });
      return result;
    }

    function computedHost(host) {
      var style = getComputedStyle(host);
      return {
        position: style.position,
        top: style.top,
        right: style.right,
        bottom: style.bottom,
        left: style.left,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex
      };
    }

    function withThrowingPopover(callback) {
      var descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
      Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        writable: true,
        value: function () { throw new Error('forced popover fallback'); }
      });
      try {
        return callback();
      } finally {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, 'showPopover', descriptor);
        else delete HTMLElement.prototype.showPopover;
      }
    }

    function runShell(generation, forceFallback) {
      var shell = FSBSkopeoShell.createShell({
        document: document,
        window: window,
        generation: generation
      });
      var before = snapshot(shell);
      var prepared = shell.prepareAmbient();
      if (!prepared) throw new Error('prepareAmbient failed in local Chrome fixture');
      var mounted = forceFallback
        ? withThrowingPopover(function () { return shell.mountAmbient(prepared); })
        : shell.mountAmbient(prepared);
      if (!mounted) throw new Error('mountAmbient failed in local Chrome fixture');
      var host = document.querySelector('[data-skopeo-generation="' + generation + '"]');
      if (!host) throw new Error('mounted Skopeo host missing');
      var open = snapshot(shell);
      var computed = computedHost(host);
      var popoverOpen = host.matches(':popover-open');
      var after = shell.destroy('browser-contract');
      return {
        before: before,
        open: open,
        after: after,
        computed: computed,
        popoverOpen: popoverOpen,
        hostRemoved: !document.querySelector('[data-skopeo-generation="' + generation + '"]')
      };
    }

    function deepFocus(root, node) {
      return {
        documentIsHost: document.activeElement === root.host,
        shadowIsExpected: root.activeElement === node,
        shadowLabel: root.activeElement && (root.activeElement.getAttribute('aria-label') || root.activeElement.textContent)
      };
    }

    function dispatchTab(target, shiftKey) {
      target.focus({ preventScroll: true });
      var event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: !!shiftKey,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    function runFocusContract() {
      var fixtureToken = Object.freeze({ fixture: true });
      var shell = FSBSkopeoShell.createShell({
        document: document,
        window: window,
        generation: 3,
        fixtureToken: fixtureToken,
        allowControlledFixture: true
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared) || !shell.enableControlledFixture(fixtureToken)) {
        throw new Error('focus fixture failed to mount');
      }
      var host = document.querySelector('[data-skopeo-generation="3"]');
      var root = shell.getControlledTestRoot(fixtureToken);
      if (host.shadowRoot !== null || !root) throw new Error('focus fixture did not keep a closed root');
      shell.render('anchored', {});
      var anchor = root.querySelector('[aria-label="Open anchor mark demo"]');
      anchor.focus({ preventScroll: true });
      shell.render('focused', {});
      var title = root.querySelector('.skopeo-focused-title');
      var focusedEntry = deepFocus(root, title);
      var trigger = root.querySelector('[aria-label="Open consequence preview"]');
      trigger.focus({ preventScroll: true });
      shell.render('interstitial', {});
      var safe = root.querySelector('[aria-label="Return to focused demo"]');
      var middle = root.querySelector('[aria-label="Continue demo"]');
      var last = root.querySelector('[aria-label="Back to focused view"]');
      var gateEntry = deepFocus(root, safe);
      var firstPrevented = dispatchTab(safe, false);
      var firstFocus = deepFocus(root, safe);
      var middlePrevented = dispatchTab(middle, false);
      var middleFocus = deepFocus(root, middle);
      var lastPrevented = dispatchTab(last, false);
      var lastWrap = deepFocus(root, safe);
      var reversePrevented = dispatchTab(safe, true);
      var reverseWrap = deepFocus(root, last);
      shell.back();
      var gateBack = deepFocus(root, trigger);
      shell.back();
      var focusedBack = deepFocus(root, anchor);
      var after = shell.destroy('browser-focus-contract');
      return {
        focusedEntry: focusedEntry,
        gateEntry: gateEntry,
        firstPrevented: firstPrevented,
        firstFocus: firstFocus,
        middlePrevented: middlePrevented,
        middleFocus: middleFocus,
        lastPrevented: lastPrevented,
        lastWrap: lastWrap,
        reversePrevented: reversePrevented,
        reverseWrap: reverseWrap,
        gateBack: gateBack,
        focusedBack: focusedBack,
        after: after
      };
    }

    function rectValue(rect) {
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    }

    function sameSnapshot(left, right) {
      return keys.every(function (key) { return left[key] === right[key]; });
    }

    function intersects(left, right, clearance) {
      var amount = Number(clearance) || 0;
      return left.left < right.right + amount &&
        left.right > right.left - amount &&
        left.top < right.bottom + amount &&
        left.bottom > right.top - amount;
    }

    function runPrepareCommitContract() {
      var movedFixtureToken = Object.freeze({ fixture: true });
      var movedShell = FSBSkopeoShell.createShell({
        document: document,
        window: window,
        generation: 6,
        fixtureToken: movedFixtureToken,
        allowControlledFixture: true
      });
      var movedPrepared = movedShell.prepareAmbient();
      if (!movedPrepared) throw new Error('prepare/commit mutation fixture failed to prepare');
      var movedControl = document.createElement('button');
      movedControl.type = 'button';
      movedControl.textContent = 'Inserted over prepared rectangle';
      movedControl.style.position = 'fixed';
      movedControl.style.top = '16px';
      movedControl.style.right = '16px';
      movedControl.style.width = '240px';
      movedControl.style.height = '40px';
      document.body.appendChild(movedControl);
      movedControl.focus({ preventScroll: true });
      var movedChildrenBefore = Array.from(document.documentElement.childNodes);
      var movedFocusBefore = document.activeElement;
      var movedBefore = snapshot(movedShell);
      var movedMounted = movedShell.mountAmbient(movedPrepared);
      var movedHost = document.querySelector('[data-skopeo-generation="6"]');
      var movedRoot = movedShell.getControlledTestRoot(movedFixtureToken);
      var movedLens = movedHost && movedRoot && movedRoot.querySelector('.skopeo-lens');
      var movedLensRect = movedLens ? rectValue(movedLens.getBoundingClientRect()) : null;
      var movedControlRect = rectValue(movedControl.getBoundingClientRect());
      var movedOpen = snapshot(movedShell);
      var movedResult = {
        before: movedBefore,
        mounted: movedMounted,
        rootCount: document.querySelectorAll('[data-skopeo-shell-root]').length,
        placementCorner: movedLens && movedLens.getAttribute('data-placement-corner'),
        overlap: !!(movedLensRect && intersects(movedLensRect, movedControlRect, 8)),
        focusPreserved: document.activeElement === movedFocusBefore,
        childrenPreserved: movedChildrenBefore.every(function (node, index) {
          return document.documentElement.childNodes[index] === node;
        }),
        open: movedOpen
      };
      movedResult.after = movedShell.destroy('browser-prepare-commit-moved');
      movedControl.remove();

      var blockedShell = FSBSkopeoShell.createShell({
        document: document,
        window: window,
        generation: 7
      });
      var blockedPrepared = blockedShell.prepareAmbient();
      if (!blockedPrepared) throw new Error('blocked prepare/commit fixture failed to prepare');
      var blocker = document.createElement('button');
      blocker.type = 'button';
      blocker.textContent = 'Block every Ambient candidate';
      blocker.style.position = 'fixed';
      blocker.style.inset = '0';
      blocker.style.width = '100vw';
      blocker.style.height = '100vh';
      document.body.appendChild(blocker);
      blocker.focus({ preventScroll: true });
      var blockedChildrenBefore = Array.from(document.documentElement.childNodes);
      var blockedFocusBefore = document.activeElement;
      var blockedBefore = snapshot(blockedShell);
      var blockedMounted = blockedShell.mountAmbient(blockedPrepared);
      var blockedHost = document.querySelector('[data-skopeo-generation="7"]');
      var blockedOpen = snapshot(blockedShell);
      var blockedResult = {
        before: blockedBefore,
        mounted: blockedMounted,
        rootCount: document.querySelectorAll('[data-skopeo-shell-root]').length,
        popoverOpen: !!(blockedHost && blockedHost.matches(':popover-open')),
        focusPreserved: document.activeElement === blockedFocusBefore,
        childrenPreserved: blockedChildrenBefore.length === document.documentElement.childNodes.length &&
          blockedChildrenBefore.every(function (node, index) {
            return document.documentElement.childNodes[index] === node;
          }),
        open: blockedOpen
      };
      blockedResult.after = blockedShell.destroy('browser-prepare-commit-blocked');
      blocker.remove();
      return { moved: movedResult, blocked: blockedResult };
    }

    function runCollisionContract(documentRef, windowRef, generation) {
      var origin = documentRef.createElement('button');
      origin.type = 'button';
      origin.textContent = 'Required host control';
      origin.style.position = 'fixed';
      origin.style.left = '16px';
      origin.style.bottom = '16px';
      origin.style.width = '120px';
      origin.style.height = '40px';
      documentRef.body.appendChild(origin);
      origin.focus({ preventScroll: true });

      var fixtureToken = Object.freeze({ fixture: true });
      var shell = FSBSkopeoShell.createShell({
        document: documentRef,
        window: windowRef,
        generation: generation,
        fixtureToken: fixtureToken,
        allowControlledFixture: true
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared) || !shell.enableControlledFixture(fixtureToken)) {
        throw new Error('collision fixture failed to mount');
      }
      var host = documentRef.querySelector('[data-skopeo-generation="' + generation + '"]');
      var root = shell.getControlledTestRoot(fixtureToken);
      shell.render('anchored', {});
      var anchor = root.querySelector('[data-skopeo-primitive="anchor"]');
      anchor.focus({ preventScroll: true });
      var safeFocused = shell.render('focused', {});
      var focusedRect = rectValue(root.querySelector('.skopeo-focused-card').getBoundingClientRect());
      shell.back();

      origin.style.bottom = '';
      origin.style.left = String(focusedRect.left + focusedRect.width / 3) + 'px';
      origin.style.top = String(focusedRect.top + 24) + 'px';
      origin.style.width = '48px';
      var focusedBeforeNodes = Array.from(shell._surface.childNodes);
      var focusedBeforeResources = snapshot(shell);
      var focusedBeforeFocus = root.activeElement;
      var collideFocused = shell.render('focused', {});
      var focusedRollback = !collideFocused &&
        host.getAttribute('data-attention') === 'anchored' &&
        focusedBeforeNodes.length === shell._surface.childNodes.length &&
        focusedBeforeNodes.every(function (node, index) { return node === shell._surface.childNodes[index]; }) &&
        root.activeElement === focusedBeforeFocus &&
        sameSnapshot(focusedBeforeResources, snapshot(shell));
      var focusedUnsafeText = root.querySelector('[aria-live="polite"]').textContent;

      origin.style.top = '';
      origin.style.left = '16px';
      origin.style.bottom = '16px';
      origin.style.width = '120px';
      if (!shell.render('focused', {})) throw new Error('safe Focused recommit failed');
      var trigger = root.querySelector('[aria-label="Open consequence preview"]');
      trigger.focus({ preventScroll: true });
      var safeGate = shell.render('interstitial', {});
      var gateRect = rectValue(root.querySelector('.skopeo-gate').getBoundingClientRect());
      shell.back();
      origin.style.bottom = '';
      origin.style.left = String(gateRect.left + gateRect.width / 3) + 'px';
      origin.style.top = String(gateRect.top + 24) + 'px';
      origin.style.width = '48px';
      var gateBeforeNodes = Array.from(shell._surface.childNodes);
      var gateBeforeResources = snapshot(shell);
      var gateBeforeFocus = root.activeElement;
      var collideGate = shell.render('interstitial', {});
      var gateRollback = !collideGate &&
        host.getAttribute('data-attention') === 'focused' &&
        gateBeforeNodes.length === shell._surface.childNodes.length &&
        gateBeforeNodes.every(function (node, index) { return node === shell._surface.childNodes[index]; }) &&
        root.activeElement === gateBeforeFocus &&
        sameSnapshot(gateBeforeResources, snapshot(shell));
      var gateUnsafeText = root.querySelector('[aria-live="polite"]').textContent;
      var after = shell.destroy('browser-collision-contract');
      origin.remove();
      return {
        viewport: { width: windowRef.innerWidth, height: windowRef.innerHeight },
        safeFocused: safeFocused,
        focusedRect: focusedRect,
        collideFocused: collideFocused,
        focusedRollback: focusedRollback,
        focusedUnsafeText: focusedUnsafeText,
        safeGate: safeGate,
        gateRect: gateRect,
        collideGate: collideGate,
        gateRollback: gateRollback,
        gateUnsafeText: gateUnsafeText,
        after: after
      };
    }

    function runNarrowCollisionContract() {
      var frame = document.createElement('iframe');
      frame.setAttribute('title', 'Narrow Skopeo browser contract');
      frame.setAttribute('width', '420');
      frame.setAttribute('height', '700');
      frame.style.width = '420px';
      frame.style.height = '700px';
      frame.style.border = '0';
      document.body.appendChild(frame);
      var result = runCollisionContract(frame.contentDocument, frame.contentWindow, 5);
      frame.remove();
      return result;
    }

    function setFixedRect(node, rect) {
      node.style.position = 'fixed';
      node.style.left = String(rect.left) + 'px';
      node.style.top = String(rect.top) + 'px';
      node.style.right = '';
      node.style.bottom = '';
      node.style.width = String(rect.width) + 'px';
      node.style.height = String(rect.height) + 'px';
    }

    function sameNodes(expected, actual) {
      return expected.length === actual.length && expected.every(function (node, index) {
        return node === actual[index];
      });
    }

    function createRichShell(documentRef, windowRef, generation) {
      var origin = documentRef.createElement('button');
      origin.type = 'button';
      origin.textContent = 'Resize-required host control';
      setFixedRect(origin, { left: 16, top: Math.max(360, windowRef.innerHeight - 72), width: 120, height: 40 });
      documentRef.body.appendChild(origin);
      origin.focus({ preventScroll: true });
      var fixtureToken = Object.freeze({ fixture: true });
      var shell = FSBSkopeoShell.createShell({
        document: documentRef,
        window: windowRef,
        generation: generation,
        fixtureToken: fixtureToken,
        allowControlledFixture: true
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared) || !shell.enableControlledFixture(fixtureToken)) {
        throw new Error('rich resize fixture failed to mount');
      }
      var host = documentRef.querySelector('[data-skopeo-generation="' + generation + '"]');
      var root = shell.getControlledTestRoot(fixtureToken);
      if (!shell.render('anchored', {})) throw new Error('rich resize fixture failed to enter Anchored');
      var anchor = root.querySelector('[data-skopeo-primitive="anchor"]');
      anchor.focus({ preventScroll: true });
      return {
        shell: shell,
        host: host,
        root: root,
        origin: origin,
        anchor: anchor,
        anchoredScope: shell._activeSurfaceScope,
        anchoredNodes: Array.from(shell._surface.childNodes),
        anchoredResources: snapshot(shell)
      };
    }

    function nextAnimationFrame(windowRef) {
      return new Promise(function (resolve) { windowRef.requestAnimationFrame(resolve); });
    }

    async function runRichResizeContract(documentRef, windowRef, generationBase, resizeViewport) {
      var widthBefore = windowRef.innerWidth;
      var focused = createRichShell(documentRef, windowRef, generationBase);
      if (!focused.shell.render('focused', {})) throw new Error('resize Focused fixture failed to open');
      var focusedScope = focused.shell._activeSurfaceScope;
      var focusedNodes = Array.from(focused.shell._surface.childNodes);
      var focusedFocus = focused.root.activeElement;
      var focusedResources = snapshot(focused.shell);
      var focusedLive = focused.root.querySelector('[aria-live="polite"]').textContent;
      if (typeof resizeViewport === 'function') resizeViewport();
      var widthAfter = windowRef.innerWidth;
      documentRef.dispatchEvent(new Event('scroll'));
      if (windowRef.visualViewport) {
        windowRef.visualViewport.dispatchEvent(new Event('scroll'));
        windowRef.visualViewport.dispatchEvent(new Event('resize'));
      }
      var focusedSafePreserved = focused.shell._attention === 'focused' &&
        focused.shell._activeSurfaceScope === focusedScope &&
        sameNodes(focusedNodes, Array.from(focused.shell._surface.childNodes)) &&
        focused.root.activeElement === focusedFocus &&
        focused.root.querySelector('[aria-live="polite"]').textContent === focusedLive &&
        sameSnapshot(focusedResources, snapshot(focused.shell)) &&
        documentRef.querySelectorAll('[data-skopeo-shell-root]').length === 1;
      var focusedRect = rectValue(focused.root.querySelector('.skopeo-focused-card').getBoundingClientRect());
      setFixedRect(focused.origin, {
        left: focusedRect.left + focusedRect.width / 3,
        top: focusedRect.top + 24,
        width: 48,
        height: 40
      });
      await nextAnimationFrame(windowRef);
      var focusedFinalCard = focused.root.querySelector('.skopeo-focused-card');
      var focusedResult = {
        safePreserved: focusedSafePreserved,
        ownedFrame: focusedResources.animationFrames === 1,
        finalAttention: focused.shell._attention,
        restoredScope: focused.shell._activeSurfaceScope === focused.anchoredScope,
        restoredNodes: sameNodes(focused.anchoredNodes, Array.from(focused.shell._surface.childNodes)),
        restoredFocus: focused.root.activeElement === focused.anchor,
        rootCount: documentRef.querySelectorAll('[data-skopeo-shell-root]').length,
        resourcesRestored: sameSnapshot(focused.anchoredResources, snapshot(focused.shell)),
        releasedFrame: snapshot(focused.shell).animationFrames === 0,
        noOverlap: !focusedFinalCard || !intersects(rectValue(focusedFinalCard.getBoundingClientRect()), rectValue(focused.origin.getBoundingClientRect()), 8)
      };
      focusedResult.after = focused.shell.destroy('browser-focused-resize');
      focused.origin.remove();

      var gate = createRichShell(documentRef, windowRef, generationBase + 1);
      if (!gate.shell.render('focused', {})) throw new Error('resize Gate fixture failed to enter Focused');
      var gateFocusedScope = gate.shell._activeSurfaceScope;
      var gateFocusedNodes = Array.from(gate.shell._surface.childNodes);
      var gateFocusedResources = snapshot(gate.shell);
      var gateFocusedRect = rectValue(gate.root.querySelector('.skopeo-focused-card').getBoundingClientRect());
      var trigger = gate.root.querySelector('[aria-label="Open consequence preview"]');
      trigger.focus({ preventScroll: true });
      if (!gate.shell.render('interstitial', {})) throw new Error('resize Gate fixture failed to open');
      var gateScope = gate.shell._activeSurfaceScope;
      var gateNodes = Array.from(gate.shell._surface.childNodes);
      var gateFocus = gate.root.activeElement;
      var gateResources = snapshot(gate.shell);
      var gateLive = gate.root.querySelector('[aria-live="polite"]').textContent;
      documentRef.dispatchEvent(new Event('scroll'));
      if (windowRef.visualViewport) {
        windowRef.visualViewport.dispatchEvent(new Event('scroll'));
        windowRef.visualViewport.dispatchEvent(new Event('resize'));
      }
      var gateSafePreserved = gate.shell._attention === 'interstitial' &&
        gate.shell._activeSurfaceScope === gateScope &&
        sameNodes(gateNodes, Array.from(gate.shell._surface.childNodes)) &&
        gate.root.activeElement === gateFocus &&
        gate.root.querySelector('[aria-live="polite"]').textContent === gateLive &&
        sameSnapshot(gateResources, snapshot(gate.shell)) &&
        documentRef.querySelectorAll('[data-skopeo-shell-root]').length === 1;
      var gateRect = rectValue(gate.root.querySelector('.skopeo-gate').getBoundingClientRect());
      var narrow = windowRef.innerWidth < 480;
      if (narrow) {
        setFixedRect(gate.origin, {
          left: gateRect.left + gateRect.width / 3,
          top: gateRect.top + 24,
          width: 48,
          height: 40
        });
      } else {
        setFixedRect(gate.origin, {
          left: gateRect.left + 1,
          top: gateRect.top + 32,
          width: Math.max(1, gateFocusedRect.left - gateRect.left - 12),
          height: 32
        });
      }
      var gateOriginRect = rectValue(gate.origin.getBoundingClientRect());
      var restoredFocusedIsSafe = gateFocusedRect.left >= 16 && gateFocusedRect.top >= 16 &&
        gateFocusedRect.right <= windowRef.innerWidth - 16 && gateFocusedRect.bottom <= windowRef.innerHeight - 16 &&
        !intersects(gateFocusedRect, gateOriginRect, 8);
      await nextAnimationFrame(windowRef);
      var gateFinalCard = gate.root.querySelector('.skopeo-focused-card');
      var expectedAttention = restoredFocusedIsSafe ? 'focused' : 'anchored';
      var gateResult = {
        safePreserved: gateSafePreserved,
        ownedFrame: gateResources.animationFrames === 1,
        finalAttention: gate.shell._attention,
        expectedAttention: expectedAttention,
        restoredScope: restoredFocusedIsSafe
          ? gate.shell._activeSurfaceScope === gateFocusedScope
          : gate.shell._activeSurfaceScope === gate.anchoredScope,
        restoredNodes: restoredFocusedIsSafe
          ? sameNodes(gateFocusedNodes, Array.from(gate.shell._surface.childNodes))
          : sameNodes(gate.anchoredNodes, Array.from(gate.shell._surface.childNodes)),
        restoredFocus: restoredFocusedIsSafe
          ? gate.root.activeElement === trigger
          : gate.root.activeElement === gate.anchor,
        rootCount: documentRef.querySelectorAll('[data-skopeo-shell-root]').length,
        resourcesRestored: restoredFocusedIsSafe
          ? sameSnapshot(gateFocusedResources, snapshot(gate.shell))
          : sameSnapshot(gate.anchoredResources, snapshot(gate.shell)),
        releasedFrame: restoredFocusedIsSafe
          ? snapshot(gate.shell).animationFrames === 1
          : snapshot(gate.shell).animationFrames === 0,
        noOverlap: !gateFinalCard || !intersects(rectValue(gateFinalCard.getBoundingClientRect()), rectValue(gate.origin.getBoundingClientRect()), 8)
      };
      gateResult.after = gate.shell.destroy('browser-gate-resize');
      gate.origin.remove();
      return {
        viewport: { before: widthBefore, after: widthAfter },
        focused: focusedResult,
        gate: gateResult
      };
    }

    async function runNarrowRichResizeContract() {
      var frame = document.createElement('iframe');
      frame.setAttribute('title', 'Narrow rich resize Skopeo contract');
      frame.setAttribute('width', '640');
      frame.setAttribute('height', '700');
      frame.style.width = '640px';
      frame.style.height = '700px';
      frame.style.border = '0';
      document.body.appendChild(frame);
      var result = await runRichResizeContract(frame.contentDocument, frame.contentWindow, 10, function () {
        frame.setAttribute('width', '420');
        frame.style.width = '420px';
        void frame.offsetWidth;
      });
      frame.remove();
      return result;
    }

    function addRightPlacementBlocker(fixture, documentRef) {
      var placement = fixture.shell._currentPlacement;
      if (!placement || placement.corner !== 'top-right') {
        throw new Error('restored placement fixture did not begin at top-right');
      }
      var blocker = documentRef.createElement('button');
      blocker.type = 'button';
      blocker.textContent = 'Right placement blocker';
      setFixedRect(blocker, placement.rect);
      documentRef.body.appendChild(blocker);
      return blocker;
    }

    function currentPlacementIsLeftAndClear(shell, blocker) {
      var placement = shell._currentPlacement;
      return !!placement && placement.corner === 'top-left' &&
        !intersects(rectValue(placement.rect), rectValue(blocker.getBoundingClientRect()), 8);
    }

    function anchoredRestorationResult(fixture, blocker, documentRef) {
      var rail = fixture.root.querySelector('[data-skopeo-primitive="rail"]');
      return {
        attention: fixture.shell._attention,
        scope: fixture.shell._activeSurfaceScope === fixture.anchoredScope,
        nodes: sameNodes(fixture.anchoredNodes, Array.from(fixture.shell._surface.childNodes)),
        focus: fixture.root.activeElement === fixture.anchor,
        railLeft: !!rail && rail.style.left === '16px' && rail.style.right === '',
        placementClear: currentPlacementIsLeftAndClear(fixture.shell, blocker),
        resources: sameSnapshot(fixture.anchoredResources, snapshot(fixture.shell)),
        frameReleased: snapshot(fixture.shell).animationFrames === 0,
        rootCount: documentRef.querySelectorAll('[data-skopeo-shell-root]').length
      };
    }

    function runRestoredPlacementContract(documentRef, windowRef, generationBase) {
      var focused = createRichShell(documentRef, windowRef, generationBase);
      var focusedInitialRail = focused.root.querySelector('[data-skopeo-primitive="rail"]');
      var focusedInitialRight = focusedInitialRail.style.right === '16px' && focusedInitialRail.style.left === '';
      if (!focused.shell.render('focused', {})) throw new Error('restored Focused placement fixture failed to open');
      var focusedScope = focused.shell._activeSurfaceScope;
      var focusedNodes = Array.from(focused.shell._surface.childNodes);
      var focusedFocus = focused.root.activeElement;
      var focusedResources = snapshot(focused.shell);
      var focusedLive = focused.root.querySelector('[aria-live="polite"]').textContent;
      var focusedBlocker = addRightPlacementBlocker(focused, documentRef);
      windowRef.dispatchEvent(new Event('resize'));
      var focusedRichPreserved = focused.shell._attention === 'focused' &&
        focused.shell._activeSurfaceScope === focusedScope &&
        sameNodes(focusedNodes, Array.from(focused.shell._surface.childNodes)) &&
        focused.root.activeElement === focusedFocus &&
        sameSnapshot(focusedResources, snapshot(focused.shell));
      var focusedCurrentLeft = currentPlacementIsLeftAndClear(focused.shell, focusedBlocker);
      var focusedBack = focused.shell.back();
      var focusedResult = anchoredRestorationResult(focused, focusedBlocker, documentRef);
      focusedResult.initialRight = focusedInitialRight;
      focusedResult.richPreserved = focusedRichPreserved;
      focusedResult.currentLeft = focusedCurrentLeft;
      focusedResult.oneBack = focusedBack;
      focusedResult.liveCopy = focused.root.querySelector('[aria-live="polite"]').textContent === focusedLive;
      focusedResult.after = focused.shell.destroy('browser-focused-placement-restoration');
      focusedBlocker.remove();
      focused.origin.remove();

      var gate = createRichShell(documentRef, windowRef, generationBase + 1);
      var gateInitialRail = gate.root.querySelector('[data-skopeo-primitive="rail"]');
      var gateInitialRight = gateInitialRail.style.right === '16px' && gateInitialRail.style.left === '';
      if (!gate.shell.render('focused', {})) throw new Error('restored Gate placement fixture failed to enter Focused');
      var gateFocusedScope = gate.shell._activeSurfaceScope;
      var gateFocusedNodes = Array.from(gate.shell._surface.childNodes);
      var trigger = gate.root.querySelector('[aria-label="Open consequence preview"]');
      trigger.focus({ preventScroll: true });
      var gateFocusedResources = snapshot(gate.shell);
      if (!gate.shell.render('interstitial', {})) throw new Error('restored Gate placement fixture failed to open');
      var gateScope = gate.shell._activeSurfaceScope;
      var gateNodes = Array.from(gate.shell._surface.childNodes);
      var gateFocus = gate.root.activeElement;
      var gateResources = snapshot(gate.shell);
      var gateLive = gate.root.querySelector('[aria-live="polite"]').textContent;
      var gateBlocker = addRightPlacementBlocker(gate, documentRef);
      windowRef.dispatchEvent(new Event('resize'));
      var gateRichPreserved = gate.shell._attention === 'interstitial' &&
        gate.shell._activeSurfaceScope === gateScope &&
        sameNodes(gateNodes, Array.from(gate.shell._surface.childNodes)) &&
        gate.root.activeElement === gateFocus &&
        sameSnapshot(gateResources, snapshot(gate.shell));
      var gateCurrentLeft = currentPlacementIsLeftAndClear(gate.shell, gateBlocker);
      var gateBack = gate.shell.back();
      var focusedRestore = {
        attention: gate.shell._attention === 'focused',
        scope: gate.shell._activeSurfaceScope === gateFocusedScope,
        nodes: sameNodes(gateFocusedNodes, Array.from(gate.shell._surface.childNodes)),
        focus: gate.root.activeElement === trigger,
        resources: sameSnapshot(gateFocusedResources, snapshot(gate.shell)),
        frameOwned: snapshot(gate.shell).animationFrames === 1,
        rootCount: documentRef.querySelectorAll('[data-skopeo-shell-root]').length,
        placementClear: currentPlacementIsLeftAndClear(gate.shell, gateBlocker)
      };
      var focusedBack = gate.shell.back();
      var gateResult = anchoredRestorationResult(gate, gateBlocker, documentRef);
      gateResult.initialRight = gateInitialRight;
      gateResult.richPreserved = gateRichPreserved;
      gateResult.currentLeft = gateCurrentLeft;
      gateResult.gateBack = gateBack;
      gateResult.focusedRestore = focusedRestore;
      gateResult.focusedBack = focusedBack;
      gateResult.liveCopy = gate.root.querySelector('[aria-live="polite"]').textContent === gateLive;
      gateResult.after = gate.shell.destroy('browser-gate-placement-restoration');
      gateBlocker.remove();
      gate.origin.remove();

      return { focused: focusedResult, gate: gateResult };
    }

    function runNarrowRestoredPlacementContract() {
      var frame = document.createElement('iframe');
      frame.setAttribute('title', 'Narrow restored placement Skopeo contract');
      frame.setAttribute('width', '420');
      frame.setAttribute('height', '700');
      frame.style.width = '420px';
      frame.style.height = '700px';
      frame.style.border = '0';
      document.body.appendChild(frame);
      var result = runRestoredPlacementContract(frame.contentDocument, frame.contentWindow, 14);
      frame.remove();
      return result;
    }

    function runCorpusEnrollmentContract() {
      var sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.textContent = 'Corpus host sentinel';
      sentinel.setAttribute('data-corpus-host', 'unchanged');
      sentinel.style.cssText = 'position:absolute;left:24px;top:24px;width:144px;height:32px;';
      document.body.appendChild(sentinel);
      sentinel.focus({ preventScroll: true });
      var hostBefore = {
        data: sentinel.getAttribute('data-corpus-host'),
        style: sentinel.getAttribute('style'),
        text: sentinel.textContent,
        connected: sentinel.isConnected,
        focused: document.activeElement === sentinel
      };
      var fixtureToken = Object.freeze({ corpusFixture: true });
      var actions = [];
      var shell = FSBSkopeoShell.createShell({
        document: document,
        window: window,
        generation: 18,
        fixtureToken: fixtureToken,
        allowControlledFixture: true,
        onCorpusAction: function(payload) { actions.push(payload); return true; }
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared)) throw new Error('corpus enrollment shell failed to mount');
      var focusPreservedAtMount = document.activeElement === sentinel;
      var root = shell.getControlledTestRoot(fixtureToken);
      var plateau = snapshot(shell);
      var accessibility = null;
      var maxEnrollmentButtons = 0;
      for (var cycle = 0; cycle < 100; cycle += 1) {
        var actionToken = 'browser_corpus_18_' + String(cycle + 1);
        var model = FSBSkopeoAdaptiveComposer.composeCorpus({
          authority: {
            generation: 18,
            exactOrigin: 'https://drive.google.com',
            profileId: 'drive-deep-pack-v1',
            profileVersion: 'skopeo-profiles-v2',
            contextEpoch: cycle + 1
          },
          semanticEntity: {
            kind: 'drive-folder',
            id: 'browser-folder-fixture',
            label: 'Current fixture folder'
          },
          actionToken: actionToken,
          projection: {
            mode: 'enrollment',
            actionToken: actionToken
          }
        });
        if (!model || shell.renderCorpus(model) !== true) {
          throw new Error('corpus enrollment model failed at cycle ' + String(cycle));
        }
        var buttons = root.querySelectorAll('.skopeo-corpus-enroll');
        maxEnrollmentButtons = Math.max(maxEnrollmentButtons, buttons.length);
        if (buttons.length !== 1) throw new Error('corpus enrollment button count drifted');
        var button = buttons[0];
        if (cycle === 0) {
          button.focus({ preventScroll: true });
          accessibility = {
            text: button.textContent,
            ariaLabel: button.getAttribute('aria-label'),
            type: button.getAttribute('type'),
            documentOwnsHost: document.activeElement === root.host,
            shadowOwnsButton: root.activeElement === button
          };
          button.click();
          button.click();
        }
        if (shell.withdrawCorpus() !== true || root.querySelector('.skopeo-corpus-region')) {
          throw new Error('corpus enrollment withdrawal left residue');
        }
      }
      var afterCycles = snapshot(shell);
      sentinel.focus({ preventScroll: true });
      var zero = shell.destroy('browser-corpus-enrollment');
      var hostAfter = {
        data: sentinel.getAttribute('data-corpus-host'),
        style: sentinel.getAttribute('style'),
        text: sentinel.textContent,
        connected: sentinel.isConnected,
        focused: document.activeElement === sentinel
      };
      var rootCount = document.querySelectorAll('[data-skopeo-generation="18"]').length;
      sentinel.remove();
      return {
        cycles: 100,
        accessibility: accessibility,
        actionCount: actions.length,
        maxEnrollmentButtons: maxEnrollmentButtons,
        focusPreservedAtMount: focusPreservedAtMount,
        plateau: plateau,
        afterCycles: afterCycles,
        zero: zero,
        rootCount: rootCount,
        hostBefore: hostBefore,
        hostAfter: hostAfter
      };
    }

    function browserContractProjection(mode, generation) {
      var reading = mode === 'reading';
      var body;
      var result = 'complete';
      if (mode === 'folder') {
        result = 'empty';
        body = {
          manifestState: 'complete', vendorCount: 0, vendors: [], vendorOverflow: 0,
          nextMaterialDates: [], nextMaterialDateOverflow: 0,
          urgentGaps: [], urgentGapOverflow: 0, emptyState: 'complete-empty'
        };
      } else if (reading) {
        body = {
          documentLabel: 'Agreement " onclick=alert(1)', sourceState: 'ready',
          readingState: 'review-required',
          governingAction: { state: 'clause', actionToken: 'browser-primary-opaque' },
          facts: [
            {
              type: 'effective', value: 'Effective January 1, 2026', evidenceRole: 'governing',
              trustState: 'accepted', citationLabel: 'Section 2, page 3',
              actionToken: 'browser-effective-opaque'
            },
            {
              type: 'renewal', value: 'Renews July 1, 2027', evidenceRole: 'governing',
              trustState: 'extracted', citationLabel: 'Section 8, page 9',
              actionToken: 'browser-renewal-opaque'
            }
          ],
          factOverflow: 0,
          gaps: [{ type: 'version-conflict', priority: 'urgent' }], gapOverflow: 0,
          policyDocument: 'on-file', memoRequirement: 'not-evaluated',
          notificationDelivery: {
            version: 'skopeo-alert-public-status/1', state: 'scheduled',
            summary: 'Local alert scheduled',
            detail: 'Skopeo will recheck current evidence before showing this local alert.',
            deadlineCivilDate: '2027-05-31', alertCivilDate: '2027-03-02',
            action: {
              actionId: 'browser-alert-remove-owner-opaque',
              kind: 'remove-current-owner-mapping',
              label: 'Remove current owner mapping', requiresConfirmation: true
            }
          }, emptyState: 'not-empty'
        };
      } else {
        result = 'closed';
        body = { reason: 'access-unavailable' };
      }
      return {
        version: 'skopeo-hud-projection/1', generation: generation,
        exactOrigin: reading || mode === 'contract-closed'
          ? 'https://docs.google.com' : 'https://drive.google.com',
        profileVersion: 'profile-v57', contextEpoch: 12,
        semanticEntityToken: reading || mode === 'contract-closed'
          ? 'docs-document:browser-current' : 'drive-folder:browser-current',
        requestActionToken: 'browser-request-current',
        projectionToken: 'browser-projection-current',
        mode: mode,
        currentness: mode === 'contract-closed' ? 'closed' : 'current',
        result: result,
        body: body
      };
    }

    function browserContractModel(mode, generation) {
      var projection = FsbSkopeoHudSchema.parseProjection(browserContractProjection(mode, generation));
      if (!projection) throw new Error('browser Phase 57 projection failed schema validation: ' + mode);
      var model = FSBSkopeoAdaptiveComposer.composeContractView(projection);
      if (!model) throw new Error('browser Phase 57 model failed composition: ' + mode);
      return model;
    }

    function browserAskEntryModel(generation) {
      var projectionValue = browserContractProjection('reading', generation);
      projectionValue.body.askScopes = [{
        kind: 'agreement', label: 'Current agreement · Browser fixture',
        scopeToken: 'browser-scope-current'
      }];
      var projection = FsbSkopeoHudSchema.parseProjection(projectionValue);
      if (!projection) throw new Error('browser Ask entry projection failed schema validation');
      var model = FSBSkopeoAdaptiveComposer.composeContractView(projection);
      if (!model) throw new Error('browser Ask entry model failed composition');
      return model;
    }

    function browserAskProjection(mode, generation, state) {
      var question = 'When does this agreement renew?';
      var body = {
        scope: {
          kind: 'agreement', label: 'Current agreement · Browser fixture',
          scopeToken: 'browser-scope-current'
        }
      };
      if (mode === 'ask') {
        body.question = state === 'editing' ? null : question;
        body.state = state;
        body.error = null;
      } else {
        body.question = question;
        body.answer = {
          outcome: 'review-required', evidenceComplete: true,
          conclusion: 'The cited renewal date remains informational while clearance is blocked.',
          trust: { state: 'review-required', explanation: 'A policy safeguard remains open.' },
          governingEvidence: [{
            claim: 'Renewal onclick=alert(1)', value: 'July 1, 2027', trustState: 'accepted',
            citationLabel: 'Section 8, page 9', actionToken: 'browser-answer-source-opaque'
          }],
          historyEvidence: [], conflicts: [],
          gaps: [{ type: 'document-10-missing', detail: 'Document 10 is not configured.' }],
          sources: [{
            label: 'Section 8, page 9', evidenceRole: 'governing',
            actionToken: 'browser-answer-source-opaque'
          }],
          sourceOverflow: 0
        };
        body.policy = {
          clearance: 'blocked', reasons: ['document-10-missing'],
          document10: { state: 'missing', reviewed: false }
        };
        body.policyActions = [{
          actionId: 'browser-configure-document-opaque',
          label: 'configure-document-10', requiresConfirmation: true
        }];
      }
      return {
        version: 'skopeo-hud-projection/1', generation: generation,
        exactOrigin: 'https://docs.google.com', profileVersion: 'profile-v57', contextEpoch: 12,
        semanticEntityToken: 'docs-document:browser-current',
        requestActionToken: 'browser-request-current',
        projectionToken: mode === 'answer'
          ? 'browser-answer-projection-current' : 'browser-projection-current',
        mode: mode, currentness: 'current', result: 'complete', body: body
      };
    }

    function browserAskModel(mode, generation, state) {
      var projection = FsbSkopeoHudSchema.parseProjection(
        browserAskProjection(mode, generation, state)
      );
      if (!projection) throw new Error('browser Ask projection failed schema validation: ' + mode);
      var model = FSBSkopeoAdaptiveComposer.composeContractAsk(projection);
      if (!model) throw new Error('browser Ask model failed composition: ' + mode);
      return model;
    }

    function browserConfirmationModel() {
      return Object.freeze({
        confirmationModelVersion: 'skopeo-contract-confirmation/1',
        attention: 'interstitial', mode: 'confirmation', eyebrow: 'POLICY CONFIGURATION',
        title: 'Configure Document 10',
        body: 'Future applicable decisions will require review of this document’s current accessible revision.',
        safeAction: Object.freeze({
          kind: 'confirmation-cancel', label: 'Keep current policy document'
        }),
        confirmAction: Object.freeze({
          kind: 'answer-confirm', label: 'Configure Document 10',
          actionId: 'browser-configure-document-opaque',
          confirmationToken: 'browser-confirmation-opaque'
        })
      });
    }

    function browserAlertConfirmationModel() {
      return Object.freeze({
        confirmationModelVersion: 'skopeo-contract-confirmation/1',
        attention: 'interstitial', mode: 'confirmation', eyebrow: 'LOCAL ALERT RECIPIENT',
        title: 'Remove current owner mapping',
        body: 'Future alerts for this owner will no longer be delivered to this Chrome user.',
        safeAction: Object.freeze({
          kind: 'confirmation-cancel', label: 'Keep current owner mapping'
        }),
        confirmAction: Object.freeze({
          kind: 'alert-confirm', label: 'Remove current owner mapping',
          actionId: 'browser-alert-remove-owner-opaque',
          confirmationToken: 'browser-alert-confirmation-opaque'
        })
      });
    }

    async function runAskRailContract() {
      var sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.textContent = 'Ask host sentinel';
      sentinel.setAttribute('data-phase58-host', 'unchanged');
      sentinel.style.cssText = 'position:absolute;left:24px;top:360px;width:120px;height:36px;';
      document.body.appendChild(sentinel);
      sentinel.focus({ preventScroll: true });
      var hostBefore = {
        data: sentinel.getAttribute('data-phase58-host'),
        style: sentinel.getAttribute('style'), text: sentinel.textContent,
        connected: sentinel.isConnected
      };
      var payloads = [];
      var token = Object.freeze({ askFixture: true });
      var shell = FSBSkopeoShell.createShell({
        document: document, window: window, generation: 21,
        fixtureToken: token, allowControlledFixture: true
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared)) throw new Error('Phase 58 Ask shell mount failed');
      var root = shell.getControlledTestRoot(token);
      var entryModel = browserAskEntryModel(21);
      if (!shell.renderContractView(entryModel, function(payload) {
        payloads.push(payload); return true;
      })) throw new Error('Phase 58 Ask entry render failed');
      var entry = root.querySelector('.skopeo-contract-ask-entry');
      var entryState = {
        label: entry && entry.getAttribute('aria-label'),
        type: entry && entry.getAttribute('type'),
        regionCount: root.querySelectorAll('.skopeo-contract-region').length
      };
      entry.click();

      var editing = browserAskModel('ask', 21, 'editing');
      if (!shell.renderContractAsk(editing, function(payload) {
        payloads.push(payload); return true;
      })) throw new Error('Phase 58 Ask editing render failed');
      var region = root.querySelector('.skopeo-contract-region');
      var textarea = root.querySelector('.skopeo-ask-question');
      var radio = root.querySelector('input[type="radio"]');
      textarea.value = 'When does this agreement renew?';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      var editingState = {
        regionCount: root.querySelectorAll('.skopeo-contract-region').length,
        mode: region.getAttribute('data-contract-mode'), role: region.getAttribute('role'),
        title: root.querySelector('#skopeo-contract-heading').textContent,
        textareaTag: textarea.localName, rows: textarea.getAttribute('rows'),
        minHeight: getComputedStyle(textarea).minHeight, readOnly: textarea.readOnly,
        radioType: radio.getAttribute('type'), radioChecked: radio.checked,
        controlTypes: Array.from(region.querySelectorAll('button')).map(function(button) {
          return button.getAttribute('type');
        }),
        sectionOrder: Array.from(region.querySelectorAll('[data-contract-section]')).map(function(node) {
          return node.getAttribute('data-contract-section');
        }),
        documentOwnsHost: document.activeElement === root.host,
        shadowOwnsTextarea: root.activeElement === textarea,
        horizontalClip: region.scrollWidth > region.clientWidth
      };
      root.querySelector('.skopeo-ask-primary').click();

      var checking = browserAskModel('ask', 21, 'checking');
      if (!shell.renderContractAsk(checking, function(payload) {
        payloads.push(payload); return true;
      })) throw new Error('Phase 58 Ask checking render failed');
      var checkingState = {
        readOnly: root.querySelector('.skopeo-ask-question').readOnly,
        statusRole: root.querySelector('.skopeo-ask-status').getAttribute('role'),
        statusCopy: root.querySelector('.skopeo-ask-status').textContent,
        cancelType: root.querySelector('.skopeo-ask-cancel').getAttribute('type'),
        shadowOwnsCancel: root.activeElement === root.querySelector('.skopeo-ask-cancel')
      };

      var answer = browserAskModel('answer', 21);
      if (!shell.renderContractAsk(answer, function(payload) {
        payloads.push(payload); return true;
      })) throw new Error('Phase 58 Ask answer render failed');
      region = root.querySelector('.skopeo-contract-region');
      var answerState = {
        mode: region.getAttribute('data-contract-mode'),
        outcome: root.querySelector('.skopeo-answer-banner').getAttribute('data-outcome'),
        clearance: root.querySelector('.skopeo-answer-policy-status').getAttribute('data-clearance'),
        trust: root.querySelector('.skopeo-answer-trust').getAttribute('data-trust-state'),
        sections: Array.from(region.querySelectorAll(':scope > [data-contract-section]')).map(function(node) {
          return node.getAttribute('data-contract-section');
        }),
        citationTypes: Array.from(root.querySelectorAll('.skopeo-contract-citation')).map(function(button) {
          return button.getAttribute('type');
        }),
        policyButtonType: root.querySelector('.skopeo-answer-policy-action').getAttribute('type'),
        memoCount: Array.from(region.querySelectorAll('*')).filter(function(node) {
          return /memo/i.test(node.textContent || '') && node.children.length === 0;
        }).length,
        hostileElementCount: root.querySelectorAll('img,script,iframe,a[href]').length,
        shadowOwnsResult: root.activeElement === region
      };
      Array.from(region.querySelectorAll('button')).forEach(function(button) { button.click(); });

      var confirmation = browserConfirmationModel();
      if (!shell.renderContractConfirmation(confirmation, function(payload) {
        payloads.push(payload); return true;
      })) throw new Error('Phase 58 confirmation render failed');
      region = root.querySelector('.skopeo-confirmation-region');
      var confirmationState = {
        role: region.getAttribute('role'), modal: region.getAttribute('aria-modal'),
        describedBy: region.getAttribute('aria-describedby'),
        buttonTypes: Array.from(region.querySelectorAll('button')).map(function(button) {
          return button.getAttribute('type');
        }),
        shadowOwnsSafe: root.activeElement === root.querySelector('.skopeo-confirmation-safe'),
        regionCount: root.querySelectorAll('.skopeo-contract-region').length
      };
      Array.from(region.querySelectorAll('button')).forEach(function(button) { button.click(); });
      var payloadCount = payloads.length;
      var withdrawn = shell.withdrawCorpus();
      var residue = root.querySelectorAll('.skopeo-contract-region').length;
      var hostAfter = {
        data: sentinel.getAttribute('data-phase58-host'),
        style: sentinel.getAttribute('style'), text: sentinel.textContent,
        connected: sentinel.isConnected
      };
      sentinel.focus({ preventScroll: true });
      var zero = shell.destroy('browser-ask-rail');
      var rootCount = document.querySelectorAll('[data-skopeo-generation="21"]').length;
      sentinel.remove();

      var frame = document.createElement('iframe');
      frame.title = 'Narrow Phase 58 Ask rail';
      frame.style.cssText = 'width:420px;height:700px;border:0;';
      frame.width = '420'; frame.height = '700';
      document.body.appendChild(frame);
      var narrowToken = Object.freeze({ narrowAskFixture: true });
      var narrowShell = FSBSkopeoShell.createShell({
        document: frame.contentDocument, window: frame.contentWindow, generation: 22,
        fixtureToken: narrowToken, allowControlledFixture: true
      });
      var narrowPrepared = narrowShell.prepareAmbient();
      if (!narrowPrepared || !narrowShell.mountAmbient(narrowPrepared) ||
          !narrowShell.renderContractAsk(browserAskModel('ask', 22, 'editing'), function() { return true; })) {
        throw new Error('narrow Phase 58 Ask rail failed');
      }
      var narrowRoot = narrowShell.getControlledTestRoot(narrowToken);
      var narrowRegion = narrowRoot.querySelector('.skopeo-contract-region');
      var narrowRect = narrowRegion.getBoundingClientRect();
      var narrow = {
        viewportWidth: frame.contentWindow.innerWidth,
        left: Math.round(narrowRect.left),
        right: Math.round(frame.contentWindow.innerWidth - narrowRect.right),
        width: Math.round(narrowRect.width),
        columns: narrowRegion.getAttribute('data-contract-columns'),
        minHeight: frame.contentWindow.getComputedStyle(
          narrowRoot.querySelector('.skopeo-ask-question')
        ).minHeight,
        horizontalClip: narrowRegion.scrollWidth > narrowRegion.clientWidth,
        zero: narrowShell.destroy('browser-narrow-ask')
      };
      frame.remove();
      return {
        entry: entryState, editing: editingState, checking: checkingState,
        answer: answerState, confirmation: confirmationState,
        payloadCount: payloadCount, withdrawn: withdrawn, residue: residue,
        hostBefore: hostBefore, hostAfter: hostAfter, zero: zero,
        rootCount: rootCount, narrow: narrow
      };
    }

    async function runContractRailContract() {
      var sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.textContent = 'Verified host action';
      sentinel.setAttribute('data-phase57-host', 'unchanged');
      sentinel.style.cssText = 'position:absolute;left:24px;top:240px;width:120px;height:36px;';
      document.body.appendChild(sentinel);
      sentinel.focus({ preventScroll: true });
      var hostBefore = {
        data: sentinel.getAttribute('data-phase57-host'),
        style: sentinel.getAttribute('style'),
        text: sentinel.textContent,
        focused: document.activeElement === sentinel
      };
      var token = Object.freeze({ contractFixture: true });
      var actionIds = [];
      var shell = FSBSkopeoShell.createShell({
        document: document, window: window, generation: 19,
        fixtureToken: token, allowControlledFixture: true
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared)) throw new Error('Phase 57 shell mount failed');
      var root = shell.getControlledTestRoot(token);
      var folder = browserContractModel('folder', 19);
      if (!shell.renderContractView(folder, function() { return true; })) {
        throw new Error('Phase 57 folder render failed');
      }
      var region = root.querySelector('.skopeo-contract-region');
      var style = getComputedStyle(region);
      var rect = region.getBoundingClientRect();
      var folderState = {
        regionCount: root.querySelectorAll('.skopeo-contract-region').length,
        shellCount: document.querySelectorAll('[data-skopeo-generation="19"]').length,
        role: region.getAttribute('role'),
        labelledBy: region.getAttribute('aria-labelledby'),
        tabIndex: region.getAttribute('tabindex'),
        position: style.position,
        width: Math.round(rect.width),
        right: Math.round(window.innerWidth - rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(window.innerHeight - rect.bottom),
        radius: style.borderRadius,
        padding: style.padding,
        maxHeight: region.style.maxHeight,
        overflowX: style.overflowX,
        clearance: Math.round(rect.left - sentinel.getBoundingClientRect().right),
        focusPreserved: document.activeElement === sentinel,
        emptyHeading: !!root.querySelector('.skopeo-contract-empty'),
        horizontalClip: region.scrollWidth > region.clientWidth
      };

      shell.withdrawCorpus();
      var reading = browserContractModel('reading', 19);
      if (!shell.renderContractView(reading, function(actionId) {
        actionIds.push(actionId);
        return Promise.resolve(true);
      })) throw new Error('Phase 57 reading render failed');
      region = root.querySelector('.skopeo-contract-region');
      var citationButtons = Array.from(root.querySelectorAll('.skopeo-contract-citation'));
      var alertButton = root.querySelector('.skopeo-contract-alert-action');
      var alertStatus = root.querySelector('.skopeo-contract-alert-status');
      var readingState = {
        regionCount: root.querySelectorAll('.skopeo-contract-region').length,
        mode: region.getAttribute('data-contract-mode'),
        bannerSticky: getComputedStyle(root.querySelector('.skopeo-contract-reading-banner')).position,
        definitive: root.querySelector('.skopeo-contract-reading-banner').getAttribute('data-definitive'),
        labels: citationButtons.map(function(button) { return button.getAttribute('aria-label'); }),
        types: citationButtons.map(function(button) { return button.getAttribute('type'); }),
        buttonOrder: Array.from(region.querySelectorAll('button')).map(function(button) {
          return button.getAttribute('aria-label');
        }),
        alertState: alertStatus && alertStatus.getAttribute('data-alert-state'),
        alertCopy: alertStatus && alertStatus.querySelector('strong').textContent,
        alertDates: Array.from(alertStatus.querySelectorAll('time')).map(function(node) {
          return node.getAttribute('datetime');
        }),
        alertButtonType: alertButton && alertButton.getAttribute('type'),
        hostFocusPreserved: document.activeElement === sentinel,
        hostileElementCount: root.querySelectorAll('img,script,iframe,a[href]').length
      };
      citationButtons.forEach(function(button) { button.click(); });
      alertButton.click();
      await Promise.resolve();
      await Promise.resolve();
      readingState.actionIds = actionIds.slice();

      var alertConfirmation = browserAlertConfirmationModel();
      if (!shell.renderContractConfirmation(alertConfirmation, function(payload) {
        actionIds.push(payload); return true;
      })) throw new Error('Phase 59 alert confirmation render failed');
      var alertConfirmationRegion = root.querySelector('.skopeo-confirmation-region');
      var alertConfirmationState = {
        role: alertConfirmationRegion.getAttribute('role'),
        modal: alertConfirmationRegion.getAttribute('aria-modal'),
        eyebrow: alertConfirmationRegion.querySelector('.skopeo-ask-eyebrow').textContent,
        safeLabel: root.querySelector('.skopeo-confirmation-safe').getAttribute('aria-label'),
        buttonTypes: Array.from(alertConfirmationRegion.querySelectorAll('button')).map(function(button) {
          return button.getAttribute('type');
        }),
        shadowOwnsSafe: root.activeElement === root.querySelector('.skopeo-confirmation-safe'),
        regionCount: root.querySelectorAll('.skopeo-contract-region').length
      };

      var closed = browserContractModel('contract-closed', 19);
      if (!shell.renderContractView(closed, function() { return false; })) {
        throw new Error('Phase 57 closed replacement failed');
      }
      var blocker = root.querySelector('.skopeo-contract-blocker');
      var closedState = {
        regionCount: root.querySelectorAll('.skopeo-contract-region').length,
        citationCount: root.querySelectorAll('.skopeo-contract-citation').length,
        mode: root.querySelector('.skopeo-contract-region').getAttribute('data-contract-mode'),
        role: blocker && blocker.getAttribute('role'),
        copy: blocker && blocker.textContent,
        liveCopy: root.querySelector('[aria-live="polite"]').textContent
      };
      sentinel.focus({ preventScroll: true });
      var hostAfter = {
        data: sentinel.getAttribute('data-phase57-host'),
        style: sentinel.getAttribute('style'),
        text: sentinel.textContent,
        focused: document.activeElement === sentinel
      };
      sentinel.focus({ preventScroll: true });
      var zero = shell.destroy('browser-contract-rail');
      var rootCount = document.querySelectorAll('[data-skopeo-generation="19"]').length;
      sentinel.remove();

      var frame = document.createElement('iframe');
      frame.title = 'Narrow Phase 57 rail';
      frame.style.cssText = 'width:420px;height:700px;border:0;';
      frame.width = '420';
      frame.height = '700';
      document.body.appendChild(frame);
      var narrowToken = Object.freeze({ narrowContractFixture: true });
      var narrowShell = FSBSkopeoShell.createShell({
        document: frame.contentDocument, window: frame.contentWindow, generation: 20,
        fixtureToken: narrowToken, allowControlledFixture: true
      });
      var narrowPrepared = narrowShell.prepareAmbient();
      if (!narrowPrepared || !narrowShell.mountAmbient(narrowPrepared) ||
          !narrowShell.renderContractView(browserContractModel('folder', 20), function() { return true; })) {
        throw new Error('narrow Phase 57 rail failed');
      }
      var narrowRoot = narrowShell.getControlledTestRoot(narrowToken);
      var narrowRegion = narrowRoot.querySelector('.skopeo-contract-region');
      var narrowRect = narrowRegion.getBoundingClientRect();
      var narrow = {
        viewportWidth: frame.contentWindow.innerWidth,
        left: Math.round(narrowRect.left),
        right: Math.round(frame.contentWindow.innerWidth - narrowRect.right),
        width: Math.round(narrowRect.width),
        columns: narrowRegion.getAttribute('data-contract-columns'),
        horizontalClip: narrowRegion.scrollWidth > narrowRegion.clientWidth,
        zero: narrowShell.destroy('browser-narrow-contract')
      };
      frame.remove();
      return {
        folder: folderState,
        reading: readingState,
        alertConfirmation: alertConfirmationState,
        closed: closedState,
        hostBefore: hostBefore,
        hostAfter: hostAfter,
        zero: zero,
        rootCount: rootCount,
        narrow: narrow
      };
    }

    function createBrowserLedger() {
      var nextId = 1;
      var entries = [];
      return {
        acquire: function (category, cleanup, detail) {
          if (keys.indexOf(category) < 0) throw new Error('unknown browser-ledger category: ' + category);
          var handle = Object.freeze({ id: nextId++, category: category, detail: String(detail || '') });
          entries.push({ handle: handle, cleanup: typeof cleanup === 'function' ? cleanup : null, released: false });
          return handle;
        },
        release: function (handle, options) {
          var entry = entries.find(function (candidate) { return candidate.handle === handle; });
          if (!entry || entry.released) throw new Error('invalid browser-ledger release');
          entry.released = true;
          if ((!options || options.cleanup !== false) && entry.cleanup) entry.cleanup();
          return true;
        },
        snapshot: function () {
          var result = {};
          keys.forEach(function (key) { result[key] = 0; });
          entries.forEach(function (entry) {
            if (!entry.released) result[entry.handle.category] += 1;
          });
          return result;
        }
      };
    }

    async function settleRegistry() {
      for (var index = 0; index < 12; index += 1) await Promise.resolve();
    }

    async function settleFrame() {
      await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
      await settleRegistry();
    }

    function wait(milliseconds) {
      return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
    }

    function routeEvidence(id) {
      return [
        { signal: 'exact-origin', value: 'https://drive.google.com' },
        { signal: 'trusted-context-kind', value: 'focused-ask' },
        { signal: 'drive-item-id', value: id }
      ];
    }

    function routeInput(id, suffix) {
      return {
        url: 'https://drive.google.com/drive/u/0/my-drive?fixture=' + suffix,
        contextKind: 'focused-ask',
        semanticIdentity: { kind: 'drive-file', id: id },
        evidence: routeEvidence(id)
      };
    }

    function projectionForRoute(route) {
      if (route.status === 'recognized') {
        return { status: route.status, contextKind: route.contextKind, contextEpoch: route.contextEpoch };
      }
      return { status: route.status, contextEpoch: route.contextEpoch, reason: route.reason };
    }

    function markClearance(markRect, targetRect, corner) {
      if (corner === 'top-right') return Math.min(markRect.left - targetRect.right, targetRect.top - markRect.bottom);
      if (corner === 'top-left') return Math.min(targetRect.left - markRect.right, targetRect.top - markRect.bottom);
      if (corner === 'bottom-right') return Math.min(markRect.left - targetRect.right, markRect.top - targetRect.bottom);
      return Math.min(targetRect.left - markRect.right, markRect.top - targetRect.bottom);
    }

    async function runSemanticAnchorContract() {
      resultNode.setAttribute('data-progress', 'semantic-start');
      var loadedProductionScripts = typeof FsbSkopeoProfileSchema === 'object' &&
        typeof FsbSkopeoHudSchema === 'object' &&
        typeof FSBSkopeoContextRouter === 'object' &&
        typeof FSBSkopeoAppContextResolver === 'object' &&
        typeof FSBSkopeoAnchorRegistry === 'object' &&
        typeof FSBSkopeoAdapterRegistry === 'object' &&
        typeof FSBSkopeoAdaptiveComposer === 'object' &&
        typeof FSBSkopeoRendererRegistry === 'object' &&
        typeof FSBSkopeoShell === 'object' &&
        typeof window.__FSB_SKOPEO_RUNTIME__ === 'object';
      if (!loadedProductionScripts) throw new Error('Phase 53 production stack did not load');

      var bodyStyleBefore = document.body.getAttribute('style');
      document.body.style.minHeight = '2200px';
      var sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.textContent = 'Host sentinel';
      sentinel.setAttribute('data-host-contract', 'unchanged');
      sentinel.style.cssText = 'position:fixed;left:32px;bottom:32px;width:120px;height:32px;';
      document.body.appendChild(sentinel);
      sentinel.focus({ preventScroll: true });
      var hostBefore = {
        data: sentinel.getAttribute('data-host-contract'),
        style: sentinel.getAttribute('style'),
        focused: document.activeElement === sentinel,
        selection: String(window.getSelection()),
        scrollX: window.scrollX,
        scrollY: window.scrollY
      };

      var row = document.createElement('div');
      row.setAttribute('data-skopeo-fixture-row', 'mechanics-only');
      row.setAttribute('data-skopeo-fixture-identity', 'file-A');
      row.__skopeoFixtureIdentity = 'file-A';
      row.style.cssText = 'position:absolute;left:260px;top:300px;width:120px;height:40px;background:#d7e8ff;';
      document.body.appendChild(row);

      var semanticFixtureToken = Object.freeze({ fixture: true });
      var shell = FSBSkopeoShell.createShell({
        document: document,
        window: window,
        generation: 53,
        fixtureToken: semanticFixtureToken,
        allowControlledFixture: true
      });
      var prepared = shell.prepareAmbient();
      if (!prepared || !shell.mountAmbient(prepared)) throw new Error('Phase 53 semantic shell failed to mount');
      var host = document.querySelector('[data-skopeo-generation="53"]');
      var root = host && shell.getControlledTestRoot(semanticFixtureToken);
      if (!root) throw new Error('Phase 53 semantic ShadowRoot missing');

      var router = FSBSkopeoContextRouter.createRouter({ generation: 53 });
      var spoofInput = routeInput('file-spoof', 'spoof');
      spoofInput.url = 'https://drive.google.com.evil.example/drive/u/0/my-drive';
      var spoof = router.route(spoofInput);
      if (!shell.projectContext(projectionForRoute(spoof))) throw new Error('spoof projection failed closed');
      var routerEvidence = {
        spoofStatus: spoof.status,
        spoofReason: spoof.reason,
        spoofCopy: root.querySelector('.skopeo-lens-label').textContent,
        spoofMarkCount: root.querySelectorAll('.skopeo-semantic-anchor').length
      };

      var routeA = router.route(routeInput('file-A', 'route-a'));
      if (!shell.projectContext(projectionForRoute(routeA))) throw new Error('exact Drive fixture route was not recognized');

      var currentContextEpoch = routeA.contextEpoch;
      var currentIdentity = { kind: routeA.semanticIdentity.kind, id: routeA.semanticIdentity.id };
      var observations = [];
      var wrongIdentitySamples = 0;
      var maxMarkCount = 0;
      var eventSequence = 0;
      var events = [];
      var firstWithdrawalAccessibility = null;
      var lastProjection = null;
      var firstProjection = null;
      var deferredMode = false;
      var deferredResolvers = [];
      var ledger = createBrowserLedger();
      var abortController = new AbortController();
      var registryWindow = {
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
        requestAnimationFrame: function (callback) {
          return window.setTimeout(function () { callback(window.performance.now()); }, 0);
        },
        cancelAnimationFrame: function (frameId) { window.clearTimeout(frameId); },
        MutationObserver: window.MutationObserver,
        visualViewport: window.visualViewport,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      };

      function observe(label) {
        if (label && observations.indexOf(label) < 0) observations.push(label);
        var snapshotValue = shell.getProjectionSnapshot();
        var marks = root.querySelectorAll('.skopeo-semantic-anchor');
        maxMarkCount = Math.max(maxMarkCount, marks.length);
        if (marks.length && row.isConnected) {
          var identity = snapshotValue && snapshotValue.semanticIdentity;
          if (!identity || identity.id !== row.__skopeoFixtureIdentity) {
            wrongIdentitySamples += 1;
          }
        }
        return { snapshot: snapshotValue, mark: marks[0] || null };
      }

      function candidate() {
        return { kind: 'node', target: row };
      }

      var registry = FSBSkopeoAnchorRegistry.createRegistry({
        generation: 53,
        signal: abortController.signal,
        window: registryWindow,
        document: document,
        observationRoot: document.body,
        resourceLedger: ledger,
        resolveCandidates: function (_locators, request) {
          if (!deferredMode) return [candidate()];
          return new Promise(function (resolve) {
            deferredResolvers.push({ request: request, resolve: resolve });
          });
        },
        validateCandidate: function (_candidate, descriptor) {
          var matches = row.__skopeoFixtureIdentity === descriptor.semanticIdentity.id;
          return {
            semanticIdentity: matches
              ? { kind: descriptor.semanticIdentity.kind, id: descriptor.semanticIdentity.id }
              : { kind: descriptor.semanticIdentity.kind, id: 'fixture-mismatch' }
          };
        },
        isCurrent: function (tuple) {
          return tuple.generation === 53 && tuple.contextEpoch === currentContextEpoch &&
            tuple.semanticIdentity.kind === currentIdentity.kind && tuple.semanticIdentity.id === currentIdentity.id;
        },
        onWithdraw: function (withdrawal) {
          var applied = shell.withdrawSemanticAnchor({
            contextEpoch: currentContextEpoch,
            bindingEpoch: withdrawal.bindingEpoch,
            reason: withdrawal.reason
          });
          events.push({ sequence: ++eventSequence, type: 'withdraw', id: currentIdentity.id,
            bindingEpoch: withdrawal.bindingEpoch, applied: applied });
          if (!firstWithdrawalAccessibility) {
            firstWithdrawalAccessibility = {
              markCount: root.querySelectorAll('.skopeo-semantic-anchor').length,
              regionLabel: root.querySelector('.skopeo-ambient').getAttribute('aria-label'),
              liveRegionCount: root.querySelectorAll('[aria-live]').length,
              visibleCopy: root.querySelector('.skopeo-lens-label').textContent
            };
          }
          observe(null);
        },
        onCommit: function (projection) {
          var applied = shell.commitSemanticAnchor(projection);
          events.push({ sequence: ++eventSequence, type: 'commit', id: projection.semanticIdentity.id,
            bindingEpoch: projection.bindingEpoch, applied: applied });
          lastProjection = projection;
          if (!firstProjection && applied) firstProjection = projection;
          observe(null);
        }
      });

      function descriptor() {
        return {
          anchorId: 'fixture-anchor',
          contextEpoch: currentContextEpoch,
          semanticIdentity: { kind: currentIdentity.kind, id: currentIdentity.id },
          candidateLocators: [{ kind: 'drive-item-id', value: currentIdentity.id }],
          validators: ['semantic-identity', 'connected', 'geometry']
        };
      }

      async function registerAndResolve() {
        registry.register(descriptor());
        if (!registry.resolve('fixture-anchor')) throw new Error('production registry refused fixture resolve');
        await settleRegistry();
      }

      registry.setContext({ generation: 53, contextEpoch: currentContextEpoch });
      await registerAndResolve();
      resultNode.setAttribute('data-progress', 'semantic-initial-resolve');
      var initial = observe(null);
      if (!initial.mark) throw new Error('initial production registry commit produced no mark');
      await wait(550);
      var shellPlateau = snapshot(shell);
      var registryPlateau = ledger.snapshot();
      resultNode.setAttribute('data-progress', 'semantic-initial-plateau');

      var targetRect = rectValue(row.getBoundingClientRect());
      var semanticMarkRect = rectValue(initial.mark.getBoundingClientRect());
      var markStyle = getComputedStyle(initial.mark);
      var corner = initial.mark.getAttribute('data-placement-corner');
      var hitTarget = typeof root.elementFromPoint === 'function'
        ? root.elementFromPoint(semanticMarkRect.left + 4, semanticMarkRect.top + 4)
        : document.elementFromPoint(semanticMarkRect.left + 4, semanticMarkRect.top + 4);
      var geometry = {
        width: semanticMarkRect.width,
        height: semanticMarkRect.height,
        clearance: markClearance(semanticMarkRect, targetRect, corner),
        inset: Math.min(semanticMarkRect.left, semanticMarkRect.top,
          window.innerWidth - semanticMarkRect.right, window.innerHeight - semanticMarkRect.bottom),
        pointerEvents: markStyle.pointerEvents,
        hitThrough: hitTarget !== initial.mark,
        transitionProperty: markStyle.transitionProperty,
        transitionDuration: markStyle.transitionDuration,
        ariaHidden: initial.mark.getAttribute('aria-hidden'),
        tabIndex: initial.mark.getAttribute('tabindex'),
        regionRole: root.querySelector('.skopeo-ambient').getAttribute('role'),
        regionLabel: root.querySelector('.skopeo-ambient').getAttribute('aria-label'),
        liveRegionCount: root.querySelectorAll('[aria-live]').length
      };

      row.setAttribute('data-skopeo-fixture-identity', 'file-B');
      row.__skopeoFixtureIdentity = 'file-B';
      registry.signal('mutation');
      var firstWithdrawSequence = events.filter(function (event) { return event.type === 'withdraw'; }).slice(-1)[0].sequence;
      currentIdentity = { kind: 'drive-file', id: 'file-B' };
      await registerAndResolve();
      await settleFrame();
      observe('node-reuse');
      resultNode.setAttribute('data-progress', 'semantic-node-reuse');
      var firstRebind = events.filter(function (event) { return event.type === 'commit' && event.id === 'file-B'; })[0];

      row.setAttribute('data-skopeo-fixture-identity', 'file-A');
      row.__skopeoFixtureIdentity = 'file-A';
      registry.signal('mutation');
      currentIdentity = { kind: 'drive-file', id: 'file-A' };
      await registerAndResolve();
      await settleFrame();
      observe('ABA');
      resultNode.setAttribute('data-progress', 'semantic-aba');
      var staleABARejected = shell.commitSemanticAnchor(firstProjection) === false;

      var reorderSentinel = document.createElement('div');
      reorderSentinel.setAttribute('data-skopeo-fixture-order', 'before-row');
      document.body.insertBefore(reorderSentinel, row);
      document.body.appendChild(row);
      registry.signal('mutation');
      await settleFrame();
      observe('reorder');
      resultNode.setAttribute('data-progress', 'semantic-reorder');

      row.remove();
      registry.signal('mutation');
      observe('detach');
      await settleFrame();
      document.body.appendChild(row);
      await registerAndResolve();
      registry.signal('mutation');
      await settleFrame();
      resultNode.setAttribute('data-progress', 'semantic-detach');

      registry.withdraw('fixture-anchor', 'rebind');
      row.setAttribute('data-skopeo-fixture-identity', 'file-A');
      row.__skopeoFixtureIdentity = 'file-A';
      currentIdentity = { kind: 'drive-file', id: 'file-A' };
      deferredMode = true;
      registry.register(descriptor());
      registry.resolve('fixture-anchor');
      row.setAttribute('data-skopeo-fixture-identity', 'file-B');
      row.__skopeoFixtureIdentity = 'file-B';
      currentIdentity = { kind: 'drive-file', id: 'file-B' };
      registry.register(descriptor());
      registry.resolve('fixture-anchor');
      if (deferredResolvers.length !== 2) throw new Error('reverse resolver fixture did not queue two operations');
      deferredResolvers[1].resolve([candidate()]);
      await settleRegistry();
      var commitsAfterFreshReverse = events.filter(function (event) { return event.type === 'commit'; }).length;
      deferredResolvers[0].resolve([candidate()]);
      await settleRegistry();
      var commitsAfterOldReverse = events.filter(function (event) { return event.type === 'commit'; }).length;
      deferredMode = false;
      await settleFrame();
      observe('reverse-route');
      resultNode.setAttribute('data-progress', 'semantic-reverse');

      var movingMarkBefore = root.querySelector('.skopeo-semantic-anchor');
      row.style.left = '360px';
      row.style.top = '360px';
      registry.signal('resize');
      await settleFrame();
      var movingMarkAfter = root.querySelector('.skopeo-semantic-anchor');
      var movementStyle = movingMarkAfter ? getComputedStyle(movingMarkAfter) : null;
      var noPositionalInterpolation = !!movementStyle && !/(?:^|,\\s*)(?:top|left|right|bottom|transform)(?:,|$)/.test(movementStyle.transitionProperty);
      resultNode.setAttribute('data-progress', 'semantic-move');

      window.scrollTo(0, 120);
      registry.signal('scroll');
      await settleFrame();
      resultNode.setAttribute('data-progress', 'semantic-scroll');
      observe('scroll');
      window.scrollTo(0, 0);
      registry.signal('scroll');
      await settleFrame();

      row.style.zoom = '1.25';
      registry.signal('zoom');
      await settleFrame();
      resultNode.setAttribute('data-progress', 'semantic-zoom');
      observe('zoom');
      row.style.zoom = '';
      registry.signal('zoom');
      await settleFrame();

      for (var cycle = 0; cycle < 100; cycle += 1) {
        registry.withdraw('fixture-anchor', 'rebind');
        var cycleId = cycle % 2 === 0 ? 'file-A' : 'file-B';
        row.__skopeoFixtureIdentity = cycleId;
        currentIdentity = { kind: 'drive-file', id: cycleId };
        await registerAndResolve();
        observe(null);
      }
      var shellAfterCycles = snapshot(shell);
      var registryAfterCycles = ledger.snapshot();
      resultNode.setAttribute('data-progress', 'semantic-cycles');

      var routeB = router.route(routeInput('file-B', 'route-b'));
      shell.projectContext(projectionForRoute(routeB));
      currentContextEpoch = routeB.contextEpoch;
      currentIdentity = { kind: 'drive-file', id: 'file-B' };
      registry.setContext({ generation: 53, contextEpoch: currentContextEpoch });
      row.setAttribute('data-skopeo-fixture-identity', 'file-B');
      row.__skopeoFixtureIdentity = 'file-B';
      await registerAndResolve();
      await settleFrame();
      var staleRouteProjection = lastProjection;
      var routeAAgain = router.route(routeInput('file-A', 'route-a-again'));
      shell.projectContext(projectionForRoute(routeAAgain));
      currentContextEpoch = routeAAgain.contextEpoch;
      currentIdentity = { kind: 'drive-file', id: 'file-A' };
      registry.setContext({ generation: 53, contextEpoch: currentContextEpoch });
      row.setAttribute('data-skopeo-fixture-identity', 'file-A');
      row.__skopeoFixtureIdentity = 'file-A';
      await registerAndResolve();
      await settleFrame();
      observe('reverse-route');
      var staleRouteRejected = shell.commitSemanticAnchor(staleRouteProjection) === false;
      routerEvidence.recognizedStatus = routeA.status;
      routerEvidence.epochs = [spoof.contextEpoch, routeA.contextEpoch, routeB.contextEpoch, routeAAgain.contextEpoch];
      routerEvidence.finalIdentity = shell.getProjectionSnapshot().semanticIdentity.id;
      resultNode.setAttribute('data-progress', 'semantic-route');

      var narrowFrame = document.createElement('iframe');
      narrowFrame.setAttribute('title', '420px semantic anchor fixture');
      narrowFrame.setAttribute('width', '420');
      narrowFrame.setAttribute('height', '700');
      narrowFrame.style.cssText = 'width:420px;height:700px;border:0;';
      document.body.appendChild(narrowFrame);
      var narrowFixtureToken = Object.freeze({ fixture: true });
      var narrowShell = FSBSkopeoShell.createShell({
        document: narrowFrame.contentDocument,
        window: narrowFrame.contentWindow,
        generation: 54,
        fixtureToken: narrowFixtureToken,
        allowControlledFixture: true
      });
      var narrowPrepared = narrowShell.prepareAmbient();
      if (!narrowPrepared || !narrowShell.mountAmbient(narrowPrepared)) throw new Error('420px semantic fixture failed to mount');
      narrowShell.projectContext({ status: 'recognized', contextKind: 'vendor-folder', contextEpoch: 1 });
      var narrowCommit = narrowShell.commitSemanticAnchor({
        generation: 54,
        contextEpoch: 1,
        semanticIdentity: { kind: 'drive-folder', id: 'narrow-fixture' },
        bindingEpoch: 1,
        targetRect: { left: 16, top: 100, width: 388, height: 40 }
      });
      var narrowHost = narrowFrame.contentDocument.querySelector('[data-skopeo-generation="54"]');
      var narrowResult = {
        viewportWidth: narrowFrame.contentWindow.innerWidth,
        committed: narrowCommit,
        markCount: narrowShell.getControlledTestRoot(narrowFixtureToken)
          .querySelectorAll('.skopeo-semantic-anchor').length,
        after: narrowShell.destroy('phase53-browser-narrow')
      };
      narrowFrame.remove();
      observe('resize-420');
      resultNode.setAttribute('data-progress', 'semantic-narrow');

      registry.withdraw('fixture-anchor', 'disposed');
      abortController.abort('phase53-browser-destroy');
      var registryZero = registry.dispose();
      var shellZero = shell.destroy('phase53-browser-destroy');
      router.dispose();
      var runtimeZero = window.__FSB_SKOPEO_RUNTIME__.disposeForReplacement().resources;

      window.scrollTo(0, 0);
      row.remove();
      reorderSentinel.remove();
      var hostAfter = {
        data: sentinel.getAttribute('data-host-contract'),
        style: sentinel.getAttribute('style'),
        focused: document.activeElement === sentinel,
        selection: String(window.getSelection()),
        scrollX: window.scrollX,
        scrollY: window.scrollY
      };
      sentinel.remove();
      if (bodyStyleBefore === null) document.body.removeAttribute('style');
      else document.body.setAttribute('style', bodyStyleBefore);

      return {
        loadedProductionScripts: loadedProductionScripts,
        scriptOrder: [
          'skopeo-profile-schema.js',
          'skopeo-context-router.js',
          'skopeo-app-context-resolver.js',
          'skopeo-anchor-registry.js',
          'skopeo-adapter-registry.js',
          'skopeo-hud-schema.js',
          'skopeo-adaptive-composer.js',
          'skopeo-renderer-registry.js',
          'skopeo-shell.js',
          'skopeo-runtime.js'
        ],
        router: routerEvidence,
        observations: observations,
        wrongIdentitySamples: wrongIdentitySamples,
        maxMarkCount: maxMarkCount,
        withdrawBeforeRebind: !!firstRebind && firstWithdrawSequence < firstRebind.sequence,
        staleABARejected: staleABARejected,
        staleRouteRejected: staleRouteRejected,
        reverseOldCommitCountStable: commitsAfterOldReverse === commitsAfterFreshReverse,
        geometry: geometry,
        accessibilityWithdrawal: firstWithdrawalAccessibility,
        sameNodeMovement: !!movingMarkBefore && movingMarkBefore === movingMarkAfter,
        noPositionalInterpolation: noPositionalInterpolation,
        cycles: 100,
        shellPlateau: shellPlateau,
        shellAfterCycles: shellAfterCycles,
        registryPlateau: registryPlateau,
        registryAfterCycles: registryAfterCycles,
        narrow: narrowResult,
        shellZero: shellZero,
        registryZero: registryZero,
        runtimeZero: runtimeZero,
        runtimeListenerCount: window.__skopeoRuntimeListeners.length,
        rootCountAfterDestroy: document.querySelectorAll('[data-skopeo-generation]').length,
        hostBefore: hostBefore,
        hostAfter: hostAfter
      };
    }

    try {
      var result = {
        supported: runShell(1, false),
        fallback: runShell(2, true),
        focus: runFocusContract(),
        collision: runCollisionContract(document, window, 4),
        narrowCollision: runNarrowCollisionContract(),
        prepareCommit: runPrepareCommitContract(),
        richResize: await runRichResizeContract(document, window, 8),
        narrowRichResize: await runNarrowRichResizeContract(),
        restoredPlacement: runRestoredPlacementContract(document, window, 12),
        narrowRestoredPlacement: runNarrowRestoredPlacementContract(),
        corpus: runCorpusEnrollmentContract(),
        contractRail: await runContractRailContract(),
        askRail: await runAskRailContract(),
        semantic: await runSemanticAnchorContract()
      };
      resultNode.setAttribute('data-json', encodeURIComponent(JSON.stringify(result)));
    } catch (error) {
      resultNode.setAttribute('data-error', encodeURIComponent(String(error && error.stack || error)));
    }
  }());
  </script>
</body>
</html>`;
}

function parseResult(serializedDom) {
  const errorMatch = serializedDom.match(/id="skopeo-contract-result"[^>]*data-error="([^"]+)"/);
  if (errorMatch) assert.fail('Chrome fixture failed: ' + decodeURIComponent(errorMatch[1]));
  const match = serializedDom.match(/id="skopeo-contract-result"[^>]*data-json="([^"]+)"/);
  const progressMatch = serializedDom.match(/id="skopeo-contract-result"[^>]*data-progress="([^"]+)"/);
  assert.ok(match, 'Chrome dump contains the escaped Skopeo result node (last progress: ' +
    (progressMatch ? progressMatch[1] : 'unavailable') + ')');
  return JSON.parse(decodeURIComponent(match[1]));
}

function assertExactZero(snapshot, label) {
  assert.deepEqual(Object.keys(snapshot), RESOURCE_KEYS, label + ' exposes exactly eleven categories');
  for (const key of RESOURCE_KEYS) assert.equal(snapshot[key], 0, label + ' keeps ' + key + ' at zero');
}

function assertComputedBoundary(computed, label) {
  assert.deepEqual(computed, {
    position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px',
    pointerEvents: 'none',
    zIndex: '2147483647'
  }, label + ' uses the browser-computed non-intercepting viewport boundary');
}

function extensionIdForKey(publicKeyDer) {
  const digest = crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);
  let extensionId = '';
  for (const byte of digest) {
    extensionId += String.fromCharCode(97 + (byte >> 4));
    extensionId += String.fromCharCode(97 + (byte & 15));
  }
  return extensionId;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function readDevToolsEndpoint(activePortPath, child, stderr) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (fs.existsSync(activePortPath)) {
      const parts = fs.readFileSync(activePortPath, 'utf8').trim().split(/\r?\n/);
      if (parts.length >= 2 && Number(parts[0]) > 0) {
        return 'ws://127.0.0.1:' + parts[0] + parts[1];
      }
    }
    if (child.exitCode !== null) {
      assert.fail('storage boundary Chrome exited before DevTools was ready\n' + stderr());
    }
    await delay(25);
  }
  assert.fail('storage boundary Chrome did not expose DevTools in time\n' + stderr());
}

function openCdpClient(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const pending = new Map();
    let nextId = 1;
    let opened = false;
    const openingTimeout = setTimeout(() => reject(new Error('DevTools WebSocket open timed out')), 5000);

    function rejectPending(error) {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
      pending.clear();
    }

    socket.addEventListener('open', () => {
      opened = true;
      clearTimeout(openingTimeout);
      resolve({
        command(method, params, sessionId) {
          const id = nextId++;
          const message = { id, method, params: params || {} };
          if (sessionId) message.sessionId = sessionId;
          return new Promise((resolveCommand, rejectCommand) => {
            const timeout = setTimeout(() => {
              pending.delete(id);
              rejectCommand(new Error(method + ' timed out'));
            }, 10000);
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout });
            socket.send(JSON.stringify(message));
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch (_error) {
        return;
      }
      if (!message.id || !pending.has(message.id)) return;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(waiter.timeout);
      if (message.error) waiter.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiter.resolve(message.result || {});
    });
    socket.addEventListener('error', () => {
      const error = new Error('DevTools WebSocket failed');
      clearTimeout(openingTimeout);
      if (!opened) reject(error);
      rejectPending(error);
    });
    socket.addEventListener('close', () => {
      clearTimeout(openingTimeout);
      rejectPending(new Error('DevTools WebSocket closed'));
    });
  });
}

async function readStorageSentinel(cdp, targetUrl, label) {
  const created = await cdp.command('Target.createTarget', { url: targetUrl });
  assert.ok(created.targetId, label + ' creates a Chrome target');
  try {
    const attached = await cdp.command('Target.attachToTarget', {
      targetId: created.targetId,
      flatten: true
    });
    assert.ok(attached.sessionId, label + ' attaches to its Chrome target');
    await cdp.command('Runtime.enable', {}, attached.sessionId);
    const deadline = Date.now() + 12000;
    let lastValue = null;
    while (Date.now() < deadline) {
      const evaluated = await cdp.command('Runtime.evaluate', {
        expression: "(() => { const node = document.getElementById('storage-contract-result'); return node ? { json: node.getAttribute('data-json'), error: node.getAttribute('data-error'), ready: document.readyState, href: location.href } : { missing: true, ready: document.readyState, href: location.href }; })()",
        returnByValue: true
      }, attached.sessionId);
      if (evaluated.exceptionDetails) {
        assert.fail(label + ' evaluation failed: ' + JSON.stringify(evaluated.exceptionDetails));
      }
      lastValue = evaluated.result && evaluated.result.value;
      if (lastValue && lastValue.error) {
        assert.fail(label + ' failed: ' + decodeURIComponent(lastValue.error));
      }
      if (lastValue && lastValue.json) {
        return JSON.parse(decodeURIComponent(lastValue.json));
      }
      await delay(50);
    }
    assert.fail(label + ' did not report in time: ' + JSON.stringify(lastValue));
  } finally {
    await cdp.command('Target.closeTarget', { targetId: created.targetId }).catch(() => {});
  }
}

function startLoopbackFixture(tempRoot) {
  const fixturePath = path.join(tempRoot, 'storage-fixture.html');
  const serverPath = path.join(tempRoot, 'storage-server.js');
  const portPath = path.join(tempRoot, 'storage-server.port');
  fs.writeFileSync(fixturePath, [
    '<!doctype html><html><head><meta charset="utf-8"><title>Storage boundary</title></head>',
    '<body><button id="host-sentinel" data-host-contract="unchanged">Host sentinel</button>',
    '<pre id="storage-contract-result"></pre></body></html>'
  ].join(''), 'utf8');
  fs.writeFileSync(serverPath, [
    "'use strict';",
    "const fs = require('fs');",
    "const http = require('http');",
    'const fixture = fs.readFileSync(process.argv[2]);',
    'const portFile = process.argv[3];',
    "const server = http.createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(fixture); });",
    "server.listen(0, '127.0.0.1', () => { fs.writeFileSync(portFile, String(server.address().port)); });",
    "process.on('SIGTERM', () => server.close(() => process.exit(0)));"
  ].join('\n'), 'utf8');
  const child = childProcess.spawn(process.execPath, [serverPath, fixturePath, portPath], {
    stdio: 'ignore'
  });
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portPath); attempt += 1) {
    Atomics.wait(waitArray, 0, 0, 25);
  }
  assert.ok(fs.existsSync(portPath), 'loopback storage fixture starts');
  const port = Number(fs.readFileSync(portPath, 'utf8'));
  assert.ok(Number.isSafeInteger(port) && port > 0, 'loopback storage fixture chooses a valid port');
  return {
    url: 'http://127.0.0.1:' + String(port) + '/',
    close() {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  };
}

function prepareStorageSentinelExtension(tempRoot) {
  const extensionSource = path.resolve(__dirname, '..', 'extension');
  const extensionRoot = path.join(tempRoot, 'extension-storage-sentinel');
  fs.cpSync(extensionSource, extensionRoot, { recursive: true });
  const manifestPath = path.join(extensionRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const publicKeyDer = Buffer.from(STORAGE_SENTINEL_PUBLIC_KEY, 'base64');
  manifest.key = STORAGE_SENTINEL_PUBLIC_KEY;
  manifest.content_scripts.push({
    matches: ['http://127.0.0.1/*'],
    js: ['browser-contract-storage-content.js'],
    run_at: 'document_idle',
    world: 'ISOLATED'
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  assert.match(
    fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8'),
    /setAccessLevel\s*\(\s*\{\s*accessLevel:\s*['"]TRUSTED_CONTEXTS['"]\s*\}\s*\)/,
    'copied production background establishes the exact trusted storage boundary'
  );

  fs.writeFileSync(path.join(extensionRoot, 'browser-contract-storage-content.js'), [
    "(async function() {",
    "  'use strict';",
    "  const node = document.getElementById('storage-contract-result');",
    "  const sentinel = document.getElementById('host-sentinel');",
    "  const key = 'skopeoBrowserStorageSentinel:v1';",
    "  const cycles = 100;",
    "  const result = { cycles, surfacePresent: !!(chrome.storage && chrome.storage.local), setDenied: 0, getDenied: 0, removeDenied: 0, hostPreserved: false };",
    "  async function denied(work) { try { await work(); return false; } catch (_error) { return true; } }",
    "  try {",
    "    await new Promise(resolve => setTimeout(resolve, 500));",
    "    for (let cycle = 0; cycle < cycles; cycle += 1) {",
    "      if (await denied(() => chrome.storage.local.set({ [key]: cycle }))) result.setDenied += 1;",
    "      if (await denied(() => chrome.storage.local.get(key))) result.getDenied += 1;",
    "      if (await denied(() => chrome.storage.local.remove(key))) result.removeDenied += 1;",
    "    }",
    "    result.hostPreserved = !!sentinel && sentinel.isConnected && sentinel.getAttribute('data-host-contract') === 'unchanged' && sentinel.textContent === 'Host sentinel';",
    "    node.setAttribute('data-json', encodeURIComponent(JSON.stringify(result)));",
    "  } catch (error) { node.setAttribute('data-error', encodeURIComponent(String(error && error.stack || error))); }",
    "}());"
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(extensionRoot, 'browser-contract-trusted.html'), [
    '<!doctype html><html><head><meta charset="utf-8"><title>Trusted storage boundary</title></head>',
    '<body><pre id="storage-contract-result"></pre><script src="browser-contract-trusted.js"></script></body></html>'
  ].join(''), 'utf8');
  fs.writeFileSync(path.join(extensionRoot, 'browser-contract-trusted.js'), [
    "(async function() {",
    "  'use strict';",
    "  const node = document.getElementById('storage-contract-result');",
    "  const key = 'skopeoBrowserStorageSentinel:v1';",
    "  const cycles = 100;",
    "  try {",
    "    const initial = await chrome.storage.local.get(key);",
    "    let successfulCycles = 0;",
    "    for (let cycle = 0; cycle < cycles; cycle += 1) {",
    "      await chrome.storage.local.set({ [key]: cycle });",
    "      const stored = await chrome.storage.local.get(key);",
    "      await chrome.storage.local.remove(key);",
    "      const removed = await chrome.storage.local.get(key);",
    "      if (stored[key] === cycle && !Object.prototype.hasOwnProperty.call(removed, key)) successfulCycles += 1;",
    "    }",
    "    const finalValue = await chrome.storage.local.get(key);",
    "    node.setAttribute('data-json', encodeURIComponent(JSON.stringify({ cycles, successfulCycles, initialAbsent: !Object.prototype.hasOwnProperty.call(initial, key), residue: Object.prototype.hasOwnProperty.call(finalValue, key) })));",
    "  } catch (error) { node.setAttribute('data-error', encodeURIComponent(String(error && error.stack || error))); }",
    "}());"
  ].join('\n'), 'utf8');
  return {
    extensionRoot,
    extensionId: extensionIdForKey(publicKeyDer)
  };
}

async function runLoadedExtensionStorageContract(resolution, tempRoot) {
  const server = startLoopbackFixture(tempRoot);
  const profilePath = path.join(tempRoot, 'profile-storage-boundary');
  let chromeStderr = '';
  let cdp = null;
  const child = childProcess.spawn(resolution.executable, [
    '--headless=new',
    '--enable-unsafe-extension-debugging',
    '--remote-debugging-port=0',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-pings',
    '--user-data-dir=' + profilePath,
    'about:blank'
  ], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  child.stderr.on('data', chunk => {
    chromeStderr = (chromeStderr + String(chunk)).slice(-10000);
  });
  try {
    const prepared = prepareStorageSentinelExtension(tempRoot);
    const endpoint = await readDevToolsEndpoint(
      path.join(profilePath, 'DevToolsActivePort'),
      child,
      () => chromeStderr
    );
    cdp = await openCdpClient(endpoint);
    const loaded = await cdp.command('Extensions.loadUnpacked', { path: prepared.extensionRoot });
    assert.equal(loaded.id, prepared.extensionId,
      'DevTools loads the deterministic production extension identity');
    const inventory = await cdp.command('Extensions.getExtensions');
    const preparedManifest = JSON.parse(
      fs.readFileSync(path.join(prepared.extensionRoot, 'manifest.json'), 'utf8')
    );
    assert.equal(inventory.extensions.length, 1,
      'real Chrome reports exactly one loaded unpacked extension');
    assert.deepEqual(inventory.extensions[0], {
      id: prepared.extensionId,
      name: preparedManifest.name,
      version: preparedManifest.version,
      path: fs.realpathSync(prepared.extensionRoot),
      enabled: true
    }, 'real Chrome reports the loaded production extension manifest and path');
    const trusted = await readStorageSentinel(
      cdp,
      'chrome-extension://' + prepared.extensionId + '/browser-contract-trusted.html',
      'trusted extension storage sentinel'
    );
    const content = await readStorageSentinel(cdp, server.url, 'isolated content storage sentinel');
    return { content, trusted, extensionLoaded: true, liveDriveContacted: false };
  } finally {
    if (cdp) cdp.close();
    if (child.exitCode === null) child.kill('SIGKILL');
    server.close();
  }
}

async function runChromeContract() {
  assert.equal(new Set(ADAPTIVE_GENRES).size, 9,
    'browser mechanics declare all nine adaptive genres without setting live_approved');
  const resolution = resolveChrome();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-skopeo-browser-'));
  const fixturePath = path.join(tempRoot, 'fixture.html');
  const contentRoot = path.resolve(__dirname, '..', 'extension', 'content');
  const utilsRoot = path.resolve(__dirname, '..', 'extension', 'utils');
  const scriptUrls = {
    schema: url.pathToFileURL(path.join(utilsRoot, 'skopeo-profile-schema.js')).href,
    router: url.pathToFileURL(path.join(contentRoot, 'skopeo-context-router.js')).href,
    resolver: url.pathToFileURL(path.join(contentRoot, 'skopeo-app-context-resolver.js')).href,
    registry: url.pathToFileURL(path.join(contentRoot, 'skopeo-anchor-registry.js')).href,
    adapters: url.pathToFileURL(path.join(contentRoot, 'skopeo-adapter-registry.js')).href,
    hudSchema: url.pathToFileURL(path.join(utilsRoot, 'skopeo-hud-schema.js')).href,
    composer: url.pathToFileURL(path.join(contentRoot, 'skopeo-adaptive-composer.js')).href,
    renderers: url.pathToFileURL(path.join(contentRoot, 'skopeo-renderer-registry.js')).href,
    shell: url.pathToFileURL(path.join(contentRoot, 'skopeo-shell.js')).href,
    runtime: url.pathToFileURL(path.join(contentRoot, 'skopeo-runtime.js')).href
  };
  try {
    fs.writeFileSync(fixturePath, fixtureHtml(scriptUrls), 'utf8');
    function runAt(width, height, label) {
      const run = childProcess.spawnSync(resolution.executable, [
        '--headless=new',
        '--run-all-compositor-stages-before-draw',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pings',
        '--allow-file-access-from-files',
        '--force-device-scale-factor=1',
        '--window-size=' + width + ',' + height,
        '--virtual-time-budget=5000',
        '--user-data-dir=' + path.join(tempRoot, 'profile-' + label),
        '--dump-dom',
        url.pathToFileURL(fixturePath).href
      ], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10000,
        killSignal: 'SIGKILL'
      });
      const expectedDumpTimeout = !!(run.error && run.error.code === 'ETIMEDOUT' && run.stdout);
      assert.ok(!run.error || expectedDumpTimeout, 'local Chrome process launches successfully: ' + String(run.error || ''));
      if (!expectedDumpTimeout) assert.equal(run.status, 0, 'local Chrome exits successfully\n' + String(run.stderr || ''));
      return parseResult(run.stdout);
    }
    const storageBoundary = await runLoadedExtensionStorageContract(resolution, tempRoot);
    const result = runAt(1024, 768, 'normal');
    result.storageBoundary = storageBoundary;

    assert.equal(storageBoundary.extensionLoaded, true,
      'Chrome loads the production extension for the storage boundary sentinel');
    assert.equal(storageBoundary.liveDriveContacted, false,
      'storage boundary sentinel remains deterministic and never contacts live Drive');
    assert.equal(storageBoundary.content.cycles, 100,
      'isolated content executes 100 denied storage cycles');
    assert.equal(storageBoundary.content.surfacePresent, true,
      'isolated content receives the Chrome storage surface before access checks');
    assert.equal(storageBoundary.content.setDenied, 100,
      'isolated content cannot write chrome.storage.local in every cycle');
    assert.equal(storageBoundary.content.getDenied, 100,
      'isolated content cannot read chrome.storage.local in every cycle');
    assert.equal(storageBoundary.content.removeDenied, 100,
      'isolated content cannot remove chrome.storage.local keys in every cycle');
    assert.equal(storageBoundary.content.hostPreserved, true,
      'isolated storage denial preserves the host sentinel');
    assert.equal(storageBoundary.trusted.cycles, 100,
      'trusted extension page executes 100 storage cycles');
    assert.equal(storageBoundary.trusted.successfulCycles, 100,
      'trusted extension page can set, read, and remove storage in every cycle');
    assert.equal(storageBoundary.trusted.initialAbsent, true,
      'trusted storage sentinel begins without residue');
    assert.equal(storageBoundary.trusted.residue, false,
      'trusted storage sentinel leaves no residue');

    assertExactZero(result.supported.before, 'supported before');
    assert.equal(result.supported.open.popoverTopLayer, 1, 'supported top-layer ledger opens 0 -> 1');
    assertExactZero(result.supported.after, 'supported after destroy');
    assert.equal(result.supported.popoverOpen, true, 'supported host entered the browser top layer');
    assert.equal(result.supported.hostRemoved, true, 'supported host is removed after destroy');
    assertComputedBoundary(result.supported.computed, 'supported popover host');

    assertExactZero(result.fallback.before, 'fallback before');
    assert.equal(result.fallback.open.popoverTopLayer, 0, 'forced fallback top-layer ledger stays 0');
    assertExactZero(result.fallback.after, 'fallback after destroy');
    assert.equal(result.fallback.popoverOpen, false, 'forced fallback never claims the browser top layer');
    assert.equal(result.fallback.hostRemoved, true, 'fallback host is removed after destroy');
    assertComputedBoundary(result.fallback.computed, 'forced fallback host');

    for (const key of ['focusedEntry', 'gateEntry', 'firstFocus', 'middleFocus', 'lastWrap', 'reverseWrap', 'gateBack', 'focusedBack']) {
      assert.deepEqual(result.focus[key], {
        documentIsHost: true,
        shadowIsExpected: true,
        shadowLabel: result.focus[key].shadowLabel
      }, key + ' reports the browser host/Shadow active-element relation');
    }
    assert.equal(result.focus.firstPrevented, false, 'Chrome leaves forward Tab from the first Gate action unconsumed');
    assert.equal(result.focus.middlePrevented, false, 'Chrome leaves forward Tab from the middle Gate action unconsumed');
    assert.equal(result.focus.lastPrevented, true, 'Chrome consumes only the last-to-first Gate boundary');
    assert.equal(result.focus.reversePrevented, true, 'Chrome consumes only the Shift+first-to-last Gate boundary');
    assertExactZero(result.focus.after, 'focus fixture after destroy');

    for (const [label, collision] of [['normal', result.collision], ['narrow', result.narrowCollision]]) {
      assert.equal(collision.safeFocused, true, label + ' safe real Focused rectangle commits');
      assert.ok(collision.focusedRect.width > 0 && collision.focusedRect.height > 0, label + ' Focused candidate has real browser geometry');
      assert.equal(collision.collideFocused, false, label + ' colliding Focused rectangle fails closed');
      assert.equal(collision.focusedRollback, true, label + ' Focused rollback preserves identities, focus, attention, and resources');
      assert.equal(collision.safeGate, true, label + ' safe real Gate rectangle commits');
      assert.ok(collision.gateRect.width > 0 && collision.gateRect.height > 0, label + ' Gate candidate has real browser geometry');
      assert.equal(collision.collideGate, false, label + ' colliding Gate rectangle fails closed');
      assert.equal(collision.gateRollback, true, label + ' Gate rollback preserves identities, focus, attention, and resources');
      assert.equal(collision.focusedUnsafeText, 'Skopeo can’t open this view without covering the current page control.', label + ' Focused rollback announces exact copy');
      assert.equal(collision.gateUnsafeText, 'Skopeo can’t open this view without covering the current page control.', label + ' Gate rollback announces exact copy');
      assertExactZero(collision.after, label + ' collision fixture after destroy');
    }
    assert.ok(result.narrowCollision.viewport.width < 480, 'narrow Chrome iframe is below the 480 CSS-pixel reflow boundary');

    assertExactZero(result.prepareCommit.moved.before, 'prepare/commit moved before');
    assert.equal(result.prepareCommit.moved.overlap, false, 'Chrome never commits the Ambient lens over a control inserted after prepare');
    assert.equal(result.prepareCommit.moved.focusPreserved, true, 'Chrome prepare/commit revalidation performs no focus write');
    assert.equal(result.prepareCommit.moved.childrenPreserved, true, 'Chrome successful prepare/commit preserves preexisting document-element child identities');
    if (result.prepareCommit.moved.mounted) {
      assert.equal(result.prepareCommit.moved.rootCount, 1, 'Chrome moved prepare/commit case owns one root');
      assert.notEqual(result.prepareCommit.moved.placementCorner, 'top-right', 'Chrome reselects away from the stale prepared corner');
    } else {
      assert.equal(result.prepareCommit.moved.rootCount, 0, 'Chrome may fail the moved prepare/commit case without a root');
      assertExactZero(result.prepareCommit.moved.open, 'Chrome moved failed commit remains exact zero');
    }
    assertExactZero(result.prepareCommit.moved.after, 'prepare/commit moved after destroy');

    assertExactZero(result.prepareCommit.blocked.before, 'prepare/commit blocked before');
    assert.equal(result.prepareCommit.blocked.mounted, false, 'Chrome all-candidates-blocked commit returns false');
    assert.equal(result.prepareCommit.blocked.rootCount, 0, 'Chrome all-candidates-blocked commit appends no root');
    assert.equal(result.prepareCommit.blocked.popoverOpen, false, 'Chrome all-candidates-blocked commit opens no popover');
    assert.equal(result.prepareCommit.blocked.focusPreserved, true, 'Chrome all-candidates-blocked commit performs no focus write');
    assert.equal(result.prepareCommit.blocked.childrenPreserved, true, 'Chrome all-candidates-blocked commit preserves document-element child identities');
    assertExactZero(result.prepareCommit.blocked.open, 'Chrome all-candidates-blocked commit reports exact eleven-key zero');
    assertExactZero(result.prepareCommit.blocked.after, 'prepare/commit blocked after destroy');

    for (const [label, resize] of [['normal', result.richResize], ['narrow', result.narrowRichResize]]) {
      assert.equal(resize.focused.safePreserved, true, label + ' Chrome safe Focused signals/frame preserve scope, focus, root, live copy, and resources');
      assert.equal(resize.focused.ownedFrame, true, label + ' Chrome Focused owns exactly one rich-geometry frame');
      assert.equal(resize.focused.finalAttention, 'anchored', label + ' Chrome unsafe Focused restores Anchored on the owned frame without resize');
      assert.equal(resize.focused.restoredScope, true, label + ' Chrome Focused invalidation restores exact Anchored scope identity');
      assert.equal(resize.focused.restoredNodes, true, label + ' Chrome Focused invalidation restores exact Anchored nodes');
      assert.equal(resize.focused.restoredFocus, true, label + ' Chrome Focused invalidation restores declared focus');
      assert.equal(resize.focused.rootCount, 1, label + ' Chrome Focused invalidation keeps one root');
      assert.equal(resize.focused.resourcesRestored, true, label + ' Chrome Focused invalidation restores the prior resource plateau');
      assert.equal(resize.focused.releasedFrame, true, label + ' Chrome Focused unwind releases the rich-geometry frame');
      assert.equal(resize.focused.noOverlap, true, label + ' Chrome leaves no Focused overlap after frame handling');
      assertExactZero(resize.focused.after, label + ' Chrome Focused invalidation destroys to exact zero');

      assert.equal(resize.gate.safePreserved, true, label + ' Chrome safe Gate signals/frame preserve scope, focus, root, live copy, and resources');
      assert.equal(resize.gate.ownedFrame, true, label + ' Chrome Gate owns exactly one rich-geometry frame');
      assert.equal(resize.gate.finalAttention, resize.gate.expectedAttention, label + ' Chrome unsafe Gate restores the nearest measured-safe suspended level');
      assert.equal(resize.gate.restoredScope, true, label + ' Chrome Gate invalidation restores exact scope identity');
      assert.equal(resize.gate.restoredNodes, true, label + ' Chrome Gate invalidation restores exact nodes');
      assert.equal(resize.gate.restoredFocus, true, label + ' Chrome Gate invalidation restores declared focus');
      assert.equal(resize.gate.rootCount, 1, label + ' Chrome Gate invalidation keeps one root');
      assert.equal(resize.gate.resourcesRestored, true, label + ' Chrome Gate invalidation restores the prior resource plateau');
      assert.equal(resize.gate.releasedFrame, true, label + ' Chrome Gate unwind owns exactly the restored level frame count');
      assert.equal(resize.gate.noOverlap, true, label + ' Chrome leaves no Gate/Focused overlap after synchronous handling');
      assertExactZero(resize.gate.after, label + ' Chrome Gate invalidation destroys to exact zero');
    }
    assert.ok(result.narrowRichResize.viewport.before >= 480, 'Chrome narrow rich fixture begins above the compact breakpoint');
    assert.ok(result.narrowRichResize.viewport.after < 480, 'Chrome rich fixture transitions to a 420 CSS-pixel viewport');

    for (const [label, restoration] of [
      ['normal', result.restoredPlacement],
      ['420px', result.narrowRestoredPlacement]
    ]) {
      const focused = restoration.focused;
      assert.equal(focused.initialRight, true, label + ' Chrome Focused fixture suspends a right-side Anchored rail');
      assert.equal(focused.richPreserved, true, label + ' Chrome placement refresh preserves the live Focused scope, nodes, focus, and resources');
      assert.equal(focused.currentLeft, true, label + ' Chrome Focused resize records a collision-clear left placement');
      assert.equal(focused.oneBack, true, label + ' Chrome Focused uses one ordinary Back');
      assert.equal(focused.attention, 'anchored', label + ' Chrome Focused Back restores Anchored');
      assert.equal(focused.scope, true, label + ' Chrome Focused Back restores exact Anchored scope identity');
      assert.equal(focused.nodes, true, label + ' Chrome Focused Back restores exact Anchored nodes');
      assert.equal(focused.focus, true, label + ' Chrome Focused Back restores declared focus');
      assert.equal(focused.railLeft, true, label + ' Chrome Focused Back applies the current left rail before exposure');
      assert.equal(focused.placementClear, true, label + ' Chrome Focused Back remains collision-clear at 8px');
      assert.equal(focused.resources, true, label + ' Chrome Focused Back returns to the Anchored resource plateau');
      assert.equal(focused.frameReleased, true, label + ' Chrome Focused Back releases the owned frame');
      assert.equal(focused.rootCount, 1, label + ' Chrome Focused Back keeps one root');
      assert.equal(focused.liveCopy, true, label + ' Chrome Focused Back preserves live-region copy');
      assertExactZero(focused.after, label + ' Chrome Focused placement fixture after destroy');

      const gate = restoration.gate;
      assert.equal(gate.initialRight, true, label + ' Chrome Gate fixture suspends a right-side Anchored rail');
      assert.equal(gate.richPreserved, true, label + ' Chrome placement refresh preserves the live Gate scope, nodes, focus, and resources');
      assert.equal(gate.currentLeft, true, label + ' Chrome Gate resize records a collision-clear left placement');
      assert.equal(gate.gateBack, true, label + ' Chrome Gate uses one ordinary Back to Focused');
      assert.equal(gate.focusedRestore.attention, true, label + ' Chrome Gate Back restores Focused');
      assert.equal(gate.focusedRestore.scope, true, label + ' Chrome Gate Back restores exact Focused scope identity');
      assert.equal(gate.focusedRestore.nodes, true, label + ' Chrome Gate Back restores exact Focused nodes');
      assert.equal(gate.focusedRestore.focus, true, label + ' Chrome Gate Back restores declared Focused focus');
      assert.equal(gate.focusedRestore.resources, true, label + ' Chrome Gate Back returns to the Focused resource plateau');
      assert.equal(gate.focusedRestore.frameOwned, true, label + ' Chrome restored Focused owns exactly one frame');
      assert.equal(gate.focusedRestore.rootCount, 1, label + ' Chrome Gate Back keeps one root');
      assert.equal(gate.focusedRestore.placementClear, true, label + ' Chrome Gate Back retains the current collision-clear placement');
      assert.equal(gate.focusedBack, true, label + ' Chrome restored Focused uses one ordinary Back to Anchored');
      assert.equal(gate.attention, 'anchored', label + ' Chrome Gate then Focused Back restores Anchored');
      assert.equal(gate.scope, true, label + ' Chrome Gate then Focused Back restores exact Anchored scope identity');
      assert.equal(gate.nodes, true, label + ' Chrome Gate then Focused Back restores exact Anchored nodes');
      assert.equal(gate.focus, true, label + ' Chrome Gate then Focused Back restores declared Anchored focus');
      assert.equal(gate.railLeft, true, label + ' Chrome Gate then Focused Back applies the current left rail');
      assert.equal(gate.placementClear, true, label + ' Chrome Gate then Focused Back remains collision-clear at 8px');
      assert.equal(gate.resources, true, label + ' Chrome Gate then Focused Back returns to the Anchored resource plateau');
      assert.equal(gate.frameReleased, true, label + ' Chrome Gate then Focused Back releases the owned frame');
      assert.equal(gate.rootCount, 1, label + ' Chrome Gate then Focused Back keeps one root');
      assert.equal(gate.liveCopy, true, label + ' Chrome Gate then Focused Back preserves live-region copy');
      assertExactZero(gate.after, label + ' Chrome Gate placement fixture after destroy');
    }

    assert.equal(result.corpus.cycles, 100, 'Chrome executes 100 enrollment render/withdraw cycles');
    assert.equal(result.corpus.accessibility.text, 'Enroll this folder',
      'Chrome exposes the exact enrollment control copy');
    assert.equal(result.corpus.accessibility.ariaLabel, 'Enroll this folder',
      'Chrome exposes the exact enrollment accessible name');
    assert.equal(result.corpus.accessibility.type, 'button',
      'Chrome enrollment control is a real button');
    assert.equal(result.corpus.accessibility.documentOwnsHost, true,
      'Chrome document focus owns the enrollment shadow host');
    assert.equal(result.corpus.accessibility.shadowOwnsButton, true,
      'Chrome shadow focus owns the enrollment button');
    assert.equal(result.corpus.actionCount, 0,
      'programmatic untrusted enrollment clicks emit no privileged action in Chrome');
    assert.equal(result.corpus.maxEnrollmentButtons, 1,
      'each Chrome enrollment cycle owns exactly one control');
    assert.equal(result.corpus.focusPreservedAtMount, true,
      'mounting enrollment mechanics preserves host focus');
    assert.deepEqual(result.corpus.afterCycles, result.corpus.plateau,
      '100 enrollment withdrawals retain the stable shell resource plateau');
    assertExactZero(result.corpus.zero, 'corpus enrollment shell after 100 cycles/destroy');
    assert.equal(result.corpus.rootCount, 0, 'corpus enrollment closure leaves no Skopeo root');
    assert.deepEqual(result.corpus.hostAfter, result.corpus.hostBefore,
      'corpus enrollment cycles preserve host attributes, style, text, connection, and focus');

    const contractRail = result.contractRail;
    assert.equal(contractRail.folder.regionCount, 1, 'Chrome renders one Phase 57 composite rail');
    assert.equal(contractRail.folder.shellCount, 1, 'Chrome reuses the sole existing Shadow shell');
    assert.equal(contractRail.folder.role, 'region');
    assert.equal(contractRail.folder.labelledBy, 'skopeo-contract-heading');
    assert.equal(contractRail.folder.tabIndex, '0', 'scrollable composite is keyboard reachable');
    assert.equal(contractRail.folder.position, 'fixed');
    assert.equal(contractRail.folder.width, 384, 'desktop composite is exactly 384 CSS pixels wide');
    assert.equal(contractRail.folder.right, 16, 'desktop composite keeps the approved right inset');
    assert.equal(contractRail.folder.top, 64, 'desktop composite keeps the approved top inset');
    assert.equal(contractRail.folder.bottom, 64, 'desktop composite keeps the approved bottom inset');
    assert.equal(contractRail.folder.radius, '12px');
    assert.equal(contractRail.folder.padding, '16px');
    assert.equal(contractRail.folder.maxHeight, 'calc(100dvh - 128px)');
    assert.equal(contractRail.folder.overflowX, 'hidden');
    assert.ok(contractRail.folder.clearance >= 8, 'desktop rail preserves at least 8px host-target clearance');
    assert.equal(contractRail.folder.focusPreserved, true, 'contract mount never steals host focus');
    assert.equal(contractRail.folder.emptyHeading, true, 'complete empty folder uses explicit empty semantics');
    assert.equal(contractRail.folder.horizontalClip, false, 'desktop rail has no horizontal clipping');
    assert.equal(contractRail.reading.regionCount, 1, 'reading replacement overlaps no stale folder rail');
    assert.equal(contractRail.reading.mode, 'reading');
    assert.equal(contractRail.reading.bannerSticky, 'sticky');
    assert.equal(contractRail.reading.definitive, 'false',
      'review-required remains a usable, prominent non-definitive reading state');
    assert.deepEqual(contractRail.reading.labels, [
      'Open governing clause', 'Open source for Effective', 'Open source for Renewal'
    ], 'Chrome exposes one primary and every distinct eligible fact citation');
    assert.deepEqual(contractRail.reading.types, ['button', 'button', 'button'],
      'all citations use native button semantics');
    assert.deepEqual(contractRail.reading.buttonOrder, [
      'Hide contract view',
      'Open governing clause',
      'Open source for Effective',
      'Open source for Renewal',
      'Remove current owner mapping'
    ], 'reading Tab order keeps the local alert action after current evidence routes');
    assert.equal(contractRail.reading.alertState, 'scheduled');
    assert.equal(contractRail.reading.alertCopy, 'Local alert scheduled',
      'alert status is exposed as text and never color-only');
    assert.deepEqual(contractRail.reading.alertDates, ['2027-03-02', '2027-05-31']);
    assert.equal(contractRail.reading.alertButtonType, 'button',
      'owner-mapping removal uses a native button');
    assert.equal(contractRail.reading.hostFocusPreserved, true);
    assert.equal(contractRail.reading.hostileElementCount, 0,
      'hostile labels create no executable, navigable, or embedded element');
    assert.deepEqual(contractRail.reading.actionIds, [],
      'programmatic untrusted Chrome clicks dispatch no privileged action');
    assert.deepEqual(contractRail.alertConfirmation, {
      role: 'dialog', modal: 'true', eyebrow: 'LOCAL ALERT RECIPIENT',
      safeLabel: 'Keep current owner mapping', buttonTypes: ['button', 'button'],
      shadowOwnsSafe: true, regionCount: 1
    }, 'alert mapping removal reuses one modal confirmation with safe initial focus');
    assert.equal(contractRail.closed.regionCount, 1,
      'admitted closed replacement withdraws stale content before one blocker rail');
    assert.equal(contractRail.closed.citationCount, 0, 'closed replacement revokes all stale citation controls');
    assert.equal(contractRail.closed.mode, 'contract-closed');
    assert.equal(contractRail.closed.role, 'status');
    assert.ok(contractRail.closed.copy.includes(
      'Skopeo can’t verify this contract view. Reopen the folder or document and invoke Skopeo again.'
    ), 'Chrome shows the exact admitted contract-closed recovery copy');
    assert.deepEqual(contractRail.hostAfter, contractRail.hostBefore,
      'Chrome rail preserves host attributes, style, text, and focus');
    assertExactZero(contractRail.zero, 'contract rail shell after teardown');
    assert.equal(contractRail.rootCount, 0, 'contract teardown leaves no Shadow owner');
    assert.ok(contractRail.narrow.viewportWidth < 480, 'narrow fixture crosses the approved breakpoint');
    assert.equal(contractRail.narrow.left, 16);
    assert.equal(contractRail.narrow.right, 16);
    assert.equal(contractRail.narrow.width, contractRail.narrow.viewportWidth - 32);
    assert.equal(contractRail.narrow.columns, '1');
    assert.equal(contractRail.narrow.horizontalClip, false, 'narrow/zoom-safe rail has no horizontal clipping');
    assertExactZero(contractRail.narrow.zero, 'narrow contract shell after teardown');

    const askRail = result.askRail;
    assert.deepEqual(askRail.entry, {
      label: 'Ask about this agreement', type: 'button', regionCount: 1
    }, 'Chrome exposes one explicit native Ask entry in the current agreement rail');
    assert.equal(askRail.editing.regionCount, 1, 'Ask replacement overlaps no stale contract surface');
    assert.equal(askRail.editing.mode, 'ask');
    assert.equal(askRail.editing.role, 'region');
    assert.equal(askRail.editing.title, 'Ask contract evidence');
    assert.equal(askRail.editing.textareaTag, 'textarea');
    assert.equal(askRail.editing.rows, '4');
    assert.equal(askRail.editing.minHeight, '88px');
    assert.equal(askRail.editing.readOnly, false);
    assert.equal(askRail.editing.radioType, 'radio');
    assert.equal(askRail.editing.radioChecked, true);
    assert.ok(askRail.editing.controlTypes.length >= 2 &&
      askRail.editing.controlTypes.every(function(type) { return type === 'button'; }),
    'Ask actions use only native buttons');
    assert.deepEqual(askRail.editing.sectionOrder, [
      'back', 'heading', 'scope', 'question', 'scope-choices', 'actions', 'privacy'
    ], 'Ask DOM follows the fixed approved section order');
    assert.equal(askRail.editing.documentOwnsHost, true,
      'explicit Ask entry moves document focus only to the controlled Shadow host');
    assert.equal(askRail.editing.shadowOwnsTextarea, true,
      'explicit Ask entry puts Shadow focus in the native question field');
    assert.equal(askRail.editing.horizontalClip, false);
    assert.deepEqual(askRail.checking, {
      readOnly: true,
      statusRole: 'status',
      statusCopy: 'Checking accessible evidence…',
      cancelType: 'button',
      shadowOwnsCancel: true
    }, 'checking state is read-only, announced once, cancellable, and focused');
    assert.equal(askRail.answer.mode, 'answer');
    assert.equal(askRail.answer.outcome, 'review-required');
    assert.equal(askRail.answer.clearance, 'blocked');
    assert.equal(askRail.answer.trust, 'review-required');
    assert.deepEqual(askRail.answer.sections, [
      'answer-state', 'conclusion', 'governing-evidence', 'conflicts-and-gaps',
      'policy-safeguards', 'sources', 'result-actions'
    ], 'answer DOM keeps governing evidence, gaps, safeguards, and sources in fixed sections');
    assert.ok(askRail.answer.citationTypes.length >= 2 &&
      askRail.answer.citationTypes.every(function(type) { return type === 'button'; }),
    'answer evidence and source routes use native buttons');
    assert.equal(askRail.answer.policyButtonType, 'button');
    assert.equal(askRail.answer.memoCount, 0,
      'routine decision policy structurally omits all memo status and action copy');
    assert.equal(askRail.answer.hostileElementCount, 0,
      'hostile answer labels stay literal text without executable or navigable nodes');
    assert.equal(askRail.answer.shadowOwnsResult, true,
      'final answer receives deterministic programmatic focus');
    assert.deepEqual(askRail.confirmation, {
      role: 'dialog', modal: 'true',
      describedBy: 'skopeo-contract-confirmation-body',
      buttonTypes: ['button', 'button'], shadowOwnsSafe: true, regionCount: 1
    }, 'policy confirmation is one modal native-control surface with safe initial focus');
    assert.equal(askRail.payloadCount, 0,
      'programmatic untrusted Ask and policy clicks dispatch no privileged actions');
    assert.equal(askRail.withdrawn, true);
    assert.equal(askRail.residue, 0, 'Ask withdrawal removes every contract surface');
    assert.deepEqual(askRail.hostAfter, askRail.hostBefore,
      'Ask lifecycle preserves host attributes, style, text, and connection');
    assertExactZero(askRail.zero, 'Ask rail shell after teardown');
    assert.equal(askRail.rootCount, 0, 'Ask teardown leaves no Shadow owner');
    assert.ok(askRail.narrow.viewportWidth < 480);
    assert.equal(askRail.narrow.left, 16);
    assert.equal(askRail.narrow.right, 16);
    assert.equal(askRail.narrow.width, askRail.narrow.viewportWidth - 32);
    assert.equal(askRail.narrow.columns, '1');
    assert.equal(askRail.narrow.minHeight, '88px');
    assert.equal(askRail.narrow.horizontalClip, false,
      'narrow Ask rail keeps the question field reachable without horizontal clipping');
    assertExactZero(askRail.narrow.zero, 'narrow Ask shell after teardown');

    const semantic = result.semantic;
    assert.equal(semantic.loadedProductionScripts, true, 'Chrome loads the complete Phase 53 production stack');
    assert.deepEqual(semantic.scriptOrder, [
      'skopeo-profile-schema.js',
      'skopeo-context-router.js',
      'skopeo-app-context-resolver.js',
      'skopeo-anchor-registry.js',
      'skopeo-adapter-registry.js',
      'skopeo-hud-schema.js',
      'skopeo-adaptive-composer.js',
      'skopeo-renderer-registry.js',
      'skopeo-shell.js',
      'skopeo-runtime.js'
    ], 'Chrome executes Phase 53 scripts in dynamic production order');
    assert.equal(semantic.router.spoofStatus, 'unsupported', 'near-neighbor Drive origin fails closed in production Chrome');
    assert.equal(semantic.router.spoofReason, 'origin-unsupported', 'near-neighbor origin reports the exact router reason');
    assert.equal(semantic.router.spoofCopy, 'Skopeo doesn’t support this context.', 'origin spoof exposes exact quiet closed copy');
    assert.equal(semantic.router.spoofMarkCount, 0, 'origin spoof never flashes a semantic mark');
    assert.equal(semantic.router.recognizedStatus, 'recognized', 'exact trusted fixture route is recognized');
    assert.ok(semantic.router.epochs.every((epoch, index, epochs) => index === 0 || epoch > epochs[index - 1]),
      'same-document route epochs increase monotonically');
    assert.equal(semantic.router.finalIdentity, 'file-A', 'forward/back route churn ends on freshly certified meaning');

    for (const observation of ['node-reuse', 'reorder', 'detach', 'ABA', 'reverse-route', 'scroll', 'resize-420', 'zoom']) {
      assert.ok(semantic.observations.includes(observation), 'browser output includes ' + observation + ' observation');
    }
    assert.equal(semantic.wrongIdentitySamples, 0, 'every mutation/validation/commit sample has zero wrong-identity marks');
    assert.equal(semantic.maxMarkCount, 1, 'production projection never exposes more than one semantic mark');
    assert.equal(semantic.withdrawBeforeRebind, true, 'node reuse withdraws old authority before the new identity commits');
    assert.equal(semantic.staleABARejected, true, 'ABA cannot revive the first binding tuple');
    assert.equal(semantic.staleRouteRejected, true, 'same-document route churn rejects the prior route tuple');
    assert.equal(semantic.reverseOldCommitCountStable, true, 'late resolver completion produces no later commit');

    assert.equal(semantic.geometry.width, 8, 'real computed semantic mark width is 8px');
    assert.equal(semantic.geometry.height, 8, 'real computed semantic mark height is 8px');
    assert.equal(semantic.geometry.clearance, 8, 'real semantic mark keeps exact 8px target clearance');
    assert.ok(semantic.geometry.inset >= 16, 'real semantic mark keeps at least the 16px viewport inset');
    assert.equal(semantic.geometry.pointerEvents, 'none', 'real semantic mark is pointer-transparent');
    assert.equal(semantic.geometry.hitThrough, true, 'hit testing passes through the semantic mark');
    assert.equal(semantic.geometry.ariaHidden, 'true', 'semantic mark is absent from the accessibility tree');
    assert.equal(semantic.geometry.tabIndex, null, 'semantic mark is not focusable');
    assert.equal(semantic.geometry.regionRole, 'region', 'closed projection remains a named region');
    assert.equal(semantic.geometry.regionLabel, 'Skopeo anchored HUD', 'certified projection exposes exact anchored region semantics');
    assert.equal(semantic.geometry.liveRegionCount, 1, 'anchoring creates no extra live region');
    assert.equal(semantic.sameNodeMovement, true, 'same-identity movement updates the existing mark node');
    assert.equal(semantic.noPositionalInterpolation, true, 'same-identity movement has no positional interpolation');
    assert.equal(semantic.accessibilityWithdrawal.markCount, 0, 'withdrawal synchronously removes the mark from DOM/accessibility');
    assert.equal(semantic.accessibilityWithdrawal.regionLabel, 'Skopeo ambient HUD', 'withdrawal restores ambient region semantics');
    assert.equal(semantic.accessibilityWithdrawal.liveRegionCount, 1, 'withdrawal retains exactly one polite region');
    assert.equal(semantic.accessibilityWithdrawal.visibleCopy, 'Skopeo can’t verify this target.', 'withdrawal exposes exact quiet copy');

    assert.equal(semantic.cycles, 100, 'Chrome executes the required 100 authority cycles');
    assert.deepEqual(semantic.shellAfterCycles, semantic.shellPlateau, '100 cycles retain the stable shell resource plateau');
    assert.deepEqual(semantic.registryAfterCycles, semantic.registryPlateau, '100 cycles retain the stable registry resource plateau');
    assert.ok(semantic.narrow.viewportWidth < 480, 'semantic resize fixture reaches the 420 CSS-pixel boundary');
    assert.equal(semantic.narrow.committed, false, 'unsafe narrow semantic placement fails closed');
    assert.equal(semantic.narrow.markCount, 0, 'unsafe narrow semantic placement paints no mark');
    assertExactZero(semantic.narrow.after, 'narrow semantic fixture after destroy');
    assertExactZero(semantic.shellZero, 'semantic shell after 100 cycles/destroy');
    assertExactZero(semantic.registryZero, 'semantic registry after 100 cycles/destroy');
    assertExactZero(semantic.runtimeZero, 'idle production runtime after replacement disposal');
    assert.equal(semantic.runtimeListenerCount, 0, 'runtime listener is removed on replacement disposal');
    assert.equal(semantic.rootCountAfterDestroy, 0, 'semantic closure leaves no production root');
    assert.deepEqual(semantic.hostAfter, semantic.hostBefore, 'semantic churn preserves host attributes, styles, focus, selection, and scroll');

    console.log('skopeo-browser-contract: PASS (' + resolution.executable + ') observations=' +
      semantic.observations.join(','));
    return result;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  }
}

module.exports = {
  RESOURCE_KEYS,
  CHROME_PATHS,
  resolveChrome,
  shellRendererSeamState,
  askShellSeamState,
  runChromeContract
};

if (require.main === module) {
  if (process.env.SKOPEO_ASK_EXPECT_SHELL_RED === '1') {
    try {
      runAskShellControlledRed();
    } catch (error) {
      console.error(error && error.stack || error);
      process.exitCode = 1;
    }
  } else if (process.env.SKOPEO_HUD_EXPECT_SHELL_RED === '1') {
    try {
      runShellRendererControlledRed();
    } catch (error) {
      console.error(error && error.stack || error);
      process.exitCode = 1;
    }
  } else {
    try {
      assert.deepEqual(shellRendererSeamState(), Object.freeze({ renderContractView: true }),
        'production browser mechanics require the exact shell renderer interface');
      assert.deepEqual(askShellSeamState(), Object.freeze({ ask: true, confirmation: true }),
        'production browser mechanics require both Phase 58 shell renderer interfaces');
    } catch (error) {
      console.error(error && error.stack || error);
      process.exitCode = 1;
    }
    if (!process.exitCode) {
      runChromeContract().catch(error => {
        console.error(error);
        process.exitCode = 1;
      });
    }
  }
}
