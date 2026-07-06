(function (global) {
  'use strict';

  /**
   * Sentry same-origin API head.
   *
   * The vendored Sentry plugin uses the web app's first-party /api/0 surface.
   * This handler keeps read operations executable through executeBoundSpec and
   * leaves comment/issue mutations guarded until live mutation-body UAT exists.
   */

  var ORIGIN = 'https://sentry.io';
  var SERVICE = 'sentry.io';
  var API_PREFIX = '/api/0';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var NUMBER = { type: 'number' };
  var BOOLEAN = { type: 'boolean' };
  var EMPTY_PARAMS = schema({}, []);
  var CURSOR_PARAMS = schema({ cursor: stringField('Pagination cursor from a previous response') }, []);
  var ISSUE_ID_PARAMS = schema({ issue_id: stringField('The issue ID') }, ['issue_id']);
  var PROJECT_SLUG_PARAMS = schema({ project_slug: stringField('Project slug') }, ['project_slug']);
  var GET_EVENT_PARAMS = schema({
    project_slug: stringField('Project slug the event belongs to'),
    event_id: stringField('The event ID to retrieve')
  }, ['project_slug', 'event_id']);
  var GET_RELEASE_PARAMS = schema({
    version: stringField('The release version string')
  }, ['version']);
  var CREATE_COMMENT_PARAMS = schema({
    issue_id: stringField('The issue ID to comment on'),
    text: stringField('Comment text content')
  }, ['issue_id', 'text']);
  var LIST_ISSUE_EVENTS_PARAMS = schema({
    issue_id: stringField('The issue ID to list events for'),
    limit: boundedNumber('Maximum number of events to return', 1, 100),
    cursor: stringField('Pagination cursor from a previous response')
  }, ['issue_id']);
  var LIST_MEMBERS_PARAMS = schema({
    limit: boundedNumber('Maximum number of members to return', 1, 100),
    cursor: stringField('Pagination cursor from a previous response')
  }, []);
  var LIST_RELEASES_PARAMS = schema({
    project: { type: 'array', items: NUMBER, description: 'Project IDs to filter by' },
    query: stringField('Filter releases by version string'),
    limit: boundedNumber('Maximum number of releases to return', 1, 100),
    cursor: stringField('Pagination cursor from a previous response')
  }, []);
  var LIST_REPLAYS_PARAMS = schema({
    project: { type: 'array', items: NUMBER, description: 'Project IDs to filter by' },
    query: stringField('Search query to filter replays'),
    limit: boundedNumber('Maximum number of replays to return', 1, 100),
    cursor: stringField('Pagination cursor from a previous response')
  }, []);
  var SEARCH_ISSUES_PARAMS = schema({
    query: stringField('Sentry search query'),
    project: { type: 'array', items: NUMBER, description: 'Project IDs to filter by' },
    environment: { type: 'array', items: STRING, description: 'Environment names to filter by' },
    sort: { type: 'string', enum: ['date', 'new', 'freq', 'user', 'trends'] },
    limit: boundedNumber('Maximum number of issues to return', 1, 100),
    cursor: stringField('Pagination cursor from a previous response')
  }, []);
  var UPDATE_ISSUE_PARAMS = schema({
    issue_id: stringField('The issue ID to update'),
    status: { type: 'string', enum: ['resolved', 'resolvedInNextRelease', 'unresolved', 'ignored'] },
    assigned_to: stringField('Username or team slug to assign to'),
    has_seen: BOOLEAN,
    is_bookmarked: BOOLEAN,
    is_public: BOOLEAN,
    is_subscribed: BOOLEAN,
    priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
  }, ['issue_id']);

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
    return { type: 'string', description: description };
  }

  function boundedNumber(description, min, max) {
    return {
      type: 'number',
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
      reason: reason || 'sentry-auth-or-shape-mismatch',
      fellBackToDom: true
    });
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

  function activeUrlFromContext(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function isSentryHost(hostname) {
    var h = String(hostname || '').toLowerCase();
    return h === 'sentry.io' || h.endsWith('.sentry.io');
  }

  function activeSentryOrigin(ctx) {
    try {
      var activeUrl = activeUrlFromContext(ctx);
      var parsed = new URL(activeUrl || ORIGIN + '/');
      if (parsed.protocol === 'https:' && isSentryHost(parsed.hostname)) {
        return parsed.origin;
      }
    } catch (e) {
      return ORIGIN;
    }
    return ORIGIN;
  }

  function orgSlugFromContext(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    try {
      var parsed = new URL(activeUrl || ORIGIN + '/');
      if (parsed.protocol !== 'https:' || !isSentryHost(parsed.hostname)) { return ''; }
      var subdomain = parsed.hostname.match(/^([a-z0-9-]+)\.sentry\.io$/);
      if (subdomain && subdomain[1] !== 'www' && subdomain[1] !== 'docs' && subdomain[1] !== 'blog') {
        return subdomain[1];
      }
      var pathMatch = parsed.pathname.match(/^\/organizations\/([a-z0-9_-]+)(?:\/|$)/)
        || parsed.pathname.match(/^\/settings\/([a-z0-9_-]+)(?:\/|$)/);
      return pathMatch && pathMatch[1] ? pathMatch[1] : '';
    } catch (e) {
      return '';
    }
  }

  function encodeSegment(value) {
    return encodeURIComponent(String(value));
  }

  function appendQuery(parts, key, value) {
    if (value === undefined || value === null || value === '') { return; }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        appendQuery(parts, key, value[i]);
      }
      return;
    }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      appendQuery(parts, pairs[i][0], pairs[i][1]);
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function readSpec(ctx, endpoint, pairs) {
    var origin = activeSentryOrigin(ctx);
    return {
      url: origin + API_PREFIX + endpoint + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: origin,
      extract: '@'
    };
  }

  function getHeader(headers, name) {
    if (!headers) { return ''; }
    if (typeof headers.get === 'function') { return str(headers.get(name)); }
    return str(headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]);
  }

  function cursorFromResult(result) {
    if (!result) { return ''; }
    if (result.nextCursor) { return str(result.nextCursor); }
    var link = getHeader(result.headers, 'Link');
    var m = link.match(/<[^>]*[?&]cursor=([^&>]+)[^>]*>;\s*rel="next";\s*results="true"/);
    return m && m[1] ? decodeURIComponent(m[1]) : '';
  }

  function looksLikeError(data) {
    return isObject(data) && (
      typeof data.detail === 'string' ||
      typeof data.error === 'string' ||
      Array.isArray(data.errors)
    );
  }

  function guardResult(result, slug, expected) {
    if (!result || result.success !== true) { return result; }
    if (result.redirected || result.status === 401 || result.status === 403 ||
        (typeof result.status === 'number' && result.status >= 400)) {
      return fallback(slug, 'sentry-http-auth-or-rot');
    }
    var data = result.data;
    if (looksLikeError(data)) { return fallback(slug, 'sentry-api-error-shape'); }
    if (expected === 'array' && !Array.isArray(data)) { return fallback(slug, 'sentry-array-shape-mismatch'); }
    if (expected === 'object' && !isObject(data)) { return fallback(slug, 'sentry-object-shape-mismatch'); }
    if (expected === 'replay-list' && (!isObject(data) || !Array.isArray(data.data))) {
      return fallback(slug, 'sentry-replay-shape-mismatch');
    }
    return result;
  }

  async function sentryRead(slug, args, ctx, endpoint, pairs, expected, mapper) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'sentry-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(readSpec(ctx, endpoint, pairs || []), ctx.tabId);
    var guarded = guardResult(result, slug, expected);
    if (!guarded || guarded.success !== true) { return guarded; }
    var mapped = mapper ? mapper(guarded.data, cursorFromResult(guarded), args || {}, ctx || {}) : guarded.data;
    return {
      success: true,
      status: guarded.status,
      finalUrl: guarded.finalUrl,
      redirected: guarded.redirected,
      data: mapped
    };
  }

  function withOrg(slug, ctx, build) {
    var org = orgSlugFromContext(ctx);
    if (!org) { return { error: fallback(slug, 'sentry-org-slug-unavailable') }; }
    return { endpoint: build(org) };
  }

  function mapIssue(i) {
    i = isObject(i) ? i : {};
    var project = isObject(i.project) ? i.project : {};
    var assignedTo = isObject(i.assignedTo) ? i.assignedTo : null;
    return {
      id: str(i.id),
      short_id: str(i.shortId),
      title: str(i.title),
      culprit: str(i.culprit),
      level: str(i.level),
      status: str(i.status),
      priority: str(i.priority),
      count: str(i.count || '0'),
      user_count: num(i.userCount),
      first_seen: str(i.firstSeen),
      last_seen: str(i.lastSeen),
      permalink: str(i.permalink),
      project: { id: str(project.id), name: str(project.name), slug: str(project.slug) },
      assigned_to: assignedTo && assignedTo.name ? str(assignedTo.name) : null,
      is_bookmarked: bool(i.isBookmarked),
      has_seen: bool(i.hasSeen),
      issue_category: str(i.issueCategory),
      issue_type: str(i.issueType)
    };
  }

  function mapEvent(e) {
    e = isObject(e) ? e : {};
    var tags = list(e.tags);
    var metadata = isObject(e.metadata) ? e.metadata : {};
    return {
      id: str(e.id),
      event_id: str(e.eventID || e.id),
      title: str(e.title),
      message: str(e.message || metadata.value),
      platform: str(e.platform),
      date_created: str(e.dateCreated),
      tags: tags.map(function(t) { return { key: str(t && t.key), value: str(t && t.value) }; })
    };
  }

  function mapEventDetail(e) {
    var out = mapEvent(e);
    var context = e && (e.context || e.contexts) ? (e.context || e.contexts) : {};
    out.context = JSON.stringify(context).slice(0, 10000);
    out.entries = JSON.stringify(e && e.entries ? e.entries : []).slice(0, 20000);
    return out;
  }

  function mapProject(p) {
    p = isObject(p) ? p : {};
    return {
      id: str(p.id),
      name: str(p.name),
      slug: str(p.slug),
      platform: str(p.platform),
      date_created: str(p.dateCreated),
      is_bookmarked: bool(p.isBookmarked),
      has_access: bool(p.hasAccess),
      status: str(p.status)
    };
  }

  function mapOrganization(o) {
    o = isObject(o) ? o : {};
    var status = isObject(o.status) ? o.status : {};
    return {
      id: str(o.id),
      name: str(o.name),
      slug: str(o.slug),
      date_created: str(o.dateCreated),
      status: str(status.id || o.status)
    };
  }

  function mapTeam(t) {
    t = isObject(t) ? t : {};
    return {
      id: str(t.id),
      name: str(t.name),
      slug: str(t.slug),
      member_count: num(t.memberCount),
      date_created: str(t.dateCreated)
    };
  }

  function mapMember(m) {
    m = isObject(m) ? m : {};
    var user = isObject(m.user) ? m.user : {};
    return {
      id: str(m.id),
      email: str(m.email || user.email),
      name: str(user.name || m.name),
      role: str(m.orgRole || m.role),
      date_joined: str(m.dateCreated),
      is_pending: bool(m.pending)
    };
  }

  function mapRelease(r) {
    r = isObject(r) ? r : {};
    return {
      version: str(r.version),
      short_version: str(r.shortVersion),
      date_released: str(r.dateReleased),
      date_created: str(r.dateCreated),
      new_groups: num(r.newGroups),
      commit_count: num(r.commitCount),
      deploy_count: num(r.deployCount)
    };
  }

  function mapReleaseDetail(r, org) {
    var base = mapRelease(r);
    var authors = list(r && r.authors).map(function(a) {
      return { name: str(a && a.name), email: str(a && a.email) };
    });
    base.first_event = r && r.firstEvent ? str(r.firstEvent) : null;
    base.last_event = r && r.lastEvent ? str(r.lastEvent) : null;
    base.authors = authors;
    base.url = base.version ? ORIGIN + '/organizations/' + encodeSegment(org) + '/releases/' + encodeSegment(base.version) + '/' : '';
    return base;
  }

  function mapAlert(a) {
    a = isObject(a) ? a : {};
    var projects = list(a.projects);
    return {
      id: str(a.id),
      name: str(a.name),
      status: str(a.status),
      date_created: str(a.dateCreated),
      project_slug: str(projects[0]),
      type: str(a.type || 'issue')
    };
  }

  function mapComment(c) {
    c = isObject(c) ? c : {};
    var user = isObject(c.user) ? c.user : {};
    var data = isObject(c.data) ? c.data : {};
    return {
      id: str(c.id),
      text: str(c.text || data.text),
      author_name: str(user.name),
      author_email: str(user.email),
      date_created: str(c.dateCreated),
      type: str(c.type)
    };
  }

  function mapIssueTag(t) {
    t = isObject(t) ? t : {};
    return {
      key: str(t.key),
      name: str(t.name),
      total_values: num(t.totalValues),
      top_values: list(t.topValues).map(function(v) {
        return { value: str(v && v.value), count: num(v && v.count) };
      })
    };
  }

  function mapMonitor(m) {
    m = isObject(m) ? m : {};
    var config = isObject(m.config) ? m.config : {};
    var project = isObject(m.project) ? m.project : {};
    var schedule = '';
    if (config.schedule_type === 'crontab') {
      schedule = str(config.schedule);
    } else {
      schedule = 'every ' + num(config.schedule) + ' ' + str(config.schedule_type || 'minute') + '(s)';
    }
    return {
      id: str(m.id),
      name: str(m.name),
      slug: str(m.slug),
      status: str(m.status),
      type: str(m.type || 'cron_job'),
      schedule: schedule,
      date_created: str(m.dateCreated),
      project_slug: str(project.slug)
    };
  }

  function mapEnvironment(e) {
    e = isObject(e) ? e : {};
    return { id: str(e.id), name: str(e.name), is_hidden: bool(e.isHidden) };
  }

  function mapReplay(r) {
    r = isObject(r) ? r : {};
    return {
      id: str(r.id),
      title: str(r.title),
      duration: num(r.duration),
      count_errors: num(r.count_errors || r.countErrors),
      started_at: str(r.started_at || r.startedAt),
      finished_at: str(r.finished_at || r.finishedAt),
      urls: list(r.urls).slice(0, 10).map(str),
      project_id: str(r.project_id || r.projectId)
    };
  }

  function mapProjectKey(k) {
    k = isObject(k) ? k : {};
    var dsn = isObject(k.dsn) ? k.dsn : {};
    return {
      id: str(k.id),
      name: str(k.name || k.label),
      dsn_public: str(dsn.public),
      date_created: str(k.dateCreated),
      is_active: k.isActive !== false
    };
  }

  function pagedArray(key, mapper) {
    return function(data, cursor) {
      var out = {};
      out[key] = list(data).map(mapper);
      out.cursor = cursor || '';
      return out;
    };
  }

  function guarded(slug, sideEffectClass, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: sideEffectClass,
      params: params,
      async handle() {
        return fallback(slug, 'unverified-' + slug.replace(/\./g, '-') + '-mutation');
      }
    };
  }

  function readHandler(slug, params, expected, makeEndpoint, makePairs, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var built = makeEndpoint(args || {}, ctx || {});
        if (built && built.error) { return built.error; }
        return sentryRead(
          slug,
          args || {},
          ctx || {},
          built.endpoint,
          makePairs ? makePairs(args || {}) : [],
          expected,
          mapper
        );
      }
    };
  }

  function orgEndpoint(slug, ctx, fn) {
    return withOrg(slug, ctx, fn);
  }

  var handlers = {
    'sentry.get_event': readHandler('sentry.get_event', GET_EVENT_PARAMS, 'object',
      function(a, ctx) { return orgEndpoint('sentry.get_event', ctx, function(org) {
        return '/projects/' + encodeSegment(org) + '/' + encodeSegment(a.project_slug) + '/events/' + encodeSegment(a.event_id) + '/';
      }); },
      null, function(data) { return { event: mapEventDetail(data) }; }),
    'sentry.get_issue': readHandler('sentry.get_issue', ISSUE_ID_PARAMS, 'object',
      function(a, ctx) { return orgEndpoint('sentry.get_issue', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/issues/' + encodeSegment(a.issue_id) + '/';
      }); },
      null, function(data) { return { issue: mapIssue(data) }; }),
    'sentry.get_organization': readHandler('sentry.get_organization', EMPTY_PARAMS, 'object',
      function(_a, ctx) { return orgEndpoint('sentry.get_organization', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/';
      }); },
      null, function(data) { return { organization: mapOrganization(data) }; }),
    'sentry.get_project': readHandler('sentry.get_project', PROJECT_SLUG_PARAMS, 'object',
      function(a, ctx) { return orgEndpoint('sentry.get_project', ctx, function(org) {
        return '/projects/' + encodeSegment(org) + '/' + encodeSegment(a.project_slug) + '/';
      }); },
      null, function(data) { return { project: mapProject(data) }; }),
    'sentry.get_project_keys': readHandler('sentry.get_project_keys', PROJECT_SLUG_PARAMS, 'array',
      function(a, ctx) { return orgEndpoint('sentry.get_project_keys', ctx, function(org) {
        return '/projects/' + encodeSegment(org) + '/' + encodeSegment(a.project_slug) + '/keys/';
      }); },
      null, function(data) { return { keys: list(data).map(mapProjectKey) }; }),
    'sentry.get_release': readHandler('sentry.get_release', GET_RELEASE_PARAMS, 'object',
      function(a, ctx) { return orgEndpoint('sentry.get_release', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/releases/' + encodeSegment(a.version) + '/';
      }); },
      null, function(data, _cursor, _args, ctx) { return mapReleaseDetail(data, orgSlugFromContext(ctx)); }),
    'sentry.list_alerts': readHandler('sentry.list_alerts', CURSOR_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.list_alerts', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/combined-rules/';
      }); },
      function(a) { return [['cursor', a.cursor]]; }, pagedArray('alerts', mapAlert)),
    'sentry.list_comments': readHandler('sentry.list_comments', schema({
      issue_id: stringField('The issue ID to list comments for'),
      cursor: stringField('Pagination cursor from a previous response')
    }, ['issue_id']), 'array',
      function(a, ctx) { return orgEndpoint('sentry.list_comments', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/issues/' + encodeSegment(a.issue_id) + '/comments/';
      }); },
      function(a) { return [['cursor', a.cursor]]; }, pagedArray('comments', mapComment)),
    'sentry.list_issue_events': readHandler('sentry.list_issue_events', LIST_ISSUE_EVENTS_PARAMS, 'array',
      function(a, ctx) { return orgEndpoint('sentry.list_issue_events', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/issues/' + encodeSegment(a.issue_id) + '/events/';
      }); },
      function(a) { return [['per_page', a.limit], ['cursor', a.cursor]]; }, pagedArray('events', mapEvent)),
    'sentry.list_issue_tags': readHandler('sentry.list_issue_tags', ISSUE_ID_PARAMS, 'array',
      function(a, ctx) { return orgEndpoint('sentry.list_issue_tags', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/issues/' + encodeSegment(a.issue_id) + '/tags/';
      }); },
      null, function(data, cursor) { return { tags: list(data).map(mapIssueTag), cursor: cursor || '' }; }),
    'sentry.list_members': readHandler('sentry.list_members', LIST_MEMBERS_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.list_members', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/members/';
      }); },
      function(a) { return [['per_page', a.limit], ['cursor', a.cursor]]; }, pagedArray('members', mapMember)),
    'sentry.list_monitors': readHandler('sentry.list_monitors', LIST_MEMBERS_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.list_monitors', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/monitors/';
      }); },
      function(a) { return [['per_page', a.limit], ['cursor', a.cursor]]; }, pagedArray('monitors', mapMonitor)),
    'sentry.list_organizations': readHandler('sentry.list_organizations', CURSOR_PARAMS, 'array',
      function() { return { endpoint: '/organizations/' }; },
      function(a) { return [['cursor', a.cursor]]; },
      function(data) { return { organizations: list(data).map(mapOrganization) }; }),
    'sentry.list_project_environments': readHandler('sentry.list_project_environments', PROJECT_SLUG_PARAMS, 'array',
      function(a, ctx) { return orgEndpoint('sentry.list_project_environments', ctx, function(org) {
        return '/projects/' + encodeSegment(org) + '/' + encodeSegment(a.project_slug) + '/environments/';
      }); },
      null, function(data) { return { environments: list(data).map(mapEnvironment) }; }),
    'sentry.list_projects': readHandler('sentry.list_projects', CURSOR_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.list_projects', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/projects/';
      }); },
      function(a) { return [['cursor', a.cursor]]; }, pagedArray('projects', mapProject)),
    'sentry.list_releases': readHandler('sentry.list_releases', LIST_RELEASES_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.list_releases', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/releases/';
      }); },
      function(a) { return [['project', a.project], ['query', a.query], ['per_page', a.limit], ['cursor', a.cursor]]; },
      pagedArray('releases', mapRelease)),
    'sentry.list_replays': readHandler('sentry.list_replays', LIST_REPLAYS_PARAMS, 'replay-list',
      function(_a, ctx) { return orgEndpoint('sentry.list_replays', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/replays/';
      }); },
      function(a) { return [['project', a.project], ['query', a.query], ['per_page', a.limit], ['cursor', a.cursor]]; },
      function(data, cursor) { return { replays: list(data.data).map(mapReplay), cursor: cursor || '' }; }),
    'sentry.list_teams': readHandler('sentry.list_teams', LIST_MEMBERS_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.list_teams', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/teams/';
      }); },
      function(a) { return [['per_page', a.limit], ['cursor', a.cursor]]; }, pagedArray('teams', mapTeam)),
    'sentry.search_issues': readHandler('sentry.search_issues', SEARCH_ISSUES_PARAMS, 'array',
      function(_a, ctx) { return orgEndpoint('sentry.search_issues', ctx, function(org) {
        return '/organizations/' + encodeSegment(org) + '/issues/';
      }); },
      function(a) {
        return [
          ['query', a.query === undefined ? 'is:unresolved' : a.query],
          ['sort', a.sort],
          ['limit', a.limit === undefined ? 25 : a.limit],
          ['cursor', a.cursor],
          ['project', a.project],
          ['environment', a.environment]
        ];
      },
      pagedArray('issues', mapIssue)),

    'sentry.create_comment': guarded('sentry.create_comment', 'write', CREATE_COMMENT_PARAMS),
    'sentry.update_issue': guarded('sentry.update_issue', 'write', UPDATE_ISSUE_PARAMS)
  };

  if (global.FsbCapabilityCatalog && typeof global.FsbCapabilityCatalog.registerHandler === 'function') {
    Object.keys(handlers).forEach(function(slug) {
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
    });
  }

  global.FsbHandlerSentry = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
