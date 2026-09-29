'use strict';

const fs = require('fs');
const net = require('node:net');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');
const NodeWebSocket = require(path.join(repoRoot, 'mcp', 'node_modules', 'ws'));

function createStorageArea(initial = {}) {
  const store = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (Array.isArray(keys)) {
        const out = {};
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(store, key)) {
            out[key] = store[key];
          }
        }
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(store, keys) ? { [keys]: store[keys] } : {};
      }
      if (typeof keys === 'object') {
        const out = {};
        for (const key of Object.keys(keys)) {
          out[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
        }
        return out;
      }
      return { ...store };
    },
    async set(values) {
      Object.assign(store, values);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete store[key];
      }
    },
    _dump() {
      return { ...store };
    },
  };
}

function createRuntimeOnMessageMock() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    _emit(message, sender = {}, sendResponse = () => {}) {
      for (const listener of [...listeners]) {
        listener(message, sender, sendResponse);
      }
    },
    _listeners() {
      return [...listeners];
    },
  };
}

function createChromeMock(options = {}) {
  const session = options.session || createStorageArea();
  const local = options.local || createStorageArea();
  const alarms = new Map();
  const cleared = [];

  return {
    runtime: { id: 'phase-202-test-extension', onMessage: createRuntimeOnMessageMock() },
    storage: { session, local },
    alarms: {
      async create(name, alarmOptions) {
        alarms.set(name, { name, ...alarmOptions });
      },
      async clear(name) {
        cleared.push(name);
        alarms.delete(name);
        return true;
      },
      async getAll() {
        return Array.from(alarms.values());
      },
      _created() {
        return Array.from(alarms.values());
      },
      _cleared() {
        return [...cleared];
      },
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs = 3000, intervalMs = 20) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return true;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms${lastError ? ` (${lastError.message})` : ''}`);
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

async function loadBuildModule(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', relativePath)).href;
  return import(moduleUrl);
}

async function loadBridgeClass() {
  const module = await loadBuildModule('bridge.js');
  return module.WebSocketBridge;
}

class BrowserLikeWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.readyState = BrowserLikeWebSocket.CONNECTING;
    this.sent = [];
    this._ws = Array.isArray(options.protocols) && options.protocols.length > 0
      ? new NodeWebSocket(url, options.protocols, options.connectionOptions || {})
      : new NodeWebSocket(url, options.connectionOptions || {});

    this._ws.on('open', () => {
      this.readyState = BrowserLikeWebSocket.OPEN;
      if (typeof this.onopen === 'function') this.onopen();
    });
    this._ws.on('message', (data) => {
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: typeof data === 'string' ? data : data.toString() });
      }
    });
    this._ws.on('close', (code, reason) => {
      this.readyState = BrowserLikeWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose({ code, reason });
    });
    this._ws.on('error', (error) => {
      if (typeof this.onerror === 'function') this.onerror(error);
    });
  }

  send(payload) {
    this.sent.push(payload);
    this._ws.send(payload);
  }

  close() {
    this._ws.close();
  }
}

BrowserLikeWebSocket.CONNECTING = NodeWebSocket.CONNECTING;
BrowserLikeWebSocket.OPEN = NodeWebSocket.OPEN;
BrowserLikeWebSocket.CLOSED = NodeWebSocket.CLOSED;

function buildBridgeClientSource(options = {}) {
  let source = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'mcp-bridge-client.js'), 'utf8');

  if (options.bridgeUrl) {
    source = source.replace(
      /const MCP_BRIDGE_URL = 'ws:\/\/localhost:7225';/,
      `const MCP_BRIDGE_URL = ${JSON.stringify(options.bridgeUrl)};`,
    );
  }

  if (typeof options.reconnectBaseMs === 'number') {
    source = source.replace(
      /const MCP_RECONNECT_BASE_MS = \d+;/,
      `const MCP_RECONNECT_BASE_MS = ${options.reconnectBaseMs};`,
    );
  }

  if (typeof options.reconnectMaxMs === 'number') {
    source = source.replace(
      /const MCP_RECONNECT_MAX_MS = \d+;/,
      `const MCP_RECONNECT_MAX_MS = ${options.reconnectMaxMs};`,
    );
  }

  if (typeof options.pingIntervalMs === 'number') {
    source = source.replace(
      /const MCP_PING_INTERVAL_MS = \d+;/,
      `const MCP_PING_INTERVAL_MS = ${options.pingIntervalMs};`,
    );
  }

  return source;
}

function buildClientHarness(options = {}) {
  const chrome = options.chrome || createChromeMock();
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;

  const context = {
    chrome,
    WebSocket: class extends (options.WebSocketImpl || BrowserLikeWebSocket) {
      constructor(url, protocols) {
        const websocketOptions = {
          ...(options.websocketOptions || {}),
          connectionOptions: {
            headers: { Origin: `chrome-extension://${chrome.runtime.id}` },
            ...(options.websocketOptions?.connectionOptions || {}),
          },
          protocols: Array.isArray(protocols) ? protocols : options.websocketOptions?.protocols,
        };
        super(url, websocketOptions);
      }
    },
    console,
    Math: deterministicMath,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    dispatchMcpMessageRoute: options.dispatchMcpMessageRoute || (async () => ({ success: true })),
    dispatchMcpToolRoute: options.dispatchMcpToolRoute || (async () => ({ success: true })),
    getToolByName: options.getToolByName || (() => null),
    hasMcpToolRoute: options.hasMcpToolRoute || (() => false),
    createMcpRouteError: options.createMcpRouteError || null,
    sendMessageWithRetry: options.sendMessageWithRetry || null,
    ensureContentScriptInjected: options.ensureContentScriptInjected || null,
    chromeQueryTabs: options.chromeQueryTabs || null,
    globalThis: {},
  };
  context.globalThis = context;

  const footer = `
this.__phase202 = {
  MCPBridgeClient,
  mcpBridgeClient,
  MCP_BRIDGE_STATE_KEY: typeof MCP_BRIDGE_STATE_KEY !== 'undefined' ? MCP_BRIDGE_STATE_KEY : undefined,
  MCP_RECONNECT_ALARM: typeof MCP_RECONNECT_ALARM !== 'undefined' ? MCP_RECONNECT_ALARM : undefined,
  MCP_RECONNECT_MAX_MS: typeof MCP_RECONNECT_MAX_MS !== 'undefined' ? MCP_RECONNECT_MAX_MS : undefined
};
`;

  const source = buildBridgeClientSource(options);
  vm.runInNewContext(`${source}\n${footer}`, context, { filename: 'ws/mcp-bridge-client.js' });

  return {
    chrome,
    exports: context.__phase202,
  };
}

async function startBridgeHarness(options = {}) {
  const WebSocketBridge = options.WebSocketBridge || await loadBridgeClass();
  const port = options.port || await getFreePort();
  const bridge = new WebSocketBridge({
    port,
    host: options.host || '127.0.0.1',
    instanceId: options.instanceId || 'phase-202-bridge',
    handshakeTimeoutMs: options.handshakeTimeoutMs ?? 25,
    promotionJitterMs: options.promotionJitterMs ?? 1,
    maxReconnectDelayMs: options.maxReconnectDelayMs ?? 100,
  });
  await bridge.connect();
  return {
    port,
    bridge,
    bridges: [bridge],
    WebSocketBridge,
  };
}

async function createBridgePair(options = {}) {
  const WebSocketBridge = options.WebSocketBridge || await loadBridgeClass();
  const port = options.port || await getFreePort();
  const shared = {
    port,
    host: options.host || '127.0.0.1',
    handshakeTimeoutMs: options.handshakeTimeoutMs ?? 25,
    promotionJitterMs: options.promotionJitterMs ?? 1,
    maxReconnectDelayMs: options.maxReconnectDelayMs ?? 100,
  };

  const hub = new WebSocketBridge({
    ...shared,
    instanceId: options.hubInstanceId || 'phase-202-hub',
  });
  const relay = new WebSocketBridge({
    ...shared,
    instanceId: options.relayInstanceId || 'phase-202-relay',
  });

  await hub.connect();
  await relay.connect();

  return {
    port,
    hub,
    relay,
    bridges: [hub, relay],
    WebSocketBridge,
  };
}

function createToolHarness(options = {}) {
  const handlers = new Map();
  const bridgeCalls = [];
  const queueCalls = [];
  const loggingMessages = [];
  const sentNotifications = [];

  const bridge = {
    isConnected: options.connected !== false,
    async sendAndWait(message, sendOptions) {
      bridgeCalls.push({ message, options: sendOptions });
      // Phase 238 D-13.4: harness mints a deterministic agent_id for the
      // lazy AgentScope.ensure() round-trip. Every other type continues
      // through the existing response logic below.
      // Phase 240: also mint a deterministic ownershipToken so AgentScope
      // captures it via captureOwnershipToken() and tools thread it through
      // their bridge payloads alongside agentId. The token is seeded via the
      // single-slot `ownershipToken` field on the response (Plan 02 single-
      // slot model; Plan 03 will switch to per-tabId routing).
      if (message && message.type === 'agent:register') {
        return {
          success: true,
          agentId: 'agent_test_smoke',
          agentIdShort: 'agent_test',
          ownershipTokens: {},
          ownershipToken: 'token_test_smoke'
        };
      }
      if (typeof options.onSendAndWait === 'function') {
        return options.onSendAndWait(message, sendOptions, bridgeCalls.length - 1);
      }
      if (options.bridgeResponses && Object.prototype.hasOwnProperty.call(options.bridgeResponses, message.type)) {
        const response = options.bridgeResponses[message.type];
        return typeof response === 'function'
          ? response(message, sendOptions, bridgeCalls.length - 1)
          : response;
      }
      return { success: true, type: message.type, payload: message.payload };
    },
  };

  const queue = {
    async enqueue(toolName, fn) {
      queueCalls.push(toolName);
      return fn();
    },
  };

  const server = {
    tool(name, description, schema, handler) {
      handlers.set(name, { name, description, schema, handler });
    },
    sendLoggingMessage(payload) {
      loggingMessages.push(payload);
    },
  };

  return {
    server,
    bridge,
    queue,
    handlers,
    bridgeCalls,
    queueCalls,
    loggingMessages,
    sentNotifications,
    getHandler(name) {
      return handlers.get(name)?.handler || null;
    },
    createExtra(meta = {}) {
      return {
        _meta: meta,
        sendNotification: async (payload) => {
          sentNotifications.push(payload);
        },
      };
    },
  };
}

/**
 * Phase 238 helper: construct a fresh AgentScope from the build artefact.
 * Tests pass this as the 4th arg to register*Tools (D-11) so the harness
 * mirrors createRuntime's wiring. Each call returns a NEW AgentScope so
 * test isolation is preserved.
 */
async function loadAgentScope() {
  const module = await loadBuildModule('agent-scope.js');
  return new module.AgentScope();
}

async function cleanupResources(resources = {}) {
  const clientHarnesses = resources.clientHarnesses || resources.clients || [];
  for (const harness of clientHarnesses) {
    try {
      harness.exports?.mcpBridgeClient?.disconnect?.();
    } catch (_error) {}
  }

  const bridges = Array.isArray(resources.bridges)
    ? [...resources.bridges]
    : (resources.bridge ? [resources.bridge] : []);
  for (const bridge of bridges.reverse()) {
    try {
      bridge.disconnect();
    } catch (_error) {}
  }

  await sleep(50);
}

module.exports = {
  BrowserLikeWebSocket,
  buildClientHarness,
  cleanupResources,
  createBridgePair,
  createChromeMock,
  createStorageArea,
  createToolHarness,
  getFreePort,
  loadAgentScope,
  loadBridgeClass,
  loadBuildModule,
  sleep,
  startBridgeHarness,
  waitFor,
};
