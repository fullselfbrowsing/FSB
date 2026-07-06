(function (global) {
  'use strict';

  /**
   * Yelp same-origin public READ head.
   *
   * Ports only the public, no-auth Yelp reads that fetch first-party HTML/JSON:
   * autocomplete, business search, and business detail pages. Current-user,
   * current-page extraction, and navigation rows stay in the tail because they
   * depend on page globals or page navigation semantics.
   */

  var YELP_ORIGIN = 'https://www.yelp.com';
  var YELP_SERVICE = 'www.yelp.com';
  var INT_LIMIT = 9007199254740991;

  var AUTOCOMPLETE_PARAMS = withProps({
    prefix: { type: 'string', minLength: 1, description: 'Search text prefix' },
    location: { type: 'string', description: 'Location context for suggestions' }
  }, ['prefix', 'location']);

  var BUSINESS_PARAMS = withProps({
    alias: { type: 'string', minLength: 1, description: 'Business URL alias from /biz/{alias}' }
  }, ['alias']);

  var SEARCH_PARAMS = withProps({
    query: { type: 'string', description: 'Search keywords' },
    location: { type: 'string', description: 'Location to search near' },
    start: integerSchema('Result offset for pagination', 0),
    sort_by: { type: 'string', enum: ['recommended', 'rating', 'review_count'], description: 'Sort order' },
    price: { type: 'string', description: 'Comma-separated Yelp price levels, e.g. 1,2' },
    open_now: { type: 'boolean', description: 'Filter to currently open businesses' }
  }, ['query', 'location']);

  var REACT_ROOT_PROPS_REGEX =
    /window\.yelp\s*=\s*window\.yelp\s*\|\|\s*\{\};\s*window\.yelp\.react_root_props\s*=\s*(\{[\s\S]*?\});\s*(?:window\.yelp\.|<\/script>)/;

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
      reason: reason || 'yelp-public-read-shape-mismatch',
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

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function pathSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function buildGetSpec(path, pairs, accept) {
    return {
      url: YELP_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': accept || 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: YELP_ORIGIN,
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

  function parsePageData(html) {
    var match = String(html || '').match(REACT_ROOT_PROPS_REGEX);
    if (!match || !match[1]) { return null; }
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      return null;
    }
  }

  function extractPageData(result) {
    if (!result || result.success !== true) { return null; }
    if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      return result.data;
    }
    return parsePageData(result.text || result.body || '');
  }

  function extractSearchResults(data) {
    var searchProps = data && data.legacyProps
      && data.legacyProps.searchAppProps
      && data.legacyProps.searchAppProps.searchPageProps;
    var components = (searchProps && searchProps.mainContentComponentsListProps) || {};
    var context = (searchProps && searchProps.searchContext) || {};
    var out = [];
    for (var key in components) {
      if (!Object.prototype.hasOwnProperty.call(components, key)) { continue; }
      var item = components[key];
      if (!item || !item.bizId || !item.searchResultBusiness) { continue; }
      out.push(mapBusiness(item));
    }
    return {
      businesses: out,
      total_results: Number(context.totalResults) || 0,
      start: Number(context.startResult) || 0,
      results_per_page: Number(context.resultsPerPage) || 10
    };
  }

  function mapBusiness(item) {
    var b = item.searchResultBusiness || {};
    return {
      id: String(item.bizId || ''),
      alias: aliasFromUrl(b.businessUrl || ''),
      name: String(b.name || ''),
      url: String(b.businessUrl || ''),
      rating: typeof b.rating === 'number' ? b.rating : null,
      review_count: typeof b.reviewCount === 'number' ? b.reviewCount : 0,
      phone: String(b.phone || ''),
      price_range: String(b.priceRange || ''),
      categories: Array.isArray(b.categories) ? b.categories.map(function (c) { return c && c.title ? String(c.title) : ''; }).filter(Boolean) : [],
      neighborhoods: Array.isArray(b.neighborhoods) ? b.neighborhoods.map(String) : [],
      address: String(b.formattedAddress || ''),
      is_ad: !!b.isAd,
      ranking: typeof b.ranking === 'number' ? b.ranking : null
    };
  }

  function aliasFromUrl(url) {
    var m = /\/biz\/([^/?#]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function extractBusiness(data, alias) {
    var details = data && data.legacyProps && data.legacyProps.bizDetailsProps;
    var pageProps = details && details.bizDetailsPageProps;
    var metaProps = details && details.bizDetailsMetaProps;
    var id = (pageProps && pageProps.businessId) || (metaProps && metaProps.businessId) || '';
    var name = (pageProps && pageProps.businessName) || '';
    var url = (metaProps && metaProps.staticUrl) || ('/biz/' + String(alias || ''));
    if (!id && !name) { return null; }
    return { business: { id: String(id), name: String(name), url: String(url) } };
  }

  function normalizeSuggestion(raw) {
    return {
      query: String((raw && raw.query) || ''),
      title: String((raw && raw.title) || ''),
      subtitle: String((raw && raw.subtitle) || ''),
      type: String((raw && raw.type) || ''),
      redirect_url: String((raw && raw.redirect_url) || ''),
      thumbnail: String((raw && raw.thumbnail) || '')
    };
  }

  function parseAutocomplete(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data)) { return null; }
    var groups = Array.isArray(data.response) ? data.response : [];
    var suggestions = [];
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i] || {};
      var list = Array.isArray(group.suggestions) ? group.suggestions : [];
      for (var j = 0; j < list.length; j++) {
        suggestions.push(normalizeSuggestion(list[j]));
      }
    }
    return { suggestions: suggestions };
  }

  function handleParsed(slug, result, parser) {
    if (!result || result.success !== true) { return result; }
    var parsed = parser(result);
    if (!parsed) { return fallback(slug, 'yelp-public-read-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function publicHandler(slug, params, requestForArgs, parser) {
    return {
      tier: 'T1a',
      origin: YELP_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'yelp-execute-bound-spec-unavailable');
        }
        var req = requestForArgs(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(req.path, req.query, req.accept), ctx.tabId);
        return handleParsed(slug, res, parser);
      }
    };
  }

  function autocompleteRequest(args) {
    return {
      path: '/search_suggest/v2/prefetch',
      query: [['prefix', args.prefix], ['loc', args.location]],
      accept: 'application/json'
    };
  }

  function businessRequest(args) {
    return {
      path: '/biz/' + pathSegment(args.alias),
      query: [],
      accept: 'text/html'
    };
  }

  function searchRequest(args) {
    var query = [
      ['find_desc', args.query],
      ['find_loc', args.location],
      ['start', args.start],
      ['sortby', args.sort_by],
      ['attrs', args.price ? 'RestaurantsPriceRange2.' + args.price : undefined],
      ['open_now', args.open_now ? true : undefined]
    ];
    return { path: '/search', query: query, accept: 'text/html' };
  }

  var handlers = {
    'yelp.autocomplete': publicHandler('yelp.autocomplete', AUTOCOMPLETE_PARAMS, autocompleteRequest, function (result) {
      return parseAutocomplete(result.data);
    }),
    'yelp.search_businesses': publicHandler('yelp.search_businesses', SEARCH_PARAMS, searchRequest, function (result) {
      var data = extractPageData(result);
      if (!data) { return null; }
      var parsed = extractSearchResults(data);
      return parsed.businesses.length ? parsed : null;
    })
  };

  handlers['yelp.get_business'] = {
    tier: 'T1a',
    origin: YELP_ORIGIN,
    sideEffectClass: 'read',
    params: BUSINESS_PARAMS,
    async handle(args, ctx) {
      var input = args || {};
      if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
        return fallback('yelp.get_business', 'yelp-execute-bound-spec-unavailable');
      }
      var req = businessRequest(input);
      var res = await ctx.executeBoundSpec(buildGetSpec(req.path, req.query, req.accept), ctx.tabId);
      return handleParsed('yelp.get_business', res, function (result) {
        var data = extractPageData(result);
        return data ? extractBusiness(data, input.alias) : null;
      });
    }
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
          descriptor: { slug: slug, service: YELP_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerYelp = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
