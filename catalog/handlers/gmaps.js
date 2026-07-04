(function (global) {
  'use strict';

  /**
   * Google Maps same-origin read head.
   *
   * Maps read rows are either deterministic URL builders, same-origin public page
   * reads, or bounded MAIN-world state reads of the active Maps URL. The one
   * catalog write row stays guarded fail-closed until live mutation evidence says
   * otherwise.
   */

  var ORIGIN = 'https://www.google.com';
  var SERVICE = 'www.google.com';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var QUERY_PARAMS = schema({
    query: stringField('Place name or address')
  }, ['query']);
  var DIRECTIONS_PARAMS = schema({
    origin: stringField('Starting point'),
    destination: stringField('Destination'),
    travel_mode: travelModeField()
  }, ['origin', 'destination']);
  var MAP_URL_PARAMS = schema({
    type: { type: 'string', enum: ['location', 'search', 'place', 'directions'], description: 'Maps URL type' },
    query: { type: 'string', description: 'Search query or place name' },
    lat: { type: 'number', description: 'Latitude' },
    lng: { type: 'number', description: 'Longitude' },
    zoom: integerField('Zoom level', 1, 21),
    origin: { type: 'string', description: 'Directions origin' },
    destination: { type: 'string', description: 'Directions destination' },
    travel_mode: travelModeField()
  }, ['type']);
  var LOCATION_PARAMS = schema({
    lat: { type: 'number', description: 'Latitude' },
    lng: { type: 'number', description: 'Longitude' },
    zoom: integerField('Zoom level', 1, 21)
  }, ['lat', 'lng']);
  var OPTIONAL_LOCATION_PARAMS = schema({
    lat: { type: 'number', description: 'Latitude' },
    lng: { type: 'number', description: 'Longitude' },
    zoom: integerField('Zoom level', 1, 21)
  }, []);
  var SEARCH_PARAMS = schema({
    query: stringField('Search query'),
    lat: { type: 'number', description: 'Latitude' },
    lng: { type: 'number', description: 'Longitude' },
    zoom: integerField('Zoom level', 1, 21)
  }, ['query']);
  var NEARBY_PARAMS = schema({
    category: stringField('Place category'),
    lat: { type: 'number', description: 'Latitude' },
    lng: { type: 'number', description: 'Longitude' },
    zoom: integerField('Zoom level', 1, 21)
  }, ['category']);
  var SEARCH_PLACES_PARAMS = schema({
    query: stringField('Search query'),
    lat: { type: 'number', description: 'Latitude' },
    lng: { type: 'number', description: 'Longitude' },
    radius: integerField('Search radius in meters', -INT_LIMIT, INT_LIMIT),
    max_results: integerField('Maximum results', 1, 20)
  }, ['query']);
  var LAYER_PARAMS = schema({
    layer: { type: 'string', enum: ['traffic', 'transit', 'bicycling', 'terrain'], description: 'Maps layer' }
  }, ['layer']);
  var ZOOM_PARAMS = schema({
    zoom: integerField('Target zoom level', 1, 21)
  }, ['zoom']);
  var TRAVEL_MODE_PARAMS = schema({
    travel_mode: travelModeField()
  }, ['travel_mode']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function stringField(description) {
    return { type: 'string', minLength: 1, description: description };
  }

  function integerField(description, minimum, maximum) {
    return {
      type: 'integer',
      minimum: minimum === undefined ? -INT_LIMIT : minimum,
      maximum: maximum === undefined ? INT_LIMIT : maximum,
      description: description
    };
  }

  function travelModeField() {
    return {
      type: 'string',
      enum: ['driving', 'transit', 'walking', 'bicycling'],
      description: 'Travel mode'
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
      reason: reason || 'gmaps-handler-unavailable',
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

  function finiteNumber(value, fallbackValue) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallbackValue;
  }

  function intValue(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function enc(value) {
    return encodeURIComponent(str(value));
  }

  function travelMode(value) {
    var mode = str(value) || 'driving';
    return /^(driving|transit|walking|bicycling)$/.test(mode) ? mode : 'driving';
  }

  function buildSearchPath(query, lat, lng, zoom) {
    var q = enc(query);
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return '/maps/search/' + q + '/@' + Number(lat) + ',' + Number(lng) + ',' + intValue(zoom, 15, 1, 21) + 'z';
    }
    return '/maps/search/' + q;
  }

  function buildDirectionsPath(origin, destination, mode) {
    var modeMap = { driving: '0', transit: '1', walking: '2', bicycling: '3' };
    var code = modeMap[travelMode(mode)] || '0';
    return '/maps/dir/' + enc(origin) + '/' + enc(destination) + '/data=!4m2!4m1!3e' + code;
  }

  function buildPlacePath(query) {
    return '/maps/place/' + enc(query);
  }

  function buildLocationPath(lat, lng, zoom) {
    return '/maps/@' + finiteNumber(lat, 0) + ',' + finiteNumber(lng, 0) + ',' + intValue(zoom, 15, 1, 21) + 'z';
  }

  function buildMapUrl(args) {
    args = args || {};
    if (args.type === 'location') {
      return ORIGIN + buildLocationPath(args.lat, args.lng, args.zoom);
    }
    if (args.type === 'search') {
      return ORIGIN + buildSearchPath(args.query || '', args.lat, args.lng, args.zoom);
    }
    if (args.type === 'place') {
      return ORIGIN + buildPlacePath(args.query || '');
    }
    if (args.type === 'directions') {
      return ORIGIN + buildDirectionsPath(args.origin || '', args.destination || args.query || '', args.travel_mode);
    }
    return ORIGIN + '/maps';
  }

  function ok(data, status) {
    return { success: true, status: status || 200, data: data };
  }

  function htmlSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  function resultText(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (isObject(result.data) || Array.isArray(result.data)) {
      try { return JSON.stringify(result.data); } catch (e) { return ''; }
    }
    return '';
  }

  async function readPage(slug, action, args, ctx) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'gmaps-page-read-primitive-unavailable');
    }
    return ctx.executeBoundPageRead({
      origin: ORIGIN,
      namespace: 'gmaps',
      action: action,
      args: args || {}
    }, ctx.tabId);
  }

  async function currentView(slug, ctx) {
    var out = await readPage(slug, 'get_current_view', {}, ctx);
    if (!out || out.success !== true || !out.data || !out.data.view) {
      return { error: out && out.success === false ? out : fallback(slug, 'gmaps-current-view-unavailable') };
    }
    return { view: out.data.view };
  }

  function parsePlaceIds(rawText) {
    var source = str(rawText).replace(/^\)\]\}'\n/, '');
    try {
      var data = JSON.parse(source);
      var full = JSON.stringify(data);
      var matches = full.match(/0x[0-9a-f]+:0x[0-9a-f]+/g);
      return matches ? Array.from(new Set(matches)) : [];
    } catch (e) {
      return [];
    }
  }

  function mapPlaceSearchResult(id, lat, lng) {
    return {
      name: '',
      place_id: str(id),
      address: '',
      rating: 0,
      review_count: 0,
      type: '',
      lat: finiteNumber(lat, 0),
      lng: finiteNumber(lng, 0),
      open_now: '',
      price_level: ''
    };
  }

  function extractState(text) {
    var match = str(text).match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[[\s\S]*?\]);\s*(?:window|var|<\/script>)/);
    if (!match || !match[1]) { return null; }
    try { return JSON.parse(match[1]); } catch (e) { return null; }
  }

  function extractEmbeddedData(state) {
    var inner = state && state[3];
    if (!Array.isArray(inner)) { return null; }
    for (var i = 0; i < inner.length; i++) {
      if (typeof inner[i] === 'string' && inner[i].length > 100) {
        try { return JSON.parse(inner[i].replace(/^\)\]\}'\n/, '')); } catch (e) { /* try next */ }
      }
    }
    return null;
  }

  function mapPlaceDetail(raw) {
    raw = raw || {};
    return {
      name: str(raw.name),
      place_id: str(raw.place_id),
      address: str(raw.address),
      lat: finiteNumber(raw.lat, 0),
      lng: finiteNumber(raw.lng, 0),
      rating: finiteNumber(raw.rating, 0),
      review_count: finiteNumber(raw.review_count, 0),
      phone: str(raw.phone),
      website: str(raw.website),
      type: str(raw.type),
      price_level: str(raw.price_level),
      hours: list(raw.hours).map(str),
      url: str(raw.url)
    };
  }

  function extractPlaceFromState(state, query, url) {
    var data = extractEmbeddedData(state);
    if (!data) { return { name: query, url: url }; }
    var first = data[0];
    if (!Array.isArray(first) || first.length < 2) { return { name: query, url: url }; }

    var out = {
      name: typeof first[1] === 'string' ? first[1] : query,
      place_id: typeof first[0] === 'string' ? first[0] : '',
      lat: 0,
      lng: 0,
      url: url
    };
    var viewport = first[2];
    if (Array.isArray(viewport) && Array.isArray(viewport[0]) && viewport[0].length >= 3) {
      if (typeof viewport[0][2] === 'number') { out.lat = viewport[0][2]; }
      if (typeof viewport[0][1] === 'number') { out.lng = viewport[0][1]; }
    }
    var coords = first[3];
    if (Array.isArray(coords) && coords.length >= 4) {
      if (typeof coords[2] === 'number' && typeof coords[3] === 'number') {
        out.lat = coords[2];
        out.lng = coords[3];
      }
    }
    return out;
  }

  async function handleSearchPlaces(args, ctx) {
    var slug = 'gmaps.search_places';
    args = args || {};
    var lat = args.lat;
    var lng = args.lng;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      var view = await currentView(slug, ctx);
      if (view.view) {
        lat = view.view.lat;
        lng = view.view.lng;
      }
    }
    lat = finiteNumber(lat, 37.7749);
    lng = finiteNumber(lng, -122.4194);
    var radius = intValue(args.radius, 5000);
    var maxResults = intValue(args.max_results, 10, 1, 20);
    var params = [
      ['tbm', 'map'],
      ['authuser', '0'],
      ['hl', 'en'],
      ['gl', 'us'],
      ['q', args.query || '']
    ];
    var pb = '!4m8!1m3!1d' + radius + '!2d' + lng + '!3d' + lat + '!3m2!1i1024!2i768!4f13.1!7i' + maxResults;
    params.push(['pb', pb]);
    var query = params.map(function(pair) {
      return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(str(pair[1]));
    }).join('&');
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'gmaps-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(htmlSpec(ORIGIN + '/search?' + query), ctx.tabId);
    if (resultFailed(result)) { return fallback(slug, 'gmaps-search-places-request-failed'); }
    var ids = parsePlaceIds(resultText(result)).slice(0, maxResults);
    return ok({
      places: ids.map(function(id) { return mapPlaceSearchResult(id, lat, lng); }),
      query: str(args.query)
    }, result.status);
  }

  async function handlePlaceDetails(args, ctx) {
    var slug = 'gmaps.get_place_details';
    args = args || {};
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'gmaps-execute-bound-spec-unavailable');
    }
    var path = buildPlacePath(args.query || '');
    var result = await ctx.executeBoundSpec(htmlSpec(ORIGIN + path + '?authuser=0&hl=en&gl=us&entry=ttu'), ctx.tabId);
    if (resultFailed(result)) { return fallback(slug, 'gmaps-place-details-request-failed'); }
    var state = extractState(resultText(result));
    if (!state) { return fallback(slug, 'gmaps-place-state-missing'); }
    return ok({
      place: mapPlaceDetail(extractPlaceFromState(state, args.query || '', ORIGIN + path))
    }, result.status);
  }

  function directRead(params, fn) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args) {
        return ok(fn(args || {}));
      }
    };
  }

  function pageRead(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return readPage(slug, action, args || {}, ctx);
      }
    };
  }

  function readHandler(params, fn) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      handle: fn
    };
  }

  function guarded(slug, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, 'unverified-gmaps-set-travel-mode-mutation');
      }
    };
  }

  var handlers = {
    'gmaps.get_current_view': pageRead('gmaps.get_current_view', EMPTY_PARAMS, 'get_current_view'),
    'gmaps.get_directions_info': pageRead('gmaps.get_directions_info', EMPTY_PARAMS, 'get_directions_info'),
    'gmaps.get_directions_url': directRead(DIRECTIONS_PARAMS, function(args) {
      return { url: ORIGIN + buildDirectionsPath(args.origin, args.destination, args.travel_mode) };
    }),
    'gmaps.get_map_url': directRead(MAP_URL_PARAMS, function(args) {
      return { url: buildMapUrl(args) };
    }),
    'gmaps.get_place_details': readHandler(QUERY_PARAMS, handlePlaceDetails),
    'gmaps.get_place_url': directRead(QUERY_PARAMS, function(args) {
      return { url: ORIGIN + buildPlacePath(args.query) };
    }),
    'gmaps.navigate_to_directions': directRead(DIRECTIONS_PARAMS, function(args) {
      return { url: ORIGIN + buildDirectionsPath(args.origin, args.destination, args.travel_mode), success: true, navigated: false };
    }),
    'gmaps.navigate_to_location': directRead(LOCATION_PARAMS, function(args) {
      return { url: ORIGIN + buildLocationPath(args.lat, args.lng, args.zoom), success: true, navigated: false };
    }),
    'gmaps.navigate_to_place': directRead(QUERY_PARAMS, function(args) {
      return { url: ORIGIN + buildPlacePath(args.query), success: true, navigated: false };
    }),
    'gmaps.navigate_to_search': pageRead('gmaps.navigate_to_search', SEARCH_PARAMS, 'navigate_to_search'),
    'gmaps.search_nearby': pageRead('gmaps.search_nearby', NEARBY_PARAMS, 'search_nearby'),
    'gmaps.search_places': readHandler(SEARCH_PLACES_PARAMS, handleSearchPlaces),
    'gmaps.set_travel_mode': guarded('gmaps.set_travel_mode', TRAVEL_MODE_PARAMS),
    'gmaps.share_location': pageRead('gmaps.share_location', OPTIONAL_LOCATION_PARAMS, 'share_location'),
    'gmaps.toggle_layer': pageRead('gmaps.toggle_layer', LAYER_PARAMS, 'toggle_layer'),
    'gmaps.zoom_map': pageRead('gmaps.zoom_map', ZOOM_PARAMS, 'zoom_map')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ORIGIN,
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

  global.FsbHandlerGmaps = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
