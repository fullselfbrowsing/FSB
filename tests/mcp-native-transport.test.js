/**
 * Tests for extension/ws/mcp-native-transport.js (FsbNativeBridgeSocket).
 *
 * This is the Safari path to the SAME MCP server on the SAME port (7225): the
 * container app holds the real socket and this class relays frames over
 * chrome.runtime.connectNative.
 *
 * The properties that matter most, because each one silently corrupts the
 * bridge lifecycle if wrong:
 *
 *   - DUCK TYPE. mcp-bridge-client.js drives this object exactly like a
 *     WebSocket. If readyState/send/close/on* drift, the whole 1900-line
 *     lifecycle breaks in ways no other test would catch.
 *   - TWO-STAGE OPEN. connectNative "connects" instantly; that says nothing
 *     about reaching :7225. onopen must wait for the host's `opened`, because
 *     the bridge mints its connection id and reconciles in-flight tasks there.
 *   - onerror THEN onclose, exactly once. The bridge stages agent release in
 *     onclose; a double-fire would release twice, a missing one would leak.
 *   - Chunk boundaries must never split a multi-byte character.
 *
 * Run: node tests/mcp-native-transport.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
function passAssert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function passAssertEqual(a, b, msg) { passAssert(a === b, msg + ' (got ' + JSON.stringify(a) + ')'); }

const tick = () => new Promise((r) => setTimeout(r, 0));

// --- fake chrome.runtime.connectNative --------------------------------------
function installFakePort() {
  const port = {
    posted: [],
    _msgListeners: [],
    _discListeners: [],
    disconnected: false,
    postMessage(o) { port.posted.push(o); },
    disconnect() { port.disconnected = true; },
    onMessage: { addListener: (f) => port._msgListeners.push(f) },
    onDisconnect: { addListener: (f) => port._discListeners.push(f) },
    emit(msg) { port._msgListeners.slice().forEach((f) => f(msg)); },
    drop() { port._discListeners.slice().forEach((f) => f()); }
  };
  globalThis.chrome = { runtime: { connectNative: () => port } };
  return port;
}

function attach(sock) {
  const ev = { open: 0, close: [], error: [], messages: [] };
  sock.onopen = () => { ev.open += 1; };
  sock.onclose = (e) => { ev.close.push(e); };
  sock.onerror = (e) => { ev.error.push(e); };
  sock.onmessage = (e) => { ev.messages.push(e.data); };
  return ev;
}

const { FsbNativeBridgeSocket, utf8ToBase64, base64ToUtf8 } = require('../extension/ws/mcp-native-transport.js');

(async function run() {
  console.log('\n=== 1. duck-types a WebSocket ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'ws://localhost:7225' });
    passAssertEqual(typeof s.readyState, 'number', 'readyState is numeric');
    passAssertEqual(s.readyState, 0, 'starts CONNECTING(0)');
    for (const m of ['send', 'close']) passAssertEqual(typeof s[m], 'function', `${m}() exists`);
    passAssertEqual(s.url, 'ws://localhost:7225', 'same URL, same port as Chrome');
    passAssert(typeof s.softPayloadLimit === 'number',
      'exposes softPayloadLimit (undefined on a real WebSocket -> no platform branch in the bridge)');
    const openMsg = port.posted[0];
    passAssertEqual(openMsg.t, 'open', 'dials with an open frame');
    passAssertEqual(openMsg.url, 'ws://localhost:7225', 'open frame carries the 7225 URL');
    passAssertEqual(openMsg.linger, true, 'requests linger for fast SW-eviction reconnect');
    passAssertEqual(openMsg.origin, undefined, 'omits origin when runtime.getURL is unavailable');
  }

  console.log('\n=== 1b. open frame carries the extension Origin ===');
  {
    const port = installFakePort();
    globalThis.chrome.runtime.getURL = (p) => 'safari-web-extension://ABCD-1234/' + p;
    new FsbNativeBridgeSocket({ url: 'ws://localhost:7225' });
    passAssertEqual(port.posted[0].origin, 'safari-web-extension://ABCD-1234',
      'origin is the bare extension origin the server classifies as the extension');
  }

  console.log('\n=== 2. TWO-STAGE open ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'ws://localhost:7225' });
    const ev = attach(s);
    await tick();
    passAssertEqual(ev.open, 0, 'no onopen merely because connectNative returned a port');
    passAssertEqual(s.readyState, 0, 'still CONNECTING');
    port.emit({ v: 1, t: 'opened', socketId: 'sock1' });
    passAssertEqual(ev.open, 1, 'onopen fires only after the host confirms it reached :7225');
    passAssertEqual(s.readyState, 1, 'OPEN(1)');
    passAssert(port.posted.some((m) => m.t === 'poll'), 'starts the long-poll loop on open');
  }

  console.log('\n=== 3. host maxFrameBytes narrows ours, never widens ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u', maxFrameBytes: 1000 });
    attach(s);
    port.emit({ v: 1, t: 'opened', maxFrameBytes: 400 });
    passAssertEqual(s._maxFrameBytes, 400, 'takes the smaller host ceiling');
    const port2 = installFakePort();
    const s2 = new FsbNativeBridgeSocket({ url: 'u', maxFrameBytes: 1000 });
    attach(s2);
    port2.emit({ v: 1, t: 'opened', maxFrameBytes: 999999 });
    passAssertEqual(s2._maxFrameBytes, 1000, 'ignores a larger host claim');
  }

  console.log('\n=== 4. inbound frames reach onmessage verbatim ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    port.emit({ v: 1, t: 'opened' });
    const wire = JSON.stringify({ id: 'mcp_1', type: 'mcp:result', payload: { ok: true } });
    port.emit({ v: 1, t: 'batch', frames: [wire] });
    passAssertEqual(ev.messages.length, 1, 'one message');
    passAssertEqual(ev.messages[0], wire, 'raw JSON string passed through byte-for-byte');
    const before = port.posted.filter((m) => m.t === 'poll').length;
    port.emit({ v: 1, t: 'pollempty' });
    passAssert(port.posted.filter((m) => m.t === 'poll').length > before, 'poll loop re-arms');
  }

  console.log('\n=== 5. outbound: small frames raw, large frames chunked ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u', maxFrameBytes: 64 });
    attach(s);
    port.emit({ v: 1, t: 'opened' });

    port.posted.length = 0;
    s.send('{"id":"a","type":"mcp:ping"}');
    passAssertEqual(port.posted.length, 1, 'small payload -> one frame');
    passAssertEqual(port.posted[0].t, 'frame', 'sent as t:frame');
    passAssertEqual(port.posted[0].data, '{"id":"a","type":"mcp:ping"}', 'raw string, not re-serialized');

    port.posted.length = 0;
    const big = 'x'.repeat(500);
    s.send(big);
    const chunks = port.posted.filter((m) => m.t === 'chunk');
    passAssert(chunks.length > 1, `large payload -> ${chunks.length} chunks`);
    passAssertEqual(chunks[0].enc, 'b64', 'chunks are base64');
    passAssert(chunks.every((c) => c.n === chunks.length), 'every chunk agrees on the total');
    passAssert(chunks.every((c) => c.cid === chunks[0].cid), 'shared correlation id');
    passAssertEqual(base64ToUtf8(chunks.map((c) => c.data).join('')), big, 'chunks reassemble to the original');
  }

  console.log('\n=== 6. chunking cannot split a multi-byte character ===');
  {
    // Base64-before-slice is the whole reason this is safe: base64 is ASCII, so
    // a boundary can never land mid-codepoint or mid-surrogate-pair.
    const tricky = '日本語テキスト🚀🎉' .repeat(40) + 'café—naïve';
    const b64 = utf8ToBase64(tricky);
    passAssert(/^[A-Za-z0-9+/=]+$/.test(b64), 'base64 output is pure ASCII');
    for (const size of [7, 13, 64, 100]) {
      const parts = [];
      for (let i = 0; i < b64.length; i += size) parts.push(b64.slice(i, i + size));
      passAssertEqual(base64ToUtf8(parts.join('')), tricky, `round-trips at chunk size ${size}`);
    }
  }

  console.log('\n=== 7. inbound chunk reassembly ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    port.emit({ v: 1, t: 'opened' });
    const payload = JSON.stringify({ id: 'z', type: 'mcp:result', payload: { big: '£'.repeat(200) } });
    const b64 = utf8ToBase64(payload);
    const size = 40;
    const n = Math.ceil(b64.length / size);
    for (let i = 0; i < n; i += 1) {
      port.emit({ v: 1, t: 'chunk', cid: 'c1', i, n, enc: 'b64', data: b64.slice(i * size, (i + 1) * size) });
    }
    passAssertEqual(ev.messages.length, 1, 'emits exactly one reassembled message');
    passAssertEqual(ev.messages[0], payload, 'reassembled payload is exact');
  }

  console.log('\n=== 8. failure emits onerror THEN onclose, exactly once ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    port.emit({ v: 1, t: 'opened' });
    port.drop();
    await tick();
    passAssertEqual(ev.error.length, 1, 'onerror once');
    passAssertEqual(ev.close.length, 1, 'onclose once');
    passAssertEqual(s.readyState, 3, 'CLOSED(3)');
    // The bridge stages agent release in onclose; a second one would release twice.
    port.drop();
    await tick();
    passAssertEqual(ev.close.length, 1, 'a second disconnect does NOT re-fire onclose');
  }

  console.log('\n=== 9. host-reported close / error surface as onclose ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    port.emit({ v: 1, t: 'opened' });
    port.emit({ v: 1, t: 'closed', code: 1006, reason: 'connection_refused' });
    await tick();
    passAssertEqual(ev.close.length, 1, 'closed frame -> onclose');
    passAssertEqual(ev.close[0].reason, 'connection_refused', 'reason propagated (server was not up)');
  }
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    port.emit({ v: 1, t: 'error', phase: 'dial', message: 'no route' });
    await tick();
    passAssertEqual(ev.open, 0, 'a dial error never produces a spurious onopen');
    passAssertEqual(ev.close.length, 1, 'error frame -> onclose');
  }

  console.log('\n=== 10. missing native host fails cleanly ===');
  {
    globalThis.chrome = { runtime: {} };
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    await tick();
    passAssertEqual(ev.close.length, 1, 'no connectNative -> onclose, not a throw');
    passAssert(/native_messaging_unavailable/.test(ev.close[0].reason), 'reason names the cause');
  }

  console.log('\n=== 11. intentional close is clean ===');
  {
    const port = installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    const ev = attach(s);
    port.emit({ v: 1, t: 'opened' });
    s.close(1000, 'intentional');
    passAssert(port.posted.some((m) => m.t === 'close'), 'tells the host to close :7225');
    await tick();
    passAssertEqual(ev.close[0].wasClean, true, 'wasClean:true');
    passAssertEqual(s.readyState, 3, 'CLOSED');
    passAssert(port.disconnected, 'native port disconnected');
  }

  console.log('\n=== 12. send() before open is dropped, not thrown ===');
  {
    installFakePort();
    const s = new FsbNativeBridgeSocket({ url: 'u' });
    attach(s);
    let threw = false;
    try { s.send('{"a":1}'); } catch (_e) { threw = true; }
    passAssert(!threw, 'send() while CONNECTING does not throw');
  }

  console.log('\n---');
  console.log('passed:', passed, 'failed:', failed);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(1); });
