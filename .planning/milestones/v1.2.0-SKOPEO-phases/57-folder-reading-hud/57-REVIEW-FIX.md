---
phase: 57-folder-reading-hud
fixed_at: "2026-08-19T15:50:18Z"
review_path: .planning/milestones/v1.2.0-SKOPEO-phases/57-folder-reading-hud/57-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 57: Code Review Fix Report

**Fixed at:** 2026-08-19T15:50:18Z
**Source review:** `.planning/milestones/v1.2.0-SKOPEO-phases/57-folder-reading-hud/57-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13
- Fixed: 13
- Skipped: 0

## Fixed Issues

### CR-01: Passive inspection deletes current truth when a read merely fails

**Status:** fixed: requires human verification
**Files modified:** `extension/utils/skopeo-truth-engine.js`, `tests/skopeo-truth-runtime.test.js`
**Commit:** `8bb593ee`
**Applied fix:** `inspectDisplaySnapshot` now treats exceptions and unavailable reads as non-mutating blockers. `withdrawStale` runs only after successful reads prove a parsed mismatch.

### CR-02: The live adapter fabricates a governing source and collapses distinct legal states

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`
**Commit:** `ccf246fb`
**Applied fix:** Governing identity comes from the accepted lineage path (`srv1:` citations), not the first assertion citation. Review-required maps first; historical and superseded stay distinct; unresolved sources stay `not-evaluated`. Facts use accepted-path `evidenceRole`.

### CR-03: No live material date can pass the projector's acceptance gate

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`
**Commit:** `95a3fd60`
**Applied fix:** Eligible, current, exact, timezone-bound deadlines emit HUD `trustState: 'accepted'`. Termination, expiration, renewal, and notice-deadline all have live producers from civil-date assertions.

### CR-04: More than ten eligible facts causes the entire reading HUD to disappear

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `2eb03002`
**Applied fix:** Private action bindings are filtered to the visible public tokens after projection. Extra bindings beyond the ten-fact cap no longer fail the whole HUD.

### CR-05: Admitted truth and evaluation blockers produce no contract-closed rail

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `6fde4b81`
**Applied fix:** Admitted blockers map onto the `contract-closed` rail (`evaluation-context-missing`, `access-unavailable`, `stale-input`, `partial-authority`, `exact-set-over-cap`) instead of returning `null`.

### CR-06: The contract HUD races the legacy corpus renderer for the same shell region

**Status:** fixed: requires human verification
**Files modified:** `extension/content/skopeo-runtime.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `f4271ae8`
**Applied fix:** `contractOwnsSharedSurface()` skips corpus refresh while a contract projection is pending or rendered. Late corpus completions are rejected before `renderCorpus`.

### CR-07: A complete zero-vendor folder cannot reach the supported empty state

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `c0280447`
**Applied fix:** Complete empty enrolled folders (`sources.length === 0`, `totalSources === 0`, `sourceOverflow === 0`) take an authenticated zero-set display path and emit `emptyState: complete-empty`. Reading mode still rejects empty sources.

### CR-08: Hide and geometry withdrawal leave runtime and background action authority alive

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `extension/content/skopeo-runtime.js`, `extension/content/skopeo-shell.js`, `tests/skopeo-hud-runtime.test.js`, `tests/skopeo-shell-contract.test.js`
**Commit:** `7bdf8255`
**Applied fix:** Hide and unsafe geometry call a runtime-owned `onContractWithdraw` path that clears content tokens, requires shell removal (or destroys the shell), and sends `skopeo:hud-revoke`. Background validates the sender/projection tuple and revokes minted actions.

### CR-09: Required missing-final, policy-missing, and urgent-gap states have no live producer

**Status:** fixed: requires human verification
**Files modified:** `extension/background.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `7653b23f`
**Applied fix:** Conclusive execution proofs map to `present` / `proven-missing`; current policy relations or explicit `presence: 'absent'` records map to `on-file` / `proven-missing`; otherwise fields stay `not-evaluated`. Proven absences and review-required conflicts populate urgent `priorityGaps`.

### CR-10: A truncated source manifest can be certified as complete

**Status:** fixed: requires human verification
**Files modified:** `extension/utils/skopeo-hud-projector.js`, `tests/skopeo-hud-projector.test.js`
**Commit:** `fec5ae4b`
**Applied fix:** Folder and reading completeness require `sourceOverflow === 0` and `totalSources === sources.length`. Overflow is partial/closed.

### WR-01: JavaScript and CSS disagree at the exact 480px breakpoint

**Status:** fixed
**Files modified:** `extension/content/skopeo-shell.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `ef388f83`
**Applied fix:** Geometry certificate uses `viewportWidth <= 480`, matching CSS `max-width: 480px`. Exact-480 fixture asserts the narrow layout.

### WR-02: A failed citation re-enables a token that background has permanently revoked

**Status:** fixed: requires human verification
**Files modified:** `extension/content/skopeo-shell.js`, `extension/content/skopeo-runtime.js`, `tests/skopeo-hud-runtime.test.js`
**Commit:** `7312ec28`
**Applied fix:** Failed citations stay disabled. Runtime refreshes the projection only when the click was actually dispatched.

### WR-03: Tests bypass the production joins that contain the failures above

**Status:** fixed
**Files modified:** `tests/skopeo-hud-runtime.test.js`
**Commit:** `d13508c4`
**Applied fix:** Added a production-join harness through the live absence/lineage adapters and real projector, plus HUD-first and corpus-first shared-surface completion orders. Hide revocation, empty folders, blockers, and overflow remain covered by the earlier finding tests.

## Verification

- `node -c extension/background.js` / `skopeo-runtime.js` / `skopeo-shell.js` — PASS
- `node tests/skopeo-hud-runtime.test.js` — PASS
- `node tests/skopeo-hud-projector.test.js` — PASS
- `node tests/skopeo-hud-evals.test.js` — PASS (`deterministic_structural_security` and `provisional_regression`; `domain_fidelity` remains `human_needed`)
- `node tests/skopeo-shell-contract.test.js` — PASS (after CR-08)

Logic mappings (governing source, blocker vocabulary, absence proofs, hide revocation) need a human pass before treating the phase as closed.

## Remaining Human Gate

Phase 57 Human UAT and eval `domain_fidelity` remain `human_needed`. Close review/security, then run `/gsd-secure-phase 57` and `/gsd-verify-work 57` before discussing Phase 58.

---

_Fixed: 2026-08-19T15:50:18Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
