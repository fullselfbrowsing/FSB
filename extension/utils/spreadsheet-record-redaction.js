(function (global) {
  'use strict';

  var KNOWN_CAPABILITIES = Object.freeze({
    'gsheets.get_spreadsheet': true,
    'gsheets.get_values': true,
    'gsheets.update_values': true,
    'gsheets.append_values': true,
    'gsheets.clear_values': true
  });
  var LEGACY_TOOLS = Object.freeze({
    fill_sheet: true,
    read_sheet: true,
    fillsheet: true,
    readsheet: true
  });
  var SHEETS_NAVIGATION_TOOLS = Object.freeze({
    navigate: true,
    open_tab: true,
    switch_tab: true,
    close_tab: true
  });
  var SHEETS_DOCUMENT_PATH = /^\/spreadsheets\/d\/[^/]+(?:\/|$)/;
  var SAFE_OPERATION = /^[a-z0-9:_-]{1,80}$/i;
  var SAFE_ERROR_CODE = /^(?:GOOGLE_SHEETS|RECIPE)_[A-Z0-9_]{1,64}$/;
  var SAFE_EXACT_ERROR_CODES = Object.freeze({ RECOVERY_AMBIGUOUS: true });

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function isGoogleSheetsDocumentUrl(value) {
    if (typeof value !== 'string' || value.length === 0) { return false; }
    if (typeof URL !== 'function') { return true; }
    try {
      var parsed = new URL(value);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.hostname === 'docs.google.com' && SHEETS_DOCUMENT_PATH.test(parsed.pathname);
    } catch (_e) {
      return false;
    }
  }

  function hasGoogleSheetsDocumentUrl(entry, payload) {
    var params = object(entry.params || payload.params);
    var response = object(entry.response);
    var changeReport = object(response.change_report);
    var changeReportUrl = object(changeReport.url);
    var candidates = [
      params.url,
      response.url,
      changeReportUrl.before,
      changeReportUrl.after
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (isGoogleSheetsDocumentUrl(candidates[i])) { return true; }
    }
    return false;
  }

  function classify(entry) {
    if (!entry || typeof entry !== 'object') { return null; }
    var payload = object(entry.requestPayload || entry.payload);
    if (LEGACY_TOOLS[entry.tool]) {
      return { operation: entry.tool, actionShape: true };
    }
    if (entry.tool === 'mcp:capabilities-invoke' && typeof payload.slug === 'string' && payload.slug.indexOf('gsheets.') === 0) {
      return {
        operation: KNOWN_CAPABILITIES[payload.slug] ? payload.slug : 'gsheets.unknown',
        actionShape: false
      };
    }
    if (entry.spreadsheetTarget === true || hasGoogleSheetsDocumentUrl(entry, payload)) {
      return {
        operation: typeof entry.tool === 'string' && SAFE_OPERATION.test(entry.tool)
          ? entry.tool
          : 'sheets.unknown',
        actionShape: Object.prototype.hasOwnProperty.call(entry, 'payload') || SHEETS_NAVIGATION_TOOLS[entry.tool] === true
      };
    }
    return null;
  }

  function arrayShape(values) {
    if (!Array.isArray(values)) { return null; }
    var rows = values;
    if (rows.length > 0 && !Array.isArray(rows[0])) { rows = [rows]; }
    var rowCount = rows.length;
    var columnCount = 0;
    var valueCount = 0;
    for (var i = 0; i < rows.length; i++) {
      if (!Array.isArray(rows[i])) { continue; }
      if (rows[i].length > columnCount) { columnCount = rows[i].length; }
      valueCount += rows[i].length;
    }
    return { rowCount: rowCount, columnCount: columnCount, valueCount: valueCount };
  }

  function csvShape(csv) {
    if (typeof csv !== 'string' || csv.length === 0) {
      return { rowCount: 0, columnCount: 0, valueCount: 0 };
    }
    var rowCount = 1;
    var currentColumns = 1;
    var columnCount = 1;
    var valueCount = 0;
    var quoted = false;
    for (var i = 0; i < csv.length; i++) {
      var ch = csv[i];
      if (ch === '"') {
        if (quoted && csv[i + 1] === '"') { i++; }
        else { quoted = !quoted; }
      } else if (!quoted && ch === ',') {
        currentColumns++;
      } else if (!quoted && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && csv[i + 1] === '\n') { i++; }
        valueCount += currentColumns;
        if (currentColumns > columnCount) { columnCount = currentColumns; }
        rowCount++;
        currentColumns = 1;
      }
    }
    valueCount += currentColumns;
    if (currentColumns > columnCount) { columnCount = currentColumns; }
    return { rowCount: rowCount, columnCount: columnCount, valueCount: valueCount };
  }

  function numericCounts(source) {
    source = object(source);
    var out = {};
    var fields = ['updatedRows', 'updatedColumns', 'updatedCells', 'updatedSheets'];
    for (var i = 0; i < fields.length; i++) {
      var value = source[fields[i]];
      if (Number.isFinite(value) && value >= 0) { out[fields[i]] = Math.floor(value); }
    }
    return out;
  }

  function mergeShape(primary, counts) {
    var out = { rowCount: 0, columnCount: 0, valueCount: 0 };
    if (primary) {
      out.rowCount = primary.rowCount;
      out.columnCount = primary.columnCount;
      out.valueCount = primary.valueCount;
    }
    var keys = Object.keys(counts || {});
    for (var i = 0; i < keys.length; i++) { out[keys[i]] = counts[keys[i]]; }
    return out;
  }

  function requestShape(params) {
    params = object(params);
    if (Array.isArray(params.values)) { return arrayShape(params.values); }
    if (typeof params.csvData === 'string') { return csvShape(params.csvData); }
    if (typeof params.data === 'string') { return csvShape(params.data); }
    return { rowCount: 0, columnCount: 0, valueCount: 0 };
  }

  function responseShape(response) {
    var root = response;
    var rootObject = object(response);
    var rawData = rootObject.data;
    var data = object(rawData);
    var updates = object(data.updates || rootObject.updates);
    var candidates = [
      Array.isArray(root) ? root : null,
      rootObject.values,
      Array.isArray(rawData) ? rawData : null,
      data.values,
      data.rows
    ];
    var shape = typeof rawData === 'string' ? csvShape(rawData) : null;
    for (var i = 0; i < candidates.length; i++) {
      if (Array.isArray(candidates[i])) { shape = arrayShape(candidates[i]); break; }
    }
    var counts = numericCounts(object(root));
    var dataCounts = numericCounts(data);
    var updateCounts = numericCounts(updates);
    var key;
    for (key in dataCounts) { if (Object.prototype.hasOwnProperty.call(dataCounts, key)) { counts[key] = dataCounts[key]; } }
    for (key in updateCounts) { if (Object.prototype.hasOwnProperty.call(updateCounts, key)) { counts[key] = updateCounts[key]; } }
    return mergeShape(shape, counts);
  }

  function safePayload(source, classification, params) {
    source = object(source);
    var out = {
      params: {
        operation: classification.operation,
        shape: requestShape(params)
      }
    };
    if (classification.operation.indexOf('gsheets.') === 0) { out.slug = classification.operation; }
    if (typeof source.agentId === 'string' && source.agentId.length > 0 && source.agentId.length <= 256) {
      out.agentId = source.agentId;
    }
    if (Number.isFinite(source.tab_id)) { out.tab_id = source.tab_id; }
    if (Number.isFinite(source.tabId)) { out.tabId = source.tabId; }
    if (source.visualSession && typeof source.visualSession === 'object') {
      out.visualSession = { isFinal: source.visualSession.isFinal === true };
    }
    if (classification.actionShape) { out.tool = classification.operation; }
    return out;
  }

  function safeResponse(source, success) {
    var value = object(source);
    var out = {
      success: success === true,
      shape: responseShape(source)
    };
    if (Number.isFinite(value.status) && value.status >= 100 && value.status <= 599) {
      out.status = Math.floor(value.status);
    }
    var code = typeof value.errorCode === 'string' ? value.errorCode : value.code;
    if (typeof code === 'string' && (SAFE_ERROR_CODE.test(code) || SAFE_EXACT_ERROR_CODES[code])) {
      out.errorCode = code;
    }
    return out;
  }

  function baseFields(entry) {
    var out = {
      client: entry.client,
      tool: entry.tool,
      success: entry.success === true,
      tabId: Number.isFinite(entry.tabId) ? entry.tabId : null
    };
    if (typeof entry.dispatcher_route === 'string') { out.dispatcher_route = entry.dispatcher_route; }
    return out;
  }

  function sanitizeEntry(entry) {
    var classification = classify(entry);
    if (!classification) { return entry; }
    var sourcePayload = object(entry.requestPayload || entry.payload);
    var sourceParams = object(entry.params || sourcePayload.params);
    var out = baseFields(entry);
    var payload = safePayload(sourcePayload, classification, sourceParams);
    var response = safeResponse(entry.response, entry.success === true);

    if (Object.prototype.hasOwnProperty.call(entry, 'requestPayload')) {
      out.requestPayload = payload;
    } else {
      out.params = payload.params;
      out.payload = payload;
    }
    out.response = response;
    return out;
  }

  function recordSafely(recorder, method, entry) {
    if (!recorder || typeof recorder[method] !== 'function') { return false; }
    try {
      var sanitized = sanitizeEntry(entry);
      // Content-bearing recorder hooks must prove their resolved target origin.
      // If the hook could not do so and the entry carries no direct Sheets
      // evidence that this module can sanitize, omit the diagnostic record.
      if (entry && entry.requireTargetOrigin === true &&
          entry.targetOriginResolved !== true && sanitized === entry) {
        return false;
      }
      recorder[method](sanitized);
      return true;
    } catch (_e) {
      // Recording is diagnostic-only. A sanitization failure drops the entry.
      return false;
    }
  }

  var api = Object.freeze({ sanitizeEntry: sanitizeEntry, classify: classify, recordSafely: recordSafely });
  global.FsbSpreadsheetRecordRedaction = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
