/**
 * Phase 71 gate report (EVAL-01, EVAL-02; CONTEXT D-10, D-16, D-18; M-70-04
 * and the 69-VALIDATION caller-effect rows).
 *
 * Pure: no clock, no environment, no filesystem. The CLI (evaluate-gate.mjs)
 * writes the markdown beside the decision file, never into a campaign
 * directory (Pitfall 13).
 *
 * buildTables(input, result) computes the descriptive tables from the
 * evaluator input (committed rows, identities, the baseline sidecar) and the
 * evaluator result. renderGateReport(input, result, decision) renders them
 * with the verdicts and the release claims of the decision file.
 *
 * Rules the layout keeps (D-10, D-18):
 * - per driver, the baseline, control and fast columns with Wilson and
 *   Newcombe intervals, wall time per completed task, and LLM cost and Jev cost
 *   on separate labelled lines that are never summed;
 * - speed is only the runner's wallMs; per-decision Jev timing and the Jev
 *   time totals appear only under the diagnostics heading, which is the
 *   second-to-last section, so nothing before it names them;
 * - the typed-outcome agreement table (M-70-04) and the MCP caller effect
 *   (69 V4 rows) are descriptive and never change a verdict;
 * - the markdown passes through the report.mjs URL neutralisation and holds no
 *   NaN, Infinity, null percentage or undefined.
 */

import { FAST_MODE_ROW_OUTCOMES, JEV_FALLBACK_REASONS, JEV_SOURCES, isClaimedSuccess } from '../../lib/runs.mjs';
import { median, wilson } from '../../lib/stats.mjs';
import { DECISION_PATHS, V6_ACTIONS, describePath, formatClaimValue } from './decision.mjs';
import { groupRows } from './evaluate.mjs';

export const DIAGNOSTICS_HEADING = '## Diagnostics (per decision, not whole-task speed)';

export const GATE_REPORT_SECTIONS = Object.freeze([
  '## Verdicts',
  '## Release claims',
  '## Autopilot driver',
  '## Claude Code driver',
  '## Per category (descriptive)',
  '## Per task',
  '## Failure cases',
  '## Infra errors, flags and timeouts',
  '## Fast-mode exercise',
  '## Typed outcome agreement (descriptive, M-70-04)',
  '## MCP caller effect (descriptive, 69 V4 rows)',
  '## Sentinel',
  '## Sensitivity (non-decisive)',
  DIAGNOSTICS_HEADING,
  '## Method',
]);

export const NO_ATTEMPT_SENTENCE = 'Runs with no Jev attempt (no_block, or a summary with zero fast steps) are not acted (2026-10-16 decision).';
export const FALSE_DONE_SENTENCE = 'False done is decisive through claimedSuccessOnFail (gate claimWords.autopilot.candidateTypedOutcome).';
export const CALLER_EFFECT_SENTENCE = 'Committed rows hold host turns and total FSB tool calls; verification calls by tool name are not split out.';
export const LONG_RUN_MS = 60000;
export const NO_BLOCK = 'no block';
export const UNKNOWN_SOURCE = 'unknown';

export const GATE_METHOD_NOTES = Object.freeze([
  'Intention to treat: the fast condition means the switch was on, whether or not Jev acted in a run. The per-protocol view (acted runs only) appears only under the diagnostics heading.',
  "Every speed number reads only wallMs on the runner's clock: the geometric mean of per-task median ratios over completed runs with a hierarchical bootstrap CI.",
  'Wall time per completed task covers completed runs only, so it is read together with completion: a condition that turns slow successes into fast failures can look faster.',
  'Completion differences use the Newcombe hybrid score interval on pooled counted runs; infra errors are outside every denominator.',
  'Both Jev verdicts come from run_task in core-gate-71-autopilot (shared loop mechanics); the side-panel start path was not driven separately.',
  'Runs after Phase 71 use 24-letter lowercase run tokens, while the 8a058bdf baseline used base64url tokens, so the start URL in each instruction differs from the baseline in its token alphabet and length only (22 base64url characters at the pin, 24 lowercase letters now).',
  'LLM cost is user-borne and Jev cost is FSB-borne; they are reported side by side and never summed.',
  'A path passes only when every criterion passes (intersection-union); the Bonferroni sensitivity line, the per-category targets and every descriptive section are never decisive.',
  'Release claims are rendered only from typed whole-task numbers: wallMs ratios, completion differences and counts, and cost.',
]);

// The evaluator's row groups (evaluate.mjs groupRows) in report order.
const GROUP_KEYS = Object.freeze(['baselineAutopilot', 'autopilotOff', 'autopilotOn', 'baselineClaude', 'claudeOff']);
const SAFE_TEXT_MAX = 160;

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

const isCounted = (row) => row.infraError === null;
const isCompleted = (row) => isCounted(row) && row.pass === true;

function runsOf(campaign) {
  return isPlainObject(campaign) && Array.isArray(campaign.runs) ? campaign.runs.filter(isPlainObject) : [];
}

function medianOrNull(values) {
  const list = values.map(finite).filter((value) => value !== null);
  return list.length ? median(list) : null;
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort(codeUnitCompare).map((key) => [key, counts[key]]));
}

// Count maps summed key by key, with `order` first and anything else after it.
function sumCounts(maps, order = []) {
  const totals = new Map();
  for (const map of maps) {
    if (!isPlainObject(map)) continue;
    for (const [key, value] of Object.entries(map)) {
      if (Number.isSafeInteger(value) && value >= 0) totals.set(key, (totals.get(key) || 0) + value);
    }
  }
  const keys = [...order.filter((key) => totals.has(key)), ...[...totals.keys()].filter((key) => !order.includes(key)).sort(codeUnitCompare)];
  return Object.fromEntries(keys.map((key) => [key, totals.get(key)]));
}

function labelsOf(gate) {
  const { campaigns } = gate;
  return {
    baselineAutopilot: `${campaigns.baseline.id} autopilot`,
    autopilotOff: `${campaigns.autopilot.id} off`,
    autopilotOn: `${campaigns.autopilot.id} on`,
    baselineClaude: `${campaigns.baseline.id} claude`,
    claudeOff: `${campaigns.claude.id} off`,
  };
}

// --- Tables ------------------------------------------------------------------------------

function wallPerCompleted(rows) {
  const done = rows.filter(isCompleted);
  const taskIds = [...new Set(done.map((row) => row.taskId))].sort(codeUnitCompare);
  const medians = taskIds
    .map((id) => medianOrNull(done.filter((row) => row.taskId === id).map((row) => row.wallMs)))
    .filter((value) => value !== null && value > 0);
  return medians.length ? Math.exp(medians.reduce((sum, value) => sum + Math.log(value), 0) / medians.length) : null;
}

function costPerCompleted(counted, completed, pick) {
  const values = counted.map(pick).map(finite).filter((value) => value !== null);
  return completed > 0 && values.length ? values.reduce((sum, value) => sum + value, 0) / completed : null;
}

function groupStats(rows) {
  const counted = rows.filter(isCounted);
  const completed = counted.filter((row) => row.pass === true).length;
  const v2 = rows.some((row) => row.schemaVersion === 2);
  const jevUsd = (key) => (row) => (isPlainObject(row.jev) && isPlainObject(row.jev.usd) ? row.jev.usd[key] : null);
  return {
    runs: rows.length,
    counted: counted.length,
    completed,
    rate: counted.length ? completed / counted.length : null,
    wilson: counted.length ? wilson(completed, counted.length) : [null, null],
    infraErrors: rows.length - counted.length,
    timedOut: counted.filter((row) => row.timedOut === true).length,
    wallPerCompletedMs: wallPerCompleted(rows),
    llmCostPerCompleted: costPerCompleted(counted, completed, (row) => (isPlainObject(row.cost) ? row.cost.usd : null)),
    llmCostLabels: countBy(counted.map((row) => (isPlainObject(row.cost) ? row.cost.label : null))),
    jevCostPerCompleted: v2
      ? { provider: costPerCompleted(counted, completed, jevUsd('provider')), estimate: costPerCompleted(counted, completed, jevUsd('estimate')) }
      : null,
  };
}

function perTaskStats(rows) {
  const taskIds = [...new Set(rows.map((row) => row.taskId))].filter((id) => typeof id === 'string').sort(codeUnitCompare);
  return taskIds.map((taskId) => {
    const taskRows = rows.filter((row) => row.taskId === taskId);
    const counted = taskRows.filter(isCounted);
    const completed = counted.filter((row) => row.pass === true);
    return {
      taskId,
      runs: taskRows.length,
      infraErrors: taskRows.length - counted.length,
      counted: counted.length,
      completed: completed.length,
      rate: counted.length ? completed.length / counted.length : null,
      medianWallMs: medianOrNull(completed.map((row) => row.wallMs)),
    };
  });
}

function failureCases(rows) {
  const failed = rows.filter((row) => isCounted(row) && row.pass !== true);
  const byKind = {};
  for (const row of failed) {
    const kinds = Array.isArray(row.checks)
      ? [...new Set(row.checks.filter((check) => isPlainObject(check) && check.pass !== true).map((check) => check.kind || 'unnamed'))]
      : [];
    for (const kind of kinds.length ? kinds : ['no failing check']) (byKind[kind] = byKind[kind] || []).push(row.runId);
  }
  const sorted = Object.fromEntries(Object.keys(byKind).sort(codeUnitCompare).map((kind) => [kind, byKind[kind].sort(codeUnitCompare)]));
  return { failedRuns: failed.length, byKind: sorted };
}

function infraOf(rows) {
  const infra = rows.filter((row) => !isCounted(row));
  return {
    count: infra.length,
    byCode: countBy(infra.map((row) => row.infraError)),
    runIds: infra.map((row) => row.runId).sort(codeUnitCompare),
    flags: countBy(rows.flatMap((row) => (Array.isArray(row.flags) ? row.flags : []))),
    timedOut: rows.filter((row) => isCounted(row) && row.timedOut === true).length,
  };
}

function sourceOf(row) {
  return isPlainObject(row.jev) && JEV_SOURCES.includes(row.jev.source) ? row.jev.source : UNKNOWN_SOURCE;
}

function exerciseTable(groups, result) {
  const on = groups.autopilotOn.filter(isCounted);
  const fallbacks = sumCounts(on.map((row) => (isPlainObject(row.jev) ? row.jev.fallbacks : null)), [...JEV_FALLBACK_REASONS, 'other']);
  const withSensitive = { sensitive_goal: fallbacks.sensitive_goal || 0, ...fallbacks };
  const bySource = Object.fromEntries([...JEV_SOURCES, UNKNOWN_SOURCE].map((source) => [source, on.filter((row) => sourceOf(row) === source).length]));
  const pairCounts = countBy(on
    .filter((row) => isPlainObject(row.jev) && Array.isArray(row.jev.servedModels) && row.jev.servedModels.length)
    .map((row) => `${row.jev.servedModels.join('+')} / ${(row.jev.instrumentVersions || []).join('+') || 'none'}`));
  const exercise = isPlainObject(result.exercise) ? result.exercise : {};
  return {
    status: exercise.status || null,
    reasons: Array.isArray(exercise.reasons) ? [...exercise.reasons] : [],
    onCounted: on.length,
    actedRuns: on.filter((row) => isPlainObject(row.jev) && row.jev.acted === true).length,
    actedShare: finite(exercise.actedShare),
    minActedShare: finite(exercise.minActedShare),
    fallbacks: withSensitive,
    bySource,
    missingMeasurement: on.filter((row) => Array.isArray(row.flags) && row.flags.includes('jev_measurement_missing')).length,
    unknownExposure: bySource[UNKNOWN_SOURCE],
    calibration: sumCounts(on.filter((row) => isPlainObject(row.jev) && row.jev.acted === true).map((row) => row.jev.calibrationStatuses),
      ['calibrated', 'uncalibrated', 'snapshot_changed', 'other']),
    uncalibratedActedRuns: Number.isSafeInteger(exercise.uncalibratedActedRuns) ? exercise.uncalibratedActedRuns : 0,
    pairs: isPlainObject(exercise.pairs) ? exercise.pairs : { servedModels: [], instrumentVersions: [] },
    pairCounts,
    leakRuns: Number.isSafeInteger(exercise.leakRuns) ? exercise.leakRuns : 0,
    leakRunIds: Array.isArray(exercise.leakRunIds) ? [...exercise.leakRunIds] : [],
  };
}

function agreementTable(groups, gate) {
  const on = groups.autopilotOn.filter(isCounted);
  const outcomeOf = (row) => (isPlainObject(row.fastMode) ? row.fastMode.outcome : NO_BLOCK);
  const field = (key) => on.map((row) => (isPlainObject(row.fastMode) ? row.fastMode[key] : null));
  const table = [...FAST_MODE_ROW_OUTCOMES, NO_BLOCK].map((outcome) => {
    const matching = on.filter((row) => outcomeOf(row) === outcome);
    return { outcome, pass: matching.filter((row) => row.pass === true).length, fail: matching.filter((row) => row.pass !== true).length };
  });
  const done = on.filter((row) => outcomeOf(row) === 'done');
  const longRuns = {};
  for (const key of GROUP_KEYS) {
    const counted = groups[key].filter(isCounted);
    longRuns[key] = { over: counted.filter((row) => finite(row.wallMs) !== null && row.wallMs > LONG_RUN_MS).length, counted: counted.length };
  }
  return {
    onCounted: on.length,
    table,
    falseDone: done.filter((row) => row.pass !== true).length,
    doneWithoutSuccessWord: done.filter((row) => !isClaimedSuccess('autopilot', row.claimed, gate.claimWords.autopilot.candidate)).length,
    falseAmbiguous: on.filter((row) => outcomeOf(row) === 'ambiguous' && row.pass === true).length,
    uncertainUnobserved: on.filter((row) => isPlainObject(row.fastMode) && row.fastMode.uncertainUnobserved === true).length,
    humanGate: countBy(field('humanGate')),
    exhausted: countBy(field('exhausted')),
    latched: countBy(field('latched')),
    noBlock: on.filter((row) => !isPlainObject(row.fastMode)).length,
    longRuns,
  };
}

function callerStats(rows) {
  return {
    completedRuns: rows.length,
    turnsMedian: medianOrNull(rows.map((row) => (isPlainObject(row.host) ? row.host.numTurns : null))),
    callsMedian: medianOrNull(rows.map((row) => (isPlainObject(row.fsb) ? row.fsb.calls : null))),
  };
}

function callerEffectTable(groups) {
  const pin = groups.baselineClaude.filter(isCompleted);
  const candidate = groups.claudeOff.filter(isCompleted);
  const taskIds = [...new Set([...pin, ...candidate].map((row) => row.taskId))].filter((id) => typeof id === 'string').sort(codeUnitCompare);
  return {
    perTask: taskIds.map((taskId) => ({
      taskId,
      pin: callerStats(pin.filter((row) => row.taskId === taskId)),
      candidate: callerStats(candidate.filter((row) => row.taskId === taskId)),
    })),
    pooled: { pin: callerStats(pin), candidate: callerStats(candidate) },
  };
}

function protocolStats(rows) {
  const counted = rows.filter(isCounted);
  const completed = counted.filter((row) => row.pass === true).length;
  return { counted: counted.length, completed, rate: counted.length ? completed / counted.length : null, wallPerCompletedMs: wallPerCompleted(rows) };
}

function diagnosticsTable(groups, result) {
  const on = groups.autopilotOn.filter(isCounted);
  const timed = on.filter((row) => isPlainObject(row.jev) && finite(row.jev.jevMs) !== null && Number.isSafeInteger(row.jev.jevCalls)
    && row.jev.jevCalls > 0);
  const msTotal = timed.reduce((sum, row) => sum + row.jev.jevMs, 0);
  const callsTotal = timed.reduce((sum, row) => sum + row.jev.jevCalls, 0);
  const diagnostics = isPlainObject(result.diagnostics) ? result.diagnostics : {};
  return {
    jevMsMedianPerRun: medianOrNull(on.map((row) => (isPlainObject(row.jev) ? row.jev.jevMs : null))),
    jevMsPerCall: callsTotal > 0 ? msTotal / callsTotal : null,
    timedRuns: timed.length,
    metaLoopBreaks: isPlainObject(diagnostics.metaLoopBreaks) ? diagnostics.metaLoopBreaks : { off: 0, on: 0 },
    endLabels: isPlainObject(diagnostics.endLabels) ? diagnostics.endLabels : { off: {}, on: {} },
    perProtocol: {
      acted: protocolStats(on.filter((row) => isPlainObject(row.jev) && row.jev.acted === true)),
      off: protocolStats(groups.autopilotOff),
    },
  };
}

/**
 * The descriptive tables of the gate report, from the evaluator input and its
 * result: per-group columns, per-task rows, failure cases, infra errors, the
 * exercise counts, the typed-outcome agreement, the caller effect and the
 * diagnostics. Nothing here feeds a verdict.
 */
export function buildTables(input, result) {
  const { gate } = input;
  const groups = groupRows({ baseline: runsOf(input.baseline), autopilot: runsOf(input.autopilot), claude: runsOf(input.claude) }, gate);
  const each = (fn) => Object.fromEntries(GROUP_KEYS.map((key) => [key, fn(groups[key])]));
  return {
    labels: labelsOf(gate),
    groups: each(groupStats),
    perTask: each(perTaskStats),
    failures: each(failureCases),
    infra: each(infraOf),
    exercise: exerciseTable(groups, result),
    agreement: agreementTable(groups, gate),
    callerEffect: callerEffectTable(groups),
    diagnostics: diagnosticsTable(groups, result),
  };
}

// --- Formatting -----------------------------------------------------------------------------

function safeText(value, max = SAFE_TEXT_MAX) {
  if (typeof value !== 'string') return 'n/a';
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return clean && !clean.includes('://') ? clean : 'n/a';
}

function fmtPct(value) {
  return finite(value) === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function fmtCiPct(ci) {
  return Array.isArray(ci) && finite(ci[0]) !== null && finite(ci[1]) !== null ? `${fmtPct(ci[0])} to ${fmtPct(ci[1])}` : 'n/a';
}

function fmtPoints(value) {
  return finite(value) === null ? 'n/a' : formatClaimValue('completion-diff', value);
}

function fmtCiPoints(ci) {
  return Array.isArray(ci) && finite(ci[0]) !== null && finite(ci[1]) !== null ? `${fmtPoints(ci[0])} to ${fmtPoints(ci[1])} points` : 'n/a';
}

function fmtMs(value) {
  return finite(value) === null ? 'n/a' : `${Math.round(value).toLocaleString('en-US')} ms`;
}

function fmtUsd(value) {
  return finite(value) === null ? 'n/a' : `$${value.toFixed(4)}`;
}

function fmtUsdFine(value) {
  return finite(value) === null ? 'n/a' : `$${value.toFixed(6)}`;
}

function fmtNum(value, digits = 1) {
  return finite(value) === null ? 'n/a' : value.toFixed(digits);
}

function fmtCounts(counts) {
  const entries = Object.entries(isPlainObject(counts) ? counts : {});
  return entries.length ? entries.map(([key, count]) => `${safeText(key, 80)}: ${count}`).join(', ') : 'none';
}

function fmtList(values) {
  const list = (Array.isArray(values) ? values : []).map((value) => safeText(String(value), 120));
  return list.length ? list.join(', ') : 'none';
}

function cell(value) {
  return String(value).replace(/\|/g, '/');
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// --- Sections ----------------------------------------------------------------------------------

function renderHeader(decision) {
  const gate = decision.gate;
  const campaign = (role) => {
    const facts = decision.campaigns[role];
    if (!facts) return `${role} n/a`;
    return `${role} ${safeText(facts.id)} (sha ${safeText(facts.gitSha)}, ${facts.rounds ?? 'n/a'} rounds, created ${safeText(facts.createdAt)})`;
  };
  const suites = decision.suites.ran
    ? `ran ${plural(decision.suites.results.length, 'suite')}: ${decision.suites.results.map((result) => `${safeText(result.command)} exit ${result.exitCode}`).join('; ')}`
    : 'not run (safety is inconclusive without them)';
  return [
    `# Release gate report: gate ${safeText(gate.gateVersion)}`,
    '',
    `- Gate: ${safeText(gate.path)}, sha256 ${safeText(gate.sha256)}; last author date ${safeText(gate.authorDate)}, committer date ${safeText(gate.committerDate)}`,
    `- Measured sha: ${safeText(decision.measuredSha)}`,
    `- Campaigns: ${['baseline', 'autopilot', 'claude'].map(campaign).join('; ')}`,
    `- Evaluator: ${decision.evaluator.iterations} bootstrap iterations, seed ${decision.evaluator.seed}, level ${decision.evaluator.level}`,
    `- Tighten-only suites: ${suites}`,
    '',
  ];
}

function renderVerdicts(decision) {
  const lines = ['## Verdicts', ''];
  for (const name of DECISION_PATHS) {
    const entry = decision.paths[name];
    const { speed, completion, safety, exercised, identity } = entry.criteria;
    lines.push(`- ${describePath(decision, name)} -> ${entry.v6Action} (${safeText(entry.label)})`);
    lines.push(`  - Speed (wallMs ratio): ${speed.verdict}, ${fmtPct(speed.estimate)} (95% CI ${fmtCiPct(speed.ci)})${name === 'mcp-non-jev' ? `; faster: ${entry.faster === true ? 'yes' : 'no'}` : ''}`);
    lines.push(`  - Completion difference: ${completion.verdict}, ${fmtPoints(completion.diff)} points (95% CI ${fmtCiPoints(completion.ci)})`);
    lines.push(`  - Safety: ${safety.verdict}${safety.reasons.length ? ` (${fmtList(safety.reasons)})` : ''}`);
    if (exercised) lines.push(`  - Exercised: ${exercised.status}, acted share ${fmtPct(exercised.actedShare)}`);
    if (identity) lines.push(`  - Identity: ${identity.verdict}${identity.mismatches.length ? ` (mismatches: ${fmtList(identity.mismatches)})` : ''}`);
    lines.push(`  - Reasons: ${fmtList(entry.reasons)}`);
    lines.push(`  - V6 action: ${V6_ACTIONS[entry.v6Action]}`);
  }
  const fallback = decision.fallback;
  if (fallback.status === 'not_supplied') {
    lines.push('- Fallback core-rebaseline-71: not supplied');
  } else {
    lines.push(`- Fallback core-rebaseline-71: ${fallback.status}; primary verdict ${safeText(fallback.primaryVerdict)} (${fmtList(fallback.primaryReasons)}); reasons ${fmtList(fallback.reasons)}`);
  }
  lines.push('');
  return lines;
}

function renderClaims(decision) {
  const lines = ['## Release claims', '', 'V6 release copy quotes only these sentences. Every number in them is a whole-task figure: a wallMs ratio, a completion difference or count, or a cost.', ''];
  if (!decision.claims.length) lines.push('- No release claim sentence for this outcome.');
  for (const entry of decision.claims) lines.push(`- ${entry.text}`);
  lines.push('');
  return lines;
}

function renderAutopilot(tables, result) {
  const { groups, labels } = tables;
  const base = groups.baselineAutopilot;
  const off = groups.autopilotOff;
  const on = groups.autopilotOn;
  const jev = result.paths['jev-mcp-run-task'].criteria;
  const sentinel = result.sentinel;
  const floor = jev.speed.aaFloor;
  const ruleA = jev.safety.ruleA;
  const ruleB = jev.safety.ruleB;
  return [
    '## Autopilot driver',
    '',
    `Columns: baseline is ${labels.baselineAutopilot} at the pin; control is ${labels.autopilotOff} (switch off); fast is ${labels.autopilotOn} (switch on), interleaved run by run with control.`,
    '',
    '| Measure | Baseline | Control | Fast |',
    '|---------|----------|---------|------|',
    `| Counted runs (infra errors) | ${base.counted} (${base.infraErrors}) | ${off.counted} (${off.infraErrors}) | ${on.counted} (${on.infraErrors}) |`,
    `| Completion | ${base.completed}/${base.counted} = ${fmtPct(base.rate)} | ${off.completed}/${off.counted} = ${fmtPct(off.rate)} | ${on.completed}/${on.counted} = ${fmtPct(on.rate)} |`,
    `| Wilson 95% CI | ${fmtCiPct(base.wilson)} | ${fmtCiPct(off.wilson)} | ${fmtCiPct(on.wilson)} |`,
    `| Wall time per completed task | ${fmtMs(base.wallPerCompletedMs)} | ${fmtMs(off.wallPerCompletedMs)} | ${fmtMs(on.wallPerCompletedMs)} |`,
    '',
    `- Completion difference, fast minus control (Newcombe 95% CI, decisive): ${fmtPoints(jev.completion.diff)} points (${fmtCiPoints(jev.completion.ci)})`,
    `- Completion difference, control minus baseline (Newcombe 95% CI, sentinel): ${fmtPoints(sentinel.completion.diff)} points (${fmtCiPoints(sentinel.completion.ci)})`,
    `- Whole-task time, fast over control (wallMs ratio, decisive): ${fmtPct(jev.speed.estimate)} (95% CI ${fmtCiPct(jev.speed.ci)}); A/A noise floor of control ${floor && floor.status === 'ok' ? `${fmtPct(floor.estimate)} (95% CI ${fmtCiPct(floor.ci)})` : 'n/a'}`,
    `- Whole-task time, control over baseline (wallMs ratio, sentinel): ${fmtPct(sentinel.speed.estimate)} (95% CI ${fmtCiPct(sentinel.speed.ci)})`,
    `- LLM cost per completed task (user-borne): baseline ${fmtUsd(base.llmCostPerCompleted)}, control ${fmtUsd(off.llmCostPerCompleted)}, fast ${fmtUsd(on.llmCostPerCompleted)}`,
    `- Jev cost per completed task (FSB-borne, reported apart and never added): control provider ${fmtUsdFine(off.jevCostPerCompleted && off.jevCostPerCompleted.provider)}, estimate ${fmtUsdFine(off.jevCostPerCompleted && off.jevCostPerCompleted.estimate)}; fast provider ${fmtUsdFine(on.jevCostPerCompleted && on.jevCostPerCompleted.provider)}, estimate ${fmtUsdFine(on.jevCostPerCompleted && on.jevCostPerCompleted.estimate)}`,
    `- Safety rule (a), acted or unknown-exposure fast runs: ${ruleA.events} events in ${plural(ruleA.runs, 'run')} (${fmtCounts(ruleA.byKind)}); unverifiable ${ruleA.unverifiableRuns}`,
    `- Safety rule (b), non-acted fast runs against control: ${ruleB.on.events} events in ${plural(ruleB.on.runs, 'run')} (rate ${fmtNum(ruleB.on.rate, 3)}) against ${ruleB.off.events} in ${plural(ruleB.off.runs, 'run')} (rate ${fmtNum(ruleB.off.rate, 3)}); unverifiable ${ruleB.on.unverifiableRuns + ruleB.off.unverifiableRuns}`,
    '',
  ];
}

function renderClaude(tables, result) {
  const { groups, labels } = tables;
  const base = groups.baselineClaude;
  const cand = groups.claudeOff;
  const path = result.paths['mcp-non-jev'];
  const { speed, completion, safety } = path.criteria;
  const comparison = path.source === 'fallback'
    ? 'the core-rebaseline-71 fallback (core-rebaseline-71-pin against core-rebaseline-71-candidate)'
    : `the primary comparison (${labels.baselineClaude} against ${labels.claudeOff})`;
  const reported = (role) => {
    const facts = result.campaigns[role] && result.campaigns[role].reported;
    return isPlainObject(facts) ? Object.entries(facts).map(([field, value]) => `${field} ${safeText(typeof value === 'string' ? value : null)}`).join(', ') : 'n/a';
  };
  return [
    '## Claude Code driver',
    '',
    `Columns: baseline is ${labels.baselineClaude} at the pin; candidate is ${labels.claudeOff} (switch off). The decisive numbers below come from ${comparison}.`,
    '',
    '| Measure | Baseline | Candidate |',
    '|---------|----------|-----------|',
    `| Counted runs (infra errors) | ${base.counted} (${base.infraErrors}) | ${cand.counted} (${cand.infraErrors}) |`,
    `| Completion | ${base.completed}/${base.counted} = ${fmtPct(base.rate)} | ${cand.completed}/${cand.counted} = ${fmtPct(cand.rate)} |`,
    `| Wilson 95% CI | ${fmtCiPct(base.wilson)} | ${fmtCiPct(cand.wilson)} |`,
    `| Wall time per completed task | ${fmtMs(base.wallPerCompletedMs)} | ${fmtMs(cand.wallPerCompletedMs)} |`,
    '',
    `- Completion difference, candidate minus baseline (Newcombe 95% CI): ${fmtPoints(completion.diff)} points (${fmtCiPoints(completion.ci)})`,
    `- Whole-task time, candidate over baseline (wallMs ratio): ${fmtPct(speed.estimate)} (95% CI ${fmtCiPct(speed.ci)}); non-inferiority bound ${fmtPct(speed.thresholds && speed.thresholds.ciUpperAtMost)}; faster: ${path.faster === true ? 'yes' : 'no'}`,
    `- LLM cost per completed task (user-borne, Claude Code's reported cost): baseline ${fmtUsd(base.llmCostPerCompleted)}, candidate ${fmtUsd(cand.llmCostPerCompleted)}`,
    `- Safety: baseline ${safety.baseline.events} events in ${plural(safety.baseline.runs, 'run')} (rate ${fmtNum(safety.baseline.rate, 3)}, unverifiable ${safety.baseline.unverifiableRuns}); candidate ${safety.candidate.events} events in ${plural(safety.candidate.runs, 'run')} (rate ${fmtNum(safety.candidate.rate, 3)}, unverifiable ${safety.candidate.unverifiableRuns})`,
    `- Reported identity (part of the treatment, never compared): baseline ${reported('baseline')}; candidate ${reported('claude')}`,
    '',
  ];
}

function renderCategories(result) {
  const { categories } = result;
  const lines = ['## Per category (descriptive)', '', 'Context only: every gate criterion uses the combined 12-task core set.', '',
    '| Category | Jev, fast over control | Non-Jev, candidate over baseline |', '|----------|------------------------|-----------------------------------|'];
  for (const [category, entry] of Object.entries(categories.byCategory)) {
    lines.push(`| ${cell(category)} | ${fmtPct(entry.jev.estimate)} (95% CI ${fmtCiPct(entry.jev.ci)}) | ${fmtPct(entry.nonJev.estimate)} (95% CI ${fmtCiPct(entry.nonJev.ci)}) |`);
  }
  lines.push('');
  const target = (name, entry) => `- ${name} (${entry.path}, ${entry.category}): target ${entry.speedup[0]}x to ${entry.speedup[1]}x, so a ratio of at most ${fmtPct(entry.ratioAtMost)}; ${entry.status}`;
  lines.push(target('autopilotMixed', categories.targets.autopilotMixed));
  for (const entry of categories.targets.mcpClickHeavy) lines.push(target('mcpClickHeavy', entry));
  lines.push(`- mcpUatStyle: target ${categories.targets.mcpUatStyle.speedup[0]}x to ${categories.targets.mcpUatStyle.speedup[1]}x; ${categories.targets.mcpUatStyle.status}`);
  lines.push(`- How targets are used: ${safeText(categories.use)}.`);
  lines.push('');
  return lines;
}

function renderPerTask(tables) {
  const lines = ['## Per task', ''];
  for (const key of GROUP_KEYS) {
    lines.push(`### ${tables.labels[key]}`, '', '| Task | Runs | Infra | Completed | Completion | Median wall (completed) |', '|------|------|-------|-----------|------------|-------------------------|');
    const rows = tables.perTask[key];
    if (!rows.length) lines.push('| none | 0 | 0 | 0/0 | n/a | n/a |');
    for (const task of rows) {
      lines.push(`| ${cell(safeText(task.taskId))} | ${task.runs} | ${task.infraErrors} | ${task.completed}/${task.counted} | ${fmtPct(task.rate)} | ${fmtMs(task.medianWallMs)} |`);
    }
    lines.push('');
  }
  return lines;
}

function renderFailures(tables, result) {
  const lines = ['## Failure cases', '', 'Counted runs the outcome checker failed, by failing check kind and run id.', ''];
  for (const key of GROUP_KEYS) {
    const entry = tables.failures[key];
    lines.push(`- ${tables.labels[key]}: ${plural(entry.failedRuns, 'failed counted run')}`);
    for (const [kind, ids] of Object.entries(entry.byKind)) lines.push(`  - ${safeText(kind, 40)}: ${fmtList(ids)}`);
  }
  const jev = result.paths['jev-mcp-run-task'].criteria.safety;
  const nonJev = result.paths['mcp-non-jev'].criteria.safety;
  lines.push('', 'Safety events by run id:', '');
  lines.push(`- Jev rule (a): ${fmtList(jev.ruleA.eventRunIds)}`);
  lines.push(`- Jev rule (b), fast: ${fmtList(jev.ruleB.on.eventRunIds)}; control: ${fmtList(jev.ruleB.off.eventRunIds)}`);
  lines.push(`- Non-Jev, baseline: ${fmtList(nonJev.baseline.eventRunIds)}; candidate: ${fmtList(nonJev.candidate.eventRunIds)}`);
  lines.push(`- Unverifiable evidence: Jev ${jev.ruleA.unverifiableRuns + jev.ruleB.on.unverifiableRuns + jev.ruleB.off.unverifiableRuns} runs; non-Jev baseline ${nonJev.baseline.unverifiableRuns}, candidate ${nonJev.candidate.unverifiableRuns}`);
  lines.push('');
  return lines;
}

function renderInfra(tables) {
  const lines = ['## Infra errors, flags and timeouts', '', 'Infra errors are outside every denominator.', ''];
  for (const key of GROUP_KEYS) {
    const entry = tables.infra[key];
    lines.push(`- ${tables.labels[key]}: infra errors ${entry.count} (${fmtCounts(entry.byCode)}${entry.runIds.length ? `; runs ${fmtList(entry.runIds)}` : ''}); flags ${fmtCounts(entry.flags)}; timed out ${entry.timedOut}`);
  }
  lines.push('');
  return lines;
}

function renderExercise(tables) {
  const entry = tables.exercise;
  return [
    '## Fast-mode exercise',
    '',
    `- Status: ${entry.status || 'n/a'}${entry.reasons.length ? ` (${fmtList(entry.reasons)})` : ''}`,
    `- Acted share: ${entry.actedRuns} of ${entry.onCounted} counted fast runs = ${fmtPct(entry.actedShare)} (minimum ${fmtPct(entry.minActedShare)}); unknown exposure never counts toward it`,
    `- Counted fast runs by jev.source: measurement ${entry.bySource.measurement}, summary ${entry.bySource.summary}, no_block ${entry.bySource.no_block}, unknown ${entry.bySource.unknown}`,
    `- ${NO_ATTEMPT_SENTENCE}`,
    `- jev_measurement_missing: ${plural(entry.missingMeasurement, 'run')} (exposure taken from the fast_mode summary, so known)`,
    `- Unknown-exposure runs (jev.source null, treated as acted for rule (a)): ${entry.unknownExposure}`,
    `- Fallbacks by reason: ${fmtCounts(entry.fallbacks)}`,
    `- Calibration of acted runs: ${fmtCounts(entry.calibration)}; uncalibrated acted runs ${entry.uncalibratedActedRuns}`,
    `- Model and instrument pairs (served model / instrument version, runs): ${fmtCounts(entry.pairCounts)}; distinct served models ${fmtList(entry.pairs.servedModels)}; instrument versions ${fmtList(entry.pairs.instrumentVersions)}`,
    `- Condition leaks (control runs with Jev activity): ${entry.leakRuns}${entry.leakRunIds.length ? ` (${fmtList(entry.leakRunIds)})` : ''}`,
    '',
  ];
}

function renderAgreement(tables) {
  const entry = tables.agreement;
  const lines = [
    '## Typed outcome agreement (descriptive, M-70-04)',
    '',
    `Counted fast runs of the autopilot campaign (${entry.onCounted}): the run_task fast_mode outcome against the outcome checker.`,
    '',
    '| Typed outcome | Checker pass | Checker fail |',
    '|---------------|--------------|--------------|',
  ];
  for (const row of entry.table) lines.push(`| ${cell(row.outcome)} | ${row.pass} | ${row.fail} |`);
  lines.push(
    '',
    `- False done (done on a failed run): ${entry.falseDone}. ${FALSE_DONE_SENTENCE}`,
    `- Done runs whose status word is not a success word: ${entry.doneWithoutSuccessWord}`,
    `- False ambiguous (ambiguous on a passing run, F18 watch): ${entry.falseAmbiguous}`,
    `- uncertain_unobserved true: ${entry.uncertainUnobserved}; human_gate: ${fmtCounts(entry.humanGate)}`,
    `- Budget exhaustion: exhausted ${fmtCounts(entry.exhausted)}; latched ${fmtCounts(entry.latched)}`,
    `- Fast runs with no fast_mode block (F17 watch): ${entry.noBlock}`,
    `- Runs over ${LONG_RUN_MS.toLocaleString('en-US')} ms wall time: ${GROUP_KEYS.map((key) => `${tables.labels[key]} ${entry.longRuns[key].over} of ${entry.longRuns[key].counted}`).join('; ')}`,
    '',
  );
  return lines;
}

function renderCallerEffect(tables) {
  const entry = tables.callerEffect;
  const lines = [
    '## MCP caller effect (descriptive, 69 V4 rows)',
    '',
    `Median Claude Code host turns and median FSB tool calls per completed run, pin against candidate. ${CALLER_EFFECT_SENTENCE}`,
    '',
    '| Task | Pin completed | Pin turns | Pin FSB calls | Candidate completed | Candidate turns | Candidate FSB calls |',
    '|------|---------------|-----------|---------------|---------------------|-----------------|---------------------|',
  ];
  const row = (name, pin, cand) => `| ${cell(name)} | ${pin.completedRuns} | ${fmtNum(pin.turnsMedian)} | ${fmtNum(pin.callsMedian)} | ${cand.completedRuns} | ${fmtNum(cand.turnsMedian)} | ${fmtNum(cand.callsMedian)} |`;
  for (const task of entry.perTask) lines.push(row(safeText(task.taskId), task.pin, task.candidate));
  lines.push(row('pooled', entry.pooled.pin, entry.pooled.candidate), '');
  return lines;
}

function renderSentinel(result) {
  const sentinel = result.sentinel;
  return [
    '## Sentinel',
    '',
    `- Status: ${sentinel.status}${sentinel.reasons.length ? ` (${fmtList(sentinel.reasons)})` : ''}`,
    `- Completion, control minus baseline: ${fmtPoints(sentinel.completion.diff)} points (95% CI ${fmtCiPoints(sentinel.completion.ci)}); equivalence margin ${fmtNum(finite(sentinel.completionMargin) === null ? null : sentinel.completionMargin * 100)} points either way`,
    `- Whole-task time, control over baseline: ${fmtPct(sentinel.speed.estimate)} (95% CI ${fmtCiPct(sentinel.speed.ci)}); band ${fmtPct(sentinel.speedBand[0])} to ${fmtPct(sentinel.speedBand[1])}`,
    `- Blocker: ${sentinel.blocker ? safeText(sentinel.blocker) : 'none'}`,
    '- A sentinel trip leaves the within-campaign Jev verdict unaffected; it makes the non-Jev verdict inconclusive.',
    '',
  ];
}

function renderSensitivity(result) {
  const { sensitivity } = result;
  const family = (entry) => `wallMs ratio ${fmtPct(entry.speed.estimate)} (CI ${fmtCiPct(entry.speed.ci)}); completion ${fmtPoints(entry.completion.diff)} points (CI ${fmtCiPoints(entry.completion.ci)})`;
  return [
    '## Sensitivity (non-decisive)',
    '',
    `${safeText(sensitivity.label)}: level ${sensitivity.level}, z ${fmtNum(sensitivity.z, 3)}.`,
    '',
    `- Jev, fast over control: ${family(sensitivity.jev)}`,
    `- Non-Jev, candidate over baseline: ${family(sensitivity.nonJev)}`,
    '',
  ];
}

function renderDiagnostics(tables) {
  const entry = tables.diagnostics;
  const acted = entry.perProtocol.acted;
  const off = entry.perProtocol.off;
  const labels = (counts) => fmtCounts(counts);
  return [
    DIAGNOSTICS_HEADING,
    '',
    'Nothing in this section is whole-task speed or enters a verdict or a release claim.',
    '',
    `- jevMs per counted fast run (median of the run's total Jev time): ${fmtMs(entry.jevMsMedianPerRun)}`,
    `- ms per Jev call (fast runs, jevMs total over Jev calls; ${plural(entry.timedRuns, 'run')}): ${fmtNum(entry.jevMsPerCall)} ms`,
    '- Per-decision latency (latencyMs) stays in the gitignored raw records; committed rows carry only jevMs per run.',
    `- meta_cognitive_loop_break stops (M-68-05 watch): control ${entry.metaLoopBreaks.off}, fast ${entry.metaLoopBreaks.on}`,
    `- End labels: control ${labels(entry.endLabels.off)}; fast ${labels(entry.endLabels.on)}`,
    `- Per-protocol view (acted fast runs only, never decisive): completion ${acted.completed}/${acted.counted} = ${fmtPct(acted.rate)} and wall time per completed task ${fmtMs(acted.wallPerCompletedMs)}, against control ${off.completed}/${off.counted} = ${fmtPct(off.rate)} and ${fmtMs(off.wallPerCompletedMs)}`,
    '',
  ];
}

function renderMethod() {
  return ['## Method', '', ...GATE_METHOD_NOTES.map((note) => `- ${note}`), ''];
}

/**
 * The gate report markdown for one evaluation: the verdicts and claims of
 * `decision` (buildDecision) and the tables of buildTables(input, result).
 */
export function renderGateReport(input, result, decision) {
  const tables = buildTables(input, result);
  const lines = [
    ...renderHeader(decision),
    ...renderVerdicts(decision),
    ...renderClaims(decision),
    ...renderAutopilot(tables, result),
    ...renderClaude(tables, result),
    ...renderCategories(result),
    ...renderPerTask(tables),
    ...renderFailures(tables, result),
    ...renderInfra(tables),
    ...renderExercise(tables),
    ...renderAgreement(tables),
    ...renderCallerEffect(tables),
    ...renderSentinel(result),
    ...renderSensitivity(result),
    ...renderDiagnostics(tables),
    ...renderMethod(),
  ];
  return lines.join('\n').replace(/:\/\//g, ': //');
}
