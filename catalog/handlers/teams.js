(function (global) {
  'use strict';

  /**
   * Microsoft Teams Graph READ head.
   *
   * Teams keeps Microsoft Graph tokens in first-party page state. Read handlers
   * obtain token candidates only through the bounded page-read primitive, then issue
   * GET-only Graph specs through the bound fetch primitive. Mutation-capable Teams
   * rows are registered as T1a but guarded fail-closed until live mutation evidence
   * records the exact method, path, body, consent, and redaction proof.
   */

  var TEAMS_ORIGIN = 'https://teams.live.com';
  var TEAMS_SERVICE = 'teams.live.com';
  var GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';
  var INT_LIMIT = 9007199254740991;

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  var STRING = { type: 'string' };
  var STRING_ID = { type: 'string', minLength: 1 };
  var EMPTY_PARAMS = schema({}, []);
  var PAGE_SIZE_50 = { type: 'integer', minimum: 1, maximum: 50 };
  var PAGE_SIZE_200 = { type: 'integer', minimum: 1, maximum: 200 };
  var CONVERSATION_PARAMS = schema({ conversation_id: STRING_ID }, ['conversation_id']);
  var LIST_CONVERSATIONS_PARAMS = schema({ page_size: PAGE_SIZE_50 }, []);
  var READ_MESSAGES_PARAMS = schema({
    conversation_id: STRING_ID,
    page_size: PAGE_SIZE_200
  }, ['conversation_id']);
  var CREATE_CHAT_PARAMS = schema({
    members: { type: 'array', minItems: 1, items: STRING_ID },
    topic: STRING
  }, ['members']);
  var MESSAGE_PARAMS = schema({
    conversation_id: STRING_ID,
    message_id: STRING_ID
  }, ['conversation_id', 'message_id']);
  var EDIT_MESSAGE_PARAMS = schema({
    conversation_id: STRING_ID,
    message_id: STRING_ID,
    text: STRING_ID
  }, ['conversation_id', 'message_id', 'text']);
  var MEMBER_PARAMS = schema({
    conversation_id: STRING_ID,
    user: STRING_ID
  }, ['conversation_id', 'user']);
  var SEND_MESSAGE_PARAMS = schema({
    conversation_id: STRING_ID,
    text: STRING_ID
  }, ['conversation_id', 'text']);
  var TOPIC_PARAMS = schema({
    conversation_id: STRING_ID,
    topic: STRING_ID
  }, ['conversation_id', 'topic']);

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
      reason: reason || 'teams-graph-shape-mismatch',
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value || ''));
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

  function positiveInt(value, fallbackValue, max) {
    var n = Number(value);
    if (!isFinite(n) || n < 1) { n = fallbackValue; }
    n = Math.floor(n);
    return n > max ? max : n;
  }

  function graphGetSpec(path, pairs, graphToken) {
    return {
      url: GRAPH_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + graphToken
      },
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: TEAMS_ORIGIN,
      extract: '@'
    };
  }

  function looksLikeGraphError(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (Object.prototype.hasOwnProperty.call(data, 'error')
        || Array.isArray(data.errors)
        || typeof data.message === 'string');
  }

  function withMappedData(result, mapped) {
    var out = {};
    for (var k in result) {
      if (Object.prototype.hasOwnProperty.call(result, k)) { out[k] = result[k]; }
    }
    out.data = mapped;
    return out;
  }

  function mapGraphResult(result, slug, mapper) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'teams-graph-auth-failed');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeGraphError(data)) {
      return fallback(slug, 'teams-graph-shape-mismatch');
    }
    try {
      return withMappedData(result, mapper ? mapper(data) : data);
    } catch (err) {
      return fallback(slug, 'teams-map-shape-mismatch');
    }
  }

  async function authContext(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'teams-page-read-primitive-unavailable');
    }
    var result = await ctx.executeBoundPageRead({
      origin: TEAMS_ORIGIN,
      namespace: 'teams',
      action: 'auth_context',
      args: {}
    }, ctx.tabId);
    if (!result || result.success !== true) {
      return result || fallback(slug, 'teams-auth-context-unavailable');
    }
    var data = result.data || {};
    var graphTokens = Array.isArray(data.graph_tokens) ? data.graph_tokens : [];
    graphTokens = graphTokens.filter(function(token) {
      return typeof token === 'string' && token.length >= 16;
    });
    if (!graphTokens.length && typeof data.graph_token === 'string' && data.graph_token.length >= 16) {
      graphTokens = [data.graph_token];
    }
    if (!graphTokens.length) { return fallback(slug, 'teams-graph-token-unavailable'); }
    return { success: true, graphTokens: graphTokens };
  }

  async function graphRead(slug, args, ctx, requestForArgs, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'teams-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var req = requestForArgs(args || {});
    if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
    for (var i = 0; i < auth.graphTokens.length; i++) {
      var result = await ctx.executeBoundSpec(
        graphGetSpec(req.path, req.pairs || [], auth.graphTokens[i]),
        ctx.tabId
      );
      if (result && (result.status === 401 || result.status === 403)) { continue; }
      return mapGraphResult(result, slug, mapper);
    }
    return fallback(slug, 'teams-graph-auth-failed');
  }

  function collectionValues(data) {
    return Array.isArray(data.value) ? data.value : [];
  }

  function mapUser(data) {
    return { user: {
      id: data.id || '',
      display_name: data.displayName || '',
      mail: data.mail || '',
      user_principal_name: data.userPrincipalName || '',
      given_name: data.givenName || '',
      surname: data.surname || '',
      job_title: data.jobTitle || ''
    } };
  }

  function mapChat(chat) {
    chat = chat || {};
    var topic = chat.topic || '';
    return {
      id: chat.id || '',
      topic: topic,
      title: topic,
      chat_type: chat.chatType || '',
      created_at: chat.createdDateTime || '',
      last_updated_at: chat.lastUpdatedDateTime || '',
      web_url: chat.webUrl || '',
      tenant_id: chat.tenantId || ''
    };
  }

  function mapIdentity(identity) {
    identity = identity || {};
    var user = identity.user || {};
    var application = identity.application || {};
    return {
      user_id: user.id || '',
      display_name: user.displayName || application.displayName || '',
      application_id: application.id || ''
    };
  }

  function mapMessage(message) {
    message = message || {};
    var body = message.body || {};
    return {
      id: message.id || '',
      created_at: message.createdDateTime || '',
      last_modified_at: message.lastModifiedDateTime || '',
      deleted_at: message.deletedDateTime || '',
      from: mapIdentity(message.from || {}),
      importance: message.importance || '',
      locale: message.locale || '',
      subject: message.subject || '',
      summary: message.summary || '',
      body_type: body.contentType || '',
      body: body.content || '',
      web_url: message.webUrl || ''
    };
  }

  function mapMember(member) {
    member = member || {};
    return {
      id: member.id || '',
      display_name: member.displayName || '',
      roles: Array.isArray(member.roles) ? member.roles : [],
      user_id: member.userId || '',
      email: member.email || '',
      tenant_id: member.tenantId || ''
    };
  }

  function mapChatList(data) {
    var conversations = collectionValues(data).map(mapChat);
    return {
      conversations: conversations,
      chats: conversations,
      count: conversations.length,
      next_link: data['@odata.nextLink'] || ''
    };
  }

  function mapMessageList(data) {
    var messages = collectionValues(data).map(mapMessage);
    return {
      messages: messages,
      count: messages.length,
      next_link: data['@odata.nextLink'] || ''
    };
  }

  async function getConversationDetails(args, ctx) {
    var chatId = String((args || {}).conversation_id || '');
    if (!chatId) { return fallback('teams.get_conversation_details', 'teams-conversation-id-required'); }
    var detail = await graphRead('teams.get_conversation_details', args, ctx, function() {
      return { path: '/chats/' + encodeSegment(chatId), pairs: [] };
    }, function(data) {
      return { conversation: mapChat(data) };
    });
    if (!detail || detail.success !== true) { return detail; }
    var members = await graphRead('teams.get_conversation_details', args, ctx, function() {
      return { path: '/chats/' + encodeSegment(chatId) + '/members', pairs: [] };
    }, function(data) {
      return { members: collectionValues(data).map(mapMember) };
    });
    if (!members || members.success !== true) { return members; }
    detail.data.members = members.data.members;
    return detail;
  }

  function readHandler(slug, params, action, requestForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: TEAMS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (action === 'get_conversation_details') {
          return getConversationDetails(args || {}, ctx);
        }
        return graphRead(slug, args || {}, ctx, requestForArgs, mapper);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: TEAMS_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-teams-mutation');
      }
    };
  }

  var handlers = {
    'teams.get_current_user': readHandler('teams.get_current_user', EMPTY_PARAMS, 'get_current_user', function() {
      return {
        path: '/me',
        pairs: [['$select', 'id,displayName,mail,userPrincipalName,givenName,surname,jobTitle']]
      };
    }, mapUser),
    'teams.list_conversations': readHandler('teams.list_conversations', LIST_CONVERSATIONS_PARAMS, 'list_conversations', function(a) {
      return { path: '/me/chats', pairs: [['$top', positiveInt(a.page_size, 20, 50)]] };
    }, mapChatList),
    'teams.get_conversation_details': readHandler('teams.get_conversation_details', CONVERSATION_PARAMS, 'get_conversation_details'),
    'teams.read_messages': readHandler('teams.read_messages', READ_MESSAGES_PARAMS, 'read_messages', function(a) {
      return {
        path: '/chats/' + encodeSegment(a.conversation_id) + '/messages',
        pairs: [['$top', positiveInt(a.page_size, 20, 200)]]
      };
    }, mapMessageList),

    'teams.create_chat': guarded('teams.create_chat', 'write', CREATE_CHAT_PARAMS),
    'teams.delete_message': guarded('teams.delete_message', 'destructive', MESSAGE_PARAMS),
    'teams.edit_message': guarded('teams.edit_message', 'write', EDIT_MESSAGE_PARAMS),
    'teams.invite_to_channel': guarded('teams.invite_to_channel', 'write', MEMBER_PARAMS),
    'teams.remove_member': guarded('teams.remove_member', 'destructive', MEMBER_PARAMS),
    'teams.send_message': guarded('teams.send_message', 'write', SEND_MESSAGE_PARAMS),
    'teams.set_channel_topic': guarded('teams.set_channel_topic', 'write', TOPIC_PARAMS)
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: TEAMS_ORIGIN,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: TEAMS_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTeams = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
