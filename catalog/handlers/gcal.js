(function (global) {
  'use strict';

  /**
   * Google Calendar gapi-bridge READ head.
   *
   * Calendar reads execute through the existing bounded MAIN-world page-read
   * primitive so the page-owned gapi client performs the request. Mutation-capable
   * Calendar rows stay guarded fail-closed until live mutation-body UAT records the
   * exact request shape and consent/redaction evidence.
   */

  var ORIGIN = 'https://calendar.google.com';
  var SERVICE = 'calendar.google.com';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var STRING_ID = { type: 'string', minLength: 1 };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var CALENDAR_ID_PARAMS = schema({
    calendar_id: STRING_ID
  }, ['calendar_id']);
  var EVENT_ID_PARAMS = schema({
    calendar_id: STRING,
    event_id: STRING_ID
  }, ['event_id']);
  var SETTING_ID_PARAMS = schema({
    setting_id: STRING_ID
  }, ['setting_id']);
  var LIST_CALENDARS_PARAMS = schema({
    show_hidden: BOOLEAN,
    show_deleted: BOOLEAN
  }, []);
  var LIST_EVENTS_PARAMS = schema({
    calendar_id: STRING,
    time_min: STRING,
    time_max: STRING,
    q: STRING,
    max_results: integer(1, 2500),
    page_token: STRING,
    single_events: BOOLEAN,
    order_by: { type: 'string', enum: ['startTime', 'updated'] },
    show_deleted: BOOLEAN
  }, []);
  var LIST_INSTANCES_PARAMS = schema({
    calendar_id: STRING,
    event_id: STRING_ID,
    time_min: STRING,
    time_max: STRING,
    max_results: integer(1, 2500),
    page_token: STRING
  }, ['event_id']);
  var SEARCH_EVENTS_PARAMS = schema({
    q: STRING_ID,
    time_min: STRING,
    time_max: STRING,
    max_results_per_calendar: integer(1, 250)
  }, ['q']);
  var CREATE_CALENDAR_PARAMS = schema({
    summary: STRING_ID,
    description: STRING,
    location: STRING,
    time_zone: STRING
  }, ['summary']);
  var CREATE_EVENT_PARAMS = schema({
    calendar_id: STRING,
    summary: STRING_ID,
    description: STRING,
    location: STRING,
    start_datetime: STRING,
    start_date: STRING,
    end_datetime: STRING,
    end_date: STRING,
    time_zone: STRING,
    attendees: stringArray(),
    recurrence: stringArray(),
    reminders: {
      type: 'array',
      items: schema({
        method: { type: 'string', enum: ['email', 'popup'] },
        minutes: integer(0, INT_LIMIT)
      }, ['method', 'minutes'])
    },
    color_id: STRING,
    visibility: { type: 'string', enum: ['default', 'public', 'private', 'confidential'] },
    transparency: { type: 'string', enum: ['opaque', 'transparent'] },
    send_updates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }
  }, ['summary']);
  var DELETE_CALENDAR_PARAMS = schema({
    calendar_id: STRING_ID
  }, ['calendar_id']);
  var DELETE_EVENT_PARAMS = schema({
    calendar_id: STRING,
    event_id: STRING_ID,
    send_updates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }
  }, ['event_id']);
  var MOVE_EVENT_PARAMS = schema({
    calendar_id: STRING,
    event_id: STRING_ID,
    destination: STRING_ID
  }, ['event_id', 'destination']);
  var FREEBUSY_PARAMS = schema({
    time_min: STRING_ID,
    time_max: STRING_ID,
    calendar_ids: stringArray(),
    time_zone: STRING
  }, ['time_min', 'time_max']);
  var QUICK_ADD_PARAMS = schema({
    calendar_id: STRING,
    text: STRING_ID,
    send_updates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }
  }, ['text']);
  var UPDATE_CALENDAR_PARAMS = schema({
    calendar_id: STRING_ID,
    summary: STRING,
    description: STRING,
    location: STRING,
    time_zone: STRING
  }, ['calendar_id']);
  var UPDATE_EVENT_PARAMS = schema({
    calendar_id: STRING,
    event_id: STRING_ID,
    summary: STRING,
    description: STRING,
    location: STRING,
    start_datetime: STRING,
    start_date: STRING,
    end_datetime: STRING,
    end_date: STRING,
    time_zone: STRING,
    attendees: stringArray(),
    color_id: STRING,
    visibility: { type: 'string', enum: ['default', 'public', 'private', 'confidential'] },
    transparency: { type: 'string', enum: ['opaque', 'transparent'] },
    send_updates: { type: 'string', enum: ['all', 'externalOnly', 'none'] }
  }, ['event_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integer(min, max) {
    return {
      type: 'integer',
      minimum: min,
      maximum: max === undefined ? INT_LIMIT : max
    };
  }

  function stringArray() {
    return {
      type: 'array',
      items: { type: 'string' }
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
      reason: reason || 'gcal-gapi-bridge-unavailable',
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'gcal-page-read-primitive-unavailable');
        }
        var out = await ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'gcal',
          action: action,
          args: args || {}
        }, ctx.tabId);
        return out || fallback(slug, 'gcal-page-read-no-result');
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
        return fallback(slug, reason || 'gcal-mutation-uat-required');
      }
    };
  }

  var handlers = {
    'gcal.get_calendar': readHandler('gcal.get_calendar', CALENDAR_ID_PARAMS, 'get_calendar'),
    'gcal.get_colors': readHandler('gcal.get_colors', EMPTY_PARAMS, 'get_colors'),
    'gcal.get_event': readHandler('gcal.get_event', EVENT_ID_PARAMS, 'get_event'),
    'gcal.get_setting': readHandler('gcal.get_setting', SETTING_ID_PARAMS, 'get_setting'),
    'gcal.list_calendars': readHandler('gcal.list_calendars', LIST_CALENDARS_PARAMS, 'list_calendars'),
    'gcal.list_event_instances': readHandler('gcal.list_event_instances', LIST_INSTANCES_PARAMS, 'list_event_instances'),
    'gcal.list_events': readHandler('gcal.list_events', LIST_EVENTS_PARAMS, 'list_events'),
    'gcal.list_settings': readHandler('gcal.list_settings', EMPTY_PARAMS, 'list_settings'),
    'gcal.search_events': readHandler('gcal.search_events', SEARCH_EVENTS_PARAMS, 'search_events'),

    'gcal.create_calendar': guarded('gcal.create_calendar', 'write', CREATE_CALENDAR_PARAMS),
    'gcal.create_event': guarded('gcal.create_event', 'write', CREATE_EVENT_PARAMS),
    'gcal.delete_calendar': guarded('gcal.delete_calendar', 'destructive', DELETE_CALENDAR_PARAMS),
    'gcal.delete_event': guarded('gcal.delete_event', 'destructive', DELETE_EVENT_PARAMS),
    'gcal.move_event': guarded('gcal.move_event', 'write', MOVE_EVENT_PARAMS),
    'gcal.query_freebusy': guarded('gcal.query_freebusy', 'write', FREEBUSY_PARAMS, 'gcal-freebusy-post-uat-required'),
    'gcal.quick_add_event': guarded('gcal.quick_add_event', 'write', QUICK_ADD_PARAMS),
    'gcal.update_calendar': guarded('gcal.update_calendar', 'write', UPDATE_CALENDAR_PARAMS),
    'gcal.update_event': guarded('gcal.update_event', 'write', UPDATE_EVENT_PARAMS)
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

  global.FsbHandlerGcal = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
