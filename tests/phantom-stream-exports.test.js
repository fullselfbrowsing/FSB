'use strict';

/**
 * PhantomStream installed export smoke.
 *
 * Phase 21 Plan 02 protects later migration phases from relying on README
 * examples alone. Every import path used by Phases 22-24 must be present and
 * non-empty in the installed package before production stream code imports it.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = '@full-self-browsing/phantom-stream';

const PACKAGE_EXPORTS = [
  {
    specifier: PACKAGE_NAME,
    exportPath: '.',
    expected: [
      'createCapture',
      'createViewer',
      'createRelay',
      'createWebSocketRelayBackend',
      'createWebSocketTransport',
      'encodeEnvelope',
      'decodeEnvelope',
      'applyMutations',
      'validateRemoteControlMessage'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/protocol',
    exportPath: './protocol',
    expected: [
      'STREAM',
      'CONTROL',
      'REMOTE_CONTROL',
      'REMOTE_CONTROL_STATE',
      'NID_ATTR',
      'RELAY_PER_MESSAGE_LIMIT_BYTES',
      'createStreamSessionId',
      'encodeEnvelope',
      'decodeEnvelope',
      'isCompressedEnvelope',
      'isCurrentStream',
      'validateRemoteControlMessage',
      'createRemoteControlStateEvent'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/capture',
    exportPath: './capture',
    expected: ['createCapture']
  },
  {
    specifier: PACKAGE_NAME + '/renderer',
    exportPath: './renderer',
    expected: [
      'createViewer',
      'applyMutations',
      'buildSnapshotHtml',
      'createOverlays',
      'computeScale',
      'mapHostPointToViewport',
      'mapRectToHost',
      'OVERLAY_CSS'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/relay',
    exportPath: './relay',
    expected: [
      'createRelay',
      'createWebSocketRelayBackend',
      'checkRelayFrameLimit',
      'classifyRelayFrame',
      'BACKPRESSURE_BUFFER_LIMIT_BYTES'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/transport/websocket',
    exportPath: './transport/websocket',
    expected: [
      'createWebSocketTransport',
      'encodeWireMessage',
      'decodeWireMessage'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/adapters/extension',
    exportPath: './adapters/extension',
    expected: [
      'createExtensionAdapter',
      'createExtensionContentBridge',
      'PHANTOMSTREAM_SESSION_KEY',
      'PHANTOMSTREAM_WATCHDOG_ALARM'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/adapters/playwright',
    exportPath: './adapters/playwright',
    expected: [
      'createPlaywrightAdapter',
      'getPlaywrightInjectSource'
    ]
  },
  {
    specifier: PACKAGE_NAME + '/adapters/bookmarklet',
    exportPath: './adapters/bookmarklet',
    expected: [
      'createBookmarkletSource',
      'createBookmarkletLoaderSource',
      'BOOKMARKLET_ERROR_EVENT'
    ]
  }
];

let passed = 0;

function ok(condition, message) {
  assert.equal(condition, true, message);
  passed++;
  console.log('  PASS:', message);
}

(async () => {
  console.log('\n--- PhantomStream installed export smoke ---');

  const repoRoot = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(repoRoot, 'node_modules', '@full-self-browsing', 'phantom-stream', 'package.json');
  const installedPkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  ok(installedPkg.name === PACKAGE_NAME, 'installed package name is ' + PACKAGE_NAME);
  ok(installedPkg.version === '0.2.1', 'installed package version is 0.2.1');
  ok(installedPkg.type === 'module', 'installed package declares type: module');

  for (const entry of PACKAGE_EXPORTS) {
    ok(Boolean(installedPkg.exports && installedPkg.exports[entry.exportPath]),
      'package.json exports ' + entry.exportPath);

    const mod = await import(entry.specifier);
    const keys = Object.keys(mod).sort();
    ok(keys.length > 0, entry.specifier + ' has non-empty runtime exports');

    for (const key of entry.expected) {
      ok(Object.prototype.hasOwnProperty.call(mod, key),
        entry.specifier + ' exports ' + key);
    }

    for (const key of entry.expected) {
      const value = mod[key];
      const expectedConstant = /^[A-Z0-9_]+$/.test(key);
      ok(expectedConstant || typeof value === 'function',
        entry.specifier + ' export ' + key + ' is a callable function or named constant');
    }
  }

  const extensionSurface = await import(PACKAGE_NAME + '/adapters/extension');
  ok(typeof extensionSurface.createExtensionAdapter === 'function',
    'extension adapter imports without CommonJS or Chrome globals at module evaluation time');

  const captureSurface = await import(PACKAGE_NAME + '/capture');
  ok(typeof captureSurface.createCapture === 'function',
    'capture surface imports without browser globals at module evaluation time');

  const rendererSurface = await import(PACKAGE_NAME + '/renderer');
  ok(typeof rendererSurface.createViewer === 'function',
    'renderer surface imports without browser globals at module evaluation time');

  const transportSurface = await import(PACKAGE_NAME + '/transport/websocket');
  ok(typeof transportSurface.createWebSocketTransport === 'function',
    'WebSocket transport imports without browser globals at module evaluation time');

  console.log('\nPhantomStream export smoke: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

module.exports = {
  PACKAGE_EXPORTS
};
