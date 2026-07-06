(function (global) {
  'use strict';

  /**
   * Medium same-origin GraphQL head.
   *
   * Query-only descriptors execute against Medium's first-party /_/graphql
   * endpoint with same-origin cookies. Mutations stay guarded fail-closed until
   * live mutation-body UAT records and approves their exact request shape.
   */

  var MEDIUM_ORIGIN = 'https://medium.com';
  var MEDIUM_SERVICE = 'medium.com';
  var GRAPHQL_URL = MEDIUM_ORIGIN + '/_/graphql';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var POST_ID_PARAMS = schema({
    post_id: { type: 'string', minLength: 1, description: 'Medium post ID' }
  }, ['post_id']);
  var COLLECTION_ID_PARAMS = schema({
    collection_id: { type: 'string', minLength: 1, description: 'Medium collection/publication ID' }
  }, ['collection_id']);
  var USERNAME_PARAMS = schema({
    username: { type: 'string', minLength: 1, description: 'Medium username without @' }
  }, ['username']);
  var TAG_SLUG_PARAMS = schema({
    tag_slug: { type: 'string', minLength: 1, description: 'Medium tag slug' },
    limit: integerSchema('Maximum results to return', 1, 25)
  }, ['tag_slug']);
  var POST_RESPONSES_PARAMS = schema({
    post_id: { type: 'string', minLength: 1, description: 'Medium post ID' },
    limit: integerSchema('Maximum responses to return', 1, 25),
    cursor: { type: 'string', description: 'Opaque pagination cursor from a previous response' }
  }, ['post_id']);
  var LIMIT_50_PARAMS = schema({
    limit: integerSchema('Maximum items to return', 1, 50)
  }, []);
  var RECOMMENDED_PUBLISHERS_PARAMS = schema({
    limit: integerSchema('Maximum recommendations to return', 1, 20),
    cursor: { type: 'string', description: 'Pagination cursor from a previous response' }
  }, []);
  var RECOMMENDED_TAGS_PARAMS = schema({
    limit: integerSchema('Maximum tags to return', 1, 30)
  }, []);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' },
    limit: integerSchema('Maximum results to return', 1, 25),
    page: integerSchema('Page number for pagination', 0)
  }, ['query']);
  var CLAP_PARAMS = schema({
    post_id: { type: 'string', minLength: 1, description: 'Medium post ID to clap' },
    count: integerSchema('Number of claps to add', 1, 50)
  }, ['post_id']);
  var TAG_WRITE_PARAMS = schema({
    tag_slug: { type: 'string', minLength: 1, description: 'Medium tag slug' }
  }, ['tag_slug']);
  var USER_ID_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Medium user ID' }
  }, ['user_id']);

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
      reason: reason || 'medium-graphql-shape-mismatch',
      fellBackToDom: true
    });
  }

  function valueOrDefault(value, fallbackValue) {
    return value === undefined || value === null || value === '' ? fallbackValue : value;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return isPlainObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function hasObjectKey(key) {
    return function(data) {
      return isPlainObject(data[key]);
    };
  }

  function objectKeyHasId(key) {
    return function(data) {
      return isPlainObject(data[key]) && typeof data[key].id === 'string' && data[key].id.length > 0;
    };
  }

  function hasOwnKey(key) {
    return function(data) {
      return hasOwn(data, key);
    };
  }

  function viewerHasId(data) {
    return isPlainObject(data.viewer) && typeof data.viewer.id === 'string' && data.viewer.id.length > 0;
  }

  function querySpec(operationName, query, variables) {
    return {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'graphql-operation': operationName
      },
      body: JSON.stringify([{ operationName: operationName, variables: variables || {}, query: query }]),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: MEDIUM_ORIGIN,
      extract: '@'
    };
  }

  function unwrapGraphqlResult(result, slug, expectedKey, guard) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'medium-graphql-http-error');
    }

    var raw = result.data;
    var envelope = Array.isArray(raw) ? raw[0] : raw;
    if (!isPlainObject(envelope) || (Array.isArray(envelope.errors) && envelope.errors.length)) {
      return fallback(slug, 'medium-graphql-error');
    }
    var data = envelope.data;
    if (!isPlainObject(data)) {
      return fallback(slug, 'medium-graphql-data-missing');
    }
    if (expectedKey && !hasOwn(data, expectedKey)) {
      return fallback(slug, 'medium-graphql-shape-mismatch');
    }
    if (typeof guard === 'function' && !guard(data)) {
      return fallback(slug, 'medium-graphql-shape-mismatch');
    }
    return { success: true, status: result.status, data: data };
  }

  function readHandler(slug, params, operationName, query, variablesForArgs, expectedKey, guard) {
    return {
      tier: 'T1a',
      origin: MEDIUM_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'medium-execute-bound-spec-unavailable');
        }
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(args || {}) : {};
        var res = await ctx.executeBoundSpec(querySpec(operationName, query, variables), ctx.tabId);
        return unwrapGraphqlResult(res, slug, expectedKey, guard);
      }
    };
  }

  function viewerScopedHandler(slug, params, operationName, query, variablesForArgs, expectedKey, guard) {
    return {
      tier: 'T1a',
      origin: MEDIUM_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'medium-execute-bound-spec-unavailable');
        }
        var viewerRes = await ctx.executeBoundSpec(querySpec(
          'ViewerIdQuery',
          'query ViewerIdQuery { viewer { id } }',
          {}
        ), ctx.tabId);
        var viewer = unwrapGraphqlResult(viewerRes, slug, 'viewer', viewerHasId);
        if (!viewer || viewer.success !== true) { return viewer; }
        var variables = typeof variablesForArgs === 'function'
          ? variablesForArgs(args || {}, viewer.data.viewer.id)
          : { viewerId: viewer.data.viewer.id };
        var res = await ctx.executeBoundSpec(querySpec(operationName, query, variables), ctx.tabId);
        return unwrapGraphqlResult(res, slug, expectedKey, guard);
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: MEDIUM_ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function searchVariables(args) {
    return {
      query: args.query,
      pagingOptions: {
        limit: valueOrDefault(args.limit, 10),
        page: valueOrDefault(args.page, 0)
      }
    };
  }

  var USER_FIELDS = 'id name username bio imageId mediumMemberAt twitterScreenName membership { tier id } viewerEdge { id createdAt } socialStats { followerCount followingCount }';
  var USER_SUMMARY_FIELDS = 'id name username bio imageId socialStats { followerCount }';
  var POST_FIELDS = 'id title uniqueSlug mediumUrl firstPublishedAt latestPublishedAt readingTime clapCount voterCount responsesCount isLocked visibility creator { id name username imageId } collection { id name slug } tags { id displayTitle normalizedTagSlug } extendedPreviewContent { subtitle }';
  var POST_SUMMARY_FIELDS = 'id title uniqueSlug mediumUrl firstPublishedAt readingTime clapCount voterCount isLocked creator { id name username } collection { id name slug } extendedPreviewContent { subtitle }';
  var COLLECTION_FIELDS = 'id name slug description subscriberCount domain shortDescription creator { id name username }';

  var queries = {
    getCollection: 'query CollectionQuery($collectionId: ID!) { collection(id: $collectionId) { ' + COLLECTION_FIELDS + ' } }',
    getCurrentUser: 'query ViewerQuery { viewer { ' + USER_FIELDS + ' } }',
    getNotificationCount: 'query UnreadNotificationCount { notificationStatus { unreadNotificationCount } }',
    getPost: 'query PostQuery($id: ID!) { post(id: $id) { ' + POST_FIELDS + ' } }',
    getPostResponses: 'query PostResponsesQuery($postId: ID!, $paging: PagingOptions) { post(id: $postId) { id postResponses { count } threadedPostResponses(paging: $paging) { posts { ' + POST_SUMMARY_FIELDS + ' } pagingInfo { next { limit to } } } } }',
    getReadingList: 'query ReadingListQuery($viewerId: ID!, $limit: Int!) { getPredefinedCatalog(userId: $viewerId, type: READING_LIST) { ... on Catalog { id itemsConnection(pagingOptions: {limit: $limit}) { items { catalogItemId entity { ... on Post { ' + POST_SUMMARY_FIELDS + ' } } } paging { count } } } } }',
    getRecommendedPublishers: 'query RecommendedPublishersQuery($first: Int!, $after: String!) { recommendedPublishers(first: $first, after: $after, mode: ALL) { edges { node { __typename ... on User { id name bio username } ... on Collection { id name description slug } } cursor } pageInfo { hasNextPage endCursor } } }',
    getTagFeed: 'query TagFeedQuery($tagSlug: String!, $paging: PagingOptions!) { personalisedTagFeed(tagSlug: $tagSlug, paging: $paging) { items { feedId post { ' + POST_SUMMARY_FIELDS + ' } } pagingInfo { next { limit page } } } }',
    getUserProfile: 'query UserByUsername($username: ID!) { userResult(username: $username) { ... on User { ' + USER_FIELDS + ' } } }',
    listFollowers: 'query FollowersQuery($userId: ID!, $paging: PagingOptions) { user(id: $userId) { id followersUserConnection(paging: $paging) { users { ' + USER_SUMMARY_FIELDS + ' } pagingInfo { next { limit page } } } } }',
    listFollowing: 'query FollowingQuery($userId: ID!, $paging: PagingOptions) { user(id: $userId) { id followingUserConnection(paging: $paging) { users { ' + USER_SUMMARY_FIELDS + ' } pagingInfo { next { limit page } } } } }',
    listRecommendedTags: 'query RecommendedTagsQuery($first: Int!) { recommendedTags(input: {first: $first}) { edges { node { id displayTitle normalizedTagSlug postCount } } } }',
    searchCollections: 'query SearchCollectionsQuery($query: String!, $pagingOptions: SearchPagingOptions) { search(query: $query) { ... on Search { collections(pagingOptions: $pagingOptions) { ... on SearchCollection { items { id name slug description subscriberCount } pagingInfo { next { limit page } } } } } } }',
    searchPosts: 'query SearchQuery($query: String!, $pagingOptions: SearchPagingOptions) { search(query: $query) { ... on Search { posts(pagingOptions: $pagingOptions) { ... on SearchPost { items { ' + POST_SUMMARY_FIELDS + ' } pagingInfo { next { limit page } } } } } } }',
    searchTags: 'query SearchTagsQuery($query: String!, $pagingOptions: SearchPagingOptions) { search(query: $query) { ... on Search { tags(pagingOptions: $pagingOptions) { ... on SearchTag { items { id displayTitle normalizedTagSlug postCount } pagingInfo { next { limit page } } } } } } }'
  };

  var handlers = {
    'medium.get_collection': readHandler('medium.get_collection', COLLECTION_ID_PARAMS, 'CollectionQuery', queries.getCollection, function(args) {
      return { collectionId: args.collection_id };
    }, 'collection', objectKeyHasId('collection')),
    'medium.get_current_user': readHandler('medium.get_current_user', EMPTY_PARAMS, 'ViewerQuery', queries.getCurrentUser, null, 'viewer', viewerHasId),
    'medium.get_notification_count': readHandler('medium.get_notification_count', EMPTY_PARAMS, 'UnreadNotificationCount', queries.getNotificationCount, null, 'notificationStatus', hasObjectKey('notificationStatus')),
    'medium.get_post': readHandler('medium.get_post', POST_ID_PARAMS, 'PostQuery', queries.getPost, function(args) {
      return { id: args.post_id };
    }, 'post', objectKeyHasId('post')),
    'medium.get_post_responses': readHandler('medium.get_post_responses', POST_RESPONSES_PARAMS, 'PostResponsesQuery', queries.getPostResponses, function(args) {
      var paging = { limit: valueOrDefault(args.limit, 10) };
      if (args.cursor) { paging.to = args.cursor; }
      return { postId: args.post_id, paging: paging };
    }, 'post', objectKeyHasId('post')),
    'medium.get_reading_list': viewerScopedHandler('medium.get_reading_list', LIMIT_50_PARAMS, 'ReadingListQuery', queries.getReadingList, function(args, viewerId) {
      return { viewerId: viewerId, limit: valueOrDefault(args.limit, 20) };
    }, 'getPredefinedCatalog', hasOwnKey('getPredefinedCatalog')),
    'medium.get_recommended_publishers': readHandler('medium.get_recommended_publishers', RECOMMENDED_PUBLISHERS_PARAMS, 'RecommendedPublishersQuery', queries.getRecommendedPublishers, function(args) {
      return { first: valueOrDefault(args.limit, 10), after: valueOrDefault(args.cursor, '') };
    }, 'recommendedPublishers', hasObjectKey('recommendedPublishers')),
    'medium.get_tag_feed': readHandler('medium.get_tag_feed', TAG_SLUG_PARAMS, 'TagFeedQuery', queries.getTagFeed, function(args) {
      return { tagSlug: args.tag_slug, paging: { limit: valueOrDefault(args.limit, 10) } };
    }, 'personalisedTagFeed', hasObjectKey('personalisedTagFeed')),
    'medium.get_user_profile': readHandler('medium.get_user_profile', USERNAME_PARAMS, 'UserByUsername', queries.getUserProfile, function(args) {
      return { username: args.username };
    }, 'userResult', objectKeyHasId('userResult')),
    'medium.list_followers': viewerScopedHandler('medium.list_followers', LIMIT_50_PARAMS, 'FollowersQuery', queries.listFollowers, function(args, viewerId) {
      return { userId: viewerId, paging: { limit: valueOrDefault(args.limit, 20) } };
    }, 'user', hasObjectKey('user')),
    'medium.list_following': viewerScopedHandler('medium.list_following', LIMIT_50_PARAMS, 'FollowingQuery', queries.listFollowing, function(args, viewerId) {
      return { userId: viewerId, paging: { limit: valueOrDefault(args.limit, 20) } };
    }, 'user', hasObjectKey('user')),
    'medium.list_recommended_tags': readHandler('medium.list_recommended_tags', RECOMMENDED_TAGS_PARAMS, 'RecommendedTagsQuery', queries.listRecommendedTags, function(args) {
      return { first: valueOrDefault(args.limit, 20) };
    }, 'recommendedTags', hasObjectKey('recommendedTags')),
    'medium.search_collections': readHandler('medium.search_collections', SEARCH_PARAMS, 'SearchCollectionsQuery', queries.searchCollections, searchVariables, 'search', hasObjectKey('search')),
    'medium.search_posts': readHandler('medium.search_posts', SEARCH_PARAMS, 'SearchQuery', queries.searchPosts, searchVariables, 'search', hasObjectKey('search')),
    'medium.search_tags': readHandler('medium.search_tags', SEARCH_PARAMS, 'SearchTagsQuery', queries.searchTags, searchVariables, 'search', hasObjectKey('search')),

    'medium.clap_post': guarded('medium.clap_post', CLAP_PARAMS, 'unverified-medium-clap-post-mutation'),
    'medium.follow_tag': guarded('medium.follow_tag', TAG_WRITE_PARAMS, 'unverified-medium-follow-tag-mutation'),
    'medium.follow_user': guarded('medium.follow_user', USER_ID_PARAMS, 'unverified-medium-follow-user-mutation'),
    'medium.unfollow_tag': guarded('medium.unfollow_tag', TAG_WRITE_PARAMS, 'unverified-medium-unfollow-tag-mutation'),
    'medium.unfollow_user': guarded('medium.unfollow_user', USER_ID_PARAMS, 'unverified-medium-unfollow-user-mutation')
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
            service: MEDIUM_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerMedium = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
