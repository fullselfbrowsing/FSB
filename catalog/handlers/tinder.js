(function (global) {
  'use strict';

  /**
   * Tinder storage-bearer READ head.
   *
   * Tinder's web app stores its API token and persistent device id in first-party
   * page storage. The handler declares those storage needs in the bound spec; the
   * origin-pinned page request primitive reads them inside tinder.com and never
   * returns the values to the service worker. Only GET read endpoints are active.
   * Swipe, message, profile, and location mutations stay guarded fail-closed until
   * live mutation-body UAT records the exact request shapes.
   */

  var ORIGIN = 'https://www.tinder.com';
  var SERVICE = 'tinder.com';
  var API_BASE = 'https://api.gotinder.com';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string', minLength: 1 };
  var EMPTY_PARAMS = schema({}, []);
  var USER_ID_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Tinder user ID' }
  }, ['user_id']);
  var USER_ID_SWIPE_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Tinder user ID' },
    content_hash: { type: 'string', description: 'Recommendation content hash' },
    s_number: numberSchema('Swipe sequence number')
  }, ['user_id']);
  var LIST_MATCHES_PARAMS = schema({
    count: integerSchema('Results per page', 1, 100),
    page_token: { type: 'string', description: 'Pagination token' }
  }, []);
  var UPDATES_PARAMS = schema({
    last_activity_date: { type: 'string', description: 'ISO timestamp cursor' }
  }, []);
  var MESSAGE_ID_PARAMS = schema({
    message_id: STRING
  }, ['message_id']);
  var MATCH_ID_PARAMS = schema({
    match_id: STRING
  }, ['match_id']);
  var MATCH_MESSAGE_PARAMS = schema({
    match_id: STRING,
    message: { type: 'string', minLength: 1 }
  }, ['match_id', 'message']);
  var LOCATION_PARAMS = schema({
    lat: numberSchema('Latitude'),
    lon: numberSchema('Longitude')
  }, ['lat', 'lon']);
  var UPDATE_PROFILE_PARAMS = schema({
    bio: { type: 'string' },
    age_filter_min: integerSchema('Minimum age filter', 18, 100),
    age_filter_max: integerSchema('Maximum age filter', 18, 100),
    distance_filter: integerSchema('Distance filter in miles', 1, 500),
    gender_filter: integerSchema('Gender filter'),
    discoverable: { type: 'boolean' }
  }, []);

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

  function numberSchema(description) {
    return {
      type: 'number',
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
      reason: reason || 'tinder-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value) {
    return value === true;
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
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

  function apiSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'platform': 'web',
        'app-version': '1070700',
        'tinder-version': '7.7.0',
        'x-supported-image-formats': 'webp,jpeg'
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: ORIGIN,
      extract: '@',
      _authNeed: {
        kind: 'bearer',
        source: 'storage',
        storage: 'localStorage',
        tokenKey: 'TinderWeb/APIToken',
        parseJson: false,
        header: 'X-Auth-Token',
        prefix: '',
        extraHeaders: [
          { header: 'persistent-device-id', storageKey: 'TinderWeb/uuid', parseJson: false }
        ]
      }
    };
  }

  function unwrapResult(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, result && result.error === 'auth-storage-missing'
        ? 'tinder-auth-storage-missing'
        : 'tinder-api-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'tinder-api-http-error');
    }
    if (!isObject(result.data)) {
      return fallback(slug, 'tinder-api-shape-mismatch');
    }
    return { success: true, status: result.status, data: result.data };
  }

  function readHandler(slug, params, requestBuilder, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'tinder-execute-bound-spec-unavailable');
        }
        var request = requestBuilder(args || {});
        var res = await ctx.executeBoundSpec(apiSpec(request.path, request.pairs || []), ctx.tabId);
        var unwrapped = unwrapResult(res, slug);
        if (!unwrapped.success) { return unwrapped; }
        return parser(unwrapped.data, slug);
      }
    };
  }

  function guardedHandler(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, 'tinder-mutation-body-uat-required');
      }
    };
  }

  function dataObject(envelope) {
    return isObject(envelope && envelope.data) ? envelope.data : envelope;
  }

  function mapPhoto(photo) {
    if (!isObject(photo)) { return null; }
    return {
      id: str(photo.id),
      url: str(photo.url),
      processedFiles: list(photo.processedFiles).map(function (file) {
        return isObject(file) ? {
          url: str(file.url),
          height: num(file.height),
          width: num(file.width)
        } : null;
      }).filter(Boolean)
    };
  }

  function mapProfile(user) {
    if (!isObject(user)) { return null; }
    return {
      id: str(user._id || user.id),
      name: str(user.name),
      bio: str(user.bio),
      birth_date: str(user.birth_date),
      gender: num(user.gender),
      jobs: list(user.jobs),
      schools: list(user.schools),
      photos: list(user.photos).map(mapPhoto).filter(Boolean),
      verified: bool(user.is_verified || user.photo_verified),
      distance_mi: num(user.distance_mi || user.distanceMi)
    };
  }

  function mapRecommendation(item) {
    var user = isObject(item && item.user) ? item.user : item;
    var profile = mapProfile(user);
    if (!profile) { return null; }
    return {
      profile: profile,
      content_hash: str(item && item.content_hash),
      s_number: item && item.s_number !== undefined ? num(item.s_number) : null,
      teasers: list(item && item.teasers)
    };
  }

  function mapFastMatchPreview(item) {
    if (!isObject(item)) { return null; }
    return {
      user_id: str(item.user_id || item._id || item.id),
      teaser: str(item.teaser || item.type),
      photo: mapPhoto(item.photo || item)
    };
  }

  function mapMatch(match) {
    if (!isObject(match)) { return null; }
    var person = isObject(match.person) ? match.person : (isObject(match.user) ? match.user : null);
    return {
      id: str(match._id || match.id),
      person: mapProfile(person),
      created_date: str(match.created_date),
      last_activity_date: str(match.last_activity_date),
      message_count: num(match.message_count),
      messages: list(match.messages)
    };
  }

  function parseCurrentUser(data, slug) {
    var d = dataObject(data);
    var user = isObject(d.user) ? d.user : (isObject(data.user) ? data.user : null);
    var profile = mapProfile(user);
    return profile ? { success: true, data: { profile: profile } } : fallback(slug);
  }

  function parseFastMatchCount(data, slug) {
    var d = dataObject(data);
    var count = d.count !== undefined ? d.count : data.count;
    if (count === undefined || count === null) { return fallback(slug); }
    return { success: true, data: { count: num(count) } };
  }

  function parseFastMatchPreview(data, slug) {
    var d = dataObject(data);
    var items = Array.isArray(d.data) ? d.data : (Array.isArray(d.results) ? d.results : (Array.isArray(data.data) ? data.data : []));
    if (!Array.isArray(items)) { return fallback(slug); }
    return {
      success: true,
      data: {
        preview: items.map(mapFastMatchPreview).filter(Boolean),
        count: items.length
      }
    };
  }

  function parseRecommendations(data, slug) {
    var d = dataObject(data);
    var items = Array.isArray(d.results) ? d.results : [];
    if (!Array.isArray(items)) { return fallback(slug); }
    return {
      success: true,
      data: {
        recommendations: items.map(mapRecommendation).filter(Boolean),
        count: items.length
      }
    };
  }

  function parseUser(data, slug) {
    var d = dataObject(data);
    var user = isObject(d.results) ? d.results : (isObject(d.user) ? d.user : (isObject(data.results) ? data.results : null));
    var profile = mapProfile(user);
    return profile ? { success: true, data: { profile: profile } } : fallback(slug);
  }

  function parseMatches(data, slug) {
    var d = dataObject(data);
    var matches = Array.isArray(d.matches) ? d.matches : [];
    if (!Array.isArray(matches)) { return fallback(slug); }
    return {
      success: true,
      data: {
        matches: matches.map(mapMatch).filter(Boolean),
        next_page_token: str(d.next_page_token),
        count: matches.length
      }
    };
  }

  var handlers = {
    'tinder.get_current_user': readHandler(
      'tinder.get_current_user',
      EMPTY_PARAMS,
      function () { return { path: '/v2/profile', pairs: [['include', 'user']] }; },
      parseCurrentUser
    ),
    'tinder.get_fast_match_count': readHandler(
      'tinder.get_fast_match_count',
      EMPTY_PARAMS,
      function () { return { path: '/v2/fast-match/count' }; },
      parseFastMatchCount
    ),
    'tinder.get_fast_match_preview': readHandler(
      'tinder.get_fast_match_preview',
      EMPTY_PARAMS,
      function () { return { path: '/v2/fast-match/teaser' }; },
      parseFastMatchPreview
    ),
    'tinder.get_recommendations': readHandler(
      'tinder.get_recommendations',
      EMPTY_PARAMS,
      function () { return { path: '/v2/recs/core', pairs: [['locale', 'en']] }; },
      parseRecommendations
    ),
    'tinder.get_user': readHandler(
      'tinder.get_user',
      USER_ID_PARAMS,
      function (a) { return { path: '/user/' + encodeSegment(a.user_id) }; },
      parseUser
    ),
    'tinder.list_matches': readHandler(
      'tinder.list_matches',
      LIST_MATCHES_PARAMS,
      function (a) {
        return {
          path: '/v2/matches',
          pairs: [
            ['count', a.count || 25],
            ['locale', 'en'],
            ['is_tinder_u', 'false'],
            ['page_token', a.page_token]
          ]
        };
      },
      parseMatches
    ),
    'tinder.get_metadata': guardedHandler('tinder.get_metadata', 'write', EMPTY_PARAMS),
    'tinder.get_updates': guardedHandler('tinder.get_updates', 'write', UPDATES_PARAMS),
    'tinder.like_message': guardedHandler('tinder.like_message', 'write', MESSAGE_ID_PARAMS),
    'tinder.like_user': guardedHandler('tinder.like_user', 'write', USER_ID_SWIPE_PARAMS),
    'tinder.pass_user': guardedHandler('tinder.pass_user', 'write', USER_ID_SWIPE_PARAMS),
    'tinder.send_message': guardedHandler('tinder.send_message', 'write', MATCH_MESSAGE_PARAMS),
    'tinder.super_like_user': guardedHandler('tinder.super_like_user', 'write', USER_ID_PARAMS),
    'tinder.unmatch': guardedHandler('tinder.unmatch', 'destructive', MATCH_ID_PARAMS),
    'tinder.update_location': guardedHandler('tinder.update_location', 'write', LOCATION_PARAMS),
    'tinder.update_profile': guardedHandler('tinder.update_profile', 'write', UPDATE_PROFILE_PARAMS)
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

  global.FsbHandlerTinder = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
