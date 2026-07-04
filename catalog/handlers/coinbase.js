(function (global) {
  'use strict';

  /**
   * Coinbase same-origin GraphQL head.
   *
   * Query-only descriptors execute against Coinbase's first-party /graphql/query
   * endpoint with same-origin cookies. Watchlist and price-alert mutations stay
   * guarded fail-closed until live mutation-body UAT records their exact request
   * shape and redaction proof.
   */

  var ORIGIN = 'https://www.coinbase.com';
  var SERVICE = 'coinbase.com';
  var GRAPHQL_URL = ORIGIN + '/graphql/query';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var UUID_PARAMS = schema({
    uuid: { type: 'string', minLength: 1, description: 'Coinbase asset UUID' },
    quote_currency: { type: 'string', description: 'Quote currency for price, default USD' }
  }, ['uuid']);
  var ASSET_UUID_ONLY_PARAMS = schema({
    uuid: { type: 'string', minLength: 1, description: 'Coinbase asset UUID' }
  }, ['uuid']);
  var SLUG_PARAMS = schema({
    slug: { type: 'string', minLength: 1, description: 'Asset URL slug' },
    quote_currency: { type: 'string', description: 'Quote currency for price, default USD' }
  }, ['slug']);
  var SYMBOL_PARAMS = schema({
    symbol: { type: 'string', minLength: 1, description: 'Asset ticker symbol' },
    quote_currency: { type: 'string', description: 'Quote currency for price, default USD' }
  }, ['symbol']);
  var COMPARE_PARAMS = schema({
    uuids: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 10,
      description: 'Coinbase asset UUIDs to compare'
    },
    quote_currency: { type: 'string', description: 'Quote currency for prices, default USD' }
  }, ['uuids']);
  var LIST_ALERTS_PARAMS = schema({
    limit: integerSchema('Maximum alerts to return', 1, 100)
  }, []);

  var ADD_WATCHLIST_ITEM_PARAMS = schema({
    watchlist_uuid: { type: 'string', minLength: 1, description: 'Watchlist UUID' },
    asset_uuid: { type: 'string', minLength: 1, description: 'Asset UUID to add' }
  }, ['watchlist_uuid', 'asset_uuid']);
  var CREATE_PRICE_ALERT_PARAMS = schema({
    asset_uuid: { type: 'string', minLength: 1, description: 'Asset UUID for the alert' },
    target_price: { type: 'string', minLength: 1, description: 'Target price as a decimal string' },
    direction: { type: 'string', enum: ['ABOVE', 'BELOW'], description: 'Alert direction' }
  }, ['asset_uuid', 'target_price', 'direction']);
  var CREATE_WATCHLIST_PARAMS = schema({
    name: { type: 'string', minLength: 1, description: 'Watchlist name' }
  }, ['name']);
  var DELETE_PRICE_ALERT_PARAMS = schema({
    alert_uuid: { type: 'string', minLength: 1, description: 'Price alert UUID' }
  }, ['alert_uuid']);
  var WATCHLIST_UUID_PARAMS = schema({
    watchlist_uuid: { type: 'string', minLength: 1, description: 'Watchlist UUID' }
  }, ['watchlist_uuid']);
  var REMOVE_WATCHLIST_ITEM_PARAMS = schema({
    watchlist_uuid: { type: 'string', minLength: 1, description: 'Watchlist UUID' },
    item_uuid: { type: 'string', minLength: 1, description: 'Watchlist item UUID' }
  }, ['watchlist_uuid', 'item_uuid']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

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
      reason: reason || 'coinbase-graphql-shape-mismatch',
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

  function quoteCurrency(args) {
    return str(args && args.quote_currency) || 'USD';
  }

  function hasOwn(obj, key) {
    return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function querySpec(operationName, query, variables) {
    return {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'CB-CLIENT': 'CoinbaseWeb',
        'cb-version': '2021-01-11',
        'X-CB-Platform': 'web',
        'X-CB-Project-Name': 'consumer'
      },
      body: JSON.stringify({
        query: query,
        variables: variables || {},
        operationName: operationName
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function dataFromResult(result, slug) {
    if (!result || result.success !== true) { return result; }
    var status = Number(result.status || 0);
    if (result.redirected || status === 401 || status === 403 || status >= 400) {
      return fallback(slug, 'coinbase-graphql-http-error');
    }
    var envelope = result.data;
    if (!isObject(envelope) && typeof result.text === 'string') {
      try { envelope = JSON.parse(result.text); } catch (e) { envelope = null; }
    }
    if (!isObject(envelope) || (Array.isArray(envelope.errors) && envelope.errors.length)) {
      return fallback(slug, 'coinbase-graphql-error');
    }
    if (!isObject(envelope.data)) {
      return fallback(slug, 'coinbase-graphql-data-missing');
    }
    return envelope.data;
  }

  function withData(result, data) {
    return {
      success: true,
      status: result && result.status,
      data: data
    };
  }

  async function callGraphql(slug, operationName, query, variables, mapper, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'coinbase-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(querySpec(operationName, query, variables), ctx.tabId);
    var data = dataFromResult(result, slug);
    if (!data || data.success === false) { return data; }
    try {
      return withData(result, mapper(data));
    } catch (e) {
      return fallback(slug, 'coinbase-graphql-map-failed');
    }
  }

  function mapUserProperties(u) {
    return {
      uuid: str(u && u.uuid),
      name: str(u && u.name),
      email: str(u && u.email),
      native_currency: str(u && u.nativeCurrency),
      avatar_url: str(u && u.avatarUrl),
      created_at: str(u && u.createdAt),
      country_code: str(u && u.country && u.country.code),
      country_name: str(u && u.country && u.country.name)
    };
  }

  function mapPortfolio(p) {
    return {
      uuid: str(p && p.uuid),
      name: str(p && p.name),
      type: str(p && p.type)
    };
  }

  function mapAsset(a) {
    return {
      uuid: str(a && a.uuid),
      name: str(a && a.name),
      symbol: str(a && a.symbol),
      slug: str(a && a.slug),
      description: str(a && a.description),
      color: str(a && a.color),
      image_url: str(a && a.imageUrl),
      circulating_supply: str(a && a.circulatingSupply),
      max_supply: str(a && a.maxSupply),
      market_cap: str(a && a.marketCap),
      volume_24h: str(a && a.volume24h),
      all_time_high: str(a && a.allTimeHigh),
      unit_price_scale: Number.isFinite(Number(a && a.unitPriceScale)) ? Number(a.unitPriceScale) : 2
    };
  }

  function mapLatestPrice(p) {
    return {
      price: str(p && p.price) || '0',
      timestamp: str(p && p.timestamp),
      quote_currency: str(p && p.quoteCurrency) || 'USD'
    };
  }

  function mapAssetCategory(c) {
    return {
      uuid: str(c && c.uuid),
      name: str(c && c.name),
      slug: str(c && c.slug),
      description: str(c && c.description)
    };
  }

  function mapAssetNetwork(n) {
    return {
      display_name: str(n && n.displayName),
      chain_id: n && n.chainId !== undefined ? n.chainId : null,
      contract_address: n && n.contractAddress !== undefined ? n.contractAddress : null
    };
  }

  function mapWatchlistItem(i) {
    return {
      uuid: str(i && i.uuid),
      type: str(i && i.type),
      created_at: str(i && i.createdAt)
    };
  }

  function mapWatchlist(w) {
    return {
      uuid: str(w && w.uuid),
      name: str(w && w.name),
      description: str(w && w.description),
      items: list(w && w.items).map(mapWatchlistItem)
    };
  }

  function mapPriceAlert(a) {
    return {
      uuid: str(a && a.uuid),
      target_price: str(a && a.targetPrice),
      direction: str(a && a.direction),
      asset_name: str(a && a.asset && a.asset.name),
      asset_symbol: str(a && a.asset && a.asset.symbol)
    };
  }

  function requireObject(value) {
    if (!isObject(value)) { throw new Error('shape mismatch'); }
    return value;
  }

  function assetDetailData(data, key) {
    var a = requireObject(data[key]);
    return {
      asset: mapAsset(a),
      latest_price: mapLatestPrice(a.latestPrice)
    };
  }

  function buildCompareQuery(uuids) {
    var varDefs = uuids.map(function(_uuid, i) { return '$uuid' + i + ': String!'; }).join(', ');
    var fields = uuids.map(function(_uuid, i) {
      return 'a' + i + ': assetByUuid(uuid: $uuid' + i + ') { uuid name symbol latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency } }';
    }).join('\n  ');
    return 'query CompareAssetPrices($quoteCurrency: String!, ' + varDefs + ') {\n  ' + fields + '\n}';
  }

  function readHandler(slug, params, operationName, queryForArgs, variablesForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var a = args || {};
        var query = typeof queryForArgs === 'function' ? queryForArgs(a) : queryForArgs;
        var variables = typeof variablesForArgs === 'function' ? variablesForArgs(a) : {};
        return callGraphql(slug, operationName, query, variables, mapper, ctx);
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
        return fallback(slug, reason);
      }
    };
  }

  var GET_ASSET_BY_SLUG_QUERY =
    'query GetAssetBySlug($slug: String!, $quoteCurrency: TickerSymbol!) {\n' +
    '  assetBySlug(slug: $slug) {\n' +
    '    uuid name symbol slug description color imageUrl\n' +
    '    circulatingSupply maxSupply marketCap volume24h allTimeHigh unitPriceScale\n' +
    '    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }\n' +
    '  }\n' +
    '}';
  var GET_ASSET_BY_SYMBOL_QUERY =
    'query GetAssetBySymbol($symbol: String!, $quoteCurrency: TickerSymbol!) {\n' +
    '  assetBySymbol(symbol: $symbol) {\n' +
    '    uuid name symbol slug description color imageUrl\n' +
    '    circulatingSupply maxSupply marketCap volume24h allTimeHigh unitPriceScale\n' +
    '    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }\n' +
    '  }\n' +
    '}';
  var GET_ASSET_BY_UUID_QUERY =
    'query GetAssetByUuid($uuid: Uuid!, $quoteCurrency: TickerSymbol!) {\n' +
    '  assetByUuid(uuid: $uuid) {\n' +
    '    uuid name symbol slug description color imageUrl\n' +
    '    circulatingSupply maxSupply marketCap volume24h allTimeHigh unitPriceScale\n' +
    '    latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency }\n' +
    '    categories { uuid name slug description }\n' +
    '    networks { displayName chainId contractAddress }\n' +
    '  }\n' +
    '}';
  var GET_CATEGORIES_QUERY =
    'query GetAssetCategories($uuid: Uuid!) {\n' +
    '  assetByUuid(uuid: $uuid) { categories { uuid name slug description } }\n' +
    '}';
  var GET_NETWORKS_QUERY =
    'query GetAssetNetworks($uuid: Uuid!) {\n' +
    '  assetByUuid(uuid: $uuid) { name symbol networks { displayName chainId contractAddress } }\n' +
    '}';
  var GET_PRICE_QUERY =
    'query GetAssetPrice($uuid: Uuid!, $quoteCurrency: TickerSymbol!) {\n' +
    '  assetByUuid(uuid: $uuid) { name symbol latestPrice(quoteCurrency: $quoteCurrency) { price timestamp quoteCurrency } }\n' +
    '}';
  var GET_CURRENT_USER_QUERY =
    'query GetCurrentUser {\n' +
    '  viewer { userProperties { uuid name email nativeCurrency avatarUrl createdAt country { code name } } }\n' +
    '}';
  var LIST_PORTFOLIOS_QUERY =
    'query ListPortfolios { viewer { portfolios { uuid name type } } }';
  var LIST_PRICE_ALERTS_QUERY =
    'query ListPriceAlerts($first: Int!) {\n' +
    '  viewer { priceAlerts(first: $first) { edges { node { uuid targetPrice direction asset { name symbol } } } totalCount pageInfo { hasNextPage endCursor } } }\n' +
    '}';
  var LIST_WATCHLISTS_QUERY =
    'query ListWatchlists {\n' +
    '  viewer { watchlists { edges { node { uuid name description items { uuid type createdAt } } } } }\n' +
    '}';

  var handlers = {
    'coinbase.compare_asset_prices': readHandler('coinbase.compare_asset_prices', COMPARE_PARAMS, 'CompareAssetPrices',
      function(args) {
        var uuids = list(args.uuids).slice(0, 10).map(str).filter(Boolean);
        if (!uuids.length) { uuids = ['']; }
        return buildCompareQuery(uuids);
      },
      function(args) {
        var uuids = list(args.uuids).slice(0, 10).map(str).filter(Boolean);
        var vars = { quoteCurrency: quoteCurrency(args) };
        for (var i = 0; i < uuids.length; i++) { vars['uuid' + i] = uuids[i]; }
        return vars;
      },
      function(data) {
        var uuids = Object.keys(data).filter(function(k) { return /^a[0-9]+$/.test(k); }).sort();
        if (!uuids.length) { throw new Error('shape mismatch'); }
        return {
          assets: uuids.map(function(k) {
            var a = requireObject(data[k]);
            return {
              uuid: str(a.uuid),
              name: str(a.name),
              symbol: str(a.symbol),
              latest_price: mapLatestPrice(a.latestPrice)
            };
          })
        };
      }),
    'coinbase.get_asset_by_slug': readHandler('coinbase.get_asset_by_slug', SLUG_PARAMS, 'GetAssetBySlug',
      GET_ASSET_BY_SLUG_QUERY,
      function(args) { return { slug: args.slug, quoteCurrency: quoteCurrency(args) }; },
      function(data) { return assetDetailData(data, 'assetBySlug'); }),
    'coinbase.get_asset_by_symbol': readHandler('coinbase.get_asset_by_symbol', SYMBOL_PARAMS, 'GetAssetBySymbol',
      GET_ASSET_BY_SYMBOL_QUERY,
      function(args) { return { symbol: args.symbol, quoteCurrency: quoteCurrency(args) }; },
      function(data) { return assetDetailData(data, 'assetBySymbol'); }),
    'coinbase.get_asset_by_uuid': readHandler('coinbase.get_asset_by_uuid', UUID_PARAMS, 'GetAssetByUuid',
      GET_ASSET_BY_UUID_QUERY,
      function(args) { return { uuid: args.uuid, quoteCurrency: quoteCurrency(args) }; },
      function(data) {
        var a = requireObject(data.assetByUuid);
        return {
          asset: mapAsset(a),
          latest_price: mapLatestPrice(a.latestPrice),
          categories: list(a.categories).map(mapAssetCategory),
          networks: list(a.networks).map(mapAssetNetwork)
        };
      }),
    'coinbase.get_asset_categories': readHandler('coinbase.get_asset_categories', ASSET_UUID_ONLY_PARAMS, 'GetAssetCategories',
      GET_CATEGORIES_QUERY,
      function(args) { return { uuid: args.uuid }; },
      function(data) { return { categories: list(requireObject(data.assetByUuid).categories).map(mapAssetCategory) }; }),
    'coinbase.get_asset_networks': readHandler('coinbase.get_asset_networks', ASSET_UUID_ONLY_PARAMS, 'GetAssetNetworks',
      GET_NETWORKS_QUERY,
      function(args) { return { uuid: args.uuid }; },
      function(data) {
        var a = requireObject(data.assetByUuid);
        return {
          asset_name: str(a.name),
          asset_symbol: str(a.symbol),
          networks: list(a.networks).map(mapAssetNetwork)
        };
      }),
    'coinbase.get_asset_price': readHandler('coinbase.get_asset_price', UUID_PARAMS, 'GetAssetPrice',
      GET_PRICE_QUERY,
      function(args) { return { uuid: args.uuid, quoteCurrency: quoteCurrency(args) }; },
      function(data) {
        var a = requireObject(data.assetByUuid);
        return { name: str(a.name), symbol: str(a.symbol), latest_price: mapLatestPrice(a.latestPrice) };
      }),
    'coinbase.get_current_user': readHandler('coinbase.get_current_user', EMPTY_PARAMS, 'GetCurrentUser',
      GET_CURRENT_USER_QUERY,
      function() { return {}; },
      function(data) { return { user: mapUserProperties(requireObject(requireObject(data.viewer).userProperties)) }; }),
    'coinbase.list_portfolios': readHandler('coinbase.list_portfolios', EMPTY_PARAMS, 'ListPortfolios',
      LIST_PORTFOLIOS_QUERY,
      function() { return {}; },
      function(data) { return { portfolios: list(requireObject(data.viewer).portfolios).map(mapPortfolio) }; }),
    'coinbase.list_price_alerts': readHandler('coinbase.list_price_alerts', LIST_ALERTS_PARAMS, 'ListPriceAlerts',
      LIST_PRICE_ALERTS_QUERY,
      function(args) { return { first: Number.isFinite(Number(args.limit)) ? Math.max(1, Math.min(100, Number(args.limit))) : 50 }; },
      function(data) {
        var conn = requireObject(requireObject(data.viewer).priceAlerts);
        return {
          alerts: list(conn.edges).map(function(e) { return mapPriceAlert(e && e.node); }),
          total_count: Number.isFinite(Number(conn.totalCount)) ? Number(conn.totalCount) : 0
        };
      }),
    'coinbase.list_watchlists': readHandler('coinbase.list_watchlists', EMPTY_PARAMS, 'ListWatchlists',
      LIST_WATCHLISTS_QUERY,
      function() { return {}; },
      function(data) {
        var conn = requireObject(requireObject(data.viewer).watchlists);
        return { watchlists: list(conn.edges).map(function(e) { return mapWatchlist(e && e.node); }) };
      }),

    'coinbase.add_watchlist_item': guarded('coinbase.add_watchlist_item', 'write', ADD_WATCHLIST_ITEM_PARAMS,
      'unverified-coinbase-add-watchlist-item-mutation'),
    'coinbase.create_price_alert': guarded('coinbase.create_price_alert', 'write', CREATE_PRICE_ALERT_PARAMS,
      'unverified-coinbase-create-price-alert-mutation'),
    'coinbase.create_watchlist': guarded('coinbase.create_watchlist', 'write', CREATE_WATCHLIST_PARAMS,
      'unverified-coinbase-create-watchlist-mutation'),
    'coinbase.delete_price_alert': guarded('coinbase.delete_price_alert', 'destructive', DELETE_PRICE_ALERT_PARAMS,
      'unverified-coinbase-delete-price-alert-mutation'),
    'coinbase.delete_watchlist': guarded('coinbase.delete_watchlist', 'destructive', WATCHLIST_UUID_PARAMS,
      'unverified-coinbase-delete-watchlist-mutation'),
    'coinbase.remove_watchlist_item': guarded('coinbase.remove_watchlist_item', 'destructive', REMOVE_WATCHLIST_ITEM_PARAMS,
      'unverified-coinbase-remove-watchlist-item-mutation')
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

  global.FsbHandlerCoinbase = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
