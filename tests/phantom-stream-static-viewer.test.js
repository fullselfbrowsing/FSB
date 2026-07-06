'use strict';

/**
 * Phase 23 Plan 02 -- static dashboard PhantomStream viewer migration guard.
 *
 * Verifies the static dashboard routes snapshot/mutation rendering through
 * the shared PhantomStream viewer wrapper instead of owning generic iframe
 * srcdoc assembly or nid-addressed DOM diff application.
 *
 * Run: node tests/phantom-stream-static-viewer.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(repoRoot, 'showcase', 'dashboard.html'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(repoRoot, 'showcase', 'css', 'dashboard.css'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard.js'), 'utf8');

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- Static dashboard viewer host ---');

ok(dashboardHtml.includes('id="dash-preview-viewer"'),
  'static dashboard contains PhantomStream viewer host');
ok(!dashboardHtml.includes('id="dash-preview-iframe"'),
  'static dashboard no longer declares legacy preview iframe');
ok(dashboardCss.includes('.dash-preview-viewer'),
  'static dashboard CSS styles viewer host');
ok(!dashboardCss.includes('.dash-preview-iframe'),
  'static dashboard CSS no longer targets legacy preview iframe');

console.log('\n--- Static dashboard wrapper usage ---');

ok(dashboardSource.includes('window.FSBPhantomStreamViewer'),
  'static dashboard consumes shared viewer global');
ok(dashboardSource.includes('bridge.createDashboardViewer'),
  'static dashboard creates wrapper viewer');
ok(dashboardSource.includes('onResync: function(payload)'),
  'static dashboard maps viewer resync callback');
ok(dashboardSource.includes('requestPreviewResync(payload.reason ||'),
  'viewer CONTROL.START path maps to existing preview resync');
ok(dashboardSource.includes('onSubtreeRequest: function(payload)'),
  'static dashboard contains explicit deferred subtree request seam');
ok(dashboardSource.includes('onState: handlePreviewViewerState'),
  'static dashboard consumes viewer state events');
ok(dashboardSource.includes('onHealth: handlePreviewViewerHealth'),
  'static dashboard consumes viewer health events');
ok(dashboardSource.includes('previewViewer.mapPointToViewport'),
  'remote-control point mapping uses viewer mapping when available');

console.log('\n--- Static dashboard renderer dispatch ---');

ok(dashboardSource.includes("dispatchPreviewViewer('ext:dom-snapshot', payload)"),
  'snapshot handler dispatches to PhantomStream viewer');
ok(dashboardSource.includes("dispatchPreviewViewer('ext:dom-mutations', payload)"),
  'mutation handler dispatches to PhantomStream viewer');
ok(dashboardSource.includes("dispatchPreviewViewer('ext:dom-scroll', payload)"),
  'scroll handler dispatches to PhantomStream viewer');
ok(dashboardSource.includes("dispatchPreviewViewer('ext:dom-overlay', payload)"),
  'overlay handler dispatches to PhantomStream viewer');
ok(dashboardSource.includes("dispatchPreviewViewer('ext:dom-dialog', payload)"),
  'dialog handler dispatches to PhantomStream viewer');
ok(dashboardSource.includes('dom-mutations-dispatched'),
  'static dashboard records mutation dispatch diagnostics around the viewer');

console.log('\n--- Legacy static renderer removed ---');

ok(!dashboardSource.includes('var previewIframe ='),
  'static dashboard no longer stores previewIframe');
ok(!dashboardSource.includes('previewIframe.srcdoc'),
  'static dashboard no longer writes iframe srcdoc');
ok(!dashboardSource.includes('var fullHTML ='),
  'static dashboard no longer assembles full snapshot HTML');
ok(!dashboardSource.includes('previewIframe.contentDocument'),
  'static dashboard no longer reads iframe contentDocument for diffing');
ok(!dashboardSource.includes('querySelector(\'[data-fsb-nid="'),
  'static dashboard no longer queries mirrored DOM by data-fsb-nid');
ok(!dashboardSource.includes('temp.innerHTML = m.html'),
  'static dashboard no longer parses add-op HTML locally');
ok(!dashboardSource.includes('target.setAttribute(m.attr, m.val)'),
  'static dashboard no longer applies attr mutations locally');
ok(!dashboardSource.includes('textTarget.textContent = m.text'),
  'static dashboard no longer applies text mutations locally');

console.log('\n--- Static dashboard FSB state remains host-owned ---');

ok(dashboardSource.includes('shouldAcceptPreviewMessage(payload,'),
  'static dashboard keeps FSB stale-session gate');
ok(dashboardSource.includes('setPreviewState(\'streaming\')'),
  'static dashboard keeps FSB preview state transition');
ok(dashboardSource.includes('handleDOMOverlay(payload)'),
  'static dashboard keeps host-side overlay side-channel handler');
ok(dashboardSource.includes('handleDOMDialog(payload)'),
  'static dashboard keeps host-side dialog side-channel handler');
ok(dashboardSource.includes('sendDashboardWSMessage(\'dash:dom-stream-start\''),
  'static dashboard keeps existing stream-start WebSocket message');

console.log('\nStatic PhantomStream viewer guard: ' + passed + ' PASS / 0 FAIL');
