(function (global) {
  'use strict';

  /**
   * Temporal Cloud same-origin page-read head.
   *
   * Temporal's Cloud UI keeps its Auth0 token in the page. This handler stays
   * network-free and storage-free; reviewed reads route through the bounded
   * MAIN-world page-read primitive.
   */

  var ORIGIN = 'https://cloud.temporal.io';
  var SERVICE = 'cloud.temporal.io';

  var EMPTY_PARAMS = schema({}, []);
  var NAMESPACE_QUERY_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    query: stringField('Temporal visibility query filter')
  }, []);
  var LIST_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    page_size: integerField('Results per page', 1, 200),
    next_page_token: stringField('Pagination token from a previous response')
  }, []);
  var LIST_WORKFLOWS_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    query: stringField('Temporal visibility query filter'),
    page_size: integerField('Results per page', 1, 200),
    next_page_token: stringField('Pagination token from a previous response')
  }, []);
  var WORKFLOW_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    workflow_id: stringField('Workflow ID'),
    run_id: stringField('Run ID')
  }, ['workflow_id']);
  var WORKFLOW_HISTORY_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    workflow_id: stringField('Workflow ID'),
    run_id: stringField('Run ID'),
    page_size: integerField('Max events per page', 1, 1000),
    next_page_token: stringField('Pagination token from a previous response'),
    wait_new_event: { type: 'boolean', description: 'Long-poll for new events' }
  }, ['workflow_id']);
  var SCHEDULE_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    schedule_id: stringField('Schedule ID')
  }, ['schedule_id']);
  var TASK_QUEUE_PARAMS = schema({
    namespace: stringField('Temporal namespace (e.g., "prod-us-west-2.abc123")'),
    task_queue: stringField('Task queue name')
  }, ['task_queue']);

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

  function integerField(description, minimum, maximum) {
    return { type: 'integer', minimum: minimum, maximum: maximum, description: description };
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

  function allowedTemporalOrigin(origin) {
    if (origin === ORIGIN) { return true; }
    try {
      var host = new URL(origin).hostname.toLowerCase();
      return /\.web\.tmprl\.cloud$/.test(host);
    } catch (_err) {
      return false;
    }
  }

  function activeOrigin(ctx) {
    var origin = ctx && typeof ctx.origin === 'string' ? ctx.origin : '';
    if (allowedTemporalOrigin(origin)) { return origin; }
    return ORIGIN;
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'temporal-page-read-primitive-unavailable');
        }
        var origin = activeOrigin(ctx);
        return ctx.executeBoundPageRead({
          origin: origin,
          namespace: 'temporal',
          action: action,
          args: args || {}
        }, ctx.tabId);
      }
    };
  }

  var handlers = {
    'temporal.count_workflows': readHandler('temporal.count_workflows', NAMESPACE_QUERY_PARAMS, 'count_workflows'),
    'temporal.get_schedule': readHandler('temporal.get_schedule', SCHEDULE_PARAMS, 'get_schedule'),
    'temporal.get_settings': readHandler('temporal.get_settings', EMPTY_PARAMS, 'get_settings'),
    'temporal.get_task_queue': readHandler('temporal.get_task_queue', TASK_QUEUE_PARAMS, 'get_task_queue'),
    'temporal.get_workflow': readHandler('temporal.get_workflow', WORKFLOW_PARAMS, 'get_workflow'),
    'temporal.get_workflow_history': readHandler('temporal.get_workflow_history', WORKFLOW_HISTORY_PARAMS, 'get_workflow_history'),
    'temporal.list_schedules': readHandler('temporal.list_schedules', LIST_PARAMS, 'list_schedules'),
    'temporal.list_workflows': readHandler('temporal.list_workflows', LIST_WORKFLOWS_PARAMS, 'list_workflows')
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

  global.FsbHandlerTemporal = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
