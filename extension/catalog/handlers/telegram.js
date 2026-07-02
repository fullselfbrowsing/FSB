(function (global) {
  'use strict';

  /**
   * Telegram Web same-origin page-state read head.
   *
   * Telegram Web keeps MTProto auth and manager state inside the first-party page
   * runtime. Reviewed read operations route through the bounded MAIN-world
   * page-read primitive. Mutation-capable Telegram rows are registered but guarded
   * fail-closed until live mutation-body UAT records an activation-safe path.
   */

  var ORIGIN = 'https://web.telegram.org';
  var SERVICE = 'web.telegram.org';
  var INT_LIMIT = 9007199254740991;

  var NUMBER_ID = { type: 'number' };
  var STRING = { type: 'string' };
  var STRING_ID = { type: 'string', minLength: 1 };
  var BOOLEAN = { type: 'boolean' };
  var INTEGER = { type: 'integer', minimum: -INT_LIMIT, maximum: INT_LIMIT };
  var LIMIT_100 = { type: 'integer', minimum: 1, maximum: 100 };
  var LIMIT_200 = { type: 'integer', minimum: 1, maximum: 200 };
  var EMPTY_PARAMS = schema({}, []);

  var PEER_PARAMS = schema({ peer_id: NUMBER_ID }, ['peer_id']);
  var USER_PARAMS = schema({ user_id: NUMBER_ID }, ['user_id']);
  var CHAT_INFO_PARAMS = schema({ peer_id: NUMBER_ID, is_channel: BOOLEAN }, ['peer_id']);
  var CHAT_MEMBERS_PARAMS = schema({
    peer_id: NUMBER_ID,
    is_channel: BOOLEAN,
    query: STRING,
    limit: LIMIT_200,
    offset: INTEGER
  }, ['peer_id']);
  var GET_MESSAGES_PARAMS = schema({
    peer_id: NUMBER_ID,
    limit: LIMIT_100,
    offset_id: INTEGER
  }, ['peer_id']);
  var LIST_CONVERSATIONS_PARAMS = schema({
    limit: LIMIT_100,
    folder_id: INTEGER
  }, []);
  var USERNAME_PARAMS = schema({ username: STRING_ID }, ['username']);
  var SEARCH_CONTACTS_PARAMS = schema({
    query: STRING_ID,
    limit: LIMIT_100
  }, ['query']);
  var SEARCH_MESSAGES_PARAMS = schema({
    query: STRING_ID,
    peer_id: NUMBER_ID,
    limit: LIMIT_100,
    offset_id: INTEGER
  }, ['query']);

  var ADD_CONTACT_PARAMS = schema({
    user_id: NUMBER_ID,
    first_name: STRING_ID,
    last_name: STRING,
    phone: STRING
  }, ['user_id', 'first_name']);
  var CREATE_GROUP_PARAMS = schema({
    title: STRING_ID,
    user_ids: { type: 'array', minItems: 1, items: NUMBER_ID }
  }, ['title', 'user_ids']);
  var DELETE_MESSAGES_PARAMS = schema({
    peer_id: NUMBER_ID,
    message_ids: { type: 'array', minItems: 1, items: INTEGER },
    revoke: BOOLEAN
  }, ['peer_id', 'message_ids']);
  var EDIT_MESSAGE_PARAMS = schema({
    peer_id: NUMBER_ID,
    message_id: INTEGER,
    text: STRING_ID
  }, ['peer_id', 'message_id', 'text']);
  var FORWARD_MESSAGES_PARAMS = schema({
    from_peer_id: NUMBER_ID,
    to_peer_id: NUMBER_ID,
    message_ids: { type: 'array', minItems: 1, items: INTEGER }
  }, ['from_peer_id', 'to_peer_id', 'message_ids']);
  var MARK_READ_PARAMS = schema({
    peer_id: NUMBER_ID,
    max_id: INTEGER
  }, ['peer_id']);
  var PIN_MESSAGE_PARAMS = schema({
    peer_id: NUMBER_ID,
    message_id: INTEGER,
    silent: BOOLEAN
  }, ['peer_id', 'message_id']);
  var SEND_MESSAGE_PARAMS = schema({
    peer_id: NUMBER_ID,
    text: STRING_ID,
    reply_to_msg_id: INTEGER
  }, ['peer_id', 'text']);
  var SET_TYPING_PARAMS = schema({
    peer_id: NUMBER_ID,
    action: STRING
  }, ['peer_id']);
  var UNPIN_MESSAGE_PARAMS = schema({
    peer_id: NUMBER_ID,
    message_id: INTEGER
  }, ['peer_id', 'message_id']);

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
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
      reason: reason || 'telegram-page-read-unavailable',
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'telegram-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'telegram',
          action: action,
          args: args || {}
        }, ctx.tabId);
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
        return fallback(slug, reason || 'unverified-telegram-mutation');
      }
    };
  }

  var handlers = {
    'telegram.get_chat_info': readHandler('telegram.get_chat_info', CHAT_INFO_PARAMS, 'get_chat_info'),
    'telegram.get_chat_members': readHandler('telegram.get_chat_members', CHAT_MEMBERS_PARAMS, 'get_chat_members'),
    'telegram.get_conversation': readHandler('telegram.get_conversation', PEER_PARAMS, 'get_conversation'),
    'telegram.get_current_user': readHandler('telegram.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'telegram.get_messages': readHandler('telegram.get_messages', GET_MESSAGES_PARAMS, 'get_messages'),
    'telegram.get_user': readHandler('telegram.get_user', USER_PARAMS, 'get_user'),
    'telegram.get_user_profile': readHandler('telegram.get_user_profile', USER_PARAMS, 'get_user_profile'),
    'telegram.list_contacts': readHandler('telegram.list_contacts', EMPTY_PARAMS, 'list_contacts'),
    'telegram.list_conversations': readHandler('telegram.list_conversations', LIST_CONVERSATIONS_PARAMS, 'list_conversations'),
    'telegram.resolve_username': readHandler('telegram.resolve_username', USERNAME_PARAMS, 'resolve_username'),
    'telegram.search_contacts': readHandler('telegram.search_contacts', SEARCH_CONTACTS_PARAMS, 'search_contacts'),
    'telegram.search_messages': readHandler('telegram.search_messages', SEARCH_MESSAGES_PARAMS, 'search_messages'),

    'telegram.add_contact': guarded('telegram.add_contact', 'write', ADD_CONTACT_PARAMS),
    'telegram.create_group': guarded('telegram.create_group', 'write', CREATE_GROUP_PARAMS),
    'telegram.delete_contact': guarded('telegram.delete_contact', 'destructive', USER_PARAMS),
    'telegram.delete_messages': guarded('telegram.delete_messages', 'destructive', DELETE_MESSAGES_PARAMS),
    'telegram.edit_message': guarded('telegram.edit_message', 'write', EDIT_MESSAGE_PARAMS),
    'telegram.forward_messages': guarded('telegram.forward_messages', 'write', FORWARD_MESSAGES_PARAMS),
    'telegram.mark_conversation_read': guarded('telegram.mark_conversation_read', 'write', MARK_READ_PARAMS),
    'telegram.pin_message': guarded('telegram.pin_message', 'write', PIN_MESSAGE_PARAMS),
    'telegram.send_message': guarded('telegram.send_message', 'write', SEND_MESSAGE_PARAMS),
    'telegram.set_typing': guarded('telegram.set_typing', 'write', SET_TYPING_PARAMS),
    'telegram.unpin_message': guarded('telegram.unpin_message', 'write', UNPIN_MESSAGE_PARAMS)
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

  global.FsbHandlerTelegram = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
