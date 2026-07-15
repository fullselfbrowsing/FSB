'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ui = require('../extension/utils/google-sheets-ui.js');
const ROOT = path.resolve(__dirname, '..');

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

test('append boundaries and clear readback fail closed when UI state is ambiguous', () => {
  const parsed = ui.parseA1Range('Data!A:C');
  assert.deepEqual(ui.appendRowFromBoundary(parsed, '', 'A1', ''), {
    success: false,
    reason: 'ui-append-boundary-ambiguous'
  });
  assert.equal(ui.appendRowFromBoundary(parsed, 'header', 'B8', 'value').success, false);
  assert.deepEqual(ui.appendRowFromBoundary(parsed, 'header', 'A8', 'last row'), {
    success: true,
    row: 9
  });
  assert.equal(ui.valuesAreEmpty([['', ''], ['', '']]), true);
  assert.equal(ui.valuesAreEmpty([[''], ['still present']]), false);
  assert.equal(ui.valuesAreEmpty([[0]]), false);
});

test('content action exposes only the fixed Sheets UI operations and protects value-bearing logs', () => {
  const actions = fs.readFileSync(path.join(ROOT, 'extension/content/actions.js'), 'utf8');
  const messaging = fs.readFileSync(path.join(ROOT, 'extension/content/messaging.js'), 'utf8');
  const background = fs.readFileSync(path.join(ROOT, 'extension/background.js'), 'utf8');
  const wsClient = fs.readFileSync(path.join(ROOT, 'extension/ws/ws-client.js'), 'utf8');

  assert.match(actions, /sheetsSession:\s*async/);
  for (const operation of ['getSpreadsheet', 'getValues', 'updateValues', 'appendValues', 'clearValues']) {
    assert.match(actions, new RegExp(`operation === '${operation}'`));
  }
  assert.match(actions, /RECOVERY_AMBIGUOUS/);
  assert.match(actions, /renderSemantics:\s*'formula-bar'/);
  assert.match(actions, /sheetsUi\.csvToValues\(data\)/);
  assert.match(actions, /sheetsReadValues\(range, 'ROWS'\)/);
  assert.match(messaging, /'fillsheet'[\s\S]*'readsheet'[\s\S]*'sheetsSession'/);
  assert.match(messaging, /longTimeoutTools = \[[^\]]*'sheetsSession'/);
  assert.match(background, /'utils\/google-sheets-ui\.js'[\s\S]*'content\/actions\.js'/);
  assert.match(wsClient, /'utils\/google-sheets-ui\.js'[\s\S]*'content\/actions\.js'/);
});
