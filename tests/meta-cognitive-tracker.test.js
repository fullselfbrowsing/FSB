/**
 * Phase 233 — Meta-cognitive attempt tracker tests.
 *
 * Verifies that _trackMetaAttempt:
 *  - Counts attempts on the same target across mixed tools (click, execute_js)
 *  - Returns warn signal at threshold 4
 *  - Returns force-stop signal at threshold 6
 *  - Extracts target keys from execute_js code (querySelector, getElementById)
 *  - Window-prunes old attempts past the 12-iteration sliding window
 *  - Does not trip on diagnostic tools (read_page, get_page_snapshot)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// Load just the helpers from agent-loop.js by extracting them with a regex.
// agent-loop.js is too large to require() in a Node test (depends on chrome
// globals), so we eval just the meta-cognitive section.
const agentLoopSrc = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'ai', 'agent-loop.js'),
  'utf8'
);

const startMarker = 'var _META_INTERACT_TOOLS = {';
const endMarker = '\nfunction _trackMetaAttempt(session, call, iterNum) {';
const startIdx = agentLoopSrc.indexOf(startMarker);
const trackerEnd = agentLoopSrc.indexOf('\n}\n', agentLoopSrc.indexOf(endMarker)) + 2;
if (startIdx === -1 || trackerEnd <= 2) {
  console.error('FAIL: could not locate meta-cognitive helpers in agent-loop.js');
  process.exit(1);
}
const helpersSrc = agentLoopSrc.slice(startIdx, trackerEnd);

const ctx = {};
vm.createContext(ctx);
vm.runInContext(helpersSrc, ctx);

const { _trackMetaAttempt, _extractMetaTargetKey } = ctx;

console.log('\n--- target-key extraction ---');
assert(
  _extractMetaTargetKey({ name: 'click', args: { selector: '#add-to-cart' } }) === 'sel:#add-to-cart',
  'click with selector -> sel: prefix'
);
assert(
  _extractMetaTargetKey({ name: 'click', args: { elementId: 'e25' } }) === 'id:e25',
  'click with elementId -> id: prefix'
);
assert(
  _extractMetaTargetKey({
    name: 'execute_js',
    args: { code: "document.querySelector('#add-to-cart-button').click(); return true;" }
  }) === 'sel:#add-to-cart-button',
  'execute_js with querySelector -> extracts selector'
);
assert(
  _extractMetaTargetKey({
    name: 'execute_js',
    args: { code: "var btn = document.getElementById('submit-btn'); btn.click();" }
  }) === 'id:submit-btn',
  'execute_js with getElementById -> extracts id'
);
assert(
  _extractMetaTargetKey({ name: 'execute_js', args: { code: 'return window.location.href;' } }) ===
    'js:return window.location.href;',
  'execute_js without selector -> falls back to code prefix'
);

console.log('\n--- attempt counting ---');
function freshSession() { return {}; }

let session = freshSession();
let r1 = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'e25' } }, 1);
let r2 = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'e25' } }, 2);
let r3 = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'e25' } }, 3);
assert(r1 === null && r2 === null && r3 === null, 'no signal under threshold (3 attempts)');

let r4 = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'e25' } }, 4);
assert(r4 && r4.forceStop === false && r4.attempts.length === 4, 'warn signal at 4 attempts');
assert(r4.target === 'id:e25', 'warn signal carries the target key');

let r5 = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'e25' } }, 5);
assert(r5 && r5.forceStop === false && r5.attempts.length === 5, 'still warn at 5 attempts (under force-stop)');

let r6 = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'e25' } }, 6);
assert(r6 && r6.forceStop === true && r6.attempts.length === 6, 'force-stop at 6 attempts');

console.log('\n--- mixed tool families ---');
session = freshSession();
// 3 native clicks + 3 execute_js targeting same selector via querySelector
_trackMetaAttempt(session, { name: 'click', args: { selector: '#add-to-cart-button' } }, 10);
_trackMetaAttempt(session, { name: 'click', args: { selector: '#add-to-cart-button' } }, 11);
_trackMetaAttempt(session, { name: 'click', args: { selector: '#add-to-cart-button' } }, 12);
_trackMetaAttempt(session, {
  name: 'execute_js',
  args: { code: "document.querySelector('#add-to-cart-button').click()" }
}, 13);
let mixed5 = _trackMetaAttempt(session, {
  name: 'execute_js',
  args: { code: "document.querySelector('#add-to-cart-button').click()" }
}, 14);
assert(mixed5 && mixed5.attempts.length === 5, 'mixed click+execute_js on same selector counted together (5 attempts)');
let mixed6 = _trackMetaAttempt(session, {
  name: 'execute_js',
  args: { code: "document.querySelector('#add-to-cart-button').click()" }
}, 15);
assert(mixed6 && mixed6.forceStop === true, 'mixed-tool loop force-stops at 6th attempt');

console.log('\n--- diagnostic tools ignored ---');
session = freshSession();
let diag = _trackMetaAttempt(session, { name: 'read_page', args: {} }, 1);
assert(diag === null, 'read_page does not contribute to attempt count');
diag = _trackMetaAttempt(session, { name: 'get_page_snapshot', args: {} }, 2);
assert(diag === null, 'get_page_snapshot does not contribute');

console.log('\n--- window pruning ---');
session = freshSession();
// 4 attempts at iterations 1,2,3,4 then move forward 13 iterations (out of window)
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eX' } }, 1);
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eX' } }, 2);
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eX' } }, 3);
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eX' } }, 4);
// Big jump: iteration 17, 13 iterations after iteration 4 -> outside 12-window
let pruned = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'eX' } }, 17);
assert(pruned === null, 'attempts older than 12-iteration window are pruned (no signal at iter 17)');
assert(session._metaAttempts['id:eX'].length === 1, 'only the iter-17 attempt survives the window prune');

console.log('\n--- different targets tracked separately ---');
session = freshSession();
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eA' } }, 1);
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eB' } }, 2);
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eA' } }, 3);
_trackMetaAttempt(session, { name: 'click', args: { elementId: 'eB' } }, 4);
let aOnly = _trackMetaAttempt(session, { name: 'click', args: { elementId: 'eA' } }, 5);
// eA: 3 attempts (1, 3, 5) -> no warn
// eB: 2 attempts (2, 4)    -> no warn
assert(aOnly === null, 'separate targets do not pool counts (eA at 3 attempts -> no signal)');
assert(session._metaAttempts['id:eA'].length === 3, 'eA tracker has 3 entries');
assert(session._metaAttempts['id:eB'].length === 2, 'eB tracker has 2 entries');

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
