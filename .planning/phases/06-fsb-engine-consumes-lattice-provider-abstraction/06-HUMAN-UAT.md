---
status: partial
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
source: [06-VERIFICATION.md]
started: 2026-05-27T16:54:00Z
updated: 2026-06-15T10:46:35Z
deferral_target: 0.9.90 beta release from automation branch
---

## Current Test

[testing paused - 2 items blocked by beta-load/credential prerequisites]

## Tests

### 1. xAI test-connection succeeds end-to-end (ROADMAP Pass Criterion 3)
expected: Paste fresh xAI API key in extension settings (Provider: xAI, Model: grok-4-1-fast), click Test Connection, see success response. Closes xai-key-rejected-400 P1 (missing trim) + P2 (stale storage read) by side effect.
result: blocked
blocked_by: third-party
reason: "Not executed through the 0.9.90 beta options UI. Computer Use was not available in this workspace, and the FSB-controlled browser did not show proof that the local automation-branch extension/ directory was loaded as version 0.9.90. A fresh valid xAI key is still required for this UI test."

### 2. Autopilot iteration completes >= 1 step via bridge (ROADMAP Pass Criterion 4)
expected: Start autopilot session with xAI provider, observe >= 1 iteration step completes through the bridge (offscreen handler does its own fetch per Strategy A; agent-loop iterator pattern unchanged).
result: blocked
blocked_by: third-party
reason: "FSB MCP autopilot was attempted on https://example.com/ in session_1781520232533. The session reached provider xai/model grok-code-fast-1 but failed before any browser action with HTTP 400: Incorrect API key provided: xa***Aw. totalActions=0, duration=335ms. The controlled browser also did not prove it was running the local 0.9.90 beta build."

## Evidence

- Local automation branch package metadata is 0.9.90: `package.json` version `0.9.90`; `extension/manifest.json` name `FSB v0.9.90`, version `0.9.90`.
- FSB MCP browser tabs at UAT time: Chrome Web Store tab titled `FSB v0.9.72`, X tab, and active `https://example.com/` tab.
- FSB MCP extension init log reported version `v0.9.50`, which does not establish that the local 0.9.90 beta was loaded.
- FSB MCP `run_task` session `session_1781520232533` started 2026-06-15T10:43:52Z on tab 696018527 and failed on iteration 1 with xAI 400 invalid API key before completing a step.
- Computer Use plugin was requested but not installed/completed, so Chrome extension reload/load-unpacked UAT could not be performed from this workspace.

## Summary

total: 2
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

None. The live UAT did not reveal a Phase 6 code gap; it is blocked by environment prerequisites: load the local 0.9.90 beta build into Chrome and provide a fresh valid xAI key. Re-run the two checks after those prerequisites are in place.
