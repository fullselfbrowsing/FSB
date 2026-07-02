(function (global) {
  'use strict';

  /**
   * Phase 46 (T1R-06) -- CircleCI same-origin READ head.
   *
   * The selected CircleCI reads use the vendored first-party relative /api/v2 base and
   * HttpOnly session cookies on app.circleci.com. This module builds only GET bound
   * specs; triggering pipelines or other mutating operations remain out of scope.
   */

  var CIRCLECI_ORIGIN = 'https://app.circleci.com';
  var CIRCLECI_SERVICE = 'app.circleci.com';
  var CIRCLECI_API_BASE = CIRCLECI_ORIGIN + '/api/v2';

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var INTEGER = { type: 'integer' };
  var STRING_ARRAY = { type: 'array', items: STRING };
  var REPORTING_WINDOW = {
    type: 'string',
    enum: ['last-7-days', 'last-30-days', 'last-60-days', 'last-90-days']
  };
  var OWNER_TYPE = {
    type: 'string',
    enum: ['account', 'organization']
  };
  var ATTRIBUTION_ACTOR = {
    type: 'string',
    enum: ['current', 'system']
  };
  var DAY_OF_WEEK = {
    type: 'string',
    enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  };
  var MONTH = {
    type: 'string',
    enum: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  };

  function schema(properties, required) {
    return {
      type: 'object',
      properties: properties || {},
      required: required || [],
      additionalProperties: false
    };
  }

  var GET_CURRENT_USER_PARAMS = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };
  var LIST_PIPELINES_PARAMS = {
    type: 'object',
    properties: {
      project_slug: { type: 'string' },
      branch: { type: 'string' },
      mine: { type: 'boolean' },
      page_token: { type: 'string' }
    },
    required: ['project_slug'],
    additionalProperties: false
  };
  var GET_PROJECT_PARAMS = {
    type: 'object',
    properties: { project_slug: { type: 'string' } },
    required: ['project_slug'],
    additionalProperties: false
  };
  var GET_PIPELINE_PARAMS = {
    type: 'object',
    properties: { pipeline_id: { type: 'string' } },
    required: ['pipeline_id'],
    additionalProperties: false
  };
  var GET_PIPELINE_WORKFLOWS_PARAMS = {
    type: 'object',
    properties: {
      pipeline_id: { type: 'string' },
      page_token: { type: 'string' }
    },
    required: ['pipeline_id'],
    additionalProperties: false
  };
  var GET_WORKFLOW_PARAMS = {
    type: 'object',
    properties: { workflow_id: { type: 'string' } },
    required: ['workflow_id'],
    additionalProperties: false
  };
  var GET_WORKFLOW_JOBS_PARAMS = {
    type: 'object',
    properties: {
      workflow_id: { type: 'string' },
      page_token: { type: 'string' }
    },
    required: ['workflow_id'],
    additionalProperties: false
  };
  var GET_JOB_PARAMS = {
    type: 'object',
    properties: {
      project_slug: { type: 'string' },
      job_number: { type: 'integer' }
    },
    required: ['project_slug', 'job_number'],
    additionalProperties: false
  };
  var CONTEXT_ID_PARAMS = schema({ context_id: STRING }, ['context_id']);
  var GET_FLAKY_TESTS_PARAMS = schema({ project_slug: STRING }, ['project_slug']);
  var GET_PROJECT_WORKFLOW_METRICS_PARAMS = schema({
    project_slug: STRING,
    page_token: STRING,
    branch: STRING,
    reporting_window: REPORTING_WINDOW
  }, ['project_slug']);
  var GET_WORKFLOW_JOB_METRICS_PARAMS = schema({
    project_slug: STRING,
    workflow_name: STRING,
    page_token: STRING,
    reporting_window: REPORTING_WINDOW
  }, ['project_slug', 'workflow_name']);
  var GET_WORKFLOW_RUNS_PARAMS = schema({
    project_slug: STRING,
    workflow_name: STRING,
    branch: STRING,
    page_token: STRING
  }, ['project_slug', 'workflow_name']);
  var LIST_CONTEXT_ENV_VARS_PARAMS = schema({
    context_id: STRING,
    page_token: STRING
  }, ['context_id']);
  var LIST_CONTEXTS_PARAMS = schema({
    owner_id: STRING,
    owner_type: OWNER_TYPE,
    page_token: STRING
  }, ['owner_id']);
  var LIST_ENV_VARS_PARAMS = schema({ project_slug: STRING }, ['project_slug']);
  var LIST_SCHEDULES_PARAMS = schema({
    project_slug: STRING,
    page_token: STRING
  }, ['project_slug']);
  var APPROVE_JOB_PARAMS = schema({
    workflow_id: STRING,
    approval_request_id: STRING
  }, ['workflow_id', 'approval_request_id']);
  var WORKFLOW_ID_PARAMS = schema({ workflow_id: STRING }, ['workflow_id']);
  var CREATE_CONTEXT_PARAMS = schema({
    name: STRING,
    owner_id: STRING,
    owner_type: OWNER_TYPE
  }, ['name', 'owner_id']);
  var CREATE_ENV_VAR_PARAMS = schema({
    project_slug: STRING,
    name: STRING,
    value: STRING
  }, ['project_slug', 'name', 'value']);
  var SCHEDULE_ID_PARAMS = schema({ schedule_id: STRING }, ['schedule_id']);
  var PROJECT_NAME_PARAMS = schema({
    project_slug: STRING,
    name: STRING
  }, ['project_slug', 'name']);
  var TIMETABLE = schema({
    per_hour: { type: 'integer', minimum: 1, maximum: 60 },
    hours_of_day: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 23 } },
    days_of_week: { type: 'array', items: DAY_OF_WEEK },
    days_of_month: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 31 } },
    months: { type: 'array', items: MONTH }
  }, ['per_hour', 'hours_of_day']);
  var PARAMETERS_OBJECT = {
    type: 'object',
    propertyNames: STRING,
    additionalProperties: {}
  };
  var CREATE_SCHEDULE_PARAMS = schema({
    project_slug: STRING,
    name: STRING,
    description: STRING,
    attribution_actor: ATTRIBUTION_ACTOR,
    timetable: TIMETABLE,
    parameters: PARAMETERS_OBJECT
  }, ['project_slug', 'name', 'attribution_actor', 'timetable']);
  var RERUN_WORKFLOW_PARAMS = schema({
    workflow_id: STRING,
    from_failed: BOOLEAN,
    jobs: STRING_ARRAY,
    sparse_tree: BOOLEAN
  }, ['workflow_id']);
  var TRIGGER_PIPELINE_PARAMS = schema({
    project_slug: STRING,
    branch: STRING,
    tag: STRING,
    parameters: PARAMETERS_OBJECT
  }, ['project_slug']);
  var UPDATE_SCHEDULE_PARAMS = schema({
    schedule_id: STRING,
    name: STRING,
    description: STRING,
    attribution_actor: ATTRIBUTION_ACTOR,
    timetable: TIMETABLE,
    parameters: PARAMETERS_OBJECT
  }, ['schedule_id']);

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function encodePathPreservingSlash(value) {
    return String(value).split('/').map(function (part) {
      return encodeURIComponent(part);
    }).join('/');
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

  function buildGetSpec(url) {
    return {
      url: url,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: CIRCLECI_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeCircleciError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.message === 'string' || typeof data.error === 'string');
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeCircleciError(data)
      && (Object.prototype.hasOwnProperty.call(data, 'id')
        || Object.prototype.hasOwnProperty.call(data, 'login')
        || Object.prototype.hasOwnProperty.call(data, 'slug'));
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'circleci-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardAnyObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeCircleciError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'circleci-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardItems(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && Array.isArray(data.items)
      && !looksLikeCircleciError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'circleci-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardedWrite(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
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

  var handlers = {
    'circleci.get_current_user': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_CURRENT_USER_PARAMS,
      async handle(args, ctx) {
        var res = await ctx.executeBoundSpec(buildGetSpec(CIRCLECI_API_BASE + '/me'), ctx.tabId);
        return guardObject(res, 'circleci.get_current_user');
      }
    },

    'circleci.list_pipelines': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_PIPELINES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var project = encodePathPreservingSlash(a.project_slug);
        var url = CIRCLECI_API_BASE + '/project/' + project + '/pipeline' + buildQuery([
          ['branch', a.branch],
          ['mine', a.mine],
          ['page-token', a.page_token]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.list_pipelines');
      }
    },

    'circleci.get_project': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PROJECT_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'circleci.get_project');
      }
    },

    'circleci.get_context': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: CONTEXT_ID_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/context/' + encodeURIComponent(String(a.context_id));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'circleci.get_context');
      }
    },

    'circleci.get_flaky_tests': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_FLAKY_TESTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/insights/' + encodePathPreservingSlash(a.project_slug) + '/flaky-tests';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardAnyObject(res, 'circleci.get_flaky_tests');
      }
    },

    'circleci.get_pipeline': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PIPELINE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/pipeline/' + encodeURIComponent(String(a.pipeline_id));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'circleci.get_pipeline');
      }
    },

    'circleci.get_pipeline_config': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PIPELINE_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/pipeline/' + encodeURIComponent(String(a.pipeline_id)) + '/config';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardAnyObject(res, 'circleci.get_pipeline_config');
      }
    },

    'circleci.get_pipeline_workflows': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PIPELINE_WORKFLOWS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/pipeline/' + encodeURIComponent(String(a.pipeline_id)) +
          '/workflow' + buildQuery([
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_pipeline_workflows');
      }
    },

    'circleci.get_workflow': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_WORKFLOW_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/workflow/' + encodeURIComponent(String(a.workflow_id));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'circleci.get_workflow');
      }
    },

    'circleci.get_project_workflow_metrics': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_PROJECT_WORKFLOW_METRICS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/insights/' + encodePathPreservingSlash(a.project_slug) +
          '/workflows' + buildQuery([
            ['branch', a.branch],
            ['reporting-window', a.reporting_window],
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_project_workflow_metrics');
      }
    },

    'circleci.get_workflow_job_metrics': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_WORKFLOW_JOB_METRICS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/insights/' + encodePathPreservingSlash(a.project_slug) +
          '/workflows/' + encodeURIComponent(String(a.workflow_name)) + '/jobs' + buildQuery([
            ['reporting-window', a.reporting_window],
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_workflow_job_metrics');
      }
    },

    'circleci.get_workflow_runs': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_WORKFLOW_RUNS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/insights/' + encodePathPreservingSlash(a.project_slug) +
          '/workflows/' + encodeURIComponent(String(a.workflow_name)) + buildQuery([
            ['branch', a.branch],
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_workflow_runs');
      }
    },

    'circleci.get_workflow_jobs': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_WORKFLOW_JOBS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/workflow/' + encodeURIComponent(String(a.workflow_id)) +
          '/job' + buildQuery([
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_workflow_jobs');
      }
    },

    'circleci.get_job': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_JOB_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug) +
          '/job/' + encodeURIComponent(String(a.job_number));
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardObject(res, 'circleci.get_job');
      }
    },

    'circleci.get_job_artifacts': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_JOB_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug) +
          '/' + encodeURIComponent(String(a.job_number)) + '/artifacts';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_job_artifacts');
      }
    },

    'circleci.get_job_tests': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: GET_JOB_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug) +
          '/' + encodeURIComponent(String(a.job_number)) + '/tests';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.get_job_tests');
      }
    },

    'circleci.list_context_env_vars': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_CONTEXT_ENV_VARS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/context/' + encodeURIComponent(String(a.context_id)) +
          '/environment-variable' + buildQuery([
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.list_context_env_vars');
      }
    },

    'circleci.list_contexts': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_CONTEXTS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/context' + buildQuery([
          ['owner-id', a.owner_id],
          ['owner-type', a.owner_type],
          ['page-token', a.page_token]
        ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.list_contexts');
      }
    },

    'circleci.list_env_vars': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_ENV_VARS_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug) + '/envvar';
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.list_env_vars');
      }
    },

    'circleci.list_schedules': {
      tier: 'T1a',
      origin: CIRCLECI_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_SCHEDULES_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        var url = CIRCLECI_API_BASE + '/project/' + encodePathPreservingSlash(a.project_slug) +
          '/schedule' + buildQuery([
            ['page-token', a.page_token]
          ]);
        var res = await ctx.executeBoundSpec(buildGetSpec(url), ctx.tabId);
        return guardItems(res, 'circleci.list_schedules');
      }
    },

    'circleci.approve_job': guardedWrite('circleci.approve_job', 'write', APPROVE_JOB_PARAMS, 'unverified-circleci-approve-job-mutation'),
    'circleci.cancel_job': guardedWrite('circleci.cancel_job', 'destructive', GET_JOB_PARAMS, 'unverified-circleci-cancel-job-mutation'),
    'circleci.cancel_workflow': guardedWrite('circleci.cancel_workflow', 'destructive', WORKFLOW_ID_PARAMS, 'unverified-circleci-cancel-workflow-mutation'),
    'circleci.create_context': guardedWrite('circleci.create_context', 'write', CREATE_CONTEXT_PARAMS, 'unverified-circleci-create-context-mutation'),
    'circleci.create_env_var': guardedWrite('circleci.create_env_var', 'write', CREATE_ENV_VAR_PARAMS, 'unverified-circleci-create-env-var-mutation'),
    'circleci.create_schedule': guardedWrite('circleci.create_schedule', 'write', CREATE_SCHEDULE_PARAMS, 'unverified-circleci-create-schedule-mutation'),
    'circleci.delete_context': guardedWrite('circleci.delete_context', 'destructive', CONTEXT_ID_PARAMS, 'unverified-circleci-delete-context-mutation'),
    'circleci.delete_env_var': guardedWrite('circleci.delete_env_var', 'destructive', PROJECT_NAME_PARAMS, 'unverified-circleci-delete-env-var-mutation'),
    'circleci.delete_schedule': guardedWrite('circleci.delete_schedule', 'destructive', SCHEDULE_ID_PARAMS, 'unverified-circleci-delete-schedule-mutation'),
    'circleci.rerun_workflow': guardedWrite('circleci.rerun_workflow', 'write', RERUN_WORKFLOW_PARAMS, 'unverified-circleci-rerun-workflow-mutation'),
    'circleci.trigger_pipeline': guardedWrite('circleci.trigger_pipeline', 'write', TRIGGER_PIPELINE_PARAMS, 'unverified-circleci-trigger-pipeline-mutation'),
    'circleci.update_schedule': guardedWrite('circleci.update_schedule', 'write', UPDATE_SCHEDULE_PARAMS, 'unverified-circleci-update-schedule-mutation')
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
          descriptor: { slug: slug, service: CIRCLECI_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerCircleci = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
