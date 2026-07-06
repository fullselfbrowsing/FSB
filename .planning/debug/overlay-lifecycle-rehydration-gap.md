---
status: resolved
discovered: 2026-04-03
updated: 2026-06-15
session_id: session_1775188402694
milestone: v0.9.24
---

# Overlay Lifecycle Rehydration Gap

## Verification Context

Same verification task as the auth-blocked outcome issue: find Vijaya Sai Latha Pupilati's LinkedIn profile, understand her background, browse relevant recent jobs, and send her the job details as a LinkedIn message.

## Expected

During an active automation run, the glow animation, progress overlay, and debugger/dashboard overlay should remain visible or degrade gracefully across page navigations, content-script reconnects, and long model waits.

## Actual

The glow animation and debugger overlay disappeared mid-run. This specific session did not run long enough to hit the 60-second watchdog, so the disappearance is not explained by a simple timeout alone.

## MCP and Code Evidence

- Session: `session_1775188402694`
- Status: `error`
- Duration: 42s
- Logs show repeated navigation-driven `state_cleared` events during the run while moving across Google and LinkedIn pages
- `content/lifecycle.js` destroys `viewportGlow`, `progressOverlay`, and `actionGlowOverlay` on port disconnect/navigation cleanup
- `content/messaging.js` only rehydrates overlay visuals when a new `sessionStatus` message arrives, and it still has a 60-second watchdog that destroys overlays after silence
- `background.js` sends `sessionStatus` at session start and a few special transitions, but not as a normal per-iteration progress channel
- `ai/agent-loop.js` receives `sendSessionStatus` as `sendStatus`, but normal iterations never call it; `report_progress` only updates `session.lastAiReasoning`

## Root Cause

1. Overlay lifecycle depends on sparse `sessionStatus` pushes rather than on canonical session progress.
2. Navigation or content reconnect tears overlays down immediately.
3. Normal iteration progress does not re-emit the current overlay state, so the overlay can disappear permanently after a page hop.
4. Long provider waits and retries still risk watchdog cleanup because there is no heartbeat or degraded-state refresh path.

## Related Prior Debug Evidence

- `.planning/debug/e2e-career-stall.md` already identified the watchdog-expiry path for longer runs.
- This verification follow-up shows a second path: navigation/reconnect teardown without guaranteed rehydration.

## Gap Work Created

- Phase 162.3: Overlay Lifecycle Reliability

## Resolution

Resolved by archived milestone v0.9.24. `.planning/milestones/v0.9.24-ROADMAP.md`
records Phase 162.3 as shipped for overlay replay, heartbeat refresh,
degraded waiting state, and dashboard resync.
