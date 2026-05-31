'use strict';
/**
 * extension/ai/lattice-step-emitter.js
 *
 * Phase 8 FINT-10 -- SW-side producer for the Phase 5 D-16 `lattice-step-transition`
 * message bus. Closes audit gap G1 (`.planning/v0.10.0-MILESTONE-AUDIT.md` line 201).
 *
 * Mirrors the Phase 6 `lattice-provider-bridge.js` sibling-module idiom (dual export
 * for classic SW globalScope + Node CJS module.exports). Fire-and-forget per D-03:
 * never blocks on chrome.runtime.sendMessage; failures are silent (offscreen page
 * may have evicted; receipt mint failure is non-fatal per D-07 best-effort policy).
 *
 * The offscreen consumer at `extension/offscreen/lattice-host.js` (Phase 5 lines
 * ~295-371) already listens for {type: 'lattice-step-transition'} and routes to
 * `createCheckpointHook`; Phase 8 ONLY ships the producer.
 *
 * INV-04 invariant: this module contains ZERO deferred-iterator scheduling calls
 * and is NEVER invoked from inside an agent-loop deferred-iterator lambda (call
 * sites are in the iteration body BEFORE the schedule per Plan 08-02). INV-06
 * invariant: zero Lattice imports.
 */
(function (globalScope) {
  const EMITTER_TAG = '[FSB lattice-step-emitter]';

  /**
   * sendLatticeStepTransition -- fire-and-forget post to offscreen Lattice host.
   *
   * @param {Object} payload -- Phase 5 D-16 wire shape:
   *   {runId: string, sessionId?: string, stepName: string, stepIndex: number,
   *    timestamp: string, parentStepName?: string, previousStepName?: string}
   * @returns {void}
   */
  function sendLatticeStepTransition(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (typeof chrome === 'undefined') return;
    if (!chrome.runtime) return;
    if (typeof chrome.runtime.sendMessage !== 'function') return;
    try {
      chrome.runtime.sendMessage({
        type: 'lattice-step-transition',
        payload: payload
      });
      // Intentionally NOT blocked on -- fire-and-forget per D-03. The returned
      // Promise (MV3 sendMessage returns one) is allowed to dangle. Any
      // rejection (offscreen evicted, no listener registered yet) is harmless.
    } catch (_e) {
      // Swallow -- offscreen may be evicted or boot not complete.
    }
  }

  // Dual export (Phase 5 Plan 05-05 / Phase 6 Plan 06-03 idiom)
  globalScope.sendLatticeStepTransition = sendLatticeStepTransition;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sendLatticeStepTransition: sendLatticeStepTransition };
  }

  // Boot log so an MV3 reload visibly confirms the producer global is registered.
  // Logged exactly once at module evaluation time.
  try {
    console.log(EMITTER_TAG, 'boot: Phase 8 step emitter registered');
  } catch (_e) {
    // Swallow -- console may be unavailable in degraded test environments.
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
