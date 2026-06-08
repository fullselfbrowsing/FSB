---
phase: 12
slug: side-panel-follows-automation
verdict: human_needed
status: human_needed
verdict_date: null
plans_complete: 5/5
requirements_complete: 3/3
smoke_pass_count: 45
inv_04_baseline: 8
inv_06_baseline: e95067bfa87ed1b75838fc3b3ef217a3b01acbd3
created: 2026-06-08
---

# Phase 12 Verification

## Automated Verification (Complete)

| Gate | Command | Expected | Status |
|------|---------|----------|--------|
| Smoke chain green | `npm test` | exit 0 | PASS |
| Phase 12 smoke | `node tests/sidepanel-message-log-smoke.test.js` | >= 45 PASS / 0 FAIL | PASS |
| INV-04 setTimeout count | `grep -c "setTimeout" extension/ai/agent-loop.js` | 8 | PASS |
| INV-04 iterator pattern | `grep -c "session\._nextIterationTimer = setTimeout" extension/ai/agent-loop.js` | 4 | PASS |
| INV-04 Phase 12 token awk-scan | awk pattern in smoke Part 8 | empty | PASS |
| INV-06 SHA literal | `cd lattice && git rev-parse HEAD` | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | PASS |
| INV-06 LATTICE-PIN literal | grep frontmatter | e95067bfa87ed1b75838fc3b3ef217a3b01acbd3 | PASS |
| INV-01 tool-definitions parity | `node tests/tool-definitions-parity.test.js` | 142 PASS | PASS |

## Human Verification (UAT-12) -- DEFERRED to consolidated end-of-milestone UAT-08+09+10+11+12

Per CONTEXT D-26: UAT-12 joins the consolidated single Chrome MV3 reload session that also covers UAT-08 (Phase 8 step.transition emit + receipt mint), UAT-09 (Phase 9 SurvivabilityAdapter MV3 SW eviction resume), UAT-10 (Phase 10 MCP-philosophy parity), and UAT-11 (Phase 11 tab-aware side panel surface).

### UAT-12 sub-assertions (6 total)

| # | Behavior | Expected outcome | Sub-test instructions |
|---|----------|------------------|----------------------|
| (a) | Auto-open on Run | Chrome side panel pops open on the automating tab when user clicks Run in sidepanel | 1. Load extension fresh via chrome://extensions Reload. 2. Open a tab to a public site (e.g. example.com). 3. Click FSB extension action -> sidepanel opens (existing behavior). 4. Type a simple task ("scroll down twice") and click Run. 5. Observe the sidepanel surface remains open on this tab (chrome.sidePanel.open with tabId fired). 6. Open chrome://extensions -> FSB service worker console; expect NO "[FSB] Phase 12 FINT-24 sidePanel auto-open failed" warning. |
| (b) | Live progress visible during run | Per-iteration + per-tool action messages render in the sidepanel chat while autopilot is in flight | 1. Continuing from (a), watch the chat surface during the task. 2. Expect: typing-dots indicator at the bottom updates per iteration ("Step 1 complete", "Step 2 complete", ...). 3. Per-tool action lines render via addActionMessage (e.g. "scroll(direction: down)") because showSidepanelProgress now defaults true. 4. The final completion message renders as an AI bubble with markdown. |
| (c) | Reopen restores full history via Tier 1 new store | Close + reopen the sidepanel within the same tab restores ALL messages from the run, not just the prompt + completion | 1. After the task completes, close the sidepanel (X button). 2. Reopen the FSB sidepanel on the same tab. 3. Expect: every persisted message renders 1:1 in chronological order (user prompt + each "Step N complete" milestone + each tool action line + final completion). 4. This contrasts with pre-Phase-12 behavior where reopen showed only the user prompt + the final completion (fsbSessionLogs Tier 2). 5. Tier 1 wins per CONTEXT D-06; the new store is the source of truth. |
| (d) | Tab switch swaps view (stay-open) | Switching to a different tab keeps the sidepanel mounted; chat surface swaps to the new tab's view; switching back restores Tab A's running task | 1. With autopilot still in flight on Tab A, switch to Tab B (chrome.tabs.onActivated fires). 2. Expect: sidepanel surface STAYS OPEN (no auto-close); the view swaps to Tab B (empty or different conversation per Phase 11 per-tab envelope). 3. Switch back to Tab A. 4. Expect: the running task's progress messages are visible again (Phase 11 swap re-fires + Phase 12 hydrate Tier 1 renders the persisted messages). |
| (e) | Tab close drops entry without resurrection | Closing Tab A with a running task drops both the per-tab envelope entry AND the message-log entry; reopening a new tab does NOT show the closed conversation | 1. Close Tab A. 2. Open a fresh new tab. 3. Open the sidepanel. 4. Expect: the new tab shows a fresh welcome message; no leftover progress messages from Tab A's closed conversation. 5. Open DevTools chrome.storage.local; expect the `fsbConversationMessages.byConv[<closed-convId>]` entry is gone (EC-05 defense). |
| (f) | INV-04 + INV-06 byte-freeze automated check | `grep -c "setTimeout" extension/ai/agent-loop.js === 8` AND `cd lattice && git rev-parse HEAD === e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` | Already PASS via smoke Part 8 + verification gates above. Re-run manually to confirm post-reload: `npm test` exits 0 + `grep -c "setTimeout" extension/ai/agent-loop.js` outputs 8. |

### UAT-12 verdict reporting protocol

1. **PASS** all 6 sub-assertions -> verifier emits `passed`; v0.10.0-MILESTONE-AUDIT status_history gets `uat_consolidated_passed` entry; milestone `status` flips `in_progress` -> `passed`.
2. **PARTIAL** (1-5 sub-assertions FAIL) -> verifier emits `human_needed_partial`; status_history records the FAIL sub-assertions; milestone `status` STAYS `in_progress`; route to `/gsd-debug-phase` for the failing sub-assertion.
3. **FAIL** (0 sub-assertions PASS) -> verifier emits `gaps_found`; route to `/gsd-plan-phase --gaps`.

UAT-12 is part of the consolidated UAT-08+09+10+11+12 session; the verdict above is the Phase-12-specific component.

---

## UAT-12 Execution Record

**Date executed:** Pending consolidated UAT (bundled with UAT-08 + UAT-09 + UAT-10 + UAT-11)
**Verdict:** Pending
**Sub-assertions:** Pending
**Notes:** Awaiting user-driven Chrome MV3 reload session per CONTEXT D-26 deferral directive.

---

_Created: 2026-06-08_
_Phase: 12-side-panel-follows-automation_
