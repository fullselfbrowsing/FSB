'use strict';

/**
 * The change-report settle wait after an action is shortened only where
 * nothing is happening, and never at the cost of a mutation:
 *
 *   - execute_js: when the harvest has recorded no mutation, the URL is
 *     unchanged and the tab is not loading, the wait ends 150 ms after the
 *     script instead of waiting for the 300 ms quiet window or the 500 ms
 *     safety net. Any recorded mutation keeps the old wait.
 *   - click and type_text: when the content script reports pageStable (its
 *     own stability wait after acting saw the page settle), the service
 *     worker takes the report without waiting again. Without that report
 *     (wait timed out, skipped, or an older content script) it waits as
 *     before.
 *   - press_enter, select_option, check_box and the other flagged tools keep
 *     the old wait whatever their result says.
 *
 * The page side runs the real harvest start / stop / peek functions, sliced
 * from extension/ws/mcp-tool-dispatcher.js, against a small DOM stand-in. The
 * in-page stability waiter is replaced by a promise the test controls; a
 * waiter that never answers models a hidden tab, whose page timers Chrome
 * throttles, so only the service-worker timers can end the wait.
 *
 * Run: node tests/change-report-settle-shortcuts.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DISPATCHER_PATH = path.join(ROOT, 'extension', 'ws', 'mcp-tool-dispatcher.js');
const BRIDGE_PATH = path.join(ROOT, 'extension', 'ws', 'mcp-bridge-client.js');
const ACTIONS_PATH = path.join(ROOT, 'extension', 'content', 'actions.js');
const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');

let passed = 0;
let failed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

function slice(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `slice ${startMarker}`);
  return text.slice(start, end);
}

const PAGE_FUNCTIONS = [
  slice(dispatcherSrc, 'function _fsbHarvestStartInPage(', '\n// Page-context harvest stop'),
  slice(dispatcherSrc, 'function _fsbHarvestStopInPage(', '\n// Wait for DOM-stable'),
  slice(dispatcherSrc, 'function _fsbHarvestPeekInPage(', '\nasync function _safeGetTab(')
].join('\n');

const PAGE_URL = 'https://example.com/list';

function domNode(tagName, id, text) {
  return {
    tagName,
    className: '',
    textContent: text || '',
    offsetWidth: 10,
    parentElement: null,
    getAttribute(name) { return name === 'id' ? id : null; }
  };
}

function makePage() {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
  }
  const window = { location: { href: PAGE_URL } };
  const document = {
    documentElement: domNode('HTML', null),
    body: domNode('BODY', null),
    title: 'List',
    activeElement: null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const context = {
    window,
    document,
    MutationObserver: FakeMutationObserver,
    Date,
    String,
    setTimeout: () => ({}),
    clearTimeout() {}
  };
  const page = vm.runInNewContext(
    `${PAGE_FUNCTIONS}\n({ start: _fsbHarvestStartInPage, stop: _fsbHarvestStopInPage, peek: _fsbHarvestPeekInPage })`,
    context
  );
  // Deliver one childList record to the live harvest observer.
  page.addRow = (id) => {
    const observer = observers[observers.length - 1];
    observer.callback([{
      type: 'childList',
      attributeName: null,
      oldValue: null,
      target: domNode('UL', 'rows'),
      addedNodes: [domNode('LI', id, 'Row ' + id)],
      removedNodes: []
    }]);
  };
  page.window = window;
  return page;
}

// Fresh dispatcher per scenario, with chrome.* routed to the fake page.
function setup(options) {
  const opts = options || {};
  const page = makePage();
  const calls = [];
  const tab = { status: 'complete', pendingUrl: undefined, ...(opts.tab || {}) };
  global.chrome = {
    tabs: {
      get: async (id) => ({ id, url: page.window.location.href, status: tab.status, pendingUrl: tab.pendingUrl })
    },
    scripting: {
      executeScript: async (injection) => {
        const name = injection.func.name;
        calls.push(name);
        if (name === '_fsbHarvestStartInPage') return [{ result: page.start(...injection.args) }];
        if (name === '_fsbHarvestStopInPage') return [{ result: page.stop(...injection.args) }];
        if (name === '_fsbHarvestPeekInPage') return [{ result: page.peek(...injection.args) }];
        if (name === '_fsbWaitStableInPage') {
          if (typeof opts.waitStableMs === 'number') {
            await new Promise((resolve) => setTimeout(resolve, opts.waitStableMs));
            return [{ result: true }];
          }
          return new Promise(() => {}); // a hidden tab: the in-page waiter never answers in time
        }
        throw new Error('unexpected injection ' + name);
      }
    },
    storage: { local: { get: (key, cb) => cb({}) }, onChanged: { addListener: () => {} } }
  };
  for (const rel of ['../extension/ws/mcp-tool-dispatcher.js', '../extension/utils/action-verification.js', '../extension/ai/tool-definitions.js']) {
    delete require.cache[require.resolve(rel)];
  }
  const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');
  dispatcher._setChangeReportsEnabledForTest(true);
  return { page, calls, tab, dispatcher };
}

async function act(env, toolName, execute, params) {
  const startedAt = Date.now();
  const response = await env.dispatcher.wrapWithChangeReport({
    toolName,
    tabId: 7,
    params: params || {},
    execute
  });
  return { response, elapsed: Date.now() - startedAt };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('--- execute_js: early end when nothing is recorded ---');
  {
    const env = setup();
    const { response, elapsed } = await act(env, 'execute_js', async () => ({ success: true, result: '3', tool: 'execute_js' }));
    const cr = response.change_report;
    check(env.calls.includes('_fsbHarvestPeekInPage'), 'zero mutations: the harvest was peeked after 150 ms');
    check(elapsed >= 140 && elapsed < 400, `zero mutations in a hidden tab: settled in ${elapsed} ms (was the 500 ms safety net)`);
    check(cr && cr.mutation_count === 0 && cr.partial !== true, 'the report records nothing and is not partial');
    check(response.success === true && response.result === '3', 'the script result is unchanged');
  }

  console.log('\n--- execute_js: any recorded mutation keeps the old wait ---');
  {
    const env = setup();
    const { response, elapsed } = await act(env, 'execute_js', async () => {
      env.page.addRow('r1');
      return { success: true, result: 'undefined', tool: 'execute_js' };
    });
    const cr = response.change_report;
    check(elapsed >= 480, `a mutation during the script: waited for the safety net (${elapsed} ms)`);
    check(cr && cr.partial === true, 'the safety net still marks the report partial');
    check(cr && cr.mutation_count === 1 && cr.nodes_added.length === 1 && cr.nodes_added[0].selector === '#r1',
      'the report contains the mutation');
  }
  {
    const env = setup();
    let lateTimer = null;
    const { response, elapsed } = await act(env, 'execute_js', async () => {
      lateTimer = setTimeout(() => env.page.addRow('late'), 60);
      return { success: true, result: 'undefined', tool: 'execute_js' };
    });
    clearTimeout(lateTimer);
    const cr = response.change_report;
    check(elapsed >= 480, `a mutation 60 ms after the script: no early end (${elapsed} ms)`);
    check(cr && cr.nodes_added.some((n) => n.selector === '#late'), 'the late mutation is in the report');
  }
  {
    const env = setup();
    let lateTimer = null;
    const { response } = await act(env, 'execute_js', async () => {
      lateTimer = setTimeout(() => env.page.addRow('after-quiet'), 300);
      return { success: true, result: 'undefined', tool: 'execute_js' };
    });
    await sleep(320);
    clearTimeout(lateTimer);
    const cr = response.change_report;
    check(cr && cr.mutation_count === 0, 'a mutation after the report was taken is not in it (report reflects the moment it was taken)');
  }

  console.log('\n--- execute_js: URL change or a loading tab keeps the old wait ---');
  {
    const env = setup();
    const { elapsed } = await act(env, 'execute_js', async () => {
      env.page.window.location.href = PAGE_URL + '#step-2';
      return { success: true, result: 'undefined', tool: 'execute_js' };
    });
    check(elapsed >= 480, `same-document URL change without a mutation: no early end (${elapsed} ms)`);
  }
  {
    const env = setup({ tab: { status: 'loading' } });
    const { elapsed } = await act(env, 'execute_js', async () => ({ success: true, result: 'undefined', tool: 'execute_js' }));
    check(elapsed >= 480, `tab loading a new document: no early end (${elapsed} ms)`);
  }
  {
    const env = setup({ tab: { pendingUrl: 'https://example.com/next' } });
    const { elapsed } = await act(env, 'execute_js', async () => ({ success: true, result: 'undefined', tool: 'execute_js' }));
    check(elapsed >= 480, `tab with a pending navigation: no early end (${elapsed} ms)`);
  }
  {
    const env = setup({ waitStableMs: 20 });
    const { response, elapsed } = await act(env, 'execute_js', async () => ({ success: true, result: 'undefined', tool: 'execute_js' }));
    check(elapsed < 140 && !env.calls.includes('_fsbHarvestPeekInPage'),
      `a waiter that answers first still ends the wait (${elapsed} ms, no peek)`);
    check(response.change_report && response.change_report.partial !== true, 'that report is not partial');
  }

  console.log('\n--- click and type_text: no second wait after a stable content wait ---');
  for (const [verb, label] of [['click', 'click'], ['type', 'type_text']]) {
    const env = setup();
    const { response, elapsed } = await act(env, verb, async () => {
      env.page.addRow(verb + '-row');
      return { success: true, hadEffect: true, pageStable: true, tool: verb };
    }, { selector: '#go' });
    check(JSON.stringify(env.calls) === JSON.stringify(['_fsbHarvestStartInPage', '_fsbHarvestStopInPage']),
      `${label} with pageStable: start then stop, no waiter injection (got ${env.calls.join(', ')})`);
    check(elapsed < 100, `${label} with pageStable: report taken at once (${elapsed} ms)`);
    const cr = response.change_report;
    check(cr && cr.mutation_count === 1 && cr.nodes_added[0].selector === '#' + verb + '-row' && cr.partial !== true,
      `${label}: the report holds every mutation seen up to the stop`);
  }
  {
    const env = setup();
    const { response } = await act(env, 'click', async () => ({
      success: false, outcome: 'unknown', mayHaveExecuted: true, hadEffect: false, pageStable: true, tool: 'click'
    }), { selector: '#go' });
    check(!env.calls.includes('_fsbWaitStableInPage') && response.change_report,
      'click that reported no effect after a stable wait: no second wait, report still attached for the recorder');
  }
  for (const [label, result] of [
    ['pageStable false (content wait timed out)', { success: true, pageStable: false, tool: 'click' }],
    ['no pageStable (wait skipped or older content script)', { success: true, tool: 'click' }]
  ]) {
    const env = setup();
    const { elapsed } = await act(env, 'click', async () => result, { selector: '#go' });
    check(env.calls.includes('_fsbWaitStableInPage') && elapsed >= 480, `click with ${label}: the settle wait runs (${elapsed} ms)`);
  }

  console.log('\n--- press_enter, select_option, check_box keep the old wait ---');
  for (const [verb, label] of [['pressEnter', 'press_enter'], ['selectOption', 'select_option'], ['toggleCheckbox', 'check_box'], ['keyPress', 'press_key']]) {
    const env = setup();
    const { response, elapsed } = await act(env, verb, async () => ({ success: true, pageStable: true, tool: verb }), { selector: '#f' });
    check(env.calls.includes('_fsbWaitStableInPage') && !env.calls.includes('_fsbHarvestPeekInPage') && elapsed >= 480,
      `${label}: waits for the waiter or the safety net even with pageStable (${elapsed} ms)`);
    check(response.change_report && response.change_report.partial === true, `${label}: the safety net still marks partial`);
  }

  console.log('\n--- the wire leaves pageStable out ---');
  {
    const bridgeSrc = fs.readFileSync(BRIDGE_PATH, 'utf8');
    const method = slice(bridgeSrc, '  _actionResultForWire(result) {', '\n  _sendError(');
    const av = require('../extension/utils/action-verification.js');
    const shaper = vm.runInNewContext(`({${method}})`, { isEmptyChangeReport: av.isEmptyChangeReport, Object });
    const result = { success: true, clicked: '#go', pageStable: true, hadEffect: true };
    const wire = shaper._actionResultForWire(result);
    check(!Object.prototype.hasOwnProperty.call(wire, 'pageStable') && wire.clicked === '#go' && wire.hadEffect === true,
      'pageStable is not sent; the other fields are');
    check(result.pageStable === true, 'the recorded result object still has it');
    const plainResult = { success: true, tool: 'navigate' };
    check(shaper._actionResultForWire(plainResult) === plainResult, 'a result with nothing to drop is passed through as is');
  }

  console.log('\n--- content script: click reports its own stability wait ---');
  {
    const actionsSrc = fs.readFileSync(ACTIONS_PATH, 'utf8');
    const clickBody = slice(actionsSrc, '  click: async (params) => {', '  // Click on search result links');
    async function runClick(stability, classifyJevRisk = () => null) {
      const element = {
        tagName: 'BUTTON', type: undefined, isConnected: true, textContent: 'Save', innerText: 'Save',
        classList: { contains: () => false },
        getAttribute: () => null,
        closest: () => null,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 10 }),
        dispatchEvent: () => true
      };
      const context = {
        window: { screenX: 0, screenY: 0, location: { href: PAGE_URL } },
        document: { querySelector: () => null },
        MouseEvent: function MouseEvent(type, init) { this.type = type; this.init = init; },
        FSB: {
          querySelectorWithShadow: () => element,
          isCanvasBasedEditor: () => false,
          smartEnsureReady: async () => ({ ready: true, scrolled: false }),
          elementCache: new Map(),
          sessionId: null,
          classifyJevRisk
        },
        actionRecorder: { record() {} },
        logger: { logActionExecution() {} },
        captureActionState: () => ({ url: PAGE_URL }),
        verifyActionEffect: () => ({ verified: true, changes: { contentChanged: true }, reason: 'Content changed', localChanges: [], confidence: 'high', whatChanged: 'Content changed' }),
        captureElementDetails: () => ({}),
        diagnoseElementFailure: () => ({}),
        buildFailureReport: (tool, sel, el, error) => ({ success: false, error }),
        generateDiagnostic: () => ({}),
        clickAtCoordinates: async () => ({ success: false }),
        waitForPageStability: async () => stability
      };
      const tools = vm.runInNewContext(`({${clickBody}})`, context);
      return tools.click({ selector: '#save' });
    }
    const stable = await runClick({ stable: true, timedOut: false });
    check(stable.success === true && stable.pageStable === true, 'stable content wait: pageStable true');
    const timedOut = await runClick({ stable: false, timedOut: true });
    check(timedOut.success === true && timedOut.pageStable === false, 'timed-out content wait: pageStable false');
    const errored = await runClick({ stable: false, timedOut: false, reason: 'error' });
    check(errored.pageStable === false, 'a stability wait that failed: pageStable false');
    const risky = await runClick({ stable: true, timedOut: false }, () => 'form_submit');
    check(risky.success === true && risky.pageStable === false, 'a commit-class target keeps the service-worker wait even when the page settled');
    const unclassifiable = await runClick({ stable: true, timedOut: false }, undefined);
    check(unclassifiable.pageStable === true, 'default stub: a safe target settles early');
    const noClassifier = await runClick({ stable: true, timedOut: false }, null);
    check(noClassifier.pageStable === false, 'without the risk classifier the click keeps the service-worker wait');
    const throwing = await runClick({ stable: true, timedOut: false }, () => { throw new Error('boom'); });
    check(throwing.pageStable === false, 'a classifier error keeps the service-worker wait');

    const typeBody = slice(actionsSrc, '  type: async (params) => {', '  pressEnter: async (params) => {');
    const typeWait = typeBody.indexOf('const typeStability = await waitForPageStability(');
    const typeFlag = typeBody.indexOf("const pageStable = !!(typeStability && typeStability.stable === true) && !params.pressEnter;");
    const typeReturn = typeBody.indexOf('        pageStable,\n', typeFlag);
    check(typeWait > 0 && typeFlag > typeWait && typeReturn > typeFlag,
      'type_text: pageStable comes from the stability wait on the input path, and is false when Enter was pressed');
    check((typeBody.match(/pageStable/g) || []).length === 2,
      'type_text: only that input path reports pageStable (contenteditable, editor and recipient paths keep the service-worker wait)');
    const navReturn = slice(clickBody, "method: 'direct-navigation'", '}');
    check(!/pageStable/.test(navReturn), 'click that navigates directly (no content wait) does not report pageStable');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('  FAIL: change-report-settle-shortcuts threw:', err && err.stack ? err.stack : err);
  process.exit(1);
});
