'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LOGGER_PATH = path.join(ROOT, 'extension/utils/automation-logger.js');
const LOGGER_SOURCE = fs.readFileSync(LOGGER_PATH, 'utf8');

function loadLogger({ sendMessage, store } = {}) {
  const runtime = { id: 'phase-54-test-extension' };
  if (sendMessage) runtime.sendMessage = sendMessage.bind(null, runtime);
  const context = {
    chrome: { runtime },
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    TextEncoder,
    globalThis: null
  };
  if (store) context.fsbTrustedLocalFeatureStore = store;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(LOGGER_SOURCE, context, { filename: 'automation-logger.js' });
  return { logger: context.automationLogger, runtime };
}

function seedMemory(logger, sessionId) {
  logger.logs = [{
    timestamp: new Date(0).toISOString(),
    level: 'info',
    message: 'session record',
    data: { sessionId }
  }];
  logger._domSnapshots = {
    [sessionId]: [{
      url: 'https://example.test/private/path',
      timestamp: 1,
      iteration: 1,
      elementCount: 2
    }]
  };
}

function assertMemoryRetained(logger, sessionId, label) {
  assert.equal(logger.logs.length, 1, `${label}: session logs remain retryable`);
  assert.equal(logger._domSnapshots[sessionId].length, 1,
    `${label}: DOM snapshot accumulator remains retryable`);
}

async function exerciseFailure(label, options) {
  const sessionId = `session-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const { logger } = loadLogger(options);
  seedMemory(logger, sessionId);

  assert.equal(await logger.saveSession(sessionId, { status: 'completed' }), false,
    `${label}: save requires an explicit trusted acknowledgement`);
  assertMemoryRetained(logger, sessionId, label);

  assert.equal(await logger.deleteSession(sessionId), false,
    `${label}: delete requires an explicit trusted acknowledgement`);
  assertMemoryRetained(logger, sessionId, label);

  assert.equal(await logger.clearAllSessions(), false,
    `${label}: clear requires an explicit trusted acknowledgement`);
  assertMemoryRetained(logger, sessionId, label);

  assert.equal(await logger.updateSessionOutcome(sessionId, {
    status: 'failed', outcome: 'failure', error: 'not persisted'
  }), false, `${label}: outcome update requires an explicit trusted acknowledgement`);
  assertMemoryRetained(logger, sessionId, label);

  const pruneResult = await logger.pruneMcpSessions(30);
  assert.equal(pruneResult.removed, 0,
    `${label}: prune reports no removal without a trusted acknowledgement`);
  assert.deepEqual(Array.from(pruneResult.ids), [],
    `${label}: prune returns no IDs without a trusted acknowledgement`);
  assertMemoryRetained(logger, sessionId, label);
}

async function run() {
  await exerciseFailure('missing runtime message support');

  await exerciseFailure('runtime lastError', {
    sendMessage(runtime, _message, callback) {
      runtime.lastError = { message: 'Receiving end does not exist' };
      callback(undefined);
      delete runtime.lastError;
    }
  });

  await exerciseFailure('undefined response', {
    sendMessage(_runtime, _message, callback) {
      callback(undefined);
    }
  });

  await exerciseFailure('thrown send', {
    sendMessage() {
      throw new Error('extension context invalidated');
    }
  });

  await exerciseFailure('trusted storage rejection', {
    store: {
      loadAutomationSession: async () => ({ session: null }),
      saveAutomationSession: async () => { throw new Error('storage rejected'); },
      deleteAutomationSession: async () => { throw new Error('storage rejected'); },
      clearAutomationSessions: async () => { throw new Error('storage rejected'); },
      updateAutomationSessionOutcome: async () => { throw new Error('storage rejected'); },
      pruneMcpAutomationSessions: async () => { throw new Error('storage rejected'); }
    }
  });

  const messages = [];
  const acknowledged = loadLogger({
    sendMessage(_runtime, message, callback) {
      messages.push(structuredClone(message));
      if (message.action === 'fsb:automation-session-load') {
        callback({ ok: true, session: null });
      } else if (message.action === 'fsb:automation-session-prune-mcp') {
        callback({ ok: true, removed: 1, ids: ['session-ok'] });
      } else {
        callback({ ok: true });
      }
    }
  }).logger;
  seedMemory(acknowledged, 'session-ok');
  assert.equal(await acknowledged.saveSession('session-ok', { status: 'completed' }), true,
    'explicit ok acknowledgement completes session persistence');
  assert.equal(Object.hasOwn(acknowledged._domSnapshots, 'session-ok'), false,
    'acknowledged persistence releases the snapshot accumulator');
  assert.equal(await acknowledged.updateSessionOutcome('session-ok', {
    status: 'failed',
    outcome: 'failure',
    outcomeDetails: { reason: 'missing-data', error: 'Requested data does not exist' },
    error: 'Requested data does not exist'
  }), true, 'explicit ok acknowledgement completes outcome persistence');
  const pruneResult = await acknowledged.pruneMcpSessions(999);
  assert.equal(pruneResult.removed, 1,
    'explicit prune acknowledgement returns the trusted removal count');
  assert.deepEqual(Array.from(pruneResult.ids), ['session-ok'],
    'explicit prune acknowledgement returns the trusted removal IDs');
  assert.equal(acknowledged.logs.length, 0,
    'acknowledged prune removes the reported session from in-memory logs');

  assert.deepEqual(messages.map((message) => message.action), [
    'fsb:automation-session-load',
    'fsb:automation-session-save',
    'fsb:automation-session-update-outcome',
    'fsb:automation-session-prune-mcp'
  ], 'logger uses only the fixed trusted session message vocabulary');
  const outcomeMessage = messages[2];
  assert.deepEqual(Object.keys(outcomeMessage).sort(), ['action', 'outcome', 'sessionId'],
    'outcome bridge message has the exact fixed envelope');
  assert.deepEqual(Object.keys(outcomeMessage.outcome).sort(), [
    'blocker', 'completionMessage', 'error', 'nextStep', 'outcome',
    'reason', 'result', 'status', 'summary'
  ], 'outcome bridge payload has the exact trusted schema');
  assert.deepEqual(messages[3], {
    action: 'fsb:automation-session-prune-mcp',
    retentionDays: 365
  }, 'prune bridge clamps retention and sends no generic storage authority');
}

run().then(() => {
  console.log('automation logger trusted bridge: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
