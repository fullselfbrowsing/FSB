(function(global) {
  'use strict';

  var VERSION = 'skopeo-drive-authority/v1';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var DRIVE_ORIGIN = 'https://drive.google.com';
  var DOCS_ORIGIN = 'https://docs.google.com';
  var OPERATION_KINDS = Object.freeze([
    'ingestion',
    'query',
    'display',
    'citation-open',
    'alert-delivery'
  ]);
  var OPERATION_KIND_SET = makeSet(OPERATION_KINDS);
  var EFFECT_OPERATION_KIND_SET = makeSet([
    'ingestion',
    'citation-open',
    'alert-delivery'
  ]);
  var LIMITS = Object.freeze({
    MAX_SOURCES_PER_OPERATION: 64,
    MAX_ANCESTRY_DEPTH: 32,
    MAX_ANCESTRY_REQUESTS: 256,
    MAX_PARENT_PAGES: 16,
    MAX_OPERATION_MS: 30000
  });
  var BASE_CONTEXT_KEYS = [
    'tabId',
    'origin',
    'generation',
    'profileId',
    'profileVersion',
    'contextEpoch',
    'contextKind',
    'entityKind',
    'entityId'
  ];
  var OPERATION_CONTEXT_KEYS = BASE_CONTEXT_KEYS.concat([
    'accountPermissionId',
    'corpusRootFileId'
  ]);
  var OPTION_KEYS = [
    'schema',
    'store',
    'transport',
    'readLiveContext',
    'now',
    'signal',
    'scheduleReconciliation',
    'limits'
  ];
  var LIMIT_KEYS = [
    'maxSourcesPerOperation',
    'maxAncestryDepth',
    'maxAncestryRequests',
    'maxParentPages',
    'maxOperationMs'
  ];
  var TIMEOUT = Object.freeze({ type: 'timeout' });
  var ABORTED = Object.freeze({ type: 'aborted' });

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

  function exactDataValues(value, expectedKeys) {
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

  function dataArrayValues(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) return null;
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
    var output = {};
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
  }

  function nonserializableCapability(entries, label) {
    var target = {};
    for (var index = 0; index < entries.length; index += 1) {
      target[entries[index][0]] = entries[index][1];
    }
    Object.defineProperty(target, 'toJSON', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: function() {
        throw new TypeError('Skopeo ' + label + ' is nonserializable');
      }
    });
    Object.freeze(target);
    return new Proxy(target, Object.freeze({}));
  }

  function decision(kind) {
    return frozenRecord([['decision', kind]]);
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function validBoundedText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
      !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]/.test(value);
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function normalizeBaseContext(value) {
    var fields = exactDataValues(value, BASE_CONTEXT_KEYS);
    if (!fields || !Number.isSafeInteger(fields.tabId) || fields.tabId < 0 ||
        (fields.origin !== DRIVE_ORIGIN && fields.origin !== DOCS_ORIGIN) ||
        !positiveInteger(fields.generation) || !validBoundedText(fields.profileId, 128) ||
        !positiveInteger(fields.profileVersion) || !positiveInteger(fields.contextEpoch) ||
        !validBoundedText(fields.contextKind, 80) || !validBoundedText(fields.entityKind, 80) ||
        !validBoundedText(fields.entityId, 512)) {
      return null;
    }
    return fields;
  }

  function normalizeOperationContext(value) {
    var fields = exactDataValues(value, OPERATION_CONTEXT_KEYS);
    if (!fields || !validId(fields.accountPermissionId) || !validId(fields.corpusRootFileId)) {
      return null;
    }
    var base = {};
    for (var index = 0; index < BASE_CONTEXT_KEYS.length; index += 1) {
      base[BASE_CONTEXT_KEYS[index]] = fields[BASE_CONTEXT_KEYS[index]];
    }
    return normalizeBaseContext(base) ? fields : null;
  }

  function baseContextMatches(expected, current) {
    if (!expected || !current) return false;
    for (var index = 0; index < BASE_CONTEXT_KEYS.length; index += 1) {
      if (expected[BASE_CONTEXT_KEYS[index]] !== current[BASE_CONTEXT_KEYS[index]]) return false;
    }
    return true;
  }

  function normalizeLimits(value) {
    var fields = exactDataValues(value, LIMIT_KEYS);
    if (!fields || !positiveInteger(fields.maxSourcesPerOperation) ||
        fields.maxSourcesPerOperation > LIMITS.MAX_SOURCES_PER_OPERATION ||
        !positiveInteger(fields.maxAncestryDepth) ||
        fields.maxAncestryDepth > LIMITS.MAX_ANCESTRY_DEPTH ||
        !positiveInteger(fields.maxAncestryRequests) ||
        fields.maxAncestryRequests > LIMITS.MAX_ANCESTRY_REQUESTS ||
        !positiveInteger(fields.maxParentPages) ||
        fields.maxParentPages > LIMITS.MAX_PARENT_PAGES ||
        !positiveInteger(fields.maxOperationMs) ||
        fields.maxOperationMs > LIMITS.MAX_OPERATION_MS) {
      return null;
    }
    return Object.freeze({
      maxSourcesPerOperation: fields.maxSourcesPerOperation,
      maxAncestryDepth: fields.maxAncestryDepth,
      maxAncestryRequests: fields.maxAncestryRequests,
      maxParentPages: fields.maxParentPages,
      maxOperationMs: fields.maxOperationMs
    });
  }

  function normalizeExactSourceIds(value, maximum) {
    var values = dataArrayValues(value, maximum);
    if (!values || values.length === 0 || values.some(function(sourceFileId) {
      return !validId(sourceFileId);
    }) || new Set(values).size !== values.length) {
      return null;
    }
    return values;
  }

  function normalizedParents(value) {
    var parents = dataArrayValues(value, LIMITS.MAX_ANCESTRY_REQUESTS);
    if (!parents || parents.some(function(parentId) { return !validId(parentId); }) ||
        new Set(parents).size !== parents.length) {
      return null;
    }
    return parents.slice().sort();
  }

  function fileShape(value) {
    if (!isPlainRecord(value) || !validId(value.id) || typeof value.mimeType !== 'string' ||
        typeof value.trashed !== 'boolean' || !isPlainRecord(value.capabilities)) {
      return null;
    }
    var parents = normalizedParents(value.parents);
    if (!parents || typeof value.capabilities.canListChildren !== 'boolean' ||
        typeof value.capabilities.canDownload !== 'boolean') {
      return null;
    }
    return {
      value: value,
      id: value.id,
      name: typeof value.name === 'string' ? value.name : '',
      mimeType: value.mimeType,
      parents: parents,
      trashed: value.trashed,
      driveId: value.driveId === null || validId(value.driveId) ? value.driveId : null,
      canListChildren: value.capabilities.canListChildren,
      canDownload: value.capabilities.canDownload,
      version: typeof value.version === 'string' && /^\d{1,32}$/.test(value.version)
        ? value.version
        : '0',
      modifiedTime: normalizedTime(value.modifiedTime),
      size: Number.isSafeInteger(value.size) && value.size >= 0 ? value.size : 0
    };
  }

  function normalizedTime(value) {
    if (typeof value !== 'string') return null;
    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    return new Date(milliseconds).toISOString();
  }

  function sourceSignature(schema, shape, chain, vendorScopeFileId) {
    var fileValue = shape.value;
    return schema.canonicalize({
      id: shape.id,
      name: typeof fileValue.name === 'string' ? fileValue.name : null,
      mimeType: shape.mimeType,
      parents: shape.parents,
      trashed: shape.trashed,
      driveId: shape.driveId,
      canDownload: shape.canDownload,
      canListChildren: shape.canListChildren,
      version: typeof fileValue.version === 'string' ? fileValue.version : null,
      headRevisionId: typeof fileValue.headRevisionId === 'string' ? fileValue.headRevisionId : null,
      md5Checksum: typeof fileValue.md5Checksum === 'string' ? fileValue.md5Checksum : null,
      sha1Checksum: typeof fileValue.sha1Checksum === 'string' ? fileValue.sha1Checksum : null,
      sha256Checksum: typeof fileValue.sha256Checksum === 'string' ? fileValue.sha256Checksum : null,
      size: Number.isSafeInteger(fileValue.size) ? fileValue.size : null,
      modifiedTime: typeof fileValue.modifiedTime === 'string' ? fileValue.modifiedTime : null,
      physicalParentChain: chain,
      vendorScopeFileId: vendorScopeFileId
    });
  }

  function mapTransportFailure(result, parentEvidence) {
    if (!result || typeof result.kind !== 'string') return decision('pending');
    if (parentEvidence) return decision('pending');
    if (result.kind === 'denied' || result.kind === 'not-found') return decision('inaccessible');
    return decision('pending');
  }

  function create(options) {
    var fields = exactDataValues(options, OPTION_KEYS);
    if (!fields || !fields.schema || typeof fields.schema.canonicalize !== 'function' ||
        typeof fields.schema.parseSourceRecord !== 'function' ||
        typeof fields.schema.parseMetadataFingerprint !== 'function' ||
        typeof fields.schema.parseMembershipFingerprint !== 'function' ||
        typeof fields.schema.parseContentFingerprint !== 'function' ||
        !fields.store || typeof fields.store.issueMutation !== 'function' ||
        typeof fields.store.finishMutation !== 'function' ||
        typeof fields.store.getVisibleManifest !== 'function' ||
        typeof fields.store.getHiddenSourceState !== 'function' ||
        typeof fields.store.recover !== 'function' ||
        typeof fields.store.withdrawPartition !== 'function' ||
        typeof fields.store.purgePartition !== 'function' ||
        typeof fields.store.transitionSource !== 'function' ||
        typeof fields.store.purgeSource !== 'function' ||
        typeof fields.store.invalidateSource !== 'function' ||
        !fields.transport || typeof fields.transport.about !== 'function' ||
        typeof fields.transport.getFile !== 'function' ||
        typeof fields.transport.listChildren !== 'function' ||
        typeof fields.transport.readContent !== 'function' ||
        typeof fields.readLiveContext !== 'function' || typeof fields.now !== 'function' ||
        !fields.signal || typeof fields.signal.aborted !== 'boolean' ||
        typeof fields.scheduleReconciliation !== 'function') {
      return null;
    }
    var limits = normalizeLimits(fields.limits);
    if (!limits) return null;

    var schema = fields.schema;
    var store = fields.store;
    var transport = fields.transport;
    var readLiveContext = fields.readLiveContext;
    var now = fields.now;
    var signal = fields.signal;
    var scheduleReconciliation = fields.scheduleReconciliation;
    var operationSequence = 0;
    var proofSequence = 0;
    var operationRegistry = new WeakMap();
    var operationIdentities = new WeakSet();
    var certificateRegistry = new WeakMap();
    var certificateIdentities = new WeakSet();
    var effectTokenRegistry = new WeakMap();
    var effectAckRegistry = new WeakMap();

    function abortRecord(record, reason) {
      if (!record || !record.controller || record.signal.aborted) return;
      record.abortReason = reason || ABORTED;
      try {
        record.controller.abort(record.abortReason);
      } catch (_error) {
        try { record.controller.abort(); } catch (_ignored) { return; }
      }
    }

    function guardOpen(record) {
      var currentTime;
      try {
        currentTime = now();
      } catch (_error) {
        return false;
      }
      return !!record && record.active === true && signal.aborted !== true &&
        record.signal && record.signal.aborted !== true &&
        Number.isFinite(currentTime) && currentTime <= record.deadline;
    }

    async function guardedAwait(record, thunk) {
      if (!guardOpen(record) || typeof thunk !== 'function') {
        return { ok: false, reason: signal.aborted || (record && record.abortReason === ABORTED)
          ? ABORTED
          : TIMEOUT };
      }
      var currentTime;
      try {
        currentTime = now();
      } catch (_error) {
        return { ok: false, reason: TIMEOUT };
      }
      var remaining = Math.max(1, Math.floor(record.deadline - currentTime));
      var timer = null;
      var abortListener = null;
      try {
        var promise;
        try {
          promise = Promise.resolve().then(function() { return thunk(record.signal); });
        } catch (_error) {
          return { ok: false, reason: decision('pending') };
        }
        var winner = await new Promise(function(resolve) {
          var settled = false;
          function finish(value) {
            if (settled) return;
            settled = true;
            resolve(value);
          }
          timer = global.setTimeout(function() {
            abortRecord(record, TIMEOUT);
            finish({ timeout: true });
          }, remaining);
          if (record.signal && typeof record.signal.addEventListener === 'function') {
            abortListener = function() {
              finish({ aborted: record.abortReason === ABORTED, timeout: record.abortReason !== ABORTED });
            };
            record.signal.addEventListener('abort', abortListener, { once: true });
          }
          promise.then(function(value) {
            finish({ value: value });
          }, function() {
            finish({ rejected: true });
          });
        });
        if (winner.timeout || winner.aborted) {
          // The downstream operation may ignore abort forever. Its result is fenced by
          // the closed operation record, so detach it instead of extending the public
          // operation beyond its deadline.
          promise.catch(function() {});
          return { ok: false, reason: winner.aborted ? ABORTED : TIMEOUT };
        }
        if (winner.rejected) return { ok: false, reason: decision('pending') };
        if (!guardOpen(record)) {
          return { ok: false, reason: signal.aborted || record.abortReason === ABORTED
            ? ABORTED
            : TIMEOUT };
        }
        return { ok: true, value: winner.value };
      } finally {
        if (timer !== null) global.clearTimeout(timer);
        if (abortListener && record.signal && typeof record.signal.removeEventListener === 'function') {
          record.signal.removeEventListener('abort', abortListener);
        }
      }
    }

    async function currentBaseContext(record) {
      var read = await guardedAwait(record, function(operationSignal) {
        return readLiveContext(operationSignal);
      });
      if (!read.ok) return null;
      var current = normalizeBaseContext(read.value);
      return baseContextMatches(record.context, current) ? current : null;
    }

    function exactClaim(record) {
      return {
        accountPermissionId: record.accountPermissionId,
        corpusRootFileId: record.corpusRootFileId
      };
    }

    async function closureAwait(thunk) {
      if (typeof thunk !== 'function' || typeof global.AbortController !== 'function') return null;
      var timer = null;
      var abortListener = null;
      var controller = new global.AbortController();
      var operationSignal = controller.signal;
      try {
        var promise = (async function() {
          var operationGuard = store.issueMutation(operationSignal);
          if (!operationGuard) return null;
          try {
            return await thunk(operationGuard);
          } finally {
            var terminal = store.finishMutation(operationGuard);
            if (!terminal || terminal.ok !== true) await new Promise(function() {});
          }
        })();
        return await new Promise(function(resolve) {
          var settled = false;
          function finish(value) {
            if (settled) return;
            settled = true;
            resolve(value);
          }
          timer = global.setTimeout(function() {
            try { controller.abort('timeout'); } catch (_error) { controller.abort(); }
            finish(null);
          }, limits.maxOperationMs);
          if (signal && typeof signal.addEventListener === 'function') {
            abortListener = function() {
              try { controller.abort('parent-aborted'); } catch (_error) { controller.abort(); }
              finish(null);
            };
            signal.addEventListener('abort', abortListener, { once: true });
            if (signal.aborted) abortListener();
          }
          promise.then(finish, function() { finish(null); });
        });
      } finally {
        if (timer !== null) global.clearTimeout(timer);
        if (abortListener && signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', abortListener);
        }
        if (!operationSignal.aborted) {
          try { controller.abort('operation-complete'); } catch (_error) { controller.abort(); }
        }
      }
    }

    async function closeUnproven(record) {
      void record;
      await closureAwait(function(operationGuard) { return store.recover({}, operationGuard); });
    }

    async function closeForAccount(record, permissionId) {
      void record;
      await closureAwait(function(operationGuard) {
        return store.recover({ provenAccountPermissionId: permissionId }, operationGuard);
      });
    }

    async function closePartition(record, reason) {
      var claim = exactClaim(record);
      await closureAwait(function(operationGuard) {
        return store.withdrawPartition(claim, reason, operationGuard);
      });
      await closureAwait(function(operationGuard) {
        return store.purgePartition(claim, reason, operationGuard);
      });
    }

    function hiddenSourceRecord(record, sourceFileId, kind) {
      var partitionKey = schema.makePartitionKey({
        accountPermissionId: record.accountPermissionId,
        corpusRootFileId: record.corpusRootFileId
      });
      var sourceKey = schema.makeSourceKey({
        accountPermissionId: record.accountPermissionId,
        corpusRootFileId: record.corpusRootFileId,
        sourceFileId: sourceFileId
      });
      if (!partitionKey || !sourceKey) return null;
      return schema.parseSourceRecord({
        version: schema.VERSION,
        sourceKey: sourceKey,
        partitionKey: partitionKey,
        accountPermissionId: record.accountPermissionId,
        corpusRootFileId: record.corpusRootFileId,
        sourceFileId: sourceFileId,
        visibility: 'withheld',
        state: kind,
        evidence: { tag: kind === 'pending' ? 'transient-proof-failure' : 'lost-access' },
        displayName: null,
        metadataFingerprint: null,
        membershipFingerprint: null,
        contentFingerprint: null
      });
    }

    async function withholdSource(record, sourceFileId, sourceWasStored, result) {
      if (!sourceWasStored || !result ||
          (result.decision !== 'pending' && result.decision !== 'inaccessible')) {
        return;
      }
      var next = hiddenSourceRecord(record, sourceFileId, result.decision);
      if (!next) {
        await closePartition(record, 'lost-access');
        return;
      }
      var claim = exactClaim(record);
      await closureAwait(function(operationGuard) {
        return store.transitionSource(claim, sourceFileId, next, operationGuard);
      });
      if (result.decision === 'inaccessible') {
        await closureAwait(function(operationGuard) {
          return store.purgeSource(claim, sourceFileId, 'access-revoked', operationGuard);
        });
      }
    }

    async function invalidateProcessedSource(record, sourceFileId, sourceWasStored) {
      if (!sourceWasStored) return false;
      var next = hiddenSourceRecord(record, sourceFileId, 'pending');
      if (!next) return false;
      var invalidated = await closureAwait(function(operationGuard) {
        return store.invalidateSource(
          exactClaim(record),
          sourceFileId,
          next,
          'lost-access',
          operationGuard
        );
      });
      if (!invalidated || invalidated.ok !== true) return false;
      try {
        return scheduleReconciliation(record.context, sourceFileId) === true;
      } catch (_error) {
        return false;
      }
    }

    async function visibleManifest(record) {
      var read = await guardedAwait(record, function(operationSignal) {
        return store.getVisibleManifest(exactClaim(record), operationSignal);
      });
      if (!read.ok) return { ok: false, result: decision('closed') };
      var manifest = read.value;
      if (manifest === null && record.kind === 'ingestion') {
        return { ok: true, manifest: null };
      }
      if (!isPlainRecord(manifest) ||
          manifest.accountPermissionId !== record.accountPermissionId ||
          manifest.corpusRootFileId !== record.corpusRootFileId ||
          !Number.isSafeInteger(manifest.authorityEpoch) || manifest.authorityEpoch < 0 ||
          !Array.isArray(manifest.sources)) {
        return { ok: false, result: decision('closed') };
      }
      return { ok: true, manifest: manifest };
    }

    function sourceStoreSnapshot(manifest, sourceFileId, allowAbsent) {
      if (manifest === null) {
        return allowAbsent ? { ok: true, source: null, canonical: null } : { ok: false };
      }
      var matches = manifest.sources.filter(function(source) {
        return isPlainRecord(source) && source.sourceFileId === sourceFileId;
      });
      if (matches.length === 0 && allowAbsent) return { ok: true, source: null, canonical: null };
      if (matches.length !== 1) return { ok: false };
      var canonical = schema.canonicalize(matches[0]);
      return canonical === null
        ? { ok: false }
        : { ok: true, source: matches[0], canonical: canonical };
    }

    async function freshRootProof(record) {
      if (!await currentBaseContext(record)) return { ok: false, result: decision('closed') };
      var aboutRead = await guardedAwait(record, function(operationSignal) {
        return transport.about(operationSignal);
      });
      if (!aboutRead.ok) {
        await closeUnproven(record);
        return { ok: false, result: decision(signal.aborted ? 'closed' : 'pending') };
      }
      var about = aboutRead.value;
      if (!about || about.kind !== 'ok' || !about.value || !validId(about.value.permissionId)) {
        await closeUnproven(record);
        return { ok: false, result: decision('pending') };
      }
      if (about.value.permissionId !== record.accountPermissionId) {
        await closeForAccount(record, about.value.permissionId);
        return { ok: false, result: decision('closed') };
      }
      var rootRead = await guardedAwait(record, function(operationSignal) {
        var input = { fileId: record.corpusRootFileId };
        var resourceKey = record.resourceKeys.get(record.corpusRootFileId);
        if (resourceKey) input.resourceKey = resourceKey;
        return transport.getFile(input, operationSignal);
      });
      if (!rootRead.ok) {
        await closeUnproven(record);
        return { ok: false, result: decision(signal.aborted ? 'closed' : 'pending') };
      }
      var rootResult = rootRead.value;
      if (!rootResult || rootResult.kind !== 'ok') {
        var rootFailure = mapTransportFailure(rootResult, false);
        if (rootFailure.decision === 'inaccessible') {
          await closePartition(record, 'lost-access');
        } else {
          await closeUnproven(record);
        }
        return { ok: false, result: rootFailure };
      }
      var root = fileShape(rootResult.value);
      if (!root || root.id !== record.corpusRootFileId || root.mimeType !== FOLDER_MIME ||
          root.trashed || root.canListChildren !== true ||
          (root.value.shortcutDetails !== null && root.value.shortcutDetails !== undefined)) {
        await closePartition(record, 'lost-access');
        return { ok: false, result: decision('inaccessible') };
      }
      if (root.value.resourceKey) record.resourceKeys.set(root.id, root.value.resourceKey);
      else record.resourceKeys.delete(root.id);
      if (!await currentBaseContext(record)) return { ok: false, result: decision('closed') };
      return { ok: true, root: root };
    }

    async function provePhysicalAncestry(record, sourceFileId, rootProof) {
      var requestCount = 0;
      var fileCache = new Map();
      var edgeCache = new Map();
      fileCache.set(rootProof.id, Promise.resolve({ ok: true, shape: rootProof }));

      async function readFile(fileId, parentEvidence) {
        if (fileCache.has(fileId)) return fileCache.get(fileId);
        var promise = (async function() {
          requestCount += 1;
          if (requestCount > limits.maxAncestryRequests) {
            return { ok: false, result: decision('pending') };
          }
          var read = await guardedAwait(record, function(operationSignal) {
            var input = { fileId: fileId };
            var resourceKey = record.resourceKeys.get(fileId);
            if (resourceKey) input.resourceKey = resourceKey;
            return transport.getFile(input, operationSignal);
          });
          if (!read.ok) return { ok: false, result: decision(signal.aborted ? 'closed' : 'pending') };
          if (!read.value || read.value.kind !== 'ok') {
            return { ok: false, result: mapTransportFailure(read.value, parentEvidence) };
          }
          var shape = fileShape(read.value.value);
          if (!shape || shape.id !== fileId) return { ok: false, result: decision('pending') };
          if (shape.value.resourceKey) record.resourceKeys.set(shape.id, shape.value.resourceKey);
          else record.resourceKeys.delete(shape.id);
          return { ok: true, shape: shape };
        })();
        fileCache.set(fileId, promise);
        return promise;
      }

      async function verifyPhysicalEdge(parentShape, childId) {
        var key = parentShape.id + '\u0000' + childId;
        if (edgeCache.has(key)) return edgeCache.get(key);
        var promise = (async function() {
          var pageToken = null;
          var matched = false;
          for (var page = 0; page < limits.maxParentPages; page += 1) {
            requestCount += 1;
            if (requestCount > limits.maxAncestryRequests) {
              return { ok: false, result: decision('pending') };
            }
            var input = { parentFileId: parentShape.id };
            if (pageToken !== null) input.pageToken = pageToken;
            if (parentShape.driveId !== null) input.driveId = parentShape.driveId;
            if (parentShape.value.resourceKey) input.resourceKey = parentShape.value.resourceKey;
            var read = await guardedAwait(record, function(operationSignal) {
              return transport.listChildren(input, operationSignal);
            });
            if (!read.ok) return { ok: false, result: decision(signal.aborted ? 'closed' : 'pending') };
            var result = read.value;
            if (!result || result.kind !== 'ok' || !result.value ||
                !Array.isArray(result.value.files) || result.value.incompleteSearch !== false) {
              return { ok: false, result: decision('pending') };
            }
            for (var index = 0; index < result.value.files.length; index += 1) {
              var listed = fileShape(result.value.files[index]);
              if (!listed) return { ok: false, result: decision('pending') };
              if (listed.value.resourceKey) record.resourceKeys.set(listed.id, listed.value.resourceKey);
              else record.resourceKeys.delete(listed.id);
              if (listed.id === childId && listed.parents.indexOf(parentShape.id) !== -1) {
                if (matched) return { ok: false, result: decision('pending') };
                matched = true;
              }
            }
            pageToken = result.value.nextPageToken;
            if (pageToken === null) return matched
              ? { ok: true }
              : { ok: false, result: decision('inaccessible') };
          }
          return { ok: false, result: decision('pending') };
        })();
        edgeCache.set(key, promise);
        return promise;
      }

      var sourceRead = await readFile(sourceFileId, false);
      if (!sourceRead.ok) return sourceRead;
      var source = sourceRead.shape;
      if (source.id === record.corpusRootFileId || source.trashed || source.parents.length === 0) {
        return { ok: false, result: decision('inaccessible') };
      }

      var queue = source.parents.slice().sort().map(function(parentId) {
        return {
          parentId: parentId,
          childId: source.id,
          upwardPath: [parentId],
          visited: new Set([source.id, parentId])
        };
      });
      var paths = [];
      var uncertain = false;
      while (queue.length > 0) {
        var state = queue.shift();
        if (state.upwardPath.length > limits.maxAncestryDepth) {
          uncertain = true;
          continue;
        }
        var parentRead = await readFile(state.parentId, true);
        if (!parentRead.ok) {
          if (parentRead.result.decision === 'closed') return parentRead;
          uncertain = true;
          continue;
        }
        var parent = parentRead.shape;
        if (parent.trashed || parent.mimeType !== FOLDER_MIME || parent.canListChildren !== true) {
          uncertain = true;
          continue;
        }
        var edge = await verifyPhysicalEdge(parent, state.childId);
        if (!edge.ok) {
          if (edge.result.decision === 'closed') return edge;
          if (edge.result.decision === 'pending') uncertain = true;
          continue;
        }
        if (parent.id === record.corpusRootFileId) {
          paths.push(state.upwardPath.slice().reverse());
          continue;
        }
        if (parent.parents.length === 0) continue;
        for (var parentIndex = 0; parentIndex < parent.parents.length; parentIndex += 1) {
          var nextParentId = parent.parents[parentIndex];
          if (state.visited.has(nextParentId)) {
            uncertain = true;
            continue;
          }
          var visited = new Set(state.visited);
          visited.add(nextParentId);
          queue.push({
            parentId: nextParentId,
            childId: parent.id,
            upwardPath: state.upwardPath.concat([nextParentId]),
            visited: visited
          });
        }
      }

      if (paths.length === 0) {
        return { ok: false, result: decision(uncertain ? 'pending' : 'inaccessible') };
      }
      var vendorValues = paths.map(function(path) { return path.length > 1 ? path[1] : null; });
      var vendorKeys = new Set(vendorValues.map(function(value) { return value === null ? '' : value; }));
      if (vendorKeys.size !== 1) return { ok: false, result: decision('pending') };
      paths.sort(function(left, right) {
        if (left.length !== right.length) return left.length - right.length;
        var leftKey = left.join('\u0000');
        var rightKey = right.join('\u0000');
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
      var chain = Object.freeze(paths[0].slice());
      var vendorScopeFileId = vendorValues[0];
      var signature = sourceSignature(schema, source, chain, vendorScopeFileId);
      if (signature === null) return { ok: false, result: decision('pending') };
      return {
        ok: true,
        source: source,
        physicalParentChain: chain,
        vendorScopeFileId: vendorScopeFileId,
        signature: signature
      };
    }

    function liveMetadataFingerprint(source) {
      if (!source || !source.modifiedTime) return null;
      return schema.parseMetadataFingerprint({
        version: schema.VERSION,
        kind: 'metadata',
        name: source.name,
        mimeType: source.mimeType,
        modifiedTime: source.modifiedTime,
        driveVersion: source.version,
        size: source.size,
        trashed: source.trashed,
        canDownload: source.canDownload
      });
    }

    function liveMembershipFingerprint(record, ancestry) {
      if (!ancestry || !ancestry.source || !Array.isArray(ancestry.physicalParentChain)) return null;
      return schema.parseMembershipFingerprint({
        version: schema.VERSION,
        kind: 'membership',
        corpusRootFileId: record.corpusRootFileId,
        physicalParentChain: Array.from(ancestry.physicalParentChain),
        vendorScopeFileId: ancestry.vendorScopeFileId,
        driveId: ancestry.source.driveId
      });
    }

    async function liveContentFingerprint(record, source, storedFingerprint) {
      var stored = schema.parseContentFingerprint(storedFingerprint);
      if (!stored) return null;
      if (stored.evidenceKind === 'drive-sha256') {
        var checksum = source.value.sha256Checksum;
        if (typeof checksum !== 'string' || !/^[0-9a-fA-F]{64}$/.test(checksum)) return null;
        return schema.parseContentFingerprint({
          version: schema.VERSION,
          kind: 'content',
          evidenceKind: 'drive-sha256',
          value: 'sha256:' + checksum.toLowerCase()
        });
      }
      if (stored.evidenceKind === 'drive-revision') {
        var revision = source.value.headRevisionId;
        if (!validId(revision)) return null;
        return schema.parseContentFingerprint({
          version: schema.VERSION,
          kind: 'content',
          evidenceKind: 'drive-revision',
          value: revision
        });
      }
      var byteHash = null;
      var sinkUsed = false;
      var input = { fileId: source.id, mimeType: source.mimeType };
      var resourceKey = record.resourceKeys.get(source.id);
      if (resourceKey) input.resourceKey = resourceKey;
      var read = await guardedAwait(record, function(operationSignal) {
        return transport.readContent(input, async function(payload) {
          sinkUsed = true;
          if (payload && typeof payload.byteHash === 'string' &&
              /^sha256:[0-9a-f]{64}$/.test(payload.byteHash)) byteHash = payload.byteHash;
          await Promise.resolve();
        }, operationSignal);
      });
      if (!read.ok || !read.value || read.value.kind !== 'ok' || !sinkUsed ||
          !read.value.value || read.value.value.byteHash !== byteHash) return null;
      return schema.parseContentFingerprint({
        version: schema.VERSION,
        kind: 'content',
        evidenceKind: stored.evidenceKind,
        value: byteHash
      });
    }

    async function processedFingerprintProof(record, ancestry, storedSource) {
      var metadata = liveMetadataFingerprint(ancestry.source);
      var membership = liveMembershipFingerprint(record, ancestry);
      if (!metadata || !membership) return { ok: false };
      if (record.kind === 'ingestion') {
        return {
          ok: true,
          metadataFingerprint: metadata,
          membershipFingerprint: membership,
          contentFingerprint: null
        };
      }
      if (!storedSource || !schema.parseMetadataFingerprint(storedSource.metadataFingerprint) ||
          !schema.parseMembershipFingerprint(storedSource.membershipFingerprint) ||
          schema.canonicalize(metadata) !== schema.canonicalize(storedSource.metadataFingerprint) ||
          schema.canonicalize(membership) !== schema.canonicalize(storedSource.membershipFingerprint)) {
        return { ok: false };
      }
      var content = null;
      if (storedSource.state === 'ready') {
        content = await liveContentFingerprint(record, ancestry.source, storedSource.contentFingerprint);
        if (!content || schema.canonicalize(content) !==
            schema.canonicalize(storedSource.contentFingerprint)) return { ok: false };
      } else if (storedSource.contentFingerprint !== null) {
        return { ok: false };
      }
      return {
        ok: true,
        metadataFingerprint: metadata,
        membershipFingerprint: membership,
        contentFingerprint: content
      };
    }

    async function certifySourceDetailed(record, sourceFileId, bypassCache) {
      if (!guardOpen(record) || !validId(sourceFileId)) {
        return { ok: false, result: decision('closed') };
      }
      if (!bypassCache && record.proofCache.has(sourceFileId)) {
        return record.proofCache.get(sourceFileId);
      }
      var proofPromise = (async function() {
        if (!await currentBaseContext(record)) return { ok: false, result: decision('closed') };
        var beforeManifest = await visibleManifest(record);
        if (!beforeManifest.ok) return beforeManifest;
        if (record.authorityEpoch !== null && beforeManifest.manifest &&
            beforeManifest.manifest.authorityEpoch !== record.authorityEpoch) {
          return { ok: false, result: decision('closed') };
        }
        var beforeSource = sourceStoreSnapshot(
          beforeManifest.manifest,
          sourceFileId,
          record.kind === 'ingestion'
        );
        if (!beforeSource.ok) return { ok: false, result: decision('inaccessible') };
        var sourceState = beforeSource.source ? beforeSource.source.state : 'missing';
        if (['ready', 'pending', 'unreadable', 'download-blocked', 'inaccessible', 'missing']
          .indexOf(sourceState) === -1) {
          return { ok: false, result: decision('closed') };
        }
        if (record.kind !== 'ingestion' &&
            (sourceState === 'pending' || sourceState === 'inaccessible' ||
              sourceState === 'missing')) {
          return {
            ok: false,
            result: decision(sourceState === 'pending' ? 'pending' : 'inaccessible')
          };
        }
        var rootProof = bypassCache ? await freshRootProof(record) : record.rootProof;
        if (!rootProof || !rootProof.ok) return rootProof || { ok: false, result: decision('pending') };
        var ancestry = await provePhysicalAncestry(record, sourceFileId, rootProof.root);
        if (!ancestry.ok) {
          await withholdSource(record, sourceFileId, beforeSource.source, ancestry.result);
          return ancestry;
        }
        var fingerprints = await processedFingerprintProof(record, ancestry, beforeSource.source);
        if (!fingerprints.ok) {
          if (record.kind !== 'ingestion') {
            await invalidateProcessedSource(record, sourceFileId, beforeSource.source);
          }
          return { ok: false, result: decision('pending') };
        }
        if (!await currentBaseContext(record)) return { ok: false, result: decision('closed') };
        var afterManifest = await visibleManifest(record);
        if (!afterManifest.ok) return afterManifest;
        if ((beforeManifest.manifest === null) !== (afterManifest.manifest === null) ||
            (beforeManifest.manifest && afterManifest.manifest.authorityEpoch !==
              beforeManifest.manifest.authorityEpoch)) {
          return { ok: false, result: decision('closed') };
        }
        var afterSource = sourceStoreSnapshot(
          afterManifest.manifest,
          sourceFileId,
          record.kind === 'ingestion'
        );
        if (!afterSource.ok || beforeSource.canonical !== afterSource.canonical) {
          return { ok: false, result: decision('closed') };
        }
        return {
          ok: true,
          ancestry: ancestry,
          fingerprints: fingerprints,
          fingerprintsCanonical: schema.canonicalize(fingerprints),
          storeCanonical: beforeSource.canonical,
          sourceState: sourceState,
          authorityEpoch: beforeManifest.manifest ? beforeManifest.manifest.authorityEpoch : 0
        };
      })();
      if (!bypassCache) record.proofCache.set(sourceFileId, proofPromise);
      return proofPromise;
    }

    function mintCertificate(record, sourceFileId, proof) {
      proofSequence += 1;
      var certificate = nonserializableCapability([
        ['decision', 'certified'],
        ['operationId', record.id],
        ['kind', record.kind],
        ['tabId', record.context.tabId],
        ['origin', record.context.origin],
        ['generation', record.context.generation],
        ['contextEpoch', record.context.contextEpoch],
        ['authorityEpoch', proof.authorityEpoch],
        ['accountPermissionId', record.accountPermissionId],
        ['corpusRootFileId', record.corpusRootFileId],
        ['sourceFileId', sourceFileId],
        ['sourceState', proof.sourceState],
        ['partitionEpoch', proof.authorityEpoch],
        ['sourceEpoch', proofSequence],
        ['provedAt', now()],
        ['vendorScopeFileId', proof.ancestry.vendorScopeFileId],
        ['physicalParentChain', proof.ancestry.physicalParentChain],
        ['metadataFingerprint', proof.fingerprints.metadataFingerprint],
        ['membershipFingerprint', proof.fingerprints.membershipFingerprint],
        ['contentFingerprint', proof.fingerprints.contentFingerprint]
      ], 'certificate');
      var privateRecord = {
        operation: record,
        sourceFileId: sourceFileId,
        signature: proof.ancestry.signature,
        storeCanonical: proof.storeCanonical,
        sourceState: proof.sourceState,
        vendorScopeFileId: proof.ancestry.vendorScopeFileId,
        physicalParentChain: proof.ancestry.physicalParentChain,
        fingerprintsCanonical: proof.fingerprintsCanonical,
        active: true
      };
      certificateRegistry.set(certificate, privateRecord);
      certificateIdentities.add(certificate);
      record.certificates.add(certificate);
      return certificate;
    }

    async function certifyOne(record, sourceFileId) {
      if (!guardOpen(record) || !validId(sourceFileId)) return decision('closed');
      if (record.certificateCache.has(sourceFileId)) return record.certificateCache.get(sourceFileId);
      var promise = (async function() {
        var proof = await certifySourceDetailed(record, sourceFileId, false);
        return proof.ok ? mintCertificate(record, sourceFileId, proof) : proof.result;
      })();
      record.certificateCache.set(sourceFileId, promise);
      return promise;
    }

    function operationRecord(operation) {
      if (!operation || typeof operation !== 'object' || !operationIdentities.has(operation)) return null;
      var record = operationRegistry.get(operation);
      return record && record.active ? record : null;
    }

    function releaseOperationRecord(record) {
      if (!record) return;
      record.active = false;
      abortRecord(record, record.abortReason || ABORTED);
      if (record.parentAbortListener && signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', record.parentAbortListener);
      }
      record.parentAbortListener = null;
      record.proofCache.clear();
      record.certificateCache.clear();
      record.resourceKeys.clear();
      record.certificates.forEach(function(certificate) {
        var privateRecord = certificateRegistry.get(certificate);
        if (privateRecord) privateRecord.active = false;
        certificateRegistry.delete(certificate);
        certificateIdentities.delete(certificate);
      });
      record.certificates.clear();
      record.effectTokens.forEach(function(token) { effectTokenRegistry.delete(token); });
      record.effectTokens.clear();
      record.effectAcks.forEach(function(ack) { effectAckRegistry.delete(ack); });
      record.effectAcks.clear();
      record.rootProof = null;
    }

    async function beginOperation(kind, liveContext) {
      var context = normalizeOperationContext(liveContext);
      if (!OPERATION_KIND_SET[kind] || !context || signal.aborted ||
          typeof global.AbortController !== 'function') return decision('closed');
      var startedAt;
      try {
        startedAt = now();
      } catch (_error) {
        return decision('closed');
      }
      if (!Number.isFinite(startedAt)) return decision('closed');
      var controller = new global.AbortController();
      var record = {
        id: operationSequence + 1,
        kind: kind,
        context: context,
        accountPermissionId: context.accountPermissionId,
        corpusRootFileId: context.corpusRootFileId,
        startedAt: startedAt,
        deadline: startedAt + limits.maxOperationMs,
        authorityEpoch: null,
        rootProof: null,
        proofCache: new Map(),
        certificateCache: new Map(),
        resourceKeys: new Map(),
        certificates: new Set(),
        effectTokens: new Set(),
        effectAcks: new Set(),
        controller: controller,
        signal: controller.signal,
        abortReason: null,
        parentAbortListener: null,
        active: true
      };
      operationSequence += 1;
      if (signal && typeof signal.addEventListener === 'function') {
        record.parentAbortListener = function() { abortRecord(record, ABORTED); };
        signal.addEventListener('abort', record.parentAbortListener, { once: true });
      }
      if (signal.aborted) abortRecord(record, ABORTED);
      var operation = null;
      try {
        if (!await currentBaseContext(record)) return decision('closed');
        var beforeManifest = await visibleManifest(record);
        if (!beforeManifest.ok) return beforeManifest.result;
        record.authorityEpoch = beforeManifest.manifest ? beforeManifest.manifest.authorityEpoch : 0;
        var rootProof = await freshRootProof(record);
        if (!rootProof.ok) return rootProof.result;
        record.rootProof = rootProof;
        var afterManifest = await visibleManifest(record);
        if (!afterManifest.ok || (beforeManifest.manifest === null) !== (afterManifest.manifest === null) ||
            (beforeManifest.manifest && afterManifest.manifest.authorityEpoch !== record.authorityEpoch)) {
          return decision('closed');
        }
        if (!await currentBaseContext(record)) return decision('closed');
        operation = nonserializableCapability([
          ['kind', kind],
          ['operationId', record.id]
        ], 'operation');
        operationRegistry.set(operation, record);
        operationIdentities.add(operation);
        record.handle = operation;
        return operation;
      } finally {
        if (!operation) releaseOperationRecord(record);
      }
    }

    async function certifySource(operation, sourceFileId) {
      var record = operationRecord(operation);
      return record ? certifyOne(record, sourceFileId) : decision('closed');
    }

    async function certifySetDetailed(record, exactSourceFileIds) {
      var sourceIds = normalizeExactSourceIds(exactSourceFileIds, limits.maxSourcesPerOperation);
      if (!record || !sourceIds) {
        return { publicResult: decision('closed'), certificates: [], failures: [decision('closed')], sourceIds: [] };
      }
      var results = await Promise.all(sourceIds.map(function(sourceFileId) {
        return certifyOne(record, sourceFileId);
      }));
      var certificates = [];
      var failures = [];
      for (var index = 0; index < results.length; index += 1) {
        if (results[index] && results[index].decision === 'certified' &&
            certificateIdentities.has(results[index])) {
          certificates.push(results[index]);
        } else {
          failures.push(results[index] || decision('pending'));
        }
      }
      var kind;
      if (certificates.length === sourceIds.length) kind = 'certified';
      else if (certificates.length > 0) kind = 'partial';
      else if (failures.some(function(value) { return value.decision === 'closed'; })) kind = 'closed';
      else if (failures.some(function(value) { return value.decision === 'pending'; })) kind = 'pending';
      else kind = 'inaccessible';
      var publicResult = frozenRecord([
        ['decision', kind],
        ['certificates', Object.freeze(certificates.slice())],
        ['complete', certificates.length === sourceIds.length]
      ]);
      return {
        publicResult: publicResult,
        certificates: certificates,
        failures: failures,
        sourceIds: sourceIds
      };
    }

    async function certifySources(operation, exactSourceFileIds) {
      var record = operationRecord(operation);
      if (!record) return decision('closed');
      var detailed = await certifySetDetailed(record, exactSourceFileIds);
      return detailed.publicResult;
    }

    async function readHiddenSourceState(operation, sourceFileId) {
      var record = operationRecord(operation);
      if (!record || record.kind !== 'display' || !validId(sourceFileId)) {
        return decision('closed');
      }
      try {
        if (!guardOpen(record) || !await currentBaseContext(record)) return decision('closed');
        var beforeManifest = await visibleManifest(record);
        if (!beforeManifest.ok || !beforeManifest.manifest ||
            beforeManifest.manifest.authorityEpoch !== record.authorityEpoch) {
          return decision('closed');
        }
        var stateRead = await guardedAwait(record, function(operationSignal) {
          return store.getHiddenSourceState(exactClaim(record), sourceFileId, operationSignal);
        });
        if (!stateRead.ok || (stateRead.value !== null &&
            stateRead.value !== 'pending' && stateRead.value !== 'inaccessible' &&
            stateRead.value !== 'missing')) return decision('closed');
        var afterManifest = await visibleManifest(record);
        if (!afterManifest.ok || !afterManifest.manifest ||
            afterManifest.manifest.authorityEpoch !== record.authorityEpoch ||
            !await currentBaseContext(record)) return decision('closed');
        return stateRead.value === null
          ? decision('closed')
          : frozenRecord([
              ['decision', 'admitted'],
              ['state', stateRead.value]
            ]);
      } finally {
        finishOperation(operation);
      }
    }

    function sameProofSnapshot(left, right) {
      return !!left && !!right && left.signature === right.signature &&
        left.storeCanonical === right.storeCanonical &&
        left.sourceState === right.sourceState &&
        left.fingerprintsCanonical === right.fingerprintsCanonical &&
        left.vendorScopeFileId === right.vendorScopeFileId &&
        left.physicalParentChain.length === right.physicalParentChain.length &&
        left.physicalParentChain.every(function(value, index) {
          return value === right.physicalParentChain[index];
        });
    }

    async function finalCurrentness(record, certificate) {
      if (!record || !certificateIdentities.has(certificate)) return decision('closed');
      var privateRecord = certificateRegistry.get(certificate);
      if (!privateRecord || !privateRecord.active || privateRecord.operation !== record ||
          !guardOpen(record) || !await currentBaseContext(record)) {
        return decision('closed');
      }
      var proof = await certifySourceDetailed(record, privateRecord.sourceFileId, true);
      if (!proof.ok) return proof.result;
      var current = {
        signature: proof.ancestry.signature,
        storeCanonical: proof.storeCanonical,
        sourceState: proof.sourceState,
        fingerprintsCanonical: proof.fingerprintsCanonical,
        vendorScopeFileId: proof.ancestry.vendorScopeFileId,
        physicalParentChain: proof.ancestry.physicalParentChain
      };
      return sameProofSnapshot(privateRecord, current) ? decision('certified') : decision('closed');
    }

    function finishOperation(operation) {
      var record = operationRecord(operation);
      if (!record) return false;
      releaseOperationRecord(record);
      operationRegistry.delete(operation);
      operationIdentities.delete(operation);
      return true;
    }

    function effectFailureDecision(record) {
      if (record && record.effectFailure && record.effectFailure.decision) {
        return record.effectFailure;
      }
      return decision(signal.aborted || (record && record.abortReason === ABORTED)
        ? 'closed'
        : 'pending');
    }

    function normalizeEffectBindings(record, certificates, value) {
      if (value === undefined) return null;
      var bindings = dataArrayValues(value, limits.maxSourcesPerOperation);
      if (!bindings || bindings.length !== certificates.length) return false;
      var certificateIds = new Set(certificates.map(function(certificate) {
        return certificate.sourceFileId;
      }));
      var bySourceId = new Map();
      for (var index = 0; index < bindings.length; index += 1) {
        var source = schema.parseSourceRecord(bindings[index]);
        if (!source || source.visibility !== 'active' || !certificateIds.has(source.sourceFileId) ||
            bySourceId.has(source.sourceFileId) ||
            source.accountPermissionId !== record.accountPermissionId ||
            source.corpusRootFileId !== record.corpusRootFileId ||
            !schema.parseMetadataFingerprint(source.metadataFingerprint) ||
            !schema.parseMembershipFingerprint(source.membershipFingerprint) ||
            (source.state === 'ready'
              ? !schema.parseContentFingerprint(source.contentFingerprint)
              : source.contentFingerprint !== null)) {
          return false;
        }
        bySourceId.set(source.sourceFileId, source);
      }
      return bySourceId.size === certificateIds.size ? bySourceId : false;
    }

    function mintEffectPublisher(record, certificates) {
      var token = nonserializableCapability([
        ['operationId', record.id],
        ['authorityEpoch', record.authorityEpoch]
      ], 'effect token');
      var tokenRecord = {
        operation: record,
        certificates: certificates.slice(),
        bindings: null,
        active: true,
        published: false
      };
      effectTokenRegistry.set(token, tokenRecord);
      record.effectTokens.add(token);

      async function validate() {
        var current = effectTokenRegistry.get(token);
        if (!current || current !== tokenRecord || !current.active || !current.published ||
            current.operation !== record || !guardOpen(record)) return false;
        if (current.certificates.length === 0) {
          var rootProof = record.kind === 'ingestion' ? await freshRootProof(record) : null;
          var manifest = rootProof && rootProof.ok ? await visibleManifest(record) : null;
          if (!rootProof || !rootProof.ok || !manifest || !manifest.ok ||
              (manifest.manifest && manifest.manifest.authorityEpoch !== record.authorityEpoch)) {
            record.effectFailure = decision('closed');
            return false;
          }
        }
        for (var index = 0; index < current.certificates.length; index += 1) {
          var certificate = current.certificates[index];
          var proof = await finalCurrentness(record, certificate);
          if (proof.decision !== 'certified') {
            record.effectFailure = proof;
            return false;
          }
          if (!current.bindings) continue;
          var expected = current.bindings.get(certificate.sourceFileId);
          var detailed = expected
            ? await certifySourceDetailed(record, certificate.sourceFileId, true)
            : null;
          var metadata = detailed && detailed.ok
            ? liveMetadataFingerprint(detailed.ancestry.source)
            : null;
          var membership = detailed && detailed.ok
            ? liveMembershipFingerprint(record, detailed.ancestry)
            : null;
          if (!expected || !detailed || !detailed.ok || !metadata || !membership ||
              schema.canonicalize(metadata) !== schema.canonicalize(expected.metadataFingerprint) ||
              schema.canonicalize(membership) !==
                schema.canonicalize(expected.membershipFingerprint)) {
            record.effectFailure = decision('closed');
            return false;
          }
          if (expected.state === 'ready') {
            var content = await liveContentFingerprint(
              record,
              detailed.ancestry.source,
              expected.contentFingerprint
            );
            if (!content || schema.canonicalize(content) !==
                schema.canonicalize(expected.contentFingerprint)) {
              record.effectFailure = decision('closed');
              return false;
            }
          }
        }
        if (!await currentBaseContext(record) || !guardOpen(record)) {
          record.effectFailure = decision('closed');
          return false;
        }
        return true;
      }

      var guard = nonserializableCapability([
        ['signal', record.signal],
        ['operationToken', token],
        ['operationEpoch', record.authorityEpoch],
        ['validate', validate]
      ], 'effect guard');
      var publisher = null;

      async function publish(effect, bindingValues) {
        var current = effectTokenRegistry.get(token);
        if (!current || current !== tokenRecord || !current.active || current.published ||
            current.operation !== record || !guardOpen(record) || typeof effect !== 'function') {
          record.effectFailure = decision('closed');
          return null;
        }
        var bindings = normalizeEffectBindings(record, current.certificates, bindingValues);
        if (bindings === false) {
          record.effectFailure = decision('closed');
          return null;
        }
        current.bindings = bindings;
        current.published = true;
        if (!await validate()) {
          current.active = false;
          return null;
        }
        var effectRead = await guardedAwait(record, function() { return effect(guard); });
        current.active = false;
        if (!effectRead.ok) {
          record.effectFailure = effectFailureDecision(record);
          return null;
        }
        var acknowledgement = nonserializableCapability([
          ['operationId', record.id]
        ], 'effect acknowledgement');
        effectAckRegistry.set(acknowledgement, {
          operation: record,
          token: token,
          value: effectRead.value
        });
        record.effectAcks.add(acknowledgement);
        return acknowledgement;
      }

      publisher = nonserializableCapability([
        ['signal', record.signal],
        ['operationToken', token],
        ['operationEpoch', record.authorityEpoch],
        ['publish', publish]
      ], 'effect publisher');
      return publisher;
    }

    async function commitPreparedEffect(record, certificates, preparedValue, commitCallback) {
      var publisher = mintEffectPublisher(record, certificates);
      var commitRead = await guardedAwait(record, function(operationSignal) {
        return commitCallback(preparedValue, publisher, operationSignal);
      });
      if (!commitRead.ok) return { ok: false, result: effectFailureDecision(record) };
      var acknowledgement = effectAckRegistry.get(commitRead.value);
      if (!acknowledgement || acknowledgement.operation !== record ||
          !record.effectAcks.has(commitRead.value)) {
        return { ok: false, result: effectFailureDecision(record) };
      }
      return { ok: true, value: acknowledgement.value };
    }

    async function runWithCertifiedSource(operation, sourceFileId, callback, commitCallback) {
      var record = operationRecord(operation);
      var effectful = !!(record && EFFECT_OPERATION_KIND_SET[record.kind]);
      if (!record || typeof callback !== 'function' || !validId(sourceFileId) ||
          (effectful ? typeof commitCallback !== 'function' : commitCallback !== undefined)) {
        return decision('closed');
      }
      try {
        var certificate = await certifyOne(record, sourceFileId);
        if (!certificate || certificate.decision !== 'certified' ||
            !certificateIdentities.has(certificate)) {
          return certificate || decision('pending');
        }
        var before = await finalCurrentness(record, certificate);
        if (before.decision !== 'certified') return before;
        var callbackRead = await guardedAwait(record, function(operationSignal) {
          return callback(certificate, operationSignal);
        });
        if (!callbackRead.ok) return effectFailureDecision(record);
        var after = await finalCurrentness(record, certificate);
        if (after.decision !== 'certified') return after;
        if (!await currentBaseContext(record)) return decision('closed');
        if (effectful) {
          var committed = await commitPreparedEffect(
            record,
            [certificate],
            callbackRead.value,
            commitCallback
          );
          if (!committed.ok) return committed.result;
          return frozenRecord([
            ['decision', 'admitted'],
            ['value', committed.value]
          ]);
        }
        return frozenRecord([
          ['decision', 'admitted'],
          ['value', callbackRead.value]
        ]);
      } finally {
        finishOperation(operation);
      }
    }

    function normalizeDisplayProjection(value, certifiedIds, maximum) {
      var fields = exactDataValues(value, ['rows', 'aggregate']);
      var rows = fields ? dataArrayValues(fields.rows, maximum) : null;
      if (!fields || !rows) return null;
      var seen = new Set();
      var normalizedRows = [];
      for (var index = 0; index < rows.length; index += 1) {
        var row = exactDataValues(rows[index], ['sourceFileId', 'value']);
        if (!row || !validId(row.sourceFileId) || !certifiedIds.has(row.sourceFileId) ||
            seen.has(row.sourceFileId)) {
          return null;
        }
        seen.add(row.sourceFileId);
        normalizedRows.push({ sourceFileId: row.sourceFileId, value: row.value });
      }
      return {
        rows: normalizedRows,
        aggregate: fields.aggregate
      };
    }

    function incompleteSetDecision(failures) {
      if (failures.some(function(value) { return value.decision === 'closed'; })) {
        return decision('closed');
      }
      if (failures.some(function(value) { return value.decision === 'pending'; })) {
        return decision('pending');
      }
      if (failures.some(function(value) { return value.decision === 'inaccessible'; })) {
        return decision('inaccessible');
      }
      return decision('closed');
    }

    async function runWithCertifiedSources(operation, exactSourceFileIds, callback, commitCallback) {
      var record = operationRecord(operation);
      var effectful = !!(record && EFFECT_OPERATION_KIND_SET[record.kind]);
      if (!record || typeof callback !== 'function' ||
          (effectful ? typeof commitCallback !== 'function' : commitCallback !== undefined)) {
        return decision('closed');
      }
      try {
        var emptyIngestionSet = record.kind === 'ingestion' &&
          dataArrayValues(exactSourceFileIds, 0) !== null;
        if (emptyIngestionSet) {
          var emptyRead = await guardedAwait(record, function(operationSignal) {
            return callback(
              Object.freeze([]),
              frozenRecord([['complete', true]]),
              operationSignal
            );
          });
          if (!emptyRead.ok || !await currentBaseContext(record)) {
            return effectFailureDecision(record);
          }
          var emptyCommit = await commitPreparedEffect(
            record,
            [],
            emptyRead.value,
            commitCallback
          );
          if (!emptyCommit.ok) return emptyCommit.result;
          return frozenRecord([
            ['decision', 'admitted'],
            ['value', emptyCommit.value]
          ]);
        }
        var detailed = await certifySetDetailed(record, exactSourceFileIds);
        if (detailed.certificates.length === 0) return detailed.publicResult;
        var admitted = [];
        var preFailures = detailed.failures.slice();
        for (var index = 0; index < detailed.certificates.length; index += 1) {
          var before = await finalCurrentness(record, detailed.certificates[index]);
          if (before.decision === 'certified') admitted.push(detailed.certificates[index]);
          else preFailures.push(before);
        }
        if (admitted.length === 0) {
          if (preFailures.some(function(value) { return value.decision === 'closed'; })) return decision('closed');
          if (preFailures.some(function(value) { return value.decision === 'pending'; })) return decision('pending');
          return decision('inaccessible');
        }
        var completeBeforeCallback = admitted.length === detailed.sourceIds.length;
        if (record.kind !== 'display' && !completeBeforeCallback) {
          return incompleteSetDecision(preFailures);
        }
        var callbackRead = await guardedAwait(record, function(operationSignal) {
          return callback(
            Object.freeze(admitted.slice()),
            frozenRecord([['complete', completeBeforeCallback]]),
            operationSignal
          );
        });
        if (!callbackRead.ok) return effectFailureDecision(record);

        var displayProjection = null;
        if (record.kind === 'display') {
          displayProjection = normalizeDisplayProjection(
            callbackRead.value,
            new Set(admitted.map(function(certificate) { return certificate.sourceFileId; })),
            limits.maxSourcesPerOperation
          );
          if (!displayProjection) return decision('closed');
        }

        var finalIds = new Set();
        var postFailures = preFailures.slice();
        for (var finalIndex = 0; finalIndex < admitted.length; finalIndex += 1) {
          var after = await finalCurrentness(record, admitted[finalIndex]);
          if (after.decision === 'certified') finalIds.add(admitted[finalIndex].sourceFileId);
          else postFailures.push(after);
        }
        if (!await currentBaseContext(record)) return decision('closed');

        if (record.kind !== 'display') {
          if (finalIds.size !== detailed.sourceIds.length) {
            return incompleteSetDecision(postFailures);
          }
          if (effectful) {
            var committed = await commitPreparedEffect(
              record,
              admitted,
              callbackRead.value,
              commitCallback
            );
            if (!committed.ok) return committed.result;
            return frozenRecord([
              ['decision', 'admitted'],
              ['value', committed.value]
            ]);
          }
          return frozenRecord([
            ['decision', 'admitted'],
            ['value', callbackRead.value]
          ]);
        }

        var rows = displayProjection.rows.filter(function(row) {
          return finalIds.has(row.sourceFileId);
        }).map(function(row) {
          return Object.freeze({ sourceFileId: row.sourceFileId, value: row.value });
        });
        var completeAfterCallback = finalIds.size === detailed.sourceIds.length;
        if (rows.length === 0 && !completeAfterCallback) {
          if (postFailures.some(function(value) { return value.decision === 'closed'; })) {
            return decision('closed');
          }
          if (postFailures.some(function(value) { return value.decision === 'pending'; })) {
            return decision('pending');
          }
          return decision('inaccessible');
        }
        return frozenRecord([
          ['decision', completeAfterCallback ? 'admitted' : 'partial'],
          ['rows', Object.freeze(rows)],
          ['aggregate', completeAfterCallback ? displayProjection.aggregate : null]
        ]);
      } finally {
        finishOperation(operation);
      }
    }

    return Object.freeze({
      beginOperation: beginOperation,
      certifySource: certifySource,
      certifySources: certifySources,
      readHiddenSourceState: readHiddenSourceState,
      runWithCertifiedSource: runWithCertifiedSource,
      runWithCertifiedSources: runWithCertifiedSources,
      finishOperation: finishOperation
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    OPERATION_KINDS: OPERATION_KINDS,
    LIMITS: LIMITS,
    create: create
  });

  global.FsbSkopeoDriveAuthority = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
