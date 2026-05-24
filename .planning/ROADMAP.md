# Roadmap

**Status:** v0.10.0 (attempt 2) -- Lattice-SDK-first approach in pre-planning. Pivot from v0.10.0-attempt-1 (FSB-first) committed 2026-05-24; see `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md` for the rationale.

**Branch posture:** `automation` branch reset to `51bdbb36` (merge-base with `main`). Pre-pivot work preserved on `pre-pivot-archive/v0.10.0-fsb-first`. Lattice cloned into `./lattice/` (gitignored) on branch `fsb-integration-experiments`. FSB will consume Lattice via `npm install ./lattice` (path: dependency) or `npm link`.

**Phase numbering:** v0.10.0-attempt-2 resets phase numbering to start at **1**. v0.9.69 ended at phase 276; v0.10.0-attempt-1 used phases 1-2 (now archived). v0.10.0-attempt-2 uses phases 1-N (TBD).

---

## Active Milestone: v0.10.0 Autopilot via Lattice SDK (attempt 2)

**Goal:** Improve FSB's task completion reliability by treating Lattice as the underlying SDK. Build the SDK primitives (state envelopes, tripwire safety contracts, provider adapters, delegation primitive) inside the Lattice repo on the `fsb-integration-experiments` branch, then consume Lattice from FSB as a path: dependency. FSB's autopilot engine becomes a thin browser-runtime layer over Lattice's primitives.

**Why this matters:** v0.10.0-attempt-1 invented the same patterns inside FSB and planned to port them to Lattice later via separate PRs. That created duplication risk (FSB's checkpoint-hook + Lattice's signed-receipt are conceptually the same shape but live in two repos) and deferred the Lattice round-trip validation. Attempt-2 inverts: Lattice owns the primitives, FSB consumes; the Lattice round-trip happens continuously during development.

**Lattice integration model:**
- Lattice repo cloned at `./lattice/` (developer-side experimental sandbox; not tracked by FSB git)
- Lattice's `fsb-integration-experiments` branch carries the SDK extensions FSB needs
- FSB depends on `./lattice` via `package.json` `path:` dependency or `npm link` during development
- Lattice's existing v1.1 Capability Receipts (451 tests) is the starting baseline
- SDK additions land as commits on Lattice's `fsb-integration-experiments` branch first; once validated by FSB integration, open PRs to Lattice mainline as separate work

**Lattice SDK extension candidates (to be scoped during phase discussion):**
- Receipt-shaped state envelopes for any agent-loop runtime (not just Lattice's own server-side runtime); MV3-survivable encoding
- Tripwire safety contracts with priority bands (SAFETY > OBSERVABILITY > EXTENSION) + matcher regex + race-with-log budget + frozen contexts
- Universal-provider adapters for the 7 FSB providers (Anthropic, OpenAI, xAI, Gemini, LM Studio, OpenRouter, custom OpenAI-compatible) -- Lattice currently has its own provider abstraction; needs gap analysis
- Task-delegation primitive (parent-child loops with summary-return + cache-prefix sharing + rate-limit-group coordination) -- Lattice's "Out of Scope" excludes multi-agent; may require Lattice-policy discussion
- Step-marker / observability primitive -- inspector envelope shape Lattice can sign as a Capability Receipt directly

**Hard invariants (non-negotiable, carried over from v0.10.0-attempt-1):**
- **INV-01 MCP wire contracts UNTOUCHED.** Tool schemas, semantics, request/response shapes of every existing MCP-exposed tool stay byte-identical. Net-new tools (if any) land byte-identically to `extension/ai/tool-definitions.js` AND `mcp/ai/tool-definitions.cjs` in the SAME commit.
- **INV-02 Tool surface parity.** FSB's autopilot loop uses the SAME tool registry that MCP exposes (`TOOL_REGISTRY` in `extension/ai/tool-definitions.js`). No parallel "autopilot-only" tool stack.
- **INV-03 Provider parity.** Every improvement works equally across all 7 `universal-provider.js` targets. No single-provider regression. LM Studio is the canary for latency tail regressions.
- **INV-04 MV3-survivability preserved.** The existing `setTimeout`-chained iterator pattern at `agent-loop.js:1824/2418/2487/2497` is load-bearing for Chrome's 30s-silence + 5-min idle kill. Lattice integration must NOT replace this iterator pattern.
- **INV-05 No resurrection of deprecated modules.** `extension/agents/agent-executor.js` / `agent-manager.js` / `agent-scheduler.js` (DEPRECATED v0.9.45rc1) stay frozen.
- **INV-06 (NEW) Lattice SDK changes happen in the Lattice repo first.** No primitive lives in FSB-only; if FSB needs a primitive, the primitive goes into Lattice on `fsb-integration-experiments`. FSB-side code is integration glue and runtime adapters, not the primitive itself.

## Phases

(To be detailed via `/gsd-discuss-phase` / `/gsd-plan-phase` workflow.)

- [ ] **Phase 1: Lattice SDK gap survey + integration scaffolding** -- TBD. Audit Lattice v1.1 against FSB's needs; identify which primitives exist, which need extension, which need addition. Set up FSB -> Lattice path: dependency wiring. Single-roundtrip smoke test to prove FSB can call into Lattice from the Chrome extension runtime (MV3 SW + sidepanel both).
- [ ] **Phase 2: Lattice tripwire + receipt primitives extension** -- TBD. Extend Lattice's tripwire / receipt primitives with the priority-band + matcher + race-with-log + freeze contract FSB needs. Validate via Lattice's own 451-test suite (additive, no regressions).
- [ ] **Phase 3+: TBD via discuss-phase** -- delegation primitive, provider adapters, step markers, MV3-eviction resumption all live in Lattice; FSB integration is incremental.

## Phase Details

(Populated by `/gsd-discuss-phase` + `/gsd-plan-phase` during planning.)

---

## Previous Milestone: v0.10.0-attempt-1 (FSB-first, abandoned 2026-05-24)

**Status:** Pivoted before milestone completion. Phases 1-2 shipped FSB-side code (hooks-foundation + state-inspectability-carve-out, 617/617 tests green) before the team re-evaluated and chose to pivot to the Lattice-first approach. All work preserved.

**Why abandoned:** Pattern duplication risk between FSB and Lattice; deferred Lattice round-trip validation; LAT-05 only IDENTIFIED port candidates rather than executing them. See `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md`.

**Preservation:**
- Branch: `pre-pivot-archive/v0.10.0-fsb-first` (30+ commits at HEAD `4d70facf`)
- On-disk: `.planning/milestones/v0.10.0-attempt-1-pre-pivot/` (Phase 1 + Phase 2 full artifact sets: CONTEXT, DISCUSSION-LOG, RESEARCH, UI-SPEC, VALIDATION, PLANs, SUMMARYs, VERIFICATION)
- Snapshots: `ROADMAP.v0.10.0-attempt-1.md`, `REQUIREMENTS.v0.10.0-attempt-1.md`, `PROJECT.v0.10.0-attempt-1-snapshot.md`

**Recoverable artifacts (from backup branch):** Phase 1 hook-pipeline extensions (priority bands, matcher, race-with-log, freeze, lockBand); Phase 2 LIFECYCLE_EVENTS.STEP_TRANSITION + checkpoint-hook.js + 12 step markers + sidepanel Agent State Inspector UI + full SW eviction resumption with CONSERVATIVE recovery. The patterns themselves are intellectually correct; in attempt-2 they live in Lattice instead.

---

## Previous Milestone: v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix (shipped 2026-05-14)

(Full v0.9.69 history preserved in `.planning/milestones/v0.9.69-ROADMAP.md`.)

8 phases (269-276), 9 plans, 67/68 v0.9.69 REQs Complete. Anonymous UUIDv4 install identity + opt-out kill-switch; MCP pricing module + cost-surfacing chokepoint; TelemetryCollector 5-min alarm beat surviving MV3 SW eviction; SQLite ingest with 8-layer abuse defenses + HMAC-SHA256 daily-rotated IP hashing + k>=2 anonymity floor; `/api/public-stats/*` aggregates rendered as 6 chart toggles on `/stats`; privacy disclosure section + CWS listing copy + `verify-store-listing.mjs` gate; server-side GitHub stats cache; MCP transport `z.coerce.number()` numeric-param fix. All 3 release-gating BLOCKERs RESOLVED. Released artifacts: extension v0.9.67 zip on GitHub, mcp-v0.9.2 auto-published to npm, Fly auto-deployed.

---

*Last updated: 2026-05-24 -- v0.10.0-attempt-2 pivot.*
