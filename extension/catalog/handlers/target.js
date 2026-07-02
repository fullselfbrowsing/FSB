(function (global) {
  'use strict';

  /**
   * Target public same-origin HTML READ head.
   *
   * Ports only product search/detail page reads on www.target.com. Account,
   * loyalty, order, cart, checkout, shopping-list, store, and mutation rows stay
   * in the discovery tail until their authenticated runtime shape is reviewed.
   */

  var TARGET_ORIGIN = 'https://www.target.com';
  var TARGET_SERVICE = 'target.com';
  var INT_LIMIT = 9007199254740991;

  var SEARCH_PARAMS = schema({
    keyword: { type: 'string', minLength: 1, description: 'Search keyword' },
    count: integerSchema('Number of results to return', 1, 24),
    offset: integerSchema('Result offset for pagination', 0, INT_LIMIT)
  }, ['keyword']);

  var PRODUCT_PARAMS = schema({
    tcin: { type: 'string', minLength: 1, description: 'Target item number (TCIN)' }
  }, ['tcin']);

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
      reason: reason || 'target-public-html-shape-mismatch',
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

  function htmlSpec(path, pairs) {
    return {
      url: TARGET_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TARGET_ORIGIN,
      extract: '@'
    };
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

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function stripHtml(value) {
    return str(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  function decodeEntities(value) {
    return str(value)
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function textFromResult(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'target-public-html-request-failed');
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'target-public-html-http-error');
    }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (isObject(result.data)) { return result.data; }
    return fallback(slug, 'target-public-html-empty');
  }

  function parseJsonText(text) {
    var s = decodeEntities(text).trim();
    if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) { return null; }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function dataCandidates(payload) {
    var out = [];
    if (isObject(payload) || Array.isArray(payload)) { out.push(payload); }
    if (typeof payload !== 'string') { return out; }

    var scripts = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = scripts.exec(payload))) {
      var parsed = parseJsonText(match[1]);
      if (parsed) { out.push(parsed); }
    }
    var bare = parseJsonText(payload);
    if (bare) { out.push(bare); }
    return out;
  }

  function walk(value, visitor, depth) {
    if (depth > 24 || value === null || value === undefined) { return; }
    visitor(value);
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) { walk(value[i], visitor, depth + 1); }
    } else if (isObject(value)) {
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) { walk(value[k], visitor, depth + 1); }
      }
    }
  }

  function nested(raw, path) {
    var cur = raw;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') { return undefined; }
      cur = cur[path[i]];
    }
    return cur;
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && String(v) !== '') { return String(v); }
    }
    return '';
  }

  function priceString(raw) {
    var direct = firstString([
      nested(raw, ['price', 'formatted_current_price']),
      nested(raw, ['price', 'formatted_current_price_text']),
      nested(raw, ['price', 'formatted_sale_price']),
      nested(raw, ['offers', 'price']),
      raw.price_formatted,
      raw.formatted_price
    ]);
    if (direct && direct.charAt(0) !== '$' && /^\d+(?:\.\d+)?$/.test(direct)) {
      return '$' + direct;
    }
    return direct;
  }

  function targetUrl(raw, tcin) {
    var value = firstString([raw.url, raw.canonical_url, nested(raw, ['item', 'buy_url'])]);
    if (value.indexOf('https://') === 0 || value.indexOf('http://') === 0) { return value; }
    if (value.charAt(0) === '/') { return TARGET_ORIGIN + value; }
    return tcin ? TARGET_ORIGIN + '/p/-/A-' + encodeURIComponent(tcin) : '';
  }

  function normalizeProduct(raw) {
    if (!isObject(raw)) { return null; }
    var tcin = firstString([
      raw.tcin,
      raw.TCIN,
      raw.sku,
      raw.product_id,
      nested(raw, ['item', 'tcin'])
    ]);
    var title = firstString([
      nested(raw, ['item', 'product_description', 'title']),
      nested(raw, ['product_description', 'title']),
      raw.title,
      raw.name
    ]);
    if (!tcin || !title) { return null; }
    var rating = numberValue(firstString([
      nested(raw, ['ratings_and_reviews', 'statistics', 'rating', 'average']),
      nested(raw, ['aggregateRating', 'ratingValue']),
      raw.rating
    ]));
    var reviewCount = numberValue(firstString([
      nested(raw, ['ratings_and_reviews', 'statistics', 'review_count']),
      nested(raw, ['ratings_and_reviews', 'statistics', 'rating', 'count']),
      nested(raw, ['aggregateRating', 'reviewCount']),
      raw.review_count
    ]));
    return {
      tcin: tcin,
      title: title,
      price: priceString(raw),
      brand: firstString([
        nested(raw, ['item', 'primary_brand', 'name']),
        nested(raw, ['brand', 'name']),
        raw.brand
      ]),
      rating: rating,
      review_count: reviewCount,
      image_url: firstString([
        nested(raw, ['item', 'enrichment', 'images', 'primary_image_url']),
        raw.image_url,
        raw.image
      ]),
      url: targetUrl(raw, tcin),
      description: stripHtml(firstString([
        nested(raw, ['item', 'product_description', 'downstream_description']),
        nested(raw, ['product_description', 'downstream_description']),
        raw.description
      ]))
    };
  }

  function bulletDescriptions(raw) {
    var bullets = nested(raw, ['item', 'product_description', 'bullet_descriptions']) ||
      nested(raw, ['product_description', 'bullet_descriptions']) ||
      raw.bullet_descriptions ||
      raw.bullets ||
      [];
    var out = [];
    for (var i = 0; i < list(bullets).length; i++) {
      var text = stripHtml(bullets[i]);
      if (text) { out.push(text); }
    }
    return out;
  }

  function collectProducts(candidates) {
    var seen = {};
    var products = [];
    for (var i = 0; i < candidates.length; i++) {
      walk(candidates[i], function (value) {
        var mapped = normalizeProduct(value);
        if (!mapped || seen[mapped.tcin]) { return; }
        mapped.bullet_descriptions = bulletDescriptions(value);
        seen[mapped.tcin] = true;
        products.push(mapped);
      }, 0);
    }
    return products;
  }

  function findTotal(candidates, fallbackTotal) {
    var total = null;
    var keys = {
      total_results: true,
      totalResults: true,
      total_results_count: true,
      total: true
    };
    for (var i = 0; i < candidates.length; i++) {
      walk(candidates[i], function (value) {
        if (total !== null || !isObject(value)) { return; }
        for (var k in keys) {
          if (Object.prototype.hasOwnProperty.call(keys, k) &&
              value[k] !== undefined && Number.isFinite(Number(value[k]))) {
            total = Number(value[k]);
            return;
          }
        }
      }, 0);
    }
    return total === null ? fallbackTotal : total;
  }

  async function readPage(slug, spec, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'target-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    return textFromResult(res, slug);
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: TARGET_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  var handlers = {
    'target.search_products': readHandler(
      'target.search_products',
      SEARCH_PARAMS,
      async function (args, ctx) {
        var payload = await readPage('target.search_products', htmlSpec('/s', [
          ['searchTerm', args.keyword],
          ['Nao', args.offset || 0]
        ]), ctx);
        if (!payload || payload.success === false) { return payload; }
        var candidates = dataCandidates(payload);
        var products = collectProducts(candidates);
        if (!products.length) { return fallback('target.search_products', 'target-public-html-shape-mismatch'); }
        var count = Number(args.count) || 10;
        var sliced = products.slice(0, count);
        return {
          success: true,
          data: {
            products: sliced,
            total_results: findTotal(candidates, products.length)
          }
        };
      }
    ),
    'target.get_product': readHandler(
      'target.get_product',
      PRODUCT_PARAMS,
      async function (args, ctx) {
        var tcin = String(args.tcin || '');
        var payload = await readPage('target.get_product', htmlSpec('/p/-/A-' + encodeURIComponent(tcin), []), ctx);
        if (!payload || payload.success === false) { return payload; }
        var products = collectProducts(dataCandidates(payload));
        var found = null;
        for (var i = 0; i < products.length; i++) {
          if (products[i].tcin === tcin) { found = products[i]; break; }
        }
        if (!found && products.length) { found = products[0]; }
        if (!found) { return fallback('target.get_product', 'target-public-html-shape-mismatch'); }
        return {
          success: true,
          data: {
            product: {
              tcin: found.tcin,
              title: found.title,
              description: found.description,
              price: found.price,
              brand: found.brand,
              rating: found.rating,
              review_count: found.review_count,
              image_url: found.image_url,
              bullet_descriptions: found.bullet_descriptions,
              url: found.url
            }
          }
        };
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
            service: TARGET_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTarget = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
