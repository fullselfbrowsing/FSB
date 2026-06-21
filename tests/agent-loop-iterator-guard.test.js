'use strict';

/**
 * Phase 29 Plan 01 (v0.9.99 Native Capability Catalog) -- INV-04 iterator byte
 * guard. The agent-loop.js setTimeout-chained iterator is load-bearing: invoke is
 * a single bounded async op and the iterator MUST stay byte-untouched through the
 * whole capability-router milestone (CONTEXT D-12 / ROADMAP INV-04). Phase 29's
 * autopilot parity hooks tool-executor.js, NOT agent-loop.js; this guard reds CI
 * on any accidental edit to the three canonical iterator-scheduling lines.
 *
 * It asserts the exact three `session._nextIterationTimer = setTimeout(function() {
 * runAgentIteration(sessionId, options); }, <ms>)` strings are present unchanged:
 *   - the 100ms next-iteration schedule  (agent-loop.js:2725)
 *   - the 5000ms rate-limit retry         (agent-loop.js:2794)
 *   - the 2000ms network-error retry      (agent-loop.js:2804)
 * (A fourth, defensive 100ms no-tool-call fallback at :2026 is also pinned for
 * completeness; the three above are the canonical INV-04 region.)
 *
 * This guard should PASS today (the iterator is untouched) and stays green so long
 * as no later wave edits the iterator. Zero-framework: passed/failed + check(cond,msg)
 * + process.exit(failed>0?1:0).
 *
 * Run: node tests/agent-loop-iterator-guard.test.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const AGENT_LOOP_PATH = path.join(REPO_ROOT, 'extension', 'ai', 'agent-loop.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

const src = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');

// The three canonical INV-04 iterator-scheduling lines, byte-for-byte. Any edit to
// the setTimeout chain (delay change, lambda rewrite, callsite move) reds this guard.
const ITERATOR_100MS =
  'session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);';
const ITERATOR_5000MS =
  'session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 5000);';
const ITERATOR_2000MS =
  'session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 2000);';

check(src.indexOf(ITERATOR_100MS) !== -1,
  'INV-04: the 100ms next-iteration setTimeout schedule line is present byte-unchanged');
check(src.indexOf(ITERATOR_5000MS) !== -1,
  'INV-04: the 5000ms rate-limit-retry setTimeout line is present byte-unchanged');
check(src.indexOf(ITERATOR_2000MS) !== -1,
  'INV-04: the 2000ms network-error-retry setTimeout line is present byte-unchanged');

// The iterator is driven exclusively by `runAgentIteration(sessionId, options)`
// inside a setTimeout lambda. Assert the deferred-iterator callsite count is
// unchanged (4 setTimeout schedules: 2x 100ms + 5000ms + 2000ms) -- a new or
// removed schedule moves this count and reds the guard.
const scheduleMatches = src.match(/session\._nextIterationTimer = setTimeout\(function\(\) \{ runAgentIteration\(sessionId, options\); \}, \d+\);/g) || [];
check(scheduleMatches.length === 4,
  'INV-04: exactly 4 setTimeout iterator-schedule callsites remain (got ' + scheduleMatches.length + ') -- no schedule added/removed');

console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
