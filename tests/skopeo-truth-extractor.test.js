'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const EXTRACTOR_PATH = path.join(
  ROOT, 'extension', 'utils', 'skopeo-truth-extractor.js'
);
const VALIDATOR_PATH = path.join(
  ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js'
);
const GRAPH_SCHEMA_PATH = path.join(
  ROOT, 'extension', 'utils', 'skopeo-graph-schema.js'
);
const TRUTH_SCHEMA_PATH = path.join(
  ROOT, 'extension', 'utils', 'skopeo-truth-schema.js'
);

const validatorSource = fs.readFileSync(VALIDATOR_PATH, 'utf8');
if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);
const GraphSchema = require(GRAPH_SCHEMA_PATH);
const TruthSchema = require(TRUTH_SCHEMA_PATH);

const CONTRACT_MARKER = ['skopeo', 'truth', 'extractor', 'contract'].join(' ');
const ACCOUNT = 'permission-1';
const CORPUS = 'root-1';
const SOURCE = 'source-alpha';
const OTHER_SOURCE = 'source-beta';
const PARTITION = `scpk1:${ACCOUNT.length}:${ACCOUNT}${CORPUS.length}:${CORPUS}`;
const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const OTHER_FINGERPRINT = `sha256:${'b'.repeat(64)}`;
const AUTHORIZED_SET_DIGEST = `sgx1:${'c'.repeat(64)}`;
const NOW = 80_000;

const DOC_BASE = `sri1:${'1'.padStart(64, '0')}`;
const DOC_AMENDMENT = `sri1:${'2'.padStart(64, '0')}`;
const CLAUSE_NOTICE = `sri1:${'3'.padStart(64, '0')}`;
const CLAUSE_AMENDED = `sri1:${'9'.padStart(64, '0')}`;
const RECORD_BASE = `srv1:${'4'.padStart(64, '0')}`;
const RECORD_AMENDMENT = `srv1:${'5'.padStart(64, '0')}`;
const RECORD_CLAUSE = `srv1:${'6'.padStart(64, '0')}`;
const RECORD_AMENDED_CLAUSE = `srv1:${'9'.padStart(64, '0')}`;
const RELATION_DOCUMENT = `slv1:${'7'.padStart(64, '0')}`;
const RELATION_CLAUSE = `scv1:${'8'.padStart(64, '0')}`;

let passed = 0;

function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function exactKeys(value, keys, message) {
  assert.deepEqual(Object.keys(value).sort(), keys.slice().sort(), message);
  passed += 1;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function frozenTree(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      frozenTree(descriptor.value, seen);
  });
}

function containsMarker(value, marker, seen = new Set()) {
  if (typeof value === 'string') return value.includes(marker);
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      containsMarker(descriptor.value, marker, seen);
  });
}

function hasKey(value, names, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some((key) => {
    if (typeof key === 'string' && names.includes(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      hasKey(descriptor.value, names, seen);
  });
}

function operation() {
  return new AbortController();
}

let certificateSequence = 0;
function certificate(overrides = {}) {
  certificateSequence += 1;
  const target = Object.assign({
    decision: 'certified',
    operationId: `truth-operation-${certificateSequence}`,
    kind: 'ingestion',
    tabId: 7,
    origin: 'https://drive.google.com',
    generation: 4,
    contextEpoch: 100 + certificateSequence,
    authorityEpoch: 200 + certificateSequence,
    accountPermissionId: ACCOUNT,
    corpusRootFileId: CORPUS,
    sourceFileId: SOURCE,
    partitionEpoch: 300 + certificateSequence,
    sourceEpoch: 400 + certificateSequence,
    provedAt: NOW,
    contentFingerprint: Object.freeze({ value: FINGERPRINT }),
    metadataFingerprint: Object.freeze({ secret: 'PRIVATE_METADATA_MARKER' }),
    membershipFingerprint: Object.freeze({ secret: 'PRIVATE_MEMBERSHIP_MARKER' })
  }, overrides);
  Object.defineProperty(target, 'toJSON', {
    configurable: false,
    enumerable: false,
    writable: false,
    value() {
      throw new TypeError('Skopeo certificate is nonserializable');
    }
  });
  Object.freeze(target);
  return new Proxy(target, Object.freeze({}));
}

function contentReader(text, overrides = {}) {
  const calls = [];
  const payload = Object.freeze(Object.assign({
    byteHash: FINGERPRINT,
    exactByteLength: Buffer.byteLength(text, 'utf8'),
    text
  }, overrides));
  const read = async (sink, signal) => {
    calls.push({ sink, signal });
    await sink(payload, signal);
    return Object.freeze({ kind: 'ok' });
  };
  read.calls = calls;
  return read;
}

async function makeLocator({
  text,
  sourceFileId = SOURCE,
  contentFingerprint = FINGERPRINT,
  excerptId = 'excerpt_000001',
  start = 0,
  end = 1,
  sourceByteStart = 0
}) {
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint
  });
  const locator = await GraphSchema.parseEvidenceLocator({
    excerptId,
    start,
    end
  }, {
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    excerpts: [{
      excerptId,
      text,
      sourceByteStart,
      sourceByteEnd: sourceByteStart + Buffer.byteLength(text, 'utf8')
    }]
  });
  assert.ok(locator, 'issued locator fixture parses through the production graph schema');
  return locator;
}

async function issuedRegistry(text = 'executed effective notice amendment') {
  const evidenceHandles = [];
  const batchCount = Math.max(1, Math.ceil(text.length / 24000));
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const characterStart = batchIndex * 24000;
    const excerptText = text.slice(characterStart, characterStart + 3000);
    evidenceHandles.push({
      handle: batchIndex === 0 ? 'evidence:primary' : `evidence:batch_${batchIndex}`,
      locator: await makeLocator({
        text: excerptText,
        excerptId: `excerpt_${String(batchIndex * 8 + 1).padStart(6, '0')}`,
        sourceByteStart: Buffer.byteLength(text.slice(0, characterStart), 'utf8')
      })
    });
  }
  return {
    documentHandles: [
      {
        handle: 'doc:base',
        kind: 'agreement',
        stableRecordId: DOC_BASE,
        recordVersionId: RECORD_BASE
      },
      {
        handle: 'doc:amendment',
        kind: 'amendment',
        stableRecordId: DOC_AMENDMENT,
        recordVersionId: RECORD_AMENDMENT
      }
    ],
    clauseHandles: [
      {
        handle: 'clause:notice',
        kind: 'clause',
        stableRecordId: CLAUSE_NOTICE,
        recordVersionId: RECORD_CLAUSE,
        documentHandle: 'doc:base'
      },
      {
        handle: 'clause:amended',
        kind: 'clause',
        stableRecordId: CLAUSE_AMENDED,
        recordVersionId: RECORD_AMENDED_CLAUSE,
        documentHandle: 'doc:amendment'
      }
    ],
    relationHandles: [
      {
        handle: 'relation:document',
        kind: 'supersedes',
        relationVersionId: RELATION_DOCUMENT
      },
      {
        handle: 'relation:clause',
        kind: 'amends',
        relationVersionId: RELATION_CLAUSE
      }
    ],
    calendarHandles: [{
      handle: 'calendar:business_1',
      calendarId: 'calendar-us-business',
      calendarVersionId: 'calendar-us-business-v1'
    }],
    evidenceHandles
  };
}

function typedValues() {
  return {
    'signed-date': { kind: 'civil-date', value: '2026-01-02' },
    'effective-date': { kind: 'civil-date', value: '2026-02-03' },
    'expiration-date': { kind: 'civil-date', value: '2027-02-03' },
    'termination-date': { kind: 'civil-date', value: '2027-01-03' },
    renewal: {
      kind: 'renewal',
      mode: 'automatic',
      amount: 365,
      unit: 'calendar-days',
      anchorAssertionType: 'expiration-date'
    },
    'notice-window': {
      kind: 'notice-window',
      amount: 90,
      unit: 'calendar-days',
      relation: 'before',
      anchorAssertionType: 'expiration-date',
      boundary: 'exclusive'
    },
    'notice-deadline': { kind: 'civil-date', value: '2026-11-05' },
    'delivery-method': {
      kind: 'delivery-method',
      method: 'certified-mail',
      qualifier: 'return receipt requested'
    },
    'written-address': {
      kind: 'written-address',
      lines: ['100 Main Street', 'Suite 200'],
      recipient: 'Legal Department',
      city: 'Chicago',
      region: 'IL',
      postalCode: '60601',
      country: 'US'
    }
  };
}

function emptyEnvelope(batchId = 'truth_batch_000001') {
  return {
    schemaVersion: 1,
    batchId,
    executionCandidates: [],
    effectivenessCandidates: [],
    lineageCandidates: [],
    factCandidates: [],
    deadlineRuleCandidates: []
  };
}

function completeEnvelope() {
  const values = typedValues();
  return {
    schemaVersion: 1,
    batchId: 'truth_batch_complete',
    executionCandidates: [{
      candidateRef: 'execution:1',
      documentHandle: 'doc:base',
      executionState: 'executed',
      evidenceHandles: ['evidence:primary']
    }],
    effectivenessCandidates: [{
      candidateRef: 'effectiveness:1',
      documentHandle: 'doc:base',
      effectiveDate: { kind: 'civil-date', value: '2026-02-03' },
      evidenceHandles: ['evidence:primary']
    }],
    lineageCandidates: [
      {
        candidateRef: 'lineage:whole',
        documentHandle: 'doc:amendment',
        targetDocumentHandle: 'doc:base',
        targetClauseHandle: null,
        amendmentClauseHandle: null,
        relationHandle: 'relation:document',
        lineageRole: 'full-replacement',
        scope: 'document',
        evidenceHandles: ['evidence:primary']
      },
      {
        candidateRef: 'lineage:clause',
        documentHandle: 'doc:amendment',
        targetDocumentHandle: 'doc:base',
        targetClauseHandle: 'clause:notice',
        amendmentClauseHandle: 'clause:amended',
        relationHandle: 'relation:clause',
        lineageRole: 'partial-amendment',
        scope: 'clause',
        evidenceHandles: ['evidence:primary']
      }
    ],
    factCandidates: TruthSchema.ASSERTION_TYPES.map((assertionType, index) => ({
      candidateRef: `fact:${String(index).padStart(2, '0')}`,
      documentHandle: 'doc:base',
      clauseHandle: 'clause:notice',
      assertionType,
      typedValue: values[assertionType],
      evidenceHandles: ['evidence:primary']
    })),
    deadlineRuleCandidates: TruthSchema.DEADLINE_OPERATORS.map((operator, index) => ({
      candidateRef: `rule:${String(index).padStart(2, '0')}`,
      documentHandle: 'doc:base',
      clauseHandle: 'clause:notice',
      operator,
      anchorAssertionType: 'expiration-date',
      amount: 90,
      boundary: 'exclusive',
      timezone: 'America/Chicago',
      calendarHandle: operator.includes('business') ? 'calendar:business_1' : null,
      consequenceEvidenceHandle: 'evidence:primary',
      evidenceHandles: ['evidence:primary']
    }))
  };
}

async function truthContext(registry, batchOrdinal = 0, overrides = {}) {
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT
  });
  return Object.assign({
    schemaVersion: TruthSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    providerId: 'xai',
    modelId: 'configured-model',
    batchOrdinal,
    documentHandles: registry.documentHandles.map((item) => ({
      handle: item.handle,
      stableRecordId: item.stableRecordId,
      recordVersionId: item.recordVersionId
    })),
    clauseHandles: registry.clauseHandles.map((item) => ({
      handle: item.handle,
      stableRecordId: item.stableRecordId,
      recordVersionId: item.recordVersionId,
      documentHandle: item.documentHandle
    })),
    relationHandles: registry.relationHandles.map((item) => ({
      handle: item.handle,
      relationVersionId: item.relationVersionId
    })),
    calendarHandles: registry.calendarHandles.map((item) => ({
      handle: item.handle,
      calendarId: item.calendarId,
      calendarVersionId: item.calendarVersionId
    })),
    evidenceHandles: registry.evidenceHandles.map((item) => ({
      handle: item.handle,
      locator: item.locator
    }))
  }, overrides);
}

function makeProvider(settings, state) {
  return {
    async buildRequest(prompt, options) {
      state.calls.push({ type: 'build', settings, prompt, options });
      if (settings.modelProvider === 'gemini') {
        return {
          contents: [{ role: 'user', parts: [{ text: prompt.userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        };
      }
      if (settings.modelProvider === 'anthropic') {
        return {
          model: settings.modelName,
          system: prompt.systemPrompt,
          messages: [{ role: 'user', content: prompt.userPrompt }],
          temperature: 0.7,
          max_tokens: 2000
        };
      }
      return {
        model: settings.modelName,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      };
    },
    async sendRequest(body, options) {
      state.calls.push({ type: 'send', settings, body, options });
      const response = state.responses.shift();
      if (typeof response === 'function') return response(state.calls.at(-1), state);
      if (response instanceof Error) throw response;
      return { content: response === undefined ? JSON.stringify(emptyEnvelope()) : response };
    },
    parseResponse(response) {
      state.calls.push({ type: 'parse', settings });
      return {
        content: response.content,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: state.responseModel || settings.modelName
      };
    }
  };
}

function harness(Extractor, options = {}) {
  const state = {
    settings: Object.assign({
      modelProvider: 'xai',
      modelName: 'configured-model'
    }, options.settings),
    responses: Array.from(options.responses || []),
    responseModel: options.responseModel || null,
    calls: [],
    nonce: 0,
    durable: [],
    diagnostics: []
  };
  const extractor = Extractor.create({
    truthSchema: TruthSchema,
    providerFactory(settings) {
      state.calls.push({ type: 'factory', settings });
      return makeProvider(settings, state);
    },
    readSettings: async () => Object.assign({}, state.settings),
    nonceFactory() {
      state.nonce += 1;
      return `truth_nonce_${String(state.nonce).padStart(8, '0')}`;
    },
    now: () => NOW
  });
  return { extractor, state };
}

function calls(state, type) {
  return state.calls.filter((item) => item.type === type);
}

async function acknowledgeNoStorage(step, signal) {
  assert.equal(signal.aborted, false, 'acknowledgement receives the live operation signal');
  return Object.freeze({
    status: 'provider-no-storage',
    durableEffect: false,
    prepared: step
  });
}

async function prepare(Extractor, options = {}) {
  const text = options.text || 'executed effective notice amendment';
  const fixture = options.fixture || harness(Extractor, options);
  const registry = options.registry || await issuedRegistry(text);
  const controller = operation();
  const read = options.read || contentReader(text);
  const cert = options.certificate || certificate();
  const prepared = await fixture.extractor.prepareSource(
    cert,
    controller.signal,
    read,
    AUTHORIZED_SET_DIGEST,
    registry
  );
  return { fixture, registry, controller, read, cert, prepared };
}

async function next(fixture, session, options = {}) {
  const controller = options.controller || operation();
  return fixture.extractor.nextBatch(
    session,
    options.certificate || certificate(),
    controller.signal,
    options.acknowledge === undefined ? acknowledgeNoStorage : options.acknowledge
  );
}

async function preflightFixtureBuilders() {
  const registry = await issuedRegistry();
  const context = await truthContext(registry);
  const parsed = await TruthSchema.parseCandidateEnvelope(completeEnvelope(), context);
  assert.ok(parsed, 'complete extractor oracle fixture parses through the real truth schema');
  assert.equal(parsed.executionCandidates.length, 1);
  assert.equal(parsed.effectivenessCandidates.length, 1);
  assert.equal(parsed.lineageCandidates.length, 2);
  assert.deepEqual(
    parsed.factCandidates.map((item) => item.assertionType),
    Array.from(TruthSchema.ASSERTION_TYPES)
  );
  assert.deepEqual(
    parsed.deadlineRuleCandidates.map((item) => item.operator),
    Array.from(TruthSchema.DEADLINE_OPERATORS)
  );

  const providerState = {
    calls: [],
    responses: [JSON.stringify(emptyEnvelope())],
    responseModel: null
  };
  const provider = makeProvider({
    modelProvider: 'xai',
    modelName: 'configured-model'
  }, providerState);
  const body = await provider.buildRequest({
    systemPrompt: 'static',
    userPrompt: '{}'
  }, {});
  const wire = await provider.sendRequest(body, {
    attempt: 0,
    timeout: 20000,
    signal: operation().signal
  });
  assert.equal(provider.parseResponse(wire).model, 'configured-model');
}

async function runContract(Extractor) {
  exactKeys(
    Extractor,
    ['VERSION', 'PROMPT_VERSION', 'LIMITS', 'create'],
    'module exposes only the closed truth extractor surface'
  );
  check(Extractor.VERSION === 'skopeo-truth-extractor/v1', 'extractor version is locked');
  check(
    Extractor.PROMPT_VERSION === TruthSchema.PROMPT_VERSION,
    'extractor and truth schema prompt versions match'
  );
  assert.deepEqual(plain(Extractor.LIMITS), {
    MAX_EXCERPTS_PER_CALL: 8,
    MAX_EXCERPT_CHARACTERS_PER_CALL: 24000,
    MAX_NORMAL_CALLS_PER_GENERATION: 8,
    MAX_CHARACTERS_PER_GENERATION: 192000,
    MAX_REPAIR_CALLS_PER_GENERATION: 1,
    PROVIDER_TIMEOUT_MS: 20000,
    MAX_OUTPUT_TOKENS: 2048,
    MAX_RESPONSE_CHARACTERS: 131072
  });
  passed += 1;
  check(Object.isFrozen(Extractor) && frozenTree(Extractor.LIMITS), 'module constants are frozen');
  check(globalThis.FsbSkopeoTruthExtractor === Extractor, 'classic global matches CommonJS');

  const surface = harness(Extractor).extractor;
  exactKeys(surface, [
    'prepareSource',
    'verifyProviderBinding',
    'nextBatch',
    'repairBatch',
    'finalize',
    'discard'
  ], 'factory exposes only the six closed lifecycle methods');
  check(Object.isFrozen(surface), 'created extractor facade is frozen');

  {
    const rawSourceMarker = 'RAW_SOURCE_PRIVATE_MARKER';
    const source = await prepare(Extractor, {
      text: `executed notice ${rawSourceMarker}`,
      responses: [
        `${JSON.stringify(completeEnvelope())}${' '.repeat(4)}`
      ]
    });
    exactKeys(source.prepared, ['session', 'providerBinding'],
      'preparation returns only a session and configured provider binding');
    assert.deepEqual(plain(source.prepared.providerBinding), {
      providerId: 'xai',
      modelId: 'configured-model'
    });
    passed += 1;
    exactKeys(source.prepared.session, [
      'partitionKey',
      'accountPermissionId',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'authorizedSetDigest',
      'truthSchemaVersion',
      'promptVersion',
      'providerId',
      'modelId'
    ], 'session exposes only immutable comparison bindings');
    check(Object.isFrozen(source.prepared.session), 'session capability is frozen');
    assert.throws(
      () => JSON.stringify(source.prepared.session),
      /nonserializable/i,
      'session cannot be serialized'
    );
    passed += 1;
    assert.throws(
      () => structuredClone(source.prepared.session),
      'session cannot cross a structured-clone boundary'
    );
    passed += 1;
    check(!containsMarker(source.prepared, rawSourceMarker),
      'preparation never exposes source text');
    check(!containsMarker(source.prepared, 'PRIVATE_METADATA_MARKER'),
      'preparation never exposes certificate metadata');
    check(!containsMarker(source.prepared, 'PRIVATE_MEMBERSHIP_MARKER'),
      'preparation never exposes membership proof');
    check(source.read.calls.length === 1 &&
      source.read.calls[0].signal === source.controller.signal,
    'content is consumed once with the exact operation signal');

    const providerController = operation();
    const step = await source.fixture.extractor.nextBatch(
      source.prepared.session,
      certificate(),
      providerController.signal,
      acknowledgeNoStorage
    );
    exactKeys(step, ['status', 'rawResponse', 'outcome'],
      'provider step has the exact ephemeral result shape');
    check(step.status === 'provider-step', 'provider step status is closed');
    check(step.outcome.status === 'validated-batch', 'valid truth envelope is admitted');
    check(step.rawResponse.includes('truth_batch_complete'),
      'raw response remains only in the ephemeral provider step');
    check(step.outcome.batch.factCandidates.length === 9,
      'all nine typed fact candidates are normalized');
    check(step.outcome.batch.deadlineRuleCandidates.length === 4,
      'all four closed deadline operators are normalized');
    check(step.outcome.batch.lineageCandidates.some((item) =>
      item.scope === 'document' && item.lineageRole === 'full-replacement'),
    'whole-document lineage language is preserved as candidate data');
    check(step.outcome.batch.lineageCandidates.some((item) =>
      item.scope === 'clause' && item.lineageRole === 'partial-amendment'),
    'clause-scoped lineage language is preserved as candidate data');
    check(
      step.outcome.batch.factCandidates[0].evidence[0].locatorId ===
        source.registry.evidenceHandles[0].locator.locatorId,
      'issued evidence locator identity is preserved exactly'
    );
    check(frozenTree(step.outcome.batch), 'normalized candidate batch is recursively frozen');

    const build = calls(source.fixture.state, 'build')[0];
    exactKeys(build.prompt, ['systemPrompt', 'userPrompt'],
      'configured provider receives one static prompt pair');
    check(
      /inert data/i.test(build.prompt.systemPrompt) &&
        /bare JSON object/i.test(build.prompt.systemPrompt) &&
        /never.*governing|governing.*never/i.test(build.prompt.systemPrompt),
      'static prompt fixes inert-source, bare-JSON, and candidate-only policy'
    );
    check(!build.prompt.systemPrompt.includes(rawSourceMarker),
      'static system prompt contains no source-derived bytes');
    const requestEnvelope = JSON.parse(build.prompt.userPrompt);
    exactKeys(requestEnvelope, [
      'batchNonce',
      'schemaVersion',
      'promptVersion',
      'excerpts',
      'documentHandles',
      'clauseHandles',
      'relationHandles',
      'calendarHandles',
      'evidenceHandles',
      'assertionTypes',
      'executionStates',
      'lineageRoles',
      'deadlineOperators'
    ], 'user prompt is one closed inert data envelope');
    check(requestEnvelope.excerpts.length === 1 &&
      requestEnvelope.excerpts[0].text.includes(rawSourceMarker),
    'only the source-local excerpt appears inside the user-data envelope');
    check(!containsMarker(requestEnvelope, OTHER_SOURCE),
      'provider envelope contains no second-source context');
    check(!containsMarker(requestEnvelope, SOURCE),
      'provider envelope contains no source identifier');
    check(!containsMarker(requestEnvelope, DOC_BASE),
      'provider envelope contains no durable graph identity');
    check(!hasKey(requestEnvelope, [
      'label', 'filename', 'url', 'rank', 'score', 'conversationHistory', 'tools'
    ]), 'provider envelope contains no graph labels, order hints, history, URLs, or tools');
    for (const projection of [
      ...requestEnvelope.documentHandles,
      ...requestEnvelope.clauseHandles,
      ...requestEnvelope.relationHandles
    ]) {
      exactKeys(projection, ['handle', 'kind'],
        'provider handle projections expose only engine handle and kind');
    }
    exactKeys(requestEnvelope.calendarHandles[0], ['handle'],
      'provider calendar projection exposes only its engine-issued opaque handle');
    exactKeys(requestEnvelope.evidenceHandles[0], ['handle', 'excerptId', 'start', 'end'],
      'provider evidence projection exposes only issued local range data');
    const send = calls(source.fixture.state, 'send')[0];
    check(send.settings.modelProvider === 'xai' &&
      send.settings.modelName === 'configured-model',
    'only the exact configured provider and model are instantiated');
    check(send.body.temperature === 0.1 && send.body.max_tokens === 2048,
      'OpenAI-compatible request pins sampling and output budget');
    exactKeys(send.options, ['attempt', 'timeout', 'signal'],
      'provider options contain only attempt, timeout, and caller signal');
    check(send.options.attempt === 0 && send.options.timeout === 20000 &&
      send.options.signal === providerController.signal,
    'provider call receives exact 20-second timeout and live operation signal');
    check(!hasKey(send.body, ['tools', 'tool_choice', 'functions', 'callbacks']),
      'provider request grants no tools or callbacks');

    const final = await source.fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      operation().signal
    );
    exactKeys(final, [
      'schemaVersion',
      'promptVersion',
      'partitionKey',
      'sourceFileId',
      'contentFingerprint',
      'fragmentGenerationId',
      'authorizedSetDigest',
      'providerId',
      'modelId',
      'candidateGenerationIds',
      'batches'
    ], 'final generation contains only bindings and normalized candidates');
    check(final.batches.length === 1 && frozenTree(final),
      'complete source generation finalizes as one frozen value');
    check(!containsMarker(final, rawSourceMarker),
      'finalized value contains no raw source marker');
    check(!containsMarker(source.fixture.state.diagnostics, rawSourceMarker) &&
      source.fixture.state.durable.length === 0,
    'diagnostics and fake durable state retain no raw source or truth writes');
    const afterFinal = await next(source.fixture, source.prepared.session);
    check(afterFinal.status === 'session-complete',
      'a finalized one-use session cannot perform another provider step');
  }

  {
    const exactText = 'A\r\nB\rCé';
    const registry = await issuedRegistry(exactText);
    registry.evidenceHandles = [
      {
        handle: 'evidence:crlf',
        locator: await makeLocator({
          text: exactText,
          start: 3,
          end: 4
        })
      },
      {
        handle: 'evidence:unicode',
        locator: await makeLocator({
          text: exactText,
          start: 6,
          end: 7
        })
      }
    ];
    const source = await prepare(Extractor, {
      text: exactText,
      registry,
      responses: [JSON.stringify(emptyEnvelope())]
    });
    assert.ok(source.prepared.session,
      'CRLF, lone-CR, and multibyte evidence remains valid against exact source bytes');
    await next(source.fixture, source.prepared.session);
    const requestEnvelope = JSON.parse(calls(source.fixture.state, 'build')[0].prompt.userPrompt);
    const excerpt = requestEnvelope.excerpts[0];
    assert.equal(excerpt.text, exactText,
      'provider excerpts preserve the exact fingerprinted newline representation');
    assert.equal(excerpt.sourceByteStart, 0);
    assert.equal(excerpt.sourceByteEnd, Buffer.byteLength(exactText, 'utf8'));
    for (const handle of requestEnvelope.evidenceHandles) {
      const issued = registry.evidenceHandles.find((item) => item.handle === handle.handle);
      assert.equal(
        excerpt.text.slice(handle.start, handle.end),
        exactText.slice(issued.locator.start, issued.locator.end),
        `${handle.handle} range selects the same exact source characters`
      );
      assert.equal(
        Buffer.byteLength(exactText.slice(0, handle.start), 'utf8'),
        issued.locator.sourceByteStart,
        `${handle.handle} start reproduces the fingerprinted UTF-8 byte stream`
      );
      assert.equal(
        Buffer.byteLength(exactText.slice(0, handle.end), 'utf8'),
        issued.locator.sourceByteEnd,
        `${handle.handle} end reproduces the fingerprinted UTF-8 byte stream`
      );
    }
  }

  for (const providerId of [
    'xai', 'openai', 'openrouter', 'custom', 'lmstudio', 'anthropic', 'gemini'
  ]) {
    const fixture = harness(Extractor, {
      settings: {
        modelProvider: providerId,
        modelName: `${providerId}-configured`
      },
      responses: [JSON.stringify(emptyEnvelope())]
    });
    const source = await prepare(Extractor, { fixture });
    const step = await next(fixture, source.prepared.session);
    check(step.outcome.status === 'validated-batch',
      `${providerId} configured request shape admits a valid batch`);
    const send = calls(fixture.state, 'send')[0];
    if (providerId === 'gemini') {
      check(send.body.generationConfig.temperature === 0.1 &&
        send.body.generationConfig.maxOutputTokens === 2048,
      'Gemini request pins provider-specific output controls');
    } else {
      check(send.body.temperature === 0.1 && send.body.max_tokens === 2048,
        `${providerId} request pins OpenAI/Anthropic-compatible output controls`);
    }
    check(calls(fixture.state, 'factory').length === 1,
      `${providerId} uses no fallback or second provider`);
  }

  {
    const fixture = harness(Extractor, {
      settings: { modelProvider: null, modelName: null }
    });
    const read = contentReader('x');
    const registry = await issuedRegistry('x');
    const result = await fixture.extractor.prepareSource(
      certificate(), operation().signal, read, AUTHORIZED_SET_DIGEST, registry
    );
    check(result.status === 'provider-unavailable',
      'missing configured provider/model fails before extraction');
    check(read.calls.length === 0 && calls(fixture.state, 'factory').length === 0,
      'missing configuration performs no source or provider work');
  }

  {
    const fixture = harness(Extractor);
    const read = contentReader('x');
    const rejected = await fixture.extractor.prepareSource(
      certificate(),
      operation().signal,
      read,
      `sha256:${'c'.repeat(64)}`,
      await issuedRegistry('x')
    );
    check(rejected.status === 'authorized-set-invalid',
      'a source fingerprint cannot substitute for the sgx1 exact-set digest');
    check(read.calls.length === 0 && calls(fixture.state, 'send').length === 0,
      'wrong digest namespace performs no source or provider work');
  }

  {
    const fixture = harness(Extractor, {
      responses: [JSON.stringify(emptyEnvelope())]
    });
    const source = await prepare(Extractor, { fixture });
    fixture.state.settings.modelName = 'drifted-model';
    const drift = await next(fixture, source.prepared.session);
    check(drift.status === 'provider-binding-changed',
      'provider/model drift invalidates the generation');
    check(calls(fixture.state, 'send').length === 0,
      'provider drift performs zero provider calls');
  }

  {
    const fixture = harness(Extractor, {
      responseModel: 'response-model-drift',
      responses: [JSON.stringify(emptyEnvelope())]
    });
    const source = await prepare(Extractor, { fixture });
    const mismatch = await next(fixture, source.prepared.session);
    check(mismatch.outcome.status === 'provider-binding-changed' &&
      mismatch.outcome.repairable === false,
    'response model mismatch is nonrepairable');
  }

  {
    const source = await prepare(Extractor, {
      responses: ['not-json REJECTED_RAW_PRIVATE', JSON.stringify(emptyEnvelope())]
    });
    const failed = await next(source.fixture, source.prepared.session);
    check(failed.outcome.status === 'model-json-invalid' &&
      failed.outcome.repairable === true,
    'bare-JSON failure is the one repairable parse category');
    const repair = await source.fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      failed.outcome,
      operation().signal,
      acknowledgeNoStorage
    );
    check(repair.outcome.status === 'validated-batch',
      'one fresh-authority repair may admit the same excerpt batch');
    const repairEnvelope = JSON.parse(calls(source.fixture.state, 'build')[1].prompt.userPrompt);
    exactKeys(repairEnvelope.repair, ['category', 'paths'],
      'repair receives fixed category and bounded paths only');
    check(!containsMarker(repairEnvelope, 'REJECTED_RAW_PRIVATE'),
      'repair never resends rejected output');
    check(repairEnvelope.repair.paths.length <= 16 &&
      repairEnvelope.repair.paths.every((item) => item.length <= 256),
    'repair metadata remains within the path count and length caps');
    const before = calls(source.fixture.state, 'send').length;
    const exhausted = await source.fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      failed.outcome,
      operation().signal,
      acknowledgeNoStorage
    );
    check(
      exhausted.status === 'repair-exhausted' ||
        exhausted.status === 'repair-not-allowed',
      'a generation permits at most one repair'
    );
    check(calls(source.fixture.state, 'send').length === before,
      'second repair performs zero provider work');
    const final = await source.fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      operation().signal
    );
    check(!containsMarker(final, 'REJECTED_RAW_PRIVATE') &&
      !containsMarker(source.fixture.state.diagnostics, 'REJECTED_RAW_PRIVATE') &&
      source.fixture.state.durable.length === 0,
    'finalization, diagnostics, and fake durable state retain no rejected response');
  }

  {
    const shaped = completeEnvelope();
    shaped.factCandidates[0].rank = 1;
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(shaped), JSON.stringify(emptyEnvelope())]
    });
    const failed = await next(source.fixture, source.prepared.session);
    check(failed.outcome.status === 'model-schema-invalid' &&
      failed.outcome.repairable === true,
    'closed-schema unknown field is repairable once');
    const wrongFailure = Object.freeze({
      status: failed.outcome.status,
      repairable: true,
      paths: failed.outcome.paths
    });
    const before = calls(source.fixture.state, 'send').length;
    const refused = await source.fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      wrongFailure,
      operation().signal,
      acknowledgeNoStorage
    );
    check(refused.status === 'repair-not-allowed',
      'repair requires the exact prior failure capability');
    check(calls(source.fixture.state, 'send').length === before,
      'forged repair identity performs zero provider work');
  }

  const forbiddenFields = [
    'graphLabel',
    'crossSourceText',
    'rank',
    'filename',
    'recency',
    'similarity',
    'order',
    'confidence',
    'majority',
    'governing',
    'eligible',
    'trustState',
    'computedDate',
    'id',
    'url',
    'tool',
    'code',
    'expression',
    '__hidden'
  ];
  for (const field of forbiddenFields) {
    const hostile = completeEnvelope();
    hostile.factCandidates[0][field] =
      field === 'governing' || field === 'eligible' ? true : 'forbidden';
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(hostile)]
    });
    const rejected = await next(source.fixture, source.prepared.session);
    check(
      rejected.outcome.status === 'model-schema-invalid' &&
        !Object.prototype.hasOwnProperty.call(rejected.outcome, 'batch'),
      `forbidden candidate authority field ${field} rejects the whole batch`
    );
  }

  {
    const forged = completeEnvelope();
    forged.factCandidates[0].evidenceHandles = ['evidence:forged'];
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(forged)]
    });
    const rejected = await next(source.fixture, source.prepared.session);
    check(rejected.outcome.status === 'model-semantic-invalid' &&
      rejected.outcome.repairable === false,
    'forged evidence handle is nonrepairable semantic output');
    const before = calls(source.fixture.state, 'send').length;
    const repair = await source.fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      rejected.outcome,
      operation().signal,
      acknowledgeNoStorage
    );
    check(repair.status === 'repair-not-allowed' &&
      calls(source.fixture.state, 'send').length === before,
    'semantic evidence failure cannot invoke repair');
  }

  {
    const forged = completeEnvelope();
    forged.deadlineRuleCandidates
      .find((candidate) => candidate.operator === 'add-business-days')
      .calendarHandle = 'calendar-us-business';
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(forged)]
    });
    const rejected = await next(source.fixture, source.prepared.session);
    check(rejected.outcome.status === 'model-semantic-invalid' &&
      rejected.outcome.repairable === false,
    'a guessed durable calendar identifier cannot substitute for an issued handle');
  }

  {
    const fixture = harness(Extractor, {
      responses: [
        JSON.stringify(emptyEnvelope('truth_batch_first')),
        JSON.stringify(completeEnvelope())
      ]
    });
    const source = await prepare(Extractor, {
      fixture,
      text: 'x'.repeat(24001)
    });
    const first = await next(fixture, source.prepared.session);
    check(first.outcome.status === 'validated-batch',
      'first batch validates before an unadvertised-handle probe');
    const second = await next(fixture, source.prepared.session);
    check(second.outcome.status === 'model-semantic-invalid' &&
      second.outcome.repairable === false,
    'a prior-batch evidence handle not advertised to the current call rejects');
  }

  {
    const foreignDocument = completeEnvelope();
    foreignDocument.factCandidates[0].documentHandle = 'doc:foreign';
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(foreignDocument)]
    });
    const rejected = await next(source.fixture, source.prepared.session);
    check(rejected.outcome.status === 'model-semantic-invalid',
      'unknown or cross-source document handle rejects');
  }

  for (const [name, mutate] of [
    ['foreign', (locator) => ({ ...locator, sourceFileId: OTHER_SOURCE })],
    ['stale', (locator) => ({ ...locator, contentFingerprint: OTHER_FINGERPRINT })],
    ['clipped', (locator) => ({
      ...locator,
      sourceByteEnd: locator.sourceByteStart
    })]
  ]) {
    const registry = await issuedRegistry('x');
    registry.evidenceHandles[0].locator = mutate(registry.evidenceHandles[0].locator);
    const fixture = harness(Extractor);
    const result = await fixture.extractor.prepareSource(
      certificate(),
      operation().signal,
      contentReader('x'),
      AUTHORIZED_SET_DIGEST,
      registry
    );
    check(result.status === 'registry-invalid',
      `${name} issued evidence registry rejects before provider work`);
    check(calls(fixture.state, 'send').length === 0,
      `${name} evidence performs zero provider work`);
  }

  {
    const overflow = emptyEnvelope();
    overflow.executionCandidates = Array.from({ length: 129 }, (_, index) => ({
      candidateRef: `execution:${index}`,
      documentHandle: 'doc:base',
      executionState: 'executed',
      evidenceHandles: ['evidence:primary']
    }));
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(overflow)]
    });
    const rejected = await next(source.fixture, source.prepared.session);
    check(rejected.outcome.status === 'model-schema-invalid',
      'candidate max-plus-one rejects the whole response');
  }

  {
    const text = 'abcdefgh';
    const registry = await issuedRegistry(text);
    for (let index = 1; index < 5; index += 1) {
      registry.evidenceHandles.push({
        handle: `evidence:${index}`,
        locator: await makeLocator({
          text,
          start: index,
          end: index + 1
        })
      });
    }
    const overflow = completeEnvelope();
    overflow.factCandidates[0].evidenceHandles =
      registry.evidenceHandles.map((item) => item.handle).sort();
    const source = await prepare(Extractor, {
      text,
      registry,
      responses: [JSON.stringify(overflow)]
    });
    const rejected = await next(source.fixture, source.prepared.session);
    check(rejected.outcome.status === 'model-semantic-invalid',
      'evidence-per-candidate max-plus-one rejects semantically');
  }

  {
    const exactRaw = JSON.stringify(emptyEnvelope());
    const source = await prepare(Extractor, {
      responses: [
        exactRaw + ' '.repeat(131072 - exactRaw.length)
      ]
    });
    const exact = await next(source.fixture, source.prepared.session);
    check(exact.outcome.status === 'validated-batch',
      'exact 131,072-character raw response cap parses');

    const overflow = await prepare(Extractor, {
      responses: ['x'.repeat(131073)]
    });
    const rejected = await next(overflow.fixture, overflow.prepared.session);
    check(rejected.outcome.status === 'model-response-too-large' &&
      rejected.outcome.repairable === false &&
      rejected.rawResponse === null,
    'raw response max-plus-one is nonrepairable and is not retained');
  }

  {
    const over = await prepare(Extractor, {
      text: 'x'.repeat(192001)
    });
    check(over.prepared.status === 'budget-exceeded',
      'source character max-plus-one rejects before provider work');
    check(calls(over.fixture.state, 'send').length === 0,
      'over-budget source performs zero provider calls');
  }

  {
    const fixture = harness(Extractor, {
      responses: Array.from({ length: 8 }, (_, index) =>
        JSON.stringify(emptyEnvelope(`truth_batch_${String(index).padStart(6, '0')}`)))
    });
    const source = await prepare(Extractor, {
      fixture,
      text: 'x'.repeat(192000)
    });
    for (let index = 0; index < 8; index += 1) {
      const step = await next(fixture, source.prepared.session);
      check(step.outcome.status === 'validated-batch',
        `normal truth batch ${index + 1} validates`);
    }
    const builds = calls(fixture.state, 'build');
    check(builds.length === 8, 'exact source budget performs eight normal calls');
    for (const build of builds) {
      const envelope = JSON.parse(build.prompt.userPrompt);
      check(envelope.excerpts.length === 8,
        'each full call uses the exact eight-excerpt cap');
      check(envelope.excerpts.reduce((sum, item) => sum + item.text.length, 0) === 24000,
        'each full call uses the exact 24,000-character cap');
    }
    const complete = await next(fixture, source.prepared.session);
    check(complete.status === 'complete', 'ninth invocation performs no provider work');
    check(calls(fixture.state, 'send').length === 8,
      'normal-call cap remains exactly eight');
    const final = await fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      operation().signal
    );
    check(final.batches.length === 8 &&
      final.candidateGenerationIds.length === 8,
    'exact eight-call coverage finalizes one complete generation');
  }

  {
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(emptyEnvelope())]
    });
    const noAcknowledgement = await next(source.fixture, source.prepared.session, {
      acknowledge: async () => Object.freeze({
        status: 'provider-no-storage',
        durableEffect: true,
        prepared: null
      })
    });
    check(noAcknowledgement.outcome.status === 'provider-no-storage-required',
      'invalid no-storage acknowledgement admits no candidate batch');
    const final = await source.fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      operation().signal
    );
    check(final.status === 'session-invalid' ||
      final.status === 'generation-incomplete',
    'finalization cannot publish without exact no-storage acknowledgement');
  }

  {
    const fixture = harness(Extractor, {
      responses: [new Error('RAW_PROVIDER_ERROR_PRIVATE')]
    });
    const source = await prepare(Extractor, { fixture });
    const failed = await next(fixture, source.prepared.session);
    check(failed.status === 'provider-failed' &&
      !containsMarker(failed, 'RAW_PROVIDER_ERROR_PRIVATE'),
    'provider timeout/error category omits raw provider error bytes');
    check(!containsMarker(fixture.state.diagnostics, 'RAW_PROVIDER_ERROR_PRIVATE') &&
      fixture.state.durable.length === 0,
    'provider error leaves no diagnostic payload or durable effect');
  }

  {
    let release;
    const fixture = harness(Extractor, {
      responses: [async () => {
        await new Promise((resolve) => { release = resolve; });
        return { content: JSON.stringify(emptyEnvelope()) };
      }]
    });
    const source = await prepare(Extractor, { fixture });
    const controller = operation();
    const pending = next(fixture, source.prepared.session, { controller });
    while (!release) await Promise.resolve();
    controller.abort('PRIVATE_LATE_ABORT_REASON');
    release();
    const cancelled = await pending;
    check(cancelled.status === 'cancelled',
      'late provider completion after cancellation is rejected');
    check(!containsMarker(cancelled, 'PRIVATE_LATE_ABORT_REASON'),
      'cancellation result omits caller abort reason');
    const before = calls(fixture.state, 'send').length;
    const later = await next(fixture, source.prepared.session);
    check(later.status === 'cancelled' &&
      calls(fixture.state, 'send').length === before,
    'cancelled session permits no fallback or late provider effect');
  }

  {
    const fixture = harness(Extractor);
    const controller = operation();
    controller.abort('PRIVATE_PRE_ABORT_REASON');
    const read = contentReader('x');
    const result = await fixture.extractor.prepareSource(
      certificate(),
      controller.signal,
      read,
      AUTHORIZED_SET_DIGEST,
      await issuedRegistry('x')
    );
    check(result.status === 'cancelled', 'already-aborted preparation fails closed');
    check(read.calls.length === 0 && calls(fixture.state, 'send').length === 0,
      'already-aborted operation performs no source or provider work');
  }

  {
    const fixture = harness(Extractor, {
      responses: [async (send) => {
        await new Promise((_resolve, reject) => {
          const onAbort = () => {
            send.options.signal.removeEventListener('abort', onAbort);
            const error = new Error('PRIVATE_BACKOFF_ABORT');
            error.name = 'AbortError';
            reject(error);
          };
          send.options.signal.addEventListener('abort', onAbort, { once: true });
        });
      }]
    });
    const source = await prepare(Extractor, { fixture });
    const controller = operation();
    const pending = next(fixture, source.prepared.session, { controller });
    while (calls(fixture.state, 'send').length === 0) await Promise.resolve();
    controller.abort('PRIVATE_BACKOFF_REASON');
    const cancelled = await pending;
    check(cancelled.status === 'cancelled',
      'caller cancellation propagates through provider fetch/backoff work');
    check(calls(fixture.state, 'send').length === 1,
      'cancelled provider work performs no fallback retry');
  }

  {
    const fixture = harness(Extractor, {
      responses: [JSON.stringify(emptyEnvelope())]
    });
    const source = await prepare(Extractor, { fixture });
    const sameCertificate = certificate();
    const verified = await fixture.extractor.verifyProviderBinding(
      source.prepared.session,
      sameCertificate,
      operation().signal
    );
    check(verified.status === 'provider-binding-current',
      'fresh authority verifies the exact provider binding');
    const replay = await fixture.extractor.nextBatch(
      source.prepared.session,
      sameCertificate,
      operation().signal,
      acknowledgeNoStorage
    );
    check(replay.status === 'certificate-reused',
      'each authority certificate is one-use');
    const foreign = await next(fixture, source.prepared.session, {
      certificate: certificate({ sourceFileId: OTHER_SOURCE })
    });
    check(foreign.status === 'session-binding-changed',
      'foreign source authority cannot enter the session');
  }

  {
    const source = await prepare(Extractor, {
      responses: [JSON.stringify(emptyEnvelope())]
    });
    const discarded = source.fixture.extractor.discard(source.prepared.session);
    check(discarded.status === 'discarded', 'discard closes the source session');
    const after = await next(source.fixture, source.prepared.session);
    check(after.status === 'session-discarded',
      'discarded session permits no provider or publication effect');
    check(source.fixture.state.durable.length === 0,
      'discard exposes no storage or truth publication authority');
  }

  const productionSource = fs.readFileSync(EXTRACTOR_PATH, 'utf8');
  check(/ProviderNoStorageResult/.test(productionSource),
    'production names the private provider no-storage acknowledgement contract');
  check(!/eval\s*\(|new\s+Function|WebSocket|fetch\s*\(/.test(productionSource),
    'extractor grants no dynamic code, socket, or direct network primitive');
  check(!/chrome\.storage|browser\.storage|indexedDB|localStorage|renderHud/.test(
    productionSource
  ), 'extractor has no storage, publication, or UI authority');
  check(!/Date\.parse|new\s+Date|searchGraph|snapshotExactSet|traverse/.test(
    productionSource
  ), 'extractor cannot compute dates, query the graph, or adjudicate across sources');

  console.log(`${CONTRACT_MARKER}: ${passed} assertions passed`);
}

async function main() {
  await preflightFixtureBuilders();
  if (!fs.existsSync(EXTRACTOR_PATH)) {
    console.error(CONTRACT_MARKER);
    process.exitCode = 1;
    return;
  }
  const Extractor = require(EXTRACTOR_PATH);
  await runContract(Extractor);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
