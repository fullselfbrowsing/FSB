(function (global) {
  'use strict';

  /**
   * Azure Portal ARM read head.
   *
   * Azure Portal stores the ARM bearer token in first-party MSAL session state.
   * The handler keeps that material inside the bounded MAIN-world page-read
   * primitive. Read slugs dispatch reviewed GET actions only; all ARM mutations
   * stay guarded fail-closed until live mutation-body UAT records activation
   * evidence.
   */

  var ORIGIN = 'https://portal.azure.com';
  var SERVICE = 'portal.azure.com';
  var INT_LIMIT = 9007199254740991;

  var STRING = { type: 'string' };
  var SUBSCRIPTION_ID = { type: 'string', description: 'Subscription ID (GUID)' };
  var RESOURCE_GROUP_NAME = { type: 'string', description: 'Resource group name' };
  var EMPTY_PARAMS = schema({}, []);
  var SUBSCRIPTION_PARAMS = schema({ subscription_id: SUBSCRIPTION_ID }, ['subscription_id']);
  var RESOURCE_GROUP_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME
  }, ['subscription_id', 'resource_group_name']);
  var RESOURCE_ID_PARAMS = schema({
    resource_id: { type: 'string', description: 'Full Azure resource ID' },
    api_version: { type: 'string', description: 'API version for the resource provider' }
  }, ['resource_id']);
  var DEPLOYMENT_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME,
    deployment_name: { type: 'string', description: 'Deployment name' }
  }, ['subscription_id', 'resource_group_name', 'deployment_name']);
  var POLICY_ASSIGNMENT_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    policy_assignment_name: { type: 'string', description: 'Policy assignment name' }
  }, ['subscription_id', 'policy_assignment_name']);
  var FILTER_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    filter: { type: 'string', description: 'OData filter expression' }
  }, ['subscription_id']);
  var ACTIVITY_LOG_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    filter: { type: 'string', description: 'OData filter expression' },
    select: { type: 'string', description: 'Comma-separated list of fields to return' }
  }, ['subscription_id', 'filter']);
  var LIST_DEPLOYMENTS_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME,
    filter: { type: 'string', description: 'OData filter expression' },
    top: integerSchema('Maximum number of results to return', 1, INT_LIMIT)
  }, ['subscription_id', 'resource_group_name']);
  var LIST_RESOURCE_GROUPS_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    filter: { type: 'string', description: 'OData filter expression' },
    top: integerSchema('Maximum number of results to return', 1, INT_LIMIT)
  }, ['subscription_id']);
  var LIST_RESOURCE_PROVIDERS_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    top: integerSchema('Maximum number of results to return', 1, INT_LIMIT)
  }, ['subscription_id']);
  var LIST_RESOURCES_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: { type: 'string', description: 'Optional resource group scope' },
    filter: { type: 'string', description: 'OData filter expression' },
    top: integerSchema('Maximum number of results to return', 1, INT_LIMIT)
  }, ['subscription_id']);
  var LIST_LOCKS_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: { type: 'string', description: 'Optional resource group scope' }
  }, ['subscription_id']);
  var CREATE_RESOURCE_GROUP_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME,
    location: { type: 'string', description: 'Azure region' },
    tags: {
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: { type: 'string' },
      description: 'Resource group tags'
    }
  }, ['subscription_id', 'resource_group_name', 'location']);
  var CREATE_DEPLOYMENT_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME,
    deployment_name: { type: 'string', description: 'Deployment name' },
    template: objectAny('ARM template JSON object'),
    parameters: objectAny('Template parameters'),
    mode: { type: 'string', enum: ['Incremental', 'Complete'], description: 'Deployment mode' }
  }, ['subscription_id', 'resource_group_name', 'deployment_name', 'template']);
  var LOCK_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME,
    lock_name: { type: 'string', description: 'Lock name' },
    level: { type: 'string', enum: ['CanNotDelete', 'ReadOnly'], description: 'Lock level' },
    notes: { type: 'string', description: 'Notes about the lock' }
  }, ['subscription_id', 'resource_group_name', 'lock_name', 'level']);
  var DELETE_RESOURCE_GROUP_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: { type: 'string', description: 'Resource group name to delete' }
  }, ['subscription_id', 'resource_group_name']);
  var DELETE_LOCK_PARAMS = schema({
    subscription_id: SUBSCRIPTION_ID,
    resource_group_name: RESOURCE_GROUP_NAME,
    lock_name: { type: 'string', description: 'Lock name to delete' }
  }, ['subscription_id', 'resource_group_name', 'lock_name']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min,
      maximum: max,
      description: description
    };
  }

  function objectAny(description) {
    return {
      type: 'object',
      propertyNames: { type: 'string' },
      additionalProperties: {},
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
      reason: reason,
      fellBackToDom: true
    });
  }

  function readHandler(slug, params, action) {
    return {
      tier: 'T1a',
      origin: ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        if (!ctx || typeof ctx.executeBoundPageRead !== 'function') {
          return fallback(slug, 'azure-page-read-primitive-unavailable');
        }
        return ctx.executeBoundPageRead({
          origin: ORIGIN,
          namespace: 'azure',
          action: action,
          args: args || {}
        }, ctx.tabId);
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
    'azure.get_current_user': readHandler('azure.get_current_user', EMPTY_PARAMS, 'get_current_user'),
    'azure.get_deployment': readHandler('azure.get_deployment', DEPLOYMENT_PARAMS, 'get_deployment'),
    'azure.get_policy_assignment': readHandler('azure.get_policy_assignment', POLICY_ASSIGNMENT_PARAMS, 'get_policy_assignment'),
    'azure.get_resource': readHandler('azure.get_resource', RESOURCE_ID_PARAMS, 'get_resource'),
    'azure.get_resource_group': readHandler('azure.get_resource_group', RESOURCE_GROUP_PARAMS, 'get_resource_group'),
    'azure.get_subscription': readHandler('azure.get_subscription', SUBSCRIPTION_PARAMS, 'get_subscription'),
    'azure.list_activity_logs': readHandler('azure.list_activity_logs', ACTIVITY_LOG_PARAMS, 'list_activity_logs'),
    'azure.list_deployments': readHandler('azure.list_deployments', LIST_DEPLOYMENTS_PARAMS, 'list_deployments'),
    'azure.list_locations': readHandler('azure.list_locations', EMPTY_PARAMS, 'list_locations'),
    'azure.list_locks': readHandler('azure.list_locks', LIST_LOCKS_PARAMS, 'list_locks'),
    'azure.list_policy_assignments': readHandler('azure.list_policy_assignments', FILTER_PARAMS, 'list_policy_assignments'),
    'azure.list_resource_groups': readHandler('azure.list_resource_groups', LIST_RESOURCE_GROUPS_PARAMS, 'list_resource_groups'),
    'azure.list_resource_providers': readHandler('azure.list_resource_providers', LIST_RESOURCE_PROVIDERS_PARAMS, 'list_resource_providers'),
    'azure.list_resources': readHandler('azure.list_resources', LIST_RESOURCES_PARAMS, 'list_resources'),
    'azure.list_role_assignments': readHandler('azure.list_role_assignments', FILTER_PARAMS, 'list_role_assignments'),
    'azure.list_subscription_locations': readHandler('azure.list_subscription_locations', SUBSCRIPTION_PARAMS, 'list_subscription_locations'),
    'azure.list_subscriptions': readHandler('azure.list_subscriptions', EMPTY_PARAMS, 'list_subscriptions'),
    'azure.list_tags': readHandler('azure.list_tags', SUBSCRIPTION_PARAMS, 'list_tags'),
    'azure.list_tenants': readHandler('azure.list_tenants', EMPTY_PARAMS, 'list_tenants'),

    'azure.create_deployment': guarded('azure.create_deployment', 'write', CREATE_DEPLOYMENT_PARAMS, 'unverified-azure-create-deployment-mutation'),
    'azure.create_lock': guarded('azure.create_lock', 'write', LOCK_PARAMS, 'unverified-azure-create-lock-mutation'),
    'azure.create_resource_group': guarded('azure.create_resource_group', 'write', CREATE_RESOURCE_GROUP_PARAMS, 'unverified-azure-create-resource-group-mutation'),
    'azure.delete_deployment': guarded('azure.delete_deployment', 'destructive', DEPLOYMENT_PARAMS, 'unverified-azure-delete-deployment-mutation'),
    'azure.delete_lock': guarded('azure.delete_lock', 'destructive', DELETE_LOCK_PARAMS, 'unverified-azure-delete-lock-mutation'),
    'azure.delete_resource': guarded('azure.delete_resource', 'destructive', RESOURCE_ID_PARAMS, 'unverified-azure-delete-resource-mutation'),
    'azure.delete_resource_group': guarded('azure.delete_resource_group', 'destructive', DELETE_RESOURCE_GROUP_PARAMS, 'unverified-azure-delete-resource-group-mutation')
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

  global.FsbHandlerAzure = handlers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
