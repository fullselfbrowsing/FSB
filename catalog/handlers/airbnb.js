(function (global) {
  'use strict';

  /**
   * Airbnb same-origin read head.
   *
   * Ports reviewed read-only Airbnb GraphQL queries and current-page data reads.
   * Wishlist removal stays out of this module because it is destructive.
   */

  var AIRBNB_ORIGIN = 'https://www.airbnb.com';
  var AIRBNB_SERVICE = 'airbnb.com';
  var API_KEY = 'd306zoyjsyarp7ifhu67rjxn52tv0t20';
  var INT_LIMIT = 9007199254740991;

  var QUERY_HASHES = {
    Header: 'bb590cf8c21b62e4b5122e1cd19969f1f1df72832040a335fd45af52597440e4',
    GetThumbnailPicQuery: 'c580fd640ccff52e5410e321af202495da29d3438f16fb78ca4ca129119563e7',
    IsHostQuery: '9c7b90a451bf2e27619bd48bdc0ef878f34121a07358db917978368dd4e162a7',
    WishlistIndexPageQuery: 'b8b421d802c399b55fb6ac1111014807a454184ad38f198365beb7836c018c18',
    WishlistItemsAsyncQuery: 'c0f9d9474bb20eb7af2f94f8e022750a5ed9b7437613e1d9aa91aadea87e4467',
    AutoSuggestionsQuery: '840ae28ff24af2a4729bd74fb5b98eadcd3412e3a28fea5c9ae18e5a216e6aca',
    ViaductInboxData: 'c7df4bccc0bbd009ed779a8567f1fddbd30491e3927edcc64331fe9b855dfa57',
    ViaductGetThreadAndDataQuery: 'dcb6744db9acb399e8da07cc518b8004d618a5bd96371e40820b034a40dae35f',
    FetchInboxFiltersConfig: '5c1689bbbba34a5d01635a50d4a57827d840985612adcd7be7a3dbb6e7ede536',
    MapViewportInfoQuery: 'aae2b4447f90adfd800a006f1afc80e2df9f98ddc8cd932628da179ebae10c79'
  };

  var EMPTY_PARAMS = schema({}, []);
  var MAP_VIEWPORT_PARAMS = schema({
    southwest_lat: { type: 'number', description: 'Southwest corner latitude' },
    southwest_lng: { type: 'number', description: 'Southwest corner longitude' },
    northeast_lat: { type: 'number', description: 'Northeast corner latitude' },
    northeast_lng: { type: 'number', description: 'Northeast corner longitude' },
    zoom_level: { type: 'number', description: 'Map zoom level' }
  }, ['southwest_lat', 'southwest_lng', 'northeast_lat', 'northeast_lng', 'zoom_level']);
  var THREAD_PARAMS = schema({
    thread_id: { type: 'string', minLength: 1, description: 'Base64-encoded thread ID' }
  }, ['thread_id']);
  var THUMBNAIL_PARAMS = schema({
    user_id: { type: 'string', minLength: 1, description: 'Numeric user ID' }
  }, ['user_id']);
  var WISHLIST_ITEMS_PARAMS = schema({
    listing_ids: {
      minItems: 1,
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Array of listing IDs to check'
    }
  }, ['listing_ids']);
  var LIST_THREADS_PARAMS = schema({
    limit: integerSchema('Number of threads to return', 1, 100),
    filter: { type: 'string', enum: ['all', 'traveling', 'support'], description: 'Inbox filter category' }
  }, []);
  var LIST_WISHLISTS_PARAMS = schema({
    limit: integerSchema('Number of wishlists to return', 1, 100),
    offset: integerSchema('Pagination offset', 0, INT_LIMIT)
  }, []);
  var SUGGESTIONS_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Search text to get suggestions for' }
  }, ['query']);

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
      reason: reason || 'airbnb-read-shape-mismatch',
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

  function nullableString(value) {
    return value === undefined || value === null ? null : String(value);
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function bool(value) {
    return value === true;
  }

  function boundedInt(value, fallbackValue, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) { n = fallbackValue; }
    n = Math.floor(n);
    if (min !== undefined && n < min) { n = min; }
    if (max !== undefined && n > max) { n = max; }
    return n;
  }

  function nested(raw, path) {
    var cur = raw;
    for (var i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') { return undefined; }
      cur = cur[path[i]];
    }
    return cur;
  }

  function firstString(values) {
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value !== undefined && value !== null && String(value) !== '') {
        return String(value);
      }
    }
    return '';
  }

  function firstNullableString(values) {
    var value = firstString(values);
    return value ? value : null;
  }

  function componentText(value) {
    var components = value && Array.isArray(value.components) ? value.components : [];
    var out = '';
    for (var i = 0; i < components.length; i++) {
      out += str(components[i] && components[i].text);
    }
    return out;
  }

  function base64Encode(value) {
    var s = String(value);
    if (typeof btoa === 'function') { return btoa(s); }
    if (typeof Buffer !== 'undefined') { return Buffer.from(s, 'utf8').toString('base64'); }
    return s;
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function graphUrl(operationName, hash, variables) {
    var pairs = [
      ['operationName', operationName],
      ['locale', 'en'],
      ['currency', 'USD']
    ];
    if (variables && isObject(variables)) {
      pairs.push(['variables', JSON.stringify(variables)]);
    }
    pairs.push(['extensions', JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: hash }
    })]);
    return AIRBNB_ORIGIN + '/api/v3/' + encodeURIComponent(operationName)
      + '/' + encodeURIComponent(hash) + buildQuery(pairs);
  }

  function graphSpec(operationName, hash, variables) {
    return {
      url: graphUrl(operationName, hash, variables),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Airbnb-API-Key': API_KEY,
        'X-Airbnb-GraphQL-Platform': 'web',
        'X-Airbnb-GraphQL-Platform-Client': 'minimalist-niobe',
        'X-Airbnb-Supports-Airlock-V2': 'true',
        'X-CSRF-Without-Token': '1'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: AIRBNB_ORIGIN,
      extract: '@'
    };
  }

  function payloadFromResult(result, slug) {
    if (!result || result.success !== true) {
      return { ok: false, result: fallback(slug, 'airbnb-graphql-request-failed') };
    }
    if (result.redirected || (typeof result.status === 'number' && result.status >= 400)) {
      return { ok: false, result: fallback(slug, 'airbnb-graphql-http-error') };
    }
    var payload = result.data;
    if (!payload && result.json) { payload = result.json; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, result: fallback(slug, 'airbnb-graphql-empty-payload') };
    }
    if (Array.isArray(payload.errors) && payload.errors.length) {
      return { ok: false, result: fallback(slug, 'airbnb-graphql-errors') };
    }
    var data = isObject(payload.data) ? payload.data : payload;
    if (!isObject(data)) {
      return { ok: false, result: fallback(slug, 'airbnb-graphql-data-missing') };
    }
    return { ok: true, data: data, status: result.status };
  }

  async function fetchGraph(slug, ctx, operationName, hash, variables) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return { ok: false, result: fallback(slug, 'airbnb-execute-bound-spec-unavailable') };
    }
    var result = await ctx.executeBoundSpec(graphSpec(operationName, hash, variables), ctx.tabId);
    return payloadFromResult(result, slug);
  }

  function graphRead(slug, params, operationName, hash, variablesForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: AIRBNB_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(args || {}) : variablesForArgs;
        var graph = await fetchGraph(slug, ctx, operationName, hash, variables);
        if (!graph.ok) { return graph.result; }
        var mapped = mapper(graph.data, args || {});
        if (!mapped) { return fallback(slug, 'airbnb-graphql-shape-mismatch'); }
        return { success: true, status: graph.status, data: mapped };
      }
    };
  }

  function pageRead(slug, params, action) {
    return {
      tier: 'T1a',
      origin: AIRBNB_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'airbnb-execute-bound-page-read-unavailable');
        }
        var out = await ctx.executeBoundPageRead({
          namespace: 'airbnb',
          origin: AIRBNB_ORIGIN,
          action: action,
          args: args || {}
        }, ctx.tabId);
        if (!out || out.success !== true) {
          return out || fallback(slug, 'airbnb-page-read-failed');
        }
        return out;
      }
    };
  }

  function headerVariables() {
    return {
      cdnCacheSafe: false,
      hasLoggedIn: true,
      isInitialLoad: false,
      source: 'EXPLORE',
      supportsM13ListingsSetupFlow: true
    };
  }

  function currentUserId(data) {
    var user = nested(data, ['viewer', 'user']);
    if (!isObject(user)) { return ''; }
    return firstString([
      user.id,
      user.idStr,
      user.id_str,
      user.userId,
      user.user_id,
      nested(user, ['identity', 'id'])
    ]);
  }

  function mapHeaderItem(item) {
    var i = item || {};
    return {
      id: str(i.itemId),
      text: str(i.text),
      url: nullableString(i.url),
      badge_count: i.badgeCount === undefined || i.badgeCount === null ? null : numberValue(i.badgeCount),
      has_badge: bool(i.hasBadge),
      icon: str(i.icon)
    };
  }

  function mapCurrentUser(data) {
    var user = nested(data, ['viewer', 'user']);
    var header = nested(data, ['presentation', 'header']);
    if (!isObject(user) || !isObject(header)) { return null; }
    return {
      user: {
        id: firstNullableString([currentUserId(data)]),
        avatar_url: nullableString(header.avatarImageUrl),
        is_host: bool(user.isExperienceHostV2),
        is_service_host: bool(user.isServiceHost)
      }
    };
  }

  function mapHeaderInfo(data) {
    var header = nested(data, ['presentation', 'header']);
    if (!isObject(header)) { return null; }
    var groups = list(header.menuItemGroups);
    var items = [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i] && groups[i].groupId === 'SECONDARY_MENU') {
        items = list(groups[i].items);
        break;
      }
    }
    if (!items.length && groups[0]) { items = list(groups[0].items); }
    var menuItems = items.map(mapHeaderItem);
    var unread = 0;
    for (var m = 0; m < menuItems.length; m++) {
      if (menuItems[m].id === 'MESSAGES' && menuItems[m].badge_count !== null) {
        unread = menuItems[m].badge_count;
      }
    }
    return {
      avatar_url: nullableString(header.avatarImageUrl),
      menu_items: menuItems,
      unread_message_count: unread
    };
  }

  function mapInboxFilter(filter) {
    var f = filter || {};
    return {
      id: str(f.id),
      title: str(f.title),
      unread_count: str(f.unreadCount === undefined ? '0' : f.unreadCount)
    };
  }

  function mapInboxFilters(data) {
    var filters = nested(data, ['viewer', 'messagingInbox', 'inboxFiltersConfig', 'filters']);
    if (!Array.isArray(filters)) { return null; }
    return { filters: filters.map(mapInboxFilter) };
  }

  function mapViewport(data) {
    var info = nested(data, ['maps', 'getMapViewportInfo']);
    if (!isObject(info)) { return null; }
    return { location_name: str(info.localizedLocationName) };
  }

  function viewportVariables(args) {
    return {
      request: {
        boundingBox: {
          southwest: { lat: Number(args.southwest_lat), lng: Number(args.southwest_lng) },
          northeast: { lat: Number(args.northeast_lat), lng: Number(args.northeast_lng) }
        },
        zoomLevel: Number(args.zoom_level)
      }
    };
  }

  function messageVariables(args) {
    return {
      numRequestedMessages: 50,
      getThreadState: true,
      getParticipants: true,
      mockThreadIdentifier: null,
      mockMessageTestIdentifier: null,
      getLastReads: true,
      forceUgcTranslation: false,
      isNovaLite: false,
      globalThreadId: str(args.thread_id),
      mockListFooterSlot: null,
      forceReturnAllReadReceipts: false,
      originType: 'USER_INBOX',
      getInboxFields: true,
      getInboxOnlyFields: false,
      getMessageFields: true,
      getThreadOnlyFields: true,
      skipOldMessagePreviewFields: false
    };
  }

  function participantNameMap(thread) {
    var out = {};
    var edges = list(nested(thread, ['participants', 'edges']));
    for (var i = 0; i < edges.length; i++) {
      var node = edges[i] && edges[i].node;
      var accountId = str(node && node.accountId);
      var name = str(nested(node, ['enrichedParticipantInfo', 'name']));
      if (accountId && name) { out[accountId] = name; }
    }
    var ordered = list(thread && thread.orderedParticipants);
    for (var j = 0; j < ordered.length; j++) {
      var p = ordered[j] || {};
      var id = str(p.accountId);
      var display = str(nested(p, ['enrichedParticipantInfo', 'name']));
      if (id && display) { out[id] = display; }
    }
    return out;
  }

  function mapMessage(raw, names) {
    var m = raw || {};
    var senderId = str(nested(m, ['account', 'accountId']));
    return {
      id: str(m.id),
      content: firstString([nested(m, ['content', 'text']), nested(m, ['contentPreview', 'content'])]),
      sender_name: firstString([nested(m, ['sender', 'enrichedParticipantInfo', 'name']), names[senderId]]),
      sender_id: senderId,
      sender_type: str(nested(m, ['account', 'accountType'])),
      created_at_ms: str(m.createdAtMs),
      is_deleted: m.deletedAtMs !== null && m.deletedAtMs !== undefined
    };
  }

  function mapMessageThread(data, args) {
    var thread = data.threadData;
    if (!isObject(thread)) { return null; }
    var names = participantNameMap(thread);
    var edges = list(nested(thread, ['messages', 'edges']));
    var messages = [];
    for (var i = 0; i < edges.length; i++) {
      messages.push(mapMessage(edges[i] && edges[i].node, names));
    }
    return {
      thread_id: str(thread.id || args.thread_id),
      thread_type: str(thread.messageThreadType),
      title: componentText(thread.inboxTitle),
      messages: messages
    };
  }

  function thumbnailVariables(args) {
    return { ids: [base64Encode('User:' + str(args.user_id))] };
  }

  function mapThumbnail(data) {
    var users = nested(data, ['userBlock', 'users']);
    if (!Array.isArray(users)) { return null; }
    var user = users[0] || {};
    var rep = user.userRepresentationUrl || {};
    return {
      thumbnail_url: nullableString(rep.thumbnailUrl),
      thumbnail_url_medium: nullableString(rep.thumbnailUrlMedium)
    };
  }

  function wishlistItemsVariables(args) {
    return {
      listingIds: list(args.listing_ids).map(str).filter(Boolean),
      listingType: 'HOME',
      networkCacheVersion: 1
    };
  }

  function mapWishlistItems(data) {
    var info = nested(data, ['presentation', 'wishlistItemsInfo']);
    if (!Array.isArray(info)) { return null; }
    return {
      items: info.map(function (item) {
        return {
          listing_id: str(item && item.listingId),
          wishlists: list(item && item.wishlistItems).map(function (w) {
            return { id: str(w && w.id), name: str(w && w.name) };
          })
        };
      })
    };
  }

  function mapIsHost(data) {
    var user = nested(data, ['viewer', 'user']);
    if (!isObject(user)) { return null; }
    return { is_host: bool(user.isHomeHost) };
  }

  function threadVariables(args, userId) {
    var filter = args && args.filter ? String(args.filter) : 'all';
    return {
      getParticipants: true,
      numRequestedThreads: boundedInt(args && args.limit, 15, 1, 100),
      useUserThreadTag: true,
      userId: base64Encode('Viewer:' + userId),
      originType: 'USER_INBOX',
      threadVisibility: 'UNARCHIVED',
      threadTagFilters: filter === 'all' ? [] : [filter],
      query: null,
      getLastReads: false,
      getThreadState: false,
      getInboxFields: true,
      getInboxOnlyFields: true,
      getMessageFields: false,
      getThreadOnlyFields: false,
      skipOldMessagePreviewFields: false
    };
  }

  function mapThread(raw) {
    var t = raw || {};
    var participants = [];
    var edges = list(nested(t, ['participants', 'edges']));
    for (var i = 0; i < edges.length; i++) {
      var name = str(nested(edges[i], ['node', 'enrichedParticipantInfo', 'name']));
      if (name) { participants.push(name); }
    }
    return {
      id: str(t.id),
      thread_type: str(t.messageThreadType),
      title: componentText(t.inboxTitle),
      description: componentText(t.inboxDescription),
      is_unread: list(t.userThreadTags).some(function (tag) {
        return tag && tag.userThreadTagName === 'unread';
      }),
      updated_at_ms: str(t.mostRecentInboxActivityAtMsFromROS),
      participants: participants,
      listing_image_url: nullableString(t.inboxListingImageUrl)
    };
  }

  function mapThreads(data) {
    var threads = nested(data, ['node', 'messagingInbox', 'threads']);
    var edges = threads && threads.edges;
    if (!Array.isArray(edges)) { return null; }
    return {
      threads: edges.map(function (edge) { return mapThread(edge && edge.node); }),
      has_next_page: bool(nested(threads, ['pageInfo', 'hasNextPage']))
    };
  }

  async function getUserIdForThreads(ctx, slug) {
    if (ctx && typeof ctx.executeBoundPageRead === 'function') {
      var attrs = await ctx.executeBoundPageRead({
        namespace: 'airbnb',
        origin: AIRBNB_ORIGIN,
        action: 'get_user_attributes',
        args: {}
      }, ctx.tabId);
      if (attrs && attrs.success === true && attrs.data && attrs.data.id) {
        return { ok: true, id: str(attrs.data.id) };
      }
    }
    var header = await fetchGraph(slug, ctx, 'Header', QUERY_HASHES.Header, headerVariables());
    if (!header.ok) { return header; }
    return { ok: true, id: currentUserId(header.data) };
  }

  async function listThreadsHandle(args, ctx) {
    var slug = 'airbnb.list_message_threads';
    var user = await getUserIdForThreads(ctx, slug);
    if (!user.ok) { return user.result; }
    var userId = user.id;
    if (!userId) { return fallback(slug, 'airbnb-current-user-id-unavailable'); }
    var inbox = await fetchGraph(slug, ctx, 'ViaductInboxData', QUERY_HASHES.ViaductInboxData, threadVariables(args || {}, userId));
    if (!inbox.ok) { return inbox.result; }
    var mapped = mapThreads(inbox.data);
    if (!mapped) { return fallback(slug, 'airbnb-threads-shape-mismatch'); }
    return { success: true, status: inbox.status, data: mapped };
  }

  function wishlistVariables(args) {
    return {
      limit: boundedInt(args && args.limit, 12, 1, 100),
      offset: boundedInt(args && args.offset, 0, 0, INT_LIMIT),
      treatmentFlags: ['wishlist_should_load_service']
    };
  }

  function mapWishlist(raw) {
    var w = raw || {};
    return {
      id: str(w.id),
      name: str(w.name),
      is_private: bool(w.isPrivate),
      is_collaborative: bool(w.isCollaborative),
      guest_count: numberValue(w.guestCount),
      guest_description: str(nested(w, ['guestDetails', 'description', 'localizedString'])),
      check_in: nullableString(nested(w, ['dateRangeDetails', 'checkIn'])),
      check_out: nullableString(nested(w, ['dateRangeDetails', 'checkOut'])),
      cover_image_url: firstNullableString([w.xlImageUrl, nested(w, ['pictures', 0, 'largePicture'])]),
      listing_count: list(nested(w, ['productIds', 'stayIds'])).length,
      owner_name: str(nested(w, ['wishlistUser', 'contextualUser', 'displayFirstName'])),
      collaborator_names: list(w.collaboratorUsers).map(function (c) {
        return str(nested(c, ['contextualUser', 'displayFirstName']));
      }).filter(Boolean)
    };
  }

  function mapWishlists(data) {
    var wishlists = nested(data, ['presentation', 'wishlistIndexPage', 'wishlists']);
    if (!Array.isArray(wishlists)) { return null; }
    return { wishlists: wishlists.map(mapWishlist) };
  }

  function suggestionsVariables(args) {
    return {
      skipExtendedSearchParams: false,
      autoSuggestionsRequest: {
        rawParams: [{ filterName: 'query', filterValues: [str(args.query)] }],
        source: 'P2',
        treatmentFlags: []
      }
    };
  }

  function mapSuggestion(item) {
    return {
      display_name: str(item && item.title),
      type: str(item && item.subtitle),
      image_url: nullableString(item && item.iconUrl)
    };
  }

  function mapSuggestions(data) {
    var results = nested(data, ['presentation', 'autoSuggestions', 'staysAutoSuggestionResults']);
    if (!Array.isArray(results)) { return null; }
    var suggestions = [];
    for (var i = 0; i < results.length; i++) {
      var items = list(results[i] && results[i].items);
      for (var j = 0; j < items.length; j++) {
        if (items[j] && items[j].__typename === 'LocationSuggestionItem') {
          suggestions.push(mapSuggestion(items[j]));
        }
      }
    }
    return { suggestions: suggestions };
  }

  var handlers = {
    'airbnb.get_current_user': graphRead('airbnb.get_current_user', EMPTY_PARAMS, 'Header', QUERY_HASHES.Header, headerVariables, mapCurrentUser),
    'airbnb.get_header_info': graphRead('airbnb.get_header_info', EMPTY_PARAMS, 'Header', QUERY_HASHES.Header, headerVariables, mapHeaderInfo),
    'airbnb.get_inbox_filters': graphRead('airbnb.get_inbox_filters', EMPTY_PARAMS, 'FetchInboxFiltersConfig', QUERY_HASHES.FetchInboxFiltersConfig, null, mapInboxFilters),
    'airbnb.get_listing_from_page': pageRead('airbnb.get_listing_from_page', EMPTY_PARAMS, 'get_listing_from_page'),
    'airbnb.get_map_viewport_info': graphRead('airbnb.get_map_viewport_info', MAP_VIEWPORT_PARAMS, 'MapViewportInfoQuery', QUERY_HASHES.MapViewportInfoQuery, viewportVariables, mapViewport),
    'airbnb.get_message_thread': graphRead('airbnb.get_message_thread', THREAD_PARAMS, 'ViaductGetThreadAndDataQuery', QUERY_HASHES.ViaductGetThreadAndDataQuery, messageVariables, mapMessageThread),
    'airbnb.get_search_results': pageRead('airbnb.get_search_results', EMPTY_PARAMS, 'get_search_results'),
    'airbnb.get_user_thumbnail': graphRead('airbnb.get_user_thumbnail', THUMBNAIL_PARAMS, 'GetThumbnailPicQuery', QUERY_HASHES.GetThumbnailPicQuery, thumbnailVariables, mapThumbnail),
    'airbnb.get_wishlist_items': graphRead('airbnb.get_wishlist_items', WISHLIST_ITEMS_PARAMS, 'WishlistItemsAsyncQuery', QUERY_HASHES.WishlistItemsAsyncQuery, wishlistItemsVariables, mapWishlistItems),
    'airbnb.is_host': graphRead('airbnb.is_host', EMPTY_PARAMS, 'IsHostQuery', QUERY_HASHES.IsHostQuery, null, mapIsHost),
    'airbnb.list_message_threads': {
      tier: 'T1a',
      origin: AIRBNB_ORIGIN,
      sideEffectClass: 'read',
      params: LIST_THREADS_PARAMS,
      handle: listThreadsHandle
    },
    'airbnb.list_wishlists': graphRead('airbnb.list_wishlists', LIST_WISHLISTS_PARAMS, 'WishlistIndexPageQuery', QUERY_HASHES.WishlistIndexPageQuery, wishlistVariables, mapWishlists),
    'airbnb.search_suggestions': graphRead('airbnb.search_suggestions', SUGGESTIONS_PARAMS, 'AutoSuggestionsQuery', QUERY_HASHES.AutoSuggestionsQuery, suggestionsVariables, mapSuggestions)
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
            service: AIRBNB_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerAirbnb = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
