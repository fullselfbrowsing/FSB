#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'skopeo-release-evals');
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'manifest.json');
const CASES_PATH = path.join(FIXTURE_ROOT, 'cases.json');
const UAT_PATH = path.join(
  ROOT, '.planning', 'phases', '59-current-user-alerts-release-hardening', '59-HUMAN-UAT.md'
);
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const RED_MARKER = 'skopeo release aggregate: RED';

const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
if (process.env.SKOPEO_RELEASE_EXPECT_RED === '1') {
  assert.strictEqual(packageJson.scripts['test:skopeo-release-evals'], undefined,
    'controlled RED requires the release aggregate registration to be absent');
  assert.strictEqual(
    packageJson.scripts.test.includes('npm run test:skopeo-release-evals'), false,
    'controlled RED requires the normal test order to omit the release aggregate'
  );
  console.log(RED_MARKER);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
const AlertSchema = require('../extension/utils/skopeo-alert-schema.js');
const AlertEngineModule = require('../extension/utils/skopeo-alert-engine.js');
const AlertStoreModule = require('../extension/utils/skopeo-alert-store.js');
const AlertRuntimeModule = require('../extension/utils/skopeo-alert-runtime.js');
const DeadlineEngine = require('../extension/utils/skopeo-deadline-engine.js');
const TruthSchema = require('../extension/utils/skopeo-truth-schema.js');
const HudSchema = require('../extension/utils/skopeo-hud-schema.js');
const HudProjector = require('../extension/utils/skopeo-hud-projector.js');
const Composer = require('../extension/content/skopeo-adaptive-composer.js');

const CASE_KEYS = Object.freeze([
  'id', 'category', 'scenario', 'fixture', 'requirements', 'threats', 'oracle', 'expected'
]);
const EXPECTED_KEYS = Object.freeze([
  'disposition', 'sourcePaths', 'sourceRoles', 'governingPath', 'effectiveCivilDate',
  'noticeDeadlineCivilDate', 'alertCivilDate', 'noticeDays', 'deliveryMethod',
  'writtenNoticeAddress', 'consequence', 'ownerMapping', 'alertState', 'document10',
  'memo', 'forbiddenDisclosures', 'unsupported'
]);
const RELEASE_SCRIPT = [
  'node tests/skopeo-alert-schema.test.js',
  'node tests/skopeo-alert-store.test.js',
  'node tests/skopeo-alert-engine.test.js',
  'node tests/skopeo-alert-runtime.test.js',
  'node tests/skopeo-release-evals.test.js'
].join(' && ');

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} is an object`);
  assert.deepStrictEqual(Object.keys(value).sort(), expected.slice().sort(), `${label} has exact keys`);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function provisionalOracleDigest() {
  return crypto.createHash('sha256').update(canonical(cases.map(item => ({
    id: item.id,
    expected: item.expected
  })))).digest('hex');
}

function verifyManifestAndCoverage() {
  assert.strictEqual(manifest.version, 'skopeo-release-evals/v1');
  assert.strictEqual(manifest.fixture_policy, 'synthetic-or-irreversibly-redacted');
  assert.strictEqual(manifest.network_allowed, false);
  assert.strictEqual(manifest.llm_judge_allowed, false);
  assert.strictEqual(manifest.configured_provider_run_allowed, false);
  assert.strictEqual(manifest.provisional_results_are_gold, false);
  assert.strictEqual(manifest.live_approved, false);
  for (const key of [
    'legal_domain_approval', 'authorized_live_drive_docs_pdf',
    'native_notification_approval', 'human_accessibility_approval'
  ]) assert.strictEqual(manifest[key], 'human_needed');
  assert.deepStrictEqual(cases.map(item => item.id), manifest.ordered_case_ids);
  assert.strictEqual(new Set(manifest.ordered_case_ids).size, cases.length);
  assert.deepStrictEqual(manifest.category_counts, { gold: 12, security: 10, lifecycle: 6 });
  const counts = { gold: 0, security: 0, lifecycle: 0 };
  const coveredRequirements = new Set();
  const coveredThreats = new Set();
  for (const item of cases) {
    exactKeys(item, CASE_KEYS, item.id);
    exactKeys(item.expected, EXPECTED_KEYS, item.id + ' expected');
    assert.match(item.id, /^(?:G(?:0[1-9]|1[0-2])|S(?:0[1-9]|10)|L0[1-6])$/);
    assert.ok(item.scenario.length >= 40);
    assert.ok(['gold', 'security', 'lifecycle'].includes(item.category));
    counts[item.category] += 1;
    assert.ok(Array.isArray(item.requirements) && item.requirements.length > 0);
    assert.ok(Array.isArray(item.threats) && item.threats.length > 0);
    item.requirements.forEach(value => coveredRequirements.add(value));
    item.threats.forEach(value => coveredThreats.add(value));
    for (const key of ['sourcePaths', 'sourceRoles', 'governingPath', 'forbiddenDisclosures', 'unsupported']) {
      assert.ok(Array.isArray(item.expected[key]), `${item.id} ${key} is explicit`);
    }
    assert.strictEqual(new Set(item.expected.sourcePaths).size, item.expected.sourcePaths.length);
    assert.strictEqual(new Set(item.expected.forbiddenDisclosures).size,
      item.expected.forbiddenDisclosures.length);
    if (item.expected.noticeDeadlineCivilDate !== null) {
      assert.match(item.expected.noticeDeadlineCivilDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(item.expected.alertCivilDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.strictEqual(item.expected.noticeDays, 90);
      const ordinal = DeadlineEngine.toOrdinal(
        DeadlineEngine.parseCivilDate(item.expected.noticeDeadlineCivilDate)
      );
      assert.strictEqual(
        DeadlineEngine.fromOrdinal(ordinal - 90).value,
        item.expected.alertCivilDate,
        `${item.id} alert date is exactly 90 civil days before its pinned notice deadline`
      );
    } else {
      assert.strictEqual(item.expected.alertCivilDate, null);
      assert.strictEqual(item.expected.noticeDays, null);
    }
    if (item.oracle === 'permission-negative') {
      assert.deepStrictEqual(item.expected.sourcePaths, []);
      assert.deepStrictEqual(item.expected.sourceRoles, []);
      assert.deepStrictEqual(item.expected.governingPath, []);
      assert.strictEqual(item.expected.noticeDeadlineCivilDate, null);
      assert.strictEqual(item.expected.ownerMapping, 'not-evaluated');
      assert.ok(item.expected.forbiddenDisclosures.includes('source-existence'));
      assert.ok(item.expected.forbiddenDisclosures.includes('derived-date'));
    }
  }
  assert.deepStrictEqual(counts, manifest.category_counts);
  assert.deepStrictEqual([...coveredRequirements].sort(), manifest.requirements.slice().sort(),
    'every Phase 59 requirement has at least one release case');
  assert.deepStrictEqual([...coveredThreats].sort(), manifest.threats.slice().sort(),
    'every T59 threat has at least one release case');
  assert.strictEqual(manifest.provisional_oracle_sha256, provisionalOracleDigest(),
    'explicit expected values match the pinned provisional oracle');
  for (const relativePath of manifest.production_modules) {
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `${relativePath} exists`);
  }
  assert.deepStrictEqual(manifest.report_lines, [
    'deterministic_gold', 'structural_security', 'lifecycle_browser_provisional',
    'domain_fidelity', 'authorized_live_drive_docs_pdf', 'native_notification',
    'human_accessibility'
  ]);
}

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

function activeAlertInput(gold) {
  const partition = {
    partitionKey: 'scpk1:release:account:corpus',
    accountPermissionId: 'release-account',
    corpusRootFileId: 'release-corpus'
  };
  const owner = {
    stableRecordId: `sri1:${'1'.repeat(64)}`,
    stableRelationId: `srl1:${'2'.repeat(64)}`,
    sourceFileId: 'release-agreement-file',
    sourceRevision: 'release-revision-01',
    label: 'Morgan Rivera'
  };
  const mapping = {
    version: AlertSchema.OWNER_BINDING_VERSION,
    partition,
    ownerStableRecordId: owner.stableRecordId,
    ownerRelationStableId: owner.stableRelationId,
    ownerSourceFileId: owner.sourceFileId,
    ownerSourceRevision: owner.sourceRevision,
    ownerLabel: owner.label,
    mappedAt: 1787821200000
  };
  return {
    partition,
    complete: true,
    agreementStableId: `sri1:${'3'.repeat(64)}`,
    familyId: `stf1:${'4'.repeat(64)}`,
    vendorLabel: 'Acme Systems',
    owner,
    mapping,
    deadlineResult: {
      type: 'notice-deadline',
      derivationId: `std1:${'5'.repeat(64)}`,
      deadlineCivilDate: gold.noticeDeadlineCivilDate,
      timezone: 'America/Chicago',
      consequence: gold.consequence,
      eligibility: 'eligible',
      inputsCurrent: true,
      inputsExact: true,
      blockerCodes: [],
      citationIds: [`stc1:${'6'.repeat(64)}`]
    },
    evidence: {
      citationId: `stc1:${'6'.repeat(64)}`,
      sourceFileId: owner.sourceFileId,
      sourceRevision: owner.sourceRevision,
      contentFingerprint: `sha256:${'7'.repeat(64)}`,
      label: 'Master Services Agreement · Notice clause'
    },
    sourceFileIds: [owner.sourceFileId],
    sourceSetDigest: `sha256:${'8'.repeat(64)}`,
    revisionDigest: `sha256:${'9'.repeat(64)}`,
    accessDigest: `sha256:${'a'.repeat(64)}`,
    truthGenerationId: `stp1:${'b'.repeat(64)}`,
    evaluationContextDigest: `sha256:${'c'.repeat(64)}`
  };
}

function releaseProjection(candidate, publicStatus) {
  return {
    version: 'skopeo-hud-projection/1',
    generation: 59,
    exactOrigin: 'https://docs.google.com',
    profileVersion: 'profile-v59',
    contextEpoch: 4,
    semanticEntityToken: 'docs-document:release-current',
    requestActionToken: 'release-request-current',
    projectionToken: 'release-projection-current',
    mode: 'reading',
    currentness: 'current',
    result: 'complete',
    body: {
      documentLabel: 'Agreement " onclick=alert(1)',
      sourceState: 'ready',
      readingState: 'governing',
      governingAction: { state: 'not-available', actionToken: null },
      facts: [{
        type: 'notice-deadline', value: candidate.deadline.deadlineCivilDate,
        evidenceRole: 'governing', trustState: 'accepted',
        citationLabel: 'Section 12.2', actionToken: null
      }],
      factOverflow: 0,
      gaps: [],
      gapOverflow: 0,
      policyDocument: 'on-file',
      memoRequirement: 'not-evaluated',
      notificationDelivery: {
        ...JSON.parse(JSON.stringify(publicStatus)),
        action: {
          actionId: 'release-remove-mapping-action',
          kind: 'remove-current-owner-mapping',
          label: 'Remove current owner mapping',
          requiresConfirmation: true
        }
      },
      emptyState: 'not-empty'
    }
  };
}

async function verifyProductionAggregate() {
  assert.strictEqual(TruthSchema.VERSION, 'skopeo-truth-schema/1');
  assert.strictEqual(DeadlineEngine.VERSION, 'skopeo-deadline-engine/1');
  assert.strictEqual(AlertSchema.VERSION, 'skopeo-alert-schema/1');
  assert.strictEqual(HudSchema.VERSION, 'skopeo-hud-projection/1');
  assert.strictEqual(HudProjector.VERSION, 'skopeo-hud-projector/1');
  assert.strictEqual(HudProjector.createProjection(null), null,
    'production HUD projector fails closed for absent authority');

  const gold = cases.find(item => item.id === 'G01').expected;
  const engine = AlertEngineModule.create({
    alertSchema: AlertSchema,
    deadlineEngine: DeadlineEngine,
    digest: async value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
  });
  const input = activeAlertInput(gold);
  const eligible = await engine.derive(input);
  assert.strictEqual(eligible.disposition, gold.disposition);
  assert.strictEqual(eligible.candidate.deadline.deadlineCivilDate, gold.noticeDeadlineCivilDate);
  assert.strictEqual(eligible.candidate.deadline.alertCivilDate, gold.alertCivilDate);
  assert.strictEqual(eligible.candidate.deadline.consequence, gold.consequence);
  const wrongOwner = await engine.derive({
    ...input,
    mapping: { ...input.mapping, ownerStableRecordId: `sri1:${'d'.repeat(64)}` }
  });
  assert.strictEqual(wrongOwner.disposition, 'not-locally-deliverable');
  assert.strictEqual(wrongOwner.publicStatus.state, 'not-locally-deliverable');
  for (const type of ['renewal-date', 'expiration-date', 'termination-date']) {
    const ineligible = await engine.derive({
      ...input,
      deadlineResult: { ...input.deadlineResult, type }
    });
    assert.strictEqual(ineligible.disposition, 'ineligible', `${type} never schedules`);
  }

  let nowValue = Date.UTC(2027, 1, 1, 12);
  const store = AlertStoreModule.create({
    storageArea: storageArea(), alertSchema: AlertSchema, now: () => nowValue,
    byteLength: value => Buffer.byteLength(value)
  });
  assert.deepStrictEqual(await store.recover(), { ok: true });
  assert.deepStrictEqual(await store.bindOwner(input.mapping), { ok: true });
  const alarms = new Map();
  const alarmCreates = [];
  const notificationCreates = [];
  const runtime = AlertRuntimeModule.create({
    alertSchema: AlertSchema,
    store,
    alarms: {
      async get(name) { return alarms.get(name); },
      async getAll() { return [...alarms.values()]; },
      async create(name, options) {
        alarmCreates.push({ name, options });
        alarms.set(name, { name, scheduledTime: options.when });
      },
      async clear(name) { return alarms.delete(name); }
    },
    notifications: {
      async getPermissionLevel() { return 'granted'; },
      async create(id, options) { notificationCreates.push({ id, options }); return id; },
      async clear() { return true; }
    },
    now: () => nowValue,
    IntlDateTimeFormat: Intl.DateTimeFormat,
    iconUrl: 'chrome-extension://release/assets/icon128.png',
    revalidate: async () => ({ status: 'current', candidate: eligible.candidate }),
    openEvidence: async () => true
  });
  assert.strictEqual((await runtime.consider(eligible.candidate)).status, 'scheduled');
  await runtime.consider(eligible.candidate);
  assert.strictEqual(alarmCreates.length, 1, 'duplicate consider produces one exact alarm');
  nowValue = Date.UTC(2027, 2, 2, 16);
  const alarmName = runtime.alarmName(eligible.candidate.alertKey);
  assert.strictEqual(await runtime.handleAlarm({
    name: alarmName,
    scheduledTime: AlertRuntimeModule.resolveScheduledTime(
      gold.alertCivilDate, 'America/Chicago', Intl.DateTimeFormat
    )
  }), true);
  assert.strictEqual(await runtime.handleAlarm({ name: alarmName }), false);
  assert.strictEqual(notificationCreates.length, 1, 'duplicate alarm produces one notification effect');
  assert.strictEqual((await store.getByAlertKey(eligible.candidate.alertKey)).state, 'delivered');

  const publicStatus = engine.publicStatus(await store.getByAlertKey(eligible.candidate.alertKey));
  assert.ok(AlertSchema.parsePublicStatus(publicStatus));
  const projection = HudSchema.parseProjection(releaseProjection(eligible.candidate, publicStatus));
  assert.ok(projection, 'current alert crosses the production HUD schema');
  const model = Composer.composeContractView(projection);
  assert.ok(model && Composer.validateContractViewModel(model));
  assert.strictEqual(model.reading.policyAndDelivery[2].value, 'Local alert delivered');
  assert.strictEqual(model.reading.policyAndDelivery[2].action.label, 'Remove current owner mapping');
  const publicJson = JSON.stringify({ publicStatus, projection, model });
  for (const field of manifest.forbidden_disclosure_fields) {
    assert.strictEqual(publicJson.includes('"' + field + '"'), false,
      `public aggregate excludes private field ${field}`);
  }
  assert.strictEqual(publicJson.includes(eligible.candidate.alertKey), false);
  assert.strictEqual(publicJson.includes('<img'), false);
}

function verifyLifecycleBrowserAggregate() {
  for (const relativePath of [
    'tests/skopeo-session-lifecycle.test.js',
    'tests/skopeo-browser-contract.test.js'
  ]) {
    const result = childProcess.spawnSync(process.execPath, [relativePath], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env }
    });
    assert.strictEqual(result.error, undefined, `${relativePath} launches`);
    assert.strictEqual(result.status, 0,
      `${relativePath} passes\n${result.stdout || ''}${result.stderr || ''}`);
  }
}

function verifyRegistrationAndHumanBoundary() {
  assert.strictEqual(packageJson.scripts['test:skopeo-release-evals'], RELEASE_SCRIPT,
    'release aggregate has one exact prerequisite and evaluation order');
  const normal = packageJson.scripts.test;
  assert.strictEqual(normal.split('npm run test:skopeo-release-evals').length - 1, 1);
  const sequence = [
    'npm run test:skopeo-graph-evals',
    'npm run test:skopeo-truth-evals',
    'npm run test:skopeo-hud-evals',
    'npm run test:skopeo-ask-evals',
    'npm run test:skopeo-release-evals'
  ];
  let cursor = -1;
  for (const command of sequence) {
    const next = normal.indexOf(command);
    assert.ok(next > cursor, `${command} follows its prerequisite aggregate`);
    cursor = next;
  }
  const uat = fs.readFileSync(UAT_PATH, 'utf8');
  assert.match(uat, /^status: human_needed$/m);
  assert.match(uat, /^live_approved: false$/m);
  assert.match(uat, /^legal_domain_approved: false$/m);
  assert.match(uat, /^authorized_live_approved: false$/m);
  assert.match(uat, /^native_notification_approved: false$/m);
  assert.match(uat, /^human_accessibility_approved: false$/m);
  for (const required of [
    'Google Docs agreement', 'Text-bearing PDF', 'Blocked download', 'Shared access',
    'Access revocation', 'Account switching', 'Native notification', 'Legal/domain',
    'VoiceOver', '200% zoom', 'Dense corpus', 'Host coexistence'
  ]) assert.ok(uat.includes(required), `human ledger includes ${required}`);
  assert.strictEqual((uat.match(/\| human_needed \|/g) || []).length, 12,
    'all twelve live/human rows remain explicitly human-needed');
  assert.doesNotMatch(uat, /\| pass \|/i);
  assert.doesNotMatch(uat, /https?:\/\//);
}

(async function run() {
  try {
    verifyManifestAndCoverage();
    await verifyProductionAggregate();
    verifyLifecycleBrowserAggregate();
    verifyRegistrationAndHumanBoundary();
    console.log('deterministic_gold: pass (12/12; synthetic_expected_values_non_approved)');
    console.log('structural_security: pass (10/10)');
    console.log('lifecycle_browser_provisional: pass (6/6; local_non_live)');
    console.log('domain_fidelity: human_needed');
    console.log('authorized_live_drive_docs_pdf: human_needed');
    console.log('native_notification: human_needed');
    console.log('human_accessibility: human_needed');
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
})();
