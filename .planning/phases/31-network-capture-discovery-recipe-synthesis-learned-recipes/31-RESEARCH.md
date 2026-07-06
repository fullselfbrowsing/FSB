# Phase 31: Network-Capture Discovery + Recipe Synthesis + Learned Recipes - Research

**Researched:** 2026-06-22
**Domain:** Chrome DevTools Protocol (Network domain) capture over an existing debugger attachment; capture-time PII/credential redaction; declarative recipe synthesis against a closed-vocabulary schema; per-origin procedural-memory store + search-index + tiered-router integration; trusted-provenance signature exemption.
**Confidence:** HIGH (every codebase seam read at file:line; all 3 CDP unknowns resolved against the official Chrome DevTools Protocol Network + debugger docs).

## Summary

Phase 31 is an additive auto-growth layer that stacks on the proven Phase 28 (search index), Phase 29 (catalog/router/T2 stub + `interpretRecipe -> executeBoundSpec` replay path), and Phase 30 (consent gate, service-denylist classify, Ed25519 signature verify with the HI-01 `trustedProvenance` hook) layers. Nothing here re-architects: it adds a consent-gated CDP Network capture session over the **existing** Input-domain `chrome.debugger` attachment, a capture-time shape-only redactor, a synthesizer that emits a closed-vocab recipe + descriptor, a new per-origin learned-recipe store, and the four wire-ins (`'local'` provenance exemption, `addLearnedRecipe`, catalog `_getLearned()` outranking, router T2 dispatch).

All three primary CDP unknowns are resolved with HIGH confidence against the official protocol docs: (1) multiple CDP domains coexist on one `chrome.debugger.attach` — `Network.enable` + the `Network.requestWillBeSent`/`responseReceived` events arrive via `chrome.debugger.onEvent` alongside the existing `Input.*` `sendCommand` traffic without disrupting Input emulation; (2) the `requestWillBeSent` event carries a `type` field (the `ResourceType` enum) so XHR/Fetch can be filtered from Document/Image/Stylesheet/Font/Media subresources at the handler; (3) `Network.responseReceived` exposes `response.status`, `response.statusText`, `response.headers`, and `response.mimeType` **directly on the event — without ever calling `Network.getResponseBody`** — which is exactly what D-08 requires (never fetch/persist the body).

**Two findings GATE the plan and must be honored as hard constraints:** (A) The declarative fetch primitive `capabilityFetchInPage` (the replay/promotion path that a learned T2 recipe runs through via `_runDeclarativeTier`) handles `csrf.from === 'meta'` and `csrf.from === 'cookie'` ONLY; `csrf.from === 'response'` is explicitly **not** handled in the declarative path (`capability-fetch.js:163` "deferred to Phase 29"; the response-CSRF flow was implemented only in the **T1a imperative handlers**, not the declarative primitive). Therefore the synthesizer MUST NOT emit a learned recipe with `csrf.from === 'response'` — it would pass `validateRecipe` but FAIL the promote-after-replay gate. Ambiguous "token minted by a prior GET" cases default to `authStrategy: 'same-origin-cookie'` and are flagged for Phase 32 (this is precisely D-11's "ambiguous inference defaults to same-origin-cookie and is flagged"). (B) The recipe-path CI guard (`verify-recipe-path-guard.mjs`) Check 4 **auto-globs `extension/utils/capability-*.js` from disk and fails CI closed** on any such file not on `RECIPE_PATH_ALLOWLIST`. The CONTEXT's net-new module names (`network-capture.js`, `recipe-synthesizer.js`, `learned-recipe-store.js`, `network-capture-redactor.js`) do NOT match the glob, so they are not auto-scanned — but the synthesizer and learned-store ARE recipe-path-adjacent and the CONTEXT integration list already calls for `verify-recipe-path-guard.mjs (MODIFIED)`; they should be listed explicitly on the allowlist AND kept dynamic-code-free (eval / new Function / import — even in comments).

**Primary recommendation:** Implement four net-new dynamic-code-free SW modules (`network-capture.js`, `network-capture-redactor.js`, `recipe-synthesizer.js`, `learned-recipe-store.js`) plus four minimal additive edits (`capability-signature.js` + `capability-interpreter.js` recognize `'local'` alongside `'bundled'`; `capability-search.js` gains `addLearnedRecipe`; `capability-catalog.js` `resolve` checks `_getLearned()` first; `capability-router.js` T2 dispatches via `_runDeclarativeTier` with `trustedProvenance:'local'`). Capture filters to same-origin XHR/Fetch, redacts AT the event handler (header names only, no values, no body, no query), synthesizes a `same-origin-cookie` (or `meta`/`cookie` CSRF-scrape) recipe, replays it through the real `interpretRecipe -> executeBoundSpec` path, and promotes ONLY on a clean replay.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Discovery Capture Mechanism (DISC-01, DISC-02, DISC-04)**
- **D-01:** Discovery is a **USER-INITIATED, time-boxed capture session** (an explicit "discover capabilities on this origin" action — a control-panel control and/or an MCP tool), NOT silent auto-capture on page load. The session is bounded by time AND request count.
- **D-02:** Capture **reuses the EXISTING Input-domain `chrome.debugger` attachment** (`extension/background.js:13922`; the `"debugger"` permission is already in `manifest.json:15` — **NO manifest change**, DISC-02), cooperating with the existing attach/detach lifecycle + the KeyboardEmulator lock. It adds `Network.enable` and listens for `Network.requestWillBeSent` / `Network.responseReceived` via `chrome.debugger.onEvent`, then detaches (or releases the Network domain) at session end. It MUST NOT disrupt Input emulation.
- **D-03:** Capture is **consent-gated (DISC-04):** the capture-start checks `FsbConsentPolicyStore.getConsentForOrigin(origin).mode != 'off'` AND `!FsbServiceDenylist.isDenied(origin)` — never default-OFF, never denied. A **sensitive-classified** origin (`FsbServiceDenylist.classify().sensitive`) requires extra confirmation, consistent with the Phase-30 gate friction.
- **D-04:** Capture records **same-origin XHR/fetch API calls only** — filter out document/image/stylesheet/font/media subresource requests (by CDP `Type`/resource type). Cross-origin requests are not candidates (the origin-pin requires first-party).

**Capture-Time Redaction (DISC-03, LEARN-02)**
- **D-05:** Redaction happens **AT CAPTURE** inside the CDP event handler — the redacted shape is the ONLY thing that ever leaves the event; raw request/response bodies and header values never persist. Realized by extending `extension/utils/redactForLog.js` (or a `network-capture-redactor.js` that composes it) for Network CDP events.
- **D-06:** A learned recipe stores **request SHAPE only (LEARN-02):** method, URL **path-template (NO query string)**, header **NAMES**, csrf-source, extract-path, origin. It DROPS request/response bodies, cookie/auth header VALUES, query-string parameters, and all PII.
- **D-07:** Header redaction **drops ALL header values and keeps only names** (so even an unrecognized auth header leaks nothing), PLUS an explicit auth-carrier denylist removes the headers entirely where appropriate (`authorization`, `cookie`, `set-cookie`, `x-csrf-*`, `x-xsrf-*`, `x-api-key`, `bearer`).
- **D-08:** The capture **NEVER fetches or stores the response body** (no `Network.getResponseBody` persistence). An extract-path is inferred conservatively from response SHAPE only if strictly needed, and body content is never persisted (LEARN-02).

**Recipe Synthesis + Provenance / Signature Interaction (LEARN-01, SIGN-01/02 from Phase 30)**
- **D-09:** Synthesized learned recipes carry **`provenance: 'local'` and are EXEMPT from the Phase-30 Ed25519 signature verify** (trusted-by-local-synthesis), parallel to the `'bundled'` exemption. **The HI-01 trust rule holds:** provenance is assigned by the trusted **synthesizer/loader**, NEVER read from a `provenance` field inside an untrusted recipe payload. Extend `capability-signature.js` + the `interpretRecipe` verify hook to recognize `'local'` as a trusted-provenance value passed via the loader's `trustedProvenance` argument.
- **D-10:** Synthesis produces a **CANDIDATE on capture**, but **PROMOTES to per-origin procedural memory ONLY after a successful discovered-and-replayed call** (LEARN-01). A candidate that does not replay cleanly through the existing `interpretRecipe -> executeBoundSpec` path is discarded, not stored.
- **D-11:** `authStrategy` is **inferred from the captured request** against the closed enum: default `same-origin-cookie`; `csrf-header-scrape` if a CSRF-style header was present; `from:'response'` if a token was minted by a prior same-origin GET. Ambiguous inference defaults to `same-origin-cookie` and is flagged for Phase-32 self-healing.
- **D-12:** A synthesized recipe is **validated against the closed-vocabulary schema (`FsbCapabilityRecipeSchema.validateRecipe`) BEFORE promotion**; a non-conforming synthesis is rejected and never stored.

**Memory + Search Index + Routing (LEARN-01, LEARN-03, LEARN-04)**
- **D-13:** Learned recipes live in a **NEW per-origin learned-recipe store** — a versioned `chrome.storage.local` envelope mirroring `consent-policy-store.js` / `audit-log.js` / `agent-registry.js`, keyed by origin + slug — **NOT folded into the existing 500-cap `extension/lib/memory/` layer**.
- **D-14:** `addLearnedRecipe(recipe, descriptor)` (a NEW export on `capability-search.js`) **feeds the MiniSearch capability index (LEARN-03):** it adds the descriptor (preserving the load-bearing `INDEX_OPTIONS`) + the slug→recipe map entry, then persists the updated snapshot (bump the `catalogVersion` / content-hash so an SW restart rebuilds with the learned entries included).
- **D-15:** Routing uses **Option A (LEARN-04 outranking):** `FsbCapabilityCatalog.resolve(slug, origin)` checks the learned store FIRST (via a `_getLearned()` accessor parallel to the existing `_search()`); a learned recipe for the active origin resolves as a **T2 tier with the recipe attached** and executes through the existing `_runDeclarativeTier` (so a learned recipe OUTRANKS a generic T1b by dispatch order). The `RECIPE_LEARN_PENDING` stub at `capability-router.js:498` fires ONLY when no learned recipe exists.
- **D-16:** The learned store is bounded by a **per-origin cap + LRU by `lastSuccessAt`**; a learned recipe that starts failing is **QUARANTINED for Phase-32 recipe-rot detection** (flagged, demoted from routing), NOT deleted in this phase.

### Claude's Discretion
- The exact capture-session API surface, the time/count session bounds, and whether the discovery trigger is a control-panel action, an MCP tool, or both.
- The URL path-template heuristic (how a concrete path becomes a parameterized endpoint) and the CSRF-detection heuristic specifics.
- The learned-store envelope version + the `addLearnedRecipe` / store API names.
- The snapshot-invalidation mechanism (content-hash vs catalogVersion bump) for the search index.
- Whether the redactor is an extension of `redactForLog.js` or a composing `network-capture-redactor.js` (either is fine if redaction stays AT capture and reuses the shape-only discipline).

### Deferred Ideas (OUT OF SCOPE)
- **Self-healing fallback + recipe-rot detection + re-learn** (a quarantined/broken learned recipe → DOM fallback completes the task → re-learn) — **Phase 32**. Phase 31 only quarantines (D-16).
- **The 7-provider parity gate + schema-lock parity test** as a milestone gate — **Phase 32**.
- **Local recipe SIGNING (a device keypair, Option B)** — deferred defense-in-depth; Phase 31 uses local-provenance exemption (D-09).
- **Deeper CSRF / auth-strategy inference heuristics** beyond the conservative default — refined as real captures are observed.
- **Automatic background discovery** (vs the user-initiated session) — out of scope for the privacy posture; could be revisited as an explicit per-origin opt-in later.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | With consent, CDP Network capture (`Network.enable` + `requestWillBeSent`/`responseReceived`/`getResponseBody`) observes a page's real API calls to discover candidate capabilities. | CDP coexistence + event-shape verified (Architecture Pattern 1). NOTE: `getResponseBody` is named in the requirement but D-08 forbids persisting the body; status/headers/mimeType are read off `responseReceived` directly without it (Pitfall 3). |
| DISC-02 | Discovery reuses the existing `chrome.debugger` attachment by adding the Network domain (no manifest change) without disrupting Input emulation. | Multiple-domain coexistence confirmed (Pattern 1); existing attach/collision lifecycle at `background.js:13920-14002`; KeyboardEmulator coordination at `background.js:13915`. |
| DISC-03 | Captured requests are redacted at capture time, before any persistence, stripping auth/cookie/token/CSRF material. | `redactForLog.js` shape-only discipline + the D-07 auth-carrier denylist (Pattern 2; Don't Hand-Roll). |
| DISC-04 | Discovery runs only on origins set to Ask/Auto and never on default-Off origins. | `consent-policy-store.getConsentForOrigin` + `service-denylist.isDenied`/`classify` gate (Pattern 3; reused verbatim from the Phase-30 invoke gate). |
| LEARN-01 | A successfully discovered-and-replayed call is synthesized into a declarative recipe and promoted to per-origin procedural memory. | Synthesizer -> `validateRecipe` -> replay via `_runDeclarativeTier`/`interpretRecipe`/`executeBoundSpec` -> promote (Pattern 4; the replay path is `capability-router.js:352-404`). |
| LEARN-02 | Learned recipes store request shape only (endpoint, method, header-map, csrf-source, extract-path, origin) — never response bodies or PII. | The schema fields at `capability-recipe-schema.js:79-148` are exactly the shape-only set; capture-time redactor enforces it (Pattern 2). |
| LEARN-03 | Learned recipes feed the capability search index so they are findable on the next visit to the origin. | `addLearnedRecipe` reuses `INDEX_OPTIONS` + `_slugToRecipe` + snapshot persist (`capability-search.js:48-149`). |
| LEARN-04 | A learned recipe for an origin outranks generic recipes during routing. | Catalog Option A: `resolve` checks `_getLearned(slug, origin)` before the REGISTRY (`capability-catalog.js:224-267`); T2 dispatch via `_runDeclarativeTier` (`capability-router.js:498`). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| User triggers a discovery session | Control-panel UI / MCP tool front door | Background SW | D-01: explicit, user-initiated, time-boxed; the trigger is a thin front door onto an SW-side session manager. |
| CDP Network capture + event subscription | Background SW (`chrome.debugger` owner) | — | `chrome.debugger` is an extension-process API; only the SW can attach/sendCommand/`onEvent`. The page is never trusted to report its own traffic. |
| Capture-time redaction | Background SW (inside the `onEvent` handler) | — | D-05: redaction is the FIRST thing that touches a raw event; the raw body/headers never leave the handler frame, so it must run in-process at the event boundary, before any persistence. |
| Recipe synthesis + schema validation | Background SW (pure module) | — | Pure data transform over the already-redacted shape; no browser API, mirrors the interpreter/schema purity charter. |
| Promote-after-replay (the credentialed replay) | Background SW router + page MAIN world | — | The replay itself is the Wall-2 `executeBoundSpec` MAIN-world fetch (first-party cookies attach in-page); the SW router orchestrates and re-pins the origin. The synthesizer never fetches. |
| Learned-recipe persistence | Background SW (`chrome.storage.local`) | — | D-13: a versioned per-origin envelope; SW-owned, survives SW + browser restart (local, not session). |
| Search-index feed + tier resolution | Background SW (pure modules) | — | `capability-search` + `capability-catalog` + `capability-router` are pure SW dispatch/registry modules; the learned wire-ins live here. |

**Why this matters:** Every credential-adjacent capability in this phase lives in the **background SW** (the `chrome.debugger` owner and the consent/redaction chokepoint), with the ONE credentialed network call delegated to the page MAIN world via the existing `executeBoundSpec` primitive. There is no browser-tier or content-script ownership of capture, redaction, or storage — a content script is never trusted to report traffic (a malicious page could forge it), which is the STRIDE-spoofing mitigation baked into the tier choice.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `chrome.debugger` (CDP 1.3) | Chrome built-in (already permissioned, `manifest.json:15`) | `Network.enable`, `Network.requestWillBeSent`, `Network.responseReceived` over the existing attachment | D-02: zero new permission, zero manifest change; the Input domain already proves the attach/detach lifecycle works. |
| `@cfworker/json-schema` | 4.1.1 (vendored at `extension/lib/cfworker-json-schema.min.js`) | Validates the synthesized recipe against `RECIPE_SCHEMA` before promotion | D-12; already the recipe schema validator; reused, not re-added. |
| `minisearch` | 7.2.0 (vendored at `extension/lib/minisearch.min.js`) | The capability search index `addLearnedRecipe` feeds | LEARN-03; the load-bearing `INDEX_OPTIONS` constant is reused verbatim (Pitfall: loadJSON options drift). |
| `globalThis.crypto.subtle` (Ed25519) | Chrome built-in (Web Crypto) | Already the signature verifier; the `'local'` exemption short-circuits BEFORE it | D-09; no new crypto; the exemption is observed by a zero-call assertion. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `redactForLog` | in-repo (`extension/utils/redactForLog.js`) | Shape-only value redaction (url->origin, string->{kind,length}) | Composed by the capture redactor for any free-form value; the auth-carrier denylist + header-names-only logic is the new layer on top. |
| `chrome.storage.local` | Chrome built-in | The new per-origin learned-recipe versioned envelope | D-13; mirrors `consent-policy-store.js` / `audit-log.js` envelope idiom (`{ v, ... }`). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chrome.debugger` Network domain | `chrome.webRequest` listeners | webRequest in MV3 (declarativeNetRequest) cannot read request/response bodies and is being deprecated for blocking; it ALSO would not give the in-page `responseReceived` metadata cleanly and would require a new permission. `chrome.debugger` is already permissioned and gives the exact `type`/status/headers shape. REJECT webRequest. |
| `Network.getResponseBody` for extract-path | Read body to infer `extract` JMESPath | D-08 FORBIDS persisting the body; the extract-path must be inferred from response SHAPE/mimeType only or defaulted to `'@'` (the whole-response identity extract the shipped recipes use). Do NOT call getResponseBody. |
| A new memory layer | Folding into `extension/lib/memory/` (500-cap) | D-13 REJECTS this — learned recipes would compete with semantic/task memories for the cap, and the router needs per-origin fast lookup, not the inverted-index memory query. |
| `csrf.from: 'response'` synthesis | Emit a response-CSRF recipe | The declarative replay path (`capabilityFetchInPage`) does NOT handle `from:'response'` (`capability-fetch.js:163`); such a recipe would fail the replay gate. Default to `same-origin-cookie` + flag (D-11). |

**Installation:** None. Zero new packages (the supply-chain-preferred posture). All dependencies are already vendored or built-in.

## Package Legitimacy Audit

> Phase 31 installs **zero** external packages. The supply-chain-minimal posture (Security Domain) is satisfied by reusing already-vendored libraries (`@cfworker/json-schema@4.1.1`, `minisearch@7.2.0`, `jmespath`) and Chrome built-ins (`chrome.debugger`, `chrome.storage.local`, `crypto.subtle`).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | No new installs |

**Packages removed due to slopcheck [SLOP] verdict:** none (no installs proposed).
**Packages flagged as suspicious [SUS]:** none.

*No package legitimacy gate was required — the phase adds no dependencies. If a future revision proposes one, run the Package Legitimacy Gate before adding it.*

## Architecture Patterns

### System Architecture Diagram

```
  [User] --"discover capabilities on this origin"--> [Control-panel control / MCP tool]
                                                              |
                                                              v
                                              +-------------------------------+
                                              |  network-capture.js (SW)      |
                                              |  startSession(origin, bounds) |
                                              +-------------------------------+
                                                              |
                          (1) CONSENT GATE  ------------------+   getConsentForOrigin(origin).mode != 'off'
                          (DISC-04, D-03)                     |   AND !isDenied(origin)
                                                              |   AND (classify().sensitive -> extra confirm)
                                                  reject -> "off / denied / unconfirmed"
                                                              | allow
                                                              v
                          (2) ATTACH (reuse)   chrome.debugger.attach({tabId},'1.3')  [collision-safe, bg.js:13920]
                                               sendCommand(Network.enable)            [Input domain UNTOUCHED]
                                                              |
                                                              v
                          (3) chrome.debugger.onEvent(source, method, params)
                              method === 'Network.requestWillBeSent'  --> params.request {url,method,headers,type}
                              method === 'Network.responseReceived'   --> params.response {status,headers,mimeType}
                                                              |
                          FILTER (D-04): params.type/resourceType in {XHR, Fetch}     drop Document/Image/Stylesheet/Font/Media
                          FILTER (D-04): new URL(request.url).origin === sessionOrigin drop cross-origin
                                                              |
                                                              v
                          (4) network-capture-redactor.js  -- AT THE HANDLER (D-05)
                              * URL    -> { path-template (no query), origin }        (D-06)
                              * headers-> NAMES ONLY, auth-carriers REMOVED entirely   (D-07)
                              * body   -> DROPPED (never read)                          (D-06)
                              * status/mimeType -> kept (shape only; NO getResponseBody) (D-08)
                                                              |
                                              redacted ObservedCall  (the ONLY artifact that leaves the event)
                                                              v
                          (5) DETACH / release at session end (time bound OR count bound OR user stop OR onDetach)
                                                              |
                                                              v
                          +-------------------------------+
                          |  recipe-synthesizer.js (SW)   |   path-template + authStrategy inference (D-11)
                          |  synthesize(observedCall)     |   -> { recipe(core), descriptor }  (CANDIDATE)
                          +-------------------------------+
                                                              |
                          (6) validateRecipe(recipe)  -- D-12   reject -> discard (never stored)
                                                              | success
                                                              v
                          (7) REPLAY (D-10):  router._runDeclarativeTier-equivalent
                              interpretRecipe(recipe, {}, { trustedProvenance:'local' })  --> spec
                              executeBoundSpec(spec, tabId)  [origin-pin re-asserted in-page]
                                                              |
                                              replay FAIL -> DISCARD candidate (not stored)
                                                              | replay OK
                                                              v
                          +-------------------------------+      +-------------------------------+
                          | learned-recipe-store.js (SW)  |----->| capability-search.js          |
                          | promote(origin, recipe, desc) |      | addLearnedRecipe(recipe, desc)|  (LEARN-03)
                          | versioned envelope; LRU+quar. |      | + snapshot persist (version++)|
                          +-------------------------------+      +-------------------------------+
                                          ^                                       |
                                          | _getLearned(slug, origin)             | findable next visit
                                          |                                       v
                          +-------------------------------+      +-------------------------------+
                          | capability-catalog.js resolve |      | capability-router.js invoke   |
                          | learned FIRST -> {tier:'T2',   |----->| case 'T2': _runDeclarativeTier|  (LEARN-04)
                          |   recipe, descriptor}          |      |   (recipe, trustedProv:'local')|  outranks generic T1b
                          +-------------------------------+      +-------------------------------+
```

The reader can trace the primary use case (a user discovers an API on an authenticated origin -> a learned recipe outranks the generic one on the next visit) by following the arrows 1->7 then the store->search->catalog->router feedback loop.

### Recommended Project Structure
```
extension/utils/
├── network-capture.js              # NEW: SW-side consent-gated capture session over the existing debugger attach
├── network-capture-redactor.js     # NEW: capture-time shape-only redactor (composes redactForLog) -- the security boundary
├── recipe-synthesizer.js           # NEW: redacted ObservedCall -> {recipe core, descriptor}; pure; validate; candidate
├── learned-recipe-store.js         # NEW: per-origin versioned chrome.storage.local store; promote/LRU/quarantine
├── capability-signature.js         # MODIFIED: recognize 'local' alongside 'bundled' in verifyRecipeEnvelope (D-09)
├── capability-interpreter.js       # MODIFIED: exempt short-circuit also fires for trustedProvenance === 'local' (D-09)
├── capability-search.js            # MODIFIED: + addLearnedRecipe(recipe, descriptor) + snapshot re-persist (LEARN-03)
├── capability-catalog.js           # MODIFIED: resolve() checks _getLearned() first (T2 w/ recipe); _getLearned accessor (LEARN-04)
└── capability-router.js            # MODIFIED: case 'T2' dispatches _runDeclarativeTier(..., trustedProvenance:'local') (LEARN-04)
extension/background.js             # MODIFIED: additive importScripts + capture-session entry + the Network onEvent listener
manifest.json                       # UNCHANGED (D-02: 'debugger' already present at :15)
scripts/verify-recipe-path-guard.mjs# MODIFIED: allowlist recipe-synthesizer.js + learned-recipe-store.js (recipe-path-adjacent)
tests/                              # NEW: 8 zero-framework suites (see Validation Architecture)
```

### Pattern 1: Add the Network domain to the existing debugger attachment (DISC-02)
**What:** `Network.enable` and an `onEvent` listener ride on the SAME `chrome.debugger.attach({tabId},'1.3')` the Input domain uses — they do not disrupt each other.
**When to use:** The capture-session start, after the consent gate passes.
**Verification:** `[VERIFIED: chromedevtools.github.io/devtools-protocol/tot/Network]` Multiple CDP domains coexist on one attachment; `requestWillBeSent` carries a `type` field (`ResourceType` enum); `responseReceived` exposes `status`/`statusText`/`headers`/`mimeType` directly. `[VERIFIED: codebase grep]` There is currently NO `chrome.debugger.onEvent` listener anywhere in `extension/` — capture is the first CDP-event consumer, so it adds the global listener cleanly (no existing handler to coexist with at the event layer).
```javascript
// network-capture.js (SW) -- conceptual; reuses the bg.js:13920-14002 collision-safe attach.
// The listener is method-dispatched so Input traffic (sendCommand responses) is unaffected;
// onEvent only fires for instrumentation events, and we filter to the two Network methods.
const session = { tabId, origin, deadline: Date.now() + maxMs, remaining: maxCount, calls: new Map() };

function onCdpEvent(source, method, params) {
  if (!session || source.tabId !== session.tabId) return;            // not our session
  if (method === 'Network.requestWillBeSent') {
    const t = params.type;                                            // ResourceType enum (D-04)
    if (t !== 'XHR' && t !== 'Fetch') return;                        // drop Document/Image/Stylesheet/Font/Media
    let reqOrigin = null; try { reqOrigin = new URL(params.request.url).origin; } catch (_e) { return; }
    if (reqOrigin !== session.origin) return;                         // same-origin only (origin-pin precondition)
    session.calls.set(params.requestId, redactRequest(params.request)); // REDACT AT CAPTURE (D-05) -- see Pattern 2
    if (--session.remaining <= 0) endSession('count-bound');
  } else if (method === 'Network.responseReceived') {
    const c = session.calls.get(params.requestId);
    if (c) c.responseShape = redactResponse(params.response);        // status/mimeType ONLY -- NEVER getResponseBody (D-08)
  }
}
// attach (collision-safe, mirroring bg.js:13921-13935) -> sendCommand(Network.enable) -> add onEvent listener.
// Bounds: a setTimeout(maxMs) -> endSession('time-bound'); endSession removes the listener and
// sendCommand(Network.disable) (release the domain) and detaches ONLY if WE attached (do not detach
// out from under a concurrent KeyboardEmulator Input op -- see Pitfall 1).
```
**Anti-pattern guarded:** do NOT detach the debugger unconditionally at session end — if the KeyboardEmulator (Input) is mid-operation on the same tab, detaching breaks its emulation (DISC-02). Track who attached; release only the Network domain (`Network.disable`) and remove the listener; detach the tab only if the capture session was the attaching owner and no Input op holds it.

### Pattern 2: Capture-time shape-only redaction (DISC-03, D-05..D-08)
**What:** Inside the `onEvent` handler, reduce a raw request/response to a shape with NO values: path-template (no query), header NAMES only with auth-carriers removed, no body, status/mimeType only.
**When to use:** The FIRST thing that touches `params.request` / `params.response`. The raw objects never leave the handler frame.
```javascript
// network-capture-redactor.js -- composes redactForLog for free-form values; this is the security boundary.
const AUTH_CARRIER_DENYLIST = /^(authorization|cookie|set-cookie|x-csrf-.*|x-xsrf-.*|x-api-key|.*bearer.*)$/i; // D-07

function redactRequest(request) {
  let path = '/', origin = null;
  try { const u = new URL(request.url); path = u.pathname; origin = u.origin; } catch (_e) {}  // DROP query/fragment (D-06)
  const headerNames = [];
  for (const name in (request.headers || {})) {                       // NAMES ONLY -- values never read (D-07)
    const lower = String(name).toLowerCase();
    if (AUTH_CARRIER_DENYLIST.test(lower)) continue;                  // auth carriers removed entirely (D-07)
    headerNames.push(lower);
  }
  return { method: request.method, path, origin, headerNames /* , body intentionally absent (D-06) */ };
}
function redactResponse(response) {
  // status + mimeType are SHAPE (D-08). headers are dropped to names-only or omitted; NEVER getResponseBody.
  return { status: response.status, mimeType: response.mimeType };    // no header values, no body
}
```
**Key:** every value that could carry PII/credentials (header values, body, query params, cookies) is structurally excluded — the redactor cannot leak because it never reads them. This is the SAME discipline as `audit-log.js` (strict field whitelist + `redactForLog`) which is the proven no-secrets precedent.

### Pattern 3: Reuse the Phase-30 consent gate verbatim (DISC-04, D-03)
**What:** The capture-start runs the identical gate the invoke chokepoint uses.
```javascript
// At startSession, BEFORE attach:
const denied = FsbServiceDenylist.isDenied(origin);                   // service-denylist.js:121
if (denied && denied.denied) return reject('RECIPE_CONSENT_DENIED');
const envelope = await FsbConsentPolicyStore.readPolicies();          // consent-policy-store.js:111
const consent = FsbConsentPolicyStore.getConsentForOrigin(envelope, origin); // :170
if (consent.mode === 'off') return reject('RECIPE_CONSENT_REQUIRED'); // default-OFF (DISC-04)
const klass = FsbServiceDenylist.classify(origin);                    // service-denylist.js:133
if (klass.sensitive) { /* require the extra-confirmation flag from the trigger (D-03) */ }
```
**Note:** `getConsentForOrigin(envelope, origin)` takes the envelope as the FIRST arg (it is PURE) — read `readPolicies()` first. This matches the gate's usage exactly.

### Pattern 4: Promote-after-replay through the REAL interpret/execute path (LEARN-01, D-10)
**What:** A candidate replays through the actual `interpretRecipe -> executeBoundSpec` chain (the same one `_runDeclarativeTier` uses, `capability-router.js:352-404`); only a clean replay promotes.
```javascript
// The replay MUST pass trustedProvenance:'local' so the loader vouches it (HI-01) -- the recipe never self-declares.
const interpreted = await FsbCapabilityInterpreter.interpretRecipe(recipe, {}, { trustedProvenance: 'local' });
if (!interpreted || interpreted.success !== true) return DISCARD;     // failed bind/verify -> not stored
const out = await primitive.executeBoundSpec(interpreted.spec, tabId);// MAIN-world; re-pins the origin
if (!out || out.success !== true) return DISCARD;                     // failed replay -> not stored (D-10)
await FsbLearnedRecipeStore.promote(origin, recipe, descriptor);      // store + addLearnedRecipe (search)
```
**Critical:** `interpretRecipe` is async on the non-bundled/non-local path... but for `trustedProvenance === 'local'` it short-circuits to the synchronous bind (no verify), parallel to `'bundled'`. Awaiting it is always safe (await on a plain object is a no-op).

### Pattern 5: The 'local' provenance exemption (D-09, HI-01)
**What:** Add `'local'` as a third trusted-exempt provenance alongside `'bundled'`, in BOTH the signature module and the interpreter's exempt short-circuit — but ONLY honored when supplied via the trusted `trustedProvenance` argument, never read from the payload.
```javascript
// capability-signature.js verifyRecipeEnvelope (currently :251):
//   if (resolvedProvenance === 'bundled') { return { ok: true }; }
// becomes:
if (resolvedProvenance === 'bundled' || resolvedProvenance === 'local') { return { ok: true }; }

// capability-interpreter.js interpretRecipe (currently :361):
//   if (!envelope || trustedProvenance === 'bundled') { return bindRecipeCore(...); }
// becomes:
if (!envelope || trustedProvenance === 'bundled' || trustedProvenance === 'local') {
  return bindRecipeCore(recipe, args, authMod);
}
```
**HI-01 invariant preserved:** the exemption is decided ONLY from `opts.trustedProvenance` (the loader's vouch). A recipe payload self-asserting `provenance:'local'` in its data is IGNORED (the interpreter never reads the payload provenance; `detectRecipeEnvelope` deliberately does not consult it for trust). The existing test (e2) that proves a payload-asserted `'bundled'` cannot dodge verify is the template for the parallel `'local'` test.

### Pattern 6: Catalog Option A — learned outranks generic by resolve order (LEARN-04, D-15)
**What:** `resolve(slug, origin)` checks the learned store FIRST; a learned recipe for the active origin returns `{tier:'T2', recipe, descriptor}` BEFORE the REGISTRY lookup, so it wins by dispatch order with no router tie-break.
```javascript
// capability-catalog.js resolve() -- prepend BEFORE the REGISTRY lookup (currently :225):
function resolve(slug, origin) {
  var learned = _getLearned(slug, origin);            // NEW: per-origin learned store accessor (parallel to _search())
  if (learned && learned.recipe) {
    return { tier: 'T2', recipe: learned.recipe, descriptor: learned.descriptor || null };
  }
  var entry = Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : null;
  // ... existing T1a/T1b/T0 logic unchanged ...
}
```
```javascript
// capability-router.js invoke() -- case 'T2' (currently the stub at :498-501):
case 'T2':
  // A REAL learned recipe is attached (entry.recipe). Dispatch through the declarative
  // tier with the 'local' provenance vouch. Falls through to RECIPE_LEARN_PENDING ONLY
  // when no learned recipe is attached (the catalog returns no recipe).
  out = entry.recipe
    ? await _runDeclarativeTier(slug, args, c, 'T2', entry.recipe, { trustedProvenance: 'local' })
    : _err('RECIPE_LEARN_PENDING', { slug: slug });
  break;
```
**Note:** `_runDeclarativeTier` needs a small additive parameter to thread `trustedProvenance` into its `interpretRecipe` call (currently `:385` calls `interpretRecipe(recipe, args||{})` with no opts). For T0/T1b callers the opts arg is omitted (undefined -> exempt-by-source bare core, unchanged). For T2 it passes `{trustedProvenance:'local'}`. This keeps the bare-core exempt path byte-identical for the Phase-29 head.

### Anti-Patterns to Avoid
- **Calling `Network.getResponseBody`:** D-08 forbids persisting the body; status/headers/mimeType come off `responseReceived` directly. Never call it.
- **Detaching the debugger unconditionally at session end:** breaks a concurrent KeyboardEmulator Input op. Release only the Network domain + listener; detach only if capture was the attaching owner (Pitfall 1).
- **Reading any header VALUE or request/response body in the redactor:** structurally exclude them — the redactor must be unable to leak (D-07).
- **Letting the synthesizer emit `csrf.from:'response'`:** the declarative replay path drops it -> the candidate fails replay. Default to `same-origin-cookie` + flag (D-11; the gating finding).
- **Naming a new module `capability-*.js` without allowlisting it:** Check 4 globs `extension/utils/capability-*.js` and FAILS CI closed. Use the CONTEXT's non-`capability-*` names OR add to `RECIPE_PATH_ALLOWLIST` in the SAME plan.
- **Trusting a `provenance` field inside the recipe payload:** HI-01 — provenance is the loader's vouch only.
- **Folding learned recipes into `extension/lib/memory/`:** D-13 — a separate per-origin store.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Capturing network traffic | A content-script `fetch`/`XHR` monkey-patch | `chrome.debugger` Network domain | A page-side patch is spoofable by the page (STRIDE), misses non-instrumented requests, and a malicious page could forge calls to synthesize a hostile recipe. The SW-owned CDP capture cannot be forged by the page. |
| URL/value redaction | A bespoke regex over the whole request | `redactForLog` (shape-only) + the D-07 auth-carrier denylist | `redactForLog` is the proven, tested shape-only reducer (`audit-log.js` uses it for the no-secrets log); reuse keeps one redaction discipline. |
| Recipe validation | An ad-hoc field check in the synthesizer | `FsbCapabilityRecipeSchema.validateRecipe` | The closed-vocab schema + forbidden-name pre-scan is the Wall-1 contract; the synthesizer's output is just another untrusted recipe that must pass the same gate (D-12). |
| Signature exemption | A new exemption code path for learned recipes | The existing `verifyRecipeEnvelope(envelope, trustedProvenance)` second-arg + the interpreter's exempt short-circuit | The HI-01 trust boundary is already built; add `'local'` to the existing two-line check, do not invent a parallel mechanism (which could re-introduce the payload-self-declare hole). |
| The search index | A new index for learned recipes | `addLearnedRecipe` feeding the ONE MiniSearch instance (`INDEX_OPTIONS`) | A second index would drift options and break `loadJSON` (Pitfall 3 in `capability-search.js`); one index, one options constant. |
| Per-origin storage | A new storage abstraction | The versioned-envelope idiom from `consent-policy-store.js` / `audit-log.js` (lazy chrome accessor, `{v,...}`, promise-chain mutex, null-proto map) | The idiom already solves the SW-restart survival, the `__proto__`-key round-trip drop, and concurrent-setter serialization (ME-03 / Pitfall 7). |
| Origin-pin on replay | A pin check in the synthesizer | `executeBoundSpec` (re-asserts the active-tab origin-pin in-page) | The pin is a two-point invariant in the existing primitive; the synthesizer replays through it, never around it. |

**Key insight:** Phase 31 is overwhelmingly a WIRING phase — almost every "hard" sub-problem (validation, signature exemption, index, storage envelope, origin-pin, consent gate, redaction) already has a proven, tested in-repo solution from Phases 26-30. The genuinely NEW logic is narrow: the CDP capture session lifecycle, the capture-time redactor's auth-carrier handling, and the two synthesis heuristics (path-template + conservative authStrategy). Keep the surface small and lean on the existing seams.

## Runtime State Inventory

> This is a greenfield additive phase (new SW modules + new `chrome.storage.local` key + additive edits). It introduces NO rename/refactor of existing stored state. The one new persisted artifact is the learned-recipe store; documented here for completeness because it interacts with the existing search-index snapshot.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NEW key only: the per-origin learned-recipe envelope (a new `chrome.storage.local` key, e.g. `fsbLearnedRecipes`, distinct from `fsbCapabilityIndex` / `fsbConsentPolicies` / the memory keys). No existing key is renamed or migrated. | Define the new key + version; no migration of existing data. |
| Live service config | None — no external service config embeds any string this phase changes. | None. |
| OS-registered state | None — the `chrome.debugger` attach is transient (per-session); nothing is OS-registered. | None. The capture session must cleanly detach/release (Pitfall 1) so no debugger attachment leaks across SW eviction. |
| Secrets/env vars | None — the phase explicitly persists NO secrets (the entire point of capture-time redaction). The Ed25519 trusted-key set is unchanged (the `'local'` exemption needs no key). | None. |
| Build artifacts | The search-index snapshot (`fsbCapabilityIndex`) becomes STALE when `addLearnedRecipe` adds an entry — D-14 requires bumping the `catalogVersion`/content-hash so an SW restart rebuilds WITH the learned entries. This is the one "stale artifact" interaction. | `addLearnedRecipe` re-persists the snapshot with a bumped version (Claude's discretion: content-hash vs version bump). |

**Verified by:** codebase grep — the only existing `chrome.storage.local` keys in the capability layer are `fsbCapabilityIndex` (search), `fsbConsentPolicies` (consent), the audit ring, and the `extension/lib/memory/` keys; the learned store adds a NEW key and touches none of them except the index snapshot it intentionally invalidates (D-14).

## Common Pitfalls

### Pitfall 1: Detaching the debugger out from under a concurrent Input op (DISC-02)
**What goes wrong:** The capture session ends (time/count bound) and calls `chrome.debugger.detach({tabId})`, but the KeyboardEmulator is mid-`Input.insertText` / `Input.dispatchKeyEvent` on the same tab — the emulation throws / silently corrupts.
**Why it happens:** Both the Input flow and the capture flow share ONE attachment (D-02); whoever detaches last wins, and an unconditional detach assumes sole ownership.
**How to avoid:** (1) On session end, FIRST `sendCommand(Network.disable)` + remove the `onEvent` listener (release the domain, keep the attachment). (2) Detach the tab ONLY if the capture session was the attaching owner AND `keyboardEmulator.isAttachedTo(tabId)` is false. The existing code already checks `keyboardEmulator.isAttachedTo(tabId)` before its own attach (`bg.js:13915`) — mirror that coordination on the release side. (3) Handle `chrome.debugger.onDetach` (reason `canceled_by_user` when the user dismisses the banner, `target_closed` on tab close) to tear the session down cleanly if Chrome detaches first.
**Warning signs:** Input emulation failures that correlate with a capture session ending; a `chrome.debugger` "not attached" error on a subsequent Input op.

### Pitfall 2: The "started debugging this browser" banner on capture start
**What goes wrong:** Starting a capture attaches `chrome.debugger`, which makes Chrome show the unavoidable "FSB started debugging this browser" infobar — surprising on a "silent" capture.
**Why it happens:** `[VERIFIED: developer.chrome.com/docs/extensions/reference/api/debugger + multiple secondary sources]` Chrome shows this banner on ANY `chrome.debugger.attach`; it cannot be suppressed without the `--silent-debugger-extension-api` launch flag or an enterprise group-policy install. It reappears each time the API is triggered.
**How to avoid:** This is EXACTLY why D-01 mandates a user-INITIATED, time-boxed session (not silent auto-capture). The banner is acceptable (even expected) for an explicit "discover capabilities" action the user just clicked; it would be invasive for background capture. Make the session SHORT (time bound) and end it promptly so the banner does not linger. Do not try to hide it.
**Warning signs:** User confusion reports about the banner — mitigate via the trigger UX copy ("FSB will briefly observe this site's API calls"), not by changing the attach.

### Pitfall 3: Calling `Network.getResponseBody` (D-08 violation)
**What goes wrong:** Inferring the `extract` path by reading the response body persists body content — a direct LEARN-02 / GOV-06 breach (PII/credentials in storage).
**Why it happens:** DISC-01's requirement text NAMES `getResponseBody`, tempting an implementer to call it; and inferring a JMESPath extract "needs" the body shape.
**How to avoid:** NEVER call `getResponseBody`. `[VERIFIED: chromedevtools.github.io/devtools-protocol/tot/Network]` `responseReceived` already gives `status`/`statusText`/`headers`/`mimeType` — enough for shape. For `extract`, default to `'@'` (the whole-response identity extract that the shipped `github-notifications.json`/`reddit-inbox.json` recipes use) — do not infer a deep path from a body you must not read. If a deeper extract is ever needed, that is a Phase-32 refinement against observed shapes, not a Phase-31 body read.
**Warning signs:** Any `sendCommand(..., 'Network.getResponseBody', ...)` in the diff; any response-body string in a stored artifact (the no-secret test must catch this).

### Pitfall 4: Synthesizing a recipe the declarative replay path cannot execute (the GATING pitfall, D-11)
**What goes wrong:** The synthesizer sees a CSRF-style request whose token came from a prior GET and emits `authStrategy:'csrf-header-scrape'` + `csrf:{from:'response',...}`. `validateRecipe` PASSES. But the declarative replay (`capabilityFetchInPage`, the T2/T1b path) does NOT handle `from:'response'` (`capability-fetch.js:163` "deferred to Phase 29"; the response-CSRF flow lives ONLY in the T1a imperative handlers). The candidate FAILS the promote-after-replay gate every time — or worse, a future change makes it bind but mis-execute.
**Why it happens:** The recipe schema's `csrf.from` enum includes `'response'` (`capability-recipe-schema.js:136`), so it is schema-valid, but the *executor* coverage is narrower than the *schema* coverage.
**How to avoid:** The synthesizer's authStrategy inference MUST cap at what the DECLARATIVE path executes: `same-origin-cookie` (default), or `csrf-header-scrape` with `csrf.from` restricted to `'meta'` or `'cookie'` (the two the in-page scraper handles, `capability-fetch.js:141-162`). A token-minted-by-prior-GET pattern -> default to `same-origin-cookie` and set a `flaggedForPhase32` marker (D-11's "ambiguous defaults to same-origin-cookie and is flagged"). This is correctly conservative: an over-eager response-CSRF guess would just be discarded at replay anyway, so defaulting wastes no information.
**Warning signs:** Candidates that consistently fail replay with a CSRF/auth error; any synthesized recipe with `csrf.from === 'response'`.

### Pitfall 5: MiniSearch `loadJSON` options drift after `addLearnedRecipe` (LEARN-03)
**What goes wrong:** `addLearnedRecipe` constructs or restores the index with options that differ from the module-level `INDEX_OPTIONS`, and a later `MiniSearch.loadJSON(snapshot, INDEX_OPTIONS)` throws "loadJSON should be given the same options used when serializing the index" on the next SW wake.
**Why it happens:** `[VERIFIED: codebase capability-search.js:36-43]` MiniSearch requires the EXACT same options object at construct and at `loadJSON`; the module deliberately uses ONE `INDEX_OPTIONS` constant for both.
**How to avoid:** `addLearnedRecipe` must `_ms.add(descriptor)` onto the EXISTING instance (which was built with `INDEX_OPTIONS`) and update `_slugToRecipe[recipe.id] = recipe`, then re-snapshot via `_ms.toJSON()` with the SAME `catalogVersion` bump path `buildOrRestore` uses. Do NOT build a fresh MiniSearch with different options. Reuse, do not reconstruct.
**Warning signs:** A `loadJSON should be given the same options` throw on SW wake after a learned recipe was added; learned recipes missing from search after a restart (snapshot version not bumped, so the stale snapshot without the learned entry is restored).

### Pitfall 6: A learned recipe's origin diverging from the active-tab origin (origin-pin, D-15)
**What goes wrong:** A learned recipe stored for origin A is resolved and replayed while the active tab is origin B; `executeBoundSpec` correctly returns `RECIPE_ORIGIN_MISMATCH`, but the catalog returned it as a T2 hit, surprising the caller.
**Why it happens:** `resolve(slug, origin)` must scope the learned lookup to the SAME origin the router passes; a per-slug-only lookup (ignoring origin) would surface a foreign-origin recipe.
**How to avoid:** `_getLearned(slug, origin)` keys on BOTH slug AND origin (D-13 "keyed by origin + slug"); it returns a learned recipe ONLY when `recipe.origin === origin`. The origin-pin in `executeBoundSpec` is the backstop, but the catalog should not surface a cross-origin learned recipe in the first place. (This is the same discipline as the catalog's existing origin bias, but as a HARD scope, not a soft rank.)
**Warning signs:** `RECIPE_ORIGIN_MISMATCH` from a T2 dispatch; a learned recipe for one site appearing on another.

## Code Examples

### Reuse the collision-safe attach (mirror the Input lifecycle)
```javascript
// Source: extension/background.js:13920-13936 (the proven attach+collision pattern)
try {
  await chrome.debugger.attach({ tabId }, '1.3');
} catch (attachErr) {
  if (attachErr.message && attachErr.message.includes('Another debugger is already attached')) {
    try { await chrome.debugger.detach({ tabId }); } catch (_e) {}
    await chrome.debugger.attach({ tabId }, '1.3');
  } else { throw attachErr; }
}
// then: await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
//       chrome.debugger.onEvent.addListener(onCdpEvent);
```

### The versioned per-origin store envelope (mirror consent-policy-store)
```javascript
// Source: extension/utils/consent-policy-store.js:103-138, 140-164 (the {v,...} envelope idiom)
// learned-recipe-store.js -- conceptual shape:
//   { v: 1, recipes: { [origin]: { [slug]: { recipe, descriptor, capturedAt,
//                                            lastSuccessAt, successCount, quarantined } } } }
// Read: null-safe degrade to a fresh envelope on absent/malformed/version-mismatch.
// Write: a promise-chain mutex (_withLock) serializes setters (single-threaded SW).
// LRU (D-16): on promote, if a per-origin slug count exceeds the cap, evict the entry
//   with the oldest lastSuccessAt. Quarantine (D-16): set quarantined:true (do NOT delete);
//   _getLearned returns null for a quarantined entry so it is demoted from routing.
```

### The 'local' exemption test (mirror the existing bundled-exemption test)
```javascript
// Source: tests/recipe-signature-interpreter-hook.test.js:97-127 (the spy + zero-call pattern)
// (1) a 'local'-vouched recipe binds WITHOUT a verifyEd25519 call:
let verifyCalls = 0;
const realVerify = Sig.verifyEd25519;
Sig.verifyEd25519 = async function () { verifyCalls += 1; return realVerify.apply(this, arguments); };
const res = await I.interpretRecipe(localEnvelope, {}, { trustedProvenance: 'local' });
check(res && res.success === true, "a 'local'-vouched recipe binds (exempt)");
check(verifyCalls === 0, "'local' provenance did NOT call verifyEd25519 (exemption short-circuits)");
// (2) HI-01: a payload self-asserting provenance:'local' with NO trusted vouch is NOT exempted
//     (the envelope is verified; a tampered core is rejected) -- parallel to the (e) bundled test.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome.webRequest` blocking + body access | `chrome.debugger` CDP Network domain for body/metadata; `declarativeNetRequest` for blocking | MV3 (ongoing) | webRequest cannot read bodies in MV3; CDP is the supported path for the request/response shape FSB needs. Reinforces D-02's `chrome.debugger` choice. |
| `Network.postData` on `requestWillBeSent` | `postDataEntries` (postData deprecated) | CDP tot | Irrelevant to FSB — D-06 drops the body entirely; noted only so no one reaches for `postData`. |
| Trusting an embedded `provenance` field | Loader-vouched `trustedProvenance` argument (HI-01) | Phase 30 | The `'local'` exemption MUST follow this — payload provenance is never trusted. |

**Deprecated/outdated:**
- `Network.getResponseBody` for FSB's purpose: not deprecated by Chrome, but FORBIDDEN by D-08 (never persist the body). Treat as off-limits.
- Building a second search index for learned recipes: rejected by the `INDEX_OPTIONS` single-source constraint (Pitfall 5).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The capture trigger surface (control-panel control vs MCP tool vs both) and the exact time/count session bounds are Claude's discretion; a short time bound (e.g. tens of seconds) + a small request-count cap is a reasonable default. | Pattern 1 / D-01 | LOW — explicitly Claude's discretion in CONTEXT; bounds are tunable. Wrong bounds only affect UX, not safety (the gate + redaction hold regardless). |
| A2 | The path-template heuristic (concrete path -> parameterized endpoint) should be CONSERVATIVE: replace path segments that look like volatile IDs (numeric, UUID, long hex/base62) with `{param}` placeholders and leave stable segments literal; default to the literal path when ambiguous. | Synthesis (Claude's Discretion) | MEDIUM — an over-eager template could parameterize a stable segment (a recipe that 404s) or under-parameterize (a recipe that only works for the captured ID). Mitigated by promote-after-replay: a bad template fails replay and is discarded. The default-to-literal-on-ambiguity keeps it safe. |
| A3 | `extract` defaults to `'@'` (whole-response identity) for synthesized recipes, since D-08 forbids reading the body to infer a deeper path. | Pitfall 3 | LOW — matches the shipped recipes' extract values; a deeper extract is a Phase-32 refinement. |
| A4 | The new learned-store `chrome.storage.local` key name (e.g. `fsbLearnedRecipes`) and the store/`addLearnedRecipe` API names are Claude's discretion. | D-13 / D-14 | LOW — explicitly discretion; only constraint is it must NOT collide with the existing keys (verified distinct). |
| A5 | The capture-session redactor is implemented as a new `network-capture-redactor.js` composing `redactForLog` (vs editing `redactForLog.js`). Either is sanctioned by CONTEXT; a separate module keeps the diagnostic-log redactor's contract untouched and is the lower-risk choice. | Pattern 2 / D-05 | LOW — explicitly discretion; a separate module avoids regressing the 200-series diagnostic-log redaction tests. |
| A6 | `chrome.debugger.onEvent` `source.tabId` reliably identifies the session's tab for filtering, and `onDetach` fires with `canceled_by_user`/`target_closed`. | Pattern 1 / Pitfall 1 | LOW — VERIFIED against the official debugger docs for `onDetach` reasons; `source` carrying the debuggee is the documented event signature. |

## Open Questions

1. **Whether to surface a synthesized candidate to the user before promotion, or auto-promote on a clean replay.**
   - What we know: D-10 mandates promote-ONLY-after-replay; D-01 mandates user-initiated capture. The user already consented to the session.
   - What's unclear: whether a per-recipe confirmation (beyond the session-start consent) is wanted.
   - Recommendation: auto-promote on a clean replay within the consented session (the session start IS the consent); a per-recipe confirmation is a UX refinement that can be added without changing the engine. Flag for discuss-phase if the team wants the extra friction.

2. **The exact LRU cap per origin (D-16).**
   - What we know: D-16 mandates a per-origin cap + LRU by `lastSuccessAt`; the memory layer uses a 500 GLOBAL cap (rejected here, D-13).
   - What's unclear: the numeric per-origin cap.
   - Recommendation: a small per-origin cap (e.g. 16-32 learned recipes/origin) — Claude's discretion; generous enough for a site's API surface, bounded enough to keep `chrome.storage.local` small. Tune later.

3. **Whether `responseReceived` headers should be kept as names-only or dropped entirely.**
   - What we know: D-07 keeps REQUEST header names (drops values + auth carriers); D-08 keeps response status/mimeType.
   - What's unclear: D-06/D-07 are written for the REQUEST shape; the response header treatment is less explicit.
   - Recommendation: drop response headers entirely (keep only status + mimeType) — they are not part of the LEARN-02 stored shape (method, path-template, header-NAMES [request], csrf-source, extract-path, origin) and dropping them is strictly safer. If a response header name is ever needed for synthesis, apply the same names-only + auth-carrier-denylist discipline as the request.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `chrome.debugger` permission | DISC-01/02 capture | YES | n/a (manifest `:15`) | none needed — already granted |
| `@cfworker/json-schema` (vendored) | D-12 validateRecipe | YES | 4.1.1 | none needed |
| `minisearch` (vendored) | LEARN-03 index | YES | 7.2.0 | none needed |
| `crypto.subtle` Ed25519 | D-09 (exemption short-circuits before it) | YES (SW + Node global) | Chrome built-in | the `'local'` exemption needs NO verify, so absence is irrelevant on this path |
| `chrome.storage.local` | D-13 learned store + D-14 snapshot | YES | Chrome built-in | none needed |
| Node (zero-framework test harness) | the 8 CI suites | YES | repo `npm test` convention | none needed |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — every dependency is already vendored or a Chrome/Node built-in. This is the zero-new-packages posture (Security Domain supply-chain control).

**Note:** The genuinely LIVE-only property — an actual `chrome.debugger` Network capture on a real authenticated site, the banner appearing, and a real first-party API call being observed/synthesized/replayed — has NO automated harness (the `chrome.debugger` + MAIN-world credentialed fetch cannot be driven in Node). It is human-gated UAT, matching the Phase 27/28/29/30 posture (see Validation Architecture, human-gated row).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Zero-framework FSB convention: `passed`/`failed` counters + synchronous `check(cond, msg)` + `process.exit(failed>0?1:0)` (the `tests/capability-interpreter.test.js` / `tests/consent-policy-store.test.js` idiom). NO Jest/Mocha. |
| Config file | none — each test is a standalone `node tests/<name>.test.js`; wired into the `npm test` chain. |
| Quick run command | `node tests/<single-suite>.test.js` |
| Full suite command | `npm test` (runs the whole `scripts.test` chain, which the new suites join) |

**Stubs (the proven idioms to reuse):**
- **`chrome.debugger` stub** feeding canned `onEvent(source, method, params)` calls (a recorder/driver — NEW for this phase; mirrors the `chrome.scripting.executeScript` recorder in `tests/capability-fetch.test.js` and the in-memory stub style of `tests/consent-policy-store.test.js`).
- **`chrome.storage.local` stub** — the in-memory `Map`-backed stub (`installChromeStorageStub`, `tests/consent-policy-store.test.js:43-72`) for the learned store + snapshot round-trip.
- **Vendored-global loader** — `vm.runInThisContext` for the cfworker IIFE + `require` for the modules (the `tests/capability-fetch.test.js:85-90` loader) so `validateRecipe` and the interpreter run under Node.
- **`verifyEd25519` spy** — the zero-call assertion pattern (`tests/recipe-signature-interpreter-hook.test.js:99-106`) for the `'local'` exemption.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-02 | Network events on the existing attach are method-dispatched; canned `requestWillBeSent`/`responseReceived` produce ObservedCalls; Input `sendCommand` is unaffected (no Input op disrupted) | unit | `node tests/network-capture.test.js` | ❌ Wave 0 |
| DISC-04 | capture-start is REJECTED on an Off origin and a denied origin; ALLOWED on Ask/Auto; a sensitive origin requires the extra-confirm flag | unit | `node tests/network-capture-consent.test.js` | ❌ Wave 0 |
| DISC-04 | (filter) only `type` XHR/Fetch + same-origin requests become ObservedCalls; Document/Image/Stylesheet/Font/Media and cross-origin are dropped | unit | `node tests/network-capture.test.js` | ❌ Wave 0 |
| DISC-03 / LEARN-02 | **(THE security assertion)** the redacted ObservedCall + synthesized recipe contain NO auth substring (`authorization`/`cookie`/`bearer`/`x-csrf`/`x-api-key`), NO body, NO query string, NO PII — only shape survives | unit | `node tests/network-capture-redaction.test.js` | ❌ Wave 0 |
| LEARN-01 | synthesis emits a recipe that passes `validateRecipe` (green) + a paired descriptor; an unsynthesizable capture yields no recipe | unit | `node tests/recipe-synthesizer.test.js` | ❌ Wave 0 |
| LEARN-01 / D-10 | promote-only-after-replay: a candidate whose replay (`interpretRecipe -> executeBoundSpec`, stubbed) SUCCEEDS is stored; one whose replay FAILS is NOT stored | unit | `node tests/learned-promote-after-replay.test.js` | ❌ Wave 0 |
| LEARN-02 / D-13 / D-16 | learned-store per-origin round-trip (write -> read same origin+slug); LRU evicts oldest `lastSuccessAt` past the cap; quarantine flags (not deletes) and `_getLearned` returns null for a quarantined entry | unit | `node tests/learned-recipe-store.test.js` | ❌ Wave 0 |
| LEARN-03 | `addLearnedRecipe(recipe, descriptor)` makes the slug findable via `search()` AND `getRecipeBySlug`; the snapshot is re-persisted with a bumped version (survives a simulated SW restart / `loadJSON`) | unit | `node tests/learned-search-add.test.js` | ❌ Wave 0 |
| LEARN-04 / D-15 | `catalog.resolve(slug, origin)` returns the learned `{tier:'T2', recipe}` and it OUTRANKS a generic T1b for the same slug+origin; router `case 'T2'` dispatches via `_runDeclarativeTier` (not the `RECIPE_LEARN_PENDING` stub) when a learned recipe exists; the stub still fires when none does | unit | `node tests/learned-t2-outranking.test.js` | ❌ Wave 0 |
| D-09 (HI-01) | a `'local'`-vouched recipe binds WITHOUT a `verifyEd25519` call (zero-call spy); a payload self-asserting `provenance:'local'` with NO trusted vouch is STILL verified (tampered core rejected) | unit | `node tests/learned-local-provenance-exempt.test.js` | ❌ Wave 0 |
| INV / guard | `recipe-synthesizer.js` + `learned-recipe-store.js` are on `RECIPE_PATH_ALLOWLIST` and are dynamic-code-free (the existing `tests/recipe-path-guard.test.js` + `verify-recipe-path-guard.mjs` cover this once allowlisted) | guard | `node scripts/verify-recipe-path-guard.mjs` | ✅ (extend allowlist) |

### Sampling Rate
- **Per task commit:** the single new suite for the task under change (e.g. `node tests/network-capture-redaction.test.js`).
- **Per wave merge:** `npm test` (the full chain incl. `verify-recipe-path-guard.mjs`).
- **Phase gate:** full suite green + `verify-recipe-path-guard: PASS` before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/network-capture.test.js` — DISC-02 dispatch + DISC-04 XHR/Fetch+same-origin filter (NEW `chrome.debugger` event-driver stub)
- [ ] `tests/network-capture-consent.test.js` — DISC-04 off/denied/sensitive gate
- [ ] `tests/network-capture-redaction.test.js` — DISC-03/LEARN-02 no-secret/no-body/no-query assertion (THE security test)
- [ ] `tests/recipe-synthesizer.test.js` — LEARN-01 schema-valid recipe+descriptor + path-template + conservative authStrategy
- [ ] `tests/learned-promote-after-replay.test.js` — D-10 store-only-on-clean-replay (stub interpret/execute)
- [ ] `tests/learned-recipe-store.test.js` — D-13/D-16 round-trip + LRU + quarantine
- [ ] `tests/learned-search-add.test.js` — LEARN-03 findable + snapshot version bump survives loadJSON
- [ ] `tests/learned-t2-outranking.test.js` — LEARN-04/D-15 resolve learned-first + router T2 dispatch
- [ ] `tests/learned-local-provenance-exempt.test.js` — D-09 zero-call exempt + HI-01 payload-cannot-self-declare
- [ ] Allowlist extension in `scripts/verify-recipe-path-guard.mjs` for the two recipe-path-adjacent modules
- [ ] NEW `chrome.debugger` event-driver stub helper (canned `onEvent` feeder) — a small shared test fixture
- [ ] Framework install: none — zero-framework convention already in place

**Human-gated (live-only, NOT automated — matches Phase 27/28/29/30):** an ACTUAL `chrome.debugger` Network capture on a real authenticated site (the banner appears, a real first-party XHR/Fetch is observed, redacted, synthesized, replayed through the live MAIN-world credentialed fetch, promoted, and outranks the generic recipe on the next visit). This is `human_needed` UAT.

## Security Domain

CDP capture of authenticated first-party traffic is the **PII / credential-replay risk class** — the most sensitive new surface in the milestone after the Phase-27 credentialed fetch. The entire design is structured so that NO credential or PII can reach storage: redaction happens AT the event handler, the response body is NEVER read, and header values are structurally excluded.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | The captured shape carries NO auth material (D-07 auth-carrier denylist + header-names-only); replay uses the user's EXISTING first-party session via `credentials:'include'` in-page (Wall 2) — no token is captured, stored, or replayed by FSB. |
| V3 Session Management | yes | FSB never persists a session/cookie/token; the session lives in the browser. Replay is origin-pinned (`executeBoundSpec` re-asserts the active-tab origin) so a learned recipe cannot drive a cross-origin session. |
| V4 Access Control | yes | The consent gate (`getConsentForOrigin != 'off'` + `!isDenied` + sensitive-extra-confirm) is the per-origin authorization for capture (DISC-04); identical to the Phase-30 invoke chokepoint. A denied/Off origin is never captured. |
| V5 Input Validation | yes | The synthesized recipe is an UNTRUSTED payload that MUST pass `validateRecipe` (closed-vocab + forbidden-name pre-scan) before promotion (D-12); the path-template is `encodeURIComponent`-escaped by the interpreter; the origin-pin re-validates the effective URL. |
| V6 Cryptography | yes (by exemption) | No hand-rolled crypto. The `'local'` provenance exemption short-circuits the Ed25519 verify (trusted-by-local-synthesis); the verify itself (when reached for server recipes) remains the native-first fail-closed Web-Crypto path. The exemption is loader-vouched (HI-01), never payload-asserted. |
| V7 Logging & Error Handling | yes | **The core control.** Capture-time redaction (D-05) keeps SHAPE only: url->path-template (no query), header NAMES only with auth carriers removed, NO body, status/mimeType only. Mirrors the `audit-log.js` no-secrets discipline (strict field whitelist + `redactForLog`). No body/header-value/PII is ever logged or stored. |
| Supply chain | yes | ZERO new packages (preferred). All deps are vendored (`@cfworker/json-schema@4.1.1`, `minisearch@7.2.0`, `jmespath`) or Chrome/Node built-ins. The two recipe-path-adjacent new modules are dynamic-code-free and on `RECIPE_PATH_ALLOWLIST` (Check 1 scans them for `eval`/`new Function`/`import(` even in comments). |

### Known Threat Patterns for {CDP capture + learned-recipe synthesis on authenticated first-party traffic}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A captured request/response BODY leaks to `chrome.storage` | Information Disclosure | The redactor NEVER reads the body; `Network.getResponseBody` is never called (D-08); the stored shape has no body field by construction. The no-secret test asserts no body string survives. |
| An auth header VALUE (cookie/bearer/CSRF/api-key) is persisted | Information Disclosure | Header VALUES are never read (names-only, D-07); auth-carrier header NAMES are removed entirely (denylist). Even an unrecognized auth header leaks nothing (no values captured at all). |
| A query-string param (session id, PII, token) is persisted in the endpoint | Information Disclosure | The path-template drops the query string entirely (D-06); only `URL.pathname` is kept, parameterized. The no-secret test asserts no `?`-query survives. |
| A MALICIOUS page injects fake `Network` events to synthesize a hostile recipe | Spoofing / Tampering | The page CANNOT inject CDP events — `onEvent` fires only from the SW-owned `chrome.debugger` attachment (the page has no access). Defense-in-depth: same-origin filter (cross-origin dropped, D-04) + consent gate (only consented origins, DISC-04) + `validateRecipe` (closed-vocab, D-12) + promote-after-replay (a hostile recipe that does not replay through the real credentialed path is discarded, D-10) + origin-pin (`executeBoundSpec` rejects a cross-origin target). FIVE independent gates. |
| A learned recipe drives a credentialed call to a DIFFERENT origin (confused deputy) | Elevation of Privilege | The recipe `origin` is schema-pattern-locked to a bare http(s) origin; `_getLearned` scopes to `recipe.origin === activeOrigin` (Pitfall 6); `executeBoundSpec` re-asserts the active-tab origin-pin before any side effect -> `RECIPE_ORIGIN_MISMATCH` with no fetch. |
| A recipe payload self-declares `provenance:'local'` to skip signature verify | Tampering / Spoofing | HI-01: provenance is the loader's `trustedProvenance` vouch ONLY; the interpreter never reads the payload `provenance` for trust. A self-asserted `'local'` is ignored and the envelope is verified (the parallel of the existing `'bundled'`-masquerade test). |
| A capture session leaks a debugger attachment across SW eviction | Denial of Service / surprise | The session is time/count-bounded (D-01); `endSession` releases `Network.disable` + removes the listener + detaches (ownership-checked, Pitfall 1); `onDetach` (target_closed/canceled_by_user) tears down on Chrome-initiated detach. No persistent attachment. |
| Capturing on a sensitive/denied service (e.g. banking) | Information Disclosure / policy | `isDenied` blocks denied origins outright; `classify().sensitive` forces extra confirmation (DISC-04 + the Phase-30 sensitive rule). The default-OFF posture means an un-enabled origin is never captured. |

**Net security posture:** capture is consent-gated, same-origin-only, redacted-at-source (no body, no header values, no query, no PII), synthesized into a schema-validated closed-vocab recipe, promoted only after a real origin-pinned credentialed replay, exempt-by-loader-vouched-local-provenance (never payload-asserted), and stored in a per-origin envelope that persists zero secrets. Every credential-replay and PII-leak vector has an explicit structural mitigation, most with defense-in-depth redundancy.

## Sources

### Primary (HIGH confidence)
- `chromedevtools.github.io/devtools-protocol/tot/Network/` — `requestWillBeSent` Request fields (url/method/headers/postData/postDataEntries) + the `type` ResourceType field; `responseReceived` Response fields (status/statusText/headers/mimeType available WITHOUT getResponseBody); ResourceType enum (XHR, Fetch).
- `developer.chrome.com/docs/extensions/reference/api/debugger` — attach/sendCommand/detach/onEvent/onDetach lifecycle; onDetach reasons (`target_closed`, `canceled_by_user`).
- Codebase (read at file:line, `automation-worktree`, 2026-06-22): `extension/background.js:13900-14002` (debugger attach/collision/KeyboardEmulator coordination), `extension/utils/capability-recipe-schema.js` (RECIPE_SCHEMA + authStrategy enum :112 + csrf.from enum :136 + validateRecipe), `extension/utils/capability-signature.js:233-311` (verifyRecipeEnvelope + the trustedProvenance second-arg + the bundled short-circuit :251), `extension/utils/capability-interpreter.js:290-400` (detectRecipeEnvelope + interpretRecipe + the exempt short-circuit :361 + the async verify branch), `extension/utils/capability-search.js:48-149,222-224` (INDEX_OPTIONS, buildOrRestore, getRecipeBySlug, _slugToRecipe), `extension/utils/capability-catalog.js:203-267` (resolve + biasByOwnedOrigin), `extension/utils/capability-router.js:352-404,485-512` (_runDeclarativeTier replay path + the T2 stub :498), `extension/utils/capability-fetch.js:132-189` (capabilityFetchInPage CSRF scrape: meta/cookie handled, from:'response' deferred :163), `extension/utils/consent-policy-store.js:103-244` (the versioned-envelope idiom + getConsentForOrigin :170), `extension/utils/service-denylist.js:120-145` (isDenied/classify), `extension/utils/redactForLog.js` (shape-only redactor), `extension/lib/memory/memory-storage.js:96-134` (the rejected 500-cap layer + LRU pattern reference), `scripts/verify-recipe-path-guard.mjs:83-182` (RECIPE_PATH_ALLOWLIST + Check 4 disk glob), `tests/consent-policy-store.test.js:43-72` (chrome.storage.local stub), `tests/recipe-signature-interpreter-hook.test.js:97-127` (verifyEd25519 spy + provenance-masquerade test), `tests/capability-fetch.test.js:85-90` (vendored-global vm loader).

### Secondary (MEDIUM confidence)
- WebSearch (verified against the official protocol docs): multiple CDP domains coexist on one `chrome.debugger.attach`; ResourceType enum members; the "started debugging this browser" banner is unavoidable without `--silent-debugger-extension-api` or enterprise policy (corroborated across developer.chrome.com, BrowserStack, UiPath, Leapwork support docs).

### Tertiary (LOW confidence)
- None relied upon — every load-bearing claim is verified against the official docs or the codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency is already vendored/built-in and read at file:line; zero new packages.
- Architecture (CDP capture + the four wire-ins): HIGH — all three CDP unknowns resolved against the official Network + debugger docs; every seam (signature exemption, search add, catalog resolve, router T2, replay path) read at file:line.
- Synthesis heuristics: MEDIUM — the path-template and authStrategy inference are necessarily heuristic (A2), but bounded SAFE by the promote-after-replay gate (a bad guess is discarded, never stored) and the from:'response' executor-coverage finding (Pitfall 4) which caps the inference to what the declarative path can run.
- Pitfalls: HIGH — the two gating findings (from:'response' replay-coverage gap; the capability-* CI-guard glob) are verified by codebase grep; the debugger banner + detach-coordination are verified against the docs + the existing Input lifecycle.
- Security: HIGH — the redaction discipline mirrors the proven `audit-log.js` no-secrets pattern; every STRIDE vector has a structural mitigation traced to a file:line control.

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (30 days — stable; the CDP Network/debugger surface and the in-repo capability layer are slow-moving. Re-verify the recipe-path-guard allowlist and the capability-fetch CSRF coverage if Phase 32 lands first, since Phase 32 may extend the declarative from:'response' handling that Pitfall 4 depends on.)

## RESEARCH COMPLETE

**Phase:** 31 - Network-Capture Discovery + Recipe Synthesis + Learned Recipes
**Confidence:** HIGH

### Key Findings
- **All 3 CDP unknowns resolved (HIGH):** multiple CDP domains coexist on the existing `chrome.debugger` attachment (Network + Input, no disruption); `requestWillBeSent` carries the `type` ResourceType field for XHR/Fetch filtering; `responseReceived` exposes status/statusText/headers/mimeType DIRECTLY — so D-08's "never call `Network.getResponseBody`" is fully satisfiable. There is currently NO `onEvent` listener in the extension, so capture is the first clean CDP-event consumer.
- **GATING FINDING (synthesis contract):** the declarative replay path (`capabilityFetchInPage`) handles `csrf.from` of `meta`/`cookie` ONLY — `from:'response'` is deferred (`capability-fetch.js:163`) and lives only in the T1a imperative handlers. The synthesizer MUST NOT emit `csrf.from:'response'` (it would pass `validateRecipe` but FAIL the promote-after-replay gate); ambiguous token-from-GET cases default to `same-origin-cookie` + flag (exactly D-11).
- **GATING FINDING (CI guard):** `verify-recipe-path-guard.mjs` Check 4 auto-globs `extension/utils/capability-*.js` and fails CI closed on any not allowlisted. The CONTEXT's net-new names avoid the glob, but the synthesizer + learned-store are recipe-path-adjacent and must be added to `RECIPE_PATH_ALLOWLIST` (the CONTEXT already lists the guard as MODIFIED) and kept dynamic-code-free.
- **The `'local'` exemption is a 2-line change in EACH of two files:** `verifyRecipeEnvelope` (`capability-signature.js:251`) and `interpretRecipe` (`capability-interpreter.js:361`) already gate on `'bundled'` via the loader-vouched `trustedProvenance`; add `'local'`. The HI-01 payload-cannot-self-declare discipline is preserved verbatim, with an existing test as the template.
- **The capture banner ("started debugging this browser") is unavoidable** without launch flags — this is precisely why D-01's user-initiated, time-boxed posture is correct (not a defect to engineer around). The detach must be ownership-coordinated with the KeyboardEmulator (Pitfall 1).

### File Created
`.planning/phases/31-network-capture-discovery-recipe-synthesis-learned-recipes/31-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Zero new packages; all deps vendored/built-in, read at file:line. |
| Architecture | HIGH | All CDP unknowns resolved vs official docs; every wire-in seam read at file:line. |
| Pitfalls | HIGH | Two gating findings verified by grep; banner + detach verified vs docs + existing Input lifecycle. |
| Synthesis heuristics | MEDIUM | Necessarily heuristic, but bounded safe by promote-after-replay + the from:'response' coverage cap. |
| Security | HIGH | Redaction mirrors the proven audit-log no-secrets pattern; every STRIDE vector traced to a control. |

### Open Questions
- Per-recipe confirmation vs auto-promote-on-replay within the consented session (recommend auto-promote; discuss-phase if extra friction wanted).
- The numeric per-origin LRU cap (recommend 16-32/origin; Claude's discretion).
- Response-header treatment (recommend drop entirely, keep status+mimeType only — strictly safer than D-06's request-side names-only).

### Ready for Planning
Research complete. The planner can create PLAN.md files: 4 net-new dynamic-code-free SW modules + 4 additive edits + the allowlist extension + 9 zero-framework test suites (1 human-gated live UAT), all seams anchored at file:line with the two gating constraints (from:'response' synthesis cap; the capability-* CI-guard glob) called out as hard requirements.
