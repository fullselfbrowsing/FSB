(function (global) {
  'use strict';

  var ORIGIN = 'https://docs.google.com';
  var SERVICE = 'docs.google.com';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var ID_PATTERN = '^[A-Za-z0-9_-]{10,200}$';
  var ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

  function schema(properties, required) {
    var out = { type: 'object', properties: properties, additionalProperties: false };
    if (required && required.length) { out.required = required; }
    return out;
  }

  var ID = {
    type: 'string',
    pattern: ID_PATTERN,
    description: 'Spreadsheet ID. Defaults to the spreadsheet open in the active Google Sheets tab.'
  };
  var RANGE = { type: 'string', minLength: 1, maxLength: 500, description: 'A1 notation range.' };
  var VALUES = {
    type: 'array',
    minItems: 1,
    maxItems: 10000,
    items: {
      type: 'array',
      maxItems: 10000,
      items: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'boolean' },
          { type: 'null' }
        ]
      }
    },
    description: 'Two-dimensional rows of JSON scalar cell values.'
  };
  var VALUE_INPUT_OPTION = { type: 'string', enum: ['RAW', 'USER_ENTERED'] };

  var GET_SPREADSHEET_PARAMS = schema({ spreadsheetId: ID }, []);
  var GET_VALUES_PARAMS = schema({
    spreadsheetId: ID,
    range: RANGE,
    majorDimension: { type: 'string', enum: ['ROWS', 'COLUMNS'] },
    valueRenderOption: { type: 'string', enum: ['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'] },
    dateTimeRenderOption: { type: 'string', enum: ['SERIAL_NUMBER', 'FORMATTED_STRING'] }
  }, ['range']);
  var UPDATE_VALUES_PARAMS = schema({
    spreadsheetId: ID,
    range: RANGE,
    values: VALUES,
    valueInputOption: VALUE_INPUT_OPTION
  }, ['range', 'values']);
  var APPEND_VALUES_PARAMS = schema({
    spreadsheetId: ID,
    range: RANGE,
    values: VALUES,
    valueInputOption: VALUE_INPUT_OPTION,
    insertDataOption: { type: 'string', enum: ['OVERWRITE', 'INSERT_ROWS'] }
  }, ['range', 'values']);
  var CLEAR_VALUES_PARAMS = schema({ spreadsheetId: ID, range: RANGE }, ['range']);

  function typedError(code) {
    return { success: false, code: code, errorCode: code, error: code };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return {
          success: false,
          code: FALLBACK_CODE,
          errorCode: FALLBACK_CODE,
          error: FALLBACK_CODE,
          slug: slug,
          reason: 'google-sheets-live-mutation-uat-required',
          fellBackToDom: true
        };
      }
    };
  }

  function spreadsheetIdFromUrl(ctx) {
    var url = ctx && typeof ctx.url === 'string' ? ctx.url : '';
    if (!url) { return ''; }
    try {
      var parsed = new URL(url);
      if (parsed.origin !== ORIGIN) { return ''; }
      var match = parsed.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/);
      return match ? match[1] : '';
    } catch (_e) {
      return '';
    }
  }

  function resolveSpreadsheetId(args, ctx) {
    var explicit = args && args.spreadsheetId;
    if (explicit !== undefined && explicit !== null && explicit !== '') {
      return typeof explicit === 'string' && ID_RE.test(explicit) ? explicit : '';
    }
    return spreadsheetIdFromUrl(ctx);
  }

  async function call(method, args, ctx, buildParams) {
    var client = ctx && ctx.googleSheets;
    if (!client || typeof client[method] !== 'function') {
      return typedError('GOOGLE_SHEETS_API_UNAVAILABLE');
    }
    var spreadsheetId = resolveSpreadsheetId(args, ctx);
    if (!spreadsheetId) { return typedError('GOOGLE_SHEETS_SPREADSHEET_REQUIRED'); }
    try {
      return await client[method](buildParams(spreadsheetId, args || {}));
    } catch (_e) {
      return typedError('GOOGLE_SHEETS_API_ERROR');
    }
  }

  var handlers = {
    'gsheets.get_spreadsheet': {
      tier: 'T1a', origin: ORIGIN, sideEffectClass: 'read', params: GET_SPREADSHEET_PARAMS,
      handle: function (args, ctx) {
        return call('getSpreadsheet', args, ctx, function (spreadsheetId) {
          return { spreadsheetId: spreadsheetId };
        });
      }
    },
    'gsheets.get_values': {
      tier: 'T1a', origin: ORIGIN, sideEffectClass: 'read', params: GET_VALUES_PARAMS,
      handle: function (args, ctx) {
        return call('getValues', args, ctx, function (spreadsheetId, input) {
          return {
            spreadsheetId: spreadsheetId,
            range: input.range,
            majorDimension: input.majorDimension,
            valueRenderOption: input.valueRenderOption,
            dateTimeRenderOption: input.dateTimeRenderOption
          };
        });
      }
    },
    'gsheets.update_values': guarded('gsheets.update_values', 'write', UPDATE_VALUES_PARAMS),
    'gsheets.append_values': guarded('gsheets.append_values', 'write', APPEND_VALUES_PARAMS),
    'gsheets.clear_values': guarded('gsheets.clear_values', 'destructive', CLEAR_VALUES_PARAMS)
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (!Object.prototype.hasOwnProperty.call(handlers, slug)) { continue; }
      global.FsbCapabilityCatalog.registerHandler(slug, {
        tier: 'T1a',
        handler: handlers[slug],
        origin: ORIGIN,
        params: handlers[slug].params,
        descriptor: {
          slug: slug,
          service: SERVICE,
          sideEffectClass: handlers[slug].sideEffectClass,
          params: handlers[slug].params
        }
      });
    }
  }

  global.FsbHandlerGsheets = handlers;
  if (typeof module !== 'undefined' && module.exports) { module.exports = handlers; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
