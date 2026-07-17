'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failed += 1;
    console.error('  FAIL:', message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

async function importBuild(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, 'mcp', 'build', relativePath)).href);
}

async function readHealth(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(1_000),
  });
  const body = await response.text();
  return {
    body,
    contentType: response.headers.get('content-type'),
    json: JSON.parse(body),
    status: response.status,
  };
}

async function runHealthSection() {
  const [{ startHttpServer }, nativeConstants, version] = await Promise.all([
    importBuild('http.js'),
    importBuild('native-host/constants.js'),
    importBuild('version.js'),
  ]);
  const bridge = {
    topology: {
      mode: 'hub',
      activeHubInstanceId: 'native-health-hub',
      extensionConnected: false,
      hubConnected: true,
      lastDisconnectReason: null,
      lastExtensionHeartbeatAt: null,
      relayCount: 0,
    },
  };
  const queue = { isRunning: false };
  const server = await startHttpServer({
    host: version.DEFAULT_HTTP_HOST,
    port: 0,
    bridge,
    queue,
  });

  try {
    const initial = await readHealth(server.healthEndpoint);
    assertEqual(initial.status, 200, 'health responds with HTTP 200');
    assert(
      initial.contentType?.startsWith('application/json'),
      'health identifies its bounded body as JSON',
    );
    assert(
      Buffer.byteLength(initial.body, 'utf8') <= nativeConstants.NATIVE_HOST_HEALTH_MAX_BYTES,
      'health body fits the native-host response cap',
    );
    assertEqual(
      initial.json.service,
      nativeConstants.NATIVE_HOST_HEALTH_PRODUCT,
      'health exposes the exact FSB product marker',
    );
    assertEqual(
      initial.json.version,
      version.FSB_MCP_VERSION,
      'health exposes the canonical MCP package version',
    );
    assert(
      typeof initial.json.version === 'string'
        && Buffer.byteLength(initial.json.version, 'utf8') > 0
        && Buffer.byteLength(initial.json.version, 'utf8') <= 64,
      'health version is non-empty and bounded',
    );
    assertEqual(
      initial.json.nativeHostProtocol,
      nativeConstants.NATIVE_HOST_PROTOCOL_VERSION,
      'health exposes the dedicated numeric native-host protocol',
    );
    assertEqual(initial.json.nativeHostProtocol, 1, 'health protocol remains exactly version 1');
    assertEqual(initial.json.serveReady, false, 'a freshly bound listener is false-by-default');
    assertEqual(initial.json.transport, 'streamable-http', 'existing transport evidence is preserved');
    assertEqual(initial.json.bridgeMode, 'hub', 'existing bridge topology evidence is preserved');
    assertEqual(initial.json.queuedMutationTools, false, 'existing queue evidence is preserved');
    assertEqual(version.DEFAULT_HTTP_HOST, '127.0.0.1', 'health stays on canonical loopback');
    assertEqual(version.DEFAULT_HTTP_PORT, 7226, 'health introduces no new serve port');
    assertEqual(typeof server.markServeReady, 'function', 'listener exposes lifecycle-only readiness authority');

    server.markServeReady();
    server.markServeReady();
    const ready = await readHealth(server.healthEndpoint);
    assertEqual(ready.json.serveReady, true, 'the readiness authority is idempotent and monotonic while open');
    assertEqual(ready.json.service, initial.json.service, 'readiness does not change product identity');
    assertEqual(ready.json.nativeHostProtocol, 1, 'readiness does not change protocol identity');
  } finally {
    await server.close();
  }
}

async function runCase(name, callback) {
  console.log(`\n${name}`);
  try {
    await callback();
  } catch (error) {
    failed += 1;
    console.error('  FAIL:', error?.stack || error);
  }
}

async function main() {
  const sectionIndex = process.argv.indexOf('--section');
  const section = sectionIndex >= 0 ? process.argv[sectionIndex + 1] : null;
  const knownSections = new Set(['health']);
  if (section && !knownSections.has(section)) {
    throw new Error(`Unknown section: ${section}`);
  }

  if (!section || section === 'health') {
    await runCase('product-specific serve health', runHealthSection);
  }

  console.log(`\nMCP native host daemon tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
