(function(global) {
  'use strict';

  var VERSION = 'skopeo-drive-reconciler/v1';
  var CHECKPOINT_VERSION = 'skopeo-corpus-checkpoint/v1';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var DOC_MIME = 'application/vnd.google-apps.document';
  var SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
  var TEXT_MIME = 'text/plain';

  var CONTEXT_KEYS = [
    'tabId',
    'origin',
    'generation',
    'profileId',
    'profileVersion',
    'contextEpoch',
    'contextKind',
    'entityKind',
    'entityId',
    'accountPermissionId',
    'corpusRootFileId'
  ];
  var OPTION_KEYS = ['schema', 'store', 'transport', 'authority', 'limits'];
  var LIMIT_KEYS = [
    'maxPagesPerScan',
    'maxItemsPerScan',
    'maxDepth',
    'maxRequestsPerRun',
    'maxChangesPerRun',
    'maxSources',
    'maxRescans',
    'maxOperationMs'
  ];
  var LIMITS = Object.freeze({
    MAX_PAGES_PER_SCAN: 512,
    MAX_ITEMS_PER_SCAN: 4096,
    MAX_DEPTH: 32,
    MAX_REQUESTS_PER_RUN: 8192,
    MAX_CHANGES_PER_RUN: 4096,
    MAX_SOURCES: 4096,
    MAX_RESCANS: 2,
    MAX_OPERATION_MS: 30000
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

  function exactDataValues(value, expectedKeys) {
    if (!isPlainRecord(value)) return null;
    try {
      var keys = Reflect.ownKeys(value);
      if (keys.length !== expectedKeys.length || keys.some(function(key) {
        return typeof key !== 'string';
      })) {
        return null;
      }
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

  function frozenRecord(entries) {
    var value = Object.create(null);
    for (var index = 0; index < entries.length; index += 1) {
      value[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(value);
  }

  function outputRecord(value) {
    var entries = [];
    Object.keys(value).forEach(function(key) { entries.push([key, value[key]]); });
    return frozenRecord(entries);
  }

  function failed(status, retryable) {
    return outputRecord({
      ok: false,
      status: status,
      retryable: retryable === true
    });
  }

  function validId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(value) && value !== '__proto__' &&
      value !== 'prototype' && value !== 'constructor';
  }

  function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function normalizeLimits(value) {
    var fields = exactDataValues(value, LIMIT_KEYS);
    if (!fields || !positiveInteger(fields.maxPagesPerScan) ||
        fields.maxPagesPerScan > LIMITS.MAX_PAGES_PER_SCAN ||
        !positiveInteger(fields.maxItemsPerScan) ||
        fields.maxItemsPerScan > LIMITS.MAX_ITEMS_PER_SCAN ||
        !positiveInteger(fields.maxDepth) || fields.maxDepth > LIMITS.MAX_DEPTH ||
        !positiveInteger(fields.maxRequestsPerRun) ||
        fields.maxRequestsPerRun > LIMITS.MAX_REQUESTS_PER_RUN ||
        !positiveInteger(fields.maxChangesPerRun) ||
        fields.maxChangesPerRun > LIMITS.MAX_CHANGES_PER_RUN ||
        !positiveInteger(fields.maxSources) || fields.maxSources > LIMITS.MAX_SOURCES ||
        !Number.isSafeInteger(fields.maxRescans) || fields.maxRescans < 0 ||
        fields.maxRescans > LIMITS.MAX_RESCANS ||
        !positiveInteger(fields.maxOperationMs) ||
        fields.maxOperationMs > LIMITS.MAX_OPERATION_MS) {
      return null;
    }
    return Object.freeze({
      maxPagesPerScan: fields.maxPagesPerScan,
      maxItemsPerScan: fields.maxItemsPerScan,
      maxDepth: fields.maxDepth,
      maxRequestsPerRun: fields.maxRequestsPerRun,
      maxChangesPerRun: fields.maxChangesPerRun,
      maxSources: fields.maxSources,
      maxRescans: fields.maxRescans,
      maxOperationMs: fields.maxOperationMs
    });
  }

  function normalizeContext(value) {
    var fields = exactDataValues(value, CONTEXT_KEYS);
    if (!fields || !Number.isSafeInteger(fields.tabId) || fields.tabId < 0 ||
        (fields.origin !== 'https://drive.google.com' && fields.origin !== 'https://docs.google.com') ||
        !positiveInteger(fields.generation) || !positiveInteger(fields.profileVersion) ||
        !positiveInteger(fields.contextEpoch) || !validId(fields.accountPermissionId) ||
        !validId(fields.corpusRootFileId)) {
      return null;
    }
    return outputRecord(CONTEXT_KEYS.reduce(function(record, key) {
      record[key] = fields[key];
      return record;
    }, {}));
  }

  function normalizeHint(value) {
    var fields = exactDataValues(value, ['removed']);
    return fields && typeof fields.removed === 'boolean'
      ? outputRecord({ removed: fields.removed })
      : null;
  }

  function claimFromContext(context) {
    return {
      accountPermissionId: context.accountPermissionId,
      corpusRootFileId: context.corpusRootFileId
    };
  }

  function sameCanonical(schema, left, right) {
    if (left === null || right === null || left === undefined || right === undefined) {
      return left === right;
    }
    var leftValue = schema.canonicalize(left);
    var rightValue = schema.canonicalize(right);
    return leftValue !== null && leftValue === rightValue;
  }

  function normalizedTime(value) {
    if (typeof value !== 'string') return null;
    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    return new Date(milliseconds).toISOString();
  }

  function fileShape(value) {
    if (!isPlainRecord(value) || !validId(value.id) || typeof value.name !== 'string' ||
        typeof value.mimeType !== 'string' || !Array.isArray(value.parents) ||
        typeof value.trashed !== 'boolean' || !isPlainRecord(value.capabilities) ||
        typeof value.capabilities.canDownload !== 'boolean' ||
        typeof value.capabilities.canListChildren !== 'boolean') {
      return null;
    }
    var parents = [];
    for (var index = 0; index < value.parents.length; index += 1) {
      if (!validId(value.parents[index]) || parents.indexOf(value.parents[index]) !== -1) return null;
      parents.push(value.parents[index]);
    }
    parents.sort();
    return {
      value: value,
      id: value.id,
      name: value.name,
      mimeType: value.mimeType,
      parents: parents,
      trashed: value.trashed,
      driveId: value.driveId === null || validId(value.driveId) ? value.driveId : null,
      canDownload: value.capabilities.canDownload,
      canListChildren: value.capabilities.canListChildren,
      version: typeof value.version === 'string' && /^\d{1,32}$/.test(value.version)
        ? value.version
        : '0',
      modifiedTime: normalizedTime(value.modifiedTime),
      size: Number.isSafeInteger(value.size) && value.size >= 0 ? value.size : 0,
      shortcut: value.mimeType === SHORTCUT_MIME || value.shortcutDetails !== null
    };
  }

  function metadataIdentity(schema, shape) {
    return schema.canonicalize({
      id: shape.id,
      name: shape.name,
      mimeType: shape.mimeType,
      parents: shape.parents,
      trashed: shape.trashed,
      driveId: shape.driveId,
      canDownload: shape.canDownload,
      canListChildren: shape.canListChildren,
      version: shape.version,
      headRevisionId: typeof shape.value.headRevisionId === 'string'
        ? shape.value.headRevisionId
        : null,
      sha256Checksum: typeof shape.value.sha256Checksum === 'string'
        ? shape.value.sha256Checksum.toLowerCase()
        : null,
      size: shape.size,
      modifiedTime: shape.modifiedTime,
      shortcutTarget: shape.shortcut && shape.value.shortcutDetails &&
        validId(shape.value.shortcutDetails.targetId)
        ? shape.value.shortcutDetails.targetId
        : null
    });
  }

  function exactContentIdentity(shape) {
    var checksum = shape.value.sha256Checksum;
    if (typeof checksum === 'string' && /^[0-9a-fA-F]{64}$/.test(checksum)) {
      return 'drive-sha256:' + checksum.toLowerCase();
    }
    var revision = shape.value.headRevisionId;
    if (validId(revision)) return 'drive-revision:' + revision;
    return null;
  }

  function create(options) {
    var fields = exactDataValues(options, OPTION_KEYS);
    if (!fields || !fields.schema || typeof fields.schema.makePartitionKey !== 'function' ||
        typeof fields.schema.makeSourceKey !== 'function' ||
        typeof fields.schema.parseSourceRecord !== 'function' ||
        typeof fields.schema.parseMetadataFingerprint !== 'function' ||
        typeof fields.schema.parseMembershipFingerprint !== 'function' ||
        typeof fields.schema.parseContentFingerprint !== 'function' ||
        typeof fields.schema.canonicalize !== 'function' ||
        !fields.store || typeof fields.store.issueMutation !== 'function' ||
        typeof fields.store.finishMutation !== 'function' ||
        typeof fields.store.recover !== 'function' ||
        typeof fields.store.beginReplacement !== 'function' ||
        typeof fields.store.stageSource !== 'function' ||
        typeof fields.store.purgeSource !== 'function' ||
        typeof fields.store.purgePartition !== 'function' ||
        typeof fields.store.withdrawPartition !== 'function' ||
        typeof fields.store.commitInventory !== 'function' ||
        typeof fields.store.inspectMetadata !== 'function' ||
        !fields.transport || typeof fields.transport.getFile !== 'function' ||
        typeof fields.transport.listChildren !== 'function' ||
        typeof fields.transport.getStartPageToken !== 'function' ||
        typeof fields.transport.listChanges !== 'function' ||
        typeof fields.transport.readContent !== 'function' ||
        !fields.authority || typeof fields.authority.beginOperation !== 'function' ||
        typeof fields.authority.certifySource !== 'function' ||
        typeof fields.authority.runWithCertifiedSource !== 'function' ||
        typeof fields.authority.runWithCertifiedSources !== 'function' ||
        typeof fields.authority.finishOperation !== 'function') {
      return null;
    }
    var limits = normalizeLimits(fields.limits);
    if (!limits) return null;

    var schema = fields.schema;
    var store = fields.store;
    var transport = fields.transport;
    var authority = fields.authority;
    var aborted = false;
    var abortReason = null;
    var activeOperations = new Set();
    var operationRuns = new WeakMap();
    var activeRuns = new Set();
    var runRegistry = new WeakMap();
    var runSequence = 0;
    var changeTokens = new Map();
    var contentIdentities = new Map();
    var checkpointSequence = 0;
    var lane = Promise.resolve();
    var activeLaneQueue = null;

    function withLane(work) {
      var resolvePublic;
      var rejectPublic;
      var publicResult = new Promise(function(resolve, reject) {
        resolvePublic = resolve;
        rejectPublic = reject;
      });
      async function execute() {
        var queue = { barriers: [] };
        activeLaneQueue = queue;
        try {
          resolvePublic(await work());
        } catch (error) {
          rejectPublic(error);
        } finally {
          while (queue.barriers.length > 0) {
            var barriers = queue.barriers.splice(0, queue.barriers.length);
            await Promise.allSettled(barriers);
          }
          if (activeLaneQueue === queue) activeLaneQueue = null;
        }
      }
      var run = lane.then(execute, execute);
      lane = run.then(function() {}, function() {});
      return publicResult;
    }

    function runFor(context) {
      return context && typeof context === 'object' ? runRegistry.get(context) || null : null;
    }

    function runOpen(context) {
      var run = runFor(context);
      return !!run && run.active === true && aborted !== true &&
        run.signal.aborted !== true && Date.now() <= run.deadline;
    }

    function runSignal(context) {
      var run = runFor(context);
      return run ? run.signal : null;
    }

    function runFailure(context) {
      var run = runFor(context);
      return aborted || (run && run.reason === 'aborted')
        ? failed('aborted', false)
        : failed('bounded-rescan-required', true);
    }

    function trackMutationBarrier(promise) {
      if (activeLaneQueue) {
        activeLaneQueue.barriers.push(promise.then(function() {}, function() {}));
      }
      return promise;
    }

    function runGuardedStoreMutation(operationSignal, work) {
      var promise = (async function() {
        var guard = store.issueMutation(operationSignal);
        if (!guard || typeof work !== 'function') return failed('recovery-pending', false);
        try {
          return await work(guard);
        } finally {
          var terminal = store.finishMutation(guard);
          if (!terminal || terminal.ok !== true) await new Promise(function() {});
        }
      })();
      return trackMutationBarrier(promise);
    }

    function runStoreMutation(context, work) {
      var run = runFor(context);
      return run && run.signal.aborted === false
        ? runGuardedStoreMutation(run.signal, work)
        : Promise.resolve(failed('bounded-rescan-required', true));
    }

    function runStandaloneStoreMutation(work) {
      if (typeof global.AbortController !== 'function') {
        return Promise.resolve(failed('recovery-pending', false));
      }
      var controller = new global.AbortController();
      return runGuardedStoreMutation(controller.signal, work);
    }

    function closeRun(run, reason) {
      if (!run || run.active !== true) return;
      run.active = false;
      run.reason = reason;
      activeRuns.delete(run);
      try { run.controller.abort(reason); } catch (_error) { run.controller.abort(); }
      activeOperations.forEach(function(operation) {
        if (operationRuns.get(operation) === run) stopOperation(operation);
      });
      if (typeof run.cancel === 'function') run.cancel(reason);
    }

    function runBounded(context, work) {
      if (typeof global.AbortController !== 'function') {
        return Promise.resolve(failed('recovery-pending', false));
      }
      var controller = new global.AbortController();
      var run = {
        token: Object.freeze({}),
        epoch: runSequence + 1,
        controller: controller,
        signal: controller.signal,
        deadline: Date.now() + limits.maxOperationMs,
        active: true,
        reason: null,
        cancel: null
      };
      runSequence += 1;
      runRegistry.set(context, run);
      activeRuns.add(run);
      var promise = Promise.resolve().then(function() { return work(context); });
      return new Promise(function(resolve) {
        var settled = false;
        var timer = null;
        function finish(outcome) {
          if (settled) return;
          settled = true;
          if (timer !== null) global.clearTimeout(timer);
          resolve(outcome);
        }
        run.cancel = function(reason) { finish({ cancelled: reason }); };
        timer = global.setTimeout(function() { closeRun(run, 'timeout'); }, limits.maxOperationMs);
        promise.then(function(value) {
          if (!runOpen(context)) {
            closeRun(run, run.reason || 'timeout');
            return;
          }
          finish({ value: value });
        }, function() {
          finish({ rejected: true });
        });
      }).then(function(outcome) {
        if (!outcome.cancelled) closeRun(run, 'complete');
        if (outcome.cancelled) return runFailure(context);
        return outcome.rejected ? failed('recovery-pending', false) : outcome.value;
      });
    }

    function partitionKey(context) {
      return schema.makePartitionKey(claimFromContext(context));
    }

    function contentIdentityKey(context, sourceFileId) {
      return partitionKey(context) + '\u0000' + sourceFileId;
    }

    function stopOperation(operation) {
      if (!operation || !activeOperations.has(operation)) return;
      activeOperations.delete(operation);
      operationRuns.delete(operation);
      try {
        authority.finishOperation(operation);
      } catch (_error) {
        return;
      }
    }

    async function beginIngestion(context) {
      if (!runOpen(context)) return runFailure(context);
      var operation;
      try {
        operation = await authority.beginOperation('ingestion', context);
      } catch (_error) {
        return failed('pending', false);
      }
      if (!operation || operation.decision) {
        return failed(operation && operation.decision ? operation.decision : 'pending', false);
      }
      if (!runOpen(context)) {
        try { authority.finishOperation(operation); } catch (_error) { /* closed run */ }
        return runFailure(context);
      }
      activeOperations.add(operation);
      operationRuns.set(operation, runFor(context));
      return { ok: true, operation: operation };
    }

    function consumeBudget(budget, kind) {
      if (aborted) return false;
      budget.requests += 1;
      if (kind === 'page') budget.pages += 1;
      return budget.requests <= limits.maxRequestsPerRun &&
        budget.pages <= limits.maxPagesPerScan;
    }

    async function readRoot(context, operation, budget) {
      void operation;
      if (!runOpen(context)) return runFailure(context);
      if (!consumeBudget(budget, 'request')) return failed('bounded-rescan-required', true);
      var read;
      try {
        read = await transport.getFile(
          { fileId: context.corpusRootFileId },
          runSignal(context)
        );
      } catch (_error) {
        return failed('pending', true);
      }
      if (!runOpen(context)) return runFailure(context);
      if (!read || read.kind !== 'ok') {
        return failed(read && (read.kind === 'denied' || read.kind === 'not-found')
          ? 'inaccessible'
          : 'pending', read && read.kind !== 'denied' && read.kind !== 'not-found');
      }
      var root = fileShape(read.value);
      if (!root || root.id !== context.corpusRootFileId || root.mimeType !== FOLDER_MIME ||
          root.trashed || root.canListChildren !== true || root.shortcut) {
        return failed('inaccessible', false);
      }
      return { ok: true, root: root };
    }

    async function captureBaseline(context, root, budget) {
      if (!runOpen(context)) return runFailure(context);
      if (!consumeBudget(budget, 'request')) return failed('bounded-rescan-required', true);
      var input = {};
      if (root.driveId !== null) input.driveId = root.driveId;
      var read;
      try {
        read = await transport.getStartPageToken(input, runSignal(context));
      } catch (_error) {
        return failed('pending', true);
      }
      if (!runOpen(context)) return runFailure(context);
      if (!read || read.kind !== 'ok' || !read.value || !read.value.startPageToken) {
        return failed('invalid-change-token', true);
      }
      return { ok: true, token: read.value.startPageToken };
    }

    async function scanPhysicalInventory(context, root, budget) {
      var queue = [{ shape: root, depth: 0, path: Object.freeze([root.id]) }];
      var visitedFolders = new Set();
      var itemIdentities = new Map();
      var sourceFiles = new Map();
      var itemCount = 0;

      while (queue.length > 0) {
        if (!runOpen(context)) return runFailure(context);
        var current = queue.shift();
        if (current.depth > limits.maxDepth || visitedFolders.has(current.shape.id)) {
          if (current.depth > limits.maxDepth) return failed('bounded-rescan-required', true);
          continue;
        }
        visitedFolders.add(current.shape.id);
        var pageToken = null;
        var seenPageTokens = new Set();
        do {
          if (!consumeBudget(budget, 'page')) return failed('bounded-rescan-required', true);
          var input = { parentFileId: current.shape.id };
          if (pageToken !== null) input.pageToken = pageToken;
          if (current.shape.driveId !== null) input.driveId = current.shape.driveId;
          if (current.shape.value.resourceKey) input.resourceKey = current.shape.value.resourceKey;
          var page;
          try {
            page = await transport.listChildren(input, runSignal(context));
          } catch (_error) {
            return failed('pending', true);
          }
          if (!runOpen(context)) return runFailure(context);
          if (!page || page.kind !== 'ok' || !page.value ||
              !Array.isArray(page.value.files) || page.value.incompleteSearch !== false) {
            return failed(page && page.kind === 'incomplete' ? 'incomplete-inventory' : 'pending', true);
          }
          for (var index = 0; index < page.value.files.length; index += 1) {
            itemCount += 1;
            if (itemCount > limits.maxItemsPerScan) return failed('bounded-rescan-required', true);
            var shape = fileShape(page.value.files[index]);
            if (!shape || shape.parents.indexOf(current.shape.id) === -1) {
              return failed('incomplete-inventory', true);
            }
            if (shape.trashed) continue;
            var identity = metadataIdentity(schema, shape);
            if (identity === null) return failed('incomplete-inventory', true);
            if (shape.mimeType === FOLDER_MIME && current.path.indexOf(shape.id) !== -1) {
              return failed('incomplete-inventory', true);
            }
            if (itemIdentities.has(shape.id)) {
              if (itemIdentities.get(shape.id) !== identity) {
                return failed('incomplete-inventory', true);
              }
              continue;
            }
            itemIdentities.set(shape.id, identity);
            if (shape.mimeType === FOLDER_MIME) {
              if (shape.shortcut || shape.canListChildren !== true) {
                return failed('incomplete-inventory', true);
              }
              queue.push({
                shape: shape,
                depth: current.depth + 1,
                path: Object.freeze(current.path.concat([shape.id]))
              });
            } else {
              if (sourceFiles.size >= limits.maxSources) return failed('bounded-rescan-required', true);
              sourceFiles.set(shape.id, shape);
            }
          }
          var next = page.value.nextPageToken;
          if (next !== null && next !== undefined) {
            if (typeof next !== 'object' || seenPageTokens.has(next)) {
              return failed('incomplete-inventory', true);
            }
            seenPageTokens.add(next);
            pageToken = next;
          } else {
            pageToken = null;
          }
        } while (pageToken !== null);
      }
      return { ok: true, sourceFiles: sourceFiles };
    }

    function sourceBase(context, sourceFileId) {
      var claim = claimFromContext(context);
      var sourceKey = schema.makeSourceKey({
        accountPermissionId: claim.accountPermissionId,
        corpusRootFileId: claim.corpusRootFileId,
        sourceFileId: sourceFileId
      });
      var owningPartitionKey = schema.makePartitionKey(claim);
      return sourceKey && owningPartitionKey
        ? {
            sourceKey: sourceKey,
            partitionKey: owningPartitionKey,
            accountPermissionId: claim.accountPermissionId,
            corpusRootFileId: claim.corpusRootFileId,
            sourceFileId: sourceFileId
          }
        : null;
    }

    function hiddenRecord(context, sourceFileId, state) {
      var base = sourceBase(context, sourceFileId);
      if (!base) return null;
      var tag = state === 'pending'
        ? 'transient-proof-failure'
        : state === 'missing'
          ? 'authoritative-reconciliation'
          : 'lost-access';
      return schema.parseSourceRecord({
        version: schema.VERSION,
        sourceKey: base.sourceKey,
        partitionKey: base.partitionKey,
        accountPermissionId: base.accountPermissionId,
        corpusRootFileId: base.corpusRootFileId,
        sourceFileId: base.sourceFileId,
        visibility: state === 'pending' ? 'staged' : 'withheld',
        state: state,
        evidence: { tag: tag },
        displayName: null,
        metadataFingerprint: null,
        membershipFingerprint: null,
        contentFingerprint: null
      });
    }

    function metadataFingerprint(shape) {
      if (!shape.modifiedTime) return null;
      return schema.parseMetadataFingerprint({
        version: schema.VERSION,
        kind: 'metadata',
        name: shape.name,
        mimeType: shape.mimeType,
        modifiedTime: shape.modifiedTime,
        driveVersion: shape.version,
        size: shape.size,
        trashed: shape.trashed,
        canDownload: shape.canDownload
      });
    }

    function membershipFingerprint(context, shape, certificate) {
      if (!certificate || certificate.decision !== 'certified' ||
          !Array.isArray(certificate.physicalParentChain)) {
        return null;
      }
      return schema.parseMembershipFingerprint({
        version: schema.VERSION,
        kind: 'membership',
        corpusRootFileId: context.corpusRootFileId,
        physicalParentChain: Array.from(certificate.physicalParentChain),
        vendorScopeFileId: certificate.vendorScopeFileId,
        driveId: shape.driveId
      });
    }

    function contentFingerprint(shape, byteHash) {
      var checksum = shape.value.sha256Checksum;
      if (typeof checksum === 'string' && /^[0-9a-fA-F]{64}$/.test(checksum)) {
        var driveHash = 'sha256:' + checksum.toLowerCase();
        if (byteHash !== driveHash) return null;
        return schema.parseContentFingerprint({
          version: schema.VERSION,
          kind: 'content',
          evidenceKind: 'drive-sha256',
          value: driveHash
        });
      }
      var revision = shape.value.headRevisionId;
      if (validId(revision)) {
        return schema.parseContentFingerprint({
          version: schema.VERSION,
          kind: 'content',
          evidenceKind: 'drive-revision',
          value: revision
        });
      }
      return schema.parseContentFingerprint({
        version: schema.VERSION,
        kind: 'content',
        evidenceKind: shape.mimeType === DOC_MIME ? 'export-byte-hash' : 'download-byte-hash',
        value: byteHash
      });
    }

    function visibleRecord(context, shape, certificate, state, fingerprint) {
      var base = sourceBase(context, shape.id);
      var metadata = metadataFingerprint(shape);
      var membership = membershipFingerprint(context, shape, certificate);
      if (!base || !metadata || !membership) return hiddenRecord(context, shape.id, 'pending');
      var evidence;
      if (state === 'ready') {
        evidence = {
          tag: 'verified-readable',
          accountAccess: true,
          ancestry: true,
          contentPath: 'supported',
          downloadAllowed: true,
          contentFingerprint: 'current',
          processedFingerprint: 'current'
        };
      } else {
        evidence = { tag: state === 'download-blocked'
          ? 'download-policy-denial'
          : 'unsupported-content' };
      }
      return schema.parseSourceRecord({
        version: schema.VERSION,
        sourceKey: base.sourceKey,
        partitionKey: base.partitionKey,
        accountPermissionId: base.accountPermissionId,
        corpusRootFileId: base.corpusRootFileId,
        sourceFileId: base.sourceFileId,
        visibility: 'active',
        state: state,
        evidence: evidence,
        displayName: shape.name,
        metadataFingerprint: metadata,
        membershipFingerprint: membership,
        contentFingerprint: state === 'ready' ? fingerprint : null
      });
    }

    function rebuildStoredRecord(context, snapshot) {
      if (!snapshot || !validId(snapshot.sourceFileId)) return null;
      if (snapshot.state === 'pending' || snapshot.state === 'inaccessible' ||
          snapshot.state === 'missing') {
        return hiddenRecord(context, snapshot.sourceFileId, snapshot.state);
      }
      var base = sourceBase(context, snapshot.sourceFileId);
      var evidence = snapshot.state === 'ready'
        ? {
            tag: 'verified-readable',
            accountAccess: true,
            ancestry: true,
            contentPath: 'supported',
            downloadAllowed: true,
            contentFingerprint: 'current',
            processedFingerprint: 'current'
          }
        : { tag: snapshot.state === 'download-blocked'
          ? 'download-policy-denial'
          : 'unsupported-content' };
      return base ? schema.parseSourceRecord({
        version: schema.VERSION,
        sourceKey: base.sourceKey,
        partitionKey: base.partitionKey,
        accountPermissionId: base.accountPermissionId,
        corpusRootFileId: base.corpusRootFileId,
        sourceFileId: base.sourceFileId,
        visibility: 'active',
        state: snapshot.state,
        evidence: evidence,
        displayName: snapshot.displayName,
        metadataFingerprint: snapshot.metadataFingerprint,
        membershipFingerprint: snapshot.membershipFingerprint,
        contentFingerprint: snapshot.state === 'ready' ? snapshot.contentFingerprint : null
      }) : null;
    }

    async function priorRecords(context) {
      if (!runOpen(context)) return { ok: false, records: new Map() };
      var inspected;
      try {
        inspected = await store.inspectMetadata(claimFromContext(context));
      } catch (_error) {
        return { ok: false, records: new Map() };
      }
      if (!runOpen(context)) return { ok: false, records: new Map() };
      if (inspected === null) return { ok: true, records: new Map() };
      if (!isPlainRecord(inspected) || !Array.isArray(inspected.sources) ||
          inspected.sources.length > limits.maxSources) {
        return { ok: false, records: new Map() };
      }
      var records = new Map();
      for (var index = 0; index < inspected.sources.length; index += 1) {
        var record = rebuildStoredRecord(context, inspected.sources[index]);
        if (!record || records.has(record.sourceFileId)) return { ok: false, records: new Map() };
        records.set(record.sourceFileId, record);
      }
      return { ok: true, records: records };
    }

    async function readFreshContent(context, shape, budget, operationSignal) {
      if (!runOpen(context)) return { state: 'pending', fingerprint: null };
      if (!consumeBudget(budget, 'request')) return { state: 'pending', fingerprint: null };
      var byteHash = null;
      var sinkUsed = false;
      var input = { fileId: shape.id, mimeType: shape.mimeType };
      if (shape.value.resourceKey) input['resource' + 'Key'] = shape.value.resourceKey;
      var read;
      try {
        read = await transport.readContent(input, async function(payload) {
          sinkUsed = true;
          if (payload && typeof payload.byteHash === 'string' &&
              /^sha256:[0-9a-f]{64}$/.test(payload.byteHash)) {
            byteHash = payload.byteHash;
          }
          await Promise.resolve();
        }, operationSignal);
      } catch (_error) {
        return { state: 'pending', fingerprint: null };
      }
      if (!runOpen(context)) return { state: 'pending', fingerprint: null };
      if (!read || read.kind !== 'ok') {
        if (read && (read.kind === 'download-denied' || read.kind === 'denied')) {
          return { state: 'download-blocked', fingerprint: null };
        }
        if (read && (read.kind === 'unsupported' || read.kind === 'too-large' ||
            read.kind === 'malformed')) {
          return { state: 'unreadable', fingerprint: null };
        }
        if (read && (read.kind === 'not-found')) {
          return { state: 'inaccessible', fingerprint: null };
        }
        return { state: 'pending', fingerprint: null };
      }
      if (!sinkUsed || !read.value || read.value.byteHash !== byteHash) {
        return { state: 'unreadable', fingerprint: null };
      }
      var fingerprint = contentFingerprint(shape, byteHash);
      return fingerprint
        ? { state: 'ready', fingerprint: fingerprint }
        : { state: 'unreadable', fingerprint: null };
    }

    function actionBetween(previous, next, contentChanged) {
      if (!next) return 'state';
      if (!previous) return contentChanged ? 'content' : 'state';
      if (sameCanonical(schema, previous, next)) return 'none';
      if (contentChanged || !sameCanonical(schema, previous.contentFingerprint, next.contentFingerprint)) {
        return 'content';
      }
      if (!sameCanonical(schema, previous.membershipFingerprint, next.membershipFingerprint)) {
        return 'membership';
      }
      if (!sameCanonical(schema, previous.metadataFingerprint, next.metadataFingerprint)) {
        return 'metadata';
      }
      return 'state';
    }

    async function decideCertifiedSource(
      context, shape, certificate, previous, budget, operationSignal
    ) {
      if (shape.trashed) {
        return { record: hiddenRecord(context, shape.id, 'inaccessible'), action: 'state', state: 'inaccessible' };
      }
      if (shape.shortcut || (shape.mimeType !== DOC_MIME && shape.mimeType !== TEXT_MIME)) {
        var unsupported = visibleRecord(context, shape, certificate, 'unreadable', null);
        return {
          record: unsupported || hiddenRecord(context, shape.id, 'pending'),
          action: actionBetween(previous, unsupported, false),
          state: unsupported ? 'unreadable' : 'pending'
        };
      }
      if (!shape.canDownload) {
        var blocked = visibleRecord(context, shape, certificate, 'download-blocked', null);
        return {
          record: blocked || hiddenRecord(context, shape.id, 'pending'),
          action: actionBetween(previous, blocked, false),
          state: blocked ? 'download-blocked' : 'pending'
        };
      }

      var identity = exactContentIdentity(shape);
      var identityKey = contentIdentityKey(context, shape.id);
      var knownIdentity = contentIdentities.get(identityKey) || null;
      var canReuse = !!previous && previous.state === 'ready' && !!previous.contentFingerprint &&
        identity !== null && knownIdentity === identity;
      if (!canReuse && previous && previous.state === 'ready' && previous.contentFingerprint && identity) {
        if (previous.contentFingerprint.evidenceKind === 'drive-sha256' &&
            identity === 'drive-sha256:' + previous.contentFingerprint.value.replace(/^sha256:/, '')) {
          canReuse = true;
        } else if (previous.contentFingerprint.evidenceKind === 'drive-revision' &&
            identity === 'drive-revision:' + previous.contentFingerprint.value) {
          canReuse = true;
        }
      }
      if (canReuse) {
        var reused = visibleRecord(context, shape, certificate, 'ready', previous.contentFingerprint);
        return {
          record: reused || hiddenRecord(context, shape.id, 'pending'),
          action: actionBetween(previous, reused, false),
          state: reused ? 'ready' : 'pending'
        };
      }

      var read = await readFreshContent(context, shape, budget, operationSignal);
      if (!runOpen(context)) return {
        record: hiddenRecord(context, shape.id, 'pending'),
        action: 'state',
        state: 'pending'
      };
      if (read.state === 'inaccessible') {
        contentIdentities.delete(identityKey);
        return {
          record: hiddenRecord(context, shape.id, 'inaccessible'),
          action: 'state',
          state: 'inaccessible'
        };
      }
      if (read.state === 'pending') {
        contentIdentities.delete(identityKey);
        return {
          record: hiddenRecord(context, shape.id, 'pending'),
          action: 'state',
          state: 'pending'
        };
      }
      if (read.state === 'ready' && identity !== null) contentIdentities.set(identityKey, identity);
      else contentIdentities.delete(identityKey);
      var next = visibleRecord(context, shape, certificate, read.state, read.fingerprint);
      var contentChanged = read.state === 'ready' && (!previous || previous.state !== 'ready' ||
        !sameCanonical(schema, previous.contentFingerprint, read.fingerprint));
      return {
        record: next || hiddenRecord(context, shape.id, 'pending'),
        action: actionBetween(previous, next, contentChanged),
        state: next ? read.state : 'pending'
      };
    }

    function certificateMatchesShape(context, certificate, shape) {
      var metadata = metadataFingerprint(shape);
      var membership = membershipFingerprint(context, shape, certificate);
      return !!metadata && !!membership &&
        sameCanonical(schema, metadata, certificate.metadataFingerprint) &&
        sameCanonical(schema, membership, certificate.membershipFingerprint);
    }

    function withheldDecision(context, sourceFileId, previous, decisionKind) {
      if (decisionKind === 'closed') return failed('closed', false);
      var state = decisionKind === 'inaccessible' ? 'inaccessible' : 'pending';
      return {
        ok: true,
        status: 'decided',
        record: hiddenRecord(context, sourceFileId, state),
        action: previous && previous.state === state ? 'none' : 'state',
        state: state,
        retryable: false
      };
    }

    async function reconcileOneCertified(context, sourceFileId, previous, budget) {
      var opened = await beginIngestion(context);
      if (!opened.ok) return withheldDecision(context, sourceFileId, previous, opened.status);
      var operation = opened.operation;
      var result;
      try {
        result = await authority.runWithCertifiedSource(
          operation,
          sourceFileId,
          async function(certificate, operationSignal) {
            if (!consumeBudget(budget, 'request')) {
              return failed('bounded-rescan-required', true);
            }
            var read;
            try {
              read = await transport.getFile({ fileId: sourceFileId }, operationSignal);
            } catch (_error) {
              return withheldDecision(context, sourceFileId, previous, 'pending');
            }
            if (!read || read.kind !== 'ok') {
              return withheldDecision(
                context,
                sourceFileId,
                previous,
                read && (read.kind === 'denied' || read.kind === 'not-found')
                  ? 'inaccessible'
                  : 'pending'
              );
            }
            var shape = fileShape(read.value);
            if (!shape || shape.id !== sourceFileId ||
                !certificateMatchesShape(context, certificate, shape)) {
              return failed('incomplete-inventory', true);
            }
            if (shape.mimeType === FOLDER_MIME) {
              return {
                ok: false,
                status: 'full-rescan-required',
                retryable: true,
                folder: true
              };
            }
            var decided = await decideCertifiedSource(
              context,
              shape,
              certificate,
              previous,
              budget,
              operationSignal
            );
            return {
              ok: !!decided.record,
              status: decided.record ? 'decided' : 'pending',
              record: decided.record,
              action: decided.action,
              state: decided.state,
              retryable: !decided.record
            };
          },
          async function(prepared, publisher) {
            var bindings = prepared && prepared.ok && prepared.record &&
              prepared.record.visibility === 'active'
              ? [prepared.record]
              : undefined;
            return publisher.publish(async function() { return prepared; }, bindings);
          }
        );
      } catch (_error) {
        result = null;
      } finally {
        stopOperation(operation);
      }
      if (!result || result.decision !== 'admitted') {
        return withheldDecision(
          context,
          sourceFileId,
          previous,
          result && result.decision ? result.decision : 'pending'
        );
      }
      return result.value && typeof result.value.ok === 'boolean'
        ? result.value
        : failed('pending', true);
    }

    async function drainChanges(context, token, driveId, budget) {
      var pageToken = token;
      var seenTokens = new Set();
      var hints = new Map();
      var newStartPageToken = null;
      while (pageToken !== null) {
        if (!runOpen(context)) return runFailure(context);
        if (typeof pageToken !== 'object' || seenTokens.has(pageToken) ||
            !consumeBudget(budget, 'page')) {
          return failed('invalid-change-token', true);
        }
        seenTokens.add(pageToken);
        var input = { pageToken: pageToken };
        if (driveId !== null) input.driveId = driveId;
        var page;
        try {
          page = await transport.listChanges(input, runSignal(context));
        } catch (_error) {
          return failed('pending', true);
        }
        if (!runOpen(context)) return runFailure(context);
        if (!page || page.kind !== 'ok' || !page.value || !Array.isArray(page.value.changes)) {
          return failed(page && page.kind === 'incomplete' ? 'invalid-change-token' : 'pending', true);
        }
        for (var index = 0; index < page.value.changes.length; index += 1) {
          var hint = page.value.changes[index];
          if (!isPlainRecord(hint) || !validId(hint.fileId) || typeof hint.removed !== 'boolean') {
            return failed('incomplete-changes', true);
          }
          hints.set(hint.fileId, { removed: hint.removed });
          if (hints.size > limits.maxChangesPerRun) return failed('bounded-rescan-required', true);
        }
        var next = page.value.nextPageToken;
        if (next !== null && next !== undefined) {
          if (page.value.newStartPageToken !== null && page.value.newStartPageToken !== undefined) {
            return failed('incomplete-changes', true);
          }
          pageToken = next;
        } else {
          if (!page.value.newStartPageToken) return failed('incomplete-changes', true);
          newStartPageToken = page.value.newStartPageToken;
          pageToken = null;
        }
      }
      return { ok: true, hints: hints, token: newStartPageToken };
    }

    function shouldPurge(action, nextState) {
      return action === 'content' || action === 'state' ||
        nextState === 'inaccessible' || nextState === 'missing' || nextState === 'pending';
    }

    function purgeReason(state) {
      if (state === 'missing') return 'source-missing';
      if (state === 'inaccessible') return 'access-revoked';
      return 'lost-access';
    }

    async function beginStaging(context) {
      if (!runOpen(context)) return runFailure(context);
      var handle;
      try {
        handle = await runStoreMutation(context, function(operationGuard) {
          return store.beginReplacement(claimFromContext(context), operationGuard);
        });
      } catch (_error) {
        return failed('recovery-pending', false);
      }
      if (!runOpen(context)) return runFailure(context);
      if (!handle || handle.ok === false) return failed(handle && handle.status || 'recovery-pending', false);
      return { ok: true, handle: handle };
    }

    async function purgeChanged(context, previousRecords, decisions) {
      var sourceIds = Array.from(decisions.keys()).sort();
      for (var index = 0; index < sourceIds.length; index += 1) {
        if (!runOpen(context)) return runFailure(context);
        var sourceFileId = sourceIds[index];
        var decision = decisions.get(sourceFileId);
        if (!previousRecords.has(sourceFileId) || !shouldPurge(decision.action, decision.state)) continue;
        var purged;
        try {
          purged = await runStoreMutation(context, function(operationGuard) {
            return store.purgeSource(
              claimFromContext(context),
              sourceFileId,
              purgeReason(decision.state),
              operationGuard
            );
          });
        } catch (_error) {
          return failed('recovery-pending', false);
        }
        if (!purged || purged.ok !== true) return failed(purged && purged.status || 'recovery-pending', false);
        if (!runOpen(context)) return runFailure(context);
      }
      return { ok: true };
    }

    async function stageRecords(context, handle, records) {
      var sourceIds = Array.from(records.keys()).sort();
      for (var index = 0; index < sourceIds.length; index += 1) {
        if (!runOpen(context)) return runFailure(context);
        var record = records.get(sourceIds[index]);
        var staged;
        try {
          staged = await runStoreMutation(context, function(operationGuard) {
            return store.stageSource(handle, record, operationGuard);
          });
        } catch (_error) {
          return failed('recovery-pending', false);
        }
        if (!staged || staged.ok !== true) return failed(staged && staged.status || 'recovery-pending', false);
        if (!runOpen(context)) return runFailure(context);
      }
      return { ok: true };
    }

    async function recordMatchesFreshProof(
      context, record, certificate, budget, operationSignal
    ) {
      if (!record || record.visibility !== 'active' ||
          record.sourceFileId !== certificate.sourceFileId ||
          !consumeBudget(budget, 'request')) return false;
      var read;
      try {
        read = await transport.getFile({ fileId: record.sourceFileId }, operationSignal);
      } catch (_error) {
        return false;
      }
      var shape = read && read.kind === 'ok' ? fileShape(read.value) : null;
      if (!shape || shape.id !== record.sourceFileId ||
          !certificateMatchesShape(context, certificate, shape) ||
          !sameCanonical(schema, metadataFingerprint(shape), record.metadataFingerprint) ||
          !sameCanonical(
            schema,
            membershipFingerprint(context, shape, certificate),
            record.membershipFingerprint
          )) {
        return false;
      }
      if (record.state !== 'ready') return record.contentFingerprint === null;
      var expected = schema.parseContentFingerprint(record.contentFingerprint);
      if (!expected) return false;
      if (expected.evidenceKind === 'drive-sha256') {
        var checksum = shape.value.sha256Checksum;
        return typeof checksum === 'string' &&
          'sha256:' + checksum.toLowerCase() === expected.value;
      }
      if (expected.evidenceKind === 'drive-revision') {
        return shape.value.headRevisionId === expected.value;
      }
      var content = await readFreshContent(context, shape, budget, operationSignal);
      return content.state === 'ready' &&
        sameCanonical(schema, content.fingerprint, expected);
    }

    async function publishStagedWithAuthority(context, handle, records, budget) {
      var activeRecords = Array.from(records.values()).filter(function(record) {
        return record && record.visibility === 'active';
      }).sort(function(left, right) {
        return left.sourceFileId < right.sourceFileId ? -1 :
          left.sourceFileId > right.sourceFileId ? 1 : 0;
      });
      var opened = await beginIngestion(context);
      if (!opened.ok) return opened;
      var operation = opened.operation;
      var result;
      try {
        result = await authority.runWithCertifiedSources(
          operation,
          activeRecords.map(function(record) { return record.sourceFileId; }),
          async function(certificates, proof, operationSignal) {
            if (!proof || proof.complete !== true || certificates.length !== activeRecords.length) {
              return failed('full-rescan-required', true);
            }
            var bySourceId = new Map(activeRecords.map(function(record) {
              return [record.sourceFileId, record];
            }));
            for (var index = 0; index < certificates.length; index += 1) {
              var certificate = certificates[index];
              if (!await recordMatchesFreshProof(
                context,
                bySourceId.get(certificate.sourceFileId),
                certificate,
                budget,
                operationSignal
              )) {
                return failed('full-rescan-required', true);
              }
            }
            return { ok: true, bindings: activeRecords };
          },
          async function(prepared, publisher) {
            if (!prepared || prepared.ok !== true) {
              return publisher.publish(async function() { return prepared; });
            }
            return publisher.publish(
              async function(authorityGuard) {
                return commitStaging(context, handle, records, authorityGuard);
              },
              prepared.bindings
            );
          }
        );
      } catch (_error) {
        result = null;
      } finally {
        stopOperation(operation);
      }
      if (!result || result.decision !== 'admitted') {
        return failed(result && result.decision ? result.decision : 'pending', true);
      }
      return result.value && typeof result.value.ok === 'boolean'
        ? result.value
        : failed('recovery-pending', false);
    }

    async function closeCommittedAbort(context) {
      try {
        await runStandaloneStoreMutation(function(operationGuard) {
          return store.withdrawPartition(
            claimFromContext(context),
            'user-withdrawn',
            operationGuard
          );
        });
      } catch (_error) {
        return failed('aborted', false);
      }
      try {
        await runStandaloneStoreMutation(function(operationGuard) {
          return store.purgePartition(
            claimFromContext(context),
            'user-withdrawn',
            operationGuard
          );
        });
      } catch (_error) {
        return failed('aborted', false);
      }
      return failed('aborted', false);
    }

    async function commitStaging(context, handle, records, authorityGuard) {
      if (!runOpen(context)) return runFailure(context);
      if (typeof global.AbortController !== 'function') return failed('recovery-pending', false);
      checkpointSequence += 1;
      var checkpoint = {
        version: CHECKPOINT_VERSION,
        kind: 'inventory-complete',
        cursor: 'inventory_' + checkpointSequence,
        sourceCount: records.size
      };
      var committed;
      try {
        committed = await runStoreMutation(context, function(operationGuard) {
          return store.commitInventory(
            handle,
            checkpoint,
            operationGuard,
            authorityGuard || null
          );
        });
      } catch (_error) {
        return failed('recovery-pending', false);
      }
      if (!runOpen(context)) {
        return committed && committed.ok === true
          ? (aborted ? closeCommittedAbort(context) : runFailure(context))
          : runFailure(context);
      }
      if (!committed || committed.ok !== true) {
        return failed(committed && committed.status || 'recovery-pending', false);
      }
      return outputRecord({
        ok: true,
        status: 'active',
        sourceCount: records.size,
        checkpoint: checkpoint,
        partitionKey: partitionKey(context)
      });
    }

    async function stageInitialSnapshot(context, previousRecords, records, decisions) {
      var staging = await beginStaging(context);
      if (!staging.ok) return staging;
      var purged = await purgeChanged(context, previousRecords, decisions);
      if (!purged.ok) return purged;
      var staged = await stageRecords(context, staging.handle, records);
      if (!staged.ok) return staged;
      return { ok: true, handle: staging.handle };
    }

    async function replaceStagedRecord(context, handle, previous, decision) {
      if (!runOpen(context)) return runFailure(context);
      if (previous && shouldPurge(decision.action, decision.state)) {
        var purged;
        try {
          purged = await runStoreMutation(context, function(operationGuard) {
            return store.purgeSource(
              claimFromContext(context),
              decision.record.sourceFileId,
              purgeReason(decision.state),
              operationGuard
            );
          });
        } catch (_error) {
          return failed('recovery-pending', false);
        }
        if (!purged || purged.ok !== true) return failed(purged && purged.status || 'recovery-pending', false);
        if (!runOpen(context)) return runFailure(context);
      }
      var staged;
      try {
        staged = await runStoreMutation(context, function(operationGuard) {
          return store.stageSource(handle, decision.record, operationGuard);
        });
      } catch (_error) {
        return failed('recovery-pending', false);
      }
      if (!runOpen(context)) return runFailure(context);
      return staged && staged.ok === true
        ? { ok: true }
        : failed(staged && staged.status || 'recovery-pending', false);
    }

    async function fullInventoryAttempt(context) {
      if (!runOpen(context)) return runFailure(context);
      var budget = { requests: 0, pages: 0 };
      var previousResult = await priorRecords(context);
      if (!runOpen(context)) return runFailure(context);
      if (!previousResult.ok) return failed('recovery-pending', false);
      var previousRecords = previousResult.records;
      var opened = await beginIngestion(context);
      if (!opened.ok) return opened;
      var operation = opened.operation;
      var root;
      var baseline;
      var scan;
      var records = new Map();
      var decisions = new Map();
      try {
        root = await readRoot(context, operation, budget);
        if (!root.ok) return root;
        baseline = await captureBaseline(context, root.root, budget);
        if (!baseline.ok) return baseline;
        scan = await scanPhysicalInventory(context, root.root, budget);
        if (!scan.ok) return scan;
        var sourceIds = Array.from(scan.sourceFiles.keys()).sort();
        for (var index = 0; index < sourceIds.length; index += 1) {
          var sourceFileId = sourceIds[index];
          var decided = await reconcileOneCertified(
            context,
            sourceFileId,
            previousRecords.get(sourceFileId) || null,
            budget
          );
          if (!decided.ok) return decided;
          records.set(sourceFileId, decided.record);
          decisions.set(sourceFileId, decided);
        }
      } finally {
        stopOperation(operation);
      }
      if (!runOpen(context)) return runFailure(context);

      previousRecords.forEach(function(previous, sourceFileId) {
        if (records.has(sourceFileId)) return;
        var missing = hiddenRecord(context, sourceFileId, 'missing');
        records.set(sourceFileId, missing);
        decisions.set(sourceFileId, {
          record: missing,
          action: previous.state === 'missing' ? 'none' : 'state',
          state: 'missing'
        });
      });
      if (records.size > limits.maxSources) return failed('bounded-rescan-required', true);

      var stagedSnapshot = await stageInitialSnapshot(context, previousRecords, records, decisions);
      if (!stagedSnapshot.ok) return stagedSnapshot;

      var drainOpened = await beginIngestion(context);
      if (!drainOpened.ok) return drainOpened;
      var drainOperation = drainOpened.operation;
      var drain;
      try {
        drain = await drainChanges(context, baseline.token, root.root.driveId, budget);
        if (!drain.ok) return drain;
        var hintIds = Array.from(drain.hints.keys()).sort();
        for (var hintIndex = 0; hintIndex < hintIds.length; hintIndex += 1) {
          var hintedId = hintIds[hintIndex];
          var prior = records.get(hintedId) || null;
          var hinted = await reconcileOneCertified(
            context,
            hintedId,
            prior,
            budget
          );
          if (!hinted.ok) return hinted;
          var replaced = await replaceStagedRecord(context, stagedSnapshot.handle, prior, hinted);
          if (!replaced.ok) return replaced;
          records.set(hintedId, hinted.record);
        }
      } finally {
        stopOperation(drainOperation);
      }
      if (!runOpen(context)) return runFailure(context);
      if (records.size > limits.maxSources) return failed('bounded-rescan-required', true);

      var committed = await publishStagedWithAuthority(
        context,
        stagedSnapshot.handle,
        records,
        budget
      );
      if (!committed.ok) return committed;
      if (!runOpen(context)) return runFailure(context);
      changeTokens.set(partitionKey(context), {
        token: drain.token,
        driveId: root.root.driveId
      });
      return committed;
    }

    async function fullRescan(context, recoveredBy) {
      var last = null;
      for (var attempt = 0; attempt <= limits.maxRescans; attempt += 1) {
        if (!runOpen(context)) return runFailure(context);
        last = await fullInventoryAttempt(context);
        if (last.ok) {
          if (!recoveredBy) return last;
          return outputRecord({
            ok: true,
            status: last.status,
            sourceCount: last.sourceCount,
            checkpoint: last.checkpoint,
            partitionKey: last.partitionKey,
            recoveredBy: recoveredBy
          });
        }
        if (!last.retryable) return last;
      }
      return last || failed('pending', false);
    }

    async function publishTargeted(context, previousRecords, records, decisions, budget) {
      var staging = await beginStaging(context);
      if (!staging.ok) return staging;
      var purged = await purgeChanged(context, previousRecords, decisions);
      if (!purged.ok) return purged;
      var staged = await stageRecords(context, staging.handle, records);
      if (!staged.ok) return staged;
      return publishStagedWithAuthority(context, staging.handle, records, budget);
    }

    async function reconcileSourceUnlocked(context, sourceFileId, hint) {
      void hint;
      var previousResult = await priorRecords(context);
      if (!runOpen(context)) return runFailure(context);
      if (!previousResult.ok) return failed('recovery-pending', false);
      var previousRecords = previousResult.records;
      var opened = await beginIngestion(context);
      if (!opened.ok) return opened;
      var budget = { requests: 0, pages: 0 };
      var decision;
      try {
        decision = await reconcileOneCertified(
          context,
          sourceFileId,
          previousRecords.get(sourceFileId) || null,
          budget
        );
      } finally {
        stopOperation(opened.operation);
      }
      if (!runOpen(context)) return runFailure(context);
      if (!decision.ok) {
        if (decision.folder) return fullRescan(context, 'full-rescan');
        return decision;
      }
      var records = new Map(previousRecords);
      records.set(sourceFileId, decision.record);
      var decisions = new Map([[sourceFileId, decision]]);
      var published = await publishTargeted(context, previousRecords, records, decisions, budget);
      if (!published.ok) return published;
      return outputRecord({
        ok: true,
        status: published.status,
        sourceCount: published.sourceCount,
        checkpoint: published.checkpoint,
        partitionKey: published.partitionKey,
        sourceFileId: sourceFileId,
        state: decision.state,
        action: decision.action
      });
    }

    async function reconcileChangesUnlocked(context) {
      var tokenRecord = changeTokens.get(partitionKey(context));
      if (!tokenRecord) return fullRescan(context, 'full-rescan');
      var previousResult = await priorRecords(context);
      if (!runOpen(context)) return runFailure(context);
      if (!previousResult.ok) return failed('recovery-pending', false);
      var previousRecords = previousResult.records;
      var opened = await beginIngestion(context);
      if (!opened.ok) return opened;
      var budget = { requests: 0, pages: 0 };
      var drained;
      var records = new Map(previousRecords);
      var decisions = new Map();
      try {
        drained = await drainChanges(context, tokenRecord.token, tokenRecord.driveId, budget);
        if (!drained.ok) return fullRescan(context, 'full-rescan');
        var sourceIds = Array.from(drained.hints.keys()).sort();
        for (var index = 0; index < sourceIds.length; index += 1) {
          var sourceFileId = sourceIds[index];
          var decision = await reconcileOneCertified(
            context,
            sourceFileId,
            previousRecords.get(sourceFileId) || null,
            budget
          );
          if (!decision.ok) {
            if (decision.folder) return fullRescan(context, 'full-rescan');
            return decision;
          }
          records.set(sourceFileId, decision.record);
          decisions.set(sourceFileId, decision);
        }
      } finally {
        stopOperation(opened.operation);
      }
      if (!runOpen(context)) return runFailure(context);
      var published = await publishTargeted(context, previousRecords, records, decisions, budget);
      if (!published.ok) return published;
      if (!runOpen(context)) return runFailure(context);
      changeTokens.set(partitionKey(context), {
        token: drained.token,
        driveId: tokenRecord.driveId
      });
      return outputRecord({
        ok: true,
        status: published.status,
        sourceCount: published.sourceCount,
        checkpoint: published.checkpoint,
        partitionKey: published.partitionKey,
        hintCount: decisions.size
      });
    }

    async function resumeUnlocked(context) {
      var proof = await beginIngestion(context);
      if (!proof.ok) return proof;
      stopOperation(proof.operation);
      if (!runOpen(context)) return runFailure(context);
      if (typeof store.recover === 'function') {
        var recovery;
        try {
          recovery = await runStoreMutation(context, function(operationGuard) {
            return store.recover({
              provenAccountPermissionId: context.accountPermissionId
            }, operationGuard);
          });
        } catch (_error) {
          return failed('recovery-pending', false);
        }
        if (!runOpen(context)) return runFailure(context);
        if (!recovery || recovery.ok !== true) return failed('recovery-pending', false);
      }
      return fullRescan(context, 'full-rescan');
    }

    function normalizeAndRun(exactContext, work) {
      var context = normalizeContext(exactContext);
      if (!context) return Promise.resolve(failed('invalid-input', false));
      return withLane(function() {
        if (aborted) return failed('aborted', false);
        return runBounded(context, work);
      });
    }

    function buildInitialInventory(exactContext) {
      return normalizeAndRun(exactContext, function(context) {
        return fullRescan(context, null);
      });
    }

    function reconcileChanges(exactContext) {
      return normalizeAndRun(exactContext, reconcileChangesUnlocked);
    }

    function reconcileSource(exactContext, sourceFileId, hint) {
      var normalizedHint = normalizeHint(hint);
      if (!validId(sourceFileId) || !normalizedHint) {
        return Promise.resolve(failed('invalid-input', false));
      }
      return normalizeAndRun(exactContext, function(context) {
        return reconcileSourceUnlocked(context, sourceFileId, normalizedHint);
      });
    }

    function resume(exactContext) {
      return normalizeAndRun(exactContext, resumeUnlocked);
    }

    function abort(reason) {
      if (aborted) return false;
      aborted = true;
      abortReason = typeof reason === 'string' && reason.length > 0 && reason.length <= 64
        ? reason
        : 'aborted';
      Array.from(activeRuns).forEach(function(run) { closeRun(run, 'aborted'); });
      activeRuns.clear();
      activeOperations.forEach(function(operation) { stopOperation(operation); });
      activeOperations.clear();
      changeTokens.clear();
      contentIdentities.clear();
      void abortReason;
      return true;
    }

    return Object.freeze({
      buildInitialInventory: buildInitialInventory,
      reconcileChanges: reconcileChanges,
      reconcileSource: reconcileSource,
      resume: resume,
      abort: abort
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    LIMITS: LIMITS,
    create: create
  });

  global.FsbSkopeoDriveReconciler = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
