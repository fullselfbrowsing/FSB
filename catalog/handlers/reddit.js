(function (global) {
  'use strict';

  /**
   * Reddit same-origin GET read head.
   *
   * Ports only the vendored redditGet() tools that use first-party
   * www.reddit.com .json endpoints. Non-read and cross-domain flows are
   * intentionally not registered here.
   */

  var REDDIT_ORIGIN = 'https://www.reddit.com';
  var REDDIT_SERVICE = 'www.reddit.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };

  var SUBREDDIT_PARAMS = withProps({
    subreddit: { type: 'string', minLength: 1, description: 'Subreddit name without r/ prefix' }
  }, ['subreddit']);

  var USER_PARAMS = withProps({
    username: { type: 'string', minLength: 1, description: 'Reddit username without u/ prefix' }
  }, ['username']);

  var PAGE_PARAMS = withProps({
    limit: integerSchema('Number of results to return', 1, 100),
    after: { type: 'string', description: 'Pagination cursor for the next page' }
  }, []);

  var POST_PARAMS = withProps({
    subreddit: { type: 'string', minLength: 1, description: 'Subreddit name without r/ prefix' },
    post_id: { type: 'string', minLength: 1, description: 'Post ID without t3_ prefix' },
    comment_limit: integerSchema('Max number of top-level comments', 0, 500),
    comment_depth: integerSchema('Max comment nesting depth', 0, 10),
    sort: {
      type: 'string',
      enum: ['confidence', 'top', 'new', 'controversial', 'old', 'qa'],
      description: 'Comment sort order'
    }
  }, ['subreddit', 'post_id']);

  var COMMENT_THREAD_PARAMS = withProps({
    subreddit: { type: 'string', minLength: 1, description: 'Subreddit name without r/ prefix' },
    post_id: { type: 'string', minLength: 1, description: 'Post ID without t3_ prefix' },
    comment_id: { type: 'string', minLength: 1, description: 'Comment ID without t1_ prefix' },
    depth: integerSchema('Max reply nesting depth below the target comment', 0, 10),
    limit: integerSchema('Max number of child comments to return', 0, 500)
  }, ['subreddit', 'post_id', 'comment_id']);

  var LIST_POSTS_PARAMS = withProps({
    subreddit: { type: 'string', description: 'Subreddit name without r/ prefix' },
    sort: { type: 'string', enum: ['hot', 'new', 'top', 'rising', 'controversial'], description: 'Sort order' },
    t: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year', 'all'], description: 'Time period' },
    limit: integerSchema('Number of posts to return', 1, 100),
    after: { type: 'string', description: 'Pagination cursor' },
    include_body: { type: 'boolean', description: 'Include post body and external URL' }
  }, []);

  var SEARCH_POSTS_PARAMS = withProps({
    query: { type: 'string', minLength: 1, description: 'Search query string' },
    subreddit: { type: 'string', description: 'Restrict search to this subreddit' },
    sort: { type: 'string', enum: ['relevance', 'hot', 'top', 'new', 'comments'], description: 'Sort order' },
    t: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year', 'all'], description: 'Time period filter' },
    limit: integerSchema('Number of results', 1, 100),
    after: { type: 'string', description: 'Pagination cursor' },
    include_body: { type: 'boolean', description: 'Include post body and external URL' }
  }, ['query']);

  var SEARCH_SUBREDDITS_PARAMS = withProps({
    query: { type: 'string', minLength: 1, description: 'Search query' },
    limit: integerSchema('Number of results', 1, 100),
    after: { type: 'string', description: 'Pagination cursor' }
  }, ['query']);

  var POPULAR_SUBREDDITS_PARAMS = withProps({
    category: { type: 'string', enum: ['popular', 'new', 'default'], description: 'Subreddit category' },
    limit: integerSchema('Number of results', 1, 100),
    after: { type: 'string', description: 'Pagination cursor' }
  }, []);

  var USER_CONTENT_PARAMS = withProps({
    username: { type: 'string', minLength: 1, description: 'Reddit username without u/ prefix' },
    where: {
      type: 'string',
      enum: ['overview', 'submitted', 'comments', 'saved', 'upvoted', 'downvoted', 'hidden', 'gilded'],
      description: 'Content type to list'
    },
    sort: { type: 'string', enum: ['hot', 'new', 'top', 'controversial'], description: 'Sort order' },
    t: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year', 'all'], description: 'Time period' },
    limit: integerSchema('Number of results', 1, 100),
    after: { type: 'string', description: 'Pagination cursor' },
    include_body: { type: 'boolean', description: 'Include post/comment body text' }
  }, ['username', 'where']);

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
      reason: reason || 'reddit-json-shape-mismatch',
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

  function valueOrDefault(value, fallbackValue) {
    return value === undefined || value === null || value === '' ? fallbackValue : value;
  }

  function segment(value, prefixRe) {
    return encodeURIComponent(String(value || '').replace(prefixRe || /^$/, '').trim());
  }

  function subredditSegment(value) {
    return segment(value, /^\/?r\//i);
  }

  function usernameSegment(value) {
    return segment(value, /^\/?u\//i);
  }

  function thingId(value, prefixRe) {
    return encodeURIComponent(String(value || '').replace(prefixRe || /^$/, '').trim());
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

  function buildGetSpec(path, pairs) {
    return {
      url: REDDIT_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: REDDIT_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors)
        || (data.error && typeof data.error === 'object'));
  }

  function isListing(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && data.data && typeof data.data === 'object'
      && Array.isArray(data.data.children);
  }

  function children(data) {
    return isListing(data) ? data.data.children : null;
  }

  function after(data) {
    return data && data.data && Object.prototype.hasOwnProperty.call(data.data, 'after')
      ? data.data.after
      : null;
  }

  function mapPost(raw, includeBody) {
    var p = raw || {};
    return {
      id: String(p.id || ''),
      name: String(p.name || ''),
      title: String(p.title || ''),
      author: String(p.author || ''),
      subreddit: String(p.subreddit || ''),
      score: Number(p.score) || 0,
      upvote_ratio: typeof p.upvote_ratio === 'number' ? p.upvote_ratio : 0,
      num_comments: Number(p.num_comments) || 0,
      url: includeBody ? String(p.url || '') : null,
      permalink: String(p.permalink || ''),
      selftext: includeBody ? String(p.selftext || '') : null,
      is_self: !!p.is_self,
      created_utc: Number(p.created_utc) || 0,
      link_flair_text: p.link_flair_text == null ? null : String(p.link_flair_text)
    };
  }

  function mapComment(raw) {
    var c = raw || {};
    return {
      id: String(c.id || ''),
      name: String(c.name || ''),
      author: String(c.author || ''),
      body: String(c.body || ''),
      score: Number(c.score) || 0,
      created_utc: Number(c.created_utc) || 0,
      parent_id: String(c.parent_id || ''),
      depth: Number(c.depth) || 0,
      is_submitter: !!c.is_submitter
    };
  }

  function flattenComments(list, maxDepth) {
    var out = [];
    var items = Array.isArray(list) ? list : [];
    for (var i = 0; i < items.length; i++) {
      var child = items[i] || {};
      if (child.kind !== 't1' || !child.data) { continue; }
      out.push(child.data);
      var replies = child.data.replies;
      if (replies && typeof replies === 'object' && child.data.depth < maxDepth) {
        out = out.concat(flattenComments(replies.data && replies.data.children, maxDepth));
      }
    }
    return out;
  }

  function mapSubreddit(raw) {
    var s = raw || {};
    return {
      display_name: String(s.display_name || ''),
      title: String(s.title || ''),
      public_description: String(s.public_description || ''),
      description: String(s.description || ''),
      subscribers: Number(s.subscribers) || 0,
      active_user_count: Number(s.active_user_count) || 0,
      created_utc: Number(s.created_utc) || 0,
      over18: !!s.over18,
      url: String(s.url || ''),
      subreddit_type: String(s.subreddit_type || '')
    };
  }

  function mapUser(raw) {
    var u = raw || {};
    return {
      name: String(u.name || ''),
      id: String(u.id || ''),
      total_karma: Number(u.total_karma) || 0,
      link_karma: Number(u.link_karma) || 0,
      comment_karma: Number(u.comment_karma) || 0,
      created_utc: Number(u.created_utc) || 0,
      is_gold: !!u.is_gold,
      is_mod: !!u.is_mod,
      description: u.subreddit ? String(u.subreddit.public_description || '') : ''
    };
  }

  function mapUserContent(child, includeBody) {
    var d = child && child.data ? child.data : {};
    return {
      kind: String(child && child.kind || ''),
      id: String(d.id || ''),
      name: String(d.name || ''),
      author: String(d.author || ''),
      subreddit: String(d.subreddit || ''),
      score: Number(d.score) || 0,
      created_utc: Number(d.created_utc) || 0,
      permalink: String(d.permalink || ''),
      title: d.title == null ? null : String(d.title),
      selftext: includeBody ? (d.selftext == null ? null : String(d.selftext)) : null,
      body: includeBody ? (d.body == null ? null : String(d.body)) : null,
      link_title: d.link_title == null ? null : String(d.link_title),
      link_id: d.link_id == null ? null : String(d.link_id),
      parent_id: d.parent_id == null ? null : String(d.parent_id),
      num_comments: d.num_comments == null ? null : Number(d.num_comments)
    };
  }

  function listingPosts(data, args) {
    var list = children(data);
    if (!list) { return null; }
    var includeBody = !!(args && args.include_body);
    return {
      posts: list.filter(function(child) { return child && child.data; })
        .map(function(child) { return mapPost(child.data, includeBody); }),
      after: after(data)
    };
  }

  function listingSubreddits(data) {
    var list = children(data);
    if (!list) { return null; }
    return {
      subreddits: list.filter(function(child) { return child && child.data; })
        .map(function(child) { return mapSubreddit(child.data); }),
      after: after(data)
    };
  }

  function listingInbox(data) {
    var list = children(data);
    if (!list) { return null; }
    return {
      messages: list.filter(function(child) { return child && child.data; }).map(function(child) {
        var m = child.data || {};
        return {
          id: String(m.id || ''),
          name: String(m.name || ''),
          author: String(m.author || ''),
          subject: String(m.subject || ''),
          body: String(m.body || ''),
          dest: String(m.dest || ''),
          created_utc: Number(m.created_utc) || 0,
          was_comment: !!m.was_comment,
          new: !!m.new
        };
      }),
      after: after(data)
    };
  }

  function listingUserContent(data, args) {
    var list = children(data);
    if (!list) { return null; }
    var includeBody = !!(args && args.include_body);
    return {
      items: list.map(function(child) { return mapUserContent(child, includeBody); }),
      after: after(data)
    };
  }

  function parsePostAndComments(data, args) {
    if (!Array.isArray(data) || data.length < 2 || !isListing(data[0]) || !isListing(data[1])) { return null; }
    var postChild = data[0].data.children[0];
    if (!postChild || !postChild.data) { return null; }
    var maxDepth = valueOrDefault(args && args.comment_depth, 3);
    return {
      post: mapPost(postChild.data, true),
      comments: flattenComments(data[1].data.children, Number(maxDepth) || 3).map(mapComment)
    };
  }

  function parseCommentThread(data, args) {
    if (!Array.isArray(data) || data.length < 2 || !isListing(data[1])) { return null; }
    var targetId = String(args && args.comment_id || '').replace(/^t1_/, '');
    var list = data[1].data.children;
    var targetChild = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 't1' && list[i].data && list[i].data.id === targetId) {
        targetChild = list[i];
        break;
      }
    }
    if (!targetChild) { return null; }
    var target = targetChild.data;
    var maxDepth = (Number(target.depth) || 0) + (Number(valueOrDefault(args && args.depth, 8)) || 8);
    var replies = target.replies && typeof target.replies === 'object'
      ? flattenComments(target.replies.data && target.replies.data.children, maxDepth)
      : [];
    return {
      comment: mapComment(target),
      replies: replies.map(mapComment)
    };
  }

  function parseThingData(data, mapper, key) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !data.data) { return null; }
    var mapped = mapper(data.data);
    if (!mapped || (!mapped.name && !mapped.display_name && !mapped.id)) { return null; }
    var out = {};
    out[key] = mapped;
    return out;
  }

  function parseFlairs(data) {
    if (!Array.isArray(data)) { return null; }
    return {
      flairs: data.map(function(f) {
        return {
          id: String(f && f.id || ''),
          text: String(f && f.text || ''),
          text_editable: !!(f && f.text_editable)
        };
      })
    };
  }

  function handleParsed(slug, result, args, parser) {
    if (!result || result.success !== true) { return result; }
    if (result.status && result.status >= 400) {
      return fallback(slug, 'reddit-json-status-error');
    }
    var data = result.data;
    if (looksLikeError(data)) { return fallback(slug, 'reddit-json-shape-mismatch'); }
    var parsed = parser(data, args || {});
    if (!parsed) { return fallback(slug, 'reddit-json-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, requestForArgs, parser) {
    return {
      tier: 'T1a',
      origin: REDDIT_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'reddit-execute-bound-spec-unavailable');
        }
        var req = requestForArgs(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(req.path, req.query), ctx.tabId);
        return handleParsed(slug, res, args || {}, parser);
      }
    };
  }

  function getMeRequest() { return { path: '/user/me/about.json', query: [] }; }

  function getPostRequest(args) {
    return {
      path: '/r/' + subredditSegment(args.subreddit) + '/comments/' + thingId(args.post_id, /^t3_/) + '.json',
      query: [
        ['limit', valueOrDefault(args.comment_limit, 50)],
        ['depth', valueOrDefault(args.comment_depth, 3)],
        ['sort', args.sort]
      ]
    };
  }

  function getCommentThreadRequest(args) {
    return {
      path: '/r/' + subredditSegment(args.subreddit) + '/comments/' + thingId(args.post_id, /^t3_/) + '.json',
      query: [
        ['comment', thingId(args.comment_id, /^t1_/)],
        ['depth', (Number(valueOrDefault(args.depth, 8)) || 8) + 1],
        ['limit', valueOrDefault(args.limit, 100)]
      ]
    };
  }

  function getSubredditRequest(args) {
    return { path: '/r/' + subredditSegment(args.subreddit) + '/about.json', query: [] };
  }

  function getUserRequest(args) {
    return { path: '/user/' + usernameSegment(args.username) + '/about.json', query: [] };
  }

  function listFlairsRequest(args) {
    return { path: '/r/' + subredditSegment(args.subreddit) + '/api/link_flair_v2.json', query: [] };
  }

  function listPopularSubredditsRequest(args) {
    return {
      path: '/subreddits/' + encodeURIComponent(String(valueOrDefault(args.category, 'popular'))) + '.json',
      query: [['limit', valueOrDefault(args.limit, 25)], ['after', args.after]]
    };
  }

  function listPostsRequest(args) {
    var sub = args.subreddit ? '/r/' + subredditSegment(args.subreddit) : '';
    var sort = valueOrDefault(args.sort, 'hot');
    return {
      path: sub + '/' + encodeURIComponent(String(sort)) + '.json',
      query: [
        ['limit', valueOrDefault(args.limit, 25)],
        ['t', (sort === 'top' || sort === 'controversial') ? args.t : undefined],
        ['after', args.after]
      ]
    };
  }

  function listSubscriptionsRequest(args) {
    return {
      path: '/subreddits/mine/subscriber.json',
      query: [['limit', valueOrDefault(args.limit, 25)], ['after', args.after]]
    };
  }

  function listUserContentRequest(args) {
    return {
      path: '/user/' + usernameSegment(args.username) + '/' + encodeURIComponent(String(args.where || 'overview')) + '.json',
      query: [
        ['limit', valueOrDefault(args.limit, 25)],
        ['sort', args.sort],
        ['t', args.t],
        ['after', args.after]
      ]
    };
  }

  function readInboxRequest(args) {
    return {
      path: '/message/inbox.json',
      query: [['limit', valueOrDefault(args.limit, 25)], ['after', args.after]]
    };
  }

  function searchPostsRequest(args) {
    var base = args.subreddit ? '/r/' + subredditSegment(args.subreddit) : '';
    return {
      path: base + '/search.json',
      query: [
        ['q', args.query],
        ['limit', valueOrDefault(args.limit, 25)],
        ['restrict_sr', args.subreddit ? 'true' : 'false'],
        ['sort', args.sort],
        ['t', args.t],
        ['after', args.after]
      ]
    };
  }

  function searchSubredditsRequest(args) {
    return {
      path: '/subreddits/search.json',
      query: [['q', args.query], ['limit', valueOrDefault(args.limit, 25)], ['after', args.after]]
    };
  }

  var handlers = {
    'reddit.get_comment_thread': readHandler('reddit.get_comment_thread', COMMENT_THREAD_PARAMS, getCommentThreadRequest, parseCommentThread),
    'reddit.get_me': readHandler('reddit.get_me', EMPTY_PARAMS, getMeRequest, function(data) {
      return parseThingData(data, mapUser, 'me');
    }),
    'reddit.get_post': readHandler('reddit.get_post', POST_PARAMS, getPostRequest, parsePostAndComments),
    'reddit.get_subreddit': readHandler('reddit.get_subreddit', SUBREDDIT_PARAMS, getSubredditRequest, function(data) {
      return parseThingData(data, mapSubreddit, 'subreddit');
    }),
    'reddit.get_user': readHandler('reddit.get_user', USER_PARAMS, getUserRequest, function(data) {
      return parseThingData(data, mapUser, 'user');
    }),
    'reddit.list_flairs': readHandler('reddit.list_flairs', SUBREDDIT_PARAMS, listFlairsRequest, parseFlairs),
    'reddit.list_popular_subreddits': readHandler('reddit.list_popular_subreddits', POPULAR_SUBREDDITS_PARAMS, listPopularSubredditsRequest, listingSubreddits),
    'reddit.list_posts': readHandler('reddit.list_posts', LIST_POSTS_PARAMS, listPostsRequest, listingPosts),
    'reddit.list_subscriptions': readHandler('reddit.list_subscriptions', PAGE_PARAMS, listSubscriptionsRequest, listingSubreddits),
    'reddit.list_user_content': readHandler('reddit.list_user_content', USER_CONTENT_PARAMS, listUserContentRequest, listingUserContent),
    'reddit.read_inbox': readHandler('reddit.read_inbox', PAGE_PARAMS, readInboxRequest, listingInbox),
    'reddit.search_posts': readHandler('reddit.search_posts', SEARCH_POSTS_PARAMS, searchPostsRequest, listingPosts),
    'reddit.search_subreddits': readHandler('reddit.search_subreddits', SEARCH_SUBREDDITS_PARAMS, searchSubredditsRequest, listingSubreddits)
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
          descriptor: { slug: slug, service: REDDIT_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerReddit = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
