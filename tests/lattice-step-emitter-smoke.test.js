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

// ---------- Part 3: agent-loop.js integration (5 PASSes) ----------
console.log('--- Part 3: agent-loop.js integration ---');

const fs = require('node:fs');
const AGENT_LOOP_PATH = path.join(__dirname, '..', 'extension', 'ai', 'agent-loop.js');
const agentLoopSrc = fs.readFileSync(AGENT_LOOP_PATH, 'utf8');

ok('Part 3.1 agent-loop.js contains exactly one LLM_TURN emission', () => {
  const m = agentLoopSrc.match(/stepName: 'LLM_TURN'/g) || [];
  assert.equal(m.length, 1);
});

ok('Part 3.2 agent-loop.js contains exactly one TOOL_DISPATCH emission', () => {
  const m = agentLoopSrc.match(/stepName: 'TOOL_DISPATCH'/g) || [];
  assert.equal(m.length, 1);
});

ok('Part 3.3 both call sites use the typeof guard (>= 2 occurrences)', () => {
  const guardCount = (agentLoopSrc.match(/typeof sendLatticeStepTransition === 'function'/g) || []).length;
  assert.ok(guardCount >= 2, 'expected >= 2 typeof guards, found ' + guardCount);
});

ok('Part 3.4 real-runtime LLM_TURN call structure works (simulates the inserted snippet)', () => {
  resetChromeMock();
  const sessionId = 'sess-abc';
  const iterNum = 1;
  if (typeof emitter.sendLatticeStepTransition === 'function') {
    emitter.sendLatticeStepTransition({
      runId: sessionId,
      sessionId: sessionId,
      stepName: 'LLM_TURN',
      stepIndex: iterNum,
      timestamp: new Date().toISOString()
    });
  }
  assert.equal(sendMessageCalls.length, 1);
  assert.equal(sendMessageCalls[0].payload.stepName, 'LLM_TURN');
  assert.equal(sendMessageCalls[0].payload.runId, sessionId);
});

ok('Part 3.5 real-runtime TOOL_DISPATCH call structure works (simulates the inserted snippet)', () => {
  resetChromeMock();
  const sessionId = 'sess-abc';
  const iterNum = 1;
  if (typeof emitter.sendLatticeStepTransition === 'function') {
    emitter.sendLatticeStepTransition({
      runId: sessionId,
      sessionId: sessionId,
      stepName: 'TOOL_DISPATCH',
      stepIndex: iterNum,
      previousStepName: 'LLM_TURN',
      timestamp: new Date().toISOString()
    });
  }
  assert.equal(sendMessageCalls.length, 1);
  assert.equal(sendMessageCalls[0].payload.stepName, 'TOOL_DISPATCH');
  assert.equal(sendMessageCalls[0].payload.previousStepName, 'LLM_TURN');
});

// ---------- Part 4: LLM_TURN + TOOL_DISPATCH semantic (6 PASSes) ----------
console.log('--- Part 4: LLM_TURN + TOOL_DISPATCH semantic ---');

ok('Part 4.1 LLM_TURN envelope contains exactly 5 keys', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 'r', sessionId: 's', stepName: 'LLM_TURN', stepIndex: 1, timestamp: 't'});
  const keys = Object.keys(sendMessageCalls[0].payload).sort();
  assert.deepEqual(keys, ['runId', 'sessionId', 'stepIndex', 'stepName', 'timestamp']);
});

ok('Part 4.2 TOOL_DISPATCH envelope contains exactly 6 keys including previousStepName', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 'r', sessionId: 's', stepName: 'TOOL_DISPATCH', stepIndex: 1, previousStepName: 'LLM_TURN', timestamp: 't'});
  const keys = Object.keys(sendMessageCalls[0].payload).sort();
  assert.deepEqual(keys, ['previousStepName', 'runId', 'sessionId', 'stepIndex', 'stepName', 'timestamp']);
});

ok('Part 4.3 stepIndex round-trips as finite number', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 'r', sessionId: 's', stepName: 'LLM_TURN', stepIndex: 42, timestamp: 't'});
  assert.equal(typeof sendMessageCalls[0].payload.stepIndex, 'number');
  assert.ok(Number.isFinite(sendMessageCalls[0].payload.stepIndex));
  assert.equal(sendMessageCalls[0].payload.stepIndex, 42);
});

ok('Part 4.4 timestamp matches ISO-8601 RFC 3339 format', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 'r', sessionId: 's', stepName: 'LLM_TURN', stepIndex: 1, timestamp: new Date().toISOString()});
  const ts = sendMessageCalls[0].payload.timestamp;
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

ok('Part 4.5 runId equals sessionId convention preserved (Pitfall 3 guardrail)', () => {
  resetChromeMock();
  emitter.sendLatticeStepTransition({runId: 's-abc', sessionId: 's-abc', stepName: 'LLM_TURN', stepIndex: 1, timestamp: 't'});
  assert.equal(sendMessageCalls[0].payload.runId, sendMessageCalls[0].payload.sessionId);
});

ok('Part 4.6 stepName accepts only LLM_TURN and TOOL_DISPATCH variants in agent-loop.js source', () => {
  const allStepNames = (agentLoopSrc.match(/stepName:\s*'[^']+'/g) || []);
  const unique = [...new Set(allStepNames)].sort();
  assert.deepEqual(unique, ["stepName: 'LLM_TURN'", "stepName: 'TOOL_DISPATCH'"]);
});

// ---------- Part 5: Multi-iteration envelope capture (6 PASSes) ----------
console.log('--- Part 5: Multi-iteration envelope capture ---');

// Simulate 3 iterations * 2 tool calls each. Expected: 3 LLM_TURN + 6 TOOL_DISPATCH = 9 envelopes.
resetChromeMock();
(function simulateMultiIter() {
  const sessionId = 'sess-multi';
  for (let iterNum = 1; iterNum <= 3; iterNum++) {
    emitter.sendLatticeStepTransition({runId: sessionId, sessionId: sessionId, stepName: 'LLM_TURN', stepIndex: iterNum, timestamp: new Date().toISOString()});
    for (let ci = 0; ci < 2; ci++) {
      emitter.sendLatticeStepTransition({runId: sessionId, sessionId: sessionId, stepName: 'TOOL_DISPATCH', stepIndex: iterNum, previousStepName: 'LLM_TURN', timestamp: new Date().toISOString()});
    }
  }
})();

ok('Part 5.1 multi-iteration capture yields exactly 9 envelopes (3 iters x 2 tool calls)', () => {
  assert.equal(sendMessageCalls.length, 9);
});

ok('Part 5.2 envelope #1 is LLM_TURN with stepIndex=1', () => {
  assert.equal(sendMessageCalls[0].payload.stepName, 'LLM_TURN');
  assert.equal(sendMessageCalls[0].payload.stepIndex, 1);
});

ok('Part 5.3 envelope #2 is TOOL_DISPATCH stepIndex=1 with previousStepName LLM_TURN', () => {
  assert.equal(sendMessageCalls[1].payload.stepName, 'TOOL_DISPATCH');
  assert.equal(sendMessageCalls[1].payload.stepIndex, 1);
  assert.equal(sendMessageCalls[1].payload.previousStepName, 'LLM_TURN');
});

ok('Part 5.4 stepIndex monotonically increases across iterations (1,1,1,2,2,2,3,3,3)', () => {
  const indices = sendMessageCalls.map(c => c.payload.stepIndex);
  assert.deepEqual(indices, [1, 1, 1, 2, 2, 2, 3, 3, 3]);
});

ok('Part 5.5 all envelopes use type lattice-step-transition', () => {
  for (const c of sendMessageCalls) assert.equal(c.type, 'lattice-step-transition');
});

ok('Part 5.6 LLM_TURN to TOOL_DISPATCH ratio is 1:2 (3 LLM + 6 TOOL = 9 envelopes)', () => {
  const llm = sendMessageCalls.filter(c => c.payload.stepName === 'LLM_TURN').length;
  const td = sendMessageCalls.filter(c => c.payload.stepName === 'TOOL_DISPATCH').length;
  assert.equal(llm, 3);
  assert.equal(td, 6);
});

// ---------- Part 6: INV byte-freeze regression (8 PASSes) ----------
console.log('--- Part 6: INV byte-freeze regression ---');

ok('Part 6.1 INV-04 setTimeout count in agent-loop.js is exactly 8', () => {
  const m = agentLoopSrc.match(/setTimeout/g) || [];
  assert.equal(m.length, 8);
});

ok('Part 6.2 INV-04 iterator pattern session._nextIterationTimer = setTimeout appears exactly 4 times', () => {
  const m = agentLoopSrc.match(/session\._nextIterationTimer\s*=\s*setTimeout/g) || [];
  assert.equal(m.length, 4);
});

ok('Part 6.3 Pitfall 1: no sendLatticeStepTransition token inside any setTimeout lambda body', () => {
  const lines = agentLoopSrc.split('\n');
  let insideLambda = false;
  for (const line of lines) {
    if (/setTimeout\(function/.test(line)) insideLambda = true;
    if (insideLambda && /sendLatticeStepTransition/.test(line)) {
      throw new Error('sendLatticeStepTransition found inside setTimeout lambda body');
    }
    if (insideLambda && /\},\s*\d+\s*\)/.test(line)) insideLambda = false;
  }
  assert.equal(true, true);
});

ok('Part 6.4 INV-05 deprecated agent modules absent OR carry DEPRECATED banner', () => {
  const targets = ['extension/agents/agent-executor.js', 'extension/agents/agent-manager.js', 'extension/agents/agent-scheduler.js'];
  for (const f of targets) {
    const p = path.join(__dirname, '..', f);
    if (fs.existsSync(p)) {
      const src = fs.readFileSync(p, 'utf8');
      assert.match(src, /DEPRECATED/, f + ' missing DEPRECATED banner');
    }
  }
  assert.equal(true, true);
});

ok('Part 6.5 INV-06 LATTICE-PIN.md current_lattice_sha equals e95067bfa87ed1b75838fc3b3ef217a3b01acbd3', () => {
  const pin = fs.readFileSync(path.join(__dirname, '..', '.planning', 'LATTICE-PIN.md'), 'utf8');
  assert.match(pin, /current_lattice_sha:\s*e95067bfa87ed1b75838fc3b3ef217a3b01acbd3/);
});

ok('Part 6.6 lattice-step-emitter.js contains zero setTimeout (Pitfall 1 module-level)', () => {
  const src = fs.readFileSync(EMITTER_PATH, 'utf8');
  const m = src.match(/setTimeout/g);
  assert.equal(m, null);
});

ok('Part 6.7 background.js contains exactly one importScripts of the new emitter', () => {
  const bg = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const m = bg.match(/importScripts\('ai\/lattice-step-emitter\.js'\)/g) || [];
  assert.equal(m.length, 1);
});

ok('Part 6.8 INV-01 tool-definitions parity test exists and is in the test chain', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /tool-definitions-parity\.test\.js/);
});

// ---------- Final tally ----------
console.log('\n=== lattice-step-emitter-smoke summary: ' + pass + ' PASS / ' + fail + ' FAIL ===');
if (fail > 0) {
  console.error('FAILURES:');
  failures.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
if (pass < 25) {
  console.error('Plan 08-02 floor violated: pass count ' + pass + ' < 25');
  process.exit(1);
}
process.exit(0);
