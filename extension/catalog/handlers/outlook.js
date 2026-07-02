(function (global) {
  'use strict';

  /**
   * Outlook Microsoft Graph READ head.
   *
   * Outlook stores mail and calendar data behind Microsoft Graph. The page owns
   * short-lived MSAL tokens; this handler obtains Graph bearer tokens only
   * through the bounded page-read primitive, keeps them inside GET-only bound
   * specs, and never logs or returns token material. Mutation-capable Outlook
   * rows remain guarded fail-closed until live mutation-body UAT exists.
   */

  var OUTLOOK_ORIGIN = 'https://outlook.cloud.microsoft';
  var OUTLOOK_SERVICE = 'outlook.cloud.microsoft';
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

  function stringField(description) {
    var out = { type: 'string' };
    if (description) { out.description = description; }
    return out;
  }

  function intField(description, min, max) {
    var out = {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max
    };
    if (description) { out.description = description; }
    return out;
  }

  function boolField(description) {
    var out = { type: 'boolean' };
    if (description) { out.description = description; }
    return out;
  }

  function stringArray(description) {
    return {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: description
    };
  }

  var EMPTY_PARAMS = schema({});
  var MESSAGE_ID_PARAMS = schema({ message_id: stringField('Outlook message ID') }, ['message_id']);
  var ATTACHMENT_PARAMS = schema({
    message_id: stringField('Outlook message ID'),
    attachment_id: stringField('Attachment ID')
  }, ['message_id', 'attachment_id']);
  var LIST_MESSAGES_PARAMS = schema({
    folder_id: stringField('Mail folder ID or well-known name'),
    limit: intField('Maximum messages to return', 1, 50),
    skip: intField('Messages to skip for pagination', 0),
    filter: stringField('OData filter expression')
  });
  var SEARCH_MESSAGES_PARAMS = schema({
    query: stringField('KQL search query'),
    limit: intField('Maximum messages to return', 1, 50)
  }, ['query']);
  var LIST_FOLDERS_PARAMS = schema({
    parent_folder_id: stringField('Parent mail folder ID'),
    include_hidden: boolField('Include hidden folders')
  });
  var CALENDAR_ITEM_PARAMS = schema({
    event_id: stringField('Calendar event ID'),
    time_zone: stringField('Time zone for returned start/end times')
  }, ['event_id']);
  var LIST_EVENTS_PARAMS = schema({
    calendar_id: stringField('Calendar ID'),
    limit: intField('Maximum events to return', 1, 50),
    skip: intField('Events to skip for pagination', 0),
    filter: stringField('OData filter expression'),
    time_zone: stringField('Time zone for returned start/end times')
  });
  var CALENDAR_VIEW_PARAMS = schema({
    start: stringField('Range start as ISO 8601'),
    end: stringField('Range end as ISO 8601'),
    calendar_id: stringField('Calendar ID'),
    limit: intField('Maximum occurrences to return', 1, 100),
    time_zone: stringField('Time zone for returned start/end times')
  }, ['start', 'end']);
  var MAIL_COMPOSE_PARAMS = schema({
    to: stringArray('Recipient email addresses'),
    subject: stringField('Email subject'),
    body: stringField('Email body'),
    body_type: { type: 'string', enum: ['text', 'html'] },
    cc: stringArray('CC recipient email addresses'),
    bcc: stringArray('BCC recipient email addresses'),
    importance: { type: 'string', enum: ['low', 'normal', 'high'] },
    save_to_sent: boolField('Save sent message to Sent Items')
  }, ['to', 'subject', 'body']);
  var FORWARD_PARAMS = schema({
    message_id: stringField('Message ID to forward'),
    to: stringArray('Recipient email addresses'),
    comment: stringField('Optional forward comment')
  }, ['message_id', 'to']);
  var REPLY_PARAMS = schema({
    message_id: stringField('Message ID to reply to'),
    body: stringField('Reply body'),
    body_type: { type: 'string', enum: ['text', 'html'] },
    reply_all: boolField('Reply to all recipients')
  }, ['message_id', 'body']);
  var MOVE_MESSAGE_PARAMS = schema({
    message_id: stringField('Message ID to move'),
    destination_folder_id: stringField('Destination folder ID or well-known name')
  }, ['message_id', 'destination_folder_id']);
  var UPDATE_MESSAGE_PARAMS = schema({
    message_id: stringField('Message ID to update'),
    is_read: boolField('Mark as read or unread'),
    importance: { type: 'string', enum: ['low', 'normal', 'high'] },
    categories: stringArray('Message categories'),
    flag_status: { type: 'string', enum: ['notFlagged', 'flagged', 'complete'] }
  }, ['message_id']);
  var EVENT_WRITE_PARAMS = schema({
    event_id: stringField('Event ID'),
    subject: stringField('Event subject'),
    start: stringField('Start datetime'),
    end: stringField('End datetime'),
    time_zone: stringField('Time zone'),
    body: stringField('Event body'),
    body_type: { type: 'string', enum: ['text', 'html'] },
    location: stringField('Location display name'),
    attendees: { type: 'array', items: { type: 'object' } },
    is_all_day: boolField('Whether this is an all-day event'),
    is_online_meeting: boolField('Attach online meeting details'),
    importance: { type: 'string', enum: ['low', 'normal', 'high'] },
    show_as: { type: 'string', enum: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere'] },
    reminder_minutes_before_start: intField('Reminder lead time in minutes', 0),
    calendar_id: stringField('Calendar ID')
  });
  var DELETE_EVENT_PARAMS = schema({
    event_id: stringField('Event ID'),
    cancellation_message: stringField('Optional cancellation message')
  }, ['event_id']);
  var RESPOND_EVENT_PARAMS = schema({
    event_id: stringField('Event ID'),
    response: { type: 'string', enum: ['accept', 'decline', 'tentative'] },
    comment: stringField('Optional response comment'),
    send_response: boolField('Send response to the organizer')
  }, ['event_id', 'response']);
  var GET_SCHEDULE_PARAMS = schema({
    schedules: stringArray('People or rooms to look up'),
    start: stringField('Window start datetime'),
    end: stringField('Window end datetime'),
    time_zone: stringField('Time zone'),
    interval_minutes: intField('Availability granularity in minutes', 5, 1440)
  }, ['schedules', 'start', 'end']);

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
      reason: reason || 'outlook-graph-shape-mismatch',
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

  function graphGetSpec(path, pairs, headers, graphToken) {
    var reqHeaders = {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + graphToken
    };
    for (var k in (headers || {})) {
      if (Object.prototype.hasOwnProperty.call(headers, k)) { reqHeaders[k] = headers[k]; }
    }
    return {
      url: GRAPH_BASE + path + buildQuery(pairs || []),
      method: 'GET',
      headers: reqHeaders,
      body: null,
      query: {},
      authStrategy: 'none',
      credentials: 'omit',
      origin: OUTLOOK_ORIGIN,
      extract: '@'
    };
  }

  async function authContext(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
      return fallback(slug, 'outlook-page-read-primitive-unavailable');
    }
    var result = await ctx.executeBoundPageRead({
      origin: OUTLOOK_ORIGIN,
      namespace: 'outlook',
      action: 'auth_context',
      args: {}
    }, ctx.tabId);
    if (!result || result.success !== true) {
      return result || fallback(slug, 'outlook-auth-context-unavailable');
    }
    var data = result.data || {};
    var graphTokens = Array.isArray(data.graph_tokens) ? data.graph_tokens : [];
    graphTokens = graphTokens.filter(function(token) {
      return typeof token === 'string' && token.length >= 16;
    });
    if (!graphTokens.length) {
      var single = typeof data.graph_token === 'string' ? data.graph_token : '';
      if (single.length >= 16) { graphTokens = [single]; }
    }
    if (!graphTokens.length) { return fallback(slug, 'outlook-graph-token-unavailable'); }
    return { success: true, graphTokens: graphTokens };
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
      return fallback(slug, 'outlook-graph-auth-failed');
    }
    var data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || looksLikeGraphError(data)) {
      return fallback(slug, 'outlook-graph-shape-mismatch');
    }
    try {
      return withMappedData(result, mapper ? mapper(data) : data);
    } catch (err) {
      return fallback(slug, 'outlook-map-shape-mismatch');
    }
  }

  async function graphRead(slug, args, ctx, requestForArgs, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'outlook-execute-bound-spec-unavailable');
    }
    var auth = await authContext(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var req = requestForArgs(args || {});
    if (req && req.fallbackReason) { return fallback(slug, req.fallbackReason); }
    for (var i = 0; i < auth.graphTokens.length; i++) {
      var result = await ctx.executeBoundSpec(
        graphGetSpec(req.path, req.pairs || [], req.headers || {}, auth.graphTokens[i]),
        ctx.tabId
      );
      if (result && (result.status === 401 || result.status === 403)) { continue; }
      return mapGraphResult(result, slug, mapper);
    }
    return fallback(slug, 'outlook-graph-auth-failed');
  }

  function collectionValues(data) {
    return Array.isArray(data.value) ? data.value : [];
  }

  function mapEmailAddress(e) {
    var addr = e && e.emailAddress ? e.emailAddress : {};
    return { name: addr.name || '', address: addr.address || '' };
  }

  function mapUser(data) {
    return { user: {
      id: data.id || '',
      display_name: data.displayName || '',
      email: data.mail || data.userPrincipalName || ''
    } };
  }

  function mapMessageSummary(message) {
    message = message || {};
    return {
      id: message.id || '',
      subject: message.subject || '(no subject)',
      from: mapEmailAddress(message.from || {}),
      to: collectionValues({ value: message.toRecipients }).map(mapEmailAddress),
      received_at: message.receivedDateTime || '',
      is_read: message.isRead === true,
      has_attachments: message.hasAttachments === true,
      importance: message.importance || 'normal',
      preview: message.bodyPreview || ''
    };
  }

  function mapMessageDetail(message) {
    message = message || {};
    var body = message.body || {};
    var flag = message.flag || {};
    var summary = mapMessageSummary(message);
    summary.cc = collectionValues({ value: message.ccRecipients }).map(mapEmailAddress);
    summary.bcc = collectionValues({ value: message.bccRecipients }).map(mapEmailAddress);
    summary.body_type = body.contentType || 'text';
    summary.body = body.content || '';
    summary.web_link = message.webLink || '';
    summary.conversation_id = message.conversationId || '';
    summary.categories = Array.isArray(message.categories) ? message.categories : [];
    summary.flag_status = flag.flagStatus || 'notFlagged';
    return summary;
  }

  function mapFolder(folder) {
    folder = folder || {};
    return {
      id: folder.id || '',
      display_name: folder.displayName || '',
      parent_folder_id: folder.parentFolderId || '',
      child_folder_count: folder.childFolderCount || 0,
      unread_count: folder.unreadItemCount || 0,
      total_count: folder.totalItemCount || 0
    };
  }

  function mapAttachment(attachment) {
    attachment = attachment || {};
    return {
      id: attachment.id || '',
      name: attachment.name || '',
      content_type: attachment.contentType || '',
      size: attachment.size || 0,
      is_inline: attachment.isInline === true
    };
  }

  function decodeTextBase64(contentBytes) {
    if (!contentBytes || typeof atob !== 'function' || typeof TextDecoder === 'undefined') {
      return contentBytes || '';
    }
    var binary = atob(contentBytes);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
    return new TextDecoder().decode(bytes);
  }

  function isTextAttachment(name, contentType) {
    var n = String(name || '').toLowerCase();
    var c = String(contentType || '').toLowerCase();
    return c.indexOf('text/') === 0
      || c.indexOf('+json') !== -1
      || c.indexOf('+xml') !== -1
      || c === 'application/json'
      || c === 'application/xml'
      || c === 'application/csv'
      || c === 'application/javascript'
      || c === 'application/yaml'
      || /\.(csv|json|xml|txt|md|html?|ya?ml|js|ts|py|sh)$/.test(n);
  }

  function mapAttachmentContent(attachment) {
    attachment = attachment || {};
    var name = attachment.name || '';
    var contentType = attachment.contentType || 'application/octet-stream';
    var contentBytes = attachment.contentBytes || '';
    var text = isTextAttachment(name, contentType);
    return {
      name: name,
      content_type: contentType,
      size: attachment.size || 0,
      encoding: text ? 'text' : 'base64',
      content: text ? decodeTextBase64(contentBytes) : contentBytes
    };
  }

  function mapDateTimeZone(value) {
    value = value || {};
    return { date_time: value.dateTime || '', time_zone: value.timeZone || '' };
  }

  function mapAttendee(attendee) {
    attendee = attendee || {};
    var status = attendee.status || {};
    var email = mapEmailAddress(attendee);
    return {
      name: email.name,
      address: email.address,
      type: attendee.type || 'required',
      response: status.response || 'none'
    };
  }

  function mapCalendar(calendar) {
    calendar = calendar || {};
    var owner = calendar.owner || {};
    return {
      id: calendar.id || '',
      name: calendar.name || '',
      color: calendar.color || 'auto',
      hex_color: calendar.hexColor || '',
      is_default: calendar.isDefaultCalendar === true,
      can_edit: calendar.canEdit === true,
      can_share: calendar.canShare === true,
      can_view_private_items: calendar.canViewPrivateItems === true,
      owner: { name: owner.name || '', address: owner.address || '' }
    };
  }

  function mapEventSummary(event) {
    event = event || {};
    var location = event.location || {};
    var meeting = event.onlineMeeting || {};
    var response = event.responseStatus || {};
    return {
      id: event.id || '',
      subject: event.subject || '(no subject)',
      start: mapDateTimeZone(event.start),
      end: mapDateTimeZone(event.end),
      is_all_day: event.isAllDay === true,
      location: location.displayName || '',
      organizer: mapEmailAddress(event.organizer || {}),
      is_cancelled: event.isCancelled === true,
      show_as: event.showAs || 'unknown',
      is_online_meeting: event.isOnlineMeeting === true,
      online_meeting_url: meeting.joinUrl || '',
      type: event.type || 'singleInstance',
      response_status: response.response || 'none',
      web_link: event.webLink || '',
      preview: event.bodyPreview || ''
    };
  }

  function mapEventDetail(event) {
    event = event || {};
    var body = event.body || {};
    var summary = mapEventSummary(event);
    summary.body_type = body.contentType || 'text';
    summary.body = body.content || '';
    summary.attendees = collectionValues({ value: event.attendees }).map(mapAttendee);
    summary.importance = event.importance || 'normal';
    summary.sensitivity = event.sensitivity || 'normal';
    summary.categories = Array.isArray(event.categories) ? event.categories : [];
    summary.is_reminder_on = event.isReminderOn === true;
    summary.reminder_minutes_before_start = event.reminderMinutesBeforeStart || 0;
    summary.has_attachments = event.hasAttachments === true;
    summary.response_requested = event.responseRequested === true;
    summary.series_master_id = event.seriesMasterId || '';
    summary.is_recurring = !!event.recurrence;
    summary.created_at = event.createdDateTime || '';
    summary.last_modified_at = event.lastModifiedDateTime || '';
    return summary;
  }

  function readHandler(slug, params, requestForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: OUTLOOK_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        return graphRead(slug, args || {}, ctx, requestForArgs, mapper);
      }
    };
  }

  function fallbackRead(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: OUTLOOK_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: OUTLOOK_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, reason || 'unverified-outlook-mutation');
      }
    };
  }

  var MESSAGE_SUMMARY_FIELDS = 'id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,importance,bodyPreview';
  var MESSAGE_DETAIL_FIELDS = 'id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,isRead,hasAttachments,importance,bodyPreview,body,webLink,conversationId,categories,flag';
  var EVENT_SUMMARY_FIELDS = 'id,subject,bodyPreview,start,end,isAllDay,location,organizer,isCancelled,isOnlineMeeting,onlineMeeting,showAs,type,responseStatus,webLink';
  var EVENT_DETAIL_FIELDS = EVENT_SUMMARY_FIELDS + ',body,attendees,importance,sensitivity,categories,isReminderOn,reminderMinutesBeforeStart,hasAttachments,responseRequested,seriesMasterId,recurrence,createdDateTime,lastModifiedDateTime';

  var handlers = {
    'outlook.get_current_user': readHandler('outlook.get_current_user', EMPTY_PARAMS, function() {
      return { path: '/me', pairs: [['$select', 'id,displayName,mail,userPrincipalName']] };
    }, mapUser),
    'outlook.get_message': readHandler('outlook.get_message', MESSAGE_ID_PARAMS, function(args) {
      return { path: '/me/messages/' + encodeSegment(args.message_id), pairs: [['$select', MESSAGE_DETAIL_FIELDS]] };
    }, function(data) { return { message: mapMessageDetail(data) }; }),
    'outlook.list_messages': readHandler('outlook.list_messages', LIST_MESSAGES_PARAMS, function(args) {
      var folder = args.folder_id || 'Inbox';
      return {
        path: '/me/mailFolders/' + encodeSegment(folder) + '/messages',
        pairs: [
          ['$select', MESSAGE_SUMMARY_FIELDS],
          ['$orderby', 'receivedDateTime desc'],
          ['$top', args.limit || 10],
          ['$skip', args.skip],
          ['$filter', args.filter],
          ['$count', true]
        ],
        headers: { 'ConsistencyLevel': 'eventual' }
      };
    }, function(data) {
      return { messages: collectionValues(data).map(mapMessageSummary), total_count: data['@odata.count'] };
    }),
    'outlook.search_messages': readHandler('outlook.search_messages', SEARCH_MESSAGES_PARAMS, function(args) {
      return {
        path: '/me/messages',
        pairs: [
          ['$search', '"' + String(args.query || '').replace(/"/g, '\\"') + '"'],
          ['$select', MESSAGE_SUMMARY_FIELDS],
          ['$top', args.limit || 10]
        ]
      };
    }, function(data) { return { messages: collectionValues(data).map(mapMessageSummary) }; }),
    'outlook.list_folders': readHandler('outlook.list_folders', LIST_FOLDERS_PARAMS, function(args) {
      var path = args.parent_folder_id
        ? '/me/mailFolders/' + encodeSegment(args.parent_folder_id) + '/childFolders'
        : '/me/mailFolders';
      return {
        path: path,
        pairs: [
          ['$select', 'id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount'],
          ['$top', 50],
          ['includeHiddenFolders', args.include_hidden ? 'true' : undefined]
        ]
      };
    }, function(data) { return { folders: collectionValues(data).map(mapFolder) }; }),
    'outlook.list_attachments': readHandler('outlook.list_attachments', MESSAGE_ID_PARAMS, function(args) {
      return {
        path: '/me/messages/' + encodeSegment(args.message_id) + '/attachments',
        pairs: [['$select', 'id,name,contentType,size,isInline']]
      };
    }, function(data) { return { attachments: collectionValues(data).map(mapAttachment) }; }),
    'outlook.get_attachment_content': readHandler('outlook.get_attachment_content', ATTACHMENT_PARAMS, function(args) {
      return {
        path: '/me/messages/' + encodeSegment(args.message_id) + '/attachments/' + encodeSegment(args.attachment_id),
        pairs: [['$select', 'id,name,contentType,size,isInline,contentBytes']]
      };
    }, mapAttachmentContent),
    'outlook.download_attachment': fallbackRead(
      'outlook.download_attachment',
      ATTACHMENT_PARAMS,
      'outlook-browser-download-primitive-unavailable'
    ),
    'outlook.list_calendars': readHandler('outlook.list_calendars', EMPTY_PARAMS, function() {
      return {
        path: '/me/calendars',
        pairs: [['$select', 'id,name,color,hexColor,isDefaultCalendar,canEdit,canShare,canViewPrivateItems,owner'], ['$top', 50]]
      };
    }, function(data) { return { calendars: collectionValues(data).map(mapCalendar) }; }),
    'outlook.list_events': readHandler('outlook.list_events', LIST_EVENTS_PARAMS, function(args) {
      return {
        path: args.calendar_id ? '/me/calendars/' + encodeSegment(args.calendar_id) + '/events' : '/me/events',
        pairs: [
          ['$select', EVENT_SUMMARY_FIELDS],
          ['$orderby', 'start/dateTime'],
          ['$top', args.limit || 10],
          ['$skip', args.skip],
          ['$filter', args.filter],
          ['$count', true]
        ],
        headers: args.time_zone ? { 'ConsistencyLevel': 'eventual', 'Prefer': 'outlook.timezone="' + args.time_zone + '"' }
          : { 'ConsistencyLevel': 'eventual' }
      };
    }, function(data) {
      return { events: collectionValues(data).map(mapEventSummary), total_count: data['@odata.count'] };
    }),
    'outlook.get_event': readHandler('outlook.get_event', CALENDAR_ITEM_PARAMS, function(args) {
      return {
        path: '/me/events/' + encodeSegment(args.event_id),
        pairs: [['$select', EVENT_DETAIL_FIELDS]],
        headers: args.time_zone ? { 'Prefer': 'outlook.timezone="' + args.time_zone + '"' } : {}
      };
    }, function(data) { return { event: mapEventDetail(data) }; }),
    'outlook.get_calendar_view': readHandler('outlook.get_calendar_view', CALENDAR_VIEW_PARAMS, function(args) {
      return {
        path: (args.calendar_id ? '/me/calendars/' + encodeSegment(args.calendar_id) : '/me') + '/calendarView',
        pairs: [
          ['startDateTime', args.start],
          ['endDateTime', args.end],
          ['$select', EVENT_SUMMARY_FIELDS],
          ['$orderby', 'start/dateTime'],
          ['$top', args.limit || 50]
        ],
        headers: args.time_zone ? { 'Prefer': 'outlook.timezone="' + args.time_zone + '"' } : {}
      };
    }, function(data) { return { events: collectionValues(data).map(mapEventSummary) }; }),

    'outlook.create_draft': guarded('outlook.create_draft', 'write', MAIL_COMPOSE_PARAMS, 'unverified-outlook-create-draft-mutation'),
    'outlook.create_event': guarded('outlook.create_event', 'write', EVENT_WRITE_PARAMS, 'unverified-outlook-create-event-mutation'),
    'outlook.delete_event': guarded('outlook.delete_event', 'destructive', DELETE_EVENT_PARAMS, 'unverified-outlook-delete-event-mutation'),
    'outlook.delete_message': guarded('outlook.delete_message', 'destructive', MESSAGE_ID_PARAMS, 'unverified-outlook-delete-message-mutation'),
    'outlook.forward_message': guarded('outlook.forward_message', 'write', FORWARD_PARAMS, 'unverified-outlook-forward-message-mutation'),
    'outlook.get_schedule': guarded('outlook.get_schedule', 'write', GET_SCHEDULE_PARAMS, 'unverified-outlook-calendar-post-read'),
    'outlook.move_message': guarded('outlook.move_message', 'write', MOVE_MESSAGE_PARAMS, 'unverified-outlook-move-message-mutation'),
    'outlook.reply_to_message': guarded('outlook.reply_to_message', 'write', REPLY_PARAMS, 'unverified-outlook-reply-message-mutation'),
    'outlook.respond_to_event': guarded('outlook.respond_to_event', 'write', RESPOND_EVENT_PARAMS, 'unverified-outlook-respond-event-mutation'),
    'outlook.send_message': guarded('outlook.send_message', 'write', MAIL_COMPOSE_PARAMS, 'unverified-outlook-send-message-mutation'),
    'outlook.update_event': guarded('outlook.update_event', 'write', EVENT_WRITE_PARAMS, 'unverified-outlook-update-event-mutation'),
    'outlook.update_message': guarded('outlook.update_message', 'write', UPDATE_MESSAGE_PARAMS, 'unverified-outlook-update-message-mutation')
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
            service: OUTLOOK_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerOutlook = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
