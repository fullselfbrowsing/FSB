'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-truth-schema.js');
const GRAPH_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-graph-schema.js');
const VALIDATOR_PATH = path.join(ROOT, 'extension', 'lib', 'cfworker-json-schema.min.js');

/*
 * Controlled RED: keep the marker assembled at runtime so an unrelated parser or
 * loader failure cannot satisfy the fixed-string gate by echoing this source.
 */
if (!fs.existsSync(SCHEMA_PATH)) {
  console.error(['skopeo', 'truth', 'schema', 'contract'].join(' '));
  process.exitCode = 1;
} else {
  const validatorSource = fs.readFileSync(VALIDATOR_PATH, 'utf8');
  if (!globalThis.CfworkerJsonSchema) vm.runInThisContext(validatorSource);
  const GraphSchema = require(GRAPH_SCHEMA_PATH);
  const TruthSchema = require(SCHEMA_PATH);

  const VERSION = 'skopeo-truth-schema/1';
  const IDENTITY_VERSION = 'skopeo-truth-identity/1';
  const PROMPT_VERSION = 'skopeo-truth-extraction-prompt/1';
  const ADJUDICATION_VERSION = 'skopeo-lineage-adjudicator/1';
  const DEADLINE_RULE_VERSION = 'skopeo-deadline-rules/1';
  const CALENDAR_VERSION = 'skopeo-business-calendar/1';
  const SNAPSHOT_VERSION = 'skopeo-truth-snapshot/1';
  const GRAPH_VERSION = 'skopeo-graph-schema/1';

  const ASSERTION_TYPES = Object.freeze([
    'signed-date',
    'effective-date',
    'expiration-date',
    'termination-date',
    'renewal',
    'notice-window',
    'notice-deadline',
    'delivery-method',
    'written-address'
  ]);
  const TRUST_STATES = Object.freeze([
    'extracted',
    'inferred',
    'ambiguous',
    'unreadable',
    'review-required'
  ]);
  const SOURCE_STATES = Object.freeze([
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ]);
  const EXECUTION_STATES = Object.freeze(['executed', 'unsigned', 'unknown']);
  const TEMPORAL_STATES = Object.freeze([
    'future',
    'effective',
    'expired',
    'terminated',
    'unknown'
  ]);
  const LINEAGE_ROLES = Object.freeze([
    'base',
    'partial-amendment',
    'full-replacement',
    'historical',
    'unclassified'
  ]);
  const GOVERNANCE_CONCLUSIONS = Object.freeze([
    'governing',
    'partially-governing',
    'superseded',
    'non-governing',
    'review-required'
  ]);
  const AXIS_REASON_CODES = Object.freeze({
    execution: Object.freeze([
      'executed-evidence',
      'unsigned-evidence',
      'execution-evidence-missing'
    ]),
    temporal: Object.freeze([
      'future-effective-date',
      'effective-as-of-date',
      'expired-as-of-date',
      'terminated-as-of-date',
      'temporal-evidence-incomplete'
    ]),
    lineageRole: Object.freeze([
      'lineage-base-evidence',
      'lineage-partial-amendment-evidence',
      'lineage-full-replacement-evidence',
      'lineage-historical-evidence',
      'lineage-evidence-incomplete'
    ]),
    governance: Object.freeze([
      'governing-path-accepted',
      'partial-overlay-accepted',
      'explicitly-superseded',
      'non-governing-evidence',
      'governance-review-required'
    ])
  });
  const DEADLINE_OPERATORS = Object.freeze([
    'add-calendar-days',
    'subtract-calendar-days',
    'add-business-days',
    'subtract-business-days'
  ]);
  const BLOCKER_CODES = Object.freeze([
    'boundary-ambiguous',
    'business-calendar-missing',
    'citation-stale',
    'consequence-missing',
    'evaluation-context-mismatch',
    'evaluation-context-missing',
    'evaluation-context-stale',
    'exact-set-incomplete',
    'exact-set-over-cap',
    'fact-conflict',
    'fact-missing',
    'input-not-exact',
    'lineage-not-current',
    'lineage-review-required',
    'rule-version-stale',
    'snapshot-stale',
    'source-unavailable',
    'source-unreadable',
    'timezone-missing',
    'unsupported-business-day-rule',
    'unsupported-rule'
  ]);
  const ID_PREFIXES = Object.freeze([
    'stc1:',
    'stg1:',
    'stf1:',
    'sta1:',
    'stav1:',
    'stx1:',
    'str1:',
    'std1:',
    'sts1:'
  ]);
  const EXPECTED_LIMITS = Object.freeze({
    MAX_SOURCES: 32,
    MAX_CANDIDATES_PER_BATCH: 128,
    MAX_CANDIDATES_PER_SOURCE_GENERATION: 1024,
    MAX_EVIDENCE_LOCATORS_PER_CANDIDATE: 4,
    MAX_CITATIONS_PER_ASSERTION: 4,
    MAX_GRAPH_RECORD_VERSIONS: 4096,
    MAX_RELATION_VERSIONS: 16384,
    MAX_ASSERTIONS_PER_FAMILY: 2048,
    MAX_FAMILY_CITATIONS: 2048,
    MAX_CONFLICTS_PER_FAMILY: 512,
    MAX_RULES_PER_FAMILY: 512,
    MAX_BLOCKER_CODES_PER_RESULT: 32,
    MAX_HOLIDAYS_PER_CALENDAR: 4096,
    MAX_DAY_OFFSET_MAGNITUDE: 36600,
    MAX_FAMILY_SNAPSHOT_BYTES: 8 * 1024 * 1024,
    MAX_MINIMIZED_RESULT_BYTES: 64 * 1024
  });
  const EXPECTED_SURFACE = Object.freeze([
    'VERSION',
    'IDENTITY_VERSION',
    'CANDIDATE_SCHEMA_VERSION',
    'PROMPT_VERSION',
    'ADJUDICATION_VERSION',
    'DEADLINE_RULE_VERSION',
    'CALENDAR_VERSION',
    'SNAPSHOT_VERSION',
    'LIMITS',
    'ASSERTION_TYPES',
    'TRUST_STATES',
    'SOURCE_STATES',
    'EXECUTION_STATES',
    'TEMPORAL_STATES',
    'LINEAGE_ROLES',
    'GOVERNANCE_CONCLUSIONS',
    'AXIS_REASON_CODES',
    'DEADLINE_OPERATORS',
    'BLOCKER_CODES',
    'parseCandidateEnvelope',
    'parseCitation',
    'parseAssertion',
    'parseConflictSet',
    'parseLineageProof',
    'parseBusinessCalendar',
    'parseEvaluationContext',
    'parseDeadlineRule',
    'parseDeadlineResult',
    'parseSemanticFamilyProof',
    'parseFamilySnapshotManifest',
    'deriveCitationId',
    'deriveCandidateGenerationId',
    'deriveFamilyId',
    'deriveAssertionId',
    'deriveAssertionVersionId',
    'deriveConflictSetId',
    'deriveDeadlineRuleId',
    'deriveDeadlineDerivationId',
    'deriveSnapshotId',
    'canonicalize',
    'sha256Hex'
  ]);

  const PARTITION = 'scpk1:7:account6:corpus';
  const SOURCE_A = 'source_alpha';
  const SOURCE_B = 'source_beta';
  const FINGERPRINT_A = `sha256:${'a'.repeat(64)}`;
  const FINGERPRINT_B = `sha256:${'b'.repeat(64)}`;
  const DOC_A = `sri1:${'1'.padStart(64, '0')}`;
  const DOC_B = `sri1:${'2'.padStart(64, '0')}`;
  const CLAUSE_A = `sri1:${'3'.padStart(64, '0')}`;
  const CLAUSE_B = `sri1:${'7'.padStart(64, '0')}`;
  const RECORD_A = `srv1:${'4'.padStart(64, '0')}`;
  const RECORD_B = `srv1:${'5'.padStart(64, '0')}`;
  const CLAUSE_RECORD_A = `srv1:${'6'.padStart(64, '0')}`;
  const CLAUSE_RECORD_B = `srv1:${'7'.padStart(64, '0')}`;
  const RELATION_A = `slv1:${'7'.padStart(64, '0')}`;
  const AUTHORIZED_SET_DIGEST = `sgx1:${'8'.repeat(64)}`;

  function plain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clone(value) {
    return plain(value);
  }

  function hexId(prefix, number) {
    return prefix + Number(number).toString(16).padStart(64, '0');
  }

  function sorted(values) {
    return values.slice().sort();
  }

  function frozenTree(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return true;
    seen.add(value);
    if (!Object.isFrozen(value)) return false;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
          !frozenTree(descriptor.value, seen)) return false;
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
          !nullPrototypeTree(descriptor.value, seen)) return false;
    }
    return true;
  }

  async function rejectsNull(promise, message) {
    assert.equal(await promise, null, message);
  }

  function rejectsNullSync(value, message) {
    assert.equal(value, null, message);
  }

  function expectExactKeys(value, keys, message) {
    assert.deepEqual(Object.keys(value).sort(), keys.slice().sort(), message);
  }

  async function graphEvidence({
    sourceFileId = SOURCE_A,
    contentFingerprint = FINGERPRINT_A,
    text = 'executed effective replacement expiration notice address',
    sourceByteStart = 100,
    start = 0,
    end = 8
  } = {}) {
    const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
      schemaVersion: GRAPH_VERSION,
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint
    });
    const evidence = await GraphSchema.parseEvidenceLocator({
      excerptId: 'excerpt_01',
      start,
      end
    }, {
      partitionKey: PARTITION,
      sourceFileId,
      contentFingerprint,
      fragmentGenerationId,
      excerpts: [{
        excerptId: 'excerpt_01',
        text,
        sourceByteStart,
        sourceByteEnd: sourceByteStart + Buffer.byteLength(text, 'utf8')
      }]
    });
    assert.ok(evidence, 'graph evidence fixture is valid');
    return evidence;
  }

  async function citationFrom(evidence, {
    recordVersionId = RECORD_A,
    relationVersionId = null
  } = {}) {
    const identity = {
      schemaVersion: VERSION,
      partitionKey: evidence.partitionKey,
      sourceFileId: evidence.sourceFileId,
      contentFingerprint: evidence.contentFingerprint,
      fragmentGenerationId: evidence.fragmentGenerationId,
      recordVersionId,
      relationVersionId,
      locatorId: evidence.locatorId,
      sourceByteStart: evidence.sourceByteStart,
      sourceByteEnd: evidence.sourceByteEnd
    };
    const citationId = await TruthSchema.deriveCitationId(identity);
    return {
      ...identity,
      excerptId: evidence.excerptId,
      start: evidence.start,
      end: evidence.end,
      citationId
    };
  }

  async function makeFamily() {
    const input = {
      identityVersion: IDENTITY_VERSION,
      partitionKey: PARTITION,
      documentStableIds: [DOC_A, DOC_B],
      lineageRelationIds: [RELATION_A]
    };
    return {
      input,
      familyId: await TruthSchema.deriveFamilyId(input)
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

  async function assertionFrom({
    familyId,
    citation,
    assertionType = 'signed-date',
    typedValue = typedValues()[assertionType],
    trustState = 'extracted',
    subjectDocumentStableId = DOC_A,
    subjectClauseStableId = CLAUSE_A,
    primarySourceByteStart = citation.sourceByteStart,
    primarySourceByteEnd = citation.sourceByteEnd,
    citationIds = [citation.citationId],
    derivationRuleVersion = null
  }) {
    const primarySourceLocator = {
      sourceFileId: citation.sourceFileId,
      sourceByteStart: primarySourceByteStart,
      sourceByteEnd: primarySourceByteEnd
    };
    const assertionId = await TruthSchema.deriveAssertionId({
      identityVersion: IDENTITY_VERSION,
      partitionKey: PARTITION,
      familyId,
      subjectDocumentStableId,
      subjectClauseStableId,
      assertionType,
      primarySourceLocator
    });
    const assertionVersionId = await TruthSchema.deriveAssertionVersionId({
      assertionId,
      typedValue,
      trustState,
      citationIds: sorted(citationIds),
      candidateSchemaVersion: 1,
      promptVersion: PROMPT_VERSION,
      derivationRuleVersion
    });
    return {
      schemaVersion: VERSION,
      partitionKey: PARTITION,
      familyId,
      subjectDocumentStableId,
      subjectClauseStableId,
      assertionType,
      typedValue,
      trustState,
      citationIds: sorted(citationIds),
      primarySourceLocator,
      candidateSchemaVersion: 1,
      promptVersion: PROMPT_VERSION,
      derivationRuleVersion,
      assertionId,
      assertionVersionId
    };
  }

  async function conflictFrom({
    familyId,
    assertionVersionIds,
    citationIds,
    assertionType = 'signed-date',
    ordinal = 0
  }) {
    const identity = {
      identityVersion: IDENTITY_VERSION,
      partitionKey: PARTITION,
      familyId,
      subjectDocumentStableId: DOC_A,
      subjectClauseStableId: CLAUSE_A,
      assertionType,
      applicabilityContext: `governing-clause:${ordinal}`,
      assertionVersionIds: sorted(assertionVersionIds)
    };
    return {
      schemaVersion: VERSION,
      partitionKey: PARTITION,
      familyId,
      subjectDocumentStableId: DOC_A,
      subjectClauseStableId: CLAUSE_A,
      assertionType,
      applicabilityContext: identity.applicabilityContext,
      assertionVersionIds: identity.assertionVersionIds,
      citationIds: sorted(citationIds),
      conflictSetId: await TruthSchema.deriveConflictSetId(identity)
    };
  }

  function axis(value, reasonCode, citationIds, inputRecordVersionIds, inputRelationVersionIds) {
    return {
      value,
      reasonCode,
      citationIds: sorted(citationIds),
      inputRecordVersionIds: sorted(inputRecordVersionIds),
      inputRelationVersionIds: sorted(inputRelationVersionIds),
      trustState: 'extracted',
      basis: 'direct'
    };
  }

  function lineageProof({ familyId, citationIds }) {
    return {
      schemaVersion: VERSION,
      partitionKey: PARTITION,
      familyId,
      execution: axis(
        'executed',
        'executed-evidence',
        citationIds,
        [RECORD_A],
        []
      ),
      temporal: axis(
        'effective',
        'effective-as-of-date',
        citationIds,
        [RECORD_A],
        []
      ),
      lineageRole: axis(
        'full-replacement',
        'lineage-full-replacement-evidence',
        citationIds,
        [RECORD_A, RECORD_B],
        [RELATION_A]
      ),
      governance: axis(
        'governing',
        'governing-path-accepted',
        citationIds,
        [RECORD_A, RECORD_B],
        [RELATION_A]
      ),
      acceptedPath: [RECORD_A, RECORD_B],
      overlays: [{
        baseClauseRecordVersionId: CLAUSE_RECORD_A,
        amendmentDocumentRecordVersionId: RECORD_B,
        amendmentClauseRecordVersionId: hexId('srv1:', 9),
        effect: 'replace',
        citationIds: sorted(citationIds)
      }],
      inheritances: [{
        baseClauseRecordVersionId: CLAUSE_RECORD_A,
        governingDocumentRecordVersionId: RECORD_A,
        citationIds: sorted(citationIds)
      }]
    };
  }

  function configuredEvaluationContext(calendars = []) {
    return {
      asOfCivilDate: '2026-07-23',
      governingTimezoneBinding: {
        kind: 'configured',
        timezone: 'America/Chicago',
        configurationId: 'tenant-contract-timezone',
        configurationVersion: 'v1'
      },
      calendars
    };
  }

  function citedEvaluationContext(citationIds, calendars = []) {
    return {
      asOfCivilDate: '2026-07-23',
      governingTimezoneBinding: {
        kind: 'cited',
        timezone: 'America/Chicago',
        citationIds: sorted(citationIds)
      },
      calendars
    };
  }

  function calendar(overrides = {}) {
    return {
      schemaVersion: CALENDAR_VERSION,
      calendarId: 'calendar-us-business',
      calendarVersionId: 'calendar-us-business-v1',
      weekendDays: [0, 6],
      holidays: ['2026-01-01', '2026-07-04'],
      ...overrides
    };
  }

  async function deadlineRuleFrom({
    familyId,
    assertion,
    citation,
    operator = 'subtract-calendar-days',
    amount = 90,
    calendarId = null,
    calendarVersionId = null
  }) {
    const input = {
      schemaVersion: DEADLINE_RULE_VERSION,
      partitionKey: PARTITION,
      familyId,
      operator,
      anchorAssertionVersionId: assertion.assertionVersionId,
      amount,
      boundary: 'exclusive',
      timezone: 'America/Chicago',
      businessCalendarId: calendarId,
      businessCalendarVersionId: calendarVersionId,
      consequence: {
        assertionVersionId: assertion.assertionVersionId,
        citationIds: [citation.citationId]
      },
      citedInputAssertionVersionIds: [assertion.assertionVersionId],
      citationIds: [citation.citationId]
    };
    return {
      ...input,
      deadlineRuleId: await TruthSchema.deriveDeadlineRuleId(input)
    };
  }

  async function deadlineResultFrom({ familyId, rule, assertion, citation }) {
    const input = {
      schemaVersion: VERSION,
      partitionKey: PARTITION,
      familyId,
      deadlineRuleId: rule.deadlineRuleId,
      anchorAssertionVersionId: assertion.assertionVersionId,
      anchorCivilDate: '2027-02-03',
      windowStartCivilDate: '2026-11-05',
      deadlineCivilDate: '2026-11-05',
      boundary: 'exclusive',
      timezone: 'America/Chicago',
      consequence: rule.consequence,
      ruleVersion: DEADLINE_RULE_VERSION,
      calendarId: null,
      calendarVersionId: null,
      inputAssertionVersionIds: [assertion.assertionVersionId],
      inputCitationIds: [citation.citationId],
      trustState: 'inferred',
      inputsCurrent: true,
      inputsExact: true,
      eligibility: 'eligible',
      blockerCodes: []
    };
    return {
      ...input,
      deadlineDerivationId: await TruthSchema.deriveDeadlineDerivationId(input)
    };
  }

  async function candidateFixture(evidence) {
    const generationInput = {
      schemaVersion: VERSION,
      partitionKey: PARTITION,
      sourceFileId: SOURCE_A,
      contentFingerprint: FINGERPRINT_A,
      fragmentGenerationId: evidence.fragmentGenerationId,
      candidateSchemaVersion: 1,
      promptVersion: PROMPT_VERSION,
      providerId: 'openai-compatible',
      modelId: 'configured-model',
      batchOrdinal: 0
    };
    const context = {
      ...generationInput,
      documentHandles: [
        { handle: 'doc:base', stableRecordId: DOC_A, recordVersionId: RECORD_A },
        { handle: 'doc:replacement', stableRecordId: DOC_B, recordVersionId: RECORD_B }
      ],
      clauseHandles: [
        {
          handle: 'clause:notice',
          stableRecordId: CLAUSE_A,
          recordVersionId: CLAUSE_RECORD_A,
          documentHandle: 'doc:base'
        },
        {
          handle: 'clause:replacement',
          stableRecordId: CLAUSE_B,
          recordVersionId: CLAUSE_RECORD_B,
          documentHandle: 'doc:replacement'
        }
      ],
      relationHandles: [{ handle: 'relation:replacement', relationVersionId: RELATION_A }],
      calendarHandles: [],
      evidenceHandles: [{ handle: 'evidence:primary', locator: evidence }]
    };
    const envelope = {
      schemaVersion: 1,
      batchId: 'truth_batch_0001',
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
      lineageCandidates: [{
        candidateRef: 'lineage:1',
        documentHandle: 'doc:replacement',
        targetDocumentHandle: 'doc:base',
        targetClauseHandle: null,
        amendmentClauseHandle: null,
        relationHandle: 'relation:replacement',
        lineageRole: 'full-replacement',
        scope: 'document',
        evidenceHandles: ['evidence:primary']
      }],
      factCandidates: [{
        candidateRef: 'fact:1',
        documentHandle: 'doc:base',
        clauseHandle: 'clause:notice',
        assertionType: 'signed-date',
        typedValue: { kind: 'civil-date', value: '2026-01-02' },
        evidenceHandles: ['evidence:primary']
      }],
      deadlineRuleCandidates: [{
        candidateRef: 'deadline:1',
        documentHandle: 'doc:base',
        clauseHandle: 'clause:notice',
        operator: 'subtract-calendar-days',
        anchorAssertionType: 'expiration-date',
        amount: 90,
        boundary: 'exclusive',
        timezone: 'America/Chicago',
        calendarHandle: null,
        consequenceEvidenceHandle: 'evidence:primary',
        evidenceHandles: ['evidence:primary']
      }]
    };
    return {
      generationInput,
      context,
      envelope,
      generationId: await TruthSchema.deriveCandidateGenerationId(generationInput)
    };
  }

  async function semanticFixture({
    citations,
    evaluationContext,
    assertions,
    conflicts,
    deadlineRules,
    deadlineResults,
    sourceBindings,
    recordVersionIds,
    relationVersionIds,
    candidateGenerationIds
  }) {
    const family = await makeFamily();
    return {
      schemaVersion: VERSION,
      partitionKey: PARTITION,
      familyId: family.familyId,
      authorizedSetDigest: AUTHORIZED_SET_DIGEST,
      sourceBindings: (sourceBindings || [{
        sourceFileId: SOURCE_A,
        contentFingerprint: FINGERPRINT_A,
        fragmentGenerationId: citations[0].fragmentGenerationId,
        sourceState: 'ready',
        certified: true
      }]).slice().sort((left, right) => left.sourceFileId.localeCompare(right.sourceFileId)),
      documentStableIds: family.input.documentStableIds,
      lineageRelationIds: family.input.lineageRelationIds,
      recordVersionIds: sorted(recordVersionIds || [RECORD_A, RECORD_B, CLAUSE_RECORD_A]),
      relationVersionIds: sorted(relationVersionIds || [RELATION_A]),
      candidateGenerationIds: sorted(candidateGenerationIds || [hexId('stg1:', 1)]),
      candidateSchemaVersion: 1,
      promptVersion: PROMPT_VERSION,
      adjudicationVersion: ADJUDICATION_VERSION,
      deadlineRuleVersion: DEADLINE_RULE_VERSION,
      calendarVersion: CALENDAR_VERSION,
      evaluationContext,
      lineageProof: lineageProof({
        familyId: family.familyId,
        citationIds: [citations[0].citationId]
      }),
      assertions: assertions.slice().sort(
        (left, right) => left.assertionVersionId.localeCompare(right.assertionVersionId)
      ),
      conflicts: conflicts.slice().sort(
        (left, right) => left.conflictSetId.localeCompare(right.conflictSetId)
      ),
      citations: citations.slice().sort(
        (left, right) => left.citationId.localeCompare(right.citationId)
      ),
      deadlineRules: deadlineRules.slice().sort(
        (left, right) => left.deadlineRuleId.localeCompare(right.deadlineRuleId)
      ),
      deadlineResults: deadlineResults.slice().sort(
        (left, right) => left.deadlineDerivationId.localeCompare(right.deadlineDerivationId)
      )
    };
  }

  async function manifestFixture(proof) {
    const canonical = TruthSchema.canonicalize(proof);
    const categoryCounts = {
      assertions: proof.assertions.length,
      citations: proof.citations.length,
      conflicts: proof.conflicts.length,
      deadlineResults: proof.deadlineResults.length,
      deadlineRules: proof.deadlineRules.length
    };
    const pages = Object.keys(categoryCounts).sort().map((category, index) => ({
      category,
      pageOrdinal: 0,
      itemCount: categoryCounts[category],
      pageHash: `sha256:${(index + 10).toString(16).repeat(64).slice(0, 64)}`
    }));
    const input = {
      schemaVersion: SNAPSHOT_VERSION,
      partitionKey: proof.partitionKey,
      familyId: proof.familyId,
      semanticProofDigest: await TruthSchema.sha256Hex(proof),
      semanticProofBytes: Buffer.byteLength(canonical, 'utf8'),
      authorizedSetDigest: proof.authorizedSetDigest,
      sourceBindings: proof.sourceBindings,
      recordVersionIds: proof.recordVersionIds,
      relationVersionIds: proof.relationVersionIds,
      candidateGenerationIds: proof.candidateGenerationIds,
      candidateSchemaVersion: proof.candidateSchemaVersion,
      promptVersion: proof.promptVersion,
      adjudicationVersion: proof.adjudicationVersion,
      deadlineRuleVersion: proof.deadlineRuleVersion,
      calendarVersion: proof.calendarVersion,
      evaluationContext: proof.evaluationContext,
      categoryCounts,
      pages
    };
    return {
      ...input,
      snapshotId: await TruthSchema.deriveSnapshotId(input)
    };
  }

  async function testSurfaceAndClassicParity() {
    expectExactKeys(TruthSchema, EXPECTED_SURFACE, 'truth schema surface is exact');
    assert.equal(Object.isFrozen(TruthSchema), true, 'truth API is frozen');
    assert.equal(TruthSchema.VERSION, VERSION);
    assert.equal(TruthSchema.IDENTITY_VERSION, IDENTITY_VERSION);
    assert.equal(TruthSchema.CANDIDATE_SCHEMA_VERSION, 1);
    assert.equal(TruthSchema.PROMPT_VERSION, PROMPT_VERSION);
    assert.equal(TruthSchema.ADJUDICATION_VERSION, ADJUDICATION_VERSION);
    assert.equal(TruthSchema.DEADLINE_RULE_VERSION, DEADLINE_RULE_VERSION);
    assert.equal(TruthSchema.CALENDAR_VERSION, CALENDAR_VERSION);
    assert.equal(TruthSchema.SNAPSHOT_VERSION, SNAPSHOT_VERSION);
    assert.deepEqual(plain(TruthSchema.LIMITS), EXPECTED_LIMITS);

    for (const [actual, expected] of [
      [TruthSchema.ASSERTION_TYPES, ASSERTION_TYPES],
      [TruthSchema.TRUST_STATES, TRUST_STATES],
      [TruthSchema.SOURCE_STATES, SOURCE_STATES],
      [TruthSchema.EXECUTION_STATES, EXECUTION_STATES],
      [TruthSchema.TEMPORAL_STATES, TEMPORAL_STATES],
      [TruthSchema.LINEAGE_ROLES, LINEAGE_ROLES],
      [TruthSchema.GOVERNANCE_CONCLUSIONS, GOVERNANCE_CONCLUSIONS],
      [TruthSchema.DEADLINE_OPERATORS, DEADLINE_OPERATORS],
      [TruthSchema.BLOCKER_CODES, BLOCKER_CODES]
    ]) {
      assert.deepEqual(Array.from(actual), Array.from(expected));
      assert.equal(Object.isFrozen(actual), true);
    }
    assert.deepEqual(plain(TruthSchema.AXIS_REASON_CODES), plain(AXIS_REASON_CODES));
    assert.equal(frozenTree(TruthSchema.AXIS_REASON_CODES), true);
    assert.equal(ID_PREFIXES.length, 9, 'all nine truth identity namespaces are locked');

    const sandbox = {
      CfworkerJsonSchema: globalThis.CfworkerJsonSchema,
      crypto: webcrypto,
      TextEncoder,
      Uint8Array,
      Buffer,
      Set,
      Map,
      Object,
      Array,
      JSON,
      Number,
      String,
      RegExp,
      Reflect,
      Promise,
      module: { exports: {} }
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(fs.readFileSync(SCHEMA_PATH, 'utf8'), sandbox, {
      filename: SCHEMA_PATH
    });
    assert.strictEqual(sandbox.FsbSkopeoTruthSchema, sandbox.module.exports);
    assert.deepEqual(Object.keys(sandbox.module.exports).sort(), EXPECTED_SURFACE.slice().sort());
  }

  async function testCandidateEnvelopeAndHostileDescriptors() {
    const evidence = await graphEvidence();
    const fixture = await candidateFixture(evidence);
    const parsed = await TruthSchema.parseCandidateEnvelope(fixture.envelope, fixture.context);
    assert.ok(parsed, 'closed candidate envelope parses');
    assert.equal(parsed.candidateGenerationId, fixture.generationId);
    assert.equal(frozenTree(parsed), true);
    assert.equal(nullPrototypeTree(parsed), true);
    assert.equal(parsed.executionCandidates[0].documentRecordVersionId, RECORD_A);
    assert.equal(parsed.lineageCandidates[0].targetDocumentRecordVersionId, RECORD_A);
    assert.equal(parsed.factCandidates[0].clauseRecordVersionId, CLAUSE_RECORD_A);
    assert.equal(parsed.deadlineRuleCandidates[0].evidence[0].locatorId, evidence.locatorId);

    const partialEnvelope = clone(fixture.envelope);
    Object.assign(partialEnvelope.lineageCandidates[0], {
      targetClauseHandle: 'clause:notice',
      amendmentClauseHandle: 'clause:replacement',
      lineageRole: 'partial-amendment',
      scope: 'clause'
    });
    const partial = await TruthSchema.parseCandidateEnvelope(
      partialEnvelope,
      fixture.context
    );
    assert.equal(
      partial && partial.lineageCandidates[0].amendmentClauseStableId,
      CLAUSE_B,
      'a partial overlay binds its explicitly issued amendment source clause'
    );
    for (const [name, amendmentClauseHandle] of [
      ['missing', null],
      ['wrong-document', 'clause:notice'],
      ['unissued', 'clause:forged']
    ]) {
      const hostile = clone(partialEnvelope);
      hostile.lineageCandidates[0].amendmentClauseHandle = amendmentClauseHandle;
      await rejectsNull(
        TruthSchema.parseCandidateEnvelope(hostile, fixture.context),
        `${name} amendment source clause cannot authorize a partial overlay`
      );
    }

    const businessContext = clone(fixture.context);
    businessContext.calendarHandles = [{
      handle: 'calendar:issued_1',
      calendarId: 'calendar-us-business',
      calendarVersionId: 'calendar-us-business-v1'
    }];
    const businessEnvelope = clone(fixture.envelope);
    businessEnvelope.deadlineRuleCandidates[0].operator = 'add-business-days';
    businessEnvelope.deadlineRuleCandidates[0].calendarHandle = 'calendar:issued_1';
    const business = await TruthSchema.parseCandidateEnvelope(
      businessEnvelope,
      businessContext
    );
    assert.equal(
      business && business.deadlineRuleCandidates[0].businessCalendarId,
      'calendar-us-business',
      'an issued opaque calendar handle maps to its durable calendar identity'
    );
    assert.equal(
      business && business.deadlineRuleCandidates[0].businessCalendarVersionId,
      'calendar-us-business-v1',
      'an issued opaque calendar handle maps to its immutable calendar version'
    );
    const forgedCalendar = clone(businessEnvelope);
    forgedCalendar.deadlineRuleCandidates[0].calendarHandle = 'calendar-us-business';
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(forgedCalendar, businessContext),
      'a provider-guessed durable calendar ID is not an issued calendar handle'
    );

    for (const field of [
      'sourceFileId',
      'partitionKey',
      'graphId',
      'truthId',
      'snapshotId',
      'url',
      'filename',
      'rank',
      'confidence',
      'governing',
      'eligible',
      'computedDate',
      'code',
      'callback',
      'tool',
      'expression',
      'sql',
      'jmespath',
      'crossSourceText'
    ]) {
      const hostile = clone(fixture.envelope);
      hostile.factCandidates[0][field] = field === 'governing' || field === 'eligible'
        ? true
        : 'untrusted';
      await rejectsNull(
        TruthSchema.parseCandidateEnvelope(hostile, fixture.context),
        `candidate field ${field} rejects`
      );
    }

    let getterReads = 0;
    const accessor = clone(fixture.envelope);
    Object.defineProperty(accessor.factCandidates[0], 'typedValue', {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error('must not execute');
      }
    });
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(accessor, fixture.context),
      'accessor-bearing candidate rejects'
    );
    assert.equal(getterReads, 0, 'candidate accessor is never invoked');

    const symbol = clone(fixture.envelope);
    symbol.factCandidates[0][Symbol('hidden')] = true;
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(symbol, fixture.context),
      'symbol-bearing candidate rejects'
    );
    const customPrototype = clone(fixture.envelope);
    customPrototype.factCandidates[0] = Object.assign(
      Object.create({ inherited: true }),
      customPrototype.factCandidates[0]
    );
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(customPrototype, fixture.context),
      'custom-prototype candidate rejects'
    );
    const sparse = clone(fixture.envelope);
    sparse.factCandidates = [];
    sparse.factCandidates.length = 1;
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(sparse, fixture.context),
      'sparse candidate array rejects'
    );
    const cycle = clone(fixture.envelope);
    cycle.factCandidates[0].typedValue.self = cycle.factCandidates[0].typedValue;
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(cycle, fixture.context),
      'cyclic candidate rejects'
    );
    const unknownHandle = clone(fixture.envelope);
    unknownHandle.factCandidates[0].evidenceHandles = ['evidence:forged'];
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(unknownHandle, fixture.context),
      'forged evidence handle rejects'
    );

    const factOnly = clone(fixture.envelope);
    factOnly.executionCandidates = [];
    factOnly.effectivenessCandidates = [];
    factOnly.lineageCandidates = [];
    factOnly.deadlineRuleCandidates = [];
    const unknownFactClause = clone(factOnly);
    unknownFactClause.factCandidates[0].clauseHandle = 'clause:forged';
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(unknownFactClause, fixture.context),
      'an unissued fact clause handle rejects instead of widening to document scope'
    );

    const wrongClauseOwner = clone(fixture.context);
    wrongClauseOwner.clauseHandles[0].documentHandle = 'doc:replacement';
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(factOnly, wrongClauseOwner),
      'a fact clause issued for another document rejects without changing scope'
    );
    const validFact = await TruthSchema.parseCandidateEnvelope(factOnly, fixture.context);
    assert.equal(
      validFact && validFact.factCandidates[0].clauseStableId,
      CLAUSE_A,
      'a currently issued fact clause preserves clause scope'
    );

    const maxCandidateEnvelope = clone(fixture.envelope);
    maxCandidateEnvelope.effectivenessCandidates = [];
    maxCandidateEnvelope.lineageCandidates = [];
    maxCandidateEnvelope.factCandidates = [];
    maxCandidateEnvelope.deadlineRuleCandidates = [];
    maxCandidateEnvelope.executionCandidates = Array.from(
      { length: EXPECTED_LIMITS.MAX_CANDIDATES_PER_BATCH },
      (_, index) => ({
        candidateRef: `execution:${index}`,
        documentHandle: 'doc:base',
        executionState: 'executed',
        evidenceHandles: ['evidence:primary']
      })
    );
    assert.ok(
      await TruthSchema.parseCandidateEnvelope(maxCandidateEnvelope, fixture.context),
      'exact candidate batch cap parses'
    );
    maxCandidateEnvelope.executionCandidates.push({
      candidateRef: 'execution:overflow',
      documentHandle: 'doc:base',
      executionState: 'executed',
      evidenceHandles: ['evidence:primary']
    });
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(maxCandidateEnvelope, fixture.context),
      'candidate batch max-plus-one rejects'
    );

    const evidenceLocators = [];
    for (let index = 0; index < 4; index += 1) {
      evidenceLocators.push(await graphEvidence({ start: index, end: index + 1 }));
    }
    const fourEvidence = clone(fixture.envelope);
    fourEvidence.factCandidates[0].evidenceHandles = evidenceLocators.map(
      (_, index) => `evidence:${index}`
    );
    const fourContext = clone(fixture.context);
    fourContext.evidenceHandles.push(
      ...evidenceLocators.map((locator, index) => ({
        handle: `evidence:${index}`,
        locator
      }))
    );
    assert.ok(
      await TruthSchema.parseCandidateEnvelope(fourEvidence, fourContext),
      'exact evidence-per-candidate cap parses'
    );
    fourEvidence.factCandidates[0].evidenceHandles.push('evidence:five');
    fourContext.evidenceHandles.push({
      handle: 'evidence:five',
      locator: await graphEvidence({ start: 5, end: 6 })
    });
    await rejectsNull(
      TruthSchema.parseCandidateEnvelope(fourEvidence, fourContext),
      'evidence-per-candidate max-plus-one rejects'
    );
  }

  async function testCitationAndAssertionIdentities() {
    const evidence = await graphEvidence();
    const citation = await citationFrom(evidence);
    const parsedCitation = await TruthSchema.parseCitation(citation);
    assert.ok(parsedCitation, 'citation parses after locator and identity recomputation');
    assert.equal(frozenTree(parsedCitation), true);
    assert.equal(nullPrototypeTree(parsedCitation), true);

    const identityFields = [
      ['partitionKey', `${PARTITION}:other`],
      ['sourceFileId', SOURCE_B],
      ['contentFingerprint', FINGERPRINT_B],
      ['fragmentGenerationId', hexId('sfg1:', 20)],
      ['recordVersionId', RECORD_B],
      ['relationVersionId', RELATION_A],
      ['locatorId', hexId('sel1:', 21)],
      ['sourceByteStart', citation.sourceByteStart + 1],
      ['sourceByteEnd', citation.sourceByteEnd + 1]
    ];
    for (const [field, value] of identityFields) {
      const changedIdentity = {
        schemaVersion: VERSION,
        partitionKey: citation.partitionKey,
        sourceFileId: citation.sourceFileId,
        contentFingerprint: citation.contentFingerprint,
        fragmentGenerationId: citation.fragmentGenerationId,
        recordVersionId: citation.recordVersionId,
        relationVersionId: citation.relationVersionId,
        locatorId: citation.locatorId,
        sourceByteStart: citation.sourceByteStart,
        sourceByteEnd: citation.sourceByteEnd,
        [field]: value
      };
      const changedId = await TruthSchema.deriveCitationId(changedIdentity);
      assert.notEqual(changedId, citation.citationId, `${field} changes citation identity`);
    }

    for (const [field, value] of [
      ['partitionKey', `${PARTITION}:other`],
      ['sourceFileId', SOURCE_B],
      ['contentFingerprint', FINGERPRINT_B],
      ['fragmentGenerationId', hexId('sfg1:', 22)],
      ['locatorId', hexId('sel1:', 23)],
      ['sourceByteStart', citation.sourceByteStart + 1],
      ['sourceByteEnd', citation.sourceByteEnd + 1]
    ]) {
      const stale = { ...citation, [field]: value };
      stale.citationId = await TruthSchema.deriveCitationId({
        schemaVersion: stale.schemaVersion,
        partitionKey: stale.partitionKey,
        sourceFileId: stale.sourceFileId,
        contentFingerprint: stale.contentFingerprint,
        fragmentGenerationId: stale.fragmentGenerationId,
        recordVersionId: stale.recordVersionId,
        relationVersionId: stale.relationVersionId,
        locatorId: stale.locatorId,
        sourceByteStart: stale.sourceByteStart,
        sourceByteEnd: stale.sourceByteEnd
      });
      await rejectsNull(
        TruthSchema.parseCitation(stale),
        `${field} mismatch rejects before assertion admission`
      );
    }
    await rejectsNull(
      TruthSchema.parseCitation({ ...citation, sourceByteEnd: citation.sourceByteStart }),
      'empty citation range rejects'
    );

    const family = await makeFamily();
    const values = typedValues();
    const assertions = [];
    for (const assertionType of ASSERTION_TYPES) {
      const input = await assertionFrom({
        familyId: family.familyId,
        citation,
        assertionType,
        typedValue: values[assertionType]
      });
      const parsed = await TruthSchema.parseAssertion(input, [citation]);
      assert.ok(parsed, `${assertionType} exact typed value parses`);
      assert.equal(frozenTree(parsed), true);
      assertions.push(parsed);

      for (const [otherType, otherValue] of Object.entries(values)) {
        if (otherType === assertionType ||
            otherValue.kind === values[assertionType].kind) continue;
        const crossed = { ...input, typedValue: otherValue };
        crossed.assertionVersionId = await TruthSchema.deriveAssertionVersionId({
          assertionId: crossed.assertionId,
          typedValue: crossed.typedValue,
          trustState: crossed.trustState,
          citationIds: crossed.citationIds,
          candidateSchemaVersion: crossed.candidateSchemaVersion,
          promptVersion: crossed.promptVersion,
          derivationRuleVersion: crossed.derivationRuleVersion
        });
        await rejectsNull(
          TruthSchema.parseAssertion(crossed, [citation]),
          `${assertionType} rejects ${otherType} typed value`
        );
      }
    }

    for (const malformed of [
      { kind: 'civil-date', value: '2026-2-03' },
      { kind: 'civil-date', value: '2026-02-30' },
      { kind: 'civil-date', value: '0000-01-01' }
    ]) {
      const invalid = await assertionFrom({
        familyId: family.familyId,
        citation,
        assertionType: 'signed-date',
        typedValue: malformed
      });
      await rejectsNull(
        TruthSchema.parseAssertion(invalid, [citation]),
        'malformed civil date rejects'
      );
    }
    for (const invalidRenewal of [
      {
        kind: 'renewal',
        mode: 'automatic',
        amount: 365,
        unit: null,
        anchorAssertionType: 'expiration-date'
      },
      {
        kind: 'renewal',
        mode: 'none-stated',
        amount: 1,
        unit: 'calendar-days',
        anchorAssertionType: null
      }
    ]) {
      const invalid = await assertionFrom({
        familyId: family.familyId,
        citation,
        assertionType: 'renewal',
        typedValue: invalidRenewal
      });
      await rejectsNull(
        TruthSchema.parseAssertion(invalid, [citation]),
        'renewal amount/unit and none-stated semantics are exact'
      );
    }

    const stableInput = await assertionFrom({
      familyId: family.familyId,
      citation,
      assertionType: 'signed-date'
    });
    const changedEvidence = await graphEvidence({
      contentFingerprint: FINGERPRINT_B,
      sourceByteStart: evidence.sourceByteStart
    });
    const changedCitation = await citationFrom(changedEvidence);
    const changedAssertion = await assertionFrom({
      familyId: family.familyId,
      citation: changedCitation,
      assertionType: 'signed-date',
      typedValue: { kind: 'civil-date', value: '2026-01-03' }
    });
    assert.equal(
      stableInput.assertionId,
      changedAssertion.assertionId,
      'stable assertion ID survives content-version and value changes'
    );
    assert.notEqual(
      stableInput.assertionVersionId,
      changedAssertion.assertionVersionId,
      'assertion version changes with evidence/value'
    );

    const fourCitations = [];
    for (let index = 0; index < 4; index += 1) {
      fourCitations.push(await citationFrom(await graphEvidence({
        start: index,
        end: index + 1
      })));
    }
    const fourCitationIds = fourCitations.map((item) => item.citationId).sort();
    const fourAssertion = await assertionFrom({
      familyId: family.familyId,
      citation: fourCitations[0],
      citationIds: fourCitationIds
    });
    fourAssertion.assertionVersionId = await TruthSchema.deriveAssertionVersionId({
      assertionId: fourAssertion.assertionId,
      typedValue: fourAssertion.typedValue,
      trustState: fourAssertion.trustState,
      citationIds: fourAssertion.citationIds,
      candidateSchemaVersion: fourAssertion.candidateSchemaVersion,
      promptVersion: fourAssertion.promptVersion,
      derivationRuleVersion: fourAssertion.derivationRuleVersion
    });
    assert.ok(
      await TruthSchema.parseAssertion(fourAssertion, fourCitations),
      'exact citation-per-assertion cap parses'
    );
    const fiveAssertion = clone(stableInput);
    fiveAssertion.citationIds = Array.from({ length: 5 }, (_, index) => hexId('stc1:', index));
    await rejectsNull(
      TruthSchema.parseAssertion(fiveAssertion, []),
      'citation-per-assertion max-plus-one rejects'
    );
  }

  async function testConflictLineageAndEvaluationContext() {
    const evidence = await graphEvidence();
    const citation = await citationFrom(evidence);
    const family = await makeFamily();
    const first = await assertionFrom({ familyId: family.familyId, citation });
    const second = await assertionFrom({
      familyId: family.familyId,
      citation,
      typedValue: { kind: 'civil-date', value: '2026-01-03' }
    });
    const conflict = await conflictFrom({
      familyId: family.familyId,
      assertionVersionIds: [first.assertionVersionId, second.assertionVersionId],
      citationIds: [citation.citationId]
    });
    assert.ok(
      await TruthSchema.parseConflictSet(conflict, [first, second], [citation]),
      'conflict preserves incompatible assertions and citations'
    );
    await rejectsNull(
      TruthSchema.parseConflictSet({
        ...conflict,
        assertionVersionIds: [first.assertionVersionId]
      }, [first], [citation]),
      'conflict requires at least two members'
    );

    const lineage = lineageProof({
      familyId: family.familyId,
      citationIds: [citation.citationId]
    });
    assert.ok(
      await TruthSchema.parseLineageProof(lineage, [citation]),
      'four independent lineage axes parse'
    );
    for (const [axisName, wrongReason] of [
      ['execution', 'effective-as-of-date'],
      ['temporal', 'lineage-base-evidence'],
      ['lineageRole', 'governing-path-accepted'],
      ['governance', 'executed-evidence']
    ]) {
      const crossed = clone(lineage);
      crossed[axisName].reasonCode = wrongReason;
      await rejectsNull(
        TruthSchema.parseLineageProof(crossed, [citation]),
        `${axisName} rejects a valid reason from another axis`
      );
    }

    const parsedCalendar = TruthSchema.parseBusinessCalendar(calendar());
    assert.ok(parsedCalendar, 'immutable business calendar parses');
    assert.equal(frozenTree(parsedCalendar), true);
    rejectsNullSync(
      TruthSchema.parseBusinessCalendar(calendar({ weekendDays: [6, 0] })),
      'calendar weekend definition must be canonical'
    );
    rejectsNullSync(
      TruthSchema.parseBusinessCalendar(calendar({ holidays: ['2026-07-04', '2026-01-01'] })),
      'calendar holidays must be canonical'
    );

    assert.ok(
      TruthSchema.parseEvaluationContext(configuredEvaluationContext([calendar()])),
      'configured timezone context parses'
    );
    assert.ok(
      TruthSchema.parseEvaluationContext(citedEvaluationContext([citation.citationId]), [citation]),
      'cited timezone context parses'
    );
    for (const forbidden of ['now', 'clock', 'locale', 'hostTimezone', 'defaultZone', 'utc']) {
      const hostile = configuredEvaluationContext();
      hostile[forbidden] = forbidden;
      rejectsNullSync(
        TruthSchema.parseEvaluationContext(hostile),
        `evaluation context rejects ${forbidden}`
      );
    }
    const mixed = configuredEvaluationContext();
    mixed.governingTimezoneBinding.citationIds = [citation.citationId];
    rejectsNullSync(
      TruthSchema.parseEvaluationContext(mixed, [citation]),
      'timezone variants cannot mix fields'
    );
  }

  async function testRulesResultsSemanticProofAndManifest() {
    const evidence = await graphEvidence();
    const citation = await citationFrom(evidence);
    const family = await makeFamily();
    const assertion = await assertionFrom({
      familyId: family.familyId,
      citation,
      assertionType: 'expiration-date'
    });
    const secondAssertion = await assertionFrom({
      familyId: family.familyId,
      citation,
      assertionType: 'expiration-date',
      typedValue: { kind: 'civil-date', value: '2027-02-04' }
    });
    const conflict = await conflictFrom({
      familyId: family.familyId,
      assertionVersionIds: [assertion.assertionVersionId, secondAssertion.assertionVersionId],
      citationIds: [citation.citationId],
      assertionType: 'expiration-date'
    });
    const rule = await deadlineRuleFrom({ familyId: family.familyId, assertion, citation });
    const parsedRule = await TruthSchema.parseDeadlineRule(rule, [assertion], [citation]);
    assert.ok(parsedRule, 'closed deadline rule parses');
    for (const operator of DEADLINE_OPERATORS) {
      const operatorRule = await deadlineRuleFrom({
        familyId: family.familyId,
        assertion,
        citation,
        operator,
        calendarId: operator.includes('business') ? 'calendar-us-business' : null,
        calendarVersionId: operator.includes('business') ? 'calendar-us-business-v1' : null
      });
      assert.ok(
        await TruthSchema.parseDeadlineRule(operatorRule, [assertion], [citation]),
        `${operator} parses`
      );
    }
    const overAmount = await deadlineRuleFrom({
      familyId: family.familyId,
      assertion,
      citation,
      amount: EXPECTED_LIMITS.MAX_DAY_OFFSET_MAGNITUDE + 1
    });
    await rejectsNull(
      TruthSchema.parseDeadlineRule(overAmount, [assertion], [citation]),
      'day-offset max-plus-one rejects'
    );

    const result = await deadlineResultFrom({ familyId: family.familyId, rule, assertion, citation });
    assert.ok(
      await TruthSchema.parseDeadlineResult(result, [rule], [assertion], [citation]),
      'eligible deadline result parses with exact current inputs and zero blockers'
    );
    const blockedEligible = clone(result);
    blockedEligible.blockerCodes = ['fact-conflict'];
    blockedEligible.deadlineDerivationId = await TruthSchema.deriveDeadlineDerivationId(
      Object.fromEntries(
        Object.entries(blockedEligible).filter(([key]) => key !== 'deadlineDerivationId')
      )
    );
    await rejectsNull(
      TruthSchema.parseDeadlineResult(blockedEligible, [rule], [assertion], [citation]),
      'eligible result cannot carry a blocker'
    );
    const unresolvedEligible = clone(result);
    unresolvedEligible.inputsExact = false;
    unresolvedEligible.deadlineDerivationId = await TruthSchema.deriveDeadlineDerivationId(
      Object.fromEntries(
        Object.entries(unresolvedEligible).filter(([key]) => key !== 'deadlineDerivationId')
      )
    );
    await rejectsNull(
      TruthSchema.parseDeadlineResult(unresolvedEligible, [rule], [assertion], [citation]),
      'eligible result cannot carry unresolved inputs'
    );
    const unsortedBlockers = {
      ...result,
      eligibility: 'ineligible',
      deadlineCivilDate: null,
      windowStartCivilDate: null,
      blockerCodes: ['unsupported-rule', 'fact-missing']
    };
    unsortedBlockers.deadlineDerivationId = await TruthSchema.deriveDeadlineDerivationId(
      Object.fromEntries(
        Object.entries(unsortedBlockers).filter(([key]) => key !== 'deadlineDerivationId')
      )
    );
    await rejectsNull(
      TruthSchema.parseDeadlineResult(unsortedBlockers, [rule], [assertion], [citation]),
      'blockers must be sorted'
    );

    const proofInput = await semanticFixture({
      citations: [citation],
      evaluationContext: citedEvaluationContext([citation.citationId]),
      assertions: [assertion, secondAssertion],
      conflicts: [conflict],
      deadlineRules: [rule],
      deadlineResults: [result]
    });
    const proof = await TruthSchema.parseSemanticFamilyProof(proofInput);
    assert.ok(proof, 'storage-independent semantic family proof parses');
    assert.equal(frozenTree(proof), true);
    assert.equal(nullPrototypeTree(proof), true);
    const exactSetProofInput = {
      ...proofInput,
      authorizedSetDigest: `sgx1:${'a'.repeat(64)}`
    };
    const exactSetProof = await TruthSchema.parseSemanticFamilyProof(exactSetProofInput);
    assert.ok(exactSetProof, 'graph exact-set digest is admitted by semantic proof');
    const exactSetManifestInput = await manifestFixture(exactSetProof);
    assert.ok(
      await TruthSchema.parseFamilySnapshotManifest(exactSetManifestInput),
      'graph exact-set digest remains valid in the durable manifest'
    );
    for (const forbidden of [
      'pageHashes',
      'pageCounts',
      'storageKey',
      'snapshotId',
      'filename',
      'url',
      'recency',
      'similarity',
      'confidence',
      'modelGoverning',
      'modelPrecedence'
    ]) {
      const hostile = { ...proofInput, [forbidden]: forbidden };
      await rejectsNull(
        TruthSchema.parseSemanticFamilyProof(hostile),
        `semantic proof rejects ${forbidden}`
      );
    }

    const manifestInput = await manifestFixture(proof);
    const manifest = await TruthSchema.parseFamilySnapshotManifest(manifestInput);
    assert.ok(manifest, 'store-owned durable manifest parses after page hashes exist');
    assert.equal(frozenTree(manifest), true);
    const noPages = { ...manifestInput, pages: [] };
    noPages.snapshotId = await TruthSchema.deriveSnapshotId(
      Object.fromEntries(Object.entries(noPages).filter(([key]) => key !== 'snapshotId'))
    );
    await rejectsNull(
      TruthSchema.parseFamilySnapshotManifest(noPages),
      'manifest cannot parse before deterministic pages and hashes exist'
    );
    await rejectsNull(
      TruthSchema.parseSemanticFamilyProof(manifestInput),
      'store-shaped manifest is not a semantic proof'
    );
    await rejectsNull(
      TruthSchema.parseFamilySnapshotManifest(proofInput),
      'semantic proof is not a store-shaped manifest'
    );
  }

  async function testExactCaps() {
    const evidence = await graphEvidence({
      text: 'x'.repeat(128),
      start: 0,
      end: 1
    });
    const baseCitation = await citationFrom(evidence);
    const family = await makeFamily();
    const baseAssertion = await assertionFrom({
      familyId: family.familyId,
      citation: baseCitation
    });
    const secondAssertion = await assertionFrom({
      familyId: family.familyId,
      citation: baseCitation,
      typedValue: { kind: 'civil-date', value: '2026-01-03' }
    });
    const baseConflict = await conflictFrom({
      familyId: family.familyId,
      assertionVersionIds: [baseAssertion.assertionVersionId, secondAssertion.assertionVersionId],
      citationIds: [baseCitation.citationId]
    });
    const baseRule = await deadlineRuleFrom({
      familyId: family.familyId,
      assertion: baseAssertion,
      citation: baseCitation
    });
    const baseResult = await deadlineResultFrom({
      familyId: family.familyId,
      rule: baseRule,
      assertion: baseAssertion,
      citation: baseCitation
    });

    const citations = [];
    for (let index = 0; index < EXPECTED_LIMITS.MAX_FAMILY_CITATIONS; index += 1) {
      citations.push(await citationFrom(evidence, {
        recordVersionId: hexId('srv1:', index + 1000)
      }));
    }
    const exactCitationProof = await semanticFixture({
      citations,
      evaluationContext: citedEvaluationContext(citations.map((item) => item.citationId)),
      assertions: [],
      conflicts: [],
      deadlineRules: [],
      deadlineResults: [],
      recordVersionIds: sorted([
        RECORD_A,
        RECORD_B,
        CLAUSE_RECORD_A,
        ...citations.map((item) => item.recordVersionId)
      ])
    });
    exactCitationProof.lineageProof = {
      ...exactCitationProof.lineageProof,
      execution: { ...exactCitationProof.lineageProof.execution, citationIds: [] },
      temporal: { ...exactCitationProof.lineageProof.temporal, citationIds: [] },
      lineageRole: { ...exactCitationProof.lineageProof.lineageRole, citationIds: [] },
      governance: { ...exactCitationProof.lineageProof.governance, citationIds: [] },
      overlays: [],
      inheritances: []
    };
    assert.ok(
      await TruthSchema.parseSemanticFamilyProof(exactCitationProof),
      'exact 2,048 unique family citations parse'
    );
    const overflowCitation = await citationFrom(evidence, {
      recordVersionId: hexId('srv1:', EXPECTED_LIMITS.MAX_FAMILY_CITATIONS + 1000)
    });
    const overflowCitationProof = {
      ...exactCitationProof,
      citations: [...citations, overflowCitation],
      evaluationContext: citedEvaluationContext([
        ...citations.map((item) => item.citationId),
        overflowCitation.citationId
      ])
    };
    await rejectsNull(
      TruthSchema.parseSemanticFamilyProof(overflowCitationProof),
      '2,049 unique family citations reject'
    );

    const maximumAssertions = [];
    for (let index = 0; index < EXPECTED_LIMITS.MAX_ASSERTIONS_PER_FAMILY; index += 1) {
      maximumAssertions.push(await assertionFrom({
        familyId: family.familyId,
        citation: citations[index],
        assertionType: 'signed-date'
      }));
    }
    maximumAssertions.sort(
      (left, right) => left.assertionVersionId.localeCompare(right.assertionVersionId)
    );
    const maximumAssertionProof = {
      ...exactCitationProof,
      assertions: maximumAssertions
    };
    assert.ok(
      await TruthSchema.parseSemanticFamilyProof(maximumAssertionProof),
      'exact assertion-per-family cap parses'
    );
    const overflowAssertion = await assertionFrom({
      familyId: family.familyId,
      citation: citations[0],
      assertionType: 'signed-date',
      typedValue: { kind: 'civil-date', value: '2026-01-04' }
    });
    await rejectsNull(
      TruthSchema.parseSemanticFamilyProof({
        ...maximumAssertionProof,
        assertions: [...maximumAssertions, overflowAssertion]
      }),
      'assertion-per-family max-plus-one rejects'
    );

    const maximumConflicts = [];
    for (let index = 0; index < EXPECTED_LIMITS.MAX_CONFLICTS_PER_FAMILY; index += 1) {
      maximumConflicts.push(await conflictFrom({
        familyId: family.familyId,
        assertionVersionIds: [
          baseAssertion.assertionVersionId,
          secondAssertion.assertionVersionId
        ],
        citationIds: [baseCitation.citationId],
        ordinal: index
      }));
    }
    const maximumConflictProof = await semanticFixture({
      citations: [baseCitation],
      evaluationContext: citedEvaluationContext([baseCitation.citationId]),
      assertions: [baseAssertion, secondAssertion],
      conflicts: maximumConflicts,
      deadlineRules: [],
      deadlineResults: []
    });
    assert.ok(
      await TruthSchema.parseSemanticFamilyProof(maximumConflictProof),
      'exact conflict-per-family cap parses'
    );
    const overflowConflict = await conflictFrom({
      familyId: family.familyId,
      assertionVersionIds: [
        baseAssertion.assertionVersionId,
        secondAssertion.assertionVersionId
      ],
      citationIds: [baseCitation.citationId],
      ordinal: EXPECTED_LIMITS.MAX_CONFLICTS_PER_FAMILY
    });
    await rejectsNull(
      TruthSchema.parseSemanticFamilyProof({
        ...maximumConflictProof,
        conflicts: [...maximumConflicts, overflowConflict]
      }),
      'conflict-per-family max-plus-one rejects'
    );

    const maximumRules = [];
    const maximumResults = [];
    for (let index = 0; index < EXPECTED_LIMITS.MAX_RULES_PER_FAMILY; index += 1) {
      const rule = await deadlineRuleFrom({
        familyId: family.familyId,
        assertion: baseAssertion,
        citation: baseCitation,
        amount: index + 1
      });
      maximumRules.push(rule);
      maximumResults.push(await deadlineResultFrom({
        familyId: family.familyId,
        rule,
        assertion: baseAssertion,
        citation: baseCitation
      }));
    }
    const maximumRuleProof = await semanticFixture({
      citations: [baseCitation],
      evaluationContext: citedEvaluationContext([baseCitation.citationId]),
      assertions: [baseAssertion],
      conflicts: [],
      deadlineRules: maximumRules,
      deadlineResults: maximumResults
    });
    assert.ok(
      await TruthSchema.parseSemanticFamilyProof(maximumRuleProof),
      'exact rule/result-per-family cap parses'
    );
    const overflowRule = await deadlineRuleFrom({
      familyId: family.familyId,
      assertion: baseAssertion,
      citation: baseCitation,
      amount: EXPECTED_LIMITS.MAX_RULES_PER_FAMILY + 1
    });
    const overflowResult = await deadlineResultFrom({
      familyId: family.familyId,
      rule: overflowRule,
      assertion: baseAssertion,
      citation: baseCitation
    });
    await rejectsNull(
      TruthSchema.parseSemanticFamilyProof({
        ...maximumRuleProof,
        deadlineRules: [...maximumRules, overflowRule],
        deadlineResults: [...maximumResults, overflowResult]
      }),
      'rule/result-per-family max-plus-one rejects'
    );

    const holidays = Array.from(
      { length: EXPECTED_LIMITS.MAX_HOLIDAYS_PER_CALENDAR },
      (_, index) => {
        const year = 1 + Math.floor(index / 365);
        const day = index % 365;
        const month = 1 + Math.floor(day / 31);
        const date = 1 + (day % 28);
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
      }
    ).sort();
    const uniqueHolidays = Array.from(new Set(holidays)).sort();
    while (uniqueHolidays.length < EXPECTED_LIMITS.MAX_HOLIDAYS_PER_CALENDAR) {
      const index = uniqueHolidays.length;
      const year = 100 + Math.floor(index / 336);
      const day = index % 336;
      uniqueHolidays.push(
        `${String(year).padStart(4, '0')}-${String(1 + Math.floor(day / 28)).padStart(2, '0')}-${String(1 + (day % 28)).padStart(2, '0')}`
      );
      uniqueHolidays.sort();
    }
    assert.ok(
      TruthSchema.parseBusinessCalendar(calendar({ holidays: uniqueHolidays })),
      'exact calendar holiday cap parses'
    );
    rejectsNullSync(
      TruthSchema.parseBusinessCalendar(calendar({
        holidays: [...uniqueHolidays, '9999-12-31'].sort()
      })),
      'calendar holiday max-plus-one rejects'
    );

    const sourceBindings = Array.from(
      { length: EXPECTED_LIMITS.MAX_SOURCES },
      (_, index) => ({
        sourceFileId: `source_${String(index).padStart(3, '0')}`,
        contentFingerprint: `sha256:${(index + 1).toString(16).padStart(64, '0')}`,
        fragmentGenerationId: hexId('sfg1:', index + 1),
        sourceState: 'ready',
        certified: true
      })
    );
    const recordVersionIds = Array.from(
      { length: EXPECTED_LIMITS.MAX_GRAPH_RECORD_VERSIONS },
      (_, index) => hexId('srv1:', index + 1)
    );
    const relationVersionIds = Array.from(
      { length: EXPECTED_LIMITS.MAX_RELATION_VERSIONS },
      (_, index) => hexId(index % 2 === 0 ? 'slv1:' : 'scv1:', index + 1)
    ).sort();
    const candidateGenerationIds = Array.from(
      { length: EXPECTED_LIMITS.MAX_CANDIDATES_PER_SOURCE_GENERATION },
      (_, index) => hexId('stg1:', index + 1)
    );
    const baseProof = await semanticFixture({
      citations: [baseCitation],
      evaluationContext: citedEvaluationContext([baseCitation.citationId]),
      assertions: [baseAssertion, secondAssertion],
      conflicts: [baseConflict],
      deadlineRules: [baseRule],
      deadlineResults: [baseResult],
      sourceBindings,
      recordVersionIds,
      relationVersionIds,
      candidateGenerationIds
    });
    assert.ok(
      await TruthSchema.parseSemanticFamilyProof(baseProof),
      'exact source, graph-record, relation, and candidate-generation caps parse'
    );
    for (const [field, overflow] of [
      ['sourceBindings', {
        sourceFileId: 'source_overflow',
        contentFingerprint: `sha256:${'f'.repeat(64)}`,
        fragmentGenerationId: hexId('sfg1:', 99999),
        sourceState: 'ready',
        certified: true
      }],
      ['recordVersionIds', hexId('srv1:', 99999)],
      ['relationVersionIds', hexId('slv1:', 99999)],
      ['candidateGenerationIds', hexId('stg1:', 99999)]
    ]) {
      const overflowProof = { ...baseProof, [field]: [...baseProof[field], overflow] };
      await rejectsNull(
        TruthSchema.parseSemanticFamilyProof(overflowProof),
        `${field} max-plus-one rejects`
      );
    }

    const blockerResult = {
      ...baseResult,
      eligibility: 'ineligible',
      deadlineCivilDate: null,
      windowStartCivilDate: null,
      blockerCodes: Array.from(
        { length: EXPECTED_LIMITS.MAX_BLOCKER_CODES_PER_RESULT },
        (_, index) => BLOCKER_CODES[index % BLOCKER_CODES.length]
      ).sort()
    };
    /* Duplicate blocker codes are invalid even below the count cap. */
    blockerResult.deadlineDerivationId = await TruthSchema.deriveDeadlineDerivationId(
      Object.fromEntries(
        Object.entries(blockerResult).filter(([key]) => key !== 'deadlineDerivationId')
      )
    );
    assert.ok(
      await TruthSchema.parseDeadlineResult(
        blockerResult,
        [baseRule],
        [baseAssertion],
        [baseCitation]
      ),
      'exact blocker-code result cap parses'
    );
    const blockerOverflow = {
      ...blockerResult,
      blockerCodes: [...blockerResult.blockerCodes, 'unsupported-rule'].sort()
    };
    blockerOverflow.deadlineDerivationId = await TruthSchema.deriveDeadlineDerivationId(
      Object.fromEntries(
        Object.entries(blockerOverflow).filter(([key]) => key !== 'deadlineDerivationId')
      )
    );
    await rejectsNull(
      TruthSchema.parseDeadlineResult(
        blockerOverflow,
        [baseRule],
        [baseAssertion],
        [baseCitation]
      ),
      'blocker-code result max-plus-one rejects'
    );

    const smallProof = await semanticFixture({
      citations: [baseCitation],
      evaluationContext: citedEvaluationContext([baseCitation.citationId]),
      assertions: [baseAssertion],
      conflicts: [],
      deadlineRules: [baseRule],
      deadlineResults: [baseResult]
    });
    const snapshot = await manifestFixture(smallProof);
    const exactBytes = {
      ...snapshot,
      semanticProofBytes: EXPECTED_LIMITS.MAX_FAMILY_SNAPSHOT_BYTES
    };
    exactBytes.snapshotId = await TruthSchema.deriveSnapshotId(
      Object.fromEntries(Object.entries(exactBytes).filter(([key]) => key !== 'snapshotId'))
    );
    assert.ok(
      await TruthSchema.parseFamilySnapshotManifest(exactBytes),
      'exact family snapshot byte cap parses'
    );
    const overflowBytes = {
      ...exactBytes,
      semanticProofBytes: EXPECTED_LIMITS.MAX_FAMILY_SNAPSHOT_BYTES + 1
    };
    overflowBytes.snapshotId = await TruthSchema.deriveSnapshotId(
      Object.fromEntries(Object.entries(overflowBytes).filter(([key]) => key !== 'snapshotId'))
    );
    await rejectsNull(
      TruthSchema.parseFamilySnapshotManifest(overflowBytes),
      'family snapshot byte max-plus-one rejects'
    );

    const productionSource = fs.readFileSync(SCHEMA_PATH, 'utf8');
    for (const forbidden of [
      'eval(',
      'new Function',
      'Date.parse',
      'new Date',
      'chrome.',
      'browser.storage',
      'fetch(',
      'WebSocket',
      'filenameAuthority',
      'urlAuthority',
      'renderHud',
      'chrome.alarms',
      'chrome.notifications',
      'recipientLedger',
      'alertLedger'
    ]) {
      assert.equal(
        productionSource.includes(forbidden),
        false,
        `production truth schema excludes ${forbidden}`
      );
    }
  }

  async function main() {
    await testSurfaceAndClassicParity();
    await testCandidateEnvelopeAndHostileDescriptors();
    await testCitationAndAssertionIdentities();
    await testConflictLineageAndEvaluationContext();
    await testRulesResultsSemanticProofAndManifest();
    await testExactCaps();
    console.log('skopeo truth schema contract: PASS');
  }

  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
