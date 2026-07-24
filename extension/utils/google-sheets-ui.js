(function (global) {
  'use strict';

  var MAX_READ_ROWS = 50;
  var MAX_READ_COLUMNS = 26;
  var MAX_READ_CELLS = 100;
  var MAX_UI_CELLS = 10000;
  var MAX_CLEAR_CELLS = 100;
  var MAX_CHUNK_CELLS = 5000;
  var MAX_TOTAL_BYTES = 1024 * 1024;
  var MAX_CHUNK_BYTES = 256 * 1024;
  var MAX_SHEETS_COLUMNS = 18278;
  var MAX_SHEETS_ROWS = 10000000;
  var MAX_APPEND_TABLE_ROWS = 25;
  var MAX_APPEND_COLUMNS = 10;
  var MAX_APPEND_ROWS = 25;

  function columnToNumber(column) {
    var value = String(column || '').toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(value)) { return 0; }
    var number = 0;
    for (var i = 0; i < value.length; i++) {
      number = number * 26 + value.charCodeAt(i) - 64;
    }
    return number <= MAX_SHEETS_COLUMNS ? number : 0;
  }

  function numberToColumn(number) {
    number = Number(number);
    if (!Number.isInteger(number) || number < 1 || number > MAX_SHEETS_COLUMNS) { return ''; }
    var out = '';
    while (number > 0) {
      var remainder = (number - 1) % 26;
      out = String.fromCharCode(65 + remainder) + out;
      number = Math.floor((number - 1) / 26);
    }
    return out;
  }

  function splitSheetPrefix(value) {
    var input = String(value || '').trim();
    var bang = -1;
    var quoted = false;
    for (var i = 0; i < input.length; i++) {
      if (input[i] === "'") {
        if (quoted && input[i + 1] === "'") { i++; continue; }
        quoted = !quoted;
      } else if (input[i] === '!' && !quoted) {
        bang = i;
      }
    }
    return bang === -1
      ? { sheetPrefix: '', address: input }
      : { sheetPrefix: input.slice(0, bang + 1), address: input.slice(bang + 1) };
  }

  function parseA1Range(value) {
    var parts = splitSheetPrefix(value);
    var address = parts.address.replace(/\$/g, '');
    var cellMatch = address.match(/^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/);
    if (cellMatch) {
      var startColumn = columnToNumber(cellMatch[1]);
      var endColumn = columnToNumber(cellMatch[3] || cellMatch[1]);
      var startRow = Number(cellMatch[2]);
      var endRow = Number(cellMatch[4] || cellMatch[2]);
      if (!startColumn || !endColumn || !Number.isSafeInteger(startRow) || !Number.isSafeInteger(endRow) ||
          startRow < 1 || endRow > MAX_SHEETS_ROWS || endRow < startRow || endColumn < startColumn) { return null; }
      return {
        sheetPrefix: parts.sheetPrefix,
        startColumn: startColumn,
        endColumn: endColumn,
        startRow: startRow,
        endRow: endRow,
        rows: endRow - startRow + 1,
        columns: endColumn - startColumn + 1,
        columnOnly: false
      };
    }
    var columnMatch = address.match(/^([A-Za-z]+)(?::([A-Za-z]+))?$/);
    if (!columnMatch) { return null; }
    var firstColumn = columnToNumber(columnMatch[1]);
    var lastColumn = columnToNumber(columnMatch[2] || columnMatch[1]);
    if (!firstColumn || lastColumn < firstColumn) { return null; }
    return {
      sheetPrefix: parts.sheetPrefix,
      startColumn: firstColumn,
      endColumn: lastColumn,
      startRow: 1,
      endRow: null,
      rows: null,
      columns: lastColumn - firstColumn + 1,
      columnOnly: true
    };
  }

  function cellReference(parsed, column, row) {
    return (parsed && parsed.sheetPrefix || '') + numberToColumn(column) + String(row);
  }

  function byteLength(value) {
    var text = String(value || '');
    if (typeof TextEncoder !== 'undefined') { return new TextEncoder().encode(text).byteLength; }
    return unescape(encodeURIComponent(text)).length;
  }

  function normalizeCell(value, valueInputOption) {
    if (value === null || value === undefined) { return { error: 'null-values-not-lossless' }; }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? { value: String(value) } : { error: 'non-finite-number' };
    }
    if (typeof value === 'boolean') { return { value: value ? 'TRUE' : 'FALSE' }; }
    if (typeof value !== 'string') { return { error: 'unsupported-cell-type' }; }
    if (/[\t\r\n]/.test(value)) { return { error: 'multiline-or-tab-cell-not-lossless' }; }
    if ((valueInputOption || 'RAW') === 'RAW' && value !== '') {
      // Pasting bare strings lets Sheets coerce values such as 001, TRUE, and
      // dates. A leading apostrophe is Sheets' literal-text marker; doubling an
      // existing leading apostrophe preserves that character too.
      return { value: "'" + value };
    }
    return { value: value };
  }

  function encodeValues(values, valueInputOption) {
    var inputOption = valueInputOption || 'RAW';
    if (inputOption !== 'RAW' && inputOption !== 'USER_ENTERED') {
      return { success: false, reason: 'unsupported-value-input-option' };
    }
    if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0]) || values[0].length === 0) {
      return { success: false, reason: 'values-must-be-a-non-empty-matrix' };
    }
    var columns = values[0].length;
    var totalCells = values.length * columns;
    if (totalCells > MAX_UI_CELLS) { return { success: false, reason: 'ui-cell-limit-exceeded' }; }
    var encodedRows = [];
    for (var rowIndex = 0; rowIndex < values.length; rowIndex++) {
      var row = values[rowIndex];
      if (!Array.isArray(row) || row.length !== columns) {
        return { success: false, reason: 'ragged-values-not-lossless' };
      }
      var encodedRow = [];
      for (var columnIndex = 0; columnIndex < row.length; columnIndex++) {
        var normalized = normalizeCell(row[columnIndex], inputOption);
        if (normalized.error) { return { success: false, reason: normalized.error }; }
        encodedRow.push(normalized.value);
      }
      encodedRows.push(encodedRow.join('\t'));
    }
    var allText = encodedRows.join('\n');
    if (byteLength(allText) > MAX_TOTAL_BYTES) { return { success: false, reason: 'ui-payload-limit-exceeded' }; }

    var chunks = [];
    var currentRows = [];
    var currentCells = 0;
    var currentBytes = 0;
    var rowOffset = 0;
    for (var i = 0; i < encodedRows.length; i++) {
      var rowText = encodedRows[i];
      var rowBytes = byteLength(rowText) + (currentRows.length ? 1 : 0);
      if (columns > MAX_CHUNK_CELLS || rowBytes > MAX_CHUNK_BYTES) {
        return { success: false, reason: 'ui-row-limit-exceeded' };
      }
      if (currentRows.length && (currentCells + columns > MAX_CHUNK_CELLS || currentBytes + rowBytes > MAX_CHUNK_BYTES)) {
        chunks.push({ rowOffset: rowOffset, rows: currentRows.length, columns: columns, text: currentRows.join('\n') });
        rowOffset += currentRows.length;
        currentRows = [];
        currentCells = 0;
        currentBytes = 0;
        rowBytes = byteLength(rowText);
      }
      currentRows.push(rowText);
      currentCells += columns;
      currentBytes += rowBytes;
    }
    if (currentRows.length) {
      chunks.push({ rowOffset: rowOffset, rows: currentRows.length, columns: columns, text: currentRows.join('\n') });
    }
    return {
      success: true,
      rows: values.length,
      columns: columns,
      cells: totalCells,
      chunks: chunks
    };
  }

  function transpose(values) {
    if (!Array.isArray(values) || !values.length) { return []; }
    var width = values.reduce(function (max, row) { return Math.max(max, Array.isArray(row) ? row.length : 0); }, 0);
    var output = [];
    for (var column = 0; column < width; column++) {
      var next = [];
      for (var row = 0; row < values.length; row++) { next.push(values[row] && values[row][column] !== undefined ? values[row][column] : ''); }
      output.push(next);
    }
    return output;
  }

  function isEmptyCell(value) {
    return value === '' || value === null || value === undefined;
  }

  function appendRowFromTable(parsed, values, rowsNeeded, insertDataOption) {
    var requiredRows = Number(rowsNeeded);
    var mode = insertDataOption || 'OVERWRITE';
    if (!parsed || !Array.isArray(values) || !Number.isInteger(requiredRows) ||
        requiredRows < 1 || requiredRows > MAX_APPEND_ROWS ||
        (mode !== 'OVERWRITE' && mode !== 'INSERT_ROWS')) {
      return { success: false, reason: 'ui-append-boundary-ambiguous' };
    }
    var boundaryIndex = -1;
    for (var index = 0; index < values.length; index++) {
      var row = values[index];
      if (!Array.isArray(row) || row.length !== parsed.columns) {
        return { success: false, reason: 'ui-append-boundary-ambiguous' };
      }
      var empty = row.every(isEmptyCell);
      var full = row.every(function(value) { return !isEmptyCell(value); });
      if (boundaryIndex === -1) {
        if (full && index < MAX_APPEND_TABLE_ROWS) { continue; }
        if (!empty || index === 0 || index > MAX_APPEND_TABLE_ROWS) {
          return { success: false, reason: 'ui-append-boundary-ambiguous' };
        }
        boundaryIndex = index;
      }
      if (boundaryIndex !== -1 && !empty) {
        return {
          success: false,
          reason: index < boundaryIndex + requiredRows
            ? 'ui-append-target-not-empty'
            : 'ui-append-boundary-ambiguous'
        };
      }
    }
    if (boundaryIndex === -1 || boundaryIndex + requiredRows > values.length) {
      return { success: false, reason: 'ui-append-boundary-ambiguous' };
    }
    return { success: true, row: (parsed.startRow || 1) + boundaryIndex };
  }

  function valuesAreEmpty(values) {
    return Array.isArray(values) && values.every(function (row) {
      return Array.isArray(row) && row.every(function (value) {
        return value === '' || value === null || value === undefined;
      });
    });
  }

  function csvToValues(csvText) {
    var input = String(csvText || '');
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    for (var i = 0; i < input.length; i++) {
      var character = input[i];
      if (character === '"') {
        if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = !quoted; }
      } else if (character === ',' && !quoted) {
        row.push(cell.trim()); cell = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && input[i + 1] === '\n') { i++; }
        row.push(cell.trim());
        if (row.some(function (value) { return value !== ''; })) { rows.push(row); }
        row = []; cell = '';
      } else {
        cell += character;
      }
    }
    row.push(cell.trim());
    if (row.some(function (value) { return value !== ''; })) { rows.push(row); }
    return rows;
  }

  function valuesToCsv(values) {
    return (values || []).map(function (row) {
      return (row || []).map(function (value) {
        var text = value === undefined || value === null ? '' : String(value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(',');
    }).join('\n');
  }

  var api = Object.freeze({
    parseA1Range: parseA1Range,
    columnToNumber: columnToNumber,
    numberToColumn: numberToColumn,
    cellReference: cellReference,
    encodeValues: encodeValues,
    transpose: transpose,
    appendRowFromTable: appendRowFromTable,
    valuesAreEmpty: valuesAreEmpty,
    csvToValues: csvToValues,
    valuesToCsv: valuesToCsv,
    limits: Object.freeze({
      maxReadRows: MAX_READ_ROWS,
      maxReadColumns: MAX_READ_COLUMNS,
      maxReadCells: MAX_READ_CELLS,
      maxUiCells: MAX_UI_CELLS,
      maxClearCells: MAX_CLEAR_CELLS,
      maxChunkCells: MAX_CHUNK_CELLS,
      maxTotalBytes: MAX_TOTAL_BYTES,
      maxChunkBytes: MAX_CHUNK_BYTES,
      maxSheetsColumns: MAX_SHEETS_COLUMNS,
      maxSheetsRows: MAX_SHEETS_ROWS,
      maxAppendTableRows: MAX_APPEND_TABLE_ROWS,
      maxAppendColumns: MAX_APPEND_COLUMNS,
      maxAppendRows: MAX_APPEND_ROWS
    })
  });
  global.FsbGoogleSheetsUi = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
