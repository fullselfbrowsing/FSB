(function (global) {
  'use strict';

  /**
   * Zendesk same-origin REST API READ head.
   *
   * Zendesk accounts commonly run on tenant subdomains under zendesk.com. The
   * catalog entry is pinned to zendesk.com for resolver bookkeeping, while each
   * read spec is bound to the active Zendesk tab origin supplied by the router.
   * Ticket mutations stay guarded fail-closed until live mutation-body UAT records
   * the exact method/path/body shape.
   */

  var ORIGIN = 'https://zendesk.com';
  var SERVICE = 'zendesk.com';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var STRING_REQUIRED = { type: 'string', minLength: 1 };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var TICKET_ID_PARAMS = schema({ ticket_id: integerSchema('Ticket ID') }, ['ticket_id']);
  var ORGANIZATION_ID_PARAMS = schema({ organization_id: integerSchema('Organization ID') }, ['organization_id']);
  var USER_ID_PARAMS = schema({ user_id: integerSchema('User ID') }, ['user_id']);
  var VIEW_TICKETS_PARAMS = schema({
    view_id: integerSchema('View ID'),
    page: integerSchema('Page number', 1),
    per_page: integerSchema('Results per page', 1, 100)
  }, ['view_id']);
  var LIST_PARAMS = schema({
    page: integerSchema('Page number', 1),
    per_page: integerSchema('Results per page', 1, 100)
  }, []);
  var LIST_TICKETS_PARAMS = schema({
    page: integerSchema('Page number', 1),
    per_page: integerSchema('Results per page', 1, 100),
    sort_by: STRING,
    sort_order: { type: 'string', enum: ['asc', 'desc'] }
  }, []);
  var LIST_USERS_PARAMS = schema({
    page: integerSchema('Page number', 1),
    per_page: integerSchema('Results per page', 1, 100),
    role: { type: 'string', enum: ['end-user', 'agent', 'admin'] }
  }, []);
  var LIST_COMMENTS_PARAMS = schema({
    ticket_id: integerSchema('Ticket ID'),
    page: integerSchema('Page number', 1),
    per_page: integerSchema('Results per page', 1, 100)
  }, ['ticket_id']);
  var SEARCH_PARAMS = schema({
    query: STRING_REQUIRED,
    page: integerSchema('Page number', 1),
    per_page: integerSchema('Results per page', 1, 100),
    sort_by: STRING,
    sort_order: { type: 'string', enum: ['asc', 'desc'] }
  }, ['query']);
  var ADD_COMMENT_PARAMS = schema({
    ticket_id: integerSchema('Ticket ID'),
    body: STRING_REQUIRED,
    public: BOOLEAN
  }, ['ticket_id', 'body']);
  var CREATE_TICKET_PARAMS = schema({
    subject: STRING_REQUIRED,
    body: STRING_REQUIRED,
    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    type: { type: 'string', enum: ['problem', 'incident', 'question', 'task'] },
    tags: { type: 'array', items: { type: 'string' } },
    assignee_id: integerSchema('Assignee user ID'),
    group_id: integerSchema('Group ID'),
    requester_id: integerSchema('Requester user ID')
  }, ['subject', 'body']);
  var UPDATE_TICKET_PARAMS = schema({
    ticket_id: integerSchema('Ticket ID'),
    subject: STRING,
    status: { type: 'string', enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'] },
    priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    type: { type: 'string', enum: ['problem', 'incident', 'question', 'task'] },
    tags: { type: 'array', items: { type: 'string' } },
    assignee_id: integerSchema('Assignee user ID'),
    group_id: integerSchema('Group ID')
  }, ['ticket_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integerSchema(description, min, max) {
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
      reason: reason || 'zendesk-api-shape-mismatch',
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

  function zendeskOriginFromContext(ctx) {
    var candidates = [];
    if (ctx && typeof ctx.origin === 'string') { candidates.push(ctx.origin); }
    if (ctx && typeof ctx.url === 'string') { candidates.push(ctx.url); }
    candidates.push(ORIGIN);
    for (var i = 0; i < candidates.length; i++) {
      try {
        var u = new URL(candidates[i]);
        var host = String(u.hostname || '').toLowerCase();
        if (u.protocol === 'https:' && (host === 'zendesk.com' || host.endsWith('.zendesk.com'))) {
          return u.origin;
        }
      } catch (_err) {
        // Try the next candidate.
      }
    }
    return '';
  }

  function apiSpec(origin, path, pairs) {
    return {
      url: origin + '/api/v2' + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: origin,
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

  function resultData(result, slug) {
    if (!result || result.success !== true) {
      return fallback(slug, 'zendesk-api-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'zendesk-api-http-error');
    }
    if (!isObject(result.data) || looksLikeError(result.data)) {
      return fallback(slug, 'zendesk-api-shape-mismatch');
    }
    return result.data;
  }

  async function readApi(slug, path, pairs, mapper, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'zendesk-execute-bound-spec-unavailable');
    }
    var origin = zendeskOriginFromContext(ctx);
    if (!origin) { return fallback(slug, 'zendesk-active-origin-unavailable'); }
    var res = await ctx.executeBoundSpec(apiSpec(origin, path, pairs || []), ctx.tabId);
    var data = resultData(res, slug);
    if (!data || data.success === false) { return data; }
    try {
      var mapped = mapper(data);
      if (!mapped) { return fallback(slug, 'zendesk-api-shape-mismatch'); }
      return { success: true, status: res.status, finalUrl: res.finalUrl, redirected: res.redirected, data: mapped };
    } catch (_err) {
      return fallback(slug, 'zendesk-api-shape-mismatch');
    }
  }

  function mapTicket(t) {
    return {
      id: num(t && t.id),
      subject: str(t && t.subject),
      description: str(t && t.description),
      status: str(t && t.status),
      priority: str(t && t.priority),
      type: str(t && t.type),
      requester_id: num(t && t.requester_id),
      submitter_id: num(t && t.submitter_id),
      assignee_id: num(t && t.assignee_id),
      group_id: num(t && t.group_id),
      organization_id: num(t && t.organization_id),
      tags: list(t && t.tags).map(str),
      created_at: str(t && t.created_at),
      updated_at: str(t && t.updated_at),
      due_at: str(t && t.due_at),
      url: str(t && t.url)
    };
  }

  function mapComment(c) {
    return {
      id: num(c && c.id),
      body: str(c && c.body),
      author_id: num(c && c.author_id),
      public: c && c.public === false ? false : true,
      created_at: str(c && c.created_at)
    };
  }

  function mapUser(u) {
    return {
      id: num(u && u.id),
      name: str(u && u.name),
      email: str(u && u.email),
      role: str(u && u.role),
      active: bool(u && u.active),
      phone: str(u && u.phone),
      organization_id: num(u && u.organization_id),
      created_at: str(u && u.created_at),
      updated_at: str(u && u.updated_at)
    };
  }

  function mapOrganization(o) {
    return {
      id: num(o && o.id),
      name: str(o && o.name),
      domain_names: list(o && o.domain_names).map(str),
      details: str(o && o.details),
      notes: str(o && o.notes),
      tags: list(o && o.tags).map(str),
      created_at: str(o && o.created_at),
      updated_at: str(o && o.updated_at)
    };
  }

  function mapGroup(g) {
    return {
      id: num(g && g.id),
      name: str(g && g.name),
      description: str(g && g.description),
      default: bool(g && g.default),
      created_at: str(g && g.created_at),
      updated_at: str(g && g.updated_at)
    };
  }

  function mapView(v) {
    return {
      id: num(v && v.id),
      title: str(v && v.title),
      active: bool(v && v.active),
      description: str(v && v.description),
      created_at: str(v && v.created_at),
      updated_at: str(v && v.updated_at)
    };
  }

  function mapSearchResult(r) {
    return {
      id: num(r && r.id),
      result_type: str(r && r.result_type),
      subject: str((r && r.subject) || (r && r.name)),
      status: str(r && r.status),
      created_at: str(r && r.created_at),
      updated_at: str(r && r.updated_at)
    };
  }

  function objectMapper(key, outKey, mapper) {
    return function(data) {
      if (!isObject(data[key])) { return null; }
      var out = {};
      out[outKey] = mapper(data[key]);
      return out;
    };
  }

  function arrayMapper(key, outKey, mapper, includeCount) {
    return function(data) {
      if (!Array.isArray(data[key])) { return null; }
      var out = {};
      out[outKey] = data[key].map(mapper);
      if (includeCount) { out.count = num(data.count); }
      return out;
    };
  }

  function readHandler(slug, params, pathForArgs, pairsForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var a = args || {};
        var path = typeof pathForArgs === 'function' ? pathForArgs(a) : pathForArgs;
        var pairs = typeof pairsForArgs === 'function' ? pairsForArgs(a) : [];
        return readApi(slug, path, pairs, mapper, ctx);
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
        return fallback(slug, 'zendesk-mutation-body-uat-required');
      }
    };
  }

  var handlers = {
    'zendesk.get_current_user': readHandler('zendesk.get_current_user', EMPTY_PARAMS, '/users/me.json', null, objectMapper('user', 'user', mapUser)),
    'zendesk.get_organization': readHandler('zendesk.get_organization', ORGANIZATION_ID_PARAMS, function(a) {
      return '/organizations/' + encodeSegment(a.organization_id) + '.json';
    }, null, objectMapper('organization', 'organization', mapOrganization)),
    'zendesk.get_ticket': readHandler('zendesk.get_ticket', TICKET_ID_PARAMS, function(a) {
      return '/tickets/' + encodeSegment(a.ticket_id) + '.json';
    }, null, objectMapper('ticket', 'ticket', mapTicket)),
    'zendesk.get_user': readHandler('zendesk.get_user', USER_ID_PARAMS, function(a) {
      return '/users/' + encodeSegment(a.user_id) + '.json';
    }, null, objectMapper('user', 'user', mapUser)),
    'zendesk.get_view_tickets': readHandler('zendesk.get_view_tickets', VIEW_TICKETS_PARAMS, function(a) {
      return '/views/' + encodeSegment(a.view_id) + '/tickets.json';
    }, function(a) {
      return [['page', a.page], ['per_page', a.per_page]];
    }, arrayMapper('tickets', 'tickets', mapTicket, true)),
    'zendesk.list_groups': readHandler('zendesk.list_groups', EMPTY_PARAMS, '/groups.json', null, arrayMapper('groups', 'groups', mapGroup, true)),
    'zendesk.list_organizations': readHandler('zendesk.list_organizations', LIST_PARAMS, '/organizations.json', function(a) {
      return [['page', a.page], ['per_page', a.per_page]];
    }, arrayMapper('organizations', 'organizations', mapOrganization, true)),
    'zendesk.list_tags': readHandler('zendesk.list_tags', EMPTY_PARAMS, '/tags.json', null, function(data) {
      if (!Array.isArray(data.tags)) { return null; }
      return {
        tags: data.tags.map(function(t) {
          return { name: str(t && t.name), count: num(t && t.count) };
        })
      };
    }),
    'zendesk.list_ticket_comments': readHandler('zendesk.list_ticket_comments', LIST_COMMENTS_PARAMS, function(a) {
      return '/tickets/' + encodeSegment(a.ticket_id) + '/comments.json';
    }, function(a) {
      return [['page', a.page], ['per_page', a.per_page]];
    }, arrayMapper('comments', 'comments', mapComment, false)),
    'zendesk.list_tickets': readHandler('zendesk.list_tickets', LIST_TICKETS_PARAMS, '/tickets.json', function(a) {
      return [['page', a.page], ['per_page', a.per_page], ['sort_by', a.sort_by], ['sort_order', a.sort_order]];
    }, arrayMapper('tickets', 'tickets', mapTicket, true)),
    'zendesk.list_users': readHandler('zendesk.list_users', LIST_USERS_PARAMS, '/users.json', function(a) {
      return [['page', a.page], ['per_page', a.per_page], ['role', a.role]];
    }, arrayMapper('users', 'users', mapUser, true)),
    'zendesk.list_views': readHandler('zendesk.list_views', EMPTY_PARAMS, '/views.json', null, arrayMapper('views', 'views', mapView, true)),
    'zendesk.search': readHandler('zendesk.search', SEARCH_PARAMS, '/search.json', function(a) {
      return [['query', a.query], ['page', a.page], ['per_page', a.per_page], ['sort_by', a.sort_by], ['sort_order', a.sort_order]];
    }, arrayMapper('results', 'results', mapSearchResult, true)),
    'zendesk.add_ticket_comment': guarded('zendesk.add_ticket_comment', 'write', ADD_COMMENT_PARAMS),
    'zendesk.create_ticket': guarded('zendesk.create_ticket', 'write', CREATE_TICKET_PARAMS),
    'zendesk.delete_ticket': guarded('zendesk.delete_ticket', 'destructive', TICKET_ID_PARAMS),
    'zendesk.update_ticket': guarded('zendesk.update_ticket', 'write', UPDATE_TICKET_PARAMS)
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

  global.FsbHandlerZendesk = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
