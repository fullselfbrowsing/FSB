/**
 * Phase 67 (JEV-03, JEV-06, JEV-07) -- FsbJevState, the extension half of the
 * Jev wire contract.
 *
 * - CONTRACT: a hand-mirrored, deeply frozen copy of the server contract.
 *   The twin is showcase/server/src/jev/contract.js (the server image cannot
 *   load extension files, D-03), and tests/jev-contract-parity.test.js
 *   enforces deep equality, so both copies change in the same commit.
 * - scrubText / matchesSecret / filterInjection / luhnValid: behaviourally
 *   identical mirrors of showcase/server/src/jev/scrubber.js (same sources,
 *   flags, order and placeholders; D-19, D-21). The injection list also
 *   mirrors sanitizePageContent in ai/ai-integration.js.
 * - validateRequest: the server request validator's rules, in the same order
 *   (showcase/server/src/jev/validator.js; D-10, D-11, D-18, D-19, D-20).
 * - validateGatewayResponse: exact-key validation of the D-15 ok and fallback
 *   bodies; nothing in a response can express approval (D-29).
 * - buildRequest / toOriginPath: the D-18 sanitizer and request builder over
 *   a typed element-list input (Phase 68 feeds it from the content snapshot).
 *   Elements have no slot for a field's contents, URLs become origin + path,
 *   text and labels are scrubbed and injection-filtered, and the request is
 *   held to the D-12 byte budget.
 *
 * Inert by design (D-17): loading this file reads no browser API, makes no
 * network call, schedules nothing and touches no storage. Nothing in the
 * extension calls it in Phase 67.
 */
(function initFsbJevState(root) {
  'use strict';

  function deepFreeze(node) {
    if (node !== null && typeof node === 'object' && !Object.isFrozen(node)) {
      Object.keys(node).forEach(function freezeChild(key) { deepFreeze(node[key]); });
      Object.freeze(node);
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // CONTRACT (mirror of showcase/server/src/jev/contract.js)
  // ---------------------------------------------------------------------------

  // D-16: the locked, closed fallback enum. Order is part of the contract.
  var FALLBACK_REASONS = [
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
    // Client-only (network_error, aborted); server_error also comes from the
    // gateway's router-local error handler (D-22).
    'network_error',
    'aborted',
    'server_error'
  ];

  var CLIENT_ONLY_FALLBACK_REASONS = ['network_error', 'aborted'];

  var CONTRACT = deepFreeze({
    SCHEMA_VERSION: 1,

    KINDS: ['operation', 'target', 'completion', 'stuck', 'risk'],
    CHOICE_KINDS: ['operation', 'target'],
    NOUL_KINDS: ['completion', 'stuck', 'risk'],

    OPERATIONS: ['click', 'type_text', 'select_option', 'check_box', 'press_enter', 'hover', 'scroll', 'go_back'],

    RESERVED_OPTION_KEY: 'none_of_the_above',

    ELEMENT_ID_PATTERN: '^e(0|[1-9][0-9]{0,2})$',

    FALLBACK_REASONS: FALLBACK_REASONS.slice(),
    GATEWAY_FALLBACK_REASONS: FALLBACK_REASONS.filter(function notClientOnly(reason) {
      return CLIENT_ONLY_FALLBACK_REASONS.indexOf(reason) === -1;
    }),
    CLIENT_ONLY_FALLBACK_REASONS: CLIENT_ONLY_FALLBACK_REASONS.slice(),

    // The client may cool down in memory on these (D-16); it never stores them.
    NON_TRANSIENT_REASONS: ['disabled', 'not_configured', 'spend_cap_reached', 'auth_error', 'upstream_billing', 'unavailable_model'],

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
      server_error: 500
    },

    CALIBRATION_STATUSES: ['calibrated', 'uncalibrated', 'snapshot_changed'],

    // D-23: Phase 66's source labels; missing numbers are null, never 0.
    USAGE_SOURCES: ['provider', 'unavailable'],
    COST_SOURCES: ['provider', 'estimate', 'unavailable'],

    NOUL_DIRECTION: { completion: 'veto_when_low', stuck: 'flag_when_high', risk: 'flag_when_high' },

    // Code points unless noted. 254 elements plus the catch-all fit Choice's
    // 255-option cap (D-11). profileIdChars bounds the calibration profileId
    // here and in the server's profile validator alike.
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
      profileIdChars: 64
    },

    // UTF-8 bytes (D-12).
    BUDGETS: { bodyLimitBytes: 49152, requestByteBudget: 20000, upstreamByteBudget: 28000 },

    KEYS: {
      request: ['v', 'kinds', 'goal', 'page', 'elements', 'recentActions', 'offeredOps', 'proposedAction'],
      requestRequired: ['v', 'kinds', 'goal', 'page', 'elements', 'recentActions', 'offeredOps'],
      page: ['origin', 'path', 'title', 'text'],
      // D-18: no slot for an input's contents, not even an empty one.
      element: ['id', 'role', 'label', 'ops'],
      recentAction: ['op', 'targetId', 'changed'],
      proposedAction: ['op', 'targetId'],
      okResponse: ['ok', 'decisionId', 'instrumentVersion', 'servedModel', 'calibration', 'decisions', 'usage', 'cost', 'latencyMs'],
      fallbackResponse: ['ok', 'fallback', 'servedModel', 'httpStatus', 'latencyMs'],
      calibration: ['status', 'profileId'],
      choiceDecision: ['choice', 'confidence', 'probabilities', 'threshold', 'meetsThreshold'],
      noulDecision: ['p', 'threshold', 'meetsThreshold'],
      usage: ['inputTokens', 'source'],
      cost: ['usd', 'source']
    },

    // D-29: case-insensitive regex sources. No wire key may match any of them.
    APPROVAL_KEY_DENYLIST: ['approv', 'authori[sz]', 'allow', 'skip', 'bypass', 'consent', 'confirm', 'permit', 'grant', 'override']
  });

  /** True when `key` matches a deny-list source, case-insensitively. */
  function isApprovalLikeKey(key) {
    if (typeof key !== 'string') return false;
    return CONTRACT.APPROVAL_KEY_DENYLIST.some(function matches(source) {
      return new RegExp(source, 'i').test(key);
    });
  }

  // ---------------------------------------------------------------------------
  // Scrubber and injection filter (mirror of showcase/server/src/jev/scrubber.js)
  // ---------------------------------------------------------------------------

  var PLACEHOLDERS = Object.freeze({
    pem: '[REDACTED_PRIVATE_KEY]',
    jwt: '[REDACTED_JWT]',
    bearer: 'Bearer [REDACTED_TOKEN]',
    keyPrefix: '[REDACTED_API_KEY]',
    fsbBridge: '[REDACTED_FSB_BRIDGE_SECRET]',
    card: '[REDACTED_CARD]',
    highEntropy: '[REDACTED_TOKEN]'
  });

  /** Luhn checksum over a string of ASCII digits only. Anything else is false. */
  function luhnValid(digits) {
    if (typeof digits !== 'string' || !/^[0-9]+$/.test(digits)) return false;
    var sum = 0;
    var double = false;
    for (var i = digits.length - 1; i >= 0; i -= 1) {
      var d = digits.charCodeAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  }

  function replaceCard(match) {
    var digits = match.replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return PLACEHOLDERS.card;
    return match;
  }

  function replaceHighEntropy(match) {
    if (!/[A-Z]/.test(match) || !/[a-z]/.test(match) || !/[0-9]/.test(match)) return match;
    var segments = match.split(/[-_/+=]/);
    var hasMixedLongSegment = segments.some(function mixedLong(segment) {
      return segment.length >= 16 && /[A-Za-z]/.test(segment) && /[0-9]/.test(segment);
    });
    return hasMixedLongSegment ? PLACEHOLDERS.highEntropy : match;
  }

  /** The scrub patterns in application order, with fresh regex literals per call. */
  function buildScrubPatterns() {
    return [
      {
        name: 'pem',
        re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        replacement: PLACEHOLDERS.pem
      },
      {
        name: 'jwt',
        re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
        replacement: PLACEHOLDERS.jwt
      },
      {
        name: 'bearer',
        re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
        replacement: PLACEHOLDERS.bearer
      },
      {
        name: 'keyPrefix',
        re: /\b(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{16,}|gh[po]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[bpas]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/g,
        replacement: PLACEHOLDERS.keyPrefix
      },
      {
        name: 'fsbBridge',
        re: /fsb-auth\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
        replacement: PLACEHOLDERS.fsbBridge
      },
      {
        name: 'card',
        re: /\b[0-9](?:[ -]?[0-9]){12,18}\b/g,
        replacement: replaceCard
      },
      {
        name: 'highEntropy',
        re: /[A-Za-z0-9+/=_-]{32,}/g,
        replacement: replaceHighEntropy
      }
    ];
  }

  /**
   * The 10 sanitizePageContent INJECTION_PATTERNS (ai/ai-integration.js), same
   * sources and flags, fresh per call.
   */
  function buildInjectionPatterns() {
    return [
      /ignore\s+(all\s+)?previous\s+instructions/gi,
      /you\s+are\s+now\s+(a|an)\b/gi,
      /system\s*prompt/gi,
      /\<\/?(?:system|instruction|prompt|override|admin|root|command|directive)\s*\>/gi,
      /IMPORTANT\s*:\s*(?:ignore|forget|disregard|override|bypass)/gi,
      /(?:disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|rules|context)/gi,
      /you\s+must\s+(?:now|instead)\s+(?:act|behave|respond)\s+as/gi,
      /\[\s*(?:SYSTEM|INST|ADMIN|ROOT)\s*\]/gi,
      /BEGIN\s+(?:NEW\s+)?(?:SYSTEM|INSTRUCTIONS?|PROMPT)/gi,
      /END\s+(?:OF\s+)?(?:SYSTEM|INSTRUCTIONS?|PROMPT)/gi
    ];
  }

  /** Replace every secret match with its typed placeholder. Non-strings pass through. */
  function scrubText(s) {
    if (typeof s !== 'string') return s;
    var out = s;
    buildScrubPatterns().forEach(function applyPattern(pattern) {
      out = out.replace(pattern.re, pattern.replacement);
    });
    return out;
  }

  /** True when scrubText would change `s`, i.e. `s` holds at least one secret. */
  function matchesSecret(s) {
    return typeof s === 'string' && scrubText(s) !== s;
  }

  /** Replace each known injection phrase with [FILTERED]. Never truncates. */
  function filterInjection(s) {
    if (typeof s !== 'string') return s;
    var out = s;
    buildInjectionPatterns().forEach(function applyPattern(re) {
      out = out.replace(re, '[FILTERED]');
    });
    return out;
  }

  var PATTERN_SOURCES = Object.freeze(buildScrubPatterns().map(function describe(pattern) {
    return Object.freeze({ name: pattern.name, source: pattern.re.source, flags: pattern.re.flags });
  }));

  var INJECTION_PATTERN_SOURCES = Object.freeze(buildInjectionPatterns().map(function describe(re) {
    return Object.freeze({ source: re.source, flags: re.flags });
  }));

  // ---------------------------------------------------------------------------
  // Request validator (mirror of showcase/server/src/jev/validator.js)
  // ---------------------------------------------------------------------------

  var KEYS = CONTRACT.KEYS;
  var CAPS = CONTRACT.CAPS;
  var OPERATIONS = CONTRACT.OPERATIONS;

  // Non-global regexes: .test() on them carries no lastIndex state.
  var ELEMENT_ID_RE = new RegExp(CONTRACT.ELEMENT_ID_PATTERN);
  // Scheme, host (bracketed IPv6 or a DNS/IPv4 host) and an optional port.
  // Nothing after the authority (D-20).
  var ORIGIN_RE = /^https?:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(:[0-9]{1,5})?$/;

  /** Length in Unicode code points (never UTF-16 code units). Non-strings are 0. */
  function codePointLength(s) {
    return typeof s === 'string' ? Array.from(s).length : 0;
  }

  function isPlainObject(node) {
    return node !== null && typeof node === 'object' && !Array.isArray(node);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /** Plain object whose own keys are all allowed and include every required key. */
  function hasExactKeys(obj, allowed, required) {
    if (!isPlainObject(obj)) return false;
    var own = Object.keys(obj);
    for (var i = 0; i < own.length; i += 1) {
      if (allowed.indexOf(own[i]) === -1) return false;
    }
    for (var j = 0; j < required.length; j += 1) {
      if (!hasOwn(obj, required[j])) return false;
    }
    return true;
  }

  function isStringWithin(s, maxCodePoints) {
    return typeof s === 'string' && codePointLength(s) <= maxCodePoints;
  }

  function isUniqueArray(list) {
    return new Set(list).size === list.length;
  }

  /** Array (possibly empty) of unique members of `vocabulary`. */
  function isUniqueSubset(list, vocabulary) {
    return Array.isArray(list) && isUniqueArray(list) && list.every(function inVocabulary(item) {
      return vocabulary.indexOf(item) !== -1;
    });
  }

  function isElementId(s) {
    return typeof s === 'string' && ELEMENT_ID_RE.test(s);
  }

  function validKinds(kinds) {
    return Array.isArray(kinds) && kinds.length > 0 && isUniqueSubset(kinds, CONTRACT.KINDS);
  }

  function validGoal(goal) {
    return typeof goal === 'string' && goal.trim().length > 0 && codePointLength(goal) <= CAPS.goalChars;
  }

  function validPage(page) {
    if (!hasExactKeys(page, KEYS.page, KEYS.page)) return false;
    if (!isStringWithin(page.origin, CAPS.originChars) || !ORIGIN_RE.test(page.origin)) return false;
    if (!isStringWithin(page.path, CAPS.pathChars) || page.path.charAt(0) !== '/') return false;
    if (page.path.indexOf('?') !== -1 || page.path.indexOf('#') !== -1) return false;
    if (!isStringWithin(page.title, CAPS.titleChars)) return false;
    if (!isStringWithin(page.text, CAPS.textChars)) return false;
    return true;
  }

  function validElement(element, seenIds) {
    if (!hasExactKeys(element, KEYS.element, KEYS.element)) return false;
    if (!isElementId(element.id) || seenIds.has(element.id)) return false;
    seenIds.add(element.id);
    if (!isStringWithin(element.role, CAPS.roleChars) || element.role.length === 0) return false;
    if (!isStringWithin(element.label, CAPS.labelChars)) return false;
    var ops = element.ops;
    if (!isUniqueSubset(ops, OPERATIONS) || ops.length === 0 || ops.length > CAPS.opsPerElement) return false;
    return true;
  }

  function validElements(elements, seenIds) {
    if (!Array.isArray(elements) || elements.length > CAPS.elements) return false;
    return elements.every(function eachElement(element) { return validElement(element, seenIds); });
  }

  function validRecentAction(action) {
    if (!hasExactKeys(action, KEYS.recentAction, KEYS.recentAction)) return false;
    if (OPERATIONS.indexOf(action.op) === -1) return false;
    if (action.targetId !== null && !isElementId(action.targetId)) return false;
    return typeof action.changed === 'boolean';
  }

  function validRecentActions(actions) {
    if (!Array.isArray(actions) || actions.length > CAPS.recentActions) return false;
    return actions.every(validRecentAction);
  }

  function validProposedAction(action, elementIds) {
    if (!hasExactKeys(action, KEYS.proposedAction, KEYS.proposedAction)) return false;
    if (OPERATIONS.indexOf(action.op) === -1) return false;
    return action.targetId === null || (typeof action.targetId === 'string' && elementIds.has(action.targetId));
  }

  /** True when the whole request shape passes; checks run in the server's order. */
  function validShape(body) {
    if (!isPlainObject(body)) return false;
    var own = Object.keys(body);
    for (var i = 0; i < own.length; i += 1) {
      if (KEYS.request.indexOf(own[i]) === -1) return false;
    }
    for (var j = 0; j < KEYS.requestRequired.length; j += 1) {
      if (!hasOwn(body, KEYS.requestRequired[j])) return false;
    }
    if (body.v !== CONTRACT.SCHEMA_VERSION) return false;
    if (!validKinds(body.kinds)) return false;
    if (!validGoal(body.goal)) return false;
    if (!validPage(body.page)) return false;
    var elementIds = new Set();
    if (!validElements(body.elements, elementIds)) return false;
    if (!validRecentActions(body.recentActions)) return false;
    if (!isUniqueSubset(body.offeredOps, OPERATIONS)) return false;

    // Cross-field rules.
    var kinds = body.kinds;
    if (kinds.indexOf('operation') !== -1 && body.offeredOps.length === 0) return false;
    if (kinds.indexOf('target') !== -1 && body.elements.length === 0) return false;
    var hasProposedAction = hasOwn(body, 'proposedAction');
    if (hasProposedAction !== (kinds.indexOf('risk') !== -1)) return false;
    if (hasProposedAction && !validProposedAction(body.proposedAction, elementIds)) return false;
    return true;
  }

  /**
   * Validate one request with the server's rules and reason order.
   * @returns {{ok:true}|{ok:false, reason:'invalid_request'|'sensitive_goal'}}
   */
  function validateRequest(body) {
    if (!validShape(body)) return { ok: false, reason: 'invalid_request' };
    if (matchesSecret(body.goal)) return { ok: false, reason: 'sensitive_goal' };
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Gateway-response validator (D-15, D-29)
  // ---------------------------------------------------------------------------

  var RESERVED_OPTION_KEY = CONTRACT.RESERVED_OPTION_KEY;

  function isUnitInterval(n) {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  }

  function isNonNegativeFinite(n) {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0;
  }

  function isStringBetween(s, min, max) {
    if (typeof s !== 'string') return false;
    var length = codePointLength(s);
    return length >= min && length <= max;
  }

  /**
   * threshold is null or in [0,1]; meetsThreshold is a boolean that can only
   * be true with a threshold under a calibrated profile.
   */
  function validThresholdPair(decision, calibrated) {
    if (decision.threshold !== null && !isUnitInterval(decision.threshold)) return false;
    if (typeof decision.meetsThreshold !== 'boolean') return false;
    if (decision.meetsThreshold && (decision.threshold === null || !calibrated)) return false;
    return true;
  }

  /** Operation options: the catch-all, or an OPERATIONS member the request offered. */
  function operationOptionFilter(request) {
    var offered = Array.isArray(request.offeredOps) ? request.offeredOps : OPERATIONS;
    return function isOperationOption(key) {
      return key === RESERVED_OPTION_KEY || (OPERATIONS.indexOf(key) !== -1 && offered.indexOf(key) !== -1);
    };
  }

  /** Target options: the catch-all, or an element id the request sent. */
  function targetOptionFilter(request) {
    var ids = null;
    if (Array.isArray(request.elements)) {
      ids = new Set();
      request.elements.forEach(function collect(element) {
        if (isPlainObject(element) && isElementId(element.id)) ids.add(element.id);
      });
    }
    return function isTargetOption(key) {
      return key === RESERVED_OPTION_KEY || (isElementId(key) && (ids === null || ids.has(key)));
    };
  }

  function validChoiceDecision(decision, isOption, calibrated) {
    if (!hasExactKeys(decision, KEYS.choiceDecision, KEYS.choiceDecision)) return false;
    var probabilities = decision.probabilities;
    if (!isPlainObject(probabilities)) return false;
    var options = Object.keys(probabilities);
    if (options.length === 0) return false;
    for (var i = 0; i < options.length; i += 1) {
      if (!isOption(options[i]) || !isUnitInterval(probabilities[options[i]])) return false;
    }
    if (typeof decision.choice !== 'string' || !hasOwn(probabilities, decision.choice)) return false;
    if (!isUnitInterval(decision.confidence)) return false;
    return validThresholdPair(decision, calibrated);
  }

  function validNoulDecision(decision, calibrated) {
    if (!hasExactKeys(decision, KEYS.noulDecision, KEYS.noulDecision)) return false;
    if (!isUnitInterval(decision.p)) return false;
    return validThresholdPair(decision, calibrated);
  }

  /** The decision key set equals request.kinds exactly, each with its own shape. */
  function validDecisions(decisions, request, calibrated) {
    if (!isPlainObject(decisions)) return false;
    var kinds = request.kinds;
    if (Object.keys(decisions).length !== kinds.length) return false;
    for (var i = 0; i < kinds.length; i += 1) {
      var kind = kinds[i];
      if (!hasOwn(decisions, kind)) return false;
      if (kind === 'operation' || kind === 'target') {
        var isOption = kind === 'operation' ? operationOptionFilter(request) : targetOptionFilter(request);
        if (!validChoiceDecision(decisions[kind], isOption, calibrated)) return false;
      } else if (!validNoulDecision(decisions[kind], calibrated)) {
        return false;
      }
    }
    return true;
  }

  /** inputTokens is null exactly when the source is 'unavailable' (never 0). */
  function validUsage(usage) {
    if (!hasExactKeys(usage, KEYS.usage, KEYS.usage)) return false;
    if (CONTRACT.USAGE_SOURCES.indexOf(usage.source) === -1) return false;
    if (usage.inputTokens === null) return usage.source === 'unavailable';
    return Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 && usage.source !== 'unavailable';
  }

  /** usd is null exactly when the source is 'unavailable' (never 0). */
  function validCost(cost) {
    if (!hasExactKeys(cost, KEYS.cost, KEYS.cost)) return false;
    if (CONTRACT.COST_SOURCES.indexOf(cost.source) === -1) return false;
    if (cost.usd === null) return cost.source === 'unavailable';
    return isNonNegativeFinite(cost.usd) && cost.source !== 'unavailable';
  }

  function validOkResponse(body, request) {
    if (!hasExactKeys(body, KEYS.okResponse, KEYS.okResponse)) return false;
    if (body.ok !== true) return false;
    if (!isStringBetween(body.decisionId, 1, 64)) return false;
    if (!isStringBetween(body.instrumentVersion, 1, 64)) return false;
    if (!isStringBetween(body.servedModel, 1, 128)) return false;
    var calibration = body.calibration;
    if (!hasExactKeys(calibration, KEYS.calibration, KEYS.calibration)) return false;
    if (CONTRACT.CALIBRATION_STATUSES.indexOf(calibration.status) === -1) return false;
    if (!isStringBetween(calibration.profileId, 1, CAPS.profileIdChars)) return false;
    if (!isPlainObject(request) || !validKinds(request.kinds)) return false;
    if (!validDecisions(body.decisions, request, calibration.status === 'calibrated')) return false;
    if (!validUsage(body.usage) || !validCost(body.cost)) return false;
    return isNonNegativeFinite(body.latencyMs);
  }

  /** Only the gateway reasons: network_error and aborted are the client's own. */
  function validFallbackResponse(body) {
    if (!hasExactKeys(body, KEYS.fallbackResponse, KEYS.fallbackResponse)) return false;
    if (body.ok !== false) return false;
    if (CONTRACT.GATEWAY_FALLBACK_REASONS.indexOf(body.fallback) === -1) return false;
    if (body.servedModel !== null && !isStringBetween(body.servedModel, 1, 128)) return false;
    if (body.httpStatus !== null
      && !(Number.isInteger(body.httpStatus) && body.httpStatus >= 100 && body.httpStatus <= 599)) return false;
    return isNonNegativeFinite(body.latencyMs);
  }

  /**
   * Exact-key validation of one parsed gateway body against the request it
   * answers. Unknown or approval-like keys, decisions that do not match the
   * requested kinds, options outside the offered vocabulary, and a
   * meetsThreshold the calibration cannot support all fail. Never throws.
   * Returns {ok:true, value} with a fresh deep copy of the body, or {ok:false}.
   */
  function validateGatewayResponse(body, request) {
    try {
      if (!isPlainObject(body)) return { ok: false };
      var valid = body.ok === true ? validOkResponse(body, request) : validFallbackResponse(body);
      if (!valid) return { ok: false };
      var value = JSON.parse(JSON.stringify(body));
      return { ok: true, value };
    } catch (_e) {
      return { ok: false };
    }
  }

  // ---------------------------------------------------------------------------
  // Sanitizer, origin + path reducer and the budgeted request builder
  // (D-12, D-18, D-19, D-20, D-21)
  // ---------------------------------------------------------------------------

  /** UTF-8 byte length (TextEncoder, created per call). Non-strings are 0. */
  function utf8ByteLength(s) {
    if (typeof s !== 'string') return 0;
    return new TextEncoder().encode(s).length;
  }

  /** The code points of `s`, with every lone surrogate replaced by U+FFFD. */
  function wellFormedCodePoints(s) {
    return Array.from(s).map(function repair(ch) {
      var code = ch.charCodeAt(0);
      return ch.length === 1 && code >= 0xD800 && code <= 0xDFFF ? '�' : ch;
    });
  }

  /** At most `max` code points of `s`; never splits a surrogate pair. */
  function truncateCodePoints(s, max) {
    var points = wellFormedCodePoints(s);
    return (points.length > max ? points.slice(0, max) : points).join('');
  }

  /**
   * Scrub secrets and filter injection phrases on the whole field, then cap
   * it. Scrubbing before the cut means a secret is never half-kept. A cut can
   * complete a new match at its edge, so the pass repeats (bounded) until
   * stable.
   */
  function cleanField(s, max) {
    var out = truncateCodePoints(filterInjection(scrubText(s)), max);
    for (var pass = 0; pass < 3; pass += 1) {
      var again = truncateCodePoints(filterInjection(scrubText(out)), max);
      if (again === out) break;
      out = again;
    }
    return out;
  }

  /**
   * Scrub one path segment. A secret hidden behind percent-encoding (for
   * example a card number with %20 separators) redacts the whole segment.
   */
  function scrubPathSegment(segment) {
    var scrubbed = scrubText(segment);
    if (segment.indexOf('%') === -1) return scrubbed;
    var decoded;
    try { decoded = decodeURIComponent(segment); } catch (_e) { return scrubbed; }
    return matchesSecret(decoded) ? PLACEHOLDERS.highEntropy : scrubbed;
  }

  /**
   * Reduce an http(s) URL to its origin and its path (D-20): the query and
   * fragment are dropped, and the path is scrubbed one segment at a time so
   * the leading '/' and every separator survive. Scrubbing the whole path at
   * once would let the high-entropy rule (whose class includes '/') swallow
   * the separators. Any other scheme, or an unparseable URL, gives null.
   */
  function toOriginPath(url) {
    if (typeof url !== 'string' || url.length === 0) return null;
    var parsed;
    try { parsed = new URL(url); } catch (_e) { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    var reducedPath = parsed.pathname.split('/').map(scrubPathSegment).join('/');
    if (reducedPath.charAt(0) !== '/') reducedPath = '/' + reducedPath;
    return { origin: parsed.origin, path: reducedPath };
  }

  var DROPPED_INPUT_TYPES = ['password', 'hidden', 'file'];
  var DROPPED_AUTOCOMPLETE_TOKENS = ['one-time-code', 'current-password', 'new-password'];

  /**
   * D-18: password, hidden and file inputs; cc-*, one-time-code and password
   * autocomplete tokens (also inside a multi-token value); purpose.sensitive;
   * hidden elements; and anything the vault filled in this session.
   */
  function isSensitiveElement(element, vaultIds) {
    if (element.hidden) return true;
    if (typeof element.inputType === 'string'
      && DROPPED_INPUT_TYPES.indexOf(element.inputType.trim().toLowerCase()) !== -1) return true;
    if (typeof element.autocomplete === 'string') {
      var tokens = element.autocomplete.trim().toLowerCase().split(/\s+/);
      var sensitiveToken = tokens.some(function isSensitiveToken(token) {
        return token.indexOf('cc-') === 0 || DROPPED_AUTOCOMPLETE_TOKENS.indexOf(token) !== -1;
      });
      if (sensitiveToken) return true;
    }
    if (isPlainObject(element.purpose) && element.purpose.sensitive) return true;
    return vaultIds.has(String(element.id));
  }

  function isCallerId(id) {
    return (typeof id === 'string' && id.length > 0) || (typeof id === 'number' && Number.isFinite(id));
  }

  /** Unique OPERATIONS members of `list`, in their first-seen order. */
  function uniqueOperations(list) {
    var out = [];
    list.forEach(function keep(op) {
      if (OPERATIONS.indexOf(op) !== -1 && out.indexOf(op) === -1) out.push(op);
    });
    return out;
  }

  function orEmptyString(s) {
    return s === undefined || s === null ? '' : s;
  }

  function isSetLike(list) {
    return Object.prototype.toString.call(list) === '[object Set]';
  }

  /** Largest n in [lo, hi] for which fits(n) holds (fits is monotone), or -1. */
  function largestFitting(lo, hi, fits) {
    if (!fits(lo)) return -1;
    var good = lo;
    var bad = hi + 1;
    while (bad - good > 1) {
      var mid = Math.floor((good + bad) / 2);
      if (fits(mid)) good = mid;
      else bad = mid;
    }
    return good;
  }

  function invalidRequest() {
    return { ok: false, reason: 'invalid_request' };
  }

  /**
   * Build a request v1 from a typed element-list input. Nothing that could
   * hold a secret, a field's contents, a selector or the caller's ids is ever
   * copied (D-18): each element is rebuilt as {id, role, label, ops} with a
   * synthetic id e0..eN, and idMap (never sent) maps those ids back.
   *
   * input: {kinds, goal, url, title, visibleText, elements:[{id, role, label,
   *   ops, inputType?, autocomplete?, purpose?:{sensitive?}, hidden?}],
   *   vaultFilledIds? (array or Set of caller ids), recentActions?:[{op,
   *   targetId, changed}] (oldest first), offeredOps, proposedAction?:{op,
   *   targetId}}
   *
   * The request is held to `byteBudget` UTF-8 bytes by shrinking, in order:
   * the page text (longest fitting prefix), then elements from the end (never
   * the proposedAction target, and a requested target Choice keeps at least
   * one element), then the oldest recent actions (D-12).
   *
   * @returns {{ok:true, request:object, idMap:object, stats:object}
   *   |{ok:false, reason:'invalid_request'|'sensitive_goal'}}
   */
  function buildRequest(input, options) {
    var byteBudget = options && options.byteBudget !== undefined ? options.byteBudget : CONTRACT.BUDGETS.requestByteBudget;
    if (typeof byteBudget !== 'number' || !(byteBudget > 0)) return invalidRequest();
    if (!isPlainObject(input)) return invalidRequest();

    var title = orEmptyString(input.title);
    var visibleText = orEmptyString(input.visibleText);
    var recentActions = input.recentActions === undefined || input.recentActions === null ? [] : input.recentActions;
    var vault = input.vaultFilledIds === undefined || input.vaultFilledIds === null ? [] : input.vaultFilledIds;
    if (!Array.isArray(input.kinds) || typeof input.goal !== 'string' || typeof input.url !== 'string'
      || typeof title !== 'string' || typeof visibleText !== 'string' || !Array.isArray(input.elements)
      || !Array.isArray(input.offeredOps) || !Array.isArray(recentActions)
      || !(Array.isArray(vault) || isSetLike(vault))) {
      return invalidRequest();
    }

    // D-19: a goal holding a secret never leaves the machine; nothing is built.
    if (matchesSecret(input.goal)) return { ok: false, reason: 'sensitive_goal' };

    var reduced = toOriginPath(input.url);
    if (reduced === null) return invalidRequest();

    // Elements: type checks, D-18 drops, cleaned role and label, closed ops.
    var vaultIds = new Set(Array.from(vault, function asKey(id) { return String(id); }));
    var seenIds = new Set();
    var droppedSensitive = 0;
    var candidates = [];
    for (var i = 0; i < input.elements.length; i += 1) {
      var element = input.elements[i];
      if (!isPlainObject(element) || !isCallerId(element.id)) return invalidRequest();
      var idKey = String(element.id);
      if (seenIds.has(idKey)) return invalidRequest();
      seenIds.add(idKey);
      var label = orEmptyString(element.label);
      if (typeof element.role !== 'string' || typeof label !== 'string' || !Array.isArray(element.ops)) {
        return invalidRequest();
      }
      if (isSensitiveElement(element, vaultIds)) {
        droppedSensitive += 1;
        continue;
      }
      var ops = uniqueOperations(element.ops);
      var role = cleanField(element.role, CAPS.roleChars);
      if (ops.length === 0 || role.length === 0) continue;
      candidates.push({ callerId: element.id, key: idKey, role: role, label: cleanField(label, CAPS.labelChars), ops: ops });
    }

    // proposedAction is sent only with a risk question, and its target must survive.
    var proposed = null;
    var protectedCandidate = null;
    var proposedInput = input.proposedAction;
    if (input.kinds.indexOf('risk') !== -1 && proposedInput !== undefined && proposedInput !== null) {
      if (!isPlainObject(proposedInput) || OPERATIONS.indexOf(proposedInput.op) === -1) return invalidRequest();
      if (proposedInput.targetId !== null) {
        if (!isCallerId(proposedInput.targetId)) return invalidRequest();
        var targetKey = String(proposedInput.targetId);
        protectedCandidate = candidates.find(function isTarget(c) { return c.key === targetKey; }) || null;
        if (protectedCandidate === null) return invalidRequest();
      }
      proposed = { op: proposedInput.op };
    }

    // The schema cap: the first CAPS.elements kept elements, always including the target.
    var overCap = Math.max(0, candidates.length - CAPS.elements);
    var kept = candidates.slice(0, CAPS.elements);
    if (protectedCandidate !== null && kept.indexOf(protectedCandidate) === -1) {
      kept = candidates.slice(0, CAPS.elements - 1).concat([protectedCandidate]);
    }
    var byKey = new Map();
    var byJevId = new Map();
    kept.forEach(function assignId(c, index) {
      c.jevId = 'e' + index;
      byKey.set(c.key, c);
      byJevId.set(c.jevId, c);
    });

    // Recent actions: closed ops only, targets mapped (or null), newest CAPS.recentActions.
    var actions = [];
    for (var j = 0; j < recentActions.length; j += 1) {
      var action = recentActions[j];
      if (!isPlainObject(action) || typeof action.changed !== 'boolean') return invalidRequest();
      var hasTarget = action.targetId !== null && action.targetId !== undefined;
      if (hasTarget && !isCallerId(action.targetId)) return invalidRequest();
      if (OPERATIONS.indexOf(action.op) === -1) continue;
      actions.push({ op: action.op, target: hasTarget ? byKey.get(String(action.targetId)) || null : null, changed: action.changed });
    }
    actions = actions.slice(Math.max(0, actions.length - CAPS.recentActions));

    var goal = truncateCodePoints(input.goal, CAPS.goalChars);
    var page = {
      origin: reduced.origin,
      path: truncateCodePoints(reduced.path, CAPS.pathChars),
      title: cleanField(title, CAPS.titleChars)
    };
    var textPoints = Array.from(cleanField(visibleText, CAPS.textChars));
    var offeredOps = uniqueOperations(input.offeredOps);
    var others = kept.filter(function notProtected(c) { return c !== protectedCandidate; });
    var minOthers = input.kinds.indexOf('target') !== -1 && protectedCandidate === null && others.length > 0 ? 1 : 0;

    function pageText(n) {
      if (n >= textPoints.length) return textPoints.join('');
      // Re-clean the cut prefix: a cut can complete an injection phrase at its edge.
      return cleanField(textPoints.slice(0, n).join(''), CAPS.textChars);
    }

    function assemble(textCount, otherCount, actionCount) {
      var emitted = new Set();
      var elements = [];
      var included = 0;
      kept.forEach(function maybeEmit(c) {
        var isProtected = c === protectedCandidate;
        if (!isProtected && included >= otherCount) return;
        if (!isProtected) included += 1;
        emitted.add(c);
        elements.push({ id: c.jevId, role: c.role, label: c.label, ops: c.ops.slice() });
      });
      var request = {
        v: CONTRACT.SCHEMA_VERSION,
        kinds: input.kinds.slice(),
        goal: goal,
        page: { origin: page.origin, path: page.path, title: page.title, text: pageText(textCount) },
        elements: elements,
        recentActions: actions.slice(actions.length - actionCount).map(function emitAction(a) {
          return { op: a.op, targetId: a.target !== null && emitted.has(a.target) ? a.target.jevId : null, changed: a.changed };
        }),
        offeredOps: offeredOps.slice()
      };
      if (proposed !== null) {
        request.proposedAction = { op: proposed.op, targetId: protectedCandidate !== null ? protectedCandidate.jevId : null };
      }
      return request;
    }

    function fits(textCount, otherCount, actionCount) {
      return utf8ByteLength(JSON.stringify(assemble(textCount, otherCount, actionCount))) <= byteBudget;
    }

    // D-12 shrink order: text, then far elements, then the oldest actions.
    var textKeep = textPoints.length;
    var otherKeep = others.length;
    var actionKeep = actions.length;
    if (!fits(textKeep, otherKeep, actionKeep)) {
      textKeep = largestFitting(0, textPoints.length, function textFits(n) { return fits(n, otherKeep, actionKeep); });
      if (textKeep === -1) {
        textKeep = 0;
        otherKeep = largestFitting(minOthers, others.length, function elementsFit(n) { return fits(0, n, actionKeep); });
        if (otherKeep === -1) {
          otherKeep = minOthers;
          actionKeep = largestFitting(0, actions.length, function actionsFit(n) { return fits(0, minOthers, n); });
          if (actionKeep === -1) return invalidRequest();
        }
      }
    }

    var request = assemble(textKeep, otherKeep, actionKeep);
    var verdict = validateRequest(request);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };

    // Only emitted ids; the map stays on this machine.
    var idMap = {};
    request.elements.forEach(function mapBack(e) { idMap[e.id] = byJevId.get(e.id).callerId; });

    return {
      ok: true,
      request: request,
      idMap: idMap,
      stats: {
        dropped: { sensitive: droppedSensitive, overCap: overCap },
        shrink: {
          textChars: textPoints.length - textKeep,
          elementsDropped: others.length - otherKeep,
          actionsDropped: actions.length - actionKeep
        },
        bytes: utf8ByteLength(JSON.stringify(request))
      }
    };
  }

  var api = {
    CONTRACT: CONTRACT,
    isApprovalLikeKey: isApprovalLikeKey,
    scrubText: scrubText,
    matchesSecret: matchesSecret,
    filterInjection: filterInjection,
    luhnValid: luhnValid,
    PATTERN_SOURCES: PATTERN_SOURCES,
    INJECTION_PATTERN_SOURCES: INJECTION_PATTERN_SOURCES,
    PLACEHOLDERS: PLACEHOLDERS,
    validateRequest: validateRequest,
    validateGatewayResponse: validateGatewayResponse,
    buildRequest: buildRequest,
    toOriginPath: toOriginPath,
    utf8ByteLength: utf8ByteLength,
    codePointLength: codePointLength
  };
  root.FsbJevState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
