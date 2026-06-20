---
gsd_state_version: 1.0
milestone: v0.9.99
milestone_name: Native Capability Catalog (FSB API Execution)
status: planning
stopped_at: Phase 26 context gathered (assumptions mode)
last_updated: "2026-06-20T03:39:03.859Z"
last_activity: 2026-06-19 — Roadmap created for v0.9.99; Phases 26-32 defined, 44/44 requirements mapped
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (v0.9.99 Native Capability Catalog milestone framing + INV-01..04)
See: .planning/ROADMAP.md (active milestone v0.9.99, Phases 26-32)
See: .planning/REQUIREMENTS.md (44 v1 requirements across 9 categories; 44/44 mapped, 0 unmapped)
See: .planning/research/SUMMARY.md (decision-ready synthesis; risk-first 7-phase ordering)
See: .planning/MILESTONES.md (prior milestones; v0.12.0 ended at Phase 25)

**Core value:** Reliable single-attempt execution — the AI decides correctly, the mechanics execute precisely. v0.9.99 extends this to a second execution path: call a service's real web API through the user's authenticated session (fast path), self-healing to DOM automation when the API path breaks.
**Current focus:** Phase 26 — Recipe Schema + Bundled Interpreter + MV3 CI Guard (the Wall-1 day-one invariant). Ready to plan.

## Current Position

Phase: 26 of 32 (Recipe Schema + Bundled Interpreter + MV3 CI Guard) — first phase of this milestone
Plan: — (none yet)
Status: Ready to plan
Last activity: 2026-06-19 — Roadmap created for v0.9.99; Phases 26-32 defined, 44/44 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Roadmap At A Glance (v0.9.99, Phases 26-32)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 26 | Recipe Schema + Bundled Interpreter + MV3 CI Guard | CAP-01..05 (5) | Not started |
| 27 | Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar | FETCH-01..05 (5) | Not started |
| 28 | Lean MCP Surface + Capability Search + Eval Harness | SURF-01..06 (6) | Not started |
| 29 | Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | CAT-01..05 (5) | Not started |
| 30 | Consent Governance + Recipe Signature Verification + Audit + Legal Posture | GOV-01..08, SIGN-01..02 (10) | Not started |
| 31 | Network-Capture Discovery + Recipe Synthesis + Learned Recipes | DISC-01..04, LEARN-01..04 (8) | Not started |
| 32 | Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | HEAL-01..05 (5) | Not started |

Coverage: 44/44 v1 requirements mapped, 0 orphaned.

Ordering principle (risk-first, all four researchers converge): Wall 1 (schema/CI guard) and Wall 2 (page-context fetch) are de-risked first; search needs invoke to exist; tiering + the autopilot path need one front door proven; consent must precede any auto/learning; discovery needs consent + memory + router to consume what it learns; self-heal needs the full stack.

## Hard Invariants (bind every phase)

- **INV-01:** existing ~63 MCP tool schemas stay byte-identical; the 2 new tools (`search_capabilities`, `invoke_capability`) register OUTSIDE `TOOL_REGISTRY` via `server.tool()`. (Schema-lock test green is the Phase 32 gate.)
- **INV-02:** autopilot reaches the capability engine via a `tool-executor` branch hitting the SAME `capability-router`; no parallel autopilot-only stack (runtime-layer parity, Phase 29).
- **INV-03:** capability + fallback paths work equally across all 7 `universal-provider.js` targets (cross-provider test gate is Phase 32).
- **INV-04:** the `agent-loop.js` `setTimeout`-chained iterator is load-bearing and untouched; invoke is a single bounded async op.

## Architectural Walls (non-negotiable, shape every phase)

- **Wall 1 (MV3 no remotely-hosted code):** server-delivered recipes are CLOSED-vocabulary DATA bound by a fixed bundled interpreter — never `eval`'d, never grown into server-authored control flow. CI guard fails on `eval`/`new Function`/`import(` reachable from the recipe path.
- **Wall 2 (execution context):** the authenticated fetch MUST run in the page MAIN world (existing `execute_js` seam) so first-party HttpOnly/SameSite cookies attach; a background-SW `fetch()` is the anti-pattern. CDP Network is discovery-only, never the invoke transport.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 0
- Most recent completed milestone: v0.12.0 PhantomStream Package Migration (5 phases, 19 plans; live Chrome-extension UAT user-gated).

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 26 | 0/TBD | - | - |

*Updated after each plan completion.*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md. Carried-forward invariants binding this milestone are INV-01..04 (above) plus the two architectural walls. No v0.9.99 phase-level decisions logged yet.

### Top Risks (from research — bake into phase planning)

- **Recipe interpreter drifts into "code fetched as data" → Web Store ban (Wall 1, Phase 26):** freeze a closed opcode/enum vocabulary; CI guard fails on `eval`/`new Function`/`import(`; treat the hardest/most-popular services as bundled imperative handlers, never recipes.
- **Replay fetch from the wrong context (extension origin) → auth silently absent (Wall 2, Phase 27):** issue same-origin authenticated calls from the page MAIN world; a smoke test must assert the logged-in (not logged-out) data shape from a real HttpOnly site.
- **Credential-replay weapon / "safe brand" inversion (Phase 30):** default-OFF per origin; Off/Ask/Auto (Auto explicit per-origin, never global); origin-pinning in the interpreter; sign/verify server recipes; mutation gating; sensitive-origin friction.
- **Auth/recipe data routed off-device → exfiltration + Limited-Use violation (Phases 30/31):** auth strictly local; redact at capture time before persist/promote/egress; learned recipes store shape only; tested redactor asserts no auth substrings survive.
- **Recipe rot → confidently-wrong/empty results (Phase 32, the designed steady state):** stamp captured-at + schema hash; validate each response against an expected-shape assertion → typed `RECIPE_EXPIRED`; self-heal to DOM and re-learn; quarantine repeat failures.
- **Capability-search recall/precision failure (Phase 28):** index intent-phrased synonyms + service + action verb + side-effect class; disambiguate before any mutating invoke; eval harness (recall@k + wrong-invoke) gates the milestone.
- **MV3 SW eviction mid-API-call → lost in-flight request, ambiguous mutation (Phase 27):** reuse the `run_task` Phase 239 resume-sidecar + Lattice ResumePolicy; treat ambiguous mid-mutation as `RECOVERY_AMBIGUOUS` — never blind-retry.

### Research Flags (phases likely needing a `--research-phase` spike at plan time)

- **Phase 26 (recipe schema):** the highest-risk design artifact — the closed vocabulary must cover the realistic long tail yet be provably non-Turing-complete; needs a schema-design + RHC-line spike.
- **Phase 27 (fetch primitive):** spike capture/replay fidelity for CSRF/ephemeral tokens (per-session vs per-request nonce, Slack xoxc/xoxd split, persisted-query hash) and the `getResponseBody` > ~1 MB limit — these size the head/tail/DOM-fallback split.
- **Phase 31 (discovery):** spike CDP Network capture details (maxPostDataSize, extraInfo raw-header/cookie events, detach/restore so the existing Input emulation isn't disrupted) and the redactor's completeness test.
- **Phase 32 (self-heal):** spike the failure-detection taxonomy (which signals → DOM fallback without masking legitimate "no results") and the mutation-ambiguity recovery policy.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and carried forward from previous milestone closes (Chrome MV3/manual UAT evidence gaps, not fabricated passes; procedures archived under `.planning/milestones/*/`):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 01 / 01-HUMAN-UAT.md | partial; 1 pending scenario | v0.10.0 close |
| verification_gap | Phases 01-05, 08-12 / *-VERIFICATION.md | human_needed | v0.10.0 close |
| uat_gap | Phase 16 / 16-HUMAN-UAT.md | partial; 4 pending live-browser scenarios | v0.11.0 close |
| uat_gap | Phase 20 / 20-HUMAN-UAT.md | human_needed; 12 live-browser/composed trigger scenarios | v0.11.0 close |
| uat_gap | Phase 25 / 25-HUMAN-UAT.md | human_needed; 12 live Chrome-extension PhantomStream scenarios | v0.12.0 close |

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; `npm publish fsb-mcp-server@0.10.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0 / v0.11.0 / v0.12.0; `clawhub publish "skills/FSB Skill"`; public package publication; 4 live-OpenClaw runtime UAT items; 12 Phase 20 live-browser/composed trigger UAT items; 12 Phase 25 live Chrome-extension PhantomStream UAT items.

## Lattice Integration State (carried, INV-06 from prior milestone)

Runtime is `@full-self-browsing/lattice@1.4.0` via the `lattice` alias; pin/guardrails remain `.planning/LATTICE-PIN.md`, `package-lock.json` integrity, and `tests/lattice-public-package.test.js`. v0.9.99 reuses Lattice Ed25519/JCS receipts for recipe signature verification (SIGN-01/02, Phase 30) and the `run_task`/Lattice ResumePolicy survival machinery for in-flight fetch resume (FETCH-04, Phase 27).

## Session Continuity

Last session: 2026-06-20T03:39:03.855Z
Stopped at: Phase 26 context gathered (assumptions mode)
Resume file: .planning/phases/26-recipe-schema-bundled-interpreter-mv3-ci-guard/26-CONTEXT.md

## Next Actions

Plan Phase 26 with `/gsd:plan-phase 26`. Phase 26 is the Wall-1 foundation (recipe schema + bundled interpreter + CI guard) and is flagged as the highest-risk design artifact of the milestone — a schema-design + RHC-line spike at plan time is recommended. Existing v0.10/v0.11/v0.12 live-browser UAT and release/publish actions remain carried-forward, user-gated debt.
