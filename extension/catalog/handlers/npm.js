(function (global) {
  'use strict';

  /**
   * npm same-origin public READ head.
   *
   * npmjs.com returns page JSON for public package, organization, user, and search
   * pages when the first-party x-spiferack header is present. Auth-only rows that
   * depend on page globals or private settings pages are intentionally not registered
   * here.
   */

  var NPM_ORIGIN = 'https://www.npmjs.com';
  var NPM_SERVICE = 'www.npmjs.com';
  var INT_LIMIT = 9007199254740991;

  var NAME_PARAMS = stringParams('name', 'npm package or organization name');
  var USERNAME_PARAMS = stringParams('username', 'npm username');
  var USERNAME_PAGE_PARAMS = withProps({
    username: { type: 'string', description: 'npm username' },
    page: integerSchema('Page number for pagination (default 0)', 0)
  }, ['username']);
  var VERSION_PARAMS = withProps({
    name: { type: 'string', description: 'Package name' },
    version: { type: 'string', description: 'Package version' }
  }, ['name', 'version']);
  var ORG_PARAMS = withProps({
    name: { type: 'string', description: 'Organization name' },
    page: integerSchema('Page number for packages pagination (default 0)', 0)
  }, ['name']);
  var SEARCH_PARAMS = withProps({
    query: { type: 'string', description: 'Search query text with optional qualifiers' },
    page: integerSchema('Page number for pagination (default 0)', 0)
  }, ['query']);

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
      reason: reason || 'npm-spiferack-shape-mismatch',
      fellBackToDom: true
    });
  }

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function stringParams(name, description) {
    var props = {};
    props[name] = { type: 'string', description: description };
    return withProps(props, [name]);
  }

  function withProps(properties, required) {
    return {
      type: 'object',
      properties: properties,
      required: required || [],
      additionalProperties: false
    };
  }

  function pathSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function packagePath(name) {
    return '/package/' + String(name || '').split('/').map(pathSegment).join('/');
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

  function buildGetSpec(path, pairs) {
    return {
      url: NPM_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-spiferack': '1'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: NPM_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors)
        || (data.error && typeof data.error === 'object'));
  }

  function hasObject(data, key) {
    return !!data && data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]);
  }

  function hasPackageData(data) {
    return hasObject(data, 'packageVersion') || hasObject(data, 'capsule') || hasObject(data, 'packument')
      || Object.prototype.hasOwnProperty.call(data, 'readme')
      || Object.prototype.hasOwnProperty.call(data, 'downloads')
      || Object.prototype.hasOwnProperty.call(data, 'dependents');
  }

  function hasProfileData(data) {
    return hasObject(data, 'scope') || hasObject(data, 'packages') || hasObject(data, 'orgs');
  }

  function hasSearchData(data) {
    return !!data && Array.isArray(data.objects);
  }

  function guardResult(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeError(data)) {
      return fallback(slug, 'npm-spiferack-shape-mismatch');
    }
    var ok = false;
    if (kind === 'package') { ok = hasPackageData(data); }
    else if (kind === 'profile' || kind === 'organization') { ok = hasProfileData(data); }
    else if (kind === 'search') { ok = hasSearchData(data); }
    else { ok = true; }
    return ok ? result : fallback(slug, 'npm-spiferack-shape-mismatch');
  }

  function readHandler(slug, params, requestForArgs, kind) {
    return {
      tier: 'T1a',
      origin: NPM_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'npm-execute-bound-spec-unavailable');
        }
        var req = requestForArgs(args || {});
        var res = await ctx.executeBoundSpec(buildGetSpec(req.path, req.query), ctx.tabId);
        return guardResult(res, slug, kind);
      }
    };
  }

  function packageRequest(args) {
    return { path: packagePath(args.name), query: [] };
  }

  function packageVersionRequest(args) {
    return { path: packagePath(args.name) + '/v/' + pathSegment(args.version), query: [] };
  }

  function packageVersionsRequest(args) {
    return { path: packagePath(args.name), query: [['activeTab', 'versions']] };
  }

  function orgRequest(args) {
    return { path: '/org/' + pathSegment(args.name), query: [['page', args.page === undefined ? 0 : args.page]] };
  }

  function userProfileRequest(args) {
    return { path: '/~' + pathSegment(args.username), query: [] };
  }

  function userPackagesRequest(args) {
    return { path: '/~' + pathSegment(args.username), query: [['page', args.page === undefined ? 0 : args.page]] };
  }

  function searchRequest(args) {
    return { path: '/search', query: [['q', args.query], ['page', args.page === undefined ? 0 : args.page]] };
  }

  var handlers = {
    'npm.get_organization': readHandler('npm.get_organization', ORG_PARAMS, orgRequest, 'organization'),
    'npm.get_package': readHandler('npm.get_package', NAME_PARAMS, packageRequest, 'package'),
    'npm.get_package_dependencies': readHandler('npm.get_package_dependencies', NAME_PARAMS, packageRequest, 'package'),
    'npm.get_package_dependents': readHandler('npm.get_package_dependents', NAME_PARAMS, packageRequest, 'package'),
    'npm.get_package_downloads': readHandler('npm.get_package_downloads', NAME_PARAMS, packageRequest, 'package'),
    'npm.get_package_readme': readHandler('npm.get_package_readme', NAME_PARAMS, packageRequest, 'package'),
    'npm.get_package_version': readHandler('npm.get_package_version', VERSION_PARAMS, packageVersionRequest, 'package'),
    'npm.get_package_versions': readHandler('npm.get_package_versions', NAME_PARAMS, packageVersionsRequest, 'package'),
    'npm.get_user_packages': readHandler('npm.get_user_packages', USERNAME_PAGE_PARAMS, userPackagesRequest, 'profile'),
    'npm.get_user_profile': readHandler('npm.get_user_profile', USERNAME_PARAMS, userProfileRequest, 'profile'),
    'npm.search_packages': readHandler('npm.search_packages', SEARCH_PARAMS, searchRequest, 'search')
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
          descriptor: { slug: slug, service: NPM_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerNpm = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
