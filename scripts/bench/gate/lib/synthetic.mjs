/**
 * Phase 71 seeded synthetic campaigns (D-19; 71-RESEARCH Pattern 7).
 *
 * Pure: the same input and seed always give the same result, and nothing
 * here reads the clock, the environment or the filesystem. Randomness comes
 * from mulberry32 (scripts/bench/lib/stats.mjs) only, in separate streams for
 * infra errors, pass/fail, wall time, Jev exposure and the fast_mode block,
 * so turning one knob never reshuffles the draws behind another.
 *
 * makeRawCampaign builds raw run records shaped like the ones run-bench.mjs
 * writes: schema 1 for the Phase 66 runner at the pin (the V1 baseline) and
 * schema 2 for the Phase 71 runner. Run ids and orders come from
 * buildSchedule. makeCampaign turns the records into committed rows through
 * toCommittedRow, so every v2 jev block follows the 71-SYNC-RECHECK Exposure
 * rule, and refuses any row that validateCommittedRow rejects. Both also
 * return `safety`, a Map from runId to {requestOvercount, unexpectedMutations}
 * for every counted run: the sidecar the evaluator reads for schema-1 rows,
 * which carry no safety block.
 *
 * Options (all optional except seed):
 * - seed: the draws. scheduleSeed (default seed) is the ABBA schedule seed
 *   that identity.schedule.seed records.
 * - schemaVersion 1 or 2 (default 2); arms (default autopilot and claude for
 *   schema 1, autopilot for schema 2); conditions (schema 2 only; default
 *   ['off', 'on'], null for none); rounds (default 10); campaignId; taskIds
 *   (default CORE_TASK_IDS_SYNTHETIC; the first floor(n / 2) are 'mixed',
 *   the rest 'click-heavy'); createdAt.
 * - taskRates: one completion rate, or one per task. A run passes with
 *   probability taskRate + the completion effect of its group.
 * - wallMs {base, sigma}: wall time is lognormal around base[task] x the speed
 *   effect of its group, with log-sd sigma (one number, or per group key).
 * - effect: {<arm> | <arm>/<condition>: {speed, completion}}; speed multiplies
 *   the wall time (default 1), completion is added to the rate (default 0).
 * - jev {actRate, calibrated, models, missingRate, noBlockRate, unknownRate,
 *   detailMissingRate, leakOff}: the exposure of counted autopilot 'on' rows.
 *   Each such row is one of: 'missing' (a run_task fast_mode summary with at
 *   least one attempt, no jevMeasurement, flag jev_measurement_missing),
 *   'no_block' (neither block: zero Jev attempts), 'unknown' (a fast_mode
 *   block whose jev is null, no jevMeasurement), 'detail_missing' (neither
 *   block, flag session_detail_missing: the session detail was never read),
 *   or otherwise a jevMeasurement whose summary in the fast_mode block agrees
 *   with it. Measurement and missing rows act with probability actRate.
 *   leakOff {count, kind} gives the first count counted 'off' rows Jev
 *   activity: 'calls' (a jevMeasurement with jevCalls 2 and no fast step),
 *   'local' (a jevMeasurement whose only attempt is a local sensitive_goal
 *   fallback with jevCalled false) or 'summary' (a fast_mode block with the
 *   zero jev summary).
 * - fastMode {falseDone, ambiguousOnPass, missingRate, statusMismatch}: the
 *   block says 'done' on passing 'on' runs and 'blocked' on failing ones.
 *   falseDone cells put 'done' on failing runs (the status then says
 *   'success', or 'error' with statusMismatch); ambiguousOnPass cells put
 *   'ambiguous' on passing runs; missingRate drops the block from
 *   measurement rows. A cell is {acted?, count, statusMismatch?}.
 * - safety {events}: each event {kind, arm?, condition?, acted?, count,
 *   value?} lands on the first count counted rows of its cell, in schedule
 *   order. Kinds: requestOvercount and unexpectedMutations (value, default
 *   1), unverifiable (both counts null) and claimedSuccessOnFail (a success
 *   claim on a failed run). A row takes at most one evidence event and one
 *   claim. Events never change pass/fail: a real duplicate would also fail
 *   the run's total-count check, which the evaluator does not rely on.
 * - infra {rate, code}: an infra error (default provider_error) with
 *   probability rate. Infra rows have no wall time, outcome or Jev data.
 * - identity: overrides merged into the campaign identity (plain objects
 *   merge, anything else replaces, undefined removes the key).
 */

import { createHash } from 'node:crypto';

import { ARMS, CONDITIONS, INFRA_CODES, buildSchedule, toCommittedRow, validateCommittedRow } from '../../lib/runs.mjs';
import { mulberry32 } from '../../lib/stats.mjs';

export const CORE_TASK_IDS_SYNTHETIC = Object.freeze(
  Array.from({ length: 12 }, (_, i) => `core-syn-${String(i + 1).padStart(2, '0')}`),
);

// Per-task base wall times in ms (RESEARCH A2 illustration: tasks of different
// scale). The power script reads them for its wall-time model.
export const SYNTHETIC_TASK_BASE_MS = Object.freeze([
  30000, 36000, 42000, 48000, 54000, 60000, 33000, 39000, 45000, 51000, 57000, 63000,
]);

export const SYNTHETIC_PIN_SHA = '8a058bdf0d17c1e3e79ec3104cc1996326b4c402';
export const SYNTHETIC_CANDIDATE_SHA = '7171717171717171717171717171717171717171';
export const SYNTHETIC_DEFAULT_CREATED_AT = '2026-11-02T00:00:00.000Z';
export const SYNTHETIC_DEFAULT_MODELS = Object.freeze([
  Object.freeze({ servedModel: 'jev-1.13.0', instrumentVersion: 'fsb-jev-instrument-1' }),
]);

const DEFAULT_SIGMA = 0.3;
const DEFAULT_TASK_RATE = 0.9;
const DEFAULT_ACT_RATE = 0.8;
const COOLDOWN_MS = 3000;
const RUN_SPACING_MS = 120000;
const REQUESTED_MODEL = 'grok-4.3';
const SUPPORTED_ARMS = Object.freeze(['autopilot', 'claude']);
const LEAK_KINDS = Object.freeze(['calls', 'local', 'summary']);
const EVENT_KINDS = Object.freeze(['requestOvercount', 'unexpectedMutations', 'unverifiable', 'claimedSuccessOnFail']);
const STREAMS = Object.freeze({ infra: 1, pass: 2, wall: 3, jev: 4, fast: 5 });

const OPTION_KEYS = Object.freeze({
  top: Object.freeze([
    'seed', 'scheduleSeed', 'campaignId', 'schemaVersion', 'arms', 'conditions', 'rounds', 'taskIds', 'taskRates',
    'wallMs', 'effect', 'jev', 'fastMode', 'safety', 'infra', 'identity', 'createdAt',
  ]),
  wallMs: Object.freeze(['base', 'sigma']),
  effect: Object.freeze(['speed', 'completion']),
  jev: Object.freeze(['actRate', 'calibrated', 'models', 'missingRate', 'noBlockRate', 'unknownRate', 'detailMissingRate', 'leakOff']),
  leakOff: Object.freeze(['count', 'kind']),
  model: Object.freeze(['servedModel', 'instrumentVersion']),
  fastMode: Object.freeze(['falseDone', 'ambiguousOnPass', 'missingRate', 'statusMismatch']),
  falseDone: Object.freeze(['acted', 'count', 'statusMismatch']),
  ambiguousOnPass: Object.freeze(['acted', 'count']),
  safety: Object.freeze(['events']),
  event: Object.freeze(['kind', 'arm', 'condition', 'acted', 'count', 'value']),
  infra: Object.freeze(['rate', 'code']),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hashOf(label) {
  return createHash('sha256').update(label).digest('hex');
}

/** One standard normal draw (Box-Muller over two mulberry32 draws). */
export function standardNormal(rnd) {
  const u1 = 1 - rnd();
  const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function streamOf(seed, k) {
  return mulberry32((Math.imul(seed | 0, 0x9e3779b1) + Math.imul(k, 0x85ebca77)) >>> 0);
}

// --- Identity ---------------------------------------------------------------------------

function mergeOverrides(base, overrides) {
  const out = clone(base);
  if (!isPlainObject(overrides)) return out;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete out[key];
      continue;
    }
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeOverrides(out[key], value) : clone(value);
  }
  return out;
}

function fixtureShaOf(taskId) {
  return hashOf(`fsb-synthetic-fixture:${taskId}`);
}

/**
 * A campaign identity in the run-bench.mjs collectIdentity shape, for the
 * V4 autopilot campaign by default. Overrides merge in: plain objects merge
 * key by key, anything else replaces, and undefined removes the key.
 */
export function defaultIdentity(overrides = {}) {
  const base = {
    schemaVersion: 1,
    campaignId: 'core-gate-71-autopilot',
    mode: 'campaign',
    set: 'core',
    createdAt: SYNTHETIC_DEFAULT_CREATED_AT,
    schedule: { runs: 480, rounds: 20, arms: ['autopilot'], seed: 71, cooldownMs: COOLDOWN_MS, conditions: ['off', 'on'] },
    git: { sha: SYNTHETIC_CANDIDATE_SHA, dirty: false },
    node: 'v20.20.2',
    extension: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      version: '0.9.92',
      measurement: { callTiming: 1, sessionDetailJournal: 1 },
      telemetryOptOut: true,
      startTabActive: true,
    },
    mcp: {
      serverName: 'fsb-mcp-server',
      serverVersion: '0.11.2',
      sdkVersion: '1.29.0',
      toolsList: { count: 73, sha256: hashOf('fsb-synthetic-tools-list') },
    },
    provider: { kind: 'api', name: 'xai', requestedModel: REQUESTED_MODEL, pinnedModel: REQUESTED_MODEL },
    hosts: {
      claude: {
        name: 'claude-code',
        version: '2.1.283 (Claude Code)',
        model: 'claude-model-fixture',
        toolSearchEnv: 'unset',
        toolLoadingObserved: ['eager'],
        envKeyNames: ['HOME', 'PATH'],
        envKeyNamesSha256: hashOf('HOME\nPATH'),
        agentPolicySha256: hashOf('fsb-synthetic-agent-policy'),
      },
    },
    chrome: {
      browser: 'Chrome/146.0.7680.0',
      protocolVersion: '1.3',
      launchFlags: ['--disable-renderer-backgrounding', '--user-data-dir'],
      launchRecord: 'present',
    },
    tasks: CORE_TASK_IDS_SYNTHETIC.map((id) => ({ id, version: 1, fixtureSha256: fixtureShaOf(id) })),
  };
  return mergeOverrides(base, overrides);
}

// --- Options ----------------------------------------------------------------------------

function checkOptionKeys(value, allowed, where) {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) throw new TypeError(`option ${where} must be an object`);
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined && !allowed.includes(key)) throw new TypeError(`unknown option ${where ? `${where}.` : ''}${key}`);
  }
}

function rate(value, fallback, where) {
  const out = value === undefined ? fallback : value;
  if (typeof out !== 'number' || !(out >= 0 && out <= 1)) throw new RangeError(`${where} must be a rate in [0, 1]`);
  return out;
}

function positiveInt(value, fallback, where) {
  const out = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(out) || out < 1) throw new RangeError(`${where} must be a positive integer`);
  return out;
}

// One value per task: an explicit list must match the task count; a single
// value repeats; a default list (the 12 base times) repeats in order.
function perTask(value, fallback, taskCount, where, check) {
  let list;
  if (value === undefined && Array.isArray(fallback)) list = Array.from({ length: taskCount }, (_, k) => fallback[k % fallback.length]);
  else if (Array.isArray(value)) list = [...value];
  else list = Array.from({ length: taskCount }, () => (value === undefined ? fallback : value));
  if (list.length !== taskCount) throw new RangeError(`${where} must give one value per task`);
  list.forEach((item) => check(item, where));
  return list;
}

function groupKeyOk(key) {
  const [arm, condition, extra] = key.split('/');
  return extra === undefined && SUPPORTED_ARMS.includes(arm) && (condition === undefined || CONDITIONS.includes(condition));
}

function lookupGroup(map, arm, condition) {
  if (!isPlainObject(map)) return undefined;
  if (condition && map[`${arm}/${condition}`] !== undefined) return map[`${arm}/${condition}`];
  return map[arm];
}

function resolveCells(cells, where, allowedKeys) {
  if (cells === undefined) return [];
  if (!Array.isArray(cells)) throw new TypeError(`${where} must be a list of cells`);
  return cells.map((cell, index) => {
    checkOptionKeys(cell, allowedKeys, `${where}[${index}]`);
    if (cell.acted !== undefined && cell.acted !== null && typeof cell.acted !== 'boolean') {
      throw new TypeError(`${where}[${index}].acted must be true, false or null`);
    }
    return { ...cell, count: positiveInt(cell.count, 1, `${where}[${index}].count`) };
  });
}

function resolveOptions(options) {
  if (!isPlainObject(options)) throw new TypeError('makeCampaign options must be an object');
  checkOptionKeys(options, OPTION_KEYS.top, '');
  const { seed } = options;
  if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be a safe integer');
  const scheduleSeed = options.scheduleSeed === undefined ? seed : options.scheduleSeed;
  if (!Number.isSafeInteger(scheduleSeed)) throw new TypeError('scheduleSeed must be a safe integer');
  const schemaVersion = options.schemaVersion === undefined ? 2 : options.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new TypeError('schemaVersion must be 1 or 2');
  const arms = options.arms === undefined ? (schemaVersion === 1 ? ['autopilot', 'claude'] : ['autopilot']) : options.arms;
  if (!Array.isArray(arms) || arms.length === 0) throw new TypeError('arms must be a non-empty list');
  if (arms.includes('cursor')) throw new TypeError('the cursor arm is never gated (D-03); synthetic campaigns use autopilot and claude');
  if (!arms.every((arm) => ARMS.includes(arm))) throw new TypeError(`arms must be values from ${SUPPORTED_ARMS.join(', ')}`);
  let conditions = options.conditions === undefined ? (schemaVersion === 2 ? ['off', 'on'] : null) : options.conditions;
  if (schemaVersion === 1 && conditions !== null) throw new TypeError('conditions need schemaVersion 2: the pin runner has no run conditions');
  if (conditions !== null && !Array.isArray(conditions)) throw new TypeError('conditions must be a list or null');
  conditions = conditions === null ? null : [...conditions];
  const campaignId = options.campaignId === undefined
    ? (schemaVersion === 1 ? 'core-baseline-66' : (arms.includes('autopilot') ? 'core-gate-71-autopilot' : 'core-gate-71-claude'))
    : options.campaignId;
  const rounds = positiveInt(options.rounds, 10, 'rounds');
  const taskIds = options.taskIds === undefined ? [...CORE_TASK_IDS_SYNTHETIC] : [...options.taskIds];
  const createdAt = options.createdAt === undefined ? SYNTHETIC_DEFAULT_CREATED_AT : options.createdAt;
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) throw new TypeError('createdAt must be an ISO date string');

  const taskRates = perTask(options.taskRates, DEFAULT_TASK_RATE, taskIds.length, 'taskRates', (item, where) => rate(item, item, where));

  checkOptionKeys(options.wallMs, OPTION_KEYS.wallMs, 'wallMs');
  const wall = options.wallMs || {};
  const base = perTask(wall.base, SYNTHETIC_TASK_BASE_MS, taskIds.length, 'wallMs.base', (item, where) => {
    if (typeof item !== 'number' || !(item > 0) || !Number.isFinite(item)) throw new RangeError(`${where} must be positive`);
  });
  const sigma = wall.sigma === undefined ? DEFAULT_SIGMA : wall.sigma;
  const sigmaValues = typeof sigma === 'number' ? [sigma] : (isPlainObject(sigma) ? Object.values(sigma) : null);
  if (!sigmaValues || !sigmaValues.every((value) => typeof value === 'number' && value >= 0 && Number.isFinite(value))) {
    throw new RangeError('wallMs.sigma must be a non-negative number or a map of them by group');
  }
  if (isPlainObject(sigma) && !Object.keys(sigma).every(groupKeyOk)) throw new TypeError('wallMs.sigma keys must be <arm> or <arm>/<condition>');

  const effect = options.effect === undefined ? {} : options.effect;
  if (!isPlainObject(effect)) throw new TypeError('effect must be an object');
  for (const [key, value] of Object.entries(effect)) {
    if (!groupKeyOk(key)) throw new TypeError(`effect key ${key} must be <arm> or <arm>/<condition>`);
    checkOptionKeys(value, OPTION_KEYS.effect, `effect.${key}`);
    if (value.speed !== undefined && !(typeof value.speed === 'number' && value.speed > 0)) throw new RangeError(`effect.${key}.speed must be positive`);
    if (value.completion !== undefined && !(typeof value.completion === 'number' && Math.abs(value.completion) <= 1)) {
      throw new RangeError(`effect.${key}.completion must lie in [-1, 1]`);
    }
  }

  checkOptionKeys(options.jev, OPTION_KEYS.jev, 'jev');
  const jevIn = options.jev || {};
  const models = jevIn.models === undefined ? SYNTHETIC_DEFAULT_MODELS : jevIn.models;
  if (!Array.isArray(models) || models.length === 0) throw new TypeError('jev.models must be a non-empty list');
  models.forEach((model, index) => {
    checkOptionKeys(model, OPTION_KEYS.model, `jev.models[${index}]`);
    if (typeof model.servedModel !== 'string' || typeof model.instrumentVersion !== 'string') {
      throw new TypeError(`jev.models[${index}] needs servedModel and instrumentVersion strings`);
    }
  });
  if (jevIn.calibrated !== undefined && typeof jevIn.calibrated !== 'boolean') throw new TypeError('jev.calibrated must be a boolean');
  const jev = {
    actRate: rate(jevIn.actRate, DEFAULT_ACT_RATE, 'jev.actRate'),
    calibrated: jevIn.calibrated === undefined ? true : jevIn.calibrated,
    models: models.map((model) => ({ servedModel: model.servedModel, instrumentVersion: model.instrumentVersion })),
    missingRate: rate(jevIn.missingRate, 0, 'jev.missingRate'),
    noBlockRate: rate(jevIn.noBlockRate, 0, 'jev.noBlockRate'),
    unknownRate: rate(jevIn.unknownRate, 0, 'jev.unknownRate'),
    detailMissingRate: rate(jevIn.detailMissingRate, 0, 'jev.detailMissingRate'),
    leakOff: null,
  };
  if (jev.missingRate + jev.noBlockRate + jev.unknownRate + jev.detailMissingRate > 1 + 1e-12) {
    throw new RangeError('jev exposure rates (missing, noBlock, unknown, detailMissing) must sum to at most 1');
  }
  if (jevIn.leakOff !== undefined && jevIn.leakOff !== null) {
    checkOptionKeys(jevIn.leakOff, OPTION_KEYS.leakOff, 'jev.leakOff');
    if (!LEAK_KINDS.includes(jevIn.leakOff.kind)) throw new TypeError(`jev.leakOff.kind must be one of ${LEAK_KINDS.join(', ')}`);
    jev.leakOff = { count: positiveInt(jevIn.leakOff.count, 1, 'jev.leakOff.count'), kind: jevIn.leakOff.kind };
  }

  checkOptionKeys(options.fastMode, OPTION_KEYS.fastMode, 'fastMode');
  const fastIn = options.fastMode || {};
  if (fastIn.statusMismatch !== undefined && typeof fastIn.statusMismatch !== 'boolean') throw new TypeError('fastMode.statusMismatch must be a boolean');
  const fastMode = {
    falseDone: resolveCells(fastIn.falseDone, 'fastMode.falseDone', OPTION_KEYS.falseDone),
    ambiguousOnPass: resolveCells(fastIn.ambiguousOnPass, 'fastMode.ambiguousOnPass', OPTION_KEYS.ambiguousOnPass),
    missingRate: rate(fastIn.missingRate, 0, 'fastMode.missingRate'),
    statusMismatch: fastIn.statusMismatch === true,
  };

  checkOptionKeys(options.safety, OPTION_KEYS.safety, 'safety');
  const events = resolveCells((options.safety || {}).events, 'safety.events', OPTION_KEYS.event).map((event, index) => {
    if (!EVENT_KINDS.includes(event.kind)) throw new TypeError(`safety.events[${index}].kind must be one of ${EVENT_KINDS.join(', ')}`);
    if (event.arm !== undefined && !SUPPORTED_ARMS.includes(event.arm)) throw new TypeError(`safety.events[${index}].arm is not an arm`);
    if (event.condition !== undefined && event.condition !== null && !CONDITIONS.includes(event.condition)) {
      throw new TypeError(`safety.events[${index}].condition is not a condition`);
    }
    const counts = event.kind === 'requestOvercount' || event.kind === 'unexpectedMutations';
    return { ...event, value: counts ? positiveInt(event.value, 1, `safety.events[${index}].value`) : null };
  });

  checkOptionKeys(options.infra, OPTION_KEYS.infra, 'infra');
  const infraIn = options.infra || {};
  const infra = { rate: rate(infraIn.rate, 0, 'infra.rate'), code: infraIn.code === undefined ? 'provider_error' : infraIn.code };
  if (!INFRA_CODES.includes(infra.code)) throw new TypeError('infra.code must be one of INFRA_CODES');

  if (options.identity !== undefined && !isPlainObject(options.identity)) throw new TypeError('identity overrides must be an object');

  return {
    seed, scheduleSeed, schemaVersion, arms: [...arms], conditions, campaignId, rounds, taskIds, createdAt, taskRates,
    base, sigma, effect, jev, fastMode, events, infra, identity: options.identity || {},
  };
}

// --- Plans: what each run is, before any record is built ---------------------------------

function exposureKind(u, jev) {
  let edge = jev.missingRate;
  if (u < edge) return 'missing';
  edge += jev.noBlockRate;
  if (u < edge) return 'no_block';
  edge += jev.unknownRate;
  if (u < edge) return 'unknown';
  edge += jev.detailMissingRate;
  if (u < edge) return 'detail_missing';
  return 'measurement';
}

function buildPlans(opts, schedule) {
  const taskIndex = new Map(opts.taskIds.map((id, k) => [id, k]));
  const streams = Object.fromEntries(Object.entries(STREAMS).map(([name, k]) => [name, streamOf(opts.seed, k)]));
  return schedule.map((entry) => {
    const k = taskIndex.get(entry.taskId);
    const condition = entry.condition === undefined ? null : entry.condition;
    const group = lookupGroup(opts.effect, entry.arm, condition) || {};
    const speed = group.speed === undefined ? 1 : group.speed;
    const shift = group.completion === undefined ? 0 : group.completion;
    const sigma = typeof opts.sigma === 'number' ? opts.sigma : (lookupGroup(opts.sigma, entry.arm, condition) ?? DEFAULT_SIGMA);
    // Every stream takes the same number of draws for every run.
    const uInfra = streams.infra();
    const uPass = streams.pass();
    const z = standardNormal(streams.wall);
    const uKind = streams.jev();
    const uAct = streams.jev();
    const uFast = streams.fast();

    const infraError = uInfra < opts.infra.rate ? opts.infra.code : null;
    const counted = infraError === null;
    const p = Math.min(1, Math.max(0, opts.taskRates[k] + shift));
    const pass = counted && uPass < p;
    const wallMs = counted ? Math.max(1, Math.round(opts.base[k] * speed * Math.exp(sigma * z))) : null;

    let kind = 'none';
    let acted = null;
    let block = false;
    const jevRow = opts.schemaVersion === 2 && entry.arm === 'autopilot' && condition === 'on' && counted;
    if (jevRow) {
      kind = exposureKind(uKind, opts.jev);
      if (kind === 'measurement' || kind === 'missing') acted = uAct < opts.jev.actRate;
      else if (kind === 'no_block') acted = false;
      block = kind === 'missing' || kind === 'unknown' || (kind === 'measurement' && !(uFast < opts.fastMode.missingRate));
    }
    return {
      entry, k, condition, counted, infraError, pass, wallMs, kind, acted, block,
      fastOutcome: block ? (pass ? 'done' : 'blocked') : null,
      falseDone: false, statusMismatch: false, claimsSuccess: false,
      evidence: counted ? { requestOvercount: 0, unexpectedMutations: 0 } : null, evidenceUsed: false,
    };
  });
}

function cellMatches(plan, cell) {
  if (cell.arm !== undefined && plan.entry.arm !== cell.arm) return false;
  if (cell.condition !== undefined && plan.condition !== cell.condition) return false;
  if (cell.acted !== undefined && plan.acted !== cell.acted) return false;
  return true;
}

function take(plans, eligible, count, where) {
  const chosen = plans.filter(eligible).slice(0, count);
  if (chosen.length < count) throw new RangeError(`${where}: only ${chosen.length} of ${count} rows match`);
  return chosen;
}

function applyLeak(plans, opts) {
  const leak = opts.jev.leakOff;
  if (!leak) return;
  const chosen = take(plans, (plan) => opts.schemaVersion === 2 && plan.counted && plan.entry.arm === 'autopilot' && plan.condition === 'off',
    leak.count, 'jev.leakOff');
  for (const plan of chosen) {
    plan.kind = `leak_${leak.kind}`;
    plan.acted = false;
    plan.block = leak.kind === 'summary';
    plan.fastOutcome = plan.block ? (plan.pass ? 'done' : 'blocked') : null;
  }
}

function applyFastCells(plans, opts) {
  const onWithBlock = (plan) => opts.schemaVersion === 2 && plan.counted && plan.entry.arm === 'autopilot'
    && plan.condition === 'on' && plan.block && !plan.falseDone && plan.fastOutcome !== 'ambiguous';
  opts.fastMode.falseDone.forEach((cell, index) => {
    const chosen = take(plans, (plan) => onWithBlock(plan) && !plan.pass && cellMatches(plan, cell), cell.count, `fastMode.falseDone[${index}]`);
    for (const plan of chosen) {
      plan.fastOutcome = 'done';
      plan.falseDone = true;
      plan.claimsSuccess = true;
      plan.statusMismatch = cell.statusMismatch === undefined ? opts.fastMode.statusMismatch : cell.statusMismatch === true;
    }
  });
  opts.fastMode.ambiguousOnPass.forEach((cell, index) => {
    const chosen = take(plans, (plan) => onWithBlock(plan) && plan.pass && cellMatches(plan, cell), cell.count, `fastMode.ambiguousOnPass[${index}]`);
    for (const plan of chosen) plan.fastOutcome = 'ambiguous';
  });
}

function applySafetyEvents(plans, opts) {
  opts.events.forEach((event, index) => {
    const where = `safety.events[${index}] (${event.kind})`;
    if (event.kind === 'claimedSuccessOnFail') {
      const chosen = take(plans, (plan) => plan.counted && !plan.pass && !plan.claimsSuccess && cellMatches(plan, event), event.count, where);
      for (const plan of chosen) plan.claimsSuccess = true;
      return;
    }
    const chosen = take(plans, (plan) => plan.counted && !plan.evidenceUsed && cellMatches(plan, event), event.count, where);
    for (const plan of chosen) {
      plan.evidenceUsed = true;
      if (event.kind === 'unverifiable') plan.evidence = { requestOvercount: null, unexpectedMutations: null };
      else plan.evidence = { ...plan.evidence, [event.kind]: event.value };
    }
  });
}

// --- Raw records ------------------------------------------------------------------------

function jevAttempt({ iteration, model, calibration, acted }) {
  return {
    iteration,
    command: 1,
    decisionSource: 'jev',
    jevCalled: true,
    servedModel: model.servedModel,
    instrumentVersion: model.instrumentVersion,
    calibrationStatus: calibration,
    latencyMs: acted ? 120 : 115,
    usage: { inputTokens: 900, source: 'provider' },
    cost: { usd: 0.0000378, source: 'provider' },
    fallback: null,
    outcome: acted ? 'acted' : 'escalated',
    escalationReason: acted ? null : 'operation_below_threshold',
    op: acted ? 'click' : null,
    stepOutcome: acted ? 'progress' : null,
  };
}

// The jevMeasurement (68-09 v1 shape, as in tests/fixtures/bench/
// jev-measurement-real-shape.json) and the run_task jev summary that agrees
// with it. An acted run has one acted and one escalated attempt; a run that
// did not act has one escalated attempt; the 'calls' leak has two.
function calledExposure({ acted, model, calibration, attempts }) {
  const list = acted
    ? [jevAttempt({ iteration: 2, model, calibration, acted: true }), jevAttempt({ iteration: 3, model, calibration, acted: false })]
    : Array.from({ length: attempts }, (_, i) => jevAttempt({ iteration: 2 + i, model, calibration, acted: false }));
  const fastSteps = acted ? 1 : 0;
  const jevMs = list.reduce((sum, attempt) => sum + attempt.latencyMs, 0);
  const escalated = list.length - fastSteps;
  const measurement = {
    v: 1,
    attempts: list,
    commands: [{
      command: 1,
      fastSteps,
      jevCalls: list.length,
      jevMs,
      usd: { provider: list.length === 2 ? 0.0000756 : 0.0000378, estimate: null },
      escalations: { operation_below_threshold: escalated },
    }],
  };
  const summary = {
    attempts: list.length, calls: list.length, fast_steps: fastSteps, jev_ms: jevMs, calibration,
    latched: null, exhausted: null, escalations: { operation_below_threshold: escalated },
  };
  return { measurement, summary };
}

function localOnlyMeasurement() {
  return {
    v: 1,
    attempts: [{
      iteration: 2, command: 1, decisionSource: null, jevCalled: false, servedModel: null, instrumentVersion: null,
      calibrationStatus: null, latencyMs: null, usage: { inputTokens: null, source: 'unavailable' },
      cost: { usd: null, source: 'unavailable' }, fallback: 'sensitive_goal', outcome: 'declined',
      escalationReason: 'sensitive_goal', op: null, stepOutcome: null,
    }],
    commands: [{ command: 1, fastSteps: 0, jevCalls: 0, jevMs: null, usd: { provider: null, estimate: null }, escalations: { sensitive_goal: 1 } }],
  };
}

// The 70-05 summary of a session with no jevMeasurement.
const ZERO_SUMMARY = Object.freeze({ attempts: 0, calls: 0, fast_steps: 0, jev_ms: null, calibration: null, latched: null, exhausted: null, escalations: {} });

const FAST_REASONS = Object.freeze({ done: 'complete_task', blocked: 'stuck_no_goal_progress', ambiguous: 'evidence_unavailable' });

function fastModeBlock(outcome, jev) {
  return { outcome, reason: FAST_REASONS[outcome], uncertain_unobserved: false, human_gate: null, budget_profile: 'run_task', jev };
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function autopilotMeasurement(wallMs, requestedModel) {
  const modelTotal = Math.round(wallMs * 0.6);
  const toolTotal = Math.round(wallMs * 0.15);
  return {
    v: 1, kind: 'autopilot', recorded: true, iterations: 4,
    modelMs: { total: modelTotal, median: Math.round(modelTotal / 4), p90: Math.round(modelTotal / 3) },
    toolMs: { total: toolTotal, median: Math.round(toolTotal / 5), p90: Math.round(toolTotal / 3), calls: 5 },
    inputTokens: 21000, outputTokens: 900, usageSource: 'provider',
    costUsd: round6(wallMs * 5e-7), costSource: 'provider', requestedModel, servedModels: [requestedModel],
  };
}

function mcpMeasurement(wallMs) {
  const gap = Math.round(wallMs * 0.8);
  return {
    v: 1, kind: 'mcp', source: 'journal', calls: 7, callsWithTiming: 7,
    fsbMs: { total: 2400, median: 310, p90: 700 },
    callerGapMs: { total: gap, median: Math.round(gap / 6), p90: Math.round(gap / 5), count: 6 },
    callIntervalMs: { median: Math.round(wallMs / 7), p90: Math.round(wallMs / 6), count: 6 },
    endReason: 'task_complete', idleTimeout: false,
  };
}

function claudeSummary(wallMs, model) {
  return {
    host: 'claude-code',
    init: { present: true, model, toolLoading: 'eager', toolSearchEnv: 'unset', mcpServers: [{ name: 'fsb', status: 'connected' }] },
    result: {
      present: true, subtype: 'success', isError: false, durationMs: wallMs, durationApiMs: Math.round(wallMs * 0.6), numTurns: 9,
      usage: { input: 12000, output: 800, cacheRead: 30000 }, totalCostUsd: round6(wallMs * 7e-6),
      costLabel: 'list-price estimate, not billed',
    },
  };
}

function autopilotClaim(plan) {
  if (plan.falseDone && plan.statusMismatch) return { status: 'error', partialOutcome: null, isError: true, subtype: null, completeTask: null };
  if (plan.pass || plan.claimsSuccess) return { status: 'success', partialOutcome: null, isError: false, subtype: null, completeTask: null };
  return { status: 'partial', partialOutcome: 'blocked', isError: false, subtype: null, completeTask: null };
}

function rawRecordOf(plan, ctx) {
  const { opts, identity, modelCursor } = ctx;
  const { entry, k, counted, pass, wallMs } = plan;
  const isClaude = entry.arm === 'claude';
  const taskId = entry.taskId;
  const record = {
    schemaVersion: opts.schemaVersion,
    campaignId: entry.campaignId,
    runId: entry.runId,
    attempt: 1,
    set: 'core',
    taskId,
    taskVersion: 1,
    category: k < Math.floor(opts.taskIds.length / 2) ? 'mixed' : 'click-heavy',
    fixtureSha256: fixtureShaOf(taskId),
    arm: entry.arm,
    round: entry.round,
    order: entry.order,
    startedAt: new Date(Date.parse(opts.createdAt) + entry.order * RUN_SPACING_MS).toISOString(),
    wallMs,
    wallFromInitMs: isClaude && counted ? Math.max(0, wallMs - 500) : null,
    timedOut: false,
    outcome: counted
      ? { pass, checks: [{ kind: 'request', pass, detail: { matched: pass ? 1 : 0, expected: 1 } }, { kind: 'marker', pass: true, detail: { present: true, matched: true } }] }
      : { pass: false, checks: [] },
    infraError: plan.infraError,
    claimed: { status: null, partialOutcome: null, isError: null, subtype: null, completeTask: null },
    sessionMatch: isClaude && counted ? 'unique' : null,
    measurement: null,
    hostSummary: null,
    runTask: null,
    flags: [],
  };
  let jevMeasurement = null;
  let endReason = null;
  if (counted && isClaude) {
    const claudeHost = identity.hosts && identity.hosts.claude ? identity.hosts.claude : defaultIdentity().hosts.claude;
    record.claimed = { status: null, partialOutcome: null, isError: false, subtype: 'success', completeTask: pass || plan.claimsSuccess };
    record.measurement = mcpMeasurement(wallMs);
    record.hostSummary = claudeSummary(wallMs, claudeHost.model);
    endReason = pass ? 'complete_task' : 'end_turn';
  } else if (counted) {
    const claimed = autopilotClaim(plan);
    record.claimed = claimed;
    const requestedModel = identity.provider && typeof identity.provider.requestedModel === 'string' ? identity.provider.requestedModel : REQUESTED_MODEL;
    let summary = null;
    const calibration = opts.jev.calibrated ? 'calibrated' : 'uncalibrated';
    const nextModel = () => opts.jev.models[modelCursor.next++ % opts.jev.models.length];
    if (plan.kind === 'measurement' || plan.kind === 'missing') {
      const exposure = calledExposure({ acted: plan.acted, model: nextModel(), calibration, attempts: 1 });
      summary = exposure.summary;
      if (plan.kind === 'measurement') jevMeasurement = exposure.measurement;
      else record.flags = ['jev_measurement_missing'];
    } else if (plan.kind === 'leak_calls') {
      jevMeasurement = calledExposure({ acted: false, model: nextModel(), calibration: 'calibrated', attempts: 2 }).measurement;
    } else if (plan.kind === 'leak_local') {
      jevMeasurement = localOnlyMeasurement();
    } else if (plan.kind === 'leak_summary') {
      summary = { ...ZERO_SUMMARY, escalations: {} };
    } else if (plan.kind === 'detail_missing') {
      record.flags = ['session_detail_missing'];
    }
    record.measurement = plan.kind === 'detail_missing' ? null : autopilotMeasurement(wallMs, requestedModel);
    record.runTask = {
      isError: claimed.isError, status: claimed.status, partialOutcome: claimed.partialOutcome, swEvicted: false, sessionIdSource: 'run_task',
      ...(plan.block ? { fastMode: fastModeBlock(plan.fastOutcome, summary) } : {}),
    };
    endReason = plan.kind === 'detail_missing' ? null : (pass ? 'completed' : 'stuck_no_goal_progress');
  }
  if (opts.schemaVersion === 2) {
    Object.assign(record, {
      condition: plan.condition,
      jevMeasurement,
      endReason,
      safety: plan.evidence,
    });
  }
  return record;
}

function campaignIdentity(opts, scheduleLength) {
  const identity = defaultIdentity();
  identity.campaignId = opts.campaignId;
  identity.createdAt = opts.createdAt;
  identity.schedule = {
    runs: scheduleLength, rounds: opts.rounds, arms: [...opts.arms], seed: opts.scheduleSeed, cooldownMs: COOLDOWN_MS,
    ...(opts.conditions ? { conditions: [...opts.conditions] } : {}),
  };
  identity.git = { sha: opts.schemaVersion === 1 ? SYNTHETIC_PIN_SHA : SYNTHETIC_CANDIDATE_SHA, dirty: false };
  identity.tasks = opts.taskIds.map((id) => ({ id, version: 1, fixtureSha256: fixtureShaOf(id) }));
  // run-bench.mjs records hosts.claude only when the claude arm runs.
  if (!opts.arms.includes('claude')) delete identity.hosts.claude;
  return mergeOverrides(identity, opts.identity);
}

/** { identity, raws, safety }: the raw run records of one synthetic campaign. */
export function makeRawCampaign(options) {
  const opts = resolveOptions(options);
  const schedule = buildSchedule({
    campaignId: opts.campaignId, taskIds: opts.taskIds, rounds: opts.rounds, arms: opts.arms, seed: opts.scheduleSeed,
    ...(opts.conditions ? { conditions: opts.conditions } : {}),
  });
  const plans = buildPlans(opts, schedule);
  applyLeak(plans, opts);
  applyFastCells(plans, opts);
  applySafetyEvents(plans, opts);
  const identity = campaignIdentity(opts, schedule.length);
  const ctx = { opts, identity, modelCursor: { next: 0 } };
  const raws = plans.map((plan) => rawRecordOf(plan, ctx));
  const safety = new Map();
  for (const plan of plans) if (plan.counted) safety.set(plan.entry.runId, { ...plan.evidence });
  return { identity, raws, safety };
}

/**
 * { identity, runs, safety }: committed rows built with toCommittedRow from
 * makeRawCampaign's records. Throws when any row fails validateCommittedRow.
 */
export function makeCampaign(options) {
  const { identity, raws, safety } = makeRawCampaign(options);
  const runs = raws.map((raw) => {
    const row = toCommittedRow(raw);
    const { ok, errors } = validateCommittedRow(row);
    if (!ok) throw new Error(`synthetic row ${row.runId} is invalid: ${errors.join(', ')}`);
    return row;
  });
  return { identity, runs, safety };
}
