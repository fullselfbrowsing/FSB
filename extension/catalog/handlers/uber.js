(function (global) {
  'use strict';

  /**
   * Uber rideshare same-origin read head.
   *
   * Ports only the OpenTabs-proven first-party `/api/...` account, ride,
   * activity, membership, and product-read paths as explicit same-origin
   * requests. This module intentionally does not expose Uber Eats or any
   * ride/payment mutation.
   */

  var UBER_ORIGIN = 'https://www.uber.com';
  var UBER_SERVICE = 'uber.com';
  var INT_LIMIT = 9007199254740991;
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({});
  var SEARCH_LOCATIONS_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search text such as an airport, landmark, or address' },
    latitude: { type: 'number', description: 'Latitude for the search center' },
    longitude: { type: 'number', description: 'Longitude for the search center' },
    type: {
      description: 'Search type. Defaults to PICKUP.',
      type: 'string',
      enum: ['PICKUP', 'DROPOFF']
    }
  }, ['query', 'latitude', 'longitude']);
  var TRAVEL_STATUS_PARAMS = schema({
    latitude: { description: 'Current latitude. Defaults to 0.', type: 'number' },
    longitude: { description: 'Current longitude. Defaults to 0.', type: 'number' }
  });
  var PAST_ACTIVITIES_PARAMS = schema({
    show_only_trip: {
      description: 'Trip-only filter. The rideshare handler always requests trip-only activity.',
      type: 'boolean'
    }
  });
  var PRODUCT_SUGGESTIONS_PARAMS = schema({
    type: {
      description: 'Suggestion type. Defaults to DEFAULT.',
      type: 'string',
      enum: ['DEFAULT', 'CUSTOM']
    }
  });

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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'uber-api-shape-mismatch',
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

  function boundedNumber(value, fallbackValue) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallbackValue;
  }

  function first(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && String(v) !== '') { return v; }
    }
    return '';
  }

  function firstString(values) {
    return str(first(values));
  }

  function moneyFromAmountE5(raw) {
    if (!isObject(raw) || raw.amountE5 === undefined || raw.amountE5 === null || raw.amountE5 === '') {
      return '';
    }
    var amount = Number.parseInt(String(raw.amountE5), 10);
    if (!Number.isFinite(amount)) { return ''; }
    var currency = str(raw.currencyCode || 'USD');
    return '$' + (amount / 100000).toFixed(2) + (currency ? ' ' + currency : '');
  }

  function parseMaybeJson(value) {
    if (typeof value !== 'string') { return value; }
    try { return JSON.parse(value); } catch (_e) { return value; }
  }

  function apiSpec(endpoint, body) {
    return {
      url: UBER_ORIGIN + '/api' + endpoint,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': 'x'
      },
      body: JSON.stringify(body === undefined ? {} : body),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: UBER_ORIGIN,
      extract: '@'
    };
  }

  function apiData(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'uber-api-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'uber-logged-out-or-http-error') };
    }

    var body = parseMaybeJson(result.data);
    if (!isObject(body) && !Array.isArray(body)) {
      return { error: fallback(slug, 'uber-api-shape-mismatch') };
    }
    if (isObject(body) && body.status && body.status !== 'success') {
      return { error: fallback(slug, 'uber-api-error-envelope') };
    }
    if (isObject(body) && (body.error || (Array.isArray(body.errors) && body.errors.length))) {
      return { error: fallback(slug, 'uber-api-error-envelope') };
    }
    if (isObject(body) && body.status === 'success') {
      return { data: body.data === undefined ? {} : body.data };
    }
    return { data: body };
  }

  async function readApi(slug, endpoint, body, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'uber-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(apiSpec(endpoint, body), ctx.tabId);
    var unwrapped = apiData(res, slug);
    if (unwrapped.error) { return unwrapped.error; }
    var parsed = parser(unwrapped.data);
    if (parsed === null || parsed === undefined) {
      return fallback(slug, 'uber-api-shape-mismatch');
    }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: UBER_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  function mapUser(raw) {
    if (!isObject(raw)) { return null; }
    return {
      first_name: str(raw.firstName),
      last_name: str(raw.lastName),
      picture_url: str(raw.pictureUrl)
    };
  }

  function mapLocation(raw) {
    if (!isObject(raw)) { return null; }
    return {
      id: firstString([raw.id, raw.placeId, raw.uuid]),
      address_line1: firstString([raw.addressLine1, raw.title, raw.name]),
      address_line2: firstString([raw.addressLine2, raw.subtitle]),
      provider: str(raw.provider),
      type: str(raw.type),
      tag: str(raw.tag),
      categories: list(raw.categories).map(str)
    };
  }

  function mapPastActivity(raw) {
    if (!isObject(raw)) { return null; }
    return {
      title: str(raw.title),
      subtitle: str(raw.subTitle),
      amount: str(raw.tertiaryTitle),
      order_type: str(raw.orderType),
      details_url: str(raw.detailsUrl),
      rebook_url: str(raw.ctaUrl),
      thumbnail_url: str(raw.thumbnailImageUrl),
      map_url: str(raw.cardImageUrl)
    };
  }

  function isTripActivity(raw) {
    if (!isObject(raw)) { return false; }
    var type = str(raw.orderType).toUpperCase();
    return !type || type.indexOf('MOBILITY') !== -1 || type.indexOf('TRIP') !== -1 || type.indexOf('RIDE') !== -1;
  }

  function mapProductSuggestion(raw) {
    if (!isObject(raw)) { return null; }
    return {
      name: str(raw.primaryText),
      description: str(raw.secondaryText),
      type: str(raw.type),
      url: str(raw.url),
      image_url: str(raw.imageUrl)
    };
  }

  function mapMembership(raw) {
    if (!isObject(raw)) { return null; }
    var response = isObject(raw.response) ? raw.response : raw;
    return {
      average_monthly_savings: moneyFromAmountE5(response.savings_average_monthly_savings),
      monthly_price: moneyFromAmountE5(response.offering_monthly_offering_price),
      potential_savings: moneyFromAmountE5(response.savings_nonmember_potential_savings)
    };
  }

  function mapEnabledProducts(raw) {
    if (!isObject(raw) || !isObject(raw.enabledProducts)) { return null; }
    var products = [];
    var keys = Object.keys(raw.enabledProducts);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = raw.enabledProducts[key];
      products.push({
        product_key: key,
        title: str(isObject(val) && val.defaultTitle ? val.defaultTitle : key)
      });
    }
    return { products: products };
  }

  function mapUpcoming(raw) {
    if (!isObject(raw)) { return null; }
    var trip = raw.upcomingTrip === undefined ? null : raw.upcomingTrip;
    return {
      has_upcoming_trip: trip !== null,
      upcoming_trip: trip
    };
  }

  var handlers = {
    'uber.get_current_user': readHandler(
      'uber.get_current_user',
      EMPTY_PARAMS,
      async function (_args, ctx) {
        return readApi('uber.get_current_user', '/getCurrentUser?localeCode=en', {}, ctx, function (data) {
          if (!isObject(data) || !isObject(data.user)) { return null; }
          var user = mapUser(data.user);
          return user ? { user: user } : null;
        });
      }
    ),
    'uber.search_locations': readHandler(
      'uber.search_locations',
      SEARCH_LOCATIONS_PARAMS,
      async function (args, ctx) {
        var query = str(args.query).trim();
        if (!query) { return fallback('uber.search_locations', 'uber-invalid-location-query'); }
        return readApi('uber.search_locations', '/pudoLocationSearch?localeCode=en', {
          latitude: boundedNumber(args.latitude, 0),
          longitude: boundedNumber(args.longitude, 0),
          query: query,
          type: args.type === 'DROPOFF' ? 'DROPOFF' : 'PICKUP'
        }, ctx, function (data) {
          if (!Array.isArray(data)) { return null; }
          return { locations: data.map(mapLocation).filter(Boolean) };
        });
      }
    ),
    'uber.get_travel_status': readHandler(
      'uber.get_travel_status',
      TRAVEL_STATUS_PARAMS,
      async function (args, ctx) {
        return readApi('uber.get_travel_status', '/getUserTravelStatus?localeCode=en', {
          location: {
            latitude: boundedNumber(args.latitude, 0),
            longitude: boundedNumber(args.longitude, 0)
          }
        }, ctx, function (data) {
          if (!isObject(data)) { return null; }
          return { is_traveling: bool(data.isUserTraveling) };
        });
      }
    ),
    'uber.get_membership': readHandler(
      'uber.get_membership',
      EMPTY_PARAMS,
      async function (_args, ctx) {
        return readApi('uber.get_membership', '/getMembershipAttributes?localeCode=en', {
          responseAttributes: [
            'membership_member_state',
            'savings_member_cycle_savings',
            'offering_member_billing_type',
            'membership_member_acquisition_price',
            'membership_member_start_date',
            'savings_average_monthly_savings',
            'offering_monthly_offering_price',
            'savings_nonmember_potential_savings',
            'membership_member_cycle_start_date',
            'membership_member_signup_country_iso2'
          ]
        }, ctx, function (data) {
          var membership = mapMembership(data);
          return membership ? { membership: membership } : null;
        });
      }
    ),
    'uber.get_past_activities': readHandler(
      'uber.get_past_activities',
      PAST_ACTIVITIES_PARAMS,
      async function (_args, ctx) {
        return readApi('uber.get_past_activities', '/getPastActivities?localeCode=en', {
          cityId: 1,
          localeCode: 'en',
          showOnlyTrip: true
        }, ctx, function (data) {
          if (!isObject(data) || !Array.isArray(data.pastActivities)) { return null; }
          return {
            activities: data.pastActivities
              .filter(isTripActivity)
              .map(mapPastActivity)
              .filter(Boolean)
          };
        });
      }
    ),
    'uber.get_enabled_products': readHandler(
      'uber.get_enabled_products',
      EMPTY_PARAMS,
      async function (_args, ctx) {
        return readApi('uber.get_enabled_products', '/getMapHeroEnabledProducts?localeCode=en', {}, ctx, mapEnabledProducts);
      }
    ),
    'uber.get_upcoming_activities': readHandler(
      'uber.get_upcoming_activities',
      EMPTY_PARAMS,
      async function (_args, ctx) {
        return readApi('uber.get_upcoming_activities', '/getUpcomingActivities?localeCode=en', {
          cityId: 1,
          localeCode: 'en'
        }, ctx, mapUpcoming);
      }
    ),
    'uber.get_product_suggestions': readHandler(
      'uber.get_product_suggestions',
      PRODUCT_SUGGESTIONS_PARAMS,
      async function (args, ctx) {
        return readApi('uber.get_product_suggestions', '/getProductSuggestions?localeCode=en', {
          type: args.type === 'CUSTOM' ? 'CUSTOM' : 'DEFAULT'
        }, ctx, function (data) {
          if (!isObject(data) || !Array.isArray(data.suggestions)) { return null; }
          return { suggestions: data.suggestions.map(mapProductSuggestion).filter(Boolean) };
        });
      }
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
            service: UBER_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerUber = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
