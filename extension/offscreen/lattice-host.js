/**
 * FSB v0.10.0-attempt-2 Phase 5 Plan 05-04 -- hybrid offscreen Lattice host.
 *
 * This module is the FIRST in-extension consumer of Lattice in the
 * v0.10.0-attempt-2 milestone. The classic SW (extension/background.js)
 * stays byte-frozen per D-17; the 153 importScripts chain does NOT
 * import this module. Instead, Chrome loads this module via the offscreen
 * document at extension/offscreen/lattice-host.html (declared via
 * <script type="module"> -- which classic SWs cannot use, but offscreen
 * pages CAN).
 *
 * Loader path:
 *   chrome.offscreen.createDocument({ url: 'offscreen/lattice-host.html', ... })
 *     -> Chrome opens the offscreen iframe at chrome-extension://<id>/offscreen/lattice-host.html
 *     -> The HTML's <script type="module" src="lattice-host.js"> loads THIS file
 *     -> The bundler (esbuild, Plan 05-01) rewrites the 'lattice' bare specifier
 *        at build time so the production bundle at extension/dist/offscreen/
 *        lattice-host.js inlines Lattice's modules and loads with no further
 *        resolution required.
 *
 * Message bus contract (D-16):
 *
 *   SW -> offscreen:
 *     chrome.runtime.sendMessage({
 *       type: 'lattice-step-transition',
 *       payload: {
 *         runId: string,
 *         sessionId?: string,
 *         stepName: string,
 *         stepIndex: number,
 *         parentStepName?: string,
 *         previousStepName?: string,
 *         timestamp: string  // ISO-8601 RFC 3339
 *       }
 *     })
 *
 *   offscreen -> SW (success):
 *     chrome.runtime.sendMessage({
 *       type: 'lattice-receipt-minted',
 *       payload: {
 *         envelope: ReceiptEnvelope,  // DSSE v1.0 + JCS canonical
 *         runId: string,
 *         stepIndex: number
 *       }
 *     })
 *
 *   offscreen -> SW (mint-failed; D-07 best-effort):
 *     chrome.runtime.sendMessage({
 *       type: 'lattice-receipt-mint-failed',
 *       payload: {
 *         runId: string,
 *         stepIndex: number,
 *         mintError: string
 *       }
 *     })
 *
 * The SW-side wiring (background.js posting 'lattice-step-transition')
 * is INTENTIONALLY DEFERRED per D-22 -- production SW behavior is
 * gated by a feature flag default-off (Plan 05-05 ships the flag).
 * Plan 05-04 ships the offscreen handler + verifies the bare specifier
 * resolves + verifies the bundler emits a clean bundle; the SW does
 * not yet send messages.
 *
 * Threat model (Phase 5 CONTEXT.md):
 *   - PII via payload: step-marker fields MUST be stable identifiers
 *     per Phase 2 D-04 + Phase 3 (sessionId, stepName, etc.). Free-form
 *     user input is rejected by the contract documentation.
 *   - Snapshot tampering: the offscreen page is loaded from the same
 *     extension origin; cross-origin messaging is rejected by Chrome's
 *     runtime.onMessage isolation (sender.id === own extension id check).
 *   - Lifetime mismatch: offscreen pages have shorter lifetimes than the
 *     SW + UI; if the offscreen evicts before the SW emits the next
 *     step transition, the receipt mint is silently dropped. Accepted
 *     in Plan 05-04 (Phase 5 ships the contract surface; multi-message
 *     persistence is a follow-on).
 */

// Import the Lattice surface published in Plan 05-03. The 'lattice' bare
// specifier resolves via the file: dep wired in Phase 1; esbuild rewrites
// it at build time so the production bundle does not need a runtime
// resolver. Lattice's dist/ exports the values + types listed below
// (see Plan 05-03 src/index.ts edit).
import {
  createHookPipeline,
  createCheckpointHook,
  createInMemorySigner,
  generateEd25519KeyPairJwk,
  createNoopSurvivabilityAdapter,
  DEFAULT_CHECKPOINT_BAND,
  STEP_TRANSITION_EVENT_NAME,
} from "lattice";

// ==========================================================================
// Phase 6 Plan 06-01 (FINT-07) -- Lattice provider-factory imports.
// ==========================================================================
//
// The 7 Lattice provider factories are imported at the top of the offscreen
// module (sibling to the Phase 5 Lattice import block above) so the
// "consumption of Lattice adapters" contract (INV-03) holds at the
// factory-dispatch level even when the autopilot path bypasses
// adapter.execute() for its own fetch() per Strategy A (CONTEXT.md
// post-research amendment + RESEARCH Section 16).
//
// FSB-key -> Lattice-factory normalisations (RESEARCH Section 4):
//   - FSB 'xai'        -> createXaiProvider           (camelCase Xai, NOT XAI)
//   - FSB 'openai'     -> createOpenAIProvider
//   - FSB 'anthropic'  -> createAnthropicProvider
//   - FSB 'gemini'     -> createGeminiProvider
//   - FSB 'openrouter' -> createOpenRouterProvider
//   - FSB 'lmstudio'   -> createLmStudioProvider      (camelCase Lm, NOT LM)
//   - FSB 'custom'     -> createOpenAICompatibleProvider
import {
  createAnthropicProvider,
  createGeminiProvider,
  createLmStudioProvider,
  createOpenAIProvider,
  createOpenAICompatibleProvider,
  createOpenRouterProvider,
  createXaiProvider,
} from "lattice";

const HOST_TAG = "[FSB lattice-host]";

// ==========================================================================
// Phase 6 Plan 06-01 (FINT-07) -- PROVIDER_FACTORIES dispatch + Strategy A
//                                  helpers (computeUrl + computeHeaders).
// ==========================================================================
//
// Strategy A (CONTEXT.md post-research amendment + RESEARCH Section 16):
//   - autopilot mode: handler does its own fetch() using FSB's pre-built
//     requestBody (preserves multi-turn messages + tools + provider-specific
//     cache_control / systemInstruction / generationConfig). Lattice factory
//     is still instantiated per call so INV-03 holds at factory-dispatch
//     level (the consumption-of-Lattice-adapters contract is honored
//     architecturally even on the autopilot path).
//   - test-connection mode: handler calls adapter.execute({task, artifacts,
//     outputs}, {signal}) natively (single-shot fits Lattice's contract).
//
// Why Strategy A: Lattice adapter .execute(request) accepts only
//   {task, artifacts, outputs} and builds a single-user-message HTTP body
//   internally [VERIFIED: lattice/packages/lattice/src/providers/adapters.ts
//   :55-107]. It CANNOT carry FSB's autopilot tool-use payload. Passing
//   our requestBody to it would silently drop tools[] / cache_control /
//   systemInstruction / generationConfig. Strategy B (refactor agent-loop
//   to Lattice's shape) would violate INV-04 + INV-06. Strategy A
//   preserves both.

const PROVIDER_FACTORIES = {
  xai:        createXaiProvider,
  openai:     createOpenAIProvider,
  anthropic:  createAnthropicProvider,
  gemini:     createGeminiProvider,
  openrouter: createOpenRouterProvider,
  lmstudio:   createLmStudioProvider,                  // FSB key 'lmstudio' (no hyphen) -> Lattice 'createLmStudioProvider' (camelCase Lm)
  custom:     createOpenAICompatibleProvider,          // FSB key 'custom'   -> Lattice 'createOpenAICompatibleProvider'
};

// Per-call abort registry. Key: requestId; Value: AbortController.
// Cleaned up in finally{} of the execute handler (success / error / abort).
// Unknown-requestId aborts are silent no-ops (Map.get -> undefined -> if
// (ctl) guard) per RESEARCH Section 7 race-condition note.
const _inflightAborts = new Map();

function _trim(s) { return typeof s === "string" ? s.trim() : ""; }

/**
 * Compute the provider HTTP endpoint URL given an FSB provider key + config.
 * Mirrors PROVIDER_CONFIGS.endpoint from extension/ai/universal-provider.js
 * (the legacy fallback path) so the autopilot fetch reaches the same
 * endpoint Lattice's adapter would.
 *
 * @param {string} providerKey -- FSB key: xai|openai|anthropic|gemini|openrouter|lmstudio|custom
 * @param {Object} config -- {apiKey?, model?, baseUrl?}
 * @returns {string} HTTPS URL
 */
function computeUrl(providerKey, config) {
  switch (providerKey) {
    case "xai":        return "https://api.x.ai/v1/chat/completions";
    case "openai":     return "https://api.openai.com/v1/chat/completions";
    case "anthropic":  return "https://api.anthropic.com/v1/messages";
    case "gemini": {
      const apiKey = encodeURIComponent(_trim(config && config.apiKey));
      const model = (config && config.model) || "gemini-1.5-flash";
      return "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
    }
    case "openrouter": return "https://openrouter.ai/api/v1/chat/completions";
    case "lmstudio": {
      const base = ((config && config.baseUrl) || "http://localhost:1234/v1").replace(/\/+$/, "");
      return base + "/chat/completions";
    }
    case "custom": {
      const ep = ((config && config.baseUrl) || "").replace(/\/+$/, "");
      return ep.endsWith("/chat/completions") ? ep : ep + "/chat/completions";
    }
    default: throw new Error("computeUrl: unknown provider " + providerKey);
  }
}

/**
 * Compute the provider auth + content headers given an FSB provider key +
 * config. Mirrors getHeaders() in extension/ai/universal-provider.js so the
 * autopilot fetch passes the same headers Lattice's adapter would.
 *
 * API-key is NEVER returned in plaintext via any code path; it is only
 * embedded in the constructed Authorization / x-api-key header value here.
 *
 * @param {string} providerKey
 * @param {Object} config -- {apiKey?, ...}
 * @returns {Object<string,string>} headers
 */
function computeHeaders(providerKey, config) {
  const headers = { "Content-Type": "application/json" };
  const apiKey = _trim(config && config.apiKey);
  switch (providerKey) {
    case "xai":
    case "openai":
    case "openrouter":
    case "custom":
      headers["Authorization"] = "Bearer " + apiKey;
      return headers;
    case "anthropic":
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      return headers;
    case "gemini":   return headers;  // auth via ?key= query
    case "lmstudio": return headers;  // no auth by convention
    default: throw new Error("computeHeaders: unknown provider " + providerKey);
  }
}

console.log(HOST_TAG, "boot: Plan 05-04 offscreen Lattice host loaded");

/**
 * Pre-warm the survivability adapter contract. The noop adapter is the
 * Plan 05-02 reference impl; Plan 05-05 ships the chrome.storage.session-
 * backed real adapter that the SW + offscreen pair will use in production.
 *
 * In Plan 05-04 the noop adapter is registered just to prove the bare
 * specifier resolves and the SurvivabilityAdapter contract is reachable
 * from this offscreen context.
 */
const survivability = createNoopSurvivabilityAdapter({ id: "fsb-offscreen-noop" });
console.log(HOST_TAG, "survivability adapter id:", survivability.id, "kind:", survivability.kind);

/**
 * Per-receipt signer + key set. Phase 5 generates an ephemeral keypair
 * per offscreen boot -- production code (a future phase) will load the
 * keypair from chrome.storage.session managed by the SW-side persistence
 * layer + the SurvivabilityAdapter serialize/deserialize round-trip.
 *
 * The Phase 1 + Phase 2 + Phase 3 receipt contract is end-to-end:
 *   - generateEd25519KeyPairJwk() returns { privateKeyJwk, publicKeyJwk }
 *   - createInMemorySigner() returns a ReceiptSigner with sign(bytes)
 *   - createCheckpointHook() returns a HookHandler that mints receipts
 */
let signer = null;
let pipeline = null;

(async () => {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  signer = createInMemorySigner(privateKeyJwk, { kid: "fsb-offscreen-ephemeral", publicKeyJwk });

  pipeline = createHookPipeline();
  console.log(HOST_TAG, "ephemeral signer + hook pipeline ready");
})().catch((err) => {
  console.error(HOST_TAG, "boot init failed:", err && err.message ? err.message : err);
});

/**
 * SW <-> offscreen message bus listener (D-16). Listens for
 * 'lattice-step-transition' envelopes from the SW; invokes the Phase 3
 * checkpoint hook; posts back a 'lattice-receipt-minted' envelope (or
 * 'lattice-receipt-mint-failed' on best-effort mint failure per D-07).
 *
 * Origin check: chrome.runtime.onMessage rejects messages from other
 * extensions; sender.id === chrome.runtime.id for in-extension messages.
 */
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) {
      console.warn(HOST_TAG, "rejecting cross-extension message from", sender.id);
      return false;
    }
    if (message.type !== "lattice-step-transition") return false;

    if (!signer || !pipeline) {
      console.warn(HOST_TAG, "boot init not complete; dropping step-transition message");
      return false;
    }

    const payload = message.payload || {};
    const runId = String(payload.runId || "");
    const stepName = String(payload.stepName || "");
    const stepIndex = Number(payload.stepIndex);
    const timestamp = String(payload.timestamp || new Date().toISOString());

    if (!runId || !stepName || !Number.isFinite(stepIndex)) {
      console.warn(HOST_TAG, "invalid step-transition payload; dropping");
      return false;
    }

    // Compose Phase 3's checkpoint hook with Plan 05-04's signer + pipeline.
    // The hook mints exactly one signed v1.1 Capability Receipt per
    // invocation; best-effort per D-07.
    const handler = createCheckpointHook({
      runId,
      signer,
      sessionId: payload.sessionId,
      tracer: {
        event: (kind, metadata) => {
          if (kind !== STEP_TRANSITION_EVENT_NAME) return;
          if (metadata && metadata.envelope) {
            chrome.runtime.sendMessage({
              type: "lattice-receipt-minted",
              payload: {
                envelope: metadata.envelope,
                runId,
                stepIndex,
              },
            }).catch((err) => {
              console.warn(HOST_TAG, "sendMessage receipt-minted failed:", err && err.message);
            });
          } else if (metadata && metadata.mintError) {
            chrome.runtime.sendMessage({
              type: "lattice-receipt-mint-failed",
              payload: {
                runId,
                stepIndex,
                mintError: String(metadata.mintError),
              },
            }).catch((err) => {
              console.warn(HOST_TAG, "sendMessage mint-failed failed:", err && err.message);
            });
          }
        },
      },
    });

    // Compose with Phase 2's hook pipeline + register on AFTER_TOOL band
    // OBSERVABILITY (DEFAULT_CHECKPOINT_BAND === 1). Then RUN the
    // pipeline against the synthesized context built from the message.
    pipeline.register("AFTER_TOOL", handler, { band: DEFAULT_CHECKPOINT_BAND });

    const ctx = {
      stepName,
      stepIndex,
      timestamp,
      ...(payload.parentStepName !== undefined ? { parentStepName: payload.parentStepName } : {}),
      ...(payload.previousStepName !== undefined ? { previousStepName: payload.previousStepName } : {}),
    };

    pipeline.run("AFTER_TOOL", ctx).catch((err) => {
      console.error(HOST_TAG, "pipeline.run failed:", err && err.message ? err.message : err);
    });

    // chrome.runtime.onMessage listeners that do async work return true to
    // keep the channel open; we use sendMessage for replies (not
    // sendResponse) so we return false.
    return false;
  });

  console.log(HOST_TAG, "chrome.runtime.onMessage listener registered for 'lattice-step-transition'");
} else {
  console.warn(HOST_TAG, "chrome.runtime.onMessage not available; SW <-> offscreen bus unavailable (Node test context?)");
}

// ==========================================================================
// Phase 6 Plan 06-01 (FINT-07) -- second onMessage listener for
//                                  lattice-provider-execute +
//                                  lattice-provider-abort.
// ==========================================================================
//
// The Phase 5 listener above (step-transition handler) stays byte-frozen;
// Chrome runs all registered listeners in registration order; each returns
// `false` for messages it does not own so only the matching handler keeps
// the channel open per Pitfall 1 in RESEARCH Section 8.
//
// Wire contract:
//   SW -> offscreen (request-response):
//     chrome.runtime.sendMessage({
//       type: 'lattice-provider-execute',
//       requestId: string,      // crypto.randomUUID() generated SW-side
//       provider: string,       // FSB key: xai|openai|anthropic|gemini|openrouter|lmstudio|custom
//       config: { apiKey?, model?, baseUrl? },
//       requestBody: object,    // FSB's pre-built provider-formatted body (autopilot mode only)
//       mode: 'autopilot' | 'test-connection',
//     })
//
//   offscreen -> SW (sendResponse envelope):
//     success: { ok: true, response: { rawResponse: <HTTP body JSON> } }    (autopilot)
//     success: { ok: true, response: <ProviderRunResponse> }                (test-connection)
//     error:   { ok: false, error: { kind, message, providerError? } }
//
//   Error.kind in {'aborted', 'adapter_error', 'host_unreachable',
//                   'invalid_provider', 'fetch_error'}.
//
//   SW -> offscreen (fire-and-forget; cancels an in-flight execute):
//     chrome.runtime.sendMessage({
//       type: 'lattice-provider-abort',
//       requestId: string,      // matches the execute message's requestId
//     })

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return false;

    // Abort branch -- synchronous; no sendResponse needed; unknown requestId
    // is a silent no-op (Map.get -> undefined -> if (ctl) guard).
    if (message.type === "lattice-provider-abort") {
      const ctl = _inflightAborts.get(message.requestId);
      if (ctl) {
        try { ctl.abort(); } catch (_e) { /* swallow */ }
      }
      return false;
    }

    // Execute branch -- async; MUST return true to keep the channel open.
    if (message.type !== "lattice-provider-execute") return false;

    const requestId = String(message.requestId || "");
    const providerKey = String(message.provider || "");
    const config = message.config || {};
    const requestBody = message.requestBody || {};
    const mode = message.mode || "autopilot";

    // Synchronous unknown-provider check -- envelope returned before any
    // factory call. Pitfall 5 mitigation (RESEARCH Section 8).
    const factory = PROVIDER_FACTORIES[providerKey];
    if (typeof factory !== "function") {
      sendResponse({
        ok: false,
        error: { kind: "invalid_provider", message: "Unknown provider: " + providerKey },
      });
      return false;
    }

    const controller = new AbortController();
    _inflightAborts.set(requestId, controller);

    (async () => {
      try {
        if (mode === "test-connection") {
          // Strategy A: test-connection uses Lattice adapter natively.
          // Single-shot single-user-message fits Lattice's
          // ProviderRunRequest contract.
          const adapter = factory({
            apiKey: _trim(config.apiKey),
            model: config.model,
            baseUrl: config.baseUrl,
          });
          const response = await adapter.execute({
            task: "Test connection.",
            artifacts: [],
            outputs: ["text"],
          }, { signal: controller.signal });
          sendResponse({ ok: true, response: response });
        } else {
          // Strategy A: autopilot uses our own fetch() with the pre-built
          // requestBody. The factory is still instantiated per call so
          // INV-03 holds at the dispatch level (consumption-of-Lattice-
          // adapters contract honored architecturally; runtime fetch
          // bypasses Lattice's body builder because adapter.execute()
          // cannot carry FSB's tools[]/messages[] payload).
          factory({
            apiKey: _trim(config.apiKey),
            model: config.model,
            baseUrl: config.baseUrl,
          });
          const url = computeUrl(providerKey, config);
          const headers = computeHeaders(providerKey, config);
          const fetchResp = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          if (!fetchResp.ok) {
            const status = fetchResp.status;
            let text = "";
            try { text = await fetchResp.text(); } catch (_e) { /* ignore */ }
            const err = new Error(providerKey + " provider failed with " + status + (text ? ": " + text : ""));
            err.status = status;
            err.providerError = text;
            throw err;
          }
          const json = await fetchResp.json();
          sendResponse({ ok: true, response: { rawResponse: json } });
        }
      } catch (err) {
        const isAbort = err && (err.name === "AbortError" || /abort/i.test(String(err && err.message || "")));
        sendResponse({
          ok: false,
          error: {
            kind: isAbort ? "aborted" : (mode === "autopilot" ? "fetch_error" : "adapter_error"),
            message: String(err && err.message ? err.message : err),
            providerError: err && err.providerError ? err.providerError : undefined,
          },
        });
      } finally {
        _inflightAborts.delete(requestId);
      }
    })();

    return true; // CRITICAL: keep channel open for async sendResponse
  });
  console.log(HOST_TAG, "boot: Phase 6 Plan 06-01 lattice-provider-execute + abort handlers registered");
}
