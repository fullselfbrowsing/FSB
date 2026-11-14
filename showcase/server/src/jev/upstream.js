'use strict';

/**
 * Phase 67 (JEV-02, JEV-04, JEV-07) -- the single-attempt Jev upstream client.
 *
 * callUpstream() makes exactly one POST to the configured upstream (TypeSafe
 * direct, OpenRouter, or a loopback fake in tests) and resolves to a typed
 * result. It never rejects.
 *
 * - D-13: one attempt, an AbortController deadline (config.upstreamTimeoutMs)
 *   and no retry, whatever the status. Only Authorization, Content-Type and
 *   Accept are sent; no other header (opt-in or otherwise) is ever set.
 * - D-14: answers are validated strictly and looked up by key. Anything that
 *   fails becomes invalid_response. An HTTP 200 carrying an `error` object is
 *   an upstream failure, never a success.
 * - D-16: every outcome maps to exactly one reason from the locked gateway
 *   enum (CONTRACT.GATEWAY_FALLBACK_REASONS).
 * - D-22: upstream bodies are reduced to a reason. A bounded slice is read
 *   only to detect an error envelope or an unknown-model message, then
 *   dropped. Nothing here logs, and no error object is ever inspected.
 * - D-23: usage and cost carry provider/estimate/unavailable sources with null,
 *   never 0, for a missing value. The served model is kept verbatim, unless
 *   it carries the credential (or a fragment of it) or any secret shape: an
 *   upstream that echoes the Authorization value as `model` must not leak it
 *   into the response, the ledger or the log line. Such a model becomes null,
 *   and an otherwise valid answer becomes invalid_response.
 * - D-25: an unknown or retired model gives unavailable_model. The configured
 *   pin is always the model sent; an alias is never substituted.
 */

const { CONTRACT } = require('./contract');
const { matchesSecret } = require('./scrubber');

const ERROR_SLICE_BYTES = 4096;
const MAX_OK_BODY_BYTES = 1048576;
const PROBABILITY_SUM_TOLERANCE = 0.02;

const DEADLINE = Symbol('jev-upstream-deadline');

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isPlainObjectLike(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

// Fresh regexes per call: no shared lastIndex state.
function servedModelPattern() {
  return /^[\x21-\x7E]{1,128}$/;
}

/** The top-level `model` when it is a printable string of 1..128 characters, else null. */
function servedModelOf(parsed) {
  if (!isPlainObject(parsed) || !hasOwn(parsed, 'model')) return null;
  const model = parsed.model;
  return typeof model === 'string' && servedModelPattern().test(model) ? model : null;
}

// The shortest credential loadJevConfig accepts; a shorter served model is
// never treated as a fragment of the key.
const MIN_CREDENTIAL_FRAGMENT_CHARS = 8;

/**
 * The served model when it is safe to return, store and log, else null. A
 * model that contains the credential, is a fragment of it (for example a
 * long key echoed only up to the 128-character model cap) or matches any
 * scrubber secret shape is refused (D-22).
 */
function safeServedModel(model, apiKey) {
  if (typeof model !== 'string' || !servedModelPattern().test(model)) return null;
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    if (model.includes(apiKey)) return null;
    if (model.length >= MIN_CREDENTIAL_FRAGMENT_CHARS && apiKey.includes(model)) return null;
  }
  if (matchesSecret(model)) return null;
  return model;
}

// ---------------------------------------------------------------------------
// Classification (67-RESEARCH Pattern 5, within the locked D-16 enum)
// ---------------------------------------------------------------------------

function extractMessage(parsed) {
  if (!isPlainObject(parsed)) return null;
  // The parsed upstream envelope's `error` field, never a thrown Error.
  const envelope = parsed.error;
  if (isPlainObject(envelope) && typeof envelope.message === 'string') return envelope.message;
  if (typeof envelope === 'string') return envelope;
  if (typeof parsed.message === 'string') return parsed.message;
  if (typeof parsed.detail === 'string') return parsed.detail;
  return null;
}

/**
 * True when an error slice says the requested model is unknown or retired.
 * A heuristic (research assumptions A1/A2); V2 confirms the real wording.
 */
function isUnknownModelMessage(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  let message = text;
  try {
    const extracted = extractMessage(JSON.parse(text));
    if (typeof extracted === 'string') message = extracted;
  } catch (_ignored) {
    // Not JSON (or a truncated slice): use the raw slice.
  }
  return /\bmodel\b/i.test(message)
    && /unknown|not (a )?valid|not found|does not exist|retired|deprecated|unavailable|no endpoints/i.test(message);
}

/**
 * Map an upstream HTTP status (or an OpenRouter error.code) to a D-16 reason.
 * The slice is consulted only for 400 and 404, to spot an unknown model.
 */
function classifyStatus(status, textSlice) {
  if (!Number.isSafeInteger(status)) return 'upstream_error';
  if (status === 400 || status === 404) {
    return isUnknownModelMessage(textSlice) ? 'unavailable_model' : 'upstream_rejected';
  }
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 402) return 'upstream_billing';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 529) return 'upstream_overloaded';
  if (status >= 400 && status <= 499) return 'upstream_rejected';
  return 'upstream_error';
}

// ---------------------------------------------------------------------------
// Answer validation (D-14, 67-RESEARCH Pattern 6)
// ---------------------------------------------------------------------------

function normalizeChoice(question, answer) {
  if (!isPlainObject(question.criteria)) return null;
  const offered = Object.keys(question.criteria);
  if (offered.length === 0) return null;
  const choice = answer.choice;
  if (typeof choice !== 'string' || !offered.includes(choice)) return null;
  if (!isUnit(answer.confidence)) return null;
  const probabilities = answer.probabilities;
  if (!isPlainObject(probabilities)) return null;
  if (Object.keys(probabilities).length !== offered.length) return null;
  let sum = 0;
  let max = -Infinity;
  const normalized = {};
  for (const key of offered) {
    if (!hasOwn(probabilities, key)) return null;
    const value = probabilities[key];
    if (!isUnit(value)) return null;
    sum += value;
    if (value > max) max = value;
    normalized[key] = value;
  }
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) return null;
  // Argmax; a tie for the maximum passes.
  if (normalized[choice] < max) return null;
  return { type: 'choice', choice, confidence: answer.confidence, probabilities: normalized };
}

/**
 * Validate a parsed upstream body against the asked questions.
 *
 * @returns {{ok: true, servedModel: string, answers: object, rawUsage: *}
 *   | {ok: false, servedModel: string|null}}
 *   answers hold exactly the asked keys, each normalized to
 *   {type:'choice', choice, confidence, probabilities} or {type:'noul', noul}.
 *   Extra top-level keys, unasked answers and extra answer fields are dropped.
 */
function validateAnswers(questions, parsed) {
  const servedModel = servedModelOf(parsed);
  const fail = { ok: false, servedModel };
  if (servedModel === null || !isPlainObject(parsed)) return fail;
  if (!isPlainObject(questions)) return fail;
  const answers = parsed.answers;
  if (!isPlainObject(answers)) return fail;

  const normalized = {};
  for (const key of Object.keys(questions)) {
    const question = questions[key];
    if (!isPlainObject(question) || !hasOwn(answers, key)) return fail;
    const answer = answers[key];
    if (!isPlainObject(answer) || answer.type !== question.type) return fail;
    if (question.type === 'choice') {
      const choice = normalizeChoice(question, answer);
      if (choice === null) return fail;
      normalized[key] = choice;
    } else if (question.type === 'noul') {
      if (!isUnit(answer.noul)) return fail;
      normalized[key] = { type: 'noul', noul: answer.noul };
    } else {
      // The instrument asks only Choice and Noul; anything else fails closed.
      return fail;
    }
  }
  return { ok: true, servedModel, answers: normalized, rawUsage: parsed.usage };
}

// ---------------------------------------------------------------------------
// Usage and cost (D-23)
// ---------------------------------------------------------------------------

/**
 * Usage is 'provider' when usage.input_tokens is a non-negative safe integer,
 * else 'unavailable'. Cost is 'provider' when usage.cost is a finite USD
 * value >= 0, else an 'estimate' of input tokens x price / 1e6 (output is
 * free), else 'unavailable'. A missing value is null, never 0.
 */
function computeUsageAndCost(rawUsage, inputUsdPerMtok) {
  let inputTokens = null;
  let providerCost = null;
  if (isPlainObject(rawUsage)) {
    const tokens = rawUsage.input_tokens;
    if (Number.isSafeInteger(tokens) && tokens >= 0) inputTokens = tokens;
    const cost = rawUsage.cost;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) providerCost = cost;
  }
  const usage = inputTokens === null
    ? { inputTokens: null, source: 'unavailable' }
    : { inputTokens, source: 'provider' };
  let cost;
  if (providerCost !== null) {
    cost = { usd: providerCost, source: 'provider' };
  } else if (inputTokens !== null && typeof inputUsdPerMtok === 'number' && Number.isFinite(inputUsdPerMtok)
    && inputUsdPerMtok > 0) {
    cost = { usd: inputTokens * inputUsdPerMtok / 1e6, source: 'estimate' };
  } else {
    cost = { usd: null, source: 'unavailable' };
  }
  return { usage, cost };
}

// ---------------------------------------------------------------------------
// Bounded body reads
// ---------------------------------------------------------------------------

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Read at most maxBytes of a fetch response body. Uses the body stream when
 * there is one (cancelling it past the cap), else res.text() then truncation.
 * Any read failure yields an empty slice; the failure itself is discarded.
 *
 * @returns {Promise<{text: string, truncated: boolean}>}
 */
async function readBounded(res, maxBytes) {
  const empty = { text: '', truncated: false };
  try {
    if (!res || typeof res !== 'object') return empty;
    const stream = res.body;
    if (stream && typeof stream.getReader === 'function') {
      const reader = stream.getReader();
      const chunks = [];
      let total = 0;
      let truncated = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          let chunk = new Uint8Array(0);
          if (value instanceof Uint8Array) chunk = value;
          else if (typeof value === 'string') chunk = Buffer.from(value, 'utf8');
          if (total + chunk.byteLength > maxBytes) {
            chunks.push(chunk.subarray(0, maxBytes - total));
            total = maxBytes;
            truncated = true;
            break;
          }
          chunks.push(chunk);
          total += chunk.byteLength;
        }
      } finally {
        if (truncated) {
          try { await reader.cancel(); } catch (_ignored) { /* socket cleanup only */ }
        }
      }
      return { text: decodeUtf8(Buffer.concat(chunks)), truncated };
    }
    if (typeof res.text === 'function') {
      const text = await res.text();
      if (typeof text !== 'string') return empty;
      const bytes = Buffer.from(text, 'utf8');
      if (bytes.length > maxBytes) return { text: decodeUtf8(bytes.subarray(0, maxBytes)), truncated: true };
      return { text, truncated: false };
    }
    return empty;
  } catch (_ignored) {
    return empty;
  }
}

function discardBody(res) {
  try {
    const stream = res && res.body;
    if (stream && typeof stream.cancel === 'function') {
      const pending = stream.cancel();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    }
  } catch (_ignored) {
    // Socket cleanup only.
  }
}

// ---------------------------------------------------------------------------
// The single upstream attempt
// ---------------------------------------------------------------------------

function readClock(now) {
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch (_ignored) {
    return null;
  }
}

function hasUsableConfig(config) {
  return isPlainObjectLike(config)
    && config.status === 'ok'
    && typeof config.upstreamUrl === 'string'
    && typeof config.model === 'string'
    && typeof config.apiKey === 'string'
    && config.apiKey.length > 0
    && Number.isSafeInteger(config.upstreamTimeoutMs)
    && config.upstreamTimeoutMs > 0;
}

/**
 * Make one upstream attempt.
 *
 * @param {{config: object, body: {state: *, questions: object}, fetchImpl?: Function, now?: Function}} args
 *   config comes from loadJevConfig (status 'ok'); body is the instrument's
 *   upstream body. The wire body is exactly {model: config.model, state, questions}.
 * @returns {Promise<
 *   {ok: true, servedModel: string, answers: object, usage: {inputTokens: number|null, source: string},
 *    cost: {usd: number|null, source: string}, upstreamStatus: number, upstreamLatencyMs: number|null}
 *   | {ok: false, reason: string, servedModel: string|null, upstreamStatus: number|null,
 *    upstreamLatencyMs: number|null}>} never rejects.
 */
async function callUpstream({ config, body, fetchImpl, now = Date.now } = {}) {
  const startedAt = readClock(now);
  const latency = () => {
    const endedAt = readClock(now);
    if (startedAt === null || endedAt === null) return null;
    return Math.max(0, Math.round(endedAt - startedAt));
  };
  // Every fallback carries a locked gateway reason (D-16); anything else would
  // be a bug here, reported as server_error rather than leaked.
  const fallback = (reason, upstreamStatus = null, servedModel = null) => ({
    ok: false,
    reason: CONTRACT.GATEWAY_FALLBACK_REASONS.includes(reason) ? reason : 'server_error',
    servedModel,
    upstreamStatus,
    upstreamLatencyMs: latency(),
  });

  let timer = null;
  try {
    if (!hasUsableConfig(config)) return fallback('not_configured');
    if (!isPlainObject(body) || !isPlainObject(body.questions)) return fallback('server_error');

    let payload;
    try {
      payload = JSON.stringify({ model: config.model, state: body.state, questions: body.questions });
    } catch (_ignored) {
      return fallback('server_error');
    }
    if (typeof payload !== 'string') return fallback('server_error');

    const headers = {
      Authorization: 'Bearer ' + config.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const doFetch = fetchImpl === undefined ? globalThis.fetch : fetchImpl;

    const controller = new AbortController();
    let deadlineHit = false;
    let resolveDeadline;
    const deadline = new Promise((resolve) => { resolveDeadline = resolve; });
    timer = setTimeout(() => {
      deadlineHit = true;
      try { controller.abort(); } catch (_ignored) { /* nothing to clean up */ }
      resolveDeadline(DEADLINE);
    }, config.upstreamTimeoutMs);

    // One attempt. A synchronous throw, a rejection and a deadline all land here.
    let res;
    try {
      const attempt = Promise.resolve().then(() => doFetch(config.upstreamUrl, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
        redirect: 'error',
      }));
      res = await Promise.race([attempt, deadline]);
    } catch (_ignored) {
      return fallback(deadlineHit ? 'timeout' : 'upstream_error');
    }
    if (res === DEADLINE || deadlineHit) {
      if (res !== DEADLINE) discardBody(res);
      return fallback('timeout');
    }

    let status;
    try {
      status = res && typeof res === 'object' ? res.status : undefined;
    } catch (_ignored) {
      status = undefined;
    }
    if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
      discardBody(res);
      return fallback('upstream_error');
    }

    if (status !== 200) {
      // A bounded slice, used only for the unknown-model check, then dropped.
      const slice = await Promise.race([readBounded(res, ERROR_SLICE_BYTES), deadline]);
      const text = slice === DEADLINE ? '' : slice.text;
      return fallback(classifyStatus(status, text), status);
    }

    const read = await Promise.race([readBounded(res, MAX_OK_BODY_BYTES), deadline]);
    if (read === DEADLINE || deadlineHit) return fallback('timeout', status);
    if (read.truncated) return fallback('invalid_response', status);

    let parsed;
    try {
      parsed = JSON.parse(read.text);
    } catch (_ignored) {
      return fallback('invalid_response', status);
    }

    // OpenRouter can report a provider failure as HTTP 200 with an `error`
    // object. Any error envelope is a failure, classified by its numeric code.
    if (isPlainObject(parsed) && hasOwn(parsed, 'error') && parsed.error !== null && parsed.error !== undefined) {
      const envelope = parsed.error;
      const code = isPlainObject(envelope) ? envelope.code : undefined;
      let message = '';
      if (isPlainObject(envelope) && typeof envelope.message === 'string') message = envelope.message.slice(0, ERROR_SLICE_BYTES);
      else if (typeof envelope === 'string') message = envelope.slice(0, ERROR_SLICE_BYTES);
      const reason = Number.isSafeInteger(code) ? classifyStatus(code, message) : 'upstream_error';
      return fallback(reason, status, safeServedModel(servedModelOf(parsed), config.apiKey));
    }

    const validated = validateAnswers(body.questions, parsed);
    const servedModel = safeServedModel(validated.servedModel, config.apiKey);
    if (!validated.ok) return fallback('invalid_response', status, servedModel);
    // A valid answer whose model carries the credential or a secret shape is
    // still refused: an ok result always names a safe served model.
    if (servedModel === null) return fallback('invalid_response', status);

    const { usage, cost } = computeUsageAndCost(validated.rawUsage, config.inputUsdPerMtok);
    return {
      ok: true,
      servedModel,
      answers: validated.answers,
      usage,
      cost,
      upstreamStatus: status,
      upstreamLatencyMs: latency(),
    };
  } catch (_ignored) {
    return fallback('server_error');
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

module.exports = {
  callUpstream,
  classifyStatus,
  isUnknownModelMessage,
  validateAnswers,
  computeUsageAndCost,
  readBounded,
  ERROR_SLICE_BYTES,
  MAX_OK_BODY_BYTES,
};
