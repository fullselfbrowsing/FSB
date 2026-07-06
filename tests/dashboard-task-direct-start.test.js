'use strict';

/**
 * Regression gate: dashboard task submission must start automation via a
 * DIRECT call to the background global handleStartAutomation().
 *
 * ws-client.js runs inside the MV3 service worker (background.js loads it via
 * importScripts), and chrome.runtime.sendMessage() does NOT loop back to
 * chrome.runtime.onMessage listeners registered in the same service-worker
 * context -- so a sendMessage({action: 'startAutomation'}) dispatch from
 * _handleDashboardTask dies silently and dashboard tasks never start. The
 * stop path (_handleStopTask -> handleStopAutomation) already uses the
 * direct-call pattern; this gate keeps the start path on it too.
 *
 * Run: node tests/dashboard-task-direct-start.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WS_CLIENT_PATH = path.resolve(__dirname, '..', 'extension', 'ws', 'ws-client.js');
const source = fs.readFileSync(WS_CLIENT_PATH, 'utf8');

// Slice the _handleDashboardTask method body: from its definition to the next
// method definition (_handleStopTask). Match the definition line specifically
// ("\n  _handleStopTask() {") so comments or call sites mentioning the name
// do not truncate the slice early.
const START_MARKER = 'async _handleDashboardTask(payload) {';
const END_MARKER = '\n  _handleStopTask() {';

let passed = 0;
let failed = 0;
const failures = [];

function runTest(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS:', name);
  } catch (err) {
    failed++;
    failures.push({ name, message: err && err.message });
    console.error('  FAIL:', name, '--', err && err.message);
  }
}

const startIdx = source.indexOf(START_MARKER);
const endIdx = source.indexOf(END_MARKER, startIdx);
const body = (startIdx >= 0 && endIdx > startIdx)
  ? source.slice(startIdx, endIdx)
  : '';

console.log('dashboard-task-direct-start.test.js');

runTest('handler_body_located', () => {
  assert.ok(startIdx >= 0, '_handleDashboardTask definition not found in ws-client.js');
  assert.ok(endIdx > startIdx, '_handleStopTask definition not found after _handleDashboardTask');
  assert.ok(body.length > 0, 'sliced _handleDashboardTask body is empty');
});

runTest('starts_via_direct_handleStartAutomation_call', () => {
  assert.ok(
    body.includes('handleStartAutomation('),
    '_handleDashboardTask must call handleStartAutomation() directly'
  );
});

runTest('no_same_context_runtime_sendMessage', () => {
  // The body's explanatory comment legitimately names the API; the gate must
  // only reject actual code, so strip // and JSDoc comment lines first.
  const codeOnly = body
    .split('\n')
    .filter(function(line) {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
  assert.ok(
    !codeOnly.includes('chrome.runtime.sendMessage'),
    '_handleDashboardTask must not dispatch via chrome.runtime.sendMessage ' +
    '(same-context messages never reach background.js onMessage)'
  );
});

runTest('start_request_keeps_dashboard_source', () => {
  const callIdx = body.indexOf('handleStartAutomation(');
  const tail = callIdx >= 0 ? body.slice(callIdx) : '';
  assert.ok(
    tail.includes("source: 'dashboard'"),
    "start request must carry source: 'dashboard'"
  );
});

runTest('start_failure_relayed_as_task_complete', () => {
  const callIdx = body.indexOf('handleStartAutomation(');
  const tail = callIdx >= 0 ? body.slice(callIdx) : '';
  assert.ok(
    tail.includes("'ext:task-complete'"),
    'start-failure callback must send ext:task-complete to the dashboard'
  );
  assert.ok(
    tail.includes('Failed to start automation'),
    'start-failure callback must include a fallback error message'
  );
});

console.log('');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  failures.forEach(function(f) {
    console.error('  - ' + f.name + ': ' + f.message);
  });
  process.exit(1);
}
