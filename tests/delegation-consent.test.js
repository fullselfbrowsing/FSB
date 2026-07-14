'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const modulePath = path.join(repoRoot, 'extension', 'utils', 'delegation-consent.js');
const source = fs.readFileSync(modulePath, 'utf8');
const storageKey = 'fsbDelegationConsentChallenges';

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createStorageHarness() {
  const values = new Map();
  const failures = { get: false, set: false, remove: false };
  const calls = [];

  function operation(method, work) {
    return function(argument, callback) {
      calls.push({ method, argument: clone(argument) });
      const promise = Promise.resolve().then(() => {
        if (failures[method]) throw new Error(`${method} rejected`);
        return work(argument);
      });
      if (typeof callback === 'function') {
        promise.then((result) => callback(result), () => {
          globalThis.chrome.runtime.lastError = { message: `${method} rejected` };
          callback(undefined);
          globalThis.chrome.runtime.lastError = null;
        });
        return undefined;
      }
      return promise;
    };
  }

  const area = {
    get: operation('get', (keys) => {
      const result = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (values.has(key)) result[key] = clone(values.get(key));
      }
      return result;
    }),
    set: operation('set', (update) => {
      for (const key of Object.keys(update)) values.set(key, clone(update[key]));
    }),
    remove: operation('remove', (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    })
  };

  return { area, values, failures, calls };
}

function installChrome(harness, localHarness) {
  globalThis.chrome = {
    storage: {
      session: harness.area,
      ...(localHarness ? { local: localHarness.area } : {})
    },
    runtime: { lastError: null }
  };
}

function loadFresh() {
  delete globalThis.FsbDelegationConsent;
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function getEnvelope(harness) {
  return harness.values.get(storageKey);
}

function getOnlyRecord(harness) {
  const envelope = getEnvelope(harness);
  const keys = Object.keys(envelope.challenges);
  assert.equal(keys.length, 1);
  return envelope.challenges[keys[0]];
}

async function issue(consent, taskDigest = digest('open a background tab'), ttlMs = 60_000) {
  return consent.issueChallenge({ providerId: 'claude-code', taskDigest, ttlMs });
}

async function main() {
  const harness = createStorageHarness();
  const localHarness = createStorageHarness();
  installChrome(harness, localHarness);
  let consent = loadFresh();

  assert.equal(globalThis.FsbDelegationConsent, consent);
  assert.equal(Object.isFrozen(consent), true);
  assert.deepEqual(Object.keys(consent), [
    'CHALLENGE_STORAGE_KEY',
    'TRUST_STORAGE_KEY',
    'PAYLOAD_VERSION',
    'MAX_CHALLENGE_TTL_MS',
    'issueChallenge',
    'consumeChallenge',
    'getTrusted',
    'writeTrustFromChallenge',
    'clearTrusted'
  ]);
  assert.equal(consent.CHALLENGE_STORAGE_KEY, storageKey);
  assert.equal(consent.PAYLOAD_VERSION, 1);
  assert.equal(consent.MAX_CHALLENGE_TTL_MS, 300_000);

  const taskText = 'Open billing and summarize the private account';
  const taskDigest = digest(taskText);
  const issued = await issue(consent, taskDigest);
  assert.equal(issued.ok, true);
  assert.match(issued.challengeId, /^dch_[0-9a-f-]{36}$/);
  const persisted = getOnlyRecord(harness);
  assert.deepEqual(Object.keys(persisted).sort(), [
    'challengeId', 'expiresAt', 'issuedAt', 'nonce', 'providerId',
    'taskDigest', 'trustWriteUsed', 'v'
  ]);
  assert.equal(persisted.challengeId, issued.challengeId);
  assert.equal(persisted.challengeId, `dch_${persisted.nonce}`);
  assert.equal(persisted.providerId, 'claude-code');
  assert.equal(persisted.taskDigest, taskDigest);
  assert.equal(persisted.trustWriteUsed, false);
  assert.doesNotMatch(JSON.stringify(getEnvelope(harness)), new RegExp(taskText));
  for (const forbidden of ['prompt', 'apiKey', 'credential', 'password', 'token']) {
    assert.equal(Object.prototype.hasOwnProperty.call(persisted, forbidden), false);
  }
  assert.equal(harness.calls.some((call) => call.method === 'set'), true);

  const consumed = await consent.consumeChallenge({
    challengeId: issued.challengeId,
    providerId: 'claude-code',
    taskDigest
  });
  assert.deepEqual(consumed, {
    ok: true,
    challengeId: issued.challengeId,
    providerId: 'claude-code',
    taskDigest
  });
  assert.equal(harness.values.has(storageKey), false, 'consume removes the last persisted challenge');
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: issued.challengeId,
    providerId: 'claude-code',
    taskDigest
  }), { ok: false, code: 'challenge_not_found' }, 'replay is denied');

  const concurrent = await issue(consent, digest('concurrent'));
  const concurrentRequest = {
    challengeId: concurrent.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('concurrent')
  };
  const outcomes = await Promise.all([
    consent.consumeChallenge(concurrentRequest),
    consent.consumeChallenge(concurrentRequest)
  ]);
  assert.equal(outcomes.filter((result) => result.ok).length, 1,
    'serialized concurrent consume has exactly one winner');
  assert.equal(outcomes.filter((result) => !result.ok && result.code === 'challenge_not_found').length, 1);

  const unknown = `dch_${crypto.randomUUID()}`;
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: unknown,
    providerId: 'claude-code',
    taskDigest
  }), { ok: false, code: 'challenge_not_found' });

  const providerMismatch = await issue(consent, digest('provider mismatch'));
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: providerMismatch.challengeId,
    providerId: 'codex',
    taskDigest: digest('provider mismatch')
  }), { ok: false, code: 'challenge_provider_mismatch' });
  assert.equal(harness.values.has(storageKey), false, 'provider mismatch burns the exact challenge');

  const taskMismatch = await issue(consent, digest('task one'));
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: taskMismatch.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('task two')
  }), { ok: false, code: 'challenge_task_mismatch' });
  assert.equal(harness.values.has(storageKey), false, 'task mismatch burns the exact challenge');

  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const boundary = await issue(consent, digest('expiry boundary'), 1000);
    now = boundary.expiresAt;
    assert.deepEqual(await consent.consumeChallenge({
      challengeId: boundary.challengeId,
      providerId: 'claude-code',
      taskDigest: digest('expiry boundary')
    }), { ok: false, code: 'challenge_expired' });
    assert.equal(harness.values.has(storageKey), false, 'expired challenge is removed');

    now = 2_000_000;
    const clamped = await issue(consent, digest('bounded ttl'), 999_999_999);
    assert.equal(clamped.expiresAt - now, 300_000, 'TTL is capped at five minutes');
  } finally {
    Date.now = originalNow;
  }
  harness.values.clear();

  const alteredNonce = await issue(consent, digest('altered nonce'));
  getOnlyRecord(harness).nonce = crypto.randomUUID();
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: alteredNonce.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('altered nonce')
  }), { ok: false, code: 'challenge_malformed' });
  assert.equal(harness.values.has(storageKey), false, 'malformed exact record is removed fail closed');

  const alteredId = await issue(consent, digest('altered id'));
  getOnlyRecord(harness).challengeId = `dch_${crypto.randomUUID()}`;
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: alteredId.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('altered id')
  }), { ok: false, code: 'challenge_malformed' });
  assert.equal(harness.values.has(storageKey), false, 'id-tampered exact record is removed fail closed');

  harness.values.set(storageKey, { v: 99, challenges: {} });
  assert.deepEqual(await issue(consent, digest('wrong envelope version')),
    { ok: false, code: 'challenge_storage_corrupt' });
  harness.values.set(storageKey, { v: 1, challenges: [] });
  assert.deepEqual(await issue(consent, digest('malformed envelope')),
    { ok: false, code: 'challenge_storage_corrupt' });
  harness.values.clear();

  const hostileEnvelope = JSON.parse('{"v":1,"challenges":{"__proto__":{"polluted":true}}}');
  harness.values.set(storageKey, hostileEnvelope);
  assert.deepEqual(await issue(consent, digest('prototype key')),
    { ok: false, code: 'challenge_storage_corrupt' });
  assert.equal(({}).polluted, undefined);
  harness.values.clear();
  for (const providerId of ['', 'Claude-Code', '__proto__', 'constructor', 'anthropic']) {
    assert.deepEqual(await consent.issueChallenge({ providerId, taskDigest }),
      { ok: false, code: 'invalid_challenge_request' });
  }
  assert.deepEqual(await consent.issueChallenge({
    providerId: 'claude-code', taskDigest, ttlMs: 1000, consentGranted: true
  }), { ok: false, code: 'invalid_challenge_request' }, 'caller consent booleans are rejected');

  harness.failures.get = true;
  assert.deepEqual(await issue(consent, digest('get failure')),
    { ok: false, code: 'challenge_storage_error' });
  harness.failures.get = false;
  harness.failures.set = true;
  assert.deepEqual(await issue(consent, digest('set failure')),
    { ok: false, code: 'challenge_storage_error' });
  harness.failures.set = false;

  const removeFailure = await issue(consent, digest('remove failure'));
  harness.failures.remove = true;
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: removeFailure.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('remove failure')
  }), { ok: false, code: 'challenge_storage_error' });
  harness.failures.remove = false;
  harness.values.clear();

  delete globalThis.chrome;
  consent = loadFresh();
  assert.deepEqual(await issue(consent, digest('missing storage')),
    { ok: false, code: 'challenge_storage_unavailable' });

  installChrome(harness, localHarness);
  consent = loadFresh();
  const reloadIssue = await issue(consent, digest('reload-safe'));
  consent = loadFresh();
  assert.equal((await consent.consumeChallenge({
    challengeId: reloadIssue.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('reload-safe')
  })).ok, true, 'session challenge survives a forced module reload');

  assert.equal(await consent.getTrusted('claude-code'), false, 'trust defaults strictly false');
  consent = loadFresh();
  assert.equal(await consent.getTrusted('claude-code'), false, 'trust remains false after module reload');
  for (const providerId of ['', 'Claude-Code', 'codex', '__proto__', 'constructor']) {
    assert.equal(await consent.getTrusted(providerId), false, `${providerId || 'empty'} is never trusted`);
  }

  const trustDigest = digest('enable provider-local trust');
  const trustChallenge = await issue(consent, trustDigest);
  assert.deepEqual(await consent.writeTrustFromChallenge({
    challengeId: trustChallenge.challengeId,
    providerId: 'claude-code',
    trusted: true
  }), { ok: true, providerId: 'claude-code', trusted: true });
  assert.equal(getOnlyRecord(harness).trustWriteUsed, true,
    'trust enable marks the challenge slot before granting local trust');
  assert.deepEqual(localHarness.values.get(consent.TRUST_STORAGE_KEY), {
    v: 1,
    providers: { 'claude-code': true }
  }, 'trust is a separate versioned provider-local envelope');
  assert.equal(await consent.getTrusted('claude-code'), true);
  assert.deepEqual(await consent.writeTrustFromChallenge({
    challengeId: trustChallenge.challengeId,
    providerId: 'claude-code',
    trusted: true
  }), { ok: false, code: 'trust_challenge_replayed' }, 'one challenge enables trust at most once');
  assert.equal((await consent.consumeChallenge({
    challengeId: trustChallenge.challengeId,
    providerId: 'claude-code',
    taskDigest: trustDigest
  })).ok, true, 'trust write does not consume the start challenge');

  const trustedStart = await issue(consent, digest('trusted path still consumes'));
  assert.equal((await consent.consumeChallenge({
    challengeId: trustedStart.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('trusted path still consumes')
  })).ok, true, 'trusted path still requires a freshly minted internal challenge');
  assert.deepEqual(await consent.consumeChallenge({
    challengeId: trustedStart.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('trusted path still consumes')
  }), { ok: false, code: 'challenge_not_found' });

  assert.deepEqual(await consent.clearTrusted({ providerId: 'claude-code' }), {
    ok: true, providerId: 'claude-code', trusted: false
  });
  assert.equal(await consent.getTrusted('claude-code'), false, 'clear restores confirmation');
  const postClearChallenge = await issue(consent, digest('confirmation after clear'));
  assert.deepEqual(await consent.clearTrusted({ providerId: 'claude-code' }), {
    ok: true, providerId: 'claude-code', trusted: false
  }, 'authority-reducing clear cannot grant or start a run');
  assert.equal((await consent.consumeChallenge({
    challengeId: postClearChallenge.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('confirmation after clear')
  })).ok, true, 'clear does not consume the fresh challenge required after trust is removed');
  assert.deepEqual(await consent.clearTrusted({ providerId: 'claude-code' }), {
    ok: true, providerId: 'claude-code', trusted: false
  }, 'canonical clear is idempotent');
  for (const request of [
    { providerId: 'Claude-Code' },
    { providerId: 'codex' },
    { providerId: '__proto__' },
    { providerId: 'claude-code', trusted: false }
  ]) {
    assert.deepEqual(await consent.clearTrusted(request),
      { ok: false, code: 'invalid_trust_request' });
  }

  const invalidTrustChallenge = await issue(consent, digest('invalid trust requests'));
  for (const request of [
    { challengeId: invalidTrustChallenge.challengeId, providerId: 'claude-code', trusted: false },
    { challengeId: invalidTrustChallenge.challengeId, providerId: 'codex', trusted: true },
    { challengeId: invalidTrustChallenge.challengeId, providerId: 'Claude-Code', trusted: true },
    { challengeId: invalidTrustChallenge.challengeId, providerId: 'claude-code', trusted: true, extra: true }
  ]) {
    assert.deepEqual(await consent.writeTrustFromChallenge(request),
      { ok: false, code: 'invalid_trust_request' });
    assert.equal(await consent.getTrusted('claude-code'), false,
      'false, provider change, case change, and extra keys leave trust unchanged');
  }
  await consent.consumeChallenge({
    challengeId: invalidTrustChallenge.challengeId,
    providerId: 'claude-code',
    taskDigest: digest('invalid trust requests')
  });

  const trustNowOriginal = Date.now;
  let trustNow = 4_000_000;
  Date.now = () => trustNow;
  try {
    const expiredTrust = await issue(consent, digest('expired trust'), 1000);
    trustNow = expiredTrust.expiresAt;
    assert.deepEqual(await consent.writeTrustFromChallenge({
      challengeId: expiredTrust.challengeId,
      providerId: 'claude-code',
      trusted: true
    }), { ok: false, code: 'challenge_expired' });
    assert.equal(await consent.getTrusted('claude-code'), false);
  } finally {
    Date.now = trustNowOriginal;
  }

  const localGetFailure = await issue(consent, digest('trust local get failure'));
  localHarness.failures.get = true;
  assert.deepEqual(await consent.writeTrustFromChallenge({
    challengeId: localGetFailure.challengeId,
    providerId: 'claude-code',
    trusted: true
  }), { ok: false, code: 'trust_storage_error' });
  assert.equal(await consent.getTrusted('claude-code'), false);
  localHarness.failures.get = false;
  assert.equal(await consent.getTrusted('claude-code'), false,
    'local read failure never defaults trust to true');
  assert.deepEqual(await consent.writeTrustFromChallenge({
    challengeId: localGetFailure.challengeId,
    providerId: 'claude-code',
    trusted: true
  }), { ok: false, code: 'trust_challenge_replayed' },
  'failed local trust access cannot reopen the one-use trust-write slot');

  const localSetFailure = await issue(consent, digest('trust local set failure'));
  localHarness.failures.set = true;
  assert.deepEqual(await consent.writeTrustFromChallenge({
    challengeId: localSetFailure.challengeId,
    providerId: 'claude-code',
    trusted: true
  }), { ok: false, code: 'trust_storage_error' });
  localHarness.failures.set = false;
  assert.equal(await consent.getTrusted('claude-code'), false,
    'failed local trust write leaves trust false');

  const clearFailureChallenge = await issue(consent, digest('clear write failure'));
  assert.equal((await consent.writeTrustFromChallenge({
    challengeId: clearFailureChallenge.challengeId,
    providerId: 'claude-code',
    trusted: true
  })).ok, true);
  localHarness.failures.remove = true;
  assert.deepEqual(await consent.clearTrusted({ providerId: 'claude-code' }),
    { ok: false, code: 'trust_storage_error' });
  localHarness.failures.remove = false;
  assert.equal(await consent.getTrusted('claude-code'), true,
    'failed authority-reducing write is reported rather than claimed');
  assert.equal((await consent.clearTrusted({ providerId: 'claude-code' })).ok, true);
  assert.equal(await consent.getTrusted('claude-code'), false);

  localHarness.values.set(consent.TRUST_STORAGE_KEY, { v: 99, providers: {} });
  assert.equal(await consent.getTrusted('claude-code'), false,
    'malformed trust envelope fails closed');
  localHarness.values.clear();

  const noLocalChallenge = await issue(consent, digest('missing local storage'));
  installChrome(harness, null);
  assert.deepEqual(await consent.writeTrustFromChallenge({
    challengeId: noLocalChallenge.challengeId,
    providerId: 'claude-code',
    trusted: true
  }), { ok: false, code: 'trust_storage_unavailable' });
  assert.equal(await consent.getTrusted('claude-code'), false);
  installChrome(harness, localHarness);

  assert.match(source, /storage\.session/);
  assert.match(source, /storage\.local/);
  assert.match(source, /function _sessionArea\(\)[\s\S]*storage\.session/);
  assert.match(source, /function _localArea\(\)[\s\S]*storage\.local/);
  assert.match(source, /cryptoApi\.randomUUID\(\)/);
  assert.match(source, /SHA256_DIGEST_PATTERN/);
  assert.match(source, /var _challengeChain = Promise\.resolve\(\)/);
  assert.match(source, /_challengeChain\.then\(fn, fn\)/);
  assert.match(source, /delete envelope\.challenges\[request\.challengeId\][\s\S]*await _writeEnvelope\(envelope\)/);
  assert.doesNotMatch(source, /consentGranted/);
  assert.doesNotMatch(source, /\bsetTrusted\b/);
  assert.doesNotMatch(source, /\btaskText\b|\bprompt\b|apiKey|password|credential/);

  delete globalThis.chrome;
  console.log('delegation-consent.test.js: PASS');
}

main().catch((error) => {
  delete globalThis.chrome;
  console.error('delegation-consent.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
