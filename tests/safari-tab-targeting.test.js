/**
 * Which tab the dashboard relay acts on, on Safari.
 *
 * Safari has no side panel, so the FSB workspace opens as its own window and
 * its page has a safari-web-extension:// URL. Two things keep the relay off
 * that page:
 *   - every restricted-URL check knows the safari-web-extension: scheme, so
 *     the workspace is never streamed or driven;
 *   - the relay asks FsbPlatform.resolveTargetTab() for the last real content
 *     tab first, because "the active tab of the last focused window" is often
 *     the workspace window itself.
 *
 * ws-client.js runs in a vm with a fake chrome.tabs; background.js and
 * mcp-tool-dispatcher.js contribute their restricted-URL helpers verbatim.
 *
 * Run: node tests/safari-tab-targeting.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const WS_SRC = fs.readFileSync(path.join(ROOT, 'extension', 'ws', 'ws-client.js'), 'utf8');
const BG_SRC = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
const DISPATCH_SRC = fs.readFileSync(path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js'), 'utf8');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  passAssert(ok, msg + (ok ? '' : ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'));
}

const WORKSPACE_URL = 'safari-web-extension://3F2A9C1E-0000-4000-8000-ABCDEF012345/ui/sidepanel.html';
const DASHBOARD_URL = 'https://full-selfbrowsing.com/dashboard';

function tabMatchesQuery(tab, query) {
  if (typeof query.active === 'boolean' && tab.active !== query.active) return false;
  if (query.lastFocusedWindow === true && tab.lastFocusedWindow !== true) return false;
  if (query.currentWindow === true && tab.currentWindow !== true) return false;
  return true;
}

function safariPlatform(resolveTargetTab) {
  return { id: 'safari', caps: { cdp: false, trustedInput: false, sidePanel: false }, resolveTargetTab };
}

function createHarness(tabs, platform) {
  const updates = [];
  const sent = [];
  const context = {
    console: { log() {}, warn() {}, error() {} },
    URL, Set, Date, Promise, Math, JSON, Object, Array, Number, String, Error,
    setTimeout, clearTimeout,
    WebSocket: function WebSocket() {},
    chrome: {
      runtime: { lastError: null, sendMessage() {} },
      tabs: {
        async get(tabId) {
          const found = tabs.find((tab) => tab.id === tabId);
          if (!found) throw new Error('No tab with id ' + tabId);
          return Object.assign({}, found);
        },
        query(query, callback) {
          const result = tabs.filter((tab) => tabMatchesQuery(tab, query || {})).map((tab) => Object.assign({}, tab));
          if (typeof callback === 'function') { callback(result); return undefined; }
          return Promise.resolve(result);
        },
        update(tabId, props, callback) {
          updates.push({ tabId, url: props.url });
          if (typeof callback === 'function') callback({ id: tabId, url: props.url });
        }
      }
    }
  };
  if (platform) context.FsbPlatform = platform;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(WS_SRC + `
globalThis.__t = {
  Client: FSBWebSocket,
  navigate: handleRemoteNavigate,
  isStreamableUrl: _isStreamableTabUrl
};
`, context);
  context.__fsbWsInstance = { send(type, payload) { sent.push({ type, payload }); } };
  return { t: context.__t, client: new context.__t.Client(), updates, sent };
}

// The workspace window is focused; two real pages sit in other windows.
function workspaceFocusedTabs() {
  return [
    { id: 1, url: WORKSPACE_URL, active: true, lastFocusedWindow: true, lastAccessed: 900 },
    { id: 7, url: 'https://a.example/', active: true, lastFocusedWindow: false, lastAccessed: 100 },
    { id: 8, url: 'https://b.example/', active: true, lastFocusedWindow: false, lastAccessed: 500 },
    { id: 9, url: DASHBOARD_URL, active: false, lastFocusedWindow: false, lastAccessed: 800 }
  ];
}

(async function run() {
  console.log('\n=== 1. the workspace page is restricted everywhere ===');
  {
    const { t } = createHarness([], null);
    passAssertEqual(t.isStreamableUrl(WORKSPACE_URL), false, 'ws-client will not stream a safari-web-extension page');
    passAssertEqual(t.isStreamableUrl('https://a.example/'), true, 'a normal page is still streamable');

    const bgStart = BG_SRC.indexOf('function isRestrictedURL(url) {');
    const bgEnd = BG_SRC.indexOf('// Content script health monitoring', bgStart);
    const bg = new Function(BG_SRC.slice(bgStart, bgEnd) + '\nreturn { isRestrictedURL, getPageTypeDescription };')();
    passAssertEqual(bg.isRestrictedURL(WORKSPACE_URL), true, 'background isRestrictedURL');
    passAssertEqual(bg.getPageTypeDescription(WORKSPACE_URL), 'Safari extension page', 'background describes it');
    passAssertEqual(bg.isRestrictedURL('https://a.example/'), false, 'background leaves normal pages alone');

    const dStart = DISPATCH_SRC.indexOf('function isRestrictedMcpUrl(url) {');
    const dEnd = DISPATCH_SRC.indexOf('function getDomainFromUrl(', dStart);
    const mcp = new Function(DISPATCH_SRC.slice(dStart, dEnd) + '\nreturn { isRestrictedMcpUrl, getPageTypeDescriptionForMcp };')();
    passAssertEqual(mcp.isRestrictedMcpUrl(WORKSPACE_URL), true, 'MCP dispatcher isRestrictedMcpUrl');
    passAssertEqual(mcp.getPageTypeDescriptionForMcp(WORKSPACE_URL), 'Safari extension page', 'MCP dispatcher describes it');
  }

  console.log('\n=== 2. stream candidate ===');
  {
    const { client } = createHarness(workspaceFocusedTabs(), null);
    const c = await client._resolveStreamCandidate();
    passAssert(c.ready === true && c.tabId !== 1, 'without FsbPlatform the workspace is skipped by the scheme check alone');
  }
  {
    const { client } = createHarness(workspaceFocusedTabs(), safariPlatform(async () => ({ id: 8, url: 'https://b.example/' })));
    const c = await client._resolveStreamCandidate();
    passAssertEqual({ tabId: c.tabId, source: c.source }, { tabId: 8, source: 'safari-content-tab' },
      'on Safari the last content tab wins over whichever window is active');
  }
  {
    const { client } = createHarness(workspaceFocusedTabs(), safariPlatform(async () => ({ id: 9, url: DASHBOARD_URL })));
    const c = await client._resolveStreamCandidate();
    passAssert(c.ready === true && c.tabId !== 9 && c.tabId !== 1 && c.source !== 'safari-content-tab',
      'a dashboard tab from resolveTargetTab is not streamed; the queries take over');
  }
  {
    const { client } = createHarness(workspaceFocusedTabs(), safariPlatform(async () => { throw new Error('storage unavailable'); }));
    const c = await client._resolveStreamCandidate();
    passAssert(c.ready === true && c.tabId !== 1, 'a failing resolveTargetTab falls back to the queries');
  }

  console.log('\n=== 3. remote navigate with no remote-control tab ===');
  {
    // A new-tab page cannot be streamed, but it is exactly what a user steers
    // away from, so navigation accepts it.
    const tabs = workspaceFocusedTabs().concat([{ id: 12, url: 'about:blank', active: false, lastFocusedWindow: false }]);
    const h = createHarness(tabs, safariPlatform(async () => ({ id: 12, url: 'about:blank' })));
    await h.t.navigate({ url: 'https://example.org/' });
    passAssertEqual(h.updates, [{ tabId: 12, url: 'https://example.org/' }],
      'navigates the last content tab, even a blank one, not the workspace');
  }
  {
    const h = createHarness(workspaceFocusedTabs(), safariPlatform(async () => ({ id: 9, url: DASHBOARD_URL })));
    await h.t.navigate({ url: 'https://example.org/' });
    passAssert(h.updates.length === 1 && h.updates[0].tabId !== 9, 'never navigates the dashboard tab away');
  }
  {
    const h = createHarness(workspaceFocusedTabs(), null);
    await h.t.navigate({ url: 'https://example.org/' });
    passAssertEqual(h.updates.map((u) => u.tabId), [1],
      'Chrome keeps its active-tab-of-the-focused-window fallback unchanged');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
