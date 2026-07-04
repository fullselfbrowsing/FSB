(function(global) {
  'use strict';

  /**
   * PostHog same-origin API head.
   *
   * The imported PostHog slice uses first-party /api endpoints from the web app.
   * This handler promotes reviewed GET-backed reads through executeBoundSpec.
   * Write, delete, and POST query rows remain guarded until live body UAT exists.
   */

  var ORIGIN = 'https://us.posthog.com';
  var SERVICE = 'us.posthog.com';
  var MAX_INT = 9007199254740991;

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
    return { type: 'string', description: description };
  }

  function integerField(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -MAX_INT : min,
      maximum: max === undefined ? MAX_INT : max,
      description: description
    };
  }

  function booleanField(description) {
    return { type: 'boolean', description: description };
  }

  function stringArrayField(description) {
    return { type: 'array', items: { type: 'string' }, description: description };
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
      reason: reason || 'posthog-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function activeUrlFromContext(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function bootstrapPath(ctx) {
    try {
      var parsed = new URL(activeUrlFromContext(ctx) || ORIGIN + '/');
      if (parsed.origin === ORIGIN) { return (parsed.pathname || '/') + (parsed.search || ''); }
    } catch (e) {
      return '/';
    }
    return '/';
  }

  function buildSpec(path, query) {
    return {
      url: ORIGIN + path + queryString(query || {}),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function bootstrapSpec(ctx) {
    var spec = buildSpec(bootstrapPath(ctx), {});
    spec.headers = { 'Accept': 'text/html,application/json' };
    return spec;
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) { appendQuery(parts, key, value[i]); }
      return;
    }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function queryString(query) {
    var parts = [];
    for (var key in query) {
      if (Object.prototype.hasOwnProperty.call(query, key)) { appendQuery(parts, key, query[key]); }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (result.data !== undefined) {
      try { return JSON.stringify(result.data); } catch (e) { return ''; }
    }
    return '';
  }

  function parseFirst(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].exec(text);
      if (m && m[1]) { return String(m[1]); }
    }
    return '';
  }

  function parseBootstrap(text) {
    text = String(text || '');
    var teamId = parseFirst(text, [
      /["']current_team["']\s*:\s*\{[\s\S]{0,4000}?["']id["']\s*:\s*(\d+)/,
      /POSTHOG_APP_CONTEXT[\s\S]{0,4000}?current_team[\s\S]{0,1000}?["']id["']\s*:\s*(\d+)/,
      /\/api\/(?:environments|projects)\/(\d+)\//
    ]);
    var orgId = parseFirst(text, [
      /["']current_project["']\s*:\s*\{[\s\S]{0,4000}?["']organization_id["']\s*:\s*["']([^"']+)["']/,
      /POSTHOG_APP_CONTEXT[\s\S]{0,5000}?organization_id["']?\s*:\s*["']([^"']+)["']/,
      /\/api\/organizations\/([0-9a-f-]{16,})\/projects\//
    ]);
    return {
      teamId: /^[0-9]+$/.test(teamId) ? teamId : '',
      orgId: /^[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/.test(orgId) ? orgId : ''
    };
  }

  function failedHttp(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected ||
      status === 401 || status === 403 || status >= 400;
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.detail === 'string' ||
      typeof data.error === 'string' ||
      typeof data.message === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function guardResult(result, slug, expected) {
    if (!result || result.success !== true) { return result; }
    if (failedHttp(result)) { return fallback(slug, 'posthog-http-auth-or-rot'); }
    var data = result.data;
    if (looksLikeError(data)) { return fallback(slug, 'posthog-api-error-envelope'); }
    if (expected === 'object' && !isObject(data)) { return fallback(slug, 'posthog-object-shape-mismatch'); }
    if (expected === 'paginated' && (!isObject(data) || (data.results !== undefined && !Array.isArray(data.results)))) {
      return fallback(slug, 'posthog-paginated-shape-mismatch');
    }
    return result;
  }

  async function bootstrap(ctx, slug, need) {
    var res = await ctx.executeBoundSpec(bootstrapSpec(ctx), ctx.tabId);
    if (failedHttp(res)) { return { error: fallback(slug, 'posthog-bootstrap-auth-or-rot') }; }
    var auth = parseBootstrap(textFromResult(res));
    if (need === 'team' && !auth.teamId) { return { error: fallback(slug, 'posthog-bootstrap-team-unavailable') }; }
    if (need === 'org' && !auth.orgId) { return { error: fallback(slug, 'posthog-bootstrap-org-unavailable') }; }
    return auth;
  }

  function readHandler(slug, params, need, buildPath, buildQuery, expected) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'posthog-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var auth = {};
        if (need) {
          auth = await bootstrap(ctx, slug, need);
          if (auth && auth.error) { return auth.error; }
        }
        var path = typeof buildPath === 'function' ? buildPath(a, auth) : buildPath;
        var query = typeof buildQuery === 'function' ? buildQuery(a, auth) : (buildQuery || {});
        var res = await ctx.executeBoundSpec(buildSpec(path, query), ctx.tabId);
        return guardResult(res, slug, expected || 'object');
      }
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, 'unverified-' + slug.replace(/\./g, '-') + '-body');
      }
    };
  }

  var params = {
    actionId: schema({ action_id: integerField('Action ID') }, ['action_id']),
    cohortId: schema({ cohort_id: integerField('Cohort ID') }, ['cohort_id']),
    dashboardId: schema({ dashboard_id: integerField('Dashboard ID') }, ['dashboard_id']),
    experimentId: schema({ experiment_id: integerField('Experiment ID') }, ['experiment_id']),
    flagId: schema({ flag_id: integerField('Feature flag ID') }, ['flag_id']),
    insightId: schema({ insight_id: integerField('Insight ID') }, ['insight_id']),
    annotationId: schema({ annotation_id: integerField('Annotation ID') }, ['annotation_id']),
    personId: schema({ person_id: integerField('Person internal ID') }, ['person_id']),
    projectId: schema({ project_id: integerField('Project ID') }, ['project_id']),
    surveyId: schema({ survey_id: stringField('Survey UUID') }, ['survey_id']),
    pagination: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0)
    }, []),
    annotations: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0),
      search: stringField('Search annotations by content')
    }, []),
    featureFlags: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0),
      active: stringField('Filter by active status'),
      search: stringField('Search by flag key or name')
    }, []),
    insights: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0),
      short_id: stringField('Filter by short ID'),
      saved: booleanField('Filter by saved status')
    }, []),
    events: schema({
      event: stringField('Filter by event name'),
      person_id: stringField('Filter by person distinct ID'),
      after: stringField('Only return events after this timestamp'),
      before: stringField('Only return events before this timestamp'),
      limit: integerField('Maximum events to return', 1, 100)
    }, []),
    persons: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0),
      search: stringField('Search by name, email, or distinct ID'),
      distinct_id: stringField('Filter by exact distinct ID')
    }, []),
    propertyDefinitions: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0),
      type: { type: 'string', enum: ['event', 'person', 'group'], description: 'Property type filter' },
      search: stringField('Search property names by substring')
    }, []),
    surveys: schema({
      limit: integerField('Results per page', 1, 100),
      offset: integerField('Pagination offset', 0),
      archived: booleanField('Filter by archived status')
    }, []),
    createAnnotation: schema({
      content: stringField('Annotation text content'),
      date_marker: stringField('ISO 8601 timestamp the annotation marks'),
      scope: stringField('Annotation scope')
    }, ['content', 'date_marker']),
    createDashboard: schema({
      name: stringField('Dashboard name'),
      description: stringField('Dashboard description'),
      pinned: booleanField('Whether to pin the dashboard'),
      tags: stringArrayField('Tags to attach')
    }, ['name']),
    createExperiment: schema({
      name: stringField('Experiment name'),
      description: stringField('Description'),
      feature_flag_key: stringField('Key for the associated feature flag')
    }, ['name', 'feature_flag_key']),
    createFeatureFlag: schema({
      key: stringField('Unique flag key'),
      name: stringField('Human-readable name'),
      active: booleanField('Whether to activate immediately'),
      rollout_percentage: integerField('Percentage of users to roll out to', 0, 100),
      ensure_experience_continuity: booleanField('Persist flag value per user')
    }, ['key']),
    createInsight: schema({
      name: stringField('Insight name'),
      description: stringField('Insight description'),
      query: stringField('HogQL query string for the insight'),
      dashboard_id: integerField('Dashboard ID to add the insight to'),
      tags: stringArrayField('Tags to attach')
    }, ['query']),
    runQuery: schema({ query: stringField('HogQL query string') }, ['query']),
    runTrendsQuery: schema({
      event: stringField('Event name to trend'),
      math: { type: 'string', enum: ['total', 'dau', 'weekly_active', 'monthly_active', 'unique_group', 'avg', 'sum', 'min', 'max', 'median', 'p90', 'p95', 'p99'] },
      math_property: stringField('Property to aggregate'),
      date_from: stringField('Start date'),
      date_to: stringField('End date'),
      interval: { type: 'string', enum: ['hour', 'day', 'week', 'month'] },
      breakdown: stringField('Property name to break down by'),
      breakdown_type: { type: 'string', enum: ['event', 'person', 'session', 'group', 'hogql'] }
    }, ['event']),
    updateDashboard: schema({
      dashboard_id: integerField('Dashboard ID'),
      name: stringField('New name'),
      description: stringField('New description'),
      pinned: booleanField('Whether to pin'),
      tags: stringArrayField('New tags')
    }, ['dashboard_id']),
    updateFeatureFlag: schema({
      flag_id: integerField('Feature flag ID'),
      name: stringField('New name'),
      active: booleanField('Active status'),
      rollout_percentage: integerField('Rollout percentage', 0, 100),
      ensure_experience_continuity: booleanField('Persist flag value per user')
    }, ['flag_id']),
    updateInsight: schema({
      insight_id: integerField('Insight ID'),
      name: stringField('New name'),
      description: stringField('New description'),
      favorited: booleanField('Favorite status'),
      tags: stringArrayField('New tags')
    }, ['insight_id'])
  };

  function teamPath(prefix, suffix) {
    return function(_a, auth) { return '/api/' + prefix + '/' + encodeSegment(auth.teamId) + '/' + suffix; };
  }

  function teamEntityPath(prefix, collection, idKey) {
    return function(a, auth) {
      return '/api/' + prefix + '/' + encodeSegment(auth.teamId) + '/' + collection + '/' + encodeSegment(a[idKey]) + '/';
    };
  }

  function orgProjectPath(a, auth) {
    return '/api/organizations/' + encodeSegment(auth.orgId) + '/projects/' + encodeSegment(a.project_id) + '/';
  }

  function orgProjectsPath(_a, auth) {
    return '/api/organizations/' + encodeSegment(auth.orgId) + '/projects/';
  }

  var handlers = {
    'posthog.get_current_user': readHandler('posthog.get_current_user', EMPTY_PARAMS, null,
      '/api/users/@me/', null, 'object'),
    'posthog.get_organization': readHandler('posthog.get_organization', EMPTY_PARAMS, null,
      '/api/organizations/@current/', null, 'object'),
    'posthog.list_projects': readHandler('posthog.list_projects', params.pagination, 'org',
      orgProjectsPath, function(a) { return { limit: a.limit, offset: a.offset }; }, 'paginated'),
    'posthog.get_project': readHandler('posthog.get_project', params.projectId, 'org',
      orgProjectPath, null, 'object'),
    'posthog.list_dashboards': readHandler('posthog.list_dashboards', params.pagination, 'team',
      teamPath('environments', 'dashboards/'), function(a) { return { limit: a.limit, offset: a.offset }; }, 'paginated'),
    'posthog.get_dashboard': readHandler('posthog.get_dashboard', params.dashboardId, 'team',
      teamEntityPath('environments', 'dashboards', 'dashboard_id'), null, 'object'),
    'posthog.list_insights': readHandler('posthog.list_insights', params.insights, 'team',
      teamPath('environments', 'insights/'), function(a) {
        return { limit: a.limit, offset: a.offset, short_id: a.short_id, saved: a.saved };
      }, 'paginated'),
    'posthog.get_insight': readHandler('posthog.get_insight', params.insightId, 'team',
      teamEntityPath('environments', 'insights', 'insight_id'), null, 'object'),
    'posthog.list_feature_flags': readHandler('posthog.list_feature_flags', params.featureFlags, 'team',
      teamPath('projects', 'feature_flags/'), function(a) {
        return { limit: a.limit, offset: a.offset, active: a.active, search: a.search };
      }, 'paginated'),
    'posthog.get_feature_flag': readHandler('posthog.get_feature_flag', params.flagId, 'team',
      teamEntityPath('projects', 'feature_flags', 'flag_id'), null, 'object'),
    'posthog.list_experiments': readHandler('posthog.list_experiments', params.pagination, 'team',
      teamPath('projects', 'experiments/'), function(a) { return { limit: a.limit, offset: a.offset }; }, 'paginated'),
    'posthog.get_experiment': readHandler('posthog.get_experiment', params.experimentId, 'team',
      teamEntityPath('projects', 'experiments', 'experiment_id'), null, 'object'),
    'posthog.list_annotations': readHandler('posthog.list_annotations', params.annotations, 'team',
      teamPath('projects', 'annotations/'), function(a) {
        return { limit: a.limit, offset: a.offset, search: a.search };
      }, 'paginated'),
    'posthog.list_persons': readHandler('posthog.list_persons', params.persons, 'team',
      teamPath('environments', 'persons/'), function(a) {
        return { limit: a.limit, offset: a.offset, search: a.search, distinct_id: a.distinct_id };
      }, 'paginated'),
    'posthog.get_person': readHandler('posthog.get_person', params.personId, 'team',
      teamEntityPath('environments', 'persons', 'person_id'), null, 'object'),
    'posthog.list_cohorts': readHandler('posthog.list_cohorts', params.pagination, 'team',
      teamPath('projects', 'cohorts/'), function(a) { return { limit: a.limit, offset: a.offset }; }, 'paginated'),
    'posthog.get_cohort': readHandler('posthog.get_cohort', params.cohortId, 'team',
      teamEntityPath('projects', 'cohorts', 'cohort_id'), null, 'object'),
    'posthog.list_surveys': readHandler('posthog.list_surveys', params.surveys, 'team',
      teamPath('projects', 'surveys/'), function(a) {
        return { limit: a.limit, offset: a.offset, archived: a.archived };
      }, 'paginated'),
    'posthog.get_survey': readHandler('posthog.get_survey', params.surveyId, 'team',
      teamEntityPath('projects', 'surveys', 'survey_id'), null, 'object'),
    'posthog.list_actions': readHandler('posthog.list_actions', params.pagination, 'team',
      teamPath('projects', 'actions/'), function(a) { return { limit: a.limit, offset: a.offset }; }, 'paginated'),
    'posthog.get_action': readHandler('posthog.get_action', params.actionId, 'team',
      teamEntityPath('projects', 'actions', 'action_id'), null, 'object'),
    'posthog.list_events': readHandler('posthog.list_events', params.events, 'team',
      teamPath('environments', 'events/'), function(a) {
        return { orderBy: '["-timestamp"]', limit: a.limit || 20, event: a.event,
          person_id: a.person_id, after: a.after, before: a.before };
      }, 'paginated'),
    'posthog.list_event_definitions': readHandler('posthog.list_event_definitions', params.annotations, 'team',
      teamPath('projects', 'event_definitions/'), function(a) {
        return { limit: a.limit, offset: a.offset, search: a.search };
      }, 'paginated'),
    'posthog.list_property_definitions': readHandler('posthog.list_property_definitions', params.propertyDefinitions, 'team',
      teamPath('projects', 'property_definitions/'), function(a) {
        return { limit: a.limit, offset: a.offset, type: a.type || 'event', search: a.search };
      }, 'paginated'),

    'posthog.create_annotation': guarded('posthog.create_annotation', 'write', params.createAnnotation),
    'posthog.create_dashboard': guarded('posthog.create_dashboard', 'write', params.createDashboard),
    'posthog.create_experiment': guarded('posthog.create_experiment', 'write', params.createExperiment),
    'posthog.create_feature_flag': guarded('posthog.create_feature_flag', 'write', params.createFeatureFlag),
    'posthog.create_insight': guarded('posthog.create_insight', 'write', params.createInsight),
    'posthog.run_query': guarded('posthog.run_query', 'write', params.runQuery),
    'posthog.run_trends_query': guarded('posthog.run_trends_query', 'write', params.runTrendsQuery),
    'posthog.update_dashboard': guarded('posthog.update_dashboard', 'write', params.updateDashboard),
    'posthog.update_feature_flag': guarded('posthog.update_feature_flag', 'write', params.updateFeatureFlag),
    'posthog.update_insight': guarded('posthog.update_insight', 'write', params.updateInsight),
    'posthog.delete_annotation': guarded('posthog.delete_annotation', 'destructive', params.annotationId),
    'posthog.delete_dashboard': guarded('posthog.delete_dashboard', 'destructive', params.dashboardId),
    'posthog.delete_feature_flag': guarded('posthog.delete_feature_flag', 'destructive', params.flagId),
    'posthog.delete_insight': guarded('posthog.delete_insight', 'destructive', params.insightId)
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    Object.keys(handlers).forEach(function(slug) {
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
    });
  }

  global.FsbHandlerPosthog = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
