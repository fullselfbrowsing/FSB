(function (global) {
  'use strict';

  /**
   * LinkedIn same-origin Voyager read head.
   *
   * Read operations use LinkedIn's own first-party Voyager/Dash endpoints with
   * session cookies and the page-visible JSESSIONID CSRF token. Messaging writes
   * stay guarded fail-closed until live mutation-body UAT records an activation-safe
   * request body for the current LinkedIn client.
   */

  var ORIGIN = 'https://www.linkedin.com';
  var SERVICE = 'linkedin.com';
  var VOYAGER = '/voyager/api';
  var MESSAGING_GRAPHQL = VOYAGER + '/voyagerMessagingGraphQL/graphql';
  var CONVERSATIONS_QUERY_ID = 'messengerConversations.0d5e6781bbee71c3e51c8843c6519f48';
  var MESSAGES_QUERY_ID = 'messengerMessages.5846eeb71c981f11e0134cb6626cc314';
  var MAILBOX_COUNTS_QUERY_ID = 'messengerMailboxCounts.fc528a5a81a76dff212a4a3d2d48e84b';

  var EMPTY_PARAMS = schema({}, []);
  var PROFILE_PARAMS = schema({
    public_identifier: {
      type: 'string',
      minLength: 1,
      description: 'Public profile identifier from linkedin.com/in/<public_identifier>'
    }
  }, ['public_identifier']);
  var CONVERSATION_PARAMS = schema({
    conversation_urn: {
      type: 'string',
      minLength: 1,
      description: 'LinkedIn conversation URN'
    }
  }, ['conversation_urn']);
  var SEND_MESSAGE_PARAMS = schema({
    conversation_urn: {
      type: 'string',
      minLength: 1,
      description: 'LinkedIn conversation URN'
    },
    text: {
      type: 'string',
      minLength: 1,
      description: 'Message text to send'
    }
  }, ['conversation_urn', 'text']);

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
      reason: reason || 'linkedin-voyager-shape-mismatch',
      fellBackToDom: true
    });
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(query) {
    var parts = [];
    var q = query || {};
    for (var key in q) {
      if (Object.prototype.hasOwnProperty.call(q, key)) { appendQuery(parts, key, q[key]); }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function encodeUrn(value) {
    return encodeURIComponent(String(value || '')).replace(/\(/g, '%28').replace(/\)/g, '%29');
  }

  function voyagerSpec(endpoint, query, accept) {
    return {
      url: ORIGIN + VOYAGER + endpoint + buildQuery(query),
      method: 'GET',
      headers: {
        'Accept': accept || 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'JSESSIONID', header: 'csrf-token', stripQuotes: true },
      origin: ORIGIN,
      extract: '@'
    };
  }

  function messagingGraphqlSpec(queryId, variables) {
    return {
      url: ORIGIN + MESSAGING_GRAPHQL + buildQuery({ queryId: queryId, variables: variables }),
      method: 'GET',
      headers: {
        'Accept': 'application/graphql',
        'x-restli-protocol-version': '2.0.0'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'JSESSIONID', header: 'csrf-token', stripQuotes: true },
      origin: ORIGIN,
      extract: '@'
    };
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

  function fullName(first, last) {
    return (str(first) + ' ' + str(last)).trim();
  }

  function vectorUrl(vector) {
    if (!isObject(vector)) { return ''; }
    var root = str(vector.rootUrl);
    var artifacts = list(vector.artifacts).slice().sort(function (a, b) {
      return num(b && b.width) - num(a && a.width);
    });
    var segment = artifacts[0] && artifacts[0].fileIdentifyingUrlPathSegment;
    return root && segment ? root + segment : '';
  }

  function unwrap(result, slug) {
    if (!result || result.success !== true) {
      return { error: fallback(slug, 'linkedin-voyager-request-failed') };
    }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        result.status === 429 || (typeof result.status === 'number' && result.status >= 500)) {
      return { error: fallback(slug, 'linkedin-voyager-http-or-redirect') };
    }
    if (!isObject(result.data)) {
      return { error: fallback(slug, 'linkedin-voyager-shape-mismatch') };
    }
    return { data: result.data };
  }

  function mapCurrentUser(data) {
    var mini = isObject(data && data.miniProfile) ? data.miniProfile : {};
    var picture = mini.picture && mini.picture['com.linkedin.common.VectorImage'];
    return {
      plain_id: num(data && data.plainId),
      first_name: str(mini.firstName),
      last_name: str(mini.lastName),
      occupation: str(mini.occupation),
      public_identifier: str(mini.publicIdentifier),
      profile_urn: str(mini.dashEntityUrn || mini.entityUrn),
      profile_picture_url: vectorUrl(picture),
      is_premium: bool(data && data.premiumSubscriber)
    };
  }

  function mapProfile(el) {
    var picture = el && el.profilePicture && el.profilePicture.displayImageReference
      && el.profilePicture.displayImageReference.vectorImage;
    var geo = el && el.geoLocation && el.geoLocation.geo;
    return {
      first_name: str(el && el.firstName),
      last_name: str(el && el.lastName),
      headline: str(el && el.headline),
      public_identifier: str(el && el.publicIdentifier),
      profile_urn: str(el && el.entityUrn),
      profile_picture_url: vectorUrl(picture),
      location: str(geo && geo.defaultLocalizedNameWithoutCountryName),
      country: str(geo && geo.country && geo.country.defaultLocalizedName),
      is_premium: bool(el && el.premium),
      is_influencer: bool(el && el.influencer),
      is_creator: bool(el && el.creator)
    };
  }

  function mapParticipant(p) {
    var member = p && p.participantType && p.participantType.member;
    return {
      name: fullName(member && member.firstName && member.firstName.text, member && member.lastName && member.lastName.text),
      profile_urn: str(p && p.hostIdentityUrn),
      profile_picture_url: vectorUrl(member && member.profilePicture)
    };
  }

  function mapConversation(c) {
    var participants = list(c && c.conversationParticipants);
    return {
      conversation_urn: str(c && c.entityUrn),
      title: str(c && c.conversationTitle && c.conversationTitle.text) || participants.map(function (p) {
        var member = p && p.participantType && p.participantType.member;
        return fullName(member && member.firstName && member.firstName.text, member && member.lastName && member.lastName.text);
      }).filter(Boolean).join(', '),
      last_message_text: str(c && c.lastMessage && c.lastMessage.body && c.lastMessage.body.text),
      last_message_at: num(c && c.lastMessage && c.lastMessage.deliveredAt),
      is_read: bool(c && c.read),
      notification_status: str(c && c.notificationStatus),
      participants: participants.map(mapParticipant)
    };
  }

  function mapMessage(m) {
    var member = m && m.sender && m.sender.participantType && m.sender.participantType.member;
    return {
      message_urn: str(m && m.entityUrn),
      text: str(m && m.body && m.body.text),
      sender_name: fullName(member && member.firstName && member.firstName.text, member && member.lastName && member.lastName.text),
      sender_profile_urn: str(m && m.sender && m.sender.hostIdentityUrn),
      delivered_at: num(m && m.deliveredAt),
      subject: str(m && m.subject && m.subject.text)
    };
  }

  function mapMailboxCount(c) {
    return {
      category: str(c && c.category),
      unread_count: num(c && c.unreadConversationCount)
    };
  }

  async function callSpec(slug, ctx, spec) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { error: fallback(slug, 'linkedin-execute-bound-spec-unavailable') };
    }
    return unwrap(await ctx.executeBoundSpec(spec, ctx.tabId), slug);
  }

  async function currentUserData(slug, ctx) {
    return callSpec(slug, ctx, voyagerSpec('/me'));
  }

  function profileUrnFromMe(data) {
    var mini = isObject(data && data.miniProfile) ? data.miniProfile : {};
    return str(mini.dashEntityUrn || mini.entityUrn);
  }

  function readHandler(slug, params, fn) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return fn(args || {}, ctx, slug);
      }
    };
  }

  function guarded(slug, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, 'unverified-linkedin-send-message-mutation');
      }
    };
  }

  var handlers = {
    'linkedin.get_current_user': readHandler('linkedin.get_current_user', EMPTY_PARAMS, async function (_args, ctx, slug) {
      var out = await currentUserData(slug, ctx);
      if (out.error) { return out.error; }
      return { success: true, data: { user: mapCurrentUser(out.data) } };
    }),
    'linkedin.get_user_profile': readHandler('linkedin.get_user_profile', PROFILE_PARAMS, async function (args, ctx, slug) {
      var out = await callSpec(slug, ctx, voyagerSpec('/identity/dash/profiles', {
        q: 'memberIdentity',
        memberIdentity: args.public_identifier,
        decorationId: 'com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-18'
      }));
      if (out.error) { return out.error; }
      var element = list(out.data.elements)[0];
      if (!isObject(element)) { return fallback(slug, 'linkedin-profile-not-found'); }
      return { success: true, data: { profile: mapProfile(element) } };
    }),
    'linkedin.list_conversations': readHandler('linkedin.list_conversations', EMPTY_PARAMS, async function (_args, ctx, slug) {
      var me = await currentUserData(slug, ctx);
      if (me.error) { return me.error; }
      var profileUrn = profileUrnFromMe(me.data);
      if (!profileUrn) { return fallback(slug, 'linkedin-current-profile-urn-missing'); }
      var out = await callSpec(slug, ctx, messagingGraphqlSpec(
        CONVERSATIONS_QUERY_ID,
        '(mailboxUrn:' + encodeUrn(profileUrn) + ')'
      ));
      if (out.error) { return out.error; }
      var root = out.data.data && out.data.data.messengerConversationsBySyncToken;
      return { success: true, data: { conversations: list(root && root.elements).map(mapConversation) } };
    }),
    'linkedin.get_conversation_messages': readHandler('linkedin.get_conversation_messages', CONVERSATION_PARAMS, async function (args, ctx, slug) {
      var out = await callSpec(slug, ctx, messagingGraphqlSpec(
        MESSAGES_QUERY_ID,
        '(conversationUrn:' + encodeUrn(args.conversation_urn) + ')'
      ));
      if (out.error) { return out.error; }
      var root = out.data.data && out.data.data.messengerMessagesBySyncToken;
      return { success: true, data: { messages: list(root && root.elements).map(mapMessage) } };
    }),
    'linkedin.get_mailbox_counts': readHandler('linkedin.get_mailbox_counts', EMPTY_PARAMS, async function (_args, ctx, slug) {
      var me = await currentUserData(slug, ctx);
      if (me.error) { return me.error; }
      var profileUrn = profileUrnFromMe(me.data);
      if (!profileUrn) { return fallback(slug, 'linkedin-current-profile-urn-missing'); }
      var out = await callSpec(slug, ctx, messagingGraphqlSpec(
        MAILBOX_COUNTS_QUERY_ID,
        '(mailboxUrn:' + encodeUrn(profileUrn) + ')'
      ));
      if (out.error) { return out.error; }
      var root = out.data.data && out.data.data.messengerMailboxCountsByMailbox;
      return { success: true, data: { counts: list(root && root.elements).map(mapMailboxCount) } };
    }),
    'linkedin.send_message': guarded('linkedin.send_message', SEND_MESSAGE_PARAMS)
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

  global.FsbHandlerLinkedin = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
