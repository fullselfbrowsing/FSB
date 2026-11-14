/**
 * Phase 67 / JEV-01..04, JEV-07 -- hosted Jev decision gateway router.
 *
 * POST /api/jev/decide is PUBLIC (D-07, D-08): no auth middleware, no hash-key
 * lookup and no client-address read of any kind. The optional X-FSB-Hash-Key
 * header is attribution only; the one thing kept is whether a well-formed key
 * was present. Abuse limits are global: the schema, the 48 KB parser, the
 * instrument byte budget, a fleet-wide daily spend ceiling, a no-queue
 * semaphore and the operator switch.
 *
 * Pipeline, in order (D-06, D-12, D-13, D-16):
 *   1. configGate      disabled / not_configured -> 503, before any body parsing
 *   2. express.json    48 KB, strict; parser errors -> 413 payload_too_large or
 *                      400 invalid_request in the router-local error handler
 *   3. validateRequest exact-key -> 400 invalid_request / sensitive_goal
 *   4. instrument      byte budget -> 413 payload_too_large
 *   5. spend ceiling   -> 503 spend_cap_reached (UTC day, reseeded from the ledger)
 *   6. semaphore       no queue -> 503 busy
 *   7. one upstream attempt -> 502 / 504 typed fallbacks, or
 *   8. calibration + the exact D-15 ok body -> 200
 *
 * Ledger policy (Pitfall 13, Pitfall 9, D-24): a per-decision row and one
 * allowlisted log line exist for every request that reached the upstream
 * attempt and for no other request. decisionId is drawn as the first statement
 * after the slot is acquired. Every attempt passes its spend accrual (capUsd)
 * to its own recordDecision call, so jev_daily.cap_accrued_usd always matches
 * the in-memory accumulator and a same-day restart reseeds the ceiling. Every
 * refusal before the attempt only bumps its bounded (UTC day, outcome)
 * counter through recordAggregateOnly.
 *
 * Crash safety (Pattern 2, Pattern 3, Pitfalls 1-3): the async handler is one
 * try/catch/finally whose catch takes exactly one of three branches keyed on
 * upstreamAttempted and ledgerWritten, inside an inner try that swallows
 * silently. Every write to the response goes through respond(), which does
 * nothing once headers are out. The router-local error handler maps body
 * parser failures by their type and status only, never reads the error's
 * text or attached request body, never forwards to the app's generic error
 * handler and never throws. Logs are fixed strings plus formatDecisionLog.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');

const { CONTRACT } = require('../jev/contract');
const { validateRequest } = require('../jev/validator');
const { INSTRUMENT_VERSION, INSTRUMENT_HASH, buildUpstreamBody } = require('../jev/instrument');
const { loadProfiles, selectProfile, applyCalibration } = require('../jev/calibration');
const { callUpstream } = require('../jev/upstream');
const {
  recordDecision,
  recordAggregateOnly,
  todaySpendUsd,
  dayUtcKey,
  formatDecisionLog,
  LEDGER_OUTCOMES,
} = require('../jev/ledger');
const { isValidHashKeyFormat } = require('../utils/hash');

// Body-parser error types that mean "the request body is not usable JSON".
const PARSER_ERROR_TYPES = Object.freeze([
  'entity.parse.failed',
  'encoding.unsupported',
  'charset.unsupported',
  'request.aborted',
  'request.size.invalid',
  'stream.encoding.set',
]);

const LOG_LEDGER_FAILED = '[jev] ledger write failed';
const LOG_SPEND_SEED_FAILED = '[jev] spend seed failed';

/** In-process, fleet-wide (single Fly machine) semaphore with no queue (Pattern 4). */
function createSemaphore(max) {
  let inFlight = 0;
  return {
    tryAcquire() {
      if (inFlight >= max) return false;
      inFlight += 1;
      return true;
    },
    release() {
      if (inFlight > 0) inFlight -= 1;
    },
    get inFlight() {
      return inFlight;
    },
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPrintableToken(value, max) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max && /^[\x21-\x7E]+$/.test(value);
}

function isHttpStatus(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= 599;
}

/** True when the frozen config can serve decisions (D-05). */
function isServable(config) {
  return config !== null
    && typeof config === 'object'
    && config.status === 'ok'
    && typeof config.model === 'string'
    && config.model.length > 0
    && isFiniteNumber(config.inputUsdPerMtok)
    && config.inputUsdPerMtok > 0
    && isFiniteNumber(config.dailyUsdCap)
    && config.dailyUsdCap > 0
    && Number.isSafeInteger(config.maxConcurrency)
    && config.maxConcurrency > 0;
}

/**
 * Build the /api/jev router.
 *
 * @param {object} options
 * @param {object} options.db better-sqlite3 instance (ledger and daily aggregate)
 * @param {object} options.config frozen loadJevConfig result
 * @param {Function} [options.fetchImpl] passed to callUpstream
 * @param {Function} [options.now] clock in ms (default Date.now)
 * @param {object} [options.log] logger with log/warn (default console)
 * @param {Array} [options.profiles] calibration profiles (default loadProfiles()),
 *   loaded once at factory time (a new profile file needs a restart, which a
 *   Fly deploy does) and selected per request after the upstream attempt
 * @param {Function} [options.randomUUID] decisionId source
 * @param {number} [options.upstreamByteBudget] instrument byte budget
 * @returns {express.Router}
 */
function createJevRouter({
  db,
  config,
  fetchImpl,
  now = Date.now,
  log = console,
  profiles = loadProfiles(),
  randomUUID = crypto.randomUUID,
  upstreamByteBudget = CONTRACT.BUDGETS.upstreamByteBudget,
} = {}) {
  const router = express.Router();
  const servable = isServable(config);
  const semaphore = createSemaphore(servable ? config.maxConcurrency : 1);
  const bodyParser = express.json({ limit: CONTRACT.BUDGETS.bodyLimitBytes, strict: true });

  // The fleet-wide daily spend accumulator (D-06, Pitfall 9). Seeded per UTC
  // day from the ledger's cap accrual, then moved by every upstream attempt.
  // A failed seed is never cached as final: the day keeps counting its own
  // accruals in memory and every later request retries the seed, so a
  // transient ledger fault after a restart cannot forget what the previous
  // process already spent that day. A ledger failure still never fails a
  // decision (67-09).
  let spend = { dayUtc: null, usd: 0, seeded: false };

  function clock() {
    try {
      const value = now();
      if (isFiniteNumber(value)) return value;
    } catch (_ignored) {
      // A broken clock falls back to the wall clock.
    }
    return Date.now();
  }

  function elapsedSince(startedAt) {
    const value = Math.round(clock() - startedAt);
    return isFiniteNumber(value) && value > 0 ? value : 0;
  }

  function safeLog(method, line) {
    try {
      if (log && typeof log[method] === 'function') log[method](line);
    } catch (_ignored) {
      // A broken logger never breaks a decision.
    }
  }

  function spendFor(dayUtc) {
    if (spend.dayUtc !== dayUtc) spend = { dayUtc, usd: 0, seeded: false };
    if (!spend.seeded) {
      let seeded;
      try {
        seeded = todaySpendUsd(db, dayUtc);
      } catch (_ignored) {
        // Not cached: the next request retries the seed.
        safeLog('warn', LOG_SPEND_SEED_FAILED);
        return spend;
      }
      // spend.usd holds only accruals made while the seed was unreadable; they
      // are added, not max()ed, so an accrual whose ledger write also failed is
      // never lost (one that was written is at worst counted twice, which only
      // reaches the ceiling sooner).
      if (isFiniteNumber(seeded) && seeded > 0) spend.usd += seeded;
      spend.seeded = true;
    }
    return spend;
  }

  function accrue(dayUtc, usd) {
    // An accrual whose day the accumulator already left belongs to that day's
    // ledger row only; it never inflates the new day.
    if (spend.dayUtc === dayUtc && isFiniteNumber(usd) && usd > 0) spend.usd += usd;
  }

  /** The only code that writes to the response. Sends nothing once headers are out. */
  function respond(res, status, body) {
    if (res.headersSent) return false;
    res.set('Cache-Control', 'no-store');
    res.status(status).json(body);
    return true;
  }

  /** The exact D-15 fallback body; httpStatus equals this response's status. */
  function fallbackBody(reason, status, servedModel, latencyMs) {
    return {
      ok: false,
      fallback: reason,
      servedModel: isPrintableToken(servedModel, 128) ? servedModel : null,
      httpStatus: status,
      latencyMs,
    };
  }

  function statusFor(reason) {
    const status = CONTRACT.HTTP_STATUS_BY_REASON[reason];
    return isHttpStatus(status) ? status : 500;
  }

  /**
   * Every response sent before the upstream attempt: one bounded aggregate
   * counter and the typed fallback. Never a ledger row, never a log line
   * (except the fixed ledger-failure line).
   */
  function refuse(res, reason, startedAt, statusOverride) {
    if (res.headersSent) return false;
    const status = statusOverride === undefined ? statusFor(reason) : statusOverride;
    try {
      recordAggregateOnly(db, { dayUtc: dayUtcKey(startedAt), outcome: reason });
    } catch (_ignored) {
      safeLog('warn', LOG_LEDGER_FAILED);
    }
    return respond(res, status, fallbackBody(reason, status, null, elapsedSince(startedAt)));
  }

  // 1. Operator switch and config: answered before any body parsing.
  function configGate(req, res, next) {
    const startedAt = clock();
    try {
      if (servable) {
        next();
        return;
      }
      const reason = config !== null && typeof config === 'object' && config.status === 'disabled' ? 'disabled' : 'not_configured';
      refuse(res, reason, startedAt);
    } catch (_ignored) {
      try {
        refuse(res, 'server_error', startedAt);
      } catch (_swallowed) {
        // Nothing more can be done for this response.
      }
    }
  }

  async function decide(req, res) {
    const startedAt = clock();
    let acquired = false;
    let upstreamAttempted = false;
    let ledgerWritten = false;
    let accrued = false;
    let capUsd = 0;
    let dayUtc = null;
    let request = null;
    let built = null;
    let upstream = null;
    let decisionId = null;
    let hashKeyPresent = false;

    function baseRow(outcome) {
      return {
        decisionId,
        createdAtMs: Math.floor(startedAt),
        outcome,
        instrumentVersion: INSTRUMENT_VERSION,
        kinds: request.kinds,
        elementCount: request.elements.length,
        requestBytes: built.bytes,
        hashKeyPresent,
      };
    }

    /** Exactly one ledger row (and one log line) per upstream attempt. */
    function writeLedger(row, cap) {
      ledgerWritten = true;
      try {
        recordDecision(db, row, { capUsd: cap });
      } catch (_ignored) {
        safeLog('warn', LOG_LEDGER_FAILED);
      }
      safeLog('log', formatDecisionLog(row));
    }

    try {
      hashKeyPresent = isValidHashKeyFormat(req.get('X-FSB-Hash-Key'));

      // 3. Exact-key validation (D-11, D-19).
      const verdict = validateRequest(req.body);
      if (!verdict.ok) {
        refuse(res, verdict.reason, startedAt);
        return;
      }
      request = verdict.request;

      // 4. The server-owned instrument within the byte budget (D-10, D-12).
      built = buildUpstreamBody(request, { model: config.model, byteBudget: upstreamByteBudget });
      if (!built.ok) {
        refuse(res, 'payload_too_large', startedAt);
        return;
      }

      // 5. The fleet-wide daily spend ceiling (D-06).
      dayUtc = dayUtcKey(startedAt);
      if (spendFor(dayUtc).usd >= config.dailyUsdCap) {
        refuse(res, 'spend_cap_reached', startedAt);
        return;
      }

      // 6. No-queue concurrency cap (D-13).
      acquired = semaphore.tryAcquire();
      if (!acquired) {
        refuse(res, 'busy', startedAt);
        return;
      }
      decisionId = randomUUID();

      // 7. Exactly one upstream attempt. From here on the attempt is recorded
      //    once, whatever happens. Its upper bound on cost is the request bytes
      //    times the input price (bytes bound tokens).
      capUsd = built.bytes * config.inputUsdPerMtok / 1e6;
      upstreamAttempted = true;
      upstream = await callUpstream({ config, body: built.body, fetchImpl, now });

      if (upstream.ok === true && isFiniteNumber(upstream.cost.usd) && upstream.cost.usd > 0) capUsd = upstream.cost.usd;
      accrue(dayUtc, capUsd);
      accrued = true;

      if (upstream.ok !== true) {
        const reason = upstream.reason !== 'ok' && LEDGER_OUTCOMES.includes(upstream.reason) ? upstream.reason : 'server_error';
        const status = statusFor(reason);
        const latencyMs = elapsedSince(startedAt);
        writeLedger(Object.assign(baseRow(reason), {
          servedModel: isPrintableToken(upstream.servedModel, 128) ? upstream.servedModel : null,
          calibrationStatus: null,
          inputTokens: null,
          usageSource: 'unavailable',
          costUsd: null,
          costSource: 'unavailable',
          upstreamLatencyMs: upstream.upstreamLatencyMs,
          gatewayLatencyMs: latencyMs,
          upstreamStatus: upstream.upstreamStatus,
        }), capUsd);
        respond(res, status, fallbackBody(reason, status, upstream.servedModel, latencyMs));
        return;
      }

      // 8. Calibration, per request. A fault here reaches the outer catch
      //    (the 67-03 throw contract): there is no local fallback.
      const profile = selectProfile(profiles, { model: config.model, instrumentHash: INSTRUMENT_HASH });
      const calibrated = applyCalibration({
        profile,
        configuredModel: config.model,
        servedModel: upstream.servedModel,
        answers: upstream.answers,
        kinds: request.kinds,
      });

      const latencyMs = elapsedSince(startedAt);
      const body = {
        ok: true,
        decisionId,
        instrumentVersion: INSTRUMENT_VERSION,
        servedModel: upstream.servedModel,
        calibration: { status: calibrated.calibration.status, profileId: calibrated.calibration.profileId },
        decisions: calibrated.decisions,
        usage: { inputTokens: upstream.usage.inputTokens, source: upstream.usage.source },
        cost: { usd: upstream.cost.usd, source: upstream.cost.source },
        latencyMs,
      };

      writeLedger(Object.assign(baseRow('ok'), {
        servedModel: upstream.servedModel,
        calibrationStatus: calibrated.calibration.status,
        inputTokens: upstream.usage.inputTokens,
        usageSource: upstream.usage.source,
        costUsd: upstream.cost.usd,
        costSource: upstream.cost.source,
        upstreamLatencyMs: upstream.upstreamLatencyMs,
        gatewayLatencyMs: latencyMs,
        upstreamStatus: upstream.upstreamStatus,
      }), capUsd);
      respond(res, 200, body);
    } catch (_fault) {
      try {
        if (!upstreamAttempted) {
          // (a) Before the upstream attempt: nothing was spent.
          refuse(res, 'server_error', startedAt);
        } else if (!ledgerWritten) {
          // (b) After the attempt, before its row: record it once, with its accrual.
          if (!accrued) {
            accrue(dayUtc, capUsd);
            accrued = true;
          }
          const returned = upstream !== null && typeof upstream === 'object';
          const okResult = returned && upstream.ok === true;
          const usage = okResult && upstream.usage !== null && typeof upstream.usage === 'object' ? upstream.usage : null;
          const cost = okResult && upstream.cost !== null && typeof upstream.cost === 'object' ? upstream.cost : null;
          const latencyMs = elapsedSince(startedAt);
          writeLedger(Object.assign(baseRow('server_error'), {
            servedModel: returned && isPrintableToken(upstream.servedModel, 128) ? upstream.servedModel : null,
            calibrationStatus: null,
            inputTokens: usage ? usage.inputTokens : null,
            usageSource: usage ? usage.source : 'unavailable',
            costUsd: cost ? cost.usd : null,
            costSource: cost ? cost.source : 'unavailable',
            upstreamLatencyMs: returned && isFiniteNumber(upstream.upstreamLatencyMs) ? upstream.upstreamLatencyMs : null,
            gatewayLatencyMs: latencyMs,
            upstreamStatus: returned && isHttpStatus(upstream.upstreamStatus) ? upstream.upstreamStatus : null,
          }), capUsd);
          respond(res, 500, fallbackBody('server_error', 500, returned ? upstream.servedModel : null, latencyMs));
        } else {
          // (c) The attempt is already recorded once: only answer, if still possible.
          respond(res, 500, fallbackBody('server_error', 500, null, elapsedSince(startedAt)));
        }
      } catch (_swallowed) {
        // Silent on purpose: a throw here would become an unhandled rejection.
      }
    } finally {
      if (acquired) {
        acquired = false;
        semaphore.release();
      }
    }
  }

  router.post('/decide', configGate, bodyParser, decide);

  // Any other method or path under /api/jev: a typed 404, never the showcase HTML.
  router.all('*', (req, res) => {
    const startedAt = clock();
    try {
      refuse(res, 'invalid_request', startedAt, 404);
    } catch (_swallowed) {
      // Nothing more can be done for this response.
    }
  });

  // Router-local error handler (Pattern 3). Maps only by type and status; it
  // terminates every error here and never throws.
  router.use((fault, req, res, _next) => {
    const startedAt = clock();
    try {
      let reason = 'server_error';
      let type;
      let status;
      try {
        type = fault !== null && typeof fault === 'object' ? fault.type : undefined;
        status = fault !== null && typeof fault === 'object' ? fault.status : undefined;
      } catch (_ignored) {
        type = undefined;
        status = undefined;
      }
      if (type === 'entity.too.large' || status === 413) reason = 'payload_too_large';
      else if (PARSER_ERROR_TYPES.includes(type)) reason = 'invalid_request';
      refuse(res, reason, startedAt);
    } catch (_swallowed) {
      // Nothing more can be done for this response.
    }
  });

  return router;
}

module.exports = createJevRouter;
module.exports.createJevRouter = createJevRouter;
