(function (global) {
  'use strict';

  /**
   * Snowflake same-origin read head.
   *
   * Snowflake's Snowsight app stores session context in first-party MAIN-world
   * state and executes SQL through the authenticated app backend. This handler
   * keeps all credentialed work behind the router's bounded primitives, fails
   * closed when page state or response shapes are unavailable, and constrains
   * run_query to read-only SQL forms.
   */

  var ORIGIN = 'https://app.snowflake.com';
  var SERVICE = 'app.snowflake.com';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string', minLength: 1 };
  var OPTIONAL_STRING = { type: 'string' };
  var EMPTY_PARAMS = schema({}, []);
  var DATABASE_PARAMS = schema({ database: STRING }, ['database']);
  var TABLES_PARAMS = schema({
    database: STRING,
    schema: STRING,
    pattern: OPTIONAL_STRING
  }, ['database', 'schema']);
  var OBJECT_PARAMS = schema({ objectName: STRING }, ['objectName']);
  var QUERY_PARAMS = schema({
    query: STRING,
    database: OPTIONAL_STRING,
    schema: OPTIONAL_STRING,
    warehouse: OPTIONAL_STRING,
    role: OPTIONAL_STRING,
    maxRows: integerSchema('Maximum rows to return', 1, 10000)
  }, ['query']);
  var QUERY_CHUNK_PARAMS = schema({
    queryId: STRING,
    chunkIndex: integerSchema('Chunk index to fetch', 0, INT_LIMIT)
  }, ['queryId', 'chunkIndex']);
  var ENTITY_PARAMS = schema({
    limit: integerSchema('Maximum entities to return', 1, 100),
    cursor: OPTIONAL_STRING
  }, []);
  var SEARCH_PARAMS = schema({ query: STRING }, ['query']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min,
      maximum: max,
      description: description
    };
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
      reason: reason || 'snowflake-logged-out-or-rot',
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

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function positiveInt(value, fallbackValue, max) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 1) { n = fallbackValue; }
    n = Math.floor(n);
    return n > max ? max : n;
  }

  function quoteIdent(value) {
    var s = String(value || '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(s)) { return null; }
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function qualifiedName(value, minParts, maxParts) {
    var parts = String(value || '').split('.');
    if (parts.length < minParts || parts.length > maxParts) { return null; }
    var quoted = [];
    for (var i = 0; i < parts.length; i++) {
      var q = quoteIdent(parts[i]);
      if (!q) { return null; }
      quoted.push(q);
    }
    return quoted.join('.');
  }

  function singleQuoted(value) {
    return "'" + String(value || '').replace(/'/g, "''") + "'";
  }

  function normalizeReadSql(sql) {
    var s = String(sql || '').trim();
    s = s.replace(/;+\s*$/, '').trim();
    if (!s || s.indexOf(';') !== -1) { return ''; }
    var first = (/^([A-Za-z]+)/.exec(s) || [])[1];
    first = first ? first.toUpperCase() : '';
    if (first === 'SELECT' || first === 'SHOW' || first === 'DESCRIBE' ||
        first === 'DESC' || first === 'EXPLAIN') {
      return s;
    }
    if (first === 'WITH' && !/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|COPY|GRANT|REVOKE|CALL|EXECUTE|PUT|REMOVE|USE)\b/i.test(s)) {
      return s;
    }
    return '';
  }

  function rawRowsToObjects(rawRows, columns) {
    var rows = [];
    var cols = list(columns);
    var raw = list(rawRows);
    for (var i = 0; i < raw.length; i++) {
      var row = {};
      var arr = list(raw[i]);
      for (var j = 0; j < cols.length; j++) {
        var name = cols[j] && cols[j].name ? String(cols[j].name) : 'column_' + j;
        row[name] = arr[j] === undefined ? null : arr[j];
      }
      rows.push(row);
    }
    return rows;
  }

  function parseFirstChunk(value) {
    if (!value || typeof value !== 'string') { return []; }
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function queryColumns(raw) {
    return list(raw && raw.result && raw.result.resultColumnMetadata).map(function (c) {
      c = c || {};
      return {
        name: str(c.name),
        typeName: str(c.typeName),
        nullable: c.nullable === undefined ? true : c.nullable === true,
        precision: num(c.precision),
        scale: num(c.scale)
      };
    });
  }

  function totalRows(result) {
    var r = result && result.result;
    var chunks = list(r && r.chunkFileMetadatas);
    if (chunks.length) {
      return chunks.reduce(function (sum, chunk) {
        return sum + num(chunk && chunk.rowCount);
      }, 0);
    }
    return num(r && r.firstChunkRowCount);
  }

  function queryExecution(raw) {
    var status = raw && raw.status ? raw.status : {};
    var result = raw && raw.result ? raw.result : {};
    return {
      queryId: str(raw && raw.queryId),
      status: 'SUCCESS',
      durationMs: num(status.totalDuration),
      warehouseName: str(status.warehouseName),
      statementType: str(result.statementType),
      error: null
    };
  }

  function responseData(result, slug, reason) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, reason || 'snowflake-http-error');
    }
    if (!isObject(result.data)) { return fallback(slug, reason || 'snowflake-shape-mismatch'); }
    return result.data;
  }

  async function pageRead(slug, action, args, ctx) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'snowflake-page-read-primitive-unavailable');
    }
    return ctx.executeBoundPageRead({
      origin: ORIGIN,
      namespace: 'snowflake',
      action: action,
      args: args || {}
    }, ctx.tabId);
  }

  async function getContext(slug, ctx) {
    var res = await pageRead(slug, 'get_context', {}, ctx);
    if (!res || res.success !== true) { return res; }
    var data = res.data;
    if (!isObject(data) || !data.appServerUrl || !data.decodedUserKey) {
      return fallback(slug, 'snowflake-context-unavailable');
    }
    return data;
  }

  function buildQuerySpec(context, sql, options) {
    var body = {
      sqlText: sql,
      asyncExec: false,
      sequenceId: 0,
      querySubmissionTime: Date.now()
    };
    options = options || {};
    if (options.database) { body.database = options.database; }
    if (options.schema) { body.schema = options.schema; }
    if (options.warehouse) { body.warehouse = options.warehouse; }
    if (options.role) { body.role = options.role; }
    return {
      url: String(context.appServerUrl).replace(/\/$/, '') + '/v1/queries',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-snowflake-context': context.decodedUserKey
      },
      body: JSON.stringify(body),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function buildChunkSpec(context, queryId, chunkIndex) {
    return {
      url: String(context.appServerUrl).replace(/\/$/, '') + '/v1/queries/' +
        encodeURIComponent(String(queryId)) + '/chunks/' + encodeURIComponent(String(chunkIndex)),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-snowflake-context': context.decodedUserKey
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function parseChunkRows(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'snowflake-chunk-http-error');
    }
    if (Array.isArray(result.data)) { return result.data; }
    var text = typeof result.text === 'string' ? result.text : '';
    if (!text) { return []; }
    try {
      var parsed = JSON.parse('[' + text + ']');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return fallback(slug, 'snowflake-chunk-shape-mismatch');
    }
  }

  async function executeQuery(slug, sql, args, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'snowflake-execute-bound-spec-unavailable');
    }
    var safeSql = normalizeReadSql(sql);
    if (!safeSql) { return fallback(slug, 'snowflake-read-only-sql-required'); }
    var context = await getContext(slug, ctx);
    if (!context || context.success === false) { return context; }

    var res = await ctx.executeBoundSpec(buildQuerySpec(context, safeSql, args || {}), ctx.tabId);
    var raw = responseData(res, slug, 'snowflake-query-http-error');
    if (!raw || raw.success === false) { return raw; }
    if (!isObject(raw) || !raw.status || raw.status.summary !== 'SUCCESS') {
      return fallback(slug, 'snowflake-query-failed-or-shape-mismatch');
    }

    return {
      context: context,
      raw: raw,
      columns: queryColumns(raw),
      rows: parseFirstChunk(raw.result && raw.result.firstChunkData),
      totalRows: totalRows(raw),
      chunkFileCount: num(raw.result && raw.result.chunkFileCount),
      execution: queryExecution(raw)
    };
  }

  async function executeQueryResponse(slug, sql, args, ctx, mapResult) {
    var result = await executeQuery(slug, sql, args, ctx);
    if (!result || result.success === false) { return result; }
    return { success: true, status: 200, data: mapResult(result, args || {}) };
  }

  function mapDatabase(row) {
    row = list(row);
    return {
      name: str(row[1]),
      owner: str(row[5]),
      kind: str(row[9]) || 'STANDARD',
      created_on: str(row[0]),
      comment: str(row[6])
    };
  }

  function mapSchemaInfo(row) {
    row = list(row);
    return {
      name: str(row[1]),
      database_name: str(row[4]),
      owner: str(row[5]),
      created_on: str(row[0]),
      comment: str(row[6])
    };
  }

  function mapWarehouse(row) {
    row = list(row);
    return {
      name: str(row[0]),
      state: str(row[1]),
      type: str(row[2]),
      size: str(row[3]),
      auto_suspend: str(row[11]),
      auto_resume: str(row[12]),
      owner: str(row[20]),
      running: str(row[7]) || '0',
      queued: str(row[8]) || '0'
    };
  }

  function mapTableColumn(row) {
    row = list(row);
    return {
      name: str(row[0]),
      type: str(row[1]),
      kind: str(row[2]) || 'COLUMN',
      nullable: str(row[3]) || 'Y',
      default: row[4] ? str(row[4]) : null,
      primaryKey: str(row[5]) || 'N',
      uniqueKey: str(row[6]) || 'N',
      comment: row[7] ? str(row[7]) : null
    };
  }

  function mapWorksheet(entity) {
    var info = entity && entity.info ? entity.info : {};
    return {
      entityId: str(entity && entity.entityId),
      name: str(info.name),
      created: str(info.created),
      modified: str(info.modified),
      queryLanguage: str(info.queryLanguage) || 'sql',
      role: str(info.role),
      url: str(info.url),
      visibility: str(info.visibility),
      folderId: info.folderId === undefined ? null : info.folderId
    };
  }

  function mapFolder(entity) {
    var info = entity && entity.info ? entity.info : {};
    return {
      entityId: str(entity && entity.entityId),
      name: str(info.name),
      created: str(info.created),
      modified: str(info.modified),
      url: str(info.url),
      visibility: str(info.visibility)
    };
  }

  function mapDashboard(entity) {
    return mapFolder(entity);
  }

  async function listEntities(slug, args, ctx, location, types, key, mapper, entityType) {
    var res = await pageRead(slug, 'list_entities', {
      location: location,
      types: types,
      limit: positiveInt(args && args.limit, 50, 100),
      cursor: args && args.cursor
    }, ctx);
    if (!res || res.success !== true) { return res; }
    var data = res.data;
    if (!isObject(data) || !Array.isArray(data.entities)) {
      return fallback(slug, 'snowflake-entities-shape-mismatch');
    }
    var entities = data.entities.filter(function (entity) {
      return entity && entity.info && (!entityType || entity.entityType === entityType);
    }).map(mapper);
    var out = {};
    out[key] = entities;
    out.cursor = str(data.next);
    return { success: true, status: 200, data: out };
  }

  function readHandler(slug, params, fn) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return fn(args || {}, ctx);
      }
    };
  }

  var handlers = {
    'snowflake.diagnose': readHandler('snowflake.diagnose', EMPTY_PARAMS, async function (_args, ctx) {
      return pageRead('snowflake.diagnose', 'diagnose', {}, ctx);
    }),
    'snowflake.get_session': readHandler('snowflake.get_session', EMPTY_PARAMS, async function (_args, ctx) {
      var session = await getContext('snowflake.get_session', ctx);
      if (!session || session.success === false) { return session; }
      return {
        success: true,
        status: 200,
        data: {
          userEmail: str(session.userEmail),
          role: str(session.role),
          orgId: str(session.orgId),
          orgShortName: str(session.orgShortName),
          appServerUrl: str(session.appServerUrl)
        }
      };
    }),
    'snowflake.browse_data': readHandler('snowflake.browse_data', EMPTY_PARAMS, async function (args, ctx) {
      return executeQueryResponse('snowflake.browse_data', 'SHOW DATABASES', args, ctx, function (result) {
        return { databases: result.rows.map(mapDatabase) };
      });
    }),
    'snowflake.search_data': readHandler('snowflake.search_data', SEARCH_PARAMS, async function (args, ctx) {
      var pattern = String(args.query || '').indexOf('%') === -1 ? '%' + args.query + '%' : args.query;
      return executeQueryResponse('snowflake.search_data', 'SHOW DATABASES LIKE ' + singleQuoted(pattern), args, ctx, function (result) {
        return { databases: result.rows.map(mapDatabase) };
      });
    }),
    'snowflake.list_schemas': readHandler('snowflake.list_schemas', DATABASE_PARAMS, async function (args, ctx) {
      var db = qualifiedName(args.database, 1, 1);
      if (!db) { return fallback('snowflake.list_schemas', 'snowflake-invalid-database'); }
      return executeQueryResponse('snowflake.list_schemas', 'SHOW SCHEMAS IN DATABASE ' + db, args, ctx, function (result) {
        return { schemas: result.rows.map(mapSchemaInfo) };
      });
    }),
    'snowflake.list_tables': readHandler('snowflake.list_tables', TABLES_PARAMS, async function (args, ctx) {
      var db = qualifiedName(args.database, 1, 1);
      var sch = qualifiedName(args.schema, 1, 1);
      if (!db || !sch) { return fallback('snowflake.list_tables', 'snowflake-invalid-schema'); }
      var likeClause = args.pattern ? ' LIKE ' + singleQuoted(args.pattern) : '';
      return executeQueryResponse('snowflake.list_tables', 'SHOW TABLES' + likeClause + ' IN SCHEMA ' + db + '.' + sch, args, ctx, function (result) {
        return {
          tables: result.rows.map(function (row) {
            row = list(row);
            return {
              name: str(row[1]),
              database_name: str(row[2]),
              schema_name: str(row[3]),
              kind: str(row[4]) || 'TABLE',
              owner: str(row[9]),
              rows: str(row[7]) || '0',
              created_on: str(row[0]),
              comment: str(row[5])
            };
          })
        };
      });
    }),
    'snowflake.list_warehouses': readHandler('snowflake.list_warehouses', EMPTY_PARAMS, async function (args, ctx) {
      return executeQueryResponse('snowflake.list_warehouses', 'SHOW WAREHOUSES', args, ctx, function (result) {
        return { warehouses: result.rows.map(mapWarehouse) };
      });
    }),
    'snowflake.list_shared_objects': readHandler('snowflake.list_shared_objects', EMPTY_PARAMS, async function (args, ctx) {
      return executeQueryResponse('snowflake.list_shared_objects', 'SHOW SHARES', args, ctx, function (result) {
        return {
          shares: result.rows.map(function (row) {
            row = list(row);
            return {
              name: str(row[1]),
              kind: str(row[2]),
              databaseName: str(row[4]),
              ownerAccount: str(row[3]),
              created_on: str(row[0]),
              comment: str(row[6])
            };
          })
        };
      });
    }),
    'snowflake.get_object_details': readHandler('snowflake.get_object_details', OBJECT_PARAMS, async function (args, ctx) {
      var objectName = qualifiedName(args.objectName, 3, 3);
      if (!objectName) { return fallback('snowflake.get_object_details', 'snowflake-invalid-object-name'); }
      return executeQueryResponse('snowflake.get_object_details', 'DESCRIBE TABLE ' + objectName, args, ctx, function (result) {
        return { columns: result.rows.map(mapTableColumn) };
      });
    }),
    'snowflake.run_query': readHandler('snowflake.run_query', QUERY_PARAMS, async function (args, ctx) {
      var maxRows = positiveInt(args.maxRows, 100, 10000);
      var result = await executeQuery('snowflake.run_query', args.query, args, ctx);
      if (!result || result.success === false) { return result; }
      var rawRows = result.rows.slice();
      if (result.chunkFileCount > 1 && rawRows.length < maxRows) {
        var start = rawRows.length === 0 ? 0 : 1;
        for (var i = start; i < result.chunkFileCount; i++) {
          var chunk = await ctx.executeBoundSpec(buildChunkSpec(result.context, result.execution.queryId, i), ctx.tabId);
          var rows = parseChunkRows(chunk, 'snowflake.run_query');
          if (!rows || rows.success === false) { return rows; }
          rawRows = rawRows.concat(rows);
          if (rawRows.length >= maxRows) { break; }
        }
      }
      var limited = rawRows.slice(0, maxRows);
      return {
        success: true,
        status: 200,
        data: {
          columns: result.columns.map(function (c) {
            return { name: c.name, typeName: c.typeName, nullable: c.nullable };
          }),
          rows: rawRowsToObjects(limited, result.columns),
          execution: result.execution,
          rowCount: limited.length,
          totalRows: result.totalRows,
          truncated: rawRows.length > maxRows || result.totalRows > maxRows
        }
      };
    }),
    'snowflake.get_query': readHandler('snowflake.get_query', QUERY_CHUNK_PARAMS, async function (args, ctx) {
      if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
        return fallback('snowflake.get_query', 'snowflake-execute-bound-spec-unavailable');
      }
      var context = await getContext('snowflake.get_query', ctx);
      if (!context || context.success === false) { return context; }
      var chunk = await ctx.executeBoundSpec(buildChunkSpec(context, args.queryId, args.chunkIndex), ctx.tabId);
      var rows = parseChunkRows(chunk, 'snowflake.get_query');
      if (!rows || rows.success === false) { return rows; }
      return { success: true, status: 200, data: { rows: rows, rowCount: rows.length } };
    }),
    'snowflake.list_worksheets': readHandler('snowflake.list_worksheets', ENTITY_PARAMS, async function (args, ctx) {
      return listEntities('snowflake.list_worksheets', args, ctx, 'worksheets', ['query'], 'worksheets', mapWorksheet, 'query');
    }),
    'snowflake.list_folders': readHandler('snowflake.list_folders', ENTITY_PARAMS, async function (args, ctx) {
      return listEntities('snowflake.list_folders', args, ctx, 'worksheets', ['folder'], 'folders', mapFolder, 'folder');
    }),
    'snowflake.list_dashboards': readHandler('snowflake.list_dashboards', ENTITY_PARAMS, async function (args, ctx) {
      return listEntities('snowflake.list_dashboards', args, ctx, 'dashboards', ['dashboard'], 'dashboards', mapDashboard, null);
    })
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

  global.FsbHandlerSnowflake = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
