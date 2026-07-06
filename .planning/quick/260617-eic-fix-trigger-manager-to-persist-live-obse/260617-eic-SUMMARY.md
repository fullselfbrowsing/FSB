---
quick_id: 260617-eic
slug: fix-trigger-manager-to-persist-live-obse
status: complete
created: 2026-06-17
completed: 2026-06-17
mode: quick
code_commit: 2d3b6979
files_modified:
  - extension/utils/trigger-manager.js
  - tests/trigger-manager.test.js
autonomous: true
---

# Quick Task 260617-eic Summary

## Goal

Fix the review finding that `FsbTriggerManager.armTrigger()` dropped live-observe watch metadata and extraction/reporting fields while constructing the persisted lifecycle snapshot.

## Changes

- Added live-observe normalization in manager arm snapshot construction for `watch`/`mode` values `live-observe` and `live_observe`.
- Preserved recognized persisted metadata from arm specs: extraction fields, reporting fields, rearm/detached flags, and finite timeout/timestamp fields.
- Kept refresh-poll behavior unchanged, including `watch: "refresh-poll"` and `poll_interval_ms`.
- Added a focused async regression in `tests/trigger-manager.test.js` that captures the snapshot delegated to `FsbTriggerLifecycle.armTrigger()` and asserts all live-observe metadata survives manager persistence.

## Verification

- `node tests/trigger-manager.test.js` - 122 passed, 0 failed
- `node tests/trigger-tool-dispatcher.test.js` - 34 passed, 0 failed
- `node tests/trigger-refresh-poll.test.js` - 107 passed, 0 failed
- `node tests/trigger-lifecycle.test.js` - 155 passed, 0 failed
- `git diff --check` - clean

## Commits

- `2d3b6979` - `fix(quick-260617-eic): persist trigger arm metadata`
