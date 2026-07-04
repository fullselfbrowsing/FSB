/**
 * Phase 213 SYNC-02 regression checks.
 * Asserts both runtime contracts (action registration + push emission)
 * and Phase 209 preservation invariants.
 *
 * Static-analysis only (no jsdom, no chrome.runtime mocks). Mirrors the
 * pattern of tests/runtime-contracts.test.js: CommonJS, local pass/fail
 * counters, console output, single process.exit at the end.
 *
 * Run: node tests/sync-tab-runtime.test.js
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

const BG = read('extension/background.js');
const WS = read(path.join('extension', 'ws', 'ws-client.js'));

console.log('\n--- Phase 213 SYNC-02: background.js runtime contracts ---');

assert(
  BG.includes('let _bgRemoteControlStateCache = null'),
  '[D-18] background.js declares module-scope `let _bgRemoteControlStateCache = null` (renamed to avoid colliding with ws-client.js _lastRemoteControlState in service-worker global scope)'
);

assert(
  BG.includes("case 'getRemoteControlState':"),
  "[D-16] background.js registers runtime action `getRemoteControlState`"
);

assert(
  BG.includes("reason: 'unknown'"),
  "[D-16] getRemoteControlState default payload uses reason: 'unknown' on SW cold start"
);

assert(
  BG.includes("case 'remoteControlStateChanged':"),
  "[D-17 / D-18] background.js registers `remoteControlStateChanged` cache-update handler"
);

assert(
  BG.includes('_bgRemoteControlStateCache = request.state'),
  '[D-18] cache updates from request.state on every push'
);

assert(
  BG.includes("case 'reconnectDashboardWebSocket':"),
  '[SYNC70] background.js exposes reconnectDashboardWebSocket for Sync-tab pairing refresh'
);

assert(
  BG.includes('changes.serverHashKey || changes.serverUrl') &&
    BG.includes('fsbWebSocket.connect()'),
  '[SYNC70] background.js reconnects the dashboard relay when Sync server/hash settings change'
);

console.log('\n--- Phase 213 SYNC-02: ws-client.js push emission + Phase 209 preservation ---');

// Locate _broadcastRemoteControlState body (greedy-stop at next top-level closing brace).
const fnMatch = WS.match(/function\s+_broadcastRemoteControlState[\s\S]*?\n\}/);
assert(
  !!fnMatch,
  '[Phase 209] _broadcastRemoteControlState function exists in ws/ws-client.js'
);
const body = fnMatch ? fnMatch[0] : '';

assert(
  body.includes("action: 'remoteControlStateChanged'"),
  "[D-17] _broadcastRemoteControlState fires chrome.runtime.sendMessage({ action: 'remoteControlStateChanged' }) after the WS emit"
);

assert(
  body.includes("wsInstance.send('ext:remote-control-state'"),
  '[Phase 209] wsInstance.send(ext:remote-control-state, ...) WS broadcast still present'
);

assert(
  WS.includes('var _lastRemoteControlState = null;'),
  '[Phase 209 / D-18] ws-client.js cache at line ~124 preserved (used by snapshot recovery line ~764-765)'
);

assert(
  WS.includes("chrome.storage.local.get(['serverHashKey', 'serverUrl'])") &&
    WS.includes('_normalizeFsbServerUrl(serverUrl)') &&
    WS.includes("await chrome.storage.local.set({ serverHashKey, serverUrl: resolvedServerUrl })"),
  '[SYNC70] ws-client connects to the configured Sync server URL and persists the canonical URL with the hash key'
);

// Phase 209 payload-shape preservation: { enabled, attached, tabId, reason, ownership }
['enabled:', 'attached:', 'tabId:', 'reason:', 'ownership:'].forEach(function (key) {
  assert(
    body.includes(key),
    '[Phase 209] payload key ' + key + ' preserved in _broadcastRemoteControlState'
  );
});

console.log('\n=== Phase 213 SYNC-02 results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
