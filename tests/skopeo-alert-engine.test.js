#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
let schema = null;
let engineModule = null;
try { schema = require('../extension/utils/skopeo-alert-schema.js'); } catch (_error) {}
try { engineModule = require('../extension/utils/skopeo-alert-engine.js'); } catch (_error) {}

if (process.env.SKOPEO_ALERT_EXPECT_FOUNDATION_RED === '1') {
  assert.equal(engineModule, null, 'controlled RED requires the alert engine to be absent');
  console.log('skopeo alert foundation engine: RED');
  process.exit(0);
}

const deadlineEngine = require('../extension/utils/skopeo-deadline-engine.js');
const digest = async (value) => {
  const text = JSON.stringify(value);
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
};
const engine = engineModule.create({ alertSchema: schema, deadlineEngine, digest });
assert.ok(engine && Object.isFrozen(engine));

const partition = {
  partitionKey: 'scpk1:7:acct-017:root-01',
  accountPermissionId: 'acct-01',
  corpusRootFileId: 'root-01'
};
const owner = {
  stableRecordId: `sri1:${'1'.repeat(64)}`,
  stableRelationId: `srl1:${'2'.repeat(64)}`,
  sourceFileId: 'agreement-file-01',
  sourceRevision: 'revision-01',
  label: 'Morgan Rivera'
};
const mapping = {
  version: 'skopeo-alert-owner-binding/1', partition,
  ownerStableRecordId: owner.stableRecordId,
  ownerRelationStableId: owner.stableRelationId,
  ownerSourceFileId: owner.sourceFileId,
  ownerSourceRevision: owner.sourceRevision,
  ownerLabel: owner.label,
  mappedAt: 1787821200000
};
const input = {
  partition,
  complete: true,
  agreementStableId: `sri1:${'4'.repeat(64)}`,
  familyId: `stf1:${'5'.repeat(64)}`,
  vendorLabel: 'Acme Systems',
  owner,
  mapping,
  deadlineResult: {
    type: 'notice-deadline',
    derivationId: `std1:${'6'.repeat(64)}`,
    deadlineCivilDate: '2027-05-31',
    timezone: 'America/Chicago',
    consequence: 'Agreement renews automatically.',
    eligibility: 'eligible',
    inputsCurrent: true,
    inputsExact: true,
    blockerCodes: [],
    citationIds: [`stc1:${'7'.repeat(64)}`]
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

(async () => {
  const eligible = await engine.derive(input);
  assert.equal(eligible.disposition, 'eligible');
  assert.equal(eligible.candidate.deadline.deadlineCivilDate, '2027-05-31');
  assert.equal(eligible.candidate.deadline.alertCivilDate, '2027-03-02',
    'alert date is exactly 90 civil days before the governing notice deadline');
  assert.match(eligible.candidate.alertKey, /^sa1:[0-9a-f]{64}$/);

  const absent = await engine.derive({ ...input, mapping: null });
  assert.equal(absent.disposition, 'not-locally-deliverable');
  assert.equal(absent.publicStatus.state, 'not-locally-deliverable');

  const sameLabelWrongIdentity = await engine.derive({
    ...input,
    mapping: { ...mapping, ownerStableRecordId: `sri1:${'e'.repeat(64)}` }
  });
  assert.equal(sameLabelWrongIdentity.disposition, 'not-locally-deliverable');

  for (const type of ['renewal-date', 'expiration-date', 'termination-date']) {
    const result = await engine.derive({
      ...input, deadlineResult: { ...input.deadlineResult, type }
    });
    assert.equal(result.disposition, 'ineligible', `${type} never schedules the notice alert`);
  }
  const ambiguous = await engine.derive({
    ...input,
    deadlineResult: {
      ...input.deadlineResult,
      eligibility: 'ineligible', inputsExact: false, blockerCodes: ['fact-conflict']
    }
  });
  assert.equal(ambiguous.disposition, 'ineligible');

  assert.equal(engine.canTransition('scheduled', 'attempted'), true);
  assert.equal(engine.canTransition('attempted', 'delivered'), true);
  assert.equal(engine.canTransition('scheduled', 'delivered'), false);
  assert.equal(engine.canTransition('missed', 'scheduled'), false);

  const publicStatus = engine.publicStatus({
    version: 'skopeo-alert-entry/1', candidate: eligible.candidate,
    state: 'scheduled', reason: null, scheduledFor: 1803999600000,
    scheduledAt: 1787821200000, attemptedAt: null, deliveredAt: null,
    updatedAt: 1787821200000, attemptCount: 0
  });
  assert.ok(schema.parsePublicStatus(publicStatus));
  assert.equal(JSON.stringify(publicStatus).includes(eligible.candidate.alertKey), false);

  console.log('skopeo alert engine contract: PASS');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
