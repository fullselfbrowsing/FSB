(function (global) {
  'use strict';

  /**
   * Amplitude same-origin GraphQL READ head.
   *
   * The selected descriptors are read-classified GraphQL queries against the
   * first-party app.amplitude.com runtime. The org id is discovered from a
   * same-origin bootstrap page read and used only inside the bound GraphQL spec.
   * The write-classified check_permissions descriptor remains unregistered.
   */

  var AMPLITUDE_ORIGIN = 'https://app.amplitude.com';
  var AMPLITUDE_SERVICE = 'app.amplitude.com';
  var GRAPHQL_PATH_PREFIX = '/t/graphql/org/';

  var EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false };

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
      reason: reason || 'amplitude-logged-out-or-rot',
      fellBackToDom: true
    });
  }

  function withProps(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function integerSchema(description, min, max) {
    var out = { type: 'integer', description: description };
    if (min !== undefined) { out.minimum = min; }
    if (max !== undefined) { out.maximum = max; }
    return out;
  }

  function stringSchema(description, minLength) {
    var out = { type: 'string', description: description };
    if (minLength) { out.minLength = minLength; }
    return out;
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

  function bootstrapPath(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    if (!activeUrl) { return '/'; }
    try {
      var parsed = new URL(activeUrl);
      if (parsed.origin !== AMPLITUDE_ORIGIN) { return '/'; }
      return (parsed.pathname || '/') + (parsed.search || '');
    } catch (e) {
      return '/';
    }
  }

  function buildBootstrapSpec(ctx) {
    return {
      url: AMPLITUDE_ORIGIN + bootstrapPath(ctx),
      method: 'GET',
      headers: { 'Accept': 'text/html,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: AMPLITUDE_ORIGIN,
      extract: '@'
    };
  }

  function firstMatch(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].exec(text);
      if (m && m[1]) { return String(m[1]); }
    }
    return '';
  }

  function parseOrgId(text) {
    var raw = firstMatch(String(text || ''), [
      /["']org_id["']\s*:\s*["']?([A-Za-z0-9_-]+)["']?/,
      /["']orgId["']\s*:\s*["']?([A-Za-z0-9_-]+)["']?/,
      /intercomSettings[\s\S]{0,1200}?["']org_id["']\s*:\s*["']?([A-Za-z0-9_-]+)["']?/,
      /\/t\/graphql\/org\/([A-Za-z0-9_-]+)(?:\?|["'\/])/
    ]);
    return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
  }

  function parseBootstrapResult(result, slug) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403) {
      return fallback(slug, 'amplitude-bootstrap-logged-out');
    }
    var text = typeof result.text === 'string' ? result.text : '';
    if (!text && result.data && typeof result.data === 'object') {
      try { text = JSON.stringify(result.data); } catch (e) { text = ''; }
    }
    var orgId = parseOrgId(text);
    return orgId || fallback(slug, 'amplitude-bootstrap-org-unavailable');
  }

  async function bootstrapOrgId(ctx, slug) {
    var boot = await ctx.executeBoundSpec(buildBootstrapSpec(ctx), ctx.tabId);
    return parseBootstrapResult(boot, slug);
  }

  function querySpec(operationName, query, variables, orgId) {
    return {
      url: AMPLITUDE_ORIGIN + GRAPHQL_PATH_PREFIX + encodeURIComponent(orgId) + '?q=' + encodeURIComponent(operationName),
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Org': orgId
      },
      body: JSON.stringify({
        query: query,
        variables: variables || {},
        operationName: operationName
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: AMPLITUDE_ORIGIN,
      extract: 'data'
    };
  }

  function hasOwn(obj, key) {
    return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function looksLikeError(data) {
    return isPlainObject(data)
      && (typeof data.error === 'string'
        || typeof data.message === 'string'
        || Array.isArray(data.errors));
  }

  function guardGraphqlResult(result, slug, key, extraGuard) {
    if (!result || result.success !== true) { return result; }
    var data = result.data;
    if (result.redirected || result.status === 401 || result.status === 403 ||
        !isPlainObject(data) || looksLikeError(data) || (key && !hasOwn(data, key))) {
      return fallback(slug, 'amplitude-graphql-shape-mismatch');
    }
    if (typeof extraGuard === 'function') {
      var checked = extraGuard(data, slug);
      if (checked && checked.success === false) { return checked; }
    }
    return result;
  }

  function requireArrayKey(key) {
    return function(data, slug) {
      return Array.isArray(data[key])
        ? { success: true }
        : fallback(slug, 'amplitude-graphql-shape-mismatch');
    };
  }

  function requireObjectKey(key) {
    return function(data, slug) {
      return isPlainObject(data[key])
        ? { success: true }
        : fallback(slug, 'amplitude-graphql-shape-mismatch');
    };
  }

  function requireAnyKeys(keys) {
    return function(data, slug) {
      for (var i = 0; i < keys.length; i++) {
        if (hasOwn(data, keys[i])) { return { success: true }; }
      }
      return fallback(slug, 'amplitude-graphql-shape-mismatch');
    };
  }

  function readHandler(slug, operationName, query, variablesForArgs, expectedKey, extraGuard, params) {
    return {
      tier: 'T1a',
      origin: AMPLITUDE_ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'amplitude-execute-bound-spec-unavailable');
        }
        var orgId = await bootstrapOrgId(ctx, slug);
        if (!orgId || orgId.success === false) { return orgId; }
        var a = args || {};
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(a) : {};
        var res = await ctx.executeBoundSpec(querySpec(operationName, query, variables, orgId), ctx.tabId);
        return guardGraphqlResult(res, slug, expectedKey, extraGuard);
      }
    };
  }

  var USER_FIELDS = 'id alias avatarVersion blurb createdAt defaultAllProjectRole defaultAppId email firstName fullName hasAvatar hasOutstandingInvite isConnectedToSlack lastName loginId name orgRole orgTeam title pronouns';
  var SPACE_FIELDS = 'id spaceId orgId type name description richDescription isArchived isDeleted itemCount createdBy createdAt lastViewedDate lastModifiedAt lastViewedAt slackConnected permissionLevel pinnedItems { contentType contentId pinnedBy pinnedAt } public';
  var SEARCH_ENTITY_FIELDS = 'entityId name description type chartType chartCount nudgeType owners isOfficial isTemplate appIds lastModifiedAt lastViewedAt isArchived location { locationId } viewCount';

  var queries = {
    currentUser: 'query OrgData($product: String) { currentUser { loginId email fullName orgRole } }',
    orgData: 'query OrgData($product: String) { apps { id name } currentUser { loginId email fullName orgRole } org { orgId name url plan createdAt } orgHasAppWithData orgCount planInfo { plan planType } }',
    orgs: 'query Orgs { orgs { id name } }',
    users: 'query Users { users { ' + USER_FIELDS + ' } }',
    personalSpace: 'query PersonalSpace { personalSpace { ' + SPACE_FIELDS + ' users usersWithRoles { loginId spaceRole lastViewedAt } descendantFolders { id } } }',
    teamSpaces: 'query TeamSpaces($fetchItemCountInSpaces: Boolean!) { teamSpaces { itemCount @include(if: $fetchItemCountInSpaces) ' + SPACE_FIELDS + ' } }',
    globalSearch: 'query GlobalSearch($query: String!, $limit: Int!, $appIds: [String!], $isArchived: Boolean, $isGenerated: Boolean, $isOfficial: Boolean, $isTemplate: Boolean, $lastModifiedAfter: Float, $lastViewedBefore: Float, $owners: [String!], $searchContentTypes: [String!]!, $sortDirection: SortDirection, $sortOrder: SortOrder, $spaceIds: [String!], $chartTypes: [String!]) { unisearchContentSearch(query: $query limit: $limit appIds: $appIds isArchived: $isArchived isGenerated: $isGenerated isOfficial: $isOfficial isTemplate: $isTemplate lastModifiedAfter: $lastModifiedAfter lastViewedBefore: $lastViewedBefore owners: $owners searchContentTypes: $searchContentTypes sortDirection: $sortDirection sortOrder: $sortOrder spaceIds: $spaceIds chartTypes: $chartTypes) { results { entity { ' + SEARCH_ENTITY_FIELDS + ' } scoreComponents } totalHits } }',
    eventProperties: 'query GetEventPropertiesForEvent($appId: String!, $eventType: String!) { eventProperties(appId: $appId, eventType: $eventType) }',
    colorPalettes: 'query AllColorPalettes { allColorPalettes { id name lightModeColors darkModeColors isAmplitudeDefault isUserPalette createdAt createdBy lastModifiedBy lastModifiedAt isActive } }',
    eventVolumes: 'query OrgEventVolumesByMonth($intervalStart: String!, $intervalEnd: String!) { orgEventVolumesByMonth(intervalStart: $intervalStart, intervalEnd: $intervalEnd) { intervalStart intervalEnd month totalEvents ingestedEvents billedEvents } }',
    mtuVolumes: 'query OrgMTUVolumesByMonth($intervalStart: String!, $intervalEnd: String!) { orgMTUVolumesByMonth(intervalStart: $intervalStart, intervalEnd: $intervalEnd) { intervalStart intervalEnd month totalMTUs billedMTUs } }',
    sessionReplayVolumes: 'query OrgSessionReplayVolumesByMonth($intervalStart: String!, $intervalEnd: String!) { orgSessionReplayVolumesByMonth(intervalStart: $intervalStart, intervalEnd: $intervalEnd) { month totalSessionReplays billedSessionReplays } }',
    entitlements: 'query GetActiveOrgEntitlements { getActiveOrgEntitlements { type source plan quota quotaType startTime endTime } }',
    reportQuota: 'query ReportQuota { canAddReport canSaveChart dashboardCount savedChartCount spaceCount maximumReports }'
  };

  var dateRangeParams = withProps({
    interval_start: stringSchema('Start date in YYYY-MM-DD format', 1),
    interval_end: stringSchema('End date in YYYY-MM-DD format', 1)
  }, ['interval_start', 'interval_end']);

  var listEventsParams = withProps({
    app_id: stringSchema('App/project ID', 1),
    event_type: stringSchema('Event type name', 1)
  }, ['app_id', 'event_type']);

  var searchContentParams = withProps({
    query: stringSchema('Search text', false),
    limit: integerSchema('Max results to return', 1, 100),
    content_types: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'string' } },
    is_archived: { type: 'boolean' },
    sort_order: { type: 'string', enum: ['RELEVANCE', 'LAST_MODIFIED', 'LAST_VIEWED', 'VIEW_COUNT'] },
    sort_direction: { type: 'string', enum: ['ASC', 'DESC'] }
  }, ['query']);

  function orgDataVariables() {
    return { product: 'analytics' };
  }

  function dateRangeVariables(args) {
    return { intervalStart: args.interval_start, intervalEnd: args.interval_end };
  }

  var handlers = {
    'amplitude.get_color_palettes': readHandler('amplitude.get_color_palettes', 'AllColorPalettes', queries.colorPalettes, null, 'allColorPalettes', requireArrayKey('allColorPalettes'), EMPTY_PARAMS),
    'amplitude.get_current_user': readHandler('amplitude.get_current_user', 'OrgData', queries.currentUser, orgDataVariables, 'currentUser', requireObjectKey('currentUser'), EMPTY_PARAMS),
    'amplitude.get_entitlements': readHandler('amplitude.get_entitlements', 'GetActiveOrgEntitlements', queries.entitlements, null, 'getActiveOrgEntitlements', requireArrayKey('getActiveOrgEntitlements'), EMPTY_PARAMS),
    'amplitude.get_event_volumes': readHandler('amplitude.get_event_volumes', 'OrgEventVolumesByMonth', queries.eventVolumes, dateRangeVariables, 'orgEventVolumesByMonth', requireArrayKey('orgEventVolumesByMonth'), dateRangeParams),
    'amplitude.get_mtu_volumes': readHandler('amplitude.get_mtu_volumes', 'OrgMTUVolumesByMonth', queries.mtuVolumes, dateRangeVariables, 'orgMTUVolumesByMonth', requireArrayKey('orgMTUVolumesByMonth'), dateRangeParams),
    'amplitude.get_org_data': readHandler('amplitude.get_org_data', 'OrgData', queries.orgData, orgDataVariables, 'org', requireObjectKey('org'), EMPTY_PARAMS),
    'amplitude.get_personal_space': readHandler('amplitude.get_personal_space', 'PersonalSpace', queries.personalSpace, null, 'personalSpace', requireObjectKey('personalSpace'), EMPTY_PARAMS),
    'amplitude.get_report_quota': readHandler('amplitude.get_report_quota', 'ReportQuota', queries.reportQuota, null, 'canAddReport', requireAnyKeys(['canAddReport', 'canSaveChart', 'dashboardCount', 'savedChartCount', 'spaceCount', 'maximumReports']), EMPTY_PARAMS),
    'amplitude.get_session_replay_volumes': readHandler('amplitude.get_session_replay_volumes', 'OrgSessionReplayVolumesByMonth', queries.sessionReplayVolumes, dateRangeVariables, 'orgSessionReplayVolumesByMonth', requireArrayKey('orgSessionReplayVolumesByMonth'), dateRangeParams),
    'amplitude.list_events': readHandler('amplitude.list_events', 'GetEventPropertiesForEvent', queries.eventProperties, function(args) {
      return { appId: args.app_id, eventType: args.event_type };
    }, 'eventProperties', requireArrayKey('eventProperties'), listEventsParams),
    'amplitude.list_orgs': readHandler('amplitude.list_orgs', 'Orgs', queries.orgs, null, 'orgs', requireArrayKey('orgs'), EMPTY_PARAMS),
    'amplitude.list_spaces': readHandler('amplitude.list_spaces', 'TeamSpaces', queries.teamSpaces, function() {
      return { fetchItemCountInSpaces: true };
    }, 'teamSpaces', requireArrayKey('teamSpaces'), EMPTY_PARAMS),
    'amplitude.list_users': readHandler('amplitude.list_users', 'Users', queries.users, null, 'users', requireArrayKey('users'), EMPTY_PARAMS),
    'amplitude.search_content': readHandler('amplitude.search_content', 'GlobalSearch', queries.globalSearch, function(args) {
      return {
        query: args.query,
        limit: args.limit || 30,
        appIds: [],
        isArchived: args.is_archived || false,
        isGenerated: false,
        isOfficial: false,
        isTemplate: false,
        lastModifiedAfter: 0,
        searchContentTypes: args.content_types || [],
        sortDirection: args.sort_direction || 'DESC',
        sortOrder: args.sort_order || 'RELEVANCE',
        spaceIds: [],
        owners: args.owners || []
      };
    }, 'unisearchContentSearch', requireObjectKey('unisearchContentSearch'), searchContentParams)
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
          descriptor: { slug: slug, service: AMPLITUDE_SERVICE, sideEffectClass: handlers[slug].sideEffectClass, params: handlers[slug].params }
        });
      }
    }
  }

  global.FsbHandlerAmplitude = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
