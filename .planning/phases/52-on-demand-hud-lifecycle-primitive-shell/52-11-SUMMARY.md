---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 11
subsystem: chrome-extension-hud
tags: [skopeo, geometry, requestanimationframe, shadow-dom, chrome, resource-ledger]

requires:
  - phase: 52-07
    provides: Identity-preserving attention scopes, rich-surface collision certificates, browser geometry, and exact resource plateaus
  - phase: 52-09
    provides: Synchronous resize revalidation, bounded unsafe rich-state unwind, and placement updates on active Ambient/Anchored surfaces
provides:
  - Session-wide geometry invalidation from window resize, capture-phase document scroll, and visualViewport resize/scroll
  - One ledger-owned continuous rich-state animation-frame watchdog with release-before-revalidate semantics
  - One-shot unsafe-layout termination per shell generation
  - Current placement application to detached Ambient/Anchored scopes before identity-preserving restoration
  - Node and real-Chrome closure for WR-07 and WR-10 at normal and 420 CSS-pixel widths
affects: [phase-52-plan-12, phase-52-review, phase-52-verification]

tech-stack:
  added: []
  patterns: [stable session invalidation callback, ledger-owned one-frame watchdog, detached-scope placement before exposure]

key-files:
  created:
    - .planning/phases/52-on-demand-hud-lifecycle-primitive-shell/52-11-SUMMARY.md
  modified:
    - extension/content/skopeo-shell.js
    - tests/skopeo-shell-contract.test.js
    - tests/skopeo-browser-contract.test.js

key-decisions:
  - "Focused and Interstitial own exactly one session-ledger animation frame; the callback releases that exact handle before synchronous geometry revalidation and rearms only while the same shell remains live, rich, and nonterminal."
  - "One stable callback covers window resize, capture-phase document scroll, and supported visualViewport resize/scroll signals, with each registration represented by its own exact cleanup handle."
  - "Ambient and Anchored placement is applied while the suspended scope is still detached; Focused restoration remains identity-only, and a missing or unapplied placement fails closed through the generation's one-shot unsafe-layout request."

patterns-established:
  - "Continuous rich certificate: own one frame -> release its ledger handle -> synchronously revalidate -> rearm only if still live and rich."
  - "Restoration certificate: apply current placement to detached Ambient/Anchored nodes -> expose the exact existing scope -> restore declared focus without cloning or rebuilding."

requirements-completed: [HUD-03, HUD-04, HUD-05]
verification-status: automated-pass-live-uat-deferred
live-approval: false

duration: 26 min
completed: 2026-07-18
---

# Phase 52 Plan 11: Continuous Geometry Invalidation and Restored Placement Summary

**Rich HUD geometry is now re-certified every owned animation frame and on all session geometry signals, while suspended Ambient/Anchored nodes receive the current safe placement before ordinary Back exposes them.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-07-18T15:32:08Z
- **Completed:** 2026-07-18T15:57:37Z
- **Tasks:** 2
- **Files modified:** 3 implementation/test files plus this summary and shared phase tracking

## Accomplishments

- Replaced the resize-only session listener with one stable callback registered separately for window resize, capture-phase document scroll, visualViewport resize, and visualViewport scroll. Every registration owns an exact ledger cleanup with the original target, type, options, and function.
- Added a continuous Focused/Interstitial watchdog that owns at most one pending `requestAnimationFrame` and one `animationFrames` ledger entry. A fired frame clears its id and releases its exact handle before synchronous revalidation, then rearms only for a live, mounted, nonterminal rich state.
- Cancelled the watchdog on rich-scope disposal, Ambient/Anchored entry, unsafe-layout termination, and destroy; repeated frames remain at a stable one-frame plateau and every terminal path returns all eleven categories to exact zero.
- Made unsafe-layout termination one-shot for the shell generation so repeated resize/scroll/viewport/frame signals cannot issue duplicate kill requests or continue mutating a terminally unsafe shell.
- Extended placement application to query either the active surface or an exact detached scope. Before Ambient/Anchored restoration, the shell applies `_currentPlacement` to those existing nodes and fails closed if the placement is absent or cannot be applied.
- Preserved exact scope identity, node identity, deep focus, live-region copy, required-control identity, one root, and resource plateaus across safe frames/signals and across Focused and Gate Back sequences.
- Proved the same production behavior in local Chrome at normal and 420 CSS-pixel widths, including right-to-left placement refresh while rich, exact Back restoration, 8px nonintersection, owned-frame release, and exact-zero destroy.

## Task Commits

Both tasks followed red-first TDD, so each has a contract commit followed by its green implementation commit:

1. **Task 1: Add continuous rich geometry invalidation (WR-07)**
   - `07f808ce` — `test(52-11): specify geometry invalidation watchdog`
   - `ec02aae7` — `feat(52-11): watch rich geometry continuously`
2. **Task 2: Apply current placement before suspended-scope restoration (WR-10)**
   - `8f2263aa` — `test(52-11): expose stale restored placement`
   - `e71f05e0` — `fix(52-11): refresh placement before scope restore`

**Plan metadata:** recorded in the final documentation commit.

## Red-First Evidence

- Task 1 Node RED failed because Focused owned `0` animation frames instead of exactly `1`. The real-Chrome RED fixture completed and failed the same missing-frame assertion; without resize, moving the required control into Focused/Gate remained unsafe after the awaited browser frame.
- Task 2 Node RED refreshed `_currentPlacement` from top-right to collision-clear top-left while Focused remained safe, then exposed the exact suspended Anchored rail with stale right-side styles. Normal-width Chrome failed on the same stale restored rail; the 420px fixture carried the equivalent contract.
- After the production changes, safe signals and repeated frames preserve exact rich state, unsafe movement unwinds on the owned frame, and both ordinary Back sequences expose the exact prior nodes with current left placement and stable resources.

## Geometry and Resource Outcomes

| Case | Geometry result | Identity/resource result |
|------|-----------------|--------------------------|
| Safe Focused/Gate frame | Revalidated synchronously, then one frame rearmed | Exact scope/nodes/focus/copy/control/root; `animationFrames` remains exactly 1 |
| Document or visualViewport signal | Stable session callback revalidates synchronously | No listener growth; exact rich snapshot preserved when safe |
| Required control moves into rich surface | Owned frame detects revocation without resize | Existing Back policy restores exact safe scope; no clone/rebuild |
| No safe Ambient placement | One `unsafe-layout` request for the generation | Watchdog released; later signals are inert; destroy reaches exact zero |
| Right placement becomes blocked while rich | `_currentPlacement` becomes collision-clear top-left | Live rich scope remains untouched and retains one frame |
| Focused Back to Anchored | Detached Anchored rail receives left placement before append | Exact scope/nodes/focus; frame count 0; Anchored plateau restored |
| Gate Back to Focused to Anchored | One Back per level; final detached Anchored scope receives left placement | Exact Focused then Anchored identities; one root; exact plateaus |

## Automated Verification

The committed implementation passed both focused task commands and the plan-level gates:

```text
node tests/helpers/skopeo-resource-ledger.js --self-test
node tests/skopeo-shell-contract.test.js
node tests/skopeo-accessibility.test.js
node tests/skopeo-browser-contract.test.js
node --check extension/content/skopeo-shell.js

node tests/overlay-stability-cadence.test.js
node tests/overlay-content-audit.test.js
node tests/skopeo-session-lifecycle.test.js
npm run validate:extension
npm test
git diff --check -- extension/content/skopeo-shell.js tests/skopeo-shell-contract.test.js tests/skopeo-browser-contract.test.js
```

Results included resource-ledger PASS, shell PASS, accessibility PASS, real-Chrome browser PASS, cadence `53 passed / 0 failed`, content audit `69 passed / 0 failed`, runtime/session lifecycle PASS, extension validation PASS, and full `npm test` exit 0. Chrome executed from `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; the fixture uses `--run-all-compositor-stages-before-draw` so the existing zero-dependency `--dump-dom` runner services real `requestAnimationFrame` callbacks.

The package test script contains `node tests/skopeo-shell-contract.test.js` exactly once and `node tests/skopeo-browser-contract.test.js` exactly once. Stub, dynamic-code/HTML-sink threat, Plan 52-12 isolation, and scoped whitespace scans all passed.

The preserved-UAT check passed:

```text
git hash-object .planning/phases/52-on-demand-hud-lifecycle-primitive-shell/52-UAT.md
a9fa6926c909d322fe45d8d959d37a24f4cafd80
```

## Files Created/Modified

- `extension/content/skopeo-shell.js` — Adds stable session geometry signals, the ledger-owned rich animation-frame watchdog, one-shot unsafe termination, detached-scope placement, and fail-closed restoration.
- `tests/skopeo-shell-contract.test.js` — Adds frame/signal ownership, one-shot kill, exact cleanup, no-resize motion, stale suspended-placement, identity/focus/copy, resource plateau, and exact-zero contracts.
- `tests/skopeo-browser-contract.test.js` — Adds awaited production-frame invalidation plus normal/420px detached placement restoration in local Chrome.
- `.planning/phases/52-on-demand-hud-lifecycle-primitive-shell/52-11-SUMMARY.md` — Records automated closure while preserving the live-UAT boundary.

## Decisions Made

- The animation frame is a session geometry certificate, not a surface-owned resource. This lets Focused-to-Gate suspension reuse the one pending frame while disposal, terminal kill, or non-rich restoration releases it exactly once.
- Frame callbacks clear ownership before calling `_revalidateGeometry()` so synchronous Back, destroy, or unsafe termination cannot double-cancel or double-release the firing handle.
- Placement mutates detached Ambient/Anchored nodes before append; this prevents even a transient stale rail from becoming visible and leaves Focused restoration identity-only.

## Deviations from Plan

None. The work stayed within the three owned shell/test files, added no dependency or protocol, and did not touch Plan 52-12 side-panel files.

## Issues Encountered

- Headless Chrome's `--dump-dom` path did not advance real animation frames with the prior flags. Adding the standard `--run-all-compositor-stages-before-draw` flag made the awaited production frame deterministic without mocking browser APIs or skipping Chrome.
- The first WR-10 copy assertion compared restored state with pre-Focused Ambient copy. The contract was corrected to compare against the committed rich-state copy, which is the identity-preservation boundary the plan requires.
- Full `npm test` refreshes crawler artifact dates. Those verification-only changes were restored byte-for-byte; no showcase artifact is part of this plan.

## User Setup Required

None. Verification uses the existing local Chrome executable with isolated temporary profiles and adds no package, service, permission, or runtime setup.

## Next Phase Readiness

- Phase 52 is 11/12 plans complete. Plan 52-12 remains the sole gap-closure plan and owns WR-09 side-panel switch-latest correctness.
- WR-07 and WR-10 are closed by committed mock and real-Chrome evidence. Plan 52-12 files were not modified.
- `52-UAT.md` remains `status: partial`: L01-L15 still have zero live PASS rows. Drive/Docs coexistence, VoiceOver, shortcut assignment, MV3 sleep/wake, and live eleven-category teardown evidence remain user-deferred and are **not live-approved**.

## Self-Check: PASSED — Automated Gap Closure Only

- Task commits `07f808ce`, `ec02aae7`, `8f2263aa`, and `e71f05e0` exist in history.
- Both focused commands, the required real local Chrome run, `npm run validate:extension`, and full `npm test` passed after the final implementation commit.
- Stable listener identity/options, one-frame rich plateaus, release-before-revalidate, no-resize revocation, one-shot kill, detached placement before exposure, exact identity restoration, and exact-zero teardown are covered at normal and 420px widths.
- The UAT artifact retains blob hash `a9fa6926c909d322fe45d8d959d37a24f4cafd80`.
- Phase-local accounting after this summary is exactly 11/12; Plan 52-12 remains incomplete.
- No live Chrome Drive/Docs/VoiceOver approval was claimed; L01-L15 remain deferred with zero live PASS rows.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-18 with live UAT deferred*
