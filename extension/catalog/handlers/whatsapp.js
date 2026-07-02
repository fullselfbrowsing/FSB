(function (global) {
  'use strict';

  /**
   * WhatsApp Web same-origin page-state READ head.
   *
   * WhatsApp Web keeps chat/contact/message state in first-party MAIN-world module
   * stores and drives mutations over its managed WebSocket connection. There is no
   * stable REST surface to bind as a T1b recipe. This head exposes only read-only
   * page-state operations through the router's bounded page-read primitive; every
   * mutation-like WhatsApp descriptor remains guarded fail-closed until live UAT
   * records an activation-safe request/body path.
   */

  var ORIGIN = 'https://web.whatsapp.com';
  var SERVICE = 'web.whatsapp.com';

  var STRING_ID = { type: 'string', minLength: 1 };
  var EMPTY_PARAMS = schema({}, []);
  var CHAT_ID_PARAMS = schema({
    chat_id: { type: 'string', minLength: 1, description: 'WhatsApp chat ID' }
  }, ['chat_id']);
  var CONTACT_ID_PARAMS = schema({
    contact_id: { type: 'string', minLength: 1, description: 'WhatsApp contact ID' }
  }, ['contact_id']);
  var LIST_CHATS_PARAMS = schema({
    limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of chats to return' }
  }, []);
  var LIST_CONTACTS_PARAMS = schema({
    limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum number of contacts to return' }
  }, []);
  var LIST_MESSAGES_PARAMS = schema({
    chat_id: { type: 'string', minLength: 1, description: 'WhatsApp chat ID' },
    limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of messages to return' }
  }, ['chat_id']);

  var ARCHIVE_PARAMS = schema({
    chat_id: STRING_ID,
    archive: { type: 'boolean' }
  }, ['chat_id', 'archive']);
  var CREATE_GROUP_PARAMS = schema({
    subject: { type: 'string', minLength: 1 },
    participant_ids: { type: 'array', minItems: 1, items: STRING_ID }
  }, ['subject', 'participant_ids']);
  var MESSAGE_IDS_PARAMS = schema({
    chat_id: STRING_ID,
    message_ids: { type: 'array', minItems: 1, items: STRING_ID }
  }, ['chat_id', 'message_ids']);
  var MARK_CHAT_READ_PARAMS = schema({
    chat_id: STRING_ID,
    read: { type: 'boolean' }
  }, ['chat_id', 'read']);
  var MUTE_CHAT_PARAMS = schema({
    chat_id: STRING_ID,
    duration_hours: { type: 'integer', minimum: 0 }
  }, ['chat_id', 'duration_hours']);
  var PIN_CHAT_PARAMS = schema({
    chat_id: STRING_ID,
    pin: { type: 'boolean' }
  }, ['chat_id', 'pin']);
  var SEND_MESSAGE_PARAMS = schema({
    chat_id: STRING_ID,
    text: { type: 'string', minLength: 1 }
  }, ['chat_id', 'text']);
  var STAR_MESSAGE_PARAMS = schema({
    chat_id: STRING_ID,
    message_ids: { type: 'array', minItems: 1, items: STRING_ID },
    star: { type: 'boolean' }
  }, ['chat_id', 'message_ids', 'star']);

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
      reason: reason || 'whatsapp-page-read-unavailable',
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
          return fallback(slug, 'whatsapp-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'whatsapp',
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
        return fallback(slug, reason || 'unverified-whatsapp-mutation');
      }
    };
  }

  var handlers = {
    'whatsapp.get_current_user': readHandler('whatsapp.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'whatsapp.get_chat': readHandler('whatsapp.get_chat', CHAT_ID_PARAMS, 'get_chat'),
    'whatsapp.get_contact': readHandler('whatsapp.get_contact', CONTACT_ID_PARAMS, 'get_contact'),
    'whatsapp.get_group_invite_link': readHandler('whatsapp.get_group_invite_link', CHAT_ID_PARAMS, 'get_group_invite_link'),
    'whatsapp.list_chats': readHandler('whatsapp.list_chats', LIST_CHATS_PARAMS, 'list_chats'),
    'whatsapp.list_contacts': readHandler('whatsapp.list_contacts', LIST_CONTACTS_PARAMS, 'list_contacts'),
    'whatsapp.list_messages': readHandler('whatsapp.list_messages', LIST_MESSAGES_PARAMS, 'list_messages'),

    'whatsapp.archive_chat': guarded('whatsapp.archive_chat', 'destructive', ARCHIVE_PARAMS),
    'whatsapp.block_contact': guarded('whatsapp.block_contact', 'write', CONTACT_ID_PARAMS),
    'whatsapp.clear_chat': guarded('whatsapp.clear_chat', 'destructive', CHAT_ID_PARAMS),
    'whatsapp.create_group': guarded('whatsapp.create_group', 'write', CREATE_GROUP_PARAMS),
    'whatsapp.delete_chat': guarded('whatsapp.delete_chat', 'destructive', CHAT_ID_PARAMS),
    'whatsapp.delete_message': guarded('whatsapp.delete_message', 'destructive', MESSAGE_IDS_PARAMS),
    'whatsapp.mark_chat_read': guarded('whatsapp.mark_chat_read', 'write', MARK_CHAT_READ_PARAMS),
    'whatsapp.mute_chat': guarded('whatsapp.mute_chat', 'write', MUTE_CHAT_PARAMS),
    'whatsapp.pin_chat': guarded('whatsapp.pin_chat', 'write', PIN_CHAT_PARAMS),
    'whatsapp.revoke_group_invite_link': guarded('whatsapp.revoke_group_invite_link', 'write', CHAT_ID_PARAMS),
    'whatsapp.revoke_message': guarded('whatsapp.revoke_message', 'destructive', MESSAGE_IDS_PARAMS),
    'whatsapp.send_message': guarded('whatsapp.send_message', 'write', SEND_MESSAGE_PARAMS),
    'whatsapp.star_message': guarded('whatsapp.star_message', 'write', STAR_MESSAGE_PARAMS),
    'whatsapp.unblock_contact': guarded('whatsapp.unblock_contact', 'write', CONTACT_ID_PARAMS)
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        global.FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: ORIGIN,
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

  global.FsbHandlerWhatsapp = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
