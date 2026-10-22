'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { webcrypto } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-deadline-engine.js');
const TRUTH_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-truth-schema.js');
const GRAPH_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-graph-schema.js');
const MATRIX_MODE = process.env.SKOPEO_DEADLINE_MATRIX === '1';
const MISSING_MARKER = ['skopeo', 'deadline', 'engine', 'contract'].join(' ');

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto
  });
}
const TruthSchema = require(TRUTH_PATH);
const GraphSchema = require(GRAPH_PATH);
globalThis.FsbSkopeoTruthSchema = TruthSchema;

const VERSION = 'skopeo-deadline-engine/1';
const TRUTH_VERSION = 'skopeo-truth-schema/1';
const IDENTITY_VERSION = 'skopeo-truth-identity/1';
const RULE_VERSION = 'skopeo-deadline-rules/1';
const CALENDAR_VERSION = 'skopeo-business-calendar/1';
const PROMPT_VERSION = 'skopeo-truth-extraction-prompt/1';
const EXPECTED_SURFACE = Object.freeze([
  'VERSION',
  'parseCivilDate',
  'toOrdinal',
  'fromOrdinal',
  'evaluateRule'
]);
const OPERATORS = Object.freeze([
  'add-calendar-days',
  'subtract-calendar-days',
  'add-business-days',
  'subtract-business-days'
]);

const PARTITION = 'scpk1:7:account6:corpus';
const SOURCE = 'source_deadline';
const FINGERPRINT = `sha256:${'d'.repeat(64)}`;
const DOCUMENT_ID = `sri1:${'1'.padStart(64, '0')}`;
const CLAUSE_ID = `sri1:${'2'.padStart(64, '0')}`;
const RECORD_ID = `srv1:${'3'.padStart(64, '0')}`;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function sorted(values) {
  return values.slice().sort();
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

async function graphEvidence() {
  const text = 'expiration notice consequence';
  const fragmentGenerationId = await GraphSchema.deriveFragmentGenerationId({
    schemaVersion: GraphSchema.VERSION,
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT
  });
  const locator = await GraphSchema.parseEvidenceLocator({
    excerptId: 'deadline_excerpt',
    start: 0,
    end: 10
  }, {
    partitionKey: PARTITION,
    sourceFileId: SOURCE,
    contentFingerprint: FINGERPRINT,
    fragmentGenerationId,
    excerpts: [{
      excerptId: 'deadline_excerpt',
      text,
      sourceByteStart: 20,
      sourceByteEnd: 20 + Buffer.byteLength(text, 'utf8')
    }]
  });
  assert.ok(locator, 'deadline evidence fixture parses through the graph schema');
  return locator;
}

async function citationFrom(locator) {
  const identity = {
    schemaVersion: TRUTH_VERSION,
    partitionKey: PARTITION,
    sourceFileId: locator.sourceFileId,
    contentFingerprint: locator.contentFingerprint,
    fragmentGenerationId: locator.fragmentGenerationId,
    recordVersionId: RECORD_ID,
    relationVersionId: null,
    locatorId: locator.locatorId,
    sourceByteStart: locator.sourceByteStart,
    sourceByteEnd: locator.sourceByteEnd
  };
  const citation = {
    ...identity,
    excerptId: locator.excerptId,
    start: locator.start,
    end: locator.end,
    citationId: await TruthSchema.deriveCitationId(identity)
  };
  const parsed = await TruthSchema.parseCitation(citation);
  assert.ok(parsed, 'deadline citation fixture parses through the truth schema');
  return parsed;
}

async function familyId() {
  return TruthSchema.deriveFamilyId({
    identityVersion: IDENTITY_VERSION,
    partitionKey: PARTITION,
    documentStableIds: [DOCUMENT_ID],
    lineageRelationIds: []
  });
}

async function assertionFrom(citation, civilDate, trustState = 'extracted') {
  const family = await familyId();
  const primarySourceLocator = {
    sourceFileId: citation.sourceFileId,
    sourceByteStart: citation.sourceByteStart,
    sourceByteEnd: citation.sourceByteEnd
  };
  const assertionId = await TruthSchema.deriveAssertionId({
    identityVersion: IDENTITY_VERSION,
    partitionKey: PARTITION,
    familyId: family,
    subjectDocumentStableId: DOCUMENT_ID,
    subjectClauseStableId: CLAUSE_ID,
    assertionType: 'expiration-date',
    primarySourceLocator
  });
  const typedValue = { kind: 'civil-date', value: civilDate };
  const versionInput = {
    assertionId,
    typedValue,
    trustState,
    citationIds: [citation.citationId],
    candidateSchemaVersion: 1,
    promptVersion: PROMPT_VERSION,
    derivationRuleVersion: null
  };
  const assertion = {
    schemaVersion: TRUTH_VERSION,
    partitionKey: PARTITION,
    familyId: family,
    subjectDocumentStableId: DOCUMENT_ID,
    subjectClauseStableId: CLAUSE_ID,
    assertionType: 'expiration-date',
    typedValue,
    trustState,
    citationIds: versionInput.citationIds,
    primarySourceLocator,
    candidateSchemaVersion: 1,
    promptVersion: PROMPT_VERSION,
    derivationRuleVersion: null,
    assertionId,
    assertionVersionId: await TruthSchema.deriveAssertionVersionId(versionInput)
  };
  const parsed = await TruthSchema.parseAssertion(assertion, [citation]);
  assert.ok(parsed, 'deadline anchor fixture parses through the truth schema');
  return parsed;
}

function calendar({
  calendarId = 'calendar-us-business',
  calendarVersionId = 'calendar-us-business-v1',
  weekendDays = [0, 6],
  holidays = ['2026-07-03']
} = {}) {
  return {
    schemaVersion: CALENDAR_VERSION,
    calendarId,
    calendarVersionId,
    weekendDays,
    holidays
  };
}

function evaluationContext(calendars = [], timezone = 'America/Chicago') {
  return {
    asOfCivilDate: '2026-01-01',
    governingTimezoneBinding: {
      kind: 'configured',
      timezone,
      configurationId: 'tenant-contract-timezone',
      configurationVersion: 'v1'
    },
    calendars
  };
}

async function ruleFrom({
  assertion,
  citation,
  operator = 'add-calendar-days',
  amount = 1,
  boundary = 'exclusive',
  timezone = 'America/Chicago',
  businessCalendarId = null,
  businessCalendarVersionId = null,
  consequence = true
}) {
  const input = {
    schemaVersion: RULE_VERSION,
    partitionKey: PARTITION,
    familyId: assertion.familyId,
    operator,
    anchorAssertionVersionId: assertion.assertionVersionId,
    amount,
    boundary,
    timezone,
    businessCalendarId,
    businessCalendarVersionId,
    consequence: consequence ? {
      assertionVersionId: assertion.assertionVersionId,
      citationIds: [citation.citationId]
    } : null,
    citedInputAssertionVersionIds: [assertion.assertionVersionId],
    citationIds: [citation.citationId]
  };
  const rule = {
    ...input,
    deadlineRuleId: await TruthSchema.deriveDeadlineRuleId(input)
  };
  return {
    raw: rule,
    parsed: await TruthSchema.parseDeadlineRule(rule, [assertion], [citation])
  };
}

async function fixture({
  anchorDate = '2026-07-02',
  operator = 'add-calendar-days',
  amount = 1,
  boundary = 'exclusive',
  timezone = 'America/Chicago',
  businessCalendarId = null,
  businessCalendarVersionId = null,
  consequence = true,
  trustState = 'extracted',
  calendars = []
} = {}) {
  const locator = await graphEvidence();
  const citation = await citationFrom(locator);
  const assertion = await assertionFrom(citation, anchorDate, trustState);
  const rule = await ruleFrom({
    assertion,
    citation,
    operator,
    amount,
    boundary,
    timezone,
    businessCalendarId,
    businessCalendarVersionId,
    consequence
  });
  const context = TruthSchema.parseEvaluationContext(
    evaluationContext(calendars),
    [citation]
  );
  assert.ok(context, 'deadline evaluation context fixture parses');
  return { citation, assertion, rule, context };
}

function assertIneligible(result, blockers, message) {
  assert.ok(result, `${message}: result exists`);
  assert.equal(result.eligibility, 'ineligible', `${message}: result is ineligible`);
  assert.equal(result.deadlineCivilDate, null, `${message}: no deadline is derived`);
  assert.equal(result.windowStartCivilDate, null, `${message}: no window is derived`);
  assert.deepEqual(Array.from(result.blockerCodes), sorted(blockers), `${message}: blockers`);
  assert.equal(frozenTree(result), true, `${message}: result is frozen`);
}

function assertNoEligible(result, message) {
  assert.ok(
    result === null ||
      (result.eligibility === 'ineligible' && result.deadlineCivilDate === null),
    message
  );
}

async function testSurfaceAndCivilDates(DeadlineEngine) {
  exactKeys(DeadlineEngine, EXPECTED_SURFACE, 'deadline engine surface is exact');
  assert.equal(DeadlineEngine.VERSION, VERSION);
  assert.equal(Object.isFrozen(DeadlineEngine), true);

  const validDates = [
    ['0001-01-01', 0],
    ['0001-01-02', 1],
    ['1900-02-28', 693653],
    ['1900-03-01', 693654],
    ['2000-02-29', 730178],
    ['2000-03-01', 730179],
    ['2100-02-28', 766702],
    ['2100-03-01', 766703],
    ['1970-01-01', 719162],
    ['9999-12-31', 3652058]
  ];
  for (const [value, ordinal] of validDates) {
    const parsed = DeadlineEngine.parseCivilDate(value);
    assert.ok(parsed, `${value} parses`);
    exactKeys(parsed, ['year', 'month', 'day', 'value'], `${value} parsed keys`);
    assert.equal(parsed.value, value);
    assert.equal(frozenTree(parsed), true);
    assert.equal(nullPrototypeTree(parsed), true);
    assert.equal(DeadlineEngine.toOrdinal(parsed), ordinal, `${value} ordinal`);
    assert.deepEqual(plain(DeadlineEngine.fromOrdinal(ordinal)), plain(parsed));
  }

  for (const value of [
    '',
    '0000-01-01',
    '10000-01-01',
    '1900-02-29',
    '2000-02-30',
    '2100-02-29',
    '2026-00-01',
    '2026-01-00',
    '2026-04-31',
    '2026-2-03',
    '26-02-03',
    '2026/02/03',
    '2026-02-03T00:00:00Z',
    ' 2026-02-03',
    '2026-02-03 '
  ]) {
    assert.equal(DeadlineEngine.parseCivilDate(value), null, `${value || '<empty>'} rejects`);
    assert.equal(DeadlineEngine.toOrdinal(value), null, `${value || '<empty>'} has no ordinal`);
  }
  for (const ordinal of [-1, 3652059, 1.5, NaN, Infinity, '1', null]) {
    assert.equal(DeadlineEngine.fromOrdinal(ordinal), null, `${String(ordinal)} rejects`);
  }
}

async function testCalendarOperators(DeadlineEngine) {
  const cases = [
    {
      operator: 'add-calendar-days',
      anchorDate: '2000-02-28',
      amount: 1,
      expected: '2000-02-29'
    },
    {
      operator: 'subtract-calendar-days',
      anchorDate: '2000-03-01',
      amount: 1,
      expected: '2000-02-29'
    },
    {
      operator: 'add-calendar-days',
      anchorDate: '2025-12-31',
      amount: 1,
      expected: '2026-01-01'
    },
    {
      operator: 'subtract-calendar-days',
      anchorDate: '2026-01-01',
      amount: 1,
      expected: '2025-12-31'
    },
    {
      operator: 'add-calendar-days',
      anchorDate: '5000-01-01',
      amount: TruthSchema.LIMITS.MAX_DAY_OFFSET_MAGNITUDE,
      expected: '5100-03-18'
    }
  ];

  for (const item of cases) {
    const built = await fixture(item);
    assert.ok(built.rule.parsed, `${item.operator} rule parses`);
    const result = await DeadlineEngine.evaluateRule(
      built.rule.parsed,
      [built.assertion],
      [built.citation],
      built.context
    );
    assert.ok(result, `${item.operator} produces a result`);
    assert.equal(result.eligibility, 'eligible');
    assert.equal(result.anchorCivilDate, item.anchorDate);
    assert.equal(result.windowStartCivilDate, item.expected);
    assert.equal(result.deadlineCivilDate, item.expected);
    assert.equal(result.boundary, item.boundary || 'exclusive');
    assert.equal(result.timezone, 'America/Chicago');
    assert.deepEqual(Array.from(result.blockerCodes), []);
    assert.equal(frozenTree(result), true);
    assert.equal(nullPrototypeTree(result), true);
  }

  for (const boundary of ['inclusive', 'exclusive']) {
    const built = await fixture({
      anchorDate: '2026-01-31',
      operator: 'add-calendar-days',
      amount: 1,
      boundary
    });
    const result = await DeadlineEngine.evaluateRule(
      built.rule.parsed,
      [built.assertion],
      [built.citation],
      built.context
    );
    assert.equal(result.deadlineCivilDate, '2026-02-01');
    assert.equal(result.boundary, boundary, 'boundary remains proof metadata');
  }

  for (const item of [
    { anchorDate: '0001-01-01', operator: 'subtract-calendar-days', amount: 1 },
    { anchorDate: '9999-12-31', operator: 'add-calendar-days', amount: 1 }
  ]) {
    const built = await fixture(item);
    assertIneligible(
      await DeadlineEngine.evaluateRule(
        built.rule.parsed,
        [built.assertion],
        [built.citation],
        built.context
      ),
      ['unsupported-rule'],
      'supported-range overflow'
    );
  }

  const overCap = await fixture();
  const overCapRule = {
    ...plain(overCap.rule.parsed),
    amount: TruthSchema.LIMITS.MAX_DAY_OFFSET_MAGNITUDE + 1
  };
  assert.equal(
    await DeadlineEngine.evaluateRule(
      overCapRule,
      [overCap.assertion],
      [overCap.citation],
      overCap.context
    ),
    null,
    'day-offset max-plus-one invalidates the rule identity and returns no result'
  );
}

async function testBusinessCalendars(DeadlineEngine) {
  const governingCalendar = calendar();
  const additions = [
    {
      operator: 'add-business-days',
      anchorDate: '2026-07-02',
      expected: '2026-07-06'
    },
    {
      operator: 'subtract-business-days',
      anchorDate: '2026-07-06',
      expected: '2026-07-02'
    }
  ];
  for (const item of additions) {
    const built = await fixture({
      ...item,
      businessCalendarId: governingCalendar.calendarId,
      businessCalendarVersionId: governingCalendar.calendarVersionId,
      calendars: [governingCalendar]
    });
    assert.ok(built.rule.parsed, `${item.operator} rule parses`);
    const result = await DeadlineEngine.evaluateRule(
      built.rule.parsed,
      [built.assertion],
      [built.citation],
      built.context
    );
    assert.equal(result.eligibility, 'eligible');
    assert.equal(result.deadlineCivilDate, item.expected);
    assert.equal(result.calendarId, governingCalendar.calendarId);
    assert.equal(result.calendarVersionId, governingCalendar.calendarVersionId);
  }

  const missing = await fixture({
    operator: 'add-business-days',
    businessCalendarId: governingCalendar.calendarId,
    businessCalendarVersionId: governingCalendar.calendarVersionId
  });
  assertIneligible(
    await DeadlineEngine.evaluateRule(
      missing.rule.parsed,
      [missing.assertion],
      [missing.citation],
      missing.context
    ),
    ['business-calendar-missing'],
    'missing business calendar'
  );

  const stale = await fixture({
    operator: 'add-business-days',
    businessCalendarId: governingCalendar.calendarId,
    businessCalendarVersionId: governingCalendar.calendarVersionId,
    calendars: [calendar({ calendarVersionId: 'calendar-us-business-v2' })]
  });
  assertIneligible(
    await DeadlineEngine.evaluateRule(
      stale.rule.parsed,
      [stale.assertion],
      [stale.citation],
      stale.context
    ),
    ['unsupported-business-day-rule'],
    'stale business calendar'
  );

  const malformedContext = plain(stale.context);
  malformedContext.calendars = [calendar({ weekendDays: [6, 0] })];
  assertIneligible(
    await DeadlineEngine.evaluateRule(
      stale.rule.parsed,
      [stale.assertion],
      [stale.citation],
      malformedContext
    ),
    ['unsupported-business-day-rule'],
    'malformed business calendar'
  );
}

async function testFailClosedInputs(DeadlineEngine) {
  const built = await fixture();
  const invalidRuleVariants = [
    [{ ...plain(built.rule.parsed), operator: 'multiply-calendar-days' }, 'operator'],
    [{ ...plain(built.rule.parsed), boundary: null }, 'boundary'],
    [{ ...plain(built.rule.parsed), timezone: null }, 'timezone'],
    [{ ...plain(built.rule.parsed), consequence: null }, 'consequence']
  ];
  for (const [rule, label] of invalidRuleVariants) {
    assert.equal(
      await TruthSchema.parseDeadlineRule(
        rule,
        [built.assertion],
        [built.citation]
      ),
      null,
      `${label} mutation is not a valid deadline rule`
    );
    assert.equal(
      await DeadlineEngine.evaluateRule(
        rule,
        [built.assertion],
        [built.citation],
        built.context
      ),
      null,
      `${label} mutation cannot be returned as a schema-invalid deadline result`
    );
  }

  const mismatchedContext = TruthSchema.parseEvaluationContext(
    evaluationContext([], 'America/New_York'),
    [built.citation]
  );
  assertIneligible(
    await DeadlineEngine.evaluateRule(
      built.rule.parsed,
      [built.assertion],
      [built.citation],
      mismatchedContext
    ),
    ['evaluation-context-mismatch'],
    'timezone/context mismatch'
  );

  for (const field of ['expression', 'code', 'callback', 'computedDate']) {
    const hostile = { ...plain(built.rule.parsed), [field]: 'model-output' };
    assert.equal(
      await DeadlineEngine.evaluateRule(
        hostile,
        [built.assertion],
        [built.citation],
        built.context
      ),
      null,
      `${field} rejects without executing`
    );
  }

  let getterReads = 0;
  const accessor = plain(built.rule.parsed);
  Object.defineProperty(accessor, 'operator', {
    enumerable: true,
    get() {
      getterReads += 1;
      throw new Error('must not execute');
    }
  });
  assert.equal(
    await DeadlineEngine.evaluateRule(
      accessor,
      [built.assertion],
      [built.citation],
      built.context
    ),
    null,
    'accessor-bearing rule rejects'
  );
  assert.equal(getterReads, 0, 'hostile accessor is not invoked');

  const conflictingAssertion = await assertionFrom(
    built.citation,
    '2026-07-03',
    'extracted'
  );
  assertIneligible(
    await DeadlineEngine.evaluateRule(
      built.rule.parsed,
      [built.assertion, conflictingAssertion],
      [built.citation],
      built.context
    ),
    ['fact-conflict'],
    'conflicting anchor facts'
  );

  const ambiguous = await fixture({ trustState: 'ambiguous' });
  assertIneligible(
    await DeadlineEngine.evaluateRule(
      ambiguous.rule.parsed,
      [ambiguous.assertion],
      [ambiguous.citation],
      ambiguous.context
    ),
    ['input-not-exact'],
    'non-extracted anchor'
  );

  assert.equal(
    await DeadlineEngine.evaluateRule(
      built.rule.parsed,
      [],
      [built.citation],
      built.context
    ),
    null,
    'missing anchor cannot manufacture a result'
  );
}

function testClassicParityAndStaticSource() {
  const source = fs.readFileSync(ENGINE_PATH, 'utf8');
  const sandbox = {
    FsbSkopeoTruthSchema: TruthSchema,
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
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: ENGINE_PATH });
  assert.strictEqual(sandbox.FsbSkopeoDeadlineEngine, sandbox.module.exports);
  exactKeys(sandbox.module.exports, EXPECTED_SURFACE, 'classic and CommonJS surfaces match');

  const forbidden = [
    'new ' + 'Date',
    'Date' + '.parse',
    'Intl' + '.',
    'Temporal' + '.',
    '.toLocale',
    'locale' + 'Compare(',
    'eval' + '(',
    'new ' + 'Function',
    'chrome.' + 'alarms',
    'chrome.' + 'notifications',
    'setTimeout' + '(',
    'setInterval' + '(',
    'computedDate:',
    'modelCalculated'
  ];
  for (const token of forbidden) {
    assert.equal(source.includes(token), false, `production source excludes ${token}`);
  }
  assert.equal(
    /switch\s*\(\s*(?:fields\.)?operator\s*\)/.test(source),
    true,
    'operator dispatch uses one literal switch'
  );
  for (const operator of OPERATORS) {
    assert.equal(source.includes(`case '${operator}'`), true, `${operator} is a literal case`);
  }
}

async function matrixCanonical(DeadlineEngine) {
  const governingCalendar = calendar();
  const built = await fixture({
    operator: 'add-business-days',
    amount: 3,
    anchorDate: '2026-07-01',
    boundary: 'inclusive',
    businessCalendarId: governingCalendar.calendarId,
    businessCalendarVersionId: governingCalendar.calendarVersionId,
    calendars: [governingCalendar]
  });
  const result = await DeadlineEngine.evaluateRule(
    built.rule.parsed,
    [built.assertion],
    [built.citation],
    built.context
  );
  assert.ok(result);
  return TruthSchema.canonicalize({
    parsed: DeadlineEngine.parseCivilDate('2000-02-29'),
    ordinal: DeadlineEngine.toOrdinal(DeadlineEngine.parseCivilDate('2000-02-29')),
    restored: DeadlineEngine.fromOrdinal(730178),
    result
  });
}

async function testEnvironmentMatrix() {
  const outputs = [];
  for (const timezone of ['UTC', 'America/Chicago', 'Pacific/Kiritimati']) {
    for (const locale of ['C', 'fr_FR.UTF-8']) {
      const child = spawnSync(process.execPath, [__filename], {
        cwd: ROOT,
        env: {
          ...process.env,
          SKOPEO_DEADLINE_MATRIX: '1',
          TZ: timezone,
          LANG: locale,
          LC_ALL: locale
        },
        encoding: 'utf8',
        timeout: 10000
      });
      assert.equal(
        child.status,
        0,
        `matrix child ${timezone}/${locale}: ${child.stderr.trim()}`
      );
      assert.equal(child.stderr, '');
      outputs.push(child.stdout.trim());
    }
  }
  assert.ok(outputs[0], 'matrix emitted canonical bytes');
  for (const output of outputs.slice(1)) {
    assert.equal(output, outputs[0], 'TZ and locale cannot change canonical output');
  }
}

async function main() {
  assert.equal(TruthSchema.VERSION, TRUTH_VERSION, 'truth schema precondition is current');
  assert.equal(typeof GraphSchema.parseEvidenceLocator, 'function', 'graph schema precondition loads');
  if (!fs.existsSync(ENGINE_PATH)) {
    process.stderr.write(`${MISSING_MARKER}\n`);
    process.exitCode = 1;
    return;
  }

  delete require.cache[require.resolve(ENGINE_PATH)];
  const DeadlineEngine = require(ENGINE_PATH);
  if (MATRIX_MODE) {
    process.stdout.write(`${await matrixCanonical(DeadlineEngine)}\n`);
    return;
  }

  await testSurfaceAndCivilDates(DeadlineEngine);
  await testCalendarOperators(DeadlineEngine);
  await testBusinessCalendars(DeadlineEngine);
  await testFailClosedInputs(DeadlineEngine);
  testClassicParityAndStaticSource();
  await testEnvironmentMatrix();
  process.stdout.write('skopeo deadline engine contract: PASS\n');
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
