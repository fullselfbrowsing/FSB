(function(global) {
  'use strict';

  var VERSION = 'skopeo-graph-schema/1';
  var IDENTITY_VERSION = 'skopeo-graph-identity/1';
  var PROMPT_VERSION = 'skopeo-graph-extraction-prompt/1';
  var ENGINE_LOCAL_KEY = 'primary-evidence';
  var CANDIDATE_HANDLE_PREFIX = '@fsb:';

  var MAX_RECORDS = 128;
  var MAX_RELATIONS = 256;
  var MAX_EVIDENCE_LOCATORS = 4;
  var MAX_CANDIDATE_REF_LENGTH = 96;
  var MAX_LABEL_LENGTH = 1024;
  var MAX_PRIOR_CANDIDATES = 128;
  var MAX_PRIOR_CANDIDATE_BYTES = 16384;
  var MAX_EXCERPTS = 8;
  var MAX_EXCERPT_CHARACTERS = 24000;
  var MAX_BATCHES_PER_GENERATION = 8;
  var MAX_FRAGMENT_RECORDS = 1024;
  var MAX_FRAGMENT_RELATIONS = 2048;
  var MAX_SHARD_ENTRIES = 512;
  var MAX_SHARDS_PER_CATEGORY = 64;
  var MAX_CANONICAL_DEPTH = 20;
  var MAX_CANONICAL_KEYS = 64;
  var MAX_CANONICAL_ARRAY = 4096;
  var MAX_CANONICAL_STRING = 4096;
  var MAX_CANONICAL_NODES = 32768;
  var MAX_CANONICAL_OUTPUT = 1048576;

  var RECORD_KINDS = Object.freeze([
    'agreement',
    'amendment',
    'clause',
    'fact',
    'event',
    'owner',
    'policy-document',
    'memo'
  ]);
  var RELATION_PREDICATES = Object.freeze([
    'contains',
    'amends-candidate',
    'states-fact',
    'records-event',
    'assigned-owner',
    'references-policy',
    'references-memo'
  ]);
  var CROSS_DOCUMENT_PREDICATES = Object.freeze([
    'amends-candidate',
    'references-policy',
    'references-memo'
  ]);

  var RECORD_KIND_SET = makeSet(RECORD_KINDS);
  var RELATION_PREDICATE_SET = makeSet(RELATION_PREDICATES);
  var CROSS_DOCUMENT_PREDICATE_SET = makeSet(CROSS_DOCUMENT_PREDICATES);
  var DOCUMENT_KIND_SET = makeSet(['agreement', 'amendment', 'policy-document', 'memo']);
  var NAMED_TARGETS = Object.freeze(Object.assign(Object.create(null), {
    'states-fact': 'fact',
    'records-event': 'event',
    'assigned-owner': 'owner',
    'references-policy': 'policy-document',
    'references-memo': 'memo'
  }));

  var EXTRACTION_ENVELOPE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'batchId', 'records', 'relations'],
    properties: {
      schemaVersion: { const: 1 },
      batchId: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,64}$' },
      records: {
        type: 'array',
        maxItems: MAX_RECORDS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['candidateRef', 'kind', 'label', 'evidence'],
          properties: {
            candidateRef: {
              type: 'string',
              pattern: '^[A-Za-z0-9._:-]{1,96}$'
            },
            kind: { enum: RECORD_KINDS.slice() },
            label: { type: 'string', minLength: 1, maxLength: MAX_LABEL_LENGTH },
            evidence: { '$ref': '#/$defs/evidenceList' }
          }
        }
      },
      relations: {
        type: 'array',
        maxItems: MAX_RELATIONS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['fromCandidateRef', 'predicate', 'toCandidateRef', 'evidence'],
          properties: {
            fromCandidateRef: {
              type: 'string',
              pattern: '^(?:[A-Za-z0-9._:-]{1,96}|@fsb:[0-9a-f]{64})$'
            },
            predicate: { enum: RELATION_PREDICATES.slice() },
            toCandidateRef: {
              type: 'string',
              pattern: '^(?:[A-Za-z0-9._:-]{1,96}|@fsb:[0-9a-f]{64})$'
            },
            evidence: { '$ref': '#/$defs/evidenceList' }
          }
        }
      }
    },
    '$defs': {
      locator: {
        type: 'object',
        additionalProperties: false,
        required: ['excerptId', 'start', 'end'],
        properties: {
          excerptId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
          start: { type: 'integer', minimum: 0, maximum: MAX_EXCERPT_CHARACTERS },
          end: { type: 'integer', minimum: 1, maximum: MAX_EXCERPT_CHARACTERS }
        }
      },
      evidenceList: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_EVIDENCE_LOCATORS,
        items: { '$ref': '#/$defs/locator' }
      }
    }
  };

  var extractionValidator = makeExtractionValidator();

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function makeExtractionValidator() {
    try {
      var library = global && global.CfworkerJsonSchema;
      if (!library || typeof library.Validator !== 'function') return null;
      return new library.Validator(EXTRACTION_ENVELOPE_SCHEMA, '2020-12', false);
    } catch (_error) {
      return null;
    }
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
    if (!Array.isArray(value) || value.length > maximum || value.length < (minimum || 0)) return null;
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

  function validOpaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function validSourceFileId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validCandidateRef(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_CANDIDATE_REF_LENGTH &&
      /^[A-Za-z0-9._:-]+$/.test(value);
  }

  function validCandidateHandle(value) {
    return typeof value === 'string' && /^@fsb:[0-9a-f]{64}$/.test(value);
  }

  function validDigestId(value, prefix) {
    return typeof value === 'string' &&
      new RegExp('^' + prefix + '[0-9a-f]{64}$').test(value);
  }

  function validOrdinal(value, maximum) {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
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

  function validLabel(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_LABEL_LENGTH &&
      validUnicode(value) && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function validTerm(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      validUnicode(value) && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function descriptorSafeTree(value) {
    var state = { nodes: 0 };
    var ancestors = new Set();
    function visit(item, depth) {
      if (depth > MAX_CANONICAL_DEPTH || state.nodes >= MAX_CANONICAL_NODES) return false;
      state.nodes += 1;
      if (item === null || typeof item === 'boolean') return true;
      if (typeof item === 'string') {
        return item.length <= MAX_CANONICAL_STRING && validUnicode(item);
      }
      if (typeof item === 'number') return Number.isFinite(item);
      if (typeof item !== 'object' || ancestors.has(item)) return false;
      ancestors.add(item);
      var safe = false;
      if (Array.isArray(item)) {
        var items = dataArrayValues(item, MAX_CANONICAL_ARRAY, 0);
        if (items) {
          safe = true;
          for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            if (!visit(items[itemIndex], depth + 1)) {
              safe = false;
              break;
            }
          }
        }
      } else if (isPlainRecord(item)) {
        try {
          var keys = Reflect.ownKeys(item);
          if (keys.length <= MAX_CANONICAL_KEYS && !keys.some(function(key) {
            return typeof key !== 'string' || key.length > MAX_CANONICAL_STRING;
          })) {
            safe = true;
            for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
              var descriptor = Object.getOwnPropertyDescriptor(item, keys[keyIndex]);
              if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true ||
                  !visit(descriptor.value, depth + 1)) {
                safe = false;
                break;
              }
            }
          }
        } catch (_error) {
          safe = false;
        }
      }
      ancestors.delete(item);
      return safe;
    }
    try {
      return visit(value, 0);
    } catch (_error) {
      return false;
    }
  }

  function canonicalValue(value, ancestors, state, depth) {
    if (depth > MAX_CANONICAL_DEPTH || state.nodes >= MAX_CANONICAL_NODES) return null;
    state.nodes += 1;
    if (value === null) return 'null';
    if (typeof value === 'string') {
      return value.length <= MAX_CANONICAL_STRING && validUnicode(value) ? JSON.stringify(value) : null;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : null;
    if (typeof value !== 'object' || ancestors.has(value)) return null;
    ancestors.add(value);

    var output = null;
    if (Array.isArray(value)) {
      var items = dataArrayValues(value, MAX_CANONICAL_ARRAY, 0);
      if (items) {
        var canonicalItems = [];
        for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
          var item = canonicalValue(items[itemIndex], ancestors, state, depth + 1);
          if (item === null) {
            canonicalItems = null;
            break;
          }
          canonicalItems.push(item);
        }
        if (canonicalItems) output = '[' + canonicalItems.join(',') + ']';
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
            members.push(JSON.stringify(key) + ':' + child);
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

  async function deriveFragmentGenerationId(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint'
    ]);
    if (!fields || fields.schemaVersion !== VERSION || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) || !validFingerprint(fields.contentFingerprint)) {
      return null;
    }
    return digestTuple('sfg1:', 'fragment-generation|', [
      fields.schemaVersion,
      fields.partitionKey,
      fields.sourceFileId,
      fields.contentFingerprint
    ]);
  }

  function parsePrimaryLocator(value) {
    var fields = dataValues(value, ['sourceByteStart', 'sourceByteEnd']);
    if (!fields || !Number.isSafeInteger(fields.sourceByteStart) || fields.sourceByteStart < 0 ||
        !Number.isSafeInteger(fields.sourceByteEnd) ||
        fields.sourceByteEnd <= fields.sourceByteStart) {
      return null;
    }
    return fields;
  }

  async function deriveStableRecordId(value) {
    var fields = dataValues(value, [
      'identityVersion', 'partitionKey', 'sourceFileId', 'kind',
      'primaryLocator', 'engineLocalKey'
    ]);
    var locator = fields && parsePrimaryLocator(fields.primaryLocator);
    if (!fields || fields.identityVersion !== IDENTITY_VERSION ||
        fields.engineLocalKey !== ENGINE_LOCAL_KEY || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) || !RECORD_KIND_SET[fields.kind] || !locator) {
      return null;
    }
    return digestTuple('sri1:', 'stable-record|', [
      fields.identityVersion,
      fields.partitionKey,
      fields.sourceFileId,
      fields.kind,
      String(locator.sourceByteStart),
      String(locator.sourceByteEnd),
      fields.engineLocalKey
    ]);
  }

  async function deriveRecordVersionId(value) {
    var fields = dataValues(value, ['stableRecordId', 'fragmentGenerationId']);
    if (!fields || !validDigestId(fields.stableRecordId, 'sri1:') ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:')) {
      return null;
    }
    return digestTuple('srv1:', 'record-version|', [
      fields.stableRecordId,
      fields.fragmentGenerationId
    ]);
  }

  async function deriveCandidateHandle(value) {
    var fields = dataValues(value, [
      'fragmentGenerationId', 'batchOrdinal', 'candidateOrdinal', 'stableRecordId'
    ]);
    if (!fields || !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !validOrdinal(fields.batchOrdinal, MAX_BATCHES_PER_GENERATION - 1) ||
        !validOrdinal(fields.candidateOrdinal, MAX_RECORDS - 1) ||
        !validDigestId(fields.stableRecordId, 'sri1:')) {
      return null;
    }
    return digestTuple(CANDIDATE_HANDLE_PREFIX, 'candidate-handle|', [
      fields.fragmentGenerationId,
      String(fields.batchOrdinal),
      String(fields.candidateOrdinal),
      fields.stableRecordId
    ]);
  }

  async function deriveStableRelationId(value) {
    var fields = dataValues(value, [
      'identityVersion', 'partitionKey', 'sourceFileId', 'predicate',
      'fromStableRecordId', 'toStableRecordId', 'primaryLocator'
    ]);
    var locator = fields && parsePrimaryLocator(fields.primaryLocator);
    if (!fields || fields.identityVersion !== IDENTITY_VERSION ||
        !validOpaque(fields.partitionKey, 1024) || !validSourceFileId(fields.sourceFileId) ||
        !RELATION_PREDICATE_SET[fields.predicate] ||
        !validDigestId(fields.fromStableRecordId, 'sri1:') ||
        !validDigestId(fields.toStableRecordId, 'sri1:') || !locator) {
      return null;
    }
    return digestTuple('srl1:', 'stable-relation|', [
      fields.identityVersion,
      fields.partitionKey,
      fields.sourceFileId,
      fields.predicate,
      fields.fromStableRecordId,
      fields.toStableRecordId,
      String(locator.sourceByteStart),
      String(locator.sourceByteEnd)
    ]);
  }

  async function deriveRelationVersionId(value) {
    if (!isPlainRecord(value)) return null;
    var classDescriptor;
    try {
      classDescriptor = Object.getOwnPropertyDescriptor(value, 'relationClass');
    } catch (_error) {
      return null;
    }
    if (!classDescriptor || !own(classDescriptor, 'value') || classDescriptor.enumerable !== true) {
      return null;
    }
    if (classDescriptor.value === 'local') {
      var local = dataValues(value, [
        'relationClass', 'stableRelationId', 'fragmentGenerationId'
      ]);
      if (!local || !validDigestId(local.stableRelationId, 'srl1:') ||
          !validDigestId(local.fragmentGenerationId, 'sfg1:')) {
        return null;
      }
      return digestTuple('slv1:', 'local-relation-version|', [
        local.stableRelationId,
        local.fragmentGenerationId
      ]);
    }
    if (classDescriptor.value !== 'cross-document-candidate') return null;
    var candidate = dataValues(value, [
      'relationClass', 'partitionKey', 'relationKind', 'stableRelationId',
      'proposerRecordVersionId', 'proposerFragmentGenerationId',
      'targetRecordVersionId', 'targetFragmentGenerationId',
      'canonicalEvidenceLocatorIdentity'
    ]);
    if (!candidate || !validOpaque(candidate.partitionKey, 1024) ||
        !CROSS_DOCUMENT_PREDICATE_SET[candidate.relationKind] ||
        !validDigestId(candidate.stableRelationId, 'srl1:') ||
        !validDigestId(candidate.proposerRecordVersionId, 'srv1:') ||
        !validDigestId(candidate.proposerFragmentGenerationId, 'sfg1:') ||
        !validDigestId(candidate.targetRecordVersionId, 'srv1:') ||
        !validDigestId(candidate.targetFragmentGenerationId, 'sfg1:') ||
        typeof candidate.canonicalEvidenceLocatorIdentity !== 'string' ||
        candidate.canonicalEvidenceLocatorIdentity.length === 0 ||
        candidate.canonicalEvidenceLocatorIdentity.length > 4096) {
      return null;
    }
    return digestTuple('scv1:', 'candidate-relation-version|', [
      candidate.partitionKey,
      candidate.relationKind,
      candidate.stableRelationId,
      candidate.proposerRecordVersionId,
      candidate.proposerFragmentGenerationId,
      candidate.targetRecordVersionId,
      candidate.targetFragmentGenerationId,
      candidate.canonicalEvidenceLocatorIdentity
    ]);
  }

  function utf8Length(value) {
    try {
      var Encoder = global && global.TextEncoder;
      if (typeof Encoder !== 'function') return null;
      return new Encoder().encode(value).length;
    } catch (_error) {
      return null;
    }
  }

  function validStringBoundary(text, offset) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) return false;
    if (offset === 0 || offset === text.length) return true;
    var previous = text.charCodeAt(offset - 1);
    var next = text.charCodeAt(offset);
    return !(previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff);
  }

  function parseExcerptRegistry(value) {
    var entries = dataArrayValues(value, MAX_EXCERPTS, 1);
    if (!entries) return null;
    var seen = Object.create(null);
    var output = [];
    var totalCharacters = 0;
    for (var index = 0; index < entries.length; index += 1) {
      var fields = dataValues(entries[index], [
        'excerptId', 'text', 'sourceByteStart', 'sourceByteEnd'
      ]);
      if (!fields || typeof fields.excerptId !== 'string' ||
          !/^[A-Za-z0-9_-]{1,64}$/.test(fields.excerptId) || seen[fields.excerptId] ||
          typeof fields.text !== 'string' || fields.text.length > MAX_EXCERPT_CHARACTERS ||
          !validUnicode(fields.text) || !Number.isSafeInteger(fields.sourceByteStart) ||
          fields.sourceByteStart < 0 || !Number.isSafeInteger(fields.sourceByteEnd)) {
        return null;
      }
      var byteLength = utf8Length(fields.text);
      if (byteLength === null || fields.sourceByteEnd !== fields.sourceByteStart + byteLength) {
        return null;
      }
      totalCharacters += fields.text.length;
      if (totalCharacters > MAX_EXCERPT_CHARACTERS) return null;
      seen[fields.excerptId] = true;
      output.push(frozenRecord([
        ['excerptId', fields.excerptId],
        ['text', fields.text],
        ['sourceByteStart', fields.sourceByteStart],
        ['sourceByteEnd', fields.sourceByteEnd]
      ]));
    }
    return frozenArray(output);
  }

  async function deriveLocatorId(fields) {
    return digestTuple('sel1:', 'evidence-locator|', [
      fields.schemaVersion,
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

  async function parseLocatorWithRegistry(value, ownership, registry) {
    var fields = dataValues(value, ['excerptId', 'start', 'end']);
    if (!fields || typeof fields.excerptId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(fields.excerptId) ||
        !Number.isSafeInteger(fields.start) || !Number.isSafeInteger(fields.end) ||
        fields.start < 0 || fields.end <= fields.start || fields.end > MAX_EXCERPT_CHARACTERS) {
      return null;
    }
    var issued = null;
    for (var index = 0; index < registry.length; index += 1) {
      if (registry[index].excerptId === fields.excerptId) {
        issued = registry[index];
        break;
      }
    }
    if (!issued || fields.end > issued.text.length ||
        !validStringBoundary(issued.text, fields.start) ||
        !validStringBoundary(issued.text, fields.end)) {
      return null;
    }
    var prefixBytes = utf8Length(issued.text.slice(0, fields.start));
    var evidenceBytes = utf8Length(issued.text.slice(fields.start, fields.end));
    if (prefixBytes === null || evidenceBytes === null || evidenceBytes <= 0) return null;
    var sourceByteStart = issued.sourceByteStart + prefixBytes;
    var sourceByteEnd = sourceByteStart + evidenceBytes;
    if (sourceByteEnd > issued.sourceByteEnd) return null;
    var locatorFields = {
      schemaVersion: VERSION,
      partitionKey: ownership.partitionKey,
      sourceFileId: ownership.sourceFileId,
      contentFingerprint: ownership.contentFingerprint,
      fragmentGenerationId: ownership.fragmentGenerationId,
      excerptId: fields.excerptId,
      start: fields.start,
      end: fields.end,
      sourceByteStart: sourceByteStart,
      sourceByteEnd: sourceByteEnd
    };
    var locatorId = await deriveLocatorId(locatorFields);
    if (!locatorId) return null;
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', ownership.partitionKey],
      ['sourceFileId', ownership.sourceFileId],
      ['contentFingerprint', ownership.contentFingerprint],
      ['fragmentGenerationId', ownership.fragmentGenerationId],
      ['excerptId', fields.excerptId],
      ['start', fields.start],
      ['end', fields.end],
      ['sourceByteStart', sourceByteStart],
      ['sourceByteEnd', sourceByteEnd],
      ['locatorId', locatorId]
    ]);
  }

  async function parseEvidenceContext(value) {
    var fields = dataValues(value, [
      'partitionKey', 'sourceFileId', 'contentFingerprint',
      'fragmentGenerationId', 'excerpts'
    ]);
    if (!fields || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) || !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:')) {
      return null;
    }
    var expectedGeneration = await deriveFragmentGenerationId({
      schemaVersion: VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint
    });
    var excerpts = parseExcerptRegistry(fields.excerpts);
    if (!expectedGeneration || fields.fragmentGenerationId !== expectedGeneration || !excerpts) {
      return null;
    }
    return frozenRecord([
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['contentFingerprint', fields.contentFingerprint],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['excerpts', excerpts]
    ]);
  }

  async function parseEvidenceLocator(value, context) {
    var ownership = await parseEvidenceContext(context);
    if (!ownership) return null;
    return parseLocatorWithRegistry(value, ownership, ownership.excerpts);
  }

  async function parseEvidenceList(value, ownership, registry) {
    var entries = dataArrayValues(value, MAX_EVIDENCE_LOCATORS, 1);
    if (!entries) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      var locator = await parseLocatorWithRegistry(entries[index], ownership, registry);
      if (!locator || seen[locator.locatorId]) return null;
      seen[locator.locatorId] = true;
      output.push(locator);
    }
    return frozenArray(output);
  }

  async function parseStoredEvidenceLocator(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint',
      'fragmentGenerationId', 'excerptId', 'start', 'end',
      'sourceByteStart', 'sourceByteEnd', 'locatorId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) || !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        typeof fields.excerptId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(fields.excerptId) ||
        !Number.isSafeInteger(fields.start) || fields.start < 0 ||
        !Number.isSafeInteger(fields.end) || fields.end <= fields.start ||
        fields.end > MAX_EXCERPT_CHARACTERS ||
        !Number.isSafeInteger(fields.sourceByteStart) || fields.sourceByteStart < 0 ||
        !Number.isSafeInteger(fields.sourceByteEnd) || fields.sourceByteEnd <= fields.sourceByteStart ||
        !validDigestId(fields.locatorId, 'sel1:')) {
      return null;
    }
    var expectedGeneration = await deriveFragmentGenerationId({
      schemaVersion: VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint
    });
    var expectedLocator = await deriveLocatorId(fields);
    if (fields.fragmentGenerationId !== expectedGeneration || fields.locatorId !== expectedLocator) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
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

  async function parseStoredEvidenceList(value) {
    var entries = dataArrayValues(value, MAX_EVIDENCE_LOCATORS, 1);
    if (!entries) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      var locator = await parseStoredEvidenceLocator(entries[index]);
      if (!locator || seen[locator.locatorId]) return null;
      seen[locator.locatorId] = true;
      output.push(locator);
    }
    return frozenArray(output);
  }

  function endpointKindsAllowed(predicate, fromKind, toKind) {
    if (!RELATION_PREDICATE_SET[predicate] || !RECORD_KIND_SET[fromKind] ||
        !RECORD_KIND_SET[toKind]) {
      return false;
    }
    if (predicate === 'contains') return !!DOCUMENT_KIND_SET[fromKind] && toKind === 'clause';
    if (predicate === 'amends-candidate') {
      return fromKind === 'amendment' && (toKind === 'agreement' || toKind === 'clause');
    }
    return NAMED_TARGETS[predicate] === toKind;
  }

  async function parsePriorCandidates(value, context) {
    var entries = dataArrayValues(value, MAX_PRIOR_CANDIDATES, 0);
    if (!entries) return null;
    var byHandle = Object.create(null);
    var stableIds = Object.create(null);
    var projection = [];
    for (var index = 0; index < entries.length; index += 1) {
      var fields = dataValues(entries[index], [
        'handle', 'kind', 'stableRecordId', 'recordVersionId',
        'fragmentGenerationId', 'sourceFileId', 'batchOrdinal', 'candidateOrdinal'
      ]);
      if (!fields || !validCandidateHandle(fields.handle) || !RECORD_KIND_SET[fields.kind] ||
          !validDigestId(fields.stableRecordId, 'sri1:') ||
          !validDigestId(fields.recordVersionId, 'srv1:') ||
          fields.fragmentGenerationId !== context.fragmentGenerationId ||
          fields.sourceFileId !== context.sourceFileId ||
          !validOrdinal(fields.batchOrdinal, MAX_BATCHES_PER_GENERATION - 1) ||
          fields.batchOrdinal >= context.batchOrdinal ||
          !validOrdinal(fields.candidateOrdinal, MAX_RECORDS - 1) ||
          own(byHandle, fields.handle) || own(stableIds, fields.stableRecordId)) {
        return null;
      }
      var expectedVersion = await deriveRecordVersionId({
        stableRecordId: fields.stableRecordId,
        fragmentGenerationId: fields.fragmentGenerationId
      });
      var expectedHandle = await deriveCandidateHandle({
        fragmentGenerationId: fields.fragmentGenerationId,
        batchOrdinal: fields.batchOrdinal,
        candidateOrdinal: fields.candidateOrdinal,
        stableRecordId: fields.stableRecordId
      });
      if (fields.recordVersionId !== expectedVersion || fields.handle !== expectedHandle) return null;
      var parsed = frozenRecord([
        ['handle', fields.handle],
        ['kind', fields.kind],
        ['stableRecordId', fields.stableRecordId],
        ['recordVersionId', fields.recordVersionId],
        ['fragmentGenerationId', fields.fragmentGenerationId],
        ['sourceFileId', fields.sourceFileId],
        ['batchOrdinal', fields.batchOrdinal],
        ['candidateOrdinal', fields.candidateOrdinal]
      ]);
      byHandle[fields.handle] = parsed;
      stableIds[fields.stableRecordId] = true;
      projection.push({ handle: fields.handle, kind: fields.kind });
    }
    var serialized = JSON.stringify(projection);
    var byteLength = utf8Length(serialized);
    if (byteLength === null || byteLength > MAX_PRIOR_CANDIDATE_BYTES) return null;
    return frozenRecord([
      ['byHandle', Object.freeze(byHandle)],
      ['stableIds', Object.freeze(stableIds)]
    ]);
  }

  async function parseExtractionContext(value) {
    var fields = dataValues(value, [
      'partitionKey', 'sourceFileId', 'contentFingerprint', 'fragmentGenerationId',
      'excerpts', 'batchOrdinal', 'priorCandidates'
    ]);
    if (!fields || !validOrdinal(fields.batchOrdinal, MAX_BATCHES_PER_GENERATION - 1)) return null;
    var evidenceContext = await parseEvidenceContext({
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint,
      fragmentGenerationId: fields.fragmentGenerationId,
      excerpts: fields.excerpts
    });
    if (!evidenceContext) return null;
    var context = frozenRecord([
      ['partitionKey', evidenceContext.partitionKey],
      ['sourceFileId', evidenceContext.sourceFileId],
      ['contentFingerprint', evidenceContext.contentFingerprint],
      ['fragmentGenerationId', evidenceContext.fragmentGenerationId],
      ['excerpts', evidenceContext.excerpts],
      ['batchOrdinal', fields.batchOrdinal]
    ]);
    var prior = await parsePriorCandidates(fields.priorCandidates, context);
    if (!prior) return null;
    return frozenRecord([
      ['partitionKey', context.partitionKey],
      ['sourceFileId', context.sourceFileId],
      ['contentFingerprint', context.contentFingerprint],
      ['fragmentGenerationId', context.fragmentGenerationId],
      ['excerpts', context.excerpts],
      ['batchOrdinal', context.batchOrdinal],
      ['prior', prior]
    ]);
  }

  function extractionSchemaValid(value) {
    if (!extractionValidator || !descriptorSafeTree(value)) return false;
    try {
      var result = extractionValidator.validate(value);
      return !!result && result.valid === true;
    } catch (_error) {
      return false;
    }
  }

  async function parseExtractionEnvelope(value, contextValue) {
    var context = await parseExtractionContext(contextValue);
    if (!context || !extractionSchemaValid(value)) return null;
    var envelopeFields = dataValues(value, ['schemaVersion', 'batchId', 'records', 'relations']);
    if (!envelopeFields || envelopeFields.schemaVersion !== 1 ||
        typeof envelopeFields.batchId !== 'string' ||
        !/^[A-Za-z0-9_-]{16,64}$/.test(envelopeFields.batchId)) {
      return null;
    }
    var recordInputs = dataArrayValues(envelopeFields.records, MAX_RECORDS, 0);
    var relationInputs = dataArrayValues(envelopeFields.relations, MAX_RELATIONS, 0);
    if (!recordInputs || !relationInputs) return null;

    var records = [];
    var byRef = Object.create(null);
    var stableIds = Object.create(null);
    for (var recordIndex = 0; recordIndex < recordInputs.length; recordIndex += 1) {
      var recordFields = dataValues(recordInputs[recordIndex], [
        'candidateRef', 'kind', 'label', 'evidence'
      ]);
      if (!recordFields || !validCandidateRef(recordFields.candidateRef) ||
          own(byRef, recordFields.candidateRef) || !RECORD_KIND_SET[recordFields.kind] ||
          !validLabel(recordFields.label)) {
        return null;
      }
      var evidence = await parseEvidenceList(recordFields.evidence, context, context.excerpts);
      if (!evidence) return null;
      var stableRecordId = await deriveStableRecordId({
        identityVersion: IDENTITY_VERSION,
        partitionKey: context.partitionKey,
        sourceFileId: context.sourceFileId,
        kind: recordFields.kind,
        primaryLocator: {
          sourceByteStart: evidence[0].sourceByteStart,
          sourceByteEnd: evidence[0].sourceByteEnd
        },
        engineLocalKey: ENGINE_LOCAL_KEY
      });
      var recordVersionId = await deriveRecordVersionId({
        stableRecordId: stableRecordId,
        fragmentGenerationId: context.fragmentGenerationId
      });
      var candidateHandle = await deriveCandidateHandle({
        fragmentGenerationId: context.fragmentGenerationId,
        batchOrdinal: context.batchOrdinal,
        candidateOrdinal: recordIndex,
        stableRecordId: stableRecordId
      });
      if (!stableRecordId || !recordVersionId || !candidateHandle || own(stableIds, stableRecordId) ||
          own(context.prior.stableIds, stableRecordId)) {
        return null;
      }
      var parsedRecord = frozenRecord([
        ['schemaVersion', VERSION],
        ['partitionKey', context.partitionKey],
        ['sourceFileId', context.sourceFileId],
        ['contentFingerprint', context.contentFingerprint],
        ['fragmentGenerationId', context.fragmentGenerationId],
        ['batchOrdinal', context.batchOrdinal],
        ['candidateOrdinal', recordIndex],
        ['candidateRef', recordFields.candidateRef],
        ['candidateHandle', candidateHandle],
        ['kind', recordFields.kind],
        ['label', recordFields.label],
        ['evidence', evidence],
        ['stableRecordId', stableRecordId],
        ['recordVersionId', recordVersionId]
      ]);
      byRef[recordFields.candidateRef] = parsedRecord;
      stableIds[stableRecordId] = true;
      records.push(parsedRecord);
    }

    var relations = [];
    var relationVersions = Object.create(null);
    for (var relationIndex = 0; relationIndex < relationInputs.length; relationIndex += 1) {
      var relationFields = dataValues(relationInputs[relationIndex], [
        'fromCandidateRef', 'predicate', 'toCandidateRef', 'evidence'
      ]);
      if (!relationFields || !RELATION_PREDICATE_SET[relationFields.predicate]) return null;
      var from = validCandidateHandle(relationFields.fromCandidateRef)
        ? context.prior.byHandle[relationFields.fromCandidateRef]
        : byRef[relationFields.fromCandidateRef];
      var to = validCandidateHandle(relationFields.toCandidateRef)
        ? context.prior.byHandle[relationFields.toCandidateRef]
        : byRef[relationFields.toCandidateRef];
      if (!from || !to || !endpointKindsAllowed(relationFields.predicate, from.kind, to.kind)) {
        return null;
      }
      var relationEvidence = await parseEvidenceList(
        relationFields.evidence,
        context,
        context.excerpts
      );
      if (!relationEvidence) return null;
      var stableRelationId = await deriveStableRelationId({
        identityVersion: IDENTITY_VERSION,
        partitionKey: context.partitionKey,
        sourceFileId: context.sourceFileId,
        predicate: relationFields.predicate,
        fromStableRecordId: from.stableRecordId,
        toStableRecordId: to.stableRecordId,
        primaryLocator: {
          sourceByteStart: relationEvidence[0].sourceByteStart,
          sourceByteEnd: relationEvidence[0].sourceByteEnd
        }
      });
      var relationVersionId = await deriveRelationVersionId({
        relationClass: 'local',
        stableRelationId: stableRelationId,
        fragmentGenerationId: context.fragmentGenerationId
      });
      if (!stableRelationId || !relationVersionId || own(relationVersions, relationVersionId)) {
        return null;
      }
      relationVersions[relationVersionId] = true;
      relations.push(frozenRecord([
        ['schemaVersion', VERSION],
        ['relationClass', 'local'],
        ['partitionKey', context.partitionKey],
        ['sourceFileId', context.sourceFileId],
        ['fragmentGenerationId', context.fragmentGenerationId],
        ['predicate', relationFields.predicate],
        ['fromStableRecordId', from.stableRecordId],
        ['fromRecordVersionId', from.recordVersionId],
        ['toStableRecordId', to.stableRecordId],
        ['toRecordVersionId', to.recordVersionId],
        ['evidence', relationEvidence],
        ['stableRelationId', stableRelationId],
        ['relationVersionId', relationVersionId]
      ]));
    }

    return frozenRecord([
      ['schemaVersion', 1],
      ['batchId', envelopeFields.batchId],
      ['fragmentGenerationId', context.fragmentGenerationId],
      ['batchOrdinal', context.batchOrdinal],
      ['records', frozenArray(records)],
      ['relations', frozenArray(relations)]
    ]);
  }

  function parseCandidateRelationIntent(value) {
    var fields = dataValues(value, [
      'partitionKey', 'relationKind', 'proposingSourceFileId', 'targetSourceFileId',
      'fromStableRecordId', 'toStableRecordId', 'evidenceLocatorIds'
    ]);
    var locatorIds = fields && dataArrayValues(
      fields.evidenceLocatorIds,
      MAX_EVIDENCE_LOCATORS,
      1
    );
    if (!fields || !validOpaque(fields.partitionKey, 1024) ||
        !CROSS_DOCUMENT_PREDICATE_SET[fields.relationKind] ||
        !validSourceFileId(fields.proposingSourceFileId) ||
        !validSourceFileId(fields.targetSourceFileId) ||
        fields.proposingSourceFileId === fields.targetSourceFileId ||
        !validDigestId(fields.fromStableRecordId, 'sri1:') ||
        !validDigestId(fields.toStableRecordId, 'sri1:') || !locatorIds ||
        locatorIds.some(function(item) { return !validDigestId(item, 'sel1:'); }) ||
        new Set(locatorIds).size !== locatorIds.length) {
      return null;
    }
    locatorIds.sort();
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['relationClass', 'cross-document-candidate-intent'],
      ['partitionKey', fields.partitionKey],
      ['relationKind', fields.relationKind],
      ['proposingSourceFileId', fields.proposingSourceFileId],
      ['targetSourceFileId', fields.targetSourceFileId],
      ['fromStableRecordId', fields.fromStableRecordId],
      ['toStableRecordId', fields.toStableRecordId],
      ['evidenceLocatorIds', frozenArray(locatorIds)]
    ]);
  }

  function canonicalEvidenceIdentity(evidence) {
    var entries = evidence.map(function(item) {
      return frozenRecord([
        ['locatorId', item.locatorId],
        ['sourceByteStart', item.sourceByteStart],
        ['sourceByteEnd', item.sourceByteEnd]
      ]);
    });
    entries.sort(function(left, right) {
      return left.locatorId.localeCompare(right.locatorId) ||
        left.sourceByteStart - right.sourceByteStart ||
        left.sourceByteEnd - right.sourceByteEnd;
    });
    return canonicalize(entries);
  }

  async function parseCandidateRelation(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'relationClass', 'partitionKey', 'relationKind',
      'proposingSourceFileId', 'targetSourceFileId',
      'fromStableRecordId', 'toStableRecordId', 'stableRelationId',
      'proposerRecordVersionId', 'proposerFragmentGenerationId',
      'targetRecordVersionId', 'targetFragmentGenerationId',
      'evidence', 'canonicalEvidenceLocatorIdentity', 'relationVersionId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION ||
        fields.relationClass !== 'cross-document-candidate' ||
        !validOpaque(fields.partitionKey, 1024) ||
        !CROSS_DOCUMENT_PREDICATE_SET[fields.relationKind] ||
        !validSourceFileId(fields.proposingSourceFileId) ||
        !validSourceFileId(fields.targetSourceFileId) ||
        fields.proposingSourceFileId === fields.targetSourceFileId ||
        !validDigestId(fields.fromStableRecordId, 'sri1:') ||
        !validDigestId(fields.toStableRecordId, 'sri1:') ||
        !validDigestId(fields.stableRelationId, 'srl1:') ||
        !validDigestId(fields.proposerRecordVersionId, 'srv1:') ||
        !validDigestId(fields.proposerFragmentGenerationId, 'sfg1:') ||
        !validDigestId(fields.targetRecordVersionId, 'srv1:') ||
        !validDigestId(fields.targetFragmentGenerationId, 'sfg1:') ||
        !validDigestId(fields.relationVersionId, 'scv1:')) {
      return null;
    }
    var evidence = await parseStoredEvidenceList(fields.evidence);
    if (!evidence || evidence.some(function(locator) {
      return locator.partitionKey !== fields.partitionKey ||
        locator.sourceFileId !== fields.proposingSourceFileId ||
        locator.fragmentGenerationId !== fields.proposerFragmentGenerationId;
    })) {
      return null;
    }
    var evidenceIdentity = canonicalEvidenceIdentity(evidence);
    if (!evidenceIdentity || fields.canonicalEvidenceLocatorIdentity !== evidenceIdentity) return null;
    var expectedStableId = await deriveStableRelationId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.proposingSourceFileId,
      predicate: fields.relationKind,
      fromStableRecordId: fields.fromStableRecordId,
      toStableRecordId: fields.toStableRecordId,
      primaryLocator: {
        sourceByteStart: evidence[0].sourceByteStart,
        sourceByteEnd: evidence[0].sourceByteEnd
      }
    });
    var expectedVersionId = await deriveRelationVersionId({
      relationClass: 'cross-document-candidate',
      partitionKey: fields.partitionKey,
      relationKind: fields.relationKind,
      stableRelationId: fields.stableRelationId,
      proposerRecordVersionId: fields.proposerRecordVersionId,
      proposerFragmentGenerationId: fields.proposerFragmentGenerationId,
      targetRecordVersionId: fields.targetRecordVersionId,
      targetFragmentGenerationId: fields.targetFragmentGenerationId,
      canonicalEvidenceLocatorIdentity: fields.canonicalEvidenceLocatorIdentity
    });
    var expectedProposerRecordVersionId = await deriveRecordVersionId({
      stableRecordId: fields.fromStableRecordId,
      fragmentGenerationId: fields.proposerFragmentGenerationId
    });
    var expectedTargetRecordVersionId = await deriveRecordVersionId({
      stableRecordId: fields.toStableRecordId,
      fragmentGenerationId: fields.targetFragmentGenerationId
    });
    if (fields.stableRelationId !== expectedStableId || fields.relationVersionId !== expectedVersionId) {
      return null;
    }
    if (fields.proposerRecordVersionId !== expectedProposerRecordVersionId ||
        fields.targetRecordVersionId !== expectedTargetRecordVersionId) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['relationClass', 'cross-document-candidate'],
      ['partitionKey', fields.partitionKey],
      ['relationKind', fields.relationKind],
      ['proposingSourceFileId', fields.proposingSourceFileId],
      ['targetSourceFileId', fields.targetSourceFileId],
      ['fromStableRecordId', fields.fromStableRecordId],
      ['toStableRecordId', fields.toStableRecordId],
      ['stableRelationId', fields.stableRelationId],
      ['proposerRecordVersionId', fields.proposerRecordVersionId],
      ['proposerFragmentGenerationId', fields.proposerFragmentGenerationId],
      ['targetRecordVersionId', fields.targetRecordVersionId],
      ['targetFragmentGenerationId', fields.targetFragmentGenerationId],
      ['evidence', evidence],
      ['canonicalEvidenceLocatorIdentity', evidenceIdentity],
      ['relationVersionId', fields.relationVersionId]
    ]);
  }

  async function deriveCandidateOverlayGenerationId(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'partitionKey', 'proposingSourceFileId',
      'proposingFragmentGenerationId', 'relations'
    ]);
    var relationInputs = fields && dataArrayValues(fields.relations, MAX_RELATIONS, 1);
    if (!fields || fields.schemaVersion !== VERSION || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.proposingSourceFileId) ||
        !validDigestId(fields.proposingFragmentGenerationId, 'sfg1:') || !relationInputs) {
      return null;
    }
    var entries = [];
    var seen = Object.create(null);
    for (var index = 0; index < relationInputs.length; index += 1) {
      var relation = await parseCandidateRelation(relationInputs[index]);
      if (!relation || relation.partitionKey !== fields.partitionKey ||
          relation.proposingSourceFileId !== fields.proposingSourceFileId ||
          relation.proposerFragmentGenerationId !== fields.proposingFragmentGenerationId ||
          own(seen, relation.relationVersionId)) {
        return null;
      }
      seen[relation.relationVersionId] = true;
      entries.push(frozenRecord([
        ['relationVersionId', relation.relationVersionId],
        ['relationKind', relation.relationKind],
        ['stableRelationId', relation.stableRelationId],
        ['proposerRecordVersionId', relation.proposerRecordVersionId],
        ['proposerFragmentGenerationId', relation.proposerFragmentGenerationId],
        ['targetRecordVersionId', relation.targetRecordVersionId],
        ['targetFragmentGenerationId', relation.targetFragmentGenerationId],
        ['canonicalEvidenceLocatorIdentity', relation.canonicalEvidenceLocatorIdentity]
      ]));
    }
    entries.sort(function(left, right) {
      return left.relationVersionId.localeCompare(right.relationVersionId);
    });
    var completeSet = canonicalize(entries);
    if (!completeSet) return null;
    return digestTuple('sog1:', 'candidate-overlay-generation|', [
      fields.schemaVersion,
      fields.partitionKey,
      fields.proposingSourceFileId,
      fields.proposingFragmentGenerationId,
      completeSet
    ]);
  }

  async function parseDurableRecord(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint',
      'fragmentGenerationId', 'kind', 'label', 'evidence',
      'stableRecordId', 'recordVersionId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) || !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !RECORD_KIND_SET[fields.kind] || !validLabel(fields.label) ||
        !validDigestId(fields.stableRecordId, 'sri1:') ||
        !validDigestId(fields.recordVersionId, 'srv1:')) {
      return null;
    }
    var evidence = await parseStoredEvidenceList(fields.evidence);
    if (!evidence || evidence.some(function(locator) {
      return locator.partitionKey !== fields.partitionKey ||
        locator.sourceFileId !== fields.sourceFileId ||
        locator.contentFingerprint !== fields.contentFingerprint ||
        locator.fragmentGenerationId !== fields.fragmentGenerationId;
    })) {
      return null;
    }
    var expectedGeneration = await deriveFragmentGenerationId({
      schemaVersion: VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint
    });
    var expectedStable = await deriveStableRecordId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      kind: fields.kind,
      primaryLocator: {
        sourceByteStart: evidence[0].sourceByteStart,
        sourceByteEnd: evidence[0].sourceByteEnd
      },
      engineLocalKey: ENGINE_LOCAL_KEY
    });
    var expectedVersion = await deriveRecordVersionId({
      stableRecordId: fields.stableRecordId,
      fragmentGenerationId: fields.fragmentGenerationId
    });
    if (fields.fragmentGenerationId !== expectedGeneration ||
        fields.stableRecordId !== expectedStable || fields.recordVersionId !== expectedVersion) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['contentFingerprint', fields.contentFingerprint],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['kind', fields.kind],
      ['label', fields.label],
      ['evidence', evidence],
      ['stableRecordId', fields.stableRecordId],
      ['recordVersionId', fields.recordVersionId]
    ]);
  }

  async function parseDurableLocalRelation(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'relationClass', 'partitionKey', 'sourceFileId',
      'fragmentGenerationId', 'predicate', 'fromStableRecordId', 'fromRecordVersionId',
      'toStableRecordId', 'toRecordVersionId', 'evidence',
      'stableRelationId', 'relationVersionId'
    ]);
    if (!fields || fields.schemaVersion !== VERSION || fields.relationClass !== 'local' ||
        !validOpaque(fields.partitionKey, 1024) || !validSourceFileId(fields.sourceFileId) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !RELATION_PREDICATE_SET[fields.predicate] ||
        !validDigestId(fields.fromStableRecordId, 'sri1:') ||
        !validDigestId(fields.fromRecordVersionId, 'srv1:') ||
        !validDigestId(fields.toStableRecordId, 'sri1:') ||
        !validDigestId(fields.toRecordVersionId, 'srv1:') ||
        !validDigestId(fields.stableRelationId, 'srl1:') ||
        !validDigestId(fields.relationVersionId, 'slv1:')) {
      return null;
    }
    var evidence = await parseStoredEvidenceList(fields.evidence);
    if (!evidence || evidence.some(function(locator) {
      return locator.partitionKey !== fields.partitionKey ||
        locator.sourceFileId !== fields.sourceFileId ||
        locator.fragmentGenerationId !== fields.fragmentGenerationId;
    })) {
      return null;
    }
    var expectedStable = await deriveStableRelationId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      predicate: fields.predicate,
      fromStableRecordId: fields.fromStableRecordId,
      toStableRecordId: fields.toStableRecordId,
      primaryLocator: {
        sourceByteStart: evidence[0].sourceByteStart,
        sourceByteEnd: evidence[0].sourceByteEnd
      }
    });
    var expectedVersion = await deriveRelationVersionId({
      relationClass: 'local',
      stableRelationId: fields.stableRelationId,
      fragmentGenerationId: fields.fragmentGenerationId
    });
    if (fields.stableRelationId !== expectedStable || fields.relationVersionId !== expectedVersion) {
      return null;
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['relationClass', 'local'],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['predicate', fields.predicate],
      ['fromStableRecordId', fields.fromStableRecordId],
      ['fromRecordVersionId', fields.fromRecordVersionId],
      ['toStableRecordId', fields.toStableRecordId],
      ['toRecordVersionId', fields.toRecordVersionId],
      ['evidence', evidence],
      ['stableRelationId', fields.stableRelationId],
      ['relationVersionId', fields.relationVersionId]
    ]);
  }

  async function parseFragment(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'promptVersion', 'partitionKey', 'sourceFileId',
      'contentFingerprint', 'fragmentGenerationId', 'providerId', 'modelId',
      'records', 'relations'
    ]);
    var recordInputs = fields && dataArrayValues(fields.records, MAX_FRAGMENT_RECORDS, 0);
    var relationInputs = fields && dataArrayValues(fields.relations, MAX_FRAGMENT_RELATIONS, 0);
    if (!fields || fields.schemaVersion !== VERSION || fields.promptVersion !== PROMPT_VERSION ||
        !validOpaque(fields.partitionKey, 1024) || !validSourceFileId(fields.sourceFileId) ||
        !validFingerprint(fields.contentFingerprint) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !validOpaque(fields.providerId, 128) || !validOpaque(fields.modelId, 128) ||
        !recordInputs || !relationInputs) {
      return null;
    }
    var expectedGeneration = await deriveFragmentGenerationId({
      schemaVersion: VERSION,
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      contentFingerprint: fields.contentFingerprint
    });
    if (fields.fragmentGenerationId !== expectedGeneration) return null;
    var records = [];
    var recordByStableId = Object.create(null);
    for (var recordIndex = 0; recordIndex < recordInputs.length; recordIndex += 1) {
      var record = await parseDurableRecord(recordInputs[recordIndex]);
      if (!record || record.partitionKey !== fields.partitionKey ||
          record.sourceFileId !== fields.sourceFileId ||
          record.contentFingerprint !== fields.contentFingerprint ||
          record.fragmentGenerationId !== fields.fragmentGenerationId ||
          own(recordByStableId, record.stableRecordId)) {
        return null;
      }
      recordByStableId[record.stableRecordId] = record;
      records.push(record);
    }
    var relations = [];
    var relationVersions = Object.create(null);
    for (var relationIndex = 0; relationIndex < relationInputs.length; relationIndex += 1) {
      var relation = await parseDurableLocalRelation(relationInputs[relationIndex]);
      var from = relation && recordByStableId[relation.fromStableRecordId];
      var to = relation && recordByStableId[relation.toStableRecordId];
      if (!relation || relation.partitionKey !== fields.partitionKey ||
          relation.sourceFileId !== fields.sourceFileId ||
          relation.fragmentGenerationId !== fields.fragmentGenerationId || !from || !to ||
          relation.fromRecordVersionId !== from.recordVersionId ||
          relation.toRecordVersionId !== to.recordVersionId ||
          !endpointKindsAllowed(relation.predicate, from.kind, to.kind) ||
          own(relationVersions, relation.relationVersionId)) {
        return null;
      }
      relationVersions[relation.relationVersionId] = true;
      relations.push(relation);
    }
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['promptVersion', PROMPT_VERSION],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['contentFingerprint', fields.contentFingerprint],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['providerId', fields.providerId],
      ['modelId', fields.modelId],
      ['records', frozenArray(records)],
      ['relations', frozenArray(relations)]
    ]);
  }

  function parseLexicalShard(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'partitionKey', 'sourceFileId', 'fragmentGenerationId',
      'shardOrdinal', 'postings'
    ]);
    var inputs = fields && dataArrayValues(fields.postings, MAX_SHARD_ENTRIES, 0);
    if (!fields || fields.schemaVersion !== VERSION || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !validOrdinal(fields.shardOrdinal, MAX_SHARDS_PER_CATEGORY - 1) || !inputs) {
      return null;
    }
    var postings = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var entry = dataValues(inputs[index], ['term', 'stableRecordId', 'recordVersionId']);
      if (!entry || !validTerm(entry.term) || !validDigestId(entry.stableRecordId, 'sri1:') ||
          !validDigestId(entry.recordVersionId, 'srv1:')) {
        return null;
      }
      var key = entry.term + '\u0000' + entry.stableRecordId + '\u0000' + entry.recordVersionId;
      if (own(seen, key)) return null;
      seen[key] = true;
      postings.push(frozenRecord([
        ['term', entry.term],
        ['stableRecordId', entry.stableRecordId],
        ['recordVersionId', entry.recordVersionId]
      ]));
    }
    postings.sort(function(left, right) {
      return left.term.localeCompare(right.term) ||
        left.stableRecordId.localeCompare(right.stableRecordId) ||
        left.recordVersionId.localeCompare(right.recordVersionId);
    });
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['shardOrdinal', fields.shardOrdinal],
      ['postings', frozenArray(postings)]
    ]);
  }

  function parseAdjacencyShard(value) {
    var fields = dataValues(value, [
      'schemaVersion', 'partitionKey', 'sourceFileId', 'fragmentGenerationId',
      'shardOrdinal', 'entries'
    ]);
    var inputs = fields && dataArrayValues(fields.entries, MAX_SHARD_ENTRIES, 0);
    if (!fields || fields.schemaVersion !== VERSION || !validOpaque(fields.partitionKey, 1024) ||
        !validSourceFileId(fields.sourceFileId) ||
        !validDigestId(fields.fragmentGenerationId, 'sfg1:') ||
        !validOrdinal(fields.shardOrdinal, MAX_SHARDS_PER_CATEGORY - 1) || !inputs) {
      return null;
    }
    var entries = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var entry = dataValues(inputs[index], [
        'stableRecordId', 'relationVersionId', 'direction'
      ]);
      if (!entry || !validDigestId(entry.stableRecordId, 'sri1:') ||
          !(validDigestId(entry.relationVersionId, 'slv1:') ||
            validDigestId(entry.relationVersionId, 'scv1:')) ||
          (entry.direction !== 'out' && entry.direction !== 'in')) {
        return null;
      }
      var key = entry.stableRecordId + '\u0000' + entry.relationVersionId + '\u0000' + entry.direction;
      if (own(seen, key)) return null;
      seen[key] = true;
      entries.push(frozenRecord([
        ['stableRecordId', entry.stableRecordId],
        ['relationVersionId', entry.relationVersionId],
        ['direction', entry.direction]
      ]));
    }
    entries.sort(function(left, right) {
      return left.stableRecordId.localeCompare(right.stableRecordId) ||
        left.relationVersionId.localeCompare(right.relationVersionId) ||
        left.direction.localeCompare(right.direction);
    });
    return frozenRecord([
      ['schemaVersion', VERSION],
      ['partitionKey', fields.partitionKey],
      ['sourceFileId', fields.sourceFileId],
      ['fragmentGenerationId', fields.fragmentGenerationId],
      ['shardOrdinal', fields.shardOrdinal],
      ['entries', frozenArray(entries)]
    ]);
  }

  var LIMITS = frozenRecord([
    ['MAX_RECORDS', MAX_RECORDS],
    ['MAX_RELATIONS', MAX_RELATIONS],
    ['MAX_EVIDENCE_LOCATORS', MAX_EVIDENCE_LOCATORS],
    ['MAX_CANDIDATE_REF_LENGTH', MAX_CANDIDATE_REF_LENGTH],
    ['MAX_LABEL_LENGTH', MAX_LABEL_LENGTH],
    ['MAX_PRIOR_CANDIDATES', MAX_PRIOR_CANDIDATES],
    ['MAX_PRIOR_CANDIDATE_BYTES', MAX_PRIOR_CANDIDATE_BYTES],
    ['MAX_EXCERPTS', MAX_EXCERPTS],
    ['MAX_EXCERPT_CHARACTERS', MAX_EXCERPT_CHARACTERS],
    ['MAX_FRAGMENT_RECORDS', MAX_FRAGMENT_RECORDS],
    ['MAX_FRAGMENT_RELATIONS', MAX_FRAGMENT_RELATIONS],
    ['MAX_SHARD_ENTRIES', MAX_SHARD_ENTRIES],
    ['MAX_SHARDS_PER_CATEGORY', MAX_SHARDS_PER_CATEGORY]
  ]);

  var api = Object.freeze({
    VERSION: VERSION,
    IDENTITY_VERSION: IDENTITY_VERSION,
    PROMPT_VERSION: PROMPT_VERSION,
    LIMITS: LIMITS,
    RECORD_KINDS: RECORD_KINDS,
    RELATION_PREDICATES: RELATION_PREDICATES,
    CROSS_DOCUMENT_PREDICATES: CROSS_DOCUMENT_PREDICATES,
    parseEvidenceLocator: parseEvidenceLocator,
    parseExtractionEnvelope: parseExtractionEnvelope,
    parseCandidateRelationIntent: parseCandidateRelationIntent,
    parseCandidateRelation: parseCandidateRelation,
    parseFragment: parseFragment,
    parseLexicalShard: parseLexicalShard,
    parseAdjacencyShard: parseAdjacencyShard,
    deriveFragmentGenerationId: deriveFragmentGenerationId,
    deriveCandidateHandle: deriveCandidateHandle,
    deriveStableRecordId: deriveStableRecordId,
    deriveRecordVersionId: deriveRecordVersionId,
    deriveStableRelationId: deriveStableRelationId,
    deriveRelationVersionId: deriveRelationVersionId,
    deriveCandidateOverlayGenerationId: deriveCandidateOverlayGenerationId,
    canonicalize: canonicalize,
    sha256Hex: sha256Hex
  });

  global.FsbSkopeoGraphSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
