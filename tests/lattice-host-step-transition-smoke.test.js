'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed++;
    console.log('PASS', label);
  } catch (err) {
    failed++;
    console.error('FAIL', label + ':', err && err.message ? err.message : err);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('timed out waiting for ' + label);
}

async function main() {
  console.log('--- Lattice host step-transition smoke ---');

  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    globalThis.crypto = require('node:crypto').webcrypto;
  }

  const listeners = [];
  const sendMessageCalls = [];
  globalThis.chrome = {
    runtime: {
      id: 'fsb-test-extension-id',
      onMessage: {
        addListener(fn) {
          if (typeof fn === 'function') listeners.push(fn);
        },
        removeListener(fn) {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        }
      },
      sendMessage(message) {
        sendMessageCalls.push(message);
        return Promise.resolve({ ok: true });
      }
    }
  };

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
    originalLog.apply(console, args);
  };
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = (msg, ...rest) => {
    const warningText = [msg].concat(rest).map((item) => (
      item && item.code ? item.code : String(item)
    )).join(' ');
    if (warningText.includes('MODULE_TYPELESS_PACKAGE_JSON')) return;
    return originalEmitWarning.call(process, msg, ...rest);
  };

  try {
    const hostPath = path.join(__dirname, '..', 'extension', 'offscreen', 'lattice-host.js');
    await import(pathToFileURL(hostPath).href);
    await waitFor(
      () => logs.some((line) => line.includes('ephemeral signer ready')),
      'offscreen lattice signer boot',
      2000
    );
  } finally {
    console.log = originalLog;
    process.emitWarning = originalEmitWarning;
  }

  check('Part 1.1 host registers the step-transition listener first', () => {
    assert.equal(typeof listeners[0], 'function');
  });

  const stepListener = listeners[0];
  async function dispatchStep(payload) {
    const before = sendMessageCalls.length;
    const ret = stepListener(
      { type: 'lattice-step-transition', payload },
      { id: globalThis.chrome.runtime.id },
      () => {}
    );
    assert.equal(ret, false);
    await waitFor(
      () => sendMessageCalls.length > before,
      'receipt message for ' + payload.runId + ':' + payload.stepIndex,
      2000
    );
    await delay(25);
    return sendMessageCalls[before];
  }

  const first = await dispatchStep({
    runId: 'run-one',
    sessionId: 'run-one',
    stepName: 'LLM_TURN',
    stepIndex: 1,
    timestamp: '2026-06-17T00:00:00.000Z'
  });

  check('Part 2.1 first transition mints one receipt for run-one step 1', () => {
    assert.equal(sendMessageCalls.length, 1);
    assert.equal(first.type, 'lattice-receipt-minted');
    assert.equal(first.payload.runId, 'run-one');
    assert.equal(first.payload.stepIndex, 1);
    assert.ok(first.payload.envelope);
  });

  const second = await dispatchStep({
    runId: 'run-two',
    sessionId: 'run-two',
    stepName: 'TOOL_DISPATCH',
    stepIndex: 2,
    previousStepName: 'LLM_TURN',
    timestamp: '2026-06-17T00:00:01.000Z'
  });

  check('Part 2.2 second transition adds exactly one new receipt', () => {
    assert.equal(sendMessageCalls.length, 2);
  });
  check('Part 2.3 second receipt uses only the second transition metadata', () => {
    assert.equal(second.type, 'lattice-receipt-minted');
    assert.equal(second.payload.runId, 'run-two');
    assert.equal(second.payload.stepIndex, 2);
    assert.notEqual(second.payload.runId, 'run-one');
    assert.ok(second.payload.envelope);
  });

  console.log('\nSummary: passed=' + passed + ' failed=' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FAIL lattice-host-step-transition-smoke:', err && err.stack ? err.stack : err);
  process.exit(1);
});
