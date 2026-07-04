(function (global) {
  'use strict';

  /**
   * OpenTable same-origin T1 head.
   *
   * Restaurant and reservation reads use reviewed first-party JSON paths on
   * www.opentable.com. Reserving and cancelling can hold or charge a saved card,
   * so those rows are registered only as guarded fail-closed handlers until live
   * mutation-body UAT records the exact request shape.
   */

  var ORIGIN = 'https://www.opentable.com';
  var SERVICE = 'www.opentable.com';
  var API_BASE = ORIGIN + '/v1';
  var INT_LIMIT = 9007199254740991;
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var SEARCH_PARAMS = schema({
    location: { type: 'string', minLength: 1, description: 'City, neighborhood, or restaurant name to search' },
    date: { type: 'string', description: 'Reservation date (YYYY-MM-DD)' },
    time: { type: 'string', description: 'Desired time (HH:MM, 24h)' },
    party_size: integerSchema('Number of diners', 1, INT_LIMIT)
  }, ['location']);

  var RESTAURANT_PARAMS = schema({
    restaurant_id: { type: 'string', minLength: 1, description: 'The restaurant ID to fetch' },
    date: { type: 'string', description: 'Reservation date (YYYY-MM-DD) for live availability' },
    party_size: integerSchema('Party size for live availability', 1, INT_LIMIT)
  }, ['restaurant_id']);

  var RESERVATIONS_PARAMS = schema({
    status: {
      type: 'string',
      enum: ['upcoming', 'completed', 'cancelled'],
      description: 'Filter reservations by status'
    },
    limit: integerSchema('Maximum number of reservations to return', 1, 50)
  }, []);

  var RESERVE_PARAMS = schema({
    restaurant_id: { type: 'string', minLength: 1, description: 'The restaurant to reserve at' },
    date: { type: 'string', minLength: 1, description: 'Reservation date (YYYY-MM-DD)' },
    time: { type: 'string', minLength: 1, description: 'Reservation time (HH:MM, 24h)' },
    party_size: integerSchema('Number of diners', 1, INT_LIMIT)
  }, ['restaurant_id', 'date', 'time', 'party_size']);

  var CANCEL_PARAMS = schema({
    reservation_id: { type: 'string', minLength: 1, description: 'The reservation ID to cancel' },
    reason: { type: 'string', description: 'Optional cancellation reason' }
  }, ['reservation_id']);

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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'opentable-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function intValue(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { return fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { return min; }
    if (max !== undefined && n > max) { return max; }
    return n;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value !== undefined && value !== null && String(value) !== '') { return String(value); }
    }
    return '';
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
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function parseJsonText(value) {
    var text = str(value).trim();
    if (!text || (text.charAt(0) !== '{' && text.charAt(0) !== '[')) { return null; }
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function resultData(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'opentable-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'opentable-http-error') };
    }
    if (isObject(result.data) || Array.isArray(result.data)) {
      if (looksLikeError(result.data)) { return { error: fallback(slug, 'opentable-api-error') }; }
      return { data: result.data };
    }
    var parsed = parseJsonText(result.data || result.text || result.body);
    if (parsed && !looksLikeError(parsed)) { return { data: parsed }; }
    return { error: fallback(slug, 'opentable-json-missing') };
  }

  function compactSlots(raw) {
    if (!isObject(raw)) { return []; }
    var slots = raw.slots || raw.available_times || raw.availableTimes || raw.times || raw.open_times;
    return list(slots).map(function(slot) {
      if (isObject(slot)) {
        return firstString([slot.time, slot.datetime, slot.dateTime, slot.label, slot.value]);
      }
      return str(slot);
    }).filter(Boolean);
  }

  function mapRestaurant(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.restaurant_id, raw.restaurantId, raw.rid]);
    var name = firstString([raw.name, raw.title, raw.restaurant_name, raw.restaurantName]);
    if (!id || !name) { return null; }
    return {
      id: id,
      name: name,
      neighborhood: firstString([raw.neighborhood, raw.area, raw.city]),
      cuisine: firstString([raw.cuisine, raw.primary_cuisine, raw.primaryCuisine]),
      rating: numberValue(raw.rating || raw.average_rating || raw.averageRating),
      slots: compactSlots(raw)
    };
  }

  function mapReservation(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.reservation_id, raw.reservationId, raw.confirmation_id]);
    var status = firstString([raw.status, raw.state]);
    if (!id || !status) { return null; }
    var restaurant = isObject(raw.restaurant) ? raw.restaurant : {};
    return {
      id: id,
      status: status,
      restaurant_id: firstString([raw.restaurant_id, raw.restaurantId, restaurant.id]),
      restaurant_name: firstString([raw.restaurant_name, raw.restaurantName, restaurant.name]),
      date: firstString([raw.date, raw.reservation_date, raw.reservationDate]),
      time: firstString([raw.time, raw.reservation_time, raw.reservationTime]),
      party_size: numberValue(raw.party_size || raw.partySize || raw.guests)
    };
  }

  async function callJson(slug, path, pairs, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'opentable-execute-bound-spec-unavailable') };
    }
    var result = await ctx.executeBoundSpec(jsonSpec(path, pairs), ctx.tabId);
    var out = resultData(result, slug);
    if (out.error) { return out; }
    return { result: result, data: out.data };
  }

  async function searchRestaurants(args, ctx) {
    args = args || {};
    var out = await callJson('opentable.search_restaurants', '/restaurants/search', [
      ['location', args.location],
      ['date', args.date],
      ['time', args.time],
      ['party_size', args.party_size]
    ], ctx);
    if (out.error) { return out.error; }

    var raw = Array.isArray(out.data) ? out.data : (out.data.restaurants || out.data.results || out.data.items);
    var restaurants = list(raw).map(mapRestaurant).filter(Boolean);
    if (!restaurants.length) {
      return fallback('opentable.search_restaurants', 'opentable-restaurants-missing');
    }
    return {
      success: true,
      status: out.result && out.result.status,
      data: { restaurants: restaurants }
    };
  }

  async function getRestaurant(args, ctx) {
    args = args || {};
    var id = str(args.restaurant_id);
    var out = await callJson('opentable.get_restaurant', '/restaurants/' + encodeURIComponent(id), [
      ['date', args.date],
      ['party_size', args.party_size]
    ], ctx);
    if (out.error) { return out.error; }

    var restaurant = mapRestaurant(out.data.restaurant || out.data);
    if (!restaurant) {
      return fallback('opentable.get_restaurant', 'opentable-restaurant-missing');
    }
    return {
      success: true,
      status: out.result && out.result.status,
      data: { restaurant: restaurant }
    };
  }

  async function listReservations(args, ctx) {
    args = args || {};
    var out = await callJson('opentable.list_reservations', '/reservations', [
      ['status', args.status],
      ['limit', intValue(args.limit, undefined, 1, 50)]
    ], ctx);
    if (out.error) { return out.error; }

    var raw = Array.isArray(out.data) ? out.data : (out.data.reservations || out.data.results || out.data.items);
    var reservations = list(raw).map(mapReservation).filter(Boolean);
    if (!reservations.length) {
      return fallback('opentable.list_reservations', 'opentable-reservations-missing');
    }
    return {
      success: true,
      status: out.result && out.result.status,
      data: { reservations: reservations }
    };
  }

  function read(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: handle
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, 'opentable-mutation-uat-required');
      }
    };
  }

  var handlers = {
    'opentable.search_restaurants': read('opentable.search_restaurants', SEARCH_PARAMS, searchRestaurants),
    'opentable.get_restaurant': read('opentable.get_restaurant', RESTAURANT_PARAMS, getRestaurant),
    'opentable.list_reservations': read('opentable.list_reservations', RESERVATIONS_PARAMS, listReservations),
    'opentable.reserve_table': guarded('opentable.reserve_table', 'write', RESERVE_PARAMS),
    'opentable.cancel_reservation': guarded('opentable.cancel_reservation', 'destructive', CANCEL_PARAMS)
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
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerOpentable = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
