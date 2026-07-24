---
phase: 57-agent-identity-capture
reviewed: 2026-07-12T14:14:48Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - extension/background.js
  - extension/ui/onboarding.js
  - extension/utils/agent-registry.js
  - extension/utils/mcp-agent-providers.js
  - extension/utils/mcp-client-aliases.js
  - extension/ws/mcp-bridge-client.js
  - extension/ws/mcp-tool-dispatcher.js
  - mcp/src/agent-scope.ts
  - mcp/src/client-inventory.ts
  - mcp/src/index.ts
  - mcp/src/runtime.ts
  - mcp/src/types.ts
  - package.json
  - tests/agent-scope.test.js
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/mcp-agent-providers-storage.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-client-identity-integration.test.js
  - tests/mcp-client-identity.test.js
  - tests/mcp-client-inventory.test.js
  - tests/mcp-client-merged-view.test.js
  - tests/mcp-version-parity.test.js
  - tests/onboarding-agent-provider-clicks.test.js
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-07-12T14:14:48Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

The complete Phase 57 scope was re-reviewed after fix commits `5500a3c4` and `30452a80`. Known aliases now converge on canonical durable keys, legacy alias rows with distinct finite timestamps retain the newest record, and special `__proto__` evidence survives storage and merged output without changing map prototypes. The focused Phase 57 suites pass. One reconnect edge remains in the canonical timestamp fix: equal millisecond timestamps retain the earlier record instead of the later registration.

## Warnings

### WR-01: Same-millisecond reconnects retain stale connected evidence

**File:** `extension/utils/mcp-agent-providers.js:42-47,160-177`
**Issue:** `recordConnected()` reuses the migration predicate that replaces a finite timestamp only when `candidateTime > currentTime`. Two serialized registrations can receive the same millisecond-resolution `Date.now()` value; the second registration is then discarded even though it is the later operation. A dynamic reproduction with `Claude Code` version `1` followed by `Anthropic Claude` version `2` at the same timestamp leaves version `1` in the canonical `claude-code` row. A backward wall-clock adjustment has the same effect. This violates the reconnect-update-in-place contract and can leave Phase 58 reading stale name/version evidence.
**Fix:** In `recordConnected()`, unconditionally write the newly created record after the mutation chain has serialized the operation. Keep greatest-finite-`lastSeenAt` selection only in `normalizeConnected()`, where multiple pre-fix legacy alias rows truly need migration arbitration. Add a regression with a fixed `Date.now()` for two sequential alias registrations and assert that the second record wins.

---

_Reviewed: 2026-07-12T14:14:48Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
