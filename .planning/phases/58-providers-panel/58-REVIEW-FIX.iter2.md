---
phase: 58-providers-panel
fixed_at: 2026-07-12T22:16:46Z
review_path: .planning/phases/58-providers-panel/58-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 58: Code Review Fix Report

**Fixed at:** 2026-07-12T22:16:46Z
**Source review:** `.planning/phases/58-providers-panel/58-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: The no-agent empty state is based on record presence, not a successful negative detection

**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** `016278a6`
**Result:** fixed: requires human verification
**Applied fix:** The empty state now appears only for a ready snapshot with no semantic supported-agent evidence. `installed.detected: false` is negative evidence, while clicked, installed-true, connected, or live evidence suppresses the absence claim. Loading, unavailable, and stale states keep the claim hidden.

### WR-02: The initial fallback recommendation is not rendered before an unbounded runtime request

**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** `c82059a3`
**Result:** fixed: requires human verification
**Applied fix:** Recommendation rendering now happens before the runtime request. The request has a guarded five-second timeout with callback/timeout settlement deduplication and timer cleanup. Deterministic short-timeout tests cover initial unavailable and prior-success stale recovery, including Refresh, selection, and exactly-one-badge invariants.

### WR-03: Visible status badges become part of each radio's accessible name

**Files modified:** `extension/ui/control_panel.html`, `tests/providers-panel-ui.test.js`
**Commit:** `a0169383`
**Result:** fixed
**Applied fix:** Every provider name has a stable id, every radio uses that name through `aria-labelledby`, and changing recommendation/evidence badges are `aria-hidden`. Static accessible-name coverage proves each radio name is exactly its provider display name.

### WR-04: The delayed load callback can run the API path after the user has selected an agent

**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** `b1f72090`
**Result:** fixed: requires human verification
**Applied fix:** Saved-model loading now uses a cancellable timer and load generation. The callback also rechecks the active kind and API provider before applying model state or testing the connection. A held-timer regression proves switching to an agent prevents both model overwrite and API connection work.

### WR-05: `:has()` causes selected-row styling to disappear on declared supported Chrome versions

**Files modified:** `extension/ui/options.css`, `tests/providers-panel-ui.test.js`
**Commit:** `f5cc9cd1`
**Result:** fixed
**Applied fix:** `.provider-row.is-selected` and dark-mode selected styling are standalone Chrome 88 baseline rules, row focus uses compatible `:focus-within`, and `:has()` appears only inside `@supports` enhancement blocks. Source-contract tests pin that structure.

## Verification

- `node -c extension/ui/options.js` and `node -c tests/providers-panel-ui.test.js`: passed where applicable.
- `node tests/providers-panel-logic.test.js`: passed after every source fix.
- `node tests/providers-panel-ui.test.js`: passed after every source fix.
- `node tests/model-discovery.test.js`: 79 passed, 0 failed after every source fix.
- `node tests/model-discovery-ui.test.js`: passed after every source fix.
- `node tests/model-combobox-ui.test.js`: 30 passed, 0 failed after every source fix.
- `node tests/lattice-provider-bridge-smoke.test.js`: 110 passed, 0 failed after every source fix.
- `npm test`: passed after each of the five fixes. The existing archived Phase 39 manifest was temporarily symlinked at its legacy test path for each run and removed afterward; no fixture link remains.
- `git diff --check` on each finding's files: passed.

## Skipped Issues

None.

---

_Fixed: 2026-07-12T22:16:46Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_

