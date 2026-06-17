# Roadmap: FSB (Full Self-Browsing)

## Milestones

- **v0.10.0 Autopilot via Lattice SDK** — Phases 01-13, shipped 2026-06-15.
- **v0.11.0 Trigger Tool (Reactive DOM Monitoring)** — Phases 14-20, completed 2026-06-17; release actions and browser UAT remain user-gated.
- **v0.12.0 PhantomStream Package Migration** — Phases 21-25 (active).

## Overview v0.12.0 PhantomStream Package Migration

v0.12.0 replaces FSB's in-house Phantom Stream implementation with the extracted `fullselfbrowsing/PhantomStream` package. The existing code already has a working DOM-native live preview: content-side snapshot/diff capture, extension WebSocket routing, server relay, dashboard renderer, side channels, remote control, recovery watchdogs, and defensive stream-state diagnostics. The new milestone does not redesign the product surface; it moves ownership of the generic browser-mirroring engine into the reusable package while preserving FSB-specific pairing, task lifecycle, overlay identity, remote-control ownership, and dashboard state behavior.

The crux is package intake and parity. Initial planning referenced the stale unhyphenated package scope `@fullselfbrowsing/phantom-stream`, which returned npm 404 on 2026-06-17. Phase 21 Plan 01 corrected the approved source to the published `@full-self-browsing/phantom-stream@0.1.0` package with exact lockfile integrity. The rest of the milestone proceeds layer by layer: capture first, renderer second, transport/relay/remote-control third, then removal, docs, and real browser UAT.

## Phases

**Phase Numbering:**
- Integer phases continue from v0.11.0's Phase 20.
- Decimal phases remain reserved for urgent insertions.

- [x] **Phase 21: Package Intake & Contract Mapping** — Verify/install the PhantomStream package or approved immutable source; map the current FSB stream contracts to package exports before replacing code.
- [x] **Phase 22: Capture Adapter Migration** — Replace in-house content-side snapshot/diff capture with a thin adapter around PhantomStream capture primitives.
- [x] **Phase 23: Dashboard Renderer Migration** — Replace static and Angular dashboard diff/render logic with PhantomStream renderer-backed behavior while preserving the current preview state machine.
- [x] **Phase 24: Transport, Relay & Remote Control Integration** — Align WebSocket envelopes, relay behavior, stream recovery, and reverse remote-control mapping with PhantomStream-compatible protocol helpers.
- [ ] **Phase 25: Parity Removal, Docs & Browser UAT** — Remove duplicated in-house engines, update docs/tests, and close with automated plus live-browser stream verification.

## Phase Details

### Phase 21: Package Intake & Contract Mapping
**Goal**: FSB has an approved, pinned PhantomStream source and a precise contract map from current in-house stream behavior to package exports before any production replacement begins.
**Depends on**: v0.11.0 complete; current Phantom Stream implementation green.
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04
**Success Criteria**:
  1. `@full-self-browsing/phantom-stream` is installable from npm with exact version/integrity, and the stale unhyphenated `@fullselfbrowsing/phantom-stream` source is rejected.
  2. Package exports are verified in code/tests, not assumed from README: protocol, capture, renderer, and any relay/transport/adapters are listed with supported import paths.
  3. A stream-contract map documents every current FSB behavior that must survive: snapshot, mutation diffs, scroll, overlays, dialogs, stale-session rejection, compression, relay, recovery, and remote control.
  4. The phase blocks further migration if package availability, ESM/MV3 compatibility, or missing exports make a safe replacement impossible.
**Plans**: 3 plans
- [x] 21-01-PLAN.md — Package availability/provenance gate, lockfile strategy, and install-source decision.
- [x] 21-02-PLAN.md — Export/API smoke tests and ESM/MV3 bundling feasibility check.
- [x] 21-03-PLAN.md — FSB-to-PhantomStream contract map and migration invariants.

### Phase 22: Capture Adapter Migration
**Goal**: `extension/content/dom-stream.js` delegates generic capture mechanics to PhantomStream while retaining FSB-specific control messages, overlay exclusion, diagnostics, and readiness behavior.
**Depends on**: Phase 21
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04
**Success Criteria**:
  1. Starting a stream still emits an initial snapshot followed by rAF-batched diffs with session identity and snapshot identity attached.
  2. Pause/resume/stop, content-script reinjection, `pingDomStream`, stale-flush watchdog, scroll tracking, dialogs, and overlay broadcasts remain behaviorally compatible.
  3. Security/masking configuration is explicit and tested: passwords masked, dangerous URLs/scripts stripped, event handlers removed, and FSB overlays excluded.
  4. Existing capture-focused tests assert behavior through the adapter instead of depending on the old local implementation body.
**Plans**: 4 plans
- [x] 22-01-PLAN.md — Build capture adapter seam and preserve content-script control-message contract.
- [x] 22-02-PLAN.md — Port snapshot/diff/session/scroll behavior to PhantomStream capture primitives.
- [x] 22-03-PLAN.md — Port overlay/dialog side channels and capture diagnostics/watchdogs.
- [x] 22-04-PLAN.md — Security/masking parity and capture test rewrite.

### Phase 23: Dashboard Renderer Migration
**Goal**: Both dashboard surfaces render and update the live preview through PhantomStream renderer-backed behavior without drifting from today's state machine or side-channel UI.
**Depends on**: Phase 22
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04
**Success Criteria**:
  1. Static dashboard snapshot rendering/diff application is routed through a shared PhantomStream viewer wrapper.
  2. Angular dashboard uses the same wrapper or mirrored adapter contract, with source-contract tests preventing static/Angular drift.
  3. Preview states remain unchanged: loading, streaming, paused, disconnected, restricted, frozen-disconnect, frozen-complete, and error.
  4. Layout modes, iframe sandboxing, scaling, stale-message rejection, resync, overlays, progress/client badge, dialogs, and diagnostic tooltip counters still work.
**Plans**: 4 plans
- [x] 23-01-PLAN.md — Shared dashboard viewer wrapper around PhantomStream renderer.
- [x] 23-02-PLAN.md — Static dashboard migration and renderer behavior tests.
- [x] 23-03-PLAN.md — Angular dashboard migration and parity/source-contract tests.
- [x] 23-04-PLAN.md — Side-channel UI, frozen states, diagnostics, and visual regression smoke.

### Phase 24: Transport, Relay & Remote Control Integration
**Goal**: Stream transport, server relay, and reverse remote-control path are aligned with PhantomStream protocol helpers while preserving FSB's pairing, task traffic, room routing, and debugger ownership semantics.
**Depends on**: Phase 23
**Requirements**: RELAY-01, RELAY-02, RELAY-03, RELAY-04, CTRL-01, CTRL-02, CTRL-03
**Success Criteria**:
  1. Extension WebSocket stream payloads use PhantomStream-compatible protocol/envelope helpers without altering non-stream dashboard task/status messages.
  2. Server relay behavior is either package-backed or explicitly adapted, preserving hash-key room routing, extension/dashboard roles, message cap, diagnostics, and backpressure drop counter.
  3. Recovery paths remain green: dashboard reconnect, extension reconnect, service-worker alarm, content late readiness, parked stream-start re-arm, and watchdog snapshot request.
  4. Remote-control click/type/scroll remains safe across stale frames, stream-tab changes, navigation, debugger contention, and ownership retargeting.
**Plans**: 4 plans
- [x] 24-01-PLAN.md — Protocol/envelope adapter for extension/dashboard stream messages.
- [x] 24-02-PLAN.md — Relay compatibility or package-backed relay integration.
- [x] 24-03-PLAN.md — Recovery, readiness, watchdog, and reconnect parity.
- [x] 24-04-PLAN.md — Remote-control reverse mapping and debugger ownership parity.

### Phase 25: Parity Removal, Docs & Browser UAT
**Goal**: FSB no longer carries duplicate stream engines; tests and docs prove the package-backed migration, and live-browser UAT confirms the dashboard stream remains usable under real conditions.
**Depends on**: Phase 24
**Requirements**: PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05
**Success Criteria**:
  1. Old in-house capture/renderer/relay logic is removed or reduced to FSB-specific adapters, with no second generic DOM-streaming engine left behind.
  2. Differential parity tests cover snapshots, mutations, scroll, overlays, dialogs, stale-session rejection, compression, relay backpressure, and security sanitization.
  3. Docs identify PhantomStream as the implementation, record the source/version/provenance, and explain remaining FSB adapters.
  4. Automated gates pass, and browser UAT records live preview, navigation, reconnect, restricted-tab, large-page, masking, and remote-control results without fabricating human evidence.
**Plans**: 4 plans
- [x] 25-01-PLAN.md — Remove duplicated in-house stream engines and dead code.
- [x] 25-02-PLAN.md — Differential parity and security regression suite.
- [ ] 25-03-PLAN.md — Documentation, provenance, package pin record, and release notes.
- [ ] 25-04-PLAN.md — Final automated gates plus browser UAT evidence.

## Progress (v0.12.0)

**Execution Order:**
Phases execute in numeric order: 21 → 22 → 23 → 24 → 25

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 21. Package Intake & Contract Mapping | v0.12.0 | 3/3 | Complete | 2026-06-17 |
| 22. Capture Adapter Migration | v0.12.0 | 4/4 | Complete | 2026-06-17 |
| 23. Dashboard Renderer Migration | v0.12.0 | 4/4 | Complete | 2026-06-17 |
| 24. Transport, Relay & Remote Control Integration | v0.12.0 | 4/4 | Complete | 2026-06-17 |
| 25. Parity Removal, Docs & Browser UAT | v0.12.0 | 2/4 | In Progress | - |

## Research Flags (v0.12.0)

Phases flagged as likely needing deeper per-phase research:

- **Phase 21:** package publication/provenance is the gate. npm returned 404 on 2026-06-17, so a source decision is required before implementation.
- **Phase 22:** capture security/masking behavior may differ from current FSB `data-fsb-nid` live-DOM stamping and must be tested deliberately.
- **Phase 23:** static dashboard and Angular dashboard must not drift; this phase should prefer a shared wrapper.
- **Phase 24:** relay/transport exports may not exist in the currently declared package export map, despite README describing relay/transport surfaces.
- **Phase 25:** real browser UAT is mandatory; Node tests cannot prove visual fidelity and remote-control usability alone. Phase 24 left explicit remote-control browser UAT debt in `24-VALIDATION.md`.

## Completed Milestones

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

- **Consolidated Chrome MV3 UAT debt:** Run and capture archived v0.10/v0.11 browser evidence if release policy requires post-close proof.
- **Delegation primitive:** Parked from v0.10.0; re-scope as either a Lattice-owned primitive or an FSB-only consumer of Lattice receipt + tripwire surfaces.
- **FSB-side tripwire band adapter:** Carry forward the `FINT-MM..K` placeholder from archived requirements.
- **Sidepanel Agent State Inspector:** Carry forward the `FINT-LL..P` placeholder from archived requirements.

## Backlog

### Phase 999.1: MCP tool gaps — click heuristics

**Status:** Completed historical backlog work retained outside milestone archival.

- `999.1-01`: Route-aware MCP bridge dispatch + `execute_js` background handler.
- `999.1-02`: Text-based click targeting with TreeWalker visible-text matching.

Artifacts remain in `.planning/phases/999.1-mcp-tool-gaps-click-heuristics/`.
