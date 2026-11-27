---
phase: 53-drive-context-router-semantic-anchors
reviewed: 2026-07-15T20:25:37Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - extension/background.js
  - extension/content/skopeo-anchor-registry.js
  - extension/content/skopeo-context-router.js
  - extension/content/skopeo-runtime.js
  - extension/content/skopeo-shell.js
  - package.json
  - tests/extension-content-script-files-completeness.test.js
  - tests/fixtures/skopeo-semantic-anchor-fixture.js
  - tests/helpers/skopeo-resource-ledger.js
  - tests/skopeo-accessibility.test.js
  - tests/skopeo-anchor-registry.test.js
  - tests/skopeo-browser-contract.test.js
  - tests/skopeo-context-router.test.js
  - tests/skopeo-session-lifecycle.test.js
  - tests/skopeo-shell-contract.test.js
  - tests/skopeo-sidepanel-command.test.js
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 53: Code Review Report

**Reviewed:** 2026-07-15T20:25:37Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The Phase 53 router, semantic-anchor registry, runtime/shell integration, background navigation path, and their focused contracts were reviewed at standard depth. The exact-origin and monotonic-authority checks are generally defensive, and no critical issue was found. One warning remains in the final registry-to-shell commit handshake: an explicit visual rejection is recorded as a successful registry commit, leaving the registry bound while no semantic mark exists and preventing ordinary invalidation from starting a fresh resolution.

A focused production-registry reproduction returned `false` from `onCommit`; after initial resolution and a resize frame, the registry still reported `bound: true`, invoked the rejecting callback twice, and created no second resolver (`resolverCount: 1`). The registered anchor-registry and side-panel command suites pass, but neither covers this rejection/recovery path.

## Warnings

### WR-01: Rejected shell commit remains bound and cannot recover

**File:** `extension/content/skopeo-anchor-registry.js:450`
**Issue:** `_commitProjection()` ignores the return value from `onCommit(projection)` and unconditionally returns `true` unless the callback throws. The production runtime deliberately returns the boolean from `shell.commitSemanticAnchor()` (`extension/content/skopeo-runtime.js:281-283`), and the shell returns `false` after removing the mark when placement is unsafe (`extension/content/skopeo-shell.js:1638-1650`, `extension/content/skopeo-shell.js:1683`). The registry therefore retains `state.binding`. On the next frame, `_commitExisting()` retries the same binding epoch; because the shell has no existing semantic scope for that epoch, it rejects again at `extension/content/skopeo-shell.js:1668-1670`. The registry again reports success, so the frame loop at `extension/content/skopeo-anchor-registry.js:586-587` never calls `_resolveState()` and the mark cannot recover when geometry later becomes safe unless unrelated authority changes force a new epoch.
**Fix:** Treat an explicit `false` callback result as a rejected commit while preserving `undefined` as success for notification-style callbacks. Clear/withdraw the registry binding, advance its binding epoch, return `false`, and allow the next owned geometry signal to resolve candidates with a fresh epoch. Add an integrated registry/runtime/shell contract that starts with rejected geometry, makes placement safe, dispatches an owned signal, and asserts a new resolver/binding epoch produces exactly one mark.

---

_Reviewed: 2026-07-15T20:25:37Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
