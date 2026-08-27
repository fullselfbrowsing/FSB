(function(global) {
  'use strict';

  var VERSION = 'skopeo-hud-projection/1';

  var CLOSED_REASONS = Object.freeze([
    'invalid-input',
    'partial-authority',
    'stale-input',
    'exact-set-over-cap',
    'vendor-scope-ambiguous',
    'evaluation-context-missing',
    'access-unavailable',
    'byte-limit-exceeded'
  ]);
  var CONSEQUENCE_STATES = Object.freeze(['accepted', 'none', 'not-evaluated']);
  var CURRENTNESS_STATES = Object.freeze(['current', 'partial', 'closed']);
  var DATE_STATES = Object.freeze(['accepted', 'none', 'not-evaluated']);
  var DATE_TYPES = Object.freeze([
    'notice-deadline',
    'renewal',
    'termination',
    'expiration'
  ]);
  var EMPTY_STATES = Object.freeze(['not-empty', 'complete-empty', 'not-evaluated']);
  var EVIDENCE_ROLES = Object.freeze(['governing', 'history']);
  var FACT_TYPES = Object.freeze([
    'signed',
    'effective',
    'notice-window',
    'notice-deadline',
    'renewal',
    'termination',
    'expiration',
    'delivery-method',
    'written-notice-address'
  ]);
  var FOLDER_GOVERNING_STATES = Object.freeze([
    'governing',
    'partially-governing',
    'review-required',
    'not-evaluated'
  ]);
  var GAP_PRIORITIES = Object.freeze(['normal', 'urgent']);
  var GAP_TYPES = Object.freeze([
    'missing-final',
    'unreadable-scan',
    'incomplete-indexing',
    'owner-gap',
    'version-conflict',
    'policy-document-missing',
    'pending',
    'download-blocked',
    'inaccessible',
    'ambiguous',
    'not-evaluated'
  ]);
  var GOVERNING_ACTION_STATES = Object.freeze(['clause', 'document', 'not-available']);
  var INDEX_STATES = Object.freeze(['complete', 'incomplete', 'pending', 'not-evaluated']);
  var MANIFEST_STATES = Object.freeze(['complete', 'partial']);
  var MEMO_EVIDENCE_STATES = Object.freeze(['on-file', 'not-evaluated']);
  var MEMO_REQUIREMENT_STATES = Object.freeze(['not-evaluated']);
  var NOTIFICATION_DELIVERY_STATES = Object.freeze([
    'not-available', 'scheduled', 'attempted', 'delivered', 'failed', 'missed',
    'not-locally-deliverable'
  ]);
  var OWNER_STATES = Object.freeze(['assigned', 'unassigned', 'not-evaluated']);
  var POLICY_DOCUMENT_STATES = Object.freeze(['on-file', 'missing', 'not-evaluated']);
  var PROJECTION_MODES = Object.freeze([
    'folder', 'reading', 'ask', 'answer', 'contract-closed'
  ]);
  var READING_STATES = Object.freeze([
    'governing',
    'partially-governing',
    'historical',
    'superseded',
    'review-required',
    'not-evaluated',
    'access-unavailable'
  ]);
  var RESULT_STATES = Object.freeze(['complete', 'empty', 'partial', 'not-evaluated', 'closed']);
  var SOURCE_STATES = Object.freeze([
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ]);
  var TRUST_STATES = Object.freeze([
    'accepted',
    'extracted',
    'inferred',
    'ambiguous',
    'unreadable',
    'review-required'
  ]);
  var ASK_SCOPE_KINDS = Object.freeze(['agreement', 'vendor', 'corpus']);
  var ASK_STATES = Object.freeze(['editing', 'checking', 'error']);
  var ASK_ERROR_STATES = Object.freeze([
    'invalid-question', 'provider-unavailable', 'authority-changed'
  ]);
  var ANSWER_OUTCOMES = Object.freeze(['answered', 'review-required', 'abstained']);
  var ANSWER_TRUST_STATES = Object.freeze([
    'accepted', 'extracted', 'ambiguous', 'review-required'
  ]);
  var ANSWER_CONFLICT_TYPES = Object.freeze(['governing-conflict', 'source-conflict']);
  var ANSWER_GAP_TYPES = Object.freeze([
    'incomplete-evidence', 'source-inaccessible', 'source-unreadable',
    'index-incomplete', 'governing-review-required', 'document-10-missing',
    'document-10-inaccessible', 'memo-missing', 'memo-inaccessible'
  ]);
  var POLICY_CLEARANCE_STATES = Object.freeze(['blocked', 'cleared']);
  var POLICY_REASON_CODES = Object.freeze([
    'document-10-unreviewed', 'document-10-missing', 'document-10-inaccessible',
    'document-10-stale', 'governing-conflict', 'memo-missing',
    'memo-inaccessible', 'memo-incomplete'
  ]);
  var DOCUMENT_10_STATES = Object.freeze(['current', 'missing', 'inaccessible', 'stale']);
  var POLICY_MEMO_STATES = Object.freeze([
    'on-file', 'proven-missing', 'inaccessible', 'incomplete'
  ]);
  var POLICY_ACTION_LABELS = Object.freeze([
    'review-document-10', 'acknowledge-document-10', 'configure-document-10',
    'replace-document-10', 'clear-document-10', 'classify-complex',
    'classify-routine', 'open-existing-memo'
  ]);
  var MAX_ASK_SCOPES = 33;
  var MAX_ANSWER_GOVERNING = 8;
  var MAX_ANSWER_HISTORY = 6;
  var MAX_ANSWER_DETAILS = 8;
  var MAX_ANSWER_SOURCES = 12;
  var MAX_POLICY_ACTIONS = 8;
  var MAX_QUESTION_LENGTH = 2000;
  var MAX_CONCLUSION_LENGTH = 1200;
  var MAX_EXPLANATION_LENGTH = 512;
  var MAX_CLAIM_LENGTH = 512;
  var MAX_VALUE_LENGTH = 512;

  var LIMITS = Object.freeze({
    MAX_PROJECTED_VENDORS: 32,
    MAX_SUMMARY_DATES: 3,
    MAX_SUMMARY_GAPS: 4,
    MAX_VENDOR_GAPS: 3,
    MAX_READING_FACTS: 10,
    MAX_READING_GAPS: 6,
    MAX_SERIALIZED_BYTES: 64 * 1024,
    MAX_LABEL_LENGTH: 160,
    MAX_TEXT_LENGTH: 1024,
    MAX_CITATION_LABEL_LENGTH: 256,
    MAX_OPAQUE_TOKEN_LENGTH: 192
  });

  var CLOSED_REASON_SET = makeSet(CLOSED_REASONS);
  var CONSEQUENCE_STATE_SET = makeSet(CONSEQUENCE_STATES);
  var CURRENTNESS_STATE_SET = makeSet(CURRENTNESS_STATES);
  var DATE_STATE_SET = makeSet(DATE_STATES);
  var DATE_TYPE_SET = makeSet(DATE_TYPES);
  var EMPTY_STATE_SET = makeSet(EMPTY_STATES);
  var EVIDENCE_ROLE_SET = makeSet(EVIDENCE_ROLES);
  var FACT_TYPE_SET = makeSet(FACT_TYPES);
  var FOLDER_GOVERNING_STATE_SET = makeSet(FOLDER_GOVERNING_STATES);
  var GAP_PRIORITY_SET = makeSet(GAP_PRIORITIES);
  var GAP_TYPE_SET = makeSet(GAP_TYPES);
  var GOVERNING_ACTION_STATE_SET = makeSet(GOVERNING_ACTION_STATES);
  var INDEX_STATE_SET = makeSet(INDEX_STATES);
  var MANIFEST_STATE_SET = makeSet(MANIFEST_STATES);
  var MEMO_EVIDENCE_STATE_SET = makeSet(MEMO_EVIDENCE_STATES);
  var MEMO_REQUIREMENT_STATE_SET = makeSet(MEMO_REQUIREMENT_STATES);
  var NOTIFICATION_DELIVERY_STATE_SET = makeSet(NOTIFICATION_DELIVERY_STATES);
  var OWNER_STATE_SET = makeSet(OWNER_STATES);
  var POLICY_DOCUMENT_STATE_SET = makeSet(POLICY_DOCUMENT_STATES);
  var PROJECTION_MODE_SET = makeSet(PROJECTION_MODES);
  var READING_STATE_SET = makeSet(READING_STATES);
  var RESULT_STATE_SET = makeSet(RESULT_STATES);
  var SOURCE_STATE_SET = makeSet(SOURCE_STATES);
  var TRUST_STATE_SET = makeSet(TRUST_STATES);
  var ASK_SCOPE_KIND_SET = makeSet(ASK_SCOPE_KINDS);
  var ASK_STATE_SET = makeSet(ASK_STATES);
  var ASK_ERROR_STATE_SET = makeSet(ASK_ERROR_STATES);
  var ANSWER_OUTCOME_SET = makeSet(ANSWER_OUTCOMES);
  var ANSWER_TRUST_STATE_SET = makeSet(ANSWER_TRUST_STATES);
  var ANSWER_CONFLICT_TYPE_SET = makeSet(ANSWER_CONFLICT_TYPES);
  var ANSWER_GAP_TYPE_SET = makeSet(ANSWER_GAP_TYPES);
  var POLICY_CLEARANCE_STATE_SET = makeSet(POLICY_CLEARANCE_STATES);
  var POLICY_REASON_CODE_SET = makeSet(POLICY_REASON_CODES);
  var DOCUMENT_10_STATE_SET = makeSet(DOCUMENT_10_STATES);
  var POLICY_MEMO_STATE_SET = makeSet(POLICY_MEMO_STATES);
  var POLICY_ACTION_LABEL_SET = makeSet(POLICY_ACTION_LABELS);

  var ENVELOPE_KEYS = [
    'version',
    'generation',
    'exactOrigin',
    'profileVersion',
    'contextEpoch',
    'semanticEntityToken',
    'requestActionToken',
    'projectionToken',
    'mode',
    'currentness',
    'result',
    'body'
  ];
  var FOLDER_BODY_KEYS = [
    'manifestState',
    'vendorCount',
    'vendors',
    'vendorOverflow',
    'nextMaterialDates',
    'nextMaterialDateOverflow',
    'urgentGaps',
    'urgentGapOverflow',
    'emptyState'
  ];
  var VENDOR_KEYS = [
    'vendorToken',
    'label',
    'owner',
    'documents',
    'governingState',
    'nextMaterialDate',
    'consequence',
    'memoEvidence',
    'policyDocument',
    'memoRequirement',
    'notificationDelivery',
    'gaps',
    'gapOverflow'
  ];
  var READING_BODY_KEYS = [
    'documentLabel',
    'sourceState',
    'readingState',
    'governingAction',
    'facts',
    'factOverflow',
    'gaps',
    'gapOverflow',
    'policyDocument',
    'memoRequirement',
    'notificationDelivery',
    'emptyState'
  ];
  var ASK_BODY_KEYS = ['scope', 'question', 'state', 'error'];
  var ANSWER_BODY_KEYS = ['question', 'scope', 'answer', 'policy', 'policyActions'];

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isPlainRecord(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) {
      return false;
    }
  }

  function dataValues(value, expectedKeys) {
    if (!isPlainRecord(value)) return null;
    try {
      var actualKeys = Reflect.ownKeys(value);
      if (actualKeys.length !== expectedKeys.length || actualKeys.some(function(key) {
        return typeof key !== 'string';
      })) {
        return null;
      }
      var expected = expectedKeys.slice().sort();
      var sorted = actualKeys.slice().sort();
      for (var index = 0; index < sorted.length; index += 1) {
        if (sorted[index] !== expected[index]) return null;
      }
      var output = Object.create(null);
      for (var keyIndex = 0; keyIndex < actualKeys.length; keyIndex += 1) {
        var key = actualKeys[keyIndex];
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output[key] = descriptor.value;
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function dataArrayValues(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) return null;
    try {
      if (Object.getPrototypeOf(value) !== Array.prototype) return null;
      var keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some(function(key) {
        return typeof key !== 'string' ||
          (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key));
      })) {
        return null;
      }
      var output = [];
      for (var index = 0; index < value.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) return null;
        output.push(descriptor.value);
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function frozenArray(values) {
    return Object.freeze(values.slice());
  }

  function validUnicode(value) {
    if (typeof value !== 'string') return false;
    for (var index = 0; index < value.length; index += 1) {
      var unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        if (index + 1 >= value.length) return false;
        var next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return false;
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        return false;
      }
    }
    return true;
  }

  function validText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      validUnicode(value) &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value) &&
      !/(?:https?|file|chrome):\/\//i.test(value);
  }

  function validToken(value) {
    return typeof value === 'string' && value.length > 0 &&
      value.length <= LIMITS.MAX_OPAQUE_TOKEN_LENGTH &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
      value !== '__proto__' && value !== 'prototype' && value !== 'constructor';
  }

  function validTrimmedText(value, maximum) {
    return validText(value, maximum) && value === value.trim();
  }

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validOrigin(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048 ||
        !global || typeof global.URL !== 'function') {
      return false;
    }
    try {
      var parsed = new global.URL(value);
      return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' &&
        parsed.port === '' && parsed.origin === value && parsed.pathname === '/' &&
        parsed.search === '' && parsed.hash === '';
    } catch (_error) {
      return false;
    }
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  }

  function validCivilDate(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    return year >= 1 && year <= 9999 && month >= 1 && month <= 12 &&
      day >= 1 && day <= daysInMonth(year, month);
  }

  function parseOwner(value) {
    var fields = dataValues(value, ['state', 'label']);
    if (!fields || !OWNER_STATE_SET[fields.state]) return null;
    if (fields.state === 'assigned') {
      if (!validText(fields.label, LIMITS.MAX_LABEL_LENGTH)) return null;
    } else if (fields.label !== null) {
      return null;
    }
    return frozenRecord([['state', fields.state], ['label', fields.label]]);
  }

  function parseNotificationDelivery(value, actionTokens) {
    if (value === 'not-available') return value;
    var fields = dataValues(value, [
      'version', 'state', 'summary', 'detail', 'deadlineCivilDate',
      'alertCivilDate', 'action'
    ]);
    if (!fields || fields.version !== 'skopeo-alert-public-status/1' ||
        !NOTIFICATION_DELIVERY_STATE_SET[fields.state] ||
        fields.state === 'not-available' ||
        !validText(fields.summary, LIMITS.MAX_TEXT_LENGTH) ||
        !validText(fields.detail, LIMITS.MAX_TEXT_LENGTH) ||
        !(fields.deadlineCivilDate === null || validCivilDate(fields.deadlineCivilDate)) ||
        !(fields.alertCivilDate === null || validCivilDate(fields.alertCivilDate))) return null;
    if (fields.state !== 'not-locally-deliverable' &&
        (fields.deadlineCivilDate === null || fields.alertCivilDate === null)) return null;
    var action = null;
    if (fields.action !== null) {
      var actionFields = dataValues(fields.action, [
        'actionId', 'kind', 'label', 'requiresConfirmation'
      ]);
      if (!actionFields || !validToken(actionFields.actionId) ||
          own(actionTokens, actionFields.actionId) ||
          (actionFields.kind !== 'map-current-owner' &&
            actionFields.kind !== 'remove-current-owner-mapping') ||
          !validText(actionFields.label, LIMITS.MAX_LABEL_LENGTH) ||
          actionFields.requiresConfirmation !== true ||
          (actionFields.kind === 'map-current-owner' &&
            fields.state !== 'not-locally-deliverable') ||
          (actionFields.kind === 'remove-current-owner-mapping' &&
            fields.state === 'not-locally-deliverable')) return null;
      actionTokens[actionFields.actionId] = true;
      action = frozenRecord([
        ['actionId', actionFields.actionId],
        ['kind', actionFields.kind],
        ['label', actionFields.label],
        ['requiresConfirmation', true]
      ]);
    }
    return frozenRecord([
      ['version', fields.version],
      ['state', fields.state],
      ['summary', fields.summary],
      ['detail', fields.detail],
      ['deadlineCivilDate', fields.deadlineCivilDate],
      ['alertCivilDate', fields.alertCivilDate],
      ['action', action]
    ]);
  }

  function parseDocuments(value) {
    var fields = dataValues(value, [
      'indexState', 'total', 'ready', 'pending', 'unreadable',
      'downloadBlocked', 'inaccessible', 'missing'
    ]);
    if (!fields || !INDEX_STATE_SET[fields.indexState]) return null;
    var counts = [
      fields.total, fields.ready, fields.pending, fields.unreadable,
      fields.downloadBlocked, fields.inaccessible, fields.missing
    ];
    if (counts.some(function(count) { return !validCount(count); }) ||
        fields.total !== counts.slice(1).reduce(function(sum, count) { return sum + count; }, 0)) {
      return null;
    }
    return frozenRecord([
      ['indexState', fields.indexState],
      ['total', fields.total],
      ['ready', fields.ready],
      ['pending', fields.pending],
      ['unreadable', fields.unreadable],
      ['downloadBlocked', fields.downloadBlocked],
      ['inaccessible', fields.inaccessible],
      ['missing', fields.missing]
    ]);
  }

  function parseMaterialDate(value, acceptedOnly) {
    var fields = dataValues(value, ['state', 'type', 'civilDate', 'displayDate', 'trustState']);
    if (!fields || !DATE_STATE_SET[fields.state]) return null;
    if (fields.state === 'accepted') {
      if (!DATE_TYPE_SET[fields.type] || !validCivilDate(fields.civilDate) ||
          !validText(fields.displayDate, LIMITS.MAX_LABEL_LENGTH) ||
          !TRUST_STATE_SET[fields.trustState]) {
        return null;
      }
    } else if (fields.type !== null || fields.civilDate !== null ||
        fields.displayDate !== null || fields.trustState !== null) {
      return null;
    }
    if (acceptedOnly && fields.state !== 'accepted') return null;
    return frozenRecord([
      ['state', fields.state],
      ['type', fields.type],
      ['civilDate', fields.civilDate],
      ['displayDate', fields.displayDate],
      ['trustState', fields.trustState]
    ]);
  }

  function parseConsequence(value) {
    var fields = dataValues(value, ['state', 'text']);
    if (!fields || !CONSEQUENCE_STATE_SET[fields.state]) return null;
    if (fields.state === 'accepted') {
      if (!validText(fields.text, LIMITS.MAX_TEXT_LENGTH)) return null;
    } else if (fields.text !== null) {
      return null;
    }
    return frozenRecord([['state', fields.state], ['text', fields.text]]);
  }

  function parseGap(value) {
    var fields = dataValues(value, ['type', 'priority']);
    if (!fields || !GAP_TYPE_SET[fields.type] || !GAP_PRIORITY_SET[fields.priority]) return null;
    return frozenRecord([['type', fields.type], ['priority', fields.priority]]);
  }

  function parseGapArray(value, maximum) {
    var items = dataArrayValues(value, maximum);
    if (!items) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var gap = parseGap(items[index]);
      if (!gap || own(seen, gap.type)) return null;
      seen[gap.type] = true;
      output.push(gap);
    }
    return frozenArray(output);
  }

  function validOverflow(items, overflow, maximum) {
    return validCount(overflow) && (overflow === 0 || items.length === maximum);
  }

  function parseAskScope(value) {
    var fields = dataValues(value, ['kind', 'label', 'scopeToken']);
    if (!fields || !ASK_SCOPE_KIND_SET[fields.kind] ||
        !validTrimmedText(fields.label, LIMITS.MAX_LABEL_LENGTH) ||
        !validToken(fields.scopeToken)) return null;
    return frozenRecord([
      ['kind', fields.kind],
      ['label', fields.label],
      ['scopeToken', fields.scopeToken]
    ]);
  }

  function parseAskScopes(value, mode) {
    var items = dataArrayValues(value, MAX_ASK_SCOPES);
    if (!items) return null;
    var output = [];
    var tokens = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var scope = parseAskScope(items[index]);
      if (!scope || own(tokens, scope.scopeToken) ||
          (mode === 'folder' && scope.kind === 'agreement') ||
          (mode === 'reading' && scope.kind === 'corpus')) return null;
      tokens[scope.scopeToken] = true;
      output.push(scope);
    }
    return frozenArray(output);
  }

  function parseAnswerTrust(value) {
    var fields = dataValues(value, ['state', 'explanation']);
    if (!fields || !ANSWER_TRUST_STATE_SET[fields.state] ||
        !validTrimmedText(fields.explanation, MAX_EXPLANATION_LENGTH)) return null;
    return frozenRecord([
      ['state', fields.state],
      ['explanation', fields.explanation]
    ]);
  }

  function parseAnswerEvidence(value, tokens) {
    var fields = dataValues(value, [
      'claim', 'value', 'trustState', 'citationLabel', 'actionToken'
    ]);
    if (!fields || !validTrimmedText(fields.claim, MAX_CLAIM_LENGTH) ||
        !validTrimmedText(fields.value, MAX_VALUE_LENGTH) ||
        !ANSWER_TRUST_STATE_SET[fields.trustState] ||
        !validTrimmedText(fields.citationLabel, LIMITS.MAX_CITATION_LABEL_LENGTH) ||
        !validToken(fields.actionToken) || own(tokens, fields.actionToken)) return null;
    tokens[fields.actionToken] = true;
    return frozenRecord([
      ['claim', fields.claim],
      ['value', fields.value],
      ['trustState', fields.trustState],
      ['citationLabel', fields.citationLabel],
      ['actionToken', fields.actionToken]
    ]);
  }

  function parseAnswerEvidenceArray(value, maximum, tokens) {
    var items = dataArrayValues(value, maximum);
    if (!items) return null;
    var output = [];
    for (var index = 0; index < items.length; index += 1) {
      var evidence = parseAnswerEvidence(items[index], tokens);
      if (!evidence) return null;
      output.push(evidence);
    }
    return frozenArray(output);
  }

  function parseAnswerDetails(value, types) {
    var items = dataArrayValues(value, MAX_ANSWER_DETAILS);
    if (!items) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['type', 'detail']);
      var key = fields && fields.type + '\u0000' + fields.detail;
      if (!fields || !types[fields.type] ||
          !validTrimmedText(fields.detail, MAX_EXPLANATION_LENGTH) || own(seen, key)) return null;
      seen[key] = true;
      output.push(frozenRecord([
        ['type', fields.type],
        ['detail', fields.detail]
      ]));
    }
    return frozenArray(output);
  }

  function parseAnswerSources(value, evidenceTokens) {
    var items = dataArrayValues(value, MAX_ANSWER_SOURCES);
    if (!items) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['label', 'evidenceRole', 'actionToken']);
      if (!fields || !validTrimmedText(fields.label, LIMITS.MAX_CITATION_LABEL_LENGTH) ||
          !EVIDENCE_ROLE_SET[fields.evidenceRole] || !validToken(fields.actionToken) ||
          !own(evidenceTokens, fields.actionToken) || own(seen, fields.actionToken)) return null;
      seen[fields.actionToken] = fields.evidenceRole;
      output.push(frozenRecord([
        ['label', fields.label],
        ['evidenceRole', fields.evidenceRole],
        ['actionToken', fields.actionToken]
      ]));
    }
    if (Object.keys(seen).length !== Object.keys(evidenceTokens).length) return null;
    return frozenRecord([
      ['items', frozenArray(output)],
      ['roles', Object.freeze(seen)]
    ]);
  }

  function parseAnswer(value) {
    var fields = dataValues(value, [
      'outcome', 'evidenceComplete', 'conclusion', 'trust', 'governingEvidence',
      'historyEvidence', 'conflicts', 'gaps', 'sources', 'sourceOverflow'
    ]);
    if (!fields || !ANSWER_OUTCOME_SET[fields.outcome] ||
        typeof fields.evidenceComplete !== 'boolean' ||
        !(fields.conclusion === null ||
          validTrimmedText(fields.conclusion, MAX_CONCLUSION_LENGTH)) ||
        !validCount(fields.sourceOverflow)) return null;
    var trust = parseAnswerTrust(fields.trust);
    var evidenceTokens = Object.create(null);
    var governing = parseAnswerEvidenceArray(
      fields.governingEvidence,
      MAX_ANSWER_GOVERNING,
      evidenceTokens
    );
    var history = parseAnswerEvidenceArray(
      fields.historyEvidence,
      MAX_ANSWER_HISTORY,
      evidenceTokens
    );
    var conflicts = parseAnswerDetails(fields.conflicts, ANSWER_CONFLICT_TYPE_SET);
    var gaps = parseAnswerDetails(fields.gaps, ANSWER_GAP_TYPE_SET);
    var sources = parseAnswerSources(fields.sources, evidenceTokens);
    if (!trust || !governing || !history || !conflicts || !gaps || !sources ||
        !validOverflow(sources.items, fields.sourceOverflow, MAX_ANSWER_SOURCES)) return null;
    for (var governingIndex = 0; governingIndex < governing.length; governingIndex += 1) {
      if (sources.roles[governing[governingIndex].actionToken] !== 'governing') return null;
    }
    for (var historyIndex = 0; historyIndex < history.length; historyIndex += 1) {
      if (sources.roles[history[historyIndex].actionToken] !== 'history') return null;
    }
    if (fields.outcome === 'abstained' || !fields.evidenceComplete) {
      if (fields.outcome !== 'abstained' || fields.conclusion !== null ||
          (conflicts.length === 0 && gaps.length === 0)) return null;
    } else if (fields.conclusion === null || governing.length === 0) return null;
    return frozenRecord([
      ['outcome', fields.outcome],
      ['evidenceComplete', fields.evidenceComplete],
      ['conclusion', fields.conclusion],
      ['trust', trust],
      ['governingEvidence', governing],
      ['historyEvidence', history],
      ['conflicts', conflicts],
      ['gaps', gaps],
      ['sources', sources.items],
      ['sourceOverflow', fields.sourceOverflow]
    ]);
  }

  function parsePolicy(value) {
    if (value === null) return null;
    var hasMemo = isPlainRecord(value) && own(value, 'memo');
    var keys = ['clearance', 'reasons', 'document10'];
    if (hasMemo) keys.push('memo');
    var fields = dataValues(value, keys);
    if (!fields || !POLICY_CLEARANCE_STATE_SET[fields.clearance]) return false;
    var reasonItems = dataArrayValues(fields.reasons, POLICY_REASON_CODES.length);
    var document10 = dataValues(fields.document10, ['state', 'reviewed']);
    if (!reasonItems || !document10 || !DOCUMENT_10_STATE_SET[document10.state] ||
        typeof document10.reviewed !== 'boolean' ||
        (document10.state !== 'current' && document10.reviewed)) return false;
    var reasons = [];
    var seen = Object.create(null);
    for (var index = 0; index < reasonItems.length; index += 1) {
      if (!POLICY_REASON_CODE_SET[reasonItems[index]] || own(seen, reasonItems[index])) return false;
      seen[reasonItems[index]] = true;
      reasons.push(reasonItems[index]);
    }
    if ((fields.clearance === 'cleared') !== (reasons.length === 0)) return false;
    var memo = null;
    if (hasMemo) {
      var memoFields = dataValues(fields.memo, ['state', 'satisfied']);
      if (!memoFields || !POLICY_MEMO_STATE_SET[memoFields.state] ||
          typeof memoFields.satisfied !== 'boolean' ||
          memoFields.satisfied !== (memoFields.state === 'on-file')) return false;
      memo = frozenRecord([
        ['state', memoFields.state],
        ['satisfied', memoFields.satisfied]
      ]);
    }
    var entries = [
      ['clearance', fields.clearance],
      ['reasons', frozenArray(reasons)],
      ['document10', frozenRecord([
        ['state', document10.state],
        ['reviewed', document10.reviewed]
      ])]
    ];
    if (hasMemo) entries.push(['memo', memo]);
    return frozenRecord(entries);
  }

  function parsePolicyActions(value) {
    var items = dataArrayValues(value, MAX_POLICY_ACTIONS);
    if (!items) return null;
    var output = [];
    var tokens = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['actionId', 'label', 'requiresConfirmation']);
      if (!fields || !validToken(fields.actionId) || own(tokens, fields.actionId) ||
          !POLICY_ACTION_LABEL_SET[fields.label] ||
          typeof fields.requiresConfirmation !== 'boolean') return null;
      tokens[fields.actionId] = true;
      output.push(frozenRecord([
        ['actionId', fields.actionId],
        ['label', fields.label],
        ['requiresConfirmation', fields.requiresConfirmation]
      ]));
    }
    return frozenArray(output);
  }

  function parseVendor(value, actionTokens) {
    var fields = dataValues(value, VENDOR_KEYS);
    if (!fields || !validToken(fields.vendorToken) ||
        !validText(fields.label, LIMITS.MAX_LABEL_LENGTH) ||
        !FOLDER_GOVERNING_STATE_SET[fields.governingState] ||
        !MEMO_EVIDENCE_STATE_SET[fields.memoEvidence] ||
        !POLICY_DOCUMENT_STATE_SET[fields.policyDocument] ||
        !MEMO_REQUIREMENT_STATE_SET[fields.memoRequirement]) {
      return null;
    }
    var owner = parseOwner(fields.owner);
    var documents = parseDocuments(fields.documents);
    var date = parseMaterialDate(fields.nextMaterialDate, false);
    var consequence = parseConsequence(fields.consequence);
    var gaps = parseGapArray(fields.gaps, LIMITS.MAX_VENDOR_GAPS);
    var notificationDelivery = parseNotificationDelivery(
      fields.notificationDelivery, actionTokens);
    if (!owner || !documents || !date || !consequence || !gaps || !notificationDelivery ||
        !validOverflow(gaps, fields.gapOverflow, LIMITS.MAX_VENDOR_GAPS)) {
      return null;
    }
    return frozenRecord([
      ['vendorToken', fields.vendorToken],
      ['label', fields.label],
      ['owner', owner],
      ['documents', documents],
      ['governingState', fields.governingState],
      ['nextMaterialDate', date],
      ['consequence', consequence],
      ['memoEvidence', fields.memoEvidence],
      ['policyDocument', fields.policyDocument],
      ['memoRequirement', fields.memoRequirement],
      ['notificationDelivery', notificationDelivery],
      ['gaps', gaps],
      ['gapOverflow', fields.gapOverflow]
    ]);
  }

  function parseDateSummary(value, vendors) {
    var fields = dataValues(value, ['vendorToken', 'vendorLabel', 'date', 'consequence']);
    var vendor = fields && vendors[fields.vendorToken];
    var date = fields && parseMaterialDate(fields.date, true);
    var consequence = fields && parseConsequence(fields.consequence);
    if (!fields || !vendor || vendor.label !== fields.vendorLabel || !date || !consequence) return null;
    return frozenRecord([
      ['vendorToken', fields.vendorToken],
      ['vendorLabel', fields.vendorLabel],
      ['date', date],
      ['consequence', consequence]
    ]);
  }

  function parseGapSummary(value, vendors) {
    var fields = dataValues(value, ['vendorToken', 'vendorLabel', 'gap']);
    var vendor = fields && vendors[fields.vendorToken];
    var gap = fields && parseGap(fields.gap);
    if (!fields || !vendor || vendor.label !== fields.vendorLabel || !gap ||
        gap.priority !== 'urgent') {
      return null;
    }
    return frozenRecord([
      ['vendorToken', fields.vendorToken],
      ['vendorLabel', fields.vendorLabel],
      ['gap', gap]
    ]);
  }

  function parseFolderBody(value, currentness, result) {
    var hasAskScopes = isPlainRecord(value) && own(value, 'askScopes');
    var folderKeys = hasAskScopes ? FOLDER_BODY_KEYS.concat(['askScopes']) : FOLDER_BODY_KEYS;
    var fields = dataValues(value, folderKeys);
    if (!fields || !MANIFEST_STATE_SET[fields.manifestState] ||
        !validCount(fields.vendorCount) || !EMPTY_STATE_SET[fields.emptyState]) {
      return null;
    }
    var vendorItems = dataArrayValues(fields.vendors, LIMITS.MAX_PROJECTED_VENDORS);
    var askScopes = hasAskScopes ? parseAskScopes(fields.askScopes, 'folder') : null;
    if (!vendorItems || (hasAskScopes && !askScopes)) return null;
    var vendors = [];
    var vendorMap = Object.create(null);
    var actionTokens = Object.create(null);
    for (var index = 0; index < vendorItems.length; index += 1) {
      var vendor = parseVendor(vendorItems[index], actionTokens);
      if (!vendor || own(vendorMap, vendor.vendorToken)) return null;
      vendorMap[vendor.vendorToken] = vendor;
      vendors.push(vendor);
    }
    if (!validCount(fields.vendorOverflow) ||
        fields.vendorCount !== vendors.length + fields.vendorOverflow) {
      return null;
    }

    var dateItems = dataArrayValues(fields.nextMaterialDates, LIMITS.MAX_SUMMARY_DATES);
    var gapItems = dataArrayValues(fields.urgentGaps, LIMITS.MAX_SUMMARY_GAPS);
    if (!dateItems || !gapItems) return null;
    var dates = [];
    var dateVendors = Object.create(null);
    for (var dateIndex = 0; dateIndex < dateItems.length; dateIndex += 1) {
      var date = parseDateSummary(dateItems[dateIndex], vendorMap);
      if (!date || own(dateVendors, date.vendorToken)) return null;
      dateVendors[date.vendorToken] = true;
      dates.push(date);
    }
    var gaps = [];
    var gapKeys = Object.create(null);
    for (var gapIndex = 0; gapIndex < gapItems.length; gapIndex += 1) {
      var gap = parseGapSummary(gapItems[gapIndex], vendorMap);
      var gapKey = gap && gap.vendorToken + '\u0000' + gap.gap.type;
      if (!gap || own(gapKeys, gapKey)) return null;
      gapKeys[gapKey] = true;
      gaps.push(gap);
    }
    if (!validOverflow(dates, fields.nextMaterialDateOverflow, LIMITS.MAX_SUMMARY_DATES) ||
        !validOverflow(gaps, fields.urgentGapOverflow, LIMITS.MAX_SUMMARY_GAPS)) {
      return null;
    }

    var full = currentness === 'current' && fields.manifestState === 'complete';
    if (full) {
      if (fields.vendorOverflow !== 0 ||
          (fields.vendorCount === 0 && (result !== 'empty' || fields.emptyState !== 'complete-empty')) ||
          (fields.vendorCount > 0 && (result !== 'complete' || fields.emptyState !== 'not-empty'))) {
        return null;
      }
    } else if (currentness !== 'partial' || result !== 'partial' ||
        fields.manifestState !== 'partial' || fields.emptyState !== 'not-evaluated') {
      return null;
    }

    var entries = [
      ['manifestState', fields.manifestState],
      ['vendorCount', fields.vendorCount],
      ['vendors', frozenArray(vendors)],
      ['vendorOverflow', fields.vendorOverflow],
      ['nextMaterialDates', frozenArray(dates)],
      ['nextMaterialDateOverflow', fields.nextMaterialDateOverflow],
      ['urgentGaps', frozenArray(gaps)],
      ['urgentGapOverflow', fields.urgentGapOverflow],
      ['emptyState', fields.emptyState]
    ];
    if (hasAskScopes) entries.push(['askScopes', askScopes]);
    return frozenRecord(entries);
  }

  function parseGoverningAction(value, actionTokens) {
    var fields = dataValues(value, ['state', 'actionToken']);
    if (!fields || !GOVERNING_ACTION_STATE_SET[fields.state]) return null;
    if (fields.state === 'not-available') {
      if (fields.actionToken !== null) return null;
    } else {
      if (!validToken(fields.actionToken) || own(actionTokens, fields.actionToken)) return null;
      actionTokens[fields.actionToken] = true;
    }
    return frozenRecord([['state', fields.state], ['actionToken', fields.actionToken]]);
  }

  function parseFact(value, actionTokens) {
    var fields = dataValues(value, [
      'type', 'value', 'evidenceRole', 'trustState', 'citationLabel', 'actionToken'
    ]);
    if (!fields || !FACT_TYPE_SET[fields.type] ||
        !validText(fields.value, LIMITS.MAX_TEXT_LENGTH) ||
        !EVIDENCE_ROLE_SET[fields.evidenceRole] || !TRUST_STATE_SET[fields.trustState] ||
        !validText(fields.citationLabel, LIMITS.MAX_CITATION_LABEL_LENGTH) ||
        !(fields.actionToken === null || validToken(fields.actionToken)) ||
        (fields.actionToken !== null && own(actionTokens, fields.actionToken))) {
      return null;
    }
    if (fields.actionToken !== null) actionTokens[fields.actionToken] = true;
    return frozenRecord([
      ['type', fields.type],
      ['value', fields.value],
      ['evidenceRole', fields.evidenceRole],
      ['trustState', fields.trustState],
      ['citationLabel', fields.citationLabel],
      ['actionToken', fields.actionToken]
    ]);
  }

  function parseReadingBody(value, currentness, result) {
    var hasAskScopes = isPlainRecord(value) && own(value, 'askScopes');
    var readingKeys = hasAskScopes ? READING_BODY_KEYS.concat(['askScopes']) : READING_BODY_KEYS;
    var fields = dataValues(value, readingKeys);
    if (!fields || !validText(fields.documentLabel, LIMITS.MAX_LABEL_LENGTH) ||
        !SOURCE_STATE_SET[fields.sourceState] || !READING_STATE_SET[fields.readingState] ||
        !POLICY_DOCUMENT_STATE_SET[fields.policyDocument] ||
        !MEMO_REQUIREMENT_STATE_SET[fields.memoRequirement] ||
        !EMPTY_STATE_SET[fields.emptyState]) {
      return null;
    }
    var askScopes = hasAskScopes ? parseAskScopes(fields.askScopes, 'reading') : null;
    if (hasAskScopes && !askScopes) return null;
    var actionTokens = Object.create(null);
    var governingAction = parseGoverningAction(fields.governingAction, actionTokens);
    var notificationDelivery = parseNotificationDelivery(
      fields.notificationDelivery, actionTokens);
    var factItems = dataArrayValues(fields.facts, LIMITS.MAX_READING_FACTS);
    var gaps = parseGapArray(fields.gaps, LIMITS.MAX_READING_GAPS);
    if (!governingAction || !notificationDelivery || !factItems || !gaps) return null;
    var facts = [];
    for (var index = 0; index < factItems.length; index += 1) {
      var fact = parseFact(factItems[index], actionTokens);
      if (!fact) return null;
      facts.push(fact);
    }
    if (!validOverflow(facts, fields.factOverflow, LIMITS.MAX_READING_FACTS) ||
        !validOverflow(gaps, fields.gapOverflow, LIMITS.MAX_READING_GAPS)) {
      return null;
    }
    if (currentness === 'current') {
      if ((facts.length === 0 && gaps.length === 0 &&
          (result !== 'empty' || fields.emptyState !== 'complete-empty')) ||
          ((facts.length > 0 || gaps.length > 0) &&
            (result !== 'complete' || fields.emptyState !== 'not-empty'))) {
        return null;
      }
    } else if (currentness !== 'partial' || result !== 'partial' ||
        fields.emptyState !== 'not-evaluated') {
      return null;
    }
    var entries = [
      ['documentLabel', fields.documentLabel],
      ['sourceState', fields.sourceState],
      ['readingState', fields.readingState],
      ['governingAction', governingAction],
      ['facts', frozenArray(facts)],
      ['factOverflow', fields.factOverflow],
      ['gaps', gaps],
      ['gapOverflow', fields.gapOverflow],
      ['policyDocument', fields.policyDocument],
      ['memoRequirement', fields.memoRequirement],
      ['notificationDelivery', notificationDelivery],
      ['emptyState', fields.emptyState]
    ];
    if (hasAskScopes) entries.push(['askScopes', askScopes]);
    return frozenRecord(entries);
  }

  function utf8Length(value) {
    if (global && typeof global.TextEncoder === 'function') {
      return new global.TextEncoder().encode(value).length;
    }
    var length = 0;
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      if (code < 0x80) length += 1;
      else if (code < 0x800) length += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        length += 4;
        index += 1;
      } else length += 3;
    }
    return length;
  }

  function parseAskBody(value, currentness, result) {
    var fields = dataValues(value, ASK_BODY_KEYS);
    var scope = fields && parseAskScope(fields.scope);
    if (!fields || !scope || !ASK_STATE_SET[fields.state] ||
        !(fields.question === null ||
          validTrimmedText(fields.question, MAX_QUESTION_LENGTH)) ||
        !(fields.error === null || ASK_ERROR_STATE_SET[fields.error]) ||
        currentness !== 'current' || result !== 'complete') return null;
    if ((fields.state === 'error') !== (fields.error !== null) ||
        (fields.state === 'checking' && fields.question === null)) return null;
    return frozenRecord([
      ['scope', scope],
      ['question', fields.question],
      ['state', fields.state],
      ['error', fields.error]
    ]);
  }

  function parseAnswerBody(value, currentness, result) {
    var fields = dataValues(value, ANSWER_BODY_KEYS);
    var scope = fields && parseAskScope(fields.scope);
    var answer = fields && parseAnswer(fields.answer);
    var policy = fields && parsePolicy(fields.policy);
    var policyActions = fields && parsePolicyActions(fields.policyActions);
    if (!fields || !validTrimmedText(fields.question, MAX_QUESTION_LENGTH) ||
        !scope || !answer || policy === false || !policyActions ||
        currentness !== 'current' || result !== 'complete' ||
        (policy === null && policyActions.length > 0)) return null;
    return frozenRecord([
      ['question', fields.question],
      ['scope', scope],
      ['answer', answer],
      ['policy', policy],
      ['policyActions', policyActions]
    ]);
  }

  function parseProjection(value) {
    try {
      var fields = dataValues(value, ENVELOPE_KEYS);
      if (!fields || fields.version !== VERSION || !validCount(fields.generation) ||
          !validOrigin(fields.exactOrigin) || !validToken(fields.profileVersion) ||
          !validCount(fields.contextEpoch) || !validToken(fields.semanticEntityToken) ||
          !validToken(fields.requestActionToken) || !validToken(fields.projectionToken) ||
          !PROJECTION_MODE_SET[fields.mode] || !CURRENTNESS_STATE_SET[fields.currentness] ||
          !RESULT_STATE_SET[fields.result]) {
        return null;
      }

      var body = null;
      if (fields.mode === 'folder') {
        body = parseFolderBody(fields.body, fields.currentness, fields.result);
      } else if (fields.mode === 'reading') {
        body = parseReadingBody(fields.body, fields.currentness, fields.result);
      } else if (fields.mode === 'ask') {
        body = parseAskBody(fields.body, fields.currentness, fields.result);
      } else if (fields.mode === 'answer') {
        body = parseAnswerBody(fields.body, fields.currentness, fields.result);
      } else {
        var closed = dataValues(fields.body, ['reason']);
        if (!closed || !CLOSED_REASON_SET[closed.reason] || fields.currentness !== 'closed' ||
            fields.result !== 'closed') {
          return null;
        }
        body = frozenRecord([['reason', closed.reason]]);
      }
      if (!body) return null;

      var output = frozenRecord([
        ['version', VERSION],
        ['generation', fields.generation],
        ['exactOrigin', fields.exactOrigin],
        ['profileVersion', fields.profileVersion],
        ['contextEpoch', fields.contextEpoch],
        ['semanticEntityToken', fields.semanticEntityToken],
        ['requestActionToken', fields.requestActionToken],
        ['projectionToken', fields.projectionToken],
        ['mode', fields.mode],
        ['currentness', fields.currentness],
        ['result', fields.result],
        ['body', body]
      ]);
      var serialized = JSON.stringify(output);
      if (typeof serialized !== 'string' || utf8Length(serialized) > LIMITS.MAX_SERIALIZED_BYTES) {
        return null;
      }
      return output;
    } catch (_error) {
      return null;
    }
  }

  var api = Object.freeze({
    CLOSED_REASONS: CLOSED_REASONS,
    CONSEQUENCE_STATES: CONSEQUENCE_STATES,
    CURRENTNESS_STATES: CURRENTNESS_STATES,
    DATE_STATES: DATE_STATES,
    DATE_TYPES: DATE_TYPES,
    EMPTY_STATES: EMPTY_STATES,
    EVIDENCE_ROLES: EVIDENCE_ROLES,
    FACT_TYPES: FACT_TYPES,
    FOLDER_GOVERNING_STATES: FOLDER_GOVERNING_STATES,
    GAP_PRIORITIES: GAP_PRIORITIES,
    GAP_TYPES: GAP_TYPES,
    GOVERNING_ACTION_STATES: GOVERNING_ACTION_STATES,
    INDEX_STATES: INDEX_STATES,
    MANIFEST_STATES: MANIFEST_STATES,
    MEMO_EVIDENCE_STATES: MEMO_EVIDENCE_STATES,
    MEMO_REQUIREMENT_STATES: MEMO_REQUIREMENT_STATES,
    NOTIFICATION_DELIVERY_STATES: NOTIFICATION_DELIVERY_STATES,
    OWNER_STATES: OWNER_STATES,
    POLICY_DOCUMENT_STATES: POLICY_DOCUMENT_STATES,
    PROJECTION_MODES: PROJECTION_MODES,
    READING_STATES: READING_STATES,
    RESULT_STATES: RESULT_STATES,
    SOURCE_STATES: SOURCE_STATES,
    TRUST_STATES: TRUST_STATES,
    LIMITS: LIMITS,
    VERSION: VERSION,
    parseProjection: parseProjection
  });

  global.FsbSkopeoHudSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
