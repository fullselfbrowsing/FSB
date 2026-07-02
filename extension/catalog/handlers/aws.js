(function (global) {
  'use strict';

  /**
   * AWS Console head.
   *
   * Console metadata reads are same-origin on console.aws.amazon.com. AWS service
   * APIs need a separate SigV4 bridge, so those rows stay fail-closed until that
   * bridge is explicitly reviewed.
   */

  var AWS_ORIGIN = 'https://console.aws.amazon.com';
  var AWS_SERVICE = 'console.aws.amazon.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var INSTANCE_ID_PARAMS = schema({
    instance_id: { type: 'string', minLength: 1, description: 'EC2 instance ID' }
  }, ['instance_id']);
  var FUNCTION_NAME_PARAMS = schema({
    function_name: { type: 'string', minLength: 1, description: 'Function name or ARN' }
  }, ['function_name']);
  var INVOKE_FUNCTION_PARAMS = schema({
    function_name: { type: 'string', minLength: 1, description: 'Function name or ARN' },
    payload: { type: 'string', description: 'JSON payload to pass to the function' },
    invocation_type: {
      type: 'string',
      enum: ['RequestResponse', 'Event', 'DryRun'],
      description: 'Lambda invocation type'
    }
  }, ['function_name']);
  var LIST_ALARMS_PARAMS = schema({
    state_value: {
      type: 'string',
      enum: ['OK', 'ALARM', 'INSUFFICIENT_DATA'],
      description: 'Filter by alarm state'
    },
    max_records: integerSchema('Maximum alarms to return', 1, 100)
  }, []);
  var LIST_FUNCTIONS_PARAMS = schema({
    max_items: integerSchema('Maximum functions to return', 1, 50),
    marker: { type: 'string', description: 'Pagination marker from a previous response' }
  }, []);
  var IAM_LIST_PARAMS = schema({
    max_items: integerSchema('Maximum items to return', 1, 1000),
    path_prefix: { type: 'string', description: 'Filter by path prefix' }
  }, []);
  var LIST_INSTANCES_PARAMS = schema({
    instance_ids: { type: 'array', items: { type: 'string' }, description: 'Filter by instance IDs' },
    max_results: integerSchema('Maximum instances to return', 5, 1000)
  }, []);
  var LIST_LOG_GROUPS_PARAMS = schema({
    prefix: { type: 'string', description: 'Filter by log group name prefix' },
    limit: integerSchema('Maximum log groups to return', 1, 50)
  }, []);
  var LIST_SECURITY_GROUPS_PARAMS = schema({
    max_results: integerSchema('Maximum results', 5, 1000)
  }, []);
  var LIST_SUBNETS_PARAMS = schema({
    vpc_id: { type: 'string', description: 'Filter by VPC ID' }
  }, []);

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
      reason: reason,
      fellBackToDom: true
    });
  }

  function activeUrlFromContext(ctx) {
    if (!ctx || typeof ctx !== 'object') { return ''; }
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function consoleUrl(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    try {
      if (activeUrl && new URL(activeUrl).origin === AWS_ORIGIN) { return activeUrl; }
    } catch (e) {
      // Fall back to the console home page below.
    }
    return AWS_ORIGIN + '/';
  }

  function pageSpec(ctx) {
    return {
      url: consoleUrl(ctx),
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: AWS_ORIGIN,
      extract: '@'
    };
  }

  function htmlText(result) {
    if (!result || result.success !== true) { return ''; }
    if (typeof result.data === 'string') { return result.data; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    var data = result.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (typeof data.html === 'string') { return data.html; }
      if (typeof data.text === 'string') { return data.text; }
      if (typeof data.body === 'string') { return data.body; }
    }
    return '';
  }

  function attrValue(tag, attr) {
    var re = new RegExp("\\s" + attr + "\\s*=\\s*([\"'])(.*?)\\1", 'i');
    var match = re.exec(tag);
    return match ? match[2] : '';
  }

  function decodeHtml(value) {
    return String(value || '')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x22;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function metaContent(text, name) {
    var re = /<meta\b[^>]*>/ig;
    var match;
    while ((match = re.exec(text))) {
      var tag = match[0];
      if (attrValue(tag, 'name') === name) {
        return decodeHtml(attrValue(tag, 'content'));
      }
    }
    return '';
  }

  function parseMetaJson(text, name) {
    var raw = metaContent(text, name);
    if (!raw) { return null; }
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function mapRegion(region) {
    var r = region && typeof region === 'object' ? region : {};
    return {
      id: String(r.id || r.region || ''),
      name: String(r.name || ''),
      location: String(r.location || r.geography || ''),
      opt_in: r.optIn === true || r.optInStatus === 'opted-in'
    };
  }

  async function readConsolePage(ctx, slug) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'aws-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(pageSpec(ctx), ctx.tabId);
    if (!result || result.success !== true) { return result; }
    var text = htmlText(result);
    if (!text) { return fallback(slug, 'aws-console-metadata-unavailable'); }
    return { success: true, status: result.status, text: text };
  }

  function consoleMetadataRead(slug, params, mapper) {
    return {
      tier: 'T1a',
      origin: AWS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var page = await readConsolePage(ctx, slug);
        if (!page || page.success !== true) { return page; }
        return mapper(page.text, page.status, slug);
      }
    };
  }

  function sigv4BridgePending(slug, params) {
    return {
      tier: 'T1a',
      origin: AWS_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle() {
        return fallback(slug, 'aws-sigv4-bridge-unapproved');
      }
    };
  }

  function guarded(slug, params, reason) {
    return {
      tier: 'T1a',
      origin: AWS_ORIGIN,
      sideEffectClass: 'write',
      params: params,
      async handle() {
        return fallback(slug, reason);
      }
    };
  }

  function mapCurrentUser(text, status, slug) {
    var session = parseMetaJson(text, 'awsc-session-data') || {};
    var region = metaContent(text, 'awsc-mezz-region') || session.infrastructureRegion || '';
    var hasIdentity = session.accountId || session.displayName || session.sessionARN;
    if (!hasIdentity) { return fallback(slug, 'aws-console-session-metadata-unavailable'); }
    return {
      success: true,
      status: status,
      data: {
        user: {
          account_id: String(session.accountId || ''),
          username: String(session.displayName || ''),
          arn: '',
          session_arn: String(session.sessionARN || ''),
          region: String(region || ''),
          signin_type: String(session.signinType || '')
        }
      }
    };
  }

  function mapRegions(text, status, slug) {
    var mezz = parseMetaJson(text, 'awsc-mezz-data') || {};
    var regions = Array.isArray(mezz.regions) ? mezz.regions : [];
    if (!regions.length) { return fallback(slug, 'aws-console-region-metadata-unavailable'); }
    return {
      success: true,
      status: status,
      data: {
        current_region: String(metaContent(text, 'awsc-mezz-region') || ''),
        regions: regions.map(mapRegion)
      }
    };
  }

  var handlers = {
    'aws.describe_instance': sigv4BridgePending('aws.describe_instance', INSTANCE_ID_PARAMS),
    'aws.get_current_user': consoleMetadataRead('aws.get_current_user', EMPTY_PARAMS, mapCurrentUser),
    'aws.get_function': sigv4BridgePending('aws.get_function', FUNCTION_NAME_PARAMS),
    'aws.invoke_function': guarded('aws.invoke_function', INVOKE_FUNCTION_PARAMS, 'unverified-aws-lambda-invoke-mutation'),
    'aws.list_alarms': sigv4BridgePending('aws.list_alarms', LIST_ALARMS_PARAMS),
    'aws.list_functions': sigv4BridgePending('aws.list_functions', LIST_FUNCTIONS_PARAMS),
    'aws.list_iam_roles': sigv4BridgePending('aws.list_iam_roles', IAM_LIST_PARAMS),
    'aws.list_iam_users': sigv4BridgePending('aws.list_iam_users', IAM_LIST_PARAMS),
    'aws.list_instances': sigv4BridgePending('aws.list_instances', LIST_INSTANCES_PARAMS),
    'aws.list_log_groups': sigv4BridgePending('aws.list_log_groups', LIST_LOG_GROUPS_PARAMS),
    'aws.list_regions': consoleMetadataRead('aws.list_regions', EMPTY_PARAMS, mapRegions),
    'aws.list_security_groups': sigv4BridgePending('aws.list_security_groups', LIST_SECURITY_GROUPS_PARAMS),
    'aws.list_subnets': sigv4BridgePending('aws.list_subnets', LIST_SUBNETS_PARAMS),
    'aws.list_vpcs': sigv4BridgePending('aws.list_vpcs', EMPTY_PARAMS),
    'aws.start_instance': guarded('aws.start_instance', INSTANCE_ID_PARAMS, 'unverified-aws-ec2-start-instance-mutation'),
    'aws.stop_instance': guarded('aws.stop_instance', INSTANCE_ID_PARAMS, 'unverified-aws-ec2-stop-instance-mutation')
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
            service: AWS_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerAws = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
