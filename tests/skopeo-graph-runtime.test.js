'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-graph-engine.js');
const BACKGROUND_PATH = path.join(ROOT, 'extension', 'background.js');

if (!fs.existsSync(ENGINE_PATH)) {
  throw new Error('skopeo-graph-engine.js is missing: FsbSkopeoGraphEngine runtime contract is RED');
}

const GraphSchema = require('../extension/utils/skopeo-graph-schema.js');
const GraphEngine = require('../extension/utils/skopeo-graph-engine.js');
const backgroundSource = fs.readFileSync(BACKGROUND_PATH, 'utf8');

const ACCOUNT = 'permission-A';
const ROOT_FILE = 'root-A';
const SOURCE = 'source-A';
const PARTITION = `scpk1:${ACCOUNT.length}:${ACCOUNT}${ROOT_FILE.length}:${ROOT_FILE}`;
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const RAW_PROVIDER_MARKER = 'RAW_PROVIDER_RESPONSE_ONLY_HERE';
const NOW = 100_000;

function frozen(entries) {
  const value = Object.create(null);
  for (const [key, item] of entries) value[key] = item;
  return Object.freeze(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreeze(descriptor.value, seen);
    }
  });
  return Object.freeze(value);
}

function exactKeys(value, expected, message) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected.slice().sort(), message);
}

function createBarrier() {
  let markEntered;
  let release;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  return Object.freeze({
    entered,
    release,
    async wait() {
      markEntered();
      await released;
    }
  });
}

function certificate(sourceFileId, sequence, fingerprint = FINGERPRINT, sourceState = 'ready') {
  const target = {
    decision: 'certified',
    operationId: `operation-${sequence}`,
    kind: 'ingestion',
    tabId: 7,
    origin: 'https://drive.google.com',
    generation: 2,
    contextEpoch: sequence,
    authorityEpoch: sequence,
    accountPermissionId: ACCOUNT,
    corpusRootFileId: ROOT_FILE,
    sourceFileId,
    sourceState,
    partitionEpoch: sequence,
    sourceEpoch: sequence,
    provedAt: NOW,
    vendorScopeFileId: ROOT_FILE,
    physicalParentChain: Object.freeze([ROOT_FILE]),
    metadataFingerprint: frozen([
      ['version', 1], ['kind', 'metadata'], ['name', 'Synthetic source'],
      ['mimeType', 'text/plain'], ['modifiedTime', '2026-01-01T00:00:00.000Z'],
      ['driveVersion', '1'], ['size', 9], ['trashed', false], ['canDownload', true]
    ]),
    membershipFingerprint: frozen([
      ['version', 1], ['kind', 'membership'], ['corpusRootFileId', ROOT_FILE],
      ['physicalParentChain', Object.freeze([ROOT_FILE])],
      ['vendorScopeFileId', ROOT_FILE], ['driveId', null]
    ]),
    contentFingerprint: fingerprint === null ? null : frozen([
      ['version', 1], ['kind', 'content'], ['evidenceKind', 'download-hash'],
      ['value', fingerprint]
    ])
  };
  Object.defineProperty(target, 'toJSON', {
    enumerable: false,
    value() { throw new TypeError('certificate is nonserializable'); }
  });
  return Object.freeze(target);
}

function authorityHarness() {
  let sequence = 0;
  let currentFingerprint = FINGERPRINT;
  const trace = [];
  const runCorpusOperation = async function(kind, tuple, selection, callback, commitCallback) {
    const effectful = kind === 'ingestion';
    trace.push({ type: 'operation', kind, tuple, selection, argc: arguments.length });
    sequence += 1;
    const sourceIds = selection.sourceFileId
      ? [selection.sourceFileId]
      : selection.sourceFileIds.slice();
    const certificates = sourceIds.map((sourceFileId) =>
      certificate(sourceFileId, sequence, currentFingerprint));
    const controller = new AbortController();
    const prepared = selection.sourceFileId
      ? await callback(certificates[0], controller.signal)
      : await callback(certificates, frozen([['complete', true]]), controller.signal);
    if (!effectful) return frozen([['decision', 'admitted'], ['value', prepared]]);
    assert.strictEqual(arguments.length, 5, 'every ingestion operation uses five arguments');
    let acknowledgement = null;
    const publisher = Object.freeze({
      signal: controller.signal,
      operationToken: Object.freeze({}),
      operationEpoch: sequence,
      async publish(effect, bindings) {
        assert.strictEqual(typeof effect, 'function');
        const traceEntry = { type: 'publish', bindings, operationId: certificates[0].operationId };
        trace.push(traceEntry);
        const effectGuard = Object.freeze({
          signal: controller.signal,
          operationToken: Object.freeze({}),
          operationEpoch: sequence,
          async validate() { return controller.signal.aborted === false; }
        });
        const value = await effect(effectGuard);
        traceEntry.valueStatus = value && value.status;
        if (value && value.status === 'provider-no-storage') {
          exactKeys(value, ['status', 'durableEffect', 'prepared'],
            'provider effect has the exact no-storage envelope');
          assert.strictEqual(value.durableEffect, false);
          assert.strictEqual(Object.isFrozen(value), true);
          assert.strictEqual(bindings, undefined, 'provider acknowledgement carries zero bindings');
          if (value.prepared.status === 'provider-step') {
            assert.strictEqual(value.prepared.rawResponse, 'RAW_PROVIDER_RESPONSE_ONLY_HERE');
          } else {
            assert.strictEqual(value.prepared.status, 'complete');
          }
        }
        acknowledgement = Object.freeze({ value });
        return acknowledgement;
      }
    });
    const returned = await commitCallback(prepared, publisher, controller.signal);
    assert.strictEqual(returned, acknowledgement,
      'commit callback returns the opaque publisher acknowledgement');
    return frozen([['decision', 'admitted'], ['value', acknowledgement.value]]);
  };
  return {
    trace,
    runCorpusOperation,
    setFingerprint(value) { currentFingerprint = value; }
  };
}

function runtimeHarness() {
  const authority = authorityHarness();
  const trace = authority.trace;
  let currentFragment = null;
  let stagedFragment = null;
  let providerCalls = 0;
  let queryScopes = 0;
  let queryReleases = 0;
  let staleFenceBarrier = null;
  const graphStore = Object.freeze({
    issueMutation(signal) {
      trace.push({ type: 'graph-mutation-issued', signal });
      return Object.freeze({ signal });
    },
    finishMutation() { return frozen([['ok', true], ['status', 'finished']]); },
    async withdrawSource() {
      trace.push({ type: 'withdraw' });
      currentFragment = null;
      return frozen([['ok', true], ['status', 'withheld']]);
    },
    async withdrawSourceIfCurrent(input) {
      const barrier = staleFenceBarrier;
      staleFenceBarrier = null;
      if (barrier) await barrier.wait();
      const matches = !!currentFragment &&
        currentFragment.fragmentGenerationId === input.activeGenerationId &&
        currentFragment.contentFingerprint === input.contentFingerprint;
      trace.push({
        type: 'stale-withdraw',
        activeGenerationId: input.activeGenerationId,
        contentFingerprint: input.contentFingerprint,
        status: matches ? 'withheld' : 'superseded'
      });
      if (!matches) return frozen([['ok', true], ['status', 'superseded']]);
      currentFragment = null;
      return frozen([['ok', true], ['status', 'withheld']]);
    },
    async beginReplacement(input) {
      trace.push({ type: 'begin', input });
      return frozen([
        ['version', 1], ['status', 'staging'], ['partitionKey', input.partitionKey],
        ['sourceFileId', input.sourceFileId],
        ['fragmentGenerationId', await GraphSchema.deriveFragmentGenerationId(input)],
        ['providerId', input.providerId], ['modelId', input.modelId]
      ]);
    },
    async stageBatch(_handle, batch) {
      assert.strictEqual(JSON.stringify(batch).includes(RAW_PROVIDER_MARKER), false,
        'the raw provider envelope is stripped before the staging callback begins');
      trace.push({ type: 'stage', batch });
      return frozen([['ok', true], ['status', 'staged']]);
    },
    async sealStaging(_handle, payload) {
      stagedFragment = payload.fragment;
      trace.push({ type: 'seal' });
      return frozen([['ok', true], ['status', 'sealed']]);
    },
    async publishReplacement() {
      currentFragment = stagedFragment;
      trace.push({ type: 'published' });
      return frozen([['ok', true], ['status', 'published']]);
    },
    async replaceCandidateRelations(input) {
      trace.push({ type: 'candidate-replace', input });
      return frozen([['ok', true], ['status', input.relations.length ? 'published' : 'cleared']]);
    },
    async readCurrentFragment(input) {
      if (!currentFragment || input.fragmentGenerationId !== currentFragment.fragmentGenerationId) return null;
      return currentFragment;
    },
    async inspectMetadata() {
      return currentFragment
        ? frozen([
          ['version', 1], ['state', 'published'], ['schemaVersion', GraphSchema.VERSION],
          ['promptVersion', GraphSchema.PROMPT_VERSION],
          ['fragmentGenerationId', currentFragment.fragmentGenerationId],
          ['activeGenerationId', currentFragment.fragmentGenerationId],
          ['contentFingerprint', currentFragment.contentFingerprint],
          ['recordCount', currentFragment.records.length], ['relationCount', currentFragment.relations.length]
        ])
        : frozen([
          ['version', 1], ['state', 'absent'], ['schemaVersion', GraphSchema.VERSION],
          ['promptVersion', GraphSchema.PROMPT_VERSION], ['fragmentGenerationId', null],
          ['activeGenerationId', null], ['contentFingerprint', null],
          ['recordCount', 0], ['relationCount', 0]
        ]);
    }
  });
  const session = deepFreeze({
    partitionKey: PARTITION,
    accountPermissionId: ACCOUNT,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    graphSchemaVersion: GraphSchema.VERSION,
    promptVersion: GraphSchema.PROMPT_VERSION,
    providerId: 'xai',
    modelId: 'synthetic-model'
  });
  let nextOrdinal = 0;
  const generationIdPromise = GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT
  });
  const graphExtractor = Object.freeze({
    async reuseKey() { return 'sgrk1:synthetic'; },
    async prepareSource(_certificate, _signal, readContent) {
      await readContent(async () => {}, _signal);
      return frozen([['session', session], ['providerBinding', frozen([
        ['providerId', 'xai'], ['modelId', 'synthetic-model']
      ])]]);
    },
    async verifyProviderBinding() {
      return frozen([['status', 'provider-binding-current'], ['providerBinding', frozen([
        ['providerId', 'xai'], ['modelId', 'synthetic-model']
      ])]]);
    },
    async nextBatch() {
      providerCalls += 1;
      if (nextOrdinal > 0) return frozen([['status', 'complete']]);
      nextOrdinal += 1;
      return deepFreeze({
        status: 'provider-step',
        rawResponse: RAW_PROVIDER_MARKER,
        outcome: {
          status: 'validated-batch',
          batch: { batchOrdinal: 0, records: [], relations: [] }
        }
      });
    },
    async repairBatch() { throw new Error('repair should not run'); },
    async finalize() {
      const fragmentGenerationId = await generationIdPromise;
      return deepFreeze({
        fragment: {
          schemaVersion: GraphSchema.VERSION,
          promptVersion: GraphSchema.PROMPT_VERSION,
          partitionKey: PARTITION,
          sourceFileId: SOURCE,
          contentFingerprint: FINGERPRINT,
          fragmentGenerationId,
          providerId: 'xai',
          modelId: 'synthetic-model',
          records: [],
          relations: []
        },
        lexicalShards: [], adjacencyShards: [], resultCacheShards: []
      });
    },
    discard() {}
  });
  const graphQuery = Object.freeze({
    createScope() { queryScopes += 1; return Object.freeze({}); },
    async ensureScopeCache() { return frozen([['status', 'ready']]); },
    async getById() { return frozen([['kind', 'agreement']]); },
    async searchLexical() { return Object.freeze([]); },
    async neighbors() { return frozen([['nodes', Object.freeze([])], ['edges', Object.freeze([])]]); },
    async inspectProvenance() { return frozen([['entityType', 'record']]); },
    async snapshotExactSet() {
      if (!currentFragment) return null;
      return deepFreeze({
        snapshotVersion: 'skopeo-graph-exact-set/1',
        partitionKey: PARTITION,
        sourceBindings: [{
          sourceFileId: currentFragment.sourceFileId,
          contentFingerprint: currentFragment.contentFingerprint,
          fragmentGenerationId: currentFragment.fragmentGenerationId
        }],
        records: currentFragment.records,
        relations: currentFragment.relations
      });
    },
    releaseScope() { queryReleases += 1; return true; }
  });
  const facade = GraphEngine.create({
    graphSchema: GraphSchema,
    graphStore,
    graphExtractor,
    graphQuery,
    corpusTransport: Object.freeze({
      async readContent(_tuple, _input, sink, signal) {
        await sink(frozen([
          ['byteHash', FINGERPRINT], ['exactByteLength', 9], ['text', 'synthetic']
        ]), signal);
        return frozen([['kind', 'ok']]);
      }
    }),
    runCorpusOperation: authority.runCorpusOperation,
    readSettings: async () => ({ modelProvider: 'xai', modelName: 'synthetic-model' }),
    providerFactory: () => Object.freeze({}),
    now: () => NOW
  });
  return {
    facade, trace, graphStore,
    setAuthorityFingerprint: authority.setFingerprint,
    armStaleFenceBarrier() {
      assert.strictEqual(staleFenceBarrier, null, 'only one stale fence barrier may be armed');
      staleFenceBarrier = createBarrier();
      return staleFenceBarrier;
    },
    async publishConcurrentGeneration(contentFingerprint) {
      assert.ok(currentFragment, 'a prior fragment exists before the concurrent publication');
      const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
        schemaVersion: GraphSchema.VERSION,
        partitionKey: PARTITION,
        sourceFileId: SOURCE,
        contentFingerprint
      });
      currentFragment = deepFreeze(Object.assign({}, currentFragment, {
        contentFingerprint,
        fragmentGenerationId
      }));
      trace.push({ type: 'concurrent-published', fragmentGenerationId, contentFingerprint });
      return fragmentGenerationId;
    },
    metrics: () => ({ providerCalls, queryScopes, queryReleases })
  };
}

function testStaticBootContract() {
  const imports = [
    'lib/minisearch.min.js',
    'lib/cfworker-json-schema.min.js',
    'utils/skopeo-corpus-schema.js',
    'utils/skopeo-corpus-store.js',
    'utils/skopeo-drive-corpus-transport.js',
    'utils/skopeo-drive-authority.js',
    'utils/skopeo-corpus-controller.js',
    'utils/skopeo-drive-reconciler.js',
    'utils/skopeo-graph-schema.js',
    'utils/skopeo-graph-store.js',
    'utils/skopeo-graph-extractor.js',
    'utils/skopeo-graph-query.js',
    'utils/skopeo-graph-engine.js'
  ];
  let prior = -1;
  for (const modulePath of imports) {
    const needle = `importScripts('${modulePath}')`;
    const index = backgroundSource.indexOf(needle);
    assert.ok(index > prior, `${modulePath} loads once in private dependency order`);
    assert.strictEqual(backgroundSource.split(needle).length, 2, `${modulePath} has one load site`);
    prior = index;
  }
  const start = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_START */');
  const end = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_END */');
  const boundary = backgroundSource.slice(start, end);
  assert.match(boundary, /registerCacheOwner/);
  assert.strictEqual((boundary.match(/registerAuthorizedPurgeParticipant/g) || []).length >= 1, true);
  assert.strictEqual(/registerPurgeParticipant\s*\(/.test(boundary), false,
    'final graph-aware boot uses no legacy purge registration');
  assert.ok(boundary.indexOf('store.recover({}, recoveryGuard)') < boundary.indexOf('graphStore.recover'),
    'corpus recovery precedes durable graph recovery');
  assert.ok(boundary.indexOf('graphStore.recover') <
    boundary.indexOf('fsbSkopeoGraphEngineFacade = globalThis.FsbSkopeoGraphEngine.create'),
    'facade availability follows durable graph recovery');
  for (const modulePath of imports.slice(8)) {
    const contentStart = backgroundSource.indexOf('const CONTENT_SCRIPT_FILES = [');
    const controllerStart = backgroundSource.indexOf('/* FSB_SKOPEO_CONTROLLER_START */');
    assert.strictEqual(backgroundSource.slice(contentStart, controllerStart).includes(modulePath), false,
      `${modulePath} is not content injected`);
  }
  assert.strictEqual(/FsbSkopeoGraphEngine[^\n]*(?:mcp|MCP)|(?:mcp|MCP)[^\n]*FsbSkopeoGraphEngine/.test(
    backgroundSource
  ), false, 'graph engine adds no MCP surface');
}

function testTruthIntegrationContract() {
  try {
    const truthModules = [
      'utils/skopeo-truth-schema.js',
      'utils/skopeo-truth-extractor.js',
      'utils/skopeo-lineage-adjudicator.js',
      'utils/skopeo-deadline-engine.js',
      'utils/skopeo-truth-store.js',
      'utils/skopeo-truth-engine.js'
    ];
    let prior = backgroundSource.indexOf("importScripts('utils/skopeo-graph-engine.js')");
    assert.ok(prior >= 0, 'graph engine import exists');
    for (const modulePath of truthModules) {
      const needle = `importScripts('${modulePath}')`;
      const index = backgroundSource.indexOf(needle);
      assert.ok(index > prior, `${modulePath} follows the graph import chain`);
      assert.strictEqual(backgroundSource.split(needle).length, 2,
        `${modulePath} has one import site`);
      prior = index;
    }
    const start = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_START */');
    const end = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_END */');
    const boundary = backgroundSource.slice(start, end);
    assert.match(boundary, /graphStore\.registerTruthInvalidator\(truthStore\.graphInvalidator\)/);
    assert.ok(
      boundary.indexOf('graphStore.registerTruthInvalidator') <
        boundary.indexOf('graphStore.recover(graphRecoveryGuard)'),
      'truth invalidation registers before graph recovery or mutation'
    );
    assert.match(boundary, /truthStore\.getPurgeParticipant\(participantName\)/,
      'citations uses the real truth participant binder');
  } catch (error) {
    throw new Error(`skopeo graph runtime truth integration contract: ${error.message}`);
  }
}

async function testStaticMutationFixtures() {
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
    'extension/utils/skopeo-graph-engine.js': `${engineSource}\neval('mutated graph runtime');\n`
  }, /dynamic code loading/, 'dynamic graph evaluation mutation fails closed');
  rejected({
    'extension/utils/skopeo-graph-engine.js': `${engineSource}\nfetch('https:\/\/graphify.invalid');\n`
  }, /remote runtime|Graphify is conceptual/, 'remote or Graphify runtime mutation fails closed');
  rejected({
    'extension/utils/skopeo-graph-engine.js': `${engineSource}\nregisterMcpTool('graph');\n`
  }, /MCP, tool, server/, 'MCP graph registration mutation fails closed');
  rejected({
    'extension/background.js': backgroundSource.replace(
      "'content/skopeo-runtime.js'",
      "'content/skopeo-runtime.js',\n  'utils/skopeo-graph-engine.js'"
    )
  }, /private graph module must remain background-only/,
  'content graph injection mutation fails closed');
  rejected({
    'extension/background.js': backgroundSource.replace(
      'store.registerAuthorizedPurgeParticipant(participantName, binder)',
      'store.registerPurgeParticipant(participantName, binder)'
    )
  }, /authorized|legacy purge registration/,
  'legacy participant registration mutation fails closed');
}

async function testBuildAndQueryContract() {
  exactKeys(GraphEngine, ['VERSION', 'create'], 'graph engine module has a closed surface');
  assert.strictEqual(globalThis.FsbSkopeoGraphEngine, GraphEngine);
  const fixture = runtimeHarness();
  exactKeys(fixture.facade, [
    'buildSource', 'updateSource', 'replaceCandidateRelations', 'getById',
    'searchLexical', 'neighbors', 'inspectProvenance', 'snapshotExactSet', 'inspectStatus'
  ], 'facade exposes only the nine closed methods');
  const tuple = deepFreeze({ tabId: 7 });
  const built = await fixture.facade.buildSource(tuple, deepFreeze({ sourceFileId: SOURCE }));
  assert.strictEqual(built.decision, 'admitted');
  assert.strictEqual(built.value.status, 'published');
  const operationTrace = fixture.trace.filter((entry) => entry.type === 'operation');
  assert.ok(operationTrace.length >= 7, 'build uses fresh operations for every bounded step');
  assert.ok(operationTrace.every((entry) => entry.kind === 'ingestion' && entry.argc === 5));
  const operationIds = fixture.trace.filter((entry) => entry.type === 'publish')
    .map((entry) => entry.operationId);
  assert.strictEqual(new Set(operationIds).size, operationIds.length,
    'no certificate identity crosses an operation boundary');
  const withdrawIndex = fixture.trace.findIndex((entry) => entry.type === 'withdraw');
  const providerPublishIndex = fixture.trace.findIndex((entry) =>
    entry.type === 'publish' && entry.valueStatus === 'provider-no-storage');
  const stageIndex = fixture.trace.findIndex((entry) => entry.type === 'stage');
  assert.ok(withdrawIndex >= 0 && providerPublishIndex > withdrawIndex && stageIndex > providerPublishIndex,
    'old truth is withdrawn before provider work and provider work precedes fresh staging');
  assert.strictEqual(fixture.metrics().providerCalls, 2,
    'one validated batch plus one bounded completion probe runs');
  assert.strictEqual(JSON.stringify(fixture.trace).includes(RAW_PROVIDER_MARKER), false,
    'raw provider bytes never cross into orchestration logs or staging traces');

  const metadata = await fixture.graphStore.inspectMetadata({ partitionKey: PARTITION, sourceFileId: SOURCE });
  const generation = metadata.fragmentGenerationId;
  const queried = await fixture.facade.searchLexical(tuple, deepFreeze({ sourceFileId: SOURCE }),
    deepFreeze({ query: 'synthetic', topN: 3 }));
  assert.strictEqual(queried.decision, 'admitted');
  assert.strictEqual(fixture.metrics().queryScopes, 1);
  assert.strictEqual(fixture.metrics().queryReleases, 1, 'authorized query scope releases in finally');
  assert.ok(typeof generation === 'string' && generation.startsWith('sfg1:'));
  const status = await fixture.facade.inspectStatus(tuple, deepFreeze({ sourceFileId: SOURCE }));
  assert.strictEqual(status.decision, 'admitted');
  assert.strictEqual(status.value.state, 'published');
  assert.strictEqual(JSON.stringify(status).includes(SOURCE), false,
    'status projection exposes no source identifier');
}

async function testFreshFingerprintFencesStaleFragments() {
  const tuple = deepFreeze({ tabId: 8 });
  const changedFingerprint = `sha256:${'b'.repeat(64)}`;

  {
    const fixture = runtimeHarness();
    assert.strictEqual((await fixture.facade.buildSource(
      tuple, deepFreeze({ sourceFileId: SOURCE })
    )).value.status, 'published');
    fixture.setAuthorityFingerprint(changedFingerprint);
    const scopesBefore = fixture.metrics().queryScopes;
    const withdrawsBefore = fixture.trace.filter((entry) => entry.type === 'stale-withdraw').length;
    const queried = await fixture.facade.searchLexical(
      tuple,
      deepFreeze({ sourceFileId: SOURCE }),
      deepFreeze({ query: 'synthetic', topN: 3 })
    );
    assert.strictEqual(queried.decision, 'closed',
      'a fresh certificate for changed bytes returns no stale query projection');
    assert.strictEqual(fixture.metrics().queryScopes, scopesBefore,
      'fingerprint mismatch fails before query-scope creation or cache hydration');
    assert.strictEqual(
      fixture.trace.filter((entry) => entry.type === 'stale-withdraw').length,
      withdrawsBefore + 1,
      'query mismatch runs a fresh authorized source fence'
    );
    const metadata = await fixture.graphStore.inspectMetadata({
      partitionKey: PARTITION, sourceFileId: SOURCE
    });
    assert.notStrictEqual(metadata.state, 'published',
      'the observed A generation is withdrawn when it remains current');
  }

  {
    const fixture = runtimeHarness();
    assert.strictEqual((await fixture.facade.buildSource(
      tuple, deepFreeze({ sourceFileId: SOURCE })
    )).value.status, 'published');
    fixture.setAuthorityFingerprint(changedFingerprint);
    const candidateMutationsBefore = fixture.trace.filter(
      (entry) => entry.type === 'candidate-replace'
    ).length;
    const cleared = await fixture.facade.replaceCandidateRelations(
      tuple,
      deepFreeze({ sourceFileId: SOURCE }),
      deepFreeze({ proposingSourceFileId: SOURCE, relations: [] })
    );
    assert.strictEqual(cleared.decision, 'admitted');
    assert.strictEqual(cleared.value.status, 'stale-operation',
      'a stale proposer is fenced instead of being treated as a published overlay owner');
    assert.strictEqual(fixture.trace.filter(
      (entry) => entry.type === 'candidate-replace'
    ).length, candidateMutationsBefore,
    'fingerprint mismatch performs zero candidate-overlay replacement');
    const metadata = await fixture.graphStore.inspectMetadata({
      partitionKey: PARTITION, sourceFileId: SOURCE
    });
    assert.notStrictEqual(metadata.state, 'published',
      'candidate cleanup withdraws observed A when A remains current');
  }

  {
    const fixture = runtimeHarness();
    assert.strictEqual((await fixture.facade.buildSource(
      tuple, deepFreeze({ sourceFileId: SOURCE })
    )).value.status, 'published');
    fixture.setAuthorityFingerprint(changedFingerprint);
    const status = await fixture.facade.inspectStatus(
      tuple, deepFreeze({ sourceFileId: SOURCE })
    );
    assert.strictEqual(status.decision, 'closed',
      'status never reports an old generation under a fresh changed fingerprint');
    const metadata = await fixture.graphStore.inspectMetadata({
      partitionKey: PARTITION, sourceFileId: SOURCE
    });
    assert.notStrictEqual(metadata.state, 'published',
      'status mismatch withdraws stale source influence through the authorized path');
  }
}

async function testSupersededStaleFencesPreserveConcurrentPublication() {
  const tuple = deepFreeze({ tabId: 9 });
  const changedFingerprint = `sha256:${'c'.repeat(64)}`;
  const operations = [
    {
      name: 'query',
      invoke(fixture) {
        return fixture.facade.searchLexical(
          tuple,
          deepFreeze({ sourceFileId: SOURCE }),
          deepFreeze({ query: 'synthetic', topN: 3 })
        );
      },
      assertResult(result) { assert.strictEqual(result.decision, 'closed'); }
    },
    {
      name: 'status',
      invoke(fixture) {
        return fixture.facade.inspectStatus(tuple, deepFreeze({ sourceFileId: SOURCE }));
      },
      assertResult(result) { assert.strictEqual(result.decision, 'closed'); }
    },
    {
      name: 'candidate',
      invoke(fixture) {
        return fixture.facade.replaceCandidateRelations(
          tuple,
          deepFreeze({ sourceFileId: SOURCE }),
          deepFreeze({ proposingSourceFileId: SOURCE, relations: [] })
        );
      },
      assertResult(result) {
        assert.strictEqual(result.decision, 'admitted');
        assert.strictEqual(result.value.status, 'stale-operation');
      }
    }
  ];

  for (const operation of operations) {
    const fixture = runtimeHarness();
    assert.strictEqual((await fixture.facade.buildSource(
      tuple, deepFreeze({ sourceFileId: SOURCE })
    )).value.status, 'published');
    const observed = await fixture.graphStore.inspectMetadata({
      partitionKey: PARTITION, sourceFileId: SOURCE
    });
    fixture.setAuthorityFingerprint(changedFingerprint);
    const barrier = fixture.armStaleFenceBarrier();
    const pending = operation.invoke(fixture);
    await barrier.entered;
    const currentGenerationId = await fixture.publishConcurrentGeneration(changedFingerprint);
    barrier.release();
    const result = await pending;
    operation.assertResult(result);

    const fence = fixture.trace.filter((entry) => entry.type === 'stale-withdraw').at(-1);
    assert.ok(fence, `${operation.name} executes the conditional stale fence`);
    assert.strictEqual(fence.activeGenerationId, observed.activeGenerationId,
      `${operation.name} carries the exact A generation observed stale`);
    assert.strictEqual(fence.contentFingerprint, observed.contentFingerprint,
      `${operation.name} carries the exact A fingerprint observed stale`);
    assert.strictEqual(fence.status, 'superseded',
      `${operation.name} turns delayed A cleanup into a fixed no-op after B publishes`);
    const current = await fixture.graphStore.inspectMetadata({
      partitionKey: PARTITION, sourceFileId: SOURCE
    });
    assert.strictEqual(current.state, 'published',
      `${operation.name} leaves concurrently published B visible`);
    assert.strictEqual(current.activeGenerationId, currentGenerationId,
      `${operation.name} leaves the B control pointer unchanged`);
    assert.strictEqual(current.contentFingerprint, changedFingerprint,
      `${operation.name} leaves the B fingerprint unchanged`);
    assert.ok(await fixture.graphStore.readCurrentFragment({
      partitionKey: PARTITION,
      sourceFileId: SOURCE,
      fragmentGenerationId: currentGenerationId
    }), `${operation.name} leaves B queryable after stale A cleanup`);
  }
}

async function snapshotRuntimeHarness(options = {}) {
  const sourceFileIds = (options.sourceFileIds || [SOURCE]).slice();
  const storedFingerprint = options.storedFingerprint || FINGERPRINT;
  const fragments = new Map();
  for (const sourceFileId of sourceFileIds) {
    const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
      schemaVersion: GraphSchema.VERSION,
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint: storedFingerprint
    });
    fragments.set(sourceFileId, deepFreeze({
      schemaVersion: GraphSchema.VERSION,
      promptVersion: GraphSchema.PROMPT_VERSION,
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint: storedFingerprint,
      fragmentGenerationId,
      providerId: 'xai',
      modelId: 'synthetic-model',
      records: [],
      relations: []
    }));
  }

  let operationSequence = 0;
  let queryScopes = 0;
  let queryReleases = 0;
  let querySnapshots = 0;
  let fallbackCalls = 0;
  const trace = [];
  const runCorpusOperation = async (kind, tuple, selection, callback) => {
    operationSequence += 1;
    trace.push({ type: 'operation', kind, tuple, selection });
    const selected = selection.sourceFileIds.slice();
    let selectedCertificates = selected.map((sourceFileId) => {
      const sourceState = options.sourceStates?.[sourceFileId] || 'ready';
      const fingerprint = sourceState === 'ready'
        ? (options.certificateFingerprint || storedFingerprint)
        : null;
      return certificate(sourceFileId, operationSequence, fingerprint, sourceState);
    });
    if (options.incompleteProof) selectedCertificates = selectedCertificates.slice(0, -1);
    if (options.extraCertificate) {
      selectedCertificates.push(certificate(
        'source-extraneous', operationSequence, storedFingerprint, 'ready'));
    }
    const proof = frozen([['complete', options.incompleteProof !== true]]);
    const controller = new AbortController();
    let value;
    try {
      value = await callback(Object.freeze(selectedCertificates), proof, controller.signal);
    } catch (_error) {
      return frozen([['decision', 'closed']]);
    }
    if (options.closeAfterCallback) return frozen([['decision', 'closed']]);
    return frozen([['decision', 'admitted'], ['value', value]]);
  };

  const graphStore = Object.freeze({
    issueMutation(signal) { return Object.freeze({ signal }); },
    finishMutation() { return frozen([['ok', true], ['status', 'finished']]); },
    async withdrawSource() { return frozen([['ok', true], ['status', 'withheld']]); },
    async withdrawSourceIfCurrent() {
      return frozen([['ok', true], ['status', 'superseded']]);
    },
    async beginReplacement() { return frozen([['status', 'closed']]); },
    async stageBatch() { return frozen([['status', 'closed']]); },
    async sealStaging() { return frozen([['status', 'closed']]); },
    async publishReplacement() { return frozen([['status', 'closed']]); },
    async replaceCandidateRelations() { return frozen([['status', 'closed']]); },
    async inspectMetadata(input) {
      const fragment = fragments.get(input.sourceFileId);
      if (!fragment) return null;
      return frozen([
        ['version', 1], ['state', 'published'], ['schemaVersion', GraphSchema.VERSION],
        ['promptVersion', GraphSchema.PROMPT_VERSION],
        ['fragmentGenerationId', options.metadataGenerationDrift
          ? `sfg1:${'f'.repeat(64)}` : fragment.fragmentGenerationId],
        ['activeGenerationId', fragment.fragmentGenerationId],
        ['contentFingerprint', fragment.contentFingerprint],
        ['recordCount', 0], ['relationCount', 0]
      ]);
    },
    async readCurrentFragment(input) {
      const fragment = fragments.get(input.sourceFileId);
      if (!fragment || options.readGenerationDrift ||
          fragment.fragmentGenerationId !== input.fragmentGenerationId) return null;
      return fragment;
    }
  });

  const graphExtractor = Object.freeze({
    async prepareSource() { return null; },
    async verifyProviderBinding() { return null; },
    async nextBatch() { return null; },
    async repairBatch() { return null; },
    async finalize() { return null; },
    async reuseKey() { return null; },
    discard() {}
  });

  function baseSnapshot() {
    return deepFreeze({
      snapshotVersion: 'skopeo-graph-exact-set/1',
      partitionKey: PARTITION,
      sourceBindings: Array.from(fragments.values()).map(fragment => ({
        sourceFileId: fragment.sourceFileId,
        contentFingerprint: fragment.contentFingerprint,
        fragmentGenerationId: fragment.fragmentGenerationId
      })).sort((left, right) => left.sourceFileId.localeCompare(right.sourceFileId)),
      records: [],
      relations: []
    });
  }

  const graphQuery = Object.freeze({
    createScope(input) {
      queryScopes += 1;
      return deepFreeze({ input, ordinal: queryScopes });
    },
    async ensureScopeCache() {
      return options.ensureClosed
        ? frozen([['status', 'closed']])
        : frozen([['status', 'ready']]);
    },
    async snapshotExactSet() {
      querySnapshots += 1;
      if (options.snapshotThrows) throw new Error('synthetic snapshot failure');
      const snapshot = baseSnapshot();
      return typeof options.snapshotOverride === 'function'
        ? options.snapshotOverride(snapshot) : snapshot;
    },
    async getById() { fallbackCalls += 1; throw new Error('snapshot getById fallback'); },
    async searchLexical() { fallbackCalls += 1; throw new Error('snapshot search fallback'); },
    async neighbors() { fallbackCalls += 1; throw new Error('snapshot traversal fallback'); },
    async inspectProvenance() {
      fallbackCalls += 1;
      throw new Error('snapshot provenance fallback');
    },
    releaseScope() { queryReleases += 1; return true; }
  });

  const facade = GraphEngine.create({
    graphSchema: GraphSchema,
    graphStore,
    graphExtractor,
    graphQuery,
    corpusTransport: Object.freeze({ async readContent() { return null; } }),
    runCorpusOperation,
    readSettings: async () => ({ modelProvider: 'xai', modelName: 'synthetic-model' }),
    providerFactory: () => Object.freeze({}),
    now: () => NOW
  });
  return {
    facade,
    trace,
    fragments,
    metrics: () => ({
      queryScopes,
      queryReleases,
      querySnapshots,
      fallbackCalls
    })
  };
}

function hasGraphCollection(value) {
  return !!value && typeof value === 'object' &&
    (Object.prototype.hasOwnProperty.call(value, 'records') ||
      Object.prototype.hasOwnProperty.call(value, 'relations'));
}

async function testSnapshotExactSetRuntimeContract() {
  const preflight = runtimeHarness();
  if (!preflight.facade || typeof preflight.facade.snapshotExactSet !== 'function') {
    throw new Error('skopeo graph runtime snapshotExactSet contract');
  }

  const tuple = deepFreeze({ tabId: 10 });
  const first = await snapshotRuntimeHarness({
    sourceFileIds: ['source-B', 'source-A']
  });
  const firstResult = await first.facade.snapshotExactSet(tuple, deepFreeze({
    sourceFileIds: ['source-B', 'source-A']
  }));
  assert.strictEqual(firstResult.decision, 'admitted');
  assert.strictEqual(firstResult.value.snapshotVersion, 'skopeo-graph-exact-set/1');
  assert.match(firstResult.value.authorizedSetDigest, /^sgx1:[0-9a-f]{64}$/);
  assert.deepStrictEqual(firstResult.value.sourceBindings.map(binding => binding.sourceFileId),
    ['source-A', 'source-B'], 'runtime canonicalizes the exact certificate/source set');
  assert.ok(firstResult.value.sourceBindings.every(binding =>
    binding.sourceState === 'ready' && binding.certificationStatus === 'certified' &&
    binding.graphCurrent === true
  ), 'source access and graph currency remain explicit and separate from claim trust');
  assert.strictEqual(Object.isFrozen(firstResult.value), true);
  assert.strictEqual(first.metrics().queryScopes, 1);
  assert.strictEqual(first.metrics().querySnapshots, 1);
  assert.strictEqual(first.metrics().queryReleases, 1,
    'success releases the one opaque exact query scope');
  assert.strictEqual(first.metrics().fallbackCalls, 0,
    'snapshot completeness never falls back to lookup, lexical search, traversal, or top-N');
  assert.deepStrictEqual(first.trace.map(entry => entry.kind), ['query'],
    'snapshot enters exactly one fresh Phase 54 query operation');

  const permutation = await snapshotRuntimeHarness({
    sourceFileIds: ['source-A', 'source-B']
  });
  const permutationResult = await permutation.facade.snapshotExactSet(tuple, deepFreeze({
    sourceFileIds: ['source-A', 'source-B']
  }));
  assert.strictEqual(permutationResult.value.authorizedSetDigest,
    firstResult.value.authorizedSetDigest,
  'filename, timestamp, label similarity, source order, and result position do not enter the digest');
  assert.strictEqual(JSON.stringify(permutationResult.value), JSON.stringify(firstResult.value),
    'input permutation produces one byte-identical authorized snapshot');

  const duplicate = await snapshotRuntimeHarness();
  assert.strictEqual((await duplicate.facade.snapshotExactSet(tuple, deepFreeze({
    sourceFileIds: [SOURCE, SOURCE]
  }))).decision, 'closed');
  assert.strictEqual(duplicate.trace.length, 0,
    'duplicate selection closes before authority or graph access');

  const thirtyThreeIds = Array.from({ length: 33 }, (_, index) => `source-${index}`);
  const overSourceCap = await snapshotRuntimeHarness({ sourceFileIds: thirtyThreeIds });
  assert.strictEqual((await overSourceCap.facade.snapshotExactSet(tuple, deepFreeze({
    sourceFileIds: thirtyThreeIds
  }))).decision, 'closed');
  assert.strictEqual(overSourceCap.trace.length, 0,
    'source-set max-plus-one returns no prefix and performs no authority operation');

  const thirtyTwoIds = thirtyThreeIds.slice(0, 32);
  const atSourceCap = await snapshotRuntimeHarness({ sourceFileIds: thirtyTwoIds });
  const atSourceCapResult = await atSourceCap.facade.snapshotExactSet(tuple, deepFreeze({
    sourceFileIds: thirtyTwoIds.slice().reverse()
  }));
  assert.strictEqual(atSourceCapResult.value.sourceBindings.length, 32,
    'the exact 32-source maximum returns the complete canonical set');

  for (const setup of [
    { name: 'incomplete authority', options: { incompleteProof: true } },
    { name: 'extraneous certificate', options: { extraCertificate: true } },
    { name: 'stale fingerprint', options: {
      certificateFingerprint: `sha256:${'b'.repeat(64)}`
    } },
    { name: 'stale metadata generation', options: { metadataGenerationDrift: true } },
    { name: 'stale fragment generation', options: { readGenerationDrift: true } },
    { name: 'closed cache ensure', options: { ensureClosed: true } },
    { name: 'final authority drift', options: { closeAfterCallback: true } },
    { name: 'snapshot failure', options: { snapshotThrows: true } }
  ]) {
    const fixture = await snapshotRuntimeHarness(setup.options);
    const result = await fixture.facade.snapshotExactSet(tuple, deepFreeze({
      sourceFileIds: [SOURCE]
    }));
    assert.equal(hasGraphCollection(result && result.value), false,
      `${setup.name} returns no partial graph collection`);
    assert.strictEqual(fixture.metrics().fallbackCalls, 0,
      `${setup.name} never uses search/traversal as completeness authority`);
    assert.strictEqual(fixture.metrics().queryReleases, fixture.metrics().queryScopes,
      `${setup.name} releases every scope it creates`);
  }

  for (const [state, blocker] of [
    ['unreadable', 'source-unreadable'],
    ['download-blocked', 'source-unreadable'],
    ['pending', 'source-unavailable'],
    ['inaccessible', 'source-unavailable'],
    ['missing', 'source-unavailable']
  ]) {
    const fixture = await snapshotRuntimeHarness({
      sourceStates: { [SOURCE]: state }
    });
    const result = await fixture.facade.snapshotExactSet(tuple, deepFreeze({
      sourceFileIds: [SOURCE]
    }));
    assert.strictEqual(result.decision, 'admitted');
    assert.equal(hasGraphCollection(result.value), false,
      `${state} yields a canonical no-record blocker`);
    assert.strictEqual(result.value.reason, blocker);
    assert.deepStrictEqual(result.value.sourceBindings.map(binding => ({
      sourceFileId: binding.sourceFileId,
      sourceState: binding.sourceState
    })), [{ sourceFileId: SOURCE, sourceState: state }]);
    assert.strictEqual(JSON.stringify(result).includes('Synthetic source'), false,
      'blockers expose no filename, URL, label, or graph record');
    assert.strictEqual(fixture.metrics().queryScopes, 0,
      `${state} never asks the graph layer for a partial set`);
  }

  {
    const fixture = await snapshotRuntimeHarness({
      snapshotOverride(snapshot) {
        return deepFreeze(Object.assign({}, snapshot, {
          relations: [{
            relationClass: 'cross-document-candidate',
            partitionKey: PARTITION,
            sourceFileId: SOURCE,
            fragmentGenerationId: snapshot.sourceBindings[0].fragmentGenerationId,
            predicate: 'references-policy',
            fromSourceFileId: SOURCE,
            fromFragmentGenerationId: snapshot.sourceBindings[0].fragmentGenerationId,
            fromStableRecordId: `sri1:${'1'.repeat(64)}`,
            fromRecordVersionId: `srv1:${'2'.repeat(64)}`,
            toSourceFileId: 'foreign-source',
            toFragmentGenerationId: `sfg1:${'3'.repeat(64)}`,
            toStableRecordId: `sri1:${'4'.repeat(64)}`,
            toRecordVersionId: `srv1:${'5'.repeat(64)}`,
            evidence: [],
            stableRelationId: `srl1:${'6'.repeat(64)}`,
            relationVersionId: `scv1:${'7'.repeat(64)}`,
            candidateOnly: true
          }]
        }));
      }
    });
    const result = await fixture.facade.snapshotExactSet(tuple, deepFreeze({
      sourceFileIds: [SOURCE]
    }));
    assert.equal(hasGraphCollection(result && result.value), false,
      'foreign or drifted candidate endpoints reject the whole graph snapshot');
    assert.strictEqual(fixture.metrics().queryReleases, 1);
  }

  const engineSource = fs.readFileSync(ENGINE_PATH, 'utf8');
  assert.match(engineSource, /snapshotExactSet/);
  assert.strictEqual(/readActiveShards/.test(engineSource), false,
    'the engine cannot enumerate graph storage directly');
  const snapshotStart = engineSource.indexOf('async function snapshotExactSet');
  const snapshotEnd = engineSource.indexOf('\n    function getById', snapshotStart);
  const snapshotSource = engineSource.slice(snapshotStart, snapshotEnd);
  assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart);
  assert.strictEqual(
    /graphQuery\.(?:searchLexical|neighbors|getById)\s*\(/.test(snapshotSource),
    false,
    'the exact-set method has no lexical, traversal, lookup, or top-N fallback');
}

(async () => {
  testTruthIntegrationContract();
  testStaticBootContract();
  await testStaticMutationFixtures();
  await testBuildAndQueryContract();
  await testFreshFingerprintFencesStaleFragments();
  await testSupersededStaleFencesPreserveConcurrentPublication();
  await testSnapshotExactSetRuntimeContract();
  console.log('skopeo graph runtime contract: PASS');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
