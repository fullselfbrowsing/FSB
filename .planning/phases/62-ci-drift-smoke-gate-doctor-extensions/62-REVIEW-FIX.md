---
phase: 62
fixed_at: 2026-07-16T20:25:11Z
review_path: .planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 62: Code Review Fix Report

**Fixed at:** 2026-07-16T20:25:11Z
**Source review:** .planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Compatibility persistence recursively starts another live compatibility refresh

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `extension/ui/options.js`, `tests/mcp-bridge-background-dispatch.test.js`, `tests/providers-panel-ui.test.js`
**Commit:** 3154bda4
**Applied fix:** Split cache-only client inventory from the exact-shape explicit live compatibility action. Storage fan-out now reprojects cache only, and the composed regression proves one manual refresh causes one daemon request, one durable write, and one cache hydration.

### WR-01: A stale refresh outcome can contradict the compatibility badge and announcement

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `extension/ui/options.js`, `tests/mcp-bridge-background-dispatch.test.js`, `tests/providers-panel-ui.test.js`
**Commit:** de67907b
**Applied fix:** Made stale refresh failures coherently degrade retained fresh support to `degraded/evidence_stale`, preserve already degraded or unsupported truth, and derive failure announcements from the selected compatibility model.

### WR-02: An open panel never ages Supported evidence into Degraded

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `extension/ui/options.js`, `extension/utils/mcp-agent-providers.js`, `tests/mcp-agent-providers-storage.test.js`, `tests/mcp-bridge-background-dispatch.test.js`, `tests/providers-panel-ui.test.js`
**Commit:** 7b28ab5b
**Applied fix:** Made the 15-minute boundary exclusive of Supported, returned an authoritative compatibility expiry deadline, and added one cancel-and-replace UI timer that performs a cache-only reprojection without daemon, storage, focus, selection, or form mutation.

### WR-03: A safe-integer injected clock can still crash doctor timestamp formatting

**Status:** fixed: requires human verification
**Files modified:** `mcp/src/diagnostics.ts`, `tests/mcp-diagnostics-status.test.js`
**Commit:** d77bf2ce
**Applied fix:** Bounded injected clocks to the ECMAScript Date domain and added first-value-above-maximum coverage proving doctor returns the deterministic epoch snapshot without exception text.

### WR-04: Selected details create a second compatibility live-region owner

**Status:** fixed: requires human verification
**Files modified:** `extension/ui/control_panel.html`, `tests/providers-panel-ui.test.js`
**Commit:** c7dee1c6
**Applied fix:** Removed live behavior from the selected agent-details container, retained the independent pairing-status live region, and pinned `#providerEvidenceAnnouncement` as the sole compatibility announcement owner.

---

_Fixed: 2026-07-16T20:25:11Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
