'use strict';

/**
 * read_page and get_dom_snapshot arguments reach the content script.
 *
 * The content script's readPage case reads its flags from request.params
 * (request.params.full, request.params.flags.full), and its getDOM case
 * builds the snapshot from request.options (options.maxElements). This test
 * runs the real _handleReadPage / _handleGetDOM bodies from
 * extension/ws/mcp-bridge-client.js against a stub client, captures the
 * message each one hands to _sendToContentScript, and checks that the
 * caller's values sit where the content script looks for them.
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

const BRIDGE_PATH = path.join(__dirname, '..', 'extension', 'ws', 'mcp-bridge-client.js');
const source = fs.readFileSync(BRIDGE_PATH, 'utf8');

// A class method starts at two-space indent and ends at the first line that
// is a bare two-space closing brace.
function extractMethod(name) {
  const start = source.indexOf(`\n  async ${name}(`);
  if (start < 0) throw new Error(`${name} not found in mcp-bridge-client.js`);
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`${name} has no closing brace`);
  return source.slice(start + 1, end + 4);
}

function loadHandler(name) {
  const context = {
    resolveAgentTabOrError: async () => ({ success: true, tabId: 7 }),
  };
  context.globalThis = context;
  return vm.runInNewContext(`({${extractMethod(name)}})`, context)[name];
}

function stubClient() {
  const sent = [];
  return {
    sent,
    async _sendToContentScript(tabId, message) {
      sent.push({ tabId, message });
      return { success: true };
    },
  };
}

// The same lookups the content script performs on the incoming request.
function contentReadPageFull(request) {
  return request.params?.flags?.full || request.params?.full || false;
}
function contentDomMaxElements(request) {
  const { maxElements = 50 } = { ...request.options };
  return maxElements;
}

async function run() {
  console.log('\n--- read_page full ---');
  const readPage = loadHandler('_handleReadPage');
  {
    const client = stubClient();
    await readPage.call(client, { agentId: 'agent_a', full: true });
    const { tabId, message } = client.sent[0];
    check(tabId === 7, 'readPage targets the resolved tab');
    check(message.action === 'readPage', "action is 'readPage'");
    check(message.params && message.params.full === true, 'params.full carries full: true');
    check(contentReadPageFull(message) === true, 'the content lookup sees full: true');
  }
  {
    const client = stubClient();
    await readPage.call(client, { agentId: 'agent_a' });
    const { message } = client.sent[0];
    check(message.params && message.params.full === false, 'params.full defaults to false');
    check(contentReadPageFull(message) === false, 'the content lookup sees the viewport default');
  }

  console.log('\n--- get_dom_snapshot maxElements ---');
  const getDOM = loadHandler('_handleGetDOM');
  {
    const client = stubClient();
    await getDOM.call(client, { agentId: 'agent_a', maxElements: 120 });
    const { tabId, message } = client.sent[0];
    check(tabId === 7, 'getDOM targets the resolved tab');
    check(message.action === 'getDOM', "action is 'getDOM'");
    check(message.options && message.options.maxElements === 120, 'options.maxElements carries 120');
    check(contentDomMaxElements(message) === 120, 'the content snapshot options see maxElements 120');
  }
  {
    const client = stubClient();
    await getDOM.call(client, { agentId: 'agent_a' });
    const { message } = client.sent[0];
    check(message.options && message.options.maxElements === 50, 'options.maxElements defaults to 50');
    check(contentDomMaxElements(message) === 50, 'the content snapshot options see the default 50');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: harness error:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
