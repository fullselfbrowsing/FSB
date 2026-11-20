/**
 * Phase 67-07 (JEV-06, JEV-05) -- FsbJevPolicy tighten-only proof.
 *
 * JEV-06: Jev can add a confirmation but can never remove one, bypass a
 * safety breaker, or authorize an action on its own (CONTEXT D-28..D-30).
 * JEV-05: nothing acts before calibration; under the shipped UNCALIBRATED
 * profile accept() is false for every kind.
 *
 *   A  module shape, inert load and CONSTANTS parity with the server CONTRACT
 *   B  accept(): every reason, the fields it reads, UNCALIBRATED, totality
 *   C  normalizeGate / combineGates over the real gate outputs
 *   D  the exhaustive cross product: every existing-gate state x every Jev
 *      outcome x failClosed in {false, true}
 *   E  the real checkSafetyBreakers / detectStuck exports return identical
 *      sequences with and without hostile Jev fields on the session
 *      (fresh sessions per arm, stubbed Date.now; RESEARCH Pitfall 7)
 *   F  the real HookPipeline with the real createPermissionHook: a denial
 *      survives in both registration orders, plus the control case showing
 *      that a stopping handler would hide it (RESEARCH Pitfall 4)
 *
 * The real stuck rows come from the real detectStuck export, the breaker
 * rows from the real checkSafetyBreakers export and the permission rows from
 * the real createPermissionHook, so a change in any of those shapes breaks
 * this suite. Calibrated and uncalibrated Jev results are produced by the
 * server's own applyCalibration (showcase/server/src/jev/calibration.js), so
 * producer and consumer are held to the same shapes.
 *
 * Run: node tests/jev-policy-tighten-only.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { CONTRACT } = require('../showcase/server/src/jev/contract.js');
const calibration = require('../showcase/server/src/jev/calibration.js');
const { INSTRUMENT_HASH } = require('../showcase/server/src/jev/instrument.js');
const { detectStuck, checkSafetyBreakers } = require('../extension/ai/agent-loop.js');
const { createPermissionHook } = require('../extension/ai/hooks/permission-hook.js');
const { HookPipeline, LIFECYCLE_EVENTS } = require('../extension/ai/hook-pipeline.js');
const Policy = require('../extension/ai/jev-policy.js');

const POLICY_PATH = path.join(__dirname, '..', 'extension', 'ai', 'jev-policy.js');

let passed = 0;
let failed = 0;
let printedFailures = 0;

function safeJson(value) {
  try {
    const out = JSON.stringify(value);
    return out === undefined ? String(value) : out;
  } catch (_e) {
    return '[unserializable]';
  }
}

/** Count a check. Bulk checks (quiet) print only their failures. */
function check(cond, msg, quiet) {
  if (cond) {
    passed += 1;
    if (!quiet) console.log('  PASS:', msg);
    return true;
  }
  failed += 1;
  if (printedFailures < 80) console.error('  FAIL:', msg);
  printedFailures += 1;
  return false;
}

function checkDeep(actual, expected, msg, quiet) {
  let detail = '';
  try {
    assert.deepStrictEqual(actual, expected);
  } catch (_e) {
    detail = ' (expected ' + safeJson(expected) + ', got ' + safeJson(actual) + ')';
  }
  return check(detail === '', msg + detail, quiet);
}

function noThrow(fn) {
  try {
    return { threw: false, value: fn() };
  } catch (err) {
    return { threw: true, error: err };
  }
}

function sameKeys(value, keys) {
  return value !== null && typeof value === 'object'
    && Object.keys(value).slice().sort().join(',') === keys.slice().sort().join(',');
}

function deepFreeze(node) {
  if (node !== null && typeof node === 'object' && !Object.isFrozen(node)) {
    Object.keys(node).forEach((key) => deepFreeze(node[key]));
    Object.freeze(node);
  }
  return node;
}

/** Run fn with Date.now pinned to `now`; always restores the real clock. */
function withNow(now, fn) {
  const realNow = Date.now;
  Date.now = () => now;
  try {
    return fn();
  } finally {
    Date.now = realNow;
  }
}

// The session factory from tests/stuck-action-repetition.test.js:41-46.
function makeSession() {
  return {
    agentState: { consecutiveNoChangeCount: 0, actionFingerprints: [], stuckWarningCount: 0 },
    actionHistory: []
  };
}

function clickResultsFor(selector) {
  return [{ callId: 'c-' + selector, name: 'click', args: { selector: selector }, result: { success: true, hadEffect: true } }];
}

const ACCEPT_REASONS = ['not_ok', 'not_calibrated', 'kind_absent', 'threshold_null', 'below_threshold', 'catch_all', 'malformed'];
const KINDS = CONTRACT.KINDS;
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);

// ---------------------------------------------------------------------------
// Jev result fixtures, produced by the server's own calibration code
// ---------------------------------------------------------------------------

const PIN = 'typesafe/jev-1.13';
const SNAPSHOT = 'typesafe/jev-1.13-20260917';

// A test-only calibrated profile (never written under profiles/). Risk flags
// at or above 0.6; completion vetoes "done" at or below 0.2.
const TEST_PROFILE = deepFreeze({
  schemaVersion: 1,
  profileId: 'test-calibrated-v1',
  status: 'calibrated',
  note: 'test-only profile for tests/jev-policy-tighten-only.test.js',
  model: PIN,
  snapshot: SNAPSHOT,
  instrumentVersion: 'test-instrument',
  instrumentHash: INSTRUMENT_HASH,
  thresholds: { operation: 0.8, target: 0.8, completion: 0.2, stuck: 0.7, risk: 0.6 }
});

function choiceAnswer(choice, confidence, other) {
  const probabilities = {};
  probabilities[choice] = confidence;
  probabilities[other] = Math.round((1 - confidence) * 1e6) / 1e6;
  return { type: 'choice', choice: choice, confidence: confidence, probabilities: probabilities };
}

function noulAnswer(p) {
  return { type: 'noul', noul: p };
}

const HIGH_ANSWERS = {
  operation: choiceAnswer('click', 0.97, 'none_of_the_above'),
  target: choiceAnswer('e3', 0.96, 'none_of_the_above'),
  completion: noulAnswer(0.03),
  stuck: noulAnswer(0.95),
  risk: noulAnswer(0.98)
};

function envelope(applied, servedModel) {
  return {
    ok: true,
    decisionId: 'jd_policy_test',
    instrumentVersion: 'test-instrument',
    servedModel: servedModel,
    calibration: applied.calibration,
    decisions: applied.decisions,
    usage: { inputTokens: 1840, source: 'provider' },
    cost: { usd: 0.0000773, source: 'provider' },
    latencyMs: 412
  };
}

/** A D-15 ok result built by the real server applyCalibration. */
function produce(answers, options) {
  const opts = options || {};
  const profile = opts.profile || TEST_PROFILE;
  const configuredModel = opts.configuredModel || PIN;
  const servedModel = opts.servedModel || SNAPSHOT;
  const applied = calibration.applyCalibration({
    profile: profile,
    configuredModel: configuredModel,
    servedModel: servedModel,
    answers: answers,
    kinds: Object.keys(answers)
  });
  return envelope(applied, servedModel);
}

function fallback(reason) {
  const status = Object.prototype.hasOwnProperty.call(CONTRACT.HTTP_STATUS_BY_REASON, reason)
    ? CONTRACT.HTTP_STATUS_BY_REASON[reason]
    : null;
  return { ok: false, fallback: reason, servedModel: null, httpStatus: status, latencyMs: 31 };
}

/** A hand-forged ok result (version skew or a hostile body). */
function forged(status, decisions) {
  return {
    ok: true,
    decisionId: 'jd_forged',
    instrumentVersion: 'test-instrument',
    servedModel: SNAPSHOT,
    calibration: { status: status, profileId: 'forged' },
    decisions: decisions,
    usage: { inputTokens: null, source: 'unavailable' },
    cost: { usd: null, source: 'unavailable' },
    latencyMs: 12
  };
}

function withExtra(result, topLevel, riskExtra) {
  const copy = JSON.parse(JSON.stringify(result));
  Object.assign(copy, topLevel || {});
  if (riskExtra && copy.decisions && copy.decisions.risk) Object.assign(copy.decisions.risk, riskExtra);
  return copy;
}

function throwingGetter(target, key) {
  Object.defineProperty(target, key, {
    enumerable: true,
    get() { throw new Error('hostile getter ' + key); }
  });
  return target;
}

function throwingProxy() {
  const trap = () => { throw new Error('hostile proxy'); };
  return new Proxy({}, {
    get: trap, has: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap,
    defineProperty: trap, set: trap, deleteProperty: trap, isExtensible: trap, preventExtensions: trap
  });
}

function revokedProxy() {
  const r = Proxy.revocable({}, {});
  r.revoke();
  return r.proxy;
}

const HOSTILE_APPROVAL = { authorize: true, skipConfirmation: true, approved: true };

/**
 * Every Jev outcome. `risk` is what accept(result, 'risk') must give: 'flag'
 * for a calibrated at-threshold risk flag, otherwise the rejection reason.
 * `twin` names a non-hostile outcome whose merge must be identical.
 */
function buildOutcomes() {
  const out = [];
  const add = (id, result, risk, twin) => out.push({ id: id, result: result, risk: risk, twin: twin || null });

  // Calibrated, produced by the real server code.
  add('calibrated:risk_high', produce({ risk: noulAnswer(0.93) }), 'flag');
  add('calibrated:risk_at_threshold', produce({ risk: noulAnswer(0.6) }), 'flag');
  add('calibrated:risk_just_below', produce({ risk: noulAnswer(0.59) }), 'below_threshold');
  add('calibrated:risk_low', produce({ risk: noulAnswer(0.02) }), 'below_threshold');
  add('calibrated:risk_absent', produce({ operation: HIGH_ANSWERS.operation }), 'kind_absent');
  add('calibrated:risk_absent_all_others_acting', produce({
    operation: HIGH_ANSWERS.operation, target: HIGH_ANSWERS.target,
    completion: HIGH_ANSWERS.completion, stuck: HIGH_ANSWERS.stuck
  }), 'kind_absent');
  add('calibrated:all_kinds_risk_high', produce(HIGH_ANSWERS), 'flag');
  add('calibrated:operation_acting_risk_low', produce({ operation: HIGH_ANSWERS.operation, risk: noulAnswer(0.1) }), 'below_threshold');
  add('calibrated:catch_all_operation_risk_low', produce({
    operation: choiceAnswer('none_of_the_above', 0.95, 'click'), risk: noulAnswer(0.1)
  }), 'below_threshold');

  // Every typed fallback (D-16), including timeout, network_error and aborted.
  CONTRACT.FALLBACK_REASONS.forEach((reason) => add('fallback:' + reason, fallback(reason), 'not_ok'));
  add('fallback:no_reason', { ok: false }, 'not_ok');

  // Uncalibrated and snapshot_changed, produced by the real server code.
  add('uncalibrated:shipped_profile_risk_high', produce({ risk: noulAnswer(0.99) }, {
    profile: calibration.UNCALIBRATED_PROFILE, servedModel: PIN
  }), 'not_calibrated');
  add('uncalibrated:shipped_profile_all_kinds', produce(HIGH_ANSWERS, {
    profile: calibration.UNCALIBRATED_PROFILE, servedModel: SNAPSHOT
  }), 'not_calibrated');
  add('uncalibrated:served_model_out_of_family', produce({ risk: noulAnswer(0.99) }, {
    servedModel: 'typesafe/jev-1.14'
  }), 'not_calibrated');
  add('snapshot_changed:real', produce({ risk: noulAnswer(0.99) }, {
    servedModel: 'typesafe/jev-1.13-20261001'
  }), 'not_calibrated');

  // Version skew: statuses that still carry thresholds and meetsThreshold true.
  add('snapshot_changed:forged_meets', forged('snapshot_changed', { risk: { p: 0.97, threshold: 0.6, meetsThreshold: true } }), 'not_calibrated');
  add('uncalibrated:forged_meets', forged('uncalibrated', { risk: { p: 0.97, threshold: 0.6, meetsThreshold: true } }), 'not_calibrated');
  add('status:uppercase_calibrated', forged('CALIBRATED', { risk: { p: 0.97, threshold: 0.6, meetsThreshold: true } }), 'not_calibrated');
  add('status:unknown_string', forged('approved', { risk: { p: 0.97, threshold: 0.6, meetsThreshold: true } }), 'not_calibrated');
  add('calibrated:threshold_null_meets', forged('calibrated', { risk: { p: 0.97, threshold: null, meetsThreshold: true } }), 'threshold_null');
  add('calibrated:threshold_null_below', forged('calibrated', { risk: { p: 0.97, threshold: null, meetsThreshold: false } }), 'threshold_null');

  // Malformed bodies.
  add('malformed:null', null, 'malformed');
  add('malformed:undefined', undefined, 'malformed');
  add('malformed:string', 'ok', 'malformed');
  add('malformed:number', 42, 'malformed');
  add('malformed:array', [], 'malformed');
  add('malformed:empty_object', {}, 'malformed');
  add('malformed:ok_true_only', { ok: true }, 'malformed');
  add('malformed:ok_string_true', withExtra(produce({ risk: noulAnswer(0.93) }), { ok: 'true' }), 'malformed');
  add('malformed:no_decisions', { ok: true, calibration: { status: 'calibrated', profileId: 'x' } }, 'malformed');
  add('malformed:calibration_string', withExtra(produce({ risk: noulAnswer(0.93) }), { calibration: 'calibrated' }), 'malformed');
  add('malformed:calibration_null', withExtra(produce({ risk: noulAnswer(0.93) }), { calibration: null }), 'malformed');
  add('malformed:status_not_string', withExtra(produce({ risk: noulAnswer(0.93) }), { calibration: { status: true } }), 'malformed');
  add('malformed:decisions_array', withExtra(produce({ risk: noulAnswer(0.93) }), { decisions: [] }), 'malformed');
  add('malformed:risk_string', forged('calibrated', { risk: 'high' }), 'malformed');
  add('malformed:risk_null', forged('calibrated', { risk: null }), 'malformed');
  add('malformed:threshold_string', forged('calibrated', { risk: { p: 0.97, threshold: '0.6', meetsThreshold: true } }), 'malformed');
  add('malformed:threshold_nan', forged('calibrated', { risk: { p: 0.97, threshold: NaN, meetsThreshold: true } }), 'malformed');
  add('malformed:threshold_above_one', forged('calibrated', { risk: { p: 0.97, threshold: 1.5, meetsThreshold: true } }), 'malformed');
  add('malformed:meets_string', forged('calibrated', { risk: { p: 0.97, threshold: 0.6, meetsThreshold: 'true' } }), 'malformed');
  add('malformed:meets_number', forged('calibrated', { risk: { p: 0.97, threshold: 0.6, meetsThreshold: 1 } }), 'malformed');
  add('malformed:p_above_one', forged('calibrated', { risk: { p: 1.7, threshold: 0.6, meetsThreshold: true } }), 'malformed');
  add('malformed:p_nan', forged('calibrated', { risk: { p: NaN, threshold: 0.6, meetsThreshold: true } }), 'malformed');
  add('malformed:p_string', forged('calibrated', { risk: { p: '0.9', threshold: 0.6, meetsThreshold: true } }), 'malformed');
  add('malformed:throwing_getter_decisions', throwingGetter(forged('calibrated', {}), 'decisions'), 'malformed');
  add('malformed:throwing_getter_ok', throwingGetter({}, 'ok'), 'malformed');
  add('malformed:throwing_proxy', throwingProxy(), 'malformed');
  add('malformed:revoked_proxy', revokedProxy(), 'malformed');

  // Hostile extra fields (D-29): none of them may change anything.
  add('hostile:negative_p', forged('calibrated', { risk: { p: -0.5, threshold: 0.6, meetsThreshold: true } }), 'malformed');
  add('hostile:flag_with_approval_fields', withExtra(produce({ risk: noulAnswer(0.93) }), HOSTILE_APPROVAL), 'flag', 'calibrated:risk_high');
  add('hostile:flag_with_downgrade_fields', withExtra(produce({ risk: noulAnswer(0.93) }), {
    jevContribution: 'none', level: 0, levelName: 'proceed', requiresConfirmation: false, blocked: false
  }, { approved: true, override: 'proceed', label: 'human approved' }), 'flag', 'calibrated:risk_high');
  add('hostile:below_with_approval_fields', withExtra(produce({ risk: noulAnswer(0.59) }), HOSTILE_APPROVAL), 'below_threshold', 'calibrated:risk_just_below');
  add('hostile:below_human_approved_label', withExtra(produce({ risk: noulAnswer(0.59) }), null, {
    label: 'human approved', approved: true, authorize: true
  }), 'below_threshold', 'calibrated:risk_just_below');
  add('hostile:uncalibrated_fake_decision_status', withExtra(produce({ risk: noulAnswer(0.99) }, {
    profile: calibration.UNCALIBRATED_PROFILE, servedModel: PIN
  }), HOSTILE_APPROVAL, {
    status: 'calibrated', calibration: { status: 'calibrated' }, label: 'human approved'
  }), 'not_calibrated', 'uncalibrated:shipped_profile_risk_high');
  add('hostile:fallback_with_approval_and_flag', Object.assign(fallback('timeout'), HOSTILE_APPROVAL, {
    calibration: { status: 'calibrated', profileId: 'forged' },
    decisions: { risk: { p: 0.99, threshold: 0.6, meetsThreshold: true } }
  }), 'not_ok', 'fallback:timeout');
  add('hostile:absent_with_toplevel_risk', withExtra(produce({ operation: HIGH_ANSWERS.operation }), {
    risk: { p: 0.99, threshold: 0.6, meetsThreshold: true }
  }), 'kind_absent', 'calibrated:risk_absent');
  add('hostile:inherited_risk_decision', (() => {
    const result = produce({ operation: HIGH_ANSWERS.operation });
    const inherited = Object.create({ risk: { p: 0.99, threshold: 0.6, meetsThreshold: true } });
    inherited.operation = result.decisions.operation;
    result.decisions = inherited;
    return result;
  })(), 'kind_absent', 'calibrated:risk_absent');

  return out;
}

const OUTCOMES = buildOutcomes();
const OUTCOME_BY_ID = new Map(OUTCOMES.map((o) => [o.id, o]));

// ---------------------------------------------------------------------------
// Real gate outputs
// ---------------------------------------------------------------------------

function realStuckRows() {
  const notStuck = detectStuck(makeSession(), clickResultsFor('#benign'));

  const warnSession = makeSession();
  let hintOnly = null;
  for (let i = 0; i < 3; i += 1) hintOnly = detectStuck(warnSession, clickResultsFor('#warn-target'));

  const forceSession = makeSession();
  let forceStop = null;
  for (let i = 0; i < 5; i += 1) forceStop = detectStuck(forceSession, clickResultsFor('#dropdown'));

  return { notStuck: notStuck, hintOnly: hintOnly, forceStop: forceStop };
}

function realBreakerRows() {
  const atCap = makeSession();
  atCap.maxIterations = 3;
  atCap.agentState.iterationCount = 3;
  atCap.agentState.startTime = T0;
  const iterationStop = withNow(T0, () => checkSafetyBreakers(atCap));

  const late = makeSession();
  late.maxIterations = 50;
  late.safetyConfig = { timeLimit: 60000 };
  late.agentState.iterationCount = 1;
  late.agentState.startTime = T0;
  const timeStop = withNow(T0 + 60000, () => checkSafetyBreakers(late));

  const fresh = makeSession();
  fresh.maxIterations = 50;
  fresh.safetyConfig = { timeLimit: 60000 };
  fresh.agentState.iterationCount = 0;
  fresh.agentState.startTime = T0;
  const go = withNow(T0 + 1000, () => checkSafetyBreakers(fresh));

  return { iterationStop: iterationStop, timeStop: timeStop, go: go };
}

function realPermissionRows() {
  const denying = createPermissionHook({ isAllowed: () => false, createDenial: (t) => ({ tool: t, reason: 'test_denied' }) });
  const allowing = createPermissionHook({ isAllowed: () => true, createDenial: (t) => ({ tool: t, reason: 'test_denied' }) });
  const ctx = { toolName: 'click', origin: 'https://example.test' };
  return { denied: denying(ctx), allowed: allowing(ctx) };
}

const STUCK = realStuckRows();
const BREAKERS = realBreakerRows();
const PERMISSION = realPermissionRows();

/**
 * Every existing-gate state. `gate()` builds the existingGate handed to
 * mergeConfirmation (one normalized gate, an array, or a raw malformed value);
 * `level` is the level this suite expects for it, written out by hand.
 */
function buildGates() {
  const N = Policy.normalizeGate;
  const out = [];
  const add = (id, gate, level) => out.push({ id: id, gate: gate, level: level });

  // Consent (capability-router.js _evaluateConsent; :806-814 blocks every non-allow verdict).
  add('consent:allow', () => N.consent('allow'), 0);
  add('consent:allow_object', () => N.consent({ decision: 'allow', method: 'GET', sideEffectClass: 'read' }), 0);
  add('consent:ask', () => N.consent({ decision: 'ask', method: 'POST', sideEffectClass: 'write', error: { code: 'RECIPE_CONSENT_REQUIRED' } }), 2);
  add('consent:off', () => N.consent('off'), 2);
  add('consent:blocked', () => N.consent({ decision: 'blocked', method: 'GET', sideEffectClass: 'read', error: { code: 'RECIPE_CONSENT_BLOCKED' } }), 2);
  add('consent:mutating_required', () => N.consent('mutating_required'), 2);
  add('consent:unknown_string', () => N.consent('maybe'), 2);
  add('consent:wrong_case', () => N.consent('ALLOW'), 2);
  add('consent:null', () => N.consent(null), 2);

  // Payment fill (tool-executor.js confirmation results).
  add('paymentFill:approved', () => N.paymentFill({ approved: true }), 0);
  add('paymentFill:timeout', () => N.paymentFill({ approved: false, reason: 'timeout' }), 2);
  add('paymentFill:user_declined', () => N.paymentFill({ approved: false, reason: 'user_declined' }), 2);
  add('paymentFill:sidepanel_unavailable', () => N.paymentFill({ approved: false, reason: 'sidepanel_unavailable' }), 2);
  add('paymentFill:other_reason', () => N.paymentFill({ approved: false, reason: 'something_else' }), 2);
  add('paymentFill:malformed_null', () => N.paymentFill(null), 2);
  add('paymentFill:approved_string', () => N.paymentFill({ approved: 'yes' }), 2);

  // Permission hook (real createPermissionHook outputs).
  add('permission:denied', () => N.permission(PERMISSION.denied), 2);
  add('permission:allowed', () => N.permission(PERMISSION.allowed), 0);
  add('permission:malformed_null', () => N.permission(null), 2);
  add('permission:denied_string', () => N.permission({ shouldStop: false, denied: 'false' }), 2);

  // Safety breakers (real checkSafetyBreakers outputs).
  add('safetyBreakers:iteration_cap', () => N.safetyBreakers(BREAKERS.iterationStop), 3);
  add('safetyBreakers:time_limit', () => N.safetyBreakers(BREAKERS.timeStop), 3);
  add('safetyBreakers:go', () => N.safetyBreakers(BREAKERS.go), 0);
  add('safetyBreakers:malformed_undefined', () => N.safetyBreakers(undefined), 3);
  add('safetyBreakers:should_stop_string', () => N.safetyBreakers({ shouldStop: 'false', reason: null }), 3);

  // Stuck detection (real detectStuck outputs, then malformed inputs).
  add('stuck:not_stuck', () => N.stuck(STUCK.notStuck), 0);
  add('stuck:hint_only', () => N.stuck(STUCK.hintOnly), 0);
  add('stuck:force_stop', () => N.stuck(STUCK.forceStop), 3);
  add('stuck:null', () => N.stuck(null), 3);
  add('stuck:empty_object', () => N.stuck({}), 3);
  add('stuck:force_without_stuck', () => N.stuck({ isStuck: false, shouldForceStop: true, reasonCode: null, hint: null }), 3);
  add('stuck:is_stuck_string', () => N.stuck({ isStuck: 'true', shouldForceStop: false, reasonCode: null, hint: null }), 3);

  // Combined gates (an array is merged with combineGates).
  add('combined:empty', () => [], 0);
  add('combined:all_clear', () => [N.consent('allow'), N.permission(PERMISSION.allowed), N.safetyBreakers(BREAKERS.go), N.stuck(STUCK.notStuck)], 0);
  add('combined:payment_approved_and_stuck_hint', () => [N.paymentFill({ approved: true }), N.stuck(STUCK.hintOnly)], 0);
  add('combined:consent_allow_permission_denied', () => [N.consent('allow'), N.permission(PERMISSION.denied)], 2);
  add('combined:consent_ask_payment_approved', () => [N.consent('ask'), N.paymentFill({ approved: true })], 2);
  add('combined:permission_denied_breaker_stop', () => [N.permission(PERMISSION.denied), N.safetyBreakers(BREAKERS.iterationStop)], 3);
  add('combined:consent_allow_stuck_force', () => [N.consent('allow'), N.stuck(STUCK.forceStop)], 3);
  add('combined:clear_plus_malformed_entry', () => [N.consent('allow'), 'junk'], 2);
  add('combined:stop_plus_malformed_entry', () => [N.safetyBreakers(BREAKERS.timeStop), null], 3);

  // Raw malformed existing gates count as deny.
  add('raw:null', () => null, 2);
  add('raw:undefined', () => undefined, 2);
  add('raw:level_string', () => ({ level: '0', source: 'consent' }), 2);
  add('raw:level_negative', () => ({ level: -1, source: 'consent' }), 2);
  add('raw:level_too_high', () => ({ level: 9, source: 'consent' }), 2);
  add('raw:level_fraction', () => ({ level: 0.5, source: 'consent' }), 2);
  add('raw:unnormalized_breaker', () => ({ shouldStop: false, reason: null }), 2);
  add('raw:throwing_proxy', () => throwingProxy(), 2);

  return out;
}

// ---------------------------------------------------------------------------
// Section A -- module shape, inert load, CONSTANTS parity
// ---------------------------------------------------------------------------

function sectionA() {
  console.log('\n--- A: module shape, inert load and CONSTANTS parity ---');

  const API_KEYS = ['LEVELS', 'LEVEL_NAMES', 'CONSTANTS', 'accept', 'normalizeGate', 'combineGates', 'mergeConfirmation', 'toBeforeToolResult'];
  check(sameKeys(Policy, API_KEYS), 'FsbJevPolicy exports exactly ' + API_KEYS.join(', '));
  checkDeep(Policy.LEVELS, { proceed: 0, confirm: 1, deny: 2, stop: 3 }, 'LEVELS is {proceed:0, confirm:1, deny:2, stop:3}');
  checkDeep(Policy.LEVEL_NAMES, ['proceed', 'confirm', 'deny', 'stop'], 'LEVEL_NAMES is [proceed, confirm, deny, stop]');
  check(sameKeys(Policy.normalizeGate, ['consent', 'paymentFill', 'permission', 'safetyBreakers', 'stuck']),
    'normalizeGate has exactly consent, paymentFill, permission, safetyBreakers, stuck');
  check(Object.isFrozen(Policy) && Object.isFrozen(Policy.LEVELS) && Object.isFrozen(Policy.LEVEL_NAMES)
    && Object.isFrozen(Policy.CONSTANTS) && Object.isFrozen(Policy.CONSTANTS.KINDS) && Object.isFrozen(Policy.normalizeGate),
  'the API, LEVELS, LEVEL_NAMES, CONSTANTS and normalizeGate are frozen');

  checkDeep(Policy.CONSTANTS, {
    KINDS: CONTRACT.KINDS,
    CHOICE_KINDS: CONTRACT.CHOICE_KINDS,
    NOUL_KINDS: CONTRACT.NOUL_KINDS,
    RESERVED_OPTION_KEY: CONTRACT.RESERVED_OPTION_KEY
  }, 'CONSTANTS deep-equals the server CONTRACT KINDS, CHOICE_KINDS, NOUL_KINDS and RESERVED_OPTION_KEY');

  // Inert load: a bare context with no browser, network, timer or storage global.
  const source = fs.readFileSync(POLICY_PATH, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const load = noThrow(() => vm.runInContext(source, sandbox, { filename: 'jev-policy.js' }));
  check(!load.threw, 'loads in a bare vm context with no chrome, fetch or timers');
  checkDeep(Object.keys(sandbox), ['FsbJevPolicy'], 'adds exactly one global, FsbJevPolicy');
  check(sandbox.FsbJevPolicy && typeof sandbox.FsbJevPolicy.mergeConfirmation === 'function',
    'the vm global exposes mergeConfirmation');

  // Source rules (D-17) and the never-stop rule.
  const forbidden = [
    [/^(const|let|class) /m, 'top-level const/let/class'],
    [/chrome\./, 'chrome.'],
    [/fetch\(/, 'fetch('],
    [/setTimeout|setInterval/, 'timers'],
    [/importScripts/, 'the importScripts token'],
    [/systemone/i, 'the upstream path name'],
    [/shouldStop *: *true|shouldStop *= *true/, 'a stopping hook result'],
    [/Date\.now|Math\.random/, 'clock or randomness']
  ];
  forbidden.forEach(([re, label]) => check(!re.test(source), 'jev-policy.js source has no ' + label));
  check(/^\(function initFsbJevPolicy\(root\) \{\n {2}'use strict';/m.test(source)
    && /\}\)\(typeof globalThis !== 'undefined' \? globalThis : self\);\s*$/.test(source),
  'jev-policy.js is one IIFE over globalThis/self');
}

// ---------------------------------------------------------------------------
// Section B -- accept()
// ---------------------------------------------------------------------------

// The effect an accepted Noul names (WR-07). An accepted completion is a veto
// of "done" (p at or below its threshold), never a confirmation of it.
const NOUL_EFFECTS = { completion: 'veto_completion', stuck: 'flag_stuck', risk: 'flag_risk' };

function expectedAccept(outcome, kind) {
  if (kind !== 'risk') return null;
  if (outcome.risk === 'flag') return { accepted: true, kind: 'risk', p: outcome.result.decisions.risk.p, effect: 'flag_risk' };
  return { accepted: false, reason: outcome.risk };
}

/** Wrap a value so every string-keyed read is logged as a dotted path. */
function recordReads(value, log, prefix) {
  if (value === null || typeof value !== 'object') return value;
  return new Proxy(value, {
    get(target, key, receiver) {
      if (typeof key === 'string') {
        const p = prefix ? prefix + '.' + key : key;
        log.add(p);
        return recordReads(Reflect.get(target, key, receiver), log, p);
      }
      log.add('<symbol>');
      return Reflect.get(target, key, receiver);
    }
  });
}

function sectionB() {
  console.log('\n--- B: accept() ---');

  // Every outcome gives the expected risk verdict, and accept is total for every kind.
  let shapeOk = true;
  let riskOk = true;
  const badShape = [];
  const badRisk = [];
  OUTCOMES.forEach((outcome) => {
    KINDS.concat(['bogus', '', 'RISK', '__proto__', 'constructor']).forEach((kind) => {
      const r = noThrow(() => Policy.accept(outcome.result, kind));
      const v = r.value;
      const valid = !r.threw && v !== null && typeof v === 'object' && (
        (v.accepted === false && sameKeys(v, ['accepted', 'reason']) && ACCEPT_REASONS.includes(v.reason))
        || (v.accepted === true && v.kind === kind && KINDS.includes(kind) && (
          (CONTRACT.CHOICE_KINDS.includes(kind) && sameKeys(v, ['accepted', 'kind', 'choice']) && typeof v.choice === 'string'
            && v.choice !== CONTRACT.RESERVED_OPTION_KEY)
          || (CONTRACT.NOUL_KINDS.includes(kind) && sameKeys(v, ['accepted', 'kind', 'p', 'effect']) && typeof v.p === 'number'
            && v.p >= 0 && v.p <= 1 && v.effect === NOUL_EFFECTS[kind]))));
      if (!valid) { shapeOk = false; badShape.push(outcome.id + '/' + kind + ' -> ' + safeJson(v)); }
      if (!KINDS.includes(kind) && !(v && v.accepted === false && v.reason === 'malformed')) {
        shapeOk = false; badShape.push(outcome.id + '/' + kind + ' (unknown kind) -> ' + safeJson(v));
      }
    });
    const risk = Policy.accept(outcome.result, 'risk');
    const want = expectedAccept(outcome, 'risk');
    try { assert.deepStrictEqual(risk, want); } catch (_e) { riskOk = false; badRisk.push(outcome.id + ' -> ' + safeJson(risk) + ' want ' + safeJson(want)); }
  });
  check(shapeOk, 'accept() never throws and returns an exact-key verdict for ' + OUTCOMES.length
    + ' outcomes x ' + (KINDS.length + 5) + ' kinds; unknown kinds are malformed' + (badShape.length ? ' ' + badShape.slice(0, 5).join('; ') : ''));
  check(riskOk, 'accept(result, "risk") matches the expected verdict for all ' + OUTCOMES.length + ' outcomes'
    + (badRisk.length ? ' ' + badRisk.slice(0, 5).join('; ') : ''));

  const reasonsSeen = new Set(OUTCOMES.map((o) => o.risk));
  ['flag', 'not_ok', 'not_calibrated', 'kind_absent', 'threshold_null', 'below_threshold', 'malformed'].forEach((reason) => {
    check(reasonsSeen.has(reason), 'the outcome table exercises risk verdict ' + reason);
  });

  // Calibrated Choice and Noul acceptance, the catch-all and the completion veto.
  const all = produce(HIGH_ANSWERS);
  checkDeep(Policy.accept(all, 'operation'), { accepted: true, kind: 'operation', choice: 'click' }, 'calibrated operation at threshold is accepted with its choice');
  checkDeep(Policy.accept(all, 'target'), { accepted: true, kind: 'target', choice: 'e3' }, 'calibrated target at threshold is accepted with its choice');
  checkDeep(Policy.accept(all, 'completion'), { accepted: true, kind: 'completion', p: 0.03, effect: 'veto_completion' }, 'calibrated completion veto (p at or below 0.2) is accepted with its p and effect veto_completion');
  checkDeep(Policy.accept(all, 'stuck'), { accepted: true, kind: 'stuck', p: 0.95, effect: 'flag_stuck' }, 'calibrated stuck flag is accepted with its p and effect flag_stuck');
  checkDeep(Policy.accept(all, 'risk'), { accepted: true, kind: 'risk', p: 0.98, effect: 'flag_risk' }, 'calibrated risk flag is accepted with its p and effect flag_risk');

  // Tighten-only: an accepted completion only ever vetoes "done" (WR-07). Over
  // a grid of p, every accepted completion has p at or below its threshold,
  // names veto_completion and carries nothing that could read as "done".
  let vetoOnly = true;
  let vetoes = 0;
  const vetoProblems = [];
  for (let i = 0; i <= 100; i += 1) {
    const p = i / 100;
    const verdict = Policy.accept(produce({ completion: noulAnswer(p) }), 'completion');
    if (verdict.accepted !== true) continue;
    vetoes += 1;
    const decision = produce({ completion: noulAnswer(p) }).decisions.completion;
    const done = Object.keys(verdict).some((key) => /done|complete[d]?$|finish/i.test(key))
      || /done|confirm|finish/i.test(String(verdict.effect));
    if (verdict.effect !== 'veto_completion' || !(decision.p <= decision.threshold) || done) {
      vetoOnly = false;
      vetoProblems.push(p + ' -> ' + safeJson(verdict));
    }
  }
  check(vetoes > 0 && vetoes < 101, 'the completion grid exercises both sides of the veto cut (' + vetoes + ' of 101 accepted)');
  check(vetoOnly, 'every accepted completion is a veto_completion with p at or below its threshold, never a "done"'
    + (vetoProblems.length ? ' ' + vetoProblems.slice(0, 3).join('; ') : ''));
  check(Object.values(NOUL_EFFECTS).every((effect) => !CONTRACT.APPROVAL_KEY_DENYLIST.some((source) => new RegExp(source, 'i').test(effect)))
    && !CONTRACT.APPROVAL_KEY_DENYLIST.some((source) => new RegExp(source, 'i').test('effect')),
  'the effect key and its values match no approval deny-list source (D-29)');
  const catchAll = produce({
    operation: choiceAnswer('none_of_the_above', 0.95, 'click'),
    target: choiceAnswer('none_of_the_above', 0.95, 'e3')
  });
  check(catchAll.decisions.operation.meetsThreshold === true, 'fixture: the catch-all operation answer meets its threshold');
  checkDeep(Policy.accept(catchAll, 'operation'), { accepted: false, reason: 'catch_all' }, 'a calibrated Choice of none_of_the_above is catch_all (operation)');
  checkDeep(Policy.accept(catchAll, 'target'), { accepted: false, reason: 'catch_all' }, 'a calibrated Choice of none_of_the_above is catch_all (target)');
  const lowConfidence = produce({ operation: choiceAnswer('click', 0.55, 'none_of_the_above'), completion: noulAnswer(0.6) });
  checkDeep(Policy.accept(lowConfidence, 'operation'), { accepted: false, reason: 'below_threshold' }, 'a calibrated Choice below threshold is below_threshold');
  checkDeep(Policy.accept(lowConfidence, 'completion'), { accepted: false, reason: 'below_threshold' }, 'a completion p above the veto cut is below_threshold');
  checkDeep(Policy.accept(forged('calibrated', { operation: { choice: '', confidence: 0.9, probabilities: {}, threshold: 0.8, meetsThreshold: true } }), 'operation'),
    { accepted: false, reason: 'malformed' }, 'an empty choice string is malformed');
  checkDeep(Policy.accept(forged('calibrated', { operation: { choice: 7, confidence: 0.9, probabilities: {}, threshold: 0.8, meetsThreshold: true } }), 'operation'),
    { accepted: false, reason: 'malformed' }, 'a non-string choice is malformed');

  // JEV-05: under the shipped UNCALIBRATED profile nothing is accepted, for every kind.
  const uncal = calibration.UNCALIBRATED_PROFILE;
  check(uncal.status === 'uncalibrated' && KINDS.every((k) => uncal.thresholds[k] === null), 'fixture: the shipped profile is UNCALIBRATED with every threshold null');
  [PIN, SNAPSHOT, 'typesafe/jev-1.14', 'jev-1.13.0'].forEach((served) => {
    const result = produce(HIGH_ANSWERS, { profile: uncal, servedModel: served });
    check(KINDS.every((k) => result.decisions[k].threshold === null && result.decisions[k].meetsThreshold === false),
      'UNCALIBRATED (' + served + '): every decision has threshold null and meetsThreshold false');
    KINDS.forEach((kind) => {
      checkDeep(Policy.accept(result, kind), { accepted: false, reason: 'not_calibrated' },
        'UNCALIBRATED (' + served + '): accept(' + kind + ') is false', true);
    });
  });
  check(true, 'UNCALIBRATED: accept() is false for all 5 kinds on 4 served models (20 bulk checks above)');

  // Every profile the server ships today (and any V3 adds) stays inside the rule.
  const shipped = calibration.loadProfiles();
  check(shipped.length >= 1 && shipped[0] === uncal, 'loadProfiles() puts the UNCALIBRATED profile first');
  shipped.forEach((profile) => {
    const configured = typeof profile.model === 'string' ? profile.model : PIN;
    const served = typeof profile.snapshot === 'string' ? profile.snapshot : configured;
    const result = produce(HIGH_ANSWERS, { profile: profile, configuredModel: configured, servedModel: served });
    KINDS.forEach((kind) => {
      const verdict = Policy.accept(result, kind);
      const decision = result.decisions[kind];
      const mayAct = profile.status === 'calibrated' && result.calibration.status === 'calibrated'
        && decision.threshold !== null && decision.meetsThreshold === true;
      check(verdict.accepted === mayAct, 'shipped profile ' + profile.profileId + ': accept(' + kind + ') is ' + mayAct
        + ' (status ' + result.calibration.status + ')', true);
      if (profile.status !== 'calibrated') {
        check(verdict.accepted === false && verdict.reason === 'not_calibrated', 'shipped uncalibrated profile ' + profile.profileId + ' never accepts ' + kind, true);
      }
    });
  });
  check(true, 'every shipped profile (' + shipped.map((p) => p.profileId).join(', ') + ') stays inside the acceptance rule');

  // Hostile twins: the hostile copy gets exactly the twin's verdict for every kind.
  OUTCOMES.filter((o) => o.twin).forEach((outcome) => {
    const twin = OUTCOME_BY_ID.get(outcome.twin);
    KINDS.forEach((kind) => {
      checkDeep(Policy.accept(outcome.result, kind), Policy.accept(twin.result, kind),
        outcome.id + ': accept(' + kind + ') equals its non-hostile twin ' + twin.id, true);
    });
  });
  check(true, 'hostile approval, downgrade and "human approved" fields never change accept() for any kind');

  // accept() reads only ok, calibration.status, decisions[kind].{threshold, meetsThreshold, choice|p}.
  const allowedReads = {
    risk: ['ok', 'calibration', 'calibration.status', 'decisions', 'decisions.risk', 'decisions.risk.threshold', 'decisions.risk.meetsThreshold', 'decisions.risk.p'],
    operation: ['ok', 'calibration', 'calibration.status', 'decisions', 'decisions.operation', 'decisions.operation.threshold', 'decisions.operation.meetsThreshold', 'decisions.operation.choice']
  };
  const hostileAll = withExtra(produce(HIGH_ANSWERS), Object.assign({}, HOSTILE_APPROVAL, { level: 0, jevContribution: 'none' }), { label: 'human approved', approved: true });
  Object.keys(allowedReads).forEach((kind) => {
    const log = new Set();
    const verdict = Policy.accept(recordReads(hostileAll, log, ''), kind);
    const extra = Array.from(log).filter((p) => !allowedReads[kind].includes(p));
    check(verdict.accepted === true && extra.length === 0,
      'accept(' + kind + ') reads only ' + allowedReads[kind].join(', ') + (extra.length ? ' (also read: ' + extra.join(', ') + ')' : ''));
  });

  // accept() does not mutate its input.
  const snapshot = JSON.stringify(hostileAll);
  KINDS.forEach((kind) => Policy.accept(hostileAll, kind));
  check(JSON.stringify(hostileAll) === snapshot, 'accept() never mutates the result');
}

// ---------------------------------------------------------------------------
// Section C -- normalizeGate and combineGates
// ---------------------------------------------------------------------------

function sectionC(GATES) {
  console.log('\n--- C: normalizeGate and combineGates over the real gate outputs ---');
  const N = Policy.normalizeGate;

  // The real rows have exactly the documented shapes.
  [['not stuck', STUCK.notStuck], ['hint-only', STUCK.hintOnly], ['force-stop', STUCK.forceStop]].forEach(([label, row]) => {
    check(sameKeys(row, ['isStuck', 'shouldForceStop', 'reasonCode', 'hint']),
      'real detectStuck ' + label + ' row has exactly isStuck, shouldForceStop, reasonCode, hint');
  });
  checkDeep(STUCK.notStuck, { isStuck: false, shouldForceStop: false, reasonCode: null, hint: null }, 'real not-stuck row is {isStuck:false, shouldForceStop:false, reasonCode:null, hint:null}');
  check(STUCK.hintOnly.isStuck === true && STUCK.hintOnly.shouldForceStop === false && typeof STUCK.hintOnly.hint === 'string',
    'real hint-only row: isStuck true, shouldForceStop false, a hint');
  check(STUCK.forceStop.isStuck === true && STUCK.forceStop.shouldForceStop === true, 'real force-stop row: isStuck true, shouldForceStop true');
  check(BREAKERS.iterationStop.shouldStop === true && BREAKERS.timeStop.shouldStop === true, 'real checkSafetyBreakers stops at the iteration cap and at the time limit');
  checkDeep(BREAKERS.go, { shouldStop: false, reason: null }, 'real checkSafetyBreakers go row is {shouldStop:false, reason:null}');
  check(PERMISSION.denied.denied === true && PERMISSION.denied.shouldStop === false && PERMISSION.denied.denial.reason === 'test_denied',
    'real createPermissionHook denial row is {shouldStop:false, denied:true, denial}');
  checkDeep(PERMISSION.allowed, { shouldStop: false, denied: false }, 'real createPermissionHook allow row is {shouldStop:false, denied:false}');

  // Each normalizer returns {level, source} with its own source.
  [['consent', 'allow'], ['paymentFill', { approved: true }], ['permission', PERMISSION.allowed],
    ['safetyBreakers', BREAKERS.go], ['stuck', STUCK.notStuck]].forEach(([name, input]) => {
    checkDeep(N[name](input), { level: 0, source: name }, 'normalizeGate.' + name + ' returns {level, source:"' + name + '"}');
  });

  // Every gate row normalizes to its hand-written level.
  let rowsChecked = 0;
  GATES.forEach((row) => {
    if (row.id.indexOf('raw:') === 0) return;
    const gate = row.gate();
    const level = Array.isArray(gate) ? Policy.combineGates(gate).level : gate.level;
    rowsChecked += 1;
    check(level === row.level, 'gate ' + row.id + ' normalizes to ' + Policy.LEVEL_NAMES[row.level] + ' (got ' + safeJson(level) + ')', true);
  });
  check(rowsChecked > 0, 'all ' + rowsChecked + ' normalized and combined gate rows have their hand-written levels');

  // combineGates
  checkDeep(Policy.combineGates([]), { level: 0, source: 'combined' }, 'combineGates([]) is proceed');
  checkDeep(Policy.combineGates([N.consent('allow'), N.stuck(STUCK.forceStop), N.permission(PERMISSION.denied)]), { level: 3, source: 'combined' }, 'combineGates takes the max level');
  checkDeep(Policy.combineGates('not an array'), { level: 2, source: 'combined' }, 'combineGates on a non-array is deny');
  checkDeep(Policy.combineGates([{ level: 0, source: 'consent' }, { level: '3' }]), { level: 2, source: 'combined' }, 'a malformed entry counts as deny');

  // Totality: every normalizer, combineGates and toBeforeToolResult survive hostile input.
  const HOSTILE_INPUTS = [undefined, null, 0, 1, -1, NaN, '', 'allow', true, false, [], [1], {}, () => 'allow',
    Symbol('x'), 10n, new String('allow'), throwingProxy(), revokedProxy(), throwingGetter({}, 'decision'),
    throwingGetter({}, 'approved'), throwingGetter({}, 'denied'), throwingGetter({}, 'shouldStop'),
    throwingGetter({}, 'isStuck'), Object.create(null)];
  const STRICTEST_ON_GARBAGE = { consent: 2, paymentFill: 2, permission: 2, safetyBreakers: 3, stuck: 3 };
  Object.keys(STRICTEST_ON_GARBAGE).forEach((name) => {
    let ok = true;
    HOSTILE_INPUTS.forEach((input) => {
      const r = noThrow(() => N[name](input));
      const v = r.value;
      const proceeds = name === 'consent' && input === 'allow';
      const want = proceeds ? 0 : STRICTEST_ON_GARBAGE[name];
      if (r.threw || !sameKeys(v, ['level', 'source']) || v.level !== want || v.source !== name) ok = false;
    });
    check(ok, 'normalizeGate.' + name + ' never throws and fails closed to ' + Policy.LEVEL_NAMES[STRICTEST_ON_GARBAGE[name]] + ' on ' + HOSTILE_INPUTS.length + ' hostile inputs');
  });
  let combineOk = true;
  HOSTILE_INPUTS.forEach((input) => {
    const r = noThrow(() => Policy.combineGates(input));
    const emptyArray = !isProxyLike(input) && Array.isArray(input) && input.length === 0;
    if (r.threw || !r.value || r.value.source !== 'combined') combineOk = false;
    else if (r.value.level !== (emptyArray ? 0 : 2)) combineOk = false;
  });
  check(combineOk, 'combineGates never throws; anything but an empty array of gates is deny');
  let hookOk = true;
  HOSTILE_INPUTS.concat([{ jevContribution: 'confirm', level: 0 }, { jevContribution: 'none', level: 3 }]).forEach((input) => {
    const r = noThrow(() => Policy.toBeforeToolResult(input));
    const confirm = Boolean(input && typeof input === 'object' && !isProxyLike(input) && input.jevContribution === 'confirm');
    if (r.threw || r.value.shouldStop !== false || r.value.denied !== confirm) hookOk = false;
  });
  check(hookOk, 'toBeforeToolResult never throws, never stops, and denies only when jevContribution is confirm');
}

function isProxyLike(value) {
  try {
    // A throwing or revoked proxy throws on property reads.
    void value.__probe__;
    return false;
  } catch (_e) {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Section D -- the exhaustive cross product
// ---------------------------------------------------------------------------

const MERGED_KEYS = ['level', 'levelName', 'existingLevel', 'jevContribution', 'requiresConfirmation', 'blocked'];
const HOOK_DENY = { shouldStop: false, denied: true, denial: { reason: 'jev_requires_confirmation', source: 'jev' } };
const HOOK_PASS = { shouldStop: false, denied: false };

function sectionD(GATES) {
  console.log('\n--- D: every existing gate x every Jev outcome x failClosed ---');
  const FAIL_CLOSED = [false, true];
  const OPTION_FORMS = {
    false: [undefined, {}, { failClosed: false }, { failClosed: 'true' }, { failClosed: 1 }],
    true: [{ failClosed: true }]
  };
  let combinations = 0;
  let violations = 0;
  const merged = [];

  GATES.forEach((row) => {
    OUTCOMES.forEach((outcome) => {
      FAIL_CLOSED.forEach((failClosed) => {
        combinations += 1;
        const flag = outcome.risk === 'flag';
        const contributes = flag || (failClosed && outcome.risk !== 'below_threshold');
        const wantLevel = Math.max(row.level, contributes ? 1 : 0);
        const tag = row.id + ' x ' + outcome.id + ' x failClosed=' + failClosed;
        const before = safeJson(outcome.result);

        OPTION_FORMS[failClosed].forEach((options) => {
          const r = noThrow(() => Policy.mergeConfirmation(row.gate(), outcome.result, options));
          const m = r.value;
          let ok = !r.threw && sameKeys(m, MERGED_KEYS);
          ok = ok && m.existingLevel === row.level;
          ok = ok && m.level >= m.existingLevel;
          ok = ok && (m.jevContribution === 'none' || m.jevContribution === 'confirm');
          ok = ok && m.level === wantLevel;
          ok = ok && m.jevContribution === (contributes ? 'confirm' : 'none');
          if (!failClosed) ok = ok && (flag || m.level === m.existingLevel);
          if (failClosed) ok = ok && (m.level === m.existingLevel || m.level === Math.max(m.existingLevel, 1));
          ok = ok && m.levelName === Policy.LEVEL_NAMES[m.level];
          ok = ok && m.requiresConfirmation === (m.level === 1) && m.blocked === (m.level >= 2);
          let hook = null;
          if (ok) {
            hook = Policy.toBeforeToolResult(m);
            ok = hook.shouldStop === false;
            try { assert.deepStrictEqual(hook, m.jevContribution === 'confirm' ? HOOK_DENY : HOOK_PASS); } catch (_e) { ok = false; }
          }
          if (outcome.twin) {
            const twinMerged = Policy.mergeConfirmation(row.gate(), OUTCOME_BY_ID.get(outcome.twin).result, options);
            try { assert.deepStrictEqual(m, twinMerged); } catch (_e) { ok = false; }
          }
          if (!check(ok, tag + ' options=' + safeJson(options) + ' -> ' + safeJson(m) + ' hook ' + safeJson(hook), true)) violations += 1;
          if (ok) merged.push(m);
        });

        check(safeJson(outcome.result) === before, tag + ': the Jev result is not mutated', true);
      });
    });
  });

  console.log('  Cross product: ' + GATES.length + ' existing-gate states x ' + OUTCOMES.length
    + ' Jev outcomes x 2 failClosed values = ' + combinations + ' combinations checked');
  check(GATES.length >= 17, 'at least 17 existing-gate states (' + GATES.length + ')');
  check(OUTCOMES.length >= 40, 'at least 40 Jev outcomes (' + OUTCOMES.length + ')');
  check(combinations >= 1360, 'at least 1,360 combinations (' + combinations + ')');
  check(violations === 0, 'tighten-only holds for every combination: merged >= existing, equal unless a calibrated at-threshold '
    + 'risk flag (or failClosed on a non-below_threshold failure), Jev contributes only none or confirm');
  check(merged.every((m) => Policy.toBeforeToolResult(m).shouldStop === false),
    'toBeforeToolResult has shouldStop false for all ' + merged.length + ' merged results');

  // The existing gate's stop or deny is never relaxed, whatever Jev says.
  const stopRows = GATES.filter((g) => g.level === 3);
  const denyRows = GATES.filter((g) => g.level === 2);
  check(stopRows.length >= 5 && stopRows.every((g) => OUTCOMES.every((o) => Policy.mergeConfirmation(g.gate(), o.result, { failClosed: true }).level === 3
    && Policy.mergeConfirmation(g.gate(), o.result).level === 3)), 'a stop (safety breaker or forced stuck stop) stays stop for every Jev outcome');
  check(denyRows.length >= 10 && denyRows.every((g) => OUTCOMES.every((o) => Policy.mergeConfirmation(g.gate(), o.result).blocked === true)),
    'a deny (consent, payment decline, permission denial) stays blocked for every Jev outcome');
  check(GATES.filter((g) => g.level === 0).every((g) => OUTCOMES.every((o) => Policy.mergeConfirmation(g.gate(), o.result).level <= 1)),
    'Jev never takes a proceed gate past confirm (it can never deny or stop on its own)');

  return merged;
}

// ---------------------------------------------------------------------------
// Section E -- the real breakers and stuck detection ignore every Jev field
// ---------------------------------------------------------------------------

/** The hostile Jev fields a future caller might leave on a session. */
function attachHostileJevFields(session) {
  session.jev = { decision: { ok: true, calibration: { status: 'calibrated' }, approved: true } };
  session.jevApproved = true;
  session.skipConfirmation = true;
  session.fastMode = true;
  session.agentState.jevOverride = 'continue';
  return session;
}

function readOnlyNoEffect() {
  return [{ callId: 'r', name: 'read_page', args: {}, result: { success: true, hadEffect: false } }];
}

function noEffectClick(selector) {
  return [{ callId: 'n-' + selector, name: 'click', args: { selector: selector }, result: { success: true, hadEffect: false } }];
}

/**
 * Each scenario configures a fresh session and lists its steps. A step pins
 * Date.now, optionally advances the iteration count, runs the real
 * checkSafetyBreakers and, when it has tool results, the real detectStuck.
 */
const INVARIANCE_SCENARIOS = [
  {
    id: 'fresh session',
    setup: (s) => { s.maxIterations = 20; s.safetyConfig = { timeLimit: 600000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; },
    steps: [{ now: T0, tools: clickResultsFor('#benign') }]
  },
  {
    id: 'iteration cap reached',
    setup: (s) => { s.maxIterations = 4; s.safetyConfig = { timeLimit: 600000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; },
    steps: [1, 2, 3, 4, 5, 6].map((n) => ({ now: T0 + n * 1000, iterate: true, tools: clickResultsFor('#step-' + n) })),
    expect: (seq) => seq.some((r) => r.breakers.shouldStop === true) && seq[0].breakers.shouldStop === false
  },
  {
    id: 'time limit exceeded (stubbed Date.now)',
    setup: (s) => { s.maxIterations = 50; s.safetyConfig = { timeLimit: 60000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; },
    steps: [0, 30000, 59999, 60000, 125000].map((dt, n) => ({ now: T0 + dt, iterate: true, tools: clickResultsFor('#t-' + n) })),
    expect: (seq) => seq[2].breakers.shouldStop === false && seq[3].breakers.shouldStop === true && seq[4].breakers.shouldStop === true
  },
  {
    id: 'repeated identical tool results reach the stuck threshold',
    setup: (s) => { s.maxIterations = 50; s.safetyConfig = { timeLimit: 600000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; },
    steps: [1, 2, 3, 4, 5, 6].map((n) => ({ now: T0 + n * 500, iterate: true, tools: clickResultsFor('#dropdown') })),
    expect: (seq) => seq[2].stuck.isStuck === true && seq[2].stuck.shouldForceStop === false && seq[4].stuck.shouldForceStop === true
  },
  {
    id: 'changing tool results',
    setup: (s) => { s.maxIterations = 50; s.safetyConfig = { timeLimit: 600000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; },
    steps: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ now: T0 + n * 700, iterate: true, tools: clickResultsFor('#field-' + n) })),
    expect: (seq) => seq.every((r) => r.stuck.shouldForceStop === false && r.breakers.shouldStop === false)
  },
  {
    id: 'force-stop sequence (no page change)',
    setup: (s) => { s.maxIterations = 100; s.safetyConfig = { timeLimit: 6000000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; s.lastKnownUrl = 'https://example.test/form'; },
    steps: Array.from({ length: 18 }, (_, n) => ({ now: T0 + n * 900, iterate: true, tools: n % 3 === 2 ? readOnlyNoEffect() : noEffectClick('#submit-' + (n % 2)) })),
    expect: (seq) => seq.some((r) => r.stuck.isStuck === true && r.stuck.shouldForceStop === false) && seq.some((r) => r.stuck.shouldForceStop === true)
  },
  {
    id: 'mixed run: stuck warnings, then the time limit',
    setup: (s) => { s.maxIterations = 30; s.safetyConfig = { timeLimit: 60000 }; s.agentState.startTime = T0; s.agentState.iterationCount = 0; },
    steps: Array.from({ length: 12 }, (_, n) => ({ now: T0 + n * 7000, iterate: true, tools: n < 4 ? clickResultsFor('#a-' + n) : clickResultsFor('#stuck') })),
    expect: (seq) => seq.some((r) => r.stuck.isStuck === true) && seq.some((r) => r.breakers.shouldStop === true)
  }
];

function runScenario(scenario, hostile, mutateSetup) {
  const session = makeSession();
  scenario.setup(session);
  if (mutateSetup) mutateSetup(session);
  if (hostile) attachHostileJevFields(session);
  const sequence = scenario.steps.map((step) => withNow(step.now, () => {
    if (step.iterate) session.agentState.iterationCount = (session.agentState.iterationCount || 0) + 1;
    const breakers = checkSafetyBreakers(session);
    const stuck = step.tools ? detectStuck(session, step.tools) : null;
    return { breakers: breakers, stuck: stuck };
  }));
  const state = Object.assign({}, session.agentState);
  delete state.jevOverride;
  return { sequence: sequence, state: state };
}

function deepEqualQuiet(a, b) {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch (_e) {
    return false;
  }
}

function sectionE() {
  console.log('\n--- E: real checkSafetyBreakers / detectStuck invariance under hostile Jev fields ---');
  const realNow = Date.now;
  check(INVARIANCE_SCENARIOS.length >= 6, 'at least 6 invariance scenarios (' + INVARIANCE_SCENARIOS.length + ')');

  INVARIANCE_SCENARIOS.forEach((scenario) => {
    const plain = runScenario(scenario, false);
    const hostile = runScenario(scenario, true);
    let detail = '';
    try {
      assert.deepStrictEqual(hostile.sequence, plain.sequence);
    } catch (err) {
      detail = ' -- ' + String(err.message).split('\n').slice(0, 6).join(' ');
    }
    check(detail === '', scenario.id + ': ' + plain.sequence.length + ' checkSafetyBreakers + detectStuck results are identical with and without hostile Jev fields' + detail);
    check(deepEqualQuiet(hostile.state, plain.state), scenario.id + ': the agent state evolves identically (jevOverride aside)');
    if (scenario.expect) check(scenario.expect(plain.sequence) === true, scenario.id + ': the sequence exercises the intended gate transitions');
    check(Date.now === realNow, scenario.id + ': Date.now is restored after the scenario');
  });

  // The hostile arm really carried the fields, and the comparison can see a real difference.
  const probe = attachHostileJevFields(makeSession());
  check(probe.jev.decision.approved === true && probe.jevApproved === true && probe.skipConfirmation === true
    && probe.fastMode === true && probe.agentState.jevOverride === 'continue', 'the hostile arm carries jev, jevApproved, skipConfirmation, fastMode and agentState.jevOverride');
  const capScenario = INVARIANCE_SCENARIOS[1];
  const baseline = runScenario(capScenario, false);
  const raisedCap = runScenario(capScenario, false, (s) => { s.maxIterations = 5; });
  check(!deepEqualQuiet(raisedCap.sequence, baseline.sequence),
    'control: a real (non-Jev) session change, maxIterations 4 -> 5, does change the sequence, so the comparison is not vacuous');
}

// ---------------------------------------------------------------------------
// Section F -- the real HookPipeline: a permission denial survives in both orders
// ---------------------------------------------------------------------------

async function emitBeforeTool(handlers) {
  const pipeline = new HookPipeline();
  handlers.forEach((h) => pipeline.register(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, h));
  return pipeline.emit(LIFECYCLE_EVENTS.BEFORE_TOOL_EXECUTION, { toolName: 'click', origin: 'https://example.test' });
}

/** The agent-loop BEFORE_TOOL_EXECUTION consumer: the first denied result with a denial skips the tool. */
function consumerSkipsTool(out) {
  const denialResult = (out.results || []).find((r) => r && r.denied);
  return Boolean(denialResult && denialResult.denial);
}

function hasPermissionDenial(out) {
  return (out.results || []).some((r) => r && r.denied === true && r.denial && r.denial.reason === 'test_denied');
}

async function sectionF(mergedFromTables) {
  console.log('\n--- F: real HookPipeline + createPermissionHook in both registration orders ---');
  const denyingContext = { isAllowed: () => false, createDenial: (t) => ({ tool: t, reason: 'test_denied' }) };
  const allowingContext = { isAllowed: () => true, createDenial: (t) => ({ tool: t, reason: 'test_denied' }) };
  const N = Policy.normalizeGate;

  const mergedConfirm = Policy.mergeConfirmation(N.permission(PERMISSION.allowed), OUTCOME_BY_ID.get('calibrated:risk_high').result);
  const mergedNone = Policy.mergeConfirmation(N.permission(PERMISSION.allowed), OUTCOME_BY_ID.get('fallback:timeout').result);
  check(mergedConfirm.jevContribution === 'confirm' && mergedNone.jevContribution === 'none', 'fixtures: one confirm and one none merged result');

  for (const [label, merged] of [['confirm', mergedConfirm], ['none', mergedNone]]) {
    const jevHandler = () => Policy.toBeforeToolResult(merged);
    for (const order of ['permission hook first', 'Jev handler first']) {
      const permission = createPermissionHook(denyingContext);
      const handlers = order === 'permission hook first' ? [permission, jevHandler] : [jevHandler, permission];
      const out = await emitBeforeTool(handlers);
      check(out.stopped === false && out.stoppedBy === null && out.results.length === 2,
        'Jev ' + label + ', ' + order + ': emit is not stopped and both handlers ran');
      check(hasPermissionDenial(out), 'Jev ' + label + ', ' + order + ': results contain the permission denial');
      check(consumerSkipsTool(out), 'Jev ' + label + ', ' + order + ': the agent-loop consumer finds a denial and skips the tool');
    }
  }

  // Jev's own confirmation is expressed as a denial when the permission hook allows.
  for (const order of ['permission hook first', 'Jev handler first']) {
    const permission = createPermissionHook(allowingContext);
    const confirmHandler = () => Policy.toBeforeToolResult(mergedConfirm);
    const noneHandler = () => Policy.toBeforeToolResult(mergedNone);
    const outConfirm = await emitBeforeTool(order === 'permission hook first' ? [permission, confirmHandler] : [confirmHandler, permission]);
    const outNone = await emitBeforeTool(order === 'permission hook first' ? [permission, noneHandler] : [noneHandler, permission]);
    check(outConfirm.stopped === false && consumerSkipsTool(outConfirm)
      && outConfirm.results.some((r) => r && r.denied === true && r.denial.reason === 'jev_requires_confirmation'),
    'allowing permission, Jev confirm, ' + order + ': the tool is held for confirmation (jev_requires_confirmation)');
    check(outNone.stopped === false && !consumerSkipsTool(outNone), 'allowing permission, Jev none, ' + order + ': the tool runs as before');
  }

  // Every distinct merged result from the tables, in both orders, keeps the denial.
  const distinct = new Map();
  mergedFromTables.forEach((m) => distinct.set(JSON.stringify(m), m));
  let survived = 0;
  for (const m of distinct.values()) {
    for (const jevFirst of [false, true]) {
      const permission = createPermissionHook(denyingContext);
      const jevHandler = () => Policy.toBeforeToolResult(m);
      const out = await emitBeforeTool(jevFirst ? [jevHandler, permission] : [permission, jevHandler]);
      if (out.stopped === false && hasPermissionDenial(out) && consumerSkipsTool(out)) survived += 1;
    }
  }
  check(distinct.size >= 4 && survived === distinct.size * 2,
    'all ' + distinct.size + ' distinct merged results from the tables keep the permission denial in both orders (' + survived + '/' + (distinct.size * 2) + ')');

  // CONTROL: the hazard is real. A stopping handler registered before the
  // denying permission hook hides the denial, so the tool would execute.
  const stopper = () => ({ shouldStop: true, reason: 'control_stop' });
  const hidden = await emitBeforeTool([stopper, createPermissionHook(denyingContext)]);
  check(hidden.stopped === true && hidden.stoppedBy === 'control_stop' && hidden.results.length === 1
    && !hidden.results.some((r) => r && r.denied) && !consumerSkipsTool(hidden),
  'CONTROL: a stopping handler registered before the permission hook hides the denial (stopped, no denied result, '
    + 'the consumer would run the tool) -- this is why toBeforeToolResult never stops');
  const after = await emitBeforeTool([createPermissionHook(denyingContext), stopper]);
  check(after.stopped === true && hasPermissionDenial(after),
    'CONTROL: the same stopping handler registered after the permission hook leaves the denial in place (order matters)');
}

// ---------------------------------------------------------------------------

async function main() {
  const GATES = buildGates();
  sectionA();
  sectionB();
  sectionC(GATES);
  const merged = sectionD(GATES);
  sectionE();
  await sectionF(merged);
}

main().then(() => {
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exitCode = failed > 0 ? 1 : 0;
}, (err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
