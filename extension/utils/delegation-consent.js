(function(global) {
  'use strict';

  var CHALLENGE_STORAGE_KEY = 'fsbDelegationConsentChallenges';
  var TRUST_STORAGE_KEY = 'fsbDelegationProviderTrust';
  var PAYLOAD_VERSION = 1;
  var MAX_CHALLENGE_TTL_MS = 5 * 60 * 1000;
  var DEFAULT_CHALLENGE_TTL_MS = MAX_CHALLENGE_TTL_MS;
  var delegationProviders = global.FsbDelegationProviders;
  if (!delegationProviders
      && typeof module !== 'undefined'
      && module.exports
      && typeof require === 'function') {
    delegationProviders = require('./delegation-providers.js');
  }
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  var SHA256_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
  var CHALLENGE_ID_PATTERN = /^dch_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
  var ACCEPTED_IDENTITY_KEYS = Object.freeze([
    'providerId', 'label', 'profileVersion', 'authState', 'billingKind'
  ]);
  var RECORD_KEYS = Object.freeze([
    'acceptedIdentity',
    'challengeId',
    'expiresAt',
    'issuedAt',
    'nonce',
    'taskDigest',
    'trustWriteUsed',
    'v'
  ]);

  function _getChrome() {
    return typeof globalThis !== 'undefined' && globalThis.chrome
      ? globalThis.chrome
      : null;
  }

  function _getCrypto() {
    return typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : null;
  }

  function _isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_error) {
      return false;
    }
  }

  function _hasExactKeys(value, keys) {
    if (!_isPlainRecord(value)) return false;
    try {
      var actual = Reflect.ownKeys(value);
      if (actual.length !== keys.length) return false;
      for (var index = 0; index < keys.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      }
      return actual.every(function(key) {
        return typeof key === 'string' && keys.indexOf(key) !== -1;
      });
    } catch (_error) {
      return false;
    }
  }

  function _emptyChallenges() {
    return Object.create(null);
  }

  function _resultError(code) {
    return { ok: false, code: code };
  }

  function _isCanonicalProviderId(providerId) {
    return !!delegationProviders
      && typeof delegationProviders.isShippedId === 'function'
      && delegationProviders.isShippedId(providerId);
  }

  function _acceptedIdentity(value) {
    if (!delegationProviders
        || typeof delegationProviders.validateAcceptedAgentIdentity !== 'function') return null;
    try {
      return delegationProviders.validateAcceptedAgentIdentity(value);
    } catch (_error) {
      return null;
    }
  }

  function _sameAcceptedIdentity(left, right) {
    return !!left && !!right && ACCEPTED_IDENTITY_KEYS.every(function(key) {
      return left[key] === right[key];
    });
  }

  function _storageError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function _sessionArea() {
    var chromeApi = _getChrome();
    var area = chromeApi && chromeApi.storage ? chromeApi.storage.session : null;
    return area
      && typeof area.get === 'function'
      && typeof area.set === 'function'
      ? area
      : null;
  }

  function _localArea() {
    var chromeApi = _getChrome();
    var area = chromeApi && chromeApi.storage ? chromeApi.storage.local : null;
    return area
      && typeof area.get === 'function'
      && typeof area.set === 'function'
      ? area
      : null;
  }

  function _callStorage(area, method, argument, errorCode) {
    return new Promise(function(resolve, reject) {
      var settled = false;
      function finish(error, value) {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(value);
      }
      function callback(value) {
        var chromeApi = _getChrome();
        var lastError = chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
        finish(lastError ? _storageError(errorCode) : null, value);
      }
      try {
        var returned = area[method](argument, callback);
        if (returned && typeof returned.then === 'function') {
          returned.then(function(value) { finish(null, value); }, function() {
            finish(_storageError(errorCode));
          });
        }
      } catch (_error) {
        finish(_storageError(errorCode));
      }
    });
  }

  function _validateChallengeRecord(record, storageKey) {
    if (!_hasExactKeys(record, RECORD_KEYS)) return false;
    if (record.v !== PAYLOAD_VERSION) return false;
    if (typeof record.challengeId !== 'string' || record.challengeId !== storageKey) return false;
    var match = CHALLENGE_ID_PATTERN.exec(record.challengeId);
    if (!match || record.nonce !== match[1] || !UUID_PATTERN.test(record.nonce)) return false;
    if (!_acceptedIdentity(record.acceptedIdentity)) return false;
    if (typeof record.taskDigest !== 'string' || !SHA256_DIGEST_PATTERN.test(record.taskDigest)) return false;
    if (!Number.isFinite(record.issuedAt) || !Number.isFinite(record.expiresAt)) return false;
    if (record.issuedAt < 0 || record.expiresAt <= record.issuedAt) return false;
    if (record.expiresAt - record.issuedAt > MAX_CHALLENGE_TTL_MS) return false;
    return record.trustWriteUsed === false || record.trustWriteUsed === true;
  }

  function _parseEnvelope(stored) {
    var raw = stored ? stored[CHALLENGE_STORAGE_KEY] : undefined;
    if (raw === undefined) {
      return { v: PAYLOAD_VERSION, challenges: _emptyChallenges() };
    }
    if (!_hasExactKeys(raw, ['challenges', 'v'])
        || raw.v !== PAYLOAD_VERSION
        || !_isPlainRecord(raw.challenges)) {
      throw _storageError('challenge_storage_corrupt');
    }
    var challenges = _emptyChallenges();
    Object.keys(raw.challenges).forEach(function(key) {
      var record = raw.challenges[key];
      challenges[key] = record;
    });
    return { v: PAYLOAD_VERSION, challenges: challenges };
  }

  async function _readEnvelope() {
    var area = _sessionArea();
    if (!area) throw _storageError('challenge_storage_unavailable');
    var stored = await _callStorage(area, 'get', [CHALLENGE_STORAGE_KEY], 'challenge_storage_error');
    return _parseEnvelope(stored);
  }

  async function _writeEnvelope(envelope) {
    var area = _sessionArea();
    if (!area) throw _storageError('challenge_storage_unavailable');
    var keys = Object.keys(envelope.challenges);
    if (keys.length === 0 && typeof area.remove === 'function') {
      await _callStorage(area, 'remove', CHALLENGE_STORAGE_KEY, 'challenge_storage_error');
      return;
    }
    var update = {};
    update[CHALLENGE_STORAGE_KEY] = {
      v: PAYLOAD_VERSION,
      challenges: envelope.challenges
    };
    await _callStorage(area, 'set', update, 'challenge_storage_error');
  }

  function _emptyTrustProviders() {
    return Object.create(null);
  }

  function _parseTrustEnvelope(stored) {
    var raw = stored ? stored[TRUST_STORAGE_KEY] : undefined;
    if (raw === undefined) return { v: PAYLOAD_VERSION, providers: _emptyTrustProviders() };
    if (!_hasExactKeys(raw, ['providers', 'v'])
        || raw.v !== PAYLOAD_VERSION
        || !_isPlainRecord(raw.providers)) {
      throw _storageError('trust_storage_corrupt');
    }
    var providers = _emptyTrustProviders();
    Object.keys(raw.providers).forEach(function(providerId) {
      if (!_isCanonicalProviderId(providerId) || raw.providers[providerId] !== true) {
        throw _storageError('trust_storage_corrupt');
      }
      providers[providerId] = true;
    });
    return { v: PAYLOAD_VERSION, providers: providers };
  }

  async function _readTrustEnvelope() {
    var area = _localArea();
    if (!area) throw _storageError('trust_storage_unavailable');
    var stored = await _callStorage(area, 'get', [TRUST_STORAGE_KEY], 'trust_storage_error');
    return _parseTrustEnvelope(stored);
  }

  async function _writeTrustEnvelope(envelope) {
    var area = _localArea();
    if (!area) throw _storageError('trust_storage_unavailable');
    if (Object.keys(envelope.providers).length === 0 && typeof area.remove === 'function') {
      await _callStorage(area, 'remove', TRUST_STORAGE_KEY, 'trust_storage_error');
      return;
    }
    var update = {};
    update[TRUST_STORAGE_KEY] = {
      v: PAYLOAD_VERSION,
      providers: envelope.providers
    };
    await _callStorage(area, 'set', update, 'trust_storage_error');
  }

  var _challengeChain = Promise.resolve();
  function _withChallengeLock(fn) {
    var next = _challengeChain.then(fn, fn);
    _challengeChain = next.catch(function() { /* keep later authority operations live */ });
    return next;
  }

  function _isExactRequest(value, allowedKeys, requiredKeys) {
    if (!_isPlainRecord(value)) return false;
    try {
      var actual = Reflect.ownKeys(value);
      if (actual.some(function(key) {
        return typeof key !== 'string' || allowedKeys.indexOf(key) === -1;
      })) return false;
      for (var index = 0; index < actual.length; index += 1) {
        var descriptor = Object.getOwnPropertyDescriptor(value, actual[index]);
        if (!descriptor
            || !descriptor.enumerable
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      }
      return requiredKeys.every(function(key) {
        return Object.prototype.hasOwnProperty.call(value, key);
      });
    } catch (_error) {
      return false;
    }
  }

  function _normalizeTtl(value) {
    if (value === undefined) return DEFAULT_CHALLENGE_TTL_MS;
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.min(Math.floor(value), MAX_CHALLENGE_TTL_MS);
  }

  function issueChallenge(request) {
    if (!_isExactRequest(
      request,
      ['acceptedIdentity', 'taskDigest', 'ttlMs'],
      ['acceptedIdentity', 'taskDigest']
    )) {
      return Promise.resolve(_resultError('invalid_challenge_request'));
    }
    var acceptedIdentity = _acceptedIdentity(request.acceptedIdentity);
    if (!acceptedIdentity
        || typeof request.taskDigest !== 'string'
        || !SHA256_DIGEST_PATTERN.test(request.taskDigest)) {
      return Promise.resolve(_resultError('invalid_challenge_request'));
    }
    var ttlMs = _normalizeTtl(request.ttlMs);
    if (ttlMs === null) return Promise.resolve(_resultError('invalid_challenge_request'));

    return _withChallengeLock(async function() {
      try {
        var cryptoApi = _getCrypto();
        if (!cryptoApi || typeof cryptoApi.randomUUID !== 'function') {
          return _resultError('challenge_crypto_unavailable');
        }
        var nonce = cryptoApi.randomUUID();
        if (!UUID_PATTERN.test(nonce)) return _resultError('challenge_crypto_unavailable');
        var challengeId = 'dch_' + nonce;
        var now = Date.now();
        var envelope = await _readEnvelope();
        Object.keys(envelope.challenges).forEach(function(key) {
          var record = envelope.challenges[key];
          if (!_validateChallengeRecord(record, key)) {
            throw _storageError('challenge_storage_corrupt');
          }
          if (record.expiresAt <= now) delete envelope.challenges[key];
        });
        envelope.challenges[challengeId] = {
          v: PAYLOAD_VERSION,
          challengeId: challengeId,
          nonce: nonce,
          acceptedIdentity: acceptedIdentity,
          taskDigest: request.taskDigest,
          issuedAt: now,
          expiresAt: now + ttlMs,
          trustWriteUsed: false
        };
        await _writeEnvelope(envelope);
        return {
          ok: true,
          challengeId: challengeId,
          acceptedIdentity: acceptedIdentity,
          taskDigest: request.taskDigest,
          expiresAt: now + ttlMs
        };
      } catch (error) {
        return _resultError(error && error.code ? error.code : 'challenge_storage_error');
      }
    });
  }

  function consumeChallenge(request) {
    if (!_isExactRequest(
      request,
      ['acceptedIdentity', 'challengeId', 'taskDigest'],
      ['acceptedIdentity', 'challengeId', 'taskDigest']
    )) {
      return Promise.resolve(_resultError('invalid_challenge_request'));
    }
    if (typeof request.challengeId !== 'string'
        || !CHALLENGE_ID_PATTERN.test(request.challengeId)
        || typeof request.taskDigest !== 'string'
        || !SHA256_DIGEST_PATTERN.test(request.taskDigest)) {
      return Promise.resolve(_resultError('invalid_challenge_request'));
    }
    var acceptedIdentity = _acceptedIdentity(request.acceptedIdentity);

    return _withChallengeLock(async function() {
      try {
        var envelope = await _readEnvelope();
        if (!Object.prototype.hasOwnProperty.call(envelope.challenges, request.challengeId)) {
          return _resultError('challenge_not_found');
        }
        var record = envelope.challenges[request.challengeId];
        var corruptSibling = Object.keys(envelope.challenges).some(function(key) {
          if (key === request.challengeId) return false;
          return !_validateChallengeRecord(envelope.challenges[key], key);
        });
        if (corruptSibling) {
          envelope.challenges = _emptyChallenges();
          await _writeEnvelope(envelope);
          return _resultError('challenge_storage_corrupt');
        }
        if (!_validateChallengeRecord(record, request.challengeId)) {
          delete envelope.challenges[request.challengeId];
          await _writeEnvelope(envelope);
          return _resultError('challenge_malformed');
        }
        if (Date.now() >= record.expiresAt) {
          delete envelope.challenges[request.challengeId];
          await _writeEnvelope(envelope);
          return _resultError('challenge_expired');
        }
        var storedIdentity = _acceptedIdentity(record.acceptedIdentity);
        if (!acceptedIdentity || !_sameAcceptedIdentity(storedIdentity, acceptedIdentity)) {
          delete envelope.challenges[request.challengeId];
          await _writeEnvelope(envelope);
          return _resultError('provider_status_refresh');
        }
        delete envelope.challenges[request.challengeId];
        await _writeEnvelope(envelope);
        if (record.taskDigest !== request.taskDigest) {
          return _resultError('challenge_task_mismatch');
        }
        return {
          ok: true,
          challengeId: record.challengeId,
          acceptedIdentity: storedIdentity,
          taskDigest: record.taskDigest
        };
      } catch (error) {
        return _resultError(error && error.code ? error.code : 'challenge_storage_error');
      }
    });
  }

  function getTrusted(providerId) {
    if (!_isCanonicalProviderId(providerId)) return Promise.resolve(false);
    return _withChallengeLock(async function() {
      try {
        var envelope = await _readTrustEnvelope();
        return envelope.providers[providerId] === true;
      } catch (_error) {
        return false;
      }
    });
  }

  function writeTrustFromChallenge(request) {
    if (!_isExactRequest(
      request,
      ['acceptedIdentity', 'challengeId', 'trusted'],
      ['acceptedIdentity', 'challengeId', 'trusted']
    )
        || typeof request.challengeId !== 'string'
        || !CHALLENGE_ID_PATTERN.test(request.challengeId)
        || request.trusted !== true) {
      return Promise.resolve(_resultError('invalid_trust_request'));
    }
    var acceptedIdentity = _acceptedIdentity(request.acceptedIdentity);

    return _withChallengeLock(async function() {
      try {
        var challengeEnvelope = await _readEnvelope();
        if (!Object.prototype.hasOwnProperty.call(challengeEnvelope.challenges, request.challengeId)) {
          return _resultError('challenge_not_found');
        }
        var record = challengeEnvelope.challenges[request.challengeId];
        if (!_validateChallengeRecord(record, request.challengeId)) {
          delete challengeEnvelope.challenges[request.challengeId];
          await _writeEnvelope(challengeEnvelope);
          return _resultError('challenge_malformed');
        }
        if (Date.now() >= record.expiresAt) {
          delete challengeEnvelope.challenges[request.challengeId];
          await _writeEnvelope(challengeEnvelope);
          return _resultError('challenge_expired');
        }
        var storedIdentity = _acceptedIdentity(record.acceptedIdentity);
        if (!acceptedIdentity || !_sameAcceptedIdentity(storedIdentity, acceptedIdentity)) {
          delete challengeEnvelope.challenges[request.challengeId];
          await _writeEnvelope(challengeEnvelope);
          return _resultError('provider_status_refresh');
        }
        if (record.trustWriteUsed === true) {
          return _resultError('trust_challenge_replayed');
        }

        record.trustWriteUsed = true;
        await _writeEnvelope(challengeEnvelope);

        var trustEnvelope = await _readTrustEnvelope();
        trustEnvelope.providers[storedIdentity.providerId] = true;
        await _writeTrustEnvelope(trustEnvelope);
        return { ok: true, providerId: storedIdentity.providerId, trusted: true };
      } catch (error) {
        return _resultError(error && error.code ? error.code : 'trust_storage_error');
      }
    });
  }

  function clearTrusted(request) {
    if (!_isExactRequest(request, ['providerId'], ['providerId'])
        || !_isCanonicalProviderId(request.providerId)) {
      return Promise.resolve(_resultError('invalid_trust_request'));
    }
    return _withChallengeLock(async function() {
      try {
        var envelope = await _readTrustEnvelope();
        if (envelope.providers[request.providerId] === true) {
          delete envelope.providers[request.providerId];
          await _writeTrustEnvelope(envelope);
        }
        return { ok: true, providerId: request.providerId, trusted: false };
      } catch (error) {
        return _resultError(error && error.code ? error.code : 'trust_storage_error');
      }
    });
  }

  var api = Object.freeze({
    CHALLENGE_STORAGE_KEY: CHALLENGE_STORAGE_KEY,
    TRUST_STORAGE_KEY: TRUST_STORAGE_KEY,
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    MAX_CHALLENGE_TTL_MS: MAX_CHALLENGE_TTL_MS,
    issueChallenge: issueChallenge,
    consumeChallenge: consumeChallenge,
    getTrusted: getTrusted,
    writeTrustFromChallenge: writeTrustFromChallenge,
    clearTrusted: clearTrusted
  });

  global.FsbDelegationConsent = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
