'use strict';

/**
 * Phase 33 (MEDIA) -- FSB media-mirroring wiring lock.
 *
 * The PhantomStream 0.2.1 package carries the whole media feature (createCapture
 * emits STREAM.MEDIA, createViewer drives playback + reconcileMediaDrift). FSB
 * only has to (a) surface the new symbols in the generated bundles and (b)
 * un-drop the STREAM.MEDIA / STREAM.MEDIA_HINT side channel at three glue
 * points: the content-script capture forwarder (whose allowlist silently drops
 * unknown STREAM.* types), the background relay, and the dashboard viewer
 * dispatch (static + Angular). This test pins every seam so a future bundle
 * rebuild or refactor cannot silently re-drop media.
 *
 * Run: node tests/phantom-stream-media-wiring.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(repoRoot, rel), 'utf8'); }

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- PhantomStream media wiring (Phase 33) ---');

// 1. Capture forwarder un-drops STREAM.MEDIA / STREAM.MEDIA_HINT (the one true
//    blocker: forwardCaptureMessage drops any STREAM.* it does not branch on).
const domStream = read('extension/content/dom-stream.js');
ok(domStream.includes('type === STREAM.MEDIA'), 'dom-stream forwards STREAM.MEDIA');
ok(domStream.includes("action: 'domStreamMedia'"), 'dom-stream maps STREAM.MEDIA to domStreamMedia');
ok(domStream.includes('type === STREAM.MEDIA_HINT'), 'dom-stream forwards STREAM.MEDIA_HINT');
ok(domStream.includes("action: 'domStreamMediaHint'"), 'dom-stream maps STREAM.MEDIA_HINT to domStreamMediaHint');

// 2. Background relay translates the actions to the new wire types
const background = read('extension/background.js');
ok(background.includes("case 'domStreamMedia'"), 'background relays domStreamMedia');
ok(background.includes("fsbWebSocket.send('ext:dom-media'"), 'background sends ext:dom-media to the relay');
ok(background.includes("case 'domStreamMediaHint'"), 'background relays domStreamMediaHint');
ok(background.includes("fsbWebSocket.send('ext:dom-media-hint'"), 'background sends ext:dom-media-hint to the relay');

// 3. Static dashboard consumes + dispatches media; mediaMode is 'reference'
const dashboard = read('showcase/js/dashboard.js');
ok(dashboard.includes('function handleDOMMedia'), 'static dashboard has handleDOMMedia');
ok(dashboard.includes("dispatchPreviewViewer('ext:dom-media'"), 'static dashboard dispatches ext:dom-media to the viewer');
ok(dashboard.includes("msg.type === 'ext:dom-media'"), 'static dashboard routes inbound ext:dom-media');
ok(dashboard.includes("mediaMode: 'reference'"), 'static dashboard sets viewer mediaMode reference');

// 4. Angular dashboard parity
const angular = read('showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts');
ok(angular.includes('handleDOMMedia'), 'angular dashboard has handleDOMMedia');
ok(angular.includes("this.dispatchPreviewViewer('ext:dom-media'"), 'angular dashboard dispatches ext:dom-media');
ok(angular.includes("msg.type === 'ext:dom-media'"), 'angular dashboard routes inbound ext:dom-media');
ok(angular.includes("mediaMode: 'reference'"), 'angular dashboard sets viewer mediaMode reference');

// 4b. Dormant MEDIA_HINT seam locked on both dashboards, so a future refactor
//     cannot silently re-drop the adaptive-manifest hint channel before it is
//     enabled (the discovery path itself stays deferred / off by default).
ok(dashboard.includes('function handleDOMMediaHint'), 'static dashboard has handleDOMMediaHint');
ok(dashboard.includes("dispatchPreviewViewer('ext:dom-media-hint'"), 'static dashboard dispatches ext:dom-media-hint');
ok(dashboard.includes("msg.type === 'ext:dom-media-hint'"), 'static dashboard routes inbound ext:dom-media-hint');
ok(angular.includes('handleDOMMediaHint'), 'angular dashboard has handleDOMMediaHint');
ok(angular.includes("this.dispatchPreviewViewer('ext:dom-media-hint'"), 'angular dashboard dispatches ext:dom-media-hint');
ok(angular.includes("msg.type === 'ext:dom-media-hint'"), 'angular dashboard routes inbound ext:dom-media-hint');

// 5. Viewer entry passes media config into createViewer
const viewerEntry = read('showcase/js/phantom-stream-viewer-entry.js');
ok(viewerEntry.includes('mediaMode: cfg.mediaMode'), 'viewer entry forwards mediaMode to createViewer');
ok(viewerEntry.includes('onMediaUnavailable'), 'viewer entry forwards the media-unavailable degrade callback');
ok(viewerEntry.includes('onMediaBlocked'), 'viewer entry forwards the media-blocked degrade callback');

// 6. Protocol entry surfaces classifyManifest (deferred MEDIA_HINT discovery)
const protocolEntry = read('extension/ws/phantom-stream-protocol-entry.js');
ok(protocolEntry.includes('classifyManifest'), 'protocol entry surfaces classifyManifest');

// 7. Generated bundles carry the media surface (rebuilt from the 0.2.1 package)
const protocolBundle = read('extension/ws/phantom-stream-protocol.js');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(protocolBundle, sandbox, { filename: 'phantom-stream-protocol.js' });
const P = sandbox.FSBPhantomStreamProtocol;
ok(P && P.STREAM.MEDIA === 'ext:dom-media', 'protocol bundle exposes STREAM.MEDIA');
ok(P && P.STREAM.MEDIA_HINT === 'ext:dom-media-hint', 'protocol bundle exposes STREAM.MEDIA_HINT');
ok(P && typeof P.classifyManifest === 'function', 'protocol bundle exposes classifyManifest');

const captureBundle = read('extension/content/phantom-stream-capture.js');
ok(captureBundle.includes('ext:dom-media'), 'capture bundle (createCapture) carries the ext:dom-media side channel');
ok(captureBundle.includes('function collectTrackedMediaElements') &&
  captureBundle.includes('document.querySelectorAll("video, audio")'),
  'capture bundle collects document media baseline');
ok(captureBundle.includes('safeSend(STREAM.MEDIA, payload);'),
  'capture bundle emits STREAM.MEDIA updates');
ok(captureBundle.includes('function attachMediaListenersUnder') &&
  captureBundle.includes('function detachMediaListenersUnder'),
  'capture bundle has subtree attach/detach helpers for media listeners');
ok(captureBundle.includes('attachMediaListenersUnder(added);'),
  'capture media tracker attaches mutation-added media subtrees');
ok(captureBundle.includes('skipElementWithAncestors(el)') &&
  captureBundle.includes('maskMediaWithAncestors(el)'),
  'capture media tracker applies skip/block/mask gates');

const viewerBundle = read('showcase/js/phantom-stream-viewer.js');
ok(/reconcileMediaDrift|MediaPlayer/.test(viewerBundle), 'viewer bundle carries the media player + drift reconciler');
ok(viewerBundle.includes('function buildAssetPlaceholderEl') &&
  viewerBundle.includes('data-ps-asset-unavailable'),
  'viewer bundle creates asset-unavailable placeholders');
ok(viewerBundle.includes('function gateFragmentAssets') &&
  viewerBundle.includes('function gateFragmentMedia'),
  'viewer bundle gates image and media assets');
ok(viewerBundle.includes('el.removeAttribute("srcset");') &&
  viewerBundle.includes('el.removeAttribute("src");') &&
  viewerBundle.includes('el.removeAttribute("poster");'),
  'viewer asset gates neutralize fetchable image/media attrs');
ok(viewerBundle.includes('function applyMediaAction') &&
  viewerBundle.includes('action.action === "pause"') &&
  viewerBundle.includes('el.pause();'),
  'viewer media reconciler applies pause actions');

console.log('\nPhantomStream media wiring: ' + passed + ' PASS / 0 FAIL');
