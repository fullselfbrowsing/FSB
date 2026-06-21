# Requirements: FSB (Full Self-Browsing) — v0.9.99 Native Capability Catalog

**Defined:** 2026-06-19
**Core Value:** Reliable single-attempt execution — the AI decides correctly; the mechanics execute precisely. v0.9.99 extends this to a second execution path: call a service's real web API through the user's authenticated session (fast path), and self-heal to DOM automation when the API path breaks.

## v1 Requirements

Requirements for the v0.9.99 milestone. Each maps to exactly one roadmap phase (Phases 26–32, continuing integer numbering from v0.12.0's Phase 25).

### CAP — Capability Runtime & Recipe Interpreter

- [x] **CAP-01**: A versioned JSON Schema defines a recipe as pure data — endpoint template, method, an auth-strategy enum, parameter schema, static request/header map, and a read-only JMESPath extract — with no executable/script fields.
- [x] **CAP-02**: A fixed, bundled interpreter executes a recipe by binding its data to a closed enum of bundled auth-strategy handlers, never via `eval`/`new Function`/`import()`.
- [x] **CAP-03**: Recipes and invocation parameters are validated in the service worker by an eval-free JSON Schema validator before execution; invalid or unknown-opcode recipes are rejected with a typed error.
- [x] **CAP-04**: A CI guard fails the build on any `eval`/`new Function`/`import(` reachable from the recipe path and on any recipe field outside the closed vocabulary.
- [x] **CAP-05**: The interpreter and the three new libraries (minisearch, jmespath, @cfworker/json-schema) ship inside the extension package; no remotely-hosted code and no manifest/permission change is introduced.

### FETCH — Authenticated Fetch Primitive

- [x] **FETCH-01**: An authenticated API call executes in the page MAIN world via the existing `execute_js` seam so the user's first-party HttpOnly/SameSite cookies attach automatically.
- [x] **FETCH-02**: The fetch primitive scrapes and sends per-form CSRF tokens and the required headers declared by the recipe's auth-strategy.
- [x] **FETCH-03**: Origin-pinning is enforced inside the interpreter — a recipe bound to origin X may only issue requests to origin X; cross-origin targets are rejected before any side effect.
- [x] **FETCH-04**: An in-flight capability call survives MV3 service-worker eviction via the existing `run_task` resume-sidecar; mid-mutation ambiguity is treated as `RECOVERY_AMBIGUOUS` and never blind-retried.
- [x] **FETCH-05**: A smoke test asserts the logged-in (not logged-out) data shape is returned from the chosen execution context against a real HttpOnly-cookie site. _(Automated/CI half satisfied: the smoke test through the chosen execution context is green in Plan 02, `tests/capability-fetch.test.js`. The irreducibly-LIVE half -- real GitHub HttpOnly cookies actually attach in the page MAIN world against a real signed-in session -- is recorded as **human_needed** debt in `27-HUMAN-UAT.md` UAT-27-01, NOT a fabricated pass; it cannot run in CI without shipping a real credential, GOV-06.)_

### SURF — Lean MCP Surface & Capability Search

- [x] **SURF-01**: `search_capabilities` returns ranked, schema-on-hit results (≤5) for an intent query, biased by the owned tab's origin.
- [ ] **SURF-02**: `invoke_capability` executes a selected capability with validated parameters and returns a structured result.
- [ ] **SURF-03**: Both tools register outside `TOOL_REGISTRY` (via `server.tool()`), keeping the existing ~63 MCP tool schemas byte-identical (INV-01).
- [x] **SURF-04**: A persisted minisearch index indexes intent synonyms + service + action verb + side-effect class, and snapshots to `chrome.storage.local`.
- [ ] **SURF-05**: `search_capabilities` is read-only and bypasses the mutation queue; `invoke_capability` is serialized through it.
- [x] **SURF-06**: An eval harness measures recall@k and wrong-invoke rate, and the milestone is gated on its thresholds.

### CAT — Catalog & Tiered Routing

- [ ] **CAT-01**: A capability router selects a tier — model-prior public API → bundled handler → declarative recipe → learned recipe → DOM fallback — biased by the tab origin.
- [ ] **CAT-02**: 5–10 high-value services ship as bundled imperative handlers (the zero-install head), requiring no install.
- [ ] **CAT-03**: Additional services load as declarative recipes (data) executed by the bundled interpreter (the long tail).
- [ ] **CAT-04**: Autopilot reaches the same capability engine via a `tool-executor` branch — runtime-layer parity with the MCP surface, with no parallel autopilot stack (INV-02).
- [ ] **CAT-05**: The router returns either a structured result or a typed reason for falling through to the next tier.

### GOV — Consent Governance & Audit

- [ ] **GOV-01**: Capability execution is default-OFF per origin; nothing runs against an origin until the user explicitly enables it.
- [ ] **GOV-02**: Per-origin consent supports Off / Ask / Auto, where Auto is an explicit per-origin opt-in and never a global switch.
- [ ] **GOV-03**: Mutating calls (POST/PUT/PATCH/DELETE) require elevated consent, are surfaced in the Ask prompt, and trigger disambiguation before any mutating invoke.
- [ ] **GOV-04**: The consent gate is enforced at the single dispatch chokepoint, immediately after the existing ownership gate.
- [ ] **GOV-05**: An append-only audit log records origin, capability, method, side-effect class, consent decision, outcome, and timestamp — and never records secrets.
- [ ] **GOV-06**: Auth material (cookies/tokens/CSRF) never leaves the device and is never persisted; a tested redactor asserts no auth substrings survive capture or persistence.
- [ ] **GOV-07**: A control-panel UI manages per-origin consent and shows the audit log; sensitive origins (banking/email/gov) carry extra friction even under Auto.
- [ ] **GOV-08**: A documented legal/ToS posture and service denylist records which services FSB will not target.

### HEAL — Self-Healing & Recipe-Rot

- [ ] **HEAL-01**: When a recipe breaks (4xx/5xx, empty, shape-mismatch, or `RECIPE_EXPIRED`), FSB falls back to DOM automation (DOM engine + site guides + `run_task`) and still completes the task.
- [ ] **HEAL-02**: Recipes are stamped with captured-at and an expected-shape assertion; responses are validated against it to detect rot, emitting a typed `RECIPE_EXPIRED`.
- [ ] **HEAL-03**: A broken recipe is quarantined/demoted, and the task is re-learned where possible.
- [ ] **HEAL-04**: A failure-detection taxonomy distinguishes "recipe broken" from a legitimate "no results" so fallback never masks a real outcome.
- [ ] **HEAL-05**: Capability and fallback paths pass tests across all 7 providers (INV-03) and a schema-lock parity test (INV-01).

### DISC — Network-Capture Discovery

- [ ] **DISC-01**: With consent, CDP Network capture (`Network.enable` + `requestWillBeSent`/`responseReceived`/`getResponseBody`) observes a page's real API calls to discover candidate capabilities.
- [ ] **DISC-02**: Discovery reuses the existing `chrome.debugger` attachment by adding the Network domain (no manifest change) without disrupting the existing Input emulation.
- [ ] **DISC-03**: Captured requests are redacted at capture time, before any persistence, stripping auth/cookie/token/CSRF material.
- [ ] **DISC-04**: Discovery runs only on origins set to Ask/Auto and never on default-Off origins.

### LEARN — Learned Recipes

- [ ] **LEARN-01**: A successfully discovered-and-replayed call is synthesized into a declarative recipe and promoted to per-origin procedural memory.
- [ ] **LEARN-02**: Learned recipes store request shape only (endpoint, method, header-map, csrf-source, extract-path, origin) — never response bodies or PII.
- [ ] **LEARN-03**: Learned recipes feed the capability search index so they are findable on the next visit to the origin.
- [ ] **LEARN-04**: A learned recipe for an origin outranks generic recipes during routing.

### SIGN — Recipe Integrity

- [ ] **SIGN-01**: Server-delivered recipes are signature-verified (Ed25519/JCS via Lattice receipts) before execution; unverified or tampered recipes are rejected.
- [ ] **SIGN-02**: Recipe integrity metadata (signature, captured-at, schema hash) travels with the recipe and is checked by the interpreter before binding.

## v2 Requirements

Deferred to a future milestone. Tracked but not in the v0.9.99 roadmap.

### Future

- **FUT-01**: Per-capability (vs per-origin) consent granularity.
- **FUT-02**: Explicit, user-initiated capability-pack install (via MCP command or control panel) for heavy/rare long-tail services.
- **FUT-03**: Capability sharing/export with a trust/provenance model.
- **FUT-04**: Intent-based DOM healing (the 75–90% optimization beyond basic escalation).
- **FUT-05**: Cross-origin authenticated capability orchestration under a stronger threat model (only if ever justified).

## Out of Scope

Explicitly excluded for v0.9.99. Documented to prevent scope creep. Anti-features carry warnings.

| Feature | Reason |
|---------|--------|
| npm-package-per-plugin distribution (OpenTabs model) | MV3 bans runtime code loading; the capability layer ships bundled + as declarative data instead. |
| Generic cross-origin authenticated replay | The CSRF / credential-exfiltration engine; v0.9.99 is same-origin-only by design. |
| Remotely-hosted executable recipe logic / server-authored control flow | Web Store "no remotely hosted code" — recipes are closed-vocabulary data only; the interpreter is bundled. |
| Auto-enable of newly discovered capabilities | Violates default-OFF/supervised posture; discovery never grants execution. |
| AI-source-code-review as the trust gate (OpenTabs) | Category mismatch — FSB's tail is data, not code; replaced by recipe-data preview + consent. |
| Background / unattended / cloud capability execution | FSB stays supervised and local; the user's browser must be active. |
| "Match OpenTabs' ~2,769-tool count" as a goal | The count is a moving, AI-generated target; FSB matches the auto-grow mechanism and wins on resilience, not tool count. |

## Traceability

Which phase covers which requirement. Phase column populated during roadmap creation (Phases 26–32).

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | Phase 26 | Complete |
| CAP-02 | Phase 26 | Complete |
| CAP-03 | Phase 26 | Complete |
| CAP-04 | Phase 26 | Complete |
| CAP-05 | Phase 26 | Complete |
| FETCH-01 | Phase 27 | Complete |
| FETCH-02 | Phase 27 | Complete |
| FETCH-03 | Phase 27 | Complete |
| FETCH-04 | Phase 27 | Complete |
| FETCH-05 | Phase 27 | Complete (CI half); live half human_needed (27-HUMAN-UAT.md UAT-27-01) |
| SURF-01 | Phase 28 | Complete |
| SURF-02 | Phase 28 | Pending |
| SURF-03 | Phase 28 | Pending |
| SURF-04 | Phase 28 | Complete |
| SURF-05 | Phase 28 | Pending |
| SURF-06 | Phase 28 | Complete |
| CAT-01 | Phase 29 | Pending |
| CAT-02 | Phase 29 | Pending |
| CAT-03 | Phase 29 | Pending |
| CAT-04 | Phase 29 | Pending |
| CAT-05 | Phase 29 | Pending |
| GOV-01 | Phase 30 | Pending |
| GOV-02 | Phase 30 | Pending |
| GOV-03 | Phase 30 | Pending |
| GOV-04 | Phase 30 | Pending |
| GOV-05 | Phase 30 | Pending |
| GOV-06 | Phase 30 | Pending |
| GOV-07 | Phase 30 | Pending |
| GOV-08 | Phase 30 | Pending |
| HEAL-01 | Phase 32 | Pending |
| HEAL-02 | Phase 32 | Pending |
| HEAL-03 | Phase 32 | Pending |
| HEAL-04 | Phase 32 | Pending |
| HEAL-05 | Phase 32 | Pending |
| DISC-01 | Phase 31 | Pending |
| DISC-02 | Phase 31 | Pending |
| DISC-03 | Phase 31 | Pending |
| DISC-04 | Phase 31 | Pending |
| LEARN-01 | Phase 31 | Pending |
| LEARN-02 | Phase 31 | Pending |
| LEARN-03 | Phase 31 | Pending |
| LEARN-04 | Phase 31 | Pending |
| SIGN-01 | Phase 30 | Pending |
| SIGN-02 | Phase 30 | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

Per-phase requirement counts:
- Phase 26 (CAP): 5 — CAP-01..05
- Phase 27 (FETCH): 5 — FETCH-01..05
- Phase 28 (SURF): 6 — SURF-01..06
- Phase 29 (CAT): 5 — CAT-01..05
- Phase 30 (GOV + SIGN): 10 — GOV-01..08, SIGN-01..02
- Phase 31 (DISC + LEARN): 8 — DISC-01..04, LEARN-01..04
- Phase 32 (HEAL): 5 — HEAL-01..05

---
*Requirements defined: 2026-06-19*
*Last updated: 2026-06-19 — roadmap created; traceability populated for Phases 26–32, coverage 44/44 mapped, 0 unmapped.*
