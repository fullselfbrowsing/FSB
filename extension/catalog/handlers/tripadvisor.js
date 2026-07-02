(function (global) {
  'use strict';

  /**
   * TripAdvisor same-origin public READ head.
   *
   * Ports public first-party SSR/LD+JSON page reads plus the public restaurant
   * awards GraphQL read. Current-user and saved-status rows stay inactive because
   * they are user-specific.
   */

  var TRIPADVISOR_ORIGIN = 'https://www.tripadvisor.com';
  var TRIPADVISOR_SERVICE = 'tripadvisor.com';
  var GRAPHQL_PATH = '/data/graphql/ids';
  var INT_LIMIT = 9007199254740991;

  var URL_PARAMS = withProps({
    url: { type: 'string', description: 'TripAdvisor page URL path' }
  }, ['url']);

  var LOCATION_ID_PARAMS = withProps({
    location_id: integerSchema('TripAdvisor location ID')
  }, ['location_id']);

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
      reason: reason || 'tripadvisor-public-read-shape-mismatch',
      fellBackToDom: true
    });
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  function cleanPath(value) {
    var path = String(value || '').trim();
    if (!path || path.indexOf('://') !== -1 || path.charAt(0) !== '/') { return ''; }
    return path;
  }

  function htmlSpec(path) {
    return {
      url: TRIPADVISOR_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TRIPADVISOR_ORIGIN,
      extract: null
    };
  }

  function graphqlSpec(queries) {
    var body = (queries || []).map(function (q) {
      return {
        variables: q.variables || {},
        extensions: { preRegisteredQueryId: q.queryId }
      };
    });
    return {
      url: TRIPADVISOR_ORIGIN + GRAPHQL_PATH,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TRIPADVISOR_ORIGIN,
      extract: '@'
    };
  }

  function guardHtml(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'tripadvisor-redirect-or-http-error');
    }
    if (typeof result.text !== 'string' || result.text.indexOf('<') === -1) {
      return fallback(slug, 'tripadvisor-html-shape-mismatch');
    }
    return result;
  }

  function parseLdJson(html) {
    var out = [];
    var re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(String(html || ''))) !== null) {
      try {
        var parsed = JSON.parse(m[1] || '{}');
        if (Array.isArray(parsed)) { out = out.concat(parsed); }
        else { out.push(parsed); }
      } catch (e) {
        // Ignore malformed structured data blocks.
      }
    }
    return out;
  }

  function parseSsrData(html) {
    var dataUriMatch = String(html || '').match(/src=["']data:text\/javascript,([^"']+)["']/);
    var dataUriContent = dataUriMatch && dataUriMatch[1];
    if (!dataUriContent) { return null; }
    var decoded;
    try {
      decoded = decodeURIComponent(dataUriContent);
    } catch (e) {
      return null;
    }
    var jsonMatch = decoded.match(/JSON\.parse\("((?:[^"\\]|\\.)*)"\)\)/);
    var jsonContent = jsonMatch && jsonMatch[1];
    if (!jsonContent) { return null; }
    var bootstrap;
    try {
      var str = jsonContent.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      bootstrap = JSON.parse(str);
    } catch (e2) {
      return null;
    }
    var rawResults = bootstrap && bootstrap.urqlSsrData && bootstrap.urqlSsrData.results;
    if (!rawResults || typeof rawResults !== 'object') { return null; }
    var results = {};
    for (var key in rawResults) {
      if (!Object.prototype.hasOwnProperty.call(rawResults, key)) { continue; }
      try {
        results[key] = JSON.parse(rawResults[key].data || '{}');
      } catch (e3) {
        // Ignore malformed entries.
      }
    }
    return results;
  }

  function findSsrOperation(ssrData, operationName) {
    if (!ssrData) { return null; }
    for (var key in ssrData) {
      if (!Object.prototype.hasOwnProperty.call(ssrData, key)) { continue; }
      var entry = ssrData[key];
      if (entry && Object.prototype.hasOwnProperty.call(entry, operationName)) {
        return entry[operationName];
      }
    }
    return null;
  }

  function stripHtmlTags(html) {
    return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  function num(value, fallbackValue) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallbackValue || 0);
  }

  function firstArray(value) {
    return Array.isArray(value) ? (value[0] || {}) : (value || {});
  }

  function mapLocation(raw) {
    var l = raw || {};
    var addr = l.address || {};
    var addrObj = l.addressObj || {};
    var countryObj = addr.addressCountry;
    var country = (countryObj && typeof countryObj === 'object') ? (countryObj.name || '') : (countryObj || addrObj.country || '');
    var street = addr.streetAddress || addr.street1 || addrObj.street1 || '';
    var city = addr.addressLocality || addrObj.city || '';
    var state = addr.addressRegion || addrObj.state || '';
    var postalCode = addr.postalCode || addrObj.postalcode || '';
    var cuisine = Array.isArray(l.servesCuisine) ? l.servesCuisine
      : (Array.isArray(l.cuisine) ? l.cuisine.map(function(c) { return typeof c === 'object' ? (c.name || '') : String(c || ''); }) : []);
    var imageUrl = l.image || l.imageUrl || '';
    if (!imageUrl && l.photo && l.photo.photoSizeDynamic) {
      imageUrl = String(l.photo.photoSizeDynamic.urlTemplate || '').replace('{width}', '500').replace('{height}', '-1');
    }
    return {
      location_id: num(l.locationId || l.location_id, 0),
      name: String(l.name || l.localizedName || ''),
      type: String(l.placeType || l.type || ''),
      url: String(l.url || (l.route && (l.route.url || l.route.webLinkUrl)) || (l.detailPageRoute && l.detailPageRoute.webLinkUrl) || ''),
      address: [street, city, state, postalCode].filter(Boolean).join(', '),
      city: String(city || ''),
      state: String(state || ''),
      country: String(country || ''),
      postal_code: String(postalCode || ''),
      latitude: num((l.geo && l.geo.latitude) || l.latitude, 0),
      longitude: num((l.geo && l.geo.longitude) || l.longitude, 0),
      phone: String(l.phone || l.telephone || ''),
      rating: num((l.aggregateRating && l.aggregateRating.ratingValue) || l.rating || l.averageRating, 0),
      review_count: num((l.aggregateRating && l.aggregateRating.reviewCount) || l.reviewCount || l.numReviews, 0),
      price_range: String(l.priceRange || l.priceLevel || ''),
      cuisine: cuisine.filter(Boolean),
      image_url: String(imageUrl || ''),
      ranking: String(l.rankingString || l.ranking || '')
    };
  }

  function mapAiSummary(raw) {
    var a = raw || {};
    return {
      summary: String(a.summary || a.text || a.htmlText || ''),
      positive_themes: Array.isArray(a.positiveThemes) ? a.positiveThemes.map(String) : [],
      negative_themes: Array.isArray(a.negativeThemes) ? a.negativeThemes.map(String) : []
    };
  }

  function mapSubratings(raw) {
    var r = raw || {};
    return {
      food: num(r.food || r.foodRating, 0),
      service: num(r.service || r.serviceRating, 0),
      value: num(r.value || r.valueRating, 0),
      atmosphere: num(r.atmosphere || r.atmosphereRating, 0)
    };
  }

  function mapNeighborhood(raw) {
    var n = raw || {};
    return {
      name: String(n.name || n.localizedName || ''),
      description: String(n.description || n.about || ''),
      url: String((n.route && (n.route.url || n.route.webLinkUrl)) || n.url || '')
    };
  }

  function mapReview(raw) {
    var r = raw || {};
    return {
      id: num(r.id, 0),
      title: String(r.title || ''),
      text: String(r.text || stripHtmlTags(r.htmlText && r.htmlText.htmlContent) || ''),
      rating: num(r.rating, 0),
      author: String((r.userProfile && r.userProfile.displayName) || r.author || ''),
      author_location: String((r.userProfile && r.userProfile.hometown && r.userProfile.hometown.locationName) || r.authorLocation || ''),
      date: String(r.publishedDate || r.createdDate || (r.tripInfo && r.tripInfo.stayDate) || ''),
      trip_type: String((r.tripInfo && r.tripInfo.tripType) || r.tripType || ''),
      url: String((r.reviewDetailPageWrapper && r.reviewDetailPageWrapper.reviewDetailPageRoute && r.reviewDetailPageWrapper.reviewDetailPageRoute.url) || r.url || '')
    };
  }

  function mapSearchResult(raw) {
    var r = raw || {};
    var route = r.route || r.detailPageRoute || {};
    var photo = r.photo || (r.thumbnail && r.thumbnail.photo) || {};
    var photoDyn = photo.photoSizeDynamic || {};
    var review = r.reviewSummary || {};
    return {
      location_id: num(r.locationId || r.location_id, 0),
      name: String(r.name || r.localizedName || ''),
      url: String(route.webLinkUrl || route.url || r.url || ''),
      type: String(r.resultType || r.placeType || r.type || ''),
      rating: num(r.rating || review.rating, 0),
      review_count: num(r.reviewCount || review.count, 0),
      image_url: String(photoDyn.urlTemplate || r.imageUrl || '')
    };
  }

  function mapAward(raw) {
    var a = raw || {};
    var awards = Array.isArray(a.awards) ? a.awards : [];
    return awards.map(function(award, i) {
      var summary = Array.isArray(a.summaries) ? (a.summaries[i] || {}) : {};
      return {
        award_name: String(award.award_name || ''),
        award_title: String(award.award_title || ''),
        year: String(award.yearOfAward || ''),
        description: String(award.description || ''),
        summary: String(summary.text || ''),
        external_url: String(summary.externalUrl || '')
      };
    });
  }

  function pageBundle(html) {
    var ssrData = parseSsrData(html);
    if (!ssrData) { return null; }
    return { ssrData: ssrData, ldJson: parseLdJson(html) };
  }

  function applyReviewSummary(rawLocation, ssrData) {
    var reviewSummary = findSsrOperation(ssrData, 'reviewSummaryInfo');
    var first = Array.isArray(reviewSummary) ? (reviewSummary[0] || {}) : {};
    if (first.responseData) {
      rawLocation.rating = first.responseData.rating;
      rawLocation.numReviews = first.responseData.count;
    }
  }

  function applyKeywordsAndRanking(out, ssrData) {
    var keywordsData = findSsrOperation(ssrData, 'keywords');
    out.keywords = (((Array.isArray(keywordsData) ? keywordsData[0] : null) || {}).responseData || {}).keywords || [];
    out.keywords = out.keywords.map(function(k) { return String((k && k.keyword) || ''); }).filter(Boolean);
    var isSaved = findSsrOperation(ssrData, 'isSaved');
    out.is_saved = Array.isArray(isSaved) ? !!isSaved[0] : false;
    var opf = findSsrOperation(ssrData, 'Opf_getOnPageFactorsForLocale');
    var factors = ((Array.isArray(opf) ? (opf[0] || {}) : {}).factors) || [];
    for (var i = 0; i < factors.length; i++) {
      if (factors[i] && factors[i].key === 'MASTHEAD_H1' && out._rawLocation) {
        out._rawLocation.rankingString = factors[i].value;
      }
    }
  }

  function parseRestaurant(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var ld = bundle.ldJson.find(function(d) { return d && (d['@type'] === 'FoodEstablishment' || d['@type'] === 'Restaurant'); }) || {};
    var locations = findSsrOperation(bundle.ssrData, 'locations');
    var rawLocation = Object.assign({}, ld, firstArray(locations));
    applyReviewSummary(rawLocation, bundle.ssrData);
    var subratingsData = findSsrOperation(bundle.ssrData, 'restaurantSubratingsData') || {};
    var subratings = ((subratingsData.restaurants || [])[0] || {}).sub_ratings || {};
    var aiSummary = findSsrOperation(bundle.ssrData, 'ReviewsProxy_getAiReviewSummaryWeb');
    var out = { _rawLocation: rawLocation };
    applyKeywordsAndRanking(out, bundle.ssrData);
    var restaurant = mapLocation(rawLocation);
    if (!restaurant.name && !restaurant.location_id) { return null; }
    delete out._rawLocation;
    return {
      restaurant: restaurant,
      subratings: mapSubratings(subratings),
      ai_summary: mapAiSummary(Array.isArray(aiSummary) ? aiSummary[0] : {}),
      keywords: out.keywords,
      is_saved: out.is_saved
    };
  }

  function parsePlace(html, key, ldTypes) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var ld = bundle.ldJson.find(function(d) { return d && ldTypes.indexOf(d['@type']) !== -1; }) || {};
    var rawLocation = Object.assign({}, ld);
    applyReviewSummary(rawLocation, bundle.ssrData);
    var aiSummary = findSsrOperation(bundle.ssrData, 'ReviewsProxy_getAiReviewSummaryWeb');
    var out = { _rawLocation: rawLocation };
    applyKeywordsAndRanking(out, bundle.ssrData);
    var place = mapLocation(rawLocation);
    if (!place.name && !place.location_id) { return null; }
    delete out._rawLocation;
    var result = {
      ai_summary: mapAiSummary(Array.isArray(aiSummary) ? aiSummary[0] : {}),
      keywords: out.keywords,
      is_saved: out.is_saved
    };
    result[key] = place;
    return result;
  }

  function parseBreadcrumbs(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var data = findSsrOperation(bundle.ssrData, 'breadcrumbsData') || {};
    var list = Array.isArray(data.breadcrumbs) ? data.breadcrumbs : [];
    if (!list.length) { return null; }
    return {
      breadcrumbs: list.map(function(b) {
        return { text: String(b.localizedText || b.text || ''), url: String(b.url || '') };
      })
    };
  }

  function parseNeighborhood(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var data = findSsrOperation(bundle.ssrData, 'RestaurantPresentation_getBestNearby') || {};
    var mapped = mapNeighborhood(data.neighborhood || {});
    if (!mapped.name && !mapped.description) { return null; }
    return { neighborhood: mapped };
  }

  function parseReviews(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var reviewListData = findSsrOperation(bundle.ssrData, 'ReviewsProxy_getReviewListPageForLocation');
    var reviewList = Array.isArray(reviewListData) ? (reviewListData[0] || {}) : {};
    var reviews = Array.isArray(reviewList.reviews) ? reviewList.reviews : [];
    var reviewSummary = findSsrOperation(bundle.ssrData, 'reviewSummaryInfo');
    var summaryFirst = Array.isArray(reviewSummary) ? (reviewSummary[0] || {}) : {};
    var data = {
      reviews: reviews.map(mapReview),
      total_count: num(reviewList.totalCount || (summaryFirst.responseData && summaryFirst.responseData.count), 0),
      rating: num(summaryFirst.responseData && summaryFirst.responseData.rating, 0)
    };
    return data.reviews.length || data.total_count ? data : null;
  }

  function parseAttractionList(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var data = findSsrOperation(bundle.ssrData, 'AttractionsPresentation_searchAttractions') || {};
    var results = Array.isArray(data.attractions) ? data.attractions : [];
    return results.length ? { attractions: results.map(mapSearchResult) } : null;
  }

  function parseHotelList(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var data = findSsrOperation(bundle.ssrData, 'HotelListPresentation_hotel') || {};
    var fallbackData = findSsrOperation(bundle.ssrData, 'hotelResults') || {};
    var results = Array.isArray(data.hotels) ? data.hotels : (Array.isArray(fallbackData.hotels) ? fallbackData.hotels : []);
    return results.length ? { hotels: results.map(mapSearchResult) } : null;
  }

  function parseRestaurantList(html) {
    var bundle = pageBundle(html);
    if (!bundle) { return null; }
    var shelvesData = findSsrOperation(bundle.ssrData, 'RestaurantShelf_getCoverpageShelvesV3') || {};
    var crossSell = findSsrOperation(bundle.ssrData, 'RestaurantShelf_getCrossSellShelf') || {};
    var results = [];
    var seen = {};
    function addItem(item) {
      var id = num(item && item.locationId, 0);
      if (!id || seen[id]) { return; }
      seen[id] = true;
      results.push(mapSearchResult({
        locationId: item.locationId,
        name: item.name,
        route: { webLinkUrl: item.detailPageRoute && item.detailPageRoute.webLinkUrl },
        photo: item.thumbnail && item.thumbnail.photo,
        rating: item.reviewSummary && item.reviewSummary.rating,
        reviewCount: item.reviewSummary && item.reviewSummary.count,
        resultType: 'EATERY'
      }));
    }
    var slots = Array.isArray(shelvesData.shelves) ? shelvesData.shelves : [];
    for (var i = 0; i < slots.length; i++) {
      var shelves = Array.isArray(slots[i].shelves) ? slots[i].shelves : [];
      for (var j = 0; j < shelves.length; j++) {
        var items = Array.isArray(shelves[j].items) ? shelves[j].items : [];
        for (var k = 0; k < items.length; k++) { addItem(items[k]); }
      }
    }
    if (!results.length && Array.isArray(crossSell.items)) {
      for (var c = 0; c < crossSell.items.length; c++) { addItem(crossSell.items[c]); }
    }
    return results.length ? { restaurants: results } : null;
  }

  function parseAwards(data) {
    if (!Array.isArray(data)) { return null; }
    var first = data[0] && data[0].data ? data[0].data : data[0];
    var awardsData = first && first.RestaurantAwards_getRestaurantAwards;
    var raw = Array.isArray(awardsData) ? awardsData[0] : null;
    if (!raw) { return { awards: [] }; }
    return { awards: mapAward(raw) };
  }

  function htmlHandler(slug, parser) {
    return {
      tier: 'T1a',
      origin: TRIPADVISOR_ORIGIN,
      sideEffectClass: 'read',
      params: URL_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'tripadvisor-execute-bound-spec-unavailable');
        }
        var path = cleanPath(args && args.url);
        if (!path) { return fallback(slug, 'tripadvisor-invalid-url-path'); }
        var res = await ctx.executeBoundSpec(htmlSpec(path), ctx.tabId);
        var html = guardHtml(res, slug);
        if (!html || html.success !== true) { return html; }
        var parsed = parser(html.text);
        if (!parsed) { return fallback(slug, 'tripadvisor-public-read-shape-mismatch'); }
        return { success: true, status: html.status, finalUrl: html.finalUrl, redirected: html.redirected, data: parsed };
      }
    };
  }

  function awardsHandler() {
    return {
      tier: 'T1a',
      origin: TRIPADVISOR_ORIGIN,
      sideEffectClass: 'read',
      params: LOCATION_ID_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('tripadvisor.get_restaurant_awards', 'tripadvisor-execute-bound-spec-unavailable');
        }
        var id = num(args && args.location_id, 0);
        if (!id) { return fallback('tripadvisor.get_restaurant_awards', 'tripadvisor-invalid-location-id'); }
        var spec = graphqlSpec([{ variables: { ids: [id] }, queryId: '496720f897546a4e' }]);
        var res = await ctx.executeBoundSpec(spec, ctx.tabId);
        if (!res || res.success !== true) { return res; }
        var parsed = parseAwards(res.data);
        if (!parsed) { return fallback('tripadvisor.get_restaurant_awards', 'tripadvisor-public-read-shape-mismatch'); }
        return { success: true, status: res.status, finalUrl: res.finalUrl, redirected: res.redirected, data: parsed };
      }
    };
  }

  var handlers = {
    'tripadvisor.get_attraction': htmlHandler('tripadvisor.get_attraction', function(html) {
      return parsePlace(html, 'attraction', ['TouristAttraction', 'LocalBusiness', 'Place']);
    }),
    'tripadvisor.get_breadcrumbs': htmlHandler('tripadvisor.get_breadcrumbs', parseBreadcrumbs),
    'tripadvisor.get_hotel': htmlHandler('tripadvisor.get_hotel', function(html) {
      return parsePlace(html, 'hotel', ['Hotel', 'LodgingBusiness']);
    }),
    'tripadvisor.get_neighborhood': htmlHandler('tripadvisor.get_neighborhood', parseNeighborhood),
    'tripadvisor.get_restaurant': htmlHandler('tripadvisor.get_restaurant', parseRestaurant),
    'tripadvisor.get_restaurant_awards': awardsHandler(),
    'tripadvisor.get_reviews': htmlHandler('tripadvisor.get_reviews', parseReviews),
    'tripadvisor.list_attractions': htmlHandler('tripadvisor.list_attractions', parseAttractionList),
    'tripadvisor.list_hotels': htmlHandler('tripadvisor.list_hotels', parseHotelList),
    'tripadvisor.list_restaurants': htmlHandler('tripadvisor.list_restaurants', parseRestaurantList)
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
          descriptor: { slug: slug, service: TRIPADVISOR_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerTripadvisor = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
