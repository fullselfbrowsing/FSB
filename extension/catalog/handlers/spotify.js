(function (global) {
  'use strict';

  /**
   * Spotify page-bearer read head.
   *
   * Spotify's Web Player keeps bearer auth in page runtime requests. This handler
   * stays network-free and token-free; reviewed reads route through the bounded
   * MAIN-world page-read primitive. Playback mutations stay guarded until live
   * request-shape UAT promotes them.
   */

  var ORIGIN = 'https://open.spotify.com';
  var SERVICE = 'open.spotify.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var URI_PARAMS = schema({
    uri: { type: 'string', minLength: 1, description: 'Spotify URI' }
  }, ['uri']);
  var ALBUM_PARAMS = schema({
    uri: { type: 'string', minLength: 1, description: 'Spotify album URI' },
    offset: integerSchema('Track offset for pagination', 0),
    limit: integerSchema('Maximum tracks to return', 1, 50)
  }, ['uri']);
  var PLAYLIST_PARAMS = schema({
    uri: { type: 'string', minLength: 1, description: 'Spotify playlist URI' },
    offset: integerSchema('Track offset for pagination', 0),
    limit: integerSchema('Maximum tracks to return', 1, 100)
  }, ['uri']);
  var SAVED_TRACKS_PARAMS = schema({
    limit: integerSchema('Maximum number of tracks to return', 1, 50),
    offset: integerSchema('Index of the first track to return', 0)
  });
  var RECENTLY_PLAYED_PARAMS = schema({
    limit: integerSchema('Number of items to return', 1, 50),
    before: integerSchema('Unix timestamp in milliseconds before this time', -INT_LIMIT, INT_LIMIT),
    after: integerSchema('Unix timestamp in milliseconds after this time', -INT_LIMIT, INT_LIMIT)
  });
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' },
    limit: integerSchema('Maximum number of results per type', 1, 50),
    offset: integerSchema('Result offset for pagination', 0)
  }, ['query']);
  var DEVICE_PARAMS = schema({
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  });
  var QUEUE_PARAMS = schema({
    uri: { type: 'string', minLength: 1, description: 'Spotify URI of the track or episode to add' },
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  }, ['uri']);
  var SEEK_PARAMS = schema({
    position_ms: integerSchema('Position in milliseconds to seek to', -INT_LIMIT, INT_LIMIT),
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  }, ['position_ms']);
  var REPEAT_PARAMS = schema({
    state: { type: 'string', enum: ['off', 'context', 'track'], description: 'Repeat mode' },
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  }, ['state']);
  var VOLUME_PARAMS = schema({
    volume_percent: integerSchema('Volume percentage to set', 0, 100),
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  }, ['volume_percent']);
  var START_PARAMS = schema({
    context_uri: { type: 'string', description: 'Spotify URI of the context to play' },
    uris: { type: 'array', items: { type: 'string' }, description: 'Spotify track URIs to play' },
    offset: integerSchema('Zero-based track position within the context', -INT_LIMIT, INT_LIMIT),
    position_ms: integerSchema('Position in milliseconds within the track', -INT_LIMIT, INT_LIMIT),
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  });
  var SHUFFLE_PARAMS = schema({
    state: { type: 'boolean', description: 'Whether to enable shuffle mode' },
    device_id: { type: 'string', description: 'Spotify playback device ID' }
  }, ['state']);
  var TRANSFER_PARAMS = schema({
    device_id: { type: 'string', minLength: 1, description: 'Spotify playback device ID' },
    play: { type: 'boolean', description: 'Whether to start playback on the target device' }
  }, ['device_id']);

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
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
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
      reason: reason || 'spotify-page-read-unavailable',
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
          return fallback(slug, 'spotify-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'spotify',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-spotify-playback-mutation');
      }
    };
  }

  var handlers = {
    'spotify.get_album': readHandler('spotify.get_album', ALBUM_PARAMS, 'get_album'),
    'spotify.get_artist': readHandler('spotify.get_artist', URI_PARAMS, 'get_artist'),
    'spotify.get_available_devices': readHandler('spotify.get_available_devices', EMPTY_PARAMS, 'get_available_devices'),
    'spotify.get_current_user': readHandler('spotify.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'spotify.get_currently_playing': readHandler('spotify.get_currently_playing', EMPTY_PARAMS, 'get_currently_playing'),
    'spotify.get_playback_state': readHandler('spotify.get_playback_state', EMPTY_PARAMS, 'get_playback_state'),
    'spotify.get_playlist': readHandler('spotify.get_playlist', PLAYLIST_PARAMS, 'get_playlist'),
    'spotify.get_queue': readHandler('spotify.get_queue', EMPTY_PARAMS, 'get_queue'),
    'spotify.get_recently_played': readHandler('spotify.get_recently_played', RECENTLY_PLAYED_PARAMS, 'get_recently_played'),
    'spotify.get_saved_tracks': readHandler('spotify.get_saved_tracks', SAVED_TRACKS_PARAMS, 'get_saved_tracks'),
    'spotify.search': readHandler('spotify.search', SEARCH_PARAMS, 'search'),
    'spotify.add_to_queue': guarded('spotify.add_to_queue', QUEUE_PARAMS, 'unverified-spotify-add-to-queue-mutation'),
    'spotify.pause_playback': guarded('spotify.pause_playback', DEVICE_PARAMS, 'unverified-spotify-pause-playback-mutation'),
    'spotify.seek_to_position': guarded('spotify.seek_to_position', SEEK_PARAMS, 'unverified-spotify-seek-to-position-mutation'),
    'spotify.set_repeat_mode': guarded('spotify.set_repeat_mode', REPEAT_PARAMS, 'unverified-spotify-set-repeat-mode-mutation'),
    'spotify.set_volume': guarded('spotify.set_volume', VOLUME_PARAMS, 'unverified-spotify-set-volume-mutation'),
    'spotify.skip_to_next': guarded('spotify.skip_to_next', DEVICE_PARAMS, 'unverified-spotify-skip-to-next-mutation'),
    'spotify.skip_to_previous': guarded('spotify.skip_to_previous', DEVICE_PARAMS, 'unverified-spotify-skip-to-previous-mutation'),
    'spotify.start_playback': guarded('spotify.start_playback', START_PARAMS, 'unverified-spotify-start-playback-mutation'),
    'spotify.toggle_shuffle': guarded('spotify.toggle_shuffle', SHUFFLE_PARAMS, 'unverified-spotify-toggle-shuffle-mutation'),
    'spotify.transfer_playback': guarded('spotify.transfer_playback', TRANSFER_PARAMS, 'unverified-spotify-transfer-playback-mutation')
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

  global.FsbHandlerSpotify = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
