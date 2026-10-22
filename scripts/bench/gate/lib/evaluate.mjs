/**
 * Phase 71 release gate evaluator (EVAL-02; CONTEXT D-05, D-10..D-16, D-19
 * and the 2026-10-16 amendments).
 *
 * Pure and seeded: the same input and seed always give the same result, and
 * nothing here reads the clock, the environment or the filesystem. It runs
 * no git and reaches no network; the CLI (evaluate-gate.mjs) does all I/O.
 *
 * evaluateGate turns committed rows and campaign identities into one verdict
 * per fast path: 'pass', 'fail', 'inconclusive' or 'not_exercised', each with
 * every criterion's numbers. Every threshold is read from the gate object
 * (scripts/bench/gate/release-gate-v1.0.0.json), never written here.
 *
 * - Speed reads only the runner's wallMs of completed runs (D-10): the
 *   geometric mean of per-task median ratios with the hierarchical bootstrap
 *   (stats.mjs). Per-decision Jev latency never enters a verdict.
 * - Completion is the Newcombe hybrid score difference over counted runs
 *   (infra errors are outside every denominator; D-13).
 * - Safety is recomputed per run from the row's evidence with the gate's
 *   claim words (D-15): a success claim, or a typed `done` on a candidate
 *   autopilot run, on a checker-failed run is claimedSuccessOnFail. Null
 *   evidence is unverifiable, never zero.
 * - A path passes only when every criterion passes (D-14). The comparison code
 *   lives here and never in report.mjs (Pitfall 2).
 *
 * The guards come first (D-05, D-06; Pitfalls 1, 7, 8):
 * - Refusals, which give no verdict at all: a candidate gate hash that is
 *   missing or differs from the file's, a wrong campaign id or schedule, a
 *   dirty candidate, two candidate SHAs, a baseline that is not the pin, and
 *   rows of the wrong schema.
 * - Inconclusive, never a pass: an identity mismatch on the gate's D-06 fields
 *   (the corpus is compared with the gate's lock), resume drift, a campaign
 *   under its minRounds, a campaign whose rows are not exactly its schedule
 *   or that is still paused (campaign_incomplete), and a drift sentinel that
 *   is not 'pass'. A sentinel
 *   trip carries the gate's blocker and leaves the within-campaign Jev verdict
 *   unaffected.
 * - The predeclared core-rebaseline-71 fallback replaces only a non-Jev
 *   verdict that is inconclusive for one of the gate's listed triggers, and
 *   runs the same non-Jev rules on its own pin and candidate campaigns.
 * The Bonferroni two-family sensitivity line and the per-category targets are
 * descriptive and never feed a verdict.
 *
 * Reasons are fixed snake_case codes from REASONS, optionally followed by
 * ':<detail>' (identity_mismatch names the field; a cause inherited from the
 * sentinel names 'sentinel'), so the CLI can map them to text. Refusals are
 * {code, detail} with a code from REFUSAL_CODES and a detail that names
 * fields, never values.
 */

import { isDeepStrictEqual } from 'node:util';

import { END_LABELS, PAUSING_INFRA_CODES, buildSchedule, isClaimedSuccess } from '../../lib/runs.mjs';
import { aaNoiseFloor, geoMeanMedianRatio, newcombeDifference, wilson } from '../../lib/stats.mjs';
import { corpusDigest } from './gate.mjs';

// The V1 baseline and the fallback pin campaign run at this commit (D-03),
// compared in full: a prefix would accept any commit that shares it (IN-02).
export const PIN_SHA_PREFIX = '8a058bdf';
export const PIN_SHA = '8a058bdf0d17c1e3e79ec3104cc1996326b4c402';
// Two-sided z at gate.bootstrap.sensitivityLevel 0.975: the Bonferroni
// two-family line (D-14). Never decisive.
export const SENSITIVITY_Z = 2.241402727604947;
export const SENSITIVITY_LABEL = 'Bonferroni two-family sensitivity (never decisive)';
// The core-set categories reported as context (D-12).
export const CATEGORIES = Object.freeze(['mixed', 'click-heavy']);
export const UAT_NOT_MEASURED = 'not measured: no UAT-style tasks in the core set';

export const VERDICTS = Object.freeze(['pass', 'fail', 'inconclusive', 'not_exercised']);

export const REASONS = Object.freeze([
  // Jev speed (D-12)
  'ci_upper_not_below_1', 'estimate_above_max', 'not_below_aa_floor', 'aa_floor_unavailable', 'speed_unavailable',
  // Non-Jev speed (D-12)
  'time_noninferiority',
  // Completion (D-13)
  'completion_noninferiority', 'completion_unavailable',
  // Safety (D-15)
  'acted_safety_event', 'excess_llm_path_events', 'excess_safety_events', 'safety_unverifiable', 'baseline_safety_unverifiable',
  'suites_not_run', 'suites_incomplete', 'tighten_only_suite_failed',
  // The exercised precondition (D-16)
  'no_on_runs', 'uncalibrated', 'acted_share_below_min', 'model_instrument_pair', 'condition_leak',
  // Guards (D-05, D-06; Pitfalls 1, 8)
  'underpowered', 'campaign_incomplete', 'resume_drift', 'corpus_mismatch', 'identity_mismatch', 'sentinel_trip', 'sentinel_inconclusive',
  // The sentinel's own result
  'completion_not_equivalent', 'speed_outside_band', 'sentinel_unavailable',
]);

export const REFUSAL_CODES = Object.freeze([
  'gate_hash_missing', 'gate_hash_mismatch', 'campaign_id_mismatch', 'campaign_schedule_mismatch', 'candidate_dirty',
  'candidate_sha_mismatch', 'baseline_not_pin', 'candidate_row_schema', 'baseline_row_schema',
  // Inside result.fallback only, never top-level
  'fallback_campaign_mismatch', 'fallback_pin_not_pin', 'fallback_candidate_not_measured',
]);

export const FALLBACK_STATUSES = Object.freeze(['not_supplied', 'not_triggered', 'used', 'refused']);

const TIERS = Object.freeze({ fail: 'fail', inconclusive: 'inconclusive', pass: 'pass' });
const META_LOOP_BREAK = 'meta_cognitive_loop_break';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function listOf(rows) {
  return Array.isArray(rows) ? rows.filter(isPlainObject) : [];
}

function unique(values) {
  return [...new Set(values)];
}

const isCounted = (row) => row.infraError === null;
const isCompleted = (row) => isCounted(row) && row.pass === true;

// --- Grouping ---------------------------------------------------------------------------

/**
 * The five row groups of the gate, core-set rows only (gate criteria.scope):
 * the baseline's autopilot and claude rows, the autopilot campaign's control
 * and treatment rows (gate.paths jev control/treatment) and the claude
 * campaign's candidate rows (gate.paths['mcp-non-jev'].candidateCondition).
 */
export function groupRows({ baseline, autopilot, claude } = {}, gate) {
  const jev = gate.paths['jev-mcp-run-task'];
  const nonJev = gate.paths['mcp-non-jev'];
  const scope = gate.criteria.scope;
  const inScope = (rows) => listOf(rows).filter((row) => row.set === scope);
  const base = inScope(baseline);
  const auto = inScope(autopilot);
  return {
    baselineAutopilot: base.filter((row) => row.arm === 'autopilot'),
    baselineClaude: base.filter((row) => row.arm === nonJev.arm),
    autopilotOff: auto.filter((row) => row.arm === 'autopilot' && row.condition === jev.control),
    autopilotOn: auto.filter((row) => row.arm === 'autopilot' && row.condition === jev.treatment),
    claudeOff: inScope(claude).filter((row) => row.arm === nonJev.arm && row.condition === nonJev.candidateCondition),
  };
}

// --- Speed (wallMs only) ------------------------------------------------------------------

function taskIdsOf(rows) {
  return new Set(rows.map((row) => row.taskId).filter((id) => typeof id === 'string'));
}

/**
 * Treatment over control: geoMeanMedianRatio over the tasks present in both
 * groups, each task {id, a: completed control wallMs, b: completed treatment
 * wallMs}. Only wallMs, pass, infraError and taskId are read. No usable task
 * gives { status: 'n/a' } and null numbers, never NaN.
 */
export function speedComparison(controlRows, treatmentRows, { iterations, seed, level } = {}) {
  const control = listOf(controlRows);
  const treatment = listOf(treatmentRows);
  const inTreatment = taskIdsOf(treatment);
  const taskIds = [...taskIdsOf(control)].filter((id) => inTreatment.has(id)).sort(codeUnitCompare);
  // Sorted, so the bootstrap draws never depend on the order of the rows.
  const wallsOf = (rows, id) => rows
    .filter((row) => row.taskId === id && isCompleted(row))
    .map((row) => finite(row.wallMs))
    .filter((wall) => wall !== null && wall > 0)
    .sort((x, y) => x - y);
  const tasks = taskIds.map((id) => ({ id, a: wallsOf(control, id), b: wallsOf(treatment, id) }));
  const unavailable = {
    status: 'n/a', reason: 'no_usable_tasks', estimate: null, ci: [null, null], verdict: null, usedTasks: [],
    droppedTasks: tasks.map((task) => task.id), iterations, seed, level,
  };
  if (!tasks.some((task) => task.a.length > 0 && task.b.length > 0)) return unavailable;
  const result = geoMeanMedianRatio(tasks, { iterations, seed, level });
  if (finite(result.estimate) === null || finite(result.ci[0]) === null || finite(result.ci[1]) === null) return unavailable;
  return {
    status: 'ok', reason: null, estimate: result.estimate, ci: result.ci, verdict: result.verdict, usedTasks: result.usedTasks,
    droppedTasks: result.droppedTasks, iterations, seed, level,
  };
}

/**
 * The control condition's A/A noise floor: aaNoiseFloor over completed
 * control rows per task ({round, wallMs}), odd rounds against even rounds.
 * Fewer than two rounds, or no task with runs in both halves, gives
 * { status: 'n/a', reason }.
 */
export function aaFloor(controlRows, { iterations, seed, level } = {}) {
  const done = listOf(controlRows).filter((row) => isCompleted(row) && Number.isInteger(row.round)
    && finite(row.wallMs) !== null && row.wallMs > 0);
  if (new Set(done.map((row) => row.round)).size < 2) return { status: 'n/a', reason: 'needs_two_rounds', estimate: null, ci: [null, null] };
  const tasks = [...taskIdsOf(done)].sort(codeUnitCompare).map((id) => ({
    id,
    runs: done.filter((row) => row.taskId === id).map((row) => ({ round: row.round, wallMs: row.wallMs }))
      .sort((x, y) => x.round - y.round || x.wallMs - y.wallMs),
  }));
  const result = aaNoiseFloor(tasks, { iterations, seed, level });
  if (!result.usedTasks.length || finite(result.estimate) === null || finite(result.ci[0]) === null || finite(result.ci[1]) === null) {
    return { status: 'n/a', reason: 'no_task_in_both_halves', estimate: null, ci: [null, null], droppedTasks: result.droppedTasks };
  }
  return {
    status: 'ok', reason: null, estimate: result.estimate, ci: result.ci, ciWidth: result.ci[1] - result.ci[0], verdict: result.verdict,
    usedTasks: result.usedTasks, droppedTasks: result.droppedTasks, iterations: result.iterations, seed: result.seed, label: result.label,
  };
}

// --- Completion -----------------------------------------------------------------------------

function completionTally(rows, z) {
  const counted = rows.filter(isCounted);
  const completed = counted.filter((row) => row.pass === true).length;
  return {
    completed,
    counted: counted.length,
    rate: counted.length ? completed / counted.length : null,
    wilson: counted.length ? wilson(completed, counted.length, z) : [null, null],
  };
}

/**
 * Treatment minus control completion over counted runs, with the Newcombe
 * hybrid score interval at z. A group with no counted run gives a null
 * difference and interval.
 */
export function completionComparison(controlRows, treatmentRows, z) {
  const control = completionTally(listOf(controlRows), z);
  const treatment = completionTally(listOf(treatmentRows), z);
  const { diff, ci } = newcombeDifference(treatment.completed, treatment.counted, control.completed, control.counted, z);
  return { control, treatment, diff, ci, z };
}

// --- Criteria -----------------------------------------------------------------------------

function criterion(failReasons, inconclusiveReasons) {
  if (failReasons.length) return { status: TIERS.fail, reasons: failReasons };
  if (inconclusiveReasons.length) return { status: TIERS.inconclusive, reasons: inconclusiveReasons };
  return { status: TIERS.pass, reasons: [] };
}

/**
 * The Jev speed criterion (D-12): the CI upper bound below
 * criteria.jevSpeed.ciUpperBelow, the estimate at most maxEstimate, and the
 * estimate below the lower bound of the control's A/A floor. A missing ratio
 * or floor is inconclusive.
 */
export function jevSpeedCriterion(speed, floor, gate) {
  const rule = gate.criteria.jevSpeed;
  const numbers = {
    estimate: speed.estimate, ci: speed.ci, usedTasks: speed.usedTasks, droppedTasks: speed.droppedTasks, aaFloor: floor,
    thresholds: { ciUpperBelow: rule.ciUpperBelow, maxEstimate: rule.maxEstimate, belowAaFloorLower: rule.belowAaFloorLower },
  };
  if (speed.status !== 'ok') return { ...criterion([], ['speed_unavailable']), ...numbers };
  if (rule.belowAaFloorLower && floor.status !== 'ok') return { ...criterion([], ['aa_floor_unavailable']), ...numbers };
  const fails = [];
  if (!(speed.ci[1] < rule.ciUpperBelow)) fails.push('ci_upper_not_below_1');
  if (!(speed.estimate <= rule.maxEstimate)) fails.push('estimate_above_max');
  if (rule.belowAaFloorLower && !(speed.estimate < floor.ci[0])) fails.push('not_below_aa_floor');
  return { ...criterion(fails, []), ...numbers };
}

/**
 * The non-Jev time criterion (D-12): non-inferiority when the CI upper bound
 * is at most criteria.nonJevSpeed.ciUpperAtMost; `faster` only when it is
 * below fasterCiUpperBelow.
 */
export function nonJevSpeedCriterion(speed, gate) {
  const rule = gate.criteria.nonJevSpeed;
  const numbers = {
    estimate: speed.estimate, ci: speed.ci, usedTasks: speed.usedTasks, droppedTasks: speed.droppedTasks,
    thresholds: { ciUpperAtMost: rule.ciUpperAtMost, fasterCiUpperBelow: rule.fasterCiUpperBelow },
  };
  if (speed.status !== 'ok') return { ...criterion([], ['speed_unavailable']), faster: null, ...numbers };
  const fails = speed.ci[1] <= rule.ciUpperAtMost ? [] : ['time_noninferiority'];
  return { ...criterion(fails, []), faster: speed.ci[1] < rule.fasterCiUpperBelow, ...numbers };
}

/**
 * Completion non-inferiority (D-13): the interval's lower bound above
 * minus criteria.completionMargin.
 */
export function completionCriterion(completion, gate) {
  const margin = gate.criteria.completionMargin;
  const numbers = { ...completion, margin };
  if (completion.diff === null) return { ...criterion([], ['completion_unavailable']), ...numbers };
  return { ...criterion(completion.ci[0] > -margin ? [] : ['completion_noninferiority'], []), ...numbers };
}

// --- Safety -------------------------------------------------------------------------------

function evidenceCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * The safety events of one row (D-15 and its 2026-10-16 amendment).
 * `build` is 'baseline' or 'candidate' and picks the gate's claim words.
 * Evidence comes from a schema-2 row's safety block, else from `sidecar`
 * (the baseline Map runId -> {requestOvercount, unexpectedMutations}); a
 * missing entry or a null count is unverifiable, never zero. The row's own
 * claimedSuccessOnFail flag is descriptive and never read: the claim is
 * recomputed as the per-run union of a success claim with the build's words
 * and, on candidate autopilot rows only, a typed outcome from
 * claimWords.autopilot.candidateTypedOutcome, on a run whose checker failed.
 */
export function safetyEventsOf(row, { gate, build, sidecar = null } = {}) {
  const words = gate.claimWords.autopilot;
  const statusWords = build === 'baseline' ? words.baseline : words.candidate;
  let evidence = null;
  if (row.schemaVersion === 2 && isPlainObject(row.safety)) evidence = row.safety;
  else if (sidecar instanceof Map && sidecar.has(row.runId)) evidence = sidecar.get(row.runId);
  const requestOvercount = isPlainObject(evidence) ? evidenceCount(evidence.requestOvercount) : null;
  const unexpectedMutations = isPlainObject(evidence) ? evidenceCount(evidence.unexpectedMutations) : null;
  const statusClaim = isClaimedSuccess(row.arm, row.claimed, statusWords);
  const typedClaim = build === 'candidate' && row.arm === 'autopilot' && isPlainObject(row.fastMode)
    && words.candidateTypedOutcome.includes(row.fastMode.outcome);
  const present = {
    requestOvercount: requestOvercount !== null && requestOvercount > 0,
    unexpectedMutations: unexpectedMutations !== null && unexpectedMutations > 0,
    claimedSuccessOnFail: (statusClaim || typedClaim) && row.pass !== true,
  };
  const kinds = gate.safety.events.filter((kind) => present[kind] === true);
  return { kinds, events: kinds.length, unverifiable: requestOvercount === null || unexpectedMutations === null };
}

function safetyTally(rows, options) {
  const byKind = Object.fromEntries(options.gate.safety.events.map((kind) => [kind, 0]));
  const eventRunIds = [];
  const unverifiableRunIds = [];
  let events = 0;
  for (const row of rows) {
    const result = safetyEventsOf(row, options);
    events += result.events;
    for (const kind of result.kinds) byKind[kind] += 1;
    if (result.events > 0) eventRunIds.push(row.runId);
    if (result.unverifiable) unverifiableRunIds.push(row.runId);
  }
  return {
    runs: rows.length,
    events,
    rate: rows.length ? events / rows.length : null,
    byKind,
    eventRuns: eventRunIds.length,
    eventRunIds: eventRunIds.sort(codeUnitCompare),
    unverifiableRuns: unverifiableRunIds.length,
    unverifiableRunIds: unverifiableRunIds.sort(codeUnitCompare),
  };
}

function suitesCheck(suites, gate) {
  const listed = gate.safety.verifySuites;
  const ran = isPlainObject(suites) && suites.ran === true;
  const results = ran && Array.isArray(suites.results) ? suites.results.filter(isPlainObject) : [];
  const failed = unique(results.filter((result) => result.exitCode !== 0).map((result) => String(result.command))).sort(codeUnitCompare);
  const missing = ran ? listed.filter((command) => !results.some((result) => result.command === command)) : [...listed];
  return { ran, listed: [...listed], failed, missing };
}

/**
 * Jev safety (D-15): rule (a) any event in a counted 'on' run where Jev acted
 * fails; under gate.safety.unknownExposure 'acted' a run whose exposure is
 * still unknown (jev.acted null) counts as acted here. Rule (b) events per
 * counted run in non-acted 'on' runs (jev.acted false: no Jev attempt or no
 * fast step) above the 'off' rate fails. Null evidence is unverifiable
 * (inconclusive unless a rule fails). The tighten-only suites: not run is
 * inconclusive, a listed suite without a result is inconclusive, and a
 * failed suite fails.
 */
export function jevSafety({ onRows, offRows, gate, suites }) {
  const on = listOf(onRows).filter(isCounted);
  const off = listOf(offRows).filter(isCounted);
  const unknownActs = gate.safety.unknownExposure === 'acted';
  const acted = [];
  const notActed = [];
  const unknown = [];
  for (const row of on) {
    const value = isPlainObject(row.jev) ? row.jev.acted : null;
    if (value === true) acted.push(row);
    else if (value === false) notActed.push(row);
    else unknown.push(row);
  }
  const options = { gate, build: 'candidate' };
  const ruleA = safetyTally(unknownActs ? [...acted, ...unknown] : acted, options);
  const ruleB = { on: safetyTally(notActed, options), off: safetyTally(off, options) };
  const suitesResult = suitesCheck(suites, gate);

  const fails = [];
  if (gate.safety.actedZeroTolerance && ruleA.events > 0) fails.push('acted_safety_event');
  if (ruleB.on.runs > 0 && ruleB.off.runs > 0 && ruleB.on.rate > ruleB.off.rate) fails.push('excess_llm_path_events');
  if (suitesResult.failed.length) fails.push('tighten_only_suite_failed');

  const inconclusive = [];
  const unknownUnread = unknownActs ? 0 : unknown.length;
  if (ruleA.unverifiableRuns + ruleB.on.unverifiableRuns + ruleB.off.unverifiableRuns + unknownUnread > 0) {
    inconclusive.push('safety_unverifiable');
  }
  if (!suitesResult.ran) inconclusive.push('suites_not_run');
  else if (suitesResult.missing.length) inconclusive.push('suites_incomplete');

  return {
    ...criterion(fails, inconclusive),
    failReasons: fails,
    inconclusiveReasons: inconclusive,
    unknownExposure: gate.safety.unknownExposure,
    exposure: { acted: acted.length, notActed: notActed.length, unknown: unknown.length },
    ruleA,
    ruleB,
    suites: suitesResult,
  };
}

/**
 * Non-Jev safety (D-15): events per counted run in the candidate's rows above
 * the baseline's fail; baseline evidence that cannot be verified (no sidecar,
 * a missing entry or a null count) is inconclusive, and so is a candidate
 * row with null evidence.
 */
export function nonJevSafety({ baselineRows, candidateRows, gate, baselineSidecar = null }) {
  const baseline = safetyTally(listOf(baselineRows).filter(isCounted), { gate, build: 'baseline', sidecar: baselineSidecar });
  const candidate = safetyTally(listOf(candidateRows).filter(isCounted), { gate, build: 'candidate' });
  const fails = baseline.runs > 0 && candidate.runs > 0 && candidate.rate > baseline.rate ? ['excess_safety_events'] : [];
  const inconclusive = [];
  if (baseline.unverifiableRuns > 0) inconclusive.push('baseline_safety_unverifiable');
  if (candidate.unverifiableRuns > 0) inconclusive.push('safety_unverifiable');
  return { ...criterion(fails, inconclusive), failReasons: fails, inconclusiveReasons: inconclusive, baseline, candidate };
}

// --- The exercised precondition (D-16) --------------------------------------------------------

function calibratedOnly(statuses) {
  if (!isPlainObject(statuses)) return false;
  const seen = Object.keys(statuses).filter((key) => Number.isSafeInteger(statuses[key]) && statuses[key] > 0);
  return seen.length > 0 && seen.every((key) => key === 'calibrated');
}

function unionOf(rows, key) {
  const values = [];
  for (const row of rows) {
    const list = isPlainObject(row.jev) ? row.jev[key] : null;
    if (Array.isArray(list)) values.push(...list.filter((value) => typeof value === 'string'));
  }
  return unique(values).sort(codeUnitCompare);
}

/**
 * D-16 and its 2026-10-16 amendment, over the autopilot campaign:
 * - the acted share counts counted 'on' rows with jev.acted === true only
 *   (unknown exposure never counts) and must reach exercise.minActedShare;
 * - every acted row's calibration statuses must be 'calibrated' only (an
 *   acted row that shows no calibrated attempt is not proof);
 * - the servedModels and instrumentVersions unions over 'on' rows must each
 *   hold exactly one value (null lists contribute nothing);
 * - any counted 'off' row with a non-null jev.source is a condition leak.
 * The capture arm holds by construction: an armed capture makes the run
 * condition_not_applied, which is never counted.
 */
export function exerciseStats({ onRows, offRows, gate }) {
  const rule = gate.exercise;
  const on = listOf(onRows).filter(isCounted);
  const off = listOf(offRows).filter(isCounted);
  const acted = on.filter((row) => isPlainObject(row.jev) && row.jev.acted === true);
  const uncalibrated = acted.filter((row) => !calibratedOnly(row.jev.calibrationStatuses));
  const leaks = off.filter((row) => isPlainObject(row.jev) && row.jev.source !== null && row.jev.source !== undefined);
  const pairs = { servedModels: unionOf(on, 'servedModels'), instrumentVersions: unionOf(on, 'instrumentVersions') };
  const actedShare = on.length ? acted.length / on.length : null;

  const reasons = [];
  if (!on.length) reasons.push('no_on_runs');
  if (rule.requireCalibrated && uncalibrated.length) reasons.push('uncalibrated');
  if (actedShare !== null && actedShare < rule.minActedShare) reasons.push('acted_share_below_min');
  if (rule.singleModelInstrumentPair && (pairs.servedModels.length !== 1 || pairs.instrumentVersions.length !== 1)) {
    reasons.push('model_instrument_pair');
  }
  if (rule.noOffActivity && leaks.length) reasons.push('condition_leak');
  return {
    status: reasons.length ? 'not_exercised' : 'exercised',
    reasons,
    onCounted: on.length,
    actedRuns: acted.length,
    actedShare,
    minActedShare: rule.minActedShare,
    unknownExposureRuns: on.filter((row) => !isPlainObject(row.jev) || row.jev.acted === null).length,
    pairs,
    uncalibratedActedRuns: uncalibrated.length,
    leakRuns: leaks.length,
    leakRunIds: leaks.map((row) => row.runId).sort(codeUnitCompare),
    captureArm: 'by_construction',
  };
}

// --- Verdicts -----------------------------------------------------------------------------

function inconclusiveOf(item) {
  return item && item.status === TIERS.inconclusive ? item.reasons : [];
}

function failsOf(item) {
  return item && item.status === TIERS.fail ? item.reasons : [];
}

/**
 * The Jev verdict from computed criteria (D-14 intersection-union; D-16):
 * a safety fail, then not exercised, then inconclusive (the guards and any
 * inconclusive criterion), then a speed or completion fail, then pass.
 */
export function jevVerdict({ criteria, guards = [] }) {
  const { speed, completion, safety, exercise } = criteria;
  if (safety.status === TIERS.fail) return { verdict: 'fail', reasons: [...safety.reasons] };
  if (exercise.status !== 'exercised') return { verdict: 'not_exercised', reasons: [...exercise.reasons] };
  const inconclusive = unique([...guards, ...inconclusiveOf(speed), ...inconclusiveOf(completion), ...inconclusiveOf(safety)]);
  if (inconclusive.length) return { verdict: 'inconclusive', reasons: inconclusive };
  const fails = [...failsOf(speed), ...failsOf(completion)];
  if (fails.length) return { verdict: 'fail', reasons: fails };
  return { verdict: 'pass', reasons: [] };
}

/**
 * The non-Jev MCP verdict from computed criteria: a safety fail, then
 * inconclusive (the guards and any inconclusive criterion), then a time or
 * completion fail, then pass. `faster` comes from the time criterion alone.
 */
export function nonJevVerdict({ criteria, guards = [] }) {
  const { speed, completion, safety } = criteria;
  const faster = speed.faster === undefined ? null : speed.faster;
  if (safety.status === TIERS.fail) return { verdict: 'fail', reasons: [...safety.reasons], faster };
  const inconclusive = unique([...guards, ...inconclusiveOf(speed), ...inconclusiveOf(completion), ...inconclusiveOf(safety)]);
  if (inconclusive.length) return { verdict: 'inconclusive', reasons: inconclusive, faster };
  const fails = [...failsOf(speed), ...failsOf(completion)];
  if (fails.length) return { verdict: 'fail', reasons: fails, faster };
  return { verdict: 'pass', reasons: [], faster };
}

// --- Descriptive diagnostics ----------------------------------------------------------------

function endLabelCounts(rows) {
  const counted = rows.filter(isCounted);
  const out = {};
  for (const label of END_LABELS) {
    const n = counted.filter((row) => row.endLabel === label).length;
    if (n) out[label] = n;
  }
  return out;
}

// --- Identity, resumes and rounds (D-06; Pitfalls 1, 8) -------------------------------------

function majorOf(browser) {
  if (typeof browser !== 'string') return null;
  const match = /Chrome\/(\d+)/.exec(browser);
  return match ? Number(match[1]) : null;
}

/** The Chrome major version of an identity (chrome.browser), or null. */
export function chromeMajor(identity) {
  return isPlainObject(identity) && isPlainObject(identity.chrome) ? majorOf(identity.chrome.browser) : null;
}

// One identity field: 'corpus' is the corpus digest of identity.tasks,
// 'chromeMajor' the parsed major, anything else a dotted path. Missing is null.
function identityValue(identity, field) {
  if (!isPlainObject(identity)) return null;
  if (field === 'corpus') return Array.isArray(identity.tasks) ? corpusDigest(identity.tasks) : null;
  if (field === 'chromeMajor') return chromeMajor(identity);
  let value = identity;
  for (const key of field.split('.')) {
    if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, key)) return null;
    value = value[key];
  }
  return value === undefined ? null : value;
}

/**
 * The fields (from the gate's identityMatch lists) on which two campaign
 * identities differ. A missing value on either side is a mismatch, and
 * 'corpus' mismatches unless both corpus digests equal gate.corpusLockSha256.
 */
export function identityMismatches(a, b, fields, gate) {
  return fields.filter((field) => {
    const left = identityValue(a, field);
    const right = identityValue(b, field);
    if (left === null || right === null) return true;
    if (field === 'corpus') return left !== gate.corpusLockSha256 || right !== gate.corpusLockSha256;
    return !isDeepStrictEqual(left, right);
  });
}

/**
 * True when a resume changed what the campaign measured (Pitfall 8): any
 * identity.resumes[] entry whose claudeVersion differs from
 * hosts.claude.version (when the campaign has a claude host) or whose Chrome
 * major differs from the original. An unknown version on either side is drift.
 */
export function resumeDrift(identity) {
  if (!isPlainObject(identity) || !Array.isArray(identity.resumes)) return false;
  const host = isPlainObject(identity.hosts) && isPlainObject(identity.hosts.claude) ? identity.hosts.claude : null;
  const major = chromeMajor(identity);
  return identity.resumes.some((entry) => {
    if (!isPlainObject(entry)) return true;
    if (host && (typeof host.version !== 'string' || entry.claudeVersion !== host.version)) return true;
    const resumed = majorOf(entry.chromeBrowser);
    return resumed === null || major === null || resumed !== major;
  });
}

function observedRounds(runs) {
  const rounds = listOf(runs).map((row) => row.round).filter((round) => Number.isSafeInteger(round));
  return rounds.length ? Math.max(...rounds) : null;
}

/**
 * A campaign meets minRounds when its identity schedules at least minRounds
 * rounds and its rows reach round minRounds (Pitfall 1).
 */
export function meetsMinRounds(campaign, minRounds) {
  const identity = isPlainObject(campaign) ? campaign.identity : null;
  const scheduled = isPlainObject(identity) && isPlainObject(identity.schedule) ? identity.schedule.rounds : null;
  const observed = observedRounds(isPlainObject(campaign) ? campaign.runs : null);
  return Number.isSafeInteger(scheduled) && scheduled >= minRounds && observed !== null && observed >= minRounds;
}

// The identity's seeded schedule rebuilt with the runner's own buildSchedule
// (identity.tasks and identity.schedule), or null when it cannot be rebuilt.
function scheduleOf(identity) {
  const schedule = isPlainObject(identity) && isPlainObject(identity.schedule) ? identity.schedule : null;
  if (!schedule || !Array.isArray(identity.tasks)) return null;
  try {
    return buildSchedule({
      campaignId: identity.campaignId,
      taskIds: identity.tasks.map((task) => (isPlainObject(task) ? task.id : null)),
      rounds: schedule.rounds,
      arms: schedule.arms,
      seed: schedule.seed,
      conditions: schedule.conditions === undefined ? null : schedule.conditions,
    });
  } catch {
    return null;
  }
}

const conditionOf = (value) => (value === undefined ? null : value);

/**
 * Whether a campaign's rows are exactly its schedule (WR-02). The highest
 * round alone does not show it: a campaign paused part-way through a round
 * and never resumed, a dropped row or a row with no condition would all still
 * reach minRounds. Complete means one row for every run the identity
 * scheduled, matching the entry's arm, round, task and condition, no other
 * row, and no row whose latest attempt is a pausing infra code (the campaign
 * paused there and was never resumed). The counts are null when the identity
 * cannot rebuild its schedule, which is never complete.
 */
export function campaignCompleteness(campaign) {
  const identity = isPlainObject(campaign) && isPlainObject(campaign.identity) ? campaign.identity : null;
  const rows = listOf(isPlainObject(campaign) ? campaign.runs : null);
  const pausedRuns = rows.filter((row) => PAUSING_INFRA_CODES.includes(row.infraError)).length;
  const schedule = scheduleOf(identity);
  if (schedule === null) return { complete: false, missingRuns: null, unscheduledRows: null, pausedRuns };
  const expected = new Set(schedule.map((entry) => entry.runId));
  const byRunId = new Map();
  let unscheduledRows = 0;
  for (const row of rows) {
    if (!expected.has(row.runId) || byRunId.has(row.runId)) unscheduledRows += 1;
    else byRunId.set(row.runId, row);
  }
  const missingRuns = schedule.filter((entry) => {
    const row = byRunId.get(entry.runId);
    return !row || row.arm !== entry.arm || row.round !== entry.round || row.taskId !== entry.taskId
      || conditionOf(row.condition) !== conditionOf(entry.condition);
  }).length;
  return { complete: missingRuns === 0 && unscheduledRows === 0 && pausedRuns === 0, missingRuns, unscheduledRows, pausedRuns };
}

function stringOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function campaignFacts(campaign, minRounds, gate) {
  const identity = isPlainObject(campaign) && isPlainObject(campaign.identity) ? campaign.identity : null;
  const git = identity && isPlainObject(identity.git) ? identity.git : {};
  const schedule = identity && isPlainObject(identity.schedule) ? identity.schedule : {};
  const completeness = campaignCompleteness(campaign);
  return {
    id: identity ? stringOrNull(identity.campaignId) : null,
    createdAt: identity ? stringOrNull(identity.createdAt) : null,
    gitSha: stringOrNull(git.sha),
    gitDirty: typeof git.dirty === 'boolean' ? git.dirty : null,
    rounds: Number.isSafeInteger(schedule.rounds) ? schedule.rounds : null,
    observedRounds: observedRounds(isPlainObject(campaign) ? campaign.runs : null),
    minRounds,
    meetsMinRounds: meetsMinRounds(campaign, minRounds),
    complete: completeness.complete,
    missingRuns: completeness.missingRuns,
    unscheduledRows: completeness.unscheduledRows,
    pausedRuns: completeness.pausedRuns,
    resumeDrift: resumeDrift(identity),
    corpusMatch: identityValue(identity, 'corpus') === gate.corpusLockSha256,
    reported: Object.fromEntries(gate.identityMatch.reported.map((field) => [field, identityValue(identity, field)])),
  };
}

// --- Refusals (D-05, D-06, D-11; Pitfall 7) --------------------------------------------------

function scheduleMismatches(identity, spec) {
  const schedule = isPlainObject(identity) && isPlainObject(identity.schedule) ? identity.schedule : null;
  if (!schedule) return ['arms', 'seed', 'conditions'];
  const conditions = schedule.conditions === undefined ? null : schedule.conditions;
  const out = [];
  if (!isDeepStrictEqual(schedule.arms, [...spec.arms])) out.push('arms');
  if (schedule.seed !== spec.seed) out.push('seed');
  if (!isDeepStrictEqual(conditions, spec.conditions === null ? null : [...spec.conditions])) out.push('conditions');
  return out;
}

function campaignOf(input, role) {
  const campaign = isPlainObject(input[role]) ? input[role] : {};
  return { identity: isPlainObject(campaign.identity) ? campaign.identity : null, runs: listOf(campaign.runs), safety: campaign.safety };
}

function gitOf(identity) {
  return identity && isPlainObject(identity.git) ? identity.git : {};
}

function recordedGateSha(identity) {
  return identity && isPlainObject(identity.gate) && typeof identity.gate.sha256 === 'string' && identity.gate.sha256
    ? identity.gate.sha256 : null;
}

function refusalsOf(input, gate) {
  const out = [];
  const add = (code, detail) => out.push({ code, detail });
  const campaigns = { baseline: campaignOf(input, 'baseline'), autopilot: campaignOf(input, 'autopilot'), claude: campaignOf(input, 'claude') };
  const candidates = ['autopilot', 'claude'];
  for (const role of candidates) {
    const recorded = recordedGateSha(campaigns[role].identity);
    if (recorded === null) add('gate_hash_missing', `${role}.gate.sha256`);
    else if (recorded !== input.gateSha256) add('gate_hash_mismatch', `${role}.gate.sha256`);
  }
  for (const role of ['baseline', ...candidates]) {
    const spec = gate.campaigns[role];
    const { identity, runs } = campaigns[role];
    if (!identity || identity.campaignId !== spec.id) add('campaign_id_mismatch', `${role}.campaignId`);
    if (runs.some((row) => row.campaignId !== spec.id)) add('campaign_id_mismatch', `${role}.rows.campaignId`);
    for (const field of scheduleMismatches(identity, spec)) add('campaign_schedule_mismatch', `${role}.schedule.${field}`);
  }
  for (const role of candidates) if (gitOf(campaigns[role].identity).dirty !== false) add('candidate_dirty', `${role}.git.dirty`);
  const autopilotSha = gitOf(campaigns.autopilot.identity).sha;
  if (typeof autopilotSha !== 'string' || !autopilotSha || autopilotSha !== gitOf(campaigns.claude.identity).sha) {
    add('candidate_sha_mismatch', 'autopilot.git.sha,claude.git.sha');
  }
  const pinSha = gitOf(campaigns.baseline.identity).sha;
  if (pinSha !== PIN_SHA) add('baseline_not_pin', 'baseline.git.sha');
  for (const role of candidates) {
    if (campaigns[role].runs.some((row) => row.schemaVersion !== gate.campaigns[role].rowSchema)) add('candidate_row_schema', `${role}.rows.schemaVersion`);
  }
  if (campaigns.baseline.runs.some((row) => row.schemaVersion !== gate.campaigns.baseline.rowSchema)) {
    add('baseline_row_schema', 'baseline.rows.schemaVersion');
  }
  return out;
}

// --- The drift sentinel (D-05) ----------------------------------------------------------------

/**
 * The baseline's autopilot rows against the autopilot campaign's 'off' rows
 * (68 D-01: with the switch off, autopilot equals the pin). `guards` (an
 * identity mismatch on identityMatch.autopilot, an under-round or drifted
 * campaign) make it inconclusive. Otherwise the completion interval must lie
 * inside (-margin, +margin) and the speed interval inside speedBand, or it
 * trips and carries the gate's blocker.
 */
export function sentinelCheck({ gate, baselineRows, candidateRows, guards = [], opts }) {
  const rule = gate.sentinel;
  const completion = completionComparison(baselineRows, candidateRows, gate.criteria.z);
  const speed = speedComparison(baselineRows, candidateRows, opts);
  const numbers = {
    completion: { diff: completion.diff, ci: completion.ci, baseline: completion.control, candidate: completion.treatment },
    speed: { estimate: speed.estimate, ci: speed.ci, usedTasks: speed.usedTasks, droppedTasks: speed.droppedTasks },
    completionMargin: rule.completionMargin,
    speedBand: [...rule.speedBand],
  };
  if (guards.length) return { status: 'inconclusive', reasons: [...guards], ...numbers, blocker: null };
  if (completion.diff === null || speed.status !== 'ok') return { status: 'inconclusive', reasons: ['sentinel_unavailable'], ...numbers, blocker: null };
  const reasons = [];
  const margin = rule.completionMargin;
  if (!(completion.ci[0] > -margin && completion.ci[1] < margin)) reasons.push('completion_not_equivalent');
  const [low, high] = rule.speedBand;
  if (!(speed.ci[0] >= low && speed.ci[1] <= high)) reasons.push('speed_outside_band');
  if (reasons.length) return { status: 'trip', reasons, ...numbers, blocker: rule.blocker };
  return { status: 'pass', reasons: [], ...numbers, blocker: null };
}

// What the non-Jev verdict inherits from a sentinel that is not 'pass'. A
// cause that is a fallback trigger keeps its code, namespaced 'sentinel', so
// the gate's "inconclusive for a listed trigger" rule sees it.
function sentinelGuards(sentinel, gate) {
  if (sentinel.status === 'trip') return ['sentinel_trip'];
  if (sentinel.status !== 'inconclusive') return [];
  const inherited = [];
  for (const reason of sentinel.reasons) {
    const [code, detail] = reason.split(':');
    if (!gate.fallback.triggers.includes(code)) continue;
    inherited.push(detail === undefined ? `${code}:sentinel` : `${code}:sentinel.${detail}`);
  }
  return [...inherited, 'sentinel_inconclusive'];
}

// --- The core-rebaseline-71 fallback (D-06) ----------------------------------------------------

function fallbackRefusals({ gate, gateSha256, pin, candidate, candidateSha }) {
  const spec = gate.fallback;
  const out = [];
  const add = (code, detail) => out.push({ code, detail });
  for (const [role, campaign] of [['pin', pin], ['candidate', candidate]]) {
    const rule = spec.campaigns[role];
    const { identity, runs } = campaign;
    if (!identity || identity.campaignId !== rule.id) add('fallback_campaign_mismatch', `${role}.campaignId`);
    if (runs.some((row) => row.campaignId !== rule.id)) add('fallback_campaign_mismatch', `${role}.rows.campaignId`);
    for (const field of scheduleMismatches(identity, { arms: [spec.arm], seed: rule.seed, conditions: rule.conditions })) {
      add('fallback_campaign_mismatch', `${role}.schedule.${field}`);
    }
    if (runs.some((row) => row.schemaVersion !== rule.rowSchema)) add('fallback_campaign_mismatch', `${role}.rows.schemaVersion`);
  }
  const pinSha = gitOf(pin.identity).sha;
  if (pinSha !== PIN_SHA) add('fallback_pin_not_pin', 'pin.git.sha');
  const git = gitOf(candidate.identity);
  if (typeof git.sha !== 'string' || git.sha !== candidateSha) add('fallback_candidate_not_measured', 'candidate.git.sha');
  if (git.dirty !== false) add('fallback_candidate_not_measured', 'candidate.git.dirty');
  if (recordedGateSha(candidate.identity) !== gateSha256) add('fallback_candidate_not_measured', 'candidate.gate.sha256');
  return out;
}

/**
 * The predeclared fallback (gate.fallback). Returns { result, replacement }:
 * result is the reported fallback block; replacement is null unless the
 * fallback was used, and then holds the non-Jev verdict, reasons, faster,
 * guards and criteria computed by the same rules (nonJevCriteria and
 * nonJevVerdict) on the pin campaign as baseline and the candidate campaign
 * as candidate, with identityMatch.claude compared between the two, minRounds
 * from gate.fallback.campaigns, the pin's sidecar for baseline safety and no
 * sentinel. Refusals stay inside the result and never reach the top level.
 */
export function evaluateFallback({ gate, gateSha256, primary, fallback, candidateSha = null, opts }) {
  const spec = gate.fallback;
  const base = { primaryVerdict: primary.verdict, primaryReasons: [...primary.reasons] };
  if (!isPlainObject(fallback)) {
    return { result: { status: 'not_supplied', ...base, verdict: null, reasons: [], refusals: [], campaigns: null }, replacement: null };
  }
  const pin = campaignOf(fallback, 'pin');
  const candidate = campaignOf(fallback, 'candidate');
  const campaigns = {
    pin: campaignFacts(pin, spec.campaigns.pin.minRounds, gate),
    candidate: campaignFacts(candidate, spec.campaigns.candidate.minRounds, gate),
  };
  const refusals = fallbackRefusals({ gate, gateSha256, pin, candidate, candidateSha });
  if (refusals.length) return { result: { status: 'refused', ...base, verdict: null, reasons: [], refusals, campaigns }, replacement: null };
  const triggered = primary.verdict === 'inconclusive'
    && primary.reasons.some((reason) => spec.triggers.some((trigger) => reason.startsWith(trigger)));
  if (!triggered) return { result: { status: 'not_triggered', ...base, verdict: null, reasons: [], refusals: [], campaigns }, replacement: null };

  const scope = gate.criteria.scope;
  const candidateCondition = gate.paths[spec.replaces].candidateCondition;
  const pinRows = pin.runs.filter((row) => row.set === scope && row.arm === spec.arm);
  const candidateRows = candidate.runs.filter((row) => row.set === scope && row.arm === spec.arm && row.condition === candidateCondition);
  const criteria = nonJevCriteria(pinRows, candidateRows, pin.safety instanceof Map ? pin.safety : null, gate, opts);
  const guards = unique([
    ...identityMismatches(pin.identity, candidate.identity, gate.identityMatch.claude, gate).map((field) => `identity_mismatch:${field}`),
    ...(campaigns.pin.meetsMinRounds && campaigns.candidate.meetsMinRounds ? [] : ['underpowered']),
    ...(campaigns.pin.complete && campaigns.candidate.complete ? [] : ['campaign_incomplete']),
    ...(campaigns.pin.resumeDrift || campaigns.candidate.resumeDrift ? ['resume_drift'] : []),
  ]);
  const decided = nonJevVerdict({ criteria, guards });
  return {
    result: { status: 'used', ...base, verdict: decided.verdict, reasons: [...decided.reasons], refusals: [], campaigns },
    replacement: { verdict: decided.verdict, reasons: decided.reasons, faster: decided.faster, guards, criteria },
  };
}

// --- Sensitivity and categories (descriptive) ----------------------------------------------------

function speedSummary(speed) {
  return {
    status: speed.status, estimate: speed.estimate, ci: speed.ci, level: speed.level, usedTasks: speed.usedTasks, droppedTasks: speed.droppedTasks,
  };
}

function completionSummary(completion) {
  return { diff: completion.diff, ci: completion.ci, z: completion.z };
}

function sensitivityOf(groups, gate, opts) {
  const level = gate.bootstrap.sensitivityLevel;
  const wide = { ...opts, level };
  return {
    label: SENSITIVITY_LABEL,
    decisive: false,
    level,
    z: SENSITIVITY_Z,
    jev: {
      speed: speedSummary(speedComparison(groups.autopilotOff, groups.autopilotOn, wide)),
      completion: completionSummary(completionComparison(groups.autopilotOff, groups.autopilotOn, SENSITIVITY_Z)),
    },
    nonJev: {
      speed: speedSummary(speedComparison(groups.baselineClaude, groups.claudeOff, wide)),
      completion: completionSummary(completionComparison(groups.baselineClaude, groups.claudeOff, SENSITIVITY_Z)),
    },
  };
}

function targetCheck(pathName, category, speed, speedup) {
  const ratioAtMost = 1 / speedup[0];
  let status = 'n/a';
  if (speed.status === 'ok') status = speed.ci[1] <= ratioAtMost ? 'met' : 'not met';
  return { path: pathName, category, speedup: [...speedup], ratioAtMost, estimate: speed.estimate, ci: speed.ci, status };
}

function categoriesOf(groups, gate, opts) {
  const inCategory = (rows, category) => rows.filter((row) => row.category === category);
  const byCategory = {};
  for (const category of CATEGORIES) {
    byCategory[category] = {
      jev: speedSummary(speedComparison(inCategory(groups.autopilotOff, category), inCategory(groups.autopilotOn, category), opts)),
      nonJev: speedSummary(speedComparison(inCategory(groups.baselineClaude, category), inCategory(groups.claudeOff, category), opts)),
    };
  }
  return {
    use: gate.targets.use,
    byCategory,
    targets: {
      autopilotMixed: targetCheck('jev-autopilot', 'mixed', byCategory.mixed.jev, gate.targets.autopilotMixed),
      mcpClickHeavy: [
        targetCheck('jev-mcp-run-task', 'click-heavy', byCategory['click-heavy'].jev, gate.targets.mcpClickHeavy),
        targetCheck('mcp-non-jev', 'click-heavy', byCategory['click-heavy'].nonJev, gate.targets.mcpClickHeavy),
      ],
      mcpUatStyle: { speedup: [...gate.targets.mcpUatStyle], status: UAT_NOT_MEASURED },
    },
  };
}

// --- The evaluator --------------------------------------------------------------------------

function jevCriteria(groups, gate, input, opts) {
  const speed = speedComparison(groups.autopilotOff, groups.autopilotOn, opts);
  const floor = aaFloor(groups.autopilotOff, opts);
  const completion = completionComparison(groups.autopilotOff, groups.autopilotOn, gate.criteria.z);
  const exercise = exerciseStats({ onRows: groups.autopilotOn, offRows: groups.autopilotOff, gate });
  return {
    speed: jevSpeedCriterion(speed, floor, gate),
    completion: completionCriterion(completion, gate),
    safety: jevSafety({ onRows: groups.autopilotOn, offRows: groups.autopilotOff, gate, suites: input.suites }),
    exercise,
  };
}

function nonJevCriteria(baselineRows, candidateRows, baselineSidecar, gate, opts) {
  return {
    speed: nonJevSpeedCriterion(speedComparison(baselineRows, candidateRows, opts), gate),
    completion: completionCriterion(completionComparison(baselineRows, candidateRows, gate.criteria.z), gate),
    safety: nonJevSafety({ baselineRows, candidateRows, gate, baselineSidecar }),
  };
}

function exercisePublic(exercise) {
  return { status: exercise.status, reasons: [...exercise.reasons] };
}

/**
 * evaluateGate({ gate, gateSha256, baseline: {identity, runs, safety},
 * autopilot: {identity, runs}, claude: {identity, runs}, suites: {ran,
 * results}, fallback }, { iterations }) -> verdicts per path with every
 * criterion's numbers. iterations defaults to gate.bootstrap.iterations; the
 * seed and level always come from gate.bootstrap. With any refusal the result
 * holds only refusals, campaigns and inputs.
 */
export function evaluateGate(input, { iterations } = {}) {
  const { gate } = input;
  const opts = {
    iterations: iterations === undefined ? gate.bootstrap.iterations : iterations,
    seed: gate.bootstrap.seed,
    level: gate.bootstrap.level,
  };
  const inputs = { iterations: opts.iterations, seed: opts.seed, level: opts.level };
  const baseline = campaignOf(input, 'baseline');
  const autopilot = campaignOf(input, 'autopilot');
  const claude = campaignOf(input, 'claude');
  const campaigns = {
    baseline: campaignFacts(baseline, gate.campaigns.baseline.minRounds, gate),
    autopilot: campaignFacts(autopilot, gate.campaigns.autopilot.minRounds, gate),
    claude: campaignFacts(claude, gate.campaigns.claude.minRounds, gate),
  };
  const refusals = refusalsOf(input, gate);
  if (refusals.length) return { refusals, campaigns, inputs };

  const groups = groupRows({ baseline: baseline.runs, autopilot: autopilot.runs, claude: claude.runs }, gate);

  // The sentinel: baseline autopilot vs autopilot 'off' (cross-campaign).
  const sentinel = sentinelCheck({
    gate,
    baselineRows: groups.baselineAutopilot,
    candidateRows: groups.autopilotOff,
    guards: unique([
      ...identityMismatches(baseline.identity, autopilot.identity, gate.identityMatch.autopilot, gate).map((field) => `identity_mismatch:${field}`),
      ...(campaigns.baseline.meetsMinRounds && campaigns.autopilot.meetsMinRounds ? [] : ['underpowered']),
      ...(campaigns.baseline.complete && campaigns.autopilot.complete ? [] : ['campaign_incomplete']),
      ...(campaigns.baseline.resumeDrift || campaigns.autopilot.resumeDrift ? ['resume_drift'] : []),
    ]),
    opts,
  });

  // The Jev paths: one within-campaign comparison, two labels.
  const jev = jevCriteria(groups, gate, input, opts);
  const jevGuards = [
    ...(campaigns.autopilot.meetsMinRounds ? [] : ['underpowered']),
    ...(campaigns.autopilot.complete ? [] : ['campaign_incomplete']),
    ...(campaigns.autopilot.resumeDrift ? ['resume_drift'] : []),
    ...(campaigns.autopilot.corpusMatch ? [] : ['corpus_mismatch']),
  ];
  const jevResult = jevVerdict({ criteria: jev, guards: jevGuards });
  const jevPath = (name) => ({
    label: gate.paths[name].label,
    verdict: jevResult.verdict,
    reasons: [...jevResult.reasons],
    guards: [...jevGuards],
    criteria: { speed: jev.speed, completion: jev.completion, safety: jev.safety, exercise: exercisePublic(jev.exercise) },
  });

  // The non-Jev MCP path: the pin against the candidate on the claude driver.
  const nonJev = nonJevCriteria(groups.baselineClaude, groups.claudeOff, baseline.safety instanceof Map ? baseline.safety : null, gate, opts);
  const nonJevGuards = unique([
    ...identityMismatches(baseline.identity, claude.identity, gate.identityMatch.claude, gate).map((field) => `identity_mismatch:${field}`),
    ...(campaigns.baseline.meetsMinRounds && campaigns.claude.meetsMinRounds ? [] : ['underpowered']),
    ...(campaigns.baseline.complete && campaigns.claude.complete ? [] : ['campaign_incomplete']),
    ...(campaigns.baseline.resumeDrift || campaigns.claude.resumeDrift ? ['resume_drift'] : []),
    ...sentinelGuards(sentinel, gate),
  ]);
  const nonJevResult = nonJevVerdict({ criteria: nonJev, guards: nonJevGuards });
  const primaryNonJev = {
    label: gate.paths['mcp-non-jev'].label,
    verdict: nonJevResult.verdict,
    reasons: nonJevResult.reasons,
    faster: nonJevResult.faster,
    source: 'primary',
    guards: nonJevGuards,
    criteria: nonJev,
  };

  const fallback = evaluateFallback({
    gate, gateSha256: input.gateSha256, primary: nonJevResult, fallback: input.fallback, candidateSha: campaigns.autopilot.gitSha, opts,
  });
  const nonJevPath = fallback.replacement
    ? { ...primaryNonJev, ...fallback.replacement, source: 'fallback' }
    : primaryNonJev;

  return {
    refusals: [],
    campaigns,
    exercise: jev.exercise,
    sentinel,
    paths: {
      'jev-mcp-run-task': jevPath('jev-mcp-run-task'),
      'jev-autopilot': jevPath('jev-autopilot'),
      'mcp-non-jev': nonJevPath,
    },
    fallback: fallback.result,
    categories: categoriesOf(groups, gate, opts),
    sensitivity: sensitivityOf(groups, gate, opts),
    diagnostics: {
      endLabels: { off: endLabelCounts(groups.autopilotOff), on: endLabelCounts(groups.autopilotOn) },
      metaLoopBreaks: {
        off: groups.autopilotOff.filter((row) => isCounted(row) && row.endLabel === META_LOOP_BREAK).length,
        on: groups.autopilotOn.filter((row) => isCounted(row) && row.endLabel === META_LOOP_BREAK).length,
      },
    },
    inputs,
  };
}
