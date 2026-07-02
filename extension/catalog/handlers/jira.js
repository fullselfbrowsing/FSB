(function (global) {
  'use strict';

  /**
   * Jira Cloud tenant same-origin REST READ head.
   *
   * Jira Cloud lives on per-tenant *.atlassian.net origins. The catalog declares a
   * representative Atlassian tenant for static readiness gates, but every runtime
   * request below derives the actual tenant origin from the active router context
   * and rejects non-tenant origins before building a bound spec. Mutations remain
   * guarded fail-closed until live mutation-body UAT exists.
   */

  var REPRESENTATIVE_ORIGIN = 'https://example.atlassian.net';
  var SERVICE = 'atlassian.net';
  var API_BASE = '/rest/api/3';
  var AGILE_BASE = '/rest/agile/1.0';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var ISSUE_FIELDS = [
    'summary',
    'status',
    'assignee',
    'priority',
    'issuetype',
    'created',
    'updated',
    'project',
    'description',
    'labels',
    'reporter'
  ].join(',');

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
    var out = { type: 'string' };
    if (description) { out.description = description; }
    return out;
  }

  function numberField(description) {
    var out = { type: 'number' };
    if (description) { out.description = description; }
    return out;
  }

  function boolField(description) {
    var out = { type: 'boolean' };
    if (description) { out.description = description; }
    return out;
  }

  var EMPTY_PARAMS = schema({});
  var ISSUE_KEY = stringField('Issue key or issue ID');
  var PROJECT_KEY = stringField('Project key or project ID');
  var ACCOUNT_ID = stringField('Atlassian account ID');
  var PAGE_PARAMS = {
    max_results: numberField('Maximum number of results'),
    start_at: numberField('Index of the first result for pagination')
  };

  function withPaging(properties) {
    var out = {};
    var k;
    for (k in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, k)) { out[k] = properties[k]; }
    }
    for (k in PAGE_PARAMS) {
      if (Object.prototype.hasOwnProperty.call(PAGE_PARAMS, k)) { out[k] = PAGE_PARAMS[k]; }
    }
    return out;
  }

  var GET_ISSUE_PARAMS = schema({ issue_key: ISSUE_KEY }, ['issue_key']);
  var GET_PROJECT_PARAMS = schema({ project_key: PROJECT_KEY }, ['project_key']);
  var GET_TRANSITIONS_PARAMS = schema({ issue_key: ISSUE_KEY }, ['issue_key']);
  var LIST_BOARDS_PARAMS = schema(withPaging({
    project_key: stringField('Project key filter'),
    type: stringField('Board type filter')
  }));
  var LIST_COMMENTS_PARAMS = schema(withPaging({
    issue_key: ISSUE_KEY,
    order_by: stringField('Comment sort order')
  }), ['issue_key']);
  var LIST_SPRINTS_PARAMS = schema(withPaging({
    board_id: numberField('Board ID'),
    state: stringField('Sprint state filter')
  }), ['board_id']);
  var LIST_PROJECTS_PARAMS = schema(withPaging({
    query: stringField('Project search query')
  }));
  var SEARCH_ISSUES_PARAMS = schema(withPaging({
    jql: stringField('JQL query string')
  }), ['jql']);
  var SEARCH_USERS_PARAMS = schema(withPaging({
    query: stringField('User search query')
  }));

  var ADD_COMMENT_PARAMS = schema({
    issue_key: ISSUE_KEY,
    body: stringField('Comment text')
  }, ['issue_key', 'body']);
  var ADD_WATCHER_PARAMS = schema({
    issue_key: ISSUE_KEY,
    account_id: ACCOUNT_ID
  }, ['issue_key', 'account_id']);
  var ASSIGN_ISSUE_PARAMS = schema({
    issue_key: ISSUE_KEY,
    account_id: ACCOUNT_ID
  }, ['issue_key']);
  var CREATE_ISSUE_PARAMS = schema({
    project_key: stringField('Project key'),
    summary: stringField('Issue summary'),
    issue_type: stringField('Issue type name'),
    description: stringField('Issue description'),
    priority: stringField('Priority name'),
    assignee_id: ACCOUNT_ID,
    labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
    parent_key: stringField('Parent issue key')
  }, ['project_key', 'summary']);
  var DELETE_ISSUE_PARAMS = schema({
    issue_key: ISSUE_KEY,
    delete_subtasks: boolField('Whether to also delete subtasks')
  }, ['issue_key']);
  var LINK_ISSUES_PARAMS = schema({
    type: stringField('Issue link type name'),
    inward_issue: stringField('Inward issue key'),
    outward_issue: stringField('Outward issue key')
  }, ['type', 'inward_issue', 'outward_issue']);
  var TRANSITION_ISSUE_PARAMS = schema({
    issue_key: ISSUE_KEY,
    transition_id: stringField('Transition ID')
  }, ['issue_key', 'transition_id']);
  var UPDATE_ISSUE_PARAMS = schema({
    issue_key: ISSUE_KEY,
    summary: stringField('New issue summary'),
    description: stringField('New issue description'),
    priority: stringField('New priority name'),
    assignee_id: ACCOUNT_ID,
    labels: { type: 'array', items: { type: 'string' }, description: 'Replacement labels' }
  }, ['issue_key']);

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
      reason: reason,
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function firstDefined(value, fallbackValue) {
    return value === undefined || value === null || value === '' ? fallbackValue : value;
  }

  function buildQuery(query) {
    var parts = [];
    var q = query || {};
    for (var key in q) {
      if (!Object.prototype.hasOwnProperty.call(q, key)) { continue; }
      var value = q[key];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function atlassianTenantOrigin(value) {
    var raw = String(value || '');
    try {
      var parsed = new URL(raw);
      var host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:') { return ''; }
      if (host === 'atlassian.net' || host.slice(-14) !== '.atlassian.net') { return ''; }
      return parsed.origin;
    } catch (e) {
      return '';
    }
  }

  function originFromContext(ctx) {
    var fields = ['origin', 'activeOrigin'];
    var i;
    for (i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string') {
        var origin = atlassianTenantOrigin(value);
        if (origin) { return origin; }
      }
    }
    fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (i = 0; i < fields.length; i++) {
      var url = ctx && ctx[fields[i]];
      if (typeof url === 'string') {
        var derived = atlassianTenantOrigin(url);
        if (derived) { return derived; }
      }
    }
    return '';
  }

  function buildGetSpec(origin, basePath, endpoint, query) {
    return {
      url: origin + basePath + endpoint + buildQuery(query),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: origin,
      extract: '@'
    };
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeJiraError(data) {
    return isObject(data) && (
      Array.isArray(data.errorMessages) ||
      (isObject(data.errors) && Object.keys(data.errors).length > 0)
    );
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  function guard(result, slug, predicate) {
    if (resultFailed(result)) { return result && result.success === false ? result : fallback(slug, 'jira-http-or-auth-failed'); }
    var data = result.data;
    if (looksLikeJiraError(data) || !predicate(data)) {
      return fallback(slug, 'jira-logged-out-or-shape-mismatch');
    }
    return result;
  }

  function hasAnyKey(data, keys) {
    if (!isObject(data)) { return false; }
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, keys[i])) { return true; }
    }
    return false;
  }

  function readHandler(slug, params, basePath, endpoint, queryForArgs, predicate) {
    return {
      tier: 'T1a',
      origin: REPRESENTATIVE_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'jira-execute-bound-spec-unavailable');
        }
        var origin = originFromContext(ctx);
        if (!origin) { return fallback(slug, 'jira-tenant-origin-unavailable'); }
        var input = args || {};
        var spec = buildGetSpec(origin, basePath, endpoint(input), queryForArgs ? queryForArgs(input) : {});
        var res = await ctx.executeBoundSpec(spec, ctx.tabId);
        return guard(res, slug, predicate);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: REPRESENTATIVE_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'jira.get_issue': readHandler('jira.get_issue', GET_ISSUE_PARAMS, API_BASE, function(a) {
      return '/issue/' + encodeSegment(a.issue_key);
    }, function() {
      return { fields: ISSUE_FIELDS };
    }, function(data) {
      return hasAnyKey(data, ['id', 'key']) && isObject(data.fields);
    }),
    'jira.get_myself': readHandler('jira.get_myself', EMPTY_PARAMS, API_BASE, function() {
      return '/myself';
    }, null, function(data) {
      return hasAnyKey(data, ['accountId', 'displayName']);
    }),
    'jira.get_project': readHandler('jira.get_project', GET_PROJECT_PARAMS, API_BASE, function(a) {
      return '/project/' + encodeSegment(a.project_key);
    }, null, function(data) {
      return hasAnyKey(data, ['id', 'key', 'name']);
    }),
    'jira.get_transitions': readHandler('jira.get_transitions', GET_TRANSITIONS_PARAMS, API_BASE, function(a) {
      return '/issue/' + encodeSegment(a.issue_key) + '/transitions';
    }, null, function(data) {
      return isObject(data) && Array.isArray(data.transitions);
    }),
    'jira.list_boards': readHandler('jira.list_boards', LIST_BOARDS_PARAMS, AGILE_BASE, function() {
      return '/board';
    }, function(a) {
      return {
        projectKeyOrId: a.project_key,
        type: a.type,
        maxResults: firstDefined(a.max_results, 50),
        startAt: firstDefined(a.start_at, 0)
      };
    }, function(data) {
      return isObject(data) && Array.isArray(data.values);
    }),
    'jira.list_comments': readHandler('jira.list_comments', LIST_COMMENTS_PARAMS, API_BASE, function(a) {
      return '/issue/' + encodeSegment(a.issue_key) + '/comment';
    }, function(a) {
      return {
        maxResults: firstDefined(a.max_results, 20),
        startAt: firstDefined(a.start_at, 0),
        orderBy: firstDefined(a.order_by, '-created')
      };
    }, function(data) {
      return isObject(data) && Array.isArray(data.comments);
    }),
    'jira.list_issue_types': readHandler('jira.list_issue_types', EMPTY_PARAMS, API_BASE, function() {
      return '/issuetype';
    }, null, function(data) {
      return Array.isArray(data);
    }),
    'jira.list_priorities': readHandler('jira.list_priorities', EMPTY_PARAMS, API_BASE, function() {
      return '/priority';
    }, null, function(data) {
      return Array.isArray(data);
    }),
    'jira.list_projects': readHandler('jira.list_projects', LIST_PROJECTS_PARAMS, API_BASE, function() {
      return '/project/search';
    }, function(a) {
      return {
        query: a.query,
        maxResults: firstDefined(a.max_results, 20),
        startAt: firstDefined(a.start_at, 0)
      };
    }, function(data) {
      return isObject(data) && Array.isArray(data.values);
    }),
    'jira.list_sprints': readHandler('jira.list_sprints', LIST_SPRINTS_PARAMS, AGILE_BASE, function(a) {
      return '/board/' + encodeSegment(a.board_id) + '/sprint';
    }, function(a) {
      return {
        state: a.state,
        maxResults: firstDefined(a.max_results, 50),
        startAt: firstDefined(a.start_at, 0)
      };
    }, function(data) {
      return isObject(data) && Array.isArray(data.values);
    }),
    'jira.search_issues': readHandler('jira.search_issues', SEARCH_ISSUES_PARAMS, API_BASE, function() {
      return '/search/jql';
    }, function(a) {
      return {
        jql: a.jql,
        maxResults: firstDefined(a.max_results, 20),
        startAt: firstDefined(a.start_at, 0),
        fields: ISSUE_FIELDS
      };
    }, function(data) {
      return isObject(data) && Array.isArray(data.issues);
    }),
    'jira.search_users': readHandler('jira.search_users', SEARCH_USERS_PARAMS, API_BASE, function() {
      return '/user/search';
    }, function(a) {
      return {
        query: firstDefined(a.query, ''),
        maxResults: firstDefined(a.max_results, 20),
        startAt: firstDefined(a.start_at, 0)
      };
    }, function(data) {
      return Array.isArray(data);
    }),

    'jira.add_comment': guarded('jira.add_comment', 'write', ADD_COMMENT_PARAMS, 'unverified-jira-add-comment-mutation'),
    'jira.add_watcher': guarded('jira.add_watcher', 'write', ADD_WATCHER_PARAMS, 'unverified-jira-add-watcher-mutation'),
    'jira.assign_issue': guarded('jira.assign_issue', 'write', ASSIGN_ISSUE_PARAMS, 'unverified-jira-assign-issue-mutation'),
    'jira.create_issue': guarded('jira.create_issue', 'write', CREATE_ISSUE_PARAMS, 'unverified-jira-create-issue-mutation'),
    'jira.delete_issue': guarded('jira.delete_issue', 'destructive', DELETE_ISSUE_PARAMS, 'unverified-jira-delete-issue-mutation'),
    'jira.link_issues': guarded('jira.link_issues', 'write', LINK_ISSUES_PARAMS, 'unverified-jira-link-issues-mutation'),
    'jira.transition_issue': guarded('jira.transition_issue', 'write', TRANSITION_ISSUE_PARAMS, 'unverified-jira-transition-issue-mutation'),
    'jira.update_issue': guarded('jira.update_issue', 'write', UPDATE_ISSUE_PARAMS, 'unverified-jira-update-issue-mutation')
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
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

  global.FsbHandlerJira = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
