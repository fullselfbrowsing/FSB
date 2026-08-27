'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-truth-engine.js');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');
const MANIFEST_PATH = path.join(ROOT, 'extension', 'manifest.json');
const CONTRACT_MARKER = 'skopeo truth runtime contract';

function failContract(message) {
  throw new Error(`${CONTRACT_MARKER}: ${message}`);
}

function exactKeys(value, expected, message) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected.slice().sort(), message);
}

function markedSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notStrictEqual(start, -1, `${startMarker} exists`);
  assert.notStrictEqual(end, -1, `${endMarker} exists`);
  assert.ok(end > start, `${startMarker} precedes ${endMarker}`);
  return source.slice(start, end + endMarker.length);
}

function testStaticTrustedBootContract(backgroundSource, manifestSource) {
  const graphTail = "importScripts('utils/skopeo-graph-engine.js')";
  const truthModules = [
    'utils/skopeo-truth-schema.js',
    'utils/skopeo-truth-extractor.js',
    'utils/skopeo-lineage-adjudicator.js',
    'utils/skopeo-deadline-engine.js',
    'utils/skopeo-truth-store.js',
    'utils/skopeo-truth-engine.js'
  ];
  let prior = backgroundSource.indexOf(graphTail);
  assert.ok(prior >= 0, 'graph import tail exists before truth imports');
  for (const modulePath of truthModules) {
    const needle = `importScripts('${modulePath}')`;
    const index = backgroundSource.indexOf(needle);
    assert.ok(index > prior, `${modulePath} loads after the graph chain`);
    assert.strictEqual(backgroundSource.split(needle).length, 2,
      `${modulePath} has one background import`);
    prior = index;
  }

  const boundary = markedSource(
    backgroundSource,
    '/* FSB_SKOPEO_CORPUS_BOUNDARY_START */',
    '/* FSB_SKOPEO_CORPUS_BOUNDARY_END */'
  );
  const order = [
    'globalThis.FsbSkopeoTruthStore.create',
    'graphStore.registerTruthInvalidator',
    'store.registerAuthorizedPurgeParticipant',
    'store.recover({}, recoveryGuard)',
    'graphStore.recover(graphRecoveryGuard)',
    'globalThis.FsbSkopeoGraphEngine.create',
    'truthStore.recover(truthRecoveryGuard)',
    'globalThis.FsbSkopeoTruthEngine.create'
  ];
  let orderIndex = -1;
  for (const needle of order) {
    const index = boundary.indexOf(needle);
    assert.ok(index > orderIndex, `${needle} remains in trusted boot order`);
    orderIndex = index;
  }
  assert.match(boundary, /truthStore\.getPurgeParticipant\(participantName\)/,
    'citations binds to the real truth owner');
  assert.match(boundary, /emptyReserved = participantName === 'counts'/,
    'counts is the only empty reserved owner');
  assert.match(boundary,
    /participantName === 'alerts'[\s\S]{0,100}alertStore\.getPurgeParticipant\(participantName\)/,
    'alerts are owned by the real Phase 59 store');
  assert.strictEqual(/globalThis\.fsbSkopeoTruthEngineFacade\s*=/.test(boundary), false,
    'truth facade is not published as a global capability');

  const contentStart = backgroundSource.indexOf('const CONTENT_SCRIPT_FILES = [');
  const controllerStart = backgroundSource.indexOf('/* FSB_SKOPEO_CONTROLLER_START */');
  const contentRegion = backgroundSource.slice(contentStart, controllerStart);
  const injectionRegion = markedSource(
    backgroundSource,
    'const SKOPEO_INJECTION_FILES = Object.freeze([',
    ']);'
  );
  for (const modulePath of truthModules) {
    assert.strictEqual(contentRegion.includes(modulePath), false,
      `${modulePath} is absent from generic content injection`);
    assert.strictEqual(injectionRegion.includes(modulePath), false,
      `${modulePath} is absent from Skopeo content injection`);
    assert.strictEqual(manifestSource.includes(modulePath), false,
      `${modulePath} is absent from manifest content scripts`);
  }
}

async function testEngineSurface() {
  if (!fs.existsSync(ENGINE_PATH)) {
    failContract('FsbSkopeoTruthEngine production module is missing');
  }
  const engine = require(ENGINE_PATH);
  exactKeys(engine, ['VERSION', 'create'], 'truth engine module exposes one factory');
  assert.strictEqual(engine.VERSION, 'skopeo-truth-engine/1');
  assert.strictEqual(globalThis.FsbSkopeoTruthEngine, engine);
}

function deepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      deepFrozen(descriptor.value, seen);
  });
}

function runtimeHarness(overrides = {}) {
  const TruthSchema = require('../extension/utils/skopeo-truth-schema.js');
  const TruthEngine = require('../extension/utils/skopeo-truth-engine.js');
  const graphDigest = `sgx1:${'b'.repeat(64)}`;
  const familyId = `stf1:${'d'.repeat(64)}`;
  const snapshotId = `sts1:${'8'.repeat(64)}`;
  const outputGenerationId = `stp1:${'9'.repeat(64)}`;
  const partitionKey = 'scpk1:12:permission-A6:root-A';
  const sourceFileIds = overrides.sourceFileIds || ['source-A'];
  const sourceFixtures = sourceFileIds.map((sourceFileId, index) => ({
    sourceFileId,
    fingerprint: `sha256:${String.fromCharCode(97 + index).repeat(64)}`,
    fragmentGenerationId: `sfg1:${String.fromCharCode(99 + index).repeat(64)}`,
    candidateGenerationId: `stg1:${String.fromCharCode(101 + index).repeat(64)}`
  }));
  const context = TruthSchema.parseEvaluationContext({
    asOfCivilDate: '2026-07-24',
    governingTimezoneBinding: {
      kind: 'configured',
      timezone: 'America/Chicago',
      configurationId: 'contract-governing-timezone',
      configurationVersion: 'v1'
    },
    calendars: []
  });
  assert.ok(context, 'runtime evaluation context parses through production truth schema');
  const sourceBindings = Object.freeze(sourceFixtures.map((source) => Object.freeze({
    sourceFileId: source.sourceFileId,
    sourceState: 'ready',
    contentFingerprint: source.fingerprint
  })));
  const graphBindings = Object.freeze(sourceFixtures.map((source) => Object.freeze({
    sourceFileId: source.sourceFileId,
    sourceState: 'ready',
    certificationStatus: 'certified',
    graphCurrent: true,
    contentFingerprint: source.fingerprint,
    fragmentGenerationId: source.fragmentGenerationId
  })));
  let snapshotCalls = 0;
  const snapshot = () => Object.freeze({
    snapshotVersion: 'skopeo-graph-exact-set/1',
    partitionKey,
    sourceBindings: graphBindings,
    records: Object.freeze([]),
    relations: Object.freeze([]),
    authorizedSetDigest: overrides.driftSnapshot && snapshotCalls > 1
      ? `sgx1:${'f'.repeat(64)}`
      : graphDigest
  });
  const trace = [];
  const extractionState = new WeakMap();
  const truthSchema = Object.freeze({
    ...TruthSchema,
    async parseSemanticFamilyProof(value) {
      return value && value.schemaVersion === TruthSchema.VERSION ? value : null;
    }
  });
  const proof = Object.freeze({
    schemaVersion: TruthSchema.VERSION,
    partitionKey,
    familyId,
    authorizedSetDigest: graphDigest,
    sourceBindings: Object.freeze(sourceFixtures.map((source) => Object.freeze({
      sourceFileId: source.sourceFileId,
      contentFingerprint: source.fingerprint,
      fragmentGenerationId: source.fragmentGenerationId,
      sourceState: 'ready',
      certified: true
    }))),
    documentStableIds: Object.freeze([`sri1:${'1'.repeat(64)}`]),
    lineageRelationIds: Object.freeze([]),
    recordVersionIds: Object.freeze([]),
    relationVersionIds: Object.freeze([]),
    candidateGenerationIds: Object.freeze(
      sourceFixtures.map((source) => source.candidateGenerationId)
    ),
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    adjudicationVersion: TruthSchema.ADJUDICATION_VERSION,
    deadlineRuleVersion: TruthSchema.DEADLINE_RULE_VERSION,
    calendarVersion: TruthSchema.CALENDAR_VERSION,
    evaluationContext: overrides.persistedContext || context,
    lineageProof: Object.freeze({
      schemaVersion: TruthSchema.VERSION,
      partitionKey,
      familyId,
      execution: Object.freeze({ conclusion: 'executed', reasonCode: 'executed-evidence', citationIds: Object.freeze([]) }),
      temporal: Object.freeze({ conclusion: 'effective', reasonCode: 'effective-as-of-date', citationIds: Object.freeze([]) }),
      lineageRole: Object.freeze({ conclusion: 'base', reasonCode: 'lineage-base-evidence', citationIds: Object.freeze([]) }),
      governance: Object.freeze({ conclusion: 'governing', reasonCode: 'governing-path-accepted', citationIds: Object.freeze([]) }),
      acceptedPath: Object.freeze([]),
      overlays: Object.freeze([]),
      inheritances: Object.freeze([])
    }),
    assertions: Object.freeze([]),
    conflicts: Object.freeze([]),
    citations: Object.freeze([]),
    deadlineRules: Object.freeze([]),
    deadlineResults: Object.freeze([])
  });
  const truthStore = {
    issueMutation(signal) {
      trace.push('mutation-issued');
      return Object.freeze({ signal });
    },
    finishMutation() {
      trace.push('mutation-finished');
      return Object.freeze({ ok: overrides.failMutationTerminal !== true });
    },
    async beginFamilyReplacement() {
      trace.push('begin');
      return Object.freeze({ handle: true });
    },
    async stageFamilySnapshot() {
      trace.push('stage');
      return Object.freeze({ ok: true, manifest: Object.freeze({ issued: true }) });
    },
    async publishFamilySnapshot() {
      trace.push('publish');
      return Object.freeze({ ok: true, status: 'published' });
    },
    async publishPartitionGeneration(input) {
      trace.push('publish-generation');
      assert.deepStrictEqual(input.familyIds, [familyId],
        'final publication names the complete deterministic family set');
      assert.strictEqual(input.authorizedSetDigest, graphDigest);
      return Object.freeze({
        ok: true,
        status: 'published',
        outputGenerationId
      });
    },
    async withdrawFamiliesForSources() {
      trace.push('withdraw');
      return Object.freeze({ ok: true, status: 'withdrawn' });
    },
    async inspectMetadata() {
      trace.push('inspect-metadata');
      const readCount = trace.filter((entry) => entry === 'inspect-metadata').length;
      if (overrides.throwOnInspectMetadata && readCount === 1) {
        throw new Error('inspect-metadata-unavailable');
      }
      if (overrides.throwOnFinalInspectMetadata && readCount > 1) {
        throw new Error('final-inspect-metadata-unavailable');
      }
      if (overrides.missingGeneration) {
        return Object.freeze({
          version: 'skopeo-truth-store/1',
          partitionKey,
          outputGenerationId: null,
          authorizedSetDigest: null,
          families: Object.freeze([])
        });
      }
      const familyCount = overrides.familyCount || 1;
      const families = Array.from({ length: familyCount }, (_, index) => Object.freeze({
        familyId: index === 0 ? familyId : `stf1:${index.toString(16).padStart(64, '0')}`,
        state: 'published',
        snapshotId: index === 0 ? snapshotId : `sts1:${index.toString(16).padStart(64, '0')}`
      })).sort((left, right) => left.familyId < right.familyId ? -1 : left.familyId > right.familyId ? 1 : 0);
      return Object.freeze({
        version: 'skopeo-truth-store/1',
        partitionKey,
        outputGenerationId: overrides.metadataDrift && readCount > 1
          ? `stp1:${'7'.repeat(64)}`
          : outputGenerationId,
        authorizedSetDigest: graphDigest,
        families: Object.freeze(families)
      });
    },
    async readActiveFamily(input) {
      trace.push('read-family');
      if (overrides.throwOnReadFamily) throw new Error('read-family-unavailable');
      if (overrides.missingFamily) return null;
      if (overrides.mismatchedFamily) {
        return Object.freeze({ ...proof, familyId: `stf1:${'9'.repeat(64)}` });
      }
      if (input.familyId === familyId) return proof;
      return Object.freeze({
        ...proof,
        familyId: input.familyId,
        lineageProof: Object.freeze({ ...proof.lineageProof, familyId: input.familyId })
      });
    }
  };
  const truthExtractor = {
    async prepareSource(certificate) {
      const source = sourceFixtures.find(
        (candidate) => candidate.sourceFileId === certificate.sourceFileId
      );
      assert.ok(source, 'source-local certificate identifies one issued source');
      const session = Object.freeze({});
      extractionState.set(session, { step: 0, source });
      trace.push('prepare-source');
      return Object.freeze({
        session,
        providerBinding: Object.freeze({ providerId: 'synthetic', modelId: 'truth-v1' })
      });
    },
    async verifyProviderBinding() {
      trace.push('verify-provider');
      return Object.freeze({ status: 'provider-binding-current' });
    },
    async nextBatch(session, _certificate, _signal, acknowledgeNoStorage) {
      const extraction = extractionState.get(session);
      const step = extraction.step;
      extraction.step += 1;
      trace.push(`provider-step-${step}`);
      if (step > 0) return Object.freeze({ status: 'complete' });
      const prepared = Object.freeze({
        status: 'provider-step',
        rawResponse: 'RAW_TRUTH_PROVIDER_ONLY',
        outcome: Object.freeze({ status: 'validated-batch' })
      });
      assert.ok(await acknowledgeNoStorage(prepared, _signal),
        'extractor receives the no-storage acknowledgement inside fresh authority');
      return prepared;
    },
    async repairBatch() {
      throw new Error('repair is not used by the admitted fixture');
    },
    async finalize(session) {
      const source = extractionState.get(session).source;
      trace.push('finalize-source');
      return Object.freeze({
        schemaVersion: TruthSchema.VERSION,
        promptVersion: TruthSchema.PROMPT_VERSION,
        partitionKey,
        sourceFileId: source.sourceFileId,
        contentFingerprint: source.fingerprint,
        fragmentGenerationId: source.fragmentGenerationId,
        authorizedSetDigest: graphDigest,
        providerId: 'synthetic',
        modelId: 'truth-v1',
        candidateGenerationIds: Object.freeze([source.candidateGenerationId]),
        batches: Object.freeze([])
      });
    },
    discard() {
      trace.push('discard-source');
      return Object.freeze({ status: 'discarded' });
    }
  };
  const signalController = () => new AbortController();
  let operation = 0;
  const runCorpusOperation = async function(kind, tuple, selection, callback, commit) {
    operation += 1;
    trace.push(`operation:${kind}:${operation}`);
    const controller = signalController();
    const certificate = Object.freeze({
      sourceFileId: selection.sourceFileId || null
    });
    const certificates = Object.freeze(
      (selection.sourceFileIds || [null]).map((selectedSourceFileId) =>
        Object.freeze({ sourceFileId: selectedSourceFileId }))
    );
    const prepared = selection.sourceFileId
      ? await callback(certificate, controller.signal)
      : await callback(certificates, Object.freeze({ complete: true }), controller.signal);
    const publisher = Object.freeze({
      signal: controller.signal,
      publish(effect) {
        return effect(Object.freeze({
          signal: controller.signal,
          async validate() { return true; }
        }));
      }
    });
    const value = await commit(prepared, publisher, controller.signal);
    return Object.freeze({ decision: 'admitted', value });
  };
  const validateEvaluationContext = async ({ evaluationContext }) => {
    trace.push('validate-context');
    const validateCount = trace.filter((entry) => entry === 'validate-context').length;
    if (overrides.throwOnFinalContext && validateCount > 1) {
      throw new Error('context-validator-unavailable');
    }
    if (overrides.contextStale) {
      return Object.freeze({
        ok: false,
        blockerCodes: Object.freeze(['evaluation-context-stale'])
      });
    }
    const digest = await TruthSchema.sha256Hex(evaluationContext);
    return Object.freeze({
      ok: true,
      contextDigest: digest.slice('sha256:'.length)
    });
  };
  const facade = TruthEngine.create({
    truthSchema,
    truthStore,
    truthExtractor,
    lineageAdjudicator: Object.freeze({
      async adjudicateExactSet() {
        trace.push('adjudicate');
        return Object.freeze({
          version: TruthSchema.ADJUDICATION_VERSION,
          status: 'adjudicated',
          authorizedSetDigest: graphDigest,
          families: Object.freeze([proof]),
          blockerCodes: Object.freeze([])
        });
      }
    }),
    deadlineEngine: Object.freeze({ VERSION: 'skopeo-deadline-engine/1' }),
    graphFacade: Object.freeze({
      async snapshotExactSet() {
        snapshotCalls += 1;
        trace.push('snapshot');
        if (overrides.throwOnFinalAuthority && snapshotCalls > 1) {
          throw new Error('final-authority-unavailable');
        }
        return Object.freeze({ decision: 'admitted', value: snapshot() });
      }
    }),
    corpusTransport: Object.freeze({ async readContent() { throw new Error('fake extractor owns content'); } }),
    runCorpusOperation,
    async readVisibleSourceSet() {
      trace.push('visible-set');
      return Object.freeze({
        status: 'ready',
        partitionKey,
        sourceBindings
      });
    },
    validateEvaluationContext,
    async readSettings() {
      return Object.freeze({ modelProvider: 'synthetic', modelName: 'truth-v1' });
    },
    providerFactory() { return Object.freeze({}); },
    byteLength(value) {
      if (overrides.displayOverCap && value.includes('"outputGenerationId"')) {
        return TruthSchema.LIMITS.MAX_MINIMIZED_RESULT_BYTES + 1;
      }
      return Buffer.byteLength(value, 'utf8');
    }
  });
  assert.ok(facade, 'truth engine accepts the exact closed dependency set');
  return { facade, context, familyId, graphDigest, outputGenerationId, trace };
}

async function testRuntimeAuthorityAndFacade() {
  const harness = runtimeHarness();
  exactKeys(harness.facade, [
    'recompute', 'inspectLineage', 'inspectFacts', 'inspectConflicts',
    'inspectCitations', 'inspectDeadline', 'inspectStatus', 'inspectDisplaySnapshot'
  ], 'truth facade exposes exactly eight methods');
  assert.ok(Object.isFrozen(harness.facade), 'truth facade is frozen');

  for (const method of Object.keys(harness.facade)) {
    const before = harness.trace.length;
    const request = method === 'recompute' || method === 'inspectDisplaySnapshot'
      ? {}
      : { familyId: harness.familyId };
    const result = await harness.facade[method]({ tabId: 7 }, request);
    assert.deepStrictEqual(result.blockerCodes, ['evaluation-context-missing'],
      `${method} rejects a missing context with the exact blocker`);
    assert.strictEqual(harness.trace.length, before,
      `${method} performs no graph, provider, adjudication, store, or read effect before context`);
  }

  const recomputed = await harness.facade.recompute(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ evaluationContext: harness.context })
  );
  assert.strictEqual(recomputed.status, 'published');
  assert.deepStrictEqual(recomputed.familyIds, [harness.familyId]);
  assert.ok(deepFrozen(recomputed), 'recompute projection is recursively frozen');
  assert.ok(
    harness.trace.indexOf('prepare-source') < harness.trace.indexOf('adjudicate') &&
      harness.trace.indexOf('adjudicate') < harness.trace.indexOf('begin') &&
      harness.trace.indexOf('begin') < harness.trace.indexOf('stage') &&
      harness.trace.indexOf('stage') < harness.trace.indexOf('publish') &&
      harness.trace.indexOf('publish') < harness.trace.indexOf('publish-generation'),
    'source-local extraction, adjudication, family staging, and generation commit remain ordered'
  );
  assert.strictEqual(JSON.stringify(harness.trace).includes('RAW_TRUTH_PROVIDER_ONLY'), false,
    'raw provider output never reaches an orchestration trace');
  assert.ok(harness.trace.filter((entry) => entry.startsWith('operation:ingestion')).length >= 6,
    'preparation, provider steps, finalization, and publication each use fresh operations');
  assert.ok(harness.trace.filter((entry) => entry === 'validate-context').length >= 4,
    'context currentness is validated initially, before commit, and within publication');

  for (const method of [
    'inspectLineage', 'inspectFacts', 'inspectConflicts',
    'inspectCitations', 'inspectDeadline', 'inspectStatus'
  ]) {
    const projection = await harness.facade[method](
      Object.freeze({ tabId: 7 }),
      Object.freeze({
        familyId: harness.familyId,
        evaluationContext: harness.context
      })
    );
    assert.strictEqual(projection.status, 'current', `${method} returns a current projection`);
    assert.ok(deepFrozen(projection), `${method} projection is recursively frozen`);
    assert.ok(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= 64 * 1024,
      `${method} projection stays within 64 KiB`);
  }
}

async function testCompleteDisplaySnapshotContract() {
  const harness = runtimeHarness();
  const projection = await harness.facade.inspectDisplaySnapshot(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ evaluationContext: harness.context })
  );
  exactKeys(projection, [
    'version', 'status', 'outputGenerationId', 'authorizedSetDigest',
    'evaluationContext', 'evaluationContextDigest', 'families', 'blockerCodes'
  ], 'complete display snapshot has one closed top-level shape');
  assert.strictEqual(projection.status, 'current');
  assert.strictEqual(projection.outputGenerationId, harness.outputGenerationId);
  assert.strictEqual(projection.authorizedSetDigest, harness.graphDigest);
  assert.strictEqual(
    require('../extension/utils/skopeo-truth-schema.js').canonicalize(projection.evaluationContext),
    require('../extension/utils/skopeo-truth-schema.js').canonicalize(harness.context),
    'display snapshot preserves the exact canonical evaluation context'
  );
  assert.match(projection.evaluationContextDigest, /^[0-9a-f]{64}$/);
  assert.deepStrictEqual(projection.blockerCodes, []);
  assert.strictEqual(projection.families.length, 1);
  exactKeys(projection.families[0], [
    'familyId', 'sourceBindings', 'documentStableIds', 'lineageRelationIds',
    'recordVersionIds', 'relationVersionIds', 'candidateGenerationIds',
    'candidateSchemaVersion', 'promptVersion', 'adjudicationVersion',
    'deadlineRuleVersion', 'calendarVersion', 'lineageProof', 'assertions',
    'conflicts', 'citations', 'deadlineRules', 'deadlineResults'
  ], 'display family omits duplicated partition/context/generation authority fields');
  assert.strictEqual(projection.families[0].familyId, harness.familyId);
  assert.ok(deepFrozen(projection), 'complete display snapshot is recursively frozen');
  assert.ok(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= 64 * 1024,
    'complete display snapshot stays within 64 KiB');
  const readTrace = harness.trace.filter((entry) =>
    ['visible-set', 'snapshot', 'validate-context', 'inspect-metadata', 'read-family'].includes(entry));
  assert.deepStrictEqual(readTrace, [
    'visible-set', 'snapshot', 'validate-context',
    'inspect-metadata', 'read-family', 'inspect-metadata',
    'visible-set', 'snapshot', 'validate-context'
  ], 'display inspection sandwiches every sorted family read with exact metadata and authority checks');

  const missingGeneration = runtimeHarness({ missingGeneration: true });
  const missing = await missingGeneration.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: missingGeneration.context });
  assert.deepStrictEqual(missing.blockerCodes, ['fact-missing']);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(missing, 'families'), false,
    'missing generation exposes no family prefix');

  const overFamilies = runtimeHarness({ familyCount: 33 });
  const overFamilyResult = await overFamilies.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: overFamilies.context });
  assert.deepStrictEqual(overFamilyResult.blockerCodes, ['exact-set-over-cap']);
  assert.strictEqual(overFamilies.trace.includes('read-family'), false,
    'the 33rd family is rejected before any family read');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(overFamilyResult, 'families'), false,
    'over-cap generation exposes no family prefix');

  const exactFamilyCap = runtimeHarness({ familyCount: 32 });
  const exactFamilyCapResult = await exactFamilyCap.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: exactFamilyCap.context });
  assert.strictEqual(exactFamilyCapResult.status, 'current');
  assert.strictEqual(exactFamilyCapResult.families.length, 32,
    'the exact 32-family display boundary remains complete');

  const missingFamily = runtimeHarness({ missingFamily: true });
  const missingFamilyResult = await missingFamily.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: missingFamily.context });
  assert.deepStrictEqual(missingFamilyResult.blockerCodes, ['snapshot-stale']);
  assert.strictEqual(missingFamily.trace.includes('withdraw'), false,
    'an unavailable listed generation member does not withdraw current truth');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(missingFamilyResult, 'families'), false,
    'missing generation member exposes no family prefix');

  const mismatchedFamily = runtimeHarness({ mismatchedFamily: true });
  const mismatchedFamilyResult = await mismatchedFamily.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: mismatchedFamily.context });
  assert.deepStrictEqual(mismatchedFamilyResult.blockerCodes, ['snapshot-stale']);
  assert.ok(mismatchedFamily.trace.includes('withdraw'),
    'a successfully read family-id mismatch withdraws stale influence');

  async function assertUnavailableReadDoesNotWithdraw(overrides, label, expectedBlocker) {
    const harness = runtimeHarness(overrides);
    const result = await harness.facade.inspectDisplaySnapshot(
      { tabId: 7 }, { evaluationContext: harness.context });
    assert.deepStrictEqual(result.blockerCodes, [expectedBlocker || 'snapshot-stale'],
      `${label} returns a non-mutating typed blocker`);
    assert.strictEqual(harness.trace.includes('withdraw'), false,
      `${label} does not withdraw current truth`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'families'), false,
      `${label} exposes no family prefix`);
  }

  await assertUnavailableReadDoesNotWithdraw(
    { throwOnInspectMetadata: true }, 'first metadata exception');
  await assertUnavailableReadDoesNotWithdraw(
    { throwOnReadFamily: true }, 'active-family exception');
  await assertUnavailableReadDoesNotWithdraw(
    { throwOnFinalInspectMetadata: true }, 'final metadata exception');
  await assertUnavailableReadDoesNotWithdraw(
    { throwOnFinalAuthority: true }, 'final authority exception');
  await assertUnavailableReadDoesNotWithdraw(
    { throwOnFinalContext: true }, 'final context-validator exception',
    'evaluation-context-mismatch');

  const drift = runtimeHarness({ metadataDrift: true });
  const driftResult = await drift.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: drift.context });
  assert.deepStrictEqual(driftResult.blockerCodes, ['snapshot-stale']);
  assert.ok(drift.trace.includes('withdraw'),
    'generation replacement withdraws stale influence before returning');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(driftResult, 'families'), false,
    'generation replacement exposes no family prefix');

  const overBytes = runtimeHarness({ displayOverCap: true });
  const overBytesResult = await overBytes.facade.inspectDisplaySnapshot(
    { tabId: 7 }, { evaluationContext: overBytes.context });
  assert.deepStrictEqual(overBytesResult.blockerCodes, ['exact-set-over-cap']);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(overBytesResult, 'families'), false,
    '64 KiB max-plus-one exposes no family prefix');
}

async function testStaleReadWithdrawalAndContextClosure() {
  const stale = runtimeHarness({ driftSnapshot: true });
  const staleResult = await stale.facade.inspectStatus(
    Object.freeze({ tabId: 7 }),
    Object.freeze({
      familyId: stale.familyId,
      evaluationContext: stale.context
    })
  );
  assert.deepStrictEqual(staleResult.blockerCodes, ['snapshot-stale']);
  assert.ok(stale.trace.includes('withdraw'),
    'a changed exact graph digest synchronously withdraws stale truth before returning');

  const contextStale = runtimeHarness({ contextStale: true });
  const contextResult = await contextStale.facade.recompute(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ evaluationContext: contextStale.context })
  );
  assert.deepStrictEqual(contextResult.blockerCodes, ['evaluation-context-stale']);
  assert.strictEqual(contextStale.trace.some((entry) => entry.startsWith('operation:')), false,
    'stale authoritative context stops before provider or durable effects');
}

async function testFailedMutationTerminalCannotPublish() {
  const harness = runtimeHarness({ failMutationTerminal: true });
  const result = await harness.facade.recompute(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ evaluationContext: harness.context })
  );
  assert.deepStrictEqual(
    result.blockerCodes,
    ['snapshot-stale'],
    'a failed mutation terminal prevents a successful publication result from escaping'
  );
  assert.ok(
    harness.trace.indexOf('publish') < harness.trace.lastIndexOf('mutation-finished'),
    'the publication attempt completes before its failed terminal is evaluated'
  );
}

async function codeUnitSourceOrderingResult() {
  const harness = runtimeHarness({ sourceFileIds: ['a-b', 'a_b'] });
  return harness.facade.recompute(
    Object.freeze({ tabId: 7 }),
    Object.freeze({ evaluationContext: harness.context })
  );
}

async function testCodeUnitSourceOrderingAcrossLocales() {
  const result = await codeUnitSourceOrderingResult();
  assert.strictEqual(
    result.status,
    'published',
    'the background code-unit order for punctuation-bearing source IDs is admitted'
  );
  for (const locale of ['C', 'fr_FR.UTF-8']) {
    const child = spawnSync(process.execPath, [__filename], {
      cwd: ROOT,
      env: {
        ...process.env,
        SKOPEO_TRUTH_ORDER_MATRIX: '1',
        LANG: locale,
        LC_ALL: locale
      },
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(child.status, 0, `${locale} order matrix: ${child.stderr.trim()}`);
    assert.strictEqual(child.stdout.trim(), 'published');
  }
}

async function testTruthStaticMutationFixtures(backgroundSource) {
  const verifier = await import(pathToFileURL(
    path.join(ROOT, 'scripts', 'verify-skopeo-storage-boundary.mjs')
  ).href);
  assert.strictEqual(verifier.verifyStorageBoundary({ root: ROOT }).ok, true);
  const engineSource = fs.readFileSync(ENGINE_PATH, 'utf8');
  function rejected(sourceOverrides, pattern, message) {
    const result = verifier.verifyStorageBoundary({ root: ROOT, sourceOverrides });
    assert.strictEqual(result.ok, false, message);
    assert.ok(result.errors.some((error) => pattern.test(error)),
      `${message}: ${result.errors.join(' | ')}`);
  }
  rejected({
    'extension/utils/skopeo-truth-engine.js': `${engineSource}\neval('truth');\n`
  }, /dynamic code/, 'dynamic truth evaluation mutation fails closed');
  rejected({
    'extension/utils/skopeo-truth-engine.js': `${engineSource}\ngraphStore.readCurrentFragment();\n`
  }, /exact-set graph facade/, 'direct graph-store mutation fails closed');
  rejected({
    'extension/utils/skopeo-truth-engine.js': `${engineSource}\nstorageArea.get('truth');\n`
  }, /direct durable storage/, 'direct truth-engine storage mutation fails closed');
  rejected({
    'extension/utils/skopeo-truth-engine.js': `${engineSource}\nDate.parse('2026-07-24');\n`
  }, /host date parsing/, 'implicit date parser mutation fails closed');
  rejected({
    'extension/utils/skopeo-truth-engine.js': `${engineSource}\nsendRequest({});\n`
  }, /raw provider access/, 'raw provider mutation fails closed');
  rejected({
    'extension/utils/skopeo-truth-engine.js': `${engineSource}\nchrome.alarms.create('truth');\n`
  }, /alarms or notifications/, 'truth scheduling mutation fails closed');
  rejected({
    'extension/background.js': backgroundSource.replace(
      'graphStore.registerTruthInvalidator(truthStore.graphInvalidator)',
      'void truthStore.graphInvalidator'
    )
  }, /invalidator/, 'missing graph invalidator mutation fails closed');
  rejected({
    'extension/background.js': backgroundSource.replace(
      'truthStore.getPurgeParticipant(participantName)',
      'fsbAuthorizedEmptyPurgeParticipant()'
    )
  }, /citations must bind/, 'empty citations owner mutation fails closed');
  rejected({
    'extension/background.js': backgroundSource.replace(
      'fsbSkopeoTruthEngineFacade = globalThis.FsbSkopeoTruthEngine.create',
      'globalThis.fsbSkopeoTruthEngineFacade = globalThis.FsbSkopeoTruthEngine.create'
    )
  }, /never be published|private truth facade/, 'global truth facade mutation fails closed');
  rejected({
    'extension/background.js': backgroundSource.replace(
      "try { importScripts('utils/skopeo-truth-schema.js'); }",
      "try { importScripts('utils/skopeo-truth-engine.js'); }"
    )
  }, /truth dependency order|load exactly once/, 'missing or reordered truth import fails closed');
}

(async () => {
  try {
    if (process.env.SKOPEO_TRUTH_ORDER_MATRIX === '1') {
      process.stdout.write(`${(await codeUnitSourceOrderingResult()).status}\n`);
      return;
    }
    const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');
    const manifestSource = fs.readFileSync(MANIFEST_PATH, 'utf8');
    testStaticTrustedBootContract(backgroundSource, manifestSource);
    await testEngineSurface();
    await testRuntimeAuthorityAndFacade();
    await testCompleteDisplaySnapshotContract();
    await testStaleReadWithdrawalAndContextClosure();
    await testFailedMutationTerminalCannotPublish();
    await testCodeUnitSourceOrderingAcrossLocales();
    await testTruthStaticMutationFixtures(backgroundSource);
    console.log(`${CONTRACT_MARKER}: PASS`);
  } catch (error) {
    if (String(error && error.message).includes(CONTRACT_MARKER)) throw error;
    failContract(error && error.message ? error.message : String(error));
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
