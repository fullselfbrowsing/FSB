/**
 * Phase 67 / JEV-02 -- boot-time Jev gateway configuration.
 *
 * Covers showcase/server/src/jev/config.js (D-04, D-05, D-06):
 *   - route and pin are configuration only: exactly the TypeSafe direct URL or
 *     the OpenRouter URL, each with a model ID that fits its route, plus a
 *     loopback URL for tests that is refused in production;
 *   - the operator switch JEV_ENABLED defaults off;
 *   - invalid or missing config never throws and logs one line that names
 *     variables only, never a value;
 *   - the credential is a non-enumerable property that JSON.stringify,
 *     util.inspect and Object.keys never reveal;
 *   - .env.example documents every JEV_* variable with the credential empty,
 *     and fly.toml [env] never carries a Jev variable.
 *
 * Every case passes a plain env object; process.env is never read or mutated.
 *
 * Run: node tests/jev-gateway-config.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'showcase', 'server', 'src', 'jev', 'config.js');

const {
  loadJevConfig,
  ALLOWED_UPSTREAMS,
  DEFAULTS,
  positiveSafeIntegerEnv,
  positiveFiniteEnv,
} = require(CONFIG_PATH);

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label}${detail === undefined ? '' : ` -- ${detail}`}`); }
}
function show(value) {
  return JSON.stringify(value);
}

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/systemone';
const KEY = 'sk-test-SECRET-0123456789abcdef';
const JEV_NAMES = [
  'JEV_ENABLED',
  'JEV_UPSTREAM_URL',
  'JEV_MODEL',
  'JEV_API_KEY',
  'JEV_INPUT_USD_PER_MTOK',
  'JEV_MAX_CONCURRENCY',
  'JEV_UPSTREAM_TIMEOUT_MS',
  'JEV_DAILY_USD_CAP',
];

function captureLog() {
  const lines = [];
  return {
    lines,
    log: {
      log(...args) { lines.push({ level: 'log', text: args.map(String).join(' ') }); },
      warn(...args) { lines.push({ level: 'warn', text: args.map(String).join(' ') }); },
      error(...args) { lines.push({ level: 'error', text: args.map(String).join(' ') }); },
      info(...args) { lines.push({ level: 'info', text: args.map(String).join(' ') }); },
    },
  };
}

function load(env) {
  const capture = captureLog();
  let config = null;
  let threw = null;
  try {
    config = loadJevConfig(env, { log: capture.log });
  } catch (error) {
    threw = error;
  }
  return { config, lines: capture.lines, threw };
}

function directEnv(overrides) {
  return Object.assign({
    JEV_ENABLED: 'true',
    JEV_UPSTREAM_URL: TYPESAFE_URL,
    JEV_MODEL: 'jev-1.13.0',
    JEV_API_KEY: KEY,
  }, overrides);
}

function openRouterEnv(overrides) {
  return Object.assign({
    JEV_ENABLED: 'true',
    JEV_UPSTREAM_URL: OPENROUTER_URL,
    JEV_MODEL: 'typesafe/jev-1.13',
    JEV_API_KEY: KEY,
  }, overrides);
}

function sameMembers(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((name) => actual.includes(name));
}

// ---------------------------------------------------------------------------
// Exports and constants
// ---------------------------------------------------------------------------
function exportsSection() {
  console.log('\n--- exports and constants ---');
  check('loadJevConfig is a function', typeof loadJevConfig === 'function');
  check('positiveSafeIntegerEnv and positiveFiniteEnv are exported',
    typeof positiveSafeIntegerEnv === 'function' && typeof positiveFiniteEnv === 'function');
  check('ALLOWED_UPSTREAMS is exactly the two documented routes',
    show(ALLOWED_UPSTREAMS) === show({ [TYPESAFE_URL]: 'typesafe', [OPENROUTER_URL]: 'openrouter' }),
    show(ALLOWED_UPSTREAMS));
  check('ALLOWED_UPSTREAMS is frozen', Object.isFrozen(ALLOWED_UPSTREAMS));
  check('DEFAULTS hold the planned values',
    show(DEFAULTS) === show({ inputUsdPerMtok: 0.042, maxConcurrency: 16, upstreamTimeoutMs: 1500, dailyUsdCap: 2 }),
    show(DEFAULTS));
  check('DEFAULTS is frozen', Object.isFrozen(DEFAULTS));
}

// ---------------------------------------------------------------------------
// Operator switch (D-06)
// ---------------------------------------------------------------------------
function switchSection() {
  console.log('\n--- operator switch ---');
  const empty = load({});
  check('loadJevConfig({}) does not throw', empty.threw === null);
  check('loadJevConfig({}) is disabled', empty.config && empty.config.status === 'disabled', show(empty.config));
  check('disabled config logs nothing', empty.lines.length === 0, show(empty.lines));
  check('disabled config has no problems', empty.config && sameMembers(empty.config.problems, []));
  check('disabled config has a null apiKey', empty.config && empty.config.apiKey === null);

  const offButValid = load(directEnv({ JEV_ENABLED: 'false' }));
  check('JEV_ENABLED=false is disabled even with a valid route', offButValid.config.status === 'disabled');
  check('a disabled config never exposes the credential', offButValid.config.apiKey === null);
  check('a disabled config logs nothing even with other variables set', offButValid.lines.length === 0);

  const offAndBroken = load({ JEV_ENABLED: '0', JEV_UPSTREAM_URL: 'https://evil.example/v1/systemone', JEV_API_KEY: 'x y' });
  check('disabled wins over invalid values, with no log line',
    offAndBroken.config.status === 'disabled' && offAndBroken.lines.length === 0);

  for (const value of ['true', 'TRUE', 'True', '1', ' 1 ', ' true\n']) {
    const result = load(directEnv({ JEV_ENABLED: value }));
    check(`JEV_ENABLED ${show(value)} turns the gateway on`, result.config.status === 'ok', show(result.config));
  }
  for (const value of ['yes', 'on', '', 'false', '0', 'enabled', '2', 'truee', undefined, null, true, 1, {}, []]) {
    const result = load(directEnv({ JEV_ENABLED: value }));
    check(`JEV_ENABLED ${show(value) === undefined ? String(value) : show(value)} leaves the gateway off`,
      result.threw === null && result.config.status === 'disabled');
  }
}

// ---------------------------------------------------------------------------
// Routes and pins (D-04, D-05, D-31)
// ---------------------------------------------------------------------------
function routeSection() {
  console.log('\n--- routes and pins ---');
  const direct = load(directEnv());
  check('TypeSafe direct + jev-1.13.0 is ok', direct.config.status === 'ok', show(direct.config));
  check('TypeSafe direct route is typesafe', direct.config.route === 'typesafe');
  check('TypeSafe direct keeps the URL and model', direct.config.upstreamUrl === TYPESAFE_URL
    && direct.config.model === 'jev-1.13.0');
  check('direct config has no problems', sameMembers(direct.config.problems, []));
  check('direct config exposes the credential through apiKey', direct.config.apiKey === KEY);

  const openRouter = load(openRouterEnv());
  check('OpenRouter + typesafe/jev-1.13 is ok', openRouter.config.status === 'ok', show(openRouter.config));
  check('OpenRouter route is openrouter', openRouter.config.route === 'openrouter');
  const dated = load(openRouterEnv({ JEV_MODEL: 'typesafe/jev-1.13-20260917' }));
  check('OpenRouter accepts the dated typesafe/jev-1.13-20260917', dated.config.status === 'ok');
  const direct114 = load(directEnv({ JEV_MODEL: 'jev-1.14.0' }));
  check('TypeSafe direct accepts jev-1.14.0 (the pin is configuration)', direct114.config.status === 'ok');
  const or114 = load(openRouterEnv({ JEV_MODEL: 'typesafe/jev-1.14' }));
  check('OpenRouter accepts typesafe/jev-1.14 (the pin is configuration)', or114.config.status === 'ok');

  const badUrls = [
    ['a missing URL', undefined],
    ['an empty URL', ''],
    ['a trailing slash', `${TYPESAFE_URL}/`],
    ['http instead of https', 'http://api.typesafe.ai/v1/systemone'],
    ['a foreign host', 'https://evil.example/v1/systemone'],
    ['a look-alike OpenRouter host', 'https://openrouter.ai.evil.example/api/v1/systemone'],
    ['an upper-case host', 'https://API.TYPESAFE.AI/v1/systemone'],
    ['a query string', `${TYPESAFE_URL}?x=1`],
    ['a fragment', `${OPENROUTER_URL}#frag`],
    ['an explicit port', 'https://api.typesafe.ai:443/v1/systemone'],
    ['userinfo on a real host', 'https://user:pass@api.typesafe.ai/v1/systemone'],
    ['leading whitespace', ` ${TYPESAFE_URL}`],
    ['a models endpoint', 'https://api.typesafe.ai/v1/models'],
    ['not a URL', 'not a url'],
    ['a file URL', 'file:///etc/passwd'],
    ['a loopback-looking subdomain', 'http://localhost.evil.example/v1/systemone'],
    ['loopback with userinfo', 'http://user:pass@127.0.0.1:5555/v1/systemone'],
    ['loopback with a query', 'http://127.0.0.1:5555/v1/systemone?x=1'],
    ['a private address', 'http://10.0.0.1/v1/systemone'],
    ['a non-string URL', 42],
  ];
  for (const [label, url] of badUrls) {
    const result = load(directEnv({ JEV_UPSTREAM_URL: url }));
    check(`${label} is not_configured`, result.threw === null && result.config.status === 'not_configured',
      show(result.config));
    check(`${label} names only JEV_UPSTREAM_URL`, result.config && sameMembers(result.config.problems, ['JEV_UPSTREAM_URL']),
      result.config && show(result.config.problems));
  }

  const badDirectModels = ['jev-latest', 'jev-preview', '~typesafe/jev-latest', 'typesafe/jev-latest', 'jev-1.13',
    'typesafe/jev-1.13', 'jev-1.13.0 ', ' jev-1.13.0', 'JEV-1.13.0', 'jev-1.13.0-20260917', '', undefined, 7];
  for (const model of badDirectModels) {
    const result = load(directEnv({ JEV_MODEL: model }));
    check(`direct model ${show(model) === undefined ? 'undefined' : show(model)} is not_configured`,
      result.config.status === 'not_configured', show(result.config));
    check(`direct model ${show(model) === undefined ? 'undefined' : show(model)} names only JEV_MODEL`,
      sameMembers(result.config.problems, ['JEV_MODEL']), show(result.config.problems));
  }

  const badOpenRouterModels = ['typesafe/jev-1.13.0', 'jev-1.13.0', 'typesafe/jev-latest', '~typesafe/jev-latest',
    'typesafe/jev-preview', 'typesafe/jev-1.13-2026091', 'typesafe/jev-1.13:free', 'other/jev-1.13', 'typesafe/jev-1'];
  for (const model of badOpenRouterModels) {
    const result = load(openRouterEnv({ JEV_MODEL: model }));
    check(`OpenRouter model ${show(model)} is not_configured`, result.config.status === 'not_configured',
      show(result.config));
    check(`OpenRouter model ${show(model)} names only JEV_MODEL`, sameMembers(result.config.problems, ['JEV_MODEL']),
      show(result.config.problems));
  }

  const longDigits = load(directEnv({ JEV_MODEL: `jev-1.13.${'9'.repeat(200)}` }));
  check('an over-long model ID is not_configured', longDigits.config.status === 'not_configured');

  const badKeys = [
    ['a missing key', undefined],
    ['an empty key', ''],
    ['a key with a space', 'sk-test SECRET-0123456789'],
    ['a key with a newline', 'sk-test-SECRET-0123456789\n'],
    ['a key with a tab', 'sk-test-\tSECRET-0123456789'],
    ['a 7-character key', 'sk-1234'],
    ['a non-ASCII key', 'sk-test-SECRET-0123456789é'],
    ['a key over 512 characters', `sk-${'a'.repeat(512)}`],
    ['a non-string key', 12345678901234],
  ];
  for (const [label, key] of badKeys) {
    const result = load(directEnv({ JEV_API_KEY: key }));
    check(`${label} is not_configured`, result.config.status === 'not_configured', show(result.config));
    check(`${label} names only JEV_API_KEY`, sameMembers(result.config.problems, ['JEV_API_KEY']),
      show(result.config.problems));
    check(`${label} leaves apiKey null`, result.config.apiKey === null);
  }
  const eightChars = load(directEnv({ JEV_API_KEY: 'sk-12345' }));
  check('an 8-character printable key is accepted', eightChars.config.status === 'ok');

  const allBad = load({ JEV_ENABLED: 'true' });
  check('enabled with nothing else names all three variables',
    allBad.config.status === 'not_configured'
      && show(allBad.config.problems) === show(['JEV_UPSTREAM_URL', 'JEV_MODEL', 'JEV_API_KEY']),
    show(allBad.config.problems));
  check('a not_configured config has null route, URL and model',
    allBad.config.route === null && allBad.config.upstreamUrl === null && allBad.config.model === null);

  const twoBad = load(directEnv({ JEV_UPSTREAM_URL: 'https://evil.example/v1/systemone', JEV_API_KEY: 'x' }));
  check('two failing variables are both named and nothing else',
    show(twoBad.config.problems) === show(['JEV_UPSTREAM_URL', 'JEV_API_KEY']), show(twoBad.config.problems));
}

// ---------------------------------------------------------------------------
// Loopback upstream (tests only; refused in production)
// ---------------------------------------------------------------------------
function loopbackSection() {
  console.log('\n--- loopback upstream ---');
  const urls = [
    'http://127.0.0.1:5555/v1/systemone',
    'http://localhost:5555/v1/systemone',
    'http://[::1]:5555/v1/systemone',
    'https://127.0.0.1:5555/v1/systemone',
  ];
  for (const url of urls) {
    for (const model of ['jev-1.13.0', 'typesafe/jev-1.13', 'typesafe/jev-1.13-20260917']) {
      const result = load(directEnv({ JEV_UPSTREAM_URL: url, JEV_MODEL: model }));
      check(`loopback ${url} with ${model} is ok, route loopback`,
        result.config.status === 'ok' && result.config.route === 'loopback' && result.config.upstreamUrl === url,
        show(result.config));
    }
  }
  const aliasOnLoopback = load(directEnv({ JEV_UPSTREAM_URL: urls[0], JEV_MODEL: 'jev-latest' }));
  check('loopback still refuses an alias model', aliasOnLoopback.config.status === 'not_configured'
    && sameMembers(aliasOnLoopback.config.problems, ['JEV_MODEL']));

  for (const nodeEnv of ['production']) {
    const result = load(directEnv({ JEV_UPSTREAM_URL: urls[0], NODE_ENV: nodeEnv }));
    check('loopback with NODE_ENV production is not_configured', result.config.status === 'not_configured',
      show(result.config));
    check('loopback refused in production names only JEV_UPSTREAM_URL',
      sameMembers(result.config.problems, ['JEV_UPSTREAM_URL']), show(result.config.problems));
  }
  for (const nodeEnv of ['development', 'test', '']) {
    const result = load(directEnv({ JEV_UPSTREAM_URL: urls[0], NODE_ENV: nodeEnv }));
    check(`loopback with NODE_ENV ${show(nodeEnv)} is ok`, result.config.status === 'ok');
  }
  const prodReal = load(openRouterEnv({ NODE_ENV: 'production' }));
  check('a real route stays ok in production', prodReal.config.status === 'ok');
}

// ---------------------------------------------------------------------------
// Numeric variables
// ---------------------------------------------------------------------------
function numericSection() {
  console.log('\n--- numeric variables ---');
  const defaults = load(directEnv());
  check('unset numerics use DEFAULTS',
    defaults.config.inputUsdPerMtok === 0.042 && defaults.config.maxConcurrency === 16
      && defaults.config.upstreamTimeoutMs === 1500 && defaults.config.dailyUsdCap === 2,
    show(defaults.config));

  const names = [
    ['JEV_INPUT_USD_PER_MTOK', 'inputUsdPerMtok'],
    ['JEV_MAX_CONCURRENCY', 'maxConcurrency'],
    ['JEV_UPSTREAM_TIMEOUT_MS', 'upstreamTimeoutMs'],
    ['JEV_DAILY_USD_CAP', 'dailyUsdCap'],
  ];
  for (const [name, field] of names) {
    for (const bad of ['0', '-3', 'abc', '1e9', '', 'Infinity', 'NaN', null, {}, true]) {
      const result = load(directEnv({ [name]: bad }));
      check(`${name}=${show(bad)} falls back to the default`,
        result.threw === null && result.config.status === 'ok' && result.config[field] === DEFAULTS[field],
        show(result.config));
    }
  }
  const valid = load(directEnv({
    JEV_INPUT_USD_PER_MTOK: '0.05',
    JEV_MAX_CONCURRENCY: '8',
    JEV_UPSTREAM_TIMEOUT_MS: '200',
    JEV_DAILY_USD_CAP: '5',
  }));
  check('valid numeric values are used',
    valid.config.inputUsdPerMtok === 0.05 && valid.config.maxConcurrency === 8
      && valid.config.upstreamTimeoutMs === 200 && valid.config.dailyUsdCap === 5,
    show(valid.config));
  const tiny = load(directEnv({ JEV_DAILY_USD_CAP: '0.00001' }));
  check('a tiny positive daily cap is accepted', tiny.config.dailyUsdCap === 0.00001);
  const bounds = load(directEnv({
    JEV_INPUT_USD_PER_MTOK: '10',
    JEV_MAX_CONCURRENCY: '256',
    JEV_UPSTREAM_TIMEOUT_MS: '2000',
    JEV_DAILY_USD_CAP: '1000',
  }));
  check('inclusive upper bounds are accepted',
    bounds.config.inputUsdPerMtok === 10 && bounds.config.maxConcurrency === 256
      && bounds.config.upstreamTimeoutMs === 2000 && bounds.config.dailyUsdCap === 1000,
    show(bounds.config));
  const over = load(directEnv({
    JEV_INPUT_USD_PER_MTOK: '10.01',
    JEV_MAX_CONCURRENCY: '257',
    JEV_UPSTREAM_TIMEOUT_MS: '2001',
    JEV_DAILY_USD_CAP: '1000.5',
  }));
  check('values just over the upper bounds fall back',
    over.config.inputUsdPerMtok === 0.042 && over.config.maxConcurrency === 16
      && over.config.upstreamTimeoutMs === 1500 && over.config.dailyUsdCap === 2,
    show(over.config));
  const under = load(directEnv({ JEV_MAX_CONCURRENCY: '0', JEV_UPSTREAM_TIMEOUT_MS: '99' }));
  check('values under the lower bounds fall back',
    under.config.maxConcurrency === 16 && under.config.upstreamTimeoutMs === 1500, show(under.config));
  const fractional = load(directEnv({ JEV_MAX_CONCURRENCY: '2.5', JEV_UPSTREAM_TIMEOUT_MS: '150.5' }));
  check('fractional integer values fall back',
    fractional.config.maxConcurrency === 16 && fractional.config.upstreamTimeoutMs === 1500, show(fractional.config));
  const numericOnly = load(directEnv({ JEV_MAX_CONCURRENCY: '0' }));
  check('a bad numeric never adds a problem', numericOnly.config.status === 'ok'
    && sameMembers(numericOnly.config.problems, []));
  const disabledNumbers = load({ JEV_MAX_CONCURRENCY: '4' });
  check('numerics are parsed for a disabled config too', disabledNumbers.config.maxConcurrency === 4);

  check('positiveSafeIntegerEnv reads only the passed env',
    positiveSafeIntegerEnv({ X: '7' }, 'X', 3, 1, 10) === 7
      && positiveSafeIntegerEnv({ X: '11' }, 'X', 3, 1, 10) === 3
      && positiveSafeIntegerEnv({}, 'X', 3, 1, 10) === 3
      && positiveSafeIntegerEnv(null, 'X', 3, 1, 10) === 3);
  check('positiveFiniteEnv accepts (0, max]',
    positiveFiniteEnv({ X: '0.5' }, 'X', 1, 2) === 0.5
      && positiveFiniteEnv({ X: '2' }, 'X', 1, 2) === 2
      && positiveFiniteEnv({ X: '0' }, 'X', 1, 2) === 1
      && positiveFiniteEnv({ X: '2.0001' }, 'X', 1, 2) === 1
      && positiveFiniteEnv(undefined, 'X', 1, 2) === 1);
}

// ---------------------------------------------------------------------------
// Secret hygiene (D-05, T-67-01)
// ---------------------------------------------------------------------------
function secretSection() {
  console.log('\n--- secret hygiene ---');
  for (const [label, env] of [['direct', directEnv()], ['openrouter', openRouterEnv()],
    ['loopback', directEnv({ JEV_UPSTREAM_URL: 'http://127.0.0.1:5555/v1/systemone' })]]) {
    const { config } = load(env);
    check(`${label}: config.apiKey returns the credential`, config.apiKey === KEY);
    check(`${label}: JSON.stringify never contains the credential`, !JSON.stringify(config).includes('SECRET'));
    check(`${label}: util.inspect never contains the credential`, !util.inspect(config).includes('SECRET'));
    check(`${label}: util.inspect with depth null never contains the credential`,
      !util.inspect(config, { depth: null }).includes('SECRET'));
    check(`${label}: String(Object.keys(config)) never contains the credential or apiKey`,
      !String(Object.keys(config)).includes('SECRET') && !Object.keys(config).includes('apiKey'));
    check(`${label}: template-literal interpolation never contains the credential`,
      !`${String(config)}`.includes('SECRET'));
    check(`${label}: object spread never copies the credential`, !JSON.stringify({ ...config }).includes('SECRET')
      && { ...config }.apiKey === undefined);
    check(`${label}: apiKey is non-enumerable`,
      Object.getOwnPropertyDescriptor(config, 'apiKey').enumerable === false);
    check(`${label}: the config is frozen`, Object.isFrozen(config));
    check(`${label}: problems is frozen`, Object.isFrozen(config.problems));
    let assignThrew = false;
    try {
      // Strict mode (file directive): writing a frozen, non-writable property throws.
      config.apiKey = 'other';
    } catch (_error) {
      assignThrew = true;
    }
    check(`${label}: apiKey cannot be reassigned`, config.apiKey === KEY && assignThrew);
    check(`${label}: the key set is the planned shape`,
      show(Object.keys(config)) === show(['status', 'route', 'upstreamUrl', 'model', 'inputUsdPerMtok',
        'maxConcurrency', 'upstreamTimeoutMs', 'dailyUsdCap', 'problems']), show(Object.keys(config)));
  }
}

// ---------------------------------------------------------------------------
// Log lines
// ---------------------------------------------------------------------------
function logSection() {
  console.log('\n--- log lines ---');
  const ok = load(openRouterEnv());
  check('ok config logs exactly one line', ok.lines.length === 1, show(ok.lines));
  check('the ok line is the fixed enabled line with route and model',
    ok.lines[0] && ok.lines[0].text === '[jev] gateway enabled route=openrouter model=typesafe/jev-1.13',
    show(ok.lines));
  check('the ok line never contains the credential', ok.lines.every((line) => !line.text.includes('SECRET')));

  const invalidCases = [
    ['bad URL', directEnv({ JEV_UPSTREAM_URL: 'https://evil.example/v1/systemone?token=LEAKMARKER' }), ['JEV_UPSTREAM_URL']],
    ['bad model', directEnv({ JEV_MODEL: 'jev-latest-LEAKMARKER' }), ['JEV_MODEL']],
    ['bad key', directEnv({ JEV_API_KEY: 'sk-test SECRET LEAKMARKER' }), ['JEV_API_KEY']],
    ['production loopback', directEnv({ JEV_UPSTREAM_URL: 'http://127.0.0.1:1/LEAKMARKER', NODE_ENV: 'production' }),
      ['JEV_UPSTREAM_URL']],
    ['everything missing', { JEV_ENABLED: '1' }, ['JEV_UPSTREAM_URL', 'JEV_MODEL', 'JEV_API_KEY']],
  ];
  for (const [label, env, names] of invalidCases) {
    const result = load(env);
    check(`${label}: exactly one log line`, result.lines.length === 1, show(result.lines));
    const text = result.lines[0] ? result.lines[0].text : '';
    check(`${label}: the line is a warning starting with [jev] config invalid`,
      result.lines[0] && result.lines[0].level === 'warn' && text.startsWith('[jev] config invalid'), show(result.lines));
    check(`${label}: the line names the failing variables`, names.every((name) => text.includes(name)), text);
    check(`${label}: the line holds no value`,
      !text.includes('LEAKMARKER') && !text.includes('SECRET') && !text.includes('evil') && !text.includes('127.0.0.1'),
      text);
    check(`${label}: the line is exactly the fixed format`, text === `[jev] config invalid: ${names.join(',')}`, text);
  }
  const valid = load(directEnv({ JEV_MAX_CONCURRENCY: 'abc' }));
  check('a numeric fallback alone logs only the enabled line', valid.lines.length === 1
    && valid.lines[0].text.startsWith('[jev] gateway enabled'));

  // A log object whose methods throw must not break boot.
  let threw = null;
  let config = null;
  try {
    config = loadJevConfig(directEnv({ JEV_MODEL: 'jev-latest' }), {
      log: { warn() { throw new Error('log down'); }, log() { throw new Error('log down'); } },
    });
  } catch (error) {
    threw = error;
  }
  check('a throwing log never makes loadJevConfig throw', threw === null && config.status === 'not_configured');
  let threwMissing = null;
  try {
    loadJevConfig(directEnv(), { log: {} });
    loadJevConfig(directEnv({ JEV_MODEL: 'x' }), { log: null });
  } catch (error) {
    threwMissing = error;
  }
  check('a log without methods never makes loadJevConfig throw', threwMissing === null);
}

// ---------------------------------------------------------------------------
// Totality: loadJevConfig never throws
// ---------------------------------------------------------------------------
function totalitySection() {
  console.log('\n--- totality ---');
  const throwingProxy = new Proxy({}, {
    get() { throw new Error('trap'); },
    has() { throw new Error('trap'); },
    getOwnPropertyDescriptor() { throw new Error('trap'); },
    ownKeys() { throw new Error('trap'); },
  });
  const hostileValue = { toString() { throw new Error('toString'); }, valueOf() { throw new Error('valueOf'); } };
  const inputs = [
    undefined,
    null,
    42,
    'JEV_ENABLED=true',
    [],
    Object.create(null),
    throwingProxy,
    { JEV_ENABLED: hostileValue, JEV_UPSTREAM_URL: hostileValue, JEV_MODEL: hostileValue, JEV_API_KEY: hostileValue },
    { JEV_ENABLED: 'true', JEV_UPSTREAM_URL: hostileValue, JEV_MODEL: hostileValue, JEV_API_KEY: hostileValue,
      JEV_MAX_CONCURRENCY: hostileValue, JEV_DAILY_USD_CAP: hostileValue, JEV_INPUT_USD_PER_MTOK: hostileValue,
      JEV_UPSTREAM_TIMEOUT_MS: hostileValue },
    { JEV_ENABLED: 'true', JEV_UPSTREAM_URL: Symbol('u'), JEV_MODEL: Symbol('m'), JEV_API_KEY: Symbol('k'),
      JEV_MAX_CONCURRENCY: Symbol('c') },
    { JEV_ENABLED: 'true', JEV_UPSTREAM_URL: ['https://api.typesafe.ai/v1/systemone'], JEV_MODEL: ['jev-1.13.0'],
      JEV_API_KEY: [KEY] },
    { JEV_ENABLED: 'true', JEV_UPSTREAM_URL: 10n, JEV_MODEL: 10n, JEV_API_KEY: 10n, JEV_MAX_CONCURRENCY: 10n },
  ];
  inputs.forEach((env, index) => {
    const result = load(env);
    check(`input #${index} never throws`, result.threw === null, result.threw && result.threw.name);
    check(`input #${index} gives a frozen disabled or not_configured config`,
      result.config && Object.isFrozen(result.config)
        && (result.config.status === 'disabled' || result.config.status === 'not_configured'),
      show(result.config));
  });
  let threwNoOptions = null;
  try {
    const silentConsole = { warn: console.warn, log: console.log };
    console.warn = () => {};
    console.log = () => {};
    try {
      loadJevConfig({});
      loadJevConfig(undefined);
      loadJevConfig({ JEV_ENABLED: 'true' });
    } finally {
      console.warn = silentConsole.warn;
      console.log = silentConsole.log;
    }
  } catch (error) {
    threwNoOptions = error;
  }
  check('loadJevConfig without options never throws', threwNoOptions === null);

  const polluted = Object.create({ JEV_ENABLED: 'true', JEV_UPSTREAM_URL: TYPESAFE_URL, JEV_MODEL: 'jev-1.13.0',
    JEV_API_KEY: KEY });
  const inherited = load(polluted);
  check('inherited (non-own) env properties are ignored', inherited.config.status === 'disabled');
}

// ---------------------------------------------------------------------------
// Static checks: source, .env.example, fly.toml, .gitignore
// ---------------------------------------------------------------------------
function staticSection() {
  console.log('\n--- static checks ---');
  const source = fs.readFileSync(CONFIG_PATH, 'utf8');
  check('config.js never reads process.env', !/process\.env/.test(source));
  check('config.js never logs err.message or a stack', !/err\.message|\.stack\b/.test(source));
  check('config.js has no console call', !/console\.(log|warn|error|info)\s*\(/.test(source));

  const envExample = fs.readFileSync(path.join(ROOT, 'showcase', 'server', '.env.example'), 'utf8');
  const envLines = envExample.split(/\r?\n/);
  for (const name of JEV_NAMES) {
    check(`.env.example documents ${name}`, envLines.some((line) => line.startsWith(`${name}=`)));
  }
  check('.env.example has JEV_API_KEY= with an empty value', envLines.filter((line) => line === 'JEV_API_KEY=').length === 1);
  check('.env.example has JEV_ENABLED=false', envLines.includes('JEV_ENABLED=false'));
  check('.env.example leaves JEV_UPSTREAM_URL and JEV_MODEL empty (no default route)',
    envLines.includes('JEV_UPSTREAM_URL=') && envLines.includes('JEV_MODEL='));
  check('.env.example numeric defaults match DEFAULTS',
    envLines.includes(`JEV_INPUT_USD_PER_MTOK=${DEFAULTS.inputUsdPerMtok}`)
      && envLines.includes(`JEV_MAX_CONCURRENCY=${DEFAULTS.maxConcurrency}`)
      && envLines.includes(`JEV_UPSTREAM_TIMEOUT_MS=${DEFAULTS.upstreamTimeoutMs}`)
      && envLines.includes(`JEV_DAILY_USD_CAP=${DEFAULTS.dailyUsdCap}`));
  check('.env.example names both routes', envExample.includes(TYPESAFE_URL) && envExample.includes(OPENROUTER_URL));
  check('.env.example says the key is set with fly secrets set', envExample.includes('fly secrets set'));
  check('.env.example still holds the earlier blocks',
    envExample.includes('FSB_SERVER_SECRET=') && envExample.includes('GITHUB_TOKEN='));
  check('.env.example keeps the Jev block after GITHUB_TOKEN',
    envExample.indexOf('GITHUB_TOKEN=') < envExample.indexOf('JEV_ENABLED='));

  const flyToml = fs.readFileSync(path.join(ROOT, 'fly.toml'), 'utf8');
  check('fly.toml carries no JEV_ variable', !flyToml.includes('JEV_'));

  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
  check('.gitignore ignores .env', gitignore.includes('.env'));
}

const sections = [exportsSection, switchSection, routeSection, loopbackSection, numericSection, secretSection,
  logSection, totalitySection, staticSection];

function main() {
  console.log('--- jev-gateway-config (JEV-02) ---');
  for (const section of sections) section();
  console.log(`\n=== jev-gateway-config results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
