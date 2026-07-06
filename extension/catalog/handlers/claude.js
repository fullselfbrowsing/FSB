(function (global) {
  'use strict';

  /**
   * Claude same-origin API head.
   *
   * Read descriptors execute against Claude's first-party /api paths with
   * same-origin cookies. Mutations remain guarded fail-closed until live
   * mutation-body UAT records their exact request shape.
   */

  var ORIGIN = 'https://claude.ai';
  var SERVICE = 'claude.ai';
  var API_BASE = ORIGIN + '/api';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

  var EMPTY_PARAMS = schema({}, []);
  var CONVERSATION_PARAMS = schema({
    conversation_uuid: stringField('UUID of the conversation')
  }, ['conversation_uuid']);
  var PROJECT_PARAMS = schema({
    project_uuid: stringField('Project UUID')
  }, ['project_uuid']);
  var CREATE_CONVERSATION_PARAMS = schema({
    message: stringField('Initial message to send in the new conversation'),
    model: { type: 'string', description: 'Model to use' }
  }, ['message']);
  var CREATE_PROJECT_PARAMS = schema({
    name: stringField('Project name'),
    description: { type: 'string', description: 'Project description' }
  }, ['name']);
  var SEND_MESSAGE_PARAMS = schema({
    conversation_uuid: stringField('UUID of the conversation'),
    message: stringField('Message text to send'),
    model: { type: 'string', description: 'Model to use' }
  }, ['conversation_uuid', 'message']);
  var UPDATE_CONVERSATION_PARAMS = schema({
    conversation_uuid: stringField('UUID of the conversation'),
    name: stringField('New name for the conversation')
  }, ['conversation_uuid', 'name']);
  var UPDATE_PROJECT_PARAMS = schema({
    project_uuid: stringField('Project UUID'),
    name: { type: 'string', description: 'New project name' },
    description: { type: 'string', description: 'New project description' }
  }, ['project_uuid']);

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
      reason: reason || 'claude-api-shape-mismatch',
      fellBackToDom: true
    });
  }

  function str(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function bool(value) {
    return value === true;
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
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

  function apiSpec(path, pairs) {
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

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected ||
      status === 401 || status === 403 || status >= 400;
  }

  function parseData(result) {
    if (!result) { return null; }
    if (result.data !== undefined && result.data !== null) { return result.data; }
    if (typeof result.text === 'string' && result.text) {
      try { return JSON.parse(result.text); } catch (e) { return null; }
    }
    return null;
  }

  function errorEnvelope(data) {
    return isObject(data) && (
      data.error === true ||
      isObject(data.error) ||
      Array.isArray(data.errors) ||
      data.success === false
    );
  }

  async function callApi(slug, ctx, path, pairs) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'claude-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(apiSpec(path, pairs || []), ctx.tabId);
    if (resultFailed(result)) { return fallback(slug, 'claude-http-error'); }
    var data = parseData(result);
    if (data === null || data === undefined || errorEnvelope(data)) {
      return fallback(slug, 'claude-api-shape-mismatch');
    }
    return { success: true, result: result, data: data };
  }

  function withData(result, data) {
    return {
      success: true,
      status: result && result.status,
      data: data
    };
  }

  function mapOrganization(o) {
    o = o || {};
    return {
      uuid: str(o.uuid),
      name: str(o.name),
      billing_type: o.billing_type === undefined ? null : o.billing_type,
      capabilities: list(o.capabilities).map(str),
      rate_limit_tier: str(o.rate_limit_tier),
      created_at: str(o.created_at)
    };
  }

  function mapAccount(a) {
    a = a || {};
    return {
      uuid: str(a.uuid),
      email_address: str(a.email_address),
      full_name: a.full_name === undefined ? null : a.full_name,
      display_name: a.display_name === undefined ? null : a.display_name,
      created_at: str(a.created_at),
      is_verified: bool(a.is_verified)
    };
  }

  function mapConversation(c) {
    c = c || {};
    return {
      uuid: str(c.uuid),
      name: str(c.name),
      summary: str(c.summary),
      model: str(c.model),
      created_at: str(c.created_at),
      updated_at: str(c.updated_at),
      is_starred: bool(c.is_starred),
      project_uuid: c.project_uuid === undefined ? null : c.project_uuid
    };
  }

  function mapMessage(m) {
    m = m || {};
    var content = list(m.content);
    var text = str(m.text);
    if (!text) {
      for (var i = 0; i < content.length; i++) {
        if (content[i] && content[i].type === 'text') {
          text = str(content[i].text);
          break;
        }
      }
    }
    return {
      uuid: str(m.uuid),
      text: text,
      sender: str(m.sender),
      index: num(m.index),
      created_at: str(m.created_at),
      parent_message_uuid: str(m.parent_message_uuid)
    };
  }

  function mapProject(p) {
    p = p || {};
    return {
      uuid: str(p.uuid),
      name: str(p.name),
      description: str(p.description),
      is_private: bool(p.is_private),
      is_starred: bool(p.is_starred),
      created_at: str(p.created_at),
      updated_at: str(p.updated_at),
      archived_at: p.archived_at === undefined ? null : p.archived_at,
      docs_count: num(p.docs_count),
      files_count: num(p.files_count)
    };
  }

  function mapModel(m) {
    m = m || {};
    return {
      model: str(m.model),
      name: str(m.name),
      description: str(m.description)
    };
  }

  async function getOrganizations(slug, ctx) {
    var api = await callApi(slug, ctx, '/organizations', []);
    if (!api || api.success === false) { return api; }
    if (!Array.isArray(api.data)) { return fallback(slug, 'claude-organizations-shape-mismatch'); }
    return api;
  }

  async function getOrgId(slug, ctx) {
    var api = await getOrganizations(slug, ctx);
    if (!api || api.success === false) { return api; }
    var orgs = list(api.data);
    var first = orgs.length ? orgs[0] : null;
    if (!first || !first.uuid) { return fallback(slug, 'claude-organization-missing'); }
    return { success: true, orgId: str(first.uuid) };
  }

  async function callOrgApi(slug, ctx, path, pairs) {
    var org = await getOrgId(slug, ctx);
    if (!org || org.success === false) { return org; }
    return callApi(slug, ctx, '/organizations/' + encodeSegment(org.orgId) + path, pairs || []);
  }

  function readHandler(slug, params, reader) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return reader(args || {}, ctx, slug);
      }
    };
  }

  function guarded(slug, params, sideEffectClass, reason) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass || 'write',
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'claude.list_organizations': readHandler('claude.list_organizations', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var api = await getOrganizations(slug, ctx);
      if (!api || api.success === false) { return api; }
      return withData(api.result, { organizations: api.data.map(mapOrganization) });
    }),
    'claude.get_current_user': readHandler('claude.get_current_user', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var org = await getOrgId(slug, ctx);
      if (!org || org.success === false) { return org; }
      var api = await callApi(slug, ctx, '/bootstrap/' + encodeSegment(org.orgId) + '/app_start', []);
      if (!api || api.success === false) { return api; }
      if (!isObject(api.data.account)) { return fallback(slug, 'claude-account-shape-mismatch'); }
      return withData(api.result, { account: mapAccount(api.data.account) });
    }),
    'claude.list_models': readHandler('claude.list_models', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var org = await getOrgId(slug, ctx);
      if (!org || org.success === false) { return org; }
      var api = await callApi(slug, ctx, '/bootstrap/' + encodeSegment(org.orgId) + '/app_start', []);
      if (!api || api.success === false) { return api; }
      var memberships = list(api.data.account && api.data.account.memberships);
      var membership = null;
      for (var i = 0; i < memberships.length; i++) {
        var candidate = memberships[i];
        if (candidate && candidate.organization && candidate.organization.uuid === org.orgId) {
          membership = candidate;
          break;
        }
      }
      if (!membership) { membership = memberships[0] || null; }
      var models = list(membership && membership.organization && membership.organization.claude_ai_bootstrap_models_config);
      return withData(api.result, { models: models.map(mapModel) });
    }),
    'claude.list_conversations': readHandler('claude.list_conversations', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var api = await callOrgApi(slug, ctx, '/chat_conversations', []);
      if (!api || api.success === false) { return api; }
      if (!Array.isArray(api.data)) { return fallback(slug, 'claude-conversations-shape-mismatch'); }
      return withData(api.result, { conversations: api.data.map(mapConversation) });
    }),
    'claude.get_conversation': readHandler('claude.get_conversation', CONVERSATION_PARAMS, async function(args, ctx, slug) {
      var api = await callOrgApi(slug, ctx, '/chat_conversations/' + encodeSegment(args.conversation_uuid), [
        ['tree', 'True'],
        ['rendering_mode', 'messages']
      ]);
      if (!api || api.success === false) { return api; }
      if (!isObject(api.data) || !hasOwn(api.data, 'uuid')) {
        return fallback(slug, 'claude-conversation-shape-mismatch');
      }
      var base = mapConversation(api.data);
      base.messages = list(api.data.chat_messages).map(mapMessage);
      return withData(api.result, base);
    }),
    'claude.list_projects': readHandler('claude.list_projects', EMPTY_PARAMS, async function(_args, ctx, slug) {
      var api = await callOrgApi(slug, ctx, '/projects', []);
      if (!api || api.success === false) { return api; }
      if (!Array.isArray(api.data)) { return fallback(slug, 'claude-projects-shape-mismatch'); }
      return withData(api.result, { projects: api.data.map(mapProject) });
    }),
    'claude.get_project': readHandler('claude.get_project', PROJECT_PARAMS, async function(args, ctx, slug) {
      var api = await callOrgApi(slug, ctx, '/projects/' + encodeSegment(args.project_uuid), []);
      if (!api || api.success === false) { return api; }
      if (!isObject(api.data) || !hasOwn(api.data, 'uuid')) {
        return fallback(slug, 'claude-project-shape-mismatch');
      }
      return withData(api.result, { project: mapProject(api.data) });
    }),

    'claude.create_conversation': guarded('claude.create_conversation', CREATE_CONVERSATION_PARAMS, 'write', 'unverified-claude-create-conversation-mutation'),
    'claude.create_project': guarded('claude.create_project', CREATE_PROJECT_PARAMS, 'write', 'unverified-claude-create-project-mutation'),
    'claude.delete_conversation': guarded('claude.delete_conversation', CONVERSATION_PARAMS, 'destructive', 'unverified-claude-delete-conversation-mutation'),
    'claude.delete_project': guarded('claude.delete_project', PROJECT_PARAMS, 'destructive', 'unverified-claude-delete-project-mutation'),
    'claude.send_message': guarded('claude.send_message', SEND_MESSAGE_PARAMS, 'write', 'unverified-claude-send-message-mutation'),
    'claude.update_conversation': guarded('claude.update_conversation', UPDATE_CONVERSATION_PARAMS, 'write', 'unverified-claude-update-conversation-mutation'),
    'claude.update_project': guarded('claude.update_project', UPDATE_PROJECT_PARAMS, 'write', 'unverified-claude-update-project-mutation')
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

  global.FsbHandlerClaude = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
