'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const handlers = require('../catalog/handlers/gsheets.js');

const ID = 'abcdefghijklmnopqrstuvwxyz123456';
const ACTIVE_URL = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`;
const EXPECTED = {
  'gsheets.get_spreadsheet': ['getSpreadsheet', 'read'],
  'gsheets.get_values': ['getValues', 'read'],
  'gsheets.update_values': ['updateValues', 'write'],
  'gsheets.append_values': ['appendValues', 'write'],
  'gsheets.clear_values': ['clearValues', 'destructive']
};

function context(calls, url) {
  const client = {};
  for (const [method] of Object.values(EXPECTED)) {
    client[method] = async params => {
      calls.push({ method, params });
      return { success: true, status: 200, data: { accepted: true } };
    };
  }
  return { url: url === undefined ? ACTIVE_URL : url, googleSheets: client };
}

test('exports five T1a handlers with explicit side-effect classifications and strict schemas', () => {
  assert.deepEqual(Object.keys(handlers).sort(), Object.keys(EXPECTED).sort());
  for (const [slug, [_method, sideEffectClass]] of Object.entries(EXPECTED)) {
    const handler = handlers[slug];
    assert.equal(handler.tier, 'T1a');
    assert.equal(handler.origin, 'https://docs.google.com');
    assert.equal(handler.sideEffectClass, sideEffectClass);
    assert.equal(handler.params.type, 'object');
    assert.equal(handler.params.additionalProperties, false);
    assert.equal(typeof handler.handle, 'function');
  }
  assert.deepEqual(handlers['gsheets.get_values'].params.required, ['range']);
  assert.deepEqual(handlers['gsheets.update_values'].params.required, ['range', 'values']);
  assert.deepEqual(handlers['gsheets.append_values'].params.required, ['range', 'values']);
  assert.deepEqual(handlers['gsheets.clear_values'].params.required, ['range']);
});

test('derives a spreadsheet ID only from the active Google Sheets URL', async () => {
  const calls = [];
  const out = await handlers['gsheets.get_spreadsheet'].handle({}, context(calls));
  assert.equal(out.success, true);
  assert.deepEqual(calls, [{ method: 'getSpreadsheet', params: { spreadsheetId: ID } }]);

  const wrongOrigin = await handlers['gsheets.get_spreadsheet'].handle({}, context([], `https://evil.example/spreadsheets/d/${ID}/edit`));
  assert.equal(wrongOrigin.code, 'GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED');
});

test('routes read operations to exactly one narrow client method', async () => {
  const cases = [
    ['gsheets.get_spreadsheet', {}, 'getSpreadsheet'],
    ['gsheets.get_values', { range: 'Data!A1:B2', valueRenderOption: 'FORMULA' }, 'getValues']
  ];
  for (const [slug, args, expectedMethod] of cases) {
    const calls = [];
    const out = await handlers[slug].handle(args, context(calls));
    assert.equal(out.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, expectedMethod);
    assert.equal(calls[0].params.spreadsheetId, ID);
  }
});

test('write and destructive operations are runtime guarded until live UAT activation', async () => {
  const cases = [
    ['gsheets.update_values', { range: 'A1:B1', values: [['name', 1]], valueInputOption: 'RAW' }],
    ['gsheets.append_values', { range: 'A:B', values: [['x', true]], insertDataOption: 'INSERT_ROWS' }],
    ['gsheets.clear_values', { range: 'Archive!A2:Z' }]
  ];
  for (const [slug, args] of cases) {
    const calls = [];
    const out = await handlers[slug].handle(args, context(calls));
    assert.equal(out.success, false);
    assert.equal(out.code, 'RECIPE_DOM_FALLBACK_PENDING');
    assert.equal(out.slug, slug);
    assert.equal(out.reason, 'google-sheets-live-mutation-uat-required');
    assert.equal(out.fellBackToDom, true);
    assert.deepEqual(calls, []);
  }
});

test('matching explicit spreadsheet ID is accepted and arbitrary transport fields are never forwarded', async () => {
  const calls = [];
  await handlers['gsheets.get_values'].handle({
    spreadsheetId: ID,
    range: 'A1',
    url: 'https://attacker.example',
    method: 'DELETE',
    headers: { Authorization: 'secret' },
    token: 'secret'
  }, context(calls));
  assert.deepEqual(calls[0].params, {
    spreadsheetId: ID,
    range: 'A1',
    majorDimension: undefined,
    valueRenderOption: undefined,
    dateTimeRenderOption: undefined
  });

  const mismatch = await handlers['gsheets.get_values'].handle({
    spreadsheetId: 'explicitSpreadsheetId1234567890',
    range: 'A1'
  }, context([]));
  assert.equal(mismatch.code, 'GOOGLE_SHEETS_TARGET_MISMATCH');
});

test('fails closed when the session facade or active spreadsheet target is unavailable', async () => {
  const noClient = await handlers['gsheets.get_values'].handle({ spreadsheetId: ID, range: 'A1' }, {});
  const noTarget = await handlers['gsheets.get_values'].handle({ range: 'A1' }, { googleSheets: { getValues() {} } });
  assert.equal(noClient.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(noTarget.code, 'GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED');
});
