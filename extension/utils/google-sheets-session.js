(function (global) {
  'use strict';

  var SHEETS_ORIGIN = 'https://docs.google.com';
  var SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';
  var REQUEST_TIMEOUT_MS = 15000;
  var SPREADSHEET_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
  var SHEETS_URL_RE = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/;
  var MUTATIONS = { updateValues: true, appendValues: true, clearValues: true };

  var ERROR_MESSAGES = {
    GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED: 'Open the target spreadsheet in the agent-owned Google Sheets tab.',
    GOOGLE_SHEETS_TARGET_MISMATCH: 'The requested spreadsheet does not match the agent-owned Google Sheets tab.',
    GOOGLE_SHEETS_SESSION_UNAVAILABLE: 'The signed-in Google Sheets page session is unavailable.',
    RECIPE_DOM_FALLBACK_PENDING: 'The requested Sheets operation is not safely available through the UI fallback.',
    RECOVERY_AMBIGUOUS: 'The Sheets mutation may have taken effect. It was not retried.'
  };

  function typedError(code, extra) {
    var out = {
      success: false,
      code: code,
      errorCode: code,
      error: ERROR_MESSAGES[code] || code
    };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) { out[key] = extra[key]; }
      }
    }
    return out;
  }

  function spreadsheetIdFromUrl(value) {
    try {
      var parsed = new URL(String(value || ''));
      if (parsed.origin !== SHEETS_ORIGIN) { return ''; }
      var match = parsed.pathname.match(SHEETS_URL_RE);
      return match ? match[1] : '';
    } catch (_e) {
      return '';
    }
  }

  function pageClientOperation(request) {
    return (async function () {
      function error(code, extra) {
        var out = { success: false, code: code, errorCode: code, error: code };
        if (extra) {
          for (var key in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, key)) { out[key] = extra[key]; }
          }
        }
        return out;
      }
      function encode(value) {
        return encodeURIComponent(String(value)).replace(/[!'()*]/g, function (character) {
          return '%' + character.charCodeAt(0).toString(16).toUpperCase();
        });
      }
      function addParam(list, key, value) {
        if (value !== undefined && value !== null && value !== '') {
          list.push(encode(key) + '=' + encode(value));
        }
      }
      function statusFromFailure(failure) {
        var status = Number(failure && failure.status);
        if (!isFinite(status)) { status = Number(failure && failure.result && failure.result.error && failure.result.error.code); }
        return isFinite(status) ? status : 0;
      }
      function responseData(response) {
        if (response && response.result && typeof response.result === 'object') { return response.result; }
        if (response && typeof response.body === 'string' && response.body) {
          try { return JSON.parse(response.body); } catch (_e) { return {}; }
        }
        return response && typeof response === 'object' ? response : {};
      }

      var operation = String(request && request.operation || '');
      var args = request && request.args && typeof request.args === 'object' ? request.args : {};
      var spreadsheetId = String(request && request.spreadsheetId || '');
      var mutating = operation === 'updateValues' || operation === 'appendValues' || operation === 'clearValues';
      var pageLocation = globalThis.location;
      var pageMatch = pageLocation && pageLocation.origin === 'https://docs.google.com'
        ? String(pageLocation.pathname || '').match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/)
        : null;
      if (!pageMatch || pageMatch[1] !== spreadsheetId) {
        return error('GOOGLE_SHEETS_TARGET_MISMATCH', {
          reason: 'page-spreadsheet-changed-before-request',
          requestSent: false
        });
      }
      var gapiClient = globalThis.gapi && globalThis.gapi.client;
      if (!gapiClient || typeof gapiClient.request !== 'function') {
        return error('GOOGLE_SHEETS_SESSION_UNAVAILABLE', {
          reason: 'page-gapi-client-unavailable',
          safeToFallback: true,
          requestSent: false
        });
      }

      var path = 'https://sheets.googleapis.com/v4/spreadsheets/' + encode(spreadsheetId);
      var method = 'GET';
      var params = {};
      var body;
      if (operation === 'getSpreadsheet') {
        params.fields = 'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType,gridProperties))';
      } else if (operation === 'getValues') {
        path += '/values/' + encode(args.range);
        if (args.majorDimension) { params.majorDimension = args.majorDimension; }
        if (args.valueRenderOption) { params.valueRenderOption = args.valueRenderOption; }
        if (args.dateTimeRenderOption) { params.dateTimeRenderOption = args.dateTimeRenderOption; }
      } else if (operation === 'updateValues') {
        path += '/values/' + encode(args.range);
        method = 'PUT';
        params.valueInputOption = args.valueInputOption || 'RAW';
        body = { values: args.values };
      } else if (operation === 'appendValues') {
        path += '/values/' + encode(args.range) + ':append';
        method = 'POST';
        params.valueInputOption = args.valueInputOption || 'RAW';
        params.insertDataOption = args.insertDataOption || 'OVERWRITE';
        body = { values: args.values };
      } else if (operation === 'clearValues') {
        path += '/values/' + encode(args.range) + ':clear';
        method = 'POST';
        body = {};
      } else {
        return error('RECIPE_DOM_FALLBACK_PENDING', { reason: 'unsupported-sheets-operation' });
      }

      var pending;
      try {
        pending = gapiClient.request({ path: path, method: method, params: params, body: body });
      } catch (_syncError) {
        return error('GOOGLE_SHEETS_SESSION_UNAVAILABLE', {
          reason: 'page-gapi-request-not-started',
          safeToFallback: true,
          requestSent: false
        });
      }

      var timeoutId;
      var timeout = new Promise(function (resolve) {
        timeoutId = setTimeout(function () { resolve({ timedOut: true }); }, Number(request.timeoutMs) || 15000);
      });
      var settled = await Promise.race([
        Promise.resolve(pending).then(function (value) { return { value: value }; }, function (failure) { return { failure: failure }; }),
        timeout
      ]);
      clearTimeout(timeoutId);

      if (settled.timedOut) {
        return mutating
          ? error('RECOVERY_AMBIGUOUS', { reason: 'page-gapi-timeout', requestSent: true })
          : error('GOOGLE_SHEETS_SESSION_UNAVAILABLE', { reason: 'page-gapi-timeout', safeToFallback: true, requestSent: true });
      }
      if (settled.failure) {
        var status = statusFromFailure(settled.failure);
        if (status === 401 || status === 403) {
          return error('GOOGLE_SHEETS_SESSION_UNAVAILABLE', {
            reason: 'page-gapi-session-rejected',
            status: status,
            safeToFallback: true,
            requestSent: true,
            knownNoEffect: true
          });
        }
        if (mutating && (status === 408 || (status >= 500 && status <= 599))) {
          return error('RECOVERY_AMBIGUOUS', {
            reason: 'page-gapi-server-failure',
            status: status,
            requestSent: true
          });
        }
        if (mutating && !status) {
          return error('RECOVERY_AMBIGUOUS', { reason: 'page-gapi-unknown-failure', requestSent: true });
        }
        return error('RECIPE_DOM_FALLBACK_PENDING', {
          reason: status ? 'page-gapi-request-rejected' : 'page-gapi-request-failed',
          status: status || undefined,
          requestSent: true
        });
      }

      var response = settled.value || {};
      var responseStatus = Number(response.status) || 200;
      if (responseStatus >= 400) {
        if (responseStatus === 401 || responseStatus === 403) {
          return error('GOOGLE_SHEETS_SESSION_UNAVAILABLE', {
            reason: 'page-gapi-session-rejected',
            status: responseStatus,
            safeToFallback: true,
            requestSent: true,
            knownNoEffect: true
          });
        }
        if (mutating && (responseStatus === 408 || (responseStatus >= 500 && responseStatus <= 599))) {
          return error('RECOVERY_AMBIGUOUS', {
            reason: 'page-gapi-server-failure',
            status: responseStatus,
            requestSent: true
          });
        }
        return error('RECIPE_DOM_FALLBACK_PENDING', {
          reason: 'page-gapi-request-rejected',
          status: responseStatus,
          requestSent: true
        });
      }
      return {
        success: true,
        status: responseStatus,
        data: responseData(response),
        transport: 'page-client'
      };
    })();
  }

  function createSession(deps) {
    deps = deps || {};
    var chromeApi = deps.chrome || global.chrome;
    var timeoutMs = deps.requestTimeoutMs || REQUEST_TIMEOUT_MS;
    var mutationChains = new Map();

    async function resolveTarget(params, context) {
      params = params || {};
      context = context || {};
      var tabId = Number(context.tabId);
      if (!Number.isInteger(tabId) || !chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.get !== 'function') {
        return typedError('GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED');
      }
      var tab;
      try { tab = await chromeApi.tabs.get(tabId); } catch (_e) { tab = null; }
      var spreadsheetId = spreadsheetIdFromUrl(tab && tab.url);
      if (!spreadsheetId) { return typedError('GOOGLE_SHEETS_ACTIVE_TAB_REQUIRED'); }
      var explicit = params.spreadsheetId;
      if (explicit !== undefined && explicit !== null && explicit !== '') {
        if (typeof explicit !== 'string' || !SPREADSHEET_ID_RE.test(explicit) || explicit !== spreadsheetId) {
          return typedError('GOOGLE_SHEETS_TARGET_MISMATCH');
        }
      }
      return { success: true, tabId: tabId, spreadsheetId: spreadsheetId, url: tab.url };
    }

    function safeArgs(operation, params) {
      params = params || {};
      if (operation === 'getSpreadsheet') { return {}; }
      if (operation === 'getValues') {
        return {
          range: params.range,
          majorDimension: params.majorDimension,
          valueRenderOption: params.valueRenderOption,
          dateTimeRenderOption: params.dateTimeRenderOption
        };
      }
      if (operation === 'updateValues') {
        return { range: params.range, values: params.values, valueInputOption: params.valueInputOption || 'RAW' };
      }
      if (operation === 'appendValues') {
        return {
          range: params.range,
          values: params.values,
          valueInputOption: params.valueInputOption || 'RAW',
          insertDataOption: params.insertDataOption || 'OVERWRITE'
        };
      }
      return { range: params.range };
    }

    async function runPageClient(target, operation, args) {
      if (!chromeApi || !chromeApi.scripting || typeof chromeApi.scripting.executeScript !== 'function') {
        return typedError('GOOGLE_SHEETS_SESSION_UNAVAILABLE', {
          reason: 'page-script-unavailable', safeToFallback: true, requestSent: false
        });
      }
      var results;
      try {
        results = await chromeApi.scripting.executeScript({
          target: { tabId: target.tabId },
          world: 'MAIN',
          func: pageClientOperation,
          args: [{ operation: operation, spreadsheetId: target.spreadsheetId, args: args, timeoutMs: timeoutMs }]
        });
      } catch (_e) {
        return MUTATIONS[operation]
          ? typedError('RECOVERY_AMBIGUOUS', { reason: 'page-script-outcome-unknown' })
          : typedError('GOOGLE_SHEETS_SESSION_UNAVAILABLE', { reason: 'page-script-failed', safeToFallback: true });
      }
      var result = results && results[0] && results[0].result;
      if (!result) {
        return MUTATIONS[operation]
          ? typedError('RECOVERY_AMBIGUOUS', { reason: 'page-script-no-result' })
          : typedError('GOOGLE_SHEETS_SESSION_UNAVAILABLE', { reason: 'page-script-no-result', safeToFallback: true });
      }
      return result;
    }

    async function runUi(target, operation, args) {
      if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.sendMessage !== 'function') {
        return typedError('GOOGLE_SHEETS_SESSION_UNAVAILABLE');
      }
      var result;
      try {
        result = await chromeApi.tabs.sendMessage(target.tabId, {
          action: 'executeAction',
          tool: 'sheetsSession',
          params: { operation: operation, spreadsheetId: target.spreadsheetId, args: args },
          source: 'capability-session'
        });
      } catch (error) {
        var message = String(error && error.message || '');
        var noReceiver = /receiving end does not exist|could not establish connection/i.test(message);
        if (MUTATIONS[operation] && !noReceiver) {
          return typedError('RECOVERY_AMBIGUOUS', { reason: 'ui-message-outcome-unknown' });
        }
        return typedError('GOOGLE_SHEETS_SESSION_UNAVAILABLE', { reason: 'sheets-ui-unavailable' });
      }
      if (!result || result.success !== true) {
        if (result && result.code) { return result; }
        return MUTATIONS[operation]
          ? typedError('RECOVERY_AMBIGUOUS', { reason: 'ui-mutation-outcome-unknown' })
          : typedError('RECIPE_DOM_FALLBACK_PENDING', { reason: result && result.reason || 'sheets-ui-operation-unavailable' });
      }
      return result;
    }

    async function executeTransport(target, operation, args) {
      var pageResult = await runPageClient(target, operation, args);
      if (pageResult && pageResult.success === true) { return pageResult; }
      if (!pageResult || pageResult.safeToFallback !== true) { return pageResult; }
      if (MUTATIONS[operation] && pageResult.requestSent !== false && pageResult.knownNoEffect !== true) {
        return typedError('RECOVERY_AMBIGUOUS', { reason: 'page-fallback-effect-not-proven' });
      }
      return runUi(target, operation, args);
    }

    function queued(tabId, task) {
      var prior = mutationChains.get(tabId) || Promise.resolve();
      var current = prior.catch(function() {}).then(task);
      mutationChains.set(tabId, current);
      return current.finally(function() {
        if (mutationChains.get(tabId) === current) { mutationChains.delete(tabId); }
      });
    }

    async function execute(operation, params, context) {
      var target = await resolveTarget(params, context);
      if (!target.success) { return target; }
      var args = safeArgs(operation, params);
      if (MUTATIONS[operation]) {
        return queued(target.tabId, function() { return executeTransport(target, operation, args); });
      }
      var activeMutation = mutationChains.get(target.tabId);
      if (activeMutation) { await activeMutation.catch(function() {}); }
      return executeTransport(target, operation, args);
    }

    return {
      getSpreadsheet: function (params, context) { return execute('getSpreadsheet', params, context); },
      getValues: function (params, context) { return execute('getValues', params, context); },
      updateValues: function (params, context) { return execute('updateValues', params, context); },
      appendValues: function (params, context) { return execute('appendValues', params, context); },
      clearValues: function (params, context) { return execute('clearValues', params, context); }
    };
  }

  var session = createSession();
  session.createSession = createSession;
  session.pageClientOperation = pageClientOperation;
  session.spreadsheetIdFromUrl = spreadsheetIdFromUrl;
  session.constants = Object.freeze({
    origin: SHEETS_ORIGIN,
    apiBaseUrl: SHEETS_API_BASE,
    requestTimeoutMs: REQUEST_TIMEOUT_MS
  });
  Object.freeze(session);
  global.FsbGoogleSheetsSession = session;
  if (typeof module !== 'undefined' && module.exports) { module.exports = session; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
