# Requirements: FSB v0.10.0 Autopilot via Lattice SDK (attempt 2)

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Branch:** `automation` (reset to merge-base with `main` on 2026-05-24)
**Customer:** FSB Chrome extension's autopilot loop (driven by Sidepanel UI and autopilot mode). The improvements are for the IN-EXTENSION agent loop; the same tool surface that MCP exposes is reused -- no parallel tool stacks.
**SDK direction:** [Lattice](https://github.com/LakshmanTurlapati/Lattice) -- in this attempt, FSB consumes Lattice as a path: dependency. Lattice is cloned at `./lattice/` (gitignored) on branch `fsb-integration-experiments`. SDK extensions land in Lattice's repo first; FSB integration glue lands in FSB's repo.
**Source-of-truth research:** TBD (to be regenerated for the Lattice-first approach via `/gsd-discuss-phase` + research synthesis)
**Phase numbering:** Reset to **Phase 1** for v0.10.0-attempt-2.
**Pivot context:** `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md`

**Last updated:** 2026-05-24

---

## Goal

Improve FSB's task completion reliability by adopting [Lattice](https://github.com/LakshmanTurlapati/Lattice) as the autopilot engine's underlying SDK. Build the runtime primitives (state envelopes, tripwire safety contracts, observability primitives, delegation primitive, MV3-survivability adapters) inside Lattice on the `fsb-integration-experiments` branch, then have FSB's autopilot engine consume Lattice as a thin runtime adapter. The Lattice round-trip validates continuously during development rather than being deferred to an end-of-milestone smoke test.

The framing is still outcome-first: "whatever makes FSB do tasks better." Lattice is a means to that end. The pivot vs attempt-1 is that the primitives live in the SDK (Lattice) rather than in the consumer (FSB).

---

## Hard Invariants (NON-NEGOTIABLE -- gate every requirement)

- **INV-01 MCP wire contracts UNTOUCHED.** Every existing MCP-exposed tool's schema, semantics, and request/response shape stays byte-identical. Verified by `tests/tool-definitions-parity.test.js` between `extension/ai/tool-definitions.js` and `mcp/ai/tool-definitions.cjs`. Net-new tools (if any) must land byte-identically to BOTH registries in the SAME phase commit.
- **INV-02 Tool surface parity.** FSB's autopilot loop uses the SAME tool registry that MCP exposes (`TOOL_REGISTRY` in `extension/ai/tool-definitions.js`). No parallel "autopilot-only" tool stack. Any tool the autopilot uses, MCP clients can also use.
- **INV-03 Provider parity.** Every improvement must work equally across all 7 `universal-provider.js` targets (Anthropic, OpenAI, xAI, Gemini, LM Studio, OpenRouter, custom OpenAI-compatible). No improvement that regresses any single provider.
- **INV-04 MV3-survivability preserved.** The existing `setTimeout`-chained iterator pattern (`agent-loop.js:1824/2418/2487/2497`) is load-bearing for Chrome's 30s-silence + 5-min idle kill. No refactor that replaces this iterator pattern -- Lattice integration is additive runtime adaptation, not iterator replacement.
- **INV-05 No resurrection of deprecated modules.** `extension/agents/agent-executor.js` / `agent-manager.js` / `agent-scheduler.js` (DEPRECATED v0.9.45rc1, superseded by OpenClaw / Claude Routines) stay frozen. New code lands in fresh paths.
- **INV-06 (NEW) Lattice SDK primitives live in Lattice's repo, not in FSB's.** Any runtime primitive used by both FSB's autopilot and any potential future Lattice consumer goes into Lattice on `fsb-integration-experiments`. FSB-side code is integration glue (path: dependency wiring, MV3 runtime adapters, sidepanel UI) and never re-implements primitives that belong in Lattice.

---

## v1 Requirements (this milestone -- HIGH-LEVEL SCAFFOLD)

Detailed REQ-IDs are populated during phase planning (`/gsd-discuss-phase` + `/gsd-plan-phase`). The categories below sketch the scope.

### LSDK -- Lattice SDK Extensions (work in `./lattice` on `fsb-integration-experiments` branch)

Goal: extend Lattice's v1.1 Capability Receipts foundation with the primitives FSB's autopilot needs.

- [ ] **LSDK-01..N (TBD):** Lattice SDK gap survey -- audit Lattice v1.1 against FSB's needs (receipt shapes, tripwire contracts, provider abstractions, multi-agent / delegation policy, MV3-survivability constraints, hook lifecycle vocabulary). Document gaps in `lattice/docs/fsb-integration-gaps.md` on the experiment branch. Identify which gaps are SDK-side (Lattice extensions) vs runtime-side (FSB adapters).
- [ ] **LSDK-NN..M (TBD):** Receipt-shaped state envelopes additions / extensions -- ensure Lattice can represent the step transitions FSB's autopilot emits (`stepName`, `stepIndex`, `timestamp`, `sessionId`, `parentStepName`, `previousStepName`, and any new fields surfaced by phase discussion).
- [ ] **LSDK-MM..K (TBD):** Tripwire / hook primitive parity -- priority bands (SAFETY > OBSERVABILITY > EXTENSION), matcher regex, race-with-log per-handler budget, frozen contexts, mid-session registration freeze.
- [ ] **LSDK-KK..L (TBD):** Provider adapter extensions -- bring Lattice's provider abstraction into parity with FSB's 7-provider matrix (Anthropic, OpenAI, xAI, Gemini, LM Studio, OpenRouter, custom OpenAI-compatible).
- [ ] **LSDK-LL..P (TBD):** Task-delegation primitive shape (if Lattice opens multi-agent policy; otherwise design as a Lattice-adjacent FSB-side primitive that consumes Lattice's receipt + tripwire surface).
- [ ] **LSDK-PP..Q (TBD):** MV3-survivability adapter contract -- documented interface for runtimes whose execution context can be evicted mid-flow.

### FINT -- FSB Integration Layer (work in `automation` branch)

Goal: wire FSB's autopilot engine to Lattice as a path: dependency.

- [ ] **FINT-01..N (TBD):** Path: dependency wiring + npm install ./lattice + ensure Lattice's SDK loads in both MV3 SW + sidepanel contexts.
- [ ] **FINT-NN..M (TBD):** Adapt FSB's `runAgentLoop` to emit step transitions through Lattice's receipt API (replacing the FSB-only `setStepMarker` helper from v0.10.0-attempt-1).
- [ ] **FINT-MM..K (TBD):** Adapt FSB's safety / observability / extension hooks to Lattice's tripwire band system (replacing the FSB-only HookPipeline from v0.10.0-attempt-1).
- [ ] **FINT-KK..L (TBD):** Adapt FSB's `universal-provider.js` to Lattice's provider abstraction OR keep FSB-side and align signatures.
- [ ] **FINT-LL..P (TBD):** Sidepanel Agent State Inspector view consuming Lattice's receipt timeline (single source of truth for both display + future signing).
- [ ] **FINT-PP..Q (TBD):** SW eviction resumption via Lattice's MV3-survivability adapter contract (replacing the FSB-only `_al_handleRestoredMode` from v0.10.0-attempt-1).

### MCP -- Wire-Contract Non-Regression (Phase N + cross-cutting)

Goal: prove INV-01 (MCP wire contracts UNTOUCHED) and INV-02 (tool surface parity) hold across every Lattice-integration change.

- [ ] **MCP-01:** `tests/tool-definitions-parity.test.js` passes byte-identically pre/post v0.10.0-attempt-2.
- [ ] **MCP-02:** Lattice path: dependency introduction does not mutate `TOOL_REGISTRY` at any point.
- [ ] **MCP-03..N (TBD):** Additional MCP non-regression checks as Lattice integration phases land.

### PRV -- Provider Parity (Phase N + cross-cutting)

Goal: prove INV-03 holds across all 7 providers after Lattice-driven provider adapter alignment.

- [ ] **PRV-01..N (TBD):** Per-provider regression suite after each Lattice integration phase.

---

## Out of Scope (explicit exclusions)

- **OOS-01 FSB-side primitive re-implementation.** v0.10.0-attempt-1 built its own hook pipeline + checkpoint-hook + step-marker layer + session-resume dispatcher inside FSB. Attempt-2 does NOT re-build these; if FSB needs them, Lattice gets them first per INV-06.
- **OOS-02 Multi-agent crews / agent-team orchestration** (CrewAI / AutoGen style). Wrong domain for FSB. Lattice also currently excludes this; if Lattice opens its multi-agent policy mid-milestone, delegation primitive becomes in-scope.
- **OOS-03 Coding-agent patterns** (Aider / Cline / OpenCode diff-then-apply). Wrong domain.
- **OOS-04 Skills primitive (full domain-specific tool+prompt loading)** -- deferred to v0.11.0+.
- **OOS-05 Replacing the `setTimeout`-chained iterator pattern.** INV-04. Lattice integration is additive runtime adaptation.
- **OOS-06 Streaming-aware hook events / chunk-level events.** Provider-parity violation (INV-03) for Gemini single-shot path.
- **OOS-07 Auto-fetching skills from URLs.** Highest-risk skills anti-pattern.
- **OOS-08 Resurrection of `extension/agents/*`.** INV-05.
- **OOS-09 v0.9.70 Showcase Dashboard work** (streaming fix, Sync-tab restore, 16:10 viewport). Continues in parallel on `main`.
- **OOS-10 Telemetry surface follow-ups** (first-run banner, "View what we send", region-gated opt-in, etc.). Carry-forward from v0.9.69.
- **OOS-11 Showcase i18n carry-forwards.** Carry-forward from v0.9.63 / v0.9.65.

---

## Reference: v0.10.0-attempt-1 (archived)

The FSB-first attempt shipped Phase 1 hooks-foundation (priority bands, matcher, race-with-log, freeze, 5 new lifecycle events, lockBand, telemetry-hook, MCP-04 byte-identity passthrough, MCP-05 TOOL_REGISTRY freeze, PRV-02 hook-event-count parity) and Phase 2 state-inspectability-carve-out (LIFECYCLE_EVENTS.STEP_TRANSITION, checkpoint-hook.js with Lattice receipt-shape envelope, 12 step markers in runAgentIteration, additive persistSession schema, sidepanel Agent State Inspector view, full MV3 SW eviction resumption with CONSERVATIVE recovery for mid-API-request and mid-tool-dispatch). 617/617 test assertions green. The patterns themselves are intellectually correct; attempt-2 moves them into Lattice instead of duplicating them in FSB.

Archived under:
- Branch: `pre-pivot-archive/v0.10.0-fsb-first`
- On-disk: `.planning/milestones/v0.10.0-attempt-1-pre-pivot/` (full Phase 1 + Phase 2 artifact sets including 981-line RESEARCH.md, 694-line UI-SPEC.md, threat models, verification reports)

---

## Traceability

To be populated during phase planning. Each REQ-ID will map to exactly one phase. 100% coverage verified by `gsd-plan-checker` before execution.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| (TBD) | (TBD) | Pending |

**Total v1 requirements:** TBD
