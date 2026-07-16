---
phase: 62
fixed_at: 2026-07-16T20:58:20Z
review_path: .planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 62: Code Review Fix Report

**Fixed at:** 2026-07-16T20:58:20Z
**Source review:** .planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: A successful manual refresh is erased by its own storage fan-out

**Status:** fixed: requires human verification
**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** 79634d66
**Applied fix:** A queued cache hydration caused by the successful live refresh's own durable write now preserves the ready evidence generation and its one polite success announcement. The composed causal test proves exactly one daemon request, one durable write, one cache read, no stale markers, and a retained `Provider status refreshed.` announcement after final settlement.

### WR-02: The compatibility-expiry timer can mutate recommendation and unrelated evidence

**Status:** fixed: requires human verification
**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** 1cbafdcc
**Applied fix:** The expiry callback now uses a cache-only compatibility projection path that validates and merges only agent-row `.compatibility` fields. An adversarial fake-clock response changes clicked, installed, connected, and live evidence, while the regression proves only Supported becomes Degraded and all non-compatibility clients, recommendation, evidence status, focus, forms, dirty state, and writes remain identical.

### WR-03: A compatibility snapshot is invisible until another evidence map creates the agent row

**Status:** fixed: requires human verification
**Files modified:** `extension/utils/mcp-agent-providers.js`, `tests/mcp-agent-providers-storage.test.js`
**Commit:** 560db4ba
**Applied fix:** A durably validated compatibility snapshot now seeds exactly the three canonical agent rows before projection without manufacturing clicked, installed, connected, or live evidence. Snapshot-only coverage proves Claude is Supported, OpenCode and Codex remain Unsupported, API rows are not created, recommendation remains the API fallback, and the Claude expiry deadline is available.

### WR-04: The executable Phase 62 security contract still pins pre-fix compatibility source shapes

**Status:** fixed
**Files modified:** `tests/delegation-phase-contract.test.js`
**Commit:** 48983332
**Applied fix:** Updated only the three stale source-shape assertions to pin the exact `>=` freshness boundary, the explicit live request → validation → durable replacement → fan-out sequence, and separated cache/live response schemas including `compatibilityExpiresAt`. The complete contract now passes 763 assertions with all task, drift, mitigation, authority, leakage, and deferred-UAT guards retained.

## Automated Verification

- `node tests/providers-panel-ui.test.js` — passed
- `node tests/providers-panel-logic.test.js` — passed
- `node tests/mcp-agent-providers-storage.test.js` — passed
- `node tests/mcp-bridge-background-dispatch.test.js` — 293 passed, 0 failed
- `node tests/delegation-phase-contract.test.js` — 763 passed, 0 failed
- Syntax checks for all modified JavaScript files — passed
- `git diff --check f20ba83a..HEAD` — passed

Human/browser/native/network UAT and the full or guarded root suite were not run. Per user direction, all UAT remains deferred to the single milestone-end sweep.

---

_Fixed: 2026-07-16T20:58:20Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
