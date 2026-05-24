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

- [x] **Phase 1: Lattice SDK gap survey + integration scaffolding** -- Plans: 2/2 COMPLETE 2026-05-24. Audit Lattice v1.1 across 6 surfaces (receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers); land the audit doc on Lattice's `fsb-integration-experiments` branch; wire FSB to consume Lattice via `file:` npm dependency; prove round-trip via real-runtime Node smoke that mints + verifies one Capability Receipt. Per Option B reconciliation: no in-extension Lattice import in Phase 1 (deferred to a future bundler-aware phase). Phase verifier + milestone UAT pending. Plans:
  - [x] `01-01-PLAN.md` -- Lattice-side: verify branch, build dist/, add single-line `createReceipt` re-export to `src/index.ts`, author 6-surface audit doc, conventional-commit with `Ref: FSB v0.10.0-attempt-2 Phase 1` footer (D-14), no push (D-15). **COMPLETE 2026-05-24 -- Lattice commits ab6c1f6 + 195e5ae; SUMMARY at .planning/phases/01-lattice-gap-survey-scaffold/01-01-SUMMARY.md.**
  - [x] `01-02-PLAN.md` -- FSB-side: add `"lattice": "file:./lattice/packages/lattice"` dep + append smoke to `scripts.test`, run `npm install`, create `tests/lattice-smoke.test.js` (real-runtime mint + verify round-trip with ephemeral Ed25519 keypair), create `.planning/LATTICE-PIN.md` audit-trail, manual MV3 sanity reload checkpoint, single `feat(phase-1):` commit. **COMPLETE 2026-05-24 -- FSB commits 658ed87e + 1545c14c + be95d158 + e3cd7fb5 (pause record); Lattice catalog-fix commit 22bf986 (user-authorized D-13 expansion); SUMMARY at .planning/phases/01-lattice-gap-survey-scaffold/01-02-SUMMARY.md; Task 4 (manual MV3 reload) DEFERRED-PENDING-UAT per user directive "continue all phases with GSD autonomous; UAT will be at the end".**
- [ ] **Phase 2: Lattice tripwire + receipt primitives extension** -- TBD. Extend Lattice's tripwire / receipt primitives with the priority-band + matcher + race-with-log + freeze contract FSB needs. Validate via Lattice's own 451-test suite (additive, no regressions).
- [ ] **Phase 3+: TBD via discuss-phase** -- delegation primitive, provider adapters, step markers, MV3-eviction resumption all live in Lattice; FSB integration is incremental.

## Phase Details

### Phase 1: Lattice SDK gap survey + integration scaffolding

**Goal:** Produce two outputs end-to-end. (1) A documented gap audit of Lattice v1.1 against FSB's runtime needs across all 6 surfaces (Capability Receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers), landing as `lattice/docs/fsb-integration-gaps.md` on the `fsb-integration-experiments` branch with gaps tagged by FSB-blocking severity (Blocker / Important / Nice-to-have). (2) A working FSB -> Lattice `path:` dependency wiring proven by a smoke test that mints exactly one Capability Receipt via Lattice's existing v1.1 surface, plus a manual MV3 SW reload check that confirms Lattice ES modules load inside the service worker. No FSB runtime behaviour changes, no Lattice primitive extensions yet -- only the audit + scaffold + receipt round-trip.

**Why:** v0.10.0-attempt-1 invented primitives inside FSB and planned to port them later (LAT-05 anti-pattern -- identified but not executed). Attempt-2 inverts the order: audit Lattice first, then build extensions inside Lattice on `fsb-integration-experiments`, then consume from FSB. Phase 1 establishes the FSB <-> Lattice loop and the queue of gap-closing work for Phase 2+. The smoke test proves the integration model works before any SDK extensions land.

**Scope (in):**
- Audit Lattice v1.1 across all 6 surfaces (receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers); document each gap with FSB-blocking severity.
- Write `lattice/docs/fsb-integration-gaps.md` on `fsb-integration-experiments` (single source of truth -- INV-06).
- Set up FSB <-> Lattice integration via `path:` dependency from `./lattice/packages/lattice`.
- Build Lattice locally (`pnpm install && pnpm build` inside `lattice/`) so `dist/` exists for FSB to consume.
- Add bridge module on the FSB side (e.g., `extension/lattice-bridge.js`) that imports from the built Lattice ESM surface; wire MV3 SW to load it via native ES module imports.
- Write `tests/lattice-smoke.test.js` exercising one Capability Receipt mint via Lattice's existing v1.1 API. Smoke must run under FSB's existing Node test harness (`npm test`).
- Manual MV3 SW reload check: extension reloads in Chrome, bridge module imports successfully, browser console shows no module-load errors. Result captured in PLAN's verification notes / phase SUMMARY.
- Create `.planning/LATTICE-PIN.md` recording the Lattice commit SHA used for this phase + per-phase log.

**Scope (out):**
- Any Lattice SDK extension or primitive addition beyond the audit doc + at most one `tsconfig` / `exports` packaging tweak if the smoke surfaces one (receipt-shape extensions, tripwire band system, provider matrix, delegation primitive, MV3-survivability adapter are all deferred to subsequent dedicated phases).
- Any change to FSB runtime behaviour (no `runAgentLoop` modification, no replacement of the `setTimeout`-chained iterator pattern -- INV-04).
- Sidepanel-side Lattice consumption (own phase later).
- Mainline PR back into Lattice (deferred to v0.11.0+ per CONTEXT.md D-15).
- Populating LSDK / FINT / MCP / PRV REQ-IDs in REQUIREMENTS.md (deferred to Phase 2 setup work).

**Pass criteria (explicit, from CONTEXT.md D-12):**
1. `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments` covering all 6 surfaces, with gaps severity-tagged.
2. FSB's `npm test` includes the new `tests/lattice-smoke.test.js` and the smoke passes (one receipt minted via Lattice).
3. Manual MV3 SW reload check passes: extension loads cleanly with Lattice bridge module imported; no console errors related to module loading.

**Lattice-side ceremony (CONTEXT.md D-14):** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 1` in commit body.

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
