---
phase: 11
slug: tab-aware-side-panel-surface
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-07
updated: 2026-06-07
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Frame derived from 11-RESEARCH.md Validation Architecture section + 11-NN-PLAN.md per-task verification. Plan-checker iteration confirmed all tasks have automated verify or Wave 0 scaffolding dependencies.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node-native assert + PASS/FAIL counter (FSB convention; sample at tests/lattice-step-emitter-smoke.test.js, tests/mcp-philosophy-parity-smoke.test.js) |
| **Config file** | none — Plan 11-00 extends existing `package.json` scripts.test &&-chain |
| **Quick run command** | `node tests/sidepanel-tab-aware-smoke.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~12s for the phase smoke; ~120s for full chain |

---

## Sampling Rate

- **After every task commit:** Run `node tests/sidepanel-tab-aware-smoke.test.js` (quick feedback).
- **After every plan wave:** Run `npm test` (full suite green check).
- **Before `/gsd-verify-work`:** Full suite must exit 0 (`npm test`).
- **Max feedback latency:** ~12 seconds (quick) / ~120 seconds (full).

---

## Per-Task Verification Map

> Populated by the planner. Each task in 11-NN-PLAN.md maps to the test file + Part assertion it activates.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-00-01 | 00 | 0 | (scaffold) | T-11-00-01 | sidecar pure helpers + dual-export; envelope shape validation rejects corruption | unit + integration | `node -e "..."` per task verify block | ❌ → ✅ (Plan 11-00 creates) | ⬜ pending |
| 11-00-02 | 00 | 0 | (scaffold) | T-11-00-02 | sidepanel.html script-tag insertion; sidepanel.css `.fsb-owner-chip` baseline | static | inline node script per task verify | ❌ → ✅ (Plan 11-00 creates) | ⬜ pending |
| 11-00-03 | 00 | 0 | (scaffold) | T-11-00-04 | new smoke harness with 7 Part placeholders; chrome mocks; DOM stubs | unit | `node tests/sidepanel-tab-aware-smoke.test.js` (7 PASS Wave 0) | ❌ → ✅ (Plan 11-00 creates) | ⬜ pending |
| 11-01-01 | 01 | 1 | FINT-19 | T-11-01-01 | lookupClientLabel async helper validates input + reads `mcpVisualSession:<tabId>` + returns trimmed entry.client or null | unit | `node -e "..."` per task verify (8 internal assertions) | ✅ (Plan 11-00) | ⬜ pending |
| 11-01-02 | 01 | 1 | FINT-19 | T-11-01-06 | sidepanel.js refreshOwnerChip three-tier resolution; legacy:* → friendly client → short-prefix | static + unit | `node tests/sidepanel-tab-aware-smoke.test.js` (Part 1+2 fill) | ✅ | ⬜ pending |
| 11-01-03 | 01 | 1 | FINT-19 | T-11-01-06 | popup.js refreshOwnerChip mirror per CONTEXT D-09 (chip-label only; lockout + per-tab history OOS) | static | grep + smoke Part 2.3/2.4 | ✅ | ⬜ pending |
| 11-01-04 | 01 | 1 | FINT-19 | (none) | smoke Parts 1+2 filled with >= 11 real PASS (lookupClientLabel + three-tier + source-level wiring) | unit | smoke total >= 18 PASS Wave 1 baseline | ✅ | ⬜ pending |
| 11-02-01 | 02 | 2 | FINT-20 | T-11-02-04 | sidepanel.css `.fsb-foreign-owned-disabled` (opacity + pointer-events + cursor) + `.sr-only` utility | static | inline node script per task verify | ✅ (Plan 11-00) | ⬜ pending |
| 11-02-02 | 02 | 2 | FINT-20 | (none) | sidepanel.html `fsb-lockout-aria-description` sr-only span | static | inline node script per task verify | ✅ | ⬜ pending |
| 11-02-03 | 02 | 2 | FINT-20 | T-11-02-02 | applyInputLockout + _isActiveTabForeignOwned + refreshOwnerChip lockout wiring + handleSendMessage runtime gate | static + unit | smoke Part 3+4 fill | ✅ | ⬜ pending |
| 11-02-04 | 02 | 2 | FINT-20 | (none) | smoke Parts 3+4 filled with >= 8 real PASS (lockout DOM mutation + runtime gate + CSS source-level) | unit | smoke total >= 24 PASS Wave 2 baseline | ✅ | ⬜ pending |
| 11-03-01 | 03 | 3 | FINT-21 | T-11-03-01 | sidepanel.js initTabConversationStore + swapToTabConversation + dropTabConversation + ensureTabConversationForActiveTab + chrome.tabs.onRemoved listener + lazy mint per D-17 | static + unit | `node -e "..."` per task verify | ✅ (Plan 11-00) | ⬜ pending |
| 11-03-02 | 03 | 3 | FINT-21 | T-11-03-02 | smoke Parts 5+6 filled with >= 9 real PASS (envelope CRUD + LRU eviction at 51 → 50 + migration + source-level) | unit | smoke total >= 33 PASS Wave 3 baseline | ✅ | ⬜ pending |
| 11-04-01 | 04 | 4 | (ceremony) | n/a | REQUIREMENTS.md FINT-19/20/21 narrative + 3 traceability rows + Total v1 41 → 44 + Last updated bump | docs | grep assertions per task verify | n/a | ⬜ pending |
| 11-04-02 | 04 | 4 | (ceremony) | n/a | LATTICE-PIN.md Phase 11 row with SHA UNCHANGED + frontmatter last_updated bump | docs | grep assertions per task verify | n/a | ⬜ pending |
| 11-04-03 | 04 | 4 | (ceremony) | n/a | v0.10.0-MILESTONE-AUDIT.md phase_11_shipped status_history entry + last_revised bump; status STAYS in_progress | docs | grep assertions per task verify | n/a | ⬜ pending |
| 11-04-04 | 04 | 4 | (ceremony) | n/a | 11-VERIFICATION.md Human Verification section (6-sub-assertion UAT-11 procedure) | docs | grep assertions per task verify | n/a | ⬜ pending |
| 11-04-05 | 04 | 4 | INV-04 + INV-06 | T-11-04-05 | smoke Part 7 INV byte-freeze regression: setTimeout count = 8 + 4 iterator patterns + Phase 11 token awk-scan empty + LATTICE-PIN SHA byte-frozen | byte-freeze + static | smoke Part 7 fill (>= 4 PASS); smoke total >= 37 PASS final | ✅ | ⬜ pending |

*Status legend:* ⬜ pending · ✅ green · ❌ red · ⚠️ flaky

---

## Wave 0 Requirements (Plan 11-00 ships)

- [x] New sidecar `extension/ui/sidepanel-tab-conv-store.js` exports 6 pure helpers + 4 constants via IIFE dual-export
- [x] New smoke `tests/sidepanel-tab-aware-smoke.test.js` carries 7 Part placeholders + chrome mocks + DOM stub helpers
- [x] `extension/ui/sidepanel.html` script-tag chain extended with sidecar `<script>` line strictly between owner-chip.js and sidepanel.js
- [x] `extension/ui/sidepanel.css` carries `.fsb-owner-chip` baseline rule (RESEARCH Section 6 missing-CSS gap closed)
- [x] `package.json` scripts.test &&-chain ends with `&& node tests/sidepanel-tab-aware-smoke.test.js`

*All Wave 0 requirements satisfied by Plan 11-00 Tasks 1-3.*

---

## Phase Smoke Targets

| Wave | Plan | Smoke Parts filled | Cumulative PASS target |
|------|------|---------------------|------------------------|
| 0 | 11-00 | (placeholders) | 7 (one per placeholder) |
| 1 | 11-01 | Parts 1 + 2 | >= 18 |
| 2 | 11-02 | Parts 3 + 4 | >= 24 |
| 3 | 11-03 | Parts 5 + 6 | >= 33 |
| 4 | 11-04 | Part 7 | >= 37 (final) |

**Phase 11 target: >= 37 PASS / 0 FAIL** across 7 Parts. Aligns with RESEARCH Section 8 estimate of 32 PASS (slightly higher with the 4 INV byte-freeze regression assertions in Part 7).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome MV3 side panel visual rendering with multiple real tabs + history swap + foreign-owned lockout against an external MCP agent (e.g., OpenClaw / Claude / Cursor) | FINT-19/20/21 end-to-end | Visual + multi-tab + live MCP agent integration cannot be reproduced in Node-mock land | Defer to UAT-11 procedure documented in `.planning/phases/11-tab-aware-side-panel-surface/11-VERIFICATION.md` Human Verification section. Run alongside the existing deferred UAT-08+09+10 in ONE Chrome MV3 reload session per CONTEXT D-22. User runs UAT-08+09+10+11 together; reports consolidated verdict; on PASS, the milestone status flips in_progress → passed in v0.10.0-MILESTONE-AUDIT.md. |

---

## INV byte-freeze gates (CRITICAL)

Plan 11-04 smoke Part 7 fills these regression assertions; if they fail, ALL of Phase 11 must be blocked from milestone closure:

- **INV-04 setTimeout count:** `grep -c "setTimeout" extension/ai/agent-loop.js` MUST return 8.
- **INV-04 iterator patterns:** `grep -c "session\._nextIterationTimer\s*=\s*setTimeout" extension/ai/agent-loop.js` MUST return 4.
- **INV-04 awk-scan:** NO Phase 11 token (`lookupClientLabel`, `applyInputLockout`, `ensureTabConversation`, `swapToTabConversation`, `dropTabConversation`, `initTabConversationStore`, `_isActiveTabForeignOwned`) inside any setTimeout lambda body. Pattern lifted from RESEARCH Section 3 Pattern 3.
- **INV-06 SHA byte-freeze:** `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` literal MUST equal `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Verified at runtime via fs.readFileSync regex match.

These are NON-NEGOTIABLE guardrails. Plan 11-NN executors must NOT touch `extension/ai/agent-loop.js`, `extension/background.js`, `extension/manifest.json`, or any file under `lattice/` (CONTEXT D-18 surface-scope lock).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 scaffolding dependencies (16 tasks across 5 plans; all map to a `<verify><automated>` block in the parent PLAN.md)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task either runs the smoke or carries an inline node verify command)
- [x] Wave 0 covers all MISSING references (sidecar module + smoke file + CSS baseline + sidepanel.html script-tag insertion all land in Plan 11-00)
- [x] No watch-mode flags
- [x] Feedback latency < 12s for quick + < 120s for full
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** PLANNED — 5 plans (11-00 through 11-04) ship Phase 11 in 4 waves; per-task verification map populated; INV-04 + INV-06 byte-freeze guardrails locked via Plan 11-04 smoke Part 7. Awaits execute-phase invocation.
</content>
</invoke>