(function (global) {
  'use strict';

  /**
   * Carta same-origin read head.
   *
   * Carta's investor web app exposes the reviewed portfolio/account reads on
   * app.carta.com. Portfolio-scoped endpoints use the portfolio id already present
   * in the active Carta URL, matching the vendored OpenTabs plugin's context rule.
   * All handlers are read-only GETs executed through executeBoundSpec.
   */

  var ORIGIN = 'https://app.carta.com';
  var SERVICE = 'app.carta.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var CORPORATION_ID_PARAMS = schema({
    corporation_id: integerSchema('Corporation ID from list_companies', 1)
  }, ['corporation_id']);

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
      reason: reason || 'carta-auth-or-shape-mismatch',
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

  function buildQuery(query) {
    var parts = [];
    for (var key in (query || {})) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) { continue; }
      var value = query[key];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function activeUrlFromContext(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function portfolioContext(ctx) {
    var raw = activeUrlFromContext(ctx);
    var pathname = '';
    try {
      var parsed = new URL(raw || ORIGIN + '/');
      if (parsed.origin !== ORIGIN) { return null; }
      pathname = parsed.pathname || '';
    } catch (_err) {
      pathname = String(raw || '');
    }
    var match = pathname.match(/\/investors\/individual\/(\d+)\/portfolio\/(?:(\d+)\/)?/);
    if (!match || !match[1]) { return null; }
    return {
      portfolioId: num(match[1]),
      corporationId: match[2] ? num(match[2]) : 0
    };
  }

  function spec(endpoint, query) {
    return {
      url: ORIGIN + endpoint + buildQuery(query || {}),
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function parseData(result) {
    if (!result) { return null; }
    if (result.data !== undefined && result.data !== null) {
      if (typeof result.data === 'string') {
        try { return JSON.parse(result.data); } catch (_err) { return result.data; }
      }
      return result.data;
    }
    if (typeof result.text === 'string' && result.text) {
      try { return JSON.parse(result.text); } catch (_err2) { return result.text; }
    }
    return null;
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  function withData(result, data) {
    return {
      success: true,
      status: result && result.status,
      finalUrl: result && result.finalUrl,
      redirected: result && result.redirected,
      data: data
    };
  }

  async function executeRead(slug, endpoint, query, mapper, ctx) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'carta-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(spec(endpoint, query), ctx.tabId);
    if (resultFailed(result)) { return fallback(slug, 'carta-api-read-failed'); }
    var data = parseData(result);
    if (typeof data === 'string') { return fallback(slug, 'carta-api-non-json-response'); }
    try {
      var mapped = mapper(data);
      if (!mapped) { return fallback(slug, 'carta-api-shape-mismatch'); }
      return withData(result, mapped);
    } catch (_err) {
      return fallback(slug, 'carta-api-shape-mismatch');
    }
  }

  function requirePortfolio(slug, ctx) {
    var p = portfolioContext(ctx);
    if (!p || !p.portfolioId) {
      return { error: fallback(slug, 'carta-portfolio-context-required') };
    }
    return p;
  }

  function mapCompany(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      name: str(raw.name),
      corporation_id: num(raw.corporation_id),
      is_public: bool(raw.is_public),
      is_favourite: bool(raw.is_favourite !== undefined ? raw.is_favourite : raw.is_favorite),
      landing_url: str(raw.landing_url),
      has_logo: bool(raw.has_logo)
    };
  }

  function mapGrant(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      id: num(raw.id),
      label: str(raw.label),
      issue_date: str(raw.issue_date),
      issuable_type: str(raw.issuable_type),
      status: str(raw.status),
      quantity: num(raw.quantity),
      vested: num(raw.vested),
      exercised: num(raw.exercised),
      exercisable: num(raw.exercisable),
      cost_to_exercise: num(raw.cost_to_exercise)
    };
  }

  function mapOption(raw) {
    raw = isObject(raw) ? raw : {};
    var out = {
      id: num(raw.id),
      label: str(raw.label),
      issue_date: str(raw.issue_date),
      issuable_type: str(raw.issuable_type),
      status: str(raw.status),
      currency: str(raw.currency) || '$',
      quantity: num(raw.quantity),
      stock_type: str(raw.stock_type),
      exercised: num(raw.exercised),
      vested: num(raw.vested),
      exercisable: num(raw.exercisable),
      can_exercise: num(raw.can_exercise),
      is_canceled: bool(raw.is_canceled),
      is_expired: bool(raw.is_expired),
      has_vesting: bool(raw.has_vesting),
      time_vested: num(raw.time_vested)
    };
    if (raw.exercise_price !== undefined && raw.exercise_price !== null) {
      out.exercise_price = num(raw.exercise_price);
    }
    return out;
  }

  function mapShare(raw) {
    raw = isObject(raw) ? raw : {};
    var out = {
      id: num(raw.id),
      label: str(raw.label),
      issue_date: str(raw.issue_date),
      issuable_type: str(raw.issuable_type),
      status: str(raw.status),
      currency: str(raw.currency) || '$',
      quantity: num(raw.quantity),
      stock_type: str(raw.stock_type),
      is_canceled: bool(raw.is_canceled)
    };
    if (raw.cost !== undefined && raw.cost !== null) { out.cost = num(raw.cost); }
    if (raw.exercise_type !== undefined && raw.exercise_type !== null) { out.exercise_type = str(raw.exercise_type); }
    if (raw.exercise_from !== undefined && raw.exercise_from !== null) { out.exercise_from = str(raw.exercise_from); }
    if (raw.original_acquisition_date !== undefined && raw.original_acquisition_date !== null) {
      out.original_acquisition_date = str(raw.original_acquisition_date);
    }
    return out;
  }

  function mapRsu(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      id: num(raw.id),
      label: str(raw.label),
      issue_date: str(raw.issue_date),
      issuable_type: str(raw.issuable_type),
      status: str(raw.status),
      currency: str(raw.currency) || '$',
      quantity: num(raw.quantity),
      stock_type: str(raw.stock_type),
      vested: num(raw.vested),
      remaining_shares: num(raw.remaining_shares),
      settled: num(raw.settled),
      has_vesting: bool(raw.has_vesting),
      time_vested: num(raw.time_vested),
      eligible_for_settlement: num(raw.eligible_for_settlement),
      is_canceled: bool(raw.is_canceled)
    };
  }

  function mapInstrument(raw) {
    raw = isObject(raw) ? raw : {};
    return {
      id: num(raw.id),
      label: str(raw.label),
      issue_date: str(raw.issue_date),
      issuable_type: str(raw.issuable_type),
      status: str(raw.status),
      quantity: num(raw.quantity),
      currency: str(raw.currency) || '$'
    };
  }

  function rows(data) {
    return isObject(data) && Array.isArray(data.rows) ? data.rows : null;
  }

  function readHandler(slug, params, build, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var built = build(args || {}, ctx, slug);
        if (built && built.error) { return built.error; }
        return executeRead(slug, built.endpoint, built.query || {}, mapper, ctx);
      }
    };
  }

  function accountSwitcher() {
    return { endpoint: '/api/fe-platform/account-switcher/' };
  }

  function inboxCount() {
    return { endpoint: '/communication-center/v2/count/' };
  }

  function tasks() {
    return { endpoint: '/api/tasks/' };
  }

  function portfolioEndpoint(pathFn) {
    return function(_args, ctx, slug) {
      var p = requirePortfolio(slug, ctx);
      if (p.error) { return p; }
      return { endpoint: pathFn(p) };
    };
  }

  function corporationEndpoint(pathFn) {
    return function(args, ctx, slug) {
      var p = requirePortfolio(slug, ctx);
      if (p.error) { return p; }
      return { endpoint: pathFn(p, args || {}) };
    };
  }

  function pendoConfig(_args, ctx, slug) {
    var p = requirePortfolio(slug, ctx);
    if (p.error) { return p; }
    return {
      endpoint: '/api/fe-platform/pendo-config/',
      query: { url: '/investors/individual/' + p.portfolioId + '/portfolio/' }
    };
  }

  function mapAccounts(data) {
    if (!isObject(data) || !Array.isArray(data.accounts)) { return null; }
    return {
      accounts: data.accounts.map(function(a) {
        a = isObject(a) ? a : {};
        return {
          name: str(a.name),
          id: str(a.id),
          account_type: str(a.accountType),
          is_favorite: bool(a.isFavorite)
        };
      })
    };
  }

  function mapInboxCount(data) {
    if (!isObject(data) || data.value === undefined) { return null; }
    return { unread_count: num(data.value) };
  }

  function mapTasks(data) {
    if (!isObject(data) || !Array.isArray(data.tasks)) { return null; }
    return { result: { count: num(data.count), tasks: data.tasks } };
  }

  function mapUser(data) {
    if (!isObject(data) || !isObject(data.visitor) || !isObject(data.account)) { return null; }
    return {
      user: {
        id: num(data.visitor.id),
        email: str(data.visitor.email),
        name: str(data.visitor.name),
        user_type: str(data.visitor.user_type),
        account_name: str(data.account.name),
        portfolio_id: num(data.account.id)
      }
    };
  }

  function mapEntities(data) {
    if (!Array.isArray(data)) { return null; }
    return {
      entities: data.map(function(e) {
        e = isObject(e) ? e : {};
        return {
          id: num(e.id),
          name: str(e.name),
          has_logo: e.logo_url !== undefined && e.logo_url !== null,
          requires_two_factor: bool(e.requires_two_factor)
        };
      })
    };
  }

  function mapCompanies(data) {
    if (!isObject(data) || !isObject(data.results) || !Array.isArray(data.results.companies)) { return null; }
    return { count: num(data.count), companies: data.results.companies.map(mapCompany) };
  }

  function mapFavourite(data) {
    if (!isObject(data) || data.isFavourite === undefined) { return null; }
    return { is_favourite: bool(data.isFavourite) };
  }

  function mapProfile(data) {
    if (!isObject(data)) { return null; }
    return {
      profile: {
        legal_name: str(data.legal_name),
        date_of_incorporation: data.date_of_incorporation === null ? null : str(data.date_of_incorporation),
        address: data.address === null ? null : str(data.address),
        ceo: data.ceo === null ? null : str(data.ceo),
        website: data.website === null ? null : str(data.website),
        description: data.description === null ? null : str(data.description)
      }
    };
  }

  function mapDashboard(data) {
    if (!isObject(data)) { return null; }
    return {
      dashboard: {
        held_since: data.held_since === null ? null : str(data.held_since),
        cash_cost: data.cash_cost === null || data.cash_cost === undefined ? null : num(data.cash_cost),
        ownership: data.ownership === null ? null : str(data.ownership),
        currency: str(data.currency),
        show_cost_card: bool(data.show_cost_card),
        captable_access_level: str(data.captable_access_level)
      }
    };
  }

  function mapOptions(data) {
    var r = rows(data);
    return r ? { options: r.map(mapOption) } : null;
  }

  function mapShares(data) {
    var r = rows(data);
    return r ? { shares: r.map(mapShare) } : null;
  }

  function mapRsus(data) {
    var r = rows(data);
    return r ? { rsus: r.map(mapRsu) } : null;
  }

  function mapInstruments(name) {
    return function(data) {
      var r = rows(data);
      var out = {};
      if (!r) { return null; }
      out[name] = r.map(mapInstrument);
      return out;
    };
  }

  function mapEquityGrants(data) {
    var r = rows(data);
    if (!r || !isObject(data.totals)) { return null; }
    return {
      grants: r.map(mapGrant),
      totals: {
        quantity: num(data.totals.quantity),
        vested: num(data.totals.vested),
        exercised: num(data.totals.exercised),
        exercisable: num(data.totals.exercisable),
        cost_to_exercise: num(data.totals.cost_to_exercise)
      }
    };
  }

  function mapTaxDocuments(data) {
    if (!isObject(data) || !Array.isArray(data.tax_documents)) { return null; }
    return { result: { documents: data.tax_documents } };
  }

  function mapResults(data) {
    if (!isObject(data) || !Array.isArray(data.results)) { return null; }
    return { results: data.results };
  }

  function mapWitness(data) {
    if (!isObject(data) || !Array.isArray(data.results)) { return null; }
    return {
      results: data.results,
      num_pages: num(data.num_pages),
      page: num(data.page)
    };
  }

  var handlers = {
    'carta.check_favourite': readHandler(
      'carta.check_favourite',
      CORPORATION_ID_PARAMS,
      function(args) { return { endpoint: '/api/favourites/PORTFOLIO_COMPANIES/is-favourite/' + encodeURIComponent(String(args.corporation_id)) + '/' }; },
      mapFavourite
    ),
    'carta.get_company_profile': readHandler(
      'carta.get_company_profile',
      CORPORATION_ID_PARAMS,
      function(args) { return { endpoint: '/api/portfolio/v1/issuers/' + encodeURIComponent(String(args.corporation_id)) + '/profile/' }; },
      mapProfile
    ),
    'carta.get_current_user': readHandler('carta.get_current_user', EMPTY_PARAMS, pendoConfig, mapUser),
    'carta.get_entities': readHandler(
      'carta.get_entities',
      EMPTY_PARAMS,
      portfolioEndpoint(function(p) { return '/api/investors/portfolio/fund/' + p.portfolioId + '/entities/'; }),
      mapEntities
    ),
    'carta.get_holdings_dashboard': readHandler(
      'carta.get_holdings_dashboard',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/holdings-dashboard/';
      }),
      mapDashboard
    ),
    'carta.get_inbox_count': readHandler('carta.get_inbox_count', EMPTY_PARAMS, inboxCount, mapInboxCount),
    'carta.get_qsbs_eligibility': readHandler(
      'carta.get_qsbs_eligibility',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/tax-advisory/v1/qsbs/individual/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/portfolio/' + p.portfolioId +
          '/qsbs-eligible-sold-shares/';
      }),
      mapResults
    ),
    'carta.get_tasks': readHandler('carta.get_tasks', EMPTY_PARAMS, tasks, mapTasks),
    'carta.get_tax_documents': readHandler(
      'carta.get_tax_documents',
      EMPTY_PARAMS,
      portfolioEndpoint(function(p) { return '/api/profiles/tax-form/' + p.portfolioId + '/tax-documents/'; }),
      mapTaxDocuments
    ),
    'carta.get_witness_signatures': readHandler(
      'carta.get_witness_signatures',
      EMPTY_PARAMS,
      portfolioEndpoint(function(p) { return '/common/api/witness-signatures/portfolio/' + p.portfolioId + '/'; }),
      mapWitness
    ),
    'carta.list_accounts': readHandler('carta.list_accounts', EMPTY_PARAMS, accountSwitcher, mapAccounts),
    'carta.list_companies': readHandler(
      'carta.list_companies',
      EMPTY_PARAMS,
      portfolioEndpoint(function(p) { return '/api/investors/portfolio/fund/' + p.portfolioId + '/list/'; }),
      mapCompanies
    ),
    'carta.list_convertibles': readHandler(
      'carta.list_convertibles',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/convertibles/';
      }),
      mapInstruments('convertibles')
    ),
    'carta.list_equity_grants': readHandler(
      'carta.list_equity_grants',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/equity-grants/';
      }),
      mapEquityGrants
    ),
    'carta.list_options': readHandler(
      'carta.list_options',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/options/';
      }),
      mapOptions
    ),
    'carta.list_pius': readHandler(
      'carta.list_pius',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/piu/';
      }),
      mapInstruments('pius')
    ),
    'carta.list_rsus': readHandler(
      'carta.list_rsus',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/rsu/';
      }),
      mapRsus
    ),
    'carta.list_sars': readHandler(
      'carta.list_sars',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/sar/';
      }),
      mapInstruments('sars')
    ),
    'carta.list_shares': readHandler(
      'carta.list_shares',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/shares/';
      }),
      mapShares
    ),
    'carta.list_warrants': readHandler(
      'carta.list_warrants',
      CORPORATION_ID_PARAMS,
      corporationEndpoint(function(p, args) {
        return '/api/investors/holdings/portfolio/' + p.portfolioId + '/corporation/' +
          encodeURIComponent(String(args.corporation_id)) + '/warrants/';
      }),
      mapInstruments('warrants')
    )
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

  global.FsbHandlerCarta = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
