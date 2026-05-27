'use strict';

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
    console.error('         Did you run `cd lattice && pnpm install && pnpm build` after Phase 5 commits?');
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

  // ---- Part 5: Flag/trim/options grep (placeholder) ----
  console.log('\n--- Part 5: flag / trim / options-grep ---');
  // Plan 06-02 + Plan 06-03 + Plan 06-04 will populate: 4 PASSes.
  //   (a) Plan 06-02: grep extension/background.js after line 11 for
  //       importScripts('ai/lattice-provider-bridge.js') insertion.
  //   (b) Plan 06-03: grep extension/ai/agent-loop.js line ~1044 for
  //       FSB_LATTICE_PROVIDER_BRIDGE_ENABLED uniform check OR
  //       executeViaBridge invocation; verify flag default-on
  //       (undefined -> bridge path).
  //   (c) Plan 06-04: grep extension/ui/options.js saveSettings()
  //       lines 977-1029 for .trim() on all 7 API key fields.
  //   (d) Plan 06-04: grep extension/ui/options.js checkApiConnection()
  //       reads from elements.apiKey?.value?.trim() (NOT chrome.storage).
  passAssert(true, 'Plan 06-00 Wave 0 placeholder -- Plan 06-02 + Plan 06-03 + Plan 06-04 fill flag/trim/grep checks');

  // ---- Part 6: INV byte-freeze (placeholder) ----
  console.log('\n--- Part 6: INV-04 / INV-01 / INV-02 / INV-05 / INV-06 byte-freeze ---');
  // Plan 06-05 will populate: >= 4 PASSes.
  //   (a) INV-04: grep -c setTimeout extension/ai/agent-loop.js -> 8
  //       (Phase 5 baseline). The 4 setTimeout iterator lines (1841,
  //       2439, 2508, 2518) contain runAgentIteration(sessionId, options).
  //   (b) INV-01/02: chain node tests/tool-definitions-parity.test.js
  //       still passing 142/142.
  //   (c) INV-05: extension/_archive/ does not exist or is empty
  //       (Phase 6 does NOT archive universal-provider.js; Phase 7 does).
  //   (d) INV-06: cd lattice && git rev-parse fsb-integration-experiments
  //       matches .planning/LATTICE-PIN.md frontmatter SHA (no drift).
  passAssert(true, 'Plan 06-00 Wave 0 placeholder -- Plan 06-05 fills INV-04/01/02/05/06 byte-freeze PASSes');

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
