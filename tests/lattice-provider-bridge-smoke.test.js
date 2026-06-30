'use strict';

const { validatePublicLatticePin } = require('./helpers/lattice-public-pin.js');

/**
 * Phase 6 Plan 06-00 (v0.10.0-attempt-2) -- Lattice provider-bridge
 * Wave 0 scaffold smoke.
 *
 * Purpose: per-task verification harness for every downstream Phase 6
 * plan (06-01 .. 06-05). Per Nyquist validation contract
 * (06-VALIDATION.md): every downstream Phase 6 task references a Part
 * of this smoke; the file MUST exist with placeholder Parts wired in
 * BEFORE any plan that depends on the bridge runs, so executors can
 * incrementally fill them without flipping the &&-chain red.
 *
 * Coverage map (Part -> downstream Plan -> REQ):
 *   Part 1: Surface presence (Wave 0 delivers 7 Lattice factory checks
 *           NOW; Plan 06-01 + Plan 06-03 add executeViaBridge +
 *           offscreen handler reachability later) -> FINT-07a
 *   Part 2: Per-provider message-bus round-trip (Plan 06-01 fills with
 *           mock fetch x 7) -> FINT-07b
 *   Part 3: Error envelope shape (Plan 06-01 + Plan 06-03 fill with
 *           adapter_error / host_unreachable / invalid_provider) -> FINT-07b
 *   Part 4: AbortController propagation (Plan 06-01 fills with 2 PASS) -> FINT-07b
 *   Part 5: Flag/trim/options grep (Plan 06-02 + Plan 06-03 + Plan 06-04
 *           fill with importScripts insertion + flag-on/off +
 *           saveSettings trim + checkApiConnection field-read) -> FINT-08a..d
 *   Part 6: INV byte-freeze (Plan 06-05 fills with INV-04 setTimeout
 *           iterator byte-freeze + INV-01/02 tool-definitions-parity +
 *           INV-05 deprecated-module absence + INV-06 Lattice byte-freeze) -> INV-04
 *
 * Wave 0 deliverable shape:
 *   - 7 PASSes in Part 1 (the 7 Lattice provider factory functions
 *     reachable via `await import('lattice')`).
 *   - 5 placeholder PASSes (one per Part 2..6) so the file is GREEN by
 *     itself; downstream plans replace the placeholder with real
 *     assertions and the chain stays green.
 *   - 12 PASS / 0 FAIL minimum.
 *
 * Real-runtime conventions (FSB project rule "real-runtime tests, not
 * static-text"):
 *   - Real `await import('lattice')` (no mocks for Lattice itself).
 *   - chrome.runtime + chrome.offscreen mock helpers defined at module
 *     top (re-usable by downstream Part fills). NOT polluting
 *     globalThis until each Part needs to -- downstream Parts will set
 *     `globalThis.chrome = ...` inside their own scope.
 *   - Helpers exported at module bottom so Plans 06-01 / 06-02 /
 *     06-03 / 06-04 / 06-05 can `require()` them.
 *   - Node built-in only (no third-party test framework; CJS-only).
 *
 * Run: node tests/lattice-provider-bridge-smoke.test.js
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 6 Plan 06-00
 */

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

/**
 * In-memory chrome.runtime mock. Mirrors Chrome 105+ behavior:
 *   - onMessage.addListener(fn) registers a listener.
 *   - sendMessage(message) returns a Promise; rejects with the standard
 *     'Could not establish connection' error when no listener is
 *     registered; otherwise dispatches to the first listener that
 *     returns true (keeping the channel open for async sendResponse).
 *   - sender.id is set to runtime.id so the standard origin-check
 *     pattern `if (sender.id !== chrome.runtime.id) return false;` works.
 *
 * Phase 6 downstream plans set `globalThis.chrome = { runtime: ... }`
 * with this mock to exercise the SW <-> offscreen bridge round-trip.
 *
 * @param {Function|undefined} initialHandler -- optional first listener.
 * @returns {Object} chrome.runtime-shaped mock.
 */
function createChromeRuntimeMock(initialHandler) {
  const listeners = [];
  if (typeof initialHandler === 'function') listeners.push(initialHandler);
  const runtime = {
    id: 'fsb-test-extension-id',
    onMessage: {
      addListener(fn) {
        if (typeof fn === 'function') listeners.push(fn);
      },
      removeListener(fn) {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      }
    },
    sendMessage(message) {
      return new Promise((resolve, reject) => {
        if (listeners.length === 0) {
          // Chrome 105+ behavior: rejects when no listener registered.
          reject(new Error('Could not establish connection. Receiving end does not exist.'));
          return;
        }
        const sender = { id: runtime.id };
        let responded = false;
        const sendResponse = (envelope) => {
          if (!responded) {
            responded = true;
            resolve(envelope);
          }
        };
        let kept = false;
        for (const l of listeners) {
          let ret;
          try {
            ret = l(message, sender, sendResponse);
          } catch (err) {
            reject(err);
            return;
          }
          if (ret === true) {
            kept = true;
            break;
          }
        }
        if (!kept && !responded) resolve(undefined);
      });
    },
    _listenerCount() {
      return listeners.length;
    },
    _listeners() {
      // Plan 06-01 Task 2 extension: expose the registered listeners array
      // so the smoke can grab the Phase 6 listener directly (it is the
      // LAST one registered because the offscreen module registers Phase 5
      // first and Phase 6 second). Forward-compatible with Plan 06-00's
      // _listenerCount() introspection.
      return listeners;
    }
  };
  return runtime;
}

/**
 * In-memory chrome.offscreen mock. Tracks createCount so downstream
 * Part 5 fills can assert idempotency of `ensureLatticeOffscreen()`
 * (call twice -> createDocument called exactly once).
 *
 * Mirrors the real Chrome offscreen API:
 *   - hasDocument() returns true after createDocument() resolves.
 *   - createDocument() throws if a document is already open (Chrome's
 *     'Only a single offscreen document may be created.' constraint).
 *   - closeDocument() resets the flag.
 *
 * @returns {Object} chrome.offscreen-shaped mock with `_createCount()` introspection.
 */
function createChromeOffscreenMock() {
  let docOpen = false;
  let createCount = 0;
  return {
    async hasDocument() {
      return docOpen;
    },
    async createDocument(_opts) {
      if (docOpen) {
        throw new Error('Only a single offscreen document may be created.');
      }
      docOpen = true;
      createCount++;
      return undefined;
    },
    async closeDocument() {
      docOpen = false;
    },
    _createCount() {
      return createCount;
    }
  };
}

/**
 * Track whether the offscreen module has been imported once already
 * (dynamic import() caches modules; the IIFE side-effects only run on
 * the first import, so subsequent calls would get the same listeners
 * but registered against the OLD globalThis.chrome reference). Plan
 * 06-01 loads the module exactly once and reuses the captured handler
 * across all Parts 1-4.
 */
let _offscreenModulePromise = null;

/**
 * Load the offscreen handler module's `chrome.runtime.onMessage` listener
 * function (so the smoke can dispatch messages directly via the
 * createChromeRuntimeMock above without spinning up a real Chrome
 * offscreen page).
 *
 * Replaces the Wave 0 placeholder per Plan 06-01 Task 2:
 *   1. Set globalThis.chrome to the supplied mock BEFORE the dynamic
 *      import so the offscreen module's top-level addListener side-
 *      effects land in the mock's listeners array.
 *   2. Suppress the MODULE_TYPELESS_PACKAGE_JSON warning that Node emits
 *      when dynamic-importing extension/offscreen/lattice-host.js (an
 *      ESM file living in a directory whose package.json lacks
 *      "type": "module"). The warning is harmless (the file IS ESM by
 *      virtue of its `import` statements) but pollutes test output.
 *      The override is scoped to the try/finally around the dynamic
 *      import only; all other warnings pass through verbatim
 *      (Warning 4 fix per checker feedback).
 *   3. Return the LAST listener registered (the Phase 6 one; the Phase
 *      5 lattice-step-transition handler is registered first because
 *      its addListener call sits earlier in the module).
 *
 * @param {Object} chromeMock -- {runtime, offscreen?} mock from
 *   createChromeRuntimeMock + createChromeOffscreenMock
 * @returns {Promise<Function>}
 */
async function loadOffscreenHandlerSource(chromeMock) {
  if (chromeMock) {
    globalThis.chrome = chromeMock;
  }

  // Warning 4 fix (Filter: MODULE_TYPELESS_PACKAGE_JSON).
  // Suppression scoped to the dynamic-import try/finally only.
  const origEmitWarning = process.emitWarning;
  process.emitWarning = (msg, ...rest) => {
    if (String(msg).includes('MODULE_TYPELESS_PACKAGE_JSON')) return;
    return origEmitWarning.call(process, msg, ...rest);
  };

  try {
    if (!_offscreenModulePromise) {
      _offscreenModulePromise = import('../extension/offscreen/lattice-host.js');
    }
    await _offscreenModulePromise;
  } catch (err) {
    console.error('  WARN: dynamic import of lattice-host.js failed:', err && err.message ? err.message : err);
    throw err;
  } finally {
    process.emitWarning = origEmitWarning;
  }

  // Phase 6 listener is the LAST registered (Phase 5 step-transition
  // handler registers first because its addListener call appears earlier
  // in the offscreen module).
  const listeners = chromeMock && chromeMock.runtime && chromeMock.runtime._listeners
    ? chromeMock.runtime._listeners()
    : [];
  return listeners[listeners.length - 1];
}

(async () => {
  console.log('\n--- Lattice Phase 6 provider-bridge smoke ---');

  // ---- Load Lattice via bare specifier (Plan 05-03 re-export) ----
  let lattice;
  try {
    lattice = await import('lattice');
  } catch (err) {
    console.error('  FAIL: dynamic import("lattice") threw:', err && err.message ? err.message : err);
    console.error('         Did you run npm install?');
    process.exit(1);
  }

  // ---- Part 1: surface presence (7 Lattice provider factories) ----
  console.log('\n--- Part 1: surface presence (7 Lattice provider factories) ---');

  // The 7 factory functions Phase 6 dispatches to via the bridge.
  // Plan 06-01 + Plan 06-03 add executeViaBridge + offscreen handler
  // presence checks here.
  passAssertEqual(typeof lattice.createXaiProvider, 'function', 'lattice.createXaiProvider reachable');
  passAssertEqual(typeof lattice.createOpenAIProvider, 'function', 'lattice.createOpenAIProvider reachable');
  passAssertEqual(typeof lattice.createAnthropicProvider, 'function', 'lattice.createAnthropicProvider reachable');
  passAssertEqual(typeof lattice.createGeminiProvider, 'function', 'lattice.createGeminiProvider reachable');
  passAssertEqual(typeof lattice.createOpenRouterProvider, 'function', 'lattice.createOpenRouterProvider reachable');
  passAssertEqual(typeof lattice.createLmStudioProvider, 'function', 'lattice.createLmStudioProvider reachable');
  passAssertEqual(typeof lattice.createOpenAICompatibleProvider, 'function', 'lattice.createOpenAICompatibleProvider reachable');

  // Plan 06-03 fill: executeViaBridge present (CJS + globalThis)
  // Load the bridge module; it uses globalThis pattern for the SW + CJS for tests.
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
    try { globalThis.crypto = require('crypto').webcrypto; } catch (_e) { /* node < 18 */ }
  }
  const bridgeMod = require('../extension/ai/lattice-provider-bridge.js');
  passAssertEqual(typeof bridgeMod.executeViaBridge, 'function', 'executeViaBridge exported via CJS (require)');
  passAssertEqual(typeof globalThis.executeViaBridge, 'function', 'executeViaBridge exported via globalThis (classic SW)');

  // ---- Part 1 (extended): offscreen handler surface presence ----
  // Plan 06-01 Task 2 fill: load extension/offscreen/lattice-host.js
  // through the chrome.runtime mock; assert the Phase 6 handler is
  // registered as a function; assert cross-extension senders are
  // rejected via the sender.id !== chrome.runtime.id idiom.
  console.log('\n--- Part 1: offscreen handler surface presence ---');
  const part1Chrome = {
    runtime: createChromeRuntimeMock(),
    offscreen: createChromeOffscreenMock(),
  };
  part1Chrome.runtime.id = 'fsb-test-extension-id';
  // The offscreen module's top-level (async) IIFE generates an Ed25519
  // keypair via SubtleCrypto -- safe in Node 19+ (FSB Node floor 16
  // satisfied via dynamic-import path on Node 19+). Capture the Phase 6
  // listener via loadOffscreenHandlerSource (Phase 5 listener is also
  // registered as a side-effect; we want the LAST listener which is
  // Phase 6's).
  const handler = await loadOffscreenHandlerSource(part1Chrome);
  passAssertEqual(typeof handler, 'function', 'Phase 6 lattice-provider listener registered');
  // Cross-extension reject: sender.id mismatch -> listener returns false
  // without dispatching to either branch (Phase 5 idiom verbatim).
  const fakeAttackerSender = { id: 'attacker-extension-id' };
  const crossExtResult = handler(
    { type: 'lattice-provider-execute', provider: 'xai', requestId: 'r-attack' },
    fakeAttackerSender,
    () => {}
  );
  passAssertEqual(crossExtResult, false, 'cross-extension sender rejected (origin check)');

  // ---- Part 2: Per-provider message-bus round-trip (Plan 06-01 fill) ----
  // 7 PASSes (one per provider) -- for each FSB provider key, wire a
  // mock fetch returning a provider-shape body, dispatch a
  // lattice-provider-execute message through the captured handler, and
  // assert the response envelope round-trips the raw HTTP body via
  // envelope.response.rawResponse.
  console.log('\n--- Part 2: per-provider message-bus round-trip ---');

  const PER_PROVIDER_FAKE_BODY = {
    xai:        { id: 'xai-1',  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    openai:     { id: 'oai-1',  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    anthropic:  { id: 'anth-1', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } },
    gemini:     { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } },
    openrouter: { id: 'or-1',   choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    lmstudio:   { id: 'lms-1',  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    custom:     { id: 'cus-1',  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
  };

  // Builds a fake fetch that resolves with the provider-shape body.
  // Mirrors tests/lattice-providers-smoke.test.js conventions (Phase 4).
  function makeFakeFetch(body, status) {
    if (typeof status !== 'number') status = 200;
    return async function (_url, _opts) {
      return {
        ok: status >= 200 && status < 300,
        status: status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: { get: () => null },
      };
    };
  }

  const validSender = { id: 'fsb-test-extension-id' };

  for (const providerKey of ['xai','openai','anthropic','gemini','openrouter','lmstudio','custom']) {
    globalThis.fetch = makeFakeFetch(PER_PROVIDER_FAKE_BODY[providerKey], 200);
    let envelope = null;
    await new Promise((resolve) => {
      handler(
        {
          type: 'lattice-provider-execute',
          requestId: 'rp-' + providerKey,
          provider: providerKey,
          config: {
            apiKey: 'fsb-fake-test-key',
            model: 'm',
            baseUrl: providerKey === 'custom' ? 'http://example.com/v1' : undefined,
          },
          requestBody: { messages: [{ role: 'user', content: 'hi' }] },
          mode: 'autopilot',
        },
        validSender,
        (env) => { envelope = env; resolve(); }
      );
    });
    passAssert(envelope && envelope.ok === true, providerKey + ': envelope.ok === true');
    passAssertEqual(
      JSON.stringify(envelope && envelope.response && envelope.response.rawResponse),
      JSON.stringify(PER_PROVIDER_FAKE_BODY[providerKey]),
      providerKey + ': rawResponse round-trips'
    );
  }

  // ---- Part 3: Error envelope shape (Plan 06-01 fill) ----
  // 3 PASSes:
  //   (a) fetch throws -> envelope.error.kind === 'fetch_error'
  //   (b) unknown provider -> envelope.error.kind === 'invalid_provider'
  //   (c) non-2xx fetch response -> envelope.error.message surfaces the status
  // The host_unreachable case is exercised by Plan 06-03 via the bridge
  // shim (this Part is the OFFSCREEN-side envelope checks; the SW-side
  // host_unreachable detection is the bridge's concern).
  console.log('\n--- Part 3: error envelope shape ---');

  // (a) fetch_error: network throws synchronously inside fetch
  globalThis.fetch = async () => { throw new Error('network down'); };
  let env3a = null;
  await new Promise((resolve) => {
    handler(
      { type: 'lattice-provider-execute', requestId: 'r3a', provider: 'xai', config: { apiKey: 'k', model: 'm' }, requestBody: {}, mode: 'autopilot' },
      validSender,
      (e) => { env3a = e; resolve(); }
    );
  });
  passAssertEqual(env3a && env3a.ok, false, 'fetch failure -> ok:false');
  passAssertEqual(env3a && env3a.error && env3a.error.kind, 'fetch_error', 'fetch failure -> kind:fetch_error');

  // (b) invalid_provider: synchronous envelope before any factory call
  let env3b = null;
  handler(
    { type: 'lattice-provider-execute', requestId: 'r3b', provider: 'xyzzy', config: {}, requestBody: {}, mode: 'autopilot' },
    validSender,
    (e) => { env3b = e; }
  );
  passAssertEqual(env3b && env3b.error && env3b.error.kind, 'invalid_provider', 'unknown provider -> kind:invalid_provider');

  // (c) non-2xx: 400 response with provider-error JSON body
  globalThis.fetch = makeFakeFetch({ error: { message: 'Incorrect API key provided: xa***cy' } }, 400);
  let env3c = null;
  await new Promise((resolve) => {
    handler(
      { type: 'lattice-provider-execute', requestId: 'r3c', provider: 'xai', config: { apiKey: 'k', model: 'm' }, requestBody: {}, mode: 'autopilot' },
      validSender,
      (e) => { env3c = e; resolve(); }
    );
  });
  passAssertEqual(env3c && env3c.ok, false, '400 status -> ok:false');
  passAssert(env3c && env3c.error && /400/.test(String(env3c.error.message)), 'fetch failure surfaces status in error.message');

  // Plan 06-03 fill: host_unreachable cases (SW-side bridge throws)
  // (a) sendMessage rejects (no listener / channel closed)
  const noListenerChrome = { runtime: createChromeRuntimeMock() /* no handler registered */ };
  noListenerChrome.runtime.id = 'fsb-test-extension-id';
  globalThis.chrome = noListenerChrome;
  let thrown3d = null;
  try {
    await bridgeMod.executeViaBridge('xai', { apiKey: 'k', model: 'm' }, {}, { mode: 'autopilot' });
  } catch (e) { thrown3d = e; }
  passAssertEqual(thrown3d && thrown3d.code, 'host_unreachable', 'sendMessage reject -> err.code:host_unreachable');

  // (b) sendMessage resolves to undefined (listener returned false / didn't sendResponse)
  const undefinedChrome = { runtime: createChromeRuntimeMock((msg, sender, sendResponse) => false) };
  undefinedChrome.runtime.id = 'fsb-test-extension-id';
  globalThis.chrome = undefinedChrome;
  let thrown3e = null;
  try {
    await bridgeMod.executeViaBridge('xai', { apiKey: 'k', model: 'm' }, {}, { mode: 'autopilot' });
  } catch (e) { thrown3e = e; }
  passAssertEqual(thrown3e && thrown3e.code, 'host_unreachable', 'sendMessage resolves undefined -> err.code:host_unreachable');

  // (c) pre-aborted signal throws synchronously
  const ac = new AbortController();
  ac.abort();
  let thrown3f = null;
  try {
    await bridgeMod.executeViaBridge('xai', { apiKey: 'k', model: 'm' }, {}, { mode: 'autopilot', signal: ac.signal });
  } catch (e) { thrown3f = e; }
  passAssertEqual(thrown3f && thrown3f.code, 'aborted', 'pre-aborted signal throws synchronously with code:aborted');

  // (d) timeoutMs rejects a hung sendMessage and emits the companion abort.
  const timeoutMessages = [];
  const timeoutChrome = {
    runtime: {
      id: 'fsb-test-extension-id',
      sendMessage(message) {
        timeoutMessages.push(message);
        return new Promise(() => {});
      }
    }
  };
  globalThis.chrome = timeoutChrome;
  let thrown3g = null;
  try {
    await bridgeMod.executeViaBridge('xai', { apiKey: 'k', model: 'm' }, {}, { mode: 'autopilot', timeoutMs: 5 });
  } catch (e) { thrown3g = e; }
  passAssertEqual(thrown3g && thrown3g.code, 'timeout', 'timeoutMs rejects hung provider bridge call with code:timeout');
  passAssert(timeoutMessages.some(m => m && m.type === 'lattice-provider-abort'), 'timeoutMs sends lattice-provider-abort companion message');

  // (e) ensureOffscreen is called before dispatch and again before a host retry.
  let ensureCalls = 0;
  let sendCalls = 0;
  const recoverChrome = {
    runtime: {
      id: 'fsb-test-extension-id',
      sendMessage(message) {
        sendCalls++;
        if (sendCalls === 1 && message && message.type === 'lattice-provider-execute') {
          return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
        }
        return Promise.resolve({ ok: true, response: { rawResponse: { recovered: true } } });
      }
    }
  };
  globalThis.chrome = recoverChrome;
  const recovered = await bridgeMod.executeViaBridge('xai', { apiKey: 'k', model: 'm' }, {}, {
    mode: 'autopilot',
    ensureOffscreen: async function () { ensureCalls++; }
  });
  passAssertEqual(recovered && recovered.recovered, true, 'host_unreachable retry returns recovered provider response');
  passAssertEqual(ensureCalls, 2, 'ensureOffscreen called before initial send and host_unreachable retry');
  passAssertEqual(sendCalls, 2, 'host_unreachable retry sends provider execute twice');

  // Restore the original chrome mock with the offscreen handler so Part 4 abort tests continue to work.
  globalThis.chrome = part1Chrome;

  // ---- Part 4: AbortController propagation (Plan 06-01 fill) ----
  // 2 PASSes:
  //   (a) mid-flight abort: fetch hangs; abort message fires; envelope.error.kind === 'aborted'
  //   (b) unknown-requestId abort is a silent no-op (does not throw)
  console.log('\n--- Part 4: AbortController propagation ---');

  // (a) mid-flight abort
  globalThis.fetch = (_url, opts) => new Promise((_res, rej) => {
    // Never resolves; rejects only when the AbortSignal fires.
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        rej(err);
      });
    }
  });
  let env4a = null;
  const reqId4a = 'r4a';
  const p4a = new Promise((resolve) => {
    handler(
      { type: 'lattice-provider-execute', requestId: reqId4a, provider: 'xai', config: { apiKey: 'k', model: 'm' }, requestBody: {}, mode: 'autopilot' },
      validSender,
      (e) => { env4a = e; resolve(); }
    );
  });
  // Dispatch the abort message AFTER the execute has registered its
  // controller in _inflightAborts (synchronous addListener guarantees
  // the controller is set before this line runs).
  handler(
    { type: 'lattice-provider-abort', requestId: reqId4a },
    validSender,
    () => {}
  );
  await p4a;
  passAssertEqual(env4a && env4a.error && env4a.error.kind, 'aborted', 'mid-flight abort -> kind:aborted');

  // (b) unknown requestId abort is a silent no-op
  let threw4b = false;
  try {
    handler(
      { type: 'lattice-provider-abort', requestId: 'no-such-request' },
      validSender,
      () => {}
    );
  } catch (_e) {
    threw4b = true;
  }
  passAssertEqual(threw4b, false, 'abort for unknown requestId is silent no-op');

  // ---- Part 5: SW startup wiring (background.js) + flag/trim/options grep (deferred to Plans 06-03/06-04) ----
  console.log('\n--- Part 5: SW startup wiring (background.js) + flag/trim/options grep (deferred to Plans 06-03/06-04) ---');

  // Plan 06-02 portion: background.js importScripts insertion + ensureLatticeOffscreen wiring
  const fs = require('fs');
  const bgSource = fs.readFileSync('extension/background.js', 'utf8');
  const bgLines = bgSource.split('\n');

  // Matches the plan's acceptance criterion `grep -c "importScripts" extension/background.js`
  // which counts ALL importScripts token mentions (including comment references).
  // Phase 5 baseline: 153 mentions. Phase 6 Plan 06-02: 154 mentions (+1 new line).
  // Phase 8 Plan 08-01: 155 mentions (+1 new line for ai/lattice-step-emitter.js).
  // Phase 14 Plan 14-03: 157 mentions (+2 new lines for utils/trigger-store.js +
  // utils/trigger-lifecycle.js -- D-07 glue point 0, store imported before lifecycle).
  // Phase 15 Plan 15-03: 159 mentions (+2 new lines for utils/value-extractor.js +
  // utils/trigger-manager.js -- the fire-condition engine; load order
  // value-extractor -> trigger-store -> trigger-manager -> trigger-lifecycle).
  // Phase 24 Plan 24-01: 160 mentions (+1 new line for ws/phantom-stream-protocol.js).
  // Phase 26 (v0.9.99 capability foundation): 167 mentions (+7 -- 3 vendored libs
  // lib/{jmespath,minisearch,cfworker-json-schema}.min.js + 3 capability modules
  // utils/capability-{recipe-schema,auth-strategies,interpreter}.js + 1 load-order comment).
  // Phase 27 Plan 27-02: 168 mentions (+1 new line for utils/capability-fetch.js -- the MAIN-world fetch primitive).
  // Phase 28 Plan 28-01: 170 mentions (+2 new lines for catalog/recipe-index.generated.js +
  // utils/capability-search.js -- the build-time catalog IIFE + the minisearch index/slug-map module).
  // Phase 29 (v0.9.99 catalog/router/head): 175 mentions (+5 -- utils/capability-catalog.js +
  // utils/capability-router.js + the three T1a head handlers catalog/handlers/{github,slack,notion}.js).
  // Phase 30 (consent/governance): 179 mentions (+4 -- utils/{consent-policy-store,audit-log,
  // capability-signature,service-denylist}.js).
  // Phase 31 (learned recipes / discovery): 184 mentions (+5 -- utils/{network-capture-redactor,
  // network-capture,recipe-synthesizer,learned-recipe-store,discovery-session}.js).
  // Phase 32 (self-healing fallback): 185 mentions (+1 -- utils/capability-rot-detector.js, the
  // rot classifier the router calls; wired in Plan 32-03). Re-baselined here in the Phase-32
  // milestone-close plan (32-04) -- mirrors the per-phase refreshes at Phase 27/28/29; the +9 from
  // Phase 30/31 is swept in because those phases left this byte-freeze count stale.
  // Phase 34 (safe file upload): 186 mentions (+1 -- utils/upload-path-denylist.js).
  // Phase 40 (DEPTH-01): 187 mentions (+1 -- catalog/handlers/gitlab.js, the 4th bundled-head handler).
  // Phase 43 (SCALE-02): 188 mentions (+1 -- utils/relearn-scheduler.js, the per-origin re-learn
  // coalescing/back-off scheduler wired additively after discovery-session.js, Plan 43-03).
  // Phase 46/48 (v1.1 T1 expansion): 192 mentions (+4 -- catalog/handlers/{netlify,
  // bitbucket,circleci,vercel}.js).
  // Phase 51 (full-tail migration): 193 mentions (+1 -- catalog/handlers/retool.js).
  const importScriptsCount = (bgSource.match(/importScripts/g) || []).length;
  passAssertEqual(importScriptsCount, 193, 'background.js importScripts count = 193 (Phase 24 baseline 160 + Phase 26 +7 capability foundation + Phase 27 +1 for utils/capability-fetch.js + Phase 28 +2 for recipe-index.generated.js + utils/capability-search.js + Phase 29 +5 for capability-catalog.js + capability-router.js + 3 catalog/handlers + Phase 30 +4 consent/audit/signature/denylist + Phase 31 +5 network-capture/synthesizer/learned-store/discovery + Phase 32 +1 capability-rot-detector.js + Phase 34 +1 upload-path-denylist.js + Phase 40 +1 catalog/handlers/gitlab.js + Phase 43 +1 utils/relearn-scheduler.js + Phase 46/48 +4 catalog handlers + Phase 51 +1 catalog/handlers/retool.js)');
  // Companion call-site-only count (regex requires open paren): Phase 5 baseline
  // was 150 actual importScripts() calls; Phase 6 adds 1 -> 151; Phase 8 adds 1 -> 152;
  // Phase 14 adds 2 (trigger-store + trigger-lifecycle) -> 154; Phase 15 adds 2
  // (value-extractor + trigger-manager) -> 156; Phase 24 adds 1
  // (phantom-stream-protocol) -> 157. Phase 26 adds 6 (3 vendored libs + 3 capability
  // modules) -> 163; Phase 27 Plan 27-02 adds 1 (utils/capability-fetch.js) -> 164.
  // Phase 28 Plan 28-01 adds 2 (catalog/recipe-index.generated.js + utils/capability-search.js) -> 166.
  // Phase 29 adds 5 (utils/capability-catalog.js + utils/capability-router.js + 3 catalog/handlers
  // {github,slack,notion}.js) -> 171. Phase 30 adds 4 (consent-policy-store + audit-log +
  // capability-signature + service-denylist) -> 175. Phase 31 adds 5 (network-capture-redactor +
  // network-capture + recipe-synthesizer + learned-recipe-store + discovery-session) -> 180.
  // Phase 32 adds 1 (utils/capability-rot-detector.js, Plan 32-03) -> 181.
  // Phase 34 adds 1 (utils/upload-path-denylist.js) -> 182.
  // Phase 40 adds 1 (catalog/handlers/gitlab.js, the 4th bundled-head handler) -> 183.
  // Phase 43 adds 1 (utils/relearn-scheduler.js, the SCALE-02 re-learn scheduler, Plan 43-03) -> 184.
  // Phase 46/48 adds 4 (catalog/handlers/{netlify,bitbucket,circleci,vercel}.js) -> 188.
  // Phase 51 adds 1 (catalog/handlers/retool.js) -> 189.
  const importScriptsCallSites = (bgSource.match(/importScripts\(/g) || []).length;
  passAssertEqual(importScriptsCallSites, 189, 'background.js importScripts() call sites = 189 (Phase 24 baseline 157 + Phase 26 +6 capability foundation + Phase 27 +1 for utils/capability-fetch.js + Phase 28 +2 for recipe-index.generated.js + utils/capability-search.js + Phase 29 +5 for capability-catalog.js + capability-router.js + 3 catalog/handlers + Phase 30 +4 consent/audit/signature/denylist + Phase 31 +5 network-capture/synthesizer/learned-store/discovery + Phase 32 +1 capability-rot-detector.js + Phase 34 +1 upload-path-denylist.js + Phase 40 +1 catalog/handlers/gitlab.js + Phase 43 +1 utils/relearn-scheduler.js + Phase 46/48 +4 catalog handlers + Phase 51 +1 catalog/handlers/retool.js)');

  const lineCli = bgLines.findIndex(l => /importScripts\(['"]ai\/cli-parser\.js['"]\)/.test(l));
  const lineBridge = bgLines.findIndex(l => /importScripts\(['"]ai\/lattice-provider-bridge\.js['"]\)/.test(l));
  const lineAiIntegration = bgLines.findIndex(l => /importScripts\(['"]ai\/ai-integration\.js['"]\)/.test(l));
  passAssert(lineCli >= 0 && lineBridge >= 0 && lineAiIntegration >= 0, 'all 3 importScripts entries present (cli-parser + lattice-provider-bridge + ai-integration)');
  passAssert(lineCli < lineBridge && lineBridge < lineAiIntegration, 'order: ai/cli-parser.js -> ai/lattice-provider-bridge.js -> ai/ai-integration.js (no intervening importScripts entries between cli-parser and bridge OR between bridge and ai-integration)');
  // Bridge line MUST be IMMEDIATELY adjacent to cli-parser (NO comment line between; Warning 3 fix)
  passAssertEqual(lineBridge - lineCli, 1, 'bridge importScripts line is IMMEDIATELY adjacent to cli-parser (no preceding comment line; Phase 5 D-17 byte-frozen ethos)');
  // Phase 8 Plan 08-01 update: lattice-step-emitter.js now sits between
  // lattice-provider-bridge.js and ai-integration.js (alphabetical cluster
  // lattice-p < lattice-s).
  // Phase 9 Plan 09-01 update (FINT-13): the lattice-runtime-adapter activation
  // flag flip lands as a `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED = true;`
  // assignment immediately after lattice-step-emitter (with a FINT-13 comment
  // block). This grows the bridge -> ai-integration gap from 2 -> up to 8
  // (1 emitter importScripts + N comment lines + 1 flag assignment + ai-integration).
  // The Phase 5 D-17 ethos becomes: every line in the gap MUST be one of
  // (a) importScripts() call, (b) Phase 9 FINT-13 comment line, or
  // (c) the FSB_LATTICE_RUNTIME_ADAPTER_ENABLED flag assignment.
  const gap = lineAiIntegration - lineBridge;
  passAssert(gap >= 1 && gap <= 8, 'gap between bridge and ai-integration is 1..8 (pre-Phase-8 = 1; Phase 8 = 2; Phase 9 grows to <= 8 with FINT-13 flag flip + comment block)');
  for (let i = lineBridge + 1; i < lineAiIntegration; i++) {
    var ln = bgLines[i];
    var isImport = /^\s*importScripts\(/.test(ln);
    var isPhase9Comment = /^\s*\/\//.test(ln);
    var isPhase9Flag = /^\s*globalThis\.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED\s*=\s*true/.test(ln);
    passAssert(isImport || isPhase9Comment || isPhase9Flag, 'intervening line ' + (i+1) + ' between bridge and ai-integration is importScripts() OR Phase 9 FINT-13 comment OR FSB_LATTICE_RUNTIME_ADAPTER_ENABLED assignment (Phase 5 D-17 byte-frozen ethos preserved with Phase 9 carryforward)');
  }
  // Verify no OTHER importScripts entries between cli-parser and bridge (redundant given adjacency check, but kept for diagnostic clarity)
  for (let i = lineCli + 1; i < lineBridge; i++) {
    passAssert(!/importScripts\(/.test(bgLines[i]), 'no other importScripts between cli-parser and lattice-provider-bridge at line ' + (i+1));
  }

  const ensureCount = (bgSource.match(/ensureLatticeOffscreen/g) || []).length;
  passAssert(ensureCount >= 3, 'ensureLatticeOffscreen appears >= 3 times in background.js (declaration + onInstalled + onStartup)');

  passAssert(/async function ensureLatticeOffscreen\(\)/.test(bgSource), 'ensureLatticeOffscreen declared as async function');
  passAssertEqual((bgSource.match(/chrome\.offscreen\.createDocument/g) || []).length, 1, 'chrome.offscreen.createDocument called exactly once (inside helper)');
  passAssertEqual((bgSource.match(/reasons:\s*\['WORKERS'\]/g) || []).length, 1, 'WORKERS reason used (not IFRAME_SCRIPTING per CONTEXT.md amendment)');
  passAssertEqual((bgSource.match(/IFRAME_SCRIPTING/g) || []).length, 0, 'IFRAME_SCRIPTING placeholder removed');
  passAssertEqual((bgSource.match(/url:\s*['"]offscreen\/lattice-host\.html['"]/g) || []).length, 1, 'url: offscreen/lattice-host.html present in createDocument');
  passAssert(/chrome\.offscreen\.hasDocument/.test(bgSource), 'hasDocument idempotency guard present');

  // Dynamic chrome.offscreen idempotency exercise via the Plan 06-00 mock
  const offscreenMock = createChromeOffscreenMock();
  async function simulatedHelper() {
    // Mirror the actual ensureLatticeOffscreen helper body for behavioural test
    try {
      if (!offscreenMock || typeof offscreenMock.hasDocument !== 'function') return;
      const has = await offscreenMock.hasDocument();
      if (has) return;
      await offscreenMock.createDocument({ url: 'offscreen/lattice-host.html', reasons: ['WORKERS'], justification: 'test' });
    } catch (_e) { /* swallow */ }
  }
  await simulatedHelper();
  await simulatedHelper();
  await simulatedHelper();
  passAssertEqual(offscreenMock._createCount(), 1, 'hasDocument guard makes ensureLatticeOffscreen idempotent (3 calls -> 1 createDocument)');

  // Plan 07-01 fill (Phase 7 FINT-09): the FSB_LATTICE_PROVIDER_BRIDGE_ENABLED
  // feature flag is REMOVED from agent-loop.js. The bridge call site at the
  // tail of callProviderWithTools is unconditional. The legacy
  // providerInstance.sendRequest(requestBody) fallback is deleted.
  const alSource = require('fs').readFileSync('extension/ai/agent-loop.js', 'utf8');
  const alLinesWithFlag = alSource.split('\n').filter(l => /FSB_LATTICE_PROVIDER_BRIDGE_ENABLED/.test(l));
  passAssertEqual(alLinesWithFlag.length, 0, 'agent-loop.js has ZERO LINES referencing FSB_LATTICE_PROVIDER_BRIDGE_ENABLED (Phase 7 FINT-09: flag fully stripped)');
  passAssertEqual((alSource.match(/FSB_LATTICE_PROVIDER_BRIDGE_ENABLED/g) || []).length, 0, 'agent-loop.js has ZERO token occurrences of FSB_LATTICE_PROVIDER_BRIDGE_ENABLED (Phase 7 FINT-09: flag fully stripped)');
  passAssertEqual((alSource.match(/executeViaBridge\(/g) || []).length, 1, 'agent-loop.js has exactly 1 executeViaBridge invocation (Phase 7 FINT-09: unconditional call site)');
  passAssertEqual((alSource.match(/providerInstance\.sendRequest\(requestBody\)/g) || []).length, 0, 'agent-loop.js has ZERO providerInstance.sendRequest(requestBody) calls (Phase 7 FINT-09: legacy fallback deleted)');
  passAssert(/timeoutMs:\s*timeoutMs/.test(alSource), 'agent-loop.js passes adaptive timeoutMs into executeViaBridge');
  passAssertEqual((alSource.match(/setTimeout/g) || []).length, 8, 'agent-loop.js setTimeout count = 8 (Phase 7 FINT-09: INV-04 count invariant preserved across flag-strip)');

  const bridgeSource = require('fs').readFileSync('extension/ai/lattice-provider-bridge.js', 'utf8');
  passAssert(/crypto\.randomUUID/.test(bridgeSource), 'bridge uses crypto.randomUUID for requestId');
  passAssert((bridgeSource.match(/host_unreachable/g) || []).length >= 2, 'bridge handles host_unreachable in >= 2 paths (sendMessage reject + undefined envelope)');
  passAssert(/module\.exports\s*=\s*\{\s*executeViaBridge/.test(bridgeSource), 'bridge module.exports executeViaBridge');
  passAssert(/globalScope\.executeViaBridge\s*=\s*executeViaBridge/.test(bridgeSource), 'bridge globalScope.executeViaBridge assigned (classic SW)');
  passAssert(/removeEventListener\(['"]abort['"]/.test(bridgeSource), 'bridge cleans up abort listener in finally (Pitfall 3)');
  passAssert(/timeoutMs/.test(bridgeSource), 'bridge accepts timeoutMs for bounded provider calls');

  // Plan 06-04 fill: options.js saveSettings trim + checkApiConnection rewrite
  const optionsSrc = require('fs').readFileSync('extension/ui/options.js', 'utf8');
  const optionsLines = optionsSrc.split('\n');

  // Extract saveSettings body (lines 977-1030 region by content match -- robust
  // to small line drifts). Brace-depth walker scans the function body.
  const saveStart = optionsLines.findIndex(function (l) { return /function\s+saveSettings\s*\(\s*\)/.test(l); });
  passAssert(saveStart >= 0, 'saveSettings function found');
  let saveEnd = saveStart + 1;
  let saveDepth = 0;
  let saveOpened = false;
  while (saveEnd < optionsLines.length) {
    const lineS = optionsLines[saveEnd];
    for (const ch of lineS) {
      if (ch === '{') { saveDepth++; saveOpened = true; }
      else if (ch === '}') { saveDepth--; if (saveOpened && saveDepth === 0) { break; } }
    }
    if (saveOpened && saveDepth === 0) break;
    saveEnd++;
  }
  const saveBody = optionsLines.slice(saveStart, saveEnd + 1).join('\n');
  const saveTrimCount = (saveBody.match(/\.trim\(\)/g) || []).length;
  passAssert(saveTrimCount >= 9, 'saveSettings body has >= 9 .trim() calls (got ' + saveTrimCount + ' for all 9 input-derived string fields: 8 LLM-side + 1 CAPTCHA)');

  // Extract checkApiConnection body
  const checkStart = optionsLines.findIndex(function (l) { return /async\s+function\s+checkApiConnection\s*\(\s*\)/.test(l); });
  passAssert(checkStart >= 0, 'checkApiConnection function found');
  let checkEnd = checkStart + 1;
  let checkDepth = 0;
  let checkOpened = false;
  while (checkEnd < optionsLines.length) {
    const lineC = optionsLines[checkEnd];
    for (const ch of lineC) {
      if (ch === '{') { checkDepth++; checkOpened = true; }
      else if (ch === '}') { checkDepth--; if (checkOpened && checkDepth === 0) { break; } }
    }
    if (checkOpened && checkDepth === 0) break;
    checkEnd++;
  }
  const checkBody = optionsLines.slice(checkStart, checkEnd + 1).join('\n');

  passAssertEqual((checkBody.match(/getStoredSettings\(\)/g) || []).length, 0, 'checkApiConnection body does NOT call getStoredSettings (P2 stale-storage closed)');
  passAssertEqual((checkBody.match(/new\s+AIIntegration/g) || []).length, 0, 'checkApiConnection body does NOT instantiate AIIntegration');
  // UAT-08 prep (quick 260606-4si): checkApiConnection no longer calls executeViaBridge
  // directly. The bridge global is SW-only (lattice-provider-bridge.js); options.js
  // now SW-bounces via chrome.runtime.sendMessage({action:'lattice-test-connection'})
  // routed through background.js master switch case (action field per FSB convention,
  // not the type field that the standalone listener variant briefly used). The mode +
  // __testConnection markers are passed by the SW-side handler, not by options.js.
  passAssertEqual((checkBody.match(/executeViaBridge\(/g) || []).length, 0, 'checkApiConnection body does NOT call executeViaBridge directly (SW-bounce contract per UAT-08 prep)');
  passAssert(/lattice-test-connection/.test(checkBody), "checkApiConnection sends 'lattice-test-connection' SW-bounce message");
  passAssert(/chrome\.runtime\.sendMessage/.test(checkBody), 'checkApiConnection uses chrome.runtime.sendMessage for SW-bounce');
  // Verify SW-side listener in background.js carries the bridge call markers.
  const backgroundSrc = fs.readFileSync('extension/background.js', 'utf8');
  passAssert(/lattice-test-connection/.test(backgroundSrc), "background.js handles 'lattice-test-connection' SW-bounce");
  passAssert(/mode:\s*['"]test-connection['"]/.test(backgroundSrc), "background.js SW handler passes {mode: 'test-connection'} to executeViaBridge");
  passAssert(/__testConnection:\s*true/.test(backgroundSrc), 'background.js SW handler passes {__testConnection: true} as requestBody marker');
  passAssert(/elements\.apiKey\?\.value/.test(checkBody) || /document\.getElementById\(['"]apiKey['"]\)\?\.value/.test(checkBody), 'checkApiConnection reads xai apiKey from input field (not chrome.storage)');
  passAssert(/\.value.*\.trim\(\)/.test(checkBody), 'checkApiConnection trims input values (defense-in-depth + P1 closure)');

  // getStoredSettings declaration preserved elsewhere in options.js
  passAssert(/function\s+getStoredSettings/.test(optionsSrc) || /async\s+function\s+getStoredSettings/.test(optionsSrc), 'getStoredSettings declaration preserved (used by other call sites; not removed by Phase 6)');

  // ---- Part 6: INV byte-freeze regression assertions (Plan 06-05 fill) ----
  console.log('\n--- Part 6: INV-04 / INV-01 / INV-02 / INV-05 / INV-06 byte-freeze ---');

  // Plan 06-05 fill: INV byte-freeze regression assertions
  // NOTE: `fs` is already required at Part 5 above; reused here.

  // ---- INV-04: agent-loop.js setTimeout iterator PATTERN load-bearing ----
  // (Pattern check, NOT line-number check: Plan 06-03 Task 2 inserts ~10 lines
  //  at line 1044 which shifts the iterator line positions downward. The
  //  INVARIANT is the pattern + count, not the specific lines.)
  const agentLoopSrc = fs.readFileSync('extension/ai/agent-loop.js', 'utf8');
  const agentLoopLines = agentLoopSrc.split('\n');
  passAssertEqual(
    (agentLoopSrc.match(/setTimeout/g) || []).length,
    8,
    'INV-04: extension/ai/agent-loop.js setTimeout count = 8 (Phase 5 baseline preserved by Phase 6; count invariant under line-1044 insertion)'
  );

  // Discover iterator lines via content match (NOT hardcoded line numbers).
  const iteratorLines = agentLoopLines
    .map(function (l, i) { return /session\._nextIterationTimer\s*=\s*setTimeout/.test(l) ? (i + 1) : null; })
    .filter(function (n) { return n !== null; });
  passAssertEqual(
    iteratorLines.length,
    4,
    'INV-04: exactly 4 setTimeout-chained iterator hits discovered (pattern: session._nextIterationTimer = setTimeout)'
  );

  // For each discovered iterator line, verify the block contains
  // runAgentIteration(sessionId, options) within the next 5 lines.
  iteratorLines.forEach(function (lineNum, idx) {
    var windowSrc = agentLoopLines.slice(lineNum - 1, lineNum + 5).join('\n');
    passAssert(
      /runAgentIteration\s*\(\s*sessionId\s*,\s*options\s*\)/.test(windowSrc),
      'INV-04: iterator ' + (idx + 1) + ' at line ' + lineNum + ' calls runAgentIteration(sessionId, options) within next 5 lines'
    );
  });

  // ---- INV-01/02: tool-definitions parity test still present ----
  passAssert(
    fs.existsSync('tests/tool-definitions-parity.test.js'),
    'INV-01/02: tests/tool-definitions-parity.test.js exists; runs as a sibling in package.json scripts.test &&-chain'
  );

  // ---- INV-05: deprecated agent modules absent OR byte-frozen ----
  const deprecatedAgentPaths = [
    'extension/agents/agent-executor.js',
    'extension/agents/agent-manager.js',
    'extension/agents/agent-scheduler.js',
  ];
  let invFiveOk = true;
  let invFiveDetail = '';
  for (const p of deprecatedAgentPaths) {
    if (!fs.existsSync(p)) {
      invFiveDetail += p + '(absent) ';
      continue;
    }
    const src = fs.readFileSync(p, 'utf8');
    if (!/DEPRECATED/i.test(src)) {
      invFiveOk = false;
      invFiveDetail += p + '(no DEPRECATED banner!) ';
    } else {
      invFiveDetail += p + '(present + banner) ';
    }
  }
  passAssert(
    invFiveOk,
    'INV-05: deprecated agent modules absent OR carry DEPRECATED banner: ' + invFiveDetail
  );

  // ---- INV-06: Lattice public package pin coherent FSB-side ----
  const publicPin = validatePublicLatticePin(process.cwd());
  passAssert(
    publicPin.ok,
    'INV-06: LATTICE-PIN.md + package files pin public Lattice package coherently'
      + (publicPin.ok ? '' : ': ' + publicPin.errors.join('; '))
  );

  // ---- Phase 7 readiness: universal-provider.js still on disk; _archive/ not yet ----
  passAssert(
    fs.existsSync('extension/ai/universal-provider.js'),
    'Phase 6 keeps universal-provider.js as flag-false fallback (Phase 7 archives it)'
  );
  const archiveExists = fs.existsSync('extension/_archive');
  const archiveEmpty = !archiveExists || fs.readdirSync('extension/_archive').length === 0;
  passAssert(
    archiveEmpty,
    'Phase 6: extension/_archive/ does not exist or is empty (Phase 7 will create + populate it)'
  );

  // ---- Phase 6 file-presence ceremony: all Phase 6 deliverables on disk ----
  passAssert(
    fs.existsSync('extension/ai/lattice-provider-bridge.js'),
    'Plan 06-03 deliverable: extension/ai/lattice-provider-bridge.js present'
  );
  passAssert(
    fs.existsSync('extension/offscreen/lattice-host.js'),
    'Plan 06-01 deliverable: extension/offscreen/lattice-host.js present (Phase 5 base + Phase 6 extensions)'
  );
  const lhSrc = fs.readFileSync('extension/offscreen/lattice-host.js', 'utf8');
  passAssert(
    /lattice-provider-execute/.test(lhSrc),
    'Plan 06-01 deliverable: lattice-host.js contains lattice-provider-execute handler'
  );

  // ---- Summary ----
  console.log('\n--- Summary ---');
  console.log('passed:', passed);
  console.log('failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Provider-bridge smoke harness uncaught error:', err && err.stack ? err.stack : err);
  process.exit(1);
});

// Helpers exported for downstream Phase 6 plans to require() from this
// file. The IIFE above always runs when this file is invoked directly
// via `node tests/lattice-provider-bridge-smoke.test.js`; downstream
// plans separately require() the helpers AND independently re-run
// their own `node tests/...` invocations.
module.exports = {
  createChromeRuntimeMock,
  createChromeOffscreenMock,
  loadOffscreenHandlerSource,
  passAssert,
  passAssertEqual
};
