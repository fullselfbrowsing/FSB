#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
let runtimeModule = null;
try { runtimeModule = require('../extension/utils/skopeo-alert-runtime.js'); } catch (_error) {}

if (process.env.SKOPEO_ALERT_EXPECT_RUNTIME_RED === '1') {
  assert.equal(runtimeModule, null, 'controlled RED requires the alert runtime to be absent');
  console.log('skopeo alert runtime: RED');
  process.exit(0);
}

const schema = require('../extension/utils/skopeo-alert-schema.js');
const storeModule = require('../extension/utils/skopeo-alert-store.js');

function storageArea() {
  const values = Object.create(null);
  return {
    async get(keys) {
      const output = Object.create(null);
      for (const key of keys) if (Object.hasOwn(values, key)) output[key] = values[key];
      return output;
    },
    async set(update) { Object.assign(values, update); },
    async remove(keys) { for (const key of keys) delete values[key]; }
  };
}

function candidate(suffix = '3') {
  const partition = {
    partitionKey: 'scpk1:7:acct-017:root-01',
    accountPermissionId: 'acct-01', corpusRootFileId: 'root-01'
  };
  return schema.parseCandidate({
    version: schema.CANDIDATE_VERSION, alertKey: `sa1:${suffix.repeat(64)}`, partition,
    agreementStableId: `sri1:${'4'.repeat(64)}`, familyId: `stf1:${'5'.repeat(64)}`,
    vendorLabel: 'Acme Systems',
    owner: {
      stableRecordId: `sri1:${'1'.repeat(64)}`, stableRelationId: `srl1:${'2'.repeat(64)}`,
      sourceFileId: 'agreement-file-01', sourceRevision: 'revision-01', label: 'Morgan Rivera'
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
  });
}

function alarmHarness() {
  const alarms = new Map();
  const calls = { create: [], clear: [] };
  return {
    alarms, calls,
    api: {
      async get(name) { return alarms.get(name); },
      async getAll() { return [...alarms.values()]; },
      async create(name, info) {
        calls.create.push({ name, info });
        alarms.set(name, { name, scheduledTime: info.when });
      },
      async clear(name) { calls.clear.push(name); return alarms.delete(name); }
    }
  };
}

function notificationHarness() {
  const calls = { create: [], clear: [] };
  let permission = 'granted';
  let fail = false;
  return {
    calls,
    setPermission(value) { permission = value; },
    setFail(value) { fail = value; },
    api: {
      async getPermissionLevel() { return permission; },
      async create(id, options) {
        calls.create.push({ id, options });
        if (fail) throw new Error('native notification unavailable');
        return id;
      },
      async clear(id) { calls.clear.push(id); return true; }
    }
  };
}

(async () => {
  const scheduled = runtimeModule.resolveScheduledTime(
    '2027-03-02', 'America/Chicago', Intl.DateTimeFormat);
  assert.equal(scheduled, Date.UTC(2027, 2, 2, 15, 0, 0),
    '09:00 America/Chicago resolves without host-locale parsing');
  assert.equal(runtimeModule.civilDateAt(
    Date.UTC(2027, 2, 3, 5, 59), 'America/Chicago', Intl.DateTimeFormat), '2027-03-02');

  let nowValue = Date.UTC(2027, 1, 1, 12);
  let currentCandidate = candidate();
  let revalidateStatus = 'current';
  let opened = 0;
  const store = storeModule.create({
    storageArea: storageArea(), alertSchema: schema, now: () => nowValue,
    byteLength: (value) => Buffer.byteLength(value)
  });
  const alarms = alarmHarness();
  const notifications = notificationHarness();
  const runtime = runtimeModule.create({
    alertSchema: schema,
    store,
    alarms: alarms.api,
    notifications: notifications.api,
    now: () => nowValue,
    IntlDateTimeFormat: Intl.DateTimeFormat,
    iconUrl: 'chrome-extension://fixture/assets/icon128.png',
    revalidate: async (alert) => revalidateStatus === 'current'
      ? { status: 'current', candidate: currentCandidate }
      : { status: revalidateStatus, candidate: null },
    openEvidence: async () => { opened += 1; return true; }
  });
  assert.ok(runtime && Object.isFrozen(runtime));

  const considered = await runtime.consider(currentCandidate);
  assert.equal(considered.status, 'scheduled');
  assert.equal(alarms.calls.create.length, 1);
  assert.equal((await store.listAll()).length, 1);
  await runtime.consider(currentCandidate);
  assert.equal(alarms.calls.create.length, 1, 'identical reconcile preserves the exact alarm');

  alarms.alarms.set('skopeoAlert:orphan', {
    name: 'skopeoAlert:orphan', scheduledTime: Date.UTC(2027, 1, 2)
  });
  await runtime.reconcile();
  assert.equal(alarms.alarms.has('skopeoAlert:orphan'), false, 'orphan prefixed alarm is cleared');

  nowValue = Date.UTC(2027, 2, 2, 16);
  const alarmName = runtime.alarmName(currentCandidate.alertKey);
  assert.equal(await runtime.handleAlarm({ name: alarmName, scheduledTime: scheduled }), true);
  const delivered = await store.getByAlertKey(currentCandidate.alertKey);
  assert.equal(delivered.state, 'delivered');
  assert.equal(delivered.attemptCount, 1);
  assert.equal(notifications.calls.create.length, 1);
  assert.deepEqual(notifications.calls.create[0].options, {
    type: 'basic',
    iconUrl: 'chrome-extension://fixture/assets/icon128.png',
    title: 'Acme Systems · notice deadline',
    message: '2027-05-31 · Agreement renews automatically.',
    contextMessage: 'Owner: Morgan Rivera · Governing evidence: Master Services Agreement · Notice clause',
    buttons: [{ title: 'Open governing evidence' }],
    priority: 1
  });
  assert.equal(await runtime.handleAlarm({ name: alarmName, scheduledTime: scheduled }), false);
  assert.equal(notifications.calls.create.length, 1, 'duplicate alarm produces no duplicate notification');

  const notificationId = runtime.notificationId(currentCandidate.alertKey);
  assert.equal(await runtime.handleNotificationClick(notificationId), true);
  assert.equal(opened, 1);
  revalidateStatus = 'closed';
  assert.equal(await runtime.handleNotificationClick(notificationId), false);
  assert.equal(opened, 1, 'stale notification click performs no evidence effect');

  // An interrupted attempted state is never promoted to delivered on wake.
  nowValue = Date.UTC(2027, 1, 1, 12);
  currentCandidate = candidate('e');
  revalidateStatus = 'current';
  await runtime.consider(currentCandidate);
  await store.transition({
    partition: currentCandidate.partition, alertKey: currentCandidate.alertKey,
    from: 'scheduled', to: 'attempted', reason: null
  });
  await runtime.reconcile();
  assert.equal((await store.getByAlertKey(currentCandidate.alertKey)).state, 'failed');
  assert.equal((await store.getByAlertKey(currentCandidate.alertKey)).reason, 'attempt-interrupted');

  // Cross-day wake records missed and creates no notification.
  const lateStore = storeModule.create({
    storageArea: storageArea(), alertSchema: schema, now: () => nowValue,
    byteLength: (value) => Buffer.byteLength(value)
  });
  const lateAlarms = alarmHarness();
  const lateNotifications = notificationHarness();
  const lateRuntime = runtimeModule.create({
    alertSchema: schema, store: lateStore, alarms: lateAlarms.api,
    notifications: lateNotifications.api, now: () => nowValue,
    IntlDateTimeFormat: Intl.DateTimeFormat,
    iconUrl: 'chrome-extension://fixture/assets/icon128.png',
    revalidate: async () => ({ status: 'current', candidate: candidate() }),
    openEvidence: async () => true
  });
  await lateRuntime.consider(candidate());
  nowValue = Date.UTC(2027, 2, 3, 18);
  await lateRuntime.handleAlarm({ name: lateRuntime.alarmName(candidate().alertKey), scheduledTime: scheduled });
  assert.equal((await lateStore.getByAlertKey(candidate().alertKey)).state, 'missed');
  assert.equal(lateNotifications.calls.create.length, 0);

  console.log('skopeo alert runtime contract: PASS');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
