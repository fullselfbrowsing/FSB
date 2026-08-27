(function(global) {
  'use strict';

  var VERSION = 'skopeo-truth-store/1';
  var PREFIX = 'fsbSkopeoTruth:1:';
  var STATES = makeSet(['absent', 'withheld', 'staging', 'published', 'purging', 'repairing']);
  var REASONS = makeSet([
    'complete', 'user-withdrawn', 'access-revoked', 'root-replaced',
    'account-changed', 'recovery-pending', 'corrupt-snapshot',
    'dependency-mismatch', 'quota-exceeded', 'validation-failed'
  ]);
  var PAGE_CATEGORIES = Object.freeze([
    'assertions', 'citations', 'conflicts', 'deadlineResults', 'deadlineRules'
  ]);
  var DIAGNOSTIC_OPERATIONS = makeSet([
    'replacement', 'stage', 'publish', 'withdrawal', 'purge', 'invalidation',
    'recovery', 'diagnostic'
  ]);
  var DIAGNOSTIC_OUTCOMES = makeSet(['success', 'failure', 'cancelled']);
  var DIAGNOSTIC_REASONS = makeSet([
    'complete', 'stale-operation', 'quota-exceeded', 'validation-failed',
    'dependency-mismatch', 'corrupt-snapshot', 'recovery-pending'
  ]);
  var RECOVERY_CODES = makeSet(['none', 'replayed', 'discarded', 'closed', 'repaired']);
  var KNOWN_RECORD_KINDS = makeSet([
    'family-control', 'family-journal', 'snapshot-page', 'lineage-overlay',
    'snapshot-manifest', 'family-dependency', 'source-dependency-page',
    'truth-generation', 'truth-generation-control', 'diagnostic-ledger'
  ]);
  var SNAPSHOT_RECORD_KINDS = makeSet([
    'snapshot-page', 'lineage-overlay', 'snapshot-manifest', 'family-dependency'
  ]);

  var LIMITS = frozenRecord([
    ['MAX_SOURCES_PER_FAMILY', 32],
    ['MAX_ASSERTIONS_PER_FAMILY', 2048],
    ['MAX_CONFLICTS_PER_FAMILY', 512],
    ['MAX_FAMILY_CITATIONS', 2048],
    ['MAX_DEADLINES_PER_FAMILY', 512],
    ['MAX_LINEAGE_ENTRIES', 128],
    ['MAX_PAGES_PER_CATEGORY', 64],
    ['MAX_ENTRIES_PER_PAGE', 256],
    ['MAX_VALUE_BYTES', 262144],
    ['MAX_SNAPSHOT_BYTES', 8388608],
    ['MAX_FAMILIES_PER_SOURCE', 1024],
    ['MAX_RECOVERY_STEPS', 128],
    ['MAX_DIAGNOSTICS', 100],
    ['MAX_DIAGNOSTIC_BYTES', 65536],
    ['DIAGNOSTIC_RETENTION_MS', 2592000000]
  ]);

  var CONTROL_KEYS = [
    'version', 'kind', 'partitionKey', 'familyId', 'state', 'activeSnapshotId',
    'updatedAt', 'reason', 'controlHash'
  ];
  var JOURNAL_KEYS = [
    'version', 'kind', 'partitionKey', 'familyId', 'priorSnapshotId',
    'state', 'reason', 'updatedAt', 'journalHash'
  ];
  var PAGE_KEYS = [
    'version', 'kind', 'partitionKey', 'familyId', 'snapshotId', 'category',
    'pageOrdinal', 'itemCount', 'items', 'pageHash', 'recordHash'
  ];
  var LINEAGE_KEYS = [
    'version', 'kind', 'partitionKey', 'familyId', 'snapshotId',
    'documentStableIds', 'lineageRelationIds', 'lineageProof', 'recordHash'
  ];
  var MANIFEST_KEYS = [
    'version', 'kind', 'partitionKey', 'familyId', 'snapshotId',
    'chunkOrdinal', 'chunkCount', 'content', 'chunkHash', 'recordHash'
  ];
  var FAMILY_DEPENDENCY_KEYS = [
    'version', 'kind', 'partitionKey', 'familyId', 'snapshotId',
    'sourceBindings', 'recordHash'
  ];
  var SOURCE_DEPENDENCY_PAGE_KEYS = [
    'version', 'kind', 'partitionKey', 'sourceFileId', 'pageOrdinal',
    'pageCount', 'entries', 'pageHash', 'recordHash'
  ];
  var SOURCE_DEPENDENCY_ENTRY_KEYS = ['familyId', 'snapshotId'];
  var GENERATION_FAMILY_KEYS = ['familyId', 'snapshotId'];
  var GENERATION_KEYS = [
    'version', 'kind', 'partitionKey', 'outputGenerationId',
    'authorizedSetDigest', 'families', 'recordHash'
  ];
  var GENERATION_CONTROL_KEYS = [
    'version', 'kind', 'partitionKey', 'activeOutputGenerationId',
    'updatedAt', 'controlHash'
  ];
  var RECOVERY_PROGRESS_KEYS = [
    'version', 'kind', 'inventoryDigest', 'taskCount', 'nextTaskOrdinal',
    'repaired', 'progressHash'
  ];
  var GENERATION_INPUT_KEYS = [
    'partitionKey', 'authorizedSetDigest', 'familyIds'
  ];
  var REPLACEMENT_KEYS = [
    'schemaVersion', 'partitionKey', 'familyId', 'authorizedSetDigest',
    'sourceBindings', 'recordVersionIds', 'relationVersionIds',
    'candidateGenerationIds', 'candidateSchemaVersion', 'promptVersion',
    'adjudicationVersion', 'deadlineRuleVersion', 'calendarVersion',
    'evaluationContext'
  ];
  var WITHDRAW_KEYS = ['partitionKey', 'sourceFileIds', 'reason'];
  var SOURCE_INVALIDATION_KEYS = [
    'partitionKey', 'sourceFileId', 'priorFragmentGenerationId',
    'nextFragmentGenerationId', 'reason'
  ];
  var OVERLAY_INVALIDATION_KEYS = [
    'partitionKey', 'proposingSourceFileId', 'affectedSourceFileIds',
    'priorOverlayGenerationId', 'nextOverlayGenerationId', 'reason'
  ];
  var PARTICIPANT_REQUEST_KEYS = [
    'partitionKey', 'accountPermissionId', 'corpusRootFileId',
    'sourceFileId', 'reason'
  ];
  var DIAGNOSTIC_INPUT_KEYS = [
    'partitionKey', 'operation', 'outcome', 'reason',
    'attemptedCount', 'acceptedCount', 'publishedCount', 'withdrawnCount',
    'durationMs', 'retryCount', 'repairCount', 'recoveryCode'
  ];
  var DIAGNOSTIC_RECORD_KEYS = [
    'version', 'operation', 'outcome', 'reason',
    'attemptedCount', 'acceptedCount', 'publishedCount', 'withdrawnCount',
    'durationBucket', 'retryCount', 'repairCount', 'recoveryCode', 'timestamp'
  ];
  var DIAGNOSTIC_LEDGER_KEYS = [
    'version', 'kind', 'partitionKey', 'records', 'recordHash'
  ];

  function makeSet(values) {
    var output = Object.create(null);
    for (var index = 0; index < values.length; index += 1) output[values[index]] = true;
    return Object.freeze(output);
  }

  function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
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

  function ok(status, extra) {
    var entries = [['ok', true], ['status', status]];
    if (extra) {
      Object.keys(extra).forEach(function(key) { entries.push([key, extra[key]]); });
    }
    return frozenRecord(entries);
  }

  function failed(status) {
    return frozenRecord([['ok', false], ['status', status]]);
  }

  function strictOk() {
    return frozenRecord([['ok', true]]);
  }

  function strictFailure() {
    return frozenRecord([['ok', false]]);
  }

  function absent(value) {
    return frozenRecord([['owned', value]]);
  }

  function statusError(status) {
    var error = new Error('fixed truth store failure');
    error.truthStatus = status;
    return error;
  }

  function safeInteger(value, maximum) {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  }

  function validSignal(value) {
    return !!value && typeof value === 'object' && typeof value.aborted === 'boolean' &&
      typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function';
  }

  function validSourceId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validDigest(value, prefix) {
    return typeof value === 'string' &&
      new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[0-9a-f]{64}$').test(value);
  }

  function validFingerprint(value) {
    return validDigest(value, 'sha256:');
  }

  function validAuthorizedSetDigest(value) {
    return validDigest(value, 'sgx1:');
  }

  function validFamilyId(value) {
    return validDigest(value, 'stf1:');
  }

  function validSnapshotId(value) {
    return validDigest(value, 'sts1:');
  }

  function validOutputGenerationId(value) {
    return validDigest(value, 'stp1:');
  }

  function validGeneration(value) {
    return value === null || validDigest(value, 'sfg1:');
  }

  function validOverlayGeneration(value) {
    return value === null || validDigest(value, 'sog1:');
  }

  function validPartition(corpusSchema, value) {
    return typeof value === 'string' && !!corpusSchema.parsePartitionKey(value);
  }

  function canonicalCopy(schema, value) {
    var canonical = schema.canonicalize(value);
    if (typeof canonical !== 'string') return null;
    try {
      var parsed = JSON.parse(canonical);
      return deepFreeze(parsed);
    } catch (_error) {
      return null;
    }
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function canonicalEqual(schema, left, right) {
    var leftCanonical = schema.canonicalize(left);
    return typeof leftCanonical === 'string' && leftCanonical === schema.canonicalize(right);
  }

  function component(value) {
    return String(value.length) + ':' + value;
  }

  function familyStorageKey(kind, partitionKey, familyId, snapshotId) {
    var key = PREFIX + kind + ':' + component(partitionKey) + component(familyId);
    if (snapshotId !== undefined && snapshotId !== null) key += component(snapshotId);
    return key;
  }

  function familyPrefix(kind, partitionKey, familyId) {
    return PREFIX + kind + ':' + component(partitionKey) + component(familyId);
  }

  function snapshotPageKey(partitionKey, familyId, snapshotId, category, ordinal) {
    return familyStorageKey('page', partitionKey, familyId, snapshotId) +
      component(category) + ':' + String(ordinal);
  }

  function manifestChunkKey(partitionKey, familyId, snapshotId, ordinal) {
    return familyStorageKey('manifest', partitionKey, familyId, snapshotId) +
      ':' + String(ordinal);
  }

  function sourceDependencyKey(partitionKey, sourceFileId, ordinal) {
    return PREFIX + 'source-dependency:' + component(partitionKey) +
      component(sourceFileId) + ':' + String(ordinal);
  }

  function sourceDependencyPrefix(partitionKey, sourceFileId) {
    return PREFIX + 'source-dependency:' + component(partitionKey) + component(sourceFileId);
  }

  function diagnosticKey(partitionKey) {
    return PREFIX + 'diagnostic:' + component(partitionKey);
  }

  function generationKey(partitionKey, outputGenerationId) {
    return PREFIX + 'generation:' + component(partitionKey) +
      component(outputGenerationId);
  }

  function generationControlKey(partitionKey) {
    return PREFIX + 'generation-control:' + component(partitionKey);
  }

  function recoveryProgressKey() {
    return PREFIX + 'recovery-progress';
  }

  function keyBelongsToPartition(key, partitionKey) {
    if (typeof key !== 'string' || key.indexOf(PREFIX) !== 0) return false;
    var separator = key.indexOf(':', PREFIX.length);
    if (separator < 0) return false;
    return key.slice(separator + 1).indexOf(component(partitionKey)) === 0;
  }

    function splitPages(values) {
      var pages = [];
      if (values.length === 0) return [[]];
    for (var index = 0; index < values.length; index += LIMITS.MAX_ENTRIES_PER_PAGE) {
      pages.push(values.slice(index, index + LIMITS.MAX_ENTRIES_PER_PAGE));
    }
      return pages.length <= LIMITS.MAX_PAGES_PER_CATEGORY ? pages : null;
    }

    function splitSnapshotPages(category, values, measure) {
      if (values.length === 0) return [[]];
      var pages = [];
      var current = [];
      for (var index = 0; index < values.length; index += 1) {
        var candidate = current.concat([values[index]]);
        var payload = frozenRecord([
          ['category', category],
          ['pageOrdinal', pages.length],
          ['itemCount', candidate.length],
          ['items', frozenArray(candidate)]
        ]);
        var bytes;
        try {
          bytes = measure(JSON.stringify(payload));
        } catch (_error) {
          return null;
        }
        if (candidate.length > LIMITS.MAX_ENTRIES_PER_PAGE ||
            bytes > LIMITS.MAX_VALUE_BYTES - 4096) {
          if (current.length === 0) return null;
          pages.push(current);
          current = [values[index]];
          payload = frozenRecord([
            ['category', category],
            ['pageOrdinal', pages.length],
            ['itemCount', current.length],
            ['items', frozenArray(current)]
          ]);
          try {
            bytes = measure(JSON.stringify(payload));
          } catch (_error) {
            return null;
          }
          if (bytes > LIMITS.MAX_VALUE_BYTES - 4096) return null;
        } else {
          current = candidate;
        }
        if (pages.length >= LIMITS.MAX_PAGES_PER_CATEGORY) return null;
      }
      pages.push(current);
      return pages.length <= LIMITS.MAX_PAGES_PER_CATEGORY ? pages : null;
    }

  function sortedUniqueStrings(value, maximum, minimum, validator) {
    var values = denseArray(value, maximum, minimum);
    if (!values) return null;
    for (var index = 0; index < values.length; index += 1) {
      if (!validator(values[index])) return null;
      if (index > 0 && compareText(values[index - 1], values[index]) >= 0) return null;
    }
    return frozenArray(values);
  }

  function parseSourceBindings(value) {
    var values = denseArray(value, LIMITS.MAX_SOURCES_PER_FAMILY, 1);
    if (!values) return null;
    var output = [];
    for (var index = 0; index < values.length; index += 1) {
      var item = exactFields(values[index], [
        'sourceFileId', 'contentFingerprint', 'fragmentGenerationId',
        'sourceState', 'certified'
      ]);
      if (!item || !validSourceId(item.sourceFileId) ||
          !validFingerprint(item.contentFingerprint) ||
          !validDigest(item.fragmentGenerationId, 'sfg1:') ||
          typeof item.sourceState !== 'string' || item.sourceState.length === 0 ||
          typeof item.certified !== 'boolean' ||
          (index > 0 &&
            compareText(output[index - 1].sourceFileId, item.sourceFileId) >= 0)) {
        return null;
      }
      output.push(frozenRecord([
        ['sourceFileId', item.sourceFileId],
        ['contentFingerprint', item.contentFingerprint],
        ['fragmentGenerationId', item.fragmentGenerationId],
        ['sourceState', item.sourceState],
        ['certified', item.certified]
      ]));
    }
    return frozenArray(output);
  }

  function parseReplacementInput(value, truthSchema, corpusSchema) {
    var input = exactFields(value, REPLACEMENT_KEYS);
    if (!input || input.schemaVersion !== truthSchema.VERSION ||
        !validPartition(corpusSchema, input.partitionKey) ||
        !validFamilyId(input.familyId) ||
        !validAuthorizedSetDigest(input.authorizedSetDigest) ||
        input.candidateSchemaVersion !== truthSchema.CANDIDATE_SCHEMA_VERSION ||
        input.promptVersion !== truthSchema.PROMPT_VERSION ||
        input.adjudicationVersion !== truthSchema.ADJUDICATION_VERSION ||
        input.deadlineRuleVersion !== truthSchema.DEADLINE_RULE_VERSION ||
        input.calendarVersion !== truthSchema.CALENDAR_VERSION) return null;
    var sources = parseSourceBindings(input.sourceBindings);
    var records = sortedUniqueStrings(input.recordVersionIds, 4096, 1, function(item) {
      return validDigest(item, 'srv1:');
    });
    var relations = sortedUniqueStrings(input.relationVersionIds, 16384, 0, function(item) {
      return validDigest(item, 'slv1:') || validDigest(item, 'scv1:');
    });
    var candidates = sortedUniqueStrings(input.candidateGenerationIds, 1024, 1, function(item) {
      return validDigest(item, 'stg1:');
    });
    var evaluationContext = canonicalCopy(truthSchema, input.evaluationContext);
    if (!sources || !records || !relations || !candidates || !evaluationContext) return null;
    return frozenRecord([
      ['schemaVersion', input.schemaVersion],
      ['partitionKey', input.partitionKey],
      ['familyId', input.familyId],
      ['authorizedSetDigest', input.authorizedSetDigest],
      ['sourceBindings', sources],
      ['recordVersionIds', records],
      ['relationVersionIds', relations],
      ['candidateGenerationIds', candidates],
      ['candidateSchemaVersion', input.candidateSchemaVersion],
      ['promptVersion', input.promptVersion],
      ['adjudicationVersion', input.adjudicationVersion],
      ['deadlineRuleVersion', input.deadlineRuleVersion],
      ['calendarVersion', input.calendarVersion],
      ['evaluationContext', evaluationContext]
    ]);
  }

  function proofMatchesBinding(truthSchema, proof, binding) {
    return proof.schemaVersion === binding.schemaVersion &&
      proof.partitionKey === binding.partitionKey && proof.familyId === binding.familyId &&
      proof.authorizedSetDigest === binding.authorizedSetDigest &&
      proof.candidateSchemaVersion === binding.candidateSchemaVersion &&
      proof.promptVersion === binding.promptVersion &&
      proof.adjudicationVersion === binding.adjudicationVersion &&
      proof.deadlineRuleVersion === binding.deadlineRuleVersion &&
      proof.calendarVersion === binding.calendarVersion &&
      canonicalEqual(truthSchema, proof.sourceBindings, binding.sourceBindings) &&
      canonicalEqual(truthSchema, proof.recordVersionIds, binding.recordVersionIds) &&
      canonicalEqual(truthSchema, proof.relationVersionIds, binding.relationVersionIds) &&
      canonicalEqual(truthSchema, proof.candidateGenerationIds, binding.candidateGenerationIds) &&
      canonicalEqual(truthSchema, proof.evaluationContext, binding.evaluationContext);
  }

  function create(options) {
    var fields = exactFields(options, [
      'storageArea', 'truthSchema', 'corpusSchema', 'now', 'byteLength'
    ]);
    if (!fields || !fields.storageArea ||
        typeof fields.storageArea.get !== 'function' ||
        typeof fields.storageArea.set !== 'function' ||
        typeof fields.storageArea.remove !== 'function' ||
        fields.truthSchema !== global.FsbSkopeoTruthSchema ||
        fields.corpusSchema !== global.FsbSkopeoCorpusSchema ||
        !fields.truthSchema.LIMITS ||
        fields.truthSchema.LIMITS.MAX_FAMILY_CITATIONS !== LIMITS.MAX_FAMILY_CITATIONS ||
        typeof fields.now !== 'function' || typeof fields.byteLength !== 'function') {
      throw new TypeError('Invalid Skopeo truth store dependencies');
    }

    var storage = fields.storageArea;
    var truthSchema = fields.truthSchema;
    var corpusSchema = fields.corpusSchema;
    var now = fields.now;
    var byteLength = fields.byteLength;
    var issuedMutations = new WeakMap();
    var issuedHandles = new WeakMap();
    var issuedManifests = new WeakMap();
    var issuedParticipantBinders = new Set();
    var mutationSequence = 0;
    var replacementSequence = 0;
    var globalLane = Promise.resolve();

    function mutationFields(value) {
      var guard = exactFields(value, ['signal', 'operationToken', 'operationEpoch']);
      return guard && validSignal(guard.signal) && guard.operationToken &&
        typeof guard.operationToken === 'object' &&
        safeInteger(guard.operationEpoch, Number.MAX_SAFE_INTEGER) ? guard : null;
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
        kind: 'mutation',
        guard: guard,
        token: token,
        signal: signal,
        operationEpoch: mutationSequence,
        active: true,
        inFlight: 0,
        listener: null
      };
      record.listener = function() { record.active = false; };
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
      if (!mutationOpen(mutation)) return 'stale-operation';
      if (error && error.truthStatus) return error.truthStatus;
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
      if (!mutation || !mutationOpen(mutation) || typeof work !== 'function') {
        return failed('stale-operation');
      }
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

    function verifiedAuthorization(context) {
      var view;
      try {
        view = context.verifier(
          context.capability, context.mode, context.request);
      } catch (_error) {
        return null;
      }
      var parsed = exactFields(view, ['signal', 'operationEpoch']);
      if (!parsed || !validSignal(parsed.signal) || parsed.signal.aborted ||
          !safeInteger(parsed.operationEpoch, Number.MAX_SAFE_INTEGER)) return null;
      return frozenRecord([
        ['signal', parsed.signal],
        ['operationEpoch', parsed.operationEpoch]
      ]);
    }

    function contextOpen(context) {
      if (!context) return true;
      if (context.kind === 'mutation') return mutationOpen(context);
      return !!verifiedAuthorization(context);
    }

    async function checkedAwait(context, promise) {
      if (!contextOpen(context)) throw statusError('stale-operation');
      var before = context && context.kind === 'participant'
        ? verifiedAuthorization(context) : null;
      var value = await promise;
      if (!contextOpen(context)) throw statusError('stale-operation');
      if (before) {
        var after = verifiedAuthorization(context);
        if (!after || after.signal !== before.signal ||
            after.operationEpoch !== before.operationEpoch) {
          throw statusError('stale-operation');
        }
      }
      return value;
    }

    function validateStoredMap(value) {
      return isPlainRecord(value) ? value : null;
    }

    async function readOne(key, context) {
      var values = await checkedAwait(context, storage.get(key));
      values = validateStoredMap(values);
      if (!values) throw statusError('recovery-pending');
      return own(values, key)
        ? frozenRecord([['present', true], ['value', values[key]]])
        : frozenRecord([['present', false], ['value', null]]);
    }

    async function readAll(context) {
      var values = await checkedAwait(context, storage.get(null));
      values = validateStoredMap(values);
      if (!values) throw statusError('recovery-pending');
      return values;
    }

    async function writeOne(key, value, context) {
      var serialized;
      try {
        serialized = JSON.stringify(value);
      } catch (_error) {
        throw statusError('validation-failed');
      }
      var bytes;
      try {
        bytes = byteLength(serialized);
      } catch (_error) {
        throw statusError('validation-failed');
      }
      if (!safeInteger(bytes, LIMITS.MAX_VALUE_BYTES)) throw statusError('quota-exceeded');
      var update = Object.create(null);
      update[key] = value;
      if (context && context.recoveryTouchedKeys instanceof Set) {
        context.recoveryTouchedKeys.add(key);
      }
      await checkedAwait(context, storage.set(update));
    }

    async function removeKeys(keys, context) {
      var unique = Array.from(new Set(keys)).sort();
      if (unique.length === 0) return;
      if (context && context.recoveryTouchedKeys instanceof Set) {
        unique.forEach(function(key) {
          context.recoveryTouchedKeys.add(key);
        });
      }
      await checkedAwait(context, storage.remove(unique));
    }

    async function hash(value, context) {
      var digest = await checkedAwait(context, truthSchema.sha256Hex(value));
      if (!validFingerprint(digest)) {
        var serialized;
        try {
          serialized = JSON.stringify(value);
        } catch (_error) {
          throw statusError('validation-failed');
        }
        var cryptoObject = global && global.crypto;
        var Encoder = global && global.TextEncoder;
        if (typeof serialized !== 'string' || !cryptoObject || !cryptoObject.subtle ||
            typeof cryptoObject.subtle.digest !== 'function' ||
            typeof Encoder !== 'function') throw statusError('validation-failed');
        var buffer = await checkedAwait(
          context,
          cryptoObject.subtle.digest('SHA-256', new Encoder().encode(serialized))
        );
        var bytes = new Uint8Array(buffer);
        var hex = '';
        for (var index = 0; index < bytes.length; index += 1) {
          hex += bytes[index].toString(16).padStart(2, '0');
        }
        digest = 'sha256:' + hex;
      }
      if (!validFingerprint(digest)) throw statusError('validation-failed');
      return digest;
    }

    function controlBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'family-control'],
        ['partitionKey', values.partitionKey],
        ['familyId', values.familyId],
        ['state', values.state],
        ['activeSnapshotId', values.activeSnapshotId || null],
        ['updatedAt', values.updatedAt],
        ['reason', values.reason]
      ]);
    }

    async function makeControl(values, context) {
      var body = controlBody(values);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['controlHash', await hash(body, context)]]));
    }

    async function parseControl(value, context) {
      var fields = exactFields(value, CONTROL_KEYS);
      if (!fields || fields.version !== VERSION || fields.kind !== 'family-control' ||
          !validPartition(corpusSchema, fields.partitionKey) ||
          !validFamilyId(fields.familyId) || !STATES[fields.state] ||
          !safeInteger(fields.updatedAt, Number.MAX_SAFE_INTEGER) ||
          !REASONS[fields.reason] ||
          !(fields.activeSnapshotId === null || validSnapshotId(fields.activeSnapshotId)) ||
          (fields.state === 'published' ? fields.activeSnapshotId === null :
            fields.activeSnapshotId !== null) ||
          !validFingerprint(fields.controlHash)) return null;
      var body = controlBody(fields);
      if (await hash(body, context) !== fields.controlHash) return null;
      return frozenRecord(Object.keys(body).map(function(key) { return [key, body[key]]; }));
    }

    function parseGenerationInput(value) {
      var fields = exactFields(value, GENERATION_INPUT_KEYS);
      var familyIds = fields && sortedUniqueStrings(
        fields.familyIds,
        LIMITS.MAX_FAMILIES_PER_SOURCE,
        0,
        validFamilyId
      );
      if (!fields || !familyIds ||
          !validPartition(corpusSchema, fields.partitionKey) ||
          !validAuthorizedSetDigest(fields.authorizedSetDigest)) return null;
      return frozenRecord([
        ['partitionKey', fields.partitionKey],
        ['authorizedSetDigest', fields.authorizedSetDigest],
        ['familyIds', familyIds]
      ]);
    }

    function generationIdentity(values) {
      return frozenRecord([
        ['version', VERSION],
        ['partitionKey', values.partitionKey],
        ['authorizedSetDigest', values.authorizedSetDigest],
        ['families', frozenArray(values.families)]
      ]);
    }

    async function deriveOutputGenerationId(values, context) {
      var digest = await hash(generationIdentity(values), context);
      return 'stp1:' + digest.slice('sha256:'.length);
    }

    function generationBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'truth-generation'],
        ['partitionKey', values.partitionKey],
        ['outputGenerationId', values.outputGenerationId],
        ['authorizedSetDigest', values.authorizedSetDigest],
        ['families', frozenArray(values.families)]
      ]);
    }

    async function makeGeneration(values, context) {
      var outputGenerationId = await deriveOutputGenerationId(values, context);
      var body = generationBody({
        partitionKey: values.partitionKey,
        outputGenerationId: outputGenerationId,
        authorizedSetDigest: values.authorizedSetDigest,
        families: values.families
      });
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parseGeneration(value, expectedPartitionKey, context) {
      var fields = exactFields(value, GENERATION_KEYS);
      var rawFamilies = fields && denseArray(
        fields.families, LIMITS.MAX_FAMILIES_PER_SOURCE, 0);
      if (!fields || !rawFamilies || fields.version !== VERSION ||
          fields.kind !== 'truth-generation' ||
          fields.partitionKey !== expectedPartitionKey ||
          !validPartition(corpusSchema, fields.partitionKey) ||
          !validOutputGenerationId(fields.outputGenerationId) ||
          !validAuthorizedSetDigest(fields.authorizedSetDigest) ||
          !validFingerprint(fields.recordHash)) return null;
      var families = [];
      for (var index = 0; index < rawFamilies.length; index += 1) {
        var item = exactFields(rawFamilies[index], GENERATION_FAMILY_KEYS);
        if (!item || !validFamilyId(item.familyId) ||
            !validSnapshotId(item.snapshotId) ||
            (index > 0 &&
              compareText(families[index - 1].familyId, item.familyId) >= 0)) {
          return null;
        }
        families.push(frozenRecord([
          ['familyId', item.familyId],
          ['snapshotId', item.snapshotId]
        ]));
      }
      var expectedId = await deriveOutputGenerationId({
        partitionKey: fields.partitionKey,
        authorizedSetDigest: fields.authorizedSetDigest,
        families: families
      }, context);
      if (expectedId !== fields.outputGenerationId) return null;
      var body = generationBody({
        partitionKey: fields.partitionKey,
        outputGenerationId: fields.outputGenerationId,
        authorizedSetDigest: fields.authorizedSetDigest,
        families: families
      });
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    function generationControlBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'truth-generation-control'],
        ['partitionKey', values.partitionKey],
        ['activeOutputGenerationId', values.activeOutputGenerationId],
        ['updatedAt', values.updatedAt]
      ]);
    }

    async function makeGenerationControl(values, context) {
      var body = generationControlBody(values);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['controlHash', await hash(body, context)]]));
    }

    async function parseGenerationControl(value, partitionKey, context) {
      var fields = exactFields(value, GENERATION_CONTROL_KEYS);
      if (!fields || fields.version !== VERSION ||
          fields.kind !== 'truth-generation-control' ||
          fields.partitionKey !== partitionKey ||
          !validOutputGenerationId(fields.activeOutputGenerationId) ||
          !safeInteger(fields.updatedAt, Number.MAX_SAFE_INTEGER) ||
          !validFingerprint(fields.controlHash)) return null;
      var body = generationControlBody(fields);
      return await hash(body, context) === fields.controlHash ? body : null;
    }

    function recoveryProgressBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'recovery-progress'],
        ['inventoryDigest', values.inventoryDigest],
        ['taskCount', values.taskCount],
        ['nextTaskOrdinal', values.nextTaskOrdinal],
        ['repaired', values.repaired]
      ]);
    }

    async function makeRecoveryProgress(values, context) {
      var body = recoveryProgressBody(values);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['progressHash', await hash(body, context)]]));
    }

    async function parseRecoveryProgress(value, context) {
      var fields = exactFields(value, RECOVERY_PROGRESS_KEYS);
      if (!fields || fields.version !== VERSION ||
          fields.kind !== 'recovery-progress' ||
          !validFingerprint(fields.inventoryDigest) ||
          !safeInteger(fields.taskCount, Number.MAX_SAFE_INTEGER) ||
          !safeInteger(fields.nextTaskOrdinal, fields.taskCount) ||
          typeof fields.repaired !== 'boolean' ||
          !validFingerprint(fields.progressHash)) return null;
      var body = recoveryProgressBody(fields);
      return await hash(body, context) === fields.progressHash ? body : null;
    }

    function recoveryInventoryValue(value) {
      var canonical = truthSchema.canonicalize(value);
      if (typeof canonical === 'string') return 'canonical:' + canonical;
      try {
        var serialized = JSON.stringify(value);
        return typeof serialized === 'string' ? 'json:' + serialized : null;
      } catch (_error) {
        return null;
      }
    }

    async function recoveryInventoryDigest(values, context) {
      var progressKey = recoveryProgressKey();
      var keys = Object.keys(values).filter(function(key) {
        return key.indexOf(PREFIX) === 0 && key !== progressKey;
      }).sort();
      var inventory = 'skopeo-truth-recovery-inventory/1';
      for (var index = 0; index < keys.length; index += 1) {
        var serialized = recoveryInventoryValue(values[keys[index]]);
        if (serialized === null) throw statusError('recovery-pending');
        inventory += component(keys[index]) + component(serialized);
      }
      return hash(inventory, context);
    }

    function recoveryInventoryChangedOutside(before, after, touchedKeys) {
      var progressKey = recoveryProgressKey();
      var keys = Array.from(new Set(
        Object.keys(before).concat(Object.keys(after))
      )).filter(function(key) {
        return key.indexOf(PREFIX) === 0 && key !== progressKey &&
          !touchedKeys.has(key);
      }).sort();
      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        if (own(before, key) !== own(after, key)) return true;
        if (own(before, key) &&
            recoveryInventoryValue(before[key]) !==
              recoveryInventoryValue(after[key])) return true;
      }
      return false;
    }

    async function readActiveGeneration(partitionKey, context, validateFamilies) {
      var pointerEntry = await readOne(generationControlKey(partitionKey), context);
      if (!pointerEntry.present) return null;
      var pointer = await parseGenerationControl(
        pointerEntry.value, partitionKey, context);
      if (!pointer) return null;
      var generationEntry = await readOne(
        generationKey(partitionKey, pointer.activeOutputGenerationId), context);
      var generation = generationEntry.present
        ? await parseGeneration(generationEntry.value, partitionKey, context)
        : null;
      if (!generation ||
          generation.outputGenerationId !== pointer.activeOutputGenerationId) return null;
      if (!validateFamilies) return generation;
      for (var index = 0; index < generation.families.length; index += 1) {
        var family = generation.families[index];
        var controlEntry = await readOne(
          familyStorageKey('control', partitionKey, family.familyId), context);
        var control = controlEntry.present
          ? await parseControl(controlEntry.value, context)
          : null;
        if (!control || control.state !== 'published' ||
            control.activeSnapshotId !== family.snapshotId) return null;
        var manifest = await readStoredManifest({
          partitionKey: partitionKey,
          familyId: family.familyId,
          snapshotId: family.snapshotId
        }, context);
        if (!manifest || manifest.authorizedSetDigest !==
            generation.authorizedSetDigest ||
            !await readSnapshot(manifest, context, true)) return null;
      }
      return generation;
    }

    function journalBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'family-journal'],
        ['partitionKey', values.partitionKey],
        ['familyId', values.familyId],
        ['priorSnapshotId', values.priorSnapshotId || null],
        ['state', values.state],
        ['reason', values.reason],
        ['updatedAt', values.updatedAt]
      ]);
    }

    async function makeJournal(values, context) {
      var body = journalBody(values);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['journalHash', await hash(body, context)]]));
    }

    async function parseJournal(value, context) {
      var fields = exactFields(value, JOURNAL_KEYS);
      if (!fields || fields.version !== VERSION || fields.kind !== 'family-journal' ||
          !validPartition(corpusSchema, fields.partitionKey) ||
          !validFamilyId(fields.familyId) ||
          !(fields.priorSnapshotId === null || validSnapshotId(fields.priorSnapshotId)) ||
          !makeSet(['purging', 'staging'])[fields.state] ||
          !REASONS[fields.reason] ||
          !safeInteger(fields.updatedAt, Number.MAX_SAFE_INTEGER) ||
          !validFingerprint(fields.journalHash)) return null;
      var body = journalBody(fields);
      return await hash(body, context) === fields.journalHash ? body : null;
    }

    function pagePayload(category, ordinal, items) {
      return frozenRecord([
        ['category', category],
        ['pageOrdinal', ordinal],
        ['itemCount', items.length],
        ['items', frozenArray(items)]
      ]);
    }

    async function makePage(values, context) {
      var payload = pagePayload(values.category, values.pageOrdinal, values.items);
      var pageHash = await hash(payload, context);
      var body = frozenRecord([
        ['version', VERSION],
        ['kind', 'snapshot-page'],
        ['partitionKey', values.partitionKey],
        ['familyId', values.familyId],
        ['snapshotId', values.snapshotId],
        ['category', values.category],
        ['pageOrdinal', values.pageOrdinal],
        ['itemCount', values.items.length],
        ['items', frozenArray(values.items)],
        ['pageHash', pageHash]
      ]);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parsePage(value, expected, context) {
      var fields = exactFields(value, PAGE_KEYS);
      var items = fields && denseArray(fields.items, LIMITS.MAX_ENTRIES_PER_PAGE, 0);
      if (!fields || !items || fields.version !== VERSION || fields.kind !== 'snapshot-page' ||
          fields.partitionKey !== expected.partitionKey ||
          fields.familyId !== expected.familyId || fields.snapshotId !== expected.snapshotId ||
          fields.category !== expected.category || fields.pageOrdinal !== expected.pageOrdinal ||
          fields.itemCount !== items.length || fields.itemCount !== expected.itemCount ||
          !validFingerprint(fields.pageHash) || fields.pageHash !== expected.pageHash ||
          !validFingerprint(fields.recordHash)) return null;
      var payload = pagePayload(fields.category, fields.pageOrdinal, items);
      if (await hash(payload, context) !== fields.pageHash) return null;
      var body = frozenRecord([
        ['version', VERSION], ['kind', 'snapshot-page'],
        ['partitionKey', fields.partitionKey], ['familyId', fields.familyId],
        ['snapshotId', fields.snapshotId], ['category', fields.category],
        ['pageOrdinal', fields.pageOrdinal], ['itemCount', fields.itemCount],
        ['items', frozenArray(items)], ['pageHash', fields.pageHash]
      ]);
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    function lineageBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'lineage-overlay'],
        ['partitionKey', values.partitionKey],
        ['familyId', values.familyId],
        ['snapshotId', values.snapshotId],
        ['documentStableIds', values.documentStableIds],
        ['lineageRelationIds', values.lineageRelationIds],
        ['lineageProof', values.lineageProof]
      ]);
    }

    async function makeLineage(values, context) {
      var body = lineageBody(values);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parseLineage(value, expected, context) {
      var fields = exactFields(value, LINEAGE_KEYS);
      if (!fields || fields.version !== VERSION || fields.kind !== 'lineage-overlay' ||
          fields.partitionKey !== expected.partitionKey ||
          fields.familyId !== expected.familyId || fields.snapshotId !== expected.snapshotId ||
          !validFingerprint(fields.recordHash)) return null;
      var body = lineageBody(fields);
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    function manifestChunkBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'snapshot-manifest'],
        ['partitionKey', values.partitionKey],
        ['familyId', values.familyId],
        ['snapshotId', values.snapshotId],
        ['chunkOrdinal', values.chunkOrdinal],
        ['chunkCount', values.chunkCount],
        ['content', values.content],
        ['chunkHash', values.chunkHash]
      ]);
    }

    async function makeManifestChunk(values, context) {
      var chunkHash = await hash(values.content, context);
      var body = manifestChunkBody({
        partitionKey: values.partitionKey,
        familyId: values.familyId,
        snapshotId: values.snapshotId,
        chunkOrdinal: values.chunkOrdinal,
        chunkCount: values.chunkCount,
        content: values.content,
        chunkHash: chunkHash
      });
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parseManifestChunk(value, expected, context) {
      var fields = exactFields(value, MANIFEST_KEYS);
      if (!fields || fields.version !== VERSION || fields.kind !== 'snapshot-manifest' ||
          fields.partitionKey !== expected.partitionKey ||
          fields.familyId !== expected.familyId ||
          fields.snapshotId !== expected.snapshotId ||
          fields.chunkOrdinal !== expected.chunkOrdinal ||
          fields.chunkCount !== expected.chunkCount ||
          typeof fields.content !== 'string' ||
          !validFingerprint(fields.chunkHash) ||
          !validFingerprint(fields.recordHash)) return null;
      if (await hash(fields.content, context) !== fields.chunkHash) return null;
      var body = manifestChunkBody(fields);
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    function splitManifestText(text) {
      var chunks = [];
      var start = 0;
      var targetBytes = Math.floor(LIMITS.MAX_VALUE_BYTES / 2) - 4096;
      while (start < text.length) {
        var low = start + 1;
        var high = text.length;
        var best = -1;
        while (low <= high) {
          var middle = Math.floor((low + high) / 2);
          var bytes;
          try {
            bytes = byteLength(text.slice(start, middle));
          } catch (_error) {
            return null;
          }
          if (bytes <= targetBytes) {
            best = middle;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }
        if (best <= start) return null;
        chunks.push(text.slice(start, best));
        if (chunks.length > LIMITS.MAX_PAGES_PER_CATEGORY) return null;
        start = best;
      }
      return chunks;
    }

    async function writeStoredManifest(manifest, context) {
      var text = truthSchema.canonicalize(manifest);
      var chunks = typeof text === 'string' ? splitManifestText(text) : null;
      if (!chunks || chunks.length === 0) throw statusError('quota-exceeded');
      for (var index = 0; index < chunks.length; index += 1) {
        var record = await makeManifestChunk({
          partitionKey: manifest.partitionKey,
          familyId: manifest.familyId,
          snapshotId: manifest.snapshotId,
          chunkOrdinal: index,
          chunkCount: chunks.length,
          content: chunks[index]
        }, context);
        await writeOne(manifestChunkKey(
          manifest.partitionKey, manifest.familyId,
          manifest.snapshotId, index), record, context);
      }
    }

    async function readStoredManifest(expected, context) {
      var firstEntry = await readOne(manifestChunkKey(
        expected.partitionKey, expected.familyId, expected.snapshotId, 0), context);
      if (!firstEntry.present) return null;
      var firstFields = exactFields(firstEntry.value, MANIFEST_KEYS);
      if (!firstFields || !safeInteger(
        firstFields.chunkCount, LIMITS.MAX_PAGES_PER_CATEGORY) ||
          firstFields.chunkCount < 1) return null;
      var chunks = [];
      for (var index = 0; index < firstFields.chunkCount; index += 1) {
        var entry = index === 0 ? firstEntry : await readOne(manifestChunkKey(
          expected.partitionKey, expected.familyId, expected.snapshotId, index), context);
        if (!entry.present) return null;
        var chunk = await parseManifestChunk(entry.value, {
          partitionKey: expected.partitionKey,
          familyId: expected.familyId,
          snapshotId: expected.snapshotId,
          chunkOrdinal: index,
          chunkCount: firstFields.chunkCount
        }, context);
        if (!chunk) return null;
        chunks.push(chunk.content);
      }
      var text = chunks.join('');
      var value;
      try {
        value = JSON.parse(text);
      } catch (_error) {
        return null;
      }
      var manifest = await checkedAwait(
        context, truthSchema.parseFamilySnapshotManifest(value));
      if (!manifest || manifest.partitionKey !== expected.partitionKey ||
          manifest.familyId !== expected.familyId ||
          manifest.snapshotId !== expected.snapshotId ||
          truthSchema.canonicalize(manifest) !== text) return null;
      return manifest;
    }

    function familyDependencyBody(values) {
      return frozenRecord([
        ['version', VERSION],
        ['kind', 'family-dependency'],
        ['partitionKey', values.partitionKey],
        ['familyId', values.familyId],
        ['snapshotId', values.snapshotId],
        ['sourceBindings', values.sourceBindings]
      ]);
    }

    async function makeFamilyDependency(values, context) {
      var body = familyDependencyBody(values);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parseFamilyDependency(value, expected, context) {
      var fields = exactFields(value, FAMILY_DEPENDENCY_KEYS);
      var sources = fields && parseSourceBindings(fields.sourceBindings);
      if (!fields || !sources || fields.version !== VERSION ||
          fields.kind !== 'family-dependency' ||
          fields.partitionKey !== expected.partitionKey ||
          fields.familyId !== expected.familyId || fields.snapshotId !== expected.snapshotId ||
          !validFingerprint(fields.recordHash)) return null;
      var body = familyDependencyBody({
        partitionKey: fields.partitionKey,
        familyId: fields.familyId,
        snapshotId: fields.snapshotId,
        sourceBindings: sources
      });
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    function dependencyEntry(value) {
      var fields = exactFields(value, SOURCE_DEPENDENCY_ENTRY_KEYS);
      return fields && validFamilyId(fields.familyId) && validSnapshotId(fields.snapshotId)
        ? frozenRecord([['familyId', fields.familyId], ['snapshotId', fields.snapshotId]])
        : null;
    }

    function sourceDependencyPayload(values) {
      return frozenRecord([
        ['partitionKey', values.partitionKey],
        ['sourceFileId', values.sourceFileId],
        ['pageOrdinal', values.pageOrdinal],
        ['pageCount', values.pageCount],
        ['entries', values.entries]
      ]);
    }

    async function makeSourceDependencyPage(values, context) {
      var payload = sourceDependencyPayload(values);
      var pageHash = await hash(payload, context);
      var body = frozenRecord([
        ['version', VERSION],
        ['kind', 'source-dependency-page'],
        ['partitionKey', values.partitionKey],
        ['sourceFileId', values.sourceFileId],
        ['pageOrdinal', values.pageOrdinal],
        ['pageCount', values.pageCount],
        ['entries', values.entries],
        ['pageHash', pageHash]
      ]);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parseSourceDependencyPage(value, expected, context) {
      var fields = exactFields(value, SOURCE_DEPENDENCY_PAGE_KEYS);
      var rawEntries = fields && denseArray(
        fields.entries, LIMITS.MAX_ENTRIES_PER_PAGE, expected.pageCount > 0 ? 1 : 0);
      if (!fields || !rawEntries || fields.version !== VERSION ||
          fields.kind !== 'source-dependency-page' ||
          fields.partitionKey !== expected.partitionKey ||
          fields.sourceFileId !== expected.sourceFileId ||
          fields.pageOrdinal !== expected.pageOrdinal ||
          fields.pageCount !== expected.pageCount ||
          !validFingerprint(fields.pageHash) || !validFingerprint(fields.recordHash)) return null;
      var entries = [];
      for (var index = 0; index < rawEntries.length; index += 1) {
        var parsed = dependencyEntry(rawEntries[index]);
        if (!parsed) return null;
        if (index > 0) {
          var previous = entries[index - 1];
          if (compareText(previous.familyId, parsed.familyId) > 0 ||
              (previous.familyId === parsed.familyId &&
                compareText(previous.snapshotId, parsed.snapshotId) >= 0)) return null;
        }
        entries.push(parsed);
      }
      var payload = sourceDependencyPayload({
        partitionKey: fields.partitionKey,
        sourceFileId: fields.sourceFileId,
        pageOrdinal: fields.pageOrdinal,
        pageCount: fields.pageCount,
        entries: frozenArray(entries)
      });
      if (await hash(payload, context) !== fields.pageHash) return null;
      var body = frozenRecord([
        ['version', VERSION], ['kind', 'source-dependency-page'],
        ['partitionKey', fields.partitionKey], ['sourceFileId', fields.sourceFileId],
        ['pageOrdinal', fields.pageOrdinal], ['pageCount', fields.pageCount],
        ['entries', frozenArray(entries)], ['pageHash', fields.pageHash]
      ]);
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    async function readSourceDependencies(partitionKey, sourceFileId, context) {
      var firstEntry = await readOne(sourceDependencyKey(partitionKey, sourceFileId, 0), context);
      if (!firstEntry.present) return frozenArray([]);
      var firstFields = exactFields(firstEntry.value, SOURCE_DEPENDENCY_PAGE_KEYS);
      if (!firstFields || !safeInteger(firstFields.pageCount, LIMITS.MAX_PAGES_PER_CATEGORY) ||
          firstFields.pageCount < 1) throw statusError('dependency-mismatch');
      var entries = [];
      for (var ordinal = 0; ordinal < firstFields.pageCount; ordinal += 1) {
        var entry = ordinal === 0
          ? firstEntry
          : await readOne(sourceDependencyKey(partitionKey, sourceFileId, ordinal), context);
        if (!entry.present) throw statusError('dependency-mismatch');
        var page = await parseSourceDependencyPage(entry.value, {
          partitionKey: partitionKey,
          sourceFileId: sourceFileId,
          pageOrdinal: ordinal,
          pageCount: firstFields.pageCount
        }, context);
        if (!page) throw statusError('dependency-mismatch');
        entries = entries.concat(Array.from(page.entries));
      }
      if (entries.length > LIMITS.MAX_FAMILIES_PER_SOURCE) {
        throw statusError('dependency-mismatch');
      }
      for (var index = 1; index < entries.length; index += 1) {
        var prior = entries[index - 1];
        var current = entries[index];
        if (compareText(prior.familyId, current.familyId) > 0 ||
            (prior.familyId === current.familyId &&
              compareText(prior.snapshotId, current.snapshotId) >= 0)) {
          throw statusError('dependency-mismatch');
        }
      }
      return frozenArray(entries);
    }

    async function writeSourceDependencies(partitionKey, sourceFileId, entries, context) {
      if (entries.length > LIMITS.MAX_FAMILIES_PER_SOURCE) {
        throw statusError('dependency-mismatch');
      }
      var pages = entries.length ? splitPages(entries) : [];
      if (!pages || pages.length > LIMITS.MAX_PAGES_PER_CATEGORY) {
        throw statusError('dependency-mismatch');
      }
      var removals = [];
      for (var ordinal = 0; ordinal < LIMITS.MAX_PAGES_PER_CATEGORY; ordinal += 1) {
        removals.push(sourceDependencyKey(partitionKey, sourceFileId, ordinal));
      }
      await removeKeys(removals, context);
      for (var pageOrdinal = 0; pageOrdinal < pages.length; pageOrdinal += 1) {
        var page = await makeSourceDependencyPage({
          partitionKey: partitionKey,
          sourceFileId: sourceFileId,
          pageOrdinal: pageOrdinal,
          pageCount: pages.length,
          entries: frozenArray(pages[pageOrdinal])
        }, context);
        await writeOne(
          sourceDependencyKey(partitionKey, sourceFileId, pageOrdinal), page, context);
      }
    }

    async function updateSourceDependency(
      partitionKey,
      sourceFileId,
      familyId,
      snapshotId,
      add,
      context
    ) {
      var entries = Array.from(
        await readSourceDependencies(partitionKey, sourceFileId, context));
      entries = entries.filter(function(item) {
        return !(item.familyId === familyId && item.snapshotId === snapshotId);
      });
      if (add) {
        entries.push(frozenRecord([['familyId', familyId], ['snapshotId', snapshotId]]));
      }
      entries.sort(function(left, right) {
        return compareText(left.familyId, right.familyId) ||
          compareText(left.snapshotId, right.snapshotId);
      });
      await writeSourceDependencies(partitionKey, sourceFileId, entries, context);
    }

    async function dependenciesSymmetric(manifest, context) {
      var dependencyEntryValue = await readOne(
        familyStorageKey(
          'family-dependency', manifest.partitionKey, manifest.familyId, manifest.snapshotId),
        context
      );
      var dependency = dependencyEntryValue.present
        ? await parseFamilyDependency(dependencyEntryValue.value, manifest, context)
        : null;
      if (!dependency ||
          !canonicalEqual(truthSchema, dependency.sourceBindings, manifest.sourceBindings)) {
        return false;
      }
      for (var index = 0; index < dependency.sourceBindings.length; index += 1) {
        var source = dependency.sourceBindings[index];
        var entries;
        try {
          entries = await readSourceDependencies(
            manifest.partitionKey, source.sourceFileId, context);
        } catch (_error) {
          return false;
        }
        if (!entries.some(function(item) {
          return item.familyId === manifest.familyId &&
            item.snapshotId === manifest.snapshotId;
        })) return false;
      }
      return true;
    }

    function issueHandle(binding) {
      replacementSequence += 1;
      var handle = frozenRecord([
        ['version', VERSION],
        ['status', 'staging'],
        ['partitionKey', binding.partitionKey],
        ['familyId', binding.familyId],
        ['replacementEpoch', replacementSequence]
      ]);
      issuedHandles.set(handle, {
        handle: handle,
        active: true,
        binding: binding,
        replacementEpoch: replacementSequence,
        manifest: null
      });
      return handle;
    }

    function handleRecord(handle) {
      var record = handle && typeof handle === 'object' ? issuedHandles.get(handle) : null;
      return record && record.handle === handle && record.active === true ? record : null;
    }

    async function dependencySourcesReferencing(
      partitionKey,
      familyId,
      snapshotId,
      context
    ) {
      var values = await readAll(context);
      var sourceIds = [];
      var keys = Object.keys(values).filter(function(key) {
        return keyBelongsToPartition(key, partitionKey) &&
          key.indexOf(PREFIX + 'source-dependency:') === 0;
      }).sort();
      for (var index = 0; index < keys.length; index += 1) {
        var raw = exactFields(values[keys[index]], SOURCE_DEPENDENCY_PAGE_KEYS);
        if (!raw || raw.partitionKey !== partitionKey ||
            !validSourceId(raw.sourceFileId)) {
          throw statusError('dependency-mismatch');
        }
        if (raw.pageOrdinal !== 0 ||
            keys[index] !== sourceDependencyKey(partitionKey, raw.sourceFileId, 0)) {
          continue;
        }
        var entries = await readSourceDependencies(
          partitionKey, raw.sourceFileId, context);
        if (entries.some(function(entry) {
          return entry.familyId === familyId && entry.snapshotId === snapshotId;
        })) sourceIds.push(raw.sourceFileId);
      }
      sourceIds = Array.from(new Set(sourceIds)).sort();
      if (sourceIds.length > LIMITS.MAX_SOURCES_PER_FAMILY) {
        throw statusError('dependency-mismatch');
      }
      return sourceIds;
    }

    async function removeSnapshot(
      partitionKey,
      familyId,
      snapshotId,
      context,
      recoveryMode
    ) {
      var dependencyEntryValue = await readOne(
        familyStorageKey('family-dependency', partitionKey, familyId, snapshotId), context);
      var dependency = dependencyEntryValue.present
        ? await parseFamilyDependency(dependencyEntryValue.value, {
          partitionKey: partitionKey,
          familyId: familyId,
          snapshotId: snapshotId
        }, context)
        : null;
      if (dependencyEntryValue.present && !dependency) {
        throw statusError('dependency-mismatch');
      }
      if (!dependency && !recoveryMode) throw statusError('dependency-mismatch');
      var sourceIds = dependency
        ? dependency.sourceBindings.map(function(source) { return source.sourceFileId; })
        : [];
      if (recoveryMode) {
        sourceIds = sourceIds.concat(await dependencySourcesReferencing(
          partitionKey, familyId, snapshotId, context));
      }
      sourceIds = Array.from(new Set(sourceIds)).sort();
      if (sourceIds.length > LIMITS.MAX_SOURCES_PER_FAMILY) {
        throw statusError('dependency-mismatch');
      }
      for (var sourceIndex = 0; sourceIndex < sourceIds.length; sourceIndex += 1) {
        var entries = Array.from(await readSourceDependencies(
          partitionKey, sourceIds[sourceIndex], context));
        var found = entries.some(function(entry) {
          return entry.familyId === familyId && entry.snapshotId === snapshotId;
        });
        if (!found && !recoveryMode) throw statusError('dependency-mismatch');
        entries = entries.filter(function(entry) {
          return !(entry.familyId === familyId && entry.snapshotId === snapshotId);
        });
        await writeSourceDependencies(
          partitionKey, sourceIds[sourceIndex], entries, context);
      }
      var values = await readAll(context);
      var prefixes = [
        familyStorageKey('manifest', partitionKey, familyId, snapshotId),
        familyStorageKey('lineage', partitionKey, familyId, snapshotId),
        familyStorageKey('family-dependency', partitionKey, familyId, snapshotId),
        familyStorageKey('page', partitionKey, familyId, snapshotId)
      ];
      var keys = Object.keys(values).filter(function(key) {
        return prefixes.some(function(prefix) { return key.indexOf(prefix) === 0; });
      });
      await removeKeys(keys, context);
    }

    async function familySnapshotIds(partitionKey, familyId, context) {
      var values = await readAll(context);
      var snapshotIds = [];
      var keys = Object.keys(values).filter(function(key) {
        return keyBelongsToPartition(key, partitionKey);
      }).sort();
      for (var index = 0; index < keys.length; index += 1) {
        var value = values[keys[index]];
        if (isPlainRecord(value) && value.partitionKey === partitionKey &&
            value.familyId === familyId && validSnapshotId(value.snapshotId)) {
          snapshotIds.push(value.snapshotId);
        }
      }
      var sourceKeys = keys.filter(function(key) {
        return key.indexOf(PREFIX + 'source-dependency:') === 0;
      });
      var seenSources = Object.create(null);
      for (var sourceIndex = 0; sourceIndex < sourceKeys.length; sourceIndex += 1) {
        var raw = exactFields(values[sourceKeys[sourceIndex]], SOURCE_DEPENDENCY_PAGE_KEYS);
        if (!raw || raw.partitionKey !== partitionKey ||
            !validSourceId(raw.sourceFileId)) throw statusError('dependency-mismatch');
        if (raw.pageOrdinal !== 0 || own(seenSources, raw.sourceFileId)) continue;
        seenSources[raw.sourceFileId] = true;
        var entries = await readSourceDependencies(
          partitionKey, raw.sourceFileId, context);
        entries.forEach(function(entry) {
          if (entry.familyId === familyId) snapshotIds.push(entry.snapshotId);
        });
      }
      snapshotIds = Array.from(new Set(snapshotIds)).sort();
      if (snapshotIds.length > LIMITS.MAX_RECOVERY_STEPS) {
        throw statusError('recovery-pending');
      }
      return snapshotIds;
    }

    async function cleanupFamilyOrphans(partitionKey, familyId, context) {
      var snapshotIds = await familySnapshotIds(partitionKey, familyId, context);
      for (var index = 0; index < snapshotIds.length; index += 1) {
        await removeSnapshot(
          partitionKey, familyId, snapshotIds[index], context, true);
      }
      var values = await readAll(context);
      var prefixes = [
        familyPrefix('manifest', partitionKey, familyId),
        familyPrefix('lineage', partitionKey, familyId),
        familyPrefix('family-dependency', partitionKey, familyId),
        familyPrefix('page', partitionKey, familyId)
      ];
      var keys = Object.keys(values).filter(function(key) {
        return prefixes.some(function(prefix) { return key.indexOf(prefix) === 0; });
      });
      await removeKeys(keys, context);
    }

    async function beginFamilyReplacement(value, mutationGuard) {
      var input = parseReplacementInput(value, truthSchema, corpusSchema);
      if (!input) return failed('validation-failed');
      return runMutation(mutationGuard, async function(mutation) {
        var key = familyStorageKey('control', input.partitionKey, input.familyId);
        var entry = await readOne(key, mutation);
        var control = entry.present ? await parseControl(entry.value, mutation) : null;
        if (entry.present && !control) throw statusError('recovery-pending');
        var priorSnapshotId = control && control.state === 'published'
          ? control.activeSnapshotId : null;
        var timestamp = Math.max(0, Math.floor(now()));
        await writeOne(key, await makeControl({
          partitionKey: input.partitionKey,
          familyId: input.familyId,
          state: 'purging',
          activeSnapshotId: null,
          updatedAt: timestamp,
          reason: 'user-withdrawn'
        }, mutation), mutation);
        var journalKey = familyStorageKey('journal', input.partitionKey, input.familyId);
        await writeOne(journalKey, await makeJournal({
          partitionKey: input.partitionKey,
          familyId: input.familyId,
          priorSnapshotId: priorSnapshotId,
          state: 'purging',
          reason: 'user-withdrawn',
          updatedAt: timestamp
        }, mutation), mutation);
        if (priorSnapshotId) {
          await removeSnapshot(
            input.partitionKey, input.familyId, priorSnapshotId, mutation);
        }
        await cleanupFamilyOrphans(
          input.partitionKey, input.familyId, mutation);
        await writeOne(journalKey, await makeJournal({
          partitionKey: input.partitionKey,
          familyId: input.familyId,
          priorSnapshotId: null,
          state: 'staging',
          reason: 'complete',
          updatedAt: timestamp
        }, mutation), mutation);
        await writeOne(key, await makeControl({
          partitionKey: input.partitionKey,
          familyId: input.familyId,
          state: 'staging',
          activeSnapshotId: null,
          updatedAt: timestamp,
          reason: 'complete'
        }, mutation), mutation);
        return issueHandle(input);
      });
    }

    function buildSnapshotPageSets(proof) {
      var output = Object.create(null);
      for (var categoryIndex = 0; categoryIndex < PAGE_CATEGORIES.length; categoryIndex += 1) {
        var category = PAGE_CATEGORIES[categoryIndex];
        var pages = splitSnapshotPages(
          category, Array.from(proof[category]), byteLength);
        if (!pages) throw statusError('quota-exceeded');
        output[category] = pages;
      }
      return output;
    }

    async function buildPageDescriptors(pageSets, context) {
      var output = [];
      for (var categoryIndex = 0; categoryIndex < PAGE_CATEGORIES.length; categoryIndex += 1) {
        var category = PAGE_CATEGORIES[categoryIndex];
        var pages = pageSets[category];
        for (var ordinal = 0; ordinal < pages.length; ordinal += 1) {
          var payload = pagePayload(category, ordinal, pages[ordinal]);
          output.push(frozenRecord([
            ['category', category],
            ['pageOrdinal', ordinal],
            ['itemCount', pages[ordinal].length],
            ['pageHash', await hash(payload, context)]
          ]));
        }
      }
      output.sort(function(left, right) {
        return compareText(left.category, right.category) ||
          left.pageOrdinal - right.pageOrdinal;
      });
      return frozenArray(output);
    }

    function categoryCounts(proof) {
      return frozenRecord([
        ['assertions', proof.assertions.length],
        ['citations', proof.citations.length],
        ['conflicts', proof.conflicts.length],
        ['deadlineResults', proof.deadlineResults.length],
        ['deadlineRules', proof.deadlineRules.length]
      ]);
    }

    async function stageFamilySnapshot(handle, value, mutationGuard) {
      var record = handleRecord(handle);
      if (!record) return failed('stale-operation');
      return runMutation(mutationGuard, async function(mutation) {
        record = handleRecord(handle);
        if (!record) throw statusError('stale-operation');
        var proof = await checkedAwait(
          mutation, truthSchema.parseSemanticFamilyProof(value));
        if (!proof || !proofMatchesBinding(truthSchema, proof, record.binding)) {
          throw statusError('validation-failed');
        }
        var canonical = truthSchema.canonicalize(proof);
        var bytes;
        try {
          bytes = byteLength(canonical);
        } catch (_error) {
          throw statusError('validation-failed');
        }
        if (!safeInteger(bytes, LIMITS.MAX_SNAPSHOT_BYTES)) {
          throw statusError('quota-exceeded');
        }
        var controlEntry = await readOne(
          familyStorageKey('control', proof.partitionKey, proof.familyId), mutation);
        var control = controlEntry.present
          ? await parseControl(controlEntry.value, mutation) : null;
        if (!control || control.state !== 'staging') throw statusError('stale-operation');

        var pageSets = buildSnapshotPageSets(proof);
        var descriptors = await buildPageDescriptors(pageSets, mutation);
        var manifestInput = frozenRecord([
          ['schemaVersion', truthSchema.SNAPSHOT_VERSION],
          ['partitionKey', proof.partitionKey],
          ['familyId', proof.familyId],
          ['semanticProofDigest', await hash(proof, mutation)],
          ['semanticProofBytes', bytes],
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
          ['evaluationContext', proof.evaluationContext],
          ['categoryCounts', categoryCounts(proof)],
          ['pages', descriptors]
        ]);
        var snapshotId = await checkedAwait(
          mutation, truthSchema.deriveSnapshotId(manifestInput));
        if (!validSnapshotId(snapshotId)) throw statusError('validation-failed');
        var manifestValue = Object.create(null);
        Object.keys(manifestInput).forEach(function(key) {
          manifestValue[key] = manifestInput[key];
        });
        manifestValue.snapshotId = snapshotId;
        var manifest = await checkedAwait(
          mutation, truthSchema.parseFamilySnapshotManifest(manifestValue));
        if (!manifest || manifest.snapshotId !== snapshotId) {
          throw statusError('validation-failed');
        }

        for (var descriptorIndex = 0; descriptorIndex < descriptors.length; descriptorIndex += 1) {
          var descriptor = descriptors[descriptorIndex];
          var sourceItems = pageSets[descriptor.category][descriptor.pageOrdinal];
          var page = await makePage({
            partitionKey: proof.partitionKey,
            familyId: proof.familyId,
            snapshotId: snapshotId,
            category: descriptor.category,
            pageOrdinal: descriptor.pageOrdinal,
            items: sourceItems
          }, mutation);
          if (page.pageHash !== descriptor.pageHash) throw statusError('validation-failed');
          await writeOne(snapshotPageKey(
            proof.partitionKey, proof.familyId, snapshotId,
            descriptor.category, descriptor.pageOrdinal
          ), page, mutation);
        }
        await writeOne(
          familyStorageKey('lineage', proof.partitionKey, proof.familyId, snapshotId),
          await makeLineage({
            partitionKey: proof.partitionKey,
            familyId: proof.familyId,
            snapshotId: snapshotId,
            documentStableIds: proof.documentStableIds,
            lineageRelationIds: proof.lineageRelationIds,
            lineageProof: proof.lineageProof
          }, mutation),
          mutation
        );
        await writeStoredManifest(manifest, mutation);
        await writeOne(
          familyStorageKey(
            'family-dependency', proof.partitionKey, proof.familyId, snapshotId),
          await makeFamilyDependency({
            partitionKey: proof.partitionKey,
            familyId: proof.familyId,
            snapshotId: snapshotId,
            sourceBindings: proof.sourceBindings
          }, mutation),
          mutation
        );
        var stagedProof = await readSnapshot(manifest, mutation, false);
        if (!stagedProof || !canonicalEqual(truthSchema, stagedProof, proof)) {
          throw statusError('corrupt-snapshot');
        }
        record.manifest = manifest;
        issuedManifests.set(manifest, {
          manifest: manifest,
          handle: handle,
          snapshotId: snapshotId,
          active: true
        });
        return ok('staged', { manifest: manifest });
      });
    }

    async function readSnapshot(manifest, context, requireDependencies) {
      var parsedManifest = await readStoredManifest(manifest, context);
      if (!parsedManifest ||
          !canonicalEqual(truthSchema, parsedManifest, manifest)) return null;
      var lineageEntry = await readOne(familyStorageKey(
        'lineage', manifest.partitionKey, manifest.familyId, manifest.snapshotId), context);
      var lineage = lineageEntry.present
        ? await parseLineage(lineageEntry.value, manifest, context)
        : null;
      if (!lineage) return null;
      var categories = Object.create(null);
      PAGE_CATEGORIES.forEach(function(category) { categories[category] = []; });
      for (var pageIndex = 0; pageIndex < manifest.pages.length; pageIndex += 1) {
        var descriptor = manifest.pages[pageIndex];
        var pageEntry = await readOne(snapshotPageKey(
          manifest.partitionKey, manifest.familyId, manifest.snapshotId,
          descriptor.category, descriptor.pageOrdinal
        ), context);
        var page = pageEntry.present
          ? await parsePage(pageEntry.value, {
            partitionKey: manifest.partitionKey,
            familyId: manifest.familyId,
            snapshotId: manifest.snapshotId,
            category: descriptor.category,
            pageOrdinal: descriptor.pageOrdinal,
            itemCount: descriptor.itemCount,
            pageHash: descriptor.pageHash
          }, context)
          : null;
        if (!page) return null;
        categories[descriptor.category] = categories[descriptor.category].concat(
          Array.from(page.items));
      }
      for (var categoryIndex = 0; categoryIndex < PAGE_CATEGORIES.length; categoryIndex += 1) {
        var category = PAGE_CATEGORIES[categoryIndex];
        if (categories[category].length !== manifest.categoryCounts[category]) return null;
      }
      var proofValue = {
        schemaVersion: truthSchema.VERSION,
        partitionKey: manifest.partitionKey,
        familyId: manifest.familyId,
        authorizedSetDigest: manifest.authorizedSetDigest,
        sourceBindings: manifest.sourceBindings,
        documentStableIds: lineage.documentStableIds,
        lineageRelationIds: lineage.lineageRelationIds,
        recordVersionIds: manifest.recordVersionIds,
        relationVersionIds: manifest.relationVersionIds,
        candidateGenerationIds: manifest.candidateGenerationIds,
        candidateSchemaVersion: manifest.candidateSchemaVersion,
        promptVersion: manifest.promptVersion,
        adjudicationVersion: manifest.adjudicationVersion,
        deadlineRuleVersion: manifest.deadlineRuleVersion,
        calendarVersion: manifest.calendarVersion,
        evaluationContext: manifest.evaluationContext,
        lineageProof: lineage.lineageProof,
        assertions: categories.assertions,
        conflicts: categories.conflicts,
        citations: categories.citations,
        deadlineRules: categories.deadlineRules,
        deadlineResults: categories.deadlineResults
      };
      var proof = await checkedAwait(
        context, truthSchema.parseSemanticFamilyProof(proofValue));
      if (!proof || await hash(proof, context) !== manifest.semanticProofDigest) return null;
      var canonical = truthSchema.canonicalize(proof);
      var bytes;
      try {
        bytes = byteLength(canonical);
      } catch (_error) {
        return null;
      }
      if (bytes !== manifest.semanticProofBytes) return null;
      if (requireDependencies && !await dependenciesSymmetric(manifest, context)) return null;
      return proof;
    }

    async function publishFamilySnapshot(handle, manifestValue, mutationGuard) {
      var handleState = handleRecord(handle);
      var manifestState = manifestValue && typeof manifestValue === 'object'
        ? issuedManifests.get(manifestValue) : null;
      if (!handleState || !manifestState || manifestState.manifest !== manifestValue ||
          manifestState.handle !== handle || manifestState.active !== true ||
          handleState.manifest !== manifestValue) return failed('stale-operation');
      return runMutation(mutationGuard, async function(mutation) {
        handleState = handleRecord(handle);
        manifestState = issuedManifests.get(manifestValue);
        if (!handleState || !manifestState || !manifestState.active) {
          throw statusError('stale-operation');
        }
        var proof = await readSnapshot(manifestValue, mutation, false);
        if (!proof) throw statusError('corrupt-snapshot');
        for (var sourceIndex = 0; sourceIndex < proof.sourceBindings.length; sourceIndex += 1) {
          var source = proof.sourceBindings[sourceIndex];
          await updateSourceDependency(
            proof.partitionKey, source.sourceFileId, proof.familyId,
            manifestValue.snapshotId, true, mutation);
        }
        if (!await dependenciesSymmetric(manifestValue, mutation)) {
          throw statusError('dependency-mismatch');
        }
        await removeKeys([
          familyStorageKey('journal', proof.partitionKey, proof.familyId)
        ], mutation);
        await writeOne(
          familyStorageKey('control', proof.partitionKey, proof.familyId),
          await makeControl({
            partitionKey: proof.partitionKey,
            familyId: proof.familyId,
            state: 'published',
            activeSnapshotId: manifestValue.snapshotId,
            updatedAt: Math.max(0, Math.floor(now())),
            reason: 'complete'
          }, mutation),
          mutation
        );
        handleState.active = false;
        manifestState.active = false;
        return ok('published', { snapshotId: manifestValue.snapshotId });
      });
    }

    async function publishPartitionGeneration(value, mutationGuard) {
      var input = parseGenerationInput(value);
      if (!input) return failed('validation-failed');
      return runMutation(mutationGuard, async function(mutation) {
        var values = await readAll(mutation);
        var controlKeys = Object.keys(values).filter(function(key) {
          return keyBelongsToPartition(key, input.partitionKey) &&
            key.indexOf(PREFIX + 'control:') === 0;
        }).sort();
        var publishedControls = Object.create(null);
        for (var controlIndex = 0;
          controlIndex < controlKeys.length;
          controlIndex += 1) {
          var control = await parseControl(values[controlKeys[controlIndex]], mutation);
          if (!control || control.partitionKey !== input.partitionKey) {
            throw statusError('recovery-pending');
          }
          if (control.state === 'published') {
            publishedControls[control.familyId] = control;
          }
        }

        var families = [];
        var requested = Object.create(null);
        for (var familyIndex = 0;
          familyIndex < input.familyIds.length;
          familyIndex += 1) {
          var familyId = input.familyIds[familyIndex];
          var familyControl = publishedControls[familyId];
          if (!familyControl) throw statusError('dependency-mismatch');
          var manifest = await readStoredManifest({
            partitionKey: input.partitionKey,
            familyId: familyId,
            snapshotId: familyControl.activeSnapshotId
          }, mutation);
          var proof = manifest
            ? await readSnapshot(manifest, mutation, true)
            : null;
          if (!proof || proof.authorizedSetDigest !== input.authorizedSetDigest) {
            throw statusError('dependency-mismatch');
          }
          requested[familyId] = true;
          families.push(frozenRecord([
            ['familyId', familyId],
            ['snapshotId', familyControl.activeSnapshotId]
          ]));
        }

        var generation = await makeGeneration({
          partitionKey: input.partitionKey,
          authorizedSetDigest: input.authorizedSetDigest,
          families: families
        }, mutation);
        await writeOne(
          generationKey(input.partitionKey, generation.outputGenerationId),
          generation,
          mutation
        );

        for (var verifyIndex = 0; verifyIndex < families.length; verifyIndex += 1) {
          var expected = families[verifyIndex];
          var controlEntry = await readOne(
            familyStorageKey('control', input.partitionKey, expected.familyId),
            mutation
          );
          var currentControl = controlEntry.present
            ? await parseControl(controlEntry.value, mutation)
            : null;
          if (!currentControl || currentControl.state !== 'published' ||
              currentControl.activeSnapshotId !== expected.snapshotId) {
            throw statusError('dependency-mismatch');
          }
        }

        await writeOne(
          generationControlKey(input.partitionKey),
          await makeGenerationControl({
            partitionKey: input.partitionKey,
            activeOutputGenerationId: generation.outputGenerationId,
            updatedAt: Math.max(0, Math.floor(now()))
          }, mutation),
          mutation
        );

        var publishedIds = Object.keys(publishedControls).sort(compareText);
        for (var publishedIndex = 0;
          publishedIndex < publishedIds.length;
          publishedIndex += 1) {
          var publishedId = publishedIds[publishedIndex];
          if (requested[publishedId]) continue;
          await withdrawFamily(
            input.partitionKey,
            publishedId,
            publishedControls[publishedId].activeSnapshotId,
            'user-withdrawn',
            mutation
          );
        }

        values = await readAll(mutation);
        var obsoleteGenerationKeys = Object.keys(values).filter(function(key) {
          return keyBelongsToPartition(key, input.partitionKey) &&
            key.indexOf(PREFIX + 'generation:') === 0 &&
            key !== generationKey(
              input.partitionKey, generation.outputGenerationId);
        });
        await removeKeys(obsoleteGenerationKeys, mutation);
        return ok('published', {
          outputGenerationId: generation.outputGenerationId,
          familyIds: input.familyIds
        });
      });
    }

    async function readActiveControl(input, context) {
      var entry = await readOne(
        familyStorageKey('control', input.partitionKey, input.familyId), context);
      var control = entry.present ? await parseControl(entry.value, context) : null;
      return control && control.state === 'published' ? control : null;
    }

    function parseFamilyRead(value) {
      var input = exactFields(value, ['partitionKey', 'familyId']);
      return input && validPartition(corpusSchema, input.partitionKey) &&
        validFamilyId(input.familyId) ? input : null;
    }

    async function readActiveFamily(value) {
      var input = parseFamilyRead(value);
      if (!input) return null;
      try {
        var generation = await readActiveGeneration(
          input.partitionKey, null, true);
        var member = generation && generation.families.find(function(item) {
          return item.familyId === input.familyId;
        });
        if (!member) return null;
        var control = await readActiveControl(input, null);
        if (!control || control.activeSnapshotId !== member.snapshotId) return null;
        var manifest = await readStoredManifest({
          partitionKey: input.partitionKey,
          familyId: input.familyId,
          snapshotId: control.activeSnapshotId
        }, null);
        return manifest ? await readSnapshot(manifest, null, true) : null;
      } catch (_error) {
        return null;
      }
    }

    async function readActiveFamilyMetadata(value) {
      var input = parseFamilyRead(value);
      if (!input) return null;
      try {
        var generation = await readActiveGeneration(
          input.partitionKey, null, true);
        var member = generation && generation.families.find(function(item) {
          return item.familyId === input.familyId;
        });
        if (!member) return null;
        var control = await readActiveControl(input, null);
        if (!control || control.activeSnapshotId !== member.snapshotId) return null;
        var manifest = await readStoredManifest({
          partitionKey: input.partitionKey,
          familyId: input.familyId,
          snapshotId: control.activeSnapshotId
        }, null);
        if (!manifest || !await readSnapshot(manifest, null, true)) return null;
        return frozenRecord([
          ['version', VERSION],
          ['partitionKey', manifest.partitionKey],
          ['familyId', manifest.familyId],
          ['state', 'published'],
          ['snapshotId', manifest.snapshotId],
          ['outputGenerationId', generation.outputGenerationId],
          ['authorizedSetDigest', manifest.authorizedSetDigest],
          ['sourceBindings', manifest.sourceBindings],
          ['categoryCounts', manifest.categoryCounts],
          ['evaluationContext', manifest.evaluationContext]
        ]);
      } catch (_error) {
        return null;
      }
    }

    async function withdrawFamily(partitionKey, familyId, snapshotId, reason, context) {
      var controlKey = familyStorageKey('control', partitionKey, familyId);
      var controlEntry = await readOne(controlKey, context);
      var control = controlEntry.present
        ? await parseControl(controlEntry.value, context) : null;
      if (!control || control.state !== 'published' ||
          control.activeSnapshotId !== snapshotId) {
        throw statusError('dependency-mismatch');
      }
      var timestamp = Math.max(0, Math.floor(now()));
      await writeOne(controlKey, await makeControl({
        partitionKey: partitionKey,
        familyId: familyId,
        state: 'purging',
        activeSnapshotId: null,
        updatedAt: timestamp,
        reason: reason
      }, context), context);
      var journalKey = familyStorageKey('journal', partitionKey, familyId);
      await writeOne(journalKey, await makeJournal({
        partitionKey: partitionKey,
        familyId: familyId,
        priorSnapshotId: snapshotId,
        state: 'purging',
        reason: reason,
        updatedAt: timestamp
      }, context), context);
      await removeSnapshot(partitionKey, familyId, snapshotId, context);
      await removeKeys([journalKey], context);
      await writeOne(controlKey, await makeControl({
        partitionKey: partitionKey,
        familyId: familyId,
        state: 'withheld',
        activeSnapshotId: null,
        updatedAt: timestamp,
        reason: reason
      }, context), context);
    }

    function parseWithdrawInput(value) {
      var input = exactFields(value, WITHDRAW_KEYS);
      var sources = input && sortedUniqueStrings(
        input.sourceFileIds, LIMITS.MAX_SOURCES_PER_FAMILY, 1, validSourceId);
      if (!input || !sources || !validPartition(corpusSchema, input.partitionKey) ||
          !REASONS[input.reason]) return null;
      return frozenRecord([
        ['partitionKey', input.partitionKey],
        ['sourceFileIds', sources],
        ['reason', input.reason]
      ]);
    }

    async function withdrawFamiliesForSourcesInternal(input, context) {
      var priorGeneration = await readActiveGeneration(
        input.partitionKey, context, false);
      var affected = Object.create(null);
      for (var sourceIndex = 0; sourceIndex < input.sourceFileIds.length; sourceIndex += 1) {
        var sourceFileId = input.sourceFileIds[sourceIndex];
        var entries = await readSourceDependencies(input.partitionKey, sourceFileId, context);
        entries.forEach(function(entry) {
          var key = entry.familyId + '\u0000' + entry.snapshotId;
          affected[key] = entry;
        });
      }
      var keys = Object.keys(affected).sort();
      var nextGeneration = null;
      if (priorGeneration) {
        var remaining = priorGeneration.families.filter(function(family) {
          return !own(affected, family.familyId + '\u0000' + family.snapshotId);
        });
        if (remaining.length !== priorGeneration.families.length) {
          for (var remainingIndex = 0;
            remainingIndex < remaining.length;
            remainingIndex += 1) {
            var remainingFamily = remaining[remainingIndex];
            var remainingControlEntry = await readOne(
              familyStorageKey(
                'control', input.partitionKey, remainingFamily.familyId),
              context
            );
            var remainingControl = remainingControlEntry.present
              ? await parseControl(remainingControlEntry.value, context)
              : null;
            if (!remainingControl || remainingControl.state !== 'published' ||
                remainingControl.activeSnapshotId !== remainingFamily.snapshotId) {
              throw statusError('dependency-mismatch');
            }
            var remainingManifest = await readStoredManifest({
              partitionKey: input.partitionKey,
              familyId: remainingFamily.familyId,
              snapshotId: remainingFamily.snapshotId
            }, context);
            if (!remainingManifest ||
                remainingManifest.authorizedSetDigest !==
                  priorGeneration.authorizedSetDigest ||
                !await readSnapshot(remainingManifest, context, true)) {
              throw statusError('dependency-mismatch');
            }
          }
          nextGeneration = await makeGeneration({
            partitionKey: input.partitionKey,
            authorizedSetDigest: priorGeneration.authorizedSetDigest,
            families: remaining
          }, context);
          await writeOne(
            generationKey(
              input.partitionKey, nextGeneration.outputGenerationId),
            nextGeneration,
            context
          );
          await writeOne(
            generationControlKey(input.partitionKey),
            await makeGenerationControl({
              partitionKey: input.partitionKey,
              activeOutputGenerationId: nextGeneration.outputGenerationId,
              updatedAt: Math.max(0, Math.floor(now()))
            }, context),
            context
          );
        }
      }

      for (var index = 0; index < keys.length; index += 1) {
        var entry = affected[keys[index]];
        await withdrawFamily(
          input.partitionKey, entry.familyId, entry.snapshotId, input.reason, context);
      }
      for (var verifyIndex = 0; verifyIndex < input.sourceFileIds.length; verifyIndex += 1) {
        if (await sourceHasInfluence(
          input.partitionKey, input.sourceFileIds[verifyIndex], context)) {
          throw statusError('dependency-mismatch');
        }
      }
      if (nextGeneration) {
        var values = await readAll(context);
        var obsoleteGenerationKeys = Object.keys(values).filter(function(key) {
          return keyBelongsToPartition(key, input.partitionKey) &&
            key.indexOf(PREFIX + 'generation:') === 0 &&
            key !== generationKey(
              input.partitionKey, nextGeneration.outputGenerationId);
        });
        await removeKeys(obsoleteGenerationKeys, context);
      }
      return ok('withdrawn');
    }

    async function withdrawFamiliesForSources(value, mutationGuard) {
      var input = parseWithdrawInput(value);
      if (!input) return failed('validation-failed');
      return runMutation(mutationGuard, function(mutation) {
        return withdrawFamiliesForSourcesInternal(input, mutation);
      });
    }

    function valueContainsSource(value, sourceFileId, seen) {
      if (value === sourceFileId) return true;
      if (!value || typeof value !== 'object') return false;
      seen = seen || new Set();
      if (seen.has(value)) return false;
      seen.add(value);
      var keys;
      try {
        keys = Reflect.ownKeys(value);
      } catch (_error) {
        return true;
      }
      for (var index = 0; index < keys.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
        if (!descriptor || !own(descriptor, 'value')) return true;
        if (valueContainsSource(descriptor.value, sourceFileId, seen)) return true;
      }
      return false;
    }

    async function sourceHasInfluence(partitionKey, sourceFileId, context) {
      var dependencies = await readSourceDependencies(partitionKey, sourceFileId, context);
      if (dependencies.length) return true;
      var values = await readAll(context);
      var keys = Object.keys(values).sort();
      for (var index = 0; index < keys.length; index += 1) {
        var value = values[keys[index]];
        if (!keyBelongsToPartition(keys[index], partitionKey)) continue;
        if (!isPlainRecord(value) || value.partitionKey !== partitionKey ||
            !KNOWN_RECORD_KINDS[value.kind]) return true;
        if (valueContainsSource(value, sourceFileId)) return true;
      }
      return false;
    }

    function parseParticipantRequest(value) {
      var input = exactFields(value, PARTICIPANT_REQUEST_KEYS);
      if (!input || !validPartition(corpusSchema, input.partitionKey) ||
          !(input.sourceFileId === null || validSourceId(input.sourceFileId)) ||
          typeof input.reason !== 'string' || input.reason.length === 0 ||
          input.reason.length > 32) return null;
      var tuple = corpusSchema.parsePartitionKey(input.partitionKey);
      if (tuple.accountPermissionId !== input.accountPermissionId ||
          tuple.corpusRootFileId !== input.corpusRootFileId) return null;
      return input;
    }

    async function purgePartitionInternal(request, context) {
      var values = await readAll(context);
      var controlKeys = Object.keys(values).filter(function(key) {
        return keyBelongsToPartition(key, request.partitionKey) &&
          key.indexOf(PREFIX + 'control:') === 0;
      }).sort();
      for (var index = 0; index < controlKeys.length; index += 1) {
        var control = await parseControl(values[controlKeys[index]], context);
        if (!control || control.partitionKey !== request.partitionKey) continue;
        await writeOne(controlKeys[index], await makeControl({
          partitionKey: control.partitionKey,
          familyId: control.familyId,
          state: 'purging',
          activeSnapshotId: null,
          updatedAt: Math.max(0, Math.floor(now())),
          reason: request.reason === 'root-replaced' ? 'root-replaced' : 'access-revoked'
        }, context), context);
      }
      values = await readAll(context);
      var keys = Object.keys(values).filter(function(key) {
        return keyBelongsToPartition(key, request.partitionKey);
      });
      await removeKeys(keys, context);
    }

    async function participantPurge(requestValue, capability, verifier, partitionMode) {
      var request = parseParticipantRequest(requestValue);
      var mode = partitionMode ? 'purge-partition' : 'purge-source';
      if (!request || (partitionMode ? request.sourceFileId !== null :
        request.sourceFileId === null)) return strictFailure();
      var context = {
        kind: 'participant',
        verifier: verifier,
        capability: capability,
        mode: mode,
        request: requestValue
      };
      if (!verifiedAuthorization(context)) return strictFailure();
      try {
        if (partitionMode) {
          await purgePartitionInternal(request, context);
        } else {
          await withdrawFamiliesForSourcesInternal(frozenRecord([
            ['partitionKey', request.partitionKey],
            ['sourceFileIds', frozenArray([request.sourceFileId])],
            ['reason', REASONS[request.reason] ? request.reason : 'access-revoked']
          ]), context);
        }
        var owned = partitionMode
          ? Object.keys(await readAll(context)).some(function(key) {
            return keyBelongsToPartition(key, request.partitionKey);
          })
          : await sourceHasInfluence(request.partitionKey, request.sourceFileId, context);
        return owned ? strictFailure() : strictOk();
      } catch (_error) {
        return strictFailure();
      }
    }

    async function participantHasInfluence(requestValue, capability, verifier) {
      var request = parseParticipantRequest(requestValue);
      var partitionMode = request && request.sourceFileId === null;
      var context = {
        kind: 'participant',
        verifier: verifier,
        capability: capability,
        mode: partitionMode ? 'verify-partition' : 'verify-source',
        request: requestValue
      };
      if (!request || !verifiedAuthorization(context)) return absent(true);
      try {
        if (partitionMode) {
          var values = await readAll(context);
          return absent(Object.keys(values).some(function(key) {
            return keyBelongsToPartition(key, request.partitionKey);
          }));
        }
        return absent(await sourceHasInfluence(
          request.partitionKey, request.sourceFileId, context));
      } catch (_error) {
        return absent(true);
      }
    }

    function getPurgeParticipant(name) {
      if (name !== 'citations' || issuedParticipantBinders.has(name)) return null;
      issuedParticipantBinders.add(name);
      var used = false;
      return function bindParticipant(verifier) {
        if (used || typeof verifier !== 'function') return null;
        used = true;
        return Object.freeze({
          purgeSource: function(request, capability) {
            return participantPurge(request, capability, verifier, false);
          },
          purgePartition: function(request, capability) {
            return participantPurge(request, capability, verifier, true);
          },
          hasOwnedInfluence: function(request, capability) {
            return participantHasInfluence(request, capability, verifier);
          }
        });
      };
    }

    function parseSourceInvalidation(value) {
      var input = exactFields(value, SOURCE_INVALIDATION_KEYS);
      return input && validPartition(corpusSchema, input.partitionKey) &&
        validSourceId(input.sourceFileId) &&
        validGeneration(input.priorFragmentGenerationId) &&
        validGeneration(input.nextFragmentGenerationId) &&
        typeof input.reason === 'string' && input.reason.length > 0 &&
        input.reason.length <= 32 ? input : null;
    }

    function parseOverlayInvalidation(value) {
      var input = exactFields(value, OVERLAY_INVALIDATION_KEYS);
      var sources = input && sortedUniqueStrings(
        input.affectedSourceFileIds, LIMITS.MAX_SOURCES_PER_FAMILY, 1, validSourceId);
      if (!input || !sources || !validPartition(corpusSchema, input.partitionKey) ||
          !validSourceId(input.proposingSourceFileId) ||
          sources.indexOf(input.proposingSourceFileId) < 0 ||
          !validOverlayGeneration(input.priorOverlayGenerationId) ||
          !validOverlayGeneration(input.nextOverlayGenerationId) ||
          typeof input.reason !== 'string' || input.reason.length === 0 ||
          input.reason.length > 32) return null;
      return frozenRecord([
        ['partitionKey', input.partitionKey],
        ['proposingSourceFileId', input.proposingSourceFileId],
        ['affectedSourceFileIds', sources],
        ['priorOverlayGenerationId', input.priorOverlayGenerationId],
        ['nextOverlayGenerationId', input.nextOverlayGenerationId],
        ['reason', input.reason]
      ]);
    }

    async function runGraphInvalidation(input, signal, sourceIds) {
      if (!input || !validSignal(signal) || signal.aborted) return strictFailure();
      var guard = issueMutation(signal);
      if (!guard) return strictFailure();
      try {
        var result = await withdrawFamiliesForSources({
          partitionKey: input.partitionKey,
          sourceFileIds: Array.from(sourceIds),
          reason: REASONS[input.reason] ? input.reason : 'user-withdrawn'
        }, guard);
        return result && result.ok === true ? strictOk() : strictFailure();
      } catch (_error) {
        return strictFailure();
      } finally {
        finishMutation(guard);
      }
    }

    var graphInvalidator = Object.freeze({
      withdrawSourceChange: function(request, signal) {
        var input = parseSourceInvalidation(request);
        return runGraphInvalidation(input, signal, input ? [input.sourceFileId] : []);
      },
      withdrawOverlayChange: function(request, signal) {
        var input = parseOverlayInvalidation(request);
        return runGraphInvalidation(
          input, signal, input ? input.affectedSourceFileIds : []);
      }
    });

    function buildRecoveryTasks(values) {
      var tasks = [];
      Object.keys(values).filter(function(key) {
        return key.indexOf(PREFIX + 'control:') === 0;
      }).sort().forEach(function(key) {
        tasks.push({ kind: 'control', key: key });
      });

      Object.keys(values).filter(function(key) {
        return key.indexOf(PREFIX + 'generation-control:') === 0;
      }).sort().forEach(function(key) {
        tasks.push({ kind: 'generation-control', key: key });
      });

      var generationKeys = Object.keys(values).filter(function(key) {
        return key.indexOf(PREFIX + 'generation:') === 0;
      }).sort();
      generationKeys.forEach(function(key) {
        tasks.push({ kind: 'generation', key: key });
      });
      generationKeys.forEach(function(key) {
        var raw = values[key];
        var families = isPlainRecord(raw)
          ? denseArray(raw.families, LIMITS.MAX_FAMILIES_PER_SOURCE, 0)
          : null;
        if (!families) return;
        for (var index = 0; index < families.length; index += 1) {
          tasks.push({
            kind: 'generation-member',
            key: key,
            familyOrdinal: index
          });
        }
      });

      var snapshots = Object.create(null);
      Object.keys(values).sort().forEach(function(key) {
        var candidate = values[key];
        if (!isPlainRecord(candidate) ||
            !SNAPSHOT_RECORD_KINDS[candidate.kind] ||
            !validPartition(corpusSchema, candidate.partitionKey) ||
            !validFamilyId(candidate.familyId) ||
            !validSnapshotId(candidate.snapshotId)) return;
        var identity = candidate.partitionKey + '\u0000' +
          candidate.familyId + '\u0000' + candidate.snapshotId;
        snapshots[identity] = {
          partitionKey: candidate.partitionKey,
          familyId: candidate.familyId,
          snapshotId: candidate.snapshotId
        };
      });
      Object.keys(snapshots).sort().forEach(function(identity) {
        tasks.push({
          kind: 'snapshot',
          snapshot: snapshots[identity]
        });
      });
      return tasks;
    }

    function recoveryTaskId(task) {
      if (task.kind === 'control') return '0:' + task.key;
      if (task.kind === 'generation-control') return '1:' + task.key;
      if (task.kind === 'generation') return '2:' + task.key;
      if (task.kind === 'generation-member') {
        return '3:' + task.key + ':' +
          String(task.familyOrdinal).padStart(4, '0');
      }
      if (task.kind === 'snapshot') {
        return '4:' + task.snapshot.partitionKey + '\u0000' +
          task.snapshot.familyId + '\u0000' + task.snapshot.snapshotId;
      }
      throw statusError('recovery-pending');
    }

    function recoveryTaskResume(tasks, taskId) {
      for (var index = 0; index < tasks.length; index += 1) {
        if (compareText(recoveryTaskId(tasks[index]), taskId) >= 0) return index;
      }
      return tasks.length;
    }

    async function recoverControlTask(key, mutation) {
      var entry = await readOne(key, mutation);
      if (!entry.present) return false;
      var control = await parseControl(entry.value, mutation);
      if (!control || key !== familyStorageKey(
        'control', control.partitionKey, control.familyId)) {
        await removeKeys([key], mutation);
        return true;
      }
      if (control.state === 'published') {
        var manifest = await readStoredManifest({
          partitionKey: control.partitionKey,
          familyId: control.familyId,
          snapshotId: control.activeSnapshotId
        }, mutation);
        if (manifest && await readSnapshot(manifest, mutation, true)) {
          var generation = await readActiveGeneration(
            control.partitionKey, mutation, false);
          var member = generation && generation.families.find(function(item) {
            return item.familyId === control.familyId;
          });
          if (member && member.snapshotId === control.activeSnapshotId &&
              manifest.authorizedSetDigest === generation.authorizedSetDigest) {
            return false;
          }
          await withdrawFamily(
            control.partitionKey,
            control.familyId,
            control.activeSnapshotId,
            'recovery-pending',
            mutation
          );
          return true;
        }
        var timestamp = Math.max(0, Math.floor(now()));
        await writeOne(key, await makeControl({
          partitionKey: control.partitionKey,
          familyId: control.familyId,
          state: 'repairing',
          activeSnapshotId: null,
          updatedAt: timestamp,
          reason: 'corrupt-snapshot'
        }, mutation), mutation);
        var corruptJournalKey = familyStorageKey(
          'journal', control.partitionKey, control.familyId);
        await writeOne(corruptJournalKey, await makeJournal({
          partitionKey: control.partitionKey,
          familyId: control.familyId,
          priorSnapshotId: control.activeSnapshotId,
          state: 'purging',
          reason: 'corrupt-snapshot',
          updatedAt: timestamp
        }, mutation), mutation);
        await removeSnapshot(
          control.partitionKey, control.familyId,
          control.activeSnapshotId, mutation, true);
        await cleanupFamilyOrphans(
          control.partitionKey, control.familyId, mutation);
        await removeKeys([corruptJournalKey], mutation);
        await writeOne(key, await makeControl({
          partitionKey: control.partitionKey,
          familyId: control.familyId,
          state: 'withheld',
          activeSnapshotId: null,
          updatedAt: timestamp,
          reason: 'corrupt-snapshot'
        }, mutation), mutation);
        return true;
      }

      var journalKey = familyStorageKey(
        'journal', control.partitionKey, control.familyId);
      var journalEntry = await readOne(journalKey, mutation);
      var journal = journalEntry.present
        ? await parseJournal(journalEntry.value, mutation) : null;
      var orphanSnapshotIds = await familySnapshotIds(
        control.partitionKey, control.familyId, mutation);
      if ((control.state === 'withheld' || control.state === 'absent') &&
          !journalEntry.present && orphanSnapshotIds.length === 0) {
        return false;
      }
      if (journal && journal.priorSnapshotId) {
        await removeSnapshot(
          control.partitionKey, control.familyId,
          journal.priorSnapshotId, mutation, true);
      }
      await cleanupFamilyOrphans(
        control.partitionKey, control.familyId, mutation);
      await removeKeys([journalKey], mutation);
      await writeOne(key, await makeControl({
        partitionKey: control.partitionKey,
        familyId: control.familyId,
        state: 'withheld',
        activeSnapshotId: null,
        updatedAt: Math.max(0, Math.floor(now())),
        reason: 'recovery-pending'
      }, mutation), mutation);
      return true;
    }

    async function recoverGenerationControlTask(key, mutation) {
      var entry = await readOne(key, mutation);
      if (!entry.present) return false;
      var raw = entry.value;
      var partitionKey = isPlainRecord(raw) &&
        validPartition(corpusSchema, raw.partitionKey)
        ? raw.partitionKey
        : null;
      var pointer = partitionKey
        ? await parseGenerationControl(raw, partitionKey, mutation)
        : null;
      var generationEntry = pointer
        ? await readOne(generationKey(
          pointer.partitionKey, pointer.activeOutputGenerationId), mutation)
        : null;
      var generation = generationEntry && generationEntry.present
        ? await parseGeneration(
          generationEntry.value, pointer.partitionKey, mutation)
        : null;
      if (!pointer || key !== generationControlKey(pointer.partitionKey) ||
          !generation ||
          generation.outputGenerationId !== pointer.activeOutputGenerationId) {
        await removeKeys([key], mutation);
        return true;
      }
      return false;
    }

    async function recoverGenerationTask(key, mutation) {
      var entry = await readOne(key, mutation);
      if (!entry.present) return false;
      var raw = entry.value;
      var partitionKey = isPlainRecord(raw) &&
        validPartition(corpusSchema, raw.partitionKey)
        ? raw.partitionKey
        : null;
      var generation = partitionKey
        ? await parseGeneration(raw, partitionKey, mutation)
        : null;
      if (!generation || key !== generationKey(
        generation.partitionKey, generation.outputGenerationId)) {
        await removeKeys([key], mutation);
        return true;
      }
      var pointerKey = generationControlKey(generation.partitionKey);
      var pointerEntry = await readOne(pointerKey, mutation);
      var pointer = pointerEntry.present
        ? await parseGenerationControl(
          pointerEntry.value, generation.partitionKey, mutation)
        : null;
      if (!pointer ||
          pointer.activeOutputGenerationId !== generation.outputGenerationId) {
        await removeKeys([key], mutation);
        return true;
      }
      return false;
    }

    async function recoverGenerationMemberTask(task, mutation) {
      var entry = await readOne(task.key, mutation);
      if (!entry.present) return false;
      var raw = entry.value;
      var partitionKey = isPlainRecord(raw) &&
        validPartition(corpusSchema, raw.partitionKey)
        ? raw.partitionKey
        : null;
      var generation = partitionKey
        ? await parseGeneration(raw, partitionKey, mutation)
        : null;
      if (!generation || task.key !== generationKey(
        generation.partitionKey, generation.outputGenerationId) ||
          task.familyOrdinal >= generation.families.length) return false;
      var pointerKey = generationControlKey(generation.partitionKey);
      var pointerEntry = await readOne(pointerKey, mutation);
      var pointer = pointerEntry.present
        ? await parseGenerationControl(
          pointerEntry.value, generation.partitionKey, mutation)
        : null;
      if (!pointer ||
          pointer.activeOutputGenerationId !== generation.outputGenerationId) {
        return false;
      }
      var family = generation.families[task.familyOrdinal];
      var controlKey = familyStorageKey(
        'control', generation.partitionKey, family.familyId);
      var controlEntry = await readOne(controlKey, mutation);
      var control = controlEntry.present
        ? await parseControl(controlEntry.value, mutation)
        : null;
      var manifest = control && control.state === 'published' &&
        control.activeSnapshotId === family.snapshotId
        ? await readStoredManifest({
          partitionKey: generation.partitionKey,
          familyId: family.familyId,
          snapshotId: family.snapshotId
        }, mutation)
        : null;
      if (!control || control.partitionKey !== generation.partitionKey ||
          control.familyId !== family.familyId ||
          control.state !== 'published' ||
          control.activeSnapshotId !== family.snapshotId ||
          !manifest ||
          manifest.authorizedSetDigest !== generation.authorizedSetDigest ||
          !await readSnapshot(manifest, mutation, true)) {
        await removeKeys([pointerKey], mutation);
        return true;
      }
      return false;
    }

    async function recoverSnapshotTask(snapshot, mutation) {
      var generation = await readActiveGeneration(
        snapshot.partitionKey, mutation, false);
      var member = generation && generation.families.find(function(item) {
        return item.familyId === snapshot.familyId;
      });
      var generationClaimsSnapshot =
        member && member.snapshotId === snapshot.snapshotId;
      var controlEntry = member
        ? await readOne(familyStorageKey(
          'control', snapshot.partitionKey, snapshot.familyId), mutation)
        : null;
      var control = controlEntry && controlEntry.present
        ? await parseControl(controlEntry.value, mutation)
        : null;
      var manifest = control && control.state === 'published' &&
        control.activeSnapshotId === snapshot.snapshotId &&
        member.snapshotId === snapshot.snapshotId
        ? await readStoredManifest(snapshot, mutation)
        : null;
      if (generation && member && control && manifest &&
          manifest.authorizedSetDigest === generation.authorizedSetDigest &&
          await readSnapshot(manifest, mutation, true)) {
        return false;
      }
      await removeSnapshot(
        snapshot.partitionKey, snapshot.familyId,
        snapshot.snapshotId, mutation, true);
      return generationClaimsSnapshot ? 'reset' : true;
    }

    async function runRecoveryTask(task, mutation) {
      var taskRepaired;
      if (task.kind === 'control') {
        taskRepaired = await recoverControlTask(task.key, mutation);
      } else if (task.kind === 'generation-control') {
        taskRepaired = await recoverGenerationControlTask(task.key, mutation);
      } else if (task.kind === 'generation') {
        taskRepaired = await recoverGenerationTask(task.key, mutation);
      } else if (task.kind === 'generation-member') {
        taskRepaired = await recoverGenerationMemberTask(task, mutation);
      } else if (task.kind === 'snapshot') {
        taskRepaired = await recoverSnapshotTask(task.snapshot, mutation);
      } else {
        throw statusError('recovery-pending');
      }
      return frozenRecord([
        ['repaired', taskRepaired !== false],
        ['reset', taskRepaired === 'reset' ||
          (taskRepaired && task.kind === 'generation-member')]
      ]);
    }

    async function writeRecoveryProgress(
      inventoryDigest, taskCount, nextTaskOrdinal, repaired, mutation) {
      await writeOne(
        recoveryProgressKey(),
        await makeRecoveryProgress({
          inventoryDigest: inventoryDigest,
          taskCount: taskCount,
          nextTaskOrdinal: nextTaskOrdinal,
          repaired: repaired
        }, mutation),
        mutation
      );
    }

    async function recover(mutationGuard) {
      return runMutation(mutationGuard, async function(mutation) {
        var values = await readAll(mutation);
        var inventoryDigest = await recoveryInventoryDigest(values, mutation);
        var tasks = buildRecoveryTasks(values);
        var progressEntry = own(values, recoveryProgressKey())
          ? await parseRecoveryProgress(
            values[recoveryProgressKey()], mutation)
          : null;
        var repaired = progressEntry
          ? progressEntry.repaired
          : own(values, recoveryProgressKey());
        var nextTaskOrdinal = progressEntry &&
          progressEntry.inventoryDigest === inventoryDigest &&
          progressEntry.taskCount === tasks.length
          ? progressEntry.nextTaskOrdinal
          : 0;
        var steps = 0;

        await writeRecoveryProgress(
          inventoryDigest, tasks.length, nextTaskOrdinal, repaired, mutation);

        while (steps < LIMITS.MAX_RECOVERY_STEPS &&
            nextTaskOrdinal < tasks.length) {
          var task = tasks[nextTaskOrdinal];
          var taskId = recoveryTaskId(task);
          mutation.recoveryTouchedKeys = new Set();
          var taskResult = await runRecoveryTask(task, mutation);
          var touchedKeys = mutation.recoveryTouchedKeys;
          mutation.recoveryTouchedKeys = null;
          steps += 1;
          if (taskResult.repaired) {
            repaired = true;
            var repairedValues = await readAll(mutation);
            var concurrentChange = recoveryInventoryChangedOutside(
              values, repairedValues, touchedKeys);
            values = repairedValues;
            inventoryDigest = await recoveryInventoryDigest(values, mutation);
            tasks = buildRecoveryTasks(values);
            nextTaskOrdinal = taskResult.reset || concurrentChange
              ? 0
              : recoveryTaskResume(tasks, taskId);
          } else {
            nextTaskOrdinal += 1;
          }
          await writeRecoveryProgress(
            inventoryDigest, tasks.length, nextTaskOrdinal, repaired, mutation);
        }

        values = await readAll(mutation);
        var currentDigest = await recoveryInventoryDigest(values, mutation);
        if (currentDigest !== inventoryDigest) {
          inventoryDigest = currentDigest;
          tasks = buildRecoveryTasks(values);
          nextTaskOrdinal = 0;
          await writeRecoveryProgress(
            inventoryDigest, tasks.length, nextTaskOrdinal, repaired, mutation);
        }
        if (nextTaskOrdinal < tasks.length) {
          return failed('recovery-pending');
        }

        var completionStatus = repaired ? 'repaired' : 'complete';
        if (tasks.length > LIMITS.MAX_RECOVERY_STEPS) {
          await writeRecoveryProgress(
            inventoryDigest, tasks.length, tasks.length, false, mutation);
          values = await readAll(mutation);
          currentDigest = await recoveryInventoryDigest(values, mutation);
          if (currentDigest !== inventoryDigest) {
            tasks = buildRecoveryTasks(values);
            await writeRecoveryProgress(
              currentDigest, tasks.length, 0, repaired, mutation);
            return failed('recovery-pending');
          }
          return ok(completionStatus);
        }

        await removeKeys([recoveryProgressKey()], mutation);
        values = await readAll(mutation);
        currentDigest = await recoveryInventoryDigest(values, mutation);
        if (currentDigest !== inventoryDigest) {
          tasks = buildRecoveryTasks(values);
          await writeRecoveryProgress(
            currentDigest, tasks.length, 0, repaired, mutation);
          return failed('recovery-pending');
        }
        return ok(completionStatus);
      });
    }

    function durationBucket(value) {
      if (value < 100) return 'lt-100ms';
      if (value < 1000) return '100-999ms';
      if (value < 10000) return '1-9s';
      return '10s-plus';
    }

    function saturated(value) {
      return Number.isFinite(value) && value >= 0
        ? Math.min(1000000, Math.floor(value)) : null;
    }

    function parseDiagnosticInput(value) {
      var input = exactFields(value, DIAGNOSTIC_INPUT_KEYS);
      if (!input || !validPartition(corpusSchema, input.partitionKey) ||
          !DIAGNOSTIC_OPERATIONS[input.operation] ||
          !DIAGNOSTIC_OUTCOMES[input.outcome] ||
          !DIAGNOSTIC_REASONS[input.reason] ||
          !RECOVERY_CODES[input.recoveryCode]) return null;
      var attempted = saturated(input.attemptedCount);
      var accepted = saturated(input.acceptedCount);
      var published = saturated(input.publishedCount);
      var withdrawn = saturated(input.withdrawnCount);
      var duration = saturated(input.durationMs);
      var retries = saturated(input.retryCount);
      var repairs = saturated(input.repairCount);
      if ([attempted, accepted, published, withdrawn, duration, retries, repairs].some(
        function(item) { return item === null; })) return null;
      return frozenRecord([
        ['partitionKey', input.partitionKey],
        ['operation', input.operation],
        ['outcome', input.outcome],
        ['reason', input.reason],
        ['attemptedCount', attempted],
        ['acceptedCount', accepted],
        ['publishedCount', published],
        ['withdrawnCount', withdrawn],
        ['durationBucket', durationBucket(duration)],
        ['retryCount', retries],
        ['repairCount', repairs],
        ['recoveryCode', input.recoveryCode]
      ]);
    }

    function diagnosticRecord(input) {
      return frozenRecord([
        ['version', VERSION],
        ['operation', input.operation],
        ['outcome', input.outcome],
        ['reason', input.reason],
        ['attemptedCount', input.attemptedCount],
        ['acceptedCount', input.acceptedCount],
        ['publishedCount', input.publishedCount],
        ['withdrawnCount', input.withdrawnCount],
        ['durationBucket', input.durationBucket],
        ['retryCount', input.retryCount],
        ['repairCount', input.repairCount],
        ['recoveryCode', input.recoveryCode],
        ['timestamp', Math.floor(Math.max(0, now()) / 3600000) * 3600000]
      ]);
    }

    function parseDiagnosticRecord(value) {
      var input = exactFields(value, DIAGNOSTIC_RECORD_KEYS);
      if (!input || input.version !== VERSION ||
          !DIAGNOSTIC_OPERATIONS[input.operation] ||
          !DIAGNOSTIC_OUTCOMES[input.outcome] ||
          !DIAGNOSTIC_REASONS[input.reason] ||
          !RECOVERY_CODES[input.recoveryCode] ||
          !makeSet(['lt-100ms', '100-999ms', '1-9s', '10s-plus'])[input.durationBucket] ||
          !safeInteger(input.timestamp, Number.MAX_SAFE_INTEGER) ||
          [input.attemptedCount, input.acceptedCount, input.publishedCount,
            input.withdrawnCount, input.retryCount, input.repairCount].some(function(item) {
            return !safeInteger(item, 1000000);
          })) return null;
      return frozenRecord(DIAGNOSTIC_RECORD_KEYS.map(function(key) {
        return [key, input[key]];
      }));
    }

    async function makeDiagnosticLedger(partitionKey, records, context) {
      var body = frozenRecord([
        ['version', VERSION],
        ['kind', 'diagnostic-ledger'],
        ['partitionKey', partitionKey],
        ['records', frozenArray(records)]
      ]);
      return frozenRecord(Object.keys(body).map(function(key) {
        return [key, body[key]];
      }).concat([['recordHash', await hash(body, context)]]));
    }

    async function parseDiagnosticLedger(value, partitionKey, context) {
      var fields = exactFields(value, DIAGNOSTIC_LEDGER_KEYS);
      var raw = fields && denseArray(fields.records, LIMITS.MAX_DIAGNOSTICS, 0);
      if (!fields || !raw || fields.version !== VERSION ||
          fields.kind !== 'diagnostic-ledger' ||
          fields.partitionKey !== partitionKey || !validFingerprint(fields.recordHash)) return null;
      var records = [];
      for (var index = 0; index < raw.length; index += 1) {
        var record = parseDiagnosticRecord(raw[index]);
        if (!record) return null;
        records.push(record);
      }
      var body = frozenRecord([
        ['version', VERSION], ['kind', 'diagnostic-ledger'],
        ['partitionKey', partitionKey], ['records', frozenArray(records)]
      ]);
      return await hash(body, context) === fields.recordHash ? body : null;
    }

    async function appendDiagnostic(value, mutationGuard) {
      var input = parseDiagnosticInput(value);
      if (!input) return failed('validation-failed');
      return runMutation(mutationGuard, async function(mutation) {
        var key = diagnosticKey(input.partitionKey);
        var entry = await readOne(key, mutation);
        var ledger = entry.present
          ? await parseDiagnosticLedger(entry.value, input.partitionKey, mutation)
          : frozenRecord([['records', frozenArray([])]]);
        if (!ledger) throw statusError('recovery-pending');
        var cutoff = Math.max(0, now() - LIMITS.DIAGNOSTIC_RETENTION_MS);
        var records = Array.from(ledger.records).filter(function(record) {
          return record.timestamp >= cutoff;
        });
        records.push(diagnosticRecord(input));
        records = records.slice(-LIMITS.MAX_DIAGNOSTICS);
        var candidate = await makeDiagnosticLedger(input.partitionKey, records, mutation);
        while (records.length && byteLength(JSON.stringify(candidate)) >
          LIMITS.MAX_DIAGNOSTIC_BYTES) {
          records.shift();
          candidate = await makeDiagnosticLedger(input.partitionKey, records, mutation);
        }
        await writeOne(key, candidate, mutation);
        return ok('recorded');
      });
    }

    async function inspectMetadata(value) {
      var input = exactFields(value, ['partitionKey']);
      if (!input || !validPartition(corpusSchema, input.partitionKey)) return null;
      try {
        var generation = await readActiveGeneration(
          input.partitionKey, null, true);
        var families = generation
          ? generation.families.map(function(family) {
            return frozenRecord([
              ['familyId', family.familyId],
              ['state', 'published'],
              ['snapshotId', family.snapshotId]
            ]);
          })
          : [];
        return frozenRecord([
          ['version', VERSION],
          ['partitionKey', input.partitionKey],
          ['outputGenerationId',
            generation ? generation.outputGenerationId : null],
          ['authorizedSetDigest',
            generation ? generation.authorizedSetDigest : null],
          ['families', frozenArray(families)]
        ]);
      } catch (_error) {
        return null;
      }
    }

    return Object.freeze({
      issueMutation: issueMutation,
      finishMutation: finishMutation,
      beginFamilyReplacement: beginFamilyReplacement,
      stageFamilySnapshot: stageFamilySnapshot,
      publishFamilySnapshot: publishFamilySnapshot,
      publishPartitionGeneration: publishPartitionGeneration,
      withdrawFamiliesForSources: withdrawFamiliesForSources,
      readActiveFamily: readActiveFamily,
      readActiveFamilyMetadata: readActiveFamilyMetadata,
      inspectMetadata: inspectMetadata,
      getPurgeParticipant: getPurgeParticipant,
      graphInvalidator: graphInvalidator,
      recover: recover,
      appendDiagnostic: appendDiagnostic
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    LIMITS: LIMITS,
    create: create
  });

  global.FsbSkopeoTruthStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
