(function (global) {
  'use strict';

  /**
   * CockroachDB Cloud same-origin gRPC read head.
   *
   * CockroachDB Cloud's console uses first-party gRPC-web calls plus protobuf
   * classes loaded by the page. The handler itself stays network-free and routes
   * only reviewed read action keys through the bounded page-read primitive.
   * Mutation-capable rows, including arbitrary SQL execution, remain fail-closed.
   */

  var ORIGIN = 'https://cockroachlabs.cloud';
  var SERVICE = 'cockroachlabs.cloud';

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var CLUSTER_ID_PARAMS = schema({
    cluster_id: { type: 'string', description: 'Cluster UUID' }
  }, ['cluster_id']);
  var CREATE_DATABASE_USER_PARAMS = schema({
    cluster_id: { type: 'string', description: 'Cluster UUID' },
    name: { type: 'string', description: 'Username for the new SQL user' },
    password: { type: 'string', description: 'Password for the new SQL user' }
  }, ['cluster_id', 'name', 'password']);
  var DELETE_DATABASE_USER_PARAMS = schema({
    cluster_id: { type: 'string', description: 'Cluster UUID' },
    name: { type: 'string', description: 'Username of the SQL user to delete' }
  }, ['cluster_id', 'name']);
  var EXECUTE_SQL_PARAMS = schema({
    cluster_id: { type: 'string', description: 'Cluster UUID' },
    statements: { type: 'array', items: STRING, description: 'SQL statements to execute' },
    database: { type: 'string', description: 'Database name to use (defaults to defaultdb)' }
  }, ['cluster_id', 'statements']);
  var SET_DELETE_PROTECTION_PARAMS = schema({
    cluster_id: { type: 'string', description: 'Cluster UUID' },
    enabled: { type: 'boolean', description: 'Whether to enable delete protection' }
  }, ['cluster_id', 'enabled']);

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
          return fallback(slug, 'cockroachdb-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'cockroachdb',
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
    'cockroachdb.get_organization': readHandler('cockroachdb.get_organization', EMPTY_PARAMS, 'get_organization'),
    'cockroachdb.list_org_users': readHandler('cockroachdb.list_org_users', EMPTY_PARAMS, 'list_org_users'),
    'cockroachdb.get_resource_count': readHandler('cockroachdb.get_resource_count', EMPTY_PARAMS, 'get_resource_count'),
    'cockroachdb.get_user_profile': readHandler('cockroachdb.get_user_profile', EMPTY_PARAMS, 'get_user_profile'),
    'cockroachdb.list_clusters': readHandler('cockroachdb.list_clusters', EMPTY_PARAMS, 'list_clusters'),
    'cockroachdb.get_cluster': readHandler('cockroachdb.get_cluster', CLUSTER_ID_PARAMS, 'get_cluster'),
    'cockroachdb.get_cluster_usage': readHandler('cockroachdb.get_cluster_usage', CLUSTER_ID_PARAMS, 'get_cluster_usage'),
    'cockroachdb.list_cluster_nodes': readHandler('cockroachdb.list_cluster_nodes', CLUSTER_ID_PARAMS, 'list_cluster_nodes'),
    'cockroachdb.list_database_names': readHandler('cockroachdb.list_database_names', CLUSTER_ID_PARAMS, 'list_database_names'),
    'cockroachdb.list_database_users': readHandler('cockroachdb.list_database_users', CLUSTER_ID_PARAMS, 'list_database_users'),
    'cockroachdb.get_networking_config': readHandler('cockroachdb.get_networking_config', CLUSTER_ID_PARAMS, 'get_networking_config'),
    'cockroachdb.list_invoices': readHandler('cockroachdb.list_invoices', EMPTY_PARAMS, 'list_invoices'),
    'cockroachdb.get_credit_trial_status': readHandler('cockroachdb.get_credit_trial_status', EMPTY_PARAMS, 'get_credit_trial_status'),

    'cockroachdb.execute_sql': guarded('cockroachdb.execute_sql', 'write', EXECUTE_SQL_PARAMS, 'unverified-cockroachdb-execute-sql-mutation'),
    'cockroachdb.create_database_user': guarded('cockroachdb.create_database_user', 'write', CREATE_DATABASE_USER_PARAMS, 'unverified-cockroachdb-create-database-user-mutation'),
    'cockroachdb.set_delete_protection': guarded('cockroachdb.set_delete_protection', 'write', SET_DELETE_PROTECTION_PARAMS, 'unverified-cockroachdb-set-delete-protection-mutation'),
    'cockroachdb.delete_cluster': guarded('cockroachdb.delete_cluster', 'destructive', CLUSTER_ID_PARAMS, 'unverified-cockroachdb-delete-cluster-mutation'),
    'cockroachdb.delete_database_user': guarded('cockroachdb.delete_database_user', 'destructive', DELETE_DATABASE_USER_PARAMS, 'unverified-cockroachdb-delete-database-user-mutation')
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

  global.FsbHandlerCockroachdb = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
