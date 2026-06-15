---
phase: 12
slug: side-panel-follows-automation
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-08
last_updated: 2026-06-08
---

# Phase 12 — Validation Strategy

> Frame derived from 12-RESEARCH.md Validation Architecture section + the 5-plan breakdown locked in RESEARCH Section 11. Plan-checker iteration tightens the Per-Task Verification Map before execution.

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

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 12-00-01 | 00 | 0 | (scaffold) | Sidecar `extension/ui/sidepanel-message-log.js` exports 7 helpers + `createDebouncer` factory + 4 constants; STORAGE_KEY = 'fsbConversationMessages'; DEFAULT_CAP = 50; DEFAULT_DEBOUNCE_MS = 200; ENVELOPE_VERSION = 1; zero chrome.* references; LRU eviction tested at cap+1 | unit | inline node Task 1 verify | pending |
| 12-00-02 | 00 | 0 | (scaffold) | `extension/ui/sidepanel.html` carries new `<script src="sidepanel-message-log.js"></script>` strictly between sidepanel-tab-conv-store.js and speech-to-text.js | static | inline node Task 2 verify | pending |
| 12-00-03 | 00 | 0 | (scaffold) | Smoke `tests/sidepanel-message-log-smoke.test.js` ships with 8 Part placeholders + chrome.runtime + chrome.tabs + chrome.storage.local + chrome.storage.session + chrome.sidePanel mocks + DOM stub helpers; package.json scripts.test &&-chain ends with new entry | unit + static | `node tests/sidepanel-message-log-smoke.test.js` returns 8 PASS / 0 FAIL | pending |
| 12-01-01 | 01 | 1 | FINT-23 | `hydrateChatFromConversationId` 3-tier fallback (Tier 1 fsbConversationMessages, Tier 2 b8b761e8 fsbSessionLogs preserved, Tier 3 empty); `renderPersistedMessage` helper added; addMessage NOT called inside hydrate body (Pitfall 3 defense); function name + arity unchanged | static + unit | inline node Task 1 verify | pending |
| 12-01-02 | 01 | 1 | FINT-23 | Smoke Parts 1 + 2 filled at >= 10 total real PASS (Tier 1 envelope read + chronological sort + short-circuit + idempotency + activeConversationId mutation; Tier 2 fallback + 2-child render + CSS class assertion + activeConversationId mutation; Tier 3 empty + convId guard) | unit | smoke cumulative >= 18 PASS | pending |
| 12-02-01 | 02 | 2 | FINT-23 | Module-scope `_messageLogDebouncer` + `_messageLogPendingBuffer` vars; `_persistMessage` + `_flushMessageLog` helpers; boot-time `FSBSidepanelMessageLog.createDebouncer({ debounceMs: 200 })` init; `window.addEventListener('beforeunload', flushAll)` defense | static + unit | inline node Task 1 verify | pending |
| 12-02-02 | 02 | 2 | FINT-23 | `addMessage` extended with optional 3rd `kind` param; persistence hook after DOM render; `addCompletionMessage` + `addActionMessage` hook `_persistMessage`; `addActionMessage` persistence fires BEFORE the showSidepanelProgressEnabled guard (CONTEXT D-10); chrome.tabs.onRemoved extended with `_messageLogDebouncer.cancel(convId)` + `dropConversationMessages` (EC-05 defense) | static + unit | inline node Task 2 verify | pending |
| 12-02-03 | 02 | 2 | FINT-23 | Smoke Parts 3 + 4 filled at >= 10 total real PASS (debouncer defer + clear-and-replace + LRU cap=50 eviction at 51 + buffered burst single-flush + flushAll forces fire + cancel pre-emption + drop + cancel together + flushAll empty no-op + callback throw swallowed) | unit | smoke cumulative >= 28 PASS | pending |
| 12-03-01 | 03 | 3 | FINT-22 | `options.js` DEFAULT_SETTINGS `showSidepanelProgress: true`; `sidepanel.js` module-scope `let showSidepanelProgressEnabled = true;` + boot read `?? true` + catch fallback `= true`; comment marker cites Phase 12 FINT-22 (Plan 12-03) | static | inline node Task 1 verify | pending |
| 12-03-02 | 03 | 3 | FINT-22 | `case 'iteration_complete':` body contains unconditional `_persistMessage('assistant', 'Step ' + request.iteration + ' complete', 'progress')` BEFORE the existing `if (currentStatusMessage && isRunning)` updateStatusMessage gate; `case 'tool_executed':` body unchanged (Plan 12-02 already wired persistence via addActionMessage hook C) | static | inline node Task 2 verify | pending |
| 12-03-03 | 03 | 3 | FINT-22 | Smoke Part 5 filled at >= 5 real PASS (options.js default flipped + sidepanel.js module-scope flipped + boot read default flipped + catch fallback flipped + iteration_complete persistence add + tool_executed wiring intact) | unit | smoke cumulative >= 33 PASS | pending |
| 12-04-01 | 04 | 4 | FINT-24 | `background.js` `handleStartAutomation` carries new try/catch block as FIRST 2 awaits with `chrome.sidePanel.setOptions({tabId, enabled, path})` then `chrome.sidePanel.open({tabId})`; block gated on `targetTabId && typeof chrome.sidePanel !== 'undefined'`; catch logs structured warning; existing `chrome.sidePanel.open({windowId})` at line 12979 + `setPanelBehavior` at line 13229 BYTE-FROZEN | static | inline node Task 1 verify | pending |
| 12-04-02 | 04 | 4 | (ceremony) | `REQUIREMENTS.md` 3 narratives + 3 trace rows + 47/47 Total v1 + 2026-06-08 Last updated; `LATTICE-PIN.md` Phase 12 row + frontmatter `last_updated` 2026-06-08; SHA UNCHANGED; `v0.10.0-MILESTONE-AUDIT.md` status_history phase_12_shipped + last_revised 2026-06-08; status stays in_progress; new `12-VERIFICATION.md` UAT-12 procedure | static + docs | inline node Task 2 verify | pending |
| 12-04-03 | 04 | 4 | FINT-24 + INV-04 + INV-06 | Smoke Parts 6 + 7 + 8 filled at >= 12 real PASS (Part 6: setOptions + open call sites + ordering + position between targetTabId + reactivation; Part 7: try/catch + sidePanelErr identifier + warn log + graceful degradation guards; Part 8: setTimeout = 8 + iterator pattern = 4 + Phase-12 token awk-scan empty + LATTICE-PIN SHA literal byte-frozen) | regression + static | smoke cumulative >= 45 PASS + grep === 8 + cd lattice && git rev-parse | pending |

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

- [ ] New sidecar `extension/ui/sidepanel-message-log.js` exports envelope CRUD + LRU + 200ms debouncer factory (IIFE dual-export; zero chrome.* references)
- [ ] New smoke `tests/sidepanel-message-log-smoke.test.js` carries 8 Part placeholders + chrome.* (incl. storage.local + sidePanel) mocks + DOM stub helpers
- [ ] `extension/ui/sidepanel.html` script-tag chain extended with sidecar `<script>` line strictly between `sidepanel-tab-conv-store.js` (Phase 11) and `speech-to-text.js`
- [ ] `package.json` scripts.test &&-chain ends with `&& node tests/sidepanel-message-log-smoke.test.js`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chrome MV3 side panel auto-opens on Run click in user-gesture context | FINT-24 | chrome.sidePanel.open requires real user gesture; cannot be reproduced in Node mock land | Defer to UAT-12 in `.planning/phases/12-side-panel-follows-automation/12-VERIFICATION.md` Human Verification section. Joins consolidated UAT-08+09+10+11+12 per CONTEXT D-26. |
| Live progress messages render in sidepanel during running autopilot task | FINT-22 | Requires full autopilot run in Chrome with visible streaming output | UAT-12 sub-assertion (b) |
| Sidepanel close + reopen restores full chat history from new store | FINT-23 | Requires Chrome session interaction with side panel toggle | UAT-12 sub-assertion (c) |
| Tab switch to non-automation tab swaps view; switch back restores running view | FINT-24 + Phase 11 carryforward | Same Chrome session interaction | UAT-12 sub-assertion (d) |
| Tab close drops message-log entry without resurrection | FINT-23 EC-05 defense | Requires Chrome tab-close event firing the chrome.tabs.onRemoved listener | UAT-12 sub-assertion (e) |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity preserved (Plan 12-00 ships PASS-when-empty Parts so &&-chain stays green; Plans 12-01..04 fill incrementally)
- [x] Wave 0 covers all MISSING references (sidecar + smoke + html + scripts.test)
- [x] Feedback latency < 10s quick + < 130s full
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution.
