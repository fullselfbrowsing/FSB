(function(global) {
  'use strict';

  var VERSION = 'skopeo-ask/1';
  var ANSWER_OUTCOMES = Object.freeze(['answered', 'review-required', 'abstained']);
  var CLEARANCE_STATES = Object.freeze(['blocked', 'cleared', 'not-applicable']);
  var EVIDENCE_ROLES = Object.freeze(['governing', 'history']);
  var TRUST_STATES = Object.freeze(['accepted', 'extracted', 'ambiguous', 'review-required']);
  var CONFLICT_TYPES = Object.freeze(['governing-conflict', 'source-conflict']);
  var GAP_TYPES = Object.freeze([
    'incomplete-evidence',
    'source-inaccessible',
    'source-unreadable',
    'index-incomplete',
    'governing-review-required',
    'document-10-missing',
    'document-10-inaccessible',
    'memo-missing',
    'memo-inaccessible'
  ]);
  var POLICY_REASON_CODES = Object.freeze([
    'document-10-unreviewed',
    'document-10-missing',
    'document-10-inaccessible',
    'document-10-stale',
    'governing-conflict',
    'memo-missing',
    'memo-inaccessible',
    'memo-incomplete'
  ]);
  var DOCUMENT_STATES = Object.freeze(['current', 'missing', 'inaccessible', 'stale']);
  var MEMO_STATES = Object.freeze(['on-file', 'proven-missing', 'inaccessible', 'incomplete']);
  var CLASSIFICATIONS = Object.freeze(['routine', 'complex']);

  var LIMITS = Object.freeze({
    MAX_QUESTION_SCALARS: 2000,
    MAX_CONCLUSION_SCALARS: 1200,
    MAX_EXPLANATION_SCALARS: 512,
    MAX_CLAIM_SCALARS: 512,
    MAX_VALUE_SCALARS: 512,
    MAX_CITATION_LABEL_SCALARS: 256,
    MAX_ACTION_TOKEN_SCALARS: 192,
    MAX_HANDLE_SCALARS: 128,
    MAX_GOVERNING: 8,
    MAX_HISTORY: 6,
    MAX_CONFLICTS: 8,
    MAX_GAPS: 8,
    MAX_SOURCES: 12,
    MAX_HANDLES_PER_CLAIM: 8,
    MAX_CLAIMS: 16,
    MAX_SERIALIZED_BYTES: 64 * 1024
  });

  var ANSWER_OUTCOME_SET = makeSet(ANSWER_OUTCOMES);
  var CLEARANCE_STATE_SET = makeSet(CLEARANCE_STATES);
  var EVIDENCE_ROLE_SET = makeSet(EVIDENCE_ROLES);
  var TRUST_STATE_SET = makeSet(TRUST_STATES);
  var CONFLICT_TYPE_SET = makeSet(CONFLICT_TYPES);
  var GAP_TYPE_SET = makeSet(GAP_TYPES);
  var POLICY_REASON_SET = makeSet(POLICY_REASON_CODES);
  var DOCUMENT_STATE_SET = makeSet(DOCUMENT_STATES);
  var MEMO_STATE_SET = makeSet(MEMO_STATES);
  var CLASSIFICATION_SET = makeSet(CLASSIFICATIONS);

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
      var keys = Reflect.ownKeys(value);
      if (keys.length !== expectedKeys.length || keys.some(function(key) {
        return typeof key !== 'string';
      })) {
        return null;
      }
      var actual = keys.slice().sort();
      var expected = expectedKeys.slice().sort();
      for (var index = 0; index < actual.length; index += 1) {
        if (actual[index] !== expected[index]) return null;
      }
      var output = Object.create(null);
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var key = keys[keyIndex];
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

  function scalarLength(value) {
    if (typeof value !== 'string') return -1;
    var count = 0;
    for (var index = 0; index < value.length; index += 1) {
      var unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        if (index + 1 >= value.length) return -1;
        var next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff) return -1;
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        return -1;
      }
      count += 1;
    }
    return count;
  }

  function validText(value, maximum, allowMarkup) {
    var length = scalarLength(value);
    return length > 0 && length <= maximum &&
      !/[\u0000-\u001f\u007f\u0080-\u009f\u202a-\u202e\u2066-\u2069]/.test(value) &&
      (allowMarkup === true || !/[<>]/.test(value));
  }

  function validTrimmedText(value, maximum) {
    return validText(value, maximum, false) && value === value.trim();
  }

  function validOpaque(value, maximum) {
    return validTrimmedText(value, maximum) && !/\s/.test(value) &&
      !/(?:https?|file|chrome):\/\//i.test(value);
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

  function withinByteLimit(value) {
    try {
      var serialized = JSON.stringify(value);
      return typeof serialized === 'string' && utf8Length(serialized) <= LIMITS.MAX_SERIALIZED_BYTES;
    } catch (_error) {
      return false;
    }
  }

  function parseQuestion(value) {
    try {
      var fields = dataValues(value, ['text']);
      if (!fields || typeof fields.text !== 'string') return null;
      var text = fields.text.trim();
      if (!validTrimmedText(text, LIMITS.MAX_QUESTION_SCALARS)) return null;
      return frozenRecord([['text', text]]);
    } catch (_error) {
      return null;
    }
  }

  function parseTypedDetail(value, typeSet, maximum) {
    var fields = dataValues(value, ['type', 'detail']);
    if (!fields || !typeSet[fields.type] || !validTrimmedText(fields.detail, maximum)) return null;
    return frozenRecord([['type', fields.type], ['detail', fields.detail]]);
  }

  function parseTypedDetailArray(value, maximum, typeSet) {
    var items = dataArrayValues(value, maximum);
    if (!items) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var parsed = parseTypedDetail(items[index], typeSet, LIMITS.MAX_EXPLANATION_SCALARS);
      var key = parsed && parsed.type + '\u0000' + parsed.detail;
      if (!parsed || own(seen, key)) return null;
      seen[key] = true;
      output.push(parsed);
    }
    return frozenArray(output);
  }

  function parseIssuedHandles(value) {
    var items = dataArrayValues(value, LIMITS.MAX_CLAIMS * LIMITS.MAX_HANDLES_PER_CLAIM);
    if (!items) return null;
    var output = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      if (!validOpaque(items[index], LIMITS.MAX_HANDLE_SCALARS) || own(output, items[index])) return null;
      output[items[index]] = true;
    }
    return output;
  }

  function parseCandidateClaim(value, issued, usedHandles) {
    var fields = dataValues(value, ['text', 'evidenceHandles']);
    if (!fields || !validTrimmedText(fields.text, LIMITS.MAX_CLAIM_SCALARS)) return null;
    var handles = dataArrayValues(fields.evidenceHandles, LIMITS.MAX_HANDLES_PER_CLAIM);
    if (!handles || handles.length === 0) return null;
    var output = [];
    for (var index = 0; index < handles.length; index += 1) {
      var handle = handles[index];
      if (!validOpaque(handle, LIMITS.MAX_HANDLE_SCALARS) || !own(issued, handle) ||
          own(usedHandles, handle)) {
        return null;
      }
      usedHandles[handle] = true;
      output.push(handle);
    }
    return frozenRecord([
      ['text', fields.text],
      ['evidenceHandles', frozenArray(output)]
    ]);
  }

  function parseProviderCandidate(value, issuedHandles) {
    try {
      var fields = dataValues(value, ['conclusion', 'claims', 'conflicts', 'gaps']);
      var issued = parseIssuedHandles(issuedHandles);
      if (!fields || !issued ||
          !(fields.conclusion === null ||
            validTrimmedText(fields.conclusion, LIMITS.MAX_CONCLUSION_SCALARS))) {
        return null;
      }
      var claimItems = dataArrayValues(fields.claims, LIMITS.MAX_CLAIMS);
      if (!claimItems) return null;
      var claims = [];
      var usedHandles = Object.create(null);
      for (var index = 0; index < claimItems.length; index += 1) {
        var claim = parseCandidateClaim(claimItems[index], issued, usedHandles);
        if (!claim) return null;
        claims.push(claim);
      }
      if (fields.conclusion !== null && claims.length === 0) return null;
      var conflicts = parseTypedDetailArray(fields.conflicts, LIMITS.MAX_CONFLICTS, CONFLICT_TYPE_SET);
      var gaps = parseTypedDetailArray(fields.gaps, LIMITS.MAX_GAPS, GAP_TYPE_SET);
      if (!conflicts || !gaps) return null;
      var output = frozenRecord([
        ['conclusion', fields.conclusion],
        ['claims', frozenArray(claims)],
        ['conflicts', conflicts],
        ['gaps', gaps]
      ]);
      return withinByteLimit(output) ? output : null;
    } catch (_error) {
      return null;
    }
  }

  function parseAuthority(value) {
    var fields = dataValues(value, [
      'accountKey', 'corpusKey', 'agreementKey', 'sourceSetDigest', 'revisionDigest'
    ]);
    if (!fields || !validOpaque(fields.accountKey, 256) || !validOpaque(fields.corpusKey, 256) ||
        !validOpaque(fields.agreementKey, 256) || !validOpaque(fields.sourceSetDigest, 256) ||
        !validOpaque(fields.revisionDigest, 256)) {
      return null;
    }
    return frozenRecord([
      ['accountKey', fields.accountKey],
      ['corpusKey', fields.corpusKey],
      ['agreementKey', fields.agreementKey],
      ['sourceSetDigest', fields.sourceSetDigest],
      ['revisionDigest', fields.revisionDigest]
    ]);
  }

  function parseDocument10(value) {
    var fields = dataValues(value, ['configuredFileKey', 'currentRevisionKey', 'state']);
    if (!fields || !DOCUMENT_STATE_SET[fields.state] ||
        !validOpaque(fields.configuredFileKey, 256)) {
      return null;
    }
    if (fields.state === 'current') {
      if (!validOpaque(fields.currentRevisionKey, 256)) return null;
    } else if (fields.currentRevisionKey !== null) {
      return null;
    }
    return frozenRecord([
      ['configuredFileKey', fields.configuredFileKey],
      ['currentRevisionKey', fields.currentRevisionKey],
      ['state', fields.state]
    ]);
  }

  function parseMemoProof(value) {
    var fields = dataValues(value, ['state', 'complete']);
    if (!fields || !MEMO_STATE_SET[fields.state] || typeof fields.complete !== 'boolean') return null;
    if ((fields.state === 'on-file' || fields.state === 'proven-missing') && !fields.complete) return null;
    if ((fields.state === 'inaccessible' || fields.state === 'incomplete') && fields.complete) return null;
    return frozenRecord([['state', fields.state], ['complete', fields.complete]]);
  }

  function parsePolicyInput(value) {
    try {
      var fields = dataValues(value, [
        'decisionKind', 'authority', 'document10', 'classification', 'memoProof',
        'governingConflict'
      ]);
      if (!fields || !validOpaque(fields.decisionKind, 128) ||
          !CLASSIFICATION_SET[fields.classification] || typeof fields.governingConflict !== 'boolean') {
        return null;
      }
      var authority = parseAuthority(fields.authority);
      var document10 = parseDocument10(fields.document10);
      var memoProof = fields.memoProof === null ? null : parseMemoProof(fields.memoProof);
      if (!authority || !document10 || (fields.memoProof !== null && !memoProof) ||
          (fields.classification === 'routine' && fields.memoProof !== null) ||
          (fields.classification === 'complex' && !memoProof)) {
        return null;
      }
      var output = frozenRecord([
        ['decisionKind', fields.decisionKind],
        ['authority', authority],
        ['document10', document10],
        ['classification', fields.classification],
        ['memoProof', memoProof],
        ['governingConflict', fields.governingConflict]
      ]);
      return withinByteLimit(output) ? output : null;
    } catch (_error) {
      return null;
    }
  }

  function parseDocumentResult(value) {
    var fields = dataValues(value, ['state', 'reviewed']);
    if (!fields || !DOCUMENT_STATE_SET[fields.state] || typeof fields.reviewed !== 'boolean' ||
        (fields.state !== 'current' && fields.reviewed)) {
      return null;
    }
    return frozenRecord([['state', fields.state], ['reviewed', fields.reviewed]]);
  }

  function parseMemoResult(value) {
    var fields = dataValues(value, ['state', 'satisfied']);
    if (!fields || !MEMO_STATE_SET[fields.state] || typeof fields.satisfied !== 'boolean' ||
        (fields.satisfied !== (fields.state === 'on-file'))) {
      return null;
    }
    return frozenRecord([['state', fields.state], ['satisfied', fields.satisfied]]);
  }

  function parseReasons(value) {
    var items = dataArrayValues(value, POLICY_REASON_CODES.length);
    if (!items) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      if (!POLICY_REASON_SET[items[index]] || own(seen, items[index])) return null;
      seen[items[index]] = true;
      output.push(items[index]);
    }
    return frozenArray(output);
  }

  function parsePolicyResult(value) {
    try {
      if (!isPlainRecord(value)) return null;
      var hasMemo = own(value, 'memo');
      var keys = ['clearance', 'applicable', 'decisionDigest', 'reasons', 'document10'];
      if (hasMemo) keys.push('memo');
      var fields = dataValues(value, keys);
      if (!fields || !CLEARANCE_STATE_SET[fields.clearance] ||
          typeof fields.applicable !== 'boolean' || !validOpaque(fields.decisionDigest, 256)) {
        return null;
      }
      var reasons = parseReasons(fields.reasons);
      var document10 = fields.document10 === null ? null : parseDocumentResult(fields.document10);
      var memo = hasMemo ? parseMemoResult(fields.memo) : null;
      if (!reasons || (fields.document10 !== null && !document10) || (hasMemo && !memo)) return null;
      if (fields.clearance === 'not-applicable') {
        if (fields.applicable || reasons.length !== 0 || document10 !== null || hasMemo) return null;
      } else {
        if (!fields.applicable || !document10 ||
            (fields.clearance === 'cleared' && reasons.length !== 0) ||
            (fields.clearance === 'blocked' && reasons.length === 0)) {
          return null;
        }
      }
      var entries = [
        ['clearance', fields.clearance],
        ['applicable', fields.applicable],
        ['decisionDigest', fields.decisionDigest],
        ['reasons', reasons],
        ['document10', document10]
      ];
      if (hasMemo) entries.push(['memo', memo]);
      var output = frozenRecord(entries);
      return withinByteLimit(output) ? output : null;
    } catch (_error) {
      return null;
    }
  }

  function parseTrust(value) {
    var fields = dataValues(value, ['state', 'explanation']);
    if (!fields || !TRUST_STATE_SET[fields.state] ||
        !validTrimmedText(fields.explanation, LIMITS.MAX_EXPLANATION_SCALARS)) {
      return null;
    }
    return frozenRecord([['state', fields.state], ['explanation', fields.explanation]]);
  }

  function parseCitation(value) {
    var fields = dataValues(value, ['label', 'actionToken']);
    if (!fields || !validTrimmedText(fields.label, LIMITS.MAX_CITATION_LABEL_SCALARS) ||
        !validOpaque(fields.actionToken, LIMITS.MAX_ACTION_TOKEN_SCALARS)) {
      return null;
    }
    return frozenRecord([['label', fields.label], ['actionToken', fields.actionToken]]);
  }

  function parseEvidence(value) {
    var fields = dataValues(value, ['claim', 'value', 'trustState', 'citation']);
    if (!fields || !validTrimmedText(fields.claim, LIMITS.MAX_CLAIM_SCALARS) ||
        !validTrimmedText(fields.value, LIMITS.MAX_VALUE_SCALARS) ||
        !TRUST_STATE_SET[fields.trustState]) {
      return null;
    }
    var citation = parseCitation(fields.citation);
    if (!citation) return null;
    return frozenRecord([
      ['claim', fields.claim],
      ['value', fields.value],
      ['trustState', fields.trustState],
      ['citation', citation]
    ]);
  }

  function parseEvidenceArray(value, maximum, tokens) {
    var items = dataArrayValues(value, maximum);
    if (!items) return null;
    var output = [];
    for (var index = 0; index < items.length; index += 1) {
      var parsed = parseEvidence(items[index]);
      if (!parsed || own(tokens, parsed.citation.actionToken)) return null;
      tokens[parsed.citation.actionToken] = true;
      output.push(parsed);
    }
    return frozenArray(output);
  }

  function parseSources(value) {
    var items = dataArrayValues(value, LIMITS.MAX_SOURCES);
    if (!items) return null;
    var output = [];
    var tokens = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var fields = dataValues(items[index], ['label', 'evidenceRole', 'actionToken']);
      if (!fields || !validTrimmedText(fields.label, LIMITS.MAX_CITATION_LABEL_SCALARS) ||
          !EVIDENCE_ROLE_SET[fields.evidenceRole] ||
          !validOpaque(fields.actionToken, LIMITS.MAX_ACTION_TOKEN_SCALARS) ||
          own(tokens, fields.actionToken)) {
        return null;
      }
      tokens[fields.actionToken] = fields.evidenceRole;
      output.push(frozenRecord([
        ['label', fields.label],
        ['evidenceRole', fields.evidenceRole],
        ['actionToken', fields.actionToken]
      ]));
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['tokens', Object.freeze(tokens)]
    ]);
  }

  function parseCitedAnswer(value) {
    try {
      var fields = dataValues(value, [
        'outcome', 'evidenceComplete', 'conclusion', 'trust', 'governingEvidence',
        'historyEvidence', 'conflicts', 'gaps', 'sources', 'sourceOverflow'
      ]);
      if (!fields || !ANSWER_OUTCOME_SET[fields.outcome] ||
          typeof fields.evidenceComplete !== 'boolean' ||
          !(fields.conclusion === null ||
            validTrimmedText(fields.conclusion, LIMITS.MAX_CONCLUSION_SCALARS)) ||
          !Number.isSafeInteger(fields.sourceOverflow) || fields.sourceOverflow < 0) {
        return null;
      }
      var trust = parseTrust(fields.trust);
      var tokens = Object.create(null);
      var governing = parseEvidenceArray(fields.governingEvidence, LIMITS.MAX_GOVERNING, tokens);
      var history = parseEvidenceArray(fields.historyEvidence, LIMITS.MAX_HISTORY, tokens);
      var conflicts = parseTypedDetailArray(fields.conflicts, LIMITS.MAX_CONFLICTS, CONFLICT_TYPE_SET);
      var gaps = parseTypedDetailArray(fields.gaps, LIMITS.MAX_GAPS, GAP_TYPE_SET);
      var sources = parseSources(fields.sources);
      if (!trust || !governing || !history || !conflicts || !gaps || !sources ||
          (fields.sourceOverflow > 0 && sources.items.length !== LIMITS.MAX_SOURCES)) {
        return null;
      }
      if (!fields.evidenceComplete || fields.outcome === 'abstained') {
        if (fields.outcome !== 'abstained' || fields.conclusion !== null ||
            (conflicts.length === 0 && gaps.length === 0)) {
          return null;
        }
      } else if (fields.conclusion === null || governing.length === 0) {
        return null;
      }
      for (var index = 0; index < governing.length; index += 1) {
        if (sources.tokens[governing[index].citation.actionToken] !== 'governing' &&
            fields.sourceOverflow === 0) {
          return null;
        }
      }
      for (var historyIndex = 0; historyIndex < history.length; historyIndex += 1) {
        var role = sources.tokens[history[historyIndex].citation.actionToken];
        if (role && role !== 'history') return null;
        if (!role && fields.sourceOverflow === 0) return null;
      }
      var output = frozenRecord([
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
      return withinByteLimit(output) ? output : null;
    } catch (_error) {
      return null;
    }
  }

  var api = Object.freeze({
    ANSWER_OUTCOMES: ANSWER_OUTCOMES,
    CLEARANCE_STATES: CLEARANCE_STATES,
    EVIDENCE_ROLES: EVIDENCE_ROLES,
    TRUST_STATES: TRUST_STATES,
    CONFLICT_TYPES: CONFLICT_TYPES,
    GAP_TYPES: GAP_TYPES,
    POLICY_REASON_CODES: POLICY_REASON_CODES,
    DOCUMENT_STATES: DOCUMENT_STATES,
    MEMO_STATES: MEMO_STATES,
    CLASSIFICATIONS: CLASSIFICATIONS,
    LIMITS: LIMITS,
    VERSION: VERSION,
    parseQuestion: parseQuestion,
    parseProviderCandidate: parseProviderCandidate,
    parsePolicyInput: parsePolicyInput,
    parsePolicyResult: parsePolicyResult,
    parseCitedAnswer: parseCitedAnswer
  });

  global.FsbSkopeoAskSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
