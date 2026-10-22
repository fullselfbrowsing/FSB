#!/usr/bin/env node
'use strict';

/**
 * Phase 68 Plan 09 -- fast-mode measurement persistence and projection
 * (AUTO-04, D-23, D-01, T-68-11, T-68-12, T-68-19, T-68-26).
 *
 * The session's jevMeasurement block (68-04/68-05 producers) must reach the
 * history store and get_session_detail, and nothing may change for a session
 * that never used fast mode:
 *
 *   - logger: automation-logger.js saveSession persists jevMeasurement only
 *     when a session has one, through an allowlist clone (no page content,
 *     attempts capped at 100, numbers that are not finite stay null), keeps
 *     the stored block in update mode when the new session has none, and
 *     marks persisted actions decisionSource:'jev' only for fast steps. A
 *     fixed fast-mode-off session saved in new and then update mode is
 *     byte-identical to tests/fixtures/jev-fast-logger-off-session.json,
 *     captured with the logger before the edit.
 *   - dispatcher: get_session_detail (extension/ws/mcp-tool-dispatcher.js)
 *     deletes jevMeasurement from the generic copy and adds an explicit
 *     null-not-zero projection only when the stored session has one; action
 *     entries (history and the in-flight currentAction) show
 *     decisionSource:'jev' only for fast steps and never their jevHandle or
 *     expectedName; Jev cost stays out of costUsd and the provider
 *     measurement. Output for fast-mode-off sessions (a stored autopilot
 *     session, a stored MCP session and an in-flight session) is
 *     byte-identical to tests/fixtures/jev-fast-session-detail-off.json,
 *     captured with the dispatcher before the edit.
 *   - measurement parity round trip (gotcha 6, T-68-26): a block produced by
 *     the real FsbFastPath beforeTurn / afterStep / observeTools over fake
 *     deps and the fake-gateway client is saved through the real logger (new
 *     mode, then update mode) and read back through the real
 *     get_session_detail. Every attempt and command has the same key paths
 *     and values at all three stages, so neither hand-mirrored allowlist can
 *     drop a key the producer writes or keep one it never writes.
 *   - loop: through the real runAgentIteration
 *     (tests/fixtures/agent-loop-fast-harness.js), a fast iteration adds no
 *     v1 timing row and nothing to totalCost; the session it leaves projects
 *     two measured LLM iterations plus its jevMeasurement.
 *
 * Every save runs through the real logger in a vm context over an in-memory
 * chrome.storage.local and a fixed clock; the dispatcher runs in its own vm
 * context (the tests/mcp-in-flight-session-lookup.test.js harness) with that
 * logger as automationLogger. No network, no ports, no real timers.
 * Node 20-safe.
 *
 * Run: node tests/jev-fast-measurement.test.js
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const ROOT = path.join(__dirname, '..');
const LOGGER_PATH = path.join(ROOT, 'extension', 'utils', 'automation-logger.js');
const LOGGER_SOURCE = fs.readFileSync(LOGGER_PATH, 'utf8');
const LOGGER_GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'jev-fast-logger-off-session.json'), 'utf8'));
const DISPATCHER_PATH = path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js');
const DISPATCHER_SOURCE = fs.readFileSync(DISPATCHER_PATH, 'utf8');
const DETAIL_GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'jev-fast-session-detail-off.json'), 'utf8'));
const FAST_PATH_PATH = path.join(ROOT, 'extension', 'ai', 'jev-fast-path.js');
const FAST_PATH_SOURCE = fs.readFileSync(FAST_PATH_PATH, 'utf8');
const FsbFastPath = require(FAST_PATH_PATH);
const { ActionHistory } = require(path.join(ROOT, 'extension', 'ai', 'action-history.js'));
const gateway = require('./fixtures/jev-fake-gateway.js');

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: ' + name);
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasOwn(obj, key) {
  return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function deepEqual(a, b) {
  return util.isDeepStrictEqual(clone(a), clone(b));
}

/** The first differing JSON path between two values, for failure messages. */
function firstDifference(actual, expected, trail) {
  const at = trail || '$';
  if (sameJson(actual, expected)) return null;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') {
    return at + ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected);
  }
  const keys = Array.from(new Set(Object.keys(actual).concat(Object.keys(expected))));
  for (const key of keys) {
    const diff = firstDifference(actual[key], expected[key], at + '.' + key);
    if (diff) return diff;
  }
  return at + ': key order differs';
}

function withoutKey(obj, key) {
  const copy = clone(obj);
  if (copy && typeof copy === 'object') delete copy[key];
  return copy;
}

// ---------------------------------------------------------------------------
// The real logger over in-memory storage and a fixed clock
// ---------------------------------------------------------------------------

function makeStorage(initial) {
  const store = clone(initial || {}) || {};
  return {
    store,
    async get(keys) {
      const out = {};
      for (const key of (Array.isArray(keys) ? keys : [keys])) {
        if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = clone(store[key]);
      }
      return out;
    },
    async set(values) {
      Object.assign(store, clone(values));
    },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
    }
  };
}

/** A Date whose clock is clock.t, so every logger timestamp is fixed. */
function fixedDate(clock) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(clock.t);
      else super(...args);
    }
    static now() {
      return clock.t;
    }
  }
  return FixedDate;
}

function loadLogger(storage, clock) {
  const sandbox = {
    chrome: { runtime: { id: 'test-extension' }, storage: { local: storage } },
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout() { return 1; },
    clearTimeout() {},
    Date: fixedDate(clock),
    Blob: class Blob {},
    URL: { createObjectURL() { return 'blob:test'; } }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LOGGER_SOURCE, sandbox, { filename: LOGGER_PATH });
  return sandbox.automationLogger;
}

function storedState(storage, sessionId) {
  return {
    record: clone(storage.store.fsbSessionLogs[sessionId]),
    index: clone((storage.store.fsbSessionIndex || []).find((entry) => entry && entry.id === sessionId))
  };
}

/**
 * Replays the golden input through the current logger: the logs, the
 * new-mode save, more logs, the update-mode save. edit(data, phase) may change
 * each save's input ('new' or 'update') and returns the data to save.
 */
async function replayGolden(edit) {
  const input = LOGGER_GOLDEN.input;
  const clock = { t: input.clockStart };
  const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] });
  const logger = loadLogger(storage, clock);
  const sid = input.sessionId;
  const change = typeof edit === 'function' ? edit : (data) => data;
  for (const step of input.logsBeforeFirstSave) {
    clock.t = step.at;
    logger[step.call](...clone(step.args));
  }
  clock.t = input.firstSave.at;
  const savedNew = await logger.saveSession(sid, change(clone(input.firstSave.data), 'new'));
  const newMode = storedState(storage, sid);
  for (const step of input.logsBeforeSecondSave) {
    clock.t = step.at;
    logger[step.call](...clone(step.args));
  }
  clock.t = input.secondSave.at;
  const savedUpdate = await logger.saveSession(sid, change(clone(input.secondSave.data), 'update'));
  const updateMode = storedState(storage, sid);
  return { sid, clock, storage, logger, savedNew, savedUpdate, newMode, updateMode };
}

// ---------------------------------------------------------------------------
// Measurement fixtures (the 68-04 attempt and command shapes)
// ---------------------------------------------------------------------------

const ATTEMPT_KEYS = ['iteration', 'command', 'decisionSource', 'jevCalled', 'servedModel', 'instrumentVersion',
  'calibrationStatus', 'latencyMs', 'usage', 'cost', 'fallback', 'outcome', 'escalationReason', 'op', 'stepOutcome'];
const COMMAND_KEYS = ['command', 'fastSteps', 'jevCalls', 'jevMs', 'usd', 'escalations'];

function sampleAttempt(iteration, over) {
  return Object.assign({
    iteration,
    command: 1,
    decisionSource: 'jev',
    jevCalled: true,
    servedModel: 'jev-1.13.0',
    instrumentVersion: 'fsb-jev-instrument-1',
    calibrationStatus: 'calibrated',
    latencyMs: 120,
    usage: { inputTokens: 900, source: 'provider' },
    cost: { usd: 0.0000378, source: 'provider' },
    fallback: null,
    outcome: 'acted',
    escalationReason: null,
    op: 'click',
    stepOutcome: 'progress'
  }, over || {});
}

function sampleCommand(command, over) {
  return Object.assign({
    command,
    fastSteps: 1,
    jevCalls: 3,
    jevMs: 360,
    usd: { provider: 0.0000756, estimate: null },
    escalations: { operation_below_threshold: 1, timeout: 1 }
  }, over || {});
}

function sampleBlock() {
  return {
    v: 1,
    attempts: [
      sampleAttempt(2),
      sampleAttempt(3, { outcome: 'escalated', escalationReason: 'operation_below_threshold', op: null, stepOutcome: null }),
      sampleAttempt(4, {
        servedModel: null, instrumentVersion: null, calibrationStatus: null, latencyMs: 12,
        usage: { inputTokens: null, source: 'unavailable' }, cost: { usd: null, source: 'unavailable' },
        fallback: 'timeout', outcome: 'escalated', escalationReason: 'timeout', op: null, stepOutcome: null
      }),
      sampleAttempt(6, {
        command: 2, jevCalled: false, servedModel: null, instrumentVersion: null, calibrationStatus: null, latencyMs: null,
        usage: { inputTokens: null, source: 'unavailable' }, cost: { usd: null, source: 'unavailable' },
        fallback: 'sensitive_goal', outcome: 'declined', escalationReason: 'sensitive_goal', op: null, stepOutcome: null
      })
    ],
    commands: [
      sampleCommand(1),
      sampleCommand(2, { fastSteps: 0, jevCalls: 0, jevMs: null, usd: { provider: null, estimate: null }, escalations: { sensitive_goal: 1 } })
    ]
  };
}

const MARK = 'MKR';
const MARK_URL = 'https://mkr.example/checkout?card=MKR';

/** A block whose every level carries keys and values outside the allowlist. */
function hostileBlock() {
  const escalations = JSON.parse('{"__proto__": 4}');
  escalations['Has Space'] = 1;
  escalations[MARK_URL] = 1;
  escalations.no_effect = 2;
  escalations.not_a_count = 'two';
  return {
    v: 1,
    label: MARK,
    url: MARK_URL,
    pageText: MARK + ' page text',
    attempts: [
      Object.assign(sampleAttempt(2), {
        label: MARK + ' Pay now',
        url: MARK_URL,
        title: MARK + ' Checkout',
        visibleText: MARK + ' visible',
        goal: MARK + ' goal',
        usage: { inputTokens: 900, source: 'provider', raw: MARK },
        cost: { usd: 0.0000378, source: 'provider', raw: MARK }
      }),
      sampleAttempt(3, {
        iteration: 2.5,
        command: -1,
        decisionSource: 'llm',
        jevCalled: 'yes',
        servedModel: 'x'.repeat(129),
        instrumentVersion: 'y'.repeat(65),
        calibrationStatus: MARK + ' calibrated',
        latencyMs: Infinity,
        usage: { inputTokens: '900', source: 'estimate' },
        cost: { usd: NaN, source: 'mixed' },
        fallback: 'Timed out on ' + MARK_URL,
        outcome: 'clicked "' + MARK + '"',
        escalationReason: 'Bad Reason',
        op: 'click on ' + MARK,
        stepOutcome: 42
      }),
      'not an attempt',
      null
    ],
    commands: [
      Object.assign(sampleCommand(1, {
        jevMs: -Infinity,
        fastSteps: -1,
        jevCalls: 1.5,
        usd: { provider: -0.1, estimate: Infinity, mixed: 1 },
        escalations
      }), { title: MARK, url: MARK_URL }),
      ['not', 'a', 'command']
    ]
  };
}

/** What the allowlist clone and the projection both make of hostileBlock(). */
function hostileExpected() {
  return {
    v: 1,
    attempts: [
      sampleAttempt(2),
      {
        iteration: null,
        command: null,
        decisionSource: null,
        jevCalled: false,
        servedModel: null,
        instrumentVersion: null,
        calibrationStatus: null,
        latencyMs: null,
        usage: { inputTokens: null, source: 'unavailable' },
        cost: { usd: null, source: 'unavailable' },
        fallback: null,
        outcome: null,
        escalationReason: null,
        op: null,
        stepOutcome: null
      }
    ],
    commands: [
      {
        command: 1,
        fastSteps: null,
        jevCalls: null,
        jevMs: null,
        usd: { provider: null, estimate: null },
        escalations: { no_effect: 2 }
      }
    ]
  };
}

/** The stored block, or an empty stand-in so a missing block fails checks instead of throwing. */
function blockOf(record) {
  const block = record && record.jevMeasurement;
  return block && typeof block === 'object' && Array.isArray(block.attempts) && Array.isArray(block.commands)
    ? block
    : { missing: true, attempts: [], commands: [] };
}

function containsMark(value) {
  const json = JSON.stringify(value) || '';
  return json.indexOf(MARK) !== -1 || json.indexOf('mkr.example') !== -1;
}

// ---------------------------------------------------------------------------
// Logger cases (Task 1)
// ---------------------------------------------------------------------------

async function loggerGoldenCases() {
  section('logger: a fast-mode-off session is stored byte-identically to the pre-edit golden');
  const run = await replayGolden();
  check(run.savedNew === true && run.savedUpdate === true, 'both golden saves succeed');
  check(JSON.stringify(run.newMode, null, 2) === JSON.stringify(LOGGER_GOLDEN.newMode, null, 2),
    'new mode: the stored record and index entry equal the golden byte for byte' + (sameJson(run.newMode, LOGGER_GOLDEN.newMode) ? '' : ' (' + firstDifference(run.newMode, LOGGER_GOLDEN.newMode) + ')'));
  check(JSON.stringify(run.updateMode, null, 2) === JSON.stringify(LOGGER_GOLDEN.updateMode, null, 2),
    'update mode: the stored record and index entry equal the golden byte for byte' + (sameJson(run.updateMode, LOGGER_GOLDEN.updateMode) ? '' : ' (' + firstDifference(run.updateMode, LOGGER_GOLDEN.updateMode) + ')'));
  check(!hasOwn(run.updateMode.record, 'jevMeasurement') && !hasOwn(run.newMode.record, 'jevMeasurement'),
    'an off session stores no jevMeasurement key');

  section('logger: switch on with no Jev activity stores the same record');
  const quiet = await replayGolden((data) => Object.assign(data, {
    fastMode: { enabled: true, stored: true, source: null },
    _fastPath: { off: true, offReason: 'switch_off', pendingSteps: [], recent: [] },
    agentState: Object.assign({}, data.agentState, { jevFast: { command: 1, steps: 0, calls: 0, jevMs: 0, latched: null } }),
    jevMeasurement: undefined
  }));
  check(sameJson(quiet.newMode, LOGGER_GOLDEN.newMode) && sameJson(quiet.updateMode, LOGGER_GOLDEN.updateMode),
    'fastMode, _fastPath and agentState.jevFast never reach the stored record or index');
  for (const value of [null, [], 'block', 42, true]) {
    const odd = await replayGolden((data) => Object.assign(data, { jevMeasurement: clone(value) }));
    check(sameJson(odd.newMode, LOGGER_GOLDEN.newMode) && sameJson(odd.updateMode, LOGGER_GOLDEN.updateMode),
      'a jevMeasurement of ' + JSON.stringify(value) + ' is not an object and is not persisted');
  }
}

async function loggerPersistCases() {
  section('logger: jevMeasurement persists only when present, through the allowlist clone');
  const block = sampleBlock();
  const run = await replayGolden((data, phase) => (phase === 'new' ? Object.assign(data, { jevMeasurement: clone(block) }) : data));
  check(deepEqual(run.newMode.record.jevMeasurement, block), 'new mode persists the block as written by the producers');
  const persisted = blockOf(run.newMode.record);
  check(Object.keys(persisted).join(',') === 'v,attempts,commands', 'the persisted block holds v, attempts and commands only');
  check(persisted.attempts.length === 4 && persisted.attempts.every((a) => Object.keys(a).join(',') === ATTEMPT_KEYS.join(',')),
    'every persisted attempt holds exactly the producer keys, in producer order');
  check(persisted.commands.length === 2 && persisted.commands.every((c) => Object.keys(c).join(',') === COMMAND_KEYS.join(',')),
    'every persisted command holds exactly the producer keys, in producer order');
  check(sameJson(withoutKey(run.newMode.record, 'jevMeasurement'), LOGGER_GOLDEN.newMode.record),
    'apart from the block the new-mode record is the golden record (cost, tokens, timing and summary unchanged)');
  check(sameJson(run.newMode.index, LOGGER_GOLDEN.newMode.index), 'the index entry carries no measurement');
  check(deepEqual(run.updateMode.record.jevMeasurement, block),
    'update mode keeps the stored block when the new session has none');
  check(sameJson(withoutKey(run.updateMode.record, 'jevMeasurement'), LOGGER_GOLDEN.updateMode.record),
    'apart from the block the update-mode record is the golden record');
  check(run.updateMode.record.totalCost === LOGGER_GOLDEN.updateMode.record.totalCost &&
    run.updateMode.record.totalCostBasis === LOGGER_GOLDEN.updateMode.record.totalCostBasis,
    'Jev cost is never folded into totalCost or its basis (D-23)');

  const replaced = sampleBlock();
  replaced.attempts.push(sampleAttempt(9, { command: 2 }));
  run.clock.t += 1000;
  await run.logger.saveSession(run.sid, Object.assign(clone(LOGGER_GOLDEN.input.secondSave.data), { jevMeasurement: clone(replaced) }));
  const third = storedState(run.storage, run.sid);
  check(deepEqual(third.record.jevMeasurement, replaced), 'update mode replaces the stored block when the new session has one');

  const updateOnly = await replayGolden((data, phase) => (phase === 'update' ? Object.assign(data, { jevMeasurement: clone(block) }) : data));
  check(!hasOwn(updateOnly.newMode.record, 'jevMeasurement') && deepEqual(updateOnly.updateMode.record.jevMeasurement, block),
    'a block that first appears in update mode is added to the stored record');

  section('logger: hostile keys and values never reach storage (T-68-11)');
  const hostile = await replayGolden((data, phase) => (phase === 'new' ? Object.assign(data, { jevMeasurement: hostileBlock() }) : data));
  const stored = hostile.newMode.record.jevMeasurement;
  check(deepEqual(stored, hostileExpected()), 'the clone keeps only allowlisted keys and closed-vocabulary values' + (deepEqual(stored, hostileExpected()) ? '' : ' (' + firstDifference(stored, hostileExpected()) + ')'));
  check(!containsMark(hostile.newMode.record.jevMeasurement) && !containsMark(hostile.updateMode.record),
    'no label, url, title, goal or page text marker is stored');
  check(stored && stored.attempts[1] && stored.attempts[1].latencyMs === null && stored.attempts[1].cost.usd === null &&
    stored.commands[0].jevMs === null && stored.commands[0].usd.estimate === null,
    'numbers that are not finite stay null, never 0');

  section('logger: attempts and commands keep the newest 100');
  const many = { v: 1, attempts: [], commands: [] };
  for (let i = 1; i <= 130; i += 1) {
    many.attempts.push(sampleAttempt(i));
    many.commands.push(sampleCommand(i));
  }
  const capped = await replayGolden((data, phase) => (phase === 'new' ? Object.assign(data, { jevMeasurement: many }) : data));
  const cappedBlock = blockOf(capped.newMode.record);
  check(cappedBlock.attempts.length === 100 && cappedBlock.attempts[0].iteration === 31 && cappedBlock.attempts[99].iteration === 130,
    'attempts are capped at 100, newest kept');
  check(cappedBlock.commands.length === 100 && cappedBlock.commands[0].command === 31 && cappedBlock.commands[99].command === 130,
    'commands are capped at 100, newest kept');
}

async function loggerMarkerCases() {
  section('logger: actionHistory carries decisionSource only for fast steps');
  const mark = (data) => {
    data.actionHistory[0].decisionSource = 'llm';
    data.actionHistory[1].decisionSource = 'jev';
    data.actionHistory[2].decisionSource = 'jev';
    if (data.actionHistory[3]) data.actionHistory[3].decisionSource = true;
    if (data.actionHistory[4]) data.actionHistory[4].decisionSource = 'JEV';
    return data;
  };
  const run = await replayGolden(mark);
  for (const [label, state, golden] of [['new', run.newMode, LOGGER_GOLDEN.newMode], ['update', run.updateMode, LOGGER_GOLDEN.updateMode]]) {
    const history = state.record.actionHistory;
    const expected = clone(golden.record.actionHistory);
    expected[1].decisionSource = 'jev';
    check(sameJson(history, expected),
      label + ' mode: only the fast step gains decisionSource:\'jev\', after its existing fields; every other entry is unchanged' + (sameJson(history, expected) ? '' : ' (' + firstDifference(history, expected) + ')'));
    check(sameJson(withoutKey(state.record, 'actionHistory'), withoutKey(golden.record, 'actionHistory')),
      label + ' mode: nothing else in the record changes');
  }
  check(run.updateMode.record.actionHistory.filter((a) => hasOwn(a, 'decisionSource')).length === 1,
    'a failed fast step (filtered out) and non-jev values add no marker');
}

function loggerStaticCases() {
  section('logger: Jev cost never passes through the cost tracker (D-23)');
  check(!/estimateCost|CostTracker/.test(LOGGER_SOURCE), 'automation-logger.js never names estimateCost or CostTracker');
  const at = LOGGER_SOURCE.indexOf('function cloneJevMeasurementForPersistence(');
  check(at !== -1, 'cloneJevMeasurementForPersistence is defined');
  check((LOGGER_SOURCE.match(/cloneJevMeasurementForPersistence\(/g) || []).length >= 3,
    'cloneJevMeasurementForPersistence has a definition and is used by both save modes');
}

// ---------------------------------------------------------------------------
// The real dispatcher, with the real logger as automationLogger
// ---------------------------------------------------------------------------

const QUIET_CONSOLE = Object.freeze({ log() {}, info() {}, warn() {}, error() {}, debug() {} });

/**
 * The tests/mcp-in-flight-session-lookup.test.js buildHarness context, with a
 * quiet console and an injected automationLogger. activeSessionEntries seed
 * the in-flight map.
 */
function loadDispatcher(automationLogger, activeSessionEntries) {
  const context = {
    console: QUIET_CONSOLE,
    Math,
    Date,
    Map,
    Set,
    Array,
    Object,
    Number,
    Boolean,
    String,
    Promise,
    URL,
    Blob: typeof Blob !== 'undefined' ? Blob : undefined,
    JSON,
    activeSessions: undefined,
    automationLogger,
    handleStopAutomation: (req, _sender, sendResponse) => sendResponse({ success: true, sessionId: req.sessionId, stopped: true }),
    require: (modulePath) => {
      if (modulePath.startsWith('../ai/tool-definitions.js')) return require(path.join(ROOT, 'extension', 'ai', 'tool-definitions.js'));
      if (modulePath.startsWith('../utils/mcp-visual-session.js')) return require(path.join(ROOT, 'extension', 'utils', 'mcp-visual-session.js'));
      throw new Error('Unsupported require in test harness: ' + modulePath);
    },
    chrome: { tabs: { query: async () => [] } },
    module: { exports: {} },
    globalThis: {}
  };
  context.globalThis = context;
  context.__seed_active_session_entries = activeSessionEntries || [];
  const setup = 'activeSessions = new Map();\nfor (const [key, value] of __seed_active_session_entries) activeSessions.set(key, value);\n';
  vm.runInNewContext(setup + DISPATCHER_SOURCE, context, { filename: 'ws/mcp-tool-dispatcher.js' });
  return context.module.exports;
}

/** A real logger over storage holding these records. */
function storeWith(records) {
  const fsbSessionLogs = {};
  for (const record of records) fsbSessionLogs[record.id] = clone(record);
  const clock = { t: 1790726420000 };
  const storage = makeStorage({ fsbSessionLogs, fsbSessionIndex: [] });
  return { storage, clock, logger: loadLogger(storage, clock) };
}

function detailOf(dispatcher, sessionId) {
  return dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } });
}

/** get_session_detail for one session id over stored records and in-flight entries. */
async function detailFor(records, sessionId, liveEntries) {
  const store = storeWith(records);
  return detailOf(loadDispatcher(store.logger, liveEntries || []), sessionId);
}

const GOLDEN_STORED = LOGGER_GOLDEN.updateMode.record;
const GOLDEN_MCP = DETAIL_GOLDEN.input.storedMcp;
const GOLDEN_LIVE = DETAIL_GOLDEN.input.inFlight;
const FAST_PARAMS = Object.freeze({
  jevHandle: 'j3',
  jevGeneration: 'gen1abcd-1',
  expectedRole: 'button',
  expectedName: MARK + ' Next',
  visual_reason: 'Fast mode: simple step'
});
const FAST_STATE_NAMES = /fastMode|_fastPath|jevFast/;
const FAST_PARAM_NAMES = /jevHandle|jevGeneration|expectedRole|expectedName/;

function goldenOutput(name) {
  return DETAIL_GOLDEN.output[name];
}

function sameBytes(a, b) {
  return JSON.stringify(a, null, 2) === JSON.stringify(b, null, 2);
}

function diffNote(actual, expected) {
  return sameJson(actual, expected) ? '' : ' (' + firstDifference(actual, expected) + ')';
}

/** A response with session.jevMeasurement removed (the rest must equal the golden). */
function withoutJev(response) {
  const copy = clone(response);
  if (copy && copy.session) delete copy.session.jevMeasurement;
  return copy;
}

// ---------------------------------------------------------------------------
// Dispatcher cases (Task 2)
// ---------------------------------------------------------------------------

async function dispatcherGoldenCases() {
  section('dispatcher: get_session_detail for fast-mode-off sessions is byte-identical to the pre-edit golden');
  check(DETAIL_GOLDEN.input.stored.sessionId === GOLDEN_STORED.id, 'the golden reads the logger golden\'s update-mode record');
  const store = storeWith([GOLDEN_STORED, GOLDEN_MCP]);
  const dispatcher = loadDispatcher(store.logger, [[GOLDEN_LIVE.sessionId, clone(GOLDEN_LIVE)]]);
  const outputs = {
    stored: await detailOf(dispatcher, GOLDEN_STORED.id),
    storedMcp: await detailOf(dispatcher, GOLDEN_MCP.id),
    inFlight: await detailOf(dispatcher, GOLDEN_LIVE.sessionId)
  };
  check(sameBytes(outputs.stored, goldenOutput('stored')), 'a stored autopilot session reads exactly as the golden' + diffNote(outputs.stored, goldenOutput('stored')));
  check(sameBytes(outputs.storedMcp, goldenOutput('storedMcp')), 'a stored MCP session reads exactly as the golden' + diffNote(outputs.storedMcp, goldenOutput('storedMcp')));
  check(sameBytes(outputs.inFlight, goldenOutput('inFlight')), 'an in-flight session reads exactly as the golden' + diffNote(outputs.inFlight, goldenOutput('inFlight')));
  check(!hasOwn(outputs.stored.session, 'jevMeasurement') && !hasOwn(outputs.inFlight.session, 'jevMeasurement'),
    'an off session has no jevMeasurement key');

  const chain = await replayGolden();
  const chained = await detailOf(loadDispatcher(chain.logger, []), chain.sid);
  check(sameBytes(chained, goldenOutput('stored')), 'the golden input saved by the current logger reads back as the golden output');

  const quietLive = Object.assign(clone(GOLDEN_LIVE), {
    fastMode: { enabled: true, stored: true, source: null },
    _fastPath: { off: false, offReason: null, pendingSteps: [], recent: [] },
    agentState: { iterationCount: 3, jevFast: { command: 1, steps: 0, calls: 0, jevMs: 0, latched: null } }
  });
  const quietOut = await detailFor([], GOLDEN_LIVE.sessionId, [[GOLDEN_LIVE.sessionId, quietLive]]);
  check(sameBytes(quietOut, goldenOutput('inFlight')), 'an in-flight session with the switch on and no Jev activity reads exactly as the golden');

  for (const value of [null, [], 'block', 0]) {
    const out = await detailFor([Object.assign(clone(GOLDEN_STORED), { jevMeasurement: value })], GOLDEN_STORED.id);
    check(sameBytes(out, goldenOutput('stored')),
      'a stored jevMeasurement of ' + JSON.stringify(value) + ' is not projected and the output is the golden' + diffNote(out, goldenOutput('stored')));
  }
}

async function dispatcherProjectionCases() {
  section('dispatcher: a stored jevMeasurement leaves only through the explicit projection');
  const block = sampleBlock();
  const out = await detailFor([Object.assign(clone(GOLDEN_STORED), { jevMeasurement: clone(block) })], GOLDEN_STORED.id);
  const session = (out && out.session) || {};
  check(sameJson(session.jevMeasurement, block), 'the projection returns the stored block key for key, in producer order' + diffNote(session.jevMeasurement, block));
  check(!!session.jevMeasurement && session.jevMeasurement.attempts[0].usage.inputTokens === 900,
    'inputTokens survives (the generic sanitizer drops every /token/i key)');
  check(!JSON.stringify(session.jevMeasurement || null).includes('[object]'), 'nothing in the block is flattened');
  check(sameBytes(withoutJev(out), goldenOutput('stored')),
    'apart from jevMeasurement the output is the golden output: measurement, costUsd, totalCost and its basis are unchanged' + diffNote(withoutJev(out), goldenOutput('stored')));
  check(Object.keys(session).pop() === 'jevMeasurement', 'jevMeasurement is one added key, after measurement');
  check(sameJson(session.measurement, goldenOutput('stored').session.measurement),
    'the provider measurement block is the golden one: Jev cost is never folded into costUsd (D-23)');

  section('dispatcher: missing numbers are null, never 0');
  const sparse = await detailFor([Object.assign(clone(GOLDEN_STORED), {
    jevMeasurement: { v: 1, attempts: [{ iteration: 5 }], commands: [{ command: 1 }] }
  })], GOLDEN_STORED.id);
  const expectedSparse = {
    v: 1,
    attempts: [{
      iteration: 5, command: null, decisionSource: null, jevCalled: false, servedModel: null, instrumentVersion: null,
      calibrationStatus: null, latencyMs: null, usage: { inputTokens: null, source: 'unavailable' },
      cost: { usd: null, source: 'unavailable' }, fallback: null, outcome: null, escalationReason: null, op: null, stepOutcome: null
    }],
    commands: [{ command: 1, fastSteps: null, jevCalls: null, jevMs: null, usd: { provider: null, estimate: null }, escalations: {} }]
  };
  check(sameJson(sparse.session && sparse.session.jevMeasurement, expectedSparse),
    'absent attempt and command fields project as null and unavailable, never 0' + diffNote(sparse.session && sparse.session.jevMeasurement, expectedSparse));
  const empty = await detailFor([Object.assign(clone(GOLDEN_STORED), { jevMeasurement: { v: 1 } })], GOLDEN_STORED.id);
  check(sameJson(empty.session && empty.session.jevMeasurement, { v: 1, attempts: [], commands: [] }),
    'a block without attempts or commands projects empty lists');

  section('dispatcher: hostile stored values never leave (T-68-11)');
  const hostile = await detailFor([Object.assign(clone(GOLDEN_STORED), { jevMeasurement: hostileBlock() })], GOLDEN_STORED.id);
  check(sameJson(hostile.session && hostile.session.jevMeasurement, hostileExpected()),
    'only allowlisted keys and closed-vocabulary values are projected' + diffNote(hostile.session && hostile.session.jevMeasurement, hostileExpected()));
  check(!containsMark(hostile), 'no label, url, title, goal or page text marker anywhere in the output');
  const many = { v: 1, attempts: [], commands: [] };
  for (let i = 1; i <= 130; i += 1) {
    many.attempts.push(sampleAttempt(i));
    many.commands.push(sampleCommand(i));
  }
  const capped = await detailFor([Object.assign(clone(GOLDEN_STORED), { jevMeasurement: many })], GOLDEN_STORED.id);
  const cappedBlock = blockOf(capped.session);
  check(cappedBlock.attempts.length === 100 && cappedBlock.attempts[0].iteration === 31 && cappedBlock.commands.length === 100 &&
    cappedBlock.commands[0].command === 31, 'the projection keeps the newest 100 attempts and commands');
}

async function dispatcherMarkerCases() {
  section('dispatcher: decisionSource only for fast steps; their params never leave');
  const record = clone(GOLDEN_STORED);
  record.actionHistory[0].decisionSource = 'llm';
  record.actionHistory[1].decisionSource = 'jev';
  record.actionHistory[1].params = Object.assign({}, record.actionHistory[1].params, FAST_PARAMS);
  record.actionHistory[2].decisionSource = true;
  record.actionHistory[3].decisionSource = 'JEV';
  const out = await detailFor([record], record.id);
  const expected = clone(goldenOutput('stored'));
  expected.session.actionHistory[1].decisionSource = 'jev';
  check(sameBytes(out, expected), 'only the fast step gains decisionSource:\'jev\', after its existing fields; nothing else changes' + diffNote(out, expected));
  check(!FAST_PARAM_NAMES.test(JSON.stringify(out)) && !containsMark(out), 'jevHandle, expectedName and the label never leave');

  const live = clone(GOLDEN_LIVE);
  live.actionHistory.push({
    tool: 'click', params: clone(FAST_PARAMS), result: { success: true, hadEffect: true, error: null },
    timestamp: 1790726403500, iteration: 3, durationMs: 250, decisionSource: 'jev'
  });
  Object.assign(live, {
    fastMode: { enabled: true, stored: true, source: null },
    _fastPath: { off: false, offReason: null, pendingSteps: [{ op: 'click', role: 'button', label: MARK + ' Next', effect: 'progress' }], recent: [] },
    agentState: { iterationCount: 3, jevFast: { command: 1, steps: 1, calls: 1, jevMs: 120, latched: null } },
    jevMeasurement: sampleBlock()
  });
  const liveOut = await detailFor([], live.sessionId, [[live.sessionId, live]]);
  const liveExpected = clone(goldenOutput('inFlight'));
  liveExpected.session.actionCount = 3;
  liveExpected.session.currentAction = {
    tool: 'click', timestamp: 1790726403500, iteration: 3, result: { success: true }, durationMs: 250, decisionSource: 'jev'
  };
  check(sameBytes(liveOut, liveExpected), 'an in-flight fast step shows decisionSource:\'jev\' on currentAction and nothing else' + diffNote(liveOut, liveExpected));
  check(!hasOwn(liveOut.session, 'jevMeasurement'), 'the in-flight snapshot never carries jevMeasurement');
  check(!FAST_PARAM_NAMES.test(JSON.stringify(liveOut)) && !FAST_STATE_NAMES.test(JSON.stringify(liveOut)) && !containsMark(liveOut),
    'the in-flight output holds no fast-step param, fast-mode state or label');
  const llmLive = clone(GOLDEN_LIVE);
  llmLive.actionHistory[llmLive.actionHistory.length - 1].decisionSource = 'llm';
  const llmOut = await detailFor([], llmLive.sessionId, [[llmLive.sessionId, llmLive]]);
  check(sameBytes(llmOut, goldenOutput('inFlight')), 'a last action marked anything but \'jev\' reads exactly as the golden');
}

function dispatcherStaticCases() {
  section('dispatcher: one delete, one projection, no cost tracker (D-23)');
  check((DISPATCHER_SOURCE.match(/delete sanitized\.jevMeasurement;/g) || []).length === 1, 'sanitizeSessionDetail deletes the generic copy once');
  check((DISPATCHER_SOURCE.match(/projectJevMeasurement\(/g) || []).length >= 2, 'projectJevMeasurement is defined and used');
  check(!/estimateCost|CostTracker/.test(DISPATCHER_SOURCE), 'mcp-tool-dispatcher.js never names estimateCost or CostTracker');
  const start = DISPATCHER_SOURCE.indexOf('function buildInFlightSessionSnapshot(');
  const end = DISPATCHER_SOURCE.indexOf('\n}\n', start);
  check(start !== -1 && end > start && !/jevMeasurement/.test(DISPATCHER_SOURCE.slice(start, end)),
    'buildInFlightSessionSnapshot never names jevMeasurement');
  check(!/estimateCost|CostTracker|iterationTiming|buildIterationTimingRow|totalCost|costUsd/.test(FAST_PATH_SOURCE),
    'jev-fast-path.js never names the cost tracker, the v1 timing rows or the session cost fields');
}

// ---------------------------------------------------------------------------
// Measurement parity round trip (gotcha 6, T-68-26)
// ---------------------------------------------------------------------------

const PARITY_GOAL = 'Tick Alpha and go to the next step';
// A bench goal holding a run token: the 67-01 high-entropy rule makes it sensitive_goal (F5).
const PARITY_SENSITIVE_GOAL = 'Open http://127.0.0.1:53211/r/Ab3dEf9hIj2kLm5nOp8qRs/fixtures/checklist/index.html. Tick Alpha.';
const PARITY_URL = 'https://mkr.example/wizard/step-2';
const PARITY_SESSION_ID = 'session_jev_parity';

/** One 68-02 menu entry: a fast-eligible button unless overridden; labels carry the marker. */
function parityEntry(handle, over) {
  return Object.assign({
    handle,
    role: 'button',
    label: MARK + ' Button ' + handle,
    ops: ['click', 'hover'],
    inputType: null,
    autocomplete: null,
    purpose: { sensitive: false, danger: false, intent: null },
    hidden: false,
    risk: null,
    fastEligible: true,
    vaultFilled: false,
    state: { checked: null, expanded: null, selected: null, pressed: null },
    inViewport: true
  }, over || {});
}

/** The nth menu: a new signature and generation every time, so no-progress and same-state never decline. */
function parityMenu(n, recent) {
  const entries = [
    parityEntry('j1', { label: MARK + ' Next' }),
    parityEntry('j2', { role: 'checkbox', label: MARK + ' Alpha', ops: ['check_box'], inputType: 'checkbox',
      state: { checked: false, expanded: null, selected: null, pressed: null } })
  ];
  return {
    success: true,
    generation: 'gen' + n + 'abcd-' + n,
    url: PARITY_URL,
    title: MARK + ' Wizard',
    visibleText: MARK + ' step ' + n,
    moreBelow: false,
    signature: 'sig-' + n,
    count: entries.length,
    truncated: false,
    entries,
    recentHandles: (Array.isArray(recent) ? recent : []).map(() => null)
  };
}

function parityTarget(request, label) {
  const element = request.elements.find((e) => e.label === label);
  return element ? element.id : gateway.CATCH_ALL;
}

/** The three decide answers, in order: a calibrated click, a below-threshold click, a timeout fallback. */
function parityAnswers() {
  return [
    (request) => ({ body: gateway.calibratedBody(request, {
      operation: { choice: 'click' },
      target: { choice: parityTarget(request, MARK + ' Next') }
    }) }),
    (request) => ({ body: gateway.calibratedBody(request, {
      operation: { choice: 'click', confidence: 0.5 },
      target: { choice: parityTarget(request, MARK + ' Next') }
    }) }),
    () => ({ status: 504, body: gateway.fallbackBody('timeout', 504) })
  ];
}

/** Fake fast-path deps and a real FsbJevClient over the fake gateway (held timers); each decide takes 120 ms. */
function parityRig() {
  const clock = { t: 1790726500000 };
  const answers = parityAnswers();
  const log = { menus: 0, snapshots: 0 };
  const deps = {
    now: () => clock.t,
    readSwitch: () => Promise.resolve(true),
    requestMenu: (_tabId, options) => {
      log.menus += 1;
      return Promise.resolve(parityMenu(log.menus, options && options.recent));
    },
    requestSnapshot: () => {
      log.snapshots += 1;
      return Promise.resolve({ success: true, markdownSnapshot: 'SNAP ' + MARK + ' e1 button' });
    }
  };
  const client = gateway.makeClient((request) => {
    clock.t += 120;
    const next = answers.shift();
    return next ? next(request) : { status: 503, body: gateway.fallbackBody('busy', 503) };
  }, { now: () => clock.t });
  deps.jevClient = client;
  return { clock, deps, client, log };
}

function paritySession(clock) {
  const history = new ActionHistory();
  const seed = LOGGER_GOLDEN.input.firstSave.data;
  return {
    sessionId: PARITY_SESSION_ID,
    status: 'running',
    mode: 'autopilot',
    task: PARITY_GOAL,
    tabId: 41,
    tabIds: [41],
    tabCount: 1,
    startTime: clock.t,
    commandCount: 1,
    commands: [PARITY_GOAL],
    uiSurface: 'sidepanel',
    fastMode: { enabled: true, stored: true, source: null },
    messages: [{ role: 'system', content: 'system prompt' }, { role: 'user', content: PARITY_GOAL }],
    agentState: { iterationCount: 0 },
    iterationCount: 0,
    totalCost: seed.totalCost,
    totalInputTokens: seed.totalInputTokens,
    totalOutputTokens: seed.totalOutputTokens,
    iterationTiming: clone(seed.iterationTiming),
    measurementSummary: clone(seed.measurementSummary),
    _actionHistory: history,
    actionHistory: history.events
  };
}

/** One LLM turn with one tool call, as the loop records it, then the real observeTools. */
function parityLlmTurn(session, clock, iteration, name, args) {
  clock.t += 1000;
  const callId = 'call_llm_' + iteration;
  session._actionHistory.push({
    tool: name, params: clone(args), result: { success: true, hadEffect: true, error: null },
    timestamp: clock.t, iteration, durationMs: 300
  });
  session.actionHistory = session._actionHistory.events;
  session.iterationCount = iteration;
  FsbFastPath.observeTools(session, [{ id: callId, name, args }],
    [{ callId, name, result: { success: true, hadEffect: true, error: null, navigationTriggered: false, result: { success: true } } }]);
}

/** The loop's dispatch of one fast step, its actionHistory event, then the real afterStep with a verified success. */
function parityFastStep(session, clock, out) {
  clock.t += 250;
  session._actionHistory.push({
    tool: out.toolCall.name, params: clone(out.toolCall.args), result: { success: true, hadEffect: true, error: null },
    timestamp: clock.t, iteration: out.step.iteration, durationMs: 250
  });
  session.actionHistory = session._actionHistory.events;
  session.iterationCount = out.step.iteration;
  FsbFastPath.afterStep(session, out.step, [{
    callId: out.step.callId,
    name: out.step.name,
    result: { success: true, hadEffect: true, error: null, navigationTriggered: false,
      result: { success: true, verification: { verified: true, changes: ['dom'] } } }
  }]);
}

/** Every key path, arrays collapsed to their element shape ('[]'); empty objects and arrays are paths too. */
function keyPaths(value, prefix, out) {
  const paths = out || new Set();
  const at = prefix || '';
  if (Array.isArray(value)) {
    if (value.length === 0) paths.add(at + '[]');
    for (const item of value) keyPaths(item, at + '[]', paths);
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) paths.add(at + '{}');
    for (const key of keys) keyPaths(value[key], at ? at + '.' + key : key, paths);
  } else {
    paths.add(at);
  }
  return paths;
}

function samePaths(a, b) {
  const left = Array.from(keyPaths(a)).sort();
  const right = Array.from(keyPaths(b)).sort();
  return left.length === right.length && left.every((p, i) => p === right[i]);
}

/** Whether producer, stored and projected blocks agree on every attempt and command key path and value. */
function parityHolds(producer, stored, projected) {
  const lists = ['attempts', 'commands'];
  for (const list of lists) {
    const a = producer && producer[list];
    const b = stored && stored[list];
    const c = projected && projected[list];
    if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(c) || a.length === 0) return false;
    if (a.length !== b.length || a.length !== c.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!samePaths(a[i], b[i]) || !samePaths(a[i], c[i])) return false;
    }
  }
  return samePaths(producer, stored) && samePaths(producer, projected) && deepEqual(producer, stored) && deepEqual(producer, projected);
}

/** A block saved through a fresh real logger (new mode) and read back through the real get_session_detail. */
async function storeAndProject(block) {
  const clock = { t: 1790726600000 };
  const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] });
  const logger = loadLogger(storage, clock);
  logger.logSessionStart('session_jev_parity_probe', PARITY_GOAL, 41);
  await logger.saveSession('session_jev_parity_probe', { task: PARITY_GOAL, mode: 'autopilot', startTime: clock.t, jevMeasurement: block });
  const stored = clone(storage.store.fsbSessionLogs.session_jev_parity_probe);
  const out = await detailOf(loadDispatcher(logger, []), 'session_jev_parity_probe');
  return { stored: stored && stored.jevMeasurement, projected: out && out.session && out.session.jevMeasurement };
}

async function parityRoundTrip() {
  section('measurement parity round trip: real producers -> real logger -> real get_session_detail');
  const rig = parityRig();
  const session = paritySession(rig.clock);
  const seed = {
    totalCost: session.totalCost,
    iterationTiming: clone(session.iterationTiming),
    measurementSummary: clone(session.measurementSummary)
  };
  const turn = (iteration) => FsbFastPath.beforeTurn(session, { sessionId: session.sessionId, iteration, deps: rig.deps });
  const loggerClock = { t: rig.clock.t };
  const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] });
  const logger = loadLogger(storage, loggerClock);
  logger.logSessionStart(PARITY_SESSION_ID, PARITY_GOAL, 41);

  // Command 1: the LLM's first turn, one acted click, an LLM turn, a
  // below-threshold answer, an LLM turn, a timeout fallback.
  const outs = [];
  outs.push(await turn(1));
  parityLlmTurn(session, rig.clock, 1, 'click', { selector: '#start' });
  const acted = await turn(2);
  outs.push(acted);
  const actedOk = !!acted.toolCall && acted.toolCall.name === 'click' && acted.toolCall.args.jevHandle === 'j1';
  if (actedOk) parityFastStep(session, rig.clock, acted);
  parityLlmTurn(session, rig.clock, 3, 'get_page_snapshot', {});
  outs.push(await turn(4));
  parityLlmTurn(session, rig.clock, 5, 'scroll', { direction: 'down' });
  outs.push(await turn(6));
  check(outs[0].decline === 'first_llm_turn' && actedOk && outs[2].decline === 'operation_below_threshold' && outs[3].decline === 'timeout',
    'command 1 runs: first LLM turn, an acted click, a below-threshold escalation, a timeout fallback (' +
    outs.map((o) => o.decline || (o.toolCall && o.toolCall.name)).join(', ') + ')');

  loggerClock.t = rig.clock.t;
  await logger.saveSession(PARITY_SESSION_ID, session);
  const producerA = clone(session.jevMeasurement);
  const storedA = clone(storage.store.fsbSessionLogs[PARITY_SESSION_ID]);
  const outA = await detailOf(loadDispatcher(logger, []), PARITY_SESSION_ID);
  check(parityHolds(producerA, storedA && storedA.jevMeasurement, outA && outA.session && outA.session.jevMeasurement),
    'after command 1 (new mode) the producer block, the stored record and get_session_detail agree');

  // Command 2: a sensitive goal (a local buildRequest refusal).
  session.commandCount = 2;
  session.task = PARITY_SENSITIVE_GOAL;
  session.commands = session.commands.concat([PARITY_SENSITIVE_GOAL]);
  session.agentState = { iterationCount: 0 };
  const firstOfSecond = await turn(7);
  parityLlmTurn(session, rig.clock, 7, 'click', { selector: '#summary' });
  const sensitive = await turn(8);
  check(firstOfSecond.decline === 'first_llm_turn' && sensitive.decline === 'sensitive_goal',
    'command 2 runs: first LLM turn, then a sensitive_goal decline (' + firstOfSecond.decline + ', ' + sensitive.decline + ')');
  check(rig.client.calls.length === 3 && rig.log.menus === 4, 'three decides and four menus in all (' + rig.client.calls.length + ', ' + rig.log.menus + ')');

  loggerClock.t = rig.clock.t;
  await logger.saveSession(PARITY_SESSION_ID, session);
  const producer = clone(session.jevMeasurement);
  const storedRecord = clone(storage.store.fsbSessionLogs[PARITY_SESSION_ID]);
  const stored = storedRecord && storedRecord.jevMeasurement;
  const out = await detailOf(loadDispatcher(logger, []), PARITY_SESSION_ID);
  const projected = out && out.session && out.session.jevMeasurement;

  const attempts = blockOf({ jevMeasurement: producer }).attempts;
  check(sameJson(attempts.map((a) => [a.outcome, a.escalationReason, a.fallback, a.stepOutcome, a.calibrationStatus]), [
    ['acted', null, null, 'progress', 'calibrated'],
    ['escalated', 'operation_below_threshold', null, null, 'calibrated'],
    ['escalated', 'timeout', 'timeout', null, null],
    ['declined', 'sensitive_goal', 'sensitive_goal', null, null]
  ]), 'the producer wrote one attempt per outcome (' + JSON.stringify(attempts.map((a) => [a.outcome, a.escalationReason])) + ')');
  const expectedCommands = [
    { command: 1, fastSteps: 1, jevCalls: 3, jevMs: 360, usd: { provider: 0.0000378 + 0.0000378, estimate: null },
      escalations: { operation_below_threshold: 1, timeout: 1 } },
    { command: 2, fastSteps: 0, jevCalls: 0, jevMs: null, usd: { provider: null, estimate: null }, escalations: { sensitive_goal: 1 } }
  ];
  check(sameJson(producer && producer.commands, expectedCommands),
    'the producer wrote per-command totals with null, never 0, where nothing arrived' + diffNote(producer && producer.commands, expectedCommands));
  check(producer && stored && projected && Array.from(keyPaths(producer)).sort().join(',') === Array.from(keyPaths(stored)).sort().join(',') &&
    Array.from(keyPaths(producer)).sort().join(',') === Array.from(keyPaths(projected)).sort().join(','),
    'the block has the same key paths at all three stages');
  check(parityHolds(producer, stored, projected), 'measurement parity round trip');
  if (!parityHolds(producer, stored, projected)) {
    console.error('    producer: ' + JSON.stringify(producer));
    console.error('    stored:   ' + JSON.stringify(stored));
    console.error('    projected:' + JSON.stringify(projected));
  }

  section('measurement parity round trip: the comparison is not vacuous');
  const probe = await storeAndProject(clone(producer));
  check(parityHolds(producer, probe.stored, probe.projected), 'self-test: the producer block alone round-trips');
  const extraAttempt = clone(producer);
  extraAttempt.attempts[0].jevNewField = 1;
  const extraAttemptRun = await storeAndProject(extraAttempt);
  check(!parityHolds(extraAttempt, extraAttemptRun.stored, extraAttemptRun.projected),
    'self-test: an attempt key the producer writes but the allowlists lack breaks parity');
  const extraCommand = clone(producer);
  extraCommand.commands[0].jevNewTotal = 1;
  const extraCommandRun = await storeAndProject(extraCommand);
  check(!parityHolds(extraCommand, extraCommandRun.stored, extraCommandRun.projected),
    'self-test: a command key the producer writes but the allowlists lack breaks parity');
  const missing = clone(producer);
  for (const attempt of missing.attempts) delete attempt.stepOutcome;
  const missingRun = await storeAndProject(missing);
  check(!parityHolds(missing, missingRun.stored, missingRun.projected),
    'self-test: an allowlist key the producer never writes breaks parity');

  section('measurement parity round trip: cost, timing rows, markers and the action marker');
  check(session.totalCost === seed.totalCost && sameJson(session.iterationTiming, seed.iterationTiming) &&
    sameJson(session.measurementSummary, seed.measurementSummary),
    'the fast path adds no v1 timing row and leaves totalCost and the provider summary untouched');
  const plain = await detailFor([withoutKey(storedRecord, 'jevMeasurement')], PARITY_SESSION_ID);
  check(sameBytes(withoutJev(out), plain), 'apart from jevMeasurement the output is that of the same record without it (no Jev cost in costUsd, totalCost or measurement)');
  check(!containsMark(stored) && !containsMark(out), 'no menu label, url, title or page text in the stored block or the output');
  check(!FAST_STATE_NAMES.test(JSON.stringify(storedRecord)) && !FAST_STATE_NAMES.test(JSON.stringify(out)),
    'fastMode, _fastPath and agentState.jevFast are never stored or projected');
  const storedFast = (storedRecord.actionHistory || []).filter((a) => a.decisionSource === 'jev');
  check(storedFast.length === 1 && storedFast[0].params && storedFast[0].params.jevHandle === 'j1' &&
    (storedRecord.actionHistory || []).length === 5,
    'the stored history keeps every action and marks only the fast step');
  const projectedHistory = (out.session && out.session.actionHistory) || [];
  check(projectedHistory.length === 5 && projectedHistory.filter((a) => a.decisionSource === 'jev').length === 1 &&
    projectedHistory[1].decisionSource === 'jev', 'get_session_detail marks only the fast step');
  check(!FAST_PARAM_NAMES.test(JSON.stringify(out)), 'the fast step\'s jevHandle and expectedName never leave');

  const liveOut = await detailFor([], PARITY_SESSION_ID, [[PARITY_SESSION_ID, session]]);
  check(liveOut.inFlight === true && !hasOwn(liveOut.session, 'jevMeasurement') && !FAST_STATE_NAMES.test(JSON.stringify(liveOut)) &&
    !hasOwn(liveOut.session.currentAction, 'decisionSource'),
    'the live session reads in flight without the block, and its last (LLM) action has no marker');
}

// ---------------------------------------------------------------------------
// Loop: a fast iteration adds no v1 timing row and no provider cost (D-23)
// ---------------------------------------------------------------------------

/**
 * The real runAgentIteration (tests/fixtures/agent-loop-fast-harness.js) with
 * the switch on: an LLM click, one code-built fast click, then a catch-all
 * answer that hands the task back to the LLM, which completes it. The session
 * it leaves is saved through the real logger and read back through the real
 * get_session_detail.
 */
async function loopTimingCase() {
  section('loop: a fast iteration adds no v1 timing row and no provider cost (D-23)');
  const H = require('./fixtures/agent-loop-fast-harness.js');
  const clock = { t: 1790726700000 };
  let menus = 0;
  const deps = {
    now: () => clock.t,
    readSwitch: () => Promise.resolve(true),
    requestMenu: (_tabId, options) => {
      menus += 1;
      return Promise.resolve(parityMenu(menus, options && options.recent));
    },
    requestSnapshot: () => Promise.resolve({ success: true, markdownSnapshot: 'SNAP e1 button' })
  };
  const answers = [
    (request) => ({ body: gateway.calibratedBody(request, {
      operation: { choice: 'click' },
      target: { choice: parityTarget(request, MARK + ' Next') }
    }) }),
    (request) => ({ body: gateway.calibratedBody(request, {
      operation: { choice: gateway.CATCH_ALL },
      target: { choice: gateway.CATCH_ALL }
    }) })
  ];
  let decides = 0;
  const h = H.createHarness({
    loadFastPath: true,
    storage: { fsbJevFastModeEnabled: true },
    sessionPatch: { fastMode: { enabled: true, stored: true, source: null } },
    deps,
    jevResponder: (request) => {
      decides += 1;
      clock.t += 120;
      return answers[Math.min(decides, answers.length) - 1](request);
    },
    contentResponder: (message) => {
      if (message && message.action === 'executeAction' && message.params && message.params.jevHandle) return { success: true };
      return H.defaultContentResponder(message);
    },
    providerScript: [
      H.openAiToolResponse('resp_llm_1', [{ id: 'call_llm_1', name: 'click', args: { selector: '#start' } }]),
      H.openAiToolResponse('resp_llm_done', [{ id: 'call_llm_done', name: 'complete_task', args: { summary: 'Wizard finished' } }])
    ]
  });
  let session = null;
  const costs = [];
  const rows = [];
  try {
    for (let i = 0; i < 3; i += 1) {
      await h.step();
      costs.push([h.session.totalCost, h.session.agentState.totalCost]);
      rows.push(Array.isArray(h.session.iterationTiming) ? h.session.iterationTiming.length : 0);
    }
    session = h.session;
  } finally {
    h.dispose();
  }
  const fastEvents = (session.actionHistory || []).filter((a) => a.decisionSource === 'jev');
  check(h.providerRequests.length === 2 && decides === 2 && fastEvents.length === 1 && fastEvents[0].iteration === 2,
    'iteration 2 is the one fast step; iterations 1 and 3 call the LLM (' + h.providerRequests.length + ' provider calls, ' + decides + ' decides)');
  check(sameJson(rows, [1, 1, 2]) && sameJson(session.iterationTiming.map((row) => row.iteration), [1, 3]),
    'the fast iteration adds no v1 timing row (rows after each step ' + JSON.stringify(rows) + ')');
  check(costs[0][0] > 0 && costs[1][0] === costs[0][0] && costs[1][1] === costs[0][1] && costs[2][0] > costs[1][0],
    'the fast iteration adds nothing to totalCost or agentState.totalCost (' + JSON.stringify(costs) + ')');
  const block = blockOf(session);
  check(block.attempts.length === 2 && block.commands.length === 1 && block.commands[0].usd.provider === 0.0000378 + 0.0000378 &&
    session.measurementSummary && session.measurementSummary.iterations === 2,
    'Jev cost is recorded only in jevMeasurement; the provider summary counts the two LLM iterations');

  const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] });
  const logger = loadLogger(storage, { t: clock.t });
  logger.logSessionStart('session_harness', session.task, session.tabId);
  await logger.saveSession('session_harness', session);
  const out = await detailOf(loadDispatcher(logger, []), 'session_harness');
  const m = (out && out.session && out.session.measurement) || {};
  check(m.recorded === true && m.iterations === 2 && Array.isArray(m.perIteration) &&
    sameJson(m.perIteration.map((row) => row.iteration), [1, 3]),
    'get_session_detail reports two measured LLM iterations; the fast iteration is not a measurement row');
  check(sameJson(out.session.jevMeasurement, clone(session.jevMeasurement)),
    'the loop\'s jevMeasurement reaches get_session_detail unchanged');
  const projectedHistory = out.session.actionHistory || [];
  check(projectedHistory.filter((a) => a.decisionSource === 'jev').length === 1 && !FAST_PARAM_NAMES.test(JSON.stringify(out)) &&
    !FAST_STATE_NAMES.test(JSON.stringify(out)) && !containsMark(out),
    'the loop session projects one marked fast step and no fast params, fast-mode state or labels');
}

async function main() {
  await loggerGoldenCases();
  await loggerPersistCases();
  await loggerMarkerCases();
  loggerStaticCases();
  await dispatcherGoldenCases();
  await dispatcherProjectionCases();
  await dispatcherMarkerCases();
  dispatcherStaticCases();
  await parityRoundTrip();
  await loopTimingCase();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('FAIL: unexpected error', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
