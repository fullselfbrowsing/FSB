'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

function bridgeHarness(spreadsheetRedactor = redaction, chromeOverride) {
  const entries = [];
  const context = {
    console,
    URL,
    fsbMcpSessionRecorder: {
      recordAction(entry) { entries.push(entry); }
    },
    FsbSpreadsheetRecordRedaction: spreadsheetRedactor,
    chrome: chromeOverride,
    resolveMcpClientLabel() { return 'test-client'; },
    globalThis: null
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.join(ROOT, 'extension/ws/mcp-bridge-client.js'), 'utf8');
  vm.runInNewContext(
    `${source}\nthis.__spreadsheetBridgeClient = mcpBridgeClient;`,
    context,
    { filename: 'extension/ws/mcp-bridge-client.js' }
  );
  return { client: context.__spreadsheetBridgeClient, entries };
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

test('list_tabs records shape-redact nested docs.google.com tab titles', () => {
  const source = {
    client: 'test-client',
    tool: 'mcp:get-tabs',
    requestPayload: { agentId: 'agent:tabs' },
    response: {
      success: true,
      tabs: [
        { id: 1, title: 'Safe example', domain: 'example.com' },
        { id: 2, title: `${SENTINEL} - Google Sheets`, domain: 'docs.google.com' },
        { id: 3, title: 'Lookalike remains irrelevant', domain: 'docs.google.com.evil.test' }
      ],
      activeTabId: 2,
      totalTabs: 3
    },
    success: true,
    dispatcher_route: 'message'
  };
  const sink = recorder('recordDispatch');

  assert.equal(redaction.recordSafely(sink.target, 'recordDispatch', source), true);
  assert.equal(sink.entries.length, 1);
  assert.notStrictEqual(sink.entries[0], source);
  assert.deepEqual(sink.entries[0].requestPayload.params, {
    operation: 'mcp:get-tabs',
    shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
  });
  assert.deepEqual(sink.entries[0].response, {
    success: true,
    shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
  });
  assertNoContent(sink.entries[0]);
});

test('list_tabs records leave safe and lookalike tab domains unchanged', () => {
  for (const domain of ['example.com', 'docs.google.com.evil.test']) {
    const source = {
      client: 'test-client',
      tool: 'mcp:get-tabs',
      requestPayload: { agentId: 'agent:safe-tabs' },
      response: {
        success: true,
        tabs: [{ id: 1, title: SENTINEL, domain }],
        totalTabs: 1
      },
      success: true,
      dispatcher_route: 'message'
    };
    assert.strictEqual(redaction.sanitizeEntry(source), source);
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

  source.response.errorCode = 'RECOVERY_AMBIGUOUS';
  const ambiguous = recorder('recordDispatch');
  redaction.recordSafely(ambiguous.target, 'recordDispatch', source);
  assert.equal(ambiguous.entries[0].response.errorCode, 'RECOVERY_AMBIGUOUS');
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

test('real bridge fillsheet and readsheet payloads are shape-only before recordAction', () => {
  const fillCsv = `"${SENTINEL}\ninside",2\n3,=${SENTINEL}!A1`;
  const fillPayload = {
    tool: 'fillsheet',
    params: { startCell: 'A1', data: fillCsv, sheetName: SENTINEL, tab_id: 8 },
    agentId: 'agent:wire',
    visualSession: { visualReason: `Fill ${SENTINEL}`, client: 'test-client', isFinal: true },
    ownershipToken: SENTINEL
  };
  const fillResponse = {
    success: true,
    action: 'fillsheet',
    startCell: 'A1',
    rows: 2,
    cols: 2,
    cellsFilled: 4,
    hadEffect: true
  };
  const readPayload = {
    tool: 'readsheet',
    params: { range: RANGE, tab_id: 8 },
    agentId: 'agent:wire',
    ownershipToken: SENTINEL
  };
  const readResponse = {
    success: true,
    action: 'readsheet',
    range: RANGE,
    rows: 2,
    cols: 2,
    data: `${SENTINEL},x\n=${SENTINEL}!A1,2`,
    hadEffect: false
  };

  const harness = bridgeHarness();
  harness.client._recordMcpSessionAction(fillPayload, fillResponse, 8);
  harness.client._recordMcpSessionAction(readPayload, readResponse, 8);

  assert.equal(harness.entries.length, 2);
  const [fillRecorded, readRecorded] = harness.entries;
  assert.equal(fillRecorded.tool, 'fillsheet');
  assert.equal(fillRecorded.payload.tool, 'fillsheet');
  assert.deepEqual(fillRecorded.params, {
    operation: 'fillsheet',
    shape: { rowCount: 2, columnCount: 2, valueCount: 4 }
  });
  assert.deepEqual(fillRecorded.payload.params, fillRecorded.params);
  assert.deepEqual(fillRecorded.payload.visualSession, { isFinal: true });
  assert.deepEqual(fillRecorded.response, {
    success: true,
    shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
  });
  assertNoContent(fillRecorded);

  assert.equal(readRecorded.tool, 'readsheet');
  assert.equal(readRecorded.payload.tool, 'readsheet');
  assert.deepEqual(readRecorded.params, {
    operation: 'readsheet',
    shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
  });
  assert.deepEqual(readRecorded.response, {
    success: true,
    shape: { rowCount: 2, columnCount: 2, valueCount: 4 }
  });
  assertNoContent(readRecorded);
});

test('real bridge strips Google Sheets document URLs from navigate and open_tab records', () => {
  const cases = [
    {
      tool: 'navigate',
      url: `https://docs.google.com/spreadsheets/d/${ID}/edit?title=${SENTINEL}#gid=0`
    },
    {
      tool: 'open_tab',
      url: `http://docs.google.com/spreadsheets/d/${ID}/edit?range=${encodeURIComponent(RANGE)}#${SENTINEL}`
    }
  ];
  const harness = bridgeHarness();

  for (const fixture of cases) {
    harness.client._recordMcpSessionAction({
      tool: fixture.tool,
      params: { url: fixture.url },
      agentId: 'agent:navigation',
      visualSession: { visualReason: `Open ${SENTINEL}`, client: 'test-client', isFinal: true }
    }, {
      success: true,
      url: fixture.url,
      spreadsheetId: ID,
      title: SENTINEL
    }, 12);
  }

  assert.equal(harness.entries.length, 2);
  for (let index = 0; index < cases.length; index++) {
    const recorded = harness.entries[index];
    assert.equal(recorded.tool, cases[index].tool);
    assert.deepEqual(recorded.params, {
      operation: cases[index].tool,
      shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
    });
    assert.deepEqual(recorded.payload.params, recorded.params);
    assert.deepEqual(recorded.payload.visualSession, { isFinal: true });
    assert.deepEqual(recorded.response, {
      success: true,
      shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
    });
    assertNoContent(recorded);
  }
});

test('real bridge strips Google Sheets document URLs discovered in tab responses', () => {
  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${ID}/edit?title=${SENTINEL}#gid=0`;
  const cases = [
    {
      tool: 'switch_tab',
      params: { tabId: 12 },
      response: { success: true, tabId: 12, url: sheetsUrl, title: SENTINEL }
    },
    {
      tool: 'close_tab',
      params: { tabId: 12, allow_active: true },
      response: {
        success: true,
        tabId: 12,
        closed: true,
        change_report: {
          url: { before: sheetsUrl, after: null, changed: true },
          title_changed: false
        }
      }
    },
    {
      tool: 'navigate',
      params: { url: 'https://example.com/redirect-to-sheet' },
      response: {
        success: true,
        url: 'https://example.com/redirect-to-sheet',
        title: SENTINEL,
        change_report: {
          url: { before: 'https://example.com/redirect-to-sheet', after: sheetsUrl, changed: true }
        }
      }
    }
  ];
  const harness = bridgeHarness();

  for (const fixture of cases) {
    harness.client._recordMcpSessionAction({
      tool: fixture.tool,
      params: fixture.params,
      agentId: 'agent:response-navigation',
      visualSession: { visualReason: `Open ${SENTINEL}`, client: 'test-client', isFinal: true }
    }, fixture.response, 12);
  }

  assert.equal(harness.entries.length, cases.length);
  for (let index = 0; index < cases.length; index++) {
    const recorded = harness.entries[index];
    assert.equal(recorded.tool, cases[index].tool);
    assert.deepEqual(recorded.params, {
      operation: cases[index].tool,
      shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
    });
    assert.deepEqual(recorded.payload.params, recorded.params);
    assert.deepEqual(recorded.payload.visualSession, { isFinal: true });
    assert.deepEqual(recorded.response, {
      success: true,
      shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
    });
    assertNoContent(recorded);
  }
});

test('non-Sheets navigation URLs and lookalike hosts remain unchanged', () => {
  const cases = [
    {
      tool: 'navigate',
      url: `https://example.com/path/${ID}?value=${SENTINEL}#keep`
    },
    {
      tool: 'open_tab',
      url: `https://docs.google.com.evil.test/spreadsheets/d/${ID}/edit?value=${SENTINEL}`
    }
  ];

  for (const fixture of cases) {
    const source = {
      client: 'test-client',
      tool: fixture.tool,
      params: { url: fixture.url },
      payload: { tool: fixture.tool, params: { url: fixture.url }, agentId: 'agent:navigation' },
      response: { success: true, url: fixture.url },
      success: true,
      tabId: 12
    };
    assert.strictEqual(redaction.sanitizeEntry(source), source);
  }
});

test('non-Sheets tab response URLs and lookalike hosts remain unchanged', () => {
  const cases = [
    {
      client: 'test-client',
      tool: 'switch_tab',
      params: { tabId: 12 },
      payload: { tool: 'switch_tab', params: { tabId: 12 }, agentId: 'agent:navigation' },
      response: { success: true, url: `https://example.com/${ID}?value=${SENTINEL}`, title: SENTINEL },
      success: true,
      tabId: 12
    },
    {
      client: 'test-client',
      tool: 'close_tab',
      params: { tabId: 12 },
      payload: { tool: 'close_tab', params: { tabId: 12 }, agentId: 'agent:navigation' },
      response: {
        success: true,
        change_report: {
          url: {
            before: `https://docs.google.com.evil.test/spreadsheets/d/${ID}/edit?value=${SENTINEL}`,
            after: null,
            changed: true
          }
        }
      },
      success: true,
      tabId: 12
    }
  ];

  for (const source of cases) {
    assert.strictEqual(redaction.sanitizeEntry(source), source);
  }
});

test('generic actions and page reads on Google Sheets targets are shape-only', () => {
  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${ID}/edit?range=${encodeURIComponent(RANGE)}#gid=0`;
  const cases = [
    {
      method: 'recordAction',
      source: {
        client: 'test-client',
        tool: 'click',
        params: { selector: `[aria-label="${SENTINEL}"]` },
        payload: {
          tool: 'click',
          params: { selector: `[aria-label="${SENTINEL}"]` },
          agentId: 'agent:generic-action',
          visualSession: { visualReason: SENTINEL, isFinal: false }
        },
        response: { success: true, text: SENTINEL, value: `=${SENTINEL}!A1` },
        success: true,
        tabId: 12,
        requireTargetOrigin: true,
        targetOriginResolved: true,
        spreadsheetTarget: true
      }
    },
    {
      method: 'recordAction',
      source: {
        client: 'test-client',
        tool: 'get_text',
        params: { selector: '#selected-cell' },
        payload: { tool: 'get_text', params: { selector: '#selected-cell' }, agentId: 'agent:generic-action' },
        response: { success: true, text: SENTINEL, value: SENTINEL },
        success: true,
        tabId: 12,
        requireTargetOrigin: true,
        targetOriginResolved: true,
        spreadsheetTarget: true
      }
    },
    {
      method: 'recordDispatch',
      source: {
        client: 'test-client',
        tool: 'mcp:read-page',
        requestPayload: { agentId: 'agent:generic-read', tab_id: 12, params: { selector: SENTINEL } },
        response: { success: true, text: `${SENTINEL} ${RANGE}`, charCount: 99 },
        success: true,
        dispatcher_route: 'message',
        tabId: 12,
        requireTargetOrigin: true,
        targetOriginResolved: true,
        spreadsheetTarget: true
      }
    },
    {
      method: 'recordDispatch',
      source: {
        client: 'test-client',
        tool: 'mcp:get-dom',
        requestPayload: { agentId: 'agent:generic-read', tab_id: 12, params: { maxElements: 50 } },
        response: { success: true, structuredDOM: { elements: [{ text: SENTINEL, value: RANGE }] } },
        success: true,
        dispatcher_route: 'message',
        tabId: 12,
        requireTargetOrigin: true,
        targetOriginResolved: true,
        spreadsheetTarget: true
      }
    },
    {
      method: 'recordDispatch',
      source: {
        client: 'test-client',
        tool: 'mcp:get-page-snapshot',
        requestPayload: { agentId: 'agent:snapshot', tab_id: 12, params: {} },
        response: { success: true, url: sheetsUrl, snapshot: `${SENTINEL} ${RANGE}` },
        success: true,
        dispatcher_route: 'message'
      }
    }
  ];

  for (const fixture of cases) {
    const sink = recorder(fixture.method);
    assert.equal(redaction.recordSafely(sink.target, fixture.method, fixture.source), true);
    assert.equal(sink.entries.length, 1);
    const recorded = sink.entries[0];
    assert.equal(recorded.tool, fixture.source.tool);
    assert.equal((recorded.params || recorded.requestPayload.params).operation, fixture.source.tool);
    assert.deepEqual(recorded.response, {
      success: true,
      shape: { rowCount: 0, columnCount: 0, valueCount: 0 }
    });
    assert.equal(Object.prototype.hasOwnProperty.call(recorded, 'requireTargetOrigin'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(recorded, 'targetOriginResolved'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(recorded, 'spreadsheetTarget'), false);
    assertNoContent(recorded);
  }
});

test('real bridge reduces resolved tab URLs to private target booleans', async () => {
  const sheetsUrl = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`;
  const harness = bridgeHarness(redaction, {
    tabs: {
      async get(tabId) {
        if (tabId === 1) return { id: tabId, url: sheetsUrl };
        if (tabId === 2) return { id: tabId, url: `https://docs.google.com.evil.test/spreadsheets/d/${ID}/edit` };
        throw new Error('tab unavailable');
      }
    }
  });

  const sheetsTarget = await harness.client._resolveMcpSessionRecordTarget(1);
  const lookalikeTarget = await harness.client._resolveMcpSessionRecordTarget(2);
  const unresolvedTarget = await harness.client._resolveMcpSessionRecordTarget(3);
  assert.deepEqual({ ...sheetsTarget }, { targetOriginResolved: true, spreadsheetTarget: true });
  assert.deepEqual({ ...lookalikeTarget }, { targetOriginResolved: true, spreadsheetTarget: false });
  assert.deepEqual({ ...unresolvedTarget }, { targetOriginResolved: false, spreadsheetTarget: false });
  assert.equal(JSON.stringify(sheetsTarget).includes(ID), false);

  harness.client._recordMcpSessionAction({
    tool: 'click',
    params: { selector: '#selected-cell' },
    agentId: 'agent:resolved-bridge'
  }, { success: true, text: SENTINEL }, 1, sheetsTarget);
  assert.equal(harness.entries.length, 1);
  assertNoContent(harness.entries[0]);
});

test('content-bearing records fail closed when target origin resolution is unavailable', () => {
  const source = {
    client: 'test-client',
    tool: 'mcp:read-page',
    requestPayload: { agentId: 'agent:unresolved', params: {} },
    response: { success: true, text: SENTINEL },
    success: true,
    requireTargetOrigin: true,
    targetOriginResolved: false,
    spreadsheetTarget: false
  };
  const sink = recorder('recordDispatch');
  assert.equal(redaction.recordSafely(sink.target, 'recordDispatch', source), false);
  assert.equal(sink.entries.length, 0);

  const explicitSheets = {
    ...source,
    response: {
      success: true,
      url: `https://docs.google.com/spreadsheets/d/${ID}/edit`,
      text: SENTINEL
    }
  };
  const sanitized = recorder('recordDispatch');
  assert.equal(redaction.recordSafely(sanitized.target, 'recordDispatch', explicitSheets), true);
  assert.equal(sanitized.entries.length, 1);
  assertNoContent(sanitized.entries[0]);
});

test('bridge drops spreadsheet aliases and Sheets navigation when the shared redactor is unavailable', () => {
  const harness = bridgeHarness(null);
  for (const tool of ['fill_sheet', 'read_sheet', 'fillsheet', 'readsheet']) {
    harness.client._recordMcpSessionAction({
      tool,
      params: { data: SENTINEL, range: RANGE, sheetName: SENTINEL },
      agentId: 'agent:wire'
    }, { success: true, data: SENTINEL }, 8);
  }
  for (const tool of ['navigate', 'open_tab']) {
    harness.client._recordMcpSessionAction({
      tool,
      params: { url: `https://docs.google.com/spreadsheets/d/${ID}/edit?value=${SENTINEL}#gid=0` },
      agentId: 'agent:wire'
    }, { success: true, data: SENTINEL }, 8);
  }
  harness.client._recordMcpSessionAction({
    tool: 'switch_tab',
    params: { tabId: 8 },
    agentId: 'agent:wire'
  }, {
    success: true,
    url: `https://docs.google.com/spreadsheets/d/${ID}/edit?value=${SENTINEL}`,
    title: SENTINEL
  }, 8);
  harness.client._recordMcpSessionAction({
    tool: 'close_tab',
    params: { tabId: 8 },
    agentId: 'agent:wire'
  }, {
    success: true,
    change_report: {
      url: {
        before: `https://docs.google.com/spreadsheets/d/${ID}/edit?value=${SENTINEL}`,
        after: null,
        changed: true
      }
    }
  }, 8);
  harness.client._recordMcpSessionAction({
    tool: 'navigate',
    params: { url: 'https://example.com/redirect-to-sheet' },
    agentId: 'agent:wire'
  }, {
    success: true,
    change_report: {
      url: {
        before: 'https://example.com/redirect-to-sheet',
        after: `https://docs.google.com/spreadsheets/d/${ID}/edit?value=${SENTINEL}`,
        changed: true
      }
    }
  }, 8);
  assert.equal(harness.entries.length, 0);

  const nonSheetsTarget = { targetOriginResolved: true, spreadsheetTarget: false };
  harness.client._recordMcpSessionAction({
    tool: 'click',
    params: { selector: '#safe' },
    agentId: 'agent:wire'
  }, { success: true }, 8, nonSheetsTarget);
  harness.client._recordMcpSessionAction({
    tool: 'navigate',
    params: { url: `https://example.com/${ID}?value=${SENTINEL}` },
    agentId: 'agent:wire'
  }, { success: true }, 8, nonSheetsTarget);
  harness.client._recordMcpSessionAction({
    tool: 'switch_tab',
    params: { tabId: 8 },
    agentId: 'agent:wire'
  }, { success: true, url: `https://example.com/${ID}?value=${SENTINEL}` }, 8, nonSheetsTarget);
  assert.equal(harness.entries.length, 3);
  assert.equal(harness.entries[0].tool, 'click');
  assert.equal(harness.entries[1].params.url, `https://example.com/${ID}?value=${SENTINEL}`);
  assert.equal(harness.entries[2].response.url, `https://example.com/${ID}?value=${SENTINEL}`);
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
  assert.match(dispatcher, /if \(!spreadsheetRecord && !unresolvedRecordTarget\)[\s\S]*recordDispatch\(sessionRecordEntry\)/);
  assert.match(bridge, /if \(!spreadsheetTool && !unresolvedRecordTarget\)[\s\S]*recordAction\(sessionRecordEntry\)/);
});
