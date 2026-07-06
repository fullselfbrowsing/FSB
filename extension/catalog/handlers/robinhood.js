(function(global) {
  'use strict';

  /**
   * Robinhood policy-blocked handler surface.
   *
   * Robinhood is intentionally denylisted as a brokerage/trading origin. These
   * handlers register the catalog slugs so the port surface is explicit, but every
   * handler returns the standard typed fallback and never calls executeBoundSpec.
   */

  var ORIGIN = 'https://robinhood.com';
  var SERVICE = 'robinhood.com';
  var FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

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
    return typedRecipeError(FALLBACK_CODE, {
      slug: slug,
      reason: reason || 'robinhood-policy-blocked',
      fellBackToDom: true
    });
  }

  var EMPTY_PARAMS = schema({}, []);
  var SYMBOL_PARAMS = schema({
    symbol: { type: 'string', minLength: 1, description: 'Ticker symbol' }
  }, ['symbol']);
  var SYMBOLS_PARAMS = schema({
    symbols: { type: 'string', minLength: 1, description: 'Comma-separated ticker symbols' }
  }, ['symbols']);
  var HISTORICALS_PARAMS = schema({
    symbols: { type: 'string', minLength: 1, description: 'Comma-separated ticker symbols' },
    interval: { type: 'string', enum: ['5minute', '10minute', 'hour', 'day', 'week'] },
    span: { type: 'string', enum: ['day', 'week', 'month', '3month', 'year', '5year', 'all'] },
    bounds: { type: 'string', enum: ['regular', 'extended', 'trading'] }
  }, ['symbols', 'interval', 'span', 'bounds']);
  var INSTRUMENT_ID_PARAMS = schema({
    instrument_id: { type: 'string', minLength: 1, description: 'Instrument UUID' }
  }, ['instrument_id']);
  var MARKET_HOURS_PARAMS = schema({
    market: { type: 'string', description: 'Market MIC code, default XNYS' },
    date: { type: 'string', minLength: 1, description: 'Date in YYYY-MM-DD format' }
  }, ['date']);
  var PORTFOLIO_HISTORICALS_PARAMS = schema({
    span: { type: 'string', enum: ['day', 'week', 'month', '3month', 'year', 'all'] },
    interval: { type: 'string', enum: ['5minute', '10minute', 'day', 'week'] },
    bounds: { type: 'string', enum: ['regular', 'extended', 'trading'] }
  }, ['span', 'interval', 'bounds']);
  var WATCHLIST_ID_PARAMS = schema({
    list_id: { type: 'string', minLength: 1, description: 'Watchlist UUID' }
  }, ['list_id']);
  var CREATE_WATCHLIST_PARAMS = schema({
    name: { type: 'string', minLength: 1, description: 'Display name for the new list' }
  }, ['name']);
  var LIST_ORDERS_PARAMS = schema({
    updated_at_gte: { type: 'string', description: 'Only return orders updated after this ISO date' }
  }, []);
  var NEWS_FEED_PARAMS = schema({
    instrument_id: { type: 'string', description: 'Instrument UUID to filter news for a specific stock' }
  }, []);
  var SEARCH_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Company name or ticker symbol' }
  }, ['query']);

  function inert(slug, sideEffectClass, params, reason) {
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

  var handlers = {
    'robinhood.create_watchlist': inert('robinhood.create_watchlist', 'write', CREATE_WATCHLIST_PARAMS,
      'unverified-robinhood-create-watchlist-mutation'),
    'robinhood.delete_watchlist': inert('robinhood.delete_watchlist', 'destructive', WATCHLIST_ID_PARAMS,
      'unverified-robinhood-delete-watchlist-mutation'),
    'robinhood.get_account': inert('robinhood.get_account', 'read', EMPTY_PARAMS),
    'robinhood.get_current_user': inert('robinhood.get_current_user', 'read', EMPTY_PARAMS),
    'robinhood.get_earnings': inert('robinhood.get_earnings', 'read', SYMBOL_PARAMS),
    'robinhood.get_fundamentals': inert('robinhood.get_fundamentals', 'read', SYMBOL_PARAMS),
    'robinhood.get_historicals': inert('robinhood.get_historicals', 'read', HISTORICALS_PARAMS),
    'robinhood.get_instrument': inert('robinhood.get_instrument', 'read', INSTRUMENT_ID_PARAMS),
    'robinhood.get_market_hours': inert('robinhood.get_market_hours', 'read', MARKET_HOURS_PARAMS),
    'robinhood.get_news_feed': inert('robinhood.get_news_feed', 'read', NEWS_FEED_PARAMS),
    'robinhood.get_portfolio': inert('robinhood.get_portfolio', 'read', EMPTY_PARAMS),
    'robinhood.get_portfolio_historicals': inert('robinhood.get_portfolio_historicals', 'read', PORTFOLIO_HISTORICALS_PARAMS),
    'robinhood.get_quote': inert('robinhood.get_quote', 'read', SYMBOLS_PARAMS),
    'robinhood.get_ratings': inert('robinhood.get_ratings', 'read', INSTRUMENT_ID_PARAMS),
    'robinhood.get_watchlist': inert('robinhood.get_watchlist', 'read', WATCHLIST_ID_PARAMS),
    'robinhood.list_crypto_holdings': inert('robinhood.list_crypto_holdings', 'read', EMPTY_PARAMS),
    'robinhood.list_dividends': inert('robinhood.list_dividends', 'read', EMPTY_PARAMS),
    'robinhood.list_notifications': inert('robinhood.list_notifications', 'read', EMPTY_PARAMS),
    'robinhood.list_orders': inert('robinhood.list_orders', 'read', LIST_ORDERS_PARAMS),
    'robinhood.list_positions': inert('robinhood.list_positions', 'read', EMPTY_PARAMS),
    'robinhood.list_transfers': inert('robinhood.list_transfers', 'read', EMPTY_PARAMS),
    'robinhood.list_watchlists': inert('robinhood.list_watchlists', 'read', EMPTY_PARAMS),
    'robinhood.search_instruments': inert('robinhood.search_instruments', 'read', SEARCH_PARAMS)
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

  global.FsbHandlerRobinhood = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
