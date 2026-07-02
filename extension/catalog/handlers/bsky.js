(function (global) {
  'use strict';

  /**
   * Bluesky public AppView READ head.
   *
   * Ports only public app.bsky.* GET endpoints that work without a user token.
   * Private account, notification, timeline, chat, write, and destructive rows
   * stay in the discovery tail until their auth/write evidence is available.
   */

  var BSKY_ORIGIN = 'https://bsky.app';
  var BSKY_APPVIEW_ORIGIN = 'https://api.bsky.app';
  var BSKY_SERVICE = 'bsky.app';
  var INT_LIMIT = 9007199254740991;

  var ACTOR_PARAMS = withProps({
    actor: { type: 'string', minLength: 1, description: 'DID or handle of the user' }
  }, ['actor']);

  var ACTORS_PARAMS = withProps({
    actors: {
      type: 'array',
      minItems: 1,
      maxItems: 25,
      items: { type: 'string' },
      description: 'DIDs or handles of users to look up'
    }
  }, ['actors']);

  var FEED_PARAMS = withProps({
    feed: { type: 'string', minLength: 1, description: 'AT URI of the feed generator' },
    cursor: { type: 'string', description: 'Pagination cursor' },
    limit: integerSchema('Maximum number of posts to return', 1, 100)
  }, ['feed']);

  var LIST_PARAMS = withProps({
    list: { type: 'string', minLength: 1, description: 'AT URI of the list' },
    cursor: { type: 'string', description: 'Pagination cursor' },
    limit: integerSchema('Maximum number of posts to return', 1, 100)
  }, ['list']);

  var ACTOR_FEED_PARAMS = withProps({
    actor: { type: 'string', minLength: 1, description: 'DID or handle of the user' },
    filter: {
      type: 'string',
      enum: ['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads'],
      description: 'Filter posts by type'
    },
    cursor: { type: 'string', description: 'Pagination cursor' },
    limit: integerSchema('Maximum number of posts to return', 1, 100)
  }, ['actor']);

  var ACTOR_PAGE_PARAMS = withProps({
    actor: { type: 'string', minLength: 1, description: 'DID or handle of the user' },
    cursor: { type: 'string', description: 'Pagination cursor' },
    limit: integerSchema('Maximum number of profiles to return', 1, 100)
  }, ['actor']);

  var POST_THREAD_PARAMS = withProps({
    uri: { type: 'string', minLength: 1, description: 'AT URI of the post' },
    depth: integerSchema('Reply depth to fetch', 0, 1000),
    parent_height: integerSchema('Parent height to fetch', 0, 1000)
  }, ['uri']);

  var POSTS_PARAMS = withProps({
    uris: {
      type: 'array',
      minItems: 1,
      maxItems: 25,
      items: { type: 'string' },
      description: 'AT URIs of posts to fetch'
    }
  }, ['uris']);

  var SEARCH_POSTS_PARAMS = withProps({
    q: { type: 'string', minLength: 1, description: 'Search query string' },
    sort: { type: 'string', enum: ['top', 'latest'], description: 'Sort order' },
    author: { type: 'string', description: 'Filter by author DID or handle' },
    lang: { type: 'string', description: 'Filter by 2-letter language code' },
    domain: { type: 'string', description: 'Filter by linked domain' },
    url: { type: 'string', description: 'Filter by URL in post links' },
    tag: { type: 'string', description: 'Filter by hashtag without #' },
    since: { type: 'string', description: 'Filter posts after this ISO date' },
    until: { type: 'string', description: 'Filter posts before this ISO date' },
    cursor: { type: 'string', description: 'Pagination cursor' },
    limit: integerSchema('Maximum number of posts to return', 1, 100)
  }, ['q']);

  var SEARCH_USERS_PARAMS = withProps({
    q: { type: 'string', minLength: 1, description: 'Search query' },
    cursor: { type: 'string', description: 'Pagination cursor' },
    limit: integerSchema('Maximum number of profiles to return', 1, 100)
  }, ['q']);

  var TYPEAHEAD_PARAMS = withProps({
    q: { type: 'string', minLength: 1, description: 'Search query' },
    limit: integerSchema('Maximum number of profiles to return', 1, 10)
  }, ['q']);

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
      reason: reason || 'bsky-public-appview-shape-mismatch',
      fellBackToDom: true
    });
  }

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
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        appendQuery(parts, key, value[i]);
      }
      return;
    }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function appViewSpec(nsid, pairs) {
    return {
      url: BSKY_APPVIEW_ORIGIN + '/xrpc/' + nsid + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'none',
      origin: BSKY_ORIGIN,
      extract: '@'
    };
  }

  function hasOwn(obj, key) {
    return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors)
        || (data.error && typeof data.error === 'object'));
  }

  function hasArray(key) {
    return function(data) {
      return !!data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data[key]);
    };
  }

  function hasProfile(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.did === 'string' || typeof data.handle === 'string');
  }

  function hasThread(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && hasOwn(data, 'thread') && data.thread && typeof data.thread === 'object';
  }

  function guardResult(result, slug, guard) {
    if (!result || result.success !== true) { return result; }
    if (result.status && result.status >= 400) {
      return fallback(slug, 'bsky-public-appview-status-error');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data)) {
      return fallback(slug, 'bsky-public-appview-shape-mismatch');
    }
    if (typeof guard === 'function' && !guard(data)) {
      return fallback(slug, 'bsky-public-appview-shape-mismatch');
    }
    return result;
  }

  function readHandler(slug, params, nsid, pairsForArgs, guard) {
    return {
      tier: 'T1a',
      origin: BSKY_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'bsky-execute-bound-spec-unavailable');
        }
        var pairs = typeof pairsForArgs === 'function' ? pairsForArgs(args || {}) : [];
        var res = await ctx.executeBoundSpec(appViewSpec(nsid, pairs), ctx.tabId);
        return guardResult(res, slug, guard);
      }
    };
  }

  function actorPairs(args) { return [['actor', args.actor]]; }
  function actorsPairs(args) { return [['actors', args.actors]]; }
  function feedPairs(args) { return [['feed', args.feed], ['cursor', args.cursor], ['limit', args.limit]]; }
  function listPairs(args) { return [['list', args.list], ['cursor', args.cursor], ['limit', args.limit]]; }
  function actorFeedPairs(args) {
    return [['actor', args.actor], ['filter', args.filter], ['cursor', args.cursor], ['limit', args.limit]];
  }
  function actorPagePairs(args) {
    return [['actor', args.actor], ['cursor', args.cursor], ['limit', args.limit]];
  }
  function postThreadPairs(args) {
    return [['uri', args.uri], ['depth', args.depth], ['parentHeight', args.parent_height]];
  }
  function postsPairs(args) { return [['uris', args.uris]]; }
  function searchPostsPairs(args) {
    return [
      ['q', args.q],
      ['sort', args.sort],
      ['author', args.author],
      ['lang', args.lang],
      ['domain', args.domain],
      ['url', args.url],
      ['tag', args.tag],
      ['since', args.since],
      ['until', args.until],
      ['cursor', args.cursor],
      ['limit', args.limit]
    ];
  }
  function searchUsersPairs(args) { return [['q', args.q], ['cursor', args.cursor], ['limit', args.limit]]; }
  function typeaheadPairs(args) { return [['q', args.q], ['limit', args.limit]]; }

  var handlers = {
    'bsky.get_author_feed': readHandler('bsky.get_author_feed', ACTOR_FEED_PARAMS, 'app.bsky.feed.getAuthorFeed', actorFeedPairs, hasArray('feed')),
    'bsky.get_feed': readHandler('bsky.get_feed', FEED_PARAMS, 'app.bsky.feed.getFeed', feedPairs, hasArray('feed')),
    'bsky.get_followers': readHandler('bsky.get_followers', ACTOR_PAGE_PARAMS, 'app.bsky.graph.getFollowers', actorPagePairs, hasArray('followers')),
    'bsky.get_follows': readHandler('bsky.get_follows', ACTOR_PAGE_PARAMS, 'app.bsky.graph.getFollows', actorPagePairs, hasArray('follows')),
    'bsky.get_list_feed': readHandler('bsky.get_list_feed', LIST_PARAMS, 'app.bsky.feed.getListFeed', listPairs, hasArray('feed')),
    'bsky.get_post_thread': readHandler('bsky.get_post_thread', POST_THREAD_PARAMS, 'app.bsky.feed.getPostThread', postThreadPairs, hasThread),
    'bsky.get_posts': readHandler('bsky.get_posts', POSTS_PARAMS, 'app.bsky.feed.getPosts', postsPairs, hasArray('posts')),
    'bsky.get_user_profile': readHandler('bsky.get_user_profile', ACTOR_PARAMS, 'app.bsky.actor.getProfile', actorPairs, hasProfile),
    'bsky.get_user_profiles': readHandler('bsky.get_user_profiles', ACTORS_PARAMS, 'app.bsky.actor.getProfiles', actorsPairs, hasArray('profiles')),
    'bsky.search_posts': readHandler('bsky.search_posts', SEARCH_POSTS_PARAMS, 'app.bsky.feed.searchPosts', searchPostsPairs, hasArray('posts')),
    'bsky.search_users': readHandler('bsky.search_users', SEARCH_USERS_PARAMS, 'app.bsky.actor.searchActors', searchUsersPairs, hasArray('actors')),
    'bsky.search_users_typeahead': readHandler('bsky.search_users_typeahead', TYPEAHEAD_PARAMS, 'app.bsky.actor.searchActorsTypeahead', typeaheadPairs, hasArray('actors'))
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
          descriptor: { slug: slug, service: BSKY_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerBsky = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
