(function (global) {
  'use strict';

  /**
   * YNAB same-origin internal API READ head.
   *
   * YNAB's web app uses first-party app.ynab.com session cookies plus a
   * page-embedded session token. This handler obtains that token only through a
   * bounded same-origin bootstrap read, then uses reviewed read operation names.
   * Budget mutations remain guarded fail-closed until live mutation-body UAT exists.
   */

  var ORIGIN = 'https://app.ynab.com';
  var SERVICE = 'app.ynab.com';
  var CATALOG_URL = ORIGIN + '/api/v1/catalog';
  var API_V2_BASE = ORIGIN + '/api/v2';
  var BUDGET_SCHEMA_VERSION = 41;
  var MAX_ACCOUNTS = 100;
  var MAX_CATEGORIES = 250;
  var MAX_MONTHS = 60;
  var MAX_PAYEES = 250;
  var MAX_TRANSACTIONS = 100;
  var MAX_SUBTRANSACTIONS = 50;
  var MAX_SCHEDULED_TRANSACTIONS = 100;

  var STRING = { type: 'string' };
  var BOOLEAN = { type: 'boolean' };
  var NUMBER = { type: 'number' };
  var EMPTY_PARAMS = schema({}, []);
  var ACCOUNT_ID_PARAMS = schema({ account_id: STRING }, ['account_id']);
  var MONTH_PARAMS = schema({ month: STRING, include_hidden: BOOLEAN }, ['month']);
  var LIST_ACCOUNTS_PARAMS = schema({ include_closed: BOOLEAN }, []);
  var LIST_CATEGORIES_PARAMS = schema({ include_hidden: BOOLEAN }, []);
  var TRANSACTION_ID_PARAMS = schema({ transaction_id: STRING }, ['transaction_id']);
  var LIST_TRANSACTIONS_PARAMS = schema({
    account_id: STRING,
    since_date: STRING,
    until_date: STRING,
    payee_search: STRING
  }, []);

  var CREATE_CATEGORY_PARAMS = schema({ group_id: STRING, name: STRING, goal: { type: 'object' }, note: STRING }, ['group_id', 'name']);
  var CREATE_CATEGORY_GROUP_PARAMS = schema({ name: STRING }, ['name']);
  var CREATE_TRANSACTION_PARAMS = schema({
    account_id: STRING,
    date: STRING,
    amount: NUMBER,
    payee_name: STRING,
    payee_id: STRING,
    category_id: STRING,
    memo: STRING,
    cleared: { type: 'string', enum: ['cleared', 'uncleared', 'reconciled'] },
    approved: BOOLEAN,
    flag_color: { type: 'string', enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] }
  }, ['account_id', 'date', 'amount']);
  var DELETE_CATEGORY_PARAMS = schema({ category_id: STRING }, ['category_id']);
  var DELETE_CATEGORY_GROUP_PARAMS = schema({ group_id: STRING }, ['group_id']);
  var DELETE_TRANSACTION_PARAMS = schema({ transaction_id: STRING, account_id: STRING }, ['transaction_id', 'account_id']);
  var MOVE_CATEGORY_BUDGET_PARAMS = schema({
    month: STRING,
    amount: NUMBER,
    from_category_id: STRING,
    to_category_id: STRING
  }, ['month', 'amount']);
  var SNOOZE_CATEGORY_GOAL_PARAMS = schema({ category_id: STRING, month: STRING, snooze: BOOLEAN }, ['category_id', 'month']);
  var UPDATE_CATEGORY_PARAMS = schema({
    category_id: STRING,
    name: STRING,
    group_id: STRING,
    goal: { type: 'object' },
    hidden: BOOLEAN,
    note: STRING
  }, ['category_id']);
  var UPDATE_CATEGORY_BUDGET_PARAMS = schema({ category_id: STRING, month: STRING, budgeted: NUMBER }, ['category_id', 'month', 'budgeted']);
  var UPDATE_TRANSACTION_PARAMS = schema({
    transaction_id: STRING,
    account_id: STRING,
    date: STRING,
    amount: NUMBER,
    payee_name: STRING,
    payee_id: STRING,
    category_id: STRING,
    memo: STRING,
    cleared: { type: 'string', enum: ['cleared', 'uncleared', 'reconciled'] },
    approved: BOOLEAN,
    flag_color: { type: 'string', enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'none'] }
  }, ['transaction_id', 'account_id']);

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
      reason: reason || 'ynab-auth-or-shape-mismatch',
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

  function bool(value) {
    return value === true;
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatMilliunits(milliunits) {
    return (num(milliunits) / 1000).toFixed(2);
  }

  function notTombstone(value) {
    return !value || value.is_tombstone !== true;
  }

  function activeUrlFromContext(ctx) {
    var fields = ['url', 'currentUrl', 'pageUrl', 'activeUrl', 'tabUrl'];
    for (var i = 0; i < fields.length; i++) {
      var value = ctx && ctx[fields[i]];
      if (typeof value === 'string' && value) { return value; }
    }
    return '';
  }

  function planIdFromUrl(url) {
    var match = String(url || '').match(/app\.ynab\.com\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match && match[1] ? match[1] : '';
  }

  function bootstrapPath(ctx) {
    var activeUrl = activeUrlFromContext(ctx);
    try {
      var parsed = new URL(activeUrl || ORIGIN + '/');
      if (parsed.origin !== ORIGIN) { return '/'; }
      return (parsed.pathname || '/') + (parsed.search || '');
    } catch (e) {
      return '/';
    }
  }

  function deviceIdFor(ctx) {
    var n = Number(ctx && ctx.tabId);
    if (!Number.isFinite(n) || n < 0) { n = 1; }
    var suffix = String(Math.floor(n)).slice(-12).padStart(12, '0');
    return '00000000-0000-4000-8000-' + suffix;
  }

  function buildBootstrapSpec(ctx) {
    return {
      url: ORIGIN + bootstrapPath(ctx),
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function attrValue(tag, attr) {
    var re = new RegExp(attr + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", 'i');
    var match = re.exec(String(tag || ''));
    return match && match[2] ? match[2] : '';
  }

  function sessionTokenFromText(text) {
    var tags = String(text || '').match(/<meta\b[^>]*>/gi) || [];
    for (var i = 0; i < tags.length; i++) {
      if (attrValue(tags[i], 'name') === 'session-token') {
        return attrValue(tags[i], 'content');
      }
    }
    return '';
  }

  function appVersionFromText(text) {
    var m = /YNAB_APP_VERSION["']?\s*[:=]\s*["']([^"']+)["']/.exec(String(text || ''));
    return m && m[1] ? m[1] : '';
  }

  function textFromResult(result) {
    if (!result) { return ''; }
    if (typeof result.text === 'string') { return result.text; }
    if (typeof result.body === 'string') { return result.body; }
    if (typeof result.data === 'string') { return result.data; }
    if (isObject(result.data)) {
      try { return JSON.stringify(result.data); } catch (e) { return ''; }
    }
    return '';
  }

  function resultFailed(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected || status === 401 || status === 403 || status >= 400;
  }

  async function bootstrapAuth(ctx, slug, opts) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'ynab-execute-bound-spec-unavailable');
    }
    var options = opts || {};
    var boot = await ctx.executeBoundSpec(buildBootstrapSpec(ctx), ctx.tabId);
    if (resultFailed(boot)) { return fallback(slug, 'ynab-bootstrap-auth-failed'); }
    var text = textFromResult(boot);
    var sessionToken = sessionTokenFromText(text);
    var planId = planIdFromUrl(activeUrlFromContext(ctx)) || planIdFromUrl(ORIGIN + bootstrapPath(ctx));
    if (!sessionToken || (options.requirePlan !== false && !planId)) {
      return fallback(slug, 'ynab-bootstrap-auth-incomplete');
    }
    return {
      success: true,
      sessionToken: sessionToken,
      planId: planId,
      deviceId: deviceIdFor(ctx),
      appVersion: appVersionFromText(text)
    };
  }

  function headersFor(auth, contentType) {
    var headers = {
      'X-Session-Token': auth.sessionToken,
      'X-YNAB-Device-Id': auth.deviceId,
      'X-YNAB-Device-OS': 'web',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    };
    if (contentType) { headers['Content-Type'] = contentType; }
    if (auth.appVersion) { headers['X-YNAB-Device-App-Version'] = auth.appVersion; }
    return headers;
  }

  function apiGetSpec(endpoint, auth) {
    return {
      url: API_V2_BASE + endpoint,
      method: 'GET',
      headers: headersFor(auth),
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function formBody(operationName, requestData) {
    return 'operation_name=' + encodeURIComponent(operationName) +
      '&request_data=' + encodeURIComponent(JSON.stringify(requestData || {}));
  }

  function catalogSpec(operationName, requestData, auth) {
    return {
      url: CATALOG_URL,
      method: 'POST',
      headers: headersFor(auth, 'application/x-www-form-urlencoded; charset=UTF-8'),
      body: formBody(operationName, requestData || {}),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: '@'
    };
  }

  function syncBudgetSpec(auth) {
    return catalogSpec('syncBudgetData', {
      budget_version_id: auth.planId,
      sync_type: 'delta',
      starting_device_knowledge: 0,
      ending_device_knowledge: 0,
      device_knowledge_of_server: 0,
      calculated_entities_included: false,
      schema_version: BUDGET_SCHEMA_VERSION,
      schema_version_of_knowledge: BUDGET_SCHEMA_VERSION,
      changed_entities: {}
    }, auth);
  }

  function payloadFromResult(result, slug, reason) {
    if (resultFailed(result)) { return fallback(slug, reason + '-request-failed'); }
    var data = result.data;
    if (data === undefined && typeof result.text === 'string') {
      try { data = JSON.parse(result.text); } catch (e) { data = undefined; }
    }
    if (!isObject(data) || data.error || Array.isArray(data.errors)) {
      return fallback(slug, reason + '-shape-mismatch');
    }
    return data;
  }

  function withData(result, data) {
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) { out[key] = result[key]; }
    }
    out.data = data;
    return out;
  }

  async function apiRead(slug, endpoint, mapper, ctx) {
    var auth = await bootstrapAuth(ctx, slug, { requirePlan: false });
    if (!auth || auth.success !== true) { return auth; }
    var result = await ctx.executeBoundSpec(apiGetSpec(endpoint, auth), ctx.tabId);
    var data = payloadFromResult(result, slug, 'ynab-api');
    if (data && data.success === false) { return data; }
    try { return withData(result, mapper(data)); } catch (e) { return fallback(slug, 'ynab-api-map-failed'); }
  }

  async function catalogRead(slug, operationName, requestData, mapper, ctx) {
    var auth = await bootstrapAuth(ctx, slug, { requirePlan: false });
    if (!auth || auth.success !== true) { return auth; }
    var result = await ctx.executeBoundSpec(catalogSpec(operationName, requestData(auth), auth), ctx.tabId);
    var data = payloadFromResult(result, slug, 'ynab-catalog');
    if (data && data.success === false) { return data; }
    try { return withData(result, mapper(data)); } catch (e) { return fallback(slug, 'ynab-catalog-map-failed'); }
  }

  async function budgetRead(slug, mapper, ctx) {
    var auth = await bootstrapAuth(ctx, slug);
    if (!auth || auth.success !== true) { return auth; }
    var result = await ctx.executeBoundSpec(syncBudgetSpec(auth), ctx.tabId);
    var data = payloadFromResult(result, slug, 'ynab-sync-budget');
    if (data && data.success === false) { return data; }
    if (!isObject(data.changed_entities)) { return fallback(slug, 'ynab-sync-budget-entities-missing'); }
    try { return withData(result, mapper(data.changed_entities || {}, auth)); } catch (e) { return fallback(slug, 'ynab-sync-budget-map-failed'); }
  }

  function parseJsonField(value) {
    if (typeof value !== 'string' || !value) { return {}; }
    try { return JSON.parse(value); } catch (e) { return {}; }
  }

  function limitItems(rows, max) {
    return list(rows).slice(0, max);
  }

  function mapUser(u) {
    return {
      id: str(u && u.id),
      first_name: str(u && u.first_name),
      email: str(u && u.email)
    };
  }

  function mapPlan(p) {
    var dateFormat = parseJsonField(p && p.date_format);
    var currencyFormat = parseJsonField(p && p.currency_format);
    return {
      id: str(p && p.id),
      budget_id: str(p && p.budget_id),
      name: str(p && p.budget_name),
      date_format: str(dateFormat.format),
      currency_symbol: str(currencyFormat.currency_symbol || '$'),
      currency_iso_code: str(currencyFormat.iso_code || 'USD')
    };
  }

  function buildAccountCalcMap(entities) {
    var out = {};
    var rows = list(entities && entities.be_account_calculations);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].entities_account_id) { out[rows[i].entities_account_id] = rows[i]; }
    }
    return out;
  }

  function mapAccount(a, calc) {
    var cleared = num(calc && calc.cleared_balance);
    var uncleared = num(calc && calc.uncleared_balance);
    return {
      id: str(a && a.id),
      name: str(a && a.account_name),
      type: str(a && a.account_type),
      on_budget: bool(a && a.on_budget),
      closed: a && a.is_closed === true,
      balance: formatMilliunits(cleared + uncleared),
      balance_milliunits: cleared + uncleared,
      cleared_balance: formatMilliunits(cleared),
      uncleared_balance: formatMilliunits(uncleared),
      note: str(a && a.note)
    };
  }

  function currentMonthKey() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function toMonthKey(month) {
    return String(month || '').substring(0, 7);
  }

  function subcategoryKey(month, categoryId) {
    return month + '/' + categoryId;
  }

  function parseSubcategoryEntityId(entityId) {
    var parts = String(entityId || '').split('/');
    if (parts.length !== 3 || !parts[1] || !parts[2]) { return null; }
    return { month: parts[1], categoryId: parts[2] };
  }

  function buildMonthlyBudgetCalcMap(calcs) {
    var out = {};
    var rows = list(calcs);
    for (var i = 0; i < rows.length; i++) {
      var parts = String(rows[i] && rows[i].entities_monthly_budget_id || '').split('/');
      if (parts.length >= 2 && parts[1]) { out[parts[1]] = rows[i]; }
    }
    return out;
  }

  function buildSubcategoryCalcMap(calcs) {
    var out = {};
    var rows = list(calcs);
    for (var i = 0; i < rows.length; i++) {
      var parsed = parseSubcategoryEntityId(rows[i] && rows[i].entities_monthly_subcategory_budget_id);
      if (parsed) { out[subcategoryKey(parsed.month, parsed.categoryId)] = rows[i]; }
    }
    return out;
  }

  function buildSubcategoryBudgetMap(budgets) {
    var out = {};
    var rows = list(budgets);
    for (var i = 0; i < rows.length; i++) {
      if (!notTombstone(rows[i])) { continue; }
      var parsed = parseSubcategoryEntityId(rows[i] && rows[i].id);
      if (parsed) { out[subcategoryKey(parsed.month, parsed.categoryId)] = rows[i]; }
    }
    return out;
  }

  function mapCategoryGroup(g) {
    return { id: str(g && g.id), name: str(g && g.name), hidden: g && g.is_hidden === true };
  }

  function mapCategory(c) {
    var target = c && c.goal_type === 'MF' ? c.monthly_funding : c && c.goal_target_amount;
    return {
      id: str(c && c.id),
      category_group_id: str(c && c.entities_master_category_id),
      name: str(c && c.name),
      hidden: c && c.is_hidden === true,
      budgeted: formatMilliunits(c && c.budgeted),
      activity: formatMilliunits(c && c.activity),
      balance: formatMilliunits(c && c.balance),
      budgeted_milliunits: num(c && c.budgeted),
      activity_milliunits: num(c && c.activity),
      balance_milliunits: num(c && c.balance),
      goal_type: str(c && c.goal_type),
      goal_target: formatMilliunits(target),
      goal_percentage_complete: num(c && c.goal_percentage_complete)
    };
  }

  function mapCategoryForMonth(c, budgetMap, calcMap, month) {
    var key = subcategoryKey(month, c && c.id || '');
    var budget = budgetMap[key];
    var calc = calcMap[key];
    var merged = {};
    for (var k in c) {
      if (Object.prototype.hasOwnProperty.call(c, k)) { merged[k] = c[k]; }
    }
    merged.budgeted = budget ? budget.budgeted : merged.budgeted;
    merged.activity = num(calc && calc.cash_outflows) + num(calc && calc.credit_outflows);
    merged.balance = calc ? calc.balance : merged.balance;
    merged.goal_percentage_complete = calc ? calc.goal_percentage_complete : merged.goal_percentage_complete;
    return mapCategory(merged);
  }

  function mapPayee(p) {
    return { id: str(p && p.id), name: str(p && p.name), transfer_account_id: str(p && p.entities_account_id) };
  }

  function buildLookups(entities) {
    var out = { payees: {}, accounts: {}, categories: {} };
    var payees = list(entities && entities.be_payees);
    var accounts = list(entities && entities.be_accounts);
    var categories = list(entities && entities.be_subcategories);
    for (var i = 0; i < payees.length; i++) {
      if (notTombstone(payees[i]) && payees[i].id) { out.payees[payees[i].id] = str(payees[i].name); }
    }
    for (var j = 0; j < accounts.length; j++) {
      if (notTombstone(accounts[j]) && accounts[j].id) { out.accounts[accounts[j].id] = str(accounts[j].account_name); }
    }
    for (var k = 0; k < categories.length; k++) {
      if (notTombstone(categories[k]) && categories[k].id) { out.categories[categories[k].id] = str(categories[k].name); }
    }
    return out;
  }

  function mapTransaction(t, lookups) {
    var accountId = str(t && t.entities_account_id);
    var payeeId = str(t && t.entities_payee_id);
    var categoryId = str(t && t.entities_subcategory_id);
    return {
      id: str(t && t.id),
      date: str(t && t.date),
      amount: formatMilliunits(t && t.amount),
      amount_milliunits: num(t && t.amount),
      memo: str(t && t.memo),
      cleared: str(t && t.cleared).toLowerCase() || 'uncleared',
      approved: bool(t && t.accepted),
      flag_color: str(t && t.flag).toLowerCase(),
      account_id: accountId,
      account_name: str(lookups && lookups.accounts[accountId]),
      payee_id: payeeId,
      payee_name: str(lookups && lookups.payees[payeeId]),
      category_id: categoryId,
      category_name: str(lookups && lookups.categories[categoryId]),
      transfer_account_id: str(t && t.transfer_account_id),
      imported_payee: str(t && t.imported_payee),
      original_imported_payee: str(t && t.original_imported_payee),
      imported_date: str(t && t.imported_date),
      ynab_id: str(t && t.ynab_id),
      matched_transaction_id: str(t && t.matched_transaction_id),
      source: str(t && t.source),
      deleted: t && t.is_tombstone === true
    };
  }

  function mapSubtransaction(s, lookups) {
    var payeeId = str(s && s.entities_payee_id);
    var categoryId = str(s && s.entities_subcategory_id);
    return {
      id: str(s && s.id),
      transaction_id: str(s && s.entities_transaction_id),
      amount: formatMilliunits(s && s.amount),
      amount_milliunits: num(s && s.amount),
      memo: str(s && s.memo),
      payee_id: payeeId,
      payee_name: str(lookups && lookups.payees[payeeId]),
      category_id: categoryId,
      category_name: str(lookups && lookups.categories[categoryId]),
      transfer_account_id: str(s && s.transfer_account_id),
      deleted: s && s.is_tombstone === true
    };
  }

  function mapMonth(m, calc) {
    var income = num(calc && calc.immediate_income);
    var budgeted = num(calc && calc.budgeted);
    var activity = num(calc && calc.cash_outflows) + num(calc && calc.credit_outflows);
    var toBeBudgeted = num(calc && calc.available_to_budget);
    return {
      month: str(m && m.month),
      income: formatMilliunits(income),
      budgeted: formatMilliunits(budgeted),
      activity: formatMilliunits(activity),
      to_be_budgeted: formatMilliunits(toBeBudgeted),
      income_milliunits: income,
      budgeted_milliunits: budgeted,
      activity_milliunits: activity,
      to_be_budgeted_milliunits: toBeBudgeted,
      age_of_money: calc && calc.age_of_money !== undefined ? calc.age_of_money : null
    };
  }

  function mapScheduledTransaction(s, lookups) {
    var accountId = str(s && s.entities_account_id);
    var payeeId = str(s && s.entities_payee_id);
    var categoryId = str(s && s.entities_subcategory_id);
    return {
      id: str(s && s.id),
      date_first: str(s && s.date),
      date_next: str(list(s && s.upcoming_instances)[0] || s && s.date),
      frequency: str(s && s.frequency) || 'never',
      amount: formatMilliunits(s && s.amount),
      amount_milliunits: num(s && s.amount),
      memo: str(s && s.memo),
      flag_color: str(s && s.flag).toLowerCase(),
      account_id: accountId,
      account_name: str(lookups && lookups.accounts[accountId]),
      payee_id: payeeId,
      payee_name: str(lookups && lookups.payees[payeeId]),
      category_id: categoryId,
      category_name: str(lookups && lookups.categories[categoryId]),
      deleted: s && s.is_tombstone === true
    };
  }

  function mapInitialPlan(data) {
    if (!isObject(data.budget_version)) { throw new Error('missing plan'); }
    return { plan: mapPlan(data.budget_version) };
  }

  function listAccountsData(entities, args) {
    var calcMap = buildAccountCalcMap(entities);
    var accounts = list(entities.be_accounts).filter(notTombstone).map(function(a) {
      return mapAccount(a, calcMap[a.id]);
    });
    if (!(args && args.include_closed)) {
      accounts = accounts.filter(function(a) { return !a.closed; });
    }
    return { accounts: limitItems(accounts, MAX_ACCOUNTS) };
  }

  function listCategoriesData(entities, args, month) {
    var budgetMap = buildSubcategoryBudgetMap(entities.be_monthly_subcategory_budgets);
    var calcMap = buildSubcategoryCalcMap(entities.be_monthly_subcategory_budget_calculations);
    var groups = list(entities.be_master_categories).filter(notTombstone).map(mapCategoryGroup);
    var categories = list(entities.be_subcategories).filter(notTombstone).map(function(c) {
      return mapCategoryForMonth(c, budgetMap, calcMap, month);
    });
    if (!(args && args.include_hidden)) {
      groups = groups.filter(function(g) { return !g.hidden; });
      categories = categories.filter(function(c) { return !c.hidden; });
    }
    return { groups: limitItems(groups, MAX_CATEGORIES), categories: limitItems(categories, MAX_CATEGORIES) };
  }

  function listMonthsData(entities) {
    var calcMap = buildMonthlyBudgetCalcMap(entities.be_monthly_budget_calculations);
    var months = list(entities.be_monthly_budgets).filter(notTombstone).map(function(m) {
      var key = str(m && m.month).substring(0, 7);
      return mapMonth(m, calcMap[key]);
    }).sort(function(a, b) { return b.month.localeCompare(a.month); });
    return { months: limitItems(months, MAX_MONTHS) };
  }

  function listTransactionsData(entities, args) {
    var lookups = buildLookups(entities);
    var rows = list(entities.be_transactions).filter(notTombstone);
    var a = args || {};
    if (a.account_id) { rows = rows.filter(function(t) { return t.entities_account_id === a.account_id; }); }
    if (a.since_date) { rows = rows.filter(function(t) { return str(t.date) >= a.since_date; }); }
    if (a.until_date) { rows = rows.filter(function(t) { return str(t.date) <= a.until_date; }); }
    if (a.payee_search) {
      var needle = String(a.payee_search).toLowerCase();
      var matchingPayeeIds = {};
      for (var id in lookups.payees) {
        if (Object.prototype.hasOwnProperty.call(lookups.payees, id) && lookups.payees[id].toLowerCase().indexOf(needle) !== -1) {
          matchingPayeeIds[id] = true;
        }
      }
      rows = rows.filter(function(t) {
        return (t.entities_payee_id && matchingPayeeIds[t.entities_payee_id]) ||
          str(t.imported_payee).toLowerCase().indexOf(needle) !== -1 ||
          str(t.original_imported_payee).toLowerCase().indexOf(needle) !== -1;
      });
    }
    var transactions = rows.map(function(t) { return mapTransaction(t, lookups); })
      .sort(function(a, b) { return b.date.localeCompare(a.date); });
    return { transactions: limitItems(transactions, MAX_TRANSACTIONS) };
  }

  function readHandler(slug, params, mapper) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        return mapper(args || {}, ctx);
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

  var handlers = {
    'ynab.get_current_user': readHandler('ynab.get_current_user', EMPTY_PARAMS, function(_args, ctx) {
      return apiRead('ynab.get_current_user', '/user', function(data) { return { user: mapUser(data) }; }, ctx);
    }),
    'ynab.get_plan': readHandler('ynab.get_plan', EMPTY_PARAMS, function(_args, ctx) {
      return catalogRead('ynab.get_plan', 'getInitialUserData', function(auth) {
        return { device_info: { id: auth.deviceId, device_os: 'web' } };
      }, mapInitialPlan, ctx);
    }),
    'ynab.list_accounts': readHandler('ynab.list_accounts', LIST_ACCOUNTS_PARAMS, function(args, ctx) {
      return budgetRead('ynab.list_accounts', function(entities) { return listAccountsData(entities, args); }, ctx);
    }),
    'ynab.get_account': readHandler('ynab.get_account', ACCOUNT_ID_PARAMS, function(args, ctx) {
      return budgetRead('ynab.get_account', function(entities) {
        var calcMap = buildAccountCalcMap(entities);
        var rows = list(entities.be_accounts);
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].id === args.account_id && notTombstone(rows[i])) {
            return { account: mapAccount(rows[i], calcMap[rows[i].id]) };
          }
        }
        throw new Error('account not found');
      }, ctx);
    }),
    'ynab.list_categories': readHandler('ynab.list_categories', LIST_CATEGORIES_PARAMS, function(args, ctx) {
      return budgetRead('ynab.list_categories', function(entities) {
        return listCategoriesData(entities, args, currentMonthKey());
      }, ctx);
    }),
    'ynab.list_months': readHandler('ynab.list_months', EMPTY_PARAMS, function(_args, ctx) {
      return budgetRead('ynab.list_months', listMonthsData, ctx);
    }),
    'ynab.get_month': readHandler('ynab.get_month', MONTH_PARAMS, function(args, ctx) {
      return budgetRead('ynab.get_month', function(entities) {
        var monthKey = toMonthKey(args.month);
        var target = list(entities.be_monthly_budgets).find(function(m) { return toMonthKey(m && m.month) === monthKey && notTombstone(m); });
        if (!target) { throw new Error('month not found'); }
        var calcMap = buildMonthlyBudgetCalcMap(entities.be_monthly_budget_calculations);
        var categories = listCategoriesData(entities, args, monthKey).categories;
        return { month: mapMonth(target, calcMap[monthKey]), categories: categories };
      }, ctx);
    }),
    'ynab.list_payees': readHandler('ynab.list_payees', EMPTY_PARAMS, function(_args, ctx) {
      return budgetRead('ynab.list_payees', function(entities) {
        return { payees: limitItems(list(entities.be_payees).filter(notTombstone).map(mapPayee), MAX_PAYEES) };
      }, ctx);
    }),
    'ynab.list_transactions': readHandler('ynab.list_transactions', LIST_TRANSACTIONS_PARAMS, function(args, ctx) {
      return budgetRead('ynab.list_transactions', function(entities) { return listTransactionsData(entities, args); }, ctx);
    }),
    'ynab.get_transaction': readHandler('ynab.get_transaction', TRANSACTION_ID_PARAMS, function(args, ctx) {
      return budgetRead('ynab.get_transaction', function(entities) {
        var rows = list(entities.be_transactions);
        var tx = rows.find(function(t) { return t.id === args.transaction_id && notTombstone(t); });
        if (!tx) { throw new Error('transaction not found'); }
        var lookups = buildLookups(entities);
        var subtransactions = list(entities.be_subtransactions)
          .filter(function(s) { return s.entities_transaction_id === args.transaction_id && notTombstone(s); })
          .map(function(s) { return mapSubtransaction(s, lookups); });
        return { transaction: mapTransaction(tx, lookups), subtransactions: limitItems(subtransactions, MAX_SUBTRANSACTIONS) };
      }, ctx);
    }),
    'ynab.list_scheduled_transactions': readHandler('ynab.list_scheduled_transactions', EMPTY_PARAMS, function(_args, ctx) {
      return budgetRead('ynab.list_scheduled_transactions', function(entities) {
        var lookups = buildLookups(entities);
        var rows = list(entities.be_scheduled_transactions).filter(notTombstone).map(function(s) {
          return mapScheduledTransaction(s, lookups);
        }).sort(function(a, b) { return a.date_next.localeCompare(b.date_next); });
        return { scheduled_transactions: limitItems(rows, MAX_SCHEDULED_TRANSACTIONS) };
      }, ctx);
    }),

    'ynab.create_category': guarded('ynab.create_category', 'write', CREATE_CATEGORY_PARAMS, 'unverified-ynab-create-category-mutation'),
    'ynab.create_category_group': guarded('ynab.create_category_group', 'write', CREATE_CATEGORY_GROUP_PARAMS, 'unverified-ynab-create-category-group-mutation'),
    'ynab.create_transaction': guarded('ynab.create_transaction', 'write', CREATE_TRANSACTION_PARAMS, 'unverified-ynab-create-transaction-mutation'),
    'ynab.delete_category': guarded('ynab.delete_category', 'destructive', DELETE_CATEGORY_PARAMS, 'unverified-ynab-delete-category-mutation'),
    'ynab.delete_category_group': guarded('ynab.delete_category_group', 'destructive', DELETE_CATEGORY_GROUP_PARAMS, 'unverified-ynab-delete-category-group-mutation'),
    'ynab.delete_transaction': guarded('ynab.delete_transaction', 'destructive', DELETE_TRANSACTION_PARAMS, 'unverified-ynab-delete-transaction-mutation'),
    'ynab.move_category_budget': guarded('ynab.move_category_budget', 'write', MOVE_CATEGORY_BUDGET_PARAMS, 'unverified-ynab-move-category-budget-mutation'),
    'ynab.snooze_category_goal': guarded('ynab.snooze_category_goal', 'write', SNOOZE_CATEGORY_GOAL_PARAMS, 'unverified-ynab-snooze-category-goal-mutation'),
    'ynab.update_category': guarded('ynab.update_category', 'write', UPDATE_CATEGORY_PARAMS, 'unverified-ynab-update-category-mutation'),
    'ynab.update_category_budget': guarded('ynab.update_category_budget', 'write', UPDATE_CATEGORY_BUDGET_PARAMS, 'unverified-ynab-update-category-budget-mutation'),
    'ynab.update_transaction': guarded('ynab.update_transaction', 'write', UPDATE_TRANSACTION_PARAMS, 'unverified-ynab-update-transaction-mutation')
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

  global.FsbHandlerYnab = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
