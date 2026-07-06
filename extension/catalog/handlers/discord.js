(function (global) {
  'use strict';

  /**
   * Discord same-origin API read head.
   *
   * Discord's web client authenticates first-party API calls with a token stored in
   * its MAIN-world webpack module cache. Read handlers build pinned
   * https://discord.com/api/v9 specs and opt into the bound fetch primitive's
   * Discord auth-source hook, which reads the token only inside the page realm and
   * never returns it to the service worker. Mutations remain guarded fail-closed
   * until live mutation-body UAT records the exact method, path, body, and auth
   * carrier.
   */

  var ORIGIN = 'https://discord.com';
  var SERVICE = 'discord.com';
  var API_BASE = ORIGIN + '/api/v9';

  var STRING_ID = { type: 'string', minLength: 1 };
  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var INTEGER = { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 };
  var LIMIT_25 = { type: 'integer', minimum: 1, maximum: 25 };
  var LIMIT_100 = { type: 'integer', minimum: 1, maximum: 100 };
  var LIMIT_200 = { type: 'integer', minimum: 1, maximum: 200 };
  var LIMIT_1000 = { type: 'integer', minimum: 1, maximum: 1000 };
  var EMPTY_PARAMS = schema({}, []);

  var CHANNEL_PARAMS = schema({ channel: STRING_ID }, ['channel']);
  var GUILD_PARAMS = schema({ guild_id: STRING_ID }, ['guild_id']);
  var MESSAGE_PARAMS = schema({ channel: STRING_ID, message_id: STRING_ID }, ['channel', 'message_id']);
  var REACTION_PARAMS = schema({ channel: STRING_ID, message_id: STRING_ID, emoji: STRING_ID }, ['channel', 'message_id', 'emoji']);
  var USER_PROFILE_PARAMS = schema({ user_id: STRING_ID }, ['user_id']);
  var LIST_GUILDS_PARAMS = schema({ limit: LIMIT_200, before: STRING, after: STRING }, []);
  var LIST_MEMBERS_PARAMS = schema({ guild_id: STRING_ID, limit: LIMIT_1000, after: STRING }, ['guild_id']);
  var READ_MESSAGES_PARAMS = schema({
    channel: STRING_ID,
    limit: LIMIT_100,
    before: STRING,
    after: STRING,
    around: STRING
  }, ['channel']);
  var READ_THREAD_PARAMS = schema({
    thread_id: STRING_ID,
    limit: LIMIT_100,
    before: STRING,
    after: STRING
  }, ['thread_id']);
  var SEARCH_MESSAGES_PARAMS = schema({
    guild_id: STRING_ID,
    content: STRING,
    author_id: STRING,
    channel_id: STRING,
    has: STRING,
    limit: LIMIT_25,
    offset: INTEGER
  }, ['guild_id']);

  var CREATE_CHANNEL_PARAMS = schema({
    guild_id: STRING_ID,
    name: STRING_ID,
    type: INTEGER,
    topic: STRING,
    parent_id: STRING,
    nsfw: BOOLEAN
  }, ['guild_id', 'name']);
  var CREATE_THREAD_PARAMS = schema({
    channel: STRING_ID,
    name: STRING_ID,
    message_id: STRING,
    auto_archive_duration: INTEGER
  }, ['channel', 'name']);
  var EDIT_CHANNEL_PARAMS = schema({
    channel: STRING_ID,
    name: STRING,
    topic: STRING,
    nsfw: BOOLEAN,
    parent_id: STRING
  }, ['channel']);
  var EDIT_MESSAGE_PARAMS = schema({
    channel: STRING_ID,
    message_id: STRING_ID,
    content: STRING_ID
  }, ['channel', 'message_id', 'content']);
  var OPEN_DM_PARAMS = schema({
    recipient_ids: { type: 'array', minItems: 1, items: STRING }
  }, ['recipient_ids']);
  var SEND_MESSAGE_PARAMS = schema({
    channel: STRING_ID,
    content: STRING_ID,
    reply_to: STRING
  }, ['channel', 'content']);
  var UPLOAD_FILE_PARAMS = schema({
    channel: STRING_ID,
    content: STRING_ID,
    filename: STRING_ID,
    is_base64: BOOLEAN,
    initial_comment: STRING
  }, ['channel', 'content', 'filename']);

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
      reason: reason || 'discord-api-auth-or-rot',
      fellBackToDom: true
    });
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function valueOrDefault(value, fallbackValue) {
    return value === undefined || value === null ? fallbackValue : value;
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function buildGetSpec(endpoint, pairs) {
    return {
      url: API_BASE + endpoint + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      authSource: { from: 'discord-webpack-token', header: 'Authorization' },
      origin: ORIGIN,
      extract: '@'
    };
  }

  function isErrorObject(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data)
      && (typeof data.code === 'number' || typeof data.message === 'string');
  }

  function guardResult(result, slug, kind) {
    if (!result || result.success !== true) { return result; }
    var status = Number(result.status || 0);
    if (result.redirected || status >= 400 || isErrorObject(result.data)) {
      return fallback(slug, 'discord-api-auth-or-rot');
    }
    if (kind === 'array' && !Array.isArray(result.data)) {
      return fallback(slug, 'discord-api-shape-mismatch');
    }
    if (kind === 'object' && (!result.data || typeof result.data !== 'object' || Array.isArray(result.data))) {
      return fallback(slug, 'discord-api-shape-mismatch');
    }
    return result;
  }

  function readHandler(slug, params, buildEndpoint, buildPairs, kind) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'discord-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var result = await ctx.executeBoundSpec(buildGetSpec(buildEndpoint(a), buildPairs ? buildPairs(a) : []), ctx.tabId);
        return guardResult(result, slug, kind);
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
        return fallback(slug, reason || 'unverified-discord-mutation');
      }
    };
  }

  var handlers = {
    'discord.get_channel_info': readHandler('discord.get_channel_info', CHANNEL_PARAMS, function(a) {
      return '/channels/' + encodeSegment(a.channel);
    }, null, 'object'),
    'discord.get_guild_info': readHandler('discord.get_guild_info', GUILD_PARAMS, function(a) {
      return '/guilds/' + encodeSegment(a.guild_id);
    }, function() {
      return [['with_counts', true]];
    }, 'object'),
    'discord.get_user_profile': readHandler('discord.get_user_profile', USER_PROFILE_PARAMS, function(a) {
      return a.user_id === '@me' ? '/users/@me' : '/users/' + encodeSegment(a.user_id);
    }, null, 'object'),
    'discord.list_channels': readHandler('discord.list_channels', GUILD_PARAMS, function(a) {
      return '/guilds/' + encodeSegment(a.guild_id) + '/channels';
    }, null, 'array'),
    'discord.list_dms': readHandler('discord.list_dms', EMPTY_PARAMS, function() {
      return '/users/@me/channels';
    }, null, 'array'),
    'discord.list_guilds': readHandler('discord.list_guilds', LIST_GUILDS_PARAMS, function() {
      return '/users/@me/guilds';
    }, function(a) {
      return [['limit', valueOrDefault(a.limit, 200)], ['before', a.before], ['after', a.after]];
    }, 'array'),
    'discord.list_members': readHandler('discord.list_members', LIST_MEMBERS_PARAMS, function(a) {
      return '/guilds/' + encodeSegment(a.guild_id) + '/members';
    }, function(a) {
      return [['limit', valueOrDefault(a.limit, 100)], ['after', a.after]];
    }, 'array'),
    'discord.list_pinned_messages': readHandler('discord.list_pinned_messages', CHANNEL_PARAMS, function(a) {
      return '/channels/' + encodeSegment(a.channel) + '/pins';
    }, null, 'array'),
    'discord.list_roles': readHandler('discord.list_roles', GUILD_PARAMS, function(a) {
      return '/guilds/' + encodeSegment(a.guild_id) + '/roles';
    }, null, 'array'),
    'discord.read_messages': readHandler('discord.read_messages', READ_MESSAGES_PARAMS, function(a) {
      return '/channels/' + encodeSegment(a.channel) + '/messages';
    }, function(a) {
      return [
        ['limit', valueOrDefault(a.limit, 50)],
        ['before', a.before],
        ['after', a.after],
        ['around', a.around]
      ];
    }, 'array'),
    'discord.read_thread': readHandler('discord.read_thread', READ_THREAD_PARAMS, function(a) {
      return '/channels/' + encodeSegment(a.thread_id) + '/messages';
    }, function(a) {
      return [
        ['limit', valueOrDefault(a.limit, 50)],
        ['before', a.before],
        ['after', a.after]
      ];
    }, 'array'),
    'discord.search_messages': readHandler('discord.search_messages', SEARCH_MESSAGES_PARAMS, function(a) {
      return '/guilds/' + encodeSegment(a.guild_id) + '/messages/search';
    }, function(a) {
      return [
        ['content', a.content],
        ['author_id', a.author_id],
        ['channel_id', a.channel_id],
        ['has', a.has],
        ['limit', valueOrDefault(a.limit, 25)],
        ['offset', a.offset]
      ];
    }, 'object'),
    'discord.get_message': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: MESSAGE_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('discord.get_message', 'discord-execute-bound-spec-unavailable');
        }
        var a = args || {};
        var result = await ctx.executeBoundSpec(buildGetSpec('/channels/' + encodeSegment(a.channel) + '/messages', [
          ['around', a.message_id],
          ['limit', 3]
        ]), ctx.tabId);
        result = guardResult(result, 'discord.get_message', 'array');
        if (!result || result.success !== true) { return result; }
        for (var i = 0; i < result.data.length; i++) {
          if (result.data[i] && String(result.data[i].id) === String(a.message_id)) {
            return Object.assign({}, result, { data: { message: result.data[i] } });
          }
        }
        return fallback('discord.get_message', 'discord-message-not-found');
      }
    },

    'discord.add_reaction': guarded('discord.add_reaction', 'write', REACTION_PARAMS, 'unverified-discord-add-reaction-mutation'),
    'discord.create_channel': guarded('discord.create_channel', 'write', CREATE_CHANNEL_PARAMS, 'unverified-discord-create-channel-mutation'),
    'discord.create_thread': guarded('discord.create_thread', 'write', CREATE_THREAD_PARAMS, 'unverified-discord-create-thread-mutation'),
    'discord.delete_channel': guarded('discord.delete_channel', 'destructive', CHANNEL_PARAMS, 'unverified-discord-delete-channel-mutation'),
    'discord.delete_message': guarded('discord.delete_message', 'destructive', MESSAGE_PARAMS, 'unverified-discord-delete-message-mutation'),
    'discord.edit_channel': guarded('discord.edit_channel', 'write', EDIT_CHANNEL_PARAMS, 'unverified-discord-edit-channel-mutation'),
    'discord.edit_message': guarded('discord.edit_message', 'write', EDIT_MESSAGE_PARAMS, 'unverified-discord-edit-message-mutation'),
    'discord.open_dm': guarded('discord.open_dm', 'write', OPEN_DM_PARAMS, 'unverified-discord-open-dm-mutation'),
    'discord.pin_message': guarded('discord.pin_message', 'write', MESSAGE_PARAMS, 'unverified-discord-pin-message-mutation'),
    'discord.remove_reaction': guarded('discord.remove_reaction', 'destructive', REACTION_PARAMS, 'unverified-discord-remove-reaction-mutation'),
    'discord.send_message': guarded('discord.send_message', 'write', SEND_MESSAGE_PARAMS, 'unverified-discord-send-message-mutation'),
    'discord.unpin_message': guarded('discord.unpin_message', 'destructive', MESSAGE_PARAMS, 'unverified-discord-unpin-message-mutation'),
    'discord.upload_file': guarded('discord.upload_file', 'write', UPLOAD_FILE_PARAMS, 'unverified-discord-upload-file-mutation')
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

  global.FsbHandlerDiscord = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
