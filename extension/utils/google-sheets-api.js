(function (global) {
  'use strict';

  var SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4';
  var SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  var REQUEST_TIMEOUT_MS = 15000;
  var MAX_REQUEST_BODY_BYTES = 1024 * 1024;
  var MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024;
  var PLACEHOLDER_CLIENT_ID = /(?:REPLACE|PLACEHOLDER|YOUR[_-]|INVALID|EXAMPLE)/i;
  var SPREADSHEET_ID = /^[A-Za-z0-9_-]{10,200}$/;
  var SAFE_RANGE_MAX = 500;

  var ERROR_MESSAGES = {
    GOOGLE_SHEETS_OAUTH_NOT_CONFIGURED: 'Google Sheets OAuth is not configured for this extension build.',
    GOOGLE_SHEETS_IDENTITY_UNAVAILABLE: 'Chrome Identity is unavailable.',
    GOOGLE_SHEETS_NOT_CONNECTED: 'Google Sheets is not connected. Connect it from the FSB control panel.',
    GOOGLE_SHEETS_AUTH_FAILED: 'Google Sheets authorization failed.',
    GOOGLE_SHEETS_INVALID_ARGUMENT: 'A Google Sheets request argument is invalid.',
    GOOGLE_SHEETS_REQUEST_TOO_LARGE: 'The Google Sheets request is too large.',
    GOOGLE_SHEETS_TIMEOUT: 'The Google Sheets request timed out.',
    GOOGLE_SHEETS_NETWORK_ERROR: 'The Google Sheets API could not be reached.',
    GOOGLE_SHEETS_ACCESS_DENIED: 'Google denied access to this spreadsheet.',
    GOOGLE_SHEETS_NOT_FOUND: 'The requested spreadsheet or range was not found.',
    GOOGLE_SHEETS_RATE_LIMITED: 'Google Sheets temporarily rate-limited this request.',
    GOOGLE_SHEETS_API_ERROR: 'The Google Sheets API request failed.',
    GOOGLE_SHEETS_RESPONSE_TOO_LARGE: 'The Google Sheets API response was too large.'
  };

  function typedError(code, extra) {
    var out = {
      success: false,
      code: code,
      errorCode: code,
      error: ERROR_MESSAGES[code] || ERROR_MESSAGES.GOOGLE_SHEETS_API_ERROR
    };
    if (extra && Number.isFinite(extra.status)) { out.status = extra.status; }
    return out;
  }

  function encodePathSegment(value) {
    return encodeURIComponent(String(value)).replace(/[!'()*]/g, function (character) {
      return '%' + character.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  function isConfigured(chromeApi) {
    try {
      var manifest = chromeApi && chromeApi.runtime && chromeApi.runtime.getManifest
        ? chromeApi.runtime.getManifest()
        : null;
      var oauth = manifest && manifest.oauth2;
      var clientId = oauth && typeof oauth.client_id === 'string' ? oauth.client_id.trim() : '';
      var scopes = oauth && Array.isArray(oauth.scopes) ? oauth.scopes : [];
      return !!clientId && !PLACEHOLDER_CLIENT_ID.test(clientId) && scopes.indexOf(SHEETS_SCOPE) !== -1;
    } catch (_e) {
      return false;
    }
  }

  function runtimeError(chromeApi) {
    try {
      return chromeApi && chromeApi.runtime && chromeApi.runtime.lastError
        ? chromeApi.runtime.lastError
        : null;
    } catch (_e) {
      return null;
    }
  }

  function createClient(deps) {
    deps = deps || {};
    var chromeApi = deps.chrome || global.chrome;
    var fetchFn = deps.fetch || global.fetch;
    var AbortControllerCtor = deps.AbortController || global.AbortController;
    var setTimer = deps.setTimeout || global.setTimeout;
    var clearTimer = deps.clearTimeout || global.clearTimeout;

    function configurationError() {
      if (!isConfigured(chromeApi)) {
        return typedError('GOOGLE_SHEETS_OAUTH_NOT_CONFIGURED');
      }
      if (!chromeApi || !chromeApi.identity || typeof chromeApi.identity.getAuthToken !== 'function') {
        return typedError('GOOGLE_SHEETS_IDENTITY_UNAVAILABLE');
      }
      return null;
    }

    function getToken(interactive) {
      var configError = configurationError();
      if (configError) { return Promise.reject(configError); }
      return new Promise(function (resolve, reject) {
        try {
          chromeApi.identity.getAuthToken({ interactive: interactive === true }, function (token) {
            var lastError = runtimeError(chromeApi);
            if (lastError || typeof token !== 'string' || !token) {
              reject(typedError(interactive ? 'GOOGLE_SHEETS_AUTH_FAILED' : 'GOOGLE_SHEETS_NOT_CONNECTED'));
              return;
            }
            resolve(token);
          });
        } catch (_e) {
          reject(typedError(interactive ? 'GOOGLE_SHEETS_AUTH_FAILED' : 'GOOGLE_SHEETS_NOT_CONNECTED'));
        }
      });
    }

    function removeCachedToken(token) {
      if (!token || !chromeApi || !chromeApi.identity || typeof chromeApi.identity.removeCachedAuthToken !== 'function') {
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        try {
          chromeApi.identity.removeCachedAuthToken({ token: token }, function () { resolve(); });
        } catch (_e) {
          resolve();
        }
      });
    }

    function profile() {
      if (!chromeApi || !chromeApi.identity || typeof chromeApi.identity.getProfileUserInfo !== 'function') {
        return Promise.resolve({});
      }
      return new Promise(function (resolve) {
        try {
          chromeApi.identity.getProfileUserInfo({ accountStatus: 'ANY' }, function (info) {
            if (runtimeError(chromeApi)) { resolve({}); return; }
            resolve(info && typeof info === 'object' ? info : {});
          });
        } catch (_e) {
          resolve({});
        }
      });
    }

    async function status() {
      var configError = configurationError();
      if (configError) {
        return {
          success: true,
          configured: false,
          connected: false,
          code: configError.code,
          message: configError.error
        };
      }
      try {
        await getToken(false);
        var info = await profile();
        return {
          success: true,
          configured: true,
          connected: true,
          email: typeof info.email === 'string' ? info.email : ''
        };
      } catch (_e) {
        return { success: true, configured: true, connected: false };
      }
    }

    async function connect() {
      var configError = configurationError();
      if (configError) { return configError; }
      try {
        await getToken(true);
        var info = await profile();
        return {
          success: true,
          configured: true,
          connected: true,
          email: typeof info.email === 'string' ? info.email : ''
        };
      } catch (error) {
        return error && error.code ? error : typedError('GOOGLE_SHEETS_AUTH_FAILED');
      }
    }

    async function disconnect() {
      var configError = configurationError();
      if (configError) { return configError; }
      try {
        var token = await getToken(false);
        await removeCachedToken(token);
      } catch (_e) {
        // Already disconnected is a successful terminal state.
      }
      return { success: true, configured: true, connected: false };
    }

    function validateSpreadsheetId(value) {
      if (typeof value !== 'string' || !SPREADSHEET_ID.test(value)) {
        throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
      }
      return value;
    }

    function validateRange(value) {
      if (typeof value !== 'string' || !value || value.length > SAFE_RANGE_MAX || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
        throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
      }
      return value;
    }

    function enumValue(value, allowed, fallback) {
      var candidate = value === undefined || value === null || value === '' ? fallback : String(value);
      if (allowed.indexOf(candidate) === -1) { throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT'); }
      return candidate;
    }

    function validateValues(values) {
      if (!Array.isArray(values) || values.length === 0 || values.length > 10000) {
        throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
      }
      for (var rowIndex = 0; rowIndex < values.length; rowIndex++) {
        var row = values[rowIndex];
        if (!Array.isArray(row) || row.length > 10000) {
          throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
        }
        for (var colIndex = 0; colIndex < row.length; colIndex++) {
          var cell = row[colIndex];
          if (cell !== null && typeof cell !== 'string' && typeof cell !== 'boolean' && !(typeof cell === 'number' && Number.isFinite(cell))) {
            throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
          }
        }
      }
      return values;
    }

    function requestSpec(operation, params) {
      params = params || {};
      var id = validateSpreadsheetId(params.spreadsheetId);
      var idPart = encodePathSegment(id);
      var range;
      var query = new URLSearchParams();
      var spec = { method: 'GET', path: '/spreadsheets/' + idPart, body: null };

      if (operation === 'getSpreadsheet') {
        query.set('includeGridData', 'false');
        query.set('fields', 'spreadsheetId,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType,gridProperties))');
      } else if (operation === 'getValues') {
        range = validateRange(params.range);
        spec.path += '/values/' + encodePathSegment(range);
        query.set('majorDimension', enumValue(params.majorDimension, ['ROWS', 'COLUMNS'], 'ROWS'));
        query.set('valueRenderOption', enumValue(params.valueRenderOption, ['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'], 'FORMATTED_VALUE'));
        query.set('dateTimeRenderOption', enumValue(params.dateTimeRenderOption, ['SERIAL_NUMBER', 'FORMATTED_STRING'], 'FORMATTED_STRING'));
      } else if (operation === 'updateValues') {
        range = validateRange(params.range);
        spec.method = 'PUT';
        spec.path += '/values/' + encodePathSegment(range);
        query.set('valueInputOption', enumValue(params.valueInputOption, ['RAW', 'USER_ENTERED'], 'USER_ENTERED'));
        query.set('includeValuesInResponse', 'false');
        spec.body = { range: range, majorDimension: 'ROWS', values: validateValues(params.values) };
      } else if (operation === 'appendValues') {
        range = validateRange(params.range);
        spec.method = 'POST';
        spec.path += '/values/' + encodePathSegment(range) + ':append';
        query.set('valueInputOption', enumValue(params.valueInputOption, ['RAW', 'USER_ENTERED'], 'USER_ENTERED'));
        query.set('insertDataOption', enumValue(params.insertDataOption, ['OVERWRITE', 'INSERT_ROWS'], 'INSERT_ROWS'));
        query.set('includeValuesInResponse', 'false');
        spec.body = { range: range, majorDimension: 'ROWS', values: validateValues(params.values) };
      } else if (operation === 'clearValues') {
        range = validateRange(params.range);
        spec.method = 'POST';
        spec.path += '/values/' + encodePathSegment(range) + ':clear';
        spec.body = {};
      } else {
        throw typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
      }

      var bodyText = spec.body === null ? null : JSON.stringify(spec.body);
      if (bodyText && new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BODY_BYTES) {
        throw typedError('GOOGLE_SHEETS_REQUEST_TOO_LARGE');
      }
      spec.url = SHEETS_BASE_URL + spec.path + (query.toString() ? '?' + query.toString() : '');
      spec.bodyText = bodyText;
      return spec;
    }

    function statusError(statusCode) {
      if (statusCode === 403) { return typedError('GOOGLE_SHEETS_ACCESS_DENIED', { status: statusCode }); }
      if (statusCode === 404) { return typedError('GOOGLE_SHEETS_NOT_FOUND', { status: statusCode }); }
      if (statusCode === 429) { return typedError('GOOGLE_SHEETS_RATE_LIMITED', { status: statusCode }); }
      return typedError('GOOGLE_SHEETS_API_ERROR', { status: statusCode });
    }

    async function fetchOnce(spec, token) {
      if (typeof fetchFn !== 'function') { return typedError('GOOGLE_SHEETS_NETWORK_ERROR'); }
      var controller = AbortControllerCtor ? new AbortControllerCtor() : null;
      var timer = null;
      if (controller && typeof setTimer === 'function') {
        timer = setTimer(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
      }
      try {
        var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
        if (spec.bodyText !== null) { headers['Content-Type'] = 'application/json'; }
        var response = await fetchFn(spec.url, {
          method: spec.method,
          headers: headers,
          body: spec.bodyText,
          signal: controller ? controller.signal : undefined,
          credentials: 'omit',
          redirect: 'error'
        });
        if (response.status === 401) { return { success: false, authRejected: true, status: 401 }; }
        if (!response.ok) { return statusError(response.status); }
        var contentLength = Number(response.headers && response.headers.get ? response.headers.get('content-length') : 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BODY_BYTES) {
          return typedError('GOOGLE_SHEETS_RESPONSE_TOO_LARGE');
        }
        var text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BODY_BYTES) {
          return typedError('GOOGLE_SHEETS_RESPONSE_TOO_LARGE');
        }
        var data = text ? JSON.parse(text) : {};
        return { success: true, status: response.status, data: data };
      } catch (error) {
        if (error && (error.name === 'AbortError' || (controller && controller.signal && controller.signal.aborted))) {
          return typedError('GOOGLE_SHEETS_TIMEOUT');
        }
        return typedError('GOOGLE_SHEETS_NETWORK_ERROR');
      } finally {
        if (timer !== null && typeof clearTimer === 'function') { clearTimer(timer); }
      }
    }

    async function execute(operation, params) {
      var spec;
      try {
        spec = requestSpec(operation, params);
      } catch (error) {
        return error && error.code ? error : typedError('GOOGLE_SHEETS_INVALID_ARGUMENT');
      }
      var token;
      try {
        token = await getToken(false);
      } catch (error) {
        return error && error.code ? error : typedError('GOOGLE_SHEETS_NOT_CONNECTED');
      }
      var first = await fetchOnce(spec, token);
      if (!first || first.authRejected !== true) { return first; }
      await removeCachedToken(token);
      try {
        token = await getToken(false);
      } catch (_e) {
        return typedError('GOOGLE_SHEETS_NOT_CONNECTED');
      }
      var second = await fetchOnce(spec, token);
      return second && second.authRejected === true
        ? typedError('GOOGLE_SHEETS_AUTH_FAILED', { status: 401 })
        : second;
    }

    var client = {
      connect: connect,
      status: status,
      disconnect: disconnect,
      getSpreadsheet: function (params) { return execute('getSpreadsheet', params); },
      getValues: function (params) { return execute('getValues', params); },
      updateValues: function (params) { return execute('updateValues', params); },
      appendValues: function (params) { return execute('appendValues', params); },
      clearValues: function (params) { return execute('clearValues', params); }
    };
    Object.defineProperty(client, '__test', {
      value: { requestSpec: requestSpec, isConfigured: function () { return isConfigured(chromeApi); } },
      enumerable: false
    });
    return client;
  }

  var api = createClient();

  api.createClient = createClient;
  api.constants = Object.freeze({
    baseUrl: SHEETS_BASE_URL,
    scope: SHEETS_SCOPE,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRequestBodyBytes: MAX_REQUEST_BODY_BYTES
  });
  Object.freeze(api);
  global.FsbGoogleSheetsApi = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
