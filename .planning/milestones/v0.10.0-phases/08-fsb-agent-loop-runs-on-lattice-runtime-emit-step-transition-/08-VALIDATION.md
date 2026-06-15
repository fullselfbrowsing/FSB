---
phase: 8
slug: fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Consolidated from 08-RESEARCH.md Section 10 (Validation Architecture).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:assert/strict` + plain functions (NOT vitest, NOT jest). Matches FSB convention from Phases 1-7. |
| **Config file** | None — smoke test files are self-contained Node scripts. |
| **Quick run command** | `node tests/lattice-step-emitter-smoke.test.js` |
| **Full suite command** | `npm test` (existing 8-smoke chain extended with the Phase 8 step-emitter smoke as a new tail entry) |
| **Estimated runtime** | Quick: ~2-5s. Full chain: ~30-45s (based on Phase 7 timing data). |
| **No new dependencies** | Additive only — `lattice` already pinned at `file:./lattice/packages/lattice @ e95067bf` since Phase 1. No npm install. |

---

## Sampling Rate

- **After every task commit:** Run `node tests/lattice-step-emitter-smoke.test.js` (~2-5s).
- **After every plan wave:** Run `npm test` (full chain ~30-45s).
- **Before `/gsd-verify-work`:** Full suite green + per-axis UAT-08 PASS in Chrome MV3 reload session (D-06 procedure).
- **Phase gate:** Verifier emits `human_needed` for UAT-08 (Chrome reload session, ~3-5 min, user-driven; pattern mirrors Phase 7 Plan 07-04 DEFER precedent).
- **Max feedback latency:** ~5s per task; ~45s per wave; ~5 min for UAT-08.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | FINT-10 | SW-side `sendLatticeStepTransition` module exists with dual export + boot log | unit | `node tests/lattice-step-emitter-smoke.test.js` Part 1 | W0 (new file) | pending |
| 08-01-02 | 01 | 0 | FINT-10 | Envelope shape conforms to Phase 5 D-16 contract | unit | `node tests/lattice-step-emitter-smoke.test.js` Part 2 | W0 (new file) | pending |
| 08-01-03 | 01 | 0 | FINT-10 | `extension/background.js` loads emitter via importScripts at alphabetical line 13 | integration | `grep -c "importScripts('ai/lattice-step-emitter.js')" extension/background.js == 1` + `npm test` green | W0 | pending |
| 08-02-01 | 02 | 1 | FINT-11 | agent-loop emits LLM_TURN step.transition AFTER `session.messages.push(assistantMsg)` (post-line 1854) | integration | `node tests/lattice-step-emitter-smoke.test.js` Part 3 (LLM_TURN assertion) | W1 (extends W0 file) | pending |
| 08-02-02 | 02 | 1 | FINT-11 | agent-loop emits TOOL_DISPATCH step.transition INSIDE `for(var ci...)` loop AFTER permission check | integration | `node tests/lattice-step-emitter-smoke.test.js` Part 3 (TOOL_DISPATCH assertion) | W1 | pending |
| 08-02-03 | 02 | 1 | FINT-12 | Receipt mint round-trip end-to-end (offscreen handler at lattice-host.js:295-371 receives + invokes createCheckpointHook + replies with `lattice-receipt-minted`) | smoke | `node tests/lattice-checkpoint-smoke.test.js` (EXISTING — 72 PASS — must stay green) + Phase 8 smoke Part 5 (envelope capture via chrome.runtime.sendMessage mock) | Existing + W1 | pending |
| 08-02-04 | 02 | 1 | INV-04 | `grep -c "setTimeout" extension/ai/agent-loop.js == 8` post-task | regression | `node tests/lattice-step-emitter-smoke.test.js` Part 4 (INV-04 byte-freeze) + awk-scan: no `sendLatticeStepTransition` inside any `setTimeout(...)` lambda body | W1 | pending |
| 08-02-05 | 02 | 1 | INV-06 | Lattice SHA byte-frozen at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | regression | `cd lattice && git rev-parse HEAD` returns exactly the frozen SHA | Existing | pending |
| 08-02-06 | 02 | 1 | INV-01 + INV-02 | tool-definitions parity untouched | regression | `node tests/tool-definitions-parity.test.js` (EXISTING — 142 PASS — must stay green) | Existing | pending |
| 08-03-01 | 03 | 1 | FINT-10 + FINT-11 + FINT-12 | REQUIREMENTS.md introduces FINT-10/11/12; FINT-04 partial → complete; FINT-NN..M retired; Total v1 32 → 35; Last updated 2026-05-31 | doc | `grep -E "FINT-10\\|FINT-11\\|FINT-12" .planning/REQUIREMENTS.md` returns 3+ matches; `grep "Total v1.*35" .planning/REQUIREMENTS.md` returns 1 | W1 | pending |
| 08-03-02 | 03 | 1 | INV-06 | LATTICE-PIN.md Phase 8 row appended with `current_lattice_sha` UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | doc | `grep -c "Phase 8" .planning/LATTICE-PIN.md` >= 1 AND frontmatter `current_lattice_sha:` line unchanged | W1 | pending |
| 08-03-03 | 03 | 1 | (audit closure) | v0.10.0-MILESTONE-AUDIT.md gap G1 `documented_carryforward_low` → `closed_in_phase_8`; Flow 4 `partial_by_design_per_D-22` → `complete`; status_history extended; last_revised bumped | doc | `grep "closed_in_phase_8" .planning/v0.10.0-MILESTONE-AUDIT.md` returns 1+; G3 line untouched | W1 | pending |
| UAT-08 | — | post-phase | (human verification) | Chrome MV3 reload session: SW console shows `lattice-step-transition` envelopes per step boundary; offscreen console shows `lattice-receipt-minted` (or `lattice-receipt-mint-failed: no-signer` — acceptable); existing autopilot iteration completes without INV-04 regression | manual | DevTools console observation per D-06 procedure | Manual (08-VERIFICATION.md UAT-08 section) | deferred |

*Status: pending · green · red · flaky · deferred · resolved*

---

## Wave 0 Requirements

- [ ] `extension/ai/lattice-step-emitter.js` — the sender module itself (~80 lines, dual-export idiom)
- [ ] `tests/lattice-step-emitter-smoke.test.js` — Wave 0 scaffold with 6 Parts; Parts 1+2 fully filled (>= 12 PASS baseline); Parts 3-6 stubbed for Wave 1 fill
- [ ] `extension/background.js` importScripts line added at alphabetical position 13 (between `lattice-provider-bridge.js` and `ai-integration.js`)
- [ ] `package.json` scripts.test chain extended (append step-emitter-smoke as final entry; existing 8-smoke chain BYTE-FROZEN per cumulative carryforward)

No framework install required — Node built-in `assert/strict` sufficient.

---

## Wave 1 Requirements

- [ ] `extension/ai/agent-loop.js` — two emission call sites added (LLM_TURN at post-1854; TOOL_DISPATCH inside loop after permission check). Each guarded by `if (typeof sendLatticeStepTransition === 'function')` defensive check; both fire-and-forget.
- [ ] `tests/lattice-step-emitter-smoke.test.js` — Parts 3 (LLM_TURN + TOOL_DISPATCH assertions), 4 (INV-04 byte-freeze including setTimeout count + iterator pattern + Pitfall 1 awk-scan), 5 (Phase 6 chrome.runtime.sendMessage mock pattern; capture envelope shape), 6 (INV-01/02/05 byte-freeze regression). Total smoke target: >= 25 PASS.
- [ ] `.planning/REQUIREMENTS.md` — FINT-10/11/12 added with narrative + traceability; FINT-04 status partial → complete; FINT-NN..M retired; Total v1 32 → 35; Last updated 2026-05-31.
- [ ] `.planning/LATTICE-PIN.md` — Phase 8 row appended (SHA unchanged per D-04 verdict + INV-06).
- [ ] `.planning/v0.10.0-MILESTONE-AUDIT.md` — gap G1 closed; Flow 4 complete; status_history extended.

---

## Nyquist Receipt Count Expectation

For a typical autopilot iteration (1 LLM round-trip + 2 tool calls), Phase 8 produces:
- 1 LLM_TURN `step.transition` → 1 v1.1 Capability Receipt minted
- 2 TOOL_DISPATCH `step.transition` → 2 v1.1 Capability Receipts minted
- **Total: 3 receipts per iteration**

For a 5-iteration autopilot session: ~15 receipts minted in ~30 seconds. The signer is in-process ephemeral Ed25519 (no network call), so receipt cost is negligible (<1ms per mint per Phase 3 timing data). No throughput concern.

---

## Dimension 8 Coverage Matrix

| Dimension | Requirement | Coverage Plan |
|-----------|-------------|---------------|
| 8a Framework declared | ✓ | `node:assert/strict` (no install) |
| 8b Per-task verifiable | ✓ | Every task has a grep/test/file-read assertion in plan acceptance criteria |
| 8c Wave 0 stubs first | ✓ | Plan 08-01 establishes smoke baseline >= 12 PASS before Wave 1 begins |
| 8d Wave gating sampling rate | ✓ | Quick command per task; full chain per wave; full chain + UAT-08 before phase complete |
| 8e VALIDATION.md companion to RESEARCH.md | ✓ | This file |
| 8f Per-requirement mapping | ✓ | FINT-10 → 08-01 tasks; FINT-11/12 → 08-02 tasks; INV-04/06 → 08-02 regression checks; audit closure → 08-03 doc tasks |
| 8g Manual UAT scoped | ✓ | UAT-08 deferred per D-06; pattern from Phase 7 Plan 07-04 |

---

## Post-Phase Status Flip

After all 3 plans execute green + UAT-08 PASS:
- Update frontmatter: `status: ready` (currently `draft`)
- Update frontmatter: `nyquist_compliant: true` (currently `false`)
- Update frontmatter: `wave_0_complete: true` (currently `false`)
- Set table Status column entries to `green` per task
- Append UAT-08 verdict to "Wave 1 Requirements" checklist

This file is the contract; 08-VERIFICATION.md records the verdict.
