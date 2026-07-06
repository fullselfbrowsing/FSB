(function (global) {
  'use strict';

  /**
   * Panda Express public same-origin READ head.
   *
   * Ports only explicit-input public Olo/NomNom restaurant, menu, and modifier
   * reads over www.pandaexpress.com. Basket, checkout, coupon, profile, billing,
   * favorites, loyalty, recent-order, navigation, and mutation rows stay in the
   * discovery tail until their auth/runtime shape or mutation evidence is reviewed.
   */

  var PANDAEXPRESS_ORIGIN = 'https://www.pandaexpress.com';
  var PANDAEXPRESS_SERVICE = 'pandaexpress.com';
  var INT_LIMIT = 9007199254740991;

  var FIND_RESTAURANTS_PARAMS = schema({
    latitude: { type: 'number', description: 'Latitude coordinate of the search center' },
    longitude: { type: 'number', description: 'Longitude coordinate of the search center' },
    radius: { type: 'number', description: 'Search radius in miles (default 10)' },
    limit: {
      type: 'integer',
      minimum: -INT_LIMIT,
      maximum: INT_LIMIT,
      description: 'Maximum number of results (default 10)'
    }
  }, ['latitude', 'longitude']);
  var GET_RESTAURANT_PARAMS = schema({
    slug: { type: 'string', description: 'Restaurant URL slug (e.g., "fillmore-geary-px")' },
    ext_ref: { type: 'string', description: 'External reference number (e.g., "4226")' }
  });
  var RESTAURANT_MENU_PARAMS = schema({
    restaurant_id: {
      type: 'integer',
      minimum: -INT_LIMIT,
      maximum: INT_LIMIT,
      description: 'Restaurant ID (from find_restaurants)'
    }
  }, ['restaurant_id']);
  var PRODUCT_MODIFIERS_PARAMS = schema({
    product_id: {
      type: 'integer',
      minimum: -INT_LIMIT,
      maximum: INT_LIMIT,
      description: 'Product ID from get_restaurant_menu'
    }
  }, ['product_id']);

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
      reason: reason || 'pandaexpress-public-olo-shape-mismatch',
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

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function oloSpec(path, pairs) {
    return {
      url: PANDAEXPRESS_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: PANDAEXPRESS_ORIGIN,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function responseData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'pandaexpress-public-olo-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'pandaexpress-public-olo-http-error');
    }
    if (result.data === undefined || result.data === null) {
      return fallback(slug, 'pandaexpress-public-olo-empty');
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

  function firstFilename(images) {
    var imgs = list(images);
    return imgs.length && imgs[0] && imgs[0].filename ? str(imgs[0].filename) : '';
  }

  function mapRestaurant(raw) {
    var r = raw || {};
    return {
      id: num(r.id),
      name: str(r.name),
      slug: str(r.slug),
      street_address: str(r.streetaddress),
      city: str(r.city),
      state: str(r.state),
      zip: str(r.zip),
      phone: str(r.telephone),
      latitude: num(r.latitude),
      longitude: num(r.longitude),
      distance: num(r.distance),
      is_available: bool(r.isavailable),
      is_open: bool(r.isopen),
      can_deliver: bool(r.candeliver),
      can_pickup: bool(r.canpickup),
      delivery_fee: str(r.deliveryfee === undefined ? '0' : r.deliveryfee),
      ext_ref: str(r.extref)
    };
  }

  function mapMenuCategory(raw) {
    var c = raw || {};
    return {
      id: num(c.id),
      name: str(c.name),
      description: str(c.description),
      product_count: list(c.products).length
    };
  }

  function mapMenuProduct(raw, categoryName, imagePath) {
    var p = raw || {};
    var image = firstFilename(p.images);
    return {
      id: num(p.id),
      name: str(p.name),
      description: str(p.description),
      cost: num(p.cost),
      base_calories: str(p.basecalories),
      max_calories: str(p.maxcalories),
      image_url: image ? str(imagePath) + image : '',
      category: str(categoryName)
    };
  }

  function mapModifierOption(raw) {
    var o = raw || {};
    return {
      id: num(o.id),
      name: str(o.name),
      cost: num(o.cost),
      is_default: bool(o.isdefault)
    };
  }

  function mapModifierGroup(raw) {
    var g = raw || {};
    return {
      id: num(g.id),
      name: str(g.description),
      mandatory: bool(g.mandatory),
      options: list(g.options).map(mapModifierOption)
    };
  }

  async function callOlo(slug, spec, ctx, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'pandaexpress-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    var data = responseData(res, slug);
    if (!data || data.success === false) { return data; }
    var parsed = parser(data);
    if (!parsed) { return fallback(slug, 'pandaexpress-public-olo-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, specFn, parser) {
    return {
      tier: 'T1a',
      origin: PANDAEXPRESS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var a = args || {};
        var spec = specFn(a);
        if (!spec) { return fallback(slug, 'pandaexpress-required-input-missing'); }
        return callOlo(slug, spec, ctx, parser);
      }
    };
  }

  var handlers = {
    'pandaexpress.find_restaurants': readHandler(
      'pandaexpress.find_restaurants',
      FIND_RESTAURANTS_PARAMS,
      function (a) {
        if (!Number.isFinite(Number(a.latitude)) || !Number.isFinite(Number(a.longitude))) { return null; }
        return oloSpec('/restaurants/near', [
          ['lat', a.latitude],
          ['long', a.longitude],
          ['radius', a.radius === undefined ? 10 : a.radius],
          ['limit', a.limit === undefined ? 10 : a.limit]
        ]);
      },
      function (data) {
        if (!isObject(data) || !Array.isArray(data.restaurants)) { return null; }
        return { restaurants: data.restaurants.map(mapRestaurant) };
      }
    ),
    'pandaexpress.get_restaurant': readHandler(
      'pandaexpress.get_restaurant',
      GET_RESTAURANT_PARAMS,
      function (a) {
        if (a.slug) { return oloSpec('/restaurants/byslug/' + encodeSegment(a.slug)); }
        if (a.ext_ref) { return oloSpec('/restaurants/byref/' + encodeSegment(a.ext_ref)); }
        return null;
      },
      function (data) {
        var restaurant = null;
        if (Array.isArray(data.restaurants)) { restaurant = data.restaurants[0] || null; }
        else if (isObject(data)) { restaurant = data; }
        if (!restaurant || (restaurant.id === undefined && restaurant.name === undefined)) { return null; }
        return { restaurant: mapRestaurant(restaurant) };
      }
    ),
    'pandaexpress.get_restaurant_menu': readHandler(
      'pandaexpress.get_restaurant_menu',
      RESTAURANT_MENU_PARAMS,
      function (a) {
        if (!Number.isFinite(Number(a.restaurant_id))) { return null; }
        return oloSpec('/restaurants/' + encodeSegment(a.restaurant_id) + '/menu');
      },
      function (data) {
        if (!isObject(data) || !Array.isArray(data.categories)) { return null; }
        var imagePath = str(data.imagepath);
        var categories = data.categories.map(mapMenuCategory);
        var products = [];
        for (var i = 0; i < data.categories.length; i++) {
          var cat = data.categories[i] || {};
          var rawProducts = list(cat.products);
          for (var j = 0; j < rawProducts.length; j++) {
            products.push(mapMenuProduct(rawProducts[j], cat.name || '', imagePath));
          }
        }
        return { categories: categories, products: products };
      }
    ),
    'pandaexpress.get_product_modifiers': readHandler(
      'pandaexpress.get_product_modifiers',
      PRODUCT_MODIFIERS_PARAMS,
      function (a) {
        if (!Number.isFinite(Number(a.product_id))) { return null; }
        return oloSpec('/products/' + encodeSegment(a.product_id) + '/modifiers');
      },
      function (data) {
        if (!isObject(data) || !Array.isArray(data.optiongroups)) { return null; }
        return { groups: data.optiongroups.map(mapModifierGroup) };
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
            service: PANDAEXPRESS_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerPandaexpress = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
