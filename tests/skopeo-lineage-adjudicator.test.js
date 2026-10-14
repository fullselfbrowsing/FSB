'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ADJUDICATOR_PATH = path.join(
  ROOT,
  'extension',
  'utils',
  'skopeo-lineage-adjudicator.js'
);
const TRUTH_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-truth-schema.js');
const GRAPH_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-graph-schema.js');
const DEADLINE_ENGINE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-deadline-engine.js');
const VALIDATOR_PATH = path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');
const MATRIX_MODE = process.env.SKOPEO_ADJUDICATOR_MATRIX === '1';
const MISSING_MARKER = ['skopeo', 'lineage', 'adjudicator', 'contract'].join(' ');

const TEST_CRYPTO = Object.freeze({
  subtle: Object.freeze({
    async digest(algorithm, data) {
      assert.equal(algorithm, 'SHA-256');
      const input = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      const output = createHash('sha256').update(input).digest();
      return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    }
  })
});

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: TEST_CRYPTO
});
if (!globalThis.CfworkerJsonSchema) {
  vm.runInThisContext(fs.readFileSync(VALIDATOR_PATH, 'utf8'), {
    filename: VALIDATOR_PATH
  });
}

const GraphSchema = require(GRAPH_SCHEMA_PATH);
const TruthSchema = require(TRUTH_SCHEMA_PATH);
const DeadlineEngine = require(DEADLINE_ENGINE_PATH);
globalThis.FsbSkopeoTruthSchema = TruthSchema;

const VERSION = 'skopeo-lineage-adjudicator/1';
const GRAPH_SNAPSHOT_VERSION = 'skopeo-graph-exact-set/1';
const PARTITION = 'scpk1:15:account-lineage14:corpus-lineage';
const PROVIDER_ID = 'openai-compatible';
const MODEL_ID = 'configured-contract-model';
const AS_OF = '2026-07-24';
const EXPECTED_MODULE_SURFACE = Object.freeze(['VERSION', 'LIMITS', 'create']);
const EXPECTED_INSTANCE_SURFACE = Object.freeze(['adjudicateExactSet']);
const FORBIDDEN_HINTS = Object.freeze([
  'filename',
  'modifiedTime',
  'similarity',
  'rank',
  'confidence',
  'governing',
  'eligible'
]);
const STORAGE_FIELDS = Object.freeze([
  'snapshotId',
  'semanticProofDigest',
  'semanticProofBytes',
  'categoryCounts',
  'pages',
  'pageHash',
  'pageOrdinal',
  'storageKey',
  'manifest'
]);
const NINE_FACTS = Object.freeze({
  'signed-date': { kind: 'civil-date', value: '2020-01-02' },
  'effective-date': { kind: 'civil-date', value: '2020-02-03' },
  'expiration-date': { kind: 'civil-date', value: '2027-02-03' },
  'termination-date': { kind: 'civil-date', value: '2028-02-03' },
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
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactKeys(value, keys, message) {
  assert.deepEqual(Object.keys(value).sort(), keys.slice().sort(), message);
}

function frozenTree(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
        !frozenTree(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

function nullPrototypeTree(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== null) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
        !nullPrototypeTree(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

function freezeInput(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      freezeInput(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function fingerprint(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`;
}

function encodeTuple(prefix, values) {
  return values.reduce((output, raw) => {
    const value = String(raw);
    return `${output}${value.length}:${value}`;
  }, prefix);
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function recordProjection(record) {
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

function snapshotRecord(record) {
  return {
    partitionKey: record.partitionKey,
    sourceFileId: record.sourceFileId,
    contentFingerprint: record.contentFingerprint,
    fragmentGenerationId: record.fragmentGenerationId,
    kind: record.kind,
    label: record.label,
    evidence: record.evidence.map(snapshotEvidence),
    stableRecordId: record.stableRecordId,
    recordVersionId: record.recordVersionId
  };
}

function snapshotRelation(relation, recordsByStableId, sourcesById) {
  const candidateOnly = relation.relationClass === 'cross-document-candidate';
  const sourceFileId = candidateOnly
    ? relation.proposingSourceFileId
    : relation.sourceFileId;
  const source = sourcesById.get(sourceFileId);
  const fromStableRecordId = relation.fromStableRecordId;
  const toStableRecordId = relation.toStableRecordId;
  const from = recordsByStableId.get(fromStableRecordId);
  const to = recordsByStableId.get(toStableRecordId);
  assert.ok(source && from && to, 'snapshot relation endpoints and owner exist');
  return {
    relationClass: relation.relationClass,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint: source.contentFingerprint,
    fragmentGenerationId: source.fragmentGenerationId,
    predicate: candidateOnly ? relation.relationKind : relation.predicate,
    fromSourceFileId: from.sourceFileId,
    fromFragmentGenerationId: from.fragmentGenerationId,
    fromStableRecordId,
    fromRecordVersionId: candidateOnly
      ? relation.proposerRecordVersionId
      : relation.fromRecordVersionId,
    toSourceFileId: to.sourceFileId,
    toFragmentGenerationId: to.fragmentGenerationId,
    toStableRecordId,
    toRecordVersionId: candidateOnly
      ? relation.targetRecordVersionId
      : relation.toRecordVersionId,
    evidence: relation.evidence.map(snapshotEvidence),
    stableRelationId: relation.stableRelationId,
    relationVersionId: relation.relationVersionId,
    candidateOnly
  };
}

function exactSetDigest(graphSnapshot) {
  const evidenceIdentities = [];
  for (const record of graphSnapshot.records) {
    for (const locator of record.evidence) {
      evidenceIdentities.push(encodeTuple('snapshot-evidence|', [
        'record',
        record.recordVersionId,
        locator.partitionKey,
        locator.sourceFileId,
        locator.contentFingerprint,
        locator.fragmentGenerationId,
        locator.locatorId,
        String(locator.sourceByteStart),
        String(locator.sourceByteEnd)
      ]));
    }
  }
  for (const relation of graphSnapshot.relations) {
    for (const locator of relation.evidence) {
      evidenceIdentities.push(encodeTuple('snapshot-evidence|', [
        'relation',
        relation.relationVersionId,
        locator.partitionKey,
        locator.sourceFileId,
        locator.contentFingerprint,
        locator.fragmentGenerationId,
        locator.locatorId,
        String(locator.sourceByteStart),
        String(locator.sourceByteEnd)
      ]));
    }
  }
  evidenceIdentities.sort();
  const values = [
    GRAPH_SNAPSHOT_VERSION,
    graphSnapshot.partitionKey,
    String(graphSnapshot.sourceBindings.length),
    String(graphSnapshot.records.length),
    String(graphSnapshot.relations.length),
    String(evidenceIdentities.length)
  ];
  for (const binding of graphSnapshot.sourceBindings) {
    values.push(encodeTuple('authorized-source|', [
      binding.sourceFileId,
      binding.sourceState,
      binding.certificationStatus,
      binding.graphCurrent ? 'current' : 'stale',
      binding.contentFingerprint,
      binding.fragmentGenerationId
    ]));
  }
  for (const record of graphSnapshot.records) {
    values.push(encodeTuple('authorized-record|', [record.recordVersionId]));
  }
  for (const relation of graphSnapshot.relations) {
    values.push(encodeTuple('authorized-relation|', [relation.relationVersionId]));
  }
  values.push(...evidenceIdentities);
  return `sgx1:${sha256Text(encodeTuple('authorized-graph-exact-set|', values))}`;
}

async function makeGraphSource(spec, sourceOrdinal) {
  const sourceFileId = `source_${spec.key}`;
  const contentFingerprint = fingerprint(`lineage:${spec.key}:${sourceOrdinal}`);
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint
  });
  const recordDefinitions = [{
    ref: 'document',
    kind: spec.kind || 'agreement',
    label: spec.label || `${spec.key} agreement`
  }].concat((spec.clauses || []).map((clause) => ({
    ref: `clause_${clause.key}`,
    kind: 'clause',
    label: clause.label || `${clause.key} clause`
  })));
  const evidenceCount = spec.evidenceCount || 1;
  const text = '0123456789'.repeat(200);
  const modelRecords = recordDefinitions.map((record, index) => ({
    candidateRef: record.ref,
    kind: record.kind,
    label: record.label,
    evidence: Array.from({ length: evidenceCount }, (_, evidenceIndex) => ({
      excerptId: 'source_main',
      start: index * 8 + evidenceIndex * 2,
      end: index * 8 + evidenceIndex * 2 + 1
    }))
  }));
  const modelRelations = (spec.clauses || []).map((clause, index) => ({
    fromCandidateRef: 'document',
    predicate: 'contains',
    toCandidateRef: `clause_${clause.key}`,
    evidence: [{
      excerptId: 'source_main',
      start: 1500 + index * 2,
      end: 1500 + index * 2 + 1
    }]
  }));
  const parsed = await GraphSchema.parseExtractionEnvelope({
    schemaVersion: 1,
    batchId: `batch_${spec.key}_graph_0001`,
    records: modelRecords,
    relations: modelRelations
  }, {
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'source_main',
      text,
      sourceByteStart: sourceOrdinal * 10000,
      sourceByteEnd: sourceOrdinal * 10000 + Buffer.byteLength(text, 'utf8')
    }],
    batchOrdinal: 0,
    priorCandidates: []
  });
  assert.ok(parsed, `${spec.key} graph extraction fixture parses`);
  const records = parsed.records.map(recordProjection);
  const fragment = await GraphSchema.parseFragment({
    schemaVersion: GraphSchema.VERSION,
    promptVersion: GraphSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    records,
    relations: parsed.relations
  });
  assert.ok(fragment, `${spec.key} graph fragment fixture parses`);
  const byRef = new Map();
  recordDefinitions.forEach((definition, index) => {
    byRef.set(definition.ref, fragment.records[index]);
  });
  return {
    spec,
    sourceFileId,
    contentFingerprint,
    fragmentGenerationId,
    records: fragment.records,
    localRelations: fragment.relations,
    byRef,
    candidateRelations: []
  };
}

async function makeCandidateRelation(fromSource, targetSource, lineage) {
  const from = fromSource.byRef.get('document');
  const targetRef = lineage.scope === 'clause'
    ? `clause_${lineage.targetClause}`
    : 'document';
  const to = targetSource.byRef.get(targetRef);
  assert.ok(from && to, `${lineage.from}->${lineage.to} lineage endpoints exist`);
  const evidence = from.evidence.slice(0, 1);
  const stableRelationId = await GraphSchema.deriveStableRelationId({
    identityVersion: GraphSchema.IDENTITY_VERSION,
    partitionKey: PARTITION,
    sourceFileId: fromSource.sourceFileId,
    predicate: 'amends-candidate',
    fromStableRecordId: from.stableRecordId,
    toStableRecordId: to.stableRecordId,
    primaryLocator: {
      sourceByteStart: evidence[0].sourceByteStart,
      sourceByteEnd: evidence[0].sourceByteEnd
    }
  });
  const canonicalEvidenceLocatorIdentity = GraphSchema.canonicalize(evidence.map((locator) => ({
    locatorId: locator.locatorId,
    sourceByteStart: locator.sourceByteStart,
    sourceByteEnd: locator.sourceByteEnd
  })));
  const relationVersionId = await GraphSchema.deriveRelationVersionId({
    relationClass: 'cross-document-candidate',
    partitionKey: PARTITION,
    relationKind: 'amends-candidate',
    stableRelationId,
    proposerRecordVersionId: from.recordVersionId,
    proposerFragmentGenerationId: from.fragmentGenerationId,
    targetRecordVersionId: to.recordVersionId,
    targetFragmentGenerationId: to.fragmentGenerationId,
    canonicalEvidenceLocatorIdentity
  });
  const relation = await GraphSchema.parseCandidateRelation({
    schemaVersion: GraphSchema.VERSION,
    relationClass: 'cross-document-candidate',
    partitionKey: PARTITION,
    relationKind: 'amends-candidate',
    proposingSourceFileId: fromSource.sourceFileId,
    targetSourceFileId: targetSource.sourceFileId,
    fromStableRecordId: from.stableRecordId,
    toStableRecordId: to.stableRecordId,
    stableRelationId,
    proposerRecordVersionId: from.recordVersionId,
    proposerFragmentGenerationId: from.fragmentGenerationId,
    targetRecordVersionId: to.recordVersionId,
    targetFragmentGenerationId: to.fragmentGenerationId,
    evidence,
    canonicalEvidenceLocatorIdentity,
    relationVersionId
  });
  assert.ok(relation, `${lineage.from}->${lineage.to} candidate lineage fixture parses`);
  return relation;
}

function evaluationContext(calendars = [], timezone = 'America/Chicago') {
  const value = {
    asOfCivilDate: AS_OF,
    governingTimezoneBinding: {
      kind: 'configured',
      timezone,
      configurationId: 'contract-governing-timezone',
      configurationVersion: 'v1'
    },
    calendars
  };
  assert.ok(TruthSchema.parseEvaluationContext(value), 'evaluation context fixture parses');
  return value;
}

function sourceEvidenceHandles(source) {
  const output = [];
  const seen = new Set();
  for (const record of source.records) {
    for (const locator of record.evidence) {
      if (seen.has(locator.locatorId)) continue;
      seen.add(locator.locatorId);
      output.push({
        handle: `evidence:${output.length}`,
        locator
      });
    }
  }
  for (const relation of source.localRelations.concat(source.candidateRelations)) {
    for (const locator of relation.evidence) {
      if (seen.has(locator.locatorId)) continue;
      seen.add(locator.locatorId);
      output.push({
        handle: `evidence:${output.length}`,
        locator
      });
    }
  }
  return output;
}

function evidenceHandleForRecord(record, evidenceHandles, evidenceIndex = 0) {
  const locator = record.evidence[evidenceIndex];
  assert.ok(locator, `record evidence index ${evidenceIndex} exists`);
  const locatorId = locator.locatorId;
  const match = evidenceHandles.find((item) => item.locator.locatorId === locatorId);
  assert.ok(match, 'record evidence has an issued handle');
  return match.handle;
}

function evidenceHandlesForRecord(record, evidenceHandles) {
  return record.evidence.map((locator) => {
    const match = evidenceHandles.find((item) => item.locator.locatorId === locator.locatorId);
    assert.ok(match, 'each record locator has an issued handle');
    return match.handle;
  }).sort();
}

async function makeCandidateGeneration(
  source,
  allSources,
  allRelations,
  calendars,
  digest
) {
  const documents = [];
  const clauses = [];
  const documentHandleByStableId = new Map();
  const clauseHandleByStableId = new Map();
  for (const current of allSources) {
    const document = current.byRef.get('document');
    const documentHandle = `document:${current.spec.key}`;
    documentHandleByStableId.set(document.stableRecordId, documentHandle);
    documents.push({
      handle: documentHandle,
      stableRecordId: document.stableRecordId,
      recordVersionId: document.recordVersionId
    });
    for (const clause of current.spec.clauses || []) {
      const record = current.byRef.get(`clause_${clause.key}`);
      const handle = `clause:${current.spec.key}:${clause.key}`;
      clauseHandleByStableId.set(record.stableRecordId, handle);
      clauses.push({
        handle,
        stableRecordId: record.stableRecordId,
        recordVersionId: record.recordVersionId,
        documentHandle
      });
    }
  }
  const relationHandles = allRelations.map((relation, index) => ({
    handle: `relation:${index}`,
    relationVersionId: relation.relationVersionId
  }));
  const relationHandleById = new Map(
    relationHandles.map((item) => [item.relationVersionId, item.handle])
  );
  const calendarHandles = calendars.map((calendar, index) => ({
    handle: `calendar:${index + 1}`,
    calendarId: calendar.calendarId,
    calendarVersionId: calendar.calendarVersionId
  }));
  const calendarHandleById = new Map(
    calendarHandles.map((item) => [item.calendarId, item.handle])
  );
  const evidenceHandles = sourceEvidenceHandles(source);
  const document = source.byRef.get('document');
  const documentHandle = documentHandleByStableId.get(document.stableRecordId);
  const documentEvidence = evidenceHandleForRecord(document, evidenceHandles);
  const executionCandidates = [];
  for (const [index, executionState] of (source.spec.executionStates || []).entries()) {
    executionCandidates.push({
      candidateRef: `execution:${source.spec.key}:${index}`,
      documentHandle,
      executionState,
      evidenceHandles: [documentEvidence]
    });
  }
  const effectivenessCandidates = (source.spec.effectiveDates || []).map((date, index) => ({
    candidateRef: `effectiveness:${source.spec.key}:${index}`,
    documentHandle,
    effectiveDate: { kind: 'civil-date', value: date },
    evidenceHandles: [documentEvidence]
  }));
  const lineageCandidates = [];
  for (const [index, lineage] of (source.spec.lineages || []).entries()) {
    const targetSource = allSources.find((item) => item.spec.key === lineage.to);
    const relation = source.candidateRelations[index];
    assert.ok(targetSource && relation, 'lineage candidate has graph relation and target');
    const targetDocument = targetSource.byRef.get('document');
    const targetClause = lineage.scope === 'clause'
      ? targetSource.byRef.get(`clause_${lineage.targetClause}`)
      : null;
    const amendmentClause = lineage.scope === 'clause'
      ? source.byRef.get(`clause_${lineage.amendmentClause || 'amended'}`)
      : null;
    assert.ok(
      lineage.scope !== 'clause' || amendmentClause,
      'partial lineage identifies an issued amendment source clause'
    );
    lineageCandidates.push({
      candidateRef: `lineage:${source.spec.key}:${index}`,
      documentHandle,
      targetDocumentHandle: documentHandleByStableId.get(targetDocument.stableRecordId),
      targetClauseHandle: targetClause
        ? clauseHandleByStableId.get(targetClause.stableRecordId)
        : null,
      amendmentClauseHandle: amendmentClause
        ? clauseHandleByStableId.get(amendmentClause.stableRecordId)
        : null,
      relationHandle: relationHandleById.get(relation.relationVersionId),
      lineageRole: lineage.role,
      scope: lineage.scope,
      evidenceHandles: [documentEvidence]
    });
  }
  const factCandidates = [];
  for (const [index, fact] of (source.spec.facts || []).entries()) {
    const clause = fact.clause
      ? source.byRef.get(`clause_${fact.clause}`)
      : null;
    const evidenceRecord = clause || document;
    const factEvidenceHandles = fact.allEvidence
      ? evidenceHandlesForRecord(evidenceRecord, evidenceHandles)
        .slice(0, fact.evidenceLimit || TruthSchema.LIMITS.MAX_EVIDENCE_LOCATORS_PER_CANDIDATE)
      : [evidenceHandleForRecord(
        evidenceRecord,
        evidenceHandles,
        fact.evidenceIndex || 0
      )];
    factCandidates.push({
      candidateRef: `fact:${source.spec.key}:${index}`,
      documentHandle,
      clauseHandle: clause ? clauseHandleByStableId.get(clause.stableRecordId) : null,
      assertionType: fact.type,
      typedValue: fact.value,
      evidenceHandles: factEvidenceHandles
    });
  }
  const deadlineRuleCandidates = [];
  for (const [index, rule] of (source.spec.rules || []).entries()) {
    const clause = source.byRef.get(`clause_${rule.clause}`);
    const evidenceHandle = evidenceHandleForRecord(
      clause,
      evidenceHandles,
      rule.evidenceIndex || 0
    );
    deadlineRuleCandidates.push({
      candidateRef: `deadline:${source.spec.key}:${index}`,
      documentHandle,
      clauseHandle: clauseHandleByStableId.get(clause.stableRecordId),
      operator: rule.operator,
      anchorAssertionType: rule.anchorAssertionType,
      amount: rule.amount,
      boundary: rule.boundary,
      timezone: rule.timezone,
      calendarHandle: rule.calendarHandle === null || rule.calendarHandle === undefined
        ? null
        : calendarHandleById.get(rule.calendarHandle),
      consequenceEvidenceHandle: evidenceHandle,
      evidenceHandles: [evidenceHandle]
    });
  }
  const generationInput = {
    schemaVersion: TruthSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: source.sourceFileId,
    contentFingerprint: source.contentFingerprint,
    fragmentGenerationId: source.fragmentGenerationId,
    candidateSchemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    batchOrdinal: 0
  };
  const context = {
    ...generationInput,
    documentHandles: documents,
    clauseHandles: clauses,
    relationHandles,
    evidenceHandles,
    calendarHandles
  };
  const envelope = {
    schemaVersion: TruthSchema.CANDIDATE_SCHEMA_VERSION,
    batchId: `truth_${source.spec.key}`,
    executionCandidates,
    effectivenessCandidates,
    lineageCandidates,
    factCandidates,
    deadlineRuleCandidates
  };
  const batch = await TruthSchema.parseCandidateEnvelope(envelope, context);
  assert.ok(batch, `${source.spec.key} normalized truth candidates parse`);
  const expectedGenerationId = await TruthSchema.deriveCandidateGenerationId(generationInput);
  assert.equal(
    batch.candidateGenerationId,
    expectedGenerationId,
    `${source.spec.key} candidate generation binds provider/model/source/batch`
  );
  return {
    schemaVersion: TruthSchema.VERSION,
    promptVersion: TruthSchema.PROMPT_VERSION,
    partitionKey: PARTITION,
    sourceFileId: source.sourceFileId,
    contentFingerprint: source.contentFingerprint,
    fragmentGenerationId: source.fragmentGenerationId,
    authorizedSetDigest: digest,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    candidateGenerationIds: [batch.candidateGenerationId],
    batches: [batch]
  };
}

async function makeInput(spec) {
  const sources = [];
  for (const [index, sourceSpec] of spec.sources.entries()) {
    sources.push(await makeGraphSource(sourceSpec, index + 1));
  }
  const sourcesByKey = new Map(sources.map((source) => [source.spec.key, source]));
  for (const source of sources) {
    for (const lineage of source.spec.lineages || []) {
      const target = sourcesByKey.get(lineage.to);
      assert.ok(target, `${lineage.to} target source exists`);
      source.candidateRelations.push(await makeCandidateRelation(source, target, lineage));
    }
  }
  const allRecords = sources.flatMap((source) => source.records);
  const recordsByStableId = new Map(allRecords.map((record) => [record.stableRecordId, record]));
  const sourcesById = new Map(sources.map((source) => [source.sourceFileId, source]));
  const allRelations = sources.flatMap(
    (source) => source.localRelations.concat(source.candidateRelations)
  );
  const sourceBindings = sources.map((source) => ({
    sourceFileId: source.sourceFileId,
    sourceState: source.spec.sourceState || 'ready',
    certificationStatus: 'certified',
    graphCurrent: true,
    contentFingerprint: source.contentFingerprint,
    fragmentGenerationId: source.fragmentGenerationId
  })).sort((left, right) => left.sourceFileId.localeCompare(right.sourceFileId));
  const graphSnapshot = {
    snapshotVersion: GRAPH_SNAPSHOT_VERSION,
    partitionKey: PARTITION,
    sourceBindings,
    records: allRecords.map(snapshotRecord)
      .sort((left, right) => left.recordVersionId.localeCompare(right.recordVersionId)),
    relations: allRelations.map((relation) =>
      snapshotRelation(relation, recordsByStableId, sourcesById)
    ).sort((left, right) => left.relationVersionId.localeCompare(right.relationVersionId))
  };
  graphSnapshot.authorizedSetDigest = exactSetDigest(graphSnapshot);
  const candidateGenerations = [];
  const providerCalendars = spec.providerCalendars || spec.calendars || [];
  for (const source of sources) {
    if ((source.spec.sourceState || 'ready') !== 'ready') continue;
    candidateGenerations.push(await makeCandidateGeneration(
      source,
      sources,
      allRelations,
      providerCalendars,
      graphSnapshot.authorizedSetDigest
    ));
  }
  candidateGenerations.sort((left, right) => left.sourceFileId.localeCompare(right.sourceFileId));
  const input = {
    graphSnapshot,
    candidateGenerations,
    evaluationContext: evaluationContext(
      spec.calendars || [],
      spec.timezone || 'America/Chicago'
    )
  };
  return {
    input: freezeInput(input),
    sources,
    byKey: sourcesByKey
  };
}

function baseSource(overrides = {}) {
  return {
    key: 'base',
    kind: 'agreement',
    label: 'Executed Base Agreement',
    clauses: [
      { key: 'notice', label: 'Notice Clause' },
      { key: 'sales', label: 'Sales Clause' }
    ],
    executionStates: ['executed'],
    effectiveDates: ['2020-02-03'],
    facts: [],
    rules: [],
    lineages: [],
    ...overrides
  };
}

function amendmentSource(key, overrides = {}) {
  return {
    key,
    kind: 'amendment',
    label: `${key} amendment`,
    clauses: [{ key: 'amended', label: `${key} amended clause` }],
    executionStates: ['executed'],
    effectiveDates: ['2022-01-01'],
    facts: [],
    rules: [],
    lineages: [],
    ...overrides
  };
}

function businessCalendar(overrides = {}) {
  return {
    schemaVersion: TruthSchema.CALENDAR_VERSION,
    calendarId: 'calendar-us-business',
    calendarVersionId: 'calendar-us-business-v1',
    weekendDays: [0, 6],
    holidays: ['2026-07-03'],
    ...overrides
  };
}

function citationCapSources({ overflow }) {
  const sources = [];
  for (let sourceIndex = 0; sourceIndex < 16; sourceIndex += 1) {
    const key = `citation_${String(sourceIndex).padStart(2, '0')}`;
    const clauses = Array.from({ length: 31 }, (_, clauseIndex) => ({
      key: `term_${String(clauseIndex).padStart(3, '0')}`,
      label: `Citation term ${clauseIndex}`
    }));
    const subjects = [null].concat(clauses.map((clause) => clause.key));
    const facts = subjects.map((clause, factIndex) => ({
      type: 'signed-date',
      value: { kind: 'civil-date', value: '2020-01-01' },
      clause,
      allEvidence: true,
      evidenceLimit: sourceIndex === 0
        ? 4
        : (factIndex === 0
          ? (overflow && sourceIndex === 15 ? 2 : 3)
          : 4)
    }));
    sources.push({
      key,
      kind: sourceIndex === 0 ? 'agreement' : 'amendment',
      label: `Citation cap instrument ${sourceIndex}`,
      clauses,
      evidenceCount: 4,
      executionStates: ['executed'],
      effectiveDates: [`2020-01-${String(sourceIndex + 1).padStart(2, '0')}`],
      facts,
      rules: [],
      lineages: sourceIndex === 0 ? [] : [{
        from: key,
        to: `citation_${String(sourceIndex - 1).padStart(2, '0')}`,
        scope: 'document',
        targetClause: null,
        role: 'full-replacement'
      }]
    });
  }
  if (overflow) {
    sources.push({
      key: 'citation_16',
      kind: 'amendment',
      label: 'Citation cap overflow instrument',
      clauses: [],
      evidenceCount: 1,
      executionStates: ['executed'],
      effectiveDates: ['2020-01-17'],
      facts: [],
      rules: [],
      lineages: [{
        from: 'citation_16',
        to: 'citation_15',
        scope: 'document',
        targetClause: null,
        role: 'full-replacement'
      }]
    });
  }
  return sources;
}

function resultFamily(result, source) {
  const documentId = source.byRef.get('document').stableRecordId;
  const family = result.families.find(
    (candidate) => candidate.documentStableIds.includes(documentId)
  );
  assert.ok(family, `family for ${documentId}: ${JSON.stringify(result)}`);
  return family;
}

async function assertAdjudicated(adjudicator, fixture) {
  const result = await adjudicator.adjudicateExactSet(fixture.input);
  assert.ok(result, 'adjudicator returns a closed result');
  exactKeys(
    result,
    ['version', 'status', 'authorizedSetDigest', 'families', 'blockerCodes'],
    'adjudication result surface is exact'
  );
  assert.equal(result.version, VERSION);
  assert.equal(result.authorizedSetDigest, fixture.input.graphSnapshot.authorizedSetDigest);
  assert.equal(frozenTree(result), true, 'adjudication result is recursively frozen');
  assert.equal(nullPrototypeTree(result), true, 'adjudication records use null prototypes');
  return result;
}

async function testBaseDraftReplacementOverlayAndHistory(adjudicator) {
  const baseOnly = await makeInput({ sources: [baseSource()] });
  const baseResult = await assertAdjudicated(adjudicator, baseOnly);
  assert.equal(
    baseResult.status,
    'adjudicated',
    `base adjudication: ${JSON.stringify(baseResult)}`
  );
  const baseFamily = resultFamily(baseResult, baseOnly.sources[0]);
  assert.equal(baseFamily.lineageProof.execution.value, 'executed');
  assert.equal(baseFamily.lineageProof.temporal.value, 'effective');
  assert.equal(baseFamily.lineageProof.lineageRole.value, 'base');
  assert.equal(baseFamily.lineageProof.governance.value, 'governing');

  const draft = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('draft', {
        label: '2099-12-31 FINAL governing newest draft.docx',
        executionStates: ['unsigned'],
        effectiveDates: ['2024-01-01'],
        lineages: [{
          from: 'draft',
          to: 'base',
          scope: 'document',
          targetClause: null,
          role: 'full-replacement'
        }]
      })
    ]
  });
  const draftResult = await assertAdjudicated(adjudicator, draft);
  const stillGoverning = resultFamily(draftResult, draft.byKey.get('base'));
  const draftFamily = resultFamily(draftResult, draft.byKey.get('draft'));
  assert.equal(stillGoverning.lineageProof.governance.value, 'governing');
  assert.notEqual(draftFamily.lineageProof.governance.value, 'governing');

  const replacement = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('replacement', {
        kind: 'amendment',
        lineages: [{
          from: 'replacement',
          to: 'base',
          scope: 'document',
          targetClause: null,
          role: 'full-replacement'
        }]
      })
    ]
  });
  const replacementResult = await assertAdjudicated(adjudicator, replacement);
  assert.equal(replacementResult.families.length, 1, 'accepted replacement joins one family');
  assert.equal(
    replacementResult.families[0].lineageProof.lineageRole.value,
    'full-replacement'
  );
  assert.equal(replacementResult.families[0].lineageProof.governance.value, 'governing');
  assert.equal(replacementResult.families[0].lineageProof.acceptedPath.length, 2);

  const overlay = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('partial', {
        lineages: [{
          from: 'partial',
          to: 'base',
          scope: 'clause',
          targetClause: 'notice',
          role: 'partial-amendment'
        }]
      })
    ]
  });
  const overlayResult = await assertAdjudicated(adjudicator, overlay);
  assert.equal(overlayResult.families.length, 1);
  assert.equal(
    overlayResult.families[0].lineageProof.governance.value,
    'partially-governing'
  );
  assert.equal(overlayResult.families[0].lineageProof.overlays.length, 1);
  assert.equal(overlayResult.families[0].lineageProof.inheritances.length, 1);
  assert.notEqual(
    overlayResult.families[0].lineageProof.overlays[0].baseClauseRecordVersionId,
    overlayResult.families[0].lineageProof.inheritances[0].baseClauseRecordVersionId,
    'changed and untouched base clauses remain distinct'
  );

  const explicitClause = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('explicit_partial', {
        clauses: [
          { key: 'decoy', label: 'Unrelated amendment clause' },
          { key: 'selected', label: 'Selected replacement clause' }
        ],
        lineages: [{
          from: 'explicit_partial',
          to: 'base',
          scope: 'clause',
          targetClause: 'notice',
          amendmentClause: 'selected',
          role: 'partial-amendment'
        }]
      })
    ]
  });
  const explicitFamily = (await assertAdjudicated(
    adjudicator,
    explicitClause
  )).families[0];
  assert.equal(
    explicitFamily.lineageProof.overlays[0].amendmentClauseRecordVersionId,
    explicitClause.byKey.get('explicit_partial')
      .byRef.get('clause_selected').recordVersionId,
    'overlay construction uses the explicitly issued amendment clause, not record order'
  );

  const historical = await makeInput({
    sources: [baseSource({
      facts: [{
        type: 'termination-date',
        value: { kind: 'civil-date', value: '2021-01-01' },
        clause: null
      }]
    })]
  });
  const historicalResult = await assertAdjudicated(adjudicator, historical);
  assert.equal(historicalResult.families[0].lineageProof.temporal.value, 'terminated');
  assert.equal(historicalResult.families[0].lineageProof.lineageRole.value, 'historical');
  assert.equal(historicalResult.families[0].lineageProof.governance.value, 'non-governing');
}

async function testSequentialOverlaysAndReviewRequiredCases(adjudicator) {
  const sequential = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('partial_one', {
        effectiveDates: ['2022-01-01'],
        lineages: [{
          from: 'partial_one',
          to: 'base',
          scope: 'clause',
          targetClause: 'notice',
          role: 'partial-amendment'
        }]
      }),
      amendmentSource('partial_two', {
        effectiveDates: ['2023-01-01'],
        lineages: [{
          from: 'partial_two',
          to: 'base',
          scope: 'clause',
          targetClause: 'notice',
          role: 'partial-amendment'
        }]
      })
    ]
  });
  const sequentialResult = await assertAdjudicated(adjudicator, sequential);
  assert.equal(sequentialResult.families[0].lineageProof.overlays.length, 2);
  assert.equal(
    sequentialResult.families[0].lineageProof.governance.value,
    'partially-governing'
  );

  const cases = [
    ['missing execution', {
      sources: [baseSource({ executionStates: [] })]
    }],
    ['missing effectiveness', {
      sources: [baseSource({ effectiveDates: [] })]
    }],
    ['conflicting execution', {
      sources: [baseSource({ executionStates: ['executed', 'unsigned'] })]
    }],
    ['future effectiveness', {
      sources: [baseSource({ effectiveDates: ['2099-01-01'] })]
    }],
    ['duplicate replacements', {
      sources: [
        baseSource(),
        amendmentSource('replacement_a', {
          lineages: [{
            from: 'replacement_a',
            to: 'base',
            scope: 'document',
            targetClause: null,
            role: 'full-replacement'
          }]
        }),
        amendmentSource('replacement_b', {
          lineages: [{
            from: 'replacement_b',
            to: 'base',
            scope: 'document',
            targetClause: null,
            role: 'full-replacement'
          }]
        })
      ]
    }],
    ['multiple bases', {
      sources: [
        baseSource({ key: 'base_a' }),
        baseSource({ key: 'base_b' }),
        amendmentSource('bridge', {
          lineages: [{
            from: 'bridge',
            to: 'base_a',
            scope: 'clause',
            targetClause: 'notice',
            role: 'partial-amendment'
          }, {
            from: 'bridge',
            to: 'base_b',
            scope: 'clause',
            targetClause: 'notice',
            role: 'partial-amendment'
          }]
        })
      ]
    }],
    ['cyclic lineage', {
      sources: [
        baseSource(),
        amendmentSource('cycle_a', {
          effectiveDates: ['2022-01-01'],
          lineages: [{
            from: 'cycle_a',
            to: 'cycle_b',
            scope: 'clause',
            targetClause: 'amended',
            role: 'partial-amendment'
          }, {
            from: 'cycle_a',
            to: 'base',
            scope: 'clause',
            targetClause: 'notice',
            role: 'partial-amendment'
          }]
        }),
        amendmentSource('cycle_b', {
          effectiveDates: ['2023-01-01'],
          lineages: [{
            from: 'cycle_b',
            to: 'cycle_a',
            scope: 'clause',
            targetClause: 'amended',
            role: 'partial-amendment'
          }]
        })
      ]
    }],
    ['unorderable overlays', {
      sources: [
        baseSource(),
        amendmentSource('unordered_a', {
          lineages: [{
            from: 'unordered_a',
            to: 'base',
            scope: 'clause',
            targetClause: 'notice',
            role: 'partial-amendment'
          }]
        }),
        amendmentSource('unordered_b', {
          lineages: [{
            from: 'unordered_b',
            to: 'base',
            scope: 'clause',
            targetClause: 'notice',
            role: 'partial-amendment'
          }]
        })
      ]
    }]
  ];
  for (const [name, spec] of cases) {
    const fixture = await makeInput(spec);
    const result = await assertAdjudicated(adjudicator, fixture);
    assert.ok(
      result.status === 'abstained' ||
        result.families.every((family) =>
          family.lineageProof.governance.value === 'review-required' ||
          family.lineageProof.governance.value === 'non-governing'),
      `${name} cannot govern`
    );
  }

  for (const mutate of [
    (input) => {
      input.graphSnapshot.relations[0].toRecordVersionId =
        `srv1:${'f'.repeat(64)}`;
    },
    (input) => {
      input.graphSnapshot.sourceBindings[0].graphCurrent = false;
    },
    (input) => {
      input.candidateGenerations = [];
    },
    (input) => {
      input.graphSnapshot.authorizedSetDigest = `sgx1:${'0'.repeat(64)}`;
    },
    (input) => {
      const lineage = input.candidateGenerations
        .find((generation) => generation.sourceFileId === 'source_partial')
        .batches[0].lineageCandidates[0];
      lineage.targetDocumentRecordVersionId = `srv1:${'f'.repeat(64)}`;
    },
    (input) => {
      const lineage = input.candidateGenerations
        .find((generation) => generation.sourceFileId === 'source_partial')
        .batches[0].lineageCandidates[0];
      lineage.scope = 'document';
    },
    (input) => {
      const lineage = input.candidateGenerations
        .find((generation) => generation.sourceFileId === 'source_partial')
        .batches[0].lineageCandidates[0];
      const salesClause = input.graphSnapshot.records.find((record) =>
        record.sourceFileId === 'source_base' &&
        record.kind === 'clause' &&
        record.recordVersionId !== lineage.targetClauseRecordVersionId);
      lineage.targetClauseStableId = salesClause.stableRecordId;
      lineage.targetClauseRecordVersionId = salesClause.recordVersionId;
    },
    (input) => {
      const lineage = input.candidateGenerations
        .find((generation) => generation.sourceFileId === 'source_partial')
        .batches[0].lineageCandidates[0];
      const baseClause = input.graphSnapshot.records.find((record) =>
        record.sourceFileId === 'source_base' && record.kind === 'clause');
      lineage.amendmentClauseStableId = baseClause.stableRecordId;
      lineage.amendmentClauseRecordVersionId = baseClause.recordVersionId;
    },
    (input) => {
      const candidateRelation = input.graphSnapshot.relations.find(
        (relation) => relation.relationClass === 'cross-document-candidate'
      );
      candidateRelation.fromSourceFileId = 'source_base';
    }
  ]) {
    const fixture = await makeInput({
      sources: [
        baseSource(),
        amendmentSource('partial', {
          lineages: [{
            from: 'partial',
            to: 'base',
            scope: 'clause',
            targetClause: 'notice',
            role: 'partial-amendment'
          }]
        })
      ]
    });
    const hostile = plain(fixture.input);
    mutate(hostile);
    const result = await adjudicator.adjudicateExactSet(hostile);
    assert.equal(result.status, 'abstained');
    assert.deepEqual(Array.from(result.families), []);
    assert.ok(result.blockerCodes.length > 0);
  }
}

async function testPartialsFollowOnlyTheCurrentReplacementPath(adjudicator) {
  const fixture = await makeInput({
    sources: [
      baseSource({
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2027-01-01' },
          clause: 'notice'
        }]
      }),
      amendmentSource('early_partial', {
        effectiveDates: ['2021-01-01'],
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2028-01-01' },
          clause: 'amended'
        }],
        lineages: [{
          from: 'early_partial',
          to: 'base',
          scope: 'clause',
          targetClause: 'notice',
          role: 'partial-amendment'
        }]
      }),
      amendmentSource('replacement', {
        effectiveDates: ['2022-01-01'],
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2029-01-01' },
          clause: 'amended'
        }],
        lineages: [{
          from: 'replacement',
          to: 'base',
          scope: 'document',
          targetClause: null,
          role: 'full-replacement'
        }]
      }),
      amendmentSource('obsolete_partial', {
        effectiveDates: ['2023-01-01'],
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2030-01-01' },
          clause: 'amended'
        }],
        lineages: [{
          from: 'obsolete_partial',
          to: 'base',
          scope: 'clause',
          targetClause: 'notice',
          role: 'partial-amendment'
        }]
      }),
      amendmentSource('current_partial', {
        effectiveDates: ['2024-01-01'],
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2031-01-01' },
          clause: 'amended'
        }, {
          type: 'notice-window',
          value: NINE_FACTS['notice-window'],
          clause: 'amended'
        }],
        rules: [{
          clause: 'amended',
          operator: 'subtract-calendar-days',
          anchorAssertionType: 'expiration-date',
          amount: 30,
          boundary: 'exclusive',
          timezone: 'America/Chicago',
          calendarHandle: null
        }],
        lineages: [{
          from: 'current_partial',
          to: 'replacement',
          scope: 'clause',
          targetClause: 'amended',
          role: 'partial-amendment'
        }]
      })
    ]
  });
  const family = (await assertAdjudicated(adjudicator, fixture)).families[0];
  const obsoleteDocument = fixture.byKey
    .get('obsolete_partial').byRef.get('document');
  const currentDocument = fixture.byKey
    .get('current_partial').byRef.get('document');

  assert.equal(family.lineageProof.governance.value, 'partially-governing');
  assert.equal(family.lineageProof.overlays.length, 2,
    'the valid pre-replacement history and current replacement overlay are preserved');
  assert.equal(
    family.lineageProof.overlays.some((overlay) =>
      overlay.amendmentDocumentRecordVersionId === obsoleteDocument.recordVersionId),
    false,
    'a later partial against the superseded base is excluded from the governing path'
  );
  assert.equal(
    family.lineageProof.acceptedPath.includes(obsoleteDocument.recordVersionId),
    false,
    'the accepted path does not name an off-path obsolete amendment'
  );
  assert.equal(
    family.lineageProof.acceptedPath.includes(currentDocument.recordVersionId),
    true,
    'a partial targeting the current replacement is admitted to the path'
  );
  assert.equal(family.deadlineRules.length, 1);
  assert.equal(family.deadlineResults.length, 1);
  const selectedAnchor = family.assertions.find((assertion) =>
    assertion.assertionVersionId ===
      family.deadlineResults[0].anchorAssertionVersionId);
  assert.equal(selectedAnchor.subjectDocumentStableId, currentDocument.stableRecordId,
    'only the current replacement overlay can supply governing facts');
}

async function testSameDayLineageRequiresExplicitChronology(adjudicator) {
  for (const sameDayPartial of [{
    key: 'same_day_base_partial',
    target: 'base',
    targetClause: 'notice'
  }, {
    key: 'same_day_replacement_partial',
    target: 'replacement',
    targetClause: 'amended'
  }]) {
    const fixture = await makeInput({
      sources: [
        baseSource(),
        amendmentSource('replacement', {
          effectiveDates: ['2022-01-01'],
          lineages: [{
            from: 'replacement',
            to: 'base',
            scope: 'document',
            targetClause: null,
            role: 'full-replacement'
          }]
        }),
        amendmentSource(sameDayPartial.key, {
          effectiveDates: ['2022-01-01'],
          lineages: [{
            from: sameDayPartial.key,
            to: sameDayPartial.target,
            scope: 'clause',
            targetClause: sameDayPartial.targetClause,
            role: 'partial-amendment'
          }]
        })
      ]
    });
    const partialRecordId = fixture.byKey
      .get(sameDayPartial.key).byRef.get('document').recordVersionId;
    for (const reverseCandidates of [false, true]) {
      const input = plain(fixture.input);
      if (reverseCandidates) input.candidateGenerations.reverse();
      const family = (await assertAdjudicated(adjudicator, { input })).families[0];
      assert.equal(
        family.lineageProof.governance.value,
        'review-required',
        `${sameDayPartial.target} target cannot acquire a within-day precedence`
      );
      assert.equal(
        family.lineageProof.acceptedPath.includes(partialRecordId),
        false,
        `${sameDayPartial.target} target is withheld from the unresolved path`
      );
      assert.equal(
        family.lineageProof.overlays.some((overlay) =>
          overlay.amendmentDocumentRecordVersionId === partialRecordId),
        false,
        `${sameDayPartial.target} target cannot become a governing overlay`
      );
    }
  }

  const explicitlyOrdered = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('replacement', {
        effectiveDates: ['2022-01-01'],
        lineages: [{
          from: 'replacement',
          to: 'base',
          scope: 'document',
          targetClause: null,
          role: 'full-replacement'
        }]
      }),
      amendmentSource('later_partial', {
        effectiveDates: ['2022-01-02'],
        lineages: [{
          from: 'later_partial',
          to: 'replacement',
          scope: 'clause',
          targetClause: 'amended',
          role: 'partial-amendment'
        }]
      })
    ]
  });
  const explicitlyOrderedFamily = (
    await assertAdjudicated(adjudicator, explicitlyOrdered)
  ).families[0];
  assert.equal(
    explicitlyOrderedFamily.lineageProof.governance.value,
    'partially-governing',
    'distinct schema-validated civil dates provide an explicit chronology'
  );
  assert.equal(explicitlyOrderedFamily.lineageProof.overlays.length, 1);
}

function reorderObject(value, seed) {
  if (Array.isArray(value)) {
    const output = value.map((item, index) => reorderObject(item, seed + index + 1));
    if (seed % 2 === 1) output.reverse();
    return output;
  }
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value);
  if (seed % 2 === 1) entries.reverse();
  const output = {};
  entries.forEach(([key, child], index) => {
    output[key] = reorderObject(child, seed + index + 1);
  });
  return output;
}

async function testPermutationForbiddenSignalsAndLimits(adjudicator) {
  const fixture = await makeInput({
    sources: [
      baseSource(),
      amendmentSource('replacement', {
        lineages: [{
          from: 'replacement',
          to: 'base',
          scope: 'document',
          targetClause: null,
          role: 'full-replacement'
        }]
      })
    ]
  });
  const expected = TruthSchema.canonicalize(
    await adjudicator.adjudicateExactSet(fixture.input)
  );
  for (let seed = 0; seed < 100; seed += 1) {
    const permuted = reorderObject(plain(fixture.input), seed);
    const actual = await adjudicator.adjudicateExactSet(permuted);
    assert.equal(
      TruthSchema.canonicalize(actual),
      expected,
      `permutation ${seed} is byte-identical`
    );
  }

  for (const field of FORBIDDEN_HINTS) {
    const hostile = plain(fixture.input);
    hostile.candidateGenerations[0].batches[0].executionCandidates[0][field] =
      field === 'governing' || field === 'eligible' ? true : `hostile-${field}`;
    const result = await adjudicator.adjudicateExactSet(hostile);
    assert.equal(result.status, 'abstained', `${field} cannot become authority`);
  }
  for (const field of ['label', 'candidate order', 'support count']) {
    const changed = plain(fixture.input);
    if (field === 'label') {
      changed.graphSnapshot.records.forEach((record, index) => {
        record.label = `2099 FINAL newest ${index}.docx`;
      });
    } else if (field === 'candidate order') {
      changed.candidateGenerations.reverse();
    } else {
      changed.graphSnapshot.records.forEach((record) => {
        record.label = `${record.label} duplicated support majority`;
      });
    }
    assert.equal(
      TruthSchema.canonicalize(await adjudicator.adjudicateExactSet(changed)),
      expected,
      `${field} mutation is inert`
    );
  }

  for (const [field, maximum, item] of [
    ['sourceBindings', TruthSchema.LIMITS.MAX_SOURCES, {
      sourceFileId: 'source_overflow',
      sourceState: 'ready',
      certificationStatus: 'certified',
      graphCurrent: true,
      contentFingerprint: fingerprint('overflow'),
      fragmentGenerationId: `sfg1:${'1'.repeat(64)}`
    }],
    ['records', TruthSchema.LIMITS.MAX_GRAPH_RECORD_VERSIONS, fixture.input.graphSnapshot.records[0]],
    ['relations', TruthSchema.LIMITS.MAX_RELATION_VERSIONS, fixture.input.graphSnapshot.relations[0]]
  ]) {
    const hostile = plain(fixture.input);
    hostile.graphSnapshot[field] = Array.from({ length: maximum + 1 }, () => plain(item));
    const result = await adjudicator.adjudicateExactSet(hostile);
    assert.equal(result.status, 'abstained', `${field} max-plus-one returns no family prefix`);
    assert.deepEqual(Array.from(result.families), []);
  }
}

async function testExactCitationUnionCap(adjudicator) {
  const exact = await makeInput({
    sources: citationCapSources({ overflow: false })
  });
  const exactResult = await assertAdjudicated(adjudicator, exact);
  assert.equal(exactResult.status, 'adjudicated');
  assert.equal(exactResult.families.length, 1);
  assert.equal(
    exactResult.families[0].citations.length,
    TruthSchema.LIMITS.MAX_FAMILY_CITATIONS,
    'exactly 2,048 unique family-wide citations adjudicate'
  );
  assert.ok(
    await TruthSchema.parseSemanticFamilyProof(plain(exactResult.families[0])),
    'the exact-cap family reparses'
  );

  const overflow = await makeInput({
    sources: citationCapSources({ overflow: true })
  });
  const overflowResult = await adjudicator.adjudicateExactSet(overflow.input);
  assert.equal(overflowResult.status, 'abstained');
  assert.deepEqual(
    Array.from(overflowResult.families),
    [],
    '2,049 unique citations return no family prefix'
  );
}

async function testFactsConflictsDeadlinesAndStorageIndependence(adjudicator) {
  const facts = Object.entries(NINE_FACTS).map(([type, value]) => ({
    type,
    value,
    clause: 'notice'
  }));
  const fixture = await makeInput({
    sources: [baseSource({
      facts,
      rules: [{
        clause: 'notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null
      }]
    })]
  });
  const result = await assertAdjudicated(adjudicator, fixture);
  const family = result.families[0];
  assert.deepEqual(
    Array.from(new Set(family.assertions.map((assertion) => assertion.assertionType))).sort(),
    TruthSchema.ASSERTION_TYPES.slice().sort(),
    'all nine assertion types remain separate'
  );
  const statedAndDerived = family.assertions.filter(
    (assertion) => assertion.assertionType === 'notice-deadline'
  );
  assert.equal(statedAndDerived.length, 2, 'stated and derived deadlines remain separate');
  assert.deepEqual(
    statedAndDerived.map((assertion) => assertion.trustState).sort(),
    ['extracted', 'inferred']
  );
  assert.equal(
    statedAndDerived.find((assertion) => assertion.trustState === 'inferred')
      .derivationRuleVersion,
    TruthSchema.DEADLINE_RULE_VERSION
  );
  assert.equal(
    family.conflicts.some((conflict) => conflict.assertionType === 'notice-deadline'),
    false,
    'compatible stated and derived deadlines do not conflict'
  );
  assert.ok(family.deadlineRules.length === 1 && family.deadlineResults.length === 1);
  const deadline = family.deadlineResults[0];
  exactKeys(deadline, [
    'schemaVersion',
    'partitionKey',
    'familyId',
    'deadlineRuleId',
    'anchorAssertionVersionId',
    'anchorCivilDate',
    'windowStartCivilDate',
    'deadlineCivilDate',
    'boundary',
    'timezone',
    'consequence',
    'ruleVersion',
    'calendarId',
    'calendarVersionId',
    'inputAssertionVersionIds',
    'inputCitationIds',
    'trustState',
    'inputsCurrent',
    'inputsExact',
    'eligibility',
    'blockerCodes',
    'deadlineDerivationId'
  ], 'deadline proof keeps every semantic axis separate');
  assert.equal(deadline.eligibility, 'eligible');
  assert.ok(await TruthSchema.parseSemanticFamilyProof(plain(family)));
  const encoded = JSON.stringify(result);
  for (const field of STORAGE_FIELDS) {
    assert.equal(encoded.includes(`"${field}"`), false, `${field} stays store-owned`);
  }

  const conflicting = await makeInput({
    sources: [baseSource({
      facts: facts.concat({
        type: 'expiration-date',
        value: { kind: 'civil-date', value: '2027-03-03' },
        clause: 'notice'
      }),
      rules: [{
        clause: 'notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null
      }]
    })]
  });
  const conflictResult = await assertAdjudicated(adjudicator, conflicting);
  assert.ok(conflictResult.families[0].conflicts.length > 0);
  assert.ok(conflictResult.families[0].deadlineResults.every((item) =>
    item.eligibility === 'ineligible' && item.blockerCodes.includes('fact-conflict')));
}

async function testApplicabilityDuplicatesAndDerivedDeadlines(adjudicator) {
  const compatible = await makeInput({
    sources: [baseSource({
      evidenceCount: 2,
      facts: [{
        type: 'expiration-date',
        value: NINE_FACTS['expiration-date'],
        clause: 'notice',
        evidenceIndex: 0
      }, {
        type: 'expiration-date',
        value: NINE_FACTS['expiration-date'],
        clause: 'notice',
        evidenceIndex: 1
      }, {
        type: 'notice-window',
        value: NINE_FACTS['notice-window'],
        clause: 'notice'
      }],
      rules: [{
        clause: 'notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null
      }]
    })]
  });
  const compatibleFamily = (await assertAdjudicated(adjudicator, compatible)).families[0];
  assert.equal(
    compatibleFamily.assertions.filter(
      (assertion) => assertion.assertionType === 'expiration-date'
    ).length,
    2,
    'byte-equivalent facts retain their separate assertions and citations'
  );
  assert.equal(
    new Set(compatibleFamily.assertions.filter(
      (assertion) => assertion.assertionType === 'expiration-date'
    ).flatMap((assertion) => Array.from(assertion.citationIds))).size,
    2,
    'compatible duplicates retain separate evidence'
  );
  assert.equal(
    compatibleFamily.conflicts.some(
      (conflict) => conflict.assertionType === 'expiration-date'
    ),
    false,
    'byte-equivalent facts share a compatible slot'
  );
  assert.equal(compatibleFamily.deadlineResults[0].eligibility, 'eligible');

  const directConflict = await makeInput({
    sources: [baseSource({
      evidenceCount: 2,
      facts: [{
        type: 'expiration-date',
        value: NINE_FACTS['expiration-date'],
        clause: 'notice'
      }, {
        type: 'notice-window',
        value: NINE_FACTS['notice-window'],
        clause: 'notice'
      }, {
        type: 'notice-deadline',
        value: { kind: 'civil-date', value: '2026-11-06' },
        clause: 'notice',
        evidenceIndex: 1
      }],
      rules: [{
        clause: 'notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null,
        evidenceIndex: 0
      }]
    })]
  });
  const directConflictFamily = (
    await assertAdjudicated(adjudicator, directConflict)
  ).families[0];
  const deadlineAssertions = directConflictFamily.assertions.filter(
    (assertion) => assertion.assertionType === 'notice-deadline'
  );
  assert.equal(deadlineAssertions.length, 2, 'direct deadline is never overwritten');
  assert.deepEqual(
    deadlineAssertions.map((assertion) => assertion.trustState).sort(),
    ['extracted', 'inferred']
  );
  const deadlineConflict = directConflictFamily.conflicts.find(
    (conflict) => conflict.assertionType === 'notice-deadline'
  );
  assert.ok(deadlineConflict, 'incompatible direct and derived deadlines conflict');
  assert.deepEqual(
    Array.from(deadlineConflict.assertionVersionIds).sort(),
    deadlineAssertions.map((assertion) => assertion.assertionVersionId).sort()
  );
  assert.ok(
    directConflictFamily.deadlineResults.every((item) =>
      item.eligibility === 'ineligible' && item.blockerCodes.includes('fact-conflict')),
    'direct-versus-derived conflict blocks eligibility'
  );

  const governingReplacement = await makeInput({
    sources: [
      baseSource({
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2027-02-03' },
          clause: 'notice'
        }, {
          type: 'notice-window',
          value: NINE_FACTS['notice-window'],
          clause: 'notice'
        }],
        rules: [{
          clause: 'notice',
          operator: 'subtract-calendar-days',
          anchorAssertionType: 'expiration-date',
          amount: 30,
          boundary: 'exclusive',
          timezone: 'America/Chicago',
          calendarHandle: null
        }]
      }),
      amendmentSource('replacement', {
        effectiveDates: ['2023-01-01'],
        facts: [{
          type: 'expiration-date',
          value: { kind: 'civil-date', value: '2028-02-03' },
          clause: 'amended'
        }, {
          type: 'notice-window',
          value: NINE_FACTS['notice-window'],
          clause: 'amended'
        }],
        rules: [{
          clause: 'amended',
          operator: 'subtract-calendar-days',
          anchorAssertionType: 'expiration-date',
          amount: 90,
          boundary: 'exclusive',
          timezone: 'America/Chicago',
          calendarHandle: null
        }],
        lineages: [{
          from: 'replacement',
          to: 'base',
          scope: 'document',
          targetClause: null,
          role: 'full-replacement'
        }]
      })
    ]
  });
  const replacementFamily = (
    await assertAdjudicated(adjudicator, governingReplacement)
  ).families[0];
  assert.equal(
    replacementFamily.assertions.filter(
      (assertion) => assertion.assertionType === 'expiration-date'
    ).length,
    2,
    'nonapplicable base facts remain visible as history'
  );
  assert.equal(replacementFamily.deadlineRules.length, 1);
  assert.equal(replacementFamily.deadlineResults.length, 1);
  const replacementDocumentId = governingReplacement.byKey
    .get('replacement').byRef.get('document').stableRecordId;
  const selectedAnchor = replacementFamily.assertions.find(
    (assertion) =>
      assertion.assertionVersionId ===
      replacementFamily.deadlineResults[0].anchorAssertionVersionId
  );
  assert.equal(
    selectedAnchor.subjectDocumentStableId,
    replacementDocumentId,
    'historical base facts cannot clear the governing replacement rule'
  );
}

async function testDeadlineOperatorsCalendarsAndFailClosedInputs(adjudicator) {
  const calendar = businessCalendar();
  const cases = [{
    name: 'leap add',
    anchor: '2000-02-28',
    operator: 'add-calendar-days',
    expected: '2000-02-29',
    calendars: [],
    calendarHandle: null
  }, {
    name: 'leap subtract',
    anchor: '2000-03-01',
    operator: 'subtract-calendar-days',
    expected: '2000-02-29',
    calendars: [],
    calendarHandle: null
  }, {
    name: 'business add',
    anchor: '2026-07-02',
    operator: 'add-business-days',
    expected: '2026-07-06',
    calendars: [calendar],
    calendarHandle: calendar.calendarId
  }, {
    name: 'business subtract',
    anchor: '2026-07-06',
    operator: 'subtract-business-days',
    expected: '2026-07-02',
    calendars: [calendar],
    calendarHandle: calendar.calendarId
  }];
  for (const item of cases) {
    const fixture = await makeInput({
      calendars: item.calendars,
      sources: [baseSource({
        facts: [{
          type: 'signed-date',
          value: { kind: 'civil-date', value: item.anchor },
          clause: 'notice'
        }, {
          type: 'notice-window',
          value: NINE_FACTS['notice-window'],
          clause: 'notice'
        }],
        rules: [{
          clause: 'notice',
          operator: item.operator,
          anchorAssertionType: 'signed-date',
          amount: 1,
          boundary: 'inclusive',
          timezone: 'America/Chicago',
          calendarHandle: item.calendarHandle
        }]
      })]
    });
    const family = (await assertAdjudicated(adjudicator, fixture)).families[0];
    assert.equal(family.deadlineResults.length, 1, `${item.name} emits one proof`);
    assert.equal(family.deadlineResults[0].eligibility, 'eligible', item.name);
    assert.equal(family.deadlineResults[0].deadlineCivilDate, item.expected, item.name);
    if (item.calendarHandle) {
      assert.equal(family.deadlineResults[0].calendarId, calendar.calendarId);
      assert.equal(
        family.evaluationContext.calendars[0].calendarVersionId,
        calendar.calendarVersionId,
        `${item.name} binds immutable calendar data`
      );
    }
  }

  for (const [name, overrides, expectedBlocker] of [
    ['missing calendar', {
      operator: 'add-business-days',
      timezone: 'America/Chicago',
      calendarHandle: calendar.calendarId,
      includeConsequence: true
    }, 'business-calendar-missing'],
    ['missing timezone', {
      operator: 'add-calendar-days',
      timezone: null,
      calendarHandle: null,
      includeConsequence: true
    }, 'timezone-missing'],
    ['conflicting timezone', {
      operator: 'add-calendar-days',
      timezone: 'America/Chicago',
      contextTimezone: 'America/New_York',
      calendarHandle: null,
      includeConsequence: true
    }, 'evaluation-context-mismatch'],
    ['missing consequence', {
      operator: 'add-calendar-days',
      timezone: 'America/Chicago',
      calendarHandle: null,
      includeConsequence: false
    }, 'consequence-missing']
  ]) {
    const facts = [{
      type: 'signed-date',
      value: { kind: 'civil-date', value: '2026-07-02' },
      clause: 'notice'
    }];
    if (overrides.includeConsequence) {
      facts.push({
        type: 'notice-window',
        value: NINE_FACTS['notice-window'],
        clause: 'notice'
      });
    }
    const fixture = await makeInput({
      timezone: overrides.contextTimezone,
      providerCalendars: name === 'missing calendar' ? [calendar] : [],
      sources: [baseSource({
        facts,
        rules: [{
          clause: 'notice',
          operator: overrides.operator,
          anchorAssertionType: 'signed-date',
          amount: 1,
          boundary: 'exclusive',
          timezone: overrides.timezone,
          calendarHandle: overrides.calendarHandle
        }]
      })]
    });
    const family = (await assertAdjudicated(adjudicator, fixture)).families[0];
    assert.equal(family.deadlineResults.length, 1, `${name} emits a blocked proof`);
    assert.equal(family.deadlineResults[0].eligibility, 'ineligible', name);
    assert.ok(family.deadlineResults[0].blockerCodes.includes(expectedBlocker), name);
  }

  const inaccessible = await makeInput({
    sources: [baseSource({ sourceState: 'inaccessible' })]
  });
  const inaccessibleResult = await adjudicator.adjudicateExactSet(inaccessible.input);
  assert.equal(inaccessibleResult.status, 'abstained');
  assert.deepEqual(Array.from(inaccessibleResult.families), []);
  assert.ok(inaccessibleResult.blockerCodes.includes('source-unavailable'));

  for (const [name, mutate] of [
    ['stale citation', (input) => {
      input.candidateGenerations[0].batches[0]
        .factCandidates[0].evidence[0].sourceByteStart += 1;
    }],
    ['unsupported operator', (input) => {
      input.candidateGenerations[0].batches[0]
        .deadlineRuleCandidates[0].operator = 'multiply-calendar-days';
    }],
    ['missing boundary', (input) => {
      input.candidateGenerations[0].batches[0]
        .deadlineRuleCandidates[0].boundary = null;
    }],
    ['missing consequence evidence', (input) => {
      input.candidateGenerations[0].batches[0]
        .deadlineRuleCandidates[0].consequenceEvidence = null;
    }]
  ]) {
    const fixture = await makeInput({
      sources: [baseSource({
        facts: [{
          type: 'signed-date',
          value: { kind: 'civil-date', value: '2026-07-02' },
          clause: 'notice'
        }, {
          type: 'notice-window',
          value: NINE_FACTS['notice-window'],
          clause: 'notice'
        }],
        rules: [{
          clause: 'notice',
          operator: 'add-calendar-days',
          anchorAssertionType: 'signed-date',
          amount: 1,
          boundary: 'exclusive',
          timezone: 'America/Chicago',
          calendarHandle: null
        }]
      })]
    });
    const hostile = plain(fixture.input);
    mutate(hostile);
    const result = await adjudicator.adjudicateExactSet(hostile);
    assert.equal(result.status, 'abstained', `${name} fails closed`);
    assert.deepEqual(Array.from(result.families), [], `${name} returns no family prefix`);
  }
}

async function testInjectedPureBoundaries(Adjudicator) {
  let deadlineCalls = 0;
  let byteLengthCalls = 0;
  const injectedDeadlineEngine = Object.freeze({
    VERSION: DeadlineEngine.VERSION,
    parseCivilDate: DeadlineEngine.parseCivilDate,
    toOrdinal: DeadlineEngine.toOrdinal,
    fromOrdinal: DeadlineEngine.fromOrdinal,
    async evaluateRule(...args) {
      deadlineCalls += 1;
      return DeadlineEngine.evaluateRule(...args);
    }
  });
  const adjudicator = Adjudicator.create({
    truthSchema: TruthSchema,
    deadlineEngine: injectedDeadlineEngine,
    byteLength(value) {
      byteLengthCalls += 1;
      return Buffer.byteLength(String(value), 'utf8');
    }
  });
  assert.ok(adjudicator, 'pure dependencies are injected through the exact factory');
  const fixture = await makeInput({
    sources: [baseSource({
      facts: [{
        type: 'expiration-date',
        value: NINE_FACTS['expiration-date'],
        clause: 'notice'
      }, {
        type: 'notice-window',
        value: NINE_FACTS['notice-window'],
        clause: 'notice'
      }],
      rules: [{
        clause: 'notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null
      }]
    })]
  });
  const result = await assertAdjudicated(adjudicator, fixture);
  assert.equal(result.families[0].deadlineResults[0].eligibility, 'eligible');
  assert.equal(deadlineCalls, 1, 'the adjudicator calls only the injected deadline API');
  assert.equal(byteLengthCalls, 1, 'the semantic byte bound uses only the injected counter');
}

function testClassicParityAndStaticBoundary(Adjudicator) {
  const source = fs.readFileSync(ADJUDICATOR_PATH, 'utf8');
  const sandbox = {
    FsbSkopeoTruthSchema: TruthSchema,
    FsbSkopeoDeadlineEngine: DeadlineEngine,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    Object,
    Array,
    Number,
    String,
    RegExp,
    Reflect,
    Promise,
    Set,
    Map,
    WeakMap,
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: ADJUDICATOR_PATH });
  assert.strictEqual(sandbox.FsbSkopeoLineageAdjudicator, sandbox.module.exports);
  exactKeys(sandbox.module.exports, EXPECTED_MODULE_SURFACE, 'classic/CommonJS API parity');
  assert.equal(Adjudicator, sandbox.module.exports === Adjudicator ? Adjudicator : Adjudicator);
  for (const token of [
    'chrome.storage',
    'browser.storage',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    'new Date',
    'Date.parse',
    'Intl.',
    'toLocale',
    'chrome.alarms',
    'chrome.notifications',
    'recipient',
    'alertLedger',
    'renderHud',
    'renderFolder',
    'freeFormAsk',
    'Document 10',
    'memoPolicy',
    'scheduleDeadline',
    'deliverAlert',
    'MCP',
    'provider.send',
    'model.call'
  ]) {
    assert.equal(source.includes(token), false, `production excludes ${token}`);
  }
}

async function matrixCanonical(adjudicator) {
  const fixture = await makeInput({
    sources: [baseSource({
      facts: [{
        type: 'expiration-date',
        value: NINE_FACTS['expiration-date'],
        clause: 'notice'
      }, {
        type: 'notice-window',
        value: NINE_FACTS['notice-window'],
        clause: 'notice'
      }],
      rules: [{
        clause: 'notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null
      }]
    })]
  });
  return TruthSchema.canonicalize(await adjudicator.adjudicateExactSet(fixture.input));
}

async function testEnvironmentMatrix(adjudicator) {
  const outputs = [];
  for (const timezone of ['UTC', 'America/Chicago', 'Pacific/Kiritimati']) {
    const child = spawnSync(process.execPath, [__filename], {
      cwd: ROOT,
      env: {
        ...process.env,
        SKOPEO_ADJUDICATOR_MATRIX: '1',
        TZ: timezone
      },
      encoding: 'utf8',
      timeout: 30000
    });
    assert.equal(child.status, 0, `${timezone} child: ${child.stderr.trim()}`);
    assert.equal(child.stderr, '');
    outputs.push(child.stdout.trim());
  }
  assert.ok(outputs[0], 'matrix emits canonical output');
  outputs.slice(1).forEach((output) => {
    assert.equal(output, outputs[0], 'host TZ cannot alter adjudication');
  });
  assert.ok(adjudicator, 'parent adjudicator remains live after child matrix');
}

async function main() {
  assert.equal(TruthSchema.VERSION, 'skopeo-truth-schema/1');
  assert.equal(DeadlineEngine.VERSION, 'skopeo-deadline-engine/1');
  assert.equal(GraphSchema.VERSION, 'skopeo-graph-schema/1');

  /*
   * Build and parse production-shaped dependencies before the controlled RED
   * marker can be emitted. A syntax, loader, fixture, graph, truth-schema, or
   * deadline-engine failure therefore cannot masquerade as the missing contract.
   */
  await makeInput({ sources: [baseSource()] });
  if (!fs.existsSync(ADJUDICATOR_PATH)) {
    process.stderr.write(`${MISSING_MARKER}\n`);
    process.exitCode = 1;
    return;
  }

  delete require.cache[require.resolve(ADJUDICATOR_PATH)];
  const Adjudicator = require(ADJUDICATOR_PATH);
  exactKeys(Adjudicator, EXPECTED_MODULE_SURFACE, 'module surface is exact');
  assert.equal(Adjudicator.VERSION, VERSION);
  assert.equal(Object.isFrozen(Adjudicator), true);
  const adjudicator = Adjudicator.create({
    truthSchema: TruthSchema,
    deadlineEngine: DeadlineEngine,
    byteLength(value) {
      return Buffer.byteLength(String(value), 'utf8');
    }
  });
  assert.ok(adjudicator);
  exactKeys(adjudicator, EXPECTED_INSTANCE_SURFACE, 'instance surface is exact');
  assert.equal(Object.isFrozen(adjudicator), true);

  if (MATRIX_MODE) {
    process.stdout.write(`${await matrixCanonical(adjudicator)}\n`);
    return;
  }

  await testBaseDraftReplacementOverlayAndHistory(adjudicator);
  await testSequentialOverlaysAndReviewRequiredCases(adjudicator);
  await testPartialsFollowOnlyTheCurrentReplacementPath(adjudicator);
  await testSameDayLineageRequiresExplicitChronology(adjudicator);
  await testPermutationForbiddenSignalsAndLimits(adjudicator);
  await testExactCitationUnionCap(adjudicator);
  await testFactsConflictsDeadlinesAndStorageIndependence(adjudicator);
  await testApplicabilityDuplicatesAndDerivedDeadlines(adjudicator);
  await testDeadlineOperatorsCalendarsAndFailClosedInputs(adjudicator);
  await testInjectedPureBoundaries(Adjudicator);
  testClassicParityAndStaticBoundary(Adjudicator);
  await testEnvironmentMatrix(adjudicator);
  process.stdout.write('skopeo lineage adjudicator contract: PASS\n');
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
