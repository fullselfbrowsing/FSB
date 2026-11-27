'use strict';

/**
 * Several browsers on one hub: which browser a call goes to.
 *
 * One MCP hub can hold every Chrome profile that has the extension, other
 * Chromium browsers and Safari at once. Each MCP session decides the browser
 * for every call before it registers an identity or sends anything.
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
 *      is given; nothing changing with one browser or an older hub;
 *   4. profiles: how an install is named, what "chrome" means when several
 *      Chrome profiles are attached, list_browsers, and two agents working in
 *      two profiles at once.
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
    extensionId: null,
    extensionVersion: '0.9.95',
    installInstanceId: `install-${key}`,
    windows: 1,
    authorized: false,
    focusedAt: null,
    connectedAt: 1000,
    ...overrides,
  };
}

// A Chrome profile as the hub lists it: keyed by its install, kind 'chrome'.
function profile(key, overrides = {}) {
  return entry(key, {
    kind: 'chrome',
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    installInstanceId: `${key.slice('chrome-'.length)}-0000-4000-8000-000000000000`,
    ...overrides,
  });
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
      if (nextTab[where] === undefined) nextTab[where] = 1000 * (Object.keys(nextTab).length + 1);
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
  const { matchBrowser, browserKeyCandidates, browserKeyStems, compactInstallId, endpointStartingIn } = routing;
  const { lastFocusedBrowser } = routing;
  const browsers = await load('tools/browsers.js');
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
    browsers.registerBrowserTools(server, bridge, queue, agentScope);
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
    // Any Safari extension can attach and say it was focused just now, and the
    // hub cannot tell it from FSB. It is not handed the calls that name no browser.
    checkEqual(
      JSON.stringify(resolveBrowser({ roster: [entry('chrome', { focusedAt: 5 }), entry('safari', { focusedAt: 9 })] })),
      ok('chrome'),
      'nothing ties the call: a Chromium browser, however recently Safari says it was focused',
    );
    checkEqual(pickDefaultBrowser([entry('safari'), entry('edge')]), 'safari', 'no focus and no chrome: whichever attached first');
    checkEqual(
      pickDefaultBrowser([entry('chrome'), entry('safari', { focusedAt: 9 })]),
      'chrome',
      'a Safari that reports focus does not take the default from a Chromium browser that reports none',
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

    // A session already in Safari when pairing another browser turns Safari
    // away. Its next call names the Safari key, not the kind, and is still
    // told why, by the latest refusal.
    const pinnedBridge = createBridge({
      roster: [profile('chrome-aaaaaaaa'), entry('safari-1a2b3c4d', { kind: 'safari' })],
    });
    const inSafari = createSession(pinnedBridge);
    await inSafari.call('list_tabs', { browser: 'safari' });
    checkEqual(inSafari.agentScope.browserSession().current, 'safari-1a2b3c4d', 'naming the kind puts the session in that safari');
    pinnedBridge.roster = [profile('chrome-aaaaaaaa', { authorized: true })];
    pinnedBridge.refused = [
      { kind: 'safari', reason: 'browser_limit_reached', at: 1 },
      { kind: 'safari', reason: 'extension_origin_pin_mismatch', at: 2 },
    ];
    const sentBeforeAway = pinnedBridge.calls.length;
    const turnedAway = textOf(await inSafari.call('list_tabs'));
    check(
      /paired to another browser/.test(turnedAway) && /pair --reset/.test(turnedAway),
      'a session in a safari the hub turned away is told why and how to release it',
    );
    checkEqual(pinnedBridge.calls.length, sentBeforeAway, 'and nothing is sent');

    // A Chrome profile that is away is not blamed on a refusal of another
    // extension ID: several can be about, and a refusal names no profile.
    const closedBridge = createBridge({ roster: [profile('chrome-aaaaaaaa'), profile('chrome-bbbbbbbb')] });
    const inProfile = createSession(closedBridge);
    await inProfile.call('list_tabs', { browser: 'chrome-aaaaaaaa' });
    closedBridge.roster = [profile('chrome-bbbbbbbb')];
    closedBridge.refused = [{
      kind: 'chrome',
      reason: 'extension_origin_pin_mismatch',
      at: 3,
      extensionId: 'ponmlkjihgfedcbaponmlkjihgfedcba',
    }];
    const closed = textOf(await inProfile.call('list_tabs'));
    check(
      /not connected/.test(closed) && !/pair --reset/.test(closed),
      'a chrome profile that is away is reported as away, not as turned away',
    );

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

  console.log('\n=== 6. profiles: how an install is named and chosen ===');
  {
    const EXTENSION = 'abcdefghijklmnopabcdefghijklmnop';
    const INSTALL = '4187C196-3c4b-4778-b904-a7ad83023d2e';
    const WORK = 'chrome-4187c196';
    const HOME = 'chrome-9a0c11d2';
    const SAFARI = 'safari-b3f6f5c2';

    checkEqual(compactInstallId(INSTALL), '4187c1963c4b4778b904a7ad83023d2e', 'an install id is carried as lower-case letters and digits');
    checkEqual(compactInstallId('abc-12'), null, 'one too short to tell installs apart is no id');
    checkEqual(compactInstallId(7), null, 'nor is anything that is not a string');

    const named = browserKeyCandidates('chrome', EXTENSION, INSTALL);
    checkEqual(named[0], WORK, 'a profile is named after the start of its install id');
    checkEqual(named[1], 'chrome-4187c1963c4b', 'with a longer name to fall back on');
    check(named.every((key) => /^[a-z][a-z0-9-]{0,31}$/.test(key)), 'every candidate is a browser key');
    checkEqual(new Set(named).size, named.length, 'and no candidate repeats');
    checkEqual(browserKeyCandidates('safari', null, INSTALL)[0], 'safari-4187c196', 'Safari is named the same way');
    checkEqual(browserKeyCandidates('chrome', EXTENSION, null)[0], 'chrome-legacy-abcdefgh', 'a build that never says which install it is is named after its extension');
    checkEqual(browserKeyCandidates('chrome', EXTENSION, 'short')[0], 'chrome-legacy-abcdefgh', 'as is one whose install id is unusable');
    checkEqual(browserKeyCandidates('safari', null, null)[0], 'safari-legacy', 'and Safari, whose Origin names nothing lasting, after its kind');

    const work = profile(WORK, { since: 100 });
    const home = profile(HOME, { since: 200 });
    const safari = entry(SAFARI, { kind: 'safari', since: 50 });
    const three = [safari, work, home];
    const ok = (browser) => JSON.stringify({ ok: true, browser });

    checkEqual(matchBrowser(three, HOME), HOME, 'a key names exactly that profile');
    checkEqual(matchBrowser(three, 'chrome'), WORK, '"chrome" with two profiles attached means the default among them');
    checkEqual(matchBrowser(three, 'chrome', HOME), HOME, 'and leaves a session where it is when it is already in a Chrome profile');
    checkEqual(matchBrowser(three, 'chrome', SAFARI), WORK, 'a session in Safari that asks for chrome gets the default Chrome profile');
    checkEqual(matchBrowser(three, 'safari'), SAFARI, '"safari" names the Safari that is attached');
    checkEqual(matchBrowser(three, 'chrome-00000000'), null, 'a key nothing attached has names nothing');
    checkEqual(matchBrowser(three, 'firefox'), null, 'nor does a kind FSB does not run in');
    checkEqual(matchBrowser([safari], 'chrome'), null, '"chrome" names nothing when no Chromium browser is attached');

    checkEqual(pickDefaultBrowser(three), WORK, 'with no focus: a Chromium browser before Safari, then the one attached longest');
    checkEqual(pickDefaultBrowser([home, work]), WORK, 'whatever order the roster lists them in');
    checkEqual(
      pickDefaultBrowser([profile(WORK, { since: 100, windows: 0 }), home]),
      HOME,
      'a profile with a window open before one with none',
    );
    checkEqual(
      pickDefaultBrowser([profile(WORK, { since: 100, windows: 0 }), profile(HOME, { since: 200, windows: 0 })]),
      WORK,
      'unless none has a window',
    );
    checkEqual(
      pickDefaultBrowser([profile(WORK, { since: 100, windows: null }), home]),
      WORK,
      'a profile that has not reported its windows yet is not passed over',
    );
    checkEqual(
      pickDefaultBrowser([profile(WORK, { connectedAt: 300 }), profile(HOME, { connectedAt: 200 })]),
      HOME,
      'a hub that sends no `since` is ordered by when each connected',
    );
    checkEqual(
      pickDefaultBrowser([profile(WORK, { focusedAt: 5 }), profile(HOME, { focusedAt: 9 }), entry(SAFARI, { kind: 'safari', focusedAt: 7 })]),
      HOME,
      'once every browser reports focus, the profile focused last',
    );
    // A Safari install cannot be told to be FSB: any Safari extension can
    // attach and say it was focused just now. Focus orders the Chrome profiles
    // and nothing else.
    checkEqual(
      pickDefaultBrowser([profile(WORK, { focusedAt: 5 }), profile(HOME, { focusedAt: 9 }), entry(SAFARI, { kind: 'safari', focusedAt: 50 })]),
      HOME,
      'a Safari focused after every profile still does not take the default from them',
    );
    checkEqual(
      pickDefaultBrowser([profile(WORK, { since: 100 }), profile(HOME, { since: 200, focusedAt: 9 })]),
      WORK,
      'focus is not compared while one profile reports none: an older extension must not lose the default to a newer one',
    );
    checkEqual(
      pickDefaultBrowser([profile(WORK, { focusedAt: 5 }), profile(HOME, { focusedAt: 9 }), safari]),
      HOME,
      'a Safari that reports no focus does not stop focus ordering the profiles',
    );
    checkEqual(pickDefaultBrowser([safari]), SAFARI, 'with no Chromium browser attached, Safari is the default');
    checkEqual(JSON.stringify(resolveBrowser({ roster: three, named: 'safari' })), ok(SAFARI), 'and it is always reached by name');

    check(typeof lastFocusedBrowser === 'function', 'browser-routing says which browser was focused last');
    if (typeof lastFocusedBrowser === 'function') {
      checkEqual(
        lastFocusedBrowser([profile(WORK, { focusedAt: 5 }), entry(SAFARI, { kind: 'safari', focusedAt: 9 })]),
        SAFARI,
        'focused last means focused last, whatever the kind',
      );
      checkEqual(lastFocusedBrowser([profile(WORK, { focusedAt: 5 }), safari]), null, 'and is unknown while one browser reports no focus');
      checkEqual(lastFocusedBrowser([]), null, 'or none is attached');
    }

    checkEqual(JSON.stringify(resolveBrowser({ roster: three, named: HOME, current: WORK })), ok(HOME), 'naming a profile moves a session there');
    checkEqual(JSON.stringify(resolveBrowser({ roster: three, named: 'chrome', current: HOME })), ok(HOME), 'naming "chrome" does not move it between profiles');
    checkEqual(JSON.stringify(resolveBrowser({ roster: three, configured: 'chrome' })), ok(WORK), 'FSB_BROWSER=chrome starts a session in the default Chrome profile');
    checkEqual(JSON.stringify(resolveBrowser({ roster: three, configured: HOME })), ok(HOME), 'FSB_BROWSER set to a key starts it in that profile');
    const pinnedAway = resolveBrowser({ roster: [safari, work], configured: HOME });
    checkEqual(pinnedAway.code, 'BROWSER_NOT_CONNECTED', 'a client pinned to a profile that is closed is not started in another one');
    checkEqual(pinnedAway.connectedBrowsers.join(','), `${SAFARI},${WORK}`, 'and is told which are open');
    checkEqual(resolveBrowser({ roster: [safari, work], current: HOME }).code, 'BROWSER_NOT_CONNECTED', 'a session whose profile closed is not moved to the other profile');
    checkEqual(resolveBrowser({ roster: null, named: HOME }).code, 'BROWSER_CHOICE_UNAVAILABLE', 'an older hub cannot be asked for a profile');

    checkEqual(browserKeyStems('chrome', EXTENSION, INSTALL).join(','), 'chrome-4187c196,chrome-4187c1963c4b,chrome-4187c1963c4b4778,chrome-4187c1963c4b4778b904a7ad', 'the names that can only mean one install are its id at each length');
    check(!browserKeyStems('chrome', EXTENSION, INSTALL).some((key) => /-\d$/.test(key)), 'the numbered names, handed out by arrival, are not among them');

    // An older server takes over the bridge. It serves one browser and says
    // which install that is, but takes no browser name.
    const served = { extensionId: EXTENSION, installInstanceId: INSTALL };
    checkEqual(
      JSON.stringify(resolveBrowser({ roster: null, current: WORK, legacy: served })),
      JSON.stringify({ ok: true, browser: null, scope: WORK }),
      'a session in the profile an older hub serves carries on, unnamed on the wire, with the identity it has there',
    );
    checkEqual(JSON.stringify(resolveBrowser({ roster: null, configured: WORK, legacy: served })), JSON.stringify({ ok: true, browser: null, scope: WORK }), 'so does a client pinned to that profile');
    checkEqual(JSON.stringify(resolveBrowser({ roster: null, named: 'chrome-4187c1963c4b', legacy: served })), JSON.stringify({ ok: true, browser: null, scope: 'chrome-4187c1963c4b' }), 'under whichever length of its name the session holds');
    checkEqual(resolveBrowser({ roster: null, current: HOME, legacy: served }).code, 'BROWSER_CHOICE_UNAVAILABLE', 'a session in another profile is refused, not moved to the one that hub holds');
    checkEqual(resolveBrowser({ roster: null, current: WORK, legacy: null }).code, 'BROWSER_CHOICE_UNAVAILABLE', 'as it is when the hub does not say which install it holds');
    checkEqual(resolveBrowser({ roster: null, current: `${WORK}-2`, legacy: served }).code, 'BROWSER_CHOICE_UNAVAILABLE', 'and a numbered name, which says nothing about the install, never matches');
    checkEqual(JSON.stringify(resolveBrowser({ roster: null, current: WORK, named: 'chrome', legacy: null })), ok(null), 'naming "chrome" is always something an older hub can do');
    checkEqual(JSON.stringify(resolveBrowser({ roster: null, named: 'chrome', current: HOME, legacy: served })), JSON.stringify({ ok: true, browser: null, scope: WORK }), 'and places the session in the install that hub says it holds');
    checkEqual(JSON.stringify(resolveBrowser({ roster: null, legacy: served })), JSON.stringify({ ok: true, browser: null, scope: WORK }), 'as a call tied to nothing is');

    // Nothing attached for a moment: a worker restart.
    checkEqual(JSON.stringify(resolveBrowser({ roster: [], current: HOME })), ok(HOME), 'with nothing attached, a call still carries the profile its session is in');
    checkEqual(JSON.stringify(resolveBrowser({ roster: [], tabId: 7, seenIn: [HOME], current: WORK })), ok(HOME), 'or the one its tab lives in');
    checkEqual(JSON.stringify(resolveBrowser({ roster: [], configured: HOME })), ok(HOME), 'or the one its client is pinned to');
    checkEqual(JSON.stringify(resolveBrowser({ roster: [], named: 'chrome', current: null })), ok(null), 'a kind names no one browser, so that call stays unnamed');
    checkEqual(JSON.stringify(resolveBrowser({ roster: [], configured: 'not a key!' })), ok(null), 'as does a name that could never be a key');
    checkEqual(JSON.stringify(resolveBrowser({ roster: [] })), ok(null), 'and a call tied to nothing');

    checkEqual(endpointStartingIn('http://127.0.0.1:7226/mcp', HOME), `http://127.0.0.1:7226/mcp?browser=${HOME}`, 'an endpoint can name the browser its sessions start in');
    checkEqual(endpointStartingIn('http://127.0.0.1:7226/mcp', null), 'http://127.0.0.1:7226/mcp', 'and is unchanged when none is named');
  }

  console.log('\n=== 7. list_browsers, and two agents in two profiles ===');
  {
    const WORK = 'chrome-4187c196';
    const HOME = 'chrome-9a0c11d2';
    const roster = () => [
      profile(WORK, { since: 100, connectedAt: 1_700_000_000_000, windows: 2 }),
      profile(HOME, { since: 200, connectedAt: 1_700_000_100_000, extensionVersion: '0.9.92' }),
    ];
    const describes = (message) => (message.type === 'mcp:get-diagnostics'
      ? {
          success: true,
          activeTab: { id: 5, title: `Inbox ${message.browser}`, url: `https://mail.example/${message.browser}` },
          tabsSummary: { totalTabs: 4, activeTabId: 5 },
        }
      : undefined);

    const bridge = createBridge({ roster: roster() });
    bridge.responders.push(describes);
    const first = createSession(bridge);
    const second = createSession(bridge);
    checkEqual(Object.keys(first.tools.get('list_browsers').schema).length, 0, 'list_browsers takes no arguments');

    const listed = JSON.parse(textOf(await first.call('list_browsers')));
    checkEqual(listed.browsers.map((item) => item.browser).join(','), `${WORK},${HOME}`, 'list_browsers lists every attached profile by the value that names it');
    checkEqual(listed.browsers[0].kind, 'chrome', 'with its kind');
    checkEqual(listed.browsers[0].extensionId, 'abcdefghijklmnopabcdefghijklmnop', 'its extension');
    checkEqual(listed.browsers[1].extensionVersion, '0.9.92', 'its own extension version');
    checkEqual(listed.browsers[0].windows, 2, 'its windows');
    checkEqual(listed.browsers[0].tabs, 4, 'its tabs');
    checkEqual(listed.browsers[1].activeTab.title, `Inbox ${HOME}`, 'and the tab in front there, which tells one profile from another');
    checkEqual(listed.browsers[0].connectedAt, '2023-11-14T22:13:20.000Z', 'times are given as dates');
    checkEqual(listed.browsers[0].lastFocusedAt, null, 'and focus is null from a build that does not report it');
    checkEqual(listed.default, WORK, 'it says where a call that names no browser would go');
    checkEqual(listed.browsers.filter((item) => item.default).map((item) => item.browser).join(','), WORK, 'and marks that entry');
    checkEqual(listed.current, null, 'a session that has not worked anywhere has no current browser');
    checkEqual(listed.choice, true, 'and says a choice can be made');
    checkEqual(bridge.sent('agent:register').length, 0, 'listing registers no agent in any browser');
    checkEqual(bridge.sent('mcp:get-diagnostics').map((call) => call.browser).sort().join(','), `${WORK},${HOME}`, 'each profile is asked about itself, by name');
    checkEqual(first.agentScope.browserSession().current, null, 'and listing does not move the session');

    const opened = JSON.parse(textOf(await first.call('open_tab', action({ url: 'https://example.com', browser: HOME }))));
    checkEqual(bridge.last().browser, HOME, 'the first agent opens its tab in the profile it chose');
    checkEqual(opened.browser, HOME, 'and the result says where it went');
    await second.call('open_tab', action({ url: 'https://example.com' }));
    checkEqual(bridge.last().browser, WORK, 'a second agent that names none works in the default profile');
    checkEqual(bridge.sent('agent:register').map((call) => call.browser).join(','), `${HOME},${WORK}`, 'each agent registers only in its own profile');

    await first.call('read_page', {});
    checkEqual(bridge.last().browser, HOME, 'the first agent\'s later calls stay in its profile');
    await second.call('read_page', {});
    checkEqual(bridge.last().browser, WORK, 'and the second agent\'s in its own');
    await first.call('list_tabs', { browser: 'chrome' });
    checkEqual(bridge.last().browser, HOME, 'asking for "chrome" keeps an agent in the Chrome profile it is in');
    checkEqual(bridge.sent('agent:register').length, 2, 'and none of it registered anyone again');

    const after = JSON.parse(textOf(await first.call('list_browsers')));
    checkEqual(after.current, HOME, 'list_browsers then shows the first agent where it is');
    checkEqual(after.default, HOME, 'which is where its next unnamed call goes');
    checkEqual(JSON.parse(textOf(await second.call('list_browsers'))).current, WORK, 'and the second agent where it is');

    bridge.roster = [roster()[0]];
    const sentBefore = bridge.calls.length;
    const away = textOf(await first.call('read_page', {}));
    check(/not connected/.test(away) && away.includes(HOME), 'when its profile closes, the first agent is told so by name');
    checkEqual(bridge.calls.length, sentBefore, 'and its call is not sent to the profile that is left');
    const stranded = JSON.parse(textOf(await first.call('list_browsers')));
    checkEqual(stranded.default, null, 'list_browsers shows it has nowhere to go by default');
    check(stranded.hint.includes(HOME) && /not connected/.test(stranded.hint), 'and why');
    await first.call('list_tabs', { browser: WORK });
    checkEqual(bridge.last().browser, WORK, 'naming the other profile moves it there');
    checkEqual(first.agentScope.browserSession().current, WORK, 'for the calls that follow');

    const pinnedBridge = createBridge({ roster: roster() });
    const pinned = createSession(pinnedBridge, { FSB_BROWSER: HOME });
    await pinned.call('list_tabs');
    checkEqual(pinnedBridge.last().browser, HOME, 'FSB_BROWSER set to a profile key starts a client there without the agent choosing');
    const kindBridge = createBridge({ roster: roster() });
    await createSession(kindBridge, { FSB_BROWSER: 'chrome' }).call('list_tabs');
    checkEqual(kindBridge.last().browser, WORK, 'FSB_BROWSER=chrome still works with two profiles: the default one');

    const slowBridge = createBridge({ roster: roster() });
    slowBridge.responders.push((message) => {
      if (message.type !== 'mcp:get-diagnostics') return undefined;
      if (message.browser === HOME) throw new Error('timed out');
      return describes(message);
    });
    const partial = JSON.parse(textOf(await createSession(slowBridge).call('list_browsers')));
    checkEqual(partial.browsers.length, 2, 'a profile that does not answer in time is still listed');
    check(partial.browsers[1].tabs === null && partial.browsers[1].activeTab === null, 'without what it has open');
    checkEqual(partial.browsers[0].tabs, 4, 'and the others are complete');

    const refusedBridge = createBridge({
      roster: [roster()[0]],
      refused: [{ kind: 'chrome', extensionId: 'p'.repeat(32), reason: 'extension_origin_pin_mismatch', at: 1_700_000_200_000 }],
    });
    const withRefusal = JSON.parse(textOf(await createSession(refusedBridge).call('list_browsers')));
    checkEqual(withRefusal.notConnected[0].extensionId, 'p'.repeat(32), 'a browser that was turned away is listed apart, by its extension');
    checkEqual(withRefusal.notConnected[0].reason, 'extension_origin_pin_mismatch', 'with the reason');
    check(/pair --reset/.test(withRefusal.notConnected[0].fix), 'and what releases it');
    checkEqual(withRefusal.hint, undefined, 'one attached browser needs no hint about choosing');

    const emptyBridge = createBridge({ roster: [] });
    const empty = JSON.parse(textOf(await createSession(emptyBridge).call('list_browsers')));
    check(empty.success === true && empty.browsers.length === 0 && /No browser is connected/.test(empty.hint), 'with nothing attached the list is empty and says so');
    checkEqual(emptyBridge.calls.length, 0, 'and nothing is sent');

    const oldBridge = createBridge({ roster: null });
    oldBridge.topology = {
      extensionConnected: true,
      extensionAttachment: {
        extensionId: 'abcdefghijklmnopabcdefghijklmnop',
        extensionVersion: '0.9.95',
        installInstanceId: 'x',
        normalWindowCount: 1,
        connectedAt: '2026-11-24T21:21:21.395Z',
      },
    };
    oldBridge.responders.push(describes);
    oldBridge.topology.extensionAttachment.installInstanceId = '4187c196-3c4b-4778-b904-a7ad83023d2e';
    const old = JSON.parse(textOf(await createSession(oldBridge).call('list_browsers')));
    checkEqual(old.browsers.map((item) => item.browser).join(','), WORK, 'an older hub is listed as the one browser it serves, under the name a current hub gives that install');
    checkEqual(old.current, WORK, 'which is where every session behind it is');
    checkEqual(old.choice, false, 'with no choice to make');
    check(/older fsb-mcp-server/.test(old.hint), 'and how to get one');
    checkEqual(oldBridge.sent('mcp:get-diagnostics')[0].browser, undefined, 'that browser is asked without a name, which such a hub would not understand');

    const fresh = createSession(oldBridge);
    const sentToOldHub = oldBridge.calls.length;
    await fresh.call('list_tabs');
    checkEqual(oldBridge.calls.slice(sentToOldHub).map((call) => `${call.type}:${call.browser}`).join(' '), 'agent:register:undefined mcp:get-tabs:undefined', 'a new session behind it is sent unnamed, registration included');
    checkEqual(fresh.agentScope.browserSession().current, WORK, 'and is placed in the install that hub holds, so it stays there when a current server takes over');

    // A session that was working in a profile when an older server took over.
    const takenOver = createBridge({ roster: roster() });
    const survivor = createSession(takenOver);
    await survivor.call('open_tab', action({ url: 'https://example.com', browser: WORK }));
    const identity = survivor.agentScope.forBrowser(WORK).current();
    takenOver.roster = null;
    takenOver.topology = { extensionConnected: true, extensionAttachment: { ...oldBridge.topology.extensionAttachment } };
    const registrationsBefore = takenOver.sent('agent:register').length;
    const carried = textOf(await survivor.call('read_page', {}));
    check(!/older fsb-mcp-server/.test(carried), 'a session in the profile the older hub holds keeps working');
    checkEqual(takenOver.last().browser, undefined, 'with its calls sent unnamed, as that hub expects');
    checkEqual(takenOver.last().payload.agentId, identity, 'under the identity it already has in that profile');
    checkEqual(takenOver.sent('agent:register').length, registrationsBefore, 'without registering again');
    checkEqual(survivor.agentScope.browserSession().current, WORK, 'and it stays tied to that profile');

    takenOver.topology.extensionAttachment.installInstanceId = '9a0c11d2-0f6e-4d1c-8a53-0d3a2f1c9e77';
    const sentBeforeRefusal = takenOver.calls.length;
    const refusedThere = textOf(await survivor.call('read_page', {}));
    check(/older fsb-mcp-server/.test(refusedThere), 'if the older hub holds another profile, the session is told, not moved there');
    checkEqual(takenOver.calls.length, sentBeforeRefusal, 'and nothing is sent');
    await survivor.call('list_tabs', { browser: 'chrome' });
    checkEqual(survivor.agentScope.browserSession().current, HOME, 'naming "chrome" then takes it to the profile that hub does hold');
    check(!/older fsb-mcp-server/.test(textOf(await survivor.call('read_page', {}))), 'and its later calls go through');

    // The same takeover by a hub that does not say which install it holds.
    const silent = createBridge({ roster: roster() });
    const stuck = createSession(silent);
    await stuck.call('open_tab', action({ url: 'https://example.com', browser: WORK }));
    silent.roster = null;
    silent.topology = { extensionConnected: true, extensionAttachment: null };
    check(/older fsb-mcp-server/.test(textOf(await stuck.call('read_page', {}))), 'a hub that names no install cannot be trusted to hold the session\'s profile');
    await stuck.call('list_tabs', { browser: 'chrome' });
    checkEqual(stuck.agentScope.browserSession().current, null, 'but an agent that names "chrome" is let go of its old profile');
    check(!/older fsb-mcp-server/.test(textOf(await stuck.call('read_page', {}))), 'so it is not left refusing every call');

    oldBridge.topology = { extensionConnected: false, extensionAttachment: null };
    checkEqual(JSON.parse(textOf(await createSession(oldBridge).call('list_browsers'))).browsers.length, 0, 'an older hub with no browser lists none');

    // The hub this process relays through goes away. Until the next hub
    // answers, the relay has no roster and nothing is connected. A call queued
    // behind one the old hub was holding runs in that gap: it passed its
    // connection check before the drop, and is routed after it.
    const handover = createBridge({ roster: roster() });
    const queuedSession = createSession(handover);
    await queuedSession.call('open_tab', action({ url: 'https://example.com', browser: HOME }));
    let loseHub = null;
    handover.responders.push((message) => {
      if (message.type !== 'mcp:execute-action' || loseHub) return undefined;
      return new Promise((_resolve, reject) => { loseHub = () => reject(new Error('Lost connection to hub')); });
    });
    const inFlight = queuedSession.call('open_tab', action({ url: 'https://example.com/held' }));
    const queuedBehind = queuedSession.call('open_tab', action({ url: 'https://example.com/queued' }));
    for (let tick = 0; !loseHub && tick < 200; tick += 1) await new Promise((resolve) => setImmediate(resolve));
    check(loseHub !== null, 'the first call is held by the hub when it goes away');
    // What the relay's close handler leaves: no roster, not connected, and the
    // last attachment the old hub described, which was its default profile.
    handover.roster = null;
    handover.topology = {
      extensionConnected: false,
      extensionAttachment: {
        extensionId: 'abcdefghijklmnopabcdefghijklmnop',
        extensionVersion: '0.9.95',
        installInstanceId: '4187c196-3c4b-4778-b904-a7ad83023d2e',
        normalWindowCount: 1,
        connectedAt: null,
      },
    };
    Object.defineProperty(handover, 'isConnected', { configurable: true, get() { return false; } });
    const sentAtDrop = handover.calls.length;
    const madeInTheGap = textOf(await queuedSession.call('open_tab', action({ url: 'https://example.com/now' })));
    if (loseHub) loseHub();
    await inFlight;
    const queuedText = textOf(await queuedBehind);
    check(!/older fsb-mcp-server/.test(queuedText), 'a call queued when the hub goes away is not told an older server runs the bridge');
    checkEqual(queuedText, madeInTheGap, 'it is told what any call made then is told: the extension is not connected');
    checkEqual(handover.calls.length, sentAtDrop, 'and nothing is sent while there is no hub');
    checkEqual(queuedSession.agentScope.browserSession().current, HOME, 'the session stays tied to its profile');
    handover.roster = roster();
    Object.defineProperty(handover, 'isConnected', { configurable: true, get() { return true; } });
    await queuedSession.call('read_page', {});
    checkEqual(handover.last().browser, HOME, 'and goes back there once the next hub answers');

    // A worker restart: for a moment nothing is attached, then another profile
    // attaches first.
    const gap = createBridge({ roster: roster() });
    const waiting = createSession(gap);
    await waiting.call('open_tab', action({ url: 'https://example.com', browser: HOME }));
    gap.roster = [];
    gap.isConnectedOverride = true;
    Object.defineProperty(gap, 'isConnected', { get() { return true; } });
    await waiting.call('read_page', {});
    checkEqual(gap.last().browser, HOME, 'a call made in the gap still names its own profile, so it cannot be delivered to whichever attaches first');
    checkEqual(gap.last().payload.agentId, waiting.agentScope.forBrowser(HOME).current(), 'and carries the identity the session has there');
  }

  console.log('\n=== 8. a delegated run starts in the profile that started it ===');
  {
    const { startHttpServer } = await load('http.js');
    const WORK = 'chrome-4187c196';
    const HOME = 'chrome-9a0c11d2';
    const RUN_HOME = 'delegation-home-0001';
    const RUN_CLOSED = 'delegation-closed-0002';
    const RUN_UNKNOWN = 'delegation-unknown-0003';
    const bridge = createBridge({ roster: [profile(WORK, { since: 100 }), profile(HOME, { since: 200 })] });
    bridge.topology = { mode: 'hub', extensionConnected: true, hubConnected: true, relayCount: 0, activeHubInstanceId: null, extensionAttachment: null };
    const asked = [];
    const running = await startHttpServer({
      host: '127.0.0.1',
      port: 0,
      bridge,
      queue: new TaskQueue(),
      // What the delegation supervisor answers: the browser each run was started from.
      browserForDelegation: (delegationId) => {
        asked.push(delegationId);
        if (delegationId === RUN_HOME) return HOME;
        if (delegationId === RUN_CLOSED) return 'chrome-00000000';
        return null;
      },
    });
    const rpc = (sessionId, body, headers = {}) => fetch(running.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });
    // One delegated agent: an MCP session opened with its run's id, then one tool call.
    const delegatedListTabs = async (delegationId) => {
      const initialize = await rpc(null, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'delegated-agent', version: '1' } },
      }, delegationId ? { 'x-fsb-delegation-id': delegationId } : {});
      const sessionId = initialize.headers.get('mcp-session-id');
      await initialize.json();
      await rpc(sessionId, { jsonrpc: '2.0', method: 'notifications/initialized' });
      const called = await rpc(sessionId, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_tabs', arguments: {} } });
      return (await called.json()).result;
    };
    try {
      const sentBefore = bridge.calls.length;
      await delegatedListTabs(RUN_HOME);
      const sent = bridge.calls.slice(sentBefore);
      checkEqual(asked.join(','), RUN_HOME, 'the server asks which browser a run was started from when its agent connects');
      checkEqual(sent.map((call) => `${call.type}:${call.browser}`).join(' '), `agent:register:${HOME} mcp:get-tabs:${HOME}`, 'and the agent registers and works in that profile, not the default one');
      checkEqual(sent[0].payload.delegationId, RUN_HOME, 'carrying its run\'s id to the profile that knows it');

      const beforeClosed = bridge.calls.length;
      const closed = await delegatedListTabs(RUN_CLOSED);
      checkEqual(closed.isError, true, 'a run whose profile has closed fails');
      check(/not connected/.test(closed.content[0].text) && closed.content[0].text.includes('chrome-00000000'), 'naming the profile it belongs to');
      checkEqual(bridge.calls.length, beforeClosed, 'and registers nowhere else');

      const beforeUnknown = bridge.calls.length;
      await delegatedListTabs(RUN_UNKNOWN);
      checkEqual(bridge.calls.slice(beforeUnknown).map((call) => call.browser).join(','), `${WORK},${WORK}`, 'a run the supervisor cannot place starts in the default browser, as every run did before');

      const beforePlain = asked.length;
      await delegatedListTabs(null);
      checkEqual(asked.length, beforePlain, 'a session that is not a delegated run asks nothing');

      // A provider whose MCP entry takes no headers is sent to its profile by
      // the endpoint it is given.
      const endpoint = running.endpoint;
      running.endpoint = endpointStartingIn(endpoint, HOME);
      const beforeQuery = bridge.calls.length;
      await delegatedListTabs(null);
      checkEqual(bridge.calls.slice(beforeQuery).map((call) => call.browser).join(','), `${HOME},${HOME}`, 'a session opened on an endpoint that names a browser starts there');
      running.endpoint = endpointStartingIn(endpoint, 'chrome-00000000');
      const beforeAway = bridge.calls.length;
      const away = await delegatedListTabs(null);
      check(away.isError === true && bridge.calls.length === beforeAway, 'and is refused, not moved, when that browser is not connected');
      running.endpoint = endpointStartingIn(endpoint, WORK);
      const beforeBoth = bridge.calls.length;
      await delegatedListTabs(RUN_HOME);
      checkEqual(bridge.calls.slice(beforeBoth).map((call) => call.browser).join(','), `${HOME},${HOME}`, 'a run\'s own id decides before the endpoint does');
      running.endpoint = endpoint;
    } finally {
      await running.close();
    }

    const scope = new AgentScope({ environment: { FSB_BROWSER: 'safari' } });
    scope.startIn(` ${HOME.toUpperCase()} `);
    checkEqual(scope.browserSession().configured, HOME, 'a start browser given by the host is read like FSB_BROWSER and comes before it');
    scope.forBrowser(HOME).startIn(WORK);
    checkEqual(scope.browserSession().configured, WORK, 'and belongs to the session, whichever of its scopes is told');
    scope.startIn(null);
    checkEqual(scope.browserSession().configured, 'safari', 'clearing it falls back to FSB_BROWSER');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('  FAIL: harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
});
