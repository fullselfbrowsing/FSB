/**
 * Phase 223 MET-01..05 + MET-08 wire-up checks (Wave 0 / TDD-first).
 *
 * Asserts the new ext:metrics WS frame is emitted from
 * extension/ws/ws-client.js on connect (push, not polling), with the
 * required payload shape (connection / sessions / cost / activeTab),
 * sourcing cost+tokens from analytics.getStats('24h') (no recompute),
 * and that the Phase 209 _broadcastRemoteControlState contract is
 * preserved byte-for-byte (defense in depth alongside sync-tab-runtime).
 *
 * Today (Wave 0) these assertions FAIL by design -- Plan 03 lands
 * _broadcastMetrics in ws-client.js that makes them green.
 *
 * Static-analysis only. Mirrors tests/sync-tab-runtime.test.js pattern.
 *
 * Run: node tests/metrics-wireup.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const WS = read(path.join('extension', 'ws', 'ws-client.js'));

console.log('\n--- Phase 223 MET-01: Push on connect, not polling ---');

const fnMatch = WS.match(/function\s+_broadcastMetrics[\s\S]*?\n\}/);
assert(!!fnMatch, '[MET-01] _broadcastMetrics function exists in extension/ws/ws-client.js');
const body = fnMatch ? fnMatch[0] : '';

const onopenMatch = WS.match(/this\.ws\.onopen\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s{4}\};/);
assert(!!onopenMatch, '[MET-01] ws-client.js onopen handler block found');
const onopenBody = onopenMatch ? onopenMatch[0] : '';
assert(
  onopenBody.includes('_broadcastMetrics'),
  '[MET-01] onopen handler invokes _broadcastMetrics (push on connect, not polling)'
);
assert(
  !/setInterval\([^)]*_broadcastMetrics/.test(WS) &&
  !/setInterval\([^)]*Metrics/.test(WS),
  '[MET-01] No setInterval polling loop drives metrics emission'
);
assert(
  /wsInstance\.send\(\s*['"]ext:metrics['"]/.test(body) ||
  /this\.send\(\s*['"]ext:metrics['"]/.test(WS),
  '[MET-01] ws-client.js sends an ext:metrics WS frame'
);

console.log('\n--- Phase 223 MET-02: Connection state keys ---');
['connection:', 'connected:', 'pairedClient:', 'connectedAt:'].forEach(function (key) {
  assert(body.includes(key), '[MET-02] _broadcastMetrics payload includes ' + key);
});

console.log('\n--- Phase 223 MET-03: Session counters ---');
['sessions:', 'activeSessions:', 'completedTasks:', 'errorCount:'].forEach(function (key) {
  assert(body.includes(key), '[MET-03] _broadcastMetrics payload includes session counter ' + key);
});

console.log('\n--- Phase 223 MET-04: Cost / tokens from analytics ---');
assert(
  /analytics\.getStats\s*\(\s*['"]24h['"]\s*\)/.test(body),
  '[MET-04] _broadcastMetrics calls analytics.getStats(\'24h\') (does not duplicate cost calculation)'
);
['cost:', 'totalCost:', 'totalTokens:'].forEach(function (key) {
  assert(body.includes(key), '[MET-04] _broadcastMetrics payload includes cost key ' + key);
});
['usage:', "timeRange: '24h'", 'totalRequests:', 'successfulRequests:', 'successRate:'].forEach(function (key) {
  assert(body.includes(key), '[MET-04] _broadcastMetrics payload includes stable usage key ' + key);
});

console.log('\n--- Phase 223 MET-04b: Metrics rebroadcast triggers ---');
assert(
  WS.includes("case 'dash:request-status':") &&
  /case\s+['"]dash:request-status['"]:[\s\S]*?_sendStateSnapshot\(['"]dash:request-status['"]\)[\s\S]*?_broadcastMetrics\(this,\s*this\.serverHashKey\)/.test(WS),
  '[MET-04b] dash:request-status returns ext:snapshot and ext:metrics'
);
assert(
  WS.includes('_installMetricsStorageListener') &&
  WS.includes('changes.fsbUsageData') &&
  WS.includes('_scheduleMetricsBroadcast'),
  '[MET-04b] ws-client debounces fsbUsageData/fsbCurrentModel storage changes into metrics broadcasts'
);

console.log('\n--- Phase 223 MET-05: Active tab metadata, omitted when detached ---');
assert(
  /if\s*\(\s*[A-Za-z_$][A-Za-z0-9_$.]*\.enabled[\s\S]*?activeTab/.test(body),
  '[MET-05] _broadcastMetrics gates payload.activeTab on remote-control-state.enabled === true'
);
assert(
  /payload\.activeTab\s*=/.test(body),
  '[MET-05] _broadcastMetrics assigns payload.activeTab conditionally'
);

console.log('\n--- Phase 223 MET-08: Phase 209 contract preservation ---');
const phase209Fn = WS.match(/function\s+_broadcastRemoteControlState[\s\S]*?\n\}/);
assert(!!phase209Fn, '[MET-08] _broadcastRemoteControlState function still present');
const p209body = phase209Fn ? phase209Fn[0] : '';
['enabled:', 'attached:', 'tabId:', 'reason:', 'ownership:'].forEach(function (key) {
  assert(
    p209body.includes(key),
    '[MET-08 / Phase 209] _broadcastRemoteControlState payload key ' + key + ' preserved'
  );
});
assert(
  !p209body.includes('connection:') && !p209body.includes('totalCost:'),
  '[MET-08] metrics fields NOT bolted onto _broadcastRemoteControlState (separate frame ext:metrics)'
);
assert(
  p209body.includes('_broadcastMetrics(wsInstance'),
  '[MET-08] remote-control state changes trigger a separate ext:metrics frame'
);

console.log('\n=== Phase 223 MET wire-up results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
