(function (global) {
  'use strict';

  /**
   * Tumblr same-origin READ head.
   *
   * Tumblr's web app exposes a first-party /api/v2 surface on www.tumblr.com.
   * The page bootstrap stores the browser-session API token in ___INITIAL_STATE___.
   * This handler extracts that carrier from a same-origin page read, uses it only
   * inside bound /api/v2 read specs, and never logs or returns it. Write and
   * destructive rows stay guarded fail-closed until live mutation-body UAT exists.
   */

  var TUMBLR_ORIGIN = 'https://www.tumblr.com';
  var TUMBLR_SERVICE = 'tumblr.com';
  var API_BASE = TUMBLR_ORIGIN + '/api/v2';
  var INT_LIMIT = 9007199254740991;
  var VERSION_HEADER = 'redpop/3/0//redpop/';

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var BLOG_NAME = { type: 'string', minLength: 1, description: 'Blog name or URL' };
  var POST_ID = { type: 'string', minLength: 1, description: 'Post ID' };
  var LIMIT_20 = integerSchema('Number of items to return', 1, 20);
  var OFFSET = integerSchema('Offset for pagination', 0, INT_LIMIT);

  var BLOG_PARAMS = withProps({ blog_name: BLOG_NAME }, ['blog_name']);
  var BLOG_PAGE_PARAMS = withProps({ blog_name: BLOG_NAME, limit: LIMIT_20, offset: OFFSET }, ['blog_name']);
  var BLOG_NOTIFICATIONS_PARAMS = withProps({
    blog_name: BLOG_NAME,
    before: { type: 'number', description: 'Unix timestamp pagination cursor' }
  }, ['blog_name']);
  var BLOG_POSTS_PARAMS = withProps({
    blog_name: BLOG_NAME,
    limit: LIMIT_20,
    offset: OFFSET,
    type: { type: 'string', enum: ['text', 'photo', 'quote', 'link', 'chat', 'audio', 'video'] },
    tag: { type: 'string' }
  }, ['blog_name']);
  var DASHBOARD_PARAMS = withProps({
    limit: LIMIT_20,
    offset: OFFSET,
    type: { type: 'string', enum: ['text', 'photo', 'quote', 'link', 'chat', 'audio', 'video', 'answer'] },
    since_id: { type: 'string' }
  }, []);
  var DRAFT_PARAMS = withProps({
    blog_name: BLOG_NAME,
    before_id: { type: 'string', description: 'Post ID cursor' }
  }, ['blog_name']);
  var POST_PARAMS = withProps({ blog_name: BLOG_NAME, post_id: POST_ID }, ['blog_name', 'post_id']);
  var POST_NOTES_PARAMS = withProps({
    blog_name: BLOG_NAME,
    post_id: POST_ID,
    mode: { type: 'string', enum: ['all', 'likes', 'conversation', 'reblog_with_tags', 'reblogs_with_tags'] }
  }, ['blog_name', 'post_id']);
  var QUEUE_PARAMS = withProps({ blog_name: BLOG_NAME, limit: LIMIT_20, offset: OFFSET }, ['blog_name']);
  var RECOMMENDED_PARAMS = withProps({ limit: LIMIT_20 }, []);
  var SUBMISSIONS_PARAMS = withProps({ blog_name: BLOG_NAME, offset: OFFSET }, ['blog_name']);
  var USER_PAGE_PARAMS = withProps({ limit: LIMIT_20, offset: OFFSET }, []);
  var TAGGED_PARAMS = withProps({
    tag: { type: 'string', minLength: 1, description: 'Tag to search without # prefix' },
    limit: LIMIT_20,
    before: { type: 'number', description: 'Unix timestamp pagination cursor' }
  }, ['tag']);

  var FILTER_TAG_PARAMS = withProps({
    tag: { type: 'string', minLength: 1, description: 'Tag to filter' }
  }, ['tag']);
  var BLOCK_BLOG_PARAMS = withProps({
    blog_name: BLOG_NAME,
    blocked_blog: { type: 'string', minLength: 1, description: 'Blog name to block or unblock' }
  }, ['blog_name', 'blocked_blog']);
  var CREATE_POST_PARAMS = withProps({
    blog_name: BLOG_NAME,
    content: { type: 'string', minLength: 1, description: 'Text content for the post' },
    tags: { type: 'string', description: 'Comma-separated tags' },
    state: { type: 'string', enum: ['published', 'draft', 'queue', 'private'] }
  }, ['blog_name', 'content']);
  var EDIT_POST_PARAMS = withProps({
    blog_name: BLOG_NAME,
    post_id: POST_ID,
    content: { type: 'string', description: 'New text content' },
    tags: { type: 'string', description: 'Comma-separated tags' },
    state: { type: 'string', enum: ['published', 'draft', 'queue', 'private'] }
  }, ['blog_name', 'post_id']);
  var FOLLOW_PARAMS = withProps({
    url: { type: 'string', minLength: 1, description: 'Blog URL to follow or unfollow' }
  }, ['url']);
  var LIKE_PARAMS = withProps({
    post_id: POST_ID,
    reblog_key: { type: 'string', minLength: 1, description: 'Reblog key for the post' }
  }, ['post_id', 'reblog_key']);
  var REBLOG_PARAMS = withProps({
    blog_name: BLOG_NAME,
    parent_blog_name: { type: 'string', minLength: 1, description: 'Source blog name' },
    parent_post_id: POST_ID,
    reblog_key: { type: 'string', minLength: 1, description: 'Reblog key for the post' },
    comment: { type: 'string', description: 'Optional text comment' }
  }, ['blog_name', 'parent_blog_name', 'parent_post_id', 'reblog_key']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties || {},
      required: required || [],
      additionalProperties: false
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
      reason: reason || 'tumblr-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function hasOwn(obj, key) {
    return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.errors === 'string'
        || Array.isArray(data.errors)
        || (data.meta && typeof data.meta.status === 'number' && data.meta.status >= 400));
  }

  function activeUrlFromContext(ctx) {
    if (!ctx || typeof ctx !== 'object') { return ''; }
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function buildBootstrapSpec(ctx) {
    var url = activeUrlFromContext(ctx);
    try {
      if (!url || new URL(url).origin !== TUMBLR_ORIGIN) { url = TUMBLR_ORIGIN + '/dashboard'; }
    } catch (e) {
      url = TUMBLR_ORIGIN + '/dashboard';
    }
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TUMBLR_ORIGIN,
      extract: '@'
    };
  }

  function decodeJsonString(value) {
    if (typeof value !== 'string') { return ''; }
    try { return JSON.parse('"' + value.replace(/"/g, '\\"') + '"'); } catch (e) { return value; }
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (result.data && typeof result.data === 'object') {
      try { return JSON.stringify(result.data); } catch (e) { return ''; }
    }
    return '';
  }

  function parseApiTokenFromStateObject(obj) {
    if (!obj || typeof obj !== 'object') { return ''; }
    if (obj.apiFetchStore && typeof obj.apiFetchStore.API_TOKEN === 'string') {
      return obj.apiFetchStore.API_TOKEN;
    }
    if (typeof obj.API_TOKEN === 'string') { return obj.API_TOKEN; }
    return '';
  }

  function parseApiToken(text) {
    var t = String(text || '');
    var script = /<script[^>]+id=["']___INITIAL_STATE___["'][^>]*>([\s\S]*?)<\/script>/i.exec(t);
    if (script && script[1]) {
      try {
        var parsed = JSON.parse(script[1]);
        var fromState = parseApiTokenFromStateObject(parsed);
        if (fromState) { return fromState; }
      } catch (e) {
        // Fall through to regex extraction from the full bootstrap text.
      }
    }
    var patterns = [
      /["']apiFetchStore["']\s*:\s*\{[\s\S]{0,1200}?["']API_TOKEN["']\s*:\s*["']([^"']+)["']/,
      /["']API_TOKEN["']\s*:\s*["']([^"']+)["']/,
      /\bAPI_TOKEN\b\s*=\s*["']([^"']+)["']/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(t);
      if (match && match[1]) { return decodeJsonString(match[1]); }
    }
    return '';
  }

  async function bootstrapAuth(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'tumblr-execute-bound-spec-unavailable');
    }
    var boot = await ctx.executeBoundSpec(buildBootstrapSpec(ctx), ctx.tabId);
    if (!boot || boot.success !== true) { return boot || fallback(slug, 'tumblr-bootstrap-unavailable'); }
    if (boot.redirected || boot.status === 401 || boot.status === 403) {
      return fallback(slug, 'tumblr-bootstrap-logged-out');
    }
    var token = parseApiToken(textFromResult(boot));
    if (!token) { return fallback(slug, 'tumblr-bootstrap-token-unavailable'); }
    return { success: true, apiToken: token };
  }

  function appendQuery(path, pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return API_BASE + path + (parts.length ? '?' + parts.join('&') : '');
  }

  function buildApiSpec(path, pairs, apiToken) {
    return {
      url: appendQuery(path, pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json;format=camelcase',
        'Authorization': 'Bearer ' + apiToken,
        'X-Version': VERSION_HEADER
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TUMBLR_ORIGIN,
      extract: '@'
    };
  }

  function unwrapResponse(result, slug, guard) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'tumblr-api-logged-out');
    }
    var envelope = result.data;
    if (!envelope || looksLikeError(envelope)) {
      return fallback(slug, 'tumblr-api-error-envelope');
    }
    var payload = hasOwn(envelope, 'response') ? envelope.response : envelope;
    if (typeof guard === 'function' && !guard(payload)) {
      return fallback(slug, 'tumblr-api-shape-mismatch');
    }
    var out = {};
    for (var k in result) {
      if (Object.prototype.hasOwnProperty.call(result, k)) { out[k] = result[k]; }
    }
    out.data = payload;
    return out;
  }

  function hasObjectProp(name) {
    return function(payload) {
      return !!payload && typeof payload === 'object' && !Array.isArray(payload)
        && !!payload[name] && typeof payload[name] === 'object' && !Array.isArray(payload[name]);
    };
  }

  function hasArrayProp(name) {
    return function(payload) {
      return !!payload && typeof payload === 'object' && !Array.isArray(payload)
        && Array.isArray(payload[name]);
    };
  }

  function isObjectPayload(payload) {
    return !!payload && typeof payload === 'object' && !Array.isArray(payload) && !looksLikeError(payload);
  }

  function isArrayPayload(payload) {
    return Array.isArray(payload);
  }

  async function callTumblrRead(slug, path, pairs, ctx, guard) {
    var auth = await bootstrapAuth(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var res = await ctx.executeBoundSpec(buildApiSpec(path, pairs || [], auth.apiToken), ctx.tabId);
    return unwrapResponse(res, slug, guard);
  }

  function readHandler(slug, params, pathForArgs, pairsForArgs, guard) {
    return {
      tier: 'T1a',
      origin: TUMBLR_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        return callTumblrRead(slug, pathForArgs(a), pairsForArgs ? pairsForArgs(a) : [], ctx, guard || isObjectPayload);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: TUMBLR_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function enc(value) {
    return encodeURIComponent(String(value || ''));
  }

  function limitOffsetPairs(a) {
    return [
      ['limit', a.limit === undefined ? 20 : a.limit],
      ['offset', a.offset]
    ];
  }

  function postsPairs(a) {
    return [
      ['npf', true],
      ['limit', a.limit],
      ['offset', a.offset],
      ['type', a.type],
      ['tag', a.tag]
    ];
  }

  var handlers = {
    'tumblr.get_blocks': readHandler('tumblr.get_blocks', BLOG_PAGE_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/blocks';
    }, limitOffsetPairs, hasArrayProp('blockedTumblelogs')),
    'tumblr.get_blog_followers': readHandler('tumblr.get_blog_followers', BLOG_PAGE_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/followers';
    }, limitOffsetPairs, hasArrayProp('users')),
    'tumblr.get_blog_following': readHandler('tumblr.get_blog_following', BLOG_PAGE_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/following';
    }, limitOffsetPairs, hasArrayProp('blogs')),
    'tumblr.get_blog_info': readHandler('tumblr.get_blog_info', BLOG_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/info';
    }, null, hasObjectProp('blog')),
    'tumblr.get_blog_likes': readHandler('tumblr.get_blog_likes', BLOG_PAGE_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/likes';
    }, function(a) {
      return [['npf', true], ['limit', a.limit === undefined ? 20 : a.limit], ['offset', a.offset]];
    }, hasArrayProp('likedPosts')),
    'tumblr.get_blog_notifications': readHandler('tumblr.get_blog_notifications', BLOG_NOTIFICATIONS_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/notifications';
    }, function(a) { return [['before', a.before]]; }, hasArrayProp('notifications')),
    'tumblr.get_blog_posts': readHandler('tumblr.get_blog_posts', BLOG_POSTS_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/posts';
    }, postsPairs, hasArrayProp('posts')),
    'tumblr.get_current_user': readHandler('tumblr.get_current_user', EMPTY_PARAMS, function() {
      return '/user/info';
    }, null, hasObjectProp('user')),
    'tumblr.get_dashboard': readHandler('tumblr.get_dashboard', DASHBOARD_PARAMS, function() {
      return '/user/dashboard';
    }, function(a) {
      return [['npf', true], ['limit', a.limit], ['offset', a.offset], ['type', a.type], ['since_id', a.since_id]];
    }, hasArrayProp('posts')),
    'tumblr.get_draft_posts': readHandler('tumblr.get_draft_posts', DRAFT_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/posts/draft';
    }, function(a) { return [['npf', true], ['before_id', a.before_id]]; }, hasArrayProp('posts')),
    'tumblr.get_filtered_tags': readHandler('tumblr.get_filtered_tags', EMPTY_PARAMS, function() {
      return '/user/filtered_tags';
    }, null, hasArrayProp('filteredTags')),
    'tumblr.get_post': readHandler('tumblr.get_post', POST_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/posts/' + enc(a.post_id);
    }, function() { return [['npf', true]]; }, isObjectPayload),
    'tumblr.get_post_notes': readHandler('tumblr.get_post_notes', POST_NOTES_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/notes';
    }, function(a) { return [['id', a.post_id], ['mode', a.mode === undefined ? 'all' : a.mode]]; }, hasArrayProp('notes')),
    'tumblr.get_queued_posts': readHandler('tumblr.get_queued_posts', QUEUE_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/posts/queue';
    }, function(a) { return [['limit', a.limit], ['offset', a.offset], ['npf', true]]; }, hasArrayProp('posts')),
    'tumblr.get_recommended_blogs': readHandler('tumblr.get_recommended_blogs', RECOMMENDED_PARAMS, function() {
      return '/recommended/blogs';
    }, function(a) { return [['limit', a.limit === undefined ? 8 : a.limit]]; }, hasArrayProp('blogs')),
    'tumblr.get_submissions': readHandler('tumblr.get_submissions', SUBMISSIONS_PARAMS, function(a) {
      return '/blog/' + enc(a.blog_name) + '/posts/submission';
    }, function(a) { return [['offset', a.offset], ['npf', true]]; }, hasArrayProp('posts')),
    'tumblr.get_user_following': readHandler('tumblr.get_user_following', USER_PAGE_PARAMS, function() {
      return '/user/following';
    }, function(a) { return [['limit', a.limit === undefined ? 20 : a.limit], ['offset', a.offset]]; }, hasArrayProp('blogs')),
    'tumblr.get_user_likes': readHandler('tumblr.get_user_likes', USER_PAGE_PARAMS, function() {
      return '/user/likes';
    }, function(a) { return [['npf', true], ['limit', a.limit === undefined ? 20 : a.limit], ['offset', a.offset]]; }, hasArrayProp('liked_posts')),
    'tumblr.get_user_limits': readHandler('tumblr.get_user_limits', EMPTY_PARAMS, function() {
      return '/user/limits';
    }, null, isObjectPayload),
    'tumblr.search_tagged': readHandler('tumblr.search_tagged', TAGGED_PARAMS, function() {
      return '/tagged';
    }, function(a) { return [['tag', a.tag], ['limit', a.limit], ['before', a.before], ['npf', true]]; }, isArrayPayload),

    'tumblr.add_filtered_tag': guarded('tumblr.add_filtered_tag', 'write', FILTER_TAG_PARAMS, 'unverified-tumblr-add-filtered-tag-mutation'),
    'tumblr.block_blog': guarded('tumblr.block_blog', 'write', BLOCK_BLOG_PARAMS, 'unverified-tumblr-block-blog-mutation'),
    'tumblr.create_post': guarded('tumblr.create_post', 'write', CREATE_POST_PARAMS, 'unverified-tumblr-create-post-mutation'),
    'tumblr.delete_post': guarded('tumblr.delete_post', 'destructive', POST_PARAMS, 'unverified-tumblr-delete-post-mutation'),
    'tumblr.edit_post': guarded('tumblr.edit_post', 'write', EDIT_POST_PARAMS, 'unverified-tumblr-edit-post-mutation'),
    'tumblr.follow_blog': guarded('tumblr.follow_blog', 'write', FOLLOW_PARAMS, 'unverified-tumblr-follow-blog-mutation'),
    'tumblr.like_post': guarded('tumblr.like_post', 'write', LIKE_PARAMS, 'unverified-tumblr-like-post-mutation'),
    'tumblr.reblog_post': guarded('tumblr.reblog_post', 'write', REBLOG_PARAMS, 'unverified-tumblr-reblog-post-mutation'),
    'tumblr.remove_filtered_tag': guarded('tumblr.remove_filtered_tag', 'destructive', FILTER_TAG_PARAMS, 'unverified-tumblr-remove-filtered-tag-mutation'),
    'tumblr.unblock_blog': guarded('tumblr.unblock_blog', 'destructive', BLOCK_BLOG_PARAMS, 'unverified-tumblr-unblock-blog-mutation'),
    'tumblr.unfollow_blog': guarded('tumblr.unfollow_blog', 'write', FOLLOW_PARAMS, 'unverified-tumblr-unfollow-blog-mutation'),
    'tumblr.unlike_post': guarded('tumblr.unlike_post', 'write', LIKE_PARAMS, 'unverified-tumblr-unlike-post-mutation')
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
            service: TUMBLR_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTumblr = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
