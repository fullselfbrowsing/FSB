'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const QUERY_PATH = path.join(ROOT, 'extension/utils/skopeo-graph-query.js');
const GRAPH_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-graph-schema.js');
const GRAPH_STORE_PATH = path.join(ROOT, 'extension/utils/skopeo-graph-store.js');
const CORPUS_SCHEMA_PATH = path.join(ROOT, 'extension/utils/skopeo-corpus-schema.js');

if (!fs.existsSync(QUERY_PATH)) {
  throw new Error('FsbSkopeoGraphQuery is missing: skopeo-graph-query contract is RED');
}

const validatorSource = fs.readFileSync(
  path.join(ROOT, 'extension/lib/cfworker-json-schema.min.js'), 'utf8');
if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);
const MiniSearch = require(path.join(ROOT, 'extension/lib/minisearch.min.js'));
globalThis.MiniSearch = MiniSearch;
const graphSchema = require(GRAPH_SCHEMA_PATH);
const corpusSchema = require(CORPUS_SCHEMA_PATH);
const graphStoreApi = require(GRAPH_STORE_PATH);
const graphQueryApi = require(QUERY_PATH);

const CLAIM_A = Object.freeze({ accountPermissionId: 'account-A', corpusRootFileId: 'corpus-A' });
const CLAIM_B = Object.freeze({ accountPermissionId: 'account-B', corpusRootFileId: 'corpus-B' });
const PARTITION_A = corpusSchema.makePartitionKey(CLAIM_A);
const PARTITION_B = corpusSchema.makePartitionKey(CLAIM_B);
const SOURCE_A = 'source-alpha';
const SOURCE_B = 'source-beta';
const SOURCE_C = 'source-charlie';
const FINGERPRINT_A = `sha256:${'a'.repeat(64)}`;
const FINGERPRINT_B = `sha256:${'b'.repeat(64)}`;
const FINGERPRINT_B2 = `sha256:${'d'.repeat(64)}`;
const FINGERPRINT_C = `sha256:${'c'.repeat(64)}`;
const PROVIDER = 'openai-compatible';
const MODEL = 'local-model-v1';
const DERIVED_PARTY = 'Acme Northwind Party';
const DERIVED_PERSON = 'Alice Example Person';
const DERIVED_VENDOR = 'Contoso Vendor Policy';
const RAW_CONFIDENTIAL = 'RAW-CONFIDENTIAL-CUSTOMER-CONTRACT-MARKER';
const STORAGE_MARKER = 'fsbSkopeoGraph:1:';

function clone(value) {
  return structuredClone(value);
}

function bytes(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

function frozenRecord(entries) {
  const output = Object.create(null);
  for (const [key, value] of entries) output[key] = value;
  return Object.freeze(output);
}

function exactKeys(value, expected, message) {
  assert.deepEqual(Object.keys(value).sort(), expected.slice().sort(), message);
}

function createStorage(initial = {}) {
  const values = clone(initial);
  return {
    values,
    storageArea: {
      async get(keys) {
        if (keys === null || keys === undefined) return clone(values);
        const result = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (Object.prototype.hasOwnProperty.call(values, key)) result[key] = clone(values[key]);
        }
        return result;
      },
      async set(update) {
        for (const [key, value] of Object.entries(update || {})) values[key] = clone(value);
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
      async getBytesInUse(keys) {
        const selected = keys === null || keys === undefined
          ? values
          : Object.fromEntries((Array.isArray(keys) ? keys : [keys])
            .filter(key => Object.prototype.hasOwnProperty.call(values, key))
            .map(key => [key, values[key]]));
        return Buffer.byteLength(JSON.stringify(selected), 'utf8');
      }
    }
  };
}

function createStoreHarness(initial = {}) {
  const storage = createStorage(initial);
  const store = graphStoreApi.create({
    storageArea: storage.storageArea,
    graphSchema,
    corpusSchema,
    now: () => 1700000000000
  });
  return { ...storage, store };
}

async function mutate(store, work) {
  const controller = new AbortController();
  const guard = store.issueMutation(controller.signal);
  assert.ok(guard, 'real graph store issues a mutation guard');
  try {
    return await work(guard);
  } finally {
    assert.equal(store.finishMutation(guard).status, 'finished', 'mutation finishes terminally');
  }
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

async function makeFixture({ partitionKey, sourceFileId, contentFingerprint, records, relations }) {
  const text = '0123456789'.repeat(80);
  const fragmentGenerationId = await graphSchema.deriveFragmentGenerationId({
    schemaVersion: graphSchema.VERSION,
    partitionKey,
    sourceFileId,
    contentFingerprint
  });
  const modelRecords = records.map((record, index) => ({
    candidateRef: record.ref,
    kind: record.kind,
    label: record.label,
    evidence: [{ excerptId: 'excerpt_main', start: index * 2, end: index * 2 + 1 }]
  }));
  const modelRelations = relations.map((relation, index) => ({
    fromCandidateRef: relation.from,
    predicate: relation.predicate,
    toCandidateRef: relation.to,
    evidence: [{ excerptId: 'excerpt_main', start: 200 + index * 2, end: 201 + index * 2 }]
  }));
  const parsed = await graphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: `batch_${sourceFileId.replace(/-/g, '_')}_0001`,
    records: modelRecords,
    relations: modelRelations
  }, {
    partitionKey,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'excerpt_main',
      text,
      sourceByteStart: 100,
      sourceByteEnd: 100 + Buffer.byteLength(text, 'utf8')
    }],
    batchOrdinal: 0,
    priorCandidates: []
  });
  assert.ok(parsed, `real schema admits ${sourceFileId} fixture`);
  const durableRecords = parsed.records.map(durableRecord);
  const fragment = await graphSchema.parseFragment({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    providerId: PROVIDER,
    modelId: MODEL,
    records: durableRecords,
    relations: parsed.relations
  });
  assert.ok(fragment, `real schema creates ${sourceFileId} fragment`);
  const lexicalShards = [graphSchema.parseLexicalShard({
    schemaVersion: graphSchema.VERSION,
    partitionKey,
    sourceFileId,
    fragmentGenerationId,
    shardOrdinal: 0,
    postings: durableRecords.map(record => ({
      term: record.label.toLowerCase(),
      stableRecordId: record.stableRecordId,
      recordVersionId: record.recordVersionId
    }))
  })];
  const adjacencyEntries = [];
  for (const relation of parsed.relations) {
    adjacencyEntries.push({
      stableRecordId: relation.fromStableRecordId,
      relationVersionId: relation.relationVersionId,
      direction: 'out'
    }, {
      stableRecordId: relation.toStableRecordId,
      relationVersionId: relation.relationVersionId,
      direction: 'in'
    });
  }
  const adjacencyShards = [graphSchema.parseAdjacencyShard({
    schemaVersion: graphSchema.VERSION,
    partitionKey,
    sourceFileId,
    fragmentGenerationId,
    shardOrdinal: 0,
    entries: adjacencyEntries
  })];
  const byRef = Object.create(null);
  records.forEach((record, index) => { byRef[record.ref] = durableRecords[index]; });
  return {
    fragment,
    lexicalShards,
    adjacencyShards,
    resultCacheShards: [],
    byRef,
    batch: {
      schemaVersion: graphSchema.VERSION,
      promptVersion: graphSchema.PROMPT_VERSION,
      partitionKey,
      sourceFileId,
      contentFingerprint,
      fragmentGenerationId,
      providerId: PROVIDER,
      modelId: MODEL,
      batchOrdinal: 0,
      records: durableRecords,
      relations: parsed.relations
    }
  };
}

async function publish(store, fixture) {
  const handle = await mutate(store, guard => store.beginReplacement({
    schemaVersion: graphSchema.VERSION,
    promptVersion: graphSchema.PROMPT_VERSION,
    partitionKey: fixture.fragment.partitionKey,
    sourceFileId: fixture.fragment.sourceFileId,
    contentFingerprint: fixture.fragment.contentFingerprint,
    providerId: fixture.fragment.providerId,
    modelId: fixture.fragment.modelId
  }, guard));
  assert.equal(handle.status, 'staging');
  assert.equal((await mutate(store, guard => store.stageBatch(handle, fixture.batch, guard))).status,
    'staged');
  assert.equal((await mutate(store, guard => store.sealStaging(handle, {
    fragment: fixture.fragment,
    lexicalShards: fixture.lexicalShards,
    adjacencyShards: fixture.adjacencyShards,
    resultCacheShards: fixture.resultCacheShards
  }, guard))).status, 'sealed');
  assert.equal((await mutate(store, guard => store.publishReplacement(handle, guard))).status,
    'published');
}

async function candidateRelation(proposer, fromRef, target, toRef) {
  const from = proposer.byRef[fromRef];
  const to = target.byRef[toRef];
  const evidence = from.evidence;
  const stableRelationId = await graphSchema.deriveStableRelationId({
    identityVersion: graphSchema.IDENTITY_VERSION,
    partitionKey: proposer.fragment.partitionKey,
    sourceFileId: proposer.fragment.sourceFileId,
    predicate: 'references-policy',
    fromStableRecordId: from.stableRecordId,
    toStableRecordId: to.stableRecordId,
    primaryLocator: {
      sourceByteStart: evidence[0].sourceByteStart,
      sourceByteEnd: evidence[0].sourceByteEnd
    }
  });
  const evidenceIdentity = graphSchema.canonicalize(evidence.map(locator => ({
    locatorId: locator.locatorId,
    sourceByteStart: locator.sourceByteStart,
    sourceByteEnd: locator.sourceByteEnd
  })));
  const relationVersionId = await graphSchema.deriveRelationVersionId({
    relationClass: 'cross-document-candidate',
    partitionKey: proposer.fragment.partitionKey,
    relationKind: 'references-policy',
    stableRelationId,
    proposerRecordVersionId: from.recordVersionId,
    proposerFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetRecordVersionId: to.recordVersionId,
    targetFragmentGenerationId: target.fragment.fragmentGenerationId,
    canonicalEvidenceLocatorIdentity: evidenceIdentity
  });
  return graphSchema.parseCandidateRelation({
    schemaVersion: graphSchema.VERSION,
    relationClass: 'cross-document-candidate',
    partitionKey: proposer.fragment.partitionKey,
    relationKind: 'references-policy',
    proposingSourceFileId: proposer.fragment.sourceFileId,
    targetSourceFileId: target.fragment.sourceFileId,
    fromStableRecordId: from.stableRecordId,
    toStableRecordId: to.stableRecordId,
    stableRelationId,
    proposerRecordVersionId: from.recordVersionId,
    proposerFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetRecordVersionId: to.recordVersionId,
    targetFragmentGenerationId: target.fragment.fragmentGenerationId,
    evidence,
    canonicalEvidenceLocatorIdentity: evidenceIdentity,
    relationVersionId
  });
}

async function publishOverlay(store, proposer, target, relation) {
  const value = {
    schemaVersion: graphSchema.VERSION,
    partitionKey: proposer.fragment.partitionKey,
    proposingSourceFileId: proposer.fragment.sourceFileId,
    proposingFragmentGenerationId: proposer.fragment.fragmentGenerationId,
    targetGenerations: [{
      sourceFileId: target.fragment.sourceFileId,
      fragmentGenerationId: target.fragment.fragmentGenerationId
    }],
    relations: [relation]
  };
  value.overlayGenerationId = await graphSchema.deriveCandidateOverlayGenerationId({
    schemaVersion: graphSchema.VERSION,
    partitionKey: value.partitionKey,
    proposingSourceFileId: value.proposingSourceFileId,
    proposingFragmentGenerationId: value.proposingFragmentGenerationId,
    relations: value.relations
  });
  assert.equal((await mutate(store, guard => store.replaceCandidateRelations(value, guard))).status,
    'published');
  return value.overlayGenerationId;
}

function countedStore(store) {
  const reads = { fragment: 0, shards: 0 };
  return {
    reads,
    view: Object.freeze({
      async readCurrentFragment(input) {
        reads.fragment += 1;
        return store.readCurrentFragment(input);
      },
      async readActiveShards(input) {
        reads.shards += 1;
        return store.readActiveShards(input);
      },
      registerCacheOwner: store.registerCacheOwner
    })
  };
}

function exactPair(fixture) {
  return {
    sourceFileId: fixture.fragment.sourceFileId,
    fragmentGenerationId: fixture.fragment.fragmentGenerationId
  };
}

function getInput(record) {
  return {
    sourceFileId: record.sourceFileId,
    fragmentGenerationId: record.fragmentGenerationId,
    stableRecordId: record.stableRecordId
  };
}

function neighborInput(record, overrides = {}) {
  return {
    sourceFileId: record.sourceFileId,
    fragmentGenerationId: record.fragmentGenerationId,
    stableRecordId: record.stableRecordId,
    predicate: 'references-policy',
    direction: 'both',
    depth: 2,
    nodeLimit: 64,
    edgeLimit: 128,
    ...overrides
  };
}

function provenanceInput(record) {
  return {
    sourceFileId: record.sourceFileId,
    fragmentGenerationId: record.fragmentGenerationId,
    entityType: 'record',
    entityId: record.stableRecordId
  };
}

function assertFrozenTree(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, 'projection node is frozen');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      assertFrozenTree(descriptor.value);
    }
  }
}

function markerLocations(value, marker, trail = [], output = []) {
  if (typeof value === 'string' && value.includes(marker)) output.push(trail.join('.'));
  if (!value || typeof value !== 'object') return output;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      markerLocations(descriptor.value, marker, trail.concat(key), output);
    }
  }
  return output;
}

async function buildRealCorpus() {
  const harness = createStoreHarness();
  const sourceA = await makeFixture({
    partitionKey: PARTITION_A,
    sourceFileId: SOURCE_A,
    contentFingerprint: FINGERPRINT_A,
    records: [
      { ref: 'agreement', kind: 'agreement', label: DERIVED_PARTY },
      { ref: 'amendment', kind: 'amendment', label: 'First Amendment' },
      { ref: 'clause', kind: 'clause', label: 'Qualified Sales Clause' },
      { ref: 'fact', kind: 'fact', label: 'Renewal Fact' },
      { ref: 'event', kind: 'event', label: 'Execution Event' },
      { ref: 'owner', kind: 'owner', label: DERIVED_PERSON },
      { ref: 'policy', kind: 'policy-document', label: 'Local Policy' },
      { ref: 'policy2', kind: 'policy-document', label: 'Second Local Policy' },
      { ref: 'memo', kind: 'memo', label: 'Review Memo' },
      { ref: 'tie_a', kind: 'agreement', label: 'Twin Vendor' },
      { ref: 'tie_b', kind: 'owner', label: 'Twin Vendor' }
    ],
    relations: [
      { from: 'agreement', predicate: 'contains', to: 'clause' },
      { from: 'amendment', predicate: 'amends-candidate', to: 'agreement' },
      { from: 'agreement', predicate: 'states-fact', to: 'fact' },
      { from: 'agreement', predicate: 'records-event', to: 'event' },
      { from: 'agreement', predicate: 'assigned-owner', to: 'owner' },
      { from: 'agreement', predicate: 'references-policy', to: 'policy' },
      { from: 'agreement', predicate: 'references-memo', to: 'memo' },
      { from: 'policy', predicate: 'references-policy', to: 'policy2' },
      { from: 'policy2', predicate: 'references-policy', to: 'policy' }
    ]
  });
  const sourceB = await makeFixture({
    partitionKey: PARTITION_A,
    sourceFileId: SOURCE_B,
    contentFingerprint: FINGERPRINT_B,
    records: [{ ref: 'target', kind: 'policy-document', label: DERIVED_VENDOR }],
    relations: []
  });
  const sourceC = await makeFixture({
    partitionKey: PARTITION_B,
    sourceFileId: SOURCE_C,
    contentFingerprint: FINGERPRINT_C,
    records: [{ ref: 'foreign', kind: 'owner', label: 'Foreign Partition Person' }],
    relations: []
  });
  await publish(harness.store, sourceA);
  await publish(harness.store, sourceB);
  await publish(harness.store, sourceC);
  const candidate = await candidateRelation(sourceA, 'agreement', sourceB, 'target');
  const overlayGenerationId = await publishOverlay(harness.store, sourceA, sourceB, candidate);
  return { harness, sourceA, sourceB, sourceC, candidate, overlayGenerationId };
}

async function testRealStoreAuthorizationQueriesAndRebuild() {
  const corpus = await buildRealCorpus();
  const counted = countedStore(corpus.harness.store);
  const query = graphQueryApi.create({
    graphSchema,
    graphStore: counted.view,
    MiniSearch,
    byteLength: bytes
  });

  assert.deepEqual(Object.keys(graphQueryApi).sort(), ['LIMITS', 'VERSION', 'create'],
    'query module exposes only version, limits, and create');
  assert.equal(globalThis.FsbSkopeoGraphQuery, graphQueryApi,
    'classic-script and CommonJS exports share one query API');
  assert.equal(Object.isFrozen(graphQueryApi), true, 'module API is frozen');
  assert.deepEqual(graphQueryApi.LIMITS, frozenRecord([
    ['MAX_SOURCE_GENERATIONS', 32],
    ['MAX_QUERY_CHARACTERS', 512],
    ['MAX_LEXICAL_RESULTS', 20],
    ['MAX_TRAVERSAL_DEPTH', 2],
    ['MAX_TRAVERSAL_NODES', 64],
    ['MAX_TRAVERSAL_EDGES', 128],
    ['MAX_PROVENANCE_LOCATORS', 4],
    ['MAX_RESULT_BYTES', 65536],
    ['MAX_PARTITION_CACHES', 4],
    ['MAX_INDEXED_RECORDS', 4096],
    ['MAX_SNAPSHOT_RECORDS', 4096],
    ['MAX_SNAPSHOT_RELATIONS', 16384],
    ['MAX_SNAPSHOT_EVIDENCE', 65536],
    ['MAX_SNAPSHOT_BYTES', 8388608]
  ]), 'all fixed query limits are exact');
  assert.deepEqual(Object.keys(query).sort(), [
    'cacheOwner', 'createScope', 'ensureScopeCache', 'getById', 'inspectProvenance',
    'neighbors', 'releaseScope', 'searchLexical', 'snapshotExactSet'
  ].sort(), 'created query owner has the exact closed surface');
  assert.equal(Object.isFrozen(query), true, 'created query owner is frozen');
  assert.deepEqual(counted.reads, { fragment: 0, shards: 0 },
    'construction performs zero current-fragment or shard reads');
  assert.equal(corpus.harness.store.registerCacheOwner(query.cacheOwner).status, 'registered',
    'the exact cache owner registers once with the real store');
  assert.deepEqual(counted.reads, { fragment: 0, shards: 0 },
    'cache-owner registration performs zero hydration reads');

  const scopeAB = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceB), exactPair(corpus.sourceA)]
  });
  assert.ok(scopeAB && Object.isFrozen(scopeAB), 'a sorted exact set mints a frozen scope proxy');
  assert.throws(() => JSON.stringify(scopeAB), /scope/i, 'scope refuses JSON serialization');
  assert.throws(() => structuredClone(scopeAB), /clone|serial|scope/i,
    'scope refuses structured cloning');
  assert.deepEqual(counted.reads, { fragment: 0, shards: 0 },
    'scope minting does not hydrate or read current fingerprints');
  assert.equal((await query.ensureScopeCache(scopeAB)).status, 'ready',
    'the first explicit ensure lazily reconstructs the exact authorized cache');
  assert.ok(counted.reads.fragment >= 4 && counted.reads.shards === 2,
    'ensure alone performs bounded before/shard/after reads for the exact set');

  const agreement = corpus.sourceA.byRef.agreement;
  const lookup = await query.getById(scopeAB, getInput(agreement));
  assert.equal(lookup.label, DERIVED_PARTY, 'exact lookup projects the schema-valid derived party label');
  assert.deepEqual(Object.keys(lookup).sort(), [
    'fragmentGenerationId', 'kind', 'label', 'recordVersionId', 'sourceFileId', 'stableRecordId'
  ].sort(), 'exact lookup is a minimized allowlisted projection');
  assertFrozenTree(lookup);

  const nameSearch = await query.searchLexical(scopeAB, { query: DERIVED_VENDOR, topN: 20 });
  assert.equal(nameSearch.length, 1, 'fresh exact scope finds its source-owned vendor label');
  assert.equal(nameSearch[0].sourceFileId, SOURCE_B, 'lexical hit retains exact source ownership');
  assert.equal(nameSearch[0].label, DERIVED_VENDOR, 'lexical projection admits the authorized name label');
  assert.ok(nameSearch[0].score > 0, 'lexical result exposes only a finite relevance score');
  assertFrozenTree(nameSearch);

  const tieSearch = await query.searchLexical(scopeAB, { query: 'Twin Vendor', topN: 20 });
  assert.equal(tieSearch.length, 2, 'equal-label search returns both admitted records');
  assert.deepEqual(tieSearch.map(item => item.stableRecordId),
    tieSearch.map(item => item.stableRecordId).slice().sort(),
    'equal-score hits are ordered by stable record ID, never insertion order');

  for (const predicate of graphSchema.RELATION_PREDICATES) {
    const rootRef = predicate === 'amends-candidate' ? 'amendment' : 'agreement';
    const traversal = await query.neighbors(scopeAB, neighborInput(corpus.sourceA.byRef[rootRef], {
      predicate,
      direction: 'out',
      depth: 1
    }));
    assert.ok(traversal && traversal.edges.some(edge => edge.predicate === predicate),
      `${predicate} is the only allowlisted typed traversal form`);
  }
  for (const direction of ['out', 'in', 'both']) {
    const traversal = await query.neighbors(scopeAB, neighborInput(corpus.sourceA.byRef.policy, {
      direction,
      depth: 2
    }));
    assert.ok(traversal, `${direction} traversal terminates over a cycle`);
    assert.equal(new Set(traversal.nodes.map(node => node.stableRecordId)).size,
      traversal.nodes.length, `${direction} traversal suppresses cyclic node replay`);
  }

  const candidateTraversal = await query.neighbors(scopeAB, neighborInput(agreement, {
    predicate: 'references-policy', direction: 'out', depth: 1
  }));
  const candidateEdge = candidateTraversal.edges.find(edge => edge.candidateOnly === true);
  assert.ok(candidateEdge, 'cross-document candidate appears when both exact endpoint generations are in scope');
  assert.equal(candidateEdge.relationVersionId, corpus.candidate.relationVersionId,
    'candidate traversal retains its endpoint-version-bound relation ID');
  assert.equal(candidateEdge.provenance.sourceFileId, SOURCE_A,
    'candidate projection attributes evidence only to the proposing source');
  for (const forbidden of ['confidence', 'effective', 'governing', 'precedence', 'supersession', 'equivalent']) {
    assert.equal(JSON.stringify(candidateEdge).toLowerCase().includes(forbidden), false,
      `candidate projection makes no ${forbidden} inference`);
  }

  const relationProvenance = await query.inspectProvenance(scopeAB, {
    sourceFileId: SOURCE_A,
    fragmentGenerationId: corpus.sourceA.fragment.fragmentGenerationId,
    entityType: 'relation',
    entityId: corpus.candidate.relationVersionId
  });
  assert.equal(relationProvenance.candidateOnly, true,
    'candidate provenance remains explicitly candidate-only');
  assert.ok(relationProvenance.locators.length <= 4,
    'provenance projects at most four exact source locators');
  assert.deepEqual(Object.keys(relationProvenance.locators[0]).sort(),
    ['locatorId', 'sourceByteEnd', 'sourceByteStart'],
    'provenance omits excerpt text and internal locator coordinates');

  const recordProvenance = await query.inspectProvenance(scopeAB, provenanceInput(agreement));
  assert.equal(recordProvenance.entityType, 'record', 'record provenance is an exact typed lookup');
  assert.equal(recordProvenance.locators.length, 1, 'record provenance returns exact bounded evidence');

  const scopeA = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceA)]
  });
  assert.equal((await query.ensureScopeCache(scopeA)).status, 'ready');
  const aOnlyTraversal = await query.neighbors(scopeA, neighborInput(agreement, {
    predicate: 'references-policy', direction: 'out', depth: 1
  }));
  assert.equal(aOnlyTraversal.edges.some(edge => edge.candidateOnly), false,
    'candidate has zero influence when the target exact generation is absent from scope');
  assert.deepEqual(await query.searchLexical(scopeA, { query: DERIVED_VENDOR, topN: 20 }), [],
    'another source name cannot influence an exact one-source search');

  const scopeForeign = query.createScope({
    partitionKey: PARTITION_B,
    exactSourceGenerations: [exactPair(corpus.sourceC)]
  });
  assert.equal((await query.ensureScopeCache(scopeForeign)).status, 'ready');
  assert.deepEqual(await query.searchLexical(scopeForeign, { query: DERIVED_PARTY, topN: 20 }), [],
    'derived party label never crosses partition ownership');
  assert.equal(await query.getById(scopeForeign, getInput(agreement)), null,
    'record identity cannot cross a partition scope');

  assert.equal(markerLocations(corpus.harness.values, DERIVED_PARTY).every(pathName =>
    pathName.includes('fragment-record') || pathName.includes('lexical')), true,
  'durable name marker exists only in authoritative fragment and lexical pages');
  const authorizedOutputs = [lookup, nameSearch, tieSearch, candidateTraversal, relationProvenance];
  assert.ok(markerLocations(authorizedOutputs, DERIVED_PARTY).length > 0,
    'authorized bounded projections may contain the matching derived label');
  for (const output of authorizedOutputs) {
    const encoded = JSON.stringify(output);
    assert.equal(encoded.includes(RAW_CONFIDENTIAL), false, 'raw source markers never escape query output');
    assert.equal(encoded.includes(STORAGE_MARKER), false, 'storage keys never escape query output');
    assert.equal(encoded.includes(PROVIDER), false, 'provider payload identity never escapes query output');
    assert.equal(encoded.includes(FINGERPRINT_A), false, 'content fingerprint never escapes query output');
  }

  const firstSnapshot = JSON.stringify({
    lookup,
    search: await query.searchLexical(scopeA, { query: DERIVED_PARTY, topN: 20 }),
    neighbors: await query.neighbors(scopeA, neighborInput(agreement)),
    provenance: await query.inspectProvenance(scopeA, provenanceInput(agreement))
  });
  const freshStore = graphStoreApi.create({
    storageArea: corpus.harness.storageArea,
    graphSchema,
    corpusSchema,
    now: () => 1700000000000
  });
  const freshCounted = countedStore(freshStore);
  const freshQuery = graphQueryApi.create({
    graphSchema,
    graphStore: freshCounted.view,
    MiniSearch,
    byteLength: bytes
  });
  assert.equal(freshStore.registerCacheOwner(freshQuery.cacheOwner).status, 'registered');
  assert.deepEqual(freshCounted.reads, { fragment: 0, shards: 0 },
    'fresh MV3-style module recreation performs no unauthenticated hydration');
  const freshScope = freshQuery.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceA)]
  });
  assert.equal((await freshQuery.ensureScopeCache(freshScope)).status, 'ready');
  const rebuiltSnapshot = JSON.stringify({
    lookup: await freshQuery.getById(freshScope, getInput(agreement)),
    search: await freshQuery.searchLexical(freshScope, { query: DERIVED_PARTY, topN: 20 }),
    neighbors: await freshQuery.neighbors(freshScope, neighborInput(agreement)),
    provenance: await freshQuery.inspectProvenance(freshScope, provenanceInput(agreement))
  });
  assert.equal(rebuiltSnapshot, firstSnapshot,
    'fresh authorized lazy rebuild is byte-identical after cache loss');

  const advancedTarget = await makeFixture({
    partitionKey: PARTITION_A,
    sourceFileId: SOURCE_B,
    contentFingerprint: FINGERPRINT_B2,
    records: [{ ref: 'target', kind: 'policy-document', label: 'Contoso Vendor Policy Revised' }],
    relations: []
  });
  await publish(corpus.harness.store, advancedTarget);
  assert.equal(await query.getById(scopeAB, getInput(corpus.sourceB.byRef.target)), null,
    'target-only advance invalidates the old exact-set cache before stale lookup influence');
  const advancedCandidate = await candidateRelation(
    corpus.sourceA, 'agreement', advancedTarget, 'target');
  const advancedOverlayId = await publishOverlay(
    corpus.harness.store, corpus.sourceA, advancedTarget, advancedCandidate);
  assert.notEqual(advancedCandidate.relationVersionId, corpus.candidate.relationVersionId,
    'target-only advance creates a distinct deterministic candidate relation version');
  assert.notEqual(advancedOverlayId, corpus.overlayGenerationId,
    'target-only advance creates a distinct deterministic overlay generation');
  const advancedScope = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceA), exactPair(advancedTarget)]
  });
  assert.equal((await query.ensureScopeCache(advancedScope)).status, 'ready');
  const advancedTraversal = await query.neighbors(advancedScope, neighborInput(agreement, {
    predicate: 'references-policy', direction: 'out', depth: 1
  }));
  assert.ok(advancedTraversal.edges.some(edge =>
    edge.candidateOnly && edge.relationVersionId === advancedCandidate.relationVersionId),
  'new candidate appears only after the replacement endpoint generation is explicitly authorized');
  assert.equal(advancedTraversal.edges.some(edge =>
    edge.relationVersionId === corpus.candidate.relationVersionId), false,
  'old incoming candidate relation has zero influence after target-only advance');

  assert.equal((await mutate(corpus.harness.store, guard => corpus.harness.store.withdrawSource({
    partitionKey: PARTITION_A,
    sourceFileId: SOURCE_B,
    reason: 'access-revoked'
  }, guard))).status, 'withheld', 'target revocation completes source and cache absence');
  assert.equal(await query.neighbors(advancedScope, neighborInput(agreement)), null,
    'revocation closes the stale exact-set scope without revealing target existence');
  const unaffectedScope = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceA)]
  });
  assert.equal((await query.ensureScopeCache(unaffectedScope)).status, 'ready');
  assert.equal((await query.getById(unaffectedScope, getInput(agreement))).label, DERIVED_PARTY,
    'unaffected sibling truth remains available after target revocation and exact reauthorization');
}

function fakeId(prefix, number) {
  return `${prefix}${number.toString(16).padStart(64, '0')}`;
}

function fakeSource(
  partitionKey, sourceFileId, generationNumber, recordCount = 1, labelPrefix = 'Record', locatorCount = 1
) {
  const fragmentGenerationId = fakeId('sfg1:', generationNumber);
  const records = [];
  for (let index = 0; index < recordCount; index += 1) {
    records.push(Object.freeze({
      schemaVersion: graphSchema.VERSION,
      partitionKey,
      sourceFileId,
      contentFingerprint: `sha256:${'a'.repeat(63)}${(generationNumber % 16).toString(16)}`,
      fragmentGenerationId,
      kind: 'agreement',
      label: `${labelPrefix} ${String(index).padStart(4, '0')}`,
      evidence: Object.freeze(Array.from({ length: locatorCount }, (_, locatorIndex) => Object.freeze({
        locatorId: fakeId('sel1:', generationNumber * 100000 + index * 10 + locatorIndex + 1),
        sourceByteStart: index * 20 + locatorIndex * 2,
        sourceByteEnd: index * 20 + locatorIndex * 2 + 1
      }))),
      stableRecordId: fakeId('sri1:', generationNumber * 10000 + index + 1),
      recordVersionId: fakeId('srv1:', generationNumber * 10000 + index + 1)
    }));
  }
  return {
    pair: { sourceFileId, fragmentGenerationId },
    fragment: Object.freeze({
      schemaVersion: graphSchema.VERSION,
      promptVersion: graphSchema.PROMPT_VERSION,
      partitionKey,
      sourceFileId,
      contentFingerprint: `sha256:${'a'.repeat(63)}${(generationNumber % 16).toString(16)}`,
      fragmentGenerationId,
      providerId: PROVIDER,
      modelId: MODEL,
      records: Object.freeze(records),
      relations: Object.freeze([])
    }),
    shards: Object.freeze({
      lexicalShards: Object.freeze([Object.freeze({
        schemaVersion: graphSchema.VERSION,
        partitionKey,
        sourceFileId,
        fragmentGenerationId,
        shardOrdinal: 0,
        postings: Object.freeze(records.map(record => Object.freeze({
          term: record.label.toLowerCase(),
          stableRecordId: record.stableRecordId,
          recordVersionId: record.recordVersionId
        })))
      })]),
      adjacencyShards: Object.freeze([]),
      resultCacheShards: Object.freeze([]),
      candidateRelations: Object.freeze([])
    })
  };
}

function createFakeStore(sources) {
  const map = new Map();
  const calls = { fragment: 0, shards: 0 };
  for (const source of sources) {
    map.set(`${source.fragment.partitionKey}\u0000${source.fragment.sourceFileId}\u0000${source.fragment.fragmentGenerationId}`,
      source);
  }
  function item(input) {
    return map.get(`${input.partitionKey}\u0000${input.sourceFileId}\u0000${input.fragmentGenerationId}`) || null;
  }
  return {
    calls,
    store: Object.freeze({
      async readCurrentFragment(input) { calls.fragment += 1; return item(input)?.fragment || null; },
      async readActiveShards(input) { calls.shards += 1; return item(input)?.shards || null; }
    }),
    remove(source) {
      map.delete(`${source.fragment.partitionKey}\u0000${source.fragment.sourceFileId}\u0000${source.fragment.fragmentGenerationId}`);
    }
  };
}

function relationCapacitySource(relationCount, finalEvidenceCount = 2) {
  const base = fakeSource('partition-capacity', 'source-capacity', 9000, 2, 'Capacity');
  const records = [
    Object.freeze(Object.assign({}, base.fragment.records[0], {
      kind: 'agreement',
      label: 'Capacity Agreement'
    })),
    Object.freeze(Object.assign({}, base.fragment.records[1], {
      kind: 'clause',
      label: 'Capacity Clause'
    }))
  ];
  const relations = [];
  const adjacency = [];
  for (let index = 0; index < relationCount; index += 1) {
    const evidenceCount = index === relationCount - 1 ? finalEvidenceCount : 4;
    const relationVersionId = fakeId('slv1:', 2_000_000 + index);
    relations.push(Object.freeze({
      relationClass: 'local',
      schemaVersion: graphSchema.VERSION,
      partitionKey: base.fragment.partitionKey,
      sourceFileId: base.fragment.sourceFileId,
      fragmentGenerationId: base.fragment.fragmentGenerationId,
      predicate: 'contains',
      fromStableRecordId: records[0].stableRecordId,
      fromRecordVersionId: records[0].recordVersionId,
      toStableRecordId: records[1].stableRecordId,
      toRecordVersionId: records[1].recordVersionId,
      evidence: Object.freeze(Array.from({ length: evidenceCount }, (_, locatorIndex) =>
        Object.freeze({
          locatorId: fakeId('sel1:', 3_000_000 + index * 4 + locatorIndex),
          sourceByteStart: index * 10 + locatorIndex,
          sourceByteEnd: index * 10 + locatorIndex + 1
        }))),
      stableRelationId: fakeId('srl1:', 1_000_000 + index),
      relationVersionId
    }));
    adjacency.push(Object.freeze({
      stableRecordId: records[0].stableRecordId,
      relationVersionId,
      direction: 'out'
    }));
    adjacency.push(Object.freeze({
      stableRecordId: records[1].stableRecordId,
      relationVersionId,
      direction: 'in'
    }));
  }
  return {
    pair: base.pair,
    fragment: Object.freeze(Object.assign({}, base.fragment, {
      records: Object.freeze(records),
      relations: Object.freeze(relations)
    })),
    shards: Object.freeze({
      lexicalShards: base.shards.lexicalShards,
      adjacencyShards: Object.freeze([Object.freeze({
        schemaVersion: graphSchema.VERSION,
        partitionKey: base.fragment.partitionKey,
        sourceFileId: base.fragment.sourceFileId,
        fragmentGenerationId: base.fragment.fragmentGenerationId,
        shardOrdinal: 0,
        entries: Object.freeze(adjacency)
      })]),
      resultCacheShards: Object.freeze([]),
      candidateRelations: Object.freeze([])
    })
  };
}

async function fakeSnapshot(sources, byteLength = () => 1) {
  const fake = createFakeStore(sources);
  const query = graphQueryApi.create({
    graphSchema,
    graphStore: fake.store,
    MiniSearch,
    byteLength
  });
  const scope = query.createScope({
    partitionKey: sources[0].fragment.partitionKey,
    exactSourceGenerations: sources.map(source => source.pair).reverse()
  });
  if (!scope) return { query, fake, scope: null, ready: null, snapshot: null };
  const ready = await query.ensureScopeCache(scope);
  const snapshot = ready.status === 'ready' ? await query.snapshotExactSet(scope) : null;
  query.releaseScope(scope);
  return { query, fake, scope, ready, snapshot };
}

async function testBoundariesHostileInputsLruAndCacheOwner() {
  const sources = [];
  for (let index = 1; index <= 5; index += 1) {
    sources.push(fakeSource(`partition-${index}`, `source-${index}`, index));
  }
  const fake = createFakeStore(sources);
  const query = graphQueryApi.create({
    graphSchema,
    graphStore: fake.store,
    MiniSearch,
    byteLength: bytes
  });

  assert.equal(query.createScope({ partitionKey: 'p', exactSourceGenerations: [] }), null,
    'empty implicit-all scope is rejected before reads');
  const thirtyTwo = Array.from({ length: 32 }, (_, index) => ({
    sourceFileId: `source-max-${index}`,
    fragmentGenerationId: fakeId('sfg1:', 100 + index)
  }));
  assert.ok(query.createScope({ partitionKey: 'p-max', exactSourceGenerations: thirtyTwo }),
    'exactly 32 dense unique sources are admitted');
  assert.equal(query.createScope({
    partitionKey: 'p-over',
    exactSourceGenerations: thirtyTwo.concat({
      sourceFileId: 'source-over', fragmentGenerationId: fakeId('sfg1:', 999)
    })
  }), null, 'source-set max-plus-one rejects before reads');
  assert.equal(query.createScope({
    partitionKey: 'p', exactSourceGenerations: [thirtyTwo[0], thirtyTwo[0]]
  }), null, 'duplicate exact source generation is rejected');
  const sparse = new Array(1);
  assert.equal(query.createScope({ partitionKey: 'p', exactSourceGenerations: sparse }), null,
    'sparse source set is rejected without enumeration fallback');
  let getterReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'partitionKey', {
    enumerable: true,
    get() { getterReads += 1; return 'p'; }
  });
  Object.defineProperty(accessor, 'exactSourceGenerations', {
    enumerable: true,
    value: [thirtyTwo[0]]
  });
  assert.equal(query.createScope(accessor), null, 'accessor-bearing scope input is closed');
  assert.equal(getterReads, 0, 'scope parser never invokes accessors');
  assert.equal(fake.calls.fragment + fake.calls.shards, 0,
    'invalid scope inputs perform zero graph-store reads');

  const lruScopes = [];
  for (const source of sources) {
    const scope = query.createScope({
      partitionKey: source.fragment.partitionKey,
      exactSourceGenerations: [source.pair]
    });
    assert.equal((await query.ensureScopeCache(scope)).status, 'ready');
    lruScopes.push(scope);
  }
  assert.equal(await query.getById(lruScopes[0], getInput(sources[0].fragment.records[0])), null,
    'fifth partition evicts and closes the least-recently-used partition cache');
  assert.ok(await query.getById(lruScopes[4], getInput(sources[4].fragment.records[0])),
    'most recent partition cache remains live');

  const activeScope = lruScopes[4];
  const activeRecord = sources[4].fragment.records[0];
  let queryGetterReads = 0;
  const accessorLookup = {
    sourceFileId: activeRecord.sourceFileId,
    fragmentGenerationId: activeRecord.fragmentGenerationId
  };
  Object.defineProperty(accessorLookup, 'stableRecordId', {
    enumerable: true,
    get() { queryGetterReads += 1; return activeRecord.stableRecordId; }
  });
  assert.equal(await query.getById(activeScope, accessorLookup), null,
    'accessor-bearing query input fails closed');
  assert.equal(queryGetterReads, 0, 'query parser never invokes accessors');
  assert.equal(await query.getById(activeScope, { ...getInput(activeRecord), unknown: true }), null,
    'unknown exact-lookup fields fail before result influence');
  assert.deepEqual(await query.searchLexical(activeScope, { query: 'x'.repeat(513), topN: 20 }), [],
    'query-text max-plus-one is rejected');
  assert.deepEqual(await query.searchLexical(activeScope, { query: 'x'.repeat(512), topN: 21 }), [],
    'topN max-plus-one is rejected');
  assert.ok(Array.isArray(await query.searchLexical(activeScope, { query: 'x'.repeat(512), topN: 20 })),
    'query and topN exact maxima are admitted');
  for (const invalid of [
    neighborInput(activeRecord, { depth: 3 }),
    neighborInput(activeRecord, { nodeLimit: 65 }),
    neighborInput(activeRecord, { edgeLimit: 129 }),
    neighborInput(activeRecord, { predicate: 'arbitrary-predicate' }),
    neighborInput(activeRecord, { direction: 'sideways' }),
    { ...neighborInput(activeRecord), expression: '$..secret' }
  ]) {
    assert.equal(await query.neighbors(activeScope, invalid), null,
      'unknown or max-plus-one traversal input rejects before influence');
  }
  assert.ok(await query.neighbors(activeScope, neighborInput(activeRecord, {
    depth: 2, nodeLimit: 64, edgeLimit: 128
  })), 'all traversal exact maxima are admitted');
  assert.deepEqual(await query.searchLexical(activeScope, {
    query: '$..records[?(@.secret)]', topN: 20
  }), [], 'expression-shaped search text is inert and rejected rather than evaluated');
  assert.equal(query.releaseScope(activeScope), true, 'a live scope releases once');
  assert.equal(query.releaseScope(activeScope), false, 'scope replay release fails closed');
  assert.equal(await query.getById(activeScope, getInput(activeRecord)), null,
    'released scope returns closed output with no source distinction');
  const forged = Object.freeze({});
  assert.equal(await query.getById(forged, getInput(activeRecord)), null,
    'a cloned or forged scope has no authority');

  const source = sources[3];
  const purgeScope = query.createScope({
    partitionKey: source.fragment.partitionKey,
    exactSourceGenerations: [source.pair]
  });
  assert.equal((await query.ensureScopeCache(purgeScope)).status, 'ready');
  const authorization = Object.freeze({ signal: new AbortController().signal, operationEpoch: 7 });
  const request = Object.freeze({
    partitionKey: source.fragment.partitionKey,
    accountPermissionId: 'account',
    corpusRootFileId: 'corpus',
    sourceFileId: source.fragment.sourceFileId,
    reason: 'user-withdrawn'
  });
  assert.deepEqual(query.cacheOwner.hasOwnedInfluence(request, authorization),
    frozenRecord([['owned', true]]),
    'cache absence proof reports exact source ownership before purge');
  assert.deepEqual(query.cacheOwner.purgeSource(request, authorization), frozenRecord([['ok', true]]),
    'source purge fences and removes the exact cache synchronously');
  assert.deepEqual(query.cacheOwner.hasOwnedInfluence(request, authorization),
    frozenRecord([['owned', false]]),
    'absence proof turns false only after source influence is gone');
  assert.equal(await query.getById(purgeScope, getInput(source.fragment.records[0])), null,
    'purged cache scope cannot replay an old source result');
  assert.deepEqual(query.cacheOwner.purgeSource({ ...request, extra: true }, authorization),
    frozenRecord([['ok', false]]),
    'cache owner rejects unknown request fields');
  assert.deepEqual(query.cacheOwner.purgeSource(request, {
    signal: new AbortController().signal, operationEpoch: 7, extra: true
  }), frozenRecord([['ok', false]]), 'cache owner rejects unknown authorization fields');

  const partitionScope = query.createScope({
    partitionKey: sources[2].fragment.partitionKey,
    exactSourceGenerations: [sources[2].pair]
  });
  assert.equal((await query.ensureScopeCache(partitionScope)).status, 'ready');
  const partitionRequest = Object.freeze({
    partitionKey: sources[2].fragment.partitionKey,
    accountPermissionId: 'account',
    corpusRootFileId: 'corpus',
    sourceFileId: null,
    reason: 'root-replaced'
  });
  assert.deepEqual(query.cacheOwner.hasOwnedInfluence(partitionRequest, authorization),
    frozenRecord([['owned', true]]),
    'partition absence proof sees a live partition cache');
  assert.deepEqual(query.cacheOwner.purgePartition(partitionRequest, authorization),
    frozenRecord([['ok', true]]),
    'partition purge removes its exact cache');
  assert.deepEqual(query.cacheOwner.hasOwnedInfluence(partitionRequest, authorization),
    frozenRecord([['owned', false]]),
    'partition absence proof is exact after purge');
}

async function testIndexedRecordAndResultByteCaps() {
  const fourLocators = fakeSource(
    'partition-four-locators', 'source-four-locators', 49, 1, 'Four Locator Record', 4);
  const atMax = fakeSource('partition-max-records', 'source-max-records', 50, 4096, 'Indexed');
  const overMax = fakeSource('partition-over-records', 'source-over-records', 51, 4097, 'Indexed');
  const fake = createFakeStore([fourLocators, atMax, overMax]);
  const query = graphQueryApi.create({
    graphSchema,
    graphStore: fake.store,
    MiniSearch,
    byteLength: bytes
  });
  const maxScope = query.createScope({
    partitionKey: atMax.fragment.partitionKey,
    exactSourceGenerations: [atMax.pair]
  });
  assert.equal((await query.ensureScopeCache(maxScope)).status, 'ready',
    'exactly 4,096 indexed records are admitted');
  assert.equal((await query.searchLexical(maxScope, { query: 'Indexed 4095', topN: 20 }))[0]
    .stableRecordId, atMax.fragment.records[4095].stableRecordId,
  'exact maximum cache remains queryable');
  const overScope = query.createScope({
    partitionKey: overMax.fragment.partitionKey,
    exactSourceGenerations: [overMax.pair]
  });
  assert.equal((await query.ensureScopeCache(overScope)).status, 'closed',
    '4,097th record rejects the entire cache before influence');
  assert.deepEqual(await query.searchLexical(overScope, { query: 'Indexed', topN: 20 }), [],
    'over-cap cache leaves no partial lexical result');
  const locatorScope = query.createScope({
    partitionKey: fourLocators.fragment.partitionKey,
    exactSourceGenerations: [fourLocators.pair]
  });
  assert.equal((await query.ensureScopeCache(locatorScope)).status, 'ready');
  assert.equal((await query.inspectProvenance(locatorScope,
    provenanceInput(fourLocators.fragment.records[0]))).locators.length, 4,
  'exactly four provenance locators are admitted and projected');

  const huge = fakeSource('partition-huge-output', 'source-huge-output', 60, 64, 'X'.repeat(1010));
  const records = Object.freeze(huge.fragment.records.map((record, index) => index === 0
    ? Object.freeze({ ...record, kind: 'amendment' })
    : record));
  const relations = [];
  for (let index = 1; index < records.length; index += 1) {
    relations.push(Object.freeze({
      schemaVersion: graphSchema.VERSION,
      relationClass: 'local',
      partitionKey: huge.fragment.partitionKey,
      sourceFileId: huge.fragment.sourceFileId,
      fragmentGenerationId: huge.fragment.fragmentGenerationId,
      predicate: 'amends-candidate',
      fromStableRecordId: records[0].stableRecordId,
      fromRecordVersionId: records[0].recordVersionId,
      toStableRecordId: records[index].stableRecordId,
      toRecordVersionId: records[index].recordVersionId,
      evidence: records[0].evidence,
      stableRelationId: fakeId('srl1:', 60000 + index),
      relationVersionId: fakeId('slv1:', 60000 + index)
    }));
  }
  huge.fragment = Object.freeze({ ...huge.fragment, records, relations: Object.freeze(relations) });
  huge.shards = Object.freeze({
    ...huge.shards,
    adjacencyShards: Object.freeze([Object.freeze({
      schemaVersion: graphSchema.VERSION,
      partitionKey: huge.fragment.partitionKey,
      sourceFileId: huge.fragment.sourceFileId,
      fragmentGenerationId: huge.fragment.fragmentGenerationId,
      shardOrdinal: 0,
      entries: Object.freeze(relations.flatMap(relation => [
        Object.freeze({ stableRecordId: relation.fromStableRecordId,
          relationVersionId: relation.relationVersionId, direction: 'out' }),
        Object.freeze({ stableRecordId: relation.toStableRecordId,
          relationVersionId: relation.relationVersionId, direction: 'in' })
      ]))
    })])
  });
  const hugeFake = createFakeStore([huge]);
  const hugeQuery = graphQueryApi.create({
    graphSchema,
    graphStore: hugeFake.store,
    MiniSearch,
    byteLength: bytes
  });
  const hugeScope = hugeQuery.createScope({
    partitionKey: huge.fragment.partitionKey,
    exactSourceGenerations: [huge.pair]
  });
  assert.equal((await hugeQuery.ensureScopeCache(hugeScope)).status, 'ready');
  assert.equal(await hugeQuery.neighbors(hugeScope, neighborInput(records[0], {
    predicate: 'amends-candidate', direction: 'out', depth: 1, nodeLimit: 64, edgeLimit: 128
  })), null, 'a traversal over 64 KiB rejects the whole result instead of truncating');
}

function testStaticClosedSurface() {
  const source = fs.readFileSync(QUERY_PATH, 'utf8');
  for (const forbidden of [
    /\beval\s*\(/,
    /new\s+Function\b/,
    /\bJMESPath\b/i,
    /\bembedding\b/i,
    /\bvector(?:s|ize)?\b/i,
    /\bMCP\b/,
    /chrome\.storage/,
    /import\s*\(/
  ]) {
    assert.equal(forbidden.test(source), false,
      `production query module excludes ${forbidden}`);
  }
  assert.match(source, /readCurrentFragment/,
    'query reads only the store current-fragment seam');
  assert.match(source, /readActiveShards/,
    'query hydrates only through active source-owned shards');
  assert.match(source, /ensureScopeCache/,
    'the sole explicit lazy hydration seam is present');
  assert.equal(/getAll|storageArea|storageKey|rawFragment|rawShard|server|daemon/i.test(source), false,
    'query exposes no raw storage scan, remote process, or storage handle surface');
}

async function testSnapshotExactSetContract() {
  const preflight = graphQueryApi.create({
    graphSchema,
    graphStore: createFakeStore([fakeSource('snapshot-preflight', 'snapshot-source', 8000)]).store,
    MiniSearch,
    byteLength: bytes
  });
  if (!preflight || typeof preflight.snapshotExactSet !== 'function') {
    throw new Error('skopeo graph query snapshotExactSet contract');
  }

  assert.deepEqual(graphQueryApi.LIMITS, frozenRecord([
    ['MAX_SOURCE_GENERATIONS', 32],
    ['MAX_QUERY_CHARACTERS', 512],
    ['MAX_LEXICAL_RESULTS', 20],
    ['MAX_TRAVERSAL_DEPTH', 2],
    ['MAX_TRAVERSAL_NODES', 64],
    ['MAX_TRAVERSAL_EDGES', 128],
    ['MAX_PROVENANCE_LOCATORS', 4],
    ['MAX_RESULT_BYTES', 65536],
    ['MAX_PARTITION_CACHES', 4],
    ['MAX_INDEXED_RECORDS', 4096],
    ['MAX_SNAPSHOT_RECORDS', 4096],
    ['MAX_SNAPSHOT_RELATIONS', 16384],
    ['MAX_SNAPSHOT_EVIDENCE', 65536],
    ['MAX_SNAPSHOT_BYTES', 8388608]
  ]), 'exact-set snapshot limits are public constants, never caller-controlled prefixes');

  const corpus = await buildRealCorpus();
  const counted = countedStore(corpus.harness.store);
  const query = graphQueryApi.create({
    graphSchema,
    graphStore: counted.view,
    MiniSearch,
    byteLength: bytes
  });
  const scopeAB = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceB), exactPair(corpus.sourceA)]
  });
  assert.equal((await query.ensureScopeCache(scopeAB)).status, 'ready');
  const snapshotAB = await query.snapshotExactSet(scopeAB);
  exactKeys(snapshotAB, [
    'snapshotVersion', 'partitionKey', 'sourceBindings', 'records', 'relations'
  ], 'query snapshot has one closed complete-enumeration surface');
  assert.equal(snapshotAB.snapshotVersion, 'skopeo-graph-exact-set/1');
  assert.equal(snapshotAB.partitionKey, PARTITION_A);
  assert.deepEqual(snapshotAB.sourceBindings.map(binding => binding.sourceFileId),
    [SOURCE_A, SOURCE_B], 'source bindings are canonical, not caller-order dependent');
  assert.deepEqual(snapshotAB.records.map(record => record.recordVersionId),
    snapshotAB.records.map(record => record.recordVersionId).slice().sort(),
    'every record is returned in canonical version-ID order');
  assert.deepEqual(snapshotAB.relations.map(relation => relation.relationVersionId),
    snapshotAB.relations.map(relation => relation.relationVersionId).slice().sort(),
    'every local and endpoint-current candidate relation is returned in canonical order');
  assert.equal(snapshotAB.records.length,
    corpus.sourceA.fragment.records.length + corpus.sourceB.fragment.records.length,
  'snapshot enumeration is complete and independent of lexical top-N');
  assert.equal(snapshotAB.relations.length,
    corpus.sourceA.fragment.relations.length + corpus.sourceB.fragment.relations.length + 1,
  'snapshot includes all local relations and the endpoint-current overlay');
  const candidate = snapshotAB.relations.find(relation =>
    relation.relationVersionId === corpus.candidate.relationVersionId);
  assert.ok(candidate && candidate.candidateOnly === true,
    'cross-document relations remain inert endpoint-current candidates');
  assert.equal(candidate.fromSourceFileId, SOURCE_A);
  assert.equal(candidate.toSourceFileId, SOURCE_B);
  for (const record of snapshotAB.records) {
    assert.ok(record.evidence.length > 0, 'records keep their complete evidence set');
    assert.deepEqual(record.evidence.map(locator => locator.locatorId),
      record.evidence.map(locator => locator.locatorId).slice().sort());
    for (const locator of record.evidence) {
      exactKeys(locator, [
        'partitionKey', 'sourceFileId', 'contentFingerprint', 'fragmentGenerationId',
        'locatorId', 'sourceByteStart', 'sourceByteEnd'
      ], 'snapshot evidence retains full current ownership and byte identity');
    }
  }
  assertFrozenTree(snapshotAB);
  const forbiddenSnapshotNames = [
    'filename', '"url"', '"score"', 'recency', 'similarity', '"order"',
    '"partial"', 'minisearch', 'shard', 'cache', 'providerid', 'modelid'
  ];
  const encoded = JSON.stringify(snapshotAB).toLowerCase();
  for (const forbidden of forbiddenSnapshotNames) {
    assert.equal(encoded.includes(forbidden), false,
      `complete snapshot excludes ${forbidden} as authority or internal state`);
  }

  const permutedScope = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceA), exactPair(corpus.sourceB)]
  });
  assert.equal((await query.ensureScopeCache(permutedScope)).status, 'ready');
  assert.equal(JSON.stringify(await query.snapshotExactSet(permutedScope)), JSON.stringify(snapshotAB),
    'input permutation produces a byte-identical complete collection');

  const scopeA = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [exactPair(corpus.sourceA)]
  });
  assert.equal((await query.ensureScopeCache(scopeA)).status, 'ready');
  const snapshotA = await query.snapshotExactSet(scopeA);
  assert.equal(snapshotA.relations.some(relation => relation.candidateOnly), false,
    'a foreign or absent target endpoint gives a candidate zero snapshot influence');
  const staleScope = query.createScope({
    partitionKey: PARTITION_A,
    exactSourceGenerations: [{
      sourceFileId: SOURCE_A,
      fragmentGenerationId: fakeId('sfg1:', 999999)
    }]
  });
  assert.notEqual((await query.ensureScopeCache(staleScope)).status, 'ready');
  assert.equal(await query.snapshotExactSet(staleScope), null,
    'stale generations reject the whole snapshot');
  query.releaseScope(scopeAB);
  query.releaseScope(permutedScope);
  query.releaseScope(scopeA);

  {
    const sources = Array.from({ length: 32 }, (_, index) =>
      fakeSource('partition-source-cap', `source-cap-${index}`, 10_000 + index));
    const exact = await fakeSnapshot(sources);
    assert.equal(exact.ready.status, 'ready');
    assert.equal(exact.snapshot.sourceBindings.length, 32,
      'exact source-set maximum returns all 32 bindings');
    const overQuery = graphQueryApi.create({
      graphSchema,
      graphStore: createFakeStore(sources).store,
      MiniSearch,
      byteLength: () => 1
    });
    assert.equal(overQuery.createScope({
      partitionKey: 'partition-source-cap',
      exactSourceGenerations: sources.map(source => source.pair).concat({
        sourceFileId: 'source-cap-over',
        fragmentGenerationId: fakeId('sfg1:', 20_000)
      })
    }), null, 'source max-plus-one returns no prefix');
  }

  {
    const exactSources = Array.from({ length: 4 }, (_, index) =>
      fakeSource('partition-record-cap', `record-cap-${index}`, 30_000 + index, 1024));
    const exact = await fakeSnapshot(exactSources);
    assert.equal(exact.snapshot.records.length, 4096,
      'record maximum returns the complete set');
    const over = await fakeSnapshot(exactSources.concat(
      fakeSource('partition-record-cap', 'record-cap-over', 31_000, 1)
    ));
    assert.equal(over.snapshot, null, 'record max-plus-one returns no prefix');
  }

  {
    const exactSource = relationCapacitySource(16384, 2);
    const exact = await fakeSnapshot([exactSource]);
    assert.equal(exact.snapshot.relations.length, 16384,
      'relation maximum returns the complete set');
    const exactEvidenceCount = exact.snapshot.records.reduce(
      (count, record) => count + record.evidence.length, 0
    ) + exact.snapshot.relations.reduce(
      (count, relation) => count + relation.evidence.length, 0
    );
    assert.equal(exactEvidenceCount, 65536,
      'evidence maximum returns the complete set');

    const extraRelation = Object.freeze(Object.assign({}, exactSource.fragment.relations[0], {
      stableRelationId: fakeId('srl1:', 9_000_001),
      relationVersionId: fakeId('slv1:', 9_000_001)
    }));
    const relationOverSource = Object.assign({}, exactSource, {
      fragment: Object.freeze(Object.assign({}, exactSource.fragment, {
        relations: Object.freeze(exactSource.fragment.relations.concat(extraRelation))
      }))
    });
    assert.equal((await fakeSnapshot([relationOverSource])).snapshot, null,
      'relation max-plus-one returns no prefix');

    const evidenceOverRelations = exactSource.fragment.relations.slice();
    const last = evidenceOverRelations.at(-1);
    evidenceOverRelations[evidenceOverRelations.length - 1] = Object.freeze(Object.assign({}, last, {
      evidence: Object.freeze(last.evidence.concat(Object.freeze({
        locatorId: fakeId('sel1:', 9_000_002),
        sourceByteStart: 9_000_002,
        sourceByteEnd: 9_000_003
      })))
    }));
    const evidenceOverSource = Object.assign({}, exactSource, {
      fragment: Object.freeze(Object.assign({}, exactSource.fragment, {
        relations: Object.freeze(evidenceOverRelations)
      }))
    });
    assert.equal((await fakeSnapshot([evidenceOverSource])).snapshot, null,
      'evidence max-plus-one returns no prefix');
  }

  {
    const source = fakeSource('partition-byte-cap', 'byte-cap-source', 40_000);
    assert.ok((await fakeSnapshot([source], () => 8388608)).snapshot,
      'exact serialized byte maximum is admitted');
    assert.equal((await fakeSnapshot([source], () => 8388609)).snapshot, null,
      'result byte max-plus-one returns no prefix');
  }

  {
    const source = fakeSource('partition-cache-drift', 'cache-drift-source', 50_000);
    const fake = createFakeStore([source]);
    const driftQuery = graphQueryApi.create({
      graphSchema,
      graphStore: fake.store,
      MiniSearch,
      byteLength: () => 1
    });
    const scope = driftQuery.createScope({
      partitionKey: source.fragment.partitionKey,
      exactSourceGenerations: [source.pair]
    });
    assert.equal((await driftQuery.ensureScopeCache(scope)).status, 'ready');
    fake.remove(source);
    assert.equal(await driftQuery.snapshotExactSet(scope), null,
      'cache drift closes the entire snapshot after hydration');
    assert.equal(driftQuery.releaseScope(scope), false,
      'drift already destroys the opaque scope');
  }
}

async function run() {
  await testRealStoreAuthorizationQueriesAndRebuild();
  await testBoundariesHostileInputsLruAndCacheOwner();
  await testIndexedRecordAndResultByteCaps();
  testStaticClosedSurface();
  await testSnapshotExactSetContract();
  console.log('skopeo graph query contract: PASS');
}

run().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
