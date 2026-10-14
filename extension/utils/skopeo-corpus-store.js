(function(global) {
  'use strict';

  var VERSION = 'skopeo-corpus-store/v1';
  var CHECKPOINT_VERSION = 'skopeo-corpus-checkpoint/v1';
  var HANDLE_VERSION = 'skopeo-corpus-handle/v1';
  var OPERATION_VERSION = 'skopeo-corpus-operation/v1';
  var JOURNAL_VERSION = 'skopeo-corpus-journal/v1';

  var PREFIX = 'skopeoCorpusStore:v1:';
  var CONTROL_KEY = PREFIX + 'control';
  var OPERATION_KEY = PREFIX + 'operation';
  var PARTITION_PREFIX = PREFIX + 'partition:';
  var SOURCE_PREFIX = PREFIX + 'source:';
  var CHECKPOINT_PREFIX = PREFIX + 'checkpoint:';
  var SOURCE_JOURNAL_PREFIX = PREFIX + 'journal:source:';
  var PARTITION_JOURNAL_PREFIX = PREFIX + 'journal:partition:';

  var LIMITS = Object.freeze({
    MAX_SOURCES: 4096,
    MAX_PARTICIPANTS: 7,
    MAX_RECOVERY_STEPS: 64,
    MAX_REASON_LENGTH: 32
  });

  var PARTICIPANT_NAMES = Object.freeze([
    'fragments',
    'indexes',
    'citations',
    'counts',
    'relationships',
    'result-cache',
    'alerts'
  ]);
  var PARTICIPANT_SET = makeSet(PARTICIPANT_NAMES);
  var REASONS = makeSet([
    'access-revoked',
    'account-changed',
    'corrupt-record',
    'identity-changed',
    'lost-access',
    'orphaned-staging',
    'root-replaced',
    'source-missing',
    'user-withdrawn'
  ]);

  var HANDLE_KEYS = [
    'version',
    'partitionKey',
    'accountPermissionId',
    'corpusRootFileId',
    'operationEpoch'
  ];
  var CHECKPOINT_INPUT_KEYS = ['version', 'kind', 'cursor', 'sourceCount'];
  var CHECKPOINT_RECORD_KEYS = [
    'version',
    'kind',
    'partitionKey',
    'operationEpoch',
    'cursor',
    'sourceCount'
  ];
  var OPERATION_KEYS = [
    'version',
    'kind',
    'state',
    'partitionKey',
    'accountPermissionId',
    'corpusRootFileId',
    'operationEpoch',
    'priorPartitionKey'
  ];
  var SOURCE_JOURNAL_KEYS = [
    'version',
    'kind',
    'state',
    'partitionKey',
    'accountPermissionId',
    'corpusRootFileId',
    'sourceFileId',
    'reason',
    'cursor'
  ];
  var RETAINED_SOURCE_JOURNAL_KEYS = SOURCE_JOURNAL_KEYS.concat(['retainState']);
  var PARTITION_JOURNAL_KEYS = [
    'version',
    'kind',
    'state',
    'partitionKey',
    'accountPermissionId',
    'corpusRootFileId',
    'reason',
    'cursor'
  ];

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
      })) {
        return null;
      }
      var expected = expectedKeys.slice().sort();
      var actual = keys.slice().sort();
      for (var index = 0; index < expected.length; index += 1) {
        if (expected[index] !== actual[index]) return null;
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

  function frozenRecord(entries) {
    var output = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function ok(status) {
    return frozenRecord([
      ['ok', true],
      ['status', status || 'complete']
    ]);
  }

  function failed(status) {
    return frozenRecord([
      ['ok', false],
      ['status', status]
    ]);
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validEpoch(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validReason(value) {
    return typeof value === 'string' && value.length <= LIMITS.MAX_REASON_LENGTH && !!REASONS[value];
  }

  function partitionStorageKey(partitionKey) {
    return PARTITION_PREFIX + partitionKey;
  }

  function sourceStorageKey(sourceKey) {
    return SOURCE_PREFIX + sourceKey;
  }

  function checkpointStorageKey(partitionKey) {
    return CHECKPOINT_PREFIX + partitionKey;
  }

  function sourceJournalStorageKey(sourceKey) {
    return SOURCE_JOURNAL_PREFIX + sourceKey;
  }

  function partitionJournalStorageKey(partitionKey) {
    return PARTITION_JOURNAL_PREFIX + partitionKey;
  }

  function closedManifest(schema, lifecycle, authorityEpoch) {
    return schema.parseManifest({
      version: schema.VERSION,
      lifecycle: lifecycle,
      authorityEpoch: authorityEpoch,
      activePartitionKey: null
    });
  }

  function activeManifest(schema, partitionKey, authorityEpoch) {
    return schema.parseManifest({
      version: schema.VERSION,
      lifecycle: 'active',
      authorityEpoch: authorityEpoch,
      activePartitionKey: partitionKey
    });
  }

  function partitionRecord(schema, tuple, partitionKey, lifecycle, partitionEpoch) {
    return schema.parsePartitionRecord({
      version: schema.VERSION,
      partitionKey: partitionKey,
      accountPermissionId: tuple.accountPermissionId,
      corpusRootFileId: tuple.corpusRootFileId,
      lifecycle: lifecycle,
      partitionEpoch: partitionEpoch
    });
  }

  function parseHandle(schema, value) {
    var fields = exactFields(value, HANDLE_KEYS);
    if (!fields || fields.version !== HANDLE_VERSION || !validEpoch(fields.operationEpoch)) return null;
    var tuple = schema.parsePartitionKey(fields.partitionKey);
    if (!tuple || tuple.accountPermissionId !== fields.accountPermissionId ||
        tuple.corpusRootFileId !== fields.corpusRootFileId) {
      return null;
    }
    return frozenRecord([
      ['version', HANDLE_VERSION],
      ['partitionKey', fields.partitionKey],
      ['accountPermissionId', fields.accountPermissionId],
      ['corpusRootFileId', fields.corpusRootFileId],
      ['operationEpoch', fields.operationEpoch]
    ]);
  }

  function makeHandle(operation) {
    return frozenRecord([
      ['version', HANDLE_VERSION],
      ['partitionKey', operation.partitionKey],
      ['accountPermissionId', operation.accountPermissionId],
      ['corpusRootFileId', operation.corpusRootFileId],
      ['operationEpoch', operation.operationEpoch]
    ]);
  }

  function parseCheckpointInput(value) {
    var fields = exactFields(value, CHECKPOINT_INPUT_KEYS);
    if (!fields || fields.version !== CHECKPOINT_VERSION || fields.kind !== 'inventory-complete' ||
        !validId(fields.cursor) || !Number.isSafeInteger(fields.sourceCount) ||
        fields.sourceCount < 0 || fields.sourceCount > LIMITS.MAX_SOURCES) {
      return null;
    }
    return fields;
  }

  function parseCheckpointRecord(schema, value) {
    var fields = exactFields(value, CHECKPOINT_RECORD_KEYS);
    if (!fields || fields.version !== CHECKPOINT_VERSION || fields.kind !== 'inventory-complete' ||
        !validEpoch(fields.operationEpoch) || !validId(fields.cursor) ||
        !Number.isSafeInteger(fields.sourceCount) || fields.sourceCount < 0 ||
        fields.sourceCount > LIMITS.MAX_SOURCES || !schema.parsePartitionKey(fields.partitionKey)) {
      return null;
    }
    return fields;
  }

  function makeCheckpointRecord(operation, checkpoint) {
    return {
      version: CHECKPOINT_VERSION,
      kind: 'inventory-complete',
      partitionKey: operation.partitionKey,
      operationEpoch: operation.operationEpoch,
      cursor: checkpoint.cursor,
      sourceCount: checkpoint.sourceCount
    };
  }

  function parseOperation(schema, value) {
    var fields = exactFields(value, OPERATION_KEYS);
    if (!fields || fields.version !== OPERATION_VERSION || fields.kind !== 'replacement' ||
        (fields.state !== 'staging' && fields.state !== 'committed') ||
        !validEpoch(fields.operationEpoch)) {
      return null;
    }
    var tuple = schema.parsePartitionKey(fields.partitionKey);
    if (!tuple || tuple.accountPermissionId !== fields.accountPermissionId ||
        tuple.corpusRootFileId !== fields.corpusRootFileId ||
        !(fields.priorPartitionKey === null || schema.parsePartitionKey(fields.priorPartitionKey))) {
      return null;
    }
    return frozenRecord([
      ['version', OPERATION_VERSION],
      ['kind', 'replacement'],
      ['state', fields.state],
      ['partitionKey', fields.partitionKey],
      ['accountPermissionId', fields.accountPermissionId],
      ['corpusRootFileId', fields.corpusRootFileId],
      ['operationEpoch', fields.operationEpoch],
      ['priorPartitionKey', fields.priorPartitionKey]
    ]);
  }

  function operationRecord(tuple, partitionKey, operationEpoch, priorPartitionKey, state) {
    return {
      version: OPERATION_VERSION,
      kind: 'replacement',
      state: state,
      partitionKey: partitionKey,
      accountPermissionId: tuple.accountPermissionId,
      corpusRootFileId: tuple.corpusRootFileId,
      operationEpoch: operationEpoch,
      priorPartitionKey: priorPartitionKey
    };
  }

  function sameOperation(handle, operation, state) {
    return !!handle && !!operation && operation.state === state &&
      handle.partitionKey === operation.partitionKey &&
      handle.accountPermissionId === operation.accountPermissionId &&
      handle.corpusRootFileId === operation.corpusRootFileId &&
      handle.operationEpoch === operation.operationEpoch;
  }

  function parseSourceJournal(schema, value) {
    var fields = exactFields(value, SOURCE_JOURNAL_KEYS);
    if (!fields) fields = exactFields(value, RETAINED_SOURCE_JOURNAL_KEYS);
    if (!fields || fields.version !== JOURNAL_VERSION || fields.kind !== 'source-purge' ||
        (fields.state !== 'pending' && fields.state !== 'complete') ||
        !validReason(fields.reason) || !Number.isSafeInteger(fields.cursor) || fields.cursor < 0 ||
        fields.cursor > PARTICIPANT_NAMES.length * 2 || !validId(fields.sourceFileId) ||
        (own(fields, 'retainState') && fields.retainState !== 'pending')) {
      return null;
    }
    var tuple = schema.parsePartitionKey(fields.partitionKey);
    var sourceKey = schema.makeSourceKey({
      accountPermissionId: fields.accountPermissionId,
      corpusRootFileId: fields.corpusRootFileId,
      sourceFileId: fields.sourceFileId
    });
    if (!tuple || tuple.accountPermissionId !== fields.accountPermissionId ||
        tuple.corpusRootFileId !== fields.corpusRootFileId || !sourceKey) {
      return null;
    }
    if (!own(fields, 'retainState')) fields.retainState = null;
    return fields;
  }

  function parsePartitionJournal(schema, value) {
    var fields = exactFields(value, PARTITION_JOURNAL_KEYS);
    if (!fields || fields.version !== JOURNAL_VERSION || fields.kind !== 'partition-purge' ||
        (fields.state !== 'pending' && fields.state !== 'complete') ||
        !validReason(fields.reason) || !Number.isSafeInteger(fields.cursor) || fields.cursor < 0 ||
        fields.cursor > PARTICIPANT_NAMES.length * 2) {
      return null;
    }
    var tuple = schema.parsePartitionKey(fields.partitionKey);
    if (!tuple || tuple.accountPermissionId !== fields.accountPermissionId ||
        tuple.corpusRootFileId !== fields.corpusRootFileId) {
      return null;
    }
    return fields;
  }

  function sourceJournal(tuple, partitionKey, sourceFileId, reason, state, cursor, retainState) {
    var journal = {
      version: JOURNAL_VERSION,
      kind: 'source-purge',
      state: state,
      partitionKey: partitionKey,
      accountPermissionId: tuple.accountPermissionId,
      corpusRootFileId: tuple.corpusRootFileId,
      sourceFileId: sourceFileId,
      reason: reason,
      cursor: cursor
    };
    if (retainState) journal.retainState = retainState;
    return journal;
  }

  function partitionJournal(tuple, partitionKey, reason, state, cursor) {
    return {
      version: JOURNAL_VERSION,
      kind: 'partition-purge',
      state: state,
      partitionKey: partitionKey,
      accountPermissionId: tuple.accountPermissionId,
      corpusRootFileId: tuple.corpusRootFileId,
      reason: reason,
      cursor: cursor
    };
  }

  function sourceTombstone(schema, tuple, partitionKey, sourceFileId) {
    return schema.parseSourceRecord({
      version: schema.VERSION,
      sourceKey: schema.makeSourceKey({
        accountPermissionId: tuple.accountPermissionId,
        corpusRootFileId: tuple.corpusRootFileId,
        sourceFileId: sourceFileId
      }),
      partitionKey: partitionKey,
      accountPermissionId: tuple.accountPermissionId,
      corpusRootFileId: tuple.corpusRootFileId,
      sourceFileId: sourceFileId,
      visibility: 'purging',
      state: 'inaccessible',
      evidence: { tag: 'lost-access' },
      displayName: null,
      metadataFingerprint: null,
      membershipFingerprint: null,
      contentFingerprint: null
    });
  }

  function retainedPendingSource(schema, tuple, partitionKey, sourceFileId) {
    return schema.parseSourceRecord({
      version: schema.VERSION,
      sourceKey: schema.makeSourceKey({
        accountPermissionId: tuple.accountPermissionId,
        corpusRootFileId: tuple.corpusRootFileId,
        sourceFileId: sourceFileId
      }),
      partitionKey: partitionKey,
      accountPermissionId: tuple.accountPermissionId,
      corpusRootFileId: tuple.corpusRootFileId,
      sourceFileId: sourceFileId,
      visibility: 'withheld',
      state: 'pending',
      evidence: { tag: 'transient-proof-failure' },
      displayName: null,
      metadataFingerprint: null,
      membershipFingerprint: null,
      contentFingerprint: null
    });
  }

  function create(options) {
    var fields = exactFields(options, ['storageArea', 'schema', 'now']);
    if (!fields || !fields.storageArea || typeof fields.storageArea.get !== 'function' ||
        typeof fields.storageArea.set !== 'function' || typeof fields.storageArea.remove !== 'function' ||
        !fields.schema || fields.schema !== global.FsbSkopeoCorpusSchema ||
        typeof fields.now !== 'function') {
      throw new TypeError('Invalid Skopeo corpus store dependencies');
    }

    var storage = fields.storageArea;
    var schema = fields.schema;
    var now = fields.now;
    var participants = new Map();
    var partitionLanes = new Map();
    var globalLane = Promise.resolve();
    var visibleAccountPermissionId = null;
    var publicationFence = null;
    var issuedHandles = new WeakMap();
    var issuedMutations = new WeakMap();
    var participantAuthorizations = new WeakMap();
    var cancelledMutationFences = new Set();
    var mutationSequence = 0;
    var CANCELLED_MUTATION = Object.freeze({});

    function validAbortSignal(value) {
      return !!value && typeof value === 'object' &&
        typeof value.aborted === 'boolean' &&
        typeof value.addEventListener === 'function' &&
        typeof value.removeEventListener === 'function';
    }

    function mutationGuardFields(value) {
      var guard = exactFields(value, ['signal', 'operationToken', 'operationEpoch']);
      return guard && validAbortSignal(guard.signal) &&
        guard.operationToken && typeof guard.operationToken === 'object' &&
        validEpoch(guard.operationEpoch)
        ? guard
        : null;
    }

    function mutationRecord(value) {
      var guard = mutationGuardFields(value);
      var record = guard ? issuedMutations.get(guard.operationToken) : null;
      return record && record.guard === value && record.signal === guard.signal &&
        record.operationEpoch === guard.operationEpoch
        ? record
        : null;
    }

    function mutationOpen(record) {
      return !!record && record.active === true && record.cancelled !== true &&
        record.signal.aborted === false;
    }

    function issueMutation(operationSignal) {
      if (!validAbortSignal(operationSignal) || operationSignal.aborted ||
          typeof global.AbortController !== 'function') return null;
      var token = Object.freeze({});
      mutationSequence += 1;
      var guard = Object.freeze({
        signal: operationSignal,
        operationToken: token,
        operationEpoch: mutationSequence
      });
      var record = {
        guard: guard,
        token: token,
        operationEpoch: mutationSequence,
        signal: operationSignal,
        active: true,
        cancelled: false,
        inFlight: 0,
        terminal: false,
        rollingBack: null,
        undo: new Map(),
        issuedStagingHandles: [],
        visibleSnapshot: null,
        publicationSnapshot: null,
        started: false,
        abortListener: null
      };
      record.abortListener = function() {
        if (!record.active) return;
        record.cancelled = true;
        if (!record.started && record.inFlight === 0) record.terminal = true;
        cancelledMutationFences.add(record);
      };
      issuedMutations.set(token, record);
      operationSignal.addEventListener('abort', record.abortListener, { once: true });
      if (operationSignal.aborted) record.abortListener();
      return guard;
    }

    function finishMutation(value) {
      var record = mutationRecord(value);
      if (!record || record.inFlight !== 0 || (record.cancelled && !record.terminal)) {
        return failed('mutation-not-terminal');
      }
      record.active = false;
      record.signal.removeEventListener('abort', record.abortListener);
      cancelledMutationFences.delete(record);
      issuedMutations.delete(record.token);
      return ok('finished');
    }

    function authorityGuardFields(value) {
      var guard = exactFields(value, [
        'signal',
        'operationToken',
        'operationEpoch',
        'validate'
      ]);
      return guard && validAbortSignal(guard.signal) &&
        guard.operationToken && typeof guard.operationToken === 'object' &&
        validEpoch(guard.operationEpoch) && typeof guard.validate === 'function'
        ? guard
        : null;
    }

    function authorityGuardOpen(handle, parsedHandle, value) {
      if (value === null || value === undefined) return true;
      var guard = authorityGuardFields(value);
      var issued = handle && typeof handle === 'object' ? issuedHandles.get(handle) : null;
      return !!guard && issued && issued.operationEpoch === parsedHandle.operationEpoch &&
        issued.partitionKey === parsedHandle.partitionKey &&
        guard.signal.aborted === false &&
        issued.authorityToken === guard.operationToken &&
        issued.authorityEpoch === guard.operationEpoch;
    }

    function visibilityGateOpen(accountPermissionId) {
      return publicationFence === null && cancelledMutationFences.size === 0 &&
        visibleAccountPermissionId === accountPermissionId;
    }

    async function supersedePublication(parsedHandle, mutation) {
      var current = null;
      try {
        current = await readManifest(mutation);
      } catch (_error) {
        current = null;
      }
      var currentEpoch = current && current.manifest
        ? current.manifest.authorityEpoch
        : 0;
      var closedEpoch = Math.max(parsedHandle.operationEpoch, currentEpoch) + 1;
      await writeOne(CONTROL_KEY, closedManifest(schema, 'closed', closedEpoch), mutation);
    }

    function bindAuthorityGuard(handle, parsedHandle, value) {
      if (value === null || value === undefined) return true;
      var guard = authorityGuardFields(value);
      var issued = handle && typeof handle === 'object' ? issuedHandles.get(handle) : null;
      if (!guard || !issued) return false;
      if (issued.authorityToken === undefined) {
        issued.authorityToken = guard.operationToken;
        issued.authorityEpoch = guard.operationEpoch;
      }
      return authorityGuardOpen(handle, parsedHandle, value);
    }

    function withGlobal(work) {
      var run = globalLane.then(work, work);
      globalLane = run.then(function() {}, function() {});
      return run;
    }

    function withPartition(partitionKey, work) {
      var prior = partitionLanes.get(partitionKey) || Promise.resolve();
      var run = prior.then(work, work);
      var tail = run.then(function() {}, function() {});
      partitionLanes.set(partitionKey, tail);
      tail.then(function() {
        if (partitionLanes.get(partitionKey) === tail) partitionLanes.delete(partitionKey);
      });
      return run;
    }

    function startMutation(record) {
      if (!record.started) {
        record.started = true;
        record.visibleSnapshot = visibleAccountPermissionId;
        record.publicationSnapshot = publicationFence;
      }
      if (!mutationOpen(record)) throw CANCELLED_MUTATION;
    }

    async function mutationAwait(record, promise) {
      startMutation(record);
      var value = await promise;
      if (!mutationOpen(record)) throw CANCELLED_MUTATION;
      return value;
    }

    async function rememberMutationKey(record, key) {
      if (record.undo.has(key)) return;
      var values = await mutationAwait(record, storage.get(key));
      if (!isPlainRecord(values)) throw new Error('Corpus storage read failed closed');
      record.undo.set(key, own(values, key)
        ? { present: true, value: values[key] }
        : { present: false, value: null });
    }

    async function rollbackMutation(record) {
      if (record.rollingBack) return record.rollingBack;
      record.rollingBack = (async function() {
        publicationFence = { cancelledMutation: record.token };
        visibleAccountPermissionId = null;
        try {
          var update = Object.create(null);
          var remove = [];
          record.undo.forEach(function(prior, key) {
            if (prior.present) update[key] = prior.value;
            else remove.push(key);
          });
          if (Object.keys(update).length > 0) await storage.set(update);
          if (remove.length > 0) await storage.remove(remove);
          record.undo.clear();
          record.issuedStagingHandles.forEach(function(handle) { issuedHandles.delete(handle); });
          record.issuedStagingHandles.length = 0;
          publicationFence = record.publicationSnapshot;
          visibleAccountPermissionId = record.visibleSnapshot;
          record.terminal = true;
          return true;
        } catch (_error) {
          publicationFence = null;
          visibleAccountPermissionId = null;
          try {
            var currentValues = await storage.get(CONTROL_KEY);
            var current = isPlainRecord(currentValues) && own(currentValues, CONTROL_KEY)
              ? schema.parseManifest(currentValues[CONTROL_KEY])
              : null;
            var epoch = current ? current.authorityEpoch + 1 : 1;
            var closed = Object.create(null);
            closed[CONTROL_KEY] = closedManifest(schema, 'closed', epoch);
            await storage.set(closed);
          } catch (_closeError) {
            return false;
          }
          record.terminal = true;
          return true;
        }
      })();
      return record.rollingBack;
    }

    async function runMutation(value, work) {
      var record = mutationRecord(value);
      if (!record || !mutationOpen(record) || typeof work !== 'function') {
        return failed('invalid-input');
      }
      record.inFlight += 1;
      try {
        var result = await work(record);
        if (!mutationOpen(record)) throw CANCELLED_MUTATION;
        record.terminal = true;
        return result;
      } catch (error) {
        if (error === CANCELLED_MUTATION || record.cancelled || record.signal.aborted) {
          if (!record.started) {
            record.terminal = true;
            return failed('stale-operation');
          }
          var repaired = await rollbackMutation(record);
          return failed(repaired ? 'stale-operation' : 'recovery-pending');
        }
        return failed('recovery-pending');
      } finally {
        record.inFlight -= 1;
      }
    }

    async function readOne(key, mutation) {
      var values = mutation
        ? await mutationAwait(mutation, storage.get(key))
        : await storage.get(key);
      if (!isPlainRecord(values)) throw new Error('Corpus storage read failed closed');
      return own(values, key) ? { present: true, value: values[key] } : { present: false, value: null };
    }

    async function readAll(mutation) {
      var values = mutation
        ? await mutationAwait(mutation, storage.get(null))
        : await storage.get(null);
      if (!isPlainRecord(values)) throw new Error('Corpus storage read failed closed');
      return values;
    }

    async function writeOne(key, value, mutation) {
      if (mutation) await rememberMutationKey(mutation, key);
      var update = Object.create(null);
      update[key] = value;
      if (mutation) await mutationAwait(mutation, storage.set(update));
      else await storage.set(update);
    }

    async function removeOne(key, mutation) {
      if (mutation) {
        await rememberMutationKey(mutation, key);
        await mutationAwait(mutation, storage.remove(key));
      } else {
        await storage.remove(key);
      }
    }

    async function readManifest(mutation) {
      var entry = await readOne(CONTROL_KEY, mutation);
      if (!entry.present) return { present: false, manifest: null, corrupt: false };
      var manifest = schema.parseManifest(entry.value);
      return { present: true, manifest: manifest, corrupt: !manifest };
    }

    async function closeVisible(lifecycle, mutation) {
      var current;
      try {
        current = await readManifest(mutation);
      } catch (_error) {
        current = { manifest: null };
      }
      var epoch = current.manifest ? current.manifest.authorityEpoch + 1 : 1;
      var manifest = closedManifest(schema, lifecycle, epoch);
      await writeOne(CONTROL_KEY, manifest, mutation);
      return manifest;
    }

    async function readPartition(partitionKey, mutation) {
      var entry = await readOne(partitionStorageKey(partitionKey), mutation);
      if (!entry.present) return { present: false, record: null, corrupt: false };
      var record = schema.parsePartitionRecord(entry.value);
      if (!record || record.partitionKey !== partitionKey) {
        return { present: true, record: null, corrupt: true };
      }
      return { present: true, record: record, corrupt: false };
    }

    async function readOperation(mutation) {
      var entry = await readOne(OPERATION_KEY, mutation);
      if (!entry.present) return { present: false, operation: null, corrupt: false };
      var operation = parseOperation(schema, entry.value);
      return { present: true, operation: operation, corrupt: !operation };
    }

    function exactClaim(value) {
      var partitionKey = schema.makePartitionKey(value);
      if (!partitionKey) return null;
      var tuple = schema.parsePartitionKey(partitionKey);
      return tuple ? { tuple: tuple, partitionKey: partitionKey } : null;
    }

    function exactSourceClaim(claim, sourceFileId) {
      var parsed = exactClaim(claim);
      if (!parsed || !validId(sourceFileId)) return null;
      var sourceKey = schema.makeSourceKey({
        accountPermissionId: parsed.tuple.accountPermissionId,
        corpusRootFileId: parsed.tuple.corpusRootFileId,
        sourceFileId: sourceFileId
      });
      return sourceKey ? {
        tuple: parsed.tuple,
        partitionKey: parsed.partitionKey,
        sourceKey: sourceKey,
        sourceFileId: sourceFileId
      } : null;
    }

    function participantsReady() {
      if (participants.size !== PARTICIPANT_NAMES.length) return false;
      return PARTICIPANT_NAMES.every(function(name) { return participants.has(name); });
    }

    function registerPurgeParticipant(name, participant) {
      var adapter = exactFields(participant, [
        'purgeSource',
        'purgePartition',
        'hasOwnedInfluence'
      ]);
      if (!PARTICIPANT_SET[name] || participants.has(name) || participants.size >= LIMITS.MAX_PARTICIPANTS ||
          !adapter || typeof adapter.purgeSource !== 'function' ||
          typeof adapter.purgePartition !== 'function' ||
          typeof adapter.hasOwnedInfluence !== 'function') {
        return failed('invalid-participant');
      }
      participants.set(name, Object.freeze({
        purgeSource: adapter.purgeSource,
        purgePartition: adapter.purgePartition,
        hasOwnedInfluence: adapter.hasOwnedInfluence
      }));
      return ok('registered');
    }

    function parseParticipantRequest(value) {
      var fields = exactFields(value, [
        'partitionKey',
        'accountPermissionId',
        'corpusRootFileId',
        'sourceFileId',
        'reason'
      ]);
      if (!fields || !validReason(fields.reason) ||
          !(fields.sourceFileId === null || validId(fields.sourceFileId))) {
        return null;
      }
      var tuple = schema.parsePartitionKey(fields.partitionKey);
      if (!tuple || tuple.accountPermissionId !== fields.accountPermissionId ||
          tuple.corpusRootFileId !== fields.corpusRootFileId) {
        return null;
      }
      return fields;
    }

    function makeParticipantCapability(record) {
      var target = Object.freeze(Object.create(null));
      var capability = new Proxy(target, {
        get: function(targetValue, key, receiver) {
          if (key === 'toJSON') {
            throw new TypeError('Participant authorization is not serializable');
          }
          return Reflect.get(targetValue, key, receiver);
        }
      });
      record.capability = capability;
      participantAuthorizations.set(capability, record);
      return capability;
    }

    function registerAuthorizedPurgeParticipant(name, bindParticipant) {
      if (!PARTICIPANT_SET[name] || participants.has(name) ||
          participants.size >= LIMITS.MAX_PARTICIPANTS ||
          typeof bindParticipant !== 'function') {
        return failed('invalid-participant');
      }

      function verifyParticipantAuthorization(capability, expectedMode, expectedRequest) {
        var request = parseParticipantRequest(expectedRequest);
        var authorization = capability && typeof capability === 'object'
          ? participantAuthorizations.get(capability)
          : null;
        if (!request || !authorization || authorization.active !== true ||
            authorization.participantName !== name || authorization.mode !== expectedMode ||
            authorization.request !== expectedRequest ||
            authorization.capability !== capability ||
            authorization.signal !== authorization.mutation.signal ||
            authorization.operationEpoch !== authorization.mutation.operationEpoch ||
            mutationRecord(authorization.mutation.guard) !== authorization.mutation ||
            !mutationOpen(authorization.mutation)) {
          return null;
        }
        return frozenRecord([
          ['signal', authorization.signal],
          ['operationEpoch', authorization.operationEpoch]
        ]);
      }

      var participant;
      try {
        participant = bindParticipant(verifyParticipantAuthorization);
      } catch (_error) {
        return failed('invalid-participant');
      }
      var adapter = exactFields(participant, [
        'purgeSource',
        'purgePartition',
        'hasOwnedInfluence'
      ]);
      if (!adapter || typeof adapter.purgeSource !== 'function' ||
          typeof adapter.purgePartition !== 'function' ||
          typeof adapter.hasOwnedInfluence !== 'function') {
        return failed('invalid-participant');
      }

      function authorizedCall(method, modeForRequest) {
        return async function(request, mutationGuard) {
          var requestFields = parseParticipantRequest(request);
          var mutation = mutationRecord(mutationGuard);
          var mode = requestFields ? modeForRequest(requestFields) : null;
          if (!requestFields || !mutation || !mutationOpen(mutation) || !mode) {
            return method === 'hasOwnedInfluence'
              ? frozenRecord([['owned', true]])
              : frozenRecord([['ok', false]]);
          }
          var authorization = {
            participantName: name,
            mode: mode,
            request: request,
            mutation: mutation,
            signal: mutation.signal,
            operationEpoch: mutation.operationEpoch,
            capability: null,
            active: true
          };
          var capability = makeParticipantCapability(authorization);
          try {
            return await adapter[method](request, capability);
          } finally {
            authorization.active = false;
            participantAuthorizations.delete(capability);
          }
        };
      }

      participants.set(name, Object.freeze({
        purgeSource: authorizedCall('purgeSource', function(request) {
          return request.sourceFileId === null ? null : 'purge-source';
        }),
        purgePartition: authorizedCall('purgePartition', function(request) {
          return request.sourceFileId === null ? 'purge-partition' : null;
        }),
        hasOwnedInfluence: authorizedCall('hasOwnedInfluence', function(request) {
          return request.sourceFileId === null ? 'verify-partition' : 'verify-source';
        })
      }));
      return ok('registered');
    }

    async function beginReplacement(claim, mutationGuard) {
      var parsed = exactClaim(claim);
      if (!parsed) return failed('invalid-input');
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(async function() {
        try {
          var manifestResult = await readManifest(mutation);
          var manifestEpoch = manifestResult.manifest ? manifestResult.manifest.authorityEpoch : 0;
          var activePartitionKey = manifestResult.manifest && manifestResult.manifest.lifecycle === 'active'
            ? manifestResult.manifest.activePartitionKey
            : null;
          var priorPartitionKey = activePartitionKey === parsed.partitionKey
            ? null
            : activePartitionKey;
          var operationResult = await readOperation(mutation);
          var oldOperation = operationResult.operation;
          var operationEpoch = Math.max(
            manifestEpoch,
            oldOperation ? oldOperation.operationEpoch : 0
          ) + 1;

          await writeOne(CONTROL_KEY, closedManifest(schema, 'closed', operationEpoch), mutation);

          if (priorPartitionKey) {
            var priorTuple = schema.parsePartitionKey(priorPartitionKey);
            var priorResult = await readPartition(priorPartitionKey, mutation);
            var priorEpoch = priorResult.record ? priorResult.record.partitionEpoch + 1 : operationEpoch;
            if (priorTuple) {
              await writeOne(
                partitionStorageKey(priorPartitionKey),
                partitionRecord(schema, priorTuple, priorPartitionKey, 'withdrawn', priorEpoch),
                mutation
              );
            }
          }

          if (oldOperation && oldOperation.state === 'staging' &&
              oldOperation.partitionKey !== priorPartitionKey) {
            var abandonedTuple = schema.parsePartitionKey(oldOperation.partitionKey);
            var abandonedResult = await readPartition(oldOperation.partitionKey, mutation);
            var abandonedEpoch = abandonedResult.record
              ? abandonedResult.record.partitionEpoch + 1
              : oldOperation.operationEpoch;
            await writeOne(
              partitionStorageKey(oldOperation.partitionKey),
              partitionRecord(schema, abandonedTuple, oldOperation.partitionKey, 'withdrawn', abandonedEpoch),
              mutation
            );
          }

          var candidateResult = await readPartition(parsed.partitionKey, mutation);
          var partitionEpoch = candidateResult.record
            ? candidateResult.record.partitionEpoch + 1
            : operationEpoch;
          var candidate = partitionRecord(
            schema,
            parsed.tuple,
            parsed.partitionKey,
            'staging',
            partitionEpoch
          );
          await writeOne(partitionStorageKey(parsed.partitionKey), candidate, mutation);
          var operation = operationRecord(
            parsed.tuple,
            parsed.partitionKey,
            operationEpoch,
            priorPartitionKey,
            'staging'
          );
          await writeOne(OPERATION_KEY, operation, mutation);
          visibleAccountPermissionId = parsed.tuple.accountPermissionId;
          var handle = makeHandle(operation);
          issuedHandles.set(handle, {
            partitionKey: operation.partitionKey,
            operationEpoch: operation.operationEpoch
          });
          mutation.issuedStagingHandles.push(handle);
          return handle;
        } catch (_error) {
          return failed('recovery-pending');
        }
        });
      });
    }

    async function validateStagingHandle(handle, parsedHandle, mutation) {
      var issued = handle && typeof handle === 'object' ? issuedHandles.get(handle) : null;
      if (!parsedHandle || !issued || issued.partitionKey !== parsedHandle.partitionKey ||
          issued.operationEpoch !== parsedHandle.operationEpoch) return null;
      var operationResult = await readOperation(mutation);
      if (!sameOperation(parsedHandle, operationResult.operation, 'staging')) return null;
      var partitionResult = await readPartition(parsedHandle.partitionKey, mutation);
      if (!partitionResult.record || partitionResult.record.lifecycle !== 'staging' ||
          partitionResult.record.accountPermissionId !== parsedHandle.accountPermissionId ||
          partitionResult.record.corpusRootFileId !== parsedHandle.corpusRootFileId) {
        return null;
      }
      return { handle: parsedHandle, operation: operationResult.operation, partition: partitionResult.record };
    }

    async function stageSource(handle, sourceValue, mutationGuard) {
      var parsedHandle = parseHandle(schema, handle);
      var source = schema.parseSourceRecord(sourceValue);
      if (!parsedHandle || !source || source.partitionKey !== parsedHandle.partitionKey ||
          source.accountPermissionId !== parsedHandle.accountPermissionId ||
          source.corpusRootFileId !== parsedHandle.corpusRootFileId) {
        return failed('invalid-input');
      }
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsedHandle.partitionKey, async function() {
        try {
          var current = await validateStagingHandle(handle, parsedHandle, mutation);
          if (!current) return failed('stale-operation');
          await removeOne(sourceJournalStorageKey(source.sourceKey), mutation);
          await writeOne(sourceStorageKey(source.sourceKey), source, mutation);
          return ok('staged');
        } catch (_error) {
          return failed('recovery-pending');
        }
        });
        });
      });
    }

    function sourceEntriesForPartition(values, partitionKey) {
      var entries = [];
      var corrupt = false;
      var keys = Object.keys(values).sort();
      for (var index = 0; index < keys.length; index += 1) {
        var storageKey = keys[index];
        if (storageKey.slice(0, SOURCE_PREFIX.length) !== SOURCE_PREFIX) continue;
        var encodedSourceKey = storageKey.slice(SOURCE_PREFIX.length);
        var sourceTuple = schema.parseSourceKey(encodedSourceKey);
        var source = schema.parseSourceRecord(values[storageKey]);
        if (!sourceTuple || !source || sourceStorageKey(source.sourceKey) !== storageKey) {
          if ((source && source.partitionKey === partitionKey) ||
              (sourceTuple && schema.makePartitionKey({
                accountPermissionId: sourceTuple.accountPermissionId,
                corpusRootFileId: sourceTuple.corpusRootFileId
              }) === partitionKey)) {
            corrupt = true;
          }
          continue;
        }
        if (source.partitionKey === partitionKey) entries.push({ key: storageKey, source: source });
      }
      return { entries: entries, corrupt: corrupt };
    }

    async function commitInventory(handle, checkpointValue, mutationGuard, authorityGuard) {
      var parsedHandle = parseHandle(schema, handle);
      var checkpoint = parseCheckpointInput(checkpointValue);
      if (!parsedHandle || !checkpoint ||
          !bindAuthorityGuard(handle, parsedHandle, authorityGuard) ||
          !authorityGuardOpen(handle, parsedHandle, authorityGuard)) {
        return failed('invalid-input');
      }
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsedHandle.partitionKey, async function() {
          try {
            if (!authorityGuardOpen(handle, parsedHandle, authorityGuard)) return failed('stale-operation');
            var current = await validateStagingHandle(handle, parsedHandle, mutation);
            if (!current) return failed('stale-operation');
            if (current.operation.priorPartitionKey) {
              var prior = await readPartition(current.operation.priorPartitionKey, mutation);
              if (prior.record && prior.record.lifecycle !== 'purged') {
                return failed('prior-partition-not-purged');
              }
            }
            var values = await readAll(mutation);
            if (!authorityGuardOpen(handle, parsedHandle, authorityGuard)) return failed('stale-operation');
            var sources = sourceEntriesForPartition(values, parsedHandle.partitionKey);
            if (sources.corrupt || sources.entries.length !== checkpoint.sourceCount) {
              await closeVisible('closed', mutation);
              return failed(sources.corrupt ? 'corrupt-record' : 'incomplete-inventory');
            }
            await writeOne(
              checkpointStorageKey(parsedHandle.partitionKey),
              makeCheckpointRecord(current.operation, checkpoint),
              mutation
            );
            var activePartition = partitionRecord(
              schema,
              current.partition,
              parsedHandle.partitionKey,
              'active',
              current.partition.partitionEpoch
            );
            await writeOne(partitionStorageKey(parsedHandle.partitionKey), activePartition, mutation);
            if (!authorityGuardOpen(handle, parsedHandle, authorityGuard)) return failed('stale-operation');
            await writeOne(OPERATION_KEY, operationRecord(
              current.operation,
              parsedHandle.partitionKey,
              parsedHandle.operationEpoch,
              current.operation.priorPartitionKey,
              'committed'
            ), mutation);
            if (!authorityGuardOpen(handle, parsedHandle, authorityGuard)) return failed('stale-operation');
            var finalGuard = authorityGuardFields(authorityGuard);
            if (finalGuard) {
              var authorityCurrent = await mutationAwait(mutation, finalGuard.validate());
              if (authorityCurrent !== true || !authorityGuardOpen(handle, parsedHandle, authorityGuard)) {
                return failed('stale-operation');
              }
            }
            var publication = {
              operationToken: handle,
              operationEpoch: parsedHandle.operationEpoch
            };
            publicationFence = publication;
            visibleAccountPermissionId = null;
            var publicationError = false;
            try {
              await writeOne(
                CONTROL_KEY,
                activeManifest(schema, parsedHandle.partitionKey, parsedHandle.operationEpoch),
                mutation
              );
            } catch (_writeError) {
              publicationError = true;
            }
            var publicationCurrent = !publicationError &&
              authorityGuardOpen(handle, parsedHandle, authorityGuard);
            if (publicationCurrent && finalGuard) {
              try {
                publicationCurrent = await mutationAwait(mutation, finalGuard.validate()) === true &&
                  authorityGuardOpen(handle, parsedHandle, authorityGuard);
              } catch (_validationError) {
                publicationCurrent = false;
              }
            }
            if (!publicationCurrent) {
              try {
                await supersedePublication(parsedHandle, mutation);
              } catch (_closeError) {
                publicationError = true;
              }
              issuedHandles.delete(handle);
              if (publicationFence === publication) publicationFence = null;
              visibleAccountPermissionId = null;
              return failed(publicationError ? 'recovery-pending' : 'stale-operation');
            }
            issuedHandles.delete(handle);
            if (publicationFence === publication) publicationFence = null;
            visibleAccountPermissionId = parsedHandle.accountPermissionId;
            return ok('active');
          } catch (_error) {
            return failed('recovery-pending');
          }
        });
        });
      });
    }

    async function getVisibleManifest(claim) {
      var parsed = exactClaim(claim);
      if (!parsed || !visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
      try {
        var manifestResult = await readManifest();
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        if (manifestResult.corrupt) {
          await closeVisible('closed');
          return null;
        }
        var manifest = manifestResult.manifest;
        if (!manifest || manifest.lifecycle !== 'active' ||
            manifest.activePartitionKey !== parsed.partitionKey) {
          return null;
        }
        if (!await validatePublishedManifest(manifest)) {
          await closeVisible('closed');
          return null;
        }
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        var partitionResult = await readPartition(parsed.partitionKey);
        if (!partitionResult.record || partitionResult.record.lifecycle !== 'active') {
          await closeVisible('closed');
          return null;
        }
        var checkpointResult = await readOne(checkpointStorageKey(parsed.partitionKey));
        var checkpoint = checkpointResult.present
          ? parseCheckpointRecord(schema, checkpointResult.value)
          : null;
        if (!checkpoint || checkpoint.partitionKey !== parsed.partitionKey) {
          await closeVisible('closed');
          return null;
        }
        var values = await readAll();
        var sourceResult = sourceEntriesForPartition(values, parsed.partitionKey);
        if (sourceResult.corrupt) {
          await closeVisible('closed');
          return null;
        }
        var sources = sourceResult.entries.map(function(entry) { return entry.source; }).filter(function(source) {
          return source.visibility === 'active';
        }).sort(function(left, right) {
          return left.sourceFileId < right.sourceFileId ? -1 : left.sourceFileId > right.sourceFileId ? 1 : 0;
        });
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        return frozenRecord([
          ['version', VERSION],
          ['partitionKey', parsed.partitionKey],
          ['accountPermissionId', parsed.tuple.accountPermissionId],
          ['corpusRootFileId', parsed.tuple.corpusRootFileId],
          ['authorityEpoch', manifest.authorityEpoch],
          ['checkpoint', frozenRecord([
            ['version', checkpoint.version],
            ['kind', checkpoint.kind],
            ['cursor', checkpoint.cursor],
            ['sourceCount', checkpoint.sourceCount]
          ])],
          ['sources', Object.freeze(sources.slice())]
        ]);
      } catch (_error) {
        return null;
      }
    }

    async function getHiddenSourceState(claim, sourceFileId) {
      var parsed = exactSourceClaim(claim, sourceFileId);
      if (!parsed || !visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
      try {
        var manifestResult = await readManifest();
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        if (manifestResult.corrupt) {
          await closeVisible('closed');
          return null;
        }
        var manifest = manifestResult.manifest;
        if (!manifest || manifest.lifecycle !== 'active' ||
            manifest.activePartitionKey !== parsed.partitionKey) return null;
        if (!await validatePublishedManifest(manifest)) {
          await closeVisible('closed');
          return null;
        }
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        var partitionResult = await readPartition(parsed.partitionKey);
        if (!partitionResult.record || partitionResult.record.lifecycle !== 'active') {
          await closeVisible('closed');
          return null;
        }
        var checkpointResult = await readOne(checkpointStorageKey(parsed.partitionKey));
        var checkpoint = checkpointResult.present
          ? parseCheckpointRecord(schema, checkpointResult.value)
          : null;
        if (!checkpoint || checkpoint.partitionKey !== parsed.partitionKey) {
          await closeVisible('closed');
          return null;
        }
        var sourceEntry = await readOne(sourceStorageKey(parsed.sourceKey));
        if (!sourceEntry.present) return null;
        var source = schema.parseSourceRecord(sourceEntry.value);
        if (!source || source.sourceKey !== parsed.sourceKey ||
            source.partitionKey !== parsed.partitionKey) {
          await closeVisible('closed');
          return null;
        }
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        return source.visibility !== 'active' &&
          (source.state === 'pending' || source.state === 'inaccessible' || source.state === 'missing')
          ? source.state
          : null;
      } catch (_error) {
        return null;
      }
    }

    async function transitionSource(claim, sourceFileId, sourceValue, mutationGuard) {
      var parsed = exactSourceClaim(claim, sourceFileId);
      var next = schema.parseSourceRecord(sourceValue);
      if (!parsed || !next || next.sourceKey !== parsed.sourceKey ||
          next.partitionKey !== parsed.partitionKey) {
        return failed('invalid-input');
      }
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsed.partitionKey, async function() {
        try {
          var currentEntry = await readOne(sourceStorageKey(parsed.sourceKey), mutation);
          var current = currentEntry.present ? schema.parseSourceRecord(currentEntry.value) : null;
          if (!current || current.sourceKey !== parsed.sourceKey ||
              !schema.canTransitionSourceState(current.state, next.state, next.evidence)) {
            return failed('invalid-transition');
          }
          await writeOne(sourceStorageKey(parsed.sourceKey), next, mutation);
          return ok('transitioned');
        } catch (_error) {
          return failed('recovery-pending');
        }
        });
        });
      });
    }

    async function withdrawPartition(claim, reason, mutationGuard) {
      var parsed = exactClaim(claim);
      if (!parsed || !validReason(reason)) return failed('invalid-input');
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsed.partitionKey, async function() {
          try {
            var manifestResult = await readManifest(mutation);
            if (manifestResult.corrupt || (manifestResult.manifest &&
                manifestResult.manifest.lifecycle === 'active' &&
                manifestResult.manifest.activePartitionKey === parsed.partitionKey)) {
              await closeVisible('closed', mutation);
            }
            var partitionResult = await readPartition(parsed.partitionKey, mutation);
            var epoch = partitionResult.record ? partitionResult.record.partitionEpoch + 1 : 1;
            await writeOne(
              partitionStorageKey(parsed.partitionKey),
              partitionRecord(schema, parsed.tuple, parsed.partitionKey, 'withdrawn', epoch),
              mutation
            );
            return ok('withdrawn');
          } catch (_error) {
            return failed('recovery-pending');
          }
        });
        });
      });
    }

    function purgeRequest(tuple, partitionKey, sourceFileId, reason) {
      return Object.freeze({
        partitionKey: partitionKey,
        accountPermissionId: tuple.accountPermissionId,
        corpusRootFileId: tuple.corpusRootFileId,
        sourceFileId: sourceFileId,
        reason: reason
      });
    }

    function validPurgeResult(value) {
      var fields = exactFields(value, ['ok']);
      return !!fields && fields.ok === true;
    }

    function validAbsenceResult(value) {
      var fields = exactFields(value, ['owned']);
      return !!fields && fields.owned === false;
    }

    async function runParticipantPurge(journal, journalKey, request, partitionMode, mutation) {
      var cursor = journal.cursor;
      for (var index = cursor; index < PARTICIPANT_NAMES.length; index += 1) {
        var participant = participants.get(PARTICIPANT_NAMES[index]);
        var purgeResult = partitionMode
          ? await mutationAwait(mutation, participant.purgePartition(request, mutation.guard))
          : await mutationAwait(mutation, participant.purgeSource(request, mutation.guard));
        if (!validPurgeResult(purgeResult)) throw new Error('Corpus purge participant failed closed');
        cursor = index + 1;
        journal.cursor = cursor;
        await writeOne(journalKey, journal, mutation);
      }
      for (var verifyIndex = Math.max(0, cursor - PARTICIPANT_NAMES.length);
        verifyIndex < PARTICIPANT_NAMES.length; verifyIndex += 1) {
        var verifier = participants.get(PARTICIPANT_NAMES[verifyIndex]);
        var absence = await mutationAwait(
          mutation,
          verifier.hasOwnedInfluence(request, mutation.guard)
        );
        if (!validAbsenceResult(absence)) throw new Error('Corpus influence remains');
        cursor = PARTICIPANT_NAMES.length + verifyIndex + 1;
        journal.cursor = cursor;
        await writeOne(journalKey, journal, mutation);
      }
      return journal;
    }

    async function purgeSourceUnlocked(parsed, reason, retainedRecord, mutation) {
      if (!participantsReady()) return failed('recovery-pending');
      var journalKey = sourceJournalStorageKey(parsed.sourceKey);
      var existingJournalEntry = await readOne(journalKey, mutation);
      var existingJournal = existingJournalEntry.present
        ? parseSourceJournal(schema, existingJournalEntry.value)
        : null;
      if (existingJournalEntry.present && !existingJournal) return failed('recovery-pending');
      if (existingJournal && (existingJournal.partitionKey !== parsed.partitionKey ||
          existingJournal.sourceFileId !== parsed.sourceFileId)) {
        return failed('recovery-pending');
      }
      var retainState = existingJournal
        ? existingJournal.retainState
        : (retainedRecord ? 'pending' : null);
      if (existingJournal && retainedRecord && retainState !== 'pending') {
        return failed('recovery-pending');
      }
      if (existingJournal && existingJournal.state === 'complete') {
        if (existingJournal.retainState === 'pending' && !retainedRecord) {
          existingJournal = null;
          retainState = null;
        } else {
          return ok('purged');
        }
      }

      var terminalRecord = retainState === 'pending'
        ? (retainedRecord || retainedPendingSource(
            schema, parsed.tuple, parsed.partitionKey, parsed.sourceFileId
          ))
        : null;
      if (retainState === 'pending' && !terminalRecord) return failed('recovery-pending');

      var sourceKey = sourceStorageKey(parsed.sourceKey);
      var sourceEntry = await readOne(sourceKey, mutation);
      if (sourceEntry.present) {
        var source = schema.parseSourceRecord(sourceEntry.value);
        if (!source || source.sourceKey !== parsed.sourceKey || source.partitionKey !== parsed.partitionKey) {
          await closeVisible('closed', mutation);
        }
      }
      var journal = sourceJournal(
        parsed.tuple,
        parsed.partitionKey,
        parsed.sourceFileId,
        existingJournal ? existingJournal.reason : reason,
        'pending',
        existingJournal ? existingJournal.cursor : 0,
        retainState
      );
      if (terminalRecord) {
        await writeOne(journalKey, journal, mutation);
        await writeOne(sourceKey, terminalRecord, mutation);
      }
      await writeOne(
        sourceKey,
        sourceTombstone(schema, parsed.tuple, parsed.partitionKey, parsed.sourceFileId),
        mutation
      );
      if (!terminalRecord) await writeOne(journalKey, journal, mutation);
      var request = purgeRequest(
        parsed.tuple,
        parsed.partitionKey,
        parsed.sourceFileId,
        journal.reason
      );
      await runParticipantPurge(journal, journalKey, request, false, mutation);
      if (terminalRecord) await writeOne(sourceKey, terminalRecord, mutation);
      else await removeOne(sourceKey, mutation);
      journal.state = 'complete';
      await writeOne(journalKey, journal, mutation);
      return ok('purged');
    }

    async function purgeSource(claim, sourceFileId, reason, mutationGuard) {
      var parsed = exactSourceClaim(claim, sourceFileId);
      if (!parsed || !validReason(reason)) return failed('invalid-input');
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsed.partitionKey, async function() {
        try {
          return await purgeSourceUnlocked(parsed, reason, null, mutation);
        } catch (_error) {
          return failed('recovery-pending');
        }
        });
        });
      });
    }

    async function invalidateSource(claim, sourceFileId, sourceValue, reason, mutationGuard) {
      var parsed = exactSourceClaim(claim, sourceFileId);
      var next = schema.parseSourceRecord(sourceValue);
      if (!parsed || !validReason(reason) || !next || next.sourceKey !== parsed.sourceKey ||
          next.partitionKey !== parsed.partitionKey || next.visibility !== 'withheld' ||
          next.state !== 'pending') return failed('invalid-input');
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsed.partitionKey, async function() {
        try {
          return await purgeSourceUnlocked(parsed, reason, next, mutation);
        } catch (_error) {
          return failed('recovery-pending');
        }
        });
        });
      });
    }

    async function purgePartitionUnlocked(parsed, reason, mutation) {
      if (!participantsReady()) return failed('recovery-pending');
      var manifestResult = await readManifest(mutation);
      if (manifestResult.corrupt || (manifestResult.manifest &&
          manifestResult.manifest.lifecycle === 'active' &&
          manifestResult.manifest.activePartitionKey === parsed.partitionKey)) {
        await closeVisible('closed', mutation);
      }

      var partitionKey = partitionStorageKey(parsed.partitionKey);
      var partitionResult = await readPartition(parsed.partitionKey, mutation);
      var partitionEpoch = partitionResult.record ? partitionResult.record.partitionEpoch + 1 : 1;
      if (!partitionResult.record || partitionResult.record.lifecycle !== 'purged') {
        await writeOne(
          partitionKey,
          partitionRecord(schema, parsed.tuple, parsed.partitionKey, 'purging', partitionEpoch),
          mutation
        );
      }

      var journalKey = partitionJournalStorageKey(parsed.partitionKey);
      var journalEntry = await readOne(journalKey, mutation);
      var existingJournal = journalEntry.present
        ? parsePartitionJournal(schema, journalEntry.value)
        : null;
      if (journalEntry.present && !existingJournal) return failed('recovery-pending');
      var journal = partitionJournal(
        parsed.tuple,
        parsed.partitionKey,
        existingJournal ? existingJournal.reason : reason,
        existingJournal && existingJournal.state === 'complete' ? 'complete' : 'pending',
        existingJournal ? existingJournal.cursor : 0
      );

      if (journal.state !== 'complete') {
        await writeOne(journalKey, journal, mutation);
        var values = await readAll(mutation);
        var sourceResult = sourceEntriesForPartition(values, parsed.partitionKey);
        if (sourceResult.corrupt) await closeVisible('closed', mutation);
        for (var sourceIndex = 0; sourceIndex < sourceResult.entries.length; sourceIndex += 1) {
          var source = sourceResult.entries[sourceIndex].source;
          var sourceParsed = exactSourceClaim({
            accountPermissionId: parsed.tuple.accountPermissionId,
            corpusRootFileId: parsed.tuple.corpusRootFileId
          }, source.sourceFileId);
          var sourceResultValue = await purgeSourceUnlocked(sourceParsed, journal.reason, null, mutation);
          if (!sourceResultValue.ok) return sourceResultValue;
        }
        var request = purgeRequest(parsed.tuple, parsed.partitionKey, null, journal.reason);
        await runParticipantPurge(journal, journalKey, request, true, mutation);
        journal.state = 'complete';
        await writeOne(journalKey, journal, mutation);
      }

      await writeOne(
        partitionKey,
        partitionRecord(schema, parsed.tuple, parsed.partitionKey, 'purged', partitionEpoch),
        mutation
      );
      return ok('purged');
    }

    async function purgePartition(claim, reason, mutationGuard) {
      var parsed = exactClaim(claim);
      if (!parsed || !validReason(reason)) return failed('invalid-input');
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(function() {
        return withPartition(parsed.partitionKey, async function() {
          try {
            return await purgePartitionUnlocked(parsed, reason, mutation);
          } catch (_error) {
            return failed('recovery-pending');
          }
        });
        });
      });
    }

    function claimFromPartitionKey(partitionKey) {
      var tuple = schema.parsePartitionKey(partitionKey);
      if (!tuple) return null;
      return {
        tuple: tuple,
        partitionKey: partitionKey
      };
    }

    async function validatePublishedManifest(manifest, mutation) {
      if (!manifest || manifest.lifecycle !== 'active') return false;
      var partitionResult = await readPartition(manifest.activePartitionKey, mutation);
      if (!partitionResult.record || partitionResult.record.lifecycle !== 'active') return false;
      var checkpointEntry = await readOne(checkpointStorageKey(manifest.activePartitionKey), mutation);
      var checkpoint = checkpointEntry.present
        ? parseCheckpointRecord(schema, checkpointEntry.value)
        : null;
      if (!checkpoint || checkpoint.partitionKey !== manifest.activePartitionKey ||
          checkpoint.operationEpoch !== manifest.authorityEpoch) {
        return false;
      }
      var operationResult = await readOperation(mutation);
      return !!operationResult.operation && operationResult.operation.state === 'committed' &&
        operationResult.operation.partitionKey === manifest.activePartitionKey &&
        operationResult.operation.operationEpoch === manifest.authorityEpoch;
    }

    async function recover(input, mutationGuard) {
      var proof = exactFields(input, []);
      var proofAccountPermissionId = null;
      if (!proof) {
        proof = exactFields(input, ['provenAccountPermissionId']);
        if (!proof || !validId(proof.provenAccountPermissionId)) return failed('invalid-input');
        proofAccountPermissionId = proof.provenAccountPermissionId;
      }
      return runMutation(mutationGuard, function(mutation) {
        return withGlobal(async function() {
        try {
          var manifestResult = await readManifest(mutation);
          var manifest = manifestResult.manifest;
          visibleAccountPermissionId = null;
          if (proofAccountPermissionId === null) {
            if (!manifest || manifestResult.corrupt) {
              var unavailableEpoch = manifest ? manifest.authorityEpoch + 1 : 1;
              await writeOne(
                CONTROL_KEY,
                closedManifest(schema, 'unproven', unavailableEpoch),
                mutation
              );
            }
            return frozenRecord([
              ['ok', true],
              ['status', 'unproven']
            ]);
          }

          if (manifestResult.corrupt) {
            manifest = await closeVisible('closed', mutation);
          }
          if (manifest && manifest.lifecycle === 'unproven') {
            var dormantOperationResult = await readOperation(mutation);
            var dormantOperation = dormantOperationResult.operation;
            var dormantTuple = dormantOperation && dormantOperation.state === 'committed'
              ? schema.parsePartitionKey(dormantOperation.partitionKey)
              : null;
            if (dormantTuple && dormantTuple.accountPermissionId === proofAccountPermissionId) {
              var dormantPartition = await readPartition(dormantOperation.partitionKey, mutation);
              var dormantCheckpointEntry = await readOne(
                checkpointStorageKey(dormantOperation.partitionKey),
                mutation
              );
              var dormantCheckpoint = dormantCheckpointEntry.present
                ? parseCheckpointRecord(schema, dormantCheckpointEntry.value)
                : null;
              if (dormantPartition.record && dormantPartition.record.lifecycle === 'active' &&
                  dormantCheckpoint && dormantCheckpoint.operationEpoch ===
                    dormantOperation.operationEpoch) {
                manifest = activeManifest(
                  schema,
                  dormantOperation.partitionKey,
                  dormantOperation.operationEpoch
                );
                await writeOne(CONTROL_KEY, manifest, mutation);
              }
            }
          }
          if (manifest && manifest.lifecycle === 'active') {
            var activeTuple = schema.parsePartitionKey(manifest.activePartitionKey);
            if (!activeTuple || activeTuple.accountPermissionId !== proofAccountPermissionId) {
              var oldPartitionKey = manifest.activePartitionKey;
              await writeOne(
                CONTROL_KEY,
                closedManifest(schema, 'closed', manifest.authorityEpoch + 1),
                mutation
              );
              if (activeTuple) {
                var mismatchParsed = claimFromPartitionKey(oldPartitionKey);
                var mismatchResult = await withPartition(oldPartitionKey, function() {
                  return purgePartitionUnlocked(mismatchParsed, 'account-changed', mutation);
                });
                if (!mismatchResult.ok) return failed('recovery-pending');
              }
              visibleAccountPermissionId = proofAccountPermissionId;
              return frozenRecord([
                ['ok', true],
                ['status', 'purged']
              ]);
            }
            if (!await validatePublishedManifest(manifest, mutation)) {
              manifest = await closeVisible('closed', mutation);
            }
          }

          var values = await readAll(mutation);
          var keys = Object.keys(values).sort();
          var steps = 0;

          for (var sourceIndex = 0; sourceIndex < keys.length && steps < LIMITS.MAX_RECOVERY_STEPS;
            sourceIndex += 1) {
            var sourceJournalKey = keys[sourceIndex];
            if (sourceJournalKey.slice(0, SOURCE_JOURNAL_PREFIX.length) !== SOURCE_JOURNAL_PREFIX) {
              continue;
            }
            var sourceJournalValue = parseSourceJournal(schema, values[sourceJournalKey]);
            if (!sourceJournalValue) {
              await closeVisible('closed', mutation);
              return failed('recovery-pending');
            }
            if (sourceJournalValue.state !== 'pending') continue;
            var sourceClaim = exactSourceClaim({
              accountPermissionId: sourceJournalValue.accountPermissionId,
              corpusRootFileId: sourceJournalValue.corpusRootFileId
            }, sourceJournalValue.sourceFileId);
            var recoveredSource = await withPartition(sourceClaim.partitionKey, function() {
              return purgeSourceUnlocked(sourceClaim, sourceJournalValue.reason, null, mutation);
            });
            if (!recoveredSource.ok) return failed('recovery-pending');
            steps += 1;
          }

          for (var partitionIndex = 0; partitionIndex < keys.length && steps < LIMITS.MAX_RECOVERY_STEPS;
            partitionIndex += 1) {
            var partitionJournalKey = keys[partitionIndex];
            if (partitionJournalKey.slice(0, PARTITION_JOURNAL_PREFIX.length) !==
                PARTITION_JOURNAL_PREFIX) {
              continue;
            }
            var partitionJournalValue = parsePartitionJournal(schema, values[partitionJournalKey]);
            if (!partitionJournalValue) {
              await closeVisible('closed', mutation);
              return failed('recovery-pending');
            }
            if (partitionJournalValue.state !== 'pending') continue;
            var journalClaim = claimFromPartitionKey(partitionJournalValue.partitionKey);
            var recoveredPartition = await withPartition(journalClaim.partitionKey, function() {
              return purgePartitionUnlocked(journalClaim, partitionJournalValue.reason, mutation);
            });
            if (!recoveredPartition.ok) return failed('recovery-pending');
            steps += 1;
          }

          values = await readAll(mutation);
          keys = Object.keys(values).sort();
          var currentOperationEntry = own(values, OPERATION_KEY)
            ? parseOperation(schema, values[OPERATION_KEY])
            : null;
          var currentManifestEntry = own(values, CONTROL_KEY)
            ? schema.parseManifest(values[CONTROL_KEY])
            : manifest;
          var operationIsPublished = currentOperationEntry && currentOperationEntry.state === 'committed' &&
            currentManifestEntry && currentManifestEntry.lifecycle === 'active' &&
            currentManifestEntry.activePartitionKey === currentOperationEntry.partitionKey;
          if (currentOperationEntry && !operationIsPublished && steps < LIMITS.MAX_RECOVERY_STEPS) {
            var candidateClaim = claimFromPartitionKey(currentOperationEntry.partitionKey);
            var cleanedCandidate = await withPartition(candidateClaim.partitionKey, function() {
              return purgePartitionUnlocked(candidateClaim, 'orphaned-staging', mutation);
            });
            if (!cleanedCandidate.ok) return failed('recovery-pending');
            await removeOne(OPERATION_KEY, mutation);
            steps += 1;
          } else if (own(values, OPERATION_KEY) && !currentOperationEntry) {
            await closeVisible('closed', mutation);
            return failed('recovery-pending');
          }

          values = await readAll(mutation);
          keys = Object.keys(values).sort();
          for (var recordIndex = 0; recordIndex < keys.length && steps < LIMITS.MAX_RECOVERY_STEPS;
            recordIndex += 1) {
            var recordKey = keys[recordIndex];
            if (recordKey.slice(0, PARTITION_PREFIX.length) !== PARTITION_PREFIX) continue;
            var encodedPartitionKey = recordKey.slice(PARTITION_PREFIX.length);
            var partitionValue = schema.parsePartitionRecord(values[recordKey]);
            if (!partitionValue || partitionStorageKey(partitionValue.partitionKey) !== recordKey) {
              await closeVisible('closed', mutation);
              return failed('recovery-pending');
            }
            var stillActive = currentManifestEntry && currentManifestEntry.lifecycle === 'active' &&
              currentManifestEntry.activePartitionKey === encodedPartitionKey &&
              partitionValue.lifecycle === 'active' &&
              partitionValue.accountPermissionId === proofAccountPermissionId;
            if (!stillActive && partitionValue.lifecycle !== 'purged') {
              var orphanClaim = claimFromPartitionKey(encodedPartitionKey);
              var cleanedOrphan = await withPartition(encodedPartitionKey, function() {
                return purgePartitionUnlocked(orphanClaim, 'orphaned-staging', mutation);
              });
              if (!cleanedOrphan.ok) return failed('recovery-pending');
              steps += 1;
            }
          }

          var finalManifestResult = await readManifest(mutation);
          var finalManifest = finalManifestResult.manifest;
          if (finalManifest && finalManifest.lifecycle === 'active') {
            var finalTuple = schema.parsePartitionKey(finalManifest.activePartitionKey);
            if (finalTuple && finalTuple.accountPermissionId === proofAccountPermissionId) {
              visibleAccountPermissionId = proofAccountPermissionId;
              return frozenRecord([
                ['ok', true],
                ['status', 'active'],
                ['claim', frozenRecord([
                  ['accountPermissionId', finalTuple.accountPermissionId],
                  ['corpusRootFileId', finalTuple.corpusRootFileId]
                ])]
              ]);
            }
          }
          visibleAccountPermissionId = proofAccountPermissionId;
          return frozenRecord([
            ['ok', true],
            ['status', steps >= LIMITS.MAX_RECOVERY_STEPS ? 'recovery-pending' : 'closed']
          ]);
        } catch (_error) {
          return failed('recovery-pending');
        }
        });
      });
    }

    async function inspectMetadata(claim) {
      var parsed = exactClaim(claim);
      if (!parsed || !visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
      try {
        var partitionResult = await readPartition(parsed.partitionKey);
        if (!partitionResult.record) return null;
        var values = await readAll();
        var sourceResult = sourceEntriesForPartition(values, parsed.partitionKey);
        if (sourceResult.corrupt) {
          await closeVisible('closed');
          return null;
        }
        var sources = sourceResult.entries.slice(0, LIMITS.MAX_SOURCES).map(function(entry) {
          return frozenRecord([
            ['sourceFileId', entry.source.sourceFileId],
            ['visibility', entry.source.visibility],
            ['state', entry.source.state],
            ['displayName', entry.source.displayName],
            ['metadataFingerprint', entry.source.metadataFingerprint],
            ['membershipFingerprint', entry.source.membershipFingerprint],
            ['contentFingerprint', entry.source.contentFingerprint]
          ]);
        });
        if (!visibilityGateOpen(parsed.tuple.accountPermissionId)) return null;
        return frozenRecord([
          ['version', VERSION],
          ['partitionKey', parsed.partitionKey],
          ['lifecycle', partitionResult.record.lifecycle],
          ['sources', Object.freeze(sources)]
        ]);
      } catch (_error) {
        return null;
      }
    }

    void now;

    return Object.freeze({
      issueMutation: issueMutation,
      finishMutation: finishMutation,
      recover: recover,
      getHiddenSourceState: getHiddenSourceState,
      getVisibleManifest: getVisibleManifest,
      beginReplacement: beginReplacement,
      stageSource: stageSource,
      transitionSource: transitionSource,
      commitInventory: commitInventory,
      withdrawPartition: withdrawPartition,
      purgeSource: purgeSource,
      invalidateSource: invalidateSource,
      purgePartition: purgePartition,
      registerAuthorizedPurgeParticipant: registerAuthorizedPurgeParticipant,
      registerPurgeParticipant: registerPurgeParticipant,
      inspectMetadata: inspectMetadata
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    LIMITS: LIMITS,
    create: create
  });

  global.FsbSkopeoCorpusStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
