'use strict';

/**
 * Dashboard relay socket ownership in ws/ws-client.js (FSBWebSocket).
 *
 * connect() replaces any socket it already has. The replaced socket's onclose
 * used to schedule a reconnect of its own; that reconnect replaced the new
 * socket, whose close then did the same. One extra connect() while connected
 * left two sockets swapping places every couple of seconds for as long as the
 * browser ran, and the toolbar icon dimmed on every swap.
 *
 * Runs the real class against a fake WebSocket on a virtual clock.
 *
 * Run: node tests/ws-client-relay-reconnect.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ws', 'ws-client.js'), 'utf8');
const classStart = source.indexOf('class FSBWebSocket {');
const classEnd = source.indexOf('const fsbWebSocket = new FSBWebSocket();');
assert(classStart !== -1 && classEnd > classStart, 'FSBWebSocket class found in ws-client.js');
const classSource = source.slice(classStart, classEnd);

const OPEN_LATENCY_MS = 120;
const CLOSE_LATENCY_MS = 80;

function createHarness() {
  let now = 0;
  let nextTimerId = 0;
  const timers = [];

  function setTimeoutVirtual(fn, ms) {
    const id = ++nextTimerId;
    timers.push({ id, at: now + Math.max(0, Number(ms) || 0), fn });
    return id;
  }

  function clearTimeoutVirtual(id) {
    const index = timers.findIndex((t) => t.id === id);
    if (index !== -1) timers.splice(index, 1);
  }

  async function settle() {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  }

  async function advance(ms) {
    const until = now + ms;
    await settle();
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      next.fn();
      await settle();
    }
    now = until;
  }

  const sockets = [];
  const iconStates = [];
  const statusBroadcasts = [];
  const storage = {
    serverHashKey: 'a'.repeat(64),
    serverUrl: 'https://full-selfbrowsing.com'
  };

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.sent = [];
      sockets.push(this);
      setTimeoutVirtual(() => {
        if (this.readyState !== FakeWebSocket.CONNECTING) return;
        this.readyState = FakeWebSocket.OPEN;
        if (this.onopen) this.onopen();
      }, OPEN_LATENCY_MS);
    }

    send(data) {
      this.sent.push(data);
    }

    close(code) {
      if (this.readyState >= FakeWebSocket.CLOSING) return;
      this.readyState = FakeWebSocket.CLOSING;
      setTimeoutVirtual(() => {
        this.readyState = FakeWebSocket.CLOSED;
        if (this.onclose) this.onclose({ code: code || 1005, reason: '' });
      }, CLOSE_LATENCY_MS);
    }

    // The server (or the network) ending the connection.
    drop(code) {
      this.close(code || 1006);
    }
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;

  const context = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: setTimeoutVirtual,
    clearTimeout: clearTimeoutVirtual,
    setInterval: () => 0,
    clearInterval: () => {},
    WebSocket: FakeWebSocket,
    chrome: {
      storage: {
        local: {
          get: async (keys) => {
            const out = {};
            for (const key of keys) out[key] = storage[key];
            return out;
          },
          set: async (values) => { Object.assign(storage, values); }
        }
      },
      runtime: { getManifest: () => ({ version: 'test' }) }
    },
    fetch: async () => { throw new Error('no network in this test'); },
    _normalizeFsbServerUrl: (value) => (typeof value === 'string' && value.trim() ? value.trim() : 'https://full-selfbrowsing.com').replace(/\/+$/, ''),
    recordFSBTransportReconnect() {},
    recordFSBTransportFailure() {},
    recordFSBTransportCount() {},
    _installMetricsStorageListener() {},
    _broadcastMetrics() {},
    _broadcastDashboardWsStatus(connected) { statusBroadcasts.push(!!connected); },
    decodeFSBWebSocketEnvelope: () => ({ ok: true, msg: { type: 'noop' } }),
    fsbActionIcon: { setConnected(value) { iconStates.push(value === true); } }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(classSource + '\nglobalThis.FSBWebSocket = FSBWebSocket;', context);

  const client = new context.FSBWebSocket();
  client._sendStateSnapshot = async () => {};
  client._handleMessage = () => {};

  return {
    client,
    sockets,
    iconStates,
    statusBroadcasts,
    storage,
    advance,
    openSockets: () => sockets.filter((s) => s.readyState === FakeWebSocket.OPEN),
    dimmedCount: () => iconStates.filter((v) => v === false).length
  };
}

async function run() {
  console.log('--- an extra connect() while connected keeps the open socket ---');
  {
    const h = createHarness();
    h.client.connect();
    await h.advance(1000);
    assert.strictEqual(h.sockets.length, 1, 'first connect opens one socket');
    assert.strictEqual(h.client.connected, true, 'client reports connected');

    h.client.connect();
    await h.advance(60000);
    assert.strictEqual(h.sockets.length, 1,
      'a redundant connect() must not replace a healthy socket (saw ' + h.sockets.length + ' sockets in 60s)');
    assert.strictEqual(h.dimmedCount(), 0, 'the toolbar icon is never dimmed');
    assert.strictEqual(h.openSockets().length, 1, 'exactly one socket is open');
    console.log('  PASS');
  }

  console.log('--- two connect() calls for one event open one socket ---');
  {
    const h = createHarness();
    h.client.connect();
    h.client.connect();
    await h.advance(60000);
    assert.strictEqual(h.sockets.length, 1, 'back-to-back connect() calls open a single socket');
    assert.strictEqual(h.dimmedCount(), 0, 'the toolbar icon is never dimmed');
    console.log('  PASS');
  }

  console.log('--- switching rooms replaces the socket once and settles ---');
  {
    const h = createHarness();
    h.client.connect();
    await h.advance(1000);
    h.storage.serverHashKey = 'b'.repeat(64);
    // The storage listener and the Sync tab's reconnect message both fire.
    h.client.connect();
    h.client.connect();
    await h.advance(60000);
    assert.strictEqual(h.sockets.length, 2, 'one replacement socket for the new key (saw ' + h.sockets.length + ')');
    assert(h.sockets[1].url.includes('key=' + 'b'.repeat(64)), 'the replacement joins the new room');
    assert.strictEqual(h.sockets[0].readyState, 3, 'the old socket is closed');
    assert.strictEqual(h.openSockets().length, 1, 'exactly one socket is open');
    assert.strictEqual(h.client.connected, true, 'client reports connected');
    assert.strictEqual(h.dimmedCount(), 0, "the replaced socket's close does not dim the icon");
    console.log('  PASS');
  }

  console.log('--- a dropped connection reconnects once ---');
  {
    const h = createHarness();
    h.client.connect();
    await h.advance(1000);
    h.sockets[0].drop(1012);
    await h.advance(60000);
    assert.strictEqual(h.sockets.length, 2, 'one reconnect after a server-side close (saw ' + h.sockets.length + ')');
    assert.strictEqual(h.openSockets().length, 1, 'the reconnect is open');
    assert.deepStrictEqual(h.iconStates, [true, false, true], 'icon: connected, dimmed for the outage, connected');
    console.log('  PASS');
  }

  console.log('--- a connection that keeps failing backs off ---');
  {
    const h = createHarness();
    h.client.connect();
    await h.advance(1000);
    h.sockets[0].drop(1006);
    // Every later attempt fails before opening.
    const originalPush = h.sockets.push.bind(h.sockets);
    h.sockets.push = (socket) => {
      const result = originalPush(socket);
      socket.readyState = 2;
      socket.close = () => {};
      setImmediate(() => {
        socket.readyState = 3;
        if (socket.onclose) socket.onclose({ code: 1006, reason: '' });
      });
      return result;
    };
    await h.advance(120000);
    // Immediate, 1s, 2s, 4s, 8s, 16s, then 30s steps: about 9 attempts in two minutes.
    assert(h.sockets.length <= 12, 'failed attempts back off (saw ' + h.sockets.length + ' sockets in 120s)');
    console.log('  PASS');
  }

  console.log('--- disconnect() stops reconnecting and reports the drop ---');
  {
    const h = createHarness();
    h.client.connect();
    await h.advance(1000);
    h.client.disconnect();
    await h.advance(60000);
    assert.strictEqual(h.sockets.length, 1, 'no reconnect after disconnect()');
    assert.strictEqual(h.client.connected, false, 'client reports disconnected');
    assert.strictEqual(h.iconStates[h.iconStates.length - 1], false, 'icon shows the relay as down');
    assert.strictEqual(h.statusBroadcasts[h.statusBroadcasts.length - 1], false, 'Sync tab is told the relay dropped');
    console.log('  PASS');
  }

  console.log('--- disconnect() during a pending connect() wins ---');
  {
    const h = createHarness();
    h.client.connect();
    h.client.disconnect();
    await h.advance(60000);
    assert.strictEqual(h.sockets.length, 0, 'a connect() still reading storage does not open a socket after disconnect()');
    console.log('  PASS');
  }

  console.log('ws-client relay reconnect: all checks passed');
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
