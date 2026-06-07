---
phase: 11-tab-aware-side-panel-surface
verified: 2026-06-07
verdict: human_needed
status: human_needed
score: automated must-haves verified; UAT-11 deferred to consolidated UAT-08+09+10+11
overrides_applied: 0
gated_on: "Consolidated UAT-08 + UAT-09 + UAT-10 + UAT-11 (end-of-milestone)"
uat_11:
  status: pending_execution
  defer_directive: "User 2026-05-31 carryforward: skip UAT to last (consolidated end-of-milestone Chrome MV3 reload session) per CONTEXT D-22"
  bundled_with:
    - UAT-08
    - UAT-09
    - UAT-10
  date_executed: pending_consolidated_uat
---

# Phase 11: Tab-aware side panel surface -- Verification

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Phase:** 11-tab-aware-side-panel-surface
**Verifier verdict:** human_needed (UAT-11 deferred to consolidated UAT-08+09+10+11 session per CONTEXT D-22)
**Last updated:** 2026-06-07

## Automated Verification (PASSED)

| Gate | Command | Expected | Verified |
|------|---------|----------|----------|
| INV-01 MCP wire parity | `node tests/tool-definitions-parity.test.js` | 142 PASS / 0 FAIL | Y (carryforward via &&-chain) |
| INV-04 setTimeout count | `grep -c "setTimeout" extension/ai/agent-loop.js` | 8 | Y (smoke Part 7.1) |
| INV-04 iterator patterns | `grep -c "session\._nextIterationTimer = setTimeout" extension/ai/agent-loop.js` | 4 | Y (smoke Part 7.2) |
| INV-04 token awk-scan | NO Phase 11 token inside setTimeout lambda body | empty | Y (smoke Part 7.3) |
| INV-06 LATTICE-PIN SHA | grep `current_lattice_sha: e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` in LATTICE-PIN.md | match | Y (smoke Part 7.4) |
| INV-06 git rev-parse | `cd lattice && git rev-parse HEAD` | `e95067bf...` | Y (manual verification per phase) |
| FINT-19 smoke | smoke Parts 1+2 | >= 13 PASS | Y |
| FINT-20 smoke | smoke Parts 3+4 | >= 8 PASS | Y |
| FINT-21 smoke | smoke Parts 5+6 | >= 9 PASS | Y |
| Full chain | `npm test` | exit 0 | Y |

Total smoke: >= 37 PASS / 0 FAIL across 7 Parts.

## Human Verification (UAT-11)

**Status:** DEFERRED to consolidated end-of-milestone UAT alongside UAT-08 + UAT-09 + UAT-10 per CONTEXT D-22.

User executes all four UATs in a SINGLE Chrome MV3 reload session. UAT-11 adds ~3-5 minutes to the existing UAT-08+09+10 procedure.

### Preparation (one-time)

1. Confirm `chrome://extensions/` shows FSB at version v0.9.90+ (or current dev build).
2. Have at least 2 free tabs + 1 tab driven by an external MCP agent (e.g., OpenClaw / Claude Desktop / Cursor with FSB MCP server connected) ready for the lockout + chip-label scenarios.
3. Open the FSB side panel via the extension icon -> "Open side panel".

### UAT-11 sub-assertions

#### Sub-assertion (a): friendly chip label on MCP-driven tab

1. Trigger an external MCP agent (e.g., OpenClaw) to drive ANY tab -- wait until the visual-session overlay appears on that tab.
2. Switch the active Chrome tab to the MCP-driven tab.
3. **Expected:** the FSB side panel header chip displays `owned by <client>` where `<client>` matches the allowlisted label (e.g., `owned by OpenClaw`, `owned by Claude`, `owned by Cursor`, `owned by FSB Autopilot`).
4. **Verify** by reading the chip text in the side panel header -- NOT `owned by agent_a3f8b1` cryptic short prefix.

PASS if chip text reads `owned by <FriendlyName>` matching the allowlist. FAIL if it reads the 6-char hex short prefix.

#### Sub-assertion (b): foreign-owned input lockout

1. Still on the MCP-driven tab from (a), attempt to click into the chatInput area.
2. **Expected:** chatInput shows the dimmed-disabled visual treatment (opacity 0.45, cursor not-allowed); the cursor does NOT enter edit mode; pressing keys produces no characters.
3. Hover over the send / mic / stop buttons.
4. **Expected:** all 3 buttons show dimmed-disabled visual treatment; clicks have no effect (disabled attribute).
5. **Verify** via screen reader (if available) that the controls announce `Side panel input disabled because the active tab is controlled by another agent` (aria-describedby span).

PASS if all 4 controls visually + functionally disabled + aria-describedby announced. FAIL if any control is interactive.

#### Sub-assertion (c): send Enter blocked (defense-in-depth gate)

1. Open DevTools on the side panel (right-click in panel -> Inspect).
2. In DevTools console, run: `document.getElementById('sendBtn').disabled = false; document.getElementById('chatInput').setAttribute('contenteditable', 'true')` -- this simulates a stale UI state where the disabled attribute was cleared by a sibling refresh.
3. Click into chatInput (now allowing edits) -> type "test message".
4. Press Enter.
5. **Expected:** no message is sent; the runtime gate at `handleSendMessage` (FINT-20 defense-in-depth) blocks the dispatch.
6. **Verify** by checking the chrome.runtime.sendMessage logs in the DevTools console (background page).

PASS if no automation starts despite the bypass attempt. FAIL if the message dispatches.

#### Sub-assertion (d): per-tab history swap on tab switch

1. Switch to a free tab (NOT MCP-driven).
2. **Expected:** the side panel chatInput becomes interactive (lockout cleared); the chip is hidden (no owner).
3. Type "first message on tab A" into chatInput -> press Enter.
4. **Expected:** the message appears in chatMessages; automation starts.
5. Switch to a DIFFERENT free tab (tab B).
6. **Expected:** chatMessages CLEARS to empty (per Plan 11-03 swapToTabConversation); chatInput is interactive (no chip; no lockout).
7. Type "first message on tab B" into chatInput -> press Enter.
8. **Expected:** "first message on tab B" appears; "first message on tab A" is NOT visible.

PASS if tab swap clears chat surface + the new tab starts empty. FAIL if both messages appear together.

#### Sub-assertion (e): history restore on switch-back

1. With tab A and tab B both having sent messages (from (d)), switch BACK to tab A.
2. **Expected:** chatMessages CLEARS first (swap), then... the side panel currently does NOT auto-render past history on swap (RESEARCH Open Question 1 carryforward). The conversationId is restored to tab A's value; the surface shows EMPTY but the underlying FSB sessions store has both conversations available via the History button.
3. Click the History button (`historyBtn`) -- verify both conversations appear in the session history list (aggregated by sessionId from FSB sessions store; per-tab map eviction does NOT affect history-view aggregation per D-14 narrative).

PASS if both conversations are visible in History view. FAIL if either conversation is missing.

#### Sub-assertion (f): INV-04 + INV-06 byte-freeze grep

In a terminal at the FSB repo root:

```bash
grep -c "setTimeout" extension/ai/agent-loop.js
# Expected: 8

grep -c "session._nextIterationTimer = setTimeout" extension/ai/agent-loop.js
# Expected: 4

cd lattice && git rev-parse HEAD
# Expected: e95067bfa87ed1b75838fc3b3ef217a3b01acbd3
```

PASS if all three commands return the expected outputs. FAIL otherwise (CRITICAL byte-freeze violation; report immediately).

### Verdict reporting

After running all 6 sub-assertions, report ONE of:

- **PASS** -- all sub-assertions a-f pass. Plan 11-04 ceremony updates this 11-VERIFICATION.md `verifier verdict` to `passed`, and `.planning/v0.10.0-MILESTONE-AUDIT.md` `status` may be flipped to `passed` (only after UAT-08 + UAT-09 + UAT-10 ALSO pass -- the consolidated verdict is the AND of all four).
- **PARTIAL** -- some sub-assertions PASS, some FAIL. Record specific failures + create follow-up GSD task for the gaps.
- **FAIL** -- multiple critical sub-assertions FAIL. Block the v0.10.0 milestone closure; investigate root cause; iterate.

This verification is consolidated with UAT-08 (Phase 8 step-transition + receipt emission) + UAT-09 (Phase 9 SurvivabilityAdapter restore + LRU) + UAT-10 (Phase 10 visual-session overlay + drivingModel attribution) into a SINGLE Chrome MV3 reload session.

---

## UAT-11 Execution Record

**Date executed:** Pending consolidated UAT (bundled with UAT-08 + UAT-09 + UAT-10)
**Verdict:** Pending
**Sub-assertions:** Pending
**Notes:** Awaiting user-driven Chrome MV3 reload session per CONTEXT D-22 deferral directive.

---

_Verified: 2026-06-07_
_Verifier: Claude (Plan 11-04 executor)_
_Phase: 11-tab-aware-side-panel-surface_
