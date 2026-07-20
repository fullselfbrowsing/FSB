'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ui = require('../extension/utils/google-sheets-ui.js');
const ROOT = path.resolve(__dirname, '..');
const ACTIONS_SOURCE = fs.readFileSync(path.join(ROOT, 'extension/content/actions.js'), 'utf8');

function sheetsDomHarness(options = {}) {
  const start = ACTIONS_SOURCE.indexOf('// Google Sheets signed-in-tab UI transport');
  const end = ACTIONS_SOURCE.indexOf('// Tool functions for browser automation', start);
  assert.ok(start >= 0 && end > start, 'Sheets content helper source region exists');

  const cells = new Map(Object.entries(options.cells || {}));
  let selectedAddress = options.initialAddress || 'A1';
  let pendingAddress = selectedAddress;
  let activeWorksheet = options.initialWorksheet || 'Sheet1';
  let pasteCalls = 0;
  let deleteCalls = 0;
  let insertCalls = 0;
  const keyCalls = [];
  const nameBox = options.missingNameBox ? null : {
    value: selectedAddress,
    textContent: selectedAddress,
    focus() {},
    click() {}
  };
  const formulaBar = options.missingFormulaBar ? null : {
    querySelector() { return null; },
    get value() { return cells.get(selectedAddress) ?? ''; }
  };
  const trusted = { success: true, method: 'debuggerAPI' };
  const tools = {
    async keyPress(params) {
      keyCalls.push({ ...params });
      if (typeof options.keyPress === 'function') {
        const override = await options.keyPress(params, { selectedAddress, cells });
        if (override) return override;
      }
      if (params.key === 'Enter') {
        if (options.confirmNavigation !== false) {
          selectedAddress = pendingAddress.replace(/^.*!/, '').replace(/\$/g, '').toUpperCase();
        }
        if (options.confirmWorksheetNavigation !== false && pendingAddress.includes('!')) {
          const rawSheet = pendingAddress.slice(0, pendingAddress.lastIndexOf('!'));
          activeWorksheet = rawSheet.startsWith("'") && rawSheet.endsWith("'")
            ? rawSheet.slice(1, -1).replace(/''/g, "'")
            : rawSheet;
        }
        if (nameBox) nameBox.value = selectedAddress;
      }
      if (params.key === 'v' && (params.ctrlKey || params.metaKey)) pasteCalls++;
      if (params.key === '=' && (params.ctrlKey || params.metaKey) && params.altKey) insertCalls++;
      if (params.key === 'Delete') {
        deleteCalls++;
        if (options.deleteHasEffect !== false) cells.set(selectedAddress, '');
      }
      return trusted;
    },
    async typeWithKeys(params) {
      if (options.typeResult) return options.typeResult;
      pendingAddress = String(params.text);
      if (nameBox) nameBox.value = pendingAddress;
      return { success: true, method: 'debuggerAPI' };
    }
  };
  const document = {
    title: options.title || 'Disposable - Google Sheets',
    querySelector(selector) {
      if (selector === '#t-name-box') return nameBox;
      if (selector === '#t-formula-bar-input' || selector === '.cell-input' || selector === '[aria-label="Formula bar"]') {
        return formulaBar;
      }
      if (selector.includes('docs-title-input')) {
        return options.missingTitle ? null : { value: options.title || 'Disposable' };
      }
      if (selector.includes('docs-sheet-active-tab') || selector.includes('aria-selected="true"')) {
        return options.missingActiveWorksheet ? null : { textContent: activeWorksheet };
      }
      return null;
    },
    querySelectorAll() { return options.tabNodes || []; }
  };
  const context = {
    console,
    FsbGoogleSheetsUi: ui,
    __tools: tools,
    document,
    navigator: {
      platform: options.platform || 'Linux x86_64',
      userAgentData: options.userAgentDataPlatform
        ? { platform: options.userAgentDataPlatform }
        : undefined,
      clipboard: {
        async writeText(text) {
          if (options.clipboardError) throw options.clipboardError;
          context.__clipboard = text;
        }
      }
    },
    window: {
      location: {
        hostname: options.hostname || 'docs.google.com',
        pathname: options.pathname || '/spreadsheets/d/abcdefghijklmnopqrstuvwxyz123456/edit'
      }
    },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    globalThis: null
  };
  context.globalThis = context;
  const exports = [
    'sheetsNavigate',
    'sheetsWithUiLock',
    'sheetsReadValues',
    'sheetsUpdateValues',
    'sheetsAppendValues',
    'sheetsClearValues',
    'sheetsSpreadsheetMetadata'
  ];
  vm.runInNewContext(
    `${ACTIONS_SOURCE.slice(start, end)}\nconst tools = globalThis.__tools;\n` +
      `globalThis.__sheetsInternals = { ${exports.join(', ')} };`,
    context,
    { filename: 'extension/content/actions.sheets-region.js' }
  );
  return {
    api: context.__sheetsInternals,
    cells,
    keyCalls,
    get pasteCalls() { return pasteCalls; },
    get deleteCalls() { return deleteCalls; },
    get insertCalls() { return insertCalls; }
  };
}

test('parses bounded A1, quoted-sheet, single-cell, and column append ranges', () => {
  assert.deepEqual(ui.parseA1Range('A1:B2'), {
    sheetPrefix: '', startColumn: 1, endColumn: 2, startRow: 1, endRow: 2,
    rows: 2, columns: 2, columnOnly: false
  });
  const quoted = ui.parseA1Range("'Data 2026'!$C$4:$D$8");
  assert.equal(quoted.sheetPrefix, "'Data 2026'!");
  assert.equal(quoted.startColumn, 3);
  assert.equal(quoted.startRow, 4);
  assert.equal(quoted.rows, 5);
  assert.deepEqual(ui.parseA1Range('Z9'), {
    sheetPrefix: '', startColumn: 26, endColumn: 26, startRow: 9, endRow: 9,
    rows: 1, columns: 1, columnOnly: false
  });
  const columns = ui.parseA1Range('Archive!B:D');
  assert.equal(columns.columnOnly, true);
  assert.equal(columns.columns, 3);
  assert.equal(ui.parseA1Range('A0:B2'), null);
  assert.equal(ui.parseA1Range('https://attacker.example'), null);
  assert.equal(ui.parseA1Range(`${'Z'.repeat(400)}1`), null);
  assert.equal(ui.parseA1Range(`A${'9'.repeat(400)}`), null);
  assert.equal(ui.parseA1Range('ZZZ10000000').endRow, 10000000);
  assert.equal(ui.parseA1Range('AAAA1'), null);
});

test('encodes RAW strings as literal text and preserves USER_ENTERED formulas', () => {
  const raw = ui.encodeValues([['=1+1', '+2', '-3', '@name'], [true, 2, 'ok', '']], 'RAW');
  assert.equal(raw.success, true);
  assert.equal(raw.chunks.length, 1);
  assert.equal(raw.chunks[0].text, "'=1+1\t'+2\t'-3\t'@name\nTRUE\t2\t'ok\t");

  const rawStrings = ui.encodeValues([['001', 'TRUE', '2026-07-15', "'quoted"]], 'RAW');
  assert.equal(rawStrings.chunks[0].text, "'001\t'TRUE\t'2026-07-15\t''quoted");

  const entered = ui.encodeValues([['=1+1']], 'USER_ENTERED');
  assert.equal(entered.success, true);
  assert.equal(entered.chunks[0].text, '=1+1');
  assert.equal(ui.encodeValues([['=1+1']], 'FORMULA').reason, 'unsupported-value-input-option');
});

test('fails closed for lossy matrices and row-chunks large bounded writes', () => {
  assert.equal(ui.encodeValues([['a'], ['b', 'c']], 'RAW').reason, 'ragged-values-not-lossless');
  assert.equal(ui.encodeValues([[null]], 'RAW').reason, 'null-values-not-lossless');
  assert.equal(ui.encodeValues([['line\nbreak']], 'RAW').reason, 'multiline-or-tab-cell-not-lossless');
  assert.equal(ui.encodeValues([[Infinity]], 'RAW').reason, 'non-finite-number');

  const values = Array.from({ length: 6000 }, (_, index) => [String(index)]);
  const chunked = ui.encodeValues(values, 'RAW');
  assert.equal(chunked.success, true);
  assert.equal(chunked.cells, 6000);
  assert.equal(chunked.chunks.length, 2);
  assert.deepEqual(chunked.chunks.map(chunk => chunk.rowOffset), [0, 5000]);
});

test('legacy CSV conversion and read transpose reuse the shared value helpers', () => {
  const values = ui.csvToValues('name,note\nAda,"hello, world"\nBob,"quote ""inside"""');
  assert.deepEqual(values, [['name', 'note'], ['Ada', 'hello, world'], ['Bob', 'quote "inside"']]);
  assert.equal(ui.valuesToCsv(values), 'name,note\nAda,"hello, world"\nBob,"quote ""inside"""');
  assert.deepEqual(ui.transpose([['a', 'b'], ['c', 'd']]), [['a', 'c'], ['b', 'd']]);
});

test('DOM reads reject ranges whose cell-by-cell waits exceed the capability timeout budget', async () => {
  assert.equal(ui.limits.maxReadCells, 100);

  const oversized = sheetsDomHarness();
  const rejected = await oversized.api.sheetsReadValues('A1:Z50', 'ROWS');
  assert.equal(rejected.code, 'RECIPE_DOM_FALLBACK_PENDING');
  assert.equal(rejected.reason, 'ui-read-range-limit-exceeded');
  assert.equal(oversized.keyCalls.length, 0);

  const bounded = sheetsDomHarness();
  const accepted = await bounded.api.sheetsReadValues('A1:J10', 'ROWS');
  assert.equal(accepted.success, true);
  assert.equal(accepted.data.values.length, 10);
  assert.equal(accepted.data.values[0].length, 10);
});

test('append boundaries and clear readback fail closed when UI state is ambiguous', () => {
  const parsed = ui.parseA1Range('Data!A:C');
  assert.deepEqual(ui.appendRowFromTable(parsed, [
    ['', '', ''],
    ['', '', '']
  ], 1, 'OVERWRITE'), {
    success: false,
    reason: 'ui-append-boundary-ambiguous'
  });
  assert.equal(ui.appendRowFromTable(parsed, [
    ['h1', 'h2', 'h3'],
    ['a', '', 'c'],
    ['', '', '']
  ], 1, 'OVERWRITE').success, false);
  assert.equal(ui.appendRowFromTable(parsed, [
    ['h1', 'h2', 'h3'],
    ['', 'orphan', ''],
    ['', '', '']
  ], 1, 'OVERWRITE').success, false);
  assert.deepEqual(ui.appendRowFromTable(parsed, [
    ['h1', 'h2', 'h3'],
    ['a', 'b', 'c'],
    ['', '', ''],
    ['', '', '']
  ], 2, 'OVERWRITE'), {
    success: true,
    row: 3
  });
  assert.equal(ui.appendRowFromTable(parsed, [
    ['h1', 'h2', 'h3'],
    ['', '', ''],
    ['later', 'data', 'row']
  ], 2, 'OVERWRITE').reason, 'ui-append-target-not-empty');
  assert.equal(ui.appendRowFromTable(parsed, [
    ['h1', 'h2', 'h3'],
    ['', '', ''],
    ['later', 'data', 'row']
  ], 1, 'OVERWRITE').reason, 'ui-append-boundary-ambiguous');
  assert.equal(ui.appendRowFromTable(parsed, [
    ['h1', 'h2', 'h3'],
    ['', '', ''],
    ['later', 'data', 'row']
  ], 1, 'INSERT_ROWS').reason, 'ui-append-boundary-ambiguous');
  assert.equal(ui.valuesAreEmpty([['', ''], ['', '']]), true);
  assert.equal(ui.valuesAreEmpty([[''], ['still present']]), false);
  assert.equal(ui.valuesAreEmpty([[0]]), false);
});

test('DOM fallback requires trusted keys, confirmed addresses, and a real formula bar', async () => {
  const untrusted = sheetsDomHarness({
    keyPress() { return { success: true, method: 'domEvents', trusted: false }; }
  });
  const untrustedResult = await untrusted.api.sheetsUpdateValues('A1', [['x']], 'RAW');
  assert.equal(untrustedResult.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(untrusted.pasteCalls, 0);

  const wrongAddress = sheetsDomHarness({ confirmNavigation: false });
  const wrongAddressResult = await wrongAddress.api.sheetsNavigate('B2');
  assert.equal(wrongAddressResult.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(wrongAddressResult.reason, 'name-box-navigation-not-confirmed');

  const wrongWorksheet = sheetsDomHarness({ confirmWorksheetNavigation: false });
  const wrongWorksheetResult = await wrongWorksheet.api.sheetsUpdateValues(
    "'Other Sheet'!A1",
    [['must not paste']],
    'RAW'
  );
  assert.equal(wrongWorksheetResult.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(wrongWorksheetResult.reason, 'worksheet-navigation-not-confirmed');
  assert.equal(wrongWorksheet.pasteCalls, 0);

  const qualified = sheetsDomHarness();
  assert.equal((await qualified.api.sheetsNavigate("'Other Sheet'!A1")).success, true);

  const noFormula = sheetsDomHarness({ missingFormulaBar: true });
  const read = await noFormula.api.sheetsReadValues('A1', 'ROWS');
  assert.equal(read.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(read.reason, 'formula-bar-unavailable');
  assert.equal(noFormula.api.sheetsSpreadsheetMetadata().code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
});

test('DOM fallback uses Command on macOS and Control on other platforms', async () => {
  const mac = sheetsDomHarness({ platform: 'MacIntel', userAgentDataPlatform: 'macOS' });
  assert.equal((await mac.api.sheetsUpdateValues('A1', [['mac']], 'RAW')).success, true);
  const macSelect = mac.keyCalls.find(call => call.key === 'a');
  const macPaste = mac.keyCalls.find(call => call.key === 'v');
  assert.equal(macSelect.metaKey, true);
  assert.equal(macSelect.ctrlKey, undefined);
  assert.equal(macPaste.metaKey, true);
  assert.equal(macPaste.ctrlKey, undefined);

  const windows = sheetsDomHarness({ platform: 'Win32', userAgentDataPlatform: 'Windows' });
  assert.equal((await windows.api.sheetsUpdateValues('A1', [['windows']], 'RAW')).success, true);
  const windowsSelect = windows.keyCalls.find(call => call.key === 'a');
  const windowsPaste = windows.keyCalls.find(call => call.key === 'v');
  assert.equal(windowsSelect.ctrlKey, true);
  assert.equal(windowsSelect.metaKey, undefined);
  assert.equal(windowsPaste.ctrlKey, true);
  assert.equal(windowsPaste.metaKey, undefined);
});

test('DOM append scans a rectangular table and clear verifies actual readback', async () => {
  const append = sheetsDomHarness({
    cells: {
      A1: 'h1', B1: 'h2', C1: 'h3',
      A2: '', B2: 'orphan', C2: ''
    }
  });
  const appendResult = await append.api.sheetsAppendValues('A:C', [['x', 'y', 'z']], 'RAW', 'OVERWRITE');
  assert.equal(appendResult.code, 'RECIPE_DOM_FALLBACK_PENDING');
  assert.equal(appendResult.reason, 'ui-append-boundary-ambiguous');
  assert.equal(append.pasteCalls, 0);

  const insertRows = sheetsDomHarness({ cells: { A1: 'header', A3: 'later data' } });
  const insertResult = await insertRows.api.sheetsAppendValues('A:A', [['new']], 'RAW', 'INSERT_ROWS');
  assert.equal(insertResult.code, 'RECIPE_DOM_FALLBACK_PENDING');
  assert.equal(insertResult.reason, 'ui-insert-rows-unverified');
  assert.equal(insertRows.insertCalls, 0);
  assert.equal(insertRows.pasteCalls, 0);

  const clearNoEffect = sheetsDomHarness({ cells: { A1: 'still here' }, deleteHasEffect: false });
  const clearResult = await clearNoEffect.api.sheetsClearValues('A1');
  assert.equal(clearResult.code, 'RECOVERY_AMBIGUOUS');
  assert.equal(clearResult.reason, 'ui-clear-verification-mismatch');
  assert.equal(clearNoEffect.deleteCalls, 1);

  const clearWrongTarget = sheetsDomHarness({ cells: { A1: 'keep' }, confirmNavigation: false });
  const wrongTargetResult = await clearWrongTarget.api.sheetsClearValues('B2');
  assert.equal(wrongTargetResult.code, 'GOOGLE_SHEETS_SESSION_UNAVAILABLE');
  assert.equal(clearWrongTarget.deleteCalls, 0);
});

test('content-level Sheets UI lock serializes read and mutation gestures', async () => {
  const harness = sheetsDomHarness();
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const events = [];
  let active = 0;
  let maxConcurrent = 0;
  const operation = (name, wait) => harness.api.sheetsWithUiLock(async () => {
    events.push(`start:${name}`);
    active++;
    maxConcurrent = Math.max(maxConcurrent, active);
    if (wait) await gate;
    active--;
    events.push(`end:${name}`);
    return name;
  });

  const read = operation('read', true);
  await Promise.resolve();
  const mutation = operation('mutation', false);
  await Promise.resolve();
  assert.deepEqual(events, ['start:read']);
  releaseFirst();
  assert.deepEqual(await Promise.all([read, mutation]), ['read', 'mutation']);
  assert.equal(maxConcurrent, 1);
  assert.deepEqual(events, ['start:read', 'end:read', 'start:mutation', 'end:mutation']);
});

test('fixed DOM actions reject caller-supplied option values outside the typed enums', async () => {
  const harness = sheetsDomHarness({ cells: { A1: 'header' } });
  assert.equal(
    (await harness.api.sheetsUpdateValues('A1', [['=unsafe']], 'FORMULA')).reason,
    'unsupported-value-input-option'
  );
  assert.equal(
    (await harness.api.sheetsAppendValues('A:C', [['x']], 'RAW', 'SHIFT_DOWN')).reason,
    'unsupported-insert-data-option'
  );
});

test('content action exposes only the fixed Sheets UI operations and protects value-bearing logs', () => {
  const actions = ACTIONS_SOURCE;
  const messaging = fs.readFileSync(path.join(ROOT, 'extension/content/messaging.js'), 'utf8');
  const background = fs.readFileSync(path.join(ROOT, 'extension/background.js'), 'utf8');
  const wsClient = fs.readFileSync(path.join(ROOT, 'extension/ws/ws-client.js'), 'utf8');
  const legacySheetsActions = actions.slice(
    actions.indexOf('fillsheet: async'),
    actions.indexOf('dragdrop: async')
  );

  assert.match(actions, /sheetsSession:\s*async/);
  assert.match(actions, /sheetsSession:\s*async[\s\S]{0,1000}return sheetsWithUiLock/);
  assert.match(actions, /fillsheet:\s*async[\s\S]{0,1500}return sheetsWithUiLock/);
  assert.match(actions, /readsheet:\s*async[\s\S]{0,1000}return sheetsWithUiLock/);
  for (const operation of ['getSpreadsheet', 'getValues', 'updateValues', 'appendValues', 'clearValues']) {
    assert.match(actions, new RegExp(`operation === '${operation}'`));
  }
  assert.match(actions, /RECOVERY_AMBIGUOUS/);
  assert.match(actions, /renderSemantics:\s*'formula-bar'/);
  assert.match(actions, /sheetsUi\.csvToValues\(data\)/);
  assert.match(actions, /sheetsReadValues\(range, 'ROWS'\)/);
  assert.doesNotMatch(legacySheetsActions, /document\.querySelector\('#t-name-box'\)|tools\.keyPress\(/);
  assert.match(messaging, /'fillsheet'[\s\S]*'readsheet'[\s\S]*'sheetsSession'/);
  assert.match(messaging, /longTimeoutTools = \[[^\]]*'sheetsSession'/);
  assert.match(background, /'utils\/google-sheets-ui\.js'[\s\S]*'content\/actions\.js'/);
  assert.match(wsClient, /'utils\/google-sheets-ui\.js'[\s\S]*'content\/actions\.js'/);
});
