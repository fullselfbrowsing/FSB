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
      clearAutomationSessions: async () => { throw new Error('storage rejected'); }
    }
  });

  const acknowledged = loadLogger({
    sendMessage(_runtime, message, callback) {
      if (message.action === 'fsb:automation-session-load') {
        callback({ ok: true, session: null });
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
}

run().then(() => {
  console.log('automation logger trusted bridge: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
