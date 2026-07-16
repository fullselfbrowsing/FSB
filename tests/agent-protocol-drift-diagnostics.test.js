'use strict';

/**
 * Phase 62 Plan 04 -- sanitized agent protocol drift diagnostics.
 *
 * Run: node tests/agent-protocol-drift-diagnostics.test.js
 */

const assert = require('assert');
const {
  EXPECTED_BY_OBSERVED,
  MAX_ADAPTER_TIMESTAMPS,
  REPORT_WINDOW_MS,
  validateAgentProtocolDriftDetail,
  reportAgentProtocolDrift,
  _getTrackedAdapterCount,
  _resetForTests
} = require('../extension/utils/agent-protocol-drift-diagnostics.js');

const VALID_DETAIL = Object.freeze({
  adapterId: 'claude-code',
  expected: 'bounded_jsonl',
  observed: 'invalid_json'
});

function ownKeys(value) {
  return Reflect.ownKeys(value).sort((a, b) => String(a).localeCompare(String(b)));
}

console.log('--- DRIFT-03 exact-shape validator ---');

const expectedPairs = Object.freeze({
  invalid_utf8: 'bounded_jsonl',
  invalid_json: 'bounded_jsonl',
  line_too_large: 'bounded_jsonl',
  invalid_shape: 'known_event_shape',
  configuration_surface: 'known_event_shape',
  unknown_event_type: 'known_event_shape',
  unknown_stream_event: 'known_event_shape',
  unknown_system_subtype: 'known_event_shape',
  event_before_init: 'single_init_session',
  duplicate_init: 'single_init_session',
  session_mismatch: 'single_init_session',
  missing_result: 'single_terminal_result',
  duplicate_result: 'single_terminal_result',
  event_after_result: 'single_terminal_result',
  protocol_drift: 'adapter_contract'
});

assert.deepStrictEqual(EXPECTED_BY_OBSERVED, expectedPairs, 'validator exports the exhaustive closed reason mapping');
for (const [observed, expected] of Object.entries(expectedPairs)) {
  const input = { adapterId: 'claude-code', expected, observed };
  const safe = validateAgentProtocolDriftDetail(input);
  assert(safe, `canonical pair ${expected}/${observed} is accepted`);
  assert.notStrictEqual(safe, input, 'validator returns a defensive allocation');
  assert.deepStrictEqual(safe, input, 'validator preserves only the safe labels');
  assert.deepStrictEqual(ownKeys(safe), ['adapterId', 'expected', 'observed'], 'safe detail has exactly three keys');
  assert(Object.isFrozen(safe), 'safe detail is frozen');
}

const nullPrototypeDetail = Object.assign(Object.create(null), VALID_DETAIL);
assert.deepStrictEqual(
  validateAgentProtocolDriftDetail(nullPrototypeDetail),
  VALID_DETAIL,
  'prototype-free records are accepted and cloned onto a safe plain object'
);

const malformed = [
  null,
  undefined,
  true,
  'invalid_json',
  [],
  function drift() {},
  { adapterId: 'claude-code', expected: 'bounded_jsonl' },
  { adapterId: 'claude-code', expected: 'bounded_jsonl', observed: 'invalid_json', extra: 'forbidden' },
  { adapterId: 'codex', expected: 'bounded_jsonl', observed: 'invalid_json' },
  { adapterId: 'claude-code-v2', expected: 'bounded_jsonl', observed: 'invalid_json' },
  { adapterId: 'claude-code', expected: 'unknown_contract', observed: 'invalid_json' },
  { adapterId: 'claude-code', expected: 'bounded_jsonl', observed: 'unknown_reason' },
  { adapterId: 'claude-code', expected: 'single_init_session', observed: 'invalid_json' },
  { adapterId: 'claude-code', expected: 'x'.repeat(65), observed: 'invalid_json' },
  { adapterId: 'claude-code', expected: 'bounded_jsonl', observed: 'x'.repeat(65) },
  Object.assign(Object.create({ inherited: 'provider-output' }), VALID_DETAIL)
];

const accessor = {};
Object.defineProperties(accessor, {
  adapterId: { enumerable: true, get() { throw new Error('provider-output-canary'); } },
  expected: { enumerable: true, value: 'bounded_jsonl' },
  observed: { enumerable: true, value: 'invalid_json' }
});
malformed.push(accessor);

const nonEnumerable = { adapterId: 'claude-code', expected: 'bounded_jsonl' };
Object.defineProperty(nonEnumerable, 'observed', { enumerable: false, value: 'invalid_json' });
malformed.push(nonEnumerable);

const symbolKey = { ...VALID_DETAIL };
symbolKey[Symbol('provider-output-canary')] = 'secret';
malformed.push(symbolKey);

const hostileProxy = new Proxy({}, {
  getPrototypeOf() { throw new Error('provider-output-canary'); }
});
malformed.push(hostileProxy);

for (const value of malformed) {
  assert.doesNotThrow(() => validateAgentProtocolDriftDetail(value), 'malformed values never throw');
  assert.strictEqual(validateAgentProtocolDriftDetail(value), null, 'malformed/hostile/unshipped values fail closed');
}
console.log('  PASS: only canonical exact data records and mapped reason pairs are accepted');

console.log('--- DRIFT-03 true pre-throttle ---');

_resetForTests();
assert.strictEqual(REPORT_WINDOW_MS, 10000, 'reporting window is exactly 10 seconds');
assert.strictEqual(MAX_ADAPTER_TIMESTAMPS, 1, 'timestamp map is capped to the canonical adapter roster');

let now = 0;
const sinkCalls = [];
const options = {
  now: () => now,
  rateLimitedWarn(...args) {
    sinkCalls.push(args);
  }
};

assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, options), true, 'first call at t=0 is admitted');
assert.strictEqual(sinkCalls.length, 1, 'first call reaches sink exactly once');
assert.deepStrictEqual(sinkCalls[0].slice(0, 3), [
  'BG',
  'agent-protocol-drift',
  'Agent protocol drift detected'
], 'sink receives the fixed prefix/category/message');
assert.deepStrictEqual(sinkCalls[0][3], VALID_DETAIL, 'sink context contains the exact sanitized fields');
assert.notStrictEqual(sinkCalls[0][3], VALID_DETAIL, 'sink receives a fresh context allocation');
assert.deepStrictEqual(ownKeys(sinkCalls[0][3]), ['adapterId', 'expected', 'observed'], 'sink context has no extra fields');

now = 9999;
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, options), false, 'elapsed time below 10 seconds is suppressed');
assert.strictEqual(sinkCalls.length, 1, 'suppression creates zero sink/ring calls');

now = 10000;
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, options), true, 'exact 10-second boundary is admitted');
assert.strictEqual(sinkCalls.length, 2, 'boundary event reaches sink once');
assert.notStrictEqual(sinkCalls[1][3], sinkCalls[0][3], 'each admitted event receives a new safe context');

assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, options), false, 'repeated event at the same timestamp is suppressed');
assert.strictEqual(sinkCalls.length, 2, 'repeat creates zero sink/ring calls');

now = 9000;
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, options), true, 'clock rollback resets and admits');
assert.strictEqual(sinkCalls.length, 3, 'rollback event reaches sink exactly once');
assert.strictEqual(_getTrackedAdapterCount(), 1, 'timestamp map remains bounded');

console.log('  PASS: t=0, below-boundary, exact-boundary, repeat, and rollback admission are deterministic');

console.log('--- DRIFT-03 fail-closed and best-effort boundaries ---');

const canary = 'prompt=session-token-/private/path-provider-output';
const secretBearingValues = [
  { ...VALID_DETAIL, prompt: canary },
  { adapterId: canary, expected: 'bounded_jsonl', observed: 'invalid_json' },
  { adapterId: 'claude-code', expected: canary, observed: 'invalid_json' },
  { adapterId: 'claude-code', expected: 'bounded_jsonl', observed: canary }
];
const rejectedSinkCalls = [];
for (const value of secretBearingValues.concat(malformed)) {
  assert.doesNotThrow(() => reportAgentProtocolDrift(value, {
    now: () => 30000,
    rateLimitedWarn(...args) { rejectedSinkCalls.push(args); }
  }), 'reporter never throws for rejected input');
}
assert.strictEqual(rejectedSinkCalls.length, 0, 'rejected values never reach the diagnostics sink');
assert(!JSON.stringify(rejectedSinkCalls).includes(canary), 'canary is absent from all sink output');

_resetForTests();
assert.doesNotThrow(() => reportAgentProtocolDrift(VALID_DETAIL, { now: () => 0 }), 'missing sink is best-effort');
assert.strictEqual(_getTrackedAdapterCount(), 1, 'missing sink still records admission and bounds repeats');
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, { now: () => 1 }), false, 'missing-sink repeat remains throttled');

_resetForTests();
assert.doesNotThrow(() => reportAgentProtocolDrift(VALID_DETAIL, {
  now: () => 0,
  rateLimitedWarn() { throw new Error(canary); }
}), 'throwing sink is best-effort');
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, {
  now: () => 1,
  rateLimitedWarn() { throw new Error(canary); }
}), false, 'throwing sink cannot bypass subsequent throttling');

_resetForTests();
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, { now: () => NaN, rateLimitedWarn() {} }), false, 'invalid clocks fail closed');
assert.strictEqual(reportAgentProtocolDrift(VALID_DETAIL, { now() { throw new Error(canary); }, rateLimitedWarn() {} }), false, 'throwing clocks fail closed');

const hostileOptions = {};
Object.defineProperty(hostileOptions, 'now', { get() { throw new Error(canary); } });
assert.doesNotThrow(() => reportAgentProtocolDrift(VALID_DETAIL, hostileOptions), 'hostile options never propagate');

assert.strictEqual(_getTrackedAdapterCount() <= MAX_ADAPTER_TIMESTAMPS, true, 'timestamp state never exceeds its hard cap');
console.log('  PASS: malformed/secret values are silent and missing/throwing dependencies are best-effort');

console.log('\nAll assertions passed.');
