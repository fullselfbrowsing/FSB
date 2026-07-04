(function (global) {
  'use strict';

  /**
   * Google Cloud Console page-owned GAPI read head.
   *
   * The Cloud Console exposes authenticated Google API access through
   * window.gapi.client.request in the first-party page. This handler never reads
   * cookies, tokens, storage, or gapi directly. Reviewed read descriptors route
   * through the bounded page-read primitive; write-classified descriptors remain
   * guarded fail-closed until live mutation-body UAT or classifier work promotes
   * them.
   */

  var ORIGIN = 'https://console.cloud.google.com';
  var SERVICE = 'console.cloud.google.com';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var EMPTY_PARAMS = schema({}, []);
  var PROJECT_PARAMS = schema({ project_id: STRING }, []);
  var BUCKET_PARAMS = schema({ bucket_name: STRING }, ['bucket_name']);
  var LOCATION_SERVICE_PARAMS = schema({
    location: STRING,
    service_name: STRING,
    project_id: STRING
  }, ['location', 'service_name']);
  var LOCATION_CLUSTER_PARAMS = schema({
    location: STRING,
    cluster_name: STRING,
    project_id: STRING
  }, ['location', 'cluster_name']);
  var LOCATION_FUNCTION_PARAMS = schema({
    location: STRING,
    function_name: STRING,
    project_id: STRING
  }, ['location', 'function_name']);
  var INSTANCE_PARAMS = schema({
    zone: STRING,
    instance_name: STRING,
    project_id: STRING
  }, ['zone', 'instance_name']);
  var SQL_INSTANCE_PARAMS = schema({
    instance_name: STRING,
    project_id: STRING
  }, ['instance_name']);
  var PAGE_PARAMS = schema({
    page_size: integerSchema('Max results per page', 1, 100),
    page_token: STRING
  }, []);
  var PROJECT_PAGE_PARAMS = schema({
    project_id: STRING,
    page_size: integerSchema('Max results per page', 1, 100),
    page_token: STRING
  }, []);
  var PROJECT_MAX_PARAMS = schema({
    project_id: STRING,
    max_results: integerSchema('Max results', 1, 1000),
    page_token: STRING
  }, []);
  var PROJECT_ZONE_MAX_PARAMS = schema({
    project_id: STRING,
    zone: STRING,
    max_results: integerSchema('Max results', 1, 1000),
    page_token: STRING
  }, []);
  var OBJECTS_PARAMS = schema({
    bucket_name: STRING,
    prefix: STRING,
    delimiter: STRING,
    max_results: integerSchema('Max results', 1, 1000),
    page_token: STRING
  }, ['bucket_name']);
  var ENABLE_SERVICE_PARAMS = schema({
    service_name: STRING,
    project_id: STRING
  }, ['service_name']);
  var LOG_ENTRIES_PARAMS = schema({
    project_id: STRING,
    filter: STRING,
    page_size: integerSchema('Max results per page', 1, 1000),
    page_token: STRING,
    order_by: STRING
  }, []);

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
          return fallback(slug, 'gcloud-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'gcloud',
          action: action,
          args: args || {}
        }, ctx.tabId);
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
    'gcloud.get_billing_info': readHandler('gcloud.get_billing_info', PROJECT_PARAMS, 'get_billing_info'),
    'gcloud.get_bucket': readHandler('gcloud.get_bucket', BUCKET_PARAMS, 'get_bucket'),
    'gcloud.get_cloud_run_service': readHandler('gcloud.get_cloud_run_service', LOCATION_SERVICE_PARAMS, 'get_cloud_run_service'),
    'gcloud.get_cluster': readHandler('gcloud.get_cluster', LOCATION_CLUSTER_PARAMS, 'get_cluster'),
    'gcloud.get_current_project': readHandler('gcloud.get_current_project', EMPTY_PARAMS, 'get_current_project'),
    'gcloud.get_function': readHandler('gcloud.get_function', LOCATION_FUNCTION_PARAMS, 'get_function'),
    'gcloud.get_instance': readHandler('gcloud.get_instance', INSTANCE_PARAMS, 'get_instance'),
    'gcloud.get_project': readHandler('gcloud.get_project', PROJECT_PARAMS, 'get_project'),
    'gcloud.get_sql_instance': readHandler('gcloud.get_sql_instance', SQL_INSTANCE_PARAMS, 'get_sql_instance'),
    'gcloud.list_billing_accounts': readHandler('gcloud.list_billing_accounts', PAGE_PARAMS, 'list_billing_accounts'),
    'gcloud.list_buckets': readHandler('gcloud.list_buckets', PROJECT_MAX_PARAMS, 'list_buckets'),
    'gcloud.list_cloud_run_services': readHandler('gcloud.list_cloud_run_services', PROJECT_PAGE_PARAMS, 'list_cloud_run_services'),
    'gcloud.list_clusters': readHandler('gcloud.list_clusters', PROJECT_PARAMS, 'list_clusters'),
    'gcloud.list_disks': readHandler('gcloud.list_disks', PROJECT_ZONE_MAX_PARAMS, 'list_disks'),
    'gcloud.list_enabled_services': readHandler('gcloud.list_enabled_services', PROJECT_PAGE_PARAMS, 'list_enabled_services'),
    'gcloud.list_firewalls': readHandler('gcloud.list_firewalls', PROJECT_MAX_PARAMS, 'list_firewalls'),
    'gcloud.list_functions': readHandler('gcloud.list_functions', PROJECT_PAGE_PARAMS, 'list_functions'),
    'gcloud.list_iam_roles': readHandler('gcloud.list_iam_roles', PROJECT_PAGE_PARAMS, 'list_iam_roles'),
    'gcloud.list_instances': readHandler('gcloud.list_instances', PROJECT_ZONE_MAX_PARAMS, 'list_instances'),
    'gcloud.list_networks': readHandler('gcloud.list_networks', PROJECT_MAX_PARAMS, 'list_networks'),
    'gcloud.list_objects': readHandler('gcloud.list_objects', OBJECTS_PARAMS, 'list_objects'),
    'gcloud.list_projects': readHandler('gcloud.list_projects', PAGE_PARAMS, 'list_projects'),
    'gcloud.list_service_accounts': readHandler('gcloud.list_service_accounts', PROJECT_PAGE_PARAMS, 'list_service_accounts'),
    'gcloud.list_sql_instances': readHandler('gcloud.list_sql_instances', PROJECT_MAX_PARAMS, 'list_sql_instances'),

    'gcloud.disable_service': guarded('gcloud.disable_service', 'write', ENABLE_SERVICE_PARAMS, 'unverified-gcloud-disable-service-mutation'),
    'gcloud.enable_service': guarded('gcloud.enable_service', 'write', ENABLE_SERVICE_PARAMS, 'unverified-gcloud-enable-service-mutation'),
    'gcloud.get_iam_policy': guarded('gcloud.get_iam_policy', 'write', PROJECT_PARAMS, 'unverified-gcloud-get-iam-policy-post-read'),
    'gcloud.list_log_entries': guarded('gcloud.list_log_entries', 'write', LOG_ENTRIES_PARAMS, 'unverified-gcloud-list-log-entries-post-read'),
    'gcloud.start_instance': guarded('gcloud.start_instance', 'write', INSTANCE_PARAMS, 'unverified-gcloud-start-instance-mutation'),
    'gcloud.stop_instance': guarded('gcloud.stop_instance', 'write', INSTANCE_PARAMS, 'unverified-gcloud-stop-instance-mutation')
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

  global.FsbHandlerGcloud = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
