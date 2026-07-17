#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { PassThrough, Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..');
const requestedSection = (() => {
  const index = process.argv.indexOf('--section');
  if (index === -1) return null;
  if (index + 1 >= process.argv.length) throw new Error('--section requires a value');
  return process.argv[index + 1];
})();
const knownSections = new Set(['framing-and-schema', 'entry-lifetime']);
if (requestedSection && !knownSections.has(requestedSection)) {
  throw new Error(`unknown section: ${requestedSection}`);
}

const ORIGIN = 'chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/';
const CORRELATION_ID = 'NativeWake_123456';
const MAX_FRAME_BYTES = 4096;

function nativeHeader(length) {
  const header = Buffer.alloc(4);
  if (os.endianness() === 'LE') header.writeUInt32LE(length, 0);
  else header.writeUInt32BE(length, 0);
  return header;
}

function frameBody(body) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return Buffer.concat([nativeHeader(bytes.length), bytes]);
}

function frameObject(value) {
  return frameBody(JSON.stringify(value));
}

function validRequest(overrides = {}) {
  return {
    v: 1,
    action: 'wake',
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function validResponse(overrides = {}) {
  return {
    v: 1,
    correlationId: CORRELATION_ID,
    outcome: 'started',
    reason: 'daemon_started_ready',
    ...overrides,
  };
}

async function expectCode(promiseOrCallback, code) {
  await assert.rejects(
    typeof promiseOrCallback === 'function' ? promiseOrCallback : promiseOrCallback,
    (error) => error && error.code === code && error.message === code,
  );
}

function expectSyncCode(callback, code) {
  assert.throws(
    callback,
    (error) => error && error.code === code && error.message === code,
  );
}

async function importProtocol() {
  const href = pathToFileURL(path.join(
    repositoryRoot,
    'mcp/build/native-host/protocol.js',
  )).href;
  return await import(`${href}?phase63=${Date.now()}`);
}

async function testFramingAndSchema() {
  const protocol = await importProtocol();
  const {
    encodeNativeWakeResponse,
    readNativeWakeRequest,
    validateNativeInvocation,
    validateNativeWakeRequest,
  } = protocol;

  for (const exported of [
    encodeNativeWakeResponse,
    readNativeWakeRequest,
    validateNativeInvocation,
    validateNativeWakeRequest,
  ]) {
    assert.equal(typeof exported, 'function');
  }

  const exactFrame = frameObject(validRequest());
  const oneByteChunks = Array.from(exactFrame, (byte) => Buffer.from([byte]));
  const parsed = await readNativeWakeRequest(Readable.from(oneByteChunks), { settleMs: 2 });
  assert.deepEqual(parsed, validRequest());
  assert.equal(Object.isFrozen(parsed), true);

  const openInput = new PassThrough();
  const openRead = readNativeWakeRequest(openInput, { settleMs: 4 });
  openInput.write(exactFrame.subarray(0, 3));
  openInput.write(exactFrame.subarray(3));
  assert.deepEqual(await openRead, validRequest());
  openInput.destroy();

  assert.equal(
    await readNativeWakeRequest(Readable.from([]), { settleMs: 2 }),
    null,
    'zero-byte EOF is a clean no-frame result',
  );
  await expectCode(
    readNativeWakeRequest(Readable.from([Buffer.from([1, 0, 0])]), { settleMs: 2 }),
    'native_truncated_header',
  );

  const declaredBody = Buffer.from('{"v":1}', 'utf8');
  await expectCode(
    readNativeWakeRequest(Readable.from([
      nativeHeader(declaredBody.length + 1),
      declaredBody,
    ]), { settleMs: 2 }),
    'native_truncated_body',
  );

  for (const length of [0, MAX_FRAME_BYTES + 1, 0xffffffff]) {
    const input = new PassThrough();
    const reading = readNativeWakeRequest(input, { settleMs: 2 });
    input.write(nativeHeader(length));
    await expectCode(reading, 'native_invalid_length');
    input.destroy();
  }

  await expectCode(
    readNativeWakeRequest(Readable.from([
      frameBody(Buffer.from([0xc3, 0x28])),
    ]), { settleMs: 2 }),
    'native_invalid_utf8',
  );
  await expectCode(
    readNativeWakeRequest(Readable.from([frameBody('{not-json')]), { settleMs: 2 }),
    'native_invalid_json',
  );

  const trailingInput = new PassThrough();
  const trailingRead = readNativeWakeRequest(trailingInput, { settleMs: 20 });
  trailingInput.write(exactFrame);
  setTimeout(() => trailingInput.write(Buffer.from([0])), 1);
  await expectCode(trailingRead, 'native_trailing_data');
  trailingInput.destroy();

  await expectCode(
    readNativeWakeRequest(Readable.from([
      Buffer.concat([exactFrame, frameObject(validRequest())]),
    ]), { settleMs: 2 }),
    'native_trailing_data',
  );

  const invalidWireRequests = [
    null,
    [],
    {},
    { v: 1, action: 'wake' },
    { v: 1, correlationId: CORRELATION_ID },
    { action: 'wake', correlationId: CORRELATION_ID },
    validRequest({ v: 2 }),
    validRequest({ v: 1.1 }),
    validRequest({ action: 'sleep' }),
    validRequest({ correlationId: 'too_short' }),
    validRequest({ correlationId: 'x'.repeat(65) }),
    validRequest({ correlationId: 'Invalid.Correlation' }),
    { ...validRequest(), extra: true },
    JSON.parse('{"v":1,"action":"wake","correlationId":"NativeWake_123456","__proto__":{}}'),
  ];
  for (const value of invalidWireRequests) {
    await expectCode(
      readNativeWakeRequest(Readable.from([frameObject(value)]), { settleMs: 2 }),
      'native_invalid_request',
    );
  }

  const nullPrototype = Object.assign(Object.create(null), validRequest());
  const customPrototype = Object.assign(Object.create({ inherited: true }), validRequest());
  const accessor = validRequest();
  Object.defineProperty(accessor, 'action', {
    enumerable: true,
    get() {
      throw new Error('accessor must not run');
    },
  });
  const hidden = validRequest();
  Object.defineProperty(hidden, 'action', { value: 'wake', enumerable: false });
  const symbol = validRequest();
  symbol[Symbol('authority')] = true;
  for (const value of [nullPrototype, customPrototype, accessor, hidden, symbol]) {
    expectSyncCode(() => validateNativeWakeRequest(value), 'native_invalid_request');
  }

  assert.deepEqual(validateNativeInvocation([ORIGIN], ORIGIN), {
    origin: ORIGIN,
    parentWindow: null,
  });
  assert.deepEqual(
    validateNativeInvocation([ORIGIN, '--parent-window=0'], ORIGIN),
    { origin: ORIGIN, parentWindow: '0' },
  );
  assert.deepEqual(
    validateNativeInvocation([ORIGIN, `--parent-window=${'9'.repeat(20)}`], ORIGIN),
    { origin: ORIGIN, parentWindow: '9'.repeat(20) },
  );
  for (const [argv, expectedOrigin] of [
    [[], ORIGIN],
    [[ORIGIN, '--parent-window='], ORIGIN],
    [[ORIGIN, `--parent-window=${'1'.repeat(21)}`], ORIGIN],
    [[ORIGIN, '--parent-window=12x'], ORIGIN],
    [[ORIGIN, '--parent-window=1', 'extra'], ORIGIN],
    [['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'], ORIGIN],
    [[ORIGIN], 'https://example.com/'],
    [[ORIGIN], `${ORIGIN}extra`],
    ['not-an-array', ORIGIN],
  ]) {
    expectSyncCode(
      () => validateNativeInvocation(argv, expectedOrigin),
      'native_invalid_invocation',
    );
  }

  const outcomeReasons = new Map([
    ['already_running', ['daemon_already_ready']],
    ['started', ['daemon_started_ready']],
    ['unavailable', [
      'daemon_identity_mismatch',
      'daemon_protocol_mismatch',
      'runtime_invalid',
    ]],
    ['failed', [
      'wake_lock_timeout',
      'serve_spawn_failed',
      'serve_readiness_timeout',
      'internal_failure',
    ]],
  ]);
  for (const [outcome, reasons] of outcomeReasons) {
    for (const reason of reasons) {
      const encoded = encodeNativeWakeResponse(
        validResponse({ outcome, reason }),
        CORRELATION_ID,
      );
      const declared = os.endianness() === 'LE'
        ? encoded.readUInt32LE(0)
        : encoded.readUInt32BE(0);
      const body = encoded.subarray(4);
      assert.equal(declared, body.length);
      assert.ok(body.length <= MAX_FRAME_BYTES);
      assert.deepEqual(JSON.parse(body.toString('utf8')), {
        v: 1,
        correlationId: CORRELATION_ID,
        outcome,
        reason,
      });
    }
  }

  const invalidResponses = [
    null,
    [],
    {},
    { ...validResponse(), extra: true },
    validResponse({ v: 2 }),
    validResponse({ correlationId: 'too_short' }),
    validResponse({ outcome: 'ready' }),
    validResponse({ outcome: 'already_running', reason: 'daemon_started_ready' }),
    validResponse({ outcome: 'started', reason: 'daemon_already_ready' }),
    validResponse({ outcome: 'unavailable', reason: 'internal_failure' }),
    validResponse({ outcome: 'failed', reason: 'runtime_invalid' }),
  ];
  for (const value of invalidResponses) {
    expectSyncCode(
      () => encodeNativeWakeResponse(value, CORRELATION_ID),
      'native_invalid_response',
    );
  }
  expectSyncCode(
    () => encodeNativeWakeResponse(validResponse(), 'Different_Id_1234'),
    'native_correlation_mismatch',
  );

  const responseAccessor = validResponse();
  Object.defineProperty(responseAccessor, 'reason', {
    enumerable: true,
    get() {
      throw new Error('response accessor must not run');
    },
  });
  expectSyncCode(
    () => encodeNativeWakeResponse(responseAccessor, CORRELATION_ID),
    'native_invalid_response',
  );
}

async function main() {
  const sections = requestedSection ? [requestedSection] : [...knownSections];
  for (const section of sections) {
    if (section === 'framing-and-schema') {
      await testFramingAndSchema();
      continue;
    }
    throw new Error(`section ${section} has not been implemented yet`);
  }
  console.log(`[mcp-native-host-protocol] PASS: ${sections.join(', ')}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
