'use strict';

/**
 * The visual-session tick never holds an action.
 *
 * Runs the real _handleExecuteAction and _clearVisualSessionIfFinal bodies
 * from extension/ws/mcp-bridge-client.js against a stub client whose
 * _recordVisualSessionTickIfPresent stays pending until the test releases it
 * (as it does for up to 750 ms on a tab without a content script).
 *
 * Covers: a resolved-tab action is dispatched and answered while the tick is
 * still pending; open_tab and the navigate bootstrap answer while their tick
 * is pending; a rejected tick never breaks the action; with is_final the
 * clear still runs only after the tick has finished.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');
const definitions = require(path.join(ROOT, 'extension', 'ai', 'tool-definitions.js'));

function extractMethod(name) {
  const start = source.indexOf(`\n  async ${name}(`);
  if (start < 0) throw new Error(`${name} not found in mcp-bridge-client.js`);
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`${name} has no closing brace`);
  return source.slice(start + 1, end + 4);
}

const unhandled = [];
process.on('unhandledRejection', (reason) => { unhandled.push(reason); });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Resolves to 'timeout' when `promise` has not settled within `ms`.
function within(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))]);
}

function setup({ resolver = { success: true, tabId: 42 }, tick } = {}) {
  const events = [];
  const context = {
    getToolByNameOrVerb: definitions.getToolByNameOrVerb,
    MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS: new Set(['open_tab', 'close_tab']),
    wrapWithChangeReport: async ({ execute }) => execute(),
    resolveAgentTabOrError: async () => resolver,
    MCPVisualSessionLifecycleUtils: {
      async clearVisualSession(tabId, options) {
        events.push(`clear:${tabId}:${options && options.reason}`);
        return { ok: true };
      },
    },
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  const methods = vm.runInNewContext(
    `({${extractMethod('_handleExecuteAction')},\n${extractMethod('_clearVisualSessionIfFinal')}})`,
    context
  );
  const client = {
    _clearVisualSessionIfFinal: methods._clearVisualSessionIfFinal,
    _recordVisualSessionTickIfPresent(tabId) {
      events.push(`tick-start:${tabId}`);
      return tick();
    },
    async _resolveMcpSessionRecordTarget() { return null; },
    _recordMcpSessionAction() {},
    async _sendToContentScript(tabId, message) {
      events.push(`dispatch:${tabId}:${message.tool}`);
      return { success: true };
    },
    async _handleExecuteBackground(tab, payload) {
      events.push(`background:${payload.tool}`);
      return { success: true, tabId: 77, url: 'https://example.com/' };
    },
  };
  const run = (payload) => methods._handleExecuteAction.call(client, payload);
  return { run, events };
}

const sidecar = (isFinal = false) => ({ visualReason: 'Clicking the button', client: 'Claude', isFinal });

async function main() {
  console.log('\n--- a resolved-tab action does not wait for the tick ---');
  {
    const gate = deferred();
    const { run, events } = setup({ tick: () => gate.promise });
    const result = await within(run({ tool: 'click', params: { selector: '#go' }, agentId: 'agent_a', visualSession: sidecar() }), 200);
    check(result !== 'timeout' && result.success === true, 'click answers while the tick is still pending');
    check(events.indexOf('tick-start:42') === 0, 'the tick is started first');
    check(events.includes('dispatch:42:click'), 'the click reaches the content script while the tick is pending');
    gate.resolve();
  }

  console.log('\n--- open_tab and the navigate bootstrap do not wait for the tick ---');
  {
    const gate = deferred();
    const { run, events } = setup({ tick: () => gate.promise });
    const result = await within(run({ tool: 'open_tab', params: { url: 'https://example.com/' }, agentId: 'agent_a', visualSession: sidecar() }), 200);
    check(result !== 'timeout' && result.success === true && result.tabId === 77, 'open_tab answers while the tick is still pending');
    check(events.includes('tick-start:77'), 'open_tab still starts the tick on the new tab');
    gate.resolve();
  }
  {
    const gate = deferred();
    const { run, events } = setup({ resolver: { success: false, code: 'NO_OWNED_TAB' }, tick: () => gate.promise });
    const result = await within(run({ tool: 'navigate', params: { url: 'https://example.com/' }, agentId: 'agent_a', visualSession: sidecar() }), 200);
    check(result !== 'timeout' && result.success === true, 'the navigate bootstrap answers while the tick is still pending');
    check(events.includes('tick-start:77'), 'the navigate bootstrap still starts the tick');
    gate.resolve();
  }

  console.log('\n--- a failing tick never breaks the action ---');
  {
    const { run } = setup({ tick: () => Promise.reject(new Error('storage unavailable')) });
    const result = await run({ tool: 'click', params: { selector: '#go' }, agentId: 'agent_a', visualSession: sidecar(true) });
    check(result.success === true, 'click succeeds when the tick rejects, even with is_final');
    const opened = await run({ tool: 'open_tab', params: { url: 'https://example.com/' }, agentId: 'agent_a', visualSession: sidecar() });
    check(opened.success === true, 'open_tab succeeds when the tick rejects');
    await new Promise((resolve) => setImmediate(resolve));
    check(unhandled.length === 0, 'a rejected tick is never left unhandled');
  }

  console.log('\n--- is_final clears only after the tick finishes ---');
  {
    const gate = deferred();
    const { run, events } = setup({
      tick: () => gate.promise.then(() => { events.push('tick-done'); }),
    });
    const pending = run({ tool: 'click', params: { selector: '#go' }, agentId: 'agent_a', visualSession: sidecar(true) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    check(events.includes('dispatch:42:click'), 'the final click is dispatched while the tick is pending');
    check(!events.some((event) => event.startsWith('clear:')), 'the clear waits for the pending tick');
    gate.resolve();
    const result = await within(pending, 200);
    check(result !== 'timeout' && result.success === true, 'the final click answers once the tick finishes');
    check(events.indexOf('tick-done') >= 0 && events.indexOf('tick-done') < events.indexOf('clear:42:is_final'),
      'the is_final clear lands after the tick');
  }
  {
    const gate = deferred();
    const { run, events } = setup({ tick: () => gate.promise });
    const result = await within(run({ tool: 'click', params: { selector: '#go' }, agentId: 'agent_a', visualSession: sidecar(false) }), 200);
    check(result !== 'timeout' && !events.some((event) => event.startsWith('clear:')),
      'without is_final nothing waits for the tick and nothing is cleared');
    gate.resolve();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  failed++;
  console.error('  FAIL: harness error:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
