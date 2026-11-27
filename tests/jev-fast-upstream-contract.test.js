#!/usr/bin/env node
'use strict';

/**
 * Phase 68 Plan 01 (D-24, T-68-14) -- upstream tripwire for fast mode.
 *
 * Phase 68 consumes interfaces that Phases 66.1 and 67 built: the settings
 * schema and the panel sync (66.1), FsbJevState, FsbJevClient and
 * FsbJevPolicy (67-06..67-08), the 67-10 shadow record API and the layout of
 * the 67-11 boundary suite. 68-SYNC-RECHECK.md recorded their real names and
 * shapes at P68_START. This suite asserts those names and the behaviour Phase
 * 68 relies on, so a later upstream change fails here, loudly, instead of
 * silently breaking the fast path.
 *
 * A failure means upstream drift: update 68-SYNC-RECHECK.md and the Phase 68
 * plans. Never weaken the upstream test to make this one pass.
 *
 * No network, no ports, no real timers: every client gets an injected fetch
 * and a timer pair that records the delay and never fires. Node 20-safe.
 *
 * Run: node tests/jev-fast-upstream-contract.test.js
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function check(cond, name) {
  if (cond) {
    passed += 1;
    console.log('  PASS: ' + name);
  } else {
    failed += 1;
    console.error('  FAIL: upstream drift: ' + name
      + ' -- update 68-SYNC-RECHECK.md and the Phase 68 plans; never weaken the upstream test');
  }
}

function section(title) {
  console.log('\n--- ' + title + ' ---');
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readRepo(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// The interface values 68-SYNC-RECHECK.md recorded at P68_START.
const EXPECTED_FALLBACK_REASONS = [
  'disabled', 'not_configured', 'invalid_request', 'payload_too_large', 'sensitive_goal', 'busy',
  'spend_cap_reached', 'timeout', 'rate_limited', 'upstream_overloaded', 'auth_error', 'upstream_billing',
  'unavailable_model', 'upstream_rejected', 'upstream_error', 'invalid_response', 'network_error', 'aborted',
  'server_error'
];
const EXPECTED_NON_TRANSIENT_REASONS = [
  'disabled', 'not_configured', 'spend_cap_reached', 'auth_error', 'upstream_billing', 'unavailable_model'
];
const EXPECTED_OPERATIONS = ['click', 'type_text', 'select_option', 'check_box', 'press_enter', 'hover', 'scroll', 'go_back'];

/** A timer pair that records each delay and never fires, so no real timer is armed. */
function inertTimers() {
  const delays = [];
  const cleared = [];
  let next = 1;
  return {
    delays,
    cleared,
    setTimeoutImpl(_fn, ms) { delays.push(ms); next += 1; return next; },
    clearTimeoutImpl(handle) { cleared.push(handle); }
  };
}

/** A fetch that answers once with `status` and `bodyText`, recording each call. */
function fakeFetch(status, bodyText) {
  const calls = [];
  const fetchImpl = function fetchImpl(url, init) {
    calls.push({ url, init });
    return Promise.resolve({ status, text: () => Promise.resolve(bodyText) });
  };
  return { calls, fetchImpl };
}

function calibratedBody() {
  return {
    ok: true,
    decisionId: 'd1',
    instrumentVersion: 'fsb-jev-instrument-1',
    servedModel: 'jev-1.13.0',
    calibration: { status: 'calibrated', profileId: 'test-calibrated' },
    decisions: {
      operation: {
        choice: 'click',
        confidence: 0.95,
        probabilities: { click: 0.95, check_box: 0.02, hover: 0.01, none_of_the_above: 0.02 },
        threshold: 0.9,
        meetsThreshold: true
      },
      target: {
        choice: 'e1',
        confidence: 0.95,
        probabilities: { e0: 0.03, e1: 0.95, none_of_the_above: 0.02 },
        threshold: 0.9,
        meetsThreshold: true
      },
      completion: { p: 0.05, threshold: 0.2, meetsThreshold: true },
      stuck: { p: 0.05, threshold: 0.8, meetsThreshold: false }
    },
    usage: { inputTokens: 900, source: 'provider' },
    cost: { usd: 0.00004, source: 'provider' },
    latencyMs: 120
  };
}

function uncalibratedBody() {
  const body = calibratedBody();
  body.calibration = { status: 'uncalibrated', profileId: 'uncalibrated-v1' };
  for (const kind of Object.keys(body.decisions)) {
    body.decisions[kind].threshold = null;
    body.decisions[kind].meetsThreshold = false;
  }
  return body;
}

async function main() {
  console.log('Phase 68 Plan 01 -- upstream tripwire (D-24)');

  // -------------------------------------------------------------------------
  section('module exports: require returns the api itself');
  // -------------------------------------------------------------------------
  const state = require('../extension/ai/jev-state.js');
  const client = require('../extension/ai/jev-client.js');
  const policy = require('../extension/ai/jev-policy.js');
  const configModule = require('../extension/config/config.js');
  const schema = configModule.FsbSettingsSchema;

  check(state !== null && typeof state === 'object' && typeof state.buildRequest === 'function'
    && !('FsbJevState' in state) && globalThis.FsbJevState === state,
  'FsbJevState: require(jev-state.js) is the api object (module.exports = api)');
  check(client !== null && typeof client === 'object' && typeof client.createJevClient === 'function'
    && !('FsbJevClient' in client) && globalThis.FsbJevClient === client,
  'FsbJevClient: require(jev-client.js) is the api object (module.exports = api)');
  check(policy !== null && typeof policy === 'object' && typeof policy.accept === 'function'
    && !('FsbJevPolicy' in policy) && globalThis.FsbJevPolicy === policy && Object.isFrozen(policy),
  'FsbJevPolicy: require(jev-policy.js) is the frozen api object (module.exports = api)');
  check(schema !== null && typeof schema === 'object' && Object.prototype.hasOwnProperty.call(configModule, 'FsbSettingsSchema'),
    'config.js exports FsbSettingsSchema as a named property');

  // -------------------------------------------------------------------------
  section('FsbJevState exports and CONTRACT');
  // -------------------------------------------------------------------------
  for (const name of ['buildRequest', 'validateGatewayResponse', 'validateRequest', 'toOriginPath', 'scrubText', 'filterInjection']) {
    check(typeof state[name] === 'function', 'FsbJevState.' + name + ' is a function');
  }
  const CONTRACT = state.CONTRACT || {};
  check(sameJson(CONTRACT.FALLBACK_REASONS, EXPECTED_FALLBACK_REASONS),
    'CONTRACT.FALLBACK_REASONS is the 19 reasons, in order');
  check(sameJson(CONTRACT.NON_TRANSIENT_REASONS, EXPECTED_NON_TRANSIENT_REASONS),
    'CONTRACT.NON_TRANSIENT_REASONS is the 6 non-transient reasons');
  check(sameJson(CONTRACT.OPERATIONS, EXPECTED_OPERATIONS), 'CONTRACT.OPERATIONS is the 8 operations, in order');
  check(sameJson(CONTRACT.KEYS && CONTRACT.KEYS.element, ['id', 'role', 'label', 'ops']),
    "CONTRACT.KEYS.element is ['id','role','label','ops'] (no value slot)");
  check(CONTRACT.RESERVED_OPTION_KEY === 'none_of_the_above', "CONTRACT.RESERVED_OPTION_KEY is 'none_of_the_above'");
  check(sameJson(CONTRACT.CALIBRATION_STATUSES, ['calibrated', 'uncalibrated', 'snapshot_changed']),
    'CONTRACT.CALIBRATION_STATUSES is calibrated, uncalibrated, snapshot_changed');
  check(CONTRACT.NOUL_DIRECTION && CONTRACT.NOUL_DIRECTION.completion === 'veto_when_low',
    "CONTRACT.NOUL_DIRECTION.completion is 'veto_when_low'");

  // -------------------------------------------------------------------------
  section('FsbJevState.buildRequest: drop rules, renumbering, empty target');
  // -------------------------------------------------------------------------
  const emptyTarget = state.buildRequest({
    kinds: ['operation', 'target'],
    goal: 'Scroll down',
    url: 'https://example.test/list',
    title: 'List',
    visibleText: '',
    elements: [
      { id: 'c1', role: 'checkbox', label: 'Done', ops: [] },
      { id: 'p1', role: 'textbox', label: 'Password', ops: ['click'], inputType: 'password' }
    ],
    recentActions: [],
    offeredOps: ['scroll']
  });
  check(sameJson(emptyTarget, { ok: false, reason: 'invalid_request' }),
    'buildRequest: a target question whose every element is dropped returns {ok:false, reason:invalid_request}');

  const built = state.buildRequest({
    kinds: ['operation', 'target', 'completion', 'stuck'],
    goal: 'Tick Alpha and Bravo',
    url: 'https://example.test/list?x=1',
    title: 'List',
    visibleText: 'Alpha Bravo',
    elements: [
      { id: 'j1', role: 'checkbox', label: 'Alpha', ops: ['check_box'] },
      { id: 'j2', role: 'button', label: 'Next', ops: ['click', 'hover'] },
      { id: 'j3', role: 'textbox', label: 'Password', ops: ['click'], inputType: 'password' },
      { id: 'j4', role: 'textbox', label: 'Email', ops: ['click'] }
    ],
    vaultFilledIds: ['j4'],
    recentActions: [],
    offeredOps: ['click', 'check_box', 'hover']
  });
  const request = built && built.request;
  check(built && built.ok === true, 'buildRequest: the four-kind menu builds ok');
  check(request && sameJson(request.elements.map((e) => e.id), ['e0', 'e1']),
    'buildRequest: the password and vault-filled elements are dropped and the rest renumbered e0, e1');
  check(built && sameJson(built.idMap, { e0: 'j1', e1: 'j2' }), 'buildRequest: idMap maps e0 -> j1 and e1 -> j2');
  check(request && request.page && request.page.path === '/list', 'buildRequest: page.path is /list (no query string)');
  check(request && request.elements.every((e) => !Object.prototype.hasOwnProperty.call(e, 'value')),
    'buildRequest: no element carries a key named value');

  // -------------------------------------------------------------------------
  section('FsbJevClient.createJevClient + decide with a fake gateway');
  // -------------------------------------------------------------------------
  check(client.DEFAULT_TIMEOUT_MS === 2500, 'FsbJevClient.DEFAULT_TIMEOUT_MS is 2500');
  check(typeof client.createJevClient === 'function', 'FsbJevClient.createJevClient is a function');

  let calibratedResult = null;
  if (request) {
    const timers = inertTimers();
    const fetcher = fakeFetch(200, JSON.stringify(calibratedBody()));
    const okClient = client.createJevClient({
      endpoint: 'https://gateway.invalid/decide',
      fetchImpl: fetcher.fetchImpl,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl
    });
    calibratedResult = await okClient.decide(request, { timeoutMs: 2000 });
    check(calibratedResult && calibratedResult.ok === true && calibratedResult.calibration
      && calibratedResult.calibration.status === 'calibrated',
    'decide: a calibrated 200 body resolves ok true with calibration.status calibrated');
    check(fetcher.calls.length === 1, 'decide: the fake gateway was called exactly once');
    check(sameJson(timers.delays, [2000]) && timers.cleared.length === 1,
      'decide: the injected timer was armed once with 2000 ms and released');

    const disabledTimers = inertTimers();
    const disabledFetch = fakeFetch(503, JSON.stringify({ ok: false, fallback: 'disabled', servedModel: null, httpStatus: 503, latencyMs: 1 }));
    const disabledClient = client.createJevClient({
      endpoint: 'https://gateway.invalid/decide',
      fetchImpl: disabledFetch.fetchImpl,
      setTimeoutImpl: disabledTimers.setTimeoutImpl,
      clearTimeoutImpl: disabledTimers.clearTimeoutImpl
    });
    const disabled = await disabledClient.decide(request, { timeoutMs: 2000 });
    check(disabled && disabled.ok === false && disabled.fallback === 'disabled',
      'decide: a 503 disabled body resolves {ok:false, fallback:disabled}');

    const missingTimers = inertTimers();
    const missingFetch = fakeFetch(404, '');
    const missingClient = client.createJevClient({
      endpoint: 'https://gateway.invalid/decide',
      fetchImpl: missingFetch.fetchImpl,
      setTimeoutImpl: missingTimers.setTimeoutImpl,
      clearTimeoutImpl: missingTimers.clearTimeoutImpl
    });
    const missing = await missingClient.decide(request, { timeoutMs: 2000 });
    check(missing && missing.ok === false && missing.fallback === 'invalid_request',
      'decide: a 404 with an empty body resolves fallback invalid_request (the pre-V2 production state)');
  } else {
    check(false, 'decide: no request was built, so the client cases could not run');
  }

  // -------------------------------------------------------------------------
  section('FsbJevPolicy.accept');
  // -------------------------------------------------------------------------
  const operation = policy.accept(calibratedResult, 'operation');
  check(operation && operation.accepted === true && operation.choice === 'click',
    "accept(calibrated, 'operation') is accepted with choice click");
  const target = policy.accept(calibratedResult, 'target');
  check(target && target.accepted === true && target.choice === 'e1', "accept(calibrated, 'target') is accepted with choice e1");
  const completion = policy.accept(calibratedResult, 'completion');
  check(completion && completion.accepted === true && completion.effect === 'veto_completion',
    "accept(calibrated, 'completion') is accepted with effect veto_completion (confidently not done)");
  const stuck = policy.accept(calibratedResult, 'stuck');
  check(stuck && stuck.accepted === false && stuck.reason === 'below_threshold',
    "accept(calibrated, 'stuck') is not accepted, reason below_threshold");
  const uncalibratedResult = Object.assign(uncalibratedBody(), { latencyMs: 1 });
  check(sameJson(state.validateGatewayResponse(uncalibratedBody(), request || {}).ok, true),
    'the uncalibrated body is a valid gateway response for the same request');
  const notCalibrated = policy.accept(uncalibratedResult, 'operation');
  check(notCalibrated && notCalibrated.accepted === false && notCalibrated.reason === 'not_calibrated',
    "accept(uncalibrated, 'operation') is not accepted, reason not_calibrated");

  // -------------------------------------------------------------------------
  section('FsbSettingsSchema and FSBSettingsSync names');
  // -------------------------------------------------------------------------
  check(schema && Array.isArray(schema.entries), 'FsbSettingsSchema.entries is an array');
  for (const name of ['keys', 'get', 'isWritable', 'create']) {
    check(schema && typeof schema[name] === 'function', 'FsbSettingsSchema.' + name + ' is a function');
  }
  check(schema && schema.CODES !== null && typeof schema.CODES === 'object', 'FsbSettingsSchema.CODES is an object');
  const optionsSource = readRepo('extension/ui/options.js');
  check(/\* FSBSettingsSync \(Phase 66\.1, D-16\)/.test(optionsSource) && /global\.FSBSettingsSync = Object\.freeze\(api\);/.test(optionsSource),
    'options.js holds the FSBSettingsSync IIFE');
  for (const name of ['keyForElementId', 'noteStorageChanges', 'applyToForm', 'filterForSave']) {
    check(new RegExp('function ' + name + '\\(').test(optionsSource), 'options.js defines FSBSettingsSync ' + name);
  }

  // -------------------------------------------------------------------------
  section('67-10 shadow record API (records.mjs)');
  // -------------------------------------------------------------------------
  const records = await import(pathToFileURL(path.join(ROOT, 'scripts', 'bench', 'shadow', 'lib', 'records.mjs')).href);
  check(typeof records.validateRecord === 'function', 'records.mjs exports validateRecord');
  check(typeof records.loadRecords === 'function', 'records.mjs exports loadRecords');
  check(typeof records.checkLockReferences === 'function', 'records.mjs exports checkLockReferences');
  check(Array.isArray(records.PROVENANCES) && records.PROVENANCES.includes('recorded-llm'),
    "records.mjs PROVENANCES includes 'recorded-llm'");

  // -------------------------------------------------------------------------
  section('67-11 boundary suite layout');
  // -------------------------------------------------------------------------
  const boundaryPath = path.join(ROOT, 'tests', 'jev-extension-boundary.test.js');
  const boundaryExists = fs.existsSync(boundaryPath);
  check(boundaryExists, 'tests/jev-extension-boundary.test.js exists');
  const boundarySource = boundaryExists ? fs.readFileSync(boundaryPath, 'utf8') : '';
  check(/^const MODULES = Object\.freeze\(\[/m.test(boundarySource), 'the boundary suite still defines MODULES');
  check(/^const CALLER_PATTERN = /m.test(boundarySource), 'the boundary suite still defines CALLER_PATTERN');
  check(/^const UI_TEXT_PATTERN = /m.test(boundarySource), 'the boundary suite still defines UI_TEXT_PATTERN');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('FAIL: unexpected error: ' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
