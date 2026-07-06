(function (global) {
  'use strict';

  /**
   * Twilio Console guarded head.
   *
   * The only executable read here is the source-proven project-info probe at
   * www.twilio.com/console/api/v2/projects/info. That response can include an
   * credential carrier used by the vendored OpenTabs runtime for separate-origin
   * REST replay; this handler deliberately drops that value and returns only
   * account identity fields. REST reads that require Twilio product API origins
   * remain in the discovery tail until a reviewed cross-origin bridge exists.
   * Mutating/destructive rows are registered as guarded fail-closed handlers.
   */

  var TWILIO_ORIGIN = 'https://www.twilio.com';
  var TWILIO_SERVICE = 'www.twilio.com';
  var PROJECT_INFO_URL = TWILIO_ORIGIN + '/console/api/v2/projects/info';

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };
  var FRIENDLY_NAME_PARAMS = schema({
    friendly_name: { type: 'string', description: 'Friendly name' }
  }, ['friendly_name']);
  var CREATE_APPLICATION_PARAMS = schema({
    friendly_name: { type: 'string', description: 'Friendly name for the application' },
    voice_url: { type: 'string', description: 'URL for incoming voice requests' },
    voice_method: { type: 'string', description: 'HTTP method for voice URL (GET or POST)' },
    sms_url: { type: 'string', description: 'URL for incoming SMS requests' },
    sms_method: { type: 'string', description: 'HTTP method for SMS URL (GET or POST)' },
    status_callback: { type: 'string', description: 'URL for status callback webhooks' }
  }, ['friendly_name']);
  var CREATE_CALL_PARAMS = schema({
    to: { type: 'string', description: 'Recipient phone number in E.164 format (e.g., +15551234567)' },
    from: { type: 'string', description: 'Caller Twilio phone number in E.164 format (e.g., +15559876543)' },
    url: { type: 'string', description: 'TwiML URL that returns voice instructions for the call' },
    method: { type: 'string', description: 'HTTP method for the TwiML URL (GET or POST)' },
    status_callback: { type: 'string', description: 'URL to receive call status webhooks' },
    status_callback_method: { type: 'string', description: 'HTTP method for the status callback URL (GET or POST)' }
  }, ['to', 'from', 'url']);
  var CREATE_MESSAGING_SERVICE_PARAMS = schema({
    friendly_name: { type: 'string', description: 'Friendly name for the messaging service' },
    inbound_request_url: { type: 'string', description: 'URL to receive incoming message webhooks' },
    status_callback: { type: 'string', description: 'URL to receive message status webhooks' },
    sticky_sender: { type: 'boolean', description: 'Whether to enable sticky sender' }
  }, ['friendly_name']);
  var CREATE_VERIFY_SERVICE_PARAMS = schema({
    friendly_name: { type: 'string', description: 'Friendly name for the verify service' },
    code_length: { type: 'integer', minimum: 4, maximum: 10, description: 'Length of the verification code' }
  }, ['friendly_name']);
  var SID_PARAMS = schema({
    sid: { type: 'string', description: 'Twilio SID' }
  }, ['sid']);
  var SEND_MESSAGE_PARAMS = schema({
    to: { type: 'string', description: 'Recipient phone number in E.164 format (e.g., +15551234567)' },
    from: { type: 'string', description: 'Sender Twilio phone number in E.164 format (e.g., +15559876543)' },
    body: { type: 'string', description: 'Message text content' },
    media_url: { type: 'string', description: 'URL of media to include (for MMS)' }
  }, ['to', 'from', 'body']);
  var UPDATE_CALL_PARAMS = schema({
    sid: { type: 'string', description: 'Call SID to modify (e.g., CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)' },
    url: { type: 'string', description: 'New TwiML URL to redirect the call to' },
    method: { type: 'string', description: 'HTTP method for the new TwiML URL (GET or POST)' },
    status: { type: 'string', enum: ['completed', 'canceled'], description: 'Set to completed or canceled to end the call' }
  }, ['sid']);
  var UPDATE_PHONE_NUMBER_PARAMS = schema({
    sid: { type: 'string', minLength: 1, description: 'Phone number SID (PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)' },
    friendly_name: { type: 'string', description: 'New friendly name for the phone number' },
    voice_url: { type: 'string', description: 'URL for incoming voice calls' },
    voice_method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method for voice URL' },
    sms_url: { type: 'string', description: 'URL for incoming SMS messages' },
    sms_method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method for SMS URL' },
    status_callback: { type: 'string', description: 'Status callback URL' }
  }, ['sid']);

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
      reason: reason,
      fellBackToDom: true
    });
  }

  function buildProjectInfoSpec() {
    return {
      url: PROJECT_INFO_URL,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: TWILIO_ORIGIN,
      extract: '@'
    };
  }

  function sanitizeProjectInfo(result) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    var sid = data && typeof data === 'object' && !Array.isArray(data)
      ? (data.projectSid || data.accountSid || data.sid)
      : '';
    if (typeof sid !== 'string' || !sid) {
      return fallback('twilio.get_current_user', 'twilio-project-info-shape-mismatch');
    }
    return {
      success: true,
      status: result.status,
      data: {
        accountSid: sid,
        account: { sid: sid },
        project: { sid: sid }
      }
    };
  }

  function guarded(slug, sideEffectClass, params, reason) {
    return {
      tier: 'T1a',
      origin: TWILIO_ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle(args, ctx) {
        return fallback(slug, reason);
      }
    };
  }

  var handlers = {
    'twilio.get_current_user': {
      tier: 'T1a',
      origin: TWILIO_ORIGIN,
      sideEffectClass: 'read',
      params: EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('twilio.get_current_user', 'twilio-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(buildProjectInfoSpec(), ctx.tabId);
        return sanitizeProjectInfo(res);
      }
    },

    'twilio.create_api_key': guarded('twilio.create_api_key', 'write', FRIENDLY_NAME_PARAMS, 'unverified-twilio-create-api-key-mutation'),
    'twilio.create_application': guarded('twilio.create_application', 'write', CREATE_APPLICATION_PARAMS, 'unverified-twilio-create-application-mutation'),
    'twilio.create_call': guarded('twilio.create_call', 'write', CREATE_CALL_PARAMS, 'unverified-twilio-create-call-mutation'),
    'twilio.create_messaging_service': guarded('twilio.create_messaging_service', 'write', CREATE_MESSAGING_SERVICE_PARAMS, 'unverified-twilio-create-messaging-service-mutation'),
    'twilio.create_verify_service': guarded('twilio.create_verify_service', 'write', CREATE_VERIFY_SERVICE_PARAMS, 'unverified-twilio-create-verify-service-mutation'),
    'twilio.delete_api_key': guarded('twilio.delete_api_key', 'destructive', SID_PARAMS, 'unverified-twilio-delete-api-key-mutation'),
    'twilio.delete_message': guarded('twilio.delete_message', 'destructive', SID_PARAMS, 'unverified-twilio-delete-message-mutation'),
    'twilio.delete_recording': guarded('twilio.delete_recording', 'destructive', SID_PARAMS, 'unverified-twilio-delete-recording-mutation'),
    'twilio.send_message': guarded('twilio.send_message', 'write', SEND_MESSAGE_PARAMS, 'unverified-twilio-send-message-mutation'),
    'twilio.update_call': guarded('twilio.update_call', 'write', UPDATE_CALL_PARAMS, 'unverified-twilio-update-call-mutation'),
    'twilio.update_phone_number': guarded('twilio.update_phone_number', 'write', UPDATE_PHONE_NUMBER_PARAMS, 'unverified-twilio-update-phone-number-mutation')
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
            service: TWILIO_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerTwilio = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
