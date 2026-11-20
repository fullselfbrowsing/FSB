#!/usr/bin/env node
'use strict';

/**
 * Phase 70 Plan 05 Task 1 -- the typed run_task outcome (MCP-03 SC2, SC3).
 *
 * FsbFastPath.classifyRunTaskOutcome maps how a run_task ended (the settle
 * path, the terminal lifecycle message's outcome and reason) plus the run
 * evidence of plan 70-03 to one of done, ambiguous, blocked or
 * needs_confirmation, with one reason from a closed list (D-12, D-13, D-15).
 * summarizeFastMode reports what fast mode did, derived from jevMeasurement,
 * _fastPath and agentState.jevFast without adding to them (D-16, D-18, F12).
 * buildFastModeBlock assembles the fast_mode block and never throws (D-19).
 *
 * Sections (check names carry these prefixes):
 *   - "d13 table <row>": every D-13 row on hand-built sessions, including the
 *     F6 rows (no evidence record after an abort or an early stop);
 *   - "reasons derived from code": every terminal reason agent-loop.js,
 *     turn-result.js, the partial_task schema and background.js's stop
 *     broadcasts can produce classifies to itself, so a new reason in code
 *     fails here;
 *   - "summary", "fallbacks never decide the outcome", "static slice ban",
 *     "no page content", "block shape" and "never throws".
 *
 * No network, no ports, no timers. Node 20-safe.
 *
 * Run: node tests/jev-run-task-outcome.test.js
 */

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const ROOT = path.join(__dirname, '..');
const MODULE_PATH = path.join(ROOT, 'extension', 'ai', 'jev-fast-path.js');
const FsbJevState = require(path.join(ROOT, 'extension', 'ai', 'jev-state.js'));
const CONTRACT = FsbJevState.CONTRACT;

let FsbFastPath = null;
let loadError = null;
try {
  FsbFastPath = require(MODULE_PATH);
} catch (error) {
  loadError = error;
}

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: ' + name);
  }
}

function section(title, body) {
  console.log('\n--- ' + title + ' ---');
  try {
    body();
  } catch (error) {
    check(false, title + ' ran without throwing (' + (error && error.stack ? error.stack : error) + ')');
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function show(value) {
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_TASK_FIELD = Object.freeze({ enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' });

/** A run evidence record in the 70-03 layout; resolved unless overridden. */
function evidence(over) {
  return Object.assign({
    v: 1,
    seq: 6,
    fastIteration: null,
    pending: null,
    lastUncertainSeq: 0,
    lastObservationSeq: 0,
    fastUnobservedSeq: 0,
    gates: []
  }, over || {});
}

/** An uncertain result with no observation after it (D-14 a). */
function uncertainEvidence() {
  return evidence({ lastUncertainSeq: 4, lastObservationSeq: 2 });
}

/** A call dispatched with no recorded result when the task ended (D-14 c). */
function pendingEvidence() {
  return evidence({ pending: { tool: 'click', iteration: 3, seq: 6 } });
}

/** A fast step whose effect nothing showed (D-14 b). */
function fastUnobservedEvidence() {
  return evidence({ fastIteration: 2, fastUnobservedSeq: 5, lastObservationSeq: 3 });
}

/** An uncertain result that a later page read observed. */
function observedEvidence() {
  return evidence({ lastUncertainSeq: 3, lastObservationSeq: 5 });
}

function gateEvidence(code, cleared) {
  const tool = code === 'payment_not_approved' ? 'fill_payment_method' : 'invoke_capability';
  const key = code === 'site_consent_required' ? '0a1b2c3d' : null;
  return evidence({ gates: [{ code: code, tool: tool, key: key, seq: 3, cleared: cleared === true }] });
}

/**
 * A switched-on run_task session. `ev` undefined leaves _fastRunEvidence
 * absent (as after the content-script-not-ready abort, F6).
 */
function sessionWith(ev, extra) {
  const session = Object.assign({ fastMode: Object.assign({}, RUN_TASK_FIELD), status: 'completed' }, extra || {});
  if (ev !== undefined) session._fastRunEvidence = ev;
  return session;
}

/** A lifecycle settle for an automationComplete message (handleComplete). */
function completeSettle(outcome, reason, extra) {
  const message = Object.assign({ action: 'automationComplete', sessionId: 'session_p70' }, extra || {});
  if (outcome !== undefined) message.outcome = outcome;
  if (reason !== undefined) message.reason = reason;
  return { source: 'lifecycleBus', kind: 'complete', message: message };
}

/** A lifecycle settle for an automationError message (handleError). */
function errorSettle(reason, extra) {
  const message = Object.assign({ action: 'automationError', sessionId: 'session_p70', outcome: 'error' }, extra || {});
  if (reason !== undefined) message.reason = reason;
  return { source: 'lifecycleBus', kind: 'error', message: message };
}

/** The content-script-not-ready abort broadcast (background.js handleStartAutomation): no reason, no outcome. */
function abortSettle() {
  return {
    source: 'lifecycleBus',
    kind: 'error',
    message: { action: 'automationError', sessionId: 'session_p70', error: 'Could not connect to the page.', task: 'P70-MARKER-TASK' }
  };
}

const SAFETY_NET = Object.freeze({ source: 'safety_net_600s', kind: 'safety_net' });

function block(session, settle) {
  return FsbFastPath.buildFastModeBlock(session, settle);
}

/** One D-13 row: every expected field of the block, plus parity with the direct classifier call. */
function row(name, session, settle, want) {
  const b = block(session, settle);
  for (const key of Object.keys(want)) {
    check(isDeepStrictEqual(b[key], want[key]),
      'd13 table ' + name + ': ' + key + ' is ' + show(want[key]) + ' (got ' + show(b[key]) + ')');
  }
  const direct = FsbFastPath.classifyRunTaskOutcome({
    source: settle.source,
    kind: settle.kind,
    message: settle.message,
    evidence: session._fastRunEvidence
  });
  check(isDeepStrictEqual(direct, {
    outcome: b.outcome,
    reason: b.reason,
    uncertain_unobserved: b.uncertain_unobserved,
    human_gate: b.human_gate
  }), 'd13 table ' + name + ': classifyRunTaskOutcome returns exactly the four classifier fields of the block');
  return b;
}

// ---------------------------------------------------------------------------
// Source helpers (comment- and string-aware bracket matching)
// ---------------------------------------------------------------------------

/** Index just past the string literal or comment starting at i, or i when none starts there. */
function skipLiteral(src, i) {
  const ch = src[i];
  if (ch === '\'' || ch === '"' || ch === '`') {
    let j = i + 1;
    while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  if (ch === '/' && src[i + 1] === '/') {
    const end = src.indexOf('\n', i);
    return end < 0 ? src.length : end;
  }
  if (ch === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end < 0 ? src.length : end + 2;
  }
  return i;
}

/** The index of the bracket closing the one at `open` ('(' or '{'), skipping strings and comments. */
function matchClose(src, open) {
  const opener = src[open];
  const closer = opener === '(' ? ')' : '}';
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const skipped = skipLiteral(src, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (src[i] === opener) depth += 1;
    else if (src[i] === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error('Unbalanced ' + opener + ' at ' + open);
}

/** `function name(...) {...}` (or async) from the source, or null when there is none. */
function functionSource(source, name) {
  const asyncStart = source.indexOf('async function ' + name + '(');
  const start = asyncStart >= 0 ? asyncStart : source.indexOf('function ' + name + '(');
  if (start < 0) return null;
  const params = source.indexOf('(', start);
  const brace = source.indexOf('{', matchClose(source, params));
  return source.slice(start, matchClose(source, brace) + 1);
}

/**
 * Top-level functions as {name, start, end}. A function whose body this
 * matcher cannot balance (a regex literal holding a quote or a brace) is
 * left out; callers check that the functions they rely on are present.
 */
function topLevelFunctions(source) {
  const out = [];
  const re = /^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm;
  let m;
  while ((m = re.exec(source)) !== null) {
    try {
      const params = source.indexOf('(', m.index);
      const brace = source.indexOf('{', matchClose(source, params));
      out.push({ name: m[1], start: m.index, end: matchClose(source, brace) });
    } catch (_e) {
      /* not balanced by this matcher; see above */
    }
  }
  return out;
}

/** The innermost `{...}` object literal around `index`, as text. */
function enclosingObject(source, index) {
  for (let p = source.lastIndexOf('{', index); p >= 0; p = source.lastIndexOf('{', p - 1)) {
    let close = -1;
    try {
      close = matchClose(source, p);
    } catch (_e) {
      close = -1;
    }
    if (close > index) return source.slice(p, close + 1);
  }
  return null;
}

function literalReasons(text) {
  const out = [];
  const re = /\breason:\s*'([^'\\]*)'/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function literalOf(text, key) {
  const m = new RegExp('\\b' + key + ":\\s*'([^'\\\\]*)'").exec(text);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// d13 table
// ---------------------------------------------------------------------------

section('d13 table', () => {
  check(loadError === null && FsbFastPath !== null, 'jev-fast-path.js loads' + (loadError ? ' (' + loadError.message + ')' : ''));
  check(typeof FsbFastPath.classifyRunTaskOutcome === 'function', 'FsbFastPath.classifyRunTaskOutcome is a function');
  check(typeof FsbFastPath.summarizeFastMode === 'function', 'FsbFastPath.summarizeFastMode is a function');
  check(typeof FsbFastPath.buildFastModeBlock === 'function', 'FsbFastPath.buildFastModeBlock is a function');

  // Row 2: the 600 s safety net, whatever the evidence holds.
  row('safety net, resolved evidence', sessionWith(evidence()), SAFETY_NET,
    { outcome: 'ambiguous', reason: 'safety_net_timeout', uncertain_unobserved: false, human_gate: null });
  row('safety net, unresolved evidence', sessionWith(pendingEvidence()), SAFETY_NET,
    { outcome: 'ambiguous', reason: 'safety_net_timeout', uncertain_unobserved: true });
  row('safety net, uncleared payment gate', sessionWith(gateEvidence('payment_not_approved', false)), SAFETY_NET,
    { outcome: 'ambiguous', reason: 'safety_net_timeout', human_gate: 'payment_not_approved' });
  row('safety net, no evidence record', sessionWith(undefined), SAFETY_NET,
    { outcome: 'ambiguous', reason: 'safety_net_timeout', uncertain_unobserved: null, human_gate: null });
  row('safety net by source alone', sessionWith(evidence()), { source: 'safety_net_600s' },
    { outcome: 'ambiguous', reason: 'safety_net_timeout' });

  // Row 3: existing human gates.
  row('partial manual_approval', sessionWith(evidence()), completeSettle('partial', 'manual_approval'),
    { outcome: 'needs_confirmation', reason: 'manual_approval', uncertain_unobserved: false, human_gate: 'manual_approval' });
  row('partial manual_approval with unresolved evidence', sessionWith(uncertainEvidence()), completeSettle('partial', 'manual_approval'),
    { outcome: 'needs_confirmation', reason: 'manual_approval', uncertain_unobserved: true, human_gate: 'manual_approval' });
  row('partial manual_approval with an uncleared payment gate', sessionWith(gateEvidence('payment_not_approved', false)),
    completeSettle('partial', 'manual_approval'),
    { outcome: 'needs_confirmation', reason: 'manual_approval', human_gate: 'manual_approval' });
  row('partial blocked with an uncleared payment gate', sessionWith(gateEvidence('payment_not_approved', false)),
    completeSettle('partial', 'blocked'),
    { outcome: 'needs_confirmation', reason: 'payment_not_approved', uncertain_unobserved: false, human_gate: 'payment_not_approved' });
  row('partial blocked with an uncleared consent gate', sessionWith(gateEvidence('site_consent_required', false)),
    completeSettle('partial', 'blocked'),
    { outcome: 'needs_confirmation', reason: 'site_consent_required', human_gate: 'site_consent_required' });
  row('partial blocked with a cleared gate', sessionWith(gateEvidence('payment_not_approved', true)),
    completeSettle('partial', 'blocked'),
    { outcome: 'blocked', reason: 'blocked', uncertain_unobserved: false, human_gate: null });
  row('stopped user_stopped with an uncleared consent gate', sessionWith(gateEvidence('site_consent_required', false)),
    completeSettle('stopped', 'user_stopped'),
    { outcome: 'needs_confirmation', reason: 'site_consent_required', human_gate: 'site_consent_required' });
  row('error fail_task with an uncleared payment gate and unresolved evidence',
    sessionWith(Object.assign(gateEvidence('payment_not_approved', false), { pending: { tool: 'click', iteration: 4, seq: 7 } })),
    errorSettle('fail_task'),
    { outcome: 'needs_confirmation', reason: 'payment_not_approved', uncertain_unobserved: true, human_gate: 'payment_not_approved' });
  row('a gate with a code outside the evidence gates is not a gate',
    sessionWith(evidence({ gates: [{ code: 'P70-MARKER-LABEL', tool: 'invoke_capability', key: null, seq: 2, cleared: false }] })),
    completeSettle('partial', 'blocked'),
    { outcome: 'blocked', reason: 'blocked', human_gate: null });
  row('partial blocked with an uncleared payment gate and a later cleared consent gate (one entry per gate)',
    sessionWith(evidence({ gates: [
      { code: 'payment_not_approved', tool: 'fill_payment_method', key: null, seq: 2, cleared: false },
      { code: 'site_consent_required', tool: 'invoke_capability', key: '0a1b2c3d', seq: 4, cleared: true }] })),
    completeSettle('partial', 'blocked'),
    { outcome: 'needs_confirmation', reason: 'payment_not_approved', human_gate: 'payment_not_approved' });
  row('partial blocked with an uncleared consent gate listed before an uncleared payment gate (EVIDENCE_GATES order)',
    sessionWith(evidence({ gates: [
      { code: 'site_consent_required', tool: 'invoke_capability', key: '0a1b2c3d', seq: 2, cleared: false },
      { code: 'payment_not_approved', tool: 'fill_payment_method', key: null, seq: 4, cleared: false }] })),
    completeSettle('partial', 'blocked'),
    { outcome: 'needs_confirmation', reason: 'payment_not_approved', human_gate: 'payment_not_approved' });

  // Row 4: unresolved uncertainty.
  row('success complete_task with unresolved evidence', sessionWith(uncertainEvidence()), completeSettle('success', 'complete_task'),
    { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true, human_gate: null });
  row('success complete_task with a call in flight', sessionWith(pendingEvidence()), completeSettle('success', 'complete_task'),
    { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true });
  row('success complete_task with an unobserved fast step', sessionWith(fastUnobservedEvidence()), completeSettle('success', 'complete_task'),
    { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true });
  row('success end_turn with unresolved evidence', sessionWith(uncertainEvidence()), completeSettle('success', 'end_turn'),
    { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true });

  // Row 5: success with evidence.
  row('success complete_task with resolved evidence', sessionWith(evidence()), completeSettle('success', 'complete_task'),
    { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null });
  row('success complete_task with an observed uncertain step', sessionWith(observedEvidence()), completeSettle('success', 'complete_task'),
    { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false });
  row('success end_turn', sessionWith(evidence()), completeSettle('success', 'end_turn'),
    { outcome: 'done', reason: 'end_turn', uncertain_unobserved: false, human_gate: null });
  row('success with an uncleared gate is done (gates count only on non-success)',
    sessionWith(gateEvidence('payment_not_approved', false)), completeSettle('success', 'complete_task'),
    { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null });
  row('success with an unlisted reason', sessionWith(evidence()), completeSettle('success', 'zz_unlisted'),
    { outcome: 'done', reason: 'other' });
  row('success with no reason', sessionWith(evidence()), completeSettle('success', undefined),
    { outcome: 'done', reason: 'other' });

  // Row 6: success without evidence.
  row('success with no evidence record', sessionWith(undefined), completeSettle('success', 'complete_task'),
    { outcome: 'ambiguous', reason: 'evidence_unavailable', uncertain_unobserved: null, human_gate: null });
  row('success with a null evidence record', sessionWith(null), completeSettle('success', 'end_turn'),
    { outcome: 'ambiguous', reason: 'evidence_unavailable', uncertain_unobserved: null });
  row('success with a non-object evidence record', sessionWith('P70-MARKER-RESULT'), completeSettle('success', 'complete_task'),
    { outcome: 'ambiguous', reason: 'evidence_unavailable', uncertain_unobserved: null });

  // Row 7: everything else is blocked, with its mapped reason.
  row('complete message with no outcome', sessionWith(evidence()), completeSettle(undefined, undefined),
    { outcome: 'blocked', reason: 'other', uncertain_unobserved: false, human_gate: null });
  row('complete message with no outcome but a success reason', sessionWith(evidence()), completeSettle(undefined, 'complete_task'),
    { outcome: 'blocked', reason: 'other' });
  row('complete message with an unknown outcome', sessionWith(evidence()), completeSettle('finished', 'complete_task'),
    { outcome: 'blocked', reason: 'other' });
  row('stopped user_stopped with a call in flight', sessionWith(pendingEvidence()), completeSettle('stopped', 'user_stopped'),
    { outcome: 'ambiguous', reason: 'uncertain_action', uncertain_unobserved: true });
  row('stopped user_stopped', sessionWith(evidence()), completeSettle('stopped', 'user_stopped'),
    { outcome: 'blocked', reason: 'user_stopped', uncertain_unobserved: false, human_gate: null });
  for (const reason of ['tab_closed', 'service_worker_restart', 'session_not_found', 'session_not_running']) {
    row('stopped ' + reason, sessionWith(evidence()), completeSettle('stopped', reason),
      { outcome: 'blocked', reason: reason, uncertain_unobserved: false, human_gate: null });
  }
  row('stopped with no reason', sessionWith(evidence()), completeSettle('stopped', undefined),
    { outcome: 'blocked', reason: 'other' });
  row('error fail_task', sessionWith(evidence()), errorSettle('fail_task'),
    { outcome: 'blocked', reason: 'fail_task', uncertain_unobserved: false, human_gate: null });
  row('error with no reason', sessionWith(evidence()), errorSettle(undefined),
    { outcome: 'blocked', reason: 'error', uncertain_unobserved: false });
  row('error with a null reason', sessionWith(evidence()), errorSettle(null),
    { outcome: 'blocked', reason: 'error' });
  row('error kind wins over a success outcome on the message', sessionWith(evidence()),
    { source: 'lifecycleBus', kind: 'error', message: { outcome: 'success', reason: 'complete_task' } },
    { outcome: 'blocked', reason: 'other' });
  for (const reason of ['auth_required', 'credentials_missing', 'user_skipped_login', 'credentials_failed']) {
    row('partial ' + reason, sessionWith(evidence()), completeSettle('partial', reason),
      { outcome: 'blocked', reason: reason, uncertain_unobserved: false, human_gate: null });
  }
  row('partial with no reason', sessionWith(evidence()), completeSettle('partial', undefined),
    { outcome: 'blocked', reason: 'blocked' });
  row('partial weird_reason', sessionWith(evidence()), completeSettle('partial', 'weird_reason'),
    { outcome: 'blocked', reason: 'other', human_gate: null });
  row('partial manual approval in another case (as isAuthWallPartialReason reads it)', sessionWith(evidence()),
    completeSettle('partial', ' Manual_Approval '),
    { outcome: 'needs_confirmation', reason: 'manual_approval', human_gate: 'manual_approval' });

  // F6: no evidence record (the content-script-not-ready abort; a stop during the content-script wait).
  row('no evidence record, the abort message (kind error, no reason, no outcome)', sessionWith(undefined), abortSettle(),
    { outcome: 'blocked', reason: 'error', uncertain_unobserved: null, human_gate: null });
  row('no evidence record, stopped user_stopped', sessionWith(undefined), completeSettle('stopped', 'user_stopped'),
    { outcome: 'blocked', reason: 'user_stopped', uncertain_unobserved: null, human_gate: null });
  row('no evidence record, partial auth_required', sessionWith(undefined), completeSettle('partial', 'auth_required'),
    { outcome: 'blocked', reason: 'auth_required', uncertain_unobserved: null, human_gate: null });
  row('no evidence record, partial manual_approval (a terminal gate needs no evidence)', sessionWith(undefined),
    completeSettle('partial', 'manual_approval'),
    { outcome: 'needs_confirmation', reason: 'manual_approval', uncertain_unobserved: null, human_gate: 'manual_approval' });
  for (const settle of [abortSettle(), completeSettle('stopped', 'user_stopped'), errorSettle('fail_task'), completeSettle(undefined, undefined)]) {
    check(block(sessionWith(undefined), settle).reason !== 'classifier_error',
      'd13 table no evidence record: ' + show(settle.message.reason || settle.message.action) + ' never reads as classifier_error');
  }
});

// ---------------------------------------------------------------------------
// reasons derived from code
// ---------------------------------------------------------------------------

section('reasons derived from code', () => {
  const agentLoop = read('extension/ai/agent-loop.js');
  const background = read('extension/background.js');
  const turnResult = require(path.join(ROOT, 'extension', 'ai', 'turn-result.js'));
  const toolDefinitions = require(path.join(ROOT, 'extension', 'ai', 'tool-definitions.js'));

  // Each entry: {reason, terminal ('success'|'partial'|'stopped'|'error'), origin}.
  const scanned = [];
  const add = (reason, terminal, origin) => scanned.push({ reason: reason, terminal: terminal, origin: origin });

  // 1. createTerminalOutcome call sites in agent-loop.js.
  const createSource = functionSource(agentLoop, 'createTerminalOutcome');
  check(createSource !== null, 'reasons derived from code: agent-loop.js defines createTerminalOutcome');
  const defaults = {
    success: /normalizedOutcome === 'success' \? 'completed'/.test(createSource || '') ? 'completed' : null,
    partial: /normalizedOutcome === 'partial' \? 'blocked'/.test(createSource || '') ? 'blocked' : null,
    stopped: /:\s*normalizedOutcome\s*\)/.test(createSource || '') ? 'stopped' : null,
    error: /:\s*normalizedOutcome\s*\)/.test(createSource || '') ? 'error' : null
  };
  check(defaults.success === 'completed' && defaults.partial === 'blocked' && defaults.stopped === 'stopped' && defaults.error === 'error',
    'reasons derived from code: createTerminalOutcome defaults are completed, blocked and the outcome name (' + show(defaults) + ')');
  for (const terminal of Object.keys(defaults)) if (defaults[terminal]) add(defaults[terminal], terminal, 'createTerminalOutcome default');

  // Reasons a call site passes through a variable, and where each variable's values come from.
  const safetyReturns = [];
  const mapSafety = functionSource(agentLoop, 'mapSafetyReasonToConstant');
  check(mapSafety !== null, 'reasons derived from code: agent-loop.js defines mapSafetyReasonToConstant');
  {
    const re = /return '([^'\\]+)'/g;
    let m;
    while ((m = re.exec(mapSafety || '')) !== null) if (safetyReturns.indexOf(m[1]) === -1) safetyReturns.push(m[1]);
  }
  check(isDeepStrictEqual(safetyReturns.slice().sort(), ['cost_limit_exceeded', 'iteration_limit_exceeded', 'safety', 'time_limit_exceeded']),
    'reasons derived from code: mapSafetyReasonToConstant returns ' + show(safetyReturns));
  const stuckReasons = Object.values(turnResult.STUCK_REASONS || {});
  check(stuckReasons.length === 3, 'reasons derived from code: turn-result.js STUCK_REASONS has ' + stuckReasons.length + ' values');
  const partialDef = (toolDefinitions.TOOL_REGISTRY || []).find((d) => d && d.name === 'partial_task');
  const partialEnum = partialDef && partialDef.inputSchema && partialDef.inputSchema.properties
    && partialDef.inputSchema.properties.reason ? partialDef.inputSchema.properties.reason.enum : null;
  check(Array.isArray(partialEnum) && partialEnum.indexOf('manual_approval') !== -1,
    'reasons derived from code: the partial_task reason enum ' + show(partialEnum));
  check(/var partialReason = \(call\.args && call\.args\.reason\) \|\| 'blocked';/.test(agentLoop),
    "reasons derived from code: a partial_task with no reason defaults to 'blocked'");
  check(/var stuckReason = stuckCheck\.reasonCode \|\| 'stuck_dom_hash';/.test(agentLoop),
    "reasons derived from code: the inline stuck stop defaults to 'stuck_dom_hash'");
  // detectStuck and the stuck hook attribute only STUCK_REASONS members.
  {
    const re = /reasonCode:\s*STUCK_REASONS\.([A-Z_]+)/g;
    let m;
    let count = 0;
    let known = true;
    while ((m = re.exec(agentLoop)) !== null) {
      count += 1;
      if (!Object.prototype.hasOwnProperty.call(turnResult.STUCK_REASONS, m[1])) known = false;
    }
    check(count >= 3 && known, 'reasons derived from code: every detectStuck reasonCode is a STUCK_REASONS member (' + count + ' sites)');
  }
  const VARIABLE_SOURCES = {
    safetyReason1: safetyReturns,
    safetyReason2: safetyReturns,
    safetyReason3: safetyReturns.concat(stuckReasons),
    partialReason: (partialEnum || []).concat(['blocked']),
    stuckReason: stuckReasons.concat(['stuck_dom_hash'])
  };

  const calls = [];
  for (let at = agentLoop.indexOf('createTerminalOutcome('); at !== -1; at = agentLoop.indexOf('createTerminalOutcome(', at + 1)) {
    if (agentLoop.slice(Math.max(0, at - 9), at) === 'function ') continue;
    const open = at + 'createTerminalOutcome'.length;
    calls.push(agentLoop.slice(at, matchClose(agentLoop, open) + 1));
  }
  check(calls.length >= 12, 'reasons derived from code: ' + calls.length + ' createTerminalOutcome call sites found');
  let reasonless = 0;
  for (const call of calls) {
    const outcomeMatch = /^createTerminalOutcome\(\s*'([a-z]+)'/.exec(call);
    const terminal = outcomeMatch ? outcomeMatch[1] : null;
    check(['success', 'partial', 'stopped', 'error'].indexOf(terminal) !== -1,
      'reasons derived from code: call site names a terminal outcome literal (' + call.slice(0, 60).replace(/\s+/g, ' ') + ')');
    const literals = literalReasons(call);
    const variable = /\breason:\s*([A-Za-z_$][\w$]*)\s*[,}\n]/.exec(call);
    if (literals.length > 0) {
      for (const reason of literals) add(reason, terminal, 'createTerminalOutcome literal');
    } else if (variable) {
      const values = VARIABLE_SOURCES[variable[1]];
      check(Array.isArray(values) && values.length > 0,
        'reasons derived from code: the reason variable ' + variable[1] + ' has a known source');
      for (const reason of values || []) add(reason, terminal, 'createTerminalOutcome ' + variable[1]);
    } else {
      reasonless += 1;
      check(terminal === 'success' && /terminal = terminal \|\| createTerminalOutcome\('success', \{/.test(agentLoop),
        'reasons derived from code: the one call site with no reason is notifySidepanel\'s success fallback');
    }
  }
  check(reasonless === 1, 'reasons derived from code: exactly one createTerminalOutcome call has no reason (' + reasonless + ')');
  // That fallback is unreachable: notifySidepanel is called only from
  // finalizeSession, and every finalizeSession call passes a terminal.
  const notifyCalls = agentLoop.match(/\bnotifySidepanel\(/g) || [];
  check(notifyCalls.length === 2 && /notifySidepanel\(sid, sess, terminal\);/.test(agentLoop),
    'reasons derived from code: notifySidepanel is defined once and called once, from finalizeSession with its terminal');
  const finalizeCalls = agentLoop.match(/finalizeSession\([^)]*\)/g) || [];
  const finalizeUses = finalizeCalls.filter((c) => c.indexOf('finalizeSession(sid, sess, terminal)') !== 0);
  check(finalizeUses.length >= 12 && finalizeUses.every((c) => /^finalizeSession\(sessionId, session, [A-Za-z_$][\w$]*\)$/.test(c)),
    'reasons derived from code: every finalizeSession call passes a terminal (' + finalizeUses.length + ' calls)');

  // 2. The two guard broadcasts in runAgentIteration.
  const guardReasons = [];
  for (let at = agentLoop.indexOf("action: 'automation"); at !== -1; at = agentLoop.indexOf("action: 'automation", at + 1)) {
    const object = enclosingObject(agentLoop, at);
    const outcome = literalOf(object || '', 'outcome');
    for (const reason of literalReasons(object || '')) {
      guardReasons.push(reason);
      add(reason, outcome, 'agent-loop guard broadcast');
    }
  }
  check(guardReasons.indexOf('session_not_found') !== -1 && guardReasons.indexOf('session_not_running') !== -1,
    'reasons derived from code: the guard broadcasts carry ' + show(Array.from(new Set(guardReasons))));

  // 3. background.js lifecycle broadcasts that a run_task can receive. The
  // legacy startAutomationLoop and the replay broadcasts (fsbReplayFinalize,
  // fsbReplayPauseForDecision) are excluded: a run_task session runs the
  // agent loop (runAgentLoop), never the legacy loop, and is never a replay.
  const EXCLUDED_FUNCTIONS = ['startAutomationLoop', 'fsbReplayFinalize', 'fsbReplayPauseForDecision'];
  const functions = topLevelFunctions(background);
  for (const name of EXCLUDED_FUNCTIONS.concat(['handleStartAutomation', 'handleStopAutomation'])) {
    check(functions.some((f) => f.name === name), 'reasons derived from code: background.js function ' + name + ' is located');
  }
  const backgroundReasons = [];
  let reasonlessError = 0;
  for (let at = background.indexOf('fsbBroadcastAutomationLifecycle({'); at !== -1;
    at = background.indexOf('fsbBroadcastAutomationLifecycle({', at + 1)) {
    const owner = functions.filter((f) => f.start <= at && at <= f.end).pop();
    if (owner && EXCLUDED_FUNCTIONS.indexOf(owner.name) !== -1) continue;
    const open = background.indexOf('{', at);
    const object = background.slice(open, matchClose(background, open) + 1);
    const action = literalOf(object, 'action');
    const reasons = literalReasons(object);
    if (action === 'automationError' && reasons.length === 0) {
      reasonlessError += 1;
      check(literalOf(object, 'outcome') === null, 'reasons derived from code: the reasonless automationError carries no outcome either');
    }
    for (const reason of reasons) {
      backgroundReasons.push(reason);
      add(reason, literalOf(object, 'outcome') || 'stopped', 'background.js ' + (owner ? owner.name : 'top level'));
    }
  }
  for (const reason of ['user_stopped', 'tab_closed', 'service_worker_restart']) {
    check(backgroundReasons.indexOf(reason) !== -1, 'reasons derived from code: background.js broadcasts reason ' + reason);
  }
  check(reasonlessError >= 1, 'reasons derived from code: background.js broadcasts the reasonless content-script abort (' + reasonlessError + ')');
  check(literalReasons(functionSource(background, 'startAutomationLoop') || '').length > 0,
    'reasons derived from code: the excluded legacy loop exists and still carries its own reasons (exclusion is deliberate)');

  // 4. partial_task's schema enum and the stuck reasons, each with its terminal.
  for (const reason of partialEnum || []) add(reason, 'partial', 'partial_task enum');
  for (const reason of stuckReasons) add(reason, 'stopped', 'turn-result.js STUCK_REASONS');

  // createTerminalOutcome defaults that no call site produces. 'completed'
  // comes only from notifySidepanel's fallback, which is unreachable (above);
  // 'stopped' is the default for a stopped terminal with no reason, and every
  // stopped call site passes one. Both classify as 'other'.
  const DEFAULT_ONLY_ALLOWLIST = ['completed', 'stopped'];
  for (const reason of DEFAULT_ONLY_ALLOWLIST) {
    const produced = scanned.filter((e) => e.reason === reason && e.origin !== 'createTerminalOutcome default');
    check(produced.length === 0, 'reasons derived from code: allowlisted default ' + reason + ' is produced by no call site or broadcast');
  }

  const seen = new Set();
  for (const entry of scanned) {
    const key = entry.terminal + ':' + entry.reason;
    if (seen.has(key)) continue;
    seen.add(key);
    const ev = evidence();
    const settle = entry.terminal === 'error' ? errorSettle(entry.reason) : completeSettle(entry.terminal, entry.reason);
    const b = block(sessionWith(ev), settle);
    if (DEFAULT_ONLY_ALLOWLIST.indexOf(entry.reason) !== -1) {
      check(b.reason === 'other', 'reasons derived from code: allowlisted default ' + key + ' classifies as other');
      continue;
    }
    const want = entry.terminal === 'success' ? 'done'
      : (entry.terminal === 'partial' && entry.reason === 'manual_approval' ? 'needs_confirmation' : 'blocked');
    check(b.outcome === want && b.reason === entry.reason,
      'reasons derived from code: ' + key + ' (' + entry.origin + ') classifies to ' + want + '/' + entry.reason
      + ' (got ' + b.outcome + '/' + b.reason + ')');
  }
  check(seen.size >= 25, 'reasons derived from code: ' + seen.size + ' distinct terminal:reason pairs scanned');
});

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

/** A jevMeasurement built with the module's own helpers, as 68 writes it. */
function measuredSession(extra) {
  const session = sessionWith(evidence(), extra);
  FsbFastPath.appendAttempt(session, FsbFastPath.attemptFromResult({ ok: false, fallback: 'timeout', latencyMs: 2500 },
    { iteration: 2, command: 1, outcome: 'escalated', escalationReason: 'timeout' }));
  FsbFastPath.appendAttempt(session, FsbFastPath.attemptFromResult({ ok: true, calibration: { status: 'uncalibrated' }, latencyMs: 300 },
    { iteration: 3, command: 1, outcome: 'escalated', escalationReason: 'uncertain' }));
  FsbFastPath.appendAttempt(session, FsbFastPath.attemptFromResult({ ok: true, calibration: { status: 'calibrated' }, latencyMs: 310 },
    { iteration: 4, command: 1, outcome: 'acted', op: 'click' }));
  FsbFastPath.addCommandTotals(session, 1, { jevCalls: 3, jevMs: 910 });
  FsbFastPath.addCommandTotals(session, 1, { fastSteps: 2, escalation: 'uncertain' });
  FsbFastPath.addCommandTotals(session, 1, { escalation: 'timeout' });
  FsbFastPath.addCommandTotals(session, 1, { escalation: 'timeout' });
  FsbFastPath.addCommandTotals(session, 1, { escalation: 'zz_new_code' });
  return session;
}

const ZERO_SUMMARY = Object.freeze({
  attempts: 0, calls: 0, fast_steps: 0, jev_ms: null, calibration: null, latched: null, exhausted: null, escalations: {}
});

section('summary', () => {
  const s = measuredSession({
    _fastPath: { off: false, offReason: null, offCommand: null },
    agentState: { jevFast: { command: 1, latched: 'step_budget' } }
  });
  check(s.jevMeasurement.attempts.length === 3 && s.jevMeasurement.commands.length === 1
    && isDeepStrictEqual(s.jevMeasurement.commands[0].escalations, { uncertain: 1, timeout: 2, zz_new_code: 1 }),
  'summary: fixture totals are {fastSteps:2, jevCalls:3, jevMs:910, escalations:{uncertain:1, timeout:2, zz_new_code:1}}');
  const before = JSON.parse(JSON.stringify({ m: s.jevMeasurement, f: s._fastPath, a: s.agentState }));
  const jev = FsbFastPath.summarizeFastMode(s);
  check(isDeepStrictEqual(jev, {
    attempts: 3, calls: 3, fast_steps: 2, jev_ms: 910, calibration: 'calibrated', latched: null, exhausted: 'step_budget',
    escalations: { uncertain: 1, timeout: 2, other: 1 }
  }), 'summary: three attempts and a step-budget command latch give the documented summary (got ' + show(jev) + ')');
  check(isDeepStrictEqual(Object.keys(jev), FsbFastPath.FAST_MODE_SUMMARY_KEYS), 'summary: keys follow FAST_MODE_SUMMARY_KEYS');
  check(isDeepStrictEqual(JSON.parse(JSON.stringify({ m: s.jevMeasurement, f: s._fastPath, a: s.agentState })), before),
    'summary: jevMeasurement, _fastPath and agentState are unchanged (F12)');
  check(isDeepStrictEqual(block(s, completeSettle('success', 'complete_task')).jev, jev), 'summary: the block carries the same summary');

  check(isDeepStrictEqual(FsbFastPath.summarizeFastMode(sessionWith(evidence())), ZERO_SUMMARY),
    'summary: a session with no jevMeasurement gives the zero summary');
  const bare = sessionWith(evidence());
  FsbFastPath.summarizeFastMode(bare);
  check(!('jevMeasurement' in bare) && !('_fastPath' in bare) && !('agentState' in bare),
    'summary: summarizing creates no jevMeasurement, _fastPath or agentState');
  check(isDeepStrictEqual(FsbFastPath.summarizeFastMode(sessionWith(evidence(), { jevMeasurement: { v: 1, attempts: [], commands: [] } })),
    ZERO_SUMMARY), 'summary: an empty jevMeasurement gives the zero summary');

  for (const budget of ['step_budget', 'call_budget', 'time_budget']) {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), { agentState: { jevFast: { latched: budget } } }));
    check(j.exhausted === budget && j.latched === null, 'summary: command latch ' + budget + ' is exhausted, not latched');
  }
  for (const code of ['not_calibrated', 'invalid_request', 'switch_off', 'exception', 'disabled']) {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), { _fastPath: { off: true, offReason: code } }));
    check(j.latched === code && j.exhausted === null, 'summary: session latch ' + code + ' is latched');
  }
  for (const code of ['sensitive_goal', 'no_progress', 'escalation_latch', 'vault_flow', 'local_invalid_request']) {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), { agentState: { jevFast: { latched: code } } }));
    check(j.latched === code && j.exhausted === null, 'summary: command latch ' + code + ' is latched');
  }
  {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), {
      _fastPath: { off: true, offReason: 'not_calibrated' }, agentState: { jevFast: { latched: 'call_budget' } }
    }));
    check(j.latched === 'not_calibrated' && j.exhausted === 'call_budget', 'summary: a session latch and a budget latch are both reported');
  }
  {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), {
      _fastPath: { off: true, offReason: 'timeout' }, agentState: { jevFast: { latched: 'sensitive_goal' } }
    }));
    check(j.latched === 'timeout', 'summary: the session latch wins over a non-budget command latch');
  }
  {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), { _fastPath: { off: false, offReason: 'timeout' } }));
    check(j.latched === null, 'summary: an offReason without off:true is not a latch');
  }
  {
    const j = FsbFastPath.summarizeFastMode(sessionWith(evidence(), {
      _fastPath: { off: true, offReason: 'zz_unknown_latch' }, agentState: { jevFast: { latched: 'zz_budget' } }
    }));
    check(j.latched === 'other' && j.exhausted === null, 'summary: unknown latch codes become other');
  }
  {
    const s2 = sessionWith(evidence(), { jevMeasurement: { v: 1, attempts: [{ calibrationStatus: 'zz_status' }], commands: [] } });
    check(FsbFastPath.summarizeFastMode(s2).calibration === 'other', 'summary: an unknown calibration status gives other');
  }
  {
    const s3 = sessionWith(evidence(), {
      jevMeasurement: { v: 1, attempts: [{ calibrationStatus: 'uncalibrated' }, { calibrationStatus: null }], commands: [] }
    });
    const j = FsbFastPath.summarizeFastMode(s3);
    check(j.calibration === 'uncalibrated' && j.attempts === 2, 'summary: calibration is the last non-null status');
  }
  {
    const s4 = sessionWith(evidence(), {
      jevMeasurement: {
        v: 1,
        attempts: [{}, {}],
        commands: [
          { command: 1, fastSteps: 1, jevCalls: 1, jevMs: null, escalations: { menu_invalid: 1 } },
          { command: 2, fastSteps: 3, jevCalls: 2, jevMs: 40, escalations: { menu_invalid: 2, other: 1, 'Not A Code': 4, bad: -1 } },
          null,
          { command: 3, fastSteps: 'x', jevCalls: 1.5, jevMs: -2, escalations: null }
        ]
      }
    });
    const j = FsbFastPath.summarizeFastMode(s4);
    check(j.calls === 3 && j.fast_steps === 4 && j.jev_ms === 40 && j.calibration === null,
      'summary: counts sum over commands and skip invalid values (got ' + show(j) + ')');
    check(isDeepStrictEqual(j.escalations, { menu_invalid: 3, other: 5 }), 'summary: escalations sum over commands, unknown codes fold into other');
  }
  {
    const s5 = sessionWith(evidence(), { jevMeasurement: { v: 1, attempts: [], commands: [{ command: 1, fastSteps: 0, jevCalls: 0, jevMs: null, escalations: {} }] } });
    check(FsbFastPath.summarizeFastMode(s5).jev_ms === null, 'summary: jev_ms stays null until a decide is timed');
  }
});

// ---------------------------------------------------------------------------
// fallbacks never decide the outcome
// ---------------------------------------------------------------------------

section('fallbacks never decide the outcome', () => {
  const settles = [
    completeSettle('success', 'complete_task'),
    completeSettle('success', 'end_turn'),
    completeSettle('stopped', 'user_stopped'),
    completeSettle('partial', 'manual_approval'),
    completeSettle('partial', 'auth_required'),
    errorSettle('fail_task'),
    abortSettle(),
    SAFETY_NET
  ];
  const evidences = [evidence(), uncertainEvidence(), gateEvidence('payment_not_approved', false), undefined];
  for (const ev of evidences) {
    for (const settle of settles) {
      const plain = sessionWith(ev === undefined ? undefined : JSON.parse(JSON.stringify(ev)));
      const noisy = sessionWith(ev === undefined ? undefined : JSON.parse(JSON.stringify(ev)), {
        _fastPath: { off: true, offReason: 'not_calibrated', offCommand: 1, calibratedSeen: false },
        agentState: { jevFast: { command: 1, latched: 'escalation_latch', steps: 0, calls: 19 } }
      });
      for (const reason of CONTRACT.FALLBACK_REASONS) {
        FsbFastPath.appendAttempt(noisy, FsbFastPath.attemptFromResult({ ok: false, fallback: reason },
          { iteration: 1, command: 1, outcome: 'escalated', escalationReason: reason }));
        FsbFastPath.addCommandTotals(noisy, 1, { jevCalls: 1, jevMs: 10, escalation: reason });
      }
      const a = block(plain, settle);
      const b = block(noisy, settle);
      const label = (settle.message ? (settle.message.outcome || settle.message.action) + '/' + (settle.message.reason || '-') : settle.kind)
        + (ev === undefined ? ' (no evidence)' : '');
      check(a.outcome === b.outcome && a.reason === b.reason && a.uncertain_unobserved === b.uncertain_unobserved
        && a.human_gate === b.human_gate,
      'fallbacks never decide the outcome: ' + label + ' gives ' + a.outcome + '/' + a.reason + ' with or without fallbacks');
      check(b.jev !== null && b.jev.latched === 'not_calibrated' && Object.keys(b.jev.escalations).length === CONTRACT.FALLBACK_REASONS.length,
        'fallbacks never decide the outcome: ' + label + ' still reports the fallbacks and the latch');
    }
  }
});

// ---------------------------------------------------------------------------
// static slice ban
// ---------------------------------------------------------------------------

const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'function', 'typeof', 'catch', 'new', 'var', 'do', 'else',
  'try', 'throw', 'in', 'of', 'void', 'delete', 'instanceof']);

/** The module functions `rootNames` call, transitively, as {name: source}. */
function callClosure(source, rootNames) {
  const out = {};
  const queue = rootNames.slice();
  while (queue.length > 0) {
    const name = queue.shift();
    if (Object.prototype.hasOwnProperty.call(out, name)) continue;
    const text = functionSource(source, name);
    if (text === null) continue;
    out[name] = text;
    const re = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (!JS_KEYWORDS.has(m[1]) && m[1] !== name) queue.push(m[1]);
    }
  }
  return out;
}

section('static slice ban', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const slices = callClosure(source, ['classifyRunTaskOutcome', 'summarizeFastMode']);
  const names = Object.keys(slices);
  check(names.indexOf('classifyRunTaskOutcome') !== -1 && names.indexOf('summarizeFastMode') !== -1,
    'static slice ban: both functions are in the module');
  check(names.indexOf('runEvidenceUnresolved') !== -1, 'static slice ban: the closure includes runEvidenceUnresolved (' + names.join(', ') + ')');
  const bans = [
    ['decisions', /decisions/],
    ['meetsThreshold', /meetsThreshold/],
    ['probabilities', /probabilities/],
    ['.threshold', /\.threshold\b/],
    ['.task', /\.task\b/],
    ['.label', /\.label\b/],
    ['.url', /\.url\b/],
    ['.title', /\.title\b/],
    ['.result', /\.result\b/],
    ['.summary', /\.summary\b/],
    ['a bracketed read of a content key', /\[\s*['"](decisions|task|label|url|title|result|summary|threshold|probabilities)['"]\s*\]/]
  ];
  for (const name of names) {
    for (const [what, re] of bans) {
      check(!re.test(slices[name]), 'static slice ban: ' + name + ' contains no ' + what);
    }
  }
  // The classifier never touches the Jev measurement or the latches.
  const classifierOnly = callClosure(source, ['classifyRunTaskOutcome']);
  for (const name of Object.keys(classifierOnly)) {
    check(!/jevMeasurement|_fastPath|jevFast|calibration|escalation/i.test(classifierOnly[name].replace(/^function [^(]+/, '')),
      'static slice ban: ' + name + ' (classifier closure) reads no Jev measurement, latch or escalation');
  }
});

// ---------------------------------------------------------------------------
// no page content
// ---------------------------------------------------------------------------

const MARK = Object.freeze({
  task: 'P70-MARKER-TASK',
  label: 'P70-MARKER-LABEL',
  url: 'http://p70-marker-url.example/P70-MARKER-URL?q=P70-MARKER-URL',
  result: 'P70-MARKER-RESULT'
});

function markedSession(ev) {
  return sessionWith(ev, {
    task: MARK.task,
    title: MARK.label,
    lastKnownUrl: MARK.url,
    _fastRunStartPage: MARK.url,
    _lastActionSummary: MARK.result,
    messages: [{ role: 'user', content: MARK.task }, { role: 'tool', content: MARK.result }],
    lastTurnResult: { toolResults: [{ name: 'click', result: MARK.result }] },
    outcomeDetails: { summary: MARK.result, blocker: MARK.result, result: MARK.result },
    _fastPath: {
      off: true,
      offReason: MARK.label,
      offCommand: 1,
      pendingSteps: [{ label: MARK.label, url: MARK.url, outcome: 'uncertain' }],
      recent: [{ op: 'click', role: 'button', name: MARK.label }],
      stopReason: MARK.label
    },
    agentState: {
      jevFast: {
        latched: MARK.label,
        firstUrl: MARK.url,
        lastStep: { op: 'click', label: MARK.label, url: MARK.url },
        answeredStates: [MARK.url + '\nsig']
      }
    },
    jevMeasurement: {
      v: 1,
      attempts: [{ calibrationStatus: MARK.label, servedModel: MARK.result, escalationReason: MARK.label }],
      commands: [{ command: 1, fastSteps: 1, jevCalls: 1, jevMs: 5, escalations: { [MARK.label]: 2, [MARK.url]: 1, uncertain: 1 } }]
    }
  });
}

section('no page content', () => {
  const contentFields = { result: MARK.result, blocker: MARK.result, nextStep: MARK.result, error: MARK.result, task: MARK.task,
    outcomeDetails: { summary: MARK.result, result: MARK.result } };
  const settles = [
    completeSettle('success', 'complete_task', contentFields),
    completeSettle('partial', 'manual_approval', contentFields),
    completeSettle('partial', MARK.result, contentFields),
    completeSettle(MARK.result, MARK.label, contentFields),
    errorSettle(MARK.result, contentFields),
    errorSettle(undefined, contentFields),
    abortSettle(),
    { source: MARK.url, kind: MARK.label, message: Object.assign({ outcome: 'stopped', reason: 'user_stopped' }, contentFields) },
    SAFETY_NET
  ];
  const evidences = [evidence(), uncertainEvidence(), gateEvidence('site_consent_required', false), undefined,
    evidence({ pending: { tool: MARK.label, iteration: 1, seq: 2 }, gate: { code: MARK.label, tool: MARK.label, seq: 1, cleared: false } })];
  let count = 0;
  for (const ev of evidences) {
    for (const settle of settles) {
      const text = JSON.stringify(block(markedSession(ev), settle));
      count += 1;
      check(!/p70-marker/i.test(text), 'no page content: block ' + count + ' holds no marker string (' + text.slice(0, 90) + ')');
    }
  }
  const odd = markedSession(evidence());
  odd.fastMode = { enabled: true, stored: true, source: 'mcp', budgetProfile: MARK.label };
  check(!/p70-marker/i.test(JSON.stringify(block(odd, completeSettle('success', 'complete_task')))),
    'no page content: an unknown budgetProfile name never reaches the block');
});

// ---------------------------------------------------------------------------
// block shape
// ---------------------------------------------------------------------------

const ITEM_D_CODES = ['disabled', 'not_configured', 'invalid_request', 'payload_too_large', 'sensitive_goal', 'busy',
  'spend_cap_reached', 'timeout', 'rate_limited', 'upstream_overloaded', 'auth_error', 'upstream_billing', 'unavailable_model',
  'upstream_rejected', 'upstream_error', 'invalid_response', 'network_error', 'aborted', 'server_error', 'unknown_fallback',
  'not_calibrated', 'jev_stuck', 'completion_unconfirmed', 'op_not_offered', 'op_not_in_element_ops', 'page_op_with_target',
  'unknown_target', 'risk_excluded', 'not_fast_eligible', 'stale', 'uncertain', 'dispatch_unconfirmed', 'failed', 'denied',
  'no_effect', 'no_progress', 'same_state', 'step_budget', 'call_budget', 'time_budget', 'consecutive_cap', 'escalation_latch',
  'vault_flow', 'switch_off', 'menu_unavailable', 'menu_invalid', 'nothing_offerable', 'local_invalid_request', 'exception',
  'unavailable'];
const ACCEPT_REASONS = ['not_ok', 'not_calibrated', 'kind_absent', 'threshold_null', 'below_threshold', 'catch_all', 'malformed'];

function closedBlock(b, label) {
  const lists = FsbFastPath;
  check(isDeepStrictEqual(Object.keys(b), lists.FAST_MODE_BLOCK_KEYS), 'block shape: ' + label + ' keys follow FAST_MODE_BLOCK_KEYS');
  check(isDeepStrictEqual(JSON.parse(JSON.stringify(b)), b), 'block shape: ' + label + ' survives a JSON round trip');
  check(lists.FAST_MODE_OUTCOMES.indexOf(b.outcome) !== -1 && (lists.FAST_MODE_REASONS[b.outcome] || []).indexOf(b.reason) !== -1,
    'block shape: ' + label + ' outcome/reason ' + b.outcome + '/' + b.reason + ' is in its closed list');
  check(b.uncertain_unobserved === true || b.uncertain_unobserved === false || b.uncertain_unobserved === null,
    'block shape: ' + label + ' uncertain_unobserved is a boolean or null');
  check(b.human_gate === null || lists.FAST_MODE_HUMAN_GATES.indexOf(b.human_gate) !== -1, 'block shape: ' + label + ' human_gate is closed');
  check(b.budget_profile === null || Object.keys(lists.BUDGET_PROFILES).indexOf(b.budget_profile) !== -1,
    'block shape: ' + label + ' budget_profile is a profile name or null');
  if (b.jev !== null) {
    const j = b.jev;
    check(isDeepStrictEqual(Object.keys(j), lists.FAST_MODE_SUMMARY_KEYS), 'block shape: ' + label + ' jev keys follow FAST_MODE_SUMMARY_KEYS');
    check([j.attempts, j.calls, j.fast_steps].every((n) => Number.isInteger(n) && n >= 0), 'block shape: ' + label + ' jev counts are integers >= 0');
    check(j.jev_ms === null || (typeof j.jev_ms === 'number' && isFinite(j.jev_ms) && j.jev_ms >= 0), 'block shape: ' + label + ' jev_ms is a number or null');
    check(j.calibration === null || CONTRACT.CALIBRATION_STATUSES.concat(['other']).indexOf(j.calibration) !== -1,
      'block shape: ' + label + ' calibration is closed');
    check([j.latched, j.exhausted].every((c) => c === null || lists.FAST_MODE_ESCALATION_CODES.indexOf(c) !== -1),
      'block shape: ' + label + ' latched and exhausted are closed');
    check(Object.getPrototypeOf(j.escalations) === Object.prototype
      && Object.keys(j.escalations).every((k) => lists.FAST_MODE_ESCALATION_CODES.indexOf(k) !== -1 && Number.isInteger(j.escalations[k])),
    'block shape: ' + label + ' escalations is one plain map of closed codes to counts');
  }
}

section('block shape', () => {
  const f = FsbFastPath;
  check(isDeepStrictEqual(f.FAST_MODE_OUTCOMES, ['done', 'ambiguous', 'blocked', 'needs_confirmation']), 'block shape: FAST_MODE_OUTCOMES');
  check(isDeepStrictEqual(f.FAST_MODE_HUMAN_GATES, ['manual_approval', 'payment_not_approved', 'site_consent_required']),
    'block shape: FAST_MODE_HUMAN_GATES');
  check(isDeepStrictEqual(f.FAST_MODE_BLOCK_KEYS, ['outcome', 'reason', 'uncertain_unobserved', 'human_gate', 'budget_profile', 'jev']),
    'block shape: FAST_MODE_BLOCK_KEYS');
  check(isDeepStrictEqual(f.FAST_MODE_SUMMARY_KEYS,
    ['attempts', 'calls', 'fast_steps', 'jev_ms', 'calibration', 'latched', 'exhausted', 'escalations']), 'block shape: FAST_MODE_SUMMARY_KEYS');
  check(isDeepStrictEqual(f.FAST_MODE_REASONS, {
    done: ['complete_task', 'end_turn', 'other'],
    ambiguous: ['classifier_error', 'safety_net_timeout', 'uncertain_action', 'evidence_unavailable'],
    blocked: ['blocked', 'auth_required', 'credentials_missing', 'user_skipped_login', 'credentials_failed', 'fail_task', 'error',
      'iteration_limit_exceeded', 'cost_limit_exceeded', 'time_limit_exceeded', 'safety', 'meta_cognitive_loop_break',
      'stuck_action_repetition', 'stuck_no_goal_progress', 'stuck_dom_hash', 'user_stopped', 'tab_closed', 'service_worker_restart',
      'session_not_found', 'session_not_running', 'other'],
    needs_confirmation: ['manual_approval', 'payment_not_approved', 'site_consent_required']
  }), 'block shape: FAST_MODE_REASONS is the documented closed list');
  check(isDeepStrictEqual(Object.keys(f.FAST_MODE_REASONS), f.FAST_MODE_OUTCOMES), 'block shape: FAST_MODE_REASONS has one list per outcome, in order');
  const lists = ['FAST_MODE_OUTCOMES', 'FAST_MODE_HUMAN_GATES', 'FAST_MODE_REASONS', 'FAST_MODE_BLOCK_KEYS', 'FAST_MODE_SUMMARY_KEYS',
    'FAST_MODE_ESCALATION_CODES'];
  for (const name of lists) check(f[name] !== undefined && Object.isFrozen(f[name]), 'block shape: ' + name + ' is frozen');
  for (const outcome of Object.keys(f.FAST_MODE_REASONS || {})) {
    check(Object.isFrozen(f.FAST_MODE_REASONS[outcome]), 'block shape: FAST_MODE_REASONS.' + outcome + ' is frozen');
  }
  const codes = f.FAST_MODE_ESCALATION_CODES || [];
  for (const reason of CONTRACT.FALLBACK_REASONS) {
    check(codes.indexOf(reason) !== -1, 'block shape: FAST_MODE_ESCALATION_CODES holds fallback reason ' + reason);
  }
  const itemD = ITEM_D_CODES.concat(ACCEPT_REASONS.map((r) => 'operation_' + r), ACCEPT_REASONS.map((r) => 'target_' + r));
  const missing = itemD.filter((c) => codes.indexOf(c) === -1);
  check(missing.length === 0, 'block shape: FAST_MODE_ESCALATION_CODES holds every 70-SYNC-RECHECK item d code (missing ' + show(missing) + ')');
  check(codes.indexOf('other') !== -1, "block shape: FAST_MODE_ESCALATION_CODES holds 'other'");
  const generic = f.describeEscalation('zz_unknown_code');
  check(codes.filter((c) => c !== 'other').every((c) => ['not_enabled', 'first_llm_turn', 'yield_to_llm', 'stopped'].indexOf(c) !== -1
    || f.describeEscalation(c) !== generic),
  'block shape: every escalation code but the four decline codes and other has its own describeEscalation sentence');
  const allStrings = [].concat(f.FAST_MODE_OUTCOMES, f.FAST_MODE_HUMAN_GATES, f.FAST_MODE_BLOCK_KEYS, f.FAST_MODE_SUMMARY_KEYS, codes,
    ...Object.keys(f.FAST_MODE_REASONS || {}).map((k) => f.FAST_MODE_REASONS[k]));
  check(allStrings.every((s) => /^[a-z_]{1,40}$/.test(s)), 'block shape: every vocabulary string matches ^[a-z_]{1,40}$ (the bench token rule)');
  for (const name of lists.filter((n) => n !== 'FAST_MODE_REASONS')) {
    check(new Set(f[name]).size === f[name].length, 'block shape: ' + name + ' has no duplicates');
  }

  const samples = [
    ['done', block(measuredSession(), completeSettle('success', 'complete_task'))],
    ['ambiguous', block(sessionWith(uncertainEvidence()), completeSettle('success', 'complete_task'))],
    ['needs_confirmation', block(sessionWith(gateEvidence('payment_not_approved', false)), completeSettle('partial', 'blocked'))],
    ['blocked', block(sessionWith(evidence()), completeSettle('stopped', 'tab_closed'))],
    ['safety net', block(sessionWith(undefined), SAFETY_NET)],
    ['classifier_error', block(null, completeSettle('success', 'complete_task'))],
    ['marked', block(markedSession(evidence()), completeSettle('success', 'complete_task'))]
  ];
  for (const [label, b] of samples) closedBlock(b, label);
  check(samples[0][1].budget_profile === 'run_task', "block shape: a run_task session's block names budget_profile run_task");
  const autopilot = sessionWith(evidence());
  autopilot.fastMode = { enabled: true, stored: true, source: null };
  check(block(autopilot, completeSettle('success', 'complete_task')).budget_profile === 'autopilot',
    'block shape: a field without budgetProfile gives budget_profile autopilot');
  const first = block(sessionWith(evidence()), completeSettle('success', 'complete_task'));
  const second = block(sessionWith(evidence()), completeSettle('success', 'complete_task'));
  check(first !== second && first.jev !== second.jev && isDeepStrictEqual(first, second), 'block shape: each call returns a fresh object');
});

// ---------------------------------------------------------------------------
// never throws
// ---------------------------------------------------------------------------

section('never throws', () => {
  const settle = completeSettle('success', 'complete_task');
  const CLASSIFIER_ERROR = { outcome: 'ambiguous', reason: 'classifier_error', uncertain_unobserved: null, human_gate: null };

  const throwingEvidence = measuredSession();
  delete throwingEvidence._fastRunEvidence;
  Object.defineProperty(throwingEvidence, '_fastRunEvidence', { get() { throw new Error('P70-MARKER-RESULT'); } });
  let b = null;
  let threw = false;
  try { b = block(throwingEvidence, settle); } catch (_e) { threw = true; }
  check(!threw && b !== null, 'never throws: a throwing _fastRunEvidence getter');
  check(b !== null && b.outcome === 'ambiguous' && b.reason === 'classifier_error' && b.uncertain_unobserved === null && b.human_gate === null,
    'never throws: a throwing _fastRunEvidence getter gives ambiguous/classifier_error');
  check(b !== null && isDeepStrictEqual(b.jev, FsbFastPath.summarizeFastMode(measuredSession())) && b.budget_profile === 'run_task',
    'never throws: the summary and budget_profile are still computed');

  const throwingMeasurement = sessionWith(evidence());
  Object.defineProperty(throwingMeasurement, 'jevMeasurement', { get() { throw new Error('boom'); } });
  b = block(throwingMeasurement, settle);
  check(b.outcome === 'done' && b.reason === 'complete_task' && b.uncertain_unobserved === false && b.jev === null,
    'never throws: a throwing jevMeasurement getter keeps the classified outcome with jev null');

  b = block(null, settle);
  check(isDeepStrictEqual(Object.keys(b), FsbFastPath.FAST_MODE_BLOCK_KEYS)
    && isDeepStrictEqual(b, Object.assign({}, CLASSIFIER_ERROR, { budget_profile: null, jev: null })),
  'never throws: a null session gives classifier_error with every key present (got ' + show(b) + ')');
  b = block(undefined, settle);
  check(b.reason === 'classifier_error' && b.jev === null, 'never throws: an undefined session gives classifier_error');

  for (const bad of [null, undefined, 'complete', 42]) {
    b = block(sessionWith(evidence()), bad);
    check(b.reason === 'classifier_error' && b.jev !== null && b.budget_profile === 'run_task',
      'never throws: settle ' + show(bad) + ' gives classifier_error and keeps the summary');
  }
  const throwingMessage = { source: 'lifecycleBus', kind: 'complete' };
  Object.defineProperty(throwingMessage, 'message', { get() { throw new Error('boom'); } });
  check(block(sessionWith(evidence()), throwingMessage).reason === 'classifier_error', 'never throws: a throwing message getter');
  const throwingOutcome = { source: 'lifecycleBus', kind: 'complete', message: {} };
  Object.defineProperty(throwingOutcome.message, 'outcome', { get() { throw new Error('boom'); } });
  check(block(sessionWith(evidence()), throwingOutcome).reason === 'classifier_error', 'never throws: a throwing message.outcome getter');
  const throwingGate = sessionWith(evidence());
  Object.defineProperty(throwingGate._fastRunEvidence, 'gates', { get() { throw new Error('boom'); } });
  check(block(throwingGate, completeSettle('partial', 'blocked')).reason === 'classifier_error', 'never throws: a throwing evidence field');

  const throwingField = sessionWith(evidence());
  Object.defineProperty(throwingField, 'fastMode', { get() { throw new Error('boom'); } });
  b = block(throwingField, settle);
  check(b.budget_profile === null && b.outcome === 'done', 'never throws: a throwing fastMode getter nulls only budget_profile');

  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  threw = false;
  try { b = block(revocable.proxy, settle); } catch (_e) { threw = true; }
  check(!threw && b.reason === 'classifier_error' && b.jev === null && b.budget_profile === null,
    'never throws: a revoked proxy session gives classifier_error');

  const cyclic = sessionWith(evidence());
  cyclic.self = cyclic;
  cyclic._fastRunEvidence.self = cyclic;
  threw = false;
  try { JSON.stringify(block(cyclic, settle)); } catch (_e) { threw = true; }
  check(!threw, 'never throws: a cyclic session still gives a serialisable block');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 && passed > 0 ? 0 : 1;
