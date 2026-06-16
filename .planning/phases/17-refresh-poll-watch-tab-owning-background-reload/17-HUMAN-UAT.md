---
status: deferred_to_phase_20
phase: 17-refresh-poll-watch-tab-owning-background-reload
source: [17-VALIDATION.md, 17-04-PLAN.md]
created: 2026-06-16T18:27:52Z
---

# Phase 17 Human UAT

## Current Test

Deferred to Phase 20 live-browser integration.

## Test: Refresh-Poll Background Tab Does Not Steal Focus

1. Install the extension in Chrome with the Phase 17 build.
2. Open a static/server-rendered page in an owned background tab and arm a refresh-poll trigger at `poll_interval_ms:60000`.
3. Keep a different tab foregrounded.
4. Wait for one poll tick.
5. Confirm the watched tab reloads and the foreground tab remains active.

expected: the watched tab reloads and the background tab remains background.

result: pending

## Evidence Boundary

Deterministic Node tests already assert the Chrome API call shape: refresh-poll uses an explicit `target_tab_id`, direct frame-0 `triggerRead`, no active-tab lookup, and no activation path. Node tests cannot prove user-visible Chrome focus retention in an installed extension, so this live-browser check remains `deferred_to_phase_20`.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0
