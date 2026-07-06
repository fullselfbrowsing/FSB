'use strict';

/**
 * Phase 24 protocol/envelope bundle seam.
 *
 * Verifies the ESM PhantomStream protocol helpers are bundled for the classic
 * service-worker WebSocket client and that ws-client.js routes stream control
 * and _lz envelopes through the package-backed bridge.
 *
 * Run: node tests/phantom-stream-protocol-envelope.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const esbuildConfig = fs.readFileSync(path.join(repoRoot, 'esbuild.config.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const entrySource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'phantom-stream-protocol-entry.js'), 'utf8');
const wsClientSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ws', 'ws-client.js'), 'utf8');
const bundlePath = path.join(repoRoot, 'extension', 'ws', 'phantom-stream-protocol.js');

let passed = 0;
function ok(condition, message) {
  assert.equal(Boolean(condition), true, message);
  passed += 1;
  console.log('  PASS:', message);
}

console.log('\n--- PhantomStream protocol bundle seam ---');

ok(esbuildConfig.includes("name: 'ws-phantom-stream-protocol'"),
  'esbuild has ws-phantom-stream-protocol entry');
ok(esbuildConfig.includes("outfile: path.join(SRC_ROOT, 'ws', 'phantom-stream-protocol.js')"),
  'esbuild emits extension/ws/phantom-stream-protocol.js');
ok(entrySource.includes("from '@full-self-browsing/phantom-stream/protocol'"),
  'bundle entry imports PhantomStream protocol package');
ok(entrySource.includes('globalThis.FSBPhantomStreamProtocol'),
  'bundle entry exposes globalThis.FSBPhantomStreamProtocol');
ok(fs.existsSync(bundlePath), 'generated PhantomStream protocol bundle exists');

const bundleSource = fs.readFileSync(bundlePath, 'utf8');
ok(bundleSource.includes('FSBPhantomStreamProtocol'),
  'generated bundle exposes FSBPhantomStreamProtocol');
ok(bundleSource.includes('encodeEnvelope'),
  'generated bundle contains encodeEnvelope symbol');
ok(bundleSource.includes('decodeEnvelope'),
  'generated bundle contains decodeEnvelope symbol');
ok(!/\bimport\s+/.test(bundleSource),
  'generated protocol bundle has no remaining ESM import statements');

const lzIndex = backgroundSource.indexOf("'lib/lz-string.min.js'");
const protocolIndex = backgroundSource.indexOf("'ws/phantom-stream-protocol.js'");
const wsClientIndex = backgroundSource.indexOf("'ws/ws-client.js'");
ok(lzIndex !== -1, 'background.js loads LZString before WebSocket client');
ok(protocolIndex !== -1, 'background.js loads PhantomStream protocol bridge');
ok(wsClientIndex !== -1, 'background.js loads ws-client.js');
ok(lzIndex < protocolIndex, 'LZString loads before PhantomStream protocol bridge');
ok(protocolIndex < wsClientIndex, 'PhantomStream protocol bridge loads before ws-client.js');

console.log('\n--- Protocol bridge runtime smoke ---');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(bundleSource, sandbox, { filename: bundlePath });
const protocol = sandbox.FSBPhantomStreamProtocol;
ok(protocol && typeof protocol === 'object', 'bundle initializes FSBPhantomStreamProtocol');
ok(Object.isFrozen(protocol), 'protocol bridge is frozen');
ok(protocol.STREAM.SNAPSHOT === 'ext:dom-snapshot', 'STREAM.SNAPSHOT matches FSB stream message');
ok(protocol.CONTROL.START === 'dash:dom-stream-start', 'CONTROL.START matches FSB stream start');
ok(protocol.CONTROL.STOP === 'dash:dom-stream-stop', 'CONTROL.STOP matches FSB stream stop');
ok(typeof protocol.encodeEnvelope === 'function', 'protocol exposes encodeEnvelope');
ok(typeof protocol.decodeEnvelope === 'function', 'protocol exposes decodeEnvelope');
ok(typeof protocol.isCompressedEnvelope === 'function', 'protocol exposes isCompressedEnvelope');

const fakeLz = {
  compressToBase64: (input) => Buffer.from(input, 'utf8').toString('base64'),
  decompressFromBase64: (input) => Buffer.from(input, 'base64').toString('utf8'),
};
const message = {
  type: protocol.STREAM.SNAPSHOT,
  payload: { html: '<main>ok</main>', streamSessionId: 's1', snapshotId: 1 },
  ts: 123,
};
const encoded = protocol.encodeEnvelope(message, fakeLz, 0);
const outer = JSON.parse(encoded);
ok(protocol.isCompressedEnvelope(outer), 'encodeEnvelope emits self-identifying _lz envelope');
const decoded = protocol.decodeEnvelope(encoded, fakeLz);
ok(decoded && decoded.ok === true, 'decodeEnvelope accepts encoded _lz envelope');
ok(decoded.msg.type === protocol.STREAM.SNAPSHOT, 'decoded stream message type is preserved');
ok(decoded.msg.payload.streamSessionId === 's1', 'decoded stream payload is preserved');

const plain = protocol.encodeEnvelope({ type: protocol.CONTROL.START, payload: {}, ts: 456 }, fakeLz, 999999);
ok(!protocol.isCompressedEnvelope(JSON.parse(plain)), 'encodeEnvelope leaves small frames plain when threshold is high');

console.log('\n--- ws-client.js protocol adapter source contract ---');
ok(wsClientSource.includes('globalThis.FSBPhantomStreamProtocol'),
  'ws-client reads the PhantomStream protocol bridge');
ok(wsClientSource.includes('getFSBStreamTypes'),
  'ws-client resolves stream types from PhantomStream protocol constants');
ok(wsClientSource.includes('getFSBControlTypes'),
  'ws-client resolves control types from PhantomStream protocol constants');
ok(wsClientSource.includes('protocol.encodeEnvelope'),
  'ws-client outbound path calls PhantomStream encodeEnvelope when available');
ok(wsClientSource.includes('protocol.decodeEnvelope'),
  'ws-client inbound path calls PhantomStream decodeEnvelope when available');
ok(wsClientSource.includes('protocol.isCompressedEnvelope'),
  'ws-client compressed-envelope detection calls PhantomStream isCompressedEnvelope when available');
ok(wsClientSource.includes('encoded.length < raw.length'),
  'ws-client only sends compressed envelope when full encoded wire is smaller');
ok(wsClientSource.includes("case controlTypes.START"),
  'ws-client handles stream start through protocol CONTROL.START');
ok(wsClientSource.includes("case controlTypes.STOP"),
  'ws-client handles stream stop through protocol CONTROL.STOP');

console.log('\nPhantomStream protocol bundle seam: ' + passed + ' PASS / 0 FAIL');
