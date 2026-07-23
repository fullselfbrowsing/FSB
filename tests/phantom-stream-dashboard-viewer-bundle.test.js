'use strict';

/**
 * Phase 23 Plan 01 -- PhantomStream dashboard viewer bundle guard.
 *
 * Verifies the shared browser-global viewer wrapper is built and loaded by
 * both dashboard shells before any renderer migration begins.
 *
 * Run: node tests/phantom-stream-dashboard-viewer-bundle.test.js
 */

const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const runtimeState = require('../showcase/js/dashboard-runtime-state.js');

const repoRoot = path.resolve(__dirname, '..');
const esbuildSource = fs.readFileSync(path.join(repoRoot, 'esbuild.config.js'), 'utf8');
const entrySource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'phantom-stream-viewer-entry.js'), 'utf8');
const runtimeStateSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard-runtime-state.js'), 'utf8');
const bundlePath = path.join(repoRoot, 'showcase', 'js', 'phantom-stream-viewer.js');
const staticHtml = fs.readFileSync(path.join(repoRoot, 'showcase', 'dashboard.html'), 'utf8');
const angularJson = fs.readFileSync(path.join(repoRoot, 'showcase', 'angular', 'angular.json'), 'utf8');
const angularIndex = fs.readFileSync(path.join(repoRoot, 'showcase', 'angular', 'src', 'index.html'), 'utf8');
const angularDashboardTs = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'),
  'utf8'
);

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- Shared PhantomStream dashboard viewer wrapper ---');

const viewerCopyKeys = [...new Set(
  [
    ...entrySource.matchAll(/text\('([^']+)'/g),
    ...entrySource.matchAll(/localizedText\(copy,\s*'([^']+)'/g),
    ...runtimeStateSource.matchAll(/copyText\(copy,\s*'([^']+)'/g),
  ].map((match) => match[1])
)];
const localizedDashboardCopyKeys = new Set(
  [...angularDashboardTs.matchAll(/^\s*(\w+):\s*\$localize`/gm)].map((match) => match[1])
);
const missingViewerCopy = viewerCopyKeys.filter((key) => !localizedDashboardCopyKeys.has(key));
ok(missingViewerCopy.length === 0,
  'every viewer copy key is backed by Angular $localize'
    + (missingViewerCopy.length ? ': ' + missingViewerCopy.join(', ') : ''));

ok(esbuildSource.includes("name: 'showcase-phantom-stream-viewer'"),
  'esbuild declares showcase-phantom-stream-viewer entry');
ok(esbuildSource.includes('phantom-stream-viewer-entry.js'),
  'esbuild reads dashboard viewer wrapper entry');
ok(esbuildSource.includes('phantom-stream-viewer.js'),
  'esbuild emits dashboard viewer bundle');

ok(entrySource.includes("from '@full-self-browsing/phantom-stream/renderer'"),
  'viewer wrapper imports PhantomStream renderer surface');
ok(entrySource.includes("from '@full-self-browsing/phantom-stream/protocol'"),
  'viewer wrapper imports PhantomStream protocol constants');
ok(entrySource.includes('globalThis.FSBPhantomStreamViewer'),
  'viewer wrapper exposes browser global');
ok(entrySource.includes('createDashboardViewer'),
  'viewer wrapper exposes FSB createDashboardViewer adapter');
ok(entrySource.includes('dispatchMessage'),
  'viewer wrapper exposes dashboard message dispatch');
ok(entrySource.includes('mapPointToViewport'),
  'viewer wrapper exposes host-to-viewport point mapping');
ok(entrySource.includes('type === CONTROL.START'),
  'viewer wrapper maps CONTROL.START to host resync callback');
ok(entrySource.includes('type === CONTROL.SUBTREE_REQUEST'),
  'viewer wrapper contains subtree request callback seam without claiming routing');
ok(entrySource.includes('installViewerLocalization') && entrySource.includes('cfg.copy'),
  'viewer wrapper accepts localized copy for package-owned visible UI');
ok(entrySource.includes('installLocalizedProgressRenderer') && entrySource.includes("registerOverlay('progress'"),
  'viewer wrapper localizes built-in progress at the presentation layer');
ok(!entrySource.includes('localizeViewerPayload'),
  'viewer wrapper does not rewrite raw extension progress payloads');
ok(entrySource.includes('hostTransport.dispatch(type, nextPayload)')
  && entrySource.includes('var nextPayload = payload || {}'),
  'viewer dispatch preserves the raw payload contract');
ok(!entrySource.includes('observer.observe(doc, { childList: true, subtree: true })'),
  'viewer localization does not observe entire mirrored documents');
ok(entrySource.includes('new WeakRef(frame)') && entrySource.includes('Array.from(frameRefs)'),
  'viewer teardown tracks detached frames without retaining them strongly');
ok(entrySource.includes('if (previousDocument) unwireFrames(previousDocument)'),
  'viewer reload removes listeners from retired descendant frame trees');
ok(entrySource.includes('host.shadowRoot') && entrySource.includes('visit(host.shadowRoot)'),
  'viewer frame discovery crosses open shadow roots');
ok(!entrySource.includes('frameLoadCleanups = new Set()')
  && !entrySource.includes('documentLoadCleanups = new Set()'),
  'viewer frame lifecycle does not strongly retain retired frame trees');
ok(!entrySource.includes('elements.push.apply(elements, start.querySelectorAll(selector))'),
  'viewer frame discovery avoids argument-limit failures on large mirrored DOMs');
ok(/function detach\(\)[\s\S]*?localization\.stop\(\);[\s\S]*?viewer\.detach\(\)/.test(entrySource)
  && /function destroy\(\)[\s\S]*?localization\.stop\(\);[\s\S]*?viewer\.destroy\(\)/.test(entrySource),
  'wrapper stops localization before renderer teardown removes the frame tree');

const bridgeBuild = esbuild.buildSync({
  entryPoints: [path.join(repoRoot, 'showcase', 'js', 'phantom-stream-viewer-entry.js')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
});
const bridgeModule = { exports: {} };
Function('require', 'module', 'exports', bridgeBuild.outputFiles[0].text)(
  require,
  bridgeModule,
  bridgeModule.exports
);
const {
  installLocalizedProgressRenderer,
  installViewerLocalization,
  payloadMayInstallFrames,
  payloadMayRemoveFrames,
} = bridgeModule.exports;
const localizedCopy = {
  phasePlanning: 'PLAN',
  phaseWorking: 'WORK',
};
globalThis.FSBDashboardRuntimeState = runtimeState;
const progressElement = { textContent: '', style: { display: '' } };
const registeredOverlays = new Map();
const fakeViewer = {
  registerOverlay(kind, renderer) { registeredOverlays.set(kind, renderer); },
};
installLocalizedProgressRenderer(fakeViewer, localizedCopy, { warn() {} });
const progressRenderer = registeredOverlays.get('progress');
const rawProgress = { mode: 'indeterminate', phase: 'planning', label: 'Planning…' };
progressRenderer(rawProgress, null, { querySelector: () => progressElement });
ok(progressElement.textContent === 'PLAN… - PLAN' && progressElement.style.display === 'block',
  'built-in progress renderer formats real canonical phase and label values synchronously');
ok(rawProgress.phase === 'planning' && rawProgress.label === 'Planning…',
  'built-in progress localization leaves the raw progress object unchanged');
progressRenderer(null, null, { querySelector: () => progressElement });
ok(progressElement.style.display === 'none',
  'localized progress renderer honors the built-in null-to-hide contract');
ok(payloadMayInstallFrames(globalThis.FSBPhantomStreamViewer.STREAM.MUTATIONS, {
  mutations: [{ op: 'shadow-root' }],
}), 'frame refresh recognizes shadow-root mutation batches');
ok(!payloadMayInstallFrames(globalThis.FSBPhantomStreamViewer.STREAM.MUTATIONS, {
  mutations: [{ op: 'text' }],
}), 'frame refresh skips ordinary text-only mutation batches');
ok(!payloadMayInstallFrames(globalThis.FSBPhantomStreamViewer.STREAM.MUTATIONS, {
  mutations: [{ op: 'rm', nid: 'detached-frame-host' }],
}), 'frame discovery skips removal-only mutation batches');
ok(payloadMayRemoveFrames(globalThis.FSBPhantomStreamViewer.STREAM.MUTATIONS, {
  mutations: [{ op: 'rm', nid: 'detached-frame-host' }],
}), 'frame reconciliation recognizes removals that may detach frame trees');

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    FakeMutationObserver.instances.push(this);
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
  disconnect() { this.disconnected = true; }
}
FakeMutationObserver.instances = [];

function fakeDocument() {
  const listeners = new Set();
  return {
    nodeType: 9,
    listeners,
    matches: () => false,
    querySelectorAll: () => [],
    addEventListener(type, handler, options) {
      const capture = typeof options === 'object' ? options.capture === true : options === true;
      if (type === 'load' && capture) {
        listeners.add(handler);
        if (options && typeof options === 'object' && options.signal) {
          options.signal.addEventListener('abort', () => listeners.delete(handler), { once: true });
        }
      }
    },
    removeEventListener(type, handler, options) {
      const capture = typeof options === 'object' ? options.capture === true : options === true;
      if (type === 'load' && capture) listeners.delete(handler);
    },
  };
}

const firstFrameDocument = fakeDocument();
const secondFrameDocument = fakeDocument();
const frameLoadListeners = new Set();
let titleWrites = 0;
const frame = {
  nodeType: 1,
  tagName: 'IFRAME',
  contentDocument: firstFrameDocument,
  title: 'PhantomStream live mirror',
  matches: (selector) => selector === 'iframe',
  querySelectorAll: () => [],
  getAttribute(name) { return name === 'title' ? this.title : null; },
  setAttribute(name, value) {
    if (name === 'title') {
      this.title = value;
      titleWrites += 1;
    }
  },
  addEventListener(type, handler, options) {
    if (type === 'load') {
      frameLoadListeners.add(handler);
      if (options && typeof options === 'object' && options.signal) {
        options.signal.addEventListener('abort', () => frameLoadListeners.delete(handler), { once: true });
      }
    }
  },
  removeEventListener(type, handler) { if (type === 'load') frameLoadListeners.delete(handler); },
};
const shadowFrameDocument = fakeDocument();
const shadowFrameLoadListeners = new Set();
const shadowFrame = {
  nodeType: 1,
  tagName: 'IFRAME',
  contentDocument: shadowFrameDocument,
  matches: (selector) => selector === 'iframe',
  getRootNode: () => shadowRoot,
  querySelectorAll: () => [],
  getAttribute: () => null,
  setAttribute() {},
  addEventListener(type, handler, options) {
    if (type === 'load') {
      shadowFrameLoadListeners.add(handler);
      if (options && typeof options === 'object' && options.signal) {
        options.signal.addEventListener('abort', () => shadowFrameLoadListeners.delete(handler), { once: true });
      }
    }
  },
  removeEventListener(type, handler) { if (type === 'load') shadowFrameLoadListeners.delete(handler); },
};
const shadowRoot = {
  nodeType: 11,
  host: null,
  matches: () => false,
  querySelectorAll: (selector) => selector === 'iframe' ? [shadowFrame] : [],
};
const shadowHost = {
  nodeType: 1,
  shadowRoot,
  matches: () => false,
  querySelectorAll: () => [],
};
shadowRoot.host = shadowHost;
let lightFrames = [frame];
let shadowHosts = [shadowHost];
let containerQueries = 0;
const container = {
  nodeType: 1,
  matches: () => false,
  contains(node) {
    return (node === frame && lightFrames.includes(frame))
      || (node === shadowHost && shadowHosts.includes(shadowHost));
  },
  querySelectorAll(selector) {
    containerQueries += 1;
    if (selector === 'iframe') return lightFrames;
    if (selector === '*') return shadowHosts;
    return [];
  },
};
const originalMutationObserver = globalThis.MutationObserver;
globalThis.MutationObserver = FakeMutationObserver;
const localization = installViewerLocalization(
  container,
  { viewerLiveMirrorTitle: 'Localized mirror' },
  { warn() {} }
);
ok(frame.title === 'Localized mirror' && frameLoadListeners.size === 1,
  'viewer localization wires and labels the live mirror frame');
ok(shadowFrameLoadListeners.size === 1,
  'viewer localization wires nested frames inside open shadow roots');
ok(firstFrameDocument.listeners.size === 1,
  'viewer localization captures nested frame loads without a document-wide observer');
frame.contentDocument = secondFrameDocument;
frameLoadListeners.forEach((listener) => listener());
ok(firstFrameDocument.listeners.size === 0 && secondFrameDocument.listeners.size === 1,
  'viewer reload removes the old document listener before wiring the new document');
FakeMutationObserver.instances[0].callback([{ type: 'attributes', target: frame, addedNodes: [] }]);
ok(titleWrites === 1,
  'observer callback does not rewrite an already-localized title or self-loop');
lightFrames = [];
FakeMutationObserver.instances[0].callback([{
  type: 'childList',
  target: container,
  addedNodes: [],
  removedNodes: [frame],
}]);
ok(frameLoadListeners.size === 0 && secondFrameDocument.listeners.size === 0,
  'viewer localization unwires a removed frame before global teardown');
lightFrames = [frame];
localization.refresh();
ok(frameLoadListeners.size === 1 && secondFrameDocument.listeners.size === 1,
  'viewer refresh rewires a currently attached frame');
lightFrames = [];
const queriesBeforeRemovalReconcile = containerQueries;
localization.reconcile();
ok(frameLoadListeners.size === 0 && secondFrameDocument.listeners.size === 0,
  'viewer removal reconciliation unwires a detached frame retained outside the DOM');
ok(containerQueries === queriesBeforeRemovalReconcile,
  'viewer removal reconciliation does not rescan the mirrored host tree');
shadowHosts = [];
FakeMutationObserver.instances[0].callback([{
  type: 'childList',
  target: container,
  addedNodes: [],
  removedNodes: [shadowHost],
}]);
ok(shadowFrameLoadListeners.size === 0 && shadowFrameDocument.listeners.size === 0,
  'viewer localization unwires frames in a removed open shadow root');
ok(FakeMutationObserver.instances[0].target === container
  && FakeMutationObserver.instances[0].options?.subtree === true
  && FakeMutationObserver.instances[0].options?.characterData !== true,
  'viewer localization observes only the host tree and not mirrored document text');
localization.stop();
ok(FakeMutationObserver.instances.every((observer) => observer.disconnected),
  'viewer teardown disconnects its host observer');

function fakeElement(textContent, attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    nodeType: 1,
    textContent,
    matches: () => false,
    querySelectorAll: () => [],
    getAttribute(name) { return values.has(name) ? values.get(name) : null; },
    setAttribute(name, value) { values.set(name, value); },
  };
}

function makePlaceholderDocument() {
  const doc = fakeDocument();
  const heading = fakeElement('Cross-origin iframe');
  const origin = fakeElement('Origin: https://example.test');
  const source = fakeElement('Source: https://example.test/frame');
  const placeholder = fakeElement('');
  placeholder.matches = (selector) => selector === '.ps-frame-placeholder[role="note"]';
  doc.body = { children: [placeholder], firstElementChild: placeholder };
  doc.querySelectorAll = (selector) => {
    if (selector === '.ps-frame-placeholder strong') return [heading];
    if (selector === '.ps-frame-placeholder p') return [origin, source];
    return [];
  };
  return { doc, heading, origin, source };
}

function makeFrame(doc, srcdoc) {
  const listeners = new Set();
  return {
    nodeType: 1,
    tagName: 'IFRAME',
    contentDocument: doc,
    listeners,
    matches: (selector) => selector === 'iframe',
    querySelectorAll: () => [],
    getAttribute(name) { return name === 'srcdoc' ? srcdoc : null; },
    setAttribute() {},
    addEventListener(type, handler) { if (type === 'load') listeners.add(handler); },
    removeEventListener(type, handler) { if (type === 'load') listeners.delete(handler); },
  };
}

function frameContainer(frameToReturn) {
  return {
    nodeType: 1,
    matches: () => false,
    querySelectorAll(selector) {
      if (selector === 'iframe') return [frameToReturn];
      return [];
    },
  };
}

const placeholderCopy = {
  viewerCrossOriginFrame: 'Externer Frame',
  viewerOriginLabel: 'Ursprung',
  viewerSourceLabel: 'Quelle',
};
const rendererPlaceholder = makePlaceholderDocument();
const rendererPlaceholderFrame = makeFrame(
  rendererPlaceholder.doc,
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + 'body{margin:0;font:13px system-ui,sans-serif;color:#30333a;background:#f6f7f9;}'
    + '.ps-frame-placeholder{box-sizing:border-box}</style></head></html>'
);
const rendererPlaceholderLocalization = installViewerLocalization(
  frameContainer(rendererPlaceholderFrame),
  placeholderCopy,
  { warn() {} }
);
ok(rendererPlaceholder.heading.textContent === 'Externer Frame'
  && rendererPlaceholder.origin.textContent === 'Ursprung: https://example.test'
  && rendererPlaceholder.source.textContent === 'Quelle: https://example.test/frame',
  'viewer localizes package-owned cross-origin placeholder labels');
rendererPlaceholderLocalization.stop();

const capturedCollision = makePlaceholderDocument();
const capturedCollisionFrame = makeFrame(
  capturedCollision.doc,
  '<!DOCTYPE html><html><head><meta name="viewport" content="width=1200"></head>'
    + '<body><div class="ps-frame-placeholder" role="note"></div></body></html>'
);
const capturedCollisionLocalization = installViewerLocalization(
  frameContainer(capturedCollisionFrame),
  placeholderCopy,
  { warn() {} }
);
ok(capturedCollision.heading.textContent === 'Cross-origin iframe'
  && capturedCollision.origin.textContent === 'Origin: https://example.test'
  && capturedCollision.source.textContent === 'Source: https://example.test/frame',
  'viewer never rewrites captured page content that collides with placeholder classes');
capturedCollisionLocalization.stop();

const playMedia = fakeElement('', { 'aria-label': 'Play mirrored media' });
const unmuteMedia = fakeElement('', { 'aria-label': 'Unmute mirrored media' });
const unmuteLabel = fakeElement('Unmute');
const posterLabel = fakeElement('Media (poster only)');
const unavailableLabel = fakeElement('Media unavailable');
const dialogLabel = fakeElement('Confirm');
const uiBySelector = new Map([
  ['[aria-label="Play mirrored media"]', [playMedia]],
  ['[aria-label="Unmute mirrored media"]', [unmuteMedia]],
  ['.ps-overlay-media-unmute-label', [unmuteLabel]],
  ['.ps-overlay-media-poster', [posterLabel]],
  ['.ps-overlay-media-unavailable', [unavailableLabel]],
  ['.ps-overlay-dialog-type', [dialogLabel]],
]);
const uiContainer = {
  nodeType: 1,
  matches: () => false,
  querySelectorAll(selector) { return uiBySelector.get(selector) || []; },
};
const uiLocalization = installViewerLocalization(uiContainer, {
  viewerPlayMedia: 'Medien abspielen',
  viewerUnmuteMedia: 'Medien aktivieren',
  viewerUnmute: 'Ton an',
  viewerMediaPosterOnly: 'Nur Vorschaubild',
  viewerMediaUnavailable: 'Medien nicht verfügbar',
  dialogConfirm: 'Bestätigen',
}, { warn() {} });
ok(playMedia.getAttribute('aria-label') === 'Medien abspielen'
  && unmuteMedia.getAttribute('aria-label') === 'Medien aktivieren'
  && unmuteLabel.textContent === 'Ton an'
  && posterLabel.textContent === 'Nur Vorschaubild'
  && unavailableLabel.textContent === 'Medien nicht verfügbar'
  && dialogLabel.textContent === 'Bestätigen',
  'viewer localizes media controls and dialog chrome at the host boundary');
uiLocalization.stop();
ok(FakeMutationObserver.instances.every((observer) => observer.disconnected),
  'every viewer localization instance disconnects its host observer');
globalThis.MutationObserver = originalMutationObserver;

console.log('\n--- Generated bundle ---');

ok(fs.existsSync(bundlePath), 'generated dashboard viewer bundle exists');
const bundleSource = fs.readFileSync(bundlePath, 'utf8');
const expectedBrowserBundle = esbuild.buildSync({
  entryPoints: [path.join(repoRoot, 'showcase', 'js', 'phantom-stream-viewer-entry.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  legalComments: 'none',
  write: false,
}).outputFiles[0].text;
ok(bundleSource === expectedBrowserBundle,
  'generated dashboard viewer bundle exactly matches its current entry source');
ok(bundleSource.includes('FSBPhantomStreamViewer'),
  'generated bundle exposes FSBPhantomStreamViewer');
ok(bundleSource.includes('createDashboardViewer'),
  'generated bundle contains createDashboardViewer');
ok(bundleSource.includes('createViewer'),
  'generated bundle contains PhantomStream createViewer code');
ok(bundleSource.includes('mapHostPointToViewport'),
  'generated bundle exposes viewport point mapping helper');
ok(bundleSource.includes('installViewerLocalization'),
  'generated bundle contains viewer localization bridge');
ok(!/^\s*import\s/m.test(bundleSource),
  'generated viewer bundle has no remaining ESM import statements');

console.log('\n--- Dashboard shell loading ---');

const runtimeIndex = staticHtml.indexOf('js/dashboard-runtime-state.js');
const viewerIndex = staticHtml.indexOf('js/phantom-stream-viewer.js');
const dashboardIndex = staticHtml.indexOf('js/dashboard.js');
ok(runtimeIndex !== -1, 'static dashboard loads runtime-state script');
ok(viewerIndex !== -1, 'static dashboard loads PhantomStream viewer script');
ok(dashboardIndex !== -1, 'static dashboard loads dashboard.js');
ok(runtimeIndex < viewerIndex && viewerIndex < dashboardIndex,
  'static dashboard loads viewer after runtime-state and before dashboard.js');

ok(angularJson.includes('"glob": "phantom-stream-viewer.js"'),
  'Angular build copies phantom-stream-viewer.js from static js assets');
ok(angularJson.includes('"input": "../js"'),
  'Angular viewer asset copy uses shared showcase/js source');
ok(angularIndex.includes('assets/phantom-stream-viewer.js'),
  'Angular index loads PhantomStream viewer asset');
ok(angularIndex.indexOf('assets/dashboard-runtime-state.js') < angularIndex.indexOf('assets/phantom-stream-viewer.js'),
  'Angular index loads viewer after runtime-state');
ok(!angularDashboardTs.includes('@full-self-browsing/phantom-stream'),
  'Angular dashboard component does not import PhantomStream package directly');
ok(angularDashboardTs.includes('copy: this.dashboardCopy'),
  'Angular dashboard supplies localized copy to the shared viewer');

console.log('\nPhantomStream dashboard viewer bundle guard: ' + passed + ' PASS / 0 FAIL');
