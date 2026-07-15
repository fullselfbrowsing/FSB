'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const apiModule = require('../extension/utils/google-sheets-api.js');
const REAL_CLIENT_ID = '123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function response(status, data, headers) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(name) { return (headers || {})[name.toLowerCase()] || null; } },
    async text() { return data === undefined ? '' : JSON.stringify(data); }
  };
}

function chromeStub(options) {
  options = options || {};
  const authCalls = [];
  const removed = [];
  const tokens = (options.tokens || ['secret-access-token']).slice();
  const chromeApi = {
    runtime: {
      lastError: null,
      getManifest() {
        return {
          oauth2: {
            client_id: options.clientId || REAL_CLIENT_ID,
            scopes: options.scopes || [SCOPE]
          }
        };
      }
    },
    identity: {
      getAuthToken(details, callback) {
        authCalls.push(details);
        const token = tokens.length ? tokens.shift() : 'secret-access-token';
        if (token instanceof Error) {
          chromeApi.runtime.lastError = { message: token.message };
          callback(undefined);
          chromeApi.runtime.lastError = null;
          return;
        }
        callback(token);
      },
      removeCachedAuthToken(details, callback) {
        removed.push(details.token);
        callback();
      },
      getProfileUserInfo(_details, callback) {
        callback({ email: 'user@example.com', id: 'profile-id' });
      }
    }
  };
  return { chromeApi, authCalls, removed };
}

test('placeholder OAuth configuration fails closed before Chrome Identity', async () => {
  const stub = chromeStub({ clientId: 'REPLACE_WITH_FSB_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com' });
  const client = apiModule.createClient({ chrome: stub.chromeApi, fetch: async () => response(200, {}) });
  const connected = await client.connect();
  const read = await client.getSpreadsheet({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456' });
  assert.equal(connected.code, 'GOOGLE_SHEETS_OAUTH_NOT_CONFIGURED');
  assert.equal(read.code, 'GOOGLE_SHEETS_OAUTH_NOT_CONFIGURED');
  assert.equal(stub.authCalls.length, 0);
});

test('only connect requests an interactive token; API calls are noninteractive', async () => {
  const stub = chromeStub({ tokens: ['connect-token', 'read-token'] });
  const client = apiModule.createClient({
    chrome: stub.chromeApi,
    fetch: async () => response(200, { spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456' })
  });
  const connected = await client.connect();
  const read = await client.getSpreadsheet({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456' });
  assert.equal(connected.connected, true);
  assert.equal(read.success, true);
  assert.deepEqual(stub.authCalls.map(call => call.interactive), [true, false]);
});

test('constructs only encoded Sheets v4 requests with fixed methods and safe bodies', async () => {
  const stub = chromeStub({ tokens: ['read-token', 'write-token', 'append-token', 'clear-token'] });
  const calls = [];
  const client = apiModule.createClient({
    chrome: stub.chromeApi,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return response(200, { ok: true });
    }
  });
  const id = 'abcdefghijklmnopqrstuvwxyz123456';
  await client.getValues({ spreadsheetId: id, range: "Data 2026!A1:B2", valueRenderOption: 'FORMULA' });
  await client.updateValues({ spreadsheetId: id, range: 'A1:B1', values: [['name', '=1+1']], valueInputOption: 'RAW' });
  await client.appendValues({ spreadsheetId: id, range: 'A:B', values: [['x', 2]], insertDataOption: 'INSERT_ROWS' });
  await client.clearValues({ spreadsheetId: id, range: 'Archive!A2:Z' });

  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/')));
  assert.deepEqual(calls.map(call => call.init.method), ['GET', 'PUT', 'POST', 'POST']);
  assert.match(calls[0].url, /Data%202026%21A1%3AB2/);
  assert.deepEqual(JSON.parse(calls[1].init.body).values, [['name', '=1+1']]);
  assert.match(calls[2].url, /A%3AB:append\?/);
  assert.match(calls[3].url, /A2%3AZ:clear$/);
  assert.ok(calls.every(call => call.init.credentials === 'omit' && call.init.redirect === 'error'));
});

test('rejects invalid IDs, ranges, and oversized bodies before auth or fetch', async () => {
  const stub = chromeStub();
  let fetchCount = 0;
  const client = apiModule.createClient({
    chrome: stub.chromeApi,
    fetch: async () => { fetchCount++; return response(200, {}); }
  });
  assert.equal((await client.getValues({ spreadsheetId: '../bad', range: 'A1' })).code, 'GOOGLE_SHEETS_INVALID_ARGUMENT');
  assert.equal((await client.getValues({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456', range: 'A1\nAuthorization: secret' })).code, 'GOOGLE_SHEETS_INVALID_ARGUMENT');
  const huge = 'x'.repeat(apiModule.constants.maxRequestBodyBytes + 1);
  assert.equal((await client.updateValues({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456', range: 'A1', values: [[huge]] })).code, 'GOOGLE_SHEETS_REQUEST_TOO_LARGE');
  assert.equal(fetchCount, 0);
  assert.equal(stub.authCalls.length, 0);
});

test('normalizes Google failures and never discloses tokens or response details', async () => {
  const token = 'TOP-SECRET-OAUTH-TOKEN';
  const stub = chromeStub({ tokens: [token] });
  const client = apiModule.createClient({
    chrome: stub.chromeApi,
    fetch: async () => response(403, { error: { message: 'private server detail ' + token } })
  });
  const out = await client.getSpreadsheet({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456' });
  assert.equal(out.code, 'GOOGLE_SHEETS_ACCESS_DENIED');
  assert.equal(out.status, 403);
  assert.equal(JSON.stringify(out).includes(token), false);
  assert.equal(JSON.stringify(out).includes('private server detail'), false);
});

test('evicts a rejected token and retries once noninteractively', async () => {
  const stub = chromeStub({ tokens: ['expired-token', 'fresh-token'] });
  const authHeaders = [];
  const client = apiModule.createClient({
    chrome: stub.chromeApi,
    fetch: async (_url, init) => {
      authHeaders.push(init.headers.Authorization);
      return authHeaders.length === 1 ? response(401, {}) : response(200, { values: [['ok']] });
    }
  });
  const out = await client.getValues({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456', range: 'A1' });
  assert.equal(out.success, true);
  assert.deepEqual(stub.authCalls.map(call => call.interactive), [false, false]);
  assert.deepEqual(stub.removed, ['expired-token']);
  assert.equal(authHeaders.length, 2);
});

test('disconnect evicts cached auth without returning the token', async () => {
  const stub = chromeStub({ tokens: ['disconnect-secret'] });
  const client = apiModule.createClient({ chrome: stub.chromeApi });
  const out = await client.disconnect();
  assert.deepEqual(stub.removed, ['disconnect-secret']);
  assert.equal(out.connected, false);
  assert.equal(JSON.stringify(out).includes('disconnect-secret'), false);
});

test('timeout errors are typed and safe', async () => {
  const stub = chromeStub({ tokens: ['timeout-token'] });
  class Controller {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  let timerFn;
  const client = apiModule.createClient({
    chrome: stub.chromeApi,
    AbortController: Controller,
    setTimeout(fn) { timerFn = fn; return 1; },
    clearTimeout() {},
    fetch: async (_url, init) => {
      timerFn();
      const error = new Error('secret timeout detail');
      error.name = 'AbortError';
      throw error;
    }
  });
  const out = await client.getSpreadsheet({ spreadsheetId: 'abcdefghijklmnopqrstuvwxyz123456' });
  assert.equal(out.code, 'GOOGLE_SHEETS_TIMEOUT');
  assert.equal(JSON.stringify(out).includes('secret timeout detail'), false);
});
