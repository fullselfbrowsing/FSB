---
phase: 11
slug: tab-aware-side-panel-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Frame derived from 11-RESEARCH.md Validation Architecture section. Plan-checker iteration will tighten this contract before execution begins.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node --test (existing FSB harness; sample at tests/*.test.js) |
| **Config file** | none — Wave 0 extends existing `package.json` scripts.test chain |
| **Quick run command** | `node --test tests/sidepanel-tab-aware-smoke.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~12s for the phase smoke; ~90s for full suite |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/sidepanel-tab-aware-smoke.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must exit 0 (`npm test`)
- **Max feedback latency:** ~12 seconds (quick) / ~90 seconds (full)

---

## Per-Task Verification Map

> Populated by the planner during plan-checker iteration. Each task in 11-NN-PLAN.md gets a row mapping to the test file + Part assertion it activates.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-00-01 | 00 | 0 | (scaffold) | n/a | smoke file existence | unit | `node --test tests/sidepanel-tab-aware-smoke.test.js` | ❌ W0 | ⬜ pending |
| 11-01-NN | 01 | 1 | FINT-19 | (none) | friendly client label resolved from lifecycle entry; short-prefix fallback when no entry exists | unit | `node --test tests/sidepanel-tab-aware-smoke.test.js` | ❌ W0 | ⬜ pending |
| 11-02-NN | 02 | 2 | FINT-20 | (none) | all 4 input controls disabled when foreign-owned; re-enabled on free-tab activation | unit | `node --test tests/sidepanel-tab-aware-smoke.test.js` | ❌ W0 | ⬜ pending |
| 11-03-NN | 03 | 3 | FINT-21 | (none) | per-tab conversation map persists across SW restart; LRU eviction at 51st tab; lazy mint on first message | unit | `node --test tests/sidepanel-tab-aware-smoke.test.js` | ❌ W0 | ⬜ pending |
| 11-04-NN | 04 | 4 | (ceremony) | n/a | REQUIREMENTS.md FINT-19/20/21 narrative + traceability rows complete; LATTICE-PIN.md Phase 11 row appended | docs | grep assertions in smoke Part 7 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sidepanel-tab-aware-smoke.test.js` — Part 1 (lookupClientLabel) + Part 2 (three-tier resolution) + Part 3 (lockout DOM gating) + Part 4 (lockout runtime gate + CSS class assertions) + Part 5 (envelope CRUD + LRU eviction) + Part 6 (migration from single-key envelope) + Part 7 (INV byte-freeze regression: setTimeout count + Phase 11 files only)
- [ ] Chrome API mocks — `chrome.tabs`, `chrome.storage.session`, `chrome.runtime` (sample shape from existing tests/agent-registry-smoke.test.js if it exists; otherwise from tests/lattice-survivability-smoke.test.js Phase 9 baseline)
- [ ] DOM fixture — minimal sidepanel.html `<div id="ownerChip">` + `<textarea id="chatInput">` + button stubs for `sendBtn`, `micBtn`, `stopBtn`. Loaded via `jsdom`-equivalent or a simple object-mock pattern matching prior FSB smoke conventions.
- [ ] `package.json` scripts.test chain extended with the new smoke file path

*Existing infrastructure (node --test framework, chrome mock patterns from Phase 5/8/9/10 smokes) covers all phase requirements once Wave 0 lands the new smoke file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome MV3 side panel visual rendering with multiple real tabs + history swap | FINT-19/20/21 end-to-end | Visual + multi-tab Chrome session cannot be reproduced in Node-mock land | Defer to UAT-11 procedure documented in 11-VERIFICATION.md Human Verification section once execute-phase completes. Run alongside the existing deferred UAT-08+09+10 in one Chrome MV3 reload session per CONTEXT D-22. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s for quick + < 90s for full
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — planner finalizes Per-Task Verification Map during plan-checker iteration; flips frontmatter to `nyquist_compliant: true` once all task rows are mapped.
