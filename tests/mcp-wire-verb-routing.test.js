'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const definitions = require('../extension/ai/tool-definitions.js');
const bridgeSource = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-bridge-client.js'), 'utf8');
const start = bridgeSource.indexOf('  async _handleExecuteAction(payload) {');
const end = bridgeSource.indexOf('\n  /**\n   * Handle background-routed tools directly', start);
assert(start >= 0 && end > start);
const method = bridgeSource.slice(start, end);

test('every manual wire verb resolves to its public registry definition', () => {
  for (const tool of definitions.TOOL_REGISTRY.filter((entry) => entry._readOnly === false)) {
    const verb = tool._contentVerb || tool._cdpVerb || tool.name;
    assert.equal(definitions.getToolByNameOrVerb(tool.name), tool, tool.name);
    assert.equal(definitions.getToolByNameOrVerb(verb), tool, `${tool.name} via ${verb}`);
  }
  assert.equal(definitions.getToolByNameOrVerb('cdpDoesNotExist'), null);
});

test('real bridge action method dispatches CDP verbs and rejects unknown verbs', async () => {
  const calls = [];
  const context = {
    getToolByNameOrVerb: definitions.getToolByNameOrVerb,
    MCP_DISPATCHER_SYNTHETIC_CHANGE_REPORT_TOOLS: new Set(),
    wrapWithChangeReport: async ({ execute }) => execute(),
    executeCDPToolDirect: async (request, tabId) => {
      calls.push({ request, tabId });
      return { success: true };
    },
    resolveAgentTabOrError: async () => ({ success: true, tabId: 42 }),
  };
  context.globalThis = context;
  const handler = vm.runInNewContext(`({${method}})._handleExecuteAction`, context);
  const client = {
    _recordVisualSessionTickIfPresent: async () => {},
    _resolveMcpSessionRecordTarget: async () => null,
    _recordMcpSessionAction() {},
    _clearVisualSessionIfFinal: async () => {},
    _sendToContentScript: async () => { throw new Error('CDP verb went to content script'); },
  };

  assert.equal((await handler.call(client, { tool: 'cdpInsertText', params: { text: 'hello' } })).success, true);
  assert.equal(calls[0].request.tool, 'cdpInsertText');
  assert.equal(calls[0].tabId, 42);
  assert.equal((await handler.call(client, { tool: 'cdpDoubleClickAt', params: { x: 1, y: 2 } })).success, true);
  assert.equal(calls[1].request.tool, 'cdpDoubleClickAt');
  const unknown = await handler.call(client, { tool: 'cdpDoesNotExist', params: {} });
  assert.equal(unknown.errorCode, 'mcp_route_unavailable');
  assert.equal(calls.length, 2);
});
