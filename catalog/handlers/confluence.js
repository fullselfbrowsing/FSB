(function (global) {
  'use strict';

  /**
   * Confluence Cloud tenant same-origin REST READ head.
   *
   * Confluence Cloud lives on per-tenant *.atlassian.net origins and its Cloud
   * REST APIs are same-origin paths under the tenant, usually under /wiki. The
   * static readiness gates use a representative tenant, while runtime requests
   * derive the actual tenant origin and context path from the active router
   * context before building a bound same-origin-cookie spec. Mutations remain
   * guarded fail-closed until live mutation-body UAT exists.
   */

  var REPRESENTATIVE_ORIGIN = 'https://example.atlassian.net';
  var SERVICE = 'atlassian.net';
  var CONTEXT_PATH = '/wiki';
  var API_V2_BASE = '/api/v2';
  var API_V1_BASE = '/rest/api';
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

  function numberField(description) {
    var out = { type: 'number' };
    if (description) { out.description = description; }
    return out;
  }

  function boolField(description) {
    var out = { type: 'boolean' };
    if (description) { out.description = description; }
    return out;
  }

  var PAGE_ID = stringField('Confluence page ID');
  var SPACE_ID = stringField('Confluence space ID');
  var COMMENT_ID = stringField('Confluence comment ID');
  var LIMIT = numberField('Maximum number of results');
  var CURSOR = stringField('Pagination cursor');
  var BODY_FORMAT = stringField('Body format: storage or atlas_doc_format');
  var EMPTY_PARAMS = schema({});

  var GET_PAGE_PARAMS = schema({
    page_id: PAGE_ID,
    include_body: boolField('Whether to include page body content')
  }, ['page_id']);
  var GET_PAGE_CHILDREN_PARAMS = schema({ page_id: PAGE_ID, limit: LIMIT, cursor: CURSOR }, ['page_id']);
  var GET_SPACE_PARAMS = schema({ space_id: SPACE_ID }, ['space_id']);
  var GET_USER_PROFILE_PARAMS = schema({
    account_id: stringField('Atlassian account ID; omit for the current user')
  });
  var LIST_COMMENT_REPLIES_PARAMS = schema({
    comment_id: COMMENT_ID,
    comment_type: stringField('Parent comment type: inline or footer'),
    limit: LIMIT,
    cursor: CURSOR,
    body_format: BODY_FORMAT
  }, ['comment_id', 'comment_type']);
  var LIST_COMMENTS_PARAMS = schema({
    page_id: PAGE_ID,
    limit: LIMIT,
    cursor: CURSOR,
    body_format: BODY_FORMAT
  }, ['page_id']);
  var LIST_INLINE_COMMENTS_PARAMS = schema({
    page_id: PAGE_ID,
    resolution_status: stringField('Resolution status filter'),
    limit: LIMIT,
    cursor: CURSOR,
    body_format: BODY_FORMAT
  }, ['page_id']);
  var LIST_PAGE_PARAMS = schema({
    page_id: PAGE_ID,
    limit: LIMIT,
    cursor: CURSOR
  }, ['page_id']);
  var LIST_PAGES_PARAMS = schema({
    space_id: SPACE_ID,
    limit: LIMIT,
    sort: stringField('Sort order'),
    cursor: CURSOR
  });
  var LIST_SPACES_PARAMS = schema({ limit: LIMIT, cursor: CURSOR });
  var SEARCH_PARAMS = schema({
    cql: stringField('Confluence Query Language query'),
    limit: LIMIT,
    start: numberField('Start index for pagination')
  }, ['cql']);

  var ADD_LABEL_PARAMS = schema({ page_id: PAGE_ID, label: stringField('Label name') }, ['page_id', 'label']);
  var CREATE_COMMENT_PARAMS = schema({
    page_id: PAGE_ID,
    parent_comment_id: COMMENT_ID,
    body: stringField('Comment body')
  }, ['body']);
  var CREATE_INLINE_COMMENT_PARAMS = schema({
    page_id: PAGE_ID,
    body: stringField('Comment body'),
    text_selection: stringField('Selected text'),
    text_selection_match_count: numberField('Number of selection matches'),
    text_selection_match_index: numberField('Selected match index')
  }, ['page_id', 'body', 'text_selection', 'text_selection_match_count', 'text_selection_match_index']);
  var CREATE_PAGE_PARAMS = schema({
    space_id: SPACE_ID,
    title: stringField('Page title'),
    body: stringField('Page body in Confluence storage format'),
    parent_id: PAGE_ID,
    status: stringField('Page status')
  }, ['space_id', 'title', 'body']);
  var DELETE_COMMENT_PARAMS = schema({ comment_id: COMMENT_ID }, ['comment_id']);
  var DELETE_PAGE_PARAMS = schema({ page_id: PAGE_ID }, ['page_id']);
  var REMOVE_LABEL_PARAMS = schema({ page_id: PAGE_ID, label_name: stringField('Label name') }, ['page_id', 'label_name']);
  var UPDATE_PAGE_PARAMS = schema({
    page_id: PAGE_ID,
    title: stringField('Page title'),
    body: stringField('Page body in Confluence storage format'),
    version_number: numberField('Current page version number'),
    version_message: stringField('Version message'),
    status: stringField('Page status')
  }, ['page_id', 'title', 'body', 'version_number']);

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
    return encodeURIComponent(String(value));
  }

  function firstDefined(value, fallbackValue) {
    return value === undefined || value === null || value === '' ? fallbackValue : value;
  }

  function buildQuery(query) {
    var parts = [];
    var q = query || {};
    for (var key in q) {
      if (!Object.prototype.hasOwnProperty.call(q, key)) { continue; }
      var value = q[key];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function atlassianTenantOrigin(value) {
    var raw = String(value || '');
    try {
      var parsed = new URL(raw);
      var host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:') { return ''; }
      if (host === 'atlassian.net' || host.slice(-14) !== '.atlassian.net') { return ''; }
      return parsed.origin;
    } catch (e) {
      return '';
    }
  }

  function originFromContext(ctx) {
    var fields = ['origin', 'activeOrigin'];
    var i;
    for (i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string') {
        var origin = atlassianTenantOrigin(value);
        if (origin) { return origin; }
      }
    }
    fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (i = 0; i < fields.length; i++) {
      var url = ctx && ctx[fields[i]];
      if (typeof url === 'string') {
        var derived = atlassianTenantOrigin(url);
        if (derived) { return derived; }
      }
    }
    return '';
  }

  function contextPathFromContext(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl', 'baseUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value !== 'string' || !value) { continue; }
      try {
        var parsed = new URL(value);
        if (!atlassianTenantOrigin(parsed.origin)) { continue; }
        if (parsed.pathname === CONTEXT_PATH || parsed.pathname.indexOf(CONTEXT_PATH + '/') === 0) {
          return CONTEXT_PATH;
        }
      } catch (e) {
        /* fall through to Cloud default */
      }
    }
    return CONTEXT_PATH;
  }

  function buildGetSpec(origin, contextPath, apiBase, endpoint, query) {
    return {
      url: origin + contextPath + apiBase + endpoint + buildQuery(query),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: origin,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  function looksLikeConfluenceError(data) {
    return isObject(data) && (
      isObject(data.error) ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors) ||
      Array.isArray(data.errorMessages)
    );
  }

  function guard(result, slug, predicate) {
    if (resultFailed(result)) {
      return result && result.success === false ? result : fallback(slug, 'confluence-http-or-auth-failed');
    }
    var data = result.data;
    if (looksLikeConfluenceError(data) || !predicate(data)) {
      return fallback(slug, 'confluence-logged-out-or-shape-mismatch');
    }
    return result;
  }

  function hasAnyKey(data, keys) {
    if (!isObject(data)) { return false; }
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, keys[i])) { return true; }
    }
    return false;
  }

  function hasResults(data) {
    return isObject(data) && Array.isArray(data.results);
  }

  function readHandler(slug, params, apiBase, endpoint, queryForArgs, predicate) {
    return {
      tier: 'T1a',
      origin: REPRESENTATIVE_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'confluence-execute-bound-spec-unavailable');
        }
        var origin = originFromContext(ctx);
        if (!origin) { return fallback(slug, 'confluence-tenant-origin-unavailable'); }
        var input = args || {};
        var spec = buildGetSpec(
          origin,
          contextPathFromContext(ctx),
          apiBase,
          endpoint(input),
          queryForArgs ? queryForArgs(input) : {}
        );
        var res = await ctx.executeBoundSpec(spec, ctx.tabId);
        return guard(res, slug, predicate);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: REPRESENTATIVE_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'confluence.get_page': readHandler('confluence.get_page', GET_PAGE_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id);
    }, function(a) {
      return a.include_body ? { 'body-format': 'storage' } : {};
    }, function(data) {
      return hasAnyKey(data, ['id', 'title', 'spaceId']);
    }),
    'confluence.get_page_children': readHandler('confluence.get_page_children', GET_PAGE_CHILDREN_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id) + '/children';
    }, function(a) {
      return { limit: firstDefined(a.limit, 25), cursor: a.cursor };
    }, hasResults),
    'confluence.get_space': readHandler('confluence.get_space', GET_SPACE_PARAMS, API_V2_BASE, function(a) {
      return '/spaces/' + encodeSegment(a.space_id);
    }, null, function(data) {
      return hasAnyKey(data, ['id', 'key', 'name']);
    }),
    'confluence.get_user_profile': readHandler('confluence.get_user_profile', GET_USER_PROFILE_PARAMS, API_V1_BASE, function(a) {
      return a.account_id ? '/user' : '/user/current';
    }, function(a) {
      return a.account_id ? { accountId: a.account_id } : {};
    }, function(data) {
      return hasAnyKey(data, ['accountId', 'displayName', 'publicName']);
    }),
    'confluence.list_comment_replies': readHandler('confluence.list_comment_replies', LIST_COMMENT_REPLIES_PARAMS, API_V2_BASE, function(a) {
      var commentType = a.comment_type === 'inline' ? 'inline' : 'footer';
      return '/' + commentType + '-comments/' + encodeSegment(a.comment_id) + '/children';
    }, function(a) {
      return {
        limit: firstDefined(a.limit, 25),
        cursor: a.cursor,
        'body-format': firstDefined(a.body_format, 'storage')
      };
    }, hasResults),
    'confluence.list_comments': readHandler('confluence.list_comments', LIST_COMMENTS_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id) + '/footer-comments';
    }, function(a) {
      return {
        limit: firstDefined(a.limit, 25),
        cursor: a.cursor,
        'body-format': firstDefined(a.body_format, 'storage')
      };
    }, hasResults),
    'confluence.list_inline_comments': readHandler('confluence.list_inline_comments', LIST_INLINE_COMMENTS_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id) + '/inline-comments';
    }, function(a) {
      return {
        limit: firstDefined(a.limit, 25),
        cursor: a.cursor,
        'body-format': firstDefined(a.body_format, 'storage'),
        'resolution-status': a.resolution_status
      };
    }, hasResults),
    'confluence.list_labels': readHandler('confluence.list_labels', LIST_PAGE_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id) + '/labels';
    }, function(a) {
      return { limit: firstDefined(a.limit, 25), cursor: a.cursor };
    }, hasResults),
    'confluence.list_page_attachments': readHandler('confluence.list_page_attachments', LIST_PAGE_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id) + '/attachments';
    }, function(a) {
      return { limit: firstDefined(a.limit, 25), cursor: a.cursor };
    }, hasResults),
    'confluence.list_page_versions': readHandler('confluence.list_page_versions', LIST_PAGE_PARAMS, API_V2_BASE, function(a) {
      return '/pages/' + encodeSegment(a.page_id) + '/versions';
    }, function(a) {
      return { limit: firstDefined(a.limit, 25), cursor: a.cursor };
    }, hasResults),
    'confluence.list_pages': readHandler('confluence.list_pages', LIST_PAGES_PARAMS, API_V2_BASE, function(a) {
      return a.space_id ? '/spaces/' + encodeSegment(a.space_id) + '/pages' : '/pages';
    }, function(a) {
      return {
        limit: firstDefined(a.limit, 25),
        sort: a.sort,
        cursor: a.cursor
      };
    }, hasResults),
    'confluence.list_spaces': readHandler('confluence.list_spaces', LIST_SPACES_PARAMS, API_V2_BASE, function() {
      return '/spaces';
    }, function(a) {
      return { limit: firstDefined(a.limit, 25), cursor: a.cursor };
    }, hasResults),
    'confluence.search': readHandler('confluence.search', SEARCH_PARAMS, API_V1_BASE, function() {
      return '/search';
    }, function(a) {
      return {
        cql: a.cql,
        limit: firstDefined(a.limit, 25),
        start: firstDefined(a.start, 0)
      };
    }, function(data) {
      return isObject(data) && Array.isArray(data.results);
    }),

    'confluence.add_label': guarded('confluence.add_label', 'write', ADD_LABEL_PARAMS, 'unverified-confluence-add-label-mutation'),
    'confluence.create_comment': guarded('confluence.create_comment', 'write', CREATE_COMMENT_PARAMS, 'unverified-confluence-create-comment-mutation'),
    'confluence.create_inline_comment': guarded('confluence.create_inline_comment', 'write', CREATE_INLINE_COMMENT_PARAMS, 'unverified-confluence-create-inline-comment-mutation'),
    'confluence.create_page': guarded('confluence.create_page', 'write', CREATE_PAGE_PARAMS, 'unverified-confluence-create-page-mutation'),
    'confluence.delete_comment': guarded('confluence.delete_comment', 'destructive', DELETE_COMMENT_PARAMS, 'unverified-confluence-delete-comment-mutation'),
    'confluence.delete_page': guarded('confluence.delete_page', 'destructive', DELETE_PAGE_PARAMS, 'unverified-confluence-delete-page-mutation'),
    'confluence.remove_label': guarded('confluence.remove_label', 'destructive', REMOVE_LABEL_PARAMS, 'unverified-confluence-remove-label-mutation'),
    'confluence.update_page': guarded('confluence.update_page', 'write', UPDATE_PAGE_PARAMS, 'unverified-confluence-update-page-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
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

  global.FsbHandlerConfluence = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
