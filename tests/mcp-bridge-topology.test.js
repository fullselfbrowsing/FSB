'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
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
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`relay attempt from ${origin} was not closed`));
    }, 500);

    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'relay:hello', instanceId: 'browser-relay' }));
    });
    socket.once('close', (code, reason) => {
      settle({ code, reason: reason.toString() });
    });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      if (response.statusCode === 403) {
        settle({ code: 1008, reason: 'Forbidden origin' });
      } else {
        reject(new Error(`unexpected HTTP status ${response.statusCode}`));
      }
    });
    socket.once('error', (error) => {
      if (!settled) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

function createBrowserSocket(port, options = {}) {
  return new Promise((resolve, reject) => {
    const protocols = options.pairingCode
      ? ['fsb-ext-v1', options.pairingCode]
      : options.stableProtocol
        ? ['fsb-ext-v1']
        : undefined;
    const socket = protocols
      ? new WebSocket(`ws://127.0.0.1:${port}`, protocols, {
          headers: options.origin ? { Origin: options.origin } : undefined,
        })
      : new WebSocket(`ws://127.0.0.1:${port}`, {
          headers: options.origin ? { Origin: options.origin } : undefined,
        });
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`browser socket did not open on ${port}`));
    }, 1000);
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

function collectSocketMessages(socket) {
  const messages = [];
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()));
  });
  return messages;
}

function waitForSocketClose(socket, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('socket did not close')), timeoutMs);
    socket.once('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function rawUpgrade(port, headerLines) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let response = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('raw upgrade did not receive a response'));
    }, 1000);
    socket.once('connect', () => {
      const headers = [
        'GET / HTTP/1.1',
        ...headerLines,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ];
      socket.write(headers.join('\r\n'));
    });
    socket.on('data', (chunk) => {
      response += chunk.toString();
      if (response.includes('\r\n\r\n')) socket.end();
    });
    socket.on('end', () => {
      clearTimeout(timeout);
      resolve(response);
    });
    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function withTempHome(label, callback) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `fsb-${label}-`));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    return await callback(home);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function instrumentUpgradeRegistration(bridge) {
  const original = bridge._handleNewConnection.bind(bridge);
  const counter = { registrations: 0 };
  bridge._handleNewConnection = (socket) => {
    counter.registrations++;
    return original(socket);
  };
  return counter;
}

async function loadBridgeClass() {
  const bridgeUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge.js')).href;
  const module = await import(bridgeUrl);
  return module.WebSocketBridge;
}

async function loadAuthModule() {
  const authUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge-auth.js')).href;
  return import(authUrl);
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
    const counter = instrumentUpgradeRegistration(hub);
    await hub.connect();

    const close = await attemptRelayWithOrigin(port, 'https://evil.example');
    assertEqual(close.code, 1008, 'hub rejects browser-origin relay handshake with policy violation');
    assertEqual(close.reason, 'Forbidden origin', 'hub reports forbidden origin when rejecting browser-origin relay');
    assertEqual(hub.topology?.relayCount, 0, 'rejected browser-origin relay is not registered');
    assertEqual(counter.registrations, 0, 'evil browser Origin is rejected before connection registration');
  } finally {
    await cleanup(resources);
  }
}

async function runRejectsNonLoopbackBind(WebSocketBridge) {
  const rejectedHosts = ['0.0.0.0', '::', '192.168.1.20', 'bridge.local', '', '127.0.0.1:7225'];
  for (const host of rejectedHosts) {
    try {
      new WebSocketBridge({ port: 1, host, instanceId: `bad-${host}` });
      assert(false, `non-loopback bind ${JSON.stringify(host)} throws before port use`);
    } catch (error) {
      assertEqual(error.code, 'BRIDGE_NON_LOOPBACK_BIND', `non-loopback bind ${JSON.stringify(host)} has stable error code`);
      assertEqual(error.message, 'BRIDGE_NON_LOOPBACK_BIND', `non-loopback bind ${JSON.stringify(host)} has stable error message`);
    }
  }
  const defaults = new WebSocketBridge({ port: 1, instanceId: 'default-host-check' });
  assertEqual(defaults.host, '127.0.0.1', 'bridge default bind host is 127.0.0.1');
}

async function runPreHandlerUpgradeGate(WebSocketBridge, auth) {
  await withTempHome('bridge-upgrade-gate', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    const state = auth.rotateBridgeSessionSecret(authPath, 10_000);
    auth.bindAllowedExtensionOrigin('chrome-extension://trusted-extension', authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'upgrade-gate-hub',
      handshakeTimeoutMs: 25,
    });
    const counter = instrumentUpgradeRegistration(hub);
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      const fixtures = [
        {
          label: 'hostile HTTPS Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: https://evil.example'],
        },
        {
          label: 'evil Host resolving to loopback',
          headers: [`Host: evil.example:${port}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'wrong Host port',
          headers: [`Host: 127.0.0.1:${port + 1}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'missing Host',
          headers: ['Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'duplicate Host',
          headers: [`Host: 127.0.0.1:${port}`, `Host: localhost:${port}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'multiple-like Host',
          headers: [`Host: 127.0.0.1:${port},evil.example:${port}`, 'Origin: chrome-extension://trusted-extension'],
        },
        {
          label: 'null Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: null'],
        },
        {
          label: 'malformed extension Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://'],
        },
        {
          label: 'multiple-like extension Origin',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://trusted-extension,https://evil.example'],
        },
        {
          label: 'extension Origin with path',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://trusted-extension/path'],
        },
        {
          label: 'extension Origin with credentials',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://user@trusted-extension'],
        },
        {
          label: 'extension Origin with query',
          headers: [`Host: 127.0.0.1:${port}`, 'Origin: chrome-extension://trusted-extension?pair=1'],
        },
        {
          label: 'wrong persisted extension ID with current token',
          headers: [
            `Host: 127.0.0.1:${port}`,
            'Origin: chrome-extension://wrong-extension',
            `Sec-WebSocket-Protocol: fsb-ext-v1, ${auth.formatPairingCode(state)}`,
          ],
        },
      ];

      for (const fixture of fixtures) {
        const response = await rawUpgrade(port, fixture.headers);
        assert(response.startsWith('HTTP/1.1 403'), `${fixture.label} receives HTTP 403 before upgrade`);
        assertEqual(counter.registrations, 0, `${fixture.label} does not increment registration count`);
        assertEqual(hub.topology.relayCount, 0, `${fixture.label} does not register a relay`);
        assertEqual(hub.topology.extensionConnected, false, `${fixture.label} does not register an extension`);
      }
    } finally {
      await cleanup(resources);
    }
  });
}

async function sendExtRequest(socket, id) {
  const messages = collectSocketMessages(socket);
  socket.send(JSON.stringify({ id, type: 'ext:request', method: 'bridge.test', payload: {} }));
  await waitFor(() => messages.length > 0, `ext response ${id}`, 1000, 10);
  return messages;
}

async function assertUnprivilegedSocket(port, options, label) {
  const socket = await createBrowserSocket(port, options);
  const messages = collectSocketMessages(socket);
  const closePromise = waitForSocketClose(socket);
  socket.send(JSON.stringify({ id: `request-${label}`, type: 'ext:request', method: 'bridge.test', payload: {} }));
  const close = await closePromise;
  const unauthorized = messages.filter((message) => message.error?.code === 'ext_unauthorized');
  assertEqual(unauthorized.length, 1, `${label} receives exactly one generic ext_unauthorized response`);
  assertEqual(close.code, 1008, `${label} closes with policy violation`);
  return socket;
}

async function runPairingAuthorityMatrix(WebSocketBridge, auth) {
  await withTempHome('bridge-authority', async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    const initial = auth.rotateBridgeSessionSecret(authPath, 20_000);
    const initialCode = auth.formatPairingCode(initial);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: 'authority-hub',
      handshakeTimeoutMs: 25,
    });
    let acceptedServerSocket = null;
    const handleNewConnection = hub._handleNewConnection.bind(hub);
    hub._handleNewConnection = (socket) => {
      acceptedServerSocket = socket;
      return handleNewConnection(socket);
    };
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();

      const first = await createBrowserSocket(port, {
        origin: 'chrome-extension://first-extension',
        pairingCode: initialCode,
      });
      resources.sockets.push(first);
      assertEqual(first.protocol, 'fsb-ext-v1', 'authenticated upgrade selects only the stable protocol');
      const firstMessages = await sendExtRequest(first, 'authorized-first-bind');
      assertEqual(firstMessages[0]?.error?.code, 'agent_provider_offline', 'authorized first bind reaches the reserved no-router response');
      assertEqual(
        auth.readBridgeAuthState(authPath).allowedExtensionOrigin,
        'chrome-extension://first-extension',
        'first authenticated upgrade durably binds the exact extension Origin',
      );
      const acceptedMetadata = hub.acceptedSocketMetadata.get(acceptedServerSocket);
      assertEqual(acceptedMetadata?.browserOrigin, 'chrome-extension://first-extension', 'accepted socket metadata records the exact browser Origin');
      assertEqual(acceptedMetadata?.sessionId, initial.sessionId, 'accepted socket metadata records the current non-secret session ID');
      assert(!Object.prototype.hasOwnProperty.call(acceptedMetadata || {}, 'sessionSecret'), 'accepted socket metadata never records the session credential');
      assertEqual(hub.topology.pendingRequestCount, 0, 'authorized no-router response retains no current route');
      first.close();
      await sleep(20);

      const reconnect = await createBrowserSocket(port, {
        origin: 'chrome-extension://first-extension',
        pairingCode: initialCode,
      });
      resources.sockets.push(reconnect);
      const reconnectMessages = await sendExtRequest(reconnect, 'authorized-reconnect');
      assertEqual(reconnectMessages[0]?.error?.code, 'agent_provider_offline', 'current exact Origin and token reconnect remains authorized');
      reconnect.close();
      await sleep(20);

      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension' },
        'missing auth token',
      ));
      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension', pairingCode: `fsb-auth.${'A'.repeat(43)}` },
        'wrong auth token',
      ));

      const rotated = auth.rotateBridgeSessionSecret(authPath, 21_000);
      resources.sockets.push(await assertUnprivilegedSocket(
        port,
        { origin: 'chrome-extension://first-extension', pairingCode: initialCode },
        'rotated auth token',
      ));

      const current = await createBrowserSocket(port, {
        origin: 'chrome-extension://first-extension',
        pairingCode: auth.formatPairingCode(rotated),
      });
      resources.sockets.push(current);
      const currentMessages = await sendExtRequest(current, 'authorized-current-token');
      assertEqual(currentMessages[0]?.error?.code, 'agent_provider_offline', 'current rotated token retains extension authority');
    } finally {
      await cleanup(resources);
    }
  });
}

async function runActiveSocketRevocation(WebSocketBridge, auth, reset) {
  const suffix = reset ? 'reset' : 'rotate';
  await withTempHome(`bridge-active-${suffix}`, async (home) => {
    const port = await getFreePort();
    const authPath = auth.getBridgeAuthPath(home);
    let state = auth.rotateBridgeSessionSecret(authPath, 30_000);
    auth.bindAllowedExtensionOrigin('chrome-extension://active-extension', authPath);
    state = auth.readBridgeAuthState(authPath);
    const hub = new WebSocketBridge({
      port,
      host: '127.0.0.1',
      instanceId: `active-${suffix}-hub`,
      handshakeTimeoutMs: 25,
    });
    const resources = { sockets: [], bridges: [hub] };
    try {
      await hub.connect();
      const relay = await createExtensionSocket(port);
      resources.sockets.push(relay);
      const relayMessages = collectSocketMessages(relay);
      relay.send(JSON.stringify({ type: 'relay:hello', instanceId: `active-${suffix}-relay` }));
      await waitFor(() => hub.topology.relayCount === 1, `${suffix} relay registration`, 1000, 10);

      const extension = await createBrowserSocket(port, {
        origin: 'chrome-extension://active-extension',
        pairingCode: auth.formatPairingCode(state),
      });
      resources.sockets.push(extension);
      const messages = await sendExtRequest(extension, `before-${suffix}`);
      assertEqual(messages[0]?.error?.code, 'agent_provider_offline', `authorized socket is current before external ${suffix}`);

      if (reset) auth.resetBridgePairing(authPath, 31_000);
      else auth.rotateBridgeSessionSecret(authPath, 31_000);

      const closePromise = waitForSocketClose(extension);
      extension.send(JSON.stringify({ id: `after-${suffix}`, type: 'ext:request', method: 'bridge.test', payload: {} }));
      const close = await closePromise;
      const unauthorized = messages.filter((message) => message.error?.code === 'ext_unauthorized');
      const relayExtFrames = relayMessages.filter((message) => typeof message.type === 'string' && message.type.startsWith('ext:'));
      assertEqual(unauthorized.length, 1, `already-open socket receives one unauthorized response after external ${suffix}`);
      assertEqual(close.code, 1008, `already-open socket closes with policy violation after external ${suffix}`);
      assertEqual(relayExtFrames.length, 0, `external ${suffix} invokes no relay reverse path`);
      assertEqual(hub.topology.pendingRequestCount, 0, `external ${suffix} leaves current route count zero`);

      if (reset) {
        const resetState = auth.readBridgeAuthState(authPath);
        const rebound = await createBrowserSocket(port, {
          origin: 'chrome-extension://new-extension',
          pairingCode: auth.formatPairingCode(resetState),
        });
        resources.sockets.push(rebound);
        const reboundMessages = await sendExtRequest(rebound, 'after-reset-rebind');
        assertEqual(reboundMessages[0]?.error?.code, 'agent_provider_offline', 'explicit reset permits a new authenticated extension ID');
        assertEqual(auth.readBridgeAuthState(authPath).allowedExtensionOrigin, 'chrome-extension://new-extension', 'reset rebind persists only the new exact Origin');
      }
    } finally {
      await cleanup(resources);
    }
  });
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
  const auth = await loadAuthModule();

  await runCase('rejects non-loopback bind before port use', () => runRejectsNonLoopbackBind(WebSocketBridge));
  await runCase('server-first topology', () => runServerFirstTopology(WebSocketBridge));
  await runCase('relay waits for extension reachability', () => runRelayWaitsForExtensionReachability(WebSocketBridge));
  await runCase('extension state broadcasts to relays', () => runExtensionStateBroadcastsToRelays(WebSocketBridge));
  await runCase('rejects untrusted browser relay origin', () => runRejectsUntrustedBrowserOrigin(WebSocketBridge));
  await runCase('pre-handler Host and Origin upgrade gate', () => runPreHandlerUpgradeGate(WebSocketBridge, auth));
  await runCase('pairing authority matrix', () => runPairingAuthorityMatrix(WebSocketBridge, auth));
  await runCase('active socket revocation after external rotation', () => runActiveSocketRevocation(WebSocketBridge, auth, false));
  await runCase('active socket revocation and new-ID rebind after reset', () => runActiveSocketRevocation(WebSocketBridge, auth, true));
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
