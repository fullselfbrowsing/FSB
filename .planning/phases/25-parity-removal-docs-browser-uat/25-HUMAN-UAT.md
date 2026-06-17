---
phase: 25-parity-removal-docs-browser-uat
status: human_needed
created: 2026-06-17
---

# Phase 25 Human UAT: PhantomStream Live Browser Closeout

These scenarios require a real Chrome extension session paired to the dashboard. They were not executed in this autonomous run and must not be treated as passed until a human records observed results.

## Setup

1. Run the showcase server/dashboard in the normal local or staging environment.
2. Load `extension/` as an unpacked Chrome extension.
3. Pair the extension with the dashboard.
4. Open a normal `https://` page in a Chrome tab.
5. Keep DevTools closed unless testing debugger contention.

## Required Scenarios

| ID | Scenario | Procedure | Expected Outcome | Status |
|----|----------|-----------|------------------|--------|
| UAT-25-01 | Live preview starts | Pair dashboard, start a task or stream on a normal page, and wait for the preview pane. | Dashboard preview enters streaming state, renders page content, shows no blank iframe, and diagnostics show recent snapshot/frame timing. | human_needed |
| UAT-25-02 | Mutation fidelity | Change visible page content through navigation, typing, or page interaction while preview is streaming. | Preview updates through mutations without requiring a full reload for ordinary changes. | human_needed |
| UAT-25-03 | Scroll and overlay side channels | Scroll the source page and trigger an action glow/progress badge. | Dashboard preview scroll position, action glow, progress/client badge, and frozen overlay state remain aligned. | human_needed |
| UAT-25-04 | Native dialogs | Open a test page that triggers `alert`, `confirm`, or `prompt` while streaming. | Dashboard dialog side channel displays the dialog state without corrupting the mirrored DOM. | human_needed |
| UAT-25-05 | Remote click/type/scroll | Use dashboard remote control to click, type into a normal input, press a key, and scroll. | Actions reach the active streaming tab through CDP, and `ext:remote-control-state`/`ext:ps-control-state` remain authoritative. | human_needed |
| UAT-25-06 | Navigation and retargeting | Navigate the streaming tab while remote control is enabled, then retry remote control. | Stale frames are rejected; dashboard reports retarget/recover state and resumes only against the current stream identity. | human_needed |
| UAT-25-07 | Reconnect recovery | Disconnect/reconnect the dashboard WebSocket or reload the dashboard while the extension remains online. | Dashboard requests status and stream recovery, preview restarts, and frozen-complete state is not overwritten by watchdog resync. | human_needed |
| UAT-25-08 | Extension wake/reinject recovery | Reload the source tab or let the service worker wake after idle, then resume streaming. | Content readiness ping and parked stream-start intent recover without a dead preview. | human_needed |
| UAT-25-09 | Restricted/no-tab states | Try `chrome://extensions`, Chrome Web Store, and a closed/no-active-tab transition. | Dashboard shows restricted/no-tab state, avoids stale content, and does not offer unsafe remote control. | human_needed |
| UAT-25-10 | Large page | Stream a large document or long ecommerce/search page and interact with it. | Preview remains responsive, frame caps/backpressure diagnostics stay controlled, and no message-too-large crash occurs. | human_needed |
| UAT-25-11 | Security masking | Stream a page with password, textarea, select, and sensitive-looking text fields. | Mirrored preview masks configured sensitive values, strips dangerous URLs/event handlers, and does not expose raw secret text in diagnostics. | human_needed |
| UAT-25-12 | External debugger contention | Open DevTools or another debugger client against the streaming tab, then use remote control. | Dashboard reports blocked/external-debugger ownership state and does not steal debugger ownership silently. | human_needed |

## Recording Results

When executed, replace each `human_needed` status with `pass`, `fail`, or `partial`, add the date, browser version, extension commit, dashboard environment, and a short observed-outcome note. Do not mark the v0.12.0 browser UAT complete unless all required scenarios have recorded outcomes.
