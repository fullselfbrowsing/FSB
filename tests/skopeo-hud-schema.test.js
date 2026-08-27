'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-hud-schema.js');
const CORPUS_SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-corpus-schema.js');
const CAPABILITY_PROJECTOR_PATH = path.join(
  ROOT,
  'extension',
  'utils',
  'skopeo-capability-projector.js'
);
const EXPECTED_VERSION = 'skopeo-hud-projection/1';
const RED_MARKER = 'skopeo hud schema contract: RED';

require(CORPUS_SCHEMA_PATH);
require(CAPABILITY_PROJECTOR_PATH);

if (process.env.SKOPEO_HUD_EXPECT_SCHEMA_RED === '1') {
  assert.equal(fs.existsSync(SCHEMA_PATH), false,
    'controlled RED is valid only while the HUD schema interface is absent');
  console.log(RED_MARKER);
} else {
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error('FsbSkopeoHudSchema production interface is absent');
  }

  const schema = require(SCHEMA_PATH);

  const EXPECTED_ENUMS = Object.freeze({
    CLOSED_REASONS: Object.freeze([
      'invalid-input',
      'partial-authority',
      'stale-input',
      'exact-set-over-cap',
      'vendor-scope-ambiguous',
      'evaluation-context-missing',
      'access-unavailable',
      'byte-limit-exceeded'
    ]),
    CONSEQUENCE_STATES: Object.freeze(['accepted', 'none', 'not-evaluated']),
    CURRENTNESS_STATES: Object.freeze(['current', 'partial', 'closed']),
    DATE_STATES: Object.freeze(['accepted', 'none', 'not-evaluated']),
    DATE_TYPES: Object.freeze([
      'notice-deadline',
      'renewal',
      'termination',
      'expiration'
    ]),
    EMPTY_STATES: Object.freeze(['not-empty', 'complete-empty', 'not-evaluated']),
    EVIDENCE_ROLES: Object.freeze(['governing', 'history']),
    FACT_TYPES: Object.freeze([
      'signed',
      'effective',
      'notice-window',
      'notice-deadline',
      'renewal',
      'termination',
      'expiration',
      'delivery-method',
      'written-notice-address'
    ]),
    FOLDER_GOVERNING_STATES: Object.freeze([
      'governing',
      'partially-governing',
      'review-required',
      'not-evaluated'
    ]),
    GAP_PRIORITIES: Object.freeze(['normal', 'urgent']),
    GAP_TYPES: Object.freeze([
      'missing-final',
      'unreadable-scan',
      'incomplete-indexing',
      'owner-gap',
      'version-conflict',
      'policy-document-missing',
      'pending',
      'download-blocked',
      'inaccessible',
      'ambiguous',
      'not-evaluated'
    ]),
    GOVERNING_ACTION_STATES: Object.freeze(['clause', 'document', 'not-available']),
    INDEX_STATES: Object.freeze(['complete', 'incomplete', 'pending', 'not-evaluated']),
    MANIFEST_STATES: Object.freeze(['complete', 'partial']),
    MEMO_EVIDENCE_STATES: Object.freeze(['on-file', 'not-evaluated']),
    MEMO_REQUIREMENT_STATES: Object.freeze(['not-evaluated']),
    NOTIFICATION_DELIVERY_STATES: Object.freeze([
      'not-available', 'scheduled', 'attempted', 'delivered', 'failed', 'missed',
      'not-locally-deliverable'
    ]),
    OWNER_STATES: Object.freeze(['assigned', 'unassigned', 'not-evaluated']),
    POLICY_DOCUMENT_STATES: Object.freeze(['on-file', 'missing', 'not-evaluated']),
    PROJECTION_MODES: Object.freeze(['folder', 'reading', 'ask', 'answer', 'contract-closed']),
    READING_STATES: Object.freeze([
      'governing',
      'partially-governing',
      'historical',
      'superseded',
      'review-required',
      'not-evaluated',
      'access-unavailable'
    ]),
    RESULT_STATES: Object.freeze(['complete', 'empty', 'partial', 'not-evaluated', 'closed']),
    SOURCE_STATES: Object.freeze([
      'ready',
      'pending',
      'unreadable',
      'download-blocked',
      'inaccessible',
      'missing'
    ]),
    TRUST_STATES: Object.freeze([
      'accepted',
      'extracted',
      'inferred',
      'ambiguous',
      'unreadable',
      'review-required'
    ])
  });
  const EXPECTED_LIMITS = Object.freeze({
    MAX_PROJECTED_VENDORS: 32,
    MAX_SUMMARY_DATES: 3,
    MAX_SUMMARY_GAPS: 4,
    MAX_VENDOR_GAPS: 3,
    MAX_READING_FACTS: 10,
    MAX_READING_GAPS: 6,
    MAX_SERIALIZED_BYTES: 64 * 1024,
    MAX_LABEL_LENGTH: 160,
    MAX_TEXT_LENGTH: 1024,
    MAX_CITATION_LABEL_LENGTH: 256,
    MAX_OPAQUE_TOKEN_LENGTH: 192
  });
  const EXPECTED_SURFACE = Object.freeze([
    ...Object.keys(EXPECTED_ENUMS),
    'LIMITS',
    'VERSION',
    'parseProjection'
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

  function assertDeepFrozen(value, label = 'projection') {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true, label + ' is frozen');
    if (!Array.isArray(value)) {
      assert.equal(Object.getPrototypeOf(value), null, label + ' has a null prototype');
    }
    for (const key of Object.keys(value)) assertDeepFrozen(value[key], label + '.' + key);
  }

  function acceptedDate(type = 'notice-deadline', suffix = '15') {
    return {
      state: 'accepted',
      type,
      civilDate: '2027-03-' + suffix,
      displayDate: 'Mar ' + Number(suffix) + ', 2027',
      trustState: 'accepted'
    };
  }

  function noDate(state = 'none') {
    return {
      state,
      type: null,
      civilDate: null,
      displayDate: null,
      trustState: null
    };
  }

  function consequence(state = 'none', text = null) {
    return { state, text };
  }

  function sourceCounts(indexState = 'complete', changes = {}) {
    return Object.assign({
      indexState,
      total: 1,
      ready: 1,
      pending: 0,
      unreadable: 0,
      downloadBlocked: 0,
      inaccessible: 0,
      missing: 0
    }, changes);
  }

  function vendor(offset, changes = {}) {
    return Object.assign({
      vendorToken: 'vendor:' + offset,
      label: 'Vendor ' + offset,
      owner: { state: 'assigned', label: 'Owner ' + offset },
      documents: sourceCounts(),
      governingState: 'governing',
      nextMaterialDate: noDate(),
      consequence: consequence(),
      memoEvidence: 'not-evaluated',
      policyDocument: 'not-evaluated',
      memoRequirement: 'not-evaluated',
      notificationDelivery: 'not-available',
      gaps: [],
      gapOverflow: 0
    }, changes);
  }

  function envelope(mode, body, changes = {}) {
    return Object.assign({
      version: EXPECTED_VERSION,
      generation: 7,
      exactOrigin: 'https://drive.google.com',
      profileVersion: 'drive-docs-deep-pack-v1',
      contextEpoch: 11,
      semanticEntityToken: 'entity:current',
      requestActionToken: 'request:current',
      projectionToken: 'projection:fresh',
      mode,
      currentness: 'current',
      result: 'complete',
      body
    }, changes);
  }

  function folderProjection(vendors = [vendor(1)]) {
    return envelope('folder', {
      manifestState: 'complete',
      vendorCount: vendors.length,
      vendors,
      vendorOverflow: 0,
      nextMaterialDates: [],
      nextMaterialDateOverflow: 0,
      urgentGaps: [],
      urgentGapOverflow: 0,
      emptyState: vendors.length === 0 ? 'complete-empty' : 'not-empty'
    }, vendors.length === 0 ? { result: 'empty' } : {});
  }

  function readingProjection(changes = {}) {
    return envelope('reading', Object.assign({
      documentLabel: 'Agreement 2027',
      sourceState: 'ready',
      readingState: 'historical',
      governingAction: { state: 'document', actionToken: 'action:governing' },
      facts: [{
        type: 'notice-deadline',
        value: 'March 15, 2027',
        evidenceRole: 'governing',
        trustState: 'accepted',
        citationLabel: 'Section 12, page 9',
        actionToken: 'action:fact:1'
      }],
      factOverflow: 0,
      gaps: [{ type: 'version-conflict', priority: 'urgent' }],
      gapOverflow: 0,
      policyDocument: 'not-evaluated',
      memoRequirement: 'not-evaluated',
      notificationDelivery: 'not-available',
      emptyState: 'not-empty'
    }, changes));
  }

  function closedProjection(reason = 'invalid-input') {
    return envelope('contract-closed', { reason }, {
      currentness: 'closed',
      result: 'closed'
    });
  }

  function assertParses(value, label) {
    const before = plain(value);
    const parsed = schema.parseProjection(value);
    assert.ok(parsed, label + ' parses');
    assert.notStrictEqual(parsed, value, label + ' returns a fresh value');
    assert.deepEqual(plain(parsed), before, label + ' preserves semantic data');
    assert.deepEqual(plain(value), before, label + ' does not mutate caller data');
    assert.equal(Object.isFrozen(value), false, label + ' does not freeze caller data');
    assertDeepFrozen(parsed, label);
    return parsed;
  }

  function assertRejects(value, label) {
    assert.equal(schema.parseProjection(value), null, label + ' fails closed');
  }

  function testClassicGlobalAndClosedSurface() {
    assert.strictEqual(globalThis.FsbSkopeoHudSchema, schema,
      'classic global and CommonJS export share one object');
    assert.equal(Object.isFrozen(schema), true, 'schema interface is frozen');
    assert.equal(schema.VERSION, EXPECTED_VERSION, 'schema version is exact');
    assert.deepEqual(Object.keys(schema).sort(), EXPECTED_SURFACE, 'public surface is exact');
    for (const [name, values] of Object.entries(EXPECTED_ENUMS)) {
      assert.deepEqual(schema[name], values, name + ' is the approved closed vocabulary');
      assert.equal(Object.isFrozen(schema[name]), true, name + ' is frozen');
    }
    assert.deepEqual(schema.LIMITS, EXPECTED_LIMITS, 'all UI bounds are exact');
    assert.equal(Object.isFrozen(schema.LIMITS), true, 'limits are frozen');

    const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const sandbox = { module: { exports: {} }, URL, TextEncoder };
    sandbox.globalThis = sandbox;
    vm.runInContext(source, vm.createContext(sandbox), { filename: SCHEMA_PATH });
    assert.strictEqual(sandbox.FsbSkopeoHudSchema, sandbox.module.exports,
      'VM classic global and CommonJS export share one object');
    assert.deepEqual(Object.keys(sandbox.module.exports).sort(), EXPECTED_SURFACE,
      'VM surface is exact');
  }

  function testExactShapesAndNeutralSlots() {
    assertParses(folderProjection(), 'ordinary folder projection');
    const scheduled = folderProjection();
    scheduled.body.vendors[0].notificationDelivery = {
      version: 'skopeo-alert-public-status/1',
      state: 'scheduled',
      summary: 'Local alert scheduled',
      detail: 'For March 2, 2027 · 90 days before the governing notice deadline.',
      deadlineCivilDate: '2027-05-31',
      alertCivilDate: '2027-03-02',
      action: {
        actionId: 'action:alert:remove',
        kind: 'remove-current-owner-mapping',
        label: 'Remove current owner mapping',
        requiresConfirmation: true
      }
    };
    assertParses(scheduled, 'scheduled local alert with opaque confirmed removal action');
    const hostile = clone(scheduled);
    hostile.body.vendors[0].notificationDelivery.summary = '<img src=x onerror=alert(1)>';
    assertRejects(hostile, 'hostile local alert copy');
    const unconfirmed = clone(scheduled);
    unconfirmed.body.vendors[0].notificationDelivery.action.requiresConfirmation = false;
    assertRejects(unconfirmed, 'unconfirmed owner-mapping removal');
    assertParses(readingProjection(), 'ordinary reading projection');
    assertParses(closedProjection(), 'closed projection');
    assertParses(nullPrototypeClone(folderProjection()), 'null-prototype projection');

    for (const state of EXPECTED_ENUMS.FOLDER_GOVERNING_STATES) {
      const fixture = folderProjection([vendor(1, { governingState: state })]);
      assertParses(fixture, 'folder governing state ' + state);
    }
    for (const state of EXPECTED_ENUMS.READING_STATES) {
      const fixture = readingProjection({
        readingState: state,
        sourceState: state === 'access-unavailable' ? 'inaccessible' : 'ready',
        governingAction: state === 'governing'
          ? { state: 'not-available', actionToken: null }
          : { state: 'document', actionToken: 'action:' + state }
      });
      assertParses(fixture, 'reading state ' + state);
    }
    for (const [offset, type] of EXPECTED_ENUMS.DATE_TYPES.entries()) {
      const nextDate = acceptedDate(type, String(15 + offset).padStart(2, '0'));
      const fixture = folderProjection([vendor(offset + 1, {
        nextMaterialDate: nextDate,
        consequence: consequence('accepted', 'The agreement changes if no action is taken.')
      })]);
      fixture.body.nextMaterialDates = [{
        vendorToken: fixture.body.vendors[0].vendorToken,
        vendorLabel: fixture.body.vendors[0].label,
        date: clone(nextDate),
        consequence: clone(fixture.body.vendors[0].consequence)
      }];
      assertParses(fixture, 'typed material date ' + type);
    }

    const neutral = folderProjection([vendor(1, {
      owner: { state: 'not-evaluated', label: null },
      documents: sourceCounts('not-evaluated'),
      governingState: 'not-evaluated',
      nextMaterialDate: noDate('not-evaluated'),
      consequence: consequence('not-evaluated'),
      memoEvidence: 'not-evaluated',
      policyDocument: 'not-evaluated',
      memoRequirement: 'not-evaluated',
      notificationDelivery: 'not-available',
      gaps: [{ type: 'not-evaluated', priority: 'normal' }]
    })]);
    assertParses(neutral, 'all neutral downstream slots');
  }

  function testHostileDescriptorsAndAuthorityLeaks() {
    const fixture = folderProjection();
    let reads = 0;
    const topAccessor = clone(fixture);
    Object.defineProperty(topAccessor, 'body', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('getter must not execute');
      }
    });
    assertRejects(topAccessor, 'top-level accessor');
    assert.equal(reads, 0, 'top-level getter is never executed');

    const nestedAccessor = clone(fixture);
    nestedAccessor.body = clone(fixture.body);
    nestedAccessor.body.vendors = [clone(fixture.body.vendors[0])];
    Object.defineProperty(nestedAccessor.body.vendors[0], 'label', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('nested getter must not execute');
      }
    });
    assertRejects(nestedAccessor, 'nested accessor');
    assert.equal(reads, 0, 'nested getter is never executed');

    const symbol = clone(fixture);
    symbol[Symbol('hidden')] = true;
    assertRejects(symbol, 'symbol property');

    const sparse = folderProjection();
    sparse.body.vendors = [];
    sparse.body.vendors.length = 1;
    sparse.body.vendorCount = 1;
    assertRejects(sparse, 'sparse vendor array');

    const customPrototype = Object.assign(Object.create({ inherited: true }), fixture);
    assertRejects(customPrototype, 'custom prototype');

    const cyclic = folderProjection();
    cyclic.body.vendors[0].owner = cyclic.body.vendors[0];
    assertRejects(cyclic, 'cyclic nested record');

    const duplicateVendor = folderProjection([vendor(1), vendor(1)]);
    assertRejects(duplicateVendor, 'duplicate vendor token');

    const duplicateAction = readingProjection();
    duplicateAction.body.facts.push(Object.assign({}, duplicateAction.body.facts[0], {
      type: 'effective'
    }));
    assertRejects(duplicateAction, 'duplicate citation action token');

    const controlText = folderProjection();
    controlText.body.vendors[0].label = 'Hostile\u0000vendor';
    assertRejects(controlText, 'control-bearing text');
    const bidiText = folderProjection();
    bidiText.body.vendors[0].label = 'Vendor\u202eexe';
    assertRejects(bidiText, 'bidi-control text');
    const htmlText = folderProjection();
    htmlText.body.vendors[0].label = '<img src=x onerror=alert(1)>';
    assertRejects(htmlText, 'markup-shaped text');
    const oversized = folderProjection();
    oversized.body.vendors[0].label = 'x'.repeat(schema.LIMITS.MAX_LABEL_LENGTH + 1);
    assertRejects(oversized, 'oversized label');

    for (const forbidden of [
      'heading',
      'instruction',
      'innerHTML',
      'actionLabel',
      'url',
      'sourceFileId',
      'graphRecord',
      'truthRecord',
      'storageKey',
      'certificate',
      'resourceKey',
      'providerData',
      'callback'
    ]) {
      const leaked = folderProjection();
      leaked.body[forbidden] = forbidden === 'callback' ? function() {} : 'forbidden';
      assertRejects(leaked, 'forbidden authority field ' + forbidden);
    }
  }

  function testCivilDatesAndExactCaps() {
    assertParses(folderProjection([vendor(1, {
      nextMaterialDate: Object.assign(acceptedDate(), {
        civilDate: '2028-02-29',
        displayDate: 'Feb 29, 2028'
      }),
      consequence: consequence('accepted', 'The term renews automatically.')
    })]), 'valid leap-day date');
    for (const invalidDate of ['2027-02-29', '2027-13-01', '2027-00-01', '2027-04-31', '03/15/2027']) {
      const invalid = folderProjection([vendor(1, {
        nextMaterialDate: Object.assign(acceptedDate(), { civilDate: invalidDate }),
        consequence: consequence('accepted', 'A consequence remains separate.')
      })]);
      assertRejects(invalid, 'invalid civil date ' + invalidDate);
    }

    const maxVendors = folderProjection(Array.from(
      { length: schema.LIMITS.MAX_PROJECTED_VENDORS },
      (_, index) => vendor(index + 1)
    ));
    assertParses(maxVendors, 'exact vendor maximum');
    const vendorPlusOne = folderProjection(Array.from(
      { length: schema.LIMITS.MAX_PROJECTED_VENDORS + 1 },
      (_, index) => vendor(index + 1)
    ));
    assertRejects(vendorPlusOne, 'vendor maximum plus one');

    const partial = folderProjection(Array.from(
      { length: schema.LIMITS.MAX_PROJECTED_VENDORS },
      (_, index) => vendor(index + 1, {
        owner: { state: 'not-evaluated', label: null },
        documents: sourceCounts('not-evaluated'),
        governingState: 'not-evaluated',
        nextMaterialDate: noDate('not-evaluated'),
        consequence: consequence('not-evaluated')
      })
    ));
    partial.currentness = 'partial';
    partial.result = 'partial';
    partial.body.manifestState = 'partial';
    partial.body.vendorCount += 1;
    partial.body.vendorOverflow = 1;
    partial.body.emptyState = 'not-evaluated';
    assertParses(partial, 'authorized exact vendor overflow');
    const badOverflow = clone(partial);
    badOverflow.body.vendorOverflow = 0;
    assertRejects(badOverflow, 'overflow arithmetic mismatch');

    const summaries = folderProjection([vendor(1), vendor(2), vendor(3), vendor(4)]);
    summaries.body.nextMaterialDates = Array.from(
      { length: schema.LIMITS.MAX_SUMMARY_DATES },
      (_, index) => ({
        vendorToken: summaries.body.vendors[index].vendorToken,
        vendorLabel: summaries.body.vendors[index].label,
        date: acceptedDate(EXPECTED_ENUMS.DATE_TYPES[index], String(15 + index).padStart(2, '0')),
        consequence: consequence('accepted', 'Consequence ' + index)
      })
    );
    summaries.body.nextMaterialDateOverflow = 1;
    summaries.body.urgentGaps = Array.from(
      { length: schema.LIMITS.MAX_SUMMARY_GAPS },
      (_, index) => ({
        vendorToken: summaries.body.vendors[index].vendorToken,
        vendorLabel: summaries.body.vendors[index].label,
        gap: { type: EXPECTED_ENUMS.GAP_TYPES[index], priority: 'urgent' }
      })
    );
    summaries.body.urgentGapOverflow = 2;
    summaries.body.vendors[0].gaps = Array.from(
      { length: schema.LIMITS.MAX_VENDOR_GAPS },
      (_, index) => ({ type: EXPECTED_ENUMS.GAP_TYPES[index], priority: 'normal' })
    );
    summaries.body.vendors[0].gapOverflow = 1;
    assertParses(summaries, 'all exact folder summary/card caps with overflow');
    const summaryPlusOne = clone(summaries);
    summaryPlusOne.body.nextMaterialDates.push(clone(summaryPlusOne.body.nextMaterialDates[0]));
    assertRejects(summaryPlusOne, 'date summary maximum plus one');
    const urgentPlusOne = clone(summaries);
    urgentPlusOne.body.urgentGaps.push(clone(urgentPlusOne.body.urgentGaps[0]));
    assertRejects(urgentPlusOne, 'urgent summary maximum plus one');
    const gapPlusOne = clone(summaries);
    gapPlusOne.body.vendors[0].gaps.push({ type: 'owner-gap', priority: 'normal' });
    assertRejects(gapPlusOne, 'vendor gap maximum plus one');

    const maxReading = readingProjection({
      facts: Array.from({ length: schema.LIMITS.MAX_READING_FACTS }, (_, index) => ({
        type: EXPECTED_ENUMS.FACT_TYPES[index % EXPECTED_ENUMS.FACT_TYPES.length],
        value: 'Fact value ' + index,
        evidenceRole: index % 2 === 0 ? 'governing' : 'history',
        trustState: EXPECTED_ENUMS.TRUST_STATES[index % EXPECTED_ENUMS.TRUST_STATES.length],
        citationLabel: 'Citation ' + index,
        actionToken: 'action:fact:' + index
      })),
      factOverflow: 2,
      gaps: Array.from({ length: schema.LIMITS.MAX_READING_GAPS }, (_, index) => ({
        type: EXPECTED_ENUMS.GAP_TYPES[index],
        priority: index === 0 ? 'urgent' : 'normal'
      })),
      gapOverflow: 3
    });
    assertParses(maxReading, 'exact reading fact/gap caps with overflow');
    const factPlusOne = clone(maxReading);
    factPlusOne.body.facts.push(Object.assign({}, factPlusOne.body.facts[0], {
      actionToken: 'action:fact:overflow'
    }));
    assertRejects(factPlusOne, 'reading fact maximum plus one');
    const readingGapPlusOne = clone(maxReading);
    readingGapPlusOne.body.gaps.push({ type: 'ambiguous', priority: 'normal' });
    assertRejects(readingGapPlusOne, 'reading gap maximum plus one');
  }

  function testSerializedByteCeilingAndFreshness() {
    const ordinary = folderProjection();
    const first = schema.parseProjection(ordinary);
    const second = schema.parseProjection(ordinary);
    assert.notStrictEqual(first, second, 'successful parses are fresh values');
    assert.notStrictEqual(first.body, second.body, 'nested successful values are fresh');

    const overBytes = folderProjection(Array.from(
      { length: schema.LIMITS.MAX_PROJECTED_VENDORS },
      (_, index) => vendor(index + 1, {
        label: '界'.repeat(schema.LIMITS.MAX_LABEL_LENGTH),
        owner: {
          state: 'assigned',
          label: '界'.repeat(schema.LIMITS.MAX_LABEL_LENGTH)
        },
        nextMaterialDate: acceptedDate('renewal'),
        consequence: consequence('accepted', '界'.repeat(schema.LIMITS.MAX_TEXT_LENGTH))
      })
    ));
    assert.ok(Buffer.byteLength(JSON.stringify(overBytes), 'utf8') > schema.LIMITS.MAX_SERIALIZED_BYTES,
      'byte-ceiling fixture is genuinely oversized');
    assertRejects(overBytes, '64 KiB serialized ceiling');
  }

  testClassicGlobalAndClosedSurface();
  testExactShapesAndNeutralSlots();
  testHostileDescriptorsAndAuthorityLeaks();
  testCivilDatesAndExactCaps();
  testSerializedByteCeilingAndFreshness();
  console.log('skopeo hud schema contract: PASS');
}
