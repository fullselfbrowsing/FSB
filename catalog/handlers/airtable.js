(function (global) {
  'use strict';

  /**
   * Airtable same-origin internal API READ head.
   *
   * Airtable's web client calls first-party /v0.3 endpoints with the user's
   * airtable.com session cookies. Reviewed reads route through executeBoundSpec
   * on that same origin. Comment and cell mutations stay guarded fail-closed
   * until live mutation-body UAT records CSRF/body safety evidence.
   */

  var ORIGIN = 'https://airtable.com';
  var SERVICE = 'airtable.com';
  var API_BASE = ORIGIN + '/v0.3';

  var EMPTY_PARAMS = schema({}, []);
  var BASE_PARAMS = schema({
    base_id: stringField('Base ID (app prefix)')
  }, ['base_id']);
  var TABLE_PARAMS = schema({
    base_id: stringField('Base ID (app prefix)'),
    table_id: stringField('Table ID (tbl prefix)')
  }, ['base_id', 'table_id']);
  var FIELD_PARAMS = schema({
    base_id: stringField('Base ID (app prefix)'),
    table_id: stringField('Table ID (tbl prefix)'),
    field_id: stringField('Field/column ID (fld prefix)')
  }, ['base_id', 'table_id', 'field_id']);
  var RECORD_PARAMS = schema({
    base_id: stringField('Base ID (app prefix)'),
    table_id: stringField('Table ID (tbl prefix)'),
    record_id: stringField('Record ID (rec prefix)')
  }, ['base_id', 'table_id', 'record_id']);
  var CREATE_COMMENT_PARAMS = schema({
    base_id: stringField('Base ID (app prefix)'),
    table_id: stringField('Table ID (tbl prefix)'),
    record_id: stringField('Record ID (rec prefix)'),
    text: stringField('Comment text')
  }, ['base_id', 'table_id', 'record_id', 'text']);
  var UPDATE_CELL_PARAMS = schema({
    base_id: stringField('Base ID (app prefix)'),
    table_id: stringField('Table ID (tbl prefix)'),
    record_id: stringField('Record ID (rec prefix)'),
    field_id: stringField('Field/column ID (fld prefix)'),
    value: {
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' },
        { type: 'object', additionalProperties: true },
        { type: 'array', items: {} }
      ],
      description: 'New cell value; type depends on the field type'
    }
  }, ['base_id', 'table_id', 'record_id', 'field_id', 'value']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function stringField(description) {
    return { type: 'string', minLength: 1, description: description };
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
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'airtable-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function bool(value) {
    return value === true;
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function requestId() {
    return 'req' + Math.random().toString(36).slice(2, 10);
  }

  function getTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_err) { return 'UTC'; }
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(params) {
    var parts = [];
    appendQuery(parts, 'stringifiedObjectParams', JSON.stringify(params || {}));
    appendQuery(parts, 'requestId', requestId());
    return parts.length ? '?' + parts.join('&') : '';
  }

  function apiSpec(endpoint, params, appId) {
    var headers = {
      'Accept': 'application/json',
      'x-airtable-inter-service-client': 'webClient',
      'x-requested-with': 'XMLHttpRequest',
      'x-time-zone': getTimezone()
    };
    if (appId) { headers['x-airtable-application-id'] = String(appId); }
    return {
      url: API_BASE + '/' + endpoint + buildQuery(params || {}),
      method: 'GET',
      headers: headers,
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function bootstrapSpec() {
    return {
      url: ORIGIN + '/',
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function parseInitString(text, key) {
    var source = String(text || '');
    var re = new RegExp("[\"']" + key + "[\"']\\s*:\\s*[\"']([^\"']+)[\"']");
    var match = source.match(re);
    return match && match[1] ? match[1] : '';
  }

  async function bootstrapUserId(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'airtable-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(bootstrapSpec(), ctx.tabId);
    if (!res || res.success !== true || typeof res.text !== 'string') {
      return fallback(slug, 'airtable-bootstrap-page-unavailable');
    }
    var userId = parseInitString(res.text, 'sessionUserId');
    if (!userId || userId.indexOf('usrPAGESHARE') === 0) {
      return fallback(slug, 'airtable-bootstrap-user-missing');
    }
    return { success: true, userId: userId };
  }

  function looksLikeError(data) {
    return isObject(data) && (
      data.error ||
      Array.isArray(data.errors) ||
      typeof data.message === 'string'
    );
  }

  function resultData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'airtable-api-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'airtable-api-http-error');
    }
    var payload = result.data;
    if (isObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) {
      payload = payload.data;
    }
    if (payload === undefined || payload === null || looksLikeError(payload)) {
      return fallback(slug, 'airtable-api-shape-mismatch');
    }
    return payload;
  }

  function mapRecord(r) {
    return {
      id: str(r && r.id),
      created_time: str(r && r.createdTime),
      cell_values_by_field_id: isObject(r && r.cellValuesByColumnId) ? r.cellValuesByColumnId : {}
    };
  }

  function mapChoice(c) {
    return {
      id: str(c && c.id),
      name: str(c && c.name),
      color: str(c && c.color)
    };
  }

  function mapField(f) {
    return {
      id: str(f && f.id),
      name: str(f && f.name),
      type: str(f && f.type),
      description: str(f && f.description)
    };
  }

  function mapView(v) {
    return {
      id: str(v && v.id),
      name: str(v && v.name),
      type: str(v && v.type)
    };
  }

  function mapTable(t) {
    return {
      id: str(t && t.id),
      name: str(t && t.name),
      fields: list(t && t.columns).map(mapField),
      views: list(t && t.views).map(mapView)
    };
  }

  function mapWorkspace(w) {
    return {
      id: str(w && w.id),
      name: str(w && w.name),
      permission_level: str(w && w.sharedWithCurrentUser && w.sharedWithCurrentUser.directPermissionLevel),
      base_ids: list(w && w.visibleApplicationOrder).map(str)
    };
  }

  function mapBase(b) {
    return {
      id: str(b && b.id),
      name: str(b && b.name),
      color: str(b && b.color),
      permission_level: str(b && b.currentUserEffectivePermissionLevel)
    };
  }

  function stripHtml(html) {
    return String(html || '').replace(/<[^>]+>/g, '').trim();
  }

  function readHandler(slug, params, requestForArgs, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'airtable-execute-bound-spec-unavailable');
        }
        var req = requestForArgs(args || {});
        var res = await ctx.executeBoundSpec(apiSpec(req.endpoint, req.params || {}, req.appId), ctx.tabId);
        var data = resultData(res, slug);
        if (!data || data.success === false) { return data; }
        var parsed = parser(data, args || {});
        if (!parsed) { return fallback(slug, 'airtable-api-shape-mismatch'); }
        return { success: true, data: parsed };
      }
    };
  }

  function guarded(slug, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, 'airtable-mutation-body-uat-required');
      }
    };
  }

  var handlers = {
    'airtable.list_workspaces': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        var slug = 'airtable.list_workspaces';
        var auth = await bootstrapUserId(ctx, slug);
        if (!auth || auth.success !== true) { return auth; }
        var endpoint = 'user/' + encodeSegment(auth.userId) + '/listApplicationsAndPageBundlesForDisplay';
        var res = await ctx.executeBoundSpec(apiSpec(endpoint, {}, null), ctx.tabId);
        var data = resultData(res, slug);
        if (!data || data.success === false) { return data; }
        var workspacesById = isObject(data.workspaceRecordById) ? data.workspaceRecordById : {};
        var basesById = isObject(data.applicationRecordById) ? data.applicationRecordById : {};
        return {
          success: true,
          data: {
            workspaces: Object.keys(workspacesById).map(function(id) {
              var w = workspacesById[id] || {};
              if (!w.id) { w.id = id; }
              return mapWorkspace(w);
            }),
            bases: Object.keys(basesById).map(function(id) {
              var b = basesById[id] || {};
              if (!b.id) { b.id = id; }
              return mapBase(b);
            })
          }
        };
      }
    },
    'airtable.get_base_schema': readHandler('airtable.get_base_schema', BASE_PARAMS, function(a) {
      return {
        endpoint: 'application/' + encodeSegment(a.base_id) + '/read',
        appId: a.base_id,
        params: {
          includeDataForTableIds: [],
          shouldIncludeSchemaChecksum: false,
          mayOnlyIncludeRowAndCellDataForIncludedViews: true,
          allowMsgpackOfResult: false
        }
      };
    }, function(data) {
      return { tables: list(data.tableSchemas).map(mapTable) };
    }),
    'airtable.get_field_choices': readHandler('airtable.get_field_choices', FIELD_PARAMS, function(a) {
      return {
        endpoint: 'application/' + encodeSegment(a.base_id) + '/read',
        appId: a.base_id,
        params: {
          includeDataForTableIds: [],
          shouldIncludeSchemaChecksum: false,
          mayOnlyIncludeRowAndCellDataForIncludedViews: true,
          allowMsgpackOfResult: false
        }
      };
    }, function(data, args) {
      var tables = list(data.tableSchemas);
      var table = null;
      for (var i = 0; i < tables.length; i++) {
        if (tables[i] && tables[i].id === args.table_id) { table = tables[i]; break; }
      }
      if (!table) { return null; }
      var columns = list(table.columns);
      var field = null;
      for (var j = 0; j < columns.length; j++) {
        if (columns[j] && columns[j].id === args.field_id) { field = columns[j]; break; }
      }
      if (!field || (field.type !== 'select' && field.type !== 'multiSelect')) { return null; }
      var opts = isObject(field.typeOptions) ? field.typeOptions : {};
      var choices = isObject(opts.choices) ? opts.choices : {};
      var order = list(opts.choiceOrder);
      if (!order.length) { order = Object.keys(choices); }
      return { choices: order.map(function(id) { return mapChoice(choices[id] || { id: id }); }) };
    }),
    'airtable.list_records': readHandler('airtable.list_records', TABLE_PARAMS, function(a) {
      return {
        endpoint: 'application/' + encodeSegment(a.base_id) + '/read',
        appId: a.base_id,
        params: {
          includeDataForTableIds: [a.table_id],
          shouldIncludeSchemaChecksum: false,
          mayOnlyIncludeRowAndCellDataForIncludedViews: false,
          allowMsgpackOfResult: false
        }
      };
    }, function(data, args) {
      var tableData = list(data.tableDatas).filter(function(td) {
        return td && (td.id === args.table_id || td.tableId === args.table_id);
      })[0];
      return { records: list(tableData && tableData.rows).map(mapRecord) };
    }),
    'airtable.get_record': readHandler('airtable.get_record', RECORD_PARAMS, function(a) {
      return {
        endpoint: 'application/' + encodeSegment(a.base_id) + '/read',
        appId: a.base_id,
        params: {
          includeDataForTableIds: [a.table_id],
          shouldIncludeSchemaChecksum: false,
          mayOnlyIncludeRowAndCellDataForIncludedViews: false,
          allowMsgpackOfResult: false
        }
      };
    }, function(data, args) {
      var tableData = list(data.tableDatas).filter(function(td) {
        return td && (td.id === args.table_id || td.tableId === args.table_id);
      })[0];
      var row = list(tableData && tableData.rows).filter(function(r) { return r && r.id === args.record_id; })[0];
      return row ? { record: mapRecord(row) } : null;
    }),
    'airtable.get_record_activity': readHandler('airtable.get_record_activity', RECORD_PARAMS, function(a) {
      return {
        endpoint: 'row/' + encodeSegment(a.record_id) + '/readRowActivitiesAndComments',
        appId: a.base_id,
        params: { tableId: a.table_id }
      };
    }, function(data) {
      var users = isObject(data.rowActivityOrCommentUserObjById) ? data.rowActivityOrCommentUserObjById : {};
      var activityInfos = isObject(data.rowActivityInfoById) ? data.rowActivityInfoById : {};
      var commentsById = isObject(data.commentsById) ? data.commentsById : {};
      var ids = list(data.orderedActivityAndCommentIds).map(str);
      return {
        activities: ids.filter(function(id) { return !!activityInfos[id]; }).map(function(id) {
          var info = activityInfos[id] || {};
          var userId = str(info.originatingUserId);
          var user = users[userId] || {};
          return {
            id: id,
            type: str(info.groupType),
            user_id: userId,
            user_name: str(user.name),
            timestamp: str(info.createdTime),
            description: stripHtml(info.diffRowHtml)
          };
        }),
        comments: ids.filter(function(id) { return !!commentsById[id]; }).map(function(id) {
          var c = commentsById[id] || {};
          var user = users[str(c.userId)] || {};
          return {
            id: id,
            author_name: str(user.name),
            text: str(c.text),
            created_time: str(c.createdTime)
          };
        })
      };
    }),
    'airtable.create_comment': guarded('airtable.create_comment', CREATE_COMMENT_PARAMS),
    'airtable.update_cell': guarded('airtable.update_cell', UPDATE_CELL_PARAMS)
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
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
  }

  global.FsbHandlerAirtable = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
