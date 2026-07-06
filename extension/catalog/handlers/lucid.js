(function (global) {
  'use strict';

  /**
   * Lucid first-party authenticated READ head.
   *
   * Lucid's vendored runtime reads user/account ids from cookies before calling
   * first-party API subdomains. This bundled head does not read cookies directly:
   * it bootstraps ids from the authenticated Lucid documents page via a bound
   * read and fails closed when ids cannot be derived. Mutations stay guarded
   * fail-closed until live mutation-body UAT records their exact request shape.
   */

  var LUCID_ORIGIN = 'https://lucid.app';
  var LUCID_SERVICE = 'lucid.app';
  var USERS_BASE = 'https://users.lucid.app';
  var DOCS_BASE = 'https://documents.lucid.app';
  var DOCLIST_BASE = 'https://userdocslist.lucid.app';
  var INT_LIMIT = 9007199254740991;
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

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
    var out = { type: 'string' };
    if (description) { out.description = description; }
    return out;
  }

  function intField(description, min, max) {
    var out = {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max
    };
    if (description) { out.description = description; }
    return out;
  }

  var EMPTY_PARAMS = schema({});
  var PRODUCT_PARAMS = schema({
    product: {
      type: 'string',
      enum: ['chart', 'press', 'spark'],
      description: 'Product type (default: chart)'
    }
  });
  var DOCUMENT_PARAMS = schema({
    document_id: stringField('Document UUID')
  }, ['document_id']);
  var FOLDER_ENTRY_PARAMS = schema({
    entry_id: stringField('Folder entry ID')
  }, ['entry_id']);
  var LIST_DOCUMENTS_PARAMS = schema({
    product: {
      type: 'string',
      enum: ['chart', 'press', 'spark'],
      description: 'Product type to filter by (default: chart)'
    },
    search: stringField('Search query to filter documents by title')
  });
  var LIST_FOLDER_ENTRIES_PARAMS = schema({
    parent_id: stringField('Parent folder entry ID to list children of')
  });
  var SEARCH_DOCUMENTS_PARAMS = schema({
    query: stringField('Search query text'),
    count: intField('Maximum number of results to return (default 20, max 100)', 1, 100),
    product: {
      type: 'string',
      enum: ['chart', 'press', 'spark'],
      description: 'Filter by product type'
    }
  }, ['query']);

  var CREATE_DOCUMENT_PARAMS = schema({
    title: stringField('Document title'),
    product: {
      type: 'string',
      enum: ['chart', 'press'],
      description: 'Product type: chart (Lucidchart) or press (Lucidspark). Default: chart'
    }
  }, ['title']);
  var CREATE_FOLDER_PARAMS = schema({
    name: stringField('Folder name'),
    parent_id: stringField('Parent folder entry ID for nesting')
  }, ['name']);
  var MOVE_DOCUMENT_PARAMS = schema({
    document_id: stringField('Document UUID to move'),
    folder_id: stringField('Target folder entry ID')
  }, ['document_id', 'folder_id']);
  var RENAME_FOLDER_PARAMS = schema({
    entry_id: stringField('Folder entry ID to rename'),
    name: stringField('New folder name')
  }, ['entry_id', 'name']);

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
      reason: reason || 'lucid-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function jsonSpec(base, path, pairs) {
    return {
      url: base + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: LUCID_ORIGIN,
      extract: '@'
    };
  }

  function textSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json,text/plain,*/*' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: LUCID_ORIGIN,
      extract: null
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeError(value) {
    return isObject(value) && (
      typeof value.error === 'string' ||
      typeof value.message === 'string' ||
      Array.isArray(value.errors) ||
      isObject(value.error)
    );
  }

  function stringFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  function tryParseJson(text) {
    if (typeof text !== 'string' || !text) { return null; }
    try { return JSON.parse(text); } catch (_e) { return null; }
  }

  function dataFromResult(result, slug, allowText) {
    if (!result || result.success !== true) {
      return fallback(slug, 'lucid-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'lucid-http-error');
    }
    if (result.data !== undefined && result.data !== null) { return result.data; }
    if (allowText) {
      var text = stringFromResult(result);
      if (text) { return tryParseJson(text) || text; }
    }
    return fallback(slug, 'lucid-empty-response');
  }

  function guardObject(data) {
    return isObject(data) && !looksLikeError(data);
  }

  function guardArray(data) {
    return Array.isArray(data);
  }

  function guardPermissions(data) {
    return guardObject(data) && (!Object.prototype.hasOwnProperty.call(data, 'permissions') ||
      Array.isArray(data.permissions));
  }

  function guardCount(data) {
    return guardObject(data) && (data.count === undefined || typeof data.count === 'number');
  }

  function guardSearch(data) {
    return guardObject(data) && (!Object.prototype.hasOwnProperty.call(data, 'documents') ||
      Array.isArray(data.documents));
  }

  function getPathValue(obj, path) {
    var value = obj;
    for (var i = 0; i < path.length; i++) {
      if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, path[i])) {
        return '';
      }
      value = value[path[i]];
    }
    return value === undefined || value === null ? '' : String(value);
  }

  function firstObjectValue(obj, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = getPathValue(obj, paths[i]);
      if (value) { return value; }
    }
    return '';
  }

  function regexFirst(text, patterns) {
    if (typeof text !== 'string' || !text) { return ''; }
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1]) { return m[1]; }
    }
    return '';
  }

  function authFromPayload(payload, rawText) {
    var obj = isObject(payload) ? payload : tryParseJson(rawText);
    var userId = '';
    var accountId = '';
    if (obj) {
      userId = firstObjectValue(obj, [
        ['userId'], ['user_id'], ['currentUser', 'id'], ['user', 'id'],
        ['bootstrap', 'userId'], ['viewer', 'userId']
      ]);
      accountId = firstObjectValue(obj, [
        ['accountId'], ['account_id'], ['account', 'id'], ['currentAccount', 'id'],
        ['bootstrap', 'accountId'], ['viewer', 'accountId']
      ]);
    }
    if (!userId) {
      userId = regexFirst(rawText, [
        /["']userId["']\s*:\s*["']([^"']+)["']/,
        /["']user_id["']\s*:\s*["']([^"']+)["']/,
        /userId=([^&"'<\s]+)/,
        /data-user-id=["']([^"']+)["']/
      ]);
    }
    if (!accountId) {
      accountId = regexFirst(rawText, [
        /["']accountId["']\s*:\s*["']([^"']+)["']/,
        /["']account_id["']\s*:\s*["']([^"']+)["']/,
        /account_id=([^&"'<\s]+)/,
        /data-account-id=["']([^"']+)["']/
      ]);
    }
    return userId && accountId ? { userId: userId, accountId: accountId } : null;
  }

  async function getAuth(slug, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'lucid-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(textSpec(LUCID_ORIGIN + '/documents'), ctx.tabId);
    var data = dataFromResult(res, slug, true);
    if (!data || data.success === false) { return data; }
    var rawText = stringFromResult(res);
    var auth = authFromPayload(data, rawText);
    if (!auth) { return fallback(slug, 'lucid-auth-bootstrap-missing'); }
    return auth;
  }

  async function callRead(slug, ctx, spec, guard, transform, allowText) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'lucid-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    var data = dataFromResult(res, slug, allowText);
    if (!data || data.success === false) { return data; }
    if (typeof transform === 'function') {
      data = transform(data);
    }
    if (typeof guard === 'function' && !guard(data)) {
      return fallback(slug, 'lucid-api-shape-mismatch');
    }
    return { success: true, status: res.status, data: data };
  }

  function readHandler(slug, params, specFn, guard, transform, needsAuth, allowText) {
    return {
      tier: 'T1a',
      origin: LUCID_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var auth = null;
        if (needsAuth) {
          auth = await getAuth(slug, ctx);
          if (!auth || auth.success === false) { return auth; }
        }
        return callRead(slug, ctx, specFn(a, auth), guard, transform, allowText);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: LUCID_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function productOrChart(args) {
    return args && args.product ? args.product : 'chart';
  }

  function roleText(data) {
    if (typeof data === 'string') {
      var parsed = tryParseJson(data);
      return { role: typeof parsed === 'string' ? parsed : data };
    }
    return data;
  }

  var handlers = {
    'lucid.get_account': readHandler('lucid.get_account', EMPTY_PARAMS, function (_a, auth) {
      return jsonSpec(USERS_BASE, '/accounts/' + encodeSegment(auth.accountId));
    }, guardObject, null, true),
    'lucid.get_current_user': readHandler('lucid.get_current_user', EMPTY_PARAMS, function (_a, auth) {
      return jsonSpec(USERS_BASE, '/users/' + encodeSegment(auth.userId));
    }, guardObject, null, true),
    'lucid.get_document': readHandler('lucid.get_document', DOCUMENT_PARAMS, function (a) {
      return jsonSpec(DOCS_BASE, '/documents/' + encodeSegment(a.document_id));
    }, guardObject),
    'lucid.get_document_count': readHandler('lucid.get_document_count', PRODUCT_PARAMS, function (a, auth) {
      return jsonSpec(DOCS_BASE, '/users/' + encodeSegment(auth.userId) + '/documents/' +
        encodeSegment(productOrChart(a)) + '/count');
    }, guardCount, null, true),
    'lucid.get_document_pages': readHandler('lucid.get_document_pages', DOCUMENT_PARAMS, function (a) {
      return jsonSpec(DOCS_BASE, '/documents/' + encodeSegment(a.document_id) + '/pages');
    }, guardArray),
    'lucid.get_document_role': readHandler('lucid.get_document_role', DOCUMENT_PARAMS, function (a) {
      return textSpec(DOCS_BASE + '/documents/' + encodeSegment(a.document_id) + '/role');
    }, guardObject, roleText, false, true),
    'lucid.get_document_status': readHandler('lucid.get_document_status', DOCUMENT_PARAMS, function (a) {
      return jsonSpec(DOCS_BASE, '/documents/' + encodeSegment(a.document_id) + '/status');
    }, guardObject),
    'lucid.get_folder_entry': readHandler('lucid.get_folder_entry', FOLDER_ENTRY_PARAMS, function (a, auth) {
      return jsonSpec(DOCS_BASE, '/users/' + encodeSegment(auth.userId) +
        '/folderEntries/' + encodeSegment(a.entry_id));
    }, guardObject, null, true),
    'lucid.get_user_permissions': readHandler('lucid.get_user_permissions', EMPTY_PARAMS, function (_a, auth) {
      return jsonSpec(USERS_BASE, '/users/' + encodeSegment(auth.userId) + '/permissions');
    }, guardPermissions, null, true),
    'lucid.list_account_users': readHandler('lucid.list_account_users', EMPTY_PARAMS, function (_a, auth) {
      return jsonSpec(USERS_BASE, '/accounts/' + encodeSegment(auth.accountId) + '/userList');
    }, guardArray, null, true),
    'lucid.list_documents': readHandler('lucid.list_documents', LIST_DOCUMENTS_PARAMS, function (a, auth) {
      return jsonSpec(DOCS_BASE, '/users/' + encodeSegment(auth.userId) +
        '/documents/' + encodeSegment(productOrChart(a)), [['search', a.search]]);
    }, guardArray, null, true),
    'lucid.list_folder_entries': readHandler('lucid.list_folder_entries', LIST_FOLDER_ENTRIES_PARAMS, function (a, auth) {
      return jsonSpec(DOCS_BASE, '/users/' + encodeSegment(auth.userId) +
        '/folderEntries/chart', [['parent', a.parent_id]]);
    }, guardArray, null, true),
    'lucid.list_groups': readHandler('lucid.list_groups', EMPTY_PARAMS, function (_a, auth) {
      return jsonSpec(USERS_BASE, '/groups', [['userId', auth.userId]]);
    }, guardArray, null, true),
    'lucid.search_documents': readHandler('lucid.search_documents', SEARCH_DOCUMENTS_PARAMS, function (a, auth) {
      return jsonSpec(DOCLIST_BASE, '/users/' + encodeSegment(auth.userId) + '/documentList', [
        ['search', a.query],
        ['count', a.count || 20],
        ['product', a.product]
      ]);
    }, guardSearch, null, true),

    'lucid.create_document': guarded('lucid.create_document', 'write', CREATE_DOCUMENT_PARAMS, 'unverified-lucid-create-document-mutation'),
    'lucid.create_folder': guarded('lucid.create_folder', 'write', CREATE_FOLDER_PARAMS, 'unverified-lucid-create-folder-mutation'),
    'lucid.delete_folder': guarded('lucid.delete_folder', 'destructive', FOLDER_ENTRY_PARAMS, 'unverified-lucid-delete-folder-mutation'),
    'lucid.move_document_to_folder': guarded('lucid.move_document_to_folder', 'write', MOVE_DOCUMENT_PARAMS, 'unverified-lucid-move-document-to-folder-mutation'),
    'lucid.rename_folder': guarded('lucid.rename_folder', 'write', RENAME_FOLDER_PARAMS, 'unverified-lucid-rename-folder-mutation'),
    'lucid.trash_document': guarded('lucid.trash_document', 'write', DOCUMENT_PARAMS, 'unverified-lucid-trash-document-mutation')
  };

  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: LUCID_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerLucid = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
