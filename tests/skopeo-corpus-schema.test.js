'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-corpus-schema.js');
const EXPECTED_VERSION = 'skopeo-corpus-schema/v1';
const EXPECTED_SURFACE = Object.freeze([
  'SOURCE_STATES',
  'VERSION',
  'canTransitionSourceState',
  'canonicalize',
  'classifySourceEvidence',
  'makePartitionKey',
  'makeSourceKey',
  'parseContentFingerprint',
  'parseManifest',
  'parseMembershipFingerprint',
  'parseMetadataFingerprint',
  'parsePartitionKey',
  'parsePartitionRecord',
  'parseSourceKey',
  'parseSourceRecord',
  'sha256Hex'
].sort());

delete globalThis.FsbSkopeoCorpusSchema;
const schema = require(SCHEMA_PATH);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value, changes = {}) {
  return Object.assign({}, value, changes);
}

function assertFrozenRecord(value, label) {
  assert.ok(value, label + ' exists');
  assert.equal(Object.getPrototypeOf(value), null, label + ' has a null prototype');
  assert.equal(Object.isFrozen(value), true, label + ' is frozen');
}

function assertRejectedWithoutGetter(parser, fixture, key, label) {
  let reads = 0;
  const hostile = clone(fixture);
  Object.defineProperty(hostile, key, {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error('getter must not execute');
    }
  });
  assert.equal(parser(hostile), null, label + ' accessor is rejected');
  assert.equal(reads, 0, label + ' accessor is never executed');
}

function makeFixtures(api = schema) {
  const accountPermissionId = 'permission-123';
  const corpusRootFileId = 'root_A-1';
  const sourceFileId = 'source_B-2';
  const partitionKey = api.makePartitionKey({ accountPermissionId, corpusRootFileId });
  const sourceKey = api.makeSourceKey({ accountPermissionId, corpusRootFileId, sourceFileId });
  const readyEvidence = Object.freeze({
    tag: 'verified-readable',
    accountAccess: true,
    ancestry: true,
    contentPath: 'supported',
    downloadAllowed: true,
    contentFingerprint: 'current',
    processedFingerprint: 'current'
  });
  const metadataFingerprint = Object.freeze({
    version: EXPECTED_VERSION,
    kind: 'metadata',
    name: 'Vendor Agreement',
    mimeType: 'text/plain',
    modifiedTime: '2026-07-20T12:00:00.000Z',
    driveVersion: '42',
    size: 2048,
    trashed: false,
    canDownload: true
  });
  const membershipFingerprint = Object.freeze({
    version: EXPECTED_VERSION,
    kind: 'membership',
    corpusRootFileId,
    physicalParentChain: Object.freeze([corpusRootFileId, 'vendor-folder-1']),
    vendorScopeFileId: 'vendor-folder-1',
    driveId: null
  });
  const contentFingerprint = Object.freeze({
    version: EXPECTED_VERSION,
    kind: 'content',
    evidenceKind: 'download-byte-hash',
    value: 'sha256:' + 'a'.repeat(64)
  });
  const manifest = Object.freeze({
    version: EXPECTED_VERSION,
    lifecycle: 'active',
    authorityEpoch: 7,
    activePartitionKey: partitionKey
  });
  const partitionRecord = Object.freeze({
    version: EXPECTED_VERSION,
    partitionKey,
    accountPermissionId,
    corpusRootFileId,
    lifecycle: 'active',
    partitionEpoch: 4
  });
  const sourceRecord = Object.freeze({
    version: EXPECTED_VERSION,
    sourceKey,
    partitionKey,
    accountPermissionId,
    corpusRootFileId,
    sourceFileId,
    visibility: 'active',
    state: 'ready',
    evidence: readyEvidence,
    displayName: 'Vendor Agreement',
    metadataFingerprint,
    membershipFingerprint,
    contentFingerprint
  });
  return {
    accountPermissionId,
    corpusRootFileId,
    sourceFileId,
    partitionKey,
    sourceKey,
    readyEvidence,
    metadataFingerprint,
    membershipFingerprint,
    contentFingerprint,
    manifest,
    partitionRecord,
    sourceRecord
  };
}

function testClassicGlobalAndClosedSurface() {
  assert.strictEqual(globalThis.FsbSkopeoCorpusSchema, schema,
    'CommonJS and the production classic global share one contract');
  assert.equal(Object.isFrozen(schema), true, 'public corpus schema is frozen');
  assert.deepEqual(Object.keys(schema).sort(), EXPECTED_SURFACE, 'public surface is exact');
  assert.equal(schema.VERSION, EXPECTED_VERSION, 'schema version is exact');
  assert.deepEqual(schema.SOURCE_STATES, [
    'ready',
    'pending',
    'unreadable',
    'download-blocked',
    'inaccessible',
    'missing'
  ], 'source state vocabulary has exactly six members');
  assert.equal(Object.isFrozen(schema.SOURCE_STATES), true, 'source states are frozen');

  const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const sandbox = {
    console,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    URL,
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(source, vm.createContext(sandbox), { filename: SCHEMA_PATH });
  assert.strictEqual(sandbox.FsbSkopeoCorpusSchema, sandbox.module.exports,
    'VM classic global and CommonJS export share one object');
  assert.deepEqual(Object.keys(sandbox.module.exports).sort(), EXPECTED_SURFACE,
    'VM export surface remains exact');
}

function testCollisionSafeTupleKeys() {
  const fixture = makeFixtures();
  assert.match(fixture.partitionKey, /^scpk1:/, 'partition key carries an exact version prefix');
  assert.match(fixture.sourceKey, /^scsk1:/, 'source key carries an exact version prefix');
  assert.notEqual(
    schema.makePartitionKey({ accountPermissionId: 'a', corpusRootFileId: 'bc' }),
    schema.makePartitionKey({ accountPermissionId: 'ab', corpusRootFileId: 'c' }),
    'length-safe encoding prevents tuple boundary collisions'
  );
  assert.notEqual(
    schema.makeSourceKey({ accountPermissionId: 'a', corpusRootFileId: 'bc', sourceFileId: 'd' }),
    schema.makeSourceKey({ accountPermissionId: 'ab', corpusRootFileId: 'c', sourceFileId: 'd' }),
    'source tuple boundary collisions are impossible'
  );

  const partition = schema.parsePartitionKey(fixture.partitionKey);
  assertFrozenRecord(partition, 'parsed partition tuple');
  assert.deepEqual(plain(partition), {
    version: EXPECTED_VERSION,
    accountPermissionId: fixture.accountPermissionId,
    corpusRootFileId: fixture.corpusRootFileId
  });
  const source = schema.parseSourceKey(fixture.sourceKey);
  assertFrozenRecord(source, 'parsed source tuple');
  assert.deepEqual(plain(source), {
    version: EXPECTED_VERSION,
    accountPermissionId: fixture.accountPermissionId,
    corpusRootFileId: fixture.corpusRootFileId,
    sourceFileId: fixture.sourceFileId
  });

  for (const invalidId of [
    '',
    'x'.repeat(257),
    'control\u0000id',
    'line\nbreak',
    'space id',
    'legacy|delimiter',
    '\uff52oot-A',
    '__proto__',
    'constructor'
  ]) {
    assert.equal(schema.makePartitionKey({
      accountPermissionId: invalidId,
      corpusRootFileId: fixture.corpusRootFileId
    }), null, 'invalid account ID fails closed: ' + JSON.stringify(invalidId));
    assert.equal(schema.makeSourceKey({
      accountPermissionId: fixture.accountPermissionId,
      corpusRootFileId: fixture.corpusRootFileId,
      sourceFileId: invalidId
    }), null, 'invalid source ID fails closed: ' + JSON.stringify(invalidId));
  }
  assert.equal(schema.makePartitionKey({
    accountPermissionId: fixture.accountPermissionId,
    corpusRootFileId: fixture.corpusRootFileId,
    sourceFileId: fixture.sourceFileId
  }), null, 'partition constructor rejects extra tuple members');
  assert.equal(schema.makeSourceKey({
    accountPermissionId: fixture.accountPermissionId,
    corpusRootFileId: fixture.corpusRootFileId
  }), null, 'source constructor rejects an omitted sourceFileId');

  for (const invalidKey of [
    `${fixture.accountPermissionId}|${fixture.corpusRootFileId}`,
    JSON.stringify([fixture.accountPermissionId, fixture.corpusRootFileId]),
    'global-corpus',
    fixture.partitionKey.replace(/^scpk1:/, 'scpk0:'),
    fixture.partitionKey.replace(/^scpk1:/, 'scpk1\uff1a'),
    fixture.partitionKey + 'trailing',
    fixture.partitionKey.replace(/scpk1:(\d+):/, 'scpk1:0$1:'),
    fixture.sourceKey.replace(/^scsk1:/, 'scpk1:')
  ]) {
    assert.equal(schema.parsePartitionKey(invalidKey), null,
      'legacy, confusable, or malformed partition key fails closed');
  }
  assert.equal(schema.parseSourceKey(fixture.partitionKey), null,
    'partition key cannot impersonate a source key');
}

function testManifestAndPartitionLifecycle() {
  const fixture = makeFixtures();
  const manifest = schema.parseManifest(fixture.manifest);
  assertFrozenRecord(manifest, 'manifest');
  assert.deepEqual(plain(manifest), fixture.manifest);
  for (const lifecycle of ['closed', 'purging', 'unproven']) {
    const parsed = schema.parseManifest({
      version: EXPECTED_VERSION,
      lifecycle,
      authorityEpoch: 8,
      activePartitionKey: null
    });
    assertFrozenRecord(parsed, lifecycle + ' manifest');
  }
  assert.equal(schema.parseManifest(clone(fixture.manifest, { lifecycle: 'staging' })), null,
    'partition lifecycle cannot enter the manifest contract');
  assert.equal(schema.parseManifest(clone(fixture.manifest, { lifecycle: 'closed' })), null,
    'closed manifest cannot retain an active partition pointer');
  assert.equal(schema.parseManifest(clone(fixture.manifest, { activePartitionKey: null })), null,
    'active manifest requires one exact partition pointer');
  assert.equal(schema.parseManifest(clone(fixture.manifest, { authorityEpoch: -1 })), null,
    'manifest epoch is monotonic-safe');
  assert.equal(schema.parseManifest(clone(fixture.manifest, { extra: true })), null,
    'manifest rejects unknown fields');
  assertRejectedWithoutGetter(schema.parseManifest, fixture.manifest, 'lifecycle', 'manifest');

  for (const lifecycle of ['staging', 'active', 'withdrawn', 'purging', 'purged']) {
    const parsed = schema.parsePartitionRecord(clone(fixture.partitionRecord, { lifecycle }));
    assertFrozenRecord(parsed, lifecycle + ' partition record');
    assert.equal(parsed.lifecycle, lifecycle);
  }
  assert.equal(schema.parsePartitionRecord(clone(fixture.partitionRecord, {
    partitionKey: schema.makePartitionKey({
      accountPermissionId: fixture.accountPermissionId,
      corpusRootFileId: 'another-root'
    })
  })), null, 'cross-root partition substitution is rejected');
  assert.equal(schema.parsePartitionRecord(clone(fixture.partitionRecord, {
    accountPermissionId: 'another-account'
  })), null, 'cross-account record substitution is rejected');
  assert.equal(schema.parsePartitionRecord(clone(fixture.partitionRecord, {
    lifecycle: 'closed'
  })), null, 'manifest lifecycle cannot enter a partition record');
}

function testSourceEvidenceDecisionTable() {
  const fixture = makeFixtures();
  const cases = [
    [fixture.readyEvidence, 'ready'],
    [{ tag: 'work-in-progress' }, 'pending'],
    [{ tag: 'transient-proof-failure' }, 'pending'],
    [{ tag: 'unsupported-content' }, 'unreadable'],
    [{ tag: 'parser-failure' }, 'unreadable'],
    [{ tag: 'download-policy-denial' }, 'download-blocked'],
    [{ tag: 'explicit-access-denial' }, 'inaccessible'],
    [{ tag: 'opaque-not-found' }, 'inaccessible'],
    [{ tag: 'lost-access' }, 'inaccessible'],
    [{ tag: 'authoritative-reconciliation' }, 'missing']
  ];
  for (const [evidence, expected] of cases) {
    assert.equal(schema.classifySourceEvidence(evidence), expected,
      evidence.tag + ' maps to the exact source state');
    assert.equal(schema.canTransitionSourceState('ready', expected, evidence), true,
      evidence.tag + ' authorizes its matching transition');
  }
  for (const key of [
    'accountAccess',
    'ancestry',
    'downloadAllowed'
  ]) {
    assert.equal(schema.classifySourceEvidence(clone(fixture.readyEvidence, { [key]: false })), null,
      'partial readable proof cannot classify ready: ' + key);
  }
  assert.equal(schema.classifySourceEvidence(clone(fixture.readyEvidence, {
    processedFingerprint: 'stale'
  })), null, 'stale processed fingerprint cannot classify ready');
  assert.equal(schema.classifySourceEvidence({ tag: 'opaque-not-found', complete: true }), null,
    'unknown evidence fields fail closed');
  assert.equal(schema.classifySourceEvidence({ tag: 'deleted' }), null,
    'unapproved deletion claim does not classify missing');
  assert.equal(schema.canTransitionSourceState(
    'inaccessible', 'missing', { tag: 'opaque-not-found' }
  ), false, 'opaque 404 never transitions to missing');
  assert.equal(schema.canTransitionSourceState(
    'inaccessible', 'missing', { tag: 'authoritative-reconciliation' }
  ), true, 'only authoritative inventory reconciliation transitions to missing');
  assert.equal(schema.canTransitionSourceState(
    'error', 'pending', { tag: 'transient-proof-failure' }
  ), false, 'unknown prior state cannot enter the reducer');
  assert.equal(schema.canTransitionSourceState(
    'ready', 'stale', { tag: 'transient-proof-failure' }
  ), false, 'unknown requested state cannot enter the reducer');
}

function testIndependentFingerprints() {
  const fixture = makeFixtures();
  const metadata = schema.parseMetadataFingerprint(fixture.metadataFingerprint);
  const membership = schema.parseMembershipFingerprint(fixture.membershipFingerprint);
  const content = schema.parseContentFingerprint(fixture.contentFingerprint);
  assertFrozenRecord(metadata, 'metadata fingerprint');
  assertFrozenRecord(membership, 'membership fingerprint');
  assertFrozenRecord(content, 'content fingerprint');
  assert.equal(Object.isFrozen(membership.physicalParentChain), true,
    'membership parent chain is recursively frozen');

  const renamed = schema.parseMetadataFingerprint(clone(fixture.metadataFingerprint, {
    name: 'Renamed Vendor Agreement'
  }));
  const moved = schema.parseMembershipFingerprint(clone(fixture.membershipFingerprint, {
    physicalParentChain: [fixture.corpusRootFileId, 'vendor-folder-2'],
    vendorScopeFileId: 'vendor-folder-2'
  }));
  assert.notEqual(schema.canonicalize(metadata), schema.canonicalize(renamed),
    'rename changes metadata identity');
  assert.notEqual(schema.canonicalize(membership), schema.canonicalize(moved),
    'physical move changes membership identity');
  assert.equal(
    schema.canonicalize(content),
    schema.canonicalize(schema.parseContentFingerprint(fixture.contentFingerprint)),
    'rename-only and physical-move-only fixtures leave content identity unchanged'
  );

  const revision = schema.parseContentFingerprint({
    version: EXPECTED_VERSION,
    kind: 'content',
    evidenceKind: 'drive-revision',
    value: 'revision_123'
  });
  assertFrozenRecord(revision, 'exact revision content fingerprint');
  for (const invalid of [
    clone(fixture.contentFingerprint, { evidenceKind: 'drive-version' }),
    clone(fixture.contentFingerprint, { evidenceKind: 'export-byte-hash', value: 'sha256:short' }),
    clone(fixture.contentFingerprint, { name: 'rename-must-not-enter-content' })
  ]) {
    assert.equal(schema.parseContentFingerprint(invalid), null,
      'content identity rejects metadata hints and malformed hashes');
  }
  assert.equal(schema.parseMetadataFingerprint(clone(fixture.metadataFingerprint, {
    modifiedTime: 'yesterday'
  })), null, 'metadata timestamp is normalized and exact');
  assert.equal(schema.parseMetadataFingerprint(clone(fixture.metadataFingerprint, {
    mimeType: 'text/plain\u0000html'
  })), null, 'metadata MIME rejects controls');
  assert.equal(schema.parseMembershipFingerprint(clone(fixture.membershipFingerprint, {
    physicalParentChain: [fixture.corpusRootFileId, fixture.corpusRootFileId]
  })), null, 'membership chain rejects cycles and duplicates');
  assert.equal(schema.parseMembershipFingerprint(clone(fixture.membershipFingerprint, {
    shortcutTarget: 'outside-root'
  })), null, 'shortcut target never enters physical membership identity');
}

function sourceRecordForState(fixture, state, evidence, changes = {}) {
  const base = clone(fixture.sourceRecord, {
    state,
    evidence,
    visibility: state === 'ready' || state === 'unreadable' || state === 'download-blocked'
      ? 'active'
      : 'withheld',
    displayName: state === 'ready' || state === 'unreadable' || state === 'download-blocked'
      ? 'Vendor Agreement'
      : null,
    metadataFingerprint: state === 'ready' || state === 'unreadable' || state === 'download-blocked'
      ? fixture.metadataFingerprint
      : null,
    membershipFingerprint: state === 'ready' || state === 'unreadable' || state === 'download-blocked'
      ? fixture.membershipFingerprint
      : null,
    contentFingerprint: state === 'ready' ? fixture.contentFingerprint : null
  });
  return Object.assign(base, changes);
}

function testSourceRecordIsolationAndVisibility() {
  const fixture = makeFixtures();
  const ready = schema.parseSourceRecord(fixture.sourceRecord);
  assertFrozenRecord(ready, 'ready source record');
  assert.equal(Object.isFrozen(ready.evidence), true, 'source evidence is frozen');
  assert.equal(Object.isFrozen(ready.metadataFingerprint), true, 'metadata fingerprint is frozen in source');
  assert.equal(Object.isFrozen(ready.membershipFingerprint), true, 'membership fingerprint is frozen in source');
  assert.equal(Object.isFrozen(ready.contentFingerprint), true, 'content fingerprint is frozen in source');

  const nonReadyCases = [
    ['pending', { tag: 'transient-proof-failure' }],
    ['unreadable', { tag: 'unsupported-content' }],
    ['download-blocked', { tag: 'download-policy-denial' }],
    ['inaccessible', { tag: 'opaque-not-found' }],
    ['missing', { tag: 'authoritative-reconciliation' }]
  ];
  for (const [state, evidence] of nonReadyCases) {
    const parsed = schema.parseSourceRecord(sourceRecordForState(fixture, state, evidence));
    assertFrozenRecord(parsed, state + ' source record');
    assert.equal(parsed.state, state);
  }
  assert.equal(schema.parseSourceRecord(sourceRecordForState(
    fixture, 'pending', { tag: 'transient-proof-failure' }, { displayName: 'stale name' }
  )), null, 'pending record cannot retain a stale name');
  assert.equal(schema.parseSourceRecord(sourceRecordForState(
    fixture, 'inaccessible', { tag: 'opaque-not-found' }, { metadataFingerprint: fixture.metadataFingerprint }
  )), null, 'inaccessible record cannot retain stale metadata identity');
  assert.equal(schema.parseSourceRecord(sourceRecordForState(
    fixture, 'missing', { tag: 'authoritative-reconciliation' }, { contentFingerprint: fixture.contentFingerprint }
  )), null, 'missing record cannot retain stale content identity');
  assert.equal(schema.parseSourceRecord(sourceRecordForState(
    fixture, 'ready', fixture.readyEvidence, { visibility: 'withheld' }
  )), null, 'ready content cannot be admitted behind withheld visibility');
  assert.equal(schema.parseSourceRecord(sourceRecordForState(
    fixture, 'unreadable', { tag: 'unsupported-content' }, { contentFingerprint: fixture.contentFingerprint }
  )), null, 'unreadable source cannot carry inferred content identity');

  const wrongPartition = schema.makePartitionKey({
    accountPermissionId: fixture.accountPermissionId,
    corpusRootFileId: 'other-root'
  });
  const wrongSource = schema.makeSourceKey({
    accountPermissionId: fixture.accountPermissionId,
    corpusRootFileId: fixture.corpusRootFileId,
    sourceFileId: 'other-source'
  });
  assert.equal(schema.parseSourceRecord(clone(fixture.sourceRecord, { partitionKey: wrongPartition })), null,
    'source record rejects a cross-root partition key');
  assert.equal(schema.parseSourceRecord(clone(fixture.sourceRecord, { sourceKey: wrongSource })), null,
    'source record rejects a cross-source key');
  assert.equal(schema.parseSourceRecord(clone(fixture.sourceRecord, {
    membershipFingerprint: clone(fixture.membershipFingerprint, { corpusRootFileId: 'other-root' })
  })), null, 'membership fingerprint cannot substitute another root');

  const staleProjectionFields = [
    ['name', 'stale name'],
    ['excerpt', 'stale excerpt'],
    ['spans', []],
    ['counts', { total: 1 }],
    ['relationships', []],
    ['answers', []],
    ['citations', []],
    ['errorText', 'remote error'],
    ['display', { accountPermissionId: fixture.accountPermissionId }]
  ];
  for (const [key, value] of staleProjectionFields) {
    for (const [state, evidence] of [
      ['pending', { tag: 'work-in-progress' }],
      ['inaccessible', { tag: 'explicit-access-denial' }],
      ['missing', { tag: 'authoritative-reconciliation' }]
    ]) {
      assert.equal(schema.parseSourceRecord(sourceRecordForState(
        fixture, state, evidence, { [key]: value }
      )), null, `${state} rejects stale ${key}`);
    }
  }

  const rawOrSecretFields = [
    ['bytes', new Uint8Array([1, 2, 3])],
    ['fullText', 'whole document'],
    ['content', 'response content'],
    ['responseBody', 'raw body'],
    ['authorization', 'Bearer secret'],
    ['changeToken', 'remote token'],
    ['permissionIds', [fixture.accountPermissionId]],
    ['innerHTML', '<strong>hostile</strong>']
  ];
  for (const [key, value] of rawOrSecretFields) {
    assert.equal(schema.parseSourceRecord(clone(fixture.sourceRecord, { [key]: value })), null,
      'source record rejects raw or secret field ' + key);
  }
  assertRejectedWithoutGetter(schema.parseSourceRecord, fixture.sourceRecord, 'state', 'source record');
  assert.equal(schema.parseSourceRecord(Object.assign(
    Object.create({ inherited: true }), fixture.sourceRecord
  )), null, 'custom-prototype source record is rejected');
}

function nestedObject(depth) {
  let value = { leaf: true };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

async function testBoundedCanonicalizationAndSha256() {
  assert.equal(schema.canonicalize({ b: 2, a: 1 }), '{"a":1,"b":2}',
    'canonical JSON sorts exact own keys');
  const nullPrototype = Object.create(null);
  nullPrototype.z = [true, null, 'bounded'];
  nullPrototype.a = 1;
  assert.equal(schema.canonicalize(nullPrototype), '{"a":1,"z":[true,null,"bounded"]}',
    'canonical JSON accepts null-prototype data records');

  const cycle = {};
  cycle.self = cycle;
  const accessor = {};
  let getterReads = 0;
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 'unsafe';
    }
  });
  const sparse = [];
  sparse.length = 2;
  sparse[1] = 'hole';
  const symbolKey = { safe: true };
  symbolKey[Symbol('hidden')] = true;
  for (const [value, label] of [
    [cycle, 'cycle'],
    [nestedObject(20), 'excessive depth'],
    [{ value: 'x'.repeat(4097) }, 'oversized string'],
    [{ value() {} }, 'function'],
    [{ value: 1n }, 'bigint'],
    [accessor, 'accessor'],
    [Object.assign(Object.create({ inherited: true }), { own: true }), 'custom prototype'],
    [sparse, 'sparse array'],
    [symbolKey, 'symbol key']
  ]) {
    assert.equal(schema.canonicalize(value), null, label + ' canonical input fails closed');
  }
  assert.equal(getterReads, 0, 'canonicalization never executes accessors');

  const first = await schema.sha256Hex({ b: 2, a: 1 });
  const second = await schema.sha256Hex({ a: 1, b: 2 });
  assert.match(first, /^sha256:[0-9a-f]{64}$/, 'SHA-256 is explicit and full length');
  assert.equal(second, first, 'canonical hashes are deterministic');
  assert.equal(await schema.sha256Hex(cycle), null, 'cycles never reach hashing');

  const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const noCryptoSandbox = { TextEncoder, Uint8Array, module: { exports: {} } };
  noCryptoSandbox.globalThis = noCryptoSandbox;
  vm.runInContext(source, vm.createContext(noCryptoSandbox), { filename: SCHEMA_PATH });
  assert.equal(await noCryptoSandbox.module.exports.sha256Hex({ a: 1 }), null,
    'missing Web Crypto fails closed instead of using a weak digest');
}

async function main() {
  testClassicGlobalAndClosedSurface();
  testCollisionSafeTupleKeys();
  testManifestAndPartitionLifecycle();
  testSourceEvidenceDecisionTable();
  testIndependentFingerprints();
  testSourceRecordIsolationAndVisibility();
  await testBoundedCanonicalizationAndSha256();
  console.log('skopeo corpus schema contract: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
