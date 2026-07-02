(function (global) {
  'use strict';

  /**
   * Datadog same-origin GET read head.
   *
   * The vendored Datadog plugin uses relative /api endpoints from
   * app.datadoghq.com. This handler promotes only reviewed GET-backed reads via
   * executeBoundSpec. POST-shaped searches, clone helpers, writes, and deletes
   * remain unregistered until live body/write evidence exists.
   */

  var ORIGIN = 'https://app.datadoghq.com';
  var SERVICE = 'datadoghq.com';
  var MAX_INT = 9007199254740991;

  var STRING = { type: 'string', minLength: 1 };
  var NUMBER = { type: 'number', minimum: -MAX_INT, maximum: MAX_INT };
  var INTEGER = { type: 'integer', minimum: -MAX_INT, maximum: MAX_INT };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);

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

  function integerField(description, minimum, maximum) {
    var out = { type: 'integer', minimum: minimum === undefined ? -MAX_INT : minimum,
      maximum: maximum === undefined ? MAX_INT : maximum, description: description };
    return out;
  }

  function numberField(description) {
    return { type: 'number', minimum: -MAX_INT, maximum: MAX_INT, description: description };
  }

  function booleanField(description) {
    return { type: 'boolean', description: description };
  }

  function stringArrayField(description) {
    return { type: 'array', items: STRING, description: description };
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
      reason: reason || 'datadog-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function encodePath(value) {
    return encodeURIComponent(String(value == null ? '' : value));
  }

  function compactQuery(query) {
    var out = {};
    query = query || {};
    for (var key in query) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) { continue; }
      var value = query[key];
      if (value === undefined || value === null || value === '') { continue; }
      out[key] = value;
    }
    return out;
  }

  function queryString(query) {
    var q = compactQuery(query);
    var parts = [];
    for (var key in q) {
      if (Object.prototype.hasOwnProperty.call(q, key)) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(q[key])));
      }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function buildSpec(path, query) {
    return {
      url: ORIGIN + path + queryString(query),
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

  function guardResult(result, slug, guard) {
    if (!result || result.success !== true) { return result; }
    if (failedHttp(result)) { return fallback(slug, 'datadog-http-auth-or-rot'); }
    var data = result.data;
    if (data === undefined || data === null) {
      return fallback(slug, 'datadog-response-shape-mismatch');
    }
    if (isObject(data) && (Array.isArray(data.errors) || typeof data.error === 'string')) {
      return fallback(slug, 'datadog-api-error-envelope');
    }
    if (typeof guard === 'function' && !guard(data)) {
      return fallback(slug, 'datadog-response-shape-mismatch');
    }
    return result;
  }

  function readHandler(slug, params, pathForArgs, queryForArgs, guard) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'datadog-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var path = typeof pathForArgs === 'function' ? pathForArgs(a) : pathForArgs;
        var query = typeof queryForArgs === 'function' ? queryForArgs(a) : queryForArgs;
        var res = await ctx.executeBoundSpec(buildSpec(path, query || {}), ctx.tabId);
        return guardResult(res, slug, guard);
      }
    };
  }

  function objOrArray(data) {
    return isObject(data) || Array.isArray(data);
  }

  function objectDataOrArray(data) {
    return isObject(data) && (data.data === undefined || isObject(data.data) || Array.isArray(data.data));
  }

  function arrayKey(key) {
    return function(data) { return isObject(data) && (data[key] === undefined || Array.isArray(data[key])); };
  }

  function objectOrArrayKey(key) {
    return function(data) {
      return isObject(data) && (data[key] === undefined || isObject(data[key]) || Array.isArray(data[key]));
    };
  }

  function tracePath(a) {
    var traceId = String(a.trace_id || '');
    if (/^[0-9a-f]+$/i.test(traceId) && traceId.length >= 16 && /[a-f]/i.test(traceId)) {
      traceId = BigInt('0x' + (traceId.replace(/^0+/, '') || '0')).toString();
    }
    return '/api/v1/trace/' + encodePath(traceId);
  }

  var params = {
    dashboardId: schema({ dashboard_id: stringField('Dashboard ID') }, ['dashboard_id']),
    downtimeId: schema({ downtime_id: stringField('Downtime ID') }, ['downtime_id']),
    hostname: schema({ hostname: stringField('Host name') }, ['hostname']),
    hostName: schema({ host_name: stringField('Host name') }, ['host_name']),
    metricName: schema({ metric_name: stringField('Metric name') }, ['metric_name']),
    monitorId: schema({ monitor_id: integerField('Monitor ID') }, ['monitor_id']),
    notebookId: schema({ notebook_id: stringField('Notebook ID') }, ['notebook_id']),
    configName: schema({ config_name: stringField('Configuration name') }, ['config_name']),
    serviceName: schema({ service_name: stringField('Service name') }, ['service_name']),
    serviceDependencies: schema({
      service_name: stringField('Service name'),
      env: stringField('Environment')
    }, ['service_name']),
    sloId: schema({ slo_id: stringField('SLO ID') }, ['slo_id']),
    sloHistory: schema({
      slo_id: stringField('SLO ID'),
      from_ts: numberField('Start timestamp in epoch seconds'),
      to_ts: numberField('End timestamp in epoch seconds')
    }, ['slo_id', 'from_ts', 'to_ts']),
    publicId: schema({ public_id: stringField('Synthetic test public ID') }, ['public_id']),
    traceId: schema({ trace_id: stringField('Trace ID') }, ['trace_id']),
    usageSummary: schema({
      start_month: stringField('Start month ISO timestamp'),
      end_month: stringField('End month ISO timestamp'),
      include_org_details: booleanField('Include child org details')
    }, ['start_month']),
    userId: schema({ user_id: stringField('User ID') }, ['user_id']),
    listDashboards: schema({ filter_shared: booleanField('Filter to shared dashboards') }, []),
    listDowntimes: schema({
      current_only: booleanField('Return only active downtimes'),
      page_limit: integerField('Page size', 1, 100),
      page_offset: integerField('Offset', 0)
    }, []),
    listHosts: schema({
      filter: stringField('Host filter'),
      count: integerField('Number of hosts', 1, 1000),
      start: integerField('Offset', 0),
      sort_field: stringField('Sort field'),
      sort_dir: { type: 'string', enum: ['asc', 'desc'] }
    }, []),
    pageSizeOffset: schema({
      page_size: integerField('Results per page', 1, 100),
      page_offset: integerField('Offset', 0)
    }, []),
    listMetrics: schema({
      query: stringField('Metric name prefix'),
      from: numberField('Active since epoch seconds')
    }, ['query']),
    listMonitors: schema({
      tags: stringField('Comma-separated tags'),
      page: integerField('Page number', 0),
      per_page: integerField('Results per page', 1, 100)
    }, []),
    listNotebooks: schema({
      query: stringField('Notebook search query'),
      count: integerField('Results per page', 1, 100),
      start: integerField('Offset', 0),
      sort_field: { type: 'string', enum: ['modified', 'name'] },
      sort_dir: { type: 'string', enum: ['asc', 'desc'] }
    }, []),
    pageSizeNumber: schema({
      page_size: integerField('Results per page', 1, 100),
      page_number: integerField('Page number', 0)
    }, []),
    listSlos: schema({
      tags: stringField('Comma-separated tags'),
      limit: integerField('Maximum results', 1, 100),
      offset: integerField('Offset', 0)
    }, []),
    listTeams: schema({
      page_size: integerField('Results per page', 1, 100),
      page_number: integerField('Page number', 0),
      filter: stringField('Team name filter')
    }, []),
    listUsers: schema({
      filter: stringField('User filter'),
      page_size: integerField('Results per page', 1, 100),
      page_number: integerField('Page number', 0)
    }, []),
    queryMetrics: schema({
      query: stringField('Metric query'),
      from: numberField('Start timestamp in epoch seconds'),
      to: numberField('End timestamp in epoch seconds')
    }, ['query', 'from', 'to']),
    searchDashboards: schema({
      query: stringField('Search text'),
      limit: integerField('Maximum results', 1, 100)
    }, ['query']),
    searchDashboardsAdvanced: schema({
      query: stringField('Search text'),
      author_handle: stringField('Author handle'),
      limit: integerField('Maximum results', 1, 100)
    }, []),
    searchMonitors: schema({
      query: stringField('Monitor search query'),
      per_page: integerField('Results per page', 1, 100),
      page: integerField('Page number', 0)
    }, ['query']),
    searchNotebooks: schema({
      query: stringField('Notebook search query'),
      count: integerField('Maximum results', 1, 100)
    }, ['query']),
    searchServices: schema({
      query: stringField('Service search query'),
      page_size: integerField('Results per page', 1, 100)
    }, ['query']),
    searchSlos: schema({
      query: stringField('SLO search query'),
      limit: integerField('Maximum results', 1, 100)
    }, ['query'])
  };

  var handlers = {
    'datadog.get_current_user': readHandler('datadog.get_current_user', EMPTY_PARAMS,
      '/api/v2/current_user', null, objectDataOrArray),
    'datadog.get_dashboard': readHandler('datadog.get_dashboard', params.dashboardId,
      function(a) { return '/api/v1/dashboard/' + encodePath(a.dashboard_id); }, null, objOrArray),
    'datadog.get_downtime': readHandler('datadog.get_downtime', params.downtimeId,
      function(a) { return '/api/v2/downtime/' + encodePath(a.downtime_id); }, null, objectDataOrArray),
    'datadog.get_host_info': readHandler('datadog.get_host_info', params.hostname,
      '/api/v1/hosts', function(a) { return { filter: a.hostname, count: 1 }; }, arrayKey('host_list')),
    'datadog.get_host_totals': readHandler('datadog.get_host_totals', EMPTY_PARAMS,
      '/api/v1/hosts/totals', null, objOrArray),
    'datadog.get_incident': readHandler('datadog.get_incident', schema({ incident_id: stringField('Incident ID') }, ['incident_id']),
      function(a) { return '/api/v2/incidents/' + encodePath(a.incident_id); }, null, objectDataOrArray),
    'datadog.get_metric_metadata': readHandler('datadog.get_metric_metadata', params.metricName,
      function(a) { return '/api/v1/metrics/' + encodePath(a.metric_name); }, null, objOrArray),
    'datadog.get_monitor': readHandler('datadog.get_monitor', params.monitorId,
      function(a) { return '/api/v1/monitor/' + encodePath(a.monitor_id); }, null, objOrArray),
    'datadog.get_monitor_groups': readHandler('datadog.get_monitor_groups', params.monitorId,
      function(a) { return '/api/v1/monitor/' + encodePath(a.monitor_id); },
      { group_states: 'all' }, objOrArray),
    'datadog.get_notebook': readHandler('datadog.get_notebook', params.notebookId,
      function(a) { return '/api/v1/notebooks/' + encodePath(a.notebook_id); }, null, objectDataOrArray),
    'datadog.get_org_config': readHandler('datadog.get_org_config', params.configName,
      function(a) { return '/api/v2/org_configs/' + encodePath(a.config_name); }, null, objOrArray),
    'datadog.get_permissions': readHandler('datadog.get_permissions', EMPTY_PARAMS,
      '/api/v2/permissions', null, objectDataOrArray),
    'datadog.get_service_definition': readHandler('datadog.get_service_definition', params.serviceName,
      function(a) { return '/api/v2/services/definitions/' + encodePath(a.service_name); }, null, objectDataOrArray),
    'datadog.get_service_dependencies': readHandler('datadog.get_service_dependencies', params.serviceDependencies,
      function(a) { return '/api/v1/service_dependencies/' + encodePath(a.service_name); },
      function(a) { return { env: a.env || 'production' }; }, objOrArray),
    'datadog.get_slo': readHandler('datadog.get_slo', params.sloId,
      function(a) { return '/api/v1/slo/' + encodePath(a.slo_id); }, null, objectDataOrArray),
    'datadog.get_slo_history': readHandler('datadog.get_slo_history', params.sloHistory,
      function(a) { return '/api/v1/slo/' + encodePath(a.slo_id) + '/history'; },
      function(a) { return { from_ts: a.from_ts, to_ts: a.to_ts }; }, objectDataOrArray),
    'datadog.get_synthetics_results': readHandler('datadog.get_synthetics_results', params.publicId,
      function(a) { return '/api/v1/synthetics/tests/' + encodePath(a.public_id) + '/results'; }, null, arrayKey('results')),
    'datadog.get_synthetics_test': readHandler('datadog.get_synthetics_test', params.publicId,
      function(a) { return '/api/v1/synthetics/tests/' + encodePath(a.public_id); }, null, objOrArray),
    'datadog.get_trace': readHandler('datadog.get_trace', params.traceId,
      tracePath, null, objOrArray),
    'datadog.get_usage_summary': readHandler('datadog.get_usage_summary', params.usageSummary,
      '/api/v1/usage/summary',
      function(a) { return { start_month: a.start_month, end_month: a.end_month,
        include_org_details: a.include_org_details }; }, objOrArray),
    'datadog.get_user': readHandler('datadog.get_user', params.userId,
      function(a) { return '/api/v2/users/' + encodePath(a.user_id); }, null, objectDataOrArray),
    'datadog.list_api_keys': readHandler('datadog.list_api_keys', EMPTY_PARAMS,
      '/api/v2/api_keys', null, objectDataOrArray),
    'datadog.list_dashboards': readHandler('datadog.list_dashboards', params.listDashboards,
      '/api/v1/dashboard', function(a) { return { 'filter[shared]': a.filter_shared }; }, arrayKey('dashboards')),
    'datadog.list_downtimes': readHandler('datadog.list_downtimes', params.listDowntimes,
      '/api/v2/downtime',
      function(a) { return { 'page[limit]': a.page_limit || 25, 'page[offset]': a.page_offset || 0,
        current_only: a.current_only === true ? true : undefined }; }, objectDataOrArray),
    'datadog.list_host_tags': readHandler('datadog.list_host_tags', params.hostName,
      function(a) { return '/api/v1/tags/hosts/' + encodePath(a.host_name); }, null, arrayKey('tags')),
    'datadog.list_hosts': readHandler('datadog.list_hosts', params.listHosts,
      '/api/v1/hosts',
      function(a) { return { count: a.count || 100, start: a.start || 0, filter: a.filter,
        sort_field: a.sort_field, sort_dir: a.sort_dir }; }, arrayKey('host_list')),
    'datadog.list_incidents': readHandler('datadog.list_incidents', params.pageSizeOffset,
      '/api/v2/incidents',
      function(a) { return { 'page[size]': a.page_size || 25, 'page[offset]': a.page_offset || 0 }; },
      objectDataOrArray),
    'datadog.list_metric_tags': readHandler('datadog.list_metric_tags', params.metricName,
      function(a) { return '/api/ui/metrics/all-tags/' + encodePath(a.metric_name); }, null, arrayKey('tags')),
    'datadog.list_metrics': readHandler('datadog.list_metrics', params.listMetrics,
      '/api/v1/metrics',
      function(a) { return { q: a.query, from: a.from || (Math.floor(Date.now() / 1000) - 3600) }; },
      arrayKey('metrics')),
    'datadog.list_monitor_downtimes': readHandler('datadog.list_monitor_downtimes', params.monitorId,
      function(a) { return '/api/v1/monitor/' + encodePath(a.monitor_id); },
      { with_downtimes: true }, objOrArray),
    'datadog.list_monitor_tags': readHandler('datadog.list_monitor_tags', EMPTY_PARAMS,
      '/api/v1/monitor/tags', null, arrayKey('tags')),
    'datadog.list_monitors': readHandler('datadog.list_monitors', params.listMonitors,
      '/api/v1/monitor',
      function(a) { return { page: a.page || 0, per_page: a.per_page || 50, tags: a.tags }; },
      function(data) { return Array.isArray(data); }),
    'datadog.list_notebooks': readHandler('datadog.list_notebooks', params.listNotebooks,
      '/api/v1/notebooks',
      function(a) { return { count: a.count || 25, start: a.start || 0,
        sort_field: a.sort_field || 'modified', sort_dir: a.sort_dir || 'desc', query: a.query }; },
      objectDataOrArray),
    'datadog.list_services': readHandler('datadog.list_services', params.pageSizeNumber,
      '/api/v2/services/definitions',
      function(a) { return { 'page[size]': a.page_size || 25, 'page[number]': a.page_number || 0 }; },
      objectDataOrArray),
    'datadog.list_slo_corrections': readHandler('datadog.list_slo_corrections', EMPTY_PARAMS,
      '/api/v1/slo/correction', null, objectDataOrArray),
    'datadog.list_slos': readHandler('datadog.list_slos', params.listSlos,
      '/api/v1/slo',
      function(a) { return { limit: a.limit || 25, offset: a.offset || 0, tags_filter: a.tags }; },
      objectDataOrArray),
    'datadog.list_synthetics_tests': readHandler('datadog.list_synthetics_tests', params.pageSizeNumber,
      '/api/v1/synthetics/tests',
      function(a) { return { page_size: a.page_size || 25, page_number: a.page_number || 0 }; },
      arrayKey('tests')),
    'datadog.list_teams': readHandler('datadog.list_teams', params.listTeams,
      '/api/v2/team',
      function(a) { return { 'page[size]': a.page_size || 25, 'page[number]': a.page_number || 0,
        'filter[keyword]': a.filter }; }, objectDataOrArray),
    'datadog.list_users': readHandler('datadog.list_users', params.listUsers,
      '/api/v2/users',
      function(a) { return { 'page[size]': a.page_size || 25, 'page[number]': a.page_number || 0,
        filter: a.filter }; }, objectDataOrArray),
    'datadog.query_metrics': readHandler('datadog.query_metrics', params.queryMetrics,
      '/api/v1/query',
      function(a) { return { from: a.from, to: a.to, query: a.query }; }, arrayKey('series')),
    'datadog.search_dashboards': readHandler('datadog.search_dashboards', params.searchDashboards,
      '/api/v1/dashboard', null, arrayKey('dashboards')),
    'datadog.search_dashboards_advanced': readHandler('datadog.search_dashboards_advanced', params.searchDashboardsAdvanced,
      '/api/v1/dashboard', null, arrayKey('dashboards')),
    'datadog.search_monitors': readHandler('datadog.search_monitors', params.searchMonitors,
      '/api/v1/monitor/search',
      function(a) { return { query: a.query, per_page: a.per_page || 25, page: a.page || 0 }; },
      objectOrArrayKey('monitors')),
    'datadog.search_notebooks': readHandler('datadog.search_notebooks', params.searchNotebooks,
      '/api/v1/notebooks',
      function(a) { return { query: a.query, count: a.count || 25, sort_field: 'modified', sort_dir: 'desc' }; },
      objectDataOrArray),
    'datadog.search_services': readHandler('datadog.search_services', params.searchServices,
      '/api/v2/services/definitions',
      function(a) { return { 'page[size]': a.page_size || 25, 'filter[query]': a.query }; },
      objectDataOrArray),
    'datadog.search_slos': readHandler('datadog.search_slos', params.searchSlos,
      '/api/v1/slo',
      function(a) { return { query: a.query, limit: a.limit || 25 }; }, objectDataOrArray)
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

  global.FsbHandlerDatadog = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
