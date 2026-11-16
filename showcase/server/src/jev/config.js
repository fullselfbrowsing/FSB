'use strict';

/**
 * Phase 67 (JEV-02) -- boot-time Jev gateway configuration.
 *
 * server.js calls loadJevConfig with the process environment once, after
 * dotenv, and injects the frozen result into the router factory. Tests pass
 * plain env objects, so this module only ever reads the env object it is given.
 *
 * D-04: route and pin are configuration only. Exactly two upstreams exist:
 *   - TypeSafe direct  https://api.typesafe.ai/v1/systemone   + jev-1.13.0
 *   - OpenRouter       https://openrouter.ai/api/v1/systemone + typesafe/jev-1.13
 * There is no default route. A loopback URL (127.0.0.1, localhost, [::1]) is
 * accepted so tests can reach a fake upstream, and refused in production.
 *
 * D-05: invalid config never throws. It gives status 'not_configured' and one
 * log line that names the failing variables, never their values.
 *
 * D-06: the operator switch JEV_ENABLED is on only for 'true' or '1'
 * (case-insensitive, trimmed). Anything else gives 'disabled', whatever the
 * other variables hold.
 *
 * The credential is a non-enumerable property, so JSON.stringify,
 * util.inspect, Object.keys and object spread never reveal it. It must be
 * printable ASCII without whitespace (8..512 characters), so an HTTP client
 * can never reject the header and echo its value in an error message.
 */

const ALLOWED_UPSTREAMS = Object.freeze({
  'https://api.typesafe.ai/v1/systemone': 'typesafe',
  'https://openrouter.ai/api/v1/systemone': 'openrouter',
});

const DEFAULTS = Object.freeze({
  inputUsdPerMtok: 0.042,
  maxConcurrency: 16,
  upstreamTimeoutMs: 1500,
  dailyUsdCap: 2,
});

// Numeric bounds. Out-of-range or unparsable values fall back to DEFAULTS.
// upstreamTimeoutMsMax stays at least 500 ms under the extension client's
// 2,500 ms deadline (FsbJevClient.DEFAULT_TIMEOUT_MS, D-15): an upstream
// answer the gateway waits for, pays for and ledgers as ok must still reach
// the client before it gives up with timeout. tests/jev-contract-parity.test.js
// holds the two bounds together.
const LIMITS = Object.freeze({
  inputUsdPerMtokMax: 10,
  maxConcurrencyMin: 1,
  maxConcurrencyMax: 256,
  upstreamTimeoutMsMin: 100,
  upstreamTimeoutMsMax: 2000,
  dailyUsdCapMax: 1000,
});

const MODEL_MAX_CHARS = 128;
const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

// Fresh, non-global regexes on every call: no shared lastIndex state.
function modelPatterns() {
  return {
    typesafe: /^jev-\d+\.\d+\.\d+$/,
    openrouter: /^typesafe\/jev-\d+\.\d+(-\d{8})?$/,
  };
}

function credentialPattern() {
  return /^[\x21-\x7E]{8,512}$/;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Read one own property of an env object. Anything unusual (a non-object, an
 * inherited property, a throwing Proxy trap) reads as undefined.
 */
function readEnv(env, name) {
  if (env === null || (typeof env !== 'object' && typeof env !== 'function')) return undefined;
  try {
    if (!Object.prototype.hasOwnProperty.call(env, name)) return undefined;
    return env[name];
  } catch (_error) {
    return undefined;
  }
}

function readString(env, name) {
  const value = readEnv(env, name);
  return typeof value === 'string' ? value : undefined;
}

function parseNumber(env, name) {
  const value = readEnv(env, name);
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  return Number(value);
}

/** A safe integer in [min, max], else fallback. */
function positiveSafeIntegerEnv(env, name, fallback, min, max) {
  const parsed = parseNumber(env, name);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed >= min && parsed <= max ? parsed : fallback;
}

/** A finite number greater than 0 and at most max, else fallback. */
function positiveFiniteEnv(env, name, fallback, max) {
  const parsed = parseNumber(env, name);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

function isEnabled(env) {
  const value = readString(env, 'JEV_ENABLED');
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/**
 * The route for an upstream URL: 'typesafe' or 'openrouter' by exact string
 * match, 'loopback' for a plain loopback URL, else null.
 */
function routeFor(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  if (Object.prototype.hasOwnProperty.call(ALLOWED_UPSTREAMS, url)) return ALLOWED_UPSTREAMS[url];
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_error) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!LOOPBACK_HOSTNAMES.includes(parsed.hostname)) return null;
  if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') return null;
  if (url.includes('?') || url.includes('#')) return null;
  return 'loopback';
}

function modelFitsRoute(model, route) {
  if (typeof model !== 'string' || model.length === 0 || model.length > MODEL_MAX_CHARS) return false;
  const patterns = modelPatterns();
  if (route === 'typesafe') return patterns.typesafe.test(model);
  if (route === 'openrouter') return patterns.openrouter.test(model);
  // Loopback, or a route that already failed: either documented shape.
  return patterns.typesafe.test(model) || patterns.openrouter.test(model);
}

function safeLog(log, method, line) {
  try {
    if (log && typeof log[method] === 'function') log[method](line);
  } catch (_error) {
    // A broken logger must never break boot.
  }
}

/**
 * Build the frozen gateway config from an env object.
 *
 * @param {object} env - the process environment in server.js; a plain object in tests.
 * @param {{log?: {log: Function, warn: Function}}} [options]
 * @returns {Readonly<{status: 'ok'|'disabled'|'not_configured', route: string|null,
 *   upstreamUrl: string|null, model: string|null, inputUsdPerMtok: number,
 *   maxConcurrency: number, upstreamTimeoutMs: number, dailyUsdCap: number,
 *   problems: string[]}>} plus a non-enumerable `apiKey` (string when ok, else null).
 */
function loadJevConfig(env, options) {
  let log = console;
  try {
    if (options && typeof options === 'object' && options.log !== undefined) log = options.log;
  } catch (_error) {
    log = null;
  }

  const numbers = {
    inputUsdPerMtok: positiveFiniteEnv(env, 'JEV_INPUT_USD_PER_MTOK', DEFAULTS.inputUsdPerMtok,
      LIMITS.inputUsdPerMtokMax),
    maxConcurrency: positiveSafeIntegerEnv(env, 'JEV_MAX_CONCURRENCY', DEFAULTS.maxConcurrency,
      LIMITS.maxConcurrencyMin, LIMITS.maxConcurrencyMax),
    upstreamTimeoutMs: positiveSafeIntegerEnv(env, 'JEV_UPSTREAM_TIMEOUT_MS', DEFAULTS.upstreamTimeoutMs,
      LIMITS.upstreamTimeoutMsMin, LIMITS.upstreamTimeoutMsMax),
    dailyUsdCap: positiveFiniteEnv(env, 'JEV_DAILY_USD_CAP', DEFAULTS.dailyUsdCap, LIMITS.dailyUsdCapMax),
  };

  let status = 'disabled';
  let route = null;
  let upstreamUrl = null;
  let model = null;
  let apiKey = null;
  const problems = [];

  if (isEnabled(env)) {
    const url = readString(env, 'JEV_UPSTREAM_URL');
    const modelValue = readString(env, 'JEV_MODEL');
    const keyValue = readString(env, 'JEV_API_KEY');

    let candidateRoute = routeFor(url);
    if (candidateRoute === 'loopback' && readString(env, 'NODE_ENV') === 'production') candidateRoute = null;
    if (candidateRoute === null) problems.push('JEV_UPSTREAM_URL');
    if (!modelFitsRoute(modelValue, candidateRoute)) problems.push('JEV_MODEL');
    if (typeof keyValue !== 'string' || !credentialPattern().test(keyValue)) problems.push('JEV_API_KEY');

    if (problems.length === 0) {
      status = 'ok';
      route = candidateRoute;
      upstreamUrl = url;
      model = modelValue;
      apiKey = keyValue;
    } else {
      status = 'not_configured';
    }
  }

  const config = {
    status,
    route,
    upstreamUrl,
    model,
    inputUsdPerMtok: numbers.inputUsdPerMtok,
    maxConcurrency: numbers.maxConcurrency,
    upstreamTimeoutMs: numbers.upstreamTimeoutMs,
    dailyUsdCap: numbers.dailyUsdCap,
    problems,
  };
  Object.defineProperty(config, 'apiKey', { value: apiKey, enumerable: false, writable: false, configurable: false });
  deepFreeze(config);

  // Fixed strings only: variable names, the route and the validated model.
  if (status === 'not_configured') safeLog(log, 'warn', '[jev] config invalid: ' + problems.join(','));
  else if (status === 'ok') safeLog(log, 'log', '[jev] gateway enabled route=' + route + ' model=' + model);

  return config;
}

module.exports = {
  loadJevConfig,
  ALLOWED_UPSTREAMS,
  DEFAULTS,
  LIMITS,
  positiveSafeIntegerEnv,
  positiveFiniteEnv,
};
