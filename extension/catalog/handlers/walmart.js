(function (global) {
  'use strict';

  /**
   * Walmart public same-origin HTML READ head.
   *
   * Ports only public, parameter-driven page-data reads on www.walmart.com.
   * Account, cart, order, checkout, and navigation rows stay in the discovery
   * tail until their authenticated or browser-navigation behavior is reviewed.
   */

  var WALMART_ORIGIN = 'https://www.walmart.com';
  var WALMART_SERVICE = 'walmart.com';
  var INT_LIMIT = 9007199254740991;

  var SORT_MAP = {
    best_match: 'best_match',
    price_low: 'price_asc',
    price_high: 'price_desc',
    best_seller: 'best_seller',
    new: 'new',
    rating_high: 'rating_high'
  };

  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search keywords' },
    page: integerSchema('Page number', 1, INT_LIMIT),
    sort: {
      type: 'string',
      enum: ['best_match', 'price_low', 'price_high', 'best_seller', 'new', 'rating_high'],
      description: 'Sort order'
    }
  }, ['query']);

  var PRODUCT_PARAMS = schema({
    us_item_id: { type: 'string', minLength: 1, description: 'Walmart US item ID' }
  }, ['us_item_id']);

  var STORE_PARAMS = schema({
    store_id: { type: 'string', minLength: 1, description: 'Walmart store ID or slug' }
  }, ['store_id']);

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
      reason: reason || 'walmart-public-html-shape-mismatch',
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
      url: WALMART_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: WALMART_ORIGIN,
      extract: '@'
    };
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
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function stripHtml(value) {
    return str(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

  function digitString(value) {
    var out = str(value).trim();
    return /^[0-9]+$/.test(out) ? out : '';
  }

  function storeId(value) {
    var out = str(value).trim();
    return /^[0-9][A-Za-z0-9-]*$/.test(out) ? out : '';
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

    var next = payload.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (next && next[1]) {
      var parsedNext = parseJsonText(next[1]);
      if (parsedNext) { out.push(parsedNext); }
    }

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

  function pagePropsCandidates(payload) {
    var raw = dataCandidates(payload);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var candidate = raw[i];
      var pageProps = nested(candidate, ['props', 'pageProps']);
      if (isObject(pageProps)) { out.push(pageProps); }
      if (isObject(candidate) && candidate.initialData) { out.push(candidate); }
    }
    return out;
  }

  function productUrl(raw, id) {
    var value = firstString([raw && raw.canonicalUrl, raw && raw.url]);
    if (value.indexOf('https://') === 0 || value.indexOf('http://') === 0) { return value; }
    if (value.charAt(0) === '/') { return value; }
    return id ? '/ip/item/' + encodeURIComponent(id) : '';
  }

  function mapSearchItem(raw) {
    if (!isObject(raw)) { return null; }
    var id = firstString([raw.usItemId, raw.us_item_id]);
    var name = firstString([raw.name, raw.title]);
    if (!id || !name) { return null; }
    var priceInfo = raw.priceInfo || {};
    var currentPrice = priceInfo.currentPrice || {};
    var availability = raw.availabilityStatusV2 || {};
    var badges = list(raw.fulfillmentBadges);
    return {
      us_item_id: id,
      name: name,
      brand: firstString([raw.brand, nested(raw, ['brandInfo', 'name'])]),
      price: firstString([priceInfo.linePriceDisplay, priceInfo.linePrice, currentPrice.priceString]),
      price_value: num(currentPrice.price),
      was_price: str(priceInfo.wasPrice),
      average_rating: num(raw.averageRating),
      num_reviews: num(raw.numberOfReviews),
      image_url: firstString([nested(raw, ['imageInfo', 'thumbnailUrl']), raw.image]),
      url: productUrl(raw, id),
      availability: firstString([availability.value, availability.display, raw.availabilityStatus]),
      fulfillment_badge: firstString([raw.fulfillmentBadge, badges.join(', ')]),
      seller_name: str(raw.sellerName),
      snap_eligible: bool(raw.snapEligible)
    };
  }

  function mapProductDetail(product, idml) {
    var p = product || {};
    var itemId = firstString([p.usItemId, p.us_item_id]);
    var priceInfo = p.priceInfo || {};
    var currentPrice = priceInfo.currentPrice || {};
    var imageInfo = p.imageInfo || {};
    var availability = p.availabilityStatusV2 || {};
    var categoryPath = list(nested(p, ['category', 'path']));
    var fulfillment = list(p.fulfillmentLabel);
    var specs = list(idml && idml.specifications).map(function (s) {
      return { name: str(s && s.name), value: stripHtml(s && s.value) };
    });
    var highlights = list(idml && idml.productHighlights).map(function (h) {
      var name = str(h && h.name);
      var value = str(h && h.value);
      return name && value ? name + ': ' + value : (name || value);
    }).filter(Boolean);
    return {
      us_item_id: itemId,
      name: str(p.name),
      brand: str(p.brand),
      short_description: stripHtml(p.shortDescription),
      long_description: stripHtml(idml && idml.longDescription),
      price: str(currentPrice.priceString),
      price_value: num(currentPrice.price),
      was_price: str(priceInfo.wasPrice),
      average_rating: num(p.averageRating),
      num_reviews: num(p.numberOfReviews),
      image_url: firstString([imageInfo.thumbnailUrl, nested(imageInfo, ['allImages', 0, 'url'])]),
      url: productUrl(p, itemId),
      availability: firstString([availability.value, p.availabilityStatus]),
      seller_name: firstString([p.sellerDisplayName, p.sellerName]),
      seller_id: str(p.sellerId),
      item_type: str(p.type),
      upc: str(p.upc),
      category: categoryPath.map(function (c) { return str(c && c.name); }).filter(Boolean).join(' > '),
      fulfillment_summary: fulfillment.map(function (f) { return str(f && f.message); }).filter(Boolean),
      specifications: specs,
      highlights: highlights,
      snap_eligible: bool(p.snapEligible),
      return_policy: str(nested(p, ['returnPolicy', 'returnPolicyText']))
    };
  }

  function mapReview(raw) {
    var r = raw || {};
    return {
      title: str(r.reviewTitle),
      text: str(r.reviewText),
      rating: num(r.rating),
      author: str(r.userNickname),
      date: str(r.reviewSubmissionTime),
      positive_feedback: num(r.positiveFeedback),
      negative_feedback: num(r.negativeFeedback)
    };
  }

  function mapReviewSummary(raw) {
    var r = raw || {};
    return {
      average_rating: num(firstString([r.roundedAverageOverallRating, r.averageOverallRating])),
      total_reviews: num(r.totalReviewCount),
      recommended_percentage: num(r.recommendedPercentage),
      five_star_count: num(r.ratingValueFiveCount),
      four_star_count: num(r.ratingValueFourCount),
      three_star_count: num(r.ratingValueThreeCount),
      two_star_count: num(r.ratingValueTwoCount),
      one_star_count: num(r.ratingValueOneCount)
    };
  }

  function mapStore(raw) {
    var r = raw || {};
    var address = r.address || {};
    return {
      store_id: str(r.id),
      name: str(r.displayName),
      store_type: str(r.name),
      address: str(address.addressLineOne),
      city: str(address.city),
      state: str(address.state),
      zip: str(address.postalCode),
      phone: str(r.phoneNumber),
      is_open_24_hours: bool(r.open24Hours),
      hours: list(r.operationalHours).filter(function (h) {
        return h && !h.closed;
      }).map(function (h) {
        return { day: str(h.day), start: str(h.start), end: str(h.end) };
      }),
      services: list(r.services).map(function (s) {
        return { name: str(s && s.name), display_name: str(s && s.displayName), phone: str(s && s.phone) };
      })
    };
  }

  function textFromResult(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'walmart-public-html-request-failed');
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'walmart-public-html-http-error');
    }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (isObject(result.data)) { return result.data; }
    return fallback(slug, 'walmart-public-html-empty');
  }

  async function readPage(slug, spec, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'walmart-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    return textFromResult(res, slug);
  }

  function findSearchResult(pageProps) {
    for (var i = 0; i < pageProps.length; i++) {
      var result = nested(pageProps[i], ['initialData', 'searchResult']);
      if (isObject(result)) { return result; }
    }
    return null;
  }

  function findProductData(pageProps) {
    for (var i = 0; i < pageProps.length; i++) {
      var inner = nested(pageProps[i], ['initialData', 'data']);
      if (isObject(inner) && isObject(inner.product)) { return inner; }
    }
    return null;
  }

  function findStoreData(pageProps) {
    for (var i = 0; i < pageProps.length; i++) {
      var raw = nested(pageProps[i], ['initialData', 'initialDataNodeDetail', 'data', 'nodeDetail']);
      if (isObject(raw)) { return raw; }
    }
    return null;
  }

  function readHandler(slug, params, handle) {
    return {
      tier: 'T1a',
      origin: WALMART_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return handle(args || {}, ctx);
      }
    };
  }

  var handlers = {
    'walmart.search_products': readHandler(
      'walmart.search_products',
      SEARCH_PARAMS,
      async function (args, ctx) {
        var query = str(args.query).trim();
        if (!query) { return fallback('walmart.search_products', 'walmart-invalid-query'); }
        var page = Math.max(1, num(args.page) || 1);
        var sort = SORT_MAP[args.sort] || 'best_match';
        var payload = await readPage('walmart.search_products', htmlSpec('/search', [
          ['q', query],
          ['page', page],
          ['sort', sort]
        ]), ctx);
        if (!payload || payload.success === false) { return payload; }
        var searchResult = findSearchResult(pagePropsCandidates(payload));
        if (!searchResult) { return fallback('walmart.search_products', 'walmart-public-html-shape-mismatch'); }
        var stacks = list(searchResult.itemStacks);
        var rawItems = stacks.length ? list(stacks[0] && stacks[0].items) : [];
        var items = rawItems.map(mapSearchItem).filter(Boolean);
        if (!items.length) { return fallback('walmart.search_products', 'walmart-public-html-shape-mismatch'); }
        return {
          success: true,
          data: {
            items: items,
            total_results: num(searchResult.count) || items.length,
            max_page: num(nested(searchResult, ['paginationV2', 'maxPage'])) || 1,
            current_page: page
          }
        };
      }
    ),
    'walmart.get_product': readHandler(
      'walmart.get_product',
      PRODUCT_PARAMS,
      async function (args, ctx) {
        var id = digitString(args.us_item_id);
        if (!id) { return fallback('walmart.get_product', 'walmart-invalid-us-item-id'); }
        var payload = await readPage('walmart.get_product', htmlSpec('/ip/item/' + encodeURIComponent(id), []), ctx);
        if (!payload || payload.success === false) { return payload; }
        var inner = findProductData(pagePropsCandidates(payload));
        if (!inner || !inner.product) { return fallback('walmart.get_product', 'walmart-product-not-found'); }
        var product = mapProductDetail(inner.product, inner.idml);
        if (!product.us_item_id || !product.name) {
          return fallback('walmart.get_product', 'walmart-product-shape-mismatch');
        }
        return { success: true, data: { product: product } };
      }
    ),
    'walmart.get_product_reviews': readHandler(
      'walmart.get_product_reviews',
      PRODUCT_PARAMS,
      async function (args, ctx) {
        var id = digitString(args.us_item_id);
        if (!id) { return fallback('walmart.get_product_reviews', 'walmart-invalid-us-item-id'); }
        var payload = await readPage('walmart.get_product_reviews', htmlSpec('/ip/item/' + encodeURIComponent(id), []), ctx);
        if (!payload || payload.success === false) { return payload; }
        var inner = findProductData(pagePropsCandidates(payload));
        var reviews = inner && inner.reviews;
        if (!isObject(reviews)) {
          return fallback('walmart.get_product_reviews', 'walmart-reviews-not-found');
        }
        var rawSummary = reviews.roundedAverageOverallRating !== undefined
          ? reviews
          : (reviews.reviewStatistics || reviews);
        return {
          success: true,
          data: {
            summary: mapReviewSummary(rawSummary),
            reviews: list(reviews.customerReviews).map(mapReview)
          }
        };
      }
    ),
    'walmart.get_store': readHandler(
      'walmart.get_store',
      STORE_PARAMS,
      async function (args, ctx) {
        var id = storeId(args.store_id);
        if (!id) { return fallback('walmart.get_store', 'walmart-invalid-store-id'); }
        var payload = await readPage('walmart.get_store', htmlSpec('/store/' + encodeURIComponent(id), []), ctx);
        if (!payload || payload.success === false) { return payload; }
        var raw = findStoreData(pagePropsCandidates(payload));
        if (!raw) { return fallback('walmart.get_store', 'walmart-store-not-found'); }
        var store = mapStore(raw);
        if (!store.store_id || !store.name) { return fallback('walmart.get_store', 'walmart-store-shape-mismatch'); }
        return { success: true, data: { store: store } };
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
            service: WALMART_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerWalmart = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
