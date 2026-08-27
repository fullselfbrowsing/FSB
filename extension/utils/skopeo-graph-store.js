(function(global) {
  'use strict';

  var VERSION = 'skopeo-graph-store/1';
  var PREFIX = 'fsbSkopeoGraph:1:';
  var STATES = makeSet(['absent', 'withheld', 'staging', 'published', 'purging', 'repairing']);
  var PARTICIPANT_NAMES = makeSet(['fragments', 'indexes', 'relationships', 'result-cache']);
  var FIXED_REASONS = makeSet([
    'complete', 'user-withdrawn', 'access-revoked', 'root-replaced',
    'stale-operation', 'provider-binding-changed', 'quota-exceeded',
    'corrupt-staging', 'absence-proof-failed', 'recovery-pending'
  ]);
  var DIAGNOSTIC_OPERATIONS = makeSet([
    'replacement', 'publish', 'purge', 'recovery', 'query', 'candidate-relations'
  ]);
  var DIAGNOSTIC_OUTCOMES = makeSet(['success', 'failure', 'cancelled']);
  var DIAGNOSTIC_REASONS = makeSet([
    'complete', 'stale-operation', 'provider-binding-changed', 'quota-exceeded',
    'corrupt-staging', 'absence-proof-failed', 'recovery-pending', 'validation-failed'
  ]);
  var DIAGNOSTIC_RECOVERY = makeSet(['none', 'replayed', 'discarded', 'repaired', 'closed']);
  var VALIDATOR_KEYWORDS = makeSet([
    'additionalProperties', 'const', 'enum', 'format', 'maxItems', 'maxLength',
    'maximum', 'minItems', 'minLength', 'minimum', 'pattern', 'required', 'type'
  ]);

  var LIMITS = frozenRecord([
    ['MAX_RECORDS_PER_PAGE', 256],
    ['MAX_RELATIONS_PER_PAGE', 512],
    ['MAX_POSTINGS_PER_PAGE', 512],
    ['MAX_ADJACENCY_ENTRIES_PER_PAGE', 512],
    ['MAX_PAGES_PER_CATEGORY', 64],
    ['MAX_VALUE_BYTES', 262144],
    ['MAX_RECOVERY_STEPS', 128],
    ['MAX_DIAGNOSTICS', 100],
    ['MAX_DIAGNOSTIC_BYTES', 65536],
    ['DIAGNOSTIC_RETENTION_MS', 2592000000]
  ]);

  var CONTROL_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'state',
    'activeGenerationId', 'contentFingerprint', 'schemaVersion', 'promptVersion',
    'providerId', 'modelId', 'recordPageCount', 'relationPageCount',
    'lexicalPageCount', 'adjacencyPageCount', 'resultCachePageCount',
    'recordPageHashes', 'relationPageHashes', 'lexicalPageHashes',
    'adjacencyPageHashes', 'resultCachePageHashes', 'updatedAt', 'reason'
  ];
  var STAGING_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'contentFingerprint',
    'fragmentGenerationId', 'schemaVersion', 'promptVersion', 'providerId', 'modelId',
    'state', 'batchCount', 'batchHashes', 'recordPageCount', 'relationPageCount',
    'lexicalPageCount', 'adjacencyPageCount', 'resultCachePageCount',
    'recordPageHashes', 'relationPageHashes', 'lexicalPageHashes',
    'adjacencyPageHashes', 'resultCachePageHashes'
  ];
  var BATCH_INPUT_KEYS = [
    'schemaVersion', 'promptVersion', 'partitionKey', 'sourceFileId',
    'contentFingerprint', 'fragmentGenerationId', 'providerId', 'modelId',
    'batchOrdinal', 'records', 'relations'
  ];
  var BATCH_RECORD_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'contentFingerprint',
    'fragmentGenerationId', 'schemaVersion', 'promptVersion', 'providerId', 'modelId',
    'batchOrdinal', 'recordVersionIds', 'relationVersionIds', 'batchHash'
  ];
  var JOURNAL_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'fragmentGenerationId',
    'operation', 'state', 'reason', 'updatedAt'
  ];
  var PAGE_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'fragmentGenerationId',
    'pageOrdinal', 'pageCount', 'items'
  ];
  var SHARD_PAGE_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'fragmentGenerationId',
    'pageOrdinal', 'pageCount', 'shard'
  ];
  var RESULT_SHARD_KEYS = ['shardOrdinal', 'entries'];
  var RESULT_ENTRY_KEYS = ['queryDigest', 'stableRecordIds'];
  var OVERLAY_CONTROL_KEYS = [
    'version', 'kind', 'partitionKey', 'proposingSourceFileId',
    'proposingFragmentGenerationId', 'overlayGenerationId', 'targetGenerations',
    'relationPageCount', 'adjacencyPageCount', 'relationPageHashes',
    'adjacencyPageHashes', 'updatedAt'
  ];
  var OVERLAY_PAGE_KEYS = [
    'version', 'kind', 'partitionKey', 'proposingSourceFileId',
    'proposingFragmentGenerationId', 'overlayGenerationId',
    'pageOrdinal', 'pageCount', 'items'
  ];
  var DIAGNOSTIC_INPUT_KEYS = [
    'partitionKey', 'operation', 'outcome', 'reason', 'recovery',
    'schemaVersion', 'promptVersion', 'providerId', 'modelId',
    'recordCount', 'relationCount', 'durationMs', 'retryCount', 'repairCount',
    'inputTokens', 'outputTokens', 'validatorKeyword', 'validatorPath'
  ];
  var DIAGNOSTIC_RECORD_KEYS = DIAGNOSTIC_INPUT_KEYS.slice(1).concat(['timestamp']);
  var DIAGNOSTIC_LEDGER_KEYS = ['version', 'kind', 'partitionKey', 'records'];

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

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
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.length !== expectedKeys.length || keys.some(function(key) {
        return typeof key !== 'string';
      })) return null;
      var actual = keys.slice().sort();
      var expected = expectedKeys.slice().sort();
      for (var index = 0; index < expected.length; index += 1) {
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

  function denseArray(value, maximum, minimum) {
    if (!Array.isArray(value) || value.length > maximum || value.length < (minimum || 0)) return null;
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1) return null;
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
    for (var index = 0; index < entries.length; index += 1) output[entries[index][0]] = entries[index][1];
    return Object.freeze(output);
  }

  function frozenArray(values) {
    return Object.freeze(values.slice());
  }

  function ok(status) {
    return frozenRecord([['ok', true], ['status', status]]);
  }

  function failed(status) {
    return frozenRecord([['ok', false], ['status', status]]);
  }

  function statusError(status) {
    var error = new Error('fixed graph store failure');
    error.graphStatus = status;
    return error;
  }

  function validSourceId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validFingerprint(value) {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
  }

  function validGeneration(value) {
    return typeof value === 'string' && /^sfg1:[0-9a-f]{64}$/.test(value);
  }

  function validDigest(value, prefix) {
    return typeof value === 'string' && new RegExp('^' + prefix + '[0-9a-f]{64}$').test(value);
  }

  function validBindingId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      /^[A-Za-z0-9._-]+$/.test(value);
  }

  function validDiagnosticBindingId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
      /^[a-z0-9][a-z0-9._-]*$/.test(value);
  }

  function validValidatorPath(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256 || value[0] !== '/') {
      return false;
    }
    var allowed = makeSet([
      'records', 'relations', 'evidence', 'schemaVersion', 'batchId', 'candidateRef',
      'kind', 'label', 'fromCandidateRef', 'predicate', 'toCandidateRef',
      'excerptId', 'start', 'end'
    ]);
    return value.slice(1).split('/').every(function(segment) {
      return /^(?:0|[1-9][0-9]*)$/.test(segment) || !!allowed[segment];
    });
  }

  function validPartition(schema, value) {
    return typeof value === 'string' && !!schema.parsePartitionKey(value);
  }

  function validSignal(value) {
    return !!value && typeof value === 'object' && typeof value.aborted === 'boolean' &&
      typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function';
  }

  function safeInteger(value, maximum) {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  }

  function saturatingCounter(value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return null;
    if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
    return Math.floor(value);
  }

  function utf8Length(value) {
    if (typeof global.TextEncoder === 'function') return new global.TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function component(value) {
    return String(value.length) + ':' + value;
  }

  function sourceStorageKey(kind, partitionKey, sourceFileId, generationId, ordinal) {
    var key = PREFIX + kind + ':' + component(partitionKey) + component(sourceFileId);
    if (generationId !== undefined && generationId !== null) key += component(generationId);
    if (ordinal !== undefined && ordinal !== null) key += ':' + String(ordinal);
    return key;
  }

  function partitionStorageKey(kind, partitionKey) {
    return PREFIX + kind + ':' + component(partitionKey);
  }

  function sourcePrefix(kind, partitionKey, sourceFileId) {
    return PREFIX + kind + ':' + component(partitionKey) + component(sourceFileId);
  }

  function partitionPrefix(kind, partitionKey) {
    return PREFIX + kind + ':' + component(partitionKey);
  }

  function controlKey(partitionKey, sourceFileId) {
    return sourceStorageKey('control', partitionKey, sourceFileId);
  }

  function stagingKey(partitionKey, sourceFileId, generationId) {
    return sourceStorageKey('staging', partitionKey, sourceFileId, generationId);
  }

  function batchKey(partitionKey, sourceFileId, generationId, ordinal) {
    return sourceStorageKey('batch', partitionKey, sourceFileId, generationId, ordinal);
  }

  function journalKey(partitionKey, sourceFileId) {
    return sourceStorageKey('journal', partitionKey, sourceFileId);
  }

  function overlayControlKey(partitionKey, sourceFileId) {
    return sourceStorageKey('overlay-control', partitionKey, sourceFileId);
  }

  function diagnosticKey(partitionKey) {
    return partitionStorageKey('diagnostic', partitionKey);
  }

  function emptyHashes() {
    return frozenArray([]);
  }

  function makeControl(values) {
    return frozenRecord([
      ['version', VERSION],
      ['kind', 'source-control'],
      ['partitionKey', values.partitionKey],
      ['sourceFileId', values.sourceFileId],
      ['state', values.state],
      ['activeGenerationId', values.activeGenerationId || null],
      ['contentFingerprint', values.contentFingerprint || null],
      ['schemaVersion', values.schemaVersion || null],
      ['promptVersion', values.promptVersion || null],
      ['providerId', values.providerId || null],
      ['modelId', values.modelId || null],
      ['recordPageCount', values.recordPageCount || 0],
      ['relationPageCount', values.relationPageCount || 0],
      ['lexicalPageCount', values.lexicalPageCount || 0],
      ['adjacencyPageCount', values.adjacencyPageCount || 0],
      ['resultCachePageCount', values.resultCachePageCount || 0],
      ['recordPageHashes', values.recordPageHashes || emptyHashes()],
      ['relationPageHashes', values.relationPageHashes || emptyHashes()],
      ['lexicalPageHashes', values.lexicalPageHashes || emptyHashes()],
      ['adjacencyPageHashes', values.adjacencyPageHashes || emptyHashes()],
      ['resultCachePageHashes', values.resultCachePageHashes || emptyHashes()],
      ['updatedAt', values.updatedAt],
      ['reason', values.reason]
    ]);
  }

  function parseHashList(value, count) {
    var values = denseArray(value, LIMITS.MAX_PAGES_PER_CATEGORY, 0);
    if (!values || values.length !== count || values.some(function(item) {
      return !validDigest(item, 'sha256:');
    })) return null;
    return frozenArray(values);
  }

  function parseControl(corpusSchema, value) {
    var fields = exactFields(value, CONTROL_KEYS);
    if (!fields || fields.version !== VERSION || fields.kind !== 'source-control' ||
        !validPartition(corpusSchema, fields.partitionKey) || !validSourceId(fields.sourceFileId) ||
        !STATES[fields.state] || !safeInteger(fields.updatedAt, Number.MAX_SAFE_INTEGER) ||
        !FIXED_REASONS[fields.reason]) return null;
    if (!(fields.contentFingerprint === null || validFingerprint(fields.contentFingerprint)) ||
        !(fields.schemaVersion === null || (global.FsbSkopeoGraphSchema &&
          fields.schemaVersion === global.FsbSkopeoGraphSchema.VERSION)) ||
        !(fields.promptVersion === null || (global.FsbSkopeoGraphSchema &&
          fields.promptVersion === global.FsbSkopeoGraphSchema.PROMPT_VERSION)) ||
        !(fields.providerId === null || validBindingId(fields.providerId)) ||
        !(fields.modelId === null || validBindingId(fields.modelId))) return null;
    var counts = [fields.recordPageCount, fields.relationPageCount, fields.lexicalPageCount,
      fields.adjacencyPageCount, fields.resultCachePageCount];
    if (counts.some(function(count) {
      return !safeInteger(count, LIMITS.MAX_PAGES_PER_CATEGORY);
    })) return null;
    var hashes = [
      parseHashList(fields.recordPageHashes, fields.recordPageCount),
      parseHashList(fields.relationPageHashes, fields.relationPageCount),
      parseHashList(fields.lexicalPageHashes, fields.lexicalPageCount),
      parseHashList(fields.adjacencyPageHashes, fields.adjacencyPageCount),
      parseHashList(fields.resultCachePageHashes, fields.resultCachePageCount)
    ];
    if (hashes.some(function(item) { return item === null; })) return null;
    var active = fields.state === 'published';
    if (active) {
      if (!validGeneration(fields.activeGenerationId) || !validFingerprint(fields.contentFingerprint) ||
          typeof fields.schemaVersion !== 'string' || typeof fields.promptVersion !== 'string' ||
          !validBindingId(fields.providerId) || !validBindingId(fields.modelId)) return null;
    } else if (fields.activeGenerationId !== null) {
      return null;
    }
    return makeControl({
      partitionKey: fields.partitionKey,
      sourceFileId: fields.sourceFileId,
      state: fields.state,
      activeGenerationId: fields.activeGenerationId,
      contentFingerprint: fields.contentFingerprint,
      schemaVersion: fields.schemaVersion,
      promptVersion: fields.promptVersion,
      providerId: fields.providerId,
      modelId: fields.modelId,
      recordPageCount: fields.recordPageCount,
      relationPageCount: fields.relationPageCount,
      lexicalPageCount: fields.lexicalPageCount,
      adjacencyPageCount: fields.adjacencyPageCount,
      resultCachePageCount: fields.resultCachePageCount,
      recordPageHashes: hashes[0],
      relationPageHashes: hashes[1],
      lexicalPageHashes: hashes[2],
      adjacencyPageHashes: hashes[3],
      resultCachePageHashes: hashes[4],
      updatedAt: fields.updatedAt,
      reason: fields.reason
    });
  }

  function create(options) {
    var fields = exactFields(options, ['storageArea', 'graphSchema', 'corpusSchema', 'now']);
    if (!fields || !fields.storageArea || typeof fields.storageArea.get !== 'function' ||
        typeof fields.storageArea.set !== 'function' || typeof fields.storageArea.remove !== 'function' ||
        fields.graphSchema !== global.FsbSkopeoGraphSchema ||
        fields.corpusSchema !== global.FsbSkopeoCorpusSchema || typeof fields.now !== 'function') {
      throw new TypeError('Invalid Skopeo graph store dependencies');
    }

    var storage = fields.storageArea;
    var graphSchema = fields.graphSchema;
    var corpusSchema = fields.corpusSchema;
    var now = fields.now;
    var issuedMutations = new WeakMap();
    var issuedHandles = new WeakMap();
    var issuedParticipantBinders = new Set();
    var cacheOwner = null;
    var truthInvalidator = null;
    var mutationSequence = 0;
    var globalLane = Promise.resolve();

    function mutationFields(value) {
      var guard = exactFields(value, ['signal', 'operationToken', 'operationEpoch']);
      return guard && validSignal(guard.signal) && guard.operationToken &&
        typeof guard.operationToken === 'object' && safeInteger(guard.operationEpoch, Number.MAX_SAFE_INTEGER)
        ? guard : null;
    }

    function mutationRecord(value) {
      var guard = mutationFields(value);
      var record = guard ? issuedMutations.get(guard.operationToken) : null;
      return record && record.guard === value && record.signal === guard.signal &&
        record.operationEpoch === guard.operationEpoch ? record : null;
    }

    function mutationOpen(record) {
      return !!record && record.active === true && record.signal.aborted === false;
    }

    function issueMutation(signal) {
      if (!validSignal(signal) || signal.aborted) return null;
      mutationSequence += 1;
      var token = Object.freeze({});
      var guard = Object.freeze({
        signal: signal,
        operationToken: token,
        operationEpoch: mutationSequence
      });
      var record = {
        guard: guard,
        token: token,
        signal: signal,
        operationEpoch: mutationSequence,
        active: true,
        inFlight: 0,
        aborted: false,
        listener: null
      };
      record.listener = function() { record.aborted = true; };
      signal.addEventListener('abort', record.listener, { once: true });
      issuedMutations.set(token, record);
      if (signal.aborted) record.listener();
      return guard;
    }

    function finishMutation(value) {
      var record = mutationRecord(value);
      if (!record || record.inFlight !== 0) return failed('mutation-not-terminal');
      record.active = false;
      record.signal.removeEventListener('abort', record.listener);
      issuedMutations.delete(record.token);
      return ok('finished');
    }

    function operationStatus(error, mutation) {
      if (!mutationOpen(mutation) || mutation.aborted) return 'stale-operation';
      if (error && error.graphStatus) return error.graphStatus;
      var message = String(error && error.message || '');
      return /quota/i.test(message) ? 'quota-exceeded' : 'recovery-pending';
    }

    function withLane(work) {
      var run = globalLane.then(work, work);
      globalLane = run.then(function() {}, function() {});
      return run;
    }

    async function runMutation(value, work) {
      var mutation = mutationRecord(value);
      if (!mutation || !mutationOpen(mutation) || typeof work !== 'function') return failed('stale-operation');
      mutation.inFlight += 1;
      try {
        return await withLane(async function() {
          if (!mutationOpen(mutation)) throw statusError('stale-operation');
          var result = await work(mutation);
          if (!mutationOpen(mutation)) throw statusError('stale-operation');
          return result;
        });
      } catch (error) {
        return failed(operationStatus(error, mutation));
      } finally {
        mutation.inFlight -= 1;
      }
    }

    async function mutationAwait(mutation, promise) {
      if (!mutationOpen(mutation)) throw statusError('stale-operation');
      var value = await promise;
      if (!mutationOpen(mutation)) throw statusError('stale-operation');
      return value;
    }

    function validateStoredMap(value) {
      return isPlainRecord(value) ? value : null;
    }

    async function readOne(key, mutation) {
      var values = mutation
        ? await mutationAwait(mutation, storage.get(key))
        : await storage.get(key);
      values = validateStoredMap(values);
      if (!values) throw statusError('recovery-pending');
      return own(values, key) ? frozenRecord([['present', true], ['value', values[key]]])
        : frozenRecord([['present', false], ['value', null]]);
    }

    async function readAll(mutation) {
      var values = mutation
        ? await mutationAwait(mutation, storage.get(null))
        : await storage.get(null);
      values = validateStoredMap(values);
      if (!values) throw statusError('recovery-pending');
      return values;
    }

    async function writeOne(key, value, mutation) {
      var serialized;
      try {
        serialized = JSON.stringify(value);
      } catch (_error) {
        throw statusError('corrupt-staging');
      }
      if (typeof serialized !== 'string' || utf8Length(serialized) > LIMITS.MAX_VALUE_BYTES) {
        throw statusError('quota-exceeded');
      }
      var update = Object.create(null);
      update[key] = value;
      if (mutation) await mutationAwait(mutation, storage.set(update));
      else await storage.set(update);
    }

    async function removeKeys(keys, mutation) {
      var unique = Array.from(new Set(keys)).sort();
      if (unique.length === 0) return;
      if (mutation) await mutationAwait(mutation, storage.remove(unique));
      else await storage.remove(unique);
    }

    async function hash(value) {
      var digest = await graphSchema.sha256Hex(value);
      if (!validDigest(digest, 'sha256:')) throw statusError('corrupt-staging');
      return digest;
    }

    function exactSourceRequest(value, allowedKeys) {
      var input = exactFields(value, allowedKeys);
      return input && validPartition(corpusSchema, input.partitionKey) &&
        validSourceId(input.sourceFileId) ? input : null;
    }

    function parseBeginInput(value) {
      var input = exactFields(value, [
        'schemaVersion', 'promptVersion', 'partitionKey', 'sourceFileId',
        'contentFingerprint', 'providerId', 'modelId'
      ]);
      if (!input) {
        var compact = exactFields(value, [
          'partitionKey', 'sourceFileId', 'contentFingerprint', 'providerId', 'modelId'
        ]);
        if (compact) {
          compact.schemaVersion = graphSchema.VERSION;
          compact.promptVersion = graphSchema.PROMPT_VERSION;
          input = compact;
        }
      }
      if (!input || input.schemaVersion !== graphSchema.VERSION ||
          input.promptVersion !== graphSchema.PROMPT_VERSION ||
          !validPartition(corpusSchema, input.partitionKey) || !validSourceId(input.sourceFileId) ||
          !validFingerprint(input.contentFingerprint) || !validBindingId(input.providerId) ||
          !validBindingId(input.modelId)) return null;
      return input;
    }

    function makeJournal(input, generationId, operation, state, reason) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'source-journal'],
        ['partitionKey', input.partitionKey],
        ['sourceFileId', input.sourceFileId],
        ['fragmentGenerationId', generationId],
        ['operation', operation],
        ['state', state],
        ['reason', reason],
        ['updatedAt', Math.max(0, Math.floor(now()))]
      ]);
    }

    function makeStaging(input, generationId, values) {
      values = values || {};
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'staging-manifest'],
        ['partitionKey', input.partitionKey],
        ['sourceFileId', input.sourceFileId],
        ['contentFingerprint', input.contentFingerprint],
        ['fragmentGenerationId', generationId],
        ['schemaVersion', input.schemaVersion],
        ['promptVersion', input.promptVersion],
        ['providerId', input.providerId],
        ['modelId', input.modelId],
        ['state', values.state || 'open'],
        ['batchCount', values.batchCount || 0],
        ['batchHashes', values.batchHashes || emptyHashes()],
        ['recordPageCount', values.recordPageCount || 0],
        ['relationPageCount', values.relationPageCount || 0],
        ['lexicalPageCount', values.lexicalPageCount || 0],
        ['adjacencyPageCount', values.adjacencyPageCount || 0],
        ['resultCachePageCount', values.resultCachePageCount || 0],
        ['recordPageHashes', values.recordPageHashes || emptyHashes()],
        ['relationPageHashes', values.relationPageHashes || emptyHashes()],
        ['lexicalPageHashes', values.lexicalPageHashes || emptyHashes()],
        ['adjacencyPageHashes', values.adjacencyPageHashes || emptyHashes()],
        ['resultCachePageHashes', values.resultCachePageHashes || emptyHashes()]
      ]);
    }

    function parseStaging(value) {
      var input = exactFields(value, STAGING_KEYS);
      if (!input || input.version !== VERSION || input.kind !== 'staging-manifest' ||
          !validPartition(corpusSchema, input.partitionKey) || !validSourceId(input.sourceFileId) ||
          !validFingerprint(input.contentFingerprint) || !validGeneration(input.fragmentGenerationId) ||
          input.schemaVersion !== graphSchema.VERSION || input.promptVersion !== graphSchema.PROMPT_VERSION ||
          !validBindingId(input.providerId) || !validBindingId(input.modelId) ||
          (input.state !== 'open' && input.state !== 'sealed') ||
          !safeInteger(input.batchCount, LIMITS.MAX_PAGES_PER_CATEGORY)) return null;
      var batchHashes = denseArray(input.batchHashes, LIMITS.MAX_PAGES_PER_CATEGORY, input.batchCount);
      if (!batchHashes || batchHashes.length !== input.batchCount || batchHashes.some(function(item) {
        return !validDigest(item, 'sha256:');
      })) return null;
      var counts = [input.recordPageCount, input.relationPageCount, input.lexicalPageCount,
        input.adjacencyPageCount, input.resultCachePageCount];
      if (counts.some(function(count) { return !safeInteger(count, LIMITS.MAX_PAGES_PER_CATEGORY); })) return null;
      var hashes = [
        parseHashList(input.recordPageHashes, input.recordPageCount),
        parseHashList(input.relationPageHashes, input.relationPageCount),
        parseHashList(input.lexicalPageHashes, input.lexicalPageCount),
        parseHashList(input.adjacencyPageHashes, input.adjacencyPageCount),
        parseHashList(input.resultCachePageHashes, input.resultCachePageCount)
      ];
      if (hashes.some(function(item) { return item === null; })) return null;
      return makeStaging(input, input.fragmentGenerationId, {
        state: input.state,
        batchCount: input.batchCount,
        batchHashes: frozenArray(batchHashes),
        recordPageCount: input.recordPageCount,
        relationPageCount: input.relationPageCount,
        lexicalPageCount: input.lexicalPageCount,
        adjacencyPageCount: input.adjacencyPageCount,
        resultCachePageCount: input.resultCachePageCount,
        recordPageHashes: hashes[0],
        relationPageHashes: hashes[1],
        lexicalPageHashes: hashes[2],
        adjacencyPageHashes: hashes[3],
        resultCachePageHashes: hashes[4]
      });
    }

    function sameBinding(left, right) {
      return left.partitionKey === right.partitionKey && left.sourceFileId === right.sourceFileId &&
        left.contentFingerprint === right.contentFingerprint &&
        left.fragmentGenerationId === right.fragmentGenerationId &&
        left.schemaVersion === right.schemaVersion && left.promptVersion === right.promptVersion &&
        left.providerId === right.providerId && left.modelId === right.modelId;
    }

    function issueHandle(input, generationId) {
      var handle = frozenRecord([
        ['version', VERSION],
        ['status', 'staging'],
        ['partitionKey', input.partitionKey],
        ['sourceFileId', input.sourceFileId],
        ['fragmentGenerationId', generationId],
        ['providerId', input.providerId],
        ['modelId', input.modelId]
      ]);
      issuedHandles.set(handle, {
        handle: handle,
        active: true,
        partitionKey: input.partitionKey,
        sourceFileId: input.sourceFileId,
        contentFingerprint: input.contentFingerprint,
        fragmentGenerationId: generationId,
        schemaVersion: input.schemaVersion,
        promptVersion: input.promptVersion,
        providerId: input.providerId,
        modelId: input.modelId
      });
      return handle;
    }

    function handleRecord(handle) {
      var record = handle && typeof handle === 'object' ? issuedHandles.get(handle) : null;
      return record && record.handle === handle && record.active === true ? record : null;
    }

    function categoryKeyPrefixes(partitionKey, sourceFileId) {
      return [
        'staging', 'batch', 'fragment-record', 'fragment-relation', 'lexical',
        'adjacency', 'result-cache', 'overlay-relation', 'overlay-adjacency', 'overlay-control'
      ].map(function(kind) { return sourcePrefix(kind, partitionKey, sourceFileId); });
    }

    function matchesAnyPrefix(key, prefixes) {
      return prefixes.some(function(prefix) { return key.indexOf(prefix) === 0; });
    }

    async function removeSourcePayload(partitionKey, sourceFileId, mutation) {
      var values = await readAll(mutation);
      var prefixes = categoryKeyPrefixes(partitionKey, sourceFileId);
      var keys = Object.keys(values).filter(function(key) { return matchesAnyPrefix(key, prefixes); });
      await removeKeys(keys, mutation);
    }

    function cacheRequest(partitionKey, sourceFileId, reason) {
      var tuple = corpusSchema.parsePartitionKey(partitionKey);
      return Object.freeze({
        partitionKey: partitionKey,
        accountPermissionId: tuple.accountPermissionId,
        corpusRootFileId: tuple.corpusRootFileId,
        sourceFileId: sourceFileId,
        reason: reason
      });
    }

    function graphAuthorization(mutation) {
      return frozenRecord([['signal', mutation.signal], ['operationEpoch', mutation.operationEpoch]]);
    }

    function strictOk(value) {
      var result = exactFields(value, ['ok']);
      return !!result && result.ok === true;
    }

    function strictAbsent(value) {
      var result = exactFields(value, ['owned']);
      return !!result && result.owned === false;
    }

    function registerTruthInvalidator(value) {
      var adapter = exactFields(value, ['withdrawSourceChange', 'withdrawOverlayChange']);
      var frozen = false;
      try {
        frozen = Object.isFrozen(value);
      } catch (_error) {
        frozen = false;
      }
      if (truthInvalidator || !frozen || !adapter ||
          typeof adapter.withdrawSourceChange !== 'function' ||
          typeof adapter.withdrawOverlayChange !== 'function') {
        return failed('invalid-input');
      }
      truthInvalidator = Object.freeze({
        withdrawSourceChange: adapter.withdrawSourceChange,
        withdrawOverlayChange: adapter.withdrawOverlayChange
      });
      return ok('registered');
    }

    async function invokeTruthInvalidator(method, request, mutation) {
      if (!truthInvalidator) return;
      var result;
      try {
        result = truthInvalidator[method](request, mutation.signal);
      } catch (_error) {
        throw statusError('absence-proof-failed');
      }
      result = await mutationAwait(mutation, result);
      if (!strictOk(result)) throw statusError('absence-proof-failed');
    }

    async function invalidateSourceChange(values, mutation) {
      await invokeTruthInvalidator('withdrawSourceChange', Object.freeze({
        partitionKey: values.partitionKey,
        sourceFileId: values.sourceFileId,
        priorFragmentGenerationId: values.priorFragmentGenerationId,
        nextFragmentGenerationId: values.nextFragmentGenerationId,
        reason: values.reason
      }), mutation);
    }

    function overlaySourceUnion(proposingSourceFileId, previous, targets) {
      var sourceIds = [proposingSourceFileId];
      if (previous) {
        previous.targetGenerations.forEach(function(target) {
          sourceIds.push(target.sourceFileId);
        });
      }
      targets.forEach(function(target) { sourceIds.push(target.sourceFileId); });
      return frozenArray(Array.from(new Set(sourceIds)).sort());
    }

    async function invalidateOverlayChange(values, mutation) {
      await invokeTruthInvalidator('withdrawOverlayChange', Object.freeze({
        partitionKey: values.partitionKey,
        proposingSourceFileId: values.proposingSourceFileId,
        affectedSourceFileIds: values.affectedSourceFileIds,
        priorOverlayGenerationId: values.priorOverlayGenerationId,
        nextOverlayGenerationId: values.nextOverlayGenerationId,
        reason: values.reason
      }), mutation);
    }

    async function purgeCacheForRequest(request, mutation) {
      if (!cacheOwner) return;
      var authorization = graphAuthorization(mutation);
      var result = request.sourceFileId === null
        ? await mutationAwait(mutation, cacheOwner.purgePartition(request, authorization))
        : await mutationAwait(mutation, cacheOwner.purgeSource(request, authorization));
      if (!strictOk(result)) throw statusError('absence-proof-failed');
      var absent = await mutationAwait(mutation, cacheOwner.hasOwnedInfluence(request, authorization));
      if (!strictAbsent(absent)) throw statusError('absence-proof-failed');
    }

    async function sourcePayloadAbsent(partitionKey, sourceFileId, mutation) {
      var values = await readAll(mutation);
      var prefixes = categoryKeyPrefixes(partitionKey, sourceFileId);
      return !Object.keys(values).some(function(key) { return matchesAnyPrefix(key, prefixes); });
    }

    async function beginReplacement(value, mutationGuard) {
      var input = parseBeginInput(value);
      if (!input) return failed('corrupt-staging');
      return runMutation(mutationGuard, async function(mutation) {
        var generationId = await graphSchema.deriveFragmentGenerationId({
          schemaVersion: graphSchema.VERSION,
          partitionKey: input.partitionKey,
          sourceFileId: input.sourceFileId,
          contentFingerprint: input.contentFingerprint
        });
        if (!mutationOpen(mutation) || !validGeneration(generationId)) throw statusError('stale-operation');
        var currentEntry = await readOne(controlKey(input.partitionKey, input.sourceFileId), mutation);
        var current = currentEntry.present ? parseControl(corpusSchema, currentEntry.value) : null;
        if (current && current.state === 'published' &&
            current.activeGenerationId === generationId &&
            current.contentFingerprint === input.contentFingerprint &&
            current.schemaVersion === input.schemaVersion && current.promptVersion === input.promptVersion &&
            current.providerId === input.providerId && current.modelId === input.modelId) {
          var validCurrent = await readCurrentFragmentInternal({
            partitionKey: input.partitionKey,
            sourceFileId: input.sourceFileId,
            fragmentGenerationId: generationId
          }, mutation);
          if (validCurrent) {
            return frozenRecord([
              ['ok', true], ['status', 'current'], ['fragmentGenerationId', generationId]
            ]);
          }
        }

        await invalidateSourceChange({
          partitionKey: input.partitionKey,
          sourceFileId: input.sourceFileId,
          priorFragmentGenerationId: current && current.state === 'published'
            ? current.activeGenerationId : null,
          nextFragmentGenerationId: generationId,
          reason: 'user-withdrawn'
        }, mutation);
        var timestamp = Math.max(0, Math.floor(now()));
        await writeOne(controlKey(input.partitionKey, input.sourceFileId), makeControl({
          partitionKey: input.partitionKey,
          sourceFileId: input.sourceFileId,
          state: 'purging',
          contentFingerprint: input.contentFingerprint,
          schemaVersion: input.schemaVersion,
          promptVersion: input.promptVersion,
          providerId: input.providerId,
          modelId: input.modelId,
          updatedAt: timestamp,
          reason: 'user-withdrawn'
        }), mutation);
        await writeOne(journalKey(input.partitionKey, input.sourceFileId),
          makeJournal(input, generationId, 'replacement', 'purging', 'user-withdrawn'), mutation);
        await removeSourcePayload(input.partitionKey, input.sourceFileId, mutation);
        await removeKeys([diagnosticKey(input.partitionKey)], mutation);
        await purgeCacheForRequest(cacheRequest(input.partitionKey, input.sourceFileId, 'user-withdrawn'), mutation);
        if (!await sourcePayloadAbsent(input.partitionKey, input.sourceFileId, mutation)) {
          throw statusError('absence-proof-failed');
        }
        await writeOne(controlKey(input.partitionKey, input.sourceFileId), makeControl({
          partitionKey: input.partitionKey,
          sourceFileId: input.sourceFileId,
          state: 'withheld',
          contentFingerprint: input.contentFingerprint,
          schemaVersion: input.schemaVersion,
          promptVersion: input.promptVersion,
          providerId: input.providerId,
          modelId: input.modelId,
          updatedAt: timestamp,
          reason: 'complete'
        }), mutation);
        var manifest = makeStaging(input, generationId);
        await writeOne(stagingKey(input.partitionKey, input.sourceFileId, generationId), manifest, mutation);
        await writeOne(controlKey(input.partitionKey, input.sourceFileId), makeControl({
          partitionKey: input.partitionKey,
          sourceFileId: input.sourceFileId,
          state: 'staging',
          contentFingerprint: input.contentFingerprint,
          schemaVersion: input.schemaVersion,
          promptVersion: input.promptVersion,
          providerId: input.providerId,
          modelId: input.modelId,
          updatedAt: timestamp,
          reason: 'complete'
        }), mutation);
        return issueHandle(input, generationId);
      });
    }

    function parseBatchInput(value, record) {
      var input = exactFields(value, BATCH_INPUT_KEYS);
      var records = input && denseArray(input.records, 128, 0);
      var relations = input && denseArray(input.relations, 256, 0);
      if (!input || !records || !relations || !sameBinding(input, record) ||
          !safeInteger(input.batchOrdinal, LIMITS.MAX_PAGES_PER_CATEGORY - 1)) return null;
      var recordIds = [];
      var relationIds = [];
      var seenRecords = Object.create(null);
      var seenRelations = Object.create(null);
      for (var index = 0; index < records.length; index += 1) {
        var item = exactFields(records[index], [
          'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint',
          'fragmentGenerationId', 'kind', 'label', 'evidence', 'stableRecordId', 'recordVersionId'
        ]);
        if (!item || item.schemaVersion !== graphSchema.VERSION ||
            item.partitionKey !== record.partitionKey || item.sourceFileId !== record.sourceFileId ||
            item.contentFingerprint !== record.contentFingerprint ||
            item.fragmentGenerationId !== record.fragmentGenerationId ||
            !validDigest(item.stableRecordId, 'sri1:') || !validDigest(item.recordVersionId, 'srv1:') ||
            own(seenRecords, item.recordVersionId)) return null;
        seenRecords[item.recordVersionId] = true;
        recordIds.push(item.recordVersionId);
      }
      for (var relationIndex = 0; relationIndex < relations.length; relationIndex += 1) {
        var relation = exactFields(relations[relationIndex], [
          'schemaVersion', 'relationClass', 'partitionKey', 'sourceFileId',
          'fragmentGenerationId', 'predicate', 'fromStableRecordId', 'fromRecordVersionId',
          'toStableRecordId', 'toRecordVersionId', 'evidence', 'stableRelationId', 'relationVersionId'
        ]);
        if (!relation || relation.schemaVersion !== graphSchema.VERSION || relation.relationClass !== 'local' ||
            relation.partitionKey !== record.partitionKey || relation.sourceFileId !== record.sourceFileId ||
            relation.fragmentGenerationId !== record.fragmentGenerationId ||
            !validDigest(relation.relationVersionId, 'slv1:') ||
            own(seenRelations, relation.relationVersionId)) return null;
        seenRelations[relation.relationVersionId] = true;
        relationIds.push(relation.relationVersionId);
      }
      recordIds.sort();
      relationIds.sort();
      return {
        input: input,
        recordVersionIds: recordIds,
        relationVersionIds: relationIds
      };
    }

    function parseBatchRecord(value, expected) {
      var input = exactFields(value, BATCH_RECORD_KEYS);
      var recordIds = input && denseArray(input.recordVersionIds, 128, 0);
      var relationIds = input && denseArray(input.relationVersionIds, 256, 0);
      if (!input || input.version !== VERSION || input.kind !== 'staged-batch' ||
          !recordIds || !relationIds || !sameBinding(input, expected) ||
          !safeInteger(input.batchOrdinal, LIMITS.MAX_PAGES_PER_CATEGORY - 1) ||
          !validDigest(input.batchHash, 'sha256:') ||
          recordIds.some(function(id) { return !validDigest(id, 'srv1:'); }) ||
          relationIds.some(function(id) { return !validDigest(id, 'slv1:'); })) return null;
      return input;
    }

    async function stageBatch(handle, value, mutationGuard) {
      var record = handleRecord(handle);
      var raw = record ? exactFields(value, BATCH_INPUT_KEYS) : null;
      if (record && raw && (raw.providerId !== record.providerId || raw.modelId !== record.modelId)) {
        return failed('provider-binding-changed');
      }
      var parsed = record ? parseBatchInput(value, record) : null;
      if (!record || !parsed) return failed('corrupt-staging');
      return runMutation(mutationGuard, async function(mutation) {
        var manifestEntry = await readOne(stagingKey(
          record.partitionKey, record.sourceFileId, record.fragmentGenerationId), mutation);
        var manifest = manifestEntry.present ? parseStaging(manifestEntry.value) : null;
        if (!manifest || manifest.state !== 'open' || !sameBinding(manifest, record) ||
            parsed.input.batchOrdinal !== manifest.batchCount) throw statusError('corrupt-staging');
        var controlEntry = await readOne(controlKey(record.partitionKey, record.sourceFileId), mutation);
        var control = controlEntry.present ? parseControl(corpusSchema, controlEntry.value) : null;
        if (!control || control.state !== 'staging' || control.providerId !== record.providerId ||
            control.modelId !== record.modelId || control.contentFingerprint !== record.contentFingerprint) {
          throw statusError('provider-binding-changed');
        }
        var batchHash = await hash(parsed.input);
        if (!mutationOpen(mutation)) throw statusError('stale-operation');
        var durable = frozenRecord([
          ['version', VERSION], ['kind', 'staged-batch'],
          ['partitionKey', record.partitionKey], ['sourceFileId', record.sourceFileId],
          ['contentFingerprint', record.contentFingerprint],
          ['fragmentGenerationId', record.fragmentGenerationId],
          ['schemaVersion', record.schemaVersion], ['promptVersion', record.promptVersion],
          ['providerId', record.providerId], ['modelId', record.modelId],
          ['batchOrdinal', parsed.input.batchOrdinal],
          ['recordVersionIds', frozenArray(parsed.recordVersionIds)],
          ['relationVersionIds', frozenArray(parsed.relationVersionIds)],
          ['batchHash', batchHash]
        ]);
        await writeOne(batchKey(record.partitionKey, record.sourceFileId,
          record.fragmentGenerationId, parsed.input.batchOrdinal), durable, mutation);
        var hashes = Array.from(manifest.batchHashes);
        hashes.push(batchHash);
        await writeOne(stagingKey(record.partitionKey, record.sourceFileId, record.fragmentGenerationId),
          makeStaging(record, record.fragmentGenerationId, {
            state: 'open', batchCount: manifest.batchCount + 1,
            batchHashes: frozenArray(hashes)
          }), mutation);
        return ok('staged');
      });
    }

    function splitPages(values, maximum) {
      var pages = [];
      for (var index = 0; index < values.length; index += maximum) {
        pages.push(values.slice(index, index + maximum));
      }
      if (pages.length > LIMITS.MAX_PAGES_PER_CATEGORY) return null;
      return pages;
    }

    function makeItemPage(kind, record, items, ordinal, count) {
      return frozenRecord([
        ['version', VERSION], ['kind', kind],
        ['partitionKey', record.partitionKey], ['sourceFileId', record.sourceFileId],
        ['fragmentGenerationId', record.fragmentGenerationId],
        ['pageOrdinal', ordinal], ['pageCount', count], ['items', frozenArray(items)]
      ]);
    }

    function makeShardPage(kind, record, shard, ordinal, count) {
      return frozenRecord([
        ['version', VERSION], ['kind', kind],
        ['partitionKey', record.partitionKey], ['sourceFileId', record.sourceFileId],
        ['fragmentGenerationId', record.fragmentGenerationId],
        ['pageOrdinal', ordinal], ['pageCount', count], ['shard', shard]
      ]);
    }

    function parseItemPage(value, kind, expected, ordinal, count, maximum) {
      var page = exactFields(value, PAGE_KEYS);
      var items = page && denseArray(page.items, maximum, 0);
      if (!page || !items || page.version !== VERSION || page.kind !== kind ||
          page.partitionKey !== expected.partitionKey || page.sourceFileId !== expected.sourceFileId ||
          page.fragmentGenerationId !== expected.fragmentGenerationId ||
          page.pageOrdinal !== ordinal || page.pageCount !== count) return null;
      return page;
    }

    function parseShardPage(value, kind, expected, ordinal, count) {
      var page = exactFields(value, SHARD_PAGE_KEYS);
      if (!page || page.version !== VERSION || page.kind !== kind ||
          page.partitionKey !== expected.partitionKey || page.sourceFileId !== expected.sourceFileId ||
          page.fragmentGenerationId !== expected.fragmentGenerationId ||
          page.pageOrdinal !== ordinal || page.pageCount !== count) return null;
      return page;
    }

    function parseResultCacheShard(value, expected) {
      var fields = exactFields(value, RESULT_SHARD_KEYS);
      var entries = fields && denseArray(fields.entries, 512, 0);
      if (!fields || !entries || !safeInteger(fields.shardOrdinal, LIMITS.MAX_PAGES_PER_CATEGORY - 1)) return null;
      var parsed = [];
      var seen = Object.create(null);
      for (var index = 0; index < entries.length; index += 1) {
        var entry = exactFields(entries[index], RESULT_ENTRY_KEYS);
        var ids = entry && denseArray(entry.stableRecordIds, 256, 0);
        if (!entry || !ids || !validDigest(entry.queryDigest, 'sha256:') ||
            own(seen, entry.queryDigest) || ids.some(function(id) {
              return !validDigest(id, 'sri1:') || !own(expected.stableRecords, id);
            })) return null;
        seen[entry.queryDigest] = true;
        parsed.push(frozenRecord([
          ['queryDigest', entry.queryDigest], ['stableRecordIds', frozenArray(ids.slice().sort())]
        ]));
      }
      parsed.sort(function(left, right) { return left.queryDigest.localeCompare(right.queryDigest); });
      return frozenRecord([['shardOrdinal', fields.shardOrdinal], ['entries', frozenArray(parsed)]]);
    }

    async function persistPages(kind, pages, record, mutation, shardMode) {
      var hashes = [];
      for (var index = 0; index < pages.length; index += 1) {
        var page = shardMode
          ? makeShardPage(kind, record, pages[index], index, pages.length)
          : makeItemPage(kind, record, pages[index], index, pages.length);
        var digest = await hash(page);
        if (!mutationOpen(mutation)) throw statusError('stale-operation');
        await writeOne(sourceStorageKey(kind, record.partitionKey, record.sourceFileId,
          record.fragmentGenerationId, index), page, mutation);
        hashes.push(digest);
      }
      return frozenArray(hashes);
    }

    function sameSorted(left, right) {
      if (left.length !== right.length) return false;
      var leftSorted = left.slice().sort();
      var rightSorted = right.slice().sort();
      for (var index = 0; index < leftSorted.length; index += 1) {
        if (leftSorted[index] !== rightSorted[index]) return false;
      }
      return true;
    }

    async function sealStaging(handle, value, mutationGuard) {
      var record = handleRecord(handle);
      var payload = exactFields(value, [
        'fragment', 'lexicalShards', 'adjacencyShards', 'resultCacheShards'
      ]);
      if (!record || !payload) return failed('corrupt-staging');
      return runMutation(mutationGuard, async function(mutation) {
        var fragment = await graphSchema.parseFragment(payload.fragment);
        if (fragment && (fragment.providerId !== record.providerId || fragment.modelId !== record.modelId)) {
          throw statusError('provider-binding-changed');
        }
        if (!mutationOpen(mutation) || !fragment || !sameBinding(fragment, record)) {
          throw statusError('corrupt-staging');
        }
        var lexicalInputs = denseArray(payload.lexicalShards, LIMITS.MAX_PAGES_PER_CATEGORY, 0);
        var adjacencyInputs = denseArray(payload.adjacencyShards, LIMITS.MAX_PAGES_PER_CATEGORY, 0);
        var resultInputs = denseArray(payload.resultCacheShards, LIMITS.MAX_PAGES_PER_CATEGORY, 0);
        if (!lexicalInputs || !adjacencyInputs || !resultInputs) throw statusError('corrupt-staging');

        var stableRecords = Object.create(null);
        var versionRecords = Object.create(null);
        var relationVersions = Object.create(null);
        fragment.records.forEach(function(item) {
          stableRecords[item.stableRecordId] = item;
          versionRecords[item.recordVersionId] = item;
        });
        fragment.relations.forEach(function(item) { relationVersions[item.relationVersionId] = item; });

        var lexical = [];
        var indexedRecords = Object.create(null);
        var seenLexicalOrdinals = Object.create(null);
        for (var lexicalIndex = 0; lexicalIndex < lexicalInputs.length; lexicalIndex += 1) {
          var lexicalShard = graphSchema.parseLexicalShard(lexicalInputs[lexicalIndex]);
          if (!lexicalShard || lexicalShard.partitionKey !== record.partitionKey ||
              lexicalShard.sourceFileId !== record.sourceFileId ||
              lexicalShard.fragmentGenerationId !== record.fragmentGenerationId ||
              own(seenLexicalOrdinals, lexicalShard.shardOrdinal) ||
              lexicalShard.postings.some(function(posting) {
                var ownedRecord = stableRecords[posting.stableRecordId];
                if (!ownedRecord || ownedRecord.recordVersionId !== posting.recordVersionId) return true;
                indexedRecords[posting.stableRecordId] = true;
                return false;
              })) throw statusError('corrupt-staging');
          seenLexicalOrdinals[lexicalShard.shardOrdinal] = true;
          lexical.push(lexicalShard);
        }
        lexical.sort(function(left, right) { return left.shardOrdinal - right.shardOrdinal; });
        if (lexical.some(function(item, index) { return item.shardOrdinal !== index; })) {
          throw statusError('corrupt-staging');
        }
        if (Object.keys(stableRecords).some(function(stableRecordId) {
          return !own(indexedRecords, stableRecordId);
        })) throw statusError('corrupt-staging');

        var adjacency = [];
        var seenAdjacencyOrdinals = Object.create(null);
        var adjacencyCoverage = Object.create(null);
        for (var adjacencyIndex = 0; adjacencyIndex < adjacencyInputs.length; adjacencyIndex += 1) {
          var adjacencyShard = graphSchema.parseAdjacencyShard(adjacencyInputs[adjacencyIndex]);
          if (!adjacencyShard || adjacencyShard.partitionKey !== record.partitionKey ||
              adjacencyShard.sourceFileId !== record.sourceFileId ||
              adjacencyShard.fragmentGenerationId !== record.fragmentGenerationId ||
              own(seenAdjacencyOrdinals, adjacencyShard.shardOrdinal) ||
              adjacencyShard.entries.some(function(entry) {
                var relation = relationVersions[entry.relationVersionId];
                if (!own(stableRecords, entry.stableRecordId) || !relation) return true;
                var expectedStable = entry.direction === 'out'
                  ? relation.fromStableRecordId : relation.toStableRecordId;
                if (entry.stableRecordId !== expectedStable) return true;
                adjacencyCoverage[entry.relationVersionId + '\u0000' + entry.direction] = true;
                return false;
              })) throw statusError('corrupt-staging');
          seenAdjacencyOrdinals[adjacencyShard.shardOrdinal] = true;
          adjacency.push(adjacencyShard);
        }
        adjacency.sort(function(left, right) { return left.shardOrdinal - right.shardOrdinal; });
        if (adjacency.some(function(item, index) { return item.shardOrdinal !== index; })) {
          throw statusError('corrupt-staging');
        }
        if (Object.keys(relationVersions).some(function(relationVersionId) {
          return !own(adjacencyCoverage, relationVersionId + '\u0000out') ||
            !own(adjacencyCoverage, relationVersionId + '\u0000in');
        })) throw statusError('corrupt-staging');

        var resultCache = [];
        var seenResultOrdinals = Object.create(null);
        for (var resultIndex = 0; resultIndex < resultInputs.length; resultIndex += 1) {
          var resultShard = parseResultCacheShard(resultInputs[resultIndex], {
            stableRecords: stableRecords
          });
          if (!resultShard || own(seenResultOrdinals, resultShard.shardOrdinal)) {
            throw statusError('corrupt-staging');
          }
          seenResultOrdinals[resultShard.shardOrdinal] = true;
          resultCache.push(resultShard);
        }
        resultCache.sort(function(left, right) { return left.shardOrdinal - right.shardOrdinal; });
        if (resultCache.some(function(item, index) { return item.shardOrdinal !== index; })) {
          throw statusError('corrupt-staging');
        }

        var manifestEntry = await readOne(stagingKey(
          record.partitionKey, record.sourceFileId, record.fragmentGenerationId), mutation);
        var manifest = manifestEntry.present ? parseStaging(manifestEntry.value) : null;
        if (!manifest || manifest.state !== 'open' || !sameBinding(manifest, record)) {
          throw statusError('corrupt-staging');
        }
        var stagedRecordIds = [];
        var stagedRelationIds = [];
        var seenStagedRecords = Object.create(null);
        var seenStagedRelations = Object.create(null);
        for (var batchOrdinal = 0; batchOrdinal < manifest.batchCount; batchOrdinal += 1) {
          var batchEntry = await readOne(batchKey(record.partitionKey, record.sourceFileId,
            record.fragmentGenerationId, batchOrdinal), mutation);
          var batch = batchEntry.present ? parseBatchRecord(batchEntry.value, record) : null;
          if (!batch || batch.batchOrdinal !== batchOrdinal ||
              batch.batchHash !== manifest.batchHashes[batchOrdinal]) throw statusError('corrupt-staging');
          for (var batchRecordIndex = 0; batchRecordIndex < batch.recordVersionIds.length; batchRecordIndex += 1) {
            var recordId = batch.recordVersionIds[batchRecordIndex];
            if (own(seenStagedRecords, recordId)) throw statusError('corrupt-staging');
            seenStagedRecords[recordId] = true;
            stagedRecordIds.push(recordId);
          }
          for (var batchRelationIndex = 0; batchRelationIndex < batch.relationVersionIds.length;
            batchRelationIndex += 1) {
            var relationId = batch.relationVersionIds[batchRelationIndex];
            if (own(seenStagedRelations, relationId)) throw statusError('corrupt-staging');
            seenStagedRelations[relationId] = true;
            stagedRelationIds.push(relationId);
          }
        }
        if (!sameSorted(stagedRecordIds, Object.keys(versionRecords)) ||
            !sameSorted(stagedRelationIds, Object.keys(relationVersions))) {
          throw statusError('corrupt-staging');
        }

        var sortedRecords = Array.from(fragment.records).sort(function(left, right) {
          return left.stableRecordId.localeCompare(right.stableRecordId);
        });
        var sortedRelations = Array.from(fragment.relations).sort(function(left, right) {
          return left.relationVersionId.localeCompare(right.relationVersionId);
        });
        var recordPages = splitPages(sortedRecords, LIMITS.MAX_RECORDS_PER_PAGE);
        var relationPages = splitPages(sortedRelations, LIMITS.MAX_RELATIONS_PER_PAGE);
        if (!recordPages || !relationPages) throw statusError('quota-exceeded');
        var recordHashes = await persistPages('fragment-record', recordPages, record, mutation, false);
        var relationHashes = await persistPages('fragment-relation', relationPages, record, mutation, false);
        var lexicalHashes = await persistPages('lexical', lexical, record, mutation, true);
        var adjacencyHashes = await persistPages('adjacency', adjacency, record, mutation, true);
        var resultHashes = await persistPages('result-cache', resultCache, record, mutation, true);

        var sealed = makeStaging(record, record.fragmentGenerationId, {
          state: 'sealed', batchCount: manifest.batchCount,
          batchHashes: manifest.batchHashes,
          recordPageCount: recordPages.length, relationPageCount: relationPages.length,
          lexicalPageCount: lexical.length, adjacencyPageCount: adjacency.length,
          resultCachePageCount: resultCache.length,
          recordPageHashes: recordHashes, relationPageHashes: relationHashes,
          lexicalPageHashes: lexicalHashes, adjacencyPageHashes: adjacencyHashes,
          resultCachePageHashes: resultHashes
        });
        await writeOne(stagingKey(record.partitionKey, record.sourceFileId, record.fragmentGenerationId),
          sealed, mutation);
        return ok('sealed');
      });
    }

    async function readSeries(expected, kind, count, hashes, maximum, mutation, shardMode) {
      var output = [];
      for (var ordinal = 0; ordinal < count; ordinal += 1) {
        var key = sourceStorageKey(kind, expected.partitionKey, expected.sourceFileId,
          expected.fragmentGenerationId, ordinal);
        var entry = await readOne(key, mutation);
        var page = entry.present
          ? (shardMode
            ? parseShardPage(entry.value, kind, expected, ordinal, count)
            : parseItemPage(entry.value, kind, expected, ordinal, count, maximum))
          : null;
        if (!page || await hash(page) !== hashes[ordinal]) return null;
        if (shardMode) output.push(page.shard);
        else output = output.concat(Array.from(page.items));
      }
      return output;
    }

    async function readFragmentFromControl(control, mutation) {
      if (!control || control.state !== 'published') return null;
      var expected = {
        partitionKey: control.partitionKey,
        sourceFileId: control.sourceFileId,
        fragmentGenerationId: control.activeGenerationId
      };
      var records = await readSeries(expected, 'fragment-record', control.recordPageCount,
        control.recordPageHashes, LIMITS.MAX_RECORDS_PER_PAGE, mutation, false);
      var relations = records && await readSeries(expected, 'fragment-relation', control.relationPageCount,
        control.relationPageHashes, LIMITS.MAX_RELATIONS_PER_PAGE, mutation, false);
      if (!records || !relations) return null;
      return graphSchema.parseFragment({
        schemaVersion: control.schemaVersion,
        promptVersion: control.promptVersion,
        partitionKey: control.partitionKey,
        sourceFileId: control.sourceFileId,
        contentFingerprint: control.contentFingerprint,
        fragmentGenerationId: control.activeGenerationId,
        providerId: control.providerId,
        modelId: control.modelId,
        records: records,
        relations: relations
      });
    }

    async function readCurrentFragmentInternal(input, mutation) {
      var entry = await readOne(controlKey(input.partitionKey, input.sourceFileId), mutation);
      var control = entry.present ? parseControl(corpusSchema, entry.value) : null;
      if (!control || control.state !== 'published' ||
          control.activeGenerationId !== input.fragmentGenerationId) return null;
      return readFragmentFromControl(control, mutation);
    }

    async function publishReplacement(handle, mutationGuard) {
      var record = handleRecord(handle);
      if (!record) return failed('corrupt-staging');
      return runMutation(mutationGuard, async function(mutation) {
        var manifestEntry = await readOne(stagingKey(
          record.partitionKey, record.sourceFileId, record.fragmentGenerationId), mutation);
        var manifest = manifestEntry.present ? parseStaging(manifestEntry.value) : null;
        if (!manifest || manifest.state !== 'sealed' || !sameBinding(manifest, record)) {
          throw statusError('corrupt-staging');
        }
        var controlEntry = await readOne(controlKey(record.partitionKey, record.sourceFileId), mutation);
        var control = controlEntry.present ? parseControl(corpusSchema, controlEntry.value) : null;
        if (!control || control.state !== 'staging') throw statusError('corrupt-staging');
        if (control.providerId !== record.providerId || control.modelId !== record.modelId ||
            control.contentFingerprint !== record.contentFingerprint) {
          throw statusError('provider-binding-changed');
        }
        var provisional = makeControl({
          partitionKey: record.partitionKey,
          sourceFileId: record.sourceFileId,
          state: 'published',
          activeGenerationId: record.fragmentGenerationId,
          contentFingerprint: record.contentFingerprint,
          schemaVersion: record.schemaVersion,
          promptVersion: record.promptVersion,
          providerId: record.providerId,
          modelId: record.modelId,
          recordPageCount: manifest.recordPageCount,
          relationPageCount: manifest.relationPageCount,
          lexicalPageCount: manifest.lexicalPageCount,
          adjacencyPageCount: manifest.adjacencyPageCount,
          resultCachePageCount: manifest.resultCachePageCount,
          recordPageHashes: manifest.recordPageHashes,
          relationPageHashes: manifest.relationPageHashes,
          lexicalPageHashes: manifest.lexicalPageHashes,
          adjacencyPageHashes: manifest.adjacencyPageHashes,
          resultCachePageHashes: manifest.resultCachePageHashes,
          updatedAt: Math.max(0, Math.floor(now())),
          reason: 'complete'
        });
        if (!await readFragmentFromControl(provisional, mutation)) throw statusError('corrupt-staging');
        var cleanup = [
          stagingKey(record.partitionKey, record.sourceFileId, record.fragmentGenerationId),
          journalKey(record.partitionKey, record.sourceFileId)
        ];
        for (var ordinal = 0; ordinal < manifest.batchCount; ordinal += 1) {
          cleanup.push(batchKey(record.partitionKey, record.sourceFileId, record.fragmentGenerationId, ordinal));
        }
        await removeKeys(cleanup, mutation);
        await writeOne(controlKey(record.partitionKey, record.sourceFileId), provisional, mutation);
        record.active = false;
        issuedHandles.delete(handle);
        return ok('published');
      });
    }

    async function readCurrentFragment(value) {
      var input = exactSourceRequest(value, ['partitionKey', 'sourceFileId', 'fragmentGenerationId']);
      if (!input || !validGeneration(input.fragmentGenerationId)) return null;
      try {
        return await readCurrentFragmentInternal(input, null);
      } catch (_error) {
        return null;
      }
    }

    function parseTargetGenerations(value) {
      var values = denseArray(value, 31, 0);
      if (!values) return null;
      var output = [];
      var seen = Object.create(null);
      for (var index = 0; index < values.length; index += 1) {
        var target = exactFields(values[index], ['sourceFileId', 'fragmentGenerationId']);
        if (!target || !validSourceId(target.sourceFileId) ||
            !validGeneration(target.fragmentGenerationId) || own(seen, target.sourceFileId)) return null;
        seen[target.sourceFileId] = true;
        output.push(frozenRecord([
          ['sourceFileId', target.sourceFileId],
          ['fragmentGenerationId', target.fragmentGenerationId]
        ]));
      }
      output.sort(function(left, right) { return left.sourceFileId.localeCompare(right.sourceFileId); });
      return frozenArray(output);
    }

    function parseOverlayControl(value) {
      var input = exactFields(value, OVERLAY_CONTROL_KEYS);
      var targets = input && parseTargetGenerations(input.targetGenerations);
      if (!input || !targets || input.version !== VERSION || input.kind !== 'candidate-overlay-control' ||
          !validPartition(corpusSchema, input.partitionKey) ||
          !validSourceId(input.proposingSourceFileId) ||
          !validGeneration(input.proposingFragmentGenerationId) ||
          !validDigest(input.overlayGenerationId, 'sog1:') ||
          !safeInteger(input.relationPageCount, LIMITS.MAX_PAGES_PER_CATEGORY) ||
          !safeInteger(input.adjacencyPageCount, LIMITS.MAX_PAGES_PER_CATEGORY) ||
          !safeInteger(input.updatedAt, Number.MAX_SAFE_INTEGER)) return null;
      var relationHashes = parseHashList(input.relationPageHashes, input.relationPageCount);
      var adjacencyHashes = parseHashList(input.adjacencyPageHashes, input.adjacencyPageCount);
      if (!relationHashes || !adjacencyHashes) return null;
      return frozenRecord([
        ['version', VERSION], ['kind', 'candidate-overlay-control'],
        ['partitionKey', input.partitionKey],
        ['proposingSourceFileId', input.proposingSourceFileId],
        ['proposingFragmentGenerationId', input.proposingFragmentGenerationId],
        ['overlayGenerationId', input.overlayGenerationId],
        ['targetGenerations', targets],
        ['relationPageCount', input.relationPageCount],
        ['adjacencyPageCount', input.adjacencyPageCount],
        ['relationPageHashes', relationHashes],
        ['adjacencyPageHashes', adjacencyHashes],
        ['updatedAt', input.updatedAt]
      ]);
    }

    function makeOverlayPage(kind, input, items, ordinal, count) {
      return frozenRecord([
        ['version', VERSION], ['kind', kind], ['partitionKey', input.partitionKey],
        ['proposingSourceFileId', input.proposingSourceFileId],
        ['proposingFragmentGenerationId', input.proposingFragmentGenerationId],
        ['overlayGenerationId', input.overlayGenerationId],
        ['pageOrdinal', ordinal], ['pageCount', count], ['items', frozenArray(items)]
      ]);
    }

    function parseOverlayPage(value, kind, expected, ordinal, count, maximum) {
      var page = exactFields(value, OVERLAY_PAGE_KEYS);
      var items = page && denseArray(page.items, maximum, 0);
      if (!page || !items || page.version !== VERSION || page.kind !== kind ||
          page.partitionKey !== expected.partitionKey ||
          page.proposingSourceFileId !== expected.proposingSourceFileId ||
          page.proposingFragmentGenerationId !== expected.proposingFragmentGenerationId ||
          page.overlayGenerationId !== expected.overlayGenerationId ||
          page.pageOrdinal !== ordinal || page.pageCount !== count) return null;
      return page;
    }

    async function clearOverlay(partitionKey, sourceFileId, mutation) {
      var keys = [overlayControlKey(partitionKey, sourceFileId)];
      for (var ordinal = 0; ordinal < LIMITS.MAX_PAGES_PER_CATEGORY; ordinal += 1) {
        keys.push(sourceStorageKey('overlay-relation', partitionKey, sourceFileId, null, ordinal));
        keys.push(sourceStorageKey('overlay-adjacency', partitionKey, sourceFileId, null, ordinal));
      }
      await removeKeys(keys, mutation);
    }

    async function priorOverlayControl(partitionKey, sourceFileId, mutation) {
      var entry = await readOne(overlayControlKey(partitionKey, sourceFileId), mutation);
      if (!entry.present) return null;
      var control = parseOverlayControl(entry.value);
      if (!control || control.partitionKey !== partitionKey ||
          control.proposingSourceFileId !== sourceFileId) {
        throw statusError('recovery-pending');
      }
      return control;
    }

    async function persistOverlayPages(kind, pages, input, mutation) {
      var hashes = [];
      for (var index = 0; index < pages.length; index += 1) {
        var page = makeOverlayPage(kind, input, pages[index], index, pages.length);
        var digest = await hash(page);
        if (!mutationOpen(mutation)) throw statusError('stale-operation');
        await writeOne(sourceStorageKey(kind, input.partitionKey,
          input.proposingSourceFileId, null, index), page, mutation);
        hashes.push(digest);
      }
      return frozenArray(hashes);
    }

    async function currentControl(partitionKey, sourceFileId, mutation) {
      var entry = await readOne(controlKey(partitionKey, sourceFileId), mutation);
      var control = entry.present ? parseControl(corpusSchema, entry.value) : null;
      return control && control.state === 'published' ? control : null;
    }

    async function replaceCandidateRelations(value, mutationGuard) {
      var base = exactFields(value, [
        'schemaVersion', 'partitionKey', 'proposingSourceFileId',
        'proposingFragmentGenerationId', 'targetGenerations', 'relations'
      ]);
      var withId = base ? null : exactFields(value, [
        'schemaVersion', 'partitionKey', 'proposingSourceFileId',
        'proposingFragmentGenerationId', 'targetGenerations', 'relations',
        'overlayGenerationId'
      ]);
      var input = base || withId;
      var targets = input && parseTargetGenerations(input.targetGenerations);
      var relations = input && denseArray(input.relations, 2048, 0);
      if (!input || !targets || !relations || input.schemaVersion !== graphSchema.VERSION ||
          !validPartition(corpusSchema, input.partitionKey) ||
          !validSourceId(input.proposingSourceFileId) ||
          !validGeneration(input.proposingFragmentGenerationId)) return failed('corrupt-staging');

      if (relations.length === 0) {
        if (targets.length !== 0 || (withId && withId.overlayGenerationId !== null)) {
          return failed('corrupt-staging');
        }
        return runMutation(mutationGuard, async function(mutation) {
          var proposer = await currentControl(
            input.partitionKey, input.proposingSourceFileId, mutation);
          if (!proposer || proposer.activeGenerationId !== input.proposingFragmentGenerationId) {
            throw statusError('stale-operation');
          }
          var prior = await priorOverlayControl(
            input.partitionKey, input.proposingSourceFileId, mutation);
          await invalidateOverlayChange({
            partitionKey: input.partitionKey,
            proposingSourceFileId: input.proposingSourceFileId,
            affectedSourceFileIds: overlaySourceUnion(
              input.proposingSourceFileId, prior, targets),
            priorOverlayGenerationId: prior ? prior.overlayGenerationId : null,
            nextOverlayGenerationId: null,
            reason: 'user-withdrawn'
          }, mutation);
          await clearOverlay(input.partitionKey, input.proposingSourceFileId, mutation);
          await purgeCacheForRequest(cacheRequest(
            input.partitionKey, input.proposingSourceFileId, 'user-withdrawn'), mutation);
          return ok('cleared');
        });
      }

      if (!withId || !validDigest(withId.overlayGenerationId, 'sog1:') || targets.length === 0) {
        return failed('corrupt-staging');
      }
      return runMutation(mutationGuard, async function(mutation) {
        var proposerControl = await currentControl(
          input.partitionKey, input.proposingSourceFileId, mutation);
        if (!proposerControl ||
            proposerControl.activeGenerationId !== input.proposingFragmentGenerationId) {
          throw statusError('stale-operation');
        }
        var proposerFragment = await readFragmentFromControl(proposerControl, mutation);
        if (!proposerFragment) throw statusError('stale-operation');
        var proposerRecords = Object.create(null);
        proposerFragment.records.forEach(function(item) { proposerRecords[item.stableRecordId] = item; });

        var targetBySource = Object.create(null);
        for (var targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
          var target = targets[targetIndex];
          if (target.sourceFileId === input.proposingSourceFileId) throw statusError('corrupt-staging');
          var targetControl = await currentControl(input.partitionKey, target.sourceFileId, mutation);
          if (!targetControl || targetControl.activeGenerationId !== target.fragmentGenerationId) {
            throw statusError('stale-operation');
          }
          var targetFragment = await readFragmentFromControl(targetControl, mutation);
          if (!targetFragment) throw statusError('stale-operation');
          var targetRecords = Object.create(null);
          targetFragment.records.forEach(function(item) { targetRecords[item.stableRecordId] = item; });
          targetBySource[target.sourceFileId] = {
            target: target,
            control: targetControl,
            records: targetRecords
          };
        }

        var parsedRelations = [];
        var usedTargets = Object.create(null);
        var seenRelationIds = Object.create(null);
        for (var relationIndex = 0; relationIndex < relations.length; relationIndex += 1) {
          var relation = await graphSchema.parseCandidateRelation(relations[relationIndex]);
          var targetState = relation && targetBySource[relation.targetSourceFileId];
          var proposerRecord = relation && proposerRecords[relation.fromStableRecordId];
          var targetRecord = relation && targetState && targetState.records[relation.toStableRecordId];
          if (!relation || relation.partitionKey !== input.partitionKey ||
              relation.proposingSourceFileId !== input.proposingSourceFileId ||
              relation.proposerFragmentGenerationId !== input.proposingFragmentGenerationId ||
              !targetState || relation.targetFragmentGenerationId !== targetState.target.fragmentGenerationId ||
              !proposerRecord || proposerRecord.recordVersionId !== relation.proposerRecordVersionId ||
              !targetRecord || targetRecord.recordVersionId !== relation.targetRecordVersionId ||
              own(seenRelationIds, relation.relationVersionId)) throw statusError('corrupt-staging');
          seenRelationIds[relation.relationVersionId] = true;
          usedTargets[relation.targetSourceFileId] = true;
          parsedRelations.push(relation);
        }
        if (Object.keys(usedTargets).length !== targets.length) throw statusError('corrupt-staging');
        parsedRelations.sort(function(left, right) {
          return left.relationVersionId.localeCompare(right.relationVersionId);
        });
        var expectedOverlayId = await graphSchema.deriveCandidateOverlayGenerationId({
          schemaVersion: graphSchema.VERSION,
          partitionKey: input.partitionKey,
          proposingSourceFileId: input.proposingSourceFileId,
          proposingFragmentGenerationId: input.proposingFragmentGenerationId,
          relations: parsedRelations
        });
        if (!mutationOpen(mutation) || expectedOverlayId !== input.overlayGenerationId) {
          throw statusError('corrupt-staging');
        }
        input.overlayGenerationId = expectedOverlayId;

        var adjacency = [];
        parsedRelations.forEach(function(relation) {
          adjacency.push(frozenRecord([
            ['stableRecordId', relation.fromStableRecordId],
            ['relationVersionId', relation.relationVersionId],
            ['direction', 'out'],
            ['sourceFileId', relation.proposingSourceFileId],
            ['fragmentGenerationId', relation.proposerFragmentGenerationId]
          ]));
          adjacency.push(frozenRecord([
            ['stableRecordId', relation.toStableRecordId],
            ['relationVersionId', relation.relationVersionId],
            ['direction', 'in'],
            ['sourceFileId', relation.targetSourceFileId],
            ['fragmentGenerationId', relation.targetFragmentGenerationId]
          ]));
        });
        adjacency.sort(function(left, right) {
          return left.stableRecordId.localeCompare(right.stableRecordId) ||
            left.relationVersionId.localeCompare(right.relationVersionId) ||
            left.direction.localeCompare(right.direction);
        });
        var relationPages = splitPages(parsedRelations, LIMITS.MAX_RELATIONS_PER_PAGE);
        var adjacencyPages = splitPages(adjacency, LIMITS.MAX_ADJACENCY_ENTRIES_PER_PAGE);
        if (!relationPages || !adjacencyPages) throw statusError('quota-exceeded');
        var prior = await priorOverlayControl(
          input.partitionKey, input.proposingSourceFileId, mutation);
        await invalidateOverlayChange({
          partitionKey: input.partitionKey,
          proposingSourceFileId: input.proposingSourceFileId,
          affectedSourceFileIds: overlaySourceUnion(
            input.proposingSourceFileId, prior, targets),
          priorOverlayGenerationId: prior ? prior.overlayGenerationId : null,
          nextOverlayGenerationId: expectedOverlayId,
          reason: 'complete'
        }, mutation);
        await clearOverlay(input.partitionKey, input.proposingSourceFileId, mutation);
        var relationHashes = await persistOverlayPages(
          'overlay-relation', relationPages, input, mutation);
        var adjacencyHashes = await persistOverlayPages(
          'overlay-adjacency', adjacencyPages, input, mutation);
        var overlayControl = frozenRecord([
          ['version', VERSION], ['kind', 'candidate-overlay-control'],
          ['partitionKey', input.partitionKey],
          ['proposingSourceFileId', input.proposingSourceFileId],
          ['proposingFragmentGenerationId', input.proposingFragmentGenerationId],
          ['overlayGenerationId', expectedOverlayId],
          ['targetGenerations', targets],
          ['relationPageCount', relationPages.length],
          ['adjacencyPageCount', adjacencyPages.length],
          ['relationPageHashes', relationHashes],
          ['adjacencyPageHashes', adjacencyHashes],
          ['updatedAt', Math.max(0, Math.floor(now()))]
        ]);
        await writeOne(overlayControlKey(input.partitionKey, input.proposingSourceFileId),
          overlayControl, mutation);
        return ok('published');
      });
    }

    async function readOverlay(control, mutation) {
      var entry = await readOne(overlayControlKey(
        control.partitionKey, control.sourceFileId), mutation);
      var overlay = entry.present ? parseOverlayControl(entry.value) : null;
      if (!overlay || overlay.proposingFragmentGenerationId !== control.activeGenerationId) return [];
      var proposerFragment = await readFragmentFromControl(control, mutation);
      if (!proposerFragment) return [];
      var proposerRecords = Object.create(null);
      proposerFragment.records.forEach(function(item) { proposerRecords[item.stableRecordId] = item; });
      var targetRecords = Object.create(null);
      for (var targetIndex = 0; targetIndex < overlay.targetGenerations.length; targetIndex += 1) {
        var target = overlay.targetGenerations[targetIndex];
        var targetControl = await currentControl(overlay.partitionKey, target.sourceFileId, mutation);
        if (!targetControl || targetControl.activeGenerationId !== target.fragmentGenerationId) return [];
        var targetFragment = await readFragmentFromControl(targetControl, mutation);
        if (!targetFragment) return [];
        var records = Object.create(null);
        targetFragment.records.forEach(function(item) { records[item.stableRecordId] = item; });
        targetRecords[target.sourceFileId] = records;
      }
      var relations = [];
      for (var ordinal = 0; ordinal < overlay.relationPageCount; ordinal += 1) {
        var pageEntry = await readOne(sourceStorageKey('overlay-relation', overlay.partitionKey,
          overlay.proposingSourceFileId, null, ordinal), mutation);
        var page = pageEntry.present ? parseOverlayPage(pageEntry.value, 'overlay-relation',
          overlay, ordinal, overlay.relationPageCount, LIMITS.MAX_RELATIONS_PER_PAGE) : null;
        if (!page || await hash(page) !== overlay.relationPageHashes[ordinal]) return [];
        for (var relationIndex = 0; relationIndex < page.items.length; relationIndex += 1) {
          var relation = await graphSchema.parseCandidateRelation(page.items[relationIndex]);
          var proposerRecord = relation && proposerRecords[relation.fromStableRecordId];
          var targetRecord = relation && targetRecords[relation.targetSourceFileId] &&
            targetRecords[relation.targetSourceFileId][relation.toStableRecordId];
          if (!relation || !proposerRecord || !targetRecord ||
              proposerRecord.recordVersionId !== relation.proposerRecordVersionId ||
              targetRecord.recordVersionId !== relation.targetRecordVersionId) return [];
          relations.push(relation);
        }
      }
      var adjacency = [];
      for (var adjacencyOrdinal = 0; adjacencyOrdinal < overlay.adjacencyPageCount;
        adjacencyOrdinal += 1) {
        var adjacencyEntry = await readOne(sourceStorageKey('overlay-adjacency', overlay.partitionKey,
          overlay.proposingSourceFileId, null, adjacencyOrdinal), mutation);
        var adjacencyPage = adjacencyEntry.present ? parseOverlayPage(adjacencyEntry.value,
          'overlay-adjacency', overlay, adjacencyOrdinal, overlay.adjacencyPageCount,
          LIMITS.MAX_ADJACENCY_ENTRIES_PER_PAGE) : null;
        if (!adjacencyPage || await hash(adjacencyPage) !== overlay.adjacencyPageHashes[adjacencyOrdinal]) {
          return [];
        }
        adjacency = adjacency.concat(Array.from(adjacencyPage.items));
      }
      var expectedId = await graphSchema.deriveCandidateOverlayGenerationId({
        schemaVersion: graphSchema.VERSION,
        partitionKey: overlay.partitionKey,
        proposingSourceFileId: overlay.proposingSourceFileId,
        proposingFragmentGenerationId: overlay.proposingFragmentGenerationId,
        relations: relations
      });
      if (expectedId !== overlay.overlayGenerationId) return [];
      var relationById = Object.create(null);
      relations.forEach(function(relation) { relationById[relation.relationVersionId] = relation; });
      var coverage = Object.create(null);
      for (var adjacencyIndex = 0; adjacencyIndex < adjacency.length; adjacencyIndex += 1) {
        var item = exactFields(adjacency[adjacencyIndex], [
          'stableRecordId', 'relationVersionId', 'direction', 'sourceFileId', 'fragmentGenerationId'
        ]);
        var ownedRelation = item && relationById[item.relationVersionId];
        if (!item || !ownedRelation || (item.direction !== 'out' && item.direction !== 'in')) return [];
        var expectedSource = item.direction === 'out'
          ? ownedRelation.proposingSourceFileId : ownedRelation.targetSourceFileId;
        var expectedGeneration = item.direction === 'out'
          ? ownedRelation.proposerFragmentGenerationId : ownedRelation.targetFragmentGenerationId;
        var expectedStable = item.direction === 'out'
          ? ownedRelation.fromStableRecordId : ownedRelation.toStableRecordId;
        if (item.sourceFileId !== expectedSource || item.fragmentGenerationId !== expectedGeneration ||
            item.stableRecordId !== expectedStable) return [];
        coverage[item.relationVersionId + '\u0000' + item.direction] = true;
      }
      if (relations.some(function(relation) {
        return !own(coverage, relation.relationVersionId + '\u0000out') ||
          !own(coverage, relation.relationVersionId + '\u0000in');
      })) return [];
      return relations;
    }

    async function readActiveShards(value) {
      var input = exactSourceRequest(value, ['partitionKey', 'sourceFileId', 'fragmentGenerationId']);
      if (!input || !validGeneration(input.fragmentGenerationId)) return null;
      try {
        var control = await currentControl(input.partitionKey, input.sourceFileId, null);
        if (!control || control.activeGenerationId !== input.fragmentGenerationId ||
            !await readFragmentFromControl(control, null)) return null;
        var expected = {
          partitionKey: control.partitionKey,
          sourceFileId: control.sourceFileId,
          fragmentGenerationId: control.activeGenerationId
        };
        var lexical = await readSeries(expected, 'lexical', control.lexicalPageCount,
          control.lexicalPageHashes, 0, null, true);
        var adjacency = lexical && await readSeries(expected, 'adjacency', control.adjacencyPageCount,
          control.adjacencyPageHashes, 0, null, true);
        var resultCache = adjacency && await readSeries(expected, 'result-cache',
          control.resultCachePageCount, control.resultCachePageHashes, 0, null, true);
        if (!lexical || !adjacency || !resultCache) return null;
        var parsedLexical = lexical.map(function(shard) { return graphSchema.parseLexicalShard(shard); });
        var parsedAdjacency = adjacency.map(function(shard) { return graphSchema.parseAdjacencyShard(shard); });
        if (parsedLexical.some(function(shard) {
          return !shard || shard.partitionKey !== control.partitionKey ||
            shard.sourceFileId !== control.sourceFileId ||
            shard.fragmentGenerationId !== control.activeGenerationId;
        }) || parsedAdjacency.some(function(shard) {
          return !shard || shard.partitionKey !== control.partitionKey ||
            shard.sourceFileId !== control.sourceFileId ||
            shard.fragmentGenerationId !== control.activeGenerationId;
        })) return null;
        var candidateRelations = await readOverlay(control, null);
        return frozenRecord([
          ['lexicalShards', frozenArray(parsedLexical)],
          ['adjacencyShards', frozenArray(parsedAdjacency)],
          ['resultCacheShards', frozenArray(resultCache)],
          ['candidateRelations', frozenArray(candidateRelations)]
        ]);
      } catch (_error) {
        return null;
      }
    }

    async function withdrawSourceInMutation(input, control, mutation) {
      var generation = control && control.activeGenerationId || null;
      await invalidateSourceChange({
        partitionKey: input.partitionKey,
        sourceFileId: input.sourceFileId,
        priorFragmentGenerationId: control && control.state === 'published'
          ? control.activeGenerationId : null,
        nextFragmentGenerationId: null,
        reason: input.reason
      }, mutation);
      await writeOne(controlKey(input.partitionKey, input.sourceFileId), makeControl({
        partitionKey: input.partitionKey,
        sourceFileId: input.sourceFileId,
        state: 'purging',
        contentFingerprint: control && control.contentFingerprint,
        schemaVersion: control && control.schemaVersion,
        promptVersion: control && control.promptVersion,
        providerId: control && control.providerId,
        modelId: control && control.modelId,
        updatedAt: Math.max(0, Math.floor(now())),
        reason: input.reason
      }), mutation);
      await writeOne(journalKey(input.partitionKey, input.sourceFileId), makeJournal(input,
        generation, 'withdrawal', 'purging', input.reason), mutation);
      await removeSourcePayload(input.partitionKey, input.sourceFileId, mutation);
      await removeKeys([diagnosticKey(input.partitionKey)], mutation);
      await purgeCacheForRequest(cacheRequest(
        input.partitionKey, input.sourceFileId, input.reason), mutation);
      if (!await sourcePayloadAbsent(input.partitionKey, input.sourceFileId, mutation)) {
        throw statusError('absence-proof-failed');
      }
      await removeKeys([journalKey(input.partitionKey, input.sourceFileId)], mutation);
      await writeOne(controlKey(input.partitionKey, input.sourceFileId), makeControl({
        partitionKey: input.partitionKey,
        sourceFileId: input.sourceFileId,
        state: 'withheld',
        contentFingerprint: control && control.contentFingerprint,
        schemaVersion: control && control.schemaVersion,
        promptVersion: control && control.promptVersion,
        providerId: control && control.providerId,
        modelId: control && control.modelId,
        updatedAt: Math.max(0, Math.floor(now())),
        reason: input.reason
      }), mutation);
      return ok('withheld');
    }

    async function withdrawSource(value, mutationGuard) {
      var input = exactFields(value, ['partitionKey', 'sourceFileId', 'reason']);
      if (!input || !validPartition(corpusSchema, input.partitionKey) ||
          !validSourceId(input.sourceFileId) ||
          !makeSet(['user-withdrawn', 'access-revoked', 'root-replaced'])[input.reason]) {
        return failed('corrupt-staging');
      }
      return runMutation(mutationGuard, async function(mutation) {
        var entry = await readOne(controlKey(input.partitionKey, input.sourceFileId), mutation);
        var control = entry.present ? parseControl(corpusSchema, entry.value) : null;
        return withdrawSourceInMutation(input, control, mutation);
      });
    }

    async function withdrawSourceIfCurrent(value, mutationGuard) {
      var input = exactFields(value, [
        'partitionKey', 'sourceFileId', 'activeGenerationId', 'contentFingerprint', 'reason'
      ]);
      if (!input || !validPartition(corpusSchema, input.partitionKey) ||
          !validSourceId(input.sourceFileId) || !validGeneration(input.activeGenerationId) ||
          !validFingerprint(input.contentFingerprint) ||
          !makeSet(['user-withdrawn', 'access-revoked', 'root-replaced'])[input.reason]) {
        return failed('corrupt-staging');
      }
      return runMutation(mutationGuard, async function(mutation) {
        var entry = await readOne(controlKey(input.partitionKey, input.sourceFileId), mutation);
        var control = entry.present ? parseControl(corpusSchema, entry.value) : null;
        if (!control || control.state !== 'published' ||
            control.activeGenerationId !== input.activeGenerationId ||
            control.contentFingerprint !== input.contentFingerprint) return ok('superseded');
        return withdrawSourceInMutation(input, control, mutation);
      });
    }

    function registerCacheOwner(value) {
      var adapter = exactFields(value, ['purgeSource', 'purgePartition', 'hasOwnedInfluence']);
      if (cacheOwner || !adapter || typeof adapter.purgeSource !== 'function' ||
          typeof adapter.purgePartition !== 'function' ||
          typeof adapter.hasOwnedInfluence !== 'function') return failed('invalid-input');
      cacheOwner = Object.freeze({
        purgeSource: adapter.purgeSource,
        purgePartition: adapter.purgePartition,
        hasOwnedInfluence: adapter.hasOwnedInfluence
      });
      return ok('registered');
    }

    function parseParticipantRequest(value) {
      var request = exactFields(value, [
        'partitionKey', 'accountPermissionId', 'corpusRootFileId', 'sourceFileId', 'reason'
      ]);
      if (!request || !validPartition(corpusSchema, request.partitionKey) ||
          !(request.sourceFileId === null || validSourceId(request.sourceFileId)) ||
          typeof request.reason !== 'string' || request.reason.length === 0 || request.reason.length > 32) {
        return null;
      }
      var tuple = corpusSchema.parsePartitionKey(request.partitionKey);
      if (tuple.accountPermissionId !== request.accountPermissionId ||
          tuple.corpusRootFileId !== request.corpusRootFileId) return null;
      return request;
    }

    function verifiedAuthorization(verifier, capability, mode, request) {
      var view;
      try {
        view = verifier(capability, mode, request);
      } catch (_error) {
        return null;
      }
      var fields = exactFields(view, ['signal', 'operationEpoch']);
      if (!fields || !validSignal(fields.signal) || fields.signal.aborted ||
          !safeInteger(fields.operationEpoch, Number.MAX_SAFE_INTEGER)) return null;
      return frozenRecord([['signal', fields.signal], ['operationEpoch', fields.operationEpoch]]);
    }

    async function participantAwait(context, work) {
      var before = verifiedAuthorization(
        context.verifier, context.capability, context.mode, context.request);
      if (!before) throw statusError('stale-operation');
      var value = await work(before);
      var after = verifiedAuthorization(
        context.verifier, context.capability, context.mode, context.request);
      if (!after || after.signal !== before.signal ||
          after.operationEpoch !== before.operationEpoch) throw statusError('stale-operation');
      return value;
    }

    async function participantReadOne(key, context) {
      var values = await participantAwait(context, function() { return storage.get(key); });
      if (!isPlainRecord(values)) throw statusError('recovery-pending');
      return own(values, key) ? { present: true, value: values[key] } : { present: false, value: null };
    }

    async function participantReadAll(context) {
      var values = await participantAwait(context, function() { return storage.get(null); });
      if (!isPlainRecord(values)) throw statusError('recovery-pending');
      return values;
    }

    async function participantWriteOne(key, value, context) {
      var serialized = JSON.stringify(value);
      if (utf8Length(serialized) > LIMITS.MAX_VALUE_BYTES) throw statusError('quota-exceeded');
      var update = Object.create(null);
      update[key] = value;
      await participantAwait(context, function() { return storage.set(update); });
    }

    async function participantRemoveKeys(keys, context) {
      var unique = Array.from(new Set(keys)).sort();
      if (unique.length === 0) return;
      await participantAwait(context, function() { return storage.remove(unique); });
    }

    function categoryKinds(name) {
      if (name === 'fragments') return ['staging', 'batch', 'fragment-record', 'fragment-relation'];
      if (name === 'indexes') return ['lexical'];
      if (name === 'relationships') return ['adjacency', 'overlay-control', 'overlay-relation', 'overlay-adjacency'];
      return ['result-cache'];
    }

    function participantOwnedKeys(values, name, request) {
      var kinds = categoryKinds(name);
      var prefixes = [];
      for (var index = 0; index < kinds.length; index += 1) {
        prefixes.push(request.sourceFileId === null
          ? partitionPrefix(kinds[index], request.partitionKey)
          : sourcePrefix(kinds[index], request.partitionKey, request.sourceFileId));
      }
      return Object.keys(values).filter(function(key) { return matchesAnyPrefix(key, prefixes); });
    }

    async function participantCacheCall(name, request, context, verifyOnly) {
      if (!cacheOwner || name === 'fragments') return verifyOnly ? false : true;
      var result;
      if (!verifyOnly) {
        result = request.sourceFileId === null
          ? await participantAwait(context, function(view) {
            return cacheOwner.purgePartition(request, view);
          })
          : await participantAwait(context, function(view) {
            return cacheOwner.purgeSource(request, view);
          });
        if (!strictOk(result)) throw statusError('absence-proof-failed');
      }
      result = await participantAwait(context, function(view) {
        return cacheOwner.hasOwnedInfluence(request, view);
      });
      if (!exactFields(result, ['owned']) || typeof result.owned !== 'boolean') {
        throw statusError('absence-proof-failed');
      }
      return result.owned;
    }

    async function closeParticipantControls(request, context) {
      var values = await participantReadAll(context);
      var prefix = request.sourceFileId === null
        ? partitionPrefix('control', request.partitionKey)
        : sourcePrefix('control', request.partitionKey, request.sourceFileId);
      var keys = Object.keys(values).filter(function(key) { return key.indexOf(prefix) === 0; }).sort();
      for (var index = 0; index < keys.length; index += 1) {
        var control = parseControl(corpusSchema, values[keys[index]]);
        if (!control || keys[index] !== controlKey(control.partitionKey, control.sourceFileId)) {
          await participantRemoveKeys([keys[index]], context);
          continue;
        }
        await participantWriteOne(keys[index], makeControl({
          partitionKey: control.partitionKey,
          sourceFileId: control.sourceFileId,
          state: 'purging',
          contentFingerprint: control.contentFingerprint,
          schemaVersion: control.schemaVersion,
          promptVersion: control.promptVersion,
          providerId: control.providerId,
          modelId: control.modelId,
          updatedAt: Math.max(0, Math.floor(now())),
          reason: request.reason === 'root-replaced' ? 'root-replaced' : 'access-revoked'
        }), context);
      }
    }

    async function participantPurge(name, requestValue, capability, verifier, partitionMode) {
      var request = parseParticipantRequest(requestValue);
      var mode = partitionMode ? 'purge-partition' : 'purge-source';
      if (!request || (partitionMode ? request.sourceFileId !== null : request.sourceFileId === null)) {
        return frozenRecord([['ok', false]]);
      }
      var context = {
        verifier: verifier,
        capability: capability,
        mode: mode,
        request: requestValue
      };
      if (!verifiedAuthorization(verifier, capability, mode, requestValue)) {
        return frozenRecord([['ok', false]]);
      }
      try {
        if (name === 'fragments') await closeParticipantControls(request, context);
        var values = await participantReadAll(context);
        await participantRemoveKeys(participantOwnedKeys(values, name, request), context);
        if (name === 'fragments') {
          await participantRemoveKeys([diagnosticKey(request.partitionKey)], context);
        }
        await participantCacheCall(name, request, context, false);
        var remaining = participantOwnedKeys(await participantReadAll(context), name, request);
        if (remaining.length !== 0 || await participantCacheCall(name, request, context, true)) {
          return frozenRecord([['ok', false]]);
        }
        return frozenRecord([['ok', true]]);
      } catch (_error) {
        return frozenRecord([['ok', false]]);
      }
    }

    async function participantHasInfluence(name, requestValue, capability, verifier) {
      var request = parseParticipantRequest(requestValue);
      var partitionMode = request && request.sourceFileId === null;
      var mode = partitionMode ? 'verify-partition' : 'verify-source';
      if (!request || !verifiedAuthorization(verifier, capability, mode, requestValue)) {
        return frozenRecord([['owned', true]]);
      }
      var context = {
        verifier: verifier,
        capability: capability,
        mode: mode,
        request: requestValue
      };
      try {
        var keys = participantOwnedKeys(await participantReadAll(context), name, request);
        var cacheOwned = await participantCacheCall(name, request, context, true);
        return frozenRecord([['owned', keys.length !== 0 || cacheOwned]]);
      } catch (_error) {
        return frozenRecord([['owned', true]]);
      }
    }

    function getPurgeParticipant(name) {
      if (!PARTICIPANT_NAMES[name] || issuedParticipantBinders.has(name)) return null;
      issuedParticipantBinders.add(name);
      var used = false;
      return function bindParticipant(verifier) {
        if (used || typeof verifier !== 'function') return null;
        used = true;
        return Object.freeze({
          purgeSource: function(request, capability) {
            return participantPurge(name, request, capability, verifier, false);
          },
          purgePartition: function(request, capability) {
            return participantPurge(name, request, capability, verifier, true);
          },
          hasOwnedInfluence: function(request, capability) {
            return participantHasInfluence(name, request, capability, verifier);
          }
        });
      };
    }

    async function removeSourceKinds(partitionKey, sourceFileId, kinds, mutation) {
      var values = await readAll(mutation);
      var prefixes = kinds.map(function(kind) {
        return sourcePrefix(kind, partitionKey, sourceFileId);
      });
      await removeKeys(Object.keys(values).filter(function(key) {
        return matchesAnyPrefix(key, prefixes);
      }), mutation);
    }

    function derivedLexicalShards(fragment) {
      var postings = Array.from(fragment.records).map(function(record) {
        var term = record.label.toLowerCase()
          .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/g, ' ')
          .replace(/\s+/g, ' ').trim().slice(0, 256);
        if (!term) term = record.kind;
        return {
          term: term,
          stableRecordId: record.stableRecordId,
          recordVersionId: record.recordVersionId
        };
      });
      postings.sort(function(left, right) {
        return left.term.localeCompare(right.term) ||
          left.stableRecordId.localeCompare(right.stableRecordId);
      });
      var pages = splitPages(postings, LIMITS.MAX_POSTINGS_PER_PAGE) || [];
      return pages.map(function(page, index) {
        return graphSchema.parseLexicalShard({
          schemaVersion: graphSchema.VERSION,
          partitionKey: fragment.partitionKey,
          sourceFileId: fragment.sourceFileId,
          fragmentGenerationId: fragment.fragmentGenerationId,
          shardOrdinal: index,
          postings: page
        });
      });
    }

    function derivedAdjacencyShards(fragment) {
      var entries = [];
      fragment.relations.forEach(function(relation) {
        entries.push({
          stableRecordId: relation.fromStableRecordId,
          relationVersionId: relation.relationVersionId,
          direction: 'out'
        });
        entries.push({
          stableRecordId: relation.toStableRecordId,
          relationVersionId: relation.relationVersionId,
          direction: 'in'
        });
      });
      entries.sort(function(left, right) {
        return left.stableRecordId.localeCompare(right.stableRecordId) ||
          left.relationVersionId.localeCompare(right.relationVersionId) ||
          left.direction.localeCompare(right.direction);
      });
      var pages = splitPages(entries, LIMITS.MAX_ADJACENCY_ENTRIES_PER_PAGE) || [];
      return pages.map(function(page, index) {
        return graphSchema.parseAdjacencyShard({
          schemaVersion: graphSchema.VERSION,
          partitionKey: fragment.partitionKey,
          sourceFileId: fragment.sourceFileId,
          fragmentGenerationId: fragment.fragmentGenerationId,
          shardOrdinal: index,
          entries: page
        });
      });
    }

    async function repairDerivableShards(control, fragment, mutation) {
      var expected = {
        partitionKey: control.partitionKey,
        sourceFileId: control.sourceFileId,
        fragmentGenerationId: control.activeGenerationId
      };
      var lexical = await readSeries(expected, 'lexical', control.lexicalPageCount,
        control.lexicalPageHashes, 0, mutation, true);
      var adjacency = lexical && await readSeries(expected, 'adjacency', control.adjacencyPageCount,
        control.adjacencyPageHashes, 0, mutation, true);
      var resultCache = adjacency && await readSeries(expected, 'result-cache',
        control.resultCachePageCount, control.resultCachePageHashes, 0, mutation, true);
      var stableRecords = Object.create(null);
      var relationVersions = Object.create(null);
      fragment.records.forEach(function(item) { stableRecords[item.stableRecordId] = item; });
      fragment.relations.forEach(function(item) { relationVersions[item.relationVersionId] = item; });
      var indexed = Object.create(null);
      var lexicalValid = lexical && lexical.every(function(shard) {
        var parsed = graphSchema.parseLexicalShard(shard);
        return parsed && parsed.partitionKey === control.partitionKey &&
          parsed.sourceFileId === control.sourceFileId &&
          parsed.fragmentGenerationId === control.activeGenerationId &&
          parsed.postings.every(function(posting) {
            var record = stableRecords[posting.stableRecordId];
            if (!record || record.recordVersionId !== posting.recordVersionId) return false;
            indexed[posting.stableRecordId] = true;
            return true;
          });
      });
      lexicalValid = lexicalValid && Object.keys(stableRecords).every(function(stableRecordId) {
        return own(indexed, stableRecordId);
      });
      var adjacencyCoverage = Object.create(null);
      var adjacencyValid = adjacency && adjacency.every(function(shard) {
        var parsed = graphSchema.parseAdjacencyShard(shard);
        return parsed && parsed.partitionKey === control.partitionKey &&
          parsed.sourceFileId === control.sourceFileId &&
          parsed.fragmentGenerationId === control.activeGenerationId &&
          parsed.entries.every(function(entry) {
            var relation = relationVersions[entry.relationVersionId];
            if (!relation) return false;
            var expectedStable = entry.direction === 'out'
              ? relation.fromStableRecordId : relation.toStableRecordId;
            if (entry.stableRecordId !== expectedStable) return false;
            adjacencyCoverage[entry.relationVersionId + '\u0000' + entry.direction] = true;
            return true;
          });
      });
      adjacencyValid = adjacencyValid && Object.keys(relationVersions).every(function(relationVersionId) {
        return own(adjacencyCoverage, relationVersionId + '\u0000out') &&
          own(adjacencyCoverage, relationVersionId + '\u0000in');
      });
      var resultValid = !!resultCache;
      if (resultValid) {
        for (var resultIndex = 0; resultIndex < resultCache.length; resultIndex += 1) {
          if (!parseResultCacheShard(resultCache[resultIndex], { stableRecords: stableRecords })) {
            resultValid = false;
            break;
          }
        }
      }
      if (lexicalValid && adjacencyValid && resultValid) return false;

      await writeOne(controlKey(control.partitionKey, control.sourceFileId), makeControl({
        partitionKey: control.partitionKey,
        sourceFileId: control.sourceFileId,
        state: 'repairing',
        contentFingerprint: control.contentFingerprint,
        schemaVersion: control.schemaVersion,
        promptVersion: control.promptVersion,
        providerId: control.providerId,
        modelId: control.modelId,
        updatedAt: Math.max(0, Math.floor(now())),
        reason: 'corrupt-staging'
      }), mutation);
      await removeSourceKinds(control.partitionKey, control.sourceFileId,
        ['lexical', 'adjacency', 'result-cache'], mutation);
      var repairedLexical = derivedLexicalShards(fragment);
      var repairedAdjacency = derivedAdjacencyShards(fragment);
      if (repairedLexical.some(function(shard) { return !shard; }) ||
          repairedAdjacency.some(function(shard) { return !shard; })) {
        throw statusError('corrupt-staging');
      }
      var record = {
        partitionKey: control.partitionKey,
        sourceFileId: control.sourceFileId,
        fragmentGenerationId: control.activeGenerationId
      };
      var lexicalHashes = await persistPages('lexical', repairedLexical, record, mutation, true);
      var adjacencyHashes = await persistPages('adjacency', repairedAdjacency, record, mutation, true);
      await writeOne(controlKey(control.partitionKey, control.sourceFileId), makeControl({
        partitionKey: control.partitionKey,
        sourceFileId: control.sourceFileId,
        state: 'published',
        activeGenerationId: control.activeGenerationId,
        contentFingerprint: control.contentFingerprint,
        schemaVersion: control.schemaVersion,
        promptVersion: control.promptVersion,
        providerId: control.providerId,
        modelId: control.modelId,
        recordPageCount: control.recordPageCount,
        relationPageCount: control.relationPageCount,
        lexicalPageCount: repairedLexical.length,
        adjacencyPageCount: repairedAdjacency.length,
        resultCachePageCount: 0,
        recordPageHashes: control.recordPageHashes,
        relationPageHashes: control.relationPageHashes,
        lexicalPageHashes: lexicalHashes,
        adjacencyPageHashes: adjacencyHashes,
        resultCachePageHashes: emptyHashes(),
        updatedAt: Math.max(0, Math.floor(now())),
        reason: 'complete'
      }), mutation);
      return true;
    }

    async function recover(mutationGuard) {
      return runMutation(mutationGuard, async function(mutation) {
        var values = await readAll(mutation);
        var controlKeys = Object.keys(values).filter(function(key) {
          return key.indexOf(PREFIX + 'control:') === 0;
        }).sort();
        var steps = 0;
        var repaired = false;
        for (var index = 0; index < controlKeys.length; index += 1) {
          if (steps >= LIMITS.MAX_RECOVERY_STEPS) return failed('recovery-pending');
          steps += 1;
          var key = controlKeys[index];
          var control = parseControl(corpusSchema, values[key]);
          if (!control || key !== controlKey(control.partitionKey, control.sourceFileId)) {
            await removeKeys([key], mutation);
            repaired = true;
            continue;
          }
          if (control.state !== 'published') {
            await invalidateSourceChange({
              partitionKey: control.partitionKey,
              sourceFileId: control.sourceFileId,
              priorFragmentGenerationId: null,
              nextFragmentGenerationId: null,
              reason: 'recovery-pending'
            }, mutation);
            await removeSourcePayload(control.partitionKey, control.sourceFileId, mutation);
            await removeKeys([journalKey(control.partitionKey, control.sourceFileId)], mutation);
            await writeOne(key, makeControl({
              partitionKey: control.partitionKey,
              sourceFileId: control.sourceFileId,
              state: 'withheld',
              contentFingerprint: control.contentFingerprint,
              schemaVersion: control.schemaVersion,
              promptVersion: control.promptVersion,
              providerId: control.providerId,
              modelId: control.modelId,
              updatedAt: Math.max(0, Math.floor(now())),
              reason: 'recovery-pending'
            }), mutation);
            repaired = true;
            continue;
          }
          var fragment = await readFragmentFromControl(control, mutation);
          if (!fragment) {
            await invalidateSourceChange({
              partitionKey: control.partitionKey,
              sourceFileId: control.sourceFileId,
              priorFragmentGenerationId: control.activeGenerationId,
              nextFragmentGenerationId: null,
              reason: 'recovery-pending'
            }, mutation);
            await writeOne(key, makeControl({
              partitionKey: control.partitionKey,
              sourceFileId: control.sourceFileId,
              state: 'repairing',
              contentFingerprint: control.contentFingerprint,
              schemaVersion: control.schemaVersion,
              promptVersion: control.promptVersion,
              providerId: control.providerId,
              modelId: control.modelId,
              updatedAt: Math.max(0, Math.floor(now())),
              reason: 'corrupt-staging'
            }), mutation);
            await removeSourcePayload(control.partitionKey, control.sourceFileId, mutation);
            repaired = true;
            continue;
          }
          repaired = await repairDerivableShards(control, fragment, mutation) || repaired;
        }

        var fresh = await readAll(mutation);
        var orphanKeys = Object.keys(fresh).filter(function(key) {
          return key.indexOf(PREFIX + 'staging:') === 0 ||
            key.indexOf(PREFIX + 'batch:') === 0 ||
            key.indexOf(PREFIX + 'journal:') === 0;
        }).sort();
        if (orphanKeys.length) {
          var remaining = LIMITS.MAX_RECOVERY_STEPS - steps;
          await removeKeys(orphanKeys.slice(0, remaining), mutation);
          steps += Math.min(orphanKeys.length, remaining);
          repaired = true;
          if (orphanKeys.length > remaining) return failed('recovery-pending');
        }

        fresh = await readAll(mutation);
        var overlayKeys = Object.keys(fresh).filter(function(key) {
          return key.indexOf(PREFIX + 'overlay-control:') === 0;
        }).sort();
        for (var overlayIndex = 0; overlayIndex < overlayKeys.length; overlayIndex += 1) {
          if (steps >= LIMITS.MAX_RECOVERY_STEPS) return failed('recovery-pending');
          steps += 1;
          var overlay = parseOverlayControl(fresh[overlayKeys[overlayIndex]]);
          var invalid = !overlay || overlayKeys[overlayIndex] !== overlayControlKey(
            overlay.partitionKey, overlay.proposingSourceFileId);
          var proposer = !invalid
            ? await currentControl(overlay.partitionKey, overlay.proposingSourceFileId, mutation)
            : null;
          if (!proposer || proposer.activeGenerationId !== overlay.proposingFragmentGenerationId ||
              (await readOverlay(proposer, mutation)).length === 0) {
            if (overlay) {
              await invalidateOverlayChange({
                partitionKey: overlay.partitionKey,
                proposingSourceFileId: overlay.proposingSourceFileId,
                affectedSourceFileIds: overlaySourceUnion(
                  overlay.proposingSourceFileId, overlay, []),
                priorOverlayGenerationId: overlay.overlayGenerationId,
                nextOverlayGenerationId: null,
                reason: 'recovery-pending'
              }, mutation);
              await clearOverlay(
                overlay.partitionKey, overlay.proposingSourceFileId, mutation);
            }
            else await removeKeys([overlayKeys[overlayIndex]], mutation);
            repaired = true;
          }
        }

        fresh = await readAll(mutation);
        var overlayPageKeys = Object.keys(fresh).filter(function(key) {
          return key.indexOf(PREFIX + 'overlay-relation:') === 0 ||
            key.indexOf(PREFIX + 'overlay-adjacency:') === 0;
        }).sort();
        var orphanOverlayPages = [];
        for (var pageIndex = 0; pageIndex < overlayPageKeys.length; pageIndex += 1) {
          var pageFields = exactFields(fresh[overlayPageKeys[pageIndex]], OVERLAY_PAGE_KEYS);
          var pointer = pageFields && parseOverlayControl(
            fresh[overlayControlKey(pageFields.partitionKey, pageFields.proposingSourceFileId)]);
          if (!pageFields || !pointer ||
              pointer.overlayGenerationId !== pageFields.overlayGenerationId ||
              pointer.proposingFragmentGenerationId !== pageFields.proposingFragmentGenerationId) {
            orphanOverlayPages.push(overlayPageKeys[pageIndex]);
          }
        }
        if (orphanOverlayPages.length) {
          var pageBudget = LIMITS.MAX_RECOVERY_STEPS - steps;
          await removeKeys(orphanOverlayPages.slice(0, pageBudget), mutation);
          steps += Math.min(orphanOverlayPages.length, pageBudget);
          repaired = true;
          if (orphanOverlayPages.length > pageBudget) return failed('recovery-pending');
        }
        return ok(repaired ? 'repaired' : 'complete');
      });
    }

    function parseDiagnosticInput(value) {
      var input = exactFields(value, DIAGNOSTIC_INPUT_KEYS);
      if (!input || !validPartition(corpusSchema, input.partitionKey) ||
          !DIAGNOSTIC_OPERATIONS[input.operation] || !DIAGNOSTIC_OUTCOMES[input.outcome] ||
          !DIAGNOSTIC_REASONS[input.reason] || !DIAGNOSTIC_RECOVERY[input.recovery] ||
          input.schemaVersion !== graphSchema.VERSION || input.promptVersion !== graphSchema.PROMPT_VERSION ||
          !validDiagnosticBindingId(input.providerId) ||
          !validDiagnosticBindingId(input.modelId) ||
          !VALIDATOR_KEYWORDS[input.validatorKeyword] ||
          !validValidatorPath(input.validatorPath)) return null;
      var counters = [input.recordCount, input.relationCount, input.durationMs,
        input.retryCount, input.repairCount, input.inputTokens, input.outputTokens]
        .map(saturatingCounter);
      if (counters.some(function(item) { return item === null; })) return null;
      return frozenRecord([
        ['operation', input.operation], ['outcome', input.outcome], ['reason', input.reason],
        ['recovery', input.recovery], ['schemaVersion', input.schemaVersion],
        ['promptVersion', input.promptVersion], ['providerId', input.providerId],
        ['modelId', input.modelId], ['recordCount', counters[0]],
        ['relationCount', counters[1]], ['durationMs', counters[2]],
        ['retryCount', counters[3]], ['repairCount', counters[4]],
        ['inputTokens', counters[5]], ['outputTokens', counters[6]],
        ['validatorKeyword', input.validatorKeyword], ['validatorPath', input.validatorPath]
      ]);
    }

    function parseDiagnosticLedger(value, partitionKey) {
      var input = exactFields(value, DIAGNOSTIC_LEDGER_KEYS);
      var records = input && denseArray(input.records, LIMITS.MAX_DIAGNOSTICS, 0);
      if (!input || !records || input.version !== VERSION || input.kind !== 'diagnostic-ledger' ||
          input.partitionKey !== partitionKey) return null;
      for (var index = 0; index < records.length; index += 1) {
        var record = exactFields(records[index], DIAGNOSTIC_RECORD_KEYS);
        if (!record || !safeInteger(record.timestamp, Number.MAX_SAFE_INTEGER) ||
            !DIAGNOSTIC_OPERATIONS[record.operation] || !DIAGNOSTIC_OUTCOMES[record.outcome] ||
            !DIAGNOSTIC_REASONS[record.reason] || !DIAGNOSTIC_RECOVERY[record.recovery] ||
            record.schemaVersion !== graphSchema.VERSION || record.promptVersion !== graphSchema.PROMPT_VERSION ||
            !validDiagnosticBindingId(record.providerId) ||
            !validDiagnosticBindingId(record.modelId) ||
            !VALIDATOR_KEYWORDS[record.validatorKeyword] ||
            !validValidatorPath(record.validatorPath)) return null;
        var counters = ['recordCount', 'relationCount', 'durationMs', 'retryCount',
          'repairCount', 'inputTokens', 'outputTokens'];
        if (counters.some(function(key) {
          return !safeInteger(record[key], Number.MAX_SAFE_INTEGER);
        })) return null;
      }
      return records;
    }

    function makeDiagnosticRecord(input, timestamp) {
      return frozenRecord([
        ['operation', input.operation], ['outcome', input.outcome], ['reason', input.reason],
        ['recovery', input.recovery], ['schemaVersion', input.schemaVersion],
        ['promptVersion', input.promptVersion], ['providerId', input.providerId],
        ['modelId', input.modelId], ['recordCount', input.recordCount],
        ['relationCount', input.relationCount], ['durationMs', input.durationMs],
        ['retryCount', input.retryCount], ['repairCount', input.repairCount],
        ['inputTokens', input.inputTokens], ['outputTokens', input.outputTokens],
        ['validatorKeyword', input.validatorKeyword], ['validatorPath', input.validatorPath],
        ['timestamp', timestamp]
      ]);
    }

    function makeDiagnosticLedger(partitionKey, records) {
      return frozenRecord([
        ['version', VERSION], ['kind', 'diagnostic-ledger'],
        ['partitionKey', partitionKey], ['records', frozenArray(records)]
      ]);
    }

    async function recordDiagnostic(value, mutationGuard) {
      var input = parseDiagnosticInput(value);
      if (!input) return failed('invalid-input');
      return runMutation(mutationGuard, async function(mutation) {
        var key = diagnosticKey(value.partitionKey);
        var entry = await readOne(key, mutation);
        var existing = entry.present ? parseDiagnosticLedger(entry.value, value.partitionKey) : [];
        if (entry.present && !existing) existing = [];
        var timestamp = Math.floor(Math.max(0, now()) / 3600000) * 3600000;
        var cutoff = timestamp - LIMITS.DIAGNOSTIC_RETENTION_MS;
        var records = existing.filter(function(record) { return record.timestamp >= cutoff; });
        records.push(makeDiagnosticRecord(input, timestamp));
        while (records.length > LIMITS.MAX_DIAGNOSTICS) records.shift();
        var ledger = makeDiagnosticLedger(value.partitionKey, records);
        while (records.length > 0 && utf8Length(JSON.stringify(ledger)) > LIMITS.MAX_DIAGNOSTIC_BYTES) {
          records.shift();
          ledger = makeDiagnosticLedger(value.partitionKey, records);
        }
        if (utf8Length(JSON.stringify(ledger)) > LIMITS.MAX_DIAGNOSTIC_BYTES) {
          throw statusError('quota-exceeded');
        }
        await writeOne(key, ledger, mutation);
        return ok('recorded');
      });
    }

    async function inspectMetadata(value) {
      var input = exactSourceRequest(value, ['partitionKey', 'sourceFileId']);
      if (!input) return null;
      try {
        var entry = await readOne(controlKey(input.partitionKey, input.sourceFileId), null);
        var control = entry.present ? parseControl(corpusSchema, entry.value) : null;
        if (!control) {
          return frozenRecord([
            ['version', VERSION], ['state', 'absent'], ['schemaVersion', graphSchema.VERSION],
            ['promptVersion', graphSchema.PROMPT_VERSION], ['fragmentGenerationId', null],
            ['activeGenerationId', null], ['contentFingerprint', null],
            ['recordCount', 0], ['relationCount', 0]
          ]);
        }
        var fragment = control.state === 'published' ? await readFragmentFromControl(control, null) : null;
        return frozenRecord([
          ['version', VERSION], ['state', fragment ? 'published' : control.state],
          ['schemaVersion', control.schemaVersion || graphSchema.VERSION],
          ['promptVersion', control.promptVersion || graphSchema.PROMPT_VERSION],
          ['fragmentGenerationId', fragment ? fragment.fragmentGenerationId : null],
          ['activeGenerationId', control.activeGenerationId],
          ['contentFingerprint', control.contentFingerprint],
          ['recordCount', fragment ? fragment.records.length : 0],
          ['relationCount', fragment ? fragment.relations.length : 0]
        ]);
      } catch (_error) {
        return null;
      }
    }

    async function inspectProvenance(value) {
      var input = exactSourceRequest(value, ['partitionKey', 'sourceFileId', 'fragmentGenerationId']);
      if (!input || !validGeneration(input.fragmentGenerationId)) return null;
      var fragment = await readCurrentFragment(input);
      if (!fragment) return null;
      return frozenRecord([
        ['schemaVersion', fragment.schemaVersion], ['promptVersion', fragment.promptVersion],
        ['fragmentGenerationId', fragment.fragmentGenerationId],
        ['providerId', fragment.providerId], ['modelId', fragment.modelId],
        ['recordCount', fragment.records.length], ['relationCount', fragment.relations.length]
      ]);
    }

    return Object.freeze({
      issueMutation: issueMutation,
      finishMutation: finishMutation,
      registerCacheOwner: registerCacheOwner,
      registerTruthInvalidator: registerTruthInvalidator,
      getPurgeParticipant: getPurgeParticipant,
      recover: recover,
      beginReplacement: beginReplacement,
      stageBatch: stageBatch,
      sealStaging: sealStaging,
      publishReplacement: publishReplacement,
      replaceCandidateRelations: replaceCandidateRelations,
      withdrawSource: withdrawSource,
      withdrawSourceIfCurrent: withdrawSourceIfCurrent,
      readCurrentFragment: readCurrentFragment,
      readActiveShards: readActiveShards,
      inspectProvenance: inspectProvenance,
      recordDiagnostic: recordDiagnostic,
      inspectMetadata: inspectMetadata
    });
  }

  var api = Object.freeze({ VERSION: VERSION, LIMITS: LIMITS, create: create });
  global.FsbSkopeoGraphStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
