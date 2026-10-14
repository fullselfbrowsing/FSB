/**
 * Phase 66 benchmark run contract: the seeded ABBA schedule, committed run
 * rows, infra classification and the bench safety gate (D-16, D-17, D-20,
 * D-21, W4, W6, W-A, W-B, B-TIMEOUT).
 *
 * Pure: no clock, no environment, no filesystem.
 *
 * A committed row (runs.jsonl) has exactly RUN_ROW_KEYS. It holds ids,
 * versions, digests, check kinds with pass/fail, numbers and fixed labels.
 * Every string is at most 200 characters and never contains "://". No
 * request body, page text, claimed summary, model text or error text appears
 * anywhere in a row; raw records (gitignored .local) keep the evidence.
 *
 * Infra errors are not task failures. They leave the completion denominator
 * and are listed apart. The first agent_cap, agent_auth or provider_error
 * pauses a campaign (exit 75); any other code pauses on its second
 * consecutive occurrence. Error texts are classified in memory and never
 * stored. A number counts as a status only after "HTTP" or "status", so
 * "500 ms" or a bare 500 never pauses, and the bare word "provider" never
 * matches.
 *
 * agent-loop.js retries HTTP 429 every 5 s with no cap, so a sustained xAI
 * rate limit never surfaces a status code. It is detected here instead: an
 * autopilot run that timed out while its session detail IS present but
 * measured no provider response (measurement.recorded !== true) is a
 * provider_error. A timeout whose session detail is missing stays an
 * ordinary task failure, flagged session_detail_missing, and never pauses.
 */

import { servedModelMatches } from './identity.mjs';
import { mulberry32 } from './stats.mjs';

export const RUN_ROW_SCHEMA_VERSION = 1;

export const RUN_ROW_KEYS = Object.freeze([
  'schemaVersion', 'campaignId', 'runId', 'attempts', 'set', 'taskId', 'taskVersion', 'category', 'fixtureSha256',
  'arm', 'round', 'order', 'startedAt', 'wallMs', 'wallFromInitMs', 'pass', 'timedOut', 'checks', 'infraError',
  'claimed', 'fsb', 'host', 'cost', 'provider', 'flags',
]);

export const INFRA_CODES = Object.freeze([
  'agent_cap', 'agent_auth', 'provider_error', 'fsb_agent_cap', 'host_api_error', 'claude_no_init',
  'host_no_result', 'extension_not_connected', 'hub_lost', 'spawn_failed', 'mcp_session_not_found_no_calls',
]);

export const PAUSING_INFRA_CODES = Object.freeze(['agent_cap', 'agent_auth', 'provider_error']);

export const RUN_FLAGS = Object.freeze([
  'served_model_mismatch', 'idle_timeout_session', 'session_detail_missing', 'multiple_mcp_sessions',
  'live_task', 'experimental_arm',
]);

export const ARMS = Object.freeze(['autopilot', 'claude', 'cursor']);
export const HOST_ARMS = Object.freeze(['claude', 'cursor']);
export const SESSION_MATCHES = Object.freeze(['unique', 'multiple', 'none']);
export const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const MAX_ROUNDS = 100;

// Autopilot cost labels by the measurement's costSource (D-10).
export const AUTOPILOT_COST_LABELS = Object.freeze({
  provider: 'provider-reported (xAI cost ticks)',
  estimate: 'price-table estimate',
  mixed: 'provider-reported and price-table estimate',
  unavailable: 'unavailable',
});
const NO_MEASUREMENT_COST_LABEL = 'unavailable (no session measurement)';
const HOST_COST_SOURCE = 'host';
const CURSOR_COST_LABEL = 'unavailable (host does not report)';

const MAX_STRING = 200;
const MAX_CHECKS = 20;
const MAX_SERVED_MODELS = 10;
const HEX64 = /^[0-9a-f]{64}$/;
const TASK_ID_PATTERN = /^(?:core|live)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

const PROVIDER_ERROR_PATTERN = /\b(?:HTTP|status)[ :]*(?:429|401|403|5\d\d)\b|API call failed:|API rejected request|API key invalid|rate.?limit|too many requests|quota|overloaded/i;
const FSB_AGENT_CAP_PATTERN = /AGENT_CAP_REACHED/;
const HUB_LOST_PATTERN = /Lost connection to hub|Extension disconnected|Bridge disconnected/;
const EXTENSION_NOT_CONNECTED_PATTERN = /extension_not_connected|Extension WebSocket not connected/i;
const MAX_CLASSIFY_CHARS = 16384;

const NESTED_KEYS = Object.freeze({
  checks: Object.freeze(['kind', 'pass']),
  claimed: Object.freeze(['status', 'partialOutcome', 'isError', 'subtype', 'completeTask']),
  fsb: Object.freeze([
    'kind', 'calls', 'callsWithTiming', 'fsbMsTotal', 'fsbMsMedian', 'callerGapMsTotal', 'callerGapMsMedian',
    'callIntervalMs', 'iterations', 'modelMsTotal', 'toolMsTotal', 'endReason', 'idleTimeout', 'sessionMatch',
  ]),
  callIntervalMs: Object.freeze(['median', 'p90', 'count']),
  host: Object.freeze([
    'name', 'model', 'toolLoading', 'durationMs', 'durationApiMs', 'numTurns', 'inputTokens', 'outputTokens',
    'cacheReadTokens', 'costUsd', 'costLabel',
  ]),
  cost: Object.freeze(['usd', 'source', 'label']),
  provider: Object.freeze(['requestedModel', 'servedModels', 'servedModelMatch']),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// --- Safety gate (W-B) -----------------------------------------------------------

/**
 * Refuses unless the bench extension's fsbTelemetryOptOut is strictly true.
 * The refusal detail is 'false', 'absent' or 'unverifiable' and nothing else.
 */
export function evaluateBenchSafety({ telemetryOptOut } = {}) {
  if (telemetryOptOut === true) return { ok: true, refusals: [] };
  let detail = 'unverifiable';
  if (telemetryOptOut === false) detail = 'false';
  else if (telemetryOptOut === undefined) detail = 'absent';
  return { ok: false, refusals: [{ code: 'telemetry_not_opted_out', detail }] };
}

// --- Schedule (D-16, Pattern 9) ----------------------------------------------------

/**
 * Seeded ABBA schedule. Each round shuffles the task ids (sorted first, so
 * input order does not matter) with mulberry32(seed + round); odd rounds run
 * each task's arms in the given order, even rounds in reverse. Entries are
 * { campaignId, runId, round, order, taskId, arm }, where order is the
 * 1-based position in the whole campaign and runId is
 * <campaignId>-r<round>-<taskId>-<arm>.
 */
export function buildSchedule({ campaignId, taskIds, rounds, arms, seed } = {}) {
  if (typeof campaignId !== 'string' || !CAMPAIGN_ID_PATTERN.test(campaignId)) {
    throw new TypeError('campaignId must be 1..80 characters of letters, digits, ".", "_" or "-"');
  }
  if (!Array.isArray(taskIds) || taskIds.length === 0 || new Set(taskIds).size !== taskIds.length
    || !taskIds.every((id) => typeof id === 'string' && TASK_ID_PATTERN.test(id))) {
    throw new TypeError('taskIds must be a non-empty list of distinct task ids');
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) throw new RangeError(`rounds must be an integer in 1..${MAX_ROUNDS}`);
  if (!Array.isArray(arms) || arms.length === 0 || new Set(arms).size !== arms.length || !arms.every((arm) => ARMS.includes(arm))) {
    throw new TypeError(`arms must be distinct values from ${ARMS.join(', ')}`);
  }
  if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be a safe integer');
  const sorted = [...taskIds].sort(codeUnitCompare);
  const schedule = [];
  let order = 0;
  for (let round = 1; round <= rounds; round += 1) {
    const rnd = mulberry32(seed + round);
    const perm = [...sorted];
    for (let i = perm.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const armOrder = round % 2 === 1 ? arms : [...arms].reverse();
    for (const taskId of perm) {
      for (const arm of armOrder) {
        order += 1;
        schedule.push({ campaignId, runId: `${campaignId}-r${round}-${taskId}-${arm}`, round, order, taskId, arm });
      }
    }
  }
  return schedule;
}

// --- Pause rule (W4) ---------------------------------------------------------------

/**
 * { pause, consecutiveOther } after one run: a pausing code pauses at once,
 * any other infra code pauses on its second consecutive occurrence, and a
 * run without an infra error resets the count.
 */
export function pauseDecision(consecutiveOther, infraError) {
  if (infraError === null || infraError === undefined) return { pause: null, consecutiveOther: 0 };
  if (PAUSING_INFRA_CODES.includes(infraError)) return { pause: infraError, consecutiveOther: 0 };
  const next = (Number.isInteger(consecutiveOther) ? consecutiveOther : 0) + 1;
  return { pause: next >= 2 ? infraError : null, consecutiveOther: next };
}

// --- Infra classification (W4, W-A, B-TIMEOUT) ---------------------------------------

function texts(...values) {
  return values.filter((value) => typeof value === 'string' && value).map((value) => value.slice(0, MAX_CLASSIFY_CHARS));
}

function sessionPresent(sessionDetail) {
  return isPlainObject(sessionDetail) && isPlainObject(sessionDetail.session);
}

function fsbServerStatus(hostSummary) {
  const servers = isPlainObject(hostSummary.init) && Array.isArray(hostSummary.init.mcpServers) ? hostSummary.init.mcpServers : [];
  const fsb = servers.find((server) => isPlainObject(server) && server.name === 'fsb');
  return fsb ? fsb.status : null;
}

function classifyHost({ arm, hostSummary, timedOut, sessionDetail, sessionMatch, startFailed }) {
  if (startFailed === true || !isPlainObject(hostSummary)) return 'spawn_failed';
  const rateLimit = isPlainObject(hostSummary.rateLimit) ? hostSummary.rateLimit : {};
  const errorKind = hostSummary.errorKind;
  if (rateLimit.limited === true || errorKind === 'usage_limit' || errorKind === 'rate_limit') return 'agent_cap';
  if (errorKind === 'auth') return 'agent_auth';
  if (errorKind === 'api_error') return 'host_api_error';
  const initPresent = isPlainObject(hostSummary.init) && hostSummary.init.present === true;
  const resultPresent = isPlainObject(hostSummary.result) && hostSummary.result.present === true;
  if (arm === 'claude' && !initPresent) return 'claude_no_init';
  // No MCP session in the run's window. With no calls, the host never
  // reached FSB; with calls, none of them reached the extension (a session
  // is journaled at the first call it receives), so the run measured nothing.
  const sessionFound = sessionPresent(sessionDetail) || sessionMatch === 'unique' || sessionMatch === 'multiple';
  if (!sessionFound) {
    const calls = arm === 'claude'
      ? (isPlainObject(hostSummary.toolUses) ? hostSummary.toolUses.fsb : null)
      : (isPlainObject(hostSummary.toolCalls) ? hostSummary.toolCalls.started : null);
    if (calls === 0 && (arm !== 'claude' || fsbServerStatus(hostSummary) !== 'connected')) return 'mcp_session_not_found_no_calls';
    if (Number.isInteger(calls) && calls > 0) return 'extension_not_connected';
  }
  // A run that used its whole budget failed the task; only a missing result
  // inside the budget is a host problem.
  if (timedOut === true) return null;
  if (!resultPresent) return 'host_no_result';
  return null;
}

function classifyAutopilot({ taskJson, errorText, sessionErrorText, timedOut, sessionDetail, startFailed }) {
  const json = isPlainObject(taskJson) ? taskJson : {};
  const all = texts(errorText, sessionErrorText, json.error, json.message);
  if (all.some((text) => FSB_AGENT_CAP_PATTERN.test(text))) return 'fsb_agent_cap';
  if (json.sw_evicted === true || all.some((text) => HUB_LOST_PATTERN.test(text))) return 'hub_lost';
  if (all.some((text) => EXTENSION_NOT_CONNECTED_PATTERN.test(text))) return 'extension_not_connected';
  if (all.some((text) => PROVIDER_ERROR_PATTERN.test(text))) return 'provider_error';
  if (startFailed === true) return 'spawn_failed';
  if (timedOut === true && sessionPresent(sessionDetail)) {
    const measurement = sessionDetail.session.measurement;
    if (!(isPlainObject(measurement) && measurement.recorded === true)) return 'provider_error';
  }
  return null;
}

/**
 * The run's INFRA_CODES value, or null for a run that counts (pass or task
 * failure). Input: { arm, hostSummary, taskJson, errorText,
 * sessionErrorText, timedOut, sessionDetail, sessionMatch, startFailed };
 * sessionMatch ('unique' | 'multiple' | 'none') tells a host arm whether an
 * MCP session was found even when its detail could not be read. Texts are
 * read in memory only.
 */
export function classifyInfra(input = {}) {
  const source = isPlainObject(input) ? input : {};
  if (HOST_ARMS.includes(source.arm)) return classifyHost(source);
  if (source.arm === 'autopilot') return classifyAutopilot(source);
  return null;
}

/** ['session_detail_missing'] for an autopilot run without a session object, else []. */
export function sessionDetailFlags({ arm, sessionDetail } = {}) {
  if (arm === 'autopilot' && !sessionPresent(sessionDetail)) return ['session_detail_missing'];
  return [];
}

// --- Committed rows (D-20, D-21) ------------------------------------------------------

function safeString(value, max = MAX_STRING) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return clean && !clean.includes('://') ? clean : null;
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function bool(value) {
  return typeof value === 'boolean' ? value : null;
}

function positiveInt(value, fallback = 1) {
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

function nullInterval() {
  return { median: null, p90: null, count: null };
}

function fsbBlock(measurement, sessionMatch) {
  const match = SESSION_MATCHES.includes(sessionMatch) ? sessionMatch : null;
  const base = {
    kind: null, calls: null, callsWithTiming: null, fsbMsTotal: null, fsbMsMedian: null, callerGapMsTotal: null,
    callerGapMsMedian: null, callIntervalMs: nullInterval(), iterations: null, modelMsTotal: null, toolMsTotal: null,
    endReason: null, idleTimeout: null, sessionMatch: match,
  };
  if (!isPlainObject(measurement)) return base;
  if (measurement.kind === 'mcp') {
    const fsbMs = isPlainObject(measurement.fsbMs) ? measurement.fsbMs : {};
    const gap = isPlainObject(measurement.callerGapMs) ? measurement.callerGapMs : {};
    const interval = isPlainObject(measurement.callIntervalMs) ? measurement.callIntervalMs : {};
    return {
      ...base,
      kind: 'mcp',
      calls: count(measurement.calls),
      callsWithTiming: count(measurement.callsWithTiming),
      fsbMsTotal: num(fsbMs.total),
      fsbMsMedian: num(fsbMs.median),
      callerGapMsTotal: num(gap.total),
      callerGapMsMedian: num(gap.median),
      callIntervalMs: { median: num(interval.median), p90: num(interval.p90), count: count(interval.count) },
      endReason: safeString(measurement.endReason, 64),
      idleTimeout: bool(measurement.idleTimeout),
    };
  }
  if (measurement.kind === 'autopilot') {
    const modelMs = isPlainObject(measurement.modelMs) ? measurement.modelMs : {};
    const toolMs = isPlainObject(measurement.toolMs) ? measurement.toolMs : {};
    return {
      ...base,
      kind: 'autopilot',
      calls: count(toolMs.calls),
      iterations: count(measurement.iterations),
      modelMsTotal: num(modelMs.total),
      toolMsTotal: num(toolMs.total),
    };
  }
  return base;
}

function emptyHost() {
  return {
    name: null, model: null, toolLoading: null, durationMs: null, durationApiMs: null, numTurns: null,
    inputTokens: null, outputTokens: null, cacheReadTokens: null, costUsd: null, costLabel: null,
  };
}

function hostBlock(arm, summary) {
  if (!HOST_ARMS.includes(arm) || !isPlainObject(summary)) return emptyHost();
  const init = isPlainObject(summary.init) ? summary.init : {};
  const result = isPlainObject(summary.result) ? summary.result : {};
  if (arm === 'cursor') {
    return {
      ...emptyHost(),
      name: 'cursor-agent',
      model: safeString(init.model, 80),
      durationMs: num(result.durationMs),
      durationApiMs: num(result.durationApiMs),
      costLabel: safeString(summary.label) || CURSOR_COST_LABEL,
    };
  }
  const usage = isPlainObject(result.usage) ? result.usage : {};
  return {
    name: 'claude-code',
    model: safeString(init.model, 80),
    toolLoading: safeString(init.toolLoading, 40),
    durationMs: num(result.durationMs),
    durationApiMs: num(result.durationApiMs),
    numTurns: count(result.numTurns),
    inputTokens: count(usage.input),
    outputTokens: count(usage.output),
    cacheReadTokens: count(usage.cacheRead),
    costUsd: num(result.totalCostUsd),
    costLabel: safeString(result.costLabel),
  };
}

function costBlock(arm, measurement, summary) {
  if (arm === 'autopilot') {
    if (!isPlainObject(measurement) || measurement.kind !== 'autopilot') {
      return { usd: null, source: 'unavailable', label: NO_MEASUREMENT_COST_LABEL };
    }
    const source = Object.prototype.hasOwnProperty.call(AUTOPILOT_COST_LABELS, measurement.costSource)
      ? measurement.costSource
      : 'unavailable';
    return { usd: num(measurement.costUsd), source, label: AUTOPILOT_COST_LABELS[source] };
  }
  if (arm === 'cursor') return { usd: null, source: HOST_COST_SOURCE, label: CURSOR_COST_LABEL };
  const result = isPlainObject(summary) && isPlainObject(summary.result) ? summary.result : {};
  return { usd: num(result.totalCostUsd), source: HOST_COST_SOURCE, label: safeString(result.costLabel) };
}

function servedModelsOf(measurement) {
  if (!isPlainObject(measurement) || !Array.isArray(measurement.servedModels)) return [];
  return measurement.servedModels.map((model) => safeString(model, 128)).filter(Boolean).slice(0, MAX_SERVED_MODELS);
}

/**
 * True when every model string the provider returned is a grok-4.3 variant,
 * false when any is not, null when the measurement reports none (D-19,
 * Pitfall 11). The runner flags served_model_mismatch on false.
 */
export function servedModelMatch(measurement) {
  const served = servedModelsOf(measurement);
  return served.length ? served.every(servedModelMatches) : null;
}

function providerBlock(arm, measurement) {
  if (arm !== 'autopilot' || !isPlainObject(measurement) || measurement.kind !== 'autopilot') {
    return { requestedModel: null, servedModels: [], servedModelMatch: null };
  }
  return {
    requestedModel: safeString(measurement.requestedModel, 128),
    servedModels: servedModelsOf(measurement),
    servedModelMatch: servedModelMatch(measurement),
  };
}

function claimedBlock(claimed) {
  const source = isPlainObject(claimed) ? claimed : {};
  return {
    status: safeString(source.status, 40),
    partialOutcome: safeString(source.partialOutcome, 40),
    isError: bool(source.isError),
    subtype: safeString(source.subtype, 40),
    completeTask: bool(source.completeTask),
  };
}

function checksBlock(outcome) {
  const checks = isPlainObject(outcome) && Array.isArray(outcome.checks) ? outcome.checks.slice(0, MAX_CHECKS) : [];
  return checks.map((check) => ({
    kind: isPlainObject(check) ? safeString(check.kind, 40) : null,
    pass: isPlainObject(check) && check.pass === true,
  }));
}

function flagsBlock(flags) {
  const list = Array.isArray(flags) ? flags : [];
  return RUN_FLAGS.filter((flag) => list.includes(flag));
}

/**
 * The committed row for one raw run record: exactly RUN_ROW_KEYS, built by
 * picking named fields. Raw evidence, page text, error text, session ids and
 * URLs are never copied.
 */
export function toCommittedRow(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const arm = ARMS.includes(source.arm) ? source.arm : null;
  const measurement = isPlainObject(source.measurement) ? source.measurement : null;
  return {
    schemaVersion: RUN_ROW_SCHEMA_VERSION,
    campaignId: safeString(source.campaignId),
    runId: safeString(source.runId),
    attempts: positiveInt(source.attempts === undefined ? source.attempt : source.attempts),
    set: source.set === 'core' || source.set === 'live' ? source.set : null,
    taskId: safeString(source.taskId),
    taskVersion: positiveInt(source.taskVersion, null),
    category: safeString(source.category, 40),
    fixtureSha256: typeof source.fixtureSha256 === 'string' && HEX64.test(source.fixtureSha256) ? source.fixtureSha256 : null,
    arm,
    round: positiveInt(source.round, null),
    order: positiveInt(source.order, null),
    startedAt: safeString(source.startedAt, 40),
    wallMs: num(source.wallMs),
    wallFromInitMs: num(source.wallFromInitMs),
    pass: isPlainObject(source.outcome) && source.outcome.pass === true,
    timedOut: source.timedOut === true,
    checks: checksBlock(source.outcome),
    infraError: INFRA_CODES.includes(source.infraError) ? source.infraError : null,
    claimed: claimedBlock(source.claimed),
    fsb: fsbBlock(measurement, source.sessionMatch),
    host: hostBlock(arm, source.hostSummary),
    cost: costBlock(arm, measurement, source.hostSummary),
    provider: providerBlock(arm, measurement),
    flags: flagsBlock(source.flags),
  };
}

// --- Row validation ------------------------------------------------------------------

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

const isNullableNumber = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const isNullableString = (v) => v === null || typeof v === 'string';
const isNullableBool = (v) => v === null || typeof v === 'boolean';

/**
 * { ok, errors } for one committed row. Errors name the rule and the field
 * path, never the value.
 */
export function validateCommittedRow(row) {
  const errors = [];
  if (!checkKeys(row, RUN_ROW_KEYS, '', errors)) return { ok: false, errors };
  walkStrings(row, '', errors);

  expectType(row.schemaVersion === RUN_ROW_SCHEMA_VERSION, 'schemaVersion', errors);
  expectType(typeof row.campaignId === 'string' && CAMPAIGN_ID_PATTERN.test(row.campaignId), 'campaignId', errors);
  expectType(typeof row.runId === 'string' && RUN_ID_PATTERN.test(row.runId), 'runId', errors);
  expectType(Number.isSafeInteger(row.attempts) && row.attempts >= 1, 'attempts', errors);
  expectType(row.set === 'core' || row.set === 'live', 'set', errors);
  expectType(typeof row.taskId === 'string' && TASK_ID_PATTERN.test(row.taskId), 'taskId', errors);
  expectType(Number.isSafeInteger(row.taskVersion) && row.taskVersion >= 1, 'taskVersion', errors);
  expectType(typeof row.category === 'string' && row.category.length > 0, 'category', errors);
  expectType(typeof row.fixtureSha256 === 'string' && HEX64.test(row.fixtureSha256), 'fixtureSha256', errors);
  expectType(ARMS.includes(row.arm), 'arm', errors);
  expectType(Number.isSafeInteger(row.round) && row.round >= 1, 'round', errors);
  expectType(Number.isSafeInteger(row.order) && row.order >= 1, 'order', errors);
  expectType(typeof row.startedAt === 'string' && Number.isFinite(Date.parse(row.startedAt)), 'startedAt', errors);
  expectType(isNullableNumber(row.wallMs), 'wallMs', errors);
  expectType(isNullableNumber(row.wallFromInitMs), 'wallFromInitMs', errors);
  expectType(typeof row.pass === 'boolean', 'pass', errors);
  expectType(typeof row.timedOut === 'boolean', 'timedOut', errors);
  if (row.infraError !== null && !INFRA_CODES.includes(row.infraError)) errors.push('infra_error_invalid');

  if (!Array.isArray(row.checks) || row.checks.length > MAX_CHECKS) {
    errors.push('type:checks');
  } else {
    row.checks.forEach((check, index) => {
      const where = `checks[${index}]`;
      if (checkKeys(check, NESTED_KEYS.checks, where, errors)) {
        expectType(isNullableString(check.kind), `${where}.kind`, errors);
        expectType(typeof check.pass === 'boolean', `${where}.pass`, errors);
      }
    });
  }

  if (checkKeys(row.claimed, NESTED_KEYS.claimed, 'claimed', errors)) {
    for (const key of ['status', 'partialOutcome', 'subtype']) expectType(isNullableString(row.claimed[key]), `claimed.${key}`, errors);
    for (const key of ['isError', 'completeTask']) expectType(isNullableBool(row.claimed[key]), `claimed.${key}`, errors);
  }

  if (checkKeys(row.fsb, NESTED_KEYS.fsb, 'fsb', errors)) {
    expectType(row.fsb.kind === null || row.fsb.kind === 'mcp' || row.fsb.kind === 'autopilot', 'fsb.kind', errors);
    for (const key of ['calls', 'callsWithTiming', 'fsbMsTotal', 'fsbMsMedian', 'callerGapMsTotal', 'callerGapMsMedian',
      'iterations', 'modelMsTotal', 'toolMsTotal']) {
      expectType(isNullableNumber(row.fsb[key]), `fsb.${key}`, errors);
    }
    if (checkKeys(row.fsb.callIntervalMs, NESTED_KEYS.callIntervalMs, 'fsb.callIntervalMs', errors)) {
      for (const key of NESTED_KEYS.callIntervalMs) expectType(isNullableNumber(row.fsb.callIntervalMs[key]), `fsb.callIntervalMs.${key}`, errors);
    }
    expectType(isNullableString(row.fsb.endReason), 'fsb.endReason', errors);
    expectType(isNullableBool(row.fsb.idleTimeout), 'fsb.idleTimeout', errors);
    expectType(row.fsb.sessionMatch === null || SESSION_MATCHES.includes(row.fsb.sessionMatch), 'fsb.sessionMatch', errors);
  }

  if (checkKeys(row.host, NESTED_KEYS.host, 'host', errors)) {
    expectType(row.host.name === null || row.host.name === 'claude-code' || row.host.name === 'cursor-agent', 'host.name', errors);
    for (const key of ['model', 'toolLoading', 'costLabel']) expectType(isNullableString(row.host[key]), `host.${key}`, errors);
    for (const key of ['durationMs', 'durationApiMs', 'numTurns', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'costUsd']) {
      expectType(isNullableNumber(row.host[key]), `host.${key}`, errors);
    }
  }

  if (checkKeys(row.cost, NESTED_KEYS.cost, 'cost', errors)) {
    expectType(isNullableNumber(row.cost.usd), 'cost.usd', errors);
    expectType(isNullableString(row.cost.source), 'cost.source', errors);
    expectType(isNullableString(row.cost.label), 'cost.label', errors);
  }

  if (checkKeys(row.provider, NESTED_KEYS.provider, 'provider', errors)) {
    expectType(isNullableString(row.provider.requestedModel), 'provider.requestedModel', errors);
    expectType(Array.isArray(row.provider.servedModels) && row.provider.servedModels.length <= MAX_SERVED_MODELS
      && row.provider.servedModels.every((model) => typeof model === 'string'), 'provider.servedModels', errors);
    expectType(isNullableBool(row.provider.servedModelMatch), 'provider.servedModelMatch', errors);
  }

  if (!Array.isArray(row.flags) || new Set(row.flags).size !== row.flags.length || !row.flags.every((flag) => RUN_FLAGS.includes(flag))) {
    errors.push('flag_invalid');
  }

  return { ok: errors.length === 0, errors };
}
