(function (global) {
  'use strict';

  /**
   * ChatGPT same-origin backend-api READ head.
   *
   * Ports only GET descriptors. Conversation mutation and custom-instruction
   * writes remain out of this handler until live mutation-body UAT activates them.
   */

  var ORIGIN = 'https://chatgpt.com';
  var SERVICE = 'chatgpt.com';
  var API_BASE = ORIGIN + '/backend-api';
  var SESSION_URL = ORIGIN + '/api/auth/session';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({});
  var CONVERSATION_PARAMS = schema({
    conversation_id: { type: 'string', minLength: 1, description: 'Conversation ID (UUID)' }
  }, ['conversation_id']);
  var GPT_PARAMS = schema({
    gpt_id: { type: 'string', minLength: 1, description: 'GPT ID (for example, g-alKfVrz9K)' }
  }, ['gpt_id']);
  var DISCOVER_GPTS_PARAMS = schema({
    cursor: integerSchema('Pagination cursor', 0),
    limit: integerSchema('Number of results per category', 1, 50),
    locale: { type: 'string', description: 'Locale for results' }
  });
  var LIST_CONVERSATIONS_PARAMS = schema({
    offset: integerSchema('Pagination offset', 0),
    limit: integerSchema('Number of conversations to return', 1, 100),
    order: { type: 'string', enum: ['updated', 'created'], description: 'Sort order' }
  });
  var LIST_SHARED_CONVERSATIONS_PARAMS = schema({
    offset: integerSchema('Pagination offset', 0),
    limit: integerSchema('Number of shared conversations to return', 1, 100)
  });
  var SEARCH_CONVERSATIONS_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search query text' },
    limit: integerSchema('Maximum results to return', 1, 100)
  }, ['query']);

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
      reason: reason || 'chatgpt-backend-shape-mismatch',
      fellBackToDom: true
    });
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

  function sessionSpec() {
    return {
      url: SESSION_URL,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function backendSpec(path, pairs, accessToken) {
    return {
      url: API_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
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

  function resultData(result, slug, reasonPrefix) {
    if (!result || result.success !== true) {
      return fallback(slug, reasonPrefix + '-request-failed');
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, reasonPrefix + '-http-error');
    }
    if (result.data === undefined || result.data === null || looksLikeError(result.data)) {
      return fallback(slug, reasonPrefix + '-shape-mismatch');
    }
    return result.data;
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

  function unixSecondsToIso(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : '';
  }

  function mapUser(raw) {
    var u = raw || {};
    return {
      id: str(u.id),
      email: str(u.email),
      name: str(u.name),
      picture: str(u.picture),
      country: str(u.country),
      created: unixSecondsToIso(u.created)
    };
  }

  function mapConversationListItem(raw) {
    var c = raw || {};
    return {
      id: str(c.id || c.conversation_id),
      title: str(c.title),
      create_time: str(c.create_time),
      update_time: typeof c.update_time === 'number' ? unixSecondsToIso(c.update_time) : str(c.update_time),
      is_archived: bool(c.is_archived),
      is_starred: bool(c.is_starred),
      gizmo_id: str(c.gizmo_id),
      snippet: str(c.snippet || (c.payload && c.payload.snippet))
    };
  }

  function extractTextFromParts(parts) {
    return list(parts).filter(function(part) {
      return typeof part === 'string';
    }).join('\n');
  }

  function mapMessage(raw) {
    var m = raw || {};
    return {
      id: str(m.id),
      role: str(m.author && m.author.role),
      content_type: str(m.content && m.content.content_type),
      text: extractTextFromParts(m.content && m.content.parts),
      model: str(m.metadata && m.metadata.model_slug),
      create_time: unixSecondsToIso(m.create_time)
    };
  }

  function mapModel(raw) {
    var m = raw || {};
    return {
      slug: str(m.slug),
      title: str(m.title),
      max_tokens: num(m.max_tokens),
      tags: list(m.tags).map(str),
      enabled_tools: list(m.enabled_tools).map(str)
    };
  }

  function mapMemory(raw) {
    var m = raw || {};
    return {
      id: str(m.id),
      content: str(m.content),
      created_at: unixSecondsToIso(m.created_at),
      updated_at: unixSecondsToIso(m.updated_at)
    };
  }

  function mapGpt(raw) {
    var g = raw || {};
    return {
      id: str(g.id),
      name: str(g.display && g.display.name),
      description: str(g.display && g.display.description),
      short_url: str(g.short_url),
      author_name: str(g.author && g.author.display_name),
      num_interactions: num(g.num_interactions),
      tags: list(g.tags).map(str),
      created_at: str(g.created_at),
      updated_at: str(g.updated_at)
    };
  }

  function mapPrompt(raw) {
    var p = raw || {};
    return {
      id: str(p.id),
      title: str(p.title),
      description: str(p.description),
      prompt: str(p.prompt),
      category: str(p.category)
    };
  }

  function mapConversationDetail(raw) {
    var c = raw || {};
    var messages = [];
    if (isObject(c.mapping)) {
      var parentMap = Object.create(null);
      Object.keys(c.mapping).forEach(function(nodeId) {
        var node = c.mapping[nodeId] || {};
        list(node.children).forEach(function(childId) {
          parentMap[childId] = nodeId;
        });
      });

      var ordered = [];
      var current = c.current_node;
      while (current) {
        ordered.unshift(current);
        current = parentMap[current];
      }

      ordered.forEach(function(nodeId) {
        var node = c.mapping[nodeId] || {};
        var message = node.message || null;
        var parts = message && message.content && message.content.parts;
        if (message && list(parts).length > 0) {
          var text = extractTextFromParts(parts);
          if (text || !(message.author && message.author.role === 'system')) {
            messages.push(mapMessage(message));
          }
        }
      });
    }

    return {
      id: str(c.conversation_id),
      title: str(c.title),
      create_time: unixSecondsToIso(c.create_time),
      update_time: unixSecondsToIso(c.update_time),
      is_archived: bool(c.is_archived),
      is_starred: bool(c.is_starred),
      default_model: str(c.default_model_slug),
      messages: messages
    };
  }

  async function accessToken(slug, ctx) {
    var res = await ctx.executeBoundSpec(sessionSpec(), ctx.tabId);
    var data = resultData(res, slug, 'chatgpt-session');
    if (!data || data.success === false || !isObject(data) || !data.accessToken) {
      return fallback(slug, 'chatgpt-not-authenticated');
    }
    return str(data.accessToken);
  }

  async function callBackend(slug, args, ctx, path, pairs, parser) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'chatgpt-execute-bound-spec-unavailable');
    }
    var token = await accessToken(slug, ctx);
    if (!token || (token && token.success === false)) { return token; }
    var res = await ctx.executeBoundSpec(backendSpec(path, pairs || [], token), ctx.tabId);
    var data = resultData(res, slug, 'chatgpt-backend');
    if (!data || data.success === false) { return data; }
    var parsed = parser(data, args || {});
    if (!parsed) { return fallback(slug, 'chatgpt-backend-shape-mismatch'); }
    return { success: true, data: parsed };
  }

  function readHandler(slug, params, pathForArgs, pairsForArgs, parser) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var safeArgs = args || {};
        var path = typeof pathForArgs === 'function' ? pathForArgs(safeArgs) : pathForArgs;
        var pairs = typeof pairsForArgs === 'function' ? pairsForArgs(safeArgs) : (pairsForArgs || []);
        return callBackend(slug, safeArgs, ctx, path, pairs, parser);
      }
    };
  }

  function parseListConversations(data) {
    if (!isObject(data) || !Array.isArray(data.items)) { return null; }
    return {
      conversations: data.items.map(mapConversationListItem),
      total: num(data.total)
    };
  }

  function parseSearchConversations(data) {
    if (!isObject(data) || !Array.isArray(data.items)) { return null; }
    return {
      conversations: data.items.map(mapConversationListItem),
      cursor: str(data.cursor)
    };
  }

  function parseConversation(data) {
    if (!isObject(data) || !isObject(data.mapping)) { return null; }
    return { conversation: mapConversationDetail(data) };
  }

  function parseModels(data) {
    if (!isObject(data) || !Array.isArray(data.models)) { return null; }
    return {
      models: data.models.map(mapModel),
      default_model: str(data.default_model_slug)
    };
  }

  function parseAccountInfo(data) {
    if (!isObject(data) || !isObject(data.accounts) || !Array.isArray(data.account_ordering)) { return null; }
    var accountId = data.account_ordering[0] || '';
    var account = data.accounts[accountId] || {};
    return {
      plan_type: str(account.entitlement && account.entitlement.subscription_plan),
      is_paid: bool(account.is_paid),
      features: list(account.features).map(str)
    };
  }

  function parseBetaFeatures(data) {
    if (!isObject(data)) { return null; }
    var features = {};
    Object.keys(data).forEach(function(key) {
      if (typeof data[key] === 'boolean') { features[key] = data[key]; }
    });
    return { features: features };
  }

  function parseCustomInstructions(data) {
    if (!isObject(data)) { return null; }
    return {
      enabled: bool(data.enabled),
      about_user: str(data.about_user_message),
      about_model: str(data.about_model_message)
    };
  }

  function parseMemories(data) {
    if (!isObject(data) || !Array.isArray(data.memories)) { return null; }
    return {
      memories: data.memories.map(mapMemory),
      memory_max_tokens: num(data.memory_max_tokens),
      memory_num_tokens: num(data.memory_num_tokens)
    };
  }

  function parsePromptLibrary(data) {
    if (!isObject(data) || !Array.isArray(data.items)) { return null; }
    return { prompts: data.items.map(mapPrompt) };
  }

  function parseGpt(data) {
    if (!isObject(data) || !isObject(data.gizmo)) { return null; }
    return { gpt: mapGpt(data.gizmo) };
  }

  function parseDiscoverGpts(data) {
    if (!isObject(data) || !Array.isArray(data.cuts)) { return null; }
    return {
      categories: data.cuts.map(function(cut) {
        return {
          title: str(cut && cut.info && cut.info.title),
          gpts: list(cut && cut.list && cut.list.items).map(function(item) {
            return mapGpt(item && item.resource && item.resource.gizmo);
          })
        };
      })
    };
  }

  function parseCurrentUser(data) {
    if (!isObject(data) || (!data.id && !data.email)) { return null; }
    return { user: mapUser(data) };
  }

  var handlers = {
    'chatgpt.discover_gpts': readHandler('chatgpt.discover_gpts', DISCOVER_GPTS_PARAMS, '/gizmos/discovery', function(args) {
      return [['cursor', args.cursor === undefined ? 0 : args.cursor], ['limit', args.limit === undefined ? 10 : args.limit], ['locale', args.locale || 'en-US']];
    }, parseDiscoverGpts),
    'chatgpt.get_account_info': readHandler('chatgpt.get_account_info', EMPTY_PARAMS, '/accounts/check/v4-2023-04-27', null, parseAccountInfo),
    'chatgpt.get_beta_features': readHandler('chatgpt.get_beta_features', EMPTY_PARAMS, '/settings/beta_features', null, parseBetaFeatures),
    'chatgpt.get_conversation': readHandler('chatgpt.get_conversation', CONVERSATION_PARAMS, function(args) {
      return '/conversation/' + encodeURIComponent(str(args.conversation_id));
    }, null, parseConversation),
    'chatgpt.get_current_user': readHandler('chatgpt.get_current_user', EMPTY_PARAMS, '/me', null, parseCurrentUser),
    'chatgpt.get_custom_instructions': readHandler('chatgpt.get_custom_instructions', EMPTY_PARAMS, '/user_system_messages', null, parseCustomInstructions),
    'chatgpt.get_gpt': readHandler('chatgpt.get_gpt', GPT_PARAMS, function(args) {
      return '/gizmos/' + encodeURIComponent(str(args.gpt_id));
    }, null, parseGpt),
    'chatgpt.get_memories': readHandler('chatgpt.get_memories', EMPTY_PARAMS, '/memories', null, parseMemories),
    'chatgpt.get_prompt_library': readHandler('chatgpt.get_prompt_library', EMPTY_PARAMS, '/prompt_library/', null, parsePromptLibrary),
    'chatgpt.list_conversations': readHandler('chatgpt.list_conversations', LIST_CONVERSATIONS_PARAMS, '/conversations', function(args) {
      return [['offset', args.offset === undefined ? 0 : args.offset], ['limit', args.limit === undefined ? 28 : args.limit], ['order', args.order || 'updated']];
    }, parseListConversations),
    'chatgpt.list_models': readHandler('chatgpt.list_models', EMPTY_PARAMS, '/models', function() {
      return [['history_and_training_disabled', false]];
    }, parseModels),
    'chatgpt.list_shared_conversations': readHandler('chatgpt.list_shared_conversations', LIST_SHARED_CONVERSATIONS_PARAMS, '/shared_conversations', function(args) {
      return [['offset', args.offset === undefined ? 0 : args.offset], ['limit', args.limit === undefined ? 25 : args.limit]];
    }, parseListConversations),
    'chatgpt.search_conversations': readHandler('chatgpt.search_conversations', SEARCH_CONVERSATIONS_PARAMS, '/conversations/search', function(args) {
      return [['query', args.query], ['limit', args.limit === undefined ? 28 : args.limit]];
    }, parseSearchConversations)
  };

  function registerAll() {
    var catalog = global.FsbCapabilityCatalog;
    if (!catalog || typeof catalog.registerHandler !== 'function') { return; }
    for (var slug in handlers) {
      if (!Object.prototype.hasOwnProperty.call(handlers, slug)) { continue; }
      catalog.registerHandler(slug, {
        tier: 'T1a',
        handler: handlers[slug],
        origin: ORIGIN,
        params: handlers[slug].params,
        descriptor: {
          slug: slug,
          service: SERVICE,
          sideEffectClass: 'read',
          params: handlers[slug].params
        }
      });
    }
  }

  global.FsbHandlerChatgpt = handlers;
  registerAll();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
