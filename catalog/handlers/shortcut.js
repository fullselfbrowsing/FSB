(function (global) {
  'use strict';

  /**
   * Shortcut same-origin READ head.
   *
   * Shortcut's vendored runtime first resolves the active workspace slug through
   * /backend/api/private/user/slug-info/<slug>, then sends Tenant-* headers to
   * /backend/api/v3. This handler ports only the no-param read endpoints and derives
   * the slug from the authoritative active tab URL threaded by the router.
   */

  var SHORTCUT_ORIGIN = 'https://app.shortcut.com';
  var SHORTCUT_API_BASE = SHORTCUT_ORIGIN + '/backend/api/v3';
  var SHORTCUT_SLUG_INFO_BASE = SHORTCUT_ORIGIN + '/backend/api/private/user/slug-info/';
  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };

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
    if (!ctx || typeof ctx !== 'object') { return ''; }
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function workspaceSlugFromContext(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    if (!activeUrl) { return ''; }
    try {
      var parsed = new URL(activeUrl);
      if (parsed.origin !== SHORTCUT_ORIGIN) { return ''; }
      var parts = parsed.pathname.split('/').filter(Boolean);
      var slug = parts.length ? parts[0] : '';
      if (!slug || slug === 'signup' || slug === 'login') { return ''; }
      return slug;
    } catch (e) {
      return '';
    }
  }

  function buildGetSpec(url, headers) {
    var h = { 'Accept': 'application/json' };
    var extra = headers || {};
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) { h[k] = extra[k]; }
    }
    return {
      url: url,
      method: 'GET',
      headers: h,
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: SHORTCUT_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function guardResult(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = kind === 'array'
      ? Array.isArray(data)
      : !!data && typeof data === 'object' && !Array.isArray(data) && !looksLikeError(data)
        && (typeof data.id === 'string' || typeof data.id === 'number');
    if (!ok) {
      return fallback(slug, 'shortcut-logged-out-or-rot');
    }
    return result;
  }

  function parseShortcutAuth(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var workspaceId = data && data.id;
    var organizationId = data && data.organization2 && data.organization2.id;
    if (!workspaceId || !organizationId || looksLikeError(data)) {
      return fallback(slug, 'shortcut-auth-bootstrap-unavailable');
    }
    return {
      success: true,
      workspaceId: String(workspaceId),
      organizationId: String(organizationId)
    };
  }

  async function bootstrapAuth(ctx, workspaceSlug, slug) {
    var spec = buildGetSpec(SHORTCUT_SLUG_INFO_BASE + encodeURIComponent(workspaceSlug));
    var res = await ctx.executeBoundSpec(spec, ctx.tabId);
    return parseShortcutAuth(res, slug);
  }

  function buildApiSpec(path, auth) {
    return buildGetSpec(SHORTCUT_API_BASE + path, {
      'Content-Type': 'application/json',
      'Tenant-Organization2': auth.organizationId,
      'Tenant-Workspace2': auth.workspaceId
    });
  }

  function readHandler(slug, path, kind) {
    return {
      tier: 'T1a',
      origin: SHORTCUT_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'shortcut-execute-bound-spec-unavailable');
        }
        var workspaceSlug = workspaceSlugFromContext(ctx);
        if (!workspaceSlug) {
          return fallback(slug, 'shortcut-workspace-slug-unavailable');
        }
        var auth = await bootstrapAuth(ctx, workspaceSlug, slug);
        if (!auth || auth.success !== true) { return auth; }
        var res = await ctx.executeBoundSpec(buildApiSpec(path, auth), ctx.tabId);
        return guardResult(res, slug, kind);
      }
    };
  }

  var handlers = {
    'shortcut.get_current_user': readHandler('shortcut.get_current_user', '/member', 'object'),
    'shortcut.list_epics': readHandler('shortcut.list_epics', '/epics', 'array'),
    'shortcut.list_iterations': readHandler('shortcut.list_iterations', '/iterations', 'array'),
    'shortcut.list_labels': readHandler('shortcut.list_labels', '/labels', 'array'),
    'shortcut.list_members': readHandler('shortcut.list_members', '/members', 'array'),
    'shortcut.list_objectives': readHandler('shortcut.list_objectives', '/objectives', 'array'),
    'shortcut.list_teams': readHandler('shortcut.list_teams', '/groups', 'array'),
    'shortcut.list_workflows': readHandler('shortcut.list_workflows', '/workflows', 'array')
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
          descriptor: { slug: slug, service: 'app.shortcut.com', sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerShortcut = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
