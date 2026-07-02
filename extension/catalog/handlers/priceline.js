(function (global) {
  'use strict';

  /**
   * Priceline same-origin public READ head.
   *
   * Ports only public first-party autocomplete/search endpoints. Auth-token
   * GraphQL reads and browser navigation rows stay in the discovery tail until
   * there is a reviewed token carrier or navigation execution path.
   */

  var PRICELINE_ORIGIN = 'https://www.priceline.com';
  var PRICELINE_SERVICE = 'priceline.com';
  var PWS_BASE = PRICELINE_ORIGIN + '/pws/v0';
  var AC_BASE = PRICELINE_ORIGIN + '/svcs/ac/index';
  var INT_LIMIT = 9007199254740991;

  var KEYWORD_PARAMS = schema({
    keyword: { type: 'string', minLength: 1, description: 'Search keyword' }
  }, ['keyword']);

  var POI_PARAMS = schema({
    city_id: { type: 'string', description: 'Priceline city ID to search within' },
    city_name: { type: 'string', description: 'City name to search by' },
    limit: integerSchema('Maximum number of results', 1, 20)
  }, []);

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
      reason: reason || 'priceline-public-read-shape-mismatch',
      fellBackToDom: true
    });
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

  function buildGetSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: PRICELINE_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors)
        || data.resultCode === 500);
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function mapSearchItem(item) {
    var i = item || {};
    return {
      id: String(i.id || ''),
      name: String(i.itemName || i.name || ''),
      type: String(i.type || ''),
      city_name: String(i.cityName || ''),
      state_code: String(i.stateCode || ''),
      country_code: String(i.countryCode || ''),
      country_name: String(i.countryName || ''),
      latitude: numberValue(i.lat),
      longitude: numberValue(i.lon),
      display_line_1: String(i.displayLine1 || ''),
      display_line_2: String(i.displayLine2 || '')
    };
  }

  function mapAirport(item) {
    var i = item || {};
    return {
      id: String(i.id || ''),
      type: String(i.subType || i.type || ''),
      display_name: String(i.displayName || ''),
      city_name: String(i.cityName || ''),
      state_code: String(i.stateCode || ''),
      country_code: String(i.countryCode || ''),
      latitude: numberValue(i.lat),
      longitude: numberValue(i.lon),
      timezone: String(i.timeZoneName || '')
    };
  }

  function resultWithItems(result, slug, outputKey, mapper) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'priceline-redirect-or-http-error');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data)) {
      return fallback(slug, 'priceline-public-read-shape-mismatch');
    }
    var items = data.searchItems;
    if (!Array.isArray(items)) {
      return fallback(slug, 'priceline-public-read-items-missing');
    }
    var mapped = [];
    for (var i = 0; i < items.length; i++) {
      mapped.push(mapper(items[i]));
    }
    var out = {};
    out[outputKey] = mapped;
    return { success: true, status: result.status, data: out };
  }

  function searchLocationsRequest(args) {
    return PWS_BASE + '/index/relax/search/autoSuggest' + buildQuery([
      ['keyword', args.keyword]
    ]);
  }

  function searchAirportsRequest(args) {
    return AC_BASE + '/flights/' + encodeURIComponent(String(args.keyword || '')) + '/0/9/0/0';
  }

  function searchPoiRequest(args) {
    return PWS_BASE + '/index/relax/search/topPOIByCityIdOrCityName' + buildQuery([
      ['numGenAiPOIs', args.limit === undefined ? 10 : args.limit],
      ['cityId', args.city_id],
      ['cityName', args.city_name]
    ]);
  }

  function publicRead(slug, params, requestForArgs, outputKey, mapper) {
    return {
      tier: 'T1a',
      origin: PRICELINE_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'priceline-execute-bound-spec-unavailable');
        }
        var url = requestForArgs(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return resultWithItems(res, slug, outputKey, mapper);
      }
    };
  }

  var handlers = {
    'priceline.search_airports': publicRead(
      'priceline.search_airports',
      KEYWORD_PARAMS,
      searchAirportsRequest,
      'airports',
      mapAirport
    ),
    'priceline.search_locations': publicRead(
      'priceline.search_locations',
      KEYWORD_PARAMS,
      searchLocationsRequest,
      'locations',
      mapSearchItem
    ),
    'priceline.search_points_of_interest': publicRead(
      'priceline.search_points_of_interest',
      POI_PARAMS,
      searchPoiRequest,
      'points_of_interest',
      mapSearchItem
    )
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
            service: PRICELINE_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerPriceline = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
