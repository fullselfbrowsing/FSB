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

test('MAIN-world bridge builds only fixed Sheets requests and uses no supplied transport fields', async () => {
  const previous = globalThis.gapi;
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
