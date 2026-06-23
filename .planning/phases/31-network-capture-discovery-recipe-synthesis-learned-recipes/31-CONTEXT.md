# Phase 31: Network-Capture Discovery + Recipe Synthesis + Learned Recipes - Context

**Gathered:** 2026-06-22 (smart discuss — autonomous mode; all 4 areas accepted as recommended)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the highest-novelty auto-growth layer, stacking ONLY on the now-proven consent (Phase 30), memory, router/catalog (Phase 29), and search (Phase 28) layers:
- **Consent-gated CDP Network capture** discovers real API calls on a consented origin (DISC-01..04).
- **Capture-time redaction** keeps request SHAPE only — never bodies/PII/auth (DISC-03 / LEARN-02).
- **Recipe synthesis** turns a discovered-and-replayed call into a closed-vocab declarative recipe (LEARN-01).
- **Per-origin procedural memory** stores learned recipes; they feed the capability search index (LEARN-03) and become the REAL T2 router tier, outranking generic recipes (LEARN-04).

**In scope (DISC-01..04, LEARN-01..04).**

**Explicitly NOT in this phase:**
- **Self-healing fallback / recipe-rot detection / re-learn** (a learned recipe that breaks → DOM fallback completes the task → re-learn) — that is **Phase 32**. Phase 31 QUARANTINES a failing learned recipe (D-16) but does not heal it.
- **The formal 7-provider parity gate + schema-lock parity test** as a milestone gate — **Phase 32**.
- **Local recipe SIGNING** (a device keypair) — learned recipes are exempt-by-local-provenance here (D-09); signing is a deferred defense-in-depth option only.
- Phase 29's router/catalog/head and Phase 30's consent/audit/signature are DONE; this phase EXTENDS the T2 stub, the search index, the signature provenance set, and `redactForLog` — it does not re-architect them.
</domain>

<decisions>
## Implementation Decisions

### Discovery Capture Mechanism (DISC-01, DISC-02, DISC-04)
- **D-01:** Discovery is a **USER-INITIATED, time-boxed capture session** (an explicit "discover capabilities on this origin" action — a control-panel control and/or an MCP tool), NOT silent auto-capture on page load. Auto-attaching the debugger surfaces the "DevTools is debugging this tab" banner and silently recording all traffic is invasive even on a consented origin. The session is bounded by time AND request count.
- **D-02:** Capture **reuses the EXISTING Input-domain `chrome.debugger` attachment** (`extension/background.js:13922`; the `"debugger"` permission is already in `manifest.json:15` — **NO manifest change**, DISC-02), cooperating with the existing attach/detach lifecycle + the KeyboardEmulator lock. It adds `Network.enable` and listens for `Network.requestWillBeSent` / `Network.responseReceived` via `chrome.debugger.onEvent`, then detaches (or releases the Network domain) at session end. It MUST NOT disrupt Input emulation.
- **D-03:** Capture is **consent-gated (DISC-04):** the capture-start checks `FsbConsentPolicyStore.getConsentForOrigin(origin).mode != 'off'` AND `!FsbServiceDenylist.isDenied(origin)` — never default-OFF, never denied. A **sensitive-classified** origin (`FsbServiceDenylist.classify().sensitive`) requires extra confirmation, consistent with the Phase-30 gate friction.
- **D-04:** Capture records **same-origin XHR/fetch API calls only** — filter out document/image/stylesheet/font/media subresource requests (by CDP `Type`/resource type). Cross-origin requests are not candidates (the origin-pin requires first-party).

### Capture-Time Redaction (DISC-03, LEARN-02)
- **D-05:** Redaction happens **AT CAPTURE** inside the CDP event handler — the redacted shape is the ONLY thing that ever leaves the event; raw request/response bodies and header values never persist. Realized by extending `extension/utils/redactForLog.js` (or a `network-capture-redactor.js` that composes it) for Network CDP events.
- **D-06:** A learned recipe stores **request SHAPE only (LEARN-02):** method, URL **path-template (NO query string)**, header **NAMES**, csrf-source, extract-path, origin. It DROPS request/response bodies, cookie/auth header VALUES, query-string parameters, and all PII.
- **D-07:** Header redaction **drops ALL header values and keeps only names** (so even an unrecognized auth header leaks nothing), PLUS an explicit auth-carrier denylist removes the headers entirely where appropriate (`authorization`, `cookie`, `set-cookie`, `x-csrf-*`, `x-xsrf-*`, `x-api-key`, `bearer`).
- **D-08:** The capture **NEVER fetches or stores the response body** (no `Network.getResponseBody` persistence). An extract-path is inferred conservatively from response SHAPE only if strictly needed, and body content is never persisted (LEARN-02).

### Recipe Synthesis + Provenance / Signature Interaction (LEARN-01, SIGN-01/02 from Phase 30)
- **D-09:** Synthesized learned recipes carry **`provenance: 'local'` and are EXEMPT from the Phase-30 Ed25519 signature verify** (trusted-by-local-synthesis — built on THIS device from observed first-party traffic; no remote-delivery tampering vector), parallel to the `'bundled'` exemption. **The HI-01 trust rule holds:** provenance is assigned by the trusted **synthesizer/loader**, NEVER read from a `provenance` field inside an untrusted recipe payload. Extend `capability-signature.js` + the `interpretRecipe` verify hook to recognize `'local'` as a trusted-provenance value passed via the loader's `trustedProvenance` argument.
- **D-10:** Synthesis produces a **CANDIDATE on capture**, but **PROMOTES to per-origin procedural memory ONLY after a successful discovered-and-replayed call** (LEARN-01 "successfully discovered-and-replayed"). A candidate that does not replay cleanly through the existing `interpretRecipe -> executeBoundSpec` path is discarded, not stored.
- **D-11:** `authStrategy` is **inferred from the captured request** against the closed enum: default `same-origin-cookie`; `csrf-header-scrape` if a CSRF-style header was present; `from:'response'` if a token was minted by a prior same-origin GET. Ambiguous inference defaults to `same-origin-cookie` and is flagged for Phase-32 self-healing.
- **D-12:** A synthesized recipe is **validated against the closed-vocabulary schema (`FsbCapabilityRecipeSchema.validateRecipe`) BEFORE promotion**; a non-conforming synthesis is rejected and never stored.

### Memory + Search Index + Routing (LEARN-01, LEARN-03, LEARN-04)
- **D-13:** Learned recipes live in a **NEW per-origin learned-recipe store** — a versioned `chrome.storage.local` envelope mirroring `consent-policy-store.js` / `audit-log.js` / `agent-registry.js`, keyed by origin + slug — **NOT folded into the existing 500-cap `extension/lib/memory/` layer** (so learned recipes do not compete with semantic/task memories for the cap, and the router gets per-origin fast lookup).
- **D-14:** `addLearnedRecipe(recipe, descriptor)` (a NEW export on `capability-search.js`) **feeds the MiniSearch capability index (LEARN-03):** it adds the descriptor (preserving the load-bearing `INDEX_OPTIONS`) + the slug→recipe map entry, then persists the updated snapshot (bump the `catalogVersion` / content-hash so an SW restart rebuilds with the learned entries included).
- **D-15:** Routing uses **Option A (LEARN-04 outranking):** `FsbCapabilityCatalog.resolve(slug, origin)` checks the learned store FIRST (via a `_getLearned()` accessor parallel to the existing `_search()`); a learned recipe for the active origin resolves as a **T2 tier with the recipe attached** and executes through the existing `_runDeclarativeTier` (so a learned recipe OUTRANKS a generic T1b by dispatch order — T2 is checked before the T1b/T3 fall-through). The `RECIPE_LEARN_PENDING` stub at `capability-router.js:498` fires ONLY when no learned recipe exists.
- **D-16:** The learned store is bounded by a **per-origin cap + LRU by `lastSuccessAt`**; a learned recipe that starts failing is **QUARANTINED for Phase-32 recipe-rot detection** (flagged, demoted from routing), NOT deleted in this phase.

### Claude's Discretion
- The exact capture-session API surface, the time/count session bounds, and whether the discovery trigger is a control-panel action, an MCP tool, or both.
- The URL path-template heuristic (how a concrete path becomes a parameterized endpoint) and the CSRF-detection heuristic specifics.
- The learned-store envelope version + the `addLearnedRecipe` / store API names.
- The snapshot-invalidation mechanism (content-hash vs catalogVersion bump) for the search index.
- Whether the redactor is an extension of `redactForLog.js` or a composing `network-capture-redactor.js` (either is fine if redaction stays AT capture and reuses the shape-only discipline).

### Folded Todos
None — no pending todos matched Phase 31.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Requirements / roadmap / prior context:
- `.planning/REQUIREMENTS.md` — DISC-01..04 (lines ~62-70), LEARN-01..04 (lines 71-74); LEARN-02 (request-shape-only) is the GOV-06 auth-stays-local mandate applied to capture.
- `.planning/ROADMAP.md` — Phase 31 details; INV-01..04 (lines 17-20); Phase 32 boundary (self-healing/recipe-rot/parity — do NOT pull in).
- `.planning/phases/30-consent-governance-recipe-signature-verification-audit-legal/30-CONTEXT.md` — the consent gate + service-denylist classify + the signature provenance model (D-07 bundled exemption, HI-01 trusted-provenance rule) this phase extends with `'local'`.
- `.planning/phases/29-catalog-tiered-router-bundled-head-declarative-tail-autopilo/29-CONTEXT.md` — the router T2 stub + catalog resolve + biasByOwnedOrigin; the `interpretRecipe -> executeBoundSpec` replay path.
- `.planning/phases/28-lean-mcp-surface-capability-search-eval-harness/28-CONTEXT.md` — the MiniSearch index + getRecipeBySlug + INDEX_OPTIONS the learned recipes feed.

Source anchors (verified by the Phase-31 codebase scout, `automation-worktree`, 2026-06-22):
- `extension/background.js:13920-14002` — the EXISTING `chrome.debugger.attach({tabId},'1.3')` + `sendCommand` Input-domain lifecycle + the "already attached" collision handling + the KeyboardEmulator coordination; `manifest.json:15` `"debugger"` permission (D-02 reuses these, no manifest change).
- `extension/utils/consent-policy-store.js:40-104` (`getConsentForOrigin`/`readPolicies`) + `extension/utils/service-denylist.js:120-145` (`isDenied`, `classify`) — the consent gate the capture-start consumes (D-03).
- `extension/utils/redactForLog.js:16-63` — the shape-only redactor extended for capture-time redaction (D-05..D-08).
- `extension/utils/capability-recipe-schema.js:59-112` (`RECIPE_SCHEMA`, the `authStrategy` enum at :112) + `validateRecipe()` — the closed vocabulary a synthesized recipe MUST satisfy (D-11/D-12).
- `extension/lib/memory/memory-storage.js:19-135` + `memory-schemas.js:13-100` — the existing memory layer (NOT used for learned-recipe storage, D-13) and the versioned-storage pattern to mirror in the new store.
- `extension/utils/capability-search.js:47-149` (`INDEX_OPTIONS`, `buildIndex`, `buildOrRestore`, `STORAGE_KEY='fsbCapabilityIndex'`) + `:222-224` (`getRecipeBySlug`, `_slugToRecipe`) — where `addLearnedRecipe` adds to the index (D-14).
- `extension/utils/capability-router.js:498-501` (the T2 `RECIPE_LEARN_PENDING` stub) + `extension/utils/capability-catalog.js:203-267` (`resolve`, `biasByOwnedOrigin`) — the T2-tier learned lookup + outranking seam (D-15).
- `extension/utils/capability-signature.js:65-67` (the `provenance:'bundled'` exemption) + `extension/utils/capability-interpreter.js:65-74` + the `trustedProvenance` arg (HI-01) — extended with the `'local'` exemption (D-09).
- `extension/catalog/recipe-index.generated.js:7-34` + `catalog/recipes/*.json` + `catalog/descriptors/*.json` — the recipe + descriptor pair shape a synthesizer emits.
- Greenfield (net-new): the network-capture module, the synthesizer, the per-origin learned-recipe store, and the `addLearnedRecipe` index export.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The existing `chrome.debugger` Input-domain attachment** (`background.js:13920-14002`) — attach/detach/collision lifecycle + KeyboardEmulator lock; Network domain is added to the SAME attachment (DISC-02, no manifest change).
- **The Phase-30 consent gate** (`consent-policy-store.js`, `service-denylist.js` `isDenied`/`classify`) — capture-start gating (DISC-04).
- **`redactForLog.js`** shape-only redactor — extended for capture-time request-shape redaction (LEARN-02).
- **The closed recipe schema + `validateRecipe`** (`capability-recipe-schema.js`) — the synthesizer's output contract.
- **The memory storage + versioned-envelope pattern** (`memory-storage.js`, consent/audit stores) — the pattern (not the 500-cap layer) for the new learned-recipe store.
- **The MiniSearch index** (`capability-search.js` `buildIndex`/`INDEX_OPTIONS`/`getRecipeBySlug`) — fed by `addLearnedRecipe` (LEARN-03).
- **The router T2 stub + catalog resolve + biasByOwnedOrigin** (`capability-router.js:498`, `capability-catalog.js:203-267`) — the learned-recipe T2 tier + outranking (LEARN-04).
- **The signature provenance model + `interpretRecipe -> executeBoundSpec` replay** (`capability-signature.js`, `capability-interpreter.js`) — the `'local'` exemption + the replay path for promotion.

### Established Patterns
- **Versioned `chrome.storage.local` envelopes** `{v, ...}` (consent/audit/agent-registry) — the learned-recipe store shape.
- **typeof-guarded SW-global accessors** (`_search()`, `_consentStore()`, `_getLearned()`) — degrade gracefully when a module is absent.
- **Closed-vocabulary recipe + separate searchable descriptor** — the synthesizer emits BOTH.
- **Trusted-provenance gating (HI-01)** — provenance is assigned by the loader/synthesizer, never read from an untrusted payload; `'local'` joins `'bundled'` as a trusted-exempt value.
- **Origin-pin holds on replay** — a synthesized recipe replays through `executeBoundSpec`, which re-pins the active-tab origin (the capture/replay never bypasses the pin).

### Integration Points
- `extension/utils/network-capture.js` (NEW) — consent-gated CDP Network capture session over the existing debugger attachment.
- `extension/utils/network-capture-redactor.js` (NEW, or extend redactForLog.js) — capture-time request-shape redaction.
- `extension/utils/recipe-synthesizer.js` (NEW) — redacted-capture -> closed-vocab recipe + descriptor; validate; candidate.
- `extension/utils/learned-recipe-store.js` (NEW) — per-origin versioned chrome.storage.local store; promote-after-replay; LRU + quarantine.
- `extension/utils/capability-search.js` (MODIFIED) — `addLearnedRecipe(recipe, descriptor)` + snapshot persist (LEARN-03).
- `extension/utils/capability-catalog.js` (MODIFIED) — `resolve` checks the learned store first (T2 with recipe), `_getLearned()` accessor (LEARN-04).
- `extension/utils/capability-router.js` (MODIFIED) — T2 case dispatches a learned recipe via `_runDeclarativeTier` instead of the stub when present.
- `extension/utils/capability-signature.js` + `capability-interpreter.js` (MODIFIED) — recognize `'local'` trusted provenance (exempt).
- `extension/background.js` (MODIFIED) — additive importScripts for the new modules + the capture-session entry; the Network-domain `chrome.debugger.onEvent` listener.
- `scripts/verify-recipe-path-guard.mjs` (MODIFIED) — allowlist any new recipe-path-adjacent module (eval-free).
- `tests/*` (NEW) — capture (mocked debugger events), redaction (no-secret), synthesis (schema-valid), promote-after-replay, learned-store, search-add, T2 outranking, `'local'` provenance exemption; wired into `npm test`.

### `agent-loop.js` is UNTOUCHED (INV-04)
- Discovery/synthesis are SW-side; the `setTimeout` iterator is not touched.
</code_context>

<specifics>
## Specific Ideas

- **User-initiated, not silent:** discovery is an explicit, time-boxed, consent-gated session — privacy-respecting; FSB does not silently record traffic even on a consented origin (D-01).
- **Redact at capture, store shape only:** raw bodies/header-values/query-params never persist; the request shape is the only artifact (D-05..D-08, LEARN-02 = GOV-06 applied to capture).
- **Local provenance, not payload-asserted:** learned recipes are exempt from signature verify because the LOADER vouches they were locally synthesized — the recipe can never self-declare `'local'` to dodge verify (D-09, HI-01 rule).
- **Promote only what replays:** a candidate becomes a learned recipe only after it successfully replays through the real `interpretRecipe -> executeBoundSpec` path (D-10) — no speculative recipes in memory.
- **Learned outranks generic at the catalog, by dispatch order:** Option A — the catalog resolves a learned T2 recipe first; no router tie-break logic (D-15, LEARN-04).
- **Stacks only on proven layers:** consent (30), router/catalog/T2 (29), search (28), signature/redaction (30) — Phase 31 adds capture + synthesis + a learned store and wires them in; it does not re-architect.

### Pitfalls to avoid
- Do NOT capture/persist response bodies, header values, or query params (LEARN-02 / GOV-06) — redact AT capture.
- Do NOT let a recipe self-declare `'local'` provenance to skip signature verify — provenance comes from the trusted synthesizer (HI-01).
- Do NOT capture on Off/denied origins, and add extra friction on sensitive origins (DISC-04 + the Phase-30 sensitive rule).
- Do NOT disrupt the existing Input-domain debugger emulation when adding the Network domain (DISC-02).
- Do NOT heal a broken learned recipe here — quarantine it for Phase 32 (D-16).
- Do NOT fold learned recipes into the 500-cap memory layer (D-13).
- Do NOT touch `agent-loop.js`'s iterator (INV-04) or break the Phase-29/30 invariants (INV-01 hash, INV-02 one-engine, origin-pin, the consent gate).
</specifics>

<deferred>
## Deferred Ideas

- **Self-healing fallback + recipe-rot detection + re-learn** (a quarantined/broken learned recipe → DOM fallback completes the task → re-learn) — **Phase 32**. Phase 31 only quarantines (D-16).
- **The 7-provider parity gate + schema-lock parity test** as a milestone gate — **Phase 32**.
- **Local recipe SIGNING (a device keypair, Option B)** — deferred defense-in-depth; Phase 31 uses local-provenance exemption (D-09).
- **Deeper CSRF / auth-strategy inference heuristics** beyond the conservative default — refined as real captures are observed.
- **Automatic background discovery** (vs the user-initiated session) — out of scope for the privacy posture; could be revisited as an explicit per-origin opt-in later.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 31.
</deferred>
