(function(global) {
  'use strict';

  var VERSION = 'skopeo-truth-schema/1';
  var IDENTITY_VERSION = 'skopeo-truth-identity/1';
  var CANDIDATE_SCHEMA_VERSION = 1;
  var PROMPT_VERSION = 'skopeo-truth-extraction-prompt/1';
  var ADJUDICATION_VERSION = 'skopeo-lineage-adjudicator/1';
  var DEADLINE_RULE_VERSION = 'skopeo-deadline-rules/1';
  var CALENDAR_VERSION = 'skopeo-business-calendar/1';
  var SNAPSHOT_VERSION = 'skopeo-truth-snapshot/1';
  var GRAPH_SCHEMA_VERSION = 'skopeo-graph-schema/1';

  var MAX_SOURCES = 32;
  var MAX_CANDIDATES_PER_BATCH = 128;
  var MAX_CANDIDATES_PER_SOURCE_GENERATION = 1024;
  var MAX_EVIDENCE_LOCATORS_PER_CANDIDATE = 4;
  var MAX_CITATIONS_PER_ASSERTION = 4;
  var MAX_GRAPH_RECORD_VERSIONS = 4096;
  var MAX_RELATION_VERSIONS = 16384;
  var MAX_ASSERTIONS_PER_FAMILY = 2048;
  var MAX_FAMILY_CITATIONS = 2048;
  var MAX_CONFLICTS_PER_FAMILY = 512;
  var MAX_RULES_PER_FAMILY = 512;
  var MAX_BLOCKER_CODES_PER_RESULT = 32;
  var MAX_HOLIDAYS_PER_CALENDAR = 4096;
  var MAX_DAY_OFFSET_MAGNITUDE = 36600;
  var MAX_FAMILY_SNAPSHOT_BYTES = 8 * 1024 * 1024;
  var MAX_MINIMIZED_RESULT_BYTES = 64 * 1024;

  var MAX_CANONICAL_DEPTH = 24;
  var MAX_CANONICAL_KEYS = 64;
  var MAX_CANONICAL_ARRAY = MAX_RELATION_VERSIONS;
  var MAX_CANONICAL_STRING = 4096;
  var MAX_CANONICAL_NODES = 262144;
  var MAX_CANONICAL_OUTPUT = MAX_FAMILY_SNAPSHOT_BYTES;
  var MAX_OPAQUE = 1024;
  var MAX_HANDLE = 128;
  var MAX_SOURCE_ID = 256;
  var MAX_QUALIFIER = 256;
  var MAX_ADDRESS_LINES = 6;
  var MAX_PAGES = 8192;

  var ASSERTION_TYPES = Object.freeze([
    'signed-date',
    'effective-date',
    'expiration-date',
    'termination-date',
    'renewal',
    'notice-window',
    'notice-deadline',
    'delivery-method',
    'written-address'
  ]);
  var TRUST_STATES = Object.freeze([
    'extracted',
    'inferred',
    'ambiguous',
    'unreadable',
    'review-required'
  ]);
  var SOURCE_STATES = Object.freeze([
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ]);
  var EXECUTION_STATES = Object.freeze(['executed', 'unsigned', 'unknown']);
  var TEMPORAL_STATES = Object.freeze([
    'future',
    'effective',
    'expired',
    'terminated',
    'unknown'
  ]);
  var LINEAGE_ROLES = Object.freeze([
    'base',
    'partial-amendment',
    'full-replacement',
    'historical',
    'unclassified'
  ]);
  var GOVERNANCE_CONCLUSIONS = Object.freeze([
    'governing',
    'partially-governing',
    'superseded',
    'non-governing',
    'review-required'
  ]);
  var AXIS_REASON_CODES = Object.freeze({
    execution: Object.freeze([
      'executed-evidence',
      'unsigned-evidence',
      'execution-evidence-missing'
    ]),
    temporal: Object.freeze([
      'future-effective-date',
      'effective-as-of-date',
      'expired-as-of-date',
      'terminated-as-of-date',
      'temporal-evidence-incomplete'
    ]),
    lineageRole: Object.freeze([
      'lineage-base-evidence',
      'lineage-partial-amendment-evidence',
      'lineage-full-replacement-evidence',
      'lineage-historical-evidence',
      'lineage-evidence-incomplete'
    ]),
    governance: Object.freeze([
      'governing-path-accepted',
      'partial-overlay-accepted',
      'explicitly-superseded',
      'non-governing-evidence',
      'governance-review-required'
    ])
  });
  var DEADLINE_OPERATORS = Object.freeze([
    'add-calendar-days',
    'subtract-calendar-days',
    'add-business-days',
    'subtract-business-days'
  ]);
  var BLOCKER_CODES = Object.freeze([
    'boundary-ambiguous',
    'business-calendar-missing',
    'citation-stale',
    'consequence-missing',
    'evaluation-context-mismatch',
    'evaluation-context-missing',
    'evaluation-context-stale',
    'exact-set-incomplete',
    'exact-set-over-cap',
    'fact-conflict',
    'fact-missing',
    'input-not-exact',
    'lineage-not-current',
    'lineage-review-required',
    'rule-version-stale',
    'snapshot-stale',
    'source-unavailable',
    'source-unreadable',
    'timezone-missing',
    'unsupported-business-day-rule',
    'unsupported-rule'
  ]);

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

  var ASSERTION_TYPE_SET = makeSet(ASSERTION_TYPES);
  var TRUST_STATE_SET = makeSet(TRUST_STATES);
  var SOURCE_STATE_SET = makeSet(SOURCE_STATES);
  var EXECUTION_STATE_SET = makeSet(EXECUTION_STATES);
  var TEMPORAL_STATE_SET = makeSet(TEMPORAL_STATES);
  var LINEAGE_ROLE_SET = makeSet(LINEAGE_ROLES);
  var GOVERNANCE_CONCLUSION_SET = makeSet(GOVERNANCE_CONCLUSIONS);
  var DEADLINE_OPERATOR_SET = makeSet(DEADLINE_OPERATORS);
  var BLOCKER_CODE_SET = makeSet(BLOCKER_CODES);
  var EXECUTION_REASON_SET = makeSet(AXIS_REASON_CODES.execution);
  var TEMPORAL_REASON_SET = makeSet(AXIS_REASON_CODES.temporal);
  var LINEAGE_REASON_SET = makeSet(AXIS_REASON_CODES.lineageRole);
  var GOVERNANCE_REASON_SET = makeSet(AXIS_REASON_CODES.governance);
  var CIVIL_ASSERTION_SET = makeSet([
    'signed-date',
    'effective-date',
    'expiration-date',
    'termination-date',
    'notice-deadline'
  ]);
  var CALENDAR_OPERATOR_SET = makeSet(['add-calendar-days', 'subtract-calendar-days']);
  var BUSINESS_OPERATOR_SET = makeSet(['add-business-days', 'subtract-business-days']);
  var RENEWAL_MODE_SET = makeSet(['automatic', 'manual', 'none-stated']);
  var RENEWAL_UNIT_SET = makeSet(['calendar-days', 'business-days', 'months', 'years']);
  var RENEWAL_ANCHOR_SET = makeSet(['expiration-date', 'termination-date']);
  var NOTICE_UNIT_SET = makeSet(['calendar-days', 'business-days']);
  var NOTICE_RELATION_SET = makeSet(['before', 'after']);
  var NOTICE_ANCHOR_SET = makeSet(['expiration-date', 'termination-date', 'renewal']);
  var BOUNDARY_SET = makeSet(['inclusive', 'exclusive']);
  var DELIVERY_METHOD_SET = makeSet([
    'certified-mail',
    'registered-mail',
    'first-class-mail',
    'courier',
    'personal-delivery',
    'email',
    'other-stated'
  ]);
  var LINEAGE_SCOPE_SET = makeSet(['document', 'clause']);
  var OVERLAY_EFFECT_SET = makeSet(['replace', 'add', 'delete']);
  var BASIS_SET = makeSet(['direct', 'derived']);
  var PAGE_CATEGORY_SET = makeSet([
    'assertions',
    'citations',
    'conflicts',
    'deadlineResults',
    'deadlineRules'
  ]);

  var LIMITS;

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

  function dataArrayValues(value, maximum, minimum) {
    if (!Array.isArray(value) || value.length > maximum || value.length < (minimum || 0)) {
      return null;
    }
    try {
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

  function validBoundedText(value, maximum, minimum) {
    return typeof value === 'string' && value.length >= (minimum || 1) &&
      value.length <= maximum && validUnicode(value) &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function validOpaque(value, maximum) {
    return validBoundedText(value, maximum || MAX_OPAQUE, 1);
  }

  function validSourceFileId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_SOURCE_ID &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validHandle(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_HANDLE &&
      /^[A-Za-z0-9._:-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validAuthorizedSetDigest(value) {
    return validDigestId(value, 'sgx1:');
  }

  function validDigestId(value, prefixes) {
    if (typeof value !== 'string') return false;
    var list = Array.isArray(prefixes) ? prefixes : [prefixes];
    for (var index = 0; index < list.length; index += 1) {
      if (value.slice(0, list[index].length) === list[index] &&
          /^[0-9a-f]{64}$/.test(value.slice(list[index].length))) {
        return true;
      }
    }
    return false;
  }

  function validVersionId(value) {
    return validOpaque(value, 256);
  }

  function validInteger(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
  }

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  }

  function validCivilDate(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
      return false;
    }
    var year = Number(value.slice(0, 4));
    var month = Number(value.slice(5, 7));
    var day = Number(value.slice(8, 10));
    return year >= 1 && year <= 9999 && month >= 1 && month <= 12 &&
      day >= 1 && day <= daysInMonth(year, month);
  }

  function validTimezone(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      (value === 'UTC' ||
        /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value));
  }

  function quoteString(value) {
    var output = '"';
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      var character = value.charAt(index);
      if (character === '"') output += '\\"';
      else if (character === '\\') output += '\\\\';
      else if (character === '\b') output += '\\b';
      else if (character === '\f') output += '\\f';
      else if (character === '\n') output += '\\n';
      else if (character === '\r') output += '\\r';
      else if (character === '\t') output += '\\t';
      else if (code < 0x20 || code === 0x2028 || code === 0x2029) {
        output += '\\u' + code.toString(16).padStart(4, '0');
      } else {
        output += character;
      }
    }
    return output + '"';
  }

  function canonicalValue(value, ancestors, state, depth) {
    if (depth > MAX_CANONICAL_DEPTH || state.nodes >= MAX_CANONICAL_NODES) return null;
    state.nodes += 1;
    if (value === null) return 'null';
    if (typeof value === 'string') {
      return value.length <= MAX_CANONICAL_STRING && validUnicode(value)
        ? quoteString(value)
        : null;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return Object.is(value, -0) ? '0' : String(value);
    }
    if (typeof value !== 'object' || ancestors.has(value)) return null;
    ancestors.add(value);
    var output = null;
    if (Array.isArray(value)) {
      var items = dataArrayValues(value, MAX_CANONICAL_ARRAY, 0);
      if (items) {
        var itemOutput = [];
        for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
          var item = canonicalValue(items[itemIndex], ancestors, state, depth + 1);
          if (item === null) {
            itemOutput = null;
            break;
          }
          itemOutput.push(item);
        }
        if (itemOutput) output = '[' + itemOutput.join(',') + ']';
      }
    } else if (isPlainRecord(value)) {
      try {
        var keys = Reflect.ownKeys(value);
        if (keys.length <= MAX_CANONICAL_KEYS && !keys.some(function(key) {
          return typeof key !== 'string' || key.length > MAX_CANONICAL_STRING;
        })) {
          keys.sort();
          var members = [];
          for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
            var key = keys[keyIndex];
            var descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) {
              members = null;
              break;
            }
            var child = canonicalValue(descriptor.value, ancestors, state, depth + 1);
            if (child === null) {
              members = null;
              break;
            }
            members.push(quoteString(key) + ':' + child);
          }
          if (members) output = '{' + members.join(',') + '}';
        }
      } catch (_error) {
        output = null;
      }
    }
    ancestors.delete(value);
    return output && output.length <= MAX_CANONICAL_OUTPUT ? output : null;
  }

  function canonicalize(value) {
    try {
      return canonicalValue(value, new Set(), { nodes: 0 }, 0);
    } catch (_error) {
      return null;
    }
  }

  function descriptorSafeTree(value) {
    return canonicalize(value) !== null;
  }

  function digestHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var output = '';
    for (var index = 0; index < bytes.length; index += 1) {
      output += bytes[index].toString(16).padStart(2, '0');
    }
    return output;
  }

  async function sha256Text(value) {
    var cryptoObject = global && global.crypto;
    var Encoder = global && global.TextEncoder;
    if (typeof value !== 'string' || !cryptoObject || !cryptoObject.subtle ||
        typeof cryptoObject.subtle.digest !== 'function' || typeof Encoder !== 'function') {
      return null;
    }
    try {
      var digest = await cryptoObject.subtle.digest('SHA-256', new Encoder().encode(value));
      var hex = digestHex(digest);
      return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
    } catch (_error) {
      return null;
    }
  }

  async function sha256Hex(value) {
    var canonical = canonicalize(value);
    if (canonical === null) return null;
    var hex = await sha256Text(canonical);
    return hex === null ? null : 'sha256:' + hex;
  }

  function encodeTuple(prefix, values) {
    var output = prefix;
    for (var index = 0; index < values.length; index += 1) {
      var value = String(values[index]);
      output += value.length + ':' + value;
    }
    return output;
  }

  async function digestTuple(outputPrefix, tuplePrefix, values) {
    var hex = await sha256Text(encodeTuple(tuplePrefix, values));
    return hex === null ? null : outputPrefix + hex;
  }

  function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function isCanonicalStringArray(values, allowDuplicates) {
    for (var index = 0; index < values.length; index += 1) {
      if (index > 0) {
        var comparison = compareText(values[index - 1], values[index]);
        if (comparison > 0 || (!allowDuplicates && comparison === 0)) return false;
      }
    }
    return true;
  }

  function parseIdArray(value, prefixes, maximum, minimum, allowDuplicates) {
    var values = dataArrayValues(value, maximum, minimum || 0);
    if (!values || values.some(function(item) {
      return !validDigestId(item, prefixes);
    }) || !isCanonicalStringArray(values, !!allowDuplicates)) {
      return null;
    }
    return frozenArray(values);
  }

  function parseOpaqueArray(value, maximum, minimum) {
    var values = dataArrayValues(value, maximum, minimum || 0);
    if (!values || values.some(function(item) {
      return !validOpaque(item, 256);
    }) || !isCanonicalStringArray(values, false)) {
      return null;
    }
    return frozenArray(values);
  }

  function mapBy(items, key) {
    var output = Object.create(null);
    for (var index = 0; index < items.length; index += 1) {
      var value = items[index][key];
      if (own(output, value)) return null;
      output[value] = items[index];
    }
    return output;
  }

  function registryContains(registry, id) {
    return !!registry && own(registry, id);
  }

  async function deriveGraphFragmentId(fields) {
    if (!fields || !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validFingerprint(fields.contentFingerprint)) {
      return null;
    }
    return digestTuple('sfg1:', 'fragment-generation|', [
      GRAPH_SCHEMA_VERSION,
      fields.partitionKey,
      fields.sourceFileId,
      fields.contentFingerprint
    ]);
  }

  async function deriveGraphLocatorId(fields) {
    if (!fields || !validInteger(fields.start, 0, 24000) ||
        !validInteger(fields.end, 1, 24000) || fields.end <= fields.start ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart) {
      return null;
    }
    return digestTuple('sel1:', 'evidence-locator|', [
      GRAPH_SCHEMA_VERSION,
      fields.partitionKey,
      fields.sourceFileId,
      fields.contentFingerprint,
      fields.fragmentGenerationId,
      fields.excerptId,
      String(fields.start),
      String(fields.end),
      String(fields.sourceByteStart),
      String(fields.sourceByteEnd)
    ]);
  }

  async function parseGraphLocator(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'excerptId',
      'start',
      'end',
      'sourceByteStart',
      'sourceByteEnd',
      'locatorId'
    ]);
    if (!fields || fields.schemaVersion !== GRAPH_SCHEMA_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        typeof fields.excerptId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(fields.excerptId) ||
        !validInteger(fields.start, 0, 24000) ||
        !validInteger(fields.end, 1, 24000) || fields.end <= fields.start ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart ||
        !validDigestId(fields.locatorId, 'sel1:')) {
      return null;
    }
    var expectedGeneration = await deriveGraphFragmentId(fields);
    var expectedLocator = await deriveGraphLocatorId(fields);
    if (fields.fragmentGenerationId !== expectedGeneration || fields.locatorId !== expectedLocator) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', GRAPH_SCHEMA_VERSION],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['contentFingerprint', fields.contentFingerprint],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['excerptId', fields.excerptId],
      ['start', fields.start],
      ['end', fields.end],
      ['sourceByteStart', fields.sourceByteStart],
      ['sourceByteEnd', fields.sourceByteEnd],
      ['locatorId', fields.locatorId]
    ]);
  }

  async function deriveCitationId(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'recordVersionId',
      'relationVersionId',
      'locatorId',
      'sourceByteStart',
      'sourceByteEnd'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !validDigestId(fields.recordVersionId, 'srv1:') ||
        !(fields.relationVersionId === null ||
          validDigestId(fields.relationVersionId, ['slv1:', 'scv1:'])) ||
        !validDigestId(fields.locatorId, 'sel1:') ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart) {
      return null;
    }
    return digestTuple('stc1:', 'truth-citation|', [
      fields.schemaVersion,
      fields.partitionKey,
      fields.sourceFileId,
      fields.contentFingerprint,
      fields.fragmentGenerationId,
      fields.recordVersionId,
      fields.relationVersionId === null ? 'null' : fields.relationVersionId,
      fields.locatorId,
      String(fields.sourceByteStart),
      String(fields.sourceByteEnd)
    ]);
  }

  async function parseCitation(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'recordVersionId',
      'relationVersionId',
      'locatorId',
      'sourceByteStart',
      'sourceByteEnd',
      'excerptId',
      'start',
      'end',
      'citationId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !validDigestId(fields.recordVersionId, 'srv1:') ||
        !(fields.relationVersionId === null ||
          validDigestId(fields.relationVersionId, ['slv1:', 'scv1:'])) ||
        typeof fields.excerptId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(fields.excerptId) ||
        !validInteger(fields.start, 0, 24000) ||
        !validInteger(fields.end, 1, 24000) || fields.end <= fields.start ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart ||
        !validDigestId(fields.locatorId, 'sel1:') ||
        !validDigestId(fields.citationId, 'stc1:')) {
      return null;
    }
    var expectedGeneration = await deriveGraphFragmentId(fields);
    var expectedLocator = await deriveGraphLocatorId(fields);
    var expectedCitation = await deriveCitationId({
      schemaVersion: VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint,
      fragmentGenerationId: fields.fragmentGenerationId,
      recordVersionId: fields.recordVersionId,
      relationVersionId: fields.relationVersionId,
      locatorId: fields.locatorId,
      sourceByteStart: fields.sourceByteStart,
      sourceByteEnd: fields.sourceByteEnd
    });
    if (fields.fragmentGenerationId !== expectedGeneration ||
        fields.locatorId !== expectedLocator || fields.citationId !== expectedCitation) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['contentFingerprint', fields.contentFingerprint],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['recordVersionId', fields.recordVersionId],
      ['relationVersionId', fields.relationVersionId],
      ['locatorId', fields.locatorId],
      ['sourceByteStart', fields.sourceByteStart],
      ['sourceByteEnd', fields.sourceByteEnd],
      ['excerptId', fields.excerptId],
      ['start', fields.start],
      ['end', fields.end],
      ['citationId', fields.citationId]
    ]);
  }

  async function parseCitationRegistry(value, maximum, minimum) {
    var inputs = dataArrayValues(value, maximum, minimum || 0);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var citation = await parseCitation(inputs[index]);
      if (!citation || own(seen, citation.citationId)) return null;
      seen[citation.citationId] = citation;
      output.push(citation);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byId', Object.freeze(seen)]
    ]);
  }

  async function deriveCandidateGenerationId(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'candidateSchemaVersion',
      'promptVersion',
      'providerId',
      'modelId',
      'batchOrdinal'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        fields.candidateSchemaVersion !== CANDIDATE_SCHEMA_VERSION ||
        fields.promptVersion !== PROMPT_VERSION ||
        !validOpaque(fields.providerId, 128) ||
        !validOpaque(fields.modelId, 128) ||
        !validInteger(fields.batchOrdinal, 0, MAX_CANDIDATES_PER_SOURCE_GENERATION - 1)) {
      return null;
    }
    var expectedGeneration = await deriveGraphFragmentId(fields);
    if (fields.fragmentGenerationId !== expectedGeneration) return null;
    return digestTuple('stg1:', 'truth-candidate-generation|', [
      fields.schemaVersion,
      fields.partitionKey,
      fields.sourceFileId,
      fields.contentFingerprint,
      fields.fragmentGenerationId,
      String(fields.candidateSchemaVersion),
      fields.promptVersion,
      fields.providerId,
      fields.modelId,
      String(fields.batchOrdinal)
    ]);
  }

  async function parseCandidateContext(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'candidateSchemaVersion',
      'promptVersion',
      'providerId',
      'modelId',
      'batchOrdinal',
      'documentHandles',
      'clauseHandles',
      'relationHandles',
      'calendarHandles',
      'evidenceHandles'
    ]);
    if (!fields) return null;
    var generationInput = {
      schemaVersion: fields.schemaVersion,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint,
      fragmentGenerationId: fields.fragmentGenerationId,
      candidateSchemaVersion: fields.candidateSchemaVersion,
      promptVersion: fields.promptVersion,
      providerId: fields.providerId,
      modelId: fields.modelId,
      batchOrdinal: fields.batchOrdinal
    };
    var generationId = await deriveCandidateGenerationId(generationInput);
    if (!generationId) return null;
    var documentInputs = dataArrayValues(fields.documentHandles, MAX_GRAPH_RECORD_VERSIONS, 1);
    var clauseInputs = dataArrayValues(fields.clauseHandles, MAX_GRAPH_RECORD_VERSIONS, 0);
    var relationInputs = dataArrayValues(fields.relationHandles, MAX_RELATION_VERSIONS, 0);
    var calendarInputs = dataArrayValues(fields.calendarHandles, MAX_SOURCES, 0);
    var evidenceInputs = dataArrayValues(
      fields.evidenceHandles,
      MAX_CANDIDATES_PER_SOURCE_GENERATION * MAX_EVIDENCE_LOCATORS_PER_CANDIDATE,
      1
    );
    if (!documentInputs || !clauseInputs || !relationInputs ||
        !calendarInputs || !evidenceInputs) return null;
    var documents = Object.create(null);
    var clauses = Object.create(null);
    var relations = Object.create(null);
    var calendars = Object.create(null);
    var calendarIdentities = Object.create(null);
    var evidence = Object.create(null);
    var index;
    for (index = 0; index < documentInputs.length; index += 1) {
      var documentFields = dataValues(documentInputs[index], [
        'handle',
        'stableRecordId',
        'recordVersionId'
      ]);
      if (!documentFields || !validHandle(documentFields.handle) ||
          !validDigestId(documentFields.stableRecordId, 'sri1:') ||
          !validDigestId(documentFields.recordVersionId, 'srv1:') ||
          own(documents, documentFields.handle)) {
        return null;
      }
      documents[documentFields.handle] = frozenRecord([
        ['handle', documentFields.handle],
        ['stableRecordId', documentFields.stableRecordId],
        ['recordVersionId', documentFields.recordVersionId]
      ]);
    }
    for (index = 0; index < clauseInputs.length; index += 1) {
      var clauseFields = dataValues(clauseInputs[index], [
        'handle',
        'stableRecordId',
        'recordVersionId',
        'documentHandle'
      ]);
      if (!clauseFields || !validHandle(clauseFields.handle) ||
          !validDigestId(clauseFields.stableRecordId, 'sri1:') ||
          !validDigestId(clauseFields.recordVersionId, 'srv1:') ||
          !validHandle(clauseFields.documentHandle) ||
          !own(documents, clauseFields.documentHandle) ||
          own(clauses, clauseFields.handle)) {
        return null;
      }
      clauses[clauseFields.handle] = frozenRecord([
        ['handle', clauseFields.handle],
        ['stableRecordId', clauseFields.stableRecordId],
        ['recordVersionId', clauseFields.recordVersionId],
        ['documentHandle', clauseFields.documentHandle]
      ]);
    }
    for (index = 0; index < relationInputs.length; index += 1) {
      var relationFields = dataValues(relationInputs[index], ['handle', 'relationVersionId']);
      if (!relationFields || !validHandle(relationFields.handle) ||
          !validDigestId(relationFields.relationVersionId, ['slv1:', 'scv1:']) ||
          own(relations, relationFields.handle)) {
        return null;
      }
      relations[relationFields.handle] = frozenRecord([
        ['handle', relationFields.handle],
        ['relationVersionId', relationFields.relationVersionId]
      ]);
    }
    for (index = 0; index < calendarInputs.length; index += 1) {
      var calendarFields = dataValues(calendarInputs[index], [
        'handle',
        'calendarId',
        'calendarVersionId'
      ]);
      var calendarIdentity = calendarFields &&
        calendarFields.calendarId + '\u0000' + calendarFields.calendarVersionId;
      if (!calendarFields || !validHandle(calendarFields.handle) ||
          !validOpaque(calendarFields.calendarId, 256) ||
          !validOpaque(calendarFields.calendarVersionId, 256) ||
          own(calendars, calendarFields.handle) ||
          own(calendarIdentities, calendarIdentity)) {
        return null;
      }
      calendarIdentities[calendarIdentity] = true;
      calendars[calendarFields.handle] = frozenRecord([
        ['handle', calendarFields.handle],
        ['calendarId', calendarFields.calendarId],
        ['calendarVersionId', calendarFields.calendarVersionId]
      ]);
    }
    for (index = 0; index < evidenceInputs.length; index += 1) {
      var evidenceFields = dataValues(evidenceInputs[index], ['handle', 'locator']);
      if (!evidenceFields || !validHandle(evidenceFields.handle) ||
          own(evidence, evidenceFields.handle)) {
        return null;
      }
      var locator = await parseGraphLocator(evidenceFields.locator);
      if (!locator || locator.partitionKey !== fields.partitionKey ||
          locator.sourceFileId !== fields.sourceFileId ||
          locator.contentFingerprint !== fields.contentFingerprint ||
          locator.fragmentGenerationId !== fields.fragmentGenerationId) {
        return null;
      }
      evidence[evidenceFields.handle] = locator;
    }
    return frozenRecord([
      ['generationInput', frozenRecord(Object.keys(generationInput).map(function(key) {
        return [key, generationInput[key]];
      }))],
      ['candidateGenerationId', generationId],
      ['documents', Object.freeze(documents)],
      ['clauses', Object.freeze(clauses)],
      ['relations', Object.freeze(relations)],
      ['calendars', Object.freeze(calendars)],
      ['evidence', Object.freeze(evidence)]
    ]);
  }

  function parseEvidenceHandles(value, context) {
    var handles = dataArrayValues(value, MAX_EVIDENCE_LOCATORS_PER_CANDIDATE, 1);
    if (!handles || handles.some(function(item) {
      return !validHandle(item);
    }) || !isCanonicalStringArray(handles, false)) {
      return null;
    }
    var output = [];
    var locatorIds = Object.create(null);
    for (var index = 0; index < handles.length; index += 1) {
      var locator = context.evidence[handles[index]];
      if (!locator || own(locatorIds, locator.locatorId)) return null;
      locatorIds[locator.locatorId] = true;
      output.push(locator);
    }
    return frozenArray(output);
  }

  function parseCivilValue(value) {
    var fields = dataValues(value, ['kind', 'value']);
    if (!fields || fields.kind !== 'civil-date' || !validCivilDate(fields.value)) return null;
    return frozenRecord([
      ['kind', 'civil-date'],
      ['value', fields.value]
    ]);
  }

  function parseRenewalValue(value) {
    var fields = dataValues(value, [
      'kind',
      'mode',
      'amount',
      'unit',
      'anchorAssertionType'
    ]);
    if (!fields || fields.kind !== 'renewal' || !RENEWAL_MODE_SET[fields.mode] ||
        !(fields.amount === null ||
          validInteger(fields.amount, 1, MAX_DAY_OFFSET_MAGNITUDE)) ||
        !(fields.unit === null || RENEWAL_UNIT_SET[fields.unit]) ||
        !(fields.anchorAssertionType === null ||
          RENEWAL_ANCHOR_SET[fields.anchorAssertionType]) ||
        ((fields.amount === null) !== (fields.unit === null))) {
      return null;
    }
    if (fields.mode === 'none-stated' &&
        (fields.amount !== null || fields.unit !== null || fields.anchorAssertionType !== null)) {
      return null;
    }
    return frozenRecord([
      ['kind', 'renewal'],
      ['mode', fields.mode],
      ['amount', fields.amount],
      ['unit', fields.unit],
      ['anchorAssertionType', fields.anchorAssertionType]
    ]);
  }

  function parseNoticeWindowValue(value) {
    var fields = dataValues(value, [
      'kind',
      'amount',
      'unit',
      'relation',
      'anchorAssertionType',
      'boundary'
    ]);
    if (!fields || fields.kind !== 'notice-window' ||
        !validInteger(fields.amount, 1, MAX_DAY_OFFSET_MAGNITUDE) ||
        !NOTICE_UNIT_SET[fields.unit] || !NOTICE_RELATION_SET[fields.relation] ||
        !NOTICE_ANCHOR_SET[fields.anchorAssertionType] || !BOUNDARY_SET[fields.boundary]) {
      return null;
    }
    return frozenRecord([
      ['kind', 'notice-window'],
      ['amount', fields.amount],
      ['unit', fields.unit],
      ['relation', fields.relation],
      ['anchorAssertionType', fields.anchorAssertionType],
      ['boundary', fields.boundary]
    ]);
  }

  function parseDeliveryValue(value) {
    var fields = dataValues(value, ['kind', 'method', 'qualifier']);
    if (!fields || fields.kind !== 'delivery-method' ||
        !DELIVERY_METHOD_SET[fields.method] ||
        !(fields.qualifier === null ||
          validBoundedText(fields.qualifier, MAX_QUALIFIER, 1))) {
      return null;
    }
    return frozenRecord([
      ['kind', 'delivery-method'],
      ['method', fields.method],
      ['qualifier', fields.qualifier]
    ]);
  }

  function parseNullableAddressText(value) {
    return value === null || validBoundedText(value, MAX_QUALIFIER, 1) ? value : undefined;
  }

  function parseAddressValue(value) {
    var fields = dataValues(value, [
      'kind',
      'lines',
      'recipient',
      'city',
      'region',
      'postalCode',
      'country'
    ]);
    var lines = fields && dataArrayValues(fields.lines, MAX_ADDRESS_LINES, 1);
    if (!fields || fields.kind !== 'written-address' || !lines ||
        lines.some(function(line) {
          return !validBoundedText(line, MAX_QUALIFIER, 1);
        })) {
      return null;
    }
    var recipient = parseNullableAddressText(fields.recipient);
    var city = parseNullableAddressText(fields.city);
    var region = parseNullableAddressText(fields.region);
    var postalCode = parseNullableAddressText(fields.postalCode);
    var country = parseNullableAddressText(fields.country);
    if (recipient === undefined || city === undefined || region === undefined ||
        postalCode === undefined || country === undefined) {
      return null;
    }
    return frozenRecord([
      ['kind', 'written-address'],
      ['lines', frozenArray(lines)],
      ['recipient', recipient],
      ['city', city],
      ['region', region],
      ['postalCode', postalCode],
      ['country', country]
    ]);
  }

  function parseTypedValue(assertionType, value) {
    if (!ASSERTION_TYPE_SET[assertionType]) return null;
    if (CIVIL_ASSERTION_SET[assertionType]) return parseCivilValue(value);
    if (assertionType === 'renewal') return parseRenewalValue(value);
    if (assertionType === 'notice-window') return parseNoticeWindowValue(value);
    if (assertionType === 'delivery-method') return parseDeliveryValue(value);
    return parseAddressValue(value);
  }

  function extractionEnvelopeSchemaValid(value) {
    if (!descriptorSafeTree(value)) return false;
    var library = global && global.CfworkerJsonSchema;
    if (!library || typeof library.Validator !== 'function') return true;
    try {
      var validator = new library.Validator({
        type: 'object',
        additionalProperties: false,
        required: [
          'schemaVersion',
          'batchId',
          'executionCandidates',
          'effectivenessCandidates',
          'lineageCandidates',
          'factCandidates',
          'deadlineRuleCandidates'
        ],
        properties: {
          schemaVersion: { const: CANDIDATE_SCHEMA_VERSION },
          batchId: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,96}$' },
          executionCandidates: { type: 'array', maxItems: MAX_CANDIDATES_PER_BATCH },
          effectivenessCandidates: { type: 'array', maxItems: MAX_CANDIDATES_PER_BATCH },
          lineageCandidates: { type: 'array', maxItems: MAX_CANDIDATES_PER_BATCH },
          factCandidates: { type: 'array', maxItems: MAX_CANDIDATES_PER_BATCH },
          deadlineRuleCandidates: { type: 'array', maxItems: MAX_CANDIDATES_PER_BATCH }
        }
      }, '2020-12', false);
      var result = validator.validate(value);
      return !!result && result.valid === true;
    } catch (_error) {
      return false;
    }
  }

  async function parseCandidateEnvelope(value, contextValue) {
    var context = await parseCandidateContext(contextValue);
    if (!context || !extractionEnvelopeSchemaValid(value)) return null;
    var fields = dataValues(value, [
      'schemaVersion',
      'batchId',
      'executionCandidates',
      'effectivenessCandidates',
      'lineageCandidates',
      'factCandidates',
      'deadlineRuleCandidates'
    ]);
    if (!fields || fields.schemaVersion !== CANDIDATE_SCHEMA_VERSION ||
        !validHandle(fields.batchId)) {
      return null;
    }
    var executionInputs = dataArrayValues(
      fields.executionCandidates,
      MAX_CANDIDATES_PER_BATCH,
      0
    );
    var effectivenessInputs = dataArrayValues(
      fields.effectivenessCandidates,
      MAX_CANDIDATES_PER_BATCH,
      0
    );
    var lineageInputs = dataArrayValues(
      fields.lineageCandidates,
      MAX_CANDIDATES_PER_BATCH,
      0
    );
    var factInputs = dataArrayValues(
      fields.factCandidates,
      MAX_CANDIDATES_PER_BATCH,
      0
    );
    var ruleInputs = dataArrayValues(
      fields.deadlineRuleCandidates,
      MAX_CANDIDATES_PER_BATCH,
      0
    );
    if (!executionInputs || !effectivenessInputs || !lineageInputs || !factInputs ||
        !ruleInputs || executionInputs.length + effectivenessInputs.length +
        lineageInputs.length + factInputs.length + ruleInputs.length >
        MAX_CANDIDATES_PER_BATCH) {
      return null;
    }
    var seenRefs = Object.create(null);

    function takeRef(candidateRef) {
      if (!validHandle(candidateRef) || own(seenRefs, candidateRef)) return false;
      seenRefs[candidateRef] = true;
      return true;
    }

    var execution = [];
    var index;
    for (index = 0; index < executionInputs.length; index += 1) {
      var executionFields = dataValues(executionInputs[index], [
        'candidateRef',
        'documentHandle',
        'executionState',
        'evidenceHandles'
      ]);
      var executionDocument = executionFields &&
        context.documents[executionFields.documentHandle];
      var executionEvidence = executionFields &&
        parseEvidenceHandles(executionFields.evidenceHandles, context);
      if (!executionFields || !takeRef(executionFields.candidateRef) ||
          !executionDocument || !EXECUTION_STATE_SET[executionFields.executionState] ||
          !executionEvidence) {
        return null;
      }
      execution.push(frozenRecord([
        ['candidateRef', executionFields.candidateRef],
        ['documentStableId', executionDocument.stableRecordId],
        ['documentRecordVersionId', executionDocument.recordVersionId],
        ['executionState', executionFields.executionState],
        ['evidence', executionEvidence]
      ]));
    }

    var effectiveness = [];
    for (index = 0; index < effectivenessInputs.length; index += 1) {
      var effectivenessFields = dataValues(effectivenessInputs[index], [
        'candidateRef',
        'documentHandle',
        'effectiveDate',
        'evidenceHandles'
      ]);
      var effectivenessDocument = effectivenessFields &&
        context.documents[effectivenessFields.documentHandle];
      var effectiveDate = effectivenessFields &&
        parseCivilValue(effectivenessFields.effectiveDate);
      var effectivenessEvidence = effectivenessFields &&
        parseEvidenceHandles(effectivenessFields.evidenceHandles, context);
      if (!effectivenessFields || !takeRef(effectivenessFields.candidateRef) ||
          !effectivenessDocument || !effectiveDate || !effectivenessEvidence) {
        return null;
      }
      effectiveness.push(frozenRecord([
        ['candidateRef', effectivenessFields.candidateRef],
        ['documentStableId', effectivenessDocument.stableRecordId],
        ['documentRecordVersionId', effectivenessDocument.recordVersionId],
        ['effectiveDate', effectiveDate],
        ['evidence', effectivenessEvidence]
      ]));
    }

    var lineage = [];
    for (index = 0; index < lineageInputs.length; index += 1) {
      var lineageFields = dataValues(lineageInputs[index], [
        'candidateRef',
        'documentHandle',
        'targetDocumentHandle',
        'targetClauseHandle',
        'amendmentClauseHandle',
        'relationHandle',
        'lineageRole',
        'scope',
        'evidenceHandles'
      ]);
      var lineageDocument = lineageFields && context.documents[lineageFields.documentHandle];
      var targetDocument = lineageFields &&
        context.documents[lineageFields.targetDocumentHandle];
      var targetClause = lineageFields && lineageFields.targetClauseHandle !== null
        ? context.clauses[lineageFields.targetClauseHandle]
        : null;
      var amendmentClause = lineageFields &&
        lineageFields.amendmentClauseHandle !== null
        ? context.clauses[lineageFields.amendmentClauseHandle]
        : null;
      var relation = lineageFields && context.relations[lineageFields.relationHandle];
      var lineageEvidence = lineageFields &&
        parseEvidenceHandles(lineageFields.evidenceHandles, context);
      if (!lineageFields || !takeRef(lineageFields.candidateRef) ||
          !lineageDocument || !targetDocument || !relation ||
          !LINEAGE_ROLE_SET[lineageFields.lineageRole] ||
          !LINEAGE_SCOPE_SET[lineageFields.scope] || !lineageEvidence ||
          (lineageFields.scope === 'clause' && (!targetClause ||
            targetClause.documentHandle !== lineageFields.targetDocumentHandle ||
            !amendmentClause ||
            amendmentClause.documentHandle !== lineageFields.documentHandle)) ||
          (lineageFields.scope === 'document' &&
            (lineageFields.targetClauseHandle !== null ||
              lineageFields.amendmentClauseHandle !== null))) {
        return null;
      }
      lineage.push(frozenRecord([
        ['candidateRef', lineageFields.candidateRef],
        ['documentStableId', lineageDocument.stableRecordId],
        ['documentRecordVersionId', lineageDocument.recordVersionId],
        ['targetDocumentStableId', targetDocument.stableRecordId],
        ['targetDocumentRecordVersionId', targetDocument.recordVersionId],
        ['targetClauseStableId', targetClause ? targetClause.stableRecordId : null],
        ['targetClauseRecordVersionId', targetClause ? targetClause.recordVersionId : null],
        ['amendmentClauseStableId',
          amendmentClause ? amendmentClause.stableRecordId : null],
        ['amendmentClauseRecordVersionId',
          amendmentClause ? amendmentClause.recordVersionId : null],
        ['relationVersionId', relation.relationVersionId],
        ['lineageRole', lineageFields.lineageRole],
        ['scope', lineageFields.scope],
        ['evidence', lineageEvidence]
      ]));
    }

    var facts = [];
    for (index = 0; index < factInputs.length; index += 1) {
      var factFields = dataValues(factInputs[index], [
        'candidateRef',
        'documentHandle',
        'clauseHandle',
        'assertionType',
        'typedValue',
        'evidenceHandles'
      ]);
      var factDocument = factFields && context.documents[factFields.documentHandle];
      var factClause = factFields && factFields.clauseHandle !== null
        ? context.clauses[factFields.clauseHandle]
        : null;
      var factValue = factFields &&
        parseTypedValue(factFields.assertionType, factFields.typedValue);
      var factEvidence = factFields && parseEvidenceHandles(factFields.evidenceHandles, context);
      if (!factFields || !takeRef(factFields.candidateRef) ||
          !factDocument || !ASSERTION_TYPE_SET[factFields.assertionType] ||
          !factValue || !factEvidence ||
          (factFields.clauseHandle !== null && !factClause) ||
          (factClause && factClause.documentHandle !== factFields.documentHandle)) {
        return null;
      }
      facts.push(frozenRecord([
        ['candidateRef', factFields.candidateRef],
        ['documentStableId', factDocument.stableRecordId],
        ['documentRecordVersionId', factDocument.recordVersionId],
        ['clauseStableId', factClause ? factClause.stableRecordId : null],
        ['clauseRecordVersionId', factClause ? factClause.recordVersionId : null],
        ['assertionType', factFields.assertionType],
        ['typedValue', factValue],
        ['evidence', factEvidence]
      ]));
    }

    var rules = [];
    for (index = 0; index < ruleInputs.length; index += 1) {
      var ruleFields = dataValues(ruleInputs[index], [
        'candidateRef',
        'documentHandle',
        'clauseHandle',
        'operator',
        'anchorAssertionType',
        'amount',
        'boundary',
        'timezone',
        'calendarHandle',
        'consequenceEvidenceHandle',
        'evidenceHandles'
      ]);
      var ruleDocument = ruleFields && context.documents[ruleFields.documentHandle];
      var ruleClause = ruleFields && ruleFields.clauseHandle !== null
        ? context.clauses[ruleFields.clauseHandle]
        : null;
      var ruleCalendar = ruleFields && ruleFields.calendarHandle !== null
        ? context.calendars[ruleFields.calendarHandle]
        : null;
      var ruleEvidence = ruleFields && parseEvidenceHandles(ruleFields.evidenceHandles, context);
      var consequenceEvidence = ruleFields &&
        context.evidence[ruleFields.consequenceEvidenceHandle];
      if (!ruleFields || !takeRef(ruleFields.candidateRef) || !ruleDocument ||
          !ruleClause || ruleClause.documentHandle !== ruleFields.documentHandle ||
          !DEADLINE_OPERATOR_SET[ruleFields.operator] ||
          !ASSERTION_TYPE_SET[ruleFields.anchorAssertionType] ||
          !validInteger(ruleFields.amount, 1, MAX_DAY_OFFSET_MAGNITUDE) ||
          !BOUNDARY_SET[ruleFields.boundary] ||
          !(ruleFields.timezone === null || validTimezone(ruleFields.timezone)) ||
          !(ruleFields.calendarHandle === null || validHandle(ruleFields.calendarHandle)) ||
          (ruleFields.calendarHandle !== null && !ruleCalendar) ||
          !validHandle(ruleFields.consequenceEvidenceHandle) ||
          !consequenceEvidence || !ruleEvidence) {
        return null;
      }
      rules.push(frozenRecord([
        ['candidateRef', ruleFields.candidateRef],
        ['documentStableId', ruleDocument.stableRecordId],
        ['documentRecordVersionId', ruleDocument.recordVersionId],
        ['clauseStableId', ruleClause.stableRecordId],
        ['clauseRecordVersionId', ruleClause.recordVersionId],
        ['operator', ruleFields.operator],
        ['anchorAssertionType', ruleFields.anchorAssertionType],
        ['amount', ruleFields.amount],
        ['boundary', ruleFields.boundary],
        ['timezone', ruleFields.timezone],
        ['businessCalendarId', ruleCalendar ? ruleCalendar.calendarId : null],
        ['businessCalendarVersionId',
          ruleCalendar ? ruleCalendar.calendarVersionId : null],
        ['consequenceEvidence', consequenceEvidence],
        ['evidence', ruleEvidence]
      ]));
    }

    return frozenRecord([
      ['schemaVersion', CANDIDATE_SCHEMA_VERSION],
      ['candidateGenerationId', context.candidateGenerationId],
      ['batchId', fields.batchId],
      ['fragmentGenerationId', context.generationInput.fragmentGenerationId],
      ['batchOrdinal', context.generationInput.batchOrdinal],
      ['executionCandidates', frozenArray(execution)],
      ['effectivenessCandidates', frozenArray(effectiveness)],
      ['lineageCandidates', frozenArray(lineage)],
      ['factCandidates', frozenArray(facts)],
      ['deadlineRuleCandidates', frozenArray(rules)]
    ]);
  }

  async function deriveFamilyId(value) {
    var fields = dataValues(value, [
      'identityVersion',
      'partitionKey',
      'documentStableIds',
      'lineageRelationIds'
    ]);
    var documents = fields && parseIdArray(
      fields.documentStableIds,
      'sri1:',
      MAX_GRAPH_RECORD_VERSIONS,
      1,
      false
    );
    var relations = fields && parseIdArray(
      fields.lineageRelationIds,
      ['slv1:', 'scv1:'],
      MAX_RELATION_VERSIONS,
      0,
      false
    );
    if (!fields || fields.identityVersion !== IDENTITY_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) || !documents || !relations) {
      return null;
    }
    return digestTuple('stf1:', 'truth-family|', [
      fields.identityVersion,
      fields.partitionKey,
      canonicalize(documents),
      canonicalize(relations)
    ]);
  }

  function parsePrimarySourceLocator(value) {
    var fields = dataValues(value, [
      'sourceFileId',
      'sourceByteStart',
      'sourceByteEnd'
    ]);
    if (!fields || !validSourceFileId(fields.sourceFileId) ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart) {
      return null;
    }
    return frozenRecord([
      ['sourceFileId', fields.sourceFileId],
      ['sourceByteStart', fields.sourceByteStart],
      ['sourceByteEnd', fields.sourceByteEnd]
    ]);
  }

  async function deriveAssertionId(value) {
    var fields = dataValues(value, [
      'identityVersion',
      'partitionKey',
      'familyId',
      'subjectDocumentStableId',
      'subjectClauseStableId',
      'assertionType',
      'primarySourceLocator'
    ]);
    var locator = fields && parsePrimarySourceLocator(fields.primarySourceLocator);
    if (!fields || fields.identityVersion !== IDENTITY_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validDigestId(fields.subjectDocumentStableId, 'sri1:') ||
        !(fields.subjectClauseStableId === null ||
          validDigestId(fields.subjectClauseStableId, 'sri1:')) ||
        !ASSERTION_TYPE_SET[fields.assertionType] || !locator) {
      return null;
    }
    return digestTuple('sta1:', 'truth-assertion|', [
      fields.identityVersion,
      fields.partitionKey,
      fields.familyId,
      fields.subjectDocumentStableId,
      fields.subjectClauseStableId === null ? 'null' : fields.subjectClauseStableId,
      fields.assertionType,
      locator.sourceFileId,
      String(locator.sourceByteStart),
      String(locator.sourceByteEnd)
    ]);
  }

  async function deriveAssertionVersionId(value) {
    var fields = dataValues(value, [
      'assertionId',
      'typedValue',
      'trustState',
      'citationIds',
      'candidateSchemaVersion',
      'promptVersion',
      'derivationRuleVersion'
    ]);
    var citations = fields && parseIdArray(
      fields.citationIds,
      'stc1:',
      MAX_CITATIONS_PER_ASSERTION,
      1,
      false
    );
    var canonicalTypedValue = fields && canonicalize(fields.typedValue);
    if (!fields || !validDigestId(fields.assertionId, 'sta1:') ||
        !canonicalTypedValue || !TRUST_STATE_SET[fields.trustState] || !citations ||
        fields.candidateSchemaVersion !== CANDIDATE_SCHEMA_VERSION ||
        fields.promptVersion !== PROMPT_VERSION ||
        !(fields.derivationRuleVersion === null ||
          validVersionId(fields.derivationRuleVersion))) {
      return null;
    }
    return digestTuple('stav1:', 'truth-assertion-version|', [
      fields.assertionId,
      canonicalTypedValue,
      fields.trustState,
      canonicalize(citations),
      String(fields.candidateSchemaVersion),
      fields.promptVersion,
      fields.derivationRuleVersion === null ? 'null' : fields.derivationRuleVersion
    ]);
  }

  async function parseAssertionWithRegistry(value, citationRegistry) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'subjectDocumentStableId',
      'subjectClauseStableId',
      'assertionType',
      'typedValue',
      'trustState',
      'citationIds',
      'primarySourceLocator',
      'candidateSchemaVersion',
      'promptVersion',
      'derivationRuleVersion',
      'assertionId',
      'assertionVersionId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validDigestId(fields.subjectDocumentStableId, 'sri1:') ||
        !(fields.subjectClauseStableId === null ||
          validDigestId(fields.subjectClauseStableId, 'sri1:')) ||
        !ASSERTION_TYPE_SET[fields.assertionType] ||
        !TRUST_STATE_SET[fields.trustState] ||
        fields.candidateSchemaVersion !== CANDIDATE_SCHEMA_VERSION ||
        fields.promptVersion !== PROMPT_VERSION ||
        !(fields.derivationRuleVersion === null ||
          validVersionId(fields.derivationRuleVersion)) ||
        !validDigestId(fields.assertionId, 'sta1:') ||
        !validDigestId(fields.assertionVersionId, 'stav1:')) {
      return null;
    }
    var typedValue = parseTypedValue(fields.assertionType, fields.typedValue);
    var citationIds = parseIdArray(
      fields.citationIds,
      'stc1:',
      MAX_CITATIONS_PER_ASSERTION,
      1,
      false
    );
    var primarySourceLocator = parsePrimarySourceLocator(fields.primarySourceLocator);
    if (!typedValue || !citationIds || !primarySourceLocator) return null;
    if (!citationRegistry || !citationRegistry.byId) return null;
    var primaryMatched = false;
    for (var index = 0; index < citationIds.length; index += 1) {
      var citation = citationRegistry.byId[citationIds[index]];
      if (!citation || citation.partitionKey !== fields.partitionKey) return null;
      if (citation.sourceFileId === primarySourceLocator.sourceFileId &&
          citation.sourceByteStart === primarySourceLocator.sourceByteStart &&
          citation.sourceByteEnd === primarySourceLocator.sourceByteEnd) {
        primaryMatched = true;
      }
    }
    if (!primaryMatched) return null;
    var expectedAssertionId = await deriveAssertionId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: fields.partitionKey,
      familyId: fields.familyId,
      subjectDocumentStableId: fields.subjectDocumentStableId,
      subjectClauseStableId: fields.subjectClauseStableId,
      assertionType: fields.assertionType,
      primarySourceLocator: primarySourceLocator
    });
    var expectedVersionId = await deriveAssertionVersionId({
      assertionId: fields.assertionId,
      typedValue: typedValue,
      trustState: fields.trustState,
      citationIds: citationIds,
      candidateSchemaVersion: fields.candidateSchemaVersion,
      promptVersion: fields.promptVersion,
      derivationRuleVersion: fields.derivationRuleVersion
    });
    if (fields.assertionId !== expectedAssertionId ||
        fields.assertionVersionId !== expectedVersionId) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['subjectDocumentStableId', fields.subjectDocumentStableId],
      ['subjectClauseStableId', fields.subjectClauseStableId],
      ['assertionType', fields.assertionType],
      ['typedValue', typedValue],
      ['trustState', fields.trustState],
      ['citationIds', citationIds],
      ['primarySourceLocator', primarySourceLocator],
      ['candidateSchemaVersion', CANDIDATE_SCHEMA_VERSION],
      ['promptVersion', PROMPT_VERSION],
      ['derivationRuleVersion', fields.derivationRuleVersion],
      ['assertionId', fields.assertionId],
      ['assertionVersionId', fields.assertionVersionId]
    ]);
  }

  async function parseAssertion(value, citationValues) {
    var citationRegistry = await parseCitationRegistry(
      citationValues || [],
      MAX_FAMILY_CITATIONS,
      1
    );
    return citationRegistry
      ? parseAssertionWithRegistry(value, citationRegistry)
      : null;
  }

  async function deriveConflictSetId(value) {
    var fields = dataValues(value, [
      'identityVersion',
      'partitionKey',
      'familyId',
      'subjectDocumentStableId',
      'subjectClauseStableId',
      'assertionType',
      'applicabilityContext',
      'assertionVersionIds'
    ]);
    var assertionVersions = fields && parseIdArray(
      fields.assertionVersionIds,
      'stav1:',
      MAX_ASSERTIONS_PER_FAMILY,
      2,
      false
    );
    if (!fields || fields.identityVersion !== IDENTITY_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validDigestId(fields.subjectDocumentStableId, 'sri1:') ||
        !(fields.subjectClauseStableId === null ||
          validDigestId(fields.subjectClauseStableId, 'sri1:')) ||
        !ASSERTION_TYPE_SET[fields.assertionType] ||
        !validOpaque(fields.applicabilityContext, 512) || !assertionVersions) {
      return null;
    }
    return digestTuple('stx1:', 'truth-conflict|', [
      fields.identityVersion,
      fields.partitionKey,
      fields.familyId,
      fields.subjectDocumentStableId,
      fields.subjectClauseStableId === null ? 'null' : fields.subjectClauseStableId,
      fields.assertionType,
      fields.applicabilityContext,
      canonicalize(assertionVersions)
    ]);
  }

  async function parseAssertionRegistry(
    values,
    citationValues,
    maximum,
    minimum,
    readyCitationRegistry
  ) {
    var inputs = dataArrayValues(values, maximum, minimum || 0);
    if (!inputs) return null;
    var citationRegistry = readyCitationRegistry || await parseCitationRegistry(
      citationValues || [],
      MAX_FAMILY_CITATIONS,
      inputs.length === 0 ? 0 : 1
    );
    if (!citationRegistry) return null;
    var output = [];
    var seenVersions = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var assertion = await parseAssertionWithRegistry(inputs[index], citationRegistry);
      if (!assertion || own(seenVersions, assertion.assertionVersionId)) return null;
      seenVersions[assertion.assertionVersionId] = assertion;
      output.push(assertion);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byVersionId', Object.freeze(seenVersions)]
    ]);
  }

  async function parseConflictSet(value, assertionValues, citationValues) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'subjectDocumentStableId',
      'subjectClauseStableId',
      'assertionType',
      'applicabilityContext',
      'assertionVersionIds',
      'citationIds',
      'conflictSetId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validDigestId(fields.subjectDocumentStableId, 'sri1:') ||
        !(fields.subjectClauseStableId === null ||
          validDigestId(fields.subjectClauseStableId, 'sri1:')) ||
        !ASSERTION_TYPE_SET[fields.assertionType] ||
        !validOpaque(fields.applicabilityContext, 512) ||
        !validDigestId(fields.conflictSetId, 'stx1:')) {
      return null;
    }
    var assertionVersionIds = parseIdArray(
      fields.assertionVersionIds,
      'stav1:',
      MAX_ASSERTIONS_PER_FAMILY,
      2,
      false
    );
    var citationIds = parseIdArray(
      fields.citationIds,
      'stc1:',
      MAX_FAMILY_CITATIONS,
      1,
      false
    );
    if (!assertionVersionIds || !citationIds) return null;
    var assertionRegistry = await parseAssertionRegistry(
      assertionValues || [],
      citationValues || [],
      MAX_ASSERTIONS_PER_FAMILY,
      assertionVersionIds.length
    );
    var citationRegistry = await parseCitationRegistry(
      citationValues || [],
      MAX_FAMILY_CITATIONS,
      citationIds.length
    );
    if (!assertionRegistry || !citationRegistry) return null;
    var canonicalValues = Object.create(null);
    for (var index = 0; index < assertionVersionIds.length; index += 1) {
      var assertion = assertionRegistry.byVersionId[assertionVersionIds[index]];
      if (!assertion || assertion.partitionKey !== fields.partitionKey ||
          assertion.familyId !== fields.familyId ||
          assertion.subjectDocumentStableId !== fields.subjectDocumentStableId ||
          assertion.subjectClauseStableId !== fields.subjectClauseStableId ||
          assertion.assertionType !== fields.assertionType) {
        return null;
      }
      canonicalValues[canonicalize(assertion.typedValue)] = true;
    }
    if (Object.keys(canonicalValues).length < 2) return null;
    for (var citationIndex = 0; citationIndex < citationIds.length; citationIndex += 1) {
      if (!citationRegistry.byId[citationIds[citationIndex]]) return null;
    }
    var expectedId = await deriveConflictSetId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: fields.partitionKey,
      familyId: fields.familyId,
      subjectDocumentStableId: fields.subjectDocumentStableId,
      subjectClauseStableId: fields.subjectClauseStableId,
      assertionType: fields.assertionType,
      applicabilityContext: fields.applicabilityContext,
      assertionVersionIds: assertionVersionIds
    });
    if (fields.conflictSetId !== expectedId) return null;
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['subjectDocumentStableId', fields.subjectDocumentStableId],
      ['subjectClauseStableId', fields.subjectClauseStableId],
      ['assertionType', fields.assertionType],
      ['applicabilityContext', fields.applicabilityContext],
      ['assertionVersionIds', assertionVersionIds],
      ['citationIds', citationIds],
      ['conflictSetId', fields.conflictSetId]
    ]);
  }

  async function parseLineageAxis(value, axisName, citationRegistry) {
    var fields = dataValues(value, [
      'value',
      'reasonCode',
      'citationIds',
      'inputRecordVersionIds',
      'inputRelationVersionIds',
      'trustState',
      'basis'
    ]);
    if (!fields || !TRUST_STATE_SET[fields.trustState] || !BASIS_SET[fields.basis]) return null;
    var valueSet;
    var reasonSet;
    if (axisName === 'execution') {
      valueSet = EXECUTION_STATE_SET;
      reasonSet = EXECUTION_REASON_SET;
    } else if (axisName === 'temporal') {
      valueSet = TEMPORAL_STATE_SET;
      reasonSet = TEMPORAL_REASON_SET;
    } else if (axisName === 'lineageRole') {
      valueSet = LINEAGE_ROLE_SET;
      reasonSet = LINEAGE_REASON_SET;
    } else {
      valueSet = GOVERNANCE_CONCLUSION_SET;
      reasonSet = GOVERNANCE_REASON_SET;
    }
    if (!valueSet[fields.value] || !reasonSet[fields.reasonCode]) return null;
    var citationIds = parseIdArray(
      fields.citationIds,
      'stc1:',
      MAX_FAMILY_CITATIONS,
      0,
      false
    );
    var recordVersionIds = parseIdArray(
      fields.inputRecordVersionIds,
      'srv1:',
      MAX_GRAPH_RECORD_VERSIONS,
      0,
      false
    );
    var relationVersionIds = parseIdArray(
      fields.inputRelationVersionIds,
      ['slv1:', 'scv1:'],
      MAX_RELATION_VERSIONS,
      0,
      false
    );
    if (!citationIds || !recordVersionIds || !relationVersionIds) return null;
    for (var index = 0; index < citationIds.length; index += 1) {
      if (citationRegistry && !citationRegistry.byId[citationIds[index]]) return null;
    }
    return frozenRecord([
      ['value', fields.value],
      ['reasonCode', fields.reasonCode],
      ['citationIds', citationIds],
      ['inputRecordVersionIds', recordVersionIds],
      ['inputRelationVersionIds', relationVersionIds],
      ['trustState', fields.trustState],
      ['basis', fields.basis]
    ]);
  }

  async function parseLineageProof(value, citationValues) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'execution',
      'temporal',
      'lineageRole',
      'governance',
      'acceptedPath',
      'overlays',
      'inheritances'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:')) {
      return null;
    }
    var citationRegistry = await parseCitationRegistry(
      citationValues || [],
      MAX_FAMILY_CITATIONS,
      0
    );
    if (!citationRegistry) return null;
    var execution = await parseLineageAxis(fields.execution, 'execution', citationRegistry);
    var temporal = await parseLineageAxis(fields.temporal, 'temporal', citationRegistry);
    var lineageRole = await parseLineageAxis(fields.lineageRole, 'lineageRole', citationRegistry);
    var governance = await parseLineageAxis(fields.governance, 'governance', citationRegistry);
    var acceptedPath = parseIdArray(
      fields.acceptedPath,
      'srv1:',
      MAX_GRAPH_RECORD_VERSIONS,
      0,
      false
    );
    var overlayInputs = dataArrayValues(fields.overlays, MAX_RELATION_VERSIONS, 0);
    var inheritanceInputs = dataArrayValues(fields.inheritances, MAX_GRAPH_RECORD_VERSIONS, 0);
    if (!execution || !temporal || !lineageRole || !governance || !acceptedPath ||
        !overlayInputs || !inheritanceInputs) {
      return null;
    }
    var overlays = [];
    var overlayKeys = [];
    var index;
    for (index = 0; index < overlayInputs.length; index += 1) {
      var overlayFields = dataValues(overlayInputs[index], [
        'baseClauseRecordVersionId',
        'amendmentDocumentRecordVersionId',
        'amendmentClauseRecordVersionId',
        'effect',
        'citationIds'
      ]);
      var overlayCitations = overlayFields && parseIdArray(
        overlayFields.citationIds,
        'stc1:',
        MAX_FAMILY_CITATIONS,
        0,
        false
      );
      if (!overlayFields ||
          !validDigestId(overlayFields.baseClauseRecordVersionId, 'srv1:') ||
          !validDigestId(overlayFields.amendmentDocumentRecordVersionId, 'srv1:') ||
          !validDigestId(overlayFields.amendmentClauseRecordVersionId, 'srv1:') ||
          !OVERLAY_EFFECT_SET[overlayFields.effect] || !overlayCitations) {
        return null;
      }
      for (var citationIndex = 0; citationIndex < overlayCitations.length; citationIndex += 1) {
        if (!citationRegistry.byId[overlayCitations[citationIndex]]) return null;
      }
      var overlayKey = overlayFields.baseClauseRecordVersionId + '\u0000' +
        overlayFields.amendmentDocumentRecordVersionId + '\u0000' +
        overlayFields.amendmentClauseRecordVersionId + '\u0000' + overlayFields.effect;
      overlayKeys.push(overlayKey);
      overlays.push(frozenRecord([
        ['baseClauseRecordVersionId', overlayFields.baseClauseRecordVersionId],
        ['amendmentDocumentRecordVersionId', overlayFields.amendmentDocumentRecordVersionId],
        ['amendmentClauseRecordVersionId', overlayFields.amendmentClauseRecordVersionId],
        ['effect', overlayFields.effect],
        ['citationIds', overlayCitations]
      ]));
    }
    if (!isCanonicalStringArray(overlayKeys, false)) return null;
    var inheritances = [];
    var inheritanceKeys = [];
    for (index = 0; index < inheritanceInputs.length; index += 1) {
      var inheritanceFields = dataValues(inheritanceInputs[index], [
        'baseClauseRecordVersionId',
        'governingDocumentRecordVersionId',
        'citationIds'
      ]);
      var inheritanceCitations = inheritanceFields && parseIdArray(
        inheritanceFields.citationIds,
        'stc1:',
        MAX_FAMILY_CITATIONS,
        0,
        false
      );
      if (!inheritanceFields ||
          !validDigestId(inheritanceFields.baseClauseRecordVersionId, 'srv1:') ||
          !validDigestId(inheritanceFields.governingDocumentRecordVersionId, 'srv1:') ||
          !inheritanceCitations) {
        return null;
      }
      for (var inheritanceCitationIndex = 0;
        inheritanceCitationIndex < inheritanceCitations.length;
        inheritanceCitationIndex += 1) {
        if (!citationRegistry.byId[inheritanceCitations[inheritanceCitationIndex]]) return null;
      }
      inheritanceKeys.push(inheritanceFields.baseClauseRecordVersionId + '\u0000' +
        inheritanceFields.governingDocumentRecordVersionId);
      inheritances.push(frozenRecord([
        ['baseClauseRecordVersionId', inheritanceFields.baseClauseRecordVersionId],
        ['governingDocumentRecordVersionId', inheritanceFields.governingDocumentRecordVersionId],
        ['citationIds', inheritanceCitations]
      ]));
    }
    if (!isCanonicalStringArray(inheritanceKeys, false)) return null;
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['execution', execution],
      ['temporal', temporal],
      ['lineageRole', lineageRole],
      ['governance', governance],
      ['acceptedPath', acceptedPath],
      ['overlays', frozenArray(overlays)],
      ['inheritances', frozenArray(inheritances)]
    ]);
  }

  function parseBusinessCalendar(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'calendarId',
      'calendarVersionId',
      'weekendDays',
      'holidays'
    ]);
    var weekendDays = fields && dataArrayValues(fields.weekendDays, 7, 1);
    var holidays = fields && dataArrayValues(
      fields.holidays,
      MAX_HOLIDAYS_PER_CALENDAR,
      0
    );
    if (!fields || fields.schemaVersion !== CALENDAR_VERSION ||
        !validOpaque(fields.calendarId, 256) ||
        !validOpaque(fields.calendarVersionId, 256) ||
        !weekendDays || weekendDays.some(function(day) {
          return !validInteger(day, 0, 6);
        }) || !holidays || holidays.some(function(day) {
          return !validCivilDate(day);
        })) {
      return null;
    }
    for (var weekendIndex = 1; weekendIndex < weekendDays.length; weekendIndex += 1) {
      if (weekendDays[weekendIndex - 1] >= weekendDays[weekendIndex]) return null;
    }
    if (!isCanonicalStringArray(holidays, false)) return null;
    return frozenRecord([
      ['schemaVersion', CALENDAR_VERSION],
      ['calendarId', fields.calendarId],
      ['calendarVersionId', fields.calendarVersionId],
      ['weekendDays', frozenArray(weekendDays)],
      ['holidays', frozenArray(holidays)]
    ]);
  }

  function citationIdRegistryFromValues(values) {
    var output = Object.create(null);
    var inputs = Array.isArray(values) ? values : [];
    for (var index = 0; index < inputs.length; index += 1) {
      var id = inputs[index] && inputs[index].citationId;
      if (validDigestId(id, 'stc1:')) output[id] = true;
    }
    return output;
  }

  function parseEvaluationContext(value, citationValues) {
    var fields = dataValues(value, [
      'asOfCivilDate',
      'governingTimezoneBinding',
      'calendars'
    ]);
    if (!fields || !validCivilDate(fields.asOfCivilDate)) return null;
    var calendarInputs = dataArrayValues(fields.calendars, MAX_SOURCES, 0);
    if (!calendarInputs) return null;
    var calendars = [];
    var calendarKeys = [];
    for (var index = 0; index < calendarInputs.length; index += 1) {
      var calendar = parseBusinessCalendar(calendarInputs[index]);
      if (!calendar) return null;
      calendarKeys.push(calendar.calendarId + '\u0000' + calendar.calendarVersionId);
      calendars.push(calendar);
    }
    if (!isCanonicalStringArray(calendarKeys, false)) return null;
    if (!isPlainRecord(fields.governingTimezoneBinding)) return null;
    var kindDescriptor;
    try {
      kindDescriptor = Object.getOwnPropertyDescriptor(
        fields.governingTimezoneBinding,
        'kind'
      );
    } catch (_error) {
      return null;
    }
    if (!kindDescriptor || !own(kindDescriptor, 'value') ||
        kindDescriptor.enumerable !== true) {
      return null;
    }
    var timezoneBinding;
    if (kindDescriptor.value === 'cited') {
      var citedFields = dataValues(fields.governingTimezoneBinding, [
        'kind',
        'timezone',
        'citationIds'
      ]);
      var citationIds = citedFields && parseIdArray(
        citedFields.citationIds,
        'stc1:',
        MAX_FAMILY_CITATIONS,
        1,
        false
      );
      if (!citedFields || !validTimezone(citedFields.timezone) || !citationIds) return null;
      var citationRegistry = citationIdRegistryFromValues(citationValues);
      if (citationValues && citationIds.some(function(id) {
        return !own(citationRegistry, id);
      })) {
        return null;
      }
      timezoneBinding = frozenRecord([
        ['kind', 'cited'],
        ['timezone', citedFields.timezone],
        ['citationIds', citationIds]
      ]);
    } else if (kindDescriptor.value === 'configured') {
      var configuredFields = dataValues(fields.governingTimezoneBinding, [
        'kind',
        'timezone',
        'configurationId',
        'configurationVersion'
      ]);
      if (!configuredFields || !validTimezone(configuredFields.timezone) ||
          !validOpaque(configuredFields.configurationId, 256) ||
          !validOpaque(configuredFields.configurationVersion, 256)) {
        return null;
      }
      timezoneBinding = frozenRecord([
        ['kind', 'configured'],
        ['timezone', configuredFields.timezone],
        ['configurationId', configuredFields.configurationId],
        ['configurationVersion', configuredFields.configurationVersion]
      ]);
    } else {
      return null;
    }
    return frozenRecord([
      ['asOfCivilDate', fields.asOfCivilDate],
      ['governingTimezoneBinding', timezoneBinding],
      ['calendars', frozenArray(calendars)]
    ]);
  }

  function parseConsequence(value, assertionRegistry, citationRegistry) {
    if (value === null) return null;
    var fields = dataValues(value, ['assertionVersionId', 'citationIds']);
    var citationIds = fields && parseIdArray(
      fields.citationIds,
      'stc1:',
      MAX_FAMILY_CITATIONS,
      1,
      false
    );
    if (!fields || !validDigestId(fields.assertionVersionId, 'stav1:') || !citationIds) {
      return undefined;
    }
    if (assertionRegistry && !assertionRegistry.byVersionId[fields.assertionVersionId]) {
      return undefined;
    }
    for (var index = 0; index < citationIds.length; index += 1) {
      if (citationRegistry && !citationRegistry.byId[citationIds[index]]) return undefined;
    }
    return frozenRecord([
      ['assertionVersionId', fields.assertionVersionId],
      ['citationIds', citationIds]
    ]);
  }

  async function deriveDeadlineRuleId(value) {
    var canonical = canonicalize(value);
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'operator',
      'anchorAssertionVersionId',
      'amount',
      'boundary',
      'timezone',
      'businessCalendarId',
      'businessCalendarVersionId',
      'consequence',
      'citedInputAssertionVersionIds',
      'citationIds'
    ]);
    if (!fields || !canonical || fields.schemaVersion !== DEADLINE_RULE_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !DEADLINE_OPERATOR_SET[fields.operator] ||
        !validDigestId(fields.anchorAssertionVersionId, 'stav1:') ||
        !validInteger(fields.amount, 1, MAX_DAY_OFFSET_MAGNITUDE) ||
        !BOUNDARY_SET[fields.boundary]) {
      return null;
    }
    return digestTuple('str1:', 'truth-deadline-rule|', [canonical]);
  }

  async function parseDeadlineRule(value, assertionValues, citationValues) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'operator',
      'anchorAssertionVersionId',
      'amount',
      'boundary',
      'timezone',
      'businessCalendarId',
      'businessCalendarVersionId',
      'consequence',
      'citedInputAssertionVersionIds',
      'citationIds',
      'deadlineRuleId'
    ]);
    if (!fields || fields.schemaVersion !== DEADLINE_RULE_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !DEADLINE_OPERATOR_SET[fields.operator] ||
        !validDigestId(fields.anchorAssertionVersionId, 'stav1:') ||
        !validInteger(fields.amount, 1, MAX_DAY_OFFSET_MAGNITUDE) ||
        !BOUNDARY_SET[fields.boundary] ||
        !(fields.timezone === null || validTimezone(fields.timezone)) ||
        !validDigestId(fields.deadlineRuleId, 'str1:')) {
      return null;
    }
    if (CALENDAR_OPERATOR_SET[fields.operator]) {
      if (fields.businessCalendarId !== null ||
          fields.businessCalendarVersionId !== null) {
        return null;
      }
    } else if (!validOpaque(fields.businessCalendarId, 256) ||
        !validOpaque(fields.businessCalendarVersionId, 256)) {
      return null;
    }
    var inputAssertionIds = parseIdArray(
      fields.citedInputAssertionVersionIds,
      'stav1:',
      MAX_ASSERTIONS_PER_FAMILY,
      1,
      false
    );
    var citationIds = parseIdArray(
      fields.citationIds,
      'stc1:',
      MAX_FAMILY_CITATIONS,
      1,
      false
    );
    if (!inputAssertionIds || !citationIds ||
        inputAssertionIds.indexOf(fields.anchorAssertionVersionId) < 0) {
      return null;
    }
    var assertionRegistry = await parseAssertionRegistry(
      assertionValues || [],
      citationValues || [],
      MAX_ASSERTIONS_PER_FAMILY,
      inputAssertionIds.length
    );
    var citationRegistry = await parseCitationRegistry(
      citationValues || [],
      MAX_FAMILY_CITATIONS,
      citationIds.length
    );
    if (!assertionRegistry || !citationRegistry) return null;
    for (var assertionIndex = 0; assertionIndex < inputAssertionIds.length; assertionIndex += 1) {
      var assertion = assertionRegistry.byVersionId[inputAssertionIds[assertionIndex]];
      if (!assertion || assertion.familyId !== fields.familyId ||
          assertion.partitionKey !== fields.partitionKey) {
        return null;
      }
    }
    for (var citationIndex = 0; citationIndex < citationIds.length; citationIndex += 1) {
      if (!citationRegistry.byId[citationIds[citationIndex]]) return null;
    }
    var consequence = fields.consequence === null
      ? null
      : parseConsequence(fields.consequence, assertionRegistry, citationRegistry);
    if (fields.consequence !== null && consequence === undefined) return null;
    var normalized = {
      schemaVersion: DEADLINE_RULE_VERSION,
      partitionKey: fields.partitionKey,
      familyId: fields.familyId,
      operator: fields.operator,
      anchorAssertionVersionId: fields.anchorAssertionVersionId,
      amount: fields.amount,
      boundary: fields.boundary,
      timezone: fields.timezone,
      businessCalendarId: fields.businessCalendarId,
      businessCalendarVersionId: fields.businessCalendarVersionId,
      consequence: consequence,
      citedInputAssertionVersionIds: inputAssertionIds,
      citationIds: citationIds
    };
    var expectedId = await deriveDeadlineRuleId(normalized);
    if (fields.deadlineRuleId !== expectedId) return null;
    return frozenRecord([
      ['schemaVersion', DEADLINE_RULE_VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['operator', fields.operator],
      ['anchorAssertionVersionId', fields.anchorAssertionVersionId],
      ['amount', fields.amount],
      ['boundary', fields.boundary],
      ['timezone', fields.timezone],
      ['businessCalendarId', fields.businessCalendarId],
      ['businessCalendarVersionId', fields.businessCalendarVersionId],
      ['consequence', consequence],
      ['citedInputAssertionVersionIds', inputAssertionIds],
      ['citationIds', citationIds],
      ['deadlineRuleId', fields.deadlineRuleId]
    ]);
  }

  async function deriveDeadlineDerivationId(value) {
    var canonical = canonicalize(value);
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'deadlineRuleId',
      'anchorAssertionVersionId',
      'anchorCivilDate',
      'windowStartCivilDate',
      'deadlineCivilDate',
      'boundary',
      'timezone',
      'consequence',
      'ruleVersion',
      'calendarId',
      'calendarVersionId',
      'inputAssertionVersionIds',
      'inputCitationIds',
      'trustState',
      'inputsCurrent',
      'inputsExact',
      'eligibility',
      'blockerCodes'
    ]);
    if (!fields || !canonical || fields.schemaVersion !== VERSION ||
        !validDigestId(fields.deadlineRuleId, 'str1:')) {
      return null;
    }
    return digestTuple('std1:', 'truth-deadline-derivation|', [canonical]);
  }

  async function parseDeadlineResult(value, ruleValues, assertionValues, citationValues) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'deadlineRuleId',
      'anchorAssertionVersionId',
      'anchorCivilDate',
      'windowStartCivilDate',
      'deadlineCivilDate',
      'boundary',
      'timezone',
      'consequence',
      'ruleVersion',
      'calendarId',
      'calendarVersionId',
      'inputAssertionVersionIds',
      'inputCitationIds',
      'trustState',
      'inputsCurrent',
      'inputsExact',
      'eligibility',
      'blockerCodes',
      'deadlineDerivationId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validDigestId(fields.deadlineRuleId, 'str1:') ||
        !validDigestId(fields.anchorAssertionVersionId, 'stav1:') ||
        !validCivilDate(fields.anchorCivilDate) ||
        !(fields.windowStartCivilDate === null ||
          validCivilDate(fields.windowStartCivilDate)) ||
        !(fields.deadlineCivilDate === null ||
          validCivilDate(fields.deadlineCivilDate)) ||
        !BOUNDARY_SET[fields.boundary] ||
        !(fields.timezone === null || validTimezone(fields.timezone)) ||
        fields.ruleVersion !== DEADLINE_RULE_VERSION ||
        !(fields.calendarId === null || validOpaque(fields.calendarId, 256)) ||
        !(fields.calendarVersionId === null ||
          validOpaque(fields.calendarVersionId, 256)) ||
        ((fields.calendarId === null) !== (fields.calendarVersionId === null)) ||
        !TRUST_STATE_SET[fields.trustState] ||
        typeof fields.inputsCurrent !== 'boolean' ||
        typeof fields.inputsExact !== 'boolean' ||
        (fields.eligibility !== 'eligible' && fields.eligibility !== 'ineligible') ||
        !validDigestId(fields.deadlineDerivationId, 'std1:')) {
      return null;
    }
    var assertionIds = parseIdArray(
      fields.inputAssertionVersionIds,
      'stav1:',
      MAX_ASSERTIONS_PER_FAMILY,
      1,
      false
    );
    var citationIds = parseIdArray(
      fields.inputCitationIds,
      'stc1:',
      MAX_FAMILY_CITATIONS,
      1,
      false
    );
    var blockerCodes = dataArrayValues(
      fields.blockerCodes,
      MAX_BLOCKER_CODES_PER_RESULT,
      0
    );
    if (!assertionIds || !citationIds || !blockerCodes ||
        blockerCodes.some(function(code) {
          return !BLOCKER_CODE_SET[code];
        }) || !isCanonicalStringArray(blockerCodes, true) ||
        assertionIds.indexOf(fields.anchorAssertionVersionId) < 0) {
      return null;
    }
    var assertionRegistry = await parseAssertionRegistry(
      assertionValues || [],
      citationValues || [],
      MAX_ASSERTIONS_PER_FAMILY,
      assertionIds.length
    );
    var citationRegistry = await parseCitationRegistry(
      citationValues || [],
      MAX_FAMILY_CITATIONS,
      citationIds.length
    );
    if (!assertionRegistry || !citationRegistry) return null;
    for (var assertionIndex = 0; assertionIndex < assertionIds.length; assertionIndex += 1) {
      if (!assertionRegistry.byVersionId[assertionIds[assertionIndex]]) return null;
    }
    for (var citationIndex = 0; citationIndex < citationIds.length; citationIndex += 1) {
      if (!citationRegistry.byId[citationIds[citationIndex]]) return null;
    }
    var consequence = fields.consequence === null
      ? null
      : parseConsequence(fields.consequence, assertionRegistry, citationRegistry);
    if (fields.consequence !== null && consequence === undefined) return null;
    var rules = dataArrayValues(ruleValues || [], MAX_RULES_PER_FAMILY, 1);
    if (!rules) return null;
    var matchingRule = null;
    for (var ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      if (rules[ruleIndex] && rules[ruleIndex].deadlineRuleId === fields.deadlineRuleId) {
        matchingRule = rules[ruleIndex];
        break;
      }
    }
    if (!matchingRule || matchingRule.familyId !== fields.familyId ||
        matchingRule.partitionKey !== fields.partitionKey) {
      return null;
    }
    if (fields.eligibility === 'eligible' &&
        (blockerCodes.length !== 0 || fields.inputsCurrent !== true ||
          fields.inputsExact !== true || fields.deadlineCivilDate === null ||
          fields.windowStartCivilDate === null || fields.timezone === null ||
          consequence === null)) {
      return null;
    }
    var normalized = {
      schemaVersion: VERSION,
      partitionKey: fields.partitionKey,
      familyId: fields.familyId,
      deadlineRuleId: fields.deadlineRuleId,
      anchorAssertionVersionId: fields.anchorAssertionVersionId,
      anchorCivilDate: fields.anchorCivilDate,
      windowStartCivilDate: fields.windowStartCivilDate,
      deadlineCivilDate: fields.deadlineCivilDate,
      boundary: fields.boundary,
      timezone: fields.timezone,
      consequence: consequence,
      ruleVersion: fields.ruleVersion,
      calendarId: fields.calendarId,
      calendarVersionId: fields.calendarVersionId,
      inputAssertionVersionIds: assertionIds,
      inputCitationIds: citationIds,
      trustState: fields.trustState,
      inputsCurrent: fields.inputsCurrent,
      inputsExact: fields.inputsExact,
      eligibility: fields.eligibility,
      blockerCodes: frozenArray(blockerCodes)
    };
    var expectedId = await deriveDeadlineDerivationId(normalized);
    if (fields.deadlineDerivationId !== expectedId) return null;
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['deadlineRuleId', fields.deadlineRuleId],
      ['anchorAssertionVersionId', fields.anchorAssertionVersionId],
      ['anchorCivilDate', fields.anchorCivilDate],
      ['windowStartCivilDate', fields.windowStartCivilDate],
      ['deadlineCivilDate', fields.deadlineCivilDate],
      ['boundary', fields.boundary],
      ['timezone', fields.timezone],
      ['consequence', consequence],
      ['ruleVersion', fields.ruleVersion],
      ['calendarId', fields.calendarId],
      ['calendarVersionId', fields.calendarVersionId],
      ['inputAssertionVersionIds', assertionIds],
      ['inputCitationIds', citationIds],
      ['trustState', fields.trustState],
      ['inputsCurrent', fields.inputsCurrent],
      ['inputsExact', fields.inputsExact],
      ['eligibility', fields.eligibility],
      ['blockerCodes', frozenArray(blockerCodes)],
      ['deadlineDerivationId', fields.deadlineDerivationId]
    ]);
  }

  function parseSourceBindings(value) {
    var inputs = dataArrayValues(value, MAX_SOURCES, 1);
    if (!inputs) return null;
    var output = [];
    var keys = [];
    for (var index = 0; index < inputs.length; index += 1) {
      var fields = dataValues(inputs[index], [
        'sourceFileId',
        'contentFingerprint',
        'fragmentGenerationId',
        'sourceState',
        'certified'
      ]);
      if (!fields || !validSourceFileId(fields.sourceFileId) ||
          !validFingerprint(fields.contentFingerprint) ||
          !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
          !SOURCE_STATE_SET[fields.sourceState] || typeof fields.certified !== 'boolean') {
        return null;
      }
      keys.push(fields.sourceFileId);
      output.push(frozenRecord([
        ['sourceFileId', fields.sourceFileId],
        ['contentFingerprint', fields.contentFingerprint],
        ['fragmentGenerationId', fields.fragmentGenerationId],
        ['sourceState', fields.sourceState],
        ['certified', fields.certified]
      ]));
    }
    if (!isCanonicalStringArray(keys, false)) return null;
    return frozenArray(output);
  }

  function collectCitationReferences(proof) {
    var output = Object.create(null);
    function add(values) {
      for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    }
    var binding = proof.evaluationContext.governingTimezoneBinding;
    if (binding.kind === 'cited') add(binding.citationIds);
    var axes = [
      proof.lineageProof.execution,
      proof.lineageProof.temporal,
      proof.lineageProof.lineageRole,
      proof.lineageProof.governance
    ];
    axes.forEach(function(axis) { add(axis.citationIds); });
    proof.lineageProof.overlays.forEach(function(item) { add(item.citationIds); });
    proof.lineageProof.inheritances.forEach(function(item) { add(item.citationIds); });
    proof.assertions.forEach(function(item) { add(item.citationIds); });
    proof.conflicts.forEach(function(item) { add(item.citationIds); });
    proof.deadlineRules.forEach(function(item) {
      add(item.citationIds);
      if (item.consequence) add(item.consequence.citationIds);
    });
    proof.deadlineResults.forEach(function(item) {
      add(item.inputCitationIds);
      if (item.consequence) add(item.consequence.citationIds);
    });
    return output;
  }

  async function parseConflictRegistry(values, assertionValues, citationValues, maximum) {
    var inputs = dataArrayValues(values, maximum, 0);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var conflict = await parseConflictSet(inputs[index], assertionValues, citationValues);
      if (!conflict || own(seen, conflict.conflictSetId)) return null;
      seen[conflict.conflictSetId] = conflict;
      output.push(conflict);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byId', Object.freeze(seen)]
    ]);
  }

  async function parseRuleRegistry(values, assertionValues, citationValues, maximum) {
    var inputs = dataArrayValues(values, maximum, 0);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var rule = await parseDeadlineRule(inputs[index], assertionValues, citationValues);
      if (!rule || own(seen, rule.deadlineRuleId)) return null;
      seen[rule.deadlineRuleId] = rule;
      output.push(rule);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byId', Object.freeze(seen)]
    ]);
  }

  async function parseResultRegistry(
    values,
    ruleValues,
    assertionValues,
    citationValues,
    maximum
  ) {
    var inputs = dataArrayValues(values, maximum, 0);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var result = await parseDeadlineResult(
        inputs[index],
        ruleValues,
        assertionValues,
        citationValues
      );
      if (!result || own(seen, result.deadlineDerivationId)) return null;
      seen[result.deadlineDerivationId] = result;
      output.push(result);
    }
    return frozenRecord([
      ['items', frozenArray(output)],
      ['byId', Object.freeze(seen)]
    ]);
  }

  function canonicalRecordOrder(items, key) {
    var values = items.map(function(item) { return item[key]; });
    return isCanonicalStringArray(values, false);
  }

  async function parseSemanticFamilyProof(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'authorizedSetDigest',
      'sourceBindings',
      'documentStableIds',
      'lineageRelationIds',
      'recordVersionIds',
      'relationVersionIds',
      'candidateGenerationIds',
      'candidateSchemaVersion',
      'promptVersion',
      'adjudicationVersion',
      'deadlineRuleVersion',
      'calendarVersion',
      'evaluationContext',
      'lineageProof',
      'assertions',
      'conflicts',
      'citations',
      'deadlineRules',
      'deadlineResults'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validAuthorizedSetDigest(fields.authorizedSetDigest) ||
        fields.candidateSchemaVersion !== CANDIDATE_SCHEMA_VERSION ||
        fields.promptVersion !== PROMPT_VERSION ||
        fields.adjudicationVersion !== ADJUDICATION_VERSION ||
        fields.deadlineRuleVersion !== DEADLINE_RULE_VERSION ||
        fields.calendarVersion !== CALENDAR_VERSION) {
      return null;
    }
    var sourceBindings = parseSourceBindings(fields.sourceBindings);
    var documentStableIds = parseIdArray(
      fields.documentStableIds,
      'sri1:',
      MAX_GRAPH_RECORD_VERSIONS,
      1,
      false
    );
    var lineageRelationIds = parseIdArray(
      fields.lineageRelationIds,
      ['slv1:', 'scv1:'],
      MAX_RELATION_VERSIONS,
      0,
      false
    );
    var recordVersionIds = parseIdArray(
      fields.recordVersionIds,
      'srv1:',
      MAX_GRAPH_RECORD_VERSIONS,
      1,
      false
    );
    var relationVersionIds = parseIdArray(
      fields.relationVersionIds,
      ['slv1:', 'scv1:'],
      MAX_RELATION_VERSIONS,
      0,
      false
    );
    var candidateGenerationIds = parseIdArray(
      fields.candidateGenerationIds,
      'stg1:',
      MAX_CANDIDATES_PER_SOURCE_GENERATION,
      1,
      false
    );
    if (!sourceBindings || !documentStableIds || !lineageRelationIds ||
        !recordVersionIds || !relationVersionIds || !candidateGenerationIds) {
      return null;
    }
    var expectedFamilyId = await deriveFamilyId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: fields.partitionKey,
      documentStableIds: documentStableIds,
      lineageRelationIds: lineageRelationIds
    });
    if (fields.familyId !== expectedFamilyId) return null;
    var citations = await parseCitationRegistry(
      fields.citations,
      MAX_FAMILY_CITATIONS,
      1
    );
    if (!citations || !canonicalRecordOrder(citations.items, 'citationId')) return null;
    var evaluationContext = parseEvaluationContext(fields.evaluationContext, citations.items);
    if (!evaluationContext) return null;
    var assertions = await parseAssertionRegistry(
      fields.assertions,
      citations.items,
      MAX_ASSERTIONS_PER_FAMILY,
      0,
      citations
    );
    if (!assertions || !canonicalRecordOrder(assertions.items, 'assertionVersionId')) return null;
    var conflicts = await parseConflictRegistry(
      fields.conflicts,
      assertions.items,
      citations.items,
      MAX_CONFLICTS_PER_FAMILY
    );
    if (!conflicts || !canonicalRecordOrder(conflicts.items, 'conflictSetId')) return null;
    var rules = await parseRuleRegistry(
      fields.deadlineRules,
      assertions.items,
      citations.items,
      MAX_RULES_PER_FAMILY
    );
    if (!rules || !canonicalRecordOrder(rules.items, 'deadlineRuleId')) return null;
    var results = await parseResultRegistry(
      fields.deadlineResults,
      rules.items,
      assertions.items,
      citations.items,
      MAX_RULES_PER_FAMILY
    );
    if (!results || !canonicalRecordOrder(results.items, 'deadlineDerivationId')) return null;
    var lineageProof = await parseLineageProof(fields.lineageProof, citations.items);
    if (!lineageProof || lineageProof.partitionKey !== fields.partitionKey ||
        lineageProof.familyId !== fields.familyId) {
      return null;
    }
    var recordSet = makeSet(recordVersionIds);
    var relationSet = makeSet(relationVersionIds);
    for (var citationIndex = 0; citationIndex < citations.items.length; citationIndex += 1) {
      var citation = citations.items[citationIndex];
      if (!recordSet[citation.recordVersionId] ||
          (citation.relationVersionId !== null && !relationSet[citation.relationVersionId])) {
        return null;
      }
    }
    var normalized = frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['authorizedSetDigest', fields.authorizedSetDigest],
      ['sourceBindings', sourceBindings],
      ['documentStableIds', documentStableIds],
      ['lineageRelationIds', lineageRelationIds],
      ['recordVersionIds', recordVersionIds],
      ['relationVersionIds', relationVersionIds],
      ['candidateGenerationIds', candidateGenerationIds],
      ['candidateSchemaVersion', CANDIDATE_SCHEMA_VERSION],
      ['promptVersion', PROMPT_VERSION],
      ['adjudicationVersion', ADJUDICATION_VERSION],
      ['deadlineRuleVersion', DEADLINE_RULE_VERSION],
      ['calendarVersion', CALENDAR_VERSION],
      ['evaluationContext', evaluationContext],
      ['lineageProof', lineageProof],
      ['assertions', assertions.items],
      ['conflicts', conflicts.items],
      ['citations', citations.items],
      ['deadlineRules', rules.items],
      ['deadlineResults', results.items]
    ]);
    var referenced = collectCitationReferences(normalized);
    var referenceIds = Object.keys(referenced).sort();
    if (referenceIds.length > MAX_FAMILY_CITATIONS ||
        referenceIds.length !== citations.items.length) {
      return null;
    }
    for (var referenceIndex = 0; referenceIndex < referenceIds.length; referenceIndex += 1) {
      if (!citations.byId[referenceIds[referenceIndex]]) return null;
    }
    var canonical = canonicalize(normalized);
    var Encoder = global && global.TextEncoder;
    if (!canonical || typeof Encoder !== 'function' ||
        new Encoder().encode(canonical).length > MAX_FAMILY_SNAPSHOT_BYTES) {
      return null;
    }
    return normalized;
  }

  function parseCategoryCounts(value) {
    var fields = dataValues(value, [
      'assertions',
      'citations',
      'conflicts',
      'deadlineResults',
      'deadlineRules'
    ]);
    if (!fields) return null;
    var entries = [
      ['assertions', MAX_ASSERTIONS_PER_FAMILY],
      ['citations', MAX_FAMILY_CITATIONS],
      ['conflicts', MAX_CONFLICTS_PER_FAMILY],
      ['deadlineResults', MAX_RULES_PER_FAMILY],
      ['deadlineRules', MAX_RULES_PER_FAMILY]
    ];
    for (var index = 0; index < entries.length; index += 1) {
      if (!validInteger(fields[entries[index][0]], 0, entries[index][1])) return null;
    }
    return frozenRecord(entries.map(function(entry) {
      return [entry[0], fields[entry[0]]];
    }));
  }

  function parseManifestPages(value, categoryCounts) {
    var inputs = dataArrayValues(value, MAX_PAGES, 1);
    if (!inputs) return null;
    var output = [];
    var keys = [];
    var totals = Object.create(null);
    Object.keys(PAGE_CATEGORY_SET).forEach(function(category) { totals[category] = 0; });
    for (var index = 0; index < inputs.length; index += 1) {
      var fields = dataValues(inputs[index], [
        'category',
        'pageOrdinal',
        'itemCount',
        'pageHash'
      ]);
      if (!fields || !PAGE_CATEGORY_SET[fields.category] ||
          !validInteger(fields.pageOrdinal, 0, MAX_PAGES - 1) ||
          !validInteger(fields.itemCount, 0, MAX_ASSERTIONS_PER_FAMILY) ||
          !validFingerprint(fields.pageHash)) {
        return null;
      }
      keys.push(fields.category + '\u0000' + String(fields.pageOrdinal).padStart(8, '0'));
      totals[fields.category] += fields.itemCount;
      output.push(frozenRecord([
        ['category', fields.category],
        ['pageOrdinal', fields.pageOrdinal],
        ['itemCount', fields.itemCount],
        ['pageHash', fields.pageHash]
      ]));
    }
    if (!isCanonicalStringArray(keys, false)) return null;
    var categories = Object.keys(PAGE_CATEGORY_SET);
    for (var categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
      var category = categories[categoryIndex];
      if (totals[category] !== categoryCounts[category]) return null;
    }
    return frozenArray(output);
  }

  async function deriveSnapshotId(value) {
    var canonical = canonicalize(value);
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'semanticProofDigest',
      'semanticProofBytes',
      'authorizedSetDigest',
      'sourceBindings',
      'recordVersionIds',
      'relationVersionIds',
      'candidateGenerationIds',
      'candidateSchemaVersion',
      'promptVersion',
      'adjudicationVersion',
      'deadlineRuleVersion',
      'calendarVersion',
      'evaluationContext',
      'categoryCounts',
      'pages'
    ]);
    if (!fields || !canonical || fields.schemaVersion !== SNAPSHOT_VERSION ||
        !validDigestId(fields.familyId, 'stf1:')) {
      return null;
    }
    return digestTuple('sts1:', 'truth-snapshot|', [canonical]);
  }

  async function parseFamilySnapshotManifest(value) {
    var fields = dataValues(value, [
      'schemaVersion',
      'partitionKey',
      'familyId',
      'semanticProofDigest',
      'semanticProofBytes',
      'authorizedSetDigest',
      'sourceBindings',
      'recordVersionIds',
      'relationVersionIds',
      'candidateGenerationIds',
      'candidateSchemaVersion',
      'promptVersion',
      'adjudicationVersion',
      'deadlineRuleVersion',
      'calendarVersion',
      'evaluationContext',
      'categoryCounts',
      'pages',
      'snapshotId'
    ]);
    if (!fields || fields.schemaVersion !== SNAPSHOT_VERSION ||
        !validOpaque(fields.partitionKey, MAX_OPAQUE) ||
        !validDigestId(fields.familyId, 'stf1:') ||
        !validFingerprint(fields.semanticProofDigest) ||
        !validInteger(fields.semanticProofBytes, 1, MAX_FAMILY_SNAPSHOT_BYTES) ||
        !validAuthorizedSetDigest(fields.authorizedSetDigest) ||
        fields.candidateSchemaVersion !== CANDIDATE_SCHEMA_VERSION ||
        fields.promptVersion !== PROMPT_VERSION ||
        fields.adjudicationVersion !== ADJUDICATION_VERSION ||
        fields.deadlineRuleVersion !== DEADLINE_RULE_VERSION ||
        fields.calendarVersion !== CALENDAR_VERSION ||
        !validDigestId(fields.snapshotId, 'sts1:')) {
      return null;
    }
    var sourceBindings = parseSourceBindings(fields.sourceBindings);
    var recordVersionIds = parseIdArray(
      fields.recordVersionIds,
      'srv1:',
      MAX_GRAPH_RECORD_VERSIONS,
      1,
      false
    );
    var relationVersionIds = parseIdArray(
      fields.relationVersionIds,
      ['slv1:', 'scv1:'],
      MAX_RELATION_VERSIONS,
      0,
      false
    );
    var candidateGenerationIds = parseIdArray(
      fields.candidateGenerationIds,
      'stg1:',
      MAX_CANDIDATES_PER_SOURCE_GENERATION,
      1,
      false
    );
    var evaluationContext = parseEvaluationContext(fields.evaluationContext);
    var categoryCounts = parseCategoryCounts(fields.categoryCounts);
    var pages = categoryCounts && parseManifestPages(fields.pages, categoryCounts);
    if (!sourceBindings || !recordVersionIds || !relationVersionIds ||
        !candidateGenerationIds || !evaluationContext || !categoryCounts || !pages) {
      return null;
    }
    var normalized = {
      schemaVersion: SNAPSHOT_VERSION,
      partitionKey: fields.partitionKey,
      familyId: fields.familyId,
      semanticProofDigest: fields.semanticProofDigest,
      semanticProofBytes: fields.semanticProofBytes,
      authorizedSetDigest: fields.authorizedSetDigest,
      sourceBindings: sourceBindings,
      recordVersionIds: recordVersionIds,
      relationVersionIds: relationVersionIds,
      candidateGenerationIds: candidateGenerationIds,
      candidateSchemaVersion: CANDIDATE_SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      adjudicationVersion: ADJUDICATION_VERSION,
      deadlineRuleVersion: DEADLINE_RULE_VERSION,
      calendarVersion: CALENDAR_VERSION,
      evaluationContext: evaluationContext,
      categoryCounts: categoryCounts,
      pages: pages
    };
    var expectedSnapshotId = await deriveSnapshotId(normalized);
    if (fields.snapshotId !== expectedSnapshotId) return null;
    return frozenRecord([
      ['schemaVersion', SNAPSHOT_VERSION],
      ['partitionKey', fields.partitionKey],
      ['familyId', fields.familyId],
      ['semanticProofDigest', fields.semanticProofDigest],
      ['semanticProofBytes', fields.semanticProofBytes],
      ['authorizedSetDigest', fields.authorizedSetDigest],
      ['sourceBindings', sourceBindings],
      ['recordVersionIds', recordVersionIds],
      ['relationVersionIds', relationVersionIds],
      ['candidateGenerationIds', candidateGenerationIds],
      ['candidateSchemaVersion', CANDIDATE_SCHEMA_VERSION],
      ['promptVersion', PROMPT_VERSION],
      ['adjudicationVersion', ADJUDICATION_VERSION],
      ['deadlineRuleVersion', DEADLINE_RULE_VERSION],
      ['calendarVersion', CALENDAR_VERSION],
      ['evaluationContext', evaluationContext],
      ['categoryCounts', categoryCounts],
      ['pages', pages],
      ['snapshotId', fields.snapshotId]
    ]);
  }

  LIMITS = frozenRecord([
    ['MAX_SOURCES', MAX_SOURCES],
    ['MAX_CANDIDATES_PER_BATCH', MAX_CANDIDATES_PER_BATCH],
    ['MAX_CANDIDATES_PER_SOURCE_GENERATION', MAX_CANDIDATES_PER_SOURCE_GENERATION],
    ['MAX_EVIDENCE_LOCATORS_PER_CANDIDATE', MAX_EVIDENCE_LOCATORS_PER_CANDIDATE],
    ['MAX_CITATIONS_PER_ASSERTION', MAX_CITATIONS_PER_ASSERTION],
    ['MAX_GRAPH_RECORD_VERSIONS', MAX_GRAPH_RECORD_VERSIONS],
    ['MAX_RELATION_VERSIONS', MAX_RELATION_VERSIONS],
    ['MAX_ASSERTIONS_PER_FAMILY', MAX_ASSERTIONS_PER_FAMILY],
    ['MAX_FAMILY_CITATIONS', MAX_FAMILY_CITATIONS],
    ['MAX_CONFLICTS_PER_FAMILY', MAX_CONFLICTS_PER_FAMILY],
    ['MAX_RULES_PER_FAMILY', MAX_RULES_PER_FAMILY],
    ['MAX_BLOCKER_CODES_PER_RESULT', MAX_BLOCKER_CODES_PER_RESULT],
    ['MAX_HOLIDAYS_PER_CALENDAR', MAX_HOLIDAYS_PER_CALENDAR],
    ['MAX_DAY_OFFSET_MAGNITUDE', MAX_DAY_OFFSET_MAGNITUDE],
    ['MAX_FAMILY_SNAPSHOT_BYTES', MAX_FAMILY_SNAPSHOT_BYTES],
    ['MAX_MINIMIZED_RESULT_BYTES', MAX_MINIMIZED_RESULT_BYTES]
  ]);

  var api = Object.freeze({
    VERSION: VERSION,
    IDENTITY_VERSION: IDENTITY_VERSION,
    CANDIDATE_SCHEMA_VERSION: CANDIDATE_SCHEMA_VERSION,
    PROMPT_VERSION: PROMPT_VERSION,
    ADJUDICATION_VERSION: ADJUDICATION_VERSION,
    DEADLINE_RULE_VERSION: DEADLINE_RULE_VERSION,
    CALENDAR_VERSION: CALENDAR_VERSION,
    SNAPSHOT_VERSION: SNAPSHOT_VERSION,
    LIMITS: LIMITS,
    ASSERTION_TYPES: ASSERTION_TYPES,
    TRUST_STATES: TRUST_STATES,
    SOURCE_STATES: SOURCE_STATES,
    EXECUTION_STATES: EXECUTION_STATES,
    TEMPORAL_STATES: TEMPORAL_STATES,
    LINEAGE_ROLES: LINEAGE_ROLES,
    GOVERNANCE_CONCLUSIONS: GOVERNANCE_CONCLUSIONS,
    AXIS_REASON_CODES: AXIS_REASON_CODES,
    DEADLINE_OPERATORS: DEADLINE_OPERATORS,
    BLOCKER_CODES: BLOCKER_CODES,
    parseCandidateEnvelope: parseCandidateEnvelope,
    parseCitation: parseCitation,
    parseAssertion: parseAssertion,
    parseConflictSet: parseConflictSet,
    parseLineageProof: parseLineageProof,
    parseBusinessCalendar: parseBusinessCalendar,
    parseEvaluationContext: parseEvaluationContext,
    parseDeadlineRule: parseDeadlineRule,
    parseDeadlineResult: parseDeadlineResult,
    parseSemanticFamilyProof: parseSemanticFamilyProof,
    parseFamilySnapshotManifest: parseFamilySnapshotManifest,
    deriveCitationId: deriveCitationId,
    deriveCandidateGenerationId: deriveCandidateGenerationId,
    deriveFamilyId: deriveFamilyId,
    deriveAssertionId: deriveAssertionId,
    deriveAssertionVersionId: deriveAssertionVersionId,
    deriveConflictSetId: deriveConflictSetId,
    deriveDeadlineRuleId: deriveDeadlineRuleId,
    deriveDeadlineDerivationId: deriveDeadlineDerivationId,
    deriveSnapshotId: deriveSnapshotId,
    canonicalize: canonicalize,
    sha256Hex: sha256Hex
  });

  global.FsbSkopeoTruthSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
