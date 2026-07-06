(function (global) {
  'use strict';

  /**
   * Calendly same-origin internal API READ head.
   *
   * Calendly's web app uses first-party calendly.com session cookies plus a
   * page-embedded CSRF meta tag. This handler obtains the CSRF value only through
   * a bounded same-origin bootstrap read, then executes reviewed read-only /api
   * requests. Event-type mutations stay guarded fail-closed until live
   * mutation-body UAT exists.
   */

  var ORIGIN = 'https://calendly.com';
  var SERVICE = 'calendly.com';
  var API_BASE = ORIGIN + '/api';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var EVENT_TYPE_ID_PARAMS = schema({ event_type_id: integerSchema('Event type numeric ID') }, ['event_type_id']);
  var LIST_EVENT_TYPES_PARAMS = schema({ page: integerSchema('Page number', 1) }, []);
  var LIST_EVENTS_PARAMS = schema({
    status: { type: 'string', enum: ['active', 'upcoming', 'past', 'canceled', 'completed', 'pending'] },
    page: integerSchema('Page number', 1)
  }, []);
  var BUSY_TIMES_PARAMS = schema({
    start_time: { type: 'string', description: 'Start of the time range in ISO 8601 format' },
    end_time: { type: 'string', description: 'End of the time range in ISO 8601 format' }
  }, ['start_time', 'end_time']);
  var CREATE_EVENT_TYPE_PARAMS = schema({
    name: STRING,
    slug: STRING,
    duration: integerSchema('Duration in minutes', 1),
    description: STRING,
    color: STRING
  }, ['name', 'slug']);
  var UPDATE_EVENT_TYPE_PARAMS = schema({
    event_type_id: integerSchema('Event type numeric ID to update'),
    name: STRING,
    slug: STRING,
    duration: integerSchema('Duration in minutes', 1),
    description: STRING,
    color: STRING
  }, ['event_type_id']);

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
      reason: reason || 'calendly-auth-or-shape-mismatch',
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

  function bool(value) {
    return value === true;
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function buildQuery(query) {
    var parts = [];
    for (var key in (query || {})) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) { continue; }
      var value = query[key];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function parseCsrf(html) {
    var text = String(html || '');
    var match = text.match(/<meta\s+[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      || text.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["'][^>]*>/i);
    return match && match[1] ? match[1] : '';
  }

  function bootstrapSpec() {
    return {
      url: ORIGIN + '/',
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: null
    };
  }

  function apiSpec(endpoint, query, csrf) {
    return {
      url: API_BASE + endpoint + buildQuery(query || {}),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': csrf,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  async function bootstrap(slug, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'calendly-execute-bound-spec-unavailable') };
    }
    var res = await ctx.executeBoundSpec(bootstrapSpec(), ctx.tabId);
    if (!res || res.success !== true || typeof res.text !== 'string') {
      return { error: fallback(slug, 'calendly-bootstrap-page-unavailable') };
    }
    var csrf = parseCsrf(res.text);
    if (!csrf) {
      return { error: fallback(slug, 'calendly-bootstrap-csrf-missing') };
    }
    return { csrf: csrf };
  }

  function guardData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'calendly-api-read-failed');
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'calendly-redirect-or-http-error');
    }
    var data = result.data;
    if (data && isObject(data) && (data.error || data.errors)) {
      return fallback(slug, 'calendly-api-error-shape');
    }
    return result;
  }

  async function readApi(slug, endpoint, query, mapper, ctx) {
    var auth = await bootstrap(slug, ctx);
    if (auth.error) { return auth.error; }
    var res = await ctx.executeBoundSpec(apiSpec(endpoint, query, auth.csrf), ctx.tabId);
    var guarded = guardData(res, slug);
    if (!guarded || guarded.success !== true) { return guarded; }
    try {
      var mapped = mapper(guarded.data);
      if (!mapped) { return fallback(slug, 'calendly-api-shape-mismatch'); }
      return { success: true, status: guarded.status, finalUrl: guarded.finalUrl, redirected: guarded.redirected, data: mapped };
    } catch (_err) {
      return fallback(slug, 'calendly-api-shape-mismatch');
    }
  }

  function mapUser(u) {
    u = isObject(u) ? u : {};
    return {
      id: num(u.id),
      uuid: str(u.uuid),
      name: str(u.name),
      email: str(u.email),
      booking_url: str(u.booking_url),
      avatar_url: str(u.avatar_url),
      timezone: str(u.timezone),
      locale: str(u.locale),
      country_code: str(u.country_code),
      created_at: str(u.created_at),
      date_notation: str(u.date_notation),
      time_notation: str(u.time_notation),
      events_count: num(u.events_count),
      is_branded: bool(u.is_branded)
    };
  }

  function mapOrganization(o) {
    o = isObject(o) ? o : {};
    var owner = isObject(o.owner) ? o.owner : {};
    return {
      id: num(o.id),
      name: str(o.name),
      kind: str(o.kind),
      stage: str(o.stage),
      tier: str(o.tier),
      is_trial: bool(o.is_trial),
      created_at: str(o.created_at),
      uri: str(o.uri),
      owner_name: str(owner.name),
      owner_email: str(owner.email)
    };
  }

  function mapStatistics(s) {
    s = isObject(s) ? s : {};
    return {
      available_seats: num(s.available_seats),
      users: num(s.users),
      invitations: num(s.invitations),
      occupancy_ratio: str(s.occupancy_ratio),
      occupancy_capacity: num(s.occupancy_capacity)
    };
  }

  function mapLocationConfig(l) {
    l = isObject(l) ? l : {};
    return {
      id: num(l.id),
      kind: str(l.kind),
      position: num(l.position),
      location: str(l.location)
    };
  }

  function mapCustomField(f) {
    f = isObject(f) ? f : {};
    return {
      id: num(f.id),
      name: str(f.name),
      format: str(f.format),
      required: bool(f.required),
      enabled: bool(f.enabled),
      position: num(f.position)
    };
  }

  function mapEventType(et) {
    et = isObject(et) ? et : {};
    var profile = isObject(et.profile) ? et.profile : {};
    return {
      id: num(et.id),
      uuid: str(et.uuid),
      name: str(et.name),
      slug: str(et.slug),
      description: str(et.description),
      duration_minutes: num(et.duration_minutes || et.duration),
      kind: str(et.kind),
      type: str(et.type),
      color: str(et.color),
      active: bool(et.active),
      public: bool(et.public),
      booking_url: str(et.booking_url),
      location_configurations: list(et.location_configurations).map(mapLocationConfig),
      custom_fields: list(et.custom_fields).map(mapCustomField),
      invitees_limit: num(et.invitees_limit || 1),
      owner_name: str(et.owning_user_name || profile.name)
    };
  }

  function mapScheduledEvent(e) {
    e = isObject(e) ? e : {};
    var externalLocation = isObject(e.external_location) ? e.external_location : {};
    var eventType = isObject(e.event_type) ? e.event_type : {};
    var invitee = isObject(e.invitee) ? e.invitee : {};
    return {
      id: num(e.id),
      uuid: str(e.uuid),
      name: str(e.name),
      cancelled: bool(e.cancelled),
      start_time: str(e.start_time),
      end_time: str(e.end_time),
      location_type: str(e.location_type),
      join_url: str(externalLocation.join_url),
      event_type_name: str(eventType.name),
      event_type_id: num(eventType.id),
      invitee_name: str(invitee.name),
      invitee_email: str(invitee.email),
      scheduled_at: str(e.scheduled_at)
    };
  }

  function mapCalendar(c) {
    c = isObject(c) ? c : {};
    return { id: str(c.id), name: str(c.name), write_access: bool(c.write_access) };
  }

  function mapCalendarAccount(a) {
    a = isObject(a) ? a : {};
    return {
      uuid: str(a.uuid),
      kind: str(a.kind),
      name: str(a.name),
      email: str(a.email),
      pull_enabled: bool(a.pull_enabled),
      push_enabled: bool(a.push_enabled),
      calendars: list(a.calendars).map(mapCalendar)
    };
  }

  function mapBusyTime(b) {
    b = isObject(b) ? b : {};
    return { type: str(b.type), start_time: str(b.start_time), end_time: str(b.end_time) };
  }

  function mapPagination(p) {
    p = isObject(p) ? p : {};
    return {
      total_count: num(p.total_count),
      current_page: num(p.current_page || 1),
      total_pages: num(p.total_pages),
      has_next_page: p.next_page !== undefined && p.next_page !== null
    };
  }

  function mapPermissions(data) {
    data = isObject(data) ? data : {};
    return {
      can_create_shared_event_types: bool(data.can_create_shared_event_types),
      can_create_team: bool(data.can_create_team),
      can_create_workflows: bool(data.can_create_workflows),
      can_list_teams: bool(data.can_list_teams),
      can_manage_ai_notetaker: bool(data.can_manage_ai_notetaker),
      can_manage_domains: bool(data.can_manage_domains),
      can_manage_invitation: bool(data.can_manage_invitation),
      can_manage_invitation_permissions: bool(data.can_manage_invitation_permissions),
      can_manage_organization_event_type_settings: bool(data.can_manage_organization_event_type_settings),
      can_manage_sso: bool(data.can_manage_sso),
      can_manage_user_access: bool(data.can_manage_user_access),
      can_manage_user_provisioning: bool(data.can_manage_user_provisioning),
      can_manage_workflows: bool(data.can_manage_workflows),
      can_use_workflows: bool(data.can_use_workflows)
    };
  }

  function flattenEventTypes(data) {
    if (!isObject(data)) { return null; }
    var out = [];
    for (var i = 0; i < list(data.results).length; i++) {
      var group = data.results[i];
      var eventTypes = group && group.event_types;
      for (var j = 0; j < list(eventTypes).length; j++) {
        out.push(mapEventType(eventTypes[j]));
      }
    }
    return { event_types: out, pagination: mapPagination(data.pagination) };
  }

  function flattenScheduledEvents(data) {
    if (!isObject(data)) { return null; }
    var out = [];
    for (var i = 0; i < list(data.results).length; i++) {
      var group = data.results[i];
      var events = group && group.events;
      for (var j = 0; j < list(events).length; j++) {
        out.push(mapScheduledEvent(events[j]));
      }
    }
    return { events: out, pagination: mapPagination(data.pagination) };
  }

  function readHandler(slug, params, endpoint, queryForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var input = args || {};
        return readApi(slug, endpoint(input), queryForArgs ? queryForArgs(input) : {}, mapper, ctx);
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
    'calendly.get_current_user': readHandler('calendly.get_current_user', EMPTY_PARAMS,
      function() { return '/user'; }, null, function(data) { return { user: mapUser(data) }; }),
    'calendly.get_organization': readHandler('calendly.get_organization', EMPTY_PARAMS,
      function() { return '/organization'; }, null, function(data) { return { organization: mapOrganization(data) }; }),
    'calendly.get_organization_statistics': readHandler('calendly.get_organization_statistics', EMPTY_PARAMS,
      function() { return '/organization/statistics'; }, null, function(data) { return { statistics: mapStatistics(data) }; }),
    'calendly.get_user_permissions': readHandler('calendly.get_user_permissions', EMPTY_PARAMS,
      function() { return '/policy'; }, null, function(data) { return { permissions: mapPermissions(data) }; }),
    'calendly.list_calendar_accounts': readHandler('calendly.list_calendar_accounts', EMPTY_PARAMS,
      function() { return '/calendar_accounts'; }, null, function(data) { return { accounts: list(data).map(mapCalendarAccount) }; }),
    'calendly.get_user_busy_times': readHandler('calendly.get_user_busy_times', BUSY_TIMES_PARAMS,
      function() { return '/user_busy_times'; },
      function(args) { return { start_time: args.start_time, end_time: args.end_time }; },
      function(data) { return { busy_times: list(data).map(mapBusyTime) }; }),
    'calendly.list_event_types': readHandler('calendly.list_event_types', LIST_EVENT_TYPES_PARAMS,
      function() { return '/users/me/event_types'; },
      function(args) { return { scope: 'my_calendly', page: args.page }; },
      flattenEventTypes),
    'calendly.get_event_type': readHandler('calendly.get_event_type', EVENT_TYPE_ID_PARAMS,
      function(args) { return '/users/me/event_types/' + encodeURIComponent(String(args.event_type_id || '')); },
      null, function(data) { return { event_type: mapEventType(data) }; }),
    'calendly.list_scheduled_events': readHandler('calendly.list_scheduled_events', LIST_EVENTS_PARAMS,
      function() { return '/scheduled_events/events'; },
      function(args) { return { status: args.status, page: args.page }; },
      flattenScheduledEvents),

    'calendly.activate_event_type': guarded('calendly.activate_event_type', 'write', EVENT_TYPE_ID_PARAMS, 'unverified-calendly-activate-event-type-mutation'),
    'calendly.clone_event_type': guarded('calendly.clone_event_type', 'write', EVENT_TYPE_ID_PARAMS, 'unverified-calendly-clone-event-type-mutation'),
    'calendly.create_event_type': guarded('calendly.create_event_type', 'write', CREATE_EVENT_TYPE_PARAMS, 'unverified-calendly-create-event-type-mutation'),
    'calendly.deactivate_event_type': guarded('calendly.deactivate_event_type', 'write', EVENT_TYPE_ID_PARAMS, 'unverified-calendly-deactivate-event-type-mutation'),
    'calendly.delete_event_type': guarded('calendly.delete_event_type', 'destructive', EVENT_TYPE_ID_PARAMS, 'unverified-calendly-delete-event-type-mutation'),
    'calendly.update_event_type': guarded('calendly.update_event_type', 'write', UPDATE_EVENT_TYPE_PARAMS, 'unverified-calendly-update-event-type-mutation')
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

  global.FsbHandlerCalendly = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
