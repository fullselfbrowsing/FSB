(function (global) {
  'use strict';

  /**
   * Kayak same-origin head.
   *
   * The search and price-alert read descriptors use KAYAK first-party JSON paths.
   * Creating a price alert is a write and stays guarded fail-closed until live
   * mutation-body UAT records the exact request shape.
   */

  var KAYAK_ORIGIN = 'https://www.kayak.com';
  var KAYAK_SERVICE = 'www.kayak.com';
  var INT_LIMIT = 9007199254740991;

  var FLIGHT_PARAMS = schema({
    origin: { type: 'string', minLength: 1, description: 'Departure airport or city' },
    destination: { type: 'string', minLength: 1, description: 'Arrival airport or city' },
    depart_date: { type: 'string', minLength: 1, description: 'Departure date (YYYY-MM-DD)' },
    return_date: { type: 'string', description: 'Return date (YYYY-MM-DD) for a round trip' },
    passengers: integerSchema('Number of passengers', 1)
  }, ['origin', 'destination', 'depart_date']);

  var HOTEL_PARAMS = schema({
    destination: { type: 'string', minLength: 1, description: 'City, region, or hotel name to search' },
    check_in: { type: 'string', minLength: 1, description: 'Check-in date (YYYY-MM-DD)' },
    check_out: { type: 'string', minLength: 1, description: 'Check-out date (YYYY-MM-DD)' },
    guests: integerSchema('Number of guests', 1)
  }, ['destination', 'check_in', 'check_out']);

  var ALERT_ID_PARAMS = schema({
    alert_id: { type: 'string', minLength: 1, description: 'The price alert ID to fetch' }
  }, ['alert_id']);

  var CREATE_ALERT_PARAMS = schema({
    kind: {
      type: 'string',
      enum: ['flight', 'hotel'],
      description: 'Whether to watch a flight or a hotel route'
    },
    origin: { type: 'string', description: 'Departure airport or city (for a flight alert)' },
    destination: {
      type: 'string',
      minLength: 1,
      description: 'Destination airport, city, or hotel area to watch'
    },
    target_price: { type: 'number', description: 'Optional price threshold to notify below' }
  }, ['kind', 'destination']);

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
      reason: reason || 'kayak-api-shape-mismatch',
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
      url: KAYAK_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: KAYAK_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function resultData(result, slug, prefix) {
    if (!result || result.success !== true) {
      return fallback(slug, prefix + '-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, prefix + '-http-error');
    }
    var data = result.data;
    if (!isObject(data) && typeof result.text === 'string') {
      try { data = JSON.parse(result.text); } catch (e) { data = null; }
    }
    if (!isObject(data) || looksLikeError(data)) {
      return fallback(slug, prefix + '-shape-mismatch');
    }
    return data;
  }

  function withData(result, data) {
    return {
      success: true,
      status: result && result.status,
      data: data
    };
  }

  function mapFlight(item) {
    var i = isObject(item) ? item : {};
    return {
      id: str(i.id),
      carrier: str(i.carrier),
      fare: num(i.fare)
    };
  }

  function mapHotel(item) {
    var i = isObject(item) ? item : {};
    return {
      id: str(i.id),
      name: str(i.name),
      price: num(i.price)
    };
  }

  function mapAlert(item) {
    var i = isObject(item) ? item : {};
    return {
      id: str(i.id),
      route: str(i.route),
      current_price: num(i.current_price)
    };
  }

  async function callJson(slug, path, pairs, ctx, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'kayak-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(jsonSpec(path, pairs), ctx.tabId);
    var data = resultData(result, slug, 'kayak-json');
    if (!data || data.success === false) { return data; }
    return mapper(result, data);
  }

  function searchFlights(args, ctx) {
    args = args || {};
    return callJson('kayak.search_flights', '/v1/flights/search', [
      ['origin', args.origin],
      ['destination', args.destination],
      ['depart_date', args.depart_date],
      ['return_date', args.return_date],
      ['passengers', args.passengers]
    ], ctx, function(result, data) {
      if (!Array.isArray(data.flights)) {
        return fallback('kayak.search_flights', 'kayak-flights-missing');
      }
      return withData(result, { flights: list(data.flights).map(mapFlight) });
    });
  }

  function searchHotels(args, ctx) {
    args = args || {};
    return callJson('kayak.search_hotels', '/v1/hotels/search', [
      ['destination', args.destination],
      ['check_in', args.check_in],
      ['check_out', args.check_out],
      ['guests', args.guests]
    ], ctx, function(result, data) {
      if (!Array.isArray(data.hotels)) {
        return fallback('kayak.search_hotels', 'kayak-hotels-missing');
      }
      return withData(result, { hotels: list(data.hotels).map(mapHotel) });
    });
  }

  function getPriceAlert(args, ctx) {
    args = args || {};
    return callJson('kayak.get_price_alert',
      '/v1/price-alerts/' + encodeURIComponent(str(args.alert_id)), [], ctx,
      function(result, data) {
        if (!isObject(data.alert)) {
          return fallback('kayak.get_price_alert', 'kayak-price-alert-missing');
        }
        return withData(result, { alert: mapAlert(data.alert) });
      });
  }

  function read(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: KAYAK_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: handle
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: KAYAK_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, 'kayak-price-alert-write-uat-required');
      }
    };
  }

  var handlers = {
    'kayak.search_flights': read('kayak.search_flights', FLIGHT_PARAMS, searchFlights),
    'kayak.search_hotels': read('kayak.search_hotels', HOTEL_PARAMS, searchHotels),
    'kayak.get_price_alert': read('kayak.get_price_alert', ALERT_ID_PARAMS, getPriceAlert),
    'kayak.create_price_alert': guarded('kayak.create_price_alert', 'write', CREATE_ALERT_PARAMS)
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
            service: KAYAK_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerKayak = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
