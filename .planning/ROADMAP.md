# Roadmap: FSB (Full Self-Browsing)

> **Historical-scope note (2026-07-15):** The Phase 54 dashboard-exclusion
> entries below preserve the completed v1.2.0 roadmap. A later showcase
> localization follow-up superseded that policy by localizing the dashboard and
> removing its lint exclusion. Current policy lives in
> `showcase/angular/src/locale/I18N-BOUNDARIES.md`.

## Milestones

- 🚧 **v1.0.0 Jev Fast Mode** — Phases 66-71, planned 2026-09-28. Establish a whole-task speed and quality baseline, add FSB-hosted Jev with the credential held on the server, expose one opt-in switch in Advanced Settings, add an MCP tool to view and change settings, use bounded autopilot and MCP fast paths, shorten existing MCP tool descriptions, and release the extension as 1.0.0 only with honest comparative evidence.
- ✅ **v0.9.91 MCP Clients as Providers** — Phases 57-65, shipped 2026-09-28. Installed agent CLIs (Claude Code, OpenCode, Codex) became key-less side-panel providers that drive the live browser through FSB's own MCP tools. Archive: `.planning/milestones/v0.9.91-ROADMAP.md`.
- ✅ **v1.2.0 Showcase i18n Completeness** — Phases 52-56, shipped 2026-07-09. Archive: `.planning/milestones/v1.2.0-ROADMAP.md`. Closes the translation gap that reopened after v0.9.63 shipped: a full-page audit establishes the true drift/missing scope, resync + stats-page translation + transcreation review close it, a CI drift-detection gate lands on the clean baseline, and the long-deferred WARNING-02 locale-cookie redirect bug is fixed.
- ✅ **v1.1.0 T1 App Execution Expansion** — Phases 44-51, shipped 2026-06-30; refreshed 2026-07-01 after post-closeout T1 ports. Expanded proven T1/guarded coverage from 26 baseline descriptors to 1,267 executable T1-ready descriptors plus 556 guarded fail-closed rows, and closed the remaining catalog tail with explicit terminal-state accounting. Archive: `.planning/milestones/v1.1.0-ROADMAP.md`.
- ✅ **v0.13.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43, shipped 2026-06-29. Full OpenTabs-derived catalog/search/discovery surface: 2,314 descriptors across 128 app stems / 129 services; 26 T1/T1b descriptors today; 2,288 descriptors intentionally remain DOM/discovery-tail. Archive: `.planning/milestones/v0.13.0-ROADMAP.md`.

## Current Milestone: v1.0.0 Jev Fast Mode

**Milestone goal:** Make FSB measurably faster on complete autopilot and MCP tasks by delegating bounded simple decisions to Jev while preserving the LLM's planning and writing roles and FSB's existing action and safety boundaries.

**Scope:** 25 requirements in `.planning/REQUIREMENTS.md`, across Phases 66-71 plus the inserted Phase 66.1; numbering continues after the completed v0.9.91 milestone. The existing Phase 999.1 is a completed historical backlog item outside this milestone.

**Compatibility:** With Jev disabled, FSB behaves exactly as it did before this milestone (owner direction, 2026-09-29).

**Provider decision:** FSB supplies Jev to every installation without user sign-in or usage quotas for now. The upstream credential stays on `showcase/server/` (or its server-side secret store); the extension never receives it. A bounded HTTPS gateway carries redacted decision state and monitors aggregate usage and cost. The only fast-mode setting is the control-panel Advanced Settings switch, default off. MCP `run_task` follows it, and the MCP settings tool (Phase 66.1) reads and writes that same value. The server round trip is included in all speed measurements.

**Release evidence:** Compare whole-task completion, wall time per completed task, and cost on the same task set. The project brief's 1.5-2x autopilot and 1.3-1.6x MCP speedups are targets to measure, not results already achieved. A path that fails its predeclared gate remains experimental or disabled.

### Phase 66: Baseline and Session Timing

**Goal:** Establish trustworthy timing and task-outcome records before any Jev path changes execution.
**Depends on:** None.
**Requirements:** MEAS-01, MEAS-02, MEAS-03.
**Success Criteria:**

1. An operator can see per-call wall, FSB execution, and model time, plus tokens and cost where available, for MCP and autopilot sessions; absent values are explicit.
2. Journal-backed MCP sessions resolve to session details with tool-call timing rather than an empty or broken lookup.
3. A reproducible suite runs representative mixed and click-heavy tasks, verifies outcomes from page evidence, and saves completion, wall-time, and cost baselines before fast mode is enabled.
4. The suite records enough task and environment identity to compare later runs without counting Jev's own completion answer as proof.

**Plans:** 11 plans in 6 waves

Plans:
**Wave 1**

- [x] 66-01-PLAN.md — Export the 2026-09-16..21 MCP sessions (H1) and commit sanitized history metrics (wave 1, human) (closed 2026-10-12: source data lost, not executed)
- [x] 66-02-PLAN.md — Install the worktree, record the start-commit test and regression-sweep baselines, add bench statistics, outcome and identity libraries (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 66-03-PLAN.md — MCP call timing at ingress through recorder and journal, text-export timing, allowlisted fsb://config identity (wave 2)
- [x] 66-04-PLAN.md — Autopilot model and tool timing, provider-first cost labels, grok-4.3 price rows, history persistence (wave 2)
- [x] 66-05-PLAN.md — Bench task schema, loopback fixture server, Claude Code and Cursor stream parsers (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 66-06-PLAN.md — Journal-backed get_session_detail with sanitized timing rows and a filter-proof measurement block (wave 3)
- [x] 66-07-PLAN.md — Frozen 12-task core corpus (6 mixed, 6 click-heavy), live reading set, corpus lock and self-check (wave 3)
- [x] 66-08-PLAN.md — Benchmark runner (preflight, ABBA schedule, per-run saves, CDP pairing), arm drivers, baseline report (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 66-09-PLAN.md — Register bench suites in the test chain; full-chain, Node 20, timing and mcp/ audits (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 66-10-PLAN.md — Bench profile setup (H2/H3), CDP pairing, preflight, all-task smoke and live smoke, live operator timing check (wave 5, human)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 66-11-PLAN.md — Approved baseline campaign (H4), committed sanitized results, restore (H5) (wave 6, human)

### Phase 66.1: MCP Settings Tool (INSERTED)

**Goal:** Let an MCP client view FSB's control-panel settings and change one setting at a time through a single new tool, without exposing secrets or changing behavior for existing callers or autopilot.
**Depends on:** Phase 66 (the baseline records the MCP tool list before this phase changes it).
**Requirements:** SET-01, SET-02.
**Success Criteria:**

1. One new MCP tool returns every control-panel setting as compact key-value data in a single call, and changes one setting by key in a single call.
2. Secret values (API keys, hash keys, and credential and payment data) are masked on read and refused on write. Every other setting is writable, as the owner chose on 2026-09-29.
3. A write goes through the control panel's own validation and storage, so the control panel, autopilot, and `run_task` all see the new value. An invalid key or value returns a typed error and changes nothing.
4. The Jev fast-mode switch becomes reachable through the same tool once Phase 68 adds it. It stays one stored value shared with Advanced Settings.
5. Only MCP clients get the tool. The autopilot model's tool list and prompt are unchanged, and existing tool names, arguments, and responses stay byte-stable.

**Open questions for discussion:**

- Should endpoint settings that receive API keys or page data (custom endpoint, sync server URL, LM Studio URL) count as secrets?
- Should settings changed over MCP be logged for the operator?

**Plans:** Not planned.

### Phase 67: Hosted Jev Gateway, Policy, and Shadow Mode

**Goal:** Provide version-pinned Jev through an FSB-owned server credential and a bounded, installation-associated HTTPS decision path; validate safe inputs, accounting, fallback, and calibration before live control.
**Depends on:** Phase 66 (baseline and labelled task records).
**Requirements:** JEV-01, JEV-02, JEV-03, JEV-04, JEV-05, JEV-06, JEV-07.
**Success Criteria:**

1. The FSB server holds the upstream Jev credential in server-side secret storage, calls a pinned model, and returns typed decisions; no extension bundle, message, response, or storage record contains that credential, and users enter no Jev or OpenRouter key.
2. The HTTPS decision route is available to every install without sign-in or usage quotas. It validates a fixed bounded schema, limits body size and concurrent upstream work, records aggregate usage and FSB-borne cost, and supports an operator-wide disable switch. The existing self-issued hash key may identify a caller but is not treated as a secret protecting the Jev credential.
3. Extension and server validation exclude secrets and sensitive form values, treat page content as data, and avoid raw request-body or credential logging across success and error paths.
4. Timeout, rate-limit, invalid-response, unavailable-model, and key errors produce typed fallback results; actual model version, usage, and FSB-borne cost are recorded where supplied, without fabricated values.
5. Shadow runs on labelled tasks produce operation, target, completion, stuck, and risk accuracy by confidence bucket; live thresholds are selected from that evidence and tied to the pinned model. Tests prove Jev cannot remove confirmation or bypass existing safety breakers.

**Plans:** Not planned.

### Phase 68: Autopilot Fast Mode

**Goal:** Add opt-in, bounded Jev decisions for simple autopilot steps while the LLM handles planning, text, reading, and uncertain work.
**Depends on:** Phase 67 (safe provider and calibrated thresholds).
**Requirements:** AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05.
**Success Criteria:**

1. A user can enable or disable fast mode in control-panel Advanced Settings or through the Phase 66.1 settings tool, which changes the same stored value; the default is off, the setting explains the bounded FSB-to-Jev page-context transfer, and an ordinary task with it off follows the existing autopilot path.
2. On a supported simple step, Jev chooses only among operations and current elements offered by FSB; FSB rechecks target freshness and executes through its existing action machinery.
3. Planning, generated text, extraction, unsupported steps, and below-threshold decisions route to the LLM without the Jev loop fabricating arguments or page understanding.
4. Completion and stuck decisions are checked against observable page evidence; action, request, and wall-clock budgets stop repeated or runaway loops with a truthful outcome.
5. Ambiguous, changed, or failed decisions escalate once to the existing path or stop as blocked, with no duplicated side effect or weakened confirmation.

**Plans:** Not planned.

### Phase 69: MCP Descriptions and Same-Call Checks

**Goal:** Cut MCP tool-list context and avoid follow-up verification calls through additive optional expectations.
**Depends on:** Phase 66 (tool-call measurement baseline).
**Requirements:** MCP-01, MCP-02, MCP-04.
**Success Criteria:**

1. All 73 existing tool descriptions are shortened and a repeatable token-count check shows the aggregate tool-list reduction against the Phase 66 baseline while preserving action and safety guidance.
2. Supported action tools accept an optional `expect` and report verified, unmet, or uncertain effects within the same call using a bounded post-action observation.
3. Contract tests prove existing tool names, required arguments, default behavior, and serialized wire shapes remain unchanged when `expect` is omitted.
4. A representative MCP caller can complete an action and read its effect without an extra verification call when the outcome is observable.

**Plans:** Not planned.

### Phase 70: Bounded MCP Fast Task

**Goal:** Let the existing `run_task` use the bounded Jev fast loop when the extension's Advanced Settings switch is enabled.
**Depends on:** Phases 67, 68, and 69 (provider policy, fast-loop mechanics, and additive contract gate).
**Requirements:** MCP-03.
**Success Criteria:**

1. Existing `run_task` reads the extension's Advanced Settings switch and uses a bounded action, Jev-call, and wall-clock budget only when enabled; it has no separate fast-mode argument or toggle.
2. The MCP result distinguishes done, ambiguous, blocked, and needs-confirmation using verified effects and task state, not Jev's answer alone.
3. Provider failures, uncertain targets, and safety gates exit through typed fallback or escalation without duplicate side effects.
4. Existing MCP clients continue to parse responses and invoke tools without any new required argument or new tool.

**Plans:** Not planned.

### Phase 71: Comparative Gate and Release

**Goal:** Compare full-task outcomes, decide which fast paths merit release, and version the extension and MCP package honestly.
**Depends on:** Phases 66-70.
**Requirements:** EVAL-01, EVAL-02, REL-01, REL-02.
**Success Criteria:**

1. The same outcome-checked corpus compares baseline, fast mode, and a non-Jev control on completion rate, wall time per completed task, and cost, with uncertainty and failure cases included.
2. A predeclared gate reports pass or fail for speed, success, and safety; any failing path remains experimental or disabled and no per-decision timing is presented as whole-task speedup.
3. `CHANGELOG.md` has a v1.0.0 entry before `npm run version:set:extension -- 1.0.0` succeeds, and product version checks agree across extension surfaces.
4. The MCP package receives its planned minor bump for optional `expect` and the approved settings tool, with compatibility checks for existing callers and no unreviewed tool additions.

**Plans:** Not planned.

## Completed Milestones

<details>
<summary>v0.9.91 MCP Clients as Providers — Phases 57-65, SHIPPED 2026-09-28</summary>

**Milestone Goal:** Make installed agent CLIs (Claude Code first) first-class side-panel providers that FSB detects, presents key-less in a Providers panel, and delegates tasks to, with the spawned CLI driving the browser back through FSB's own MCP tools.

**Phase summary:**

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 57 | Agent Identity Capture | 3/3 | Complete |
| 58 | Providers Panel | 3/3 | Complete |
| 59 | Reverse-Request Channel & Security Foundation | 4/4 | Complete |
| 60 | Adapter Contract & Claude Code MVP | 4/4 | Complete |
| 61 | Delegation UX & SW-Eviction Persistence | 8/8 | Complete |
| 62 | CI Drift-Smoke Gate & Doctor Extensions | 6/6 | Complete |
| 63 | Native-Messaging Host | 12/12 | Complete |
| 64 | OpenCode Adapter | 13/13 | Complete |
| 65 | Codex Adapter | 8/8 | Complete |

Archive files:

- `.planning/milestones/v0.9.91-ROADMAP.md`
- `.planning/milestones/v0.9.91-REQUIREMENTS.md`
- `.planning/milestones/v0.9.91-phases/`

Outcome: 51/51 requirements complete with green automated/source verification. The 48 deferred live UAT scenarios were closed at the user's direction on 2026-09-28 as waived, not executed; see `.planning/STATE.md` `## Deferred Items`.

</details>

<details>
<summary>v1.2.0 Showcase i18n Completeness — Phases 52-56, SHIPPED 2026-07-09</summary>

**Milestone Goal:** Close the translation gap that reopened after v0.9.63 shipped -- full, drift-free coverage across all six supported locales (en, es, de, ja, zh-CN, zh-TW) for every showcase marketing page plus the stats page, the long-deferred locale-cookie redirect bug, and a CI gate that catches future drift automatically.

**Phase summary:**

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 52 | Full-Page Translation Completeness Audit | 1/1 | Complete |
| 53 | Trans-Unit Resync, Stats Translation & Transcreation Review | 3/3 | Complete; VISUAL-01 human_needed |
| 54 | Stats Lint Gate Flip & Dashboard Boundary Documentation | 1/1 | Complete |
| 55 | CI Drift-Detection Gate | 1/1 | Complete |
| 56 | Locale-Cookie Redirect Fix (WARNING-02) | 1/1 | Complete |

Archive files:

- `.planning/milestones/v1.2.0-ROADMAP.md`
- `.planning/milestones/v1.2.0-REQUIREMENTS.md`
- `.planning/v1.2.0-MILESTONE-AUDIT.md`

Outcome: 13/13 v1.2.0 requirements satisfied; audit passed. Phase 52's audit established the true 5-drifted/54-orphaned baseline, superseding the milestone brief's original "247 trans-units" estimate. Phase 53 resynced the 5 drifted units + retired the stats-274 JSON artifacts + transcreated the 19 hero/CTA strings across 5 non-en locales. Phase 54 flipped `lint:i18n` to cover stats and documented the dashboard exclusion as permanent. Phase 55 landed `verify-translation-drift.mjs` as a hard-fail CI gate on a clean drift-free baseline. Phase 56 fixed WARNING-02's picker-cookie short-circuit on the bare-`/` Accept-Language redirect. VISUAL-01 browser UAT remains `human_needed` (`53-VISUAL-QA.md`).

</details>

<details>
<summary>v1.1.0 T1 App Execution Expansion — Phases 44-51, SHIPPED 2026-06-30</summary>

**Hard invariants (v1.1.0):**

- Kept the two-tool MCP surface: `search_capabilities` and `invoke_capability`; no one tool per app.
- Preserved MV3 Wall 1: descriptors and recipes are closed-vocabulary data; no OpenTabs runtime/plugin code ships.
- Preserved Wall 2 unless explicitly extended by a verified Pattern-D design: credentialed execution stays origin-pinned and same-session.
- Writes and destructive actions stayed fail-closed until live request shape, consent behavior, and no-secret logging were proven.
- Denylisted origins remained blocked; sensitive origins stayed flagged/audited under the existing invoke/discovery consent semantics.
- Search distinguished "directly invocable T1" from "discovery-pending DOM/T2."

### Phase 44: T1 Readiness Inventory + Status Surface

**Goal:** Create the authoritative T1 readiness matrix for all 2,314 descriptors and make status visible to developers and users so "catalog supported" is never confused with "direct API-ready."
**Requirements:** T1R-01, T1R-02, T1R-03.
**Plans:**

- [x] 44-01: T1 readiness matrix generator and evidence report.
- [x] 44-02: Status-surface and documentation honesty pass.
- [x] 44-03: T1 readiness CI guard and phase closeout.

### Phase 45: T1 Porting Scaffold + Handler Contract Hardening

**Goal:** Build the reusable test and implementation scaffold for app ports so each new T1 handler has origin-pin, logged-out guard, shape guard, no-secret logging, consent classification, and byte-stable fallback behavior by default.
**Requirements:** T1R-04, T1R-05, T1R-09.
**Plans:**

- [x] 45-01: Port contract library and scaffold CLI.
- [x] 45-02: Current-catalog contract verifier.
- [x] 45-03: Documentation and phase closeout.

### Phase 46: Same-Origin Read Ports — First High-Value Batch

**Goal:** Convert a first batch of high-value read descriptors from T3 to executable T1 where the app's authenticated web runtime uses same-origin APIs and can be proven without weakening Wall 2.
**Requirements:** T1R-06.
**Plans:**

- [x] 46-01: Candidate selection and Netlify/Bitbucket/CircleCI handler ports.
- [x] 46-02: Catalog wiring, search readiness, and same-origin classifier gates.
- [x] 46-03: Verification, UAT notes, and phase closeout.

### Phase 47: Pattern-D + GAPI Bridge Architecture

**Goal:** Design and prove the missing architecture for apps whose useful APIs are separate-origin, per-org-subdomain, or page-bridge mediated, without breaking the active-tab credential boundary.
**Requirements:** T1R-07, T1R-08.
**Plans:**

- [x] 47-01: Pattern-D decision for separate-origin and per-org APIs.
- [x] 47-02: GAPI bridge decision for Google Workspace APIs.
- [x] 47-03: CI gate, negative controls, and closeout.

### Phase 48: High-Value Read Ports — Second Batch

**Goal:** Use the Phase 47 outcome to port another batch of read descriptors, including Pattern-D/GAPI candidates if the architecture is proven.
**Requirements:** T1R-06, T1R-07, T1R-08.
**Plans:**

- [x] 48-01: Vercel same-origin read head.
- [x] 48-02: CircleCI same-origin read expansion.
- [x] 48-03: Gate, search, and readiness-report closeout.

### Phase 49: Guarded Writes Activation Pipeline

**Goal:** Turn fail-closed write/destructive candidates into executable T1 only after live mutation-body capture, consent gate verification, and redacted audit proof.
**Requirements:** T1R-10, T1R-11.
**Plans:**

- [x] 49-01: Write activation evidence ledger.
- [x] 49-02: Evidence verifier and validation gate.
- [x] 49-03: Live-UAT template and closeout decision.

### Phase 50: T1 Expansion Gate + Next-Batch Plan

**Goal:** Close the milestone with an honest T1 coverage gate, full regression suite, and a prioritized backlog for the remaining 2,288-descendant tail.
**Requirements:** T1R-12.
**Plans:**

- [x] 50-01: Regenerate readiness evidence and closeout counts.
- [x] 50-02: Full regression gate.
- [x] 50-03: Next-batch backlog and milestone closeout.

### Phase 51: Full T1 Tail Migration Across Remaining Catalog

**Goal:** Convert the Phase 51 catalog-tail descriptors to explicit terminal states: executable T1/T1b where safe and technically provable, guarded fail-closed where write/destructive UAT is still required, or blocked where denylist/product/legal policy says no.
**Requirements:** T1ALL-01, T1ALL-02, T1ALL-03, T1ALL-04, T1ALL-05.
**Plans:**

- [x] 51-01: Full-tail worklist generator, acceptance gate, and batch scheduler.
- [x] 51-02: Existing-head and low-risk same-origin read bulk port.
- [x] 51-03: Retool CSRF same-origin read head.
- [x] 51-04: Asana same-origin Pattern-D carveout.
- [x] 51-05: Pattern-D and GAPI bridge implementation waves.
- [x] 51-06: Sensitive consumer/social and blocked-policy triage.
- [x] 51-07: Write/destructive live-UAT activation waves.
- [x] 51-08: Final all-tail regression, UAT ledger, and closeout.

Archive files:

- `.planning/milestones/v1.1.0-ROADMAP.md`
- `.planning/milestones/v1.1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.1.0-MILESTONE-AUDIT.md`

Outcome: v1.1.0 expanded proven direct execution from the v0.13.0 baseline into verified T1-ready read coverage across Netlify, Bitbucket, CircleCI, Vercel, Retool, Asana, and generated same-origin reads, with post-closeout ports reflected in the refreshed artifacts. Phase 51 closes the remaining catalog tail honestly: 1,267 rows are executable T1-ready, 556 rows are guarded fail-closed, and the remaining 491 descriptors are explicitly surfaced as bridge-needed, UAT-needed, blocked-policy, or degraded/discovery-pending rather than overclaimed.

</details>

<details>
<summary>v0.13.0 Full App Catalog (OpenTabs Parity) — Phases 35-43, SHIPPED 2026-06-29</summary>

Archive files:

- `.planning/milestones/v0.13.0-ROADMAP.md`
- `.planning/milestones/v0.13.0-REQUIREMENTS.md`
- `.planning/milestones/v0.13.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v0.13.0-phases/`

Outcome: full OpenTabs-derived catalog/search/discovery surface shipped with 2,314 descriptors across 128 app stems / 129 services. The milestone deliberately fed the existing tier model rather than hand-porting every action: 26 descriptors resolve to T1/T1b today, 5 guarded writes remain fail-closed, and 2,288 descriptors remain T3 DOM/discovery-tail. Full milestone audit passed; non-blocking live UAT and T1 expansion debt are carried forward.

</details>

<details>
<summary>v0.9.99 Native Capability Catalog (FSB API Execution) — Phases 26-34, CODE-COMPLETE 2026-06-23</summary>

Gave FSB first-class authenticated-API execution as a fast path alongside DOM automation, between Wall 1 (closed-vocabulary recipe DATA bound by a fixed interpreter) and Wall 2 (MAIN-world authenticated fetch). Full `npm test` EXIT 0; live-browser UAT debt (UAT-27/29/30/31/32-01) carried forward. The v0.13.0 milestone extends this substrate verbatim.

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

Substrate carried into v0.13.0 (FIXED — do not redesign): tiers T0/T1a/T1b/T2-learned/T3-DOM; the closed-vocab interpreter; the consent gate (opt-out Auto default, denylist = the ONE hard floor); the 2 out-of-`TOOL_REGISTRY` MCP tools; `capability-catalog.js resolve()` / `capability-router.js invoke()` / `capability-search.js buildIndex()`; `scripts/package-extension.mjs readJsonDir` + the generated `recipe-index.generated.js` IIFE; the `github.js` T1a hand-port contract; `service-denylist.js` loader; `network-capture.js` discovery path; `verify-recipe-path-guard.mjs` Wall-1 guard.

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

- **v0.9.91 v2 deferred (see `.planning/milestones/v0.9.91-REQUIREMENTS.md`):** CHAT-FUTURE-01/02 (chat-mode continuity via `--resume` / `codex resume` / `opencode --continue` + per-thread cwd pinning); GEMINI-FUTURE-01 (Gemini CLI adapter after live `--help` capture + JSONL schema pinning); ACP-FUTURE-01 (`@zed-industries/agent-client-protocol` unification once ≥2 non-Claude adapters have shipped); REMOTE-FUTURE-01 (remote/mobile delegation surfaces — v0.9.91 is explicitly localhost-only).
- **Consolidated Chrome MV3 UAT debt:** Closed 2026-09-28 — waived by the user at the v0.9.91 close, not executed (see `.planning/STATE.md` `## Deferred Items`).
- **v1.2.0 v2 deferred:** QA-01 (native-speaker/bilingual QA pass), I18N-FUTURE-01 (migrate stats page off ad hoc JSON mechanism into main XLIFF pipeline), I18N-FUTURE-02 (full automated per-locale visual regression pipeline), I18N-FUTURE-03 (translation-freshness/"last synced" reporting surface).
- **v2 deferred capability families (acknowledged, out of v0.13.0/v1.1.0):** GAPI-01 (gapi-bridge handler family for Google Workspace); CLOUD-01 (cloud-console Pattern-D ports); UATX-01 (per-app live guarded-write UAT closeout).
- **Delegation primitive (Lattice-owned):** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces after v0.9.91 stabilizes the adapter contract.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
