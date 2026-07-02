(function (global) {
  'use strict';

  /**
   * Facebook conservative same-origin READ head.
   *
   * Activates only reviewed first-party HTML reads. Relay GraphQL rows and
   * friend/reaction mutations stay out of the executable path until live request
   * shape evidence exists.
   */

  var ORIGIN = 'https://www.facebook.com';
  var SERVICE = 'facebook.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var MARKETPLACE_SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search keywords' }
  }, ['query']);
  var USER_ID_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Facebook user ID' }
  }, ['user_id']);
  var REACTION_PARAMS = schema({
    feedback_id: { type: 'string', minLength: 1, description: 'Feedback ID of the post' },
    reaction: {
      type: 'string',
      enum: ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY', 'NONE'],
      description: 'Reaction type'
    }
  }, ['feedback_id', 'reaction']);

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
      reason: reason || 'facebook-public-html-shape-mismatch',
      fellBackToDom: true
    });
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function getSpec(path) {
    return {
      url: ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function htmlDecode(value) {
    var text = String(value || '');
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function(match, entity) {
      var lower = String(entity || '').toLowerCase();
      if (lower === 'amp') { return '&'; }
      if (lower === 'lt') { return '<'; }
      if (lower === 'gt') { return '>'; }
      if (lower === 'quot') { return '"'; }
      if (lower === 'apos' || lower === '#39' || lower === '#x27') { return '\''; }
      if (lower === 'nbsp') { return ' '; }
      if (lower.charAt(0) === '#') {
        var base = lower.charAt(1) === 'x' ? 16 : 10;
        var raw = lower.charAt(1) === 'x' ? lower.slice(2) : lower.slice(1);
        var code = parseInt(raw, base);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try { return String.fromCodePoint(code); } catch (e) { return match; }
        }
      }
      return match;
    });
  }

  function stripTags(value) {
    return htmlDecode(String(value || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function attrValue(attrs, name) {
    var quoted = new RegExp('\\b' + name + '\\s*=\\s*([\'"])([\\s\\S]*?)\\1', 'i').exec(attrs || '');
    if (quoted) { return htmlDecode(quoted[2]); }
    var bare = new RegExp('\\b' + name + '\\s*=\\s*([^\\s>]+)', 'i').exec(attrs || '');
    return bare ? htmlDecode(bare[1]) : '';
  }

  function metaContent(html, key, value) {
    var re = /<meta\b([^>]*)>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1] || '';
      var prop = attrValue(attrs, key);
      if (prop && prop.toLowerCase() === String(value || '').toLowerCase()) {
        return attrValue(attrs, 'content');
      }
    }
    return '';
  }

  function titleText(html) {
    var m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
    return m ? stripTags(m[1]) : '';
  }

  function cleanTitle(value) {
    return stripTags(value)
      .replace(/\s*\|\s*Facebook\s*$/i, '')
      .replace(/\s*-\s*Facebook\s*$/i, '')
      .trim();
  }

  function jsonStringValue(html, key) {
    var re = new RegExp('"' + key + '"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"', 'i');
    var m = re.exec(String(html || ''));
    if (!m) { return ''; }
    try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return htmlDecode(m[1]); }
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) { return result || fallback(slug, 'facebook-public-html-unavailable'); }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'facebook-public-html-http-or-redirect');
    }
    if (typeof result.text !== 'string' || result.text.indexOf('<') === -1) {
      return fallback(slug, 'facebook-public-html-shape-mismatch');
    }
    return { success: true, text: result.text, status: result.status, finalUrl: result.finalUrl, redirected: result.redirected };
  }

  function parseCurrentUser(html) {
    var id = jsonStringValue(html, 'USER_ID');
    if (id === '0') { id = ''; }
    var name = jsonStringValue(html, 'NAME') ||
      cleanTitle(metaContent(html, 'property', 'og:title') || titleText(html));
    var shortName = jsonStringValue(html, 'SHORT_NAME') || String(name || '').split(/\s+/)[0] || '';
    if (!id || !name) { return null; }
    return {
      user: {
        id: id,
        name: name,
        short_name: shortName
      }
    };
  }

  function scriptJsonBodies(html) {
    var out = [];
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      var attrs = m[1] || '';
      var type = attrValue(attrs, 'type').toLowerCase();
      if (type && type !== 'application/json') { continue; }
      var body = String(m[2] || '').trim()
        .replace(/^<!--\s*/, '')
        .replace(/\s*-->$/, '')
        .trim();
      if (body && (body.charAt(0) === '{' || body.charAt(0) === '[')) { out.push(body); }
    }
    return out;
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function listingId(listing) {
    return str(listing && (listing.id || listing.listing_id || listing.__id));
  }

  function mapListing(listing) {
    var price = listing.listing_price || listing.price || {};
    var location = listing.location || {};
    var geo = location.reverse_geocode || location;
    var seller = listing.marketplace_listing_seller || listing.seller || {};
    var photo = listing.primary_listing_photo || listing.primary_photo || listing.photo || {};
    var image = photo.image || photo;
    return {
      id: listingId(listing),
      title: str(listing.marketplace_listing_title || listing.title || listing.name),
      price: str(price.formatted_amount || price.text || price.amount_with_offset || ''),
      price_amount: str(price.amount || price.amount_with_offset || ''),
      location: [geo.city, geo.state].filter(Boolean).join(', '),
      seller_name: str(seller.name || seller.display_name),
      image_url: str(image.uri || image.url || ''),
      is_sold: listing.is_sold === true,
      category_id: str(listing.marketplace_listing_category_id || listing.category_id)
    };
  }

  function collectListings(root) {
    var out = [];
    var seen = {};
    var stack = [root];
    var steps = 0;
    while (stack.length && steps < 1500) {
      steps++;
      var value = stack.pop();
      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) { stack.push(value[i]); }
        continue;
      }
      if (!isObject(value)) { continue; }

      var candidate = isObject(value.listing) ? value.listing : value;
      if (isObject(candidate) && (candidate.marketplace_listing_title || candidate.listing_price ||
          candidate.marketplace_listing_seller || candidate.primary_listing_photo)) {
        var mapped = mapListing(candidate);
        if ((mapped.id || mapped.title) && !seen[mapped.id + ':' + mapped.title]) {
          seen[mapped.id + ':' + mapped.title] = true;
          out.push(mapped);
        }
      }

      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) { stack.push(value[keys[k]]); }
    }
    return out;
  }

  function parseMarketplace(html, args, searchUrl) {
    var bodies = scriptJsonBodies(html);
    var listings = [];
    var seen = {};
    for (var i = 0; i < bodies.length; i++) {
      if (bodies[i].indexOf('Marketplace') === -1 && bodies[i].indexOf('marketplace') === -1) { continue; }
      try {
        var parsed = JSON.parse(htmlDecode(bodies[i]));
        var found = collectListings(parsed);
        for (var j = 0; j < found.length; j++) {
          var key = found[j].id + ':' + found[j].title;
          if (!seen[key]) {
            seen[key] = true;
            listings.push(found[j]);
          }
        }
      } catch (e) {
        // Skip non-JSON or shape-shifted preloader blobs.
      }
    }
    if (!listings.length) { return null; }
    return { listings: listings, search_url: searchUrl };
  }

  function htmlHandler(slug, params, pathForArgs, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'facebook-execute-bound-spec-unavailable');
        }
        var path = pathForArgs(args || {});
        if (!path) { return fallback(slug, 'facebook-invalid-args'); }
        var checked = guardHtml(await ctx.executeBoundSpec(getSpec(path), ctx.tabId), slug);
        if (!checked || checked.success !== true) { return checked; }
        var data = parser(checked.text, args || {}, ORIGIN + path);
        if (!data) { return fallback(slug, 'facebook-public-html-shape-mismatch'); }
        return { success: true, status: checked.status, finalUrl: checked.finalUrl, redirected: checked.redirected, data: data };
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
        return fallback(slug, reason || 'unverified-facebook-mutation');
      }
    };
  }

  var handlers = {
    'facebook.get_current_user': htmlHandler('facebook.get_current_user', EMPTY_PARAMS, function() {
      return '/';
    }, parseCurrentUser),
    'facebook.search_marketplace': htmlHandler('facebook.search_marketplace', MARKETPLACE_SEARCH_PARAMS, function(args) {
      var query = str(args && args.query).trim();
      return query ? '/marketplace/search/' + buildQuery([['query', query]]) : '';
    }, parseMarketplace),
    'facebook.confirm_friend_request': guarded(
      'facebook.confirm_friend_request',
      'write',
      USER_ID_PARAMS,
      'unverified-facebook-confirm-friend-request-mutation'
    ),
    'facebook.delete_friend_request': guarded(
      'facebook.delete_friend_request',
      'destructive',
      USER_ID_PARAMS,
      'unverified-facebook-delete-friend-request-mutation'
    ),
    'facebook.react_to_post': guarded(
      'facebook.react_to_post',
      'write',
      REACTION_PARAMS,
      'unverified-facebook-react-to-post-mutation'
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

  global.FsbHandlerFacebook = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
