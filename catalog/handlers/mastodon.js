(function (global) {
  'use strict';

  /**
   * Mastodon same-origin API head.
   *
   * GET rows use mastodon.social /api/v1 through executeBoundSpec with
   * same-origin cookies. Status creation and deletion stay guarded fail-closed
   * until live mutation-body UAT records and approves their request shapes.
   */

  var ORIGIN = 'https://mastodon.social';
  var SERVICE = 'mastodon.social';
  var API_BASE = ORIGIN + '/api/v1';
  var INT_LIMIT = 9007199254740991;

  var STATUS_ID_PARAMS = schema({
    status_id: { type: 'string', minLength: 1, description: 'Status ID' }
  }, ['status_id']);

  var TIMELINE_PARAMS = schema({
    max_id: { type: 'string', description: 'Return results older than this status ID' },
    limit: integerSchema('Maximum number of statuses to return', 1, 40)
  }, []);

  var CREATE_STATUS_PARAMS = schema({
    status: { type: 'string', minLength: 1, description: 'Text content to publish' },
    visibility: {
      type: 'string',
      enum: ['public', 'unlisted', 'private', 'direct'],
      description: 'Status visibility'
    },
    in_reply_to_id: { type: 'string', description: 'Status ID to reply to' },
    spoiler_text: { type: 'string', description: 'Content-warning text' }
  }, ['status']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
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
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'mastodon-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors) ||
      isObject(data.error)
    );
  }

  function stripTags(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function stringValue(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function numberOrNull(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function pathPart(value) {
    return encodeURIComponent(String(value || '').trim());
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

  function getSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function normalizeAccount(account) {
    if (!isObject(account)) {
      return { id: '', username: stringValue(account), acct: stringValue(account), display_name: '', url: '', avatar: '' };
    }
    return {
      id: stringValue(account.id),
      username: stringValue(account.username),
      acct: stringValue(account.acct || account.username),
      display_name: stringValue(account.display_name || account.username),
      url: stringValue(account.url),
      avatar: stringValue(account.avatar)
    };
  }

  function normalizeStatus(status) {
    var content = stringValue(status && status.content);
    return {
      id: stringValue(status && status.id),
      uri: stringValue(status && status.uri),
      url: stringValue(status && status.url),
      created_at: stringValue(status && status.created_at),
      content: content,
      text: stripTags(content),
      spoiler_text: stringValue(status && status.spoiler_text),
      visibility: stringValue(status && status.visibility),
      account: normalizeAccount(status && status.account),
      favourites_count: numberOrNull(status && status.favourites_count),
      reblogs_count: numberOrNull(status && status.reblogs_count),
      replies_count: numberOrNull(status && status.replies_count)
    };
  }

  function isStatusPayload(data) {
    return isObject(data) && typeof data.id === 'string' && hasOwn(data, 'content') && hasOwn(data, 'account');
  }

  function isTimelinePayload(data) {
    if (!Array.isArray(data)) { return false; }
    for (var i = 0; i < data.length; i++) {
      if (!isStatusPayload(data[i])) { return false; }
    }
    return true;
  }

  function unwrapApiResult(result, slug, guard, mapper) {
    if (!result || result.success !== true) { return result || fallback(slug, 'mastodon-api-unavailable'); }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'mastodon-api-logged-out');
    }
    if (typeof result.status === 'number' && result.status >= 400) {
      return fallback(slug, 'mastodon-api-http-error');
    }
    var data = result.data;
    if (looksLikeError(data) || (typeof guard === 'function' && !guard(data))) {
      return fallback(slug, 'mastodon-api-shape-mismatch');
    }
    return {
      success: true,
      status: result.status,
      finalUrl: result.finalUrl,
      redirected: result.redirected,
      data: typeof mapper === 'function' ? mapper(data) : data
    };
  }

  function readHandler(slug, params, pathForArgs, pairsForArgs, guard, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'mastodon-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var path = typeof pathForArgs === 'function' ? pathForArgs(a) : pathForArgs;
        if (!path) { return fallback(slug, 'mastodon-invalid-args'); }
        var pairs = typeof pairsForArgs === 'function' ? pairsForArgs(a) : [];
        var result = await ctx.executeBoundSpec(getSpec(path, pairs), ctx.tabId);
        return unwrapApiResult(result, slug, guard, mapper);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'mastodon.get_status': readHandler(
      'mastodon.get_status',
      STATUS_ID_PARAMS,
      function(a) { return '/statuses/' + pathPart(a.status_id); },
      null,
      isStatusPayload,
      function(data) { return { status: normalizeStatus(data) }; }
    ),
    'mastodon.list_timeline': readHandler(
      'mastodon.list_timeline',
      TIMELINE_PARAMS,
      '/timelines/home',
      function(a) { return [['max_id', a.max_id], ['limit', a.limit]]; },
      isTimelinePayload,
      function(data) {
        var statuses = [];
        for (var i = 0; i < data.length; i++) { statuses.push(normalizeStatus(data[i])); }
        return { statuses: statuses };
      }
    ),
    'mastodon.create_status': guarded(
      'mastodon.create_status',
      'write',
      CREATE_STATUS_PARAMS,
      'unverified-mastodon-create-status-mutation'
    ),
    'mastodon.delete_status': guarded(
      'mastodon.delete_status',
      'destructive',
      STATUS_ID_PARAMS,
      'unverified-mastodon-delete-status-mutation'
    )
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
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerMastodon = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
