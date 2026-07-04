#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOG_HANDLER = path.join(REPO_ROOT, 'catalog', 'handlers', 'teams.js');
const EXT_HANDLER = path.join(REPO_ROOT, 'extension', 'catalog', 'handlers', 'teams.js');
const FETCH_PATH = path.join(REPO_ROOT, 'extension', 'utils', 'capability-fetch.js');
const CATALOG_PATH = path.join(REPO_ROOT, 'extension', 'catalog', 'recipe-index.generated.js');
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'report-t1-readiness.mjs');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'catalog', 'write-activation-evidence.json');

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

function installLocalStorage(items) {
  const keys = Object.keys(items);
  globalThis.localStorage = {
    get length() { return keys.length; },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null;
    },
    key(index) {
      return keys[index] || null;
    },
  };
}

(async function run() {
  console.log('--- Microsoft Teams T1 readiness regression ---');

  check(fs.existsSync(CATALOG_HANDLER), 'catalog/handlers/teams.js exists');
  check(fs.existsSync(EXT_HANDLER), 'extension/catalog/handlers/teams.js exists');
  check(fs.existsSync(CATALOG_HANDLER) && fs.existsSync(EXT_HANDLER)
    && fs.readFileSync(CATALOG_HANDLER, 'utf8') === fs.readFileSync(EXT_HANDLER, 'utf8'),
    'extension Teams handler mirrors catalog handler');

  const src = fs.existsSync(CATALOG_HANDLER) ? fs.readFileSync(CATALOG_HANDLER, 'utf8') : '';
  check(!/chrome\.(?:scripting|tabs|cookies|webRequest)|\bfetch\s*\(|\bXMLHttpRequest\s*\(|document\.cookie|localStorage|sessionStorage/.test(src),
    'teams handler has no direct network, browser credential, or storage APIs');

  const handlers = freshRequire(CATALOG_HANDLER);
  const readSlugs = [
    'teams.get_conversation_details',
    'teams.get_current_user',
    'teams.list_conversations',
    'teams.read_messages',
  ];
  const guardedSlugs = [
    'teams.create_chat',
    'teams.delete_message',
    'teams.edit_message',
    'teams.invite_to_channel',
    'teams.remove_member',
    'teams.send_message',
    'teams.set_channel_topic',
  ];
  check(readSlugs.concat(guardedSlugs).every((slug) => handlers[slug] && typeof handlers[slug].handle === 'function'),
    'Teams handler exports all descriptor slugs');
  check(readSlugs.every((slug) => handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://teams.live.com'
      && handlers[slug].sideEffectClass === 'read'),
    'Teams reads are T1a reads pinned to teams.live.com');
  check(guardedSlugs.every((slug) => handlers[slug].tier === 'T1a'
      && handlers[slug].origin === 'https://teams.live.com'
      && handlers[slug].sideEffectClass !== 'read'),
    'Teams mutations are registered as guarded non-read T1a handlers');

  const pageCalls = [];
  const specCalls = [];
  const ctx = {
    tabId: 77,
    async executeBoundPageRead(request, tabId) {
      pageCalls.push({ request, tabId });
      return { success: true, status: 200, data: { graph_tokens: ['teams-token-TEST-SYNTHETIC'] } };
    },
    async executeBoundSpec(spec, tabId) {
      specCalls.push({ spec, tabId });
      if (spec.url.indexOf('/me/chats') !== -1) {
        return { success: true, status: 200, data: { value: [{
          id: 'chat-1',
          topic: 'Planning',
          chatType: 'group',
          createdDateTime: '2026-07-01T12:00:00Z',
          lastUpdatedDateTime: '2026-07-01T12:05:00Z',
          webUrl: 'https://teams.live.com/l/chat-1',
        }] } };
      }
      if (spec.url.indexOf('/messages') !== -1) {
        return { success: true, status: 200, data: { value: [{
          id: 'message-1',
          createdDateTime: '2026-07-01T12:01:00Z',
          from: { user: { id: 'user-1', displayName: 'Ada' } },
          body: { contentType: 'html', content: '<p>Hello</p>' },
        }] } };
      }
      return { success: true, status: 200, data: {
        id: 'user-1',
        displayName: 'Ada Lovelace',
        mail: 'ada@example.invalid',
        userPrincipalName: 'ada@example.invalid',
      } };
    },
  };

  const listOut = await handlers['teams.list_conversations'].handle({ page_size: 5 }, ctx);
  check(listOut && listOut.success === true
      && pageCalls.length === 1
      && specCalls.length === 1
      && pageCalls[0].request.namespace === 'teams'
      && pageCalls[0].request.action === 'auth_context'
      && specCalls[0].spec.url === 'https://graph.microsoft.com/v1.0/me/chats?%24top=5'
      && specCalls[0].spec.origin === 'https://teams.live.com'
      && specCalls[0].spec.authStrategy === 'none'
      && listOut.data.conversations[0].id === 'chat-1',
    'teams.list_conversations obtains page auth context then dispatches one GET-only Graph spec');

  pageCalls.length = 0;
  specCalls.length = 0;
  const msgOut = await handlers['teams.read_messages'].handle({ conversation_id: 'chat-1', page_size: 10 }, ctx);
  check(msgOut && msgOut.success === true
      && specCalls[0].spec.url === 'https://graph.microsoft.com/v1.0/chats/chat-1/messages?%24top=10'
      && msgOut.data.messages[0].id === 'message-1',
    'teams.read_messages targets the expected Graph chat messages endpoint');

  const guardCalls = [];
  const guardOut = await handlers['teams.send_message'].handle({ conversation_id: 'chat-1', text: 'hello' }, {
    async executeBoundSpec() { guardCalls.push('spec'); },
    async executeBoundPageRead() { guardCalls.push('page'); },
  });
  check(guardOut && guardOut.success === false
      && guardOut.code === 'RECIPE_DOM_FALLBACK_PENDING'
      && guardOut.errorCode === guardOut.code
      && guardOut.error === guardOut.code
      && guardOut.fellBackToDom === true
      && guardCalls.length === 0,
    'Teams guarded writes return byte-stable fallback without calling execution primitives');

  const fetchMod = freshRequire(FETCH_PATH);
  const priorLocation = globalThis.location;
  const priorLocalStorage = globalThis.localStorage;
  try {
    globalThis.location = { origin: 'https://teams.live.com' };
    const clientId = '9199bf20-a13f-4107-85dc-02114787ef48';
    const tokenKey = 'msal.3.accesstoken.synthetic';
    installLocalStorage({
      ['msal.3.token.keys.' + clientId]: JSON.stringify({ accessToken: [tokenKey] }),
      [tokenKey]: JSON.stringify({
        secret: 'teams-page-read-token-synthetic',
        target: 'https://graph.microsoft.com/.default openid profile',
        expiresOn: String(Math.floor(Date.now() / 1000) + 3600),
      }),
    });
    const pageOut = await fetchMod.capabilityPageReadInPage({
      origin: 'https://teams.live.com',
      namespace: 'teams',
      action: 'auth_context',
      args: {},
    });
    check(pageOut && pageOut.success === true
        && Array.isArray(pageOut.data.graph_tokens)
        && pageOut.data.graph_tokens[0] === 'teams-page-read-token-synthetic',
      'Teams page-read branch extracts Graph token candidates only inside the page realm');
  } finally {
    if (priorLocation === undefined) delete globalThis.location;
    else globalThis.location = priorLocation;
    if (priorLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorLocalStorage;
  }

  delete global.FsbRecipeIndex;
  delete global.FsbCapabilityCatalog;
  const catalog = freshRequire(CATALOG_PATH);
  const reportMod = await import(pathToFileURL(REPORT_PATH).href);
  const report = reportMod.reportReadiness(catalog);
  check(readSlugs.every((slug) => {
    const row = bySlug(report.rows, slug);
    return row && row.readiness === 't1-ready' && row.resolvedTier === 'T1a' && row.proof === 'handler';
  }), 'readiness marks Teams read rows t1-ready');
  check(guardedSlugs.every((slug) => {
    const row = bySlug(report.rows, slug);
    return row && row.readiness === 't1-guarded-fail-closed' && row.resolvedTier === 'T1a';
  }), 'readiness marks Teams mutation rows guarded fail-closed');

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  const evidenceSet = new Set((evidence.guardedWrites || []).map((row) => row.slug));
  check(guardedSlugs.every((slug) => evidenceSet.has(slug)),
    'write activation evidence includes every guarded Teams row');

  console.log('\nteams-t1-ready: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL (teams-t1-ready):', err && err.stack ? err.stack : err);
  process.exit(1);
});
