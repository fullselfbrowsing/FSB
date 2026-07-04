(function (global) {
  'use strict';

  /**
   * ClickHouse Cloud same-origin read head.
   *
   * ClickHouse's console keeps auth and org/service cache state inside the
   * page. This handler stays network-free and storage-free; reviewed read
   * actions route through the bounded MAIN-world page-read primitive.
   */

  var ORIGIN = 'https://console.clickhouse.cloud';
  var SERVICE = 'console.clickhouse.cloud';

  var EMPTY_PARAMS = schema({}, []);
  var SERVICE_ID_PARAMS = schema({
    service_id: { type: 'string', description: 'Service UUID' }
  }, ['service_id']);
  var SCALING_LIMITS_PARAMS = schema({
    region: { type: 'string', description: 'Cloud region ID (e.g., "gcp-us-east1", "aws-us-east-1")' }
  }, ['region']);
  var QUERY_METRICS_PARAMS = schema({
    service_id: { type: 'string', description: 'Service UUID' },
    metric_type: {
      type: 'string',
      enum: ['ALLOCATED_MEMORY', 'CPU_USAGE', 'MEMORY_USAGE', 'QUERIES_PER_SECOND'],
      description: 'Metric type to query'
    },
    time_period: {
      type: 'string',
      enum: ['LAST_HOUR', 'LAST_DAY', 'LAST_WEEK', 'LAST_MONTH'],
      description: 'Time period (default LAST_HOUR)'
    }
  }, ['service_id', 'metric_type']);

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
      reason: reason,
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
          return fallback(slug, 'clickhouse-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'clickhouse',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  var handlers = {
    'clickhouse.get_organization': readHandler('clickhouse.get_organization', EMPTY_PARAMS, 'get_organization'),
    'clickhouse.get_private_endpoint_config': readHandler('clickhouse.get_private_endpoint_config', SERVICE_ID_PARAMS, 'get_private_endpoint_config'),
    'clickhouse.get_scaling_limits': readHandler('clickhouse.get_scaling_limits', SCALING_LIMITS_PARAMS, 'get_scaling_limits'),
    'clickhouse.get_service': readHandler('clickhouse.get_service', SERVICE_ID_PARAMS, 'get_service'),
    'clickhouse.get_status': readHandler('clickhouse.get_status', EMPTY_PARAMS, 'get_status'),
    'clickhouse.list_backups': readHandler('clickhouse.list_backups', SERVICE_ID_PARAMS, 'list_backups'),
    'clickhouse.list_organization_members': readHandler('clickhouse.list_organization_members', EMPTY_PARAMS, 'list_organization_members'),
    'clickhouse.list_services': readHandler('clickhouse.list_services', EMPTY_PARAMS, 'list_services'),
    'clickhouse.query_metrics': readHandler('clickhouse.query_metrics', QUERY_METRICS_PARAMS, 'query_metrics')
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

  global.FsbHandlerClickhouse = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
