(function(global) {
  'use strict';

  var VERSION = 'skopeo-corpus-schema/v1';
  var PARTITION_KEY_PREFIX = 'scpk1:';
  var SOURCE_KEY_PREFIX = 'scsk1:';

  var MAX_ID_LENGTH = 256;
  var MAX_DISPLAY_NAME_LENGTH = 256;
  var MAX_MIME_LENGTH = 127;
  var MAX_VERSION_LENGTH = 32;
  var MAX_PARENT_DEPTH = 32;
  var MAX_CANONICAL_DEPTH = 16;
  var MAX_CANONICAL_KEYS = 64;
  var MAX_CANONICAL_ARRAY = 64;
  var MAX_CANONICAL_STRING = 4096;
  var MAX_CANONICAL_NODES = 1024;

  var SOURCE_STATES = Object.freeze([
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ]);
  var SOURCE_STATE_SET = makeSet(SOURCE_STATES);
  var MANIFEST_LIFECYCLES = makeSet(['closed', 'active', 'purging', 'unproven']);
  var PARTITION_LIFECYCLES = makeSet(['staging', 'active', 'withdrawn', 'purging', 'purged']);
  var SOURCE_VISIBILITIES = makeSet(['staged', 'active', 'withheld', 'purging', 'purged']);
  var SIMPLE_EVIDENCE_STATES = Object.freeze({
    'work-in-progress': 'pending',
    'transient-proof-failure': 'pending',
    'unsupported-content': 'unreadable',
    'parser-failure': 'unreadable',
    'download-policy-denial': 'download-blocked',
    'explicit-access-denial': 'inaccessible',
    'opaque-not-found': 'inaccessible',
    'lost-access': 'inaccessible',
    'authoritative-reconciliation': 'missing'
  });
  var HASH_CONTENT_EVIDENCE = makeSet([
    'drive-sha256',
    'export-byte-hash',
    'download-byte-hash'
  ]);

  var PARTITION_INPUT_KEYS = ['accountPermissionId', 'corpusRootFileId'];
  var SOURCE_INPUT_KEYS = ['accountPermissionId', 'corpusRootFileId', 'sourceFileId'];
  var MANIFEST_KEYS = ['version', 'lifecycle', 'authorityEpoch', 'activePartitionKey'];
  var PARTITION_RECORD_KEYS = [
    'version',
    'partitionKey',
    'accountPermissionId',
    'corpusRootFileId',
    'lifecycle',
    'partitionEpoch'
  ];
  var METADATA_FINGERPRINT_KEYS = [
    'version',
    'kind',
    'name',
    'mimeType',
    'modifiedTime',
    'driveVersion',
    'size',
    'trashed',
    'canDownload'
  ];
  var MEMBERSHIP_FINGERPRINT_KEYS = [
    'version',
    'kind',
    'corpusRootFileId',
    'physicalParentChain',
    'vendorScopeFileId',
    'driveId'
  ];
  var CONTENT_FINGERPRINT_KEYS = ['version', 'kind', 'evidenceKind', 'value'];
  var READY_EVIDENCE_KEYS = [
    'tag',
    'accountAccess',
    'ancestry',
    'contentPath',
    'downloadAllowed',
    'contentFingerprint',
    'processedFingerprint'
  ];
  var SOURCE_RECORD_KEYS = [
    'version',
    'sourceKey',
    'partitionKey',
    'accountPermissionId',
    'corpusRootFileId',
    'sourceFileId',
    'visibility',
    'state',
    'evidence',
    'displayName',
    'metadataFingerprint',
    'membershipFingerprint',
    'contentFingerprint'
  ];

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
      var keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some(function(key) {
        return typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key));
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
    var record = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      record[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(record);
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validEpoch(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validDisplayName(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_DISPLAY_NAME_LENGTH &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function encodeTuple(prefix, values) {
    var output = prefix;
    for (var index = 0; index < values.length; index += 1) {
      output += String(values[index].length) + ':' + values[index];
    }
    return output;
  }

  function decodeTuple(value, prefix, count) {
    if (typeof value !== 'string' || value.length > 2048 || value.slice(0, prefix.length) !== prefix) {
      return null;
    }
    var offset = prefix.length;
    var parts = [];
    for (var index = 0; index < count; index += 1) {
      var lengthStart = offset;
      while (offset < value.length && /[0-9]/.test(value.charAt(offset))) offset += 1;
      if (offset === lengthStart || value.charAt(offset) !== ':') return null;
      var lengthText = value.slice(lengthStart, offset);
      if (!/^[1-9][0-9]{0,2}$/.test(lengthText)) return null;
      var length = Number(lengthText);
      offset += 1;
      var part = value.slice(offset, offset + length);
      if (part.length !== length || !validId(part)) return null;
      parts.push(part);
      offset += length;
    }
    return offset === value.length ? parts : null;
  }

  function makePartitionKey(value) {
    var fields = dataValues(value, PARTITION_INPUT_KEYS);
    if (!fields || !validId(fields.accountPermissionId) || !validId(fields.corpusRootFileId)) {
      return null;
    }
    return encodeTuple(PARTITION_KEY_PREFIX, [fields.accountPermissionId, fields.corpusRootFileId]);
  }

  function parsePartitionKey(value) {
    var parts = decodeTuple(value, PARTITION_KEY_PREFIX, 2);
    if (!parts) return null;
    return frozenRecord([
      ['version', VERSION],
      ['accountPermissionId', parts[0]],
      ['corpusRootFileId', parts[1]]
    ]);
  }

  function makeSourceKey(value) {
    var fields = dataValues(value, SOURCE_INPUT_KEYS);
    if (!fields || !validId(fields.accountPermissionId) || !validId(fields.corpusRootFileId) ||
        !validId(fields.sourceFileId)) {
      return null;
    }
    return encodeTuple(SOURCE_KEY_PREFIX, [
      fields.accountPermissionId,
      fields.corpusRootFileId,
      fields.sourceFileId
    ]);
  }

  function parseSourceKey(value) {
    var parts = decodeTuple(value, SOURCE_KEY_PREFIX, 3);
    if (!parts) return null;
    return frozenRecord([
      ['version', VERSION],
      ['accountPermissionId', parts[0]],
      ['corpusRootFileId', parts[1]],
      ['sourceFileId', parts[2]]
    ]);
  }

  function canonicalValue(value, ancestors, state, depth) {
    if (depth > MAX_CANONICAL_DEPTH || state.nodes >= MAX_CANONICAL_NODES) return null;
    state.nodes += 1;
    if (value === null) return 'null';
    if (typeof value === 'string') {
      return value.length <= MAX_CANONICAL_STRING ? JSON.stringify(value) : null;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : null;
    if (typeof value !== 'object' || ancestors.has(value)) return null;
    ancestors.add(value);

    var output = null;
    if (Array.isArray(value)) {
      var items = dataArrayValues(value, MAX_CANONICAL_ARRAY);
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
    return output;
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

  async function sha256Hex(value) {
    var canonical = canonicalize(value);
    var cryptoObject = global && global.crypto;
    if (canonical === null || !cryptoObject || !cryptoObject.subtle ||
        typeof cryptoObject.subtle.digest !== 'function' || typeof TextEncoder === 'undefined') {
      return null;
    }
    try {
      var digest = await cryptoObject.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonical)
      );
      var hex = digestHex(digest);
      return /^[0-9a-f]{64}$/.test(hex) ? 'sha256:' + hex : null;
    } catch (_error) {
      return null;
    }
  }

  function parseManifest(value) {
    var fields = dataValues(value, MANIFEST_KEYS);
    if (!fields || fields.version !== VERSION || !MANIFEST_LIFECYCLES[fields.lifecycle] ||
        !validEpoch(fields.authorityEpoch)) {
      return null;
    }
    if (fields.lifecycle === 'active') {
      if (!parsePartitionKey(fields.activePartitionKey)) return null;
    } else if (fields.activePartitionKey !== null) {
      return null;
    }
    return frozenRecord([
      ['version', VERSION],
      ['lifecycle', fields.lifecycle],
      ['authorityEpoch', fields.authorityEpoch],
      ['activePartitionKey', fields.activePartitionKey]
    ]);
  }

  function parsePartitionRecord(value) {
    var fields = dataValues(value, PARTITION_RECORD_KEYS);
    if (!fields || fields.version !== VERSION || !PARTITION_LIFECYCLES[fields.lifecycle] ||
        !validEpoch(fields.partitionEpoch) || !validId(fields.accountPermissionId) ||
        !validId(fields.corpusRootFileId)) {
      return null;
    }
    var tuple = parsePartitionKey(fields.partitionKey);
    if (!tuple || tuple.accountPermissionId !== fields.accountPermissionId ||
        tuple.corpusRootFileId !== fields.corpusRootFileId) {
      return null;
    }
    return frozenRecord([
      ['version', VERSION],
      ['partitionKey', fields.partitionKey],
      ['accountPermissionId', fields.accountPermissionId],
      ['corpusRootFileId', fields.corpusRootFileId],
      ['lifecycle', fields.lifecycle],
      ['partitionEpoch', fields.partitionEpoch]
    ]);
  }

  function validNormalizedTime(value) {
    if (typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      return false;
    }
    var milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
  }

  function validMimeType(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_MIME_LENGTH &&
      /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value);
  }

  function parseMetadataFingerprint(value) {
    var fields = dataValues(value, METADATA_FINGERPRINT_KEYS);
    if (!fields || fields.version !== VERSION || fields.kind !== 'metadata' ||
        !validDisplayName(fields.name) || !validMimeType(fields.mimeType) ||
        !validNormalizedTime(fields.modifiedTime) || typeof fields.driveVersion !== 'string' ||
        fields.driveVersion.length === 0 || fields.driveVersion.length > MAX_VERSION_LENGTH ||
        !/^[0-9]+$/.test(fields.driveVersion) || !Number.isSafeInteger(fields.size) || fields.size < 0 ||
        typeof fields.trashed !== 'boolean' || typeof fields.canDownload !== 'boolean') {
      return null;
    }
    return frozenRecord([
      ['version', VERSION],
      ['kind', 'metadata'],
      ['name', fields.name],
      ['mimeType', fields.mimeType],
      ['modifiedTime', fields.modifiedTime],
      ['driveVersion', fields.driveVersion],
      ['size', fields.size],
      ['trashed', fields.trashed],
      ['canDownload', fields.canDownload]
    ]);
  }

  function parseMembershipFingerprint(value) {
    var fields = dataValues(value, MEMBERSHIP_FINGERPRINT_KEYS);
    if (!fields || fields.version !== VERSION || fields.kind !== 'membership' ||
        !validId(fields.corpusRootFileId) ||
        !(fields.driveId === null || validId(fields.driveId))) {
      return null;
    }
    var parentChain = dataArrayValues(fields.physicalParentChain, MAX_PARENT_DEPTH);
    if (!parentChain || parentChain.length === 0 || parentChain.some(function(id) {
      return !validId(id);
    }) || new Set(parentChain).size !== parentChain.length ||
        parentChain[0] !== fields.corpusRootFileId) {
      return null;
    }
    if ((parentChain.length === 1 && fields.vendorScopeFileId !== null) ||
        (parentChain.length > 1 && fields.vendorScopeFileId !== parentChain[1])) {
      return null;
    }
    return frozenRecord([
      ['version', VERSION],
      ['kind', 'membership'],
      ['corpusRootFileId', fields.corpusRootFileId],
      ['physicalParentChain', Object.freeze(parentChain.slice())],
      ['vendorScopeFileId', fields.vendorScopeFileId],
      ['driveId', fields.driveId]
    ]);
  }

  function parseContentFingerprint(value) {
    var fields = dataValues(value, CONTENT_FINGERPRINT_KEYS);
    if (!fields || fields.version !== VERSION || fields.kind !== 'content') return null;
    if (fields.evidenceKind === 'drive-revision') {
      if (!validId(fields.value)) return null;
    } else if (HASH_CONTENT_EVIDENCE[fields.evidenceKind]) {
      if (typeof fields.value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(fields.value)) return null;
    } else {
      return null;
    }
    return frozenRecord([
      ['version', VERSION],
      ['kind', 'content'],
      ['evidenceKind', fields.evidenceKind],
      ['value', fields.value]
    ]);
  }

  function parseEvidence(value) {
    if (!isPlainRecord(value)) return null;
    var tagDescriptor;
    try {
      tagDescriptor = Object.getOwnPropertyDescriptor(value, 'tag');
    } catch (_error) {
      return null;
    }
    if (!tagDescriptor || !own(tagDescriptor, 'value') || tagDescriptor.enumerable !== true ||
        typeof tagDescriptor.value !== 'string') {
      return null;
    }
    var tag = tagDescriptor.value;
    if (tag === 'verified-readable') {
      var ready = dataValues(value, READY_EVIDENCE_KEYS);
      if (!ready || ready.accountAccess !== true || ready.ancestry !== true ||
          ready.contentPath !== 'supported' || ready.downloadAllowed !== true ||
          ready.contentFingerprint !== 'current' || ready.processedFingerprint !== 'current') {
        return null;
      }
      return frozenRecord([
        ['tag', tag],
        ['accountAccess', true],
        ['ancestry', true],
        ['contentPath', 'supported'],
        ['downloadAllowed', true],
        ['contentFingerprint', 'current'],
        ['processedFingerprint', 'current']
      ]);
    }
    if (!SIMPLE_EVIDENCE_STATES[tag]) return null;
    var simple = dataValues(value, ['tag']);
    return simple ? frozenRecord([['tag', tag]]) : null;
  }

  function classifySourceEvidence(value) {
    var evidence = parseEvidence(value);
    if (!evidence) return null;
    return evidence.tag === 'verified-readable' ? 'ready' : SIMPLE_EVIDENCE_STATES[evidence.tag] || null;
  }

  function canTransitionSourceState(from, to, evidence) {
    return !!SOURCE_STATE_SET[from] && !!SOURCE_STATE_SET[to] &&
      classifySourceEvidence(evidence) === to;
  }

  function parseSourceRecord(value) {
    var fields = dataValues(value, SOURCE_RECORD_KEYS);
    if (!fields || fields.version !== VERSION || !SOURCE_STATE_SET[fields.state] ||
        !SOURCE_VISIBILITIES[fields.visibility] || !validId(fields.accountPermissionId) ||
        !validId(fields.corpusRootFileId) || !validId(fields.sourceFileId)) {
      return null;
    }
    var partitionTuple = parsePartitionKey(fields.partitionKey);
    var sourceTuple = parseSourceKey(fields.sourceKey);
    if (!partitionTuple || !sourceTuple ||
        partitionTuple.accountPermissionId !== fields.accountPermissionId ||
        partitionTuple.corpusRootFileId !== fields.corpusRootFileId ||
        sourceTuple.accountPermissionId !== fields.accountPermissionId ||
        sourceTuple.corpusRootFileId !== fields.corpusRootFileId ||
        sourceTuple.sourceFileId !== fields.sourceFileId) {
      return null;
    }
    var evidence = parseEvidence(fields.evidence);
    if (!evidence || classifySourceEvidence(evidence) !== fields.state) return null;

    var metadataFingerprint = fields.metadataFingerprint === null
      ? null
      : parseMetadataFingerprint(fields.metadataFingerprint);
    var membershipFingerprint = fields.membershipFingerprint === null
      ? null
      : parseMembershipFingerprint(fields.membershipFingerprint);
    var contentFingerprint = fields.contentFingerprint === null
      ? null
      : parseContentFingerprint(fields.contentFingerprint);
    if ((fields.metadataFingerprint !== null && !metadataFingerprint) ||
        (fields.membershipFingerprint !== null && !membershipFingerprint) ||
        (fields.contentFingerprint !== null && !contentFingerprint) ||
        (membershipFingerprint && membershipFingerprint.corpusRootFileId !== fields.corpusRootFileId)) {
      return null;
    }

    var visibleMetadataState = fields.state === 'ready' || fields.state === 'unreadable' ||
      fields.state === 'download-blocked';
    if (visibleMetadataState) {
      if (fields.visibility !== 'active' || !validDisplayName(fields.displayName) ||
          !metadataFingerprint || !membershipFingerprint) {
        return null;
      }
      if ((fields.state === 'ready' && !contentFingerprint) ||
          (fields.state !== 'ready' && contentFingerprint !== null)) {
        return null;
      }
    } else {
      var allowedHiddenVisibility = fields.state === 'pending'
        ? (fields.visibility === 'staged' || fields.visibility === 'withheld')
        : (fields.visibility === 'withheld' || fields.visibility === 'purging' ||
          fields.visibility === 'purged');
      if (!allowedHiddenVisibility || fields.displayName !== null || metadataFingerprint !== null ||
          membershipFingerprint !== null || contentFingerprint !== null) {
        return null;
      }
    }

    return frozenRecord([
      ['version', VERSION],
      ['sourceKey', fields.sourceKey],
      ['partitionKey', fields.partitionKey],
      ['accountPermissionId', fields.accountPermissionId],
      ['corpusRootFileId', fields.corpusRootFileId],
      ['sourceFileId', fields.sourceFileId],
      ['visibility', fields.visibility],
      ['state', fields.state],
      ['evidence', evidence],
      ['displayName', fields.displayName],
      ['metadataFingerprint', metadataFingerprint],
      ['membershipFingerprint', membershipFingerprint],
      ['contentFingerprint', contentFingerprint]
    ]);
  }

  var api = Object.freeze({
    VERSION: VERSION,
    SOURCE_STATES: SOURCE_STATES,
    makePartitionKey: makePartitionKey,
    parsePartitionKey: parsePartitionKey,
    makeSourceKey: makeSourceKey,
    parseSourceKey: parseSourceKey,
    parseManifest: parseManifest,
    parsePartitionRecord: parsePartitionRecord,
    parseSourceRecord: parseSourceRecord,
    parseMetadataFingerprint: parseMetadataFingerprint,
    parseMembershipFingerprint: parseMembershipFingerprint,
    parseContentFingerprint: parseContentFingerprint,
    classifySourceEvidence: classifySourceEvidence,
    canTransitionSourceState: canTransitionSourceState,
    canonicalize: canonicalize,
    sha256Hex: sha256Hex
  });

  global.FsbSkopeoCorpusSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
