'use strict';

/**
 * Phase 24 recovery parity guard.
 *
 * Verifies the package-backed transport/relay seams still preserve FSB stream
 * recovery behavior: dashboard reconnect, extension reconnect snapshots,
 * service-worker watchdog resync, late content readiness, and stream-state
 * diagnostics.
 *
 * Run: node tests/dashboard-stream-recovery-parity.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const wsSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'ws-client.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const domStreamSource = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-stream.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'js', 'dashboard.js'), 'utf8');
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

console.log('\n--- Extension reconnect snapshot recovery ---');
ok(wsSource.includes("this._sendStateSnapshot('connect')"),
  'ws-client sends a state snapshot on WebSocket open');
ok(wsSource.includes("recordFSBTransportReconnect('ws-open'"),
  'ws-client records ws-open reconnect diagnostics');
ok(/var streamStatus = candidate\.ready[\s\S]*streamIntentActive \? 'recovering' : 'ready'/.test(wsSource),
  'state snapshot maps active stream intent to recovering status');
ok(wsSource.includes('snapshotPayload.streamIntentActive = streamIntentActive'),
  'state snapshot includes streamIntentActive');
ok(wsSource.includes('snapshotPayload.streamTabId'),
  'state snapshot includes stream tab id');
ok(wsSource.includes('snapshotPayload.streamReason'),
  'state snapshot includes stream reason');
ok(wsSource.includes("this.send('ext:page-ready'"),
  'state snapshot sends ext:page-ready when candidate tab is ready');
ok(wsSource.includes('var streamTypes = getFSBStreamTypes();') && wsSource.includes('this.send(streamTypes.STATE'),
  'stream-state emission uses PhantomStream STREAM constants');
ok(wsSource.includes('staleFlushCount: (typeof _lastDomStreamStaleFlushCount'),
  'stream-state emission carries staleFlushCount diagnostics');

console.log('\n--- Late content readiness and parked stream-start recovery ---');
ok(wsSource.includes('var _pendingStreamStart = null'),
  'ws-client keeps pending stream-start state at module scope');
ok(wsSource.includes('_pendingStreamStart = { payload: payload, tabId: candidate.tabId'),
  'ws-client parks stream-start payload after readiness timeout');
ok(wsSource.includes('var parked = _pendingStreamStart') && wsSource.includes('_pendingStreamStart = null'),
  'ws-client clears parked stream-start before re-dispatch');
ok(wsSource.includes('wsInstance._handleDashboardStreamStart(parked.payload)'),
  'ws-client re-dispatches parked stream-start through the normal path');
ok(backgroundSource.includes("case 'domStreamReady'") && backgroundSource.includes('_onDomStreamReady(sender.tab ? sender.tab.id : null)'),
  'background domStreamReady path re-arms parked stream-start');
ok(domStreamSource.includes('if (type === STREAM.READY)') && domStreamSource.includes("sendRuntimeMessage({ action: 'domStreamReady' }"),
  'content adapter maps PhantomStream STREAM.READY to domStreamReady');

console.log('\n--- Dashboard reconnect and recovery watchdogs ---');
ok(dashboardSource.includes("scheduleStreamRecovery('ws-open')"),
  'static dashboard schedules stream recovery on ws-open');
ok(angularSource.includes("this.scheduleStreamRecovery('ws-open')"),
  'Angular dashboard schedules stream recovery on ws-open');
ok(dashboardSource.includes("scheduleStreamRecovery('extension-online')"),
  'static dashboard schedules stream recovery when extension comes online');
ok(angularSource.includes("this.scheduleStreamRecovery('extension-online')"),
  'Angular dashboard schedules stream recovery when extension comes online');
ok(dashboardSource.includes("sendDashboardWSMessage('dash:request-status'") && dashboardSource.includes("sendDashboardWSMessage('dash:dom-stream-start'"),
  'static dashboard recovery sends request-status and stream-start');
ok(angularSource.includes("this.sendDashboardWSMessage('dash:request-status'") && angularSource.includes("this.sendDashboardWSMessage('dash:dom-stream-start'"),
  'Angular dashboard recovery sends request-status and stream-start');
ok(dashboardSource.includes("armPreviewRecoveryWatchdog('stream-state:ready')") && dashboardSource.includes("armPreviewRecoveryWatchdog('stream-state:recovering')"),
  'static dashboard arms recovery watchdog from stream-state transitions');
ok(angularSource.includes("this.armPreviewRecoveryWatchdog('stream-state:ready')") && angularSource.includes("this.armPreviewRecoveryWatchdog('stream-state:recovering')"),
  'Angular dashboard arms recovery watchdog from stream-state transitions');
ok(dashboardSource.includes("armPreviewRecoveryWatchdog('page-ready')"),
  'static dashboard arms recovery watchdog from page-ready');
ok(angularSource.includes("this.armPreviewRecoveryWatchdog('page-ready')"),
  'Angular dashboard arms recovery watchdog from page-ready');

console.log('\n--- Watchdog resync request path ---');
ok(backgroundSource.includes('streamTypes.REQUEST_SNAPSHOT') && backgroundSource.includes("'ext:request-snapshot'"),
  'background watchdog sends request-snapshot through PhantomStream STREAM constant fallback');
ok(backgroundSource.includes("reason: 'sw-watchdog-tick'"),
  'background watchdog annotates request-snapshot reason');
ok(dashboardSource.includes("if (msg.type === 'ext:request-snapshot')") && dashboardSource.includes('requestPreviewResync((msg.payload && msg.payload.reason)'),
  'static dashboard routes ext:request-snapshot to requestPreviewResync');
ok(angularSource.includes("if (msg.type === 'ext:request-snapshot')") && angularSource.includes("this.requestPreviewResync(msg.payload?.reason || 'request-snapshot'"),
  'Angular dashboard routes ext:request-snapshot to requestPreviewResync');
ok(dashboardSource.includes("previewState !== 'frozen-complete'") && angularSource.includes("this.previewState !== 'frozen-complete'"),
  'both dashboards preserve frozen-complete state against watchdog resync');

console.log('\nDashboard stream recovery parity: ' + passed + ' PASS / 0 FAIL');
