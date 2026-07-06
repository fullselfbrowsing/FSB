'use strict';

/**
 * Phase 23 Plan 04 -- dashboard side-channel and diagnostics closeout guard.
 *
 * Verifies the PhantomStream-backed dashboard viewers preserve FSB-owned
 * preview states, side-channel UI, frozen identity, diagnostics, and resync
 * latching around the shared renderer wrapper.
 *
 * Run: node tests/phantom-stream-dashboard-sidechannels.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const runtimeState = require('../showcase/js/dashboard-runtime-state.js');
const staticHtml = fs.readFileSync(path.join(repoRoot, 'showcase', 'dashboard.html'), 'utf8');
const staticCss = fs.readFileSync(path.join(repoRoot, 'showcase', 'css', 'dashboard.css'), 'utf8');
const staticSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard.js'), 'utf8');
const angularHtml = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.html'),
  'utf8'
);
const angularScss = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.scss'),
  'utf8'
);
const angularSource = fs.readFileSync(
  path.join(repoRoot, 'showcase', 'angular', 'src', 'app', 'pages', 'dashboard', 'dashboard-page.component.ts'),
  'utf8'
);

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  passed += 1;
  console.log('  PASS:', message + ' (expected: ' + expected + ', got: ' + actual + ')');
}

function verifyPreviewState(name, input, expected) {
  const surface = runtimeState.derivePreviewSurface(input);
  Object.keys(expected).forEach(key => {
    equal(surface[key], expected[key], name + ' ' + key);
  });
}

function verifyMarkupAndStyles(name, html, styles) {
  [
    'dash-preview-viewer',
    'dash-preview-glow',
    'dash-remote-overlay',
    'dash-preview-progress',
    'dash-preview-progress-badge',
    'dash-preview-progress-status',
    'dash-preview-progress-detail',
    'dash-preview-dialog',
    'dash-preview-frozen-overlay',
    'dash-preview-frozen-badge',
  ].forEach(id => {
    ok(html.includes(id), name + ' dashboard contains #' + id);
  });

  [
    '.dash-preview-viewer',
    '.dash-preview-progress-top',
    '.dash-preview-progress-status',
    '.dash-preview-progress-detail',
    '.dash-preview-client-badge',
    '.dash-preview-client-badge-frozen',
    '.dash-preview-frozen-stack',
    '.dash-preview-frozen-label.frozen-disconnect',
    '.dash-preview-frozen-label.frozen-complete',
  ].forEach(selector => {
    ok(styles.includes(selector), name + ' dashboard styles ' + selector);
  });
}

function verifySideChannelSource(name, source) {
  [
    'lastPreviewOverlayIdentity',
    'rememberPreviewOverlayIdentity',
    'clearPreviewOverlayIdentity',
    'renderPreviewClientBadge',
    'renderPreviewFrozenIdentity',
    'payload.progress.clientLabel',
    'payload.progress.detail',
    'previewProgressDetail',
    'previewProgressBadge',
    'previewFrozenBadge',
    "dispatchPreviewViewer('ext:dom-scroll', payload)",
    "dispatchPreviewViewer('ext:dom-overlay', payload)",
    "dispatchPreviewViewer('ext:dom-dialog', payload)",
  ].forEach(needle => {
    ok(source.includes(needle), name + ' dashboard preserves side-channel source contract: ' + needle);
  });

  ok(source.includes("previewState === 'frozen-disconnect'") && source.includes("previewState === 'frozen-complete'"),
    name + ' dashboard allows side-channel overlay handling while frozen');
}

function verifyDiagnosticsSource(name, source) {
  [
    'previewViewerHealth',
    'staleMisses',
    'applyFailures',
    'lastFrameAt',
    'lastSnapshotAt',
    'lastFrameAgo',
    'last-frame: ',
    'mutations: ',
    'apply failures: ',
    'stale: ',
    'dom-mutations-dispatched',
  ].forEach(needle => {
    ok(source.includes(needle), name + ' dashboard preserves diagnostics source contract: ' + needle);
  });

  ok(!source.includes('previewTooltip.textContent = payload.html'),
    name + ' dashboard tooltip does not expose mirrored HTML payloads');
}

function verifyResyncSource(name, source) {
  ok(source.includes('previewResyncPending) return false'),
    name + ' dashboard latches preview resync requests');
  ok(source.includes('previewResyncPending = true'),
    name + ' dashboard sets resync latch before stream-start request');
  ok(source.includes('previewResyncPending = false'),
    name + ' dashboard clears resync latch on a fresh generation or send failure');
  ok(source.includes("sendDashboardWSMessage('dash:dom-stream-start'"),
    name + ' dashboard resync still sends existing stream-start WebSocket message');
  ok(source.includes("requestPreviewResync(payload.reason || 'phantomstream-viewer-resync'"),
    name + ' dashboard maps viewer CONTROL.START to existing resync path');
}

console.log('\n--- Preview state compatibility ---');
verifyPreviewState('hidden', { previewState: 'hidden' }, {
  chipLabel: '',
  showIframe: false,
  showLoading: false,
  showDisconnected: false,
});
verifyPreviewState('loading', { previewState: 'loading' }, {
  chipLabel: 'loading',
  showIframe: false,
  showLoading: true,
  showDisconnected: false,
});
verifyPreviewState('streaming', { previewState: 'streaming' }, {
  chipLabel: 'streaming',
  showIframe: true,
  showLoading: false,
  showDisconnected: false,
});
verifyPreviewState('paused', { previewState: 'paused', hasLiveSnapshot: true }, {
  chipLabel: 'paused',
  showIframe: true,
  showLoading: false,
});
verifyPreviewState('disconnected', { previewState: 'disconnected' }, {
  chipLabel: 'disconnected',
  showIframe: false,
  showDisconnected: true,
});
verifyPreviewState('restricted', { previewState: 'restricted' }, {
  chipLabel: 'restricted page',
  showIframe: false,
  showDisconnected: false,
});
verifyPreviewState('frozen-disconnect', { previewState: 'frozen-disconnect', hasLiveSnapshot: true }, {
  chipLabel: 'disconnected',
  showIframe: true,
  showFrozenOverlay: true,
  frozenLabel: 'Disconnected',
});
verifyPreviewState('frozen-complete', { previewState: 'frozen-complete', hasLiveSnapshot: true }, {
  chipLabel: 'complete',
  showIframe: true,
  showFrozenOverlay: true,
  frozenLabel: 'Task Complete',
});
verifyPreviewState('error fallback', { previewState: 'error' }, {
  chipLabel: 'disconnected',
  showIframe: false,
});

console.log('\n--- Static dashboard side channels ---');
verifyMarkupAndStyles('static', staticHtml, staticCss);
verifySideChannelSource('static', staticSource);
verifyDiagnosticsSource('static', staticSource);
verifyResyncSource('static', staticSource);

console.log('\n--- Angular dashboard side channels ---');
verifyMarkupAndStyles('Angular', angularHtml, angularScss);
verifySideChannelSource('Angular', angularSource);
verifyDiagnosticsSource('Angular', angularSource);
verifyResyncSource('Angular', angularSource);

console.log('\nDashboard side-channel closeout guard: ' + passed + ' PASS / 0 FAIL');
