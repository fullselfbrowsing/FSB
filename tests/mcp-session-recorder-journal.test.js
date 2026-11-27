'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const recorder = require('../extension/utils/mcp-session-recorder.js');

function makeStorage() {
  const state = {};
  return {
    state,
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      const out = {};
      names.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(state, key)) out[key] = state[key];
      });
      return out;
    },
    async set(values) { Object.assign(state, values || {}); },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete state[key]; });
    }
  };
}

function makeJournalStub() {
  const calls = {
    dispatches: [], outcomes: [], gaps: [], degradedReasons: [],
    hasCall: 0, hasCallArgs: [], begins: [], ends: [], prunes: 0, initializeArgs: [], alarmArgs: []
  };
  let duplicate = false;
  let hasCallError = null;
  return {
    IDLE_ALARM_PREFIX: 'fsbMcpJournal:idle:',
    RETENTION_ALARM: 'fsbMcpJournal:retention',
    calls,
    setDuplicate(value) { duplicate = value === true; },
    setHasCallError(value) { hasCallError = value || null; },
    validRunSidecar(value) {
      return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
    },
    async hasCall(agentId, recordingRunId, recordingCallId) {
      calls.hasCall++;
      calls.hasCallArgs.push({ agentId, recordingRunId, recordingCallId });
      if (hasCallError) throw hasCallError;
      return duplicate;
    },
    async hasCorrelation() { return false; },
    async beginCall(identity, leaseMs) {
      calls.begins.push({ identity, leaseMs });
      return { accepted: true };
    },
    async endCall(identity) {
      calls.ends.push(identity);
      return { ended: true };
    },
    async recordDispatch(value) { calls.dispatches.push(value); return { recorded: true }; },
    async recordTaskOutcome(value, outcome) {
      calls.outcomes.push({ value, outcome });
      return { recorded: true };
    },
    async markRecordingGap(identity, error) { calls.gaps.push({ identity, error }); },
    async degradeOpenRuns(reason) { calls.degradedReasons.push(reason); return { degraded: 1, ids: ['open-run'] }; },
    async prune() { calls.prunes++; return { removed: 0, ids: [] }; },
    async initialize(retentionDays) { calls.initializeArgs.push(retentionDays); },
    async handleAlarm(alarm, retentionDays) {
      calls.alarmArgs.push({ alarm, retentionDays });
      return { handled: false };
    }
  };
}

test('recorder forwards compact durable call leases without inspecting request payloads', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  const identity = {
    agentId: 'agent-journal',
    recordingRunId: 'recording-run-journal',
    recordingCallId: 'recording-call-lease',
    client: 'Codex',
    task: 'mcp:trigger',
    taskSource: 'tool',
    tool: 'trigger',
    ignored: { secret: 'must not be forwarded' }
  };

  assert.equal((await recorder.beginCall(identity, 125_000)).accepted, true);
  assert.equal((await recorder.endCall(identity)).ended, true);
  assert.equal(journalStub.calls.begins.length, 1);
  assert.deepEqual(journalStub.calls.begins[0], {
    identity: {
      agentId: identity.agentId,
      recordingRunId: identity.recordingRunId,
      recordingCallId: identity.recordingCallId,
      client: 'Codex',
      task: 'mcp:trigger',
      taskSource: 'tool',
      tool: 'trigger'
    },
    leaseMs: 125_000
  });
  assert.deepEqual(journalStub.calls.ends[0], journalStub.calls.begins[0].identity);

  await recorder._applyPolicyForTests(false, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  assert.equal((await recorder.beginCall({ ...identity, recordingCallId: 'recording-call-disabled' }, 120_000)).accepted, false);
  assert.equal(journalStub.calls.begins.length, 1);
});

async function reset(journalStub) {
  await recorder._drainForTests();
  recorder._resetForTests();
  recorder._setStorageShim(makeStorage());
  recorder._setLocalStorageShim(makeStorage());
  recorder._setAlarmShim({ async create() {}, async clear() {}, async get() { return null; } });
  recorder._setTimeShim({ now: () => 1_800_000_000_000 });
  globalThis.FsbMcpLatticeJournal = journalStub;
  globalThis.FsbLatticeReplay = null;
  globalThis.automationLogger = {
    async withSessionMutationLock(fn) { return fn(); },
    async pruneMcpSessions() { return { removed: 0, ids: [] }; },
    logSessionStart() {},
    logAction() {},
    getSessionLogs() { return [{ data: {} }]; },
    async saveSession() { return true; },
    async updateSessionOutcome() { return true; }
  };
}

function journalEntry(overrides = {}) {
  const payload = overrides.payload || {
    agentId: 'agent-journal',
    recordingRunId: 'recording-run-journal',
    recordingCallId: overrides.recordingCallId || 'recording-call-journal',
    params: overrides.params || { selector: '#button' },
    visualSession: { visualReason: 'Journal task', client: 'Codex' }
  };
  return {
    client: 'Codex',
    tool: overrides.tool || 'click',
    requestPayload: payload,
    response: Object.prototype.hasOwnProperty.call(overrides, 'response')
      ? overrides.response
      : { success: true, clicked: true },
    success: overrides.success !== false,
    dispatcher_route: 'message',
    tabId: 44,
    replayContext: { targetUrl: 'https://example.test', targetOrigin: 'https://example.test' }
  };
}

test('v2 recorder gates before sanitization, redacts once, preserves legacy clients, and never switches a live backend', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);

  let disabledPayloadReads = 0;
  await recorder._applyPolicyForTests(false, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  recorder.recordDispatch({
    tool: 'click',
    get requestPayload() {
      disabledPayloadReads++;
      throw new Error('disabled calls must not inspect payloads');
    }
  });
  await recorder._drainForTests();
  assert.equal(disabledPayloadReads, 0);

  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  let excludedPayloadReads = 0;
  recorder.recordDispatch({
    tool: 'run_task',
    get requestPayload() {
      excludedPayloadReads++;
      throw new Error('run_task must stay automation-recorder-owned');
    }
  });
  await recorder._drainForTests();
  assert.equal(excludedPayloadReads, 0);

  let unauthenticatedDeepReads = 0;
  recorder.recordDispatch({
    tool: 'mcp:read-page',
    requestPayload: {
      agentId: '',
      get params() {
        unauthenticatedDeepReads++;
        throw new Error('unauthenticated calls must not materialize params');
      }
    }
  });
  await recorder._drainForTests();
  assert.equal(unauthenticatedDeepReads, 0);

  journalStub.setDuplicate(true);
  let duplicateDeepReads = 0;
  recorder.recordDispatch(journalEntry({
    payload: {
      agentId: 'agent-journal',
      recordingRunId: 'recording-run-journal',
      recordingCallId: 'recording-call-duplicate',
      get params() {
        duplicateDeepReads++;
        throw new Error('alias-suppressed calls must not sanitize');
      }
    }
  }));
  await recorder._drainForTests();
  assert.equal(duplicateDeepReads, 0);
  assert.equal(journalStub.calls.dispatches.length, 0);
  assert.deepEqual(journalStub.calls.hasCallArgs.at(-1), {
    agentId: 'agent-journal',
    recordingRunId: 'recording-run-journal',
    recordingCallId: 'recording-call-duplicate'
  });

  journalStub.setDuplicate(false);
  recorder.recordDispatch(journalEntry({
    tool: 'mcp:read-page',
    recordingCallId: 'recording-call-redacted',
    params: {
      selector: '#password',
      password: 'hunter2',
      text: 'hunter2'
    },
    response: {
      success: true,
      token: 'response-secret',
      value: 'hunter2',
      ordinary: 'keep me'
    }
  }));
  await recorder._drainForTests();
  assert.equal(journalStub.calls.dispatches.length, 1);
  const retained = journalStub.calls.dispatches[0];
  assert.equal(retained.requestPayload.params.password, '[REDACTED]');
  assert.equal(retained.requestPayload.params.text, '[REDACTED]');
  assert.equal(retained.response.token, '[REDACTED]');
  assert.equal(retained.response.value, '[REDACTED]');
  assert.equal(retained.response.ordinary, 'keep me');
  assert.equal(retained.requestPayload.recordingRunId, 'recording-run-journal');

  const hasCallCountBeforeOutcome = journalStub.calls.hasCall;
  journalStub.setDuplicate(true);
  recorder.recordTaskOutcome({
    tool: 'complete_task',
    params: { summary: 'Journal task complete' },
    payload: {
      agentId: 'agent-journal',
      recordingRunId: 'recording-run-journal',
      recordingCallId: 'recording-call-redacted',
      params: { summary: 'Journal task complete' }
    },
    response: { success: true, status: 'completed' }
  });
  await recorder._drainForTests();
  assert.equal(journalStub.calls.hasCall, hasCallCountBeforeOutcome,
    'terminal projection must reach the journal even when its tool.call already exists');
  assert.equal(journalStub.calls.outcomes.length, 1);
  journalStub.setDuplicate(false);

  await reset(journalStub);
  recorder.recordDispatch(journalEntry({
    payload: {
      agentId: 'agent-legacy-client',
      params: { selector: '#legacy' },
      visualSession: { visualReason: 'Legacy task', client: 'Claude' }
    }
  }));
  await recorder._drainForTests();
  assert.equal(journalStub.calls.dispatches.length, 1, 'a client without recordingRunId must not enter v2');
  assert.equal(Object.keys(recorder._peekOpenSessions()).length, 1);

  await reset(journalStub);
  journalStub.calls.dispatches.length = 0;
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_LEGACY);
  recorder.recordDispatch(journalEntry({
    payload: {
      agentId: 'agent-fixed-backend',
      recordingRunId: 'fixed-backend-run',
      recordingCallId: 'fixed-backend-call-one',
      params: { selector: '#one' },
      visualSession: { visualReason: 'Fixed backend task', client: 'Codex' }
    }
  }));
  await recorder._drainForTests();
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  recorder.recordDispatch(journalEntry({
    tool: 'mcp:read-page',
    payload: {
      agentId: 'agent-fixed-backend',
      recordingRunId: 'fixed-backend-run',
      recordingCallId: 'fixed-backend-call-two',
      params: {}
    }
  }));
  await recorder._drainForTests();
  assert.equal(journalStub.calls.dispatches.length, 0);
  const liveLegacy = Object.values(recorder._peekOpenSessions())[0];
  assert.equal(liveLegacy.recordingRunId, 'fixed-backend-run');
  assert.equal(liveLegacy.actionHistory.length, 2);

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('read-only wait tools retain replay results while mutating actions stay compact', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);

  const waitCases = [
    {
      tool: 'wait_for_stable',
      response: {
        success: true,
        stable: false,
        waitTime: 5000,
        changeCount: 12,
        networkRequestCount: 3,
        reason: 'timeout',
        stability: 'poor'
      }
    },
    {
      tool: 'waitForDOMStable',
      response: {
        success: true,
        stable: true,
        waitTime: 650,
        changeCount: 2,
        networkRequestCount: 1,
        reason: 'stable',
        stability: 'good'
      }
    },
    {
      tool: 'wait_for_element',
      response: {
        success: false,
        found: false,
        selector: '#missing',
        waitTime: 5001
      }
    },
    {
      tool: 'waitForElement',
      response: {
        success: true,
        found: true,
        selector: '#ready',
        waitTime: 200
      }
    }
  ];

  waitCases.forEach((entry, index) => {
    recorder.recordDispatch(journalEntry({
      tool: entry.tool,
      recordingCallId: `recording-call-wait-${index}`,
      response: entry.response,
      success: entry.response.success
    }));
  });
  await recorder._drainForTests();

  assert.equal(journalStub.calls.dispatches.length, waitCases.length);
  waitCases.forEach((entry, index) => {
    assert.deepEqual(journalStub.calls.dispatches[index].response, entry.response);
    assert.equal(journalStub.calls.dispatches[index].resultProjection, 'journal-full-v1');
  });

  recorder.recordDispatch(journalEntry({
    tool: 'click',
    recordingCallId: 'recording-call-mutating-action',
    response: {
      success: true,
      clicked: true,
      stable: false,
      reason: 'action-only-detail',
      change_report: { changedNodes: 17 },
      snapshot: { html: '<main>large payload</main>' }
    }
  }));
  await recorder._drainForTests();

  assert.deepEqual(journalStub.calls.dispatches[waitCases.length].response, {
    success: true,
    clicked: true
  });
  assert.equal(
    journalStub.calls.dispatches[waitCases.length].resultProjection,
    'journal-action-v1'
  );

  assert.deepEqual(recorder.projectJournalResult({
    success: true,
    clicked: true,
    change_report: { changedNodes: 17 }
  }, {}, 'journal-action-v1'), {
    success: true,
    clicked: true
  });
  assert.deepEqual(recorder.projectJournalResult({
    success: true,
    value: 'complete read result'
  }, {}, 'journal-full-v1'), {
    success: true,
    value: 'complete read result'
  });
  assert.deepEqual(recorder.projectJournalResult({
    success: true,
    change_report: { legacy: true }
  }, {}, undefined), {
    success: true,
    change_report: { legacy: true }
  });

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('public observability and status aliases retain their complete journal results', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);

  const readTools = [
    'get_task_status',
    'mcp:get-status',
    'list_sessions',
    'mcp:list-sessions',
    'get_session_detail',
    'mcp:get-session',
    'get_session_replay',
    'mcp:get-session-replay',
    'get_logs',
    'mcp:get-logs',
    'get_memory_stats',
    'mcp:get-memory'
  ];

  readTools.forEach((tool, index) => {
    recorder.recordDispatch(journalEntry({
      tool,
      recordingCallId: `recording-call-observability-${index}`,
      response: {
        success: true,
        status: 'completed',
        requestedData: { tool, rows: [{ id: index }] }
      }
    }));
  });
  recorder.recordDispatch(journalEntry({
    tool: 'replay_session',
    recordingCallId: 'recording-call-replay-session',
    response: {
      success: true,
      status: 'pending_approval',
      requestedData: { mustNotBeRetained: true }
    }
  }));
  await recorder._drainForTests();

  readTools.forEach((tool, index) => {
    const dispatch = journalStub.calls.dispatches[index];
    assert.equal(dispatch.resultProjection, 'journal-full-v1', tool);
    assert.deepEqual(dispatch.response.requestedData, { tool, rows: [{ id: index }] });
  });
  const replayDispatch = journalStub.calls.dispatches[readTools.length];
  assert.equal(replayDispatch.resultProjection, 'journal-action-v1');
  assert.equal(replayDispatch.response.requestedData, undefined);

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('journal snapshots classify tool, capability, and visual task titles', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);

  recorder.recordDispatch(journalEntry({
    tool: 'mcp:read-page',
    payload: {
      agentId: 'agent-title-source',
      recordingRunId: 'recording-run-title-source',
      recordingCallId: 'recording-call-title-tool',
      params: {}
    }
  }));
  recorder.recordDispatch(journalEntry({
    tool: 'mcp:capabilities-invoke',
    payload: {
      agentId: 'agent-title-source',
      recordingRunId: 'recording-run-title-source',
      recordingCallId: 'recording-call-title-capability',
      slug: 'collect-page-data',
      params: {}
    }
  }));
  recorder.recordDispatch(journalEntry({
    tool: 'click',
    payload: {
      agentId: 'agent-title-source',
      recordingRunId: 'recording-run-title-source',
      recordingCallId: 'recording-call-title-visual',
      params: { selector: '#continue' },
      visualSession: { visualReason: 'Finish the visual workflow', client: 'Codex' }
    }
  }));
  await recorder._drainForTests();

  assert.deepEqual(journalStub.calls.dispatches.map((value) => [value.task, value.taskSource]), [
    ['mcp:read-page', 'tool'],
    ['Capability: collect-page-data', 'capability'],
    ['Finish the visual workflow', 'visual-session']
  ]);

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('recorder forwards retention policy and degrades journal runs when recording is disabled', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);
  const local = makeStorage();
  local.state[recorder.FSB_MCP_RETENTION_DAYS_KEY] = 45;
  local.state[recorder.FSB_MCP_RECORDER_BACKEND_KEY] = recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL;
  recorder._setLocalStorageShim(local);

  await recorder._startInitializationForTests();
  assert.deepEqual(journalStub.calls.initializeArgs, [45]);
  await recorder.handleAlarm({ name: journalStub.RETENTION_ALARM });
  assert.equal(journalStub.calls.alarmArgs.length, 1);
  assert.equal(journalStub.calls.alarmArgs[0].retentionDays, 45);

  await recorder._applyPolicyForTests(false, 45, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  assert.deepEqual(journalStub.calls.degradedReasons, ['recording_disabled']);

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('persisted startup opt-out rejects a terminal event queued before policy load', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);

  let releasePolicyRead;
  const policyReadGate = new Promise((resolve) => { releasePolicyRead = resolve; });
  const local = makeStorage();
  local.state[recorder.FSB_MCP_RECORDING_ENABLED_KEY] = false;
  const readPolicy = local.get.bind(local);
  local.get = async function (keys) {
    await policyReadGate;
    return readPolicy(keys);
  };
  recorder._setLocalStorageShim(local);

  let memoryWrites = 0;
  globalThis.createTaskMemory = function () { return { id: 'memory-startup-opt-out' }; };
  globalThis.memoryStorage = {
    async getAll() { return []; },
    async add() { memoryWrites++; return true; }
  };
  journalStub.recordTaskOutcome = async function (value, outcome) {
    journalStub.calls.outcomes.push({ value, outcome });
    return {
      recorded: true,
      candidate: {
        sessionId: 'session-startup-opt-out',
        agentId: 'agent-startup-opt-out',
        task: 'Do not retain this summary',
        client: 'Codex',
        startTime: 1,
        endTime: 2,
        lastUrl: null,
        actionCount: 0,
        toolNames: []
      }
    };
  };

  const initializing = recorder._startInitializationForTests();
  const params = { summary: 'Do not retain this summary' };
  recorder.recordTaskOutcome({
    tool: 'complete_task',
    params,
    payload: {
      agentId: 'agent-startup-opt-out',
      recordingRunId: 'recording-run-startup-opt-out',
      recordingCallId: 'recording-call-startup-opt-out',
      params
    },
    response: { success: true, status: 'completed' }
  });

  releasePolicyRead();
  await initializing;
  await recorder._drainForTests();
  assert.equal(recorder._getPolicyForTests().recordingEnabled, false);
  assert.equal(journalStub.calls.outcomes.length, 0,
    'the queued terminal event never reaches the journal after startup loads opt-out');
  assert.equal(memoryWrites, 0,
    'the queued terminal event never creates Task Memory after startup loads opt-out');

  recorder._resetForTests();
  delete globalThis.createTaskMemory;
  delete globalThis.memoryStorage;
  delete globalThis.FsbMcpLatticeJournal;
});

test('a hasCall read failure marks a shallow recording gap without materializing payload data', async () => {
  const journalStub = makeJournalStub();
  journalStub.setHasCallError(new Error('simulated IndexedDB read failure'));
  await reset(journalStub);

  let paramsReads = 0;
  recorder.recordDispatch(journalEntry({
    payload: {
      agentId: 'agent-gap-precheck',
      recordingRunId: 'recording-gap-precheck',
      recordingCallId: 'recording-call-gap-precheck',
      get params() {
        paramsReads++;
        throw new Error('gap handling must remain shallow');
      }
    }
  }));
  await recorder._drainForTests();

  assert.equal(paramsReads, 0);
  assert.equal(journalStub.calls.dispatches.length, 0);
  assert.equal(journalStub.calls.gaps.length, 1);
  assert.deepEqual(journalStub.calls.gaps[0].identity, {
    agentId: 'agent-gap-precheck',
    recordingRunId: 'recording-gap-precheck',
    client: 'Codex',
    tool: 'click'
  });
  assert.match(journalStub.calls.gaps[0].error.message, /IndexedDB read failure/);

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

// ---- Phase 66: per-call MCP timing (D-04) -----------------------------------

const CALL_TIMING = Object.freeze({ v: 1, receivedAt: 1_799_999_999_000, completedAt: 1_799_999_999_412, fsbMs: 412 });

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

test('journal dispatches carry only a validated call timing', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);

  const timed = journalEntry({ recordingCallId: 'recording-call-timed' });
  timed.timing = { ...CALL_TIMING };
  recorder.recordDispatch(timed);
  await recorder._drainForTests();
  assert.equal(journalStub.calls.dispatches.length, 1);
  assert.deepEqual(journalStub.calls.dispatches[0].timing, CALL_TIMING);
  assert.notStrictEqual(journalStub.calls.dispatches[0].timing, timed.timing,
    'the journal receives a fresh copy, not the caller object');

  const invalidTimings = [
    ['a negative receivedAt', { ...CALL_TIMING, receivedAt: -1 }],
    ['a string receivedAt', { ...CALL_TIMING, receivedAt: String(CALL_TIMING.receivedAt) }],
    ['completedAt before receivedAt', { ...CALL_TIMING, completedAt: CALL_TIMING.receivedAt - 1 }],
    ['version 2', { ...CALL_TIMING, v: 2 }],
    ['a fractional completedAt', { ...CALL_TIMING, completedAt: CALL_TIMING.completedAt + 0.25 }],
    ['an unsafe integer', { ...CALL_TIMING, completedAt: Number.MAX_SAFE_INTEGER + 2 }],
    ['a missing completedAt', { v: 1, receivedAt: CALL_TIMING.receivedAt }],
    ['a string', 'v1:1799999999000'],
    ['an array', [1, 2, 3]],
    ['null', null]
  ];
  for (const [index, [label, value]] of invalidTimings.entries()) {
    const entry = journalEntry({ recordingCallId: 'recording-call-invalid-' + index });
    entry.timing = value;
    recorder.recordDispatch(entry);
    await recorder._drainForTests();
    assert.equal(journalStub.calls.dispatches.length, 2 + index, `${label} still records the call`);
    assert.equal(hasOwn(journalStub.calls.dispatches.at(-1), 'timing'), false, `${label} is dropped`);
  }

  const inconsistent = journalEntry({ recordingCallId: 'recording-call-inconsistent' });
  inconsistent.timing = { ...CALL_TIMING, fsbMs: 9 };
  recorder.recordDispatch(inconsistent);
  await recorder._drainForTests();
  assert.deepEqual(journalStub.calls.dispatches.at(-1).timing, CALL_TIMING,
    'an inconsistent fsbMs is kept but recomputed from completedAt - receivedAt');

  recorder.recordDispatch(journalEntry({ recordingCallId: 'recording-call-untimed' }));
  await recorder._drainForTests();
  assert.equal(hasOwn(journalStub.calls.dispatches.at(-1), 'timing'), false,
    'an untimed call carries no timing key, never a zero');

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('recordAction forwards the bridge call timing to the journal dispatch', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  const actionPayload = (recordingCallId) => ({
    tool: 'click',
    agentId: 'agent-journal',
    recordingRunId: 'recording-run-journal',
    recordingCallId,
    params: { selector: '#go' },
    visualSession: { visualReason: 'Journal task', client: 'Codex' }
  });

  recorder.recordAction({
    client: 'Codex',
    tool: 'click',
    params: { selector: '#go' },
    payload: actionPayload('recording-call-action-timed'),
    response: { success: true, clicked: true },
    success: true,
    tabId: 44,
    replayContext: { routeFamily: 'content', targetUrl: 'https://example.test', targetOrigin: 'https://example.test' },
    timing: { ...CALL_TIMING }
  });
  recorder.recordAction({
    client: 'Codex',
    tool: 'click',
    params: { selector: '#go' },
    payload: actionPayload('recording-call-action-null'),
    response: { success: true, clicked: true },
    success: true,
    tabId: 44,
    replayContext: { routeFamily: 'content' },
    timing: null
  });
  await recorder._drainForTests();

  assert.equal(journalStub.calls.dispatches.length, 2);
  assert.equal(journalStub.calls.dispatches[0].dispatcher_route, 'bridge-action');
  assert.deepEqual(journalStub.calls.dispatches[0].timing, CALL_TIMING);
  assert.equal(hasOwn(journalStub.calls.dispatches[1], 'timing'), false,
    'a null bridge timing is omitted from the journal entry');

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('journal task outcomes carry the validated call timing', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  const outcome = (recordingCallId, timing) => ({
    tool: 'complete_task',
    params: { summary: 'Timed task complete' },
    payload: {
      agentId: 'agent-journal',
      recordingRunId: 'recording-run-journal',
      recordingCallId,
      params: { summary: 'Timed task complete' }
    },
    response: { success: true, status: 'completed' },
    timing
  });

  recorder.recordTaskOutcome(outcome('recording-call-outcome-timed', { ...CALL_TIMING }));
  await recorder._drainForTests();
  recorder.recordTaskOutcome(outcome('recording-call-outcome-invalid', { ...CALL_TIMING, v: 2 }));
  await recorder._drainForTests();
  recorder.recordTaskOutcome(outcome('recording-call-outcome-untimed', undefined));
  await recorder._drainForTests();

  assert.equal(journalStub.calls.outcomes.length, 3);
  assert.deepEqual(journalStub.calls.outcomes[0].value.timing, CALL_TIMING);
  assert.equal(journalStub.calls.outcomes[0].value.dispatcher_route, 'task-status');
  assert.equal(hasOwn(journalStub.calls.outcomes[1].value, 'timing'), false, 'an invalid outcome timing is dropped');
  assert.equal(hasOwn(journalStub.calls.outcomes[2].value, 'timing'), false, 'an untimed outcome has no timing key');

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});

test('legacy-only sessions carry timing and durationMs on actionHistory rows', async () => {
  const journalStub = makeJournalStub();
  await reset(journalStub);
  await recorder._applyPolicyForTests(true, 30, recorder.FSB_MCP_RECORDER_BACKEND_JOURNAL);
  const legacyEntry = (selector, timing) => {
    const entry = journalEntry({
      payload: {
        agentId: 'agent-legacy-timing',
        params: { selector },
        visualSession: { visualReason: 'Legacy timed task', client: 'Claude' }
      }
    });
    if (timing !== undefined) entry.timing = timing;
    return entry;
  };

  recorder.recordDispatch(legacyEntry('#one', { ...CALL_TIMING }));
  recorder.recordDispatch(legacyEntry('#two'));
  recorder.recordDispatch(legacyEntry('#three', { ...CALL_TIMING, v: 2 }));
  await recorder._drainForTests();

  assert.equal(journalStub.calls.dispatches.length, 0, 'a client without recordingRunId stays on the legacy path');
  const sessions = Object.values(recorder._peekOpenSessions());
  assert.equal(sessions.length, 1);
  const [timedRow, untimedRow, invalidRow] = sessions[0].actionHistory;
  assert.deepEqual(timedRow.timing, CALL_TIMING);
  assert.equal(timedRow.durationMs, CALL_TIMING.fsbMs);
  for (const [label, row] of [['untimed', untimedRow], ['invalid', invalidRow]]) {
    assert.equal(hasOwn(row, 'timing'), false, `${label} legacy row has no timing`);
    assert.equal(hasOwn(row, 'durationMs'), false, `${label} legacy row has no durationMs`);
    assert.deepEqual(Object.keys(row), ['tool', 'params', 'result', 'timestamp', 'logicalTab']);
  }
  assert.equal(sessions[0].replayEntries.length, 3);
  assert.equal(sessions[0].replayEntries.some((row) => hasOwn(row, 'timing')), false,
    'replay entries keep their existing shape');

  // Open legacy sessions survive a service-worker eviction with their timing.
  recorder._resetForTests();
  await recorder._restoreFromBuffer();
  await recorder._drainForTests();
  const restored = Object.values(recorder._peekOpenSessions());
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].actionHistory[0].timing, CALL_TIMING);
  assert.equal(restored[0].actionHistory[0].durationMs, CALL_TIMING.fsbMs);
  assert.equal(hasOwn(restored[0].actionHistory[1], 'timing'), false);
  assert.equal(hasOwn(restored[0].actionHistory[1], 'durationMs'), false);

  // Closing hands the timed rows to history (the logger persists them).
  const saved = [];
  globalThis.automationLogger.saveSession = async (sessionId, sessionData) => {
    saved.push({ sessionId, sessionData });
    return true;
  };
  recorder.recordTaskOutcome({
    tool: 'complete_task',
    params: { summary: 'Legacy timed task complete' },
    payload: { agentId: 'agent-legacy-timing', params: { summary: 'Legacy timed task complete' } },
    response: { success: true, status: 'completed' }
  });
  await recorder._drainForTests();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].sessionData.actionHistory[0].timing, CALL_TIMING);
  assert.equal(saved[0].sessionData.actionHistory[0].durationMs, CALL_TIMING.fsbMs);
  assert.equal(hasOwn(saved[0].sessionData.actionHistory[1], 'durationMs'), false);

  recorder._resetForTests();
  delete globalThis.FsbMcpLatticeJournal;
});
