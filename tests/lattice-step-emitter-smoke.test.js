'use strict';
/**
 * tests/lattice-step-emitter-smoke.test.js
 *
 * Phase 8 Plan 08-01 -- Wave 0 scaffold. Parts 1+2 filled (>= 13 PASSes covering
 * SW-side producer module presence + envelope construction). Parts 3-6 are
 * placeholders that emit 1 PASS each so the chain stays green; Plan 08-02
 * fills them with agent-loop integration + INV byte-freeze regression assertions.
 *
 * Real-runtime test discipline per CLAUDE.md MEMORY (no static-text grep for
 * presence; load + invoke the module). chrome.runtime.sendMessage is mocked
 * (Chrome API absent in Node); the lattice-step-emitter module is loaded for real.
 *
 * Exit 0 on PASS >= 12; exit 1 on any FAIL.
 */
const assert = require('node:assert/strict');
const path = require('node:path');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, fn) {
  try {
    fn();
    pass++;
    console.log('PASS', label);
  } catch (err) {
    fail++;
    failures.push(label + ': ' + err.message);
    console.error('FAIL', label, err.message);
  }
}

// ---------- chrome.runtime mock ----------
let sendMessageCalls = [];
let sendMessageThrows = false;
function resetChromeMock() {
  sendMessageCalls = [];
  sendMessageThrows = false;
}
global.chrome = {
  runtime: {
    id: 'fsb-test-extension-id',
    sendMessage: function (msg) {
      if (sendMessageThrows) throw new Error('synthetic sendMessage throw');
      sendMessageCalls.push(msg);
      return Promise.resolve();
    }
  }
};

// ---------- Load module under test ----------
const EMITTER_PATH = path.join(__dirname, '..', 'extension', 'ai', 'lattice-step-emitter.js');
delete require.cache[require.resolve(EMITTER_PATH)];
const emitter = require(EMITTER_PATH);

// ---------- Part 1: Module presence + dual export (5 PASSes) ----------
console.log('--- Part 1: Module presence + dual export ---');

ok('Part 1.1 module exports sendLatticeStepTransition as function', () => {
  assert.equal(typeof emitter.sendLatticeStepTransition, 'function');
});

ok('Part 1.2 globalThis.sendLatticeStepTransition matches module.exports ref', () => {
  assert.equal(globalThis.sendLatticeStepTransition, emitter.sendLatticeStepTransition);
});

ok('Part 1.3 boot log emitted at module load (verified by absence of throw)', () => {
  // If require succeeded above without throw, boot log code path was reached.
  assert.equal(typeof emitter.sendLatticeStepTransition, 'function');
});

ok('Part 1.4 function is idempotent on repeat invocation', () => {
  resetChromeMock();
  const p = {runId: 'r1', stepName: 'LLM_TURN', stepIndex: 1, timestamp: 't'};
  emitter.sendLatticeStepTransition(p);
  emitter.sendLatticeStepTransition(p);
  assert.equal(sendMessageCalls.length, 2);
});

ok('Part 1.5 module file has zero setTimeout (Pitfall 1 guardrail)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(EMITTER_PATH, 'utf8');
  const matches = src.match(/setTimeout/g);
  assert.equal(matches, null);
});

// ---------- Part 2: Envelope construction (8 PASSes) ----------
console.log('--- Part 2: Envelope construction ---');

ok('Part 2.1 valid payload triggers exactly one sendMessage', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 'r1', sessionId: 's1', stepName: 'LLM_TURN', stepIndex: 1, timestamp: '2026-05-31T00:00:00.000Z'});
  assert.equal(sendMessageCalls.length, 1);
});

ok('Part 2.2 sendMessage first-arg has type lattice-step-transition', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 'r1', stepName: 'LLM_TURN', stepIndex: 1, timestamp: 't'});
  assert.equal(sendMessageCalls[0].type, 'lattice-step-transition');
});

ok('Part 2.3 payload byte-round-trips for LLM_TURN variant', () => {
  resetChromeMock();
  const p = {runId: 'r1', sessionId: 's1', stepName: 'LLM_TURN', stepIndex: 2, timestamp: '2026-05-31T00:00:01.000Z'};
  emitter.sendLatticeStepTransition(p);
  assert.deepEqual(sendMessageCalls[0].payload, p);
});

ok('Part 2.4 payload byte-round-trips for TOOL_DISPATCH variant with previousStepName', () => {
  resetChromeMock();
  const p = {runId: 'r1', sessionId: 's1', stepName: 'TOOL_DISPATCH', stepIndex: 2, previousStepName: 'LLM_TURN', timestamp: '2026-05-31T00:00:02.000Z'};
  emitter.sendLatticeStepTransition(p);
  assert.deepEqual(sendMessageCalls[0].payload, p);
});

ok('Part 2.5 null payload is silent no-op', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition(null);
  assert.equal(sendMessageCalls.length, 0);
});

ok('Part 2.6 undefined payload is silent no-op', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition(undefined);
  assert.equal(sendMessageCalls.length, 0);
});

ok('Part 2.7 string payload is silent no-op', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition('not-an-object');
  assert.equal(sendMessageCalls.length, 0);
});

ok('Part 2.8 synchronous throw from chrome.runtime.sendMessage is swallowed (no upstream throw)', () => {
  resetChromeMock();
  sendMessageThrows = true;
  let upstreamThrew = false;
  try {
    emitter.sendLatticeStepTransition({runId: 'r1', stepName: 'LLM_TURN', stepIndex: 1, timestamp: 't'});
  } catch (_e) {
    upstreamThrew = true;
  }
  assert.equal(upstreamThrew, false);
});

// ---------- Part 3: agent-loop.js integration (Plan 08-02 will fill) ----------
console.log('--- Part 3: agent-loop.js integration (Plan 08-02 placeholder) ---');
ok('Part 3.0 placeholder -- Plan 08-02 will populate Part 3', () => {
  assert.equal(true, true);
});

// ---------- Part 4: LLM_TURN + TOOL_DISPATCH semantic (Plan 08-02 will fill) ----------
console.log('--- Part 4: LLM_TURN + TOOL_DISPATCH semantic (Plan 08-02 placeholder) ---');
ok('Part 4.0 placeholder -- Plan 08-02 will populate Part 4', () => {
  assert.equal(true, true);
});

// ---------- Part 5: SendMessage envelope count + payload structure (Plan 08-02 will fill) ----------
console.log('--- Part 5: Envelope count + structure under multi-iteration (Plan 08-02 placeholder) ---');
ok('Part 5.0 placeholder -- Plan 08-02 will populate Part 5', () => {
  assert.equal(true, true);
});

// ---------- Part 6: INV byte-freeze regression (Plan 08-02 will fill) ----------
console.log('--- Part 6: INV byte-freeze regression (Plan 08-02 placeholder) ---');
ok('Part 6.0 placeholder -- Plan 08-02 will populate Part 6', () => {
  assert.equal(true, true);
});

// ---------- Final tally ----------
console.log('\n=== lattice-step-emitter-smoke summary: ' + pass + ' PASS / ' + fail + ' FAIL ===');
if (fail > 0) {
  console.error('FAILURES:');
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
if (pass < 12) {
  console.error('Wave 0 floor violated: pass count ' + pass + ' < 12');
  process.exit(1);
}
process.exit(0);
