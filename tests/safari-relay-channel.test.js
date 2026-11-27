/**
 * Dashboard relay over the Safari container app.
 *
 * Safari's extension service worker deadlocks on new WebSocket(), so the
 * adapter makes it throw there and ws/ws-client.js could never reach the
 * dashboard relay. The relay now uses the same native transport as the MCP
 * bridge, on its own channel, and the host keeps one socket per channel
 * (safari/FSB/Shared/BridgeCoordinator.swift; see
 * tests/safari-native-bridge-channels.test.js for the host side).
 *
 * Locks:
 *   1. FsbNativeBridgeSocket names its channel on every message: open, poll,
 *      frame, chunk and close; 'mcp' by default, 'relay' when asked, and an
 *      unknown channel falls back to 'mcp';
 *   2. FSBWebSocket.createRelaySocket picks the native relay socket only where the worker
 *      WebSocket is guarded, and the real WebSocket everywhere else;
 *   3. ws-client.js connects through it.
 *
 * Run: node tests/safari-relay-channel.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

// --- 1. the transport -------------------------------------------------------
function fakePort() {
  const port = {
    posts: [],
    listeners: [],
    postMessage(msg) { port.posts.push(JSON.parse(JSON.stringify(msg))); },
    onMessage: { addListener(fn) { port.listeners.push(fn); } },
    onDisconnect: { addListener() {} },
    disconnect() {},
    deliver(msg) { port.listeners.forEach((fn) => fn(msg)); }
  };
  return port;
}

let lastPort = null;
globalThis.chrome = {
  runtime: {
    connectNative() { lastPort = fakePort(); return lastPort; },
    getURL: () => 'safari-web-extension://11111111-2222-3333-4444-555555555555/'
  }
};
const { FsbNativeBridgeSocket } = require('../extension/ws/mcp-native-transport.js');

function exercise(opts) {
  const socket = new FsbNativeBridgeSocket(opts);
  const port = lastPort;
  port.deliver({ v: 1, t: 'opened', maxFrameBytes: 64 });   // small ceiling forces chunking
  socket.send('short');
  socket.send('x'.repeat(200));
  socket.close();
  return { socket, port };
}

console.log('\n=== 1. every message names its channel ===');
{
  const { socket, port } = exercise({ url: 'ws://localhost:7225' });
  const kinds = port.posts.map((m) => m.t);
  passAssert(['open', 'poll', 'frame', 'chunk', 'close'].every((k) => kinds.includes(k)),
    'open, poll, frame, chunk and close were all sent (' + Array.from(new Set(kinds)).join(',') + ')');
  passAssert(socket.channel === 'mcp' && port.posts.every((m) => m.ch === 'mcp'), 'default channel is mcp, on every message');
}
{
  const { socket, port } = exercise({ url: 'wss://dashboard.example/ws?key=k&role=extension', channel: 'relay' });
  passAssert(socket.channel === 'relay' && port.posts.every((m) => m.ch === 'relay'), 'relay channel on every message');
  const open = port.posts.find((m) => m.t === 'open');
  passAssert(open && open.url === 'wss://dashboard.example/ws?key=k&role=extension', 'the relay URL goes to the host');
  passAssert(open && /^safari-web-extension:\/\//.test(open.origin || ''), 'with the extension Origin');
}
{
  const { socket } = exercise({ url: 'ws://localhost:7225', channel: 'bogus' });
  passAssert(socket.channel === 'mcp', 'an unknown channel falls back to mcp');
}

// --- 2. the relay socket factory ---------------------------------------------
const WS_SRC = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'ws-client.js'), 'utf8');
const start = WS_SRC.indexOf('  static createRelaySocket(url) {');
const end = WS_SRC.indexOf('\n  }\n', start) + 4;
passAssert(start >= 0 && end > start, 'FSBWebSocket.createRelaySocket found in ws-client.js');
const FACTORY = WS_SRC.slice(start, end);

function factoryIn(globals) {
  const context = vm.createContext(Object.assign({}, globals));
  context.globalThis = context;
  return vm.runInContext(`(class {\n${FACTORY}\n}).createRelaySocket`, context);
}

console.log('\n=== 2. the relay socket ===');
{
  const made = [];
  function GuardedWebSocket() { throw new Error('SecurityError: guarded'); }
  GuardedWebSocket.__fsbSafariWorkerGuard = true;
  class NativeSocket { constructor(opts) { made.push(opts); } }
  const create = factoryIn({ WebSocket: GuardedWebSocket, FsbNativeBridgeSocket: NativeSocket });
  const socket = create('wss://dashboard.example/ws?key=k&role=extension');
  passAssert(socket instanceof NativeSocket, 'Safari (guarded WebSocket) gets the native socket');
  passAssert(made[0] && made[0].channel === 'relay' && made[0].url === 'wss://dashboard.example/ws?key=k&role=extension',
    'on the relay channel, with the relay URL');
}
{
  const urls = [];
  class RealWebSocket { constructor(url) { urls.push(url); } }
  class NativeSocket { constructor() { throw new Error('must not be used'); } }
  const create = factoryIn({ WebSocket: RealWebSocket, FsbNativeBridgeSocket: NativeSocket });
  const socket = create('wss://dashboard.example/ws');
  passAssert(socket instanceof RealWebSocket && urls[0] === 'wss://dashboard.example/ws',
    'Chrome (unguarded WebSocket) keeps the real WebSocket even if the transport is loaded');
}
{
  function GuardedWebSocket() { throw new Error('SecurityError: guarded'); }
  GuardedWebSocket.__fsbSafariWorkerGuard = true;
  const create = factoryIn({ WebSocket: GuardedWebSocket });
  let threw = null;
  try { create('wss://dashboard.example/ws'); } catch (err) { threw = err; }
  passAssert(threw && /guarded/.test(threw.message), 'no transport loaded: the guard throws, which connect() already handles');
}

console.log('\n=== 3. ws-client connects through it ===');
passAssert(/socket = FSBWebSocket\.createRelaySocket\(wsUrl\);/.test(WS_SRC), 'connect() builds the relay socket with createRelaySocket');
passAssert(!/socket = new WebSocket\(wsUrl\);/.test(WS_SRC), 'and no longer calls new WebSocket(wsUrl) directly');

console.log('\n---');
console.log('passed:', passed, 'failed:', failed);
if (failed > 0) process.exit(1);
