'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let tabUrl = 'https://example.test/uat';
global.chrome = {
  storage: {
    local: { get(_key, callback) { callback({}); } },
    onChanged: { addListener() {} },
  },
  tabs: {
    async get(tabId) { return { id: tabId, url: tabUrl, title: 'Fixture' }; },
    async query() { return [{ id: 55, url: tabUrl }]; },
  },
};
global.resolveAgentTabOrError = async () => ({ tabId: 55, ownershipToken: null, skipGate: true });

const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');

test('dedicated screenshot route preserves native bytes but records metadata only', async () => {
  let recorded = null;
  let engineCalls = 0;
  global.fsbMcpSessionRecorder = {
    recordDispatch(entry) { recorded = entry; },
  };
  global.FsbScreenshotCapture = {
    async capture(params, tabId) {
      engineCalls += 1;
      assert.equal(tabId, 55);
      assert.equal(params.mode, 'viewport');
      return {
        success: true,
        image_data: 'iVBORw0KGgo=',
        mime_type: 'image/png',
        metadata: {
          capture_id: 'capture-route', output_width: 10, output_height: 10,
          byte_length: 12, duration_ms: 8, delivery_status: 'captured', warnings: [],
          source_url: 'https://example.test/private/path',
          sha256: 'private-diagnostic-hash',
          css_rect: { x: 0, y: 0, width: 10, height: 10 },
        },
      };
    },
  };

  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:capture-screenshot',
    payload: { mode: 'viewport', agentId: 'agent-1' },
  });
  assert.equal(result.success, true);
  assert.equal(result.image_data, 'iVBORw0KGgo=');
  assert.equal(engineCalls, 1);
  assert.ok(recorded);
  assert.equal(recorded.response.image_data, undefined);
  assert.deepEqual(recorded.response.metadata, {
    capture_id: 'capture-route',
    output_width: 10,
    output_height: 10,
    byte_length: 12,
    duration_ms: 8,
    delivery_status: 'captured',
  });
  assert.equal(JSON.stringify(recorded).includes('iVBORw0KGgo='), false);
  assert.equal(JSON.stringify(recorded).includes('/private/path'), false);
  assert.equal(JSON.stringify(recorded).includes('private-diagnostic-hash'), false);
});

test('restricted pages reject before compositor capture', async () => {
  tabUrl = 'chrome://settings/';
  let called = false;
  global.FsbScreenshotCapture = { async capture() { called = true; return { success: true }; } };
  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:capture-screenshot',
    payload: { agentId: 'agent-1' },
  });
  assert.equal(result.errorCode, 'restricted_active_tab');
  assert.equal(called, false);
  tabUrl = 'https://example.test/uat';
});

test('resolved explicit targets retain the ownership gate', async () => {
  global.resolveAgentTabOrError = async () => ({ tabId: 55, ownershipToken: null, skipGate: false });
  global.fsbAgentRegistryInstance = {
    hasAgent: () => true,
    isOwnedBy: () => false,
    getOwner: () => 'agent-other',
    getTabMetadata: () => ({ windowId: 1, incognito: false }),
    getAgentWindowId: () => 1,
  };
  let called = false;
  global.FsbScreenshotCapture = { async capture() { called = true; return { success: true }; } };
  const result = await dispatcher.dispatchMcpMessageRoute({
    type: 'mcp:capture-screenshot',
    payload: { agentId: 'agent-1', tab_id: 55, ownershipToken: 'wrong' },
  });
  assert.equal(result.code, 'TAB_NOT_OWNED');
  assert.equal(result.ownerAgentId, 'agent-other');
  assert.equal(called, false);
  delete global.fsbAgentRegistryInstance;
  global.resolveAgentTabOrError = async () => ({ tabId: 55, ownershipToken: null, skipGate: true });
});
