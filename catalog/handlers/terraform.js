(function (global) {
  'use strict';

  /**
   * Terraform Cloud same-origin head.
   *
   * Terraform Cloud's vendored runtime uses the first-party relative /api/v2
   * JSON:API surface on app.terraform.io with browser session cookies. Read-only
   * calls execute through executeBoundSpec. Write/destructive slugs are registered
   * only as guarded fail-closed handlers until live mutation-body UAT records the
   * method, path, body shape, and CSRF carrier.
   */

  var TERRAFORM_ORIGIN = 'https://app.terraform.io';
  var TERRAFORM_SERVICE = 'app.terraform.io';
  var TERRAFORM_API_BASE = TERRAFORM_ORIGIN + '/api/v2';

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var PAGE = { type: 'integer', minimum: 1, maximum: 9007199254740991 };
  var PAGE_SIZE = { type: 'integer', minimum: 1, maximum: 100 };
  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };

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
    out.page = PAGE;
    out.page_size = PAGE_SIZE;
    return schema(out, required || []);
  }

  var APPLY_ID_PARAMS = schema({ apply_id: STRING }, ['apply_id']);
  var ORGANIZATION_PARAMS = schema({ organization: STRING }, ['organization']);
  var PLAN_ID_PARAMS = schema({ plan_id: STRING }, ['plan_id']);
  var PROJECT_ID_PARAMS = schema({ project_id: STRING }, ['project_id']);
  var RUN_ID_PARAMS = schema({ run_id: STRING }, ['run_id']);
  var TEAM_ID_PARAMS = schema({ team_id: STRING }, ['team_id']);
  var VARIABLE_ID_PARAMS = schema({ variable_id: STRING }, ['variable_id']);
  var VARSET_ID_PARAMS = schema({ varset_id: STRING }, ['varset_id']);
  var WORKSPACE_ID_PARAMS = schema({ workspace_id: STRING }, ['workspace_id']);
  var ORGANIZATION_PAGING_PARAMS = withPaging({ organization: STRING }, ['organization']);
  var WORKSPACE_PAGING_PARAMS = withPaging({ workspace_id: STRING }, ['workspace_id']);
  var LIST_ORGANIZATIONS_PARAMS = withPaging({}, []);
  var LIST_WORKSPACES_PARAMS = withPaging({ organization: STRING, search: STRING }, ['organization']);

  var APPLY_RUN_PARAMS = schema({ run_id: STRING, comment: STRING }, ['run_id']);
  var CREATE_PROJECT_PARAMS = schema({ organization: STRING, name: STRING, description: STRING }, ['organization', 'name']);
  var CREATE_RUN_PARAMS = schema({
    workspace_id: STRING,
    message: STRING,
    is_destroy: BOOLEAN,
    plan_only: BOOLEAN,
    refresh_only: BOOLEAN,
    auto_apply: BOOLEAN
  }, ['workspace_id']);
  var CREATE_VARIABLE_PARAMS = schema({
    workspace_id: STRING,
    key: STRING,
    value: STRING,
    category: { type: 'string', enum: ['terraform', 'env'] },
    description: STRING,
    hcl: BOOLEAN,
    sensitive: BOOLEAN
  }, ['workspace_id', 'key', 'category']);
  var CREATE_VARIABLE_SET_PARAMS = schema({
    organization: STRING,
    name: STRING,
    description: STRING,
    global: BOOLEAN,
    priority: BOOLEAN
  }, ['organization', 'name']);
  var CREATE_WORKSPACE_PARAMS = schema({
    organization: STRING,
    name: STRING,
    description: STRING,
    project_id: STRING,
    execution_mode: STRING,
    terraform_version: STRING,
    auto_apply: BOOLEAN,
    working_directory: STRING
  }, ['organization', 'name']);
  var UPDATE_PROJECT_PARAMS = schema({ project_id: STRING, name: STRING, description: STRING }, ['project_id']);
  var UPDATE_VARIABLE_PARAMS = schema({
    variable_id: STRING,
    key: STRING,
    value: STRING,
    description: STRING,
    hcl: BOOLEAN,
    sensitive: BOOLEAN
  }, ['variable_id']);
  var UPDATE_WORKSPACE_PARAMS = schema({
    workspace_id: STRING,
    name: STRING,
    description: STRING,
    execution_mode: STRING,
    terraform_version: STRING,
    auto_apply: BOOLEAN,
    working_directory: STRING
  }, ['workspace_id']);
  var LOCK_WORKSPACE_PARAMS = schema({ workspace_id: STRING, reason: STRING }, ['workspace_id']);

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
      url: TERRAFORM_API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TERRAFORM_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeTerraformError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (Array.isArray(data.errors)
        || typeof data.error === 'string'
        || typeof data.message === 'string');
  }

  function guardJsonApi(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var payload = data && typeof data === 'object' ? data.data : undefined;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeTerraformError(data)
      && (kind === 'array' ? Array.isArray(payload) : !!payload && typeof payload === 'object' && !Array.isArray(payload));
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'terraform-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function guardObject(result, slug) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var ok = !!data && typeof data === 'object' && !Array.isArray(data)
      && !looksLikeTerraformError(data);
    if (!ok) {
      return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
        slug: slug,
        reason: 'terraform-logged-out-or-rot',
        fellBackToDom: true
      });
    }
    return result;
  }

  function readHandler(slug, params, buildPath, buildPairs, kind) {
    return {
      tier: 'T1a',
      origin: TERRAFORM_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
            slug: slug,
            reason: 'terraform-execute-bound-spec-unavailable',
            fellBackToDom: true
          });
        }
        var a = args || {};
        var res = await ctx.executeBoundSpec(buildGetSpec(buildPath(a), buildPairs ? buildPairs(a) : []), ctx.tabId);
        return kind === 'object-any' ? guardObject(res, slug) : guardJsonApi(res, slug, kind);
      }
    };
  }

  function guardedWrite(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: TERRAFORM_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle(args, ctx) {
        return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
          slug: slug,
          reason: reason,
          fellBackToDom: true
        });
      }
    };
  }

  function pagingPairs(a) {
    return [
      ['page[number]', a.page === undefined ? 1 : a.page],
      ['page[size]', a.page_size === undefined ? 20 : a.page_size]
    ];
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  var handlers = {
    'terraform.get_apply': readHandler('terraform.get_apply', APPLY_ID_PARAMS, function(a) {
      return '/applies/' + encodeSegment(a.apply_id);
    }, null, 'object'),
    'terraform.get_current_state_version': readHandler('terraform.get_current_state_version', WORKSPACE_ID_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace_id) + '/current-state-version';
    }, null, 'object'),
    'terraform.get_current_user': readHandler('terraform.get_current_user', EMPTY_PARAMS, function() {
      return '/account/details';
    }, null, 'object'),
    'terraform.get_organization': readHandler('terraform.get_organization', ORGANIZATION_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization);
    }, null, 'object'),
    'terraform.get_plan': readHandler('terraform.get_plan', PLAN_ID_PARAMS, function(a) {
      return '/plans/' + encodeSegment(a.plan_id);
    }, null, 'object'),
    'terraform.get_plan_json_output': readHandler('terraform.get_plan_json_output', PLAN_ID_PARAMS, function(a) {
      return '/plans/' + encodeSegment(a.plan_id) + '/json-output';
    }, null, 'object-any'),
    'terraform.get_project': readHandler('terraform.get_project', PROJECT_ID_PARAMS, function(a) {
      return '/projects/' + encodeSegment(a.project_id);
    }, null, 'object'),
    'terraform.get_run': readHandler('terraform.get_run', RUN_ID_PARAMS, function(a) {
      return '/runs/' + encodeSegment(a.run_id);
    }, null, 'object'),
    'terraform.get_team': readHandler('terraform.get_team', TEAM_ID_PARAMS, function(a) {
      return '/teams/' + encodeSegment(a.team_id);
    }, null, 'object'),
    'terraform.get_variable_set': readHandler('terraform.get_variable_set', VARSET_ID_PARAMS, function(a) {
      return '/varsets/' + encodeSegment(a.varset_id);
    }, null, 'object'),
    'terraform.get_workspace': readHandler('terraform.get_workspace', WORKSPACE_ID_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace_id);
    }, null, 'object'),
    'terraform.list_organization_members': readHandler('terraform.list_organization_members', ORGANIZATION_PAGING_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization) + '/organization-memberships';
    }, pagingPairs, 'array'),
    'terraform.list_organizations': readHandler('terraform.list_organizations', LIST_ORGANIZATIONS_PARAMS, function() {
      return '/organizations';
    }, pagingPairs, 'array'),
    'terraform.list_projects': readHandler('terraform.list_projects', ORGANIZATION_PAGING_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization) + '/projects';
    }, pagingPairs, 'array'),
    'terraform.list_runs': readHandler('terraform.list_runs', WORKSPACE_PAGING_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace_id) + '/runs';
    }, pagingPairs, 'array'),
    'terraform.list_state_versions': readHandler('terraform.list_state_versions', WORKSPACE_PAGING_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace_id) + '/state-versions';
    }, pagingPairs, 'array'),
    'terraform.list_team_access': readHandler('terraform.list_team_access', WORKSPACE_ID_PARAMS, function() {
      return '/team-workspaces';
    }, function(a) {
      return [['filter[workspace][id]', a.workspace_id]];
    }, 'array'),
    'terraform.list_teams': readHandler('terraform.list_teams', ORGANIZATION_PAGING_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization) + '/teams';
    }, pagingPairs, 'array'),
    'terraform.list_variable_sets': readHandler('terraform.list_variable_sets', ORGANIZATION_PAGING_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization) + '/varsets';
    }, pagingPairs, 'array'),
    'terraform.list_workspace_variables': readHandler('terraform.list_workspace_variables', WORKSPACE_ID_PARAMS, function(a) {
      return '/workspaces/' + encodeSegment(a.workspace_id) + '/vars';
    }, null, 'array'),
    'terraform.list_workspaces': readHandler('terraform.list_workspaces', LIST_WORKSPACES_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization) + '/workspaces';
    }, function(a) {
      var pairs = pagingPairs(a);
      pairs.push(['search[name]', a.search]);
      return pairs;
    }, 'array'),

    'terraform.apply_run': guardedWrite('terraform.apply_run', 'write', APPLY_RUN_PARAMS, 'unverified-terraform-apply-run-mutation'),
    'terraform.cancel_run': guardedWrite('terraform.cancel_run', 'destructive', APPLY_RUN_PARAMS, 'unverified-terraform-cancel-run-mutation'),
    'terraform.create_project': guardedWrite('terraform.create_project', 'write', CREATE_PROJECT_PARAMS, 'unverified-terraform-create-project-mutation'),
    'terraform.create_run': guardedWrite('terraform.create_run', 'write', CREATE_RUN_PARAMS, 'unverified-terraform-create-run-mutation'),
    'terraform.create_variable': guardedWrite('terraform.create_variable', 'write', CREATE_VARIABLE_PARAMS, 'unverified-terraform-create-variable-mutation'),
    'terraform.create_variable_set': guardedWrite('terraform.create_variable_set', 'write', CREATE_VARIABLE_SET_PARAMS, 'unverified-terraform-create-variable-set-mutation'),
    'terraform.create_workspace': guardedWrite('terraform.create_workspace', 'write', CREATE_WORKSPACE_PARAMS, 'unverified-terraform-create-workspace-mutation'),
    'terraform.delete_project': guardedWrite('terraform.delete_project', 'destructive', PROJECT_ID_PARAMS, 'unverified-terraform-delete-project-mutation'),
    'terraform.delete_variable': guardedWrite('terraform.delete_variable', 'destructive', VARIABLE_ID_PARAMS, 'unverified-terraform-delete-variable-mutation'),
    'terraform.delete_variable_set': guardedWrite('terraform.delete_variable_set', 'destructive', VARSET_ID_PARAMS, 'unverified-terraform-delete-variable-set-mutation'),
    'terraform.delete_workspace': guardedWrite('terraform.delete_workspace', 'destructive', WORKSPACE_ID_PARAMS, 'unverified-terraform-delete-workspace-mutation'),
    'terraform.discard_run': guardedWrite('terraform.discard_run', 'write', APPLY_RUN_PARAMS, 'unverified-terraform-discard-run-mutation'),
    'terraform.lock_workspace': guardedWrite('terraform.lock_workspace', 'write', LOCK_WORKSPACE_PARAMS, 'unverified-terraform-lock-workspace-mutation'),
    'terraform.unlock_workspace': guardedWrite('terraform.unlock_workspace', 'write', WORKSPACE_ID_PARAMS, 'unverified-terraform-unlock-workspace-mutation'),
    'terraform.update_project': guardedWrite('terraform.update_project', 'write', UPDATE_PROJECT_PARAMS, 'unverified-terraform-update-project-mutation'),
    'terraform.update_variable': guardedWrite('terraform.update_variable', 'write', UPDATE_VARIABLE_PARAMS, 'unverified-terraform-update-variable-mutation'),
    'terraform.update_workspace': guardedWrite('terraform.update_workspace', 'write', UPDATE_WORKSPACE_PARAMS, 'unverified-terraform-update-workspace-mutation')
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
            service: TERRAFORM_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTerraform = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
