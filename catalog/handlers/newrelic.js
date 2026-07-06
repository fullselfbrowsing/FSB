(function (global) {
  'use strict';

  /**
   * New Relic same-origin NerdGraph read head.
   *
   * The vendored New Relic plugin uses the first-party one.newrelic.com GraphQL
   * proxy. This handler keeps only reviewed read operations executable through
   * executeBoundSpec. Mutations remain unregistered until live body evidence exists.
   */

  var ORIGIN = 'https://one.newrelic.com';
  var SERVICE = 'one.newrelic.com';
  var GRAPHQL_URL = ORIGIN + '/graphql';
  var MAX_INT = 9007199254740991;

  var STRING = { type: 'string' };
  var NUMBER = { type: 'number' };
  var EMPTY_PARAMS = schema({}, []);
  var GUID_PARAMS = schema({
    guid: stringField('Entity GUID')
  }, ['guid']);
  var ACCOUNT_PARAMS = schema({
    account_id: integerField('Account ID')
  }, ['account_id']);
  var ALERT_POLICY_PARAMS = schema({
    account_id: integerField('Account ID'),
    cursor: stringField('Pagination cursor from a previous response')
  }, ['account_id']);
  var DASHBOARD_LIST_PARAMS = schema({
    cursor: stringField('Pagination cursor from a previous response')
  }, []);
  var SEARCH_ENTITIES_PARAMS = schema({
    query: stringField('Entity search query'),
    cursor: stringField('Pagination cursor from a previous response')
  }, ['query']);
  var LIST_NRQL_CONDITIONS_PARAMS = schema({
    account_id: integerField('Account ID'),
    policy_id: stringField('Filter by alert policy ID'),
    cursor: stringField('Pagination cursor from a previous response')
  }, ['account_id']);
  var NRQL_QUERY_PARAMS = schema({
    account_id: integerField('Account ID to query'),
    query: stringField('NRQL query string'),
    timeout: integerField('Query timeout in seconds')
  }, ['account_id', 'query']);

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
    return { type: 'string', minLength: 1, description: description };
  }

  function integerField(description) {
    return {
      type: 'integer',
      minimum: -MAX_INT,
      maximum: MAX_INT,
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
      reason: reason || 'newrelic-auth-or-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function pathValue(obj, keys) {
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (!isObject(cur) || !hasOwn(cur, keys[i])) { return undefined; }
      cur = cur[keys[i]];
    }
    return cur;
  }

  function objectAt(keys) {
    return function(data) { return isObject(pathValue(data, keys)); };
  }

  function arrayAt(keys) {
    return function(data) { return Array.isArray(pathValue(data, keys)); };
  }

  function optionalArrayAt(keys) {
    return function(data) {
      var value = pathValue(data, keys);
      return value === undefined || Array.isArray(value);
    };
  }

  function graphqlSpec(operationName, query, variables) {
    return {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'newrelic-requesting-services': 'platform|nr1-ui',
        'x-requested-with': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        operationName: operationName,
        query: query,
        variables: variables || {}
      }),
      query: {},
      authStrategy: 'same-origin-cookie',
      origin: ORIGIN,
      extract: 'data'
    };
  }

  function failedHttp(result) {
    var status = Number(result && result.status || 0);
    return !result || result.success !== true || result.redirected ||
      status === 401 || status === 403 || status >= 400;
  }

  function guardGraphqlResult(result, slug, guard) {
    if (!result || result.success !== true) { return result; }
    if (failedHttp(result)) { return fallback(slug, 'newrelic-http-auth-or-rot'); }
    var data = result.data;
    if (!isObject(data)) { return fallback(slug, 'newrelic-graphql-shape-mismatch'); }
    if (Array.isArray(result.errors) || Array.isArray(data.errors)) {
      return fallback(slug, 'newrelic-graphql-errors');
    }
    if (typeof guard === 'function' && !guard(data)) {
      return fallback(slug, 'newrelic-graphql-shape-mismatch');
    }
    return result;
  }

  function variablesFrom(args, map) {
    var out = {};
    var a = args || {};
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        var source = map[key];
        if (a[source] !== undefined) { out[key] = a[source]; }
      }
    }
    return out;
  }

  function readHandler(slug, params, operationName, query, buildVariables, guard) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback(slug, 'newrelic-execute-bound-spec-unavailable');
        }
        var variables = typeof buildVariables === 'function' ? buildVariables(args || {}) : {};
        var res = await ctx.executeBoundSpec(graphqlSpec(operationName, query, variables), ctx.tabId);
        return guardGraphqlResult(res, slug, guard);
      }
    };
  }

  function isReadOnlyNrql(query) {
    var raw = String(query || '').trim();
    if (!raw) { return false; }
    if (raw.indexOf(';') !== -1) { return false; }
    var first = /^[A-Za-z]+/.exec(raw);
    if (!first) { return false; }
    var verb = first[0].toUpperCase();
    if (verb !== 'SELECT' && verb !== 'SHOW') { return false; }
    if (/\b(DELETE|DROP|INSERT|UPDATE|CREATE|ALTER|TRUNCATE)\b/i.test(raw)) {
      return false;
    }
    return true;
  }

  var queries = {
    currentUser: '{ actor { user { email name id } accounts { id name } organization { id name } } }',
    organization: '{ actor { organization { id name } } }',
    accounts: '{ currentUser { accounts { id name } } }',
    searchEntities: 'query SearchEntities($query: String!, $cursor: String) { actor { entitySearch(query: $query) { count results(cursor: $cursor) { entities { guid name type domain entityType alertSeverity reporting permalink tags { key values } } nextCursor } } } }',
    getEntity: 'query GetEntity($guid: EntityGuid!) { actor { entity(guid: $guid) { guid name type domain entityType alertSeverity reporting permalink tags { key values } } } }',
    getDashboard: 'query GetDashboard($guid: EntityGuid!) { actor { entity(guid: $guid) { guid name ... on DashboardEntity { description permissions owner { email } createdAt updatedAt pages { guid name widgets { id title visualization { id } } } } } } }',
    listDashboards: 'query ListDashboards($cursor: String) { actor { entitySearch(query: "domain = \'VIZ\' AND type = \'DASHBOARD\'") { results(cursor: $cursor) { entities { guid name ... on DashboardEntityOutline { permissions owner { email } dashboardParentGuid } tags { key values } } nextCursor } } } }',
    listPolicies: 'query ListPolicies($accountId: Int!, $cursor: String) { actor { account(id: $accountId) { alerts { policiesSearch(cursor: $cursor) { policies { id name incidentPreference } totalCount nextCursor } } } } }',
    listNrqlConditions: 'query ListNrqlConditions($accountId: Int!, $cursor: String, $searchCriteria: AlertsNrqlConditionsSearchCriteriaInput) { actor { account(id: $accountId) { alerts { nrqlConditionsSearch(cursor: $cursor, searchCriteria: $searchCriteria) { nrqlConditions { id name enabled policyId nrql { query } signal { aggregationWindow } } nextCursor } } } } }',
    listEntityTags: 'query ListEntityTags($guid: EntityGuid!) { actor { entity(guid: $guid) { tags { key values } } } }',
    listEventTypes: 'query ListEventTypes($accountId: Int!) { actor { account(id: $accountId) { nrql(query: "SHOW EVENT TYPES") { results } } } }',
    runNrql: 'query RunNrql($accountId: Int!, $query: Nrql!, $timeout: Seconds) { actor { account(id: $accountId) { nrql(query: $query, timeout: $timeout) { results metadata { facets timeWindow { begin end } } } } } }'
  };

  var handlers = {
    'newrelic.get_current_user': readHandler('newrelic.get_current_user', EMPTY_PARAMS,
      'NewRelicCurrentUser', queries.currentUser, null, objectAt(['actor', 'user'])),
    'newrelic.get_organization': readHandler('newrelic.get_organization', EMPTY_PARAMS,
      'NewRelicOrganization', queries.organization, null, objectAt(['actor', 'organization'])),
    'newrelic.list_accounts': readHandler('newrelic.list_accounts', EMPTY_PARAMS,
      'NewRelicListAccounts', queries.accounts, null, arrayAt(['currentUser', 'accounts'])),
    'newrelic.search_entities': readHandler('newrelic.search_entities', SEARCH_ENTITIES_PARAMS,
      'SearchEntities', queries.searchEntities, function(a) {
        return variablesFrom(a, { query: 'query', cursor: 'cursor' });
      }, arrayAt(['actor', 'entitySearch', 'results', 'entities'])),
    'newrelic.get_entity': readHandler('newrelic.get_entity', GUID_PARAMS,
      'GetEntity', queries.getEntity, function(a) {
        return variablesFrom(a, { guid: 'guid' });
      }, objectAt(['actor', 'entity'])),
    'newrelic.get_dashboard': readHandler('newrelic.get_dashboard', GUID_PARAMS,
      'GetDashboard', queries.getDashboard, function(a) {
        return variablesFrom(a, { guid: 'guid' });
      }, objectAt(['actor', 'entity'])),
    'newrelic.list_dashboards': readHandler('newrelic.list_dashboards', DASHBOARD_LIST_PARAMS,
      'ListDashboards', queries.listDashboards, function(a) {
        return variablesFrom(a, { cursor: 'cursor' });
      }, arrayAt(['actor', 'entitySearch', 'results', 'entities'])),
    'newrelic.list_alert_policies': readHandler('newrelic.list_alert_policies', ALERT_POLICY_PARAMS,
      'ListPolicies', queries.listPolicies, function(a) {
        return variablesFrom(a, { accountId: 'account_id', cursor: 'cursor' });
      }, arrayAt(['actor', 'account', 'alerts', 'policiesSearch', 'policies'])),
    'newrelic.list_nrql_conditions': readHandler('newrelic.list_nrql_conditions', LIST_NRQL_CONDITIONS_PARAMS,
      'ListNrqlConditions', queries.listNrqlConditions, function(a) {
        var criteria = {};
        if (a && a.policy_id) { criteria.policyId = a.policy_id; }
        var out = variablesFrom(a, { accountId: 'account_id', cursor: 'cursor' });
        if (Object.keys(criteria).length) { out.searchCriteria = criteria; }
        return out;
      }, arrayAt(['actor', 'account', 'alerts', 'nrqlConditionsSearch', 'nrqlConditions'])),
    'newrelic.list_entity_tags': readHandler('newrelic.list_entity_tags', GUID_PARAMS,
      'ListEntityTags', queries.listEntityTags, function(a) {
        return variablesFrom(a, { guid: 'guid' });
      }, optionalArrayAt(['actor', 'entity', 'tags'])),
    'newrelic.list_event_types': readHandler('newrelic.list_event_types', ACCOUNT_PARAMS,
      'ListEventTypes', queries.listEventTypes, function(a) {
        return variablesFrom(a, { accountId: 'account_id' });
      }, arrayAt(['actor', 'account', 'nrql', 'results'])),
    'newrelic.run_nrql_query': {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: NRQL_QUERY_PARAMS,
      async handle(args, ctx) {
        var a = args || {};
        if (!isReadOnlyNrql(a.query)) {
          return fallback('newrelic.run_nrql_query', 'newrelic-read-only-nrql-required');
        }
        if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
          return fallback('newrelic.run_nrql_query', 'newrelic-execute-bound-spec-unavailable');
        }
        var res = await ctx.executeBoundSpec(graphqlSpec('RunNrql', queries.runNrql, variablesFrom(a, {
          accountId: 'account_id',
          query: 'query',
          timeout: 'timeout'
        })), ctx.tabId);
        return guardGraphqlResult(res, 'newrelic.run_nrql_query',
          arrayAt(['actor', 'account', 'nrql', 'results']));
      }
    }
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

  global.FsbHandlerNewrelic = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
