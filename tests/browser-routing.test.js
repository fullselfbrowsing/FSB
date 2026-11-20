'use strict';

/**
 * Several browsers on one hub: which browser a call goes to.
 *
 * One MCP hub can hold Chrome and Safari at once. Each MCP session decides the
 * browser for every call before it registers an identity or sends anything.
 * This locks:
 *   1. the rule itself (mcp/src/browser-routing.ts): the named browser, then
 *      the tab's browser, then the session's current one, then FSB_BROWSER,
 *      then the most recently focused. A decided browser that is away is an
 *      error. It is never replaced by another one;
 *   2. one agent identity per browser (mcp/src/agent-scope.ts);
 *   3. the tools: the `browser` argument on open_tab, list_tabs and run_task
 *      only, never forwarded to the extension; every other call following its
 *      tab or the session; a retry that stays in its browser; tasks and
 *      triggers found again in the browser they run in; the errors an agent
 *      is given; nothing changing with one browser or an older hub.
 *
 * Needs `npm --prefix mcp run build` first: it loads mcp/build.
 *
 * Run: node tests/browser-routing.test.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const BUILD = path.join(__dirname, '..', 'mcp', 'build');
const load = (file) => import(pathToFileURL(path.join(BUILD, file)).href);

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function checkEqual(actual, expected, msg) {
  check(actual === expected, `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function entry(key, overrides = {}) {
  return {
    key,
    kind: key,
    extensionVersion: '0.9.95',
    installInstanceId: `install-${key}`,
    authorized: false,
    focusedAt: null,
    connectedAt: 1000,
    ...overrides,
  };
}

// A bridge as the tools see it: a roster, and a record of everything sent.
function createBridge(options = {}) {
  let registrations = 0;
  let nextTab = { chrome: 100, safari: 200, root: 300 };
  const bridge = {
    calls: [],
    roster: options.roster === undefined ? [entry('chrome'), entry('safari')] : options.roster,
    refused: options.refused || [],
    responders: [],
    get browserRoster() { return this.roster; },
    get refusedBrowsers() { return this.refused; },
    get isConnected() { return this.roster === null ? true : this.roster.length > 0; },
    isConnectedTo(key) { return (this.roster || []).some((item) => item.key === key); },
    async sendAndWait(message, sendOptions) {
      this.calls.push({ ...message, sendOptions });
      for (const responder of this.responders) {
        const reply = await responder(message);
        if (reply !== undefined) return reply;
      }
      const where = message.browser || 'root';
      if (message.type === 'agent:register') {
        registrations += 1;
        return { success: true, agentId: `agent-${where}-${registrations}`, connectionId: `conn-${where}-${registrations}` };
      }
      if (message.type === 'mcp:execute-action' && message.payload.tool === 'open_tab') {
        nextTab[where] += 1;
        return { success: true, tabId: nextTab[where], ownershipToken: `token-${where}-${nextTab[where]}` };
      }
      if (message.type === 'mcp:get-tabs') {
        return { success: true, tabs: [{ id: nextTab[where] }], activeTabId: nextTab[where] };
      }
      return { success: true };
    },
    sent(type) { return this.calls.filter((call) => call.type === type); },
    last() { return this.calls[this.calls.length - 1]; },
  };
  return bridge;
}

function textOf(result) {
  return result && result.content && result.content[0] ? result.content[0].text : '';
}

async function main() {
  const routing = await load('browser-routing.js');
  const { AgentScope } = await load('agent-scope.js');
  const { TaskQueue } = await load('queue.js');
  const manual = await load('tools/manual.js');
  const readOnly = await load('tools/read-only.js');
  const autopilot = await load('tools/autopilot.js');
  const triggers = await load('tools/triggers.js');
  const observability = await load('tools/observability.js');
  const vault = await load('tools/vault.js');
  const visual = await load('tools/visual-session.js');
  const { resolveBrowser, pickDefaultBrowser, tabIdsIn, browserRouteFailure, normalizeBrowserName } = routing;
  const CLIENT = visual.getAllowedMcpVisualClientLabels()[0];
  const action = (params) => ({ visual_reason: 'test', client: CLIENT, ...params });

  // A session: its tools, registered on a stub server, over a mock bridge.
  function createSession(bridge, environment = {}) {
    const tools = new Map();
    const server = {
      tool(name, _description, schema, handler) { tools.set(name, { schema, handler }); },
      sendLoggingMessage() {},
    };
    const agentScope = new AgentScope({ environment });
    const queue = new TaskQueue();
    triggers.registerTriggerTools(server, bridge, queue, agentScope);
    manual.registerManualTools(server, bridge, queue, agentScope);
    readOnly.registerReadOnlyTools(server, bridge, queue, agentScope);
    observability.registerObservabilityTools(server, bridge, queue, agentScope);
    vault.registerVaultTools(server, bridge, queue, agentScope);
    autopilot.registerAutopilotTools(server, bridge, queue, agentScope);
    return {
      tools,
      agentScope,
      call: (name, params = {}, extra = {}) => tools.get(name).handler(params, extra),
    };
  }

  console.log('\n=== 1. the rule ===');
  {
    const both = [entry('chrome'), entry('safari')];
    const ok = (browser) => JSON.stringify({ ok: true, browser });

    checkEqual(JSON.stringify(resolveBrowser({ roster: both })), ok('chrome'), 'nothing ties the call: no focus reported, so chrome');
    checkEqual(
      JSON.stringify(resolveBrowser({ roster: [entry('chrome', { focusedAt: 5 }), entry('safari', { focusedAt: 9 })] })),
      ok('safari'),
      'nothing ties the call: the most recently focused browser',
    );
    checkEqual(pickDefaultBrowser([entry('safari'), entry('edge')]), 'safari', 'no focus and no chrome: whichever attached first');
    checkEqual(
      pickDefaultBrowser([entry('chrome'), entry('safari', { focusedAt: 9 })]),
      'chrome',
      'focus is not compared while one browser reports none: an older extension must not lose the default to a newer one',
    );
    checkEqual(pickDefaultBrowser([entry('safari', { focusedAt: 9 })]), 'safari', 'a single browser is the default whatever it reports');
    checkEqual(pickDefaultBrowser([]), null, 'no browsers: no default');

    checkEqual(JSON.stringify(resolveBrowser({ roster: both, named: 'safari', current: 'chrome', configured: 'chrome' })), ok('safari'), 'the browser a call names wins over everything else');
    checkEqual(JSON.stringify(resolveBrowser({ roster: both, named: '  Safari ' })), ok('safari'), 'a name is trimmed and lower-cased');
    checkEqual(normalizeBrowserName(42), null, 'a name that is not a string is no name');

    const absent = resolveBrowser({ roster: [entry('chrome')], named: 'safari' });
    checkEqual(absent.ok, false, 'a named browser that is not attached is refused');
    checkEqual(absent.code, 'BROWSER_NOT_CONNECTED', 'as BROWSER_NOT_CONNECTED');
    checkEqual(absent.connectedBrowsers.join(','), 'chrome', 'listing what is attached');

    checkEqual(JSON.stringify(resolveBrowser({ roster: both, tabId: 7, seenIn: ['safari'], current: 'chrome', configured: 'chrome' })), ok('safari'), 'a tab the session saw in one browser goes there, whatever the session is in');
    const tabGone = resolveBrowser({ roster: [entry('chrome')], tabId: 7, seenIn: ['safari'], current: 'chrome' });
    checkEqual(tabGone.code, 'BROWSER_NOT_CONNECTED', 'a tab whose browser is away is refused, not sent to the browser that is left');
    checkEqual(tabGone.browser, 'safari', 'naming the browser the tab lives in');

    checkEqual(JSON.stringify(resolveBrowser({ roster: both, tabId: 7, seenIn: ['chrome', 'safari'], current: 'safari' })), ok('safari'), 'a tab id seen in two browsers goes to the session\'s current one');
    const ambiguous = resolveBrowser({ roster: both, tabId: 7, seenIn: ['chrome', 'safari'], current: null });
    checkEqual(ambiguous.code, 'AMBIGUOUS_TAB_BROWSER', 'with no current browser it is refused, never guessed');
    checkEqual(ambiguous.candidates.join(','), 'chrome,safari', 'naming the browsers it could be');
    checkEqual(ambiguous.tabId, 7, 'and the tab');

    checkEqual(JSON.stringify(resolveBrowser({ roster: both, tabId: 7, seenIn: [], current: 'safari', configured: 'chrome' })), ok('safari'), 'a tab never seen follows the session');
    checkEqual(JSON.stringify(resolveBrowser({ roster: both, current: 'safari', configured: 'chrome' })), ok('safari'), 'the session\'s current browser comes before its configured one');
    checkEqual(JSON.stringify(resolveBrowser({ roster: both, configured: 'safari' })), ok('safari'), 'FSB_BROWSER decides where a new session starts');

    const currentGone = resolveBrowser({ roster: [entry('chrome', { focusedAt: 9 })], current: 'safari', configured: 'chrome' });
    checkEqual(currentGone.code, 'BROWSER_NOT_CONNECTED', 'a session whose browser is away is not moved to its configured one or the focused one');
    const configuredGone = resolveBrowser({ roster: [entry('chrome')], configured: 'safari' });
    checkEqual(configuredGone.code, 'BROWSER_NOT_CONNECTED', 'a configured browser that is away is not replaced by the default');

    checkEqual(JSON.stringify(resolveBrowser({ roster: [], named: 'safari' })), ok(null), 'nothing attached: the bridge\'s own not-connected error is left to speak');
    checkEqual(JSON.stringify(resolveBrowser({ roster: null })), ok(null), 'a hub with no roster: the call is sent as it always was');
    checkEqual(JSON.stringify(resolveBrowser({ roster: null, named: 'chrome' })), ok(null), 'a hub with no roster serves chrome, so naming chrome is fine');
    const oldHub = resolveBrowser({ roster: null, named: 'safari' });
    checkEqual(oldHub.code, 'BROWSER_CHOICE_UNAVAILABLE', 'a hub with no roster cannot reach safari, and says so');
    checkEqual(resolveBrowser({ roster: null, configured: 'safari' }).code, 'BROWSER_CHOICE_UNAVAILABLE', 'for a client configured for safari as well');

    checkEqual(tabIdsIn({ tabId: 4, activeTabId: 5, tab: { id: 6 }, tabs: [{ id: 7 }, { tabId: 8 }, null, { id: 'x' }] }).join(','), '4,5,6,7,8', 'tab ids are collected from a result');
    checkEqual(tabIdsIn(null).length + tabIdsIn({ tabId: -1, tabs: 'no' }).length, 0, 'and nothing from a result that has none');
    const failure = browserRouteFailure(absent);
    check(failure.success === false && failure.code === 'BROWSER_NOT_CONNECTED' && failure.errorCode === 'BROWSER_NOT_CONNECTED' && failure.browser === 'safari', 'a refusal becomes a tool failure carrying its code');
  }

  console.log('\n=== 2. one identity per browser ===');
  {
    const bridge = createBridge();
    const scope = new AgentScope({ environment: {} });
    await scope.ensure(bridge);
    checkEqual(JSON.stringify({ type: bridge.calls[0].type, payload: bridge.calls[0].payload, browser: bridge.calls[0].browser }), JSON.stringify({ type: 'agent:register', payload: {} }), 'the session\'s own scope registers with no browser, as before');

    const safari = scope.forBrowser('safari');
    const chrome = scope.forBrowser('chrome');
    const safariId = await safari.ensure(bridge);
    const chromeId = await chrome.ensure(bridge);
    checkEqual(bridge.calls[1].browser, 'safari', 'a browser\'s scope registers in its own browser');
    checkEqual(bridge.calls[2].browser, 'chrome', 'and the other in its own');
    check(safariId !== chromeId && safariId !== scope.current(), 'each browser mints its own agent id');
    check(scope.forBrowser('safari') === safari && safari.forBrowser('safari') === safari && chrome.forBrowser('safari') === safari, 'the same browser always gives the same scope');
    checkEqual(safari.browser(), 'safari', 'a scope knows its browser');
    checkEqual(scope.browser(), null, 'the session\'s own scope has none');
    check(safari.currentConnectionId() !== chrome.currentConnectionId(), 'each keeps its own connection id');

    safari.captureOwnershipToken(7, 'token-safari-7');
    checkEqual(chrome.ownershipTokenFor(7), null, 'an ownership token belongs to one browser');
    safari.reset();
    checkEqual(safari.current(), null, 'resetting one browser\'s identity clears it');
    checkEqual(chrome.current(), chromeId, 'and leaves the other browser\'s alone');

    scope.noteBrowserUse('safari', [7, 8]);
    scope.noteBrowserUse('chrome', [8]);
    const session = scope.browserSession();
    checkEqual(session.current, 'chrome', 'the browser of the last call is the session\'s current one');
    checkEqual(session.seenIn(7).join(','), 'safari', 'a tab is remembered with the browser it was seen in');
    checkEqual(session.seenIn(8).join(','), 'safari,chrome', 'and with both, if both showed it');
    checkEqual(session.seenIn(9).length, 0, 'a tab never seen has no browser');
    checkEqual(chrome.browserSession().current, 'chrome', 'a browser\'s scope reports its session\'s state');

    checkEqual(new AgentScope({ environment: { FSB_BROWSER: ' Safari ' } }).browserSession().configured, 'safari', 'FSB_BROWSER is read once, trimmed and lower-cased');
    checkEqual(new AgentScope({ environment: {} }).browserSession().configured, null, 'and is null when unset');

    scope.reset();
    checkEqual(scope.browserSession().current, null, 'resetting the session forgets where it was');
    check(scope.forBrowser('chrome') !== chrome, 'and its per-browser identities');
  }

  console.log('\n=== 3. the tools, with chrome and safari attached ===');
  {
    const bridge = createBridge();
    const session = createSession(bridge);
    const withBrowser = [...session.tools].filter(([, tool]) => tool.schema && Object.prototype.hasOwnProperty.call(tool.schema, 'browser')).map(([name]) => name).sort();
    checkEqual(withBrowser.join(','), 'list_tabs,open_tab,run_task', 'the browser argument is on open_tab, list_tabs and run_task only');

    const first = JSON.parse(textOf(await session.call('list_tabs')));
    checkEqual(bridge.calls[0].type + ':' + bridge.calls[0].browser, 'agent:register:chrome', 'a new session that names nothing registers in the default browser');
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:get-tabs:chrome', 'and lists that browser\'s tabs');
    checkEqual(first.browser, 'chrome', 'with two browsers attached a result says which one it came from');
    checkEqual(JSON.stringify(first.browsers), JSON.stringify([
      { browser: 'chrome', current: true, lastFocused: false },
      { browser: 'safari', current: false, lastFocused: false },
    ]), 'list_tabs also says which browsers are connected');

    const opened = JSON.parse(textOf(await session.call('open_tab', action({ url: 'https://example.com', browser: 'safari' }))));
    const open = bridge.last();
    checkEqual(open.type + ':' + open.browser, 'mcp:execute-action:safari', 'open_tab with browser set goes to that browser');
    checkEqual(Object.prototype.hasOwnProperty.call(open.payload.params, 'browser'), false, 'the argument itself is not forwarded to the extension');
    checkEqual(open.payload.params.url, 'https://example.com', 'the rest of the call is');
    checkEqual(bridge.sent('agent:register').map((call) => call.browser).join(','), 'chrome,safari', 'the session registered a second identity, in safari');
    check(String(open.payload.agentId).startsWith('agent-safari-'), 'and the call carries that identity');
    checkEqual(opened.browser, 'safari', 'the result names safari');
    const safariTab = opened.tabId;

    await session.call('click', action({ selector: '#go', tab_id: safariTab }));
    checkEqual(bridge.last().browser, 'safari', 'a later call that names that tab follows it, with no browser argument');
    checkEqual(bridge.last().payload.ownershipToken, `token-safari-${safariTab}`, 'carrying the token minted in that browser');

    await session.call('open_tab', action({ url: 'https://example.org' }));
    checkEqual(bridge.last().browser, 'safari', 'a call that names nothing stays in the browser the session is in');

    await session.call('get_logs', {});
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:get-logs:safari', 'logs are read from the session\'s browser');
    await session.call('list_credentials', {});
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:list-credentials:safari', 'and so is the vault');

    const chromeTabs = JSON.parse(textOf(await session.call('list_tabs', { browser: 'chrome' })));
    checkEqual(bridge.last().browser, 'chrome', 'naming chrome on list_tabs lists chrome');
    checkEqual(chromeTabs.browsers.find((item) => item.current).browser, 'chrome', 'and reports it as current');
    await session.call('open_tab', action({ url: 'https://example.net' }));
    checkEqual(bridge.last().browser, 'chrome', 'naming a browser once is the switch: the next call follows');
    check(String(bridge.last().payload.agentId).startsWith('agent-chrome-'), 'with the chrome identity');

    await session.call('click', action({ selector: '#back', tab_id: safariTab }));
    checkEqual(bridge.last().browser, 'safari', 'a tab still goes to its own browser after the switch');
    checkEqual(session.agentScope.browserSession().current, 'safari', 'and that makes it the session\'s browser again');

    // A retry stays in its browser.
    const chromeIdentity = session.agentScope.forBrowser('chrome').current();
    let rejected = false;
    bridge.responders.push((message) => {
      if (message.type === 'mcp:execute-action' && message.payload.tool === 'click' && !rejected) {
        rejected = true;
        return { success: false, code: 'AGENT_NOT_REGISTERED' };
      }
      return undefined;
    });
    const before = bridge.calls.length;
    await session.call('click', action({ selector: '#again', tab_id: safariTab }));
    const retry = bridge.calls.slice(before).map((call) => `${call.type}:${call.browser}`);
    checkEqual(retry.join(' '), 'mcp:execute-action:safari agent:register:safari mcp:execute-action:safari', 'a stale identity is renewed and retried in the same browser');
    checkEqual(session.agentScope.forBrowser('chrome').current(), chromeIdentity, 'the identity in the other browser is untouched');
    bridge.responders.length = 0;

    // The browser goes away.
    bridge.roster = [entry('chrome')];
    const sentBefore = bridge.calls.length;
    const lost = textOf(await session.call('click', action({ selector: '#gone', tab_id: safariTab })));
    check(/safari/.test(lost) && /not connected/.test(lost) && /not sent to another browser/.test(lost), 'a call for a tab whose browser left says so');
    const stuck = textOf(await session.call('open_tab', action({ url: 'https://example.com' })));
    check(/safari/.test(stuck) && /browser set to "chrome"/.test(stuck), 'a session whose browser left is told how to move');
    checkEqual(bridge.calls.length, sentBefore, 'and neither call was sent anywhere');
    await session.call('open_tab', action({ url: 'https://example.com', browser: 'chrome' }));
    checkEqual(bridge.last().browser, 'chrome', 'naming the browser that is left works');
    const single = JSON.parse(textOf(await session.call('list_tabs')));
    checkEqual(single.browser, undefined, 'with one browser attached a result is not annotated');
    checkEqual(single.browsers, undefined, 'and list_tabs lists no browsers');
  }

  console.log('\n=== 4. tasks and triggers are found again in their own browser ===');
  {
    const bridge = createBridge();
    const session = createSession(bridge);
    await session.call('list_tabs'); // the session is in chrome

    let finishTask;
    bridge.responders.push((message) => (message.type === 'mcp:start-automation'
      ? new Promise((resolve) => { finishTask = () => resolve({ success: true, status: 'complete' }); })
      : undefined));
    const running = session.call('run_task', { task: 'look around', browser: 'safari' });
    while (!finishTask) await new Promise((resolve) => setTimeout(resolve, 5));
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:start-automation:safari', 'run_task with browser set starts in that browser');
    checkEqual(Object.prototype.hasOwnProperty.call(bridge.last().payload, 'browser'), false, 'and the argument is not part of the task');
    checkEqual(session.agentScope.browserSession().current, 'chrome', 'while it runs, the session is still where it was');
    await session.call('stop_task');
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:stop-automation:safari', 'stop_task goes to the browser running the task');
    checkEqual(session.agentScope.browserSession().current, 'chrome', 'without moving the session there: the agent did not choose it');
    finishTask();
    await running;
    bridge.responders.length = 0;

    // A worker eviction: the snapshot is asked of the task's own browser.
    bridge.responders.push((message) => {
      if (message.type === 'mcp:start-automation') throw new Error('Extension disconnected');
      if (message.type === 'mcp:get-task-snapshot') return { success: true, snapshot: { status: 'in_progress', last_heartbeat_at: 5 } };
      return undefined;
    });
    await session.call('list_tabs', { browser: 'chrome' });
    const evicted = JSON.parse(textOf(await session.call('run_task', { task: 'again', browser: 'safari' })));
    const snapshot = bridge.sent('mcp:get-task-snapshot')[0];
    checkEqual(evicted.sw_evicted, true, 'a disconnect during run_task still reports sw_evicted');
    checkEqual(snapshot.browser, 'safari', 'and its snapshot is asked of the browser that ran it');
    check(String(snapshot.payload.agentId).startsWith('agent-safari-'), 'with the identity registered there');
    bridge.responders.length = 0;

    await session.call('list_tabs', { browser: 'safari' });
    await session.call('trigger', { trigger_id: 'trig-1', detached: true, condition: { text: 'done' } });
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:trigger:safari', 'a trigger is armed in the session\'s browser');
    await session.call('list_tabs', { browser: 'chrome' });
    await session.call('stop_trigger', { trigger_id: 'trig-1' });
    checkEqual(bridge.last().type + ':' + bridge.last().browser, 'mcp:stop-trigger:safari', 'and stopped in the browser it was armed in, wherever the session has gone');
    checkEqual(session.agentScope.browserSession().current, 'chrome', 'and going back for it does not move the session');
    await session.call('list_triggers', {});
    checkEqual(bridge.last().browser, 'chrome', 'a trigger call that names no known trigger follows the session');
  }

  console.log('\n=== 5. a browser that was turned away, a configured client, an older hub ===');
  {
    const refusedBridge = createBridge({
      roster: [entry('chrome', { authorized: true })],
      refused: [{ kind: 'safari', reason: 'extension_origin_pin_mismatch', at: 1 }],
    });
    const refusedSession = createSession(refusedBridge);
    const refusal = textOf(await refusedSession.call('open_tab', action({ url: 'https://example.com', browser: 'safari' })));
    check(/paired to another browser/.test(refusal) && /pair --reset/.test(refusal), 'naming a browser the hub turned away explains why and how to release it');
    checkEqual(refusedBridge.calls.length, 0, 'and sends nothing');

    const configuredBridge = createBridge();
    const configured = createSession(configuredBridge, { FSB_BROWSER: 'safari' });
    await configured.call('list_tabs');
    checkEqual(configuredBridge.last().browser, 'safari', 'a client configured with FSB_BROWSER starts in that browser');
    const elsewhere = createSession(configuredBridge, { FSB_BROWSER: 'chrome' });
    await elsewhere.call('list_tabs');
    checkEqual(configuredBridge.last().browser, 'chrome', 'while another client on the same bridge starts in the other');
    check(
      configured.agentScope.forBrowser('safari').current() !== elsewhere.agentScope.forBrowser('chrome').current(),
      'two agents, one per browser, each with its own identity',
    );

    const awayBridge = createBridge({ roster: [entry('chrome')] });
    const away = createSession(awayBridge, { FSB_BROWSER: 'safari' });
    const awayText = textOf(await away.call('list_tabs'));
    check(/safari/.test(awayText) && /not connected/.test(awayText), 'a client configured for a browser that is away is told so');
    checkEqual(awayBridge.calls.length, 0, 'and is not started in the other browser');

    const oldBridge = createBridge({ roster: null });
    const old = createSession(oldBridge);
    await old.call('list_tabs');
    checkEqual(oldBridge.calls.map((call) => `${call.type}:${call.browser}`).join(' '), 'agent:register:undefined mcp:get-tabs:undefined', 'against a hub with no roster nothing carries a browser');
    await old.call('open_tab', action({ url: 'https://example.com', browser: 'chrome' }));
    checkEqual(oldBridge.last().browser, undefined, 'naming chrome there is accepted and still sent plain');
    checkEqual(Object.prototype.hasOwnProperty.call(oldBridge.last().payload.params, 'browser'), false, 'with the argument removed');
    const sentToOld = oldBridge.calls.length;
    const unavailable = textOf(await old.call('open_tab', action({ url: 'https://example.com', browser: 'safari' })));
    check(/older fsb-mcp-server/.test(unavailable), 'naming safari there says the bridge is run by an older server');
    checkEqual(oldBridge.calls.length, sentToOld, 'and sends nothing');

    const oneBridge = createBridge({ roster: [entry('safari')] });
    const one = createSession(oneBridge);
    const only = JSON.parse(textOf(await one.call('list_tabs')));
    checkEqual(oneBridge.last().browser, 'safari', 'with one browser attached, that browser is the default whichever it is');
    check(only.browser === undefined && only.browsers === undefined, 'and nothing changes in what the caller sees');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('  FAIL: harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
});
