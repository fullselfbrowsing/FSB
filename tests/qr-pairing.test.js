'use strict';

/**
 * Static analysis test for Phase 210 QR pairing controller in ui/options.js.
 * Validates the structural contract for the QR pairing controller per
 * CONTEXT decisions D-01 (silent hash-key auto-gen), D-02 (in-overlay
 * regenerate on expiry), D-03 (urgency at <=10s), and the locked DOM /
 * server contract documented in 210-RESEARCH.md.
 *
 * Run: node tests/qr-pairing.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const optionsSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ui', 'options.js'), 'utf8');
const pairRouteSource = fs.readFileSync(
  path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'pair.js'),
  'utf8'
);
const packageJsonRaw = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');

function loadPairRouter(queries) {
  const routes = [];
  const fakeExpress = {
    Router() {
      return {
        get(routePath, ...handlers) {
          routes.push({ method: 'get', path: routePath, handlers });
        },
        post(routePath, ...handlers) {
          routes.push({ method: 'post', path: routePath, handlers });
        }
      };
    }
  };
  const moduleRecord = { exports: {} };
  const evaluate = vm.runInNewContext(
    `(function (require, module, exports) { ${pairRouteSource}\n})`,
    { console: { error() {} } }
  );
  evaluate(
    (id) => {
      if (id === 'express') return fakeExpress;
      if (id === 'crypto') return require('crypto');
      throw new Error(`Unexpected pair route dependency: ${id}`);
    },
    moduleRecord,
    moduleRecord.exports
  );

  const authMiddleware = (_req, _res, next) => next();
  moduleRecord.exports(queries, authMiddleware);
  return {
    codes: { ...moduleRecord.exports.PAIR_ERROR_CODES },
    invoke(method, routePath, req = {}) {
      const route = routes.find((candidate) => (
        candidate.method === method && candidate.path === routePath
      ));
      assert(route, `${method.toUpperCase()} ${routePath} route registered`);

      const response = { status: 200, body: undefined };
      const res = {
        status(status) {
          response.status = status;
          return this;
        },
        json(body) {
          response.body = JSON.parse(JSON.stringify(body));
          return this;
        }
      };
      route.handlers[route.handlers.length - 1](
        { body: {}, headers: {}, ...req },
        res
      );
      return response;
    }
  };
}

function createPairQueries(overrides = {}) {
  return {
    cleanExpiredPairingTokens() {},
    invalidatePairingTokens() {},
    createPairingToken() {},
    getPairingToken() { return null; },
    consumePairingToken() {},
    getSessionByToken() { return null; },
    revokeSession() {},
    ...overrides
  };
}

function assertPairFailure(actual, status, error, code) {
  assert.strictEqual(actual.status, status);
  assert.deepStrictEqual(actual.body, { error, code });
}

console.log('--- listener registration (QR-01, QR-03) ---');
assert(/document\.getElementById\(['"]btnPairDashboard['"]\)/.test(optionsSource), 'btnPairDashboard lookup present');
assert(/document\.getElementById\(['"]btnCancelPairing['"]\)/.test(optionsSource), 'btnCancelPairing lookup present');
// Both buttons must register a click listener somewhere
const pairListener = /btnPair[A-Za-z]*\.addEventListener\(['"]click['"]/.test(optionsSource);
const cancelListener = /btnCancel[A-Za-z]*\.addEventListener\(['"]click['"]/.test(optionsSource);
assert(pairListener, 'pair button has click listener');
assert(cancelListener, 'cancel button has click listener');

console.log('--- controller functions (QR-01, QR-03) ---');
assert(/function\s+showPairingQR|showPairingQR\s*=\s*async/.test(optionsSource), 'showPairingQR defined');
assert(/function\s+cancelPairing|cancelPairing\s*=/.test(optionsSource), 'cancelPairing defined');

console.log('--- server contract (QR-01, D-01) ---');
assert(/\/api\/pair\/generate/.test(optionsSource), 'POST /api/pair/generate present');
assert(/['"]X-FSB-Hash-Key['"]/.test(optionsSource), 'X-FSB-Hash-Key header literal present');
assert(/\/api\/auth\/register/.test(optionsSource), 'D-01 auto-gen calls /api/auth/register');

console.log('--- relay reconnect contract (SYNC70) ---');
assert(/function\s+requestDashboardRelayReconnect/.test(optionsSource), 'Sync tab defines relay reconnect helper');
assert(/action:\s*['"]reconnectDashboardWebSocket['"]/.test(optionsSource), 'Sync tab can ask background.js to reconnect relay WS');
assert(/requestDashboardRelayReconnect\(serverUrl,\s*data\.hashKey\)/.test(optionsSource), 'new hash key generation reconnects relay to the new room');
const reconnectBeforePairingTokenCount = (optionsSource.match(/requestDashboardRelayReconnect\(serverUrl,\s*hashKey\);\s*const data = await fetchPairingToken\(serverUrl,\s*hashKey\)/g) || []).length;
assert(reconnectBeforePairingTokenCount >= 2, 'initial and regenerated QR pairing tokens reconnect relay before minting token');

console.log('--- QR payload contract (QR-01) ---');
assert(/qrcode\(\s*\d+\s*,\s*['"][LMQH]['"]\s*\)/.test(optionsSource), 'qrcode(typeNumber, level) invocation');
// Single JSON.stringify call must contain both `t:` and `s:` keys
assert(/JSON\.stringify\(\{[^}]*\bt\s*:[^}]*\bs\s*:[^}]*\}\)|JSON\.stringify\(\{[^}]*\bs\s*:[^}]*\bt\s*:[^}]*\}\)/.test(optionsSource),
  'JSON.stringify({ t, s }) payload shape — keys t and s in same object literal');

console.log('--- countdown urgency (D-03, QR-02) ---');
assert(/remaining\s*<=\s*10/.test(optionsSource), 'urgency threshold <=10');
assert(/['"]pairing-countdown-urgent['"]/.test(optionsSource), 'pairing-countdown-urgent class referenced');
assert(/expiresAt/.test(optionsSource), 'countdown driven by server-provided expiresAt');

console.log('--- expired regenerate path (D-02) ---');
assert(/['"]pairing-qr-expired['"]/.test(optionsSource), 'pairing-qr-expired class referenced');
assert(/Generate new code/.test(optionsSource), 'Generate new code CTA copy present');

console.log('--- overlay show/hide (UI-SPEC, pitfall 1) ---');
assert(/style\.display\s*=\s*['"]flex['"]/.test(optionsSource), 'overlay shown with display: flex');
assert(/style\.display\s*=\s*['"]none['"]/.test(optionsSource), 'overlay hidden with display: none');

console.log('--- timer hygiene (QR-03, pitfall 4) ---');
assert(/clearTimeout\(|clearInterval\(/.test(optionsSource), 'timer cleanup present (clearTimeout or clearInterval)');

console.log('--- regression guards ---');
assert(!/pairingQRContainer/.test(optionsSource), 'must not reference legacy #pairingQRContainer (pitfall 1)');

console.log('--- stable server pairing error codes ---');
const expectedPairCodes = {
  GENERATE_FAILED: 'pair_generate_failed',
  TOKEN_REQUIRED: 'pair_token_required',
  TOKEN_INVALID_OR_EXPIRED: 'pair_token_invalid_or_expired',
  TOKEN_ALREADY_USED: 'pair_token_already_used',
  TOKEN_EXPIRED: 'pair_token_expired',
  EXCHANGE_FAILED: 'pair_exchange_failed',
  SESSION_TOKEN_REQUIRED: 'pair_session_token_required',
  SESSION_INVALID: 'pair_session_invalid',
  SESSION_EXPIRED: 'pair_session_expired'
};
const baselineHarness = loadPairRouter(createPairQueries());
assert.deepStrictEqual(baselineHarness.codes, expectedPairCodes, 'pair error-code enum is byte-stable');

const generateFailureHarness = loadPairRouter(createPairQueries({
  cleanExpiredPairingTokens() { throw new Error('database unavailable'); }
}));
assertPairFailure(
  generateFailureHarness.invoke('post', '/generate', { hashKey: 'hash-key' }),
  500,
  'Failed to generate pairing token',
  expectedPairCodes.GENERATE_FAILED
);

assertPairFailure(
  baselineHarness.invoke('post', '/exchange'),
  400,
  'Token required',
  expectedPairCodes.TOKEN_REQUIRED
);
assertPairFailure(
  baselineHarness.invoke('post', '/exchange', { body: { token: 'unknown' } }),
  404,
  'Invalid or expired token',
  expectedPairCodes.TOKEN_INVALID_OR_EXPIRED
);

const usedTokenHarness = loadPairRouter(createPairQueries({
  getPairingToken() {
    return { used: true, expires_at: '2099-01-01T00:00:00.000Z' };
  }
}));
assertPairFailure(
  usedTokenHarness.invoke('post', '/exchange', { body: { token: 'used' } }),
  410,
  'Token already used',
  expectedPairCodes.TOKEN_ALREADY_USED
);

const expiredTokenHarness = loadPairRouter(createPairQueries({
  getPairingToken() {
    return { used: false, expires_at: '2000-01-01T00:00:00.000Z' };
  }
}));
assertPairFailure(
  expiredTokenHarness.invoke('post', '/exchange', { body: { token: 'expired' } }),
  410,
  'Token expired',
  expectedPairCodes.TOKEN_EXPIRED
);

const exchangeFailureHarness = loadPairRouter(createPairQueries({
  getPairingToken() { throw new Error('database unavailable'); }
}));
assertPairFailure(
  exchangeFailureHarness.invoke('post', '/exchange', { body: { token: 'token' } }),
  500,
  'Failed to exchange token',
  expectedPairCodes.EXCHANGE_FAILED
);

assert.deepStrictEqual(
  baselineHarness.invoke('get', '/validate'),
  {
    status: 200,
    body: { valid: false, code: expectedPairCodes.SESSION_TOKEN_REQUIRED }
  },
  'missing validation token has a stable code'
);
assert.deepStrictEqual(
  baselineHarness.invoke('get', '/validate', {
    headers: { 'x-fsb-session-token': 'unknown' }
  }),
  {
    status: 200,
    body: { valid: false, code: expectedPairCodes.SESSION_INVALID }
  },
  'unknown validation token has a stable code'
);

const expiredSessionHarness = loadPairRouter(createPairQueries({
  getSessionByToken() {
    return { session_expires_at: '2000-01-01T00:00:00.000Z' };
  }
}));
assert.deepStrictEqual(
  expiredSessionHarness.invoke('get', '/validate', {
    headers: { 'x-fsb-session-token': 'expired' }
  }),
  {
    status: 200,
    body: {
      valid: false,
      reason: 'expired',
      code: expectedPairCodes.SESSION_EXPIRED
    }
  },
  'expired validation token preserves reason and has a stable code'
);

assertPairFailure(
  baselineHarness.invoke('post', '/revoke'),
  400,
  'Session token required',
  expectedPairCodes.SESSION_TOKEN_REQUIRED
);

console.log('--- npm test wiring ---');
const pkg = JSON.parse(packageJsonRaw);
assert(typeof pkg.scripts.test === 'string', 'test script exists');
assert(pkg.scripts.test.includes('tests/qr-pairing.test.js'), 'qr-pairing.test.js wired into npm test chain');

console.log('All QR pairing controller assertions passed.');
