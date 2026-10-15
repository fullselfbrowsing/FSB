---
phase: 60-adapter-contract-claude-code-mvp
fixed_at: "2026-07-14T19:27:23Z"
review_path: .planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
cumulative_fixed: 7
commits:
  - "adf31457"
---

# Phase 60: Code Review Fix Report

**Fixed at:** 2026-07-14T19:27:23Z
**Source review:** `.planning/phases/60-adapter-contract-claude-code-mvp/60-REVIEW.md`
**Iteration:** 3

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### IN-01: Settled process-tree operations remain permanently cached

**Files modified:** `mcp/src/agent-providers/process-tree.ts`, `tests/mcp-agent-orphan-recovery.test.js`
**Commit:** `adf31457`
**Status:** fixed; deterministic success/rejection regressions and final review passed
**Applied fix:** `VerifiedProcessTreeTerminator.stop()` now removes an operation from `inFlight` after either fulfillment or rejection, guarded by identity so an older completion cannot delete a newer operation for the same key. Concurrent duplicate callers still receive the same pending promise.

The process-tree regression now covers both post-success and post-rejection reuse. In each case, a later call receives a fresh promise and performs fresh process inspection, while the existing same-promise in-flight deduplication assertion remains intact.

## Cumulative Fix History

- Iteration 1 fixed five findings in commits `18790740`, `1c7c69d5`, `ceca6048`, `0ee1c54b`, and `3f594593`. Its full report is preserved in `60-REVIEW-FIX.iter2.md`.
- Iteration 2 fixed the held-final-cleanup route race in commit `feb293ac`. Its full report is preserved in `60-REVIEW-FIX.iter3.md`.
- Iteration 3 fixed settled process-tree operation retention in commit `adf31457`.
- Cumulative Phase 60 review findings fixed: 7; skipped: 0.

## Verification

- `./mcp/node_modules/.bin/tsc -p mcp/tsconfig.json --noEmit` — passed
- `node tests/mcp-agent-orphan-recovery.test.js` — passed, including fresh inspection after fulfillment and rejection
- `node tests/mcp-spawn-supervisor.test.js` — passed
- `node tests/mcp-bridge-topology.test.js` — 254 passed, 0 failed
- `node tests/mcp-reverse-channel-contract.test.js` — passed; the exact transport-error contract remains unchanged
- `node scripts/run-phase60-full-tests.mjs` — passed; full root suite green and workspace state preserved
- `git diff --check 7ee3b7e4^..HEAD -- <Phase 60 source scope>` — passed

No live UAT was run. Generated build output, review artifacts, configuration, agent history, existing deletions, showcase files, and Phase 39 paths were not staged.

---

_Fixed: 2026-07-14T19:27:23Z_
_Fixer: Codex (`gsd-code-review-fix`)_
_Iteration: 3_
