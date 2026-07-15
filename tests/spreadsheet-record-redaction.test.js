'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const redaction = require('../extension/utils/spreadsheet-record-redaction.js');
const ROOT = path.resolve(__dirname, '..');
const SENTINEL = 'PRIVATE_SHEET_SENTINEL_9f61';
const ID = 'privateSpreadsheetIdentifier123456789';
const RANGE = `'${SENTINEL} tab'!A1:Z99`;

function recorder(method) {
  const entries = [];
  return {
    entries,
    target: { [method](entry) { entries.push(entry); } }
  };
}

function assertNoContent(entry) {
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes(SENTINEL), false);
  assert.equal(serialized.includes(ID), false);
  assert.equal(serialized.includes(RANGE), false);
  assert.equal(serialized.includes(`=${SENTINEL}!A1`), false);
}

function capabilityEntry(slug, params, response, success = true) {
  return {
    client: 'test-client',
    tool: 'mcp:capabilities-invoke',
    requestPayload: {
      slug,
      params: {
        spreadsheetId: ID,
        range: RANGE,
        title: SENTINEL,
        ...params
      },
      agentId: 'agent:test',
      tab_id: 42,
      ownershipToken: SENTINEL
    },
    response,
    success,
    dispatcher_route: 'message'
  };
}

test('recordDispatch ingress strips metadata and values from every gsheets capability', () => {
  const cases = [
    capabilityEntry('gsheets.get_spreadsheet', {}, {
      success: true,
      status: 200,
      data: { spreadsheetId: ID, properties: { title: SENTINEL }, sheets: [{ properties: { title: SENTINEL } }] }
    }),
    capabilityEntry('gsheets.get_values', {}, {
      success: true,
      status: 200,
      data: { range: RANGE, values: [[SENTINEL, `=${SENTINEL}!A1`], ['safe', 2]] }
    }),
    capabilityEntry('gsheets.update_values', { values: [[SENTINEL, `=${SENTINEL}!A1`]] }, {
      success: true,
      status: 200,
      data: { updatedRange: RANGE, updatedRows: 1, updatedColumns: 2, updatedCells: 2 }
    }),
    capabilityEntry('gsheets.append_values', { values: [[SENTINEL], ['safe']] }, {
      success: true,
      status: 200,
      data: { tableRange: RANGE, updates: { updatedRange: RANGE, updatedRows: 2, updatedColumns: 1, updatedCells: 2 } }
    }),
    capabilityEntry('gsheets.clear_values', {}, {
      success: true,
      status: 200,
      data: { clearedRange: RANGE, echoed: SENTINEL }
    })
  ];

  for (const source of cases) {
    const sink = recorder('recordDispatch');
    assert.equal(redaction.recordSafely(sink.target, 'recordDispatch', source), true);
    assert.equal(sink.entries.length, 1);
    const recorded = sink.entries[0];
    assertNoContent(recorded);
    assert.equal(recorded.requestPayload.params.operation, source.requestPayload.slug);
    assert.deepEqual(Object.keys(recorded.requestPayload.params).sort(), ['operation', 'shape']);
    assert.deepEqual(Object.keys(recorded.response).sort().filter(key => !['status', 'errorCode'].includes(key)), ['shape', 'success']);
  }
});

test('retains only numeric request/result shape facts', () => {
  const source = capabilityEntry('gsheets.append_values', {
    values: [[SENTINEL, 1], ['x'], [true, false, `=${SENTINEL}!A1`]]
  }, {
    success: true,
    status: 200,
    data: { updates: { updatedRows: 3, updatedColumns: 3, updatedCells: 6, updatedRange: RANGE } }
  });
  const sink = recorder('recordDispatch');
  redaction.recordSafely(sink.target, 'recordDispatch', source);
  const recorded = sink.entries[0];
  assert.deepEqual(recorded.requestPayload.params.shape, { rowCount: 3, columnCount: 3, valueCount: 6 });
  assert.deepEqual(recorded.response.shape, {
    rowCount: 0,
    columnCount: 0,
    valueCount: 0,
    updatedRows: 3,
    updatedColumns: 3,
    updatedCells: 6
  });
  assertNoContent(recorded);
});

test('failure records keep a safe typed code but drop raw errors', () => {
  const source = capabilityEntry('gsheets.get_values', {}, {
    success: false,
    status: 403,
    errorCode: 'GOOGLE_SHEETS_ACCESS_DENIED',
    error: `Google exposed ${SENTINEL} from ${ID}`,
    details: { range: RANGE, value: SENTINEL }
  }, false);
  const sink = recorder('recordDispatch');
  redaction.recordSafely(sink.target, 'recordDispatch', source);
  const recorded = sink.entries[0];
  assert.equal(recorded.response.success, false);
  assert.equal(recorded.response.status, 403);
  assert.equal(recorded.response.errorCode, 'GOOGLE_SHEETS_ACCESS_DENIED');
  assert.equal(recorded.response.error, undefined);
  assertNoContent(recorded);

  source.response.errorCode = SENTINEL.toUpperCase();
  const second = recorder('recordDispatch');
  redaction.recordSafely(second.target, 'recordDispatch', source);
  assert.equal(second.entries[0].response.errorCode, undefined);
});

test('recordAction ingress redacts legacy fill_sheet and read_sheet payloads', () => {
  const fill = {
    client: 'test-client',
    tool: 'fill_sheet',
    params: { startCell: RANGE, sheetName: SENTINEL, csvData: `"${SENTINEL}\ninside",2\n3,=${SENTINEL}!A1` },
    payload: {
      tool: 'fill_sheet',
      params: { startCell: RANGE, sheetName: SENTINEL, csvData: `${SENTINEL},2` },
      agentId: 'agent:legacy',
      visualSession: { visualReason: `Fill ${SENTINEL}`, client: 'test-client', isFinal: true },
      ownershipToken: SENTINEL
    },
    response: { success: true, message: `Filled ${RANGE} with ${SENTINEL}` },
    success: true,
    tabId: 8
  };
  const fillSink = recorder('recordAction');
  redaction.recordSafely(fillSink.target, 'recordAction', fill);
  const fillRecorded = fillSink.entries[0];
  assert.deepEqual(fillRecorded.params.shape, { rowCount: 2, columnCount: 2, valueCount: 4 });
  assert.deepEqual(fillRecorded.payload.visualSession, { isFinal: true });
  assert.equal(fillRecorded.payload.agentId, 'agent:legacy');
  assertNoContent(fillRecorded);

  const read = {
    client: 'test-client',
    tool: 'read_sheet',
    params: { range: RANGE },
    payload: { tool: 'read_sheet', params: { range: RANGE }, agentId: 'agent:legacy' },
    response: { success: true, data: [[SENTINEL, 'x'], [`=${SENTINEL}!A1`]] },
    success: true,
    tabId: 8
  };
  const readSink = recorder('recordAction');
  redaction.recordSafely(readSink.target, 'recordAction', read);
  assert.deepEqual(readSink.entries[0].response.shape, { rowCount: 2, columnCount: 2, valueCount: 3 });
  assertNoContent(readSink.entries[0]);
});

test('unknown gsheets slugs are recognized and fail closed without retaining the raw slug', () => {
  const source = capabilityEntry(`gsheets.${SENTINEL}`, { values: [[SENTINEL]] }, { success: true, data: SENTINEL });
  const sink = recorder('recordDispatch');
  redaction.recordSafely(sink.target, 'recordDispatch', source);
  assert.equal(sink.entries[0].requestPayload.slug, 'gsheets.unknown');
  assert.equal(sink.entries[0].requestPayload.params.operation, 'gsheets.unknown');
  assertNoContent(sink.entries[0]);
});

test('unrelated records pass through unchanged', () => {
  const source = {
    client: 'test-client',
    tool: 'read_page',
    requestPayload: { params: { selector: '#content', value: SENTINEL } },
    response: { success: true, text: SENTINEL },
    success: true
  };
  const sink = recorder('recordDispatch');
  redaction.recordSafely(sink.target, 'recordDispatch', source);
  assert.strictEqual(sink.entries[0], source);
});

test('both recording hooks call the shared ingress sanitizer and fail closed for Sheets', () => {
  const background = fs.readFileSync(path.join(ROOT, 'extension/background.js'), 'utf8');
  const dispatcher = fs.readFileSync(path.join(ROOT, 'extension/ws/mcp-tool-dispatcher.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(ROOT, 'extension/ws/mcp-bridge-client.js'), 'utf8');
  assert.ok(background.indexOf("importScripts('utils/spreadsheet-record-redaction.js')")
    < background.indexOf("importScripts('ws/mcp-tool-dispatcher.js')"));
  assert.match(dispatcher, /spreadsheetInvoke[\s\S]*recordSafely\([\s\S]*'recordDispatch'/);
  assert.match(bridge, /spreadsheetTool[\s\S]*recordSafely\([\s\S]*'recordAction'/);
  assert.match(dispatcher, /if \(!spreadsheetInvoke\)[\s\S]*recordDispatch\(sessionRecordEntry\)/);
  assert.match(bridge, /if \(!spreadsheetTool\)[\s\S]*recordAction\(sessionRecordEntry\)/);
});
