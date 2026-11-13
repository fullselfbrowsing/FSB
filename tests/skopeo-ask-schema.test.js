'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-ask-schema.js');
const RED_MARKER = 'skopeo ask schema contract: RED';

if (process.env.SKOPEO_ASK_EXPECT_SCHEMA_RED === '1') {
  assert.equal(fs.existsSync(SCHEMA_PATH), false,
    'controlled RED is valid only while the ask schema is absent');
  console.log(RED_MARKER);
} else {
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error('FsbSkopeoAskSchema production interface is absent');
  }

  const schema = require(SCHEMA_PATH);
  const EXPECTED_VERSION = 'skopeo-ask/1';
  const EXPECTED_ENUMS = Object.freeze({
    ANSWER_OUTCOMES: Object.freeze(['answered', 'review-required', 'abstained']),
    CLEARANCE_STATES: Object.freeze(['blocked', 'cleared', 'not-applicable']),
    EVIDENCE_ROLES: Object.freeze(['governing', 'history']),
    TRUST_STATES: Object.freeze(['accepted', 'extracted', 'ambiguous', 'review-required']),
    CONFLICT_TYPES: Object.freeze(['governing-conflict', 'source-conflict']),
    GAP_TYPES: Object.freeze([
      'incomplete-evidence',
      'source-inaccessible',
      'source-unreadable',
      'index-incomplete',
      'governing-review-required',
      'document-10-missing',
      'document-10-inaccessible',
      'memo-missing',
      'memo-inaccessible'
    ]),
    POLICY_REASON_CODES: Object.freeze([
      'document-10-unreviewed',
      'document-10-missing',
      'document-10-inaccessible',
      'document-10-stale',
      'governing-conflict',
      'memo-missing',
      'memo-inaccessible',
      'memo-incomplete'
    ]),
    DOCUMENT_STATES: Object.freeze(['current', 'missing', 'inaccessible', 'stale']),
    MEMO_STATES: Object.freeze(['on-file', 'proven-missing', 'inaccessible', 'incomplete']),
    CLASSIFICATIONS: Object.freeze(['routine', 'complex'])
  });
  const EXPECTED_LIMITS = Object.freeze({
    MAX_QUESTION_SCALARS: 2000,
    MAX_CONCLUSION_SCALARS: 1200,
    MAX_EXPLANATION_SCALARS: 512,
    MAX_CLAIM_SCALARS: 512,
    MAX_VALUE_SCALARS: 512,
    MAX_CITATION_LABEL_SCALARS: 256,
    MAX_ACTION_TOKEN_SCALARS: 192,
    MAX_HANDLE_SCALARS: 128,
    MAX_GOVERNING: 8,
    MAX_HISTORY: 6,
    MAX_CONFLICTS: 8,
    MAX_GAPS: 8,
    MAX_SOURCES: 12,
    MAX_HANDLES_PER_CLAIM: 8,
    MAX_CLAIMS: 16,
    MAX_SERIALIZED_BYTES: 64 * 1024
  });
  const EXPECTED_SURFACE = Object.freeze([
    ...Object.keys(EXPECTED_ENUMS),
    'LIMITS',
    'VERSION',
    'parseQuestion',
    'parseProviderCandidate',
    'parsePolicyInput',
    'parsePolicyResult',
    'parseCitedAnswer'
  ].sort());

  function clone(value) {
    return structuredClone(value);
  }

  function plain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nullPrototypeClone(value) {
    if (Array.isArray(value)) return value.map(nullPrototypeClone);
    if (!value || typeof value !== 'object') return value;
    const output = Object.create(null);
    for (const key of Object.keys(value)) output[key] = nullPrototypeClone(value[key]);
    return output;
  }

  function assertDeepFrozen(value, label) {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true, label + ' is frozen');
    if (!Array.isArray(value)) {
      assert.equal(Object.getPrototypeOf(value), null, label + ' has a null prototype');
    }
    for (const key of Object.keys(value)) assertDeepFrozen(value[key], label + '.' + key);
  }

  function assertParses(parser, value, label, ...args) {
    const before = plain(value);
    const parsed = parser(value, ...args);
    assert.ok(parsed, label + ' parses');
    if (value && typeof value === 'object') {
      assert.notStrictEqual(parsed, value, label + ' returns a fresh record');
      assert.deepEqual(plain(value), before, label + ' leaves caller data unchanged');
      assert.equal(Object.isFrozen(value), false, label + ' does not freeze caller data');
    }
    assertDeepFrozen(parsed, label);
    return parsed;
  }

  function assertRejects(parser, value, label, ...args) {
    assert.equal(parser(value, ...args), null, label + ' fails closed');
  }

  function candidate(changes = {}) {
    return Object.assign({
      conclusion: 'The notice period is 90 days.',
      claims: [{
        text: 'The agreement requires 90 days notice.',
        evidenceHandles: ['evidence:governing:1']
      }],
      conflicts: [],
      gaps: []
    }, changes);
  }

  function evidence(role, offset) {
    return {
      claim: role === 'governing' ? 'Notice period' : 'Prior notice practice',
      value: role === 'governing' ? '90 days' : '60 days in 2024',
      trustState: role === 'governing' ? 'accepted' : 'extracted',
      citation: {
        label: role === 'governing' ? 'Section 12, page 9' : '2024 notice, page 2',
        actionToken: 'citation:' + role + ':' + offset
      }
    };
  }

  function answer(changes = {}) {
    const governing = evidence('governing', 1);
    const history = evidence('history', 1);
    return Object.assign({
      outcome: 'answered',
      evidenceComplete: true,
      conclusion: 'The current agreement requires 90 days notice.',
      trust: {
        state: 'accepted',
        explanation: 'The complete current governing set supports this conclusion.'
      },
      governingEvidence: [governing],
      historyEvidence: [history],
      conflicts: [],
      gaps: [],
      sources: [
        {
          label: governing.citation.label,
          evidenceRole: 'governing',
          actionToken: governing.citation.actionToken
        },
        {
          label: history.citation.label,
          evidenceRole: 'history',
          actionToken: history.citation.actionToken
        }
      ],
      sourceOverflow: 0
    }, changes);
  }

  function policyInput(changes = {}) {
    return Object.assign({
      decisionKind: 'cited-contract-decision',
      authority: {
        accountKey: 'account:current',
        corpusKey: 'corpus:current',
        agreementKey: 'agreement:stable:1',
        sourceSetDigest: 'sha256:sources-current',
        revisionDigest: 'sha256:revisions-current'
      },
      document10: {
        configuredFileKey: 'drive:file:document-10',
        currentRevisionKey: 'drive:revision:10',
        state: 'current'
      },
      classification: 'routine',
      memoProof: null,
      governingConflict: false
    }, changes);
  }

  function policyResult(changes = {}) {
    return Object.assign({
      clearance: 'cleared',
      applicable: true,
      decisionDigest: 'sha256:decision-current',
      reasons: [],
      document10: { state: 'current', reviewed: true }
    }, changes);
  }

  function testClosedSurfaceAndClassicGlobal() {
    assert.strictEqual(globalThis.FsbSkopeoAskSchema, schema,
      'classic global and CommonJS export share one object');
    assert.equal(Object.isFrozen(schema), true, 'schema surface is frozen');
    assert.equal(schema.VERSION, EXPECTED_VERSION, 'version is exact');
    assert.deepEqual(Object.keys(schema).sort(), EXPECTED_SURFACE, 'surface is exact');
    for (const [name, values] of Object.entries(EXPECTED_ENUMS)) {
      assert.deepEqual(schema[name], values, name + ' vocabulary is exact');
      assert.equal(Object.isFrozen(schema[name]), true, name + ' is frozen');
    }
    assert.deepEqual(schema.LIMITS, EXPECTED_LIMITS, 'limits are exact');
    assert.equal(Object.isFrozen(schema.LIMITS), true, 'limits are frozen');

    const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const sandbox = { module: { exports: {} }, TextEncoder };
    sandbox.globalThis = sandbox;
    vm.runInContext(source, vm.createContext(sandbox), { filename: SCHEMA_PATH });
    assert.strictEqual(sandbox.FsbSkopeoAskSchema, sandbox.module.exports,
      'VM classic global and CommonJS export share one object');
    assert.deepEqual(Object.keys(sandbox.module.exports).sort(), EXPECTED_SURFACE,
      'VM surface is exact');
  }

  function testQuestionSafetyAndScalarCaps() {
    assertParses(schema.parseQuestion, { text: '  What is the notice period?  ' },
      'trimmed question');
    const emojiMax = { text: '😀'.repeat(schema.LIMITS.MAX_QUESTION_SCALARS) };
    assertParses(schema.parseQuestion, emojiMax, 'exact Unicode scalar maximum');
    assertRejects(schema.parseQuestion,
      { text: '😀'.repeat(schema.LIMITS.MAX_QUESTION_SCALARS + 1) },
      'Unicode scalar maximum plus one');
    for (const text of ['', '   ', 'unsafe\u0000question', 'unsafe\u202equestion', 'unsafe\u2066question']) {
      assertRejects(schema.parseQuestion, { text }, 'unsafe question ' + JSON.stringify(text));
    }
    assertRejects(schema.parseQuestion, { text: 'Safe?', scope: 'all-vendors' },
      'question cannot carry scope authority');
  }

  function testProviderCandidateIsInert() {
    const handles = ['evidence:governing:1', 'evidence:history:1'];
    assertParses(schema.parseProviderCandidate, candidate(), 'ordinary provider candidate', handles);
    assertParses(schema.parseProviderCandidate, nullPrototypeClone(candidate()),
      'null-prototype provider candidate', handles);
    assertRejects(schema.parseProviderCandidate,
      candidate({ claims: [{ text: 'Fake claim', evidenceHandles: ['evidence:fake'] }] }),
      'unissued evidence handle', handles);
    assertRejects(schema.parseProviderCandidate,
      candidate({ claims: [{ text: 'Duplicate', evidenceHandles: [handles[0], handles[0]] }] }),
      'duplicate evidence handle', handles);
    for (const forbidden of [
      'outcome', 'confidence', 'score', 'trustState', 'evidenceRole', 'citationId',
      'url', 'sourceFileId', 'policy', 'complex', 'reviewed', 'acknowledged',
      'clearance', 'tools', 'instructions'
    ]) {
      const hostile = candidate();
      hostile[forbidden] = forbidden === 'confidence' || forbidden === 'score' ? 0.99 : 'forged';
      assertRejects(schema.parseProviderCandidate, hostile,
        'provider candidate rejects authority field ' + forbidden, handles);
    }
    assertRejects(schema.parseProviderCandidate,
      candidate({ claims: [] }), 'material conclusion without cited claims', handles);
  }

  function testFinalAnswerEvidenceInvariants() {
    assertParses(schema.parseCitedAnswer, answer(), 'ordinary cited answer');
    const review = answer({
      outcome: 'review-required',
      conflicts: [{ type: 'governing-conflict', detail: 'Two current amendments conflict.' }],
      trust: { state: 'review-required', explanation: 'Current governing evidence conflicts.' }
    });
    assertParses(schema.parseCitedAnswer, review, 'review-required cited answer');
    const abstained = answer({
      outcome: 'abstained',
      evidenceComplete: false,
      conclusion: null,
      trust: { state: 'ambiguous', explanation: 'The relevant current set is incomplete.' },
      gaps: [{ type: 'incomplete-evidence', detail: 'One current amendment is inaccessible.' }]
    });
    assertParses(schema.parseCitedAnswer, abstained, 'incomplete evidence abstains');

    assertRejects(schema.parseCitedAnswer,
      answer({ evidenceComplete: false }), 'incomplete evidence cannot retain conclusion');
    assertRejects(schema.parseCitedAnswer,
      answer({ outcome: 'abstained' }), 'abstained cannot retain conclusion');
    assertRejects(schema.parseCitedAnswer,
      answer({ governingEvidence: [] }), 'material conclusion requires governing evidence');
    assertRejects(schema.parseCitedAnswer,
      answer({ sources: answer().sources.slice(1) }), 'missing governing source binding');
    const wrongRole = answer();
    wrongRole.sources[0].evidenceRole = 'history';
    assertRejects(schema.parseCitedAnswer, wrongRole, 'history cannot support governing conclusion');
    const numeric = answer();
    numeric.trust.confidence = 0.95;
    assertRejects(schema.parseCitedAnswer, numeric, 'numeric confidence is forbidden');
  }

  function testCapsAndSerializedBytes() {
    const max = answer({
      governingEvidence: Array.from({ length: schema.LIMITS.MAX_GOVERNING }, (_, index) =>
        evidence('governing', index)),
      historyEvidence: Array.from({ length: schema.LIMITS.MAX_HISTORY }, (_, index) =>
        evidence('history', index)),
      conflicts: Array.from({ length: schema.LIMITS.MAX_CONFLICTS }, (_, index) => ({
        type: index % 2 ? 'source-conflict' : 'governing-conflict',
        detail: 'Conflict ' + index
      })),
      gaps: Array.from({ length: schema.LIMITS.MAX_GAPS }, (_, index) => ({
        type: schema.GAP_TYPES[index],
        detail: 'Gap ' + index
      }))
    });
    max.sources = max.governingEvidence.map((row) => ({
      label: row.citation.label,
      evidenceRole: 'governing',
      actionToken: row.citation.actionToken
    })).concat(max.historyEvidence.slice(0, 4).map((row) => ({
      label: row.citation.label,
      evidenceRole: 'history',
      actionToken: row.citation.actionToken
    })));
    max.sourceOverflow = 2;
    assertParses(schema.parseCitedAnswer, max, 'all exact answer caps');

    for (const [field, makeItem] of [
      ['governingEvidence', () => evidence('governing', 99)],
      ['historyEvidence', () => evidence('history', 99)],
      ['conflicts', () => ({ type: 'source-conflict', detail: 'Overflow' })],
      ['gaps', () => ({ type: 'incomplete-evidence', detail: 'Overflow' })]
    ]) {
      const plusOne = clone(max);
      plusOne[field].push(makeItem());
      assertRejects(schema.parseCitedAnswer, plusOne, field + ' maximum plus one');
    }
    const sourcePlusOne = clone(max);
    sourcePlusOne.sources.push({
      label: 'Overflow source', evidenceRole: 'history', actionToken: 'citation:overflow'
    });
    assertRejects(schema.parseCitedAnswer, sourcePlusOne, 'source maximum plus one');

    const byteBoundary = answer({
      conclusion: 'c',
      trust: { state: 'accepted', explanation: 't' },
      governingEvidence: Array.from({ length: schema.LIMITS.MAX_GOVERNING }, (_, index) => ({
        claim: 'g', value: 'v', trustState: 'accepted',
        citation: { label: 'l', actionToken: 'citation:byte:g:' + index }
      })),
      historyEvidence: Array.from({ length: schema.LIMITS.MAX_HISTORY }, (_, index) => ({
        claim: 'h', value: 'v', trustState: 'extracted',
        citation: { label: 'l', actionToken: 'citation:byte:h:' + index }
      })),
      conflicts: Array.from({ length: schema.LIMITS.MAX_CONFLICTS }, (_, index) => ({
        type: index % 2 ? 'source-conflict' : 'governing-conflict', detail: 'c' + index
      })),
      gaps: Array.from({ length: schema.LIMITS.MAX_GAPS }, (_, index) => ({
        type: schema.GAP_TYPES[index], detail: 'g' + index
      }))
    });
    byteBoundary.sources = byteBoundary.governingEvidence.map((row) => ({
      label: 'l', evidenceRole: 'governing', actionToken: row.citation.actionToken
    })).concat(byteBoundary.historyEvidence.slice(0, 4).map((row) => ({
      label: 'l', evidenceRole: 'history', actionToken: row.citation.actionToken
    })));
    byteBoundary.sourceOverflow = 2;

    const slots = [
      [byteBoundary, 'conclusion', schema.LIMITS.MAX_CONCLUSION_SCALARS],
      [byteBoundary.trust, 'explanation', schema.LIMITS.MAX_EXPLANATION_SCALARS]
    ];
    for (const row of byteBoundary.governingEvidence.concat(byteBoundary.historyEvidence)) {
      slots.push([row, 'claim', schema.LIMITS.MAX_CLAIM_SCALARS]);
      slots.push([row, 'value', schema.LIMITS.MAX_VALUE_SCALARS]);
      slots.push([row.citation, 'label', schema.LIMITS.MAX_CITATION_LABEL_SCALARS]);
    }
    for (const row of byteBoundary.conflicts.concat(byteBoundary.gaps)) {
      slots.push([row, 'detail', schema.LIMITS.MAX_EXPLANATION_SCALARS]);
    }
    for (const row of byteBoundary.sources) {
      slots.push([row, 'label', schema.LIMITS.MAX_CITATION_LABEL_SCALARS]);
    }
    for (const [record, key, scalarCap] of slots) {
      const currentBytes = Buffer.byteLength(JSON.stringify(byteBoundary), 'utf8');
      const remainingBytes = schema.LIMITS.MAX_SERIALIZED_BYTES - currentBytes;
      if (remainingBytes <= 0) break;
      const scalarRoom = scalarCap - Array.from(record[key]).length;
      const multibyteCount = Math.min(scalarRoom, Math.floor(remainingBytes / 3));
      record[key] += '界'.repeat(multibyteCount);
      const afterMultibyte = Buffer.byteLength(JSON.stringify(byteBoundary), 'utf8');
      const asciiRoom = scalarCap - Array.from(record[key]).length;
      const asciiCount = Math.min(asciiRoom,
        schema.LIMITS.MAX_SERIALIZED_BYTES - afterMultibyte);
      record[key] += 'x'.repeat(asciiCount);
    }
    assert.equal(Buffer.byteLength(JSON.stringify(byteBoundary), 'utf8'),
      schema.LIMITS.MAX_SERIALIZED_BYTES, 'serialized fixture reaches the exact byte maximum');
    assertParses(schema.parseCitedAnswer, byteBoundary, 'exact serialized byte maximum');
    const bytePlusOne = clone(byteBoundary);
    bytePlusOne.sources[0].label += 'x';
    assert.equal(Buffer.byteLength(JSON.stringify(bytePlusOne), 'utf8'),
      schema.LIMITS.MAX_SERIALIZED_BYTES + 1, 'serialized fixture reaches max plus one');
    assertRejects(schema.parseCitedAnswer, bytePlusOne, 'serialized byte maximum plus one');
  }

  function testPolicyShapesAndRoutineOmission() {
    assertParses(schema.parsePolicyInput, policyInput(), 'routine policy input');
    assertParses(schema.parsePolicyInput, policyInput({
      classification: 'complex',
      memoProof: { state: 'on-file', complete: true }
    }), 'complex memo-on-file input');
    assertRejects(schema.parsePolicyInput, policyInput({
      classification: 'routine', memoProof: { state: 'on-file', complete: true }
    }), 'routine agreement omits memo proof');
    assertRejects(schema.parsePolicyInput, policyInput({
      classification: 'complex', memoProof: { state: 'proven-missing', complete: false }
    }), 'memo missing requires complete proof');

    assertParses(schema.parsePolicyResult, policyResult(), 'cleared routine policy result');
    assert.equal(Object.prototype.hasOwnProperty.call(
      schema.parsePolicyResult(policyResult()), 'memo'), false,
    'routine result structurally omits memo');
    assertParses(schema.parsePolicyResult, policyResult({
      clearance: 'blocked',
      reasons: ['memo-missing'],
      memo: { state: 'proven-missing', satisfied: false }
    }), 'blocked complex memo result');
    assertRejects(schema.parsePolicyResult, policyResult({
      clearance: 'cleared', reasons: ['memo-missing']
    }), 'cleared result cannot carry a blocker');
    assertRejects(schema.parsePolicyResult, policyResult({
      clearance: 'blocked', reasons: []
    }), 'blocked result requires a typed reason');
  }

  function testHostileShapesWithoutAccessorExecution() {
    let reads = 0;
    const parsers = [
      [schema.parseQuestion, { text: 'Question?' }, []],
      [schema.parseProviderCandidate, candidate(), [['evidence:governing:1']]],
      [schema.parsePolicyInput, policyInput(), []],
      [schema.parsePolicyResult, policyResult(), []],
      [schema.parseCitedAnswer, answer(), []]
    ];
    for (const [parser, fixture, args] of parsers) {
      const accessor = clone(fixture);
      const key = Object.keys(accessor)[0];
      Object.defineProperty(accessor, key, {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error('getter must not execute');
        }
      });
      assertRejects(parser, accessor, 'accessor-bearing ' + key, ...args);
      const symbol = clone(fixture);
      symbol[Symbol('hidden')] = true;
      assertRejects(parser, symbol, 'symbol-bearing record', ...args);
      const custom = Object.assign(Object.create({ inherited: true }), fixture);
      assertRejects(parser, custom, 'custom-prototype record', ...args);
    }
    assert.equal(reads, 0, 'no hostile getter executes');

    const sparse = candidate();
    sparse.claims = [];
    sparse.claims.length = 1;
    assertRejects(schema.parseProviderCandidate, sparse, 'sparse candidate claims',
      ['evidence:governing:1']);
    const cyclic = answer();
    cyclic.governingEvidence[0].citation = cyclic;
    assertRejects(schema.parseCitedAnswer, cyclic, 'cyclic answer');
  }

  testClosedSurfaceAndClassicGlobal();
  testQuestionSafetyAndScalarCaps();
  testProviderCandidateIsInert();
  testFinalAnswerEvidenceInvariants();
  testCapsAndSerializedBytes();
  testPolicyShapesAndRoutineOmission();
  testHostileShapesWithoutAccessorExecution();
  console.log('skopeo ask schema contract: PASS');
}
