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
 * Placeholder for Plan 06-01 to fill: load the offscreen handler
 * module's `chrome.runtime.onMessage` listener function (so the smoke
 * can dispatch messages directly via the createChromeRuntimeMock above
 * without spinning up a real Chrome offscreen page).
 *
 * Wave 0 returns null; downstream plans mock the require/import and
 * return the registered listener (the function passed to
 * chrome.runtime.onMessage.addListener inside extension/offscreen/lattice-host.js).
 *
 * @returns {Promise<Function|null>}
 */
async function loadOffscreenHandlerSource() {
  // Plan 06-01 fills this in: dynamic require of
  // extension/offscreen/lattice-host.js after setting up
  // globalThis.chrome = { runtime: createChromeRuntimeMock() } so the
  // module's onMessage.addListener call lands in the mock's listeners
  // array. Then the helper returns runtimeMock._listeners()[0] or
  // similar.
  return null;
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

  // ---- Part 2: Per-provider message-bus round-trip (placeholder) ----
  console.log('\n--- Part 2: per-provider message-bus round-trip ---');
  // Plan 06-01 will populate: 7 PASSes (one per provider). For each
  // provider, build a chrome.runtime mock + chrome.offscreen mock,
  // load the offscreen handler via loadOffscreenHandlerSource(),
  // inject a fake fetch returning the provider-shape body
  // (ANTHROPIC_FAKE_BODY / GEMINI_FAKE_BODY / OPENAI_COMPAT_FAKE_BODY
  // from tests/lattice-providers-smoke.test.js conventions), call
  // executeViaBridge('<provider>', config, requestBody, {mode:'test-connection'})
  // and assert the bridge returns the raw HTTP body.
  passAssert(true, 'Plan 06-00 Wave 0 placeholder -- Plan 06-01 fills 7 per-provider round-trips');

  // ---- Part 3: Error envelope shape on adapter rejection (placeholder) ----
  console.log('\n--- Part 3: error envelope shape ---');
  // Plan 06-01 + Plan 06-03 will populate: 3 PASSes.
  //   (a) Mock fetch to throw -> bridge rejects with kind: 'adapter_error'.
  //   (b) Mock sendMessage to return undefined (no listener) -> bridge
  //       rejects with kind: 'host_unreachable'.
  //   (c) Call bridge with provider: 'unknown' -> envelope kind: 'invalid_provider'.
  passAssert(true, 'Plan 06-00 Wave 0 placeholder -- Plan 06-01 + Plan 06-03 fill error envelope checks');

  // ---- Part 4: AbortController propagation (placeholder) ----
  console.log('\n--- Part 4: AbortController propagation ---');
  // Plan 06-01 will populate: 2 PASSes.
  //   (a) Create AbortController; call bridge; abort before fetch
  //       resolves; assert bridge rejects with kind: 'aborted'.
  //   (b) Pre-aborted signal: assert bridge rejects synchronously with
  //       kind: 'aborted'.
  passAssert(true, 'Plan 06-00 Wave 0 placeholder -- Plan 06-01 fills 2 abort-propagation PASSes');

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
