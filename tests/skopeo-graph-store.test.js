'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const STORE_PATH = path.join(ROOT, 'extension/utils/skopeo-graph-store.js');
const GRAPH_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-graph-schema.js');
const CORPUS_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-corpus-schema.js');

if (!fs.existsSync(STORE_PATH)) {
  throw new Error('FsbSkopeoGraphStore is missing: skopeo-graph-store contract is RED');
}

const validatorSource = fs.readFileSync(
  path.join(ROOT, 'extension/lib/cfworker-json-schema.min.js'), 'utf8');
if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);
const graphSchema = require(GRAPH_SCHEMA_PATH);
const corpusSchema = require(CORPUS_SCHEMA_PATH);
const graphStore = require(STORE_PATH);

const VERSION = 'skopeo-graph-store/1';
const PREFIX = 'fsbSkopeoGraph:1:';
const CLAIM = Object.freeze({
  accountPermissionId: 'account-A',
  corpusRootFileId: 'corpus-X'
});
const PARTITION = corpusSchema.makePartitionKey(CLAIM);
const SOURCE_A = 'source-alpha';
const SOURCE_B = 'source-beta';
const SOURCE_C = 'source-sibling';
const FINGERPRINT_A = `sha256:${'a'.repeat(64)}`;
const FINGERPRINT_B = `sha256:${'b'.repeat(64)}`;
const FINGERPRINT_C = `sha256:${'c'.repeat(64)}`;
const PROVIDER = 'openai-compatible';
const MODEL = 'local-model-v1';
const DERIVED_NAME = 'Acme Northwind Person Vendor';

function clone(value) {
  return structuredClone(value);
}

function stringPaths(value, predicate, pathParts = [], output = []) {
  if (typeof value === 'string') {
    if (predicate(value)) output.push(pathParts.join('.'));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') continue;
    if (predicate(key)) output.push(pathParts.concat(`<key:${key}>`).join('.'));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      stringPaths(descriptor.value, predicate, pathParts.concat(key), output);
    }
  }
  return output;
}

function createController() {
  let call = 0;
  let armed = null;
  const trace = [];
  return {
    trace,
    reset() { call = 0; armed = null; trace.length = 0; },
    failAt(callNumber, timing = 'before', kind = 'quota') {
      armed = { call: callNumber, timing, kind };
    },
    failNext(type, timing = 'before', kind = 'quota') {
      armed = { type, timing, kind };
    },
    async around(type, detail, work) {
      call += 1;
      trace.push({ call, timing: 'before', type, detail: clone(detail) });
      if (armed && (armed.call === call || armed.type === type) && armed.timing === 'before') {
        const failure = armed;
        armed = null;
        throw new Error(failure.kind === 'quota' ? 'QUOTA_BYTES secret detail' : 'worker lost secret detail');
      }
      const result = await work();
      trace.push({ call, timing: 'after', type, detail: clone(detail) });
      if (armed && (armed.call === call || armed.type === type) && armed.timing === 'after') {
        const failure = armed;
        armed = null;
        throw new Error(failure.kind === 'quota' ? 'QUOTA_BYTES secret detail' : 'worker lost secret detail');
      }
      return result;
    }
  };
}

function createStorage(initial = {}, controller = createController()) {
  const values = clone(initial);
  function selected(keys) {
    if (keys === null || keys === undefined) return clone(values);
    const output = {};
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (Object.prototype.hasOwnProperty.call(values, key)) output[key] = clone(values[key]);
    }
    return output;
  }
  const storageArea = {
    get(keys) {
      return controller.around('storage.get', { keys }, async () => selected(keys));
    },
    set(update) {
      return controller.around('storage.set', { update }, async () => {
        for (const [key, value] of Object.entries(update || {})) values[key] = clone(value);
      });
    },
    remove(keys) {
      const list = Array.isArray(keys) ? keys.slice() : [keys];
      return controller.around('storage.remove', { keys: list }, async () => {
        for (const key of list) delete values[key];
      });
    },
    getBytesInUse(keys) {
      return controller.around('storage.getBytesInUse', { keys }, async () => {
        return Buffer.byteLength(JSON.stringify(selected(keys)), 'utf8');
      });
    }
  };
  return { storageArea, values, controller };
}

function createHarness(options = {}) {
  const clock = options.clock || { value: 1700000000000 };
  const fake = createStorage(options.initial || {}, options.controller || createController());
  const store = graphStore.create({
    storageArea: fake.storageArea,
    graphSchema,
    corpusSchema,
    now: () => clock.value
  });
  return { ...fake, store, clock };
}

async function mutate(store, work, controller = new AbortController()) {
  const guard = store.issueMutation(controller.signal);
  assert.ok(guard && Object.isFrozen(guard), 'graph store issues a frozen own mutation guard');
  assert.strictEqual(guard.signal, controller.signal, 'graph guard binds the exact signal');
  try {
    return await work(guard);
  } finally {
    const finished = store.finishMutation(guard);
    assert.deepEqual(finished, Object.freeze(Object.assign(Object.create(null), {
      ok: true,
      status: 'finished'
    })), 'graph mutation reaches terminal cleanup');
  }
}

function excerpt(text) {
  return {
    excerptId: 'excerpt_01',
    text,
    sourceByteStart: 100,
    sourceByteEnd: 100 + Buffer.byteLength(text, 'utf8')
  };
}

function durableRecord(record) {
  return {
    schemaVersion: record.schemaVersion,
    partitionKey: record.partitionKey,
    sourceFileId: record.sourceFileId,
    contentFingerprint: record.contentFingerprint,
    fragmentGenerationId: record.fragmentGenerationId,
    kind: record.kind,
    label: record.label,
    evidence: record.evidence,
    stableRecordId: record.stableRecordId,
    recordVersionId: record.recordVersionId
  };
}

async function makeFixture(sourceFileId, contentFingerprint, kind, label) {
  const text = 'agreement amendment clause fact event owner policy memo evidence text';
  const fragmentGenerationId = await graphSchema.deriveFragmentGenerationId({
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint
  });
  const parsedBatch = await graphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: `batch_${sourceFileId.replace(/-/g, '_')}_01`,
    records: [{
      candidateRef: 'record_01',
      kind,
      label,
      evidence: [{ excerptId: 'excerpt_01', start: 0, end: 9 }]
    }],
    relations: []
  }, {
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    excerpts: [excerpt(text)],
    batchOrdinal: 0,
    priorCandidates: []
  });
  assert.ok(parsedBatch, 'Plan 01 fixture parses');
  const records = parsedBatch.records.map(durableRecord);
  const fragment = await graphSchema.parseFragment({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    providerId: PROVIDER,
    modelId: MODEL,
    records,
    relations: []
  });
  const lexical = graphSchema.parseLexicalShard({
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    fragmentGenerationId,
    shardOrdinal: 0,
    postings: [{
      term: label.toLowerCase(),
      stableRecordId: records[0].stableRecordId,
      recordVersionId: records[0].recordVersionId
    }]
  });
  const adjacency = graphSchema.parseAdjacencyShard({
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    fragmentGenerationId,
    shardOrdinal: 0,
    entries: []
  });
  return {
    fragment,
    lexicalShards: [lexical],
    adjacencyShards: [adjacency],
    resultCacheShards: [],
    batch: {
      schemaVersion: graphSchema.VERSION,
      promptVersion: graphSchema.PROMPT_VERSION,
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint,
      fragmentGenerationId,
      providerId: PROVIDER,
      modelId: MODEL,
      batchOrdinal: 0,
      records,
      relations: []
    }
  };
}

async function publish(store, fixture) {
  const handle = await mutate(store, (guard) => store.beginReplacement({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: fixture.fragment.partitionKey,
    sourceFileId: fixture.fragment.sourceFileId,
    contentFingerprint: fixture.fragment.contentFingerprint,
    providerId: fixture.fragment.providerId,
    modelId: fixture.fragment.modelId
  }, guard));
  assert.equal(handle && handle.status, 'staging', 'replacement opens invisible staging');
  assert.equal(await store.readCurrentFragment({
    partitionKey: fixture.fragment.partitionKey,
    sourceFileId: fixture.fragment.sourceFileId,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  }), null, 'staging never falls back to a fragment page');
  const staged = await mutate(store, (guard) => store.stageBatch(handle, fixture.batch, guard));
  assert.deepEqual(staged, Object.freeze(Object.assign(Object.create(null), {
    ok: true,
    status: 'staged'
  })), 'validated provider-bound batch stages');
  const sealed = await mutate(store, (guard) => store.sealStaging(handle, {
    fragment: fixture.fragment,
    lexicalShards: fixture.lexicalShards,
    adjacencyShards: fixture.adjacencyShards,
    resultCacheShards: fixture.resultCacheShards
  }, guard));
  assert.equal(sealed && sealed.status, 'sealed', 'complete source generation seals');
  const published = await mutate(store, (guard) => store.publishReplacement(handle, guard));
  assert.equal(published && published.status, 'published', 'active source pointer publishes last');
  return handle;
}

async function makeCandidateRelation(proposer, target) {
  const evidence = proposer.fragment.records[0].evidence;
  const stableRelationId = await graphSchema.deriveStableRelationId({
    identityVersion: graphSchema.IDENTITY_VERSION,
    partitionKey: PARTITION,
    sourceFileId: proposer.fragment.sourceFileId,
    predicate: 'references-policy',
    fromStableRecordId: proposer.fragment.records[0].stableRecordId,
    toStableRecordId: target.fragment.records[0].stableRecordId,
    primaryLocator: {
      sourceByteStart: evidence[0].sourceByteStart,
      sourceByteEnd: evidence[0].sourceByteEnd
    }
  });
  const evidenceIdentity = graphSchema.canonicalize(evidence.map((item) => ({
    locatorId: item.locatorId,
    sourceByteStart: item.sourceByteStart,
    sourceByteEnd: item.sourceByteEnd
  })));
  const relationVersionId = await graphSchema.deriveRelationVersionId({
    relationClass: 'cross-document-candidate',
    partitionKey: PARTITION,
    relationKind: 'references-policy',
    stableRelationId,
    proposerRecordVersionId: proposer.fragment.records[0].recordVersionId,
    proposerFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetRecordVersionId: target.fragment.records[0].recordVersionId,
    targetFragmentGenerationId: target.fragment.fragmentGenerationId,
    canonicalEvidenceLocatorIdentity: evidenceIdentity
  });
  return graphSchema.parseCandidateRelation({
    schemaVersion: graphSchema.VERSION,
    relationClass: 'cross-document-candidate',
    partitionKey: PARTITION,
    relationKind: 'references-policy',
    proposingSourceFileId: proposer.fragment.sourceFileId,
    targetSourceFileId: target.fragment.sourceFileId,
    fromStableRecordId: proposer.fragment.records[0].stableRecordId,
    toStableRecordId: target.fragment.records[0].stableRecordId,
    stableRelationId,
    proposerRecordVersionId: proposer.fragment.records[0].recordVersionId,
    proposerFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetRecordVersionId: target.fragment.records[0].recordVersionId,
    targetFragmentGenerationId: target.fragment.fragmentGenerationId,
    evidence,
    canonicalEvidenceLocatorIdentity: evidenceIdentity,
    relationVersionId
  });
}

async function overlayInput(proposer, target, relation) {
  const input = {
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    proposingSourceFileId: proposer.fragment.sourceFileId,
    proposingFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetGenerations: [{
      sourceFileId: target.fragment.sourceFileId,
      fragmentGenerationId: target.fragment.fragmentGenerationId
    }],
    relations: [relation]
  };
  input.overlayGenerationId = await graphSchema.deriveCandidateOverlayGenerationId({
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    proposingSourceFileId: proposer.fragment.sourceFileId,
    proposingFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    relations: [relation]
  });
  return input;
}

async function testSurfaceAndPointerLast() {
  assert.strictEqual(globalThis.FsbSkopeoGraphStore, graphStore,
    'classic global and CommonJS FsbSkopeoGraphStore exports match');
  assert.deepEqual(Object.keys(graphStore).sort(), ['LIMITS', 'VERSION', 'create'],
    'graph store exposes only its version, limits, and factory');
  assert.equal(graphStore.VERSION, VERSION, 'graph store version is exact');
  assert.equal(Object.isFrozen(graphStore), true, 'graph store API is frozen');
  assert.deepEqual(graphStore.LIMITS, Object.freeze(Object.assign(Object.create(null), {
    MAX_RECORDS_PER_PAGE: 256,
    MAX_RELATIONS_PER_PAGE: 512,
    MAX_POSTINGS_PER_PAGE: 512,
    MAX_ADJACENCY_ENTRIES_PER_PAGE: 512,
    MAX_PAGES_PER_CATEGORY: 64,
    MAX_VALUE_BYTES: 262144,
    MAX_RECOVERY_STEPS: 128,
    MAX_DIAGNOSTICS: 100,
    MAX_DIAGNOSTIC_BYTES: 65536,
    DIAGNOSTIC_RETENTION_MS: 2592000000
  })), 'durable page, value, recovery, and diagnostic limits are exact');

  const harness = createHarness();
  assert.deepEqual(Object.keys(harness.store).sort(), [
    'beginReplacement', 'finishMutation', 'getPurgeParticipant', 'inspectMetadata',
    'inspectProvenance', 'issueMutation', 'publishReplacement', 'readActiveShards',
    'readCurrentFragment', 'recordDiagnostic', 'recover', 'registerCacheOwner',
    'registerTruthInvalidator', 'replaceCandidateRelations', 'sealStaging',
    'stageBatch', 'withdrawSource', 'withdrawSourceIfCurrent'
  ].sort(), 'created store exposes only the closed trusted graph protocol');
  assert.equal(Object.isFrozen(harness.store), true, 'created graph store is frozen');
  assert.equal(await harness.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: `sfg1:${'0'.repeat(64)}`
  }), null, 'absent source has no graph fallback');

  const fixture = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  await publish(harness.store, fixture);
  const current = await harness.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  });
  assert.deepEqual(current, fixture.fragment, 'published fragment round-trips exactly');
  const shards = await harness.store.readActiveShards({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  });
  assert.deepEqual(shards.lexicalShards, fixture.lexicalShards,
    'source-owned lexical shards round-trip under the exact generation');
  assert.deepEqual(shards.adjacencyShards, fixture.adjacencyShards,
    'source-owned adjacency shards round-trip under the exact generation');
  assert.deepEqual(shards.candidateRelations, [], 'source begins without candidate influence');
  assert.equal(Object.isFrozen(shards), true, 'active shard projection is frozen');

  const lastMutation = harness.controller.trace.filter((entry) =>
    entry.timing === 'before' && (entry.type === 'storage.set' || entry.type === 'storage.remove')).at(-1);
  assert.equal(lastMutation.type, 'storage.set', 'publication finishes with a set');
  assert.match(JSON.stringify(lastMutation.detail), /"state":"published"/,
    'the final visibility mutation is the published active pointer');
  assert.equal(Object.keys(harness.values).every((key) => key.startsWith(PREFIX)), true,
    'every graph value uses the literal trusted graph prefix');
  assert.equal(Object.keys(harness.values).some((key) =>
    key.includes(`${PARTITION.length}:${PARTITION}`) && key.includes(`${SOURCE_A.length}:${SOURCE_A}`)), true,
  'ownership keys use length-prefixed partition and source components');
  const labelPaths = stringPaths(harness.values,
    (value) => value === DERIVED_NAME || value === DERIVED_NAME.toLowerCase());
  assert.ok(labelPaths.length > 0 && labelPaths.every((entry) =>
    /fragment-record.*items\.0\.label$/.test(entry) ||
      /lexical.*shard\.postings\.0\.term$/.test(entry)),
  'derived party/person/vendor labels occur only in authoritative records and matching lexical shards');
  const ownershipPaths = stringPaths(harness.values,
    (value) => value === SOURCE_A || value === FINGERPRINT_A);
  assert.ok(ownershipPaths.length > 0 && ownershipPaths.every((entry) =>
    !/diagnostic/.test(entry) && (/<key:fsbSkopeoGraph:1:/.test(entry) ||
      /(?:sourceFileId|proposingSourceFileId|targetSourceFileId|contentFingerprint)$/.test(entry))),
  'source IDs and fingerprints occur only in authoritative ownership keys and fields');

  harness.controller.reset();
  const currentResult = await mutate(harness.store, (guard) => harness.store.beginReplacement({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    contentFingerprint: FINGERPRINT_A,
    providerId: PROVIDER,
    modelId: MODEL
  }, guard));
  assert.equal(currentResult.status, 'current', 'exact fingerprint and provider binding is a no-op');
  assert.equal(harness.controller.trace.some((entry) => entry.type === 'storage.set'), false,
    'exact-current replacement performs no write');

  return { harness, fixture };
}

async function testTruthInvalidatorContract() {
  const marker = ['skopeo', 'graph', 'store', 'truth', 'invalidator', 'contract'].join(' ');
  const probe = createHarness();
  if (typeof probe.store.registerTruthInvalidator !== 'function') throw new Error(marker);

  assert.equal(probe.store.registerTruthInvalidator(Object.freeze({
    withdrawSourceChange() { return { ok: true }; }
  })).ok, false, 'truth invalidator registration rejects a missing overlay method');
  assert.equal(probe.store.registerTruthInvalidator({
    withdrawSourceChange() { return { ok: true }; },
    withdrawOverlayChange() { return { ok: true }; }
  }).ok, false, 'truth invalidator registration requires the exact frozen adapter');

  const calls = [];
  function traced(kind, request, signal) {
    assert.equal(Object.isFrozen(request), true, `${kind} request is frozen`);
    assert.equal(signal && signal.aborted, false, `${kind} receives the live graph signal`);
    calls.push({ kind, request: clone(request), signal });
    probe.controller.trace.push({
      call: -1,
      timing: 'before',
      type: `truth.${kind}`,
      detail: clone(request)
    });
    return Object.freeze({ ok: true });
  }
  const adapter = Object.freeze({
    withdrawSourceChange(request, signal) {
      return traced('withdrawSourceChange', request, signal);
    },
    withdrawOverlayChange(request, signal) {
      return traced('withdrawOverlayChange', request, signal);
    }
  });
  assert.equal(probe.store.registerTruthInvalidator(adapter).status, 'registered',
    'one exact frozen truth invalidator registers');
  assert.equal(probe.store.registerTruthInvalidator(adapter).ok, false,
    'truth invalidator registration is one-time with no replacement path');

  const proposer = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  const target = await makeFixture(SOURCE_B, FINGERPRINT_B, 'policy-document', 'Target policy');
  probe.controller.reset();
  await publish(probe.store, proposer);
  const firstSourceCall = calls.find((entry) => entry.kind === 'withdrawSourceChange');
  assert.deepEqual(firstSourceCall && firstSourceCall.request, {
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    priorFragmentGenerationId: null,
    nextFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    reason: 'user-withdrawn'
  }, 'initial source replacement invalidates the exact old/new generation binding');
  const invalidatorIndex = probe.controller.trace.findIndex((entry) =>
    entry.type === 'truth.withdrawSourceChange');
  const firstGraphMutation = probe.controller.trace.findIndex((entry) =>
    entry.type === 'storage.set' || entry.type === 'storage.remove');
  assert.ok(invalidatorIndex >= 0 && firstGraphMutation > invalidatorIndex,
    'source truth invalidation completes before the first graph visibility mutation');

  await publish(probe.store, target);
  const relation = await makeCandidateRelation(proposer, target);
  const replacement = await overlayInput(proposer, target, relation);
  calls.length = 0;
  probe.controller.reset();
  await mutate(probe.store,
    (guard) => probe.store.replaceCandidateRelations(replacement, guard));
  assert.deepEqual(calls.map((entry) => entry.kind), ['withdrawOverlayChange'],
    'candidate replacement invokes only the overlay invalidator');
  assert.deepEqual(calls[0].request, {
    partitionKey: PARTITION,
    proposingSourceFileId: SOURCE_A,
    affectedSourceFileIds: [SOURCE_A, SOURCE_B].sort(),
    priorOverlayGenerationId: null,
    nextOverlayGenerationId: replacement.overlayGenerationId,
    reason: 'complete'
  }, 'candidate replacement binds proposer plus the exact old/new target union');
  const overlayInvalidator = probe.controller.trace.findIndex((entry) =>
    entry.type === 'truth.withdrawOverlayChange');
  const overlayMutation = probe.controller.trace.findIndex((entry) =>
    entry.type === 'storage.set' || entry.type === 'storage.remove');
  assert.ok(overlayInvalidator >= 0 && overlayMutation > overlayInvalidator,
    'overlay invalidation completes before graph overlay page or pointer mutation');

  const clear = {
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    proposingSourceFileId: SOURCE_A,
    proposingFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetGenerations: [],
    relations: []
  };
  calls.length = 0;
  await mutate(probe.store,
    (guard) => probe.store.replaceCandidateRelations(clear, guard));
  assert.deepEqual(calls[0] && calls[0].request, {
    partitionKey: PARTITION,
    proposingSourceFileId: SOURCE_A,
    affectedSourceFileIds: [SOURCE_A, SOURCE_B].sort(),
    priorOverlayGenerationId: replacement.overlayGenerationId,
    nextOverlayGenerationId: null,
    reason: 'user-withdrawn'
  }, 'overlay clear invalidates proposer plus the prior target union without target lookup');

  calls.length = 0;
  await mutate(probe.store, (guard) => probe.store.withdrawSource({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    reason: 'access-revoked'
  }, guard));
  assert.deepEqual(calls[0] && calls[0].request, {
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    priorFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    nextFragmentGenerationId: null,
    reason: 'access-revoked'
  }, 'source withdrawal invalidates the exact prior generation before graph closure');

  for (const outcome of [
    Object.freeze({ ok: false }),
    Object.freeze({ ok: true, extra: 'forbidden' })
  ]) {
    const blocked = createHarness();
    assert.equal(blocked.store.registerTruthInvalidator(Object.freeze({
      withdrawSourceChange() { return outcome; },
      withdrawOverlayChange() { return outcome; }
    })).ok, true, 'strict invalidator fixture registers');
    const fixture = await makeFixture(SOURCE_C, FINGERPRINT_C, 'agreement', 'Strict result');
    const result = await mutate(blocked.store, (guard) => blocked.store.beginReplacement({
      schemaVersion: graphSchema.VERSION,
      promptVersion: graphSchema.PROMPT_VERSION,
      partitionKey: PARTITION,
      sourceFileId: fixture.fragment.sourceFileId,
      contentFingerprint: fixture.fragment.contentFingerprint,
      providerId: fixture.fragment.providerId,
      modelId: fixture.fragment.modelId
    }, guard));
    assert.notEqual(result && result.status, 'staging',
      'false or extra-field invalidator output blocks graph publication');
    assert.deepEqual(blocked.values, {},
      'blocked truth invalidation performs no graph storage mutation');
  }

  const rejected = createHarness();
  assert.equal(rejected.store.registerTruthInvalidator(Object.freeze({
    async withdrawSourceChange() {
      throw new Error('raw truth failure must stay private');
    },
    withdrawOverlayChange() { return Object.freeze({ ok: true }); }
  })).ok, true, 'rejecting invalidator fixture registers');
  const rejectedFixture = await makeFixture(
    SOURCE_C, FINGERPRINT_C, 'agreement', 'Rejected invalidator');
  const rejectedResult = await mutate(rejected.store,
    (guard) => rejected.store.beginReplacement({
      schemaVersion: graphSchema.VERSION,
      promptVersion: graphSchema.PROMPT_VERSION,
      partitionKey: PARTITION,
      sourceFileId: rejectedFixture.fragment.sourceFileId,
      contentFingerprint: rejectedFixture.fragment.contentFingerprint,
      providerId: rejectedFixture.fragment.providerId,
      modelId: rejectedFixture.fragment.modelId
    }, guard));
  assert.equal(rejectedResult.ok, false, 'rejected truth invalidation fails closed');
  assert.doesNotMatch(JSON.stringify(rejectedResult), /raw truth failure/,
    'truth invalidator errors expose no raw failure text');
  assert.deepEqual(rejected.values, {},
    'rejected truth invalidation cannot mutate graph visibility');
}

async function testConditionalStaleWithdrawal() {
  const harness = createHarness();
  const stale = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', 'Stale agreement');
  const current = await makeFixture(SOURCE_A, FINGERPRINT_B, 'agreement', 'Current agreement');
  await publish(harness.store, stale);
  const observed = await harness.store.inspectMetadata({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A
  });
  assert.equal(observed.activeGenerationId, stale.fragment.fragmentGenerationId,
    'metadata carries the exact active generation observed by stale certification');
  assert.equal(observed.contentFingerprint, FINGERPRINT_A,
    'metadata carries the exact content fingerprint observed by stale certification');

  await publish(harness.store, current);
  const currentSnapshot = clone(harness.values);
  const superseded = await mutate(harness.store, (guard) =>
    harness.store.withdrawSourceIfCurrent({
      partitionKey: PARTITION,
      sourceFileId: SOURCE_A,
      activeGenerationId: observed.activeGenerationId,
      contentFingerprint: observed.contentFingerprint,
      reason: 'user-withdrawn'
    }, guard));
  assert.deepEqual(superseded, Object.freeze(Object.assign(Object.create(null), {
    ok: true,
    status: 'superseded'
  })), 'a delayed stale-A fence is a fixed no-op after B publishes');
  assert.deepEqual(harness.values, currentSnapshot,
    'the superseded fence touches none of B control, fragment, index, or cache keys');
  assert.deepEqual(await harness.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: current.fragment.fragmentGenerationId
  }), current.fragment, 'the concurrently published B generation remains queryable');

  const withdrawn = await mutate(harness.store, (guard) =>
    harness.store.withdrawSourceIfCurrent({
      partitionKey: PARTITION,
      sourceFileId: SOURCE_A,
      activeGenerationId: current.fragment.fragmentGenerationId,
      contentFingerprint: current.fragment.contentFingerprint,
      reason: 'user-withdrawn'
    }, guard));
  assert.equal(withdrawn.status, 'withheld',
    'the conditional operation withdraws the observed generation when it is still current');
  assert.equal(await harness.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: current.fragment.fragmentGenerationId
  }), null, 'the still-current observed generation is completely absent after withdrawal');
}

async function testDeterministicRecreation() {
  const harness = createHarness();
  const fixture = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  await publish(harness.store, fixture);
  const originalBytes = JSON.stringify(harness.values);
  const first = graphStore.create({
    storageArea: harness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => harness.clock.value
  });
  assert.equal((await mutate(first, (guard) => first.recover(guard))).status, 'complete',
    'first fresh worker validates a complete generation without rebuilding authority');
  assert.equal(JSON.stringify(harness.values), originalBytes,
    'first fresh-worker recovery preserves deterministic durable bytes');
  const firstFragment = await first.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  });
  const firstShards = await first.readActiveShards({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  });
  const second = graphStore.create({
    storageArea: harness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => harness.clock.value
  });
  assert.equal((await mutate(second, (guard) => second.recover(guard))).status, 'complete',
    'second fresh worker repeats bounded recovery deterministically');
  assert.equal(JSON.stringify(harness.values), originalBytes,
    'second fresh-worker recovery preserves byte-identical storage');
  assert.deepEqual(await second.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  }), firstFragment, 'fragment projection is byte-identical after a second recreation');
  assert.deepEqual(await second.readActiveShards({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  }), firstShards, 'shard projection is byte-identical after a second recreation');
}

async function testCandidateOverlayCurrentnessAndClear() {
  const harness = createHarness();
  const proposer = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  const target = await makeFixture(SOURCE_B, FINGERPRINT_B, 'policy-document', 'Target policy');
  await publish(harness.store, proposer);
  await publish(harness.store, target);
  const relation = await makeCandidateRelation(proposer, target);
  assert.ok(relation, 'Plan 01 candidate relation parses');
  const firstInput = await overlayInput(proposer, target, relation);
  const replaced = await mutate(harness.store,
    (guard) => harness.store.replaceCandidateRelations(firstInput, guard));
  assert.equal(replaced.status, 'published', 'complete candidate overlay publishes pointer-last');
  let active = await harness.store.readActiveShards({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: proposer.fragment.fragmentGenerationId
  });
  assert.deepEqual(active.candidateRelations, [relation],
    'candidate relation is readable only through its proposing source');

  const targetAdvanced = await makeFixture(
    SOURCE_B, FINGERPRINT_C, 'policy-document', 'Target policy advanced');
  await publish(harness.store, targetAdvanced);
  active = await harness.store.readActiveShards({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: proposer.fragment.fragmentGenerationId
  });
  assert.deepEqual(active.candidateRelations, [],
    'target-only generation advance immediately makes the old overlay unreadable');

  const advancedRelation = await makeCandidateRelation(proposer, targetAdvanced);
  const advancedInput = await overlayInput(proposer, targetAdvanced, advancedRelation);
  assert.notEqual(advancedRelation.relationVersionId, relation.relationVersionId,
    'target-only advance deterministically changes relation version identity');
  assert.notEqual(advancedInput.overlayGenerationId, firstInput.overlayGenerationId,
    'target-only advance deterministically changes overlay generation identity');
  await mutate(harness.store,
    (guard) => harness.store.replaceCandidateRelations(advancedInput, guard));

  harness.controller.reset();
  const clearInput = {
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    proposingSourceFileId: SOURCE_A,
    proposingFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetGenerations: [],
    relations: []
  };
  const cleared = await mutate(harness.store,
    (guard) => harness.store.replaceCandidateRelations(clearInput, guard));
  assert.deepEqual(cleared, Object.freeze(Object.assign(Object.create(null), {
    ok: true,
    status: 'cleared'
  })), 'empty complete replacement returns the fixed clear acknowledgement');
  const targetKeyReads = harness.controller.trace.filter((entry) =>
    entry.type === 'storage.get' && JSON.stringify(entry.detail).includes(SOURCE_B));
  assert.equal(targetKeyReads.length, 0,
    'proposer-only empty replacement performs no target lookup');
  const clearedAgain = await mutate(harness.store,
    (guard) => harness.store.replaceCandidateRelations(clearInput, guard));
  assert.deepEqual(clearedAgain, cleared,
    'already-empty and formerly-populated overlays return identical acknowledgements');
}

async function attemptPublication(store, fixture) {
  const handle = await mutate(store, (guard) => store.beginReplacement({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: fixture.fragment.partitionKey,
    sourceFileId: fixture.fragment.sourceFileId,
    contentFingerprint: fixture.fragment.contentFingerprint,
    providerId: fixture.fragment.providerId,
    modelId: fixture.fragment.modelId
  }, guard));
  if (!handle || handle.status !== 'staging') return handle;
  const staged = await mutate(store, (guard) => store.stageBatch(handle, fixture.batch, guard));
  if (!staged || staged.status !== 'staged') return staged;
  const sealed = await mutate(store, (guard) => store.sealStaging(handle, {
    fragment: fixture.fragment,
    lexicalShards: fixture.lexicalShards,
    adjacencyShards: fixture.adjacencyShards,
    resultCacheShards: fixture.resultCacheShards
  }, guard));
  if (!sealed || sealed.status !== 'sealed') return sealed;
  return mutate(store, (guard) => store.publishReplacement(handle, guard));
}

async function recoverFresh(harness) {
  harness.controller.reset();
  const restarted = graphStore.create({
    storageArea: harness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => harness.clock.value
  });
  const result = await mutate(restarted, (guard) => restarted.recover(guard));
  return { restarted, result };
}

async function testBeforeAfterFailureMatrices() {
  const fixture = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  const baseline = createHarness();
  assert.equal((await attemptPublication(baseline.store, fixture)).status, 'published',
    'failure-matrix baseline publishes a complete source');
  const publicationCalls = Math.max(...baseline.controller.trace.map((entry) => entry.call));
  assert.ok(publicationCalls > 20, 'publication matrix spans every storage read/write/remove await');

  for (let call = 1; call <= publicationCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness();
      harness.controller.failAt(call, timing, call % 2 ? 'quota' : 'worker');
      const result = await attemptPublication(harness.store, fixture);
      assert.match(String(result && result.status),
        /^(?:published|quota-exceeded|recovery-pending|stale-operation)$/,
      `publication ${timing} await ${call} exposes only a fixed outcome`);
      assert.doesNotMatch(JSON.stringify(result), /QUOTA_BYTES|worker lost|secret detail/i,
        `publication ${timing} await ${call} exposes no raw failure text`);
      const { restarted, result: recovery } = await recoverFresh(harness);
      assert.match(recovery.status, /^(?:complete|repaired)$/,
        `publication ${timing} await ${call} recovers within the bounded pass`);
      const current = await restarted.readCurrentFragment({
        partitionKey: PARTITION,
        sourceFileId: SOURCE_A,
        fragmentGenerationId: fixture.fragment.fragmentGenerationId
      });
      assert.ok(current === null || JSON.stringify(current) === JSON.stringify(fixture.fragment),
        `publication ${timing} await ${call} exposes complete truth or complete absence`);
      assert.equal(Object.keys(harness.values).some((key) =>
        /(?:staging|batch|journal):/.test(key)), false,
      `publication ${timing} await ${call} leaves no recoverable staging orphan`);
    }
  }

  const seed = createHarness();
  const proposer = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  const target = await makeFixture(SOURCE_B, FINGERPRINT_B, 'policy-document', 'Target policy');
  await publish(seed.store, proposer);
  await publish(seed.store, target);
  const relation = await makeCandidateRelation(proposer, target);
  const input = await overlayInput(proposer, target, relation);
  const initial = clone(seed.values);

  seed.controller.reset();
  assert.equal((await mutate(seed.store,
    (guard) => seed.store.replaceCandidateRelations(input, guard))).status, 'published',
  'overlay failure-matrix baseline publishes');
  const overlayCalls = Math.max(...seed.controller.trace.map((entry) => entry.call));
  assert.ok(overlayCalls >= 7, 'overlay matrix spans endpoint, page, and pointer awaits');
  for (let call = 1; call <= overlayCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness({ initial });
      harness.controller.failAt(call, timing, call % 2 ? 'worker' : 'quota');
      const result = await mutate(harness.store,
        (guard) => harness.store.replaceCandidateRelations(input, guard));
      assert.match(result.status,
        /^(?:published|quota-exceeded|recovery-pending|stale-operation)$/,
      `overlay ${timing} await ${call} exposes only a fixed outcome`);
      const { restarted, result: recovery } = await recoverFresh(harness);
      assert.match(recovery.status, /^(?:complete|repaired)$/,
        `overlay ${timing} await ${call} recovers within the bounded pass`);
      const shards = await restarted.readActiveShards({
        partitionKey: PARTITION,
        sourceFileId: SOURCE_A,
        fragmentGenerationId: proposer.fragment.fragmentGenerationId
      });
      assert.ok(shards && (shards.candidateRelations.length === 0 ||
        (shards.candidateRelations.length === 1 &&
          shards.candidateRelations[0].relationVersionId === relation.relationVersionId)),
      `overlay ${timing} await ${call} exposes one complete overlay or none`);
    }
  }

  const populated = clone(seed.values);
  const clearInput = {
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    proposingSourceFileId: SOURCE_A,
    proposingFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetGenerations: [],
    relations: []
  };
  seed.controller.reset();
  assert.equal((await mutate(seed.store,
    (guard) => seed.store.replaceCandidateRelations(clearInput, guard))).status, 'cleared',
  'clear failure-matrix baseline completes without a target');
  const clearCalls = Math.max(...seed.controller.trace.map((entry) => entry.call));
  for (let call = 1; call <= clearCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness({ initial: populated });
      harness.controller.failAt(call, timing, 'worker');
      const result = await mutate(harness.store,
        (guard) => harness.store.replaceCandidateRelations(clearInput, guard));
      assert.match(result.status, /^(?:cleared|recovery-pending|stale-operation)$/,
        `clear ${timing} await ${call} exposes only a fixed outcome`);
      assert.equal(harness.controller.trace.some((entry) =>
        entry.type === 'storage.get' && JSON.stringify(entry.detail).includes(SOURCE_B)), false,
      `clear ${timing} await ${call} never probes a former target`);
      const { restarted } = await recoverFresh(harness);
      const shards = await restarted.readActiveShards({
        partitionKey: PARTITION,
        sourceFileId: SOURCE_A,
        fragmentGenerationId: proposer.fragment.fragmentGenerationId
      });
      assert.ok(shards && (shards.candidateRelations.length === 0 ||
        shards.candidateRelations[0].relationVersionId === relation.relationVersionId),
      `clear ${timing} await ${call} leaves a complete old overlay or complete absence`);
    }
  }
}

async function testFailureRecoveryIsolationAndPrivacy() {
  const harness = createHarness();
  const source = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  const sibling = await makeFixture(SOURCE_C, FINGERPRINT_C, 'memo', 'Sibling memo');
  await publish(harness.store, source);
  await publish(harness.store, sibling);
  const siblingBefore = Object.fromEntries(Object.entries(harness.values).filter(([key]) =>
    key.includes(`${SOURCE_C.length}:${SOURCE_C}`)));

  const changed = await makeFixture(SOURCE_A, FINGERPRINT_B, 'agreement', 'Changed agreement');
  harness.controller.failNext('storage.set', 'after', 'quota');
  const failed = await mutate(harness.store, (guard) => harness.store.beginReplacement({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    contentFingerprint: FINGERPRINT_B,
    providerId: PROVIDER,
    modelId: MODEL
  }, guard));
  assert.equal(failed.status, 'quota-exceeded', 'raw quota errors collapse to a fixed reason');
  assert.deepEqual(Object.fromEntries(Object.entries(harness.values).filter(([key]) =>
    key.includes(`${SOURCE_C.length}:${SOURCE_C}`))), siblingBefore,
  'failed replacement leaves sibling-source bytes identical');

  const restarted = graphStore.create({
    storageArea: harness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => harness.clock.value
  });
  const recovered = await mutate(restarted, (guard) => restarted.recover(guard));
  assert.ok(['complete', 'repaired'].includes(recovered.status),
    'fresh-worker recovery converges incomplete local work');
  assert.deepEqual(await restarted.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_C,
    fragmentGenerationId: sibling.fragment.fragmentGenerationId
  }), sibling.fragment, 'recovery preserves a sibling byte-for-byte');

  const republished = await publish(restarted, changed);
  assert.equal(republished.status, 'staging', 'changed source can restart as a whole generation');
  const recordPageKey = Object.keys(harness.values).find((key) =>
    key.includes('fragment-record') && key.includes(`${SOURCE_A.length}:${SOURCE_A}`));
  harness.values[recordPageKey].items[0].recordVersionId = `srv1:${'f'.repeat(64)}`;
  const corruptRestart = graphStore.create({
    storageArea: harness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => harness.clock.value
  });
  await mutate(corruptRestart, (guard) => corruptRestart.recover(guard));
  assert.equal(await corruptRestart.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: changed.fragment.fragmentGenerationId
  }), null, 'corrupt current pages close visibility instead of falling back');

  const diagnostic = {
    partitionKey: PARTITION,
    operation: 'recovery',
    outcome: 'failure',
    reason: 'corrupt-staging',
    recovery: 'closed',
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    providerId: PROVIDER,
    modelId: MODEL,
    recordCount: Number.MAX_VALUE,
    relationCount: 0,
    durationMs: Number.POSITIVE_INFINITY,
    retryCount: 2,
    repairCount: 1,
    inputTokens: 4,
    outputTokens: 5,
    validatorKeyword: 'required',
    validatorPath: '/records/0'
  };
  const recorded = await mutate(corruptRestart,
    (guard) => corruptRestart.recordDiagnostic(diagnostic, guard));
  assert.equal(recorded.status, 'recorded', 'metadata-safe diagnostic is recorded');
  for (let index = 0; index < 110; index += 1) {
    await mutate(corruptRestart,
      (guard) => corruptRestart.recordDiagnostic({ ...diagnostic, retryCount: index }, guard));
  }
  const diagnosticEntry = Object.entries(harness.values).find(([key]) => key.includes('diagnostic'));
  assert.ok(diagnosticEntry && diagnosticEntry[1].records.length === 100,
    'diagnostic ledger is capped at exactly 100 records');
  assert.ok(Buffer.byteLength(JSON.stringify(diagnosticEntry[1]), 'utf8') <= 65536,
    'diagnostic ledger stays within 64 KiB');
  assert.equal(Number.isSafeInteger(diagnosticEntry[1].records.at(-1).durationMs), true,
    'nonfinite diagnostic counters saturate to a finite safe value');
  const forbiddenDiagnostic = await mutate(corruptRestart,
    (guard) => corruptRestart.recordDiagnostic({ ...diagnostic, sourceFileId: SOURCE_A }, guard));
  assert.equal(forbiddenDiagnostic.status, 'invalid-input',
    'diagnostics structurally reject source identifiers and extra fields');
  const namedDiagnostic = await mutate(corruptRestart,
    (guard) => corruptRestart.recordDiagnostic({
      ...diagnostic,
      validatorPath: `/records/${DERIVED_NAME}`
    }, guard));
  assert.equal(namedDiagnostic.status, 'invalid-input',
    'diagnostics reject derived party/person/vendor name bytes');

  harness.clock.value += 31 * 24 * 60 * 60 * 1000;
  const afterExpiry = await mutate(corruptRestart,
    (guard) => corruptRestart.recordDiagnostic({ ...diagnostic, outcome: 'success', reason: 'complete' }, guard));
  assert.equal(afterExpiry.status, 'recorded', 'diagnostic write prunes expired history');
  const prunedLedger = Object.entries(harness.values).find(([key]) => key.includes('diagnostic'))[1];
  assert.equal(prunedLedger.records.length, 1, 'diagnostics expire after exactly the bounded retention window');
  assert.equal(prunedLedger.records[0].timestamp % 3600000, 0,
    'diagnostic timestamps are coarsened to whole hours');

  const durable = JSON.stringify(harness.values);
  for (const marker of [
    'raw source excerpt secret', 'customer-contract.pdf', 'raw provider output secret',
    'Bearer credential-secret', 'https://source.example/private'
  ]) {
    assert.equal(durable.includes(marker), false, `durable graph bytes exclude ${marker}`);
  }
  assert.equal(durable.includes('QUOTA_BYTES secret detail'), false,
    'raw storage errors never enter results or durable diagnostics');
}

async function testRecoveryBoundsAndCacheRefusal() {
  const corruptControls = {};
  for (let index = 0; index < 129; index += 1) {
    corruptControls[`${PREFIX}control:corrupt-${String(index).padStart(3, '0')}`] = { forged: true };
  }
  const bounded = createHarness({ initial: corruptControls });
  const firstPass = await mutate(bounded.store, (guard) => bounded.store.recover(guard));
  assert.equal(firstPass.status, 'recovery-pending',
    'recovery stops after at most 128 sorted durable work items');
  assert.equal(Object.keys(bounded.values).length, 1,
    'bounded recovery leaves exactly the unprocessed suffix for a later wake');
  const secondPass = await mutate(bounded.store, (guard) => bounded.store.recover(guard));
  assert.equal(secondPass.status, 'repaired',
    'a later bounded wake completes the remaining local repair');
  assert.equal(Object.keys(bounded.values).length, 0,
    'bounded repeated recovery removes every corrupt orphan');

  const shardHarness = createHarness();
  const fixture = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  await publish(shardHarness.store, fixture);
  const lexicalKey = Object.keys(shardHarness.values).find((key) =>
    key.includes('lexical') && key.includes(`${SOURCE_A.length}:${SOURCE_A}`));
  shardHarness.values[lexicalKey].shard.postings[0].term = 'corrupt derived index';
  const shardRestart = graphStore.create({
    storageArea: shardHarness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => shardHarness.clock.value
  });
  assert.equal((await mutate(shardRestart, (guard) => shardRestart.recover(guard))).status, 'repaired',
    'recovery rebuilds a corrupt derivable lexical shard from the valid fragment');
  const repairedShards = await shardRestart.readActiveShards({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  });
  assert.equal(repairedShards.lexicalShards[0].postings[0].term, DERIVED_NAME.toLowerCase(),
    'rebuilt lexical state is deterministic and source-owned');

  const refusal = createHarness();
  assert.equal(refusal.store.registerCacheOwner(Object.freeze({
    async purgeSource() { return { ok: true }; },
    async purgePartition() { return { ok: true }; },
    async hasOwnedInfluence() { return { owned: true }; }
  })).status, 'registered', 'refusing cache owner registers under the exact protocol');
  const refused = await mutate(refusal.store, (guard) => refusal.store.beginReplacement({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    contentFingerprint: FINGERPRINT_A,
    providerId: PROVIDER,
    modelId: MODEL
  }, guard));
  assert.equal(refused.status, 'absence-proof-failed',
    'cache-owner refusal prevents staging and returns a fixed absence reason');
  assert.equal(await refusal.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  }), null, 'cache-owner refusal leaves source truth fenced');
}

async function testParticipantBindersAndCacheOwner() {
  const harness = createHarness();
  const fixture = await makeFixture(SOURCE_A, FINGERPRINT_A, 'agreement', DERIVED_NAME);
  await publish(harness.store, fixture);
  const cache = new Set([`${PARTITION}\u0000${SOURCE_A}`]);
  const cacheAuth = [];
  const cacheRequests = [];
  const cacheOwner = Object.freeze({
    async purgeSource(request, authorization) {
      cacheAuth.push(authorization);
      cacheRequests.push(clone(request));
      cache.delete(`${request.partitionKey}\u0000${request.sourceFileId}`);
      return { ok: true };
    },
    async purgePartition(request, authorization) {
      cacheAuth.push(authorization);
      cacheRequests.push(clone(request));
      for (const key of Array.from(cache)) if (key.startsWith(`${request.partitionKey}\u0000`)) cache.delete(key);
      return { ok: true };
    },
    async hasOwnedInfluence(request, authorization) {
      cacheAuth.push(authorization);
      cacheRequests.push(clone(request));
      const prefix = `${request.partitionKey}\u0000`;
      return {
        owned: request.sourceFileId === null
          ? Array.from(cache).some((key) => key.startsWith(prefix))
          : cache.has(`${prefix}${request.sourceFileId}`)
      };
    }
  });
  assert.equal(harness.store.registerCacheOwner(cacheOwner).status, 'registered',
    'one exact disposable-cache owner registers');
  assert.equal(harness.store.registerCacheOwner(cacheOwner).status, 'invalid-input',
    'cache owner cannot be replaced or registered twice');

  const corpusStorage = createStorage();
  const corpusStore = require(path.join(ROOT, 'extension/utils/skopeo-corpus-store.js')).create({
    storageArea: corpusStorage.storageArea,
    schema: corpusSchema,
    now: () => harness.clock.value
  });
  const graphNames = ['fragments', 'indexes', 'relationships', 'result-cache'];
  for (const name of graphNames) {
    const binder = harness.store.getPurgeParticipant(name);
    assert.equal(typeof binder, 'function', `${name} exposes a one-use authorized binder`);
    assert.equal(harness.store.getPurgeParticipant(name), null,
      `${name} binder cannot be issued twice`);
    assert.equal(corpusStore.registerAuthorizedPurgeParticipant(name, binder).status, 'registered',
      `${name} binder registers through the corpus-owned verifier`);
  }
  for (const name of ['citations', 'counts', 'alerts']) {
    corpusStore.registerAuthorizedPurgeParticipant(name, (verify) => Object.freeze({
      async purgeSource(request, capability) {
        return verify(capability, 'purge-source', request) ? { ok: true } : { ok: false };
      },
      async purgePartition(request, capability) {
        return verify(capability, 'purge-partition', request) ? { ok: true } : { ok: false };
      },
      async hasOwnedInfluence(request, capability) {
        const mode = request.sourceFileId === null ? 'verify-partition' : 'verify-source';
        return verify(capability, mode, request) ? { owned: false } : { owned: true };
      }
    }));
  }
  assert.equal(harness.store.getPurgeParticipant('citations'), null,
    'reserved corpus categories own no graph payload');

  const result = await mutate(corpusStore,
    (guard) => corpusStore.purgeSource(CLAIM, SOURCE_A, 'access-revoked', guard));
  assert.equal(result.status, 'purged', 'real graph participants complete a corpus source purge');
  assert.equal(await harness.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  }), null, 'authorized corpus purge removes graph visibility and influence');
  assert.equal(cache.size, 0, 'authorized participant purge removes disposable cache influence');
  assert.equal(cacheAuth.every((view) => view && Object.isFrozen(view) &&
    Object.keys(view).sort().join(',') === 'operationEpoch,signal'), true,
  'cache owner sees only minimized live authorization, never a corpus guard');

  await publish(harness.store, fixture);
  cache.add(`${PARTITION}\u0000${SOURCE_A}`);
  const partitionResult = await mutate(corpusStore,
    (guard) => corpusStore.purgePartition(CLAIM, 'root-replaced', guard));
  assert.equal(partitionResult.status, 'purged',
    'real graph participants complete a corpus partition purge');
  assert.equal(cache.size, 0, 'partition purge removes exact-partition cache influence');
  assert.equal(cacheRequests.some((request) => request.sourceFileId === null), true,
    'partition adapters authenticate only the literal null source selector');
  assert.equal(await harness.store.readCurrentFragment({
    partitionKey: PARTITION,
    sourceFileId: SOURCE_A,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  }), null, 'partition purge leaves no readable source graph');
}

async function run() {
  console.log('--- Phase 55 Plan 02: skopeo graph store contract ---');
  const started = Date.now();
  await testTruthInvalidatorContract();
  await testSurfaceAndPointerLast();
  await testConditionalStaleWithdrawal();
  await testDeterministicRecreation();
  await testCandidateOverlayCurrentnessAndClear();
  await testBeforeAfterFailureMatrices();
  await testFailureRecoveryIsolationAndPrivacy();
  await testRecoveryBoundsAndCacheRefusal();
  await testParticipantBindersAndCacheOwner();

  const source = fs.readFileSync(STORE_PATH, 'utf8');
  for (const forbidden of [
    'Graphify', 'graphology', 'MiniSearch', 'indexedDB', 'chrome.identity',
    'drive.googleapis.com', 'UniversalProvider', 'MCP', 'eval(', 'new Function'
  ]) {
    assert.equal(source.includes(forbidden), false,
      `graph store has no forbidden runtime dependency: ${forbidden}`);
  }
  assert.ok(Date.now() - started < 30000, 'focused graph-store contract completes under 30 seconds');
  console.log('skopeo graph store contract: PASS');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
