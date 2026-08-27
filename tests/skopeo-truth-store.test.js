'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const STORE_PATH = path.join(ROOT, 'extension/utils/skopeo-truth-store.js');
const TRUTH_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-truth-schema.js');
const GRAPH_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-graph-schema.js');
const CORPUS_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-corpus-schema.js');
const VALIDATOR_PATH = path.join(ROOT, 'extension/lib/cfworker-json-schema.min.js');

if (!fs.existsSync(STORE_PATH)) {
  console.error(['skopeo', 'truth', 'store', 'contract'].join(' '));
  process.exit(1);
}

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const validatorSource = fs.readFileSync(VALIDATOR_PATH, 'utf8');
if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);
const graphSchema = require(GRAPH_SCHEMA_PATH);
const corpusSchema = require(CORPUS_SCHEMA_PATH);
const truthSchema = require(TRUTH_SCHEMA_PATH);
const truthStore = require(STORE_PATH);

const VERSION = 'skopeo-truth-store/1';
const PREFIX = 'fsbSkopeoTruth:1:';
const CLAIM = Object.freeze({
  accountPermissionId: 'account-A',
  corpusRootFileId: 'corpus-X'
});
const PARTITION = corpusSchema.makePartitionKey(CLAIM);
const SOURCE_A = 'source-alpha';
const SOURCE_B = 'source-beta';
const FINGERPRINT_A = `sha256:${'a'.repeat(64)}`;
const FINGERPRINT_B = `sha256:${'b'.repeat(64)}`;
const RECORD_A = `srv1:${'1'.padStart(64, '0')}`;
const RECORD_B = `srv1:${'2'.padStart(64, '0')}`;
const RELATION_A = `slv1:${'3'.padStart(64, '0')}`;

function clone(value) {
  return structuredClone(value);
}

function hexId(prefix, number) {
  return prefix + Number(number).toString(16).padStart(64, '0');
}

function component(value) {
  return `${value.length}:${value}`;
}

function sourceDependencyStorageKey(partitionKey, sourceFileId, ordinal) {
  return `${PREFIX}source-dependency:${component(partitionKey)}` +
    `${component(sourceFileId)}:${ordinal}`;
}

function createController() {
  let call = 0;
  let armed = null;
  const trace = [];
  return {
    trace,
    reset() {
      call = 0;
      armed = null;
      trace.length = 0;
    },
    failAt(callNumber, timing = 'before', kind = 'quota') {
      armed = { call: callNumber, timing, kind };
    },
    async around(type, detail, work) {
      call += 1;
      trace.push({ call, timing: 'before', type, detail: clone(detail) });
      if (armed && armed.call === call && armed.timing === 'before') {
        const failure = armed;
        armed = null;
        throw new Error(failure.kind === 'quota'
          ? 'QUOTA_BYTES raw truth detail'
          : 'worker lost raw truth detail');
      }
      const result = await work();
      trace.push({ call, timing: 'after', type, detail: clone(detail) });
      if (armed && armed.call === call && armed.timing === 'after') {
        const failure = armed;
        armed = null;
        throw new Error(failure.kind === 'quota'
          ? 'QUOTA_BYTES raw truth detail'
          : 'worker lost raw truth detail');
      }
      return result;
    },
    count() {
      return call;
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
      return controller.around('storage.getBytesInUse', { keys }, async () =>
        Buffer.byteLength(JSON.stringify(selected(keys)), 'utf8'));
    }
  };
  return { values, storageArea, controller };
}

function createHarness(options = {}) {
  const clock = options.clock || { value: 1700000000000 };
  const fake = createStorage(options.initial || {}, options.controller || createController());
  const store = truthStore.create({
    storageArea: fake.storageArea,
    truthSchema,
    corpusSchema,
    now: () => clock.value,
    byteLength(value) {
      return Buffer.byteLength(value, 'utf8');
    }
  });
  return { ...fake, store, clock };
}

async function mutate(store, work, controller = new AbortController()) {
  const guard = store.issueMutation(controller.signal);
  assert.ok(guard && Object.isFrozen(guard), 'truth store issues a frozen own mutation guard');
  assert.strictEqual(guard.signal, controller.signal, 'truth guard binds the exact live signal');
  try {
    return await work(guard);
  } finally {
    assert.equal(store.finishMutation(guard).status, 'finished',
      'truth mutation reaches terminal cleanup');
  }
}

async function evidenceFor(sourceFileId, contentFingerprint, offset) {
  const fragmentGenerationId = await graphSchema.deriveFragmentGenerationId({
    schemaVersion: graphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint
  });
  const text = 'executed effective replacement';
  const evidence = await graphSchema.parseEvidenceLocator({
    excerptId: `excerpt_${offset}`,
    start: 0,
    end: 8
  }, {
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    excerpts: [{
      excerptId: `excerpt_${offset}`,
      text,
      sourceByteStart: offset,
      sourceByteEnd: offset + Buffer.byteLength(text, 'utf8')
    }]
  });
  assert.ok(evidence, 'graph evidence fixture parses');
  return evidence;
}

async function citationFor(evidence, recordVersionId) {
  const identity = {
    schemaVersion: truthSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: evidence.sourceFileId,
    contentFingerprint: evidence.contentFingerprint,
    fragmentGenerationId: evidence.fragmentGenerationId,
    recordVersionId,
    relationVersionId: null,
    locatorId: evidence.locatorId,
    sourceByteStart: evidence.sourceByteStart,
    sourceByteEnd: evidence.sourceByteEnd
  };
  return {
    ...identity,
    excerptId: evidence.excerptId,
    start: evidence.start,
    end: evidence.end,
    citationId: await truthSchema.deriveCitationId(identity)
  };
}

function axis(value, reasonCode, citationIds, records, relations = []) {
  return {
    value,
    reasonCode,
    citationIds: citationIds.slice().sort(),
    inputRecordVersionIds: records.slice().sort(),
    inputRelationVersionIds: relations.slice().sort(),
    trustState: 'extracted',
    basis: 'direct'
  };
}

async function makeProof({ familyOrdinal = 1, sourceIds = [SOURCE_A, SOURCE_B] } = {}) {
  const documents = [hexId('sri1:', familyOrdinal), hexId('sri1:', familyOrdinal + 100)].sort();
  const familyInput = {
    identityVersion: truthSchema.IDENTITY_VERSION,
    partitionKey: PARTITION,
    documentStableIds: documents,
    lineageRelationIds: [RELATION_A]
  };
  const familyId = await truthSchema.deriveFamilyId(familyInput);
  const evidence = [];
  const citations = [];
  const sourceBindings = [];
  for (let index = 0; index < sourceIds.length; index += 1) {
    const sourceFileId = sourceIds[index];
    const fingerprint = sourceFileId === SOURCE_A ? FINGERPRINT_A : FINGERPRINT_B;
    const locator = await evidenceFor(sourceFileId, fingerprint, 100 + index * 100);
    evidence.push(locator);
    citations.push(await citationFor(locator, index === 0 ? RECORD_A : RECORD_B));
    sourceBindings.push({
      sourceFileId,
      contentFingerprint: fingerprint,
      fragmentGenerationId: locator.fragmentGenerationId,
      sourceState: 'ready',
      certified: true
    });
  }
  citations.sort((left, right) => left.citationId < right.citationId
    ? -1
    : left.citationId > right.citationId ? 1 : 0);
  sourceBindings.sort((left, right) => left.sourceFileId < right.sourceFileId
    ? -1
    : left.sourceFileId > right.sourceFileId ? 1 : 0);
  const citationIds = citations.map((item) => item.citationId);
  const recordIds = sourceIds.length === 1 ? [RECORD_A] : [RECORD_A, RECORD_B];
  const proof = {
    schemaVersion: truthSchema.VERSION,
    partitionKey: PARTITION,
    familyId,
    authorizedSetDigest: `sgx1:${'a'.repeat(64)}`,
    sourceBindings,
    documentStableIds: documents,
    lineageRelationIds: [RELATION_A],
    recordVersionIds: recordIds.slice().sort(),
    relationVersionIds: [RELATION_A],
    candidateGenerationIds: [hexId('stg1:', familyOrdinal)],
    candidateSchemaVersion: truthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: truthSchema.PROMPT_VERSION,
    adjudicationVersion: truthSchema.ADJUDICATION_VERSION,
    deadlineRuleVersion: truthSchema.DEADLINE_RULE_VERSION,
    calendarVersion: truthSchema.CALENDAR_VERSION,
    evaluationContext: {
      asOfCivilDate: '2026-07-23',
      governingTimezoneBinding: {
        kind: 'cited',
        timezone: 'America/Chicago',
        citationIds
      },
      calendars: []
    },
    lineageProof: {
      schemaVersion: truthSchema.VERSION,
      partitionKey: PARTITION,
      familyId,
      execution: axis('executed', 'executed-evidence', citationIds, recordIds),
      temporal: axis('effective', 'effective-as-of-date', citationIds, recordIds),
      lineageRole: axis(
        'full-replacement',
        'lineage-full-replacement-evidence',
        citationIds,
        recordIds,
        [RELATION_A]
      ),
      governance: axis(
        'governing',
        'governing-path-accepted',
        citationIds,
        recordIds,
        [RELATION_A]
      ),
      acceptedPath: recordIds.slice().sort(),
      overlays: [],
      inheritances: []
    },
    assertions: [],
    conflicts: [],
    citations,
    deadlineRules: [],
    deadlineResults: []
  };
  const parsed = await truthSchema.parseSemanticFamilyProof(proof);
  assert.ok(parsed, 'semantic family proof fixture parses through the Plan 01 schema');
  return parsed;
}

async function makeCitationCapProof() {
  const base = clone(await makeProof({
    familyOrdinal: 13,
    sourceIds: [SOURCE_A]
  }));
  const evidence = await evidenceFor(SOURCE_A, FINGERPRINT_A, 100);
  const recordVersionIds = Array.from({
    length: truthSchema.LIMITS.MAX_FAMILY_CITATIONS
  }, (_, index) => hexId('srv1:', index + 1));
  const citations = await Promise.all(recordVersionIds.map((recordVersionId) =>
    citationFor(evidence, recordVersionId)));
  citations.sort((left, right) => left.citationId.localeCompare(right.citationId));
  base.recordVersionIds = recordVersionIds;
  base.citations = citations;
  base.evaluationContext.governingTimezoneBinding.citationIds =
    citations.map((citation) => citation.citationId).sort();
  const parsed = await truthSchema.parseSemanticFamilyProof(base);
  assert.ok(parsed, 'exact 2,048-citation semantic proof parses');
  return parsed;
}

function replacementInput(proof) {
  return {
    schemaVersion: proof.schemaVersion,
    partitionKey: proof.partitionKey,
    familyId: proof.familyId,
    authorizedSetDigest: proof.authorizedSetDigest,
    sourceBindings: proof.sourceBindings,
    recordVersionIds: proof.recordVersionIds,
    relationVersionIds: proof.relationVersionIds,
    candidateGenerationIds: proof.candidateGenerationIds,
    candidateSchemaVersion: proof.candidateSchemaVersion,
    promptVersion: proof.promptVersion,
    adjudicationVersion: proof.adjudicationVersion,
    deadlineRuleVersion: proof.deadlineRuleVersion,
    calendarVersion: proof.calendarVersion,
    evaluationContext: proof.evaluationContext
  };
}

async function stageAndPublish(store, proof) {
  const priorMetadata = await store.inspectMetadata({
    partitionKey: proof.partitionKey
  });
  const priorFamilyIds = priorMetadata
    ? priorMetadata.families.map((family) => family.familyId)
    : [];
  const handle = await mutate(store,
    (guard) => store.beginFamilyReplacement(replacementInput(proof), guard));
  assert.equal(handle && handle.status, 'staging', 'family replacement opens an opaque staging handle');
  assert.equal(await store.readActiveFamily({
    partitionKey: proof.partitionKey,
    familyId: proof.familyId
  }), null, 'staging never falls back to a prior or orphan snapshot');
  const staged = await mutate(store,
    (guard) => store.stageFamilySnapshot(handle, proof, guard));
  assert.equal(staged && staged.status, 'staged',
    'one complete parsed semantic proof stages deterministically');
  assert.ok(staged && staged.manifest &&
    staged.manifest.snapshotId.startsWith('sts1:'), 'store returns its parsed sts1 manifest');
  const published = await mutate(store,
    (guard) => store.publishFamilySnapshot(handle, staged.manifest, guard));
  assert.equal(published && published.status, 'published',
    'only the store-created parsed manifest publishes');
  assert.equal(await store.readActiveFamily({
    partitionKey: proof.partitionKey,
    familyId: proof.familyId
  }), null, 'a family snapshot is unreadable until the complete partition generation commits');
  const familyIds = Array.from(new Set(priorFamilyIds.concat([proof.familyId]))).sort();
  const generation = await mutate(store,
    (guard) => store.publishPartitionGeneration({
      partitionKey: proof.partitionKey,
      authorizedSetDigest: proof.authorizedSetDigest,
      familyIds
    }, guard));
  assert.equal(generation && generation.status, 'published',
    'the complete family set publishes through one partition generation');
  assert.match(generation.outputGenerationId, /^stp1:[0-9a-f]{64}$/,
    'partition publication returns its immutable output generation');
  return { handle, manifest: staged.manifest, published, generation };
}

async function readCompleteDisplayFamilySet(store, partitionKey) {
  const before = await store.inspectMetadata({ partitionKey });
  if (!before || !before.outputGenerationId) return null;
  if (!Array.isArray(before.families) || before.families.length > 32) return null;
  const members = before.families.slice().sort((left, right) =>
    left.familyId < right.familyId ? -1 : left.familyId > right.familyId ? 1 : 0);
  const proofs = [];
  for (const member of members) {
    const proof = await store.readActiveFamily({
      partitionKey,
      familyId: member.familyId
    });
    if (!proof || proof.familyId !== member.familyId) return null;
    proofs.push(proof);
  }
  const after = await store.inspectMetadata({ partitionKey });
  if (JSON.stringify(after) !== JSON.stringify(before)) return null;
  return Object.freeze(proofs);
}

async function stagePublishedFamily(store, proof) {
  const handle = await mutate(store,
    (guard) => store.beginFamilyReplacement(replacementInput(proof), guard));
  assert.equal(handle && handle.status, 'staging');
  const staged = await mutate(store,
    (guard) => store.stageFamilySnapshot(handle, proof, guard));
  assert.equal(staged && staged.status, 'staged');
  const published = await mutate(store,
    (guard) => store.publishFamilySnapshot(handle, staged.manifest, guard));
  assert.equal(published && published.status, 'published');
  return { handle, manifest: staged.manifest, published };
}

async function attemptPublication(store, proof) {
  const handle = await mutate(store,
    (guard) => store.beginFamilyReplacement(replacementInput(proof), guard));
  if (!handle || handle.status !== 'staging') return handle;
  const staged = await mutate(store,
    (guard) => store.stageFamilySnapshot(handle, proof, guard));
  if (!staged || staged.status !== 'staged') return staged;
  const published = await mutate(store,
    (guard) => store.publishFamilySnapshot(handle, staged.manifest, guard));
  if (!published || published.status !== 'published') return published;
  return mutate(store,
    (guard) => store.publishPartitionGeneration({
      partitionKey: proof.partitionKey,
      authorizedSetDigest: proof.authorizedSetDigest,
      familyIds: [proof.familyId]
    }, guard));
}

function recreateStore(harness) {
  return truthStore.create({
    storageArea: harness.storageArea,
    truthSchema,
    corpusSchema,
    now: () => harness.clock.value,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
}

async function testSurfaceAndPointerLast() {
  assert.strictEqual(globalThis.FsbSkopeoTruthStore, truthStore,
    'classic global and CommonJS truth-store exports match');
  assert.deepEqual(Object.keys(truthStore).sort(), ['LIMITS', 'VERSION', 'create'],
    'truth store exposes only version, limits, and factory');
  assert.equal(truthStore.VERSION, VERSION, 'truth store version is exact');
  assert.equal(Object.isFrozen(truthStore), true, 'truth store module is frozen');
  assert.deepEqual(truthStore.LIMITS, Object.freeze(Object.assign(Object.create(null), {
    MAX_SOURCES_PER_FAMILY: 32,
    MAX_ASSERTIONS_PER_FAMILY: 2048,
    MAX_CONFLICTS_PER_FAMILY: 512,
    MAX_FAMILY_CITATIONS: 2048,
    MAX_DEADLINES_PER_FAMILY: 512,
    MAX_LINEAGE_ENTRIES: 128,
    MAX_PAGES_PER_CATEGORY: 64,
    MAX_ENTRIES_PER_PAGE: 256,
    MAX_VALUE_BYTES: 262144,
    MAX_SNAPSHOT_BYTES: 8388608,
    MAX_FAMILIES_PER_SOURCE: 1024,
    MAX_RECOVERY_STEPS: 128,
    MAX_DIAGNOSTICS: 100,
    MAX_DIAGNOSTIC_BYTES: 65536,
    DIAGNOSTIC_RETENTION_MS: 2592000000
  })), 'truth storage, dependency, recovery, and diagnostic limits are exact');

  assert.throws(() => truthStore.create({
    storageArea: createStorage().storageArea,
    truthSchema: Object.freeze({ ...truthSchema, LIMITS: { MAX_FAMILY_CITATIONS: 2047 } }),
    corpusSchema,
    now: () => 0,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  }), /Invalid Skopeo truth store dependencies/,
  'construction rejects a noncanonical schema or citation-cap mismatch');

  const harness = createHarness();
  assert.deepEqual(Object.keys(harness.store).sort(), [
    'appendDiagnostic',
    'beginFamilyReplacement',
    'finishMutation',
    'getPurgeParticipant',
    'graphInvalidator',
    'inspectMetadata',
    'issueMutation',
    'publishFamilySnapshot',
    'publishPartitionGeneration',
    'readActiveFamily',
    'readActiveFamilyMetadata',
    'recover',
    'stageFamilySnapshot',
    'withdrawFamiliesForSources'
  ].sort(), 'created truth store exposes only the planned opaque protocol');
  assert.equal(Object.isFrozen(harness.store), true, 'created truth store is frozen');
  assert.deepEqual(Object.keys(harness.store.graphInvalidator).sort(),
    ['withdrawOverlayChange', 'withdrawSourceChange'],
    'graph invalidator exposes only the two exact change methods');
  assert.equal(Object.isFrozen(harness.store.graphInvalidator), true,
    'graph invalidator is frozen');
  assert.equal(harness.store.getPurgeParticipant('fragments'), null,
    'truth store cannot impersonate a non-citations corpus participant');

  const punctuationProof = await makeProof({
    familyOrdinal: 19,
    sourceIds: ['a-b', 'a_b']
  });
  const punctuationHarness = createHarness();
  await stageAndPublish(punctuationHarness.store, punctuationProof);

  const proof = await makeProof();
  const legacyDigestReplacement = {
    ...replacementInput(proof),
    authorizedSetDigest: `sha256:${'f'.repeat(64)}`
  };
  assert.deepEqual(
    await mutate(
      harness.store,
      (guard) => harness.store.beginFamilyReplacement(legacyDigestReplacement, guard)
    ),
    Object.freeze(Object.assign(Object.create(null), {
      ok: false,
      status: 'validation-failed'
    })),
    'a content fingerprint cannot impersonate an exact authorized graph-set digest'
  );
  harness.controller.reset();
  const staged = await stageAndPublish(harness.store, proof);
  const active = await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  });
  assert.deepEqual(active, proof, 'active semantic proof round-trips exactly');
  assert.equal(Object.isFrozen(active), true, 'active proof is schema-frozen');
  const metadata = await harness.store.readActiveFamilyMetadata({
    partitionKey: PARTITION,
    familyId: proof.familyId
  });
  assert.equal(metadata.snapshotId, staged.manifest.snapshotId,
    'active metadata names only the exact published snapshot');
  assert.deepEqual(metadata.sourceBindings, proof.sourceBindings,
    'active metadata retains the exact certified source binding set');

  const mutations = harness.controller.trace.filter((entry) =>
    entry.timing === 'before' &&
    (entry.type === 'storage.set' || entry.type === 'storage.remove'));
  assert.equal(mutations.at(-1).type, 'storage.set', 'publication ends in one set');
  assert.match(JSON.stringify(mutations.at(-1).detail), /"kind":"truth-generation-control"/,
    'the complete partition generation pointer is written last');
  assert.equal(Object.keys(harness.values).every((key) => key.startsWith(PREFIX)), true,
    'every durable truth key uses the literal trusted prefix');
  assert.equal(Object.keys(harness.values).some((key) =>
    key.includes(`${PARTITION.length}:${PARTITION}`) &&
    key.includes(`${proof.familyId.length}:${proof.familyId}`)), true,
  'truth keys use length-prefixed partition and family components');
  assert.doesNotMatch(JSON.stringify(harness.values),
    /raw provider|full source text|filename|https?:\/\/|Bearer|api[_-]?key|raw truth detail/i,
    'durable truth bytes contain no raw source/provider/error/credential material');

  const cloneManifest = clone(staged.manifest);
  const clonePublish = await mutate(harness.store,
    (guard) => harness.store.publishFamilySnapshot(staged.handle, cloneManifest, guard));
  assert.equal(clonePublish.ok, false,
    'value-equivalent caller manifest cannot forge the store-created identity');
  const cloneHandle = clone(staged.handle);
  const cloneStage = await mutate(harness.store,
    (guard) => harness.store.stageFamilySnapshot(cloneHandle, proof, guard));
  assert.equal(cloneStage.ok, false, 'value-equivalent caller handle cannot forge staging authority');

  const pageKey = Object.keys(harness.values).find((key) => key.includes('page:'));
  assert.ok(pageKey, 'published snapshot owns independently hashed pages');
  harness.values[pageKey] = { ...clone(harness.values[pageKey]), pageHash: `sha256:${'f'.repeat(64)}` };
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  }), null, 'a corrupt page hash closes the complete active projection');
}

async function testSymmetricDependenciesAndGraphInvalidator() {
  const harness = createHarness();
  const shared = await makeProof({ familyOrdinal: 4, sourceIds: [SOURCE_A, SOURCE_B] });
  const sibling = await makeProof({ familyOrdinal: 5, sourceIds: [SOURCE_A] });
  await stageAndPublish(harness.store, shared);
  await stageAndPublish(harness.store, sibling);
  assert.ok(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: shared.familyId
  }), 'multi-source family is active before dependency withdrawal');

  const withdrawn = await mutate(harness.store,
    (guard) => harness.store.withdrawFamiliesForSources({
      partitionKey: PARTITION,
      sourceFileIds: [SOURCE_B],
      reason: 'access-revoked'
    }, guard));
  assert.equal(withdrawn.status, 'withdrawn',
    'one exact source invalidates every reverse-dependent family');
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: shared.familyId
  }), null, 'source dependency withdrawal clears the family pointer first');
  assert.deepEqual(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: sibling.familyId
  }), sibling, 'sibling family not depending on the source remains byte-identical');

  const signal = new AbortController().signal;
  const sourceResult = await harness.store.graphInvalidator.withdrawSourceChange(
    Object.freeze({
      partitionKey: PARTITION,
      sourceFileId: SOURCE_A,
      priorFragmentGenerationId: shared.sourceBindings[0].fragmentGenerationId,
      nextFragmentGenerationId: null,
      reason: 'access-revoked'
    }),
    signal
  );
  assert.deepEqual(sourceResult, Object.freeze(Object.assign(Object.create(null), { ok: true })),
    'graph source invalidator owns and finishes an internal truth mutation');
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: sibling.familyId
  }), null, 'graph source change withdraws remaining source-dependent truth');

  const republished = await makeProof({ familyOrdinal: 6, sourceIds: [SOURCE_A, SOURCE_B] });
  await stageAndPublish(harness.store, republished);
  const overlayResult = await harness.store.graphInvalidator.withdrawOverlayChange(
    Object.freeze({
      partitionKey: PARTITION,
      proposingSourceFileId: SOURCE_A,
      affectedSourceFileIds: [SOURCE_A, SOURCE_B].sort(),
      priorOverlayGenerationId: `sog1:${'1'.repeat(64)}`,
      nextOverlayGenerationId: `sog1:${'2'.repeat(64)}`,
      reason: 'complete'
    }),
    signal
  );
  assert.deepEqual(overlayResult, sourceResult,
    'graph overlay invalidator returns the same exact fixed success');
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: republished.familyId
  }), null, 'overlay proposer/target union withdraws every affected family');

  const aborted = new AbortController();
  aborted.abort('test abort');
  const abortedResult = await harness.store.graphInvalidator.withdrawSourceChange(
    Object.freeze({
      partitionKey: PARTITION,
      sourceFileId: SOURCE_A,
      priorFragmentGenerationId: null,
      nextFragmentGenerationId: null,
      reason: 'recovery-pending'
    }),
    aborted.signal
  );
  assert.deepEqual(abortedResult, Object.freeze(Object.assign(Object.create(null), { ok: false })),
    'aborted graph invalidation fails closed without raw signal reason');
}

function capabilityHarness() {
  const records = new WeakMap();
  function issue(mode, request) {
    const capability = Object.freeze({
      toJSON() { throw new TypeError('not serializable'); }
    });
    records.set(capability, {
      mode,
      request,
      signal: new AbortController().signal,
      operationEpoch: 17,
      active: true
    });
    return capability;
  }
  function verify(capability, mode, request) {
    const record = records.get(capability);
    if (!record || !record.active || record.mode !== mode || record.request !== request) return null;
    return Object.freeze({
      signal: record.signal,
      operationEpoch: record.operationEpoch
    });
  }
  function revoke(capability) {
    const record = records.get(capability);
    if (record) record.active = false;
  }
  return { issue, verify, revoke };
}

async function testPartitionGenerationRetiresDisappearedFamilies() {
  const harness = createHarness();
  const prior = await makeProof({ familyOrdinal: 15, sourceIds: [SOURCE_A] });
  const next = await makeProof({ familyOrdinal: 16, sourceIds: [SOURCE_A] });
  const first = await stageAndPublish(harness.store, prior);
  assert.deepEqual(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: prior.familyId
  }), prior, 'the first complete output generation exposes its only family');

  const handle = await mutate(harness.store,
    (guard) => harness.store.beginFamilyReplacement(replacementInput(next), guard));
  const staged = await mutate(harness.store,
    (guard) => harness.store.stageFamilySnapshot(handle, next, guard));
  const published = await mutate(harness.store,
    (guard) => harness.store.publishFamilySnapshot(handle, staged.manifest, guard));
  assert.equal(published.status, 'published');
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: next.familyId
  }), null, 'a newly published snapshot cannot escape the prior output generation');

  const replacement = await mutate(harness.store,
    (guard) => harness.store.publishPartitionGeneration({
      partitionKey: PARTITION,
      authorizedSetDigest: next.authorizedSetDigest,
      familyIds: [next.familyId]
    }, guard));
  assert.equal(replacement.status, 'published');
  assert.notEqual(replacement.outputGenerationId, first.generation.outputGenerationId,
    'a changed complete family set derives a different output generation');
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: prior.familyId
  }), null, 'a family omitted by the new output generation is retired and unreadable');
  assert.deepEqual(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: next.familyId
  }), next, 'the replacement generation exposes only its named family');
  const metadata = await harness.store.inspectMetadata({ partitionKey: PARTITION });
  assert.equal(metadata.outputGenerationId, replacement.outputGenerationId);
  assert.deepEqual(metadata.families.map((family) => family.familyId), [next.familyId],
    'partition metadata projects only complete current-generation membership');

  const restarted = recreateStore(harness);
  await mutate(restarted, (guard) => restarted.recover(guard));
  assert.equal(await restarted.readActiveFamily({
    partitionKey: PARTITION,
    familyId: prior.familyId
  }), null, 'recovery cannot resurrect a family retired by output generation replacement');
}

async function testCompleteDisplayReadUsesOneStableGeneration() {
  const harness = createHarness();
  const proofA = await makeProof({ familyOrdinal: 120, sourceIds: [SOURCE_A] });
  const proofB = await makeProof({ familyOrdinal: 121, sourceIds: [SOURCE_B] });
  await stagePublishedFamily(harness.store, proofB);
  await stagePublishedFamily(harness.store, proofA);
  await mutate(harness.store, (guard) => harness.store.publishPartitionGeneration({
    partitionKey: PARTITION,
    authorizedSetDigest: proofA.authorizedSetDigest,
    familyIds: [proofA.familyId, proofB.familyId].sort()
  }, guard));

  const complete = await readCompleteDisplayFamilySet(harness.store, PARTITION);
  assert.deepEqual(complete.map((proof) => proof.familyId),
    [proofA.familyId, proofB.familyId].sort(),
    'display composition reads every family in deterministic metadata order');
  assert.ok(Object.isFrozen(complete), 'complete display composition is frozen');

  let metadataReads = 0;
  const driftedStore = {
    async inspectMetadata(input) {
      metadataReads += 1;
      const metadata = await harness.store.inspectMetadata(input);
      if (metadataReads !== 2 || !metadata) return metadata;
      return Object.freeze({
        ...metadata,
        outputGenerationId: hexId('stp1:', 9999)
      });
    },
    readActiveFamily: harness.store.readActiveFamily
  };
  assert.equal(await readCompleteDisplayFamilySet(driftedStore, PARTITION), null,
    'generation drift returns no partial display prefix');

  const missingMemberStore = {
    inspectMetadata: harness.store.inspectMetadata,
    async readActiveFamily(input) {
      if (input.familyId === proofB.familyId) return null;
      return harness.store.readActiveFamily(input);
    }
  };
  assert.equal(await readCompleteDisplayFamilySet(missingMemberStore, PARTITION), null,
    'a missing generation member returns no partial display prefix');
}

async function testRealCitationsParticipant() {
  const harness = createHarness();
  const proof = await makeProof({ familyOrdinal: 7 });
  await stageAndPublish(harness.store, proof);
  const binder = harness.store.getPurgeParticipant('citations');
  assert.equal(typeof binder, 'function', 'citations exposes one corpus registration binder');
  assert.equal(harness.store.getPurgeParticipant('citations'), null,
    'citations binder can be issued only once');
  const capabilities = capabilityHarness();
  const participant = binder(capabilities.verify);
  assert.deepEqual(Object.keys(participant).sort(),
    ['hasOwnedInfluence', 'purgePartition', 'purgeSource'],
    'citations participant exposes the exact corpus adapter shape');
  assert.equal(binder(capabilities.verify), null, 'citations binder itself is one-use');

  const request = Object.freeze({
    partitionKey: PARTITION,
    accountPermissionId: CLAIM.accountPermissionId,
    corpusRootFileId: CLAIM.corpusRootFileId,
    sourceFileId: SOURCE_B,
    reason: 'access-revoked'
  });
  const wrong = await participant.purgeSource(request, Object.freeze({}));
  assert.deepEqual(wrong, Object.freeze(Object.assign(Object.create(null), { ok: false })),
    'forged participant capability performs no citation purge');
  assert.ok(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  }), 'forged purge leaves active truth unchanged');

  const capability = capabilities.issue('purge-source', request);
  const purged = await participant.purgeSource(request, capability);
  capabilities.revoke(capability);
  assert.deepEqual(purged, Object.freeze(Object.assign(Object.create(null), { ok: true })),
    'fresh exact source authorization purges citation-owned truth');
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  }), null, 'authorized citation purge leaves no readable family');
  const repeatedCapability = capabilities.issue('purge-source', request);
  assert.equal((await participant.purgeSource(request, repeatedCapability)).ok, true,
    'repeated exact source citation purge is idempotent');
  capabilities.revoke(repeatedCapability);
  const wrongModeCapability = capabilities.issue('purge-partition', request);
  assert.equal((await participant.purgeSource(request, wrongModeCapability)).ok, false,
    'source citation purge rejects a partition-mode capability');
  capabilities.revoke(wrongModeCapability);

  const verifyCapability = capabilities.issue('verify-source', request);
  const absence = await participant.hasOwnedInfluence(request, verifyCapability);
  capabilities.revoke(verifyCapability);
  assert.deepEqual(absence, Object.freeze(Object.assign(Object.create(null), { owned: false })),
    'authorized absence proof reparses all citation ownership as absent');

  const partitionProof = await makeProof({ familyOrdinal: 8, sourceIds: [SOURCE_A] });
  await stageAndPublish(harness.store, partitionProof);
  await mutate(harness.store, (guard) => harness.store.appendDiagnostic({
    partitionKey: PARTITION,
    operation: 'purge',
    outcome: 'success',
    reason: 'complete',
    attemptedCount: 1,
    acceptedCount: 1,
    publishedCount: 0,
    withdrawnCount: 1,
    durationMs: 10,
    retryCount: 0,
    repairCount: 0,
    recoveryCode: 'none'
  }, guard));
  const partitionRequest = Object.freeze({
    partitionKey: PARTITION,
    accountPermissionId: CLAIM.accountPermissionId,
    corpusRootFileId: CLAIM.corpusRootFileId,
    sourceFileId: null,
    reason: 'root-replaced'
  });
  const partitionCapability = capabilities.issue('purge-partition', partitionRequest);
  assert.equal((await participant.purgePartition(partitionRequest, partitionCapability)).ok, true,
    'literal-null partition authorization purges the exact truth partition');
  capabilities.revoke(partitionCapability);
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: partitionProof.familyId
  }), null, 'partition citation purge leaves no truth fallback');
  assert.equal(Object.values(harness.values).some((value) =>
    value && value.kind === 'diagnostic-ledger'), false,
  'partition citation purge removes its partition-owned diagnostic ledger');
  const repeatedPartitionCapability = capabilities.issue(
    'purge-partition', partitionRequest);
  assert.equal((await participant.purgePartition(
    partitionRequest, repeatedPartitionCapability)).ok, true,
  'repeated exact partition citation purge is idempotent');
  capabilities.revoke(repeatedPartitionCapability);
}

async function testDeterministicRecreationAndRecovery() {
  const harness = createHarness();
  const proof = await makeProof({ familyOrdinal: 9 });
  await stageAndPublish(harness.store, proof);
  const bytes = JSON.stringify(harness.values);
  const first = truthStore.create({
    storageArea: harness.storageArea,
    truthSchema,
    corpusSchema,
    now: () => harness.clock.value,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
  assert.match((await mutate(first, (guard) => first.recover(guard))).status,
    /^(?:complete|repaired)$/, 'fresh worker completes bounded durable-only recovery');
  assert.equal(JSON.stringify(harness.values), bytes,
    'clean recovery preserves deterministic bytes');
  assert.deepEqual(await first.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  }), proof, 'fresh worker reconstructs the exact schema-parsed proof');

  const second = truthStore.create({
    storageArea: harness.storageArea,
    truthSchema,
    corpusSchema,
    now: () => harness.clock.value,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
  assert.equal((await mutate(second, (guard) => second.recover(guard))).status, 'complete',
    'second fresh worker repeats clean recovery');
  assert.equal(JSON.stringify(harness.values), bytes,
    'second recovery is byte-identical and idempotent');
}

async function testGenerationAuthorityRecoveryConverges() {
  const cases = [{
    name: 'corrupt generation hash',
    mutate(harness, generationKey) {
      harness.values[generationKey] = {
        ...clone(harness.values[generationKey]),
        recordHash: `sha256:${'e'.repeat(64)}`
      };
    }
  }, {
    name: 'missing generation record',
    mutate(harness, generationKey) {
      delete harness.values[generationKey];
    }
  }, {
    name: 'corrupt generation control',
    mutate(harness, _generationKey, controlKey) {
      harness.values[controlKey] = {
        ...clone(harness.values[controlKey]),
        controlHash: `sha256:${'d'.repeat(64)}`
      };
    }
  }, {
    name: 'missing generation control',
    mutate(harness, _generationKey, controlKey) {
      delete harness.values[controlKey];
    }
  }, {
    name: 'generation key identity mismatch',
    mutate(harness, generationKey) {
      harness.values[`${generationKey}:wrong`] = harness.values[generationKey];
      delete harness.values[generationKey];
    }
  }];

  for (const [index, item] of cases.entries()) {
    const harness = createHarness();
    const proof = await makeProof({ familyOrdinal: 30 + index });
    await stageAndPublish(harness.store, proof);
    const generationKey = Object.keys(harness.values).find((key) =>
      harness.values[key] && harness.values[key].kind === 'truth-generation');
    const controlKey = Object.keys(harness.values).find((key) =>
      harness.values[key] &&
      harness.values[key].kind === 'truth-generation-control');
    assert.ok(generationKey && controlKey, `${item.name} starts with complete authority`);
    item.mutate(harness, generationKey, controlKey);

    const restarted = recreateStore(harness);
    assert.equal(await restarted.readActiveFamily({
      partitionKey: PARTITION,
      familyId: proof.familyId
    }), null, `${item.name} closes reads before recovery`);
    const first = await mutate(restarted, (guard) => restarted.recover(guard));
    assert.equal(first.status, 'repaired',
      `${item.name} is explicitly withheld instead of reported complete`);
    assert.equal(await restarted.readActiveFamily({
      partitionKey: PARTITION,
      familyId: proof.familyId
    }), null, `${item.name} never reconstructs generation authority`);
    assert.equal(Object.values(harness.values).some((value) =>
      value && (value.kind === 'truth-generation' ||
        value.kind === 'truth-generation-control')), false,
    `${item.name} leaves no dangling generation record or pointer`);
    assert.equal(Object.values(harness.values).some((value) =>
      value && value.kind === 'family-control' &&
      value.state === 'published'), false,
    `${item.name} withholds family controls outside valid generation membership`);

    const repairedBytes = JSON.stringify(harness.values);
    const resumed = recreateStore(harness);
    assert.equal((await mutate(
      resumed, (guard) => resumed.recover(guard))).status, 'complete',
    `${item.name} is complete on a fresh-worker restart`);
    assert.equal(JSON.stringify(harness.values), repairedBytes,
      `${item.name} recovery is byte-idempotent`);
  }

  const healthy = createHarness();
  const healthyProofs = [];
  for (let index = 0;
    index < truthStore.LIMITS.MAX_RECOVERY_STEPS - 1;
    index += 1) {
    const proof = await makeProof({ familyOrdinal: 1000 + index });
    await stagePublishedFamily(healthy.store, proof);
    healthyProofs.push(proof);
  }
  const healthyFamilyIds = healthyProofs
    .map((proof) => proof.familyId)
    .sort();
  assert.equal((await mutate(healthy.store,
    (guard) => healthy.store.publishPartitionGeneration({
      partitionKey: PARTITION,
      authorizedSetDigest: healthyProofs[0].authorizedSetDigest,
      familyIds: healthyFamilyIds
    }, guard))).status, 'published',
  '127 healthy controls publish through one exact active generation');
  const healthyInitial = clone(healthy.values);
  const healthyAuthorityBytes = JSON.stringify(healthy.values);

  const firstHealthyRecovery = recreateStore(healthy);
  assert.equal((await mutate(
    firstHealthyRecovery,
    (guard) => firstHealthyRecovery.recover(guard)
  )).status, 'recovery-pending',
  'the first healthy high-cardinality pass remains bounded');
  const firstProgress = clone(Object.values(healthy.values).find((value) =>
    value && value.kind === 'recovery-progress'));
  assert.ok(firstProgress &&
    firstProgress.nextTaskOrdinal === truthStore.LIMITS.MAX_RECOVERY_STEPS &&
    firstProgress.taskCount > truthStore.LIMITS.MAX_RECOVERY_STEPS * 2,
  'the first pass durably checkpoints its exact deterministic task ordinal');

  const secondHealthyRecovery = recreateStore(healthy);
  assert.equal((await mutate(
    secondHealthyRecovery,
    (guard) => secondHealthyRecovery.recover(guard)
  )).status, 'recovery-pending',
  'a fresh MV3 worker resumes the healthy recovery cursor');
  const secondProgress = clone(Object.values(healthy.values).find((value) =>
    value && value.kind === 'recovery-progress'));
  assert.ok(secondProgress &&
    secondProgress.inventoryDigest === firstProgress.inventoryDigest &&
    secondProgress.nextTaskOrdinal > firstProgress.nextTaskOrdinal,
  'the durable cursor advances over the unchanged truth inventory');

  const thirdHealthyRecovery = recreateStore(healthy);
  assert.equal((await mutate(
    thirdHealthyRecovery,
    (guard) => thirdHealthyRecovery.recover(guard)
  )).status, 'complete',
  'healthy authority larger than 128 tasks converges across restarts');
  const completedProgressKey = Object.keys(healthy.values).find((key) =>
    healthy.values[key] && healthy.values[key].kind === 'recovery-progress');
  assert.ok(completedProgressKey &&
    healthy.values[completedProgressKey].nextTaskOrdinal ===
      healthy.values[completedProgressKey].taskCount,
  'successful high-cardinality recovery retains a completed checkpoint');
  const recoveredAuthority = clone(healthy.values);
  delete recoveredAuthority[completedProgressKey];
  assert.equal(JSON.stringify(recoveredAuthority), healthyAuthorityBytes,
    'healthy cursor recovery preserves every authority byte');
  assert.deepEqual(await thirdHealthyRecovery.readActiveFamily({
    partitionKey: PARTITION,
    familyId: healthyProofs.at(-1).familyId
  }), healthyProofs.at(-1),
  'high-cardinality recovery preserves exact active generation membership');
  const completedHealthyBytes = JSON.stringify(healthy.values);
  const idempotentHealthyRecovery = recreateStore(healthy);
  assert.equal((await mutate(
    idempotentHealthyRecovery,
    (guard) => idempotentHealthyRecovery.recover(guard)
  )).status, 'complete',
  'a repeated high-cardinality recovery remains complete');
  assert.equal(JSON.stringify(healthy.values), completedHealthyBytes,
    'repeated high-cardinality recovery is byte-idempotent');

  const corruptCursor = createHarness({ initial: healthyInitial });
  const firstCursorWorker = recreateStore(corruptCursor);
  assert.equal((await mutate(
    firstCursorWorker,
    (guard) => firstCursorWorker.recover(guard)
  )).status, 'recovery-pending',
  'cursor corruption begins from one bounded durable prefix');
  const corruptProgressKey = Object.keys(corruptCursor.values).find((key) =>
    corruptCursor.values[key] &&
    corruptCursor.values[key].kind === 'recovery-progress');
  corruptCursor.values[corruptProgressKey] = {
    ...clone(corruptCursor.values[corruptProgressKey]),
    nextTaskOrdinal: corruptCursor.values[corruptProgressKey].taskCount
  };
  const corruptCursorWorker = recreateStore(corruptCursor);
  assert.equal((await mutate(
    corruptCursorWorker,
    (guard) => corruptCursorWorker.recover(guard)
  )).status, 'recovery-pending',
  'a corrupt cursor cannot skip unvalidated recovery tasks');
  assert.equal(Object.values(corruptCursor.values).some((value) =>
    value && value.kind === 'recovery-progress' &&
    value.nextTaskOrdinal === truthStore.LIMITS.MAX_RECOVERY_STEPS), true,
  'cursor corruption restarts at the first bounded task window');
  let corruptCursorResult = { ok: false };
  for (let pass = 0; pass < 3 && corruptCursorResult.ok !== true; pass += 1) {
    const worker = recreateStore(corruptCursor);
    corruptCursorResult = await mutate(
      worker, (guard) => worker.recover(guard));
  }
  assert.equal(corruptCursorResult.status, 'repaired',
    'cursor corruption converges without changing healthy authority');
  const corruptCursorIdempotent = recreateStore(corruptCursor);
  assert.equal((await mutate(
    corruptCursorIdempotent,
    (guard) => corruptCursorIdempotent.recover(guard)
  )).status, 'complete',
  'the repaired cursor checkpoint is idempotent on restart');

  const invalidated = createHarness({ initial: healthyInitial });
  const firstInvalidatedWorker = recreateStore(invalidated);
  assert.equal((await mutate(
    firstInvalidatedWorker,
    (guard) => firstInvalidatedWorker.recover(guard)
  )).status, 'recovery-pending',
  'the invalidation case begins with a durable healthy prefix');
  const invalidatedProgress = clone(Object.values(invalidated.values).find((value) =>
    value && value.kind === 'recovery-progress'));
  const scannedControlKey = Object.keys(invalidated.values).filter((key) =>
    key.startsWith(`${PREFIX}control:`)).sort()[0];
  delete invalidated.values[scannedControlKey];
  invalidated.controller.reset();
  const changedWorker = recreateStore(invalidated);
  const changedResult = await mutate(
    changedWorker, (guard) => changedWorker.recover(guard));
  assert.equal(changedResult.status, 'recovery-pending',
    'a removed already-scanned entry cannot inherit the old cursor prefix');
  assert.equal(invalidated.controller.trace.some((entry) =>
    entry.timing === 'before' &&
    entry.type === 'storage.set' &&
    Object.values(entry.detail.update || {}).some((value) =>
      value && value.kind === 'recovery-progress' &&
      value.nextTaskOrdinal === 0 &&
      value.inventoryDigest !== invalidatedProgress.inventoryDigest)), true,
  'inventory invalidation durably resets recovery to task zero');
  assert.equal(await changedWorker.readActiveFamily({
    partitionKey: PARTITION,
    familyId: healthyProofs[0].familyId
  }), null,
  'invalidated active membership stays fail-closed during resumed recovery');
  let invalidatedResult = changedResult;
  for (let pass = 0; pass < 8 && invalidatedResult.ok !== true; pass += 1) {
    const worker = recreateStore(invalidated);
    invalidatedResult = await mutate(
      worker, (guard) => worker.recover(guard));
  }
  assert.equal(invalidatedResult.status, 'repaired',
    'cursor invalidation converges to explicit all-or-nothing withholding');
  assert.equal(Object.values(invalidated.values).some((value) =>
    value && (value.kind === 'truth-generation' ||
      value.kind === 'truth-generation-control' ||
      (value.kind === 'family-control' && value.state === 'published'))), false,
  'an invalidated generation leaves no partial active membership');
  const invalidatedBytes = JSON.stringify(invalidated.values);
  const invalidatedIdempotentWorker = recreateStore(invalidated);
  assert.equal((await mutate(
    invalidatedIdempotentWorker,
    (guard) => invalidatedIdempotentWorker.recover(guard)
  )).status, 'complete',
  'invalidated recovery is complete on the next fresh worker');
  assert.equal(JSON.stringify(invalidated.values), invalidatedBytes,
    'invalidated recovery is byte-idempotent');

  const validOrphans = createHarness();
  for (let index = 0;
    index < truthStore.LIMITS.MAX_RECOVERY_STEPS + 1;
    index += 1) {
    const authorizedSetDigest =
      `sgx1:${index.toString(16).padStart(64, '0')}`;
    const identity = {
      version: VERSION,
      partitionKey: PARTITION,
      authorizedSetDigest,
      families: []
    };
    const identityHash = await truthSchema.sha256Hex(identity);
    const outputGenerationId =
      `stp1:${identityHash.slice('sha256:'.length)}`;
    const body = {
      version: VERSION,
      kind: 'truth-generation',
      partitionKey: PARTITION,
      outputGenerationId,
      authorizedSetDigest,
      families: []
    };
    validOrphans.values[
      `${PREFIX}generation:${component(PARTITION)}` +
      component(outputGenerationId)
    ] = {
      ...body,
      recordHash: await truthSchema.sha256Hex(body)
    };
  }
  assert.equal((await mutate(
    validOrphans.store, (guard) => validOrphans.store.recover(guard)
  )).status, 'recovery-pending',
  'more than 128 valid orphan generations still obey the shared task bound');
  assert.equal(Object.values(validOrphans.values).filter((value) =>
    value && value.kind === 'truth-generation').length, 1,
  'valid orphan cleanup makes durable monotonic progress before returning');
  const validOrphanRestart = recreateStore(validOrphans);
  assert.equal((await mutate(
    validOrphanRestart, (guard) => validOrphanRestart.recover(guard)
  )).status, 'repaired',
  'a fresh worker removes the remaining valid orphan generation');
  assert.equal(Object.values(validOrphans.values).some((value) =>
    value && (value.kind === 'truth-generation' ||
      value.kind === 'recovery-progress')), false,
  'valid orphan cleanup removes both garbage and its cursor');
  const validOrphanBytes = JSON.stringify(validOrphans.values);
  const validOrphanIdempotent = recreateStore(validOrphans);
  assert.equal((await mutate(
    validOrphanIdempotent,
    (guard) => validOrphanIdempotent.recover(guard)
  )).status, 'complete',
  'valid orphan cleanup converges idempotently');
  assert.equal(JSON.stringify(validOrphans.values), validOrphanBytes,
    'valid orphan cleanup has stable final bytes');

  const bounded = createHarness();
  for (let index = 0;
    index < truthStore.LIMITS.MAX_RECOVERY_STEPS + 1;
    index += 1) {
    bounded.values[
      `${PREFIX}generation:orphan-${String(index).padStart(3, '0')}`
    ] = { hostile: true };
  }
  assert.equal((await mutate(
    bounded.store, (guard) => bounded.store.recover(guard)
  )).status, 'recovery-pending',
  'generation recovery stops at the shared 128-work-item bound');
  assert.equal((await mutate(
    bounded.store, (guard) => bounded.store.recover(guard)
  )).status, 'repaired',
  'a later bounded pass removes the remaining generation record');
  assert.equal((await mutate(
    bounded.store, (guard) => bounded.store.recover(guard)
  )).status, 'complete',
  'bounded generation cleanup converges idempotently');
}

async function testGenerationPointerSwitchFaults() {
  const prior = await makeProof({ familyOrdinal: 40, sourceIds: [SOURCE_A] });
  const next = await makeProof({ familyOrdinal: 41, sourceIds: [SOURCE_A] });

  async function preparedHarness() {
    const harness = createHarness();
    await stageAndPublish(harness.store, prior);
    await stagePublishedFamily(harness.store, next);
    harness.controller.reset();
    return harness;
  }

  const baseline = await preparedHarness();
  const switched = await mutate(baseline.store,
    (guard) => baseline.store.publishPartitionGeneration({
      partitionKey: PARTITION,
      authorizedSetDigest: next.authorizedSetDigest,
      familyIds: [next.familyId]
    }, guard));
  assert.equal(switched.status, 'published');
  const generationWrite = baseline.controller.trace.find((entry) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
    /"kind":"truth-generation"/.test(JSON.stringify(entry.detail)));
  const pointerWrite = baseline.controller.trace.find((entry) =>
    entry.timing === 'before' && entry.type === 'storage.set' &&
    /"kind":"truth-generation-control"/.test(JSON.stringify(entry.detail)));
  assert.ok(generationWrite && pointerWrite &&
    generationWrite.call < pointerWrite.call,
  'the immutable generation is durable before its control switch');
  assert.equal(baseline.controller.trace.some((entry) =>
    entry.call > pointerWrite.call &&
    (entry.type === 'storage.remove' || entry.type === 'storage.set')), true,
  'retired-family cleanup and generation GC occur only after the control switch');

  for (const timing of ['before', 'after']) {
    const harness = await preparedHarness();
    harness.controller.failAt(pointerWrite.call, timing, 'worker');
    const result = await mutate(harness.store,
      (guard) => harness.store.publishPartitionGeneration({
        partitionKey: PARTITION,
        authorizedSetDigest: next.authorizedSetDigest,
        familyIds: [next.familyId]
      }, guard));
    assert.equal(result.status, 'recovery-pending',
      `${timing}-switch failure exposes a fixed non-success state`);

    const expected = timing === 'before' ? prior : next;
    const retired = timing === 'before' ? next : prior;
    const restarted = recreateStore(harness);
    assert.deepEqual(await restarted.readActiveFamily({
      partitionKey: PARTITION,
      familyId: expected.familyId
    }), expected, `${timing}-switch failure preserves one healthy generation`);
    assert.equal(await restarted.readActiveFamily({
      partitionKey: PARTITION,
      familyId: retired.familyId
    }), null, `${timing}-switch failure never exposes both generations`);

    assert.equal((await mutate(
      restarted, (guard) => restarted.recover(guard))).status, 'repaired',
    `${timing}-switch recovery converges interrupted cleanup`);
    assert.deepEqual(await restarted.readActiveFamily({
      partitionKey: PARTITION,
      familyId: expected.familyId
    }), expected, `${timing}-switch recovery retains the durable authority`);
    const repairedBytes = JSON.stringify(harness.values);
    const resumed = recreateStore(harness);
    assert.equal((await mutate(
      resumed, (guard) => resumed.recover(guard))).status, 'complete',
    `${timing}-switch restart is clean and idempotent`);
    assert.equal(JSON.stringify(harness.values), repairedBytes);
  }
}

async function testDiagnosticBoundsAndPrivacy() {
  const harness = createHarness();
  const forbidden = {
    partitionKey: PARTITION,
    operation: 'diagnostic',
    outcome: 'failure',
    reason: 'validation-failed',
    attemptedCount: 1,
    acceptedCount: 0,
    publishedCount: 0,
    withdrawnCount: 0,
    durationMs: 1,
    retryCount: 0,
    repairCount: 0,
    recoveryCode: 'none',
    sourceFileId: SOURCE_A,
    rawError: 'Bearer private-token https://provider.invalid/file'
  };
  const rejected = await mutate(harness.store,
    (guard) => harness.store.appendDiagnostic(forbidden, guard));
  assert.equal(rejected.ok, false,
    'diagnostics reject IDs, provider failures, URLs, and arbitrary fields structurally');
  assert.doesNotMatch(JSON.stringify(harness.values),
    /private-token|provider\.invalid|source-alpha/,
    'rejected diagnostic bytes never enter durable storage');

  for (let index = 0; index < 105; index += 1) {
    const recorded = await mutate(harness.store,
      (guard) => harness.store.appendDiagnostic({
        partitionKey: PARTITION,
        operation: index % 2 ? 'recovery' : 'publish',
        outcome: index % 3 ? 'success' : 'failure',
        reason: index % 3 ? 'complete' : 'recovery-pending',
        attemptedCount: Number.MAX_SAFE_INTEGER,
        acceptedCount: index,
        publishedCount: index,
        withdrawnCount: 0,
        durationMs: index * 100,
        retryCount: index,
        repairCount: index,
        recoveryCode: index % 3 ? 'none' : 'repaired'
      }, guard));
    assert.equal(recorded.status, 'recorded', 'bounded diagnostic append succeeds');
  }
  const ledger = Object.values(harness.values).find((value) =>
    value && value.kind === 'diagnostic-ledger');
  assert.ok(ledger, 'partition-owned diagnostic ledger is durable');
  assert.equal(ledger.records.length, 100, 'diagnostic ledger retains exactly the newest 100');
  assert.ok(Buffer.byteLength(JSON.stringify(ledger), 'utf8') <= 65536,
    'diagnostic ledger remains below the exact 64 KiB cap');
  assert.equal(ledger.records.every((record) =>
    record.attemptedCount === 1000000 &&
    Number.isFinite(record.retryCount) &&
    Number.isFinite(record.repairCount)), true,
  'diagnostic counters are finite and saturate at the fixed cap');
  assert.equal(ledger.records.every((record) =>
    record.timestamp % 3600000 === 0), true,
  'diagnostic timestamps are coarse hour buckets');
  assert.doesNotMatch(JSON.stringify(ledger),
    /source-alpha|source-beta|stf1:|Acme|2026-07-23|https?:|Bearer|api[_-]?key/i,
    'diagnostic records contain no source/family IDs, dates, labels, URLs, or credentials');

  harness.clock.value += truthStore.LIMITS.DIAGNOSTIC_RETENTION_MS + 3600000;
  await mutate(harness.store, (guard) => harness.store.appendDiagnostic({
    partitionKey: PARTITION,
    operation: 'recovery',
    outcome: 'success',
    reason: 'complete',
    attemptedCount: 0,
    acceptedCount: 0,
    publishedCount: 0,
    withdrawnCount: 0,
    durationMs: 0,
    retryCount: 0,
    repairCount: 0,
    recoveryCode: 'none'
  }, guard));
  const retained = Object.values(harness.values).find((value) =>
    value && value.kind === 'diagnostic-ledger');
  assert.equal(retained.records.length, 1,
    'diagnostic append expires records older than 30 days');
}

async function testRecoveryClosesCorruptionAndBoundsWork() {
  const harness = createHarness();
  const proof = await makeProof({ familyOrdinal: 10 });
  await stageAndPublish(harness.store, proof);
  const pageKey = Object.keys(harness.values).find((key) =>
    key.startsWith(`${PREFIX}page:`) &&
    harness.values[key].snapshotId);
  harness.values[pageKey] = {
    ...clone(harness.values[pageKey]),
    recordHash: `sha256:${'e'.repeat(64)}`
  };
  assert.equal(await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  }), null, 'hash corruption closes reads before recovery');
  const restarted = recreateStore(harness);
  const first = await mutate(restarted, (guard) => restarted.recover(guard));
  assert.match(first.status, /^(?:repaired|recovery-pending)$/,
    'bounded recovery closes a corrupt published pointer');
  assert.equal(await restarted.readActiveFamily({
    partitionKey: PARTITION,
    familyId: proof.familyId
  }), null, 'recovery never resurrects a corrupt snapshot');
  const second = await mutate(restarted, (guard) => restarted.recover(guard));
  assert.match(second.status, /^(?:complete|repaired|recovery-pending)$/,
    'a later bounded pass safely resumes corrupt cleanup');
  assert.equal(Object.values(harness.values).some((value) =>
    value && value.familyId === proof.familyId &&
    (value.kind === 'family-dependency' ||
      value.kind === 'snapshot-manifest' ||
      value.kind === 'snapshot-page' ||
      value.kind === 'lineage-overlay')), false,
  'corrupt recovery removes every family-owned immutable payload');
  assert.equal(Object.values(harness.values).some((value) =>
    value && value.kind === 'source-dependency-page' &&
    value.entries.some((entry) => entry.familyId === proof.familyId)), false,
  'corrupt recovery removes both directions of the dependency relation');

  const bounded = createHarness();
  for (let index = 0; index < truthStore.LIMITS.MAX_RECOVERY_STEPS + 1; index += 1) {
    bounded.values[`${PREFIX}control:orphan-${String(index).padStart(3, '0')}`] = {
      hostile: true
    };
  }
  const boundedResult = await mutate(bounded.store,
    (guard) => bounded.store.recover(guard));
  assert.equal(boundedResult.status, 'recovery-pending',
    'recovery stops after exactly 128 sorted work items');
  assert.deepEqual((await bounded.store.inspectMetadata({
    partitionKey: PARTITION
  })).families, [], 'malformed controls cannot produce a visible family projection');
  const boundedSecond = await mutate(bounded.store,
    (guard) => bounded.store.recover(guard));
  assert.match(boundedSecond.status, /^(?:complete|repaired)$/,
    'a later pass removes the bounded remainder deterministically');
}

async function testBeforeAfterStorageFaults() {
  const proof = await makeProof({ familyOrdinal: 11 });
  const baseline = createHarness();
  assert.equal((await attemptPublication(baseline.store, proof)).status, 'published',
    'fault-matrix publication baseline succeeds');
  const publicationCalls = baseline.controller.count();
  assert.ok(publicationCalls > 20,
    'publication fault matrix spans page, manifest, dependency, and pointer awaits');

  for (let call = 1; call <= publicationCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness();
      harness.controller.failAt(call, timing, call % 2 ? 'quota' : 'worker');
      const result = await attemptPublication(harness.store, proof);
      assert.match(String(result && result.status),
        /^(?:published|quota-exceeded|recovery-pending|stale-operation|dependency-mismatch)$/,
      `publication ${timing} await ${call} exposes only a fixed result`);
      assert.doesNotMatch(JSON.stringify(result),
        /QUOTA_BYTES|worker lost|raw truth detail/i,
      `publication ${timing} await ${call} exposes no raw storage failure`);
      const restarted = recreateStore(harness);
      const recovery = await mutate(restarted, (guard) => restarted.recover(guard));
      assert.match(recovery.status,
        /^(?:complete|repaired|recovery-pending)$/,
      `publication ${timing} await ${call} has a bounded recovery result`);
      const active = await restarted.readActiveFamily({
        partitionKey: PARTITION,
        familyId: proof.familyId
      });
      assert.ok(active === null ||
        JSON.stringify(active) === JSON.stringify(proof),
      `publication ${timing} await ${call} exposes one complete snapshot or absence`);
      const publishedControls = Object.values(harness.values).filter((value) =>
        value && value.kind === 'family-control' && value.familyId === proof.familyId &&
        value.state === 'published');
      assert.ok(publishedControls.length <= 1,
        `publication ${timing} await ${call} never creates dual active pointers`);
    }
  }

  const withdrawalBaseline = createHarness();
  await stageAndPublish(withdrawalBaseline.store, proof);
  withdrawalBaseline.controller.reset();
  assert.equal((await mutate(withdrawalBaseline.store,
    (guard) => withdrawalBaseline.store.withdrawFamiliesForSources({
      partitionKey: PARTITION,
      sourceFileIds: [SOURCE_B],
      reason: 'access-revoked'
    }, guard))).status, 'withdrawn', 'fault-matrix withdrawal baseline succeeds');
  const withdrawalCalls = withdrawalBaseline.controller.count();
  for (let call = 1; call <= withdrawalCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness();
      await stageAndPublish(harness.store, proof);
      harness.controller.reset();
      harness.controller.failAt(call, timing, call % 2 ? 'worker' : 'quota');
      const result = await mutate(harness.store,
        (guard) => harness.store.withdrawFamiliesForSources({
          partitionKey: PARTITION,
          sourceFileIds: [SOURCE_B],
          reason: 'access-revoked'
        }, guard));
      assert.equal(typeof (result && result.status), 'string',
        `withdrawal ${timing} await ${call} returns one fixed status`);
      const restarted = recreateStore(harness);
      await mutate(restarted, (guard) => restarted.recover(guard));
      const active = await restarted.readActiveFamily({
        partitionKey: PARTITION,
        familyId: proof.familyId
      });
      assert.ok(active === null ||
        JSON.stringify(active) === JSON.stringify(proof),
      `withdrawal ${timing} await ${call} exposes complete truth or complete absence`);
    }
  }
}

function safeDiagnosticInput() {
  return {
    partitionKey: PARTITION,
    operation: 'recovery',
    outcome: 'success',
    reason: 'complete',
    attemptedCount: 1,
    acceptedCount: 1,
    publishedCount: 0,
    withdrawnCount: 0,
    durationMs: 10,
    retryCount: 0,
    repairCount: 0,
    recoveryCode: 'none'
  };
}

async function testInvalidationDiagnosticAndRecoveryFaults() {
  const proof = await makeProof({ familyOrdinal: 12 });

  const invalidationBaseline = createHarness();
  await stageAndPublish(invalidationBaseline.store, proof);
  invalidationBaseline.controller.reset();
  assert.equal((await invalidationBaseline.store.graphInvalidator.withdrawSourceChange(
    Object.freeze({
      partitionKey: PARTITION,
      sourceFileId: SOURCE_B,
      priorFragmentGenerationId: proof.sourceBindings[1].fragmentGenerationId,
      nextFragmentGenerationId: null,
      reason: 'access-revoked'
    }),
    new AbortController().signal
  )).ok, true, 'graph invalidation fault baseline succeeds');
  const invalidationCalls = invalidationBaseline.controller.count();
  for (let call = 1; call <= invalidationCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness();
      await stageAndPublish(harness.store, proof);
      harness.controller.reset();
      harness.controller.failAt(call, timing, call % 2 ? 'quota' : 'worker');
      const result = await harness.store.graphInvalidator.withdrawSourceChange(
        Object.freeze({
          partitionKey: PARTITION,
          sourceFileId: SOURCE_B,
          priorFragmentGenerationId: proof.sourceBindings[1].fragmentGenerationId,
          nextFragmentGenerationId: null,
          reason: 'access-revoked'
        }),
        new AbortController().signal
      );
      assert.ok(result.ok === true || result.ok === false,
        `graph invalidation ${timing} await ${call} returns exact fixed success/failure`);
      assert.doesNotMatch(JSON.stringify(result),
        /QUOTA_BYTES|worker lost|raw truth detail/i,
      `graph invalidation ${timing} await ${call} reveals no storage error`);
      const restarted = recreateStore(harness);
      await mutate(restarted, (guard) => restarted.recover(guard));
      const active = await restarted.readActiveFamily({
        partitionKey: PARTITION,
        familyId: proof.familyId
      });
      assert.ok(active === null || JSON.stringify(active) === JSON.stringify(proof),
        `graph invalidation ${timing} await ${call} converges to exact truth or absence`);
    }
  }

  const diagnosticBaseline = createHarness();
  diagnosticBaseline.controller.reset();
  assert.equal((await mutate(diagnosticBaseline.store,
    (guard) => diagnosticBaseline.store.appendDiagnostic(
      safeDiagnosticInput(), guard))).status, 'recorded',
  'diagnostic fault baseline succeeds');
  const diagnosticCalls = diagnosticBaseline.controller.count();
  for (let call = 1; call <= diagnosticCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness();
      harness.controller.failAt(call, timing, call % 2 ? 'worker' : 'quota');
      const result = await mutate(harness.store,
        (guard) => harness.store.appendDiagnostic(safeDiagnosticInput(), guard));
      assert.equal(typeof result.status, 'string',
        `diagnostic ${timing} await ${call} returns one fixed status`);
      assert.doesNotMatch(JSON.stringify(result),
        /QUOTA_BYTES|worker lost|raw truth detail/i,
      `diagnostic ${timing} await ${call} reveals no storage error`);
      const ledger = Object.values(harness.values).find((value) =>
        value && value.kind === 'diagnostic-ledger');
      assert.ok(!ledger ||
        (ledger.records.length === 1 &&
          Buffer.byteLength(JSON.stringify(ledger), 'utf8') <= 65536),
      `diagnostic ${timing} await ${call} leaves a complete ledger or absence`);
    }
  }

  const recoveryBaseline = createHarness();
  await mutate(recoveryBaseline.store,
    (guard) => recoveryBaseline.store.beginFamilyReplacement(
      replacementInput(proof), guard));
  recoveryBaseline.controller.reset();
  const recoveryStore = recreateStore(recoveryBaseline);
  assert.match((await mutate(recoveryStore,
    (guard) => recoveryStore.recover(guard))).status, /^(?:complete|repaired)$/,
  'orphan-staging recovery baseline converges');
  const recoveryCalls = recoveryBaseline.controller.count();
  for (let call = 1; call <= recoveryCalls; call += 1) {
    for (const timing of ['before', 'after']) {
      const harness = createHarness();
      await mutate(harness.store,
        (guard) => harness.store.beginFamilyReplacement(
          replacementInput(proof), guard));
      harness.controller.reset();
      harness.controller.failAt(call, timing, call % 2 ? 'quota' : 'worker');
      const first = recreateStore(harness);
      const result = await mutate(first, (guard) => first.recover(guard));
      assert.equal(typeof result.status, 'string',
        `recovery ${timing} await ${call} returns one fixed status`);
      const second = recreateStore(harness);
      const resumed = await mutate(second, (guard) => second.recover(guard));
      assert.match(resumed.status,
        /^(?:complete|repaired|recovery-pending)$/,
      `recovery ${timing} await ${call} safely resumes on a fresh worker`);
      assert.equal(await second.readActiveFamily({
        partitionKey: PARTITION,
        familyId: proof.familyId
      }), null, `recovery ${timing} await ${call} never publishes orphan staging`);
    }
  }
}

async function testExactCitationAndDependencyCaps() {
  const capProof = await makeCitationCapProof();
  const harness = createHarness();
  await stageAndPublish(harness.store, capProof);
  const active = await harness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: capProof.familyId
  });
  assert.equal(active.citations.length, 2048,
    'the exact schema citation cap persists and revalidates across eight pages');
  const citationPages = Object.values(harness.values).filter((value) =>
    value && value.kind === 'snapshot-page' && value.category === 'citations');
  assert.equal(citationPages.length, 8,
    'the exact citation cap is deterministically split into 256-entry pages');
  assert.equal(citationPages.every((page) => page.itemCount === 256), true,
    'every exact-cap citation page is independently full and bounded');
  const manifestChunks = Object.values(harness.values).filter((value) =>
    value && value.kind === 'snapshot-manifest');
  assert.ok(manifestChunks.length > 1 &&
    manifestChunks.every((chunk) =>
      Buffer.byteLength(JSON.stringify(chunk), 'utf8') <= 262144),
  'the exact-cap manifest is independently hashed and split below 256 KiB per value');

  const overProof = clone(capProof);
  const extraRecord = hexId('srv1:', 2049);
  const evidence = await evidenceFor(SOURCE_A, FINGERPRINT_A, 100);
  const extraCitation = await citationFor(evidence, extraRecord);
  overProof.recordVersionIds = overProof.recordVersionIds.concat(extraRecord).sort();
  overProof.citations = overProof.citations.concat(extraCitation)
    .sort((left, right) => left.citationId.localeCompare(right.citationId));
  overProof.evaluationContext.governingTimezoneBinding.citationIds =
    overProof.citations.map((citation) => citation.citationId).sort();
  assert.equal(await truthSchema.parseSemanticFamilyProof(overProof), null,
    'the schema rejects citation max-plus-one before persistence');
  const overHarness = createHarness();
  const overHandle = await mutate(overHarness.store,
    (guard) => overHarness.store.beginFamilyReplacement(
      replacementInput(overProof), guard));
  const overResult = await mutate(overHarness.store,
    (guard) => overHarness.store.stageFamilySnapshot(
      overHandle, overProof, guard));
  assert.equal(overResult.ok, false,
    'truth staging rejects citation max-plus-one without snapshot pages');
  assert.equal(Object.values(overHarness.values).some((value) =>
    value && (value.kind === 'snapshot-page' ||
      value.kind === 'snapshot-manifest')), false,
  'citation max-plus-one writes no immutable payload');

  const dependencyProof = await makeProof({
    familyOrdinal: 14,
    sourceIds: [SOURCE_A]
  });
  const dependencyHarness = createHarness();
  const handle = await mutate(dependencyHarness.store,
    (guard) => dependencyHarness.store.beginFamilyReplacement(
      replacementInput(dependencyProof), guard));
  const staged = await mutate(dependencyHarness.store,
    (guard) => dependencyHarness.store.stageFamilySnapshot(
      handle, dependencyProof, guard));
  const entries = Array.from({
    length: truthStore.LIMITS.MAX_FAMILIES_PER_SOURCE
  }, (_, index) => ({
    familyId: hexId('stf1:', index + 1000),
    snapshotId: hexId('sts1:', index + 1000)
  })).sort((left, right) =>
    left.familyId.localeCompare(right.familyId) ||
    left.snapshotId.localeCompare(right.snapshotId));
  const pages = Array.from({ length: 4 }, (_, pageOrdinal) =>
    entries.slice(pageOrdinal * 256, (pageOrdinal + 1) * 256));
  for (let pageOrdinal = 0; pageOrdinal < pages.length; pageOrdinal += 1) {
    const payload = {
      partitionKey: PARTITION,
      sourceFileId: SOURCE_A,
      pageOrdinal,
      pageCount: pages.length,
      entries: pages[pageOrdinal]
    };
    const pageHash = await truthSchema.sha256Hex(payload);
    const body = {
      version: VERSION,
      kind: 'source-dependency-page',
      ...payload,
      pageHash
    };
    dependencyHarness.values[sourceDependencyStorageKey(
      PARTITION, SOURCE_A, pageOrdinal)] = {
      ...body,
      recordHash: await truthSchema.sha256Hex(body)
    };
  }
  const dependencyResult = await mutate(dependencyHarness.store,
    (guard) => dependencyHarness.store.publishFamilySnapshot(
      handle, staged.manifest, guard));
  assert.equal(dependencyResult.status, 'dependency-mismatch',
    'source reverse dependency max-plus-one fails before any page rewrite');
  assert.equal(await dependencyHarness.store.readActiveFamily({
    partitionKey: PARTITION,
    familyId: dependencyProof.familyId
  }), null, 'over-cap reverse dependencies cannot publish a family pointer');
  assert.equal(Object.values(dependencyHarness.values).filter((value) =>
    value && value.kind === 'source-dependency-page').length, 4,
  'dependency max-plus-one preserves the four original bounded pages byte-for-byte');
}

async function run() {
  console.log('--- Phase 56 Plan 04: immutable truth store contract ---');
  const started = Date.now();
  await testSurfaceAndPointerLast();
  await testSymmetricDependenciesAndGraphInvalidator();
  await testPartitionGenerationRetiresDisappearedFamilies();
  await testCompleteDisplayReadUsesOneStableGeneration();
  await testRealCitationsParticipant();
  await testDeterministicRecreationAndRecovery();
  await testGenerationAuthorityRecoveryConverges();
  await testGenerationPointerSwitchFaults();
  await testDiagnosticBoundsAndPrivacy();
  await testRecoveryClosesCorruptionAndBoundsWork();
  await testBeforeAfterStorageFaults();
  await testInvalidationDiagnosticAndRecoveryFaults();
  await testExactCitationAndDependencyCaps();
  const source = fs.readFileSync(STORE_PATH, 'utf8');
  for (const forbidden of [
    'indexedDB', 'drive.googleapis.com', 'chrome.identity', 'UniversalProvider',
    'MCP', 'eval(', 'new Function', 'raw source text'
  ]) {
    assert.equal(source.includes(forbidden), false,
      `truth store has no forbidden runtime dependency: ${forbidden}`);
  }
  assert.ok(Date.now() - started < 30000,
    'focused truth-store contract completes under 30 seconds');
  console.log('skopeo truth store contract: PASS');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
