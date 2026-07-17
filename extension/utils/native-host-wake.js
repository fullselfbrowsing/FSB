(function(global) {
  'use strict';

  var NATIVE_HOST_NAME = 'io.github.fullselfbrowsing.fsb_native_host';
  var NATIVE_PROTOCOL_VERSION = 1;
  var PROBE_TIMEOUT_MS = 250;
  var WAKE_TIMEOUT_MS = 12000;
  var FAILURE_COOLDOWN_MS = 5000;
  var SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
  var RESPONSE_KEYS = Object.freeze(['v', 'correlationId', 'outcome', 'reason']);
  var OUTCOME_REASONS = Object.freeze({
    already_running: Object.freeze(['daemon_already_ready']),
    started: Object.freeze(['daemon_started_ready']),
    unavailable: Object.freeze([
      'daemon_identity_mismatch',
      'daemon_protocol_mismatch',
      'runtime_invalid'
    ]),
    failed: Object.freeze([
      'wake_lock_timeout',
      'serve_spawn_failed',
      'serve_readiness_timeout',
      'internal_failure'
    ])
  });
  var CLOSED_FAILURE = Object.freeze({ ok: false });

  var presence = 'unknown';
  var presenceSettled = false;
  var presencePromise = null;
  var wakeInFlight = null;
  var cooldownUntil = 0;

  function runtimeApi() {
    var chromeApi = global.chrome;
    return chromeApi && chromeApi.runtime ? chromeApi.runtime : null;
  }

  function clockNow() {
    try {
      var value = global.Date && typeof global.Date.now === 'function'
        ? global.Date.now()
        : Date.now();
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (_error) {
      return 0;
    }
  }

  function mintSafeId() {
    var cryptoApi = global.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      var uuid = cryptoApi.randomUUID().replace(/-/g, '');
      if (SAFE_ID_PATTERN.test(uuid)) return uuid;
    }
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      var bytes = new Uint8Array(24);
      cryptoApi.getRandomValues(bytes);
      var encoded = Array.from(bytes, function(value) {
        return value.toString(16).padStart(2, '0');
      }).join('');
      if (SAFE_ID_PATTERN.test(encoded)) return encoded;
    }
    throw new Error('native_wake_id_unavailable');
  }

  function tagWorkPromise(promise, attemptId) {
    Object.defineProperty(promise, 'attemptId', {
      value: attemptId,
      writable: false,
      enumerable: false,
      configurable: false
    });
    return promise;
  }

  function exactResponseFields(value) {
    try {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      if (Object.getPrototypeOf(value) !== Object.prototype) return null;
      var keys = Reflect.ownKeys(value);
      if (keys.length !== RESPONSE_KEYS.length) return null;
      var fields = Object.create(null);
      for (var index = 0; index < RESPONSE_KEYS.length; index += 1) {
        var key = RESPONSE_KEYS[index];
        if (keys[index] !== key) return null;
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor
            || descriptor.enumerable !== true
            || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
        fields[key] = descriptor.value;
      }
      return fields;
    } catch (_error) {
      return null;
    }
  }

  function validateWakeResponse(value, correlationId) {
    var fields = exactResponseFields(value);
    if (!fields
        || fields.v !== NATIVE_PROTOCOL_VERSION
        || fields.correlationId !== correlationId
        || !SAFE_ID_PATTERN.test(fields.correlationId)
        || typeof fields.outcome !== 'string'
        || !Object.prototype.hasOwnProperty.call(OUTCOME_REASONS, fields.outcome)
        || typeof fields.reason !== 'string'
        || OUTCOME_REASONS[fields.outcome].indexOf(fields.reason) === -1) {
      return CLOSED_FAILURE;
    }
    if (fields.outcome !== 'already_running' && fields.outcome !== 'started') {
      return CLOSED_FAILURE;
    }
    return Object.freeze({
      ok: true,
      outcome: fields.outcome,
      reason: fields.reason
    });
  }

  function getPresence() {
    return presence;
  }

  function probePresence() {
    if (presenceSettled) return Promise.resolve(presence);
    if (presencePromise) return presencePromise;

    presencePromise = new Promise(function(resolve) {
      var runtime = runtimeApi();
      var port = null;
      var timer = null;
      var settled = false;

      function cleanup() {
        if (timer !== null) {
          global.clearTimeout(timer);
          timer = null;
        }
        try {
          if (port && port.onMessage && typeof port.onMessage.removeListener === 'function') {
            port.onMessage.removeListener(onMessage);
          }
          if (port && port.onDisconnect && typeof port.onDisconnect.removeListener === 'function') {
            port.onDisconnect.removeListener(onDisconnect);
          }
        } catch (_error) { /* listener cleanup is best effort */ }
      }

      function finish(nextPresence, closePort) {
        if (settled) return;
        settled = true;
        presence = nextPresence;
        presenceSettled = true;
        cleanup();
        if (closePort) {
          try {
            if (port && typeof port.disconnect === 'function') port.disconnect();
          } catch (_error) { /* the advisory fact is already closed */ }
        }
        resolve(presence);
      }

      function onMessage() {
        finish('present', true);
      }

      function onDisconnect() {
        var missing = false;
        try { missing = !!(runtime && runtime.lastError); } catch (_error) { missing = false; }
        finish(missing ? 'absent' : 'present', false);
      }

      if (!runtime || typeof runtime.connectNative !== 'function') {
        finish('unknown', false);
        return;
      }
      try {
        port = runtime.connectNative(NATIVE_HOST_NAME);
        if (!port
            || !port.onMessage
            || typeof port.onMessage.addListener !== 'function'
            || !port.onDisconnect
            || typeof port.onDisconnect.addListener !== 'function') {
          finish('unknown', true);
          return;
        }
        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(onDisconnect);
        timer = global.setTimeout(function() {
          finish('present', true);
        }, PROBE_TIMEOUT_MS);
      } catch (_error) {
        finish('unknown', true);
      }
    });
    return presencePromise;
  }

  function ensureWake() {
    if (wakeInFlight) return wakeInFlight.promise;

    var attemptId;
    try {
      attemptId = mintSafeId();
    } catch (_error) {
      throw new Error('native_wake_unavailable');
    }
    if (clockNow() < cooldownUntil) {
      return tagWorkPromise(Promise.resolve(CLOSED_FAILURE), attemptId);
    }

    var correlationId;
    try {
      correlationId = mintSafeId();
    } catch (_error) {
      return tagWorkPromise(Promise.resolve(CLOSED_FAILURE), attemptId);
    }

    var token = Object.freeze({ attemptId: attemptId, correlationId: correlationId });
    var work = new Promise(function(resolve) {
      var runtime = runtimeApi();
      var timer = null;
      var settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        if (timer !== null) {
          global.clearTimeout(timer);
          timer = null;
        }
        if (!result || result.ok !== true) {
          cooldownUntil = Math.max(cooldownUntil, clockNow() + FAILURE_COOLDOWN_MS);
          resolve(CLOSED_FAILURE);
          return;
        }
        resolve(result);
      }

      timer = global.setTimeout(function() {
        finish(CLOSED_FAILURE);
      }, WAKE_TIMEOUT_MS);

      if (!runtime || typeof runtime.sendNativeMessage !== 'function') {
        finish(CLOSED_FAILURE);
        return;
      }
      try {
        runtime.sendNativeMessage(
          NATIVE_HOST_NAME,
          Object.freeze({
            v: NATIVE_PROTOCOL_VERSION,
            action: 'wake',
            correlationId: correlationId
          }),
          function(response) {
            if (settled) return;
            try {
              if (runtime.lastError) {
                finish(CLOSED_FAILURE);
                return;
              }
            } catch (_error) {
              finish(CLOSED_FAILURE);
              return;
            }
            finish(validateWakeResponse(response, correlationId));
          }
        );
      } catch (_error) {
        finish(CLOSED_FAILURE);
      }
    });

    var tracked;
    tracked = work.finally(function() {
      if (wakeInFlight && wakeInFlight.token === token) wakeInFlight = null;
    });
    tagWorkPromise(tracked, attemptId);
    wakeInFlight = Object.freeze({ token: token, promise: tracked });
    return tracked;
  }

  global.FsbNativeHostWake = Object.freeze({
    probePresence: probePresence,
    getPresence: getPresence,
    ensureWake: ensureWake
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
