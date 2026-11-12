---
phase: 58-providers-panel
fixed_at: 2026-07-12T23:03:54Z
review_path: .planning/phases/58-providers-panel/58-REVIEW.md
iteration: 3
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 58: Code Review Fix Report

**Fixed at:** 2026-07-12T23:03:54Z
**Source review:** `.planning/phases/58-providers-panel/58-REVIEW.md`
**Iteration:** 3

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: Raw allowlisted-id rows can become canonical recommendations and status

**Files modified:** `extension/ui/providers-panel.js`, `extension/ui/options.js`, `tests/providers-panel-logic.test.js`, `tests/providers-panel-ui.test.js`
**Commit:** `245b6e9d`
**Result:** fixed: requires human verification
**Applied fix:** Added one canonical supported-row predicate that rejects `raw: true` before recommendation and status evaluation. The empty-state path now derives evidence from the same safe status contract. Logic and VM coverage exercise raw collisions under every allowlisted agent id, including fallback recommendation, neutral canonical status, confirmed empty state, and inert rendering under Other MCP clients.

### WR-02: In-flight API discovery can mutate latent settings after switching to an agent

**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commits:** `c8f6d040`, `a0ba3e62`
**Result:** fixed: requires human verification
**Applied fix:** Added a monotonic discovery generation owned by `FSBDiscoveryUI`, invalidated whenever provider kind/id changes. Cache hydration and model discovery now re-check the generation after every asynchronous boundary before any model, status, or control renderer runs. Cancellation restores the pre-loading model, status, and control snapshot when the user selects an agent. Held success, auth-failure, and persistent-cache hydration tests prove agent selection itself preserves latent API UI state and the later settlement performs no connection work or UI mutation.

### WR-03: Storage evidence changes can be dropped during an in-flight refresh

**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** `50e1d394`
**Result:** fixed: requires human verification
**Applied fix:** Storage invalidations now set one queued-refresh flag when an evidence request is active. The flag launches exactly one follow-up after settlement, while direct concurrent callers still coalesce on the current promise. A held-runtime regression emits both local and session invalidations, asserts exactly two calls, and proves the second snapshot remains the final view.

### IN-01: Providers detail card is missing its explicit closing `div`

**Files modified:** `extension/ui/control_panel.html`, `tests/providers-panel-ui.test.js`
**Commit:** `46bdfe43`
**Result:** fixed
**Applied fix:** Added the missing explicit closing `div` between the detail form section and the Providers section end. A scoped stack-based HTML parser assertion now validates balanced nesting for the full `#providers` fragment and pins the card close before `</section>`.

### Follow-up WR-01: Pending API-key discovery debounce survives agent selection

**Files modified:** `extension/ui/options.js`, `tests/providers-panel-ui.test.js`
**Commit:** `403a1047`
**Result:** fixed
**Applied fix:** Provider invalidation now clears and nulls every per-provider discovery debounce timer. The timer callback also fails closed unless the panel is still in API mode with the same active API provider. A held 500 ms regression proves switching to an agent causes no discovery call, cache clear, or latent API model/status mutation.

## Verification

- `node -c extension/ui/providers-panel.js`, `node -c extension/ui/options.js`, and syntax checks for both provider test files: passed at each applicable fix gate.
- `git diff --check` on every touched source/test set and on the final workspace diff: passed.
- `node tests/providers-panel-logic.test.js`: passed after each fix.
- `node tests/providers-panel-ui.test.js`: passed after each fix, including raw collisions, held discovery outcomes, queued storage refresh, and scoped HTML balance.
- `node tests/model-discovery.test.js`: 101 passed, 0 failed after each fix.
- `node tests/model-discovery-ui.test.js`: 79 passed, 0 failed after each fix.
- `node tests/model-combobox-ui.test.js`: 30 passed, 0 failed after each fix.
- `node tests/lattice-provider-bridge-smoke.test.js`: 110 passed, 0 failed after each fix.
- `npm test`: passed at every extension-touching fix gate, including the final discovery snapshot-restoration hardening. The archived Phase 39 manifest was temporarily symlinked at its legacy test path for each successful full-suite run and removed afterward; no fixture link remains.
- Final targeted re-review after `403a1047`: clean, 0 critical / 0 warning / 0 info findings.

## Skipped Issues

None.

---

_Fixed: 2026-07-12T23:03:54Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
