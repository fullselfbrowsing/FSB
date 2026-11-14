'use strict';

/**
 * Phase 68 (D-21) -- a fake Jev gateway for offline fast-path proofs.
 *
 * Every body here is shaped to pass FsbJevState.validateGatewayResponse for
 * the request it answers: the decision keys equal request.kinds, and the
 * probability keys are exactly the offered vocabulary (operation: the
 * request's offeredOps plus none_of_the_above; target: the request's element
 * ids plus none_of_the_above).
 *
 * The calibrated body uses the test-only profile id 'test-calibrated'. No
 * calibrated profile is ever committed (D-21, 67 D-28); this file is the only
 * place a calibrated answer exists, and it never leaves the test process.
 *
 * makeClient builds a real FsbJevClient over an injected fetch and an
 * injected, held timer pair. The fake client never relies on the global
 * setTimeout: the 68-06 loop harness patches the global so callbacks run on
 * the next microtask, which would fire the 2.5 s decide deadline at once and
 * turn every fake answer into a timeout (sync issue 5). The held timers
 * record every (callback, delay) and run a callback only on fireAll().
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FsbJevClient = require(path.join(ROOT, 'extension', 'ai', 'jev-client.js'));
const FsbJevState = require(path.join(ROOT, 'extension', 'ai', 'jev-state.js'));

const CATCH_ALL = FsbJevState.CONTRACT.RESERVED_OPTION_KEY;
const TEST_ENDPOINT = 'https://gateway.test/api/jev/decide';
const SERVED_MODEL = 'jev-1.13.0';
const INSTRUMENT_VERSION = 'fsb-jev-instrument-1';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** The offered option keys for a Choice kind, in request order, plus the catch-all. */
function optionKeys(request, kind) {
  if (kind === 'operation') return request.offeredOps.slice().concat([CATCH_ALL]);
  return request.elements.map((e) => e.id).concat([CATCH_ALL]);
}

/** Probabilities over exactly `keys`: `choice` gets `top`, the rest share what is left. */
function probabilitiesFor(keys, choice, top) {
  const out = {};
  const others = keys.filter((k) => k !== choice);
  const rest = others.length > 0 ? Math.max(0, 1 - top) / others.length : 0;
  for (const key of keys) out[key] = key === choice ? top : rest;
  return out;
}

/**
 * One Choice decision. spec: {choice, confidence, threshold, meetsThreshold}.
 * The default choice is the first offered option; a threshold of null forces
 * meetsThreshold false (the validator refuses true without a threshold).
 */
function choiceDecision(request, kind, spec, calibrated) {
  const s = spec || {};
  const keys = optionKeys(request, kind);
  const choice = hasOwn(s, 'choice') ? s.choice : keys[0];
  const confidence = hasOwn(s, 'confidence') ? s.confidence : 0.95;
  const threshold = hasOwn(s, 'threshold') ? s.threshold : 0.9;
  let meetsThreshold = hasOwn(s, 'meetsThreshold') ? s.meetsThreshold : confidence >= (threshold === null ? 2 : threshold);
  if (threshold === null || !calibrated) meetsThreshold = false;
  return {
    choice,
    confidence,
    probabilities: probabilitiesFor(keys, choice, confidence),
    threshold,
    meetsThreshold
  };
}

/**
 * One Noul decision. spec: {p, threshold, meetsThreshold}. When
 * meetsThreshold is not given it follows the 67-03 polarity: completion is met
 * when p <= threshold (veto when low), stuck and risk when p >= threshold.
 */
function noulDecision(kind, spec, calibrated) {
  const s = spec || {};
  const defaults = {
    completion: { p: 0.05, threshold: 0.2 },
    stuck: { p: 0.05, threshold: 0.8 },
    risk: { p: 0.05, threshold: 0.8 }
  }[kind];
  const p = hasOwn(s, 'p') ? s.p : defaults.p;
  const threshold = hasOwn(s, 'threshold') ? s.threshold : defaults.threshold;
  let meetsThreshold;
  if (hasOwn(s, 'meetsThreshold')) meetsThreshold = s.meetsThreshold;
  else if (threshold === null) meetsThreshold = false;
  else meetsThreshold = kind === 'completion' ? p <= threshold : p >= threshold;
  if (threshold === null || !calibrated) meetsThreshold = false;
  return { p, threshold, meetsThreshold };
}

function decisionsFor(request, picks, calibrated) {
  const decisions = {};
  for (const kind of request.kinds) {
    if (kind === 'operation' || kind === 'target') decisions[kind] = choiceDecision(request, kind, picks[kind], calibrated);
    else decisions[kind] = noulDecision(kind, picks[kind], calibrated);
  }
  return decisions;
}

/**
 * A calibrated ok body (test-only profile). picks: {operation, target,
 * completion, stuck} specs (see above), plus optional decisionId,
 * servedModel, instrumentVersion, profileId, usage, cost and latencyMs.
 */
function calibratedBody(request, picks) {
  const p = picks || {};
  return {
    ok: true,
    decisionId: p.decisionId || 'test-decision-1',
    instrumentVersion: p.instrumentVersion || INSTRUMENT_VERSION,
    servedModel: p.servedModel || SERVED_MODEL,
    calibration: { status: 'calibrated', profileId: p.profileId || 'test-calibrated' },
    decisions: decisionsFor(request, p, true),
    usage: p.usage || { inputTokens: 900, source: 'provider' },
    cost: p.cost || { usd: 0.0000378, source: 'provider' },
    latencyMs: hasOwn(p, 'latencyMs') ? p.latencyMs : 120
  };
}

/** The shipped profile's answer: every threshold null, nothing meets it. */
function uncalibratedBody(request) {
  const nullSpec = { threshold: null, meetsThreshold: false };
  const picks = {};
  for (const kind of request.kinds) picks[kind] = nullSpec;
  return {
    ok: true,
    decisionId: 'test-decision-uncalibrated',
    instrumentVersion: INSTRUMENT_VERSION,
    servedModel: SERVED_MODEL,
    calibration: { status: 'uncalibrated', profileId: 'uncalibrated-v1' },
    decisions: decisionsFor(request, picks, false),
    usage: { inputTokens: 900, source: 'provider' },
    cost: { usd: 0.0000378, source: 'provider' },
    latencyMs: 110
  };
}

/** A profile whose instrument snapshot no longer matches: numeric thresholds, nothing met. */
function snapshotChangedBody(request) {
  return {
    ok: true,
    decisionId: 'test-decision-snapshot-changed',
    instrumentVersion: INSTRUMENT_VERSION,
    servedModel: SERVED_MODEL,
    calibration: { status: 'snapshot_changed', profileId: 'test-calibrated' },
    decisions: decisionsFor(request, {}, false),
    usage: { inputTokens: null, source: 'unavailable' },
    cost: { usd: null, source: 'unavailable' },
    latencyMs: 105
  };
}

/** A gateway fallback body. httpStatus defaults to the contract's status for the reason. */
function fallbackBody(reason, httpStatus) {
  const byReason = FsbJevState.CONTRACT.HTTP_STATUS_BY_REASON;
  const status = httpStatus !== undefined ? httpStatus : (hasOwn(byReason, reason) ? byReason[reason] : null);
  return { ok: false, fallback: reason, servedModel: null, httpStatus: status, latencyMs: 12 };
}

/**
 * A {setTimeout, clearTimeout} pair that records every (callback, delay) and
 * never runs a callback on its own. pending() counts armed, uncleared,
 * unfired timers; lastDelay() is the delay of the newest one; fireAll() runs
 * every pending callback once and returns how many ran.
 */
function makeHeldTimers() {
  const entries = [];
  let nextId = 1;
  function setTimeoutHeld(callback, delay) {
    const id = nextId;
    nextId += 1;
    entries.push({ id, callback, delay, cleared: false, fired: false });
    return id;
  }
  function clearTimeoutHeld(id) {
    for (const entry of entries) if (entry.id === id) entry.cleared = true;
  }
  return {
    setTimeout: setTimeoutHeld,
    clearTimeout: clearTimeoutHeld,
    entries,
    pending() {
      return entries.filter((e) => !e.cleared && !e.fired).length;
    },
    lastDelay() {
      return entries.length > 0 ? entries[entries.length - 1].delay : null;
    },
    fireAll() {
      let ran = 0;
      for (const entry of entries) {
        if (entry.cleared || entry.fired) continue;
        entry.fired = true;
        ran += 1;
        entry.callback();
      }
      return ran;
    }
  };
}

/**
 * A real FsbJevClient over a fake gateway. responder(parsedRequest, info)
 * returns (or resolves to) one of:
 *   - {status?, body} : answered with status (default 200) and JSON.stringify(body);
 *   - {status?, text} : answered with that raw text;
 *   - an Error        : fetch rejects (network_error);
 *   - a promise that never settles (for the deadline and abort cases).
 * opts: {now, timers}. timers defaults to a fresh makeHeldTimers().
 */
function makeClient(responder, opts) {
  const o = opts || {};
  const timers = o.timers || makeHeldTimers();
  const calls = [];
  async function fetchImpl(url, init) {
    const request = JSON.parse(init.body);
    calls.push({ url, init, request });
    const answer = await responder(request, { url, init, calls });
    if (answer instanceof Error) throw answer;
    const a = answer || {};
    const status = hasOwn(a, 'status') ? a.status : 200;
    const text = hasOwn(a, 'text') ? a.text : JSON.stringify(a.body);
    return { status, text: async () => text };
  }
  const client = FsbJevClient.createJevClient({
    endpoint: TEST_ENDPOINT,
    fetchImpl,
    now: o.now,
    setTimeoutImpl: timers.setTimeout,
    clearTimeoutImpl: timers.clearTimeout
  });
  return { decide: client.decide, resetCooldown: client.resetCooldown, timers, calls };
}

module.exports = {
  TEST_ENDPOINT,
  SERVED_MODEL,
  INSTRUMENT_VERSION,
  CATCH_ALL,
  optionKeys,
  calibratedBody,
  uncalibratedBody,
  snapshotChangedBody,
  fallbackBody,
  makeHeldTimers,
  makeClient
};
