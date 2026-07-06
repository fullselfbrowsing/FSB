(function (global) {
  'use strict';

  /**
   * Google Analytics GAPI page-bridge READ head.
   *
   * Google Analytics exposes GA4 account and reporting reads through page-owned
   * gapi.client state on analytics.google.com. This handler never reads cookies,
   * storage, credentials, or page globals itself; it delegates to the bounded MAIN-world
   * page-read primitive, which keeps GAPI auth state inside the active page.
   */

  var ORIGIN = 'https://analytics.google.com';
  var SERVICE = 'analytics.google.com';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({}, []);
  var PROPERTY_PARAMS = schema({
    property_id: stringField('GA4 property ID (numeric string)')
  }, ['property_id']);
  var COMPATIBILITY_PARAMS = schema({
    property_id: stringField('GA4 property ID (numeric string)'),
    dimensions: stringArrayField('Dimensions already selected'),
    metrics: stringArrayField('Metrics already selected')
  }, ['property_id']);
  var REPORT_PARAMS = schema({
    property_id: stringField('GA4 property ID (numeric string)'),
    dimensions: stringArrayField('Dimension API names to include'),
    metrics: stringArrayField('Metric API names to include'),
    start_date: stringField('Start date'),
    end_date: stringField('End date'),
    dimension_filter: stringField('JSON string dimension filter'),
    metric_filter: stringField('JSON string metric filter'),
    order_by: stringField('JSON string orderBys array'),
    limit: integerField('Max rows to return', 1, 10000),
    offset: integerField('Row offset for pagination', 0, 9007199254740991)
  }, ['property_id', 'metrics', 'start_date', 'end_date']);
  var REALTIME_PARAMS = schema({
    property_id: stringField('GA4 property ID (numeric string)'),
    dimensions: stringArrayField('Realtime dimension API names'),
    metrics: stringArrayField('Realtime metric API names'),
    dimension_filter: stringField('JSON string dimension filter'),
    metric_filter: stringField('JSON string metric filter'),
    limit: integerField('Max rows to return', 1, 10000)
  }, ['property_id', 'metrics']);
  var BATCH_PARAMS = schema({
    property_id: stringField('GA4 property ID (numeric string)'),
    reports: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      description: 'Array of report requests',
      items: schema({
        dimensions: stringArrayField('Dimension API names'),
        metrics: stringArrayField('Metric API names'),
        start_date: stringField('Start date'),
        end_date: stringField('End date'),
        limit: integerField('Max rows per report', 1, 10000)
      }, ['metrics', 'start_date', 'end_date'])
    }
  }, ['property_id', 'reports']);

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
    return { type: 'string', description: description };
  }

  function stringArrayField(description) {
    return { type: 'array', items: { type: 'string' }, description: description };
  }

  function integerField(description, minimum, maximum) {
    var out = { type: 'integer', description: description };
    if (minimum !== undefined) { out.minimum = minimum; }
    if (maximum !== undefined) { out.maximum = maximum; }
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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'ganalytics-page-bridge-unavailable',
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
          return fallback(slug, 'ganalytics-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'ganalytics',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  var handlers = {
    'ganalytics.check_compatibility': readHandler('ganalytics.check_compatibility', COMPATIBILITY_PARAMS, 'check_compatibility'),
    'ganalytics.get_active_property': readHandler('ganalytics.get_active_property', EMPTY_PARAMS, 'get_active_property'),
    'ganalytics.get_current_user': readHandler('ganalytics.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'ganalytics.get_metadata': readHandler('ganalytics.get_metadata', PROPERTY_PARAMS, 'get_metadata'),
    'ganalytics.list_accounts': readHandler('ganalytics.list_accounts', EMPTY_PARAMS, 'list_accounts'),
    'ganalytics.run_batch_report': readHandler('ganalytics.run_batch_report', BATCH_PARAMS, 'run_batch_report'),
    'ganalytics.run_realtime_report': readHandler('ganalytics.run_realtime_report', REALTIME_PARAMS, 'run_realtime_report'),
    'ganalytics.run_report': readHandler('ganalytics.run_report', REPORT_PARAMS, 'run_report')
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

  global.FsbHandlerGanalytics = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
