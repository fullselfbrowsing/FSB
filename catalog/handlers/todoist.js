(function (global) {
  'use strict';

  var ORIGIN = 'https://app.todoist.com';
  var SERVICE = 'app.todoist.com';
  var API_BASE = ORIGIN + '/api/v1';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var COMMENT_ID_PARAMS = schema({ comment_id: stringParam('Comment ID') }, ['comment_id']);
  var LABEL_ID_PARAMS = schema({ label_id: stringParam('Label ID') }, ['label_id']);
  var PROJECT_ID_PARAMS = schema({ project_id: stringParam('Project ID') }, ['project_id']);
  var SECTION_ID_PARAMS = schema({ section_id: stringParam('Section ID') }, ['section_id']);
  var TASK_ID_PARAMS = schema({ task_id: stringParam('Task ID') }, ['task_id']);

  var LIST_COMMENTS_PARAMS = schema({
    task_id: { type: 'string', description: 'Task ID to list comments for' },
    project_id: { type: 'string', description: 'Project ID to list comments for' }
  }, []);
  var LIST_SECTIONS_PARAMS = schema({
    project_id: { type: 'string', description: 'Filter sections by project ID' }
  }, []);
  var LIST_SHARED_LABELS_PARAMS = schema({
    omit_personal: { type: 'boolean', description: 'Whether to exclude personal labels from the results' }
  }, []);
  var LIST_TASKS_PARAMS = schema({
    project_id: { type: 'string', description: 'Filter tasks by project ID' },
    section_id: { type: 'string', description: 'Filter tasks by section ID' },
    label: { type: 'string', description: 'Filter tasks by label name' }
  }, []);

  var CREATE_COMMENT_PARAMS = schema({
    content: stringParam('Comment content in markdown'),
    task_id: { type: 'string', description: 'Task ID to add the comment to' },
    project_id: { type: 'string', description: 'Project ID to add the comment to' }
  }, ['content']);
  var CREATE_LABEL_PARAMS = schema({
    name: stringParam('Name of the new label'),
    color: { type: 'string', description: 'Label color name' },
    order: intParam('Position among labels'),
    is_favorite: { type: 'boolean', description: 'Whether to mark the label as a favorite' }
  }, ['name']);
  var CREATE_PROJECT_PARAMS = schema({
    name: stringParam('Name of the new project'),
    parent_id: { type: 'string', description: 'Parent project ID' },
    color: { type: 'string', description: 'Project color name' },
    is_favorite: { type: 'boolean', description: 'Whether to mark the project as a favorite' },
    view_style: { type: 'string', description: 'View style' }
  }, ['name']);
  var CREATE_SECTION_PARAMS = schema({
    name: stringParam('Name of the section to create'),
    project_id: stringParam('Project ID to create the section in'),
    order: intParam('Position among sections')
  }, ['name', 'project_id']);
  var CREATE_TASK_PARAMS = schema({
    content: stringParam('Task content/title'),
    description: { type: 'string', description: 'Task description in markdown' },
    project_id: { type: 'string', description: 'Project ID to create the task in' },
    section_id: { type: 'string', description: 'Section ID within the project' },
    parent_id: { type: 'string', description: 'Parent task ID to create a subtask' },
    labels: { type: 'array', items: { type: 'string' }, description: 'List of label names to apply' },
    priority: { type: 'integer', minimum: 1, maximum: 4, description: 'Priority from 1 to 4' },
    due_string: { type: 'string', description: 'Human-readable due date string' },
    due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
    due_datetime: { type: 'string', description: 'Due datetime in RFC3339 format' },
    assignee_id: { type: 'string', description: 'User ID to assign the task to' },
    duration: { type: 'number', description: 'Estimated duration amount' },
    duration_unit: { type: 'string', enum: ['minute', 'day'], description: 'Duration unit' }
  }, ['content']);
  var RENAME_SHARED_LABEL_PARAMS = schema({
    name: stringParam('Current name of the shared label'),
    new_name: stringParam('New name for the shared label')
  }, ['name', 'new_name']);
  var REMOVE_SHARED_LABEL_PARAMS = schema({
    name: stringParam('Name of the shared label to remove')
  }, ['name']);
  var UPDATE_COMMENT_PARAMS = schema({
    comment_id: stringParam('Comment ID'),
    content: stringParam('New comment content in markdown')
  }, ['comment_id', 'content']);
  var UPDATE_LABEL_PARAMS = schema({
    label_id: stringParam('Label ID'),
    name: { type: 'string', description: 'New name for the label' },
    color: { type: 'string', description: 'New color name' },
    order: intParam('New position among labels'),
    is_favorite: { type: 'boolean', description: 'Whether to mark the label as a favorite' }
  }, ['label_id']);
  var UPDATE_PROJECT_PARAMS = schema({
    project_id: stringParam('Project ID'),
    name: { type: 'string', description: 'New name for the project' },
    color: { type: 'string', description: 'New color name' },
    is_favorite: { type: 'boolean', description: 'Whether to mark the project as a favorite' },
    view_style: { type: 'string', description: 'New view style' }
  }, ['project_id']);
  var UPDATE_SECTION_PARAMS = schema({
    section_id: stringParam('Section ID'),
    name: stringParam('New name for the section')
  }, ['section_id', 'name']);
  var UPDATE_TASK_PARAMS = schema({
    task_id: stringParam('Task ID'),
    content: { type: 'string', description: 'New task content/title' },
    description: { type: 'string', description: 'New task description in markdown' },
    labels: { type: 'array', items: { type: 'string' }, description: 'New list of label names' },
    priority: { type: 'integer', minimum: 1, maximum: 4, description: 'Priority from 1 to 4' },
    due_string: { type: 'string', description: 'Human-readable due date string' },
    due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
    due_datetime: { type: 'string', description: 'Due datetime in RFC3339 format' },
    assignee_id: { type: 'string', description: 'User ID to assign the task to' },
    duration: { type: 'number', description: 'Estimated duration amount' },
    duration_unit: { type: 'string', enum: ['minute', 'day'], description: 'Duration unit' }
  }, ['task_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function stringParam(description) {
    return { type: 'string', minLength: 1, description: description };
  }

  function intParam(description) {
    return { type: 'integer', minimum: -INT_LIMIT, maximum: INT_LIMIT, description: description };
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
      reason: reason,
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeError(value) {
    return isObject(value) && (
      typeof value.error === 'string' ||
      typeof value.message === 'string' ||
      Array.isArray(value.errors) ||
      isObject(value.error)
    );
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

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
  }

  function buildGetSpec(path, pairs) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@',
      _authNeed: {
        kind: 'bearer',
        source: 'storage',
        storage: 'localStorage',
        tokenKey: 'User',
        tokenField: 'token',
        parseJson: true,
        header: 'Authorization',
        prefix: 'Bearer '
      }
    };
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

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function mapDue(d) {
    d = d || {};
    return {
      string: str(d.string),
      date: str(d.date),
      is_recurring: bool(d.is_recurring),
      datetime: d.datetime === undefined ? null : d.datetime,
      timezone: d.timezone === undefined ? null : d.timezone
    };
  }

  function mapDuration(d) {
    d = d || {};
    return {
      amount: num(d.amount),
      unit: str(d.unit) || 'minute'
    };
  }

  function mapProject(p) {
    p = p || {};
    return {
      id: str(p.id),
      name: str(p.name),
      color: str(p.color),
      description: str(p.description),
      parent_id: p.parent_id === undefined ? null : p.parent_id,
      child_order: num(p.child_order),
      is_favorite: bool(p.is_favorite),
      is_archived: bool(p.is_archived),
      is_shared: bool(p.is_shared),
      view_style: str(p.view_style) || 'list',
      created_at: str(p.created_at),
      updated_at: str(p.updated_at),
      inbox_project: bool(p.inbox_project)
    };
  }

  function mapTask(t) {
    t = t || {};
    return {
      id: str(t.id),
      content: str(t.content),
      description: str(t.description),
      project_id: str(t.project_id),
      section_id: t.section_id === undefined ? null : t.section_id,
      parent_id: t.parent_id === undefined ? null : t.parent_id,
      labels: list(t.labels).map(str),
      priority: num(t.priority) || 1,
      due: t.due ? mapDue(t.due) : null,
      deadline: t.deadline && t.deadline.date ? { date: str(t.deadline.date) } : null,
      duration: t.duration ? mapDuration(t.duration) : null,
      is_completed: bool(t.checked),
      order: num(t.child_order),
      created_at: str(t.added_at),
      creator_id: str(t.user_id),
      assignee_id: t.responsible_uid === undefined ? null : t.responsible_uid,
      comment_count: num(t.note_count),
      url: t.id ? 'https://app.todoist.com/app/task/' + str(t.id) : ''
    };
  }

  function mapSection(s) {
    s = s || {};
    return {
      id: str(s.id),
      name: str(s.name),
      project_id: str(s.project_id),
      order: num(s.section_order),
      is_archived: bool(s.is_archived),
      created_at: str(s.added_at),
      updated_at: str(s.updated_at)
    };
  }

  function mapComment(c) {
    c = c || {};
    return {
      id: str(c.id),
      content: str(c.content),
      task_id: str(c.item_id),
      posted_at: str(c.posted_at),
      poster_id: str(c.posted_uid)
    };
  }

  function mapLabel(l) {
    l = l || {};
    return {
      id: str(l.id),
      name: str(l.name),
      color: str(l.color),
      order: num(l.order),
      is_favorite: bool(l.is_favorite)
    };
  }

  function mapCollaborator(c) {
    c = c || {};
    return {
      id: str(c.id),
      name: str(c.name),
      email: str(c.email)
    };
  }

  function guardResult(result, slug, kind) {
    if (!result || result.success !== true) {
      return fallback(slug, 'todoist-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'todoist-logged-out-or-http-error');
    }
    var data = result.data;
    if (looksLikeError(data)) {
      return fallback(slug, 'todoist-error-envelope');
    }
    if (kind === 'list') {
      if (!isObject(data) || !Array.isArray(data.results)) {
        return fallback(slug, 'todoist-list-shape-mismatch');
      }
      return data;
    }
    if (!isObject(data)) {
      return fallback(slug, 'todoist-object-shape-mismatch');
    }
    return data;
  }

  async function callTodoist(slug, path, pairs, ctx, kind) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'todoist-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(buildGetSpec(path, pairs || []), ctx.tabId);
    return guardResult(result, slug, kind);
  }

  function readObjectHandler(slug, params, pathBuilder, key, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var data = await callTodoist(slug, pathBuilder(args || {}), [], ctx, 'object');
        if (data && data.success === false) { return data; }
        var out = {};
        out[key] = mapper(data);
        return { success: true, status: 200, data: out };
      }
    };
  }

  function readListHandler(slug, params, pathBuilder, pairsBuilder, key, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var a = args || {};
        var data = await callTodoist(slug, pathBuilder(a), pairsBuilder ? pairsBuilder(a) : [], ctx, 'list');
        if (data && data.success === false) { return data; }
        var out = {};
        out[key] = list(data.results).map(mapper || str);
        if (data.next_cursor !== undefined) { out.next_cursor = data.next_cursor; }
        return { success: true, status: 200, data: out };
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'todoist.get_comment': readObjectHandler('todoist.get_comment', COMMENT_ID_PARAMS, function(a) {
      return '/comments/' + encodeSegment(a.comment_id);
    }, 'comment', mapComment),
    'todoist.get_label': readObjectHandler('todoist.get_label', LABEL_ID_PARAMS, function(a) {
      return '/labels/' + encodeSegment(a.label_id);
    }, 'label', mapLabel),
    'todoist.get_project': readObjectHandler('todoist.get_project', PROJECT_ID_PARAMS, function(a) {
      return '/projects/' + encodeSegment(a.project_id);
    }, 'project', mapProject),
    'todoist.get_section': readObjectHandler('todoist.get_section', SECTION_ID_PARAMS, function(a) {
      return '/sections/' + encodeSegment(a.section_id);
    }, 'section', mapSection),
    'todoist.get_task': readObjectHandler('todoist.get_task', TASK_ID_PARAMS, function(a) {
      return '/tasks/' + encodeSegment(a.task_id);
    }, 'task', mapTask),
    'todoist.list_collaborators': readListHandler('todoist.list_collaborators', PROJECT_ID_PARAMS, function(a) {
      return '/projects/' + encodeSegment(a.project_id) + '/collaborators';
    }, null, 'collaborators', mapCollaborator),
    'todoist.list_comments': readListHandler('todoist.list_comments', LIST_COMMENTS_PARAMS, function() {
      return '/comments';
    }, function(a) {
      return [['task_id', a.task_id], ['project_id', a.project_id]];
    }, 'comments', mapComment),
    'todoist.list_labels': readListHandler('todoist.list_labels', EMPTY_PARAMS, function() {
      return '/labels';
    }, null, 'labels', mapLabel),
    'todoist.list_projects': readListHandler('todoist.list_projects', EMPTY_PARAMS, function() {
      return '/projects';
    }, null, 'projects', mapProject),
    'todoist.list_sections': readListHandler('todoist.list_sections', LIST_SECTIONS_PARAMS, function() {
      return '/sections';
    }, function(a) {
      return [['project_id', a.project_id]];
    }, 'sections', mapSection),
    'todoist.list_shared_labels': readListHandler('todoist.list_shared_labels', LIST_SHARED_LABELS_PARAMS, function() {
      return '/labels/shared';
    }, function(a) {
      return [['omit_personal', a.omit_personal]];
    }, 'labels', str),
    'todoist.list_tasks': readListHandler('todoist.list_tasks', LIST_TASKS_PARAMS, function() {
      return '/tasks';
    }, function(a) {
      return [['project_id', a.project_id], ['section_id', a.section_id], ['label', a.label]];
    }, 'tasks', mapTask),

    'todoist.archive_project': guarded('todoist.archive_project', 'destructive', PROJECT_ID_PARAMS, 'unverified-todoist-archive-project-mutation'),
    'todoist.close_task': guarded('todoist.close_task', 'write', TASK_ID_PARAMS, 'unverified-todoist-close-task-mutation'),
    'todoist.create_comment': guarded('todoist.create_comment', 'write', CREATE_COMMENT_PARAMS, 'unverified-todoist-create-comment-mutation'),
    'todoist.create_label': guarded('todoist.create_label', 'write', CREATE_LABEL_PARAMS, 'unverified-todoist-create-label-mutation'),
    'todoist.create_project': guarded('todoist.create_project', 'write', CREATE_PROJECT_PARAMS, 'unverified-todoist-create-project-mutation'),
    'todoist.create_section': guarded('todoist.create_section', 'write', CREATE_SECTION_PARAMS, 'unverified-todoist-create-section-mutation'),
    'todoist.create_task': guarded('todoist.create_task', 'write', CREATE_TASK_PARAMS, 'unverified-todoist-create-task-mutation'),
    'todoist.delete_comment': guarded('todoist.delete_comment', 'destructive', COMMENT_ID_PARAMS, 'unverified-todoist-delete-comment-mutation'),
    'todoist.delete_label': guarded('todoist.delete_label', 'destructive', LABEL_ID_PARAMS, 'unverified-todoist-delete-label-mutation'),
    'todoist.delete_project': guarded('todoist.delete_project', 'destructive', PROJECT_ID_PARAMS, 'unverified-todoist-delete-project-mutation'),
    'todoist.delete_section': guarded('todoist.delete_section', 'destructive', SECTION_ID_PARAMS, 'unverified-todoist-delete-section-mutation'),
    'todoist.delete_task': guarded('todoist.delete_task', 'destructive', TASK_ID_PARAMS, 'unverified-todoist-delete-task-mutation'),
    'todoist.remove_shared_label': guarded('todoist.remove_shared_label', 'destructive', REMOVE_SHARED_LABEL_PARAMS, 'unverified-todoist-remove-shared-label-mutation'),
    'todoist.rename_shared_label': guarded('todoist.rename_shared_label', 'write', RENAME_SHARED_LABEL_PARAMS, 'unverified-todoist-rename-shared-label-mutation'),
    'todoist.reopen_task': guarded('todoist.reopen_task', 'write', TASK_ID_PARAMS, 'unverified-todoist-reopen-task-mutation'),
    'todoist.unarchive_project': guarded('todoist.unarchive_project', 'write', PROJECT_ID_PARAMS, 'unverified-todoist-unarchive-project-mutation'),
    'todoist.update_comment': guarded('todoist.update_comment', 'write', UPDATE_COMMENT_PARAMS, 'unverified-todoist-update-comment-mutation'),
    'todoist.update_label': guarded('todoist.update_label', 'write', UPDATE_LABEL_PARAMS, 'unverified-todoist-update-label-mutation'),
    'todoist.update_project': guarded('todoist.update_project', 'write', UPDATE_PROJECT_PARAMS, 'unverified-todoist-update-project-mutation'),
    'todoist.update_section': guarded('todoist.update_section', 'write', UPDATE_SECTION_PARAMS, 'unverified-todoist-update-section-mutation'),
    'todoist.update_task': guarded('todoist.update_task', 'write', UPDATE_TASK_PARAMS, 'unverified-todoist-update-task-mutation')
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
            service: SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTodoist = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
