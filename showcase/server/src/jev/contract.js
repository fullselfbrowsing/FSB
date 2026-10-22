'use strict';

/**
 * Phase 67 (JEV-03, JEV-06, JEV-07) -- the frozen Jev wire contract.
 *
 * One plain, deeply frozen data object (CONTRACT) holds every name and bound
 * the gateway and the extension client share: the D-16 fallback enum and its
 * HTTP status map, the request kinds, the closed operation vocabulary, field
 * caps, byte budgets, every request and response key set, and the Noul
 * direction table. Everything is JSON-comparable (no Set, no RegExp), so a
 * parity test can deep-compare it.
 *
 * MIRROR: extension/ai/jev-state.js holds a hand-mirrored copy of CONTRACT,
 * because the server image cannot load extension/ files (D-03).
 * tests/jev-contract-parity.test.js deep-compares the two, so both copies must
 * change in the same commit.
 *
 * No key in KEYS may express approval, authorization or skipping a
 * confirmation (D-29); isApprovalLikeKey() is the deny-list check the tests
 * run over every key set.
 */

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// D-16: the locked, closed fallback enum. Order is part of the contract.
const FALLBACK_REASONS = [
  // Gateway policy
  'disabled',
  'not_configured',
  'invalid_request',
  'payload_too_large',
  'sensitive_goal',
  'busy',
  'spend_cap_reached',
  // Upstream-derived
  'timeout',
  'rate_limited',
  'upstream_overloaded',
  'auth_error',
  'upstream_billing',
  'unavailable_model',
  'upstream_rejected',
  'upstream_error',
  'invalid_response',
  // Client-only (network_error, aborted); server_error is also emitted by the
  // gateway's router-local error handler (D-22).
  'network_error',
  'aborted',
  'server_error',
];

const CLIENT_ONLY_FALLBACK_REASONS = ['network_error', 'aborted'];

const CONTRACT = deepFreeze({
  SCHEMA_VERSION: 1,

  KINDS: ['operation', 'target', 'completion', 'stuck', 'risk'],
  CHOICE_KINDS: ['operation', 'target'],
  NOUL_KINDS: ['completion', 'stuck', 'risk'],

  // Closed vocabulary, named after FSB tool names so Phase 68 maps 1:1.
  OPERATIONS: ['click', 'type_text', 'select_option', 'check_box', 'press_enter', 'hover', 'scroll', 'go_back'],

  // The catch-all option on every Choice. It can never collide with an
  // element id (ELEMENT_ID_PATTERN) or an operation.
  RESERVED_OPTION_KEY: 'none_of_the_above',

  // Element ids are e0..e999, never numeric-looking. A string source, not a
  // RegExp, so the value stays JSON-comparable.
  ELEMENT_ID_PATTERN: '^e(0|[1-9][0-9]{0,2})$',

  FALLBACK_REASONS: FALLBACK_REASONS.slice(),
  GATEWAY_FALLBACK_REASONS: FALLBACK_REASONS.filter((reason) => !CLIENT_ONLY_FALLBACK_REASONS.includes(reason)),
  CLIENT_ONLY_FALLBACK_REASONS: CLIENT_ONLY_FALLBACK_REASONS.slice(),

  // The client may cool down in memory on these (D-16); it never stores them.
  NON_TRANSIENT_REASONS: ['disabled', 'not_configured', 'spend_cap_reached', 'auth_error', 'upstream_billing', 'unavailable_model'],

  // Exactly the 17 gateway reasons. The client maps the body first and this
  // status only when the body is missing or malformed.
  HTTP_STATUS_BY_REASON: {
    invalid_request: 400,
    sensitive_goal: 400,
    payload_too_large: 413,
    disabled: 503,
    not_configured: 503,
    busy: 503,
    spend_cap_reached: 503,
    timeout: 504,
    rate_limited: 502,
    upstream_overloaded: 502,
    auth_error: 502,
    upstream_billing: 502,
    unavailable_model: 502,
    upstream_rejected: 502,
    upstream_error: 502,
    invalid_response: 502,
    server_error: 500,
  },

  CALIBRATION_STATUSES: ['calibrated', 'uncalibrated', 'snapshot_changed'],

  // D-23: Phase 66's source labels; missing values are null, never 0.
  USAGE_SOURCES: ['provider', 'unavailable'],
  COST_SOURCES: ['provider', 'estimate', 'unavailable'],

  NOUL_DIRECTION: { completion: 'veto_when_low', stuck: 'flag_when_high', risk: 'flag_when_high' },

  // Field caps, in code points unless noted. 254 elements plus the catch-all
  // fit Choice's 255-option cap (D-11). profileIdChars bounds the calibration
  // profileId both where a profile is validated (calibration.js) and where an
  // ok response is validated (the extension), so a valid profile can never
  // turn every ok answer into invalid_response.
  CAPS: {
    goalChars: 1000,
    originChars: 256,
    pathChars: 512,
    titleChars: 200,
    textChars: 6000,
    labelChars: 80,
    roleChars: 32,
    opsPerElement: 8,
    elements: 254,
    recentActions: 10,
    profileIdChars: 64,
  },

  // UTF-8 bytes (D-12). The upstream budget keeps every request under
  // OpenRouter's ~32,000-byte long-context trigger.
  BUDGETS: { bodyLimitBytes: 49152, requestByteBudget: 20000, upstreamByteBudget: 28000 },

  KEYS: {
    request: ['v', 'kinds', 'goal', 'page', 'elements', 'recentActions', 'offeredOps', 'proposedAction'],
    requestRequired: ['v', 'kinds', 'goal', 'page', 'elements', 'recentActions', 'offeredOps'],
    page: ['origin', 'path', 'title', 'text'],
    // D-18: no value slot, not even an empty one.
    element: ['id', 'role', 'label', 'ops'],
    recentAction: ['op', 'targetId', 'changed'],
    proposedAction: ['op', 'targetId'],
    okResponse: ['ok', 'decisionId', 'instrumentVersion', 'servedModel', 'calibration', 'decisions', 'usage', 'cost', 'latencyMs'],
    fallbackResponse: ['ok', 'fallback', 'servedModel', 'httpStatus', 'latencyMs'],
    calibration: ['status', 'profileId'],
    choiceDecision: ['choice', 'confidence', 'probabilities', 'threshold', 'meetsThreshold'],
    noulDecision: ['p', 'threshold', 'meetsThreshold'],
    usage: ['inputTokens', 'source'],
    cost: ['usd', 'source'],
  },

  // D-29: case-insensitive regex sources. No wire key may match any of them.
  APPROVAL_KEY_DENYLIST: ['approv', 'authori[sz]', 'allow', 'skip', 'bypass', 'consent', 'confirm', 'permit', 'grant', 'override'],
});

/**
 * True when `key` matches any deny-list source, case-insensitively. Builds
 * fresh RegExps per call so no lastIndex state is shared.
 */
function isApprovalLikeKey(key) {
  if (typeof key !== 'string') return false;
  return CONTRACT.APPROVAL_KEY_DENYLIST.some((source) => new RegExp(source, 'i').test(key));
}

module.exports = Object.assign({ CONTRACT, isApprovalLikeKey }, CONTRACT);
