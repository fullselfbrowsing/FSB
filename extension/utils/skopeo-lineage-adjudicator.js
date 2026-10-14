(function(global) {
  'use strict';

  var VERSION = 'skopeo-lineage-adjudicator/1';
  var GRAPH_SNAPSHOT_VERSION = 'skopeo-graph-exact-set/1';
  var GRAPH_SCHEMA_VERSION = 'skopeo-graph-schema/1';
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
  var SOURCE_STATES = Object.freeze([
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ]);
  var LIMITS = frozenRecord([
    ['MAX_SOURCES', 32],
    ['MAX_CANDIDATE_BATCHES_PER_SOURCE', 1024],
    ['MAX_CANDIDATES_PER_BATCH', 128],
    ['MAX_EVIDENCE_PER_CANDIDATE', 4],
    ['MAX_GRAPH_RECORD_VERSIONS', 4096],
    ['MAX_RELATION_VERSIONS', 16384],
    ['MAX_ASSERTIONS_PER_FAMILY', 2048],
    ['MAX_FAMILY_CITATIONS', 2048],
    ['MAX_CONFLICTS_PER_FAMILY', 512],
    ['MAX_RULES_PER_FAMILY', 512],
    ['MAX_SEMANTIC_BYTES', 8 * 1024 * 1024]
  ]);
  var RECORD_KIND_SET = makeSet(RECORD_KINDS);
  var SOURCE_STATE_SET = makeSet(SOURCE_STATES);

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) {
      output[values[index]] = true;
    }
    return Object.freeze(output);
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

  function exactFields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var prototype;
    var keys;
    try {
      prototype = Object.getPrototypeOf(value);
      keys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if ((prototype !== Object.prototype && prototype !== null) ||
        keys.length !== names.length) {
      return null;
    }
    var allowed = Object.create(null);
    for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
      allowed[names[nameIndex]] = true;
    }
    var output = Object.create(null);
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var key = keys[keyIndex];
      var descriptor;
      if (typeof key !== 'string' || !own(allowed, key)) return null;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch (_descriptorError) {
        return null;
      }
      if (!descriptor || descriptor.enumerable !== true || !own(descriptor, 'value')) {
        return null;
      }
      output[key] = descriptor.value;
    }
    return output;
  }

  function denseArray(value, maximum, minimum) {
    if (!Array.isArray(value)) return null;
    var keys;
    var lengthDescriptor;
    try {
      keys = Reflect.ownKeys(value);
      lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    } catch (_error) {
      return null;
    }
    if (!lengthDescriptor || !own(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < (minimum || 0) ||
        lengthDescriptor.value > maximum ||
        keys.length !== lengthDescriptor.value + 1) {
      return null;
    }
    var output = [];
    for (var index = 0; index < lengthDescriptor.value; index += 1) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      } catch (_descriptorError) {
        return null;
      }
      if (!descriptor || descriptor.enumerable !== true || !own(descriptor, 'value')) {
        return null;
      }
      output.push(descriptor.value);
    }
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var key = keys[keyIndex];
      if (key !== 'length' &&
          (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key) ||
            Number(key) >= lengthDescriptor.value)) {
        return null;
      }
    }
    return output;
  }

  function compareText(left, right) {
    return left < right ? -1 : (left > right ? 1 : 0);
  }

  function sortedUnique(values) {
    var seen = Object.create(null);
    for (var index = 0; index < values.length; index += 1) {
      seen[values[index]] = true;
    }
    return Object.keys(seen).sort(compareText);
  }

  function validOpaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 &&
      value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validSourceFileId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validDigest(value, prefixes) {
    if (typeof value !== 'string') return false;
    var inputs = Array.isArray(prefixes) ? prefixes : [prefixes];
    for (var index = 0; index < inputs.length; index += 1) {
      if (value.slice(0, inputs[index].length) === inputs[index] &&
          /^[0-9a-f]{64}$/.test(value.slice(inputs[index].length))) {
        return true;
      }
    }
    return false;
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validHandle(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validInteger(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
  }

  function encodeTuple(prefix, values) {
    var output = prefix;
    for (var index = 0; index < values.length; index += 1) {
      var value = String(values[index]);
      output += value.length + ':' + value;
    }
    return output;
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

  function closedResult(digest, blockers) {
    return frozenRecord([
      ['version', VERSION],
      ['status', 'abstained'],
      ['authorizedSetDigest', validDigest(digest, 'sgx1:')
        ? digest
        : 'sgx1:' + '0'.repeat(64)],
      ['families', frozenArray([])],
      ['blockerCodes', frozenArray(sortedUnique(blockers.length
        ? blockers
        : ['input-not-exact']))]
    ]);
  }

  function admittedResult(digest, families) {
    return frozenRecord([
      ['version', VERSION],
      ['status', 'adjudicated'],
      ['authorizedSetDigest', digest],
      ['families', frozenArray(families)],
      ['blockerCodes', frozenArray([])]
    ]);
  }

  function minimalDigest(input) {
    var top = exactFields(input, ['graphSnapshot', 'candidateGenerations', 'evaluationContext']);
    var graph = top && exactFields(top.graphSnapshot, [
      'snapshotVersion',
      'partitionKey',
      'sourceBindings',
      'records',
      'relations',
      'authorizedSetDigest'
    ]);
    return graph && typeof graph.authorizedSetDigest === 'string'
      ? graph.authorizedSetDigest
      : null;
  }

  function parseSnapshotLocator(value, binding) {
    var fields = exactFields(value, [
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'locatorId',
      'sourceByteStart',
      'sourceByteEnd'
    ]);
    if (!fields || fields.partitionKey !== binding.partitionKey ||
        fields.sourceFileId !== binding.sourceFileId ||
        fields.contentFingerprint !== binding.contentFingerprint ||
        fields.fragmentGenerationId !== binding.fragmentGenerationId ||
        !validDigest(fields.locatorId, 'sel1:') ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart) {
      return null;
    }
    return fields;
  }

  function parseFullLocator(value, binding, snapshotLocatorIds) {
    var fields = exactFields(value, [
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
        fields.partitionKey !== binding.partitionKey ||
        fields.sourceFileId !== binding.sourceFileId ||
        fields.contentFingerprint !== binding.contentFingerprint ||
        fields.fragmentGenerationId !== binding.fragmentGenerationId ||
        typeof fields.excerptId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(fields.excerptId) ||
        !validInteger(fields.start, 0, 24000) ||
        !validInteger(fields.end, 1, 24000) || fields.end <= fields.start ||
        !validInteger(fields.sourceByteStart, 0, Number.MAX_SAFE_INTEGER) ||
        !validInteger(fields.sourceByteEnd, 1, Number.MAX_SAFE_INTEGER) ||
        fields.sourceByteEnd <= fields.sourceByteStart ||
        !validDigest(fields.locatorId, 'sel1:') ||
        !snapshotLocatorIds[fields.locatorId + '\u0000' +
          String(fields.sourceByteStart) + '\u0000' + String(fields.sourceByteEnd)]) {
      return null;
    }
    return fields;
  }

  function parseCandidateEvidence(value, binding, snapshotLocatorIds) {
    var inputs = denseArray(value, LIMITS.MAX_EVIDENCE_PER_CANDIDATE, 1);
    if (!inputs) return null;
    var output = [];
    var seen = Object.create(null);
    for (var index = 0; index < inputs.length; index += 1) {
      var locator = parseFullLocator(inputs[index], binding, snapshotLocatorIds);
      if (!locator || own(seen, locator.locatorId)) return null;
      seen[locator.locatorId] = true;
      output.push(locator);
    }
    output.sort(function(left, right) {
      return compareText(left.locatorId, right.locatorId);
    });
    return output;
  }

  async function parseInput(input, truthSchema) {
    var top = exactFields(input, ['graphSnapshot', 'candidateGenerations', 'evaluationContext']);
    if (!top) return { blocker: 'input-not-exact' };
    var snapshot = exactFields(top.graphSnapshot, [
      'snapshotVersion',
      'partitionKey',
      'sourceBindings',
      'records',
      'relations',
      'authorizedSetDigest'
    ]);
    if (!snapshot || snapshot.snapshotVersion !== GRAPH_SNAPSHOT_VERSION ||
        !validOpaque(snapshot.partitionKey, 1024) ||
        !validDigest(snapshot.authorizedSetDigest, 'sgx1:')) {
      return { blocker: 'input-not-exact' };
    }
    var bindingInputs = denseArray(snapshot.sourceBindings, LIMITS.MAX_SOURCES, 1);
    if (!bindingInputs) {
      return {
        blocker: Array.isArray(snapshot.sourceBindings) &&
          snapshot.sourceBindings.length > LIMITS.MAX_SOURCES
          ? 'exact-set-over-cap'
          : 'input-not-exact'
      };
    }
    var bindings = [];
    var bindingBySource = new Map();
    for (var bindingIndex = 0; bindingIndex < bindingInputs.length; bindingIndex += 1) {
      var bindingFields = exactFields(bindingInputs[bindingIndex], [
        'sourceFileId',
        'sourceState',
        'certificationStatus',
        'graphCurrent',
        'contentFingerprint',
        'fragmentGenerationId'
      ]);
      if (!bindingFields || !validSourceFileId(bindingFields.sourceFileId) ||
          !own(SOURCE_STATE_SET, bindingFields.sourceState) ||
          bindingFields.certificationStatus !== 'certified' ||
          typeof bindingFields.graphCurrent !== 'boolean' ||
          !validFingerprint(bindingFields.contentFingerprint) ||
          !validDigest(bindingFields.fragmentGenerationId, 'sfg1:') ||
          bindingBySource.has(bindingFields.sourceFileId)) {
        return { blocker: 'input-not-exact' };
      }
      var binding = {
        partitionKey: snapshot.partitionKey,
        sourceFileId: bindingFields.sourceFileId,
        sourceState: bindingFields.sourceState,
        certificationStatus: bindingFields.certificationStatus,
        graphCurrent: bindingFields.graphCurrent,
        contentFingerprint: bindingFields.contentFingerprint,
        fragmentGenerationId: bindingFields.fragmentGenerationId,
        snapshotLocatorIds: Object.create(null)
      };
      bindings.push(binding);
      bindingBySource.set(binding.sourceFileId, binding);
    }
    bindings.sort(function(left, right) {
      return compareText(left.sourceFileId, right.sourceFileId);
    });
    var unavailable = bindings.some(function(binding) {
      return binding.sourceState === 'pending' ||
        binding.sourceState === 'inaccessible' || binding.sourceState === 'missing';
    });
    var unreadable = bindings.some(function(binding) {
      return binding.sourceState === 'unreadable' ||
        binding.sourceState === 'download-blocked';
    });
    if (unavailable || unreadable) {
      return { blocker: unavailable ? 'source-unavailable' : 'source-unreadable' };
    }
    if (bindings.some(function(binding) {
      return binding.sourceState !== 'ready' || binding.graphCurrent !== true;
    })) {
      return { blocker: 'snapshot-stale' };
    }

    var recordInputs = denseArray(
      snapshot.records,
      LIMITS.MAX_GRAPH_RECORD_VERSIONS,
      1
    );
    if (!recordInputs) {
      return {
        blocker: Array.isArray(snapshot.records) &&
          snapshot.records.length > LIMITS.MAX_GRAPH_RECORD_VERSIONS
          ? 'exact-set-over-cap'
          : 'input-not-exact'
      };
    }
    var records = [];
    var recordByStableId = new Map();
    var recordByVersionId = new Map();
    var evidenceIdentities = [];
    for (var recordIndex = 0; recordIndex < recordInputs.length; recordIndex += 1) {
      var recordFields = exactFields(recordInputs[recordIndex], [
        'partitionKey',
        'sourceFileId',
        'contentFingerprint',
        'fragmentGenerationId',
        'kind',
        'label',
        'evidence',
        'stableRecordId',
        'recordVersionId'
      ]);
      var recordBinding = recordFields && bindingBySource.get(recordFields.sourceFileId);
      if (!recordFields || !recordBinding ||
          recordFields.partitionKey !== snapshot.partitionKey ||
          recordFields.contentFingerprint !== recordBinding.contentFingerprint ||
          recordFields.fragmentGenerationId !== recordBinding.fragmentGenerationId ||
          !own(RECORD_KIND_SET, recordFields.kind) ||
          !validOpaque(recordFields.label, 4096) ||
          !validDigest(recordFields.stableRecordId, 'sri1:') ||
          !validDigest(recordFields.recordVersionId, 'srv1:') ||
          recordByStableId.has(recordFields.stableRecordId) ||
          recordByVersionId.has(recordFields.recordVersionId)) {
        return { blocker: 'input-not-exact' };
      }
      var recordEvidenceInputs = denseArray(recordFields.evidence, 64, 1);
      if (!recordEvidenceInputs) return { blocker: 'input-not-exact' };
      var recordEvidence = [];
      var recordLocatorIds = Object.create(null);
      for (var recordEvidenceIndex = 0;
        recordEvidenceIndex < recordEvidenceInputs.length;
        recordEvidenceIndex += 1) {
        var recordLocator = parseSnapshotLocator(
          recordEvidenceInputs[recordEvidenceIndex],
          recordBinding
        );
        if (!recordLocator || own(recordLocatorIds, recordLocator.locatorId)) {
          return { blocker: 'input-not-exact' };
        }
        recordLocatorIds[recordLocator.locatorId] = true;
        recordBinding.snapshotLocatorIds[recordLocator.locatorId + '\u0000' +
          String(recordLocator.sourceByteStart) + '\u0000' +
          String(recordLocator.sourceByteEnd)] = true;
        evidenceIdentities.push(encodeTuple('snapshot-evidence|', [
          'record',
          recordFields.recordVersionId,
          recordLocator.partitionKey,
          recordLocator.sourceFileId,
          recordLocator.contentFingerprint,
          recordLocator.fragmentGenerationId,
          recordLocator.locatorId,
          String(recordLocator.sourceByteStart),
          String(recordLocator.sourceByteEnd)
        ]));
        recordEvidence.push(recordLocator);
      }
      recordEvidence.sort(function(left, right) {
        return compareText(left.locatorId, right.locatorId);
      });
      var record = {
        partitionKey: snapshot.partitionKey,
        sourceFileId: recordFields.sourceFileId,
        contentFingerprint: recordFields.contentFingerprint,
        fragmentGenerationId: recordFields.fragmentGenerationId,
        kind: recordFields.kind,
        evidence: recordEvidence,
        locatorIds: recordLocatorIds,
        stableRecordId: recordFields.stableRecordId,
        recordVersionId: recordFields.recordVersionId
      };
      records.push(record);
      recordByStableId.set(record.stableRecordId, record);
      recordByVersionId.set(record.recordVersionId, record);
    }
    records.sort(function(left, right) {
      return compareText(left.recordVersionId, right.recordVersionId);
    });

    var relationInputs = denseArray(
      snapshot.relations,
      LIMITS.MAX_RELATION_VERSIONS,
      0
    );
    if (!relationInputs) {
      return {
        blocker: Array.isArray(snapshot.relations) &&
          snapshot.relations.length > LIMITS.MAX_RELATION_VERSIONS
          ? 'exact-set-over-cap'
          : 'input-not-exact'
      };
    }
    var relations = [];
    var relationByVersionId = new Map();
    for (var relationIndex = 0; relationIndex < relationInputs.length; relationIndex += 1) {
      var relationFields = exactFields(relationInputs[relationIndex], [
        'relationClass',
        'partitionKey',
        'sourceFileId',
        'contentFingerprint',
        'fragmentGenerationId',
        'predicate',
        'fromSourceFileId',
        'fromFragmentGenerationId',
        'fromStableRecordId',
        'fromRecordVersionId',
        'toSourceFileId',
        'toFragmentGenerationId',
        'toStableRecordId',
        'toRecordVersionId',
        'evidence',
        'stableRelationId',
        'relationVersionId',
        'candidateOnly'
      ]);
      var relationBinding = relationFields &&
        bindingBySource.get(relationFields.sourceFileId);
      var fromRecord = relationFields &&
        recordByStableId.get(relationFields.fromStableRecordId);
      var toRecord = relationFields &&
        recordByStableId.get(relationFields.toStableRecordId);
      var candidateOnly = relationFields &&
        relationFields.relationClass === 'cross-document-candidate';
      if (!relationFields || !relationBinding || !fromRecord || !toRecord ||
          relationFields.partitionKey !== snapshot.partitionKey ||
          relationFields.contentFingerprint !== relationBinding.contentFingerprint ||
          relationFields.fragmentGenerationId !== relationBinding.fragmentGenerationId ||
          relationFields.fromSourceFileId !== fromRecord.sourceFileId ||
          relationFields.fromFragmentGenerationId !== fromRecord.fragmentGenerationId ||
          relationFields.fromRecordVersionId !== fromRecord.recordVersionId ||
          relationFields.toSourceFileId !== toRecord.sourceFileId ||
          relationFields.toFragmentGenerationId !== toRecord.fragmentGenerationId ||
          relationFields.toRecordVersionId !== toRecord.recordVersionId ||
          !validDigest(relationFields.stableRelationId, 'srl1:') ||
          !(candidateOnly
            ? validDigest(relationFields.relationVersionId, 'scv1:')
            : validDigest(relationFields.relationVersionId, 'slv1:')) ||
          relationFields.candidateOnly !== candidateOnly ||
          (!candidateOnly && relationFields.relationClass !== 'local') ||
          (candidateOnly && (relationFields.predicate !== 'amends-candidate' ||
            relationFields.sourceFileId !== fromRecord.sourceFileId ||
            fromRecord.sourceFileId === toRecord.sourceFileId)) ||
          (!candidateOnly && (relationFields.sourceFileId !== fromRecord.sourceFileId ||
            relationFields.sourceFileId !== toRecord.sourceFileId)) ||
          relationByVersionId.has(relationFields.relationVersionId)) {
        return { blocker: 'input-not-exact' };
      }
      var relationEvidenceInputs = denseArray(relationFields.evidence, 64, 1);
      if (!relationEvidenceInputs) return { blocker: 'input-not-exact' };
      var relationEvidence = [];
      var relationLocatorIds = Object.create(null);
      for (var relationEvidenceIndex = 0;
        relationEvidenceIndex < relationEvidenceInputs.length;
        relationEvidenceIndex += 1) {
        var relationLocator = parseSnapshotLocator(
          relationEvidenceInputs[relationEvidenceIndex],
          relationBinding
        );
        if (!relationLocator || own(relationLocatorIds, relationLocator.locatorId)) {
          return { blocker: 'input-not-exact' };
        }
        relationLocatorIds[relationLocator.locatorId] = true;
        relationBinding.snapshotLocatorIds[relationLocator.locatorId + '\u0000' +
          String(relationLocator.sourceByteStart) + '\u0000' +
          String(relationLocator.sourceByteEnd)] = true;
        evidenceIdentities.push(encodeTuple('snapshot-evidence|', [
          'relation',
          relationFields.relationVersionId,
          relationLocator.partitionKey,
          relationLocator.sourceFileId,
          relationLocator.contentFingerprint,
          relationLocator.fragmentGenerationId,
          relationLocator.locatorId,
          String(relationLocator.sourceByteStart),
          String(relationLocator.sourceByteEnd)
        ]));
        relationEvidence.push(relationLocator);
      }
      relationEvidence.sort(function(left, right) {
        return compareText(left.locatorId, right.locatorId);
      });
      var relation = {
        relationClass: relationFields.relationClass,
        partitionKey: snapshot.partitionKey,
        sourceFileId: relationFields.sourceFileId,
        contentFingerprint: relationFields.contentFingerprint,
        fragmentGenerationId: relationFields.fragmentGenerationId,
        predicate: relationFields.predicate,
        fromSourceFileId: relationFields.fromSourceFileId,
        fromFragmentGenerationId: relationFields.fromFragmentGenerationId,
        fromStableRecordId: relationFields.fromStableRecordId,
        fromRecordVersionId: relationFields.fromRecordVersionId,
        toSourceFileId: relationFields.toSourceFileId,
        toFragmentGenerationId: relationFields.toFragmentGenerationId,
        toStableRecordId: relationFields.toStableRecordId,
        toRecordVersionId: relationFields.toRecordVersionId,
        evidence: relationEvidence,
        locatorIds: relationLocatorIds,
        stableRelationId: relationFields.stableRelationId,
        relationVersionId: relationFields.relationVersionId,
        candidateOnly: candidateOnly
      };
      relations.push(relation);
      relationByVersionId.set(relation.relationVersionId, relation);
    }
    relations.sort(function(left, right) {
      return compareText(left.relationVersionId, right.relationVersionId);
    });

    evidenceIdentities.sort(compareText);
    var digestValues = [
      GRAPH_SNAPSHOT_VERSION,
      snapshot.partitionKey,
      String(bindings.length),
      String(records.length),
      String(relations.length),
      String(evidenceIdentities.length)
    ];
    bindings.forEach(function(binding) {
      digestValues.push(encodeTuple('authorized-source|', [
        binding.sourceFileId,
        binding.sourceState,
        binding.certificationStatus,
        binding.graphCurrent ? 'current' : 'stale',
        binding.contentFingerprint,
        binding.fragmentGenerationId
      ]));
    });
    records.forEach(function(record) {
      digestValues.push(encodeTuple('authorized-record|', [record.recordVersionId]));
    });
    relations.forEach(function(relation) {
      digestValues.push(encodeTuple('authorized-relation|', [relation.relationVersionId]));
    });
    Array.prototype.push.apply(digestValues, evidenceIdentities);
    var digestHexValue = await sha256Text(
      encodeTuple('authorized-graph-exact-set|', digestValues)
    );
    if (!digestHexValue ||
        snapshot.authorizedSetDigest !== 'sgx1:' + digestHexValue) {
      return { blocker: 'input-not-exact' };
    }

    var candidateGenerationInputs = denseArray(
      top.candidateGenerations,
      LIMITS.MAX_SOURCES,
      bindings.length
    );
    if (!candidateGenerationInputs ||
        candidateGenerationInputs.length !== bindings.length) {
      return {
        blocker: Array.isArray(top.candidateGenerations) &&
          top.candidateGenerations.length > LIMITS.MAX_SOURCES
          ? 'exact-set-over-cap'
          : 'exact-set-incomplete'
      };
    }
    var generations = [];
    var generationBySource = new Map();
    var providerId = null;
    var modelId = null;
    for (var generationIndex = 0;
      generationIndex < candidateGenerationInputs.length;
      generationIndex += 1) {
      var generationFields = exactFields(candidateGenerationInputs[generationIndex], [
        'schemaVersion',
        'promptVersion',
        'partitionKey',
        'sourceFileId',
        'contentFingerprint',
        'fragmentGenerationId',
        'authorizedSetDigest',
        'providerId',
        'modelId',
        'candidateGenerationIds',
        'batches'
      ]);
      var generationBinding = generationFields &&
        bindingBySource.get(generationFields.sourceFileId);
      if (!generationFields || !generationBinding ||
          generationFields.schemaVersion !== truthSchema.VERSION ||
          generationFields.promptVersion !== truthSchema.PROMPT_VERSION ||
          generationFields.partitionKey !== snapshot.partitionKey ||
          generationFields.contentFingerprint !== generationBinding.contentFingerprint ||
          generationFields.fragmentGenerationId !== generationBinding.fragmentGenerationId ||
          generationFields.authorizedSetDigest !== snapshot.authorizedSetDigest ||
          !validOpaque(generationFields.providerId, 128) ||
          !validOpaque(generationFields.modelId, 128) ||
          generationBySource.has(generationFields.sourceFileId) ||
          (providerId !== null && providerId !== generationFields.providerId) ||
          (modelId !== null && modelId !== generationFields.modelId)) {
        return { blocker: 'input-not-exact' };
      }
      providerId = generationFields.providerId;
      modelId = generationFields.modelId;
      var generationIds = denseArray(
        generationFields.candidateGenerationIds,
        LIMITS.MAX_CANDIDATE_BATCHES_PER_SOURCE,
        1
      );
      var batchInputs = denseArray(
        generationFields.batches,
        LIMITS.MAX_CANDIDATE_BATCHES_PER_SOURCE,
        1
      );
      if (!generationIds || !batchInputs ||
          generationIds.length !== batchInputs.length) {
        return { blocker: 'input-not-exact' };
      }
      var batches = [];
      var expectedGenerationIds = [];
      var seenBatchOrdinals = Object.create(null);
      for (var batchIndex = 0; batchIndex < batchInputs.length; batchIndex += 1) {
        var parsedBatch = await parseBatch(
          batchInputs[batchIndex],
          generationFields,
          generationBinding,
          recordByStableId,
          recordByVersionId,
          relationByVersionId,
          truthSchema
        );
        if (!parsedBatch || own(seenBatchOrdinals, String(parsedBatch.batchOrdinal))) {
          return { blocker: 'input-not-exact' };
        }
        seenBatchOrdinals[String(parsedBatch.batchOrdinal)] = true;
        batches.push(parsedBatch);
        expectedGenerationIds.push(parsedBatch.candidateGenerationId);
      }
      expectedGenerationIds.sort(compareText);
      var suppliedGenerationIds = generationIds.slice().sort(compareText);
      if (expectedGenerationIds.length !== suppliedGenerationIds.length ||
          expectedGenerationIds.some(function(value, index) {
            return value !== suppliedGenerationIds[index];
          })) {
        return { blocker: 'input-not-exact' };
      }
      batches.sort(function(left, right) {
        return left.batchOrdinal - right.batchOrdinal ||
          compareText(left.candidateGenerationId, right.candidateGenerationId);
      });
      var generation = {
        schemaVersion: generationFields.schemaVersion,
        promptVersion: generationFields.promptVersion,
        partitionKey: generationFields.partitionKey,
        sourceFileId: generationFields.sourceFileId,
        contentFingerprint: generationFields.contentFingerprint,
        fragmentGenerationId: generationFields.fragmentGenerationId,
        authorizedSetDigest: generationFields.authorizedSetDigest,
        providerId: generationFields.providerId,
        modelId: generationFields.modelId,
        candidateGenerationIds: expectedGenerationIds,
        batches: batches
      };
      generations.push(generation);
      generationBySource.set(generation.sourceFileId, generation);
    }
    if (bindings.some(function(binding) {
      return !generationBySource.has(binding.sourceFileId);
    })) {
      return { blocker: 'exact-set-incomplete' };
    }
    generations.sort(function(left, right) {
      return compareText(left.sourceFileId, right.sourceFileId);
    });
    var parsedEvaluationContext = truthSchema.parseEvaluationContext(top.evaluationContext);
    if (!parsedEvaluationContext) return { blocker: 'evaluation-context-missing' };
    return {
      snapshot: snapshot,
      bindings: bindings,
      bindingBySource: bindingBySource,
      records: records,
      recordByStableId: recordByStableId,
      recordByVersionId: recordByVersionId,
      relations: relations,
      relationByVersionId: relationByVersionId,
      generations: generations,
      evaluationContext: parsedEvaluationContext
    };
  }

  async function parseBatch(
    value,
    generation,
    binding,
    recordByStableId,
    recordByVersionId,
    relationByVersionId,
    truthSchema
  ) {
    var fields = exactFields(value, [
      'schemaVersion',
      'candidateGenerationId',
      'batchId',
      'fragmentGenerationId',
      'batchOrdinal',
      'executionCandidates',
      'effectivenessCandidates',
      'lineageCandidates',
      'factCandidates',
      'deadlineRuleCandidates'
    ]);
    if (!fields || fields.schemaVersion !== truthSchema.CANDIDATE_SCHEMA_VERSION ||
        !validDigest(fields.candidateGenerationId, 'stg1:') ||
        !validHandle(fields.batchId) ||
        fields.fragmentGenerationId !== generation.fragmentGenerationId ||
        !validInteger(
          fields.batchOrdinal,
          0,
          LIMITS.MAX_CANDIDATE_BATCHES_PER_SOURCE - 1
        )) {
      return null;
    }
    var expectedGenerationId = await truthSchema.deriveCandidateGenerationId({
      schemaVersion: truthSchema.VERSION,
      partitionKey: generation.partitionKey,
      sourceFileId: generation.sourceFileId,
      contentFingerprint: generation.contentFingerprint,
      fragmentGenerationId: generation.fragmentGenerationId,
      candidateSchemaVersion: truthSchema.CANDIDATE_SCHEMA_VERSION,
      promptVersion: generation.promptVersion,
      providerId: generation.providerId,
      modelId: generation.modelId,
      batchOrdinal: fields.batchOrdinal
    });
    if (!expectedGenerationId || fields.candidateGenerationId !== expectedGenerationId) {
      return null;
    }
    var executionInputs = denseArray(
      fields.executionCandidates,
      LIMITS.MAX_CANDIDATES_PER_BATCH,
      0
    );
    var effectivenessInputs = denseArray(
      fields.effectivenessCandidates,
      LIMITS.MAX_CANDIDATES_PER_BATCH,
      0
    );
    var lineageInputs = denseArray(
      fields.lineageCandidates,
      LIMITS.MAX_CANDIDATES_PER_BATCH,
      0
    );
    var factInputs = denseArray(
      fields.factCandidates,
      LIMITS.MAX_CANDIDATES_PER_BATCH,
      0
    );
    var ruleInputs = denseArray(
      fields.deadlineRuleCandidates,
      LIMITS.MAX_CANDIDATES_PER_BATCH,
      0
    );
    if (!executionInputs || !effectivenessInputs || !lineageInputs ||
        !factInputs || !ruleInputs ||
        executionInputs.length + effectivenessInputs.length + lineageInputs.length +
        factInputs.length + ruleInputs.length > LIMITS.MAX_CANDIDATES_PER_BATCH) {
      return null;
    }
    var seenRefs = Object.create(null);
    function takeRef(candidateRef) {
      if (!validHandle(candidateRef) || own(seenRefs, candidateRef)) return false;
      seenRefs[candidateRef] = true;
      return true;
    }
    function ownedRecord(stableId, versionId, kind) {
      var record = recordByStableId.get(stableId);
      return record && record.recordVersionId === versionId &&
        record.sourceFileId === generation.sourceFileId &&
        (!kind || record.kind === kind)
        ? record
        : null;
    }
    var execution = [];
    for (var executionIndex = 0;
      executionIndex < executionInputs.length;
      executionIndex += 1) {
      var executionFields = exactFields(executionInputs[executionIndex], [
        'candidateRef',
        'documentStableId',
        'documentRecordVersionId',
        'executionState',
        'evidence'
      ]);
      var executionDocument = executionFields &&
        ownedRecord(
          executionFields.documentStableId,
          executionFields.documentRecordVersionId
        );
      var executionEvidence = executionFields && executionDocument &&
        parseCandidateEvidence(
          executionFields.evidence,
          binding,
          binding.snapshotLocatorIds
        );
      if (!executionFields || !takeRef(executionFields.candidateRef) ||
          !executionDocument ||
          (executionDocument.kind !== 'agreement' &&
            executionDocument.kind !== 'amendment') ||
          (executionFields.executionState !== 'executed' &&
            executionFields.executionState !== 'unsigned' &&
            executionFields.executionState !== 'unknown') ||
          !executionEvidence ||
          executionEvidence.some(function(locator) {
            return !executionDocument.locatorIds[locator.locatorId];
          })) {
        return null;
      }
      execution.push({
        candidateRef: executionFields.candidateRef,
        documentStableId: executionFields.documentStableId,
        documentRecordVersionId: executionFields.documentRecordVersionId,
        executionState: executionFields.executionState,
        evidence: executionEvidence,
        sourceFileId: generation.sourceFileId
      });
    }
    var effectiveness = [];
    for (var effectivenessIndex = 0;
      effectivenessIndex < effectivenessInputs.length;
      effectivenessIndex += 1) {
      var effectivenessFields = exactFields(effectivenessInputs[effectivenessIndex], [
        'candidateRef',
        'documentStableId',
        'documentRecordVersionId',
        'effectiveDate',
        'evidence'
      ]);
      var effectiveDate = effectivenessFields &&
        exactFields(effectivenessFields.effectiveDate, ['kind', 'value']);
      var effectivenessDocument = effectivenessFields &&
        ownedRecord(
          effectivenessFields.documentStableId,
          effectivenessFields.documentRecordVersionId
        );
      var effectivenessEvidence = effectivenessFields && effectivenessDocument &&
        parseCandidateEvidence(
          effectivenessFields.evidence,
          binding,
          binding.snapshotLocatorIds
        );
      if (!effectivenessFields || !takeRef(effectivenessFields.candidateRef) ||
          !effectivenessDocument ||
          (effectivenessDocument.kind !== 'agreement' &&
            effectivenessDocument.kind !== 'amendment') ||
          !effectiveDate || effectiveDate.kind !== 'civil-date' ||
          typeof effectiveDate.value !== 'string' ||
          !effectivenessEvidence ||
          effectivenessEvidence.some(function(locator) {
            return !effectivenessDocument.locatorIds[locator.locatorId];
          })) {
        return null;
      }
      effectiveness.push({
        candidateRef: effectivenessFields.candidateRef,
        documentStableId: effectivenessFields.documentStableId,
        documentRecordVersionId: effectivenessFields.documentRecordVersionId,
        effectiveDate: {
          kind: 'civil-date',
          value: effectiveDate.value
        },
        evidence: effectivenessEvidence,
        sourceFileId: generation.sourceFileId
      });
    }
    var lineage = [];
    for (var lineageIndex = 0; lineageIndex < lineageInputs.length; lineageIndex += 1) {
      var lineageFields = exactFields(lineageInputs[lineageIndex], [
        'candidateRef',
        'documentStableId',
        'documentRecordVersionId',
        'targetDocumentStableId',
        'targetDocumentRecordVersionId',
        'targetClauseStableId',
        'targetClauseRecordVersionId',
        'amendmentClauseStableId',
        'amendmentClauseRecordVersionId',
        'relationVersionId',
        'lineageRole',
        'scope',
        'evidence'
      ]);
      var lineageDocument = lineageFields &&
        ownedRecord(
          lineageFields.documentStableId,
          lineageFields.documentRecordVersionId,
          'amendment'
        );
      var targetDocument = lineageFields &&
        recordByStableId.get(lineageFields.targetDocumentStableId);
      var targetClause = lineageFields && lineageFields.targetClauseStableId !== null
        ? recordByStableId.get(lineageFields.targetClauseStableId)
        : null;
      var amendmentClause = lineageFields &&
        lineageFields.amendmentClauseStableId !== null
        ? ownedRecord(
          lineageFields.amendmentClauseStableId,
          lineageFields.amendmentClauseRecordVersionId,
          'clause'
        )
        : null;
      var relation = lineageFields &&
        relationByVersionId.get(lineageFields.relationVersionId);
      var lineageEvidence = lineageFields && lineageDocument &&
        parseCandidateEvidence(
          lineageFields.evidence,
          binding,
          binding.snapshotLocatorIds
        );
      var clauseScope = lineageFields && lineageFields.scope === 'clause';
      var documentScope = lineageFields && lineageFields.scope === 'document';
      var amendmentClauseContained = lineageFields && lineageDocument && amendmentClause &&
        Array.from(relationByVersionId.values()).some(function(local) {
          return local.relationClass === 'local' &&
            local.predicate === 'contains' &&
            local.fromStableRecordId === lineageDocument.stableRecordId &&
            local.fromRecordVersionId === lineageDocument.recordVersionId &&
            local.toStableRecordId === amendmentClause.stableRecordId &&
            local.toRecordVersionId === amendmentClause.recordVersionId;
        });
      if (!lineageFields || !takeRef(lineageFields.candidateRef) ||
          !lineageDocument || !targetDocument ||
          targetDocument.recordVersionId !== lineageFields.targetDocumentRecordVersionId ||
          (targetDocument.kind !== 'agreement' && targetDocument.kind !== 'amendment') ||
          !relation || relation.candidateOnly !== true ||
          relation.predicate !== 'amends-candidate' ||
          relation.sourceFileId !== generation.sourceFileId ||
          relation.fromStableRecordId !== lineageDocument.stableRecordId ||
          relation.fromRecordVersionId !== lineageDocument.recordVersionId ||
          (lineageFields.lineageRole !== 'partial-amendment' &&
            lineageFields.lineageRole !== 'full-replacement') ||
          (!clauseScope && !documentScope) ||
          (clauseScope && (!targetClause ||
            targetClause.kind !== 'clause' ||
            targetClause.recordVersionId !== lineageFields.targetClauseRecordVersionId ||
            !amendmentClause || !amendmentClauseContained ||
            relation.toStableRecordId !== targetClause.stableRecordId ||
            relation.toRecordVersionId !== targetClause.recordVersionId)) ||
          (documentScope && (lineageFields.targetClauseStableId !== null ||
            lineageFields.targetClauseRecordVersionId !== null ||
            lineageFields.amendmentClauseStableId !== null ||
            lineageFields.amendmentClauseRecordVersionId !== null ||
            relation.toStableRecordId !== targetDocument.stableRecordId ||
            relation.toRecordVersionId !== targetDocument.recordVersionId)) ||
          (clauseScope && lineageFields.lineageRole !== 'partial-amendment') ||
          (documentScope && lineageFields.lineageRole !== 'full-replacement') ||
          !lineageEvidence ||
          lineageEvidence.some(function(locator) {
            return !lineageDocument.locatorIds[locator.locatorId] ||
              !relation.locatorIds[locator.locatorId];
          })) {
        return null;
      }
      lineage.push({
        candidateRef: lineageFields.candidateRef,
        documentStableId: lineageFields.documentStableId,
        documentRecordVersionId: lineageFields.documentRecordVersionId,
        targetDocumentStableId: lineageFields.targetDocumentStableId,
        targetDocumentRecordVersionId: lineageFields.targetDocumentRecordVersionId,
        targetClauseStableId: lineageFields.targetClauseStableId,
        targetClauseRecordVersionId: lineageFields.targetClauseRecordVersionId,
        amendmentClauseStableId: lineageFields.amendmentClauseStableId,
        amendmentClauseRecordVersionId: lineageFields.amendmentClauseRecordVersionId,
        relationVersionId: lineageFields.relationVersionId,
        lineageRole: lineageFields.lineageRole,
        scope: lineageFields.scope,
        evidence: lineageEvidence,
        sourceFileId: generation.sourceFileId
      });
    }
    var facts = [];
    for (var factIndex = 0; factIndex < factInputs.length; factIndex += 1) {
      var factFields = exactFields(factInputs[factIndex], [
        'candidateRef',
        'documentStableId',
        'documentRecordVersionId',
        'clauseStableId',
        'clauseRecordVersionId',
        'assertionType',
        'typedValue',
        'evidence'
      ]);
      var factDocument = factFields &&
        ownedRecord(
          factFields.documentStableId,
          factFields.documentRecordVersionId
        );
      var factClause = factFields && factFields.clauseStableId !== null
        ? ownedRecord(
          factFields.clauseStableId,
          factFields.clauseRecordVersionId,
          'clause'
        )
        : null;
      var factEvidenceRecord = factClause || factDocument;
      var factEvidence = factFields && factEvidenceRecord &&
        parseCandidateEvidence(
          factFields.evidence,
          binding,
          binding.snapshotLocatorIds
        );
      if (!factFields || !takeRef(factFields.candidateRef) ||
          !factDocument ||
          (factDocument.kind !== 'agreement' && factDocument.kind !== 'amendment') ||
          ((factFields.clauseStableId === null) !==
            (factFields.clauseRecordVersionId === null)) ||
          (factFields.clauseStableId !== null && !factClause) ||
          truthSchema.ASSERTION_TYPES.indexOf(factFields.assertionType) < 0 ||
          !factEvidence ||
          factEvidence.some(function(locator) {
            return !factEvidenceRecord.locatorIds[locator.locatorId];
          })) {
        return null;
      }
      facts.push({
        candidateRef: factFields.candidateRef,
        documentStableId: factFields.documentStableId,
        documentRecordVersionId: factFields.documentRecordVersionId,
        clauseStableId: factFields.clauseStableId,
        clauseRecordVersionId: factFields.clauseRecordVersionId,
        assertionType: factFields.assertionType,
        typedValue: factFields.typedValue,
        evidence: factEvidence,
        sourceFileId: generation.sourceFileId
      });
    }
    var rules = [];
    for (var ruleIndex = 0; ruleIndex < ruleInputs.length; ruleIndex += 1) {
      var ruleFields = exactFields(ruleInputs[ruleIndex], [
        'candidateRef',
        'documentStableId',
        'documentRecordVersionId',
        'clauseStableId',
        'clauseRecordVersionId',
        'operator',
        'anchorAssertionType',
        'amount',
        'boundary',
        'timezone',
        'businessCalendarId',
        'businessCalendarVersionId',
        'consequenceEvidence',
        'evidence'
      ]);
      var ruleDocument = ruleFields &&
        ownedRecord(
          ruleFields.documentStableId,
          ruleFields.documentRecordVersionId
        );
      var ruleClause = ruleFields &&
        ownedRecord(
          ruleFields.clauseStableId,
          ruleFields.clauseRecordVersionId,
          'clause'
        );
      var ruleEvidence = ruleFields && ruleClause &&
        parseCandidateEvidence(
          ruleFields.evidence,
          binding,
          binding.snapshotLocatorIds
        );
      var consequenceEvidence = ruleFields && ruleClause &&
        parseFullLocator(
          ruleFields.consequenceEvidence,
          binding,
          binding.snapshotLocatorIds
        );
      if (!ruleFields || !takeRef(ruleFields.candidateRef) ||
          !ruleDocument || !ruleClause ||
          (ruleDocument.kind !== 'agreement' && ruleDocument.kind !== 'amendment') ||
          truthSchema.DEADLINE_OPERATORS.indexOf(ruleFields.operator) < 0 ||
          truthSchema.ASSERTION_TYPES.indexOf(ruleFields.anchorAssertionType) < 0 ||
          !validInteger(ruleFields.amount, 1, truthSchema.LIMITS.MAX_DAY_OFFSET_MAGNITUDE) ||
          (ruleFields.boundary !== 'inclusive' &&
            ruleFields.boundary !== 'exclusive') ||
          !(ruleFields.timezone === null || validOpaque(ruleFields.timezone, 128)) ||
          ((ruleFields.businessCalendarId === null) !==
            (ruleFields.businessCalendarVersionId === null)) ||
          !(ruleFields.businessCalendarId === null ||
            validOpaque(ruleFields.businessCalendarId, 256)) ||
          !(ruleFields.businessCalendarVersionId === null ||
            validOpaque(ruleFields.businessCalendarVersionId, 256)) ||
          !ruleEvidence || !consequenceEvidence ||
          !ruleClause.locatorIds[consequenceEvidence.locatorId] ||
          ruleEvidence.some(function(locator) {
            return !ruleClause.locatorIds[locator.locatorId];
          })) {
        return null;
      }
      rules.push({
        candidateRef: ruleFields.candidateRef,
        documentStableId: ruleFields.documentStableId,
        documentRecordVersionId: ruleFields.documentRecordVersionId,
        clauseStableId: ruleFields.clauseStableId,
        clauseRecordVersionId: ruleFields.clauseRecordVersionId,
        operator: ruleFields.operator,
        anchorAssertionType: ruleFields.anchorAssertionType,
        amount: ruleFields.amount,
        boundary: ruleFields.boundary,
        timezone: ruleFields.timezone,
        businessCalendarId: ruleFields.businessCalendarId,
        businessCalendarVersionId: ruleFields.businessCalendarVersionId,
        consequenceEvidence: consequenceEvidence,
        evidence: ruleEvidence,
        sourceFileId: generation.sourceFileId
      });
    }
    function candidateOrder(left, right) {
      return compareText(left.candidateRef, right.candidateRef);
    }
    execution.sort(candidateOrder);
    effectiveness.sort(candidateOrder);
    lineage.sort(candidateOrder);
    facts.sort(candidateOrder);
    rules.sort(candidateOrder);
    return {
      schemaVersion: fields.schemaVersion,
      candidateGenerationId: fields.candidateGenerationId,
      batchId: fields.batchId,
      fragmentGenerationId: fields.fragmentGenerationId,
      batchOrdinal: fields.batchOrdinal,
      executionCandidates: execution,
      effectivenessCandidates: effectiveness,
      lineageCandidates: lineage,
      factCandidates: facts,
      deadlineRuleCandidates: rules
    };
  }

  function collectCandidates(parsed) {
    var output = {
      execution: [],
      effectiveness: [],
      lineage: [],
      facts: [],
      rules: []
    };
    parsed.generations.forEach(function(generation) {
      generation.batches.forEach(function(batch) {
        Array.prototype.push.apply(output.execution, batch.executionCandidates);
        Array.prototype.push.apply(output.effectiveness, batch.effectivenessCandidates);
        Array.prototype.push.apply(output.lineage, batch.lineageCandidates);
        Array.prototype.push.apply(output.facts, batch.factCandidates);
        Array.prototype.push.apply(output.rules, batch.deadlineRuleCandidates);
      });
    });
    return output;
  }

  function stateByDocument(candidates, deadlineEngine, evaluationContext) {
    var output = new Map();
    function stateFor(documentStableId) {
      if (!output.has(documentStableId)) {
        output.set(documentStableId, {
          execution: [],
          effectiveness: [],
          termination: [],
          expiration: []
        });
      }
      return output.get(documentStableId);
    }
    candidates.execution.forEach(function(candidate) {
      stateFor(candidate.documentStableId).execution.push(candidate);
    });
    candidates.effectiveness.forEach(function(candidate) {
      stateFor(candidate.documentStableId).effectiveness.push(candidate);
    });
    candidates.facts.forEach(function(candidate) {
      if (candidate.assertionType === 'termination-date') {
        stateFor(candidate.documentStableId).termination.push(candidate);
      } else if (candidate.assertionType === 'expiration-date') {
        stateFor(candidate.documentStableId).expiration.push(candidate);
      }
    });
    output.forEach(function(state) {
      state.executionStates = sortedUnique(state.execution.map(function(candidate) {
        return candidate.executionState;
      }));
      state.effectiveDates = sortedUnique(state.effectiveness.map(function(candidate) {
        return candidate.effectiveDate.value;
      }));
      state.terminationDates = sortedUnique(state.termination.map(function(candidate) {
        return candidate.typedValue && candidate.typedValue.value;
      }).filter(function(value) {
        return typeof value === 'string';
      }));
      state.expirationDates = sortedUnique(state.expiration.map(function(candidate) {
        return candidate.typedValue && candidate.typedValue.value;
      }).filter(function(value) {
        return typeof value === 'string';
      }));
      state.executionValue = state.executionStates.length === 1
        ? state.executionStates[0]
        : 'unknown';
      state.executionKnown = state.executionValue === 'executed' ||
        state.executionValue === 'unsigned';
      state.temporalValue = 'unknown';
      state.temporalEvidence = [];
      var effective = state.effectiveDates.length === 1
        ? state.effectiveDates[0]
        : null;
      var asOf = deadlineEngine.parseCivilDate(evaluationContext.asOfCivilDate);
      var effectiveDate = effective && deadlineEngine.parseCivilDate(effective);
      var asOfOrdinal = asOf && deadlineEngine.toOrdinal(asOf);
      var effectiveOrdinal = effectiveDate && deadlineEngine.toOrdinal(effectiveDate);
      if (effectiveDate && effectiveOrdinal !== null && asOfOrdinal !== null) {
        state.temporalValue = effectiveOrdinal > asOfOrdinal ? 'future' : 'effective';
        state.temporalEvidence = state.effectiveness.slice();
        function latestApplicable(values, candidatesForValue) {
          var applicable = [];
          values.forEach(function(value) {
            var parsedDate = deadlineEngine.parseCivilDate(value);
            var ordinal = parsedDate && deadlineEngine.toOrdinal(parsedDate);
            if (ordinal !== null && ordinal <= asOfOrdinal) applicable.push(value);
          });
          if (applicable.length === 0) return null;
          applicable.sort(compareText);
          var selected = applicable[applicable.length - 1];
          state.temporalEvidence = state.temporalEvidence.concat(
            candidatesForValue.filter(function(candidate) {
              return candidate.typedValue && candidate.typedValue.value === selected;
            })
          );
          return selected;
        }
        if (state.terminationDates.length > 1 || state.expirationDates.length > 1) {
          state.temporalValue = 'unknown';
          state.temporalEvidence = state.effectiveness.concat(
            state.termination,
            state.expiration
          );
        } else if (latestApplicable(state.terminationDates, state.termination)) {
          state.temporalValue = 'terminated';
        } else if (latestApplicable(state.expirationDates, state.expiration)) {
          state.temporalValue = 'expired';
        }
      }
      state.acceptable = state.executionValue === 'executed' &&
        state.temporalValue === 'effective';
    });
    return output;
  }

  function acceptedLineages(candidates, documentStates, parsed) {
    var accepted = [];
    candidates.lineage.forEach(function(candidate) {
      var sourceState = documentStates.get(candidate.documentStableId);
      var relation = parsed.relationByVersionId.get(candidate.relationVersionId);
      var targetDocument = parsed.recordByStableId.get(candidate.targetDocumentStableId);
      var targetClause = candidate.targetClauseStableId === null
        ? null
        : parsed.recordByStableId.get(candidate.targetClauseStableId);
      var targetContained = candidate.scope === 'document';
      if (candidate.scope === 'clause' && targetClause && targetDocument) {
        targetContained = parsed.relations.some(function(local) {
          return local.relationClass === 'local' &&
            local.predicate === 'contains' &&
            local.fromStableRecordId === targetDocument.stableRecordId &&
            local.toStableRecordId === targetClause.stableRecordId;
        });
      }
      if (sourceState && sourceState.acceptable && relation && targetDocument &&
          targetContained) {
        accepted.push(candidate);
      }
    });
    accepted.sort(function(left, right) {
      return compareText(left.relationVersionId, right.relationVersionId);
    });
    return accepted;
  }

  function familyComponents(documents, accepted) {
    var parent = new Map();
    documents.forEach(function(document) {
      parent.set(document.stableRecordId, document.stableRecordId);
    });
    function find(value) {
      var root = parent.get(value);
      while (root !== parent.get(root)) root = parent.get(root);
      var current = value;
      while (current !== root) {
        var next = parent.get(current);
        parent.set(current, root);
        current = next;
      }
      return root;
    }
    function join(left, right) {
      var leftRoot = find(left);
      var rightRoot = find(right);
      if (leftRoot === rightRoot) return;
      if (compareText(leftRoot, rightRoot) < 0) parent.set(rightRoot, leftRoot);
      else parent.set(leftRoot, rightRoot);
    }
    accepted.forEach(function(candidate) {
      join(candidate.documentStableId, candidate.targetDocumentStableId);
    });
    var groups = new Map();
    documents.forEach(function(document) {
      var root = find(document.stableRecordId);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(document);
    });
    var output = Array.from(groups.values());
    output.forEach(function(group) {
      group.sort(function(left, right) {
        return compareText(left.stableRecordId, right.stableRecordId);
      });
    });
    output.sort(function(left, right) {
      return compareText(left[0].stableRecordId, right[0].stableRecordId);
    });
    return output;
  }

  function hasLineageCycle(accepted) {
    var edges = new Map();
    accepted.forEach(function(candidate) {
      if (!edges.has(candidate.documentStableId)) {
        edges.set(candidate.documentStableId, []);
      }
      edges.get(candidate.documentStableId).push(candidate.targetDocumentStableId);
    });
    edges.forEach(function(targets) {
      targets.sort(compareText);
    });
    var states = new Map();
    function visit(documentStableId) {
      var state = states.get(documentStableId);
      if (state === 1) return true;
      if (state === 2) return false;
      states.set(documentStableId, 1);
      var targets = edges.get(documentStableId) || [];
      for (var index = 0; index < targets.length; index += 1) {
        if (visit(targets[index])) return true;
      }
      states.set(documentStableId, 2);
      return false;
    }
    var documents = Array.from(edges.keys()).sort(compareText);
    for (var index = 0; index < documents.length; index += 1) {
      if (visit(documents[index])) return true;
    }
    return false;
  }

  function create(options) {
    var fields = exactFields(options, ['truthSchema', 'deadlineEngine', 'byteLength']);
    if (!fields || !fields.truthSchema || !fields.deadlineEngine ||
        fields.truthSchema.VERSION !== 'skopeo-truth-schema/1' ||
        fields.truthSchema.ADJUDICATION_VERSION !== VERSION ||
        fields.deadlineEngine.VERSION !== 'skopeo-deadline-engine/1' ||
        typeof fields.truthSchema.parseEvaluationContext !== 'function' ||
        typeof fields.truthSchema.deriveCandidateGenerationId !== 'function' ||
        typeof fields.truthSchema.deriveCitationId !== 'function' ||
        typeof fields.truthSchema.parseCitation !== 'function' ||
        typeof fields.truthSchema.deriveFamilyId !== 'function' ||
        typeof fields.truthSchema.deriveAssertionId !== 'function' ||
        typeof fields.truthSchema.deriveAssertionVersionId !== 'function' ||
        typeof fields.truthSchema.parseAssertion !== 'function' ||
        typeof fields.truthSchema.deriveConflictSetId !== 'function' ||
        typeof fields.truthSchema.parseConflictSet !== 'function' ||
        typeof fields.truthSchema.deriveDeadlineRuleId !== 'function' ||
        typeof fields.truthSchema.parseDeadlineRule !== 'function' ||
        typeof fields.truthSchema.deriveDeadlineDerivationId !== 'function' ||
        typeof fields.truthSchema.parseDeadlineResult !== 'function' ||
        typeof fields.truthSchema.parseSemanticFamilyProof !== 'function' ||
        typeof fields.truthSchema.canonicalize !== 'function' ||
        typeof fields.deadlineEngine.parseCivilDate !== 'function' ||
        typeof fields.deadlineEngine.toOrdinal !== 'function' ||
        typeof fields.deadlineEngine.fromOrdinal !== 'function' ||
        typeof fields.deadlineEngine.evaluateRule !== 'function' ||
        typeof fields.byteLength !== 'function') {
      return null;
    }
    var truthSchema = fields.truthSchema;
    var deadlineEngine = fields.deadlineEngine;
    var byteLength = fields.byteLength;

    async function adjudicateExactSet(input) {
      var digest = minimalDigest(input);
      var parsed;
      try {
        parsed = await parseInput(input, truthSchema);
      } catch (_error) {
        parsed = null;
      }
      if (!parsed || parsed.blocker) {
        return closedResult(digest, [parsed && parsed.blocker
          ? parsed.blocker
          : 'input-not-exact']);
      }
      var candidates = collectCandidates(parsed);
      var states = stateByDocument(candidates, deadlineEngine, parsed.evaluationContext);
      var accepted = acceptedLineages(candidates, states, parsed);
      var documents = parsed.records.filter(function(record) {
        return record.kind === 'agreement' || record.kind === 'amendment';
      });
      if (documents.length === 0) return closedResult(digest, ['fact-missing']);
      var components = familyComponents(documents, accepted);
      var families = [];
      try {
        for (var componentIndex = 0;
          componentIndex < components.length;
          componentIndex += 1) {
          var family = await buildFamily(
            components[componentIndex],
            accepted,
            candidates,
            states,
            parsed,
            truthSchema,
            deadlineEngine,
            byteLength
          );
          if (!family) return closedResult(digest, ['input-not-exact']);
          families.push(family);
        }
      } catch (_error) {
        return closedResult(digest, ['input-not-exact']);
      }
      families.sort(function(left, right) {
        return compareText(left.familyId, right.familyId);
      });
      return admittedResult(parsed.snapshot.authorizedSetDigest, families);
    }

    return Object.freeze({ adjudicateExactSet: adjudicateExactSet });
  }

  async function buildFamily(
    component,
    allAccepted,
    candidates,
    states,
    parsed,
    truthSchema,
    deadlineEngine,
    byteLength
  ) {
    var documentIdSet = new Set(component.map(function(document) {
      return document.stableRecordId;
    }));
    var accepted = allAccepted.filter(function(candidate) {
      return documentIdSet.has(candidate.documentStableId) &&
        documentIdSet.has(candidate.targetDocumentStableId);
    });
    var documentStableIds = component.map(function(document) {
      return document.stableRecordId;
    }).sort(compareText);
    var lineageRelationIds = accepted.map(function(candidate) {
      return candidate.relationVersionId;
    }).sort(compareText);
    var familyId = await truthSchema.deriveFamilyId({
      identityVersion: truthSchema.IDENTITY_VERSION,
      partitionKey: parsed.snapshot.partitionKey,
      documentStableIds: documentStableIds,
      lineageRelationIds: lineageRelationIds
    });
    if (!familyId) return null;

    var citationById = new Map();
    async function citationsFor(candidate, recordVersionId, relationVersionId) {
      var output = [];
      for (var index = 0; index < candidate.evidence.length; index += 1) {
        var locator = candidate.evidence[index];
        var citationInput = {
          schemaVersion: truthSchema.VERSION,
          partitionKey: parsed.snapshot.partitionKey,
          sourceFileId: locator.sourceFileId,
          contentFingerprint: locator.contentFingerprint,
          fragmentGenerationId: locator.fragmentGenerationId,
          recordVersionId: recordVersionId,
          relationVersionId: relationVersionId,
          locatorId: locator.locatorId,
          sourceByteStart: locator.sourceByteStart,
          sourceByteEnd: locator.sourceByteEnd
        };
        var citationId = await truthSchema.deriveCitationId(citationInput);
        if (!citationId) return null;
        var citationValue = {
          schemaVersion: truthSchema.VERSION,
          partitionKey: citationInput.partitionKey,
          sourceFileId: citationInput.sourceFileId,
          contentFingerprint: citationInput.contentFingerprint,
          fragmentGenerationId: citationInput.fragmentGenerationId,
          recordVersionId: citationInput.recordVersionId,
          relationVersionId: citationInput.relationVersionId,
          locatorId: citationInput.locatorId,
          sourceByteStart: citationInput.sourceByteStart,
          sourceByteEnd: citationInput.sourceByteEnd,
          excerptId: locator.excerptId,
          start: locator.start,
          end: locator.end,
          citationId: citationId
        };
        var citation = await truthSchema.parseCitation(citationValue);
        if (!citation) return null;
        citationById.set(citation.citationId, citation);
        output.push(citation.citationId);
      }
      return sortedUnique(output);
    }

    var baseCandidates = component.filter(function(document) {
      return document.kind === 'agreement' &&
        states.has(document.stableRecordId) &&
        states.get(document.stableRecordId).acceptable;
    });
    var fullReplacements = accepted.filter(function(candidate) {
      return candidate.lineageRole === 'full-replacement';
    });
    var partialAmendments = accepted.filter(function(candidate) {
      return candidate.lineageRole === 'partial-amendment';
    });
    var reviewRequired = baseCandidates.length !== 1 || hasLineageCycle(accepted);
    var base = baseCandidates.length === 1 ? baseCandidates[0] : null;
    var governingDocument = base;
    var replacementOrdinals = Object.create(null);
    var lineageEvents = [];
    for (var replacementIndex = 0;
      replacementIndex < fullReplacements.length;
      replacementIndex += 1) {
      var replacement = fullReplacements[replacementIndex];
      var replacementState = states.get(replacement.documentStableId);
      var replacementDate = replacementState &&
        replacementState.effectiveDates.length === 1
        ? deadlineEngine.parseCivilDate(replacementState.effectiveDates[0])
        : null;
      var replacementOrdinal = replacementDate && deadlineEngine.toOrdinal(replacementDate);
      if (replacementOrdinal === null || replacementOrdinal === undefined ||
          own(replacementOrdinals, String(replacementOrdinal))) {
        reviewRequired = true;
      } else {
        replacementOrdinals[String(replacementOrdinal)] = true;
        lineageEvents.push({
          kind: 'replacement',
          candidate: replacement,
          ordinal: replacementOrdinal
        });
      }
    }

    var overlayTargetDates = Object.create(null);
    for (var partialIndex = 0;
      partialIndex < partialAmendments.length;
      partialIndex += 1) {
      var partial = partialAmendments[partialIndex];
      var partialState = states.get(partial.documentStableId);
      var partialDate = partialState && partialState.effectiveDates.length === 1
        ? partialState.effectiveDates[0]
        : null;
      var overlayKey = partial.targetClauseStableId + '\u0000' + partialDate;
      if (!partialDate || own(overlayTargetDates, overlayKey)) reviewRequired = true;
      overlayTargetDates[overlayKey] = true;
      var parsedPartialDate = partialDate &&
        deadlineEngine.parseCivilDate(partialDate);
      var partialOrdinal = parsedPartialDate &&
        deadlineEngine.toOrdinal(parsedPartialDate);
      if (partialOrdinal !== null && partialOrdinal !== undefined) {
        lineageEvents.push({
          kind: 'partial',
          candidate: partial,
          ordinal: partialOrdinal
        });
      }
    }
    lineageEvents.sort(function(left, right) {
      return left.ordinal - right.ordinal ||
        compareText(left.candidate.relationVersionId, right.candidate.relationVersionId);
    });
    var pathPartialAmendments = [];
    var currentPartialByTarget = new Map();
    var acceptedPathRecordVersionIds = [];
    var acceptedPathRecordSet = Object.create(null);
    function addAcceptedPathRecord(record) {
      if (!record || own(acceptedPathRecordSet, record.recordVersionId)) return;
      acceptedPathRecordSet[record.recordVersionId] = true;
      acceptedPathRecordVersionIds.push(record.recordVersionId);
    }
    addAcceptedPathRecord(base);
    for (var eventIndex = 0; eventIndex < lineageEvents.length;) {
      var eventEnd = eventIndex + 1;
      while (eventEnd < lineageEvents.length &&
          lineageEvents[eventEnd].ordinal === lineageEvents[eventIndex].ordinal) {
        eventEnd += 1;
      }
      var sameDayEvents = lineageEvents.slice(eventIndex, eventEnd);
      var sameDayReplacements = sameDayEvents.filter(function(event) {
        return event.kind === 'replacement';
      });
      var sameDayPartials = sameDayEvents.filter(function(event) {
        return event.kind === 'partial';
      });
      var priorGoverningDocumentId = governingDocument
        ? governingDocument.stableRecordId
        : null;
      var sameDayReplacementDocumentIds = new Set(
        sameDayReplacements.map(function(event) {
          return event.candidate.documentStableId;
        })
      );
      var orderDependentPartials = new Set();
      if (sameDayReplacements.length > 0 && sameDayPartials.length > 0) {
        sameDayPartials.forEach(function(event) {
          var targetDocumentId = event.candidate.targetDocumentStableId;
          if (targetDocumentId === priorGoverningDocumentId ||
              sameDayReplacementDocumentIds.has(targetDocumentId)) {
            orderDependentPartials.add(event);
          }
        });
        if (orderDependentPartials.size > 0) reviewRequired = true;
      }

      for (var replacementEventIndex = 0;
        replacementEventIndex < sameDayReplacements.length;
        replacementEventIndex += 1) {
        var replacementEvent = sameDayReplacements[replacementEventIndex];
        var replacementCandidate = replacementEvent.candidate;
        if (!governingDocument ||
            replacementCandidate.targetDocumentStableId !==
              governingDocument.stableRecordId) {
          reviewRequired = true;
          continue;
        }
        var nextGoverningDocument = parsed.recordByStableId.get(
          replacementCandidate.documentStableId);
        if (!nextGoverningDocument) {
          reviewRequired = true;
          continue;
        }
        governingDocument = nextGoverningDocument;
        currentPartialByTarget.clear();
        addAcceptedPathRecord(governingDocument);
      }

      for (var partialEventIndex = 0;
        partialEventIndex < sameDayPartials.length;
        partialEventIndex += 1) {
        var partialEvent = sameDayPartials[partialEventIndex];
        if (orderDependentPartials.has(partialEvent)) continue;
        var partialCandidate = partialEvent.candidate;
        if (!governingDocument ||
            partialCandidate.targetDocumentStableId !==
              governingDocument.stableRecordId) {
          continue;
        }
        pathPartialAmendments.push(partialCandidate);
        currentPartialByTarget.set(partialCandidate.targetClauseStableId, {
          candidate: partialCandidate,
          ordinal: partialEvent.ordinal
        });
        addAcceptedPathRecord(
          parsed.recordByStableId.get(partialCandidate.documentStableId));
      }
      eventIndex = eventEnd;
    }

    if (!governingDocument && component.length > 0) {
      governingDocument = component[0];
    }
    var selectedState = governingDocument && states.get(governingDocument.stableRecordId);
    if (!selectedState) {
      selectedState = {
        executionValue: 'unknown',
        temporalValue: 'unknown',
        execution: [],
        temporalEvidence: []
      };
    }
    var terminated = selectedState.temporalValue === 'terminated';
    var expired = selectedState.temporalValue === 'expired';
    if (terminated || expired) governingDocument = base || governingDocument;
    var executionCitations = [];
    for (var executionIndex = 0;
      executionIndex < selectedState.execution.length;
      executionIndex += 1) {
      var executionIds = await citationsFor(
        selectedState.execution[executionIndex],
        selectedState.execution[executionIndex].documentRecordVersionId,
        null
      );
      if (!executionIds) return null;
      executionCitations = executionCitations.concat(executionIds);
    }
    executionCitations = sortedUnique(executionCitations);
    var temporalCitations = [];
    for (var temporalIndex = 0;
      temporalIndex < selectedState.temporalEvidence.length;
      temporalIndex += 1) {
      var temporalCandidate = selectedState.temporalEvidence[temporalIndex];
      var temporalRecordVersionId = temporalCandidate.clauseRecordVersionId ||
        temporalCandidate.documentRecordVersionId;
      var temporalIds = await citationsFor(
        temporalCandidate,
        temporalRecordVersionId,
        null
      );
      if (!temporalIds) return null;
      temporalCitations = temporalCitations.concat(temporalIds);
    }
    temporalCitations = sortedUnique(temporalCitations);
    var lineageCitations = [];
    for (var lineageIndex = 0; lineageIndex < accepted.length; lineageIndex += 1) {
      var lineageIds = await citationsFor(
        accepted[lineageIndex],
        accepted[lineageIndex].documentRecordVersionId,
        accepted[lineageIndex].relationVersionId
      );
      if (!lineageIds) return null;
      lineageCitations = lineageCitations.concat(lineageIds);
    }
    lineageCitations = sortedUnique(lineageCitations);

    var executionAxis = {
      value: selectedState.executionValue === 'executed'
        ? 'executed'
        : (selectedState.executionValue === 'unsigned' ? 'unsigned' : 'unknown'),
      reasonCode: selectedState.executionValue === 'executed'
        ? 'executed-evidence'
        : (selectedState.executionValue === 'unsigned'
          ? 'unsigned-evidence'
          : 'execution-evidence-missing'),
      citationIds: executionCitations,
      inputRecordVersionIds: sortedUnique(selectedState.execution.map(function(candidate) {
        return candidate.documentRecordVersionId;
      })),
      inputRelationVersionIds: [],
      trustState: selectedState.executionKnown ? 'extracted' : 'review-required',
      basis: 'direct'
    };
    var temporalAxis = {
      value: selectedState.temporalValue,
      reasonCode: selectedState.temporalValue === 'future'
        ? 'future-effective-date'
        : (selectedState.temporalValue === 'effective'
          ? 'effective-as-of-date'
          : (selectedState.temporalValue === 'expired'
            ? 'expired-as-of-date'
            : (selectedState.temporalValue === 'terminated'
              ? 'terminated-as-of-date'
              : 'temporal-evidence-incomplete'))),
      citationIds: temporalCitations,
      inputRecordVersionIds: sortedUnique(
        selectedState.temporalEvidence.map(function(candidate) {
          return candidate.clauseRecordVersionId || candidate.documentRecordVersionId;
        })
      ),
      inputRelationVersionIds: [],
      trustState: selectedState.temporalValue === 'unknown'
        ? 'review-required'
        : 'extracted',
      basis: 'direct'
    };
    var lineageValue = terminated || expired
      ? 'historical'
      : (fullReplacements.length > 0
        ? 'full-replacement'
        : (partialAmendments.length > 0 ? 'partial-amendment'
          : (base ? 'base' : 'unclassified')));
    var lineageAxis = {
      value: lineageValue,
      reasonCode: lineageValue === 'base'
        ? 'lineage-base-evidence'
        : (lineageValue === 'partial-amendment'
          ? 'lineage-partial-amendment-evidence'
          : (lineageValue === 'full-replacement'
            ? 'lineage-full-replacement-evidence'
            : (lineageValue === 'historical'
              ? 'lineage-historical-evidence'
              : 'lineage-evidence-incomplete'))),
      citationIds: lineageCitations,
      inputRecordVersionIds: sortedUnique(component.map(function(document) {
        return document.recordVersionId;
      })),
      inputRelationVersionIds: lineageRelationIds,
      trustState: lineageValue === 'unclassified' ? 'review-required' : 'extracted',
      basis: accepted.length > 0 ? 'direct' : 'derived'
    };
    var containsRelations = parsed.relations.filter(function(relation) {
      return relation.relationClass === 'local' &&
        relation.predicate === 'contains' &&
        documentIdSet.has(relation.fromStableRecordId);
    });
    var overlays = [];
    var validatedPartialAmendments = [];
    for (var overlayIndex = 0;
      overlayIndex < pathPartialAmendments.length;
      overlayIndex += 1) {
      var overlay = pathPartialAmendments[overlayIndex];
      var amendmentClause = parsed.recordByStableId.get(
        overlay.amendmentClauseStableId);
      var amendmentClauseContained = amendmentClause &&
        amendmentClause.recordVersionId === overlay.amendmentClauseRecordVersionId &&
        containsRelations.some(function(relation) {
          return relation.fromStableRecordId === overlay.documentStableId &&
            relation.fromRecordVersionId === overlay.documentRecordVersionId &&
            relation.toStableRecordId === amendmentClause.stableRecordId &&
            relation.toRecordVersionId === amendmentClause.recordVersionId;
        });
      if (!amendmentClause || !amendmentClauseContained) {
        reviewRequired = true;
        continue;
      }
      var overlayCitationIds = await citationsFor(
        overlay,
        overlay.documentRecordVersionId,
        overlay.relationVersionId
      );
      if (!overlayCitationIds) return null;
      validatedPartialAmendments.push(overlay);
      overlays.push({
        baseClauseRecordVersionId: overlay.targetClauseRecordVersionId,
        amendmentDocumentRecordVersionId: overlay.documentRecordVersionId,
        amendmentClauseRecordVersionId: amendmentClause.recordVersionId,
        effect: 'replace',
        citationIds: overlayCitationIds
      });
    }
    overlays.sort(function(left, right) {
      return compareText(left.baseClauseRecordVersionId, right.baseClauseRecordVersionId) ||
        compareText(
          left.amendmentDocumentRecordVersionId,
          right.amendmentDocumentRecordVersionId
        ) ||
        compareText(
          left.amendmentClauseRecordVersionId,
          right.amendmentClauseRecordVersionId
        ) || compareText(left.effect, right.effect);
    });
    var validatedPartialSet = new Set(validatedPartialAmendments);
    var governingOverlayByTarget = new Map();
    currentPartialByTarget.forEach(function(selected, targetClauseStableId) {
      if (validatedPartialSet.has(selected.candidate)) {
        governingOverlayByTarget.set(targetClauseStableId, selected);
      }
    });
    var inheritances = [];
    if (governingDocument && governingOverlayByTarget.size > 0) {
      containsRelations.forEach(function(relation) {
        if (relation.fromStableRecordId !== governingDocument.stableRecordId ||
            governingOverlayByTarget.has(relation.toStableRecordId)) {
          return;
        }
        inheritances.push({
          baseClauseRecordVersionId: relation.toRecordVersionId,
          governingDocumentRecordVersionId: governingDocument.recordVersionId,
          citationIds: []
        });
      });
    }
    inheritances.sort(function(left, right) {
      return compareText(left.baseClauseRecordVersionId, right.baseClauseRecordVersionId) ||
        compareText(
          left.governingDocumentRecordVersionId,
          right.governingDocumentRecordVersionId
      );
    });

    var governanceValue;
    if (terminated || expired) governanceValue = 'non-governing';
    else if (reviewRequired || selectedState.executionValue !== 'executed' ||
        selectedState.temporalValue !== 'effective' || lineageValue === 'unclassified') {
      governanceValue = 'review-required';
    } else if (governingOverlayByTarget.size > 0) {
      governanceValue = 'partially-governing';
    } else {
      governanceValue = 'governing';
    }
    var governanceAxis = {
      value: governanceValue,
      reasonCode: governanceValue === 'governing'
        ? 'governing-path-accepted'
        : (governanceValue === 'partially-governing'
          ? 'partial-overlay-accepted'
          : (governanceValue === 'non-governing'
            ? 'non-governing-evidence'
            : 'governance-review-required')),
      citationIds: sortedUnique(
        executionCitations.concat(temporalCitations, lineageCitations)
      ),
      inputRecordVersionIds: sortedUnique(component.map(function(document) {
        return document.recordVersionId;
      })),
      inputRelationVersionIds: lineageRelationIds,
      trustState: governanceValue === 'review-required'
        ? 'review-required'
        : 'inferred',
      basis: 'derived'
    };

    function candidateIsApplicable(candidate) {
      if (!governingDocument) return false;
      if (candidate.documentStableId === governingDocument.stableRecordId) {
        return candidate.clauseStableId === null ||
          !governingOverlayByTarget.has(candidate.clauseStableId);
      }
      var applicable = false;
      governingOverlayByTarget.forEach(function(selected) {
        if (applicable ||
            selected.candidate.documentStableId !== candidate.documentStableId) {
          return;
        }
        if (candidate.clauseStableId ===
            selected.candidate.amendmentClauseStableId) {
          applicable = true;
        }
      });
      return applicable;
    }

    var assertions = [];
    var assertionByVersionId = new Map();
    var applicableAssertionVersionIds = new Set();
    async function admitAssertion(specification) {
      var citationIds = sortedUnique(specification.citationIds);
      if (citationIds.length === 0 ||
          citationIds.length > truthSchema.LIMITS.MAX_CITATIONS_PER_ASSERTION) {
        return null;
      }
      var primaryCitation = citationById.get(citationIds[0]);
      if (!primaryCitation) return null;
      var primarySourceLocator = {
        sourceFileId: primaryCitation.sourceFileId,
        sourceByteStart: primaryCitation.sourceByteStart,
        sourceByteEnd: primaryCitation.sourceByteEnd
      };
      var assertionId = await truthSchema.deriveAssertionId({
        identityVersion: truthSchema.IDENTITY_VERSION,
        partitionKey: parsed.snapshot.partitionKey,
        familyId: familyId,
        subjectDocumentStableId: specification.subjectDocumentStableId,
        subjectClauseStableId: specification.subjectClauseStableId,
        assertionType: specification.assertionType,
        primarySourceLocator: primarySourceLocator
      });
      var assertionVersionId = assertionId &&
        await truthSchema.deriveAssertionVersionId({
          assertionId: assertionId,
          typedValue: specification.typedValue,
          trustState: specification.trustState,
          citationIds: citationIds,
          candidateSchemaVersion: truthSchema.CANDIDATE_SCHEMA_VERSION,
          promptVersion: truthSchema.PROMPT_VERSION,
          derivationRuleVersion: specification.derivationRuleVersion
        });
      var assertion = assertionVersionId && await truthSchema.parseAssertion({
        schemaVersion: truthSchema.VERSION,
        partitionKey: parsed.snapshot.partitionKey,
        familyId: familyId,
        subjectDocumentStableId: specification.subjectDocumentStableId,
        subjectClauseStableId: specification.subjectClauseStableId,
        assertionType: specification.assertionType,
        typedValue: specification.typedValue,
        trustState: specification.trustState,
        citationIds: citationIds,
        primarySourceLocator: primarySourceLocator,
        candidateSchemaVersion: truthSchema.CANDIDATE_SCHEMA_VERSION,
        promptVersion: truthSchema.PROMPT_VERSION,
        derivationRuleVersion: specification.derivationRuleVersion,
        assertionId: assertionId,
        assertionVersionId: assertionVersionId
      }, Array.from(citationById.values()));
      if (!assertion) return null;
      if (!assertionByVersionId.has(assertion.assertionVersionId)) {
        assertionByVersionId.set(assertion.assertionVersionId, assertion);
        assertions.push(assertion);
      }
      return assertionByVersionId.get(assertion.assertionVersionId);
    }
    var familyFacts = candidates.facts.filter(function(candidate) {
      return documentIdSet.has(candidate.documentStableId);
    });
    for (var factIndex = 0; factIndex < familyFacts.length; factIndex += 1) {
      var fact = familyFacts[factIndex];
      var factRecordVersionId = fact.clauseRecordVersionId ||
        fact.documentRecordVersionId;
      var factCitationIds = await citationsFor(fact, factRecordVersionId, null);
      if (!factCitationIds || factCitationIds.length === 0) return null;
      var assertion = await admitAssertion({
        subjectDocumentStableId: fact.documentStableId,
        subjectClauseStableId: fact.clauseStableId,
        assertionType: fact.assertionType,
        typedValue: fact.typedValue,
        trustState: 'extracted',
        citationIds: factCitationIds,
        derivationRuleVersion: null
      });
      if (!assertion) return null;
      if (candidateIsApplicable(fact)) {
        applicableAssertionVersionIds.add(assertion.assertionVersionId);
      }
    }
    assertions.sort(function(left, right) {
      return compareText(left.assertionVersionId, right.assertionVersionId);
    });

    async function buildConflicts() {
      var output = [];
      var assertionsBySlot = new Map();
      assertions.forEach(function(assertion) {
        if (!applicableAssertionVersionIds.has(assertion.assertionVersionId)) return;
        var key = assertion.subjectDocumentStableId + '\u0000' +
          (assertion.subjectClauseStableId || 'null') + '\u0000' +
          assertion.assertionType;
        if (!assertionsBySlot.has(key)) assertionsBySlot.set(key, []);
        assertionsBySlot.get(key).push(assertion);
      });
      var conflictEntries = Array.from(assertionsBySlot.values());
      for (var conflictIndex = 0;
        conflictIndex < conflictEntries.length;
        conflictIndex += 1) {
        var slotAssertions = conflictEntries[conflictIndex];
        var values = sortedUnique(slotAssertions.map(function(assertion) {
          return truthSchema.canonicalize(assertion.typedValue);
        }));
        if (values.length < 2) continue;
        var assertionVersionIds = slotAssertions.map(function(assertion) {
          return assertion.assertionVersionId;
        }).sort(compareText);
        var conflictCitationIds = sortedUnique([].concat.apply(
          [],
          slotAssertions.map(function(assertion) {
            return Array.from(assertion.citationIds);
          })
        ));
        var firstAssertion = slotAssertions[0];
        var conflictSetId = await truthSchema.deriveConflictSetId({
          identityVersion: truthSchema.IDENTITY_VERSION,
          partitionKey: parsed.snapshot.partitionKey,
          familyId: familyId,
          subjectDocumentStableId: firstAssertion.subjectDocumentStableId,
          subjectClauseStableId: firstAssertion.subjectClauseStableId,
          assertionType: firstAssertion.assertionType,
          applicabilityContext: 'governing-path',
          assertionVersionIds: assertionVersionIds
        });
        if (!conflictSetId) return null;
        var conflict = await truthSchema.parseConflictSet({
          schemaVersion: truthSchema.VERSION,
          partitionKey: parsed.snapshot.partitionKey,
          familyId: familyId,
          subjectDocumentStableId: firstAssertion.subjectDocumentStableId,
          subjectClauseStableId: firstAssertion.subjectClauseStableId,
          assertionType: firstAssertion.assertionType,
          applicabilityContext: 'governing-path',
          assertionVersionIds: assertionVersionIds,
          citationIds: conflictCitationIds,
          conflictSetId: conflictSetId
        }, assertions, Array.from(citationById.values()));
        if (!conflict) return null;
        output.push(conflict);
      }
      output.sort(function(left, right) {
        return compareText(left.conflictSetId, right.conflictSetId);
      });
      return output;
    }
    var conflicts = await buildConflicts();
    if (!conflicts) return null;

    var deadlineRules = [];
    var deadlineResults = [];
    var familyRules = candidates.rules.filter(function(candidate) {
      return documentIdSet.has(candidate.documentStableId) &&
        candidateIsApplicable(candidate);
    });
    for (var ruleIndex = 0; ruleIndex < familyRules.length; ruleIndex += 1) {
      var ruleCandidate = familyRules[ruleIndex];
      var anchorCandidates = assertions.filter(function(assertion) {
        return applicableAssertionVersionIds.has(assertion.assertionVersionId) &&
          assertion.subjectDocumentStableId === ruleCandidate.documentStableId &&
          assertion.subjectClauseStableId === ruleCandidate.clauseStableId &&
          assertion.assertionType === ruleCandidate.anchorAssertionType;
      });
      if (anchorCandidates.length === 0) continue;
      var anchor = anchorCandidates[0];
      var consequenceAssertion = assertions.find(function(assertion) {
        return applicableAssertionVersionIds.has(assertion.assertionVersionId) &&
          assertion.subjectDocumentStableId === ruleCandidate.documentStableId &&
          assertion.subjectClauseStableId === ruleCandidate.clauseStableId &&
          assertion.assertionType === 'notice-window';
      }) || null;
      var ruleCitationIds = await citationsFor(
        ruleCandidate,
        ruleCandidate.clauseRecordVersionId,
        null
      );
      if (!ruleCitationIds) return null;
      var consequenceCitationIds = consequenceAssertion
        ? sortedUnique(
          Array.from(consequenceAssertion.citationIds).concat(ruleCitationIds)
        )
        : [];
      var calendar = parsed.evaluationContext.calendars.find(function(item) {
        return item.calendarId === ruleCandidate.businessCalendarId &&
          item.calendarVersionId === ruleCandidate.businessCalendarVersionId;
      });
      var business = ruleCandidate.operator === 'add-business-days' ||
        ruleCandidate.operator === 'subtract-business-days';
      var deadlineRuleBase = {
        schemaVersion: truthSchema.DEADLINE_RULE_VERSION,
        partitionKey: parsed.snapshot.partitionKey,
        familyId: familyId,
        operator: ruleCandidate.operator,
        anchorAssertionVersionId: anchor.assertionVersionId,
        amount: ruleCandidate.amount,
        boundary: ruleCandidate.boundary,
        timezone: ruleCandidate.timezone,
        businessCalendarId: business
          ? (ruleCandidate.businessCalendarId || 'missing-business-calendar')
          : null,
        businessCalendarVersionId: business
          ? (calendar
            ? ruleCandidate.businessCalendarVersionId
            : 'missing-calendar-version')
          : null,
        consequence: consequenceAssertion ? {
          assertionVersionId: consequenceAssertion.assertionVersionId,
          citationIds: consequenceCitationIds
        } : null,
        citedInputAssertionVersionIds: sortedUnique(
          [anchor.assertionVersionId].concat(
            consequenceAssertion ? [consequenceAssertion.assertionVersionId] : []
          )
        ),
        citationIds: sortedUnique(
          ruleCitationIds.concat(
            Array.from(anchor.citationIds),
            consequenceAssertion ? Array.from(consequenceAssertion.citationIds) : []
          )
        )
      };
      var deadlineRuleId = await truthSchema.deriveDeadlineRuleId(deadlineRuleBase);
      var deadlineRule = deadlineRuleId && await truthSchema.parseDeadlineRule(
        Object.assign({}, deadlineRuleBase, { deadlineRuleId: deadlineRuleId }),
        assertions,
        Array.from(citationById.values())
      );
      if (!deadlineRule) return null;
      var deadlineResult = await deadlineEngine.evaluateRule(
        deadlineRule,
        assertions,
        Array.from(citationById.values()),
        parsed.evaluationContext
      );
      if (!deadlineResult) return null;
      var extraBlockers = [];
      var governanceAccepted = governanceValue === 'governing' ||
        governanceValue === 'partially-governing';
      if (!governanceAccepted) {
        extraBlockers.push('lineage-review-required');
      }
      var anchorConflict = conflicts.some(function(conflict) {
        return conflict.subjectDocumentStableId === anchor.subjectDocumentStableId &&
          conflict.subjectClauseStableId === anchor.subjectClauseStableId &&
          conflict.assertionType === anchor.assertionType;
      });
      if (anchorConflict) extraBlockers.push('fact-conflict');
      if (deadlineResult.deadlineCivilDate !== null &&
          governanceAccepted && !anchorConflict) {
        var derivedCitationIds = [];
        [
          Array.from(anchor.citationIds),
          ruleCitationIds,
          consequenceAssertion ? Array.from(consequenceAssertion.citationIds) : []
        ].forEach(function(ids) {
          ids.forEach(function(id) {
            if (derivedCitationIds.length <
                truthSchema.LIMITS.MAX_CITATIONS_PER_ASSERTION &&
                derivedCitationIds.indexOf(id) < 0) {
              derivedCitationIds.push(id);
            }
          });
        });
        derivedCitationIds.sort(compareText);
        var derivedDeadline = await admitAssertion({
          subjectDocumentStableId: ruleCandidate.documentStableId,
          subjectClauseStableId: ruleCandidate.clauseStableId,
          assertionType: 'notice-deadline',
          typedValue: {
            kind: 'civil-date',
            value: deadlineResult.deadlineCivilDate
          },
          trustState: 'inferred',
          citationIds: derivedCitationIds,
          derivationRuleVersion: truthSchema.DEADLINE_RULE_VERSION
        });
        if (!derivedDeadline) return null;
        applicableAssertionVersionIds.add(derivedDeadline.assertionVersionId);
      }
      var directDeadlines = assertions.filter(function(assertion) {
        return applicableAssertionVersionIds.has(assertion.assertionVersionId) &&
          assertion.trustState === 'extracted' &&
          assertion.derivationRuleVersion === null &&
          assertion.subjectDocumentStableId === anchor.subjectDocumentStableId &&
          assertion.subjectClauseStableId === anchor.subjectClauseStableId &&
          assertion.assertionType === 'notice-deadline';
      });
      if (deadlineResult.deadlineCivilDate !== null &&
          directDeadlines.some(function(assertion) {
            return assertion.typedValue.value !== deadlineResult.deadlineCivilDate;
          })) {
        extraBlockers.push('fact-conflict');
      }
      if (extraBlockers.length > 0) {
        var blockerCodes = sortedUnique(
          Array.from(deadlineResult.blockerCodes).concat(extraBlockers)
        );
        var inputAssertionVersionIds = sortedUnique(
          Array.from(deadlineResult.inputAssertionVersionIds).concat(
            directDeadlines.map(function(assertion) {
              return assertion.assertionVersionId;
            })
          )
        );
        var inputCitationIds = sortedUnique(
          Array.from(deadlineResult.inputCitationIds).concat([].concat.apply(
            [],
            directDeadlines.map(function(assertion) {
              return Array.from(assertion.citationIds);
            })
          ))
        );
        var resultBase = {
          schemaVersion: deadlineResult.schemaVersion,
          partitionKey: deadlineResult.partitionKey,
          familyId: deadlineResult.familyId,
          deadlineRuleId: deadlineResult.deadlineRuleId,
          anchorAssertionVersionId: deadlineResult.anchorAssertionVersionId,
          anchorCivilDate: deadlineResult.anchorCivilDate,
          windowStartCivilDate: deadlineResult.windowStartCivilDate,
          deadlineCivilDate: deadlineResult.deadlineCivilDate,
          boundary: deadlineResult.boundary,
          timezone: deadlineResult.timezone,
          consequence: deadlineResult.consequence,
          ruleVersion: deadlineResult.ruleVersion,
          calendarId: deadlineResult.calendarId,
          calendarVersionId: deadlineResult.calendarVersionId,
          inputAssertionVersionIds: inputAssertionVersionIds,
          inputCitationIds: inputCitationIds,
          trustState: 'inferred',
          inputsCurrent: deadlineResult.inputsCurrent,
          inputsExact: false,
          eligibility: 'ineligible',
          blockerCodes: blockerCodes
        };
        var derivationId = await truthSchema.deriveDeadlineDerivationId(resultBase);
        deadlineResult = derivationId && await truthSchema.parseDeadlineResult(
          Object.assign({}, resultBase, { deadlineDerivationId: derivationId }),
          [deadlineRule],
          assertions,
          Array.from(citationById.values())
        );
        if (!deadlineResult) return null;
      }
      deadlineRules.push(deadlineRule);
      deadlineResults.push(deadlineResult);
    }
    assertions.sort(function(left, right) {
      return compareText(left.assertionVersionId, right.assertionVersionId);
    });
    conflicts = await buildConflicts();
    if (!conflicts) return null;
    deadlineRules.sort(function(left, right) {
      return compareText(left.deadlineRuleId, right.deadlineRuleId);
    });
    deadlineResults.sort(function(left, right) {
      return compareText(left.deadlineDerivationId, right.deadlineDerivationId);
    });

    var citations = Array.from(citationById.values()).sort(function(left, right) {
      return compareText(left.citationId, right.citationId);
    });
    if (citations.length === 0 ||
        citations.length > truthSchema.LIMITS.MAX_FAMILY_CITATIONS ||
        assertions.length > truthSchema.LIMITS.MAX_ASSERTIONS_PER_FAMILY ||
        conflicts.length > truthSchema.LIMITS.MAX_CONFLICTS_PER_FAMILY ||
        deadlineRules.length > truthSchema.LIMITS.MAX_RULES_PER_FAMILY) {
      return null;
    }
    var candidateGenerationIds = sortedUnique([].concat.apply(
      [],
      parsed.generations.map(function(generation) {
        return generation.candidateGenerationIds;
      })
    ));
    var lineageProof = {
      schemaVersion: truthSchema.VERSION,
      partitionKey: parsed.snapshot.partitionKey,
      familyId: familyId,
      execution: executionAxis,
      temporal: temporalAxis,
      lineageRole: lineageAxis,
      governance: governanceAxis,
      acceptedPath: acceptedPathRecordVersionIds.sort(compareText),
      overlays: overlays,
      inheritances: inheritances
    };
    var proofValue = {
      schemaVersion: truthSchema.VERSION,
      partitionKey: parsed.snapshot.partitionKey,
      familyId: familyId,
      authorizedSetDigest: parsed.snapshot.authorizedSetDigest,
      sourceBindings: parsed.bindings.map(function(binding) {
        return {
          sourceFileId: binding.sourceFileId,
          contentFingerprint: binding.contentFingerprint,
          fragmentGenerationId: binding.fragmentGenerationId,
          sourceState: binding.sourceState,
          certified: binding.certificationStatus === 'certified'
        };
      }),
      documentStableIds: documentStableIds,
      lineageRelationIds: lineageRelationIds,
      recordVersionIds: parsed.records.map(function(record) {
        return record.recordVersionId;
      }).sort(compareText),
      relationVersionIds: parsed.relations.map(function(relation) {
        return relation.relationVersionId;
      }).sort(compareText),
      candidateGenerationIds: candidateGenerationIds,
      candidateSchemaVersion: truthSchema.CANDIDATE_SCHEMA_VERSION,
      promptVersion: truthSchema.PROMPT_VERSION,
      adjudicationVersion: VERSION,
      deadlineRuleVersion: truthSchema.DEADLINE_RULE_VERSION,
      calendarVersion: truthSchema.CALENDAR_VERSION,
      evaluationContext: parsed.evaluationContext,
      lineageProof: lineageProof,
      assertions: assertions,
      conflicts: conflicts,
      citations: citations,
      deadlineRules: deadlineRules,
      deadlineResults: deadlineResults
    };
    var parsedProof = await truthSchema.parseSemanticFamilyProof(proofValue);
    if (!parsedProof) return null;
    var canonical = truthSchema.canonicalize(parsedProof);
    var length;
    try {
      length = canonical === null ? null : byteLength(canonical);
    } catch (_error) {
      length = null;
    }
    if (!Number.isSafeInteger(length) || length < 1 ||
        length > truthSchema.LIMITS.MAX_FAMILY_SNAPSHOT_BYTES) {
      return null;
    }
    return parsedProof;
  }

  var api = Object.freeze({
    VERSION: VERSION,
    LIMITS: LIMITS,
    create: create
  });

  global.FsbSkopeoLineageAdjudicator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
