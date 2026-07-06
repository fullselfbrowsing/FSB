'use strict';

/**
 * Regression coverage for executeUploadFile's shared security chokepoint.
 *
 * Run: node tests/upload-file-chokepoint.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(REPO_ROOT, 'extension', 'background.js');

function extractExecuteUploadFileSource() {
  const src = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  const start = src.indexOf('async function executeUploadFile');
  const end = src.indexOf('/**\n * Direct CDP tool dispatcher', start);
  assert(start >= 0, 'executeUploadFile function exists in background.js');
  assert(end > start, 'executeUploadFile function end anchor exists');
  return src.slice(start, end);
}

function buildHarness(denylist, options = {}) {
  const calls = {
    attach: 0,
    sendCommand: 0,
    debuggerCommands: [],
    detach: 0,
    audit: [],
    log: [],
  };
  function defaultSendCommand(method) {
    if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
    if (method === 'DOM.querySelector') return { nodeId: 2 };
    if (method === 'DOM.describeNode') return { node: { nodeName: 'INPUT', attributes: ['type', 'file'] } };
    if (method === 'DOM.setFileInputFiles') return {};
    return {};
  }
  const context = {
    console,
    URL,
    automationLogger: {
      logActionExecution(_sessionId, action, phase, details) {
        calls.log.push({ action, phase, details });
      },
    },
    chrome: {
      tabs: {
        async get(tabId) {
          return { id: tabId, url: 'https://example.test/upload' };
        },
      },
      debugger: {
        async attach() { calls.attach += 1; },
        async sendCommand(_target, method, params) {
          calls.sendCommand += 1;
          calls.debuggerCommands.push({ method, params });
          if (typeof options.sendCommand === 'function') {
            const custom = await options.sendCommand(method, params, calls);
            if (custom !== undefined) return custom;
          }
          return defaultSendCommand(method);
        },
        async detach() { calls.detach += 1; },
      },
    },
    FsbAuditLog: {
      append(record) {
        calls.audit.push(record);
      },
    },
    keyboardEmulator: null,
  };
  context.globalThis = context;
  if (denylist !== undefined) context.FsbUploadPathDenylist = denylist;

  vm.runInNewContext(
    extractExecuteUploadFileSource() + '\nthis.__executeUploadFile = executeUploadFile;',
    context,
    { filename: 'background-upload-slice.js' },
  );

  return { executeUploadFile: context.__executeUploadFile, calls };
}

async function assertBlockedBeforeCdp(name, denylist, expectedReason) {
  const { executeUploadFile, calls } = buildHarness(denylist);
  const result = await executeUploadFile(7, 'input[type=file]', '/tmp/report.pdf');

  assert.strictEqual(result.success, false, name + ': result is failure');
  assert.strictEqual(result.reason, expectedReason, name + ': reason matches');
  assert.strictEqual(calls.attach, 0, name + ': debugger.attach not called');
  assert.strictEqual(calls.sendCommand, 0, name + ': debugger.sendCommand not called');
  assert(
    calls.audit.some((r) => r.outcome === 'blocked' && r.consentDecision === expectedReason),
    name + ': blocked audit record written',
  );
}

async function assertSuccessfulUploadRedactsPathInLogs() {
  const filePath = '/Users/alex/Documents/tax-return-2026.pdf';
  const fileName = 'tax-return-2026.pdf';
  const selector = 'input[type=file]';
  const { executeUploadFile, calls } = buildHarness({
    isAbsolutePath() { return true; },
    classify() { return { denied: false, reason: '' }; },
    basenameOf() { return fileName; },
  });

  const result = await executeUploadFile(7, selector, filePath);

  assert.strictEqual(result.success, true, 'successful upload returns success');
  assert.strictEqual(result.file, fileName, 'successful upload returns basename only');
  assert(
    calls.debuggerCommands.some((cmd) => cmd.method === 'DOM.setFileInputFiles' && cmd.params.files[0] === filePath),
    'CDP still receives the absolute file path',
  );

  const serializedLogs = JSON.stringify(calls.log);
  assert(!serializedLogs.includes(filePath), 'automation logs do not contain the absolute path');

  const startLog = calls.log.find((entry) => entry.action === 'cdpUploadFile' && entry.phase === 'start');
  const completeLog = calls.log.find((entry) => entry.action === 'cdpUploadFile' && entry.phase === 'complete' && entry.details.success === true);
  assert(startLog, 'start log was written');
  assert(completeLog, 'successful complete log was written');
  assert.strictEqual(startLog.details.file, fileName, 'start log stores basename');
  assert.strictEqual(completeLog.details.file, fileName, 'complete log stores basename');
}

async function assertFailedUploadRedactsPathInLogs() {
  const filePath = '/Users/alex/Documents/tax-return-2026.pdf';
  const fileName = 'tax-return-2026.pdf';
  const { executeUploadFile, calls } = buildHarness({
    isAbsolutePath() { return true; },
    classify() { return { denied: false, reason: '' }; },
    basenameOf() { return fileName; },
  }, {
    sendCommand(method) {
      if (method === 'DOM.setFileInputFiles') {
        throw new Error('browser could not read ' + filePath);
      }
      return undefined;
    },
  });

  const result = await executeUploadFile(7, 'input[type=file]', filePath);

  assert.strictEqual(result.success, false, 'failed upload returns failure');
  assert(!result.error.includes(filePath), 'failed upload result does not contain the absolute path');
  assert(result.error.includes(fileName), 'failed upload result uses basename in redacted message');
  const serializedLogs = JSON.stringify(calls.log);
  assert(!serializedLogs.includes(filePath), 'failed upload logs do not contain the absolute path');
  assert(serializedLogs.includes(fileName), 'failed upload log uses basename in redacted message');
}

(async () => {
  console.log('\n--- upload-file chokepoint fail-closed regression ---');

  await assertBlockedBeforeCdp('missing denylist', undefined, 'denylist-unavailable');
  await assertBlockedBeforeCdp('malformed denylist', {
    isAbsolutePath() { return true; },
    classify() { return { denied: false, reason: '' }; },
  }, 'denylist-unavailable');
  await assertBlockedBeforeCdp('isAbsolutePath throws', {
    isAbsolutePath() { throw new Error('boom'); },
    classify() { return { denied: false, reason: '' }; },
    basenameOf(p) { return path.basename(p); },
  }, 'denylist-error');
  await assertBlockedBeforeCdp('classify throws', {
    isAbsolutePath() { return true; },
    classify() { throw new Error('boom'); },
    basenameOf(p) { return path.basename(p); },
  }, 'denylist-error');
  await assertSuccessfulUploadRedactsPathInLogs();
  await assertFailedUploadRedactsPathInLogs();

  console.log('upload-file chokepoint: PASS');
})().catch((err) => {
  console.error('upload-file chokepoint: FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
