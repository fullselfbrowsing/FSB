'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sessionModule = require('../extension/utils/google-sheets-session.js');

const ID = 'abcdefghijklmnopqrstuvwxyz123456';
const OTHER_ID = 'zyxwvutsrqponmlkjihgfedcba654321';
const URL = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`;
const CONTEXT = { tabId: 17, origin: 'https://docs.google.com', url: URL };

function installPageLocation(spreadsheetId = ID) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      origin: 'https://docs.google.com',
      pathname: `/spreadsheets/d/${spreadsheetId}/edit`
    }
  });
  return function restore() {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else delete globalThis.location;
  };
}

function chromeStub(options = {}) {
  const pageCalls = [];
  const uiCalls = [];
  const chrome = {
    tabs: {
      async get(tabId) {
        if (options.tabError) throw options.tabError;
        return { id: tabId, url: options.tabUrl === undefined ? URL : options.tabUrl };
      },
      async sendMessage(tabId, message) {
        uiCalls.push({ tabId, message });
        if (options.uiError) throw options.uiError;
        return options.uiResult || {
          success: true,
          transport: 'ui',
          data: { values: [['ui-value']] },
          renderSemantics: 'formula-bar'
        };
      }
    },
    scripting: {
      async executeScript(details) {
        pageCalls.push(details);
        if (options.scriptError) throw options.scriptError;
        return [{ result: options.pageResult === undefined
          ? { success: true, status: 200, data: { spreadsheetId: ID }, transport: 'page-client' }
          : options.pageResult }];
      }
    }
  };
  return { chrome, pageCalls, uiCalls };
}

test('pins every operation to the caller-owned active Sheets tab', async () => {
  const stub = chromeStub();
  const client = sessionModule.createSession({ chrome: stub.chrome });
  const out = await client.getSpreadsheet({}, CONTEXT);
  assert.equal(out.success, true);
  assert.equal(out.transport, 'page-client');
  assert.equal(stub.pageCalls.length, 1);
  assert.equal(stub.pageCalls[0].target.tabId, 17);
  assert.equal(stub.pageCalls[0].world, 'MAIN');
  assert.equal(stub.pageCalls[0].args[0].spreadsheetId, ID);
});

test('requires a Sheets tab and rejects explicit target mismatches before execution', async () => {
  const missing = chromeStub({ tabUrl: 'https://docs.google.com/document/d/not-a-sheet/edit' });
  const missingClient = sessionModule.createSession({ chrome: missing.chrome });
  assert.equal((await missingClient.getValues({ range: 'A1' }, CONTEXT)).code, 'GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED');
  assert.equal(missing.pageCalls.length, 0);

  const mismatch = chromeStub();
  const mismatchClient = sessionModule.createSession({ chrome: mismatch.chrome });
  assert.equal((await mismatchClient.getValues({ spreadsheetId: OTHER_ID, range: 'A1' }, CONTEXT)).code, 'GOOGLE_SHEETS_TARGET_MISMATCH');
  assert.equal(mismatch.pageCalls.length, 0);
});

test('falls back to the fixed UI action only for page-session outcomes known safe', async () => {
  const stub = chromeStub({
    pageResult: {
      success: false,
      code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      errorCode: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      error: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      safeToFallback: true,
      knownNoEffect: true
    }
  });
  const client = sessionModule.createSession({ chrome: stub.chrome });
  const out = await client.getValues({ range: 'Sheet1!A1:B2' }, CONTEXT);
  assert.equal(out.success, true);
  assert.equal(out.transport, 'ui');
  assert.equal(stub.uiCalls.length, 1);
  assert.equal(stub.uiCalls[0].message.tool, 'sheetsSession');
  assert.deepEqual(Object.keys(stub.uiCalls[0].message.params).sort(), ['args', 'operation', 'spreadsheetId']);
});

test('never retries or falls back after an ambiguous mutation outcome', async () => {
  const stub = chromeStub({
    pageResult: {
      success: false,
      code: 'RECOVERY_AMBIGUOUS',
      errorCode: 'RECOVERY_AMBIGUOUS',
      error: 'RECOVERY_AMBIGUOUS'
    }
  });
  const client = sessionModule.createSession({ chrome: stub.chrome });
  const out = await client.updateValues({ range: 'A1', values: [['x']] }, CONTEXT);
  assert.equal(out.code, 'RECOVERY_AMBIGUOUS');
  assert.equal(stub.pageCalls.length, 1);
  assert.equal(stub.uiCalls.length, 0);
});

test('requires independent no-effect proof before a mutation may use UI fallback', async () => {
  const stub = chromeStub({
    pageResult: {
      success: false,
      code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      safeToFallback: true,
      requestSent: true
    }
  });
  const client = sessionModule.createSession({ chrome: stub.chrome });
  const out = await client.updateValues({ range: 'A1', values: [['x']] }, CONTEXT);
  assert.equal(out.code, 'RECOVERY_AMBIGUOUS');
  assert.equal(out.reason, 'page-fallback-effect-not-proven');
  assert.equal(stub.uiCalls.length, 0);
});

test('treats an untyped UI mutation timeout as ambiguous after dispatch', async () => {
  const stub = chromeStub({
    pageResult: {
      success: false,
      code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      safeToFallback: true,
      requestSent: false
    },
    uiResult: { success: false, error: 'Action sheetsSession timed out after 120000ms' }
  });
  const client = sessionModule.createSession({ chrome: stub.chrome });
  const out = await client.clearValues({ range: 'A1' }, CONTEXT);
  assert.equal(out.code, 'RECOVERY_AMBIGUOUS');
  assert.equal(stub.uiCalls.length, 1);
});

test('serializes mutations per tab before dispatching page or UI work', async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const chrome = {
    tabs: {
      async get(tabId) { return { id: tabId, url: URL }; },
      async sendMessage() {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 10));
        concurrent--;
        return { success: true, transport: 'ui' };
      }
    },
    scripting: {
      async executeScript() {
        return [{ result: {
          success: false,
          code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
          safeToFallback: true,
          requestSent: false
        } }];
      }
    }
  };
  const client = sessionModule.createSession({ chrome });
  const [updated, cleared] = await Promise.all([
    client.updateValues({ range: 'A1', values: [['x']] }, CONTEXT),
    client.clearValues({ range: 'B1' }, CONTEXT)
  ]);
  assert.equal(updated.success, true);
  assert.equal(cleared.success, true);
  assert.equal(maxConcurrent, 1);
});

test('serializes concurrent UI reads per tab without serializing their page-client attempts', async () => {
  let pageCalls = 0;
  let uiCalls = 0;
  let concurrentUi = 0;
  let maxConcurrentUi = 0;
  let releaseFirstUi;
  let signalFirstUi;
  let signalSecondUi;
  const firstUiStarted = new Promise(resolve => { signalFirstUi = resolve; });
  const secondUiStarted = new Promise(resolve => { signalSecondUi = resolve; });
  const firstUiGate = new Promise(resolve => { releaseFirstUi = resolve; });
  const chrome = {
    tabs: {
      async get(tabId) { return { id: tabId, url: URL }; },
      async sendMessage() {
        uiCalls++;
        concurrentUi++;
        maxConcurrentUi = Math.max(maxConcurrentUi, concurrentUi);
        if (uiCalls === 1) {
          signalFirstUi();
          await firstUiGate;
        } else {
          signalSecondUi();
        }
        concurrentUi--;
        return { success: true, transport: 'ui', data: { values: [['ok']] } };
      }
    },
    scripting: {
      async executeScript() {
        pageCalls++;
        return [{ result: {
          success: false,
          code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
          safeToFallback: true,
          requestSent: false
        } }];
      }
    }
  };
  const client = sessionModule.createSession({ chrome });
  const first = client.getValues({ range: 'A1' }, CONTEXT);
  const second = client.getValues({ range: 'B1' }, CONTEXT);

  await firstUiStarted;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pageCalls, 2);
  assert.equal(uiCalls, 1);
  assert.equal(maxConcurrentUi, 1);

  releaseFirstUi();
  await secondUiStarted;
  const results = await Promise.all([first, second]);
  assert.equal(results[0].success, true);
  assert.equal(results[1].success, true);
  assert.equal(uiCalls, 2);
  assert.equal(maxConcurrentUi, 1);
});

test('serializes a UI read behind a UI mutation while allowing its page-client attempt', async () => {
  let pageCalls = 0;
  let uiCalls = 0;
  let concurrentUi = 0;
  let maxConcurrentUi = 0;
  let releaseMutationUi;
  let signalMutationUi;
  let signalReadUi;
  const mutationUiStarted = new Promise(resolve => { signalMutationUi = resolve; });
  const readUiStarted = new Promise(resolve => { signalReadUi = resolve; });
  const mutationUiGate = new Promise(resolve => { releaseMutationUi = resolve; });
  const chrome = {
    tabs: {
      async get(tabId) { return { id: tabId, url: URL }; },
      async sendMessage(_tabId, message) {
        uiCalls++;
        concurrentUi++;
        maxConcurrentUi = Math.max(maxConcurrentUi, concurrentUi);
        if (message.params.operation === 'updateValues') {
          signalMutationUi();
          await mutationUiGate;
        } else {
          signalReadUi();
        }
        concurrentUi--;
        return { success: true, transport: 'ui', data: { values: [['ok']] } };
      }
    },
    scripting: {
      async executeScript() {
        pageCalls++;
        return [{ result: {
          success: false,
          code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
          safeToFallback: true,
          requestSent: false
        } }];
      }
    }
  };
  const client = sessionModule.createSession({ chrome });
  const mutation = client.updateValues({ range: 'A1', values: [['x']] }, CONTEXT);
  await mutationUiStarted;

  const read = client.getValues({ range: 'B1' }, CONTEXT);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pageCalls, 2);
  assert.equal(uiCalls, 1);
  assert.equal(maxConcurrentUi, 1);

  releaseMutationUi();
  await readUiStarted;
  const results = await Promise.all([mutation, read]);
  assert.equal(results[0].success, true);
  assert.equal(results[1].success, true);
  assert.equal(uiCalls, 2);
  assert.equal(maxConcurrentUi, 1);
});

test('classifies mutation timeouts, network failures, and 5xx responses as ambiguous', async () => {
  const previous = globalThis.gapi;
  const restoreLocation = installPageLocation();
  try {
    globalThis.gapi = { client: { request: () => Promise.reject({ status: 503 }) } };
    const rejected = await sessionModule.pageClientOperation({
      operation: 'updateValues', spreadsheetId: ID, timeoutMs: 100,
      args: { range: 'A1', values: [['x']], valueInputOption: 'RAW' }
    });
    assert.equal(rejected.code, 'RECOVERY_AMBIGUOUS');
    assert.equal(rejected.status, 503);

    globalThis.gapi = { client: { request: () => Promise.reject(new Error('network down')) } };
    const network = await sessionModule.pageClientOperation({
      operation: 'updateValues', spreadsheetId: ID, timeoutMs: 100,
      args: { range: 'A1', values: [['x']], valueInputOption: 'RAW' }
    });
    assert.equal(network.code, 'RECOVERY_AMBIGUOUS');

    globalThis.gapi = { client: { request: () => Promise.resolve({ status: 502, result: {} }) } };
    const response = await sessionModule.pageClientOperation({
      operation: 'clearValues', spreadsheetId: ID, timeoutMs: 100, args: { range: 'A1' }
    });
    assert.equal(response.code, 'RECOVERY_AMBIGUOUS');
    assert.equal(response.status, 502);

    globalThis.gapi = { client: { request: () => new Promise(() => {}) } };
    const timedOut = await sessionModule.pageClientOperation({
      operation: 'appendValues', spreadsheetId: ID, timeoutMs: 5,
      args: { range: 'A:C', values: [['x']] }
    });
    assert.equal(timedOut.code, 'RECOVERY_AMBIGUOUS');
  } finally {
    globalThis.gapi = previous;
    restoreLocation();
  }
});

test('surfaces a logged-out UI state as session unavailable', async () => {
  const stub = chromeStub({
    pageResult: {
      success: false,
      code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      safeToFallback: true,
      knownNoEffect: true
    },
    uiResult: {
      success: false,
      code: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      errorCode: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      error: 'GOOGLE_SHEETS_SESSION_UNAVAILABLE',
      reason: 'name-box-unavailable'
    }
  });
  const client = sessionModule.createSession({ chrome: stub.chrome });
  const out = await client.getSpreadsheet({}, CONTEXT);
  assert.equal(out.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(stub.pageCalls.length, 1);
  assert.equal(stub.uiCalls.length, 1);
});

test('MAIN-world bridge builds only fixed Sheets requests and uses no supplied transport fields', async () => {
  const previous = globalThis.gapi;
  const restoreLocation = installPageLocation();
  const calls = [];
  globalThis.gapi = {
    client: {
      request(spec) {
        calls.push(spec);
        return Promise.resolve({ status: 200, result: { values: [['ok']] } });
      }
    }
  };
  try {
    const out = await sessionModule.pageClientOperation({
      operation: 'getValues',
      spreadsheetId: ID,
      timeoutMs: 100,
      args: {
        range: 'Data!A1:B2',
        valueRenderOption: 'FORMULA',
        url: 'https://attacker.example',
        method: 'DELETE',
        headers: { Authorization: 'secret' }
      }
    });
    assert.equal(out.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.match(calls[0].path, /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\//);
    assert.match(calls[0].path, /Data%21A1%3AB2$/);
    assert.equal(JSON.stringify(calls[0]).includes('attacker.example'), false);
    assert.equal(JSON.stringify(calls[0]).includes('secret'), false);
  } finally {
    globalThis.gapi = previous;
    restoreLocation();
  }
});

test('MAIN-world bridge re-pins location immediately before the page request', async () => {
  const previous = globalThis.gapi;
  const restoreLocation = installPageLocation(OTHER_ID);
  let calls = 0;
  globalThis.gapi = { client: { request() { calls++; return Promise.resolve({ status: 200 }); } } };
  try {
    const out = await sessionModule.pageClientOperation({
      operation: 'getValues', spreadsheetId: ID, timeoutMs: 100, args: { range: 'A1' }
    });
    assert.equal(out.code, 'GOOGLE_SHEETS_TARGET_MISMATCH');
    assert.equal(out.requestSent, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.gapi = previous;
    restoreLocation();
  }
});

test('session source has no OAuth, Chrome Identity, credential storage, or arbitrary network primitive', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../extension/utils/google-sheets-session.js'), 'utf8');
  for (const forbidden of [
    /chrome(?:Api)?\.identity/,
    /getAuthToken/,
    /oauth2/i,
    /client_id/i,
    /document\.cookie/,
    /localStorage/,
    /sessionStorage/,
    /Authorization\s*:/,
    /\bBearer\b/,
    /\bfetch\s*\(/
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
