'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const attachment = {
  extensionId: 'a'.repeat(32),
  extensionVersion: '0.9.91',
  installInstanceId: 'install-fixture',
  normalWindowCount: 2,
  connectedAt: '2026-09-29T00:00:00.000Z'
};

async function modules() {
  return import('../mcp/build/diagnostics.js');
}

test('doctor classifies a connected extension with zero normal windows', async () => {
  const diagnostics = await modules();
  const snapshot = diagnostics.applyDiagnosticClassification({
    versionParityOk: true,
    extensionConnected: true,
    bridgeMode: 'relay',
    hubConnected: true,
    extensionAttachment: { ...attachment, normalWindowCount: 0 },
    probeNotes: [],
    activeTab: { url: '', restricted: true, pageType: 'No active tab' },
    contentScript: { ready: false }
  });
  assert.equal(snapshot.diagnosticLayer, 'no_browser_window');
  assert.equal(snapshot.diagnosticCode, 'NO_BROWSER_WINDOW');
  assert.equal(snapshot.extensionAttachment.normalWindowCount, 0);
});

test('origin pin mismatch gives pair reset guidance', async () => {
  const diagnostics = await modules();
  const snapshot = diagnostics.applyDiagnosticClassification({
    versionParityOk: true,
    extensionConnected: false,
    bridgeMode: 'hub',
    hubConnected: true,
    lastDisconnectReason: 'extension_origin_pin_mismatch',
    probeNotes: []
  });
  assert.equal(snapshot.diagnosticLayer, 'auth');
  assert.equal(snapshot.diagnosticCode, 'ORIGIN_PIN_MISMATCH');
  assert.match(snapshot.nextAction, /pair --reset/);
});

for (const mode of ['hub', 'relay']) {
  test(`${mode} diagnostics use the diagnostic route for accurate tab counts`, async () => {
    const diagnostics = await modules();
    const calls = [];
    const topology = {
      instanceId: `fixture-${mode}`, mode, hubConnected: true, extensionConnected: true,
      relayCount: mode === 'hub' ? 1 : 0, pendingRequestCount: 0,
      activeHubInstanceId: 'fixture-hub', lastExtensionHeartbeatAt: Date.now(),
      lastDisconnectReason: null, extensionAttachment: attachment
    };
    const bridge = {
      topology, isConnected: true, async connect() {}, disconnect() {},
      async sendAndWait(message) {
        calls.push(message.type);
        return { success: true,
          activeTab: { id: 5, url: 'https://example.com', windowId: 1, restricted: false, pageType: 'Web page' },
          contentScript: { ready: true, portConnected: true },
          tabsSummary: { totalTabs: 7, activeTabId: 5 }, attachment };
      }
    };
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0, includeConfig: false, includeTabs: true },
      { bridgeFactory: () => bridge, readBridgeAuthState: () => null }
    );
    assert.deepEqual(calls, ['mcp:get-diagnostics']);
    assert.equal(snapshot.tabsSummary.totalTabs, 7);
    assert.equal(snapshot.extensionAttachment.installInstanceId, attachment.installInstanceId);
    assert.equal(snapshot.extensionAttachment.extensionId, 'a'.repeat(32));
  });
}
