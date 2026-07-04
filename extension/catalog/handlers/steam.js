(function (global) {
  'use strict';

  /**
   * Steam same-origin T1 head.
   *
   * Public Steam Store reads execute as first-party GET specs on
   * store.steampowered.com. Account/session reads use the same first-party origin
   * or the bounded MAIN-world page-read primitive. Wishlist, follow, ignore, and
   * discovery-queue POST-shaped rows remain guarded fail-closed until live
   * mutation-body UAT records Steam's sessionid/CSRF carrier and redaction proof.
   */

  var ORIGIN = 'https://store.steampowered.com';
  var SERVICE = 'store.steampowered.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var APP_PARAMS = schema({
    appid: integerSchema('Steam app ID', 1, INT_LIMIT)
  }, ['appid']);
  var SEARCH_PARAMS = schema({
    term: { type: 'string', minLength: 1, description: 'Search query' },
    count: integerSchema('Maximum number of results to return', 1, 25)
  }, ['term']);
  var REVIEWS_PARAMS = schema({
    appid: integerSchema('Steam app ID', 1, INT_LIMIT),
    language: { type: 'string', description: 'Language filter' },
    num_per_page: integerSchema('Reviews per page', 1, 100),
    cursor: { type: 'string', description: 'Pagination cursor' },
    filter: { type: 'string', enum: ['recent', 'updated', 'all'], description: 'Review filter' },
    review_type: { type: 'string', enum: ['all', 'positive', 'negative'], description: 'Review sentiment filter' }
  }, ['appid']);
  var DISCOVERY_PARAMS = schema({
    queue_type: integerSchema('Queue type: 0 = new releases, 1 = popular upcoming, 2 = deals', 0, 2)
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
      reason: reason || 'steam-store-shape-mismatch',
      fellBackToDom: true
    });
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value) {
    var n = Number(str(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value) {
    return value === true || value === 1 || value === '1';
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
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

  function jsonSpec(path, pairs) {
    return {
      url: ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function parseJson(text) {
    if (typeof text !== 'string' || !text.trim()) { return null; }
    try { return JSON.parse(text); } catch (_e) { return null; }
  }

  function resultData(result, slug, prefix) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, prefix + '-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, prefix + '-http-error') };
    }
    if (result.data !== undefined && result.data !== null) {
      return { data: result.data };
    }
    var text = typeof result.text === 'string' ? result.text
      : (typeof result.body === 'string' ? result.body : '');
    var parsed = parseJson(text);
    if (parsed !== null) { return { data: parsed }; }
    return { error: fallback(slug, prefix + '-empty') };
  }

  async function readJson(slug, spec, ctx, prefix) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'steam-execute-bound-spec-unavailable') };
    }
    return resultData(await ctx.executeBoundSpec(spec, ctx.tabId), slug, prefix || 'steam');
  }

  function mapPrice(raw) {
    if (!isObject(raw)) { return null; }
    return {
      currency: str(raw.currency),
      initial: num(raw.initial),
      final: num(raw.final),
      discount_percent: num(raw.discount_percent),
      final_formatted: str(raw.final_formatted || raw.finalFormatted)
    };
  }

  function mapSearchItem(item) {
    return {
      id: num(item && (item.id || item.appid)),
      name: str(item && item.name),
      type: str(item && item.type),
      price: isObject(item && item.price) ? mapPrice(item.price) : null,
      tiny_image: str(item && (item.tiny_image || item.tinyImage)),
      metascore: num(item && item.metascore)
    };
  }

  function mapFeaturedGame(item) {
    return {
      id: num(item && (item.id || item.appid)),
      name: str(item && item.name),
      price: mapPrice(item && item.price),
      windows_available: bool(item && item.windows_available),
      mac_available: bool(item && item.mac_available),
      linux_available: bool(item && item.linux_available),
      discount_percent: num(item && item.discount_percent),
      header_image: str(item && (item.header_image || item.large_capsule_image || item.small_capsule_image))
    };
  }

  function mapCategory(category) {
    return {
      name: str(category && category.name),
      items: list(category && category.items).map(mapFeaturedGame)
    };
  }

  function mapTag(tag) {
    return {
      id: num(tag && (tag.tagid || tag.id)),
      name: str(tag && tag.name),
      count: num(tag && tag.count)
    };
  }

  function mapAppDetails(app) {
    var price = mapPrice(app && app.price_overview);
    return {
      appid: num(app && (app.steam_appid || app.appid)),
      name: str(app && app.name),
      type: str(app && app.type),
      short_description: str(app && app.short_description),
      detailed_description: str(app && app.detailed_description),
      header_image: str(app && app.header_image),
      website: str(app && app.website),
      price: price,
      is_free: bool(app && app.is_free),
      platforms: {
        windows: bool(app && app.platforms && app.platforms.windows),
        mac: bool(app && app.platforms && app.platforms.mac),
        linux: bool(app && app.platforms && app.platforms.linux)
      },
      genres: list(app && app.genres).map(function (g) {
        return { id: str(g && g.id), description: str(g && g.description) };
      }),
      categories: list(app && app.categories).map(function (c) {
        return { id: num(c && c.id), description: str(c && c.description) };
      }),
      release_date: app && app.release_date ? {
        coming_soon: bool(app.release_date.coming_soon),
        date: str(app.release_date.date)
      } : null,
      metacritic: app && app.metacritic ? {
        score: num(app.metacritic.score),
        url: str(app.metacritic.url)
      } : null
    };
  }

  function mapReview(review) {
    var author = isObject(review && review.author) ? review.author : {};
    return {
      recommendationid: str(review && review.recommendationid),
      review: str(review && review.review),
      voted_up: bool(review && review.voted_up),
      votes_up: num(review && review.votes_up),
      votes_funny: num(review && review.votes_funny),
      weighted_vote_score: num(review && review.weighted_vote_score),
      steam_purchase: bool(review && review.steam_purchase),
      received_for_free: bool(review && review.received_for_free),
      written_during_early_access: bool(review && review.written_during_early_access),
      author: {
        steamid: str(author.steamid),
        num_games_owned: num(author.num_games_owned),
        num_reviews: num(author.num_reviews),
        playtime_forever: num(author.playtime_forever),
        playtime_at_review: num(author.playtime_at_review),
        last_played: num(author.last_played)
      }
    };
  }

  function normalizeAppId(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function readHandler(slug, params, pathForArgs, mapData, prefix) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var spec = pathForArgs(args || {});
        if (!spec) { return fallback(slug, prefix + '-invalid-args'); }
        var out = await readJson(slug, spec, ctx, prefix);
        if (out.error) { return out.error; }
        var mapped = mapData(out.data, args || {});
        if (mapped && mapped.success === false) { return mapped; }
        return { success: true, status: 200, data: mapped };
      }
    };
  }

  function pageReadHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'steam-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'steam',
          action: action,
          args: args || {}
        }, ctx.tabId);
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
    'steam.search_store': readHandler(
      'steam.search_store',
      SEARCH_PARAMS,
      function (args) {
        return jsonSpec('/api/storesearch/', [
          ['term', args.term],
          ['l', 'english'],
          ['cc', 'US']
        ]);
      },
      function (data, args) {
        var count = args.count || 10;
        return {
          total: num(data && data.total),
          items: list(data && data.items).slice(0, count).map(mapSearchItem)
        };
      },
      'steam-search'
    ),
    'steam.get_app_details': readHandler(
      'steam.get_app_details',
      APP_PARAMS,
      function (args) {
        var appid = normalizeAppId(args.appid);
        return appid ? jsonSpec('/api/appdetails', [['appids', appid]]) : null;
      },
      function (data, args) {
        var appid = String(normalizeAppId(args.appid));
        var entry = data && data[appid];
        if (!entry || entry.success !== true || !entry.data) {
          return fallback('steam.get_app_details', 'steam-app-details-not-found');
        }
        return { app: mapAppDetails(entry.data) };
      },
      'steam-app-details'
    ),
    'steam.get_featured': readHandler(
      'steam.get_featured',
      EMPTY_PARAMS,
      function () { return jsonSpec('/api/featured/', []); },
      function (data) {
        return {
          large_capsules: list(data && data.large_capsules).map(mapFeaturedGame),
          featured_win: list(data && data.featured_win).map(mapFeaturedGame),
          featured_mac: list(data && data.featured_mac).map(mapFeaturedGame),
          featured_linux: list(data && data.featured_linux).map(mapFeaturedGame)
        };
      },
      'steam-featured'
    ),
    'steam.get_featured_categories': readHandler(
      'steam.get_featured_categories',
      EMPTY_PARAMS,
      function () { return jsonSpec('/api/featuredcategories/', []); },
      function (data) {
        return {
          specials: mapCategory(data && data.specials),
          top_sellers: mapCategory(data && data.top_sellers),
          new_releases: mapCategory(data && data.new_releases),
          coming_soon: mapCategory(data && data.coming_soon)
        };
      },
      'steam-featured-categories'
    ),
    'steam.get_app_reviews': readHandler(
      'steam.get_app_reviews',
      REVIEWS_PARAMS,
      function (args) {
        var appid = normalizeAppId(args.appid);
        return appid ? jsonSpec('/appreviews/' + encodeURIComponent(String(appid)), [
          ['json', 1],
          ['language', args.language || 'all'],
          ['num_per_page', args.num_per_page || 20],
          ['cursor', args.cursor || '*'],
          ['filter', args.filter || 'all'],
          ['review_type', args.review_type || 'all']
        ]) : null;
      },
      function (data) {
        var qs = isObject(data && data.query_summary) ? data.query_summary : {};
        return {
          summary: {
            total_reviews: num(qs.total_reviews),
            total_positive: num(qs.total_positive),
            total_negative: num(qs.total_negative),
            review_score_desc: str(qs.review_score_desc)
          },
          reviews: list(data && data.reviews).map(mapReview),
          cursor: str(data && data.cursor)
        };
      },
      'steam-app-reviews'
    ),
    'steam.get_popular_tags': readHandler(
      'steam.get_popular_tags',
      EMPTY_PARAMS,
      function () { return jsonSpec('/tagdata/populartags/english', []); },
      function (data) { return { tags: list(data).map(mapTag) }; },
      'steam-popular-tags'
    ),
    'steam.get_user_data': readHandler(
      'steam.get_user_data',
      EMPTY_PARAMS,
      function () { return jsonSpec('/dynamicstore/userdata/', []); },
      function (data) {
        var ignored = data && data.rgIgnoredApps ? Object.keys(data.rgIgnoredApps).map(num) : [];
        return {
          user_data: {
            wishlist: list(data && data.rgWishlist).map(num),
            owned_apps: list(data && data.rgOwnedApps).map(num),
            owned_packages: list(data && data.rgOwnedPackages).map(num),
            followed_apps: list(data && data.rgFollowedApps).map(num),
            ignored_apps: ignored,
            recommended_tags: list(data && data.rgRecommendedTags).map(mapTag),
            cart_line_item_count: num(data && data.nCartLineItemCount)
          }
        };
      },
      'steam-user-data'
    ),
    'steam.get_app_user_details': readHandler(
      'steam.get_app_user_details',
      APP_PARAMS,
      function (args) {
        var appid = normalizeAppId(args.appid);
        return appid ? jsonSpec('/api/appuserdetails/', [['appids', appid]]) : null;
      },
      function (data, args) {
        var appid = String(normalizeAppId(args.appid));
        var entry = data && data[appid];
        if (!entry || entry.success !== true || !entry.data) {
          return fallback('steam.get_app_user_details', 'steam-app-user-details-not-found');
        }
        return {
          details: {
            is_owned: bool(entry.data.is_owned),
            added_to_wishlist: bool(entry.data.added_to_wishlist),
            friends_own: list(entry.data.friendsown).map(function (f) {
              return {
                steamid: str(f && f.steamid),
                persona_name: str(f && (f.persona_name || f.persona)),
                playtime_total: num(f && f.playtime_total),
                playtime_twoweeks: num(f && f.playtime_twoweeks)
              };
            })
          }
        };
      },
      'steam-app-user-details'
    ),
    'steam.get_current_user': pageReadHandler('steam.get_current_user', EMPTY_PARAMS, 'get_current_user'),

    'steam.generate_discovery_queue': guarded(
      'steam.generate_discovery_queue',
      'write',
      DISCOVERY_PARAMS,
      'unverified-steam-generate-discovery-queue-mutation'
    ),
    'steam.add_to_wishlist': guarded(
      'steam.add_to_wishlist',
      'write',
      APP_PARAMS,
      'unverified-steam-add-to-wishlist-mutation'
    ),
    'steam.follow_app': guarded(
      'steam.follow_app',
      'write',
      APP_PARAMS,
      'unverified-steam-follow-app-mutation'
    ),
    'steam.ignore_app': guarded(
      'steam.ignore_app',
      'write',
      APP_PARAMS,
      'unverified-steam-ignore-app-mutation'
    ),
    'steam.unignore_app': guarded(
      'steam.unignore_app',
      'write',
      APP_PARAMS,
      'unverified-steam-unignore-app-mutation'
    ),
    'steam.remove_from_wishlist': guarded(
      'steam.remove_from_wishlist',
      'destructive',
      APP_PARAMS,
      'unverified-steam-remove-from-wishlist-mutation'
    )
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

  global.FsbHandlerSteam = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
