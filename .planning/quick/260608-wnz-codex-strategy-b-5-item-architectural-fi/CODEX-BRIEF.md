# Independent debugging consult — FSB Chrome extension sidepanel

## Context

This is a Chrome MV3 extension (`extension/`). We just shipped commits 24d05f72, 62c34443, 021b7f60, 7889e3df, 30aec812, eb20ae86 on the `automation` branch (quick task 260608-uof) intending to fix two visible bugs. Tests pass (`npm test` exits 0; 32 PASS / 0 FAIL on the new regression test). BUT THE BUGS PERSIST IN RUNTIME (user just confirmed via screenshot).

## Persistent symptoms (post-uof, despite tests passing)

**D-PERSIST**: User dispatches task A (`check weather`) on Tab A (weather.com), task B (`check Doge price`) on Tab B (coindesk). Task B's completion still NEVER appears in Tab B's chat, even after swap-back. Backend completes session B cleanly.

**E-PERSIST**: Task A's completion still appears DUPLICATED in the chat. Was 3x before; user's latest screenshot shows 2x (so one duplicate was removed by our fix, but one still remains).

## What we already tried (this is the failed fix attempt)

Commit `24d05f72` (Task 1 of uof) was meant to fix both:
- **D-FIX**: removed the outer bail in `extension/ui/sidepanel.js` `case 'automationComplete'` so background-tab completions are not silently dropped
- **E-FIX**: collapsed the `if-branch` double-persist (the QT-7bi-02 author had fixed the else-branch via `_renderCompletionDomOnly` but missed the if-branch)

Per the debugger Root Cause Report at `.planning/debug/cluster1-routing.md`:
- D root cause was: outer guard `if (!isRunning && request.sessionId !== currentSessionId) return;` at sidepanel.js:2334 + strict inner `if (request.sessionId === currentSessionId)` at L2340 silently dropping background-tab completions
- E root cause was: L2353 `_persistMessageToConversation()` (1st persist) + L2362 `completeStatusMessage` → `addCompletionMessage` → L1775 `_persistMessage` (2nd persist via module-scope `conversationId` mirror)

## The puzzle

Both fixes shipped (verified in git show 24d05f72), the new regression test at `tests/sidepanel-background-tab-completion.test.js` passes (32 PASS) — and yet the runtime behavior is unchanged. Test mocks brace-walk + sandbox eval the handler body; it claims tab B's completion lands in conv_B's log and tab A's completion produces exactly ONE persisted entry.

## Hypotheses for you to evaluate

1. **There's ANOTHER persistence/render site outside the handler** that we missed. The 3x → 2x reduction suggests we removed ONE source but there's still a second source firing for the active tab.
2. **The broadcast itself fires twice from background.js** — even with cf9eea5b routing via request.conversationId, maybe background fires automationComplete AND session_ended for the same event and the sidepanel handler renders both. Our T2 tabId thread didn't touch dedup.
3. **The hydrate-on-swap path replays from a different log than the test inspects** — `hydrateChatFromConversationId` (sidepanel.js:376-405) reads from `fsbConversationMessages.conversations[convId]`. If background ALSO writes to a different log (`fsbSessionLogs`, or `automationLogger.saveSession`), and the swap path falls through to a Tier 2 read, it would double-render.
4. **The D bug is on the BROADCAST side**, not the receive side. Maybe session B's automationComplete is sent to a tab/port that disconnected before delivery (logs earlier showed `sendSessionStatus delivery failed: No tab with id: 184/185/186/187` — sequential low-ID ghost tabs). Receive-side test would pass but actual delivery never lands.
5. **There's a chrome.runtime.onMessage listener registered TWICE** somewhere — possibly during a hot-reload edge case, possibly via duplicate script include. Single handler in test, multiple at runtime.

## What I want from Codex

Independent root-cause analysis. Read these files first:
- `extension/ui/sidepanel.js` — the case 'automationComplete' handler around line 2333-2429, plus the persistence helpers at 1735-1776 (addCompletionMessage), 1819-1846 (_persistMessage), 1872-1896 (_persistMessageToConversation), and the hydrate path at 376-405
- `extension/background.js` — all `fsbBroadcastAutomationLifecycle` call sites; trace the natural-completion flow and look for paths that fire 2+ broadcasts for one session-end
- `extension/ai/agent-loop.js` — `notifySidepanel` around line 1425-1469 (we just added tabId here)
- `extension/ws/mcp-bridge-client.js` — any completion emit path here that might be a second source
- `extension/ai/state-emitter.js` — debugger said this is dead code but verify
- `.planning/debug/cluster1-routing.md` — the prior root cause report (note: it MISSED what the user is now reporting since the fixes didn't fully work)
- `.planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/260608-uof-PLAN.md` — what we just shipped
- `.planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/260608-uof-SUMMARY.md` — executor's self-report
- `tests/sidepanel-background-tab-completion.test.js` — the test that passes despite the runtime failing (the gap between test and reality is itself a clue)

Specific questions:
1. Why does Task A get 2x completion responses post-fix? Where's the second source?
2. Why does Task B never get a completion response? If our outer-bail removal in commit 24d05f72 is actually in place, the persist + render gate should now allow Tab B's completion through.
3. Are the regression tests at `tests/sidepanel-background-tab-completion.test.js` actually exercising the bug, or are they passing because the mock setup doesn't reproduce the real scenario?

Give me a structured report:
- Root cause for D-PERSIST (one sentence + file:line evidence)
- Root cause for E-PERSIST (one sentence + file:line evidence)
- Why the regression test passes but reality fails (one paragraph)
- Proposed fix (no patch, just shape)
- Anything else load-bearing

This is a real production debugging consult, not a hypothetical. The user is on tab weather.com with input "check Doge price." pending. Be specific and actionable.
