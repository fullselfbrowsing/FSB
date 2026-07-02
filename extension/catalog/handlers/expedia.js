(function (global) {
  'use strict';

  /**
   * Expedia public same-origin search-page READ head.
   *
   * Ports only deterministic first-party search page URL builders. Account,
   * trips, typeahead, and GraphQL hotel rows stay in the discovery tail until
   * their authenticated page-state shape is reviewed.
   */

  var EXPEDIA_ORIGIN = 'https://www.expedia.com';
  var EXPEDIA_SERVICE = 'expedia.com';
  var INT_LIMIT = 9007199254740991;

  var FLIGHT_PARAMS = schema({
    origin: { type: 'string', minLength: 1, description: 'Origin airport code or city name' },
    destination: { type: 'string', minLength: 1, description: 'Destination airport code or city name' },
    departure_date: { type: 'string', minLength: 1, description: 'Departure date in YYYY-MM-DD format' },
    return_date: { type: 'string', description: 'Return date in YYYY-MM-DD format' },
    adults: integerSchema('Number of adults', 1, 6),
    cabin_class: {
      type: 'string',
      enum: ['coach', 'premium-economy', 'business', 'first'],
      description: 'Cabin class'
    }
  }, ['origin', 'destination', 'departure_date']);

  var CAR_PARAMS = schema({
    pickup_location: { type: 'string', minLength: 1, description: 'Pickup location airport code or city' },
    pickup_date: { type: 'string', minLength: 1, description: 'Pickup date in YYYY-MM-DD format' },
    dropoff_date: { type: 'string', minLength: 1, description: 'Drop-off date in YYYY-MM-DD format' },
    pickup_time: { type: 'string', description: 'Pickup time in HH:MM format' },
    dropoff_time: { type: 'string', description: 'Drop-off time in HH:MM format' }
  }, ['pickup_location', 'pickup_date', 'dropoff_date']);

  var PACKAGE_PARAMS = schema({
    origin: { type: 'string', minLength: 1, description: 'Origin city or airport code' },
    destination: { type: 'string', minLength: 1, description: 'Destination city or airport code' },
    departure_date: { type: 'string', minLength: 1, description: 'Departure date in YYYY-MM-DD format' },
    return_date: { type: 'string', minLength: 1, description: 'Return date in YYYY-MM-DD format' },
    adults: integerSchema('Number of adults', 1, 6)
  }, ['origin', 'destination', 'departure_date', 'return_date']);

  var ACTIVITY_PARAMS = schema({
    destination: { type: 'string', minLength: 1, description: 'Destination name' },
    region_id: { type: 'string', description: 'Gaia region ID for the destination' },
    start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
    end_date: { type: 'string', description: 'End date in YYYY-MM-DD format' }
  }, ['destination']);

  var CRUISE_PARAMS = schema({
    destination: { type: 'string', description: 'Cruise destination' },
    departure_month: { type: 'string', description: 'Departure month in YYYY-MM format' }
  });

  var HOTEL_NAV_PARAMS = schema({
    hotel_name: { type: 'string', minLength: 1, description: 'Hotel name to search for on Expedia' },
    region_id: { type: 'string', description: 'Gaia region ID for the destination' },
    check_in_date: { type: 'string', description: 'Check-in date in YYYY-MM-DD format' },
    check_out_date: { type: 'string', description: 'Check-out date in YYYY-MM-DD format' },
    adults: integerSchema('Number of adults', 1, 14)
  }, ['hotel_name']);

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
      reason: reason || 'expedia-public-search-page-shape-mismatch',
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

  function enc(value) {
    return encodeURIComponent(String(value === undefined || value === null ? '' : value));
  }

  function intValue(value, fallbackValue) {
    var n = Number(value);
    if (!Number.isFinite(n)) { return fallbackValue; }
    return Math.floor(n);
  }

  function dateForUrl(value) {
    var s = String(value || '');
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[2] + '/' + m[3] + '/' + m[1]) : s;
  }

  function htmlSpec(path) {
    return {
      url: EXPEDIA_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: EXPEDIA_ORIGIN,
      extract: null
    };
  }

  function resultText(result) {
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  function searchResult(result, slug, url) {
    if (!result || result.success !== true) {
      return fallback(slug, 'expedia-public-search-request-failed');
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'expedia-public-search-http-error');
    }
    var text = resultText(result);
    if (!text || text.indexOf('<') === -1) {
      return fallback(slug, 'expedia-public-search-html-missing');
    }
    return {
      success: true,
      status: result.status,
      data: {
        search_url: url,
        navigated: false
      }
    };
  }

  async function readSearchPage(slug, path, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'expedia-execute-bound-spec-unavailable');
    }
    var spec = htmlSpec(path);
    var result = await ctx.executeBoundSpec(spec, ctx.tabId);
    return searchResult(result, slug, spec.url);
  }

  function flightPath(args) {
    var adults = intValue(args.adults, 1);
    var depDate = dateForUrl(args.departure_date);
    var trip = args.return_date ? 'roundtrip' : 'oneway';
    var path = '/Flights-Search?trip=' + enc(trip) +
      '&leg1=from:' + enc(args.origin) +
      ',to:' + enc(args.destination) +
      ',departure:' + enc(depDate);
    if (args.return_date) {
      path += '&leg2=from:' + enc(args.destination) +
        ',to:' + enc(args.origin) +
        ',departure:' + enc(dateForUrl(args.return_date));
    }
    path += '&passengers=adults:' + enc(adults);
    if (args.cabin_class) { path += '&class=' + enc(args.cabin_class); }
    return path + '&mode=search';
  }

  function carPath(args) {
    return '/Cars-Search' + buildQuery([
      ['loc', args.pickup_location],
      ['date1', dateForUrl(args.pickup_date)],
      ['date2', dateForUrl(args.dropoff_date)],
      ['time1', args.pickup_time || '10:00'],
      ['time2', args.dropoff_time || '10:00']
    ]);
  }

  function packagePath(args) {
    return '/Vacation-Packages-Search' + buildQuery([
      ['origin', args.origin],
      ['destination', args.destination],
      ['d1', dateForUrl(args.departure_date)],
      ['d2', dateForUrl(args.return_date)],
      ['adults', intValue(args.adults, 2)]
    ]);
  }

  function activityPath(args) {
    return '/Activities-Search' + buildQuery([
      ['location', args.destination],
      ['regionId', args.region_id],
      ['startDate', dateForUrl(args.start_date)],
      ['endDate', dateForUrl(args.end_date)]
    ]);
  }

  function cruisePath(args) {
    return '/Cruise-Search' + buildQuery([
      ['destination', args.destination],
      ['departureMonth', args.departure_month]
    ]);
  }

  function hotelPath(args) {
    var pairs = [
      ['destination', args.hotel_name],
      ['regionId', args.region_id],
      ['startDate', dateForUrl(args.check_in_date)],
      ['endDate', dateForUrl(args.check_out_date)],
      ['rooms', 1],
      ['adults', intValue(args.adults, 2)]
    ];
    return '/Hotel-Search' + buildQuery(pairs);
  }

  function searchPageHandler(slug, params, pathForArgs) {
    return {
      tier: 'T1a',
      origin: EXPEDIA_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return readSearchPage(slug, pathForArgs(args || {}), ctx);
      }
    };
  }

  var handlers = {
    'expedia.search_flights': searchPageHandler('expedia.search_flights', FLIGHT_PARAMS, flightPath),
    'expedia.search_car_rentals': searchPageHandler('expedia.search_car_rentals', CAR_PARAMS, carPath),
    'expedia.search_packages': searchPageHandler('expedia.search_packages', PACKAGE_PARAMS, packagePath),
    'expedia.search_activities': searchPageHandler('expedia.search_activities', ACTIVITY_PARAMS, activityPath),
    'expedia.search_cruises': searchPageHandler('expedia.search_cruises', CRUISE_PARAMS, cruisePath),
    'expedia.navigate_to_hotel': searchPageHandler('expedia.navigate_to_hotel', HOTEL_NAV_PARAMS, hotelPath)
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
            service: EXPEDIA_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerExpedia = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
