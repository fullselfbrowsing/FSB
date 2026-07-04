(function (global) {
  'use strict';

  /**
   * Docker Hub same-origin READ head.
   *
   * Docker Hub's web app exposes the session token through its own
   * https://hub.docker.com/auth/profile endpoint. This handler reads that carrier
   * through executeBoundSpec on the first-party origin, uses it only inside
   * same-origin Docker Hub API specs, and never logs or returns it. Repository
   * create/update/delete stay guarded fail-closed until live mutation-body UAT
   * records the exact body and anti-CSRF requirements.
   */

  var ORIGIN = 'https://hub.docker.com';
  var SERVICE = 'hub.docker.com';
  var API_BASE = ORIGIN;
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var EMPTY_PARAMS = schema({}, []);
  var NAMESPACE_REPOSITORY_PARAMS = schema({
    namespace: { type: 'string', description: 'Namespace (user or organization, e.g., "library" for official images)' },
    repository: { type: 'string', description: 'Repository name (e.g., "nginx")' }
  }, ['namespace', 'repository']);
  var TAG_PARAMS = schema({
    namespace: { type: 'string', description: 'Namespace (e.g., "library" for official images)' },
    repository: { type: 'string', description: 'Repository name (e.g., "nginx")' },
    tag: { type: 'string', description: 'Tag name (e.g., "latest", "alpine")' }
  }, ['namespace', 'repository', 'tag']);
  var USERNAME_PARAMS = schema({
    username: { type: 'string', description: 'Docker Hub username' }
  }, ['username']);
  var LIST_ORGANIZATIONS_PARAMS = schema({
    page: integerSchema('Page number (default 1)', 1),
    page_size: integerSchema('Results per page (default 25, max 100)', 1, 100)
  }, []);
  var LIST_REPOSITORIES_PARAMS = schema({
    namespace: { type: 'string', description: 'Namespace (user or org). Defaults to the authenticated user.' },
    page: integerSchema('Page number (default 1)', 1),
    page_size: integerSchema('Results per page (default 25, max 100)', 1, 100),
    ordering: { type: 'string', enum: ['name', '-name', 'last_updated', '-last_updated'], description: 'Sort order' }
  }, []);
  var LIST_TAGS_PARAMS = schema({
    namespace: { type: 'string', description: 'Namespace (e.g., "library" for official images, or username/org)' },
    repository: { type: 'string', description: 'Repository name (e.g., "nginx")' },
    page: integerSchema('Page number (default 1)', 1),
    page_size: integerSchema('Results per page (default 25, max 100)', 1, 100)
  }, ['namespace', 'repository']);
  var SEARCH_REPOSITORIES_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query' },
    page: integerSchema('Page number (default 1)', 1),
    page_size: integerSchema('Results per page (default 25, max 100)', 1, 100)
  }, ['query']);
  var SEARCH_CATALOG_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query' },
    from: integerSchema('Offset for pagination (default 0)', 0),
    size: integerSchema('Number of results to return (default 25, max 100)', 1, 100),
    type: { type: 'string', enum: ['image', 'model', 'extension'], description: 'Filter by content type' },
    source: { type: 'string', enum: ['official', 'verified_publisher', 'community'], description: 'Filter by source type' }
  }, ['query']);

  var CREATE_REPOSITORY_PARAMS = schema({
    namespace: { type: 'string', description: 'Namespace (user or org). Defaults to the authenticated user.' },
    name: { type: 'string', description: 'Repository name (lowercase, alphanumeric, hyphens, underscores)' },
    description: { type: 'string', description: 'Short description (max 100 chars)' },
    full_description: { type: 'string', description: 'Full description in Markdown' },
    is_private: { type: 'boolean', description: 'Whether the repository is private (default false)' }
  }, ['name']);
  var UPDATE_REPOSITORY_PARAMS = schema({
    namespace: STRING,
    repository: STRING,
    description: { type: 'string', description: 'New short description' },
    full_description: { type: 'string', description: 'New full description in Markdown' },
    is_private: { type: 'boolean', description: 'Change visibility' }
  }, ['namespace', 'repository']);
  var DELETE_REPOSITORY_PARAMS = schema({
    namespace: STRING,
    repository: STRING
  }, ['namespace', 'repository']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

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
      reason: reason || 'dockerhub-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value) {
    return value === true;
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function profileSpec() {
    return {
      url: API_BASE + '/auth/profile',
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function apiSpec(path, pairs, bearerToken) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + bearerToken
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors) ||
      isObject(data.detail)
    );
  }

  function resultData(result, slug, prefix) {
    if (!result || result.success !== true) {
      return fallback(slug, prefix + '-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, prefix + '-http-error');
    }
    if (result.data === undefined || result.data === null || looksLikeError(result.data)) {
      return fallback(slug, prefix + '-shape-mismatch');
    }
    return result.data;
  }

  async function bootstrapAuth(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'dockerhub-execute-bound-spec-unavailable');
    }
    var res = await ctx.executeBoundSpec(profileSpec(), ctx.tabId);
    var data = resultData(res, slug, 'dockerhub-profile');
    if (!data || data.success === false || !isObject(data)) { return data; }
    var profile = isObject(data.profile) ? data.profile : {};
    var username = str(profile.username || data.username);
    var bearerToken = str(data.token);
    if (!username || !bearerToken) {
      return fallback(slug, 'dockerhub-profile-auth-incomplete');
    }
    return { success: true, bearerToken: bearerToken, username: username };
  }

  function mapRepository(r) {
    return {
      name: str(r && r.name),
      namespace: str(r && (r.namespace || r.user)),
      description: str(r && r.description),
      is_private: bool(r && r.is_private),
      star_count: num(r && r.star_count),
      pull_count: num(r && r.pull_count),
      last_updated: str(r && r.last_updated),
      repository_type: str(r && r.repository_type) || 'image',
      status_description: str(r && r.status_description),
      content_types: list(r && r.content_types).map(str)
    };
  }

  function mapRepositoryDetail(r) {
    var categories = list(r && r.categories).map(function(c) {
      return str(c && (c.slug || c.name));
    }).filter(Boolean);
    var permissions = isObject(r && r.permissions) ? r.permissions : {};
    var out = mapRepository(r);
    out.full_description = str(r && r.full_description);
    out.date_registered = str(r && r.date_registered);
    out.hub_user = str(r && r.hub_user);
    out.is_automated = bool(r && r.is_automated);
    out.categories = categories;
    out.permissions = {
      admin: bool(permissions.admin),
      read: bool(permissions.read),
      write: bool(permissions.write)
    };
    return out;
  }

  function mapImage(i) {
    return {
      architecture: str(i && i.architecture) || 'unknown',
      os: str(i && i.os) || 'unknown',
      size: num(i && i.size),
      status: str(i && i.status)
    };
  }

  function mapTag(t) {
    return {
      name: str(t && t.name),
      digest: str(t && t.digest),
      full_size: num(t && t.full_size),
      last_updated: str(t && t.last_updated),
      tag_status: str(t && t.tag_status),
      content_type: str(t && t.content_type),
      media_type: str(t && t.media_type),
      images: list(t && t.images).filter(function(i) {
        return str(i && i.architecture) !== 'unknown';
      }).map(mapImage)
    };
  }

  function mapUser(u) {
    return {
      id: str(u && (u.id || u.uuid)),
      username: str(u && u.username),
      full_name: str(u && u.full_name),
      location: str(u && u.location),
      company: str(u && u.company),
      date_joined: str(u && u.date_joined),
      type: str(u && u.type),
      gravatar_url: str(u && u.gravatar_url)
    };
  }

  function mapOrganization(o) {
    return {
      id: str(o && o.id),
      orgname: str(o && o.orgname),
      full_name: str(o && o.full_name),
      location: str(o && o.location),
      company: str(o && o.company),
      date_joined: str(o && o.date_joined)
    };
  }

  function mapSearchResult(r) {
    return {
      repo_name: str(r && r.repo_name),
      short_description: str(r && r.short_description),
      star_count: num(r && r.star_count),
      pull_count: num(r && r.pull_count),
      is_official: bool(r && r.is_official),
      is_automated: bool(r && r.is_automated)
    };
  }

  function mapCatalogResult(r) {
    return {
      name: str(r && r.name),
      slug: str(r && r.slug),
      type: str(r && r.type),
      source: str(r && r.source),
      short_description: str(r && r.short_description),
      star_count: num(r && r.star_count),
      categories: list(r && r.categories).map(function(c) { return str(c && c.name); }).filter(Boolean),
      updated_at: str(r && r.updated_at)
    };
  }

  function paginated(data, itemKey, mapper) {
    if (!isObject(data) || !Array.isArray(data.results)) { return null; }
    var out = { count: num(data.count) };
    out[itemKey] = data.results.map(mapper);
    return out;
  }

  function objectParser(key, mapper) {
    return function(data) {
      if (!isObject(data) || Array.isArray(data)) { return null; }
      var out = {};
      out[key] = mapper(data);
      return out;
    };
  }

  function readHandler(slug, params, requestForArgs, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var auth = await bootstrapAuth(ctx, slug);
        if (!auth || auth.success !== true) { return auth; }
        var req = requestForArgs(args || {}, auth);
        var res = await ctx.executeBoundSpec(apiSpec(req.path, req.pairs || [], auth.bearerToken), ctx.tabId);
        var data = resultData(res, slug, 'dockerhub-api');
        if (!data || data.success === false) { return data; }
        var parsed = parser(data, auth);
        if (!parsed) { return fallback(slug, 'dockerhub-api-shape-mismatch'); }
        return { success: true, data: parsed };
      }
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, 'dockerhub-mutation-body-uat-required');
      }
    };
  }

  var handlers = {
    'dockerhub.get_current_user': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        var slug = 'dockerhub.get_current_user';
        var auth = await bootstrapAuth(ctx, 'dockerhub.get_current_user');
        if (!auth || auth.success !== true) { return auth; }
        var res = await ctx.executeBoundSpec(apiSpec('/v2/users/' + encodeSegment(auth.username), [], auth.bearerToken), ctx.tabId);
        var data = resultData(res, slug, 'dockerhub-api');
        if (!data || data.success === false) { return data; }
        var parsed = objectParser('user', mapUser)(data);
        if (!parsed) { return fallback(slug, 'dockerhub-api-shape-mismatch'); }
        return { success: true, data: parsed };
      }
    },
    'dockerhub.get_repository': readHandler('dockerhub.get_repository', NAMESPACE_REPOSITORY_PARAMS, function(a) {
      return { path: '/v2/namespaces/' + encodeSegment(a.namespace) + '/repositories/' + encodeSegment(a.repository) };
    }, objectParser('repository', mapRepositoryDetail)),
    'dockerhub.get_tag': readHandler('dockerhub.get_tag', TAG_PARAMS, function(a) {
      return { path: '/v2/namespaces/' + encodeSegment(a.namespace) + '/repositories/' + encodeSegment(a.repository) + '/tags/' + encodeSegment(a.tag) };
    }, objectParser('tag', mapTag)),
    'dockerhub.get_user_profile': readHandler('dockerhub.get_user_profile', USERNAME_PARAMS, function(a) {
      return { path: '/v2/users/' + encodeSegment(a.username) };
    }, objectParser('user', mapUser)),
    'dockerhub.list_organizations': readHandler('dockerhub.list_organizations', LIST_ORGANIZATIONS_PARAMS, function(a) {
      return {
        path: '/v2/user/orgs',
        pairs: [
          ['page', a.page],
          ['page_size', a.page_size === undefined ? 25 : a.page_size]
        ]
      };
    }, function(data) { return paginated(data, 'organizations', mapOrganization); }),
    'dockerhub.list_repositories': readHandler('dockerhub.list_repositories', LIST_REPOSITORIES_PARAMS, function(a, auth) {
      var ns = a.namespace || auth.username;
      return {
        path: '/v2/namespaces/' + encodeSegment(ns) + '/repositories',
        pairs: [
          ['page', a.page],
          ['page_size', a.page_size === undefined ? 25 : a.page_size],
          ['ordering', a.ordering]
        ]
      };
    }, function(data) { return paginated(data, 'repositories', mapRepository); }),
    'dockerhub.list_tags': readHandler('dockerhub.list_tags', LIST_TAGS_PARAMS, function(a) {
      return {
        path: '/v2/namespaces/' + encodeSegment(a.namespace) + '/repositories/' + encodeSegment(a.repository) + '/tags',
        pairs: [
          ['page', a.page],
          ['page_size', a.page_size === undefined ? 25 : a.page_size]
        ]
      };
    }, function(data) { return paginated(data, 'tags', mapTag); }),
    'dockerhub.search_catalog': readHandler('dockerhub.search_catalog', SEARCH_CATALOG_PARAMS, function(a) {
      return {
        path: '/api/search/v3/catalog/search',
        pairs: [
          ['query', a.query],
          ['from', a.from === undefined ? 0 : a.from],
          ['size', a.size === undefined ? 25 : a.size],
          ['type', a.type],
          ['source', a.source]
        ]
      };
    }, function(data) {
      if (!isObject(data) || !Array.isArray(data.results)) { return null; }
      return { total: num(data.total), results: data.results.map(mapCatalogResult) };
    }),
    'dockerhub.search_repositories': readHandler('dockerhub.search_repositories', SEARCH_REPOSITORIES_PARAMS, function(a) {
      return {
        path: '/v2/search/repositories',
        pairs: [
          ['query', a.query],
          ['page', a.page],
          ['page_size', a.page_size === undefined ? 25 : a.page_size]
        ]
      };
    }, function(data) { return paginated(data, 'results', mapSearchResult); }),
    'dockerhub.create_repository': guarded('dockerhub.create_repository', 'write', CREATE_REPOSITORY_PARAMS),
    'dockerhub.update_repository': guarded('dockerhub.update_repository', 'write', UPDATE_REPOSITORY_PARAMS),
    'dockerhub.delete_repository': guarded('dockerhub.delete_repository', 'destructive', DELETE_REPOSITORY_PARAMS)
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
  global.FsbHandlerDockerhub = handlers;

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    Object.keys(handlers).forEach(function(slug) {
      global.FsbCapabilityCatalog.registerHandler(slug, {
        tier: 'T1a',
        handler: handlers[slug],
        origin: ORIGIN,
        descriptor: { slug: slug, service: SERVICE, sideEffectClass: handlers[slug].sideEffectClass || 'read' }
      });
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
