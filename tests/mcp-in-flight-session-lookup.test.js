'use strict';

/**
 * Phase 225-01 (Task 2): in-flight session lookup for stop_task and
 * get_session_detail.
 *
 * Today the dispatcher's session lookup only consults the COMPLETED-sessions
 * history store (automationLogger.loadSession). A session that is currently
 * running lives in the activeSessions map, never in history yet, so MCP
 * surfaces a misleading "Session not found" / "Page navigation" error while
 * the user can clearly see the run via get_task_status.
 *
 * These tests exercise handleGetSessionMessageRoute and handleStopAutomationRoute
 * against a minimal harness that mocks activeSessions + automationLogger.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

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

function buildHarness({ activeSessionEntries = [], historicalSession = null, stopHandler = null, journal = undefined, listSessions = null } = {}) {
  const dispatcherSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'),
    'utf8',
  );

  const context = {
    console,
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
    activeSessions: undefined, // populated inside vm to use the same Map class
    automationLogger: {
      loadSession: async (sessionId) => (historicalSession && historicalSession.sessionId === sessionId ? historicalSession : null),
      listSessions: listSessions || (async () => []),
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
    handleStopAutomation: stopHandler || ((req, _sender, sendResponse) => sendResponse({ success: true, sessionId: req.sessionId, stopped: true })),
    require: (modulePath) => {
      // Resolve relative requires from the dispatcher's location.
      if (modulePath.startsWith('../ai/tool-definitions.js')) {
        return require(path.join(__dirname, '..', 'extension', 'ai', 'tool-definitions.js'));
      }
      if (modulePath.startsWith('../utils/mcp-visual-session.js')) {
        return require(path.join(__dirname, '..', 'extension', 'utils', 'mcp-visual-session.js'));
      }
      throw new Error('Unsupported require in test harness: ' + modulePath);
    },
    chrome: {
      tabs: {
        query: async () => [],
      },
    },
    module: { exports: {} },
    globalThis: {},
  };
  context.globalThis = context;
  context.module.exports = {};
  // Phase 66: the journal module is absent unless a case injects one, so the
  // default harness keeps the pre-journal lookup order.
  if (journal !== undefined) context.FsbMcpLatticeJournal = journal;

  // Initialize activeSessions as a Map constructed inside the vm so
  // dispatcher's `instanceof Map` check passes against the vm's Map class.
  const setupSource = `
    activeSessions = new Map();
    if (typeof __seed_active_session_entries !== 'undefined') {
      for (const [key, value] of __seed_active_session_entries) {
        activeSessions.set(key, value);
      }
    }
  `;
  context.__seed_active_session_entries = activeSessionEntries;
  vm.runInNewContext(setupSource + '\n' + dispatcherSource, context, { filename: 'ws/mcp-tool-dispatcher.js' });

  return {
    dispatcher: context.module.exports,
    context,
  };
}

async function runGetSessionDetailFallbackCase() {
  console.log('\n--- get_session_detail returns in-flight snapshot ---');

  const sessionId = 'session_active_1';
  const liveSession = {
    sessionId,
    status: 'running',
    task: 'Open Excalidraw and draw a triangle',
    startTime: Date.now() - 5000,
    iterationCount: 4,
    maxIterations: 20,
    actionHistory: [
      { tool: 'click', timestamp: Date.now() - 100, iteration: 4, params: { selector: '#draw-tool' }, result: { success: true } },
    ],
    tabId: 17,
    lastUrl: 'https://excalidraw.com/',
  };
  const { dispatcher } = buildHarness({ activeSessionEntries: [[sessionId, liveSession]] });

  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:get-session',
    payload: { sessionId },
  });

  assert(result && result.success === true, 'in-flight get_session_detail returns success=true');
  assert(result && result.inFlight === true, 'in-flight get_session_detail flags inFlight: true');
  assert(result && result.session && result.session.final === false, 'in-flight snapshot carries final: false');
  assert(result && result.session && result.session.sessionId === sessionId, 'snapshot includes sessionId');
  assert(result && result.session && result.session.actionCount === 1, 'snapshot includes actionCount');
  assert(result && result.session && typeof result.session.note === 'string' && result.session.note.length > 0, 'snapshot includes a human-readable note');
}

async function runGetSessionDetailMissingCase() {
  console.log('\n--- get_session_detail surfaces session_not_found for unknown id ---');

  const { dispatcher } = buildHarness();

  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:get-session',
    payload: { sessionId: 'session_does_not_exist' },
  });

  assert(result && result.success === false, 'unknown session returns success=false');
  assert(result && result.errorCode === 'session_not_found', 'unknown session returns errorCode=session_not_found (not generic action_rejected)');
  assert(result && typeof result.error === 'string' && result.error.includes('not found'), 'error message describes the actual failure');
  assert(result && typeof result.recoveryHint === 'string' && result.recoveryHint.includes('list_sessions') && result.recoveryHint.includes('get_task_status'), 'recovery hint suggests list_sessions and get_task_status');
}

async function runStopTaskInFlightCase() {
  console.log('\n--- stop_task resolves in-flight session when no sessionId provided ---');

  const sessionId = 'session_active_for_stop';
  const liveSession = { sessionId, status: 'running', task: 'long task', startTime: Date.now(), iterationCount: 1, actionHistory: [], tabId: 9 };

  let stopRequest = null;
  const { dispatcher } = buildHarness({
    activeSessionEntries: [[sessionId, liveSession]],
    stopHandler: (req, _sender, sendResponse) => {
      stopRequest = req;
      sendResponse({ success: true, sessionId: req.sessionId, stopped: true });
    },
  });

  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:stop-automation',
    payload: {}, // MCP stop_task tool ships no sessionId in its schema
  });

  assert(result && result.success === true, 'stop_task on in-flight session returns success');
  assert(stopRequest && stopRequest.sessionId === sessionId, 'dispatcher forwarded the active sessionId to handleStopAutomation');
}

async function runStopTaskNoSessionCase() {
  console.log('\n--- stop_task returns session_not_found when no in-flight session ---');

  const { dispatcher } = buildHarness();

  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:stop-automation',
    payload: {},
  });

  assert(result && result.success === false, 'stop_task with no active session returns success=false');
  assert(result && result.errorCode === 'session_not_found', 'stop_task surfaces session_not_found error code');
  assert(result && typeof result.recoveryHint === 'string' && result.recoveryHint.includes('get_task_status'), 'stop_task recovery hint suggests get_task_status');
}

// ---- Phase 66 (MEAS-01/MEAS-02): call timing and session measurement ---------

const DISPATCHER_PATH = path.join(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js');
// Symbol.for is shared across realms, so this is the symbol the vm-loaded
// dispatcher reads.
const CALL_TIMING = Symbol.for('fsb.mcp.call-timing');

function stampPayload(payload, receivedAt) {
  Object.defineProperty(payload, CALL_TIMING, {
    value: { receivedAt },
    enumerable: false,
    configurable: true
  });
  return payload;
}

async function runDispatcherMessageRouteTimingCase() {
  console.log('\n--- dispatcher message-route recorder entry carries call timing ---');

  const { dispatcher, context } = buildHarness();
  const recorded = [];
  // FsbSpreadsheetRecordRedaction stays undefined, so the plain branch runs.
  context.fsbMcpSessionRecorder = { recordDispatch: (entry) => { recorded.push(entry); } };

  const receivedAt = Date.now() - 30;
  const stamped = stampPayload({ limit: 5 }, receivedAt);
  const response = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:list-sessions', payload: stamped });
  assert(response && response.success === true, 'a stamped mcp:list-sessions call still succeeds');
  assert(recorded.length === 1, 'the plain recordDispatch branch records the message route once');
  const timing = recorded[0] && recorded[0].timing;
  assert(!!timing && timing.v === 1 && timing.receivedAt === receivedAt,
    'the recorder entry timing is v1 and carries the ingress receivedAt');
  assert(!!timing && timing.completedAt >= receivedAt && timing.fsbMs === timing.completedAt - timing.receivedAt,
    'completedAt >= receivedAt and fsbMs = completedAt - receivedAt');
  assert(!!timing && timing.fsbMs >= 30, 'fsbMs covers at least the 30 ms since the stamp');
  assert(!JSON.stringify(response).includes('receivedAt') && !Object.prototype.hasOwnProperty.call(response, 'timing'),
    'the timing never reaches the tool response');

  recorded.length = 0;
  await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:list-sessions', payload: { limit: 5 } });
  assert(recorded.length === 1 && recorded[0].timing === null, 'an unstamped call records timing null, never 0');

  recorded.length = 0;
  await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:list-sessions',
    payload: { timing: { v: 1, receivedAt: 5, completedAt: 10, fsbMs: 5 } }
  });
  assert(recorded.length === 1 && recorded[0].timing === null, 'a caller-supplied string key timing is ignored');
}

async function runDispatcherTimingHelpersCase() {
  console.log('\n--- readDispatcherCallStamp / buildDispatcherCallTiming validate the stamp ---');

  const { dispatcher } = buildHarness();
  const read = dispatcher.readDispatcherCallStamp;
  const build = dispatcher.buildDispatcherCallTiming;
  assert(typeof read === 'function' && typeof build === 'function', 'both helpers are exported (test-only)');
  if (typeof read !== 'function' || typeof build !== 'function') return;

  assert(read({ timing: { v: 1, receivedAt: 1000 }, receivedAt: 1000 }) === null,
    'a payload with only string keys (timing, receivedAt) reads null');
  for (const bad of [1.5, -1, '1000', NaN, Infinity, null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert(read(stampPayload({}, bad)) === null, 'receivedAt ' + String(bad) + ' reads null');
  }
  for (const nonObject of [null, undefined, 'payload', 42, true]) {
    assert(read(nonObject) === null, 'non-object payload ' + String(nonObject) + ' reads null');
  }
  const scalarStamp = {};
  Object.defineProperty(scalarStamp, CALL_TIMING, { value: 1000, enumerable: false, configurable: true });
  assert(read(scalarStamp) === null, 'a stamp that is not an object reads null');
  const valid = read(stampPayload({}, 1000));
  assert(!!valid && valid.receivedAt === 1000 && Object.keys(valid).length === 1, 'a valid stamp reads { receivedAt }');

  assert(build(null) === null, 'buildDispatcherCallTiming(null) is null');
  assert(build(undefined) === null, 'buildDispatcherCallTiming(undefined) is null');
  assert(build({ receivedAt: -5 }) === null, 'a negative receivedAt builds null');
  const receivedAt = Date.now() - 25;
  const timing = build({ receivedAt });
  assert(!!timing && timing.v === 1 && timing.receivedAt === receivedAt, 'a valid stamp builds v1 timing');
  assert(!!timing && timing.completedAt >= receivedAt && timing.fsbMs === timing.completedAt - timing.receivedAt,
    'fsbMs equals completedAt - receivedAt');
  assert(!!timing && timing.fsbMs >= 25, 'fsbMs covers the elapsed time');
  assert(build({ receivedAt: Date.now() + 60000 }) === null,
    'a stamp after completion (clock stepped back) builds null, not 0');
}

async function runDispatcherTaskOutcomeTimingCase() {
  console.log('\n--- recordTaskOutcome timing survives visual-session canonicalization ---');

  const { dispatcher, context } = buildHarness();
  const outcomes = [];
  context.fsbMcpSessionRecorder = { recordTaskOutcome: (input) => { outcomes.push(input); } };

  const plainReceivedAt = Date.now() - 40;
  const plainPayload = stampPayload({ tool: 'complete_task', agentId: 'agent-timing' }, plainReceivedAt);
  const plain = await dispatcher.dispatchMcpToolRoute({ tool: 'complete_task', params: { summary: 'Done' }, payload: plainPayload });
  assert(plain && plain.status === 'completed', 'complete_task returns status completed');
  assert(outcomes.length === 1, 'recordTaskOutcome fires once for the confirmed outcome');
  const plainTiming = outcomes[0] && outcomes[0].timing;
  assert(!!plainTiming && plainTiming.receivedAt === plainReceivedAt && plainTiming.fsbMs >= 40 &&
    plainTiming.fsbMs === plainTiming.completedAt - plainTiming.receivedAt,
    'recordTaskOutcome receives validated timing for a stamped call');

  // Visual-session path: canonicalization swaps in the session ownership
  // token through a payload spread, which drops the symbol stamp.
  outcomes.length = 0;
  context.resolveMcpVisualSessionTabId = () => 42;
  context.fsbAgentRegistryInstance = {
    hasAgent: () => true,
    getAgentTabs: () => [42],
    isOwnedBy: () => true,
    getOwner: () => 'agent-visual',
    getTabMetadata: () => ({ ownershipToken: 'session-owner-token' }),
    getAgentWindowId: () => null
  };
  context.handleMcpVisualSessionTaskStatus = (_request, _sender, sendResponse) => {
    sendResponse({ success: true, tool: 'complete_task', status: 'completed' });
  };
  const visualReceivedAt = Date.now() - 35;
  const visualPayload = stampPayload({
    tool: 'complete_task',
    agentId: 'agent-visual',
    ownershipToken: 'agent-token'
  }, visualReceivedAt);
  const visual = await dispatcher.dispatchMcpToolRoute({
    tool: 'complete_task',
    params: { summary: 'Done', session_token: 'visual-token-1' },
    payload: visualPayload
  });
  assert(visual && visual.status === 'completed', 'the visual-session complete_task resolves completed');
  assert(outcomes.length === 1, 'recordTaskOutcome fires once on the visual-session path');
  const recordedPayload = outcomes[0] && outcomes[0].payload;
  assert(!!recordedPayload && recordedPayload !== visualPayload && recordedPayload.ownershipToken === 'session-owner-token',
    'the recorder receives the canonicalized payload copy');
  assert(!!recordedPayload && recordedPayload[CALL_TIMING] === undefined, 'the canonicalized copy has lost the symbol stamp');
  const visualTiming = outcomes[0] && outcomes[0].timing;
  assert(!!visualTiming && visualTiming.receivedAt === visualReceivedAt && visualTiming.fsbMs >= 35,
    'timing read from the original payload still reaches recordTaskOutcome');
}

function runDispatcherTimingSourceContractCase() {
  console.log('\n--- dispatcher call-timing source contract ---');

  const src = fs.readFileSync(DISPATCHER_PATH, 'utf8');
  const toolRoute = src.slice(
    src.indexOf('async function dispatchMcpToolRoute'),
    src.indexOf('async function dispatchMcpMessageRoute')
  );
  const stampAt = toolRoute.indexOf('const callTimingStamp = readDispatcherCallStamp(payload);');
  const canonicalAt = toolRoute.indexOf('canonicalizeVisualSessionTaskParams(tool, params, payload)');
  assert(stampAt > -1 && canonicalAt > -1 && stampAt < canonicalAt,
    'dispatchMcpToolRoute reads the stamp before canonicalizeVisualSessionTaskParams');
  assert(toolRoute.includes('recordTaskOutcome({ tool, params, payload, response, timing: buildDispatcherCallTiming(callTimingStamp) })'),
    'recordTaskOutcome passes timing: buildDispatcherCallTiming(callTimingStamp)');
  assert(!toolRoute.includes('fsbMcpSessionRecorder.recordDispatch'), 'the tool route stays free of session recordDispatch');

  const entryStart = src.indexOf('var sessionRecordEntry = {');
  const entrySpan = entryStart === -1 ? '' : src.slice(entryStart, src.indexOf('};', entryStart));
  assert(entrySpan.includes('timing: buildDispatcherCallTiming(readDispatcherCallStamp(payload))'),
    'the message-route recorder entry carries timing');
  assert((src.match(/Symbol\.for\('fsb\.mcp\.call-timing'\)/g) || []).length === 1,
    'the registry symbol is declared exactly once in the dispatcher');
  assert(src.includes('const MCP_DISPATCHER_CALL_TIMING') && !src.includes('const MCP_BRIDGE_CALL_TIMING'),
    'the dispatcher uses its own identifier, never the bridge client name');
  assert((src.match(/globalThis\.fsbMcpMetricsRecorder\.recordDispatch\(\{[\s\S]*?\}\);/g) || []).length === 2,
    'the two metrics recordDispatch sites are unchanged');
}

// ---- Journal-backed get_session_detail (real journal, memory backend) --------

const CALL_TIMING_LEGEND_TEXT = 'Timing: fsb = extension receive to completion; ' +
  'caller gap = receive(n) - completion(n-1), an upper bound on host thinking time; MCP queue wait not measured';
const SECRET_URL = 'https://intranet.example.test/secret-path?token=abc';

function makeJournalLocalStorage() {
  const state = {};
  return {
    state,
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      const out = {};
      names.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(state, key)) out[key] = structuredClone(state[key]);
      });
      return out;
    },
    async set(values) {
      Object.keys(values || {}).forEach((key) => { state[key] = structuredClone(values[key]); });
    }
  };
}

// Resets the real journal exactly as tests/mcp-lattice-journal.test.js setup() does.
function setupRealJournal(startAt = 1800000000000) {
  const journal = require('../extension/utils/mcp-lattice-journal.js');
  journal._resetForTests();
  const local = makeJournalLocalStorage();
  const alarms = new Map();
  let now = startAt;
  journal._setLocalStorageShim(local);
  journal._setTimeShim({ now: () => now });
  journal._setAlarmShim({
    async create(name, info) { alarms.set(name, { name, ...info }); },
    async clear(name) { return alarms.delete(name); }
  });
  globalThis.FsbLatticeReplay = null;
  return { journal, local, alarms, advance(ms) { now += ms; } };
}

let journalCallNumber = 0;
function journalEntry(overrides = {}) {
  journalCallNumber += 1;
  const agentId = overrides.agentId || 'agent-detail';
  const recordingRunId = overrides.recordingRunId || 'recording-run-detail';
  const recordingCallId = overrides.recordingCallId || ('detail-call-' + journalCallNumber);
  const tool = overrides.tool || 'click';
  return {
    agentId,
    recordingRunId,
    recordingCallId,
    client: 'Claude',
    task: 'Save the intranet form',
    tool,
    requestPayload: {
      agentId,
      recordingRunId,
      recordingCallId,
      tool,
      params: overrides.params || { selector: '#save', url: SECRET_URL }
    },
    response: Object.prototype.hasOwnProperty.call(overrides, 'response') ? overrides.response : { success: true },
    success: overrides.success !== false,
    dispatcher_route: overrides.dispatcher_route || 'bridge-action',
    tabId: 11,
    replayContext: {
      targetUrl: SECRET_URL,
      targetOrigin: 'https://intranet.example.test',
      sideEffectClass: 'write'
    },
    ...(Object.prototype.hasOwnProperty.call(overrides, 'timing') ? { timing: overrides.timing } : {})
  };
}

function timingOf(receivedAt, completedAt) {
  return { v: 1, receivedAt, completedAt, fsbMs: completedAt - receivedAt };
}

async function recordJournalCalls(fixture, entries) {
  let sessionId = null;
  for (const entry of entries) {
    fixture.advance(1000);
    sessionId = (await fixture.journal.recordDispatch(entry)).sessionId;
  }
  return sessionId;
}

async function runJournalSessionDetailCase() {
  console.log('\n--- get_session_detail resolves a journal-backed MCP session (sanitized, timed) ---');

  const fixture = setupRealJournal();
  const journal = fixture.journal;
  const sessionId = await recordJournalCalls(fixture, [
    journalEntry({ tool: 'click', timing: timingOf(1000, 1120) }),
    journalEntry({
      tool: 'type',
      timing: timingOf(1620, 1700),
      response: { success: true, text: 'PAGE_TEXT_SENTINEL_5d2c appears on the page' }
    }),
    journalEntry({ tool: 'read_page' }),
    journalEntry({ tool: 'click', timing: timingOf(3000, 3050) })
  ]);
  const indexEntry = (await journal.getSessionDetail({ sessionId, afterSequence: -1, limit: 1 })).session;

  const { dispatcher } = buildHarness({ journal });
  const response = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } });
  assert(response && response.success === true && !!response.session,
    'a journal session resolves with the {success, session} envelope');
  assert(response && response.inFlight === undefined, 'the journal branch is not the in-flight fallback');
  const session = (response && response.session) || {};
  assert(session.id === sessionId, 'session.id is the journal session id');
  assert(session.storageBackend === indexEntry.storageBackend && session.storageBackend === 'journal-v2',
    'session.storageBackend is the index entry value');

  const rows = Array.isArray(session.actionHistory) ? session.actionHistory : [];
  assert(rows.length === 4, 'actionHistory has one row per tool.call');
  assert(rows.map((row) => row.tool).join(',') === 'click,type,read_page,click', 'rows keep call order');
  assert(rows.every((row, index) => Number.isInteger(row.sequence) && (index === 0 || row.sequence > rows[index - 1].sequence)),
    'rows carry increasing journal sequences');
  assert(rows.every((row) => typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)),
    'every row has a numeric timestamp');
  assert(rows.every((row) => row.domain === 'intranet.example.test' && row.selector === '#save'),
    'rows keep the selector and only the domain of the request URL');
  assert(rows.every((row) => row.result && row.result.success === true), 'rows keep result.success');
  assert(rows.every((row) => row.route === 'bridge-action' && row.logicalTab === 'primary'),
    'rows carry the route and logical tab');
  const timed = [rows[0], rows[1], rows[3]].filter(Boolean);
  assert(timed.length === 3 && timed.every((row) => row.timing && row.timing.v === 1 && row.durationMs === row.timing.fsbMs),
    'timed rows carry timing and durationMs === timing.fsbMs');
  assert(!!rows[3] && rows[0].durationMs === 120 && rows[1].durationMs === 80 && rows[3].durationMs === 50,
    'durationMs is the recorded fsb time');
  assert(!!rows[2] && !Object.prototype.hasOwnProperty.call(rows[2], 'timing') &&
    !Object.prototype.hasOwnProperty.call(rows[2], 'durationMs'), 'the untimed row has neither timing nor durationMs');

  const serialized = JSON.stringify(response);
  for (const sentinel of ['PAGE_TEXT_SENTINEL_5d2c', '/secret-path', 'token=abc']) {
    assert(!serialized.includes(sentinel), 'the response never contains ' + sentinel);
  }
  assert(!serialized.includes('"inline"') && !serialized.includes('"events"') && !serialized.includes('"metadata"'),
    'no raw journal event or payload descriptor is returned');
  assert(Array.isArray(session.logs) && session.logs.length === 0, 'journal sessions return an empty logs array');
  assert(session.callsTotal === 4 && session.actionHistoryTruncated === false, 'callsTotal counts every call; nothing truncated');

  const m = session.measurement || {};
  assert(m.v === 1 && m.kind === 'mcp' && m.source === 'journal', 'measurement is the v1 journal MCP block');
  assert(m.calls === 4 && m.callsWithTiming === 3, 'measurement counts calls and timed calls');
  assert(!!m.fsbMs && m.fsbMs.total === 250 && m.fsbMs.median === 80, 'fsbMs total and median cover the timed calls');
  assert(!!m.callerGapMs && m.callerGapMs.count === 1 && m.callerGapMs.total === 500 && m.callerGapMs.overlapped === 0 &&
    m.callerGapMs.label === 'upper bound on host thinking time', 'the untimed call breaks the caller-gap chain');
  assert(!!m.callIntervalMs && m.callIntervalMs.count === 1 && m.callIntervalMs.median === 620,
    'call interval is receive-to-receive over consecutive timed calls');
  assert(m.activeSpanMs === 2050, 'activeSpanMs = last completedAt - first receivedAt over timed calls');
  assert(m.endReason === null && m.idleTimeout === false && m.idleTailExcluded === true,
    'a running session has no end reason yet');
  assert(m.queueWaitMs === null && m.queueWaitStatus === 'not_measured', 'MCP queue wait is labelled not measured');
  assert(!!m.host && m.host.modelMs === null && m.host.inputTokens === null && m.host.outputTokens === null &&
    m.host.costUsd === null && m.host.status === 'unavailable' && m.host.reason === 'host does not report to FSB',
    'host model time, tokens and cost are labelled unavailable');
  assert(m.truncated === false && m.pagesRead === 1, 'one page read and nothing truncated');

  const text = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId, format: 'text' } });
  assert(text && text.success === true && text.format === 'text' && typeof text.text === 'string',
    'format text returns {success, format: text, text}');
  const report = (text && text.text) || '';
  assert(report.includes('FSB MCP SESSION REPORT'), 'the text is the journal session report');
  assert(report.includes(CALL_TIMING_LEGEND_TEXT), 'the text carries the per-call timing legend');
  assert(report.includes('| fsb '), 'the text carries per-call fsb milliseconds');
  assert(report === await journal.exportHumanReadable(sessionId), 'the text is exportHumanReadable output verbatim');
  assert(!report.includes('PAGE_TEXT_SENTINEL_5d2c') && !report.includes('/secret-path'), 'the text carries no page content');
}

async function runJournalArtifactResultCase() {
  console.log('\n--- artifact-stored journal results contribute nothing but keep the call outcome ---');

  const fixture = setupRealJournal();
  const bulky = 'ARTIFACT_SENTINEL_7a1f ' + 'x'.repeat(70 * 1024);
  const sessionId = await recordJournalCalls(fixture, [
    journalEntry({ tool: 'read_page', params: { url: SECRET_URL }, response: { success: true, text: bulky } }),
    journalEntry({ tool: 'click', success: false, response: { success: false, error: 'Element not clickable' } })
  ]);
  const detail = await fixture.journal.getSessionDetail({ sessionId, afterSequence: -1, limit: 500 });
  const calls = detail.events.filter((event) => event.kind === 'tool.call');
  assert(calls[0] && calls[0].metadata.result.storage === 'artifact', 'the bulky result is stored as an artifact');

  const { dispatcher } = buildHarness({ journal: fixture.journal });
  const response = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } });
  const rows = (response && response.session && response.session.actionHistory) || [];
  assert(rows.length === 2 && rows[0].result.success === true && rows[0].domain === 'intranet.example.test',
    'an artifact result keeps the journal success flag and the request domain');
  assert(!!rows[1] && rows[1].result.success === false && rows[1].result.error === 'Element not clickable',
    'an inline failure keeps its bounded error');
  assert(!JSON.stringify(response).includes('ARTIFACT_SENTINEL_7a1f'), 'artifact content never appears');
}

async function runJournalSessionPagingCase() {
  console.log('\n--- get_session_detail pages the journal internally (1203 calls) ---');

  const fixture = setupRealJournal();
  let sessionId = null;
  for (let index = 0; index < 1203; index++) {
    const receivedAt = 10000 + index * 1000;
    sessionId = (await fixture.journal.recordDispatch(journalEntry({
      recordingRunId: 'recording-run-long',
      recordingCallId: 'long-call-' + index,
      tool: 'step_' + index,
      params: { selector: '#row-' + index },
      response: { success: true, value: index },
      timing: timingOf(receivedAt, receivedAt + 100 + (index % 7))
    }))).sessionId;
  }
  const limits = [];
  const countingJournal = {
    hasSession: (id) => fixture.journal.hasSession(id),
    getSessionDetail: (input) => {
      limits.push(input.limit);
      return fixture.journal.getSessionDetail(input);
    },
    exportHumanReadable: (id) => fixture.journal.exportHumanReadable(id)
  };

  const { dispatcher } = buildHarness({ journal: countingJournal });
  const response = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } });
  const session = (response && response.session) || {};
  const rows = Array.isArray(session.actionHistory) ? session.actionHistory : [];
  assert(rows.length === 100, 'actionHistory keeps the last 100 calls');
  assert(rows.length === 100 && rows[0].tool === 'step_1103' && rows[99].tool === 'step_1202',
    'the rows are the last 100 calls, ending with the last call');
  assert(session.callsTotal === 1203 && session.actionHistoryTruncated === true,
    'callsTotal and actionHistoryTruncated make the row cap visible');
  const m = session.measurement || {};
  assert(m.calls === 1203 && m.callsWithTiming === 1203, 'measurement covers all 1203 calls');
  assert(m.truncated === false && m.pagesRead === 3, 'three 500-event pages, nothing truncated');
  assert(limits.length === 3 && limits.every((limit) => limit === 500), 'every page asks for 500 events');
  assert(!!m.callIntervalMs && m.callIntervalMs.count === 1202 && m.callIntervalMs.median === 1000 && m.callIntervalMs.p90 === 1000,
    'call intervals span page boundaries');
  assert(!!m.callerGapMs && m.callerGapMs.count === 1202 && m.callerGapMs.overlapped === 0,
    'caller gaps span page boundaries');
  assert(m.activeSpanMs === 1202000 + 100 + (1202 % 7), 'activeSpanMs runs from the first receive to the last completion');
}

async function runJournalSessionPageBoundCase() {
  console.log('\n--- journal paging stops at 20 pages and reports truncation ---');

  const afters = [];
  const stub = {
    async hasSession() { return true; },
    async getSessionDetail(input) {
      afters.push(input.afterSequence);
      const sequence = input.afterSequence + 1;
      return {
        session: { id: 'stub-session', task: 'Endless session', status: 'running', mode: 'mcp-agent', storageBackend: 'journal-v2' },
        events: [{
          sequence,
          kind: 'tool.call',
          timestamp: new Date(1800000000000 + sequence * 1000).toISOString(),
          metadata: {
            tool: 'read_page',
            route: 'message',
            logicalTab: 'primary',
            success: true,
            request: { storage: 'inline', inline: { params: {} } },
            result: { storage: 'inline', inline: { success: true } },
            timing: timingOf(1000 + sequence * 1000, 1040 + sequence * 1000)
          }
        }],
        nextSequence: sequence,
        hasMore: true
      };
    },
    async exportHumanReadable() { return 'stub report'; }
  };
  const { dispatcher } = buildHarness({ journal: stub });
  const response = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'stub-session' } });
  const m = (response && response.session && response.session.measurement) || {};
  assert(response && response.success === true, 'a never-ending journal still resolves');
  assert(afters.length === 20, 'paging stops after 20 pages');
  assert(afters.join(',') === [-1].concat(Array.from({ length: 19 }, (_v, index) => index)).join(','),
    'each page continues after the previous nextSequence');
  assert(m.truncated === true && m.pagesRead === 20 && m.calls === 20, 'measurement reports truncated: true');
}

async function runJournalLookupErrorCases() {
  console.log('\n--- journal lookup failures: hasSession falls through, detail errors are route errors ---');

  const brokenLookup = {
    async hasSession() { throw new Error('journal database closed'); },
    async getSessionDetail() { throw new Error('unreachable'); },
    async exportHumanReadable() { return 'unreachable'; }
  };
  const liveId = 'session_live_while_journal_down';
  const liveSession = { sessionId: liveId, status: 'running', task: 'live task', startTime: Date.now(), actionHistory: [] };
  let harness = buildHarness({ journal: brokenLookup, activeSessionEntries: [[liveId, liveSession]] });
  let result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: liveId } });
  assert(result && result.success === true && result.inFlight === true, 'a throwing hasSession falls through to in-flight sessions');

  const historicalSession = { sessionId: 'session_history_1', task: 'History task', status: 'completed', actionHistory: [] };
  harness = buildHarness({ journal: brokenLookup, historicalSession });
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'session_history_1' } });
  assert(result && result.success === true && result.session && result.session.task === 'History task',
    'a throwing hasSession falls through to the history store');

  harness = buildHarness({ journal: brokenLookup });
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'nope' } });
  assert(result && result.errorCode === 'session_not_found', 'a throwing hasSession still ends in session_not_found');

  const brokenDetail = {
    async hasSession() { return true; },
    async getSessionDetail() { throw new Error('indexeddb read failed at cursor 7'); },
    async exportHumanReadable() { throw new Error('indexeddb export failed'); }
  };
  harness = buildHarness({ journal: brokenDetail });
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'journal-1' } });
  assert(result && result.success === false && result.errorCode !== 'session_not_found' &&
    typeof result.error === 'string' && result.error.includes('Journal session detail unavailable'),
    'a throwing getSessionDetail returns a route error, not session_not_found');
  assert(!JSON.stringify(result).includes('cursor 7'), 'the route error does not echo the internal failure');
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'journal-1', format: 'text' } });
  assert(result && result.success === false && String(result.error).includes('Journal session detail unavailable'),
    'a throwing text exporter returns the same route error');

  const vanished = { async hasSession() { return true; }, async getSessionDetail() { return null; } };
  harness = buildHarness({ journal: vanished });
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'journal-2' } });
  assert(result && result.success === false && String(result.error).includes('Journal session detail unavailable'),
    'a session that vanishes between hasSession and getSessionDetail returns the route error');
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'journal-2', format: 'text' } });
  assert(result && result.success === false && result.error === 'Human-readable session exporter unavailable',
    'a journal without exportHumanReadable returns the existing exporter error');
}

async function runJournalFallthroughIsUnchangedCase() {
  console.log('\n--- sessions the journal does not hold resolve exactly as before ---');

  const fixture = setupRealJournal();
  await recordJournalCalls(fixture, [journalEntry({ tool: 'click', timing: timingOf(1000, 1100) })]);
  const historicalSession = {
    sessionId: 'session_legacy_1',
    task: 'Legacy autopilot',
    status: 'completed',
    actionHistory: [{ tool: 'click', timestamp: 1, iteration: 1, params: { selector: '#a' }, result: { success: true } }]
  };
  const liveId = 'session_live_1';
  const liveSession = { sessionId: liveId, status: 'running', task: 'live', startTime: 5, iterationCount: 1, actionHistory: [] };
  const options = { historicalSession, activeSessionEntries: [[liveId, liveSession]] };
  const without = buildHarness(options).dispatcher;
  const withJournal = buildHarness(Object.assign({ journal: fixture.journal }, options)).dispatcher;
  for (const payload of [
    { sessionId: 'session_legacy_1' },
    { sessionId: 'session_legacy_1', format: 'text' },
    { sessionId: liveId },
    { sessionId: 'session_unknown' }
  ]) {
    const a = await without.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: Object.assign({}, payload) });
    const b = await withJournal.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: Object.assign({}, payload) });
    assert(JSON.stringify(a) === JSON.stringify(b), 'identical response with and without the journal for ' + JSON.stringify(payload));
  }
}

async function runJournalListRoundTripCase() {
  console.log('\n--- a list_sessions id resolves through get_session_detail ---');

  const fixture = setupRealJournal();
  const sessionId = await recordJournalCalls(fixture, [
    journalEntry({ tool: 'navigate', timing: timingOf(1000, 1300) }),
    journalEntry({ tool: 'click', timing: timingOf(2000, 2100) })
  ]);
  const { dispatcher } = buildHarness({
    journal: fixture.journal,
    listSessions: async () => (Array.isArray(fixture.local.state.fsbSessionIndex) ? fixture.local.state.fsbSessionIndex : [])
  });
  const list = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:list-sessions', payload: {} });
  const listed = ((list && list.sessions) || []).find((entry) => entry && entry.id === sessionId);
  assert(!!listed && listed.storageBackend === 'journal-v2', 'list_sessions returns the journal session id');
  const detail = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:get-session',
    payload: { sessionId: listed ? listed.id : 'missing' }
  });
  assert(detail && detail.success === true && detail.session && detail.session.id === sessionId &&
    detail.session.actionHistory.length === 2, 'the listed id resolves with its calls');
}

async function runJournalIdleTimeoutMeasurementCase() {
  console.log('\n--- idle-timeout journal sessions: flagged, idle tail excluded, overlaps counted ---');

  const fixture = setupRealJournal();
  const sessionId = await recordJournalCalls(fixture, [
    journalEntry({ tool: 'click_a', timing: timingOf(1000, 1120) }),
    journalEntry({ tool: 'click_b', timing: timingOf(1620, 1700) }),
    journalEntry({ tool: 'click_c', timing: timingOf(1650, 1800) })
  ]);
  fixture.advance(fixture.journal.IDLE_MS + 1);
  const closed = await fixture.journal.handleAlarm({ name: fixture.journal.IDLE_ALARM_PREFIX + sessionId });
  assert(closed && closed.action === 'closed', 'the idle alarm closes the run');

  const { dispatcher } = buildHarness({ journal: fixture.journal });
  const response = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } });
  const session = (response && response.session) || {};
  const m = session.measurement || {};
  assert(session.outcomeDetails && session.outcomeDetails.reason === 'idle_timeout', 'the index entry records idle_timeout');
  assert(m.endReason === 'idle_timeout' && m.idleTimeout === true && m.idleTailExcluded === true,
    'measurement flags the idle timeout and excludes the idle tail');
  assert(m.activeSpanMs === 800, 'activeSpanMs = last completedAt - first receivedAt');
  assert(Number.isFinite(session.endTime) && Number.isFinite(session.startTime) &&
    session.endTime - session.startTime > fixture.journal.IDLE_MS, 'the session span includes the idle tail that activeSpanMs leaves out');
  assert(m.queueWaitMs === null && m.queueWaitStatus === 'not_measured', 'queue wait stays not measured');
  assert(!!m.callerGapMs && m.callerGapMs.count === 1 && m.callerGapMs.total === 500 && m.callerGapMs.overlapped === 1,
    'an overlapping call counts as overlapped and stays out of the gap statistics');
}

async function runJournalCallIntervalCase() {
  console.log('\n--- call intervals: receive-to-receive over consecutive timed calls ---');

  const benchStats = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'bench', 'lib', 'stats.mjs')).href);
  let fixture = setupRealJournal();
  let sessionId = await recordJournalCalls(fixture, [
    journalEntry({ tool: 'a', timing: timingOf(1000, 1100) }),
    journalEntry({ tool: 'b', timing: timingOf(1600, 1650) }),
    journalEntry({ tool: 'c', timing: timingOf(2600, 2900) })
  ]);
  let dispatcher = buildHarness({ journal: fixture.journal }).dispatcher;
  let m = ((await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } })).session || {}).measurement || {};
  assert(!!m.callIntervalMs && m.callIntervalMs.count === 2 && m.callIntervalMs.median === 800 &&
    m.callIntervalMs.p90 === benchStats.quantile([600, 1000], 0.9), 'intervals 600 and 1000 give median 800 and the bench p90');
  assert(!!m.fsbMs && m.fsbMs.median === benchStats.median([100, 50, 300]) && m.fsbMs.p90 === benchStats.quantile([100, 50, 300], 0.9),
    'fsbMs median and p90 match the bench statistics library');

  fixture = setupRealJournal();
  sessionId = await recordJournalCalls(fixture, [
    journalEntry({ tool: 'a', timing: timingOf(1000, 1100) }),
    journalEntry({ tool: 'b', timing: timingOf(1600, 1650) }),
    journalEntry({ tool: 'untimed' }),
    journalEntry({ tool: 'c', timing: timingOf(2600, 2900) })
  ]);
  dispatcher = buildHarness({ journal: fixture.journal }).dispatcher;
  m = ((await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId } })).session || {}).measurement || {};
  assert(!!m.callIntervalMs && m.callIntervalMs.count === 1 && m.callIntervalMs.median === 600,
    'an untimed call between two timed calls breaks the interval chain');
  assert(!!m.callerGapMs && m.callerGapMs.count === 1 && m.callerGapMs.total === 500, 'and the caller-gap chain');
}

// ---- Measurement projection for history sessions (autopilot, legacy MCP) -----

function hasOwn(object, key) {
  return !!object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
}

function autopilotTimingRow(iteration, overrides) {
  return Object.assign({
    v: 1,
    iteration,
    startedAt: 1790726400000 + iteration * 1000,
    modelMs: 2000 + iteration * 500,
    modelRetried: iteration === 2,
    toolMs: 400 + iteration * 50,
    toolCount: iteration === 1 ? 1 : 2,
    usage: { input: 9000, output: 350, reasoning: 150, cachedInput: 4500 },
    usageSource: 'provider',
    costUsd: 0.01605,
    costSource: 'provider',
    estimateUsd: 0.0125,
    estimateDeltaPct: -0.2212,
    pricingKey: 'grok-4.3',
    requestedModel: 'grok-4.3',
    servedModel: 'grok-4.3',
    provider: 'xai'
  }, overrides || {});
}

function autopilotSummary(overrides) {
  return Object.assign({
    v: 1,
    iterations: 2,
    modelMsTotal: 5000,
    toolMsTotal: 900,
    toolCount: 3,
    usage: { input: 18000, output: 700, reasoning: 300, cachedInput: 9000 },
    usageIterations: 2,
    usageSource: 'provider',
    costUsd: 0.0321,
    costIterations: 2,
    costSource: 'provider',
    requestedModel: 'grok-4.3',
    servedModels: ['grok-4.3']
  }, overrides || {});
}

function autopilotSession(sessionId, overrides) {
  return Object.assign({
    sessionId,
    id: sessionId,
    task: 'Fill the order form',
    status: 'completed',
    mode: 'autopilot',
    startTime: 1790726400000,
    endTime: 1790726460000,
    totalCost: 0.03,
    totalInputTokens: 18000,
    totalOutputTokens: 700,
    actionHistory: [
      { tool: 'click', timestamp: 1790726401000, iteration: 1, params: { selector: '#go' }, result: { success: true }, durationMs: 412 }
    ]
  }, overrides || {});
}

async function getHistorySession(session, extra) {
  const { dispatcher } = buildHarness(Object.assign({ historicalSession: session }, extra || {}));
  return dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: session.sessionId } });
}

// Path of the first object that carries totalCost without a totalCostBasis
// sibling, or null when every totalCost is labelled.
function findBareTotalCost(value, trail) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const hit = findBareTotalCost(value[index], trail + '[' + index + ']');
      if (hit) return hit;
    }
    return null;
  }
  if (hasOwn(value, 'totalCost') && !hasOwn(value, 'totalCostBasis')) return trail || '(root)';
  for (const [key, item] of Object.entries(value)) {
    const hit = findBareTotalCost(item, trail + '.' + key);
    if (hit) return hit;
  }
  return null;
}

async function runAutopilotMeasurementCase() {
  console.log('\n--- autopilot sessions: filter-proof tokens, provider-first cost, per-iteration rows ---');

  const rows = [autopilotTimingRow(1), autopilotTimingRow(2)];
  const response = await getHistorySession(autopilotSession('session_autopilot_measured', {
    iterationTiming: rows,
    measurementSummary: autopilotSummary(),
    totalCostBasis: 'estimate'
  }));
  const session = (response && response.session) || {};
  const m = session.measurement || {};
  assert(response && response.success === true && m.v === 1 && m.kind === 'autopilot' && m.recorded === true,
    'an autopilot session carries the v1 autopilot measurement block');
  assert(m.inputTokens === 18000 && m.outputTokens === 700 && m.reasoningTokens === 300 && m.cachedInputTokens === 9000,
    'token counts survive the /token/i key filter');
  assert(m.usageSource === 'provider' && m.costUsd === 0.0321 && m.costSource === 'provider' && m.costIterations === 2,
    'provider-reported usage and cost come with their sources');
  assert(m.iterations === 2 && !!m.modelMs && m.modelMs.total === 5000 && !!m.toolMs && m.toolMs.total === 900 && m.toolMs.calls === 3,
    'model and tool totals come from the stored summary');
  assert(!!m.modelMs && m.modelMs.median === 2750 && m.modelMs.p90 === 2500 + 0.9 * 500,
    'model median and p90 cover the stored iteration rows');
  assert(!!m.toolMs && m.toolMs.median === 475, 'tool median covers the stored iteration rows');
  assert(m.requestedModel === 'grok-4.3' && Array.isArray(m.servedModels) && m.servedModels.join(',') === 'grok-4.3',
    'requested and served models are reported');
  const perIteration = Array.isArray(m.perIteration) ? m.perIteration : [];
  assert(perIteration.length === 2, 'perIteration has one row per stored iteration');
  assert(perIteration.every((row, index) => row.startedAt === rows[index].startedAt && row.modelMs === rows[index].modelMs &&
    row.iteration === rows[index].iteration && row.toolMs === rows[index].toolMs && row.toolCount === rows[index].toolCount),
    'perIteration rows carry startedAt, model and tool time from the stored rows');
  assert(perIteration.length === 2 && perIteration[1].modelRetried === true && perIteration[0].modelRetried === false,
    'perIteration rows keep the retry mark');
  assert(perIteration.every((row) => row.inputTokens === 9000 && row.outputTokens === 350 && row.reasoningTokens === 150 &&
    row.cachedInputTokens === 4500 && row.usageSource === 'provider' && row.costUsd === 0.01605 &&
    row.costSource === 'provider' && row.servedModel === 'grok-4.3' && row.estimateDeltaPct === -0.2212),
    'perIteration rows carry usage, cost, served model and the estimate delta');
  assert(!hasOwn(perIteration[0], 'pricingKey') && !hasOwn(perIteration[0], 'provider') && !hasOwn(perIteration[0], 'usage'),
    'perIteration rows are the flat projection only');
  assert(!hasOwn(session, 'iterationTiming') && !hasOwn(session, 'measurementSummary'),
    'raw iterationTiming and measurementSummary are absent from the generic output');
  assert(!JSON.stringify(m).includes('[object]'), 'nothing in the measurement block is flattened');
  assert(!hasOwn(session, 'totalInputTokens') && !hasOwn(session, 'totalOutputTokens'),
    'bare legacy token totals stay filtered out of the generic output');
  const legacy = m.legacyTotals || {};
  assert(legacy.costUsd === 0.03 && legacy.costBasis === 'estimate' && legacy.inputTokens === 18000 && legacy.outputTokens === 700 &&
    legacy.usageBasis === 'provider' && legacy.label === 'legacy price-table total; not provider-reported',
    'legacyTotals carry the labelled legacy numbers');
  assert(session.totalCost === 0.03 && session.totalCostBasis === 'estimate', 'the legacy totalCost keeps its value and gains a basis');
  assert(session.actionHistory && session.actionHistory[0] && session.actionHistory[0].durationMs === 412,
    'executed actions keep their measured durationMs');
}

async function runAutopilotUnrecordedCase() {
  console.log('\n--- pre-Phase-66 autopilot sessions: recorded false, labelled legacy totals, nothing invented ---');

  let response = await getHistorySession(autopilotSession('session_pre66_cost', {
    totalCost: 0.12,
    totalInputTokens: 5000,
    totalOutputTokens: 200
  }));
  let session = (response && response.session) || {};
  let m = session.measurement || {};
  assert(m.kind === 'autopilot' && m.recorded === false, 'a session without a summary reports recorded: false');
  assert(m.iterations === null && m.modelMs && m.modelMs.total === null && m.modelMs.median === null && m.modelMs.p90 === null &&
    m.toolMs && m.toolMs.total === null && m.toolMs.median === null && m.toolMs.calls === null,
    'unmeasured times are null, never 0');
  assert(m.inputTokens === null && m.outputTokens === null && m.reasoningTokens === null && m.cachedInputTokens === null,
    'unmeasured token counts are null');
  assert(m.usageSource === 'unavailable' && m.costUsd === null && m.costSource === 'unavailable' && m.costIterations === null,
    'cost and usage sources are unavailable');
  assert(m.requestedModel === null && Array.isArray(m.servedModels) && m.servedModels.length === 0 &&
    Array.isArray(m.perIteration) && m.perIteration.length === 0, 'no models and no rows are invented');
  let legacy = m.legacyTotals || {};
  assert(legacy.costUsd === 0.12 && legacy.label === 'legacy price-table total; not provider-reported',
    'legacyTotals keeps the legacy 0.12 with its label');
  assert(session.totalCostBasis === 'estimate' && legacy.costBasis === 'estimate' && legacy.usageBasis === 'provider' &&
    legacy.inputTokens === 5000 && legacy.outputTokens === 200,
    'W1: totalCost 0.12 without a summary is an estimate, and its token totals are provider-based');

  response = await getHistorySession(autopilotSession('session_pre66_zero', {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0
  }));
  session = (response && response.session) || {};
  m = session.measurement || {};
  legacy = m.legacyTotals || {};
  assert(legacy.costUsd === null && legacy.inputTokens === null && legacy.outputTokens === null,
    'legacyTotals values are null unless greater than 0');
  assert(session.totalCost === 0 && session.totalCostBasis === 'unavailable' && legacy.costBasis === 'unavailable' &&
    legacy.usageBasis === 'unavailable', 'W1: totalCost 0 without a summary is unavailable for both bases');
}

async function runActionDurationAllowlistCase() {
  console.log('\n--- action allowlist: measured durationMs and valid timing only ---');

  const response = await getHistorySession(autopilotSession('session_durations', {
    actionHistory: [
      { tool: 'click', timestamp: 1, iteration: 1, params: { selector: '#a' }, result: { success: true }, durationMs: 412 },
      { tool: 'type', timestamp: 2, iteration: 1, params: {}, result: { success: true } },
      { tool: 'scroll', timestamp: 3, iteration: 1, params: {}, result: { success: true }, durationMs: null },
      { tool: 'hover', timestamp: 4, iteration: 2, params: {}, result: { success: true }, durationMs: NaN },
      { tool: 'press', timestamp: 5, iteration: 2, params: {}, result: { success: true }, durationMs: -5 },
      { tool: 'get_site_guide', timestamp: 6, iteration: 2, params: {}, result: { success: true }, durationMs: 0 },
      { tool: 'navigate', timestamp: 7, iteration: 3, params: {}, result: { success: true }, timing: { v: 1, receivedAt: 1000, completedAt: 1400, fsbMs: 1 } },
      { tool: 'navigate', timestamp: 8, iteration: 3, params: {}, result: { success: true }, timing: { v: 1, receivedAt: 1400, completedAt: 1000, fsbMs: 1 } }
    ]
  }));
  const rows = (response && response.session && response.session.actionHistory) || [];
  assert(rows.length === 8 && rows[0].durationMs === 412, 'a measured durationMs of 412 is kept');
  assert(rows.length === 8 && [1, 2, 3, 4].every((index) => !hasOwn(rows[index], 'durationMs')),
    'missing, null, NaN and negative durations leave no durationMs key (never 0)');
  assert(rows.length === 8 && rows[5].durationMs === 0, 'a measured sub-millisecond 0 is kept');
  assert(rows.length === 8 && rows[6].timing && rows[6].timing.fsbMs === 400 && rows[6].timing.completedAt === 1400,
    'a valid timing is kept with fsbMs recomputed');
  assert(rows.length === 8 && !hasOwn(rows[7], 'timing'), 'an invalid timing is dropped');

  const liveId = 'session_live_duration';
  const live = (durationMs) => ({
    sessionId: liveId,
    status: 'running',
    task: 'live',
    startTime: 5,
    iterationCount: 1,
    actionHistory: [{ tool: 'click', timestamp: 9, iteration: 1, params: { selector: '#go' }, result: { success: true }, durationMs }]
  });
  let harness = buildHarness({ activeSessionEntries: [[liveId, live(250)]] });
  let result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: liveId } });
  let current = result && result.session && result.session.currentAction;
  assert(!!current && current.durationMs === 250 &&
    Object.keys(current).join(',') === 'tool,timestamp,iteration,selector,result,durationMs',
    'the in-flight currentAction gains durationMs when the live action measured one');
  harness = buildHarness({ activeSessionEntries: [[liveId, live(null)]] });
  result = await harness.dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: liveId } });
  current = result && result.session && result.session.currentAction;
  assert(!!current && Object.keys(current).join(',') === 'tool,timestamp,iteration,selector,result',
    'an unmeasured live action keeps the pre-Phase-66 currentAction shape');
}

async function runLegacyMcpMeasurementCase() {
  console.log('\n--- legacy MCP sessions: measurement from stored row timing ---');

  const legacyMcp = (sessionId, actionHistory) => ({
    sessionId,
    id: sessionId,
    task: 'MCP legacy session',
    status: 'stopped',
    mode: 'mcp-agent',
    mcpClient: 'Codex',
    startTime: 500,
    endTime: 99999,
    totalCost: 0,
    outcomeDetails: { outcome: 'stopped', reason: 'idle_timeout' },
    actionHistory
  });
  const timedRow = (tool, receivedAt, completedAt) => ({
    tool,
    timestamp: completedAt,
    params: { selector: '#x' },
    result: { success: true },
    timing: timingOf(receivedAt, completedAt),
    durationMs: completedAt - receivedAt
  });

  let response = await getHistorySession(legacyMcp('session_legacy_mcp', [
    timedRow('click_a', 1000, 1120),
    timedRow('click_b', 1620, 1700),
    timedRow('click_c', 1650, 1800)
  ]));
  let session = (response && response.session) || {};
  let m = session.measurement || {};
  assert(m.v === 1 && m.kind === 'mcp' && m.source === 'legacy', 'a legacy MCP session carries the MCP block with source legacy');
  assert(m.calls === 3 && m.callsWithTiming === 3 && m.fsbMs && m.fsbMs.total === 350 && m.fsbMs.median === 120,
    'fsbMs is computed from the stored row timing');
  assert(m.callerGapMs && m.callerGapMs.count === 1 && m.callerGapMs.total === 500 && m.callerGapMs.overlapped === 1,
    'caller gaps: A to B is 500 ms, and C overlapping B counts as overlapped');
  assert(m.callIntervalMs && m.callIntervalMs.count === 2 && m.callIntervalMs.median === 325,
    'call intervals are receive-to-receive (620 and 30)');
  assert(m.activeSpanMs === 800 && m.endReason === 'idle_timeout' && m.idleTimeout === true && m.idleTailExcluded === true,
    'activeSpanMs spans the timed calls and the idle timeout is flagged');
  assert(m.host && m.host.status === 'unavailable' && m.queueWaitStatus === 'not_measured' && m.queueWaitMs === null,
    'host metrics are unavailable and queue wait is not measured');
  assert(m.truncated === false && m.pagesRead === 0 && !hasOwn(m, 'legacyTotals'), 'no paging applies to history rows');
  const rows = session.actionHistory || [];
  assert(rows.length === 3 && rows.every((row) => row.timing && row.durationMs === row.timing.fsbMs),
    'legacy MCP rows keep timing and durationMs');
  assert(session.totalCost === 0 && session.totalCostBasis === 'unavailable', 'the MCP session totalCost 0 is labelled unavailable');

  response = await getHistorySession(legacyMcp('session_legacy_intervals', [
    timedRow('a', 1000, 1100),
    timedRow('b', 1600, 1650),
    timedRow('c', 2600, 2900)
  ]));
  m = ((response && response.session) || {}).measurement || {};
  assert(m.callIntervalMs && m.callIntervalMs.count === 2 && m.callIntervalMs.median === 800 && m.callIntervalMs.p90 === 960,
    'receives at 1000, 1600 and 2600 give intervals with median 800 and p90 960');

  response = await getHistorySession(legacyMcp('session_legacy_break', [
    timedRow('a', 1000, 1100),
    timedRow('b', 1600, 1650),
    { tool: 'untimed', timestamp: 2000, params: {}, result: { success: true } },
    timedRow('c', 2600, 2900)
  ]));
  m = ((response && response.session) || {}).measurement || {};
  assert(m.calls === 4 && m.callsWithTiming === 3 && m.callIntervalMs && m.callIntervalMs.count === 1 &&
    m.callIntervalMs.median === 600, 'an untimed row between two timed rows breaks the chain');
}

async function runLegacyCostBasisCases() {
  console.log('\n--- basis labels: legacy totalCost is never shown unlabelled ---');

  const noUsageRow = autopilotTimingRow(1, {
    usage: { input: null, output: null, reasoning: null, cachedInput: null },
    usageSource: 'unavailable',
    costUsd: null,
    costSource: 'unavailable',
    estimateUsd: null,
    estimateDeltaPct: null
  });
  const unpricedRow = autopilotTimingRow(2, {
    pricingKey: null,
    costUsd: null,
    costSource: 'unavailable',
    estimateUsd: null,
    estimateDeltaPct: null,
    requestedModel: 'totally-unknown-model'
  });
  const lmstudioRow = (iteration) => autopilotTimingRow(iteration, {
    costUsd: 0,
    costSource: 'estimate',
    estimateUsd: 0,
    estimateDeltaPct: null,
    pricingKey: 'lmstudio-local',
    requestedModel: 'qwen2.5-7b-instruct',
    servedModel: 'qwen2.5-7b-instruct',
    provider: 'lmstudio'
  });
  const lmstudioSummary = autopilotSummary({ costUsd: 0, costSource: 'estimate', requestedModel: 'qwen2.5-7b-instruct', servedModels: ['qwen2.5-7b-instruct'] });
  const cases = [
    {
      name: 'I-B: totalCost 0.70 with summary costSource unavailable -> unavailable',
      session: { totalCost: 0.70, iterationTiming: [noUsageRow], measurementSummary: autopilotSummary({ costUsd: null, costIterations: 0, costSource: 'unavailable' }) },
      expected: 'unavailable'
    },
    {
      name: 'I-B: a pricingKey null row makes an estimate summary unavailable',
      session: { totalCost: 0.40, iterationTiming: [autopilotTimingRow(1, { costSource: 'estimate' }), unpricedRow], measurementSummary: autopilotSummary({ costSource: 'estimate' }) },
      expected: 'unavailable'
    },
    {
      name: 'I-B: provider summary with every row priced -> estimate (the legacy total is a price-table sum)',
      session: { totalCost: 0.03, iterationTiming: [autopilotTimingRow(1), autopilotTimingRow(2)], measurementSummary: autopilotSummary() },
      expected: 'estimate'
    },
    {
      name: 'a priced summary is estimate even when totalCost is 0',
      session: { totalCost: 0, iterationTiming: [autopilotTimingRow(1)], measurementSummary: autopilotSummary() },
      expected: 'estimate'
    },
    {
      name: 'LM Studio: a fallback-priced legacy total (> 0) is unavailable, never estimate',
      session: { totalCost: 0.35, iterationTiming: [lmstudioRow(1), lmstudioRow(2)], measurementSummary: lmstudioSummary },
      expected: 'unavailable'
    },
    {
      name: 'LM Studio: a legacy total of 0 matches the local $0 rule and stays estimate',
      session: { totalCost: 0, iterationTiming: [lmstudioRow(1)], measurementSummary: lmstudioSummary },
      expected: 'estimate'
    },
    {
      name: 'a stored provider label is ignored and recomputed',
      session: { totalCost: 0.12, totalCostBasis: 'provider' },
      expected: 'estimate'
    },
    {
      name: 'I-2: a stored unavailable is used as is',
      session: { totalCost: 0.03, totalCostBasis: 'unavailable', iterationTiming: [autopilotTimingRow(1)], measurementSummary: autopilotSummary() },
      expected: 'unavailable'
    },
    {
      name: 'I-2: a stored estimate is used as is',
      session: { totalCost: 0, totalCostBasis: 'estimate' },
      expected: 'estimate'
    }
  ];
  for (const [index, entry] of cases.entries()) {
    const response = await getHistorySession(autopilotSession('session_basis_' + index, entry.session));
    const session = (response && response.session) || {};
    const legacy = (session.measurement && session.measurement.legacyTotals) || {};
    assert(session.totalCostBasis === entry.expected && legacy.costBasis === entry.expected, entry.name);
    assert(findBareTotalCost(response, '') === null, 'no bare totalCost in the response: ' + entry.name);
  }
}

async function runListSessionsBasisCase() {
  console.log('\n--- list_sessions: totalCostBasis beside every totalCost, and agreement with get_session_detail ---');

  const index = [
    { id: 'idx-journal', task: 'journal run', storageBackend: 'journal-v2', mode: 'mcp-agent', startTime: 50 },
    { id: 'idx-stored-unavailable', task: 'stored unavailable', mode: 'autopilot', totalCost: 0.70, totalCostBasis: 'unavailable', startTime: 40 },
    { id: 'idx-pre66-cost', task: 'pre-66 with cost', mode: 'autopilot', totalCost: 0.70, startTime: 30 },
    { id: 'idx-pre66-zero', task: 'pre-66 zero', mode: 'autopilot', totalCost: 0, startTime: 20 },
    { id: 'idx-stored-provider', task: 'bad stored label', mode: 'autopilot', totalCost: 0.12, totalCostBasis: 'provider', startTime: 10 }
  ];
  const record = autopilotSession('idx-stored-unavailable', {
    totalCost: 0.70,
    totalCostBasis: 'unavailable',
    iterationTiming: [autopilotTimingRow(1, {
      usage: { input: null, output: null, reasoning: null, cachedInput: null },
      usageSource: 'unavailable',
      costUsd: null,
      costSource: 'unavailable',
      estimateUsd: null,
      estimateDeltaPct: null
    })],
    measurementSummary: autopilotSummary({ costUsd: null, costIterations: 0, costSource: 'unavailable' })
  });
  const { dispatcher } = buildHarness({
    historicalSession: record,
    listSessions: async () => JSON.parse(JSON.stringify(index))
  });

  const list = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:list-sessions', payload: {} });
  const sessions = (list && list.sessions) || [];
  const byId = Object.fromEntries(sessions.map((entry) => [entry.id, entry]));
  assert(list && list.success === true && sessions.map((entry) => entry.id).join(',') === index.map((entry) => entry.id).join(','),
    'list_sessions keeps its order and entries');
  assert(!hasOwn(byId['idx-journal'], 'totalCostBasis'), 'an entry without totalCost gains nothing');
  assert(byId['idx-stored-unavailable'] && byId['idx-stored-unavailable'].totalCostBasis === 'unavailable',
    'I-2: a stored unavailable is listed as is');
  assert(byId['idx-pre66-cost'] && byId['idx-pre66-cost'].totalCostBasis === 'estimate',
    'a pre-Phase-66 entry with a cost computes estimate (what the stored label prevents for 66+ records)');
  assert(byId['idx-pre66-zero'] && byId['idx-pre66-zero'].totalCostBasis === 'unavailable', 'a pre-Phase-66 zero is unavailable');
  assert(byId['idx-stored-provider'] && byId['idx-stored-provider'].totalCostBasis === 'estimate',
    'a stored provider label is ignored and recomputed');
  assert(sessions.every((entry) => entry.totalCost === (index.find((row) => row.id === entry.id) || {}).totalCost),
    'no legacy totalCost value changes');
  assert(findBareTotalCost(list, '') === null, 'no bare totalCost in the list response');

  const limited = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:list-sessions', payload: { limit: 2 } });
  assert(limited && limited.sessions && limited.sessions.length === 2 && limited.sessions[1].id === 'idx-stored-unavailable',
    'the limit still applies');

  const detail = await dispatcher.dispatchMcpMessageRoute({ type: 'mcp:get-session', payload: { sessionId: 'idx-stored-unavailable' } });
  const session = (detail && detail.session) || {};
  assert(session.totalCostBasis === 'unavailable' &&
    session.measurement && session.measurement.legacyTotals && session.measurement.legacyTotals.costBasis === 'unavailable',
    'I-2: get_session_detail agrees with list_sessions for the same session');
  assert(findBareTotalCost(detail, '') === null, 'no bare totalCost in the detail response');
}

async function run() {
  await runGetSessionDetailFallbackCase();
  await runGetSessionDetailMissingCase();
  await runStopTaskInFlightCase();
  await runStopTaskNoSessionCase();
  await runDispatcherMessageRouteTimingCase();
  await runDispatcherTimingHelpersCase();
  await runDispatcherTaskOutcomeTimingCase();
  runDispatcherTimingSourceContractCase();
  await runJournalSessionDetailCase();
  await runJournalArtifactResultCase();
  await runJournalSessionPagingCase();
  await runJournalSessionPageBoundCase();
  await runJournalLookupErrorCases();
  await runJournalFallthroughIsUnchangedCase();
  await runJournalListRoundTripCase();
  await runJournalIdleTimeoutMeasurementCase();
  await runJournalCallIntervalCase();
  await runAutopilotMeasurementCase();
  await runAutopilotUnrecordedCase();
  await runActionDurationAllowlistCase();
  await runLegacyMcpMeasurementCase();
  await runLegacyCostBasisCases();
  await runListSessionsBasisCase();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
