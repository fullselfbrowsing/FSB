---
phase: 18-shared-tool-registry-dispatcher-wiring
fixed_at: 2026-06-17T01:20:36Z
review_path: .planning/phases/18-shared-tool-registry-dispatcher-wiring/18-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 18: Code Review Fix Report

**Fixed at:** 2026-06-17T01:20:36Z
**Source review:** .planning/phases/18-shared-tool-registry-dispatcher-wiring/18-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: Trigger Message Route Bypasses Ownership Gate

**Status:** fixed
**Files modified:** `extension/ws/mcp-tool-dispatcher.js`, `tests/mcp-tool-routing-contract.test.js`
**Commit:** 300cdefb
**Applied fix:** Normalized trigger message payload tab aliases before dispatch, ran `checkOwnershipGate` on trigger message routes, and added a regression proving `mcp:trigger` with a foreign `target_tab_id` returns `TAB_NOT_OWNED` before background trigger dispatch runs.

### WR-01: MCP Trigger Messages Are Not Routed by the Bridge Client

**Status:** fixed
**Files modified:** `extension/ws/mcp-bridge-client.js`, `tests/mcp-bridge-client-lifecycle.test.js`
**Commit:** 8998c087
**Applied fix:** Routed `mcp:trigger`, `mcp:stop-trigger`, `mcp:get-trigger-status`, and `mcp:list-triggers` through `dispatchMcpMessageRoute` in the live bridge client switch, with VM harness coverage for all four message types.

### WR-02: Registry Advertises `delta_percent`, but Runtime Rejects It

**Status:** fixed
**Files modified:** `extension/background.js`, `extension/utils/trigger-manager.js`, `tests/trigger-manager.test.js`, `tests/trigger-tool-dispatcher.test.js`
**Commit:** b0d5cf42
**Applied fix:** Accepted `delta_percent` as an alias for `percent_change`, normalized trigger tool conditions to the canonical kind before arming/persistence, and made the pure evaluator tolerate alias-shaped snapshots defensively.

## Verification

- `node tests/mcp-tool-routing-contract.test.js --group=trigger` passed: 84 passed, 0 failed
- `node tests/mcp-bridge-client-lifecycle.test.js` passed: 60 passed, 0 failed
- `node tests/trigger-tool-dispatcher.test.js` passed: 27 passed, 0 failed
- `node tests/trigger-manager.test.js` passed: 82 passed, 0 failed
- `node --check extension/background.js && node --check extension/ws/mcp-tool-dispatcher.js && node --check extension/ws/mcp-bridge-client.js && node --check extension/utils/trigger-manager.js` passed
- `node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js` passed: 240 passed and 332 passed
- `npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js` passed: 109 passed, 0 failed

---

_Fixed: 2026-06-17T01:20:36Z_
_Fixer: Codex_
_Iteration: 1_
