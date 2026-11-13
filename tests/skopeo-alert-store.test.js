#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
let schema = null;
let storeModule = null;
try { schema = require('../extension/utils/skopeo-alert-schema.js'); } catch (_error) {}
try { storeModule = require('../extension/utils/skopeo-alert-store.js'); } catch (_error) {}

if (process.env.SKOPEO_ALERT_EXPECT_FOUNDATION_RED === '1') {
  assert.equal(storeModule, null, 'controlled RED requires the alert store to be absent');
  console.log('skopeo alert foundation store: RED');
  process.exit(0);
}

function storageHarness() {
  const values = Object.create(null);
  let failRead = false;
  return {
    values,
    setFailRead(value) { failRead = value; },
    area: {
      async get(keys) {
        if (failRead) throw new Error('read unavailable');
        const output = Object.create(null);
        for (const key of keys) if (Object.hasOwn(values, key)) output[key] = values[key];
        return output;
      },
      async set(update) { Object.assign(values, update); },
      async remove(keys) { for (const key of keys) delete values[key]; }
    }
  };
}

const partition = {
  partitionKey: 'scpk1:7:acct-017:root-01',
  accountPermissionId: 'acct-01',
  corpusRootFileId: 'root-01'
};
const binding = {
  version: 'skopeo-alert-owner-binding/1', partition,
  ownerStableRecordId: `sri1:${'1'.repeat(64)}`,
  ownerRelationStableId: `srl1:${'2'.repeat(64)}`,
  ownerSourceFileId: 'agreement-file-01',
  ownerSourceRevision: 'revision-01',
  ownerLabel: 'Morgan Rivera', mappedAt: 1787821200000
};
const candidate = {
  version: 'skopeo-alert-candidate/1', alertKey: `sa1:${'3'.repeat(64)}`, partition,
  agreementStableId: `sri1:${'4'.repeat(64)}`, familyId: `stf1:${'5'.repeat(64)}`,
  vendorLabel: 'Acme Systems',
  owner: {
    stableRecordId: binding.ownerStableRecordId, stableRelationId: binding.ownerRelationStableId,
    sourceFileId: binding.ownerSourceFileId, sourceRevision: binding.ownerSourceRevision,
    label: binding.ownerLabel
  },
  deadline: {
    derivationId: `std1:${'6'.repeat(64)}`, deadlineCivilDate: '2027-05-31',
    alertCivilDate: '2027-03-02', timezone: 'America/Chicago',
    consequence: 'Agreement renews automatically.'
  },
  evidence: {
    citationId: `stc1:${'7'.repeat(64)}`, sourceFileId: 'agreement-file-01',
    sourceRevision: 'revision-01', contentFingerprint: `sha256:${'8'.repeat(64)}`,
    label: 'Master Services Agreement · Notice clause'
  },
  sourceFileIds: ['agreement-file-01'], sourceSetDigest: `sha256:${'9'.repeat(64)}`,
  revisionDigest: `sha256:${'a'.repeat(64)}`, accessDigest: `sha256:${'b'.repeat(64)}`,
  truthGenerationId: `stp1:${'c'.repeat(64)}`,
  evaluationContextDigest: `sha256:${'d'.repeat(64)}`
};

(async () => {
  const harness = storageHarness();
  const store = storeModule.create({
    storageArea: harness.area,
    alertSchema: schema,
    now: () => 1787821200000,
    byteLength: (value) => Buffer.byteLength(value)
  });
  assert.ok(store && Object.isFrozen(store));
  assert.deepEqual(await store.recover(), { ok: true });
  assert.deepEqual(await store.bindOwner(binding), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(await store.readOwnerBinding(
    partition, binding.ownerStableRecordId
  ))), binding);

  const scheduled = await store.schedule(candidate, 1803999600000);
  assert.equal(scheduled.ok, true);
  assert.equal(scheduled.entry.state, 'scheduled');
  assert.equal((await store.list(partition)).length, 1);
  assert.equal((await store.transition({
    partition, alertKey: candidate.alertKey, from: 'scheduled', to: 'delivered', reason: null
  })).ok, false, 'store refuses a transition that skips attempted');
  assert.equal((await store.transition({
    partition, alertKey: candidate.alertKey, from: 'scheduled', to: 'attempted', reason: null
  })).ok, true);
  assert.equal((await store.transition({
    partition, alertKey: candidate.alertKey, from: 'attempted', to: 'delivered', reason: null
  })).ok, true);

  harness.setFailRead(true);
  assert.deepEqual(await store.unbindOwner(partition, binding.ownerStableRecordId), { ok: false },
    'transient storage read failure cannot overwrite durable owner state');
  harness.setFailRead(false);
  assert.ok(await store.readOwnerBinding(partition, binding.ownerStableRecordId));

  const bind = store.getPurgeParticipant('alerts');
  assert.equal(typeof bind, 'function');
  assert.equal(store.getPurgeParticipant('alerts'), null, 'participant binder is issued once');
  const capability = Object.freeze({ nonce: 'corpus-owned' });
  const request = { partitionKey: partition.partitionKey, sourceFileId: 'agreement-file-01' };
  const participant = bind((presented, mode, presentedRequest) =>
    presented === capability && presentedRequest === request &&
    ['purge-source', 'verify-source'].includes(mode));
  assert.ok(participant && Object.isFrozen(participant));
  assert.deepEqual(await participant.hasOwnedInfluence(request, capability), { owned: true });
  assert.deepEqual(await participant.purgeSource(request, capability), { ok: true });
  assert.deepEqual(await participant.hasOwnedInfluence(request, capability), { owned: false });
  assert.equal(await store.readOwnerBinding(partition, binding.ownerStableRecordId), null);
  assert.deepEqual(await store.list(partition), []);

  console.log('skopeo alert store contract: PASS');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
