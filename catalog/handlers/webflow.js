(function (global) {
  'use strict';

  /**
   * Webflow same-origin READ head.
   *
   * Webflow's vendored runtime uses first-party /api GET routes on webflow.com
   * with HttpOnly session cookies. These read-only descriptors execute through
   * executeBoundSpec. No CSRF token is needed for GET, and no mutation routes are
   * registered here.
   */

  var WEBFLOW_ORIGIN = 'https://webflow.com';
  var WEBFLOW_SERVICE = 'webflow.com';
  var API_BASE = WEBFLOW_ORIGIN + '/api';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var SITE_PARAMS = schema({
    site_short_name: stringField('Site short name / URL slug')
  }, ['site_short_name']);
  var WORKSPACE_PARAMS = schema({
    workspace_slug: stringField('Workspace URL slug')
  }, ['workspace_slug']);
  var LIST_SITES_PARAMS = schema({
    workspace_slug: stringField('Workspace URL slug'),
    page: {
      description: 'Page number (default 1)',
      type: 'integer',
      minimum: 1,
      maximum: INT_LIMIT
    }
  }, ['workspace_slug']);

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
      reason: reason || 'webflow-logged-out-or-rot',
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function getSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: WEBFLOW_ORIGIN,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
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

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors) ||
      data.success === false
    );
  }

  function validResultData(result, slug, guard) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'webflow-http-auth-or-rot');
    }
    var data = result.data;
    if (looksLikeError(data)) { return fallback(slug, 'webflow-api-error-envelope'); }
    if (typeof guard === 'function' && !guard(data)) {
      return fallback(slug, 'webflow-shape-mismatch');
    }
    return data;
  }

  function withData(result, data) {
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) { out[key] = result[key]; }
    }
    out.data = data;
    return out;
  }

  function mapUser(u) {
    u = u || {};
    return {
      id: str(u._id),
      email: str(u.email),
      first_name: str(u.firstName),
      last_name: str(u.lastName),
      username: str(u.username),
      verified: bool(u.verified),
      created_on: str(u.createdOn),
      plan: str(u.plan),
      two_factor_enabled: bool(u.twoFactorEnabled)
    };
  }

  function mapWorkspace(w) {
    w = w || {};
    return {
      id: str(w._id),
      name: str(w.name),
      slug: str(w.slug),
      role: str(w.role),
      site_count: num(w.siteCount),
      used_seats: num(w.usedSeats),
      total_seats: num(w.totalSeats),
      created_on: str(w.createdOn)
    };
  }

  function mapSite(s) {
    s = s || {};
    return {
      id: str(s._id),
      name: str(s.name),
      short_name: str(s.shortName),
      archived: bool(s.archived),
      created_on: str(s.createdOn),
      last_updated: str(s.lastUpdated),
      last_published: str(s.lastPublished),
      preview_url: str(s.previewUrl),
      workspace_id: str(s.workspace)
    };
  }

  function mapSiteDetail(s) {
    var out = mapSite(s);
    s = s || {};
    out.timezone = str(s.timezone);
    out.ssl_hosting = bool(s.sslHosting);
    out.form_submissions = num(s.formSubmissions);
    out.style_count = num(s.styleCount);
    out.asset_size = num(s.assetSize);
    return out;
  }

  function mapPage(p) {
    p = p || {};
    return {
      id: str(p._id),
      title: str(p.title),
      slug: str(p.slug),
      type: str(p.type),
      archived: bool(p.archived),
      draft: bool(p.draft),
      created_on: str(p.createdOn),
      last_updated: str(p.lastUpdated)
    };
  }

  function mapDomain(d) {
    d = d || {};
    return {
      id: str(d._id),
      name: str(d.name),
      stage: str(d.stage),
      has_valid_ssl: bool(d.hasValidSSL),
      created_on: str(d.createdOn)
    };
  }

  function mapForm(f) {
    f = f || {};
    return {
      id: str(f._id),
      name: str(f.name),
      slug: str(f.slug),
      submission_count: num(f.count)
    };
  }

  function mapFolder(f) {
    f = f || {};
    return {
      id: str(f._id),
      name: str(f.name),
      site_ids: list(f.sites).map(str),
      created_on: str(f.createdOn)
    };
  }

  function mapMember(m) {
    m = m || {};
    return {
      id: str(m._id),
      email: str(m.email),
      first_name: str(m.firstName),
      last_name: str(m.lastName),
      username: str(m.username),
      workspace_role: str(m.roles && m.roles.workspace),
      site_role: str(m.roles && m.roles.site),
      two_factor_enabled: bool(m.twoFactorEnabled),
      last_login: num(m.lastLogin)
    };
  }

  function mapInvite(invite) {
    invite = invite || {};
    return {
      id: str(invite._id),
      email: str(invite.email),
      status: str(invite.status),
      workspace_role: str(invite.role)
    };
  }

  function mapBillingPlan(p) {
    p = p || {};
    return {
      name: str(p.name || 'free'),
      slug: str(p.slug || 'free'),
      price: num(p.price),
      billing_period: str(p.billingPeriod),
      is_free: p.isFree === undefined ? true : bool(p.isFree)
    };
  }

  function readHandler(slug, params, pathForArgs, pairsForArgs, guard, mapper) {
    return {
      tier: 'T1a',
      origin: WEBFLOW_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'webflow-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var result = await ctx.executeBoundSpec(
          getSpec(pathForArgs(a), pairsForArgs ? pairsForArgs(a) : []),
          ctx.tabId
        );
        if (!result || result.success !== true) { return result; }
        var data = validResultData(result, slug, guard);
        if (data && data.success === false) { return data; }
        try {
          return withData(result, mapper ? mapper(data) : data);
        } catch (_err) {
          return fallback(slug, 'webflow-map-shape-mismatch');
        }
      }
    };
  }

  function hasAny(keys) {
    return function(data) {
      if (!isObject(data)) { return false; }
      for (var i = 0; i < keys.length; i++) {
        if (hasOwn(data, keys[i])) { return true; }
      }
      return false;
    };
  }

  function hasArrayKey(key) {
    return function(data) { return isObject(data) && Array.isArray(data[key]); };
  }

  function objectKey(key) {
    return function(data) { return isObject(data) && isObject(data[key]); };
  }

  function objectGuard(data) {
    return isObject(data);
  }

  function arrayGuard(data) {
    return Array.isArray(data);
  }

  var handlers = {
    'webflow.get_current_user': readHandler(
      'webflow.get_current_user',
      EMPTY_PARAMS,
      function() { return '/user'; },
      null,
      hasAny(['_id', 'email', 'username']),
      function(data) { return { user: mapUser(data) }; }
    ),
    'webflow.get_site': readHandler(
      'webflow.get_site',
      SITE_PARAMS,
      function(a) { return '/sites/' + encodeSegment(a.site_short_name) + '/domains'; },
      null,
      objectKey('site'),
      function(data) { return { site: mapSiteDetail(data.site) }; }
    ),
    'webflow.get_site_domains': readHandler(
      'webflow.get_site_domains',
      SITE_PARAMS,
      function(a) { return '/sites/' + encodeSegment(a.site_short_name) + '/domains'; },
      null,
      function(data) { return isObject(data) && Array.isArray(data.domains) && isObject(data.subdomain); },
      function(data) {
        var sub = data.subdomain || {};
        return {
          domains: list(data.domains).map(mapDomain),
          subdomain: {
            id: str(sub._id),
            name: str(sub.name),
            stage: str(sub.stage),
            has_valid_ssl: bool(sub.hasValidSSL)
          }
        };
      }
    ),
    'webflow.get_site_hosting': readHandler(
      'webflow.get_site_hosting',
      SITE_PARAMS,
      function(a) { return '/sites/' + encodeSegment(a.site_short_name) + '/hosting'; },
      null,
      hasArrayKey('pages'),
      function(data) {
        return {
          pages: list(data.pages).map(mapPage),
          redirects: list(data.redirects).map(function(r) {
            r = r || {};
            return {
              from: str(r.from),
              to: str(r.to),
              status_code: num(r.statusCode || 301)
            };
          })
        };
      }
    ),
    'webflow.get_site_pages': readHandler(
      'webflow.get_site_pages',
      SITE_PARAMS,
      function(a) { return '/sites/' + encodeSegment(a.site_short_name) + '/pages'; },
      null,
      arrayGuard,
      function(data) { return { pages: list(data).map(mapPage) }; }
    ),
    'webflow.get_site_permissions': readHandler(
      'webflow.get_site_permissions',
      SITE_PARAMS,
      function(a) { return '/sites/' + encodeSegment(a.site_short_name) + '/permissions'; },
      null,
      objectGuard,
      function(data) { return { permissions: data }; }
    ),
    'webflow.get_workspace': readHandler(
      'webflow.get_workspace',
      WORKSPACE_PARAMS,
      function(a) { return '/workspaces/' + encodeSegment(a.workspace_slug); },
      null,
      objectKey('workspace'),
      function(data) { return { workspace: mapWorkspace(data.workspace) }; }
    ),
    'webflow.get_workspace_billing': readHandler(
      'webflow.get_workspace_billing',
      WORKSPACE_PARAMS,
      function(a) { return '/billing/plans/workspace/' + encodeSegment(a.workspace_slug); },
      null,
      function(data) { return data === null || isObject(data); },
      function(data) { return { plan: mapBillingPlan(data) }; }
    ),
    'webflow.get_workspace_entitlements': readHandler(
      'webflow.get_workspace_entitlements',
      WORKSPACE_PARAMS,
      function(a) { return '/workspaces/' + encodeSegment(a.workspace_slug) + '/entitlements'; },
      null,
      objectGuard,
      function(data) {
        var entitlements = [];
        for (var key in data) {
          if (!Object.prototype.hasOwnProperty.call(data, key)) { continue; }
          var val = data[key] || {};
          entitlements.push({
            feature_id: str((val.feature && val.feature.id) || key),
            display_name: str((val.feature && val.feature.displayName) || key),
            has_access: bool(val.hasAccess),
            limit: num(val.entitlementLimit),
            current_usage: num(val.currentUsage)
          });
        }
        return { entitlements: entitlements };
      }
    ),
    'webflow.get_workspace_permissions': readHandler(
      'webflow.get_workspace_permissions',
      WORKSPACE_PARAMS,
      function(a) { return '/workspaces/' + encodeSegment(a.workspace_slug) + '/permissions'; },
      null,
      objectGuard,
      function(data) { return { permissions: data }; }
    ),
    'webflow.list_folders': readHandler(
      'webflow.list_folders',
      WORKSPACE_PARAMS,
      function(a) { return '/workspaces/' + encodeSegment(a.workspace_slug) + '/folders'; },
      null,
      hasArrayKey('folders'),
      function(data) { return { folders: list(data.folders).map(mapFolder) }; }
    ),
    'webflow.list_site_forms': readHandler(
      'webflow.list_site_forms',
      SITE_PARAMS,
      function(a) { return '/sites/' + encodeSegment(a.site_short_name) + '/forms'; },
      null,
      hasArrayKey('forms'),
      function(data) { return { forms: list(data.forms).map(mapForm) }; }
    ),
    'webflow.list_sites': readHandler(
      'webflow.list_sites',
      LIST_SITES_PARAMS,
      function(a) { return '/workspaces/' + encodeSegment(a.workspace_slug) + '/sites'; },
      function(a) { return [['page', a.page]]; },
      hasArrayKey('sites'),
      function(data) {
        var meta = data.paginationMetadata || {};
        return {
          sites: list(data.sites).map(mapSite),
          total_count: num(meta.totalCount),
          total_pages: num(meta.totalPages),
          page: num(meta.page || 1)
        };
      }
    ),
    'webflow.list_workspace_members': readHandler(
      'webflow.list_workspace_members',
      WORKSPACE_PARAMS,
      function(a) { return '/workspaces/' + encodeSegment(a.workspace_slug) + '/members'; },
      null,
      function(data) { return isObject(data) && Array.isArray(data.members) && Array.isArray(data.invites); },
      function(data) {
        return {
          members: list(data.members).map(mapMember),
          invites: list(data.invites).map(mapInvite)
        };
      }
    ),
    'webflow.list_workspaces': readHandler(
      'webflow.list_workspaces',
      EMPTY_PARAMS,
      function() { return '/workspaces'; },
      null,
      hasArrayKey('workspaces'),
      function(data) { return { workspaces: list(data.workspaces).map(mapWorkspace) }; }
    )
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
            service: WEBFLOW_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerWebflow = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
