---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: Full App Catalog (OpenTabs Parity)
status: planning
last_updated: "2026-06-24T04:30:00.000Z"
last_activity: 2026-06-24
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (v1.0.0 Full App Catalog milestone framing + INV-01..04 + Walls 1/2)
See: .planning/ROADMAP.md (active milestone v1.0.0, Phases 35-43; v0.9.99 Phases 26-34 code-complete)
See: .planning/REQUIREMENTS.md (17 v1.0.0 requirements: DENY/CGEN/BRDTH/DEPTH/DSEED/SCALE; 17/17 mapped, 0 orphaned)
See: .planning/research/SUMMARY.md (decision-ready synthesis; the convergent denylist-first 9-phase spine)
See: .planning/research/ARCHITECTURE.md (real file-path integration map + the 9-phase decomposition)
See: .planning/MILESTONES.md (prior milestones; v0.9.99 ended at Phase 34, plus side Phase 999.1)

**Core value:** Reliable single-attempt execution — the AI decides correctly, the mechanics execute precisely. v1.0.0 scales the v0.9.99 capability path from a 4-service head to the full ~119-app OpenTabs surface by FEEDING THE EXISTING TIERS (breadth = closed-vocab descriptors as data; depth = hand-ported handlers; tail = seeded discovery + DOM fallback).
**Current focus:** Phase 35 — Denylist Expansion + Import-Time Classification Gate (LANDS FIRST)

## Current Position

Phase: 35 of 43 (Denylist Expansion + Import-Time Classification Gate) — not started
Plan: —
Status: Roadmap created; ready to plan Phase 35
Last activity: 2026-06-24 — v1.0.0 roadmap created (Phases 35-43); requirements traceability finalized

Progress: [░░░░░░░░░░] 0%

## Roadmap At A Glance (v1.0.0, Phases 35-43)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 35 | Denylist Expansion + Import-Time Classification Gate (LANDS FIRST) | DENY-01..04 (4) | Not started |
| 36 | Codegen Pipeline + No-Dead-Entry Resolution | CGEN-01..04 (4) | Not started |
| 37 | Breadth A — Dev / Productivity (least-sensitive) | BRDTH-01..03 (3) | Not started |
| 38 | Breadth B — Comms / Social / Content (sensitivity-screened) | (continues BRDTH-01..03) | Not started |
| 39 | Breadth C — Commerce / Travel / Misc (most-sensitive) | (continues BRDTH-01..03) | Not started |
| 40 | Depth 1 — Top READ Hand-Ports | DEPTH-01 (1) | Not started |
| 41 | Depth 2 — Remaining Hand-Ports + Guarded Writes | DEPTH-02 (1) | Not started |
| 42 | Discovery Seeding + Tail Learn | DSEED-01..02 (2) | Not started |
| 43 | Catalog-Scale + Milestone Gate | SCALE-01..02 (2) | Not started |

Coverage: 17/17 v1.0.0 requirements mapped, 0 orphaned. BRDTH-01/02/03 owned by Phase 37; Phases 38-39 are sensitivity-ascending continuation batches of the same contract.

Ordering principle (all four researchers converge — do not reorder): **denylist before reach** (35 strictly first; under opt-out Auto the denylist is the ONE hard floor; the import-time gate makes the ordering a CI failure, not a hope) → **pipeline before content** (36's no-dead-entry resolve() branch + cross-check + full-scale search proof before 2,523 descriptors land) → **breadth before depth** least-sensitive → most-sensitive (37-39, each batch gated on denylist coverage) → **discovery after breadth + depth** (42 seeds the residual tail) → **scale gate last** (43).

## Hard Invariants (bind every phase — carried from v0.9.99)

- **INV-01:** existing ~63 MCP tool schemas stay byte-identical; the 2 capability tools stay OUTSIDE `TOOL_REGISTRY`. Breadth adds DATA + depth adds handlers behind the SAME 2 tools — no new MCP tool; the frozen non-trigger registry hash stays unmoved.
- **INV-02:** both front doors (MCP dispatcher + autopilot `tool-executor`) call the SAME `FsbCapabilityRouter.invoke`; hand-ports register into the SAME catalog. No autopilot-only path.
- **INV-03:** typed reasons (`RECIPE_DOM_FALLBACK_PENDING`, `RECIPE_LEARN_PENDING`, `RECIPE_CONSENT_BLOCKED`) byte-equal across all 7 `universal-provider.js` targets.
- **INV-04:** the `agent-loop.js` `setTimeout` iterator is load-bearing and untouched; invoke is a single bounded async op; codegen is build-time only.

## Architectural Walls (non-negotiable, shape every phase)

- **Wall 1 (MV3 no remotely-hosted code):** descriptors are closed-vocab DATA; the importer NEVER emits a forbidden field name (script/expr/transform/code/fn/js); `verify-recipe-path-guard.mjs` stays green. OpenTabs is import-time metadata only — its `dist/`/`handle()` runtime is never shipped.
- **Wall 2 (execution context):** every credentialed call goes through `capability-fetch.js executeBoundSpec` in the page MAIN world with the active-tab origin-pin; hand-ports are `executeBoundSpec`-only; CDP capture stays discovery-only.

## v0.9.99 Substrate (FIXED — integrate with, do not redesign)

Tiers T0/T1a/T1b/T2-learned/T3-DOM; the closed-vocab interpreter; the consent gate (opt-out Auto default, denylist = the ONE hard floor); the 2 out-of-`TOOL_REGISTRY` MCP tools. Real integration seams (read live on branch `automation`): `capability-catalog.js resolve()`/`REGISTRY`/`HEAD_HANDLER_MODULES`/`seedHeadHandlers`/`registerHandler`; `capability-router.js invoke()`/`_evaluateConsent`/tier dispatch; `capability-search.js buildIndex`/`catalogVersion`; `scripts/package-extension.mjs readJsonDir` + the generated `recipe-index.generated.js` IIFE; `catalog/handlers/github.js` (T1a hand-port shape); `extension/config/service-denylist.json` + `service-denylist.js` loader; `network-capture.js` discovery path; `verify-recipe-path-guard.mjs` Wall-1 guard.

## Top Risks (from research — bake into phase planning)

- **Security-ordering trap (THE HEADLINE, Phase 35):** opt-out Auto makes finance/health/social apps writable the moment their descriptor lands; six finance apps (stripe, coinbase, robinhood, fidelity, carta, ynab) are absent from the current 4-origin denylist; a gap in the JSON array is indistinguishable from an allow decision. Fix: denylist expansion + import-time classification gate lands FIRST; no descriptor-import phase merges until that gate is green.
- **Discoverable-but-uninvocable dead descriptors (Phase 36):** `resolve()` returns null for any non-REGISTRY slug, but search indexes ALL descriptors → ~2,523 searchable-but-uninvocable entries without a single `resolve()` fallback branch mapping descriptor-only → T3/T2. The load-bearing code change.
- **Side-effect mis-classification at scale (Phase 36):** GraphQL/RPC mutations tunnel through POST → "class by HTTP method" mis-labels destructive ops as read → fully writable with no friction. Fix: verb-map + GraphQL/RPC carve-out + fail-safe-high (disagreement → write); recipe-wins runtime cross-check; sample-test `void_invoice`/`delete_customer`.
- **Cloning the imperative model → head sprawl → MV3 ban (Phases 36-41):** breadth = descriptors-only (data); cap the head at ~15-30 with a CI assertion on `HEAD_HANDLER_MODULES`; the tail is learned, never streamed-as-code.
- **One-size codegen vs per-app auth diversity (Phases 36, 42):** bespoke auth onto the 4-member enum compiles but is wrong → 200-with-logged-out-body that looks like success under Auto. Fix: decouple discoverable from invocable; never auto-mint a recipe from guessed auth; bespoke auth is head-only or learn-only (observe-then-replay-clean before promotion).
- **Token leakage across 119 bespoke auth shapes (Phase 42):** structural capture-time redaction (never reads a value) + a no-leak test extended to the full 119-app field universe + token-shape patterns.
- **Search precision + SW cold-start at ~2,523 docs (Phases 36, 43):** rich intentSynonyms (>=3-4/op) + owned-origin bias + a full-scale eval-harness re-run (wrong-invoke=0); index searchable-text-only + schema-on-hit + deferred hydration + a CI cold-start benchmark.
- **Recipe-rot thundering-herd at 119-app scale (Phase 43):** per-origin re-learn coalescing + back-off + recurrence-based systemic-vs-transient + app-level degraded surfacing.
- **ToS/legal exposure (Phases 35, 38):** a ToS-hostility axis distinct from finance sensitivity → DOM-only or denylist for social/adult/messaging; `docs/LEGAL.md` names the axis.

## Research Flags (phases likely needing a `--research-phase` spike at plan time)

- **Phase 36:** the zod→closed-`params` flattening edge cases (`z.union`→permissive `anyOf`, `z.record`/`z.enum`) + the forbidden-field-name pre-scan interaction (fixture-backed pass); the side-effect verb-map + GraphQL/RPC carve-out (destructive-op sample as acceptance test); the full-scale eval-harness fixture (cross-app near neighbors) + the SW cold-start budget (concrete numbers).
- **Phases 40-41 (per-app):** each Pattern-D/E port needs a per-app CORS / first-party-origin verification before commitment — linear is documented-safe; supabase, mongodb-atlas, circleci, and any cloud-console are UNVERIFIED; gapi-bridge (google-calendar) is a distinct handler shape (deferred to v2 GAPI-01). Live-capture UAT for guarded writes is human_needed.
- **Phase 42:** structural-redaction completeness against 119 unknown auth field shapes; promote-after-replay behavior with seeded hints.

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md (v0.9.99 Phase 26-34 decisions + INV-01..04 + Walls 1/2). One v1.0.0 posture decision was surfaced by research and RESOLVED in requirements: **DENY-04 (posture B)** — sensitive-classified origins re-enforce the per-origin mutating opt-in at the invoke gate (reads run under Auto everywhere; a WRITE to a sensitive origin requires the per-origin mutating flag; non-sensitive stays fully-open). This re-scopes the friction removed in v0.9.99 Phase 30 to sensitive origins only; the denylist still covers the catastrophic worst.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and carried forward from previous milestone closes (Chrome MV3/manual UAT evidence gaps, not fabricated passes; procedures archived under `.planning/milestones/*/` and `.planning/phases/*/`). v1.0.0 does NOT block on this debt.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 27 / 27-HUMAN-UAT.md (live FETCH-05 logged-in-shape UAT-27-01 + contrast + origin-pin) | human_needed; 3 scenarios | v0.9.99 Phase 27 |
| uat_gap | Phase 29 / 29-HUMAN-UAT.md ([ASSUMED] internal-endpoint live capture) | human_needed | v0.9.99 Phase 29 |
| uat_gap | Phase 30 / 30-HUMAN-UAT.md (UAT-30-01 live render/Grant/badge smoke) | human_needed | v0.9.99 Phase 30 |
| uat_gap | Phase 31 / live discovery UAT | human_needed | v0.9.99 Phase 31 |
| uat_gap | Phase 32 / 32-HUMAN-UAT.md (UAT-32-01 live self-healing) | human_needed; partial | v0.9.99 Phase 32 |
| uat_gap | Phase 33 / 33-HUMAN-UAT.md (live media playback fidelity) | human_needed | v0.9.99 Phase 33 |
| uat_gap | Phase 34 / 34-HUMAN-UAT.md (live upload fidelity) | human_needed | v0.9.99 Phase 34 |
| uat_gap | Phases 01/16/20/25 (v0.10/v0.11/v0.12 live-browser) | human_needed/partial | prior closes |

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; `npm publish fsb-mcp-server@0.10.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0 / v0.11.0 / v0.12.0; `clawhub publish "skills/FSB Skill"`; public package publication.

## Lattice Integration State (carried, INV-06 from prior milestone)

Runtime is `@full-self-browsing/lattice@1.4.0` via the `lattice` alias; pin/guardrails remain `.planning/LATTICE-PIN.md`, `package-lock.json` integrity, and `tests/lattice-public-package.test.js`. v0.9.99 reuses Lattice Ed25519/JCS receipts for recipe signature verification and the `run_task`/Lattice ResumePolicy survival machinery for in-flight fetch resume.

## Session Continuity

Last session: 2026-06-24
Stopped at: Created v1.0.0 roadmap (ROADMAP.md Phases 35-43, STATE.md, REQUIREMENTS.md traceability finalized — 17/17 mapped, 0 orphans). Denylist-first (35) and pipeline-before-content (36) ordering constraints encoded.
Resume file: None

## Next Actions

Plan Phase 35 (Denylist Expansion + Import-Time Classification Gate — DENY-01..04). This is the strict-first hard dependency: under the shipped opt-out Auto default the service-denylist is the ONE hard floor, so 6 finance apps + ToS-hostile apps must be denylist-classified BEFORE any descriptor that could reach them is emitted. Phase 35 owns denylist expansion + the import-time classification CI gate (fail-closed) + the DENY-04 posture-B sensitive-origin write re-gate + the vendored MIT snapshot/provenance scaffold + the `docs/LEGAL.md` ToS-axis update. Recommended: `/gsd-plan-phase 35`. Phase 36 (codegen pipeline + no-dead-entry `resolve()` branch) is the next research-flagged spike candidate. Existing live-browser UAT and release/publish actions remain carried-forward, user-gated debt; v1.0.0 does not block on them.
