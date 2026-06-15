---
phase: 1
slug: lattice-gap-survey-scaffold
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md#validation-architecture` + `01-CONTEXT.md` reconciliation block (Option B selected — D-09 / D-12 #3 amended).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain `node tests/foo.test.js` invocation — FSB convention; no `node:test`; manual `pass()` / `fail()` counters per existing files (`tests/install-identity.test.js`, `tests/agent-loop-empty-contents.test.js`) |
| **Config file** | none — each test is a self-contained Node script |
| **Quick run command** | `node tests/lattice-smoke.test.js` |
| **Full suite command** | `npm test` (long `&&` chain — Phase 1 appends `&& node tests/lattice-smoke.test.js` at the end after `agent-loop-empty-contents.test.js`) |
| **Estimated runtime** | ~2 seconds quick; full `npm test` chain unchanged from baseline (~minutes) |

---

## Sampling Rate

- **After every task commit:** `node tests/lattice-smoke.test.js` (quick local feedback)
- **After every plan wave:** `npm test` (full chain, includes the new smoke at the end)
- **Before `/gsd-verify-work`:** Full `npm test` green + Lattice-side audit doc visible on `fsb-integration-experiments` HEAD + manual MV3 sanity reload evidence captured in SUMMARY
- **Max feedback latency:** 5 seconds for quick run

---

## Per-Task Verification Map

> Task IDs will be finalized by gsd-planner; this table maps Phase 1 pass criteria + INV checks. `T-1-XX` threat refs deferred -- Phase 1 introduces no security-sensitive surface beyond what Lattice already ships and what FSB already has (per threat-model gate in step 5.55, planner adds threat block).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-XX | 01 | 1 | D-12 #2 (Node smoke green) | — | smoke uses ephemeral Ed25519 keypair generated per-run (no committed keys); receipt body has no PII | unit | `node tests/lattice-smoke.test.js` | W0 | pending |
| 1-01-XX | 01 | 1 | D-12 #2 (verify round-trip) | — | `verifyReceipt` typed result; never throws — Lattice contract | unit | `node tests/lattice-smoke.test.js` (same test asserts `result.ok === true`) | W0 | pending |
| 1-01-XX | 01 | 1 | INV-01 MCP wire UNTOUCHED | — | tool-definitions parity preserved | unit | `node tests/tool-definitions-parity.test.js` | yes | pending |
| 1-01-XX | 01 | 1 | INV-04 setTimeout iterator preserved | — | `extension/ai/agent-loop.js` lines `1824/2418/2487/2497` unchanged | grep | `grep -c "setTimeout" extension/ai/agent-loop.js` (count unchanged) | yes | pending |
| 1-01-XX | 01 | 1 | npm test full chain green | — | no regression in any existing test | suite | `npm test` | yes | pending |
| 1-01-XX | 02 | 2 | D-12 #1 (audit doc landed) | — | `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments`; 6 domain sections; severity column on every row | manual-only | `cd lattice && git show fsb-integration-experiments:docs/fsb-integration-gaps.md \| head -100` + visual scan | W0 | pending |
| 1-01-XX | 02 | 2 | D-08 + D-16 (LATTICE-PIN.md schema) | — | `.planning/LATTICE-PIN.md` exists with markdown-table schema; entry for Phase 1 includes commit SHA + branch | grep | `grep -c "fsb-integration-experiments" .planning/LATTICE-PIN.md` ≥ 1 | W0 | pending |
| 1-01-XX | 03 | 3 | D-12 #3 (manual MV3 sanity, AMENDED per Option B) | — | extension reloads cleanly; no NEW SW or console errors caused by Phase 1's tree additions; existing extension features still work (popup open, sidepanel open, an existing autopilot iteration) | manual-only | n/a — captured in PHASE-SUMMARY as screenshot + log excerpt | W0 | pending |
| 1-01-XX | 03 | 3 | Lattice-side index.ts re-export (D-13 narrowed) | — | `lattice/packages/lattice/src/index.ts` re-exports `createReceipt` after pnpm build; smoke can import via bare specifier | unit | smoke test resolution proves it; `grep -c "export.*createReceipt" lattice/packages/lattice/src/index.ts` ≥ 1 | W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `tests/lattice-smoke.test.js` — covers D-12 #2 (one receipt minted + verified via Lattice's existing v1.1 surface)
- [ ] `.planning/LATTICE-PIN.md` — covers D-08 / D-16 (cross-repo audit trail + single FSB-side index)
- [ ] `lattice/docs/fsb-integration-gaps.md` — covers D-02 / D-12 #1 (audit doc on Lattice's `fsb-integration-experiments` branch)
- [ ] `lattice/packages/lattice/src/index.ts` modification — covers D-13 narrowed (single-line `createReceipt` re-export); required for the smoke's bare-specifier import to resolve
- [ ] `package.json` modification — covers D-05 (`"lattice": "file:./lattice/packages/lattice"` dependency) and D-11 (`scripts.test` chain extension)
- [ ] Developer ceremony documented — `cd lattice && pnpm install && pnpm build` step captured in PLAN's Setup task / README addition per D-07

*No test framework install required (FSB uses raw `node`).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Audit doc exists on Lattice's `fsb-integration-experiments` branch with 6 domain sections and a Severity column | D-12 #1 | Lattice repo is separate git tree (gitignored from FSB's git); no FSB CI hook reaches into Lattice | (1) `cd lattice` (2) `git fetch && git log fsb-integration-experiments --oneline` (3) `git show fsb-integration-experiments:docs/fsb-integration-gaps.md \| head -200` (4) visually confirm `## Receipts`, `## Tripwires/hooks`, `## Providers`, `## Delegation`, `## MV3-survivability`, `## Observability/step-markers` (or equivalent) sections exist; `Severity` column present on every row |
| Extension reloads cleanly with Phase 1's tree additions, no NEW errors | D-12 #3 (AMENDED per Option B) | Chrome MV3 SW console output is not directly readable from CI; Phase 1 does not introduce a bundler or SW migration to enable in-extension Lattice import (deferred to a future phase) | (1) `chrome://extensions` -> reload unpacked FSB (2) open SW DevTools, confirm no NEW errors beyond pre-Phase-1 baseline (3) open extension popup; open sidepanel; trigger one autopilot iteration; confirm existing flows still work (4) capture screenshots + console excerpt into the phase SUMMARY |
| Lattice SHA captured in LATTICE-PIN.md | D-08 | The SHA is recorded at commit time; planner must include a task that fills it from `cd lattice && git rev-parse fsb-integration-experiments` after Phase 1's Lattice-side commits land | (1) the executor runs the rev-parse during the Lattice-commits task; (2) the PIN.md update is committed in the same FSB commit; (3) reviewer confirms PIN entry SHA matches Lattice branch HEAD |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (smoke, PIN.md, audit doc, index.ts re-export, package.json edit)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s for quick run
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after plan-checker passes)

**Approval:** pending
