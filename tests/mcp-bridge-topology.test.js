'use strict';

const net = require('node:net');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const WebSocket = require(path.join(repoRoot, 'mcp', 'node_modules', 'ws'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Unable to allocate free port'));
      });
    });
    server.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs = 1000, intervalMs = 10) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (predicate()) return true;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms${lastError ? ` (${lastError.message})` : ''}`);
}

function createExtensionSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`extension socket did not open on ${port}`));
    }, 500);

    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function attemptRelayWithOrigin(port, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Origin: origin }
    });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`relay attempt from ${origin} was not closed`));
    }, 500);

    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'relay:hello', instanceId: 'browser-relay' }));
    });
    socket.once('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function loadBridgeClass() {
  const bridgeUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge.js')).href;
  const module = await import(bridgeUrl);
  return module.WebSocketBridge;
}

async function createBridgePair(WebSocketBridge) {
  const port = await getFreePort();
  const sockets = [];
  const bridges = [];

  const hub = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'test-hub',
    handshakeTimeoutMs: 25,
    promotionJitterMs: 1,
    maxReconnectDelayMs: 100
  });
  const relay = new WebSocketBridge({
    port,
    host: '127.0.0.1',
    instanceId: 'test-relay',
    handshakeTimeoutMs: 25,
    promotionJitterMs: 1,
    maxReconnectDelayMs: 100
  });

  bridges.push(hub, relay);
  await hub.connect();
  await relay.connect();

  return { port, hub, relay, sockets, bridges };
}

async function cleanup(resources) {
  for (const socket of resources.sockets || []) {
    try {
      socket.close();
    } catch (_error) {}
  }
  for (const bridge of [...(resources.bridges || [])].reverse()) {
    try {
      bridge.disconnect();
    } catch (_error) {}
  }
  await sleep(50);
}

async function runCase(name, fn) {
  console.log(`\n--- ${name} ---`);
  try {
    await fn();
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}: ${error.message}`);
  }
}

async function runServerFirstTopology(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { hub, relay } = resources;

    assertEqual(hub.currentMode, 'hub', 'first bridge binds as hub');
    assertEqual(relay.currentMode, 'relay', 'second bridge connects as relay');
    assertEqual(hub.topology?.instanceId, 'test-hub', 'hub topology exposes instanceId test-hub');
    assertEqual(relay.topology?.instanceId, 'test-relay', 'relay topology exposes instanceId test-relay');
    assert(hub.topology && hub.topology.extensionConnected === false, 'hub.topology.extensionConnected === false before extension attach');
    assert(relay.topology?.hubConnected === true, 'relay topology reports hubConnected true after relay handshake');
    assert(relay.topology?.activeHubInstanceId === 'test-hub', 'relay topology tracks activeHubInstanceId test-hub');
  } finally {
    await cleanup(resources);
  }
}

async function runRelayWaitsForExtensionReachability(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { relay } = resources;

    assert(relay.topology?.hubConnected === true, 'relay waits with hubConnected true after relay:welcome');
    assert(relay.topology?.extensionConnected === false, 'relay topology extensionConnected === false before extension attach');
    assert(relay.isConnected === false, 'relay.isConnected === false after relay:welcome and before extension attach');
  } finally {
    await cleanup(resources);
  }
}

async function runExtensionStateBroadcastsToRelays(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { port, hub, relay, sockets } = resources;
    const extensionSocket = await createExtensionSocket(port);
    sockets.push(extensionSocket);

    await sleep(30);
    await waitFor(
      () => hub.topology?.extensionConnected === true && relay.topology?.extensionConnected === true,
      'extensionConnected topology broadcast',
      1000,
      10
    );

    assert(hub.topology?.extensionConnected === true, 'hub topology reports extensionConnected true after extension socket attach');
    assert(relay.topology?.extensionConnected === true, 'relay topology reports extensionConnected true after hub broadcast');
    assert(relay.isConnected === true, 'relay.isConnected becomes true after extension reachability is broadcast');
  } finally {
    await cleanup(resources);
  }
}

async function runRejectsUntrustedBrowserOrigin(WebSocketBridge) {
  const port = await getFreePort();
  const resources = {
    sockets: [],
    bridges: [
      new WebSocketBridge({
        port,
        host: '127.0.0.1',
        instanceId: 'test-hub-origin',
        handshakeTimeoutMs: 25
      })
    ]
  };

  try {
    const hub = resources.bridges[0];
    await hub.connect();

    const close = await attemptRelayWithOrigin(port, 'https://evil.example');
    assertEqual(close.code, 1008, 'hub rejects browser-origin relay handshake with policy violation');
    assertEqual(close.reason, 'Forbidden origin', 'hub reports forbidden origin when rejecting browser-origin relay');
    assertEqual(hub.topology?.relayCount, 0, 'rejected browser-origin relay is not registered');
  } finally {
    await cleanup(resources);
  }
}

/**
 * Connect with (or without) an Origin header and report whether the hub closed
 * us. Unlike attemptRelayWithOrigin, a socket that STAYS OPEN is the success
 * case here, so the timer resolves rather than rejects.
 */
function relayOriginOutcome(port, origin) {
  return new Promise((resolve, reject) => {
    const options = origin ? { headers: { Origin: origin } } : {};
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, options);
    let closed = null;
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ accepted: closed === null, close: closed });
    }, 300);

    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'relay:hello', instanceId: 'origin-probe' }));
    });
    socket.once('close', (code, reason) => {
      closed = { code, reason: reason.toString() };
      clearTimeout(timeout);
      resolve({ accepted: false, close: closed });
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Safari port: the extension may reach :7225 two ways, and BOTH must be
 * accepted with no server configuration.
 *
 *   direct  -- Origin: safari-web-extension://<UUID>, needs the allowlist entry
 *   native  -- the container app dials with URLSessionWebSocketTask, which
 *              sends NO Origin header. That relies on the load-bearing
 *              `if (!originHeader) return true` branch in
 *              isAllowedWebSocketOrigin; this test is what stops someone
 *              "hardening" it away.
 */
async function runAcceptsSafariAndOriginlessClients(WebSocketBridge) {
  const port = await getFreePort();
  const resources = {
    sockets: [],
    bridges: [
      new WebSocketBridge({
        port,
        host: '127.0.0.1',
        instanceId: 'test-hub-safari-origin',
        handshakeTimeoutMs: 25
      })
    ]
  };

  try {
    const hub = resources.bridges[0];
    await hub.connect();

    const safari = await relayOriginOutcome(port, 'safari-web-extension://4C6E0A1B-2F3D-4E5A-9B8C-7D6E5F4A3B2C');
    assertEqual(safari.accepted, true, 'hub accepts a safari-web-extension:// origin');

    const originless = await relayOriginOutcome(port, null);
    assertEqual(originless.accepted, true,
      'hub accepts an origin-less client (the Safari container app native transport)');

    const evil = await relayOriginOutcome(port, 'https://evil.example');
    assertEqual(evil.accepted, false, 'a untrusted web origin is still rejected');
    assertEqual(evil.close.code, 1008, 'untrusted origin still closed with 1008');
  } finally {
    await cleanup(resources);
  }
}

async function runHubExitPromotion(WebSocketBridge) {
  const resources = await createBridgePair(WebSocketBridge);
  try {
    const { hub, relay } = resources;

    hub.disconnect();
    await waitFor(
      () => relay.currentMode === 'hub' &&
        relay.topology?.activeHubInstanceId === 'test-relay',
      'hub-exit-promotion',
      1000,
      10
    );

    assertEqual(relay.currentMode, 'hub', 'relay promotes to hub after original hub exits');
    assertEqual(relay.topology?.activeHubInstanceId, 'test-relay', 'promoted relay reports itself as active hub');
  } finally {
    await cleanup(resources);
  }
}

async function run() {
  const WebSocketBridge = await loadBridgeClass();

  await runCase('server-first topology', () => runServerFirstTopology(WebSocketBridge));
  await runCase('relay waits for extension reachability', () => runRelayWaitsForExtensionReachability(WebSocketBridge));
  await runCase('extension state broadcasts to relays', () => runExtensionStateBroadcastsToRelays(WebSocketBridge));
  await runCase('rejects untrusted browser relay origin', () => runRejectsUntrustedBrowserOrigin(WebSocketBridge));
  await runCase('accepts safari + origin-less clients', () => runAcceptsSafariAndOriginlessClients(WebSocketBridge));
  await runCase('hub-exit-promotion', () => runHubExitPromotion(WebSocketBridge));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
