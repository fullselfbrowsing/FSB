---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 09
subsystem: chrome-extension-hud
tags: [skopeo, geometry, shadow-dom, chrome, resize, resource-ledger]

requires:
  - phase: 52-07
    provides: Browser-computed host geometry, staged rich-surface collision checks, identity-preserving attention scopes, and exact resource plateaus
  - phase: 52-08
    provides: Exact combined runtime/shell cleanup certificates and the registered automated verification gate
provides:
  - Fresh fail-closed Ambient placement authority at the prepare-to-commit boundary
  - Synchronous Focused/Gate geometry revocation with bounded restoration to the nearest measured-safe suspended scope
  - Identity-preserving Ambient/Anchored placement updates and exact resource conservation across resize
  - Real-Chrome proof at normal and 420 CSS-pixel widths without changing deferred live UAT
affects: [phase-52-plan-10, phase-52-review, phase-52-verification, phase-53-drive-router]

tech-stack:
  added: []
  patterns: [fresh geometry at commit, synchronous certificate revocation, bounded identity-preserving unwind, zero-dependency local Chrome contract]

key-files:
  created:
    - .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-09-SUMMARY.md
  modified:
    - extension/content/skopeo-shell.js
    - tests/skopeo-shell-contract.test.js
    - tests/skopeo-browser-contract.test.js

key-decisions:
  - "A prepared placement is advisory only: exact-token admission consumes it once, and mount authority comes from a new geometry pass before any DOM or resource acquisition."
  - "The one session-owned resize listener synchronously remeasures the active rich surface and current required page control, then uses existing back semantics to restore exact suspended identities."
  - "Unsafe Gate geometry may unwind twice—Gate to Focused, then Focused to Anchored—while a missing placement, failed restoration, or unapplied placement requests one terminal unsafe-layout cleanup."
  - "Ambient and Anchored reuse their committed nodes while fresh lens/rail placement is applied; safe Focused and Gate states remain byte-for-byte untouched."

patterns-established:
  - "Commit-time certificate: exact prepared token -> consume once -> fresh choosePlacement -> only then create or append the Shadow host."
  - "Resize-time certificate: choose current placement -> measure active rich surface/current control -> preserve if safe or synchronously unwind at most two levels -> apply without rebuild or terminate fail-closed."

requirements-completed: [HUD-03, HUD-04, HUD-05, HUD-07, HUD-08]
verification-status: automated-pass-live-uat-deferred
live-approval: false

duration: 15 min
completed: 2026-07-15
---

# Phase 52 Plan 09: Revocable HUD Geometry Certificates Summary

**Ambient mount now trusts only fresh commit-time geometry, and open Focused/Gate surfaces synchronously preserve, unwind, or terminate when resize revokes their collision certificate.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-15T14:51:20Z
- **Completed:** 2026-07-15T15:05:51Z
- **Tasks:** 2
- **Files modified:** 3 implementation/test files plus this summary and shared phase tracking

## Accomplishments

- Made the exact prepared token single-use while removing its stored rectangle as mount authority. A fresh `_choosePlacement()` now runs before `createElement`, Shadow attachment, append, popover, listeners, or any resource handle.
- Proved that a page control inserted after prepare can never be overlapped at commit: the shell selects a current safe corner/mode or returns `false` with no root, focus write, listener, popover, document-child mutation, or nonzero resource category.
- Replaced the resize body with one synchronous geometry revalidation path that measures the committed `.skopeo-focused-card` or `.skopeo-gate` and the current required host control.
- Preserved safe rich scopes, node identities, deep focus, live-region copy, one root, and all eleven resource values exactly.
- Restored unsafe Focused to its exact Anchored scope and unsafe Gate to the nearest measured-safe Focused or Anchored scope. Restoration reuses existing `back()` focus policy and never synthesizes a click or forces body focus.
- Refactored placement application so an Anchored rail moves to the fresh safe side even though that scope has no Ambient lens, without rebuilding nodes or growing resources.
- Exercised normal and 420 CSS-pixel production geometry in local Chrome and destroyed every fixture to the exact eleven-key zero certificate.

## Task Commits

Each task was committed atomically after its new negative control failed against the prior implementation and the corrected production shell passed:

1. **Task 1: Revalidate Ambient geometry at the prepare-to-commit boundary**
   - `93952cdf` — `fix(52-09): revalidate Ambient placement at commit`
2. **Task 2: Revoke unsafe Focused and Gate geometry after resize or control movement**
   - `3f44cbc0` — `fix(52-09): revoke unsafe rich geometry`

**Plan metadata:** recorded in the final documentation commit.

## Red-First Evidence

- Before Task 1, both the mock and Chrome contracts showed the committed Ambient lens reusing a now-obstructed prepared rectangle. The all-candidates-blocked case also demonstrated that stale preparation could authorize commit.
- Before Task 2, both the mock contract and real Chrome left an already-open Focused surface committed after its required page control moved into the current card rectangle.
- After the production changes, those same cases pass without weakening the controls: foreign/stale/reused tokens do not trigger geometry, safe rich resize changes no identity or resource value, and unsafe rich resize never leaves the unsafe level committed.

## Geometry Outcomes

| Case | Synchronous result | Identity/resource result |
|------|--------------------|--------------------------|
| Ambient obstruction after prepare | Fresh nonintersecting placement or root-free `false` | Prepared token consumed once; no stale rectangle authority |
| Every Ambient candidate blocked | `false` before any host/resource acquisition | Zero roots/popover/listeners/focus writes; exact eleven-key zero |
| Safe Focused or Gate resize | Current rich state preserved | Exact attention, scopes, nodes, focus, live copy, root, and resource snapshot |
| Unsafe Focused | Exact suspended Anchored scope restored | Existing nodes/focus target restored; one root; no resource growth |
| Unsafe Gate | Exact safe Focused restored, or Anchored when Focused is also unsafe | Bounded two-level unwind; one root; prior resource plateau restored |
| Missing/unapplied safe placement or failed restoration | One `unsafe-layout` cleanup request | No replacement scope or unbounded recovery loop |

## Automated Verification

The complete Plan 09 gate passed from the committed implementation:

```text
node tests/helpers/skopeo-resource-ledger.js --self-test
node tests/skopeo-shell-contract.test.js
node tests/skopeo-accessibility.test.js
node tests/skopeo-browser-contract.test.js
node tests/overlay-stability-cadence.test.js
node tests/overlay-content-audit.test.js
node tests/skopeo-session-lifecycle.test.js
node --check extension/content/skopeo-shell.js
git diff --check
```

Results included resource-ledger PASS, shell PASS, accessibility PASS, real-Chrome browser PASS, cadence `53 passed / 0 failed`, content audit `69 passed / 0 failed`, and runtime/session lifecycle PASS. Chrome executed from `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; the narrow fixture transitioned from at least 480 CSS pixels to 420 CSS pixels before dispatching the production resize event.

The preserved-UAT check also passed:

```text
git hash-object .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-UAT.md
a9fa6926c909d322fe45d8d959d37a24f4cafd80
```

## Files Created/Modified

- `extension/content/skopeo-shell.js` — Uses fresh commit geometry, synchronously revalidates resize geometry, restores unsafe rich states through existing scope/back mechanics, and applies rail placement independently of the lens.
- `tests/skopeo-shell-contract.test.js` — Adds stale commit, all-blocked, token single-use, safe-rich preservation, unsafe Focused/Gate rollback, terminal cleanup, rail movement, and exact-zero contracts.
- `tests/skopeo-browser-contract.test.js` — Adds production-script prepare/commit mutations and normal/420px Focused/Gate resize invalidation in local Chrome.
- `.planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-09-SUMMARY.md` — Records automated geometry closure while preserving the deferred live-UAT boundary.

## Deviations from Plan

None. Plan 09 changed only its owned shell geometry mechanics and contracts; no runtime protocol, selector integration, dependency, server, daemon, semantic anchor, Graphify engine, or later-phase feature was added.

## Issues Encountered

- In the normal-width Chrome Gate fixture, the actual restored Focused rectangle could also be unsafe against the moved required control. The assertion therefore derives the nearest safe expected scope from the same measured viewport/control geometry; production correctly continues to Anchored when Focused is unsafe, exactly as the plan requires.

## User Setup Required

None. The test uses an existing local Chrome executable and isolated temporary profile; it adds no package or service.

## Next Phase Readiness

- Phase 52 is now 9/10 plans complete. Plan 52-10 remains for same-tab ABA-safe controller/request authority and per-tab lifecycle generation floors.
- WR-07 is closed by committed mock and real-Chrome evidence. WR-08 remains owned exclusively by Plan 52-10.
- `52-UAT.md` remains `status: partial`: L01-L15 still have zero live PASS rows. Drive/Docs coexistence, VoiceOver, shortcut assignment, MV3 sleep/wake, and live eleven-category teardown evidence remain user-deferred and **not live-approved**.

## Self-Check: PASSED — Automated Gap Closure Only

- Task commits `93952cdf` and `3f44cbc0` exist in history.
- The complete prescribed Plan 09 automated chain passed, and the browser gate executed rather than skipped.
- Fresh commit geometry, normal/narrow rich-state revocation, exact identity restoration, resource conservation, and repeated exact-zero teardown passed.
- The UAT artifact retains blob hash `a9fa6926c909d322fe45d8d959d37a24f4cafd80`.
- Phase-local accounting after this summary is exactly 9/10; 52-10 remains incomplete.
- No live Chrome Drive/Docs/VoiceOver approval was claimed; L01-L15 remain deferred with zero live PASS rows.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-15 with live UAT deferred*
