(function (global) {
  'use strict';

  /**
   * Netlify same-origin head.
   *
   * Netlify's vendored runtime uses first-party relative paths under
   * /access-control/bb-api/api/v1 with HttpOnly session cookies. Read-only calls
   * execute through executeBoundSpec. Write/destructive slugs are registered only
   * as guarded fail-closed handlers until live mutation-body UAT records the method,
   * path, body shape, and CSRF/session carrier.
   */

  var NETLIFY_ORIGIN = 'https://app.netlify.com';
  var NETLIFY_SERVICE = 'app.netlify.com';
  var NETLIFY_API_BASE = NETLIFY_ORIGIN + '/access-control/bb-api/api/v1';

  var STRING = { type: 'string' };
  var NUMBER = { type: 'number' };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var STRING_ARRAY = { type: 'array', items: STRING };

  function schema(properties, required) {
    return {
      type: 'object',
      properties: properties || {},
      required: required || [],
      additionalProperties: false
    };
  }

  function withPaging(properties, required) {
    var out = {};
    var p = properties || {};
    for (var key in p) {
      if (Object.prototype.hasOwnProperty.call(p, key)) { out[key] = p[key]; }
    }
    out.page = NUMBER;
    out.per_page = NUMBER;
    return schema(out, required || []);
  }

  var ACCOUNT_ID_PARAMS = schema({ account_id: STRING }, ['account_id']);
  var ACCOUNT_SLUG_PARAMS = schema({ account_slug: STRING }, ['account_slug']);
  var DEPLOY_ID_PARAMS = schema({ deploy_id: STRING }, ['deploy_id']);
  var FORM_PAGING_PARAMS = withPaging({ form_id: STRING }, ['form_id']);
  var GET_ENV_VAR_PARAMS = schema({ account_id: STRING, key: STRING, site_id: STRING }, ['account_id', 'key']);
  var GET_MEMBER_PARAMS = schema({ account_slug: STRING, member_id: STRING }, ['account_slug', 'member_id']);
  var HOOK_ID_PARAMS = schema({ hook_id: STRING }, ['hook_id']);
  var LIST_AUDIT_EVENTS_PARAMS = withPaging({ account_id: STRING, query: STRING }, ['account_id']);
  var LIST_DNS_ZONES_PARAMS = schema({ account_slug: STRING }, []);
  var LIST_ENV_VARS_PARAMS = schema({ account_id: STRING, site_id: STRING }, ['account_id']);
  var LIST_HOOKS_PARAMS = schema({ site_id: STRING }, ['site_id']);
  var LIST_SITES_PARAMS = withPaging({ account_slug: STRING, name: STRING }, ['account_slug']);
  var RECORD_ID_PARAMS = schema({ zone_id: STRING, record_id: STRING }, ['zone_id', 'record_id']);
  var SITE_DEPLOY_ID_PARAMS = schema({ site_id: STRING, deploy_id: STRING }, ['site_id', 'deploy_id']);
  var SITE_HOOK_ID_PARAMS = schema({ site_id: STRING, hook_id: STRING }, ['site_id', 'hook_id']);
  var SITE_ID_PARAMS = schema({ site_id: STRING }, ['site_id']);
  var SITE_PAGING_PARAMS = withPaging({ site_id: STRING }, ['site_id']);
  var SUBMISSION_ID_PARAMS = schema({ submission_id: STRING }, ['submission_id']);
  var ZONE_ID_PARAMS = schema({ zone_id: STRING }, ['zone_id']);

  var ENV_VAR_VALUE_INPUT = schema({
    value: STRING,
    context: STRING,
    context_parameter: STRING
  }, ['value', 'context']);
  var ENV_VAR_INPUT = schema({
    key: STRING,
    scopes: STRING_ARRAY,
    values: { type: 'array', items: ENV_VAR_VALUE_INPUT },
    is_secret: BOOLEAN
  }, ['key', 'values']);

  var CREATE_BUILD_HOOK_PARAMS = schema({
    site_id: STRING,
    title: STRING,
    branch: STRING
  }, ['site_id', 'title', 'branch']);
  var CREATE_DNS_RECORD_PARAMS = schema({
    zone_id: STRING,
    hostname: STRING,
    type: STRING,
    value: STRING,
    ttl: NUMBER,
    priority: NUMBER
  }, ['zone_id', 'hostname', 'type', 'value']);
  var CREATE_DNS_ZONE_PARAMS = schema({
    account_slug: STRING,
    name: STRING,
    site_id: STRING
  }, ['account_slug', 'name']);
  var CREATE_ENV_VARS_PARAMS = schema({
    account_id: STRING,
    site_id: STRING,
    variables: { type: 'array', items: ENV_VAR_INPUT }
  }, ['account_id', 'variables']);
  var CREATE_SITE_PARAMS = schema({ account_slug: STRING, name: STRING }, ['account_slug', 'name']);
  var UPDATE_ENV_VAR_PARAMS = schema({
    account_id: STRING,
    key: STRING,
    site_id: STRING,
    scopes: STRING_ARRAY,
    values: { type: 'array', items: ENV_VAR_VALUE_INPUT },
    is_secret: BOOLEAN
  }, ['account_id', 'key', 'values']);
  var UPDATE_SITE_PARAMS = schema({
    site_id: STRING,
    name: STRING,
    custom_domain: STRING,
    force_ssl: BOOLEAN,
    repo_branch: STRING,
    build_cmd: STRING
  }, ['site_id']);

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null) { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function buildGetSpec(path, pairs) {
    return {
      url: NETLIFY_API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: NETLIFY_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeNetlifyError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string' || typeof data.message === 'string');
  }

  function guardArray(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (!Array.isArray(result.data) || looksLikeNetlifyError(result.data)) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'netlify-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeNetlifyError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'netlify-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function readHandler(slug, params, buildPath, buildPairs, kind) {
    return {
      tier: 'T1a',
      origin: NETLIFY_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
            slug: slug,
            reason: 'netlify-execute-bound-spec-unavailable',
            fellBackToDom: true
          });
        }
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec(buildPath(a), buildPairs ? buildPairs(a) : []), ctx.tabId);
        return kind === 'array' ? guardArray(res, slug) : guardObject(res, slug);
      }
    };
  }

  function guardedWrite(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: NETLIFY_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: slug,
          reason: reason,
          fellBackToDom: true
        });
      }
    };
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function pagingPairs(a) {
    return [
      ['page', a.page],
      ['per_page', a.per_page]
    ];
  }

  var handlers = {
    'netlify.get_account': readHandler('netlify.get_account', ACCOUNT_ID_PARAMS, function(a) {
      return '/accounts/' + encodeSegment(a.account_id);
    }, null, 'object'),
    'netlify.get_deploy': readHandler('netlify.get_deploy', DEPLOY_ID_PARAMS, function(a) {
      return '/deploys/' + encodeSegment(a.deploy_id);
    }, null, 'object'),
    'netlify.get_dns_zone': readHandler('netlify.get_dns_zone', ZONE_ID_PARAMS, function(a) {
      return '/dns_zones/' + encodeSegment(a.zone_id);
    }, null, 'object'),
    'netlify.get_env_var': readHandler('netlify.get_env_var', GET_ENV_VAR_PARAMS, function(a) {
      return '/accounts/' + encodeSegment(a.account_id) + '/env/' + encodeSegment(a.key);
    }, function(a) {
      return [['site_id', a.site_id]];
    }, 'object'),
    'netlify.get_member': readHandler('netlify.get_member', GET_MEMBER_PARAMS, function(a) {
      return '/' + encodeSegment(a.account_slug) + '/members/' + encodeSegment(a.member_id);
    }, null, 'object'),
    'netlify.get_site': readHandler('netlify.get_site', SITE_ID_PARAMS, function(a) {
      return '/sites/' + encodeSegment(a.site_id);
    }, null, 'object'),
    'netlify.list_accounts': readHandler('netlify.list_accounts', EMPTY_PARAMS, function() {
      return '/accounts';
    }, null, 'array'),
    'netlify.list_audit_events': readHandler('netlify.list_audit_events', LIST_AUDIT_EVENTS_PARAMS, function(a) {
      return '/accounts/' + encodeSegment(a.account_id) + '/audit';
    }, function(a) {
      var pairs = pagingPairs(a);
      pairs.unshift(['query', a.query]);
      return pairs;
    }, 'array'),
    'netlify.list_build_hooks': readHandler('netlify.list_build_hooks', SITE_ID_PARAMS, function(a) {
      return '/sites/' + encodeSegment(a.site_id) + '/build_hooks';
    }, null, 'array'),
    'netlify.list_builds': readHandler('netlify.list_builds', SITE_PAGING_PARAMS, function(a) {
      return '/sites/' + encodeSegment(a.site_id) + '/builds';
    }, pagingPairs, 'array'),
    'netlify.list_deploy_keys': readHandler('netlify.list_deploy_keys', EMPTY_PARAMS, function() {
      return '/deploy_keys';
    }, null, 'array'),
    'netlify.list_deploys': readHandler('netlify.list_deploys', SITE_PAGING_PARAMS, function(a) {
      return '/sites/' + encodeSegment(a.site_id) + '/deploys';
    }, pagingPairs, 'array'),
    'netlify.list_dns_records': readHandler('netlify.list_dns_records', ZONE_ID_PARAMS, function(a) {
      return '/dns_zones/' + encodeSegment(a.zone_id) + '/dns_records';
    }, null, 'array'),
    'netlify.list_dns_zones': readHandler('netlify.list_dns_zones', LIST_DNS_ZONES_PARAMS, function() {
      return '/dns_zones';
    }, function(a) {
      return [['account_slug', a.account_slug]];
    }, 'array'),
    'netlify.list_env_vars': readHandler('netlify.list_env_vars', LIST_ENV_VARS_PARAMS, function(a) {
      return '/accounts/' + encodeSegment(a.account_id) + '/env';
    }, function(a) {
      return [['site_id', a.site_id]];
    }, 'array'),
    'netlify.list_form_submissions': readHandler('netlify.list_form_submissions', FORM_PAGING_PARAMS, function(a) {
      return '/forms/' + encodeSegment(a.form_id) + '/submissions';
    }, pagingPairs, 'array'),
    'netlify.list_forms': readHandler('netlify.list_forms', SITE_ID_PARAMS, function(a) {
      return '/sites/' + encodeSegment(a.site_id) + '/forms';
    }, null, 'array'),
    'netlify.list_hooks': readHandler('netlify.list_hooks', LIST_HOOKS_PARAMS, function() {
      return '/hooks';
    }, function(a) {
      return [['site_id', a.site_id]];
    }, 'array'),
    'netlify.list_members': readHandler('netlify.list_members', ACCOUNT_SLUG_PARAMS, function(a) {
      return '/' + encodeSegment(a.account_slug) + '/members';
    }, null, 'array'),
    'netlify.list_sites': readHandler('netlify.list_sites', LIST_SITES_PARAMS, function(a) {
      return '/' + encodeSegment(a.account_slug) + '/sites';
    }, function(a) {
      var pairs = pagingPairs(a);
      pairs.push(['name', a.name]);
      return pairs;
    }, 'array'),

    'netlify.create_build': guardedWrite('netlify.create_build', 'write', SITE_ID_PARAMS, 'unverified-netlify-create-build-mutation'),
    'netlify.create_build_hook': guardedWrite('netlify.create_build_hook', 'write', CREATE_BUILD_HOOK_PARAMS, 'unverified-netlify-create-build-hook-mutation'),
    'netlify.create_deploy_key': guardedWrite('netlify.create_deploy_key', 'write', EMPTY_PARAMS, 'unverified-netlify-create-deploy-key-mutation'),
    'netlify.create_dns_record': guardedWrite('netlify.create_dns_record', 'write', CREATE_DNS_RECORD_PARAMS, 'unverified-netlify-create-dns-record-mutation'),
    'netlify.create_dns_zone': guardedWrite('netlify.create_dns_zone', 'write', CREATE_DNS_ZONE_PARAMS, 'unverified-netlify-create-dns-zone-mutation'),
    'netlify.create_env_vars': guardedWrite('netlify.create_env_vars', 'write', CREATE_ENV_VARS_PARAMS, 'unverified-netlify-create-env-vars-mutation'),
    'netlify.create_site': guardedWrite('netlify.create_site', 'write', CREATE_SITE_PARAMS, 'unverified-netlify-create-site-mutation'),
    'netlify.delete_build_hook': guardedWrite('netlify.delete_build_hook', 'destructive', SITE_HOOK_ID_PARAMS, 'unverified-netlify-delete-build-hook-mutation'),
    'netlify.delete_dns_record': guardedWrite('netlify.delete_dns_record', 'destructive', RECORD_ID_PARAMS, 'unverified-netlify-delete-dns-record-mutation'),
    'netlify.delete_env_var': guardedWrite('netlify.delete_env_var', 'destructive', GET_ENV_VAR_PARAMS, 'unverified-netlify-delete-env-var-mutation'),
    'netlify.delete_hook': guardedWrite('netlify.delete_hook', 'destructive', HOOK_ID_PARAMS, 'unverified-netlify-delete-hook-mutation'),
    'netlify.delete_site': guardedWrite('netlify.delete_site', 'destructive', SITE_ID_PARAMS, 'unverified-netlify-delete-site-mutation'),
    'netlify.delete_submission': guardedWrite('netlify.delete_submission', 'destructive', SUBMISSION_ID_PARAMS, 'unverified-netlify-delete-submission-mutation'),
    'netlify.lock_deploy': guardedWrite('netlify.lock_deploy', 'write', DEPLOY_ID_PARAMS, 'unverified-netlify-lock-deploy-mutation'),
    'netlify.restore_deploy': guardedWrite('netlify.restore_deploy', 'write', SITE_DEPLOY_ID_PARAMS, 'unverified-netlify-restore-deploy-mutation'),
    'netlify.rollback_deploy': guardedWrite('netlify.rollback_deploy', 'write', SITE_ID_PARAMS, 'unverified-netlify-rollback-deploy-mutation'),
    'netlify.unlock_deploy': guardedWrite('netlify.unlock_deploy', 'write', DEPLOY_ID_PARAMS, 'unverified-netlify-unlock-deploy-mutation'),
    'netlify.update_env_var': guardedWrite('netlify.update_env_var', 'write', UPDATE_ENV_VAR_PARAMS, 'unverified-netlify-update-env-var-mutation'),
    'netlify.update_site': guardedWrite('netlify.update_site', 'write', UPDATE_SITE_PARAMS, 'unverified-netlify-update-site-mutation')
  };

  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: NETLIFY_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerNetlify = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
