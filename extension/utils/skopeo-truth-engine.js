(function(global) {
  'use strict';

  var VERSION = 'skopeo-truth-engine/1';
  var GRAPH_SNAPSHOT_VERSION = 'skopeo-graph-exact-set/1';
  var GRAPH_SCHEMA_VERSION = 'skopeo-graph-schema/1';
  var TRUTH_STORE_VERSION = 'skopeo-truth-store/1';
  var MAX_SOURCES = 32;
  var MAX_EXCERPT_CHARACTERS = 24000;
  var EXCERPT_CHARACTERS = 3000;
  var MAX_EXCERPTS_PER_BATCH = 8;
  var CONTEXT_BLOCKERS = Object.freeze({
    'evaluation-context-missing': true,
    'evaluation-context-stale': true,
    'evaluation-context-mismatch': true
  });
  var SOURCE_STATES = Object.freeze({
    ready: true,
    pending: true,
    unreadable: true,
    'download-blocked': true,
    inaccessible: true,
    missing: true
  });

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
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

  function exactFields(value, expectedKeys) {
    if (!isPlainRecord(value)) return null;
    var keys;
    try {
      keys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if (keys.length !== expectedKeys.length || keys.some(function(key) {
      return typeof key !== 'string' || expectedKeys.indexOf(key) < 0;
    })) {
      return null;
    }
    var output = Object.create(null);
    for (var index = 0; index < expectedKeys.length; index += 1) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, expectedKeys[index]);
      } catch (_error) {
        return null;
      }
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) {
        return null;
      }
      output[expectedKeys[index]] = descriptor.value;
    }
    return output;
  }

  function denseArray(value, maximum, minimum) {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
      return null;
    }
    var keys;
    try {
      keys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if (keys.length !== value.length + 1 || keys.some(function(key) {
      return typeof key !== 'string' ||
        (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key));
    })) {
      return null;
    }
    var output = [];
    for (var index = 0; index < value.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) {
        return null;
      }
      output.push(descriptor.value);
    }
    return output;
  }

  function dataValue(value, key) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    try {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && own(descriptor, 'value') ? descriptor.value : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  function frozenRecord(entries) {
    var output = {};
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function frozenArray(values) {
    return Object.freeze(Array.from(values));
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object') return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Reflect.ownKeys(value).forEach(function(key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && own(descriptor, 'value')) deepFreeze(descriptor.value, visited);
    });
    return Object.freeze(value);
  }

  function safeClone(value, state) {
    state = state || { nodes: 0, seen: new Set() };
    state.nodes += 1;
    if (state.nodes > 262144) return undefined;
    if (value === null || typeof value === 'string' ||
        typeof value === 'boolean' || typeof value === 'number') {
      return Number.isFinite(value) || typeof value !== 'number' ? value : undefined;
    }
    if (!value || typeof value !== 'object' || state.seen.has(value)) return undefined;
    state.seen.add(value);
    var output;
    if (Array.isArray(value)) {
      var values = denseArray(value, 16384, 0);
      if (!values) return undefined;
      output = [];
      for (var arrayIndex = 0; arrayIndex < values.length; arrayIndex += 1) {
        var item = safeClone(values[arrayIndex], state);
        if (item === undefined) return undefined;
        output.push(item);
      }
    } else {
      if (!isPlainRecord(value)) return undefined;
      output = {};
      var keys;
      try {
        keys = Reflect.ownKeys(value);
      } catch (_error) {
        return undefined;
      }
      if (keys.length > 64 || keys.some(function(key) {
        return typeof key !== 'string';
      })) {
        return undefined;
      }
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, keys[keyIndex]);
        if (!descriptor || !own(descriptor, 'value') || descriptor.enumerable !== true) {
          return undefined;
        }
        var member = safeClone(descriptor.value, state);
        if (member === undefined) return undefined;
        output[keys[keyIndex]] = member;
      }
    }
    state.seen.delete(value);
    return output;
  }

  function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validOpaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validDigest(value, prefix) {
    return typeof value === 'string' &&
      value.slice(0, prefix.length) === prefix &&
      /^[0-9a-f]{64}$/.test(value.slice(prefix.length));
  }

  function liveSignal(signal) {
    try {
      return !!signal && typeof signal === 'object' &&
        signal.aborted === false &&
        typeof signal.addEventListener === 'function' &&
        typeof signal.removeEventListener === 'function';
    } catch (_error) {
      return false;
    }
  }

  function blocked(blockerCodes) {
    var codes = Array.from(new Set(
      (Array.isArray(blockerCodes) ? blockerCodes : ['input-not-exact'])
        .filter(function(code) {
          return typeof code === 'string' && code.length > 0 && code.length <= 64;
        })
    )).sort(compareText);
    if (codes.length === 0) codes.push('input-not-exact');
    return frozenRecord([
      ['version', VERSION],
      ['status', 'review-required'],
      ['blockerCodes', frozenArray(codes)]
    ]);
  }

  function missingContext() {
    return blocked(['evaluation-context-missing']);
  }

  function contextMismatch() {
    return blocked(['evaluation-context-mismatch']);
  }

  function contextBlocked(value) {
    var fields = exactFields(value, ['ok', 'blockerCodes']);
    var codes = fields && denseArray(fields.blockerCodes, 3, 1);
    if (!fields || fields.ok !== false || !codes ||
        codes.some(function(code) { return !CONTEXT_BLOCKERS[code]; })) {
      return ['evaluation-context-mismatch'];
    }
    return Array.from(new Set(codes)).sort(compareText);
  }

  function parseVisibleSet(value) {
    var denied = exactFields(value, ['status', 'blockerCodes']);
    if (denied && denied.status === 'blocked') {
      var deniedCodes = denseArray(denied.blockerCodes, 8, 1);
      return {
        blockerCodes: deniedCodes || ['input-not-exact']
      };
    }
    var fields = exactFields(value, ['status', 'partitionKey', 'sourceBindings']);
    var sources = fields && denseArray(fields.sourceBindings, MAX_SOURCES, 1);
    if (!fields || fields.status !== 'ready' ||
        !validOpaque(fields.partitionKey, 1024) || !sources) {
      return { blockerCodes: ['exact-set-incomplete'] };
    }
    var output = [];
    for (var index = 0; index < sources.length; index += 1) {
      var source = exactFields(sources[index], [
        'sourceFileId', 'sourceState', 'contentFingerprint'
      ]);
      if (!source || !validId(source.sourceFileId) ||
          !SOURCE_STATES[source.sourceState] ||
          !(source.contentFingerprint === null ||
            validFingerprint(source.contentFingerprint)) ||
          (source.sourceState === 'ready') !==
            (source.contentFingerprint !== null) ||
          (index > 0 &&
            compareText(sources[index - 1].sourceFileId, source.sourceFileId) >= 0)) {
        return { blockerCodes: ['exact-set-incomplete'] };
      }
      output.push(frozenRecord([
        ['sourceFileId', source.sourceFileId],
        ['sourceState', source.sourceState],
        ['contentFingerprint', source.contentFingerprint]
      ]));
    }
    var unavailable = output.some(function(source) {
      return source.sourceState === 'pending' ||
        source.sourceState === 'inaccessible' ||
        source.sourceState === 'missing';
    });
    var unreadable = output.some(function(source) {
      return source.sourceState === 'unreadable' ||
        source.sourceState === 'download-blocked';
    });
    if (unavailable || unreadable) {
      return {
        blockerCodes: [unavailable ? 'source-unavailable' : 'source-unreadable']
      };
    }
    return {
      partitionKey: fields.partitionKey,
      sourceBindings: frozenArray(output),
      sourceFileIds: frozenArray(output.map(function(source) {
        return source.sourceFileId;
      }))
    };
  }

  function sameSourceSet(left, right) {
    if (!left || !right || left.partitionKey !== right.partitionKey ||
        left.sourceBindings.length !== right.sourceBindings.length) return false;
    for (var index = 0; index < left.sourceBindings.length; index += 1) {
      var a = left.sourceBindings[index];
      var b = right.sourceBindings[index];
      if (a.sourceFileId !== b.sourceFileId ||
          a.sourceState !== b.sourceState ||
          a.contentFingerprint !== b.contentFingerprint) return false;
    }
    return true;
  }

  function parseSnapshot(result, visible) {
    var resultFields = exactFields(result, ['decision', 'value']);
    if (!resultFields || resultFields.decision !== 'admitted') {
      return { blockerCodes: ['snapshot-stale'] };
    }
    var blockedValue = exactFields(resultFields.value, [
      'status', 'reason', 'sourceBindings'
    ]);
    if (blockedValue && blockedValue.status === 'blocked') {
      return {
        blockerCodes: [
          blockedValue.reason === 'source-unreadable'
            ? 'source-unreadable'
            : 'source-unavailable'
        ]
      };
    }
    var snapshot = exactFields(resultFields.value, [
      'snapshotVersion',
      'partitionKey',
      'sourceBindings',
      'records',
      'relations',
      'authorizedSetDigest'
    ]);
    var bindings = snapshot && denseArray(snapshot.sourceBindings, MAX_SOURCES, 1);
    if (!snapshot || snapshot.snapshotVersion !== GRAPH_SNAPSHOT_VERSION ||
        snapshot.partitionKey !== visible.partitionKey ||
        !validDigest(snapshot.authorizedSetDigest, 'sgx1:') ||
        !bindings || bindings.length !== visible.sourceBindings.length ||
        !Array.isArray(snapshot.records) || !Array.isArray(snapshot.relations)) {
      return { blockerCodes: ['snapshot-stale'] };
    }
    for (var index = 0; index < bindings.length; index += 1) {
      var binding = exactFields(bindings[index], [
        'sourceFileId',
        'sourceState',
        'certificationStatus',
        'graphCurrent',
        'contentFingerprint',
        'fragmentGenerationId'
      ]);
      var expected = visible.sourceBindings[index];
      if (!binding || binding.sourceFileId !== expected.sourceFileId ||
          binding.sourceState !== expected.sourceState ||
          binding.certificationStatus !== 'certified' ||
          binding.graphCurrent !== true ||
          binding.contentFingerprint !== expected.contentFingerprint ||
          !validDigest(binding.fragmentGenerationId, 'sfg1:')) {
        return { blockerCodes: ['snapshot-stale'] };
      }
    }
    return { snapshot: resultFields.value };
  }

  function sameGraphSnapshot(left, right) {
    return !!left && !!right &&
      left.partitionKey === right.partitionKey &&
      left.authorizedSetDigest === right.authorizedSetDigest;
  }

  function safeBoundary(text, offset) {
    if (offset <= 0 || offset >= text.length) return offset;
    var previous = text.charCodeAt(offset - 1);
    var next = text.charCodeAt(offset);
    return previous >= 0xd800 && previous <= 0xdbff &&
      next >= 0xdc00 && next <= 0xdfff ? offset - 1 : offset;
  }

  function sourceExcerpts(text, Encoder) {
    var exactText = text;
    var batches = [];
    var sourceByteOffset = 0;
    var characterOffset = 0;
    while (characterOffset < exactText.length) {
      var batchEnd = safeBoundary(exactText, Math.min(
        characterOffset + MAX_EXCERPT_CHARACTERS,
        exactText.length
      ));
      if (batchEnd <= characterOffset) return null;
      var batchText = exactText.slice(characterOffset, batchEnd);
      var count = Math.min(
        MAX_EXCERPTS_PER_BATCH,
        Math.max(1, Math.ceil(batchText.length / EXCERPT_CHARACTERS))
      );
      var localOffset = 0;
      for (var index = 0; index < count; index += 1) {
        var localEnd = index === count - 1
          ? batchText.length
          : safeBoundary(batchText, Math.floor(
            batchText.length * (index + 1) / count
          ));
        if (localEnd <= localOffset) return null;
        var excerptText = batchText.slice(localOffset, localEnd);
        var bytes = new Encoder().encode(excerptText).length;
        batches.push({
          excerptId: 'excerpt_' +
            String(Math.floor(batches.length / MAX_EXCERPTS_PER_BATCH) *
              MAX_EXCERPTS_PER_BATCH + index + 1).padStart(6, '0'),
          text: excerptText,
          sourceByteStart: sourceByteOffset,
          sourceByteEnd: sourceByteOffset + bytes
        });
        sourceByteOffset += bytes;
        localOffset = localEnd;
      }
      characterOffset = batchEnd;
    }
    if (exactText.length === 0) {
      batches.push({
        excerptId: 'excerpt_000001',
        text: '',
        sourceByteStart: 0,
        sourceByteEnd: 0
      });
    }
    exactText = null;
    return batches;
  }

  function characterAtByteOffset(text, target, Encoder) {
    if (!Number.isSafeInteger(target) || target < 0) return null;
    var bytes = 0;
    for (var index = 0; index <= text.length; index += 1) {
      if (bytes === target) return index;
      if (index === text.length) break;
      var code = text.charCodeAt(index);
      var width = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
      var next = text.slice(index, index + width);
      bytes += new Encoder().encode(next).length;
      if (width === 2) index += 1;
      if (bytes > target) return null;
    }
    return null;
  }

  function registryBase(snapshot, sourceFileId, evaluationContext) {
    var records = snapshot.records.filter(function(record) {
      return record && record.sourceFileId === sourceFileId;
    });
    var recordByStableId = new Map(records.map(function(record) {
      return [record.stableRecordId, record];
    }));
    var documents = records.filter(function(record) {
      return record.kind !== 'clause';
    }).sort(function(left, right) {
      return compareText(left.recordVersionId, right.recordVersionId);
    });
    var documentHandles = documents.map(function(record, index) {
      return {
        handle: 'document:' + String(index + 1),
        kind: record.kind,
        stableRecordId: record.stableRecordId,
        recordVersionId: record.recordVersionId
      };
    });
    var documentHandleByStableId = new Map(documentHandles.map(function(handle) {
      return [handle.stableRecordId, handle.handle];
    }));
    var containsParent = new Map();
    snapshot.relations.forEach(function(relation) {
      if (relation && relation.predicate === 'contains' &&
          documentHandleByStableId.has(relation.fromStableRecordId) &&
          recordByStableId.has(relation.toStableRecordId)) {
        if (!containsParent.has(relation.toStableRecordId)) {
          containsParent.set(
            relation.toStableRecordId,
            documentHandleByStableId.get(relation.fromStableRecordId)
          );
        } else {
          containsParent.set(relation.toStableRecordId, null);
        }
      }
    });
    var clauses = records.filter(function(record) {
      return record.kind === 'clause' &&
        typeof containsParent.get(record.stableRecordId) === 'string';
    }).sort(function(left, right) {
      return compareText(left.recordVersionId, right.recordVersionId);
    });
    var clauseHandles = clauses.map(function(record, index) {
      return {
        handle: 'clause:' + String(index + 1),
        kind: record.kind,
        stableRecordId: record.stableRecordId,
        recordVersionId: record.recordVersionId,
        documentHandle: containsParent.get(record.stableRecordId)
      };
    });
    var relations = snapshot.relations.filter(function(relation) {
      return relation && relation.sourceFileId === sourceFileId;
    }).sort(function(left, right) {
      return compareText(left.relationVersionId, right.relationVersionId);
    });
    var relationHandles = relations.map(function(relation, index) {
      return {
        handle: 'relation:' + String(index + 1),
        kind: relation.predicate,
        relationVersionId: relation.relationVersionId
      };
    });
    var calendarHandles = evaluationContext.calendars.map(function(calendar, index) {
      return {
        handle: 'calendar:' + String(index + 1),
        calendarId: calendar.calendarId,
        calendarVersionId: calendar.calendarVersionId
      };
    });
    return {
      documentHandles: documentHandles,
      clauseHandles: clauseHandles,
      relationHandles: relationHandles,
      calendarHandles: calendarHandles,
      evidenceHandles: []
    };
  }

  function populateEvidenceRegistry(registry, snapshot, sourceFileId, payload) {
    var content = exactFields(payload, ['byteHash', 'exactByteLength', 'text']);
    var Encoder = global && global.TextEncoder;
    if (!content || typeof content.text !== 'string' ||
        typeof Encoder !== 'function') return false;
    var excerpts = sourceExcerpts(content.text, Encoder);
    if (!excerpts) return false;
    var binding = snapshot.sourceBindings.find(function(item) {
      return item.sourceFileId === sourceFileId;
    });
    if (!binding) return false;
    var locators = [];
    snapshot.records.concat(snapshot.relations).forEach(function(owner) {
      if (!owner || owner.sourceFileId !== sourceFileId ||
          !Array.isArray(owner.evidence)) return;
      owner.evidence.forEach(function(locator) {
        if (locator && !locators.some(function(existing) {
          return existing.locatorId === locator.locatorId;
        })) {
          locators.push(locator);
        }
      });
    });
    locators.sort(function(left, right) {
      return compareText(left.locatorId, right.locatorId);
    });
    var handles = [];
    for (var index = 0; index < locators.length; index += 1) {
      var locator = locators[index];
      var excerpt = excerpts.find(function(candidate) {
        return candidate.sourceByteStart <= locator.sourceByteStart &&
          candidate.sourceByteEnd >= locator.sourceByteEnd;
      });
      if (!excerpt) continue;
      var start = characterAtByteOffset(
        excerpt.text,
        locator.sourceByteStart - excerpt.sourceByteStart,
        Encoder
      );
      var end = characterAtByteOffset(
        excerpt.text,
        locator.sourceByteEnd - excerpt.sourceByteStart,
        Encoder
      );
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          end <= start) continue;
      handles.push({
        handle: 'evidence:' + String(handles.length + 1),
        locator: {
          schemaVersion: GRAPH_SCHEMA_VERSION,
          partitionKey: snapshot.partitionKey,
          sourceFileId: sourceFileId,
          contentFingerprint: binding.contentFingerprint,
          fragmentGenerationId: binding.fragmentGenerationId,
          excerptId: excerpt.excerptId,
          start: start,
          end: end,
          sourceByteStart: locator.sourceByteStart,
          sourceByteEnd: locator.sourceByteEnd,
          locatorId: locator.locatorId
        }
      });
    }
    registry.evidenceHandles = handles;
    content = null;
    excerpts = null;
    return documentHandlesAvailable(registry) && handles.length > 0;
  }

  function documentHandlesAvailable(registry) {
    return Array.isArray(registry.documentHandles) &&
      registry.documentHandles.length > 0;
  }

  function certificateMimeType(certificate) {
    var metadata = dataValue(certificate, 'metadataFingerprint');
    var mimeType = dataValue(metadata, 'mimeType');
    return typeof mimeType === 'string' ? mimeType : null;
  }

  function providerAcknowledgement(step) {
    return frozenRecord([
      ['status', 'provider-no-storage'],
      ['durableEffect', false],
      ['prepared', step]
    ]);
  }

  function publishPrepared(prepared, publisher, operationSignal) {
    if (!publisher || publisher.signal !== operationSignal ||
        typeof publisher.publish !== 'function' || !liveSignal(operationSignal)) {
      return null;
    }
    return publisher.publish(async function truthPreparedEffect(effectGuard) {
      if (!effectGuard || effectGuard.signal !== operationSignal ||
          typeof effectGuard.validate !== 'function' ||
          !await effectGuard.validate()) return null;
      return prepared;
    });
  }

  function publishProviderOutcome(prepared, publisher, operationSignal) {
    if (!publisher || publisher.signal !== operationSignal ||
        typeof publisher.publish !== 'function' || !liveSignal(operationSignal)) {
      return null;
    }
    return publisher.publish(async function truthProviderNoStorageEffect(effectGuard) {
      if (!effectGuard || effectGuard.signal !== operationSignal ||
          typeof effectGuard.validate !== 'function' ||
          !await effectGuard.validate()) return null;
      var fields = exactFields(prepared, ['status', 'rawResponse', 'outcome']);
      if (!fields || fields.status !== 'provider-step') return prepared;
      return frozenRecord([
        ['status', 'provider-no-storage'],
        ['durableEffect', false],
        ['prepared', fields.outcome]
      ]);
    });
  }

  function admittedValue(result) {
    var fields = exactFields(result, ['decision', 'value']);
    return fields && fields.decision === 'admitted' ? fields.value : null;
  }

  function replacementInput(proof) {
    return frozenRecord([
      ['schemaVersion', proof.schemaVersion],
      ['partitionKey', proof.partitionKey],
      ['familyId', proof.familyId],
      ['authorizedSetDigest', proof.authorizedSetDigest],
      ['sourceBindings', proof.sourceBindings],
      ['recordVersionIds', proof.recordVersionIds],
      ['relationVersionIds', proof.relationVersionIds],
      ['candidateGenerationIds', proof.candidateGenerationIds],
      ['candidateSchemaVersion', proof.candidateSchemaVersion],
      ['promptVersion', proof.promptVersion],
      ['adjudicationVersion', proof.adjudicationVersion],
      ['deadlineRuleVersion', proof.deadlineRuleVersion],
      ['calendarVersion', proof.calendarVersion],
      ['evaluationContext', proof.evaluationContext]
    ]);
  }

  function create(options) {
    var fields = exactFields(options, [
      'truthSchema',
      'truthStore',
      'truthExtractor',
      'lineageAdjudicator',
      'deadlineEngine',
      'graphFacade',
      'corpusTransport',
      'runCorpusOperation',
      'readVisibleSourceSet',
      'validateEvaluationContext',
      'readSettings',
      'providerFactory',
      'byteLength'
    ]);
    if (!fields || !fields.truthSchema || !fields.truthStore ||
        !fields.truthExtractor || !fields.lineageAdjudicator ||
        !fields.deadlineEngine || !fields.graphFacade ||
        !fields.corpusTransport ||
        fields.truthSchema.VERSION !== 'skopeo-truth-schema/1' ||
        fields.truthStore.VERSION === VERSION ||
        fields.deadlineEngine.VERSION !== 'skopeo-deadline-engine/1' ||
        typeof fields.truthSchema.parseEvaluationContext !== 'function' ||
        typeof fields.truthSchema.parseSemanticFamilyProof !== 'function' ||
        typeof fields.truthSchema.canonicalize !== 'function' ||
        typeof fields.truthSchema.sha256Hex !== 'function' ||
        typeof fields.truthStore.issueMutation !== 'function' ||
        typeof fields.truthStore.finishMutation !== 'function' ||
        typeof fields.truthStore.beginFamilyReplacement !== 'function' ||
        typeof fields.truthStore.stageFamilySnapshot !== 'function' ||
        typeof fields.truthStore.publishFamilySnapshot !== 'function' ||
        typeof fields.truthStore.publishPartitionGeneration !== 'function' ||
        typeof fields.truthStore.withdrawFamiliesForSources !== 'function' ||
        typeof fields.truthStore.readActiveFamily !== 'function' ||
        typeof fields.truthStore.inspectMetadata !== 'function' ||
        typeof fields.truthExtractor.prepareSource !== 'function' ||
        typeof fields.truthExtractor.verifyProviderBinding !== 'function' ||
        typeof fields.truthExtractor.nextBatch !== 'function' ||
        typeof fields.truthExtractor.repairBatch !== 'function' ||
        typeof fields.truthExtractor.finalize !== 'function' ||
        typeof fields.truthExtractor.discard !== 'function' ||
        typeof fields.lineageAdjudicator.adjudicateExactSet !== 'function' ||
        typeof fields.graphFacade.snapshotExactSet !== 'function' ||
        typeof fields.corpusTransport.readContent !== 'function' ||
        typeof fields.runCorpusOperation !== 'function' ||
        typeof fields.readVisibleSourceSet !== 'function' ||
        typeof fields.validateEvaluationContext !== 'function' ||
        typeof fields.readSettings !== 'function' ||
        typeof fields.providerFactory !== 'function' ||
        typeof fields.byteLength !== 'function') {
      return null;
    }

    var truthSchema = fields.truthSchema;
    var truthStore = fields.truthStore;
    var truthExtractor = fields.truthExtractor;
    var lineageAdjudicator = fields.lineageAdjudicator;
    var graphFacade = fields.graphFacade;
    var corpusTransport = fields.corpusTransport;
    var runCorpusOperation = fields.runCorpusOperation;
    var readVisibleSourceSet = fields.readVisibleSourceSet;
    var validateEvaluationContext = fields.validateEvaluationContext;
    var readSettings = fields.readSettings;
    var byteLength = fields.byteLength;

    async function requestContext(request, familyRequired) {
      var expected = familyRequired
        ? ['familyId', 'evaluationContext']
        : ['evaluationContext'];
      var requestFields = exactFields(request, expected);
      if (!requestFields) {
        var hasContext = isPlainRecord(request) && own(request, 'evaluationContext');
        return {
          blockerCodes: [hasContext
            ? 'evaluation-context-mismatch'
            : 'evaluation-context-missing']
        };
      }
      if (familyRequired && !validDigest(requestFields.familyId, 'stf1:')) {
        return { blockerCodes: ['input-not-exact'] };
      }
      var context;
      try {
        context = truthSchema.parseEvaluationContext(requestFields.evaluationContext);
      } catch (_error) {
        context = null;
      }
      if (!context) {
        return {
          blockerCodes: [requestFields.evaluationContext === undefined
            ? 'evaluation-context-missing'
            : 'evaluation-context-mismatch']
        };
      }
      var digest;
      try {
        digest = await truthSchema.sha256Hex(context);
      } catch (_error) {
        digest = null;
      }
      if (!validDigest(digest, 'sha256:')) {
        return { blockerCodes: ['evaluation-context-mismatch'] };
      }
      return {
        familyId: requestFields.familyId,
        evaluationContext: context,
        contextDigest: digest.slice('sha256:'.length)
      };
    }

    async function currentVisible(exactTuple) {
      var value;
      try {
        value = await readVisibleSourceSet(exactTuple);
      } catch (_error) {
        value = null;
      }
      return parseVisibleSet(value);
    }

    async function currentSnapshot(exactTuple, visible) {
      var result;
      try {
        result = await graphFacade.snapshotExactSet(
          exactTuple,
          frozenRecord([['sourceFileIds', visible.sourceFileIds]])
        );
      } catch (_error) {
        result = null;
      }
      return parseSnapshot(result, visible);
    }

    async function validateContextNow(exactTuple, context, snapshot, digest, signal) {
      var result;
      try {
        result = await validateEvaluationContext({
          exactTuple: exactTuple,
          evaluationContext: context,
          graphSnapshot: snapshot,
          signal: signal
        });
      } catch (_error) {
        result = null;
      }
      var admitted = exactFields(result, ['ok', 'contextDigest']);
      if (admitted && Object.isFrozen(result) && admitted.ok === true &&
          admitted.contextDigest === digest &&
          /^[0-9a-f]{64}$/.test(admitted.contextDigest)) {
        return null;
      }
      return contextBlocked(result);
    }

    async function freshAuthority(exactTuple) {
      var visible = await currentVisible(exactTuple);
      if (visible.blockerCodes) return visible;
      var snapshot = await currentSnapshot(exactTuple, visible);
      if (snapshot.blockerCodes) return snapshot;
      return {
        visible: visible,
        snapshot: snapshot.snapshot
      };
    }

    async function sourceStep(exactTuple, sourceFileId, callback, commit) {
      var result;
      try {
        result = await runCorpusOperation(
          'ingestion',
          exactTuple,
          frozenRecord([['sourceFileId', sourceFileId]]),
          callback,
          commit || publishPrepared
        );
      } catch (_error) {
        result = null;
      }
      return admittedValue(result);
    }

    async function prepareSource(
      exactTuple,
      snapshot,
      sourceFileId,
      evaluationContext
    ) {
      var registry = registryBase(snapshot, sourceFileId, evaluationContext);
      var value = await sourceStep(
        exactTuple,
        sourceFileId,
        function(certificate, operationSignal) {
          return truthExtractor.prepareSource(
            certificate,
            operationSignal,
            function(operationSink, sinkSignal) {
              var input = frozenRecord([
                ['fileId', sourceFileId],
                ['mimeType', certificateMimeType(certificate)]
              ]);
              var capture = async function(payload, payloadSignal) {
                if (payloadSignal !== sinkSignal ||
                    !populateEvidenceRegistry(
                      registry, snapshot, sourceFileId, payload)) {
                  throw new Error('truth-issued-registry-unavailable');
                }
                try {
                  return await operationSink(payload, payloadSignal);
                } finally {
                  payload = null;
                }
              };
              return corpusTransport.readContent.length >= 4
                ? corpusTransport.readContent(
                  exactTuple, input, capture, sinkSignal)
                : corpusTransport.readContent(input, capture, sinkSignal);
            },
            snapshot.authorizedSetDigest,
            registry
          );
        }
      );
      registry = null;
      return value;
    }

    async function verifySourceSession(exactTuple, sourceFileId, session) {
      return sourceStep(
        exactTuple,
        sourceFileId,
        function(certificate, operationSignal) {
          return truthExtractor.verifyProviderBinding(
            session, certificate, operationSignal);
        }
      );
    }

    async function providerStep(
      exactTuple,
      sourceFileId,
      session,
      repairFailure
    ) {
      return sourceStep(
        exactTuple,
        sourceFileId,
        function(certificate, operationSignal) {
          var acknowledgeNoStorage = function(step, signal) {
            return signal === operationSignal && liveSignal(signal)
              ? providerAcknowledgement(step)
              : null;
          };
          return repairFailure
            ? truthExtractor.repairBatch(
              session,
              certificate,
              repairFailure,
              operationSignal,
              acknowledgeNoStorage
            )
            : truthExtractor.nextBatch(
              session,
              certificate,
              operationSignal,
              acknowledgeNoStorage
            );
        },
        publishProviderOutcome
      );
    }

    async function finalizeSource(exactTuple, sourceFileId, session) {
      return sourceStep(
        exactTuple,
        sourceFileId,
        function(certificate, operationSignal) {
          return truthExtractor.finalize(session, certificate, operationSignal);
        }
      );
    }

    async function extractSource(
      exactTuple,
      snapshot,
      sourceFileId,
      evaluationContext
    ) {
      var prepared = await prepareSource(
        exactTuple,
        snapshot,
        sourceFileId,
        evaluationContext
      );
      if (!prepared || !prepared.session || !prepared.providerBinding) {
        return { blockerCodes: ['exact-set-incomplete'] };
      }
      var session = prepared.session;
      try {
        var verified = await verifySourceSession(exactTuple, sourceFileId, session);
        if (!verified || verified.status !== 'provider-binding-current') {
          return { blockerCodes: ['snapshot-stale'] };
        }
        var repairFailure = null;
        for (var stepIndex = 0; stepIndex < 10; stepIndex += 1) {
          var step = await providerStep(
            exactTuple,
            sourceFileId,
            session,
            repairFailure
          );
          repairFailure = null;
          if (!step) return { blockerCodes: ['exact-set-incomplete'] };
          if (step.status === 'complete') break;
          var envelope = exactFields(step, [
            'status', 'durableEffect', 'prepared'
          ]);
          var outcome = envelope && envelope.status === 'provider-no-storage' &&
            envelope.durableEffect === false ? envelope.prepared : null;
          if (!outcome) return { blockerCodes: ['exact-set-incomplete'] };
          if (outcome.status === 'validated-batch') continue;
          if (outcome.repairable === true) {
            repairFailure = outcome;
            continue;
          }
          return { blockerCodes: ['exact-set-incomplete'] };
        }
        if (repairFailure) return { blockerCodes: ['exact-set-incomplete'] };
        var generation = await finalizeSource(exactTuple, sourceFileId, session);
        return generation &&
          generation.authorizedSetDigest === snapshot.authorizedSetDigest &&
          generation.sourceFileId === sourceFileId
          ? { generation: generation }
          : { blockerCodes: ['snapshot-stale'] };
      } finally {
        truthExtractor.discard(session);
        session = null;
      }
    }

    async function providerBindingCurrent(generations) {
      var settings;
      try {
        settings = await readSettings();
      } catch (_error) {
        return false;
      }
      var providerId = dataValue(settings, 'modelProvider');
      var modelId = dataValue(settings, 'modelName');
      return validOpaque(providerId, 128) && validOpaque(modelId, 128) &&
        generations.every(function(generation) {
          return generation.providerId === providerId &&
            generation.modelId === modelId;
        });
    }

    async function publishFamily(
      exactTuple,
      authority,
      contextState,
      proof
    ) {
      var result;
      try {
        result = await runCorpusOperation(
          'ingestion',
          exactTuple,
          frozenRecord([
            ['sourceFileIds', authority.visible.sourceFileIds]
          ]),
          async function(certificates, completeness, operationSignal) {
            if (!Array.isArray(certificates) ||
                certificates.length !== authority.visible.sourceFileIds.length ||
                !completeness || completeness.complete !== true ||
                !liveSignal(operationSignal)) return null;
            var parsed = await truthSchema.parseSemanticFamilyProof(proof);
            return parsed && parsed.authorizedSetDigest ===
              authority.snapshot.authorizedSetDigest ? parsed : null;
          },
          async function(prepared, publisher, operationSignal) {
            if (!prepared || !publisher || publisher.signal !== operationSignal ||
                typeof publisher.publish !== 'function' ||
                !liveSignal(operationSignal)) return null;
            return publisher.publish(async function truthPublicationEffect(effectGuard) {
              if (!effectGuard || effectGuard.signal !== operationSignal ||
                  typeof effectGuard.validate !== 'function' ||
                  !await effectGuard.validate()) return null;
              var contextFailure = await validateContextNow(
                exactTuple,
                contextState.evaluationContext,
                authority.snapshot,
                contextState.contextDigest,
                operationSignal
              );
              if (contextFailure) {
                return frozenRecord([
                  ['status', 'context-blocked'],
                  ['blockerCodes', frozenArray(contextFailure)]
                ]);
              }
              var mutationGuard = truthStore.issueMutation(operationSignal);
              if (!mutationGuard) return null;
              var output = null;
              try {
                var handle = await truthStore.beginFamilyReplacement(
                  replacementInput(prepared), mutationGuard);
                if (!handle || handle.ok === false) {
                  output = handle;
                } else {
                  var staged = await truthStore.stageFamilySnapshot(
                    handle, prepared, mutationGuard);
                  if (!staged || staged.ok !== true || !staged.manifest) {
                    output = staged;
                  } else {
                    contextFailure = await validateContextNow(
                      exactTuple,
                      contextState.evaluationContext,
                      authority.snapshot,
                      contextState.contextDigest,
                      operationSignal
                    );
                    if (contextFailure) {
                      output = frozenRecord([
                        ['status', 'context-blocked'],
                        ['blockerCodes', frozenArray(contextFailure)]
                      ]);
                    } else {
                      output = await truthStore.publishFamilySnapshot(
                        handle, staged.manifest, mutationGuard);
                    }
                  }
                }
              } finally {
                var terminal = truthStore.finishMutation(mutationGuard);
                if (!terminal || terminal.ok !== true) output = null;
              }
              return output;
            });
          }
        );
      } catch (_error) {
        result = null;
      }
      return admittedValue(result);
    }

    async function publishPartitionGeneration(
      exactTuple,
      authority,
      contextState,
      familyIds
    ) {
      var result;
      try {
        result = await runCorpusOperation(
          'ingestion',
          exactTuple,
          frozenRecord([
            ['sourceFileIds', authority.visible.sourceFileIds]
          ]),
          async function(certificates, completeness, operationSignal) {
            if (!Array.isArray(certificates) ||
                certificates.length !== authority.visible.sourceFileIds.length ||
                !completeness || completeness.complete !== true ||
                !liveSignal(operationSignal)) return null;
            var contextFailure = await validateContextNow(
              exactTuple,
              contextState.evaluationContext,
              authority.snapshot,
              contextState.contextDigest,
              operationSignal
            );
            return contextFailure
              ? null
              : frozenRecord([
                ['partitionKey', authority.snapshot.partitionKey],
                ['authorizedSetDigest', authority.snapshot.authorizedSetDigest],
                ['familyIds', frozenArray(familyIds)]
              ]);
          },
          function(prepared, publisher, operationSignal) {
            if (!prepared || !publisher ||
                publisher.signal !== operationSignal ||
                typeof publisher.publish !== 'function' ||
                !liveSignal(operationSignal)) return null;
            return publisher.publish(async function truthGenerationEffect(effectGuard) {
              if (!effectGuard || effectGuard.signal !== operationSignal ||
                  typeof effectGuard.validate !== 'function' ||
                  !await effectGuard.validate()) return null;
              var contextFailure = await validateContextNow(
                exactTuple,
                contextState.evaluationContext,
                authority.snapshot,
                contextState.contextDigest,
                operationSignal
              );
              if (contextFailure) {
                return frozenRecord([
                  ['status', 'context-blocked'],
                  ['blockerCodes', frozenArray(contextFailure)]
                ]);
              }
              var mutationGuard = truthStore.issueMutation(operationSignal);
              if (!mutationGuard) return null;
              var output = null;
              try {
                output = await truthStore.publishPartitionGeneration(
                  prepared, mutationGuard);
              } finally {
                var terminal = truthStore.finishMutation(mutationGuard);
                if (!terminal || terminal.ok !== true) output = null;
              }
              return output;
            });
          }
        );
      } catch (_error) {
        result = null;
      }
      return admittedValue(result);
    }

    async function recompute(exactTuple, request) {
      var contextState = await requestContext(request, false);
      if (contextState.blockerCodes) return blocked(contextState.blockerCodes);
      var controller = new AbortController();
      var authority = await freshAuthority(exactTuple);
      if (authority.blockerCodes) return blocked(authority.blockerCodes);
      var contextFailure = await validateContextNow(
        exactTuple,
        contextState.evaluationContext,
        authority.snapshot,
        contextState.contextDigest,
        controller.signal
      );
      if (contextFailure) return blocked(contextFailure);
      var generations = [];
      for (var sourceIndex = 0;
        sourceIndex < authority.visible.sourceFileIds.length;
        sourceIndex += 1) {
        var extracted = await extractSource(
          exactTuple,
          authority.snapshot,
          authority.visible.sourceFileIds[sourceIndex],
          contextState.evaluationContext
        );
        if (extracted.blockerCodes) return blocked(extracted.blockerCodes);
        generations.push(extracted.generation);
      }
      var adjudicated;
      try {
        adjudicated = await lineageAdjudicator.adjudicateExactSet({
          graphSnapshot: authority.snapshot,
          candidateGenerations: frozenArray(generations),
          evaluationContext: contextState.evaluationContext
        });
      } catch (_error) {
        adjudicated = null;
      }
      if (!adjudicated || adjudicated.status !== 'adjudicated' ||
          adjudicated.authorizedSetDigest !== authority.snapshot.authorizedSetDigest ||
          !Array.isArray(adjudicated.families)) {
        return blocked(
          adjudicated && Array.isArray(adjudicated.blockerCodes)
            ? adjudicated.blockerCodes
            : ['input-not-exact']
        );
      }
      var semanticFamilies = [];
      for (var familyIndex = 0;
        familyIndex < adjudicated.families.length;
        familyIndex += 1) {
        var parsed = await truthSchema.parseSemanticFamilyProof(
          adjudicated.families[familyIndex]);
        if (!parsed || JSON.stringify(parsed).indexOf('sts1:') >= 0) {
          return blocked(['input-not-exact']);
        }
        semanticFamilies.push(parsed);
      }
      var finalAuthority = await freshAuthority(exactTuple);
      if (finalAuthority.blockerCodes ||
          !sameSourceSet(authority.visible, finalAuthority.visible) ||
          !sameGraphSnapshot(authority.snapshot, finalAuthority.snapshot) ||
          !await providerBindingCurrent(generations)) {
        return blocked(['snapshot-stale']);
      }
      contextFailure = await validateContextNow(
        exactTuple,
        contextState.evaluationContext,
        finalAuthority.snapshot,
        contextState.contextDigest,
        controller.signal
      );
      if (contextFailure) return blocked(contextFailure);
      var familyIds = [];
      for (var publishIndex = 0;
        publishIndex < semanticFamilies.length;
        publishIndex += 1) {
        var published = await publishFamily(
          exactTuple,
          finalAuthority,
          contextState,
          semanticFamilies[publishIndex]
        );
        if (published && published.status === 'context-blocked') {
          return blocked(published.blockerCodes);
        }
        if (!published || published.ok !== true ||
            published.status !== 'published') {
          return blocked(['snapshot-stale']);
        }
        familyIds.push(semanticFamilies[publishIndex].familyId);
      }
      familyIds.sort(compareText);
      var generationAuthority = await freshAuthority(exactTuple);
      if (generationAuthority.blockerCodes ||
          !sameSourceSet(finalAuthority.visible, generationAuthority.visible) ||
          !sameGraphSnapshot(finalAuthority.snapshot, generationAuthority.snapshot) ||
          !await providerBindingCurrent(generations)) {
        return blocked(['snapshot-stale']);
      }
      var generationPublished = await publishPartitionGeneration(
        exactTuple,
        generationAuthority,
        contextState,
        familyIds
      );
      if (generationPublished &&
          generationPublished.status === 'context-blocked') {
        return blocked(generationPublished.blockerCodes);
      }
      if (!generationPublished || generationPublished.ok !== true ||
          generationPublished.status !== 'published') {
        return blocked(['snapshot-stale']);
      }
      return frozenRecord([
        ['version', VERSION],
        ['status', 'published'],
        ['familyIds', frozenArray(familyIds)],
        ['blockerCodes', frozenArray([])]
      ]);
    }

    function proofCurrent(proof, contextState, authority) {
      if (!proof || proof.schemaVersion !== truthSchema.VERSION ||
          !validDigest(proof.familyId, 'stf1:') ||
          proof.partitionKey !== authority.snapshot.partitionKey ||
          proof.authorizedSetDigest !== authority.snapshot.authorizedSetDigest ||
          proof.candidateSchemaVersion !== truthSchema.CANDIDATE_SCHEMA_VERSION ||
          proof.promptVersion !== truthSchema.PROMPT_VERSION ||
          proof.adjudicationVersion !== truthSchema.ADJUDICATION_VERSION ||
          proof.deadlineRuleVersion !== truthSchema.DEADLINE_RULE_VERSION ||
          proof.calendarVersion !== truthSchema.CALENDAR_VERSION ||
          truthSchema.canonicalize(proof.evaluationContext) !==
            truthSchema.canonicalize(contextState.evaluationContext)) {
        return false;
      }
      var graphRecords = authority.snapshot.records.map(function(record) {
        return record.recordVersionId;
      }).sort(compareText);
      var graphRelations = authority.snapshot.relations.map(function(relation) {
        return relation.relationVersionId;
      }).sort(compareText);
      if (JSON.stringify(graphRecords) !== JSON.stringify(proof.recordVersionIds) ||
          JSON.stringify(graphRelations) !== JSON.stringify(proof.relationVersionIds) ||
          proof.sourceBindings.length !== authority.snapshot.sourceBindings.length) {
        return false;
      }
      for (var index = 0; index < proof.sourceBindings.length; index += 1) {
        var persisted = proof.sourceBindings[index];
        var current = authority.snapshot.sourceBindings[index];
        if (persisted.sourceFileId !== current.sourceFileId ||
            persisted.contentFingerprint !== current.contentFingerprint ||
            persisted.fragmentGenerationId !== current.fragmentGenerationId ||
            persisted.sourceState !== current.sourceState ||
            persisted.certified !== true) return false;
      }
      return true;
    }

    function displayMetadata(value, partitionKey) {
      var fields = exactFields(value, [
        'version', 'partitionKey', 'outputGenerationId',
        'authorizedSetDigest', 'families'
      ]);
      if (!fields || fields.version !== TRUTH_STORE_VERSION ||
          fields.partitionKey !== partitionKey || !Array.isArray(fields.families)) {
        return null;
      }
      if (fields.outputGenerationId === null) {
        return fields.authorizedSetDigest === null && fields.families.length === 0
          ? frozenRecord([
            ['version', fields.version],
            ['partitionKey', fields.partitionKey],
            ['outputGenerationId', null],
            ['authorizedSetDigest', null],
            ['families', frozenArray([])]
          ])
          : null;
      }
      if (!validDigest(fields.outputGenerationId, 'stp1:') ||
          !validDigest(fields.authorizedSetDigest, 'sgx1:')) return null;
      var members = denseArray(fields.families, MAX_SOURCES, 0);
      if (!members) return null;
      var parsed = [];
      for (var index = 0; index < members.length; index += 1) {
        var member = exactFields(members[index], ['familyId', 'state', 'snapshotId']);
        if (!member || !validDigest(member.familyId, 'stf1:') ||
            member.state !== 'published' || !validDigest(member.snapshotId, 'sts1:') ||
            (index > 0 && compareText(parsed[index - 1].familyId, member.familyId) >= 0)) {
          return null;
        }
        parsed.push(frozenRecord([
          ['familyId', member.familyId],
          ['state', member.state],
          ['snapshotId', member.snapshotId]
        ]));
      }
      return frozenRecord([
        ['version', fields.version],
        ['partitionKey', fields.partitionKey],
        ['outputGenerationId', fields.outputGenerationId],
        ['authorizedSetDigest', fields.authorizedSetDigest],
        ['families', frozenArray(parsed)]
      ]);
    }

    function displayMetadataOverCap(value, partitionKey) {
      var fields = exactFields(value, [
        'version', 'partitionKey', 'outputGenerationId',
        'authorizedSetDigest', 'families'
      ]);
      return !!fields && fields.version === TRUTH_STORE_VERSION &&
        fields.partitionKey === partitionKey &&
        validDigest(fields.outputGenerationId, 'stp1:') &&
        validDigest(fields.authorizedSetDigest, 'sgx1:') &&
        Array.isArray(fields.families) && fields.families.length > MAX_SOURCES;
    }

    function sameDisplayMetadata(left, right) {
      if (!left || !right || left.version !== right.version ||
          left.partitionKey !== right.partitionKey ||
          left.outputGenerationId !== right.outputGenerationId ||
          left.authorizedSetDigest !== right.authorizedSetDigest ||
          left.families.length !== right.families.length) return false;
      for (var index = 0; index < left.families.length; index += 1) {
        var a = left.families[index];
        var b = right.families[index];
        if (a.familyId !== b.familyId || a.state !== b.state ||
            a.snapshotId !== b.snapshotId) return false;
      }
      return true;
    }

    function displayFamily(proof) {
      return {
        familyId: proof.familyId,
        sourceBindings: proof.sourceBindings,
        documentStableIds: proof.documentStableIds,
        lineageRelationIds: proof.lineageRelationIds,
        recordVersionIds: proof.recordVersionIds,
        relationVersionIds: proof.relationVersionIds,
        candidateGenerationIds: proof.candidateGenerationIds,
        candidateSchemaVersion: proof.candidateSchemaVersion,
        promptVersion: proof.promptVersion,
        adjudicationVersion: proof.adjudicationVersion,
        deadlineRuleVersion: proof.deadlineRuleVersion,
        calendarVersion: proof.calendarVersion,
        lineageProof: proof.lineageProof,
        assertions: proof.assertions,
        conflicts: proof.conflicts,
        citations: proof.citations,
        deadlineRules: proof.deadlineRules,
        deadlineResults: proof.deadlineResults
      };
    }

    function staleDisplayProof(authority, proofs) {
      if (proofs.length > 0) return proofs[0];
      return {
        partitionKey: authority.snapshot.partitionKey,
        sourceBindings: authority.snapshot.sourceBindings
      };
    }

    async function inspectDisplaySnapshot(exactTuple, request) {
      var contextState = await requestContext(request, false);
      if (contextState.blockerCodes) return blocked(contextState.blockerCodes);
      var controller = new AbortController();
      var authority = await freshAuthority(exactTuple);
      if (authority.blockerCodes) return blocked(authority.blockerCodes);
      var contextFailure = await validateContextNow(
        exactTuple,
        contextState.evaluationContext,
        authority.snapshot,
        contextState.contextDigest,
        controller.signal
      );
      if (contextFailure) return blocked(contextFailure);

      var rawMetadata;
      try {
        rawMetadata = await truthStore.inspectMetadata({
          partitionKey: authority.snapshot.partitionKey
        });
      } catch (_error) {
        return blocked(['snapshot-stale']);
      }
      if (displayMetadataOverCap(rawMetadata, authority.snapshot.partitionKey)) {
        return blocked(['exact-set-over-cap']);
      }
      var metadata = displayMetadata(rawMetadata, authority.snapshot.partitionKey);
      if (!metadata) {
        return blocked(['snapshot-stale']);
      }
      if (metadata.outputGenerationId === null) return blocked(['fact-missing']);
      if (metadata.authorizedSetDigest !== authority.snapshot.authorizedSetDigest) {
        await withdrawStale(exactTuple, authority, staleDisplayProof(authority, []));
        return blocked(['snapshot-stale']);
      }

      var proofs = [];
      for (var index = 0; index < metadata.families.length; index += 1) {
        var member = metadata.families[index];
        var proof;
        var familyReadFailed = false;
        try {
          proof = await truthStore.readActiveFamily({
            partitionKey: metadata.partitionKey,
            familyId: member.familyId
          });
        } catch (_error) {
          familyReadFailed = true;
          proof = null;
        }
        if (familyReadFailed || !proof) {
          return blocked(['snapshot-stale']);
        }
        if (proof.familyId !== member.familyId) {
          await withdrawStale(exactTuple, authority, staleDisplayProof(authority, proofs));
          return blocked(['snapshot-stale']);
        }
        if (!proofCurrent(proof, contextState, authority)) {
          await withdrawStale(exactTuple, authority, proof);
          return blocked(
            truthSchema.canonicalize(proof.evaluationContext) !==
              truthSchema.canonicalize(contextState.evaluationContext)
              ? ['evaluation-context-mismatch']
              : ['snapshot-stale']
          );
        }
        proofs.push(proof);
      }

      var finalRawMetadata;
      try {
        finalRawMetadata = await truthStore.inspectMetadata({
          partitionKey: authority.snapshot.partitionKey
        });
      } catch (_error) {
        return blocked(['snapshot-stale']);
      }
      var finalMetadata = displayMetadata(
        finalRawMetadata, authority.snapshot.partitionKey);
      if (!finalMetadata) {
        return blocked(['snapshot-stale']);
      }
      if (!sameDisplayMetadata(metadata, finalMetadata)) {
        await withdrawStale(exactTuple, authority, staleDisplayProof(authority, proofs));
        return blocked(['snapshot-stale']);
      }

      var finalAuthority;
      try {
        finalAuthority = await freshAuthority(exactTuple);
      } catch (_error) {
        return blocked(['snapshot-stale']);
      }
      if (finalAuthority.blockerCodes) {
        return blocked(['snapshot-stale']);
      }
      if (!sameSourceSet(authority.visible, finalAuthority.visible) ||
          !sameGraphSnapshot(authority.snapshot, finalAuthority.snapshot) ||
          proofs.some(function(proof) {
            return !proofCurrent(proof, contextState, finalAuthority);
          })) {
        await withdrawStale(exactTuple, authority, staleDisplayProof(authority, proofs));
        return blocked(['snapshot-stale']);
      }
      try {
        contextFailure = await validateContextNow(
          exactTuple,
          contextState.evaluationContext,
          finalAuthority.snapshot,
          contextState.contextDigest,
          controller.signal
        );
      } catch (_error) {
        return blocked(['snapshot-stale']);
      }
      if (contextFailure) {
        return blocked(contextFailure);
      }
      return boundedProjection({
        version: VERSION,
        status: 'current',
        outputGenerationId: metadata.outputGenerationId,
        authorizedSetDigest: metadata.authorizedSetDigest,
        evaluationContext: contextState.evaluationContext,
        evaluationContextDigest: contextState.contextDigest,
        families: proofs.map(displayFamily),
        blockerCodes: []
      });
    }

    async function withdrawStale(exactTuple, authority, proof) {
      if (!proof || !Array.isArray(proof.sourceBindings)) return false;
      var result;
      try {
        result = await runCorpusOperation(
          'ingestion',
          exactTuple,
          frozenRecord([
            ['sourceFileIds', authority.visible.sourceFileIds]
          ]),
          function(certificates, completeness) {
            return Array.isArray(certificates) &&
              certificates.length === authority.visible.sourceFileIds.length &&
              completeness && completeness.complete === true
              ? frozenRecord([['status', 'withdraw-ready']])
              : null;
          },
          function(prepared, publisher, operationSignal) {
            if (!prepared || prepared.status !== 'withdraw-ready' ||
                !publisher || publisher.signal !== operationSignal ||
                typeof publisher.publish !== 'function') return null;
            return publisher.publish(async function truthWithdrawalEffect(effectGuard) {
              if (!effectGuard || typeof effectGuard.validate !== 'function' ||
                  !await effectGuard.validate()) return null;
              var guard = truthStore.issueMutation(operationSignal);
              if (!guard) return null;
              try {
                return await truthStore.withdrawFamiliesForSources({
                  partitionKey: proof.partitionKey,
                  sourceFileIds: proof.sourceBindings.map(function(source) {
                    return source.sourceFileId;
                  }).sort(compareText),
                  reason: 'dependency-mismatch'
                }, guard);
              } finally {
                truthStore.finishMutation(guard);
              }
            });
          }
        );
      } catch (_error) {
        result = null;
      }
      var value = admittedValue(result);
      return !!value && value.ok === true;
    }

    function projectionFor(kind, proof) {
      if (kind === 'inspectLineage') {
        return {
          version: VERSION,
          status: 'current',
          familyId: proof.familyId,
          lineage: proof.lineageProof,
          blockerCodes: []
        };
      }
      if (kind === 'inspectFacts') {
        return {
          version: VERSION,
          status: 'current',
          familyId: proof.familyId,
          facts: proof.assertions,
          blockerCodes: []
        };
      }
      if (kind === 'inspectConflicts') {
        return {
          version: VERSION,
          status: 'current',
          familyId: proof.familyId,
          conflicts: proof.conflicts,
          blockerCodes: []
        };
      }
      if (kind === 'inspectCitations') {
        return {
          version: VERSION,
          status: 'current',
          familyId: proof.familyId,
          citations: proof.citations,
          blockerCodes: []
        };
      }
      if (kind === 'inspectDeadline') {
        return {
          version: VERSION,
          status: 'current',
          familyId: proof.familyId,
          deadlineRules: proof.deadlineRules,
          deadlineResults: proof.deadlineResults,
          blockerCodes: []
        };
      }
      return {
        version: VERSION,
        status: 'current',
        familyId: proof.familyId,
        sourceCount: proof.sourceBindings.length,
        assertionCount: proof.assertions.length,
        conflictCount: proof.conflicts.length,
        citationCount: proof.citations.length,
        deadlineCount: proof.deadlineResults.length,
        blockerCodes: []
      };
    }

    function boundedProjection(value) {
      var copy = safeClone(value);
      if (!copy) return blocked(['input-not-exact']);
      var encoded;
      var length;
      try {
        encoded = JSON.stringify(copy);
        length = byteLength(encoded);
      } catch (_error) {
        return blocked(['input-not-exact']);
      }
      if (!Number.isSafeInteger(length) || length < 0 ||
          length > truthSchema.LIMITS.MAX_MINIMIZED_RESULT_BYTES) {
        return blocked(['exact-set-over-cap']);
      }
      return deepFreeze(copy);
    }

    async function inspect(kind, exactTuple, request) {
      var contextState = await requestContext(request, true);
      if (contextState.blockerCodes) return blocked(contextState.blockerCodes);
      var controller = new AbortController();
      var authority = await freshAuthority(exactTuple);
      if (authority.blockerCodes) return blocked(authority.blockerCodes);
      var contextFailure = await validateContextNow(
        exactTuple,
        contextState.evaluationContext,
        authority.snapshot,
        contextState.contextDigest,
        controller.signal
      );
      if (contextFailure) return blocked(contextFailure);
      var proof;
      try {
        proof = await truthStore.readActiveFamily({
          partitionKey: authority.snapshot.partitionKey,
          familyId: contextState.familyId
        });
      } catch (_error) {
        proof = null;
      }
      if (!proof) return blocked(['fact-missing']);
      if (!proofCurrent(proof, contextState, authority)) {
        await withdrawStale(exactTuple, authority, proof);
        return blocked(
          truthSchema.canonicalize(proof.evaluationContext) !==
            truthSchema.canonicalize(contextState.evaluationContext)
            ? ['evaluation-context-mismatch']
            : ['snapshot-stale']
        );
      }
      var finalAuthority = await freshAuthority(exactTuple);
      if (finalAuthority.blockerCodes ||
          !sameSourceSet(authority.visible, finalAuthority.visible) ||
          !sameGraphSnapshot(authority.snapshot, finalAuthority.snapshot) ||
          !proofCurrent(proof, contextState, finalAuthority)) {
        await withdrawStale(exactTuple, authority, proof);
        return blocked(['snapshot-stale']);
      }
      contextFailure = await validateContextNow(
        exactTuple,
        contextState.evaluationContext,
        finalAuthority.snapshot,
        contextState.contextDigest,
        controller.signal
      );
      if (contextFailure) return blocked(contextFailure);
      return boundedProjection(projectionFor(kind, proof));
    }

    var facade = {
      recompute: recompute,
      inspectLineage: function(exactTuple, request) {
        return inspect('inspectLineage', exactTuple, request);
      },
      inspectFacts: function(exactTuple, request) {
        return inspect('inspectFacts', exactTuple, request);
      },
      inspectConflicts: function(exactTuple, request) {
        return inspect('inspectConflicts', exactTuple, request);
      },
      inspectCitations: function(exactTuple, request) {
        return inspect('inspectCitations', exactTuple, request);
      },
      inspectDeadline: function(exactTuple, request) {
        return inspect('inspectDeadline', exactTuple, request);
      },
      inspectStatus: function(exactTuple, request) {
        return inspect('inspectStatus', exactTuple, request);
      },
      inspectDisplaySnapshot: function(exactTuple, request) {
        return inspectDisplaySnapshot(exactTuple, request);
      }
    };
    return Object.freeze(facade);
  }

  var api = Object.freeze({
    VERSION: VERSION,
    create: create
  });

  global.FsbSkopeoTruthEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
