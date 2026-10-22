---
phase: 60-adapter-contract-claude-code-mvp
fixed_at: "2026-07-14T19:09:09Z"
review_path: .planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
cumulative_fixed: 6
commits:
  - "feb293ac"
---

# Phase 60: Code Review Fix Report

**Fixed at:** 2026-07-14T19:09:09Z
**Source review:** `.planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### WR-01: Route loss during final cleanup can lose exact-once terminal precedence

**Files modified:** `mcp/src/agent-providers/spawn-supervisor.ts`, `tests/mcp-spawn-supervisor.test.js`
**Commit:** `feb293ac`
**Status:** fixed: requires human verification; deterministic concurrency regression passed
**Applied fix:** `executeRun()` now re-checks `stopRequested` immediately after each successful awaited final cleanup and returns before settling success, an `is_error` result, or an earlier catch-path domain failure. That lets the already-running `cancelLifecycle()` join `executionPromise` and own the single `route_lost` settlement. Cleanup rejection bypasses the stop-return path, so `tree_unsettled` and `runtime_cleanup_failed` still latch degradation and retain terminal precedence.

The supervisor regression harness can now hold `runtimeFiles.removeRun()`. Deterministic cases cover a successful result, an `is_error` result, and a catch-path `process_exit` failure. Each case aborts the route while cleanup is held, proves settlement remains pending without a `cancelLifecycle()`/`executionPromise` deadlock, then releases cleanup and observes one non-success `route_lost` result, one tree stop, and one runtime cleanup.

## Cumulative Fix History

- Iteration 1 fixed five findings in commits `18790740`, `1c7c69d5`, `ceca6048`, `0ee1c54b`, and `3f594593`. Its full report is preserved in `60-REVIEW-FIX.iter2.md`.
- Iteration 2 fixed the remaining held-final-cleanup route race in commit `feb293ac`.
- Cumulative Phase 60 review findings fixed: 6; skipped: 0.

## Verification

- `./mcp/node_modules/.bin/tsc -p mcp/tsconfig.json --noEmit` — passed
- `node tests/mcp-spawn-supervisor.test.js` — passed
- `node tests/mcp-bridge-topology.test.js` — 254 passed, 0 failed
- `node tests/mcp-reverse-channel-contract.test.js` — passed; the exact transport-error contract remains unchanged
- `node --check tests/mcp-spawn-supervisor.test.js` — passed
- `git diff --check -- mcp/src/agent-providers/spawn-supervisor.ts tests/mcp-spawn-supervisor.test.js` — passed

No live UAT or full root suite was run. Generated build output, review artifacts, configuration, agent history, existing deletions, showcase files, and Phase 39 paths were not staged.

---

_Fixed: 2026-07-14T19:09:09Z_
_Fixer: Codex (`gsd-code-review-fix`)_
_Iteration: 2_
