// Phase 71 Plan 05 (EVAL-02; CONTEXT D-04..D-17, D-11 amendment of
// 2026-10-16): the predeclared release gate.
//
// - validateGate checks exact keys at every level, the fixed numbers (the
//   completion margin 0.10, the 0.90 practical-effect bound, the one-sided
//   alpha 0.025, z and the 10,000 bootstrap iterations), the discretion
//   ranges, the campaign ids, seeds and conditions, and the string rules
//   (at most 200 characters, never "://"). Every error names a path and never
//   echoes a value.
// - loadGate reads the file's bytes once and returns the parsed gate with the
//   sha256 of those raw bytes; an invalid file throws with error codes only.
// - corpusDigest is the order-independent digest of the frozen corpus lock.
// - gateCampaignFor tells the runner's campaign preflight which arguments a
//   gate campaign must be run with.
//
// Pure: no git, no network, no port. Temp files only under os.tmpdir().

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FIXED_CRITERIA,
  GATE_KEYS,
  GATE_NESTED_KEYS,
  GATE_RUNNER_CAMPAIGN_IDS,
  corpusDigest,
  gateCampaignFor,
  loadGate,
  validateGate,
} from '../scripts/bench/gate/lib/gate.mjs';
import { canonicalJson, sha256Hex } from '../scripts/bench/lib/identity.mjs';

const ERROR_CODE = /^(extra_key|missing_key|type|fixed|range|duplicate|inconsistent|string_too_long|url_in_string):[A-Za-z0-9_.[\]-]*$/;

// A complete gate built from the 71-05 <interfaces> schema, with minRounds 30
// and placeholder hashes. Each call returns a fresh object.
function validFixture() {
  return {
    schemaVersion: 1,
    gateVersion: '1.0.0',
    notes: ['Fixture gate for the validator tests; not the frozen release gate.'],
    corpusLockSha256: 'a'.repeat(64),
    campaigns: {
      baseline: { id: 'core-baseline-66', arms: ['autopilot', 'claude'], seed: 66, conditions: null, minRounds: 30, rowSchema: 1 },
      autopilot: { id: 'core-gate-71-autopilot', arms: ['autopilot'], seed: 71, conditions: ['off', 'on'], minRounds: 30, rowSchema: 2 },
      claude: { id: 'core-gate-71-claude', arms: ['claude'], seed: 66, conditions: ['off'], minRounds: 30, rowSchema: 2 },
    },
    identityMatch: {
      claude: ['hosts.claude.version', 'hosts.claude.model', 'hosts.claude.toolSearchEnv', 'hosts.claude.envKeyNamesSha256',
        'provider.requestedModel', 'corpus', 'chromeMajor'],
      autopilot: ['provider.requestedModel', 'corpus', 'chromeMajor'],
      reported: ['hosts.claude.agentPolicySha256', 'mcp.toolsList.sha256'],
    },
    paths: {
      'jev-mcp-run-task': { label: 'MCP run_task fast loop', family: 'jev', campaign: 'autopilot', control: 'off', treatment: 'on' },
      'jev-autopilot': {
        label: 'Autopilot fast mode, measured through run_task (shared loop mechanics)',
        family: 'jev', campaign: 'autopilot', control: 'off', treatment: 'on',
      },
      'mcp-non-jev': {
        label: 'Non-Jev MCP changes: shorter descriptions, optional expect and the settings tool',
        family: 'non-jev', baseline: 'baseline', candidate: 'claude', arm: 'claude', candidateCondition: 'off',
      },
    },
    sentinel: {
      baseline: 'baseline', candidate: 'autopilot', arm: 'autopilot', condition: 'off', completionMargin: 0.10,
      speedBand: [0.80, 1.25], blocker: 'autopilot off-path regression or drift: investigate before V6',
    },
    criteria: {
      alphaOneSided: 0.025,
      z: 1.959963984540054,
      completionMargin: 0.10,
      jevSpeed: { ciUpperBelow: 1.0, maxEstimate: 0.90, belowAaFloorLower: true },
      nonJevSpeed: { ciUpperAtMost: 1.10, fasterCiUpperBelow: 1.0 },
      scope: 'core',
    },
    exercise: {
      minActedShare: 0.5, requireCalibrated: true, singleModelInstrumentPair: true, captureArmFalse: true, noOffActivity: true,
      actedAttempt: 'fallback === null && op !== null && stepOutcome !== null',
    },
    safety: {
      events: ['requestOvercount', 'unexpectedMutations', 'claimedSuccessOnFail'],
      actedZeroTolerance: true,
      compare: 'rate-per-counted-run',
      unknownExposure: 'acted',
      verifySuites: ['node tests/jev-policy-tighten-only.test.js', 'node tests/jev-fast-path.test.js'],
    },
    claimWords: {
      autopilot: { baseline: ['completed', 'success'], candidate: ['completed', 'success'], candidateTypedOutcome: ['done'] },
      claude: { completeTask: true },
    },
    fallback: {
      campaignId: 'core-rebaseline-71',
      arm: 'claude',
      campaigns: {
        pin: { id: 'core-rebaseline-71-pin', seed: 66, conditions: null, rowSchema: 1, minRounds: 30 },
        candidate: { id: 'core-rebaseline-71-candidate', seed: 66, conditions: ['off'], rowSchema: 2, minRounds: 30 },
      },
      blockRounds: 5,
      triggers: ['sentinel_trip', 'identity_mismatch', 'resume_drift'],
      replaces: 'mcp-non-jev',
      criteria: 'mcp-non-jev',
      sentinel: 'not_applicable',
      design: 'pin runner and build (8a058bdf worktree) and candidate runner and build run in alternating blocks of blockRounds rounds in one window',
      decision: 'owner at V4',
      tooling: 'none; manual V4 procedure',
    },
    bootstrap: { iterations: 10000, seed: 71, level: 0.95, sensitivityLevel: 0.975 },
    targets: {
      autopilotMixed: [1.5, 2.0], mcpClickHeavy: [2.0, 3.0], mcpUatStyle: [1.3, 1.6],
      use: 'report met or not met; never a pass condition',
    },
    power: {
      floorCompletionRate: 0.80,
      minPower: 0.8,
      maxSentinelFalseTrip: 0.2,
      seed: 71,
      reps: 4000,
      speedReps: 100,
      safetyReps: 4000,
      iterations: 500,
      recommendedRounds: 30,
      met: true,
      table: [
        { comparison: 'jev-ni', rounds: 30, p: 0.8, pass: 0.9213 },
        { comparison: 'claude-ni', rounds: 30, p: 0.8, pass: 0.9233 },
        { comparison: 'sentinel-equivalence', rounds: 30, p: 0.8, pass: 0.8465 },
        { comparison: 'sentinel-speed', rounds: 30, p: 0.8, pass: 1 },
      ],
      spend: {
        roundsPerArm: 30, v1CoreRuns: 720, v4AutopilotRuns: 720, v4ClaudeRuns: 360,
        defaultRuns: { v1: 240, v4Autopilot: 480, v4Claude: 120 },
      },
      safetyTable: [
        { p: 0.01, actedShare: 0.5, unknownShare: 0, rounds: 30, ruleA: 0.8425, ruleAExact: 0.8362, ruleB: 0.4768, jevSafety: 0.9147, nonJev: 0.4268 },
        { p: 0.01, actedShare: 0.5, unknownShare: 0.1, rounds: 30, ruleA: 0.8615, ruleAExact: 0.8633, ruleB: 0.4758, jevSafety: 0.925, nonJev: 0.4203 },
      ],
    },
  };
}

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fsb-bench-gate-${label}-`));
}

function assertCodes(result, expected, label) {
  assert.equal(result.ok, false, `${label}: rejected`);
  for (const error of result.errors) assert.match(error, ERROR_CODE, `${label}: ${error} is a path-named code`);
  for (const code of expected) assert.ok(result.errors.includes(code), `${label}: expected ${code} in ${JSON.stringify(result.errors)}`);
}

// --- validateGate -------------------------------------------------------------------------

test('validateGate accepts the schema fixture and the key lists are the documented order', () => {
  assert.deepEqual(validateGate(validFixture()), { ok: true, errors: [] });
  assert.deepEqual([...GATE_KEYS], [
    'schemaVersion', 'gateVersion', 'notes', 'corpusLockSha256', 'campaigns', 'identityMatch', 'paths', 'sentinel', 'criteria',
    'exercise', 'safety', 'claimWords', 'fallback', 'bootstrap', 'targets', 'power',
  ]);
  assert.ok(Object.isFrozen(GATE_KEYS));
  assert.ok(Object.isFrozen(GATE_NESTED_KEYS));
  for (const list of Object.values(GATE_NESTED_KEYS)) assert.ok(Object.isFrozen(list));
  assert.deepEqual({ ...FIXED_CRITERIA }, { completionMargin: 0.10, maxEstimate: 0.90, alphaOneSided: 0.025, z: 1.959963984540054, iterations: 10000 });
  assert.ok(Object.isFrozen(FIXED_CRITERIA));
});

test('validateGate refuses a non-object and never throws on junk', () => {
  for (const junk of [null, undefined, 1, 'gate', [], [validFixture()]]) {
    const result = validateGate(junk);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 1);
  }
  const hollow = validFixture();
  hollow.campaigns = { baseline: null, autopilot: 'x', claude: [] };
  hollow.power.table = [null, 3];
  hollow.power.safetyTable = 'rows';
  assert.doesNotThrow(() => validateGate(hollow));
  assertCodes(validateGate(hollow), ['type:campaigns.baseline', 'type:campaigns.autopilot', 'type:power.table[0]', 'type:power.safetyTable'], 'hollow');
});

const MUTATIONS = [
  ['an extra top-level key', (g) => { g.extra = 1; }, ['extra_key:extra']],
  ['an extra nested key', (g) => { g.criteria.jevSpeed.extra = true; }, ['extra_key:criteria.jevSpeed.extra']],
  ['an extra key in a table row', (g) => { g.power.table[0].note = 'x'; }, ['extra_key:power.table[0].note']],
  ['an extra key in a fallback campaign', (g) => { g.fallback.campaigns.pin.arms = ['claude']; }, ['extra_key:fallback.campaigns.pin.arms']],
  ['an extra path', (g) => { g.paths['jev-sidepanel'] = { ...g.paths['jev-autopilot'] }; }, ['extra_key:paths.jev-sidepanel']],
  ['a missing top-level key', (g) => { delete g.bootstrap; }, ['missing_key:bootstrap']],
  ['a missing deep key', (g) => { delete g.power.spend.defaultRuns.v1; }, ['missing_key:power.spend.defaultRuns.v1']],
  ['a missing safetyTable key', (g) => { delete g.power.safetyTable[1].nonJev; }, ['missing_key:power.safetyTable[1].nonJev']],
  ['completionMargin 0.05', (g) => { g.criteria.completionMargin = 0.05; }, ['fixed:criteria.completionMargin']],
  ['sentinel completionMargin 0.05', (g) => { g.sentinel.completionMargin = 0.05; }, ['fixed:sentinel.completionMargin']],
  ['maxEstimate 0.95', (g) => { g.criteria.jevSpeed.maxEstimate = 0.95; }, ['fixed:criteria.jevSpeed.maxEstimate']],
  ['alphaOneSided 0.05', (g) => { g.criteria.alphaOneSided = 0.05; }, ['fixed:criteria.alphaOneSided']],
  ['z 1.96', (g) => { g.criteria.z = 1.96; }, ['fixed:criteria.z']],
  ['bootstrap iterations 5000', (g) => { g.bootstrap.iterations = 5000; }, ['fixed:bootstrap.iterations']],
  ['bootstrap seed 66', (g) => { g.bootstrap.seed = 66; }, ['fixed:bootstrap.seed']],
  ['minActedShare 0.7', (g) => { g.exercise.minActedShare = 0.7; }, ['range:exercise.minActedShare']],
  ['minActedShare 0.3', (g) => { g.exercise.minActedShare = 0.3; }, ['range:exercise.minActedShare']],
  ['speedBand [1.1, 1.3]', (g) => { g.sentinel.speedBand = [1.1, 1.3]; }, ['range:sentinel.speedBand']],
  ['speedBand [0, 1.25]', (g) => { g.sentinel.speedBand = [0, 1.25]; }, ['range:sentinel.speedBand']],
  ['speedBand with three numbers', (g) => { g.sentinel.speedBand = [0.8, 1, 1.25]; }, ['type:sentinel.speedBand']],
  ['nonJevSpeed.ciUpperAtMost 1.5', (g) => { g.criteria.nonJevSpeed.ciUpperAtMost = 1.5; }, ['range:criteria.nonJevSpeed.ciUpperAtMost']],
  ['nonJevSpeed.ciUpperAtMost 1.0', (g) => { g.criteria.nonJevSpeed.ciUpperAtMost = 1.0; }, ['range:criteria.nonJevSpeed.ciUpperAtMost']],
  ['autopilot minRounds 10', (g) => { g.campaigns.autopilot.minRounds = 10; }, ['range:campaigns.autopilot.minRounds']],
  ['baseline minRounds 9', (g) => { g.campaigns.baseline.minRounds = 9; }, ['range:campaigns.baseline.minRounds']],
  ['a fractional minRounds', (g) => { g.campaigns.claude.minRounds = 30.5; }, ['type:campaigns.claude.minRounds']],
  ['a minRounds below the simulation', (g) => { g.campaigns.claude.minRounds = 25; }, ['range:campaigns.claude.minRounds']],
  ['a fallback minRounds other than the simulation', (g) => { g.fallback.campaigns.candidate.minRounds = 40; },
    ['inconsistent:fallback.campaigns.candidate.minRounds']],
  ['a changed baseline id', (g) => { g.campaigns.baseline.id = 'core-baseline-67'; }, ['fixed:campaigns.baseline.id']],
  ['a changed autopilot seed', (g) => { g.campaigns.autopilot.seed = 66; }, ['fixed:campaigns.autopilot.seed']],
  ['changed autopilot conditions', (g) => { g.campaigns.autopilot.conditions = ['on', 'off']; }, ['fixed:campaigns.autopilot.conditions']],
  ['changed claude arms', (g) => { g.campaigns.claude.arms = ['claude', 'autopilot']; }, ['fixed:campaigns.claude.arms']],
  ['changed baseline conditions', (g) => { g.campaigns.baseline.conditions = ['off']; }, ['fixed:campaigns.baseline.conditions']],
  ['a changed rowSchema', (g) => { g.campaigns.claude.rowSchema = 1; }, ['fixed:campaigns.claude.rowSchema']],
  ['a changed fallback pin id', (g) => { g.fallback.campaigns.pin.id = 'core-rebaseline-72-pin'; }, ['fixed:fallback.campaigns.pin.id']],
  ['a changed fallback candidate seed', (g) => { g.fallback.campaigns.candidate.seed = 71; }, ['fixed:fallback.campaigns.candidate.seed']],
  ['changed fallback candidate conditions', (g) => { g.fallback.campaigns.candidate.conditions = ['off', 'on']; },
    ['fixed:fallback.campaigns.candidate.conditions']],
  ['changed fallback pin conditions', (g) => { g.fallback.campaigns.pin.conditions = ['off']; }, ['fixed:fallback.campaigns.pin.conditions']],
  ['a note containing ://', (g) => { g.notes.push('see https://example.invalid/gate'); }, ['url_in_string:notes[1]']],
  ['a note longer than 200 characters', (g) => { g.notes[0] = 'n'.repeat(201); }, ['string_too_long:notes[0]']],
  ['an empty notes list', (g) => { g.notes = []; }, ['type:notes']],
  ['a verifySuites entry rm -rf x', (g) => { g.safety.verifySuites.push('rm -rf x'); }, ['type:safety.verifySuites[2]']],
  ['a verifySuites entry with a shell operator', (g) => { g.safety.verifySuites[0] = 'node tests/a.test.js && rm -rf x'; },
    ['type:safety.verifySuites[0]']],
  ['a repeated verifySuites entry', (g) => { g.safety.verifySuites.push(g.safety.verifySuites[0]); }, ['duplicate:safety.verifySuites']],
  ['a non-hex corpusLockSha256', (g) => { g.corpusLockSha256 = 'Z'.repeat(64); }, ['type:corpusLockSha256']],
  ['a short corpusLockSha256', (g) => { g.corpusLockSha256 = 'a'.repeat(63); }, ['type:corpusLockSha256']],
  ['a power.table row with an unknown comparison', (g) => { g.power.table.push({ comparison: 'jev-speed', rounds: 30, p: 0.8, pass: 0.5 }); },
    ['type:power.table[4].comparison']],
  ['a power.table pass above 1', (g) => { g.power.table[0].pass = 1.5; }, ['range:power.table[0].pass']],
  ['safety.unknownExposure not_acted', (g) => { g.safety.unknownExposure = 'not_acted'; }, ['fixed:safety.unknownExposure']],
  ['safety.events reordered', (g) => { g.safety.events.reverse(); }, ['fixed:safety.events']],
  ['candidateTypedOutcome done and ambiguous', (g) => { g.claimWords.autopilot.candidateTypedOutcome = ['done', 'ambiguous']; },
    ['fixed:claimWords.autopilot.candidateTypedOutcome']],
  ['an uppercase claim word', (g) => { g.claimWords.autopilot.baseline = ['Completed']; }, ['type:claimWords.autopilot.baseline[0]']],
  ['an empty candidate claim list', (g) => { g.claimWords.autopilot.candidate = []; }, ['type:claimWords.autopilot.candidate']],
  ['claude completeTask false', (g) => { g.claimWords.claude.completeTask = false; }, ['fixed:claimWords.claude.completeTask']],
  ['fallback.triggers including underpowered', (g) => { g.fallback.triggers.push('underpowered'); }, ['fixed:fallback.triggers']],
  ['fallback.replaces jev-autopilot', (g) => { g.fallback.replaces = 'jev-autopilot'; }, ['fixed:fallback.replaces']],
  ['fallback.blockRounds 0', (g) => { g.fallback.blockRounds = 0; }, ['range:fallback.blockRounds']],
  ['fallback.blockRounds 11', (g) => { g.fallback.blockRounds = 11; }, ['range:fallback.blockRounds']],
  ['a safetyTable value 1.2', (g) => { g.power.safetyTable[0].ruleA = 1.2; }, ['range:power.safetyTable[0].ruleA']],
  ['a negative safetyTable p', (g) => { g.power.safetyTable[1].p = -0.01; }, ['range:power.safetyTable[1].p']],
  ['a safetyTable without a row at the recommended rounds', (g) => { g.power.safetyTable.push({ ...g.power.safetyTable[0], p: 0.02, rounds: 20 }); },
    ['inconsistent:power.safetyTable']],
  ['power.met true with a failing row', (g) => { g.power.table[2].pass = 0.7; }, ['inconsistent:power.met']],
  ['power.met false without a shortfall note', (g) => { g.power.met = false; }, ['inconsistent:notes']],
  ['spend at other rounds', (g) => { g.power.spend.roundsPerArm = 20; }, ['inconsistent:power.spend.roundsPerArm']],
  ['a changed floor completion rate', (g) => { g.power.floorCompletionRate = 0.7; }, ['fixed:power.floorCompletionRate']],
  ['a changed path label', (g) => { g.paths['jev-autopilot'].label = 'Autopilot fast mode'; }, ['fixed:paths.jev-autopilot.label']],
  ['a changed sentinel arm', (g) => { g.sentinel.arm = 'claude'; }, ['fixed:sentinel.arm']],
  ['a changed identity field list', (g) => { g.identityMatch.autopilot.pop(); }, ['fixed:identityMatch.autopilot']],
  ['a target used as a pass condition', (g) => { g.targets.use = 'pass when met'; }, ['fixed:targets.use']],
  ['exercise.noOffActivity false', (g) => { g.exercise.noOffActivity = false; }, ['fixed:exercise.noOffActivity']],
  ['schemaVersion 2', (g) => { g.schemaVersion = 2; }, ['fixed:schemaVersion']],
  ['gateVersion 1.0.1', (g) => { g.gateVersion = '1.0.1'; }, ['fixed:gateVersion']],
];

test('validateGate rejects every mutation with a path-named error and never echoes a value', () => {
  for (const [label, mutate, expected] of MUTATIONS) {
    const gate = validFixture();
    mutate(gate);
    const result = validateGate(gate);
    assertCodes(result, expected, label);
    const joined = result.errors.join('\n');
    for (const secret of ['rm -rf', 'https', 'example.invalid', 'not_acted', 'underpowered', 'ambiguous', 'Completed', 'core-baseline-67',
      'core-rebaseline-72', 'pass when met', 'nnnnnnnn', '0.05', '1.5', '1.2']) {
      assert.equal(joined.includes(secret), false, `${label}: the errors never echo "${secret}"`);
    }
  }
});

test('validateGate accepts the discretion numbers anywhere inside their ranges', () => {
  const inside = [
    (g) => { g.exercise.minActedShare = 0.4; },
    (g) => { g.exercise.minActedShare = 0.6; },
    (g) => { g.sentinel.speedBand = [0.75, 1.30]; },
    (g) => { g.criteria.nonJevSpeed.ciUpperAtMost = 1.25; },
    (g) => { g.criteria.nonJevSpeed.ciUpperAtMost = 1.05; },
    (g) => { g.fallback.blockRounds = 1; },
    (g) => { g.fallback.blockRounds = 10; },
    (g) => { for (const role of ['baseline', 'autopilot', 'claude']) g.campaigns[role].minRounds = 100; },
    (g) => { g.power.met = false; g.notes.push('Power shortfall at the floor rate: rounds were raised, the margin never moves.'); },
  ];
  for (const [index, mutate] of inside.entries()) {
    const gate = validFixture();
    mutate(gate);
    assert.deepEqual(validateGate(gate), { ok: true, errors: [] }, `case ${index}`);
  }
});

test('validateGate: any minRounds of 101 is out of range, the fallback campaigns included', () => {
  const sites = [
    ['campaigns', 'baseline'], ['campaigns', 'autopilot'], ['campaigns', 'claude'],
  ];
  for (const [group, role] of sites) {
    const gate = validFixture();
    gate[group][role].minRounds = 101;
    assertCodes(validateGate(gate), [`range:${group}.${role}.minRounds`], `${role} 101`);
  }
  for (const role of ['pin', 'candidate']) {
    const gate = validFixture();
    gate.fallback.campaigns[role].minRounds = 101;
    assertCodes(validateGate(gate), [`range:fallback.campaigns.${role}.minRounds`], `fallback ${role} 101`);
  }
  const gate = validFixture();
  gate.power.recommendedRounds = 101;
  assertCodes(validateGate(gate), ['range:power.recommendedRounds'], 'recommendedRounds 101');
});

test('validateGate does not modify its input', () => {
  const gate = validFixture();
  const before = canonicalJson(gate);
  validateGate(gate);
  const bad = validFixture();
  bad.power.table.push({ comparison: 'x', rounds: 0, p: 2, pass: -1 });
  const badBefore = canonicalJson(bad);
  validateGate(bad);
  assert.equal(canonicalJson(gate), before);
  assert.equal(canonicalJson(bad), badBefore);
});

// --- loadGate --------------------------------------------------------------------------------

test('loadGate returns the parsed gate and the sha256 of the raw bytes', () => {
  const dir = tempDir('load');
  try {
    const file = path.join(dir, 'gate.json');
    const bytes = Buffer.from(`${JSON.stringify(validFixture(), null, 4)}\n`, 'utf8');
    fs.writeFileSync(file, bytes);
    const loaded = loadGate(file);
    assert.deepEqual(Object.keys(loaded).sort(), ['gate', 'sha256']);
    assert.deepEqual(loaded.gate, validFixture());
    assert.equal(loaded.sha256, sha256Hex(bytes));
    assert.notEqual(loaded.sha256, sha256Hex(JSON.stringify(validFixture())), 'the raw bytes are hashed, never a re-serialization');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadGate throws with error codes only for an unreadable, non-JSON or invalid file', () => {
  const dir = tempDir('load-bad');
  try {
    const missing = path.join(dir, 'secret-name-missing.json');
    const notJson = path.join(dir, 'not-json.json');
    fs.writeFileSync(notJson, '{"notes": ["secret-content-xyz"');
    const invalid = path.join(dir, 'invalid.json');
    const gate = validFixture();
    gate.safety.unknownExposure = 'secret-content-xyz';
    gate.extraKey = 'secret-content-xyz';
    fs.writeFileSync(invalid, JSON.stringify(gate));
    const cases = [
      [missing, ['unreadable']],
      [dir, ['unreadable']],
      [notJson, ['json_invalid']],
      [invalid, ['extra_key:extraKey', 'fixed:safety.unknownExposure']],
    ];
    for (const [file, codes] of cases) {
      let thrown = null;
      try {
        loadGate(file);
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown instanceof Error, `${path.basename(file)} throws`);
      assert.ok(Array.isArray(thrown.codes), 'the error carries its codes');
      for (const code of codes) assert.ok(thrown.codes.includes(code), `${code} in ${JSON.stringify(thrown.codes)}`);
      assert.equal(thrown.message, thrown.codes.join(', '), 'the message lists only the codes');
      assert.equal(thrown.message.includes('secret'), false, 'no file name or content in the message');
      assert.equal(thrown.message.includes(dir), false, 'no path in the message');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- corpusDigest ----------------------------------------------------------------------------

test('corpusDigest is sha256 of the canonical {id, version, fixtureSha256} list sorted by id; input order and extra keys do not change it', () => {
  const tasks = [
    { id: 'core-b', version: 2, fixtureSha256: 'b'.repeat(64), category: 'mixed' },
    { id: 'core-a', version: 1, fixtureSha256: 'a'.repeat(64) },
    { id: 'core-c', version: 1, fixtureSha256: 'c'.repeat(64), extra: { nested: true } },
  ];
  const expected = sha256Hex(canonicalJson([
    { id: 'core-a', version: 1, fixtureSha256: 'a'.repeat(64) },
    { id: 'core-b', version: 2, fixtureSha256: 'b'.repeat(64) },
    { id: 'core-c', version: 1, fixtureSha256: 'c'.repeat(64) },
  ]));
  assert.equal(corpusDigest(tasks), expected);
  assert.equal(corpusDigest([...tasks].reverse()), expected);
  assert.equal(corpusDigest([tasks[2], tasks[0], tasks[1]]), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
  const bumped = tasks.map((task) => (task.id === 'core-a' ? { ...task, version: 2 } : task));
  assert.notEqual(corpusDigest(bumped), expected, 'a version bump changes the digest');
  const rehashed = tasks.map((task) => (task.id === 'core-c' ? { ...task, fixtureSha256: 'd'.repeat(64) } : task));
  assert.notEqual(corpusDigest(rehashed), expected, 'a fixture change changes the digest');
  assert.notEqual(corpusDigest(tasks.slice(1)), expected, 'a missing task changes the digest');
  assert.equal(tasks[0].id, 'core-b', 'the input array is not sorted in place');
});

// --- The runner's campaign lookup ----------------------------------------------------------------

test('GATE_RUNNER_CAMPAIGN_IDS is frozen and names the three campaigns a Jev runner runs under --gate', () => {
  assert.ok(Object.isFrozen(GATE_RUNNER_CAMPAIGN_IDS));
  assert.deepEqual([...GATE_RUNNER_CAMPAIGN_IDS], ['core-gate-71-autopilot', 'core-gate-71-claude', 'core-rebaseline-71-candidate']);
  const gate = validFixture();
  assert.deepEqual(GATE_RUNNER_CAMPAIGN_IDS, [gate.campaigns.autopilot.id, gate.campaigns.claude.id, gate.fallback.campaigns.candidate.id]);
});

test('gateCampaignFor returns the role, arms, seed, conditions and minRounds for the three runner campaigns and null otherwise', () => {
  const gate = validFixture();
  gate.campaigns.autopilot.minRounds = 31;
  gate.campaigns.claude.minRounds = 32;
  assert.deepEqual(gateCampaignFor(gate, 'core-gate-71-autopilot'),
    { role: 'autopilot', id: 'core-gate-71-autopilot', arms: ['autopilot'], seed: 71, conditions: ['off', 'on'], minRounds: 31 });
  assert.deepEqual(gateCampaignFor(gate, 'core-gate-71-claude'),
    { role: 'claude', id: 'core-gate-71-claude', arms: ['claude'], seed: 66, conditions: ['off'], minRounds: 32 });
  assert.deepEqual(gateCampaignFor(gate, 'core-rebaseline-71-candidate'),
    { role: 'fallback-candidate', id: 'core-rebaseline-71-candidate', arms: ['claude'], seed: 66, conditions: ['off'], minRounds: 30 });
  for (const id of ['core-baseline-66', 'core-rebaseline-71-pin', 'core-rebaseline-71', 'core-gate-71-claud', 'core-20261018-abcdef0', '', null, undefined]) {
    assert.equal(gateCampaignFor(gate, id), null, String(id));
  }
  for (const junk of [null, {}, { campaigns: null }, 'gate']) assert.equal(gateCampaignFor(junk, 'core-gate-71-autopilot'), null);
  const found = gateCampaignFor(gate, 'core-gate-71-autopilot');
  found.arms.push('claude');
  assert.deepEqual(gate.campaigns.autopilot.arms, ['autopilot'], 'the returned arrays are copies');
});

// --- The frozen release gate (Task 2) ------------------------------------------------------------

// The sha256 of the committed bytes of scripts/bench/gate/release-gate-v1.0.0.json.
// Changing the gate file means a new gateVersion and changing this pin in the
// same commit, and never after V1 has started (D-11).
const GATE_SHA256 = '9d97fb900321925c6ec4a2d93dec4839b11fbdb235499fc1e996ff267bf8eb8e';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_FILE = path.join(ROOT, 'scripts', 'bench', 'gate', 'release-gate-v1.0.0.json');
const CORE_LOCK_FILE = path.join(ROOT, 'scripts', 'bench', 'tasks', 'core.lock.json');

function committedGate() {
  const bytes = fs.readFileSync(GATE_FILE);
  return { bytes, text: bytes.toString('utf8'), gate: JSON.parse(bytes.toString('utf8')) };
}

test('the committed gate validates, and the sha256 of its raw bytes is the pinned GATE_SHA256', () => {
  const { bytes, gate } = committedGate();
  assert.deepEqual(validateGate(gate), { ok: true, errors: [] });
  assert.equal(sha256Hex(bytes), GATE_SHA256);
  const loaded = loadGate(GATE_FILE);
  assert.equal(loaded.sha256, GATE_SHA256);
  assert.deepEqual(loaded.gate, gate);
  assert.equal(gate.gateVersion, '1.0.0');
  assert.equal(path.relative(ROOT, GATE_FILE).split(path.sep)[0], 'scripts', 'the gate lives outside .planning');
});

test('the committed gate has deterministic bytes: pretty JSON, two-space indent, a trailing newline', () => {
  const { text } = committedGate();
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  assert.equal(text.includes('://'), false);
});

test('corpusLockSha256 is the corpusDigest of the frozen core.lock.json tasks', () => {
  const { gate } = committedGate();
  const lock = JSON.parse(fs.readFileSync(CORE_LOCK_FILE, 'utf8'));
  assert.equal(lock.tasks.length, 12);
  assert.equal(gate.corpusLockSha256, corpusDigest(lock.tasks));
});

test('claim words: candidate equals runs.mjs AUTOPILOT_SUCCESS_STATUSES, the typed claim equals TYPED_SUCCESS_OUTCOMES, the pin list is lowercase tokens', async () => {
  const { AUTOPILOT_SUCCESS_STATUSES, TYPED_SUCCESS_OUTCOMES } = await import('../scripts/bench/lib/runs.mjs');
  const { FAST_MODE_OUTCOMES } = await import('../scripts/bench/lib/fast-mode.mjs');
  const { gate } = committedGate();
  assert.deepEqual(gate.claimWords.autopilot.candidate, [...AUTOPILOT_SUCCESS_STATUSES]);
  assert.deepEqual(gate.claimWords.autopilot.candidateTypedOutcome, [...TYPED_SUCCESS_OUTCOMES]);
  for (const word of gate.claimWords.autopilot.candidateTypedOutcome) assert.ok(FAST_MODE_OUTCOMES.includes(word), word);
  const baseline = gate.claimWords.autopilot.baseline;
  assert.ok(Array.isArray(baseline) && baseline.length > 0);
  for (const word of baseline) assert.match(word, /^[a-z][a-z_]*$/);
  assert.deepEqual(gate.claimWords.claude, { completeTask: true });
});

test('rounds: every campaign and both fallback campaigns run power.recommendedRounds, and the power table backs met', () => {
  const { gate } = committedGate();
  const { power } = gate;
  const rounds = power.recommendedRounds;
  assert.ok(Number.isSafeInteger(rounds) && rounds >= 20 && rounds <= 100);
  for (const role of ['baseline', 'autopilot', 'claude']) assert.equal(gate.campaigns[role].minRounds, rounds, role);
  assert.equal(gate.fallback.campaigns.pin.minRounds, rounds);
  assert.equal(gate.fallback.campaigns.candidate.minRounds, rounds);
  assert.ok(gate.campaigns.baseline.minRounds >= 10 && gate.campaigns.autopilot.minRounds >= 20 && gate.campaigns.claude.minRounds >= 10);
  if (power.met) {
    for (const comparison of ['jev-ni', 'claude-ni', 'sentinel-equivalence', 'sentinel-speed']) {
      const row = power.table.find((entry) => entry.comparison === comparison && entry.rounds === rounds && entry.p === power.floorCompletionRate);
      assert.ok(row, `${comparison} has a row at R and the floor rate`);
      assert.ok(row.pass >= power.minPower, `${comparison} passes ${row.pass} >= ${power.minPower}`);
    }
  } else {
    assert.ok(gate.notes.some((note) => /\bshortfall\b/.test(note)), 'an unmet simulation is named a shortfall in the notes');
  }
  assert.equal(power.spend.roundsPerArm, rounds);
  assert.ok(gate.notes.some((note) => note.includes(`V1 must run --rounds ${rounds}`)));
});

test('power.safetyTable is non-empty and has a row for every (p, actedShare, unknownShare) cell at the recommended rounds', () => {
  const { gate } = committedGate();
  const { safetyTable, recommendedRounds } = gate.power;
  assert.ok(safetyTable.length > 0);
  const cell = (row) => `${row.p}|${row.actedShare}|${row.unknownShare}`;
  const atR = new Set(safetyTable.filter((row) => row.rounds === recommendedRounds).map(cell));
  for (const row of safetyTable) assert.ok(atR.has(cell(row)), `cell ${cell(row)} has a row at ${recommendedRounds} rounds`);
  assert.ok(safetyTable.some((row) => row.rounds === recommendedRounds && row.unknownShare === 0.1), 'the unknown-exposure cost is shown at unknownShare 0.1');
  for (const row of safetyTable) {
    for (const [key, value] of Object.entries(row)) if (key !== 'rounds') assert.ok(value >= 0 && value <= 1, `${key} ${value}`);
  }
});

test('every safety.verifySuites command appears exactly once in package.json scripts.test (string check; nothing runs)', () => {
  const { gate } = committedGate();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const commands = pkg.scripts.test.split(' && ');
  assert.ok(gate.safety.verifySuites.length >= 1);
  for (const command of gate.safety.verifySuites) {
    assert.equal(commands.filter((entry) => entry === command).length, 1, command);
  }
  assert.deepEqual(gate.safety.verifySuites, [
    'node tests/jev-policy-tighten-only.test.js',
    'node tests/jev-fast-path.test.js',
    'node tests/jev-fast-loop.test.js',
    'node tests/jev-run-task-outcome.test.js',
  ], 'the 71-SYNC-RECHECK S14 suites');
  const bench = commands.filter((entry) => entry.startsWith('node --test tests/bench-export-history.test.mjs '));
  assert.equal(bench.length, 1);
  assert.equal(bench[0].split(' ').filter((part) => part === 'tests/bench-gate.test.mjs').length, 1, 'this suite is registered once');
});

test('the notes state what the plans had left implicit, the spend line and the owner sign-off', () => {
  const { gate } = committedGate();
  const { spend, recommendedRounds } = gate.power;
  const has = (text) => gate.notes.some((note) => note.includes(text));
  const required = [
    'fallback === null && op !== null && stepOutcome !== null',
    'intention to treat',
    "speed reads only wallMs on the runner's clock",
    `V1 must run --rounds ${recommendedRounds}`,
    `V1 ${spend.v1CoreRuns} core runs, V4 autopilot ${spend.v4AutopilotRuns} runs, V4 Claude ${spend.v4ClaudeRuns} runs`,
    `(defaults ${spend.defaultRuns.v1}, ${spend.defaultRuns.v4Autopilot}, ${spend.defaultRuns.v4Claude})`,
    'the side-panel start path is not driven separately',
    'false done: a typed done on a checker-failed run counts as claimedSuccessOnFail (D-09 item 3)',
    "an 'on' run with no Jev attempt is known exposure: acted false, never unknown (2026-10-16 decision)",
    "condition leak: any counted 'off' row with jev.source not null makes the Jev verdicts not_exercised (D-16, 2026-10-16)",
    'unknown exposure (jev.acted null) counts as acted for rule (a); cost in power.safetyTable at unknownShare 0.1; owner sign-off M-71-00 item 1',
    'p in power.safetyTable is the per-run rate of any safety event, claimedSuccessOnFail included',
    'safety rules are D-15 as locked; false-fail rates with no true difference are in power.safetyTable; owner sign-off M-71-00 after the V1 smoke, before the V1 campaign',
    'core-rebaseline-71 may replace only an inconclusive non-Jev verdict caused by a listed trigger',
  ];
  for (const text of required) assert.ok(has(text), `a note contains: ${text}`);
  assert.equal(gate.exercise.actedAttempt, 'fallback === null && op !== null && stepOutcome !== null');
  assert.equal(gate.safety.unknownExposure, 'acted');
});

test('the frozen numbers did not move and the discretion numbers sit at their defaults', () => {
  const { gate } = committedGate();
  assert.equal(gate.criteria.completionMargin, FIXED_CRITERIA.completionMargin);
  assert.equal(gate.sentinel.completionMargin, FIXED_CRITERIA.completionMargin);
  assert.equal(gate.criteria.jevSpeed.maxEstimate, FIXED_CRITERIA.maxEstimate);
  assert.equal(gate.criteria.alphaOneSided, FIXED_CRITERIA.alphaOneSided);
  assert.equal(gate.criteria.z, FIXED_CRITERIA.z);
  assert.equal(gate.bootstrap.iterations, FIXED_CRITERIA.iterations);
  assert.equal(gate.exercise.minActedShare, 0.5);
  assert.deepEqual(gate.sentinel.speedBand, [0.8, 1.25]);
  assert.equal(gate.criteria.nonJevSpeed.ciUpperAtMost, 1.1);
  assert.equal(gate.fallback.blockRounds, 5);
  assert.deepEqual(GATE_RUNNER_CAMPAIGN_IDS.map((id) => gateCampaignFor(gate, id).role), ['autopilot', 'claude', 'fallback-candidate']);
});
