#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
let schema = null;
try { schema = require('../extension/utils/skopeo-alert-schema.js'); } catch (_error) {}

if (process.env.SKOPEO_ALERT_EXPECT_FOUNDATION_RED === '1') {
  assert.equal(schema, null, 'controlled RED requires the alert schema to be absent');
  console.log('skopeo alert foundation schema: RED');
  process.exit(0);
}

assert.ok(schema && Object.isFrozen(schema), 'production alert schema loads as a frozen API');

const partition = {
  partitionKey: 'scpk1:7:acct-017:root-01',
  accountPermissionId: 'acct-01',
  corpusRootFileId: 'root-01'
};
const binding = {
  version: 'skopeo-alert-owner-binding/1',
  partition,
  ownerStableRecordId: `sri1:${'1'.repeat(64)}`,
  ownerRelationStableId: `srl1:${'2'.repeat(64)}`,
  ownerSourceFileId: 'agreement-file-01',
  ownerSourceRevision: 'revision-01',
  ownerLabel: 'Morgan Rivera',
  mappedAt: 1787821200000
};

assert.deepEqual(JSON.parse(JSON.stringify(schema.parsePartition(partition))), partition);
const parsedBinding = schema.parseOwnerBinding(binding);
assert.ok(parsedBinding && Object.isFrozen(parsedBinding) && Object.isFrozen(parsedBinding.partition));
assert.equal(schema.parseOwnerBinding({ ...binding, ownerEmail: 'morgan@example.test' }), null,
  'email is not an owner-mapping authority field');
assert.equal(schema.parseOwnerBinding({ ...binding, ownerLabel: '<img src=x onerror=alert(1)>' }), null,
  'markup-shaped hostile labels fail closed');

const candidate = {
  version: 'skopeo-alert-candidate/1',
  alertKey: `sa1:${'3'.repeat(64)}`,
  partition,
  agreementStableId: `sri1:${'4'.repeat(64)}`,
  familyId: `stf1:${'5'.repeat(64)}`,
  vendorLabel: 'Acme Systems',
  owner: {
    stableRecordId: binding.ownerStableRecordId,
    stableRelationId: binding.ownerRelationStableId,
    sourceFileId: binding.ownerSourceFileId,
    sourceRevision: binding.ownerSourceRevision,
    label: binding.ownerLabel
  },
  deadline: {
    derivationId: `std1:${'6'.repeat(64)}`,
    deadlineCivilDate: '2027-05-31',
    alertCivilDate: '2027-03-02',
    timezone: 'America/Chicago',
    consequence: 'Agreement renews automatically.'
  },
  evidence: {
    citationId: `stc1:${'7'.repeat(64)}`,
    sourceFileId: 'agreement-file-01',
    sourceRevision: 'revision-01',
    contentFingerprint: `sha256:${'8'.repeat(64)}`,
    label: 'Master Services Agreement · Notice clause'
  },
  sourceFileIds: ['agreement-file-01'],
  sourceSetDigest: `sha256:${'9'.repeat(64)}`,
  revisionDigest: `sha256:${'a'.repeat(64)}`,
  accessDigest: `sha256:${'b'.repeat(64)}`,
  truthGenerationId: `stp1:${'c'.repeat(64)}`,
  evaluationContextDigest: `sha256:${'d'.repeat(64)}`
};
const parsedCandidate = schema.parseCandidate(candidate);
assert.ok(parsedCandidate && Object.isFrozen(parsedCandidate));
assert.deepEqual(parsedCandidate.sourceFileIds, Object.freeze(['agreement-file-01']));
assert.equal(schema.parseCandidate({ ...candidate, rawUrl: 'https://drive.google.com/file/d/private' }), null);
assert.equal(schema.parseCandidate({ ...candidate, sourceFileIds: [] }), null);

const entry = {
  version: 'skopeo-alert-entry/1',
  candidate,
  state: 'scheduled',
  reason: null,
  scheduledFor: 1803999600000,
  scheduledAt: 1787821200000,
  attemptedAt: null,
  deliveredAt: null,
  updatedAt: 1787821200000,
  attemptCount: 0
};
assert.ok(schema.parseEntry(entry));
assert.equal(schema.parseEntry({ ...entry, state: 'delivered' }), null,
  'delivered requires attempted/delivered timestamps and a positive attempt count');

const publicStatus = {
  version: 'skopeo-alert-public-status/1',
  state: 'scheduled',
  summary: 'Local alert scheduled',
  detail: 'For March 2, 2027 · 90 days before the governing notice deadline.',
  deadlineCivilDate: '2027-05-31',
  alertCivilDate: '2027-03-02',
  action: null
};
assert.ok(schema.parsePublicStatus(publicStatus));
assert.equal(schema.parsePublicStatus({ ...publicStatus, alertKey: candidate.alertKey }), null,
  'public status cannot admit a private alert key');

console.log('skopeo alert schema contract: PASS');
