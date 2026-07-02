(function (global) {
  'use strict';

  /**
   * Phase 29 Plan 03 (v0.9.99 Native Capability Catalog) -- catalog/handlers/notion.js
   *
   * Notion bundled-head handler module (CAT-02, T1a -- the /api/v3 RPC case). Reviewed
   * imperative CODE shipped in the extension bundle. Notion powers its UI with an
   * internal POST-only RPC the closed declarative recipe schema cannot express cleanly
   * (loading a page is a multi-call record-fetch sequence), so it is a handler:
   *   - notion.getSpaces  (read) : list the user's spaces (the head's first slug).
   *   - notion.loadPage   (read) : load a page's cached chunk (multi-call RPC).
   *
   * THE RPC (RESEARCH Head-Service Selection row #4, web-search-verified mechanics):
   * Notion's own internal API is POST /api/v3/<op> (getSpaces, loadCachedPageChunk,
   * ...). The `token_v2` HttpOnly cookie rides the same-origin request automatically
   * (the handler sets NO cookie header -- the browser attaches it). No page-scraped
   * token is needed for these reads (the cookie alone authenticates).
   *
   * THE ORIGIN-PIN (D-09 + D-12, Pitfall 3 credential-replay): every spec targets
   * Notion's OWN first-party app origin https://app.notion.com so token_v2 attaches. The
   * handler NEVER injects into a page itself (no browser-extension scripting/tabs
   * APIs); it builds bound spec(s) and calls ctx.executeBoundSpec, which re-pins the
   * active tab before any side effect. No separate-origin API host appears (asserted
   * by the test).
   *
   * [ASSUMED] -- the READ /api/v3 op PATHS and request body shapes below are training/
   * inference-derived and MUST be confirmed against a live authenticated app.notion.com
   * tab before the head is trusted (29-03 Task 4, recorded as human_needed live-UAT in
   * 29-HUMAN-UAT.md). The /api/v3 + token_v2 mechanics ARE web-search-verified; the
   * exact request shape is not.
   *
   * ACTIVE WRITES (2026-06-29 live UAT): 4 write slugs are activated against the
   * observed same-origin runtime: app.notion.com POST /api/v3/saveTransactions.
   * Title/icon/cover property writes use command:"set" for array/string property
   * paths; object-shaped metadata updates use command:"update". Each write verifies
   * the resulting record through getRecordValues. notion.append_block is mutating in
   * practice but is still classified as sideEffectClass:'read' in its descriptor, so
   * it stays out of this activation patch.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js:372-385 --
   * the service worker reads global.FsbHandlerNotion after importScripts and the
   * module self-registers its slugs into FsbCapabilityCatalog at load; Node tests
   * require() the module.exports slug-keyed object. Eval-free, no browser scripting/
   * tabs APIs, no network of its own. NO EMOJIS, ASCII-only source.
   */

  var NOTION_ORIGIN = 'https://app.notion.com';
  var GET_SPACES_PARAMS = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };
  var LOAD_PAGE_PARAMS = {
    type: 'object',
    properties: {
      pageId: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      cursor: { type: 'object' }
    },
    required: ['pageId'],
    additionalProperties: false
  };
  // ---- Phase 40 (DEPTH-01) closed params schemas for the 2 new READ slugs ----
  // From the opentabs__notion__*.json descriptor props. additionalProperties:false.
  var SEARCH_PARAMS = {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    },
    required: ['query'],
    additionalProperties: false
  };
  var GET_DATABASE_PARAMS = {
    type: 'object',
    properties: {
      database_id: { type: 'string', minLength: 1 }
    },
    required: ['database_id'],
    additionalProperties: false
  };

  // ---- Active write params schemas -----------------------------------------
  // Props mirrored EXACTLY from the opentabs__notion__create_page/update_page/
  // create_database/create_database_item.json descriptors. The required fields are set;
  // additionalProperties:false everywhere -- the AI cannot smuggle extra fields into a
  // credentialed same-origin RPC. NOTE: notion.append_block is sideEffectClass:'read'
  // in its descriptor -> it is NOT activated in this write patch.
  var CREATE_PAGE_PARAMS = {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      parent_page_id: { type: 'string' },
      icon: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['title'],
    additionalProperties: false
  };
  var UPDATE_PAGE_PARAMS = {
    type: 'object',
    properties: {
      page_id: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      icon: { type: 'string' },
      cover: { type: 'string' }
    },
    required: ['page_id'],
    additionalProperties: false
  };
  var CREATE_DATABASE_ITEM_PARAMS = {
    type: 'object',
    properties: {
      database_id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      properties: {
        type: 'object',
        propertyNames: { type: 'string' },
        additionalProperties: { type: 'string' }
      }
    },
    required: ['database_id', 'title'],
    additionalProperties: false
  };
  var CREATE_DATABASE_PARAMS = {
    type: 'object',
    properties: {
      parent_page_id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1 },
      properties: {
        type: 'object',
        propertyNames: { type: 'string' },
        additionalProperties: { type: 'string' }
      }
    },
    required: ['parent_page_id', 'title'],
    additionalProperties: false
  };

  // Build a POST /api/v3/<op> RPC spec. The token_v2 cookie rides same-origin; the
  // body is the op's JSON request. For saveTransactions, Notion also expects the
  // active user and space ids in first-party headers; those values are resolved from
  // same-origin Notion RPC responses, never from cookies or page text.
  function buildRpcSpec(op, requestBody, extraHeaders) {
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (extraHeaders) {
      for (var k in extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(extraHeaders, k) && extraHeaders[k]) {
          headers[k] = extraHeaders[k];
        }
      }
    }
    return {
      url: NOTION_ORIGIN + '/api/v3/' + op,
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody || {}),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: NOTION_ORIGIN,
      extract: '@'
    };
  }

  // ---- Phase 40 (DEPTH-01) typed-error helper + logged-out guard ------------
  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  // A top-level Notion error envelope carries a string `name` (e.g.
  // { name: 'unauthorized' } / { name: 'ValidationError' }, the shape notion-api.ts
  // parses on a non-ok response: { name?, message?, debugMessage? }) or a string
  // `errorId` (Notion's documented internal-API error marker) -- neither of which a
  // legitimate /api/v3 read body carries. Used to reject an error envelope returned
  // with a 200 (the logged-out / stale-auth case) that would otherwise pass the
  // "non-null object" check. Conservative and keyed ONLY on the documented error
  // markers (parity with gitlab.js looksLikeGitlabError): a legitimate read body --
  // a getSpaces user-id-keyed map, a search results object, or a recordMap record
  // fetch -- carries neither marker, so it is never excluded.
  function looksLikeNotionError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.name === 'string' || typeof data.errorId === 'string');
  }

  // The logged-out guard (CONTEXT Top Risk, "200-with-logged-out-body"): a
  // logged-out app.notion.com tab can answer an /api/v3 RPC with a 200 carrying a
  // sign-in/redirect body. executeBoundSpec returns { success, data, ... } where
  // `data` is the parsed RPC payload. The RPC reads return a non-null object/array
  // (search -> a results object; a record fetch -> a recordMap object). On a wrong
  // shape (null / primitive) OR a Notion error envelope masquerading as a 200
  // (IN-04 hardening: parity with gitlab's error-envelope rejection -- a logged-out
  // body that happens to be a non-null object no longer slips through), return the
  // dual-field RECIPE_DOM_FALLBACK_PENDING so the breadth DOM path serves; otherwise
  // return the result verbatim. Write handlers use dedicated save/verification guards.
  function guardRpcShape(result, slug) {
    if (!result || result.success !== true) {
      return result;   // pin / fetch failure -> return verbatim; do NOT mask it.
    }
    var data = result.data;
    var ok = !!data && (typeof data === 'object')   // object or array; not null/primitive
      && !looksLikeNotionError(data);               // and NOT a logged-out error envelope
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'notion-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function rpcFallback(slug, reason, result) {
    var extra = { slug: slug, reason: reason, fellBackToDom: true };
    if (result && typeof result.status === 'number') {
      extra.status = result.status;
    }
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', extra);
  }

  function randomUuid() {
    var c = global.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = Math.floor(Math.random() * 16);
      var v = ch === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  function compactId(id) {
    return String(id || '').replace(/-/g, '');
  }

  function notionUrl(id) {
    return NOTION_ORIGIN + '/' + compactId(id);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function firstOwnKey(obj) {
    if (!isPlainObject(obj)) { return ''; }
    for (var key in obj) {
      if (hasOwn(obj, key)) { return key; }
    }
    return '';
  }

  function extractSession(data) {
    if (!isPlainObject(data) || looksLikeNotionError(data)) { return null; }

    if (typeof data.userId === 'string' && typeof data.spaceId === 'string') {
      return { userId: data.userId, spaceId: data.spaceId };
    }

    for (var userId in data) {
      if (!hasOwn(data, userId)) { continue; }
      var user = data[userId];
      if (!isPlainObject(user)) { continue; }
      var spaces = isPlainObject(user.space) ? user.space : null;
      var spaceId = firstOwnKey(spaces);
      if (spaceId) {
        return { userId: userId, spaceId: spaceId };
      }
    }

    return null;
  }

  function extractSessionFromText(text) {
    if (typeof text !== 'string' || !text) { return null; }
    var uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
    var userMatch = text.match(new RegExp('^\\s*\\{\\s*"' + uuid + '"\\s*:\\s*\\{', 'i'))
      || text.match(new RegExp('"notion_user"\\s*:\\s*\\{\\s*"' + uuid + '"\\s*:', 'i'))
      || text.match(new RegExp('"users"\\s*:\\s*\\{\\s*"' + uuid + '"\\s*:', 'i'));
    var spaceMatch = text.match(new RegExp('"space"\\s*:\\s*\\{\\s*"' + uuid + '"\\s*:', 'i'));
    if (userMatch && userMatch[1] && spaceMatch && spaceMatch[1]) {
      return { userId: userMatch[1], spaceId: spaceMatch[1] };
    }
    return null;
  }

  function extractSessionFromResult(result) {
    var session = result && isOkRpc(result) ? extractSession(result.data) : null;
    if (!session && result && result.success === true) {
      session = extractSessionFromText(result.text);
    }
    return session;
  }

  async function executeRpc(op, requestBody, ctx, slug, extraHeaders) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return rpcFallback(slug, 'notion-bound-fetch-unavailable');
    }
    try {
      return await ctx.executeBoundSpec(buildRpcSpec(op, requestBody || {}, extraHeaders), ctx.tabId);
    } catch (e) {
      return rpcFallback(slug, 'notion-rpc-threw');
    }
  }

  function isOkRpc(result) {
    if (!result || result.success !== true) { return false; }
    if (typeof result.status === 'number' && (result.status < 200 || result.status >= 300)) {
      return false;
    }
    return !looksLikeNotionError(result.data);
  }

  async function resolveSession(ctx, slug) {
    var res = await executeRpc('getSpaces', {}, ctx, slug);
    var session = extractSessionFromResult(res);
    if (!session) {
      res = await executeRpc('getSpacesInitial', {}, ctx, slug);
      session = extractSessionFromResult(res);
    }
    if (!session || !session.userId || !session.spaceId) {
      return { error: rpcFallback(slug, 'notion-session-unavailable', res) };
    }
    return { session: session };
  }

  function sessionHeaders(session) {
    return {
      'x-notion-active-user-header': session.userId,
      'x-notion-space-id': session.spaceId
    };
  }

  async function saveTransactions(ctx, session, operations, slug) {
    var res = await executeRpc('saveTransactions', {
      requestId: randomUuid(),
      transactions: [{
        id: randomUuid(),
        spaceId: session.spaceId,
        operations: operations
      }]
    }, ctx, slug, sessionHeaders(session));
    if (!isOkRpc(res)) {
      return { error: rpcFallback(slug, 'notion-save-transactions-failed', res) };
    }
    return { result: res };
  }

  async function getRecordValues(ctx, session, requests, slug) {
    var res = await executeRpc('getRecordValues', {
      requests: requests
    }, ctx, slug, sessionHeaders(session));
    if (!isOkRpc(res) || !res.data || !Array.isArray(res.data.results)) {
      return { error: rpcFallback(slug, 'notion-record-verification-failed', res) };
    }
    return { data: res.data };
  }

  function recordValue(data, index) {
    return data && data.results && data.results[index]
      ? data.results[index].value
      : null;
  }

  function nowMs() {
    return Date.now();
  }

  function editedBy(session, timestamp) {
    return {
      last_edited_time: timestamp,
      last_edited_by_id: session.userId,
      last_edited_by_table: 'notion_user'
    };
  }

  function blockArgs(blockId, type, parentId, parentTable, session, extra) {
    var t = nowMs();
    var args = {
      type: type,
      id: blockId,
      version: 1,
      parent_id: parentId,
      parent_table: parentTable || 'block',
      alive: true,
      created_time: t,
      created_by_id: session.userId,
      created_by_table: 'notion_user',
      last_edited_time: t,
      last_edited_by_id: session.userId,
      last_edited_by_table: 'notion_user',
      space_id: session.spaceId
    };
    if (extra) {
      for (var k in extra) {
        if (hasOwn(extra, k)) { args[k] = extra[k]; }
      }
    }
    return args;
  }

  function editorPermission(session) {
    return [{ type: 'user_permission', role: 'editor', user_id: session.userId }];
  }

  function textProperty(value) {
    return [[String(value)]];
  }

  function readTitle(record, fallback) {
    if (record && record.properties && record.properties.title
        && record.properties.title[0] && record.properties.title[0][0]) {
      return record.properties.title[0][0];
    }
    if (record && record.name && record.name[0] && record.name[0][0]) {
      return record.name[0][0];
    }
    return fallback || null;
  }

  var PROPERTY_TYPES = {
    text: 'text',
    number: 'number',
    select: 'select',
    multi_select: 'multi_select',
    checkbox: 'checkbox',
    url: 'url',
    email: 'email',
    phone: 'phone_number'
  };

  function schemaPropId(schema) {
    var id = compactId(randomUuid()).slice(0, 4);
    while (schema && hasOwn(schema, id)) {
      id = compactId(randomUuid()).slice(0, 4);
    }
    return id;
  }

  function buildCollectionSchema(properties, slug) {
    var schema = { title: { name: 'Name', type: 'title' } };
    var props = properties || {};
    for (var name in props) {
      if (!hasOwn(props, name)) { continue; }
      var raw = String(props[name] || '').toLowerCase();
      var notionType = PROPERTY_TYPES[raw];
      if (!notionType) {
        return {
          error: rpcFallback(slug, 'notion-unsupported-property-type')
        };
      }
      schema[schemaPropId(schema)] = { name: name, type: notionType };
    }
    return { schema: schema };
  }

  function findSchemaEntry(schema, propName) {
    if (!isPlainObject(schema)) { return null; }
    var needle = String(propName || '').toLowerCase();
    for (var id in schema) {
      if (!hasOwn(schema, id)) { continue; }
      var def = schema[id];
      var name = def && typeof def.name === 'string' ? def.name.toLowerCase() : '';
      if (name === needle) {
        return { id: id, def: def };
      }
    }
    return null;
  }

  function mapDatabaseProperties(schema, title, properties) {
    var out = { title: textProperty(title) };
    var props = properties || {};
    for (var propName in props) {
      if (!hasOwn(props, propName)) { continue; }
      var entry = findSchemaEntry(schema, propName);
      if (!entry || entry.id === 'title') { continue; }
      var def = entry.def || {};
      var propType = typeof def.type === 'string' ? def.type : 'text';
      var propValue = String(props[propName]);
      if (propType === 'select' || propType === 'multi_select') {
        var options = Array.isArray(def.options) ? def.options : [];
        var match = null;
        for (var i = 0; i < options.length; i++) {
          var option = options[i] || {};
          if (String(option.value || '').toLowerCase() === propValue.toLowerCase()) {
            match = option;
            break;
          }
        }
        out[entry.id] = match && match.id ? [[propValue, [['a', match.id]]]] : textProperty(propValue);
      } else if (propType === 'checkbox') {
        var normalized = propValue.toLowerCase();
        out[entry.id] = textProperty(normalized === 'true' || normalized === 'yes' ? 'Yes' : 'No');
      } else {
        out[entry.id] = textProperty(propValue);
      }
    }
    return out;
  }

  function pageResponse(id, title, record) {
    return {
      success: true,
      page: {
        id: id,
        url: notionUrl(id),
        title: readTitle(record, title)
      },
      data: {
        pageId: id,
        pageUrl: notionUrl(id),
        title: readTitle(record, title)
      }
    };
  }

  function databaseResponse(id, title, record) {
    return {
      success: true,
      database: {
        id: id,
        title: readTitle(record, title)
      },
      data: {
        databaseId: id,
        title: readTitle(record, title)
      }
    };
  }

  function itemResponse(id, title, record) {
    return {
      success: true,
      item: {
        id: id,
        title: readTitle(record, title)
      },
      data: {
        itemId: id,
        title: readTitle(record, title)
      }
    };
  }

  var handlers = {
    // ---- notion.getSpaces (read) -------------------------------------------
    'notion.getSpaces': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: GET_SPACES_PARAMS,
      async handle(args, ctx) {
        // getSpaces takes an empty body; token_v2 authenticates.
        return await ctx.executeBoundSpec(buildRpcSpec('getSpaces', {}), ctx.tabId);
      }
    },

    // ---- notion.loadPage (read) --------------------------------------------
    // A multi-call record fetch in the real client; the head ships the first call.
    'notion.loadPage': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: LOAD_PAGE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        // [ASSUMED] loadCachedPageChunk request body -- the real shape (pageId,
        // limit, cursor, ...) is captured in Task 4.
        return await ctx.executeBoundSpec(buildRpcSpec('loadCachedPageChunk', {
          pageId: a.pageId,
          limit: a.limit || 30,
          cursor: a.cursor || { stack: [] }
        }), ctx.tabId);
      }
    },

    // ---- Phase 40 (DEPTH-01) -- the 2 opentabs READ slugs ------------------
    // EXACT opentabs dot-form slugs so resolve() UPGRADES each breadth descriptor
    // dom->T1a (distinct from notion.getSpaces/loadPage above -- no collision). Each
    // reuses buildRpcSpec: POST same-origin /api/v3 RPC, the token_v2 HttpOnly cookie
    // rides automatically (no scraped token). A logged-out body is rejected by
    // guardRpcShape. READ-only; notion writes (create/update/delete) are Phase 41.

    // ---- notion.search (read) ----------------------------------------------
    'notion.search': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: SEARCH_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        // [ASSUMED] the /api/v3 search RPC op + body shape (search query + limit) --
        // carried-forward live UAT debt, exactly like notion.getSpaces/loadPage.
        var res = await ctx.executeBoundSpec(buildRpcSpec('search', {
          query: a.query,
          limit: a.limit || 20
        }), ctx.tabId);
        return guardRpcShape(res, 'notion.search');
      }
    },

    // ---- notion.get_database (read) ----------------------------------------
    'notion.get_database': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'read',
      params: GET_DATABASE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        // Database (collection) records live in the `collection` table -- the
        // schema (properties/columns) that this op is documented to return is
        // only present on collection records; a `block` lookup returns a role-
        // only/empty envelope that guardRpcShape passes through as (empty)
        // success. Matches sibling ops in this file: create_database verifies
        // against `[{ id: collectionId, table: 'collection' }]` and
        // create_database_item resolves the same database_id via the
        // collection table too.
        var res = await ctx.executeBoundSpec(buildRpcSpec('getRecordValues', {
          requests: [{ id: a.database_id, table: 'collection' }]
        }), ctx.tabId);
        return guardRpcShape(res, 'notion.get_database');
      }
    },

    // ======================================================================
    // Active Notion writes (2026-06-29 live UAT).
    // ----------------------------------------------------------------------
    // These slugs are the UAT-smoked Notion mutations that work through
    // app.notion.com POST /api/v3/saveTransactions. The handler still uses only
    // ctx.executeBoundSpec; it never scripts the page, reads cookies/tokens, or expands
    // the MCP surface. Session context comes from getSpaces/getSpacesInitial, then
    // every mutation is verified through getRecordValues.
    //
    // NOTE: notion.append_block is mutating in practice, but its descriptor is still
    // sideEffectClass:'read'. It stays out of this activation patch.

    // ---- notion.create_page (write) ---------------------------------------
    'notion.create_page': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_PAGE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var resolved = await resolveSession(ctx, 'notion.create_page');
        if (resolved.error) { return resolved.error; }
        var session = resolved.session;
        var pageId = randomUuid();
        var parentId = a.parent_page_id || session.spaceId;
        var parentTable = a.parent_page_id ? 'block' : 'space';
        var parentListPath = a.parent_page_id ? ['content'] : ['pages'];
        var operations = [
          {
            pointer: { table: 'block', id: pageId, spaceId: session.spaceId },
            command: 'set',
            path: [],
            args: blockArgs(pageId, 'page', parentId, parentTable, session, {
              permissions: editorPermission(session)
            })
          },
          {
            pointer: { table: 'block', id: pageId, spaceId: session.spaceId },
            command: 'set',
            path: ['properties', 'title'],
            args: textProperty(a.title)
          },
          {
            pointer: { table: parentTable, id: parentId, spaceId: session.spaceId },
            command: 'listAfter',
            path: parentListPath,
            args: { id: pageId }
          }
        ];
        if (a.icon !== undefined) {
          operations.push({
            pointer: { table: 'block', id: pageId, spaceId: session.spaceId },
            command: 'set',
            path: ['format', 'page_icon'],
            args: a.icon
          });
        }
        if (a.content) {
          var blockId = randomUuid();
          operations.push({
            pointer: { table: 'block', id: blockId, spaceId: session.spaceId },
            command: 'set',
            path: [],
            args: blockArgs(blockId, 'text', pageId, 'block', session, {
              properties: { title: textProperty(a.content) }
            })
          });
          operations.push({
            pointer: { table: 'block', id: pageId, spaceId: session.spaceId },
            command: 'listAfter',
            path: ['content'],
            args: { id: blockId }
          });
        }
        var saved = await saveTransactions(ctx, session, operations, 'notion.create_page');
        if (saved.error) { return saved.error; }
        var verified = await getRecordValues(ctx, session, [{ id: pageId, table: 'block' }], 'notion.create_page');
        if (verified.error) { return verified.error; }
        var record = recordValue(verified.data, 0);
        if (!record) { return rpcFallback('notion.create_page', 'notion-created-page-missing'); }
        return pageResponse(pageId, a.title, record);
      }
    },

    // ---- notion.update_page (write) ---------------------------------------
    'notion.update_page': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: UPDATE_PAGE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var resolved = await resolveSession(ctx, 'notion.update_page');
        if (resolved.error) { return resolved.error; }
        var session = resolved.session;
        var operations = [];
        if (a.title !== undefined) {
          operations.push({
            pointer: { table: 'block', id: a.page_id, spaceId: session.spaceId },
            command: 'set',
            path: ['properties', 'title'],
            args: textProperty(a.title)
          });
        }
        if (a.icon !== undefined) {
          operations.push({
            pointer: { table: 'block', id: a.page_id, spaceId: session.spaceId },
            command: 'set',
            path: ['format', 'page_icon'],
            args: a.icon
          });
        }
        if (a.cover !== undefined) {
          operations.push({
            pointer: { table: 'block', id: a.page_id, spaceId: session.spaceId },
            command: 'set',
            path: ['format', 'page_cover'],
            args: a.cover
          });
        }
        operations.push({
          pointer: { table: 'block', id: a.page_id, spaceId: session.spaceId },
          command: 'update',
          path: [],
          args: editedBy(session, nowMs())
        });
        var saved = await saveTransactions(ctx, session, operations, 'notion.update_page');
        if (saved.error) { return saved.error; }
        var verified = await getRecordValues(ctx, session, [{ id: a.page_id, table: 'block' }], 'notion.update_page');
        if (verified.error) { return verified.error; }
        var record = recordValue(verified.data, 0);
        if (!record) { return rpcFallback('notion.update_page', 'notion-updated-page-missing'); }
        return pageResponse(a.page_id, a.title, record);
      }
    },

    // ---- notion.create_database (write) -----------------------------------
    'notion.create_database': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_DATABASE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var resolved = await resolveSession(ctx, 'notion.create_database');
        if (resolved.error) { return resolved.error; }
        var session = resolved.session;
        var parent = await getRecordValues(ctx, session, [{ id: a.parent_page_id, table: 'block' }], 'notion.create_database');
        if (parent.error) { return parent.error; }
        if (!recordValue(parent.data, 0)) {
          return rpcFallback('notion.create_database', 'notion-parent-page-missing');
        }
        var builtSchema = buildCollectionSchema(a.properties, 'notion.create_database');
        if (builtSchema.error) { return builtSchema.error; }

        var collectionId = randomUuid();
        var collectionViewPageId = randomUuid();
        var collectionViewId = randomUuid();
        var t = nowMs();
        var operations = [
          {
            pointer: { table: 'collection', id: collectionId, spaceId: session.spaceId },
            command: 'set',
            path: [],
            args: {
              id: collectionId,
              version: 1,
              name: textProperty(a.title),
              schema: builtSchema.schema,
              parent_id: collectionViewPageId,
              parent_table: 'block',
              alive: true,
              space_id: session.spaceId
            }
          },
          {
            pointer: { table: 'block', id: collectionViewPageId, spaceId: session.spaceId },
            command: 'set',
            path: [],
            args: {
              type: 'collection_view_page',
              id: collectionViewPageId,
              version: 1,
              collection_id: collectionId,
              view_ids: [collectionViewId],
              parent_id: a.parent_page_id,
              parent_table: 'block',
              alive: true,
              created_time: t,
              created_by_id: session.userId,
              created_by_table: 'notion_user',
              last_edited_time: t,
              last_edited_by_id: session.userId,
              last_edited_by_table: 'notion_user',
              space_id: session.spaceId,
              permissions: editorPermission(session)
            }
          },
          {
            pointer: { table: 'collection_view', id: collectionViewId, spaceId: session.spaceId },
            command: 'set',
            path: [],
            args: {
              id: collectionViewId,
              version: 1,
              type: 'table',
              name: 'Default view',
              parent_id: collectionViewPageId,
              parent_table: 'block',
              alive: true,
              page_sort: [],
              space_id: session.spaceId
            }
          },
          {
            pointer: { table: 'block', id: a.parent_page_id, spaceId: session.spaceId },
            command: 'listAfter',
            path: ['content'],
            args: { id: collectionViewPageId }
          }
        ];
        var saved = await saveTransactions(ctx, session, operations, 'notion.create_database');
        if (saved.error) { return saved.error; }
        var verified = await getRecordValues(ctx, session, [{ id: collectionId, table: 'collection' }], 'notion.create_database');
        if (verified.error) { return verified.error; }
        var record = recordValue(verified.data, 0);
        if (!record) { return rpcFallback('notion.create_database', 'notion-created-database-missing'); }
        return databaseResponse(collectionId, a.title, record);
      }
    },

    // ---- notion.create_database_item (write) ------------------------------
    'notion.create_database_item': {
      tier: 'T1a',
      origin: NOTION_ORIGIN,
      sideEffectClass: 'write',
      params: CREATE_DATABASE_ITEM_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var resolved = await resolveSession(ctx, 'notion.create_database_item');
        if (resolved.error) { return resolved.error; }
        var session = resolved.session;
        var coll = await getRecordValues(ctx, session, [{ id: a.database_id, table: 'collection' }], 'notion.create_database_item');
        if (coll.error) { return coll.error; }
        var collData = recordValue(coll.data, 0);
        if (!collData) {
          return rpcFallback('notion.create_database_item', 'notion-database-missing');
        }
        var parentId = collData.parent_id;
        if (!parentId) {
          return rpcFallback('notion.create_database_item', 'notion-database-parent-missing');
        }
        var itemId = randomUuid();
        var itemProperties = mapDatabaseProperties(collData.schema || {}, a.title, a.properties);
        var operations = [
          {
            pointer: { table: 'block', id: itemId, spaceId: session.spaceId },
            command: 'set',
            path: [],
            args: blockArgs(itemId, 'page', a.database_id, 'collection', session, {
              properties: itemProperties
            })
          },
          {
            pointer: { table: 'block', id: parentId, spaceId: session.spaceId },
            command: 'listAfter',
            path: ['content'],
            args: { id: itemId }
          }
        ];
        var saved = await saveTransactions(ctx, session, operations, 'notion.create_database_item');
        if (saved.error) { return saved.error; }
        var verified = await getRecordValues(ctx, session, [{ id: itemId, table: 'block' }], 'notion.create_database_item');
        if (verified.error) { return verified.error; }
        var record = recordValue(verified.data, 0);
        if (!record) { return rpcFallback('notion.create_database_item', 'notion-created-database-item-missing'); }
        return itemResponse(itemId, a.title, record);
      }
    }
  };

  // ---- Self-registration into the catalog (shipped SW path) ----------------
  // IN-03 note: the head registers descriptor.service as the app subdomain
  // 'app.notion.com' (the first-party origin the spec pins), whereas the breadth
  // opentabs__notion__*.json descriptor records the bare registrable domain
  // 'notion.so'. These are intentionally different fields -- resolve() upgrades
  // dom->T1a on the byte-exact SLUG (not the service string), and the origin-pin
  // uses the spec's origin, so the distinction is cosmetic, not a mismatch.
  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: { slug: slug, service: 'app.notion.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerNotion = handlers;   // SW importScripts consumer reads this global
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;          // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
