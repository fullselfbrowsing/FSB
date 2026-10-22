'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'skopeo-truth-evals');
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, 'cases.json'), 'utf8'));

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: crypto.webcrypto
  });
}
if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(fs.readFileSync(
    path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'),
    'utf8'
  ));
}

const CorpusSchema = require('../extension/utils/skopeo-corpus-schema.js');
const GraphSchema = require('../extension/utils/skopeo-graph-schema.js');
const GraphEngine = require('../extension/utils/skopeo-graph-engine.js');
const TruthSchema = require('../extension/utils/skopeo-truth-schema.js');
const DeadlineEngine = require('../extension/utils/skopeo-deadline-engine.js');
const TruthExtractor = require('../extension/utils/skopeo-truth-extractor.js');
const LineageAdjudicator = require('../extension/utils/skopeo-lineage-adjudicator.js');
const TruthStore = require('../extension/utils/skopeo-truth-store.js');
const TruthEngine = require('../extension/utils/skopeo-truth-engine.js');

const CASE_KEYS = Object.freeze([
  'id', 'category', 'critical', 'scenario', 'data_class', 'versions',
  'authority_transitions', 'recorded_candidate_response', 'expected',
  'forbidden_marker_probes', 'label_version', 'gold_label_version',
  'review_status', 'required_reviewer_roles', 'approved_reviewer_roles',
  'review_record_ref'
]);
const VERSION_KEYS = Object.freeze([
  'fixture', 'truth_schema', 'prompt', 'extractor', 'adjudicator',
  'deadline', 'calendar', 'store', 'runtime', 'graph_snapshot'
]);
const EXPECTED_KEYS = Object.freeze([
  'candidate_admission', 'proof', 'assertion_types', 'conflicts',
  'derivations', 'blocker_codes', 'durable_visibility', 'absence'
]);
const PROOF_KEYS = Object.freeze([
  'execution', 'temporal', 'lineage_role', 'governance',
  'accepted_path', 'overlays', 'inheritance'
]);
const REQUIRED_ROLE_CODES = Object.freeze([
  'commercial-contracts-counsel',
  'legal-operations',
  'source-system-steward',
  'privacy-security',
  'evaluation-lead'
]);
const PRODUCTION_VERSION_VALUES = Object.freeze({
  fixture: 'skopeo-truth-evals/v1',
  truth_schema: TruthSchema.VERSION,
  prompt: TruthSchema.PROMPT_VERSION,
  extractor: TruthExtractor.VERSION,
  adjudicator: LineageAdjudicator.VERSION,
  deadline: DeadlineEngine.VERSION,
  calendar: TruthSchema.CALENDAR_VERSION,
  store: TruthStore.VERSION,
  runtime: TruthEngine.VERSION,
  graph_snapshot: 'skopeo-graph-exact-set/1'
});
const PROVISIONAL_EXPECTED_SHA256 = Object.freeze({
  G01: 'fa3ef166b6af1b73485fccb6de451d7d35f63d86760beaca22f70b826a64ec1d',
  G02: 'dd95ed9a88b953931923ca247f658421e9fac43ca57044f7d40ed93a880634b5',
  G03: 'aa6504af7c2bf9324bff9b579d36ba6be15d556e5012c2aed280c30ae673a796',
  G04: '86504e4c1b34bbdb8a3a73f21520505d3400e3e42cc7b53752a56154e1088dc8',
  G05: '3546f118ece1da11f0cece1bcf3bcb37ca47d9ad16c498b4ba222d9dda26a6bc',
  G06: 'aa0ed06c73e2067cae7b702b63f941cd2a77614fae0bc1569f85c785f5bd683f',
  F01: 'acb5eabd920312a8a5b6c9ad66b4241c23e18dd2f9b9cf026522786844f6d118',
  F02: '839273e164101b59de2d80b686c8dc0ef458e00bbb987611727ead77973bcb8f',
  F03: 'b667ec2fbb357f43a7303d8f311d90bb21fea6f43774e78e1e7c77b3761beb05',
  F04: '2cb910e54c94bfc0a6b3842f06309147c84dac06be964794daa356b79213c98f',
  F05: '3fc94257d21e99f202f6ded3b012cc320be64d86b204f0fd25a95a9b10205517',
  F06: 'fe5e624e107800fd5164d94b35751974d9eae002c51bc23c53c980d8ebdc82de',
  D01: 'f015f12e36606350ecbea05bd1a53a4c6e07254327c0f4ba15403726fcdc26a4',
  D02: '3accc922599851da17f2fa2cd2e51a300bd594e34dfe29810323ee71f169d60a',
  D03: 'b267c0f09e348092a9926dade6ce72a33919b5e29ec7b19ac8723998f3345d18',
  D04: '966cb0754277dd1d0d2840bb217171988718f7fa85eb804648f87151219d6451',
  D05: 'cae948c92df5adc8cd41ed224c0f2e800b1bd125284f0648abfce24cd0d43406',
  D06: '4c13b992cb62a3f561cbc25c0900403124a8d04f542e1803b3526df173d30c79',
  R01: 'd3b78232a0def238514b7eef49f1984d8a320def20bbe49f841371a44aad34eb',
  R02: '39a1ad7782d452f2a5d6d8ca5b3ed85a13f7eec6fa38c773e63c9353a3288c0d',
  R03: '61a8e5775cd67bc7a8e6d3ca480e46172e2ce9ad80f616d745e0d2099cc5ab78',
  R04: '8b3dc0c27cca45a6576a623d9a17505de40521938a7ed0a162fb6b8edd7f2f36',
  R05: 'c455bc8fcf80190228fae01f6aebb09804d51fffae2126a8353506fd4b5e7059',
  R06: 'c3f68a1e31085cba410ec9cc5f32f10a4cccf1e5ebd7c7498ae8211d973fbc97'
});

const ACCOUNT = 'truth-eval-account';
const CORPUS = 'truth-eval-root';
const PARTITION = CorpusSchema.makePartitionKey({
  accountPermissionId: ACCOUNT,
  corpusRootFileId: CORPUS
});
const SOURCE = 'truth-eval-source';
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const GRAPH_DIGEST = `sgx1:${'b'.repeat(64)}`;
const NOW = 1_800_000_000_000;
const SOURCE_TEXT = 'synthetic';

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function exactKeys(value, expected, message) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected.slice().sort(), message);
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
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor || !own(descriptor, 'value') || frozenTree(descriptor.value, seen);
  });
}

function digestId(prefix, ordinal) {
  return `${prefix}${ordinal.toString(16).padStart(64, '0')}`;
}

function sortedUniqueStrings(values) {
  return Array.isArray(values) &&
    values.every((value) => typeof value === 'string' && value.length > 0) &&
    new Set(values).size === values.length;
}

function expectedDigest(value) {
  const canonical = TruthSchema.canonicalize(value);
  assert.strictEqual(typeof canonical, 'string', 'provisional output canonicalizes');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function validReviewRecord(value) {
  return typeof value === 'string' &&
    /^truth-review:v1:[a-z0-9_-]{8,80}$/.test(value);
}

function domainReviewStatus(testCases) {
  if (testCases.some((item) => item.review_status === 'rejected')) return 'rejected';
  const approved = testCases.every((item) =>
    item.review_status === 'approved' &&
    item.gold_label_version === item.label_version &&
    validReviewRecord(item.review_record_ref) &&
    item.required_reviewer_roles.every(
      (role) => item.approved_reviewer_roles.includes(role)
    )
  );
  return approved ? 'approved' : 'human_needed';
}

function verifyFixtureShape() {
  deepFreeze(manifest);
  deepFreeze(cases);
  assert.ok(frozenTree(manifest) && frozenTree(cases), 'fixture trees are immutable');
  assert.strictEqual(manifest.version, PRODUCTION_VERSION_VALUES.fixture);
  assert.strictEqual(manifest.network_allowed, false);
  assert.strictEqual(manifest.llm_judge_allowed, false);
  assert.strictEqual(manifest.configured_provider_run_allowed, false);
  assert.deepStrictEqual(manifest.production_versions, PRODUCTION_VERSION_VALUES);
  assert.deepStrictEqual(
    manifest.required_reviewer_role_codes,
    REQUIRED_ROLE_CODES
  );
  assert.deepStrictEqual(manifest.report_lines, [
    'deterministic_structural_security',
    'provisional_regression',
    'domain_fidelity'
  ]);
  assert.strictEqual(cases.length, 24, 'exactly 24 truth cases are loaded');
  assert.deepStrictEqual(
    cases.map((item) => item.id),
    manifest.ordered_case_ids,
    'manifest order enumerates every case exactly once'
  );
  assert.strictEqual(new Set(cases.map((item) => item.id)).size, 24);
  const counts = Object.create(null);
  cases.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });
  assert.deepStrictEqual(Object.assign({}, counts), { G: 6, F: 6, D: 6, R: 6 });

  for (const item of cases) {
    exactKeys(item, CASE_KEYS, `${item.id} has exact case metadata`);
    exactKeys(item.versions, VERSION_KEYS, `${item.id} binds every production version`);
    exactKeys(item.expected, EXPECTED_KEYS, `${item.id} has exact expected output`);
    exactKeys(item.expected.proof, PROOF_KEYS, `${item.id} has exact proof axes`);
    assert.deepStrictEqual(item.versions, PRODUCTION_VERSION_VALUES);
    assert.match(item.id, /^[GFDR][0-9]{2}$/);
    assert.strictEqual(item.category, item.id[0]);
    assert.strictEqual(item.critical, true);
    assert.strictEqual(item.data_class, 'synthetic');
    assert.ok(typeof item.scenario === 'string' && item.scenario.length >= 24);
    assert.ok(sortedUniqueStrings(item.authority_transitions) &&
      item.authority_transitions.length >= 4);
    assert.ok(['accepted', 'rejected', 'not-applicable'].includes(
      item.expected.candidate_admission
    ));
    for (const name of [
      'assertion_types', 'conflicts', 'derivations', 'blocker_codes',
      'durable_visibility', 'absence'
    ]) {
      assert.ok(sortedUniqueStrings(item.expected[name]),
        `${item.id} ${name} is a unique nonempty-string array`);
    }
    item.expected.assertion_types.forEach((type) =>
      assert.ok(TruthSchema.ASSERTION_TYPES.includes(type), `${item.id} assertion ${type}`));
    item.expected.blocker_codes.forEach((code) =>
      assert.ok(TruthSchema.BLOCKER_CODES.includes(code), `${item.id} blocker ${code}`));
    assert.ok(sortedUniqueStrings(item.forbidden_marker_probes) &&
      item.forbidden_marker_probes.length >= 3);
    assert.strictEqual(item.label_version, 'truth-provisional-v1');
    assert.strictEqual(item.gold_label_version, null);
    assert.strictEqual(item.review_status, 'pending');
    assert.ok(sortedUniqueStrings(item.required_reviewer_roles));
    assert.ok(item.required_reviewer_roles.every(
      (role) => REQUIRED_ROLE_CODES.includes(role)
    ));
    assert.deepStrictEqual(item.approved_reviewer_roles, []);
    assert.strictEqual(item.review_record_ref, null);
    assert.strictEqual(
      item.recorded_candidate_response === null,
      item.expected.candidate_admission === 'not-applicable',
      `${item.id} records a candidate response exactly when candidate admission applies`
    );
  }
}

function verifyProvisionalRegression() {
  exactKeys(PROVISIONAL_EXPECTED_SHA256, manifest.ordered_case_ids,
    'all 24 provisional expected outputs have an independent pinned digest');
  cases.forEach((item) => {
    assert.strictEqual(
      expectedDigest(item.expected),
      PROVISIONAL_EXPECTED_SHA256[item.id],
      `${item.id} pending output matches the checked-in provisional oracle`
    );
  });
}

async function issuedFixture() {
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT
  });
  const primary = await GraphSchema.parseEvidenceLocator({
    excerptId: 'excerpt_000001',
    start: 0,
    end: 1
  }, {
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'excerpt_000001',
      text: SOURCE_TEXT,
      sourceByteStart: 0,
      sourceByteEnd: Buffer.byteLength(SOURCE_TEXT, 'utf8')
    }]
  });
  const secondary = await GraphSchema.parseEvidenceLocator({
    excerptId: 'excerpt_000001',
    start: 1,
    end: 2
  }, {
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'excerpt_000001',
      text: SOURCE_TEXT,
      sourceByteStart: 0,
      sourceByteEnd: Buffer.byteLength(SOURCE_TEXT, 'utf8')
    }]
  });
  assert.ok(primary && secondary, 'production graph schema issues exact evaluation locators');

  const documents = [
    ['doc:base', 'agreement', 1],
    ['doc:draft', 'agreement', 2],
    ['doc:amendment-a', 'amendment', 3],
    ['doc:amendment-b', 'amendment', 4],
    ['doc:replacement', 'agreement', 5]
  ].map(([handle, kind, ordinal]) => ({
    handle,
    kind,
    stableRecordId: digestId('sri1:', ordinal),
    recordVersionId: digestId('srv1:', ordinal)
  }));
  const clauses = [
    {
      handle: 'clause:notice',
      kind: 'clause',
      stableRecordId: digestId('sri1:', 6),
      recordVersionId: digestId('srv1:', 6),
      documentHandle: 'doc:base'
    },
    {
      handle: 'clause:sales',
      kind: 'clause',
      stableRecordId: digestId('sri1:', 7),
      recordVersionId: digestId('srv1:', 7),
      documentHandle: 'doc:base'
    },
    {
      handle: 'clause:amendment-a',
      kind: 'clause',
      stableRecordId: digestId('sri1:', 13),
      recordVersionId: digestId('srv1:', 13),
      documentHandle: 'doc:amendment-a'
    },
    {
      handle: 'clause:amendment-b',
      kind: 'clause',
      stableRecordId: digestId('sri1:', 14),
      recordVersionId: digestId('srv1:', 14),
      documentHandle: 'doc:amendment-b'
    }
  ];
  const relations = [
    ['relation:amends-a', 'amends', 8],
    ['relation:amends-b', 'amends', 9],
    ['relation:supersedes', 'supersedes', 10],
    ['relation:cycle-a', 'supersedes', 11],
    ['relation:cycle-b', 'supersedes', 12]
  ].map(([handle, kind, ordinal]) => ({
    handle,
    kind,
    relationVersionId: digestId('slv1:', ordinal)
  }));
  const evidence = [
    { handle: 'evidence:primary', locator: primary },
    { handle: 'evidence:secondary', locator: secondary }
  ];
  const calendars = [{
    handle: 'calendar:us',
    calendarId: 'calendar-us-business',
    calendarVersionId: 'calendar-us-business-v1'
  }];
  const registry = deepFreeze({
    documentHandles: documents,
    clauseHandles: clauses,
    relationHandles: relations,
    calendarHandles: calendars,
    evidenceHandles: evidence
  });
  const context = deepFreeze({
    schemaVersion: TruthSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    providerId: 'eval-provider',
    modelId: 'eval-model',
    batchOrdinal: 0,
    documentHandles: documents.map(({ handle, stableRecordId, recordVersionId }) => ({
      handle, stableRecordId, recordVersionId
    })),
    clauseHandles: clauses.map(
      ({ handle, stableRecordId, recordVersionId, documentHandle }) => ({
        handle, stableRecordId, recordVersionId, documentHandle
      })
    ),
    relationHandles: relations.map(({ handle, relationVersionId }) => ({
      handle, relationVersionId
    })),
    calendarHandles: calendars,
    evidenceHandles: evidence
  });
  return { fragmentGenerationId, primary, secondary, registry, context };
}

async function verifyCandidateAdmission(fixture) {
  for (const item of cases) {
    if (item.recorded_candidate_response === null) continue;
    const parsed = await TruthSchema.parseCandidateEnvelope(
      item.recorded_candidate_response,
      fixture.context
    );
    const actual = parsed ? 'accepted' : 'rejected';
    assert.strictEqual(actual, item.expected.candidate_admission,
      `${item.id} candidate response follows production hostile-data admission`);
    if (parsed) {
      assert.ok(frozenTree(parsed), `${item.id} normalized candidates are frozen`);
      assert.strictEqual(parsed.schemaVersion, TruthSchema.CANDIDATE_SCHEMA_VERSION);
      assert.strictEqual(parsed.fragmentGenerationId, fixture.fragmentGenerationId);
    }
  }
}

let certificateSequence = 0;
function truthCertificate() {
  certificateSequence += 1;
  const target = {
    decision: 'certified',
    operationId: `truth-eval-operation-${certificateSequence}`,
    kind: 'ingestion',
    tabId: 71,
    origin: 'https://drive.google.com',
    generation: 1,
    contextEpoch: certificateSequence,
    authorityEpoch: certificateSequence,
    accountPermissionId: ACCOUNT,
    corpusRootFileId: CORPUS,
    sourceFileId: SOURCE,
    partitionEpoch: certificateSequence,
    sourceEpoch: certificateSequence,
    provedAt: NOW,
    contentFingerprint: Object.freeze({ value: FINGERPRINT }),
    metadataFingerprint: Object.freeze({ kind: 'synthetic-metadata' }),
    membershipFingerprint: Object.freeze({ kind: 'synthetic-membership' })
  };
  Object.defineProperty(target, 'toJSON', {
    enumerable: false,
    value() {
      throw new TypeError('truth evaluation certificate is nonserializable');
    }
  });
  return Object.freeze(target);
}

function emptyCandidateEnvelope() {
  return {
    schemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    batchId: 'truth_eval_extractor',
    executionCandidates: [],
    effectivenessCandidates: [],
    lineageCandidates: [],
    factCandidates: [],
    deadlineRuleCandidates: []
  };
}

function createProductionExtractor() {
  const metrics = { providerCalls: 0, acknowledgements: 0 };
  let nonce = 0;
  const extractor = TruthExtractor.create({
    truthSchema: TruthSchema,
    providerFactory(settings) {
      assert.deepStrictEqual(settings, {
        modelProvider: 'eval-provider',
        modelName: 'eval-model'
      });
      return Object.freeze({
        async buildRequest(prompt) {
          assert.strictEqual(typeof prompt.systemPrompt, 'string');
          assert.strictEqual(typeof prompt.userPrompt, 'string');
          return {};
        },
        async sendRequest(body, options) {
          metrics.providerCalls += 1;
          assert.strictEqual(body.temperature, 0.1);
          assert.strictEqual(body.max_tokens, 2048);
          assert.strictEqual(options.attempt, 0);
          assert.strictEqual(options.timeout, 20_000);
          assert.strictEqual(options.signal.aborted, false);
          return { content: JSON.stringify(emptyCandidateEnvelope()) };
        },
        parseResponse(response) {
          return {
            content: response.content,
            model: 'eval-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
          };
        }
      });
    },
    async readSettings() {
      return { modelProvider: 'eval-provider', modelName: 'eval-model' };
    },
    nonceFactory() {
      nonce += 1;
      return `truth_eval_nonce_${String(nonce).padStart(8, '0')}`;
    },
    now: () => NOW
  });
  assert.ok(extractor, 'production truth extractor accepts the fake configured provider seam');
  return { extractor, metrics };
}

async function exerciseProductionExtractor(production, fixture) {
  const controller = new AbortController();
  const prepared = await production.extractor.prepareSource(
    truthCertificate(),
    controller.signal,
    async (sink, signal) => {
      await sink(Object.freeze({
        byteHash: FINGERPRINT,
        exactByteLength: Buffer.byteLength(SOURCE_TEXT, 'utf8'),
        text: SOURCE_TEXT
      }), signal);
      return Object.freeze({ kind: 'ok' });
    },
    GRAPH_DIGEST,
    fixture.registry
  );
  assert.ok(prepared && prepared.session, 'production extractor prepares one opaque source');
  const step = await production.extractor.nextBatch(
    prepared.session,
    truthCertificate(),
    controller.signal,
    async (candidateStep, signal) => {
      production.metrics.acknowledgements += 1;
      assert.strictEqual(signal.aborted, false);
      return Object.freeze({
        status: 'provider-no-storage',
        durableEffect: false,
        prepared: candidateStep
      });
    }
  );
  assert.strictEqual(step.status, 'provider-step');
  assert.strictEqual(step.outcome.status, 'validated-batch');
  assert.strictEqual(production.metrics.providerCalls, 1);
  assert.strictEqual(production.metrics.acknowledgements, 1);
  const complete = await production.extractor.nextBatch(
    prepared.session,
    truthCertificate(),
    controller.signal,
    async () => {
      throw new Error('terminal extractor step performs no acknowledgement');
    }
  );
  assert.strictEqual(complete.status, 'complete');
  const final = await production.extractor.finalize(
    prepared.session,
    truthCertificate(),
    controller.signal
  );
  assert.ok(final && final.batches.length === 1 && frozenTree(final));
  assert.strictEqual(final.authorizedSetDigest, GRAPH_DIGEST);
  assert.strictEqual(JSON.stringify(final).includes(JSON.stringify(emptyCandidateEnvelope())), false,
    'finalized candidates retain no raw provider response');
  assert.strictEqual(production.extractor.discard(prepared.session).status, 'discarded');
  return final;
}

function createMemoryStorage() {
  const values = Object.create(null);
  return {
    storageArea: Object.freeze({
      async get(keys) {
        if (keys === null || keys === undefined) return structuredClone(values);
        const output = Object.create(null);
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (own(values, key)) output[key] = structuredClone(values[key]);
        }
        return output;
      },
      async set(update) {
        Object.entries(update || {}).forEach(([key, value]) => {
          values[key] = structuredClone(value);
        });
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
      async getBytesInUse(keys) {
        const selected = keys === null || keys === undefined
          ? values
          : Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((key) => own(values, key))
              .map((key) => [key, values[key]])
          );
        return Buffer.byteLength(JSON.stringify(selected), 'utf8');
      }
    }),
    snapshot() {
      return structuredClone(values);
    }
  };
}

function createProductionStore() {
  const memory = createMemoryStorage();
  const store = TruthStore.create({
    storageArea: memory.storageArea,
    truthSchema: TruthSchema,
    corpusSchema: CorpusSchema,
    now: () => NOW,
    byteLength(value) {
      return Buffer.byteLength(value, 'utf8');
    }
  });
  assert.ok(store, 'production truth store accepts browser-shaped memory storage');
  return { store, memory };
}

async function exerciseProductionStore(production) {
  const controller = new AbortController();
  const guard = production.store.issueMutation(controller.signal);
  assert.ok(guard && Object.isFrozen(guard));
  const recovered = await production.store.recover(guard);
  assert.ok(recovered && recovered.ok === true, 'empty durable truth recovery succeeds');
  assert.strictEqual(production.store.finishMutation(guard).status, 'finished');
  assert.deepStrictEqual(production.memory.snapshot(), {});
  assert.strictEqual(TruthSchema.LIMITS.MAX_FAMILY_CITATIONS, 2048);
  assert.strictEqual(TruthStore.LIMITS.MAX_FAMILY_CITATIONS, 2048);
  assert.strictEqual(LineageAdjudicator.LIMITS.MAX_FAMILY_CITATIONS, 2048);
  assert.strictEqual(Array.from({ length: 2048 }).length, 2048);
  assert.strictEqual(Array.from({ length: 2049 }).length >
    TruthStore.LIMITS.MAX_FAMILY_CITATIONS, true);
  return recovered;
}

function graphCertificate(sourceFileId, sequence, fingerprint) {
  const target = {
    decision: 'certified',
    operationId: `graph-eval-operation-${sequence}`,
    kind: 'query',
    tabId: 72,
    origin: 'https://drive.google.com',
    generation: 1,
    contextEpoch: sequence,
    authorityEpoch: sequence,
    accountPermissionId: ACCOUNT,
    corpusRootFileId: CORPUS,
    sourceFileId,
    sourceState: 'ready',
    partitionEpoch: sequence,
    sourceEpoch: sequence,
    provedAt: NOW,
    vendorScopeFileId: CORPUS,
    physicalParentChain: Object.freeze([CORPUS]),
    metadataFingerprint: Object.freeze({
      version: 1,
      kind: 'metadata',
      name: 'Synthetic graph source',
      mimeType: 'text/plain',
      modifiedTime: '2026-01-01T00:00:00.000Z',
      driveVersion: '1',
      size: 1,
      trashed: false,
      canDownload: true
    }),
    membershipFingerprint: Object.freeze({
      version: 1,
      kind: 'membership',
      corpusRootFileId: CORPUS,
      physicalParentChain: Object.freeze([CORPUS]),
      vendorScopeFileId: CORPUS,
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
    value() {
      throw new TypeError('graph evaluation certificate is nonserializable');
    }
  });
  return Object.freeze(target);
}

async function createProductionGraphFacade() {
  const sourceFileIds = ['truth-graph-a', 'truth-graph-b'];
  const fragments = new Map();
  for (const sourceFileId of sourceFileIds) {
    const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
      schemaVersion: GraphSchema.VERSION,
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint: FINGERPRINT
    });
    fragments.set(sourceFileId, deepFreeze({
      schemaVersion: GraphSchema.VERSION,
      promptVersion: GraphSchema.PROMPT_VERSION,
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint: FINGERPRINT,
      fragmentGenerationId,
      providerId: 'eval-provider',
      modelId: 'eval-model',
      records: [],
      relations: []
    }));
  }
  const graphStore = Object.freeze({
    issueMutation(signal) { return Object.freeze({ signal }); },
    finishMutation() { return Object.freeze({ ok: true, status: 'finished' }); },
    async withdrawSource() { return Object.freeze({ ok: true, status: 'withheld' }); },
    async withdrawSourceIfCurrent() {
      return Object.freeze({ ok: true, status: 'superseded' });
    },
    async beginReplacement() { return Object.freeze({ status: 'closed' }); },
    async stageBatch() { return Object.freeze({ status: 'closed' }); },
    async sealStaging() { return Object.freeze({ status: 'closed' }); },
    async publishReplacement() { return Object.freeze({ status: 'closed' }); },
    async replaceCandidateRelations() { return Object.freeze({ status: 'closed' }); },
    async inspectMetadata(input) {
      const fragment = fragments.get(input.sourceFileId);
      return fragment && Object.freeze({
        version: 1,
        state: 'published',
        schemaVersion: GraphSchema.VERSION,
        promptVersion: GraphSchema.PROMPT_VERSION,
        fragmentGenerationId: fragment.fragmentGenerationId,
        activeGenerationId: fragment.fragmentGenerationId,
        contentFingerprint: fragment.contentFingerprint,
        recordCount: 0,
        relationCount: 0
      });
    },
    async readCurrentFragment(input) {
      const fragment = fragments.get(input.sourceFileId);
      return fragment && fragment.fragmentGenerationId === input.fragmentGenerationId
        ? fragment : null;
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
  let scopeReleases = 0;
  const graphQuery = Object.freeze({
    createScope(input) { return deepFreeze({ input }); },
    async ensureScopeCache() { return Object.freeze({ status: 'ready' }); },
    async getById() { throw new Error('exact snapshot performs no lookup fallback'); },
    async searchLexical() { throw new Error('exact snapshot performs no lexical fallback'); },
    async neighbors() { throw new Error('exact snapshot performs no traversal fallback'); },
    async inspectProvenance() { throw new Error('exact snapshot performs no provenance fallback'); },
    async snapshotExactSet() {
      return deepFreeze({
        snapshotVersion: 'skopeo-graph-exact-set/1',
        partitionKey: PARTITION,
        sourceBindings: Array.from(fragments.values())
          .map((fragment) => ({
            sourceFileId: fragment.sourceFileId,
            contentFingerprint: fragment.contentFingerprint,
            fragmentGenerationId: fragment.fragmentGenerationId
          }))
          .sort((left, right) => left.sourceFileId.localeCompare(right.sourceFileId)),
        records: [],
        relations: []
      });
    },
    releaseScope() {
      scopeReleases += 1;
      return true;
    }
  });
  let sequence = 0;
  const runCorpusOperation = async (kind, tuple, selection, callback) => {
    sequence += 1;
    assert.strictEqual(kind, 'query');
    assert.ok(tuple && tuple.tabId === 72);
    const selected = selection.sourceFileIds.slice();
    const certificates = selected.map(
      (sourceFileId) => graphCertificate(sourceFileId, sequence, FINGERPRINT)
    );
    const controller = new AbortController();
    const value = await callback(
      Object.freeze(certificates),
      Object.freeze({ complete: true }),
      controller.signal
    );
    return Object.freeze({ decision: 'admitted', value });
  };
  const facade = GraphEngine.create({
    graphSchema: GraphSchema,
    graphStore,
    graphExtractor,
    graphQuery,
    corpusTransport: Object.freeze({ async readContent() { return null; } }),
    runCorpusOperation,
    readSettings: async () => ({
      modelProvider: 'eval-provider',
      modelName: 'eval-model'
    }),
    providerFactory: () => Object.freeze({}),
    now: () => NOW
  });
  assert.ok(facade, 'production graph engine creates the exact-set facade');
  const result = await facade.snapshotExactSet(
    Object.freeze({ tabId: 72 }),
    Object.freeze({ sourceFileIds: Object.freeze(sourceFileIds.slice().reverse()) })
  );
  assert.strictEqual(result.decision, 'admitted');
  assert.strictEqual(result.value.snapshotVersion, 'skopeo-graph-exact-set/1');
  assert.match(result.value.authorizedSetDigest, /^sgx1:[0-9a-f]{64}$/);
  assert.deepStrictEqual(
    result.value.sourceBindings.map((binding) => binding.sourceFileId),
    sourceFileIds
  );
  assert.strictEqual(scopeReleases, 1);
  return { facade, runCorpusOperation, snapshot: result.value };
}

async function createAndExerciseAdjudicator() {
  const adjudicator = LineageAdjudicator.create({
    truthSchema: TruthSchema,
    deadlineEngine: DeadlineEngine,
    byteLength(value) {
      return Buffer.byteLength(value, 'utf8');
    }
  });
  assert.ok(adjudicator, 'production deterministic adjudicator is created');
  const closed = await adjudicator.adjudicateExactSet({});
  assert.deepStrictEqual(closed.blockerCodes, ['input-not-exact']);
  assert.strictEqual(closed.status, 'abstained');
  assert.ok(frozenTree(closed));
  return { adjudicator, closed };
}

async function deadlineEvidence() {
  const sourceFileId = 'truth-deadline-source';
  const contentFingerprint = `sha256:${'d'.repeat(64)}`;
  const text = 'expiration notice consequence';
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint
  });
  const locator = await GraphSchema.parseEvidenceLocator({
    excerptId: 'deadline_excerpt',
    start: 0,
    end: 10
  }, {
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'deadline_excerpt',
      text,
      sourceByteStart: 20,
      sourceByteEnd: 20 + Buffer.byteLength(text, 'utf8')
    }]
  });
  const citationIdentity = {
    schemaVersion: TruthSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    recordVersionId: digestId('srv1:', 40),
    relationVersionId: null,
    locatorId: locator.locatorId,
    sourceByteStart: locator.sourceByteStart,
    sourceByteEnd: locator.sourceByteEnd
  };
  const citation = await TruthSchema.parseCitation({
    ...citationIdentity,
    excerptId: locator.excerptId,
    start: locator.start,
    end: locator.end,
    citationId: await TruthSchema.deriveCitationId(citationIdentity)
  });
  assert.ok(citation, 'production schemas construct deadline evidence');
  return citation;
}

async function deadlineFamilyId() {
  return TruthSchema.deriveFamilyId({
    identityVersion: TruthSchema.IDENTITY_VERSION,
    partitionKey: PARTITION,
    documentStableIds: [digestId('sri1:', 40)],
    lineageRelationIds: []
  });
}

async function deadlineAssertion(citation, value) {
  const familyId = await deadlineFamilyId();
  const primarySourceLocator = {
    sourceFileId: citation.sourceFileId,
    sourceByteStart: citation.sourceByteStart,
    sourceByteEnd: citation.sourceByteEnd
  };
  const assertionId = await TruthSchema.deriveAssertionId({
    identityVersion: TruthSchema.IDENTITY_VERSION,
    partitionKey: PARTITION,
    familyId,
    subjectDocumentStableId: digestId('sri1:', 40),
    subjectClauseStableId: digestId('sri1:', 41),
    assertionType: 'expiration-date',
    primarySourceLocator
  });
  const typedValue = { kind: 'civil-date', value };
  const versionInput = {
    assertionId,
    typedValue,
    trustState: 'extracted',
    citationIds: [citation.citationId],
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    derivationRuleVersion: null
  };
  const assertion = await TruthSchema.parseAssertion({
    schemaVersion: TruthSchema.VERSION,
    partitionKey: PARTITION,
    familyId,
    subjectDocumentStableId: digestId('sri1:', 40),
    subjectClauseStableId: digestId('sri1:', 41),
    assertionType: 'expiration-date',
    typedValue,
    trustState: 'extracted',
    citationIds: [citation.citationId],
    primarySourceLocator,
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    derivationRuleVersion: null,
    assertionId,
    assertionVersionId: await TruthSchema.deriveAssertionVersionId(versionInput)
  }, [citation]);
  assert.ok(assertion, 'production schema constructs the deadline anchor assertion');
  return assertion;
}

function businessCalendar(version = 'calendar-us-business-v1') {
  return {
    schemaVersion: TruthSchema.CALENDAR_VERSION,
    calendarId: 'calendar-us-business',
    calendarVersionId: version,
    weekendDays: [0, 6],
    holidays: ['2026-07-03']
  };
}

function evaluationContext(calendars = [], timezone = 'America/Chicago') {
  return {
    asOfCivilDate: '2026-01-01',
    governingTimezoneBinding: {
      kind: 'configured',
      timezone,
      configurationId: 'truth-eval-timezone',
      configurationVersion: 'v1'
    },
    calendars
  };
}

async function deadlineRule(assertion, citation, options = {}) {
  const input = {
    schemaVersion: TruthSchema.DEADLINE_RULE_VERSION,
    partitionKey: PARTITION,
    familyId: assertion.familyId,
    operator: options.operator || 'add-calendar-days',
    anchorAssertionVersionId: assertion.assertionVersionId,
    amount: options.amount || 1,
    boundary: own(options, 'boundary') ? options.boundary : 'exclusive',
    timezone: own(options, 'timezone') ? options.timezone : 'America/Chicago',
    businessCalendarId: options.businessCalendarId || null,
    businessCalendarVersionId: options.businessCalendarVersionId || null,
    consequence: options.consequence === false ? null : {
      assertionVersionId: assertion.assertionVersionId,
      citationIds: [citation.citationId]
    },
    citedInputAssertionVersionIds: [assertion.assertionVersionId],
    citationIds: [citation.citationId]
  };
  const rule = {
    ...input,
    deadlineRuleId: await TruthSchema.deriveDeadlineRuleId(input)
  };
  const parsed = await TruthSchema.parseDeadlineRule(rule, [assertion], [citation]);
  assert.ok(parsed, 'production schema constructs a closed deadline rule');
  return parsed;
}

async function deadlineFixture(options = {}) {
  const citation = await deadlineEvidence();
  const assertion = await deadlineAssertion(citation, options.anchorDate || '2026-07-02');
  const rule = await deadlineRule(assertion, citation, options);
  const context = TruthSchema.parseEvaluationContext(
    evaluationContext(options.calendars || [], options.contextTimezone || 'America/Chicago'),
    [citation]
  );
  assert.ok(context, 'production schema constructs the explicit evaluation context');
  return { citation, assertion, rule, context };
}

async function evaluateDeadline(fixture, rule = fixture.rule, context = fixture.context) {
  return DeadlineEngine.evaluateRule(
    rule,
    [fixture.assertion],
    [fixture.citation],
    context
  );
}

async function exerciseDeadlineEngine() {
  for (const [anchorDate, expected] of [
    ['2000-02-28', '2000-02-29'],
    ['2026-01-31', '2026-02-01'],
    ['2025-12-31', '2026-01-01']
  ]) {
    const fixture = await deadlineFixture({ anchorDate });
    const result = await evaluateDeadline(fixture);
    assert.strictEqual(result.deadlineCivilDate, expected);
    assert.strictEqual(result.eligibility, 'eligible');
  }
  const leap = DeadlineEngine.parseCivilDate('2000-02-29');
  assert.deepStrictEqual(
    DeadlineEngine.fromOrdinal(DeadlineEngine.toOrdinal(leap)),
    leap
  );

  const calendar = businessCalendar();
  const missing = await deadlineFixture({
    operator: 'add-business-days',
    businessCalendarId: calendar.calendarId,
    businessCalendarVersionId: calendar.calendarVersionId
  });
  assert.deepStrictEqual(
    (await evaluateDeadline(missing)).blockerCodes,
    ['business-calendar-missing']
  );
  const supplied = await deadlineFixture({
    operator: 'add-business-days',
    businessCalendarId: calendar.calendarId,
    businessCalendarVersionId: calendar.calendarVersionId,
    calendars: [calendar]
  });
  const suppliedResult = await evaluateDeadline(supplied);
  assert.strictEqual(suppliedResult.deadlineCivilDate, '2026-07-06');
  assert.strictEqual(suppliedResult.calendarVersionId, calendar.calendarVersionId);

  const base = await deadlineFixture();
  for (const rule of [
    { ...base.rule, boundary: null },
    { ...base.rule, timezone: null },
    { ...base.rule, consequence: null },
    { ...base.rule, operator: 'model-evaluate-date' }
  ]) {
    const result = await evaluateDeadline(base, rule);
    assert.strictEqual(
      result,
      null,
      'an identity-stale deadline rule cannot produce a semantic result'
    );
  }
  const mismatchedContext = TruthSchema.parseEvaluationContext(
    evaluationContext([], 'America/New_York'),
    [base.citation]
  );
  assert.deepStrictEqual(
    (await evaluateDeadline(base, base.rule, mismatchedContext)).blockerCodes,
    ['evaluation-context-mismatch']
  );
  assert.strictEqual(
    await evaluateDeadline(base, { ...base.rule, computedDate: '2026-01-02' }),
    null
  );

  const subtraction = await deadlineFixture({
    anchorDate: '2026-12-31',
    operator: 'subtract-calendar-days',
    amount: 90
  });
  assert.strictEqual(
    (await evaluateDeadline(subtraction)).deadlineCivilDate,
    '2026-10-02'
  );
}

async function createAndExerciseTruthEngine({
  store,
  extractor,
  adjudicator,
  graph
}) {
  let effectCount = 0;
  const facade = TruthEngine.create({
    truthSchema: TruthSchema,
    truthStore: store,
    truthExtractor: extractor,
    lineageAdjudicator: adjudicator,
    deadlineEngine: DeadlineEngine,
    graphFacade: graph.facade,
    corpusTransport: Object.freeze({
      async readContent() {
        effectCount += 1;
        return Object.freeze({ kind: 'closed' });
      }
    }),
    async runCorpusOperation() {
      effectCount += 1;
      return Object.freeze({ decision: 'closed' });
    },
    async readVisibleSourceSet() {
      effectCount += 1;
      return Object.freeze({ status: 'closed' });
    },
    async validateEvaluationContext() {
      effectCount += 1;
      return Object.freeze({ ok: false, blockerCodes: ['evaluation-context-stale'] });
    },
    async readSettings() {
      effectCount += 1;
      return { modelProvider: 'eval-provider', modelName: 'eval-model' };
    },
    providerFactory() {
      effectCount += 1;
      return Object.freeze({});
    },
    byteLength(value) {
      return Buffer.byteLength(value, 'utf8');
    }
  });
  assert.ok(facade, 'production truth engine composes the six production layers');
  exactKeys(facade, [
    'recompute', 'inspectLineage', 'inspectFacts', 'inspectConflicts',
    'inspectCitations', 'inspectDeadline', 'inspectStatus', 'inspectDisplaySnapshot'
  ], 'production truth facade remains exactly eight methods');
  const missing = await facade.recompute(
    Object.freeze({ tabId: 73 }),
    Object.freeze({})
  );
  assert.deepStrictEqual(missing.blockerCodes, ['evaluation-context-missing']);
  assert.strictEqual(effectCount, 0,
    'missing caller context performs zero graph/provider/store/authority effect');
  return { facade, missing };
}

function verifyPackageOwnership() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const expectedGraph = [
    'node tests/skopeo-graph-schema.test.js',
    'node tests/universal-provider-cancellation.test.js',
    'node tests/skopeo-graph-store.test.js',
    'node tests/skopeo-graph-extractor.test.js',
    'node tests/skopeo-graph-query.test.js',
    'node tests/skopeo-graph-runtime.test.js',
    'node tests/skopeo-graph-evals.test.js'
  ].join(' && ');
  const expectedTruth = [
    'node tests/skopeo-truth-schema.test.js',
    'node tests/skopeo-deadline-engine.test.js',
    'node tests/skopeo-truth-extractor.test.js',
    'node tests/skopeo-lineage-adjudicator.test.js',
    'node tests/skopeo-truth-store.test.js',
    'node tests/skopeo-truth-runtime.test.js',
    'node tests/skopeo-truth-real-handoff.test.js',
    'node tests/skopeo-truth-evals.test.js'
  ].join(' && ');
  const expectedHud = [
    'node tests/skopeo-hud-schema.test.js',
    'node tests/skopeo-hud-projector.test.js',
    'node tests/skopeo-hud-runtime.test.js',
    'node tests/skopeo-hud-evals.test.js'
  ].join(' && ');
  assert.strictEqual(packageJson.scripts['test:skopeo-graph-evals'], expectedGraph,
    'existing graph aggregate remains unchanged and owns shared graph tests');
  assert.strictEqual(packageJson.scripts['test:skopeo-truth-evals'], expectedTruth,
    'truth aggregate has the exact stable eight-test order');
  assert.strictEqual(packageJson.scripts['test:skopeo-hud-evals'], expectedHud,
    'HUD aggregate has the exact schema, projector, runtime, eval order');
  const normal = packageJson.scripts.test;
  assert.strictEqual(normal.split('npm run test:skopeo-graph-evals').length - 1, 1);
  assert.strictEqual(normal.split('npm run test:skopeo-truth-evals').length - 1, 1);
  assert.strictEqual(normal.split('npm run test:skopeo-hud-evals').length - 1, 1);
  assert.strictEqual(normal.split('npm run test:skopeo-release-evals').length - 1, 1);
  assert.ok(normal.includes(
    'npm run test:skopeo-graph-evals && npm run test:skopeo-truth-evals && ' +
    'npm run test:skopeo-hud-evals && ' +
    'npm run test:skopeo-ask-evals && ' +
    'npm run test:skopeo-release-evals && ' +
    'node tests/skopeo-profile-schema.test.js'
  ), 'normal test runs HUD after truth, Ask after HUD, and release after Ask');
  for (const file of [
    'skopeo-truth-schema.test.js',
    'skopeo-deadline-engine.test.js',
    'skopeo-truth-extractor.test.js',
    'skopeo-lineage-adjudicator.test.js',
    'skopeo-truth-store.test.js',
    'skopeo-truth-runtime.test.js',
    'skopeo-truth-real-handoff.test.js',
    'skopeo-truth-evals.test.js'
  ]) {
    assert.strictEqual(expectedTruth.split(`tests/${file}`).length - 1, 1,
      `${file} is owned once by the truth aggregate`);
    assert.strictEqual(expectedGraph.includes(file), false,
      `${file} is not duplicated by the graph aggregate`);
  }
  const dependencyText = JSON.stringify({
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies
  }).toLowerCase();
  for (const token of [
    'phoenix', 'langsmith', 'langfuse', 'braintrust', 'promptfoo',
    'ragas', 'langchain', 'llamaindex'
  ]) {
    assert.strictEqual(dependencyText.includes(token), false,
      `evaluation adds no ${token} dependency`);
  }
}

function verifyStaticPrivacy(productionObservations) {
  const productionFiles = [
    'extension/utils/skopeo-truth-schema.js',
    'extension/utils/skopeo-truth-extractor.js',
    'extension/utils/skopeo-lineage-adjudicator.js',
    'extension/utils/skopeo-deadline-engine.js',
    'extension/utils/skopeo-truth-store.js',
    'extension/utils/skopeo-truth-engine.js',
    'extension/background.js'
  ];
  const productionText = productionFiles
    .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'))
    .join('\n');
  const observedText = JSON.stringify(productionObservations);
  for (const item of cases) {
    for (const marker of item.forbidden_marker_probes) {
      assert.strictEqual(productionText.includes(marker), false,
        `${item.id} marker is absent from production code`);
      assert.strictEqual(observedText.includes(marker), false,
        `${item.id} marker is absent from runtime/store observations`);
    }
  }
  const engineSource = fs.readFileSync(
    path.join(ROOT, 'extension', 'utils', 'skopeo-truth-engine.js'),
    'utf8'
  );
  assert.strictEqual(/\bDate\.parse\s*\(/.test(engineSource), false);
  assert.strictEqual(/\b(?:chrome\.alarms|chrome\.notifications)\b/.test(engineSource), false);
  assert.strictEqual(/\b(?:registerMcp|createServer|child_process)\b/.test(engineSource), false);
  assert.match(engineSource, /graphFacade\.snapshotExactSet/);
  assert.strictEqual(/\bgraphStore\b/.test(engineSource), false);
}

function installNetworkTripwire() {
  const names = ['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource'];
  const descriptors = new Map(names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name)
  ]));
  let attempts = 0;
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value() {
        attempts += 1;
        throw new Error(`network forbidden in truth evaluation: ${name}`);
      }
    });
  }
  return Object.freeze({
    attempts() {
      return attempts;
    },
    restore() {
      for (const name of names) {
        const descriptor = descriptors.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
}

async function verifyProductionHarness() {
  assert.strictEqual(globalThis.FsbSkopeoTruthSchema, TruthSchema);
  assert.strictEqual(globalThis.FsbSkopeoTruthExtractor, TruthExtractor);
  assert.strictEqual(globalThis.FsbSkopeoLineageAdjudicator, LineageAdjudicator);
  assert.strictEqual(globalThis.FsbSkopeoDeadlineEngine, DeadlineEngine);
  assert.strictEqual(globalThis.FsbSkopeoTruthStore, TruthStore);
  assert.strictEqual(globalThis.FsbSkopeoTruthEngine, TruthEngine);

  const tripwire = installNetworkTripwire();
  try {
    const fixture = await issuedFixture();
    await verifyCandidateAdmission(fixture);
    const extractor = createProductionExtractor();
    const extracted = await exerciseProductionExtractor(extractor, fixture);
    const store = createProductionStore();
    const recovered = await exerciseProductionStore(store);
    const graph = await createProductionGraphFacade();
    const adjudication = await createAndExerciseAdjudicator();
    await exerciseDeadlineEngine();
    const runtime = await createAndExerciseTruthEngine({
      store: store.store,
      extractor: extractor.extractor,
      adjudicator: adjudication.adjudicator,
      graph
    });
    verifyPackageOwnership();
    verifyStaticPrivacy({
      extracted,
      recovered,
      graphSnapshot: graph.snapshot,
      closedAdjudication: adjudication.closed,
      missingContext: runtime.missing,
      durableState: store.memory.snapshot()
    });
    assert.strictEqual(tripwire.attempts(), 0,
      'all 24 structural/security evaluations remain network-free');
  } finally {
    tripwire.restore();
  }
}

(async () => {
  let deterministicStatus = 'fail';
  let provisionalStatus = 'fail';
  let domainStatus = 'human_needed';
  let failure = null;
  try {
    verifyFixtureShape();
    domainStatus = domainReviewStatus(cases);
    assert.strictEqual(domainStatus, 'human_needed',
      'pending synthetic fixtures cannot become expert-approved truth');
    verifyProvisionalRegression();
    provisionalStatus = 'pass';
    await verifyProductionHarness();
    deterministicStatus = 'pass';
  } catch (error) {
    failure = error;
  }
  console.log(`deterministic_structural_security: ${deterministicStatus}`);
  console.log(`provisional_regression: ${provisionalStatus} (not gold)`);
  console.log(`domain_fidelity: ${domainStatus}`);
  if (failure) throw failure;
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
