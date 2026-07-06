---
phase: 9
slug: fsb-survivabilityadapter-activated-for-mv3-sw-eviction-resum
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Consolidated from 09-RESEARCH.md Section 10 (Validation Architecture).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node raw runtime (no mocha/jest/vitest); manual PASS/FAIL counters; `process.exit(failed > 0 ? 1 : 0)` per FSB convention. |
| **Config file** | None — tests are standalone `.test.js` files chained via `package.json scripts.test` `&&` chain. |
| **Quick run command** | `node tests/lattice-survivability-smoke.test.js` |
| **Full suite command** | `npm test` (existing chain + Phase 8 step-emitter smoke + Phase 9 survivability extension) |
| **Estimated runtime** | Quick: ~3-5s. Full chain: ~30-45s. |
| **No new dependencies** | Lattice already pinned at `file:./lattice/packages/lattice @ e95067bf` since Phase 1. Phase 9 ships zero npm install changes. |

---

## Sampling Rate

- **After every task commit:** `node tests/lattice-survivability-smoke.test.js` (full Part 1-6 run; ~3-5s wall-clock).
- **After every plan wave:** `npm test` (full chain).
- **Before `/gsd-verify-phase 9`:** `npm test` exits 0 + Phase 8 smoke baseline holds (38 PASS regression check inside Phase 9 smoke).
- **Phase gate:** Verifier emits `human_needed` for UAT-09 (Chrome MV3 reload session, ~3-5 min, deferred to consolidated end-of-milestone UAT per D-07 + user 2026-05-31 directive).
- **Max feedback latency:** ~5s per task; ~45s per wave.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | FINT-13 | `globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED === true` after SW boot via background.js line 13 area | smoke | `node tests/lattice-survivability-smoke.test.js` (Part 6.1) | existing scaffold | pending |
| 09-01-02 | 01 | 1 | FINT-15 (restore + adapter stash) | runAgentLoop entry queries `chrome.storage.session` for snapshot; `session._latticeAdapter` stashed for downstream sidecar reuse; ResumePolicy logged; no `SAFE_REPLAY` literal | smoke + grep | `node tests/lattice-survivability-smoke.test.js` (Part 6.2 + 6.3) + `! grep -q "SAFE_REPLAY" extension/ai/agent-loop.js` | existing scaffold | pending |
| 09-02-01 | 02 | 2 | FINT-14 (markers) | All 3 `session._currentStepName = '<marker>'` writes present; INV-04 awk-scan empty inside lambdas; 4-marker vocab matches adapter switch | smoke (content discovery + regex) | `node tests/lattice-survivability-smoke.test.js` (Part 6.4) + `grep -c "setTimeout" extension/ai/agent-loop.js === 8` | existing scaffold | pending |
| 09-02-02 | 02 | 2 | FINT-14 (sidecars) | `session._latticeAdapter.serialize(session)` invoked from EXACTLY 2 in-flight persist sites (1840 + 2474); 14 terminal sites NOT touched | smoke (mock storage + roundtrip) + grep count | `node tests/lattice-survivability-smoke.test.js` (Part 6.1 + 6.2) + `grep -c "session\._latticeAdapter\.serialize" extension/ai/agent-loop.js === 2` | existing scaffold | pending |
| 09-02-03 | 02 | 2 | FINT-15 (LRU) | Write 51 snapshots; assert ≤50 remain; oldest evicted | smoke (mock `chrome.storage.session`) | `node tests/lattice-survivability-smoke.test.js` (Part 6.5) | existing scaffold | pending |
| 09-02-04 | 02 | 2 | FINT-15 (ResumePolicy classification) | Only 4 literal members reachable; no `SAFE_REPLAY` regression; markers map correctly to `ON_ERROR_SW_EVICTION_MID_REQUEST` / `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH` / `RECOVERY_AMBIGUOUS` / `SAFE` | smoke (synthesize 4 markers; cross-check Lattice survivability.ts on disk) | `node tests/lattice-survivability-smoke.test.js` (Part 6.3) | existing scaffold | pending |
| 09-02-05 | 02 | 2 | INV-04 | `grep -c "setTimeout" extension/ai/agent-loop.js === 8` + 4 iterator pattern + awk-scan empty for `_currentStepName` inside any setTimeout lambda body | regression | `node tests/lattice-survivability-smoke.test.js` (Part 6.4) | existing scaffold | pending |
| 09-02-06 | 02 | 2 | INV-06 | `LATTICE-PIN.md current_lattice_sha === e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | regression | `node tests/lattice-survivability-smoke.test.js` (Part 6 carryforward) | existing scaffold | pending |
| 09-02-07 | 02 | 2 | Phase 8 carryforward | `tests/lattice-step-emitter-smoke.test.js` still passes >= 38 (no regression) | regression | full `npm test` chain | existing chain | pending |
| 09-03-01 | 03 | 2 | FINT-13/14/15 | REQUIREMENTS.md FINT-13/14/15 narrative + traceability rows; Total v1 35 → 38; Last updated 2026-05-31 | doc | `grep -E "FINT-13\|FINT-14\|FINT-15" .planning/REQUIREMENTS.md` returns 3+ matches; `grep "Total v1.*38" .planning/REQUIREMENTS.md` returns 1 | created in plan | pending |
| 09-03-02 | 03 | 2 | INV-06 | LATTICE-PIN.md Phase 9 row appended with SHA UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | doc | `grep -c "Phase 9" .planning/LATTICE-PIN.md >= 1` AND frontmatter `current_lattice_sha:` UNCHANGED | created in plan | pending |
| 09-03-03 | 03 | 2 | audit closure | v0.10.0-MILESTONE-AUDIT.md G2 status `documented_carryforward_low` → `closed_in_phase_9`; status_history extended; last_revised bump | doc | `grep "closed_in_phase_9" .planning/v0.10.0-MILESTONE-AUDIT.md` returns 1+ | created in plan | pending |
| UAT-09 | — | post-phase | (human verification) | Chrome MV3 reload session: SW boot flag-on; restore round-trip; LRU eviction; autopilot iteration completes; ResumePolicy logged correctly per marker | manual | DevTools console observation per UAT-09 procedure in 09-VERIFICATION.md | deferred (consolidated UAT with UAT-08 + UAT-10) | deferred |

*Status: pending · green · red · flaky · deferred · resolved*

---

## Wave 1 Requirements (Plan 09-01)

- [ ] `extension/background.js`: flag flip line at line 13 area (immediately after Phase 8 `importScripts('ai/lattice-step-emitter.js')`).
- [ ] `extension/ai/agent-loop.js:~1215`: runAgentLoop entry restore site with adapter stash on `session._latticeAdapter`.
- [ ] `tests/lattice-survivability-smoke.test.js`: Part 6 stub (Wave 0 baseline; empty placeholder allowing &&-chain to stay green while Plan 09-02 fills assertions).

## Wave 2 Requirements (Plan 09-02 + Plan 09-03)

- [ ] `extension/ai/agent-loop.js`: 3 `session._currentStepName = '<marker>'` writes at sites verified by RESEARCH (BEFORE_API_REQUEST ~before bridge call; BEFORE_TOOL_EXECUTION at line 1973; BEFORE_NEXT_ITERATION_SCHEDULE at line 2497).
- [ ] `extension/ai/agent-loop.js`: 2 `session._latticeAdapter.serialize(session)` sidecars at line 1840 + 2474; 14 terminal persist sites NOT touched.
- [ ] `extension/ai/lattice-runtime-adapter.js`: LRU cap enforcement helper (`enforceLruCap`) inside `persistInternal` callback; default cap 50.
- [ ] `tests/lattice-survivability-smoke.test.js`: Part 6 fill (Parts 6.1-6.5; >= 17 PASS) covering flag-on / restore / 4-marker ResumePolicy / INV-04 byte-freeze / LRU eviction.
- [ ] `.planning/REQUIREMENTS.md`: FINT-13/14/15 narrative + traceability; Total v1 35 → 38; Last updated 2026-05-31.
- [ ] `.planning/LATTICE-PIN.md`: Phase 9 row (SHA unchanged per RESEARCH Section 2).
- [ ] `.planning/v0.10.0-MILESTONE-AUDIT.md`: G2 closed_in_phase_9; status_history extended.

---

## Receipt Count Expectation (Phase 8 carryforward)

Phase 8 Plan 08-02 finalized `tests/lattice-step-emitter-smoke.test.js` at >= 25 PASS / 0 FAIL (38 actual). Phase 9 MUST NOT regress this. Plan 09-02 smoke fill includes a Phase 8 carryforward check asserting the baseline holds.

For Phase 9's own smoke: Part 6 target >= 17 PASS (matches research recommendation). Wave 0 baseline (Plan 09-01 stub) = 0 PASS in Part 6; Wave 1 fill (Plan 09-02) brings Part 6 to >= 17 PASS.

---

## Dimension 8 Coverage Matrix

| Dimension | Requirement | Coverage Plan |
|-----------|-------------|---------------|
| 8a Framework declared | done | Node raw runtime (no install) |
| 8b Per-task verifiable | done | Every task has grep/test/file-read assertion in plan acceptance criteria |
| 8c Wave 0 stubs first | done | Plan 09-01 establishes Part 6 stub (Wave 0 baseline) before Wave 1 fills |
| 8d Wave gating sampling rate | done | Quick command per task; full chain per wave; full chain + UAT-09 deferred before phase complete |
| 8e VALIDATION.md companion to RESEARCH.md | done | This file |
| 8f Per-requirement mapping | done | FINT-13 → 09-01 Task 1; FINT-14 → 09-02 Tasks 1-2; FINT-15 → 09-01 Task 2 + 09-02 Tasks 3-4 |
| 8g Manual UAT scoped | done | UAT-09 deferred per D-07 (consolidated end-of-milestone UAT with UAT-08 + UAT-10) |

---

## SAFE_REPLAY Guardrail

Per RESEARCH Section 2 + 6, Phase 9 plans MUST NOT introduce `SAFE_REPLAY` literal. Lattice's `ResumePolicy` is a 4-member union (`SAFE | RECOVERY_AMBIGUOUS | ON_ERROR_SW_EVICTION_MID_REQUEST | ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH`); introducing a 5th literal triggers INV-06 carve-out + SHA bump (REJECTED). Plan 09-01 Task 2 + Plan 09-02 Task 4 enforce zero-hits assertion via grep.

---

## Post-Phase Status Flip

After all 3 plans execute green:
- Update frontmatter: `status: ready` (currently `draft`)
- Update frontmatter: `nyquist_compliant: true` (currently `false`)
- Update frontmatter: `wave_0_complete: true` (currently `false`)
- Set table Status column entries to `green` per task
- UAT-09 stays `deferred` until consolidated end-of-milestone UAT runs.
