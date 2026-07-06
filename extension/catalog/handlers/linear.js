(function (global) {
  'use strict';

  /**
   * Linear first-party authenticated READ head.
   *
   * Linear's web app runs on linear.app while its GraphQL endpoint is a
   * same-registrable first-party API host. The request is still origin-pinned to
   * linear.app; page-owned Linear headers are attached only inside the fixed page
   * fetch primitive, and all mutations remain guarded fail-closed.
   */

  var ORIGIN = 'https://linear.app';
  var SERVICE = 'linear.app';
  var GRAPHQL_ENDPOINT = 'https://client-api.linear.app/graphql';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var NUMBER = { type: 'number' };
  var STRING_ARRAY = { type: 'array', items: STRING };
  var EMPTY_PARAMS = schema({}, []);
  var ID_FIELD = { type: 'string', minLength: 1 };
  var LIMIT_FIELD = intField('Maximum number of results to return', 1, 100);
  var AFTER_FIELD = STRING;

  var ISSUE_FIELDS = 'id identifier title description priority priorityLabel url ' +
    'createdAt updatedAt dueDate estimate state { name type } assignee { name displayName } ' +
    'team { key name } labels { nodes { name } } project { name } cycle { number }';
  var COMMENT_FIELDS = 'id body createdAt updatedAt editedAt user { name displayName }';
  var PROJECT_FIELDS = 'id name description url createdAt updatedAt targetDate startDate ' +
    'status { name } lead { name displayName }';
  var DOCUMENT_FIELDS = 'id title content slugId icon url createdAt updatedAt creator { name displayName } project { name }';
  var INITIATIVE_FIELDS = 'id name description status color icon url createdAt updatedAt owner { name displayName }';
  var ATTACHMENT_FIELDS = 'id title subtitle url sourceType createdAt updatedAt creator { name displayName }';
  var LABEL_FIELDS = 'id name color description isGroup parent { name }';
  var USER_FIELDS = 'id name email displayName active admin';
  var TEAM_FIELDS = 'id key name description';
  var CYCLE_FIELDS = 'id number name startsAt endsAt isActive completedAt';
  var MILESTONE_FIELDS = 'id name description targetDate sortOrder';
  var STATUS_UPDATE_FIELDS = 'id body health createdAt updatedAt user { name displayName }';
  var HISTORY_FIELDS = 'id createdAt actor { name displayName } fromState { name } toState { name } ' +
    'fromAssignee { name displayName } toAssignee { name displayName } fromPriority toPriority';
  var RELATION_FIELDS = 'id type relatedIssue { id identifier title state { name } }';

  var GET_ATTACHMENT_PARAMS = schema({ attachment_id: ID_FIELD }, ['attachment_id']);
  var GET_CYCLE_PARAMS = schema({ cycle_id: ID_FIELD }, ['cycle_id']);
  var GET_DOCUMENT_PARAMS = schema({ document_id: ID_FIELD }, ['document_id']);
  var GET_INITIATIVE_PARAMS = schema({ initiative_id: ID_FIELD }, ['initiative_id']);
  var GET_ISSUE_PARAMS = schema({ issue_id: ID_FIELD }, ['issue_id']);
  var GET_MILESTONE_PARAMS = schema({ milestone_id: ID_FIELD }, ['milestone_id']);
  var GET_PROJECT_PARAMS = schema({ project_id: ID_FIELD }, ['project_id']);
  var GET_TEAM_PARAMS = schema({ team_id: ID_FIELD }, ['team_id']);
  var GET_USER_PARAMS = schema({ user_id: ID_FIELD }, ['user_id']);
  var ISSUE_PAGE_PARAMS = schema({ issue_id: ID_FIELD, limit: LIMIT_FIELD, after: AFTER_FIELD }, ['issue_id']);
  var TEAM_PAGE_PARAMS = schema({ team_id: ID_FIELD, limit: LIMIT_FIELD, after: AFTER_FIELD }, ['team_id']);
  var PROJECT_PAGE_PARAMS = schema({ project_id: ID_FIELD, limit: LIMIT_FIELD, after: AFTER_FIELD }, ['project_id']);
  var PROJECT_ID_PARAMS = schema({ project_id: ID_FIELD }, ['project_id']);
  var LIST_DOCUMENTS_PARAMS = schema({ project_id: STRING, limit: LIMIT_FIELD, after: AFTER_FIELD }, []);
  var LIST_INITIATIVES_PARAMS = schema({
    status: { type: 'string', enum: ['Planned', 'Active', 'Completed'] },
    limit: LIMIT_FIELD,
    after: AFTER_FIELD
  }, []);
  var LIST_PROJECTS_PARAMS = schema({ limit: LIMIT_FIELD, after: AFTER_FIELD }, []);
  var LIST_USERS_PARAMS = schema({ limit: LIMIT_FIELD, after: AFTER_FIELD }, []);
  var SEARCH_ISSUES_PARAMS = schema({
    query: STRING,
    team_key: STRING,
    assignee_name: STRING,
    state_name: STRING,
    label_name: STRING,
    project_name: STRING,
    priority: NUMBER,
    limit: LIMIT_FIELD,
    after: AFTER_FIELD
  }, []);

  var ISSUE_ID_LABEL_PARAMS = schema({ issue_id: ID_FIELD, label_id: ID_FIELD }, ['issue_id', 'label_id']);
  var ISSUE_ID_SUBSCRIBER_PARAMS = schema({ issue_id: ID_FIELD, subscriber_id: ID_FIELD }, ['issue_id', 'subscriber_id']);
  var ISSUE_ID_PARAMS = schema({ issue_id: ID_FIELD }, ['issue_id']);
  var BATCH_UPDATE_ISSUES_PARAMS = schema({
    issue_ids: STRING_ARRAY,
    state_id: STRING,
    assignee_id: STRING,
    priority: NUMBER,
    project_id: STRING,
    cycle_id: STRING,
    label_ids: STRING_ARRAY,
    due_date: STRING
  }, ['issue_ids']);
  var CREATE_ATTACHMENT_PARAMS = schema({ issue_id: ID_FIELD, url: ID_FIELD, title: ID_FIELD, subtitle: STRING }, ['issue_id', 'url', 'title']);
  var COMMENT_PARAMS = schema({ issue_id: ID_FIELD, body: ID_FIELD }, ['issue_id', 'body']);
  var UPDATE_COMMENT_PARAMS = schema({ comment_id: ID_FIELD, body: ID_FIELD }, ['comment_id', 'body']);
  var DOCUMENT_CREATE_PARAMS = schema({ title: ID_FIELD, content: STRING, project_id: STRING, icon: STRING }, ['title']);
  var DOCUMENT_UPDATE_PARAMS = schema({ document_id: ID_FIELD, title: STRING, content: STRING, project_id: STRING, icon: STRING }, ['document_id']);
  var INITIATIVE_CREATE_PARAMS = schema({ name: ID_FIELD, description: STRING, status: STRING, color: STRING, owner_id: STRING }, ['name']);
  var INITIATIVE_UPDATE_PARAMS = schema({ initiative_id: ID_FIELD, name: STRING, description: STRING, status: STRING, color: STRING, owner_id: STRING }, ['initiative_id']);
  var CREATE_ISSUE_PARAMS = schema({
    team_id: ID_FIELD,
    title: ID_FIELD,
    description: STRING,
    priority: NUMBER,
    assignee_id: STRING,
    state_id: STRING,
    label_ids: STRING_ARRAY,
    project_id: STRING,
    cycle_id: STRING,
    due_date: STRING,
    estimate: NUMBER,
    parent_id: STRING
  }, ['team_id', 'title']);
  var UPDATE_ISSUE_PARAMS = schema({
    issue_id: ID_FIELD,
    title: STRING,
    description: STRING,
    priority: NUMBER,
    assignee_id: STRING,
    state_id: STRING,
    label_ids: STRING_ARRAY,
    project_id: STRING,
    cycle_id: STRING,
    due_date: STRING,
    estimate: NUMBER,
    team_id: STRING,
    parent_id: STRING
  }, ['issue_id']);
  var ISSUE_RELATION_CREATE_PARAMS = schema({ issue_id: ID_FIELD, related_issue_id: ID_FIELD, type: ID_FIELD }, ['issue_id', 'related_issue_id', 'type']);
  var RELATION_ID_PARAMS = schema({ relation_id: ID_FIELD }, ['relation_id']);
  var LABEL_CREATE_PARAMS = schema({ name: ID_FIELD, color: STRING, description: STRING, team_id: STRING }, ['name']);
  var LABEL_UPDATE_PARAMS = schema({ label_id: ID_FIELD, name: STRING, color: STRING, description: STRING }, ['label_id']);
  var LABEL_ID_PARAMS = schema({ label_id: ID_FIELD }, ['label_id']);
  var MILESTONE_CREATE_PARAMS = schema({ project_id: ID_FIELD, name: ID_FIELD, description: STRING, target_date: STRING }, ['project_id', 'name']);
  var MILESTONE_UPDATE_PARAMS = schema({ milestone_id: ID_FIELD, name: STRING, description: STRING, target_date: STRING }, ['milestone_id']);
  var PROJECT_CREATE_PARAMS = schema({ name: ID_FIELD, description: STRING, team_ids: STRING_ARRAY, state: STRING, target_date: STRING }, ['name']);
  var PROJECT_UPDATE_PARAMS = schema({ project_id: ID_FIELD, name: STRING, description: STRING, state: STRING, target_date: STRING, start_date: STRING }, ['project_id']);
  var PROJECT_UPDATE_CREATE_PARAMS = schema({ project_id: ID_FIELD, body: ID_FIELD, health: ID_FIELD }, ['project_id', 'body', 'health']);
  var UPDATE_ID_PARAMS = schema({ update_id: ID_FIELD }, ['update_id']);
  var DELETE_ATTACHMENT_PARAMS = schema({ attachment_id: ID_FIELD }, ['attachment_id']);
  var DELETE_COMMENT_PARAMS = schema({ comment_id: ID_FIELD }, ['comment_id']);
  var CYCLE_ASSIGN_PARAMS = schema({ issue_id: ID_FIELD, cycle_id: STRING }, ['issue_id', 'cycle_id']);
  var MOVE_PROJECT_PARAMS = schema({ issue_id: ID_FIELD, project_id: ID_FIELD }, ['issue_id', 'project_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function intField(description, min, max) {
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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'linear-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function bool(value) {
    return value === true;
  }

  function nodes(connection) {
    return connection && Array.isArray(connection.nodes) ? connection.nodes : [];
  }

  function pageInfo(connection) {
    var info = connection && connection.pageInfo ? connection.pageInfo : {};
    return {
      has_next_page: info.hasNextPage === true,
      end_cursor: text(info.endCursor)
    };
  }

  function limit(value, fallbackValue, max) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) { return fallbackValue; }
    n = Math.floor(n);
    return n > max ? max : n;
  }

  function compactFilter(filter) {
    var out = {};
    for (var k in filter) {
      if (Object.prototype.hasOwnProperty.call(filter, k) && filter[k] !== undefined && filter[k] !== null) {
        out[k] = filter[k];
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  function mapIssue(i) {
    i = isObject(i) ? i : {};
    return {
      id: text(i.id),
      identifier: text(i.identifier),
      title: text(i.title),
      description: text(i.description),
      priority: number(i.priority),
      priority_label: text(i.priorityLabel),
      state_name: text(i.state && i.state.name),
      state_type: text(i.state && i.state.type),
      assignee_name: text((i.assignee && (i.assignee.displayName || i.assignee.name)) || ''),
      team_key: text(i.team && i.team.key),
      team_name: text(i.team && i.team.name),
      label_names: nodes(i.labels).map(function (l) { return text(l && l.name); }).filter(Boolean),
      project_name: text(i.project && i.project.name),
      cycle_number: number(i.cycle && i.cycle.number),
      due_date: text(i.dueDate),
      estimate: number(i.estimate),
      url: text(i.url),
      created_at: text(i.createdAt),
      updated_at: text(i.updatedAt)
    };
  }

  function mapComment(c) {
    c = isObject(c) ? c : {};
    return {
      id: text(c.id),
      body: text(c.body),
      user_name: text((c.user && (c.user.displayName || c.user.name)) || ''),
      created_at: text(c.createdAt),
      updated_at: text(c.updatedAt),
      edited_at: text(c.editedAt)
    };
  }

  function mapProject(p) {
    p = isObject(p) ? p : {};
    return {
      id: text(p.id),
      name: text(p.name),
      description: text(p.description),
      state: text(p.status && p.status.name),
      lead_name: text((p.lead && (p.lead.displayName || p.lead.name)) || ''),
      target_date: text(p.targetDate),
      start_date: text(p.startDate),
      url: text(p.url),
      created_at: text(p.createdAt),
      updated_at: text(p.updatedAt)
    };
  }

  function mapTeam(t) {
    t = isObject(t) ? t : {};
    return {
      id: text(t.id),
      key: text(t.key),
      name: text(t.name),
      description: text(t.description)
    };
  }

  function mapWorkflowState(s) {
    s = isObject(s) ? s : {};
    return {
      id: text(s.id),
      name: text(s.name),
      type: text(s.type),
      color: text(s.color),
      position: number(s.position)
    };
  }

  function mapLabel(l) {
    l = isObject(l) ? l : {};
    return {
      id: text(l.id),
      name: text(l.name),
      color: text(l.color),
      description: text(l.description),
      is_group: bool(l.isGroup),
      parent_name: text(l.parent && l.parent.name)
    };
  }

  function mapUser(u) {
    u = isObject(u) ? u : {};
    return {
      id: text(u.id),
      name: text(u.name),
      email: text(u.email),
      display_name: text(u.displayName || u.name),
      active: bool(u.active),
      admin: bool(u.admin)
    };
  }

  function mapCycle(c) {
    c = isObject(c) ? c : {};
    return {
      id: text(c.id),
      number: number(c.number),
      name: text(c.name),
      starts_at: text(c.startsAt),
      ends_at: text(c.endsAt),
      is_active: bool(c.isActive),
      completed_at: text(c.completedAt)
    };
  }

  function mapAttachment(a) {
    a = isObject(a) ? a : {};
    return {
      id: text(a.id),
      title: text(a.title),
      subtitle: text(a.subtitle),
      url: text(a.url),
      source_type: text(a.sourceType),
      creator_name: text((a.creator && (a.creator.displayName || a.creator.name)) || ''),
      created_at: text(a.createdAt),
      updated_at: text(a.updatedAt)
    };
  }

  function mapInitiative(i) {
    i = isObject(i) ? i : {};
    return {
      id: text(i.id),
      name: text(i.name),
      description: text(i.description),
      status: text(i.status),
      color: text(i.color),
      icon: text(i.icon),
      owner_name: text((i.owner && (i.owner.displayName || i.owner.name)) || ''),
      url: text(i.url),
      created_at: text(i.createdAt),
      updated_at: text(i.updatedAt)
    };
  }

  function mapDocument(d) {
    d = isObject(d) ? d : {};
    return {
      id: text(d.id),
      title: text(d.title),
      content: text(d.content),
      slug_id: text(d.slugId),
      icon: text(d.icon),
      creator_name: text((d.creator && (d.creator.displayName || d.creator.name)) || ''),
      project_name: text(d.project && d.project.name),
      url: text(d.url),
      created_at: text(d.createdAt),
      updated_at: text(d.updatedAt)
    };
  }

  function mapMilestone(m) {
    m = isObject(m) ? m : {};
    return {
      id: text(m.id),
      name: text(m.name),
      description: text(m.description),
      target_date: text(m.targetDate),
      sort_order: number(m.sortOrder)
    };
  }

  function mapStatusUpdate(u) {
    u = isObject(u) ? u : {};
    return {
      id: text(u.id),
      body: text(u.body),
      health: text(u.health),
      user_name: text((u.user && (u.user.displayName || u.user.name)) || ''),
      created_at: text(u.createdAt),
      updated_at: text(u.updatedAt)
    };
  }

  function mapIssueHistory(h) {
    h = isObject(h) ? h : {};
    return {
      id: text(h.id),
      actor_name: text((h.actor && (h.actor.displayName || h.actor.name)) || ''),
      from_state_name: text(h.fromState && h.fromState.name),
      to_state_name: text(h.toState && h.toState.name),
      from_assignee_name: text((h.fromAssignee && (h.fromAssignee.displayName || h.fromAssignee.name)) || ''),
      to_assignee_name: text((h.toAssignee && (h.toAssignee.displayName || h.toAssignee.name)) || ''),
      from_priority: number(h.fromPriority),
      to_priority: number(h.toPriority),
      created_at: text(h.createdAt)
    };
  }

  function mapRelation(r) {
    r = isObject(r) ? r : {};
    return {
      id: text(r.id),
      type: text(r.type),
      related_issue: {
        id: text(r.relatedIssue && r.relatedIssue.id),
        identifier: text(r.relatedIssue && r.relatedIssue.identifier),
        title: text(r.relatedIssue && r.relatedIssue.title),
        state: text(r.relatedIssue && r.relatedIssue.state && r.relatedIssue.state.name)
      }
    };
  }

  function authNeed() {
    return {
      kind: 'bearer',
      source: 'storage',
      storage: 'localStorage',
      tokenKey: 'ApplicationStore',
      parseJson: true,
      tokenPath: 'currentUserAccountId',
      header: 'useraccount',
      prefix: '',
      extraHeaders: [
        {
          header: 'user',
          storageKey: 'ApplicationStore',
          parseJson: true,
          tokenPath: 'currentUserId'
        },
        {
          header: 'organization',
          storageKey: 'ApplicationStore',
          parseJson: true,
          tokenPathTemplate: 'userAccounts.{currentUserAccountId}.users.0.organization.id',
          optional: true
        },
        {
          header: 'linear-client-id',
          storageKey: 'clientId',
          parseJson: false,
          optional: true
        }
      ]
    };
  }

  function graphqlSpec(query, variables) {
    return {
      url: GRAPHQL_ENDPOINT,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: { query: query, variables: variables || {} },
      query: {},
      authStrategy: 'same-origin-cookie',
      credentials: 'include',
      origin: ORIGIN,
      _authNeed: authNeed()
    };
  }

  function responseEnvelope(result) {
    if (isObject(result && result.data)) { return result.data; }
    if (isObject(result && result.json)) { return result.json; }
    if (typeof (result && result.text) === 'string' && result.text) {
      try {
        var parsed = JSON.parse(result.text);
        return isObject(parsed) ? parsed : null;
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  function graphData(result, slug) {
    if (!result || result.success !== true) {
      return result && result.success === false ? result : fallback(slug, 'linear-execute-bound-spec-failed');
    }
    var status = Number(result.status || 0);
    if (result.redirected || status === 401 || status === 403 || status >= 400) {
      return fallback(slug, 'linear-http-auth-or-rot');
    }
    var envelope = responseEnvelope(result);
    if (!envelope) { return fallback(slug, 'linear-non-json-response'); }
    if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
      return fallback(slug, 'linear-graphql-error');
    }
    if (!isObject(envelope.data)) { return fallback(slug, 'linear-empty-data'); }
    return { success: true, data: envelope.data };
  }

  async function runGraphql(slug, args, ctx, build) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'linear-execute-bound-spec-unavailable');
    }
    var built;
    try {
      built = build(args || {});
    } catch (_buildErr) {
      return fallback(slug, 'linear-invalid-params');
    }
    try {
      var result = await ctx.executeBoundSpec(graphqlSpec(built.query, built.variables), ctx.tabId);
      var data = graphData(result, slug);
      if (!data || data.success === false) { return data; }
      return { success: true, data: built.map(data.data) };
    } catch (_err) {
      return fallback(slug, 'linear-execute-bound-spec-threw');
    }
  }

  function read(slug, params, build) {
    return {
      slug: slug,
      tier: 'T1a',
      origin: ORIGIN,
      service: SERVICE,
      sideEffectClass: 'read',
      params: params,
      handle: async function (args, ctx) {
        return runGraphql(slug, args, ctx, build);
      }
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      slug: slug,
      tier: 'T1a',
      origin: ORIGIN,
      service: SERVICE,
      sideEffectClass: sideEffectClass,
      params: params,
      handle: async function () {
        return fallback(slug, 'linear-live-mutation-uat-required');
      }
    };
  }

  function oneById(name, root, idParam, fields, outKey, mapper) {
    return function (args) {
      return {
        query: 'query ' + name + '($id: String!) { ' + root + '(id: $id) { ' + fields + ' } }',
        variables: { id: args[idParam] },
        map: function (data) {
          var item = data[root];
          if (!item) { throw new Error('missing'); }
          var out = {};
          out[outKey] = mapper(item);
          return out;
        }
      };
    };
  }

  function nestedConnection(name, root, idParam, conn, fields, outKey, mapper, defaultLimit, maxLimit, extraArgs) {
    return function (args) {
      return {
        query: 'query ' + name + '($id: String!, $first: Int, $after: String) { ' + root +
          '(id: $id) { ' + conn + '(first: $first, after: $after' + (extraArgs || '') +
          ') { nodes { ' + fields + ' } pageInfo { hasNextPage endCursor } } } }',
        variables: { id: args[idParam], first: limit(args.limit, defaultLimit, maxLimit), after: args.after },
        map: function (data) {
          var parent = data[root];
          if (!parent) { throw new Error('missing'); }
          var connection = parent[conn] || {};
          var out = {};
          out[outKey] = nodes(connection).map(mapper);
          out.pagination = pageInfo(connection);
          return out;
        }
      };
    };
  }

  function getIssueBuild(args) {
    var isIdentifier = /^[A-Z]+-\d+$/i.test(text(args.issue_id));
    if (isIdentifier) {
      return {
        query: 'query GetIssueByIdentifier($identifier: String!) { searchIssues(term: $identifier, first: 1) { nodes { ' +
          ISSUE_FIELDS + ' } } }',
        variables: { identifier: args.issue_id },
        map: function (data) {
          var issue = nodes(data.searchIssues)[0];
          if (!issue) { throw new Error('missing'); }
          return { issue: mapIssue(issue) };
        }
      };
    }
    return oneById('GetIssue', 'issue', 'issue_id', ISSUE_FIELDS, 'issue', mapIssue)(args);
  }

  function getViewerBuild() {
    return {
      query: 'query GetViewer { viewer { ' + USER_FIELDS + ' organization { name urlKey } } }',
      variables: {},
      map: function (data) {
        if (!data.viewer) { throw new Error('missing'); }
        return {
          user: mapUser(data.viewer),
          organization_name: text(data.viewer.organization && data.viewer.organization.name),
          organization_url_key: text(data.viewer.organization && data.viewer.organization.urlKey)
        };
      }
    };
  }

  function getInitiativeBuild(args) {
    return {
      query: 'query GetInitiative($id: String!) { initiative(id: $id) { ' + INITIATIVE_FIELDS +
        ' projects { nodes { ' + PROJECT_FIELDS + ' } } } }',
      variables: { id: args.initiative_id },
      map: function (data) {
        if (!data.initiative) { throw new Error('missing'); }
        return {
          initiative: mapInitiative(data.initiative),
          projects: nodes(data.initiative.projects).map(mapProject)
        };
      }
    };
  }

  function listDocumentsBuild(args) {
    var filter = compactFilter({
      project: args.project_id ? { id: { eq: args.project_id } } : undefined
    });
    return {
      query: 'query ListDocuments($first: Int, $after: String, $filter: DocumentFilter) { ' +
        'documents(first: $first, after: $after, filter: $filter) { nodes { ' + DOCUMENT_FIELDS +
        ' } pageInfo { hasNextPage endCursor } } }',
      variables: { first: limit(args.limit, 25, 50), after: args.after, filter: filter },
      map: function (data) {
        if (!data.documents) { throw new Error('missing'); }
        return {
          documents: nodes(data.documents).map(mapDocument),
          pagination: pageInfo(data.documents)
        };
      }
    };
  }

  function listInitiativesBuild(args) {
    var filter = compactFilter({
      status: args.status ? { eq: args.status } : undefined
    });
    return {
      query: 'query ListInitiatives($first: Int, $after: String, $filter: InitiativeFilter) { ' +
        'initiatives(first: $first, after: $after, filter: $filter) { nodes { ' + INITIATIVE_FIELDS +
        ' } pageInfo { hasNextPage endCursor } } }',
      variables: { first: limit(args.limit, 25, 50), after: args.after, filter: filter },
      map: function (data) {
        if (!data.initiatives) { throw new Error('missing'); }
        return {
          initiatives: nodes(data.initiatives).map(mapInitiative),
          pagination: pageInfo(data.initiatives)
        };
      }
    };
  }

  function listIssueRelationsBuild(args) {
    var isIdentifier = /^[A-Z]+-\d+$/i.test(text(args.issue_id));
    if (isIdentifier) {
      return {
        query: 'query ListIssueRelationsByIdentifier($identifier: String!) { searchIssues(term: $identifier, first: 1) { nodes { relations { nodes { ' +
          RELATION_FIELDS + ' } } } } }',
        variables: { identifier: args.issue_id },
        map: function (data) {
          var issue = nodes(data.searchIssues)[0];
          if (!issue) { throw new Error('missing'); }
          return { relations: nodes(issue.relations).map(mapRelation) };
        }
      };
    }
    return {
      query: 'query ListIssueRelations($id: String!) { issue(id: $id) { relations { nodes { ' +
        RELATION_FIELDS + ' } } } }',
      variables: { id: args.issue_id },
      map: function (data) {
        if (!data.issue) { throw new Error('missing'); }
        return { relations: nodes(data.issue.relations).map(mapRelation) };
      }
    };
  }

  function listLabelsBuild() {
    return {
      query: 'query ListLabels { issueLabels { nodes { ' + LABEL_FIELDS + ' } } }',
      variables: {},
      map: function (data) {
        return { labels: nodes(data.issueLabels).map(mapLabel) };
      }
    };
  }

  function listMilestonesBuild(args) {
    return {
      query: 'query ListMilestones($id: String!) { project(id: $id) { projectMilestones { nodes { ' +
        MILESTONE_FIELDS + ' } } } }',
      variables: { id: args.project_id },
      map: function (data) {
        if (!data.project) { throw new Error('missing'); }
        return { milestones: nodes(data.project.projectMilestones).map(mapMilestone) };
      }
    };
  }

  function listProjectLabelsBuild(args) {
    return {
      query: 'query ListProjectLabels($id: String!) { project(id: $id) { labels { nodes { ' +
        LABEL_FIELDS + ' } } } }',
      variables: { id: args.project_id },
      map: function (data) {
        if (!data.project) { throw new Error('missing'); }
        return { labels: nodes(data.project.labels).map(mapLabel) };
      }
    };
  }

  function listProjectsBuild(args) {
    return {
      query: 'query ListProjects($first: Int, $after: String) { projects(first: $first, after: $after, orderBy: updatedAt) { nodes { ' +
        PROJECT_FIELDS + ' } pageInfo { hasNextPage endCursor } } }',
      variables: { first: limit(args.limit, 25, 50), after: args.after },
      map: function (data) {
        if (!data.projects) { throw new Error('missing'); }
        return {
          projects: nodes(data.projects).map(mapProject),
          pagination: pageInfo(data.projects)
        };
      }
    };
  }

  function listTeamsBuild() {
    return {
      query: 'query ListTeams { teams { nodes { ' + TEAM_FIELDS + ' } } }',
      variables: {},
      map: function (data) {
        return { teams: nodes(data.teams).map(mapTeam) };
      }
    };
  }

  function listUsersBuild(args) {
    return {
      query: 'query ListUsers($first: Int, $after: String) { users(first: $first, after: $after) { nodes { ' +
        USER_FIELDS + ' } pageInfo { hasNextPage endCursor } } }',
      variables: { first: limit(args.limit, 50, 100), after: args.after },
      map: function (data) {
        if (!data.users) { throw new Error('missing'); }
        return {
          users: nodes(data.users).map(mapUser),
          pagination: pageInfo(data.users)
        };
      }
    };
  }

  function workflowStatesBuild(args) {
    return {
      query: 'query ListWorkflowStates($id: String!) { team(id: $id) { states { nodes { ' +
        'id name type color position } } } }',
      variables: { id: args.team_id },
      map: function (data) {
        if (!data.team) { throw new Error('missing'); }
        var states = nodes(data.team.states).map(mapWorkflowState);
        states.sort(function (a, b) { return a.position - b.position; });
        return { states: states };
      }
    };
  }

  function searchIssuesBuild(args) {
    var first = limit(args.limit, 25, 50);
    var filter = compactFilter({
      team: args.team_key ? { key: { eq: args.team_key } } : undefined,
      state: args.state_name ? { name: { eqCaseInsensitive: args.state_name } } : undefined,
      labels: args.label_name ? { name: { eqCaseInsensitive: args.label_name } } : undefined,
      priority: args.priority !== undefined ? { eq: args.priority } : undefined,
      assignee: args.assignee_name ? { displayName: { containsIgnoreCase: args.assignee_name } } : undefined,
      project: args.project_name ? { name: { containsIgnoreCase: args.project_name } } : undefined
    });
    if (args.query) {
      return {
        query: 'query SearchIssues($query: String!, $first: Int, $after: String, $filter: IssueFilter) { ' +
          'searchIssues(term: $query, first: $first, after: $after, filter: $filter) { nodes { ' +
          ISSUE_FIELDS + ' } pageInfo { hasNextPage endCursor } totalCount } }',
        variables: { query: args.query, first: first, after: args.after, filter: filter },
        map: function (data) {
          if (!data.searchIssues) { throw new Error('missing'); }
          return {
            issues: nodes(data.searchIssues).map(mapIssue),
            pagination: pageInfo(data.searchIssues),
            total_count: number(data.searchIssues.totalCount)
          };
        }
      };
    }
    return {
      query: 'query ListIssues($first: Int, $after: String, $filter: IssueFilter) { ' +
        'issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) { nodes { ' +
        ISSUE_FIELDS + ' } pageInfo { hasNextPage endCursor } } }',
      variables: { first: first, after: args.after, filter: filter },
      map: function (data) {
        if (!data.issues) { throw new Error('missing'); }
        return {
          issues: nodes(data.issues).map(mapIssue),
          pagination: pageInfo(data.issues),
          total_count: -1
        };
      }
    };
  }

  var handlers = {
    'linear.get_attachment': read('linear.get_attachment', GET_ATTACHMENT_PARAMS,
      oneById('GetAttachment', 'attachment', 'attachment_id', ATTACHMENT_FIELDS, 'attachment', mapAttachment)),
    'linear.get_cycle': read('linear.get_cycle', GET_CYCLE_PARAMS,
      oneById('GetCycle', 'cycle', 'cycle_id', CYCLE_FIELDS, 'cycle', mapCycle)),
    'linear.get_document': read('linear.get_document', GET_DOCUMENT_PARAMS,
      oneById('GetDocument', 'document', 'document_id', DOCUMENT_FIELDS, 'document', mapDocument)),
    'linear.get_initiative': read('linear.get_initiative', GET_INITIATIVE_PARAMS, getInitiativeBuild),
    'linear.get_issue': read('linear.get_issue', GET_ISSUE_PARAMS, getIssueBuild),
    'linear.get_milestone': read('linear.get_milestone', GET_MILESTONE_PARAMS,
      oneById('GetMilestone', 'projectMilestone', 'milestone_id', MILESTONE_FIELDS, 'milestone', mapMilestone)),
    'linear.get_project': read('linear.get_project', GET_PROJECT_PARAMS,
      oneById('GetProject', 'project', 'project_id', PROJECT_FIELDS, 'project', mapProject)),
    'linear.get_team': read('linear.get_team', GET_TEAM_PARAMS,
      oneById('GetTeam', 'team', 'team_id', TEAM_FIELDS, 'team', mapTeam)),
    'linear.get_user': read('linear.get_user', GET_USER_PARAMS,
      oneById('GetUser', 'user', 'user_id', USER_FIELDS, 'user', mapUser)),
    'linear.get_viewer': read('linear.get_viewer', EMPTY_PARAMS, getViewerBuild),
    'linear.list_attachments': read('linear.list_attachments', ISSUE_PAGE_PARAMS,
      nestedConnection('ListAttachments', 'issue', 'issue_id', 'attachments', ATTACHMENT_FIELDS, 'attachments', mapAttachment, 25, 50, '')),
    'linear.list_comments': read('linear.list_comments', ISSUE_PAGE_PARAMS,
      nestedConnection('ListComments', 'issue', 'issue_id', 'comments', COMMENT_FIELDS, 'comments', mapComment, 25, 50, '')),
    'linear.list_cycles': read('linear.list_cycles', TEAM_PAGE_PARAMS,
      nestedConnection('ListCycles', 'team', 'team_id', 'cycles', CYCLE_FIELDS, 'cycles', mapCycle, 10, 50, ', orderBy: createdAt')),
    'linear.list_documents': read('linear.list_documents', LIST_DOCUMENTS_PARAMS, listDocumentsBuild),
    'linear.list_initiatives': read('linear.list_initiatives', LIST_INITIATIVES_PARAMS, listInitiativesBuild),
    'linear.list_issue_history': read('linear.list_issue_history', ISSUE_PAGE_PARAMS,
      nestedConnection('ListIssueHistory', 'issue', 'issue_id', 'history', HISTORY_FIELDS, 'history', mapIssueHistory, 25, 50, '')),
    'linear.list_issue_relations': read('linear.list_issue_relations', GET_ISSUE_PARAMS, listIssueRelationsBuild),
    'linear.list_labels': read('linear.list_labels', EMPTY_PARAMS, listLabelsBuild),
    'linear.list_milestones': read('linear.list_milestones', PROJECT_ID_PARAMS, listMilestonesBuild),
    'linear.list_project_labels': read('linear.list_project_labels', PROJECT_ID_PARAMS, listProjectLabelsBuild),
    'linear.list_project_updates': read('linear.list_project_updates', PROJECT_PAGE_PARAMS,
      nestedConnection('ListProjectUpdates', 'project', 'project_id', 'projectUpdates', STATUS_UPDATE_FIELDS, 'updates', mapStatusUpdate, 25, 50, '')),
    'linear.list_projects': read('linear.list_projects', LIST_PROJECTS_PARAMS, listProjectsBuild),
    'linear.list_sub_issues': read('linear.list_sub_issues', ISSUE_PAGE_PARAMS,
      nestedConnection('ListSubIssues', 'issue', 'issue_id', 'children', ISSUE_FIELDS, 'sub_issues', mapIssue, 25, 50, '')),
    'linear.list_team_members': read('linear.list_team_members', TEAM_PAGE_PARAMS,
      nestedConnection('ListTeamMembers', 'team', 'team_id', 'members', USER_FIELDS, 'members', mapUser, 50, 100, '')),
    'linear.list_teams': read('linear.list_teams', EMPTY_PARAMS, listTeamsBuild),
    'linear.list_users': read('linear.list_users', LIST_USERS_PARAMS, listUsersBuild),
    'linear.list_workflow_states': read('linear.list_workflow_states', GET_TEAM_PARAMS, workflowStatesBuild),
    'linear.search_issues': read('linear.search_issues', SEARCH_ISSUES_PARAMS, searchIssuesBuild),

    'linear.add_issue_label': guarded('linear.add_issue_label', 'write', ISSUE_ID_LABEL_PARAMS),
    'linear.add_issue_subscriber': guarded('linear.add_issue_subscriber', 'write', ISSUE_ID_SUBSCRIBER_PARAMS),
    'linear.archive_issue': guarded('linear.archive_issue', 'destructive', ISSUE_ID_PARAMS),
    'linear.batch_update_issues': guarded('linear.batch_update_issues', 'write', BATCH_UPDATE_ISSUES_PARAMS),
    'linear.create_attachment': guarded('linear.create_attachment', 'write', CREATE_ATTACHMENT_PARAMS),
    'linear.create_comment': guarded('linear.create_comment', 'write', COMMENT_PARAMS),
    'linear.create_document': guarded('linear.create_document', 'write', DOCUMENT_CREATE_PARAMS),
    'linear.create_initiative': guarded('linear.create_initiative', 'write', INITIATIVE_CREATE_PARAMS),
    'linear.create_issue': guarded('linear.create_issue', 'write', CREATE_ISSUE_PARAMS),
    'linear.create_issue_relation': guarded('linear.create_issue_relation', 'write', ISSUE_RELATION_CREATE_PARAMS),
    'linear.create_label': guarded('linear.create_label', 'write', LABEL_CREATE_PARAMS),
    'linear.create_milestone': guarded('linear.create_milestone', 'write', MILESTONE_CREATE_PARAMS),
    'linear.create_project': guarded('linear.create_project', 'write', PROJECT_CREATE_PARAMS),
    'linear.create_project_update': guarded('linear.create_project_update', 'write', PROJECT_UPDATE_CREATE_PARAMS),
    'linear.delete_attachment': guarded('linear.delete_attachment', 'destructive', DELETE_ATTACHMENT_PARAMS),
    'linear.delete_comment': guarded('linear.delete_comment', 'destructive', DELETE_COMMENT_PARAMS),
    'linear.delete_issue': guarded('linear.delete_issue', 'destructive', ISSUE_ID_PARAMS),
    'linear.delete_issue_relation': guarded('linear.delete_issue_relation', 'destructive', RELATION_ID_PARAMS),
    'linear.delete_label': guarded('linear.delete_label', 'destructive', LABEL_ID_PARAMS),
    'linear.delete_project_update': guarded('linear.delete_project_update', 'destructive', UPDATE_ID_PARAMS),
    'linear.move_issue_to_project': guarded('linear.move_issue_to_project', 'write', MOVE_PROJECT_PARAMS),
    'linear.remove_issue_label': guarded('linear.remove_issue_label', 'destructive', ISSUE_ID_LABEL_PARAMS),
    'linear.remove_issue_subscriber': guarded('linear.remove_issue_subscriber', 'destructive', ISSUE_ID_SUBSCRIBER_PARAMS),
    'linear.set_issue_cycle': guarded('linear.set_issue_cycle', 'write', CYCLE_ASSIGN_PARAMS),
    'linear.update_comment': guarded('linear.update_comment', 'write', UPDATE_COMMENT_PARAMS),
    'linear.update_document': guarded('linear.update_document', 'write', DOCUMENT_UPDATE_PARAMS),
    'linear.update_initiative': guarded('linear.update_initiative', 'write', INITIATIVE_UPDATE_PARAMS),
    'linear.update_issue': guarded('linear.update_issue', 'write', UPDATE_ISSUE_PARAMS),
    'linear.update_label': guarded('linear.update_label', 'write', LABEL_UPDATE_PARAMS),
    'linear.update_milestone': guarded('linear.update_milestone', 'write', MILESTONE_UPDATE_PARAMS),
    'linear.update_project': guarded('linear.update_project', 'write', PROJECT_UPDATE_PARAMS)
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

  global.FsbHandlerLinear = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
