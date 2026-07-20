/**
 * Concurrency + MCP-only retention coverage for AutomationLogger.
 * Run: node tests/automation-logger-mcp-retention.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
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

(async function main() {
  console.log('--- AutomationLogger concurrent save serialization ---');
  {
    const storage = makeStorage({ fsbMcpSessionRetentionDays: 30 }, 8);
    const logger = loadLogger(storage);
    logger.logSessionStart('session-a', 'First MCP session', 1);
    logger.logSessionStart('session-b', 'Second MCP session', 2);

    const [savedA, savedB] = await Promise.all([
      logger.saveSession('session-a', {
        task: 'First MCP session', mode: 'mcp-agent', startTime: Date.now(),
        status: 'completed', actionHistory: [action('click')]
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

    const storage = makeStorage({
      fsbMcpSessionRetentionDays: 30,
      fsbSessionLogs: sessions,
      fsbSessionIndex: index
    }, 0);
    const logger = loadLogger(storage);

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

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(2);
});
