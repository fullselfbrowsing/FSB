(function (global) {
  'use strict';

  /**
   * Twitch GraphQL page-bearer read head.
   *
   * The handler stays network-free and token-free. Reviewed read actions route
   * through the bounded MAIN-world page-read primitive, which reads Twitch auth
   * cookies and calls gql.twitch.tv inside the origin-pinned Twitch page.
   */

  var ORIGIN = 'https://www.twitch.tv';
  var SERVICE = 'twitch.tv';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var LOGIN_PARAMS = schema({
    login: { type: 'string', minLength: 1, description: 'Twitch login name' }
  }, ['login']);
  var ID_PARAMS = schema({
    id: { type: 'string', minLength: 1, description: 'Twitch entity ID' }
  }, ['id']);
  var GAME_PARAMS = schema({
    name: { type: 'string', description: 'Game or category name' },
    id: { type: 'string', description: 'Game or category ID' }
  });
  var FIRST_PARAMS = schema({
    first: integerSchema('Number of results to return', 1, 25)
  });
  var GAME_CLIPS_PARAMS = schema({
    name: { type: 'string', minLength: 1, description: 'Game or category name' },
    period: { type: 'string', enum: ['LAST_DAY', 'LAST_WEEK', 'LAST_MONTH', 'ALL_TIME'], description: 'Clip time period' },
    first: integerSchema('Number of clips to return', 1, 25)
  }, ['name']);
  var STREAMS_BY_GAME_PARAMS = schema({
    name: { type: 'string', description: 'Game or category name' },
    id: { type: 'string', description: 'Game or category ID' },
    first: integerSchema('Number of streams to return', 1, 25)
  });
  var USER_CLIPS_PARAMS = schema({
    login: { type: 'string', minLength: 1, description: 'Broadcaster login name' },
    period: { type: 'string', enum: ['LAST_DAY', 'LAST_WEEK', 'LAST_MONTH', 'ALL_TIME'], description: 'Clip time period' },
    first: integerSchema('Number of clips to return', 1, 25)
  }, ['login']);
  var USER_VIDEOS_PARAMS = schema({
    login: { type: 'string', minLength: 1, description: 'Broadcaster login name' },
    type: { type: 'string', enum: ['ARCHIVE', 'HIGHLIGHT', 'UPLOAD', 'PAST_PREMIERE'], description: 'Video type filter' },
    sort: { type: 'string', enum: ['TIME', 'VIEWS'], description: 'Sort order' },
    first: integerSchema('Number of videos to return', 1, 25)
  }, ['login']);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' }
  }, ['query']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) out.required = required;
    return out;
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  function fallback(slug, reason) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'twitch-page-read-unavailable',
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'twitch-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'twitch',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  var handlers = {
    'twitch.get_channel_emotes': readHandler('twitch.get_channel_emotes', LOGIN_PARAMS, 'get_channel_emotes'),
    'twitch.get_current_user': readHandler('twitch.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'twitch.get_game': readHandler('twitch.get_game', GAME_PARAMS, 'get_game'),
    'twitch.get_game_clips': readHandler('twitch.get_game_clips', GAME_CLIPS_PARAMS, 'get_game_clips'),
    'twitch.get_stream': readHandler('twitch.get_stream', LOGIN_PARAMS, 'get_stream'),
    'twitch.get_streams_by_game': readHandler('twitch.get_streams_by_game', STREAMS_BY_GAME_PARAMS, 'get_streams_by_game'),
    'twitch.get_top_games': readHandler('twitch.get_top_games', FIRST_PARAMS, 'get_top_games'),
    'twitch.get_top_streams': readHandler('twitch.get_top_streams', FIRST_PARAMS, 'get_top_streams'),
    'twitch.get_user_clips': readHandler('twitch.get_user_clips', USER_CLIPS_PARAMS, 'get_user_clips'),
    'twitch.get_user_profile': readHandler('twitch.get_user_profile', LOGIN_PARAMS, 'get_user_profile'),
    'twitch.get_user_videos': readHandler('twitch.get_user_videos', USER_VIDEOS_PARAMS, 'get_user_videos'),
    'twitch.get_video': readHandler('twitch.get_video', ID_PARAMS, 'get_video'),
    'twitch.search_categories': readHandler('twitch.search_categories', SEARCH_PARAMS, 'search_categories'),
    'twitch.search_channels': readHandler('twitch.search_channels', SEARCH_PARAMS, 'search_channels')
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
            sideEffectClass: 'read',
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTwitch = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
