#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDLER_PATH = path.join(REPO_ROOT, 'catalog', 'handlers', 'minimax.js');
const EXT_HANDLER_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'minimax.js');
const FETCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-fetch.js');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-catalog.js');
const INDEX_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'catalog', 'write-activation-evidence.json');

const GUARDED = [
  'minimax.add_mcp_server',
  'minimax.create_cron_job',
  'minimax.delete_chat',
  'minimax.delete_expert',
  'minimax.execute_cron_job',
  'minimax.get_chat_detail',
  'minimax.get_credit_details',
  'minimax.get_cron_job',
  'minimax.get_expert',
  'minimax.get_gallery_detail',
  'minimax.get_membership_info',
  'minimax.get_workspace',
  'minimax.list_chats',
  'minimax.list_cron_executions',
  'minimax.list_cron_jobs',
  'minimax.list_expert_tags',
  'minimax.list_experts',
  'minimax.list_gallery_categories',
  'minimax.list_gallery_feed',
  'minimax.list_homepage_experts',
  'minimax.list_mcp_servers',
  'minimax.list_workspace_members',
  'minimax.new_session',
  'minimax.pin_expert',
  'minimax.remove_mcp_server',
  'minimax.rename_chat',
  'minimax.search_chats',
  'minimax.send_message',
  'minimax.update_cron_job',
  'minimax.vote_expert',
];

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

function freshRequire(filePath) {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function bySlug(rows, slug) {
  return rows.find((row) => row && row.slug === slug) || null;
}

async function testHandler() {
  check(fs.existsSync(HANDLER_PATH), 'catalog/handlers/minimax.js exists');
  check(fs.existsSync(EXT_HANDLER_PATH), 'extension/catalog/handlers/minimax.js exists');

  const handlers = freshRequire(HANDLER_PATH);
  const slugs = ['minimax.get_current_user'].concat(GUARDED);
  check(slugs.every((slug) => handlers[slug] && typeof handlers[slug].handle === 'function'),
    'MiniMax handler exports all 31 descriptor slugs');

  const pageCalls = [];
  const readOut = await handlers['minimax.get_current_user'].handle({}, {
    tabId: 71,
    async executeBoundPageRead(request, tabId) {
      pageCalls.push({ request, tabId });
      return { success: true, status: 200, data: { user: { name: 'Ada' } } };
    },
  });
  check(readOut && readOut.success === true && pageCalls.length === 1
    && pageCalls[0].tabId === 71
    && pageCalls[0].request.origin === 'https://agent.minimax.io'
    && pageCalls[0].request.namespace === 'minimax'
    && pageCalls[0].request.action === 'get_current_user',
    'minimax.get_current_user dispatches a bounded MiniMax page-read request');

  const noPrimitive = await handlers['minimax.get_current_user'].handle({}, {});
  check(noPrimitive && noPrimitive.success === false
    && noPrimitive.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && noPrimitive.reason === 'minimax-page-read-primitive-unavailable',
    'minimax.get_current_user fails closed when page-read primitive is unavailable');

  const guardCalls = [];
  const guardOut = await handlers['minimax.send_message'].handle({ chat_id: 1, text: 'hi' }, {
    async executeBoundSpec() { guardCalls.push('spec'); },
    async executeBoundPageRead() { guardCalls.push('page'); },
  });
  check(guardOut && guardOut.success === false
    && guardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
    && guardOut.errorCode === guardOut.code
    && guardOut.error === guardOut.code
    && guardOut.fellBackToDom === true
    && guardCalls.length === 0,
    'MiniMax guarded writes return byte-stable fallback without calling execution primitives');
}

async function testPageRead() {
  const fetchMod = freshRequire(FETCH_PATH);
  const priorLocation = globalThis.location;
  const priorChunk = globalThis.webpackChunk_N_E;
  try {
    globalThis.location = { origin: 'https://agent.minimax.io' };
    const axios = {
      interceptors: {},
      post() {},
      async get(pathname) {
        return {
          status: 200,
          data: {
            data: {
              userInfo: {
                userID: 'u-1',
                realUserID: '1001',
                name: 'Ada Lovelace',
                email: 'ada@example.test',
                avatarInfo: { large: 'https://cdn.example/avatar.png' },
                description: 'math',
                isLogin: true,
              },
            },
          },
          pathname,
        };
      },
    };
    const req = function () {};
    req.c = { 7: { exports: { default: axios } } };
    const chunk = [];
    chunk.push = function (entry) {
      entry[2](req);
      return Array.prototype.push.call(this, entry);
    };
    globalThis.webpackChunk_N_E = chunk;

    const out = await fetchMod.capabilityPageReadInPage({
      origin: 'https://agent.minimax.io',
      namespace: 'minimax',
      action: 'get_current_user',
      args: {},
    });
    check(out && out.success === true
      && out.data && out.data.user
      && out.data.user.user_id === 'u-1'
      && out.data.user.name === 'Ada Lovelace'
      && out.data.user.is_login === true,
      'MiniMax page-read branch uses the page Axios instance and maps user info');
  } finally {
    if (priorLocation === undefined) delete globalThis.location;
    else globalThis.location = priorLocation;
    if (priorChunk === undefined) delete globalThis.webpackChunk_N_E;
    else globalThis.webpackChunk_N_E = priorChunk;
  }
}

async function testReadiness() {
  delete global.FsbRecipeIndex;
  delete global.FsbCapabilityCatalog;
  const catalog = freshRequire(INDEX_PATH);
  global.FsbRecipeIndex = catalog;
  const Catalog = freshRequire(CATALOG_PATH);
  freshRequire(EXT_HANDLER_PATH);
  if (typeof Catalog.seedHeadHandlers === 'function') Catalog.seedHeadHandlers();

  const readResolved = Catalog.resolve('minimax.get_current_user', 'https://agent.minimax.io');
  const guardedResolved = Catalog.resolve('minimax.send_message', 'https://agent.minimax.io');
  check(readResolved && readResolved.tier === 'T1a'
    && readResolved.handler && typeof readResolved.handler.handle === 'function',
    'resolver upgrades minimax.get_current_user to T1a handler');
  check(guardedResolved && guardedResolved.tier === 'T1a'
    && guardedResolved.descriptor && guardedResolved.descriptor.sideEffectClass === 'write',
    'resolver upgrades guarded MiniMax rows while preserving side-effect class');

  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(catalog);
  const readRow = bySlug(report.rows, 'minimax.get_current_user');
  const guardedRows = GUARDED.map((slug) => bySlug(report.rows, slug));
  check(readRow && readRow.readiness === 't1-ready' && readRow.resolvedTier === 'T1a',
    'readiness marks minimax.get_current_user t1-ready');
  check(guardedRows.every((row) => row && row.readiness === 't1-guarded-fail-closed'),
    'readiness marks all MiniMax POST/mutation rows guarded fail-closed');

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  const evidenceSet = new Set((evidence.guardedWrites || []).map((row) => row.slug));
  check(GUARDED.every((slug) => evidenceSet.has(slug)),
    'write activation evidence includes every MiniMax guarded row');
}

(async function run() {
  console.log('--- MiniMax T1 readiness regression ---');
  await testHandler();
  await testPageRead();
  await testReadiness();
  console.log('\nminimax-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: minimax test threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
