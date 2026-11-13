#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

const ROOT = path.join(__dirname, '..');
const RUNTIME_SOURCE = fs.readFileSync(
  path.join(ROOT, 'extension/utils/skopeo-alert-runtime.js'), 'utf8');

// The notification copy the runtime sends through localize, read from source.
function notificationCopy() {
  const entries = new Map();
  const pattern = /key: '(copy_[0-9a-f]{10})', english: '([^']+)'/g;
  let match;
  while ((match = pattern.exec(RUNTIME_SOURCE)) !== null) entries.set(match[2], match[1]);
  return entries;
}

// A fresh ui-locale instance with the shipped catalogs. Notification keys the
// catalogs do not carry yet get probe messages, so the case proves the path.
function freshUiLocale(probes) {
  const sandbox = { module: undefined, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'extension/utils/ui-locale.js'), 'utf8'), sandbox);
  const locale = sandbox.fsbUiLocale;
  const catalogs = Object.create(null);
  for (const code of locale.PUBLIC_LOCALES) {
    const json = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'extension/_locales', locale.folderFor(code), 'messages.json'), 'utf8'));
    const messages = locale.parseMessages(json);
    for (const [key, message] of Object.entries(probes[code] || {})) {
      if (!Object.hasOwn(messages, key)) messages[key] = message;
    }
    locale.setCatalog(code, messages);
    catalogs[code] = messages;
  }
  return { locale, catalogs };
}

async function deliverNotification(candidateValue, extra) {
  let now = Date.UTC(2027, 1, 1, 12);
  const store = storeModule.create({
    storageArea: storageArea(), alertSchema: schema, now: () => now,
    byteLength: (value) => Buffer.byteLength(value)
  });
  const alarms = alarmHarness();
  const notifications = notificationHarness();
  const runtime = runtimeModule.create(Object.assign({
    alertSchema: schema, store, alarms: alarms.api, notifications: notifications.api,
    now: () => now, IntlDateTimeFormat: Intl.DateTimeFormat,
    iconUrl: 'chrome-extension://fixture/assets/icon128.png',
    revalidate: async () => ({ status: 'current', candidate: candidateValue }),
    openEvidence: async () => true
  }, extra));
  assert.ok(runtime && Object.isFrozen(runtime));
  assert.equal((await runtime.consider(candidateValue)).status, 'scheduled');
  now = Date.UTC(2027, 2, 2, 16);
  assert.equal(await runtime.handleAlarm({
    name: runtime.alarmName(candidateValue.alertKey), scheduledTime: now
  }), true);
  assert.equal(notifications.calls.create.length, 1);
  return notifications.calls.create[0].options;
}

async function localizedNotificationCases() {
  const copyKeys = notificationCopy();
  assert.deepEqual([...copyKeys.keys()], [
    '$VENDOR$ · notice deadline',
    'Owner: $OWNER$ · Governing evidence: $EVIDENCE$',
    '$DOCUMENT$ · Notice evidence',
    'Open governing evidence'
  ], 'the runtime sends exactly the four notification strings through localize');
  const english = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extension/_locales/en/messages.json'), 'utf8'));
  for (const [text, key] of copyKeys) {
    assert.equal(key, 'copy_' + crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 10),
      `${key} follows the catalog key formula for ${JSON.stringify(text)}`);
    if (Object.hasOwn(english, key)) {
      assert.equal(english[key].message, text, `the en catalog message for ${key} is its English source`);
    }
  }
  const keyOf = (text) => copyKeys.get(text);
  const { locale, catalogs } = freshUiLocale({
    ja: {
      [keyOf('$VENDOR$ · notice deadline')]: '$VENDOR$ · 通知期限',
      [keyOf('Owner: $OWNER$ · Governing evidence: $EVIDENCE$')]: '担当者: $OWNER$ · 根拠となる証拠: $EVIDENCE$',
      [keyOf('$DOCUMENT$ · Notice evidence')]: '$DOCUMENT$ · 通知の証拠',
      [keyOf('Open governing evidence')]: '根拠となる証拠を開く'
    }
  });
  locale.setOverride('ja');
  const ja = (text) => catalogs.ja[keyOf(text)];
  const localizeCalls = [];
  const localize = (key, englishText, subs) => {
    localizeCalls.push({ key, english: englishText, subs });
    return locale.text(key, englishText, subs);
  };

  const raw = candidate('f');
  const noticeEvidence = schema.parseCandidate(Object.assign({}, raw, {
    evidence: Object.assign({}, raw.evidence, { label: 'Master Services Agreement · Notice evidence' })
  }));
  assert.ok(noticeEvidence, 'the fixture with the background evidence label parses');
  const options = await deliverNotification(noticeEvidence, { localize });
  const fill = (template, subs) => template.replace(/\$([A-Z]+)\$/g, (_all, name) => subs[name]);
  assert.deepEqual(options, {
    type: 'basic',
    iconUrl: 'chrome-extension://fixture/assets/icon128.png',
    title: fill(ja('$VENDOR$ · notice deadline'), { VENDOR: 'Acme Systems' }),
    message: '2027-05-31 · Agreement renews automatically.',
    contextMessage: fill(ja('Owner: $OWNER$ · Governing evidence: $EVIDENCE$'), {
      OWNER: 'Morgan Rivera',
      EVIDENCE: fill(ja('$DOCUMENT$ · Notice evidence'), { DOCUMENT: 'Master Services Agreement' })
    }),
    buttons: [{ title: ja('Open governing evidence') }],
    priority: 1
  });
  assert.notEqual(options.title, 'Acme Systems · notice deadline', 'the title is translated');
  assert.ok(options.title.includes('Acme Systems'), 'the vendor name is sent as given');
  assert.ok(options.contextMessage.includes('Morgan Rivera') &&
    options.contextMessage.includes('Master Services Agreement'), 'the owner and document names are sent as given');
  assert.ok(!options.contextMessage.includes('Owner:') && !options.contextMessage.includes('Notice evidence'),
    'the owner and evidence labels are translated');
  assert.notEqual(options.buttons[0].title, 'Open governing evidence', 'the button is translated');
  assert.ok(localizeCalls.every((call) => copyKeys.get(call.english) === call.key),
    'every localize call pairs a key with its own English template');
  assert.ok(localizeCalls.every((call) => call.subs === null || Object.values(call.subs)
    .every((value) => typeof value === 'string')), 'substitutions reach localize as plain strings');

  // A citation label the background did not build is document text as a whole.
  const otherEvidence = await deliverNotification(candidate('f'), { localize });
  assert.equal(otherEvidence.contextMessage, fill(ja('Owner: $OWNER$ · Governing evidence: $EVIDENCE$'), {
    OWNER: 'Morgan Rivera', EVIDENCE: 'Master Services Agreement · Notice clause'
  }));

  // English stays byte-identical when localize is present but has no catalog
  // message, gives no usable string, or throws.
  locale.setOverride('en');
  const englishOptions = {
    title: 'Acme Systems · notice deadline',
    contextMessage: 'Owner: Morgan Rivera · Governing evidence: Master Services Agreement · Notice evidence',
    buttons: [{ title: 'Open governing evidence' }]
  };
  for (const fallback of [
    localize,
    () => null,
    () => '',
    () => 42,
    () => { throw new Error('locale unavailable'); }
  ]) {
    const sent = await deliverNotification(noticeEvidence, { localize: fallback });
    assert.equal(sent.title, englishOptions.title);
    assert.equal(sent.message, '2027-05-31 · Agreement renews automatically.');
    assert.equal(sent.contextMessage, englishOptions.contextMessage);
    assert.deepEqual(sent.buttons, englishOptions.buttons);
  }

  // The optional dependency must be a function when it is present.
  const base = {
    alertSchema: schema,
    store: storeModule.create({
      storageArea: storageArea(), alertSchema: schema, now: () => 0,
      byteLength: (value) => Buffer.byteLength(value)
    }),
    alarms: alarmHarness().api, notifications: notificationHarness().api, now: () => 0,
    IntlDateTimeFormat: Intl.DateTimeFormat, iconUrl: 'chrome-extension://fixture/assets/icon128.png',
    revalidate: async () => null, openEvidence: async () => true
  };
  assert.equal(runtimeModule.create(Object.assign({}, base, { localize: 'ja' })), null);
  assert.equal(runtimeModule.create(Object.assign({}, base, { localize: undefined })), null);
  assert.equal(runtimeModule.create(Object.assign({}, base, { translate: () => null })), null);
  assert.ok(Object.isFrozen(runtimeModule.create(Object.assign({}, base, { localize: () => null }))));
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

  await localizedNotificationCases();

  console.log('skopeo alert runtime contract: PASS');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
