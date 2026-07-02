(function (global) {
  'use strict';

  /**
   * Chipotle public services READ head.
   *
   * Ports only public restaurant/menu/status reads over services.chipotle.com.
   * Customer, payment, rewards, order-history, page-state, and restaurant-search
   * rows stay in the discovery tail until their auth/runtime shape is reviewed.
   */

  var CHIPOTLE_ORIGIN = 'https://www.chipotle.com';
  var CHIPOTLE_SERVICE = 'chipotle.com';
  var SERVICES_BASE = 'https://services.chipotle.com';
  var SUBSCRIPTION_KEY = 'b4d9f36380184a3788857063bce25d6a';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var COUNTRY_PARAMS = schema({
    country: { type: 'string', description: 'Country code (default "US")' }
  });
  var RESTAURANT_PARAMS = schema({
    restaurant_id: {
      type: 'integer',
      minimum: -INT_LIMIT,
      maximum: INT_LIMIT,
      description: 'Restaurant ID (from find_restaurants)'
    }
  }, ['restaurant_id']);

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
      reason: reason || 'chipotle-services-shape-mismatch',
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

  function servicesSpec(path, pairs) {
    return {
      url: SERVICES_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: CHIPOTLE_ORIGIN,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeServiceError(value) {
    return isObject(value) && (
      typeof value.error === 'string' ||
      typeof value.message === 'string' ||
      Array.isArray(value.errors) ||
      isObject(value.error)
    );
  }

  function responseData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'chipotle-services-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'chipotle-services-http-error');
    }
    if (result.data === undefined || result.data === null || looksLikeServiceError(result.data)) {
      return fallback(slug, 'chipotle-services-shape-mismatch');
    }
    return result.data;
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

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function calories(item) {
    if (item && item.baseCalories !== undefined && item.baseCalories !== null &&
        item.maxCalories !== undefined && item.maxCalories !== null) {
      return str(item.baseCalories) + '-' + str(item.maxCalories);
    }
    return str(item && item.baseCalories !== undefined && item.baseCalories !== null
      ? item.baseCalories
      : 0);
  }

  function mapAddress(raw) {
    var a = raw || {};
    return {
      type: str(a.addressType),
      line1: str(a.addressLine1),
      line2: str(a.addressLine2).trim(),
      city: str(a.locality),
      state: str(a.administrativeArea),
      zip: str(a.postalCode),
      country: str(a.countryCode),
      latitude: num(a.latitude),
      longitude: num(a.longitude)
    };
  }

  function mapRestaurant(raw) {
    var r = raw || {};
    return {
      id: num(r.restaurantNumber),
      name: str(r.restaurantName),
      status: str(r.restaurantStatus),
      distance: num(r.distance),
      addresses: list(r.addresses).map(mapAddress),
      phone: str(r.phoneNumber),
      online_ordering: bool(r.onlineOrdering && r.onlineOrdering.onlineOrderingEnabled),
      has_chipotlane: bool(r.chipotlane && r.chipotlane.chipotlanePickupEnabled)
    };
  }

  function mapHour(raw) {
    var h = raw || {};
    return {
      day_of_week: str(h.dayOfWeek),
      open_time: str(h.openDateTime),
      close_time: str(h.closeDateTime)
    };
  }

  function mapMenuItem(raw) {
    var item = raw || {};
    return {
      id: str(item.itemId),
      name: str(item.itemName),
      description: str(item.itemType),
      price: num(item.unitPrice),
      calories: calories(item),
      image_url: str(item.thumbnailUrl),
      is_available: item.isItemAvailable === undefined ? true : bool(item.isItemAvailable)
    };
  }

  function mapPreconfiguredMeal(raw) {
    var meal = raw || {};
    return {
      id: str(meal.mealId),
      name: str(meal.mealName),
      type: str(meal.mealType),
      description: str(meal.description)
    };
  }

  async function callServices(slug, spec, args, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'chipotle-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    var data = responseData(res, slug);
    if (!data || data.success === false) { return data; }
    var parsed = parser(data, args || {});
    if (!parsed) { return fallback(slug, 'chipotle-services-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, specFn, parser) {
    return {
      tier: 'T1a',
      origin: CHIPOTLE_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        return callServices(slug, specFn(a), a, ctx, parser);
      }
    };
  }

  var handlers = {
    'chipotle.get_ordering_status': readHandler(
      'chipotle.get_ordering_status',
      COUNTRY_PARAMS,
      function (a) {
        return servicesSpec('/onlineorderingstatus', [['country', a.country || 'US']]);
      },
      function (data) {
        if (!isObject(data)) { return null; }
        return {
          online_ordering: bool(data.isOnlineOrderingAvailable),
          delivery: bool(data.isDeliveryAvailable),
          group_order: bool(data.isGroupOrderAvailable),
          catering: bool(data.isCateringAvailable)
        };
      }
    ),
    'chipotle.get_restaurant': readHandler(
      'chipotle.get_restaurant',
      RESTAURANT_PARAMS,
      function (a) {
        return servicesSpec('/restaurant/v3/restaurant/' + encodeURIComponent(String(a.restaurant_id)), [
          ['embed', 'addresses,realHours,onlineOrdering,chipotlane,sustainability']
        ]);
      },
      function (data) {
        if (!isObject(data) || (data.restaurantNumber === undefined && data.restaurantName === undefined)) {
          return null;
        }
        return {
          restaurant: mapRestaurant(data),
          hours: list(data.realHours).map(mapHour)
        };
      }
    ),
    'chipotle.get_menu': readHandler(
      'chipotle.get_menu',
      RESTAURANT_PARAMS,
      function (a) {
        return servicesSpec('/menuinnovation/v1/restaurants/' + encodeURIComponent(String(a.restaurant_id)) + '/onlinemenu', [
          ['channelId', 'web'],
          ['includeUnavailableItems', true]
        ]);
      },
      function (data, args) {
        if (!isObject(data) || !Array.isArray(data.entrees)) { return null; }
        return {
          restaurant_id: num(data.restaurantId || args.restaurant_id),
          items: data.entrees.map(mapMenuItem)
        };
      }
    ),
    'chipotle.get_preconfigured_meals': readHandler(
      'chipotle.get_preconfigured_meals',
      RESTAURANT_PARAMS,
      function (a) {
        return servicesSpec('/menuinnovation/v1/restaurants/' + encodeURIComponent(String(a.restaurant_id)) + '/onlinemeals', [
          ['includeUnavailableItems', true]
        ]);
      },
      function (data) {
        if (!Array.isArray(data)) { return null; }
        return { meals: data.map(mapPreconfiguredMeal) };
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
            service: CHIPOTLE_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerChipotle = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
