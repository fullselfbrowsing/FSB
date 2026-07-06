'use strict';

/**
 * Phase 211-01 / Phase 24 -- WebSocket _lz decompression symmetry test.
 * Validates the stateless _lz contract in ws/ws-client.js after the
 * PhantomStream protocol/envelope adapter migration.
 *
 * Static analysis confirms the helper-backed inbound/outbound paths and
 * diagnostic categories exist, and a round-trip exercise against the actual
 * vendored lib/lz-string.min.js plus PhantomStream encodeEnvelope/decodeEnvelope
 * confirms the same compress -> envelope -> decompress -> JSON.parse contract.
 *
 * Run: node tests/ws-client-decompress.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const wsClientSource = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'ws', 'ws-client.js'),
  'utf8'
);

console.log('--- WS-01: inbound _lz envelope adapter ---');
assert(
  wsClientSource.includes('decodeFSBWebSocketEnvelope(event.data)'),
  'inbound onmessage delegates to decodeFSBWebSocketEnvelope'
);
assert(
  wsClientSource.includes('protocol.decodeEnvelope(wire, lz)'),
  'inbound adapter invokes PhantomStream decodeEnvelope when available'
);
assert(
  wsClientSource.includes('isFSBCompressedEnvelope(outer)'),
  'fallback inbound adapter still detects _lz envelope shape'
);
console.log('  PASS: inbound _lz envelope adapter present');

console.log('--- WS-02: failure recording categories ---');
assert(
  wsClientSource.includes("error === 'decompress-failed'"),
  'decompress-failed category has an explicit diagnostic description'
);
assert(
  wsClientSource.includes("error === 'decompress-unavailable'"),
  'decompress-unavailable category has an explicit diagnostic description'
);
assert(
  wsClientSource.includes("recordFSBTransportFailure(error || 'envelope-decode-failed'"),
  'decode failure categories are recorded via recordFSBTransportFailure'
);
assert(
  wsClientSource.includes("error === 'inner-json-parse-failed'"),
  'inner-json-parse-failed category has an explicit diagnostic description'
);
assert(
  wsClientSource.includes("error === 'json-parse-failed'"),
  'json-parse-failed category has an explicit diagnostic description'
);
console.log('  PASS: WS-02 failure categories wired through recordFSBTransportFailure');

console.log('--- WS-03: outbound contract documentation ---');
assert(
  wsClientSource.includes('_lz envelope contract (round-trip)'),
  'WS-03 contract comment block present'
);
assert(
  wsClientSource.includes('encodeFSBWebSocketEnvelope({ type, payload, ts: Date.now() })'),
  'outbound send path delegates to encodeFSBWebSocketEnvelope'
);
assert(
  wsClientSource.includes('protocol.encodeEnvelope(message, lz, 1024)'),
  'outbound adapter invokes PhantomStream encodeEnvelope when available'
);
assert(
  wsClientSource.includes('encoded.length < raw.length'),
  'outbound adapter preserves size-saving compression guard'
);
assert(
  wsClientSource.includes('PITFALLS.md P9'),
  'WS-03 contract references PITFALLS.md P9 (anti-deflate)'
);
console.log('  PASS: WS-03 outbound contract documented');

console.log('--- Anti-list (no permessage-deflate handshake or stateful deflate) ---');
assert(
  !wsClientSource.includes('Sec-WebSocket-Extensions'),
  'no Sec-WebSocket-Extensions header (anti-list)'
);
assert(
  !/\bpako\b/.test(wsClientSource),
  'no pako reference (anti-list)'
);
assert(
  !/\bDecompressionStream\b/.test(wsClientSource),
  'no DecompressionStream usage (anti-list)'
);
console.log('  PASS: anti-list constraints honored');

(async () => {
  console.log('--- Round-trip: PhantomStream encodeEnvelope -> decodeEnvelope ---');
  const lzSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'lib', 'lz-string.min.js'),
    'utf8'
  );
  // lz-string.min.js is browser-targeted but plain ES5; eval into a local sandbox
  // that exposes a `globalThis`-style binding. Mirrors how the SW loads it via
  // importScripts in background.js before ws/phantom-stream-protocol.js and ws/ws-client.js.
  var sandbox = {};
  (new Function('var window = this; var globalThis = this;\n' + lzSource + '\nthis.LZString = LZString;')).call(sandbox);
  assert(typeof sandbox.LZString === 'object' && typeof sandbox.LZString.compressToBase64 === 'function', 'LZString loaded into test sandbox');

  const protocol = await import('@full-self-browsing/phantom-stream/protocol');
  assert(typeof protocol.encodeEnvelope === 'function', 'PhantomStream encodeEnvelope import works');
  assert(typeof protocol.decodeEnvelope === 'function', 'PhantomStream decodeEnvelope import works');

  var bigMessage = {
    type: 'dash:task-submit',
    payload: { task: 'a'.repeat(2000) },
    ts: 12345
  };
  var bigPayload = JSON.stringify(bigMessage);
  var encoded = protocol.encodeEnvelope(bigMessage, sandbox.LZString, 1024);
  var envelope = JSON.parse(encoded);
  assert(protocol.isCompressedEnvelope(envelope), 'PhantomStream encodeEnvelope emits _lz envelope over 1024 bytes');
  assert(encoded.length < bigPayload.length, 'encoded _lz wire is smaller than raw (>1024 byte threshold met)');

  var decoded = protocol.decodeEnvelope(encoded, sandbox.LZString);
  assert(decoded && decoded.ok === true, 'PhantomStream decodeEnvelope returns ok for encoded _lz envelope');
  assert(decoded.msg.type === 'dash:task-submit', 'inner message type preserved through round-trip');
  assert(decoded.msg.payload.task.length === 2000, 'inner payload preserved through round-trip');
  console.log('  PASS: encodeEnvelope -> _lz envelope -> decodeEnvelope round-trip');

  console.log('--- Negative: malformed base64 returns decode failure ---');
  var bad = protocol.decodeEnvelope(JSON.stringify({ _lz: true, d: '!!!not-valid!!!' }), sandbox.LZString);
  assert(bad && bad.ok === false && bad.error === 'decompress-failed', 'malformed base64 maps to decompress-failed');
  console.log('  PASS: malformed envelope maps to the ws-client.js failure category');

  console.log('\nAll assertions passed.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
