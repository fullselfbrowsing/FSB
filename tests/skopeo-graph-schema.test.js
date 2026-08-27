'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const root = path.join(__dirname, '..');
const validatorSource = fs.readFileSync(
  path.join(root, 'extension', 'lib', 'cfworker-json-schema.min.js'),
  'utf8'
);
if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);

const schemaPath = path.join(root, 'extension', 'utils', 'skopeo-graph-schema.js');
const GraphSchema = require(schemaPath);

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

async function rejectsNull(promise, message) {
  check((await promise) === null, message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactKeys(value, keys, message) {
  check(
    Object.keys(value).sort().join('\n') === keys.slice().sort().join('\n'),
    message
  );
}

function frozenTree(value, seen) {
  if (!value || typeof value !== 'object') return true;
  const visited = seen || new Set();
  if (visited.has(value)) return true;
  visited.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
        !frozenTree(descriptor.value, visited)) return false;
  }
  return true;
}

const VERSION = 'skopeo-graph-schema/1';
const IDENTITY_VERSION = 'skopeo-graph-identity/1';
const PROMPT_VERSION = 'skopeo-graph-extraction-prompt/1';
const PARTITION = 'scpk1:7:account6:corpus';
const SOURCE = 'source_alpha';
const OTHER_SOURCE = 'source_beta';
const FINGERPRINT_A = `sha256:${'a'.repeat(64)}`;
const FINGERPRINT_B = `sha256:${'b'.repeat(64)}`;

function excerpt(text, sourceByteStart = 100) {
  return {
    excerptId: 'excerpt_01',
    text,
    sourceByteStart,
    sourceByteEnd: sourceByteStart + Buffer.byteLength(text, 'utf8')
  };
}

async function makeContext(overrides) {
  const values = Object.assign({
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT_A,
    excerpts: [excerpt('αgreement amendment clause fact event owner policy memo evidence text')],
    batchOrdinal: 0,
    priorCandidates: []
  }, overrides || {});
  values.fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: VERSION,
    partitionKey: values.partitionKey,
    sourceFileId: values.sourceFileId,
    contentFingerprint: values.contentFingerprint
  });
  return values;
}

function envelope(records, relations, batchId = 'batch_identifier_01') {
  return { schemaVersion: 1, batchId, records, relations };
}

function record(candidateRef, kind, label, start, end) {
  return {
    candidateRef,
    kind,
    label,
    evidence: [{ excerptId: 'excerpt_01', start, end }]
  };
}

function relation(fromCandidateRef, predicate, toCandidateRef, start, end) {
  return {
    fromCandidateRef,
    predicate,
    toCandidateRef,
    evidence: [{ excerptId: 'excerpt_01', start, end }]
  };
}

function priorEntry(candidate) {
  return {
    handle: candidate.candidateHandle,
    kind: candidate.kind,
    stableRecordId: candidate.stableRecordId,
    recordVersionId: candidate.recordVersionId,
    fragmentGenerationId: candidate.fragmentGenerationId,
    sourceFileId: candidate.sourceFileId,
    batchOrdinal: candidate.batchOrdinal,
    candidateOrdinal: candidate.candidateOrdinal
  };
}

async function makeCandidateRelation(options) {
  const proposer = options.proposer;
  const target = options.target;
  const relationKind = options.relationKind || 'references-policy';
  const evidence = options.evidence;
  const evidenceIdentity = GraphSchema.canonicalize(evidence.map((item) => ({
    locatorId: item.locatorId,
    sourceByteStart: item.sourceByteStart,
    sourceByteEnd: item.sourceByteEnd
  })).sort((left, right) => left.locatorId.localeCompare(right.locatorId) ||
    left.sourceByteStart - right.sourceByteStart || left.sourceByteEnd - right.sourceByteEnd));
  const stableRelationId = await GraphSchema.deriveStableRelationId({
    identityVersion: IDENTITY_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    predicate: relationKind,
    fromStableRecordId: proposer.stableRecordId,
    toStableRecordId: target.stableRecordId,
    primaryLocator: {
      sourceByteStart: evidence[0].sourceByteStart,
      sourceByteEnd: evidence[0].sourceByteEnd
    }
  });
  const relationVersionId = await GraphSchema.deriveRelationVersionId({
    relationClass: 'cross-document-candidate',
    partitionKey: PARTITION,
    relationKind,
    stableRelationId,
    proposerRecordVersionId: proposer.recordVersionId,
    proposerFragmentGenerationId: proposer.fragmentGenerationId,
    targetRecordVersionId: target.recordVersionId,
    targetFragmentGenerationId: target.fragmentGenerationId,
    canonicalEvidenceLocatorIdentity: evidenceIdentity
  });
  return {
    schemaVersion: VERSION,
    relationClass: 'cross-document-candidate',
    partitionKey: PARTITION,
    relationKind,
    proposingSourceFileId: SOURCE,
    targetSourceFileId: OTHER_SOURCE,
    fromStableRecordId: proposer.stableRecordId,
    toStableRecordId: target.stableRecordId,
    stableRelationId,
    proposerRecordVersionId: proposer.recordVersionId,
    proposerFragmentGenerationId: proposer.fragmentGenerationId,
    targetRecordVersionId: target.recordVersionId,
    targetFragmentGenerationId: target.fragmentGenerationId,
    evidence,
    canonicalEvidenceLocatorIdentity: evidenceIdentity,
    relationVersionId
  };
}

(async () => {
  exactKeys(GraphSchema, [
    'VERSION',
    'IDENTITY_VERSION',
    'PROMPT_VERSION',
    'LIMITS',
    'RECORD_KINDS',
    'RELATION_PREDICATES',
    'CROSS_DOCUMENT_PREDICATES',
    'parseEvidenceLocator',
    'parseExtractionEnvelope',
    'parseCandidateRelationIntent',
    'parseCandidateRelation',
    'parseFragment',
    'parseLexicalShard',
    'parseAdjacencyShard',
    'deriveFragmentGenerationId',
    'deriveCandidateHandle',
    'deriveStableRecordId',
    'deriveRecordVersionId',
    'deriveStableRelationId',
    'deriveRelationVersionId',
    'deriveCandidateOverlayGenerationId',
    'canonicalize',
    'sha256Hex'
  ], 'API exposes only the closed Plan 01 surface');
  check(Object.isFrozen(GraphSchema), 'API is frozen');
  check(GraphSchema.VERSION === VERSION, 'schema version is exact');
  check(GraphSchema.IDENTITY_VERSION === IDENTITY_VERSION, 'identity version is exact');
  check(GraphSchema.PROMPT_VERSION === PROMPT_VERSION, 'prompt version is exact');
  check(GraphSchema.LIMITS.MAX_RECORDS === 128, 'record cap is exact');
  check(GraphSchema.LIMITS.MAX_RELATIONS === 256, 'relation cap is exact');
  check(GraphSchema.LIMITS.MAX_PRIOR_CANDIDATES === 128, 'prior candidate cap is exact');
  check(GraphSchema.LIMITS.MAX_PRIOR_CANDIDATE_BYTES === 16384, 'prior metadata byte cap is exact');

  assert.deepStrictEqual(Array.from(GraphSchema.RECORD_KINDS), [
    'agreement', 'amendment', 'clause', 'fact', 'event', 'owner',
    'policy-document', 'memo'
  ]);
  passed += 1;
  assert.deepStrictEqual(Array.from(GraphSchema.RELATION_PREDICATES), [
    'contains', 'amends-candidate', 'states-fact', 'records-event',
    'assigned-owner', 'references-policy', 'references-memo'
  ]);
  passed += 1;
  assert.deepStrictEqual(Array.from(GraphSchema.CROSS_DOCUMENT_PREDICATES), [
    'amends-candidate', 'references-policy', 'references-memo'
  ]);
  passed += 1;
  check(Object.isFrozen(GraphSchema.RECORD_KINDS) &&
    Object.isFrozen(GraphSchema.RELATION_PREDICATES) &&
    Object.isFrozen(GraphSchema.CROSS_DOCUMENT_PREDICATES), 'vocabularies are frozen');

  const classicSandbox = {
    CfworkerJsonSchema: globalThis.CfworkerJsonSchema,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    Set,
    Object,
    Array,
    JSON,
    Number,
    String,
    RegExp,
    Reflect,
    Promise
  };
  classicSandbox.globalThis = classicSandbox;
  vm.runInNewContext(fs.readFileSync(schemaPath, 'utf8'), classicSandbox, { filename: schemaPath });
  check(classicSandbox.FsbSkopeoGraphSchema.VERSION === VERSION,
    'classic-script load publishes the schema global');
  check(!Object.prototype.hasOwnProperty.call(classicSandbox, 'module'),
    'classic-script load needs no CommonJS object');

  const context = await makeContext();
  const validEnvelope = envelope([
    record('agreement', 'agreement', 'Acme–Northwind agreement', 0, 10),
    record('amendment', 'amendment', 'Amendment one', 11, 20),
    record('clause', 'clause', 'Payment clause', 21, 27),
    record('fact', 'fact', 'Amount fact', 28, 32),
    record('event', 'event', 'Renewal event', 33, 38),
    record('owner', 'owner', 'Morgan Rivera', 39, 44),
    record('policy', 'policy-document', 'Vendor policy', 45, 51),
    record('memo', 'memo', 'Board memo', 52, 56)
  ], [
    relation('agreement', 'contains', 'clause', 57, 58),
    relation('amendment', 'amends-candidate', 'agreement', 58, 59),
    relation('clause', 'states-fact', 'fact', 59, 60),
    relation('agreement', 'records-event', 'event', 60, 61),
    relation('agreement', 'assigned-owner', 'owner', 61, 62),
    relation('agreement', 'references-policy', 'policy', 62, 63),
    relation('agreement', 'references-memo', 'memo', 63, 64)
  ]);
  const parsed = await GraphSchema.parseExtractionEnvelope(validEnvelope, context);
  check(parsed !== null, 'all eight kinds and seven relation families parse');
  check(frozenTree(parsed), 'parsed envelope is recursively frozen');
  check(Object.getPrototypeOf(parsed) === null, 'parsed envelope uses a null prototype');
  check(parsed.records.length === 8 && parsed.relations.length === 7,
    'parsed envelope retains bounded complete output');
  check(parsed.records.every((item) => Object.getPrototypeOf(item) === null),
    'parsed records are null-prototype copies');
  check(parsed.records.every((item) => !Object.prototype.hasOwnProperty.call(item, 'text')),
    'parsed records retain no excerpt text');
  check(parsed.records[0].label === 'Acme–Northwind agreement',
    'schema-valid party/vendor label remains authoritative graph data');
  check(!parsed.records[0].stableRecordId.includes('Acme') &&
    !parsed.records[0].recordVersionId.includes('Acme'), 'derived names never appear in IDs');

  const documents = new Set(['agreement', 'amendment', 'policy-document', 'memo']);
  const targetFor = {
    'states-fact': 'fact',
    'records-event': 'event',
    'assigned-owner': 'owner',
    'references-policy': 'policy-document',
    'references-memo': 'memo'
  };
  for (const predicate of GraphSchema.RELATION_PREDICATES) {
    for (const fromKind of GraphSchema.RECORD_KINDS) {
      for (const toKind of GraphSchema.RECORD_KINDS) {
        let expected = false;
        if (predicate === 'contains') expected = documents.has(fromKind) && toKind === 'clause';
        else if (predicate === 'amends-candidate') {
          expected = fromKind === 'amendment' && (toKind === 'agreement' || toKind === 'clause');
        } else expected = toKind === targetFor[predicate];
        const candidate = envelope([
          record('from', fromKind, `From ${fromKind}`, 0, 1),
          record('to', toKind, `To ${toKind}`, 2, 3)
        ], [relation('from', predicate, 'to', 4, 5)]);
        const result = await GraphSchema.parseExtractionEnvelope(candidate, context);
        check((result !== null) === expected,
          `${predicate} ${fromKind}->${toKind} endpoint rule is exact`);
      }
    }
  }

  const changedLabel = clone(validEnvelope);
  changedLabel.records[0].label = 'Different real party name';
  const parsedChangedLabel = await GraphSchema.parseExtractionEnvelope(changedLabel, context);
  check(parsedChangedLabel.records[0].stableRecordId === parsed.records[0].stableRecordId,
    'label is excluded from stable identity');
  check(parsedChangedLabel.records[0].recordVersionId === parsed.records[0].recordVersionId,
    'label is excluded from version identity');

  const changedFingerprintContext = await makeContext({ contentFingerprint: FINGERPRINT_B });
  const parsedChangedFingerprint = await GraphSchema.parseExtractionEnvelope(
    validEnvelope,
    changedFingerprintContext
  );
  check(parsedChangedFingerprint.records[0].stableRecordId === parsed.records[0].stableRecordId,
    'stable record survives a content-fingerprint advance');
  check(parsedChangedFingerprint.fragmentGenerationId !== parsed.fragmentGenerationId,
    'fragment generation advances with fingerprint');
  check(parsedChangedFingerprint.records[0].recordVersionId !== parsed.records[0].recordVersionId,
    'record version advances with fragment generation');

  const identityBase = {
    identityVersion: IDENTITY_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    kind: 'agreement',
    primaryLocator: { sourceByteStart: 100, sourceByteEnd: 111 },
    engineLocalKey: 'primary-evidence'
  };
  const stableBase = await GraphSchema.deriveStableRecordId(identityBase);
  for (const [field, replacement] of [
    ['identityVersion', 'skopeo-graph-identity/2'],
    ['partitionKey', `${PARTITION}-other`],
    ['sourceFileId', OTHER_SOURCE],
    ['kind', 'memo'],
    ['primaryLocator', { sourceByteStart: 100, sourceByteEnd: 112 }],
    ['engineLocalKey', 'other-key']
  ]) {
    const changed = Object.assign({}, identityBase, { [field]: replacement });
    const changedId = await GraphSchema.deriveStableRecordId(changed);
    if (field === 'identityVersion' || field === 'engineLocalKey') {
      check(changedId === null, `${field} is closed to the exact contract`);
    } else {
      check(changedId !== null && changedId !== stableBase, `${field} changes the stable namespace`);
    }
  }

  const duplicateStable = envelope([
    record('one', 'agreement', 'One', 0, 1),
    record('two', 'agreement', 'Two', 0, 1)
  ], []);
  await rejectsNull(GraphSchema.parseExtractionEnvelope(duplicateStable, context),
    'same kind and primary source range cannot be model-disambiguated');

  const firstBatch = await GraphSchema.parseExtractionEnvelope(
    envelope([record('repeat', 'agreement', 'First batch', 0, 1)], []),
    context
  );
  const advertised = priorEntry(firstBatch.records[0]);
  const secondContext = await makeContext({ batchOrdinal: 1, priorCandidates: [advertised] });
  const secondBatch = await GraphSchema.parseExtractionEnvelope(envelope([
    record('repeat', 'clause', 'Second batch', 2, 3)
  ], [relation(advertised.handle, 'contains', 'repeat', 4, 5)]), secondContext);
  check(secondBatch !== null, 'advertised prior handle resolves without prior content');
  check(secondBatch.records[0].candidateRef === 'repeat',
    'the same raw candidateRef may recur in a later batch');
  check(secondBatch.relations[0].fromStableRecordId === advertised.stableRecordId,
    'prior handle resolves to the exact advertised stable endpoint');
  check(JSON.stringify({ handle: advertised.handle, kind: advertised.kind }).length <= 16384,
    'advertised handle/kind metadata stays under the byte cap');

  const noCurrentRef = envelope([
    record('new', 'clause', 'New', 2, 3)
  ], [relation('repeat', 'contains', 'new', 4, 5)]);
  await rejectsNull(GraphSchema.parseExtractionEnvelope(noCurrentRef, secondContext),
    'raw prior candidateRef is dangling and rejected');
  const forgedHandle = clone(noCurrentRef);
  forgedHandle.relations[0].fromCandidateRef = `@fsb:${'f'.repeat(64)}`;
  await rejectsNull(GraphSchema.parseExtractionEnvelope(forgedHandle, secondContext),
    'forged or unadvertised handle rejects');
  const forwardHandle = clone(noCurrentRef);
  forwardHandle.relations[0].fromCandidateRef = await GraphSchema.deriveCandidateHandle({
    fragmentGenerationId: context.fragmentGenerationId,
    batchOrdinal: 1,
    candidateOrdinal: 0,
    stableRecordId: secondBatch.records[0].stableRecordId
  });
  await rejectsNull(GraphSchema.parseExtractionEnvelope(forwardHandle, secondContext),
    'current or forward handle rejects');
  const crossGenerationPrior = Object.assign({}, advertised, {
    fragmentGenerationId: changedFingerprintContext.fragmentGenerationId
  });
  await rejectsNull(GraphSchema.parseExtractionEnvelope(noCurrentRef,
    await makeContext({ batchOrdinal: 1, priorCandidates: [crossGenerationPrior] })),
  'cross-generation prior registry rejects');
  await rejectsNull(GraphSchema.parseExtractionEnvelope(noCurrentRef,
    await makeContext({ batchOrdinal: 1, priorCandidates: [advertised, advertised] })),
  'duplicate prior handle registry rejects');
  await rejectsNull(GraphSchema.parseExtractionEnvelope(noCurrentRef,
    await makeContext({ batchOrdinal: 1, priorCandidates: [Object.assign({}, advertised, {
      label: 'must not cross the prompt boundary'
    })] })), 'prior registry rejects labels, text, and all extra metadata');

  const fourEvidence = envelope([
    {
      candidateRef: 'four',
      kind: 'fact',
      label: 'Four citations',
      evidence: [0, 1, 2, 3].map((index) => ({
        excerptId: 'excerpt_01', start: index, end: index + 1
      }))
    }
  ], []);
  check(await GraphSchema.parseExtractionEnvelope(fourEvidence, context) !== null,
    'four evidence locators are admitted');
  const fiveEvidence = clone(fourEvidence);
  fiveEvidence.records[0].evidence.push({ excerptId: 'excerpt_01', start: 5, end: 6 });
  await rejectsNull(GraphSchema.parseExtractionEnvelope(fiveEvidence, context),
    'five evidence locators reject');
  for (const badLocator of [
    { excerptId: 'missing', start: 0, end: 1 },
    { excerptId: 'excerpt_01', start: 1, end: 1 },
    { excerptId: 'excerpt_01', start: 2, end: 1 },
    { excerptId: 'excerpt_01', start: 0, end: 24001 }
  ]) {
    const invalid = clone(fourEvidence);
    invalid.records[0].evidence = [badLocator];
    await rejectsNull(GraphSchema.parseExtractionEnvelope(invalid, context),
      'missing, empty, reversed, and out-of-range locator rejects');
  }
  const mismatchedExcerpt = clone(context.excerpts[0]);
  mismatchedExcerpt.sourceByteEnd += 1;
  let excerptGetterReads = 0;
  Object.defineProperty(mismatchedExcerpt, 'extra', {
    enumerable: false,
    get() { excerptGetterReads += 1; return 'secret'; }
  });
  const mismatchContext = Object.assign({}, context, { excerpts: [mismatchedExcerpt] });
  await rejectsNull(GraphSchema.parseExtractionEnvelope(fourEvidence, mismatchContext),
    'trusted excerpt byte-range mismatch rejects');
  check(excerptGetterReads === 0, 'byte mismatch rejection executes no getter');

  for (const badLabel of ['', 'x'.repeat(1025), 'line\nbreak', 'bidirectional\u202etext', '<tag>']) {
    const invalid = envelope([record('bad', 'fact', badLabel, 0, 1)], []);
    await rejectsNull(GraphSchema.parseExtractionEnvelope(invalid, context),
      'empty, oversized, control, bidi, and markup-shaped labels reject');
  }
  for (const forbidden of [
    'governing', 'effective', 'superseding', 'deadline', 'confidence', 'clearance',
    'tool', 'url', 'callback', 'code', 'prompt', 'executable'
  ]) {
    const invalid = clone(validEnvelope);
    invalid.records[0][forbidden] = 'untrusted';
    await rejectsNull(GraphSchema.parseExtractionEnvelope(invalid, context),
      `unknown authority field ${forbidden} rejects`);
  }

  let getterReads = 0;
  const hostileRecord = record('hostile', 'fact', 'Hostile', 0, 1);
  Object.defineProperty(hostileRecord, 'label', {
    enumerable: true,
    get() { getterReads += 1; return 'secret'; }
  });
  await rejectsNull(GraphSchema.parseExtractionEnvelope(envelope([hostileRecord], []), context),
    'accessor-bearing model record rejects');
  check(getterReads === 0, 'model accessor never executes');
  const sparseRecords = [];
  sparseRecords.length = 1;
  await rejectsNull(GraphSchema.parseExtractionEnvelope(envelope(sparseRecords, []), context),
    'sparse model array rejects');

  const maximumRecords = [];
  const longText = 'x'.repeat(600);
  const maximumContext = await makeContext({ excerpts: [excerpt(longText)] });
  for (let index = 0; index < 128; index += 1) {
    maximumRecords.push(record(`r${index}`, 'fact', `Fact ${index}`, index * 2, index * 2 + 1));
  }
  check(await GraphSchema.parseExtractionEnvelope(envelope(maximumRecords, []), maximumContext) !== null,
    'exact record cap parses');
  const tooManyRecords = maximumRecords.concat([
    record('overflow', 'fact', 'Overflow', 300, 301)
  ]);
  await rejectsNull(GraphSchema.parseExtractionEnvelope(envelope(tooManyRecords, []), maximumContext),
    'record max-plus-one rejects');
  const maximumRelations = [];
  const relationRecords = [
    record('doc', 'agreement', 'Agreement', 0, 1),
    record('clause', 'clause', 'Clause', 2, 3)
  ];
  for (let index = 0; index < 256; index += 1) {
    maximumRelations.push(relation('doc', 'contains', 'clause', index + 4, index + 5));
  }
  check(await GraphSchema.parseExtractionEnvelope(
    envelope(relationRecords, maximumRelations), maximumContext
  ) !== null, 'exact relation cap parses');
  await rejectsNull(GraphSchema.parseExtractionEnvelope(
    envelope(relationRecords, maximumRelations.concat([
      relation('doc', 'contains', 'clause', 300, 301)
    ])), maximumContext
  ), 'relation max-plus-one rejects');

  const proposer = parsed.records[0];
  const targetContext = await makeContext({
    sourceFileId: OTHER_SOURCE,
    contentFingerprint: FINGERPRINT_A,
    excerpts: [excerpt('target policy evidence', 900)]
  });
  const targetParsed = await GraphSchema.parseExtractionEnvelope(envelope([
    record('target', 'policy-document', 'Target policy', 0, 6)
  ], []), targetContext);
  const proposerEvidence = [parsed.records[0].evidence[0]];
  const intentInput = {
    partitionKey: PARTITION,
    relationKind: 'references-policy',
    proposingSourceFileId: SOURCE,
    targetSourceFileId: OTHER_SOURCE,
    fromStableRecordId: proposer.stableRecordId,
    toStableRecordId: targetParsed.records[0].stableRecordId,
    evidenceLocatorIds: [proposerEvidence[0].locatorId]
  };
  const intent = GraphSchema.parseCandidateRelationIntent(intentInput);
  check(intent !== null && intent.relationClass === 'cross-document-candidate-intent',
    'trusted engine candidate intent parses separately');
  for (const relationKind of ['contains', 'states-fact', 'records-event', 'assigned-owner']) {
    check(GraphSchema.parseCandidateRelationIntent(Object.assign({}, intentInput, { relationKind })) === null,
      `${relationKind} is not a cross-document candidate predicate`);
  }
  check(GraphSchema.parseCandidateRelationIntent(Object.assign({}, intentInput, {
    governing: true
  })) === null, 'candidate intent rejects adjudication fields');

  const candidateInput = await makeCandidateRelation({
    proposer,
    target: targetParsed.records[0],
    evidence: proposerEvidence
  });
  const candidateRelation = await GraphSchema.parseCandidateRelation(candidateInput);
  check(candidateRelation !== null && candidateRelation.relationClass === 'cross-document-candidate',
    'durable endpoint-bound candidate relation parses');
  check(frozenTree(candidateRelation), 'candidate relation is recursively frozen');
  const targetAdvancedContext = await makeContext({
    sourceFileId: OTHER_SOURCE,
    contentFingerprint: FINGERPRINT_B,
    excerpts: [excerpt('target policy evidence', 900)]
  });
  const targetAdvanced = await GraphSchema.parseExtractionEnvelope(envelope([
    record('target', 'policy-document', 'Target policy', 0, 6)
  ], []), targetAdvancedContext);
  const candidateAdvancedInput = await makeCandidateRelation({
    proposer,
    target: targetAdvanced.records[0],
    evidence: proposerEvidence
  });
  const candidateAdvanced = await GraphSchema.parseCandidateRelation(candidateAdvancedInput);
  check(candidateAdvanced.stableRelationId === candidateRelation.stableRelationId,
    'target-only version advance preserves the stable candidate relation');
  check(candidateAdvanced.relationVersionId !== candidateRelation.relationVersionId,
    'target-only version advance changes candidate relation version');

  const overlayInput = {
    schemaVersion: VERSION,
    partitionKey: PARTITION,
    proposingSourceFileId: SOURCE,
    proposingFragmentGenerationId: proposer.fragmentGenerationId,
    relations: [candidateRelation]
  };
  const overlayId = await GraphSchema.deriveCandidateOverlayGenerationId(overlayInput);
  const overlayIdAgain = await GraphSchema.deriveCandidateOverlayGenerationId(overlayInput);
  const advancedOverlayId = await GraphSchema.deriveCandidateOverlayGenerationId(Object.assign({},
    overlayInput, { relations: [candidateAdvanced] }));
  check(overlayId === overlayIdAgain, 'canonical candidate overlay bytes reproduce the same ID');
  check(advancedOverlayId !== overlayId,
    'target-only version advance changes candidate overlay generation');
  await rejectsNull(GraphSchema.deriveCandidateOverlayGenerationId(Object.assign({}, overlayInput, {
    relations: [candidateRelation, candidateRelation]
  })), 'duplicate candidate relation versions reject from complete overlays');
  const mismatchedCandidate = clone(candidateInput);
  mismatchedCandidate.targetRecordVersionId = proposer.recordVersionId;
  await rejectsNull(GraphSchema.parseCandidateRelation(mismatchedCandidate),
    'mismatched redundant candidate tuple rejects');
  const wrongEvidenceOwner = clone(candidateInput);
  wrongEvidenceOwner.evidence[0].sourceFileId = OTHER_SOURCE;
  await rejectsNull(GraphSchema.parseCandidateRelation(wrongEvidenceOwner),
    'candidate evidence must belong to the proposing source');
  for (const extra of ['equivalent', 'precedence', 'governing', 'deadline', 'confidence', 'clearance']) {
    const invalid = clone(candidateInput);
    invalid[extra] = true;
    await rejectsNull(GraphSchema.parseCandidateRelation(invalid),
      `candidate relation rejects ${extra} claim`);
  }

  const durableRecords = parsed.records.map((item) => ({
    schemaVersion: item.schemaVersion,
    partitionKey: item.partitionKey,
    sourceFileId: item.sourceFileId,
    contentFingerprint: item.contentFingerprint,
    fragmentGenerationId: item.fragmentGenerationId,
    kind: item.kind,
    label: item.label,
    evidence: item.evidence,
    stableRecordId: item.stableRecordId,
    recordVersionId: item.recordVersionId
  }));
  const durableRelations = parsed.relations;
  const fragmentInput = {
    schemaVersion: VERSION,
    promptVersion: PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT_A,
    fragmentGenerationId: context.fragmentGenerationId,
    providerId: 'openai-compatible',
    modelId: 'local-model-v1',
    records: durableRecords,
    relations: durableRelations
  };
  const fragment = await GraphSchema.parseFragment(fragmentInput);
  check(fragment !== null && fragment.records.length === 8 && fragment.relations.length === 7,
    'closed durable fragment round-trips through the same identity contract');
  check(frozenTree(fragment), 'durable fragment is recursively frozen');
  check(!Object.prototype.hasOwnProperty.call(fragment.records[0], 'candidateRef') &&
    !Object.prototype.hasOwnProperty.call(fragment.records[0], 'candidateHandle'),
  'durable records exclude response-local references and handles');
  const fragmentExtra = clone(fragmentInput);
  fragmentExtra.records[0].confidence = 1;
  await rejectsNull(GraphSchema.parseFragment(fragmentExtra),
    'durable fragment rejects model authority fields');

  const lexical = GraphSchema.parseLexicalShard({
    schemaVersion: VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    fragmentGenerationId: context.fragmentGenerationId,
    shardOrdinal: 0,
    postings: [{
      term: 'acme northwind',
      stableRecordId: durableRecords[0].stableRecordId,
      recordVersionId: durableRecords[0].recordVersionId
    }]
  });
  check(lexical !== null && lexical.postings[0].term === 'acme northwind',
    'closed lexical shard admits a validated derived label term');
  const adjacency = GraphSchema.parseAdjacencyShard({
    schemaVersion: VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    fragmentGenerationId: context.fragmentGenerationId,
    shardOrdinal: 0,
    entries: [{
      stableRecordId: durableRecords[0].stableRecordId,
      relationVersionId: durableRelations[0].relationVersionId,
      direction: 'out'
    }]
  });
  check(adjacency !== null && adjacency.entries[0].direction === 'out',
    'closed adjacency shard admits a local relation contribution');
  check(GraphSchema.parseLexicalShard(Object.assign({}, lexical, { callback: 'x' })) === null,
    'lexical shard rejects extra keys');
  check(GraphSchema.parseAdjacencyShard(Object.assign({}, adjacency, { direction: 'in' })) === null,
    'adjacency shard rejects extra keys');

  const canonicalA = GraphSchema.canonicalize({ b: [2, 1], a: 'x' });
  const canonicalB = GraphSchema.canonicalize({ a: 'x', b: [2, 1] });
  check(canonicalA === canonicalB && canonicalA === '{"a":"x","b":[2,1]}',
    'canonicalization is deterministic and key ordered');
  const cycle = {};
  cycle.self = cycle;
  check(GraphSchema.canonicalize(cycle) === null, 'canonicalization rejects cycles');
  const accessor = {};
  Object.defineProperty(accessor, 'secret', {
    enumerable: true,
    get() { getterReads += 1; return 'hidden'; }
  });
  check(GraphSchema.canonicalize(accessor) === null, 'canonicalization rejects accessors');
  check(getterReads === 0, 'canonicalization executes no getter');
  const digest = await GraphSchema.sha256Hex({ a: 1 });
  check(/^sha256:[0-9a-f]{64}$/.test(digest), 'SHA-256 helper returns the exact digest form');

  const productionSource = fs.readFileSync(schemaPath, 'utf8');
  for (const forbiddenToken of [
    'Graphify', 'graphology', 'eval(', 'new Function', 'dynamic import',
    'governing:', 'deadline:', 'confidence:', 'clearance:', 'url:', 'tool:',
    'callback:', 'executable:'
  ]) {
    check(!productionSource.includes(forbiddenToken),
      `production schema contains no forbidden runtime/authority token: ${forbiddenToken}`);
  }

  console.log(`skopeo-graph-schema: ${passed} passed, 0 failed`);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
