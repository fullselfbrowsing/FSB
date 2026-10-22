(function(global) {
  'use strict';

  var VERSION = 'skopeo-corpus-controller/v1';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
  var DRIVE_ORIGIN = 'https://drive.google.com';
  var DOCS_ORIGIN = 'https://docs.google.com';
  var STATUS = Object.freeze(['unconfigured', 'validating', 'active', 'fail-quiet']);
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
  var OPTION_KEYS = [
    'store',
    'transport',
    'readLiveContext',
    'now',
    'signal',
    'limits'
  ];
  var WITHDRAW_REASONS = Object.freeze({
    'user-withdrawn': true
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
    var output = {};
    for (var index = 0; index < entries.length; index += 1) {
      output[entries[index][0]] = entries[index][1];
    }
    return Object.freeze(output);
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

  function normalizeContext(value) {
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

  function contextsMatch(left, right) {
    if (!left || !right) return false;
    for (var index = 0; index < BASE_CONTEXT_KEYS.length; index += 1) {
      if (left[BASE_CONTEXT_KEYS[index]] !== right[BASE_CONTEXT_KEYS[index]]) return false;
    }
    return true;
  }

  function result(ok, status, handle) {
    var entries = [['ok', ok], ['status', status]];
    if (arguments.length > 2) entries.push(['handle', handle]);
    return frozenRecord(entries);
  }

  function create(options) {
    var fields = exactDataValues(options, OPTION_KEYS);
    var limitFields = fields ? exactDataValues(fields.limits, ['maxOperationMs']) : null;
    if (!fields || !fields.store || typeof fields.store.getVisibleManifest !== 'function' ||
        typeof fields.store.issueMutation !== 'function' ||
        typeof fields.store.finishMutation !== 'function' ||
        typeof fields.store.recover !== 'function' ||
        typeof fields.store.beginReplacement !== 'function' ||
        typeof fields.store.commitInventory !== 'function' ||
        typeof fields.store.withdrawPartition !== 'function' ||
        typeof fields.store.purgePartition !== 'function' ||
        !fields.transport || typeof fields.transport.about !== 'function' ||
        typeof fields.transport.getFile !== 'function' ||
        typeof fields.readLiveContext !== 'function' || typeof fields.now !== 'function' ||
        !fields.signal || typeof fields.signal.aborted !== 'boolean' || !limitFields ||
        !positiveInteger(limitFields.maxOperationMs) || limitFields.maxOperationMs > 30000) {
      return null;
    }

    var store = fields.store;
    var transport = fields.transport;
    var readLiveContext = fields.readLiveContext;
    var now = fields.now;
    var signal = fields.signal;
    var maxOperationMs = limitFields.maxOperationMs;
    var currentStatus = 'unconfigured';
    var currentClaim = null;
    var currentHandle = null;
    var handleIdentities = new WeakSet();
    var mutationLane = Promise.resolve();
    var activeMutationQueue = null;

    function queueMutation(work) {
      var resolvePublic;
      var rejectPublic;
      var publicResult = new Promise(function(resolve, reject) {
        resolvePublic = resolve;
        rejectPublic = reject;
      });
      async function execute() {
        var queue = { barriers: [] };
        activeMutationQueue = queue;
        try {
          resolvePublic(await work());
        } catch (error) {
          rejectPublic(error);
        } finally {
          while (queue.barriers.length > 0) {
            var barriers = queue.barriers.splice(0, queue.barriers.length);
            await Promise.allSettled(barriers);
          }
          if (activeMutationQueue === queue) activeMutationQueue = null;
        }
      }
      var run = mutationLane.then(execute, execute);
      mutationLane = run.then(function() {}, function() {});
      return publicResult;
    }

    function openDeadline() {
      var value;
      try {
        value = now();
      } catch (_error) {
        return null;
      }
      return Number.isFinite(value) ? value + maxOperationMs : null;
    }

    function deadlineOpen(deadline) {
      var value;
      try {
        value = now();
      } catch (_error) {
        return false;
      }
      return signal.aborted !== true && Number.isFinite(value) && value <= deadline;
    }

    async function bounded(deadline, thunk, holdMutationLane) {
      if (!deadlineOpen(deadline) || typeof thunk !== 'function' ||
          typeof global.AbortController !== 'function') return { ok: false };
      var currentTime;
      try {
        currentTime = now();
      } catch (_error) {
        return { ok: false };
      }
      var remaining = Math.max(1, Math.floor(deadline - currentTime));
      var operationController = new global.AbortController();
      var operationSignal = operationController.signal;
      var timer = null;
      var abortListener = null;
      try {
        var promise = Promise.resolve().then(function() { return thunk(operationSignal); });
        var winner = await new Promise(function(resolve) {
          var settled = false;
          function finish(value) {
            if (settled) return;
            settled = true;
            resolve(value);
          }
          timer = global.setTimeout(function() {
            try { operationController.abort('timeout'); } catch (_error) { operationController.abort(); }
            finish({ failed: true, cancelled: true });
          }, remaining);
          if (signal && typeof signal.addEventListener === 'function') {
            abortListener = function() {
              try { operationController.abort('parent-aborted'); } catch (_error) { operationController.abort(); }
              finish({ failed: true, cancelled: true });
            };
            signal.addEventListener('abort', abortListener, { once: true });
            if (signal.aborted) abortListener();
          }
          promise.then(function(value) { finish({ value: value }); }, function() {
            finish({ failed: true });
          });
        });
        if (winner.cancelled) {
          promise.catch(function() {});
          if (holdMutationLane === true && activeMutationQueue) {
            activeMutationQueue.barriers.push(promise.then(function() {}, function() {}));
          }
        }
        return !winner.failed && deadlineOpen(deadline)
          ? { ok: true, value: winner.value }
          : { ok: false };
      } finally {
        if (timer !== null) global.clearTimeout(timer);
        if (abortListener && signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', abortListener);
        }
        if (!operationSignal.aborted) {
          try { operationController.abort('operation-complete'); } catch (_error) { operationController.abort(); }
        }
      }
    }

    async function runStoreMutation(operationSignal, work) {
      var guard = store.issueMutation(operationSignal);
      if (!guard || typeof work !== 'function') return { ok: false, status: 'invalid-input' };
      try {
        return await work(guard);
      } finally {
        var terminal = store.finishMutation(guard);
        if (!terminal || terminal.ok !== true) await new Promise(function() {});
      }
    }

    function boundedMutation(deadline, work) {
      return bounded(deadline, function(operationSignal) {
        return runStoreMutation(operationSignal, work);
      }, true);
    }

    async function readContext(deadline) {
      var read = await bounded(deadline, function(operationSignal) {
        return readLiveContext(operationSignal);
      });
      return read.ok ? normalizeContext(read.value) : null;
    }

    function claim(accountPermissionId, corpusRootFileId) {
      return Object.freeze({
        accountPermissionId: accountPermissionId,
        corpusRootFileId: corpusRootFileId
      });
    }

    async function closeUnproven(deadline) {
      // `recover({})` is the store's durable unproven closure; it advances the
      // authority epoch and removes the active projection without guessing identity.
      await boundedMutation(deadline, function(operationGuard) {
        return store.recover({}, operationGuard);
      });
      currentStatus = 'fail-quiet';
      currentHandle = null;
    }

    async function withdrawAndPurge(deadline, ownedClaim, reason) {
      var withdrawn = await boundedMutation(deadline, function(operationGuard) {
        return store.withdrawPartition(ownedClaim, reason, operationGuard);
      });
      if (!withdrawn.ok || !withdrawn.value || withdrawn.value.ok !== true) return false;
      var purged = await boundedMutation(deadline, function(operationGuard) {
        return store.purgePartition(ownedClaim, reason, operationGuard);
      });
      return !!purged.ok && !!purged.value && purged.value.ok === true;
    }

    async function proveFolder(deadline, expectedContext, folderFileId) {
      if (!deadlineOpen(deadline)) return { ok: false, kind: 'unproven' };
      var before = await readContext(deadline);
      if (!before || (expectedContext && !contextsMatch(expectedContext, before))) {
        return { ok: false, kind: 'closed' };
      }
      var aboutRead = await bounded(deadline, function(operationSignal) {
        return transport.about(operationSignal);
      });
      if (!aboutRead.ok || !aboutRead.value || aboutRead.value.kind !== 'ok' ||
          !aboutRead.value.value || !validId(aboutRead.value.value.permissionId)) {
        return { ok: false, kind: 'unproven' };
      }
      var permissionId = aboutRead.value.value.permissionId;
      var fileRead = await bounded(deadline, function(operationSignal) {
        return transport.getFile({ fileId: folderFileId }, operationSignal);
      });
      if (!fileRead.ok) return { ok: false, kind: 'unproven', permissionId: permissionId };
      var fileResult = fileRead.value;
      if (!fileResult || fileResult.kind !== 'ok') {
        return {
          ok: false,
          kind: fileResult && (fileResult.kind === 'denied' || fileResult.kind === 'not-found')
            ? 'inaccessible'
            : 'unproven',
          permissionId: permissionId
        };
      }
      var root = fileResult.value;
      if (!isPlainRecord(root) || root.id !== folderFileId || root.mimeType !== FOLDER_MIME ||
          root.mimeType === SHORTCUT_MIME || root.trashed !== false ||
          !isPlainRecord(root.capabilities) || root.capabilities.canListChildren !== true ||
          (root.shortcutDetails !== null && root.shortcutDetails !== undefined)) {
        return { ok: false, kind: 'inaccessible', permissionId: permissionId };
      }
      var after = await readContext(deadline);
      if (!after || !contextsMatch(before, after)) return { ok: false, kind: 'closed' };
      return {
        ok: true,
        permissionId: permissionId,
        root: root,
        context: after
      };
    }

    async function enrollUnlocked(input) {
      var request = exactDataValues(input, ['folderFileId']);
      if (!request || !validId(request.folderFileId) || signal.aborted) {
        return result(false, 'fail-quiet');
      }
      var deadline = openDeadline();
      if (deadline === null) return result(false, 'fail-quiet');
      var context = await readContext(deadline);
      if (!context || context.origin !== DRIVE_ORIGIN || context.entityKind !== 'drive-folder' ||
          context.entityId !== request.folderFileId) {
        return result(false, 'fail-quiet');
      }
      currentStatus = 'validating';
      var proof = await proveFolder(deadline, context, request.folderFileId);
      if (!proof.ok) {
        if (proof.kind === 'unproven') await closeUnproven(deadline);
        else currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      var candidate = claim(proof.permissionId, request.folderFileId);
      var identityRecovery = await boundedMutation(deadline, function(operationGuard) {
        return store.recover(
          { provenAccountPermissionId: candidate.accountPermissionId },
          operationGuard
        );
      });
      if (!identityRecovery.ok || !identityRecovery.value || identityRecovery.value.ok !== true) {
        currentStatus = 'fail-quiet';
        currentClaim = null;
        currentHandle = null;
        return result(false, 'fail-quiet');
      }
      var recoveredClaim = identityRecovery.value.status === 'active'
        ? identityRecovery.value.claim
        : null;
      if (recoveredClaim && isPlainRecord(recoveredClaim) &&
          recoveredClaim.accountPermissionId === candidate.accountPermissionId &&
          validId(recoveredClaim.corpusRootFileId)) {
        currentClaim = claim(
          recoveredClaim.accountPermissionId,
          recoveredClaim.corpusRootFileId
        );
      } else if (currentClaim && currentClaim.accountPermissionId !== candidate.accountPermissionId) {
        currentClaim = null;
        currentHandle = null;
      }

      if (currentClaim && currentClaim.accountPermissionId === candidate.accountPermissionId &&
          currentClaim.corpusRootFileId === candidate.corpusRootFileId) {
        if (currentStatus === 'validating' && currentHandle && handleIdentities.has(currentHandle)) {
          return result(true, 'validating', currentHandle);
        }
        var visibleRead = await bounded(deadline, function(operationSignal) {
          return store.getVisibleManifest(candidate, operationSignal);
        });
        if (visibleRead.ok && visibleRead.value &&
            visibleRead.value.accountPermissionId === candidate.accountPermissionId &&
            visibleRead.value.corpusRootFileId === candidate.corpusRootFileId) {
          currentStatus = 'active';
          return result(true, 'active', null);
        }
      }

      if (currentClaim) {
        var reason = currentClaim.accountPermissionId === candidate.accountPermissionId
          ? 'root-replaced'
          : 'account-changed';
        if (!await withdrawAndPurge(deadline, currentClaim, reason)) {
          currentStatus = 'fail-quiet';
          currentHandle = null;
          return result(false, 'fail-quiet');
        }
        currentClaim = null;
        currentHandle = null;
      }

      var handleRead = await boundedMutation(deadline, function(operationGuard) {
        return store.beginReplacement(candidate, operationGuard);
      });
      var handle = handleRead.ok ? handleRead.value : null;
      if (!handle || typeof handle !== 'object' || handle.ok === false ||
          handle.accountPermissionId !== candidate.accountPermissionId ||
          handle.corpusRootFileId !== candidate.corpusRootFileId) {
        currentStatus = 'fail-quiet';
        currentClaim = null;
        currentHandle = null;
        return result(false, 'fail-quiet');
      }
      currentClaim = candidate;
      currentHandle = handle;
      handleIdentities.add(handle);
      currentStatus = 'validating';
      return result(true, 'validating', handle);
    }

    function enroll(input) {
      return queueMutation(function() { return enrollUnlocked(input); });
    }

    async function activateUnlocked(handle, checkpoint) {
      if (!currentClaim || !currentHandle || handle !== currentHandle ||
          !handleIdentities.has(handle) || signal.aborted) {
        return result(false, 'fail-quiet');
      }
      var deadline = openDeadline();
      if (deadline === null) return result(false, 'fail-quiet');
      var context = await readContext(deadline);
      if (!context) return result(false, 'fail-quiet');
      var proof = await proveFolder(deadline, context, currentClaim.corpusRootFileId);
      if (!proof.ok || proof.permissionId !== currentClaim.accountPermissionId) {
        if (proof.kind === 'unproven') await closeUnproven(deadline);
        else await withdrawAndPurge(deadline, currentClaim, 'lost-access');
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      var committed = await boundedMutation(deadline, function(operationGuard) {
        return store.commitInventory(handle, checkpoint, operationGuard);
      });
      if (!committed.ok || !committed.value || committed.value.ok !== true ||
          committed.value.status !== 'active') {
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      var finalProof = await proveFolder(deadline, context, currentClaim.corpusRootFileId);
      if (!finalProof.ok || finalProof.permissionId !== currentClaim.accountPermissionId) {
        await withdrawAndPurge(deadline, currentClaim, 'lost-access');
        currentClaim = null;
        currentHandle = null;
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      handleIdentities.delete(handle);
      currentHandle = null;
      currentStatus = 'active';
      return result(true, 'active');
    }

    function activateEnrollment(handle, checkpoint) {
      return queueMutation(function() { return activateUnlocked(handle, checkpoint); });
    }

    async function revalidateUnlocked() {
      if (!currentClaim) return recoverUnlocked();
      var deadline = openDeadline();
      if (deadline === null || signal.aborted) return result(false, 'fail-quiet');
      var context = await readContext(deadline);
      if (!context) return result(false, 'fail-quiet');
      var proof = await proveFolder(deadline, context, currentClaim.corpusRootFileId);
      if (!proof.ok) {
        if (proof.kind === 'unproven') {
          await closeUnproven(deadline);
          return result(false, 'fail-quiet');
        }
        await withdrawAndPurge(deadline, currentClaim, 'lost-access');
        currentClaim = null;
        currentHandle = null;
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      if (proof.permissionId !== currentClaim.accountPermissionId) {
        await withdrawAndPurge(deadline, currentClaim, 'account-changed');
        await boundedMutation(deadline, function(operationGuard) {
          return store.recover({ provenAccountPermissionId: proof.permissionId }, operationGuard);
        });
        currentClaim = null;
        currentHandle = null;
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      var visibleRead = await bounded(deadline, function(operationSignal) {
        return store.getVisibleManifest(currentClaim, operationSignal);
      });
      if (!visibleRead.ok || !visibleRead.value) {
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      currentStatus = 'active';
      return result(true, 'active');
    }

    function revalidate() {
      return queueMutation(revalidateUnlocked);
    }

    async function getRootStatusUnlocked(input) {
      var request = exactDataValues(input, ['folderFileId']);
      if (!request || !validId(request.folderFileId) || signal.aborted) {
        return result(false, 'fail-quiet');
      }
      var deadline = openDeadline();
      if (deadline === null) return result(false, 'fail-quiet');
      var context = await readContext(deadline);
      if (!context || context.origin !== DRIVE_ORIGIN || context.entityKind !== 'drive-folder' ||
          context.entityId !== request.folderFileId) return result(false, 'fail-quiet');

      if (currentHandle) {
        if (!currentClaim || currentClaim.corpusRootFileId !== request.folderFileId ||
            !handleIdentities.has(currentHandle)) return result(false, 'fail-quiet');
        var stagingProof = await proveFolder(deadline, context, request.folderFileId);
        if (!stagingProof.ok || stagingProof.permissionId !== currentClaim.accountPermissionId) {
          if (stagingProof.kind === 'unproven') await closeUnproven(deadline);
          else if (stagingProof.permissionId &&
              stagingProof.permissionId !== currentClaim.accountPermissionId) {
            await boundedMutation(deadline, function(operationGuard) {
              return store.recover(
                { provenAccountPermissionId: stagingProof.permissionId },
                operationGuard
              );
            });
          } else {
            await withdrawAndPurge(deadline, currentClaim, 'lost-access');
          }
          currentClaim = null;
          currentHandle = null;
          currentStatus = 'fail-quiet';
          return result(false, 'fail-quiet');
        }
        currentStatus = 'validating';
        return result(true, 'validating');
      }

      currentStatus = 'validating';
      var proof = await proveFolder(deadline, context, request.folderFileId);
      if (!proof.ok) {
        if (proof.kind === 'unproven') await closeUnproven(deadline);
        else currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      var recovery = await boundedMutation(deadline, function(operationGuard) {
        return store.recover({ provenAccountPermissionId: proof.permissionId }, operationGuard);
      });
      if (!recovery.ok || !recovery.value || recovery.value.ok !== true) {
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      if (recovery.value.status === 'active' && isPlainRecord(recovery.value.claim) &&
          recovery.value.claim.accountPermissionId === proof.permissionId &&
          validId(recovery.value.claim.corpusRootFileId)) {
        var recoveredClaim = claim(
          recovery.value.claim.accountPermissionId,
          recovery.value.claim.corpusRootFileId
        );
        var visibleRead = await bounded(deadline, function(operationSignal) {
          return store.getVisibleManifest(recoveredClaim, operationSignal);
        });
        if (!visibleRead.ok || !visibleRead.value ||
            visibleRead.value.accountPermissionId !== recoveredClaim.accountPermissionId ||
            visibleRead.value.corpusRootFileId !== recoveredClaim.corpusRootFileId) {
          currentStatus = 'fail-quiet';
          return result(false, 'fail-quiet');
        }
        currentClaim = recoveredClaim;
        currentHandle = null;
        currentStatus = 'active';
        return result(true, recoveredClaim.corpusRootFileId === request.folderFileId
          ? 'active'
          : 'unconfigured');
      }
      if (recovery.value.status !== 'closed' && recovery.value.status !== 'purged') {
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      currentClaim = null;
      currentHandle = null;
      currentStatus = 'unconfigured';
      return result(true, 'unconfigured');
    }

    function getRootStatus(input) {
      return queueMutation(function() { return getRootStatusUnlocked(input); });
    }

    async function recoverUnlocked() {
      var deadline = openDeadline();
      if (deadline === null || signal.aborted) return result(false, 'fail-quiet');
      var context = await readContext(deadline);
      if (!context) return result(false, 'fail-quiet');
      var aboutRead = await bounded(deadline, function(operationSignal) {
        return transport.about(operationSignal);
      });
      if (!aboutRead.ok || !aboutRead.value || aboutRead.value.kind !== 'ok' ||
          !aboutRead.value.value || !validId(aboutRead.value.value.permissionId)) {
        await closeUnproven(deadline);
        return result(false, 'fail-quiet');
      }
      var permissionId = aboutRead.value.value.permissionId;
      var recovery = await boundedMutation(deadline, function(operationGuard) {
        return store.recover({ provenAccountPermissionId: permissionId }, operationGuard);
      });
      if (!recovery.ok || !recovery.value || recovery.value.ok !== true) {
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      if (recovery.value.status !== 'active' || !isPlainRecord(recovery.value.claim) ||
          recovery.value.claim.accountPermissionId !== permissionId ||
          !validId(recovery.value.claim.corpusRootFileId)) {
        currentClaim = null;
        currentHandle = null;
        currentStatus = 'unconfigured';
        return result(true, 'unconfigured');
      }
      var rootFileId = recovery.value.claim.corpusRootFileId;
      var candidate = claim(permissionId, rootFileId);
      var proof = await proveFolder(deadline, context, rootFileId);
      if (!proof.ok) {
        if (proof.kind === 'unproven') await closeUnproven(deadline);
        else await withdrawAndPurge(deadline, candidate, 'lost-access');
        currentClaim = null;
        currentHandle = null;
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      var visibleRead = await bounded(deadline, function(operationSignal) {
        return store.getVisibleManifest(candidate, operationSignal);
      });
      if (visibleRead.ok && visibleRead.value &&
          visibleRead.value.accountPermissionId === permissionId &&
          visibleRead.value.corpusRootFileId === rootFileId) {
        currentClaim = candidate;
        currentHandle = null;
        currentStatus = 'active';
        return result(true, 'active');
      }
      currentClaim = null;
      currentHandle = null;
      currentStatus = 'fail-quiet';
      return result(false, 'fail-quiet');
    }

    function recover() {
      if (arguments.length !== 0) return Promise.resolve(result(false, 'fail-quiet'));
      return queueMutation(recoverUnlocked);
    }

    async function withdrawUnlocked(input) {
      var request = exactDataValues(input, ['reason']);
      if (!request || !WITHDRAW_REASONS[request.reason] || !currentClaim || signal.aborted) {
        return result(false, currentClaim ? 'fail-quiet' : 'unconfigured');
      }
      var deadline = openDeadline();
      if (deadline === null || !await withdrawAndPurge(deadline, currentClaim, request.reason)) {
        currentStatus = 'fail-quiet';
        return result(false, 'fail-quiet');
      }
      if (currentHandle) handleIdentities.delete(currentHandle);
      currentClaim = null;
      currentHandle = null;
      currentStatus = 'unconfigured';
      return result(true, 'unconfigured');
    }

    function withdraw(input) {
      return queueMutation(function() { return withdrawUnlocked(input); });
    }

    function getStatus() {
      return frozenRecord([['status', currentStatus]]);
    }

    function getCurrentClaim() {
      return currentClaim
        ? frozenRecord([
            ['accountPermissionId', currentClaim.accountPermissionId],
            ['corpusRootFileId', currentClaim.corpusRootFileId]
          ])
        : null;
    }

    return Object.freeze({
      enroll: enroll,
      activateEnrollment: activateEnrollment,
      revalidate: revalidate,
      getRootStatus: getRootStatus,
      recover: recover,
      withdraw: withdraw,
      getStatus: getStatus,
      getCurrentClaim: getCurrentClaim
    });
  }

  var api = Object.freeze({
    VERSION: VERSION,
    FOLDER_MIME: FOLDER_MIME,
    STATUS: STATUS,
    create: create
  });

  global.FsbSkopeoCorpusController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
