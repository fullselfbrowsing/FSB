'use strict';

/**
 * Phase 23 Plan 03 -- static/Angular dashboard PhantomStream parity guard.
 *
 * Verifies both dashboard shells use the same browser-global viewer wrapper
 * contract and neither shell owns legacy iframe srcdoc rendering or local
 * nid-addressed mutation application.
 *
 * Run: node tests/phantom-stream-dashboard-parity.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
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

function sourceHas(source, needle) {
  return source.includes(needle);
}

function sourceLacks(source, needle) {
  return !source.includes(needle);
}

function verifyViewerHost(name, html, styles) {
  ok(html.includes('id="dash-preview-viewer"'),
    name + ' dashboard declares PhantomStream viewer host');
  ok(!html.includes('id="dash-preview-iframe"'),
    name + ' dashboard no longer declares legacy preview iframe');
  ok(styles.includes('.dash-preview-viewer'),
    name + ' dashboard styles PhantomStream viewer host');
  ok(!styles.includes('.dash-preview-iframe'),
    name + ' dashboard styles no longer target legacy preview iframe');
}

function verifyWrapperUsage(name, source) {
  ok(sourceHas(source, 'FSBPhantomStreamViewer'),
    name + ' dashboard consumes shared viewer global');
  ok(sourceHas(source, 'createDashboardViewer'),
    name + ' dashboard creates wrapper viewer');
  ok(sourceHas(source, 'onResync:'),
    name + ' dashboard maps viewer resync callback');
  ok(sourceHas(source, 'phantomstream-viewer-resync'),
    name + ' dashboard maps CONTROL.START to existing resync path');
  ok(sourceHas(source, 'onSubtreeRequest:'),
    name + ' dashboard records deferred subtree requests');
  ok(sourceHas(source, 'onUnsupportedControl:'),
    name + ' dashboard records unsupported viewer controls');
  ok(sourceHas(source, 'onState:'),
    name + ' dashboard consumes viewer state events');
  ok(sourceHas(source, 'onHealth:'),
    name + ' dashboard consumes viewer health events');
  ok(sourceHas(source, 'mapPointToViewport'),
    name + ' dashboard delegates remote point mapping to viewer when available');
  ok(sourceHas(source, 'getViewportMapping'),
    name + ' dashboard reads viewer viewport mapping when available');
}

function verifyRendererDispatch(name, source) {
  [
    'ext:dom-snapshot',
    'ext:dom-mutations',
    'ext:dom-scroll',
    'ext:dom-overlay',
    'ext:dom-dialog',
  ].forEach(type => {
    ok(sourceHas(source, "dispatchPreviewViewer('" + type + "', payload)"),
      name + ' dashboard dispatches ' + type + ' to PhantomStream viewer');
  });
  ok(sourceHas(source, 'dom-mutations-dispatched'),
    name + ' dashboard records mutation dispatch diagnostics around the viewer');
}

function verifyLegacyRendererRemoved(name, source) {
  [
    'previewIframe',
    '.srcdoc',
    'contentDocument',
    'querySelector(\'[data-fsb-nid="',
    'temp.innerHTML = m.html',
    'setAttribute(m.attr',
    'textContent = m.text',
    'var fullHTML =',
    'const fullHTML =',
    '@full-self-browsing/phantom-stream',
  ].forEach(needle => {
    ok(sourceLacks(source, needle),
      name + ' dashboard source does not contain legacy renderer string: ' + needle);
  });
}

function verifyHostOwnedState(name, source) {
  ok(sourceHas(source, 'shouldAcceptPreviewMessage(payload,'),
    name + ' dashboard keeps stale-session preview gate');
  ok(sourceHas(source, 'setPreviewState(\'streaming\')'),
    name + ' dashboard keeps host preview state transition');
  ok(sourceHas(source, 'handleDOMOverlay(payload'),
    name + ' dashboard keeps host-side overlay side-channel handler');
  ok(sourceHas(source, 'handleDOMDialog(payload'),
    name + ' dashboard keeps host-side dialog side-channel handler');
  ok(sourceHas(source, 'sendDashboardWSMessage(\'dash:dom-stream-start\''),
    name + ' dashboard keeps existing stream-start WebSocket message');
}

console.log('\n--- Static dashboard parity ---');
verifyViewerHost('static', staticHtml, staticCss);
verifyWrapperUsage('static', staticSource);
verifyRendererDispatch('static', staticSource);
verifyLegacyRendererRemoved('static', staticSource);
verifyHostOwnedState('static', staticSource);

console.log('\n--- Angular dashboard parity ---');
verifyViewerHost('Angular', angularHtml, angularScss);
verifyWrapperUsage('Angular', angularSource);
verifyRendererDispatch('Angular', angularSource);
verifyLegacyRendererRemoved('Angular', angularSource);
verifyHostOwnedState('Angular', angularSource);

console.log('\nStatic/Angular PhantomStream dashboard parity guard: ' + passed + ' PASS / 0 FAIL');
