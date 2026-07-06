#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_HANDLER = path.join(ROOT, 'catalog', 'handlers', 'azure.js');
const EXTENSION_HANDLER = path.join(ROOT, 'extension', 'catalog', 'handlers', 'azure.js');

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

(async function run() {
  console.log('--- Azure T1 handler proof ---');

  check(fs.existsSync(CATALOG_HANDLER), 'catalog/handlers/azure.js exists');
  check(fs.existsSync(EXTENSION_HANDLER), 'extension/catalog/handlers/azure.js exists');

  const catalogSource = fs.existsSync(CATALOG_HANDLER) ? fs.readFileSync(CATALOG_HANDLER, 'utf8') : '';
  const extensionSource = fs.existsSync(EXTENSION_HANDLER) ? fs.readFileSync(EXTENSION_HANDLER, 'utf8') : '';
  check(catalogSource === extensionSource, 'extension Azure handler mirrors catalog handler');
  check(!/\bfetch\s*\(|\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(|chrome\.(?:scripting|tabs|cookies|webRequest)|document\.cookie|localStorage\.getItem|sessionStorage\.getItem|Authorization|Bearer/.test(catalogSource),
    'Azure handler has no direct network or credential APIs');

  delete require.cache[CATALOG_HANDLER];
  const handlers = require(CATALOG_HANDLER);
  const readSlugs = [
    'azure.get_current_user',
    'azure.get_deployment',
    'azure.get_policy_assignment',
    'azure.get_resource',
    'azure.get_resource_group',
    'azure.get_subscription',
    'azure.list_activity_logs',
    'azure.list_deployments',
    'azure.list_locations',
    'azure.list_locks',
    'azure.list_policy_assignments',
    'azure.list_resource_groups',
    'azure.list_resource_providers',
    'azure.list_resources',
    'azure.list_role_assignments',
    'azure.list_subscription_locations',
    'azure.list_subscriptions',
    'azure.list_tags',
    'azure.list_tenants'
  ];
  const guardedSlugs = [
    'azure.create_deployment',
    'azure.create_lock',
    'azure.create_resource_group',
    'azure.delete_deployment',
    'azure.delete_lock',
    'azure.delete_resource',
    'azure.delete_resource_group'
  ];

  check(readSlugs.every(function(slug) {
    return handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://portal.azure.com'
      && handlers[slug].sideEffectClass === 'read'
      && typeof handlers[slug].handle === 'function';
  }), 'Azure read slugs are T1a read handlers pinned to portal.azure.com');
  check(guardedSlugs.every(function(slug) {
    return handlers[slug]
      && handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://portal.azure.com'
      && handlers[slug].sideEffectClass !== 'read'
      && typeof handlers[slug].handle === 'function';
  }), 'Azure mutation slugs are T1a guarded non-read handlers');

  const pageCalls = [];
  const readResult = await handlers['azure.list_subscriptions'].handle({ top: 1 }, {
    tabId: 17,
    executeBoundPageRead: async function(request, tabId) {
      pageCalls.push({ request: request, tabId: tabId });
      return { success: true, status: 200, data: { subscriptions: [] } };
    }
  });
  check(readResult && readResult.success === true, 'Azure read delegates to page-read primitive');
  check(pageCalls.length === 1
    && pageCalls[0].tabId === 17
    && pageCalls[0].request.origin === 'https://portal.azure.com'
    && pageCalls[0].request.namespace === 'azure'
    && pageCalls[0].request.action === 'list_subscriptions'
    && pageCalls[0].request.args.top === 1,
    'Azure read request carries origin, namespace, action, args, and tab id');

  const missingPrimitive = await handlers['azure.list_tenants'].handle({}, {});
  check(missingPrimitive && missingPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && missingPrimitive.reason === 'azure-page-read-primitive-unavailable'
    && missingPrimitive.fellBackToDom === true,
    'Azure read fails closed when page-read primitive is unavailable');

  let executionCalls = 0;
  const guardedResult = await handlers['azure.delete_resource_group'].handle({}, {
    executeBoundSpec: function() { executionCalls++; },
    executeBoundPageRead: function() { executionCalls++; }
  });
  check(guardedResult && guardedResult.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && guardedResult.fellBackToDom === true
    && executionCalls === 0,
    'Azure guarded mutation fails closed and calls no execution primitive');

  console.log('\nazure-head-handler: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(error) {
  console.error('  FAIL: Azure handler test threw:', error && error.stack ? error.stack : error);
  process.exit(1);
});
