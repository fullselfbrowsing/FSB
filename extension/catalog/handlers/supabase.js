(function (global) {
  'use strict';

  /**
   * Supabase Management API page-read head.
   *
   * Supabase dashboard auth is page-owned and the Management API lives on a
   * separate API origin. This head stays network-free and delegates reviewed GET
   * reads to the bounded page-read primitive pinned to supabase.com. Mutations and
   * SQL POST rows stay guarded fail-closed until live mutation-body UAT exists.
   */

  var ORIGIN = 'https://supabase.com';
  var SERVICE = 'supabase.com';

  var EMPTY_PARAMS = schema({}, []);
  var REF_PARAMS = schema({
    ref: stringField('Project reference ID')
  }, ['ref']);
  var PROJECT_PARAMS = schema({
    ref: stringField('Project reference ID (e.g., "abcdefghijklmnopqrst")')
  }, ['ref']);
  var FUNCTION_PARAMS = schema({
    ref: stringField('Project reference ID'),
    function_slug: stringField('Function slug (URL-friendly name)')
  }, ['ref', 'function_slug']);
  var ORG_PARAMS = schema({
    slug: stringField('Organization slug')
  }, ['slug']);
  var LOG_PARAMS = schema({
    ref: stringField('Project reference ID'),
    source: stringField('Log source to query: "postgres", "auth", "storage", "realtime", "edge-functions", or "postgrest"')
  }, ['ref', 'source']);
  var SECRETS_PARAMS = schema({
    ref: stringField('Project reference ID'),
    secrets: {
      minItems: 1,
      type: 'array',
      items: schema({
        name: stringField('Secret name'),
        value: stringField('Secret value')
      }, ['name', 'value']),
      description: 'Secrets to create or update'
    }
  }, ['ref', 'secrets']);
  var DELETE_SECRETS_PARAMS = schema({
    ref: stringField('Project reference ID'),
    names: {
      minItems: 1,
      type: 'array',
      items: stringField('Secret name'),
      description: 'Names of secrets to delete'
    }
  }, ['ref', 'names']);
  var SQL_PARAMS = schema({
    ref: stringField('Project reference ID'),
    query: stringField('SQL query to execute')
  }, ['ref', 'query']);
  var READ_ONLY_SQL_PARAMS = schema({
    ref: stringField('Project reference ID'),
    query: stringField('Read-only SQL query (SELECT only)')
  }, ['ref', 'query']);
  var PAUSE_PARAMS = schema({
    ref: stringField('Project reference ID to pause')
  }, ['ref']);
  var RESTORE_PARAMS = schema({
    ref: stringField('Project reference ID to restore')
  }, ['ref']);

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
      reason: reason || 'supabase-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'supabase-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'supabase',
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
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'supabase.generate_types': readHandler('supabase.generate_types', REF_PARAMS, 'generate_types'),
    'supabase.get_api_keys': readHandler('supabase.get_api_keys', REF_PARAMS, 'get_api_keys'),
    'supabase.get_function': readHandler('supabase.get_function', FUNCTION_PARAMS, 'get_function'),
    'supabase.get_organization': readHandler('supabase.get_organization', ORG_PARAMS, 'get_organization'),
    'supabase.get_performance_advisors': readHandler('supabase.get_performance_advisors', REF_PARAMS, 'get_performance_advisors'),
    'supabase.get_postgrest_config': readHandler('supabase.get_postgrest_config', REF_PARAMS, 'get_postgrest_config'),
    'supabase.get_project': readHandler('supabase.get_project', PROJECT_PARAMS, 'get_project'),
    'supabase.get_project_health': readHandler('supabase.get_project_health', REF_PARAMS, 'get_project_health'),
    'supabase.get_project_logs': readHandler('supabase.get_project_logs', LOG_PARAMS, 'get_project_logs'),
    'supabase.get_security_advisors': readHandler('supabase.get_security_advisors', REF_PARAMS, 'get_security_advisors'),
    'supabase.list_backups': readHandler('supabase.list_backups', REF_PARAMS, 'list_backups'),
    'supabase.list_buckets': readHandler('supabase.list_buckets', REF_PARAMS, 'list_buckets'),
    'supabase.list_functions': readHandler('supabase.list_functions', REF_PARAMS, 'list_functions'),
    'supabase.list_migrations': readHandler('supabase.list_migrations', REF_PARAMS, 'list_migrations'),
    'supabase.list_organization_members': readHandler('supabase.list_organization_members', ORG_PARAMS, 'list_organization_members'),
    'supabase.list_organizations': readHandler('supabase.list_organizations', EMPTY_PARAMS, 'list_organizations'),
    'supabase.list_projects': readHandler('supabase.list_projects', EMPTY_PARAMS, 'list_projects'),
    'supabase.list_secrets': readHandler('supabase.list_secrets', REF_PARAMS, 'list_secrets'),
    'supabase.list_sql_snippets': readHandler('supabase.list_sql_snippets', EMPTY_PARAMS, 'list_sql_snippets'),

    'supabase.create_secrets': guarded('supabase.create_secrets', 'write', SECRETS_PARAMS, 'unverified-supabase-create-secrets-mutation'),
    'supabase.delete_function': guarded('supabase.delete_function', 'destructive', FUNCTION_PARAMS, 'unverified-supabase-delete-function-mutation'),
    'supabase.delete_secrets': guarded('supabase.delete_secrets', 'destructive', DELETE_SECRETS_PARAMS, 'unverified-supabase-delete-secrets-mutation'),
    'supabase.pause_project': guarded('supabase.pause_project', 'write', PAUSE_PARAMS, 'unverified-supabase-pause-project-mutation'),
    'supabase.restore_project': guarded('supabase.restore_project', 'write', RESTORE_PARAMS, 'unverified-supabase-restore-project-mutation'),
    'supabase.run_query': guarded('supabase.run_query', 'write', SQL_PARAMS, 'unverified-supabase-run-query-mutation'),
    'supabase.run_read_only_query': guarded('supabase.run_read_only_query', 'write', READ_ONLY_SQL_PARAMS, 'unverified-supabase-run-read-only-query-post')
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

  global.FsbHandlerSupabase = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
