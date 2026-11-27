(function(global) {
  'use strict';

  var VERSION = 1;
  var LIMITS = frozenRecord([
    ['MAX_SOURCE_GENERATIONS', 32],
    ['MAX_QUERY_CHARACTERS', 512],
    ['MAX_LEXICAL_RESULTS', 20],
    ['MAX_TRAVERSAL_DEPTH', 2],
    ['MAX_TRAVERSAL_NODES', 64],
    ['MAX_TRAVERSAL_EDGES', 128],
    ['MAX_PROVENANCE_LOCATORS', 4],
    ['MAX_RESULT_BYTES', 65536],
    ['MAX_PARTITION_CACHES', 4],
    ['MAX_INDEXED_RECORDS', 4096],
    ['MAX_SNAPSHOT_RECORDS', 4096],
    ['MAX_SNAPSHOT_RELATIONS', 16384],
    ['MAX_SNAPSHOT_EVIDENCE', 65536],
    ['MAX_SNAPSHOT_BYTES', 8388608]
  ]);
  var MAX_CACHE_RELATIONS = 16384;
  var MAX_SHARDS = 64;
  var MAX_SHARD_ITEMS = 32768;
  var INDEX_OPTIONS = Object.freeze({
    idField: 'stableRecordId',
    fields: Object.freeze(['label']),
    storeFields: Object.freeze([])
  });

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
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
    if ((prototype !== Object.prototype && prototype !== null) || keys.length !== names.length) {
      return null;
    }
    var allowed = Object.create(null);
    for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
      allowed[names[nameIndex]] = true;
    }
    var output = Object.create(null);
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var key = keys[keyIndex];
      if (typeof key !== 'string' || !own(allowed, key)) return null;
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch (_descriptorError) {
        return null;
      }
      if (!descriptor || descriptor.enumerable !== true || !own(descriptor, 'value')) return null;
      output[key] = descriptor.value;
    }
    return output;
  }

  function arrayValues(value, maximum, minimum) {
    if (!Array.isArray(value)) return null;
    var lengthDescriptor;
    var keys;
    try {
      lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      keys = Reflect.ownKeys(value);
    } catch (_error) {
      return null;
    }
    if (!lengthDescriptor || !own(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < minimum ||
        lengthDescriptor.value > maximum || keys.length !== lengthDescriptor.value + 1) {
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
      if (!descriptor || descriptor.enumerable !== true || !own(descriptor, 'value')) return null;
      output.push(descriptor.value);
    }
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var key = keys[keyIndex];
      if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= lengthDescriptor.value)) return null;
    }
    return output;
  }

  function validOpaque(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validSource(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validDigest(value, prefix) {
    return typeof value === 'string' && new RegExp('^' + prefix + '[0-9a-f]{64}$').test(value);
  }

  function validGeneration(value) {
    return validDigest(value, 'sfg1:');
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validSignal(value) {
    return !!value && typeof value === 'object' && typeof value.aborted === 'boolean' &&
      typeof value.addEventListener === 'function' &&
      typeof value.removeEventListener === 'function';
  }

  function setFrom(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return output;
  }

  function compareText(left, right) {
    return left < right ? -1 : (left > right ? 1 : 0);
  }

  function create(options) {
    var fields = exactFields(options, ['graphSchema', 'graphStore', 'MiniSearch', 'byteLength']);
    if (!fields || !fields.graphSchema || !fields.graphStore ||
        typeof fields.graphStore.readCurrentFragment !== 'function' ||
        typeof fields.graphStore.readActiveShards !== 'function' ||
        typeof fields.MiniSearch !== 'function' || typeof fields.byteLength !== 'function') {
      return null;
    }

    var graphSchema = fields.graphSchema;
    var graphStore = fields.graphStore;
    var MiniSearchConstructor = fields.MiniSearch;
    var byteLength = fields.byteLength;
    var recordKinds = arrayValues(graphSchema.RECORD_KINDS, 32, 1);
    var predicates = arrayValues(graphSchema.RELATION_PREDICATES, 32, 1);
    var candidatePredicates = arrayValues(graphSchema.CROSS_DOCUMENT_PREDICATES, 16, 1);
    if (!recordKinds || !predicates || !candidatePredicates) return null;
    var recordKindSet = setFrom(recordKinds);
    var predicateSet = setFrom(predicates);
    var candidatePredicateSet = setFrom(candidatePredicates);
    var scopes = new WeakMap();
    var partitionCaches = new Map();

    function status(value) {
      return frozenRecord([['status', value]]);
    }

    function closedArray() {
      return frozenArray([]);
    }

    function bounded(value, closedValue) {
      try {
        var encoded = JSON.stringify(value);
        var length = byteLength(encoded);
        return Number.isSafeInteger(length) && length >= 0 && length <= LIMITS.MAX_RESULT_BYTES
          ? value : closedValue;
      } catch (_error) {
        return closedValue;
      }
    }

    function parseEvidence(value, ownership) {
      var entries = arrayValues(value, 64, 1);
      if (!entries) return null;
      var output = [];
      var seen = Object.create(null);
      for (var index = 0; index < entries.length; index += 1) {
        var keys;
        try {
          keys = Reflect.ownKeys(entries[index]);
        } catch (_error) {
          return null;
        }
        var locator = keys.length === 3
          ? exactFields(entries[index], ['locatorId', 'sourceByteStart', 'sourceByteEnd'])
          : exactFields(entries[index], [
            'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint',
            'fragmentGenerationId', 'excerptId', 'start', 'end',
            'sourceByteStart', 'sourceByteEnd', 'locatorId'
          ]);
        if (!locator || !validDigest(locator.locatorId, 'sel1:') ||
            !Number.isSafeInteger(locator.sourceByteStart) || locator.sourceByteStart < 0 ||
            !Number.isSafeInteger(locator.sourceByteEnd) ||
            locator.sourceByteEnd <= locator.sourceByteStart || own(seen, locator.locatorId)) {
          return null;
        }
        if (keys.length !== 3 && (locator.schemaVersion !== graphSchema.VERSION ||
            locator.partitionKey !== ownership.partitionKey ||
            locator.sourceFileId !== ownership.sourceFileId ||
            locator.contentFingerprint !== ownership.contentFingerprint ||
            locator.fragmentGenerationId !== ownership.fragmentGenerationId)) {
          return null;
        }
        seen[locator.locatorId] = true;
        output.push(frozenRecord([
          ['locatorId', locator.locatorId],
          ['sourceByteStart', locator.sourceByteStart],
          ['sourceByteEnd', locator.sourceByteEnd]
        ]));
      }
      return frozenArray(output);
    }

    function relationKindsAllowed(predicate, fromKind, toKind) {
      if (!own(predicateSet, predicate) || !own(recordKindSet, fromKind) ||
          !own(recordKindSet, toKind)) return false;
      if (predicate === 'contains') {
        return (fromKind === 'agreement' || fromKind === 'amendment' ||
          fromKind === 'policy-document' || fromKind === 'memo') && toKind === 'clause';
      }
      if (predicate === 'amends-candidate') {
        return fromKind === 'amendment' && (toKind === 'agreement' || toKind === 'clause');
      }
      if (predicate === 'states-fact') return toKind === 'fact';
      if (predicate === 'records-event') return toKind === 'event';
      if (predicate === 'assigned-owner') return toKind === 'owner';
      if (predicate === 'references-policy') return toKind === 'policy-document';
      if (predicate === 'references-memo') return toKind === 'memo';
      return false;
    }

    function parseRecord(value, ownership) {
      var record = exactFields(value, [
        'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint',
        'fragmentGenerationId', 'kind', 'label', 'evidence',
        'stableRecordId', 'recordVersionId'
      ]);
      if (!record || record.schemaVersion !== graphSchema.VERSION ||
          record.partitionKey !== ownership.partitionKey ||
          record.sourceFileId !== ownership.sourceFileId ||
          record.contentFingerprint !== ownership.contentFingerprint ||
          record.fragmentGenerationId !== ownership.fragmentGenerationId ||
          !own(recordKindSet, record.kind) || !validOpaque(record.label, 4096) ||
          !validDigest(record.stableRecordId, 'sri1:') ||
          !validDigest(record.recordVersionId, 'srv1:')) return null;
      var evidence = parseEvidence(record.evidence, ownership);
      if (!evidence) return null;
      return frozenRecord([
        ['partitionKey', record.partitionKey],
        ['sourceFileId', record.sourceFileId],
        ['contentFingerprint', record.contentFingerprint],
        ['fragmentGenerationId', record.fragmentGenerationId],
        ['kind', record.kind],
        ['label', record.label],
        ['evidence', evidence],
        ['stableRecordId', record.stableRecordId],
        ['recordVersionId', record.recordVersionId]
      ]);
    }

    function parseLocalRelation(value, ownership, recordMap) {
      var relation = exactFields(value, [
        'schemaVersion', 'relationClass', 'partitionKey', 'sourceFileId',
        'fragmentGenerationId', 'predicate', 'fromStableRecordId', 'fromRecordVersionId',
        'toStableRecordId', 'toRecordVersionId', 'evidence',
        'stableRelationId', 'relationVersionId'
      ]);
      var from = relation && recordMap.get(relation.fromStableRecordId);
      var to = relation && recordMap.get(relation.toStableRecordId);
      if (!relation || relation.schemaVersion !== graphSchema.VERSION ||
          relation.relationClass !== 'local' || relation.partitionKey !== ownership.partitionKey ||
          relation.sourceFileId !== ownership.sourceFileId ||
          relation.fragmentGenerationId !== ownership.fragmentGenerationId ||
          !own(predicateSet, relation.predicate) || !from || !to ||
          relation.fromRecordVersionId !== from.recordVersionId ||
          relation.toRecordVersionId !== to.recordVersionId ||
          !relationKindsAllowed(relation.predicate, from.kind, to.kind) ||
          !validDigest(relation.stableRelationId, 'srl1:') ||
          !validDigest(relation.relationVersionId, 'slv1:')) return null;
      var evidence = parseEvidence(relation.evidence, ownership);
      if (!evidence) return null;
      return frozenRecord([
        ['relationClass', 'local'],
        ['partitionKey', relation.partitionKey],
        ['sourceFileId', relation.sourceFileId],
        ['fragmentGenerationId', relation.fragmentGenerationId],
        ['predicate', relation.predicate],
        ['fromStableRecordId', relation.fromStableRecordId],
        ['fromRecordVersionId', relation.fromRecordVersionId],
        ['toStableRecordId', relation.toStableRecordId],
        ['toRecordVersionId', relation.toRecordVersionId],
        ['evidence', evidence],
        ['stableRelationId', relation.stableRelationId],
        ['relationVersionId', relation.relationVersionId]
      ]);
    }

    function parseFragment(value, pair, partitionKey) {
      var fragment = exactFields(value, [
        'schemaVersion', 'promptVersion', 'partitionKey', 'sourceFileId',
        'contentFingerprint', 'fragmentGenerationId', 'providerId', 'modelId',
        'records', 'relations'
      ]);
      if (!fragment || fragment.schemaVersion !== graphSchema.VERSION ||
          fragment.promptVersion !== graphSchema.PROMPT_VERSION ||
          fragment.partitionKey !== partitionKey || fragment.sourceFileId !== pair.sourceFileId ||
          fragment.fragmentGenerationId !== pair.fragmentGenerationId ||
          !validFingerprint(fragment.contentFingerprint) ||
          !validOpaque(fragment.providerId, 128) || !validOpaque(fragment.modelId, 128)) return null;
      var recordInputs = arrayValues(fragment.records, LIMITS.MAX_INDEXED_RECORDS, 0);
      var relationInputs = arrayValues(fragment.relations, MAX_CACHE_RELATIONS, 0);
      if (!recordInputs || !relationInputs) return null;
      var ownership = frozenRecord([
        ['partitionKey', partitionKey], ['sourceFileId', pair.sourceFileId],
        ['contentFingerprint', fragment.contentFingerprint],
        ['fragmentGenerationId', pair.fragmentGenerationId]
      ]);
      var records = [];
      var recordMap = new Map();
      for (var recordIndex = 0; recordIndex < recordInputs.length; recordIndex += 1) {
        var record = parseRecord(recordInputs[recordIndex], ownership);
        if (!record || recordMap.has(record.stableRecordId)) return null;
        recordMap.set(record.stableRecordId, record);
        records.push(record);
      }
      var relations = [];
      var relationMap = new Map();
      for (var relationIndex = 0; relationIndex < relationInputs.length; relationIndex += 1) {
        var relation = parseLocalRelation(relationInputs[relationIndex], ownership, recordMap);
        if (!relation || relationMap.has(relation.relationVersionId)) return null;
        relationMap.set(relation.relationVersionId, relation);
        relations.push(relation);
      }
      return {
        ownership: ownership,
        records: records,
        recordMap: recordMap,
        relations: relations,
        relationMap: relationMap
      };
    }

    function ownedShard(value, ownership, itemName) {
      var shard = exactFields(value, [
        'schemaVersion', 'partitionKey', 'sourceFileId', 'fragmentGenerationId',
        'shardOrdinal', itemName
      ]);
      if (!shard || shard.schemaVersion !== graphSchema.VERSION ||
          shard.partitionKey !== ownership.partitionKey ||
          shard.sourceFileId !== ownership.sourceFileId ||
          shard.fragmentGenerationId !== ownership.fragmentGenerationId ||
          !Number.isSafeInteger(shard.shardOrdinal) || shard.shardOrdinal < 0 ||
          shard.shardOrdinal >= MAX_SHARDS) return null;
      return shard;
    }

    function parseShards(value, fragment) {
      var fields = exactFields(value, [
        'lexicalShards', 'adjacencyShards', 'resultCacheShards', 'candidateRelations'
      ]);
      if (!fields) return null;
      var lexicalInputs = arrayValues(fields.lexicalShards, MAX_SHARDS, 0);
      var adjacencyInputs = arrayValues(fields.adjacencyShards, MAX_SHARDS, 0);
      var unusedInputs = arrayValues(fields.resultCacheShards, MAX_SHARDS, 0);
      var candidateInputs = arrayValues(fields.candidateRelations, MAX_CACHE_RELATIONS, 0);
      if (!lexicalInputs || !adjacencyInputs || !unusedInputs || !candidateInputs) return null;
      var indexedIds = new Set();
      var postingKeys = new Set();
      for (var lexicalIndex = 0; lexicalIndex < lexicalInputs.length; lexicalIndex += 1) {
        var lexical = ownedShard(lexicalInputs[lexicalIndex], fragment.ownership, 'postings');
        var postings = lexical && arrayValues(lexical.postings, MAX_SHARD_ITEMS, 0);
        if (!lexical || !postings) return null;
        for (var postingIndex = 0; postingIndex < postings.length; postingIndex += 1) {
          var posting = exactFields(postings[postingIndex], [
            'term', 'stableRecordId', 'recordVersionId'
          ]);
          var record = posting && fragment.recordMap.get(posting.stableRecordId);
          var postingKey = posting && posting.term + '\u0000' + posting.stableRecordId +
            '\u0000' + posting.recordVersionId;
          if (!posting || !validOpaque(posting.term, 4096) || !record ||
              posting.recordVersionId !== record.recordVersionId || postingKeys.has(postingKey)) {
            return null;
          }
          postingKeys.add(postingKey);
          indexedIds.add(posting.stableRecordId);
        }
      }
      var coverage = new Set();
      for (var adjacencyIndex = 0; adjacencyIndex < adjacencyInputs.length; adjacencyIndex += 1) {
        var adjacency = ownedShard(adjacencyInputs[adjacencyIndex], fragment.ownership, 'entries');
        var entries = adjacency && arrayValues(adjacency.entries, MAX_SHARD_ITEMS, 0);
        if (!adjacency || !entries) return null;
        for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
          var entry = exactFields(entries[entryIndex], [
            'stableRecordId', 'relationVersionId', 'direction'
          ]);
          var relation = entry && fragment.relationMap.get(entry.relationVersionId);
          if (!entry || !relation || (entry.direction !== 'out' && entry.direction !== 'in')) {
            return null;
          }
          var expectedId = entry.direction === 'out'
            ? relation.fromStableRecordId : relation.toStableRecordId;
          var coverageKey = entry.relationVersionId + '\u0000' + entry.direction;
          if (entry.stableRecordId !== expectedId || coverage.has(coverageKey)) return null;
          coverage.add(coverageKey);
        }
      }
      for (var relationIndex = 0; relationIndex < fragment.relations.length; relationIndex += 1) {
        var relationId = fragment.relations[relationIndex].relationVersionId;
        if (!coverage.has(relationId + '\u0000out') || !coverage.has(relationId + '\u0000in')) {
          return null;
        }
      }
      return { indexedIds: indexedIds, candidateInputs: candidateInputs };
    }

    function parseCandidate(value, proposer, sourcePairs, records) {
      var relation = exactFields(value, [
        'schemaVersion', 'relationClass', 'partitionKey', 'relationKind',
        'proposingSourceFileId', 'targetSourceFileId',
        'fromStableRecordId', 'toStableRecordId', 'stableRelationId',
        'proposerRecordVersionId', 'proposerFragmentGenerationId',
        'targetRecordVersionId', 'targetFragmentGenerationId',
        'evidence', 'canonicalEvidenceLocatorIdentity', 'relationVersionId'
      ]);
      if (!relation || relation.schemaVersion !== graphSchema.VERSION ||
          relation.relationClass !== 'cross-document-candidate' ||
          relation.partitionKey !== proposer.ownership.partitionKey ||
          relation.proposingSourceFileId !== proposer.ownership.sourceFileId ||
          relation.proposerFragmentGenerationId !== proposer.ownership.fragmentGenerationId ||
          !validSource(relation.targetSourceFileId) ||
          !own(candidatePredicateSet, relation.relationKind) ||
          !validDigest(relation.stableRelationId, 'srl1:') ||
          !validDigest(relation.relationVersionId, 'scv1:')) return null;
      var targetGeneration = sourcePairs.get(relation.targetSourceFileId);
      if (targetGeneration !== relation.targetFragmentGenerationId) return false;
      var from = records.get(relation.fromStableRecordId);
      var to = records.get(relation.toStableRecordId);
      if (!from || !to || from.sourceFileId !== relation.proposingSourceFileId ||
          from.fragmentGenerationId !== relation.proposerFragmentGenerationId ||
          to.sourceFileId !== relation.targetSourceFileId ||
          to.fragmentGenerationId !== relation.targetFragmentGenerationId ||
          from.recordVersionId !== relation.proposerRecordVersionId ||
          to.recordVersionId !== relation.targetRecordVersionId ||
          !relationKindsAllowed(relation.relationKind, from.kind, to.kind)) return null;
      var evidence = parseEvidence(relation.evidence, proposer.ownership);
      if (!evidence) return null;
      return frozenRecord([
        ['relationClass', 'cross-document-candidate'],
        ['partitionKey', relation.partitionKey],
        ['sourceFileId', relation.proposingSourceFileId],
        ['fragmentGenerationId', relation.proposerFragmentGenerationId],
        ['predicate', relation.relationKind],
        ['fromStableRecordId', relation.fromStableRecordId],
        ['fromRecordVersionId', relation.proposerRecordVersionId],
        ['toStableRecordId', relation.toStableRecordId],
        ['toRecordVersionId', relation.targetRecordVersionId],
        ['evidence', evidence],
        ['stableRelationId', relation.stableRelationId],
        ['relationVersionId', relation.relationVersionId]
      ]);
    }

    function scopeData(scope) {
      var value;
      try {
        value = scopes.get(scope);
      } catch (_error) {
        return null;
      }
      return value && value.active ? value : null;
    }

    function closeScope(data) {
      if (!data || !data.active) return;
      data.active = false;
      if (data.cache) data.cache.scopeRecords.delete(data);
      data.cache = null;
    }

    function invalidateCache(cache) {
      if (!cache || !cache.active) return;
      cache.active = false;
      if (partitionCaches.get(cache.partitionKey) === cache) {
        partitionCaches.delete(cache.partitionKey);
      }
      cache.scopeRecords.forEach(function(data) {
        data.active = false;
        data.cache = null;
      });
      cache.scopeRecords.clear();
      cache.sources.clear();
      cache.sourceBindingById.clear();
      cache.sourceBindings = frozenArray([]);
      cache.records.clear();
      cache.relations.clear();
      cache.adjacency.clear();
      cache.index = null;
    }

    function touchCache(cache) {
      if (!cache || !cache.active || partitionCaches.get(cache.partitionKey) !== cache) return;
      partitionCaches.delete(cache.partitionKey);
      partitionCaches.set(cache.partitionKey, cache);
    }

    function insertCache(cache) {
      var prior = partitionCaches.get(cache.partitionKey);
      if (prior) invalidateCache(prior);
      partitionCaches.set(cache.partitionKey, cache);
      while (partitionCaches.size > LIMITS.MAX_PARTITION_CACHES) {
        var first = partitionCaches.values().next().value;
        invalidateCache(first);
      }
    }

    async function readCurrent(data) {
      try {
        for (var index = 0; index < data.pairs.length; index += 1) {
          var pair = data.pairs[index];
          var fragment = await graphStore.readCurrentFragment(frozenRecord([
            ['partitionKey', data.partitionKey],
            ['sourceFileId', pair.sourceFileId],
            ['fragmentGenerationId', pair.fragmentGenerationId]
          ]));
          var identity = exactFields(fragment, [
            'schemaVersion', 'promptVersion', 'partitionKey', 'sourceFileId',
            'contentFingerprint', 'fragmentGenerationId', 'providerId', 'modelId',
            'records', 'relations'
          ]);
          if (!identity || identity.partitionKey !== data.partitionKey ||
              identity.sourceFileId !== pair.sourceFileId ||
              identity.fragmentGenerationId !== pair.fragmentGenerationId) return false;
        }
        return data.active;
      } catch (_error) {
        return false;
      }
    }

    async function liveCache(data) {
      if (!data || !data.active || !data.cache || !data.cache.active ||
          partitionCaches.get(data.partitionKey) !== data.cache) return null;
      if (!await readCurrent(data) || !data.active || !data.cache || !data.cache.active) {
        if (data.cache) invalidateCache(data.cache);
        else closeScope(data);
        return null;
      }
      touchCache(data.cache);
      return data.cache;
    }

    function createScope(value) {
      var input = exactFields(value, ['partitionKey', 'exactSourceGenerations']);
      var pairInputs = input && arrayValues(
        input.exactSourceGenerations, LIMITS.MAX_SOURCE_GENERATIONS, 1);
      if (!input || !validOpaque(input.partitionKey, 1024) || !pairInputs) return null;
      var seen = Object.create(null);
      var pairs = [];
      for (var index = 0; index < pairInputs.length; index += 1) {
        var pair = exactFields(pairInputs[index], ['sourceFileId', 'fragmentGenerationId']);
        if (!pair || !validSource(pair.sourceFileId) || !validGeneration(pair.fragmentGenerationId) ||
            own(seen, pair.sourceFileId)) return null;
        seen[pair.sourceFileId] = true;
        pairs.push(frozenRecord([
          ['sourceFileId', pair.sourceFileId],
          ['fragmentGenerationId', pair.fragmentGenerationId]
        ]));
      }
      pairs.sort(function(left, right) {
        return compareText(left.sourceFileId, right.sourceFileId) ||
          compareText(left.fragmentGenerationId, right.fragmentGenerationId);
      });
      var target = Object.freeze(Object.create(null));
      var scope = Object.freeze(new Proxy(target, {
        get: function(scopeTarget, key, receiver) {
          if (key === 'toJSON') throw new TypeError('Opaque graph query scope cannot serialize');
          return Reflect.get(scopeTarget, key, receiver);
        }
      }));
      scopes.set(scope, {
        active: true,
        partitionKey: input.partitionKey,
        pairs: frozenArray(pairs),
        signature: pairs.map(function(pair) {
          return pair.sourceFileId + '\u0000' + pair.fragmentGenerationId;
        }).join('\u0001'),
        cache: null
      });
      return scope;
    }

    async function buildCache(data) {
      var fragments = [];
      var shardGroups = [];
      var totalRecords = 0;
      var totalRelations = 0;
      try {
        for (var index = 0; index < data.pairs.length; index += 1) {
          var pair = data.pairs[index];
          var request = frozenRecord([
            ['partitionKey', data.partitionKey], ['sourceFileId', pair.sourceFileId],
            ['fragmentGenerationId', pair.fragmentGenerationId]
          ]);
          var fragmentValue = await graphStore.readCurrentFragment(request);
          var fragment = parseFragment(fragmentValue, pair, data.partitionKey);
          if (!fragment) return null;
          totalRecords += fragment.records.length;
          totalRelations += fragment.relations.length;
          if (totalRecords > LIMITS.MAX_INDEXED_RECORDS || totalRelations > MAX_CACHE_RELATIONS) {
            return null;
          }
          var shardValue = await graphStore.readActiveShards(request);
          var shards = parseShards(shardValue, fragment);
          if (!shards) return null;
          fragments.push(fragment);
          shardGroups.push(shards);
        }
      } catch (_error) {
        return null;
      }
      var records = new Map();
      var relations = new Map();
      var indexedIds = new Set();
      var sourcePairs = new Map();
      for (var fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex += 1) {
        var ownedFragment = fragments[fragmentIndex];
        sourcePairs.set(ownedFragment.ownership.sourceFileId,
          ownedFragment.ownership.fragmentGenerationId);
        for (var recordIndex = 0; recordIndex < ownedFragment.records.length; recordIndex += 1) {
          var record = ownedFragment.records[recordIndex];
          if (records.has(record.stableRecordId)) return null;
          records.set(record.stableRecordId, record);
        }
        for (var relationIndex = 0; relationIndex < ownedFragment.relations.length; relationIndex += 1) {
          var relation = ownedFragment.relations[relationIndex];
          if (relations.has(relation.relationVersionId)) return null;
          relations.set(relation.relationVersionId, relation);
        }
        shardGroups[fragmentIndex].indexedIds.forEach(function(stableRecordId) {
          indexedIds.add(stableRecordId);
        });
      }
      for (var groupIndex = 0; groupIndex < shardGroups.length; groupIndex += 1) {
        var candidates = shardGroups[groupIndex].candidateInputs;
        for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
          var candidate = parseCandidate(
            candidates[candidateIndex], fragments[groupIndex], sourcePairs, records);
          if (candidate === false) continue;
          if (!candidate || relations.has(candidate.relationVersionId) ||
              relations.size >= MAX_CACHE_RELATIONS) return null;
          relations.set(candidate.relationVersionId, candidate);
        }
      }
      var documents = [];
      indexedIds.forEach(function(stableRecordId) {
        var record = records.get(stableRecordId);
        if (record) documents.push({ stableRecordId: record.stableRecordId, label: record.label });
      });
      documents.sort(function(left, right) {
        return compareText(left.stableRecordId, right.stableRecordId);
      });
      var index;
      try {
        index = new MiniSearchConstructor(INDEX_OPTIONS);
        index.addAll(documents);
      } catch (_indexError) {
        return null;
      }
      if (!await readCurrent(data) || !data.active) return null;
      var adjacency = new Map();
      relations.forEach(function(relation) {
        if (!adjacency.has(relation.fromStableRecordId)) {
          adjacency.set(relation.fromStableRecordId, []);
        }
        if (!adjacency.has(relation.toStableRecordId)) {
          adjacency.set(relation.toStableRecordId, []);
        }
        adjacency.get(relation.fromStableRecordId).push(relation);
        adjacency.get(relation.toStableRecordId).push(relation);
      });
      adjacency.forEach(function(items) {
        items.sort(function(left, right) {
          return compareText(left.relationVersionId, right.relationVersionId);
        });
      });
      var sourceBindings = fragments.map(function(fragment) {
        return frozenRecord([
          ['sourceFileId', fragment.ownership.sourceFileId],
          ['contentFingerprint', fragment.ownership.contentFingerprint],
          ['fragmentGenerationId', fragment.ownership.fragmentGenerationId]
        ]);
      });
      sourceBindings.sort(function(left, right) {
        return compareText(left.sourceFileId, right.sourceFileId) ||
          compareText(left.fragmentGenerationId, right.fragmentGenerationId);
      });
      var sourceBindingById = new Map(sourceBindings.map(function(binding) {
        return [binding.sourceFileId, binding];
      }));
      return {
        active: true,
        partitionKey: data.partitionKey,
        signature: data.signature,
        sources: new Set(data.pairs.map(function(pair) { return pair.sourceFileId; })),
        sourceBindings: frozenArray(sourceBindings),
        sourceBindingById: sourceBindingById,
        records: records,
        relations: relations,
        adjacency: adjacency,
        index: index,
        scopeRecords: new Set()
      };
    }

    async function ensureScopeCache(scope) {
      var data = scopeData(scope);
      if (!data) return status('closed');
      if (data.cache) return await liveCache(data) ? status('ready') : status('closed');
      var existing = partitionCaches.get(data.partitionKey);
      if (existing && existing.active && existing.signature === data.signature) {
        if (!await readCurrent(data) || !data.active || !existing.active) {
          invalidateCache(existing);
          closeScope(data);
          return status('closed');
        }
        data.cache = existing;
        existing.scopeRecords.add(data);
        touchCache(existing);
        return status('ready');
      }
      var cache = await buildCache(data);
      if (!cache || !data.active) {
        closeScope(data);
        return status('closed');
      }
      insertCache(cache);
      if (!data.active || !cache.active) return status('closed');
      data.cache = cache;
      cache.scopeRecords.add(data);
      return status('ready');
    }

    function pairInScope(data, sourceFileId, fragmentGenerationId) {
      for (var index = 0; index < data.pairs.length; index += 1) {
        if (data.pairs[index].sourceFileId === sourceFileId &&
            data.pairs[index].fragmentGenerationId === fragmentGenerationId) return true;
      }
      return false;
    }

    function recordProjection(record) {
      return frozenRecord([
        ['stableRecordId', record.stableRecordId],
        ['recordVersionId', record.recordVersionId],
        ['kind', record.kind],
        ['label', record.label],
        ['sourceFileId', record.sourceFileId],
        ['fragmentGenerationId', record.fragmentGenerationId]
      ]);
    }

    function evidenceProjection(evidence) {
      var output = [];
      for (var index = 0;
        index < evidence.length && index < LIMITS.MAX_PROVENANCE_LOCATORS; index += 1) {
        output.push(frozenRecord([
          ['locatorId', evidence[index].locatorId],
          ['sourceByteStart', evidence[index].sourceByteStart],
          ['sourceByteEnd', evidence[index].sourceByteEnd]
        ]));
      }
      return frozenArray(output);
    }

    function edgeProjection(relation) {
      return frozenRecord([
        ['relationVersionId', relation.relationVersionId],
        ['predicate', relation.predicate],
        ['fromStableRecordId', relation.fromStableRecordId],
        ['toStableRecordId', relation.toStableRecordId],
        ['candidateOnly', relation.relationClass === 'cross-document-candidate'],
        ['provenance', frozenRecord([
          ['sourceFileId', relation.sourceFileId],
          ['fragmentGenerationId', relation.fragmentGenerationId],
          ['locators', evidenceProjection(relation.evidence)]
        ])]
      ]);
    }

    function snapshotEvidence(evidence, binding, partitionKey, counter) {
      var inputs = arrayValues(evidence, 64, 1);
      if (!inputs || !binding) return null;
      var output = [];
      for (var index = 0; index < inputs.length; index += 1) {
        var locator = exactFields(inputs[index], [
          'locatorId', 'sourceByteStart', 'sourceByteEnd'
        ]);
        if (!locator || !validDigest(locator.locatorId, 'sel1:') ||
            !Number.isSafeInteger(locator.sourceByteStart) || locator.sourceByteStart < 0 ||
            !Number.isSafeInteger(locator.sourceByteEnd) ||
            locator.sourceByteEnd <= locator.sourceByteStart) return null;
        counter.count += 1;
        if (counter.count > LIMITS.MAX_SNAPSHOT_EVIDENCE) return null;
        output.push(frozenRecord([
          ['partitionKey', partitionKey],
          ['sourceFileId', binding.sourceFileId],
          ['contentFingerprint', binding.contentFingerprint],
          ['fragmentGenerationId', binding.fragmentGenerationId],
          ['locatorId', locator.locatorId],
          ['sourceByteStart', locator.sourceByteStart],
          ['sourceByteEnd', locator.sourceByteEnd]
        ]));
      }
      output.sort(function(left, right) {
        return compareText(left.locatorId, right.locatorId);
      });
      for (var duplicateIndex = 1; duplicateIndex < output.length; duplicateIndex += 1) {
        if (output[duplicateIndex - 1].locatorId === output[duplicateIndex].locatorId) return null;
      }
      return frozenArray(output);
    }

    function snapshotRecord(record, cache, counter) {
      var binding = cache.sourceBindingById.get(record.sourceFileId);
      if (!binding || binding.contentFingerprint !== record.contentFingerprint ||
          binding.fragmentGenerationId !== record.fragmentGenerationId) return null;
      var evidence = snapshotEvidence(record.evidence, binding, cache.partitionKey, counter);
      if (!evidence) return null;
      return frozenRecord([
        ['partitionKey', cache.partitionKey],
        ['sourceFileId', binding.sourceFileId],
        ['contentFingerprint', binding.contentFingerprint],
        ['fragmentGenerationId', binding.fragmentGenerationId],
        ['kind', record.kind],
        ['label', record.label],
        ['evidence', evidence],
        ['stableRecordId', record.stableRecordId],
        ['recordVersionId', record.recordVersionId]
      ]);
    }

    function snapshotRelation(relation, cache, counter) {
      var evidenceBinding = cache.sourceBindingById.get(relation.sourceFileId);
      var from = cache.records.get(relation.fromStableRecordId);
      var to = cache.records.get(relation.toStableRecordId);
      if (!evidenceBinding || evidenceBinding.fragmentGenerationId !== relation.fragmentGenerationId ||
          !from || !to || relation.fromRecordVersionId !== from.recordVersionId ||
          relation.toRecordVersionId !== to.recordVersionId) return null;
      var fromBinding = cache.sourceBindingById.get(from.sourceFileId);
      var toBinding = cache.sourceBindingById.get(to.sourceFileId);
      if (!fromBinding || !toBinding ||
          fromBinding.fragmentGenerationId !== from.fragmentGenerationId ||
          toBinding.fragmentGenerationId !== to.fragmentGenerationId) return null;
      var candidateOnly = relation.relationClass === 'cross-document-candidate';
      if (candidateOnly && (from.sourceFileId === to.sourceFileId ||
          relation.sourceFileId !== from.sourceFileId)) return null;
      if (!candidateOnly && (from.sourceFileId !== relation.sourceFileId ||
          to.sourceFileId !== relation.sourceFileId)) return null;
      var evidence = snapshotEvidence(
        relation.evidence, evidenceBinding, cache.partitionKey, counter);
      if (!evidence) return null;
      return frozenRecord([
        ['relationClass', relation.relationClass],
        ['partitionKey', cache.partitionKey],
        ['sourceFileId', evidenceBinding.sourceFileId],
        ['contentFingerprint', evidenceBinding.contentFingerprint],
        ['fragmentGenerationId', evidenceBinding.fragmentGenerationId],
        ['predicate', relation.predicate],
        ['fromSourceFileId', fromBinding.sourceFileId],
        ['fromFragmentGenerationId', fromBinding.fragmentGenerationId],
        ['fromStableRecordId', from.stableRecordId],
        ['fromRecordVersionId', from.recordVersionId],
        ['toSourceFileId', toBinding.sourceFileId],
        ['toFragmentGenerationId', toBinding.fragmentGenerationId],
        ['toStableRecordId', to.stableRecordId],
        ['toRecordVersionId', to.recordVersionId],
        ['evidence', evidence],
        ['stableRelationId', relation.stableRelationId],
        ['relationVersionId', relation.relationVersionId],
        ['candidateOnly', candidateOnly]
      ]);
    }

    async function snapshotExactSet(scope) {
      var data = scopeData(scope);
      var cache = data && await liveCache(data);
      if (!cache || cache.records.size > LIMITS.MAX_SNAPSHOT_RECORDS ||
          cache.relations.size > LIMITS.MAX_SNAPSHOT_RELATIONS ||
          cache.sourceBindings.length !== data.pairs.length) return null;
      var counter = { count: 0 };
      var records = [];
      var recordVersions = new Set();
      cache.records.forEach(function(record) {
        if (records === null) return;
        var projected = snapshotRecord(record, cache, counter);
        if (!projected || recordVersions.has(projected.recordVersionId)) {
          records = null;
          return;
        }
        recordVersions.add(projected.recordVersionId);
        records.push(projected);
      });
      if (!records) return null;
      records.sort(function(left, right) {
        return compareText(left.recordVersionId, right.recordVersionId) ||
          compareText(left.stableRecordId, right.stableRecordId);
      });
      var relations = [];
      cache.relations.forEach(function(relation) {
        if (relations === null) return;
        var projected = snapshotRelation(relation, cache, counter);
        if (!projected) {
          relations = null;
          return;
        }
        relations.push(projected);
      });
      if (!relations || counter.count > LIMITS.MAX_SNAPSHOT_EVIDENCE) return null;
      relations.sort(function(left, right) {
        return compareText(left.relationVersionId, right.relationVersionId) ||
          compareText(left.stableRelationId, right.stableRelationId);
      });
      var bindings = cache.sourceBindings.map(function(binding) {
        return frozenRecord([
          ['sourceFileId', binding.sourceFileId],
          ['contentFingerprint', binding.contentFingerprint],
          ['fragmentGenerationId', binding.fragmentGenerationId]
        ]);
      });
      var output = frozenRecord([
        ['snapshotVersion', 'skopeo-graph-exact-set/1'],
        ['partitionKey', cache.partitionKey],
        ['sourceBindings', frozenArray(bindings)],
        ['records', frozenArray(records)],
        ['relations', frozenArray(relations)]
      ]);
      var length;
      try {
        length = byteLength(JSON.stringify(output));
      } catch (_error) {
        return null;
      }
      if (!Number.isSafeInteger(length) || length < 0 ||
          length > LIMITS.MAX_SNAPSHOT_BYTES) return null;
      if (!await liveCache(data)) return null;
      return output;
    }

    async function getById(scope, value) {
      var input = exactFields(value, [
        'sourceFileId', 'fragmentGenerationId', 'stableRecordId'
      ]);
      if (!input || !validSource(input.sourceFileId) ||
          !validGeneration(input.fragmentGenerationId) ||
          !validDigest(input.stableRecordId, 'sri1:')) return null;
      var data = scopeData(scope);
      if (!data || !pairInScope(data, input.sourceFileId, input.fragmentGenerationId)) return null;
      var cache = await liveCache(data);
      if (!cache) return null;
      var record = cache.records.get(input.stableRecordId);
      if (!record || record.sourceFileId !== input.sourceFileId ||
          record.fragmentGenerationId !== input.fragmentGenerationId) return null;
      var output = recordProjection(record);
      if (!await liveCache(data)) return null;
      return bounded(output, null);
    }

    function expressionShaped(value) {
      return value.indexOf('$..') !== -1 || value.indexOf('[?(') !== -1 ||
        value.indexOf('@.') !== -1 || value.indexOf('=>') !== -1;
    }

    async function searchLexical(scope, value) {
      var input = exactFields(value, ['query', 'topN']);
      if (!input || typeof input.query !== 'string' || input.query.length < 1 ||
          input.query.length > LIMITS.MAX_QUERY_CHARACTERS || expressionShaped(input.query) ||
          !Number.isSafeInteger(input.topN) || input.topN < 1 ||
          input.topN > LIMITS.MAX_LEXICAL_RESULTS) return closedArray();
      var data = scopeData(scope);
      var cache = data && await liveCache(data);
      if (!cache) return closedArray();
      var hits;
      try {
        hits = cache.index.search(input.query, {
          combineWith: 'AND', prefix: false, fuzzy: false
        });
      } catch (_error) {
        return closedArray();
      }
      var results = [];
      for (var index = 0; index < hits.length; index += 1) {
        var score = hits[index] && hits[index].score;
        var record = hits[index] && cache.records.get(hits[index].id);
        if (!record || typeof score !== 'number' || !Number.isFinite(score) || score <= 0) continue;
        results.push({ record: record, score: score });
      }
      results.sort(function(left, right) {
        return right.score - left.score ||
          compareText(left.record.stableRecordId, right.record.stableRecordId);
      });
      var output = [];
      for (var outputIndex = 0;
        outputIndex < results.length && outputIndex < input.topN; outputIndex += 1) {
        var result = results[outputIndex];
        output.push(frozenRecord([
          ['stableRecordId', result.record.stableRecordId],
          ['recordVersionId', result.record.recordVersionId],
          ['kind', result.record.kind],
          ['label', result.record.label],
          ['sourceFileId', result.record.sourceFileId],
          ['fragmentGenerationId', result.record.fragmentGenerationId],
          ['score', result.score]
        ]));
      }
      if (!await liveCache(data)) return closedArray();
      return bounded(frozenArray(output), closedArray());
    }

    function parseNeighborInput(value) {
      var input = exactFields(value, [
        'sourceFileId', 'fragmentGenerationId', 'stableRecordId', 'predicate',
        'direction', 'depth', 'nodeLimit', 'edgeLimit'
      ]);
      if (!input || !validSource(input.sourceFileId) ||
          !validGeneration(input.fragmentGenerationId) ||
          !validDigest(input.stableRecordId, 'sri1:') || !own(predicateSet, input.predicate) ||
          (input.direction !== 'out' && input.direction !== 'in' && input.direction !== 'both') ||
          !Number.isSafeInteger(input.depth) || input.depth < 0 ||
          input.depth > LIMITS.MAX_TRAVERSAL_DEPTH ||
          !Number.isSafeInteger(input.nodeLimit) || input.nodeLimit < 1 ||
          input.nodeLimit > LIMITS.MAX_TRAVERSAL_NODES ||
          !Number.isSafeInteger(input.edgeLimit) || input.edgeLimit < 1 ||
          input.edgeLimit > LIMITS.MAX_TRAVERSAL_EDGES) return null;
      return input;
    }

    async function neighbors(scope, value) {
      var input = parseNeighborInput(value);
      if (!input) return null;
      var data = scopeData(scope);
      if (!data || !pairInScope(data, input.sourceFileId, input.fragmentGenerationId)) return null;
      var cache = await liveCache(data);
      if (!cache) return null;
      var root = cache.records.get(input.stableRecordId);
      if (!root || root.sourceFileId !== input.sourceFileId ||
          root.fragmentGenerationId !== input.fragmentGenerationId) return null;
      var queue = [{ stableRecordId: root.stableRecordId, depth: 0 }];
      var visitedNodes = new Set([root.stableRecordId]);
      var visitedEdges = new Set();
      var nodeIds = [root.stableRecordId];
      var edgeIds = [];
      for (var queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
        var current = queue[queueIndex];
        if (current.depth >= input.depth) continue;
        var adjacent = cache.adjacency.get(current.stableRecordId) || [];
        for (var edgeIndex = 0; edgeIndex < adjacent.length; edgeIndex += 1) {
          var relation = adjacent[edgeIndex];
          if (relation.predicate !== input.predicate ||
              visitedEdges.has(relation.relationVersionId)) continue;
          var nextId = null;
          if ((input.direction === 'out' || input.direction === 'both') &&
              relation.fromStableRecordId === current.stableRecordId) {
            nextId = relation.toStableRecordId;
          } else if ((input.direction === 'in' || input.direction === 'both') &&
              relation.toStableRecordId === current.stableRecordId) {
            nextId = relation.fromStableRecordId;
          }
          if (!nextId) continue;
          if (edgeIds.length >= input.edgeLimit) return null;
          visitedEdges.add(relation.relationVersionId);
          edgeIds.push(relation.relationVersionId);
          if (!visitedNodes.has(nextId)) {
            if (nodeIds.length >= input.nodeLimit) return null;
            visitedNodes.add(nextId);
            nodeIds.push(nextId);
            queue.push({ stableRecordId: nextId, depth: current.depth + 1 });
          }
        }
      }
      nodeIds.sort(compareText);
      edgeIds.sort(compareText);
      var nodes = [];
      var edges = [];
      for (var nodeIndex = 0; nodeIndex < nodeIds.length; nodeIndex += 1) {
        var node = cache.records.get(nodeIds[nodeIndex]);
        if (!node) return null;
        nodes.push(recordProjection(node));
      }
      for (var relationIndex = 0; relationIndex < edgeIds.length; relationIndex += 1) {
        var selectedRelation = cache.relations.get(edgeIds[relationIndex]);
        if (!selectedRelation) return null;
        edges.push(edgeProjection(selectedRelation));
      }
      var output = frozenRecord([
        ['nodes', frozenArray(nodes)], ['edges', frozenArray(edges)]
      ]);
      if (!await liveCache(data)) return null;
      return bounded(output, null);
    }

    async function inspectProvenance(scope, value) {
      var input = exactFields(value, [
        'sourceFileId', 'fragmentGenerationId', 'entityType', 'entityId'
      ]);
      if (!input || !validSource(input.sourceFileId) ||
          !validGeneration(input.fragmentGenerationId) ||
          (input.entityType !== 'record' && input.entityType !== 'relation') ||
          (input.entityType === 'record'
            ? !validDigest(input.entityId, 'sri1:')
            : !(validDigest(input.entityId, 'slv1:') || validDigest(input.entityId, 'scv1:')))) {
        return null;
      }
      var data = scopeData(scope);
      if (!data || !pairInScope(data, input.sourceFileId, input.fragmentGenerationId)) return null;
      var cache = await liveCache(data);
      if (!cache) return null;
      var output;
      if (input.entityType === 'record') {
        var record = cache.records.get(input.entityId);
        if (!record || record.sourceFileId !== input.sourceFileId ||
            record.fragmentGenerationId !== input.fragmentGenerationId) return null;
        output = frozenRecord([
          ['entityType', 'record'], ['entityId', record.stableRecordId],
          ['sourceFileId', record.sourceFileId],
          ['fragmentGenerationId', record.fragmentGenerationId],
          ['candidateOnly', false], ['locators', evidenceProjection(record.evidence)]
        ]);
      } else {
        var relation = cache.relations.get(input.entityId);
        if (!relation || relation.sourceFileId !== input.sourceFileId ||
            relation.fragmentGenerationId !== input.fragmentGenerationId) return null;
        output = frozenRecord([
          ['entityType', 'relation'], ['entityId', relation.relationVersionId],
          ['sourceFileId', relation.sourceFileId],
          ['fragmentGenerationId', relation.fragmentGenerationId],
          ['predicate', relation.predicate],
          ['candidateOnly', relation.relationClass === 'cross-document-candidate'],
          ['locators', evidenceProjection(relation.evidence)]
        ]);
      }
      if (!await liveCache(data)) return null;
      return bounded(output, null);
    }

    function releaseScope(scope) {
      var data = scopeData(scope);
      if (!data) return false;
      closeScope(data);
      return true;
    }

    function cacheInput(value, sourceMode) {
      var input = exactFields(value, [
        'partitionKey', 'accountPermissionId', 'corpusRootFileId', 'sourceFileId', 'reason'
      ]);
      if (!input || !validOpaque(input.partitionKey, 1024) ||
          !validOpaque(input.accountPermissionId, 256) ||
          !validOpaque(input.corpusRootFileId, 256) || !validOpaque(input.reason, 128) ||
          (sourceMode ? !validSource(input.sourceFileId) : input.sourceFileId !== null)) return null;
      return input;
    }

    function cacheAuthorization(value) {
      var input = exactFields(value, ['signal', 'operationEpoch']);
      return input && validSignal(input.signal) && !input.signal.aborted &&
        Number.isSafeInteger(input.operationEpoch) && input.operationEpoch >= 0
        ? input : null;
    }

    function purgeSource(value, authorization) {
      var input = cacheInput(value, true);
      if (!input || !cacheAuthorization(authorization)) return frozenRecord([['ok', false]]);
      var cache = partitionCaches.get(input.partitionKey);
      if (cache && cache.active && cache.sources.has(input.sourceFileId)) invalidateCache(cache);
      return frozenRecord([['ok', true]]);
    }

    function purgePartition(value, authorization) {
      var input = cacheInput(value, false);
      if (!input || !cacheAuthorization(authorization)) return frozenRecord([['ok', false]]);
      var cache = partitionCaches.get(input.partitionKey);
      if (cache) invalidateCache(cache);
      return frozenRecord([['ok', true]]);
    }

    function hasOwnedInfluence(value, authorization) {
      var sourceMode = false;
      var tentative = exactFields(value, [
        'partitionKey', 'accountPermissionId', 'corpusRootFileId', 'sourceFileId', 'reason'
      ]);
      if (tentative && tentative.sourceFileId !== null) sourceMode = true;
      var input = cacheInput(value, sourceMode);
      if (!input || !cacheAuthorization(authorization)) return frozenRecord([['owned', false]]);
      var cache = partitionCaches.get(input.partitionKey);
      var owned = !!cache && cache.active &&
        (input.sourceFileId === null || cache.sources.has(input.sourceFileId));
      return frozenRecord([['owned', owned]]);
    }

    var cacheOwner = Object.freeze({
      purgeSource: purgeSource,
      purgePartition: purgePartition,
      hasOwnedInfluence: hasOwnedInfluence
    });

    return Object.freeze({
      createScope: createScope,
      ensureScopeCache: ensureScopeCache,
      getById: getById,
      searchLexical: searchLexical,
      neighbors: neighbors,
      inspectProvenance: inspectProvenance,
      snapshotExactSet: snapshotExactSet,
      releaseScope: releaseScope,
      cacheOwner: cacheOwner
    });
  }

  var api = Object.freeze({ VERSION: VERSION, LIMITS: LIMITS, create: create });
  global.FsbSkopeoGraphQuery = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
