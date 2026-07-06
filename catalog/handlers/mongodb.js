(function (global) {
  'use strict';

  var MONGODB_ORIGIN = 'https://cloud.mongodb.com';
  var MONGODB_SERVICE = 'cloud.mongodb.com';

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var STRING = { type: 'string' };
  var CLUSTER_PARAMS = schema({
    cluster_name: { type: 'string', description: 'Cluster name to retrieve' }
  }, ['cluster_name']);
  var IP_ACCESS_PARAMS = schema({
    ip_address: { type: 'string', description: 'IP address or CIDR block' },
    comment: { type: 'string', description: 'Optional description' }
  }, ['ip_address']);
  var DELETE_IP_ACCESS_PARAMS = schema({
    ip_address: { type: 'string', description: 'IP address or CIDR block' }
  }, ['ip_address']);
  var CREATE_DATABASE_USER_PARAMS = schema({
    username: { type: 'string', description: 'Username for the new database user' },
    password: { type: 'string', description: 'Password for the new database user' },
    roles: {
      type: 'array',
      items: schema({
        role_name: { type: 'string', description: 'Role name' },
        database_name: { type: 'string', description: 'Database name' }
      }, ['role_name', 'database_name'])
    },
    scopes: {
      type: 'array',
      items: schema({
        name: { type: 'string', description: 'Scope name' },
        type: { type: 'string', description: 'Scope type' }
      }, ['name', 'type'])
    }
  }, ['username', 'password', 'roles']);
  var DELETE_DATABASE_USER_PARAMS = schema({
    username: { type: 'string', description: 'Username of the database user to delete' },
    database: { type: 'string', description: 'Authentication database' }
  }, ['username']);

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

  function activeUrlFromContext(ctx) {
    if (!ctx || typeof ctx !== 'object') { return MONGODB_ORIGIN + '/'; }
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx[fields[i]];
      if (typeof value === 'string' && value) {
        try {
          var parsed = new URL(value);
          if (parsed.origin === MONGODB_ORIGIN) { return value; }
        } catch (e) {
          return MONGODB_ORIGIN + '/';
        }
      }
    }
    return MONGODB_ORIGIN + '/';
  }

  function buildBootstrapSpec(ctx) {
    return {
      url: activeUrlFromContext(ctx),
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: MONGODB_ORIGIN,
      extract: '@'
    };
  }

  function buildGetSpec(path) {
    return {
      url: MONGODB_ORIGIN + path,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: MONGODB_ORIGIN,
      extract: '@'
    };
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    return '';
  }

  function objectAtPath(root, path) {
    var cur = root;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') { return null; }
      cur = cur[path[i]];
    }
    return cur && typeof cur === 'object' ? cur : null;
  }

  function findQuotedValue(text, key) {
    var re = new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"');
    var match = re.exec(text);
    return match && match[1] ? match[1] : '';
  }

  function readJsonScript(text, marker) {
    var idx = text.indexOf(marker);
    if (idx === -1) { return null; }
    var start = text.indexOf('{', idx);
    if (start === -1) { return null; }
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === '\\') { escaped = true; }
        else if (ch === '"') { inString = false; }
        continue;
      }
      if (ch === '"') { inString = true; }
      else if (ch === '{') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
        }
      }
    }
    return null;
  }

  function paramsFromBootstrap(result) {
    var data = result && result.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      var direct = data.PARAMS || data.params || data;
      return {
        appUser: objectAtPath(direct, ['appUser']) || direct.appUser || null,
        groupId: (objectAtPath(direct, ['currentGroup']) || {}).id || '',
        orgId: (objectAtPath(direct, ['currentOrganization']) || {}).id || ''
      };
    }
    var text = textFromResult(result);
    var params = readJsonScript(text, 'PARAMS') || readJsonScript(text, '__INITIAL_STATE__') || {};
    var group = objectAtPath(params, ['currentGroup']) || {};
    var org = objectAtPath(params, ['currentOrganization']) || {};
    var user = objectAtPath(params, ['appUser']) || null;
    return {
      appUser: user,
      groupId: group.id || findQuotedValue(text, 'currentGroupId') || findQuotedValue(text, 'groupId'),
      orgId: org.id || findQuotedValue(text, 'currentOrganizationId') || findQuotedValue(text, 'orgId')
    };
  }

  function normalizeUser(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      id: raw.id || '',
      first_name: raw.firstName || raw.first_name || '',
      last_name: raw.lastName || raw.last_name || '',
      email: raw.emailAddress || raw.email || raw.username || ''
    };
  }

  async function readParams(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'mongodb-execute-bound-spec-unavailable');
    }
    var probe = await ctx.executeBoundSpec(buildBootstrapSpec(ctx), ctx.tabId);
    if (!probe || probe.success !== true) { return probe || fallback(slug, 'mongodb-bootstrap-unavailable'); }
    return { success: true, params: paramsFromBootstrap(probe) };
  }

  function needsContext(kind, params, slug) {
    var id = kind === 'org' ? params.orgId : params.groupId;
    if (typeof id === 'string' && id) { return null; }
    return fallback(slug, kind === 'org' ? 'mongodb-organization-context-unavailable' : 'mongodb-project-context-unavailable');
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function guardPayload(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = false;
    if (!looksLikeError(data)) {
      if (kind === 'array') { ok = Array.isArray(data); }
      else if (kind === 'object') { ok = !!data && typeof data === 'object' && !Array.isArray(data); }
      else { ok = true; }
    }
    return ok ? result : fallback(slug, 'mongodb-logged-out-or-shape-mismatch');
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function readHandler(slug, contextKind, pathBuilder, kind) {
    return {
      tier: 'T1a',
      origin: MONGODB_ORIGIN,
      sideEffectClass: 'read',
      params: slug === 'mongodb.get_cluster' ? CLUSTER_PARAMS : EMPTY_PARAMS,
      async handle(args, ctx) {
        var context = await readParams(ctx, slug);
        if (!context || context.success !== true) { return context; }
        if (contextKind) {
          var missing = needsContext(contextKind, context.params, slug);
          if (missing) { return missing; }
        }
        var res = await ctx.executeBoundSpec(buildGetSpec(pathBuilder(args || {}, context.params)), ctx.tabId);
        return guardPayload(res, slug, kind);
      }
    };
  }

  function currentUserHandler() {
    return {
      tier: 'T1a',
      origin: MONGODB_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        var context = await readParams(ctx, 'mongodb.get_current_user');
        if (!context || context.success !== true) { return context; }
        var user = context.params && context.params.appUser;
        if (!user) { return fallback('mongodb.get_current_user', 'mongodb-user-context-unavailable'); }
        return { success: true, data: { user: normalizeUser(user) } };
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: MONGODB_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'mongodb.add_ip_access_entry': guarded('mongodb.add_ip_access_entry', 'write', IP_ACCESS_PARAMS, 'unverified-mongodb-add-ip-access-entry-mutation'),
    'mongodb.create_database_user': guarded('mongodb.create_database_user', 'write', CREATE_DATABASE_USER_PARAMS, 'unverified-mongodb-create-database-user-mutation'),
    'mongodb.delete_database_user': guarded('mongodb.delete_database_user', 'destructive', DELETE_DATABASE_USER_PARAMS, 'unverified-mongodb-delete-database-user-mutation'),
    'mongodb.delete_ip_access_entry': guarded('mongodb.delete_ip_access_entry', 'destructive', DELETE_IP_ACCESS_PARAMS, 'unverified-mongodb-delete-ip-access-entry-mutation'),
    'mongodb.get_billing_plan': readHandler('mongodb.get_billing_plan', 'org', function(a, p) {
      return '/billing/plan/' + encodeSegment(p.orgId);
    }, 'object'),
    'mongodb.get_cluster': readHandler('mongodb.get_cluster', 'group', function(a, p) {
      return '/nds/clusters/' + encodeSegment(p.groupId) + '/' + encodeSegment(a.cluster_name);
    }, 'object'),
    'mongodb.get_current_user': currentUserHandler(),
    'mongodb.get_deployment_status': readHandler('mongodb.get_deployment_status', 'group', function(a, p) {
      return '/automation/deploymentStatus/' + encodeSegment(p.groupId);
    }, 'object'),
    'mongodb.get_organization': readHandler('mongodb.get_organization', 'org', function(a, p) {
      return '/orgs/' + encodeSegment(p.orgId);
    }, 'object'),
    'mongodb.get_project': readHandler('mongodb.get_project', 'group', function(a, p) {
      return '/nds/' + encodeSegment(p.groupId);
    }, 'object'),
    'mongodb.get_user_security': readHandler('mongodb.get_user_security', 'group', function(a, p) {
      return '/nds/' + encodeSegment(p.groupId) + '/userSecurity';
    }, 'object'),
    'mongodb.list_alert_configs': readHandler('mongodb.list_alert_configs', 'group', function(a, p) {
      return '/activity/alertConfigs/' + encodeSegment(p.groupId);
    }, 'array'),
    'mongodb.list_alerts': readHandler('mongodb.list_alerts', 'group', function(a, p) {
      return '/user/shared/alerts/project/' + encodeSegment(p.groupId);
    }, 'array'),
    'mongodb.list_clusters': readHandler('mongodb.list_clusters', 'group', function(a, p) {
      return '/nds/clusters/' + encodeSegment(p.groupId);
    }, 'array'),
    'mongodb.list_database_users': readHandler('mongodb.list_database_users', 'group', function(a, p) {
      return '/nds/' + encodeSegment(p.groupId) + '/users';
    }, 'array'),
    'mongodb.list_ip_access_list': readHandler('mongodb.list_ip_access_list', 'group', function(a, p) {
      return '/nds/' + encodeSegment(p.groupId) + '/ipWhitelist';
    }, 'array'),
    'mongodb.list_network_peering': readHandler('mongodb.list_network_peering', 'group', function(a, p) {
      return '/nds/' + encodeSegment(p.groupId) + '/peers';
    }, 'array'),
    'mongodb.list_organization_members': readHandler('mongodb.list_organization_members', 'org', function(a, p) {
      return '/orgs/' + encodeSegment(p.orgId) + '/users';
    }, 'array'),
    'mongodb.list_organization_projects': readHandler('mongodb.list_organization_projects', 'org', function(a, p) {
      return '/orgs/' + encodeSegment(p.orgId) + '/groups';
    }, 'array'),
    'mongodb.list_organization_teams': readHandler('mongodb.list_organization_teams', 'org', function(a, p) {
      return '/orgs/' + encodeSegment(p.orgId) + '/teams';
    }, 'array')
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
            service: MONGODB_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerMongodb = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
