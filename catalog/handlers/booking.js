(function (global) {
  'use strict';

  /**
   * Booking.com public same-origin HTML READ head.
   *
   * Ports only deterministic first-party search/property page reads. Account,
   * Genius, trips, and wishlist rows stay in the discovery tail until their
   * authenticated page-state shape is reviewed.
   */

  var BOOKING_ORIGIN = 'https://www.booking.com';
  var BOOKING_SERVICE = 'booking.com';
  var INT_LIMIT = 9007199254740991;

  var DESTINATION_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Destination search text' }
  }, ['query']);

  var SEARCH_PARAMS = schema({
    destination: { type: 'string', minLength: 1, description: 'Destination city, region, or property name' },
    checkin: { type: 'string', minLength: 1, description: 'Check-in date in YYYY-MM-DD format' },
    checkout: { type: 'string', minLength: 1, description: 'Check-out date in YYYY-MM-DD format' },
    adults: integerSchema('Number of adults', 1, 30),
    children: integerSchema('Number of children', 0, 10),
    rooms: integerSchema('Number of rooms', 1, 30),
    offset: integerSchema('Result offset for pagination', 0, INT_LIMIT)
  }, ['destination', 'checkin', 'checkout']);

  var NAV_SEARCH_PARAMS = schema({
    destination: { type: 'string', minLength: 1, description: 'Destination city, region, or property name' },
    checkin: { type: 'string', minLength: 1, description: 'Check-in date in YYYY-MM-DD format' },
    checkout: { type: 'string', minLength: 1, description: 'Check-out date in YYYY-MM-DD format' },
    adults: integerSchema('Number of adults', 1, 30),
    rooms: integerSchema('Number of rooms', 1, 30)
  }, ['destination', 'checkin', 'checkout']);

  var PROPERTY_PARAMS = schema({
    property_name: { type: 'string', minLength: 1, description: 'Property name or partial name to search for' },
    city: { type: 'string', minLength: 1, description: 'City where the property is located' },
    checkin: { type: 'string', minLength: 1, description: 'Check-in date in YYYY-MM-DD format' },
    checkout: { type: 'string', minLength: 1, description: 'Check-out date in YYYY-MM-DD format' }
  }, ['property_name', 'city', 'checkin', 'checkout']);

  var NAV_PROPERTY_PARAMS = schema({
    page_name: { type: 'string', minLength: 1, description: 'Property page name slug' },
    country_code: { type: 'string', minLength: 1, description: 'Two-letter country code' },
    checkin: { type: 'string', description: 'Check-in date in YYYY-MM-DD format' },
    checkout: { type: 'string', description: 'Check-out date in YYYY-MM-DD format' }
  }, ['page_name', 'country_code']);

  var ACCOMMODATION_TYPES = {
    201: 'Apartment',
    202: 'Hostel',
    203: 'Motel',
    204: 'Hotel',
    205: 'Guest House',
    206: 'Bed and Breakfast',
    208: 'Resort',
    210: 'Villa',
    213: 'Capsule Hotel',
    216: 'Holiday Home',
    218: 'Campsite',
    219: 'Boat',
    220: 'Country House',
    221: 'Farm Stay',
    222: 'Luxury Tent',
    223: 'Chalet',
    224: 'Cabin',
    225: 'Ryokan',
    226: 'Riad',
    228: 'Cottage'
  };

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
      reason: reason || 'booking-public-html-shape-mismatch',
      fellBackToDom: true
    });
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

  function intValue(value, fallbackValue) {
    var n = Number(value);
    if (!Number.isFinite(n)) { return fallbackValue; }
    return Math.floor(n);
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function htmlSpec(path) {
    return {
      url: BOOKING_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: BOOKING_ORIGIN,
      extract: null
    };
  }

  function resultText(result) {
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  async function readHtml(slug, path, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'booking-execute-bound-spec-unavailable') };
    }
    var spec = htmlSpec(path);
    var result = await ctx.executeBoundSpec(spec, ctx.tabId);
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'booking-public-html-request-failed') };
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'booking-public-html-http-error') };
    }
    var text = resultText(result);
    if (!text || text.indexOf('<') === -1) {
      return { error: fallback(slug, 'booking-public-html-missing') };
    }
    return { result: result, text: text, url: spec.url };
  }

  function buildSearchPath(args) {
    return '/searchresults.html' + buildQuery([
      ['ss', args.destination],
      ['checkin', args.checkin],
      ['checkout', args.checkout],
      ['group_adults', intValue(args.adults, 2)],
      ['group_children', intValue(args.children, 0)],
      ['no_rooms', intValue(args.rooms, 1)],
      ['offset', args.offset]
    ]);
  }

  function buildDestinationSearchPath(args) {
    return '/searchresults.html' + buildQuery([
      ['ss', args.query],
      ['checkin', ''],
      ['checkout', ''],
      ['group_adults', 2],
      ['no_rooms', 1]
    ]);
  }

  function buildNamedPropertySearchPath(args) {
    return buildSearchPath({
      destination: str(args.property_name) + ' ' + str(args.city),
      checkin: args.checkin,
      checkout: args.checkout,
      adults: 2,
      children: 0,
      rooms: 1
    });
  }

  function buildPropertyPath(args) {
    var path = '/hotel/' + encodeURIComponent(str(args.country_code).toLowerCase()) +
      '/' + encodeURIComponent(str(args.page_name)) + '.html';
    return path + buildQuery([
      ['checkin', args.checkin],
      ['checkout', args.checkout]
    ]);
  }

  function parseScriptJson(text, slug) {
    var values = [];
    var re = /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(text))) {
      try {
        values.push(JSON.parse(match[1]));
      } catch (e) {
        // Ignore unrelated JSON script blocks.
      }
    }
    if (!values.length && text.indexOf('ROOT_QUERY') !== -1) {
      return { error: fallback(slug, 'booking-public-json-unparseable') };
    }
    return { values: values };
  }

  function extractApolloCache(text, slug) {
    var parsed = parseScriptJson(text, slug);
    if (parsed.error) { return parsed; }
    var values = parsed.values || [];
    for (var i = 0; i < values.length; i++) {
      if (isObject(values[i]) && isObject(values[i].ROOT_QUERY)) {
        return { cache: values[i] };
      }
    }
    return { error: fallback(slug, 'booking-apollo-cache-missing') };
  }

  function findSearchQueries(cache) {
    var root = cache && cache.ROOT_QUERY;
    if (!isObject(root)) { return null; }
    if (isObject(root.searchQueries)) { return root.searchQueries; }
    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) {
      var value = root[keys[i]];
      if (isObject(value) && value.__typename === 'SearchQueries') {
        return value;
      }
    }
    return null;
  }

  function findSearchData(cache) {
    var queries = findSearchQueries(cache);
    if (!isObject(queries)) { return null; }
    var keys = Object.keys(queries);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('search(') === 0 && isObject(queries[keys[i]])) {
        return queries[keys[i]];
      }
    }
    return null;
  }

  function photoUrl(relativeUrl) {
    var value = str(relativeUrl);
    if (!value) { return ''; }
    if (/^https?:\/\//i.test(value)) { return value; }
    return BOOKING_ORIGIN + value;
  }

  function mapProperty(raw) {
    var r = isObject(raw) ? raw : {};
    var bp = isObject(r.basicPropertyData) ? r.basicPropertyData : {};
    var loc = isObject(bp.location) ? bp.location : {};
    var displayName = isObject(r.displayName) ? r.displayName : {};
    var location = isObject(r.location) ? r.location : {};
    var photos = isObject(bp.photos) ? bp.photos : {};
    var mainPhoto = isObject(photos.main) ? photos.main : {};
    var highRes = isObject(mainPhoto.highResUrl) ? mainPhoto.highResUrl : {};
    var lowRes = isObject(mainPhoto.lowResUrl) ? mainPhoto.lowResUrl : {};
    var reviews = isObject(bp.reviews) ? bp.reviews : {};
    var scoreText = isObject(reviews.totalScoreTextTag) ? reviews.totalScoreTextTag : {};
    var starRating = isObject(bp.starRating) ? bp.starRating : {};
    var priceInfo = isObject(r.priceDisplayInfoIrene) ? r.priceDisplayInfoIrene : {};
    var displayPrice = isObject(priceInfo.displayPrice) ? priceInfo.displayPrice : {};
    var amountPerStay = isObject(displayPrice.amountPerStay) ? displayPrice.amountPerStay : {};
    var blocks = Array.isArray(r.blocks) ? r.blocks : [];
    var blockZero = isObject(blocks[0]) ? blocks[0] : {};
    var finalPrice = isObject(blockZero.finalPrice) ? blockZero.finalPrice : {};
    var pageName = str(bp.pageName);
    var countryCode = str(loc.countryCode || 'xx').toLowerCase();

    return {
      id: numberValue(bp.id),
      name: str(displayName.text),
      type: ACCOMMODATION_TYPES[numberValue(bp.accommodationTypeId)] || 'Property',
      page_name: pageName,
      address: str(loc.address),
      city: str(loc.city),
      country_code: countryCode,
      latitude: numberValue(loc.latitude),
      longitude: numberValue(loc.longitude),
      display_location: str(location.displayLocation),
      distance_from_center: str(location.mainDistance),
      star_rating: numberValue(starRating.value),
      review_score: numberValue(reviews.totalScore),
      review_score_word: str(scoreText.translation),
      review_count: numberValue(reviews.reviewsCount),
      photo_url: photoUrl(highRes.relativeUrl || lowRes.relativeUrl),
      url: pageName ? BOOKING_ORIGIN + '/hotel/' + countryCode + '/' + pageName + '.html' : '',
      is_genius: r.geniusInfo !== undefined && r.geniusInfo !== null,
      price_text: str(amountPerStay.amount || finalPrice.amount),
      currency: str(amountPerStay.currency || finalPrice.currency)
    };
  }

  function mapDestinations(cache, fallbackQuery) {
    var root = cache && cache.ROOT_QUERY;
    var destinations = [];
    if (!isObject(root)) { return destinations; }

    function pushDestination(item) {
      var r = isObject(item) ? item : {};
      var destId = str(r.destId || r.id);
      var candidate = {
        dest_id: destId,
        dest_type: str(r.destType || r.type),
        label: str(r.label || r.value || r.name),
        city: str(r.city || r.cityName),
        country: str(r.country || r.countryName),
        region: str(r.region),
        image_url: str(r.imageUrl)
      };
      if (!candidate.label && fallbackQuery) { candidate.label = str(fallbackQuery); }
      for (var i = 0; i < destinations.length; i++) {
        if (destinations[i].dest_id && destinations[i].dest_id === candidate.dest_id) { return; }
      }
      destinations.push(candidate);
    }

    var keys = Object.keys(root);
    for (var i = 0; i < keys.length; i++) {
      var value = root[keys[i]];
      if (!isObject(value)) { continue; }
      if (keys[i].indexOf('autoCompleteSuggestions') !== -1 || value.__typename === 'AutoCompleteSuggestions') {
        var results = Array.isArray(value.results) ? value.results : [];
        for (var r = 0; r < results.length; r++) { pushDestination(results[r]); }
      }
    }

    var searchData = findSearchData(cache);
    if (isObject(searchData)) {
      if (!destinations.length && isObject(searchData.destinationLocation)) {
        pushDestination(searchData.destinationLocation);
      }
      var breadcrumbs = Array.isArray(searchData.breadcrumbs) ? searchData.breadcrumbs : [];
      for (var b = 0; b < breadcrumbs.length; b++) { pushDestination(breadcrumbs[b]); }
    }
    return destinations;
  }

  function propertiesFromSearchData(searchData) {
    var results = Array.isArray(searchData && searchData.results) ? searchData.results : [];
    var mapped = [];
    for (var i = 0; i < results.length; i++) {
      mapped.push(mapProperty(results[i]));
    }
    return mapped;
  }

  function destinationName(searchData, fallbackName) {
    var breadcrumbs = Array.isArray(searchData && searchData.breadcrumbs) ? searchData.breadcrumbs : [];
    for (var i = breadcrumbs.length - 1; i >= 0; i--) {
      if (breadcrumbs[i] && breadcrumbs[i].name) { return str(breadcrumbs[i].name); }
    }
    return str(fallbackName);
  }

  function bestProperty(properties, propertyName) {
    if (!properties.length) { return null; }
    var needle = str(propertyName).toLowerCase();
    for (var i = 0; i < properties.length; i++) {
      if (str(properties[i].name).toLowerCase().indexOf(needle) !== -1) {
        return properties[i];
      }
    }
    return properties[0];
  }

  async function readNavigation(slug, path, ctx) {
    var read = await readHtml(slug, path, ctx);
    if (read.error) { return read.error; }
    return {
      success: true,
      status: read.result.status,
      data: {
        url: read.url,
        navigated: false
      }
    };
  }

  async function handleSearchProperties(args, ctx) {
    var slug = 'booking.search_properties';
    var path = buildSearchPath(args || {});
    var read = await readHtml(slug, path, ctx);
    if (read.error) { return read.error; }
    var cache = extractApolloCache(read.text, slug);
    if (cache.error) { return cache.error; }
    var searchData = findSearchData(cache.cache);
    if (!isObject(searchData)) { return fallback(slug, 'booking-search-data-missing'); }
    var pagination = isObject(searchData.pagination) ? searchData.pagination : {};
    var properties = propertiesFromSearchData(searchData);
    return {
      success: true,
      status: read.result.status,
      data: {
        properties: properties,
        total_results: numberValue(pagination.nbResultsTotal || properties.length),
        results_per_page: numberValue(pagination.nbResultsPerPage || 25),
        destination_name: destinationName(searchData, args && args.destination),
        search_url: read.url
      }
    };
  }

  async function handleSearchDestinations(args, ctx) {
    var slug = 'booking.search_destinations';
    var path = buildDestinationSearchPath(args || {});
    var read = await readHtml(slug, path, ctx);
    if (read.error) { return read.error; }
    var cache = extractApolloCache(read.text, slug);
    if (cache.error) { return cache.error; }
    return {
      success: true,
      status: read.result.status,
      data: {
        destinations: mapDestinations(cache.cache, args && args.query),
        search_url: read.url
      }
    };
  }

  async function handleGetProperty(args, ctx) {
    var slug = 'booking.get_property';
    var read = await readHtml(slug, buildNamedPropertySearchPath(args || {}), ctx);
    if (read.error) { return read.error; }
    var cache = extractApolloCache(read.text, slug);
    if (cache.error) { return cache.error; }
    var searchData = findSearchData(cache.cache);
    if (!isObject(searchData)) { return fallback(slug, 'booking-search-data-missing'); }
    var property = bestProperty(propertiesFromSearchData(searchData), args && args.property_name);
    if (!property) { return fallback(slug, 'booking-property-not-found'); }
    return {
      success: true,
      status: read.result.status,
      data: { property: property, search_url: read.url }
    };
  }

  async function handleGetPropertyReviews(args, ctx) {
    var slug = 'booking.get_property_reviews';
    var read = await readHtml(slug, buildNamedPropertySearchPath(args || {}), ctx);
    if (read.error) { return read.error; }
    var cache = extractApolloCache(read.text, slug);
    if (cache.error) { return cache.error; }
    var searchData = findSearchData(cache.cache);
    if (!isObject(searchData)) { return fallback(slug, 'booking-search-data-missing'); }
    var property = bestProperty(propertiesFromSearchData(searchData), args && args.property_name);
    if (!property) { return fallback(slug, 'booking-property-not-found'); }
    return {
      success: true,
      status: read.result.status,
      data: {
        property_name: property.name,
        review_score: property.review_score,
        review_score_word: property.review_score_word,
        review_count: property.review_count,
        star_rating: property.star_rating,
        search_url: read.url
      }
    };
  }

  function handler(params, fn) {
    return {
      tier: 'T1a',
      origin: BOOKING_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: fn
    };
  }

  var handlers = {
    'booking.search_properties': handler(SEARCH_PARAMS, handleSearchProperties),
    'booking.search_destinations': handler(DESTINATION_PARAMS, handleSearchDestinations),
    'booking.get_property': handler(PROPERTY_PARAMS, handleGetProperty),
    'booking.get_property_reviews': handler(PROPERTY_PARAMS, handleGetPropertyReviews),
    'booking.navigate_to_search': handler(NAV_SEARCH_PARAMS, function(args, ctx) {
      return readNavigation('booking.navigate_to_search', buildSearchPath(args || {}), ctx);
    }),
    'booking.navigate_to_property': handler(NAV_PROPERTY_PARAMS, function(args, ctx) {
      return readNavigation('booking.navigate_to_property', buildPropertyPath(args || {}), ctx);
    })
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
            service: BOOKING_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerBooking = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
