# Roadmap: FSB (Full Self-Browsing)

## Milestones

- **v0.10.0 Autopilot via Lattice SDK** — Phases 01-13, shipped 2026-06-15.
- **v0.11.0 Trigger Tool (Reactive DOM Monitoring)** — Phases 14-20, completed 2026-06-17; release actions and browser UAT remain user-gated.
- **v0.12.0 PhantomStream Package Migration** — Phases 21-25, completed 2026-06-17; live Chrome-extension UAT remains user-gated.
- **v0.9.99 Native Capability Catalog (FSB API Execution)** — Phases 26-32, IN PROGRESS.

## Active Milestone

**v0.9.99 Native Capability Catalog (FSB API Execution)** — Phases 26-32.

**Milestone Goal:** Give FSB first-class authenticated-API execution as a fast path alongside DOM automation — call a service's real web API through the user's authenticated session (zero plugin installs, no MCP tool bloat), backed by FSB's DOM engine as a self-healing fallback. The whole design lives between two architectural walls: **Wall 1** (MV3 "no remotely-hosted code" — server-delivered recipes are CLOSED-vocabulary DATA bound by a fixed bundled interpreter, never `eval`'d) and **Wall 2** (the authenticated fetch MUST run in the page MAIN world so the user's first-party cookies attach; a background-SW fetch is the anti-pattern). Ordering is risk-first: the schema + CI guard (Wall 1) and the page-context fetch primitive (Wall 2) come first; consent precedes discovery/learning; self-healing fallback lands last.

**Hard invariants (every phase respects these):**
- **INV-01 MCP wire contracts UNTOUCHED.** The existing ~63 MCP tool schemas stay byte-identical; the 2 new tools (`search_capabilities`, `invoke_capability`) register OUTSIDE `TOOL_REGISTRY` via `server.tool()`.
- **INV-02 Tool-surface parity at the runtime layer.** Autopilot reaches the capability engine via a `tool-executor` branch hitting the SAME `capability-router`; no parallel autopilot-only stack.
- **INV-03 Provider parity.** Capability + fallback paths work equally across all 7 `universal-provider.js` targets.
- **INV-04 MV3-survivability preserved.** The `agent-loop.js` `setTimeout`-chained iterator is load-bearing and untouched; invoke is a single bounded async op.

## Phases

**Phase Numbering:**
- Integer phases continue from v0.12.0's Phase 25 — this milestone runs Phases 26-32. Numbering never restarts at 1.
- Decimal phases (26.1, 26.2) remain reserved for urgent insertions (marked INSERTED) and execute between their surrounding integers.

- [ ] **Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard** - Wall 1 day-one invariant: closed-vocabulary recipe schema, fixed eval-free interpreter, and a CI guard that fails on any `eval`/`new Function`/`import(` reachable from the recipe path.
- [ ] **Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar** - Wall 2 spine: a same-origin credentialed fetch through the `execute_js` seam (CSRF scrape included), origin-pinned, surviving SW eviction with `RECOVERY_AMBIGUOUS` for mid-mutation.
- [ ] **Phase 28: Lean MCP Surface + Capability Search + Eval Harness** - `search_capabilities` + `invoke_capability` registered outside `TOOL_REGISTRY`, a persisted minisearch index, queue-correct routing, and a recall@k / wrong-invoke eval gate.
- [ ] **Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity** - Origin-biased tier selection (model-prior → bundled handler → declarative recipe → learned recipe → DOM fallback), 5-10 bundled head handlers, a declarative recipe tail, and the autopilot branch onto the shared engine.
- [ ] **Phase 30: Consent Governance + Recipe Signature Verification + Audit + Legal Posture** - Per-origin Off/Ask/Auto (default-OFF) at the single dispatch chokepoint, mutation gating, Ed25519/JCS recipe verification, a no-secrets audit log, a control-panel UI, and a documented ToS/denylist posture.
- [ ] **Phase 31: Network-Capture Discovery + Recipe Synthesis + Learned Recipes** - Consent-gated CDP Network capture to discover real API calls, capture-time redaction, synthesis into per-origin declarative recipes promoted to procedural memory, fed back into the search index.
- [ ] **Phase 32: Self-Healing Fallback + Recipe-Rot Detection + Re-Learn + Provider/Schema-Lock Tests + UAT** - Typed `RECIPE_EXPIRED`/`RECOVERY_AMBIGUOUS` taxonomy, DOM-automation fallback that completes the task and re-learns, recipe quarantine, the 7-provider + schema-lock parity gate, and live UAT.

## Phase Details

### Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard
**Goal**: Establish the closed-vocabulary recipe-as-data format and the fixed bundled interpreter, with a CI guard that makes the Wall-1 "no code fetched as data" line unbreakable before any recipe is ever interpreted.
**Depends on**: Nothing (first phase of this milestone; foundational for everything downstream)
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, CAP-05
**Success Criteria** (what must be TRUE):
  1. A versioned JSON Schema defines a recipe as pure data (endpoint template, method, auth-strategy enum, parameter schema, static request/header map, read-only JMESPath extract) with no executable/script fields, and a recipe carrying any field outside the closed vocabulary is rejected with a typed error.
  2. The bundled interpreter executes a valid recipe by binding its data to a closed enum of bundled auth-strategy handlers, and validates recipes + invocation parameters in the service worker via an eval-free JSON Schema validator (`@cfworker/json-schema`) before execution — never via `eval`/`new Function`/`import()`.
  3. The build fails (CI guard) on any `eval`/`new Function`/`import(` reachable from the recipe path and on any recipe field/opcode outside the closed vocabulary.
  4. The interpreter plus the three new libraries (minisearch, jmespath, @cfworker/json-schema) ship inside the extension package with no remotely-hosted code and no manifest/permission change.
**Plans**: 3 plans
- [x] 26-01-PLAN.md — Vendor the 3 libraries + closed-vocabulary recipe schema + fixtures (CAP-01, CAP-05)
- [x] 26-02-PLAN.md — Bundled interpreter (validate-bind-emit-spec, no network) + auth-strategy stubs + RECIPE_ error passthrough (CAP-02, CAP-03)
- [x] 26-03-PLAN.md — Recipe-path CI guard (allowlist grep + fixture run) wired into validate:extension (CAP-04)

### Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar
**Goal**: Prove the riskiest unknown — a same-origin authenticated `fetch` (cookies/CORS/CSRF/SameSite) through the page MAIN world against ONE hardcoded recipe — and build origin-pinning and SW-eviction survival into the primitive from the start.
**Depends on**: Phase 26
**Requirements**: FETCH-01, FETCH-02, FETCH-03, FETCH-04, FETCH-05
**Success Criteria** (what must be TRUE):
  1. An authenticated API call executes in the page MAIN world via the existing `execute_js` seam so the user's first-party HttpOnly/SameSite cookies attach automatically, and the fetch primitive scrapes and sends per-form CSRF tokens and the headers the recipe's auth-strategy declares.
  2. Origin-pinning is enforced inside the interpreter — a recipe bound to origin X may only issue requests to origin X; a cross-origin target is rejected before any side effect.
  3. An in-flight capability call survives MV3 service-worker eviction via the existing `run_task` resume-sidecar, and mid-mutation ambiguity is treated as `RECOVERY_AMBIGUOUS` and never blind-retried.
  4. A smoke test asserts the logged-in (not logged-out) data shape is returned from the chosen execution context against a real HttpOnly-cookie site.
**Plans**: 3 plans
- [x] 27-01-PLAN.md — Foundations: interpreter query-fold + origin-pin (RECIPE_ORIGIN_MISMATCH), RECOVERY_AMBIGUOUS errors.ts registration, capability-fetch.js allowlist entry (FETCH-03, FETCH-04)
- [x] 27-02-PLAN.md — capability-fetch.js primitive (in-page func + SW wrapper + active-tab pin + resume-sidecar + SW-side extract + classifyOnWake), hardcoded github recipe, FETCH-01..05 CI suite (FETCH-01..05)
- [x] 27-03-PLAN.md — Live FETCH-05 logged-in-shape closeout: 27-HUMAN-UAT.md (human_needed) + human-gated checkpoint (FETCH-05)
**UI hint**: yes

### Phase 28: Lean MCP Surface + Capability Search + Eval Harness
**Goal**: Expose the capability engine through a lean two-tool wire surface using progressive disclosure (search → invoke) without bloating the MCP context, and stand up the search/index whose quality is the catalog's ceiling — gated by an eval harness.
**Depends on**: Phase 27
**Requirements**: SURF-01, SURF-02, SURF-03, SURF-04, SURF-05, SURF-06
**Success Criteria** (what must be TRUE):
  1. `search_capabilities` returns ranked, schema-on-hit results (≤5) for an intent query, biased by the owned tab's origin; `invoke_capability` executes a selected capability with validated parameters and returns a structured result.
  2. Both tools register outside `TOOL_REGISTRY` via `server.tool()`, keeping the existing ~63 MCP tool schemas byte-identical (INV-01 verified).
  3. A persisted minisearch index indexes intent synonyms + service + action verb + side-effect class and snapshots to `chrome.storage.local`; `search_capabilities` is read-only and bypasses the mutation queue while `invoke_capability` is serialized through it.
  4. An eval harness measures recall@k and wrong-invoke rate, and the milestone is gated on its thresholds.
**Plans**: 4 plans
- [x] 28-01-PLAN.md — Capability-search index layer + catalog shipping + eval-harness gate (recall@5>=0.9, wrong-invoke=0) + seed fixtures
- [x] 28-02-PLAN.md — Two out-of-registry MCP tools (search_capabilities + invoke_capability) + read-only/queue split (INV-01)
- [x] 28-03-PLAN.md — SW dispatcher routes + bridge wiring: SW-side origin bias for search, routerless invoke path, RECIPE_NOT_FOUND
- [x] 28-04-PLAN.md — INV-01 surface proof test (two tools on wire + registry hash unchanged + queue split) + test-chain wiring

### Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity
**Goal**: Add the catalog, the origin-biased tiered router, the zero-install bundled head (imperative handlers) and declarative-recipe long tail, and the autopilot branch — so MCP and autopilot share one engine (INV-02 at the runtime layer).
**Depends on**: Phase 28
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05
**Success Criteria** (what must be TRUE):
  1. A capability router selects a tier — model-prior public API → bundled handler → declarative recipe → learned recipe → DOM fallback — biased by the tab origin, and returns either a structured result or a typed reason for falling through to the next tier.
  2. 5-10 high-value services ship as bundled imperative handlers (the zero-install head) requiring no install, and additional services load as declarative recipes (data) executed by the bundled interpreter (the long tail).
  3. Autopilot reaches the same capability engine via a `tool-executor` branch — runtime-layer parity with the MCP surface, with no parallel autopilot stack (INV-02).
**Plans**: 5 plans
- [x] 29-01-PLAN.md — Wave 0 validation contract: two new test files (capability-router, capability-autopilot-parity) + INV-04 iterator guard + RECIPE_PATH_ALLOWLIST pre-arm + handler packaging step + test-chain wiring
- [ ] 29-02-PLAN.md — The engine: capability-catalog.js (slug→tier registry) + capability-router.js (tier dispatch, lifted T1b body, T0 special-case, T2/T3 typed seams) + SW importScripts wiring
- [ ] 29-03-PLAN.md — Zero-install head (5-service MVP): GitHub-issues/Slack/Notion T1a handlers + Reddit-inbox T1b recipe + catalog tier entries + live-capture confirmation of [ASSUMED] endpoints (human_needed)
- [ ] 29-04-PLAN.md — The reroute (INV-01-safe): handleCapabilitiesInvokeMessageRoute calls FsbCapabilityRouter.invoke; wire names/route table/TOOL_REGISTRY untouched
- [ ] 29-05-PLAN.md — Autopilot parity (INV-02): pre-executeTool capability guard → shared FsbCapabilityRouter global + additive system-prompt hint (iterator byte-untouched, INV-04) + full-suite phase-close gate

### Phase 30: Consent Governance + Recipe Signature Verification + Audit + Legal Posture
**Goal**: Wrap invoke in the safety gate the whole "credential-replay" risk hinges on — default-OFF per-origin consent, mutation gating, recipe integrity verification, a no-secrets audit log, and a documented legal posture — before any learning/auto behavior ships.
**Depends on**: Phase 29
**Requirements**: GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GOV-06, GOV-07, GOV-08, SIGN-01, SIGN-02
**Success Criteria** (what must be TRUE):
  1. Capability execution is default-OFF per origin (nothing runs against an origin until the user explicitly enables it); per-origin consent supports Off / Ask / Auto where Auto is an explicit per-origin opt-in and never a global switch; the gate is enforced at the single dispatch chokepoint immediately after the existing ownership gate.
  2. Mutating calls (POST/PUT/PATCH/DELETE) require elevated consent, are surfaced in the Ask prompt, and trigger disambiguation before any mutating invoke.
  3. Server-delivered recipes are signature-verified (Ed25519/JCS via Lattice receipts) before execution and unverified or tampered recipes are rejected; recipe integrity metadata (signature, captured-at, schema hash) travels with the recipe and is checked by the interpreter before binding.
  4. An append-only audit log records origin, capability, method, side-effect class, consent decision, outcome, and timestamp and never records secrets; auth material (cookies/tokens/CSRF) never leaves the device and is never persisted (a tested redactor asserts no auth substrings survive).
  5. A control-panel UI manages per-origin consent and shows the audit log with extra friction for sensitive origins (banking/email/gov) even under Auto, and a documented legal/ToS posture plus service denylist records which services FSB will not target.
**Plans**: TBD
**UI hint**: yes

### Phase 31: Network-Capture Discovery + Recipe Synthesis + Learned Recipes
**Goal**: Add the highest-novelty auto-growth layer — consent-gated CDP Network capture that discovers real API calls, synthesizes per-origin declarative recipes, and promotes them to procedural memory — stacking only on the now-proven consent, memory, and router layers.
**Depends on**: Phase 30
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, LEARN-01, LEARN-02, LEARN-03, LEARN-04
**Success Criteria** (what must be TRUE):
  1. With consent, CDP Network capture (`Network.enable` + `requestWillBeSent`/`responseReceived`/`getResponseBody`) observes a page's real API calls by extending the existing `chrome.debugger` attachment with the Network domain — no manifest change and without disrupting the existing Input emulation — and runs only on Ask/Auto origins, never on default-Off origins.
  2. Captured requests are redacted at capture time, before any persistence, stripping auth/cookie/token/CSRF material.
  3. A successfully discovered-and-replayed call is synthesized into a declarative recipe and promoted to per-origin procedural memory storing request shape only (endpoint, method, header-map, csrf-source, extract-path, origin) — never response bodies or PII.
  4. Learned recipes feed the capability search index so they are findable on the next visit to the origin, and a learned recipe for an origin outranks generic recipes during routing.
**Plans**: TBD

### Phase 32: Self-Healing Fallback + Recipe-Rot Detection + Re-Learn + Provider/Schema-Lock Tests + UAT
**Goal**: Tie recipe-break detection to the existing DOM tools so a broken recipe still completes the task — the flagship differentiator and the catch-all for Wall-2's un-replayable auth classes — and prove parity across all 7 providers plus the schema-lock invariant.
**Depends on**: Phase 31
**Requirements**: HEAL-01, HEAL-02, HEAL-03, HEAL-04, HEAL-05
**Success Criteria** (what must be TRUE):
  1. When a recipe breaks (4xx/5xx, empty, shape-mismatch, or `RECIPE_EXPIRED`), FSB falls back to DOM automation (DOM engine + site guides + `run_task`) and still completes the task.
  2. Recipes are stamped with captured-at and an expected-shape assertion; responses are validated against it to detect rot, emitting a typed `RECIPE_EXPIRED`, and a failure-detection taxonomy distinguishes "recipe broken" from a legitimate "no results" so fallback never masks a real outcome.
  3. A broken recipe is quarantined/demoted and the task is re-learned where possible.
  4. Capability and fallback paths pass tests across all 7 providers (INV-03) and a schema-lock parity test (INV-01).
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 26 → 27 → 28 → 29 → 30 → 31 → 32 (decimal insertions, if any, run between their surrounding integers).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 26. Recipe Schema + Bundled Interpreter + MV3 CI Guard | 3/3 | Complete    | 2026-06-20 |
| 27. Authenticated Fetch Primitive + Origin-Pin + Resume-Sidecar | 3/3 | Complete    | 2026-06-20 |
| 28. Lean MCP Surface + Capability Search + Eval Harness | 4/4 | Complete    | 2026-06-21 |
| 29. Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | 1/5 | In Progress|  |
| 30. Consent Governance + Recipe Signature Verification + Audit + Legal Posture | 0/TBD | Not started | - |
| 31. Network-Capture Discovery + Recipe Synthesis + Learned Recipes | 0/TBD | Not started | - |
| 32. Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | 0/TBD | Not started | - |

## Completed Milestones

<details>
<summary>v0.12.0 PhantomStream Package Migration — COMPLETED 2026-06-17</summary>

Archive files:

- `.planning/milestones/v0.12.0-ROADMAP.md`
- `.planning/milestones/v0.12.0-REQUIREMENTS.md`
- `.planning/milestones/v0.12.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.12.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 21 | Package Intake & Contract Mapping | 3/3 | Complete |
| 22 | Capture Adapter Migration | 4/4 | Complete |
| 23 | Dashboard Renderer Migration | 4/4 | Complete |
| 24 | Transport, Relay & Remote Control Integration | 4/4 | Complete |
| 25 | Parity Removal, Docs & Browser UAT | 4/4 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live Chrome-extension dashboard preview and remote-control UAT remains `human_needed`; see `.planning/milestones/v0.12.0-phases/25-parity-removal-docs-browser-uat/25-HUMAN-UAT.md`.

</details>

<details>
<summary>v0.11.0 Trigger Tool (Reactive DOM Monitoring) — COMPLETED 2026-06-17</summary>

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 14 | Trigger Survivability Foundation | 3/3 | Complete |
| 15 | Fire-Condition Engine & Value Extraction | 3/3 | Complete |
| 16 | Live-Observe Watch & Analyzing Pulse | 4/4 | Complete |
| 17 | Refresh-Poll Watch (Tab-Owning Background Reload) | 4/4 | Complete |
| 18 | Shared Tool Registry & Dispatcher Wiring | 4/4 | Complete |
| 19 | MCP Tools & Blocking/Detached Reporting | 3/3 | Complete |
| 20 | Integration, Cap UI, Docs & Edge Cases | 5/5 | Complete; human UAT debt recorded |

Known deferred closeout evidence: live-browser/composed trigger UAT remains `human_needed`; publish/tag/release actions remain user-gated.

</details>

<details>
<summary>v0.10.0 Autopilot via Lattice SDK (Phases 01-13) — SHIPPED 2026-06-15</summary>

Archive files:

- `.planning/milestones/v0.10.0-ROADMAP.md`
- `.planning/milestones/v0.10.0-REQUIREMENTS.md`
- `.planning/milestones/v0.10.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.10.0-phases/`

Phase summary:

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 01 | Lattice SDK gap survey + integration scaffolding | 2/2 | Complete |
| 02 | Lattice tripwire + receipt primitives extension | 5/5 | Complete |
| 03 | Observability + step-markers extension | 3/3 | Complete |
| 04 | Provider adapter alignment | 5/5 | Complete |
| 05 | MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host | 6/6 | Complete |
| 06 | FSB engine consumes Lattice provider abstraction | 7/7 | Complete |
| 07 | Archive FSB custom provider stack | 4/4 | Complete |
| 08 | FSB agent brain on Lattice runtime | 3/3 | Complete |
| 09 | FSB SurvivabilityAdapter activated for MV3 SW eviction resumption | 3/3 | Complete |
| 10 | MCP-philosophy parity for autopilot driver | 3/3 | Complete |
| 11 | Tab-aware side panel surface | 5/5 | Complete |
| 12 | Side panel follows automation | 5/5 | Complete |
| 13 | Public Lattice package integration | 1/1 | Complete |

Known deferred closeout evidence: 11 human-gated Chrome MV3/UAT verification items were acknowledged at close. See `.planning/STATE.md` `## Deferred Items`.

</details>

## Carry-Forward Candidates

- **Consolidated Chrome MV3 UAT debt:** Run and capture archived v0.10/v0.11/v0.12 browser evidence if release policy requires post-close proof.
- **Delegation primitive:** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces.
- **FSB-side tripwire band adapter:** Carry forward the `FINT-MM..K` placeholder from archived requirements.
- **Sidepanel Agent State Inspector:** Carry forward the `FINT-LL..P` placeholder from archived requirements.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
