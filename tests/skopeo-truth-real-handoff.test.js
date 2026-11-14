'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const VALIDATOR_PATH = path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto
  });
}
if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(fs.readFileSync(VALIDATOR_PATH, 'utf8'), {
    filename: VALIDATOR_PATH
  });
}

const CorpusSchema = require('../extension/utils/skopeo-corpus-schema.js');
const GraphSchema = require('../extension/utils/skopeo-graph-schema.js');
const GraphEngine = require('../extension/utils/skopeo-graph-engine.js');
const TruthSchema = require('../extension/utils/skopeo-truth-schema.js');
const DeadlineEngine = require('../extension/utils/skopeo-deadline-engine.js');
const LineageAdjudicator = require('../extension/utils/skopeo-lineage-adjudicator.js');
const TruthStore = require('../extension/utils/skopeo-truth-store.js');
const TruthEngine = require('../extension/utils/skopeo-truth-engine.js');

const ACCOUNT = 'permission-A';
const ROOT_FILE = 'root-A';
const SOURCE = 'handoff-source';
const PARTITION =
  `scpk1:${ACCOUNT.length}:${ACCOUNT}${ROOT_FILE.length}:${ROOT_FILE}`;
const FINGERPRINT = `sha256:${'1'.repeat(64)}`;
const PROVIDER_ID = 'synthetic';
const MODEL_ID = 'truth-v1';
const SOURCE_TEXT = 'Executed agreement';

function freezeTree(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      freezeTree(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function createStorageArea() {
  const values = Object.create(null);
  return Object.freeze({
    async get(keys) {
      const output = Object.create(null);
      if (keys === null) {
        for (const key of Object.keys(values)) output[key] = values[key];
      } else {
        const requested = Array.isArray(keys) ? keys : [keys];
        for (const key of requested) {
          if (Object.prototype.hasOwnProperty.call(values, key)) {
            output[key] = values[key];
          }
        }
      }
      return output;
    },
    async set(update) {
      for (const key of Object.keys(update)) values[key] = update[key];
    },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete values[key];
    }
  });
}

function certificate() {
  return Object.freeze({
    accountPermissionId: ACCOUNT,
    corpusRootFileId: ROOT_FILE,
    sourceFileId: SOURCE,
    sourceState: 'ready',
    contentFingerprint: FINGERPRINT
  });
}

function runCorpusOperation(kind, tuple, selection, callback, commit) {
  return (async () => {
    assert.equal(typeof tuple, 'object');
    assert.ok(kind === 'query' || kind === 'ingestion');
    const controller = new AbortController();
    const sourceCertificate = certificate();
    const prepared = selection.sourceFileId
      ? await callback(sourceCertificate, controller.signal)
      : await callback(
        Object.freeze([sourceCertificate]),
        Object.freeze({ complete: true }),
        controller.signal
      );
    if (typeof commit !== 'function') {
      return Object.freeze({ decision: 'admitted', value: prepared });
    }
    const publisher = Object.freeze({
      signal: controller.signal,
      publish(effect) {
        return effect(Object.freeze({
          signal: controller.signal,
          async validate() {
            return controller.signal.aborted === false;
          }
        }));
      }
    });
    const value = await commit(prepared, publisher, controller.signal);
    return Object.freeze({ decision: 'admitted', value });
  })();
}

function graphRecordProjection(record) {
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

function snapshotEvidence(locator) {
  return {
    partitionKey: locator.partitionKey,
    sourceFileId: locator.sourceFileId,
    contentFingerprint: locator.contentFingerprint,
    fragmentGenerationId: locator.fragmentGenerationId,
    locatorId: locator.locatorId,
    sourceByteStart: locator.sourceByteStart,
    sourceByteEnd: locator.sourceByteEnd
  };
}

async function graphFixture() {
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT
  });
  const graphBatch = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: 'handoff_batch_0001',
    records: [{
      candidateRef: 'agreement',
      kind: 'agreement',
      label: 'Executed agreement',
      evidence: [{ excerptId: 'excerpt_01', start: 0, end: 8 }]
    }],
    relations: []
  }, {
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'excerpt_01',
      text: SOURCE_TEXT,
      sourceByteStart: 0,
      sourceByteEnd: Buffer.byteLength(SOURCE_TEXT, 'utf8')
    }],
    batchOrdinal: 0,
    priorCandidates: []
  });
  assert.ok(graphBatch, 'real graph schema produces the handoff record');
  const fragment = await GraphSchema.parseFragment({
    schemaVersion: GraphSchema.VERSION,
    promptVersion: GraphSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    records: graphBatch.records.map(graphRecordProjection),
    relations: []
  });
  assert.ok(fragment, 'real graph schema produces the current fragment');
  return fragment;
}

function graphFacade(fragment) {
  const graphStore = Object.freeze({
    issueMutation() { return null; },
    finishMutation() { return Object.freeze({ ok: true }); },
    async withdrawSource() { return Object.freeze({ ok: true }); },
    async withdrawSourceIfCurrent() { return Object.freeze({ ok: true }); },
    async beginReplacement() { return null; },
    async stageBatch() { return null; },
    async sealStaging() { return null; },
    async publishReplacement() { return null; },
    async replaceCandidateRelations() { return null; },
    async readCurrentFragment(input) {
      return input.fragmentGenerationId === fragment.fragmentGenerationId
        ? fragment
        : null;
    },
    async inspectMetadata() {
      return Object.freeze({
        version: 1,
        state: 'published',
        schemaVersion: GraphSchema.VERSION,
        promptVersion: GraphSchema.PROMPT_VERSION,
        fragmentGenerationId: fragment.fragmentGenerationId,
        activeGenerationId: fragment.fragmentGenerationId,
        contentFingerprint: fragment.contentFingerprint,
        recordCount: fragment.records.length,
        relationCount: fragment.relations.length
      });
    }
  });
  const record = fragment.records[0];
  const graphQuery = Object.freeze({
    createScope() { return Object.freeze({}); },
    async ensureScopeCache() { return Object.freeze({ status: 'ready' }); },
    async getById() { return null; },
    async searchLexical() { return Object.freeze([]); },
    async neighbors() { return Object.freeze({ nodes: [], edges: [] }); },
    async inspectProvenance() { return null; },
    async snapshotExactSet() {
      return freezeTree({
        snapshotVersion: 'skopeo-graph-exact-set/1',
        partitionKey: PARTITION,
        sourceBindings: [{
          sourceFileId: SOURCE,
          contentFingerprint: FINGERPRINT,
          fragmentGenerationId: fragment.fragmentGenerationId
        }],
        records: [{
          partitionKey: PARTITION,
          sourceFileId: SOURCE,
          contentFingerprint: FINGERPRINT,
          fragmentGenerationId: fragment.fragmentGenerationId,
          kind: record.kind,
          label: record.label,
          evidence: record.evidence.map(snapshotEvidence),
          stableRecordId: record.stableRecordId,
          recordVersionId: record.recordVersionId
        }],
        relations: []
      });
    },
    releaseScope() { return true; }
  });
  const inertExtractor = Object.freeze({
    async prepareSource() { return null; },
    async verifyProviderBinding() { return null; },
    async nextBatch() { return null; },
    async repairBatch() { return null; },
    async finalize() { return null; },
    async reuseKey() { return null; },
    discard() {}
  });
  const facade = GraphEngine.create({
    graphSchema: GraphSchema,
    graphStore,
    graphExtractor: inertExtractor,
    graphQuery,
    corpusTransport: Object.freeze({ async readContent() { return null; } }),
    runCorpusOperation,
    async readSettings() {
      return { modelProvider: PROVIDER_ID, modelName: MODEL_ID };
    },
    providerFactory() { return Object.freeze({}); },
    now() { return 1; }
  });
  assert.ok(facade, 'real graph engine facade is constructed');
  return facade;
}

async function candidateGeneration(fragment, authorizedSetDigest) {
  const record = fragment.records[0];
  const locator = record.evidence[0];
  const generationInput = {
    schemaVersion: TruthSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId: fragment.fragmentGenerationId,
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    batchOrdinal: 0
  };
  const batch = await TruthSchema.parseCandidateEnvelope({
    schemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    batchId: 'truth_handoff_0001',
    executionCandidates: [{
      candidateRef: 'execution:1',
      documentHandle: 'document:1',
      executionState: 'executed',
      evidenceHandles: ['evidence:1']
    }],
    effectivenessCandidates: [{
      candidateRef: 'effectiveness:1',
      documentHandle: 'document:1',
      effectiveDate: { kind: 'civil-date', value: '2020-01-01' },
      evidenceHandles: ['evidence:1']
    }],
    lineageCandidates: [],
    factCandidates: [],
    deadlineRuleCandidates: []
  }, {
    ...generationInput,
    documentHandles: [{
      handle: 'document:1',
      stableRecordId: record.stableRecordId,
      recordVersionId: record.recordVersionId
    }],
    clauseHandles: [],
    relationHandles: [],
    calendarHandles: [],
    evidenceHandles: [{ handle: 'evidence:1', locator }]
  });
  assert.ok(batch, 'real truth schema produces the candidate batch');
  return freezeTree({
    schemaVersion: TruthSchema.VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId: fragment.fragmentGenerationId,
    authorizedSetDigest,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    candidateGenerationIds: [batch.candidateGenerationId],
    batches: [batch]
  });
}

async function main() {
  assert.strictEqual(globalThis.FsbSkopeoCorpusSchema, CorpusSchema);
  const fragment = await graphFixture();
  const graph = graphFacade(fragment);
  const graphResult = await graph.snapshotExactSet(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ sourceFileIds: Object.freeze([SOURCE]) })
  );
  assert.equal(graphResult.decision, 'admitted');
  assert.match(graphResult.value.authorizedSetDigest, /^sgx1:[0-9a-f]{64}$/);

  const generation = await candidateGeneration(
    fragment,
    graphResult.value.authorizedSetDigest
  );
  const truthStore = TruthStore.create({
    storageArea: createStorageArea(),
    truthSchema: TruthSchema,
    corpusSchema: CorpusSchema,
    now: () => 1000,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
  const adjudicator = LineageAdjudicator.create({
    truthSchema: TruthSchema,
    deadlineEngine: DeadlineEngine,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
  assert.ok(adjudicator, 'real lineage adjudicator is constructed');

  const extractionSessions = new WeakSet();
  const truthExtractor = Object.freeze({
    async prepareSource(_certificate, signal, readContent, digest, registry) {
      assert.equal(digest, graphResult.value.authorizedSetDigest);
      await readContent(async () => {}, signal);
      assert.equal(registry.documentHandles.length, 1);
      assert.equal(registry.evidenceHandles.length, 1);
      const session = Object.freeze({});
      extractionSessions.add(session);
      return Object.freeze({
        session,
        providerBinding: Object.freeze({
          providerId: PROVIDER_ID,
          modelId: MODEL_ID
        })
      });
    },
    async verifyProviderBinding(session) {
      return extractionSessions.has(session)
        ? Object.freeze({ status: 'provider-binding-current' })
        : null;
    },
    async nextBatch(session) {
      return extractionSessions.has(session)
        ? Object.freeze({ status: 'complete' })
        : null;
    },
    async repairBatch() { return null; },
    async finalize(session) {
      return extractionSessions.has(session) ? generation : null;
    },
    discard(session) {
      extractionSessions.delete(session);
      return Object.freeze({ status: 'discarded' });
    }
  });
  const evaluationContext = TruthSchema.parseEvaluationContext({
    asOfCivilDate: '2026-07-24',
    governingTimezoneBinding: {
      kind: 'configured',
      timezone: 'America/Chicago',
      configurationId: 'contract-governing-timezone',
      configurationVersion: 'v1'
    },
    calendars: []
  });
  assert.ok(evaluationContext);

  const truth = TruthEngine.create({
    truthSchema: TruthSchema,
    truthStore,
    truthExtractor,
    lineageAdjudicator: adjudicator,
    deadlineEngine: DeadlineEngine,
    graphFacade: graph,
    corpusTransport: Object.freeze({
      async readContent(_tuple, _input, sink, signal) {
        await sink(Object.freeze({
          byteHash: FINGERPRINT,
          exactByteLength: Buffer.byteLength(SOURCE_TEXT, 'utf8'),
          text: SOURCE_TEXT
        }), signal);
        return Object.freeze({ kind: 'ok' });
      }
    }),
    runCorpusOperation,
    async readVisibleSourceSet() {
      return Object.freeze({
        status: 'ready',
        partitionKey: PARTITION,
        sourceBindings: Object.freeze([Object.freeze({
          sourceFileId: SOURCE,
          sourceState: 'ready',
          contentFingerprint: FINGERPRINT
        })])
      });
    },
    async validateEvaluationContext({ evaluationContext: current }) {
      const digest = await TruthSchema.sha256Hex(current);
      return Object.freeze({
        ok: true,
        contextDigest: digest.slice('sha256:'.length)
      });
    },
    async readSettings() {
      return Object.freeze({
        modelProvider: PROVIDER_ID,
        modelName: MODEL_ID
      });
    },
    providerFactory() { return Object.freeze({}); },
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
  assert.ok(truth, 'real truth engine is constructed');

  const published = await truth.recompute(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ evaluationContext })
  );
  assert.equal(published.status, 'published',
    `real graph-to-store handoff publishes: ${JSON.stringify(published)}`);
  assert.equal(published.familyIds.length, 1);
  const proof = await truthStore.readActiveFamily({
    partitionKey: PARTITION,
    familyId: published.familyIds[0]
  });
  assert.ok(proof, 'real truth store returns the published semantic proof');
  assert.equal(proof.authorizedSetDigest, graphResult.value.authorizedSetDigest);
  assert.equal(proof.lineageProof.governance.value, 'governing');
  console.log('skopeo real graph-to-truth-store handoff: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
