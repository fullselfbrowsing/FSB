(function(global) {
  'use strict';

  /**
   * Fidelity policy-blocked handler surface.
   *
   * Fidelity is intentionally denylisted as a brokerage/trading origin. These
   * handlers register the catalog slugs so the port surface is explicit, but every
   * handler returns the standard typed fallback and never calls executeBoundSpec.
   */

  var ORIGIN = 'https://digital.fidelity.com';
  var SERVICE = 'digital.fidelity.com';
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
      reason: reason || 'fidelity-policy-blocked',
      fellBackToDom: true
    });
  }

  var EMPTY_PARAMS = schema({}, []);
  var BALANCE_HISTORY_PARAMS = schema({
    range: {
      description: 'Time range for balance history (default: 1Y)',
      type: 'string',
      enum: ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y']
    }
  }, []);
  var ACCOUNT_NUMBER_PARAMS = schema({
    account_number: {
      type: 'string',
      minLength: 1,
      description: 'Account number for the retirement account'
    }
  }, ['account_number']);
  var INVESTMENT_NEWS_PARAMS = schema({
    symbols: {
      minItems: 1,
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Ticker symbols to get news for (e.g., ["AAPL", "VOO"])'
    },
    count: {
      description: 'Number of articles to return (default 20, max 50)',
      type: 'integer',
      minimum: 1,
      maximum: 50
    }
  }, ['symbols']);
  var PORTFOLIO_EVENTS_PARAMS = schema({
    direction: {
      description: 'Look at future or past events (default: future)',
      type: 'string',
      enum: ['future', 'past']
    },
    symbols: {
      description: 'Specific symbols to check. If omitted, uses top portfolio holdings.',
      type: 'array',
      items: { type: 'string' }
    }
  }, []);
  var POSITIONS_PARAMS = schema({
    account_numbers: {
      description: 'Account numbers to get positions for. If omitted, returns positions for all accounts.',
      type: 'array',
      items: { type: 'string' }
    }
  }, []);
  var QUOTES_PARAMS = schema({
    symbols: {
      minItems: 1,
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Ticker symbols to quote (e.g., ["AAPL", "VOO", "QQQ"])'
    }
  }, ['symbols']);

  function inert(slug, params) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params || EMPTY_PARAMS,
      async handle() {
        return fallback(slug);
      }
    };
  }

  var handlers = {
    'fidelity.get_advisor_info': inert('fidelity.get_advisor_info', EMPTY_PARAMS),
    'fidelity.get_balance_history': inert('fidelity.get_balance_history', BALANCE_HISTORY_PARAMS),
    'fidelity.get_contribution_data': inert('fidelity.get_contribution_data', ACCOUNT_NUMBER_PARAMS),
    'fidelity.get_customer_orders': inert('fidelity.get_customer_orders', EMPTY_PARAMS),
    'fidelity.get_investment_news': inert('fidelity.get_investment_news', INVESTMENT_NEWS_PARAMS),
    'fidelity.get_market_movers': inert('fidelity.get_market_movers', EMPTY_PARAMS),
    'fidelity.get_portfolio_events': inert('fidelity.get_portfolio_events', PORTFOLIO_EVENTS_PARAMS),
    'fidelity.get_portfolio_summary': inert('fidelity.get_portfolio_summary', EMPTY_PARAMS),
    'fidelity.get_positions': inert('fidelity.get_positions', POSITIONS_PARAMS),
    'fidelity.get_quotes': inert('fidelity.get_quotes', QUOTES_PARAMS),
    'fidelity.get_service_messages': inert('fidelity.get_service_messages', EMPTY_PARAMS),
    'fidelity.get_top_news': inert('fidelity.get_top_news', EMPTY_PARAMS),
    'fidelity.list_accounts': inert('fidelity.list_accounts', EMPTY_PARAMS)
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

  global.FsbHandlerFidelity = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
