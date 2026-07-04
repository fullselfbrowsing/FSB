(function (global) {
  'use strict';

  /**
   * Eventbrite same-origin API READ head with guarded paid-registration write.
   *
   * Ports the reviewed Eventbrite GET rows from the preserved OpenTabs slice to
   * T1a. Registering for an event can charge a saved payment method, so that row
   * remains guarded fail-closed until live mutation-body UAT records the exact
   * request shape.
   */

  var ORIGIN = 'https://www.eventbrite.com';
  var SERVICE = 'www.eventbrite.com';
  var API_BASE = ORIGIN + '/v3';
  var INT_LIMIT = 9007199254740991;

  var SEARCH_PARAMS = schema({
    keyword: { type: 'string', minLength: 1, description: 'Event, organizer, or topic to search for' },
    city: { type: 'string', description: 'City to filter events by' },
    start_date: { type: 'string', description: 'Earliest event date (YYYY-MM-DD)' },
    end_date: { type: 'string', description: 'Latest event date (YYYY-MM-DD)' }
  }, ['keyword']);

  var EVENT_PARAMS = schema({
    event_id: { type: 'string', minLength: 1, description: 'The event ID to fetch' }
  }, ['event_id']);

  var ORDERS_PARAMS = schema({
    status: { type: 'string', enum: ['upcoming', 'past', 'cancelled'], description: 'Filter orders by status' },
    limit: integerSchema('Maximum number of orders to return', 1, 50)
  }, []);

  var REGISTER_PARAMS = schema({
    event_id: { type: 'string', minLength: 1, description: 'The event to register for' },
    ticket_type_id: { type: 'string', minLength: 1, description: 'The ticket type to purchase' },
    quantity: integerSchema('Number of tickets to register', 1, INT_LIMIT)
  }, ['event_id', 'ticket_type_id', 'quantity']);

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
      reason: reason || 'eventbrite-api-shape-mismatch',
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

  function apiSpec(path, pairs) {
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

  function responseData(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'eventbrite-api-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return { error: fallback(slug, 'eventbrite-api-http-error') };
    }
    if (result.data === undefined || result.data === null) {
      return { error: fallback(slug, 'eventbrite-api-empty') };
    }
    return { data: result.data };
  }

  function compactImage(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      id: str(raw.id),
      url: str(raw.url),
      width: num(raw.width),
      height: num(raw.height)
    };
  }

  function namedText(value) {
    if (typeof value === 'string') { return value; }
    if (isObject(value)) {
      return str(value.text || value.html || value.name || value.display_name);
    }
    return '';
  }

  function mapVenue(raw) {
    raw = isObject(raw) ? raw : {};
    var address = isObject(raw.address) ? raw.address : {};
    return {
      id: str(raw.id),
      name: str(raw.name),
      address_1: str(address.address_1),
      address_2: str(address.address_2),
      city: str(address.city),
      region: str(address.region),
      postal_code: str(address.postal_code),
      country: str(address.country),
      latitude: str(address.latitude),
      longitude: str(address.longitude)
    };
  }

  function mapOrganizer(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      id: str(raw.id),
      name: str(raw.name),
      description: namedText(raw.description),
      url: str(raw.url),
      logo_url: raw.logo && raw.logo.url ? str(raw.logo.url) : ''
    };
  }

  function mapTicketClass(raw) {
    raw = isObject(raw) ? raw : {};
    var cost = isObject(raw.cost) ? raw.cost : {};
    return {
      id: str(raw.id),
      name: str(raw.name),
      description: namedText(raw.description),
      free: raw.free === true,
      minimum_quantity: num(raw.minimum_quantity),
      maximum_quantity: num(raw.maximum_quantity),
      quantity_total: num(raw.quantity_total),
      quantity_sold: num(raw.quantity_sold),
      sales_start: str(raw.sales_start),
      sales_end: str(raw.sales_end),
      cost_display: str(cost.display),
      cost_value: num(cost.value),
      currency: str(cost.currency)
    };
  }

  function mapEvent(raw) {
    raw = isObject(raw) ? raw : {};
    var start = isObject(raw.start) ? raw.start : {};
    var end = isObject(raw.end) ? raw.end : {};
    var logo = isObject(raw.logo) ? raw.logo : {};
    return {
      id: str(raw.id),
      name: namedText(raw.name),
      description: namedText(raw.description),
      summary: str(raw.summary),
      url: str(raw.url),
      status: str(raw.status),
      currency: str(raw.currency),
      online_event: raw.online_event === true,
      listed: raw.listed === true,
      start_utc: str(start.utc),
      start_local: str(start.local),
      start_timezone: str(start.timezone),
      end_utc: str(end.utc),
      end_local: str(end.local),
      end_timezone: str(end.timezone),
      logo: compactImage(logo),
      venue: mapVenue(raw.venue),
      organizer: mapOrganizer(raw.organizer),
      ticket_classes: list(raw.ticket_classes).map(mapTicketClass)
    };
  }

  function mapOrder(raw) {
    raw = isObject(raw) ? raw : {};
    var costs = isObject(raw.costs) ? raw.costs : {};
    return {
      id: str(raw.id),
      status: str(raw.status),
      event_id: str(raw.event_id || (raw.event && raw.event.id)),
      event_name: namedText(raw.event && raw.event.name),
      created: str(raw.created),
      changed: str(raw.changed),
      email: str(raw.email),
      first_name: str(raw.first_name),
      last_name: str(raw.last_name),
      quantity: num(raw.quantity),
      total_display: str(costs.gross && costs.gross.display),
      total_value: num(costs.gross && costs.gross.value),
      currency: str(costs.gross && costs.gross.currency)
    };
  }

  function mapPagination(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      object_count: num(raw.object_count),
      page_number: num(raw.page_number),
      page_size: num(raw.page_size),
      page_count: num(raw.page_count),
      has_more_items: raw.has_more_items === true,
      continuation: str(raw.continuation)
    };
  }

  async function callApi(slug, spec, ctx, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'eventbrite-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    var guarded = responseData(res, slug);
    if (guarded.error) { return guarded.error; }
    try {
      var mapped = mapper(guarded.data);
      if (!mapped) { return fallback(slug, 'eventbrite-api-shape-mismatch'); }
      return { success: true, data: mapped };
    } catch (_err) {
      return fallback(slug, 'eventbrite-api-shape-mismatch');
    }
  }

  function readHandler(slug, params, specForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var spec = specForArgs(args || {});
        if (!spec) { return fallback(slug, 'eventbrite-required-input-missing'); }
        return callApi(slug, spec, ctx, mapper);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'eventbrite.search_events': readHandler(
      'eventbrite.search_events',
      SEARCH_PARAMS,
      function (args) {
        return apiSpec('/events/search/', [
          ['q', args.keyword],
          ['location.address', args.city],
          ['start_date.range_start', args.start_date],
          ['start_date.range_end', args.end_date],
          ['expand', 'venue,organizer,ticket_classes']
        ]);
      },
      function (data) {
        if (!isObject(data) || !Array.isArray(data.events)) { return null; }
        return { events: data.events.map(mapEvent), pagination: mapPagination(data.pagination) };
      }
    ),
    'eventbrite.get_event': readHandler(
      'eventbrite.get_event',
      EVENT_PARAMS,
      function (args) {
        if (!str(args.event_id)) { return null; }
        return apiSpec('/events/' + encodeURIComponent(str(args.event_id)) + '/', [
          ['expand', 'venue,organizer,ticket_classes']
        ]);
      },
      function (data) {
        var event = isObject(data.event) ? data.event : data;
        if (!isObject(event) || !str(event.id)) { return null; }
        return { event: mapEvent(event) };
      }
    ),
    'eventbrite.list_orders': readHandler(
      'eventbrite.list_orders',
      ORDERS_PARAMS,
      function (args) {
        return apiSpec('/users/me/orders/', [
          ['status', args.status],
          ['page_size', args.limit],
          ['expand', 'event']
        ]);
      },
      function (data) {
        if (!isObject(data) || !Array.isArray(data.orders)) { return null; }
        return { orders: data.orders.map(mapOrder), pagination: mapPagination(data.pagination) };
      }
    ),
    'eventbrite.register_for_event': guarded(
      'eventbrite.register_for_event',
      'write',
      REGISTER_PARAMS,
      'unverified-eventbrite-register-for-event-payment-mutation'
    )
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

  global.FsbHandlerEventbrite = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
