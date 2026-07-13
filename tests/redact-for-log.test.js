'use strict';

/**
 * Phase 211-03 -- redactForLog and rateLimitedWarn helper test.
 * Validates LOG-01 (layered prefixes), LOG-02 (rate-limit + redaction).
 *
 * Run: node tests/redact-for-log.test.js
 */

const assert = require('assert');
const {
  redactBridgeSecretsInString,
  redactForLog,
  rateLimitedWarn,
  _resetRateLimitTable
} = require('../extension/utils/redactForLog.js');

console.log('--- LOG-02 redaction rules (D-12) ---');

// URLs: origin only.
const urlResult = redactForLog('https://api.example.com/v1/users?token=abc&id=42');
assert.strictEqual(urlResult.origin, 'https://api.example.com', 'URL redacts to origin only');
assert(!('path' in urlResult), 'no path field disclosed');
assert(!('search' in urlResult), 'no query string field disclosed');
console.log('  PASS: URL -> origin only');

// Strings with hint.
const strResult = redactForLog('this-could-be-secret', 'prompt');
assert.strictEqual(strResult.kind, 'prompt', 'hint propagates to kind');
assert.strictEqual(strResult.length, 'this-could-be-secret'.length, 'length preserved');
assert(!('value' in strResult) && !('text' in strResult), 'no string content disclosed');
console.log('  PASS: string -> { kind, length } only');

// Errors.
const errResult = redactForLog(new Error('boom'));
assert.strictEqual(errResult.kind, 'error', 'error kind set');
assert.strictEqual(errResult.message, 'boom', 'message preserved');
assert.strictEqual(errResult.name, 'Error', 'name preserved');
assert(!('stack' in errResult), 'NO stack disclosed (PITFALLS.md P11)');
console.log('  PASS: Error -> name+message only, no stack');

// Phase 59 bridge credentials: scrub the exact 32-byte base64url token shape
// even when it is embedded in transport headers, query wrappers, or Errors.
const bridgeSecret = 'fsb-auth.' + 'A'.repeat(43);
const bridgeSecretInterior = 'A'.repeat(16);
const bridgeSecretOutputs = {
  direct: redactBridgeSecretsInString(bridgeSecret),
  header: redactBridgeSecretsInString('Sec-WebSocket-Protocol: fsb-ext-v1, ' + bridgeSecret),
  tokenParam: redactBridgeSecretsInString('token=' + bridgeSecret),
  query: redactBridgeSecretsInString('https://localhost.invalid/?token=' + bridgeSecret),
  error: redactForLog(new Error('failed ' + bridgeSecret)),
  ordinaryString: redactForLog('header=' + bridgeSecret),
  nestedString: redactBridgeSecretsInString(JSON.stringify({ nested: { credential: bridgeSecret } }))
};
assert.strictEqual(bridgeSecretOutputs.direct, '[REDACTED_FSB_BRIDGE_SECRET]', 'direct bridge token uses the stable replacement');
assert.strictEqual(globalThis.redactBridgeSecretsInString, redactBridgeSecretsInString, 'bridge scrubber is exported globally');
const bridgeSecretSerialized = JSON.stringify(bridgeSecretOutputs);
assert(!bridgeSecretSerialized.includes(bridgeSecret), 'full bridge credential is absent from redactor output');
assert(!bridgeSecretSerialized.includes(bridgeSecretInterior), 'bridge credential interior is absent from redactor output');
assert(bridgeSecretSerialized.includes('[REDACTED_FSB_BRIDGE_SECRET]'), 'stable bridge-secret marker is retained');
console.log('  PASS: bridge credentials scrubbed from header/query/Error/nested wrappers');

// HTTP-Response-like.
const respResult = redactForLog({ status: 404, statusText: 'Not Found', body: 'sensitive data' });
assert.strictEqual(respResult.statusCode, 404, 'status code preserved');
assert(!('body' in respResult), 'response body NOT disclosed');
assert(!('statusText' in respResult), 'statusText NOT disclosed');
console.log('  PASS: response -> { statusCode } only');

// Arrays.
const arrResult = redactForLog([1, 2, 3, 4]);
assert.strictEqual(arrResult.kind, 'array', 'array kind');
assert.strictEqual(arrResult.length, 4, 'array length');
console.log('  PASS: array -> { kind, length } only');

// Objects: count of keys, not values.
const objResult = redactForLog({ a: 1, b: 2, password: 'secret' });
assert.strictEqual(objResult.kind, 'object', 'object kind');
assert.strictEqual(objResult.keys, 3, 'key count preserved');
assert(!('a' in objResult) && !('password' in objResult), 'no values disclosed');
console.log('  PASS: object -> { kind, keys: <count> } only');

// null / undefined.
assert.strictEqual(redactForLog(null).kind, 'empty');
assert.strictEqual(redactForLog(undefined).kind, 'empty');
console.log('  PASS: null/undefined -> { kind: empty }');

console.log('--- LOG-02 rate-limit (D-04) ---');

_resetRateLimitTable();

const originalWarn = console.warn;
let warnCalls = [];
console.warn = function() { warnCalls.push(Array.from(arguments)); };

try {
  // First call: emits.
  rateLimitedWarn('DOM', 'test-cat', 'first message', { x: 1 });
  assert.strictEqual(warnCalls.length, 1, 'first call within window emits');
  assert(warnCalls[0][0].indexOf('[FSB DOM]') === 0, 'prefix in [FSB DOM] format');

  // Second call within 10s: suppressed.
  rateLimitedWarn('DOM', 'test-cat', 'second message', { x: 2 });
  assert.strictEqual(warnCalls.length, 1, 'second call within window suppressed');

  // Third call within 10s: suppressed.
  rateLimitedWarn('DOM', 'test-cat', 'third message', { x: 3 });
  assert.strictEqual(warnCalls.length, 1, 'third call within window suppressed');

  // Stub Date.now to advance past the 10s window.
  const originalNow = Date.now;
  let fakeNow = originalNow() + 11000;
  Date.now = function() { return fakeNow; };

  try {
    rateLimitedWarn('DOM', 'test-cat', 'fourth message', { x: 4 });
    assert.strictEqual(warnCalls.length, 2, 'fourth call after window emits');
    const fourthMsg = String(warnCalls[1][0]);
    assert(fourthMsg.includes('(suppressed 2 in last 10s)'), 'rollup format: "(suppressed N in last 10s)" present (D-04)');
  } finally {
    Date.now = originalNow;
  }
} finally {
  console.warn = originalWarn;
}
console.log('  PASS: rate-limit emits one per (prefix, category) per 10s with suppressed-count rollup');

console.log('\nAll assertions passed.');
