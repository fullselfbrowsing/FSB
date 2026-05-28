/**
 * FSB v0.10.0-attempt-2 Phase 6 Plan 06-03 -- Lattice provider bridge shim.
 *
 * SW-side counterpart to the offscreen `lattice-provider-execute` handler
 * shipped in Plan 06-01 (extension/offscreen/lattice-host.js). This module
 * wraps chrome.runtime.sendMessage to that handler and unwraps the response
 * envelope into the legacy raw HTTP body shape that
 * extension/ai/agent-loop.js's downstream consumers in tool-use-adapter.js
 * expect (per RESEARCH Section 2).
 *
 * Locked decisions (CONTEXT.md):
 *   Q1: handler uses return true + sendResponse (request-response); bridge
 *       awaits chrome.runtime.sendMessage directly.
 *   Q2: per-call crypto.randomUUID requestId; AbortSignal -> companion
 *       {type:'lattice-provider-abort', requestId} message.
 *   Q3: handler instantiates adapter per call (no caching).
 *   Phase 7 (FINT-09): the feature flag was removed; the bridge is
 *       unconditional. universal-provider.js stays on disk for
 *       providerInstance metadata (Strategy B per Phase 7 CONTEXT.md);
 *       physical archive deferred to v0.11.0+.
 *
 * Error envelope shape (RESEARCH Section 6 + 7):
 *   success: {ok: true, response: ProviderRunResponse}
 *     - autopilot path: response.rawResponse is the raw HTTP body JSON
 *     - test-connection path: response is Lattice's ProviderRunResponse
 *   error: {ok: false, error: {kind, message, providerError?}}
 *     kind in: 'aborted' | 'adapter_error' | 'host_unreachable' |
 *              'invalid_provider' | 'fetch_error'
 *
 * INV-04 (setTimeout-chained iterator PATTERN at agent-loop.js)
 * UNAFFECTED: this module does not contain setTimeout / setInterval; it is
 * called from inside callProviderWithTools which is an async function the
 * iterator awaits.
 *
 * SECURITY: NEVER log config.apiKey. The error message + providerError
 * fields may contain xAI's masked echo (e.g. 'xa***cy') but the full key
 * is never surfaced in logs.
 */

'use strict';

(function (globalScope) {
  const BRIDGE_TAG = '[FSB lattice-provider-bridge]';

  /**
   * executeViaBridge -- send a provider-execute envelope to the offscreen
   * Lattice host and await the response.
   *
   * SECURITY: Callers MUST NOT log config.apiKey in their catch blocks
   * (Plan 06-03 T-06-03-01 mitigation). The bridge itself never logs the
   * key; the propagated err.providerError may contain provider-side masked
   * echoes (e.g. xAI's 'xa***cy') but never the full key.
   *
   * @param {string} providerKey - xai|openai|anthropic|gemini|openrouter|lmstudio|custom
   * @param {Object} config - { apiKey, model, baseUrl?, headers? }
   * @param {Object} requestBody - autopilot: provider-formatted HTTP body;
   *                               test-connection: ignored
   * @param {Object} opts - { signal?: AbortSignal, mode?: 'autopilot' | 'test-connection' }
   * @returns {Promise<Object>} Raw HTTP body (autopilot) OR ProviderRunResponse (test-connection)
   * @throws Error with .code in {'aborted','adapter_error','host_unreachable','invalid_provider','fetch_error'}
   */
  async function executeViaBridge(providerKey, config, requestBody, opts) {
    opts = opts || {};
    const signal = opts.signal;
    const mode = opts.mode || 'autopilot';

    if (signal && signal.aborted) {
      const err = new Error('aborted by caller (pre-aborted signal)');
      err.code = 'aborted';
      throw err;
    }

    const requestId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : ('req-' + Date.now() + '-' + Math.random().toString(36).slice(2));

    let onAbort = null;
    if (signal) {
      onAbort = function () {
        try {
          chrome.runtime.sendMessage({ type: 'lattice-provider-abort', requestId: requestId });
        } catch (_e) {
          /* offscreen may have evicted; swallow */
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      let envelope;
      try {
        envelope = await chrome.runtime.sendMessage({
          type: 'lattice-provider-execute',
          requestId: requestId,
          provider: providerKey,
          config: config,
          requestBody: requestBody,
          mode: mode
        });
      } catch (sendErr) {
        // Chrome 105+ rejects when no listener; convert to host_unreachable
        const err = new Error('Offscreen Lattice host unreachable: ' + (sendErr && sendErr.message ? sendErr.message : sendErr));
        err.code = 'host_unreachable';
        throw err;
      }

      if (!envelope || typeof envelope !== 'object') {
        const err = new Error('Offscreen Lattice host returned no envelope');
        err.code = 'host_unreachable';
        throw err;
      }

      if (envelope.ok === true) {
        // Autopilot: response.rawResponse IS the raw HTTP body JSON (matches
        //   what universalProvider.sendRequest returns today). Tool-use-adapter
        //   reads this shape unchanged.
        // Test-connection: response is Lattice's ProviderRunResponse; caller
        //   (options.js checkApiConnection) handles either by inspecting truthiness.
        //
        // Phase 6 WR-02 -- defend against ok:true envelopes that omit response.
        // The offscreen handler today always sets response (rawResponse for
        // autopilot, ProviderRunResponse for test-connection) so this is
        // forward-defensive. Without this guard a malformed success envelope
        // would silently return undefined, surface as a "Connected" UI in
        // checkApiConnection without an observed provider response, and crash
        // deeper in tool-use-adapter for autopilot. Treat the asymmetry
        // (missing envelope = host_unreachable throw; missing response =
        // silent undefined) by throwing adapter_error here.
        const r = envelope.response;
        if (r === undefined || r === null) {
          const err = new Error('Offscreen Lattice host returned empty response in success envelope');
          err.code = 'adapter_error';
          throw err;
        }
        return (r && r.rawResponse) ? r.rawResponse : r;
      }

      // ok: false -- typed error envelope
      //
      // Phase 6 WR-04 -- propagate error.status from the envelope onto the
      // thrown Error so the agent-loop catch (extension/ai/agent-loop.js
      // handleProviderError) can branch on .status === 401|403|400|429 for
      // immediate terminal classification. Without this propagation every
      // provider-returned auth/bad-request failure would fall through to
      // the generic network-retry path and surface a worse error than
      // pre-Phase-6.
      const errObj = envelope.error || {};
      const err = new Error(errObj.message || 'bridge call failed');
      err.code = errObj.kind || 'adapter_error';
      err.status = errObj.status;
      err.providerError = errObj.providerError;
      throw err;
    } finally {
      if (onAbort && signal) {
        try { signal.removeEventListener('abort', onAbort); } catch (_e) { /* swallow */ }
      }
    }
  }

  // Dual export: classic-SW global + Node CJS (Phase 5 Plan 05-05 idiom)
  globalScope.executeViaBridge = executeViaBridge;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { executeViaBridge: executeViaBridge };
  }

  // Boot log so an MV3 reload visibly confirms the bridge global is registered.
  // Logged exactly once at module evaluation time.
  try {
    console.log(BRIDGE_TAG, 'boot: Phase 7 bridge shim registered (unconditional; legacy fallback removed)');
  } catch (_e) { /* swallow if console unavailable in test env */ }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
