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

const HOST_TAG = "[FSB lattice-host]";

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
