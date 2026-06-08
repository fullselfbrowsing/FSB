---
phase: 12
slug: side-panel-follows-automation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 12 — Validation Strategy

> Frame derived from 12-RESEARCH.md Validation Architecture section + the 5-plan breakdown. Plan-checker iteration tightens the Per-Task Verification Map before execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node-native assert + PASS/FAIL counter (FSB convention; sample at tests/sidepanel-tab-aware-smoke.test.js + tests/lattice-step-emitter-smoke.test.js) |
| **Config file** | none — Plan 12-00 extends existing `package.json` scripts.test &&-chain |
| **Quick run command** | `node tests/sidepanel-message-log-smoke.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10s for the phase smoke; ~130s for full chain |

---

## Sampling Rate

- **After every task commit:** Run `node tests/sidepanel-message-log-smoke.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite exit 0
- **Max feedback latency:** ~10s quick / ~130s full

---

## Per-Task Verification Map

> Populated by the planner during plan-checker iteration; one row per task.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 12-00-01 | 00 | 0 | (scaffold) | sidecar `extension/ui/sidepanel-message-log.js` exports envelope CRUD + LRU + debouncer | unit | quick smoke | pending |
| 12-00-02 | 00 | 0 | (scaffold) | smoke harness with 8 Part placeholders + chrome.storage.local mocks | unit | quick smoke | pending |
| 12-00-03 | 00 | 0 | (scaffold) | sidepanel.html script-tag chain extended; package.json scripts.test &&-chain extended | static | inline node check | pending |
| 12-01-NN | 01 | 1 | FINT-23 | hydrate Tier 1 reads `fsbConversationMessages`; Tier 2 fallback intact for pre-Phase-12 conversations | unit + static | quick smoke Parts 1+2 fill | pending |
| 12-02-NN | 02 | 2 | FINT-23 | addMessage write-through to per-conversation log; debounced 200ms; LRU enforced at 51st conversation | unit | quick smoke Parts 3+4 fill | pending |
| 12-03-NN | 03 | 3 | FINT-22 | showSidepanelProgressEnabled default = true; unconditional addMessage writes for tool_executed + action progress events | static + unit | quick smoke Part 5 fill | pending |
| 12-04-NN | 04 | 4 | FINT-24 + ceremony | chrome.sidePanel.setOptions({tabId, enabled, path}) + chrome.sidePanel.open({tabId}) wired into Run handler user-gesture context; REQUIREMENTS.md FINT-22/23/24 narratives + traceability + Total v1 footer bump; LATTICE-PIN.md Phase 12 row SHA UNCHANGED; v0.10.0-MILESTONE-AUDIT.md status_history phase_12_shipped; 12-VERIFICATION.md UAT-12 procedure; smoke Part 8 INV byte-freeze regression | static + unit + docs | quick smoke Parts 6+7+8 fill | pending |

*Status legend:* pending · green · red · flaky

---

## Phase Smoke Targets

| Wave | Plan | Smoke Parts filled | Cumulative PASS target |
|------|------|---------------------|------------------------|
| 0 | 12-00 | (placeholders) | 8 (one per placeholder) |
| 1 | 12-01 | Parts 1 + 2 | >= 18 |
| 2 | 12-02 | Parts 3 + 4 | >= 28 |
| 3 | 12-03 | Part 5 | >= 33 |
| 4 | 12-04 | Parts 6 + 7 + 8 | >= 45 final |

**Phase 12 target: >= 45 PASS / 0 FAIL** across 8 Parts.

---

## Wave 0 Requirements (Plan 12-00 ships)

- [ ] New sidecar `extension/ui/sidepanel-message-log.js` exports envelope CRUD + LRU + debouncer (IIFE dual-export)
- [ ] New smoke `tests/sidepanel-message-log-smoke.test.js` carries 8 Part placeholders + chrome.storage.local mocks + DOM stub helpers
- [ ] `extension/ui/sidepanel.html` script-tag chain extended with sidecar `<script>` line strictly between `sidepanel-tab-conv-store.js` (Phase 11) and `sidepanel.js`
- [ ] `package.json` scripts.test &&-chain ends with `&& node tests/sidepanel-message-log-smoke.test.js`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome MV3 side panel auto-opens on Run click in user-gesture context | FINT-24 | chrome.sidePanel.open requires real user gesture; cannot be reproduced in Node mock land | Defer to UAT-12 in `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` Human Verification section. Joins consolidated UAT-08+09+10+11+12 per CONTEXT D-26. |
| Live progress messages render in sidepanel during running autopilot task | FINT-22 | Requires full autopilot run in Chrome with visible streaming output | UAT-12 sub-assertion (b) |
| Sidepanel close + reopen restores full chat history from new store | FINT-23 | Requires Chrome session interaction with side panel toggle | UAT-12 sub-assertion (c) |
| Tab switch to non-automation tab swaps view; switch back restores running view | FINT-24 + carryforward | Same Chrome session interaction | UAT-12 sub-assertion (d) |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity preserved
- [ ] Wave 0 covers all MISSING references
- [ ] Feedback latency < 10s quick + < 130s full
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — planner finalizes Per-Task Verification Map during plan-checker iteration.
