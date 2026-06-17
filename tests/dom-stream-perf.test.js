'use strict';

/**
 * DOM streaming capture budget/watchdog invariants.
 *
 * Phase 22 moves snapshot/diff ownership from extension/content/dom-stream.js
 * into the bundled PhantomStream capture package. This test now verifies that
 * FSB's adapter is package-backed while the package bundle still carries the
 * relay budget, watchdog cadence, stale-flush payload, and truncation fields
 * that the dashboard/server contracts depend on.
 *
 * Run: node tests/dom-stream-perf.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const dsSource = fs.readFileSync(
  path.join(repoRoot, 'extension', 'content', 'dom-stream.js'),
  'utf8'
);
const bundleSource = fs.readFileSync(
  path.join(repoRoot, 'extension', 'content', 'phantom-stream-capture.js'),
  'utf8'
);

console.log('--- Phase 22 package-backed capture invariants ---');
assert(dsSource.includes('window.FSBPhantomStreamCapture'), 'dom-stream adapter consumes PhantomStream capture bridge');
assert(dsSource.includes('bridge.createCapture'), 'dom-stream adapter constructs package capture');
assert(dsSource.includes('stampLegacyNodeIds'), 'legacy dashboard nid bridge present');
assert(dsSource.includes('getStaleFlushCount: function()'), 'FSB.domStream.getStaleFlushCount accessor present');
assert(!/function serializeDOM\s*\(/.test(dsSource), 'local serializeDOM implementation removed');
assert(!/function processMutationBatch\s*\(/.test(dsSource), 'local mutation diff implementation removed');
assert(!/new MutationObserver\s*\(/.test(dsSource), 'dom-stream.js no longer owns MutationObserver construction');
console.log('  PASS: dom-stream.js is a package-backed adapter');

console.log('--- PhantomStream capture bundle budget/watchdog invariants ---');
assert(bundleSource.includes('RELAY_PER_MESSAGE_LIMIT_BYTES = 1048576'), 'RELAY_PER_MESSAGE_LIMIT_BYTES constant present in bundle');
assert(bundleSource.includes('SNAPSHOT_BUDGET_BYTES = Math.floor'), 'snapshot budget derived from relay cap');
assert(bundleSource.includes('MUTATION_STALE_THRESHOLD_MS = 5e3'), '5000ms stale threshold present in bundle');
assert(bundleSource.includes('WATCHDOG_TICK_MS = 500'), '500ms watchdog cadence present in bundle');
assert(bundleSource.includes('staleFlushCount++'), 'staleFlushCount increment present in package capture');
assert(bundleSource.includes('staleFlushCount = 0'), 'staleFlushCount reset on flush present in package capture');
assert(bundleSource.includes('payload.staleFlushCount = staleFlushCount'), 'staleFlushCount payload field present');
assert(bundleSource.includes('missingDescendants'), 'missingDescendants snapshot field present in package capture');
assert(bundleSource.includes('data-phantomstream-truncated'), 'truncated subtree marker present in package capture');
console.log('  PASS: package capture carries stream budget/watchdog behavior');

console.log('--- Background SW alarm branch invariants ---');
const bgSource = fs.readFileSync(
  path.join(repoRoot, 'extension', 'background.js'),
  'utf8'
);
assert(bgSource.includes("alarm.name === 'fsb-domstream-watchdog'"), 'fsb-domstream-watchdog branch in onAlarm');
assert(bgSource.includes("'fsb-domstream-watchdog', { periodInMinutes: 1 }"), 'chrome.alarms.create call present');
assert(bgSource.includes('if (isMcpReconnectAlarm) {'), 'MCP_RECONNECT_ALARM early-return preserved');
assert(bgSource.includes("armMcpBridge('alarm:' + MCP_RECONNECT_ALARM)"), 'MCP arm call preserved');
assert(bgSource.includes('agentScheduler.getAgentIdFromAlarm(alarm.name)'), 'agent alarm branch preserved');
assert(bgSource.includes('_lastDomStreamStaleFlushCount'), 'SW-side staleFlushCount cache var present');
console.log('  PASS: SW alarm branch invariants present');

console.log('--- ws-client _emitStreamState invariants ---');
const wsSource = fs.readFileSync(
  path.join(repoRoot, 'extension', 'ws', 'ws-client.js'),
  'utf8'
);
assert(/this\.send\('ext:stream-state',[\s\S]*?staleFlushCount[\s\S]*?\}\)/.test(wsSource),
  'staleFlushCount field appears inside this.send(ext:stream-state, { ... }) block');
assert(wsSource.includes('_lastDomStreamStaleFlushCount'), 'ws-client reads SW-side cache');
console.log('  PASS: ws-client _emitStreamState invariants present');

console.log('--- Fixture sanity ---');
const fixturePath = path.join(__dirname, 'fixtures', 'dom-stream-50k.html');
const fixtureStat = fs.statSync(fixturePath);
const fixtureBytes = fixtureStat.size;
assert(fixtureBytes > 4 * 1024 * 1024, 'fixture > 4 MB on disk (target ~5MB)');
assert(fixtureBytes < 8.5 * 1024 * 1024, 'fixture < 8.5 MB (avoid runaway size)');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
const annotationCount = (fixtureText.match(/data-fsb-nid="/g) || []).length;
assert(annotationCount >= 49000, 'fixture has at least 49k data-fsb-nid annotations');
assert(annotationCount <= 51000, 'fixture has at most 51k data-fsb-nid annotations');
console.log('  PASS: fixture is ~' + Math.round(fixtureBytes / 1024 / 1024) + ' MB with ' + annotationCount + ' annotations');

console.log('--- Algorithmic perf proxy: 50k Map iteration < 200ms (pure JS) ---');
const N = 50000;
const topByNid = new Map();
const cloneElsMock = new Array(N);
const viewportCutoff = 600;
for (let i = 1; i <= N; i++) {
  const nid = String(i);
  topByNid.set(nid, i * 0.5);
  cloneElsMock[i - 1] = { nid: nid, removed: false };
}
const t0 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? performance.now() : Date.now();
let missingDescendants = 0;
for (let t = cloneElsMock.length - 1; t >= 0; t--) {
  const top = topByNid.get(cloneElsMock[t].nid);
  if (typeof top === 'number' && top > viewportCutoff) {
    cloneElsMock[t].removed = true;
    missingDescendants++;
  }
}
const elapsedMs = ((typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? performance.now() : Date.now()) - t0;
console.log('  Map iteration over ' + N + ' entries took ' + elapsedMs.toFixed(2) + ' ms; missingDescendants=' + missingDescendants);
assert(elapsedMs < 200, 'pure-JS truncation pass over 50k entries completes in < 200ms');
assert(missingDescendants > 0, 'truncation pass actually removes elements');
console.log('  PASS: algorithmic budget within 200ms');

console.log('\nAll assertions passed.');
