(function (global) {
  'use strict';

  /**
   * Excel Online Microsoft Graph read head.
   *
   * Safe workbook reads use a short-lived Graph bearer token obtained only through
   * the bounded Excel page-read primitive. Workbook mutations, recalculation,
   * formula evaluation, auth-cache clearing, and destructive rows stay guarded
   * fail-closed until live mutation-body UAT proves their request safety.
   */

  var EXCEL_ORIGIN = 'https://excel.cloud.microsoft';
  var EXCEL_SERVICE = 'excel.cloud.microsoft';
  var GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var STRING = { type: 'string' };
  var EMPTY_PARAMS = schema({}, []);
  var WORKSHEET_PARAMS = schema({
    worksheet: field('Worksheet name')
  }, ['worksheet']);
  var RANGE_PARAMS = schema({
    worksheet: field('Worksheet name'),
    address: field('Range address in A1 notation')
  }, ['worksheet', 'address']);
  var TABLE_PARAMS = schema({
    table: field('Table name or ID')
  }, ['table']);
  var LIST_TABLES_PARAMS = schema({
    worksheet: { type: 'string', description: 'Optional worksheet name to filter tables by' }
  }, []);
  var CHART_PARAMS = schema({
    worksheet: field('Worksheet name'),
    chart: field('Chart name')
  }, ['worksheet', 'chart']);
  var ADD_NAMED_ITEM_PARAMS = schema({
    name: field('Name for the named item'),
    reference: field('Range reference or named value/formula'),
    comment: { type: 'string', description: 'Optional comment for the named item' }
  }, ['name', 'reference']);
  var ADD_TABLE_COLUMN_PARAMS = schema({
    table: field('Table name or ID'),
    values: matrix('2D column values'),
    index: integer('Zero-based column insertion index')
  }, ['table', 'values']);
  var ADD_TABLE_ROW_PARAMS = schema({
    table: field('Table name or ID'),
    values: matrix('2D row values'),
    index: integer('Zero-based insertion index')
  }, ['table', 'values']);
  var ADD_WORKSHEET_PARAMS = schema({
    name: { type: 'string', description: 'Optional worksheet name' }
  }, []);
  var CALCULATE_PARAMS = schema({
    calculation_type: { type: 'string', enum: ['Recalculate', 'Full', 'FullRebuild'] }
  }, []);
  var CLEAR_RANGE_PARAMS = schema({
    worksheet: field('Worksheet name'),
    address: field('Range address in A1 notation'),
    apply_to: { type: 'string', enum: ['All', 'Contents', 'Formats'] }
  }, ['worksheet', 'address']);
  var CREATE_CHART_PARAMS = schema({
    worksheet: field('Worksheet name'),
    type: field('Chart type'),
    source_data: field('Source data range in A1 notation'),
    series_by: { type: 'string', enum: ['Auto', 'Columns', 'Rows'] }
  }, ['worksheet', 'type', 'source_data']);
  var CREATE_TABLE_PARAMS = schema({
    address: field('Range address containing the table data'),
    has_headers: { type: 'boolean' }
  }, ['address']);
  var DELETE_RANGE_PARAMS = schema({
    worksheet: field('Worksheet name'),
    address: field('Range address in A1 notation'),
    shift: { type: 'string', enum: ['Up', 'Left'] }
  }, ['worksheet', 'address', 'shift']);
  var DELETE_TABLE_ROW_PARAMS = schema({
    table: field('Table name or ID'),
    index: integer('Zero-based row index to delete')
  }, ['table', 'index']);
  var DELETE_WORKSHEET_PARAMS = schema({
    name: field('Worksheet name')
  }, ['name']);
  var EVALUATE_FORMULA_PARAMS = schema({
    worksheet: field('Worksheet name'),
    formula: field('Formula to evaluate')
  }, ['worksheet', 'formula']);
  var INSERT_RANGE_PARAMS = schema({
    worksheet: field('Worksheet name'),
    address: field('Range address in A1 notation'),
    shift: { type: 'string', enum: ['Down', 'Right'] }
  }, ['worksheet', 'address', 'shift']);
  var SORT_RANGE_PARAMS = schema({
    worksheet: field('Worksheet name'),
    address: field('Range address in A1 notation'),
    fields: {
      type: 'array',
      minItems: 1,
      items: schema({
        key: integer('Zero-based column index to sort by'),
        ascending: { type: 'boolean' }
      }, ['key'])
    },
    has_headers: { type: 'boolean' }
  }, ['worksheet', 'address', 'fields']);
  var UPDATE_RANGE_PARAMS = schema({
    worksheet: field('Worksheet name'),
    address: field('Range address in A1 notation'),
    values: matrix('2D values to write'),
    formulas: matrix('2D formulas to write'),
    number_format: {
      type: 'array',
      items: { type: 'array', items: { type: 'string' } }
    }
  }, ['worksheet', 'address']);
  var UPDATE_WORKSHEET_PARAMS = schema({
    name: field('Current worksheet name'),
    new_name: { type: 'string' },
    position: integer('New zero-based worksheet position'),
    visibility: { type: 'string', enum: ['Visible', 'Hidden', 'VeryHidden'] }
  }, ['name']);

  function field(description) {
    return { type: 'string', description: description };
  }

  function integer(description) {
    return { type: 'integer', minimum: 0, maximum: 9007199254740991, description: description };
  }

  function matrix(description) {
    return {
      type: 'array',
      items: { type: 'array', items: {} },
      description: description
    };
  }

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function fallback(slug, reason) {
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason,
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function odataString(value) {
    return encodeSegment(String(value || '').replace(/'/g, "''"));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function isExcelPageOrigin(origin) {
    if (origin === EXCEL_ORIGIN) { return true; }
    try {
      var host = new URL(origin).hostname.toLowerCase();
      return host === 'sharepoint.com' || host.slice(-15) === '.sharepoint.com';
    } catch (err) {
      return false;
    }
  }

  function pageOrigin(ctx, slug) {
    var origin = ctx && typeof ctx.origin === 'string' && ctx.origin ? ctx.origin : EXCEL_ORIGIN;
    return isExcelPageOrigin(origin) ? origin : fallback(slug, 'excel-origin-not-supported');
  }

  function graphGetSpec(path, pairs, graphToken, origin) {
    return {
      url: GRAPH_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + graphToken
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: origin,
      extract: '@'
    };
  }

  function encodeShareId(sharingUrl) {
    var text = String(sharingUrl || '');
    if (!text) { return ''; }
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'u!' + btoa(binary).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  }

  async function authContext(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'excel-page-read-primitive-unavailable');
    }
    var origin = pageOrigin(ctx, slug);
    if (origin && origin.success === false) { return origin; }
    var result = await ctx.executeBoundPageRead({
      origin: origin,
      namespace: 'excel',
      action: 'auth_context',
      args: {}
    }, ctx.tabId);
    if (!result || result.success !== true) {
      return result || fallback(slug, 'excel-auth-context-unavailable');
    }
    var data = result.data || {};
    var graphToken = typeof data.graph_token === 'string' ? data.graph_token : '';
    var driveId = typeof data.drive_id === 'string' ? data.drive_id : '';
    var itemId = typeof data.item_id === 'string' ? data.item_id : '';
    var sharingUrl = typeof data.sharing_url === 'string' ? data.sharing_url : '';
    if (!graphToken) {
      return fallback(slug, 'excel-graph-token-unavailable');
    }
    if ((!driveId || !itemId) && sharingUrl) {
      if (typeof ctx.executeBoundSpec !== 'function') {
        return fallback(slug, 'excel-execute-bound-spec-unavailable');
      }
      var shareId = encodeShareId(sharingUrl);
      if (!shareId) { return fallback(slug, 'excel-share-url-unusable'); }
      var shareResult = await ctx.executeBoundSpec(graphGetSpec(
        '/shares/' + shareId + '/driveItem',
        [['$select', 'id,name,parentReference']],
        graphToken,
        origin
      ), ctx.tabId);
      if (!shareResult || shareResult.success !== true || !shareResult.data || !shareResult.data.parentReference) {
        return fallback(slug, 'excel-sharepoint-workbook-resolve-failed');
      }
      driveId = shareResult.data.parentReference.driveId || '';
      itemId = shareResult.data.id || '';
    }
    if (!driveId || !itemId) {
      return fallback(slug, 'excel-workbook-context-incomplete');
    }
    return { success: true, graphToken: graphToken, driveId: driveId, itemId: itemId, origin: origin };
  }

  function looksLikeGraphError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (Object.prototype.hasOwnProperty.call(data, 'error')
        || Array.isArray(data.errors)
        || typeof data.message === 'string');
  }

  function withMappedData(result, mapped) {
    var out = {};
    for (var k in result) {
      if (Object.prototype.hasOwnProperty.call(result, k)) { out[k] = result[k]; }
    }
    out.data = mapped;
    return out;
  }

  function mapGraphResult(result, slug, mapper) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'excel-graph-auth-failed');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeGraphError(data)) {
      return fallback(slug, 'excel-graph-shape-mismatch');
    }
    try {
      return withMappedData(result, mapper ? mapper(data) : data);
    } catch (err) {
      return fallback(slug, 'excel-map-shape-mismatch');
    }
  }

  async function graphRead(slug, args, ctx, requestForAuth, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'excel-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var req = requestForAuth(args || {}, auth);
    if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
    var result = await ctx.executeBoundSpec(graphGetSpec(req.path, req.pairs || [], auth.graphToken, auth.origin), ctx.tabId);
    return mapGraphResult(result, slug, mapper);
  }

  function drivePath(auth, suffix) {
    return '/drives/' + encodeSegment(auth.driveId) + suffix;
  }

  function workbookPath(auth, suffix) {
    return drivePath(auth, '/items/' + encodeSegment(auth.itemId) + '/workbook' + suffix);
  }

  function collectionValues(data) {
    return Array.isArray(data.value) ? data.value : [];
  }

  function mapUser(data) {
    return { user: {
      id: data.id || '',
      display_name: data.displayName || '',
      email: data.mail || data.userPrincipalName || ''
    } };
  }

  function mapWorkbook(auth) {
    return function(data) {
      return { workbook: {
        drive_id: auth.driveId,
        item_id: auth.itemId,
        name: data.name || ''
      } };
    };
  }

  function mapWorksheet(w) {
    w = w || {};
    return {
      id: w.id || '',
      name: w.name || '',
      position: w.position || 0,
      visibility: w.visibility || 'Visible'
    };
  }

  function mapRange(r) {
    r = r || {};
    return {
      address: r.address || '',
      row_count: r.rowCount || 0,
      column_count: r.columnCount || 0,
      values: Array.isArray(r.values) ? r.values : [],
      formulas: Array.isArray(r.formulas) ? r.formulas : [],
      text: Array.isArray(r.text) ? r.text : [],
      number_format: Array.isArray(r.numberFormat) ? r.numberFormat : []
    };
  }

  function mapTable(t) {
    t = t || {};
    return {
      id: t.id || '',
      name: t.name || '',
      show_headers: t.showHeaders !== false,
      show_totals: !!t.showTotals,
      style: t.style || ''
    };
  }

  function mapTableColumn(c) {
    c = c || {};
    return {
      id: c.id || '',
      name: c.name || '',
      index: c.index || 0
    };
  }

  function mapTableRow(r) {
    r = r || {};
    return {
      index: r.index || 0,
      values: Array.isArray(r.values) ? r.values : []
    };
  }

  function mapNamedItem(n) {
    n = n || {};
    return {
      name: n.name || '',
      type: n.type || '',
      value: String(n.value === undefined || n.value === null ? '' : n.value),
      visible: n.visible !== false
    };
  }

  function mapChart(c) {
    c = c || {};
    return {
      id: c.id || '',
      name: c.name || '',
      height: c.height || 0,
      width: c.width || 0,
      top: c.top || 0,
      left: c.left || 0
    };
  }

  function listMapper(key, mapper) {
    return function(data) {
      var out = {};
      out[key] = collectionValues(data).map(mapper);
      return out;
    };
  }

  function readHandler(slug, params, requestForAuth, mapper) {
    return {
      tier: 'T1a',
      origin: EXCEL_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        return graphRead(slug, args || {}, ctx, requestForAuth, mapper);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: EXCEL_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-excel-mutation');
      }
    };
  }

  var handlers = {
    'excel.get_current_user': readHandler('excel.get_current_user', EMPTY_PARAMS, function() {
      return { path: '/me', pairs: [['$select', 'displayName,mail,userPrincipalName,id']] };
    }, mapUser),
    'excel.get_range': readHandler('excel.get_range', RANGE_PARAMS, function(args, auth) {
      return { path: workbookPath(auth, "/worksheets('" + odataString(args.worksheet) + "')/range(address='" + odataString(args.address) + "')") };
    }, function(data) { return { range: mapRange(data) }; }),
    'excel.get_table_columns': readHandler('excel.get_table_columns', TABLE_PARAMS, function(args, auth) {
      return { path: workbookPath(auth, "/tables('" + odataString(args.table) + "')/columns") };
    }, listMapper('columns', mapTableColumn)),
    'excel.get_table_rows': readHandler('excel.get_table_rows', TABLE_PARAMS, function(args, auth) {
      return { path: workbookPath(auth, "/tables('" + odataString(args.table) + "')/rows") };
    }, listMapper('rows', mapTableRow)),
    'excel.get_used_range': readHandler('excel.get_used_range', WORKSHEET_PARAMS, function(args, auth) {
      return { path: workbookPath(auth, "/worksheets('" + odataString(args.worksheet) + "')/usedRange") };
    }, function(data) { return { range: mapRange(data) }; }),
    'excel.get_workbook_info': readHandler('excel.get_workbook_info', EMPTY_PARAMS, function(_args, auth) {
      return { path: drivePath(auth, '/items/' + encodeSegment(auth.itemId)), pairs: [['$select', 'id,name,parentReference,webUrl']] };
    }, function(data) {
      return mapWorkbook({ driveId: data.parentReference && data.parentReference.driveId ? data.parentReference.driveId : '', itemId: data.id || '' })(data);
    }),
    'excel.list_charts': readHandler('excel.list_charts', WORKSHEET_PARAMS, function(args, auth) {
      return { path: workbookPath(auth, "/worksheets('" + odataString(args.worksheet) + "')/charts") };
    }, listMapper('charts', mapChart)),
    'excel.list_named_items': readHandler('excel.list_named_items', EMPTY_PARAMS, function(_args, auth) {
      return { path: workbookPath(auth, '/names') };
    }, listMapper('named_items', mapNamedItem)),
    'excel.list_tables': readHandler('excel.list_tables', LIST_TABLES_PARAMS, function(args, auth) {
      return { path: args.worksheet
        ? workbookPath(auth, "/worksheets('" + odataString(args.worksheet) + "')/tables")
        : workbookPath(auth, '/tables') };
    }, listMapper('tables', mapTable)),
    'excel.list_worksheets': readHandler('excel.list_worksheets', EMPTY_PARAMS, function(_args, auth) {
      return { path: workbookPath(auth, '/worksheets') };
    }, listMapper('worksheets', mapWorksheet)),

    'excel.add_named_item': guarded('excel.add_named_item', 'write', ADD_NAMED_ITEM_PARAMS, 'unverified-excel-add-named-item-mutation'),
    'excel.add_table_column': guarded('excel.add_table_column', 'write', ADD_TABLE_COLUMN_PARAMS, 'unverified-excel-add-table-column-mutation'),
    'excel.add_table_row': guarded('excel.add_table_row', 'write', ADD_TABLE_ROW_PARAMS, 'unverified-excel-add-table-row-mutation'),
    'excel.add_worksheet': guarded('excel.add_worksheet', 'write', ADD_WORKSHEET_PARAMS, 'unverified-excel-add-worksheet-mutation'),
    'excel.calculate_workbook': guarded('excel.calculate_workbook', 'write', CALCULATE_PARAMS, 'unverified-excel-calculate-workbook-mutation'),
    'excel.clear_range': guarded('excel.clear_range', 'write', CLEAR_RANGE_PARAMS, 'unverified-excel-clear-range-mutation'),
    'excel.create_chart': guarded('excel.create_chart', 'write', CREATE_CHART_PARAMS, 'unverified-excel-create-chart-mutation'),
    'excel.create_table': guarded('excel.create_table', 'write', CREATE_TABLE_PARAMS, 'unverified-excel-create-table-mutation'),
    'excel.delete_chart': guarded('excel.delete_chart', 'destructive', CHART_PARAMS, 'unverified-excel-delete-chart-mutation'),
    'excel.delete_range': guarded('excel.delete_range', 'destructive', DELETE_RANGE_PARAMS, 'unverified-excel-delete-range-mutation'),
    'excel.delete_table': guarded('excel.delete_table', 'destructive', TABLE_PARAMS, 'unverified-excel-delete-table-mutation'),
    'excel.delete_table_row': guarded('excel.delete_table_row', 'destructive', DELETE_TABLE_ROW_PARAMS, 'unverified-excel-delete-table-row-mutation'),
    'excel.delete_worksheet': guarded('excel.delete_worksheet', 'destructive', DELETE_WORKSHEET_PARAMS, 'unverified-excel-delete-worksheet-mutation'),
    'excel.evaluate_formula': guarded('excel.evaluate_formula', 'write', EVALUATE_FORMULA_PARAMS, 'unverified-excel-evaluate-formula-temp-cell-mutation'),
    'excel.insert_range': guarded('excel.insert_range', 'write', INSERT_RANGE_PARAMS, 'unverified-excel-insert-range-mutation'),
    'excel.reauthenticate': guarded('excel.reauthenticate', 'write', EMPTY_PARAMS, 'unverified-excel-reauthenticate-cache-clear-reload'),
    'excel.sort_range': guarded('excel.sort_range', 'write', SORT_RANGE_PARAMS, 'unverified-excel-sort-range-mutation'),
    'excel.update_range': guarded('excel.update_range', 'write', UPDATE_RANGE_PARAMS, 'unverified-excel-update-range-mutation'),
    'excel.update_worksheet': guarded('excel.update_worksheet', 'write', UPDATE_WORKSHEET_PARAMS, 'unverified-excel-update-worksheet-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: EXCEL_ORIGIN,
          descriptor: {
            slug: slug,
            service: EXCEL_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerExcel = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
