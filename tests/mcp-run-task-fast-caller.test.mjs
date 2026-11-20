/**
 * Phase 70 Plan 07 Task 1 (MCP-03, MCP-04; CONTEXT D-03, D-17, D-20, SC4):
 * a real MCP caller parses run_task results with and without the fast_mode
 * block through the unchanged built server.
 *
 * The caller is the real SDK Client over InMemoryTransport, driving
 * createRuntime() from mcp/build through the Phase 69 in-process helper
 * (tests/helpers/mcp-in-process.mjs) with its mock AgentScope. The bridge is
 * a stand-in extension: it answers mcp:start-automation with the recorded
 * settle values of the 70-01 golden (tests/fixtures/run-task-wire-golden.json),
 * as the extension bridge sends them ({ success: true, ...value }), and, for
 * the switched-on form, the same value plus one fast_mode block built by the
 * real extension FsbFastPath.buildFastModeBlock. So every result passes
 * run_task's real handler, sendAgentScopedBridgeMessage and mapFSBError
 * exactly as a host's call would.
 *
 * Proves:
 *   - "tools/list unchanged": run_task keeps its 8a058bdf shape (description-
 *     free projection, the 69 shape-freeze rule) with only `task` as a
 *     property and as the required list; no tool is named for fast or jev.
 *   - "switch-off wire <path>": no isError and the text is the 70-01 golden
 *     wireText byte for byte, for all five settle paths.
 *   - "switch-on wire <path>": no isError, fast_mode parses intact and last,
 *     and removing it gives the golden wireText byte for byte.
 *   - "start payload unchanged": the bridge payload carries the task and the
 *     same key set with the block on or off, never a fast or jev key.
 *
 * Never skips. No sockets, no git, no child processes, and nothing reads the
 * fast-mode switch; Node 20 safe. The live host check is Validation Block V5.
 *
 * Run: npm --prefix mcp run build && node --test tests/mcp-run-task-fast-caller.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  REPO_ROOT,
  assertBuildFresh,
  canonicalJson,
  createInProcessClient,
  makeMockAgentScope,
  makeStubBridge,
  projectShape,
  readBaselineFixture,
} from './helpers/mcp-in-process.mjs';

// A stale build would exercise old code; fail loudly before anything else.
assertBuildFresh();

const require = createRequire(import.meta.url);
const FsbFastPath = require('../extension/ai/jev-fast-path.js');

const GOLDEN = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests', 'fixtures', 'run-task-wire-golden.json'), 'utf8'));
const PATH_NAMES = Object.freeze(['runtime-complete', 'bus-complete', 'bus-error', 'bus-stop', 'safety-net']);
const TASK_TEXT = 'Tick Alpha.';
const START_TYPE = 'mcp:start-automation';
const SESSION_ID = GOLDEN.sessionId;

// ---------------------------------------------------------------------------
// A representative switched-on run_task session (70-05 layout): the run_task
// budget field, a resolved run evidence record, and the measurement an
// uncalibrated gateway leaves behind (one decide, then a session latch).
// ---------------------------------------------------------------------------

function representativeSession() {
  const session = {
    fastMode: { enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' },
    status: 'completed',
    _fastRunEvidence: {
      v: 1, seq: 4, fastIteration: null, pending: null,
      lastUncertainSeq: 0, lastObservationSeq: 3, fastUnobservedSeq: 0, gates: [],
    },
    _fastPath: { off: true, offReason: 'not_calibrated', offCommand: 1 },
    agentState: { jevFast: { command: 1, latched: null } },
  };
  FsbFastPath.appendAttempt(session, FsbFastPath.attemptFromResult(
    { ok: true, calibration: { status: 'uncalibrated' }, latencyMs: 420 },
    { iteration: 2, command: 1, outcome: 'declined', escalationReason: 'not_calibrated' },
  ));
  FsbFastPath.addCommandTotals(session, 1, { jevCalls: 1, jevMs: 420 });
  FsbFastPath.addCommandTotals(session, 1, { escalation: 'not_calibrated' });
  return session;
}

// The settle each golden path came from (mcp-bridge-client.js handleComplete,
// handleError and the safety net), as the bridge hands it to the builder.
function settleFor(name) {
  const base = { action: 'automationComplete', sessionId: SESSION_ID };
  switch (name) {
    case 'runtime-complete':
      return { source: 'chrome.runtime', kind: 'complete', message: { ...base, outcome: 'success', reason: 'complete_task' } };
    case 'bus-complete':
      return { source: 'lifecycleBus', kind: 'complete', message: { ...base, outcome: 'success', reason: 'complete_task' } };
    case 'bus-error':
      return {
        source: 'lifecycleBus',
        kind: 'error',
        message: { action: 'automationError', sessionId: SESSION_ID, outcome: 'error', reason: 'error', error: GOLDEN.paths['bus-error'].value.error },
      };
    case 'bus-stop':
      return { source: 'lifecycleBus', kind: 'complete', message: { ...base, outcome: 'stopped', reason: 'user_stopped', stopped: true } };
    case 'safety-net':
      return { source: 'safety_net_600s', kind: 'safety_net' };
    default:
      throw new Error(`unknown golden path ${name}`);
  }
}

const EXPECTED_TYPED = Object.freeze({
  'runtime-complete': ['done', 'complete_task'],
  'bus-complete': ['done', 'complete_task'],
  'bus-error': ['blocked', 'error'],
  'bus-stop': ['blocked', 'user_stopped'],
  'safety-net': ['ambiguous', 'safety_net_timeout'],
});

function blockFor(name) {
  return FsbFastPath.buildFastModeBlock(representativeSession(), settleFor(name));
}

// ---------------------------------------------------------------------------
// The in-process caller and its stand-in extension.
// ---------------------------------------------------------------------------

let answer = { success: true };
const bridge = makeStubBridge({
  onSend: (message) => (message && message.type === START_TYPE ? JSON.parse(JSON.stringify(answer)) : { success: true }),
});
const session = await createInProcessClient({ bridge, agentScope: makeMockAgentScope() });
after(() => session.close());

// One caller turn: run_task with only {task}, answered with `nextAnswer`.
async function runTask(nextAnswer) {
  answer = nextAnswer;
  bridge.calls.length = 0;
  const result = await session.client.callTool({ name: 'run_task', arguments: { task: TASK_TEXT } });
  const text = result && Array.isArray(result.content) && result.content[0] ? result.content[0].text : '';
  const starts = bridge.calls.filter((entry) => entry.message && entry.message.type === START_TYPE);
  return { result, text, starts, calls: bridge.calls.slice() };
}

function offAnswer(name) {
  return { success: true, ...GOLDEN.paths[name].value };
}

function onAnswer(name, block) {
  return { success: true, ...GOLDEN.paths[name].value, fast_mode: block };
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

test('tools/list unchanged', async () => {
  const { tools } = await session.client.listTools();
  const current = tools.find((tool) => tool.name === 'run_task');
  const baseline = readBaselineFixture().tools.find((tool) => tool.name === 'run_task');
  assert.ok(current, 'run_task is listed');
  assert.ok(baseline, 'run_task is in the 8a058bdf fixture');
  assert.equal(canonicalJson(projectShape(current)), canonicalJson(projectShape(baseline)),
    'run_task keeps its 8a058bdf description-free shape');
  assert.deepEqual(Object.keys(current.inputSchema.properties), ['task'], 'run_task has exactly one property, task');
  assert.deepEqual(current.inputSchema.required, ['task'], 'run_task requires exactly task');
  assert.deepEqual(Object.keys(baseline.inputSchema.properties), ['task']);
  assert.deepEqual(baseline.inputSchema.required, ['task']);
  const fastNamed = tools.map((tool) => tool.name).filter((name) => /fast|jev/i.test(name));
  assert.deepEqual(fastNamed, [], 'no tool is named for fast mode or jev');
});

// ---------------------------------------------------------------------------
// Switch off: the 70-01 golden wire text, byte for byte.
// ---------------------------------------------------------------------------

for (const name of PATH_NAMES) {
  test(`switch-off wire ${name}`, async () => {
    const turn = await runTask(offAnswer(name));
    assert.equal(turn.starts.length, 1, 'exactly one mcp:start-automation dispatch');
    assert.equal(turn.calls.length, 1, 'no other bridge message');
    assert.equal(turn.result.isError, undefined, `no isError (got ${turn.text})`);
    assert.equal(turn.result.content.length, 1, 'one text content item');
    assert.equal(turn.result.content[0].type, 'text');
    assert.equal(turn.text, GOLDEN.paths[name].wireText, 'the tool-result text is the 70-01 golden, byte for byte');
    const parsed = JSON.parse(turn.text);
    assert.equal(hasOwn(parsed, 'fast_mode'), false, 'no fast_mode key with the switch off');
  });
}

// ---------------------------------------------------------------------------
// Switch on: one additive fast_mode key, parsed intact.
// ---------------------------------------------------------------------------

for (const name of PATH_NAMES) {
  test(`switch-on wire ${name}`, async () => {
    const block = blockFor(name);
    assert.deepEqual(Object.keys(block), [...FsbFastPath.FAST_MODE_BLOCK_KEYS], 'the real builder returns the frozen key list');
    assert.deepEqual([block.outcome, block.reason], EXPECTED_TYPED[name], 'the representative block carries the typed outcome');
    assert.equal(block.budget_profile, 'run_task');
    assert.deepEqual(Object.keys(block.jev), [...FsbFastPath.FAST_MODE_SUMMARY_KEYS]);
    assert.equal(block.jev.calibration, 'uncalibrated');
    assert.equal(block.jev.latched, 'not_calibrated');

    const turn = await runTask(onAnswer(name, block));
    assert.equal(turn.starts.length, 1, 'exactly one mcp:start-automation dispatch');
    assert.equal(turn.calls.length, 1, 'no other bridge message');
    assert.equal(turn.result.isError, undefined, `no isError (got ${turn.text})`);
    assert.equal(turn.result.content.length, 1, 'one text content item');
    const parsed = JSON.parse(turn.text);
    assert.deepEqual(parsed.fast_mode, block, 'fast_mode reaches the caller intact');
    assert.equal(Object.keys(parsed).at(-1), 'fast_mode', 'fast_mode is the last key');
    assert.equal(parsed.success, true, 'success is unchanged');
    const offParsed = JSON.parse(GOLDEN.paths[name].wireText);
    assert.deepEqual(Object.keys(parsed).filter((key) => !hasOwn(offParsed, key)), ['fast_mode'],
      'the key-set difference is exactly fast_mode');
    const { fast_mode: _block, ...rest } = parsed;
    assert.equal(JSON.stringify(rest, null, 2), GOLDEN.paths[name].wireText,
      'without fast_mode the text re-serializes to the golden, byte for byte');
  });
}

// ---------------------------------------------------------------------------
// The start payload is the same with the block on or off.
// ---------------------------------------------------------------------------

test('start payload unchanged', async () => {
  const off = await runTask(offAnswer('runtime-complete'));
  const on = await runTask(onAnswer('runtime-complete', blockFor('runtime-complete')));
  for (const [label, turn] of [['switch off', off], ['switch on', on]]) {
    assert.equal(turn.starts.length, 1, `${label}: exactly one mcp:start-automation dispatch`);
    const payload = turn.starts[0].message.payload;
    assert.equal(payload.task, TASK_TEXT, `${label}: the payload carries the task as sent`);
    assert.equal(Object.keys(payload)[0], 'task', `${label}: task is the first payload key`);
    assert.deepEqual(Object.keys(payload).filter((key) => /fast|jev/i.test(key)), [], `${label}: no fast or jev payload key`);
    assert.equal(turn.starts[0].options.timeout, 600_000, `${label}: the 600 s run_task timeout`);
  }
  assert.deepEqual(Object.keys(on.starts[0].message.payload).sort(), Object.keys(off.starts[0].message.payload).sort(),
    'the payload key set is identical with the block on or off');
  assert.deepEqual(Object.keys(on.starts[0].message.payload), Object.keys(off.starts[0].message.payload),
    'the payload key order is identical with the block on or off');
});
