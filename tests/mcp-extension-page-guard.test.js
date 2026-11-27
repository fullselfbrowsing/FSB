'use strict';

/**
 * MCP agents automate web pages, never an extension's own pages. With FSB's
 * Control Panel open in an agent tab, a click_at used to toggle its controls,
 * which would change settings (or grant capability consent) around the rules
 * of the settings tool. This suite pins the two guards:
 *
 * 1. extension/ws/mcp-tool-dispatcher.js: navigate and open_tab refuse a URL
 *    that resolves to an extension page (relative URLs resolve against the
 *    extension's own origin, as chrome.tabs.update does), and switch_tab
 *    refuses to claim a tab that shows one.
 * 2. extension/background.js executeCDPToolDirectUnlocked: native input,
 *    typing and capture refuse a tab whose page is an extension page, whoever
 *    asks (MCP or autopilot).
 *
 * Node 20-safe: fake chrome only; no ports, no global WebSocket.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed += 1; console.log('  PASS:', msg); } else { failed += 1; console.error('  FAIL:', msg); }
}

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASE = `chrome-extension://${EXTENSION_ID}/`;
const tabs = new Map();
const calls = { update: [], create: [], bind: [] };

global.chrome = {
  runtime: { id: EXTENSION_ID, getURL: (rel) => BASE + String(rel || '') },
  tabs: {
    async get(tabId) {
      if (!tabs.has(tabId)) throw new Error('No tab with id: ' + tabId);
      return { ...tabs.get(tabId) };
    },
    async update(tabId, props) {
      calls.update.push({ tabId, props });
      const tab = { ...(tabs.get(tabId) || { id: tabId }), ...props };
      tabs.set(tabId, tab);
      return { ...tab };
    },
    async create(props) {
      calls.create.push(props);
      const tab = { id: 500 + calls.create.length, url: props.url, active: !!props.active, windowId: 1 };
      tabs.set(tab.id, tab);
      return { ...tab };
    },
    async query() { return [...tabs.values()].filter((tab) => tab.active); },
    async remove() {}
  },
  storage: {
    local: { async get() { return {}; }, async set() {}, async remove() {} },
    session: { async get() { return {}; }, async set() {}, async remove() {} },
    onChanged: { addListener() {} }
  },
  webNavigation: { onCommitted: { addListener() {}, removeListener() {} } }
};
global.automationLogger = { debug() {}, info() {}, warn() {}, error() {}, logActionExecution() {} };
global.fsbAgentRegistryInstance = {
  hasAgent: () => true,
  getAgentTabs: () => [],
  getOwner: () => null,
  async bindTab(agentId, tabId) { calls.bind.push({ agentId, tabId }); return { agentId, tabId, ownershipToken: 'tok' }; },
  isOwnedBy: () => true,
  stampAgentNavigation() {}
};

const dispatcher = require(path.join(__dirname, '..', 'extension', 'ws', 'mcp-tool-dispatcher.js'));
const isTarget = dispatcher.isMcpExtensionPageTarget;

async function run() {
  console.log('\n--- which targets count as extension pages ---');
  check(typeof isTarget === 'function', 'the dispatcher exports isMcpExtensionPageTarget for tests');
  for (const url of [
    `${BASE}ui/control_panel.html`,
    `${BASE}ui/control_panel.html#advanced`,
    'CHROME-EXTENSION://' + EXTENSION_ID + '/ui/options.html',
    '  chrome-extension://otherextensionidotherextensionid/popup.html',
    'ui/control_panel.html',
    '/ui/sidepanel.html',
    './ui/onboarding.html',
    'example.com'
  ]) {
    check(isTarget(url) === true, `${JSON.stringify(url)} is an extension page target`);
  }
  for (const url of ['https://example.com', 'http://localhost:3000/a', 'about:blank', 'file:///tmp/a.html', undefined, null, 42]) {
    check(isTarget(url) === false, `${JSON.stringify(url)} is not an extension page target`);
  }

  console.log('\n--- navigate and open_tab refuse an extension page ---');
  for (const url of [`${BASE}ui/control_panel.html#advanced`, 'ui/control_panel.html']) {
    calls.update.length = 0; calls.create.length = 0;
    const nav = await dispatcher.dispatchMcpToolRoute({ tool: 'navigate', params: { url, agentId: 'agent_guard', tabId: 7 }, payload: {} });
    check(nav && nav.success === false && nav.errorCode === 'restricted_active_tab' && nav.pageType === 'Chrome extension page',
      `navigate(${JSON.stringify(url)}) is refused as a restricted extension page (got ${nav && nav.errorCode})`);
    check(calls.update.length === 0 && calls.create.length === 0, `navigate(${JSON.stringify(url)}) touches no tab`);
    check(typeof nav.error === 'string' && nav.error.includes('settings tool'), 'the refusal points at the settings tool');
    const open = await dispatcher.dispatchMcpToolRoute({ tool: 'open_tab', params: { url, agentId: 'agent_guard' }, payload: {} });
    check(open && open.success === false && open.errorCode === 'restricted_active_tab',
      `open_tab(${JSON.stringify(url)}) is refused (got ${open && open.errorCode})`);
    check(calls.create.length === 0, `open_tab(${JSON.stringify(url)}) opens no tab`);
  }
  calls.create.length = 0;
  const web = await dispatcher.dispatchMcpToolRoute({ tool: 'open_tab', params: { url: 'https://example.com', agentId: 'agent_guard' }, payload: {} });
  check(calls.create.length === 1 && !(web && web.errorCode === 'restricted_active_tab'), 'open_tab of a web page still opens it');

  console.log('\n--- switch_tab never claims a tab that shows an extension page ---');
  tabs.set(9, { id: 9, url: `${BASE}ui/control_panel.html`, active: false, windowId: 1 });
  tabs.set(10, { id: 10, url: 'https://example.com/a', pendingUrl: `${BASE}ui/options.html`, active: false, windowId: 1 });
  for (const tabId of [9, 10]) {
    calls.bind.length = 0;
    const sw = await dispatcher.dispatchMcpToolRoute({ tool: 'switch_tab', params: { tabId, agentId: 'agent_guard', active: true }, payload: {} });
    check(sw && sw.success === false && sw.errorCode === 'restricted_active_tab', `switch_tab(${tabId}) is refused (got ${sw && sw.errorCode})`);
    check(calls.bind.length === 0, `switch_tab(${tabId}) claims nothing`);
  }

  console.log('\n--- the CDP executor refuses an extension page for every caller ---');
  const background = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
  const start = background.indexOf('async function executeCDPToolDirectUnlocked(');
  const end = background.indexOf('\nasync function handleMonacoEditorInsert', start);
  check(start !== -1 && end > start, 'executeCDPToolDirectUnlocked is found in background.js');
  let attached = 0;
  const shownUrl = new Map([[21, `${BASE}ui/control_panel.html`], [22, 'https://example.com/form'], [23, 'https://example.com/']]);
  const pendingUrl = new Map([[23, `chrome-extension://${EXTENSION_ID}/ui/options.html`]]);
  const context = {
    requireForegroundNativeInput: async () => {},
    attachFsbDebugger: async () => { attached += 1; throw new Error('attached'); },
    automationLogger: { logActionExecution() {}, debug() {} },
    cdpFailureResult: (error) => ({ success: false, error: error.message }),
    globalThis: {},
    chrome: {
      tabs: { get: async (tabId) => ({ id: tabId, url: shownUrl.get(tabId), pendingUrl: pendingUrl.get(tabId) }) },
      debugger: { detach: async () => {}, sendCommand: async () => {} }
    }
  };
  const execute = vm.runInNewContext(`${background.slice(start, end)}\nexecuteCDPToolDirectUnlocked`, context);
  for (const [verb, params] of [['cdpClickAt', { x: 10, y: 10 }], ['cdpInsertText', { text: 'x' }], ['cdpScrollAt', { x: 1, y: 1, deltaY: 100 }]]) {
    attached = 0;
    const refused = await execute({ tool: verb, params }, 21);
    check(refused && refused.success === false && refused.errorCode === 'restricted_active_tab' && attached === 0,
      `${verb} on the Control Panel is refused before the debugger attaches`);
  }
  attached = 0;
  const pending = await execute({ tool: 'cdpClickAt', params: { x: 1, y: 1 } }, 23);
  check(pending && pending.errorCode === 'restricted_active_tab' && attached === 0, 'a tab navigating to an extension page is refused too');
  attached = 0;
  const allowed = await execute({ tool: 'cdpClickAt', params: { x: 1, y: 1 } }, 22);
  check(attached === 1 && !(allowed && allowed.errorCode === 'restricted_active_tab'), 'a click on a web page still reaches the debugger');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
