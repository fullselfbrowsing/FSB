'use strict';

const assert = require('assert');
const {
  UniversalProvider
} = require('../extension/ai/universal-provider.js');

let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function abortLike() {
  const error = new Error('mock fetch observed abort');
  error.name = 'AbortError';
  return error;
}

function makeTrackedSignal() {
  const controller = new AbortController();
  const listeners = new Map();
  let maximumListeners = 0;
  const signal = {
    get aborted() {
      return controller.signal.aborted;
    },
    get reason() {
      return controller.signal.reason;
    },
    addEventListener(type, listener, options) {
      if (type !== 'abort' || typeof listener !== 'function') return;
      const wrapped = (event) => {
        if (options && options.once) listeners.delete(listener);
        listener.call(signal, event);
      };
      listeners.set(listener, wrapped);
      maximumListeners = Math.max(maximumListeners, listeners.size);
      controller.signal.addEventListener(type, wrapped, options);
    },
    removeEventListener(type, listener) {
      if (type !== 'abort') return;
      const wrapped = listeners.get(listener);
      if (!wrapped) return;
      listeners.delete(listener);
      controller.signal.removeEventListener(type, wrapped);
    }
  };
  return {
    signal,
    abort(reason) {
      controller.abort(reason);
    },
    listenerCount() {
      return listeners.size;
    },
    maximumListeners() {
      return maximumListeners;
    }
  };
}

function makeProvider() {
  return new UniversalProvider({
    modelProvider: 'lmstudio',
    modelName: 'local-cancellation-model',
    lmstudioBaseUrl: 'localhost:1234/v1'
  });
}

function makeResponse(status, options) {
  const values = options || {};
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'retry-after') return values.retryAfter || null;
        return null;
      }
    },
    text: values.text || (async () => ''),
    json: values.json || (async () => ({ ok: true }))
  };
}

async function expectProviderAbort(promise, secret, message) {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  check(caught !== null, `${message}: rejects`);
  check(caught.name === 'AbortError', `${message}: uses AbortError name`);
  check(caught.code === 'FSB_PROVIDER_ABORTED', `${message}: uses stable provider code`);
  check(!String(caught.message).includes(secret), `${message}: omits caller abort reason`);
  return caught;
}

async function withFetch(mock, operation) {
  const previous = global.fetch;
  global.fetch = mock;
  try {
    return await operation();
  } finally {
    global.fetch = previous;
  }
}

(async () => {
  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const secret = 'SECRET_ALREADY_ABORTED_REASON';
    tracked.abort(secret);
    let endpointCalls = 0;
    let headerCalls = 0;
    let fetchCalls = 0;
    let bodyReads = 0;
    provider.getEndpoint = () => { endpointCalls += 1; return 'http://should-not-run'; };
    provider.getHeaders = () => { headerCalls += 1; return {}; };
    const request = {};
    Object.defineProperty(request, 'messages', {
      enumerable: true,
      get() { bodyReads += 1; return []; }
    });
    await withFetch(async () => {
      fetchCalls += 1;
      return makeResponse(200);
    }, async () => {
      await expectProviderAbort(
        provider.sendRequest(request, { signal: tracked.signal, timeout: 25 }),
        secret,
        'already-aborted caller'
      );
    });
    check(endpointCalls === 0, 'already-aborted caller constructs no endpoint');
    check(headerCalls === 0, 'already-aborted caller constructs no headers');
    check(bodyReads === 0, 'already-aborted caller inspects no request body');
    check(fetchCalls === 0, 'already-aborted caller performs no fetch');
    check(tracked.listenerCount() === 0, 'already-aborted caller installs no listener');
  }

  {
    const provider = makeProvider();
    let fetchCalls = 0;
    let endpointCalls = 0;
    provider.getEndpoint = () => { endpointCalls += 1; return 'http://should-not-run'; };
    let caught = null;
    await withFetch(async () => {
      fetchCalls += 1;
      return makeResponse(200);
    }, async () => {
      try {
        await provider.sendRequest({ messages: [] }, { signal: { aborted: false } });
      } catch (error) {
        caught = error;
      }
    });
    check(caught instanceof TypeError, 'non-AbortSignal-shaped option rejects with TypeError');
    check(caught && caught.code === 'FSB_PROVIDER_SIGNAL_INVALID',
      'invalid signal uses a stable closed-option code');
    check(endpointCalls === 0 && fetchCalls === 0,
      'invalid signal rejects before endpoint or fetch work');
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const secret = 'SECRET_DURING_FETCH_REASON';
    let fetchCalls = 0;
    let started;
    const didStart = new Promise((resolve) => { started = resolve; });
    await withFetch((_endpoint, options) => {
      fetchCalls += 1;
      started();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(abortLike()), { once: true });
      });
    }, async () => {
      const pending = provider.sendRequest(
        { messages: [{ content: 'bounded request' }] },
        { signal: tracked.signal, timeout: 100 }
      );
      await didStart;
      tracked.abort(secret);
      await expectProviderAbort(pending, secret, 'caller abort during fetch');
    });
    check(fetchCalls === 1, 'abort during fetch performs one fetch only');
    check(tracked.listenerCount() === 0, 'fetch abort listener is removed on rejection');
    check(tracked.maximumListeners() === 1, 'fetch composes at most one caller listener');
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const secret = 'SECRET_IGNORED_FETCH_ABORT';
    let internalSignal = null;
    let releaseFetch;
    let fetchStarted;
    const didStartFetch = new Promise((resolve) => { fetchStarted = resolve; });
    await withFetch((_endpoint, options) => {
      internalSignal = options.signal;
      fetchStarted();
      return new Promise((resolve) => { releaseFetch = resolve; });
    }, async () => {
      const pending = provider.sendRequest(
        { messages: [{ content: 'ignored abort' }] },
        { signal: tracked.signal, timeout: 100 }
      );
      await didStartFetch;
      tracked.abort(secret);
      check(internalSignal.aborted === true, 'caller abort reaches the underlying fetch signal');
      releaseFetch(makeResponse(200, { json: async () => ({ late: true }) }));
      await expectProviderAbort(pending, secret, 'late fetch completion after caller abort');
    });
    check(tracked.listenerCount() === 0, 'ignored-fetch settlement removes caller listener');
  }

  for (const status of [429, 503]) {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const secret = `SECRET_BACKOFF_${status}`;
    let fetchCalls = 0;
    let reachedRateLimit;
    const didReachRateLimit = new Promise((resolve) => { reachedRateLimit = resolve; });
    provider.handleRateLimit = async () => {
      reachedRateLimit();
      return { shouldRetry: true, waitTime: 1000 };
    };
    await withFetch(async () => {
      fetchCalls += 1;
      return makeResponse(status, { retryAfter: '1' });
    }, async () => {
      const pending = provider.sendRequest(
        { messages: [{ content: 'rate limited' }] },
        { signal: tracked.signal, timeout: 100 }
      );
      await didReachRateLimit;
      for (let spin = 0; spin < 50 && tracked.listenerCount() === 0; spin += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      check(tracked.listenerCount() === 1,
        `${status} response entered the abort-aware backoff wait`);
      tracked.abort(secret);
      await expectProviderAbort(pending, secret, `caller abort during ${status} backoff`);
    });
    check(fetchCalls === 1, `${status} abort suppresses recursive fetch`);
    check(tracked.listenerCount() === 0, `${status} backoff listener is removed`);
    check(tracked.maximumListeners() === 1, `${status} retry path owns one listener at a time`);
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const secret = 'SECRET_BEFORE_PARAMETER_RETRY';
    let fetchCalls = 0;
    let releaseText;
    let textStarted;
    const didStartText = new Promise((resolve) => { textStarted = resolve; });
    await withFetch(async () => {
      fetchCalls += 1;
      return makeResponse(400, {
        text: () => {
          textStarted();
          return new Promise((resolve) => { releaseText = resolve; });
        }
      });
    }, async () => {
      const pending = provider.sendRequest(
        { messages: [{ content: 'parameter probe' }], temperature: 0.7 },
        { signal: tracked.signal, timeout: 100 }
      );
      await didStartText;
      tracked.abort(secret);
      releaseText('not supported: temperature');
      await expectProviderAbort(pending, secret, 'caller abort before 400 parameter retry');
    });
    check(fetchCalls === 1, 'abort before 400 retry performs no recursive fetch');
    check(tracked.listenerCount() === 0, '400 retry path leaves no caller listener');
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const seenSignals = [];
    const seenBodies = [];
    let attempts = 0;
    provider.fetchWithTimeout = async (_endpoint, fetchOptions, _timeout, callerSignal) => {
      attempts += 1;
      seenSignals.push(callerSignal);
      seenBodies.push(JSON.parse(fetchOptions.body));
      if (attempts === 1) {
        return makeResponse(400, { text: async () => 'not supported: temperature' });
      }
      return makeResponse(200, { json: async () => ({ retried: true }) });
    };
    const result = await provider.sendRequest(
      { messages: [{ content: 'retry success' }], temperature: 0.7, top_p: 0.9 },
      { signal: tracked.signal, timeout: 100 }
    );
    check(result.retried === true && attempts === 2, '400 unsupported parameter retries once');
    check(seenSignals.length === 2 && seenSignals.every((item) => item === tracked.signal),
      '400 recursive retry receives the exact caller signal');
    check(seenBodies[0].temperature === 0.7 && !('temperature' in seenBodies[1]),
      '400 retry preserves parameter-removal behavior');
  }

  for (const status of [429, 503]) {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const seenSignals = [];
    let attempts = 0;
    provider.fetchWithTimeout = async (_endpoint, _fetchOptions, _timeout, callerSignal) => {
      attempts += 1;
      seenSignals.push(callerSignal);
      if (attempts === 1) return makeResponse(status, { retryAfter: '0' });
      return makeResponse(200, { json: async () => ({ recovered: status }) });
    };
    const result = await provider.sendRequest(
      { messages: [{ content: 'service retry' }] },
      { signal: tracked.signal, timeout: 100 }
    );
    check(result.recovered === status && attempts === 2, `${status} still retries successfully`);
    check(seenSignals.every((item) => item === tracked.signal),
      `${status} recursive retry receives the exact caller signal`);
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    let fetchSignal = null;
    let caught = null;
    await withFetch((_endpoint, options) => {
      fetchSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(abortLike()), { once: true });
      });
    }, async () => {
      try {
        await provider.fetchWithTimeout('http://timeout.test', { method: 'POST' }, 10, tracked.signal);
      } catch (error) {
        caught = error;
      }
    });
    check(fetchSignal instanceof AbortSignal, 'timeout path still uses an internal AbortSignal');
    check(caught && caught.message === 'API request timed out after 10ms',
      'internal timeout preserves the exact existing error message');
    check(!caught || caught.code !== 'FSB_PROVIDER_ABORTED',
      'internal timeout remains distinct from caller cancellation');
    check(tracked.listenerCount() === 0, 'timeout settlement removes caller listener');
  }

  {
    const provider = makeProvider();
    let fetchCalls = 0;
    const response = makeResponse(200, { json: async () => ({ compatible: true }) });
    const direct = await withFetch(async (_endpoint, options) => {
      fetchCalls += 1;
      check(options.signal instanceof AbortSignal,
        'backward-compatible fetchWithTimeout still installs timeout signal');
      return response;
    }, () => provider.fetchWithTimeout('http://compat.test', { method: 'POST' }, 100));
    check(direct === response && fetchCalls === 1,
      'fetchWithTimeout remains compatible without a caller signal');
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    let fetchCalls = 0;
    const result = await withFetch(async () => {
      fetchCalls += 1;
      return makeResponse(200, { json: async () => ({ complete: true }) });
    }, () => provider.sendRequest(
      { messages: [{ content: 'successful request' }] },
      { signal: tracked.signal, timeout: 100 }
    ));
    check(result.complete === true && fetchCalls === 1, 'ordinary signalled request succeeds');
    check(tracked.listenerCount() === 0, 'successful request removes caller listener');
    check(tracked.maximumListeners() === 1, 'successful request links one listener only');
  }

  {
    const provider = makeProvider();
    const tracked = makeTrackedSignal();
    const secret = 'SECRET_DURING_JSON';
    let internalSignal = null;
    let jsonStarted;
    const didStartJson = new Promise((resolve) => { jsonStarted = resolve; });
    await withFetch(async (_endpoint, options) => {
      internalSignal = options.signal;
      return makeResponse(200, {
        json: () => {
          jsonStarted();
          return new Promise(() => {});
        }
      });
    }, async () => {
      const pending = provider.sendRequest(
        { messages: [{ content: 'late response' }] },
        { signal: tracked.signal, timeout: 100 }
      );
      await didStartJson;
      check(tracked.listenerCount() === 1,
        'caller listener remains linked while JSON body consumption is pending');
      tracked.abort(secret);
      await expectProviderAbort(pending, secret, 'caller abort during response parsing');
    });
    check(internalSignal && internalSignal.aborted === true,
      'caller abort during JSON consumption aborts the internal fetch signal');
    check(tracked.listenerCount() === 0, 'late-response cancellation leaves no listener');
  }

  {
    const provider = makeProvider();
    let internalSignal = null;
    let textStarted;
    const didStartText = new Promise((resolve) => { textStarted = resolve; });
    let caught = null;
    await withFetch(async (_endpoint, options) => {
      internalSignal = options.signal;
      return makeResponse(400, {
        text: () => {
          textStarted();
          return new Promise(() => {});
        }
      });
    }, async () => {
      const pending = provider.sendRequest(
        { messages: [{ content: 'stalled error body' }] },
        { timeout: 10 }
      );
      await didStartText;
      try {
        await pending;
      } catch (error) {
        caught = error;
      }
    });
    check(internalSignal && internalSignal.aborted === true,
      'timeout during text consumption aborts the internal fetch signal');
    check(caught && caught.message === 'API request timed out after 10ms',
      'a never-settling text body rejects at the configured timeout');
    check(!caught || caught.code !== 'FSB_PROVIDER_ABORTED',
      'response-body timeout remains distinct from caller cancellation');
  }

  {
    const provider = makeProvider();
    const rawMarker = 'raw_provider_secret';
    const logged = [];
    const previousLog = console.log;
    let caught = null;
    console.log = (...values) => { logged.push(values.join(' ')); };
    try {
      await withFetch(async () => makeResponse(400, {
        text: async () => `${rawMarker} not supported`
      }), async () => {
        try {
          await provider.sendRequest(
            { messages: [{ content: 'closed parameter probe' }], temperature: 0.7 },
            { timeout: 100 }
          );
        } catch (error) {
          caught = error;
        }
      });
    } finally {
      console.log = previousLog;
    }
    check(caught && caught.status === 400,
      'an unrecognized response-derived parameter is not retried');
    check(logged.every((entry) => !entry.includes(rawMarker)),
      'raw provider error bytes never reach console logs');
  }

  console.log(`universal-provider-cancellation: ${passed} passed, 0 failed`);
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
