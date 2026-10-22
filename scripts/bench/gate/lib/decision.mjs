/**
 * Phase 71 release decision file and release claims (EVAL-02; CONTEXT D-06,
 * D-17, D-18; RESEARCH Pattern 6).
 *
 * Pure: no clock, no environment, no filesystem, no git, no network. The CLI
 * (evaluate-gate.mjs) passes the evaluator result and the git facts in and
 * writes the file.
 *
 * buildDecision turns an evaluateGate result into the decision file that V4
 * commits and V6 applies. Every path gets exactly one V6 action (D-17):
 * - a Jev pass ships opt-in and default off;
 * - a Jev fail on safety disables Jev for every install through the operator
 *   switch (fly secrets set JEV_ENABLED=false) before the extension
 *   publishes, for BOTH Jev paths, since they come from one comparison;
 * - any other Jev result (a speed or completion fail, inconclusive or
 *   not_exercised) ships unchanged as experimental with no speed claim;
 * - a non-Jev pass publishes MCP 0.12.0, and anything else withholds it.
 *
 * buildClaims writes the only sanctioned whole-task sentences (D-18). Each
 * sentence is rendered from a fixed template whose only interpolations are
 * typed tokens {name, value, source}; the source is one of wallMs-ratio,
 * completion-diff, completion-count or cost, and each source has one
 * formatter. checkClaims re-renders every sentence from its tokens, so a hand
 * edit, a token from any other source or a per-decision timing word fails.
 *
 * validateDecision is an exact-key validator in the runs.mjs style: errors
 * are codes with a path and never carry a value. Strings are at most 200
 * characters (claims[].text at most 400) and never contain "://". It also
 * ties the claims to the verdicts: the claim ids the paths require and allow,
 * and every quoted criterion number equal to the path's criteria.
 */

import { FALLBACK_STATUSES, VERDICTS, groupRows } from './evaluate.mjs';

export const DECISION_SCHEMA_VERSION = 1;
export const MAX_DECISION_STRING = 200;
export const MAX_CLAIM_TEXT = 400;
export const MAX_CLAIMS = 16;
export const FALLBACK_CAMPAIGN_ID = 'core-rebaseline-71';

export const DECISION_PATHS = Object.freeze(['jev-mcp-run-task', 'jev-autopilot', 'mcp-non-jev']);
const JEV_PATHS = Object.freeze(['jev-mcp-run-task', 'jev-autopilot']);
const NON_JEV = 'mcp-non-jev';

// D-17: one consequence per verdict, applied at V6. The keys are the
// decision's v6Action values; the texts are its recommendation sentences.
export const V6_ACTIONS = Object.freeze({
  ship_opt_in_default_off: 'Ship as built: opt-in, default off, card text unchanged.',
  ship_experimental_no_speed_claim: 'Ship unchanged as experimental; release notes say no whole-task speedup was demonstrated.',
  disable_jev_operator_switch: 'Before the extension publishes, run fly secrets set JEV_ENABLED=false and confirm the gateway answers disabled.',
  publish_mcp_0_12_0: 'Publish fsb-mcp-server 0.12.0 at V6 step B.',
  withhold_mcp_0_12_0: 'Withhold fsb-mcp-server 0.12.0; npm stays at 0.11.2; extension 1.0.0 may still ship.',
});

// D-18 / Pattern 6: the only number sources a release claim may quote.
export const ALLOWED_CLAIM_SOURCES = Object.freeze(['wallMs-ratio', 'completion-diff', 'completion-count', 'cost']);

// Words no claim may contain: per-decision timing is never whole-task speed.
export const FORBIDDEN_CLAIM_TEXT = /jevMs|latencyMs|per decision|ms per call/i;
const FORBIDDEN_TOKEN_NAME = /jevMs|latency|perDecision|perCall|msPer/i;

// The sentence templates; {name} is replaced by the formatted token value.
export const CLAIM_TEMPLATES = Object.freeze({
  'jev-whole-task': 'With fast mode on, whole-task wall time per completed task on the 12-task core set was {ratio} of the time with it off '
    + '(95% CI {ratioLow} to {ratioHigh}); completion changed by {completionDiff} points (95% CI {completionDiffLow} to '
    + '{completionDiffHigh}), with {onCompleted} of {onCounted} counted runs completed with fast mode on and {offCompleted} of '
    + '{offCounted} with it off.',
  'jev-no-speedup': 'No whole-task speedup from fast mode was demonstrated on the 12-task core set.',
  'jev-disabled': 'Fast mode is disabled for every install for this release.',
  'mcp-non-jev-time': "With the release-candidate MCP server, Claude Code's whole-task wall time per completed task on the 12-task core set "
    + 'was {ratio} of the time at the 8a058bdf baseline (95% CI {ratioLow} to {ratioHigh}), within the predeclared non-inferiority '
    + 'bound of {bound}; completion changed by {completionDiff} points (95% CI {completionDiffLow} to {completionDiffHigh}).',
  'mcp-non-jev-faster': 'The upper end of that interval, {ratioHigh}, is below 100%, so whole-task time with the release-candidate MCP '
    + 'server was faster than the baseline.',
  cost: 'LLM cost per completed task was {llmOff} with fast mode off and {llmOn} with it on; Jev cost per completed task with it on '
    + 'was {jevOn} (provider-reported), which FSB bears and which is not included in the LLM cost.',
  // The same sentence when at least one fast run's Jev cost came from the
  // gateway's input-token estimate rather than the provider's figure.
  'cost-estimated': 'LLM cost per completed task was {llmOff} with fast mode off and {llmOn} with it on; Jev cost per completed task with '
    + 'it on was {jevOn} (provider-reported where the provider gave a figure, otherwise estimated from input tokens), which FSB bears '
    + 'and which is not included in the LLM cost.',
});

export const DECISION_KEYS = Object.freeze({
  top: Object.freeze(['schemaVersion', 'gate', 'measuredSha', 'campaigns', 'suites', 'sentinel', 'paths', 'fallback', 'claims', 'evaluator']),
  gate: Object.freeze(['path', 'sha256', 'gateVersion', 'authorDate', 'committerDate']),
  campaigns: Object.freeze(['baseline', 'autopilot', 'claude']),
  campaign: Object.freeze(['id', 'createdAt', 'gitSha', 'rounds']),
  suites: Object.freeze(['ran', 'results']),
  suiteResult: Object.freeze(['command', 'exitCode']),
  sentinel: Object.freeze(['status', 'reasons', 'blocker']),
  path: Object.freeze(['label', 'verdict', 'reasons', 'faster', 'source', 'criteria', 'recommendation', 'v6Action']),
  criteria: Object.freeze(['speed', 'completion', 'safety', 'exercised', 'identity']),
  speed: Object.freeze(['verdict', 'estimate', 'ci']),
  completion: Object.freeze(['verdict', 'diff', 'ci']),
  safety: Object.freeze(['verdict', 'reasons']),
  exercised: Object.freeze(['status', 'actedShare']),
  identity: Object.freeze(['verdict', 'mismatches']),
  fallback: Object.freeze(['status', 'primaryVerdict', 'primaryReasons', 'reasons', 'campaigns']),
  fallbackCampaigns: Object.freeze(['pin', 'candidate']),
  claim: Object.freeze(['id', 'text', 'tokens']),
  token: Object.freeze(['name', 'value', 'source']),
  evaluator: Object.freeze(['iterations', 'seed', 'level']),
});

const CRITERION_VERDICTS = Object.freeze(['pass', 'fail', 'inconclusive']);
const SENTINEL_STATUSES = Object.freeze(['pass', 'trip', 'inconclusive']);
const EXERCISE_STATUSES = Object.freeze(['exercised', 'not_exercised']);
const SOURCES = Object.freeze(['primary', 'fallback']);
const HEX64 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const IDENTITY_PREFIX = 'identity_mismatch:';
const CLAIM_TEXT_PATH = /^claims\[\d+\]\.text$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pairOf(ci) {
  return Array.isArray(ci) && ci.length === 2 ? [finite(ci[0]), finite(ci[1])] : [null, null];
}

function stringOrNull(value) {
  return typeof value === 'string' ? value : null;
}

// --- The V6 consequence (D-17) -------------------------------------------------------------

/**
 * { <path>: <v6Action> } from { <path>: { verdict, safetyVerdict } }. A Jev
 * fail whose safety criterion failed disables BOTH Jev paths.
 */
export function v6ActionsFor(entries) {
  const of = (name) => (isPlainObject(entries) && isPlainObject(entries[name]) ? entries[name] : {});
  const jevSafetyFail = JEV_PATHS.some((name) => of(name).verdict === 'fail' && of(name).safetyVerdict === 'fail');
  const out = {};
  for (const name of JEV_PATHS) {
    if (jevSafetyFail) out[name] = 'disable_jev_operator_switch';
    else out[name] = of(name).verdict === 'pass' ? 'ship_opt_in_default_off' : 'ship_experimental_no_speed_claim';
  }
  out[NON_JEV] = of(NON_JEV).verdict === 'pass' ? 'publish_mcp_0_12_0' : 'withhold_mcp_0_12_0';
  return out;
}

// --- Claims (Pattern 6) ------------------------------------------------------------------------

function signedOneDecimal(points) {
  const rounded = Math.round(points * 10) / 10;
  const sign = rounded > 0 ? '+' : (rounded < 0 ? '-' : '');
  return `${sign}${Math.abs(rounded).toFixed(1)}`;
}

// Dollars: four decimals from a cent up, and at least two significant digits
// below it (never fewer than six decimals, as report.mjs fmtUsdFine), since
// Jev cost per completed task is a fraction of a cent and must never read
// $0.0000.
function usd(value) {
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude >= 0.01) return `$${value.toFixed(4)}`;
  const decimals = Math.min(20, Math.max(6, 1 - Math.floor(Math.log10(magnitude))));
  return `$${value.toFixed(decimals)}`;
}

// One formatter per source; a missing value reads 'unavailable', never null or NaN.
const FORMATTERS = Object.freeze({
  'wallMs-ratio': (value) => `${(value * 100).toFixed(1)}%`,
  'completion-diff': (value) => signedOneDecimal(value * 100),
  'completion-count': (value) => String(Math.round(value)),
  cost: usd,
});

/** The rendered value of one token, by its source's formatter. */
export function formatClaimValue(source, value) {
  const format = FORMATTERS[source];
  if (!format) return 'unavailable';
  return finite(value) === null ? 'unavailable' : format(value);
}

function placeholdersOf(template) {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

/** The text of claim `id` with each {name} replaced by its token's formatted value. */
export function renderClaim(id, tokens) {
  const template = CLAIM_TEMPLATES[id];
  if (typeof template !== 'string') throw new Error('unknown claim id');
  const byName = new Map((Array.isArray(tokens) ? tokens : []).filter(isPlainObject).map((token) => [token.name, token]));
  return template.replace(PLACEHOLDER, (whole, name) => {
    const token = byName.get(name);
    return token ? formatClaimValue(token.source, token.value) : 'unavailable';
  });
}

function token(name, value, source) {
  return { name, value: finite(value), source };
}

function claim(id, tokens) {
  return { id, text: renderClaim(id, tokens), tokens };
}

const isCounted = (row) => row.infraError === null;

// Every per-completed-task cost divides the summed cost of ALL counted runs by
// the completed ones, so a counted run without a cost would bias the figure
// low (WR-01): the figure is null ('unavailable') unless every counted run in
// the group has one.
function llmCostPerCompleted(rows) {
  const counted = rows.filter(isCounted);
  const completed = counted.filter((row) => row.pass === true).length;
  const costs = counted.map((row) => (isPlainObject(row.cost) ? finite(row.cost.usd) : null));
  return completed > 0 && costs.every((usd) => usd !== null) ? costs.reduce((sum, usd) => sum + usd, 0) / completed : null;
}

// The Jev cost of one counted row: zero when it made no gateway call
// (jevCalls 0: no_block, or local declines only), else the sum of its
// provider and estimate figures, or null when a called row reports neither
// (a 'summary' row, whose jev.usd is always null, or a gateway with no
// figure) or its exposure was not recorded (jevCalls null).
function jevRowCost(row) {
  const jev = isPlainObject(row.jev) ? row.jev : null;
  if (jev === null) return null;
  if (jev.jevCalls === 0) return { usd: 0, estimated: false };
  const usd = isPlainObject(jev.usd) ? jev.usd : {};
  const provider = finite(usd.provider);
  const estimate = finite(usd.estimate);
  if (provider === null && estimate === null) return null;
  return { usd: (provider === null ? 0 : provider) + (estimate === null ? 0 : estimate), estimated: estimate !== null };
}

function jevCostPerCompleted(rows) {
  const counted = rows.filter(isCounted);
  const completed = counted.filter((row) => row.pass === true).length;
  const costs = counted.map(jevRowCost);
  if (completed === 0 || costs.some((cost) => cost === null)) return { usd: null, estimated: false };
  return { usd: costs.reduce((sum, cost) => sum + cost.usd, 0) / completed, estimated: costs.some((cost) => cost.estimated) };
}

// The cost sentence (source 'cost'), from the autopilot campaign's counted
// rows: LLM cost per completed task for both conditions and the Jev cost of
// the fast condition, which FSB bears and which is never added to the LLM cost.
// Its id says whether any of the Jev cost is an estimate ('cost-estimated').
function costClaim(input) {
  if (!isPlainObject(input) || !isPlainObject(input.gate) || !isPlainObject(input.autopilot)) return null;
  const groups = groupRows({ autopilot: input.autopilot.runs }, input.gate);
  if (!groups.autopilotOff.some(isCounted) || !groups.autopilotOn.some(isCounted)) return null;
  const jevOn = jevCostPerCompleted(groups.autopilotOn);
  return claim(jevOn.estimated ? 'cost-estimated' : 'cost', [
    token('llmOff', llmCostPerCompleted(groups.autopilotOff), 'cost'),
    token('llmOn', llmCostPerCompleted(groups.autopilotOn), 'cost'),
    token('jevOn', jevOn.usd, 'cost'),
  ]);
}

function completionTokens(completion) {
  const ci = pairOf(completion.ci);
  return [
    token('completionDiff', completion.diff, 'completion-diff'),
    token('completionDiffLow', ci[0], 'completion-diff'),
    token('completionDiffHigh', ci[1], 'completion-diff'),
  ];
}

/**
 * The release claims for an evaluator result: the only sentences V6 copy may
 * quote. `input` (the evaluator input) supplies the rows for the cost
 * sentence; without it no cost sentence is written. The cost sentence compares
 * fast mode on with off, so it is written only when both Jev paths pass: a
 * release that ships fast mode as experimental, or disables it, quotes no
 * fast-mode cost (WR-01).
 */
export function buildClaims(result, input) {
  const claims = [];
  const jevPaths = JEV_PATHS.map((name) => result.paths[name]);
  const jevPass = jevPaths.every((entry) => entry.verdict === 'pass');
  if (jevPass) {
    const { speed, completion } = jevPaths[0].criteria;
    const ci = pairOf(speed.ci);
    claims.push(claim('jev-whole-task', [
      token('ratio', speed.estimate, 'wallMs-ratio'),
      token('ratioLow', ci[0], 'wallMs-ratio'),
      token('ratioHigh', ci[1], 'wallMs-ratio'),
      ...completionTokens(completion),
      token('onCompleted', completion.treatment.completed, 'completion-count'),
      token('onCounted', completion.treatment.counted, 'completion-count'),
      token('offCompleted', completion.control.completed, 'completion-count'),
      token('offCounted', completion.control.counted, 'completion-count'),
    ]));
  } else {
    claims.push(claim('jev-no-speedup', []));
    if (jevPaths.some((entry) => entry.verdict === 'fail' && entry.criteria.safety.status === 'fail')) claims.push(claim('jev-disabled', []));
  }

  const nonJev = result.paths[NON_JEV];
  if (nonJev.verdict === 'pass') {
    const { speed, completion } = nonJev.criteria;
    const ci = pairOf(speed.ci);
    claims.push(claim('mcp-non-jev-time', [
      token('ratio', speed.estimate, 'wallMs-ratio'),
      token('ratioLow', ci[0], 'wallMs-ratio'),
      token('ratioHigh', ci[1], 'wallMs-ratio'),
      token('bound', speed.thresholds && speed.thresholds.ciUpperAtMost, 'wallMs-ratio'),
      ...completionTokens(completion),
    ]));
    if (nonJev.faster === true) claims.push(claim('mcp-non-jev-faster', [token('ratioHigh', ci[1], 'wallMs-ratio')]));
  }

  const cost = jevPass ? costClaim(input) : null;
  if (cost) claims.push(cost);
  return claims;
}

/**
 * { ok, errors } for a claims list: exact keys, a known id, typed tokens from
 * ALLOWED_CLAIM_SOURCES whose names are exactly the template's placeholders,
 * a text equal to the template rendered from those tokens, and no
 * per-decision timing word in a text or a token name.
 */
export function checkClaims(claims, where = 'claims') {
  const errors = [];
  if (!Array.isArray(claims) || claims.length > MAX_CLAIMS) return { ok: false, errors: [`type:${where}`] };
  claims.forEach((entry, index) => {
    const at = `${where}[${index}]`;
    if (!checkKeys(entry, DECISION_KEYS.claim, at, errors)) return;
    const template = Object.prototype.hasOwnProperty.call(CLAIM_TEMPLATES, entry.id) ? CLAIM_TEMPLATES[entry.id] : null;
    if (template === null) errors.push(`claim_id:${at}.id`);
    if (typeof entry.text !== 'string') errors.push(`type:${at}.text`);
    else if (FORBIDDEN_CLAIM_TEXT.test(entry.text)) errors.push(`claim_forbidden_text:${at}.text`);
    if (!Array.isArray(entry.tokens)) {
      errors.push(`type:${at}.tokens`);
      return;
    }
    let tokensOk = true;
    entry.tokens.forEach((item, k) => {
      const tat = `${at}.tokens[${k}]`;
      if (!checkKeys(item, DECISION_KEYS.token, tat, errors)) {
        tokensOk = false;
        return;
      }
      if (typeof item.name !== 'string' || !TOKEN_NAME.test(item.name)) {
        errors.push(`type:${tat}.name`);
        tokensOk = false;
      } else if (FORBIDDEN_TOKEN_NAME.test(item.name)) {
        errors.push(`claim_forbidden_token:${tat}.name`);
        tokensOk = false;
      }
      if (!ALLOWED_CLAIM_SOURCES.includes(item.source)) {
        errors.push(`claim_source:${tat}.source`);
        tokensOk = false;
      }
      if (item.value !== null && finite(item.value) === null) {
        errors.push(`type:${tat}.value`);
        tokensOk = false;
      }
    });
    if (template === null || !tokensOk) return;
    const names = entry.tokens.map((item) => item.name);
    const expected = placeholdersOf(template);
    if (new Set(names).size !== names.length || names.length !== expected.length || !expected.every((name) => names.includes(name))) {
      errors.push(`claim_tokens:${at}.tokens`);
      return;
    }
    if (entry.text !== renderClaim(entry.id, entry.tokens)) errors.push(`claim_text:${at}.text`);
  });
  return { ok: errors.length === 0, errors };
}

// --- Building the decision ------------------------------------------------------------------------

function campaignFact(facts) {
  if (!isPlainObject(facts)) return null;
  return {
    id: stringOrNull(facts.id),
    createdAt: stringOrNull(facts.createdAt),
    gitSha: stringOrNull(facts.gitSha),
    rounds: Number.isSafeInteger(facts.rounds) ? facts.rounds : null,
  };
}

// The non-Jev path's own identity comparison (baseline against the claude
// campaign). A mismatch inherited from the autopilot sentinel
// ('identity_mismatch:sentinel.<field>') stays in the path's reasons and is
// not reported here as the path's own (IN-06).
const isSentinelDetail = (detail) => detail === 'sentinel' || detail.startsWith('sentinel.');

function identityOf(guards) {
  const mismatches = (Array.isArray(guards) ? guards : [])
    .filter((guard) => typeof guard === 'string' && guard.startsWith(IDENTITY_PREFIX))
    .map((guard) => guard.slice(IDENTITY_PREFIX.length))
    .filter((detail) => !isSentinelDetail(detail));
  return { verdict: mismatches.length ? 'inconclusive' : 'pass', mismatches };
}

function pathEntry(name, entry, action, exercise) {
  const jev = name !== NON_JEV;
  const { criteria } = entry;
  return {
    label: entry.label,
    verdict: entry.verdict,
    reasons: [...entry.reasons],
    faster: jev ? null : (typeof entry.faster === 'boolean' ? entry.faster : null),
    source: jev ? null : entry.source,
    criteria: {
      speed: { verdict: criteria.speed.status, estimate: finite(criteria.speed.estimate), ci: pairOf(criteria.speed.ci) },
      completion: { verdict: criteria.completion.status, diff: finite(criteria.completion.diff), ci: pairOf(criteria.completion.ci) },
      safety: { verdict: criteria.safety.status, reasons: [...criteria.safety.reasons] },
      exercised: jev ? { status: criteria.exercise.status, actedShare: finite(exercise && exercise.actedShare) } : null,
      identity: jev ? null : identityOf(entry.guards),
    },
    recommendation: V6_ACTIONS[action],
    v6Action: action,
  };
}

function fallbackBlock(fallback) {
  const none = { status: 'not_supplied', primaryVerdict: null, primaryReasons: [], reasons: [], campaigns: { pin: null, candidate: null } };
  if (!isPlainObject(fallback) || fallback.status === 'not_supplied') return none;
  const reasons = fallback.status === 'refused'
    ? (fallback.refusals || []).map((refusal) => `${refusal.code}:${refusal.detail}`)
    : [...(fallback.reasons || [])];
  const campaigns = isPlainObject(fallback.campaigns) ? fallback.campaigns : {};
  return {
    status: fallback.status,
    primaryVerdict: fallback.primaryVerdict,
    primaryReasons: [...(fallback.primaryReasons || [])],
    reasons,
    campaigns: { pin: campaignFact(campaigns.pin), candidate: campaignFact(campaigns.candidate) },
  };
}

function suitesBlock(suites) {
  const ran = isPlainObject(suites) && suites.ran === true;
  const results = ran && Array.isArray(suites.results)
    ? suites.results.filter(isPlainObject).map((result) => ({ command: String(result.command), exitCode: result.exitCode }))
    : [];
  return { ran, results };
}

/**
 * The decision file for an evaluator result without refusals. meta: { gate:
 * {path, sha256, gateVersion, authorDate, committerDate}, measuredSha
 * (default: the autopilot campaign's git sha), suites ({ran, results}), input
 * (the evaluator input, for the cost sentence) }.
 */
export function buildDecision(result, meta = {}) {
  if (!isPlainObject(result) || !Array.isArray(result.refusals) || result.refusals.length || !isPlainObject(result.paths)) {
    throw new Error('buildDecision needs an evaluator result without refusals');
  }
  const gate = isPlainObject(meta.gate) ? meta.gate : {};
  const actions = v6ActionsFor(Object.fromEntries(DECISION_PATHS.map((name) => [name, {
    verdict: result.paths[name].verdict,
    safetyVerdict: result.paths[name].criteria.safety.status,
  }])));
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    gate: {
      path: stringOrNull(gate.path),
      sha256: stringOrNull(gate.sha256),
      gateVersion: stringOrNull(gate.gateVersion),
      authorDate: stringOrNull(gate.authorDate),
      committerDate: stringOrNull(gate.committerDate),
    },
    measuredSha: stringOrNull(meta.measuredSha === undefined ? result.campaigns.autopilot.gitSha : meta.measuredSha),
    campaigns: Object.fromEntries(DECISION_KEYS.campaigns.map((role) => [role, campaignFact(result.campaigns[role])])),
    suites: suitesBlock(meta.suites),
    sentinel: { status: result.sentinel.status, reasons: [...result.sentinel.reasons], blocker: result.sentinel.blocker },
    paths: Object.fromEntries(DECISION_PATHS.map((name) => [name, pathEntry(name, result.paths[name], actions[name], result.exercise)])),
    fallback: fallbackBlock(result.fallback),
    claims: buildClaims(result, meta.input),
    evaluator: { iterations: result.inputs.iterations, seed: result.inputs.seed, level: result.inputs.level },
  };
}

/**
 * One line per path for the CLI and the report. A non-Jev verdict replaced by
 * the fallback reads "mcp-non-jev: <verdict> (from core-rebaseline-71;
 * primary was <primaryVerdict>)".
 */
export function describePath(decision, name) {
  const entry = decision.paths[name];
  if (name === NON_JEV && entry.source === 'fallback') {
    return `${name}: ${entry.verdict} (from ${FALLBACK_CAMPAIGN_ID}; primary was ${decision.fallback.primaryVerdict})`;
  }
  return `${name}: ${entry.verdict}`;
}

// --- Validation -------------------------------------------------------------------------------------

function checkKeys(value, keys, where, errors) {
  if (!isPlainObject(value)) {
    errors.push(`type:${where}`);
    return false;
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`extra_key:${where ? `${where}.` : ''}${key}`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`missing_key:${where ? `${where}.` : ''}${key}`);
  return true;
}

// The runs.mjs string rules, with the one exception for claim texts.
function walkStrings(value, where, errors) {
  if (typeof value === 'string') {
    const max = CLAIM_TEXT_PATH.test(where) ? MAX_CLAIM_TEXT : MAX_DECISION_STRING;
    if (value.length > max) errors.push(`string_too_long:${where}`);
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

const isNullableNumber = (value) => value === null || finite(value) !== null;
const isNullableString = (value) => value === null || typeof value === 'string';
const isIsoDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function expectStringList(value, where, errors) {
  expectType(Array.isArray(value) && value.every((item) => typeof item === 'string'), where, errors);
}

function expectPair(value, where, errors) {
  expectType(Array.isArray(value) && value.length === 2 && value.every(isNullableNumber), where, errors);
}

function validateCampaignFact(value, where, errors, nullable) {
  if (value === null && nullable) return;
  if (!checkKeys(value, DECISION_KEYS.campaign, where, errors)) return;
  for (const key of ['id', 'createdAt', 'gitSha']) expectType(isNullableString(value[key]), `${where}.${key}`, errors);
  expectType(value.rounds === null || (Number.isSafeInteger(value.rounds) && value.rounds >= 0), `${where}.rounds`, errors);
}

function validatePath(name, entry, errors) {
  const where = `paths.${name}`;
  if (!checkKeys(entry, DECISION_KEYS.path, where, errors)) return false;
  const jev = name !== NON_JEV;
  expectType(typeof entry.label === 'string' && entry.label.length > 0, `${where}.label`, errors);
  expectType(VERDICTS.includes(entry.verdict), `${where}.verdict`, errors);
  expectStringList(entry.reasons, `${where}.reasons`, errors);
  expectType(jev ? entry.faster === null : (entry.faster === null || typeof entry.faster === 'boolean'), `${where}.faster`, errors);
  expectType(jev ? entry.source === null : SOURCES.includes(entry.source), `${where}.source`, errors);
  expectType(typeof entry.recommendation === 'string', `${where}.recommendation`, errors);
  const actionKnown = Object.prototype.hasOwnProperty.call(V6_ACTIONS, entry.v6Action);
  expectType(actionKnown, `${where}.v6Action`, errors);
  if (actionKnown && entry.recommendation !== V6_ACTIONS[entry.v6Action]) errors.push(`inconsistent:${where}.recommendation`);

  const criteria = entry.criteria;
  if (!checkKeys(criteria, DECISION_KEYS.criteria, `${where}.criteria`, errors)) return false;
  const at = `${where}.criteria`;
  if (checkKeys(criteria.speed, DECISION_KEYS.speed, `${at}.speed`, errors)) {
    expectType(CRITERION_VERDICTS.includes(criteria.speed.verdict), `${at}.speed.verdict`, errors);
    expectType(isNullableNumber(criteria.speed.estimate), `${at}.speed.estimate`, errors);
    expectPair(criteria.speed.ci, `${at}.speed.ci`, errors);
  }
  if (checkKeys(criteria.completion, DECISION_KEYS.completion, `${at}.completion`, errors)) {
    expectType(CRITERION_VERDICTS.includes(criteria.completion.verdict), `${at}.completion.verdict`, errors);
    expectType(isNullableNumber(criteria.completion.diff), `${at}.completion.diff`, errors);
    expectPair(criteria.completion.ci, `${at}.completion.ci`, errors);
  }
  let safetyVerdict = null;
  if (checkKeys(criteria.safety, DECISION_KEYS.safety, `${at}.safety`, errors)) {
    expectType(CRITERION_VERDICTS.includes(criteria.safety.verdict), `${at}.safety.verdict`, errors);
    expectStringList(criteria.safety.reasons, `${at}.safety.reasons`, errors);
    safetyVerdict = criteria.safety.verdict;
  }
  if (jev) {
    if (checkKeys(criteria.exercised, DECISION_KEYS.exercised, `${at}.exercised`, errors)) {
      expectType(EXERCISE_STATUSES.includes(criteria.exercised.status), `${at}.exercised.status`, errors);
      const share = criteria.exercised.actedShare;
      expectType(share === null || (finite(share) !== null && share >= 0 && share <= 1), `${at}.exercised.actedShare`, errors);
    }
    expectType(criteria.identity === null, `${at}.identity`, errors);
  } else {
    expectType(criteria.exercised === null, `${at}.exercised`, errors);
    if (checkKeys(criteria.identity, DECISION_KEYS.identity, `${at}.identity`, errors)) {
      expectType(criteria.identity.verdict === 'pass' || criteria.identity.verdict === 'inconclusive', `${at}.identity.verdict`, errors);
      expectStringList(criteria.identity.mismatches, `${at}.identity.mismatches`, errors);
    }
  }
  return { verdict: entry.verdict, safetyVerdict, v6Action: entry.v6Action };
}

function validateFallback(fallback, nonJevSource, errors) {
  if (!checkKeys(fallback, DECISION_KEYS.fallback, 'fallback', errors)) return;
  expectType(FALLBACK_STATUSES.includes(fallback.status), 'fallback.status', errors);
  expectType(fallback.primaryVerdict === null || VERDICTS.includes(fallback.primaryVerdict), 'fallback.primaryVerdict', errors);
  expectStringList(fallback.primaryReasons, 'fallback.primaryReasons', errors);
  expectStringList(fallback.reasons, 'fallback.reasons', errors);
  if (checkKeys(fallback.campaigns, DECISION_KEYS.fallbackCampaigns, 'fallback.campaigns', errors)) {
    for (const role of DECISION_KEYS.fallbackCampaigns) validateCampaignFact(fallback.campaigns[role], `fallback.campaigns.${role}`, errors, true);
  }
  if (fallback.status === 'not_supplied') {
    const empty = fallback.primaryVerdict === null && Array.isArray(fallback.primaryReasons) && fallback.primaryReasons.length === 0
      && Array.isArray(fallback.reasons) && fallback.reasons.length === 0 && isPlainObject(fallback.campaigns)
      && fallback.campaigns.pin === null && fallback.campaigns.candidate === null;
    if (!empty) errors.push('inconsistent:fallback');
  }
  if (nonJevSource !== null && (fallback.status === 'used') !== (nonJevSource === 'fallback')) {
    errors.push('inconsistent:paths.mcp-non-jev.source');
  }
}

// The claim ids a decision's verdicts allow (WR-06), as buildClaims writes
// them: required ids must appear, and no other id may.
function claimRules(paths) {
  const jevPass = JEV_PATHS.every((name) => paths[name].verdict === 'pass');
  const jevDisabled = JEV_PATHS.some((name) => paths[name].v6Action === 'disable_jev_operator_switch');
  const nonJev = paths[NON_JEV];
  const nonJevPass = nonJev.verdict === 'pass';
  return {
    required: [
      ...(jevPass ? ['jev-whole-task'] : ['jev-no-speedup']),
      ...(jevDisabled ? ['jev-disabled'] : []),
      ...(nonJevPass ? ['mcp-non-jev-time'] : []),
      ...(nonJevPass && nonJev.faster === true ? ['mcp-non-jev-faster'] : []),
    ],
    // The cost sentence is optional (it needs the rows) and only on a Jev pass.
    optional: jevPass ? ['cost', 'cost-estimated'] : [],
  };
}

// Token name -> the criterion number it must equal, per claim id.
function criterionValues(id, paths) {
  const numbers = (entry) => {
    const { speed, completion } = entry.criteria;
    return {
      ratio: speed.estimate, ratioLow: speed.ci[0], ratioHigh: speed.ci[1],
      completionDiff: completion.diff, completionDiffLow: completion.ci[0], completionDiffHigh: completion.ci[1],
    };
  };
  if (id === 'jev-whole-task') return numbers(paths[JEV_PATHS[0]]);
  if (id === 'mcp-non-jev-time') return numbers(paths[NON_JEV]);
  if (id === 'mcp-non-jev-faster') return { ratioHigh: paths[NON_JEV].criteria.speed.ci[1] };
  return {};
}

/**
 * The claims against the verdicts (WR-06): every claim id the verdicts
 * require appears once, no claim the verdicts do not allow appears, a
 * sentence that quotes a criterion carries exactly the criterion's numbers,
 * and the two Jev paths (one comparison) carry the same speed and completion.
 * Runs only on structurally valid paths and claims.
 */
function checkClaimConsistency(decision, errors) {
  const { paths, claims } = decision;
  const { required, optional } = claimRules(paths);
  const ids = claims.map((entry) => entry.id);
  // The two cost sentences are one claim with two wordings.
  const groups = ids.map((id) => (id === 'cost-estimated' ? 'cost' : id));
  for (const id of required) if (!ids.includes(id)) errors.push(`claim_missing:claims.${id}`);
  claims.forEach((entry, index) => {
    const at = `claims[${index}]`;
    if (!required.includes(entry.id) && !optional.includes(entry.id)) errors.push(`claim_not_allowed:${at}.id`);
    else if (groups.indexOf(groups[index]) !== index) errors.push(`claim_repeated:${at}.id`);
    const expected = criterionValues(entry.id, paths);
    entry.tokens.forEach((item, k) => {
      if (Object.prototype.hasOwnProperty.call(expected, item.name) && item.value !== expected[item.name]) {
        errors.push(`claim_value:${at}.tokens[${k}].value`);
      }
    });
  });
  const [first, second] = JEV_PATHS.map((name) => paths[name].criteria);
  if (!isDeepStrictEqualJson([first.speed, first.completion], [second.speed, second.completion])) errors.push('inconsistent:paths.jev-autopilot.criteria');
}

function isDeepStrictEqualJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** { ok, errors } for a decision file; never throws, never echoes a value. */
export function validateDecision(decision) {
  const errors = [];
  if (!checkKeys(decision, DECISION_KEYS.top, '', errors)) return { ok: false, errors };
  walkStrings(decision, '', errors);
  expectType(decision.schemaVersion === DECISION_SCHEMA_VERSION, 'schemaVersion', errors);

  if (checkKeys(decision.gate, DECISION_KEYS.gate, 'gate', errors)) {
    const { gate } = decision;
    expectType(typeof gate.path === 'string' && gate.path.length > 0, 'gate.path', errors);
    expectType(typeof gate.sha256 === 'string' && HEX64.test(gate.sha256), 'gate.sha256', errors);
    expectType(typeof gate.gateVersion === 'string' && gate.gateVersion.length > 0, 'gate.gateVersion', errors);
    expectType(isIsoDate(gate.authorDate), 'gate.authorDate', errors);
    expectType(isIsoDate(gate.committerDate), 'gate.committerDate', errors);
  }
  expectType(typeof decision.measuredSha === 'string' && GIT_SHA.test(decision.measuredSha), 'measuredSha', errors);

  if (checkKeys(decision.campaigns, DECISION_KEYS.campaigns, 'campaigns', errors)) {
    for (const role of DECISION_KEYS.campaigns) validateCampaignFact(decision.campaigns[role], `campaigns.${role}`, errors, false);
  }

  if (checkKeys(decision.suites, DECISION_KEYS.suites, 'suites', errors)) {
    const { suites } = decision;
    expectType(typeof suites.ran === 'boolean', 'suites.ran', errors);
    if (!Array.isArray(suites.results)) {
      errors.push('type:suites.results');
    } else {
      suites.results.forEach((result, index) => {
        const where = `suites.results[${index}]`;
        if (!checkKeys(result, DECISION_KEYS.suiteResult, where, errors)) return;
        expectType(typeof result.command === 'string' && result.command.length > 0, `${where}.command`, errors);
        expectType(Number.isSafeInteger(result.exitCode), `${where}.exitCode`, errors);
      });
      if (suites.ran === false && suites.results.length) errors.push('inconsistent:suites.results');
    }
  }

  if (checkKeys(decision.sentinel, DECISION_KEYS.sentinel, 'sentinel', errors)) {
    expectType(SENTINEL_STATUSES.includes(decision.sentinel.status), 'sentinel.status', errors);
    expectStringList(decision.sentinel.reasons, 'sentinel.reasons', errors);
    expectType(isNullableString(decision.sentinel.blocker), 'sentinel.blocker', errors);
  }

  let nonJevSource = null;
  let pathsValid = false;
  if (checkKeys(decision.paths, DECISION_PATHS, 'paths', errors)) {
    const facts = {};
    const before = errors.length;
    for (const name of DECISION_PATHS) {
      if (decision.paths[name] === undefined) continue;
      const fact = validatePath(name, decision.paths[name], errors);
      if (fact) facts[name] = fact;
    }
    if (DECISION_PATHS.every((name) => facts[name])) {
      pathsValid = errors.length === before;
      const expected = v6ActionsFor(facts);
      for (const name of DECISION_PATHS) {
        if (Object.prototype.hasOwnProperty.call(V6_ACTIONS, facts[name].v6Action) && facts[name].v6Action !== expected[name]) {
          errors.push(`inconsistent:paths.${name}.v6Action`);
        }
      }
    }
    if (isPlainObject(decision.paths[NON_JEV]) && SOURCES.includes(decision.paths[NON_JEV].source)) nonJevSource = decision.paths[NON_JEV].source;
  }

  validateFallback(decision.fallback, nonJevSource, errors);
  const claimCheck = checkClaims(decision.claims);
  errors.push(...claimCheck.errors);
  if (pathsValid && claimCheck.ok) checkClaimConsistency(decision, errors);

  if (checkKeys(decision.evaluator, DECISION_KEYS.evaluator, 'evaluator', errors)) {
    const { evaluator } = decision;
    expectType(Number.isSafeInteger(evaluator.iterations) && evaluator.iterations >= 1, 'evaluator.iterations', errors);
    expectType(Number.isSafeInteger(evaluator.seed), 'evaluator.seed', errors);
    expectType(finite(evaluator.level) !== null && evaluator.level > 0 && evaluator.level < 1, 'evaluator.level', errors);
  }
  return { ok: errors.length === 0, errors };
}
