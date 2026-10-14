#!/usr/bin/env node
/**
 * Phase 66 benchmark report (MEAS-03; D-06, D-12, D-15, D-16, D-17, D-21,
 * W4, W6, I-C).
 *
 * Turns a campaign directory (identity.json plus runs.jsonl) into
 * summary.json and report.md. Every row is checked with
 * validateCommittedRow first; one invalid row fails the report.
 *
 * Per set (core, and live reported separately) and per arm it gives:
 * completion with a Wilson 95% CI, where infra errors leave the denominator
 * and are listed by code; per-task median and p90 wall time over completed
 * runs; wall time per completed task as the geometric mean of the per-task
 * medians; labelled cost per completed task; FSB per-call timing (caller gap
 * labelled an upper bound, the call interval as receive-to-receive time);
 * host metrics from the driver's own stream; and the A/A noise floor from
 * stats.mjs (odd against even rounds of one arm).
 *
 * Statistics come from scripts/bench/lib/stats.mjs only. The arms are not
 * compared with each other here: Phase 71 compares each arm with its own
 * fast-mode run. A campaign under 10 rounds is labelled a smoke test, not a
 * baseline. Nothing in either output carries a URL, page text or a value
 * that is not a number, an id, a version or a fixed label.
 *
 * CLI: node scripts/bench/report.mjs <campaignDir>
 *   exit 0 written, 1 invalid rows or unreadable input, 2 usage.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { COST_LABEL_LIST_PRICE } from './lib/host-stream.mjs';
import { INFRA_CODES, validateCommittedRow } from './lib/runs.mjs';
import { aaNoiseFloor, median, quantile, summarize, wilson } from './lib/stats.mjs';

export const REPORT_SCHEMA_VERSION = 1;
export const BASELINE_MIN_ROUNDS = 10;
export const KIND_BASELINE = 'baseline';
export const KIND_SMOKE = 'smoke (not a baseline)';
export const CALLER_GAP_LABEL = 'upper bound on host thinking time';
export const CALL_INTERVAL_LABEL = 'receive-to-receive call interval';
export const WALL_LABEL = "geometric mean of per-task median wall time over completed runs (runner's clock)";
export const COST_NOTE = 'cost of every counted run (passes and task failures) divided by completed runs; infra-error runs excluded';
const AA_TWO_ROUNDS = 'needs at least 2 rounds';
const AA_NO_TASKS = 'no task has completed runs in both odd and even rounds';
const ARM_ORDER = Object.freeze(['autopilot', 'claude', 'cursor']);
const SETS = Object.freeze(['core', 'live']);

export const METHOD_NOTES = Object.freeze([
  "Wall time is measured on the runner's own clock: t0 immediately before run_task or before the host CLI is spawned, t1 when run_task settles or at the host's result event. Session endTime is never used.",
  'A run passes only on independent evidence: the fixture server request log and a post-window read of the final URL and DOM markers (core), or of the page URL and text (live). Agent claims (run_task status, complete_task, a host result) are recorded as claimed and never counted.',
  'Infra errors (for example a host usage cap or a failed model provider) are not task failures: they are excluded from every denominator and listed by code, and total attempts show how often runs were retried.',
  'FSB time per call is measured in the extension. The caller gap (receive of call n minus completion of call n-1) is an upper bound on host thinking time. MCP queue wait is not measured.',
  `Claude Code's reported cost is labelled "${COST_LABEL_LIST_PRICE}" when it is priced at list rates (no API key); Cursor reports no tokens or cost. Autopilot cost is the provider-reported figure where available and a labelled price-table estimate otherwise.`,
  'The arms are not compared with each other. Phase 71 compares each arm with its own fast-mode run, using the geometric mean of per-task median ratios with a hierarchical bootstrap CI.',
  'The A/A noise floor splits one arm\'s completed runs into odd and even rounds and runs the same bootstrap; its CI width is the smallest effect a later comparison can claim.',
  `A campaign under ${BASELINE_MIN_ROUNDS} rounds is a smoke test, not a baseline. Live-site tasks are reported separately and never enter the core aggregates.`,
]);

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

function countBy(values) {
  const counts = {};
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort(codeUnitCompare).map((key) => [key, counts[key]]));
}

function medianOrNull(values) {
  const list = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return list.length ? median(list) : null;
}

function safeText(value, max = 160) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return clean && !clean.includes('://') ? clean : null;
}

// --- Loading ------------------------------------------------------------------------

/**
 * Reads <dir>/identity.json (null when absent) and <dir>/runs.jsonl,
 * validating every row. Throws when any row is invalid or a runId repeats;
 * the message names line numbers and rule codes, never row values.
 */
export function loadCampaign(dir) {
  let identity = null;
  const identityPath = path.join(dir, 'identity.json');
  if (fs.existsSync(identityPath)) {
    identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  }
  const text = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8');
  const runs = [];
  const invalid = [];
  const seen = new Set();
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      invalid.push({ line: index + 1, errors: ['not_json'] });
      return;
    }
    const check = validateCommittedRow(row);
    if (!check.ok) {
      invalid.push({ line: index + 1, errors: check.errors });
      return;
    }
    if (seen.has(row.runId)) {
      invalid.push({ line: index + 1, errors: ['duplicate_run_id'] });
      return;
    }
    seen.add(row.runId);
    runs.push(row);
  });
  if (invalid.length) {
    const detail = invalid.slice(0, 10).map((item) => `line ${item.line}: ${item.errors.slice(0, 6).join(', ')}`).join('; ');
    const error = new Error(`${invalid.length} invalid row(s) in runs.jsonl: ${detail}`);
    error.invalidRows = invalid;
    throw error;
  }
  return { identity, runs };
}

// --- Summary --------------------------------------------------------------------------

function aaFloorFor(completed, taskIds, { iterations, seed }) {
  const rounds = new Set(completed.map((row) => row.round));
  if (rounds.size < 2) return { status: 'n/a', reason: AA_TWO_ROUNDS };
  const tasks = taskIds.map((id) => ({
    id,
    runs: completed.filter((row) => row.taskId === id && finite(row.wallMs) !== null).map((row) => ({ round: row.round, wallMs: row.wallMs })),
  }));
  const result = aaNoiseFloor(tasks, { iterations, seed });
  if (!result.usedTasks.length || finite(result.estimate) === null
    || finite(result.ci[0]) === null || finite(result.ci[1]) === null) {
    return { status: 'n/a', reason: AA_NO_TASKS, droppedTasks: result.droppedTasks };
  }
  return {
    status: 'ok',
    estimate: result.estimate,
    ci: result.ci,
    ciWidth: result.ci[1] - result.ci[0],
    verdict: result.verdict,
    usedTasks: result.usedTasks,
    droppedTasks: result.droppedTasks,
    iterations: result.iterations,
    seed: result.seed,
    label: result.label,
  };
}

function costFor(counted, completedCount) {
  const withCost = counted.filter((row) => finite(row.cost.usd) !== null);
  const total = withCost.reduce((sum, row) => sum + row.cost.usd, 0);
  const labels = countBy(counted.map((row) => row.cost.label));
  const labelNames = Object.keys(labels);
  let label = 'unavailable';
  if (labelNames.length === 1) label = labelNames[0];
  else if (labelNames.length > 1) label = `mixed: ${labelNames.join('; ')}`;
  return {
    usd: completedCount > 0 && withCost.length > 0 ? total / completedCount : null,
    totalUsd: withCost.length ? total : null,
    runsWithCost: withCost.length,
    runsWithoutCost: counted.length - withCost.length,
    completedRunMedianUsd: medianOrNull(counted.filter((row) => row.pass).map((row) => row.cost.usd)),
    sources: countBy(counted.map((row) => row.cost.source)),
    labels,
    label,
    note: COST_NOTE,
  };
}

function fsbFor(counted) {
  const mcp = counted.filter((row) => row.fsb.kind === 'mcp');
  const autopilot = counted.filter((row) => row.fsb.kind === 'autopilot');
  return {
    sessionsMeasured: mcp.length + autopilot.length,
    callsMedian: medianOrNull(counted.map((row) => row.fsb.calls)),
    fsbMsMedianPerCall: medianOrNull(mcp.map((row) => row.fsb.fsbMsMedian)),
    fsbMsTotalMedian: medianOrNull(mcp.map((row) => row.fsb.fsbMsTotal)),
    callerGapMsMedianPerCall: medianOrNull(mcp.map((row) => row.fsb.callerGapMsMedian)),
    callerGapLabel: CALLER_GAP_LABEL,
    callIntervalMsMedian: medianOrNull(mcp.map((row) => row.fsb.callIntervalMs.median)),
    callIntervalLabel: CALL_INTERVAL_LABEL,
    iterationsMedian: medianOrNull(autopilot.map((row) => row.fsb.iterations)),
    modelMsTotalMedian: medianOrNull(autopilot.map((row) => row.fsb.modelMsTotal)),
    toolMsTotalMedian: medianOrNull(autopilot.map((row) => row.fsb.toolMsTotal)),
    queueWait: 'not measured',
    idleTimeoutSessions: counted.filter((row) => row.fsb.idleTimeout === true).length,
  };
}

function hostFor(counted) {
  const hosted = counted.filter((row) => row.host.name !== null);
  if (!hosted.length) return null;
  const shares = hosted
    .filter((row) => finite(row.host.durationMs) !== null && row.host.durationMs > 0 && finite(row.host.durationApiMs) !== null)
    .map((row) => row.host.durationApiMs / row.host.durationMs);
  const labels = countBy(hosted.map((row) => row.host.costLabel));
  const labelNames = Object.keys(labels);
  return {
    name: hosted[0].host.name,
    models: countBy(hosted.map((row) => row.host.model)),
    toolLoading: countBy(hosted.map((row) => row.host.toolLoading)),
    durationMsMedian: medianOrNull(hosted.map((row) => row.host.durationMs)),
    durationApiShareMedian: medianOrNull(shares),
    numTurnsMedian: medianOrNull(hosted.map((row) => row.host.numTurns)),
    inputTokensMedian: medianOrNull(hosted.map((row) => row.host.inputTokens)),
    outputTokensMedian: medianOrNull(hosted.map((row) => row.host.outputTokens)),
    cacheReadTokensMedian: medianOrNull(hosted.map((row) => row.host.cacheReadTokens)),
    costUsdMedian: medianOrNull(hosted.map((row) => row.host.costUsd)),
    costLabel: labelNames.length === 1 ? labelNames[0] : (labelNames.length ? `mixed: ${labelNames.join('; ')}` : null),
  };
}

function summarizeArm(rows, options) {
  const infra = rows.filter((row) => row.infraError !== null);
  const counted = rows.filter((row) => row.infraError === null);
  const completed = counted.filter((row) => row.pass);
  const denominator = counted.length;
  const taskIds = [...new Set(rows.map((row) => row.taskId))].sort(codeUnitCompare);
  const perTask = taskIds.map((taskId) => {
    const taskRows = rows.filter((row) => row.taskId === taskId);
    const taskCounted = taskRows.filter((row) => row.infraError === null);
    const taskCompleted = taskCounted.filter((row) => row.pass);
    const walls = summarize(taskCompleted.map((row) => row.wallMs).filter((value) => finite(value) !== null));
    return {
      taskId,
      runs: taskRows.length,
      infraErrors: taskRows.length - taskCounted.length,
      counted: taskCounted.length,
      completed: taskCompleted.length,
      completionRate: taskCounted.length ? taskCompleted.length / taskCounted.length : null,
      timedOut: taskCounted.filter((row) => row.timedOut).length,
      wallMs: { n: walls.n, median: walls.median, p90: walls.p90 },
    };
  });
  const used = perTask.filter((task) => finite(task.wallMs.median) !== null && task.wallMs.median > 0);
  const geoMean = used.length
    ? Math.exp(used.reduce((sum, task) => sum + Math.log(task.wallMs.median), 0) / used.length)
    : null;
  return {
    runs: rows.length,
    attempts: rows.reduce((sum, row) => sum + row.attempts, 0),
    infraErrors: {
      count: infra.length,
      byCode: countBy(infra.map((row) => row.infraError)),
      runIds: infra.map((row) => row.runId).sort(codeUnitCompare),
    },
    denominator,
    completed: completed.length,
    completionRate: denominator ? completed.length / denominator : null,
    completionCi95: denominator ? wilson(completed.length, denominator) : null,
    timedOut: counted.filter((row) => row.timedOut).length,
    perTask,
    wallPerCompletedTask: {
      geoMeanOfTaskMediansMs: geoMean,
      tasksUsed: used.map((task) => task.taskId),
      tasksWithoutCompletedRuns: perTask.filter((task) => !used.includes(task)).map((task) => task.taskId),
      medianCompletedRunMs: medianOrNull(completed.map((row) => row.wallMs)),
      p90CompletedRunMs: completed.length ? quantile(completed.map((row) => row.wallMs).filter((v) => finite(v) !== null), 0.9) : null,
      label: WALL_LABEL,
    },
    costPerCompletedTask: costFor(counted, completed.length),
    aaNoiseFloor: aaFloorFor(completed, taskIds, options),
    fsb: fsbFor(counted),
    host: hostFor(counted),
    flags: countBy(rows.flatMap((row) => row.flags)),
  };
}

function identitySummary(identity) {
  if (!isPlainObject(identity)) return null;
  const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, isPlainObject(object) ? object[key] ?? null : null]));
  const extension = isPlainObject(identity.extension) ? identity.extension : {};
  const mcp = isPlainObject(identity.mcp) ? identity.mcp : {};
  const claude = isPlainObject(identity.hosts) && isPlainObject(identity.hosts.claude) ? identity.hosts.claude : null;
  const cursor = isPlainObject(identity.hosts) && isPlainObject(identity.hosts.cursor) ? identity.hosts.cursor : null;
  const chrome = isPlainObject(identity.chrome) ? identity.chrome : {};
  return {
    campaignId: safeText(identity.campaignId),
    mode: safeText(identity.mode),
    set: safeText(identity.set),
    createdAt: safeText(identity.createdAt),
    schedule: isPlainObject(identity.schedule) ? pick(identity.schedule, ['runs', 'rounds', 'arms', 'seed']) : null,
    git: pick(identity.git, ['sha', 'dirty']),
    extension: {
      id: safeText(extension.id),
      version: safeText(extension.version),
      measurement: isPlainObject(extension.measurement) ? pick(extension.measurement, ['callTiming', 'sessionDetailJournal']) : null,
      telemetryOptOut: extension.telemetryOptOut === true,
    },
    mcp: {
      serverName: safeText(mcp.serverName),
      serverVersion: safeText(mcp.serverVersion),
      sdkVersion: safeText(mcp.sdkVersion),
      toolsList: isPlainObject(mcp.toolsList) ? pick(mcp.toolsList, ['count', 'sha256']) : null,
    },
    provider: pick(identity.provider, ['kind', 'name', 'requestedModel', 'pinnedModel']),
    hosts: {
      claude: claude ? {
        version: safeText(claude.version),
        model: safeText(claude.model),
        toolSearchEnv: safeText(claude.toolSearchEnv),
        toolLoadingObserved: Array.isArray(claude.toolLoadingObserved) ? claude.toolLoadingObserved.map((mode) => safeText(mode)).filter(Boolean) : [],
        envKeyNamesSha256: safeText(claude.envKeyNamesSha256),
      } : null,
      cursor: cursor ? { version: safeText(cursor.version), model: safeText(cursor.model), experimental: true } : null,
    },
    chrome: {
      browser: safeText(chrome.browser),
      launchFlags: Array.isArray(chrome.launchFlags) ? chrome.launchFlags.map((flag) => safeText(flag)).filter(Boolean) : null,
    },
    taskCount: Array.isArray(identity.tasks) ? identity.tasks.length : null,
    resumes: Array.isArray(identity.resumes) ? identity.resumes.length : 0,
  };
}

/**
 * The campaign summary (summary.json). options: { iterations = 10000,
 * seed = 66 } for the A/A bootstrap.
 */
export function buildSummary({ identity = null, runs = [] } = {}, { iterations = 10000, seed = 66 } = {}) {
  const rows = (Array.isArray(runs) ? runs : []).filter(isPlainObject);
  const rounds = rows.reduce((max, row) => (Number.isInteger(row.round) && row.round > max ? row.round : max), 0);
  const sets = {};
  for (const set of SETS) {
    const setRows = rows.filter((row) => row.set === set);
    if (!setRows.length) {
      sets[set] = null;
      continue;
    }
    const arms = {};
    for (const arm of ARM_ORDER) {
      const armRows = setRows.filter((row) => row.arm === arm);
      if (armRows.length) arms[arm] = summarizeArm(armRows, { iterations, seed });
    }
    sets[set] = { runs: setRows.length, arms };
  }
  const infra = rows.filter((row) => row.infraError !== null);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    campaignId: (isPlainObject(identity) && safeText(identity.campaignId)) || (rows[0] ? rows[0].campaignId : null),
    kind: rounds >= BASELINE_MIN_ROUNDS ? KIND_BASELINE : KIND_SMOKE,
    rounds,
    scheduledRounds: isPlainObject(identity) && isPlainObject(identity.schedule) && Number.isInteger(identity.schedule.rounds)
      ? identity.schedule.rounds
      : null,
    rows: rows.length,
    attempts: rows.reduce((sum, row) => sum + (Number.isInteger(row.attempts) ? row.attempts : 1), 0),
    infraErrors: {
      total: infra.length,
      byCode: countBy(infra.map((row) => row.infraError)),
      vocabulary: [...INFRA_CODES],
    },
    identity: identitySummary(identity),
    sets,
    method: [...METHOD_NOTES],
  };
}

// --- Markdown -------------------------------------------------------------------------

function fmtMs(value) {
  return finite(value) === null ? 'n/a' : `${Math.round(value).toLocaleString('en-US')} ms`;
}

function fmtPct(value) {
  return finite(value) === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function fmtUsd(value) {
  return finite(value) === null ? 'n/a' : `$${value.toFixed(4)}`;
}

function fmtNum(value, digits = 2) {
  return finite(value) === null ? 'n/a' : value.toFixed(digits);
}

function fmtCounts(counts) {
  const entries = Object.entries(counts || {});
  return entries.length ? entries.map(([key, count]) => `${key}: ${count}`).join(', ') : 'none';
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function cell(value) {
  return String(value).replace(/\|/g, '/');
}

function renderIdentity(identity) {
  if (!identity) return ['identity.json was not found for this campaign.'];
  const lines = [];
  const git = identity.git || {};
  lines.push(`- Git: ${git.sha || 'unknown'} (tracked changes: ${git.dirty === true ? 'yes' : git.dirty === false ? 'no' : 'unknown'})`);
  const ext = identity.extension || {};
  const marker = ext.measurement || {};
  lines.push(`- Extension: ${ext.id || 'unknown'} version ${ext.version || 'unknown'}; Phase 66 marker callTiming ${marker.callTiming ?? 'n/a'}, sessionDetailJournal ${marker.sessionDetailJournal ?? 'n/a'}; telemetry opted out: ${ext.telemetryOptOut ? 'yes' : 'no'}`);
  const mcp = identity.mcp || {};
  const tools = mcp.toolsList || {};
  lines.push(`- MCP server: ${mcp.serverName || 'unknown'} ${mcp.serverVersion || ''} (SDK ${mcp.sdkVersion || 'unknown'}); tools/list ${tools.count ?? 'n/a'} tools, sha256 ${tools.sha256 || 'n/a'}`.replace(/ {2,}/g, ' '));
  const provider = identity.provider || {};
  lines.push(`- Autopilot provider: kind ${provider.kind || 'n/a'}, ${provider.name || 'n/a'}, requested model ${provider.requestedModel || 'n/a'} (pinned ${provider.pinnedModel || 'n/a'})`);
  const claude = identity.hosts && identity.hosts.claude;
  if (claude) {
    lines.push(`- Claude Code: ${claude.version || 'version unknown'}, model ${claude.model || 'n/a'}, ENABLE_TOOL_SEARCH ${claude.toolSearchEnv || 'unset'}, tool loading observed ${claude.toolLoadingObserved.length ? claude.toolLoadingObserved.join(', ') : 'n/a'}, env key names sha256 ${claude.envKeyNamesSha256 || 'n/a'}`);
  }
  const cursor = identity.hosts && identity.hosts.cursor;
  if (cursor) lines.push(`- Cursor (experimental): ${cursor.version || 'version unknown'}, model ${cursor.model || 'n/a'}`);
  const chrome = identity.chrome || {};
  lines.push(`- Bench Chrome: ${chrome.browser || 'unknown'}; launch flags ${chrome.launchFlags && chrome.launchFlags.length ? chrome.launchFlags.join(' ') : 'not recorded'}`);
  const schedule = identity.schedule || {};
  lines.push(`- Schedule: ${schedule.rounds ?? 'n/a'} rounds, arms ${Array.isArray(schedule.arms) ? schedule.arms.join(', ') : 'n/a'}, seed ${schedule.seed ?? 'n/a'}, ${identity.taskCount ?? 'n/a'} tasks${identity.resumes ? `, resumed ${identity.resumes} time(s)` : ''}`);
  return lines;
}

function renderArmCompletion(arm, stats) {
  const ci = stats.completionCi95;
  const lines = [
    `### ${arm}`,
    '',
    `- Runs: ${stats.runs} (attempts ${stats.attempts}); infra errors ${stats.infraErrors.count} (${fmtCounts(stats.infraErrors.byCode)}), excluded from the denominator`,
    `- Completion: ${stats.completed}/${stats.denominator} = ${fmtPct(stats.completionRate)} (Wilson 95% CI ${ci ? `${fmtPct(ci[0])} to ${fmtPct(ci[1])}` : 'n/a'}); timed out ${stats.timedOut}`,
    `- Wall time per completed task: ${fmtMs(stats.wallPerCompletedTask.geoMeanOfTaskMediansMs)}, the geometric mean of per-task median wall times over completed runs on the runner's clock (${plural(stats.wallPerCompletedTask.tasksUsed.length, 'task')}${stats.wallPerCompletedTask.tasksWithoutCompletedRuns.length ? `; no completed run: ${stats.wallPerCompletedTask.tasksWithoutCompletedRuns.join(', ')}` : ''})`,
    '',
    '| Task | Runs | Infra | Completed | Completion | Median wall | p90 wall |',
    '|------|------|-------|-----------|------------|-------------|----------|',
  ];
  for (const task of stats.perTask) {
    lines.push(`| ${cell(task.taskId)} | ${task.runs} | ${task.infraErrors} | ${task.completed}/${task.counted} | ${fmtPct(task.completionRate)} | ${fmtMs(task.wallMs.median)} | ${fmtMs(task.wallMs.p90)} |`);
  }
  if (Object.keys(stats.flags).length) lines.push('', `Flags: ${fmtCounts(stats.flags)}`);
  lines.push('');
  return lines;
}

function renderSetCompletion(set) {
  if (!set) return null;
  const lines = [];
  for (const [arm, stats] of Object.entries(set.arms)) lines.push(...renderArmCompletion(arm, stats));
  return lines;
}

function renderAa(summary) {
  const lines = [];
  for (const setName of SETS) {
    const set = summary.sets[setName];
    if (!set) continue;
    for (const [arm, stats] of Object.entries(set.arms)) {
      const floor = stats.aaNoiseFloor;
      if (floor.status !== 'ok') {
        lines.push(`- ${setName} / ${arm}: n/a (${floor.reason})`);
      } else {
        lines.push(`- ${setName} / ${arm}: odd/even ratio ${fmtNum(floor.estimate, 3)}, 95% CI ${fmtNum(floor.ci[0], 3)} to ${fmtNum(floor.ci[1], 3)} (${floor.verdict}); CI width ${fmtNum(floor.ciWidth, 3)} is the smallest effect a later comparison can claim; ${plural(floor.usedTasks.length, 'task')}${floor.droppedTasks.length ? `, dropped ${floor.droppedTasks.join(', ')}` : ''}`);
      }
    }
  }
  return lines.length ? lines : ['- n/a (no runs)'];
}

function renderCosts(summary) {
  const lines = [];
  for (const setName of SETS) {
    const set = summary.sets[setName];
    if (!set) continue;
    for (const [arm, stats] of Object.entries(set.arms)) {
      const cost = stats.costPerCompletedTask;
      lines.push(`- ${setName} / ${arm}: ${fmtUsd(cost.usd)} per completed task (label: ${cost.label}; sources ${fmtCounts(cost.sources)}; ${cost.runsWithCost} runs with a cost, ${cost.runsWithoutCost} without; median completed run ${fmtUsd(cost.completedRunMedianUsd)})`);
    }
  }
  lines.push('', `Cost per completed task is the ${COST_NOTE}.`);
  return lines;
}

function renderHost(summary) {
  const lines = [];
  for (const setName of SETS) {
    const set = summary.sets[setName];
    if (!set) continue;
    for (const [arm, stats] of Object.entries(set.arms)) {
      const fsb = stats.fsb;
      if (fsb.fsbMsMedianPerCall !== null || fsb.callIntervalMsMedian !== null) {
        lines.push(`- ${setName} / ${arm} FSB: ${fmtNum(fsb.callsMedian, 0)} calls per run (median); FSB time per call ${fmtMs(fsb.fsbMsMedianPerCall)}; caller gap per call ${fmtMs(fsb.callerGapMsMedianPerCall)} (${fsb.callerGapLabel}); call interval ${fmtMs(fsb.callIntervalMsMedian)} (${fsb.callIntervalLabel}); queue wait ${fsb.queueWait}; idle-timeout sessions ${fsb.idleTimeoutSessions}`);
      }
      if (fsb.iterationsMedian !== null) {
        lines.push(`- ${setName} / ${arm} loop: ${fmtNum(fsb.iterationsMedian, 0)} iterations per run (median); model time ${fmtMs(fsb.modelMsTotalMedian)} and tool time ${fmtMs(fsb.toolMsTotalMedian)} per run (median)`);
      }
      const host = stats.host;
      if (host) {
        lines.push(`- ${setName} / ${arm} host (${host.name}): API share of host duration ${fmtPct(host.durationApiShareMedian)} (median of duration_api_ms / duration_ms); ${fmtNum(host.numTurnsMedian, 0)} turns (median); host duration ${fmtMs(host.durationMsMedian)}; tool loading ${fmtCounts(host.toolLoading)}; cost label: ${host.costLabel || 'n/a'}`);
      }
    }
  }
  return lines.length ? lines : ['- n/a (no measured sessions)'];
}

/** report.md for a summary. Contains no URL, NaN, Infinity or null percentage. */
export function renderMarkdown(summary) {
  const lines = [
    `# Benchmark report: ${summary.campaignId || 'unknown campaign'}`,
    '',
    `Kind: ${summary.kind}. Rounds observed: ${summary.rounds}${summary.scheduledRounds !== null ? ` (scheduled ${summary.scheduledRounds})` : ''}. Rows: ${summary.rows}; attempts: ${summary.attempts}; infra errors: ${summary.infraErrors.total} (${fmtCounts(summary.infraErrors.byCode)}).`,
    '',
    '## Identity',
    '',
    ...renderIdentity(summary.identity),
    '',
    '## Core set',
    '',
    ...(renderSetCompletion(summary.sets.core) || ['No core runs in this campaign.', '']),
    '## A/A noise floor',
    '',
    ...renderAa(summary),
    '',
    '## Costs',
    '',
    ...renderCosts(summary),
    '',
    '## Host metrics',
    '',
    ...renderHost(summary),
    '',
    '## Live set (reported separately)',
    '',
    ...(renderSetCompletion(summary.sets.live) || ['No live runs in this campaign. Live tasks never enter the core aggregates.', '']),
    '## Method',
    '',
    ...summary.method.map((note) => `- ${note}`),
    '',
  ];
  return lines.join('\n').replace(/:\/\//g, ': //');
}

/** Writes <dir>/summary.json and <dir>/report.md; returns their paths. */
export function writeReport(summary, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, 'summary.json');
  const mdPath = path.join(dir, 'report.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(summary));
  return { jsonPath, mdPath };
}

// --- CLI ------------------------------------------------------------------------------

const USAGE = 'usage: node scripts/bench/report.mjs <campaignDir>';

function runCli(argv) {
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const dir = path.resolve(argv[0]);
  let campaign;
  try {
    campaign = loadCampaign(dir);
  } catch (error) {
    process.stderr.write(`bench-report: ${error && error.message ? error.message : String(error)}\n`);
    return 1;
  }
  const summary = buildSummary(campaign);
  const { jsonPath, mdPath } = writeReport(summary, dir);
  process.stdout.write(`bench-report: ${summary.kind}, ${summary.rows} rows; wrote ${path.basename(jsonPath)} and ${path.basename(mdPath)} in ${dir}\n`);
  return 0;
}

const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
