(function (global) {
  'use strict';

  /**
   * Grafana same-origin READ head.
   *
   * The vendored Grafana slice exposes only dashboard and metric read operations
   * against grafana.com. This handler keeps those rows GET-only and same-origin;
   * dashboard mutations stay absent because there is no live mutation-body evidence.
   */

  var ORIGIN = 'https://grafana.com';
  var SERVICE = 'grafana.com';
  var API_BASE = ORIGIN + '/api';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var LIST_DASHBOARDS_PARAMS = schema({
    folder: { type: 'string', description: 'Folder ID or title to filter by' },
    tag: { type: 'string', description: 'Dashboard tag to filter by' },
    limit: integerField('Maximum number of dashboards to return', 1, 100)
  }, []);
  var GET_DASHBOARD_PARAMS = schema({
    uid: { type: 'string', minLength: 1, description: 'The dashboard UID to fetch' }
  }, ['uid']);
  var QUERY_METRICS_PARAMS = schema({
    datasource: { type: 'string', minLength: 1, description: 'The data source UID or name to query' },
    query: { type: 'string', minLength: 1, description: 'The query expression' },
    from: STRING,
    to: STRING
  }, ['datasource', 'query']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integerField(description, min, max) {
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
      reason: reason || 'grafana-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
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

  function getSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function failedHttp(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected ||
      status === 401 || status === 403 || status >= 400;
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function guardResult(result, slug, accepts) {
    if (!result || result.success !== true) { return result; }
    if (failedHttp(result)) { return fallback(slug, 'grafana-http-auth-or-rot'); }
    var data = result.data;
    if (data === undefined || data === null || looksLikeError(data)) {
      return fallback(slug, 'grafana-api-shape-mismatch');
    }
    if (typeof accepts === 'function' && !accepts(data)) {
      return fallback(slug, 'grafana-api-shape-mismatch');
    }
    return result;
  }

  function acceptsDashboardList(data) {
    return Array.isArray(data) ||
      (isObject(data) && (
        Array.isArray(data.dashboards) ||
        Array.isArray(data.results) ||
        Array.isArray(data.hits)
      ));
  }

  function acceptsDashboardDetail(data) {
    return isObject(data) && isObject(data.dashboard);
  }

  function acceptsMetricsResult(data) {
    return isObject(data) && (
      Array.isArray(data.series) ||
      Array.isArray(data.frames) ||
      Array.isArray(data.results) ||
      isObject(data.results)
    );
  }

  function isReadOnlyMetricQuery(value) {
    var raw = String(value || '').trim();
    if (!raw || raw.length > 4096) { return false; }
    if (/;\s*\S/.test(raw)) { return false; }
    if (/\b(ALTER|ATTACH|CALL|CREATE|DELETE|DETACH|DROP|EXEC|GRANT|INSERT|MERGE|OPTIMIZE|REPLACE|REVOKE|TRUNCATE|UPDATE|VACUUM)\b/i.test(raw)) {
      return false;
    }
    return true;
  }

  function readHandler(slug, params, buildSpec, accepts) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'grafana-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(buildSpec(args || {}), ctx.tabId);
        return guardResult(res, slug, accepts);
      }
    };
  }

  var handlers = {
    'grafana.list_dashboards': readHandler('grafana.list_dashboards', LIST_DASHBOARDS_PARAMS, function(a) {
      return getSpec('/search', [
        ['folder', a.folder],
        ['tag', a.tag],
        ['limit', a.limit]
      ]);
    }, acceptsDashboardList),
    'grafana.get_dashboard': readHandler('grafana.get_dashboard', GET_DASHBOARD_PARAMS, function(a) {
      return getSpec('/dashboards/uid/' + encodeSegment(a.uid), []);
    }, acceptsDashboardDetail),
    'grafana.query_metrics': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: QUERY_METRICS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        if (!isReadOnlyMetricQuery(a.query)) {
          return fallback('grafana.query_metrics', 'grafana-read-only-query-required');
        }
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('grafana.query_metrics', 'grafana-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(getSpec('/ds/query', [
          ['datasource', a.datasource],
          ['query', a.query],
          ['from', a.from],
          ['to', a.to]
        ]), ctx.tabId);
        return guardResult(res, 'grafana.query_metrics', acceptsMetricsResult);
      }
    }
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

  global.FsbHandlerGrafana = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
