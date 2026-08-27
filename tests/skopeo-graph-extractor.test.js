'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const validatorSource = fs.readFileSync(
  path.join(root, 'extension', 'lib', 'cfworker-json-schema.min.js'),
  'utf8'
);
if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);

const GraphSchema = require('../extension/utils/skopeo-graph-schema.js');
const Extractor = require('../extension/utils/skopeo-graph-extractor.js');

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function exactKeys(value, keys, message) {
  assert.deepStrictEqual(Object.keys(value).sort(), keys.slice().sort(), message);
  passed += 1;
}

function frozenTree(value, seen) {
  if (!value || typeof value !== 'object') return true;
  const visited = seen || new Set();
  if (visited.has(value)) return true;
  visited.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      frozenTree(descriptor.value, visited);
  });
}

function containsMarker(value, marker, seen) {
  if (typeof value === 'string') return value.includes(marker);
  if (!value || typeof value !== 'object') return false;
  const visited = seen || new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  return Reflect.ownKeys(value).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      containsMarker(descriptor.value, marker, visited);
  });
}

function hasKey(value, forbidden, seen) {
  if (!value || typeof value !== 'object') return false;
  const visited = seen || new Set();
  if (visited.has(value)) return false;
  visited.add(value);
  return Reflect.ownKeys(value).some((key) => {
    if (typeof key === 'string' && forbidden.includes(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
      hasKey(descriptor.value, forbidden, visited);
  });
}

const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const OTHER_FINGERPRINT = `sha256:${'b'.repeat(64)}`;
const ACCOUNT = 'permission-1';
const CORPUS = 'root-1';
const SOURCE = 'source-alpha';
const PARTITION = `scpk1:${ACCOUNT.length}:${ACCOUNT}${CORPUS.length}:${CORPUS}`;
const NOW = 50_000;

function signal() {
  return new AbortController();
}

let certificateSequence = 0;
function certificate(overrides) {
  certificateSequence += 1;
  const target = Object.assign({
    decision: 'certified',
    operationId: `operation-${certificateSequence}`,
    kind: 'ingestion',
    tabId: 9,
    origin: 'https://drive.google.com',
    generation: 3,
    contextEpoch: 10 + certificateSequence,
    authorityEpoch: 20 + certificateSequence,
    accountPermissionId: ACCOUNT,
    corpusRootFileId: CORPUS,
    sourceFileId: SOURCE,
    partitionEpoch: 30 + certificateSequence,
    sourceEpoch: 40 + certificateSequence,
    provedAt: NOW,
    vendorScopeFileId: 'vendor-folder',
    physicalParentChain: Object.freeze(['vendor-folder', CORPUS]),
    metadataFingerprint: Object.freeze({ secret: 'METADATA_PRIVATE_MARKER' }),
    membershipFingerprint: Object.freeze({ secret: 'MEMBERSHIP_PRIVATE_MARKER' }),
    contentFingerprint: Object.freeze({ value: FINGERPRINT })
  }, overrides || {});
  Object.defineProperty(target, 'toJSON', {
    enumerable: false,
    configurable: false,
    writable: false,
    value() { throw new TypeError('Skopeo certificate is nonserializable'); }
  });
  Object.freeze(target);
  return new Proxy(target, Object.freeze({}));
}

function contentReader(text, overrides) {
  const calls = [];
  const values = Object.assign({
    byteHash: FINGERPRINT,
    exactByteLength: Buffer.byteLength(text, 'utf8'),
    text
  }, overrides || {});
  const read = async (operationSink, operationSignal) => {
    calls.push({ operationSink, operationSignal });
    await operationSink(Object.freeze(values), operationSignal);
    return Object.freeze({ kind: 'ok' });
  };
  read.calls = calls;
  return read;
}

function emptyEnvelope(batchId = 'batch_identifier_01') {
  return JSON.stringify({ schemaVersion: 1, batchId, records: [], relations: [] });
}

function oneRecordEnvelope(options) {
  const values = Object.assign({
    batchId: 'batch_identifier_01',
    candidateRef: 'record_1',
    kind: 'agreement',
    label: 'Synthetic Acme Party',
    excerptId: 'excerpt_000001',
    start: 0,
    end: 1,
    relations: []
  }, options || {});
  return JSON.stringify({
    schemaVersion: 1,
    batchId: values.batchId,
    records: [{
      candidateRef: values.candidateRef,
      kind: values.kind,
      label: values.label,
      evidence: [{ excerptId: values.excerptId, start: values.start, end: values.end }]
    }],
    relations: values.relations
  });
}

function makeRecordedProvider(settings, state) {
  const calls = state.calls;
  return {
    async buildRequest(prompt, options) {
      calls.push({ type: 'build', settings, prompt, options });
      if (settings.modelProvider === 'gemini') {
        return {
          contents: [{ role: 'user', parts: [{ text: `${prompt.systemPrompt}\n${prompt.userPrompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
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
      calls.push({ type: 'send', settings, body, options });
      const item = state.responses.shift();
      if (typeof item === 'function') return { content: await item(calls.at(-1), calls) };
      if (item instanceof Error) throw item;
      return { content: item === undefined ? emptyEnvelope() : item };
    },
    parseResponse(response) {
      calls.push({ type: 'parse', settings });
      return {
        content: response.content,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: settings.modelName
      };
    }
  };
}

function harness(options) {
  const values = options || {};
  const state = {
    settings: Object.assign({ modelProvider: 'xai', modelName: 'configured-model' }, values.settings),
    responses: Array.from(values.responses || []),
    calls: [],
    nonces: 0
  };
  const extractor = Extractor.create({
    graphSchema: GraphSchema,
    providerFactory: (settings) => {
      state.calls.push({ type: 'factory', settings });
      return makeRecordedProvider(settings, state);
    },
    readSettings: async () => Object.assign({}, state.settings),
    nonceFactory: () => {
      state.nonces += 1;
      return `batch_nonce_${String(state.nonces).padStart(8, '0')}`;
    },
    now: () => NOW
  });
  return { extractor, state };
}

function sends(state) {
  return state.calls.filter((call) => call.type === 'send');
}

function builds(state) {
  return state.calls.filter((call) => call.type === 'build');
}

async function prepare(fixture, text, overrides) {
  const cert = certificate(overrides && overrides.certificate);
  const controller = signal();
  const read = contentReader(text, overrides && overrides.content);
  const prepared = await fixture.extractor.prepareSource(cert, controller.signal, read);
  return { cert, controller, read, prepared };
}

function makeRecords(count, excerptId = 'excerpt_000001') {
  return Array.from({ length: count }, (_, index) => ({
    candidateRef: `record_${index}`,
    kind: 'agreement',
    label: `Synthetic Label ${index}`,
    evidence: [{ excerptId, start: index, end: index + 1 }]
  }));
}

function makeRelations(count, excerptId = 'excerpt_000001') {
  return Array.from({ length: count }, (_, index) => ({
    fromCandidateRef: 'agreement',
    predicate: 'contains',
    toCandidateRef: 'clause',
    evidence: [{ excerptId, start: index, end: index + 1 }]
  }));
}

async function next(fixture, session, certOverrides) {
  const controller = signal();
  return fixture.extractor.nextBatch(
    session,
    certificate(certOverrides),
    controller.signal
  );
}

(async () => {
  exactKeys(Extractor, ['VERSION', 'PROMPT_VERSION', 'LIMITS', 'create'],
    'skopeo graph extractor contract exposes only the closed module surface');
  check(globalThis.FsbSkopeoGraphExtractor === Extractor,
    'FsbSkopeoGraphExtractor classic global matches CommonJS');
  check(Object.isFrozen(Extractor), 'extractor module surface is frozen');
  check(Extractor.PROMPT_VERSION === GraphSchema.PROMPT_VERSION,
    'extractor and graph prompt versions are identical');
  assert.deepStrictEqual(Extractor.LIMITS, {
    MAX_EXCERPTS_PER_CALL: 8,
    MAX_EXCERPT_CHARACTERS_PER_CALL: 24000,
    MAX_NORMAL_CALLS_PER_GENERATION: 8,
    MAX_CHARACTERS_PER_GENERATION: 192000,
    MAX_REPAIR_CALLS_PER_GENERATION: 1,
    MAX_OUTPUT_TOKENS: 2048,
    MAX_RESPONSE_CHARACTERS: 131072,
    MAX_PRIOR_CANDIDATES: 128,
    MAX_PRIOR_CANDIDATE_BYTES: 16384
  });
  passed += 1;
  exactKeys(harness().extractor, [
    'prepareSource', 'verifyProviderBinding', 'nextBatch', 'repairBatch',
    'finalize', 'reuseKey', 'discard'
  ], 'created extractor exposes only the closed state-machine methods');

  {
    const secret = 'RAW_CONFIDENTIAL_ALPHA';
    const text = `αgreement\r\nclause ${secret}`;
    const fixture = harness({ responses: [oneRecordEnvelope()] });
    const source = await prepare(fixture, text);
    exactKeys(source.prepared, ['session', 'providerBinding'],
      'preparation returns exact session and provider binding');
    assert.deepStrictEqual(source.prepared.providerBinding, {
      providerId: 'xai', modelId: 'configured-model'
    });
    passed += 1;
    exactKeys(source.prepared.session, [
      'partitionKey', 'accountPermissionId', 'sourceFileId', 'contentFingerprint',
      'graphSchemaVersion', 'promptVersion', 'providerId', 'modelId'
    ], 'session exposes only the eight comparison invariants');
    check(source.prepared.session.partitionKey === PARTITION, 'partition key is locally derived');
    check(source.prepared.session.contentFingerprint === FINGERPRINT,
      'session binds the certified byte fingerprint');
    check(Object.isFrozen(source.prepared.session), 'session capability is frozen');
    assert.throws(() => JSON.stringify(source.prepared.session), /nonserializable/i,
      'session cannot be JSON serialized');
    passed += 1;
    assert.throws(() => structuredClone(source.prepared.session),
      'session cannot cross a structured clone boundary');
    passed += 1;
    check(!containsMarker(source.prepared, secret), 'public preparation contains no source text');
    check(!containsMarker(source.prepared, 'METADATA_PRIVATE_MARKER'),
      'session omits certificate metadata');
    check(!containsMarker(source.prepared, 'MEMBERSHIP_PRIVATE_MARKER'),
      'session omits certificate membership');
    check(source.read.calls.length === 1 &&
      source.read.calls[0].operationSignal === source.controller.signal &&
      typeof source.read.calls[0].operationSink === 'function',
      'preparation consumes the content reader once with the exact operation signal');

    const providerController = signal();
    const preparedStep = await fixture.extractor.nextBatch(
      source.prepared.session,
      certificate(),
      providerController.signal
    );
    exactKeys(preparedStep, ['status', 'rawResponse', 'outcome'],
      'provider step has the exact ephemeral shape');
    check(preparedStep.status === 'provider-step', 'provider step status is closed');
    check(preparedStep.outcome.status === 'validated-batch', 'valid response admits a batch');
    check(preparedStep.rawResponse.includes('Synthetic Acme Party'),
      'raw response is confined to the ephemeral prepared result');
    check(!containsMarker(preparedStep.outcome.batch, secret),
      'validated batch never contains raw source text');
    check(!containsMarker(source.prepared.session, 'Synthetic Acme Party'),
      'session public state never contains derived labels');
    check(preparedStep.outcome.batch.records[0].label === 'Synthetic Acme Party',
      'derived label survives only in the validated authoritative record');
    check(preparedStep.outcome.batch.records[0].evidence[0].sourceByteStart === 0 &&
      preparedStep.outcome.batch.records[0].evidence[0].sourceByteEnd === 2,
    'evidence locator resolves the normalized UTF-8 byte range exactly');
    exactKeys(preparedStep.outcome.batch.records[0], [
      'schemaVersion', 'partitionKey', 'sourceFileId', 'contentFingerprint',
      'fragmentGenerationId', 'kind', 'label', 'evidence',
      'stableRecordId', 'recordVersionId'
    ], 'validated record strips response-local refs before staging');

    const build = builds(fixture.state)[0];
    exactKeys(build.prompt, ['systemPrompt', 'userPrompt'], 'provider receives one static prompt pair');
    check(!build.prompt.systemPrompt.includes(secret), 'system prompt contains no source bytes');
    const envelope = JSON.parse(build.prompt.userPrompt);
    exactKeys(envelope, [
      'batchNonce', 'schemaVersion', 'promptVersion', 'excerpts',
      'recordKinds', 'relationPredicates', 'priorCandidates'
    ], 'normal user envelope has only inert extraction data');
    check(envelope.excerpts.length === 1, 'short source produces one excerpt');
    assert.strictEqual(envelope.excerpts[0].text, `αgreement\nclause ${secret}`);
    passed += 1;
    check(envelope.excerpts[0].sourceByteStart === 0, 'normalized excerpt starts at byte zero');
    check(envelope.excerpts[0].sourceByteEnd ===
      Buffer.byteLength(envelope.excerpts[0].text, 'utf8'),
    'normalized excerpt has an exact UTF-8 ending offset');
    check(!containsMarker(envelope, 'source-alpha'), 'provider envelope omits source identity');
    check(!containsMarker(envelope, ACCOUNT), 'provider envelope omits account identity');
    check(!containsMarker(envelope, 'METADATA_PRIVATE_MARKER'),
      'provider envelope omits corpus metadata');
    check(!Object.prototype.hasOwnProperty.call(build.prompt, 'messages'),
      'extractor supplies no provider conversation history');
    const send = sends(fixture.state)[0];
    check(send.settings.modelProvider === 'xai' && send.settings.modelName === 'configured-model',
      'only the exact configured provider and model are constructed');
    check(send.body.temperature === 0.1 && send.body.max_tokens === 2048,
      'OpenAI-compatible request pins temperature and output cap');
    exactKeys(send.options, ['attempt', 'timeout', 'signal'],
      'provider send options are exact');
    check(send.options.attempt === 0 && send.options.timeout === 20000 &&
      send.options.signal === providerController.signal,
    'provider gets the exact live operation signal and timeout');
    check(!hasKey(send.body, ['tools', 'tool_choice', 'callbacks', 'functions']),
      'provider request grants no tools or callbacks');
  }

  {
    const fixture = harness({
      settings: { modelProvider: 'gemini', modelName: 'gemini-configured' },
      responses: [emptyEnvelope()]
    });
    const source = await prepare(fixture, 'x');
    await next(fixture, source.prepared.session);
    const send = sends(fixture.state)[0];
    check(send.body.generationConfig.temperature === 0.1 &&
      send.body.generationConfig.maxOutputTokens === 2048,
    'Gemini request pins provider-specific output controls');
    check(!Object.prototype.hasOwnProperty.call(send.body, 'max_tokens'),
      'Gemini request does not add the incompatible output field');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    const read = contentReader('x');
    const cert = certificate();
    const controller = signal();
    const source = await fixture.extractor.prepareSource(cert, controller.signal, read);
    const before = sends(fixture.state).length;
    const replay = await fixture.extractor.nextBatch(source.session, cert, signal().signal);
    check(replay.status === 'certificate-reused', 'preparation certificate cannot be replayed');
    const expired = await fixture.extractor.nextBatch(
      source.session,
      certificate({ provedAt: NOW - 30_001 }),
      signal().signal
    );
    check(expired.status === 'certificate-expired', 'expired certificate fails closed');
    const abortedController = signal();
    abortedController.abort('PRIVATE_ABORT_REASON');
    const aborted = await fixture.extractor.nextBatch(
      source.session,
      certificate(),
      abortedController.signal
    );
    check(aborted.status === 'cancelled', 'already-aborted operation fails closed');
    const foreign = await fixture.extractor.nextBatch(
      source.session,
      certificate({ sourceFileId: 'source-beta' }),
      signal().signal
    );
    check(foreign.status === 'session-binding-changed', 'second source is rejected');
    const changed = await fixture.extractor.nextBatch(
      source.session,
      certificate({ contentFingerprint: Object.freeze({ value: OTHER_FINGERPRINT }) }),
      signal().signal
    );
    check(changed.status === 'session-binding-changed', 'fingerprint change is rejected');
    check(sends(fixture.state).length === before,
      'replay, expiry, abort, and foreign invariants perform zero provider calls');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    const changed = await prepare(fixture, 'x', {
      content: { byteHash: OTHER_FINGERPRINT }
    });
    check(changed.prepared.status === 'content-fingerprint-changed',
      'content read changing the certified fingerprint yields no session');
    check(!Object.prototype.hasOwnProperty.call(changed.prepared, 'session'),
      'fingerprint drift exposes no partial session');
    check(sends(fixture.state).length === 0, 'fingerprint drift performs no provider work');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    const original = certificate();
    const clonedTarget = Object.fromEntries(Object.entries(original));
    Object.freeze(clonedTarget);
    const read = contentReader('x');
    const rejected = await fixture.extractor.prepareSource(
      clonedTarget,
      signal().signal,
      read
    );
    check(rejected.status === 'certificate-invalid',
      'plain cloned certificate data cannot create a session');
    check(read.calls.length === 0 && sends(fixture.state).length === 0,
      'cloned certificate fails before content or provider work');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    let sinkCalls = 0;
    const duplicateSinkRead = async (operationSink, operationSignal) => {
      const payload = Object.freeze({
        byteHash: FINGERPRINT,
        exactByteLength: 1,
        text: 'x'
      });
      sinkCalls += 1;
      await operationSink(payload, operationSignal);
      sinkCalls += 1;
      await operationSink(payload, operationSignal);
      return Object.freeze({ kind: 'ok' });
    };
    const rejected = await fixture.extractor.prepareSource(
      certificate(), signal().signal, duplicateSinkRead
    );
    check(rejected.status === 'content-unavailable' && sinkCalls === 2,
      'a content reader cannot reuse the one-use preparation sink');
    check(sends(fixture.state).length === 0,
      'duplicate content sink use performs zero provider work');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    const source = await prepare(fixture, 'x', {
      certificate: { contentFingerprint: null }
    });
    check(source.prepared.session.contentFingerprint === FINGERPRINT,
      'ingestion certificate without a stored fingerprint binds the transport byte hash');
    const step = await fixture.extractor.nextBatch(
      source.prepared.session,
      certificate({ contentFingerprint: null }),
      signal().signal
    );
    check(step.outcome.status === 'validated-batch',
      'fresh production ingestion certificate can preserve the transport-bound fingerprint');
    const noReuse = await fixture.extractor.reuseKey(
      certificate({ contentFingerprint: null }),
      'xai',
      'configured-model'
    );
    check(noReuse.status === 'content-fingerprint-unavailable',
      'reuse remains unavailable when fresh authority exposes no exact fingerprint');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope(), emptyEnvelope()] });
    const source = await prepare(fixture, 'first batch');
    const first = await next(fixture, source.prepared.session);
    check(first.outcome.status === 'validated-batch', 'first batch validates before drift');
    fixture.state.settings.modelName = 'changed-model';
    const callCount = sends(fixture.state).length;
    const drift = await next(fixture, source.prepared.session);
    assert.deepStrictEqual(drift, { status: 'provider-binding-changed' });
    passed += 1;
    check(sends(fixture.state).length === callCount,
      'provider drift is detected before constructing another call');
    const final = await fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      signal().signal
    );
    check(final.status === 'provider-binding-changed' || final.status === 'session-invalid',
      'provider drift permanently withholds publication');
  }

  {
    const text = 'A'.repeat(24000) + 'C';
    const fixture = harness({ responses: [
      oneRecordEnvelope({ candidateRef: 'same_ref', label: 'Synthetic Prior Agreement' }),
      async (send) => {
        const envelope = JSON.parse(send.body.messages[1].content);
        const prior = envelope.priorCandidates[0];
        return oneRecordEnvelope({
          batchId: 'batch_identifier_02',
          candidateRef: 'same_ref',
          kind: 'clause',
          label: 'Synthetic Current Clause',
          excerptId: 'excerpt_000009',
          relations: [{
            fromCandidateRef: prior.handle,
            predicate: 'contains',
            toCandidateRef: 'same_ref',
            evidence: [{ excerptId: 'excerpt_000009', start: 0, end: 1 }]
          }]
        });
      }
    ] });
    const source = await prepare(fixture, text);
    const first = await next(fixture, source.prepared.session);
    const second = await next(fixture, source.prepared.session);
    check(first.outcome.status === 'validated-batch' &&
      second.outcome.status === 'validated-batch',
    'response-local refs may repeat across batches with an advertised prior handle');
    const firstEnvelope = JSON.parse(builds(fixture.state)[0].prompt.userPrompt);
    const secondEnvelope = JSON.parse(builds(fixture.state)[1].prompt.userPrompt);
    check(firstEnvelope.excerpts.length === 8 &&
      firstEnvelope.excerpts.reduce((sum, item) => sum + item.text.length, 0) === 24000,
    'one call admits the exact 8-excerpt and 24,000-character maxima');
    check(secondEnvelope.excerpts.length === 1 && secondEnvelope.excerpts[0].text === 'C',
      'next batch preserves deterministic complete coverage');
    exactKeys(secondEnvelope.priorCandidates[0], ['handle', 'kind'],
      'prior prompt metadata exposes only engine handle and kind');
    check(!containsMarker(secondEnvelope.priorCandidates, 'Synthetic Prior Agreement'),
      'prior prompt metadata contains no prior label or evidence');
    check(secondEnvelope.priorCandidates[0].handle.startsWith('@fsb:'),
      'prior handle is engine-qualified');
    check(second.outcome.batch.relations.length === 1,
      'advertised same-generation prior endpoint resolves');
    const final = await fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      signal().signal
    );
    exactKeys(final, ['fragment', 'lexicalShards', 'adjacencyShards', 'resultCacheShards'],
      'finalization returns the exact graph-store seal payload');
    check((await GraphSchema.parseFragment(final.fragment)) !== null,
      'final fragment passes the production closed parser');
    check(final.fragment.providerId === 'xai' && final.fragment.modelId === 'configured-model',
      'final fragment preserves the exact provider binding');
    check(final.lexicalShards.some((shard) =>
      shard.postings.some((posting) => posting.term === 'synthetic current clause')),
    'derived labels flow only into authoritative lexical candidates');
    check(final.adjacencyShards[0].entries.length === 2,
      'local relation produces exact in/out adjacency inputs');
    check(frozenTree(final), 'complete fragment and every derived shard are recursively frozen');
    check(!containsMarker(final, 'A'.repeat(128)), 'final payload contains no source excerpt bytes');
  }

  {
    const fixture = harness({ responses: [oneRecordEnvelope({
      excerptId: 'forged_excerpt',
      label: 'Synthetic Forged Locator'
    })] });
    const source = await prepare(fixture, 'x');
    const rejected = await next(fixture, source.prepared.session);
    check(rejected.outcome.status === 'model-semantic-invalid' &&
      rejected.outcome.repairable === false,
    'forged evidence excerpt is rejected as nonrepairable semantic output');
    const final = await fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      signal().signal
    );
    check(final.status === 'session-invalid',
      'forged locator leaves no partial final fragment');
  }

  {
    const text = 'A'.repeat(24000) + 'C';
    const fixture = harness({ responses: [
      oneRecordEnvelope({ label: 'Synthetic Prior' }),
      oneRecordEnvelope({
        batchId: 'batch_identifier_02',
        candidateRef: 'current',
        kind: 'clause',
        label: 'Synthetic Clause',
        excerptId: 'excerpt_000009',
        relations: [{
          fromCandidateRef: `@fsb:${'f'.repeat(64)}`,
          predicate: 'contains',
          toCandidateRef: 'current',
          evidence: [{ excerptId: 'excerpt_000009', start: 0, end: 1 }]
        }]
      })
    ] });
    const source = await prepare(fixture, text);
    await next(fixture, source.prepared.session);
    const forged = await next(fixture, source.prepared.session);
    check(forged.outcome.status === 'model-semantic-invalid' &&
      forged.outcome.repairable === false,
    'unadvertised or forward prior handles fail as nonrepairable semantic data');
    const repairCalls = sends(fixture.state).length;
    const refused = await fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      forged.outcome,
      signal().signal
    );
    check(refused.status === 'repair-not-allowed', 'semantic failures cannot be repaired');
    check(sends(fixture.state).length === repairCalls,
      'semantic repair refusal performs zero provider calls');
  }

  {
    const fixture = harness({ responses: [
      'not bare JSON RAW_REJECTED_OUTPUT',
      oneRecordEnvelope({ label: 'Synthetic Repaired Party' })
    ] });
    const source = await prepare(fixture, 'x');
    const invalid = await next(fixture, source.prepared.session);
    check(invalid.outcome.status === 'model-json-invalid' && invalid.outcome.repairable === true,
      'one bare JSON parse failure is repairable');
    const repaired = await fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      invalid.outcome,
      signal().signal
    );
    check(repaired.outcome.status === 'validated-batch',
      'one fresh repair call may admit the same excerpt batch');
    const repairEnvelope = JSON.parse(builds(fixture.state)[1].prompt.userPrompt);
    exactKeys(repairEnvelope, [
      'batchNonce', 'schemaVersion', 'promptVersion', 'excerpts',
      'recordKinds', 'relationPredicates', 'priorCandidates', 'repair'
    ], 'repair adds only bounded failure metadata');
    exactKeys(repairEnvelope.repair, ['category', 'paths'],
      'repair metadata contains category and paths only');
    check(!containsMarker(repairEnvelope, 'RAW_REJECTED_OUTPUT'),
      'repair never resends rejected output');
    const before = sends(fixture.state).length;
    const repeated = await fixture.extractor.repairBatch(
      source.prepared.session,
      certificate(),
      invalid.outcome,
      signal().signal
    );
    check(repeated.status === 'repair-exhausted' || repeated.status === 'repair-not-allowed',
      'generation permits at most one repair');
    check(sends(fixture.state).length === before, 'second repair performs zero provider work');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    const over = await prepare(fixture, 'x'.repeat(192001));
    assert.deepStrictEqual(over.prepared, { status: 'budget-exceeded' });
    passed += 1;
    check(sends(fixture.state).length === 0,
      'generation max-plus-one is rejected before provider work');
  }

  {
    const fixture = harness({ responses: Array.from({ length: 8 }, (_, index) =>
      emptyEnvelope(`batch_identifier_${String(index).padStart(2, '0')}`)) });
    const source = await prepare(fixture, 'x'.repeat(192000));
    for (let index = 0; index < 8; index += 1) {
      const step = await next(fixture, source.prepared.session);
      check(step.outcome.status === 'validated-batch', `normal batch ${index + 1} validates`);
    }
    check(sends(fixture.state).length === 8, 'exact generation maximum performs eight calls');
    const complete = await next(fixture, source.prepared.session);
    check(complete.status === 'complete', 'ninth invocation reports complete without a call');
    check(sends(fixture.state).length === 8, 'ninth invocation performs zero provider work');
    const result = await fixture.extractor.finalize(
      source.prepared.session,
      certificate(),
      signal().signal
    );
    check(result.fragment.records.length === 0 && result.fragment.relations.length === 0,
      'exact generation budget can finalize a complete empty extraction');
  }

  {
    const fixture = harness({ responses: ['x'.repeat(131073)] });
    const source = await prepare(fixture, 'x');
    const over = await next(fixture, source.prepared.session);
    check(over.outcome.status === 'model-response-too-large' &&
      over.outcome.repairable === false,
    'raw response max-plus-one is nonrepairable and admits no batch');
    check(!Object.prototype.hasOwnProperty.call(over.outcome, 'batch'),
      'oversized response exposes no partial validated batch');
  }

  {
    const text = 'x'.repeat(300);
    const exactRecordResponse = JSON.stringify({
      schemaVersion: 1,
      batchId: 'batch_identifier_01',
      records: makeRecords(128),
      relations: []
    });
    const overRecordResponse = JSON.stringify({
      schemaVersion: 1,
      batchId: 'batch_identifier_02',
      records: makeRecords(129),
      relations: []
    });
    const exactFixture = harness({ responses: [exactRecordResponse] });
    const exactSource = await prepare(exactFixture, text);
    const exact = await next(exactFixture, exactSource.prepared.session);
    check(exact.outcome.status === 'validated-batch' && exact.outcome.batch.records.length === 128,
      'exact 128-record response is admitted');
    const overFixture = harness({ responses: [overRecordResponse] });
    const overSource = await prepare(overFixture, text);
    const over = await next(overFixture, overSource.prepared.session);
    check(over.outcome.status === 'model-schema-invalid' && over.outcome.repairable === true,
      '129-record response admits no batch');
  }

  {
    const fixture = harness({ responses: [
      JSON.stringify({
        schemaVersion: 1,
        batchId: 'batch_identifier_01',
        records: makeRecords(128),
        relations: []
      }),
      oneRecordEnvelope({
        batchId: 'batch_identifier_02',
        candidateRef: 'record_128',
        label: 'Synthetic Prior Overflow',
        excerptId: 'excerpt_000009'
      }),
      emptyEnvelope('batch_identifier_03')
    ] });
    const source = await prepare(fixture, 'x'.repeat(48001));
    await next(fixture, source.prepared.session);
    await next(fixture, source.prepared.session);
    await next(fixture, source.prepared.session);
    const secondEnvelope = JSON.parse(builds(fixture.state)[1].prompt.userPrompt);
    const thirdEnvelope = JSON.parse(builds(fixture.state)[2].prompt.userPrompt);
    check(secondEnvelope.priorCandidates.length === 128,
      'prior prompt admits the exact 128-entry maximum');
    check(Buffer.byteLength(JSON.stringify(secondEnvelope.priorCandidates), 'utf8') <= 16384,
      'exact prior prompt remains within the 16-KiB cap');
    check(thirdEnvelope.priorCandidates.length === 128,
      '129th prior candidate is withheld from the next provider request');
    check(!containsMarker(thirdEnvelope.priorCandidates, 'Synthetic Prior Overflow'),
      'max-plus-one prior metadata carries no raw label into the prompt');
  }

  {
    const records = [
      {
        candidateRef: 'agreement', kind: 'agreement', label: 'Synthetic Agreement',
        evidence: [{ excerptId: 'excerpt_000001', start: 0, end: 1 }]
      },
      {
        candidateRef: 'clause', kind: 'clause', label: 'Synthetic Clause',
        evidence: [{ excerptId: 'excerpt_000001', start: 299, end: 300 }]
      }
    ];
    const exactFixture = harness({ responses: [JSON.stringify({
      schemaVersion: 1,
      batchId: 'batch_identifier_01',
      records,
      relations: makeRelations(256)
    })] });
    const exactSource = await prepare(exactFixture, 'x'.repeat(300));
    const exact = await next(exactFixture, exactSource.prepared.session);
    check(exact.outcome.status === 'validated-batch' && exact.outcome.batch.relations.length === 256,
      'exact 256-relation response is admitted');
    const overFixture = harness({ responses: [JSON.stringify({
      schemaVersion: 1,
      batchId: 'batch_identifier_02',
      records,
      relations: makeRelations(257)
    })] });
    const overSource = await prepare(overFixture, 'x'.repeat(300));
    const over = await next(overFixture, overSource.prepared.session);
    check(over.outcome.status === 'model-schema-invalid' && over.outcome.repairable === true,
      '257-relation response admits no batch');
  }

  {
    const fixture = harness({ responses: [emptyEnvelope()] });
    const source = await prepare(fixture, 'x');
    const firstCert = certificate();
    const firstSignal = signal();
    const verified = await fixture.extractor.verifyProviderBinding(
      source.prepared.session,
      firstCert,
      firstSignal.signal
    );
    assert.deepStrictEqual(verified, {
      status: 'provider-binding-current',
      providerBinding: { providerId: 'xai', modelId: 'configured-model' }
    });
    passed += 1;
    const replay = await fixture.extractor.nextBatch(
      source.prepared.session,
      firstCert,
      signal().signal
    );
    check(replay.status === 'certificate-reused',
      'binding-check certificate is consumed once');
    const keyCert = certificate();
    const key = await fixture.extractor.reuseKey(keyCert, 'xai', 'configured-model');
    check(typeof key === 'string' && key.startsWith('sgrk1:'),
      'exact seven-dimension reuse key is generated under fresh authority');
    const keyReplay = await fixture.extractor.reuseKey(keyCert, 'xai', 'configured-model');
    check(keyReplay.status === 'certificate-reused', 'reuse key certificate cannot be replayed');
    const otherSourceKey = await fixture.extractor.reuseKey(
      certificate({ sourceFileId: 'source-beta' }), 'xai', 'configured-model'
    );
    const otherFingerprintKey = await fixture.extractor.reuseKey(
      certificate({ contentFingerprint: Object.freeze({ value: OTHER_FINGERPRINT }) }),
      'xai',
      'configured-model'
    );
    const otherPartitionKey = await fixture.extractor.reuseKey(
      certificate({ accountPermissionId: 'permission-2' }), 'xai', 'configured-model'
    );
    check(otherSourceKey !== key && otherFingerprintKey !== key && otherPartitionKey !== key,
      'source, fingerprint, and partition changes produce distinct exact reuse keys');
    const wrongModel = await fixture.extractor.reuseKey(
      certificate(), 'xai', 'other-model'
    );
    check(wrongModel.status === 'provider-binding-changed',
      'partial or model-changed reuse key is rejected');
    fixture.extractor.discard(source.prepared.session);
    const afterDiscard = await next(fixture, source.prepared.session);
    check(afterDiscard.status === 'session-discarded',
      'discarded session permits no provider or validated effect');
  }

  {
    let release;
    const fixture = harness({ responses: [async (send) => {
      await new Promise((resolve) => { release = resolve; });
      return emptyEnvelope();
    }] });
    const source = await prepare(fixture, 'x');
    const controller = signal();
    const pending = fixture.extractor.nextBatch(
      source.prepared.session,
      certificate(),
      controller.signal
    );
    while (!release) await Promise.resolve();
    controller.abort('PRIVATE_LATE_ABORT');
    release();
    const cancelled = await pending;
    check(cancelled.status === 'cancelled', 'late provider completion after abort is rejected');
    check(!containsMarker(cancelled, 'PRIVATE_LATE_ABORT'),
      'cancellation status omits the private abort reason');
    const before = sends(fixture.state).length;
    const afterCancel = await next(fixture, source.prepared.session);
    check(afterCancel.status === 'cancelled',
      'cancelled generation cannot be resumed under a fresh certificate');
    check(sends(fixture.state).length === before,
      'cancelled generation permits no later provider work');
  }

  {
    const fixture = harness({ responses: [oneRecordEnvelope()] });
    const source = await prepare(fixture, 'x');
    const prepared = await next(fixture, source.prepared.session);
    let publishCalls = 0;
    let durableCalls = 0;
    const operationSignal = signal().signal;
    const publisher = {
      signal: operationSignal,
      async publish(effect) {
        publishCalls += 1;
        return effect({
          signal: operationSignal,
          async validate() { return true; }
        });
      }
    };
    const commitCallback = async (value, currentPublisher, currentSignal) => {
      assert.strictEqual(currentSignal, currentPublisher.signal);
      return currentPublisher.publish(async (guard) => {
        assert.strictEqual(guard.signal, currentSignal);
        assert.strictEqual(await guard.validate(), true);
        durableCalls += 0;
        return Object.freeze({
          status: 'provider-no-storage',
          durableEffect: false,
          prepared: value
        });
      });
    };
    const admittedValue = await commitCallback(prepared, publisher, operationSignal);
    exactKeys(admittedValue, ['status', 'durableEffect', 'prepared'],
      'provider-only acknowledged value has exact keys');
    check(admittedValue.status === 'provider-no-storage' &&
      admittedValue.durableEffect === false,
    'provider-only operation declares zero storage effect');
    check(Object.isFrozen(admittedValue), 'provider-only admitted value is frozen');
    check(publishCalls === 1 && durableCalls === 0,
      'provider result flows through one publisher acknowledgement and zero durable mutation');
    check(admittedValue.prepared.rawResponse === prepared.rawResponse,
      'raw response exists only below the ephemeral admitted prepared value');
    const stripped = admittedValue.prepared.outcome.batch;
    check(!Object.prototype.hasOwnProperty.call(stripped, 'rawResponse'),
      'later staging value contains no raw response member');
  }

  const extractorSource = fs.readFileSync(
    path.join(root, 'extension', 'utils', 'skopeo-graph-extractor.js'),
    'utf8'
  );
  check(/ProviderNoStorageResult/.test(extractorSource),
    'production names the private provider no-storage effect-value contract');
  check(!/AIIntegration|conversationHistory|responseCache|parseCliResponse/.test(extractorSource),
    'extractor has no automation history, cache, parser, or fallback dependency');
  check(!/eval\s*\(|new\s+Function|WebSocket|fetch\s*\(/.test(extractorSource),
    'extractor grants no dynamic code, socket, or direct network capability');

  console.log(`skopeo graph extractor contract: ${passed} assertions passed`);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
