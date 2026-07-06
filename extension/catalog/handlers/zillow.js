(function (global) {
  'use strict';

  /**
   * Zillow same-origin public READ head.
   *
   * Ports only listing/search reads that use Zillow's first-party search-state
   * endpoint. Account, saved-home, location autocomplete, and address-resolution
   * rows stay inactive because they are user-specific or depend on a separate
   * autocomplete host.
   */

  var ZILLOW_ORIGIN = 'https://www.zillow.com';
  var ZILLOW_SERVICE = 'zillow.com';
  var SEARCH_PATH = '/async-create-search-page-state';
  var INT_LIMIT = 9007199254740991;

  var REGION_TYPE_MAP = {
    city: 6,
    county: 4,
    zipcode: 7,
    neighborhood: 8,
    state: 2,
    address: 0
  };

  var MAP_BOUNDS_SCHEMA = withProps({
    west: { type: 'number', description: 'Western longitude' },
    east: { type: 'number', description: 'Eastern longitude' },
    south: { type: 'number', description: 'Southern latitude' },
    north: { type: 'number', description: 'Northern latitude' }
  }, ['west', 'east', 'south', 'north']);

  var SEARCH_PARAMS = withProps({
    region_id: integerSchema('Zillow region ID from search_locations'),
    region_type: { type: 'string', description: 'Region type: city, county, zipcode, neighborhood, state, or address' },
    map_bounds: MAP_BOUNDS_SCHEMA,
    min_price: { type: 'number', description: 'Minimum price in dollars' },
    max_price: { type: 'number', description: 'Maximum price in dollars' },
    min_beds: integerSchema('Minimum bedrooms'),
    max_beds: integerSchema('Maximum bedrooms'),
    min_baths: integerSchema('Minimum bathrooms'),
    min_sqft: { type: 'number', description: 'Minimum square footage' },
    max_sqft: { type: 'number', description: 'Maximum square footage' },
    home_type: {
      type: 'string',
      enum: ['single_family', 'condo', 'townhouse', 'multi_family', 'lot_land', 'manufactured'],
      description: 'Property type filter'
    },
    sort: {
      type: 'string',
      enum: ['globalrelevanceex', 'days', 'pricea', 'priced', 'zest', 'zesta', 'size', 'lot', 'beds', 'baths'],
      description: 'Sort order'
    },
    page: integerSchema('Page number', 1)
  });

  var MARKET_PARAMS = withProps({
    region_id: integerSchema('Zillow region ID from search_locations'),
    region_type: { type: 'string', description: 'Region type: city, county, zipcode, neighborhood, state, or address' }
  }, ['region_id']);

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
      reason: reason || 'zillow-search-shape-mismatch',
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

  function num(value, fallbackValue) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallbackValue || 0);
  }

  function intValue(value, fallbackValue) {
    var n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : (fallbackValue || 0);
  }

  function regionTypeCode(value) {
    return REGION_TYPE_MAP[String(value || 'city')] || 6;
  }

  function defaultBounds() {
    return { west: -180, east: 180, south: -90, north: 90 };
  }

  function mapBounds(args) {
    var b = args && args.map_bounds;
    if (!b || typeof b !== 'object') { return defaultBounds(); }
    return {
      west: num(b.west, -180),
      east: num(b.east, 180),
      south: num(b.south, -90),
      north: num(b.north, 90)
    };
  }

  function regionSelection(args) {
    var id = intValue(args && args.region_id, 0);
    return id ? [{ regionId: id, regionType: regionTypeCode(args && args.region_type) }] : undefined;
  }

  function requireRegionOrBounds(args, slug) {
    if ((args && args.region_id) || (args && args.map_bounds)) { return null; }
    return fallback(slug, 'zillow-region-or-map-bounds-required');
  }

  function addRange(filterState, key, min, max) {
    if (min !== undefined || max !== undefined) {
      filterState[key] = { min: min, max: max };
    }
  }

  function addCommonFilters(filterState, args) {
    if (args.sort) { filterState.sortSelection = { value: String(args.sort) }; }
    addRange(filterState, 'price', args.min_price, args.max_price);
    addRange(filterState, 'beds', args.min_beds, args.max_beds);
    if (args.min_baths !== undefined) { filterState.baths = { min: args.min_baths }; }
    addRange(filterState, 'sqft', args.min_sqft, args.max_sqft);
    if (args.home_type) {
      var typeMap = {
        single_family: 'isSingleFamily',
        condo: 'isCondo',
        townhouse: 'isTownhouse',
        multi_family: 'isMultiFamily',
        lot_land: 'isLotLand',
        manufactured: 'isManufactured'
      };
      var key = typeMap[String(args.home_type)];
      if (key) { filterState[key] = { value: true }; }
    }
    return filterState;
  }

  function saleExclusions(extra) {
    var out = {
      isForSaleByAgent: { value: false },
      isForSaleByOwner: { value: false },
      isNewConstruction: { value: false },
      isComingSoon: { value: false },
      isAuction: { value: false },
      isForSaleForeclosure: { value: false }
    };
    for (var k in (extra || {})) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
    }
    return out;
  }

  function searchSpec(queryState, wants, requestId) {
    return {
      url: ZILLOW_ORIGIN + SEARCH_PATH,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        searchQueryState: queryState,
        wants: wants,
        requestId: requestId || 1
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ZILLOW_ORIGIN,
      extract: '@'
    };
  }

  function buildSearchState(args, filterState, visible) {
    return {
      pagination: args && args.page && args.page > 1 ? { currentPage: args.page } : undefined,
      mapBounds: mapBounds(args),
      regionSelection: regionSelection(args),
      filterState: filterState || {},
      isMapVisible: visible !== false
    };
  }

  function guardData(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'zillow-redirect-or-http-error');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || data.errors) {
      return fallback(slug, 'zillow-search-shape-mismatch');
    }
    return result;
  }

  function mapListing(raw) {
    var l = raw || {};
    var home = (l.hdpData && l.hdpData.homeInfo) || {};
    var latLong = l.latLong || {};
    return {
      zpid: String(l.zpid || home.zpid || ''),
      address: String(l.address || ''),
      street: String(l.addressStreet || home.streetAddress || ''),
      city: String(l.addressCity || home.city || ''),
      state: String(l.addressState || home.state || ''),
      zipcode: String(l.addressZipcode || home.zipcode || ''),
      price: String(l.price || ''),
      price_raw: num(l.unformattedPrice || home.price, 0),
      beds: num(l.beds || home.bedrooms, 0),
      baths: num(l.baths || home.bathrooms, 0),
      sqft: num(l.area || home.livingArea, 0),
      status: String(l.statusType || home.homeStatus || ''),
      status_text: String(l.statusText || ''),
      home_type: String(home.homeType || ''),
      days_on_zillow: num(home.daysOnZillow, 0),
      zestimate: num(l.zestimate || home.zestimate, 0),
      rent_zestimate: num(home.rentZestimate, 0),
      tax_assessed_value: num(home.taxAssessedValue, 0),
      latitude: num(latLong.latitude || home.latitude, 0),
      longitude: num(latLong.longitude || home.longitude, 0),
      image_url: String(l.imgSrc || ''),
      detail_url: String(l.detailUrl || ''),
      is_saved: false,
      has_3d_model: !!l.has3DModel
    };
  }

  function listResults(data) {
    return data && data.cat1 && data.cat1.searchResults
      && Array.isArray(data.cat1.searchResults.listResults)
      ? data.cat1.searchResults.listResults
      : null;
  }

  function totalCount(data) {
    return num((data && data.categoryTotals && data.categoryTotals.cat1 && data.categoryTotals.cat1.totalResultCount)
      || (data && data.cat1 && data.cat1.searchResults && data.cat1.searchResults.totalResultCount), 0);
  }

  function parseListings(data) {
    var list = listResults(data);
    if (!list) { return null; }
    return {
      total: totalCount(data) || list.length,
      listings: list.map(mapListing)
    };
  }

  function categoryTotal(data) {
    var n = data && data.categoryTotals && data.categoryTotals.cat1 && data.categoryTotals.cat1.totalResultCount;
    return typeof n === 'number' ? n : null;
  }

  async function executeSearch(ctx, state, wants, slug, requestId) {
    var res = await ctx.executeBoundSpec(searchSpec(state, wants, requestId), ctx.tabId);
    var guarded = guardData(res, slug);
    if (!guarded || guarded.success !== true) { return guarded; }
    return guarded.data;
  }

  function listingHandler(slug, filterBuilder) {
    return {
      tier: 'T1a',
      origin: ZILLOW_ORIGIN,
      sideEffectClass: 'read',
      params: SEARCH_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'zillow-execute-bound-spec-unavailable');
        }
        var missing = requireRegionOrBounds(args || {}, slug);
        if (missing) { return missing; }
        var filterState = filterBuilder ? filterBuilder(args || {}) : addCommonFilters({}, args || {});
        var data = await executeSearch(ctx, buildSearchState(args || {}, filterState, true),
          { cat1: ['listResults', 'total'], cat2: ['total'] }, slug, 1);
        if (!data || data.success === false) { return data; }
        var parsed = parseListings(data);
        if (!parsed) { return fallback(slug, 'zillow-search-shape-mismatch'); }
        return { success: true, data: parsed };
      }
    };
  }

  function marketOverviewHandler() {
    return {
      tier: 'T1a',
      origin: ZILLOW_ORIGIN,
      sideEffectClass: 'read',
      params: MARKET_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('zillow.get_market_overview', 'zillow-execute-bound-spec-unavailable');
        }
        var id = intValue(args && args.region_id, 0);
        if (!id) { return fallback('zillow.get_market_overview', 'zillow-invalid-region-id'); }
        var baseArgs = { region_id: id, region_type: args && args.region_type };
        var wants = { cat1: ['total'] };
        var forSale = await executeSearch(ctx, buildSearchState(baseArgs, {}, false), wants, 'zillow.get_market_overview', 1);
        if (!forSale || forSale.success === false) { return forSale; }
        var forRent = await executeSearch(ctx, buildSearchState(baseArgs, saleExclusions({ isForRent: { value: true } }), false),
          wants, 'zillow.get_market_overview', 2);
        if (!forRent || forRent.success === false) { return forRent; }
        var sold = await executeSearch(ctx, buildSearchState(baseArgs, saleExclusions({ isRecentlySold: { value: true } }), false),
          wants, 'zillow.get_market_overview', 3);
        if (!sold || sold.success === false) { return sold; }
        var fs = categoryTotal(forSale);
        var fr = categoryTotal(forRent);
        var rs = categoryTotal(sold);
        if (fs === null || fr === null || rs === null) {
          return fallback('zillow.get_market_overview', 'zillow-search-shape-mismatch');
        }
        return {
          success: true,
          data: {
            for_sale_total: fs,
            for_rent_total: fr,
            recently_sold_total: rs
          }
        };
      }
    };
  }

  function withCommon(extra) {
    return function(args) {
      return addCommonFilters(Object.assign({}, extra || {}), args || {});
    };
  }

  var handlers = {
    'zillow.get_market_overview': marketOverviewHandler(),
    'zillow.search_by_owner': listingHandler('zillow.search_by_owner', withCommon(saleExclusions({
      isForSaleByOwner: { value: true }
    }))),
    'zillow.search_for_rent': listingHandler('zillow.search_for_rent', withCommon(saleExclusions({
      isForRent: { value: true }
    }))),
    'zillow.search_for_sale': listingHandler('zillow.search_for_sale', withCommon({})),
    'zillow.search_foreclosures': listingHandler('zillow.search_foreclosures', withCommon(saleExclusions({
      isForSaleForeclosure: { value: true }
    }))),
    'zillow.search_new_construction': listingHandler('zillow.search_new_construction', withCommon(saleExclusions({
      isNewConstruction: { value: true }
    }))),
    'zillow.search_open_houses': listingHandler('zillow.search_open_houses', withCommon({
      isOpenHousesOnly: { value: true }
    })),
    'zillow.search_recently_sold': listingHandler('zillow.search_recently_sold', withCommon(saleExclusions({
      isRecentlySold: { value: true }
    })))
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
          descriptor: { slug: slug, service: ZILLOW_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerZillow = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
