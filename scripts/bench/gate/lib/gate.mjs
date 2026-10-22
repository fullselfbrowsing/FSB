/**
 * The predeclared gate for the v1.0.0 release (Phase 71, EVAL-02; CONTEXT
 * D-04..D-17 and the D-11 amendment of 2026-10-16).
 *
 * The gate file, scripts/bench/gate/release-gate-v1.0.0.json, is frozen
 * before V1. Any change needs a new gateVersion, a new file and a new pinned
 * hash in tests/bench-gate.test.mjs, and never happens after V1 has started.
 *
 * validateGate checks exact keys at every level, the numbers the release may
 * never move (the completion margin 0.10, the 0.90 practical-effect bound,
 * the one-sided alpha 0.025, z and the 10,000 bootstrap iterations), the
 * discretion numbers inside their allowed ranges, round counts that only go
 * up from the power simulation, the campaign ids, seeds and conditions, and
 * the committed-artifact string rules (at most 200 characters, never "://").
 * Every error is a code with a path; no error ever carries a value.
 *
 * Error codes: extra_key, missing_key, type (wrong type, unknown enum value
 * or pattern), fixed (a frozen value differs), range (a number outside its
 * allowed range), duplicate, inconsistent (two fields that must agree do
 * not), string_too_long and url_in_string.
 *
 * Pure except loadGate's single read of the file's bytes: no clock, no
 * environment, no network.
 */

import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { FAST_MODE_OUTCOMES } from '../../lib/fast-mode.mjs';
import { canonicalJson, sha256Hex } from '../../lib/identity.mjs';
import { TYPED_SUCCESS_OUTCOMES } from '../../lib/runs.mjs';

const MAX_STRING = 200;
const MAX_NOTES = 64;
const MAX_TABLE_ROWS = 1000;
const MAX_CLAIM_WORDS = 16;
const MAX_VERIFY_SUITES = 16;
const MAX_ROUNDS = 100;
const HEX64 = /^[0-9a-f]{64}$/;
const CLAIM_WORD = /^[a-z][a-z_]{0,39}$/;
const VERIFY_SUITE = /^node (--test )?tests\/[A-Za-z0-9._/-]+( tests\/[A-Za-z0-9._/-]+)*$/;

export const GATE_SCHEMA_VERSION = 1;
export const GATE_VERSION = '1.0.0';

export const GATE_KEYS = Object.freeze([
  'schemaVersion', 'gateVersion', 'notes', 'corpusLockSha256', 'campaigns', 'identityMatch', 'paths', 'sentinel', 'criteria',
  'exercise', 'safety', 'claimWords', 'fallback', 'bootstrap', 'targets', 'power',
]);

export const GATE_NESTED_KEYS = Object.freeze({
  campaigns: Object.freeze(['baseline', 'autopilot', 'claude']),
  campaign: Object.freeze(['id', 'arms', 'seed', 'conditions', 'minRounds', 'rowSchema']),
  identityMatch: Object.freeze(['claude', 'autopilot', 'reported']),
  paths: Object.freeze(['jev-mcp-run-task', 'jev-autopilot', 'mcp-non-jev']),
  jevPath: Object.freeze(['label', 'family', 'campaign', 'control', 'treatment']),
  nonJevPath: Object.freeze(['label', 'family', 'baseline', 'candidate', 'arm', 'candidateCondition']),
  sentinel: Object.freeze(['baseline', 'candidate', 'arm', 'condition', 'completionMargin', 'speedBand', 'blocker']),
  criteria: Object.freeze(['alphaOneSided', 'z', 'completionMargin', 'jevSpeed', 'nonJevSpeed', 'scope']),
  jevSpeed: Object.freeze(['ciUpperBelow', 'maxEstimate', 'belowAaFloorLower']),
  nonJevSpeed: Object.freeze(['ciUpperAtMost', 'fasterCiUpperBelow']),
  exercise: Object.freeze(['minActedShare', 'requireCalibrated', 'singleModelInstrumentPair', 'captureArmFalse', 'noOffActivity', 'actedAttempt']),
  safety: Object.freeze(['events', 'actedZeroTolerance', 'compare', 'unknownExposure', 'verifySuites']),
  claimWords: Object.freeze(['autopilot', 'claude']),
  claimWordsAutopilot: Object.freeze(['baseline', 'candidate', 'candidateTypedOutcome']),
  claimWordsClaude: Object.freeze(['completeTask']),
  fallback: Object.freeze(['campaignId', 'arm', 'campaigns', 'blockRounds', 'triggers', 'replaces', 'criteria', 'sentinel', 'design',
    'decision', 'tooling']),
  fallbackCampaigns: Object.freeze(['pin', 'candidate']),
  fallbackCampaign: Object.freeze(['id', 'seed', 'conditions', 'rowSchema', 'minRounds']),
  bootstrap: Object.freeze(['iterations', 'seed', 'level', 'sensitivityLevel']),
  targets: Object.freeze(['autopilotMixed', 'mcpClickHeavy', 'mcpUatStyle', 'use']),
  power: Object.freeze(['floorCompletionRate', 'minPower', 'maxSentinelFalseTrip', 'seed', 'reps', 'speedReps', 'safetyReps', 'iterations',
    'recommendedRounds', 'met', 'table', 'spend', 'safetyTable']),
  powerTableRow: Object.freeze(['comparison', 'rounds', 'p', 'pass']),
  spend: Object.freeze(['roundsPerArm', 'v1CoreRuns', 'v4AutopilotRuns', 'v4ClaudeRuns', 'defaultRuns']),
  defaultRuns: Object.freeze(['v1', 'v4Autopilot', 'v4Claude']),
  safetyTableRow: Object.freeze(['p', 'actedShare', 'unknownShare', 'rounds', 'ruleA', 'ruleAExact', 'ruleB', 'jevSafety', 'nonJev']),
});

// The numbers no gate version of this release may move (D-12, D-13, Claude's
// Discretion: "fixed").
export const FIXED_CRITERIA = Object.freeze({
  completionMargin: 0.10,
  maxEstimate: 0.90,
  alphaOneSided: 0.025,
  z: 1.959963984540054,
  iterations: 10000,
});

// Campaign roles: fixed ids, arms, seeds, conditions and row schemas, and the
// round floors the simulation may only raise (D-04, D-06; 71-04).
export const GATE_CAMPAIGNS = Object.freeze({
  baseline: Object.freeze({ id: 'core-baseline-66', arms: Object.freeze(['autopilot', 'claude']), seed: 66, conditions: null, rowSchema: 1, minRoundsFloor: 10 }),
  autopilot: Object.freeze({ id: 'core-gate-71-autopilot', arms: Object.freeze(['autopilot']), seed: 71, conditions: Object.freeze(['off', 'on']), rowSchema: 2, minRoundsFloor: 20 }),
  claude: Object.freeze({ id: 'core-gate-71-claude', arms: Object.freeze(['claude']), seed: 66, conditions: Object.freeze(['off']), rowSchema: 2, minRoundsFloor: 10 }),
});

export const GATE_FALLBACK_CAMPAIGNS = Object.freeze({
  pin: Object.freeze({ id: 'core-rebaseline-71-pin', seed: 66, conditions: null, rowSchema: 1 }),
  candidate: Object.freeze({ id: 'core-rebaseline-71-candidate', seed: 66, conditions: Object.freeze(['off']), rowSchema: 2 }),
});

// The campaigns a Jev-tree runner runs under --gate. The V1 baseline and the
// fallback pin campaign run the Phase 66 runner at the pin, so their
// arguments are checked by hand (M-71-01b, M-71-08b).
export const GATE_RUNNER_CAMPAIGN_IDS = Object.freeze([
  GATE_CAMPAIGNS.autopilot.id, GATE_CAMPAIGNS.claude.id, GATE_FALLBACK_CAMPAIGNS.candidate.id,
]);

const FIXED_IDENTITY_MATCH = Object.freeze({
  claude: Object.freeze(['hosts.claude.version', 'hosts.claude.model', 'hosts.claude.toolSearchEnv', 'hosts.claude.envKeyNamesSha256',
    'provider.requestedModel', 'corpus', 'chromeMajor']),
  autopilot: Object.freeze(['provider.requestedModel', 'corpus', 'chromeMajor']),
  reported: Object.freeze(['hosts.claude.agentPolicySha256', 'mcp.toolsList.sha256']),
});

const FIXED_PATHS = Object.freeze({
  'jev-mcp-run-task': Object.freeze({ label: 'MCP run_task fast loop', family: 'jev', campaign: 'autopilot', control: 'off', treatment: 'on' }),
  'jev-autopilot': Object.freeze({
    label: 'Autopilot fast mode, measured through run_task (shared loop mechanics)',
    family: 'jev', campaign: 'autopilot', control: 'off', treatment: 'on',
  }),
  'mcp-non-jev': Object.freeze({
    label: 'Non-Jev MCP changes: shorter descriptions, optional expect and the settings tool',
    family: 'non-jev', baseline: 'baseline', candidate: 'claude', arm: 'claude', candidateCondition: 'off',
  }),
});

const FIXED_SENTINEL = Object.freeze({
  baseline: 'baseline', candidate: 'autopilot', arm: 'autopilot', condition: 'off', completionMargin: FIXED_CRITERIA.completionMargin,
  blocker: 'autopilot off-path regression or drift: investigate before V6',
});

const FIXED_EXERCISE = Object.freeze({
  requireCalibrated: true, singleModelInstrumentPair: true, captureArmFalse: true, noOffActivity: true,
  actedAttempt: 'fallback === null && op !== null && stepOutcome !== null',
});

const FIXED_SAFETY = Object.freeze({
  events: Object.freeze(['requestOvercount', 'unexpectedMutations', 'claimedSuccessOnFail']),
  actedZeroTolerance: true,
  compare: 'rate-per-counted-run',
  unknownExposure: 'acted',
});

const FIXED_FALLBACK = Object.freeze({
  campaignId: 'core-rebaseline-71',
  arm: 'claude',
  triggers: Object.freeze(['sentinel_trip', 'identity_mismatch', 'resume_drift']),
  replaces: 'mcp-non-jev',
  criteria: 'mcp-non-jev',
  sentinel: 'not_applicable',
  design: 'pin runner and build (8a058bdf worktree) and candidate runner and build run in alternating blocks of blockRounds rounds in one window',
  decision: 'owner at V4',
  tooling: 'none; manual V4 procedure',
});

const FIXED_BOOTSTRAP = Object.freeze({ iterations: FIXED_CRITERIA.iterations, seed: 71, level: 0.95, sensitivityLevel: 0.975 });

const FIXED_TARGETS = Object.freeze({
  autopilotMixed: Object.freeze([1.5, 2.0]),
  mcpClickHeavy: Object.freeze([2.0, 3.0]),
  mcpUatStyle: Object.freeze([1.3, 1.6]),
  use: 'report met or not met; never a pass condition',
});

const FIXED_POWER = Object.freeze({ floorCompletionRate: 0.80, minPower: 0.8, maxSentinelFalseTrip: 0.2 });

export const POWER_COMPARISONS = Object.freeze(['jev-ni', 'claude-ni', 'sentinel-equivalence', 'sentinel-speed']);

// Claude's Discretion: the numbers that may sit anywhere inside these ranges.
export const DISCRETION_RANGES = Object.freeze({
  minActedShare: Object.freeze([0.40, 0.60]),
  nonJevCiUpperAtMost: Object.freeze([1.0, 1.25]),
  blockRounds: Object.freeze([1, 10]),
});

// --- Shared rule helpers (same codes and semantics as scripts/bench/lib/runs.mjs) --------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkKeys(value, keys, where, errors) {
  if (!isPlainObject(value)) {
    errors.push(`type:${where}`);
    return false;
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`extra_key:${where ? `${where}.` : ''}${key}`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`missing_key:${where ? `${where}.` : ''}${key}`);
  return true;
}

function walkStrings(value, where, errors) {
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) errors.push(`string_too_long:${where}`);
    if (value.includes('://')) errors.push(`url_in_string:${where}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${where}[${index}]`, errors));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) walkStrings(child, where ? `${where}.${key}` : key, errors);
  }
}

function expectType(ok, where, errors) {
  if (!ok) errors.push(`type:${where}`);
}

// --- Gate-specific helpers --------------------------------------------------------------------

const join = (where, key) => (where ? `${where}.${key}` : key);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isUnit = (v) => isFiniteNumber(v) && v >= 0 && v <= 1;
const isPositiveInt = (v) => Number.isSafeInteger(v) && v >= 1;
const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

function expectFixed(value, expected, where, errors) {
  if (!isDeepStrictEqual(value, expected)) errors.push(`fixed:${where}`);
}

// Fixed scalar or array fields of an object whose keys were already checked.
function expectFixedFields(object, fixed, where, errors) {
  for (const [key, expected] of Object.entries(fixed)) {
    if (Object.prototype.hasOwnProperty.call(object, key)) expectFixed(object[key], expected, join(where, key), errors);
  }
}

// An integer in [lo, hi]: `type` when not an integer, `range` when outside.
function expectIntInRange(value, lo, hi, where, errors) {
  if (!Number.isSafeInteger(value)) {
    errors.push(`type:${where}`);
    return false;
  }
  if (value < lo || value > hi) {
    errors.push(`range:${where}`);
    return false;
  }
  return true;
}

function expectUnit(value, where, errors) {
  if (!isFiniteNumber(value)) errors.push(`type:${where}`);
  else if (value < 0 || value > 1) errors.push(`range:${where}`);
}

// A non-empty, bounded list of distinct strings matching `pattern`.
function expectTokenList(value, pattern, max, where, errors) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    errors.push(`type:${where}`);
    return;
  }
  value.forEach((item, index) => expectType(typeof item === 'string' && pattern.test(item), `${where}[${index}]`, errors));
  if (new Set(value).size !== value.length) errors.push(`duplicate:${where}`);
}

// --- Sections ---------------------------------------------------------------------------------

function validateNotes(gate, errors) {
  const notes = gate.notes;
  if (!Array.isArray(notes) || notes.length === 0 || notes.length > MAX_NOTES) {
    errors.push('type:notes');
    return;
  }
  notes.forEach((note, index) => expectType(typeof note === 'string' && note.trim().length > 0, `notes[${index}]`, errors));
}

function validateCampaigns(campaigns, errors) {
  if (!checkKeys(campaigns, GATE_NESTED_KEYS.campaigns, 'campaigns', errors)) return;
  for (const role of GATE_NESTED_KEYS.campaigns) {
    const where = `campaigns.${role}`;
    const entry = campaigns[role];
    if (entry === undefined) continue;
    if (!checkKeys(entry, GATE_NESTED_KEYS.campaign, where, errors)) continue;
    const rule = GATE_CAMPAIGNS[role];
    expectFixedFields(entry, { id: rule.id, arms: [...rule.arms], seed: rule.seed, conditions: rule.conditions && [...rule.conditions], rowSchema: rule.rowSchema },
      where, errors);
    if (Object.prototype.hasOwnProperty.call(entry, 'minRounds')) expectIntInRange(entry.minRounds, rule.minRoundsFloor, MAX_ROUNDS, `${where}.minRounds`, errors);
  }
}

function validateIdentityMatch(identityMatch, errors) {
  if (!checkKeys(identityMatch, GATE_NESTED_KEYS.identityMatch, 'identityMatch', errors)) return;
  expectFixedFields(identityMatch, { claude: [...FIXED_IDENTITY_MATCH.claude], autopilot: [...FIXED_IDENTITY_MATCH.autopilot],
    reported: [...FIXED_IDENTITY_MATCH.reported] }, 'identityMatch', errors);
}

function validatePaths(paths, errors) {
  if (!checkKeys(paths, GATE_NESTED_KEYS.paths, 'paths', errors)) return;
  for (const name of GATE_NESTED_KEYS.paths) {
    if (paths[name] === undefined) continue;
    const where = `paths.${name}`;
    const keys = name === 'mcp-non-jev' ? GATE_NESTED_KEYS.nonJevPath : GATE_NESTED_KEYS.jevPath;
    if (checkKeys(paths[name], keys, where, errors)) expectFixedFields(paths[name], FIXED_PATHS[name], where, errors);
  }
}

function validateSentinel(sentinel, errors) {
  if (!checkKeys(sentinel, GATE_NESTED_KEYS.sentinel, 'sentinel', errors)) return;
  expectFixedFields(sentinel, FIXED_SENTINEL, 'sentinel', errors);
  if (!Object.prototype.hasOwnProperty.call(sentinel, 'speedBand')) return;
  const band = sentinel.speedBand;
  if (!Array.isArray(band) || band.length !== 2 || !band.every(isFiniteNumber)) {
    errors.push('type:sentinel.speedBand');
    return;
  }
  const [lo, hi] = band;
  if (!(lo > 0 && lo < 1 && hi > 1)) errors.push('range:sentinel.speedBand');
}

function validateCriteria(criteria, errors) {
  if (!checkKeys(criteria, GATE_NESTED_KEYS.criteria, 'criteria', errors)) return;
  expectFixedFields(criteria, {
    alphaOneSided: FIXED_CRITERIA.alphaOneSided, z: FIXED_CRITERIA.z, completionMargin: FIXED_CRITERIA.completionMargin, scope: 'core',
  }, 'criteria', errors);
  if (criteria.jevSpeed !== undefined && checkKeys(criteria.jevSpeed, GATE_NESTED_KEYS.jevSpeed, 'criteria.jevSpeed', errors)) {
    expectFixedFields(criteria.jevSpeed, { ciUpperBelow: 1.0, maxEstimate: FIXED_CRITERIA.maxEstimate, belowAaFloorLower: true },
      'criteria.jevSpeed', errors);
  }
  if (criteria.nonJevSpeed !== undefined && checkKeys(criteria.nonJevSpeed, GATE_NESTED_KEYS.nonJevSpeed, 'criteria.nonJevSpeed', errors)) {
    expectFixedFields(criteria.nonJevSpeed, { fasterCiUpperBelow: 1.0 }, 'criteria.nonJevSpeed', errors);
    const bound = criteria.nonJevSpeed.ciUpperAtMost;
    const [lo, hi] = DISCRETION_RANGES.nonJevCiUpperAtMost;
    if (Object.prototype.hasOwnProperty.call(criteria.nonJevSpeed, 'ciUpperAtMost')) {
      if (!isFiniteNumber(bound)) errors.push('type:criteria.nonJevSpeed.ciUpperAtMost');
      else if (!(bound > lo && bound <= hi)) errors.push('range:criteria.nonJevSpeed.ciUpperAtMost');
    }
  }
}

function validateExercise(exercise, errors) {
  if (!checkKeys(exercise, GATE_NESTED_KEYS.exercise, 'exercise', errors)) return;
  expectFixedFields(exercise, FIXED_EXERCISE, 'exercise', errors);
  if (!Object.prototype.hasOwnProperty.call(exercise, 'minActedShare')) return;
  const share = exercise.minActedShare;
  const [lo, hi] = DISCRETION_RANGES.minActedShare;
  if (!isFiniteNumber(share)) errors.push('type:exercise.minActedShare');
  else if (share < lo || share > hi) errors.push('range:exercise.minActedShare');
}

function validateSafety(safety, errors) {
  if (!checkKeys(safety, GATE_NESTED_KEYS.safety, 'safety', errors)) return;
  expectFixedFields(safety, { ...FIXED_SAFETY, events: [...FIXED_SAFETY.events] }, 'safety', errors);
  if (Object.prototype.hasOwnProperty.call(safety, 'verifySuites')) {
    expectTokenList(safety.verifySuites, VERIFY_SUITE, MAX_VERIFY_SUITES, 'safety.verifySuites', errors);
  }
}

function validateClaimWords(claimWords, errors) {
  if (!checkKeys(claimWords, GATE_NESTED_KEYS.claimWords, 'claimWords', errors)) return;
  const autopilot = claimWords.autopilot;
  if (autopilot !== undefined && checkKeys(autopilot, GATE_NESTED_KEYS.claimWordsAutopilot, 'claimWords.autopilot', errors)) {
    for (const key of ['baseline', 'candidate']) {
      if (Object.prototype.hasOwnProperty.call(autopilot, key)) {
        expectTokenList(autopilot[key], CLAIM_WORD, MAX_CLAIM_WORDS, `claimWords.autopilot.${key}`, errors);
      }
    }
    // The D-09 item-3 substitution: exactly runs.mjs TYPED_SUCCESS_OUTCOMES,
    // and only words Phase 70's run_task fast_mode block can report.
    if (Object.prototype.hasOwnProperty.call(autopilot, 'candidateTypedOutcome')) {
      const typed = autopilot.candidateTypedOutcome;
      const ok = isDeepStrictEqual(typed, [...TYPED_SUCCESS_OUTCOMES]) && typed.every((word) => FAST_MODE_OUTCOMES.includes(word));
      if (!ok) errors.push('fixed:claimWords.autopilot.candidateTypedOutcome');
    }
  }
  if (claimWords.claude !== undefined && checkKeys(claimWords.claude, GATE_NESTED_KEYS.claimWordsClaude, 'claimWords.claude', errors)) {
    expectFixedFields(claimWords.claude, { completeTask: true }, 'claimWords.claude', errors);
  }
}

function validateFallback(fallback, errors) {
  if (!checkKeys(fallback, GATE_NESTED_KEYS.fallback, 'fallback', errors)) return;
  expectFixedFields(fallback, { ...FIXED_FALLBACK, triggers: [...FIXED_FALLBACK.triggers] }, 'fallback', errors);
  if (Object.prototype.hasOwnProperty.call(fallback, 'blockRounds')) {
    const [lo, hi] = DISCRETION_RANGES.blockRounds;
    expectIntInRange(fallback.blockRounds, lo, hi, 'fallback.blockRounds', errors);
  }
  if (fallback.campaigns === undefined) return;
  if (!checkKeys(fallback.campaigns, GATE_NESTED_KEYS.fallbackCampaigns, 'fallback.campaigns', errors)) return;
  for (const role of GATE_NESTED_KEYS.fallbackCampaigns) {
    const entry = fallback.campaigns[role];
    if (entry === undefined) continue;
    const where = `fallback.campaigns.${role}`;
    if (!checkKeys(entry, GATE_NESTED_KEYS.fallbackCampaign, where, errors)) continue;
    const rule = GATE_FALLBACK_CAMPAIGNS[role];
    expectFixedFields(entry, { id: rule.id, seed: rule.seed, conditions: rule.conditions && [...rule.conditions], rowSchema: rule.rowSchema },
      where, errors);
    if (Object.prototype.hasOwnProperty.call(entry, 'minRounds')) expectIntInRange(entry.minRounds, 10, MAX_ROUNDS, `${where}.minRounds`, errors);
  }
}

function validateBootstrap(bootstrap, errors) {
  if (checkKeys(bootstrap, GATE_NESTED_KEYS.bootstrap, 'bootstrap', errors)) expectFixedFields(bootstrap, FIXED_BOOTSTRAP, 'bootstrap', errors);
}

function validateTargets(targets, errors) {
  if (!checkKeys(targets, GATE_NESTED_KEYS.targets, 'targets', errors)) return;
  expectFixedFields(targets, {
    autopilotMixed: [...FIXED_TARGETS.autopilotMixed], mcpClickHeavy: [...FIXED_TARGETS.mcpClickHeavy],
    mcpUatStyle: [...FIXED_TARGETS.mcpUatStyle], use: FIXED_TARGETS.use,
  }, 'targets', errors);
}

function validateRows(rows, keys, where, errors, validateRow) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_TABLE_ROWS) {
    errors.push(`type:${where}`);
    return false;
  }
  let ok = true;
  rows.forEach((row, index) => {
    const at = `${where}[${index}]`;
    const before = errors.length;
    if (checkKeys(row, keys, at, errors)) validateRow(row, at);
    if (errors.length !== before) ok = false;
  });
  return ok;
}

function validatePower(power, errors) {
  if (!checkKeys(power, GATE_NESTED_KEYS.power, 'power', errors)) return { ok: false };
  const before = errors.length;
  expectFixedFields(power, FIXED_POWER, 'power', errors);
  expectType(Number.isSafeInteger(power.seed), 'power.seed', errors);
  for (const key of ['reps', 'speedReps', 'safetyReps', 'iterations']) expectType(isPositiveInt(power[key]), `power.${key}`, errors);
  expectIntInRange(power.recommendedRounds, GATE_CAMPAIGNS.autopilot.minRoundsFloor, MAX_ROUNDS, 'power.recommendedRounds', errors);
  expectType(typeof power.met === 'boolean', 'power.met', errors);

  const tableOk = validateRows(power.table, GATE_NESTED_KEYS.powerTableRow, 'power.table', errors, (row, at) => {
    expectType(POWER_COMPARISONS.includes(row.comparison), `${at}.comparison`, errors);
    expectIntInRange(row.rounds, 1, MAX_ROUNDS, `${at}.rounds`, errors);
    expectUnit(row.p, `${at}.p`, errors);
    expectUnit(row.pass, `${at}.pass`, errors);
  });

  if (checkKeys(power.spend, GATE_NESTED_KEYS.spend, 'power.spend', errors)) {
    for (const key of ['roundsPerArm', 'v1CoreRuns', 'v4AutopilotRuns', 'v4ClaudeRuns']) {
      if (power.spend[key] !== undefined) expectType(isCount(power.spend[key]), `power.spend.${key}`, errors);
    }
    if (power.spend.defaultRuns !== undefined && checkKeys(power.spend.defaultRuns, GATE_NESTED_KEYS.defaultRuns, 'power.spend.defaultRuns', errors)) {
      for (const key of GATE_NESTED_KEYS.defaultRuns) {
        if (power.spend.defaultRuns[key] !== undefined) expectType(isCount(power.spend.defaultRuns[key]), `power.spend.defaultRuns.${key}`, errors);
      }
    }
  }

  const safetyOk = validateRows(power.safetyTable, GATE_NESTED_KEYS.safetyTableRow, 'power.safetyTable', errors, (row, at) => {
    for (const key of GATE_NESTED_KEYS.safetyTableRow) {
      if (key === 'rounds') expectIntInRange(row.rounds, 1, MAX_ROUNDS, `${at}.rounds`, errors);
      else expectUnit(row[key], `${at}.${key}`, errors);
    }
  });
  return { ok: errors.length === before, tableOk, safetyOk };
}

// --- Cross-field rules ---------------------------------------------------------------------------

function crossCheck(gate, power, errors) {
  if (!isPlainObject(power) || !Number.isSafeInteger(power.recommendedRounds)) return;
  const rounds = power.recommendedRounds;

  // Rounds only go up from the simulation; the fallback campaigns run exactly R.
  if (isPlainObject(gate.campaigns)) {
    for (const role of GATE_NESTED_KEYS.campaigns) {
      const entry = gate.campaigns[role];
      if (isPlainObject(entry) && Number.isSafeInteger(entry.minRounds) && entry.minRounds < rounds) {
        const where = `range:campaigns.${role}.minRounds`;
        if (!errors.includes(where)) errors.push(where);
      }
    }
  }
  const fallbackCampaigns = isPlainObject(gate.fallback) && isPlainObject(gate.fallback.campaigns) ? gate.fallback.campaigns : null;
  if (fallbackCampaigns) {
    for (const role of GATE_NESTED_KEYS.fallbackCampaigns) {
      const entry = fallbackCampaigns[role];
      if (isPlainObject(entry) && Number.isSafeInteger(entry.minRounds) && entry.minRounds <= MAX_ROUNDS && entry.minRounds !== rounds) {
        errors.push(`inconsistent:fallback.campaigns.${role}.minRounds`);
      }
    }
  }

  if (isPlainObject(power.spend) && Number.isSafeInteger(power.spend.roundsPerArm) && power.spend.roundsPerArm !== rounds) {
    errors.push('inconsistent:power.spend.roundsPerArm');
  }

  // met: every comparison passes at R and the floor completion rate.
  if (power.met === true && Array.isArray(power.table)) {
    const atFloor = power.table.filter((row) => isPlainObject(row) && row.rounds === rounds && row.p === power.floorCompletionRate);
    const passes = POWER_COMPARISONS.every((comparison) => {
      const row = atFloor.find((entry) => entry.comparison === comparison);
      return Boolean(row) && isFiniteNumber(row.pass) && row.pass >= power.minPower;
    });
    if (!passes) errors.push('inconsistent:power.met');
  }
  if (power.met === false && Array.isArray(gate.notes) && !gate.notes.some((note) => typeof note === 'string' && /\bshortfall\b/i.test(note))) {
    errors.push('inconsistent:notes');
  }

  // Every (p, actedShare, unknownShare) cell has a row at R.
  if (Array.isArray(power.safetyTable) && power.safetyTable.every(isPlainObject)) {
    const cell = (row) => canonicalJson([row.p, row.actedShare, row.unknownShare]);
    const atR = new Set(power.safetyTable.filter((row) => row.rounds === rounds).map(cell));
    if (atR.size === 0 || power.safetyTable.some((row) => !atR.has(cell(row)))) errors.push('inconsistent:power.safetyTable');
  }
}

// --- Public API --------------------------------------------------------------------------------

/** Exact-key validation of a parsed gate; never throws, never echoes a value. */
export function validateGate(gate) {
  const errors = [];
  if (!checkKeys(gate, GATE_KEYS, '', errors)) return { ok: false, errors };
  walkStrings(gate, '', errors);
  const has = (key) => Object.prototype.hasOwnProperty.call(gate, key);

  if (has('schemaVersion')) expectFixed(gate.schemaVersion, GATE_SCHEMA_VERSION, 'schemaVersion', errors);
  if (has('gateVersion')) expectFixed(gate.gateVersion, GATE_VERSION, 'gateVersion', errors);
  if (has('notes')) validateNotes(gate, errors);
  if (has('corpusLockSha256')) expectType(typeof gate.corpusLockSha256 === 'string' && HEX64.test(gate.corpusLockSha256), 'corpusLockSha256', errors);
  if (has('campaigns')) validateCampaigns(gate.campaigns, errors);
  if (has('identityMatch')) validateIdentityMatch(gate.identityMatch, errors);
  if (has('paths')) validatePaths(gate.paths, errors);
  if (has('sentinel')) validateSentinel(gate.sentinel, errors);
  if (has('criteria')) validateCriteria(gate.criteria, errors);
  if (has('exercise')) validateExercise(gate.exercise, errors);
  if (has('safety')) validateSafety(gate.safety, errors);
  if (has('claimWords')) validateClaimWords(gate.claimWords, errors);
  if (has('fallback')) validateFallback(gate.fallback, errors);
  if (has('bootstrap')) validateBootstrap(gate.bootstrap, errors);
  if (has('targets')) validateTargets(gate.targets, errors);
  if (has('power')) {
    validatePower(gate.power, errors);
    crossCheck(gate, gate.power, errors);
  }
  return { ok: errors.length === 0, errors };
}

function gateError(codes) {
  const error = new Error(codes.join(', '));
  error.codes = codes;
  return error;
}

/**
 * Reads the gate file's bytes once, hashes those raw bytes and validates the
 * parsed gate. Throws an Error whose message lists only error codes
 * (`unreadable`, `json_invalid` or the validateGate codes).
 */
export function loadGate(file) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    throw gateError(['unreadable']);
  }
  let gate;
  try {
    gate = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw gateError(['json_invalid']);
  }
  const result = validateGate(gate);
  if (!result.ok) throw gateError(result.errors);
  return { gate, sha256: sha256Hex(bytes) };
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * The corpus digest the gate pins: sha256 of the canonical JSON of the tasks
 * reduced to {id, version, fixtureSha256} and sorted by id. Input order and
 * any other key never change it.
 */
export function corpusDigest(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const reduced = list
    .map((task) => ({ id: task && task.id, version: task && task.version, fixtureSha256: task && task.fixtureSha256 }))
    .sort((a, b) => codeUnitCompare(String(a.id), String(b.id)));
  return sha256Hex(canonicalJson(reduced));
}

/**
 * The arguments a gate campaign must run with on a Jev-tree runner, or null
 * for any other id (the pin-runner campaigns included).
 */
export function gateCampaignFor(gate, campaignId) {
  if (!isPlainObject(gate) || typeof campaignId !== 'string' || !GATE_RUNNER_CAMPAIGN_IDS.includes(campaignId)) return null;
  const describe = (role, entry, arms) => ({
    role,
    id: entry.id,
    arms: [...arms],
    seed: entry.seed,
    conditions: Array.isArray(entry.conditions) ? [...entry.conditions] : entry.conditions,
    minRounds: entry.minRounds,
  });
  const campaigns = isPlainObject(gate.campaigns) ? gate.campaigns : {};
  for (const role of ['autopilot', 'claude']) {
    const entry = campaigns[role];
    if (isPlainObject(entry) && entry.id === campaignId && Array.isArray(entry.arms)) return describe(role, entry, entry.arms);
  }
  const fallback = isPlainObject(gate.fallback) ? gate.fallback : null;
  const candidate = fallback && isPlainObject(fallback.campaigns) ? fallback.campaigns.candidate : null;
  if (isPlainObject(candidate) && candidate.id === campaignId && typeof fallback.arm === 'string') {
    return describe('fallback-candidate', candidate, [fallback.arm]);
  }
  return null;
}
