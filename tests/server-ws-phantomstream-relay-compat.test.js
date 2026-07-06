'use strict';

/**
 * Phase 24 relay compatibility adapter.
 *
 * FSB keeps hash-key rooms, extension/dashboard role names, and server status
 * broadcasts in showcase/server/src/ws/handler.js. This test proves the CJS
 * compatibility adapter matches the installed PhantomStream relay classifier
 * and limits while preserving FSB-specific handler integration points.
 *
 * Run: node tests/server-ws-phantomstream-relay-compat.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const compat = require(path.join(repoRoot, 'showcase', 'server', 'src', 'ws', 'phantomstream-relay-compat.js'));
const handler = require(path.join(repoRoot, 'showcase', 'server', 'src', 'ws', 'handler.js'));
const handlerSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'server', 'src', 'ws', 'handler.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(repoRoot, 'showcase', 'server', 'server.js'), 'utf8');

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

(async () => {
  const relay = await import('@full-self-browsing/phantom-stream/relay');

  console.log('\n--- PhantomStream relay compatibility constants ---');
  ok(compat.RELAY_PER_MESSAGE_LIMIT_BYTES === 1024 * 1024,
    'compat relay cap is 1 MiB');
  ok(compat.BACKPRESSURE_BUFFER_LIMIT_BYTES === relay.BACKPRESSURE_BUFFER_LIMIT_BYTES,
    'compat backpressure limit matches PhantomStream package');
  ok(handler.RELAY_PER_MESSAGE_LIMIT_BYTES === compat.RELAY_PER_MESSAGE_LIMIT_BYTES,
    'handler exports compat relay cap');
  ok(handler.BACKPRESSURE_BUFFER_LIMIT_BYTES === compat.BACKPRESSURE_BUFFER_LIMIT_BYTES,
    'handler exports compat backpressure limit');

  console.log('\n--- Frame classification parity ---');
  const frames = [
    JSON.stringify({ type: 'ext:dom-mutations', payload: { mutations: [] } }),
    JSON.stringify({ type: 'dash:task-submit', payload: { task: 'x' } }),
    JSON.stringify({ _lz: true, d: 'abc' }),
    JSON.stringify({ _ps: 'deflate-raw', d: 'abc' }),
    '{bad json'
  ];
  for (const frame of frames) {
    const expected = relay.classifyRelayFrame(frame);
    const actual = compat.classifyRelayFrame(frame);
    assert.deepEqual(actual, expected);
    passed += 1;
    console.log('  PASS: classifyRelayFrame parity for ' + (actual.type || actual.parseError));
  }

  console.log('\n--- Frame limit parity ---');
  const small = JSON.stringify({ type: 'ext:dom-scroll', payload: { scrollX: 1, scrollY: 2 } });
  assert.deepEqual(
    compat.checkRelayFrameLimit(small, { roomId: 'abcdef123456', role: 'source' }),
    relay.checkRelayFrameLimit(small, { roomId: 'abcdef123456', role: 'source' })
  );
  passed += 1;
  console.log('  PASS: checkRelayFrameLimit parity for small frame');

  const large = JSON.stringify({ type: 'ext:dom-snapshot', payload: { html: 'a'.repeat(1024 * 1024 + 1) } });
  const expectedLarge = relay.checkRelayFrameLimit(large, { roomId: 'abcdef123456', role: 'source' });
  const actualLarge = compat.checkRelayFrameLimit(large, { roomId: 'abcdef123456', role: 'source' });
  assert.deepEqual(actualLarge, expectedLarge);
  ok(actualLarge.ok === false && actualLarge.error === 'message-too-large',
    'oversized frame maps to message-too-large');
  ok(actualLarge.type === 'ext:dom-snapshot',
    'oversized frame preserves parsed message type');

  console.log('\n--- FSB role compatibility ---');
  ok(compat.normalizeFsbRelayRole('extension') === 'source',
    'extension role maps to PhantomStream source');
  ok(compat.normalizeFsbRelayRole('dashboard') === 'viewer',
    'dashboard role maps to PhantomStream viewer');
  ok(compat.normalizeFsbRelayRole('anything-else') === 'viewer',
    'unknown non-extension role maps to viewer for FSB dashboard compatibility');

  console.log('\n--- Handler integration source contract ---');
  ok(handlerSource.includes("require('./phantomstream-relay-compat')"),
    'handler imports relay compatibility adapter');
  ok(handlerSource.includes('checkRelayFrameLimit(rawMessage'),
    'handler checks package-compatible frame limit before parsing/relaying');
  ok(handlerSource.includes('classifyRelayFrame(rawMessage).type'),
    'handler classifies frames through compatibility adapter');
  ok(handlerSource.includes("event: 'message-too-large'"),
    'handler records message-too-large diagnostics');
  ok(handlerSource.includes("role === 'extension' ? 'extensions' : 'dashboards'"),
    'handler preserves FSB extension/dashboard room sides');
  ok(handlerSource.includes("type: 'ext:status'"),
    'handler preserves FSB extension online status broadcasts');
  ok(serverSource.includes('maxPayload: RELAY_PER_MESSAGE_LIMIT_BYTES + 1024'),
    'WebSocketServer keeps a package-compatible maxPayload guard');

  console.log('\nPhantomStream relay compatibility: ' + passed + ' PASS / 0 FAIL');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
