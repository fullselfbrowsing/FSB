/**
 * Concurrency + MCP-only retention coverage for AutomationLogger.
 * Run: node tests/automation-logger-mcp-retention.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

const LOGGER_PATH = path.resolve(__dirname, '..', 'extension', 'utils', 'automation-logger.js');
const LOGGER_SOURCE = fs.readFileSync(LOGGER_PATH, 'utf8');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeStorage(initial, delayMs) {
  const store = clone(initial || {}) || {};
  const delay = () => new Promise((resolve) => setTimeout(resolve, delayMs || 0));
  return {
    store,
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      // Snapshot at invocation time. Without the logger's mutation lock, two
      // concurrent saves would both read the same stale state and one wins.
      const snapshot = {};
      for (const key of requested) {
        if (Object.prototype.hasOwnProperty.call(store, key)) snapshot[key] = clone(store[key]);
      }
      await delay();
      return snapshot;
    },
    async set(values) {
      const snapshot = clone(values);
      await delay();
      Object.assign(store, snapshot);
    },
    async remove(keys) {
      await delay();
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
    }
  };
}

function loadLogger(storage) {
  const sandbox = {
    chrome: { runtime: { id: 'test-extension' }, storage: { local: storage } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout() { return 1; },
    clearTimeout() {},
    Blob: class Blob {},
    URL: { createObjectURL() { return 'blob:test'; } }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LOGGER_SOURCE, sandbox, { filename: LOGGER_PATH });
  return sandbox.automationLogger;
}

function action(tool) {
  return { tool, params: { selector: '#' + tool }, result: { success: true }, timestamp: Date.now() };
}

function rawLog(sessionId, marker) {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: marker,
    data: { sessionId, action: { tool: 'type', params: { text: marker } }, result: { success: true } }
  };
}

function unscopedLog(marker) {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: marker,
    data: { logType: 'serviceWorker' }
  };
}

function actionRecord(sessionId, marker) {
  return {
    sessionId,
    tool: 'type',
    timestamp: Date.now(),
    params: { text: marker },
    success: true
  };
}

// Phase 66 (plan 66-04) fixtures: v1 iterationTiming rows and measurementSummary.
function timingRow(iteration, overrides) {
  return Object.assign({
    v: 1, iteration, startedAt: 1790726400000 + iteration * 1000, modelMs: 2000 + iteration,
    modelRetried: false, toolMs: 400 + iteration, toolCount: 1,
    usage: { input: 12000, output: 350, reasoning: 420, cachedInput: 8000 },
    usageSource: 'provider', costUsd: 0.008525, costSource: 'provider',
    estimateUsd: 0.016925, estimateDeltaPct: 0.9853, pricingKey: 'grok-4.3',
    requestedModel: 'grok-4.3', servedModel: 'grok-4.3', provider: 'xai'
  }, overrides || {});
}

function measurementSummary(overrides) {
  return Object.assign({
    v: 1, iterations: 2, modelMsTotal: 4003, toolMsTotal: 803, toolCount: 2,
    usage: { input: 24000, output: 700, reasoning: 840, cachedInput: 16000 },
    usageIterations: 2, usageSource: 'provider', costUsd: 0.01705, costIterations: 2,
    costSource: 'provider', requestedModel: 'grok-4.3', servedModels: ['grok-4.3']
  }, overrides || {});
}

function sameJson(actual, expected) {
  return util.isDeepStrictEqual(clone(actual), clone(expected));
}

function hasOwn(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

// Index fields written before Phase 66 (automation-logger.js indexEntry literal).
const PRE_PHASE66_INDEX_FIELDS = [
  'id', 'task', 'startTime', 'endTime', 'status', 'actionCount', 'domSnapshotCount',
  'mode', 'mcpClient', 'taskRunId', 'tabIds', 'tabCount', 'totalCost', 'outcome',
  'outcomeDetails', 'result', 'completionMessage', 'error', 'blocker', 'nextStep',
  'conversationId', 'uiSurface', 'historySessionId', 'commandCount', 'commands',
  'lastTask', 'lastCommandAt', 'replayIntegrity', 'replayProvenance', 'replayableCount',
  'replayBlockedCount'
];

(async function main() {
  console.log('--- AutomationLogger concurrent save serialization ---');
  {
    const storage = makeStorage({ fsbMcpSessionRetentionDays: 30 }, 8);
    const logger = loadLogger(storage);
    logger.logSessionStart('session-a', 'First MCP session', 1);
    logger.logSessionStart('session-b', 'Second MCP session', 2);
    const secondTabAction = action('click');
    secondTabAction.logicalTab = 'tab-2';

    const [savedA, savedB] = await Promise.all([
      logger.saveSession('session-a', {
        task: 'First MCP session', mode: 'mcp-agent', startTime: Date.now(),
        status: 'completed', tabId: 1, tabIds: [1, 7], tabCount: 2,
        taskRunId: 'session-a', actionHistory: [secondTabAction]
      }),
      logger.saveSession('session-b', {
        task: 'Second MCP session', mode: 'mcp-agent', startTime: Date.now(),
        status: 'completed', actionHistory: [action('type')]
      })
    ]);

    check(savedA === true && savedB === true, 'both simultaneous save calls complete successfully');
    check(!!storage.store.fsbSessionLogs['session-a'], 'first session remains in fsbSessionLogs');
    check(!!storage.store.fsbSessionLogs['session-b'], 'second session remains in fsbSessionLogs');
    check(storage.store.fsbSessionIndex.length === 2, 'both simultaneous saves remain in fsbSessionIndex');
    check(new Set(storage.store.fsbSessionIndex.map((entry) => entry.id)).size === 2,
      'serialized index contains two distinct session ids');
    check(storage.store.fsbSessionLogs['session-a'].tabCount === 2 &&
          storage.store.fsbSessionLogs['session-a'].actionHistory[0].logicalTab === 'tab-2',
      'full history preserves logical task tab metadata');
    const indexedA = storage.store.fsbSessionIndex.find((entry) => entry.id === 'session-a');
    check(indexedA.taskRunId === 'session-a' && indexedA.tabCount === 2 && indexedA.tabIds.length === 2,
      'history index preserves one task-run identity and its tab count');
  }

  console.log('\n--- AutomationLogger expired status normalization ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    logger.logSessionStart('expired-session', 'Expired MCP session', 3);
    const saved = await logger.saveSession('expired-session', {
      task: 'Expired MCP session', mode: 'mcp-agent', startTime: Date.now(),
      status: 'expired', actionHistory: [action('click')]
    });
    const full = storage.store.fsbSessionLogs['expired-session'];
    const indexed = storage.store.fsbSessionIndex.find((entry) => entry.id === 'expired-session');
    check(saved === true, 'expired session saves successfully');
    check(full.status === 'expired' && full.outcome === 'stopped',
      'expired full history normalizes to a stopped outcome');
    check(indexed.status === 'expired' && indexed.outcome === 'stopped',
      'expired history index normalizes to the same stopped outcome');
  }

  console.log('\n--- AutomationLogger independent per-mode history caps ---');
  {
    const now = Date.now();
    const sessions = {};
    const index = [];
    const autopilotIds = [];
    const mcpIds = [];

    for (let i = 0; i < 50; i++) {
      const autopilotId = `autopilot-${i}`;
      const mcpId = `mcp-${i}`;
      const autopilot = {
        id: autopilotId,
        task: autopilotId,
        startTime: now - i - 100,
        endTime: now - i,
        status: 'completed'
      };
      if (i !== 0) autopilot.mode = 'autopilot';
      const mcp = {
        id: mcpId,
        task: mcpId,
        mode: 'mcp-agent',
        startTime: now - i - 100,
        endTime: now - i,
        status: 'completed'
      };
      sessions[autopilotId] = clone(autopilot);
      sessions[mcpId] = clone(mcp);
      index.push(clone(autopilot), clone(mcp));
      autopilotIds.push(autopilotId);
      mcpIds.push(mcpId);
    }

    const capLogs = [
      rawLog('mcp-49', 'evicted-mcp-secret'),
      rawLog('autopilot-49', 'evicted-autopilot-secret'),
      rawLog('mcp-0', 'retained-mcp-log')
    ];
    const storage = makeStorage({
      fsbMcpSessionRetentionDays: 30,
      fsbSessionLogs: sessions,
      fsbSessionIndex: index,
      fsbDOMSnapshots: {
        'mcp-49': [{ html: 'evicted-mcp-snapshot' }],
        'autopilot-49': [{ html: 'evicted-autopilot-snapshot' }],
        'mcp-0': [{ html: 'retained-mcp-snapshot' }]
      },
      automationLogs: capLogs
    }, 0);
    const logger = loadLogger(storage);
    logger.logs = clone(capLogs);
    logger._domSnapshots = {
      'mcp-49': [{ html: 'memory-mcp-snapshot' }],
      'autopilot-49': [{ html: 'memory-autopilot-snapshot' }]
    };
    logger.actionRecords = [
      actionRecord('mcp-49', 'evicted-mcp-action'),
      actionRecord('autopilot-49', 'evicted-autopilot-action'),
      actionRecord('mcp-0', 'retained-mcp-action')
    ];

    logger.logSessionStart('mcp-new', 'Newest MCP session', 51);
    const savedMcp = await logger.saveSession('mcp-new', {
      task: 'Newest MCP session', mode: 'mcp-agent', startTime: now,
      status: 'completed', actionHistory: [action('click')]
    });

    const afterMcpIndex = storage.store.fsbSessionIndex;
    const afterMcpIds = afterMcpIndex.map((entry) => entry.id);
    const expectedAfterMcpIds = ['mcp-new'].concat(
      index.map((entry) => entry.id).filter((id) => id !== 'mcp-49')
    );
    check(savedMcp === true, 'saving the 51st MCP session succeeds');
    check(afterMcpIndex.length === 100, 'combined history retains 50 MCP and 50 Autopilot rows');
    check(afterMcpIndex.filter((entry) => entry.mode === 'mcp-agent').length === 50,
      'MCP history is capped independently at 50 rows');
    check(autopilotIds.every((id) => afterMcpIds.includes(id)),
      'saving an MCP session preserves every existing Autopilot row');
    check(!afterMcpIds.includes('mcp-49') && !storage.store.fsbSessionLogs['mcp-49'],
      'the oldest MCP overflow row is removed from the index and full store');
    check(!storage.store.automationLogs.some((log) => log.data?.sessionId === 'mcp-49') &&
          !logger.logs.some((log) => log.data?.sessionId === 'mcp-49'),
      'MCP cap eviction removes persisted and in-memory raw logs');
    check(!storage.store.fsbDOMSnapshots['mcp-49'] && !logger._domSnapshots['mcp-49'],
      'MCP cap eviction removes persisted and in-memory DOM snapshots');
    check(!logger.actionRecords.some((record) => record.sessionId === 'mcp-49'),
      'MCP cap eviction removes in-memory action records');
    check(storage.store.automationLogs.some((log) => log.data?.sessionId === 'autopilot-49'),
      'MCP cap eviction preserves the pending Autopilot raw log');
    check(JSON.stringify(afterMcpIds) === JSON.stringify(expectedAfterMcpIds),
      'per-mode capping preserves the interleaved order of retained rows');
    check(afterMcpIds.includes('autopilot-0') && storage.store.fsbSessionLogs['autopilot-0'].mode === undefined,
      'a legacy row without mode remains in the Autopilot bucket');

    logger.logSessionStart('autopilot-new', 'Newest Autopilot session', 52);
    const savedAutopilot = await logger.saveSession('autopilot-new', {
      task: 'Newest Autopilot session', mode: 'autopilot', startTime: now,
      status: 'completed', actionHistory: [action('type')]
    });

    const afterAutopilotIndex = storage.store.fsbSessionIndex;
    const afterAutopilotIds = afterAutopilotIndex.map((entry) => entry.id);
    const expectedAfterAutopilotIds = ['autopilot-new'].concat(
      afterMcpIds.filter((id) => id !== 'autopilot-49')
    );
    check(savedAutopilot === true, 'saving the 51st Autopilot session succeeds');
    check(afterAutopilotIndex.length === 100, 'combined history remains bounded at 100 rows');
    check(afterAutopilotIndex.filter((entry) => entry.mode !== 'mcp-agent').length === 50,
      'Autopilot history is capped independently at 50 rows');
    check(['mcp-new'].concat(mcpIds.slice(0, 49)).every((id) => afterAutopilotIds.includes(id)),
      'saving an Autopilot session preserves every retained MCP row');
    check(!afterAutopilotIds.includes('autopilot-49') && !storage.store.fsbSessionLogs['autopilot-49'],
      'the oldest Autopilot overflow row is removed from the index and full store');
    check(!storage.store.automationLogs.some((log) => log.data?.sessionId === 'autopilot-49') &&
          !logger.logs.some((log) => log.data?.sessionId === 'autopilot-49'),
      'Autopilot cap eviction removes persisted and in-memory raw logs');
    check(!storage.store.fsbDOMSnapshots['autopilot-49'] && !logger._domSnapshots['autopilot-49'],
      'Autopilot cap eviction removes persisted and in-memory DOM snapshots');
    check(!logger.actionRecords.some((record) => record.sessionId === 'autopilot-49'),
      'Autopilot cap eviction removes in-memory action records');
    check(JSON.stringify(afterAutopilotIds) === JSON.stringify(expectedAfterAutopilotIds),
      'the second per-mode cap also preserves retained-row ordering');
  }

  console.log('\n--- AutomationLogger MCP-only retention pruning ---');
  {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const sessions = {
      'mcp-31d': { id: 'mcp-31d', mode: 'mcp-agent', startTime: now - 32 * DAY, endTime: now - 31 * DAY },
      'mcp-29d': { id: 'mcp-29d', mode: 'mcp-agent', startTime: now - 30 * DAY, endTime: now - 29 * DAY },
      'mcp-8d': { id: 'mcp-8d', mode: 'mcp-agent', startTime: now - 9 * DAY, endTime: now - 8 * DAY },
      'mcp-6d': { id: 'mcp-6d', mode: 'mcp-agent', startTime: now - 7 * DAY, endTime: now - 6 * DAY },
      'mcp-no-time': { id: 'mcp-no-time', mode: 'mcp-agent' },
      'autopilot-400d': { id: 'autopilot-400d', mode: 'autopilot', startTime: now - 401 * DAY, endTime: now - 400 * DAY },
      'authoritative-autopilot': {
        id: 'authoritative-autopilot', mode: 'autopilot', startTime: now - 401 * DAY, endTime: now - 400 * DAY
      }
    };
    const index = Object.values(sessions).map((entry) => ({ ...entry }));
    index.find((entry) => entry.id === 'authoritative-autopilot').mode = 'mcp-agent';
    index.push({ id: 'orphan-mcp-old', mode: 'mcp-agent', startTime: now - 41 * DAY, endTime: now - 40 * DAY });
    const snapshots = {};
    for (const id of [...Object.keys(sessions), 'orphan-mcp-old']) snapshots[id] = [{ html: id }];
    const automationLogs = [
      rawLog('mcp-31d', 'expired-mcp'),
      rawLog('orphan-mcp-old', 'expired-orphan'),
      rawLog('mcp-29d', 'fresh-mcp'),
      rawLog('autopilot-400d', 'old-autopilot')
    ];

    const storage = makeStorage({
      fsbMcpSessionRecordingEnabled: false,
      fsbSessionLogs: sessions,
      fsbSessionIndex: index,
      fsbDOMSnapshots: snapshots,
      automationLogs
    }, 0);
    const logger = loadLogger(storage);
    logger.logs = clone(automationLogs);
    logger._domSnapshots = {
      'mcp-31d': [{ html: 'memory-old' }],
      'mcp-6d': [{ html: 'memory-fresh' }]
    };

    const defaultResult = await logger.pruneMcpSessions(30);
    check(defaultResult.ids.includes('mcp-31d'), '30-day policy removes an MCP session older than 30 days');
    check(defaultResult.ids.includes('orphan-mcp-old'), 'expired orphan MCP index entry is also removed');
    check(!storage.store.fsbSessionLogs['mcp-31d'], 'expired MCP log entry is deleted');
    check(!storage.store.fsbSessionIndex.some((entry) => entry.id === 'mcp-31d'),
      'expired MCP index entry is deleted');
    check(!storage.store.fsbDOMSnapshots['mcp-31d'], 'expired MCP DOM snapshots are deleted');
    check(!logger._domSnapshots['mcp-31d'], 'expired in-memory MCP DOM snapshots are deleted');
    check(!storage.store.automationLogs.some((log) => log.data?.sessionId === 'mcp-31d'),
      'expired MCP raw automation logs are deleted from storage');
    check(!storage.store.automationLogs.some((log) => log.data?.sessionId === 'orphan-mcp-old'),
      'expired orphan MCP raw logs are deleted from storage');
    check(!logger.logs.some((log) => log.data?.sessionId === 'mcp-31d'),
      'expired MCP raw logs are deleted from the in-memory persistence source');
    check(storage.store.automationLogs.some((log) => log.data?.sessionId === 'mcp-29d'),
      'fresh MCP raw logs survive the default cutoff');
    check(storage.store.automationLogs.some((log) => log.data?.sessionId === 'autopilot-400d'),
      'unrelated Autopilot raw logs survive MCP pruning');
    check(!!storage.store.fsbSessionLogs['mcp-29d'], 'fresh MCP session survives the 30-day cutoff');
    check(!!storage.store.fsbSessionLogs['autopilot-400d'], 'old Autopilot history is preserved');
    check(!!storage.store.fsbSessionLogs['authoritative-autopilot'],
      'full Autopilot record wins over a stale MCP index badge');
    check(!!storage.store.fsbSessionLogs['mcp-no-time'], 'MCP entry without a valid timestamp is preserved');

    const customResult = await logger.pruneMcpSessions(7);
    check(customResult.ids.includes('mcp-8d'), 'custom 7-day policy removes an 8-day-old MCP session');
    check(customResult.ids.includes('mcp-29d'), 'custom cutoff also removes older fresh-under-default MCP history');
    check(!!storage.store.fsbSessionLogs['mcp-6d'], '6-day-old MCP session survives a 7-day policy');
    check(!!storage.store.fsbSessionLogs['autopilot-400d'], 'Autopilot history remains after custom pruning');
    check(storage.store.fsbMcpSessionRecordingEnabled === false,
      'recording opt-out remains independent from retention storage');
  }

  console.log('\n--- AutomationLogger closed-session outcome update ---');
  {
    const endTime = Date.now() - 5000;
    const replayAction = action('click');
    const storedSession = {
      id: 'closed-session', task: 'Closed task', mode: 'mcp-agent',
      startTime: endTime - 1000, endTime, status: 'completed', outcome: 'success',
      actionHistory: [replayAction], logs: [rawLog('closed-session', 'preserve-log')]
    };
    const storage = makeStorage({
      fsbSessionLogs: { 'closed-session': storedSession },
      fsbSessionIndex: [{
        id: 'closed-session', task: 'Closed task', mode: 'mcp-agent',
        startTime: storedSession.startTime, endTime, status: 'completed', outcome: 'success'
      }]
    }, 4);
    const logger = loadLogger(storage);
    const updated = await logger.updateSessionOutcome('closed-session', {
      status: 'failed',
      outcome: 'failure',
      outcomeDetails: {
        outcome: 'failure', reason: 'missing-data', summary: null,
        blocker: null, nextStep: null, result: null, error: 'Requested data does not exist'
      },
      error: 'Requested data does not exist'
    });

    const full = storage.store.fsbSessionLogs['closed-session'];
    const indexed = storage.store.fsbSessionIndex[0];
    check(updated === true, 'closed-session outcome update reports success');
    check(full.status === 'failed' && full.outcome === 'failure',
      'full history row reflects the terminal failure');
    check(indexed.status === 'failed' && indexed.outcome === 'failure',
      'history index reflects the same terminal failure');
    check(full.error === 'Requested data does not exist' && indexed.error === full.error,
      'full history and index preserve the terminal error');
    check(full.endTime === endTime && indexed.endTime === endTime,
      'outcome-only update preserves the original session end time');
    check(full.actionHistory.length === 1 && full.actionHistory[0].tool === 'click',
      'outcome-only update preserves replay history');
    check(full.logs.length === 1 && full.logs[0].message === 'preserve-log',
      'outcome-only update preserves session logs');
  }

  console.log('\n--- AutomationLogger complete individual session deletion ---');
  {
    const targetId = 'delete-target';
    const keepId = 'delete-keep';
    const globalLog = unscopedLog('keep-global-diagnostic');
    const logs = [
      rawLog(targetId, 'delete-sensitive-text'),
      rawLog(keepId, 'keep-other-session'),
      globalLog
    ];
    const storage = makeStorage({
      fsbSessionLogs: {
        [targetId]: { id: targetId, mode: 'mcp-agent' },
        [keepId]: { id: keepId, mode: 'autopilot' }
      },
      fsbSessionIndex: [{ id: targetId }, { id: keepId }],
      fsbDOMSnapshots: {
        [targetId]: [{ html: 'delete-persisted-snapshot' }],
        [keepId]: [{ html: 'keep-persisted-snapshot' }]
      },
      automationLogs: logs
    }, 8);
    const logger = loadLogger(storage);
    logger.logs = clone(logs);
    logger._domSnapshots = {
      [targetId]: [{ html: 'delete-memory-snapshot' }],
      [keepId]: [{ html: 'keep-memory-snapshot' }]
    };
    logger.actionRecords = [
      actionRecord(targetId, 'delete-action'),
      actionRecord(keepId, 'keep-action'),
      actionRecord(null, 'keep-unscoped-action')
    ];

    // Queue persistence first to prove deletion remains the authoritative final write.
    const [, deleted] = await Promise.all([logger.persistLogs(), logger.deleteSession(targetId)]);
    check(deleted === true, 'individual deletion reports success');
    check(!storage.store.fsbSessionLogs[targetId] &&
          !storage.store.fsbSessionIndex.some((entry) => entry.id === targetId),
      'individual deletion removes the full and indexed history rows');
    check(!storage.store.fsbDOMSnapshots[targetId] && !logger._domSnapshots[targetId],
      'individual deletion removes persisted and in-memory snapshots');
    check(!storage.store.automationLogs.some((log) => log.data?.sessionId === targetId) &&
          !logger.logs.some((log) => log.data?.sessionId === targetId),
      'individual deletion removes persisted and in-memory raw logs after a queued persist');
    check(!logger.actionRecords.some((record) => record.sessionId === targetId),
      'individual deletion removes in-memory action records');
    check(!!storage.store.fsbSessionLogs[keepId] &&
          storage.store.automationLogs.some((log) => log.data?.sessionId === keepId),
      'individual deletion preserves unrelated session history and logs');
    check(storage.store.automationLogs.some((log) => log.message === globalLog.message),
      'individual deletion preserves unscoped diagnostics');
  }

  console.log('\n--- AutomationLogger clear-all removes orphan session artifacts ---');
  {
    const logs = [
      rawLog('saved-mcp', 'saved-session-secret'),
      rawLog('already-orphaned', 'orphaned-session-secret'),
      unscopedLog('keep-global-diagnostic')
    ];
    const storage = makeStorage({
      fsbSessionLogs: { 'saved-mcp': { id: 'saved-mcp', mode: 'mcp-agent' } },
      fsbSessionIndex: [{ id: 'saved-mcp', mode: 'mcp-agent' }],
      fsbDOMSnapshots: { 'saved-mcp': [{ html: 'saved-snapshot' }] },
      automationLogs: logs
    }, 0);
    const logger = loadLogger(storage);
    logger.logs = clone(logs);
    logger._domSnapshots = { 'saved-mcp': [{ html: 'memory-snapshot' }] };
    logger.actionRecords = [
      actionRecord('saved-mcp', 'saved-action'),
      actionRecord('already-orphaned', 'orphan-action'),
      actionRecord(null, 'keep-unscoped-action')
    ];

    const cleared = await logger.clearAllSessions();
    check(cleared === true, 'clear-all reports success');
    check(Object.keys(storage.store.fsbSessionLogs).length === 0 && storage.store.fsbSessionIndex.length === 0,
      'clear-all empties full and indexed session history');
    check(Object.keys(storage.store.fsbDOMSnapshots).length === 0 &&
          Object.keys(logger._domSnapshots).length === 0,
      'clear-all empties persisted and in-memory snapshots');
    check(storage.store.automationLogs.length === 1 &&
          storage.store.automationLogs[0].message === 'keep-global-diagnostic',
      'clear-all removes saved and already-orphaned raw session logs but preserves global diagnostics');
    check(logger.logs.length === 1 && logger.logs[0].message === 'keep-global-diagnostic',
      'clear-all keeps the in-memory persistence source aligned with storage');
    check(logger.actionRecords.length === 1 && logger.actionRecords[0].sessionId === null,
      'clear-all removes session action records while preserving unscoped records');
  }

  console.log('\n--- AutomationLogger external scrub shares the save lock ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [], automationLogs: [] }, 8);
    const logger = loadLogger(storage);
    logger.logSessionStart('new-session', 'New MCP session', 9);
    const save = logger.saveSession('new-session', {
      task: 'New MCP session', mode: 'mcp-agent', startTime: Date.now(),
      status: 'completed', actionHistory: [action('click')]
    });
    const scrub = logger.withSessionMutationLock(async () => {
      const stored = await storage.get(['fsbSessionLogs', 'automationLogs']);
      await storage.set({
        fsbSessionLogs: stored.fsbSessionLogs || {},
        automationLogs: stored.automationLogs || [],
        fsbMcpSessionRedactionVersion: 1
      });
    });

    await Promise.all([save, scrub]);
    check(!!storage.store.fsbSessionLogs['new-session'],
      'startup scrub queued after a session save preserves the new history row');
    check(storage.store.fsbSessionIndex.some((entry) => entry.id === 'new-session'),
      'startup scrub does not leave a dangling index entry');
    check(storage.store.fsbMcpSessionRedactionVersion === 1,
      'startup scrub marker is written after the serialized snapshot');
  }

  console.log('\n--- AutomationLogger save and closed-outcome update serialize ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 8);
    const logger = loadLogger(storage);
    const sessionId = 'save-then-outcome';
    logger.logSessionStart(sessionId, 'Finish after is_final', 12);

    const save = logger.saveSession(sessionId, {
      task: 'Finish after is_final', mode: 'mcp-agent', startTime: Date.now(),
      status: 'completed', actionHistory: [action('click')]
    });
    const update = logger.updateSessionOutcome(sessionId, {
      status: 'partial', outcome: 'partial',
      outcomeDetails: {
        outcome: 'partial', reason: 'manual-approval', summary: 'Prepared the change',
        blocker: 'Manual approval required', nextStep: 'Approve the change', result: null, error: null
      },
      completionMessage: 'Prepared the change',
      blocker: 'Manual approval required',
      nextStep: 'Approve the change'
    });

    const [, updated] = await Promise.all([save, update]);
    const full = storage.store.fsbSessionLogs[sessionId];
    const indexed = storage.store.fsbSessionIndex.find((entry) => entry.id === sessionId);
    check(updated === true, 'outcome update waits for the queued session save and succeeds');
    check(full.status === 'partial' && full.outcome === 'partial',
      'queued history save retains the later terminal outcome');
    check(indexed.status === 'partial' && indexed.outcome === 'partial',
      'queued index save retains the later terminal outcome');
    check(full.blocker === 'Manual approval required' && indexed.nextStep === 'Approve the change',
      'serialized full and index rows retain partial outcome details');
    check(full.actionHistory.length === 1 && full.actionHistory[0].tool === 'click',
      'serialized outcome patch leaves the saved replay history intact');
  }

  console.log('\n--- AutomationLogger pending persistence cannot resurrect pruned logs ---');
  {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const sessions = {
      expired: { id: 'expired', mode: 'mcp-agent', startTime: now - 40 * DAY, endTime: now - 39 * DAY },
      fresh: { id: 'fresh', mode: 'mcp-agent', startTime: now - 2 * DAY, endTime: now - DAY },
      autopilot: { id: 'autopilot', mode: 'autopilot', startTime: now - 400 * DAY, endTime: now - 399 * DAY }
    };
    const logs = [
      rawLog('expired', 'must-disappear'),
      rawLog('fresh', 'must-remain'),
      rawLog('autopilot', 'autopilot-remains')
    ];
    const storage = makeStorage({
      fsbSessionLogs: sessions,
      fsbSessionIndex: Object.values(sessions),
      fsbDOMSnapshots: {},
      automationLogs: logs
    }, 8);
    const logger = loadLogger(storage);
    logger.logs = clone(logs);

    // Queue a raw-log persist first, then pruning. Both must serialize on the
    // session mutation lock, leaving prune as the final authoritative write.
    await Promise.all([logger.persistLogs(), logger.pruneMcpSessions(30)]);
    check(!storage.store.automationLogs.some((log) => log.data?.sessionId === 'expired'),
      'a pending persist cannot restore an expired MCP raw log');
    check(!logger.logs.some((log) => log.data?.sessionId === 'expired'),
      'the in-memory queue remains pruned after concurrent persistence');
    check(storage.store.automationLogs.some((log) => log.data?.sessionId === 'fresh'),
      'concurrent persistence preserves fresh MCP logs');
    check(storage.store.automationLogs.some((log) => log.data?.sessionId === 'autopilot'),
      'concurrent persistence preserves Autopilot logs');
  }

  // ---------------------------------------------------------------------------
  // Phase 66 (plan 66-04): measurement persistence, save-time cost basis (I-2)
  // and timing lines in the autopilot text export
  // ---------------------------------------------------------------------------

  console.log('\n--- AutomationLogger Phase 66: new-session save persists measurement fields ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    const sessionId = 'measured-new';
    logger.logSessionStart(sessionId, 'Measured autopilot session', 21);
    const timedClick = action('click');
    timedClick.durationMs = 412;
    const untimedType = action('type_text');
    const rows = [timingRow(1), timingRow(2)];
    const summary = measurementSummary();
    const saved = await logger.saveSession(sessionId, {
      task: 'Measured autopilot session', mode: 'autopilot', startTime: Date.now(),
      status: 'completed', totalCost: 0.12, actionHistory: [timedClick, untimedType],
      iterationTiming: rows, measurementSummary: summary
    });
    const full = storage.store.fsbSessionLogs[sessionId];
    const indexed = storage.store.fsbSessionIndex.find((entry) => entry.id === sessionId);
    check(saved === true, 'measured autopilot session saves successfully');
    check(full.actionHistory[0].durationMs === 412, 'an executed action keeps its measured durationMs');
    check(hasOwn(full.actionHistory[1], 'durationMs') && full.actionHistory[1].durationMs === null,
      'an action without a measurement persists durationMs null, never 0');
    check(!hasOwn(full.actionHistory[0], 'timing'), 'autopilot action rows carry no MCP timing key');
    check(full.actionHistory[0].logicalTab === 'primary' && full.actionHistory[0].tool === 'click',
      'existing action-row fields are unchanged');
    check(sameJson(full.iterationTiming, rows), 'iterationTiming persists deep-equal to the session rows');
    check(sameJson(full.measurementSummary, summary), 'measurementSummary persists deep-equal to the session summary');
    check(full.totalCost === 0.12 && full.totalInputTokens === 0 && full.totalOutputTokens === 0,
      'legacy totals keep their existing values and defaults (D-02)');
    check(full.totalCostBasis === 'estimate' && indexed.totalCostBasis === full.totalCostBasis,
      'record and index carry the same save-time totalCostBasis');
    check(!hasOwn(indexed, 'iterationTiming') && !hasOwn(indexed, 'measurementSummary'),
      'index entry stays lean: no iterationTiming or measurementSummary');
    check(indexed.totalCost === 0.12 && indexed.status === 'completed' && indexed.mode === 'autopilot' &&
          indexed.actionCount === 2 && indexed.taskRunId === sessionId,
      'existing index fields keep their values');
  }

  console.log('\n--- AutomationLogger Phase 66: index entry gains exactly one field ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    logger.logSessionStart('plain-session', 'Plain session', 22);
    logger.logSessionStart('rich-session', 'Rich session', 23);
    await logger.saveSession('plain-session', {
      task: 'Plain session', mode: 'autopilot', startTime: Date.now(),
      status: 'completed', actionHistory: [action('click')]
    });
    await logger.saveSession('rich-session', {
      task: 'Rich session', mode: 'autopilot', startTime: Date.now(), status: 'completed',
      actionHistory: [action('click')], iterationTiming: [timingRow(1)], measurementSummary: measurementSummary()
    });
    const plainKeys = Object.keys(storage.store.fsbSessionIndex.find((entry) => entry.id === 'plain-session')).sort();
    const richKeys = Object.keys(storage.store.fsbSessionIndex.find((entry) => entry.id === 'rich-session')).sort();
    check(JSON.stringify(plainKeys) === JSON.stringify(richKeys),
      'measurement data adds nothing to the index beyond the always-present basis');
    check(richKeys.filter((key) => !PRE_PHASE66_INDEX_FIELDS.includes(key)).join(',') === 'totalCostBasis',
      'the only new index field is totalCostBasis');
    check(PRE_PHASE66_INDEX_FIELDS.every((key) => richKeys.includes(key)),
      'every pre-Phase-66 index field is still written');
  }

  console.log('\n--- AutomationLogger Phase 66: existing-session saves replace or keep measurement fields ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    const sessionId = 'measured-existing';
    logger.logSessionStart(sessionId, 'Measured existing session', 24);
    await logger.saveSession(sessionId, {
      task: 'Measured existing session', mode: 'autopilot', startTime: Date.now(), status: 'running',
      actionHistory: [action('click')], iterationTiming: [timingRow(1)],
      measurementSummary: measurementSummary({ iterations: 1 })
    });
    const rows3 = [timingRow(1), timingRow(2), timingRow(3)];
    const summary3 = measurementSummary({ iterations: 3, modelMsTotal: 6006 });
    const timedNavigate = action('navigate');
    timedNavigate.durationMs = 250;
    await logger.saveSession(sessionId, {
      task: 'Measured existing session', mode: 'autopilot', status: 'running',
      actionHistory: [action('click'), timedNavigate], iterationTiming: rows3, measurementSummary: summary3
    });
    let full = storage.store.fsbSessionLogs[sessionId];
    check(sameJson(full.iterationTiming, rows3), 'a later save with 3 rows replaces the stored iterationTiming');
    check(sameJson(full.measurementSummary, summary3), 'a later save with a new summary replaces measurementSummary');
    check(full.actionHistory[0].durationMs === null && full.actionHistory[1].durationMs === 250,
      'the existing-session action projection keeps durationMs (null when unmeasured)');
    await logger.saveSession(sessionId, {
      task: 'Measured existing session', mode: 'autopilot', status: 'completed',
      actionHistory: [action('click'), timedNavigate]
    });
    full = storage.store.fsbSessionLogs[sessionId];
    check(sameJson(full.iterationTiming, rows3), 'a save without iterationTiming keeps the stored rows');
    check(sameJson(full.measurementSummary, summary3), 'a save without measurementSummary keeps the stored summary');
    check(full.status === 'completed', 'the later save still updates status');
  }

  console.log('\n--- AutomationLogger Phase 66: iterationTiming cap and row filter ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    const rows = [];
    for (let i = 1; i <= 150; i++) rows.push(timingRow(i));
    logger.logSessionStart('capped-timing', 'Capped timing', 26);
    await logger.saveSession('capped-timing', {
      task: 'Capped timing', mode: 'autopilot', startTime: Date.now(), status: 'completed',
      actionHistory: [action('click')], iterationTiming: rows, measurementSummary: measurementSummary({ iterations: 150 })
    });
    const persisted = storage.store.fsbSessionLogs['capped-timing'].iterationTiming;
    check(Array.isArray(persisted) && persisted.length === 100, 'a 150-row iterationTiming persists 100 rows');
    check(Array.isArray(persisted) && persisted.length === 100 && persisted[0].iteration === 51 && persisted[99].iteration === 150,
      'the last 100 rows are kept');

    logger.logSessionStart('filtered-timing', 'Filtered timing', 27);
    await logger.saveSession('filtered-timing', {
      task: 'Filtered timing', mode: 'autopilot', startTime: Date.now(), status: 'completed',
      actionHistory: [action('click')], iterationTiming: [null, 'corrupt', timingRow(1), [1, 2], timingRow(2)],
      measurementSummary: ['not', 'a', 'summary']
    });
    const filtered = storage.store.fsbSessionLogs['filtered-timing'];
    check(sameJson(filtered.iterationTiming, [timingRow(1), timingRow(2)]), 'only plain-object rows persist');
    check(!hasOwn(filtered, 'measurementSummary'), 'a non-object measurementSummary is not persisted');
  }

  console.log('\n--- AutomationLogger Phase 66: legacy MCP call timing survives both save branches ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    const sessionId = 'legacy-mcp-timing';
    logger.logSessionStart(sessionId, 'Legacy MCP timing', 25);
    const timed = action('click');
    timed.timing = { v: 1, receivedAt: 1000, completedAt: 1400, fsbMs: 400 };
    timed.durationMs = 400;
    const invalid = action('read_page');
    invalid.timing = { v: 1, receivedAt: 2000, completedAt: 1500, fsbMs: 500 };
    const wrongFsb = action('scroll');
    wrongFsb.timing = { v: 1, receivedAt: 3000, completedAt: 3250, fsbMs: 9999 };
    wrongFsb.durationMs = 250;
    const otherVersion = action('type_text');
    otherVersion.timing = { v: 2, receivedAt: 1, completedAt: 2, fsbMs: 1 };
    otherVersion.durationMs = -5;
    const history = [timed, invalid, wrongFsb, otherVersion];
    await logger.saveSession(sessionId, {
      task: 'Legacy MCP timing', mode: 'mcp-agent', mcpClient: 'Claude', startTime: Date.now(),
      status: 'running', actionHistory: history
    });
    const checkRows = (label) => {
      const rows = storage.store.fsbSessionLogs[sessionId].actionHistory;
      check(sameJson(rows[0].timing, { v: 1, receivedAt: 1000, completedAt: 1400, fsbMs: 400 }) && rows[0].durationMs === 400,
        label + ': valid timing and durationMs persist');
      check(!hasOwn(rows[1], 'timing') && rows[1].durationMs === null,
        label + ': invalid timing (completedAt < receivedAt) persists no timing key and durationMs null');
      check(rows[2].timing && rows[2].timing.fsbMs === 250 && rows[2].durationMs === 250,
        label + ': fsbMs is recomputed from receivedAt and completedAt');
      check(!hasOwn(rows[3], 'timing') && rows[3].durationMs === null,
        label + ': a non-v1 timing and a negative durationMs are dropped');
    };
    checkRows('new-session branch');
    await logger.saveSession(sessionId, {
      task: 'Legacy MCP timing', mode: 'mcp-agent', mcpClient: 'Claude', status: 'completed', actionHistory: history
    });
    checkRows('existing-session branch');
  }

  console.log('\n--- AutomationLogger Phase 66: save-time totalCostBasis on record and index (I-2) ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    const basisOf = (id) => ({
      full: storage.store.fsbSessionLogs[id].totalCostBasis,
      indexed: storage.store.fsbSessionIndex.find((entry) => entry.id === id).totalCostBasis
    });
    const saveBasis = async (id, data) => {
      logger.logSessionStart(id, id, 30);
      await logger.saveSession(id, Object.assign({
        task: id, mode: 'autopilot', startTime: Date.now(), status: 'completed', actionHistory: [action('click')]
      }, data));
      return basisOf(id);
    };
    const unpricedRow = timingRow(2, {
      pricingKey: null, costUsd: null, costSource: 'unavailable', estimateUsd: null, estimateDeltaPct: null,
      requestedModel: 'totally-unknown-model'
    });
    const noUsageRow = timingRow(1, {
      usage: { input: null, output: null, reasoning: null, cachedInput: null }, usageSource: 'unavailable',
      costUsd: null, costSource: 'unavailable', estimateUsd: null, estimateDeltaPct: null
    });

    let basis = await saveBasis('basis-summary-unavailable', {
      totalCost: 0.70, iterationTiming: [noUsageRow],
      measurementSummary: measurementSummary({ costUsd: null, costIterations: 0, costSource: 'unavailable' })
    });
    check(basis.full === 'unavailable' && basis.indexed === 'unavailable',
      'totalCost 0.70 with summary costSource unavailable -> unavailable (record and index)');

    basis = await saveBasis('basis-unpriced-row', {
      totalCost: 0.40, iterationTiming: [timingRow(1, { costSource: 'estimate' }), unpricedRow],
      measurementSummary: measurementSummary({ costSource: 'estimate' })
    });
    check(basis.full === 'unavailable' && basis.indexed === 'unavailable',
      'summary costSource estimate with a pricingKey null row -> unavailable');

    basis = await saveBasis('basis-provider-priced', {
      totalCost: 0.03, iterationTiming: [timingRow(1), timingRow(2)], measurementSummary: measurementSummary()
    });
    check(basis.full === 'estimate' && basis.indexed === 'estimate',
      'summary costSource provider with priced rows -> estimate (the legacy total is a price-table sum)');

    basis = await saveBasis('basis-provider-zero', {
      totalCost: 0, iterationTiming: [timingRow(1)], measurementSummary: measurementSummary()
    });
    check(basis.full === 'estimate' && basis.indexed === 'estimate', 'a priced summary is estimate even when totalCost is 0');

    // LM Studio rows carry the local $0 estimate, but the legacy record()
    // call does not pass the provider, so a positive legacy total beside
    // them was priced at the unknown-model display fallback (66-06).
    const lmstudioRow = timingRow(1, {
      costUsd: 0, costSource: 'estimate', estimateUsd: 0, estimateDeltaPct: null, pricingKey: 'lmstudio-local',
      requestedModel: 'qwen2.5-7b-instruct', servedModel: 'qwen2.5-7b-instruct', provider: 'lmstudio'
    });
    const lmstudioSummary = measurementSummary({
      costUsd: 0, costSource: 'estimate', requestedModel: 'qwen2.5-7b-instruct', servedModels: ['qwen2.5-7b-instruct']
    });
    basis = await saveBasis('basis-lmstudio-fallback', {
      totalCost: 0.35, iterationTiming: [lmstudioRow], measurementSummary: lmstudioSummary
    });
    check(basis.full === 'unavailable' && basis.indexed === 'unavailable',
      'LM Studio rows with a positive (fallback-priced) legacy total -> unavailable (record and index)');
    basis = await saveBasis('basis-lmstudio-zero', {
      totalCost: 0, iterationTiming: [lmstudioRow], measurementSummary: lmstudioSummary
    });
    check(basis.full === 'estimate' && basis.indexed === 'estimate', 'LM Studio rows with a legacy total of 0 -> estimate');
    check(storage.store.fsbSessionLogs['basis-lmstudio-fallback'].totalCost === 0.35,
      'the LM Studio legacy totalCost keeps its value (D-02)');

    basis = await saveBasis('basis-no-summary-cost', { totalCost: 0.12 });
    check(basis.full === 'estimate' && basis.indexed === 'estimate', 'no summary with totalCost 0.12 -> estimate');

    basis = await saveBasis('basis-no-summary-zero', { totalCost: 0 });
    check(basis.full === 'unavailable' && basis.indexed === 'unavailable', 'no summary with totalCost 0 -> unavailable');

    basis = await saveBasis('basis-no-summary-missing', {});
    check(basis.full === 'unavailable' && basis.indexed === 'unavailable', 'no summary and no totalCost -> unavailable');

    const recomputeId = 'basis-recompute';
    basis = await saveBasis(recomputeId, {
      totalCost: 0.70, iterationTiming: [noUsageRow],
      measurementSummary: measurementSummary({ costUsd: null, costIterations: 0, costSource: 'unavailable' })
    });
    check(basis.full === 'unavailable' && basis.indexed === 'unavailable', 'recompute case starts unavailable');
    await logger.saveSession(recomputeId, {
      task: recomputeId, mode: 'autopilot', status: 'completed', totalCost: 0.70, actionHistory: [action('click')],
      iterationTiming: [timingRow(1), timingRow(2)], measurementSummary: measurementSummary()
    });
    basis = basisOf(recomputeId);
    check(basis.full === 'estimate' && basis.indexed === 'estimate', 'a second save with a new summary recomputes both places');
    await logger.saveSession(recomputeId, {
      task: recomputeId, mode: 'autopilot', status: 'completed', totalCost: 0.70, actionHistory: [action('click')]
    });
    basis = basisOf(recomputeId);
    check(basis.full === 'estimate' && basis.indexed === 'estimate',
      'a save without summary fields keeps the stored summary and so the same basis');
    check(sameJson(storage.store.fsbSessionLogs[recomputeId].measurementSummary, measurementSummary()),
      'the kept summary is the one stored by the previous save');
  }

  console.log('\n--- AutomationLogger Phase 66: autopilot text export shows per-iteration and per-call ms ---');
  {
    const storage = makeStorage({ fsbSessionLogs: {}, fsbSessionIndex: [] }, 0);
    const logger = loadLogger(storage);
    logger.logSessionStart('export-measured', 'Export measured', 31);
    const timedClick = action('click');
    timedClick.durationMs = 412;
    await logger.saveSession('export-measured', {
      task: 'Export measured', mode: 'autopilot', startTime: Date.now(), status: 'completed',
      actionHistory: [timedClick, action('type_text')],
      iterationTiming: [
        timingRow(1, { modelRetried: true }),
        timingRow(2, { toolMs: null, toolCount: 0, costUsd: null, costSource: 'unavailable', servedModel: null, modelMs: null })
      ],
      measurementSummary: measurementSummary()
    });
    const text = await logger.exportHumanReadable('export-measured');
    const lines = text.split('\n');
    check(lines.some((line) => line.startsWith('Timing: model ')), 'export includes a line starting "Timing: model "');
    check(lines.some((line) => line.startsWith('Iteration 1: model ')), 'export includes a line starting "Iteration 1: model "');
    check(lines.some((line) => /^Call \d+: \S+ \| \d+ ms$/.test(line)), 'export includes a per-call ms line');
    check(lines.includes('Timing: model 4003 ms over 2 iterations | tools 803 ms over 2 calls | cost $0.017050 (provider)'),
      'the session line shows model, tool and labelled cost totals');
    check(lines.includes('Iteration 1: model 2001 ms, retried | tools 401 ms (1 calls) | cost $0.008525 (provider) | served grok-4.3'),
      'an iteration line shows model ms, the retry mark, tool ms, labelled cost and the served model');
    check(lines.includes('Iteration 2: model n/a | tools none (0 calls) | cost unavailable | served unknown'),
      'unmeasured iteration values are labelled, never shown as 0');
    check(lines.includes('Call 1: click | 412 ms'), 'the executed call shows its measured ms');
    check(!lines.some((line) => line.startsWith('Call 2:')), 'an unmeasured call gets no timing line');
    check(text.indexOf('[OK] Step 1: click') !== -1 && text.indexOf('[OK] Step 1: click') < text.indexOf('Timing: model '),
      'timing lines follow the step lines');

    logger.logSessionStart('export-plain', 'Export plain', 32);
    await logger.saveSession('export-plain', {
      task: 'Export plain', mode: 'autopilot', startTime: Date.now(), status: 'completed', actionHistory: [action('click')]
    });
    const plainLines = (await logger.exportHumanReadable('export-plain')).split('\n');
    check(plainLines.includes('Timing: not recorded for this session'), 'a session with no timing says so');
    check(!plainLines.some((line) => line.startsWith('Call ')), 'a session with no timing has no call lines');

    logger.logSessionStart('export-mcp', 'Export legacy MCP', 33);
    const mcpRow = action('read_page');
    mcpRow.timing = { v: 1, receivedAt: 5000, completedAt: 5400, fsbMs: 400 };
    mcpRow.durationMs = 400;
    await logger.saveSession('export-mcp', {
      task: 'Export legacy MCP', mode: 'mcp-agent', mcpClient: 'Claude', startTime: Date.now(),
      status: 'completed', actionHistory: [mcpRow]
    });
    const mcpLines = (await logger.exportHumanReadable('export-mcp')).split('\n');
    check(mcpLines.includes('Call 1: read_page | 400 ms'), 'a legacy MCP session shows per-call ms');
    check(!mcpLines.some((line) => line.startsWith('Timing: model ')) &&
          !mcpLines.includes('Timing: not recorded for this session'),
      'a legacy MCP session has call lines but no autopilot summary line');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(2);
});
