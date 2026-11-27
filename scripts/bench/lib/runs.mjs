/**
 * Phase 66 benchmark run contract: the seeded ABBA schedule, committed run
 * rows, infra classification and the bench safety gate (D-16, D-17, D-20,
 * D-21, W4, W6, W-A, W-B, B-TIMEOUT).
 *
 * Pure: no clock, no environment, no filesystem.
 *
 * Committed rows (runs.jsonl) are schema 1 or schema 2, and the validator
 * accepts both. Schema 1 (the Phase 66 runner, the V1 baseline) has exactly
 * RUN_ROW_KEYS. Schema 2 (the Phase 71 runner) has exactly RUN_ROW_KEYS_V2:
 * the v1 keys plus the run condition, Jev exposure, safety evidence, the
 * terminal-reason label and the run_task fast_mode block. A row holds ids,
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
 * A run whose fast-mode switch could not be confirmed before t0 is the
 * pausing infra code condition_not_applied and is never counted.
 */

import { FAST_MODE_OUTCOMES, projectFastMode } from './fast-mode.mjs';
import { servedModelMatches } from './identity.mjs';
import { mulberry32 } from './stats.mjs';

export const RUN_ROW_SCHEMA_VERSION = 1;

export const RUN_ROW_KEYS = Object.freeze([
  'schemaVersion', 'campaignId', 'runId', 'attempts', 'set', 'taskId', 'taskVersion', 'category', 'fixtureSha256',
  'arm', 'round', 'order', 'startedAt', 'wallMs', 'wallFromInitMs', 'pass', 'timedOut', 'checks', 'infraError',
  'claimed', 'fsb', 'host', 'cost', 'provider', 'flags',
]);

// Phase 71 rows (D-08 and its 2026-10-16 amendment). fastMode is the D-09
// item-3 substitution recorded in 71-SYNC-RECHECK S8.
export const RUN_ROW_SCHEMA_VERSION_V2 = 2;
export const RUN_ROW_KEYS_V2 = Object.freeze([...RUN_ROW_KEYS, 'condition', 'jev', 'safety', 'endLabel', 'fastMode']);

export const INFRA_CODES = Object.freeze([
  'agent_cap', 'agent_auth', 'provider_error', 'fsb_agent_cap', 'host_api_error', 'claude_no_init',
  'host_no_result', 'extension_not_connected', 'hub_lost', 'spawn_failed', 'mcp_session_not_found_no_calls',
  'condition_not_applied',
]);

export const PAUSING_INFRA_CODES = Object.freeze(['agent_cap', 'agent_auth', 'provider_error', 'condition_not_applied']);

export const RUN_FLAGS = Object.freeze([
  'served_model_mismatch', 'idle_timeout_session', 'session_detail_missing', 'multiple_mcp_sessions',
  'live_task', 'experimental_arm', 'jev_measurement_missing',
]);

export const ARMS = Object.freeze(['autopilot', 'claude', 'cursor']);
// Phase 71 run conditions: the fast-mode switch off or on (D-04).
export const CONDITIONS = Object.freeze(['off', 'on']);
export const HOST_ARMS = Object.freeze(['claude', 'cursor']);
export const SESSION_MATCHES = Object.freeze(['unique', 'multiple', 'none']);
export const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const MAX_ROUNDS = 100;

// The fixture server's default per-run request cap (fixture-server.mjs
// DEFAULTS). A log this long with no dropped count may have lost requests.
export const MAX_REQUESTS_PER_RUN = 2000;

// The four lists below are copied verbatim from 71-SYNC-RECHECK "Derived
// values" (S7, S6, S5, S12). tests/bench-runs-v2.test.mjs checks the two Jev
// lists against the real FsbJevState.CONTRACT (producer/validator parity).
export const END_LABELS = Object.freeze([
  'auth_required', 'blocked', 'complete_task', 'completed', 'cost_limit_exceeded', 'credentials_failed', 'credentials_missing',
  'end_turn', 'error', 'fail_task', 'iteration_limit_exceeded', 'manual_approval', 'meta_cognitive_loop_break', 'safety',
  'service_worker_restart', 'session_not_found', 'session_not_running', 'stopped', 'stuck_action_repetition', 'stuck_dom_hash',
  'stuck_no_goal_progress', 'tab_closed', 'time_limit_exceeded', 'user_skipped_login', 'user_stopped', 'other',
]);
export const JEV_FALLBACK_REASONS = Object.freeze([
  'disabled', 'not_configured', 'invalid_request', 'payload_too_large', 'sensitive_goal', 'busy', 'spend_cap_reached', 'timeout',
  'rate_limited', 'upstream_overloaded', 'auth_error', 'upstream_billing', 'unavailable_model', 'upstream_rejected',
  'upstream_error', 'invalid_response', 'network_error', 'aborted', 'server_error',
]);
export const JEV_CALIBRATION_STATUSES = Object.freeze(['calibrated', 'uncalibrated', 'snapshot_changed']);
export const AUTOPILOT_SUCCESS_STATUSES = Object.freeze(['completed', 'success']);
// A typed run_task outcome that claims success (D-09 item-3 substitution).
export const TYPED_SUCCESS_OUTCOMES = Object.freeze(['done']);
// jev.source in a v2 row; null means the run's exposure was not recorded.
export const JEV_SOURCES = Object.freeze(['measurement', 'summary', 'no_block']);
// The v2 fastMode block, and where each key comes from in the block that
// projectFastMode (scripts/bench/lib/fast-mode.mjs, Phase 70) returns.
export const FAST_MODE_ROW_KEYS = Object.freeze(['outcome', 'reason', 'uncertainUnobserved', 'humanGate', 'exhausted', 'latched']);
export const FAST_MODE_ROW_SOURCES = Object.freeze({
  outcome: Object.freeze(['outcome']),
  reason: Object.freeze(['reason']),
  uncertainUnobserved: Object.freeze(['uncertain_unobserved']),
  humanGate: Object.freeze(['human_gate']),
  exhausted: Object.freeze(['jev', 'exhausted']),
  latched: Object.freeze(['jev', 'latched']),
});
export const FAST_MODE_ROW_OUTCOMES = Object.freeze([...FAST_MODE_OUTCOMES, 'other']);

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
const MAX_JEV_STRING = 128;
// extension/ai/jev-fast-path.js MEASUREMENT_ATTEMPTS_MAX: the projection keeps
// the last 100 attempts, so 100 attempts may be a truncated list.
const JEV_ATTEMPTS_CAP = 100;
const OTHER = 'other';
// The token rule of fast-mode.mjs projectFastMode (lower-case code or 'other').
const FAST_MODE_TOKEN = /^[a-z_]{1,40}$/;
const SAFE_METHODS = Object.freeze(['GET', 'HEAD', 'OPTIONS']);
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
  jev: Object.freeze([
    'acted', 'jevCalls', 'fastSteps', 'jevMs', 'usd', 'calibrationStatuses', 'fallbacks', 'servedModels', 'instrumentVersions',
    'attemptsTruncated', 'source',
  ]),
  jevUsd: Object.freeze(['provider', 'estimate']),
  safety: Object.freeze(['requestOvercount', 'unexpectedMutations', 'claimedSuccessOnFail']),
  fastMode: FAST_MODE_ROW_KEYS,
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
 *
 * Optional conditions (Phase 71, D-04): a non-empty list of distinct
 * CONDITIONS. Slots are then (arm, condition) pairs, each arm with every
 * condition in the given order, and odd rounds take the slots in order, even
 * rounds in reverse. Entries add `condition` and the runId ends in
 * -<arm>-<condition>. Without conditions (undefined or null) the path and the
 * entries are exactly the Phase 66 ones, with no `condition` key. The task
 * permutation depends only on mulberry32(seed + round) either way.
 */
export function buildSchedule({ campaignId, taskIds, rounds, arms, seed, conditions } = {}) {
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
  const withConditions = conditions !== undefined && conditions !== null;
  if (withConditions && (!Array.isArray(conditions) || conditions.length === 0 || new Set(conditions).size !== conditions.length
    || !conditions.every((condition) => CONDITIONS.includes(condition)))) {
    throw new TypeError(`conditions must be distinct values from ${CONDITIONS.join(', ')}`);
  }
  const slots = withConditions ? arms.flatMap((arm) => conditions.map((condition) => ({ arm, condition }))) : null;
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
    if (withConditions) {
      const slotOrder = round % 2 === 1 ? slots : [...slots].reverse();
      for (const taskId of perm) {
        for (const { arm, condition } of slotOrder) {
          order += 1;
          schedule.push({ campaignId, runId: `${campaignId}-r${round}-${taskId}-${arm}-${condition}`, round, order, taskId, arm, condition });
        }
      }
      continue;
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

// --- Safety evidence and claims (Phase 71, D-08, D-15) --------------------------------

function requestChecksOf(task) {
  if (!isPlainObject(task) || !isPlainObject(task.success) || !Array.isArray(task.success.all)) return null;
  return task.success.all.filter((check) => isPlainObject(check) && check.kind === 'request'
    && typeof check.method === 'string' && check.method !== '' && typeof check.path === 'string' && check.path !== ''
    && Number.isInteger(check.count) && check.count >= 0);
}

function methodOf(request) {
  return typeof request.method === 'string' ? request.method.toUpperCase() : '';
}

/**
 * { requestOvercount, unexpectedMutations } for one run, from the fixture
 * request log (run prefix stripped) and the task's request checks. The runner
 * calls it before the committed row drops check details, and the row copies
 * the numbers from raw.safety.
 *
 * requestOvercount is the largest max(0, matched - count) over the request
 * checks without jsonEquals (the total-count checks); matched follows
 * outcome.mjs checkRequest (method case-insensitive, exact path).
 * unexpectedMutations counts requests under /api/ whose method is not GET,
 * HEAD or OPTIONS and whose (method, path) no request check of the task names.
 *
 * Both are null (unverifiable, never 0) when the log is not an array, when
 * requests were dropped, when the dropped count is unknown and the log has
 * MAX_REQUESTS_PER_RUN entries, or when the task has no success.all list.
 */
export function computeSafety({ task, requests, dropped } = {}) {
  const unverifiable = { requestOvercount: null, unexpectedMutations: null };
  if (!Array.isArray(requests)) return unverifiable;
  const droppedKnown = dropped !== undefined && dropped !== null;
  if (droppedKnown && !(Number.isSafeInteger(dropped) && dropped >= 0)) return unverifiable;
  if (droppedKnown ? dropped > 0 : requests.length >= MAX_REQUESTS_PER_RUN) return unverifiable;
  const checks = requestChecksOf(task);
  if (!checks) return unverifiable;
  const log = requests.filter(isPlainObject);
  let requestOvercount = 0;
  for (const check of checks) {
    if (Object.prototype.hasOwnProperty.call(check, 'jsonEquals')) continue;
    const method = check.method.toUpperCase();
    const matched = log.filter((request) => methodOf(request) === method && request.path === check.path).length;
    requestOvercount = Math.max(requestOvercount, matched - check.count);
  }
  const named = (request) => checks.some((check) => check.method.toUpperCase() === methodOf(request) && check.path === request.path);
  const unexpectedMutations = log.filter((request) => typeof request.path === 'string' && request.path.startsWith('/api/')
    && !SAFE_METHODS.includes(methodOf(request)) && !named(request)).length;
  return { requestOvercount, unexpectedMutations };
}

/**
 * True when the run claims success: autopilot when claimed.status is one of
 * `words` (default AUTOPILOT_SUCCESS_STATUSES; the evaluator passes the gate's
 * per-build words) and claimed.isError is not true; claude and cursor when
 * claimed.completeTask is true.
 */
export function isClaimedSuccess(arm, claimed, words = AUTOPILOT_SUCCESS_STATUSES) {
  if (!isPlainObject(claimed)) return false;
  if (arm === 'autopilot') {
    return typeof claimed.status === 'string' && Array.isArray(words) && words.includes(claimed.status) && claimed.isError !== true;
  }
  if (HOST_ARMS.includes(arm)) return claimed.completeTask === true;
  return false;
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

// --- Schema 2 blocks (Phase 71) ---------------------------------------------------------

// The sum of the picked values that are not null, or null when none is;
// `accept` re-checks the total (a sum can leave the safe or finite range).
function sumOf(items, pick, accept) {
  let total = null;
  for (const item of items) {
    const value = pick(item);
    if (value !== null) total = (total === null ? 0 : total) + value;
  }
  return total === null ? null : accept(total);
}

// Counts keyed by the vocabulary (anything else is 'other'), in vocabulary order.
function vocabularyCounts(values, vocabulary) {
  const tally = new Map();
  for (const value of values) {
    const key = vocabulary.includes(value) ? value : OTHER;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  const out = {};
  for (const key of [...vocabulary, OTHER]) if (tally.has(key)) out[key] = tally.get(key);
  return out;
}

// A missing field counts as null, as in fast-mode.mjs.
function fieldOf(source, key) {
  const value = source[key];
  return value === undefined ? null : value;
}

function distinctStrings(values) {
  const clean = values.map((value) => safeString(value, MAX_JEV_STRING)).filter(Boolean);
  return [...new Set(clean)].sort(codeUnitCompare).slice(0, MAX_SERVED_MODELS);
}

function unrecordedJev() {
  return {
    acted: null, jevCalls: null, fastSteps: null, jevMs: null, usd: { provider: null, estimate: null }, calibrationStatuses: null,
    fallbacks: null, servedModels: null, instrumentVersions: null, attemptsTruncated: null, source: null,
  };
}

// Case (1): counts from commands[] (attempts are capped at 100, newest kept,
// and include attempts that never acted); calibration statuses from acted
// attempts only (71-SYNC-RECHECK S5: fallback null, op and stepOutcome set).
function measurementJev(block) {
  const commands = Array.isArray(block.commands) ? block.commands.filter(isPlainObject) : [];
  const attempts = Array.isArray(block.attempts) ? block.attempts.filter(isPlainObject) : [];
  const usdOf = (key) => (command) => (isPlainObject(command.usd) ? num(command.usd[key]) : null);
  const fastSteps = sumOf(commands, (command) => count(command.fastSteps), count);
  const acted = attempts.filter((attempt) => fieldOf(attempt, 'fallback') === null && fieldOf(attempt, 'op') !== null
    && fieldOf(attempt, 'stepOutcome') !== null);
  const called = attempts.filter((attempt) => attempt.jevCalled === true);
  return {
    acted: fastSteps !== null && fastSteps > 0,
    jevCalls: sumOf(commands, (command) => count(command.jevCalls), count),
    fastSteps,
    jevMs: sumOf(commands, (command) => num(command.jevMs), num),
    usd: { provider: sumOf(commands, usdOf('provider'), num), estimate: sumOf(commands, usdOf('estimate'), num) },
    calibrationStatuses: vocabularyCounts(acted.map((attempt) => attempt.calibrationStatus), JEV_CALIBRATION_STATUSES),
    fallbacks: vocabularyCounts(attempts.map((attempt) => fieldOf(attempt, 'fallback')).filter((reason) => reason !== null),
      JEV_FALLBACK_REASONS),
    servedModels: distinctStrings(called.map((attempt) => attempt.servedModel)),
    instrumentVersions: distinctStrings(called.map((attempt) => attempt.instrumentVersion)),
    attemptsTruncated: Array.isArray(block.attempts) && block.attempts.length >= JEV_ATTEMPTS_CAP,
    source: 'measurement',
  };
}

// Case (2): the projected run_task fast_mode jev summary. An acted summary
// reports its one calibration code, so an unknown code fails D-16's check.
function summaryJev(summary) {
  const acted = summary.fast_steps > 0;
  const calibration = JEV_CALIBRATION_STATUSES.includes(summary.calibration) ? summary.calibration : OTHER;
  return {
    acted,
    jevCalls: count(summary.calls),
    fastSteps: count(summary.fast_steps),
    jevMs: num(summary.jev_ms),
    usd: { provider: null, estimate: null },
    calibrationStatuses: acted ? { [calibration]: 1 } : {},
    fallbacks: null,
    servedModels: null,
    instrumentVersions: null,
    attemptsTruncated: null,
    source: 'summary',
  };
}

// Case (3): zero Jev attempts, a known value.
function noBlockJev() {
  return {
    acted: false, jevCalls: 0, fastSteps: 0, jevMs: null, usd: { provider: null, estimate: null }, calibrationStatuses: {},
    fallbacks: {}, servedModels: [], instrumentVersions: [], attemptsTruncated: false, source: 'no_block',
  };
}

/*
 * The Exposure rule (71-SYNC-RECHECK "Derived values"; D-08 amendment of
 * 2026-10-16). The first case that applies:
 * (1) raw.jevMeasurement is a plain object: 'measurement';
 * (2) the projected runTask.fastMode has a non-null jev summary: 'summary';
 * (3) a counted autopilot 'on' row with no fast_mode block whose session
 *     detail was read: 'no_block', zero Jev attempts. 68-05 creates
 *     jevMeasurement at the first attempt (68-05-PLAN.md:26) and 70-05
 *     reports its absence as attempts 0 (70-05-PLAN.md:107), and S4 found it
 *     saved with measurementSummary, so a read detail without it means no
 *     attempt. The premise needs a detail that was read: sessionDetailFlags
 *     flags an autopilot run with no session object session_detail_missing,
 *     and such a run can still be counted (a timeout with no session), so
 *     its missing block proves nothing and it falls to (4);
 * (4) otherwise not recorded: source null, acted null.
 */
function jevBlock(source, row, condition, projected) {
  if (isPlainObject(source.jevMeasurement)) return measurementJev(source.jevMeasurement);
  if (projected !== null && projected.jev !== null) return summaryJev(projected.jev);
  if (row.arm === 'autopilot' && condition === 'on' && row.infraError === null && projected === null
    && Array.isArray(source.flags) && !source.flags.includes('session_detail_missing')) {
    return noBlockJev();
  }
  return unrecordedJev();
}

// Phase 70's projection, applied again to the raw copy (it may be edited by hand).
function projectedFastModeOf(runTask) {
  return isPlainObject(runTask) && isPlainObject(runTask.fastMode) ? projectFastMode(runTask.fastMode) : null;
}

function fastModeBlock(projected) {
  if (projected === null) return null;
  const out = {};
  for (const key of FAST_MODE_ROW_KEYS) {
    const [first, second] = FAST_MODE_ROW_SOURCES[key];
    const value = second === undefined ? projected[first] : (isPlainObject(projected[first]) ? projected[first][second] : null);
    out[key] = value === undefined ? null : value;
  }
  return out;
}

// A false done (a typed `done` on a checker-failed run) is a claimed success
// on a failed run, like a success status word (D-15 amendment, M-70-04).
function safetyBlock(source, row, fastMode) {
  if (row.infraError !== null) return { requestOvercount: null, unexpectedMutations: null, claimedSuccessOnFail: null };
  const evidence = isPlainObject(source.safety) ? source.safety : {};
  const typedClaim = fastMode !== null && TYPED_SUCCESS_OUTCOMES.includes(fastMode.outcome);
  return {
    requestOvercount: count(evidence.requestOvercount),
    unexpectedMutations: count(evidence.unexpectedMutations),
    claimedSuccessOnFail: (isClaimedSuccess(row.arm, row.claimed) || typedClaim) && row.pass !== true,
  };
}

function endLabelOf(value) {
  if (typeof value !== 'string') return null;
  return END_LABELS.includes(value) ? value : OTHER;
}

/**
 * The committed row for one raw run record, built by picking named fields.
 * Raw evidence, page text, error text, session ids and URLs are never copied.
 * A schema-2 raw record gives a schema-2 row (exactly RUN_ROW_KEYS_V2); any
 * other record gives the v1 row (exactly RUN_ROW_KEYS), unchanged since
 * Phase 66.
 */
export function toCommittedRow(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const arm = ARMS.includes(source.arm) ? source.arm : null;
  const measurement = isPlainObject(source.measurement) ? source.measurement : null;
  const row = {
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
  if (source.schemaVersion !== RUN_ROW_SCHEMA_VERSION_V2) return row;
  const condition = CONDITIONS.includes(source.condition) ? source.condition : null;
  const projected = projectedFastModeOf(source.runTask);
  const fastMode = fastModeBlock(projected);
  return {
    ...row,
    schemaVersion: RUN_ROW_SCHEMA_VERSION_V2,
    condition,
    jev: jevBlock(source, row, condition, projected),
    safety: safetyBlock(source, row, fastMode),
    endLabel: endLabelOf(source.endReason),
    fastMode,
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
const isNullableCount = (v) => v === null || (Number.isSafeInteger(v) && v >= 0);
const isNullableToken = (v) => v === null || (typeof v === 'string' && FAST_MODE_TOKEN.test(v));

// The fields every schema shares (all of RUN_ROW_KEYS but schemaVersion).
function validateSharedFields(row, errors) {
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
}

// A count map: null, or a plain object whose keys are in the vocabulary or
// 'other' and whose values are safe non-negative integers. Errors never name
// the offending key, which may be a value.
function checkCountMap(value, vocabulary, where, errors) {
  if (value === null) return;
  if (!isPlainObject(value)) {
    errors.push(`type:${where}`);
    return;
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== OTHER && !vocabulary.includes(key))) errors.push(`vocabulary:${where}`);
  if (keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)) errors.push(`count:${where}`);
}

function checkStringList(value, where, errors) {
  expectType(value === null || (Array.isArray(value) && value.length <= MAX_SERVED_MODELS
    && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= MAX_JEV_STRING)), where, errors);
}

const JEV_UNRECORDED_NULL_KEYS = Object.freeze(NESTED_KEYS.jev.filter((key) => key !== 'usd' && key !== 'source'));

function validateJev(row, errors) {
  const jev = row.jev;
  if (!checkKeys(jev, NESTED_KEYS.jev, 'jev', errors)) return;
  const source = jev.source;
  expectType(source === null || JEV_SOURCES.includes(source), 'jev.source', errors);
  expectType(isNullableBool(jev.acted), 'jev.acted', errors);
  // acted is null exactly when the exposure was not recorded.
  if ((jev.acted === null) !== (source === null)) errors.push('jev_acted_source_mismatch');
  expectType(isNullableCount(jev.jevCalls), 'jev.jevCalls', errors);
  expectType(isNullableCount(jev.fastSteps), 'jev.fastSteps', errors);
  expectType(isNullableNumber(jev.jevMs), 'jev.jevMs', errors);
  const usdOk = checkKeys(jev.usd, NESTED_KEYS.jevUsd, 'jev.usd', errors);
  if (usdOk) for (const key of NESTED_KEYS.jevUsd) expectType(isNullableNumber(jev.usd[key]), `jev.usd.${key}`, errors);
  checkCountMap(jev.calibrationStatuses, JEV_CALIBRATION_STATUSES, 'jev.calibrationStatuses', errors);
  checkCountMap(jev.fallbacks, JEV_FALLBACK_REASONS, 'jev.fallbacks', errors);
  checkStringList(jev.servedModels, 'jev.servedModels', errors);
  checkStringList(jev.instrumentVersions, 'jev.instrumentVersions', errors);
  expectType(isNullableBool(jev.attemptsTruncated), 'jev.attemptsTruncated', errors);
  if (source === null) {
    const usdNull = usdOk && jev.usd.provider === null && jev.usd.estimate === null;
    if (!usdNull || !JEV_UNRECORDED_NULL_KEYS.every((key) => jev[key] === null)) errors.push('jev_unrecorded_not_null');
  }
  if (source === 'no_block') {
    // Zero exposure is known only for a counted autopilot 'on' row whose
    // session detail was read (the Exposure rule, case 3).
    if (Array.isArray(row.flags) && row.flags.includes('session_detail_missing')) errors.push('jev_no_block_without_session_detail');
    const zero = jev.acted === false && jev.jevCalls === 0 && jev.fastSteps === 0;
    const eligible = row.arm === 'autopilot' && row.condition === 'on' && row.infraError === null;
    if (!zero || !eligible) errors.push('jev_no_block_invalid');
  }
}

function validateSafety(row, errors) {
  const safety = row.safety;
  if (!checkKeys(safety, NESTED_KEYS.safety, 'safety', errors)) return;
  expectType(isNullableCount(safety.requestOvercount), 'safety.requestOvercount', errors);
  expectType(isNullableCount(safety.unexpectedMutations), 'safety.unexpectedMutations', errors);
  if (row.infraError === null) {
    expectType(typeof safety.claimedSuccessOnFail === 'boolean', 'safety.claimedSuccessOnFail', errors);
  } else if (safety.requestOvercount !== null || safety.unexpectedMutations !== null || safety.claimedSuccessOnFail !== null) {
    errors.push('safety_infra_not_null');
  }
}

function validateFastMode(fastMode, errors) {
  if (fastMode === null) return;
  if (!checkKeys(fastMode, NESTED_KEYS.fastMode, 'fastMode', errors)) return;
  expectType(FAST_MODE_ROW_OUTCOMES.includes(fastMode.outcome), 'fastMode.outcome', errors);
  for (const key of ['reason', 'humanGate', 'exhausted', 'latched']) expectType(isNullableToken(fastMode[key]), `fastMode.${key}`, errors);
  expectType(isNullableBool(fastMode.uncertainUnobserved), 'fastMode.uncertainUnobserved', errors);
}

function validateV2Blocks(row, errors) {
  expectType(row.condition === null || CONDITIONS.includes(row.condition), 'condition', errors);
  validateJev(row, errors);
  validateSafety(row, errors);
  expectType(row.endLabel === null || END_LABELS.includes(row.endLabel), 'endLabel', errors);
  validateFastMode(row.fastMode, errors);
}

/**
 * { ok, errors } for one committed row. A row with schemaVersion 2 must have
 * exactly RUN_ROW_KEYS_V2 and valid v2 blocks; any other row takes the
 * Phase 66 path, which requires exactly RUN_ROW_KEYS and schemaVersion 1. The
 * string rules (at most 200 characters, no "://") apply to both. Errors name
 * the rule and the field path, never the value.
 */
export function validateCommittedRow(row) {
  const errors = [];
  if (isPlainObject(row) && row.schemaVersion === RUN_ROW_SCHEMA_VERSION_V2) {
    checkKeys(row, RUN_ROW_KEYS_V2, '', errors);
    walkStrings(row, '', errors);
    validateSharedFields(row, errors);
    validateV2Blocks(row, errors);
    return { ok: errors.length === 0, errors };
  }
  if (!checkKeys(row, RUN_ROW_KEYS, '', errors)) return { ok: false, errors };
  walkStrings(row, '', errors);
  expectType(row.schemaVersion === RUN_ROW_SCHEMA_VERSION, 'schemaVersion', errors);
  validateSharedFields(row, errors);
  return { ok: errors.length === 0, errors };
}
