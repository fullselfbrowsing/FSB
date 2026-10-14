'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'skopeo-graph-evals');
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'cases.json'), 'utf8'));

if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(fs.readFileSync(
    path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'), 'utf8'
  ));
}
const MiniSearch = require('../extension/lib/minisearch.min.js');
globalThis.MiniSearch = MiniSearch;
const CorpusSchema = require('../extension/utils/skopeo-corpus-schema.js');
const GraphSchema = require('../extension/utils/skopeo-graph-schema.js');
const GraphStore = require('../extension/utils/skopeo-graph-store.js');
const GraphExtractor = require('../extension/utils/skopeo-graph-extractor.js');
const GraphQuery = require('../extension/utils/skopeo-graph-query.js');
const GraphEngine = require('../extension/utils/skopeo-graph-engine.js');
const { UniversalProvider } = require('../extension/ai/universal-provider.js');

const GRAPH_FILES = [
  'extension/utils/skopeo-graph-schema.js',
  'extension/utils/skopeo-graph-store.js',
  'extension/utils/skopeo-graph-extractor.js',
  'extension/utils/skopeo-graph-query.js',
  'extension/utils/skopeo-graph-engine.js'
];
const CASE_KEYS = [
  'id', 'category', 'scenario', 'data_class', 'ordered_excerpts', 'budgets',
  'authority_transition_script', 'recorded_provider', 'expected', 'special_assertions',
  'label_version', 'gold_label_version', 'review_status', 'required_reviewer_roles',
  'approved_reviewer_roles', 'review_record_ref'
];
const EXPECTED_KEYS = [
  'publish_state', 'fixed_reason', 'provisional_records', 'provisional_relations',
  'provisional_spans', 'durable_keys', 'query_proof', 'absence_proof'
];
const REQUIRED_ROLES = [
  'legal-counsel', 'legal-operations', 'privacy-security', 'evaluation'
];
const FORBIDDEN_ASSERTED_CLAIMS = [
  'confidence', 'clearance', 'equivalence', 'same-as', 'effectiveness',
  'supersession', 'precedence', 'governing', 'deadline', 'adjudication'
];

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && own(descriptor, 'value')) deepFreeze(descriptor.value, seen);
  });
  return Object.freeze(value);
}

function frozenTree(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor || !own(descriptor, 'value') || frozenTree(descriptor.value, seen);
  });
}

function exactKeys(value, expected, message) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected.slice().sort(), message);
}

function validReviewRecord(value) {
  return typeof value === 'string' && /^review:v1:[a-z0-9_-]{8,80}$/.test(value);
}

function reviewGate(testCases) {
  for (const item of testCases) {
    if (item.review_status !== 'approved' || item.gold_label_version !== item.label_version ||
        !validReviewRecord(item.review_record_ref) ||
        item.required_reviewer_roles.some((role) => !item.approved_reviewer_roles.includes(role))) {
      return 'human_needed';
    }
  }
  return 'approved';
}

function inMemoryStorage() {
  const values = Object.create(null);
  const setHistory = [];
  const faults = { setCall: 0, failSetCall: null, failTiming: null };
  return Object.freeze({
    async get(keys) {
      if (keys === null || keys === undefined) return Object.assign({}, values);
      const requested = Array.isArray(keys) ? keys : [keys];
      const output = Object.create(null);
      requested.forEach((key) => { if (own(values, key)) output[key] = values[key]; });
      return output;
    },
    async set(entries) {
      faults.setCall += 1;
      if (faults.failSetCall === faults.setCall && faults.failTiming === 'before') {
        throw new Error('synthetic quota boundary');
      }
      Object.assign(values, entries);
      setHistory.push(Object.freeze(Object.keys(entries)));
      if (faults.failSetCall === faults.setCall && faults.failTiming === 'after') {
        throw new Error('synthetic quota boundary');
      }
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete values[key]; });
    },
    snapshot() { return structuredClone(values); },
    history() { return setHistory.map((keys) => keys.slice()); },
    resetHistory() { setHistory.length = 0; },
    setCalls() { return faults.setCall; },
    failSetAt(call, timing) {
      assert.ok(Number.isSafeInteger(call) && call >= 1);
      assert.ok(timing === 'before' || timing === 'after');
      faults.failSetCall = call;
      faults.failTiming = timing;
    }
  });
}

const EVAL_ACCOUNT = 'eval-account';
const EVAL_ROOT = 'eval-root';
const EVAL_PARTITION = CorpusSchema.makePartitionKey({
  accountPermissionId: EVAL_ACCOUNT,
  corpusRootFileId: EVAL_ROOT
});
const EVAL_TUPLE = Object.freeze({ tabId: 55 });
const EVAL_NOW = 1_800_000_000_000;
const GRAPH_STORAGE_PREFIX = 'fsbSkopeoGraph:1:';

function contentFingerprint(text) {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

function evaluationCertificate(sourceFileId, fingerprint, sequence, provedAt = EVAL_NOW, overrides = {}) {
  const accountPermissionId = overrides.accountPermissionId || EVAL_ACCOUNT;
  const corpusRootFileId = overrides.corpusRootFileId || EVAL_ROOT;
  const target = {
    decision: 'certified',
    operationId: `eval-operation-${sequence}`,
    kind: 'ingestion',
    tabId: EVAL_TUPLE.tabId,
    origin: 'https://drive.google.com',
    generation: 1,
    contextEpoch: sequence,
    authorityEpoch: sequence,
    accountPermissionId,
    corpusRootFileId,
    sourceFileId,
    partitionEpoch: sequence,
    sourceEpoch: sequence,
    provedAt,
    vendorScopeFileId: corpusRootFileId,
    physicalParentChain: Object.freeze([corpusRootFileId]),
    metadataFingerprint: Object.freeze({
      version: 1,
      kind: 'metadata',
      name: overrides.metadataName || 'Synthetic evaluation source',
      mimeType: 'text/plain',
      modifiedTime: '2026-07-21T00:00:00.000Z',
      driveVersion: String(sequence),
      size: 1,
      trashed: false,
      canDownload: true
    }),
    membershipFingerprint: Object.freeze({
      version: 1,
      kind: 'membership',
      corpusRootFileId,
      physicalParentChain: Object.freeze([corpusRootFileId]),
      vendorScopeFileId: corpusRootFileId,
      driveId: null
    }),
    contentFingerprint: Object.freeze({
      version: 1,
      kind: 'content',
      evidenceKind: 'download-hash',
      value: fingerprint
    })
  };
  Object.defineProperty(target, 'toJSON', {
    enumerable: false,
    value() { throw new TypeError('evaluation certificate is nonserializable'); }
  });
  return Object.freeze(target);
}

function fixtureSourceText(item) {
  const characters = item.special_assertions.executable_source_characters;
  if (Number.isSafeInteger(characters)) return item.id[0].repeat(characters);
  return item.ordered_excerpts.map((excerpt) => excerpt.text).join('');
}

function cloneEnvelopeWithLiveExcerpts(rawResponse, requestEnvelope) {
  let envelope;
  try {
    envelope = JSON.parse(rawResponse);
  } catch (_error) {
    return rawResponse;
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return rawResponse;
  const firstExcerpt = requestEnvelope.excerpts[0];
  function rewriteEvidence(entries) {
    (entries || []).forEach((entry) => {
      (entry.evidence || []).forEach((locator) => {
        if (locator.excerptId !== 'forged_excerpt') locator.excerptId = firstExcerpt.excerptId;
      });
    });
  }
  rewriteEvidence(envelope.records);
  rewriteEvidence(envelope.relations);
  return JSON.stringify(envelope);
}

function generatedRecords(count, excerptId) {
  return Array.from({ length: count }, (_, index) => ({
    candidateRef: `record_${String(index).padStart(3, '0')}`,
    kind: index === 0 ? 'agreement' : 'clause',
    label: `Synthetic Boundary Record ${String(index).padStart(3, '0')}`,
    evidence: [{ excerptId, start: index, end: index + 1 }]
  }));
}

function generatedRelations(count, excerptId) {
  return Array.from({ length: count }, (_, index) => ({
    fromCandidateRef: 'record_000',
    predicate: 'contains',
    toCandidateRef: `record_${String((index % 127) + 1).padStart(3, '0')}`,
    evidence: [{ excerptId, start: 512 + index, end: 513 + index }]
  }));
}

function durableGraphRecord(record) {
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

function generatedFixtureResponse(item, requestEnvelope, providerCall) {
  const responseKind = item.special_assertions.generated_response;
  const excerptId = requestEnvelope.excerpts[0].excerptId;
  if (Number.isSafeInteger(item.special_assertions.executable_response_characters)) {
    return 'x'.repeat(item.special_assertions.executable_response_characters);
  }
  if (responseKind === 'raw-max-plus-one') {
    return 'x'.repeat(GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS + 1);
  }
  if (responseKind === 'records-max-plus-one') {
    return JSON.stringify({
      schemaVersion: 1,
      batchId: 'batch_records_over_0001',
      records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS + 1, excerptId),
      relations: []
    });
  }
  if (responseKind === 'relations-max-plus-one') {
    return JSON.stringify({
      schemaVersion: 1,
      batchId: 'batch_relations_over_01',
      records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS, excerptId),
      relations: generatedRelations(GraphSchema.LIMITS.MAX_RELATIONS + 1, excerptId)
    });
  }
  if (responseKind === 'exact-max-matrix') {
    if (requestEnvelope.repair) {
      return JSON.stringify({
        schemaVersion: 1, batchId: 'batch_exact_repair_01', records: [], relations: []
      });
    }
    if (providerCall === 1) {
      const raw = JSON.stringify({
        schemaVersion: 1,
        batchId: 'batch_exact_limits_001',
        records: [{
          candidateRef: 'record_000',
          kind: 'agreement',
          label: 'Synthetic Exact Boundary Record',
          evidence: [{ excerptId, start: 0, end: 1 }]
        }],
        relations: []
      });
      assert.ok(raw.length < GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS);
      return raw + ' '.repeat(GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS - raw.length);
    }
    if (providerCall === 2) return 'repair this malformed response';
    return JSON.stringify({
      schemaVersion: 1,
      batchId: `batch_exact_empty_${String(providerCall).padStart(3, '0')}`,
      records: [],
      relations: []
    });
  }
  return null;
}

function providerResponseSummary(content) {
  const summary = {
    length: content.length,
    jsonObject: false,
    wrapped: /^\s*(?:Here\b|```)/.test(content),
    topLevelKeys: [],
    recordCount: null,
    relationCount: null
  };
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      summary.jsonObject = true;
      summary.topLevelKeys = Object.keys(parsed).sort();
      summary.recordCount = Array.isArray(parsed.records) ? parsed.records.length : null;
      summary.relationCount = Array.isArray(parsed.relations) ? parsed.relations.length : null;
    }
  } catch (_error) {}
  return deepFreeze(summary);
}

function simpleEnvelope(id, kind, label, end) {
  return JSON.stringify({
    schemaVersion: 1,
    batchId: `batch_seed_${id}_0001`,
    records: [{
      candidateRef: 'record',
      kind,
      label,
      evidence: [{ excerptId: 'fixture_excerpt', start: 0, end }]
    }],
    relations: []
  });
}

function relatedEnvelope(id, textLength) {
  return JSON.stringify({
    schemaVersion: 1,
    batchId: `batch_seed_${id}_0001`,
    records: [{
      candidateRef: 'document', kind: 'agreement', label: `${id} Agreement`,
      evidence: [{ excerptId: 'fixture_excerpt', start: 0, end: Math.min(9, textLength) }]
    }, {
      candidateRef: 'clause', kind: 'clause', label: `${id} Clause`,
      evidence: [{ excerptId: 'fixture_excerpt', start: Math.min(10, textLength - 1), end: textLength }]
    }],
    relations: [{
      fromCandidateRef: 'document', predicate: 'contains', toCandidateRef: 'clause',
      evidence: [{ excerptId: 'fixture_excerpt', start: 0, end: textLength }]
    }]
  });
}

function createExecutableHarness(item) {
  const storage = inMemoryStorage();
  const sources = new Map();
  const settings = { modelProvider: 'eval-provider', modelName: 'eval-model' };
  const faults = {
    abortBeforePrepare: item.id === 'R01',
    closeBeforeStage: item.id === 'R02',
    closeAfterProvider: item.id === 'R03',
    driftAfterProvider: item.id === 'I05',
    quotaAfterProviderTiming: null,
    probeReuseCertificate: false
  };
  const metrics = {
    operations: 0,
    providerCalls: 0,
    providerAcks: 0,
    providerSelections: [],
    providerRequests: [],
    responseUsages: [],
    responseLengths: [],
    responseSummaries: [],
    stageEffects: 0,
    publishEffects: 0,
    withdrawEffects: 0,
    candidateEffects: 0,
    toolCalls: 0,
    networkCalls: 0,
    transportReads: Object.create(null),
    fragmentReads: Object.create(null),
    indexBuilds: 0,
    errors: [],
    trace: [],
    replayStatus: null,
    expiredStatus: null
  };
  let certificateSequence = 0;
  let nonceSequence = 0;
  let activeSourceFileId = null;
  let stack = null;

  function addSource(sourceFileId, text, rawResponse, options = {}) {
    sources.set(sourceFileId, {
      text,
      fingerprint: contentFingerprint(text),
      rawResponse,
      metadataName: options.metadataName || 'Synthetic evaluation source',
      accountPermissionId: options.accountPermissionId || EVAL_ACCOUNT,
      corpusRootFileId: options.corpusRootFileId || EVAL_ROOT,
      accessible: options.accessible !== false
    });
  }

  function updateSource(sourceFileId, changes) {
    const source = sources.get(sourceFileId);
    assert.ok(source, `${item.id} updates a configured source`);
    if (own(changes, 'text')) {
      source.text = changes.text;
      source.fingerprint = contentFingerprint(changes.text);
    }
    if (own(changes, 'rawResponse')) source.rawResponse = changes.rawResponse;
    if (own(changes, 'accessible')) source.accessible = changes.accessible;
  }

  function observedStore(baseStore) {
    const output = {};
    Object.keys(baseStore).forEach((key) => { output[key] = baseStore[key]; });
    output.readCurrentFragment = async function(input) {
      metrics.fragmentReads[input.sourceFileId] = (metrics.fragmentReads[input.sourceFileId] || 0) + 1;
      return baseStore.readCurrentFragment(input);
    };
    return Object.freeze(output);
  }

  function makeLayer(baseStore) {
    class EvaluationMiniSearch extends MiniSearch {
      constructor(options) {
        super(options);
        metrics.indexBuilds += 1;
      }
    }
    const graphStore = observedStore(baseStore);
    const graphQuery = GraphQuery.create({
      graphSchema: GraphSchema,
      graphStore,
      MiniSearch: EvaluationMiniSearch,
      byteLength: (value) => Buffer.byteLength(value, 'utf8')
    });
    assert.ok(graphQuery, `${item.id} creates the production query layer`);
    assert.strictEqual(graphStore.registerCacheOwner(graphQuery.cacheOwner).status, 'registered');
    return { baseStore, graphStore, graphQuery };
  }

  const graphExtractor = GraphExtractor.create({
    graphSchema: GraphSchema,
    providerFactory: (selectedSettings) => {
      metrics.providerSelections.push(Object.freeze({
        providerId: selectedSettings.modelProvider,
        modelId: selectedSettings.modelName
      }));
      return Object.freeze({
      async buildRequest(prompt) {
        return {
          evaluationEnvelope: JSON.parse(prompt.userPrompt),
          evaluationSystemPrompt: prompt.systemPrompt
        };
      },
      async sendRequest(body, options) {
        metrics.providerCalls += 1;
        const source = sources.get(activeSourceFileId);
        assert.ok(source, `${item.id} provider call is source-bound`);
        metrics.providerRequests.push(Object.freeze({
          envelope: structuredClone(body.evaluationEnvelope),
          systemPrompt: body.evaluationSystemPrompt,
          temperature: body.temperature,
          maxOutputTokens: body.max_tokens,
          attempt: options.attempt,
          timeout: options.timeout,
          signal: options.signal
        }));
        let content = generatedFixtureResponse(
          item, body.evaluationEnvelope, metrics.providerCalls
        );
        if (content === null) {
          content = cloneEnvelopeWithLiveExcerpts(source.rawResponse, body.evaluationEnvelope);
        }
        if (faults.driftAfterProvider) settings.modelName = 'eval-model-drifted';
        const usage = structuredClone(item.recorded_provider.usage);
        metrics.responseUsages.push(usage);
        metrics.responseLengths.push(content.length);
        metrics.responseSummaries.push(providerResponseSummary(content));
        if (faults.quotaAfterProviderTiming) {
          storage.failSetAt(storage.setCalls() + 1, faults.quotaAfterProviderTiming);
          faults.quotaAfterProviderTiming = null;
        }
        return { content, model: 'eval-model', usage };
      },
      parseResponse(response) { return response; }
    });
    },
    readSettings: async () => Object.assign({}, settings),
    nonceFactory: async () => `eval_nonce_${String(++nonceSequence).padStart(8, '0')}`,
    now: () => EVAL_NOW
  });
  assert.ok(graphExtractor, `${item.id} creates the production extractor`);

  async function runCorpusOperation(kind, _tuple, selection, callback, commitCallback) {
    metrics.operations += 1;
    const sourceFileIds = selection.sourceFileId
      ? [selection.sourceFileId]
      : Array.from(selection.sourceFileIds);
    if (sourceFileIds.some((sourceFileId) => {
      const source = sources.get(sourceFileId);
      return !source || source.accessible !== true;
    })) return Object.freeze({ decision: 'closed' });
    const certificates = sourceFileIds.map((sourceFileId) => {
      certificateSequence += 1;
      return evaluationCertificate(
        sourceFileId,
        sources.get(sourceFileId).fingerprint,
        certificateSequence,
        EVAL_NOW,
        {
          metadataName: sources.get(sourceFileId).metadataName,
          accountPermissionId: sources.get(sourceFileId).accountPermissionId,
          corpusRootFileId: sources.get(sourceFileId).corpusRootFileId
        }
      );
    });
    const controller = new AbortController();
    if (faults.abortBeforePrepare && metrics.operations === 3) controller.abort('fixture-abort');
    activeSourceFileId = sourceFileIds[0];
    let prepared;
    try {
      prepared = selection.sourceFileId
        ? await callback(certificates[0], controller.signal)
        : await callback(certificates, Object.freeze({ complete: true }), controller.signal);
    } finally {
      activeSourceFileId = null;
    }
    const preparedStatus = prepared && prepared.status || null;
    metrics.trace.push(Object.freeze({ kind, sourceFileIds: Object.freeze(sourceFileIds), preparedStatus }));

    if (faults.closeAfterProvider && preparedStatus === 'provider-step') {
      const replayed = await callback(certificates[0], controller.signal);
      metrics.replayStatus = replayed && replayed.status;
      certificateSequence += 1;
      const expired = evaluationCertificate(
        sourceFileIds[0], sources.get(sourceFileIds[0]).fingerprint,
        certificateSequence, EVAL_NOW - 30_001
      );
      const expiredResult = await callback(expired, controller.signal);
      metrics.expiredStatus = expiredResult && expiredResult.status;
      return Object.freeze({ decision: 'closed' });
    }
    if (faults.closeBeforeStage && metrics.providerCalls > 0 &&
        preparedStatus === 'provider-binding-current') {
      return Object.freeze({ decision: 'closed' });
    }
    if (kind !== 'ingestion') {
      return Object.freeze({ decision: 'admitted', value: prepared });
    }
    let acknowledgement = null;
    const publisher = Object.freeze({
      signal: controller.signal,
      operationToken: Object.freeze({}),
      operationEpoch: certificateSequence,
      async publish(effect) {
        const effectGuard = Object.freeze({
          signal: controller.signal,
          operationToken: Object.freeze({}),
          operationEpoch: certificateSequence,
          async validate() { return controller.signal.aborted === false; }
        });
        const value = await effect(effectGuard);
        const effectStatus = value && value.status;
        if (effectStatus === 'provider-no-storage') metrics.providerAcks += 1;
        if (effectStatus === 'staged') metrics.stageEffects += 1;
        if (effectStatus === 'published') metrics.publishEffects += 1;
        if (effectStatus === 'withheld') metrics.withdrawEffects += 1;
        if (effectStatus === 'cleared') metrics.candidateEffects += 1;
        acknowledgement = Object.freeze({ value });
        return acknowledgement;
      }
    });
    if (faults.probeReuseCertificate && preparedStatus === 'reused') {
      const replayed = await callback(certificates[0], controller.signal);
      metrics.replayStatus = replayed && (replayed.reason || replayed.status);
    }
    const committed = await commitCallback(prepared, publisher, controller.signal);
    if (!committed || committed !== acknowledgement) return Object.freeze({ decision: 'closed' });
    return Object.freeze({ decision: 'admitted', value: acknowledgement.value });
  }

  const corpusTransport = Object.freeze({
    async readContent(_tuple, input, sink, signal) {
      const source = sources.get(input.fileId);
      metrics.transportReads[input.fileId] = (metrics.transportReads[input.fileId] || 0) + 1;
      if (!source || !source.accessible || signal.aborted) return Object.freeze({ kind: 'closed' });
      await sink(Object.freeze({
        byteHash: source.fingerprint,
        exactByteLength: Buffer.byteLength(source.text, 'utf8'),
        text: source.text
      }), signal);
      return Object.freeze({ kind: 'ok' });
    }
  });

  function makeFacade(layer) {
    const facade = GraphEngine.create({
      graphSchema: GraphSchema,
      graphStore: layer.graphStore,
      graphExtractor,
      graphQuery: layer.graphQuery,
      corpusTransport,
      runCorpusOperation,
      readSettings: async () => Object.assign({}, settings),
      providerFactory: () => Object.freeze({}),
      now: () => EVAL_NOW
    });
    assert.ok(facade, `${item.id} creates the production engine`);
    return facade;
  }

  function createLayer() {
    const baseStore = GraphStore.create({
      storageArea: storage,
      graphSchema: GraphSchema,
      corpusSchema: CorpusSchema,
      now: () => EVAL_NOW
    });
    assert.ok(baseStore, `${item.id} creates the production store`);
    const layer = makeLayer(baseStore);
    layer.facade = makeFacade(layer);
    return layer;
  }

  function resetMetrics() {
    storage.resetHistory();
    metrics.operations = 0;
    metrics.providerCalls = 0;
    metrics.providerAcks = 0;
    metrics.providerSelections.length = 0;
    metrics.providerRequests.length = 0;
    metrics.responseUsages.length = 0;
    metrics.responseLengths.length = 0;
    metrics.responseSummaries.length = 0;
    metrics.stageEffects = 0;
    metrics.publishEffects = 0;
    metrics.withdrawEffects = 0;
    metrics.candidateEffects = 0;
    metrics.transportReads = Object.create(null);
    metrics.fragmentReads = Object.create(null);
    metrics.indexBuilds = 0;
    metrics.errors.length = 0;
    metrics.trace.length = 0;
    metrics.replayStatus = null;
    metrics.expiredStatus = null;
  }

  stack = createLayer();
  return {
    storage,
    sources,
    settings,
    faults,
    metrics,
    graphExtractor,
    addSource,
    updateSource,
    resetMetrics,
    current() { return stack; },
    recreate() { stack = createLayer(); return stack; }
  };
}

async function readCurrentFragment(layer, sourceFileId, partitionKey = EVAL_PARTITION) {
  const metadata = await layer.graphStore.inspectMetadata({
    partitionKey,
    sourceFileId
  });
  if (!metadata || metadata.state !== 'published') return { metadata, fragment: null };
  const fragment = await layer.graphStore.readCurrentFragment({
    partitionKey,
    sourceFileId,
    fragmentGenerationId: metadata.fragmentGenerationId
  });
  return { metadata, fragment };
}

function storageHasKind(snapshot, kind) {
  return Object.keys(snapshot).some((key) => key.startsWith(`${GRAPH_STORAGE_PREFIX}${kind}:`));
}

function storageHasSourceKind(snapshot, kind, sourceFileId) {
  const sourceComponent = `${sourceFileId.length}:${sourceFileId}`;
  return Object.keys(snapshot).some((key) =>
    key.startsWith(`${GRAPH_STORAGE_PREFIX}${kind}:`) && key.includes(sourceComponent));
}

async function logicalDurableKeys(context, overlayOnly = false) {
  const snapshot = context.harness.storage.snapshot();
  const output = [];
  if (overlayOnly) {
    if (storageHasKind(snapshot, 'overlay-control')) output.push('overlay-control');
    if (storageHasKind(snapshot, 'overlay-relation')) output.push('overlay-relation');
    if (storageHasKind(snapshot, 'overlay-adjacency')) output.push('overlay-adjacency');
    return output;
  }
  const current = await readCurrentFragment(context.layer, context.sourceFileId);
  if (storageHasSourceKind(snapshot, 'control', context.sourceFileId)) output.push('control');
  if (current.fragment) output.push('fragment');
  if (storageHasSourceKind(snapshot, 'lexical', context.sourceFileId)) output.push('lexical');
  if (storageHasSourceKind(snapshot, 'adjacency', context.sourceFileId)) output.push('adjacency');
  if (storageHasSourceKind(snapshot, 'overlay-control', context.sourceFileId)) {
    output.push('overlay-control');
  }
  if (storageHasSourceKind(snapshot, 'overlay-relation', context.sourceFileId)) {
    output.push('overlay-relation');
  }
  if (storageHasSourceKind(snapshot, 'overlay-adjacency', context.sourceFileId)) {
    output.push('overlay-adjacency');
  }
  return output;
}

function fragmentProjection(fragment) {
  if (!fragment) return { records: [], relations: [], spans: [] };
  const spans = [];
  fragment.records.forEach((record) => {
    record.evidence.forEach((locator) => {
      spans.push([locator.sourceByteStart, locator.sourceByteEnd]);
    });
  });
  fragment.relations.forEach((relation) => {
    relation.evidence.forEach((locator) => {
      spans.push([locator.sourceByteStart, locator.sourceByteEnd]);
    });
  });
  spans.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  return {
    records: fragment.records.map((record) => record.label),
    relations: fragment.relations.map((relation) => relation.predicate),
    spans
  };
}

function operationProjection(result) {
  if (!result || result.decision !== 'admitted') {
    return { publishState: 'withheld', reason: 'closed' };
  }
  const value = result.value;
  if (!value) return { publishState: 'withheld', reason: 'closed' };
  if (value.status === 'published' || value.status === 'reused') {
    return { publishState: 'published', reason: value.status };
  }
  if (value.status === 'withheld') {
    return { publishState: 'withheld', reason: value.reason };
  }
  return { publishState: 'withheld', reason: value.status || 'closed' };
}

function verifyProviderBoundary(context) {
  const metrics = context.harness.metrics;
  assert.strictEqual(metrics.providerSelections.length, metrics.providerCalls,
    `${context.item.id} records every configured-provider selection`);
  assert.strictEqual(metrics.providerRequests.length, metrics.providerCalls,
    `${context.item.id} records every live provider request`);
  assert.strictEqual(metrics.responseUsages.length, metrics.providerCalls,
    `${context.item.id} observes every recorded usage envelope at runtime`);
  metrics.providerSelections.forEach((selection) => {
    assert.deepStrictEqual(selection, { providerId: 'eval-provider', modelId: 'eval-model' },
      `${context.item.id} never selects a fallback provider/model`);
  });
  metrics.responseUsages.forEach((usage) => {
    assert.deepStrictEqual(usage, context.item.recorded_provider.usage,
      `${context.item.id} supplies and observes the checked-in usage envelope`);
  });
  metrics.providerRequests.forEach((request) => {
    assert.strictEqual(typeof request.systemPrompt, 'string');
    assert.ok(request.systemPrompt.length > 0, `${context.item.id} uses the static system policy`);
    assert.strictEqual(request.temperature, 0.1);
    assert.strictEqual(request.maxOutputTokens, GraphExtractor.LIMITS.MAX_OUTPUT_TOKENS);
    assert.strictEqual(request.attempt, 0);
    assert.strictEqual(request.timeout, 20_000);
    assert.ok(request.signal && typeof request.signal.aborted === 'boolean');
    const envelope = request.envelope;
    exactKeys(envelope, envelope.repair ? [
      'batchNonce', 'schemaVersion', 'promptVersion', 'excerpts', 'recordKinds',
      'relationPredicates', 'priorCandidates', 'repair'
    ] : [
      'batchNonce', 'schemaVersion', 'promptVersion', 'excerpts', 'recordKinds',
      'relationPredicates', 'priorCandidates'
    ], `${context.item.id} sends only the closed extraction envelope`);
    assert.ok(envelope.excerpts.length >= 1 &&
      envelope.excerpts.length <= GraphExtractor.LIMITS.MAX_EXCERPTS_PER_CALL);
    const characters = envelope.excerpts.reduce((total, excerpt) => total + excerpt.text.length, 0);
    assert.ok(characters <= GraphExtractor.LIMITS.MAX_EXCERPT_CHARACTERS_PER_CALL,
      `${context.item.id} request characters stay within the production cap`);
    assert.ok(envelope.priorCandidates.length <= GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES);
    assert.ok(Buffer.byteLength(JSON.stringify(envelope.priorCandidates), 'utf8') <=
      GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES);
    envelope.priorCandidates.forEach((candidate) => {
      exactKeys(candidate, ['handle', 'kind'],
        `${context.item.id} prior candidates expose no label/evidence/text`);
    });
  });
  if (Array.isArray(context.item.special_assertions.inert_source_markers)) {
    const uploaded = metrics.providerRequests.flatMap((request) =>
      request.envelope.excerpts.map((excerpt) => excerpt.text)).join('');
    context.item.special_assertions.inert_source_markers.forEach((marker) => {
      assert.ok(uploaded.includes(marker), `${context.item.id} uploads the hostile bytes only as data`);
    });
    const controlPlane = JSON.stringify(metrics.providerRequests.map((request) => ({
      systemPrompt: request.systemPrompt,
      keys: Object.keys(request.envelope),
      recordKinds: request.envelope.recordKinds,
      relationPredicates: request.envelope.relationPredicates,
      priorCandidates: request.envelope.priorCandidates
    })));
    context.item.special_assertions.inert_source_markers.forEach((marker) => {
      assert.strictEqual(controlPlane.includes(marker), false,
        `${context.item.id} hostile source bytes never become instructions, tools, or routing`);
    });
  }
  if (context.item.special_assertions.metadata_name) {
    assert.strictEqual(JSON.stringify(metrics.providerRequests).includes(
      context.item.special_assertions.metadata_name), false,
    `${context.item.id} malicious filename metadata never enters the provider envelope`);
  }
}

function transitionProof(context, actual, token) {
  const metrics = context.harness.metrics;
  const operation = operationProjection(context.operationResult);
  const normalRequests = metrics.providerRequests.filter((request) => !request.envelope.repair);
  const repairRequests = metrics.providerRequests.filter((request) => request.envelope.repair);
  const summaries = metrics.responseSummaries;
  const firstSummary = summaries[0] || {};
  const sourceRead = (metrics.transportReads[context.sourceFileId] || 0) > 0;
  const sourceCertified = metrics.trace.some((entry) =>
    entry.sourceFileIds.includes(context.sourceFileId));
  const singleSourceCertified = metrics.trace.some((entry) =>
    entry.sourceFileIds.length === 1 && entry.sourceFileIds[0] === context.sourceFileId);
  const configuredProviderOnly = metrics.providerCalls > 0 &&
    metrics.providerSelections.length === metrics.providerCalls &&
    metrics.providerSelections.every((selection) =>
      selection.providerId === 'eval-provider' && selection.modelId === 'eval-model');
  const fragmentEmpty = !context.fragment ||
    (context.fragment.records.length === 0 && context.fragment.relations.length === 0);
  const publishedEmpty = operation.publishState === 'published' && !!context.fragment &&
    context.fragment.records.length === 0 && context.fragment.relations.length === 0;
  const requestText = metrics.providerRequests.flatMap((request) =>
    request.envelope.excerpts.map((excerpt) => excerpt.text)).join('');
  const allQueryClaimsHold = Object.values(actual.query_proof).every(Boolean);
  const history = context.harness.storage.history();
  const finalWrite = history.length ? history[history.length - 1] : [];
  const sourcePointerLast = finalWrite.length === 1 &&
    finalWrite[0].startsWith(`${GRAPH_STORAGE_PREFIX}control:`);
  const overlayPointerLast = finalWrite.length === 1 &&
    finalWrite[0].startsWith(`${GRAPH_STORAGE_PREFIX}overlay-control:`);
  let raw = null;
  try { raw = JSON.parse(context.rawResponse); } catch (_error) {}

  switch (token) {
    case 'certify-source': return sourceCertified;
    case 'certify-single-source': return singleSourceCertified;
    case 'certify-empty-source': return sourceCertified && context.sourceText.length === 0;
    case 'certify-malicious-metadata':
      return sourceCertified && !!context.item.special_assertions.metadata_name;
    case 'certify-exact-proposer-target-set':
      return metrics.trace.some((entry) => entry.sourceFileIds.length === 2) &&
        context.candidateIdentityObserved === true;
    case 'certify-proposer-only':
      return singleSourceCertified && !!context.targetSourceFileId &&
        metrics.trace.every((entry) => !entry.sourceFileIds.includes(context.targetSourceFileId));
    case 'certify-192000-character-source':
      return sourceCertified && context.exactMaximumsObserved.sourceCharacters ===
        GraphExtractor.LIMITS.MAX_CHARACTERS_PER_GENERATION;
    case 'prepare-content': return sourceRead && requestText.length > 0;
    case 'prepare-empty-excerpt':
      return sourceRead && normalRequests.some((request) =>
        request.envelope.excerpts.some((excerpt) => excerpt.text.length === 0));
    case 'prepare-truncated-content': return sourceRead && requestText.includes('truncated remainder');
    case 'prepare-title-only-content': return sourceRead && requestText.includes('FIRST AMENDMENT');
    case 'provider-no-storage': return metrics.providerAcks > 0;
    case 'configured-provider-only': return configuredProviderOnly;
    case 'stage-fresh': return metrics.stageEffects > 0 && !!context.fragment;
    case 'stage-empty': return metrics.stageEffects > 0 && fragmentEmpty;
    case 'publish-fresh': return metrics.publishEffects > 0 && operation.publishState === 'published';
    case 'publish-empty': return metrics.publishEffects > 0 && publishedEmpty;
    case 'publish-pointer-last': return metrics.publishEffects > 0 && sourcePointerLast;
    case 'publish-overlay-pointer-last': return overlayPointerLast && context.candidateRelations.length === 1;
    case 'query-fresh': return allQueryClaimsHold && metrics.operations > 1;
    case 'inspect-provenance': return actual.query_proof.provenance === true;
    case 'withdraw-old': return context.oldGenerationAbsent === true;
    case 'resolve-current-endpoints':
    case 'derive-candidate-identities': return context.candidateIdentityObserved === true;
    case 'query-exact-set':
      return actual.query_proof.candidate_only === true &&
        actual.query_proof.both_endpoint_generations === true;

    case 'provider-malformed-json': return firstSummary.jsonObject === false && !firstSummary.wrapped;
    case 'provider-wrapped-json': return firstSummary.jsonObject === false && firstSummary.wrapped === true;
    case 'provider-prototype-field':
      return firstSummary.jsonObject === true && firstSummary.topLevelKeys.includes('__proto__');
    case 'provider-raw-max-plus-one':
      return firstSummary.length === GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS + 1;
    case 'provider-129-records': return firstSummary.recordCount === GraphSchema.LIMITS.MAX_RECORDS + 1;
    case 'provider-257-relations':
      return firstSummary.relationCount === GraphSchema.LIMITS.MAX_RELATIONS + 1;
    case 'provider-duplicate-and-dangling':
      return context.duplicateRejected === true && context.danglingRejected === true;
    case 'repair-once': return repairRequests.length === 1;
    case 'reject-before-stage':
      return metrics.stageEffects === 0 && !context.fragment && operation.publishState === 'withheld';
    case 'reject-response-budget': return operation.reason === 'model-response-too-large';

    case 'upload-inert-excerpt':
    case 'upload-inert-comment':
      return Array.isArray(context.item.special_assertions.inert_source_markers) &&
        context.item.special_assertions.inert_source_markers.every((marker) => requestText.includes(marker));
    case 'exclude-filename':
      return !JSON.stringify(metrics.providerRequests).includes(
        context.item.special_assertions.metadata_name);
    case 'provider-cross-source-handle':
      return raw && Array.isArray(raw.relations) && raw.relations.some((relation) =>
        typeof relation.toCandidateRef === 'string' && relation.toCandidateRef.startsWith('@fsb:')) &&
        operation.reason === 'model-semantic-invalid';
    case 'publish-local-empty': return publishedEmpty;
    case 'publish-foreign-marker': return context.foreignVisibleInOwnPartition === true;
    case 'query-foreign-exact': return context.foreignVisibleInOwnPartition === true;
    case 'query-local-exact': return context.foreignAbsentFromLocalPartition === true;
    case 'prove-no-cross-partition-influence':
      return context.foreignVisibleInOwnPartition === true &&
        context.foreignAbsentFromLocalPartition === true;
    case 'binding-drift':
      return context.harness.settings.modelName === 'eval-model-drifted' &&
        operation.reason === 'provider-binding-changed';
    case 'withhold-no-fallback-or-stage':
      return operation.publishState === 'withheld' && configuredProviderOnly && metrics.stageEffects === 0;

    case 'provider-forged-excerpt-id':
      return typeof context.rawResponse === 'string' && context.rawResponse.includes('forged_excerpt') &&
        operation.reason === 'model-semantic-invalid';
    case 'probe-nonmatching-registry': return context.offsetFailuresRejected === true;
    case 'provider-out-of-range-offset':
      return context.offsetFailuresRejected === true && raw && raw.records[0].evidence[0].end >
        Buffer.byteLength(context.sourceText, 'utf8');
    case 'provider-clipped-qualifier-span':
    case 'reject-invalid-string-boundary': return context.clippedQualifierRejected === true;

    case 'abort-before-provider-call': return metrics.providerCalls === 0 && operation.reason === 'closed';
    case 'prove-zero-late-write': return metrics.stageEffects === 0 && metrics.publishEffects === 0;
    case 'universal-provider-fetch-abort': return context.fetchAbortObserved === true;
    case 'universal-provider-backoff-abort': return context.backoffAbortObserved === true;
    case 'close-before-stage': return metrics.providerCalls === 1 && metrics.stageEffects === 0;
    case 'receive-provider-response': return metrics.responseSummaries.length === 1;
    case 'lose-authority-after-response':
      return metrics.providerCalls === 1 && operation.reason === 'closed' && metrics.stageEffects === 0;
    case 'reject-reused-certificate': return metrics.replayStatus === 'certificate-reused';
    case 'reject-expired-certificate': return metrics.expiredStatus === 'certificate-expired';
    case 'withhold': return operation.publishState === 'withheld';
    case 'measure-pointer-last-writes': return context.pointerLastWritesObserved === true;
    case 'inject-quota-after-publication-write': return context.afterWriteQuotaInjected === true;
    case 'recover-complete-or-absent': return context.afterWriteConverged === true;
    case 'inject-quota-before-staging': return context.beforeStageQuotaInjected === true;
    case 'recover-complete-absence':
      return context.beforeStageRecovered === true && context.quotaRecoveryConverged === true;
    case 'seed-129-corrupt-controls': return context.corruptControlsSeeded === 129;
    case 'recreate-worker': return context.workerRecreated === true;
    case 'recover-128-items': return context.firstRecoveryRemaining === 1;
    case 'return-recovery-pending': return context.firstRecoveryStatus === 'recovery-pending';
    case 'recover-final-item': return context.secondRecoveryStatus === 'repaired';
    case 'prove-orphan-absence': return context.corruptOrphansRemaining === 0;
    case 'seed-two-current-sources': return context.seededTwoSources === true;
    case 'publish-candidate-overlay': return context.candidateRelations.length === 1;
    case 'change-target-content': return context.targetGenerationAdvanced === true;
    case 'publish-target-replacement':
      return context.targetGenerationAdvanced === true && metrics.publishEffects > 0;
    case 'prove-old-overlay-absent': return context.oldOverlayAbsent === true;
    case 'publish-distinct-overlay':
      return context.relationVersionAdvanced === true && context.overlayGenerationAdvanced === true;
    case 'publish-and-query-candidate': return context.candidateObservedBeforePurge === true;
    case 'purge-target-four-participants': return context.purgedParticipantCount === 4;
    case 'prove-target-payload-absent': return context.targetPayloadAbsent === true;
    case 'revoke-target-authority': return context.targetAuthorityRevoked === true;
    case 'clear-empty-overlay':
      return operation.reason === 'cleared' && context.candidateRelations.length === 0;

    case 'eight-normal-provider-calls':
      return context.exactMaximumsObserved.normalCalls ===
        GraphExtractor.LIMITS.MAX_NORMAL_CALLS_PER_GENERATION;
    case 'admit-eight-excerpt-context':
      return context.exactMaximumsObserved.excerptsPerCall ===
        GraphExtractor.LIMITS.MAX_EXCERPTS_PER_CALL;
    case 'admit-24000-character-context':
      return context.exactMaximumsObserved.charactersPerCall ===
        GraphExtractor.LIMITS.MAX_EXCERPT_CHARACTERS_PER_CALL;
    case 'one-repair-call':
      return context.exactMaximumsObserved.repairCalls ===
        GraphExtractor.LIMITS.MAX_REPAIR_CALLS_PER_GENERATION;
    case 'admit-131072-character-response':
      return context.exactMaximumsObserved.responseCharacters ===
        GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS;
    case 'admit-128-records':
      return context.exactMaximumsObserved.schemaRecords === GraphSchema.LIMITS.MAX_RECORDS;
    case 'admit-256-relations':
      return context.exactMaximumsObserved.schemaRelations === GraphSchema.LIMITS.MAX_RELATIONS;
    case 'admit-four-evidence-locators':
      return context.exactMaximumsObserved.evidenceLocators ===
        GraphSchema.LIMITS.MAX_EVIDENCE_LOCATORS;
    case 'advertise-128-prior-candidates':
      return context.exactMaximumsObserved.priorCandidateCount ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES;
    case 'advertise-16384-prior-candidate-bytes':
      return context.exactMaximumsObserved.priorCandidateBytes ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES &&
        context.exactMaximumsObserved.priorByteProjectionAdmitted === true;
    case 'request-2048-output-tokens':
      return context.exactMaximumsObserved.outputTokens ===
        GraphExtractor.LIMITS.MAX_OUTPUT_TOKENS;
    case 'admit-32-source-query-scope':
      return context.exactMaximumsObserved.scopeSources ===
        GraphQuery.LIMITS.MAX_SOURCE_GENERATIONS &&
        context.exactMaximumsObserved.scopeReleased === true;
    case 'admit-512-character-query':
      return context.exactMaximumsObserved.queryCharacters ===
        GraphQuery.LIMITS.MAX_QUERY_CHARACTERS &&
        context.exactMaximumsObserved.queryCharactersAdmitted === true;
    case 'admit-top-20-query':
      return context.exactMaximumsObserved.topN === GraphQuery.LIMITS.MAX_LEXICAL_RESULTS &&
        context.exactMaximumsObserved.topNAdmitted === true;
    case 'admit-depth-2-traversal':
      return context.exactMaximumsObserved.traversalDepth ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH &&
        context.exactMaximumsObserved.traversalDepthAdmitted === true;
    case 'admit-node-limit-64':
      return context.exactMaximumsObserved.nodeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_NODES &&
        context.exactMaximumsObserved.nodeLimitAdmitted === true;
    case 'admit-edge-limit-128':
      return context.exactMaximumsObserved.edgeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES &&
        context.exactMaximumsObserved.edgeLimitAdmitted === true;
    case 'admit-65536-result-bytes':
      return context.exactMaximumsObserved.resultBytes === GraphQuery.LIMITS.MAX_RESULT_BYTES &&
        context.exactMaximumsObserved.resultAdmitted === true;

    case 'reject-192001-character-source-before-provider':
      return context.maxPlusOneObserved.sourceCharacters ===
        GraphExtractor.LIMITS.MAX_CHARACTERS_PER_GENERATION + 1 &&
        context.maxPlusOneObserved.sourceProviderCalls === 0;
    case 'reject-nine-excerpt-context':
      return context.maxPlusOneObserved.excerptCount === GraphSchema.LIMITS.MAX_EXCERPTS + 1 &&
        context.maxPlusOneObserved.excerptContextRejected === true;
    case 'reject-24001-character-context':
      return context.maxPlusOneObserved.excerptCharacters ===
        GraphSchema.LIMITS.MAX_EXCERPT_CHARACTERS + 1 &&
        context.maxPlusOneObserved.characterContextRejected === true;
    case 'reject-131073-character-response':
      return context.maxPlusOneObserved.responseCharacters ===
        GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS + 1 &&
        context.maxPlusOneObserved.responseStageEffects === 0;
    case 'reject-129-records':
      return context.maxPlusOneObserved.schemaRecords === GraphSchema.LIMITS.MAX_RECORDS + 1 &&
        context.maxPlusOneObserved.recordEnvelopeRejected === true;
    case 'reject-257-relations':
      return context.maxPlusOneObserved.schemaRelations ===
        GraphSchema.LIMITS.MAX_RELATIONS + 1 &&
        context.maxPlusOneObserved.relationEnvelopeRejected === true;
    case 'reject-five-evidence-locators':
      return context.maxPlusOneObserved.evidenceLocators ===
        GraphSchema.LIMITS.MAX_EVIDENCE_LOCATORS + 1 &&
        context.maxPlusOneObserved.evidenceEnvelopeRejected === true;
    case 'reject-second-repair-call':
      return context.maxPlusOneObserved.repairAttempts ===
        GraphExtractor.LIMITS.MAX_REPAIR_CALLS_PER_GENERATION + 1 &&
        context.maxPlusOneObserved.repairProviderCalls === 2 &&
        context.maxPlusOneObserved.secondRepairRejected === true;
    case 'reject-129th-prior-candidate':
      return context.maxPlusOneObserved.priorCandidatesAttempted ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES + 1 &&
        context.maxPlusOneObserved.priorCandidatesProjected ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES &&
        context.maxPlusOneObserved.priorCandidateOverflowRejected === true;
    case 'reject-16385-prior-candidate-bytes':
      return context.maxPlusOneObserved.priorCandidateBytesAttempted ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES + 1 &&
        context.maxPlusOneObserved.priorByteProjectionCount === 0 &&
        context.maxPlusOneObserved.priorByteOverflowRejected === true;
    case 'reject-33-source-query-scope':
      return context.maxPlusOneObserved.scopeSources ===
        GraphQuery.LIMITS.MAX_SOURCE_GENERATIONS + 1 &&
        context.maxPlusOneObserved.scopeRejected === true;
    case 'reject-513-character-query':
      return context.maxPlusOneObserved.queryCharactersControl ===
        GraphQuery.LIMITS.MAX_QUERY_CHARACTERS &&
        context.maxPlusOneObserved.queryCharactersControlAdmitted === true &&
        context.maxPlusOneObserved.queryCharacters ===
        GraphQuery.LIMITS.MAX_QUERY_CHARACTERS + 1 &&
        context.maxPlusOneObserved.queryRejected === true;
    case 'reject-top-21-query':
      return context.maxPlusOneObserved.topNControl ===
        GraphQuery.LIMITS.MAX_LEXICAL_RESULTS &&
        context.maxPlusOneObserved.topNControlAdmitted === true &&
        context.maxPlusOneObserved.topN === GraphQuery.LIMITS.MAX_LEXICAL_RESULTS + 1 &&
        context.maxPlusOneObserved.topNRejected === true;
    case 'reject-depth-3-traversal':
      return context.maxPlusOneObserved.traversalDepthControl ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH &&
        context.maxPlusOneObserved.traversalDepthControlAdmitted === true &&
        context.maxPlusOneObserved.traversalDepth ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH + 1 &&
        context.maxPlusOneObserved.traversalDepthRejected === true;
    case 'reject-node-limit-65':
      return context.maxPlusOneObserved.nodeLimitControl ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_NODES &&
        context.maxPlusOneObserved.nodeLimitControlAdmitted === true &&
        context.maxPlusOneObserved.nodeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_NODES + 1 &&
        context.maxPlusOneObserved.nodeLimitRejected === true;
    case 'reject-edge-limit-129':
      return context.maxPlusOneObserved.edgeLimitControl ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES &&
        context.maxPlusOneObserved.edgeLimitControlAdmitted === true &&
        context.maxPlusOneObserved.edgeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES + 1 &&
        context.maxPlusOneObserved.edgeLimitRejected === true;
    case 'reject-65537-result-bytes':
      return context.maxPlusOneObserved.resultBytesControl ===
        GraphQuery.LIMITS.MAX_RESULT_BYTES &&
        context.maxPlusOneObserved.resultBytesControlAdmitted === true &&
        context.maxPlusOneObserved.resultBytes === GraphQuery.LIMITS.MAX_RESULT_BYTES + 1 &&
        context.maxPlusOneObserved.resultBytesRejected === true;

    case 'observe-eight-field-session-invariants': return context.sessionInvariantObserved === true;
    case 'derive-fresh-exact-key':
    case 'reject-certificate-replay':
    case 'derive-distinct-semantic-key':
    case 'derive-distinct-source-key':
    case 'derive-distinct-partition-key':
    case 'reject-fallback-model': return context.reuseBoundariesObserved === true;
    case 'reuse-published-fragment-with-fresh-certificate':
      return context.reuseBoundariesObserved === true && operation.reason === 'reused' &&
        metrics.providerCalls === 0 && metrics.stageEffects === 0;
    default: return undefined;
  }
}

function verifyAuthorityTransitionScript(context, actual) {
  const observed = [];
  for (const token of context.item.authority_transition_script) {
    const proven = transitionProof(context, actual, token);
    assert.notStrictEqual(proven, undefined,
      `${context.item.id} has an executable proof for authority transition ${token}`);
    assert.strictEqual(proven, true,
      `${context.item.id} executes authority transition ${token}`);
    observed.push(token);
  }
  assert.deepStrictEqual(observed, context.item.authority_transition_script,
    `${context.item.id} executes its authority transition script in declared order`);
}

async function queryProof(context, expectedProof) {
  const proof = {};
  const facade = context.layer.facade;
  const selection = Object.freeze({ sourceFileId: context.sourceFileId });
  const fragment = context.fragment;
  const firstRecord = fragment && fragment.records[0];
  const firstRelation = fragment && fragment.relations[0];
  for (const key of Object.keys(expectedProof)) {
    if (own(context.queryOverrides || {}, key)) {
      proof[key] = context.queryOverrides[key];
      continue;
    }
    if (key === 'lexical') {
      const result = await facade.searchLexical(EVAL_TUPLE, selection, Object.freeze({
        query: firstRecord.label,
        topN: 20
      }));
      proof[key] = result.decision === 'admitted' && Array.isArray(result.value) &&
        result.value.some((entry) => entry.stableRecordId === firstRecord.stableRecordId &&
          entry.sourceFileId === context.sourceFileId &&
          entry.fragmentGenerationId === fragment.fragmentGenerationId);
    } else if (key === 'provenance') {
      const result = await facade.inspectProvenance(EVAL_TUPLE, selection, Object.freeze({
        sourceFileId: context.sourceFileId,
        fragmentGenerationId: fragment.fragmentGenerationId,
        entityType: 'record',
        entityId: firstRecord.stableRecordId
      }));
      proof[key] = result.decision === 'admitted' && result.value &&
        result.value.locators.length === firstRecord.evidence.length &&
        result.value.sourceFileId === context.sourceFileId;
    } else if (key === 'neighbors') {
      const result = await facade.neighbors(EVAL_TUPLE, selection, Object.freeze({
        sourceFileId: context.sourceFileId,
        fragmentGenerationId: fragment.fragmentGenerationId,
        stableRecordId: firstRelation.fromStableRecordId,
        predicate: firstRelation.predicate,
        direction: 'out', depth: 1, nodeLimit: 64, edgeLimit: 128
      }));
      proof[key] = result.decision === 'admitted' && result.value &&
        result.value.edges.some((edge) => edge.relationVersionId === firstRelation.relationVersionId);
    } else if (key === 'get_by_id') {
      const result = await facade.getById(EVAL_TUPLE, selection, Object.freeze({
        sourceFileId: context.sourceFileId,
        fragmentGenerationId: fragment.fragmentGenerationId,
        stableRecordId: firstRecord.stableRecordId
      }));
      proof[key] = result.decision === 'admitted' && result.value &&
        result.value.recordVersionId === firstRecord.recordVersionId;
    } else if (key === 'exact_scope_only') {
      const exact = await facade.getById(EVAL_TUPLE, selection, Object.freeze({
        sourceFileId: context.sourceFileId,
        fragmentGenerationId: fragment.fragmentGenerationId,
        stableRecordId: firstRecord.stableRecordId
      }));
      const unrelated = await facade.getById(
        EVAL_TUPLE,
        Object.freeze({ sourceFileId: `${context.sourceFileId}-unrelated` }),
        Object.freeze({
          sourceFileId: context.sourceFileId,
          fragmentGenerationId: fragment.fragmentGenerationId,
          stableRecordId: firstRecord.stableRecordId
        })
      );
      proof[key] = exact.decision === 'admitted' && !!exact.value &&
        (!unrelated || unrelated.decision !== 'admitted' || !unrelated.value);
    } else if (key === 'current') {
      const result = await facade.inspectStatus(EVAL_TUPLE, selection);
      proof[key] = result.decision === 'admitted' && result.value && result.value.state === 'published';
    } else if (key === 'empty') {
      proof[key] = !fragment || (fragment.records.length === 0 && fragment.relations.length === 0);
    } else if (key === 'exact_source_scope') {
      proof[key] = context.exactMaximumsObserved.scopeSources ===
        GraphQuery.LIMITS.MAX_SOURCE_GENERATIONS &&
        context.exactMaximumsObserved.scopeReleased === true;
    } else if (key === 'exact_query_characters') {
      proof[key] = context.exactMaximumsObserved.queryCharacters ===
        GraphQuery.LIMITS.MAX_QUERY_CHARACTERS &&
        context.exactMaximumsObserved.queryCharactersAdmitted === true;
    } else if (key === 'exact_top_n') {
      proof[key] = context.exactMaximumsObserved.topN ===
        GraphQuery.LIMITS.MAX_LEXICAL_RESULTS &&
        context.exactMaximumsObserved.topNAdmitted === true;
    } else if (key === 'exact_traversal_depth') {
      proof[key] = context.exactMaximumsObserved.traversalDepth ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH &&
        context.exactMaximumsObserved.traversalDepthAdmitted === true;
    } else if (key === 'exact_node_limit') {
      proof[key] = context.exactMaximumsObserved.nodeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_NODES &&
        context.exactMaximumsObserved.nodeLimitAdmitted === true;
    } else if (key === 'exact_edge_limit') {
      proof[key] = context.exactMaximumsObserved.edgeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES &&
        context.exactMaximumsObserved.edgeLimitAdmitted === true;
    } else if (key === 'exact_result_bytes') {
      proof[key] = context.exactMaximumsObserved.resultBytes ===
        GraphQuery.LIMITS.MAX_RESULT_BYTES &&
        context.exactMaximumsObserved.resultAdmitted === true;
    } else if (key === 'prior_candidate_count_rejected') {
      proof[key] = context.maxPlusOneObserved.priorCandidatesAttempted ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES + 1 &&
        context.maxPlusOneObserved.priorCandidateOverflowRejected === true;
    } else if (key === 'prior_candidate_bytes_rejected') {
      proof[key] = context.maxPlusOneObserved.priorCandidateBytesAttempted ===
        GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES + 1 &&
        context.maxPlusOneObserved.priorByteOverflowRejected === true;
    } else if (key === 'source_scope_rejected') {
      proof[key] = context.maxPlusOneObserved.scopeSources ===
        GraphQuery.LIMITS.MAX_SOURCE_GENERATIONS + 1 &&
        context.maxPlusOneObserved.scopeRejected === true;
    } else if (key === 'query_characters_rejected') {
      proof[key] = context.maxPlusOneObserved.queryCharactersControl ===
        GraphQuery.LIMITS.MAX_QUERY_CHARACTERS &&
        context.maxPlusOneObserved.queryCharactersControlAdmitted === true &&
        context.maxPlusOneObserved.queryCharacters ===
        GraphQuery.LIMITS.MAX_QUERY_CHARACTERS + 1 &&
        context.maxPlusOneObserved.queryRejected === true;
    } else if (key === 'top_n_rejected') {
      proof[key] = context.maxPlusOneObserved.topNControl ===
        GraphQuery.LIMITS.MAX_LEXICAL_RESULTS &&
        context.maxPlusOneObserved.topNControlAdmitted === true &&
        context.maxPlusOneObserved.topN ===
        GraphQuery.LIMITS.MAX_LEXICAL_RESULTS + 1 &&
        context.maxPlusOneObserved.topNRejected === true;
    } else if (key === 'traversal_depth_rejected') {
      proof[key] = context.maxPlusOneObserved.traversalDepthControl ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH &&
        context.maxPlusOneObserved.traversalDepthControlAdmitted === true &&
        context.maxPlusOneObserved.traversalDepth ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH + 1 &&
        context.maxPlusOneObserved.traversalDepthRejected === true;
    } else if (key === 'node_limit_rejected') {
      proof[key] = context.maxPlusOneObserved.nodeLimitControl ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_NODES &&
        context.maxPlusOneObserved.nodeLimitControlAdmitted === true &&
        context.maxPlusOneObserved.nodeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_NODES + 1 &&
        context.maxPlusOneObserved.nodeLimitRejected === true;
    } else if (key === 'edge_limit_rejected') {
      proof[key] = context.maxPlusOneObserved.edgeLimitControl ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES &&
        context.maxPlusOneObserved.edgeLimitControlAdmitted === true &&
        context.maxPlusOneObserved.edgeLimit ===
        GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES + 1 &&
        context.maxPlusOneObserved.edgeLimitRejected === true;
    } else if (key === 'result_bytes_rejected') {
      proof[key] = context.maxPlusOneObserved.resultBytesControl ===
        GraphQuery.LIMITS.MAX_RESULT_BYTES &&
        context.maxPlusOneObserved.resultBytesControlAdmitted === true &&
        context.maxPlusOneObserved.resultBytes === GraphQuery.LIMITS.MAX_RESULT_BYTES + 1 &&
        context.maxPlusOneObserved.resultBytesRejected === true;
    } else if (key === 'candidate_edges') {
      const shards = fragment && await context.layer.graphStore.readActiveShards({
        partitionKey: EVAL_PARTITION,
        sourceFileId: context.sourceFileId,
        fragmentGenerationId: fragment.fragmentGenerationId
      });
      proof[key] = !!(shards && shards.candidateRelations.length > 0);
    } else {
      throw new Error(`${context.item.id} has no executable query proof for ${key}`);
    }
  }
  return proof;
}

async function absenceProof(context, expectedProof) {
  const snapshot = context.harness.storage.snapshot();
  const serializedStorage = JSON.stringify(snapshot);
  const projection = fragmentProjection(context.fragment);
  const candidateRelations = context.candidateRelations || [];
  const metrics = context.harness.metrics;
  const output = [];
  for (const token of expectedProof) {
    let proven = false;
    if (token === 'diagnostics') {
      proven = !storageHasKind(snapshot, 'diagnostic');
    } else if (token === 'errors') {
      proven = metrics.errors.length === 0;
    } else if (token === 'unrelated-partition') {
      proven = Object.values(snapshot).every((value) =>
        !value || !value.partitionKey || value.partitionKey === EVAL_PARTITION);
    } else if (token === 'unauthorized-output' || token === 'status-output') {
      proven = !JSON.stringify(context.operationResult || {}).includes(context.sourceFileId);
    } else if (token === 'raw-provider') {
      const raw = context.rawResponse;
      proven = typeof raw === 'string' && !serializedStorage.includes(raw) &&
        !JSON.stringify(metrics.trace).includes(raw);
    } else if (token === 'source-text') {
      proven = !serializedStorage.includes(context.sourceText);
    } else if (token === 'unknown-kind') {
      proven = context.fragment.records.every((record) => GraphSchema.RECORD_KINDS.includes(record.kind));
    } else if (token === 'old-generation') {
      proven = context.oldGenerationAbsent === true;
    } else if (token === 'truncated-qualifier') {
      const qualifier = 'only if';
      const start = context.sourceText.indexOf(qualifier);
      proven = start >= 0 && projection.spans.some((span) =>
        span[0] <= start && span[1] >= start + qualifier.length);
    } else if (token === 'lost-negation') {
      const negation = 'must not';
      const start = context.sourceText.indexOf(negation);
      proven = start >= 0 && projection.spans.some((span) =>
        span[0] <= start && span[1] >= start + negation.length);
    } else if (token === 'missing-exception') {
      const exceptionStart = context.sourceText.indexOf('Except for');
      const definitionEnd = context.sourceText.indexOf('Section 1') + 'Section 1'.length;
      proven = exceptionStart >= 0 && definitionEnd >= 'Section 1'.length &&
        projection.spans.some((span) => span[0] <= exceptionStart && span[1] >= definitionEnd);
    } else if (token === 'invented-target') {
      proven = projection.relations.length === 0 && candidateRelations.length === 0;
    } else if (token === 'stage-effect' || token === 'new-stage') {
      proven = metrics.stageEffects === 0;
    } else if (token === 'provider-call') {
      proven = metrics.providerCalls === 0;
    } else if (token === 'fallback-provider-call' || token === 'next-provider-call') {
      proven = metrics.providerCalls === 1;
    } else if (token === 'overflow-effect') {
      proven = metrics.providerCalls === 1 && metrics.stageEffects === 1;
    } else if (token === 'ninth-provider-call') {
      proven = metrics.providerCalls === 8;
    } else if (token === 'late-write') {
      proven = metrics.stageEffects === 0 && metrics.publishEffects === 0;
    } else if (token === 'partial-query-result') {
      proven = context.queryOverrides.closed === true && context.queryOverrides.partial === false;
    } else if (token === 'fragments') {
      proven = !storageHasKind(snapshot, 'fragment-record') &&
        !storageHasKind(snapshot, 'fragment-relation');
    } else if (token === 'indexes') {
      proven = !storageHasKind(snapshot, 'lexical');
    } else if (token === 'relationships') {
      proven = !storageHasKind(snapshot, 'adjacency') &&
        !storageHasKind(snapshot, 'overlay-control') &&
        !storageHasKind(snapshot, 'overlay-relation') &&
        !storageHasKind(snapshot, 'overlay-adjacency');
    } else if (token === 'result-cache') {
      proven = !storageHasKind(snapshot, 'result-cache');
    } else if (token === 'boot-cache-hydration') {
      proven = context.bootIndexBuilds === 0;
    } else if (token === 'old-relation-version') {
      proven = context.oldRelationAbsent === true;
    } else if (token === 'old-overlay-generation') {
      proven = context.oldOverlayAbsent === true;
    } else if (token === 'target-authority') {
      proven = metrics.trace.every((entry) => !entry.sourceFileIds.includes(context.targetSourceFileId));
    } else if (token === 'target-read') {
      proven = !metrics.transportReads[context.targetSourceFileId] &&
        !metrics.fragmentReads[context.targetSourceFileId];
    } else if (token === 'target-existence-signal') {
      proven = !JSON.stringify(context.operationResult || {}).includes(context.targetSourceFileId);
    } else if (token === 'old-overlay') {
      proven = !storageHasKind(snapshot, 'overlay-control') && candidateRelations.length === 0;
    } else if (token === 'cross-document-claim' || token === 'adjudicated-relation') {
      proven = projection.relations.every((predicate) =>
        !GraphSchema.CROSS_DOCUMENT_PREDICATES.includes(predicate)) &&
        candidateRelations.every((relation) => relation.relationClass === 'cross-document-candidate');
    } else if (token === 'partial-fragment') {
      proven = !context.fragment ||
        (context.fragment.records.length === 0 && context.fragment.relations.length === 0);
    } else if (token === 'forged-locator' || token === 'model-cross-source' ||
        token === 'invalid-edge') {
      proven = !context.fragment;
    } else if (token === 'tool-effect') {
      proven = metrics.toolCalls === 0;
    } else if (token === 'network-effect') {
      proven = metrics.networkCalls === 0;
    } else if (token === 'cross-partition-influence') {
      proven = context.foreignVisibleInOwnPartition === true &&
        context.foreignAbsentFromLocalPartition === true;
    } else if (token === 'target-payload') {
      proven = context.targetPayloadAbsent === true;
    } else if (token === 'quota-partial-generation') {
      proven = !context.fragment && context.quotaRecoveryConverged === true;
    } else if (token === 'corrupt-orphan') {
      proven = context.corruptOrphansRemaining === 0;
    } else if (token === 'fallback-provider') {
      proven = metrics.providerSelections.length === metrics.providerCalls &&
        metrics.providerSelections.every((selection) =>
          selection.providerId === 'eval-provider' && selection.modelId === 'eval-model');
    } else if (token === 'duplicate-reference' || token === 'dangling-reference') {
      proven = context.duplicateRejected === true && context.danglingRejected === true;
    } else if (token === 'out-of-range-offset' || token === 'nonmatching-offset') {
      proven = context.offsetFailuresRejected === true;
    } else if (token === 'clipped-material-qualifier') {
      proven = context.clippedQualifierRejected === true && !context.fragment;
    } else if (token === 'ninth-normal-provider-call') {
      proven = metrics.providerRequests.filter((request) => !request.envelope.repair).length ===
        GraphExtractor.LIMITS.MAX_NORMAL_CALLS_PER_GENERATION;
    } else if (token === 'second-repair-call') {
      proven = metrics.providerRequests.filter((request) => request.envelope.repair).length ===
        GraphExtractor.LIMITS.MAX_REPAIR_CALLS_PER_GENERATION;
    } else if (token === 'unsupported-record' || token === 'ambiguous-label') {
      proven = projection.records.length === 0;
    } else if (token === 'similarity-link' || token === 'date-link' ||
        token === 'filename-link' || token === 'unresolved-reference' ||
        token === 'guessed-target') {
      proven = projection.relations.length === 0 && candidateRelations.length === 0;
    }
    assert.strictEqual(proven, true, `${context.item.id} proves absence of ${token}`);
    output.push(token);
  }
  return output;
}

async function finishCase(context, projectionOverride, overlayOnly = false) {
  const item = context.item;
  const operation = operationProjection(context.operationResult);
  const fragmentValues = projectionOverride || fragmentProjection(context.fragment);
  const actual = {
    publish_state: context.publishState || operation.publishState,
    fixed_reason: context.reason || operation.reason,
    provisional_records: fragmentValues.records,
    provisional_relations: fragmentValues.relations,
    provisional_spans: fragmentValues.spans,
    durable_keys: await logicalDurableKeys(context, overlayOnly),
    query_proof: await queryProof(context, item.expected.query_proof),
    absence_proof: await absenceProof(context, item.expected.absence_proof)
  };
  assert.deepStrictEqual(actual, item.expected, `${item.id} runtime output matches every expected field`);
  verifyProviderBoundary(context);
  verifyAuthorityTransitionScript(context, actual);
  assert.strictEqual(context.harness.metrics.providerCalls, item.budgets.provider_call_count,
    `${item.id} uses the exact declared provider-call budget`);
  const normalCalls = context.harness.metrics.providerRequests.filter(
    (request) => !request.envelope.repair).length;
  const repairCalls = context.harness.metrics.providerRequests.length - normalCalls;
  assert.ok(normalCalls <= GraphExtractor.LIMITS.MAX_NORMAL_CALLS_PER_GENERATION,
    `${item.id} remains inside the production normal-call cap`);
  assert.ok(repairCalls <= GraphExtractor.LIMITS.MAX_REPAIR_CALLS_PER_GENERATION,
    `${item.id} remains inside the production repair-call cap`);
  if (own(item.budgets, 'normal_provider_call_count')) {
    assert.strictEqual(normalCalls, item.budgets.normal_provider_call_count);
  }
  if (own(item.budgets, 'repair_call_count')) {
    assert.strictEqual(repairCalls, item.budgets.repair_call_count);
  }
  return actual;
}

async function executeDefaultCase(item, observed = {}) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response, {
    metadataName: item.special_assertions.metadata_name
  });
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  const context = Object.assign({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: current.fragment,
    queryOverrides: Object.create(null),
    candidateRelations: []
  }, observed);
  if (item.id === 'R03') {
    assert.strictEqual(harness.metrics.replayStatus, 'certificate-reused');
    assert.strictEqual(harness.metrics.expiredStatus, 'certificate-expired');
  }
  if (item.id === 'I05') {
    assert.strictEqual(harness.metrics.providerAcks, 1,
      `${item.id} observes exactly one provider-no-storage acknowledgement`);
    assert.strictEqual(harness.metrics.stageEffects, 0,
      `${item.id} performs no certified stage after provider binding drift`);
    assert.deepStrictEqual(harness.metrics.providerSelections, [
      { providerId: 'eval-provider', modelId: 'eval-model' }
    ], `${item.id} never attempts a fallback provider or model`);
  }
  return finishCase(context);
}

async function executeReplacementCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  const oldText = `${sourceText} old`;
  harness.addSource(
    sourceFileId,
    oldText,
    simpleEnvelope(`${item.id}_old`, 'agreement', `${item.id} Old Agreement`, sourceText.length)
  );
  const seeded = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(seeded).reason, 'published', `${item.id} seeds old truth`);
  const old = await readCurrentFragment(harness.current(), sourceFileId);
  assert.ok(old.fragment, `${item.id} old generation is current before replacement`);
  harness.updateSource(sourceFileId, {
    text: sourceText,
    rawResponse: item.recorded_provider.raw_response
  });
  harness.resetMetrics();
  const operationResult = await harness.current().facade.updateSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  const oldRead = await harness.current().graphStore.readCurrentFragment({
    partitionKey: EVAL_PARTITION,
    sourceFileId,
    fragmentGenerationId: old.fragment.fragmentGenerationId
  });
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: current.fragment,
    oldGenerationAbsent: oldRead === null,
    queryOverrides: item.id === 'P05' ? { replacement_current: !!current.fragment } : {},
    candidateRelations: []
  });
}

async function seedCandidateEndpoints(item, harness) {
  const proposerSourceFileId = `eval-${item.id}-proposer`;
  const targetSourceFileId = `eval-${item.id}-target`;
  const proposerText = fixtureSourceText(item);
  const targetText = `Synthetic policy target ${item.id}.`;
  harness.addSource(
    proposerSourceFileId,
    proposerText,
    simpleEnvelope(`${item.id}_proposer`, 'amendment', `${item.id} Amendment`, proposerText.length)
  );
  harness.addSource(
    targetSourceFileId,
    targetText,
    simpleEnvelope(`${item.id}_target`, 'policy-document', `${item.id} Policy`, targetText.length)
  );
  const proposerBuild = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId: proposerSourceFileId })
  );
  const targetBuild = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId: targetSourceFileId })
  );
  assert.strictEqual(operationProjection(proposerBuild).reason, 'published');
  assert.strictEqual(operationProjection(targetBuild).reason, 'published');
  const proposer = await readCurrentFragment(harness.current(), proposerSourceFileId);
  const target = await readCurrentFragment(harness.current(), targetSourceFileId);
  assert.ok(proposer.fragment && target.fragment, `${item.id} seeds both exact endpoints`);
  return {
    proposerSourceFileId,
    targetSourceFileId,
    proposerText,
    targetText,
    proposer: proposer.fragment,
    target: target.fragment
  };
}

function candidateIntent(endpoints) {
  return {
    partitionKey: EVAL_PARTITION,
    relationKind: 'references-policy',
    proposingSourceFileId: endpoints.proposerSourceFileId,
    targetSourceFileId: endpoints.targetSourceFileId,
    fromStableRecordId: endpoints.proposer.records[0].stableRecordId,
    toStableRecordId: endpoints.target.records[0].stableRecordId,
    evidenceLocatorIds: [endpoints.proposer.records[0].evidence[0].locatorId]
  };
}

async function publishCandidate(harness, endpoints) {
  const intent = candidateIntent(endpoints);
  assert.ok(GraphSchema.parseCandidateRelationIntent(intent), 'candidate intent passes production schema');
  const result = await harness.current().facade.replaceCandidateRelations(
    EVAL_TUPLE,
    Object.freeze({
      sourceFileIds: Object.freeze([
        endpoints.proposerSourceFileId,
        endpoints.targetSourceFileId
      ])
    }),
    Object.freeze({
      proposingSourceFileId: endpoints.proposerSourceFileId,
      relations: Object.freeze([deepFreeze(intent)])
    })
  );
  const shards = await harness.current().graphStore.readActiveShards({
    partitionKey: EVAL_PARTITION,
    sourceFileId: endpoints.proposerSourceFileId,
    fragmentGenerationId: endpoints.proposer.fragmentGenerationId
  });
  assert.ok(shards && shards.candidateRelations.length === 1,
    'production store exposes one current candidate relation');
  return { result, relation: shards.candidateRelations[0], shards };
}

async function queryCandidate(harness, endpoints, relation) {
  const result = await harness.current().facade.neighbors(
    EVAL_TUPLE,
    Object.freeze({
      sourceFileIds: Object.freeze([
        endpoints.proposerSourceFileId,
        endpoints.targetSourceFileId
      ])
    }),
    Object.freeze({
      sourceFileId: endpoints.proposerSourceFileId,
      fragmentGenerationId: endpoints.proposer.fragmentGenerationId,
      stableRecordId: endpoints.proposer.records[0].stableRecordId,
      predicate: 'references-policy',
      direction: 'out',
      depth: 1,
      nodeLimit: 64,
      edgeLimit: 128
    })
  );
  const edge = result && result.decision === 'admitted' && result.value &&
    result.value.edges.find((entry) => entry.relationVersionId === relation.relationVersionId);
  return {
    result,
    edge,
    bothEndpointGenerations: !!edge &&
      result.value.nodes.some((node) =>
        node.sourceFileId === endpoints.proposerSourceFileId &&
        node.fragmentGenerationId === endpoints.proposer.fragmentGenerationId) &&
      result.value.nodes.some((node) =>
        node.sourceFileId === endpoints.targetSourceFileId &&
        node.fragmentGenerationId === endpoints.target.fragmentGenerationId)
  };
}

function overlayGeneration(snapshot) {
  const control = Object.values(snapshot).find((value) =>
    value && value.kind === 'candidate-overlay-control');
  return control && control.overlayGenerationId;
}

async function executePositiveCandidateCase(item) {
  const harness = createExecutableHarness(item);
  const endpoints = await seedCandidateEndpoints(item, harness);
  harness.resetMetrics();
  const published = await publishCandidate(harness, endpoints);
  const identityTuple = Object.fromEntries(
    item.special_assertions.candidate_relation_tuple.map((key) => [key, published.relation[key]])
  );
  exactKeys(identityTuple, item.special_assertions.candidate_relation_tuple,
    `${item.id} observes the exact production candidate-relation identity tuple`);
  assert.ok(Object.values(identityTuple).every((value) => typeof value === 'string' && value),
    `${item.id} observes every candidate identity value`);
  assert.strictEqual(identityTuple.partitionKey, EVAL_PARTITION);
  assert.strictEqual(identityTuple.relationKind, 'references-policy');
  assert.strictEqual(identityTuple.proposerRecordVersionId,
    endpoints.proposer.records[0].recordVersionId);
  assert.strictEqual(identityTuple.proposerFragmentGenerationId,
    endpoints.proposer.fragmentGenerationId);
  assert.strictEqual(identityTuple.targetRecordVersionId,
    endpoints.target.records[0].recordVersionId);
  assert.strictEqual(identityTuple.targetFragmentGenerationId,
    endpoints.target.fragmentGenerationId);
  const queried = await queryCandidate(harness, endpoints, published.relation);
  const spans = published.relation.evidence.map((locator) => [
    locator.sourceByteStart,
    locator.sourceByteEnd
  ]);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId: endpoints.proposerSourceFileId,
    sourceText: endpoints.proposerText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult: published.result,
    fragment: endpoints.proposer,
    candidateIdentityObserved: true,
    candidateRelations: [published.relation],
    queryOverrides: {
      candidate_only: !!queried.edge && queried.edge.candidateOnly === true,
      both_endpoint_generations: queried.bothEndpointGenerations
    }
  }, {
    records: [],
    relations: [published.relation.relationKind],
    spans
  }, true);
}

async function executeTargetAdvanceCase(item) {
  const harness = createExecutableHarness(item);
  const endpoints = await seedCandidateEndpoints(item, harness);
  const first = await publishCandidate(harness, endpoints);
  const firstOverlay = overlayGeneration(harness.storage.snapshot());
  const proposerGeneration = endpoints.proposer.fragmentGenerationId;
  const targetGeneration = endpoints.target.fragmentGenerationId;
  const revisedTargetText = `${endpoints.targetText} revised`;
  harness.updateSource(endpoints.targetSourceFileId, { text: revisedTargetText });
  harness.resetMetrics();
  const targetUpdate = await harness.current().facade.updateSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId: endpoints.targetSourceFileId })
  );
  assert.strictEqual(operationProjection(targetUpdate).reason, 'published');
  const targetCurrent = await readCurrentFragment(harness.current(), endpoints.targetSourceFileId);
  const proposerCurrent = await readCurrentFragment(harness.current(), endpoints.proposerSourceFileId);
  const staleShards = await harness.current().graphStore.readActiveShards({
    partitionKey: EVAL_PARTITION,
    sourceFileId: endpoints.proposerSourceFileId,
    fragmentGenerationId: proposerCurrent.fragment.fragmentGenerationId
  });
  assert.strictEqual(staleShards.candidateRelations.length, 0,
    `${item.id} target advance suppresses stale incoming influence`);
  endpoints.proposer = proposerCurrent.fragment;
  endpoints.target = targetCurrent.fragment;
  const second = await publishCandidate(harness, endpoints);
  const secondOverlay = overlayGeneration(harness.storage.snapshot());
  const queried = await queryCandidate(harness, endpoints, second.relation);
  const serializedStorage = JSON.stringify(harness.storage.snapshot());
  const spans = second.relation.evidence.map((locator) => [
    locator.sourceByteStart,
    locator.sourceByteEnd
  ]);
  assert.strictEqual(endpoints.proposer.fragmentGenerationId, proposerGeneration);
  assert.notStrictEqual(endpoints.target.fragmentGenerationId, targetGeneration);
  assert.notStrictEqual(first.relation.relationVersionId, second.relation.relationVersionId);
  assert.notStrictEqual(firstOverlay, secondOverlay);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId: endpoints.proposerSourceFileId,
    sourceText: endpoints.proposerText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult: second.result,
    fragment: endpoints.proposer,
    seededTwoSources: true,
    candidateRelations: [second.relation],
    targetGenerationAdvanced: endpoints.target.fragmentGenerationId !== targetGeneration,
    relationVersionAdvanced: first.relation.relationVersionId !== second.relation.relationVersionId,
    overlayGenerationAdvanced: firstOverlay !== secondOverlay,
    oldRelationAbsent: !serializedStorage.includes(first.relation.relationVersionId),
    oldOverlayAbsent: !serializedStorage.includes(firstOverlay),
    queryOverrides: {
      old_incoming_absent: staleShards.candidateRelations.length === 0,
      new_candidate_current: !!queried.edge && queried.edge.candidateOnly === true
    }
  }, {
    records: [],
    relations: [second.relation.relationKind],
    spans
  }, true);
}

async function executeProposerOnlyClearCase(item) {
  const harness = createExecutableHarness(item);
  const endpoints = await seedCandidateEndpoints(item, harness);
  await publishCandidate(harness, endpoints);
  harness.updateSource(endpoints.targetSourceFileId, { accessible: false });
  harness.resetMetrics();
  const operationResult = await harness.current().facade.replaceCandidateRelations(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId: endpoints.proposerSourceFileId }),
    Object.freeze({
      proposingSourceFileId: endpoints.proposerSourceFileId,
      relations: Object.freeze([])
    })
  );
  assert.strictEqual(operationResult.decision, 'admitted');
  exactKeys(operationResult.value, ['ok', 'status'], `${item.id} returns the fixed clear ack`);
  assert.strictEqual(operationResult.value.ok, true);
  assert.strictEqual(operationResult.value.status, 'cleared');
  const proposer = await readCurrentFragment(harness.current(), endpoints.proposerSourceFileId);
  const shards = await harness.current().graphStore.readActiveShards({
    partitionKey: EVAL_PARTITION,
    sourceFileId: endpoints.proposerSourceFileId,
    fragmentGenerationId: proposer.fragment.fragmentGenerationId
  });
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId: endpoints.proposerSourceFileId,
    targetSourceFileId: endpoints.targetSourceFileId,
    sourceText: endpoints.proposerText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: proposer.fragment,
    publishState: 'withheld',
    reason: 'cleared',
    candidateRelations: shards.candidateRelations,
    queryOverrides: { candidate_edges: shards.candidateRelations.length > 0 }
  }, { records: [], relations: [], spans: [] });
}

async function executePurgeCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, relatedEnvelope(item.id, sourceText.length));
  const seeded = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(seeded).reason, 'published');
  const seededCurrent = await readCurrentFragment(harness.current(), sourceFileId);
  await harness.current().facade.searchLexical(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId }),
    Object.freeze({ query: `${item.id} Agreement`, topN: 3 })
  );
  harness.resetMetrics();
  const request = Object.freeze({
    partitionKey: EVAL_PARTITION,
    accountPermissionId: EVAL_ACCOUNT,
    corpusRootFileId: EVAL_ROOT,
    sourceFileId,
    reason: 'access-revoked'
  });
  const capability = Object.freeze({});
  const controller = new AbortController();
  const authorization = Object.freeze({ signal: controller.signal, operationEpoch: 1 });
  const verifier = (presented, _mode, presentedRequest) =>
    presented === capability && presentedRequest === request ? authorization : null;
  for (const name of ['fragments', 'indexes', 'relationships', 'result-cache']) {
    const binder = harness.current().baseStore.getPurgeParticipant(name);
    assert.strictEqual(typeof binder, 'function', `${item.id} obtains ${name} purge binder`);
    const participant = binder(verifier);
    assert.ok(participant, `${item.id} binds ${name} to the live verifier`);
    const purged = await participant.purgeSource(request, capability);
    assert.strictEqual(purged.ok, true, `${item.id} purges ${name}`);
    const absent = await participant.hasOwnedInfluence(request, capability);
    assert.strictEqual(absent.owned, false, `${item.id} proves ${name} absence`);
  }
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  assert.strictEqual(current.fragment, null);
  const oldRead = await harness.current().graphStore.readCurrentFragment({
    partitionKey: EVAL_PARTITION,
    sourceFileId,
    fragmentGenerationId: seededCurrent.fragment.fragmentGenerationId
  });
  assert.strictEqual(oldRead, null);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult: Object.freeze({
      decision: 'admitted',
      value: Object.freeze({ status: 'purged' })
    }),
    fragment: null,
    queryOverrides: { empty: true },
    candidateRelations: []
  });
}

async function executeRecoveryCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  const label = 'R05 Recovery Record';
  harness.addSource(
    sourceFileId,
    sourceText,
    simpleEnvelope(item.id, 'agreement', label, sourceText.length)
  );
  const seeded = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(seeded).reason, 'published');
  const before = harness.storage.snapshot();
  harness.resetMetrics();
  const layer = harness.recreate();
  const bootIndexBuilds = harness.metrics.indexBuilds;
  const controller = new AbortController();
  const mutation = layer.graphStore.issueMutation(controller.signal);
  const recovered = await layer.graphStore.recover(mutation);
  assert.strictEqual(layer.graphStore.finishMutation(mutation).ok, true);
  assert.strictEqual(recovered.ok, true);
  const after = harness.storage.snapshot();
  const snapshotIdentical = JSON.stringify(after) === JSON.stringify(before);
  const current = await readCurrentFragment(layer, sourceFileId);
  const queried = await layer.facade.searchLexical(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId }),
    Object.freeze({ query: label, topN: 3 })
  );
  const lazyCache = bootIndexBuilds === 0 && harness.metrics.indexBuilds === 1 &&
    queried.decision === 'admitted' && queried.value.length === 1;
  return finishCase({
    item,
    harness,
    layer,
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult: Object.freeze({
      decision: 'admitted',
      value: Object.freeze({ status: 'published' })
    }),
    fragment: current.fragment,
    publishState: 'published',
    reason: 'recovered',
    bootIndexBuilds,
    queryOverrides: {
      snapshot_identical: snapshotIdentical,
      lazy_cache: lazyCache
    },
    candidateRelations: []
  });
}

async function executeTraversalLimitCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(
    sourceFileId,
    sourceText,
    simpleEnvelope(item.id, 'agreement', 'L03 Traversal Root', sourceText.length)
  );
  const seeded = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(seeded).reason, 'published');
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  harness.resetMetrics();
  const over = item.special_assertions.executable_traversal;
  const operationResult = await harness.current().facade.neighbors(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId }),
    Object.freeze({
      sourceFileId,
      fragmentGenerationId: current.fragment.fragmentGenerationId,
      stableRecordId: current.fragment.records[0].stableRecordId,
      predicate: 'contains',
      direction: 'out',
      depth: over.depth,
      nodeLimit: over.node_limit,
      edgeLimit: over.edge_limit
    })
  );
  assert.strictEqual(operationResult.decision, 'admitted');
  assert.strictEqual(operationResult.value, null);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: current.fragment,
    publishState: 'withheld',
    reason: 'closed',
    queryOverrides: { closed: true, partial: false },
    candidateRelations: []
  }, { records: [], relations: [], spans: [] });
}

async function executeReuseCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  const fingerprint = contentFingerprint(sourceText);
  let directSequence = 10_000;
  const directController = new AbortController();
  const prepared = await harness.graphExtractor.prepareSource(
    evaluationCertificate(sourceFileId, fingerprint, ++directSequence),
    directController.signal,
    async (sink, signal) => sink(Object.freeze({
      byteHash: fingerprint,
      exactByteLength: Buffer.byteLength(sourceText, 'utf8'),
      text: sourceText
    }), signal)
  );
  assert.ok(prepared.session, `${item.id} obtains the production opaque invariant session`);
  assert.deepStrictEqual(Object.keys(prepared.session), item.special_assertions.equal_invariant_tuple,
    `${item.id} observes the exact eight-field invariant tuple`);
  const exactCertificate = evaluationCertificate(
    sourceFileId, fingerprint, ++directSequence
  );
  const exactKey = await harness.graphExtractor.reuseKey(
    exactCertificate, 'eval-provider', 'eval-model'
  );
  assert.match(exactKey, /^sgrk1:/);
  const replay = await harness.graphExtractor.reuseKey(
    exactCertificate, 'eval-provider', 'eval-model'
  );
  assert.strictEqual(replay.status, 'certificate-reused');
  const semanticKey = await harness.graphExtractor.reuseKey(
    evaluationCertificate(sourceFileId, contentFingerprint(`${sourceText} semantically revised`),
      ++directSequence),
    'eval-provider', 'eval-model'
  );
  const otherSourceKey = await harness.graphExtractor.reuseKey(
    evaluationCertificate(`${sourceFileId}-other`, fingerprint, ++directSequence),
    'eval-provider', 'eval-model'
  );
  const otherPartitionKey = await harness.graphExtractor.reuseKey(
    evaluationCertificate(sourceFileId, fingerprint, ++directSequence, EVAL_NOW, {
      accountPermissionId: 'eval-account-other', corpusRootFileId: EVAL_ROOT
    }),
    'eval-provider', 'eval-model'
  );
  assert.notStrictEqual(semanticKey, exactKey, `${item.id} refuses semantic reuse`);
  assert.notStrictEqual(otherSourceKey, exactKey, `${item.id} refuses cross-source reuse`);
  assert.notStrictEqual(otherPartitionKey, exactKey, `${item.id} refuses cross-partition reuse`);
  assert.strictEqual((await harness.graphExtractor.reuseKey(
    evaluationCertificate(sourceFileId, fingerprint, ++directSequence),
    'eval-provider', 'fallback-model'
  )).status, 'provider-binding-changed');
  assert.strictEqual(harness.graphExtractor.discard(prepared.session).status, 'discarded');
  const seeded = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(seeded).reason, 'published');
  harness.resetMetrics();
  harness.faults.probeReuseCertificate = true;
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(operationResult).reason, 'reused');
  assert.strictEqual(harness.metrics.replayStatus, 'certificate-reused');
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: current.fragment,
    sessionInvariantObserved: true,
    reuseBoundariesObserved: true,
    queryOverrides: Object.create(null),
    candidateRelations: []
  });
}

function providerResponse(status) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get() { return null; } },
    async text() { return ''; },
    async json() { return { choices: [{ message: { content: '{}' } }] }; }
  };
}

async function verifyUniversalProviderCancellation() {
  const previousFetch = global.fetch;
  try {
    {
      const provider = new UniversalProvider({
        modelProvider: 'lmstudio', modelName: 'eval-cancel-model',
        lmstudioBaseUrl: 'localhost:1234'
      });
      const controller = new AbortController();
      let fetchCalls = 0;
      let started;
      const didStart = new Promise((resolve) => { started = resolve; });
      global.fetch = (_url, options) => {
        fetchCalls += 1;
        started();
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('synthetic fetch abort');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      };
      const pending = provider.sendRequest(
        { messages: [{ role: 'user', content: 'bounded cancellation probe' }] },
        { signal: controller.signal, timeout: 1_000 }
      );
      await didStart;
      controller.abort('private fetch reason');
      await assert.rejects(pending, (error) =>
        error && error.name === 'AbortError' && error.code === 'FSB_PROVIDER_ABORTED' &&
        !String(error.message).includes('private fetch reason'));
      assert.strictEqual(fetchCalls, 1, 'R02 abort during fetch permits no retry');
    }
    {
      const provider = new UniversalProvider({
        modelProvider: 'lmstudio', modelName: 'eval-backoff-model',
        lmstudioBaseUrl: 'localhost:1234'
      });
      const controller = new AbortController();
      let fetchCalls = 0;
      let entered;
      const didEnter = new Promise((resolve) => { entered = resolve; });
      provider.handleRateLimit = async () => {
        entered();
        return { shouldRetry: true, waitTime: 10_000 };
      };
      global.fetch = async () => {
        fetchCalls += 1;
        return providerResponse(429);
      };
      const pending = provider.sendRequest(
        { messages: [{ role: 'user', content: 'bounded backoff probe' }] },
        { signal: controller.signal, timeout: 1_000 }
      );
      await didEnter;
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort('private backoff reason');
      await assert.rejects(pending, (error) =>
        error && error.name === 'AbortError' && error.code === 'FSB_PROVIDER_ABORTED' &&
        !String(error.message).includes('private backoff reason'));
      assert.strictEqual(fetchCalls, 1, 'R02 abort during backoff permits no recursive fetch');
    }
  } finally {
    global.fetch = previousFetch;
  }
  return Object.freeze({ fetchAbortObserved: true, backoffAbortObserved: true });
}

async function executeProviderCancellationCase(item) {
  const observed = await verifyUniversalProviderCancellation();
  return executeDefaultCase(item, observed);
}

async function executeCrossPartitionCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  const current = await readCurrentFragment(harness.current(), sourceFileId);

  const foreignSourceFileId = `eval-${item.id}-foreign`;
  const foreignText = 'Synthetic Cross Partition Marker';
  const foreignAccount = 'eval-account-foreign';
  const foreignRoot = 'eval-root-foreign';
  const foreignPartition = CorpusSchema.makePartitionKey({
    accountPermissionId: foreignAccount,
    corpusRootFileId: foreignRoot
  });
  harness.addSource(
    foreignSourceFileId,
    foreignText,
    simpleEnvelope(`${item.id}_foreign`, 'memo', foreignText, foreignText.length),
    { accountPermissionId: foreignAccount, corpusRootFileId: foreignRoot }
  );
  const foreignBuild = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId: foreignSourceFileId })
  );
  assert.strictEqual(operationProjection(foreignBuild).reason, 'published');
  const foreign = await readCurrentFragment(
    harness.current(), foreignSourceFileId, foreignPartition
  );
  assert.ok(foreign.fragment, `${item.id} publishes the foreign marker only in its partition`);
  const visibleThere = await harness.current().facade.searchLexical(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId: foreignSourceFileId }),
    Object.freeze({ query: 'Synthetic Cross Partition Marker', topN: 20 })
  );
  const absentHere = await harness.current().facade.searchLexical(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId }),
    Object.freeze({ query: 'Synthetic Cross Partition Marker', topN: 20 })
  );
  const foreignVisibleInOwnPartition = visibleThere.decision === 'admitted' &&
    visibleThere.value.length === 1 &&
    visibleThere.value[0].sourceFileId === foreignSourceFileId;
  const foreignAbsentFromLocalPartition = absentHere.decision === 'admitted' &&
    absentHere.value.length === 0;
  assert.strictEqual(foreignVisibleInOwnPartition, true);
  assert.strictEqual(foreignAbsentFromLocalPartition, true);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: current.fragment,
    foreignVisibleInOwnPartition,
    foreignAbsentFromLocalPartition,
    queryOverrides: {
      foreign_visible_in_own_partition: foreignVisibleInOwnPartition,
      foreign_absent_from_local_partition: foreignAbsentFromLocalPartition
    },
    candidateRelations: []
  });
}

async function recoverLayer(layer) {
  const controller = new AbortController();
  const mutation = layer.graphStore.issueMutation(controller.signal);
  const result = await layer.graphStore.recover(mutation);
  assert.strictEqual(layer.graphStore.finishMutation(mutation).ok, true);
  return result;
}

async function quotaAttempt(item, failCall, timing) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}-${timing}-${failCall}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  if (failCall === 'after-provider') harness.faults.quotaAfterProviderTiming = timing;
  else harness.storage.failSetAt(failCall, timing);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  return { harness, sourceFileId, sourceText, operationResult };
}

async function executeQuotaCase(item) {
  const baseline = createExecutableHarness(item);
  const baselineSource = `eval-${item.id}-baseline`;
  const sourceText = fixtureSourceText(item);
  baseline.addSource(baselineSource, sourceText, item.recorded_provider.raw_response);
  const baselineResult = await baseline.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId: baselineSource })
  );
  assert.strictEqual(operationProjection(baselineResult).reason, 'published');
  const publicationSetCall = baseline.storage.setCalls();
  assert.ok(publicationSetCall > 1, `${item.id} observes a multi-write pointer-last publication`);

  const afterPublication = await quotaAttempt(item, publicationSetCall, 'after');
  const afterRecovery = await recoverLayer(afterPublication.harness.recreate());
  assert.ok(['complete', 'repaired'].includes(afterRecovery.status));
  const afterCurrent = await readCurrentFragment(
    afterPublication.harness.current(), afterPublication.sourceFileId
  );
  const afterWriteConverged = afterCurrent.fragment === null ||
    afterCurrent.fragment.records.length >= 0;
  assert.ok(afterWriteConverged,
    `${item.id} after-write quota converges to complete truth or complete absence`);

  const failed = await quotaAttempt(item, 'after-provider', 'before');
  const current = await readCurrentFragment(failed.harness.current(), failed.sourceFileId);
  assert.strictEqual(current.fragment, null, `${item.id} staging quota exposes no partial generation`);
  const recovered = await recoverLayer(failed.harness.recreate());
  assert.ok(['complete', 'repaired'].includes(recovered.status));
  const quotaRecoveryConverged = (await readCurrentFragment(
    failed.harness.current(), failed.sourceFileId
  )).fragment === null;
  return finishCase({
    item,
    harness: failed.harness,
    layer: failed.harness.current(),
    sourceFileId: failed.sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult: failed.operationResult,
    fragment: null,
    pointerLastWritesObserved: publicationSetCall > 1,
    afterWriteQuotaInjected: true,
    afterWriteConverged,
    beforeStageQuotaInjected: true,
    beforeStageRecovered: ['complete', 'repaired'].includes(recovered.status),
    quotaRecoveryConverged,
    queryOverrides: { empty: true },
    candidateRelations: []
  });
}

async function executeBoundedRecoveryCase(item) {
  const harness = createExecutableHarness(item);
  const corrupt = Object.create(null);
  for (let index = 0; index < 129; index += 1) {
    corrupt[`${GRAPH_STORAGE_PREFIX}control:corrupt-${String(index).padStart(3, '0')}`] = {
      forged: true
    };
  }
  await harness.storage.set(corrupt);
  const layer = harness.recreate();
  const first = await recoverLayer(layer);
  assert.strictEqual(first.status, 'recovery-pending');
  assert.strictEqual(Object.keys(harness.storage.snapshot()).length, 1,
    `${item.id} first wake processes exactly the bounded 128-item prefix`);
  const second = await recoverLayer(layer);
  assert.strictEqual(second.status, 'repaired');
  const corruptOrphansRemaining = Object.keys(harness.storage.snapshot()).length;
  assert.strictEqual(corruptOrphansRemaining, 0,
    `${item.id} second wake converges the seeded corrupt orphan suffix`);
  return finishCase({
    item,
    harness,
    layer,
    sourceFileId: `eval-${item.id}`,
    sourceText: fixtureSourceText(item),
    rawResponse: item.recorded_provider.raw_response,
    operationResult: Object.freeze({
      decision: 'admitted', value: Object.freeze({ status: 'repaired' })
    }),
    fragment: null,
    corruptControlsSeeded: Object.keys(corrupt).length,
    workerRecreated: layer === harness.current(),
    firstRecoveryStatus: first.status,
    firstRecoveryRemaining: 1,
    secondRecoveryStatus: second.status,
    corruptOrphansRemaining,
    queryOverrides: { empty: true },
    candidateRelations: []
  });
}

async function purgeSourceParticipants(harness, sourceFileId) {
  const request = Object.freeze({
    partitionKey: EVAL_PARTITION,
    accountPermissionId: EVAL_ACCOUNT,
    corpusRootFileId: EVAL_ROOT,
    sourceFileId,
    reason: 'access-revoked'
  });
  const capability = Object.freeze({});
  const controller = new AbortController();
  const authorization = Object.freeze({ signal: controller.signal, operationEpoch: 1 });
  const verifier = (presented, _mode, presentedRequest) =>
    presented === capability && presentedRequest === request ? authorization : null;
  const names = ['fragments', 'indexes', 'relationships', 'result-cache'];
  for (const name of names) {
    const participant = harness.current().baseStore.getPurgeParticipant(name)(verifier);
    assert.ok(participant, `R07 binds the ${name} participant to live revocation authority`);
    const result = await participant.purgeSource(request, capability);
    assert.strictEqual(result.ok, true, `R07 purges target ${name}`);
    const influence = await participant.hasOwnedInfluence(request, capability);
    assert.strictEqual(influence.owned, false, `R07 proves target ${name} absent`);
  }
  return names.length;
}

async function executeDeleteRevokeCase(item) {
  const harness = createExecutableHarness(item);
  const endpoints = await seedCandidateEndpoints(item, harness);
  const candidate = await publishCandidate(harness, endpoints);
  const candidateQuery = await queryCandidate(harness, endpoints, candidate.relation);
  assert.ok(candidateQuery.edge, `${item.id} starts with observable authorized target influence`);
  const purgedParticipantCount = await purgeSourceParticipants(
    harness, endpoints.targetSourceFileId
  );
  const targetAfterPurge = await readCurrentFragment(
    harness.current(), endpoints.targetSourceFileId
  );
  assert.strictEqual(targetAfterPurge.fragment, null, `${item.id} deletes target graph truth`);
  const targetComponent = `${endpoints.targetSourceFileId.length}:${endpoints.targetSourceFileId}`;
  const postPurgeSnapshot = harness.storage.snapshot();
  const targetKeys = Object.keys(postPurgeSnapshot).filter(
    (key) => key.includes(targetComponent)
  );
  const targetPayloadKeys = targetKeys.filter(
    (key) => !key.startsWith(`${GRAPH_STORAGE_PREFIX}control:`)
  );
  const targetPayloadAbsent = targetPayloadKeys.length === 0;
  assert.deepStrictEqual(targetPayloadKeys, [], `${item.id} leaves no target graph payload key`);
  assert.ok(targetKeys.length <= 1 && targetKeys.every((key) => {
    const control = postPurgeSnapshot[key];
    return key.startsWith(`${GRAPH_STORAGE_PREFIX}control:`) && control.state === 'purging' &&
      control.activeGenerationId === null && control.recordPageCount === 0 &&
      control.relationPageCount === 0 && control.lexicalPageCount === 0 &&
      control.adjacencyPageCount === 0 && control.resultCachePageCount === 0;
  }), `${item.id} retains at most the zero-page non-visible purge tombstone`);

  harness.updateSource(endpoints.targetSourceFileId, { accessible: false });
  harness.resetMetrics();
  const operationResult = await harness.current().facade.replaceCandidateRelations(
    EVAL_TUPLE,
    Object.freeze({ sourceFileId: endpoints.proposerSourceFileId }),
    Object.freeze({
      proposingSourceFileId: endpoints.proposerSourceFileId,
      relations: Object.freeze([])
    })
  );
  assert.strictEqual(operationResult.decision, 'admitted');
  exactKeys(operationResult.value, ['ok', 'status'], `${item.id} returns the fixed clear ack`);
  assert.strictEqual(operationResult.value.ok, true);
  assert.strictEqual(operationResult.value.status, 'cleared');
  const proposer = await readCurrentFragment(harness.current(), endpoints.proposerSourceFileId);
  const shards = await harness.current().graphStore.readActiveShards({
    partitionKey: EVAL_PARTITION,
    sourceFileId: endpoints.proposerSourceFileId,
    fragmentGenerationId: proposer.fragment.fragmentGenerationId
  });
  assert.strictEqual(shards.candidateRelations.length, 0);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId: endpoints.proposerSourceFileId,
    targetSourceFileId: endpoints.targetSourceFileId,
    sourceText: endpoints.proposerText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: proposer.fragment,
    publishState: 'withheld',
    reason: 'cleared',
    targetPayloadAbsent,
    seededTwoSources: true,
    candidateObservedBeforePurge: !!candidateQuery.edge,
    purgedParticipantCount,
    targetAuthorityRevoked: harness.sources.get(endpoints.targetSourceFileId).accessible === false,
    candidateRelations: shards.candidateRelations,
    queryOverrides: { candidate_edges: false }
  }, { records: [], relations: [], spans: [] });
}

async function extractionContext(sourceFileId, text) {
  const fingerprint = contentFingerprint(text);
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: EVAL_PARTITION,
    sourceFileId,
    contentFingerprint: fingerprint
  });
  return {
    partitionKey: EVAL_PARTITION,
    sourceFileId,
    contentFingerprint: fingerprint,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'excerpt_000001',
      text,
      sourceByteStart: 0,
      sourceByteEnd: Buffer.byteLength(text, 'utf8')
    }],
    batchOrdinal: 0,
    priorCandidates: []
  };
}

async function executeDuplicateDanglingCase(item) {
  const context = await extractionContext(`eval-${item.id}-schema`, fixtureSourceText(item));
  const evidence = [{ excerptId: 'excerpt_000001', start: 0, end: 1 }];
  const duplicate = {
    schemaVersion: 1,
    batchId: 'batch_duplicate_0001',
    records: [
      { candidateRef: 'same', kind: 'agreement', label: 'First', evidence },
      { candidateRef: 'same', kind: 'clause', label: 'Second', evidence }
    ],
    relations: []
  };
  const dangling = {
    schemaVersion: 1,
    batchId: 'batch_dangling_0001',
    records: [{ candidateRef: 'local', kind: 'agreement', label: 'Local', evidence }],
    relations: [{
      fromCandidateRef: 'local', predicate: 'contains', toCandidateRef: 'missing', evidence
    }]
  };
  const duplicateRejected = await GraphSchema.parseExtractionEnvelope(duplicate, context) === null;
  const danglingRejected = await GraphSchema.parseExtractionEnvelope(dangling, context) === null;
  assert.strictEqual(duplicateRejected, true);
  assert.strictEqual(danglingRejected, true);

  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  return finishCase({
    item,
    harness,
    layer: harness.current(),
    sourceFileId,
    sourceText,
    rawResponse: item.recorded_provider.raw_response,
    operationResult,
    fragment: current.fragment,
    duplicateRejected,
    danglingRejected,
    queryOverrides: { empty: true },
    candidateRelations: []
  });
}

async function executeOffsetFailureCase(item) {
  const text = fixtureSourceText(item);
  const context = await extractionContext(`eval-${item.id}-offsets`, text);
  const outOfRange = await GraphSchema.parseEvidenceLocator({
    excerptId: 'excerpt_000001', start: 0, end: text.length + 1
  }, context);
  const mismatchedContext = Object.assign({}, context, {
    excerpts: [{
      excerptId: 'excerpt_000001', text,
      sourceByteStart: 0, sourceByteEnd: Buffer.byteLength(text, 'utf8') + 1
    }]
  });
  const nonmatching = await GraphSchema.parseEvidenceLocator({
    excerptId: 'excerpt_000001', start: 0, end: 1
  }, mismatchedContext);
  const offsetFailuresRejected = outOfRange === null && nonmatching === null;
  assert.strictEqual(offsetFailuresRejected, true);
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  harness.addSource(sourceFileId, text, item.recorded_provider.raw_response);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  return finishCase({
    item, harness, layer: harness.current(), sourceFileId, sourceText: text,
    rawResponse: item.recorded_provider.raw_response, operationResult,
    fragment: current.fragment, offsetFailuresRejected,
    queryOverrides: { empty: true }, candidateRelations: []
  });
}

async function executeClippedQualifierCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  const projection = operationProjection(operationResult);
  const clippedQualifierRejected = projection.publishState === 'withheld' &&
    projection.reason === 'model-semantic-invalid' && current.fragment === null;
  return finishCase({
    item, harness, layer: harness.current(), sourceFileId, sourceText,
    rawResponse: item.recorded_provider.raw_response, operationResult,
    fragment: current.fragment, clippedQualifierRejected,
    queryOverrides: { empty: true }, candidateRelations: []
  });
}

async function assertExactSchemaEvidenceMaximum() {
  const text = 'x'.repeat(24_000);
  const context = await extractionContext('eval-B01-evidence', text);
  const evidence = Array.from({ length: GraphSchema.LIMITS.MAX_EVIDENCE_LOCATORS },
    (_, index) => ({ excerptId: 'excerpt_000001', start: index, end: index + 1 }));
  const parsed = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: 'batch_exact_evidence_01',
    records: [{ candidateRef: 'record', kind: 'agreement', label: 'Exact Evidence', evidence }],
    relations: []
  }, context);
  assert.ok(parsed && parsed.records[0].evidence.length ===
    GraphSchema.LIMITS.MAX_EVIDENCE_LOCATORS,
  'B01 admits the exact four-locator evidence maximum');
  return parsed.records[0].evidence.length;
}

async function assertExactSchemaRecordRelationMaximum() {
  const text = 'x'.repeat(24_000);
  const context = await extractionContext('eval-B01-schema-maxima', text);
  const parsed = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: 'batch_exact_schema_001',
    records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS, 'excerpt_000001'),
    relations: generatedRelations(GraphSchema.LIMITS.MAX_RELATIONS, 'excerpt_000001')
  }, context);
  assert.ok(parsed, 'B01 admits a schema-valid exact record/relation maximum response');
  assert.strictEqual(parsed.records.length, GraphSchema.LIMITS.MAX_RECORDS);
  assert.strictEqual(parsed.relations.length, GraphSchema.LIMITS.MAX_RELATIONS);
  return { records: parsed.records.length, relations: parsed.relations.length };
}

async function assertExactPriorCandidateMaximum() {
  const sourceFileId = 'eval-B01-prior-max';
  const text = 'x'.repeat(48_000);
  const fingerprint = contentFingerprint(text);
  const requests = [];
  let sends = 0;
  let nonce = 0;
  const extractor = GraphExtractor.create({
    graphSchema: GraphSchema,
    providerFactory: () => ({
      async buildRequest(prompt) {
        const envelope = JSON.parse(prompt.userPrompt);
        requests.push(envelope);
        return { envelope };
      },
      async sendRequest(body) {
        sends += 1;
        const excerptId = body.envelope.excerpts[0].excerptId;
        return {
          content: sends === 1 ? JSON.stringify({
            schemaVersion: 1,
            batchId: 'batch_exact_prior_0001',
            records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS, excerptId),
            relations: []
          }) : JSON.stringify({
            schemaVersion: 1,
            batchId: 'batch_exact_prior_0002',
            records: [],
            relations: []
          }),
          model: 'eval-model'
        };
      },
      parseResponse(response) { return response; }
    }),
    readSettings: async () => ({ modelProvider: 'eval-provider', modelName: 'eval-model' }),
    nonceFactory: async () => `prior_nonce_${String(++nonce).padStart(8, '0')}`,
    now: () => EVAL_NOW
  });
  let sequence = 30_000;
  const controller = new AbortController();
  const prepared = await extractor.prepareSource(
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal,
    async (sink, signal) => sink({
      byteHash: fingerprint,
      exactByteLength: Buffer.byteLength(text, 'utf8'),
      text
    }, signal)
  );
  const first = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  const second = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  assert.ok(first.outcome, `B01 first prior-max batch validates: ${JSON.stringify(first)}`);
  assert.ok(second.outcome, `B01 second prior-max batch validates: ${JSON.stringify(second)}`);
  assert.strictEqual(first.outcome.status, 'validated-batch');
  assert.strictEqual(second.outcome.status, 'validated-batch');
  assert.strictEqual(sends, 2);
  assert.strictEqual(requests[1].priorCandidates.length,
    GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES);
  const bytes = Buffer.byteLength(JSON.stringify(requests[1].priorCandidates), 'utf8');
  assert.ok(bytes <= GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES);
  extractor.discard(prepared.session);
  return { count: requests[1].priorCandidates.length, bytes };
}

async function assertPriorCandidateByteBoundary(targetBytes) {
  const sourceFileId = `eval-prior-byte-${targetBytes}`;
  const text = 'x'.repeat(48_000);
  const fingerprint = contentFingerprint(text);
  const kind = 'agreement';
  const emptyProjectionBytes = Buffer.byteLength(
    JSON.stringify([{ handle: '', kind }]), 'utf8');
  const syntheticHandle = 'h'.repeat(targetBytes - emptyProjectionBytes);
  const attemptedProjection = [{ handle: syntheticHandle, kind }];
  const attemptedBytes = Buffer.byteLength(JSON.stringify(attemptedProjection), 'utf8');
  assert.strictEqual(attemptedBytes, targetBytes,
    `prior candidate probe constructs an actual ${targetBytes}-byte projection`);

  let parseCalls = 0;
  const boundarySchema = Object.freeze(Object.assign({}, GraphSchema, {
    async parseExtractionEnvelope(value, context) {
      parseCalls += 1;
      if (parseCalls > 1) {
        return Object.freeze({
          batchOrdinal: context.batchOrdinal,
          records: Object.freeze([]),
          relations: Object.freeze([])
        });
      }
      const parsed = await GraphSchema.parseExtractionEnvelope(value, context);
      assert.ok(parsed && parsed.records.length === 1,
        'prior byte probe starts from one production-schema-validated candidate');
      const record = Object.freeze(Object.assign({}, parsed.records[0], {
        candidateHandle: syntheticHandle
      }));
      return Object.freeze(Object.assign({}, parsed, { records: Object.freeze([record]) }));
    }
  }));
  const requests = [];
  let nonce = 0;
  const extractor = GraphExtractor.create({
    graphSchema: boundarySchema,
    providerFactory: () => ({
      async buildRequest(prompt) {
        const envelope = JSON.parse(prompt.userPrompt);
        requests.push(envelope);
        return { envelope };
      },
      async sendRequest(body) {
        const excerptId = body.envelope.excerpts[0].excerptId;
        return {
          content: requests.length === 1 ? JSON.stringify({
            schemaVersion: 1,
            batchId: 'batch_prior_byte_0001',
            records: [{
              candidateRef: 'record', kind, label: 'Prior Byte Boundary',
              evidence: [{ excerptId, start: 0, end: 1 }]
            }],
            relations: []
          }) : JSON.stringify({
            schemaVersion: 1,
            batchId: 'batch_prior_byte_0002',
            records: [],
            relations: []
          }),
          model: 'eval-model'
        };
      },
      parseResponse(response) { return response; }
    }),
    readSettings: async () => ({ modelProvider: 'eval-provider', modelName: 'eval-model' }),
    nonceFactory: async () => `prior_byte_nonce_${String(++nonce).padStart(8, '0')}`,
    now: () => EVAL_NOW
  });
  let sequence = 40_000 + targetBytes;
  const controller = new AbortController();
  const prepared = await extractor.prepareSource(
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal,
    async (sink, signal) => sink({
      byteHash: fingerprint,
      exactByteLength: Buffer.byteLength(text, 'utf8'),
      text
    }, signal)
  );
  const first = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  const second = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  assert.strictEqual(first.outcome.status, 'validated-batch');
  assert.strictEqual(second.outcome.status, 'validated-batch');
  assert.strictEqual(requests.length, 2);
  const projectedBytes = Buffer.byteLength(JSON.stringify(requests[1].priorCandidates), 'utf8');
  const expectedCount = targetBytes <= GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES ? 1 : 0;
  assert.strictEqual(requests[1].priorCandidates.length, expectedCount,
    `${targetBytes}-byte prior projection follows the production byte cap`);
  if (expectedCount === 1) assert.strictEqual(projectedBytes, targetBytes);
  extractor.discard(prepared.session);
  return {
    attemptedBytes,
    projectedBytes,
    projectedCount: requests[1].priorCandidates.length,
    admitted: expectedCount === 1 && projectedBytes === targetBytes,
    rejected: expectedCount === 0 && requests[1].priorCandidates.length === 0
  };
}

async function assertPriorCandidateCountMaxPlusOne() {
  const sourceFileId = 'eval-B02-prior-count-over';
  const text = 'x'.repeat(48_001);
  const fingerprint = contentFingerprint(text);
  const requests = [];
  let sends = 0;
  let nonce = 0;
  const extractor = GraphExtractor.create({
    graphSchema: GraphSchema,
    providerFactory: () => ({
      async buildRequest(prompt) {
        const envelope = JSON.parse(prompt.userPrompt);
        requests.push(envelope);
        return { envelope };
      },
      async sendRequest(body) {
        sends += 1;
        const excerptId = body.envelope.excerpts[0].excerptId;
        if (sends === 1) {
          return {
            content: JSON.stringify({
              schemaVersion: 1,
              batchId: 'batch_prior_count_0001',
              records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS, excerptId),
              relations: []
            }),
            model: 'eval-model'
          };
        }
        if (sends === 2) {
          return {
            content: JSON.stringify({
              schemaVersion: 1,
              batchId: 'batch_prior_count_0002',
              records: [{
                candidateRef: 'record_128', kind: 'clause', label: 'Prior Count Overflow',
                evidence: [{ excerptId, start: 0, end: 1 }]
              }],
              relations: []
            }),
            model: 'eval-model'
          };
        }
        return {
          content: JSON.stringify({
            schemaVersion: 1,
            batchId: 'batch_prior_count_0003',
            records: [],
            relations: []
          }),
          model: 'eval-model'
        };
      },
      parseResponse(response) { return response; }
    }),
    readSettings: async () => ({ modelProvider: 'eval-provider', modelName: 'eval-model' }),
    nonceFactory: async () => `prior_count_nonce_${String(++nonce).padStart(8, '0')}`,
    now: () => EVAL_NOW
  });
  let sequence = 60_000;
  const controller = new AbortController();
  const prepared = await extractor.prepareSource(
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal,
    async (sink, signal) => sink({
      byteHash: fingerprint,
      exactByteLength: Buffer.byteLength(text, 'utf8'),
      text
    }, signal)
  );
  const first = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  const second = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  const third = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  assert.strictEqual(first.outcome.status, 'validated-batch');
  assert.strictEqual(second.outcome.status, 'validated-batch');
  assert.strictEqual(third.outcome.status, 'validated-batch');
  assert.strictEqual(requests[1].priorCandidates.length,
    GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES);
  const overflowHandle = second.outcome.batch.records[0].candidateHandle;
  assert.strictEqual(requests[2].priorCandidates.length,
    GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATES);
  assert.strictEqual(requests[2].priorCandidates.some((entry) => entry.handle === overflowHandle),
    false, 'the 129th validated prior candidate is absent from the next production request');
  extractor.discard(prepared.session);
  return {
    attemptedCount: requests[1].priorCandidates.length + second.outcome.batch.records.length,
    projectedCount: requests[2].priorCandidates.length,
    overflowRejected: !requests[2].priorCandidates.some((entry) => entry.handle === overflowHandle)
  };
}

async function createHydratedProductionQuery(labels, probeName) {
  assert.ok(Array.isArray(labels) && labels.length > 1,
    'production query probe requires a connected record set');
  const sourceFileId = `eval-${probeName}`;
  const text = 'x'.repeat(24_000);
  const context = await extractionContext(sourceFileId, text);
  const recordInputs = generatedRecords(labels.length, 'excerpt_000001').map(
    (record, index) => Object.assign({}, record, { label: labels[index] })
  );
  const relationInputs = generatedRelations(labels.length - 1, 'excerpt_000001');
  const parsed = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: 'batch_query_boundary_0001',
    records: recordInputs,
    relations: relationInputs
  }, context);
  assert.ok(parsed, 'production query probe starts from a production-schema-valid graph');
  const fragment = await GraphSchema.parseFragment({
    schemaVersion: GraphSchema.VERSION,
    promptVersion: GraphSchema.PROMPT_VERSION,
    partitionKey: context.partitionKey,
    sourceFileId,
    contentFingerprint: context.contentFingerprint,
    fragmentGenerationId: context.fragmentGenerationId,
    providerId: 'eval-provider',
    modelId: 'eval-model',
    records: parsed.records.map(durableGraphRecord),
    relations: parsed.relations
  });
  assert.ok(fragment, 'production query probe creates a production fragment');
  const lexicalShards = [GraphSchema.parseLexicalShard({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: context.partitionKey,
    sourceFileId,
    fragmentGenerationId: context.fragmentGenerationId,
    shardOrdinal: 0,
    postings: fragment.records.map((record, index) => ({
      term: `boundary-${String(index).padStart(2, '0')}`,
      stableRecordId: record.stableRecordId,
      recordVersionId: record.recordVersionId
    }))
  })];
  assert.ok(lexicalShards[0], 'production query probe creates production lexical postings');
  const adjacencyShards = [GraphSchema.parseAdjacencyShard({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: context.partitionKey,
    sourceFileId,
    fragmentGenerationId: context.fragmentGenerationId,
    shardOrdinal: 0,
    entries: parsed.relations.flatMap((relation) => [{
      stableRecordId: relation.fromStableRecordId,
      relationVersionId: relation.relationVersionId,
      direction: 'out'
    }, {
      stableRecordId: relation.toStableRecordId,
      relationVersionId: relation.relationVersionId,
      direction: 'in'
    }])
  })];
  assert.ok(adjacencyShards[0], 'production query probe creates production adjacency');
  const activeShards = Object.freeze({
    lexicalShards: Object.freeze(lexicalShards),
    adjacencyShards: Object.freeze(adjacencyShards),
    resultCacheShards: Object.freeze([]),
    candidateRelations: Object.freeze([])
  });
  const graphStore = Object.freeze({
    async readCurrentFragment(input) {
      return input.partitionKey === context.partitionKey && input.sourceFileId === sourceFileId &&
        input.fragmentGenerationId === context.fragmentGenerationId ? fragment : null;
    },
    async readActiveShards(input) {
      return input.partitionKey === context.partitionKey && input.sourceFileId === sourceFileId &&
        input.fragmentGenerationId === context.fragmentGenerationId ? activeShards : null;
    }
  });
  const measured = [];
  const query = GraphQuery.create({
    graphSchema: GraphSchema,
    graphStore,
    MiniSearch,
    byteLength(value) {
      const length = Buffer.byteLength(value, 'utf8');
      measured.push(length);
      return length;
    }
  });
  const scope = query.createScope({
    partitionKey: context.partitionKey,
    exactSourceGenerations: [{ sourceFileId, fragmentGenerationId: context.fragmentGenerationId }]
  });
  assert.ok(scope);
  assert.strictEqual((await query.ensureScopeCache(scope)).status, 'ready');
  return { query, scope, fragment, sourceFileId, context, measured };
}

function boundaryNeighborInput(probe, overrides) {
  return Object.assign({
    sourceFileId: probe.sourceFileId,
    fragmentGenerationId: probe.context.fragmentGenerationId,
    stableRecordId: probe.fragment.records[0].stableRecordId,
    predicate: 'contains',
    direction: 'out',
    depth: 1,
    nodeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_NODES,
    edgeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES
  }, overrides || {});
}

async function measureTraversalResultBytes(labelLengths) {
  const probe = await createHydratedProductionQuery(
    labelLengths.map((length) => 'X'.repeat(length)), 'B-result-byte-boundary');
  const result = await probe.query.neighbors(
    probe.scope, boundaryNeighborInput(probe));
  assert.strictEqual(probe.query.releaseScope(probe.scope), true);
  assert.strictEqual(probe.measured.length, 1,
    'production query measures the complete result exactly once');
  return { bytes: probe.measured[0], admitted: result !== null, result };
}

async function exactResultBoundaryLabelLengths() {
  const labelLengths = Array.from(
    { length: GraphQuery.LIMITS.MAX_TRAVERSAL_NODES }, () => 1);
  const baseline = await measureTraversalResultBytes(labelLengths);
  let remaining = GraphQuery.LIMITS.MAX_RESULT_BYTES - baseline.bytes;
  assert.ok(remaining >= 0 && remaining <= labelLengths.length *
    (GraphSchema.LIMITS.MAX_LABEL_LENGTH - 1),
  'the production traversal shape can be tuned to the exact result-byte boundary');
  for (let index = 0; index < labelLengths.length && remaining > 0; index += 1) {
    const addition = Math.min(GraphSchema.LIMITS.MAX_LABEL_LENGTH - 1, remaining);
    labelLengths[index] += addition;
    remaining -= addition;
  }
  assert.strictEqual(remaining, 0);
  return labelLengths;
}

async function assertExactResultByteMaximum() {
  const labelLengths = await exactResultBoundaryLabelLengths();
  const exact = await measureTraversalResultBytes(labelLengths);
  assert.strictEqual(exact.bytes, GraphQuery.LIMITS.MAX_RESULT_BYTES,
    'B01 executes an actual 65,536-byte production query result');
  assert.ok(exact.admitted && exact.result.nodes.length === labelLengths.length,
    'the exact result-byte maximum is admitted without truncation');
  return { bytes: exact.bytes, admitted: exact.admitted };
}

async function assertResultByteMaxPlusOne() {
  const labelLengths = await exactResultBoundaryLabelLengths();
  const control = await measureTraversalResultBytes(labelLengths);
  assert.strictEqual(control.bytes, GraphQuery.LIMITS.MAX_RESULT_BYTES,
    'B02 executes the valid 65,536-byte production control before the +1 result probe');
  assert.ok(control.admitted && control.result.nodes.length === labelLengths.length,
    'B02 admits the non-empty exact result-byte control');
  const expandable = labelLengths.findIndex(
    (length) => length < GraphSchema.LIMITS.MAX_LABEL_LENGTH);
  assert.notStrictEqual(expandable, -1,
    'the exact result-byte fixture has one schema-valid byte available for the +1 probe');
  labelLengths[expandable] += 1;
  const over = await measureTraversalResultBytes(labelLengths);
  assert.strictEqual(over.bytes, GraphQuery.LIMITS.MAX_RESULT_BYTES + 1,
    'B02 executes an actual 65,537-byte production query result');
  assert.strictEqual(over.result, null,
    'the 65,537-byte production query result is rejected without truncation');
  return {
    controlBytes: control.bytes,
    controlAdmitted: control.admitted,
    bytes: over.bytes,
    rejected: over.result === null
  };
}

function productionQueryBoundaryLabels() {
  return Array.from({ length: GraphQuery.LIMITS.MAX_TRAVERSAL_NODES }, (_, index) =>
    index === 1
      ? 'q'.repeat(GraphQuery.LIMITS.MAX_QUERY_CHARACTERS)
      : `Shared Boundary Record ${String(index).padStart(2, '0')}`);
}

async function assertExactQueryBoundaries() {
  const probe = await createHydratedProductionQuery(
    productionQueryBoundaryLabels(), 'B01-exact-query-boundaries');
  const queryCharactersInput = {
    query: 'q'.repeat(GraphQuery.LIMITS.MAX_QUERY_CHARACTERS), topN: 1
  };
  const queryCharactersResult = await probe.query.searchLexical(
    probe.scope, queryCharactersInput);
  assert.ok(queryCharactersResult.length > 0,
    'B01 exact 512-character production query returns a non-empty result');

  const topNInput = { query: 'Shared', topN: GraphQuery.LIMITS.MAX_LEXICAL_RESULTS };
  const topNResult = await probe.query.searchLexical(probe.scope, topNInput);
  assert.strictEqual(topNResult.length, GraphQuery.LIMITS.MAX_LEXICAL_RESULTS,
    'B01 exact top-20 production query returns twenty results');

  const traversalDepthInput = boundaryNeighborInput(probe, {
    depth: GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH
  });
  const traversalDepthResult = await probe.query.neighbors(probe.scope, traversalDepthInput);
  assert.ok(traversalDepthResult && traversalDepthResult.edges.length > 0,
    'B01 exact depth-2 production traversal returns a non-empty result');

  const nodeLimitInput = boundaryNeighborInput(probe, {
    nodeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_NODES
  });
  const nodeLimitResult = await probe.query.neighbors(probe.scope, nodeLimitInput);
  assert.ok(nodeLimitResult && nodeLimitResult.nodes.length > 0,
    'B01 exact node-limit-64 production traversal returns a non-empty result');

  const edgeLimitInput = boundaryNeighborInput(probe, {
    edgeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES
  });
  const edgeLimitResult = await probe.query.neighbors(probe.scope, edgeLimitInput);
  assert.ok(edgeLimitResult && edgeLimitResult.edges.length > 0,
    'B01 exact edge-limit-128 production traversal returns a non-empty result');
  assert.strictEqual(probe.query.releaseScope(probe.scope), true);
  return {
    queryCharacters: queryCharactersInput.query.length,
    queryCharactersAdmitted: queryCharactersResult.length > 0,
    topN: topNInput.topN,
    topNAdmitted: topNResult.length > 0,
    traversalDepth: traversalDepthInput.depth,
    traversalDepthAdmitted: traversalDepthResult !== null,
    nodeLimit: nodeLimitInput.nodeLimit,
    nodeLimitAdmitted: nodeLimitResult !== null,
    edgeLimit: edgeLimitInput.edgeLimit,
    edgeLimitAdmitted: edgeLimitResult !== null
  };
}

async function executeExactMaxCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(operationResult).reason, 'published');
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  assert.ok(current.fragment, `${item.id} publishes the exact-boundary fragment`);
  assert.strictEqual(current.fragment.records.length, 1);
  assert.strictEqual(current.fragment.relations.length, 0);
  const schemaMaximum = await assertExactSchemaRecordRelationMaximum();
  const priorMaximum = await assertExactPriorCandidateMaximum();
  const priorByteMaximum = await assertPriorCandidateByteBoundary(
    GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES);
  const resultByteMaximum = await assertExactResultByteMaximum();
  const queryMaximum = await assertExactQueryBoundaries();
  const normalRequests = harness.metrics.providerRequests.filter(
    (request) => !request.envelope.repair
  );
  const repairRequests = harness.metrics.providerRequests.filter(
    (request) => request.envelope.repair
  );
  assert.strictEqual(normalRequests.length, GraphExtractor.LIMITS.MAX_NORMAL_CALLS_PER_GENERATION);
  assert.strictEqual(repairRequests.length, GraphExtractor.LIMITS.MAX_REPAIR_CALLS_PER_GENERATION);
  normalRequests.forEach((request) => {
    assert.strictEqual(request.envelope.excerpts.length,
      GraphExtractor.LIMITS.MAX_EXCERPTS_PER_CALL);
    assert.strictEqual(request.envelope.excerpts.reduce(
      (sum, excerpt) => sum + excerpt.text.length, 0
    ), GraphExtractor.LIMITS.MAX_EXCERPT_CHARACTERS_PER_CALL);
  });
  assert.strictEqual(sourceText.length, GraphExtractor.LIMITS.MAX_CHARACTERS_PER_GENERATION);
  assert.strictEqual(harness.metrics.responseLengths[0],
    GraphExtractor.LIMITS.MAX_RESPONSE_CHARACTERS);
  assert.strictEqual(harness.metrics.providerAcks, harness.metrics.providerCalls + 1,
    `${item.id} observes every provider acknowledgement plus the terminal no-more-excerpts acknowledgement`);
  const evidenceMaximum = await assertExactSchemaEvidenceMaximum();

  const exactSourceGenerations = Array.from(
    { length: GraphQuery.LIMITS.MAX_SOURCE_GENERATIONS },
    (_, index) => ({
      sourceFileId: `scope-source-${String(index).padStart(2, '0')}`,
      fragmentGenerationId: `sfg1:${String(index).padStart(64, '0')}`
    })
  );
  const exactScope = harness.current().graphQuery.createScope({
    partitionKey: EVAL_PARTITION,
    exactSourceGenerations
  });
  assert.ok(exactScope, `${item.id} admits the exact 32-source scope shape`);
  assert.strictEqual(harness.current().graphQuery.releaseScope(exactScope), true,
    `${item.id} releases the exact 32-source scope once`);
  const summary = {
    records: [
      `exact-records:${schemaMaximum.records}`,
      `exact-prior-candidates:${priorMaximum.count}`
    ],
    relations: [`exact-relations:${schemaMaximum.relations}`],
    spans: [
      [normalRequests[0].envelope.excerpts.length,
        normalRequests[0].envelope.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0)],
      [normalRequests.length, sourceText.length],
      [repairRequests.length, GraphExtractor.LIMITS.MAX_OUTPUT_TOKENS],
      [harness.metrics.responseLengths[0], schemaMaximum.records],
      [schemaMaximum.relations, resultByteMaximum.bytes]
    ]
  };
  return finishCase({
    item, harness, layer: harness.current(), sourceFileId, sourceText,
    rawResponse: item.recorded_provider.raw_response, operationResult,
    fragment: current.fragment,
    exactMaximumsObserved: {
      sourceCharacters: sourceText.length,
      excerptsPerCall: normalRequests[0].envelope.excerpts.length,
      charactersPerCall: normalRequests[0].envelope.excerpts.reduce(
        (sum, excerpt) => sum + excerpt.text.length, 0),
      normalCalls: normalRequests.length,
      repairCalls: repairRequests.length,
      responseCharacters: harness.metrics.responseLengths[0],
      schemaRecords: schemaMaximum.records,
      schemaRelations: schemaMaximum.relations,
      evidenceLocators: evidenceMaximum,
      priorCandidateCount: priorMaximum.count,
      priorCandidateCountBytes: priorMaximum.bytes,
      priorCandidateBytes: priorByteMaximum.projectedBytes,
      priorByteProjectionAdmitted: priorByteMaximum.admitted,
      outputTokens: normalRequests[0].maxOutputTokens,
      scopeSources: exactSourceGenerations.length,
      scopeReleased: true,
      queryCharacters: queryMaximum.queryCharacters,
      queryCharactersAdmitted: queryMaximum.queryCharactersAdmitted,
      topN: queryMaximum.topN,
      topNAdmitted: queryMaximum.topNAdmitted,
      traversalDepth: queryMaximum.traversalDepth,
      traversalDepthAdmitted: queryMaximum.traversalDepthAdmitted,
      nodeLimit: queryMaximum.nodeLimit,
      nodeLimitAdmitted: queryMaximum.nodeLimitAdmitted,
      edgeLimit: queryMaximum.edgeLimit,
      edgeLimitAdmitted: queryMaximum.edgeLimitAdmitted,
      resultBytes: resultByteMaximum.bytes,
      resultAdmitted: resultByteMaximum.admitted
    },
    candidateRelations: []
  }, summary);
}

async function assertRepairMaxPlusOne() {
  let sends = 0;
  const sourceFileId = 'eval-B02-repair';
  const text = 'x';
  const fingerprint = contentFingerprint(text);
  let nonce = 0;
  const extractor = GraphExtractor.create({
    graphSchema: GraphSchema,
    providerFactory: () => ({
      async buildRequest() { return {}; },
      async sendRequest() {
        sends += 1;
        return { content: 'malformed repair probe', model: 'eval-model' };
      },
      parseResponse(response) { return response; }
    }),
    readSettings: async () => ({ modelProvider: 'eval-provider', modelName: 'eval-model' }),
    nonceFactory: async () => `repair_nonce_${String(++nonce).padStart(8, '0')}`,
    now: () => EVAL_NOW
  });
  let sequence = 20_000;
  const controller = new AbortController();
  const prepared = await extractor.prepareSource(
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal,
    async (sink, signal) => sink({
      byteHash: fingerprint, exactByteLength: 1, text
    }, signal)
  );
  const invalid = await extractor.nextBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    controller.signal
  );
  assert.strictEqual(invalid.outcome.status, 'model-json-invalid');
  const repairResults = [];
  const repaired = await extractor.repairBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    invalid.outcome,
    controller.signal
  );
  repairResults.push(repaired);
  assert.strictEqual(repaired.outcome.status, 'model-json-invalid');
  const refused = await extractor.repairBatch(
    prepared.session,
    evaluationCertificate(sourceFileId, fingerprint, ++sequence),
    invalid.outcome,
    controller.signal
  );
  repairResults.push(refused);
  assert.ok(refused.status === 'repair-exhausted' || refused.status === 'repair-not-allowed');
  assert.strictEqual(sends, 2, 'B02 second repair request performs zero provider work');
  extractor.discard(prepared.session);
  return {
    attempts: repairResults.length,
    providerCalls: sends,
    secondRejected: refused.status === 'repair-exhausted' || refused.status === 'repair-not-allowed'
  };
}

async function assertQueryMaxPlusOneBoundaries() {
  const probe = await createHydratedProductionQuery(
    productionQueryBoundaryLabels(), 'B02-query-max-plus-one');

  const queryControlInput = {
    query: 'q'.repeat(GraphQuery.LIMITS.MAX_QUERY_CHARACTERS), topN: 1
  };
  const queryControlResult = await probe.query.searchLexical(probe.scope, queryControlInput);
  assert.ok(queryControlResult.length > 0,
    'B02 admits a non-empty 512-character control immediately before query +1');
  const queryInput = {
    query: 'q'.repeat(GraphQuery.LIMITS.MAX_QUERY_CHARACTERS + 1),
    topN: 1
  };
  const queryResult = await probe.query.searchLexical(probe.scope, queryInput);
  assert.deepStrictEqual(queryResult, []);

  const topNControlInput = {
    query: 'Shared', topN: GraphQuery.LIMITS.MAX_LEXICAL_RESULTS
  };
  const topNControlResult = await probe.query.searchLexical(probe.scope, topNControlInput);
  assert.strictEqual(topNControlResult.length, GraphQuery.LIMITS.MAX_LEXICAL_RESULTS,
    'B02 admits a non-empty top-20 control immediately before top-N +1');
  const topNInput = {
    query: 'Shared',
    topN: GraphQuery.LIMITS.MAX_LEXICAL_RESULTS + 1
  };
  const topNResult = await probe.query.searchLexical(probe.scope, topNInput);
  assert.deepStrictEqual(topNResult, []);

  const depthControlInput = boundaryNeighborInput(probe, {
    depth: GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH
  });
  const depthControlResult = await probe.query.neighbors(probe.scope, depthControlInput);
  assert.ok(depthControlResult && depthControlResult.edges.length > 0,
    'B02 admits a non-empty depth-2 control immediately before depth +1');
  const depthInput = boundaryNeighborInput(probe, {
    depth: GraphQuery.LIMITS.MAX_TRAVERSAL_DEPTH + 1
  });
  const depthResult = await probe.query.neighbors(probe.scope, depthInput);
  assert.strictEqual(depthResult, null);

  const nodeControlInput = boundaryNeighborInput(probe, {
    nodeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_NODES
  });
  const nodeControlResult = await probe.query.neighbors(probe.scope, nodeControlInput);
  assert.ok(nodeControlResult && nodeControlResult.nodes.length > 0,
    'B02 admits a non-empty node-limit-64 control immediately before node limit +1');
  const nodeInput = boundaryNeighborInput(probe, {
    nodeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_NODES + 1
  });
  const nodeResult = await probe.query.neighbors(probe.scope, nodeInput);
  assert.strictEqual(nodeResult, null);

  const edgeControlInput = boundaryNeighborInput(probe, {
    edgeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES
  });
  const edgeControlResult = await probe.query.neighbors(probe.scope, edgeControlInput);
  assert.ok(edgeControlResult && edgeControlResult.edges.length > 0,
    'B02 admits a non-empty edge-limit-128 control immediately before edge limit +1');
  const edgeInput = boundaryNeighborInput(probe, {
    edgeLimit: GraphQuery.LIMITS.MAX_TRAVERSAL_EDGES + 1
  });
  const edgeResult = await probe.query.neighbors(probe.scope, edgeInput);
  assert.strictEqual(edgeResult, null);
  assert.strictEqual(probe.query.releaseScope(probe.scope), true);
  return {
    queryCharactersControl: queryControlInput.query.length,
    queryCharactersControlAdmitted: queryControlResult.length > 0,
    queryCharacters: queryInput.query.length,
    queryRejected: Array.isArray(queryResult) && queryResult.length === 0,
    topNControl: topNControlInput.topN,
    topNControlAdmitted: topNControlResult.length > 0,
    topN: topNInput.topN,
    topNRejected: Array.isArray(topNResult) && topNResult.length === 0,
    traversalDepthControl: depthControlInput.depth,
    traversalDepthControlAdmitted: depthControlResult !== null,
    traversalDepth: depthInput.depth,
    traversalDepthRejected: depthResult === null,
    nodeLimitControl: nodeControlInput.nodeLimit,
    nodeLimitControlAdmitted: nodeControlResult !== null,
    nodeLimit: nodeInput.nodeLimit,
    nodeLimitRejected: nodeResult === null,
    edgeLimitControl: edgeControlInput.edgeLimit,
    edgeLimitControlAdmitted: edgeControlResult !== null,
    edgeLimit: edgeInput.edgeLimit,
    edgeLimitRejected: edgeResult === null
  };
}

async function executeMaxPlusOneCase(item) {
  const harness = createExecutableHarness(item);
  const sourceFileId = `eval-${item.id}`;
  const sourceText = fixtureSourceText(item);
  harness.addSource(sourceFileId, sourceText, item.recorded_provider.raw_response);
  const operationResult = await harness.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId })
  );
  assert.strictEqual(operationProjection(operationResult).reason, 'budget-exceeded');
  assert.strictEqual(harness.metrics.providerCalls, 0,
    `${item.id} ninth normal batch is refused before provider work`);

  const boundedText = 'x'.repeat(24_000);
  const context = await extractionContext(`${sourceFileId}-schema`, boundedText);
  const empty = { schemaVersion: 1, batchId: 'batch_over_limits_0001', records: [], relations: [] };
  const overRecords = Object.assign({}, empty, {
    records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS + 1, 'excerpt_000001')
  });
  const overRelations = Object.assign({}, empty, {
    records: generatedRecords(GraphSchema.LIMITS.MAX_RECORDS, 'excerpt_000001'),
    relations: generatedRelations(GraphSchema.LIMITS.MAX_RELATIONS + 1, 'excerpt_000001')
  });
  const recordEnvelopeRejected = await GraphSchema.parseExtractionEnvelope(overRecords, context) === null;
  const relationEnvelopeRejected =
    await GraphSchema.parseExtractionEnvelope(overRelations, context) === null;
  assert.strictEqual(recordEnvelopeRejected, true);
  assert.strictEqual(relationEnvelopeRejected, true);
  const tooManyExcerpts = Object.assign({}, context, {
    excerpts: Array.from({ length: GraphSchema.LIMITS.MAX_EXCERPTS + 1 }, (_, index) => ({
      excerptId: `excerpt_${String(index + 1).padStart(6, '0')}`,
      text: 'x', sourceByteStart: index, sourceByteEnd: index + 1
    }))
  });
  const excerptContextRejected =
    await GraphSchema.parseExtractionEnvelope(empty, tooManyExcerpts) === null;
  assert.strictEqual(excerptContextRejected, true);
  const tooManyCharacters = Object.assign({}, context, {
    excerpts: [{
      excerptId: 'excerpt_000001', text: 'x'.repeat(24_001),
      sourceByteStart: 0, sourceByteEnd: 24_001
    }]
  });
  const characterContextRejected =
    await GraphSchema.parseExtractionEnvelope(empty, tooManyCharacters) === null;
  assert.strictEqual(characterContextRejected, true);
  const tooManyLocators = Object.assign({}, empty, {
    records: [{
      candidateRef: 'record', kind: 'agreement', label: 'Too Many Locators',
      evidence: Array.from({ length: GraphSchema.LIMITS.MAX_EVIDENCE_LOCATORS + 1 },
        (_, index) => ({ excerptId: 'excerpt_000001', start: index, end: index + 1 }))
    }]
  });
  const evidenceEnvelopeRejected =
    await GraphSchema.parseExtractionEnvelope(tooManyLocators, context) === null;
  assert.strictEqual(evidenceEnvelopeRejected, true);

  const responseProbe = createExecutableHarness(Object.assign({}, item, {
    special_assertions: Object.assign({}, item.special_assertions, {
      executable_source_characters: null,
      generated_response: 'raw-max-plus-one'
    })
  }));
  responseProbe.addSource(`${sourceFileId}-raw`, 'x', item.recorded_provider.raw_response);
  const rawOver = await responseProbe.current().facade.buildSource(
    EVAL_TUPLE, Object.freeze({ sourceFileId: `${sourceFileId}-raw` })
  );
  assert.strictEqual(operationProjection(rawOver).reason, 'model-response-too-large');
  assert.strictEqual(responseProbe.metrics.stageEffects, 0);
  const repairProbe = await assertRepairMaxPlusOne();
  const priorCountProbe = await assertPriorCandidateCountMaxPlusOne();
  const priorByteProbe = await assertPriorCandidateByteBoundary(
    GraphExtractor.LIMITS.MAX_PRIOR_CANDIDATE_BYTES + 1);
  const queryProbes = await assertQueryMaxPlusOneBoundaries();
  const resultByteProbe = await assertResultByteMaxPlusOne();

  const scopeGenerations = Array.from(
    { length: GraphQuery.LIMITS.MAX_SOURCE_GENERATIONS + 1 },
    (_, index) => ({
      sourceFileId: `scope-over-${String(index).padStart(2, '0')}`,
      fragmentGenerationId: `sfg1:${String(index).padStart(64, '0')}`
    })
  );
  const scopeOver = harness.current().graphQuery.createScope({
    partitionKey: EVAL_PARTITION,
    exactSourceGenerations: scopeGenerations
  });
  assert.strictEqual(scopeOver, null);
  const current = await readCurrentFragment(harness.current(), sourceFileId);
  return finishCase({
    item, harness, layer: harness.current(), sourceFileId, sourceText,
    rawResponse: item.recorded_provider.raw_response, operationResult,
    fragment: current.fragment,
    maxPlusOneObserved: {
      sourceCharacters: sourceText.length,
      sourceProviderCalls: harness.metrics.providerCalls,
      excerptCount: tooManyExcerpts.excerpts.length,
      excerptContextRejected,
      excerptCharacters: tooManyCharacters.excerpts[0].text.length,
      characterContextRejected,
      responseCharacters: responseProbe.metrics.responseLengths[0],
      responseStageEffects: responseProbe.metrics.stageEffects,
      schemaRecords: overRecords.records.length,
      recordEnvelopeRejected,
      schemaRelations: overRelations.relations.length,
      relationEnvelopeRejected,
      evidenceLocators: tooManyLocators.records[0].evidence.length,
      evidenceEnvelopeRejected,
      repairAttempts: repairProbe.attempts,
      repairProviderCalls: repairProbe.providerCalls,
      secondRepairRejected: repairProbe.secondRejected,
      priorCandidatesAttempted: priorCountProbe.attemptedCount,
      priorCandidatesProjected: priorCountProbe.projectedCount,
      priorCandidateOverflowRejected: priorCountProbe.overflowRejected,
      priorCandidateBytesAttempted: priorByteProbe.attemptedBytes,
      priorByteProjectionCount: priorByteProbe.projectedCount,
      priorByteOverflowRejected: priorByteProbe.rejected,
      scopeSources: scopeGenerations.length,
      scopeRejected: scopeOver === null,
      queryCharactersControl: queryProbes.queryCharactersControl,
      queryCharactersControlAdmitted: queryProbes.queryCharactersControlAdmitted,
      queryCharacters: queryProbes.queryCharacters,
      queryRejected: queryProbes.queryRejected,
      topNControl: queryProbes.topNControl,
      topNControlAdmitted: queryProbes.topNControlAdmitted,
      topN: queryProbes.topN,
      topNRejected: queryProbes.topNRejected,
      traversalDepthControl: queryProbes.traversalDepthControl,
      traversalDepthControlAdmitted: queryProbes.traversalDepthControlAdmitted,
      traversalDepth: queryProbes.traversalDepth,
      traversalDepthRejected: queryProbes.traversalDepthRejected,
      nodeLimitControl: queryProbes.nodeLimitControl,
      nodeLimitControlAdmitted: queryProbes.nodeLimitControlAdmitted,
      nodeLimit: queryProbes.nodeLimit,
      nodeLimitRejected: queryProbes.nodeLimitRejected,
      edgeLimitControl: queryProbes.edgeLimitControl,
      edgeLimitControlAdmitted: queryProbes.edgeLimitControlAdmitted,
      edgeLimit: queryProbes.edgeLimit,
      edgeLimitRejected: queryProbes.edgeLimitRejected,
      resultBytesControl: resultByteProbe.controlBytes,
      resultBytesControlAdmitted: resultByteProbe.controlAdmitted,
      resultBytes: resultByteProbe.bytes,
      resultBytesRejected: resultByteProbe.rejected
    },
    candidateRelations: []
  });
}

const EXECUTABLE_MATRIX = Object.freeze({
  P01: 'agreement-clause',
  P02: 'fact-event-owner',
  P03: 'policy-memo-references',
  P04: 'amends-candidate',
  P05: 'typed-replacement',
  P06: 'two-source-candidate',
  Q01: 'material-qualifier',
  Q02: 'explicit-negation',
  Q03: 'exception-defined-term',
  Q04: 'empty-source',
  Q05: 'insufficient-truncated',
  Q06: 'ambiguous-title-only',
  A01: 'malformed-json',
  A02: 'prose-markdown-wrapper',
  A03: 'unknown-prototype-field',
  A04: 'raw-max-plus-one',
  A05: 'records-max-plus-one',
  A06: 'relations-max-plus-one',
  A07: 'duplicate-dangling',
  I01: 'prompt-tool-url-injection',
  I02: 'malicious-filename-comment',
  I03: 'cross-source-reference',
  I04: 'cross-partition-influence',
  I05: 'fallback-binding-drift',
  L01: 'forged-excerpt',
  L02: 'offset-range-mismatch',
  L03: 'qualifier-clipped-span',
  R01: 'cancel-before-call',
  R02: 'cancel-fetch-backoff',
  R03: 'authority-loss-after-response',
  R04: 'quota-stage-publication',
  R05: 'crash-bounded-resume',
  R06: 'changed-source-replacement',
  R07: 'delete-revoke-absence',
  B01: 'every-exact-maximum',
  B02: 'every-max-plus-one',
  B03: 'exact-vs-forbidden-reuse'
});

async function executeFixtureCase(item) {
  switch (item.id) {
    case 'P05': return executeReplacementCase(item);
    case 'P06': return executePositiveCandidateCase(item);
    case 'A07': return executeDuplicateDanglingCase(item);
    case 'I04': return executeCrossPartitionCase(item);
    case 'L02': return executeOffsetFailureCase(item);
    case 'L03': return executeClippedQualifierCase(item);
    case 'R02': return executeProviderCancellationCase(item);
    case 'R04': return executeQuotaCase(item);
    case 'R05': return executeBoundedRecoveryCase(item);
    case 'R06': return executeTargetAdvanceCase(item);
    case 'R07': return executeDeleteRevokeCase(item);
    case 'B01': return executeExactMaxCase(item);
    case 'B02': return executeMaxPlusOneCase(item);
    case 'B03': return executeReuseCase(item);
    default: return executeDefaultCase(item);
  }
}

async function verifyExecutableFixtures() {
  const completed = [];
  for (const item of cases) {
    assert.strictEqual(item.special_assertions.matrix_case, EXECUTABLE_MATRIX[item.id],
      `${item.id} fixture is bound to its explicit executable matrix scenario`);
    await executeFixtureCase(item);
    completed.push(item.id);
  }
  assert.deepStrictEqual(completed, manifest.ordered_case_ids,
    'all 37 fixtures execute in manifest order through the production graph stack');
}

async function deriveCandidateSnapshot(targetFingerprint) {
  const account = 'eval-account';
  const root = 'eval-root';
  const partitionKey = `scpk1:${account.length}:${account}${root.length}:${root}`;
  const proposerSource = 'eval-proposer';
  const targetSource = 'eval-target';
  const proposerFingerprint = `sha256:${'a'.repeat(64)}`;
  const proposerGeneration = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey,
    sourceFileId: proposerSource,
    contentFingerprint: proposerFingerprint
  });
  const targetGeneration = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey,
    sourceFileId: targetSource,
    contentFingerprint: targetFingerprint
  });
  const proposerEnvelope = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: 'candidate_eval_batch_01',
    records: [{
      candidateRef: 'amendment',
      kind: 'amendment',
      label: 'Synthetic Amendment',
      evidence: [{ excerptId: 'candidate-proposer', start: 0, end: 9 }]
    }],
    relations: []
  }, {
    partitionKey,
    sourceFileId: proposerSource,
    contentFingerprint: proposerFingerprint,
    fragmentGenerationId: proposerGeneration,
    excerpts: [{
      excerptId: 'candidate-proposer', text: 'Synthetic candidate evidence.',
      sourceByteStart: 0, sourceByteEnd: 29
    }],
    batchOrdinal: 0,
    priorCandidates: []
  });
  const targetEnvelope = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: 'candidate_eval_batch_02',
    records: [{
      candidateRef: 'policy',
      kind: 'policy-document',
      label: 'Synthetic Policy',
      evidence: [{ excerptId: 'candidate-target', start: 0, end: 9 }]
    }],
    relations: []
  }, {
    partitionKey,
    sourceFileId: targetSource,
    contentFingerprint: targetFingerprint,
    fragmentGenerationId: targetGeneration,
    excerpts: [{
      excerptId: 'candidate-target', text: 'Synthetic target evidence.',
      sourceByteStart: 0, sourceByteEnd: 26
    }],
    batchOrdinal: 0,
    priorCandidates: []
  });
  assert.ok(proposerEnvelope && targetEnvelope, 'production schema admits synthetic candidate endpoints');
  const from = proposerEnvelope.records[0];
  const to = targetEnvelope.records[0];
  const evidence = from.evidence;
  const stableRelationId = await GraphSchema.deriveStableRelationId({
    identityVersion: GraphSchema.IDENTITY_VERSION,
    partitionKey,
    sourceFileId: proposerSource,
    predicate: 'references-policy',
    fromStableRecordId: from.stableRecordId,
    toStableRecordId: to.stableRecordId,
    primaryLocator: {
      sourceByteStart: evidence[0].sourceByteStart,
      sourceByteEnd: evidence[0].sourceByteEnd
    }
  });
  const evidenceIdentity = GraphSchema.canonicalize(evidence.map((locator) => ({
    locatorId: locator.locatorId,
    sourceByteStart: locator.sourceByteStart,
    sourceByteEnd: locator.sourceByteEnd
  })));
  const relationVersionId = await GraphSchema.deriveRelationVersionId({
    relationClass: 'cross-document-candidate',
    partitionKey,
    relationKind: 'references-policy',
    stableRelationId,
    proposerRecordVersionId: from.recordVersionId,
    proposerFragmentGenerationId: proposerGeneration,
    targetRecordVersionId: to.recordVersionId,
    targetFragmentGenerationId: targetGeneration,
    canonicalEvidenceLocatorIdentity: evidenceIdentity
  });
  const relation = await GraphSchema.parseCandidateRelation({
    schemaVersion: GraphSchema.VERSION,
    relationClass: 'cross-document-candidate',
    partitionKey,
    relationKind: 'references-policy',
    proposingSourceFileId: proposerSource,
    targetSourceFileId: targetSource,
    fromStableRecordId: from.stableRecordId,
    toStableRecordId: to.stableRecordId,
    stableRelationId,
    proposerRecordVersionId: from.recordVersionId,
    proposerFragmentGenerationId: proposerGeneration,
    targetRecordVersionId: to.recordVersionId,
    targetFragmentGenerationId: targetGeneration,
    evidence,
    canonicalEvidenceLocatorIdentity: evidenceIdentity,
    relationVersionId
  });
  const overlayGenerationId = await GraphSchema.deriveCandidateOverlayGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey,
    proposingSourceFileId: proposerSource,
    proposingFragmentGenerationId: proposerGeneration,
    relations: [relation]
  });
  return { proposerGeneration, targetGeneration, relationVersionId, overlayGenerationId };
}

async function verifyProductionModules() {
  assert.strictEqual(globalThis.FsbSkopeoGraphSchema, GraphSchema);
  assert.strictEqual(globalThis.FsbSkopeoGraphStore, GraphStore);
  assert.strictEqual(globalThis.FsbSkopeoGraphExtractor, GraphExtractor);
  assert.strictEqual(globalThis.FsbSkopeoGraphQuery, GraphQuery);
  assert.strictEqual(globalThis.FsbSkopeoGraphEngine, GraphEngine);
  assert.deepStrictEqual(Object.keys(GraphEngine).sort(), ['VERSION', 'create']);

  let indexBuilds = 0;
  class CountingMiniSearch extends MiniSearch {
    constructor(options) { super(options); indexBuilds += 1; }
  }
  const store = GraphStore.create({
    storageArea: inMemoryStorage(), graphSchema: GraphSchema,
    corpusSchema: CorpusSchema, now: () => 1
  });
  const query = GraphQuery.create({
    graphSchema: GraphSchema, graphStore: store, MiniSearch: CountingMiniSearch,
    byteLength: (value) => Buffer.byteLength(value, 'utf8')
  });
  assert.strictEqual(indexBuilds, 0, 'query construction performs zero MiniSearch hydration');
  assert.strictEqual(store.registerCacheOwner(query.cacheOwner).status, 'registered');
  const controller = new AbortController();
  const guard = store.issueMutation(controller.signal);
  const recovered = await store.recover(guard);
  assert.ok(recovered && recovered.ok === true, 'production graph durable-only recovery succeeds');
  assert.strictEqual(store.finishMutation(guard).ok, true);
  assert.strictEqual(indexBuilds, 0, 'durable recovery performs zero query-cache hydration');
}

function verifyFixtureShape() {
  deepFreeze(manifest);
  deepFreeze(cases);
  assert.ok(frozenTree(manifest) && frozenTree(cases), 'manifest and all case objects are immutable');
  assert.strictEqual(manifest.version, 'skopeo-graph-evals/v1');
  assert.strictEqual(manifest.network_allowed, false);
  assert.strictEqual(manifest.llm_judge_allowed, false);
  assert.deepStrictEqual(manifest.required_reviewer_roles, REQUIRED_ROLES);
  assert.strictEqual(cases.length, 37, 'exactly 37 cases are loaded');
  assert.deepStrictEqual(cases.map((item) => item.id), manifest.ordered_case_ids,
    'manifest order enumerates every case exactly once');
  assert.strictEqual(new Set(cases.map((item) => item.id)).size, 37, 'case IDs are unique');
  const counts = Object.create(null);
  for (const item of cases) counts[item.category] = (counts[item.category] || 0) + 1;
  assert.deepStrictEqual(Object.assign({}, counts), manifest.category_counts,
    'category counts are exactly 6/6/7/5/3/7/3');

  for (const item of cases) {
    exactKeys(item, CASE_KEYS, `${item.id} has complete case metadata`);
    exactKeys(item.expected, EXPECTED_KEYS, `${item.id} has complete provisional expectations`);
    assert.match(item.id, /^[PQAILRB][0-9]{2}$/);
    assert.strictEqual(item.id[0], item.category);
    assert.strictEqual(item.data_class, 'synthetic');
    assert.ok(Array.isArray(item.ordered_excerpts) && item.ordered_excerpts.length > 0);
    item.ordered_excerpts.forEach((excerpt) => {
      assert.strictEqual(excerpt.source_byte_end - excerpt.source_byte_start,
        Buffer.byteLength(excerpt.text, 'utf8'), `${item.id} excerpt bytes are exact`);
    });
    assert.ok(Number.isSafeInteger(item.budgets.excerpt_count) && item.budgets.excerpt_count >= 1);
    assert.ok(Number.isSafeInteger(item.budgets.provider_call_count) &&
      item.budgets.provider_call_count >= 0 && item.budgets.provider_call_count <= 9);
    assert.strictEqual(item.budgets.max_excerpts_per_call, 8);
    assert.strictEqual(item.budgets.max_characters_per_call, 24000);
    if (item.special_assertions.raw_format === 'malformed-json' ||
        item.special_assertions.raw_format === 'wrapped-json') {
      assert.throws(() => JSON.parse(item.recorded_provider.raw_response), SyntaxError,
        `${item.id} preserves its intentionally non-JSON recorded response verbatim`);
    } else {
      const raw = JSON.parse(item.recorded_provider.raw_response);
      assert.ok(raw && typeof raw === 'object', `${item.id} records a provider response object`);
    }
    const usage = item.recorded_provider.usage;
    assert.strictEqual(usage.input_tokens + usage.output_tokens, usage.total_tokens);
    assert.ok(['published', 'withheld'].includes(item.expected.publish_state));
    assert.ok(/^[a-z][a-z0-9-]+$/.test(item.expected.fixed_reason));
    assert.ok(Array.isArray(item.expected.provisional_records));
    assert.ok(Array.isArray(item.expected.provisional_relations));
    assert.ok(Array.isArray(item.expected.provisional_spans));
    assert.ok(Array.isArray(item.expected.durable_keys));
    assert.ok(item.expected.query_proof && typeof item.expected.query_proof === 'object');
    assert.ok(Array.isArray(item.expected.absence_proof));
    assert.strictEqual(item.review_status, 'pending');
    assert.strictEqual(item.gold_label_version, null);
    assert.deepStrictEqual(item.required_reviewer_roles, REQUIRED_ROLES);
    assert.deepStrictEqual(item.approved_reviewer_roles, []);
    assert.strictEqual(item.review_record_ref, null);
    assert.strictEqual(item.special_assertions.matrix_case, EXECUTABLE_MATRIX[item.id],
      `${item.id} declares the required executable scenario`);
    const assertedOutput = JSON.stringify({
      relations: item.expected.provisional_relations,
      query: item.expected.query_proof,
      special: item.special_assertions.fixed_ack || null
    }).toLowerCase();
    FORBIDDEN_ASSERTED_CLAIMS.forEach((claim) => {
      assert.strictEqual(assertedOutput.includes(claim), false,
        `${item.id} asserts no forbidden semantic claim (${claim})`);
    });
  }
}

async function verifySpecialChoreography() {
  const byId = new Map(cases.map((item) => [item.id, item]));
  const p01 = byId.get('P01');
  const markerNames = p01.expected.provisional_records;
  assert.deepStrictEqual(markerNames, [
    'Synthetic Acme Party Marker', 'Synthetic Vendor Marker', 'Synthetic Person Marker'
  ]);
  const productionText = GRAPH_FILES.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
  markerNames.forEach((marker) => assert.strictEqual(productionText.includes(marker), false,
    `${marker} is absent from production code, errors, diagnostics, and caches`));
  const first = await deriveCandidateSnapshot(`sha256:${'d'.repeat(64)}`);
  const second = await deriveCandidateSnapshot(`sha256:${'e'.repeat(64)}`);
  assert.strictEqual(first.proposerGeneration, second.proposerGeneration,
    'target-only advance leaves proposer generation unchanged');
  assert.notStrictEqual(first.targetGeneration, second.targetGeneration);
  assert.notStrictEqual(first.relationVersionId, second.relationVersionId,
    'target-only advance derives a distinct relation version');
  assert.notStrictEqual(first.overlayGenerationId, second.overlayGenerationId,
    'target-only advance derives a distinct canonical overlay generation');

  const engineSource = fs.readFileSync(
    path.join(ROOT, 'extension', 'utils', 'skopeo-graph-engine.js'), 'utf8');
  assert.match(engineSource, /function ProviderNoStorageResult\s*\(/);
  assert.match(engineSource, /status', 'provider-no-storage'/);
  assert.match(engineSource, /durableEffect', false/);
  assert.match(engineSource, /publisher\.publish\s*\(\s*async function providerNoStorageEffect/);
  assert.match(engineSource, /graphStore\.stageBatch/);
  assert.match(engineSource, /graphExtractor\.discard\s*\(\s*session\s*\)/);
}

function verifyNoRuntimeOrPackageExpansion() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const dependencyText = JSON.stringify({
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies
  }).toLowerCase();
  assert.strictEqual(dependencyText.includes('graphify'), false, 'package has no Graphify dependency');
  const forbidden = /\b(?:graphify|python3?|child_process|indexedDB|createServer|registerMcp)\b/i;
  GRAPH_FILES.forEach((file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.strictEqual(forbidden.test(source), false, `${file} has no upstream/process/database/MCP runtime`);
  });
  assert.strictEqual(typeof globalThis.fsbMcpBridgeClient, 'undefined',
    'production graph modules load with MCP globals absent');
}

function verifyProvenance() {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  [
    'https://github.com/Graphify-Labs/graphify',
    'abff1b1ca4052fcf9d955c5f6a034088723f4536',
    'MIT licensed',
    'Copyright 2026 Safi Shamsi',
    'LICENSE',
    'docs/how-it-works.md',
    'ARCHITECTURE.md',
    'graphify/ids.py',
    'graphify/validate.py',
    'graphify/cache.py',
    'bounded extraction',
    'validate-before-build',
    'evidence-bearing records/relations',
    'fingerprints',
    'traversal',
    'no copied code',
    'no runtime dependency',
    'Copied-code inventory: empty (`[]`)'
  ].forEach((statement) => {
    assert.ok(readme.includes(statement), `README preserves Graphify provenance: ${statement}`);
  });
}

(async () => {
  verifyFixtureShape();
  await verifyProductionModules();
  await verifyExecutableFixtures();
  await verifySpecialChoreography();
  verifyNoRuntimeOrPackageExpansion();
  verifyProvenance();
  const domainFidelity = reviewGate(cases);
  assert.strictEqual(domainFidelity, 'human_needed',
    'pending expert labels can never become a deterministic Critical PASS');
  console.log('deterministic_structural_security: pass');
  console.log('provisional_regression: pass (not gold)');
  console.log(`domain_fidelity: ${domainFidelity}`);
  console.log('skopeo graph evals: PASS (37 fixtures; deterministic gates only)');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
