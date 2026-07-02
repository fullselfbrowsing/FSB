(function (global) {
  'use strict';

  /**
   * Lyft same-origin T1 head.
   *
   * Ride-type, estimate, and ride-history reads use reviewed first-party JSON paths
   * on www.lyft.com. Requesting or cancelling a ride can move money or create fees,
   * so those rows are registered only as guarded fail-closed handlers until live
   * mutation-body UAT records the exact request shape.
   */

  var LYFT_ORIGIN = 'https://www.lyft.com';
  var LYFT_SERVICE = 'lyft.com';
  var API_BASE = LYFT_ORIGIN + '/v1';
  var INT_LIMIT = 9007199254740991;
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var RIDE_TYPES_PARAMS = schema({
    pickup: { type: 'string', minLength: 1, description: 'Pickup location or address' },
    dropoff: { type: 'string', minLength: 1, description: 'Dropoff location or address' }
  }, ['pickup', 'dropoff']);

  var ESTIMATE_PARAMS = schema({
    pickup: { type: 'string', minLength: 1, description: 'Pickup location or address' },
    dropoff: { type: 'string', minLength: 1, description: 'Dropoff location or address' },
    ride_type_id: { type: 'string', minLength: 1, description: 'The ride type to estimate' }
  }, ['pickup', 'dropoff', 'ride_type_id']);

  var RIDES_PARAMS = schema({
    status: {
      type: 'string',
      enum: ['active', 'completed', 'cancelled'],
      description: 'Filter rides by status'
    },
    limit: integerSchema('Maximum number of rides to return', 1, 50)
  }, []);

  var REQUEST_RIDE_PARAMS = schema({
    pickup: { type: 'string', minLength: 1, description: 'Pickup location or address' },
    dropoff: { type: 'string', minLength: 1, description: 'Dropoff location or address' },
    ride_type_id: { type: 'string', minLength: 1, description: 'The ride type to book' },
    payment_method_id: { type: 'string', description: 'Optional payment method to charge' }
  }, ['pickup', 'dropoff', 'ride_type_id']);

  var CANCEL_RIDE_PARAMS = schema({
    ride_id: { type: 'string', minLength: 1, description: 'The ride ID to cancel' },
    reason: { type: 'string', description: 'Optional cancellation reason' }
  }, ['ride_id']);

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
      reason: reason || 'lyft-json-shape-mismatch',
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

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && String(v) !== '') { return String(v); }
    }
    return '';
  }

  function firstValue(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && (typeof v !== 'string' || v !== '')) { return v; }
    }
    return undefined;
  }

  function numberValue(value) {
    if (isObject(value)) {
      return numberValue(firstValue([value.amount, value.value, value.fare, value.price]));
    }
    if (typeof value === 'string') {
      var compact = value.replace(/[^0-9.-]/g, '');
      if (compact && compact !== '-' && compact !== '.') {
        var parsed = Number(compact);
        return Number.isFinite(parsed) ? parsed : 0;
      }
    }
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

  function nested(raw, path) {
    var cur = raw;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') { return undefined; }
      cur = cur[path[i]];
    }
    return cur;
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
      origin: LYFT_ORIGIN,
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
      return { error: fallback(slug, 'lyft-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'lyft-http-error') };
    }
    if (isObject(result.data) || Array.isArray(result.data)) {
      if (looksLikeError(result.data)) { return { error: fallback(slug, 'lyft-api-error') }; }
      return { data: result.data };
    }
    var parsed = parseJsonText(result.data || result.text || result.body);
    if (parsed && !looksLikeError(parsed)) { return { data: parsed }; }
    return { error: fallback(slug, 'lyft-json-missing') };
  }

  function mapRideType(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.ride_type_id, raw.rideTypeId, raw.type_id, raw.slug]);
    var name = firstString([raw.name, raw.display_name, raw.displayName, raw.label, raw.title]);
    if (!id || !name) { return null; }
    return {
      id: id,
      name: name,
      eta_minutes: numberValue(firstValue([raw.eta_minutes, raw.etaMinutes, raw.eta])),
      seats: numberValue(firstValue([raw.seats, raw.seat_count, raw.capacity]))
    };
  }

  function mapEstimate(raw) {
    if (!isObject(raw)) { return null; }
    var source = isObject(raw.estimate) ? raw.estimate
      : (isObject(raw.ride_estimate) ? raw.ride_estimate : raw);
    var fareRaw = firstValue([
      source.fare,
      source.estimated_fare,
      source.estimatedFare,
      source.price,
      nested(source, ['cost', 'amount'])
    ]);
    var etaRaw = firstValue([
      source.eta_minutes,
      source.etaMinutes,
      source.eta,
      source.pickup_eta_minutes,
      source.pickupEtaMinutes
    ]);
    var fare = numberValue(fareRaw);
    var eta = numberValue(etaRaw);
    if (!fare && !eta) { return null; }
    return {
      fare: fare,
      eta_minutes: eta,
      currency: firstString([source.currency, nested(source, ['cost', 'currency'])]),
      ride_type_id: firstString([source.ride_type_id, source.rideTypeId, source.type_id])
    };
  }

  function mapRide(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.id, raw.ride_id, raw.rideId]);
    var status = firstString([raw.status, raw.state]);
    if (!id || !status) { return null; }
    return {
      id: id,
      status: status,
      ride_type_id: firstString([raw.ride_type_id, raw.rideTypeId, nested(raw, ['ride_type', 'id'])]),
      ride_type_name: firstString([raw.ride_type_name, raw.rideTypeName, nested(raw, ['ride_type', 'name'])]),
      pickup: firstString([nested(raw, ['pickup', 'address']), nested(raw, ['origin', 'address']), raw.pickup]),
      dropoff: firstString([nested(raw, ['dropoff', 'address']), nested(raw, ['destination', 'address']), raw.dropoff]),
      fare: numberValue(firstValue([raw.fare, raw.price, nested(raw, ['cost', 'amount'])])),
      requested_at: firstString([raw.requested_at, raw.requestedAt, raw.created_at, raw.createdAt])
    };
  }

  async function callJson(slug, path, pairs, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'lyft-execute-bound-spec-unavailable') };
    }
    var result = await ctx.executeBoundSpec(jsonSpec(path, pairs), ctx.tabId);
    var out = resultData(result, slug);
    if (out.error) { return out; }
    return { result: result, data: out.data };
  }

  function readArray(data, keys) {
    if (Array.isArray(data)) { return { found: true, items: data }; }
    if (!isObject(data)) { return { found: false, items: [] }; }
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(data[keys[i]])) {
        return { found: true, items: data[keys[i]] };
      }
    }
    return { found: false, items: [] };
  }

  async function listRideTypes(args, ctx) {
    args = args || {};
    var out = await callJson('lyft.list_ride_types', '/ride-types', [
      ['pickup', args.pickup],
      ['dropoff', args.dropoff]
    ], ctx);
    if (out.error) { return out.error; }
    var raw = readArray(out.data, ['ride_types', 'rideTypes', 'types', 'items']);
    if (!raw.found) { return fallback('lyft.list_ride_types', 'lyft-ride-types-missing'); }
    var rideTypes = list(raw.items).map(mapRideType).filter(Boolean);
    if (raw.items.length && !rideTypes.length) {
      return fallback('lyft.list_ride_types', 'lyft-ride-types-map-failed');
    }
    return { success: true, status: out.result && out.result.status, data: { ride_types: rideTypes } };
  }

  async function getRideEstimate(args, ctx) {
    args = args || {};
    var out = await callJson('lyft.get_ride_estimate', '/ride-estimate', [
      ['pickup', args.pickup],
      ['dropoff', args.dropoff],
      ['ride_type_id', args.ride_type_id]
    ], ctx);
    if (out.error) { return out.error; }
    var estimate = mapEstimate(out.data);
    if (!estimate) { return fallback('lyft.get_ride_estimate', 'lyft-estimate-missing'); }
    return { success: true, status: out.result && out.result.status, data: { estimate: estimate } };
  }

  async function listRides(args, ctx) {
    args = args || {};
    var out = await callJson('lyft.list_rides', '/rides', [
      ['status', args.status],
      ['limit', intValue(args.limit, undefined, 1, 50)]
    ], ctx);
    if (out.error) { return out.error; }
    var raw = readArray(out.data, ['rides', 'results', 'items']);
    if (!raw.found) { return fallback('lyft.list_rides', 'lyft-rides-missing'); }
    var rides = list(raw.items).map(mapRide).filter(Boolean);
    if (raw.items.length && !rides.length) {
      return fallback('lyft.list_rides', 'lyft-rides-map-failed');
    }
    return { success: true, status: out.result && out.result.status, data: { rides: rides } };
  }

  function read(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: LYFT_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: handle
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: LYFT_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, 'lyft-mutation-uat-required');
      }
    };
  }

  var handlers = {
    'lyft.list_ride_types': read('lyft.list_ride_types', RIDE_TYPES_PARAMS, listRideTypes),
    'lyft.get_ride_estimate': read('lyft.get_ride_estimate', ESTIMATE_PARAMS, getRideEstimate),
    'lyft.list_rides': read('lyft.list_rides', RIDES_PARAMS, listRides),
    'lyft.request_ride': guarded('lyft.request_ride', 'write', REQUEST_RIDE_PARAMS),
    'lyft.cancel_ride': guarded('lyft.cancel_ride', 'destructive', CANCEL_RIDE_PARAMS)
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
            service: LYFT_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerLyft = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
