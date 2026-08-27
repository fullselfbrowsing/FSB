'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STORE_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-decision-policy-store.js');
const POLICY_PATH = path.join(ROOT, 'extension', 'utils', 'skopeo-decision-policy.js');
const RED_MARKER = 'skopeo decision policy contract: RED';

if (process.env.SKOPEO_ASK_EXPECT_POLICY_RED === '1') {
  assert.equal(fs.existsSync(STORE_PATH), false,
    'controlled RED is valid only while the policy store is absent');
  assert.equal(fs.existsSync(POLICY_PATH), false,
    'controlled RED is valid only while the policy engine is absent');
  console.log(RED_MARKER);
} else {
  if (!fs.existsSync(STORE_PATH) || !fs.existsSync(POLICY_PATH)) {
    throw new Error('FsbSkopeoDecisionPolicy production interfaces are absent');
  }

  const schema = require(path.join(ROOT, 'extension', 'utils', 'skopeo-ask-schema.js'));

  function clone(value) {
    return structuredClone(value);
  }

  function installChromeStorageStub(initial) {
    const data = new Map(Object.entries(initial || {}));
    globalThis.chrome = {
      runtime: { lastError: null },
      storage: {
        local: {
          async get(keys) {
            const list = Array.isArray(keys) ? keys : [keys];
            const result = {};
            for (const key of list) if (data.has(key)) result[key] = clone(data.get(key));
            return result;
          },
          async set(records) {
            await new Promise((resolve) => setImmediate(resolve));
            for (const key of Object.keys(records)) data.set(key, clone(records[key]));
          }
        }
      }
    };
    return data;
  }

  installChromeStorageStub();
  const Store = require(STORE_PATH);
  const Policy = require(POLICY_PATH);

  function partition(accountKey = 'account:1', corpusKey = 'corpus:1') {
    return { accountKey, corpusKey };
  }

  function input(changes = {}) {
    return Object.assign({
      decisionKind: 'cited-contract-decision',
      authority: {
        accountKey: 'account:1',
        corpusKey: 'corpus:1',
        agreementKey: 'agreement:stable:1',
        sourceSetDigest: 'sha256:sources:1',
        revisionDigest: 'sha256:revisions:1'
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

  function assertDeepFrozen(value, label) {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true, label + ' is frozen');
    if (!Array.isArray(value)) {
      assert.equal(Object.getPrototypeOf(value), null, label + ' has a null prototype');
    }
    for (const key of Object.keys(value)) assertDeepFrozen(value[key], label + '.' + key);
  }

  async function currentAcknowledgement(value) {
    const opened = Policy.openDocument10Review(value);
    assert.ok(opened, 'current Document 10 opens');
    const acknowledgement = Policy.acknowledgeDocument10Review(value, opened);
    assert.ok(acknowledgement, 'current open can be acknowledged');
    return acknowledgement;
  }

  function assertBlocked(result, reason) {
    assert.equal(result.clearance, 'blocked', reason + ' blocks clearance');
    assert.equal(result.reasons.includes(reason), true, reason + ' is typed');
    assert.equal(schema.parsePolicyResult(result).clearance, 'blocked',
      reason + ' cannot parse as cleared');
  }

  function testClosedSurfaces() {
    assert.strictEqual(globalThis.FsbSkopeoDecisionPolicyStore, Store,
      'store classic global and CommonJS export share one object');
    assert.strictEqual(globalThis.FsbSkopeoDecisionPolicy, Policy,
      'policy classic global and CommonJS export share one object');
    assert.equal(Object.isFrozen(Store), true, 'store surface is frozen');
    assert.equal(Object.isFrozen(Policy), true, 'policy surface is frozen');
    assert.equal(Store.STORAGE_KEY, 'fsbSkopeoDecisionPolicy');
    assert.equal(Store.PAYLOAD_VERSION, 1);
    assert.deepEqual(Object.keys(Store).sort(), [
      'PAYLOAD_VERSION', 'STORAGE_KEY', '_reset', 'classifyAgreement',
      'clearDocument10', 'configureDocument10', 'readPartition'
    ].sort(), 'store public surface is exact');
    assert.equal(Policy.VERSION, 'skopeo-decision-policy/1');
    assert.equal(Policy.DECISION_KIND, 'cited-contract-decision');
    assert.deepEqual(Object.keys(Policy).sort(), [
      'DECISION_KIND', 'VERSION', 'acknowledgeDocument10Review',
      'computeDecisionDigest', 'evaluate', 'isApplicable', 'openDocument10Review'
    ].sort(), 'policy public surface is exact');
  }

  async function testPartitionedStableStore() {
    const backing = installChromeStorageStub();
    Store._reset();
    const p1 = partition();
    const p2 = partition('account:2', 'corpus:2');
    const expectedEmpty = Object.create(null);
    expectedEmpty.document10FileKey = null;
    expectedEmpty.agreements = Object.create(null);
    assert.deepEqual(await Store.readPartition(p1), expectedEmpty,
      'empty partition is closed and exact');

    await Store.configureDocument10(p1, 'drive:file:stable-10');
    await Store.classifyAgreement(p1, 'drive:file:agreement-1', 'complex');
    const stored = await Store.readPartition(p1);
    assert.equal(stored.document10FileKey, 'drive:file:stable-10',
      'stable file identity is stored');
    assert.equal(stored.agreements['drive:file:agreement-1'], 'complex',
      'stable agreement identity carries explicit complex classification');
    assertDeepFrozen(stored, 'stored partition');
    const durable = backing.get(Store.STORAGE_KEY);
    assert.deepEqual(Object.keys(durable).sort(), ['partitions', 'v'],
      'durable envelope contains only version and partitioned configuration');
    for (const forbidden of [
      'acknowledgement', 'review', 'question', 'answer', 'provider', 'label',
      'filename', 'actionToken', 'sourceText'
    ]) {
      assert.equal(JSON.stringify(durable).includes(forbidden), false,
        'durable envelope omits ' + forbidden);
    }
    assert.equal((await Store.readPartition(p2)).document10FileKey, null,
      'account/corpus partitions are isolated');

    await Store.configureDocument10(p1, 'drive:file:stable-10');
    assert.equal((await Store.readPartition(p1)).document10FileKey, 'drive:file:stable-10',
      'rename, label, and list position are not store inputs');
    await Store.classifyAgreement(p1, 'drive:file:agreement-1', 'routine');
    assert.equal((await Store.readPartition(p1)).agreements['drive:file:agreement-1'], 'routine',
      'routine classification is explicit stable configuration');
    await Store.clearDocument10(p1);
    assert.equal((await Store.readPartition(p1)).document10FileKey, null,
      'explicit clear removes only Document 10 identity');
  }

  async function testPrototypeMalformedAndConcurrentStore() {
    installChromeStorageStub();
    Store._reset();
    for (const dangerous of ['__proto__', 'constructor', 'prototype']) {
      const p = partition(dangerous, 'corpus:' + dangerous);
      await Store.configureDocument10(p, dangerous);
      await Store.classifyAgreement(p, dangerous, 'complex');
      const read = await Store.readPartition(p);
      assert.equal(read.document10FileKey, dangerous, dangerous + ' stable file key round-trips');
      assert.equal(Object.prototype.hasOwnProperty.call(read.agreements, dangerous), true,
        dangerous + ' agreement is own data');
    }
    assert.equal(({}).complex, undefined, 'prototype is not polluted');

    const backing = installChromeStorageStub({
      [Store.STORAGE_KEY]: { v: 999, partitions: { leaked: { document10FileKey: 'bad' } } }
    });
    Store._reset();
    const closed = await Store.readPartition(partition());
    assert.equal(closed.document10FileKey, null, 'malformed/version-drift storage reads empty');
    assert.equal(backing.has(Store.STORAGE_KEY), true, 'malformed durable data is not silently cleared');

    let accessorReads = 0;
    const accessorEnvelope = {};
    Object.defineProperty(accessorEnvelope, 'v', {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error('stored accessor must not execute');
      }
    });
    accessorEnvelope.partitions = {};
    globalThis.chrome.storage.local.get = async function() {
      return { [Store.STORAGE_KEY]: accessorEnvelope };
    };
    Store._reset();
    assert.equal((await Store.readPartition(partition())).document10FileKey, null,
      'accessor-bearing storage fails closed');
    assert.equal(accessorReads, 0, 'stored accessor is never executed');

    installChromeStorageStub();
    Store._reset();
    const p = partition();
    await Promise.all([
      Store.configureDocument10(p, 'drive:file:10'),
      Store.classifyAgreement(p, 'agreement:a', 'complex'),
      Store.classifyAgreement(p, 'agreement:b', 'routine')
    ]);
    const concurrent = await Store.readPartition(p);
    assert.equal(concurrent.document10FileKey, 'drive:file:10', 'concurrent Document 10 write survives');
    assert.equal(concurrent.agreements['agreement:a'], 'complex', 'concurrent complex write survives');
    assert.equal(concurrent.agreements['agreement:b'], 'routine', 'concurrent routine write survives');
  }

  async function testMutationReadFailureDoesNotOverwritePolicy() {
    const durable = {
      v: Store.PAYLOAD_VERSION,
      partitions: {
        'sdp1:9:account:18:corpus:1': {
          document10FileKey: 'drive:file:stable-10',
          agreements: { 'drive:file:agreement-1': 'complex' }
        }
      }
    };
    const backing = installChromeStorageStub({ [Store.STORAGE_KEY]: durable });
    Store._reset();
    globalThis.chrome.storage.local.get = async function() {
      throw new Error('transient storage read failure');
    };
    assert.equal(await Store.configureDocument10(partition(), 'drive:file:replacement'), false,
      'a transient read failure closes the mutation');
    assert.deepEqual(backing.get(Store.STORAGE_KEY), durable,
      'a transient read failure preserves the complete durable envelope');

    const malformed = { v: 999, partitions: { retained: true } };
    const malformedBacking = installChromeStorageStub({ [Store.STORAGE_KEY]: malformed });
    Store._reset();
    assert.equal(await Store.classifyAgreement(
      partition(), 'drive:file:agreement-2', 'routine'
    ), false, 'a malformed existing envelope closes the mutation');
    assert.deepEqual(malformedBacking.get(Store.STORAGE_KEY), malformed,
      'a malformed existing envelope is never replaced by a partial fresh store');
  }

  async function testApplicabilityOpenAckAndDigestDrift() {
    const base = input();
    const parsedBase = schema.parsePolicyInput(base);
    const expectedDigest = 'sha256:' + crypto.createHash('sha256')
      .update(JSON.stringify(parsedBase), 'utf8').digest('hex');
    assert.equal(Policy.computeDecisionDigest(base), expectedDigest,
      'decision digest is canonical SHA-256');
    assert.equal(Policy.isApplicable(base), true, 'closed local decision kind is applicable');
    const unrelated = input({ decisionKind: 'general-information' });
    assert.equal(Policy.isApplicable(unrelated), false, 'unknown decision kind is not applicable');
    const notApplicable = Policy.evaluate(unrelated, null);
    assert.equal(notApplicable.clearance, 'not-applicable');
    assert.equal(Object.prototype.hasOwnProperty.call(notApplicable, 'memo'), false,
      'not-applicable result omits memo');

    assert.equal(Policy.acknowledgeDocument10Review(base, null), null,
      'acknowledgement cannot precede current open');
    let openReads = 0;
    const hostileOpen = {};
    Object.defineProperty(hostileOpen, 'decisionDigest', {
      enumerable: true,
      get() {
        openReads += 1;
        throw new Error('review accessor must not execute');
      }
    });
    hostileOpen.documentFileKey = 'drive:file:document-10';
    hostileOpen.documentRevisionKey = 'drive:revision:10';
    assert.equal(Policy.acknowledgeDocument10Review(base, hostileOpen), null,
      'accessor-bearing open record fails closed');
    assert.equal(openReads, 0, 'review accessor is never executed');
    const acknowledgement = await currentAcknowledgement(base);
    const cleared = Policy.evaluate(base, acknowledgement);
    assert.equal(cleared.clearance, 'cleared', 'current open and acknowledgement clear routine policy');
    assert.equal(cleared.document10.reviewed, true, 'current review is explicit');
    assert.equal(Object.prototype.hasOwnProperty.call(cleared, 'memo'), false,
      'routine output structurally omits memo');

    const drifts = [
      ['account', (v) => { v.authority.accountKey = 'account:2'; }],
      ['corpus', (v) => { v.authority.corpusKey = 'corpus:2'; }],
      ['agreement', (v) => { v.authority.agreementKey = 'agreement:stable:2'; }],
      ['source set', (v) => { v.authority.sourceSetDigest = 'sha256:sources:2'; }],
      ['revision set', (v) => { v.authority.revisionDigest = 'sha256:revisions:2'; }],
      ['Document 10 identity', (v) => { v.document10.configuredFileKey = 'drive:file:replacement'; }],
      ['Document 10 revision', (v) => { v.document10.currentRevisionKey = 'drive:revision:11'; }]
    ];
    for (const [label, mutate] of drifts) {
      const changed = clone(base);
      mutate(changed);
      assert.notEqual(Policy.computeDecisionDigest(changed), Policy.computeDecisionDigest(base),
        label + ' changes decision digest');
      assertBlocked(Policy.evaluate(changed, acknowledgement), 'document-10-unreviewed');
    }
  }

  async function testDocumentAndConflictBlockers() {
    const base = input();
    const acknowledgement = await currentAcknowledgement(base);
    for (const [state, reason] of [
      ['missing', 'document-10-missing'],
      ['inaccessible', 'document-10-inaccessible'],
      ['stale', 'document-10-stale']
    ]) {
      const changed = input({
        document10: {
          configuredFileKey: 'drive:file:document-10',
          currentRevisionKey: null,
          state
        }
      });
      assert.equal(Policy.openDocument10Review(changed), null,
        state + ' Document 10 cannot mint open proof');
      assertBlocked(Policy.evaluate(changed, acknowledgement), reason);
    }
    assertBlocked(Policy.evaluate(input({ governingConflict: true }), acknowledgement),
      'governing-conflict');
  }

  async function testComplexMemoRulesAndNoAuthoring() {
    const complexOnFile = input({
      classification: 'complex',
      memoProof: { state: 'on-file', complete: true }
    });
    const ack = await currentAcknowledgement(complexOnFile);
    const onFile = Policy.evaluate(complexOnFile, ack);
    assert.equal(onFile.clearance, 'cleared', 'current human memo satisfies complex safeguard');
    assert.deepEqual({ ...onFile.memo }, { state: 'on-file', satisfied: true });

    for (const [memoProof, reason] of [
      [{ state: 'proven-missing', complete: true }, 'memo-missing'],
      [{ state: 'inaccessible', complete: false }, 'memo-inaccessible'],
      [{ state: 'incomplete', complete: false }, 'memo-incomplete']
    ]) {
      const value = input({ classification: 'complex', memoProof });
      const currentAck = await currentAcknowledgement(value);
      assertBlocked(Policy.evaluate(value, currentAck), reason);
    }
    const incompleteMissing = input({
      classification: 'complex',
      memoProof: { state: 'proven-missing', complete: false }
    });
    assert.equal(Policy.evaluate(incompleteMissing, null), null,
      'incomplete evidence cannot report memo missing');

    const combined = input({
      classification: 'complex',
      memoProof: { state: 'proven-missing', complete: true },
      document10: {
        configuredFileKey: 'drive:file:document-10',
        currentRevisionKey: null,
        state: 'inaccessible'
      }
    });
    const result = Policy.evaluate(combined, null);
    assert.equal(result.clearance, 'blocked');
    assert.equal(result.reasons.includes('document-10-inaccessible'), true);
    assert.equal(result.reasons.includes('memo-missing'), true,
      'all current blockers remain visible without hiding informational state');

    const source = fs.readFileSync(POLICY_PATH, 'utf8') + fs.readFileSync(STORE_PATH, 'utf8');
    assert.equal(/draftMemo|generateMemo|authorMemo|synthesizeMemo|memoText/.test(source), false,
      'policy modules expose no memo authoring path');
  }

  async function main() {
    testClosedSurfaces();
    await testPartitionedStableStore();
    await testPrototypeMalformedAndConcurrentStore();
    await testMutationReadFailureDoesNotOverwritePolicy();
    await testApplicabilityOpenAckAndDigestDrift();
    await testDocumentAndConflictBlockers();
    await testComplexMemoRulesAndNoAuthoring();
    console.log('skopeo decision policy contract: PASS');
  }

  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
