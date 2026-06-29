# Roadmap: FSB (Full Self-Browsing)

## Milestones

- ✅ **v1.0.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43, shipped 2026-06-29. Full OpenTabs-derived catalog/search/discovery surface: 2,314 descriptors across 128 app stems / 129 services; 26 T1/T1b descriptors today; 2,288 descriptors intentionally remain DOM/discovery-tail. Archive: `.planning/milestones/v1.0.0-ROADMAP.md`.
- ✅ **v1.1.0 T1 App Execution Expansion** — Phases 44-50, CODE-COMPLETE 2026-06-29. Expanded proven T1/guarded coverage from 26 to 50 descriptors: 45 executable direct descriptors, 5 guarded fail-closed writes, and an honest next-batch backlog for the remaining 2,264-descriptor catalog tail.

## Active Milestone

**v1.1.0 T1 App Execution Expansion** — Phases 44-50. CODE-COMPLETE 2026-06-29.

**Milestone Goal:** Move FSB from “128 apps are catalog/search/routing supported” toward “apps are directly executable through `invoke_capability` where technically and safely provable.” The milestone is focused only on T1 readiness: identifying which of the 2,288 remaining T3 descriptors can become T1, building the missing execution substrate for same-origin and separate-origin apps, porting high-value read paths first, and activating writes only after live mutation-body UAT. It must not overclaim all-app direct API readiness without per-app proof.

**Baseline entering this milestone:**

- Total descriptors: **2,314**.
- T1/T1b today: **26 descriptors** across GitHub, GitLab, Notion, Reddit, and Slack.
- Actually executable/recipe-backed today: **21 descriptors**.
- T1 fail-closed guarded writes today: **5 descriptors**.
- Remaining T3 DOM/discovery-tail descriptors: **2,288** (**1,614 read**, **508 write**, **166 destructive**).
- App stems with no direct T1 path: **123**.

**Hard invariants:**

- Keep the two-tool MCP surface: `search_capabilities` and `invoke_capability`; do not add one tool per app.
- Preserve MV3 Wall 1: descriptors and recipes are closed-vocabulary data; no OpenTabs runtime/plugin code ships.
- Preserve Wall 2 unless explicitly extended by a verified Pattern-D design: credentialed execution stays origin-pinned and same-session.
- Writes and destructive actions stay fail-closed until live request shape, consent behavior, and no-secret logging are proven.
- Denylisted origins remain blocked; sensitive origins stay flagged/audited and apply the current invoke/discovery consent semantics.
- Search must distinguish “directly invocable T1” from “discovery-pending DOM/T2.” No UI/API overclaiming.

## Phase 44: T1 Readiness Inventory + Status Surface

- [x] Phase 44: T1 Readiness Inventory + Status Surface (completed 2026-06-29)

**Goal:** Create the authoritative T1 readiness matrix for all 2,314 descriptors and make status visible to developers and users so “catalog supported” is never confused with “direct API-ready.”

**Depends on:** v1.0.0 archive.

**Requirements:** T1R-01, T1R-02, T1R-03.

**Success Criteria:**
1. A generated readiness report classifies every descriptor by app, slug, side-effect class, current tier, backing, origin class, auth pattern, likely same-origin/separate-origin route, and recommended next action.
2. `search_capabilities`, docs, and any relevant UI copy distinguish T1-ready, fail-closed, learn-pending, and DOM/discovery-pending states without stale overclaims.
3. CI fails if a descriptor is marked T1-ready without a registered handler/recipe plus tests.

**Plans:**
- [x] 44-01: T1 readiness matrix generator and evidence report.
- [x] 44-02: Status-surface and documentation honesty pass.
- [x] 44-03: T1 readiness CI guard and phase closeout.

## Phase 45: T1 Porting Scaffold + Handler Contract Hardening

- [x] Phase 45: T1 Porting Scaffold + Handler Contract Hardening (completed 2026-06-29)

**Goal:** Build the reusable test and implementation scaffold for app ports so each new T1 handler has origin-pin, logged-out guard, shape guard, no-secret logging, consent classification, and byte-stable fallback behavior by default.

**Depends on:** Phase 44.

**Requirements:** T1R-04, T1R-05, T1R-09.

**Success Criteria:**
1. A handler/recipe port template and generator or checklist exists for same-origin reads, same-origin writes, and separate-origin candidates.
2. Shared tests can be applied to every new T1 port: origin match, executeBoundSpec-only, no token/log leak, logged-out body rejected, expected shape guard, and router parity.
3. The fail-closed guarded-write harness is generalized so write/destructive ports cannot accidentally execute before UAT evidence is recorded.

**Plans:**
- [x] 45-01: Port contract library and scaffold CLI.
- [x] 45-02: Current-catalog contract verifier.
- [x] 45-03: Documentation and phase closeout.

## Phase 46: Same-Origin Read Ports — First High-Value Batch

- [x] Phase 46: Same-Origin Read Ports — First High-Value Batch (completed 2026-06-29)

**Goal:** Convert a first batch of high-value read descriptors from T3 to executable T1 where the app’s authenticated web runtime uses same-origin APIs and can be proven without weakening Wall 2.

**Depends on:** Phase 45.

**Requirements:** T1R-06.

**Success Criteria:**
1. At least 10 additional read descriptors across multiple apps become executable T1/T1b with passing handler tests and live-smoke notes where credentials are available.
2. Candidate apps are selected from the readiness matrix by same-origin feasibility, user value, and low side-effect risk.
3. Each new read port preserves existing descriptor metadata and search ranking while flipping backing/status honestly.

**Plans:**
- [x] 46-01: Candidate selection and Netlify/Bitbucket/CircleCI handler ports.
- [x] 46-02: Catalog wiring, search readiness, and same-origin classifier gates.
- [x] 46-03: Verification, UAT notes, and phase closeout.

## Phase 47: Pattern-D + GAPI Bridge Architecture

- [x] Phase 47: Pattern-D + GAPI Bridge Architecture (completed 2026-06-29)

**Goal:** Design and prove the missing architecture for apps whose useful APIs are separate-origin, per-org-subdomain, or page-bridge mediated, without breaking the active-tab credential boundary.

**Depends on:** Phase 45.

**Requirements:** T1R-07, T1R-08.

**Success Criteria:**
1. A Pattern-D execution design is implemented or explicitly rejected for separate-origin app APIs such as Linear, Datadog/Jira per-org subdomains, Supabase, and cloud consoles.
2. A Google Workspace GAPI bridge spike determines whether Docs/Drive/Calendar can be handled through `window.gapi.client.request` safely.
3. Negative-control tests prove unverified cross-origin ports fail closed and cannot bypass origin/consent gates.

**Plans:**
- [x] 47-01: Pattern-D decision for separate-origin and per-org APIs.
- [x] 47-02: GAPI bridge decision for Google Workspace APIs.
- [x] 47-03: CI gate, negative controls, and closeout.

## Phase 48: High-Value Read Ports — Second Batch

- [x] Phase 48: High-Value Read Ports — Second Batch (completed 2026-06-29)

**Goal:** Use the Phase 47 outcome to port another batch of read descriptors, including Pattern-D/GAPI candidates if the architecture is proven.

**Depends on:** Phases 46 and 47.

**Requirements:** T1R-06, T1R-07, T1R-08.

**Success Criteria:**
1. A second batch of read descriptors becomes executable T1/T1b using either same-origin handlers, declarative recipes, Pattern-D, or GAPI bridge paths.
2. The coverage report shows a measurable increase in apps with at least one executable read path.
3. Apps still unsuitable for T1 are documented with the reason: denied, ToS-sensitive, auth unavailable, cross-origin unsafe, or live-UAT missing.

**Plans:**
- [x] 48-01: Vercel same-origin read head.
- [x] 48-02: CircleCI same-origin read expansion.
- [x] 48-03: Gate, search, and readiness-report closeout.

## Phase 49: Guarded Writes Activation Pipeline

- [x] Phase 49: Guarded Writes Activation Pipeline (completed 2026-06-29)

**Goal:** Turn fail-closed write/destructive candidates into executable T1 only after live mutation-body capture, consent gate verification, and redacted audit proof.

**Depends on:** Phases 44-48.

**Requirements:** T1R-10, T1R-11.

**Success Criteria:**
1. Existing fail-closed writes are either activated with live evidence or remain explicitly fail-closed with current reasons.
2. A reusable live UAT template records method/path/body shape, CSRF/token location, Chrome/extension version, and redacted outcome without storing secrets.
3. At least one low-risk write activation is completed end-to-end, or the milestone explicitly records why no write met the safety bar.

**Plans:**
- [x] 49-01: Write activation evidence ledger.
- [x] 49-02: Evidence verifier and validation gate.
- [x] 49-03: Live-UAT template and closeout decision.

## Phase 50: T1 Expansion Gate + Next-Batch Plan

- [x] Phase 50: T1 Expansion Gate + Next-Batch Plan (completed 2026-06-29)

**Goal:** Close the milestone with an honest T1 coverage gate, full regression suite, and a prioritized backlog for the remaining 2,288-descendant tail.

**Depends on:** Phase 49.

**Requirements:** T1R-12.

**Success Criteria:**
1. Full `npm test` and `npm run validate:extension` pass with the expanded T1 set.
2. The readiness report is regenerated and checked into the milestone evidence with before/after counts.
3. The next T1 batch is ranked by value, feasibility, and risk; no “all apps are T1-ready” claim is made unless every relevant descriptor has executable proof.

**Plans:**
- [x] 50-01: Regenerate readiness evidence and closeout counts.
- [x] 50-02: Full regression gate.
- [x] 50-03: Next-batch backlog and milestone closeout.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 44. T1 Readiness Inventory + Status Surface | 3/3 | Complete | 2026-06-29 |
| 45. T1 Porting Scaffold + Handler Contract Hardening | 3/3 | Complete | 2026-06-29 |
| 46. Same-Origin Read Ports — First High-Value Batch | 3/3 | Complete | 2026-06-29 |
| 47. Pattern-D + GAPI Bridge Architecture | 3/3 | Complete | 2026-06-29 |
| 48. High-Value Read Ports — Second Batch | 3/3 | Complete | 2026-06-29 |
| 49. Guarded Writes Activation Pipeline | 3/3 | Complete | 2026-06-29 |
| 50. T1 Expansion Gate + Next-Batch Plan | 3/3 | Complete | 2026-06-29 |

## Completed Milestones

<details>
<summary>v1.0.0 Full App Catalog (OpenTabs Parity) — Phases 35-43, SHIPPED 2026-06-29</summary>

Archive files:

- `.planning/milestones/v1.0.0-ROADMAP.md`
- `.planning/milestones/v1.0.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v1.0.0-phases/`

Outcome: full OpenTabs-derived catalog/search/discovery surface shipped with 2,314 descriptors across 128 app stems / 129 services. The milestone deliberately fed the existing tier model rather than hand-porting every action: 26 descriptors resolve to T1/T1b today, 5 guarded writes remain fail-closed, and 2,288 descriptors remain T3 DOM/discovery-tail. Full milestone audit passed; non-blocking live UAT and T1 expansion debt are carried forward.

</details>



<details>
<summary>v0.9.99 Native Capability Catalog (FSB API Execution) — Phases 26-34, CODE-COMPLETE 2026-06-23</summary>

Gave FSB first-class authenticated-API execution as a fast path alongside DOM automation, between Wall 1 (closed-vocabulary recipe DATA bound by a fixed interpreter) and Wall 2 (MAIN-world authenticated fetch). Full `npm test` EXIT 0; live-browser UAT debt (UAT-27/29/30/31/32-01) carried forward. The v1.0.0 milestone extends this substrate verbatim.

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 26 | Recipe Schema + Bundled Interpreter + MV3 CI Guard | 3/3 | Complete |
| 27 | Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar | 3/3 | Complete; live FETCH-05 UAT human_needed |
| 28 | Lean MCP Surface + Capability Search + Eval Harness | 4/4 | Complete |
| 29 | Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | 5/5 | Complete; live-capture UAT human_needed |
| 30 | Consent Governance + Recipe Signature Verification + Audit + Legal Posture | 4/4 | Complete; live smoke human_needed |
| 31 | Network-Capture Discovery + Recipe Synthesis + Learned Recipes | 6/6 | Complete; live UAT human_needed |
| 32 | Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | 5/5 | Complete; live self-heal UAT human_needed |
| 33 | PhantomStream Media Mirroring (0.2.1 Uptake) — milestone extension | 1/1 | Complete; live media UAT human_needed |
| 34 | Explicit File Upload Tool (upload_file) — milestone extension | 1/1 | Complete; live upload UAT human_needed |

Substrate carried into v1.0.0 (FIXED — do not redesign): tiers T0/T1a/T1b/T2-learned/T3-DOM; the closed-vocab interpreter; the consent gate (opt-out Auto default, denylist = the ONE hard floor); the 2 out-of-`TOOL_REGISTRY` MCP tools; `capability-catalog.js resolve()` / `capability-router.js invoke()` / `capability-search.js buildIndex()`; `scripts/package-extension.mjs readJsonDir` + the generated `recipe-index.generated.js` IIFE; the `github.js` T1a hand-port contract; `service-denylist.js` loader; `network-capture.js` discovery path; `verify-recipe-path-guard.mjs` Wall-1 guard.

</details>

<details>
<summary>v0.12.0 PhantomStream Package Migration — Phases 21-25, COMPLETED 2026-06-17</summary>

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
<summary>v0.11.0 Trigger Tool (Reactive DOM Monitoring) — Phases 14-20, COMPLETED 2026-06-17</summary>

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

- **Consolidated Chrome MV3 UAT debt:** Run and capture archived v0.10/v0.11/v0.12 + v0.9.99 (UAT-27/29/30/31/32-01) browser evidence if release policy requires post-close proof. v1.0.0 does NOT block on it.
- **v2 deferred capability families (acknowledged, out of v1.0.0):** GAPI-01 (gapi-bridge handler family for Google Workspace via the `window.gapi.client.request` trampoline); CLOUD-01 (cloud-console Pattern-D ports — aws-console/azure/google-cloud/terraform-cloud — pending per-app CORS verification); UATX-01 (per-app live guarded-write UAT closeout across the hand-ported depth tier).
- **Delegation primitive:** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
