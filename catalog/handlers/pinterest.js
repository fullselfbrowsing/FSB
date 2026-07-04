(function (global) {
  'use strict';

  /**
   * Pinterest same-origin resource READ head.
   *
   * Pinterest's web app calls first-party /resource/<Resource>/<action>/ endpoints
   * on www.pinterest.com. This handler ports only read-proven resource calls and
   * uses executeBoundSpec cookie-CSRF injection for X-CSRFToken. Mutation-like
   * resource POSTs stay guarded fail-closed until live mutation-body UAT exists.
   */

  var PINTEREST_ORIGIN = 'https://www.pinterest.com';
  var PINTEREST_SERVICE = 'pinterest.com';
  var RESOURCE_BASE = PINTEREST_ORIGIN + '/resource/';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var PIN_ID = { type: 'string', minLength: 1, description: 'Pinterest pin ID' };
  var BOARD_ID = { type: 'string', minLength: 1, description: 'Pinterest board ID' };
  var USERNAME = { type: 'string', minLength: 1, description: 'Pinterest username' };
  var BOOKMARK = { type: 'string', description: 'Pagination cursor from a previous response' };
  var PAGE_SIZE = integerSchema('Number of results to return', 1, 50);

  var PIN_PARAMS = schema({ pin_id: PIN_ID }, ['pin_id']);
  var PIN_PAGE_PARAMS = schema({ pin_id: PIN_ID, page_size: PAGE_SIZE, bookmark: BOOKMARK }, ['pin_id']);
  var USERNAME_PARAMS = schema({ username: USERNAME }, ['username']);
  var USER_PAGE_PARAMS = schema({ username: USERNAME, page_size: PAGE_SIZE, bookmark: BOOKMARK }, ['username']);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' },
    page_size: PAGE_SIZE,
    bookmark: BOOKMARK
  }, ['query']);
  var BOARD_PINS_PARAMS = schema({
    board_id: BOARD_ID,
    board_url: { type: 'string', minLength: 1, description: 'Pinterest board URL path' },
    page_size: PAGE_SIZE,
    bookmark: BOOKMARK
  }, ['board_id', 'board_url']);
  var BOARD_SECTIONS_PARAMS = schema({
    board_id: BOARD_ID,
    board_url: { type: 'string', description: 'Pinterest board URL path' }
  }, ['board_id']);

  var CREATE_BOARD_PARAMS = schema({
    name: { type: 'string', minLength: 1, description: 'Board name' },
    description: { type: 'string', description: 'Board description' },
    privacy: { type: 'string', enum: ['public', 'secret'], description: 'Board privacy' }
  }, ['name']);
  var CREATE_SECTION_PARAMS = schema({
    board_id: BOARD_ID,
    title: { type: 'string', minLength: 1, description: 'Section title' }
  }, ['board_id', 'title']);
  var CREATE_PIN_PARAMS = schema({
    board_id: BOARD_ID,
    title: { type: 'string', description: 'Pin title' },
    description: { type: 'string', description: 'Pin description' },
    link: { type: 'string', description: 'Destination link' },
    image_url: { type: 'string', description: 'Image URL' },
    section_id: { type: 'string', description: 'Board section ID' }
  }, ['board_id']);
  var SAVE_PIN_PARAMS = schema({
    pin_id: PIN_ID,
    board_id: BOARD_ID,
    section_id: { type: 'string', description: 'Board section ID' }
  }, ['pin_id', 'board_id']);
  var UPDATE_BOARD_PARAMS = schema({
    board_id: BOARD_ID,
    name: { type: 'string', description: 'Board name' },
    description: { type: 'string', description: 'Board description' },
    privacy: { type: 'string', enum: ['public', 'secret'], description: 'Board privacy' }
  }, ['board_id']);
  var BOARD_DELETE_PARAMS = schema({ board_id: BOARD_ID }, ['board_id']);
  var SECTION_DELETE_PARAMS = schema({
    board_id: BOARD_ID,
    section_id: { type: 'string', minLength: 1, description: 'Board section ID' }
  }, ['board_id', 'section_id']);
  var USER_ID_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Pinterest user ID' }
  }, ['user_id']);

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
      reason: reason || 'pinterest-resource-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function encodeQueryValue(value) {
    return encodeURIComponent(String(value || ''));
  }

  function cloneOptions(options) {
    var out = {};
    var src = options || {};
    for (var key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) {
        var value = src[key];
        if (value !== undefined && value !== null && value !== '') { out[key] = value; }
      }
    }
    return out;
  }

  function pageSize(args) {
    var n = args && typeof args.page_size === 'number' ? args.page_size : 25;
    if (n < 1) { return 1; }
    if (n > 50) { return 50; }
    return Math.floor(n);
  }

  function withBookmark(options, bookmark) {
    var out = cloneOptions(options);
    if (bookmark) { out.bookmarks = [String(bookmark)]; }
    return out;
  }

  function resourceEnvelope(options) {
    return JSON.stringify({ options: options || {}, context: {} });
  }

  function resourceHeaders(sourceUrl) {
    return {
      'Accept': 'application/json, text/javascript, */*, q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Pinterest-AppState': 'active',
      'X-Pinterest-PWS-Handler': 'www/index.js',
      'X-Pinterest-Source-Url': sourceUrl || '/',
      'X-APP-VERSION': ''
    };
  }

  function resourceGetSpec(resource, options, sourceUrl, bookmark) {
    var source = sourceUrl || '/';
    var opts = withBookmark(options, bookmark);
    return {
      url: RESOURCE_BASE + resource + '/get/?source_url=' + encodeQueryValue(source) +
        '&data=' + encodeQueryValue(resourceEnvelope(opts)),
      method: 'GET',
      headers: resourceHeaders(source),
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'csrftoken', header: 'X-CSRFToken' },
      origin: PINTEREST_ORIGIN,
      extract: '@'
    };
  }

  function formEncode(pairs) {
    var parts = [];
    for (var i = 0; i < pairs.length; i++) {
      parts.push(encodeQueryValue(pairs[i][0]) + '=' + encodeQueryValue(pairs[i][1]));
    }
    return parts.join('&');
  }

  function resourcePostSpec(resource, action, options, sourceUrl) {
    var source = sourceUrl || '/';
    var headers = resourceHeaders(source);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    return {
      url: RESOURCE_BASE + resource + '/' + action + '/',
      method: 'POST',
      headers: headers,
      body: formEncode([
        ['source_url', source],
        ['data', resourceEnvelope(cloneOptions(options))]
      ]),
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'csrftoken', header: 'X-CSRFToken' },
      origin: PINTEREST_ORIGIN,
      extract: '@'
    };
  }

  function unwrapResource(result, slug) {
    if (!result || result.success !== true) { return result || fallback(slug, 'pinterest-resource-unavailable'); }
    if (result.redirected || result.status === 401 || result.status === 403 || result.status >= 400) {
      return fallback(slug, 'pinterest-resource-logged-out');
    }
    var data = result.data;
    if (!isObject(data)) { return fallback(slug, 'pinterest-resource-shape-mismatch'); }
    var rr = data.resource_response;
    if (!isObject(rr)) { return fallback(slug, 'pinterest-resource-shape-mismatch'); }
    if (rr.error || rr.http_status >= 400 || rr.status === 'failure') {
      return fallback(slug, 'pinterest-resource-error-envelope');
    }
    if (!Object.prototype.hasOwnProperty.call(rr, 'data')) {
      return fallback(slug, 'pinterest-resource-shape-mismatch');
    }
    var bookmark = '';
    if (data.resource && data.resource.options && Array.isArray(data.resource.options.bookmarks)) {
      bookmark = data.resource.options.bookmarks[0] || '';
    }
    if (!bookmark && typeof rr.bookmark === 'string') { bookmark = rr.bookmark; }
    return { payload: rr.data, bookmark: bookmark };
  }

  function unwrapCurrentUser(result, slug) {
    if (!result || result.success !== true) { return result || fallback(slug, 'pinterest-resource-unavailable'); }
    if (result.redirected || result.status === 401 || result.status === 403 || result.status >= 400) {
      return fallback(slug, 'pinterest-resource-logged-out');
    }
    var data = result.data;
    var user = data && data.client_context && data.client_context.user;
    if (!isObject(user) || !user.id) { return fallback(slug, 'pinterest-current-user-shape-mismatch'); }
    return { user: user };
  }

  function decodeBase64(value) {
    if (typeof value !== 'string' || !value) { return ''; }
    try {
      if (typeof atob === 'function') { return atob(value); }
    } catch (e) {
      return '';
    }
    try {
      if (typeof Buffer !== 'undefined') { return Buffer.from(value, 'base64').toString('utf8'); }
    } catch (e2) {
      return '';
    }
    return '';
  }

  function extractPinId(pin) {
    if (pin && pin.id) { return String(pin.id); }
    var decoded = decodeBase64(pin && pin.node_id);
    var match = /^Pin:(.+)$/.exec(decoded);
    return match && match[1] ? match[1] : '';
  }

  function numberValue(value) {
    return typeof value === 'number' && isFinite(value) ? value : 0;
  }

  function stringValue(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function mapUser(raw) {
    var u = isObject(raw) ? raw : {};
    var name = u.full_name || ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
    return {
      id: stringValue(u.id),
      username: stringValue(u.username),
      full_name: stringValue(name),
      image_url: stringValue(u.image_xlarge_url || u.image_large_url || u.image_medium_url),
      follower_count: numberValue(u.follower_count),
      following_count: numberValue(u.following_count),
      pin_count: numberValue(u.pin_count),
      board_count: numberValue(u.board_count),
      is_partner: u.is_partner === true
    };
  }

  function mapCurrentUser(raw) {
    var user = mapUser(raw);
    raw = isObject(raw) ? raw : {};
    user.email = stringValue(raw.email);
    user.country = stringValue(raw.country);
    user.created_at = stringValue(raw.created_at);
    return user;
  }

  function mapBoard(raw) {
    var b = isObject(raw) ? raw : {};
    return {
      id: stringValue(b.id),
      name: stringValue(b.name),
      description: stringValue(b.description),
      url: stringValue(b.url),
      pin_count: numberValue(b.pin_count),
      follower_count: numberValue(b.follower_count),
      section_count: numberValue(b.section_count),
      privacy: stringValue(b.privacy || 'public'),
      is_collaborative: b.is_collaborative === true,
      created_at: stringValue(b.created_at),
      image_url: stringValue(b.image_cover_url || b.image_thumbnail_url),
      owner_username: stringValue(b.owner && b.owner.username)
    };
  }

  function mapBoardSection(raw) {
    var s = isObject(raw) ? raw : {};
    return {
      id: stringValue(s.id),
      title: stringValue(s.title),
      pin_count: numberValue(s.pin_count),
      slug: stringValue(s.slug)
    };
  }

  function mapPin(raw) {
    var p = isObject(raw) ? raw : {};
    var images = isObject(p.images) ? p.images : {};
    var orig = isObject(images.orig) ? images.orig : {};
    var image736 = isObject(images['736x']) ? images['736x'] : {};
    return {
      id: extractPinId(p),
      title: stringValue(p.title),
      description: stringValue(p.description || p.auto_alt_text),
      link: stringValue(p.link),
      image_url: stringValue(orig.url || image736.url || p.image_medium_size_url),
      dominant_color: stringValue(p.dominant_color),
      is_video: p.is_video === true,
      repin_count: numberValue(p.repin_count),
      comment_count: numberValue(p.comment_count),
      pinner_username: stringValue(p.pinner && p.pinner.username),
      board_name: stringValue((p.board && p.board.name) || (p.pinned_to_board && p.pinned_to_board.name)),
      created_at: stringValue(p.created_at)
    };
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function readHandler(slug, params, buildSpec, mapPayload) {
    return {
      tier: 'T1a',
      origin: PINTEREST_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'pinterest-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(buildSpec(args || {}), ctx.tabId);
        var unwrapped = unwrapResource(res, slug);
        if (!unwrapped || unwrapped.success === false) { return unwrapped; }
        return {
          success: true,
          status: res.status,
          data: mapPayload(unwrapped.payload, unwrapped.bookmark)
        };
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: PINTEREST_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason || 'unverified-pinterest-mutation');
      }
    };
  }

  var handlers = {
    'pinterest.get_current_user': {
      tier: 'T1a',
      origin: PINTEREST_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('pinterest.get_current_user', 'pinterest-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(resourcePostSpec('ApiSResource', 'create', {
          source: 'browser',
          stats: [],
          keepAlive: false
        }, '/'), ctx.tabId);
        var unwrapped = unwrapCurrentUser(res, 'pinterest.get_current_user');
        if (!unwrapped || unwrapped.success === false) { return unwrapped; }
        return { success: true, status: res.status, data: { user: mapCurrentUser(unwrapped.user) } };
      }
    },
    'pinterest.get_board_pins': readHandler('pinterest.get_board_pins', BOARD_PINS_PARAMS, function (args) {
      return resourceGetSpec('BoardFeedResource', {
        board_id: args.board_id,
        board_url: args.board_url,
        field_set_key: 'react_grid_pin',
        page_size: pageSize(args)
      }, args.board_url, args.bookmark);
    }, function (payload, bookmark) {
      return { pins: ensureArray(payload).map(mapPin), bookmark: bookmark };
    }),
    'pinterest.get_board_sections': readHandler('pinterest.get_board_sections', BOARD_SECTIONS_PARAMS, function (args) {
      return resourceGetSpec('BoardSectionsResource', { board_id: args.board_id }, args.board_url || '/', null);
    }, function (payload) {
      return { sections: ensureArray(payload).map(mapBoardSection) };
    }),
    'pinterest.get_home_feed': readHandler('pinterest.get_home_feed', schema({ bookmark: BOOKMARK }, []), function (args) {
      return resourceGetSpec('UserHomefeedResource', {
        field_set_key: 'hifi',
        in_nux: false,
        prependPartner: [],
        prependUserNews: false
      }, '/', args.bookmark);
    }, function (payload, bookmark) {
      return { pins: ensureArray(payload).map(mapPin), bookmark: bookmark };
    }),
    'pinterest.get_notification_counts': readHandler('pinterest.get_notification_counts', EMPTY_PARAMS, function () {
      return resourceGetSpec('NewsHubBadgeResource', {}, '/', null);
    }, function (payload) {
      return { counts: isObject(payload) ? payload : {} };
    }),
    'pinterest.get_pin': readHandler('pinterest.get_pin', PIN_PARAMS, function (args) {
      return resourceGetSpec('PinResource', {
        id: args.pin_id,
        field_set_key: 'detailed'
      }, '/pin/' + args.pin_id + '/', null);
    }, function (payload) {
      return { pin: mapPin(payload) };
    }),
    'pinterest.get_related_pins': readHandler('pinterest.get_related_pins', PIN_PAGE_PARAMS, function (args) {
      return resourceGetSpec('RelatedPinFeedResource', {
        pin: args.pin_id,
        page_size: pageSize(args),
        field_set_key: 'unauth_react'
      }, '/pin/' + args.pin_id + '/', args.bookmark);
    }, function (payload, bookmark) {
      return { pins: ensureArray(payload).map(mapPin), bookmark: bookmark };
    }),
    'pinterest.get_user_pins': readHandler('pinterest.get_user_pins', USER_PAGE_PARAMS, function (args) {
      return resourceGetSpec('UserPinsResource', {
        username: args.username,
        field_set_key: 'grid_item',
        page_size: pageSize(args)
      }, '/' + args.username + '/_created/', args.bookmark);
    }, function (payload, bookmark) {
      return { pins: ensureArray(payload).map(mapPin), bookmark: bookmark };
    }),
    'pinterest.get_user_profile': readHandler('pinterest.get_user_profile', USERNAME_PARAMS, function (args) {
      return resourceGetSpec('UserResource', {
        username: args.username,
        field_set_key: 'profile'
      }, '/' + args.username + '/', null);
    }, function (payload) {
      return { user: mapUser(payload) };
    }),
    'pinterest.list_boards': readHandler('pinterest.list_boards', USER_PAGE_PARAMS, function (args) {
      return resourceGetSpec('BoardsResource', {
        username: args.username,
        page_size: pageSize(args),
        privacy_filter: 'all',
        sort: 'last_pinned_to',
        field_set_key: 'profile_grid_item',
        include_board_pins: false
      }, '/' + args.username + '/', args.bookmark);
    }, function (payload, bookmark) {
      return { boards: ensureArray(payload).map(mapBoard), bookmark: bookmark };
    }),
    'pinterest.list_followers': readHandler('pinterest.list_followers', USER_PAGE_PARAMS, function (args) {
      return resourceGetSpec('UserFollowersResource', {
        username: args.username,
        page_size: pageSize(args)
      }, '/' + args.username + '/followers/', args.bookmark);
    }, function (payload, bookmark) {
      return { users: ensureArray(payload).map(mapUser), bookmark: bookmark };
    }),
    'pinterest.list_following': readHandler('pinterest.list_following', USER_PAGE_PARAMS, function (args) {
      return resourceGetSpec('UserFollowingResource', {
        username: args.username,
        page_size: pageSize(args)
      }, '/' + args.username + '/following/', args.bookmark);
    }, function (payload, bookmark) {
      return { users: ensureArray(payload).map(mapUser), bookmark: bookmark };
    }),
    'pinterest.search_boards': readHandler('pinterest.search_boards', SEARCH_PARAMS, function (args) {
      return resourceGetSpec('BaseSearchResource', {
        query: args.query,
        scope: 'boards',
        field_set_key: 'unauth_react',
        page_size: pageSize(args)
      }, '/search/boards/?q=' + encodeQueryValue(args.query), args.bookmark);
    }, function (payload, bookmark) {
      return { boards: ensureArray(payload && payload.results).map(mapBoard), bookmark: bookmark };
    }),
    'pinterest.search_pins': readHandler('pinterest.search_pins', SEARCH_PARAMS, function (args) {
      return resourceGetSpec('BaseSearchResource', {
        query: args.query,
        scope: 'pins',
        field_set_key: 'unauth_react',
        page_size: pageSize(args)
      }, '/search/pins/?q=' + encodeQueryValue(args.query), args.bookmark);
    }, function (payload, bookmark) {
      return { pins: ensureArray(payload && payload.results).map(mapPin), bookmark: bookmark };
    }),

    'pinterest.create_board': guarded('pinterest.create_board', 'write', CREATE_BOARD_PARAMS, 'unverified-pinterest-create-board-mutation'),
    'pinterest.create_board_section': guarded('pinterest.create_board_section', 'write', CREATE_SECTION_PARAMS, 'unverified-pinterest-create-board-section-mutation'),
    'pinterest.create_pin': guarded('pinterest.create_pin', 'write', CREATE_PIN_PARAMS, 'unverified-pinterest-create-pin-mutation'),
    'pinterest.delete_board': guarded('pinterest.delete_board', 'destructive', BOARD_DELETE_PARAMS, 'unverified-pinterest-delete-board-mutation'),
    'pinterest.delete_board_section': guarded('pinterest.delete_board_section', 'destructive', SECTION_DELETE_PARAMS, 'unverified-pinterest-delete-board-section-mutation'),
    'pinterest.delete_pin': guarded('pinterest.delete_pin', 'destructive', PIN_PARAMS, 'unverified-pinterest-delete-pin-mutation'),
    'pinterest.follow_user': guarded('pinterest.follow_user', 'write', USER_ID_PARAMS, 'unverified-pinterest-follow-user-mutation'),
    'pinterest.save_pin': guarded('pinterest.save_pin', 'write', SAVE_PIN_PARAMS, 'unverified-pinterest-save-pin-mutation'),
    'pinterest.unfollow_user': guarded('pinterest.unfollow_user', 'write', USER_ID_PARAMS, 'unverified-pinterest-unfollow-user-mutation'),
    'pinterest.update_board': guarded('pinterest.update_board', 'write', UPDATE_BOARD_PARAMS, 'unverified-pinterest-update-board-mutation')
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
            service: PINTEREST_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerPinterest = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
