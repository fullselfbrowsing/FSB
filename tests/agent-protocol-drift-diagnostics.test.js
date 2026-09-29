'use strict';

/**
 * Phase 64 Plan 10 -- sanitized per-adapter protocol drift diagnostics.
 *
 * Run: node tests/agent-protocol-drift-diagnostics.test.js
 */

const assert = require('assert');
const {
  EXPECTED_BY_REASON,
  REASONS_BY_ADAPTER,
  MAX_ADAPTER_TIMESTAMPS,
  REPORT_WINDOW_MS,
  validateAgentProtocolDriftDetail,
  reportAgentProtocolDrift,
  _getTrackedAdapterCount,
  _resetForTests,
} = require('../extension/utils/agent-protocol-drift-diagnostics.js');

const EXPECTED = Object.freeze({
  configuration_surface: 'known_event_shape',
  counter_overflow: 'bounded_jsonl',
  duplicate_id: 'known_event_shape',
  duplicate_init: 'single_init_session',
  duplicate_result: 'single_terminal_result',
  event_after_result: 'single_terminal_result',
  event_before_init: 'single_init_session',
  invalid_json: 'bounded_jsonl',
  invalid_order: 'known_event_shape',
  invalid_shape: 'known_event_shape',
  invalid_utf8: 'bounded_jsonl',
  line_too_large: 'bounded_jsonl',
  missing_result: 'single_terminal_result',
  provider_error: 'adapter_contract',
  session_mismatch: 'single_init_session',
  stream_too_large: 'bounded_jsonl',
  unknown_event_type: 'known_event_shape',
  unknown_stream_event: 'known_event_shape',
  unknown_system_subtype: 'known_event_shape',
});

const CLAUDE_REASONS = Object.freeze([
  'configuration_surface', 'duplicate_init', 'duplicate_result', 'event_after_result',
  'event_before_init', 'invalid_json', 'invalid_shape', 'invalid_utf8',
  'line_too_large', 'missing_result', 'session_mismatch', 'unknown_event_type',
  'unknown_stream_event', 'unknown_system_subtype',
]);
const GROK_BUILD_REASONS = Object.freeze([
  'configuration_surface', 'counter_overflow', 'duplicate_id', 'duplicate_init',
  'duplicate_result', 'event_after_result',
  'event_before_init', 'invalid_json', 'invalid_order', 'invalid_shape',
  'invalid_utf8', 'line_too_large', 'missing_result', 'provider_error',
  'session_mismatch', 'stream_too_large', 'unknown_event_type',
]);

const VALID_CLAUDE = Object.freeze({
  adapterId: 'claude-code',
  profileVersion: '2.1.177',
  reason: 'invalid_json',
  expected: 'bounded_jsonl',
  eventIndex: 7,
  issuePaths: Object.freeze(['message.content.0.type']),
});
const VALID_GROK_BUILD = Object.freeze({
  adapterId: 'grok-build',
  profileVersion: '1.0.4',
  reason: 'invalid_order',
  expected: 'known_event_shape',
  eventIndex: 4097,
  issuePaths: Object.freeze(['part.state', 'messageID']),
});

function ownKeys(value) {
  return Reflect.ownKeys(value).sort((left, right) => String(left).localeCompare(String(right)));
}

function detailFor(adapterId, profileVersion, reason) {
  return {
    adapterId,
    profileVersion,
    reason,
    expected: EXPECTED[reason],
    eventIndex: 1,
    issuePaths: [],
  };
}

console.log('--- D64-11 exact per-adapter drift validator ---');

assert.deepStrictEqual(EXPECTED_BY_REASON, EXPECTED,
  'validator exports the exhaustive MCP reason-to-expected mapping');
assert.deepStrictEqual(REASONS_BY_ADAPTER, {
  'claude-code': CLAUDE_REASONS,
  'grok-build': GROK_BUILD_REASONS,
}, 'validator exports the exact two MCP provider reason rosters');

for (const [adapterId, profileVersion, reasons] of [
  ['claude-code', '2.1.177', CLAUDE_REASONS],
  ['grok-build', '1.0.4', GROK_BUILD_REASONS],
]) {
  for (const reason of reasons) {
    const input = detailFor(adapterId, profileVersion, reason);
    const safe = validateAgentProtocolDriftDetail(input);
    assert(safe, `${adapterId}/${reason} is accepted`);
    assert.notStrictEqual(safe, input, 'validator returns a defensive allocation');
    assert.deepStrictEqual(safe, input, 'validator preserves only the closed detail');
    assert.deepStrictEqual(ownKeys(safe), [
      'adapterId', 'eventIndex', 'expected', 'issuePaths', 'profileVersion', 'reason',
    ], 'safe detail has exactly six keys');
    assert(Object.isFrozen(safe), 'safe detail is frozen');
    assert(Object.isFrozen(safe.issuePaths), 'safe issue paths are frozen');
  }
}

let accessorCalls = 0;
const accessor = { ...VALID_GROK_BUILD };
Object.defineProperty(accessor, 'reason', {
  enumerable: true,
  get() { accessorCalls += 1; return 'invalid_order'; },
});
const sparsePaths = [];
sparsePaths.length = 1;
const symbolDetail = { ...VALID_CLAUDE };
symbolDetail[Symbol('secret')] = 'provider-output';
const malformed = [
  null,
  undefined,
  true,
  'invalid_json',
  [],
  function drift() {},
  Object.assign(Object.create(null), VALID_CLAUDE),
  Object.assign(Object.create({ inherited: true }), VALID_CLAUDE),
  { ...VALID_CLAUDE, adapterId: 'codex' },
  { ...VALID_CLAUDE, adapterId: 'Claude-Code' },
  { ...VALID_CLAUDE, profileVersion: '' },
  { ...VALID_CLAUDE, profileVersion: 'v'.repeat(129) },
  { ...VALID_CLAUDE, profileVersion: '/private/profile' },
  { ...VALID_CLAUDE, reason: 'counter_overflow', expected: 'bounded_jsonl' },
  { ...VALID_GROK_BUILD, reason: 'unknown_system_subtype', expected: 'known_event_shape' },
  { ...VALID_GROK_BUILD, reason: 'protocol_drift', expected: 'adapter_contract' },
  { ...VALID_GROK_BUILD, reason: 'invalid_order', expected: 'adapter_contract' },
  { ...VALID_GROK_BUILD, eventIndex: 0 },
  { ...VALID_GROK_BUILD, eventIndex: 4098 },
  { ...VALID_GROK_BUILD, eventIndex: 1.5 },
  { ...VALID_GROK_BUILD, issuePaths: sparsePaths },
  { ...VALID_GROK_BUILD, issuePaths: Array.from({ length: 17 }, () => 'shape') },
  { ...VALID_GROK_BUILD, issuePaths: ['/private/path'] },
  { ...VALID_GROK_BUILD, issuePaths: ['secret'] },
  { ...VALID_GROK_BUILD, issuePaths: ['message.'.concat('x'.repeat(129))] },
  { ...VALID_GROK_BUILD, issuePaths: [1] },
  { ...VALID_GROK_BUILD, rawMessage: 'provider-output' },
  { ...VALID_GROK_BUILD, event: 'provider-output' },
  { ...VALID_GROK_BUILD, path: '/private/path' },
  { ...VALID_GROK_BUILD, argv: ['--secret'] },
  { ...VALID_GROK_BUILD, env: { TOKEN: 'secret' } },
  { ...VALID_GROK_BUILD, task: 'private task' },
  { ...VALID_GROK_BUILD, secret: 'secret' },
  { ...VALID_GROK_BUILD, model: 'private-model' },
  { ...VALID_GROK_BUILD, config: 'private-config' },
  accessor,
  symbolDetail,
  new Proxy({}, { getPrototypeOf() { throw new Error('provider-output'); } }),
];

for (const value of malformed) {
  assert.doesNotThrow(() => validateAgentProtocolDriftDetail(value),
    'malformed values never throw');
  assert.strictEqual(validateAgentProtocolDriftDetail(value), null,
    'malformed, cross-provider, raw, or unbounded values fail closed');
}
assert.strictEqual(accessorCalls, 0, 'validation never invokes caller accessors');
console.log('  PASS: exact provider reasons, indices, paths, profiles, and own-data shape are enforced');

console.log('--- D64-11 independent two-provider pre-throttle ---');

_resetForTests();
assert.strictEqual(REPORT_WINDOW_MS, 10000, 'reporting window remains exactly 10 seconds');
assert.strictEqual(MAX_ADAPTER_TIMESTAMPS, 2, 'timestamp map is capped to two shipped adapters');

let now = 0;
const sinkCalls = [];
const options = {
  now: () => now,
  rateLimitedWarn(...args) { sinkCalls.push(args); },
};

assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, options), true,
  'first Claude detail is admitted at t=0');
assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, options), false,
  'same-provider repeat is suppressed');
assert.strictEqual(reportAgentProtocolDrift(VALID_GROK_BUILD, options), true,
  'Grok Build is independently admitted at the same timestamp');
assert.strictEqual(reportAgentProtocolDrift(VALID_GROK_BUILD, options), false,
  'Grok Build repeat is independently suppressed');
assert.strictEqual(sinkCalls.length, 2, 'one report per provider reaches the sink');
assert.strictEqual(_getTrackedAdapterCount(), 2, 'both and only shipped providers are tracked');

for (const [index, detail] of [VALID_CLAUDE, VALID_GROK_BUILD].entries()) {
  assert.deepStrictEqual(sinkCalls[index].slice(0, 3), [
    'BG', 'agent-protocol-drift', 'Agent protocol drift detected',
  ], 'sink receives the fixed category and message');
  assert.deepStrictEqual(sinkCalls[index][3], detail, 'sink receives the exact sanitized detail');
  assert.notStrictEqual(sinkCalls[index][3], detail, 'sink receives a fresh safe allocation');
  assert.deepStrictEqual(ownKeys(sinkCalls[index][3]), [
    'adapterId', 'eventIndex', 'expected', 'issuePaths', 'profileVersion', 'reason',
  ], 'sink context cannot grow raw diagnostic fields');
}

now = 9999;
assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, options), false,
  'Claude remains suppressed below its boundary');
assert.strictEqual(reportAgentProtocolDrift(VALID_GROK_BUILD, options), false,
  'Grok Build remains suppressed below its boundary');
now = 10000;
assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, options), true,
  'Claude exact boundary is admitted');
assert.strictEqual(reportAgentProtocolDrift(VALID_GROK_BUILD, options), true,
  'Grok Build exact boundary is admitted independently');
now = 9000;
assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, options), true,
  'Claude clock rollback admits without changing Grok Build state');
assert.strictEqual(_getTrackedAdapterCount(), 2, 'timestamp state remains at its closed cap');
console.log('  PASS: Claude and Grok Build rate limits are deterministic and independent');

console.log('--- D64-11 fail-closed and best-effort boundaries ---');

const canary = 'prompt=session-token-/private/path-provider-output';
const rejectedSinkCalls = [];
for (const value of malformed.concat([{ ...VALID_GROK_BUILD, rawMessage: canary }])) {
  assert.doesNotThrow(() => reportAgentProtocolDrift(value, {
    now: () => 30000,
    rateLimitedWarn(...args) { rejectedSinkCalls.push(args); },
  }), 'reporter never throws for rejected input');
}
assert.strictEqual(rejectedSinkCalls.length, 0, 'rejected values never reach the sink');
assert(!JSON.stringify(rejectedSinkCalls).includes(canary), 'raw canary is absent from sink output');

_resetForTests();
assert.doesNotThrow(() => reportAgentProtocolDrift(VALID_GROK_BUILD, { now: () => 0 }),
  'missing sink is best-effort');
assert.strictEqual(reportAgentProtocolDrift(VALID_GROK_BUILD, { now: () => 1 }), false,
  'missing-sink repeat remains throttled');

_resetForTests();
assert.doesNotThrow(() => reportAgentProtocolDrift(VALID_GROK_BUILD, {
  now: () => 0,
  rateLimitedWarn() { throw new Error(canary); },
}), 'throwing sink is best-effort');
assert.strictEqual(reportAgentProtocolDrift(VALID_GROK_BUILD, {
  now: () => 1,
  rateLimitedWarn() { throw new Error(canary); },
}), false, 'throwing sink cannot bypass later throttling');

_resetForTests();
assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, {
  now: () => NaN,
  rateLimitedWarn() {},
}), false, 'invalid clocks fail closed');
assert.strictEqual(reportAgentProtocolDrift(VALID_CLAUDE, {
  now() { throw new Error(canary); },
  rateLimitedWarn() {},
}), false, 'throwing clocks fail closed');

const hostileOptions = {};
Object.defineProperty(hostileOptions, 'now', { get() { throw new Error(canary); } });
assert.doesNotThrow(() => reportAgentProtocolDrift(VALID_CLAUDE, hostileOptions),
  'hostile options never propagate');
assert.strictEqual(_getTrackedAdapterCount() <= MAX_ADAPTER_TIMESTAMPS, true,
  'timestamp state never exceeds its hard cap');
console.log('  PASS: raw values are silent and missing or throwing dependencies remain observational');

console.log('\nAll assertions passed.');
