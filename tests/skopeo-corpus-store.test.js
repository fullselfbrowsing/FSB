'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const BACKGROUND_PATH = path.join(ROOT, 'extension/background.js');
const STORE_PATH = path.join(ROOT, 'extension/utils/trusted-local-feature-store.js');
const CORPUS_STORE_PATH = path.join(ROOT, 'extension/utils/skopeo-corpus-store.js');
const CORPUS_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-corpus-schema.js');
const CORPUS_CONTROLLER_PATH = path.join(ROOT, 'extension/utils/skopeo-corpus-controller.js');
const ACTIONS_PATH = path.join(ROOT, 'extension/content/actions.js');
const STORE_VERSION = 'skopeo-corpus-store/v1';
const CHECKPOINT_VERSION = 'skopeo-corpus-checkpoint/v1';
const PURGE_PARTICIPANTS = Object.freeze([
  'fragments',
  'indexes',
  'citations',
  'counts',
  'relationships',
  'result-cache',
  'alerts'
]);
const PINNED_STORAGE_FREE = [
  'extension/utils/diagnostics-ring-buffer.js',
  'extension/utils/automation-logger.js',
  'extension/content/dom-state.js',
  'extension/content/actions.js'
];

let passed = 0;
const failures = [];

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  PASS:', message);
  } else {
    failures.push(message);
    console.error('  FAIL:', message);
  }
}

async function checkRejects(work, pattern, message) {
  try {
    await work();
    check(false, message);
  } catch (error) {
    check(pattern.test(String(error && error.message)), message);
  }
}

function extractMarkedBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) return null;
  return source.slice(source.indexOf('\n', start) + 1, end);
}

function createFakeStorage(initial = {}, options = {}) {
  const values = structuredClone(initial);
  const listeners = [];
  const events = [];
  let setAccessCount = 0;

  function selected(keys) {
    if (keys == null) return structuredClone(values);
    const result = {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = structuredClone(values[key]);
    }
    return result;
  }

  const local = {
    async setAccessLevel(value) {
      setAccessCount += 1;
      events.push({ type: 'setAccessLevel', value: structuredClone(value) });
      if (options.missingAccessLevel) throw new Error('setAccessLevel unavailable');
      if (options.rejectAccessLevel) throw new Error('access-level-rejected');
    },
    async get(keys) {
      events.push({ type: 'get', keys: structuredClone(keys) });
      return selected(keys);
    },
    async set(update) {
      events.push({ type: 'set', update: structuredClone(update) });
      const changes = {};
      for (const [key, value] of Object.entries(update || {})) {
        changes[key] = { oldValue: values[key], newValue: structuredClone(value) };
        values[key] = structuredClone(value);
      }
      for (const listener of listeners) listener(changes, 'local');
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      events.push({ type: 'remove', keys: structuredClone(list) });
      for (const key of list) delete values[key];
    }
  };

  if (options.missingAccessLevel) delete local.setAccessLevel;

  return {
    chrome: {
      runtime: { id: 'fsb-test-extension' },
      storage: {
        local,
        onChanged: {
          addListener(listener) { listeners.push(listener); },
          removeListener(listener) {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          }
        }
      }
    },
    values,
    events,
    accessCount: () => setAccessCount
  };
}

async function runBootBlock(backgroundSource, storageOptions = {}) {
  const block = extractMarkedBlock(
    backgroundSource,
    '/* FSB_TRUSTED_LOCAL_BOUNDARY_START */',
    '/* FSB_TRUSTED_LOCAL_BOUNDARY_END */'
  );
  if (!block) return { missing: true };

  const fake = createFakeStorage({}, storageOptions);
  const bootEvents = fake.events;
  const context = {
    chrome: fake.chrome,
    console,
    setTimeout,
    clearTimeout,
    globalThis: null,
    __FSB_TEST_CORPUS_BOOT__: async () => { bootEvents.push({ type: 'corpusBoot' }); },
    FsbTrustedLocalFeatureStore: {
      create() {
        bootEvents.push({ type: 'featureStoreCreate' });
        return { ready: async () => { bootEvents.push({ type: 'featureStoreReady' }); } };
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(block, context, { filename: 'background-trusted-local-boundary.js' });
  await context.fsbTrustedLocalBootPromise;
  return { fake, context, events: bootEvents };
}

function invokeMessage(handler, message, sender) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) reject(new Error('message handler timed out'));
    }, 250);
    const sendResponse = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      const keepOpen = handler(message, sender, sendResponse);
      if (keepOpen !== true && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      }
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

function createFailureController() {
  const trace = [];
  let callCount = 0;
  let armed = null;

  async function around(type, detail, work) {
    callCount += 1;
    const call = callCount;
    trace.push({ call, timing: 'before', type, detail: structuredClone(detail) });
    if (armed && armed.call === call && armed.timing === 'before') {
      throw new Error(`${armed.kind}-before:${type}:raw-error-secret`);
    }
    const result = await work();
    trace.push({ call, timing: 'after', type, detail: structuredClone(detail) });
    if (armed && armed.call === call && armed.timing === 'after') {
      throw new Error(`${armed.kind}-after:${type}:raw-error-secret`);
    }
    return result;
  }

  return {
    around,
    arm(failure) {
      armed = Object.freeze({
        call: failure.call,
        timing: failure.timing,
        kind: failure.kind
      });
    },
    clear() { armed = null; },
    reset() {
      trace.length = 0;
      callCount = 0;
      armed = null;
    },
    trace,
    callCount: () => callCount
  };
}

function createFailureInjectedStorage(initial = {}, controller = createFailureController()) {
  const values = structuredClone(initial);

  function selected(keys) {
    if (keys == null) return structuredClone(values);
    const result = {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        result[key] = structuredClone(values[key]);
      }
    }
    return result;
  }

  const storageArea = {
    async get(keys) {
      return controller.around('storage.get', { keys }, async () => selected(keys));
    },
    async set(update) {
      return controller.around('storage.set', { update }, async () => {
        for (const [key, value] of Object.entries(update || {})) {
          values[key] = structuredClone(value);
        }
      });
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return controller.around('storage.remove', { keys: list }, async () => {
        for (const key of list) delete values[key];
      });
    }
  };

  return { storageArea, values, controller };
}

function makeCorpusFixtures(schema) {
  const VERSION = schema.VERSION;
  const partitions = Object.freeze({
    AX: Object.freeze({ accountPermissionId: 'account-A', corpusRootFileId: 'root-X' }),
    AY: Object.freeze({ accountPermissionId: 'account-A', corpusRootFileId: 'root-Y' }),
    BY: Object.freeze({ accountPermissionId: 'account-B', corpusRootFileId: 'root-Y' })
  });

  function sourceRecord(claim, sourceFileId, changes = {}) {
    const partitionKey = schema.makePartitionKey(claim);
    const sourceKey = schema.makeSourceKey({ ...claim, sourceFileId });
    const record = {
      version: VERSION,
      sourceKey,
      partitionKey,
      accountPermissionId: claim.accountPermissionId,
      corpusRootFileId: claim.corpusRootFileId,
      sourceFileId,
      visibility: 'active',
      state: 'ready',
      evidence: {
        tag: 'verified-readable',
        accountAccess: true,
        ancestry: true,
        contentPath: 'supported',
        downloadAllowed: true,
        contentFingerprint: 'current',
        processedFingerprint: 'current'
      },
      displayName: `Agreement ${sourceFileId}`,
      metadataFingerprint: {
        version: VERSION,
        kind: 'metadata',
        name: `Agreement ${sourceFileId}`,
        mimeType: 'text/plain',
        modifiedTime: '2026-07-20T12:00:00.000Z',
        driveVersion: '42',
        size: 2048,
        trashed: false,
        canDownload: true
      },
      membershipFingerprint: {
        version: VERSION,
        kind: 'membership',
        corpusRootFileId: claim.corpusRootFileId,
        physicalParentChain: [claim.corpusRootFileId, `vendor-${claim.corpusRootFileId}`],
        vendorScopeFileId: `vendor-${claim.corpusRootFileId}`,
        driveId: null
      },
      contentFingerprint: {
        version: VERSION,
        kind: 'content',
        evidenceKind: 'download-byte-hash',
        value: 'sha256:' + (sourceFileId.endsWith('1') ? 'a' : 'b').repeat(64)
      }
    };
    return Object.assign(record, changes);
  }

  function checkpoint(cursor, sourceCount) {
    return Object.freeze({
      version: CHECKPOINT_VERSION,
      kind: 'inventory-complete',
      cursor,
      sourceCount
    });
  }

  return Object.freeze({
    partitions,
    sourceRecord,
    checkpoint,
    SOURCE_1: 'source-1',
    SOURCE_2: 'source-2'
  });
}

function createFutureParticipants(controller, schema, fixtures) {
  const owned = new Map();
  const participants = new Map();
  const observedGuards = [];

  function guardOpen(operationGuard) {
    if (operationGuard === undefined) return true;
    observedGuards.push(operationGuard);
    return !!operationGuard && operationGuard.signal && operationGuard.signal.aborted === false &&
      operationGuard.operationToken && typeof operationGuard.operationToken === 'object' &&
      Number.isSafeInteger(operationGuard.operationEpoch);
  }

  function ownerKey(claim, sourceFileId) {
    const partitionKey = schema.makePartitionKey(claim);
    return `${partitionKey}\u0000${sourceFileId}`;
  }

  for (const name of PURGE_PARTICIPANTS) {
    const category = new Map();
    owned.set(name, category);
    participants.set(name, Object.freeze({
      async purgeSource(request, operationGuard) {
        return controller.around(`participant.${name}.purgeSource`, request, async () => {
          if (!guardOpen(operationGuard)) return { ok: false };
          category.delete(`${request.partitionKey}\u0000${request.sourceFileId}`);
          return { ok: true };
        });
      },
      async purgePartition(request, operationGuard) {
        return controller.around(`participant.${name}.purgePartition`, request, async () => {
          if (!guardOpen(operationGuard)) return { ok: false };
          const prefix = `${request.partitionKey}\u0000`;
          for (const key of Array.from(category.keys())) {
            if (key.startsWith(prefix)) category.delete(key);
          }
          return { ok: true };
        });
      },
      async hasOwnedInfluence(request, operationGuard) {
        return controller.around(`participant.${name}.hasOwnedInfluence`, request, async () => {
          if (!guardOpen(operationGuard)) return { owned: true };
          const prefix = `${request.partitionKey}\u0000`;
          const hasOwned = request.sourceFileId === null
            ? Array.from(category.keys()).some((key) => key.startsWith(prefix))
            : category.has(`${request.partitionKey}\u0000${request.sourceFileId}`);
          return { owned: hasOwned };
        });
      }
    }));
  }

  function seed(claim, sourceFileId) {
    for (const [name, category] of owned) {
      category.set(ownerKey(claim, sourceFileId), `${name}-source-owned-payload`);
    }
  }

  function has(claim, sourceFileId) {
    return Array.from(owned.values()).some((category) => category.has(ownerKey(claim, sourceFileId)));
  }

  function countPartition(claim) {
    const prefix = `${schema.makePartitionKey(claim)}\u0000`;
    let count = 0;
    for (const category of owned.values()) {
      for (const key of category.keys()) if (key.startsWith(prefix)) count += 1;
    }
    return count;
  }

  seed(fixtures.partitions.AX, fixtures.SOURCE_1);
  seed(fixtures.partitions.AX, fixtures.SOURCE_2);
  seed(fixtures.partitions.AY, fixtures.SOURCE_1);
  seed(fixtures.partitions.BY, fixtures.SOURCE_1);

  return { participants, owned, seed, has, countPartition, observedGuards };
}

function registerParticipants(store, future) {
  for (const name of PURGE_PARTICIPANTS) {
    const result = store.registerPurgeParticipant(name, future.participants.get(name));
    assert.equal(result && result.ok, true, `${name} purge participant registers`);
  }
}

function traceCalls(controller) {
  return controller.trace.filter((entry) => entry.timing === 'before');
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function findStoredEntry(values, parser, predicate = () => true) {
  return Object.entries(values).find(([, value]) => {
    const parsed = parser(value);
    return parsed && predicate(parsed);
  }) || null;
}

function visibleSourceIds(visible) {
  return visible && Array.isArray(visible.sources)
    ? visible.sources.map((source) => source.sourceFileId).sort()
    : [];
}

function loadCorpusContracts() {
  delete require.cache[require.resolve(CORPUS_SCHEMA_PATH)];
  const schema = require(CORPUS_SCHEMA_PATH);
  delete require.cache[require.resolve(CORPUS_STORE_PATH)];
  const corpusStore = require(CORPUS_STORE_PATH);
  delete require.cache[require.resolve(CORPUS_CONTROLLER_PATH)];
  const corpusController = require(CORPUS_CONTROLLER_PATH);
  return { schema, corpusStore, corpusController };
}

function createCorpusHarness(contracts, options = {}) {
  const controller = options.controller || createFailureController();
  const fake = createFailureInjectedStorage(options.initial || {}, controller);
  const fixtures = options.fixtures || makeCorpusFixtures(contracts.schema);
  const future = options.future || createFutureParticipants(controller, contracts.schema, fixtures);
  const store = contracts.corpusStore.create({
    storageArea: fake.storageArea,
    schema: contracts.schema,
    now: options.now || (() => 1700000000000)
  });
  if (options.register !== false) registerParticipants(store, future);
  return { ...contracts, ...fake, fixtures, future, store };
}

function authorityCommitGuard(
  _handle,
  authorityToken,
  authorityEpoch,
  authorityValidate,
  controller = new AbortController()
) {
  return Object.freeze({
    signal: controller.signal,
    operationToken: authorityToken,
    operationEpoch: authorityEpoch,
    validate: authorityValidate
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function createPausedBoundaryController() {
  const base = createFailureController();
  let armed = null;
  let reached = null;
  let release = null;
  let paused = false;
  return {
    ...base,
    pauseNext(predicate, timing = 'before') {
      armed = { predicate, timing };
      reached = deferred();
      release = deferred();
      paused = false;
      return reached.promise;
    },
    release() {
      if (release) release.resolve();
    },
    around(type, detail, work) {
      return base.around(type, detail, async () => {
        const matches = armed && !paused && armed.predicate(type, detail);
        if (matches && armed.timing === 'before') {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        const value = await work();
        if (matches && armed.timing === 'after') {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        return value;
      });
    }
  };
}

async function runIssuedMutation(store, controller, work) {
  const guard = store.issueMutation(controller.signal);
  assert.ok(guard && Object.isFrozen(guard), 'store issues a frozen mutation guard');
  assert.strictEqual(guard.signal, controller.signal,
    'issued mutation guard binds the exact AbortSignal');
  assert.ok(guard.operationToken && typeof guard.operationToken === 'object',
    'issued mutation guard carries an opaque token');
  assert.equal(Number.isSafeInteger(guard.operationEpoch), true,
    'issued mutation guard carries an epoch');
  try {
    return await work(guard);
  } finally {
    const finished = store.finishMutation(guard);
    assert.equal(finished && finished.ok, true, 'store acknowledges terminal mutation cleanup');
  }
}

function mutate(store, work, controller = new AbortController()) {
  return runIssuedMutation(store, controller, work);
}

function settleWithin(promise, milliseconds) {
  return Promise.race([
    Promise.resolve(promise).then((value) => ({ settled: true, value })),
    new Promise((resolve) => setTimeout(() => resolve({ settled: false }), milliseconds))
  ]);
}

function snapshotDurable(values) {
  return structuredClone(values);
}

function createPausedActivePointerController() {
  const base = createFailureController();
  const applied = deferred();
  const release = deferred();
  let paused = false;
  return {
    ...base,
    applied: applied.promise,
    release: () => release.resolve(),
    around(type, detail, work) {
      return base.around(type, detail, async () => {
        const result = await work();
        const update = detail && detail.update;
        const active = update && Object.values(update).some((value) =>
          value && value.lifecycle === 'active' && typeof value.activePartitionKey === 'string');
        if (type === 'storage.set' && active && !paused) {
          paused = true;
          applied.resolve();
          await release.promise;
        }
        return result;
      });
    }
  };
}

async function activateCorpus(harness, claim, sourceIds, cursor = 'checkpoint-active') {
  const handle = await mutate(harness.store,
    (guard) => harness.store.beginReplacement(claim, guard));
  assert.equal(Number.isSafeInteger(handle && handle.operationEpoch), true,
    'beginReplacement returns an opaque epoch-bound staging handle');
  for (const sourceFileId of sourceIds) {
    const staged = await mutate(harness.store, (guard) => harness.store.stageSource(
      handle,
      harness.fixtures.sourceRecord(claim, sourceFileId),
      guard
    ));
    assert.equal(staged && staged.ok, true, `stage ${sourceFileId} succeeds`);
  }
  const committed = await mutate(harness.store, (guard) => harness.store.commitInventory(
    handle,
    harness.fixtures.checkpoint(cursor, sourceIds.length),
    guard
  ));
  assert.equal(committed && committed.ok, true, 'complete inventory commits');
  return handle;
}

async function testCorpusStoreSurfaceAndClosedInitialization(contracts) {
  const { schema, corpusStore } = contracts;
  assert.strictEqual(globalThis.FsbSkopeoCorpusStore, corpusStore,
    'classic global and CommonJS corpus-store exports match');
  assert.deepEqual(Object.keys(corpusStore).sort(), ['LIMITS', 'VERSION', 'create'],
    'corpus store exposes only its frozen limits, version, and constructor');
  assert.equal(corpusStore.VERSION, STORE_VERSION, 'corpus store version is exact');
  assert.equal(Object.isFrozen(corpusStore), true, 'corpus store contract is frozen');
  assert.equal(Object.isFrozen(corpusStore.LIMITS), true, 'corpus store limits are frozen');

  const harness = createCorpusHarness(contracts);
  const expectedMethods = [
    'beginReplacement',
    'commitInventory',
    'finishMutation',
    'getHiddenSourceState',
    'getVisibleManifest',
    'invalidateSource',
    'inspectMetadata',
    'issueMutation',
    'purgePartition',
    'purgeSource',
    'recover',
    'registerAuthorizedPurgeParticipant',
    'registerPurgeParticipant',
    'stageSource',
    'transitionSource',
    'withdrawPartition'
  ];
  assert.deepEqual(Object.keys(harness.store).sort(), expectedMethods.sort(),
    'instance exposes only the closed trusted corpus protocol');
  assert.equal(Object.isFrozen(harness.store), true, 'store instance is frozen');

  const unproven = await mutate(harness.store, (guard) => harness.store.recover({}, guard));
  assert.equal(unproven && unproven.status, 'unproven',
    'empty initialization with unavailable identity is neutral and closed');
  assert.equal(await harness.store.getVisibleManifest(harness.fixtures.partitions.AX), null,
    'empty initialization has no last/current corpus fallback');
  const manifestEntry = findStoredEntry(harness.values, schema.parseManifest);
  assert.ok(manifestEntry, 'neutral recovery durably creates a closed control manifest');
  assert.equal(schema.parseManifest(manifestEntry[1]).lifecycle, 'unproven',
    'identity-unavailable startup persists only unproven visibility');

  const invalidRecover = await mutate(harness.store, (guard) => harness.store.recover({
    provenAccountPermissionId: 'account-A',
    permissionCertificate: 'certificate-must-not-persist'
  }, guard));
  assert.equal(invalidRecover && invalidRecover.ok, false,
    'recover rejects certificate-bearing proof envelopes');
  assert.doesNotMatch(JSON.stringify(harness.values), /certificate-must-not-persist/,
    'fresh identity proof and permission certificates are never persisted');
  check(true, 'corpus store initializes closed with no fallback or durable certificate');
}

async function testParticipantAuthorizationBridge(contracts) {
  async function exercise(mode) {
    const harness = createCorpusHarness(contracts, { register: false });
    const { AX } = harness.fixtures.partitions;
    const bindCounts = new Map();
    const verifiers = new Map();
    const adapters = new Map();
    const capabilities = new Set();
    const completedCalls = [];
    let rawCorpusGuard = null;
    let participantEffects = 0;

    for (const name of PURGE_PARTICIPANTS) {
      const result = harness.store.registerAuthorizedPurgeParticipant(name,
        (verifyParticipantAuthorization) => {
          bindCounts.set(name, (bindCounts.get(name) || 0) + 1);
          verifiers.set(name, verifyParticipantAuthorization);

          async function authorized(request, capability, expectedMode, resultValue) {
            const before = verifyParticipantAuthorization(capability, expectedMode, request);
            if (!before) {
              return expectedMode.startsWith('verify-') ? { owned: true } : { ok: false };
            }
            assert.ok(before && Object.isFrozen(before),
              `${name} ${expectedMode} authenticates a minimized frozen authorization`);
            assert.deepEqual(Object.keys(before).sort(), ['operationEpoch', 'signal'],
              `${name} ${expectedMode} receives no corpus mutation token or guard`);
            assert.strictEqual(before.signal, rawCorpusGuard.signal,
              `${name} ${expectedMode} binds the live corpus operation signal`);
            assert.equal(before.operationEpoch, rawCorpusGuard.operationEpoch,
              `${name} ${expectedMode} binds the current corpus operation epoch`);
            assert.notStrictEqual(capability, rawCorpusGuard,
              `${name} ${expectedMode} never receives the raw corpus mutation guard`);
            assert.equal(verifyParticipantAuthorization(rawCorpusGuard, expectedMode, request), null,
              `${name} ${expectedMode} rejects the raw corpus mutation guard`);
            assert.equal(verifyParticipantAuthorization(Object.freeze({}), expectedMode, request), null,
              `${name} ${expectedMode} rejects a cloned or forged capability`);
            assert.equal(verifyParticipantAuthorization(capability,
              expectedMode === 'purge-source' ? 'purge-partition' :
                expectedMode === 'purge-partition' ? 'purge-source' :
                  expectedMode === 'verify-source' ? 'verify-partition' : 'verify-source',
              request), null, `${name} ${expectedMode} rejects a mode swap`);
            assert.equal(verifyParticipantAuthorization(capability, expectedMode,
              Object.freeze({ ...request })), null,
            `${name} ${expectedMode} rejects a substituted request object`);
            for (const [otherName, otherVerifier] of verifiers) {
              if (otherName !== name) {
                assert.equal(otherVerifier(capability, expectedMode, request), null,
                  `${name} capability rejects under ${otherName}'s verifier`);
                break;
              }
            }
            assert.throws(() => JSON.stringify(capability),
              `${name} ${expectedMode} capability is not JSON serializable`);
            assert.throws(() => structuredClone(capability),
              `${name} ${expectedMode} capability is not structured-cloneable`);
            assert.equal(capabilities.has(capability), false,
              `${name} ${expectedMode} receives a fresh capability`);
            capabilities.add(capability);
            await Promise.resolve();
            const after = verifyParticipantAuthorization(capability, expectedMode, request);
            assert.ok(after && after.signal.aborted === false,
              `${name} ${expectedMode} remains current across its own await`);
            participantEffects += 1;
            completedCalls.push({ name, expectedMode, request, capability });
            return resultValue;
          }

          const adapter = Object.freeze({
            purgeSource(request, capability) {
              return authorized(request, capability, 'purge-source', { ok: true });
            },
            purgePartition(request, capability) {
              return authorized(request, capability, 'purge-partition', { ok: true });
            },
            hasOwnedInfluence(request, capability) {
              return authorized(request, capability,
                request.sourceFileId === null ? 'verify-partition' : 'verify-source',
                { owned: false });
            }
          });
          adapters.set(name, adapter);
          return adapter;
        });
      assert.equal(result && result.ok, true, `${name} authorized participant registers`);
    }

    assert.equal(typeof harness.store.registerAuthorizedPurgeParticipant, 'function',
      'participant authorization bridge is present on the corpus store');
    assert.equal(Array.from(bindCounts.values()).every((count) => count === 1), true,
      'every participant binder is invoked exactly once during registration');
    const legacyDuplicate = harness.store.registerPurgeParticipant(
      PURGE_PARTICIPANTS[0], harness.future.participants.get(PURGE_PARTICIPANTS[0]));
    assert.equal(legacyDuplicate && legacyDuplicate.ok, false,
      'authorized and legacy participant registrations share one unique-name registry');

    await activateCorpus(harness, AX, [harness.fixtures.SOURCE_1],
      `checkpoint-authorized-${mode}`);
    const controller = new AbortController();
    const result = await mutate(harness.store, async (guard) => {
      rawCorpusGuard = guard;
      return mode === 'source'
        ? harness.store.purgeSource(AX, harness.fixtures.SOURCE_1, 'access-revoked', guard)
        : harness.store.purgePartition(AX, 'root-replaced', guard);
    }, controller);
    assert.equal(result && result.ok, true, `${mode} authorized purge completes`);
    const expectedEffects = PURGE_PARTICIPANTS.length * (mode === 'source' ? 2 : 4);
    assert.equal(participantEffects, expectedEffects,
      `${mode} purge authenticates every purge and absence callback exactly once`);
    assert.equal(completedCalls.every((call) => call.request.sourceFileId === null ||
      call.request.sourceFileId === harness.fixtures.SOURCE_1), true,
    `${mode} authorization binds only the exact source ID or literal partition null`);
    assert.equal(completedCalls.some((call) => call.request.sourceFileId ===
      harness.fixtures.SOURCE_1), true, `${mode} path authenticates a valid source ID`);
    assert.equal(completedCalls.some((call) => call.request.sourceFileId === null),
      mode === 'partition', `${mode} path authenticates partition mode only with literal null`);
    for (const call of completedCalls) {
      assert.equal(verifiers.get(call.name)(call.capability, call.expectedMode, call.request), null,
        `${call.name} ${call.expectedMode} capability is revoked after callback return`);
    }

    const first = completedCalls[0];
    const replayed = await adapters.get(first.name).purgeSource(first.request, first.capability);
    assert.deepEqual(replayed, { ok: false },
      'test adapter remains callable while its replayed authorization has no effect');
    assert.equal(participantEffects, expectedEffects,
      'replayed authorization performs zero participant effect');

    let getterReads = 0;
    const accessorRequest = {};
    for (const key of ['partitionKey', 'accountPermissionId', 'corpusRootFileId',
      'sourceFileId', 'reason']) {
      Object.defineProperty(accessorRequest, key, {
        enumerable: true,
        get() { getterReads += 1; return first.request[key]; }
      });
    }
    await adapters.get(first.name).purgeSource(accessorRequest, first.capability);
    assert.equal(getterReads, 0,
      'participant authorization rejects accessor requests without executing a getter');
    assert.equal(participantEffects, expectedEffects,
      'accessor and malformed request substitutions perform zero participant effect');
  }

  await exercise('source');
  await exercise('partition');

  const duplicateHarness = createCorpusHarness(contracts, { register: false });
  const legacy = duplicateHarness.store.registerPurgeParticipant(
    'fragments', duplicateHarness.future.participants.get('fragments'));
  assert.equal(legacy && legacy.ok, true, 'legacy participant registration remains compatible');
  let duplicateBinderCalls = 0;
  const duplicateAuthorized = duplicateHarness.store.registerAuthorizedPurgeParticipant(
    'fragments', () => { duplicateBinderCalls += 1; return duplicateHarness.future.participants.get('fragments'); });
  assert.equal(duplicateAuthorized && duplicateAuthorized.ok, false,
    'legacy registration also reserves the name from authorized replacement');
  assert.equal(duplicateBinderCalls, 0,
    'a duplicate authorized binder is never invoked');
  check(true, 'participant authorization is one-call, exact-bound, revocable, and non-replayable');
}

async function testMetadataMinimizedHiddenSourceStates(contracts) {
  const hiddenEvidence = {
    pending: 'transient-proof-failure',
    inaccessible: 'lost-access',
    missing: 'authoritative-reconciliation'
  };

  for (const state of Object.keys(hiddenEvidence)) {
    const harness = createCorpusHarness(contracts);
    const { AX, AY } = harness.fixtures.partitions;
    const sourceFileId = harness.fixtures.SOURCE_1;
    await activateCorpus(harness, AX, [sourceFileId], `checkpoint-hidden-${state}`);
    const hidden = harness.fixtures.sourceRecord(AX, sourceFileId, {
      visibility: state === 'pending' ? 'withheld' : 'purging',
      state,
      evidence: { tag: hiddenEvidence[state] },
      displayName: null,
      metadataFingerprint: null,
      membershipFingerprint: null,
      contentFingerprint: null
    });
    const transitioned = await mutate(harness.store, (guard) =>
      harness.store.transitionSource(AX, sourceFileId, hidden, guard));
    assert.equal(transitioned && transitioned.ok, true, `${state} record persists hidden`);
    assert.equal(await harness.store.getHiddenSourceState(AX, sourceFileId), state,
      `${state} projects as the exact closed state token`);
    assert.equal(await harness.store.getHiddenSourceState(AX, harness.fixtures.SOURCE_2), null,
      `${state} lookup has no absent-source fallback`);
    assert.equal(await harness.store.getHiddenSourceState(AY, sourceFileId), null,
      `${state} lookup has no cross-root fallback`);
    assert.equal(JSON.stringify(await harness.store.getHiddenSourceState(AX, sourceFileId)),
      JSON.stringify(state), `${state} lookup reveals no filename, fingerprint, or source ID`);

    await mutate(harness.store, (guard) => harness.store.recover({}, guard));
    assert.equal(await harness.store.getHiddenSourceState(AX, sourceFileId), null,
      `${state} is withheld again when fresh account proof is absent`);
  }
}

async function testProcessedInvalidationRetainsPendingState(contracts) {
  const harness = createCorpusHarness(contracts);
  const { AX } = harness.fixtures.partitions;
  const sourceFileId = harness.fixtures.SOURCE_1;
  await activateCorpus(harness, AX, [sourceFileId], 'checkpoint-processed-invalidation');
  harness.controller.reset();
  const pending = harness.fixtures.sourceRecord(AX, sourceFileId, {
    visibility: 'withheld',
    state: 'pending',
    evidence: { tag: 'transient-proof-failure' },
    displayName: null,
    metadataFingerprint: null,
    membershipFingerprint: null,
    contentFingerprint: null
  });
  const invalidated = await mutate(harness.store, (guard) => harness.store.invalidateSource(
    AX, sourceFileId, pending, 'lost-access', guard
  ));
  assert.equal(invalidated && invalidated.ok, true,
    'processed mismatch reaches terminal participant purge');
  assert.equal(await harness.store.getHiddenSourceState(AX, sourceFileId), 'pending',
    'processed mismatch retains only a metadata-minimized pending token');
  assert.deepEqual(visibleSourceIds(await harness.store.getVisibleManifest(AX)), [],
    'pending source is withdrawn from every visible manifest');
  assert.equal(harness.future.has(AX, sourceFileId), false,
    'all source-owned derivative categories are absent before pending publication completes');
  const trace = traceCalls(harness.controller);
  const pendingWrite = trace.findIndex((entry) => entry.type === 'storage.set' &&
    /"visibility":"withheld"/.test(JSON.stringify(entry.detail)) &&
    /"state":"pending"/.test(JSON.stringify(entry.detail)));
  const firstParticipant = trace.findIndex((entry) => entry.type.startsWith('participant.'));
  assert.ok(pendingWrite >= 0 && firstParticipant > pendingWrite,
    'durable pending withdrawal precedes every participant purge');

  const restarted = recreateStore(harness);
  await mutate(restarted, (guard) => restarted.recover({
    provenAccountPermissionId: AX.accountPermissionId
  }, guard));
  assert.equal(await restarted.getHiddenSourceState(AX, sourceFileId), 'pending',
    'restart preserves the terminal pending token after absence proof');
  assert.equal(harness.future.has(AX, sourceFileId), false,
    'restart cannot restore invalidated derivative influence');

  await mutate(restarted, (guard) => restarted.purgePartition(AX, 'root-replaced', guard));
  const metadata = await restarted.inspectMetadata(AX);
  assert.equal(metadata && metadata.sources.length, 0,
    'later partition purge removes a retained pending source and its completed journal does not bypass cleanup');
}

async function testExactReplacementAndIdentityClosure(contracts) {
  const harness = createCorpusHarness(contracts);
  const { AX, AY, BY } = harness.fixtures.partitions;
  const sourceIds = [harness.fixtures.SOURCE_1, harness.fixtures.SOURCE_2];

  await activateCorpus(harness, AX, sourceIds, 'checkpoint-AX');
  const visibleAX = await harness.store.getVisibleManifest(AX);
  assert.deepEqual(visibleSourceIds(visibleAX), sourceIds.slice().sort(),
    'account A/root X becomes visible only after the complete checkpoint');
  assert.equal(await harness.store.getVisibleManifest(AY), null,
    'same-account different-root lookup has no fallback');
  assert.equal(await harness.store.getVisibleManifest(BY), null,
    'different-account lookup has no fallback');

  harness.controller.reset();
  const handleAY = await mutate(harness.store,
    (guard) => harness.store.beginReplacement(AY, guard));
  assert.equal(Number.isSafeInteger(handleAY.operationEpoch), true,
    'same-account replacement returns a new operation epoch');
  assert.equal(await harness.store.getVisibleManifest(AX), null,
    'old root is invisible before replacement staging can be observed');
  assert.equal(await harness.store.getVisibleManifest(AY), null,
    'candidate remains invisible while staged');
  const closeWriteIndex = harness.controller.trace.findIndex((entry) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
    /"lifecycle":"closed"/.test(JSON.stringify(entry.detail))
  );
  const stagingWriteIndex = harness.controller.trace.findIndex((entry) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
    /"lifecycle":"staging"/.test(JSON.stringify(entry.detail)) &&
    JSON.stringify(entry.detail).includes(schemaKey(contracts.schema, AY))
  );
  assert.ok(closeWriteIndex >= 0 && stagingWriteIndex > closeWriteIndex,
    'replacement durably closes the old pointer before candidate staging');

  const purgedAX = await mutate(harness.store,
    (guard) => harness.store.purgePartition(AX, 'root-replaced', guard));
  assert.equal(purgedAX && purgedAX.ok, true, 'old root reaches terminal purge');
  for (const sourceFileId of sourceIds) {
    const staged = await mutate(harness.store, (guard) => harness.store.stageSource(
      handleAY,
      harness.fixtures.sourceRecord(AY, sourceFileId),
      guard
    ));
    assert.equal(staged && staged.ok, true, `replacement stages ${sourceFileId}`);
  }
  const commitAY = await mutate(harness.store, (guard) => harness.store.commitInventory(
    handleAY,
    harness.fixtures.checkpoint('checkpoint-AY', sourceIds.length),
    guard
  ));
  assert.equal(commitAY && commitAY.ok, true, 'replacement publishes after old-root purge');
  assert.equal(await harness.store.getVisibleManifest(AX), null, 'old root stays invisible');
  assert.deepEqual(visibleSourceIds(await harness.store.getVisibleManifest(AY)), sourceIds.slice().sort(),
    'only account A/root Y is visible after pointer-last publication');

  const handleBY = await mutate(harness.store,
    (guard) => harness.store.beginReplacement(BY, guard));
  assert.equal(await harness.store.getVisibleManifest(AY), null,
    'account replacement closes account A synchronously before account B staging');
  await mutate(harness.store,
    (guard) => harness.store.purgePartition(AY, 'account-changed', guard));
  await mutate(harness.store, (guard) => harness.store.stageSource(
    handleBY,
    harness.fixtures.sourceRecord(BY, harness.fixtures.SOURCE_1),
    guard
  ));
  await mutate(harness.store, (guard) => harness.store.commitInventory(
    handleBY,
    harness.fixtures.checkpoint('checkpoint-BY', 1),
    guard
  ));
  assert.equal(await harness.store.getVisibleManifest(AY), null, 'prior account cannot resurface');
  assert.deepEqual(visibleSourceIds(await harness.store.getVisibleManifest(BY)), [harness.fixtures.SOURCE_1],
    'only the exact proven account B partition becomes visible');

  const unavailable = await mutate(harness.store, (guard) => harness.store.recover({}, guard));
  assert.equal(unavailable && unavailable.status, 'unproven',
    'identity-unavailable restart returns a neutral unproven result');
  assert.equal(await harness.store.getVisibleManifest(BY), null,
    'identity-unavailable restart never exposes cached corpus data');
  const dormantManifestEntry = findStoredEntry(harness.values, contracts.schema.parseManifest);
  const dormantManifest = dormantManifestEntry && contracts.schema.parseManifest(dormantManifestEntry[1]);
  assert.equal(dormantManifest && dormantManifest.lifecycle, 'active',
    'identity-unavailable restart hides without severing the durable active pointer');
  assert.equal(dormantManifest && dormantManifest.activePartitionKey, contracts.schema.makePartitionKey(BY),
    'dormant enrollment retains only the exact stable account/root partition tuple');
  const dormantInfluence = harness.future.countPartition(BY);
  harness.controller.reset();
  const sameAccountRestart = recreateStore(harness);
  const revived = await mutate(sameAccountRestart, (guard) => sameAccountRestart.recover({
    provenAccountPermissionId: 'account-B'
  }, guard));
  assert.deepEqual(clonePlain(revived.claim), clonePlain(BY),
    'fresh same-account proof revives only the previously enrolled root tuple');
  assert.deepEqual(visibleSourceIds(await sameAccountRestart.getVisibleManifest(BY)),
    [harness.fixtures.SOURCE_1], 'same-account wake restores the prior durable corpus');
  assert.equal(harness.future.countPartition(BY), dormantInfluence,
    'same-account wake preserves every participant-owned derivative');
  assert.equal(harness.controller.trace.some((entry) =>
    entry.type && entry.type.includes('.purgePartition')), false,
  'same-account wake invokes no partition purge participant');

  const mismatchHarness = createCorpusHarness(contracts);
  await activateCorpus(mismatchHarness, AX, sourceIds, 'checkpoint-mismatch');
  const mismatch = await mutate(mismatchHarness.store, (guard) => mismatchHarness.store.recover({
    provenAccountPermissionId: 'account-B'
  }, guard));
  assert.ok(mismatch && ['closed', 'purged', 'recovery-pending'].includes(mismatch.status),
    'fresh different permission ID closes or resumes purge of the prior partition');
  assert.equal(await mismatchHarness.store.getVisibleManifest(AX), null,
    'account mismatch never leaves the prior partition visible');
  const mismatchRecovered = createCorpusHarness(contracts, {
    initial: mismatchHarness.values,
    controller: mismatchHarness.controller,
    fixtures: mismatchHarness.fixtures,
    future: mismatchHarness.future
  });
  await mutate(mismatchRecovered.store, (guard) => mismatchRecovered.store.recover({
    provenAccountPermissionId: 'account-B'
  }, guard));
  assert.equal(mismatchRecovered.future.countPartition(AX), 0,
    'account mismatch recovery purges all old-account participant influence');
  check(true, 'exact account/root replacement preserves one-visible-corpus ordering');
}

function schemaKey(schema, claim) {
  return schema.makePartitionKey(claim);
}

async function testTombstoneFirstSourceAndPartitionPurge(contracts) {
  const harness = createCorpusHarness(contracts);
  const { AX, AY, BY } = harness.fixtures.partitions;
  const source1 = harness.fixtures.SOURCE_1;
  const source2 = harness.fixtures.SOURCE_2;
  await activateCorpus(harness, AX, [source1, source2], 'checkpoint-purge');

  harness.controller.reset();
  const result = await mutate(harness.store,
    (guard) => harness.store.purgeSource(AX, source1, 'access-revoked', guard));
  assert.equal(result && result.ok, true, 'exact source purge reaches terminal completion');
  const trace = harness.controller.trace;
  const firstParticipant = trace.findIndex((entry) =>
    entry.timing === 'before' && entry.type.startsWith('participant.')
  );
  const tombstoneWrite = trace.findIndex((entry) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
    JSON.stringify(entry.detail).includes(`"sourceFileId":"${source1}"`) &&
    /"visibility":"(?:withheld|purging)"/.test(JSON.stringify(entry.detail))
  );
  assert.ok(tombstoneWrite >= 0 && firstParticipant > tombstoneWrite,
    'durable source tombstone precedes every purge participant call');

  for (const name of PURGE_PARTICIPANTS) {
    assert.ok(trace.some((entry) => entry.timing === 'before' &&
      entry.type === `participant.${name}.purgeSource`), `${name} purges exact source ownership`);
    assert.ok(trace.some((entry) => entry.timing === 'before' &&
      entry.type === `participant.${name}.hasOwnedInfluence`), `${name} proves source absence`);
  }
  const lastVerification = trace.reduce((last, entry, index) =>
    entry.timing === 'after' && entry.type.endsWith('.hasOwnedInfluence') ? index : last, -1);
  const sourceRemoval = trace.findIndex((entry) => entry.timing === 'before' &&
    entry.type === 'storage.remove' &&
    JSON.stringify(entry.detail).includes(contracts.schema.makeSourceKey({ ...AX, sourceFileId: source1 }))
  );
  const terminalWrite = trace.findIndex((entry) => entry.timing === 'before' &&
    entry.type === 'storage.set' && /"kind":"source-purge"/.test(JSON.stringify(entry.detail)) &&
    /"state":"complete"/.test(JSON.stringify(entry.detail))
  );
  assert.ok(lastVerification >= 0 && sourceRemoval > lastVerification && terminalWrite > sourceRemoval,
    'source record removal follows complete absence proof and terminal completion publishes last');
  assert.equal(harness.future.has(AX, source1), false,
    'all fake future source-owned categories are absent for the purged source');
  assert.equal(harness.future.has(AX, source2), true,
    'source purge preserves the sibling source in the same partition');
  assert.equal(harness.future.has(AY, source1), true,
    'source purge preserves the same source ID in another root');
  assert.equal(harness.future.has(BY, source1), true,
    'source purge preserves the same source ID in another account');
  assert.deepEqual(visibleSourceIds(await harness.store.getVisibleManifest(AX)), [source2],
    'visible reads omit the tombstoned source immediately');

  const duplicate = await mutate(harness.store,
    (guard) => harness.store.purgeSource(AX, source1, 'access-revoked', guard));
  assert.equal(duplicate && duplicate.ok, true, 'duplicate source purge is an idempotent no-op');

  const raw = JSON.stringify(harness.values);
  assert.doesNotMatch(raw,
    /fullText|sourceBytes|operationCertificate|permissionCertificate|rawError|credential|apiKey|Bearer|raw-error-secret|source-owned-payload/i,
    'durable records contain no bytes, text, certificates, raw errors, credentials, or participant payloads');

  harness.controller.reset();
  const partitionResult = await mutate(harness.store,
    (guard) => harness.store.purgePartition(AX, 'root-replaced', guard));
  assert.equal(partitionResult && partitionResult.ok, true,
    'partition purge reaches terminal completion after remaining sources');
  const partitionTrace = harness.controller.trace;
  const closePartition = partitionTrace.findIndex((entry) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
    /"lifecycle":"(?:withdrawn|purging)"/.test(JSON.stringify(entry.detail))
  );
  const firstPartitionParticipant = partitionTrace.findIndex((entry) =>
    entry.timing === 'before' && entry.type.includes('.purgePartition')
  );
  const terminalPartition = partitionTrace.reduce((last, entry, index) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
      /"lifecycle":"purged"/.test(JSON.stringify(entry.detail)) ? index : last, -1);
  assert.ok(closePartition >= 0 && firstPartitionParticipant > closePartition &&
    terminalPartition > firstPartitionParticipant,
  'partition withdrawal is durable before participants and terminal purge is last');
  for (const name of PURGE_PARTICIPANTS) {
    assert.ok(partitionTrace.some((entry) => entry.timing === 'before' &&
      entry.type === `participant.${name}.purgePartition`), `${name} purges partition ownership`);
  }
  assert.equal(harness.future.countPartition(AX), 0,
    'partition purge removes every category and every source in the exact partition');
  assert.equal(harness.future.countPartition(AY) > 0, true,
    'partition purge does not cross into another root');
  assert.equal(harness.future.countPartition(BY) > 0, true,
    'partition purge does not cross into another account');
  assert.equal(await harness.store.getVisibleManifest(AX), null,
    'purged partition can never become visible again');
  check(true, 'tombstone-first purge verifies all seven future participant categories absent');
}

async function testClosedInputCorruptionAndConcurrency(contracts) {
  const { schema } = contracts;
  const invalidHarness = createCorpusHarness(contracts, { register: false });
  const invalidParticipant = invalidHarness.store.registerPurgeParticipant('fragments', {
    purgeSource: async () => ({ ok: true }),
    purgePartition: async () => ({ ok: true })
  });
  assert.equal(invalidParticipant && invalidParticipant.ok, false,
    'participant registration rejects a missing absence verifier');
  const unknownParticipant = invalidHarness.store.registerPurgeParticipant('future-graph', {
    purgeSource: async () => ({ ok: true }),
    purgePartition: async () => ({ ok: true }),
    hasOwnedInfluence: async () => ({ owned: false })
  });
  assert.equal(unknownParticipant && unknownParticipant.ok, false,
    'participant registration rejects unknown future categories');
  const extraParticipant = invalidHarness.store.registerPurgeParticipant('indexes', {
    purgeSource: async () => ({ ok: true }),
    purgePartition: async () => ({ ok: true }),
    hasOwnedInfluence: async () => ({ owned: false }),
    consumerPayload: 'must-not-enter-the-registry'
  });
  assert.equal(extraParticipant && extraParticipant.ok, false,
    'participant registration rejects extra executable or consumer-owned fields');

  const harness = createCorpusHarness(contracts);
  const { AX, AY, BY } = harness.fixtures.partitions;
  const source1 = harness.fixtures.SOURCE_1;
  const source2 = harness.fixtures.SOURCE_2;
  const duplicateParticipant = harness.store.registerPurgeParticipant(
    PURGE_PARTICIPANTS[0],
    harness.future.participants.get(PURGE_PARTICIPANTS[0])
  );
  assert.equal(duplicateParticipant && duplicateParticipant.ok, false,
    'participant names are unique and cannot be replaced after registration');

  const handle = await mutate(harness.store,
    (guard) => harness.store.beginReplacement(AX, guard));
  const concurrentStages = await Promise.all([
    mutate(harness.store, (guard) => harness.store.stageSource(
      handle, harness.fixtures.sourceRecord(AX, source1), guard)),
    mutate(harness.store, (guard) => harness.store.stageSource(
      handle, harness.fixtures.sourceRecord(AX, source2), guard))
  ]);
  assert.equal(concurrentStages.every((entry) => entry && entry.ok), true,
    'same-partition concurrent mutations serialize without lost records');

  const wrongTupleRecord = harness.fixtures.sourceRecord(AY, source1);
  const wrongTuple = await mutate(harness.store,
    (guard) => harness.store.stageSource(handle, wrongTupleRecord, guard));
  assert.equal(wrongTuple && wrongTuple.ok, false,
    'record body and source key cannot substitute another root');
  const forbiddenRecord = Object.assign(
    harness.fixtures.sourceRecord(AX, 'source-forbidden'),
    {
      fullText: 'must-not-persist',
      bytes: [1, 2, 3],
      credential: 'secret',
      operationCertificate: 'replay-me'
    }
  );
  const forbidden = await mutate(harness.store,
    (guard) => harness.store.stageSource(handle, forbiddenRecord, guard));
  assert.equal(forbidden && forbidden.ok, false,
    'source bodies, bytes, credentials, and operation certificates fail closed');

  const staleHandle = Object.freeze({ ...handle, operationEpoch: handle.operationEpoch - 1 });
  const staleCheckpoint = await mutate(harness.store, (guard) => harness.store.commitInventory(
    staleHandle,
    harness.fixtures.checkpoint('checkpoint-stale', 2),
    guard
  ));
  assert.equal(staleCheckpoint && staleCheckpoint.ok, false,
    'stale operation epoch cannot publish a checkpoint or pointer');
  const missingGuard = await harness.store.commitInventory(
    handle,
    harness.fixtures.checkpoint('checkpoint-missing-guard', 2)
  );
  assert.equal(missingGuard && missingGuard.ok, false,
    'publication requires its operation-scoped signal and opaque token');
  const clonedHandle = Object.freeze({ ...handle });
  const forgedToken = await mutate(harness.store, (guard) => harness.store.commitInventory(
    clonedHandle,
    harness.fixtures.checkpoint('checkpoint-forged-token', 2),
    guard
  ));
  assert.equal(forgedToken && forgedToken.ok, false,
    'a value-equivalent handle cannot forge the store-issued operation token');
  const cancelledController = new AbortController();
  const cancelledCommit = await mutate(harness.store, (guard) => {
    cancelledController.abort('cancel-before-publication');
    return harness.store.commitInventory(
      handle,
      harness.fixtures.checkpoint('checkpoint-cancelled', 2),
      guard
    );
  }, cancelledController);
  assert.equal(cancelledCommit && cancelledCommit.ok, false,
    'an aborted operation cannot publish the active pointer');
  const committed = await mutate(harness.store, (guard) => harness.store.commitInventory(
    handle,
    harness.fixtures.checkpoint('checkpoint-concurrent', 2),
    guard
  ));
  assert.equal(committed && committed.ok, true, 'current checkpoint commits after serialized stages');

  const globalRace = createCorpusHarness(contracts);
  const [handleAX, handleAY] = await Promise.all([
    mutate(globalRace.store, (guard) => globalRace.store.beginReplacement(AX, guard)),
    mutate(globalRace.store, (guard) => globalRace.store.beginReplacement(AY, guard))
  ]);
  const staleRaceStage = await mutate(globalRace.store, (guard) => globalRace.store.stageSource(
    handleAX,
    globalRace.fixtures.sourceRecord(AX, source1),
    guard
  ));
  assert.equal(staleRaceStage && staleRaceStage.ok, false,
    'later global replacement invalidates the earlier out-of-order handle');
  await mutate(globalRace.store, (guard) => globalRace.store.stageSource(
    handleAY, globalRace.fixtures.sourceRecord(AY, source1), guard));
  await mutate(globalRace.store, (guard) => globalRace.store.commitInventory(
    handleAY,
    globalRace.fixtures.checkpoint('checkpoint-race', 1),
    guard
  ));
  assert.equal(await globalRace.store.getVisibleManifest(AX), null,
    'concurrent different-partition work cannot publish the earlier candidate');
  assert.deepEqual(visibleSourceIds(await globalRace.store.getVisibleManifest(AY)), [source1],
    'global manifest lane publishes exactly one race winner');

  assert.equal(await harness.store.getVisibleManifest({
    accountPermissionId: AX.accountPermissionId,
    corpusRootFileId: AX.corpusRootFileId,
    currentUser: true
  }), null, 'current-user and extra-field claims cannot influence visible lookup');
  assert.equal(await harness.store.getVisibleManifest(BY), null,
    'wrong account/root lookup never scans for a last corpus');

  const sourceEntry = findStoredEntry(harness.values, schema.parseSourceRecord,
    (record) => record.sourceFileId === source1);
  assert.ok(sourceEntry, 'active source record exists for corruption fixture');
  harness.values[sourceEntry[0]] = { ...clonePlain(sourceEntry[1]), sourceFileId: 'source-substituted' };
  assert.equal(await harness.store.getVisibleManifest(AX), null,
    'record/key mismatch closes visibility instead of salvaging data');
  const closedAfterSourceCorruption = findStoredEntry(harness.values, schema.parseManifest);
  assert.ok(closedAfterSourceCorruption &&
    schema.parseManifest(closedAfterSourceCorruption[1]).lifecycle !== 'active',
  'source corruption durably closes the controlling manifest');

  const corruptManifestHarness = createCorpusHarness(contracts);
  await activateCorpus(corruptManifestHarness, AX, [source1], 'checkpoint-corrupt-manifest');
  const manifestEntry = findStoredEntry(corruptManifestHarness.values, schema.parseManifest);
  assert.ok(manifestEntry, 'active manifest exists for corruption fixture');
  corruptManifestHarness.values[manifestEntry[0]] = {
    ...clonePlain(manifestEntry[1]),
    activePartitionKey: schema.makePartitionKey(AY),
    injected: 'hostile'
  };
  assert.equal(await corruptManifestHarness.store.getVisibleManifest(AX), null,
    'corrupt global manifest fails closed without fallback');
  assert.doesNotMatch(JSON.stringify(corruptManifestHarness.values),
    /must-not-persist|replay-me|source-owned-payload|raw-error-secret/,
  'hostile rejected material and raw participant failures never enter durable storage');
  check(true, 'closed tuple, corruption, stale checkpoint, and concurrency cases fail deterministically');
}

async function testAuthorityEpochBoundPublication(contracts) {
  const staleHarness = createCorpusHarness(contracts);
  const { AX } = staleHarness.fixtures.partitions;
  const sourceFileId = staleHarness.fixtures.SOURCE_1;
  const handle = await mutate(staleHarness.store,
    (guard) => staleHarness.store.beginReplacement(AX, guard));
  await mutate(staleHarness.store, (guard) => staleHarness.store.stageSource(
    handle,
    staleHarness.fixtures.sourceRecord(AX, sourceFileId),
    guard
  ));
  const authorityToken = Object.freeze({ token: 'authority-a' });
  let staleValidations = 0;
  const stale = await mutate(staleHarness.store, (guard) => staleHarness.store.commitInventory(
    handle,
    staleHarness.fixtures.checkpoint('checkpoint-stale-authority', 1),
    guard,
    authorityCommitGuard(handle, authorityToken, 17, async () => {
      staleValidations += 1;
      return false;
    })
  ));
  assert.equal(stale && stale.ok, false);
  assert.equal(staleValidations, 1,
    'authority currentness is checked immediately before the active pointer write');
  assert.equal(await staleHarness.store.getVisibleManifest(AX), null,
    'a stale authority epoch leaves the staged generation invisible');

  let forgedTokenValidations = 0;
  const forgedToken = await mutate(staleHarness.store, (guard) => staleHarness.store.commitInventory(
    handle,
    staleHarness.fixtures.checkpoint('checkpoint-forged-authority-token', 1),
    guard,
    authorityCommitGuard(handle, Object.freeze({ token: 'authority-b' }), 17, async () => {
      forgedTokenValidations += 1;
      return true;
    })
  ));
  assert.equal(forgedToken && forgedToken.ok, false);
  assert.equal(forgedTokenValidations, 0,
    'a substituted authority token is rejected before its callback can run');

  let forgedEpochValidations = 0;
  const forgedEpoch = await mutate(staleHarness.store, (guard) => staleHarness.store.commitInventory(
    handle,
    staleHarness.fixtures.checkpoint('checkpoint-forged-authority-epoch', 1),
    guard,
    authorityCommitGuard(handle, authorityToken, 18, async () => {
      forgedEpochValidations += 1;
      return true;
    })
  ));
  assert.equal(forgedEpoch && forgedEpoch.ok, false);
  assert.equal(forgedEpochValidations, 0,
    'a substituted authority epoch is rejected before its callback can run');

  const currentHarness = createCorpusHarness(contracts);
  const currentHandle = await mutate(currentHarness.store,
    (guard) => currentHarness.store.beginReplacement(AX, guard));
  await mutate(currentHarness.store, (guard) => currentHarness.store.stageSource(
    currentHandle,
    currentHarness.fixtures.sourceRecord(AX, sourceFileId),
    guard
  ));
  const current = await mutate(currentHarness.store, (guard) => currentHarness.store.commitInventory(
    currentHandle,
    currentHarness.fixtures.checkpoint('checkpoint-current-authority', 1),
    guard,
    authorityCommitGuard(
      currentHandle,
      Object.freeze({ token: 'authority-current' }),
      19,
      async () => true
    )
  ));
  assert.equal(current && current.ok, true,
    'the store-issued handle and current authority token publish exactly once');
}

async function testActivePointerAwaitWindowStaysClosed(contracts) {
  for (const mode of ['abort', 'revision-drift']) {
    const controller = createPausedActivePointerController();
    const harness = createCorpusHarness(contracts, { controller });
    const { AX } = harness.fixtures.partitions;
    const sourceFileId = harness.fixtures.SOURCE_1;
    const handle = await mutate(harness.store,
      (guard) => harness.store.beginReplacement(AX, guard));
    await mutate(harness.store, (guard) => harness.store.stageSource(
      handle, harness.fixtures.sourceRecord(AX, sourceFileId), guard));
    const operationController = new AbortController();
    let authorityCurrent = true;
    let validations = 0;
    const authorityGuard = mode === 'abort'
      ? null
      : authorityCommitGuard(
          handle,
          Object.freeze({ token: 'race-authority' }),
          23,
          async () => {
            validations += 1;
            return authorityCurrent;
          },
          operationController
        );
    const committing = runIssuedMutation(
      harness.store,
      operationController,
      (guard) => harness.store.commitInventory(
        handle,
        harness.fixtures.checkpoint(`checkpoint-pointer-race-${mode}`, 1),
        guard,
        authorityGuard
      )
    );

    await controller.applied;
    const rawDuringAwait = findStoredEntry(harness.values, contracts.schema.parseManifest);
    assert.equal(rawDuringAwait && contracts.schema.parseManifest(rawDuringAwait[1]).lifecycle, 'active',
      `${mode} fixture pauses after the active bytes are applied`);
    assert.equal(await harness.store.getVisibleManifest(AX), null,
      `${mode} keeps the in-memory visibility gate closed while the pointer write is pending`);

    if (mode === 'abort') operationController.abort('pointer-write-race');
    else authorityCurrent = false;
    controller.release();
    const committed = await committing;
    assert.equal(committed && committed.ok, false,
      `${mode} after pointer application cannot return an active commit`);
    if (mode === 'revision-drift') {
      assert.equal(validations, 2,
        'fresh authority is revalidated after the asynchronous pointer write');
    }
    const durableManifest = findStoredEntry(harness.values, contracts.schema.parseManifest);
    const parsedDurable = durableManifest && contracts.schema.parseManifest(durableManifest[1]);
    assert.ok(parsedDurable && parsedDurable.lifecycle !== 'active' &&
      parsedDurable.authorityEpoch >= handle.operationEpoch,
    `${mode} is superseded by a later durable closed epoch`);
    assert.equal(await harness.store.getVisibleManifest(AX), null,
      `${mode} leaves live reads closed`);

    const restarted = recreateStore(harness);
    const recovered = await mutate(restarted, (guard) => restarted.recover({
      provenAccountPermissionId: AX.accountPermissionId
    }, guard));
    assert.notEqual(recovered && recovered.status, 'active',
      `${mode} cannot survive fresh-worker recovery as active`);
    assert.equal(await restarted.getVisibleManifest(AX), null,
      `${mode} remains closed after recovery`);
  }
}

async function testIssuedMutationCancellationRaces(contracts) {
  async function setupActive(harness) {
    const { AX } = harness.fixtures.partitions;
    await activateCorpus(
      harness,
      AX,
      [harness.fixtures.SOURCE_1],
      'checkpoint-issued-mutation-race'
    );
  }

  async function runRace({ label, setup = setupActive, pause, timing = 'before', invoke, verify }) {
    const controller = createPausedBoundaryController();
    const harness = createCorpusHarness(contracts, { controller });
    await setup(harness);
    const durableBefore = snapshotDurable(harness.values);
    const participantsBefore = harness.future.countPartition(harness.fixtures.partitions.AX);
    const operationController = new AbortController();
    const reached = controller.pauseNext(pause, timing);
    const operation = runIssuedMutation(
      harness.store,
      operationController,
      (guard) => invoke(harness, guard)
    );
    await reached;
    operationController.abort(`cancel-${label}`);
    assert.equal(await harness.store.getVisibleManifest(harness.fixtures.partitions.AX), null,
      `${label} cancellation closes reads until terminal store acknowledgement`);
    controller.release();
    const outcome = await operation;
    assert.equal(outcome && outcome.ok, false, `${label} returns a closed cancellation result`);
    assert.deepEqual(snapshotDurable(harness.values), durableBefore,
      `${label} rolls back every durable write before acknowledging cancellation`);
    assert.equal(harness.future.countPartition(harness.fixtures.partitions.AX), participantsBefore,
      `${label} causes zero participant mutation after cancellation`);
    if (verify) await verify(harness);
  }

  await runRace({
    label: 'recover',
    pause: (type) => type === 'storage.get',
    invoke: (harness, guard) => harness.store.recover({
      provenAccountPermissionId: harness.fixtures.partitions.AX.accountPermissionId
    }, guard),
    verify: async (harness) => {
      assert.ok(await harness.store.getVisibleManifest(harness.fixtures.partitions.AX),
        'cancelled recovery preserves the prior visible corpus');
    }
  });

  await runRace({
    label: 'beginReplacement',
    pause: (type) => type === 'storage.get',
    invoke: (harness, guard) => harness.store.beginReplacement(
      harness.fixtures.partitions.AY,
      guard
    ),
    verify: async (harness) => {
      assert.ok(await harness.store.getVisibleManifest(harness.fixtures.partitions.AX),
        'cancelled replacement preserves the prior visible corpus');
      assert.equal(await harness.store.getVisibleManifest(harness.fixtures.partitions.AY), null,
        'cancelled replacement never exposes its candidate');
    }
  });

  await runRace({
    label: 'withdrawPartition-applied-write',
    pause: (type, detail) => type === 'storage.set' &&
      /"lifecycle":"closed"/.test(JSON.stringify(detail)),
    timing: 'after',
    invoke: (harness, guard) => harness.store.withdrawPartition(
      harness.fixtures.partitions.AX,
      'user-withdrawn',
      guard
    ),
    verify: async (harness) => {
      assert.ok(await harness.store.getVisibleManifest(harness.fixtures.partitions.AX),
        'cancelled withdrawal repairs an already-applied control write');
    }
  });

  await runRace({
    label: 'stageSource',
    setup: async (harness) => {
      const operationController = new AbortController();
      harness.stagingHandle = await runIssuedMutation(
        harness.store,
        operationController,
        (guard) => harness.store.beginReplacement(harness.fixtures.partitions.AY, guard)
      );
    },
    pause: (type) => type === 'storage.remove',
    invoke: (harness, guard) => harness.store.stageSource(
      harness.stagingHandle,
      harness.fixtures.sourceRecord(
        harness.fixtures.partitions.AY,
        harness.fixtures.SOURCE_1
      ),
      guard
    )
  });

  await runRace({
    label: 'purgeSource',
    pause: (type) => type === 'storage.get',
    invoke: (harness, guard) => harness.store.purgeSource(
      harness.fixtures.partitions.AX,
      harness.fixtures.SOURCE_1,
      'access-revoked',
      guard
    )
  });

  await runRace({
    label: 'purgePartition',
    pause: (type) => type === 'storage.get',
    invoke: (harness, guard) => harness.store.purgePartition(
      harness.fixtures.partitions.AX,
      'root-replaced',
      guard
    )
  });

  await runRace({
    label: 'participant-callback',
    pause: (type) => type === `participant.${PURGE_PARTICIPANTS[0]}.purgeSource`,
    invoke: (harness, guard) => harness.store.purgeSource(
      harness.fixtures.partitions.AX,
      harness.fixtures.SOURCE_1,
      'access-revoked',
      guard
    ),
    verify: async (harness) => {
      assert.ok(harness.future.observedGuards.some((guard) =>
        guard && guard.signal && guard.signal.aborted === true &&
        guard.operationToken && Number.isSafeInteger(guard.operationEpoch)),
      'participant callback receives the exact aborted opaque operation guard');
    }
  });

  check(true,
    'issued store mutation guards fence recover, replacement, withdrawal, staging, purge, and participants');
}

async function testControllerTimeoutHoldsMutationLane(contracts) {
  const storageController = createPausedBoundaryController();
  const harness = createCorpusHarness(contracts, { controller: storageController });
  const { AX, AY } = harness.fixtures.partitions;
  await activateCorpus(harness, AX, [harness.fixtures.SOURCE_1], 'checkpoint-controller-timeout');
  const durableBefore = snapshotDurable(harness.values);
  const participantCountBefore = harness.future.countPartition(AX);
  const live = {
    tabId: 54,
    origin: 'https://drive.google.com',
    generation: 1,
    profileId: 'phase-54-controller-race',
    profileVersion: 1,
    contextEpoch: 1,
    contextKind: 'drive-folder',
    entityKind: 'drive-folder',
    entityId: AY.corpusRootFileId
  };
  const transport = {
    async about() {
      return { kind: 'ok', value: { permissionId: AY.accountPermissionId } };
    },
    async getFile(input) {
      return {
        kind: 'ok',
        value: {
          id: input.fileId,
          name: 'Replacement root',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [],
          trashed: false,
          capabilities: { canListChildren: true, canDownload: false },
          shortcutDetails: null
        }
      };
    }
  };
  const parentController = new AbortController();
  const controller = contracts.corpusController.create({
    store: harness.store,
    transport,
    readLiveContext: async () => ({ ...live }),
    now: () => Date.now(),
    signal: parentController.signal,
    limits: { maxOperationMs: 30 }
  });
  assert.ok(controller, 'real controller accepts the issued-mutation store contract');

  const reached = storageController.pauseNext((type, detail) =>
    type === 'storage.set' && /"lifecycle":"closed"/.test(JSON.stringify(detail)), 'after');
  const enrollment = controller.enroll({ folderFileId: AY.corpusRootFileId });
  await reached;
  const publicResult = await settleWithin(enrollment, 120);
  assert.equal(publicResult.settled, true,
    'controller timeout returns its public fail-quiet result within the configured bound');
  assert.deepEqual(publicResult.value, { ok: false, status: 'fail-quiet' });
  assert.equal(await harness.store.getVisibleManifest(AX), null,
    'timed-out applied withdrawal remains read-fenced while cancellation is not terminal');

  const queuedStatus = controller.getRootStatus({ folderFileId: AY.corpusRootFileId });
  const premature = await settleWithin(queuedStatus, 15);
  assert.equal(premature.settled, false,
    'controller does not release its mutation lane before terminal store cancellation');
  storageController.release();
  const resumed = await settleWithin(queuedStatus, 250);
  assert.equal(resumed.settled, true,
    'the queued controller mutation resumes after terminal rollback acknowledgement');
  assert.deepEqual(snapshotDurable(harness.values), durableBefore,
    'the timed-out applied withdrawal leaves zero late durable mutation after lane release');
  assert.equal(harness.future.countPartition(AX), participantCountBefore,
    'the timed-out controller path leaves zero late participant mutation');
  assert.ok(await harness.store.getVisibleManifest(AX),
    'terminal rollback restores the exact prior visible corpus');
  parentController.abort('test-complete');
  check(true, 'controller bounds public completion while holding its mutation lane through rollback');
}

async function testStrictParticipantFailureAndDurableRecovery(contracts) {
  const malformedHarness = createCorpusHarness(contracts, { register: false });
  const { AX } = malformedHarness.fixtures.partitions;
  const source1 = malformedHarness.fixtures.SOURCE_1;
  const malformedName = PURGE_PARTICIPANTS[0];
  const goodParticipant = malformedHarness.future.participants.get(malformedName);
  const malformedParticipant = Object.freeze({
    async purgeSource(request, operationGuard) {
      await goodParticipant.purgeSource(request, operationGuard);
      return { ok: true, extra: 'participant-payload-must-not-be-trusted' };
    },
    purgePartition: goodParticipant.purgePartition,
    hasOwnedInfluence: goodParticipant.hasOwnedInfluence
  });
  assert.equal(
    malformedHarness.store.registerPurgeParticipant(malformedName, malformedParticipant).ok,
    true,
    'exact malformed-result fixture registers as an in-memory adapter'
  );
  for (const name of PURGE_PARTICIPANTS.slice(1)) {
    assert.equal(
      malformedHarness.store.registerPurgeParticipant(
        name,
        malformedHarness.future.participants.get(name)
      ).ok,
      true,
      `${name} strict-result recovery participant registers`
    );
  }

  await activateCorpus(malformedHarness, AX, [source1], 'checkpoint-malformed-participant');
  const pending = await mutate(malformedHarness.store, (guard) =>
    malformedHarness.store.purgeSource(AX, source1, 'access-revoked', guard));
  assert.equal(pending && pending.status, 'recovery-pending',
    'extra participant result fields fail closed with typed recovery pending');
  const durableTombstone = findStoredEntry(
    malformedHarness.values,
    contracts.schema.parseSourceRecord,
    (record) => record.sourceFileId === source1 && record.visibility === 'purging'
  );
  assert.ok(durableTombstone,
    'malformed participant output leaves the exact durable tombstone in place');
  assert.deepEqual(visibleSourceIds(await malformedHarness.store.getVisibleManifest(AX)), [],
    'a pending participant failure cannot resurface its tombstoned source');
  assert.doesNotMatch(JSON.stringify(malformedHarness.values),
    /participant-payload-must-not-be-trusted|must-not-enter-the-registry/,
    'participant adapter fields and malformed results never enter durable storage');

  const resumed = recreateStore(malformedHarness);
  const resumedResult = await mutate(resumed, (guard) => resumed.recover({
    provenAccountPermissionId: AX.accountPermissionId
  }, guard));
  assert.ok(resumedResult && resumedResult.status !== 'recovery-pending',
    'fresh-worker recovery resumes the bounded participant journal');
  assert.equal(malformedHarness.future.has(AX, source1), false,
    'strict participant retry verifies all source-owned influence absent');

  const staleCheckpointHarness = createCorpusHarness(contracts);
  await activateCorpus(staleCheckpointHarness, AX, [source1], 'checkpoint-durable-stale');
  const checkpointEntry = Object.entries(staleCheckpointHarness.values).find(([, value]) =>
    value && value.version === CHECKPOINT_VERSION && value.kind === 'inventory-complete'
  );
  assert.ok(checkpointEntry, 'durable checkpoint exists for restart corruption fixture');
  staleCheckpointHarness.values[checkpointEntry[0]] = {
    ...clonePlain(checkpointEntry[1]),
    operationEpoch: checkpointEntry[1].operationEpoch + 1
  };
  const staleRestart = recreateStore(staleCheckpointHarness);
  const staleRecovery = await mutate(staleRestart, (guard) => staleRestart.recover({
    provenAccountPermissionId: AX.accountPermissionId
  }, guard));
  assert.ok(staleRecovery && staleRecovery.status !== 'active',
    'restart recovery reparses and closes a stale durable checkpoint before reporting active');
  assert.equal(await staleRestart.getVisibleManifest(AX), null,
    'stale durable checkpoint cannot retain or restore corpus visibility');
  check(true, 'strict participant results and durable checkpoint recovery fail closed');
}

function recreateStore(harness) {
  const store = harness.corpusStore.create({
    storageArea: harness.storageArea,
    schema: harness.schema,
    now: () => 1700000000000
  });
  registerParticipants(store, harness.future);
  return store;
}

function seededOrder(count, seed) {
  const values = Array.from({ length: count }, (_, index) => index + 1);
  let state = seed >>> 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
  return values;
}

async function callWithoutUnhandledRejection(work) {
  try {
    return await work();
  } catch (error) {
    return { ok: false, status: 'recovery-pending', caught: String(error && error.message) };
  }
}

async function measurePurgeBoundaryCount(contracts) {
  const harness = createCorpusHarness(contracts);
  const { AX } = harness.fixtures.partitions;
  await activateCorpus(harness, AX, [harness.fixtures.SOURCE_1, harness.fixtures.SOURCE_2],
    'checkpoint-purge-baseline');
  harness.controller.reset();
  await mutate(harness.store, (guard) => harness.store.purgeSource(
    AX, harness.fixtures.SOURCE_1, 'access-revoked', guard));
  return harness.controller.callCount();
}

async function runPurgeFailureCase(contracts, failure) {
  const harness = createCorpusHarness(contracts);
  const { AX } = harness.fixtures.partitions;
  const source1 = harness.fixtures.SOURCE_1;
  const source2 = harness.fixtures.SOURCE_2;
  await activateCorpus(harness, AX, [source1, source2], 'checkpoint-purge-failure');
  harness.controller.reset();
  harness.controller.arm(failure);
  await callWithoutUnhandledRejection(() => mutate(harness.store, (guard) =>
    harness.store.purgeSource(AX, source1, 'access-revoked', guard)));
  harness.controller.clear();

  const restarted = recreateStore(harness);
  await callWithoutUnhandledRejection(() => mutate(restarted, (guard) => restarted.recover({
    provenAccountPermissionId: AX.accountPermissionId
  }, guard)));
  await callWithoutUnhandledRejection(() => mutate(restarted, (guard) =>
    restarted.purgeSource(AX, source1, 'access-revoked', guard)));
  await callWithoutUnhandledRejection(() => mutate(restarted, (guard) => restarted.recover({
    provenAccountPermissionId: AX.accountPermissionId
  }, guard)));

  assert.equal(harness.future.has(AX, source1), false,
    `${failure.kind} ${failure.timing} boundary ${failure.call} converges source purge`);
  assert.equal(harness.future.has(AX, source2), true,
    `${failure.kind} ${failure.timing} boundary ${failure.call} preserves sibling source`);
  const visible = await restarted.getVisibleManifest(AX);
  assert.equal(visibleSourceIds(visible).includes(source1), false,
    `${failure.kind} ${failure.timing} boundary ${failure.call} never resurfaces tombstoned source`);
  assert.doesNotMatch(JSON.stringify(harness.values), /raw-error-secret|source-owned-payload/,
    `${failure.kind} ${failure.timing} boundary ${failure.call} persists no raw failure or participant payload`);
}

async function attemptReplacement(harness, store) {
  const { AX, AY } = harness.fixtures.partitions;
  const source1 = harness.fixtures.SOURCE_1;
  const visible = await callWithoutUnhandledRejection(() => store.getVisibleManifest(AY));
  if (visible && visible.partitionKey === harness.schema.makePartitionKey(AY)) return true;
  const handle = await callWithoutUnhandledRejection(() => mutate(store,
    (guard) => store.beginReplacement(AY, guard)));
  if (!handle || !Number.isSafeInteger(handle.operationEpoch)) return false;
  const purged = await callWithoutUnhandledRejection(() => mutate(store,
    (guard) => store.purgePartition(AX, 'root-replaced', guard)));
  if (!purged || purged.ok !== true) return false;
  const staged = await callWithoutUnhandledRejection(() => mutate(store, (guard) => store.stageSource(
    handle,
    harness.fixtures.sourceRecord(AY, source1),
    guard
  )));
  if (!staged || staged.ok !== true) return false;
  const committed = await callWithoutUnhandledRejection(() => mutate(store, (guard) => store.commitInventory(
    handle,
    harness.fixtures.checkpoint('checkpoint-replacement-failure', 1),
    guard
  )));
  return !!(committed && committed.ok);
}

async function ensureReplacementConverges(harness, store) {
  const { AX, AY } = harness.fixtures.partitions;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const visible = await callWithoutUnhandledRejection(() => store.getVisibleManifest(AY));
    if (visible && visible.partitionKey === harness.schema.makePartitionKey(AY)) return visible;
    await callWithoutUnhandledRejection(() => mutate(store, (guard) => store.recover({
      provenAccountPermissionId: AX.accountPermissionId
    }, guard)));
    if (await attemptReplacement(harness, store)) {
      const committed = await store.getVisibleManifest(AY);
      if (committed) return committed;
    }
  }
  return null;
}

async function measureReplacementBoundaryCount(contracts) {
  const harness = createCorpusHarness(contracts);
  const { AX } = harness.fixtures.partitions;
  await activateCorpus(harness, AX, [harness.fixtures.SOURCE_1, harness.fixtures.SOURCE_2],
    'checkpoint-replacement-baseline');
  harness.controller.reset();
  assert.equal(await attemptReplacement(harness, harness.store), true,
    'baseline replacement operation succeeds before failure injection');
  return harness.controller.callCount();
}

async function runReplacementFailureCase(contracts, failure) {
  const harness = createCorpusHarness(contracts);
  const { AX, AY } = harness.fixtures.partitions;
  await activateCorpus(harness, AX, [harness.fixtures.SOURCE_1, harness.fixtures.SOURCE_2],
    'checkpoint-replacement-failure-base');
  harness.controller.reset();
  harness.controller.arm(failure);
  await callWithoutUnhandledRejection(() => attemptReplacement(harness, harness.store));
  harness.controller.clear();

  const restarted = recreateStore(harness);
  const visible = await ensureReplacementConverges(harness, restarted);
  assert.ok(visible, `${failure.kind} ${failure.timing} replacement boundary ${failure.call} converges`);
  assert.equal(await restarted.getVisibleManifest(AX), null,
    `${failure.kind} ${failure.timing} replacement boundary ${failure.call} keeps old root closed`);
  assert.deepEqual(visibleSourceIds(visible), [harness.fixtures.SOURCE_1],
    `${failure.kind} ${failure.timing} replacement boundary ${failure.call} publishes one complete candidate`);
  assert.equal(harness.future.countPartition(AX), 0,
    `${failure.kind} ${failure.timing} replacement boundary ${failure.call} purges every old participant`);
}

async function testFailureInjectedRestartRecovery(contracts) {
  const purgeBoundaries = await measurePurgeBoundaryCount(contracts);
  assert.ok(purgeBoundaries > PURGE_PARTICIPANTS.length * 2,
    'source purge trace covers storage plus every purge/verification participant await');
  for (const call of seededOrder(purgeBoundaries, 0x5403a11)) {
    for (const timing of ['before', 'after']) {
      const kind = (call + (timing === 'after' ? 1 : 0)) % 2 === 0
        ? 'quota-rejection'
        : 'worker-loss';
      await runPurgeFailureCase(contracts, { call, timing, kind });
    }
  }

  const replacementBoundaries = await measureReplacementBoundaryCount(contracts);
  assert.ok(replacementBoundaries > purgeBoundaries,
    'replacement trace includes withdraw, source/partition purge, checkpoint, and pointer awaits');
  for (const call of seededOrder(replacementBoundaries, 0x5403b22)) {
    for (const timing of ['before', 'after']) {
      const kind = (call + (timing === 'after' ? 1 : 0)) % 2 === 0
        ? 'worker-loss'
        : 'quota-rejection';
      await runReplacementFailureCase(contracts, { call, timing, kind });
    }
  }

  check(true,
    `failure matrix recovered before/after ${purgeBoundaries} purge and ${replacementBoundaries} replacement awaits`);
}

async function runCorpusStoreContract() {
  console.log('\n--- Phase 54 Plan 03: exact corpus store and MV3 recovery ---');
  const contracts = loadCorpusContracts();
  await testCorpusStoreSurfaceAndClosedInitialization(contracts);
  await testExactReplacementAndIdentityClosure(contracts);
  await testMetadataMinimizedHiddenSourceStates(contracts);
  await testProcessedInvalidationRetainsPendingState(contracts);
  await testTombstoneFirstSourceAndPartitionPurge(contracts);
  await testClosedInputCorruptionAndConcurrency(contracts);
  await testParticipantAuthorizationBridge(contracts);
  await testAuthorityEpochBoundPublication(contracts);
  await testActivePointerAwaitWindowStaysClosed(contracts);
  await testIssuedMutationCancellationRaces(contracts);
  await testControllerTimeoutHoldsMutationLane(contracts);
  await testStrictParticipantFailureAndDurableRecovery(contracts);
  await testFailureInjectedRestartRecovery(contracts);
}

async function run() {
  console.log('--- Phase 54 Plan 02: trusted-local boot ordering ---');
  const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
  const actionsSource = fs.readFileSync(ACTIONS_PATH, 'utf8');

  const boot = await runBootBlock(backgroundSource);
  check(!boot.missing, 'background exposes the marked trusted-local boot oracle');
  if (!boot.missing) {
    check(boot.fake.accessCount() === 1, 'setAccessLevel is called exactly once');
    check(JSON.stringify(boot.events[0]) === JSON.stringify({
      type: 'setAccessLevel',
      value: { accessLevel: 'TRUSTED_CONTEXTS' }
    }), 'the first trusted-local event is exact TRUSTED_CONTEXTS setup');
    const accessIndex = boot.events.findIndex((event) => event.type === 'setAccessLevel');
    const storeIndex = boot.events.findIndex((event) => event.type === 'featureStoreCreate');
    const corpusIndex = boot.events.findIndex((event) => event.type === 'corpusBoot');
    check(accessIndex >= 0 && storeIndex > accessIndex && corpusIndex > storeIndex,
      'TRUSTED_CONTEXTS precedes trusted feature and supplied corpus boot sentinels');

    await boot.context.initializeFsbTrustedLocalBoundary();
    check(boot.fake.accessCount() === 1, 'trusted-local initializer is idempotent');
  }

  for (const variant of [{ rejectAccessLevel: true }, { missingAccessLevel: true }]) {
    const closed = await runBootBlock(backgroundSource, variant);
    check(!closed.missing, 'closed boot variant can execute the production boundary block');
    if (!closed.missing) {
      check(!closed.events.some((event) => event.type === 'featureStoreCreate' || event.type === 'corpusBoot'),
        'rejected or missing access-level support leaves feature/corpus boot closed');
    }
  }

  console.log('\n--- background-only fixed feature store ---');
  check(fs.existsSync(STORE_PATH), 'trusted-local-feature-store.js exists');
  let api = null;
  if (fs.existsSync(STORE_PATH)) {
    delete require.cache[require.resolve(STORE_PATH)];
    api = require(STORE_PATH);
    check(globalThis.FsbTrustedLocalFeatureStore === api,
      'classic global and CommonJS FsbTrustedLocalFeatureStore exports match');
    const expectedApi = ['LIMITS', 'MESSAGE', 'create'];
    check(JSON.stringify(Object.keys(api).sort()) === JSON.stringify(expectedApi.sort()),
      'trusted store exposes only limits, fixed message vocabulary, and create');
    check(Object.isFrozen(api) && Object.isFrozen(api.MESSAGE) && Object.isFrozen(api.LIMITS),
      'trusted feature-store public contract is frozen');
    check(api.LIMITS.SESSION_COUNT === 100 && api.LIMITS.SESSION_COUNT_PER_MODE === 50 &&
          api.LIMITS.AUTOMATION_LOG_ENTRIES === 400,
    'trusted store exposes the merged 50-per-mode session and 400-log bounds');
    check(api.MESSAGE.AUTOMATION_SESSION_UPDATE_OUTCOME === 'fsb:automation-session-update-outcome' &&
          api.MESSAGE.AUTOMATION_SESSION_PRUNE_MCP === 'fsb:automation-session-prune-mcp',
    'trusted store exposes fixed outcome-update and MCP-prune actions');
    const trustedRouterStart = backgroundSource.indexOf('function fsbHandlesTrustedFeatureAction(action) {');
    const trustedRouterEnd = backgroundSource.indexOf(
      '\n}\n\nfunction fsbDispatchTrustedFeatureMessage',
      trustedRouterStart
    );
    const trustedRouter = trustedRouterStart >= 0 && trustedRouterEnd > trustedRouterStart
      ? backgroundSource.slice(trustedRouterStart, trustedRouterEnd)
      : '';
    check(trustedRouter.includes('vocabulary.AUTOMATION_SESSION_UPDATE_OUTCOME') &&
          trustedRouter.includes('vocabulary.AUTOMATION_SESSION_PRUNE_MCP'),
    'background routes fixed outcome-update and MCP-prune actions to the trusted store');
  }

  if (api) {
    const bridgeSecret = 'fsb-auth.' + 'C'.repeat(43);
    const bridgeSecretInterior = 'C'.repeat(16);
    const fake = createFakeStorage({
      elementCacheSize: 321,
      captchaSolverEnabled: true,
      captchaApiKey: 'super-secret-captcha-key'
    });
    const store = api.create({ chrome: fake.chrome, now: () => 1700000000000 });
    await store.ready();

    await store.appendDiagnosticEntry({
      ts: 1,
      level: 'warn',
      prefix: `DOM ${bridgeSecret}`,
      category: 'host-error',
      message: 'token sk_' + `live_abcdefghijklmnopqrstuvwxyz ${bridgeSecret} raw remote error`,
      redactedContext: {
        origin: 'https://example.test',
        statusCode: 500,
        kind: `bridge-${bridgeSecret}`
      },
      rawError: 'must-not-persist',
      fullText: 'must-not-persist',
      accountPermissionId: 'permission-id-must-not-persist'
    });
    const diagnostics = await store.getDiagnosticEntries({ clear: false });
    const diagnosticJson = JSON.stringify(diagnostics);
    check(diagnostics.entries.length === 1, 'diagnostic append persists one bounded record');
    check(!/sk_live_|must-not-persist|permission-id/i.test(diagnosticJson),
      'diagnostic persistence redacts secrets, raw errors, permission IDs, and source text');
    check(!diagnosticJson.includes(bridgeSecret) && !diagnosticJson.includes(bridgeSecretInterior) &&
          diagnosticJson.includes('[REDACTED_FSB_BRIDGE_SECRET]'),
    'diagnostic persistence privately scrubs bridge credentials without load-order dependence');
    check(Buffer.byteLength(diagnosticJson) <= api.LIMITS.DIAGNOSTIC_RESPONSE_BYTES,
      'diagnostic response is byte-bounded');

    await store.appendAutomationLogs([{
      timestamp: new Date(0).toISOString(),
      level: 'warn',
      message: `provider failed with Bearer abcdefghijklmnopqrstuvwxyz ${bridgeSecret}`,
      data: {
        logType: 'comm',
        provider: `bridge-${bridgeSecret}`,
        statusCode: 403,
        rawResponse: 'full provider response',
        systemPrompt: 'full source text',
        apiKey: 'secret'
      }
    }]);
    const automation = await store.loadAutomationLogs();
    const automationJson = JSON.stringify(automation);
    check(automation.logs.length === 1, 'automation log append/load round-trips one fixed record');
    check(!/Bearer|full provider response|full source text|"apiKey"|:"secret"/i.test(automationJson),
      'automation persistence is redacted and metadata-only');
    check(!automationJson.includes(bridgeSecret) && !automationJson.includes(bridgeSecretInterior) &&
          automationJson.includes('[REDACTED_FSB_BRIDGE_SECRET]'),
    'automation persistence privately scrubs bridge credentials');

    fake.values.fsbSessionIndex = [{
      id: '__proto__',
      task: 'reserved record must not cross the bridge',
      injected: 'must-not-project'
    }, {
      id: 'safe-session',
      task: 'api_key=super-secret-value',
      status: 'completed',
      startTime: 1,
      endTime: 2,
      commands: Array(25).fill('x'.repeat(4096)),
      injected: 'must-not-project'
    }].concat(Array.from({ length: api.LIMITS.SESSION_COUNT - 2 }, (_, index) => ({
      id: `oversized-${index}`,
      task: 'y'.repeat(4096),
      status: 'completed',
      startTime: index + 3,
      endTime: index + 4,
      commands: Array(25).fill('z'.repeat(4096)),
      outcomeDetails: {
        summary: 's'.repeat(4096),
        blocker: 'b'.repeat(4096),
        nextStep: 'n'.repeat(4096)
      }
    })));
    const listedSessions = await store.listAutomationSessions();
    const listedJson = JSON.stringify(listedSessions);
    check(listedSessions.sessions.some((entry) => entry.id === 'safe-session'),
      'session list retains valid sanitized legacy index entries');
    check(!listedSessions.sessions.some((entry) => entry.id === '__proto__'),
      'session list rejects prototype-reserved legacy IDs');
    check(!/must-not-project|super-secret-value|api_key/i.test(listedJson),
      'session list strips arbitrary fields and redacts legacy index text');
    check(Buffer.byteLength(listedJson) <= api.LIMITS.SESSION_RESPONSE_BYTES,
      'session list response is capped after sanitization');

    check((await store.getElementCacheConfig()).elementCacheSize === 321,
      'element-cache configuration is parsed and clamped by the trusted store');
    const captcha = await store.getCaptchaSettings();
    check(captcha.enabled === true && captcha.apiKey === 'super-secret-captcha-key',
      'CAPTCHA key remains obtainable only through the background-owned store');

    const messageHandler = store.createMessageHandler();
    const validSender = { id: fake.chrome.runtime.id, tab: { id: 7, url: 'https://example.test/page' } };
    const forgedSenders = [
      { id: 'foreign-extension', tab: { id: 7, url: 'https://example.test/page' } },
      { id: fake.chrome.runtime.id },
      { id: fake.chrome.runtime.id, tab: { id: 0, url: 'https://example.test/page' } }
    ];
    for (const sender of forgedSenders) {
      const response = await invokeMessage(messageHandler, {
        action: api.MESSAGE.ELEMENT_CACHE_GET
      }, sender);
      check(response && response.ok === false && response.code === 'UNAUTHORIZED_SENDER',
        'fixed feature bridge rejects forged or tabless sender authority');
    }

    const validConfig = await invokeMessage(messageHandler, {
      action: api.MESSAGE.ELEMENT_CACHE_GET
    }, validSender);
    check(validConfig && validConfig.ok === true && validConfig.elementCacheSize === 321,
      'valid content sender receives only bounded element-cache configuration');

    const NOW = 1700000000000;
    const DAY = 24 * 60 * 60 * 1000;
    fake.values.fsbSessionLogs = {
      'bridge-session': {
        id: 'bridge-session', task: 'Bridge session', mode: 'mcp-agent',
        startTime: NOW - DAY, endTime: NOW, status: 'completed', outcome: 'success'
      },
      'expired-mcp': {
        id: 'expired-mcp', task: 'Expired MCP', mode: 'mcp-agent',
        startTime: NOW - 32 * DAY, endTime: NOW - 31 * DAY, status: 'completed'
      },
      'ancient-autopilot': {
        id: 'ancient-autopilot', task: 'Ancient Autopilot', mode: 'autopilot',
        startTime: NOW - 401 * DAY, endTime: NOW - 400 * DAY, status: 'completed'
      }
    };
    fake.values.fsbSessionIndex = Object.values(fake.values.fsbSessionLogs).map((entry) => ({ ...entry }));
    fake.values.fsbDOMSnapshots = {
      'expired-mcp': [{ url: 'https://example.test/private', timestamp: 1 }],
      'ancient-autopilot': [{ url: 'https://example.test/keep', timestamp: 2 }]
    };
    fake.values.automationLogs = [{
      timestamp: new Date(0).toISOString(), level: 'info', message: 'expired',
      data: { sessionId: 'expired-mcp' }
    }, {
      timestamp: new Date(0).toISOString(), level: 'info', message: 'keep',
      data: { sessionId: 'ancient-autopilot' }
    }];

    const outcomePayload = {
      status: 'failed',
      outcome: 'failure',
      reason: 'missing-data',
      summary: '',
      result: '',
      completionMessage: '',
      error: `failure-${bridgeSecret}`,
      blocker: '',
      nextStep: ''
    };
    const updatedOutcome = await invokeMessage(messageHandler, {
      action: api.MESSAGE.AUTOMATION_SESSION_UPDATE_OUTCOME,
      sessionId: 'bridge-session',
      outcome: outcomePayload
    }, validSender);
    check(updatedOutcome && updatedOutcome.ok === true &&
          fake.values.fsbSessionLogs['bridge-session'].status === 'failed' &&
          !JSON.stringify(fake.values.fsbSessionLogs['bridge-session']).includes(bridgeSecret),
    'fixed outcome bridge updates through the trusted store and scrubs its error');

    const prunedMcp = await invokeMessage(messageHandler, {
      action: api.MESSAGE.AUTOMATION_SESSION_PRUNE_MCP,
      retentionDays: 30
    }, validSender);
    check(prunedMcp && prunedMcp.ok === true && prunedMcp.ids.includes('expired-mcp') &&
          !fake.values.fsbSessionLogs['expired-mcp'] &&
          !!fake.values.fsbSessionLogs['ancient-autopilot'],
    'fixed prune bridge removes only expired MCP artifacts and preserves Autopilot history');

    const hostileMessages = [
      { action: api.MESSAGE.ELEMENT_CACHE_GET, tabId: 99 },
      { action: api.MESSAGE.ELEMENT_CACHE_GET, pageUrl: 'https://forged.test/' },
      { action: api.MESSAGE.DIAGNOSTIC_APPEND, key: 'skopeo:corpus', value: 'leak' },
      {
        action: api.MESSAGE.AUTOMATION_SESSION_UPDATE_OUTCOME,
        sessionId: 'bridge-session',
        outcome: outcomePayload,
        key: 'skopeo:corpus'
      },
      {
        action: api.MESSAGE.AUTOMATION_SESSION_PRUNE_MCP,
        retentionDays: 30,
        operation: 'remove'
      },
      { action: 'storageGet', key: 'skopeo:corpus' },
      { action: 'storageSet', key: 'skopeo:corpus', value: {} },
      { action: 'unknownOperation', operation: 'get', keys: ['skopeo:corpus'] }
    ];
    for (const message of hostileMessages) {
      const response = await invokeMessage(messageHandler, message, validSender);
      check(response && response.ok === false,
        'fixed bridge rejects extra authority fields and every generic key/value operation');
    }

    const oversized = await invokeMessage(messageHandler, {
      action: api.MESSAGE.DIAGNOSTIC_APPEND,
      entry: {
        ts: 1,
        level: 'warn',
        prefix: 'DOM',
        category: 'oversized',
        message: 'x'.repeat(api.LIMITS.DIAGNOSTIC_MESSAGE_CHARS + 1),
        redactedContext: {}
      }
    }, validSender);
    check(oversized && oversized.ok === false && oversized.code === 'INVALID_MESSAGE',
      'over-limit diagnostic records fail without storage mutation');
  }

  console.log('\n--- injected storage and CAPTCHA secret boundary ---');
  const directPattern = /chrome\s*\.\s*storage\s*(?:\.\s*local|\[\s*['"]local['"]\s*\])|chrome\s*\.\s*storage\s*\.\s*onChanged/;
  for (const relativePath of PINNED_STORAGE_FREE) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    check(!directPattern.test(source), `${relativePath} has zero direct local calls/listeners on every branch`);
  }

  const captchaAction = actionsSource.slice(
    actionsSource.indexOf('solveCaptcha: async'),
    actionsSource.indexOf('// Navigate to a URL', actionsSource.indexOf('solveCaptcha: async'))
  );
  check(!/\bapiKey\b|\bpageUrl\b|captchaApiKey|storage/.test(captchaAction),
    'solveCaptcha content sends only type/sitekey and never reads/sends apiKey or pageUrl');

  const captchaBlock = extractMarkedBlock(
    backgroundSource,
    '/* FSB_CAPTCHA_TRUSTED_HANDLER_START */',
    '/* FSB_CAPTCHA_TRUSTED_HANDLER_END */'
  );
  check(!!captchaBlock, 'background exposes a marked production CAPTCHA handler oracle');
  if (captchaBlock) {
    check(/sender\.tab\.url/.test(captchaBlock) && /getCaptchaSettings/.test(captchaBlock),
      'background derives page URL from sender and reads CAPTCHA settings trusted-only');
    check(/hasExactOwnKeys/.test(captchaBlock) && /\['action', 'captchaType', 'sitekey'\]/.test(captchaBlock),
      'background solveCaptcha accepts the exact secret-free message shape');
    check(!/request\.(?:apiKey|pageUrl|tabId)/.test(captchaBlock),
      'background never consumes content-provided CAPTCHA key, URL, or tab');
  }

  console.log('\n--- static boundary gate ---');
  const verifier = await import(path.join(ROOT, 'scripts/verify-skopeo-storage-boundary.mjs'));
  const staticResult = verifier.verifyStorageBoundary({ root: ROOT });
  check(staticResult.ok, `static storage boundary gate passes (${staticResult.errors.join(' | ')})`);
  check(staticResult.injectedFiles.some((file) => file.includes('canvas-interceptor.js')),
    'static gate includes manifest content scripts');
  check(staticResult.injectedFiles.some((file) => file.includes('content/actions.js')),
    'static gate resolves CONTENT_SCRIPT_FILES');
  check(staticResult.injectedFiles.some((file) => file.includes('content/skopeo-runtime.js')),
    'static gate resolves SKOPEO_INJECTION_FILES');

  console.log('\n--- static mutation fixtures ---');
  const domStateSource = fs.readFileSync(path.join(ROOT, 'extension/content/dom-state.js'), 'utf8');
  const diagnosticsSource = fs.readFileSync(path.join(ROOT, 'extension/utils/diagnostics-ring-buffer.js'), 'utf8');

  function checkMutation(label, sourceOverrides, expectedDiagnostic) {
    const result = verifier.verifyStorageBoundary({ root: ROOT, sourceOverrides });
    const matched = result.errors.some((error) => expectedDiagnostic.test(error));
    check(!result.ok && matched, `${label} mutation fails closed with a path:line diagnostic`);
  }

  checkMutation('direct local get', {
    'extension/content/dom-state.js': `${domStateSource}\nchrome.storage.local.get('mutated');\n`
  }, /dom-state\.js:\d+: direct storage\.local/);

  checkMutation('bracket local access', {
    'extension/content/dom-state.js': `${domStateSource}\nchrome.storage['local'].set({ mutated: true });\n`
  }, /dom-state\.js:\d+: direct storage\.local/);

  checkMutation('storage alias', {
    'extension/content/dom-state.js': `${domStateSource}\nconst featureArea = chrome.storage;\nconst localFeature = featureArea.local;\nlocalFeature.get('mutated');\n`
  }, /dom-state\.js:\d+: (?:aliased|captured) (?:storage\.local|local-storage)/);

  checkMutation('destructured local alias', {
    'extension/content/dom-state.js': `${domStateSource}\nconst { local: localFeature } = chrome.storage;\nlocalFeature.remove('mutated');\n`
  }, /dom-state\.js:\d+: (?:aliased|captured) local-storage/);

  checkMutation('dead content branch', {
    'extension/content/dom-state.js': `${domStateSource}\nif (false && typeof window !== 'undefined') { browser['storage']['local'].clear(); }\n`
  }, /dom-state\.js:\d+: direct storage\.local/);

  checkMutation('change listener', {
    'extension/content/dom-state.js': `${domStateSource}\nchrome.storage.onChanged.addListener(function() {});\n`
  }, /dom-state\.js:\d+: storage\.onChanged listener/);

  checkMutation('trusted store injected dependency', {
    'extension/utils/diagnostics-ring-buffer.js': `${diagnosticsSource}\nimportScripts('utils/trusted-local-feature-store.js');\n`
  }, /trusted-local-feature-store\.js:\d+: trusted feature store must be background-only/);

  for (const operation of ['Get', 'Set', 'Remove']) {
    checkMutation(`generic storage${operation} action`, {
      'extension/background.js': `${backgroundSource}\nfunction mutatedStorageProxy(message) { switch (message.action) { case 'storage${operation}': return message; } }\n`
    }, new RegExp(`background\\.js:\\d+: generic storage proxy action is forbidden \\(storage${operation}\\)`));
  }

  checkMutation('operation-based storage bridge', {
    'extension/background.js': `${backgroundSource}\nconst mutatedStorageMessage = { action: 'storage', operation: 'get', key: 'corpus' };\n`
  }, /background\.js:\d+: generic operation-based storage bridge/);

  checkMutation('secret-bearing CAPTCHA key payload', {
    'extension/content/actions.js': actionsSource.replace(
      'captchaType: captchaType,\n          sitekey: sitekey',
      "captchaType: captchaType,\n          sitekey: sitekey,\n          apiKey: 'forged-secret'"
    )
  }, /actions\.js:\d+: solveCaptcha content path must not read or send apiKey/);

  checkMutation('forged CAPTCHA page URL payload', {
    'extension/content/actions.js': actionsSource.replace(
      'captchaType: captchaType,\n          sitekey: sitekey',
      "captchaType: captchaType,\n          sitekey: sitekey,\n          pageUrl: 'https:\/\/forged.test'"
    )
  }, /actions\.js:\d+: solveCaptcha content path must not read or send pageUrl/);

  checkMutation('CAPTCHA secret setting reference', {
    'extension/content/actions.js': actionsSource.replace(
      'solveCaptcha: async (params) => {',
      "solveCaptcha: async (params) => {\n    const captchaApiKey = 'forged-secret';"
    )
  }, /actions\.js:\d+: (?:solveCaptcha content path must not read or send captchaApiKey|CAPTCHA secret setting names are forbidden)/);

  await runCorpusStoreContract();

  if (failures.length) {
    console.error(`\nskopeo corpus trusted-store contract: ${failures.length} failure(s), ${passed} pass(es)`);
    for (const failure of failures) console.error('  -', failure);
    process.exitCode = 1;
    return;
  }
  console.log(`\nskopeo corpus trusted-store contract: PASS (${passed} assertions)`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
