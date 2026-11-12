---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 02
subsystem: ui
tags: [chrome-extension, shadow-dom, accessibility, focus-management, resource-ledger]

requires:
  - phase: 52-01
    provides: Terminal per-tab generation ownership and stale-work rejection
provides:
  - Detached collision-safe Ambient preparation and one committed Shadow/top-layer owner
  - Exact six-primitive grammar across four attention policies with text-only rendering
  - Keyboard, focus, live-region, preference, and idempotent eleven-category teardown contracts
affects: [52-03-skopeo-runtime, 52-04-mv3-controller, 52-05-side-panel, 52-06-release-evidence]

tech-stack:
  added: []
  patterns: [prepare-then-commit DOM ownership, Shadow DOM pointer isolation, resource-ledger teardown, one-level focus snapshots]

key-files:
  created:
    - extension/content/skopeo-shell.js
    - tests/helpers/skopeo-resource-ledger.js
    - tests/skopeo-shell-contract.test.js
    - tests/skopeo-accessibility.test.js
  modified: []

key-decisions:
  - "Ambient preparation returns an opaque one-use token and owns no root, listener, focus, or top-layer state before commit."
  - "One fixed pointer-transparent host owns the open Shadow root, optional manual popover, six primitive registry, and single live region."
  - "Focused and Interstitial suspend the preceding shell-owned DOM so one-level back can restore the exact trigger rather than an equivalent replacement."
  - "One window keydown boundary handles applicable Escape and Gate-only Tab behavior; the second Escape reports a runtime kill without installing another listener."

patterns-established:
  - "Observable top-layer lifecycle: successful showPopover acquires one dedicated ledger handle and destroy releases it before root removal."
  - "Text-only sink boundary: variable display values use textContent and the shell accepts no host markup, URL, or executable attribute."
  - "Focus-safe teardown: restore only connected, visible, enabled targets with preventScroll, fall back to a preceding shell trigger, and never force body focus."

requirements-completed: [HUD-03, HUD-04, HUD-05, HUD-07, HUD-08]

duration: 14min
completed: 2026-07-14
---

# Phase 52 Plan 02: Isolated Skopeo Primitive Shell Summary

**A detached prepare/commit boundary now mounts one host-safe Shadow shell whose six primitives, four attention levels, keyboard behavior, and teardown are executable contracts rather than visual assumptions.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-14T20:05:10Z
- **Completed:** 2026-07-14T20:18:56Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added an executable eleven-category resource ledger with deliberate listener and top-layer leaks that must fail before release and return exactly to zero afterward.
- Implemented collision-safe 240x40 then 88x40 Ambient placement with deterministic corner order, 16px inset, 8px host-control clearance, and fail-closed preparation that creates no page state.
- Mounted exactly one fixed pointer-transparent owner with one open Shadow root, optional manual popover/top-layer handle, one live region, and the exact anchor/chip/halo/rail/ghost/gate registry.
- Enforced Ambient-only ordinary entry and controlled-fixture allowlists for Anchored, Focused, and Interstitial, including one halo, temporary ghosting, and one consequence gate.
- Added one keyboard boundary for one-level Escape, 600ms double-Escape kill reporting, and Gate-only Tab wrapping, plus exact focus capture/restoration with `preventScroll`.
- Proved hostile display strings remain literal, no host page state changes, hidden primitives leave the DOM, and idempotent destroy balances every resource including top-layer ownership.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the non-vacuous shell, resource, and accessibility test contracts** - `30df2edb` (test)
2. **Task 2: Implement one Shadow owner, Ambient surface, placement engine, and six-primitive policy** - `a4c137e9` (feat)
3. **Task 3: Complete focus, preference, Escape, and owned-resource teardown behavior** - `de5e7d75` (feat)

**Plan metadata:** recorded in the final documentation commit.

## Files Created/Modified

- `tests/helpers/skopeo-resource-ledger.js` - Exact eleven-category acquire/release oracle with leak and double-release negative controls.
- `tests/skopeo-shell-contract.test.js` - VM/DOM contract for prepare/commit ownership, top-layer transitions, collision safety, primitive scarcity, host integrity, hostile text, and teardown.
- `tests/skopeo-accessibility.test.js` - Exact semantic, focus order, Gate trap, Escape window, live cadence, preference, and restoration contract.
- `extension/content/skopeo-shell.js` - Classic-script/CommonJS shell implementation with isolated rendering, keyboard/focus stack, and resource ownership.

## Shell Contract

`prepareAmbient()` only reads viewport and host-control geometry. A successful result is a detached opaque token; root and `popoverTopLayer` counts remain zero until `mountAmbient()` consumes that exact token once. Stale, foreign, reused, or unsafe placements fail closed.

Committed mount creates one fixed `inset:0`, pointer-none host and one open Shadow root. Successful `showPopover()` changes the top-layer ledger from zero to one; unsupported or failed popover entry stays on the z-index fallback with a zero top-layer count. Destroy attempts `hidePopover()` before removing the owner and returns all eleven categories to zero even when hide throws.

The primitive policy is exact:

| Attention | Permitted primitives | Focus behavior |
|---|---|---|
| Ambient | rail | Does not move focus |
| Anchored | anchor, chip, rail, halo | Does not move focus; one halo maximum |
| Focused | anchor, chip, ghost | Captures origin and focuses the named title |
| Interstitial | gate | Captures trigger, focuses safest return, traps Tab only while visible |

Normal callers cannot advance past Ambient. Richer states require the opaque controlled-fixture token and render only shell-owned sample nodes with approved copy.

## Safety and Accessibility Evidence

- The host snapshot covers html/body classes, styles, attributes, `inert`, `aria-hidden`, scroll, and active focus; before and after are identical for Ambient mount/destroy.
- The shell host, envelope, rail, halo, ghost, and empty geometry remain pointer-transparent; only native visible controls opt into pointer input.
- Hostile `<img ... onerror=...>` display data stays literal in the live region, creates no image, and executes no handler. Source scans find no `innerHTML`, `insertAdjacentHTML`, dynamic code, or external URL.
- Focused restores the exact Anchored trigger; Interstitial restores the exact Focused trigger. Invalid host origins fall back to the preceding shell trigger or no forced focus, never `body`.
- One global keydown listener ignores repeated/composing Escape, suppresses only consumed Escape or Gate-wrap Tab, and is removed with the same function identity during teardown.
- CSS includes the exact four type sizes, approved tokens, 2px orange focus outline, narrow/200% reflow constraints, forced system colors, increased-contrast rail treatment, and zero-duration reduced motion.

## Verification Results

- `node tests/helpers/skopeo-resource-ledger.js --self-test && node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js` - PASS
- `node tests/overlay-content-audit.test.js` - PASS (69 assertions)
- `node tests/overlay-stability-cadence.test.js` - PASS (53 assertions)
- `node --check extension/content/skopeo-shell.js && node --check tests/skopeo-shell-contract.test.js && node --check tests/skopeo-accessibility.test.js` - PASS
- `git diff --check` - PASS
- Static/automation bundle scan confirms `skopeo-shell.js` is not registered in any manifest or existing automation content-script bundle; Plan 04 retains dynamic-injection ownership.

## Decisions Made

- Preserve the preceding Anchored/Focused nodes while the next attention level is visible. This makes restoration target identity observable and avoids replacing a trigger with a merely equivalent element.
- Keep ordinary invocation at Ambient. Controlled richer states are test/dev-only and require an opaque token unavailable to production callers.
- Treat popover entry as an acquired resource only after `showPopover()` succeeds; fallback stacking never pretends to own top-layer state.
- Report the second Escape through `onRequestKill` from the single shell keyboard listener, allowing the runtime owner to terminate the generation without a competing listener or second back transition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected quoted attribute matching in the committed DOM harness**

- **Found during:** Task 2 shell contract verification
- **Issue:** The Task 1 mock selector engine split every space as a descendant combinator, including spaces inside quoted attribute values. Its own `[aria-label="Turn off Skopeo"]` assertion could therefore never match any valid element.
- **Fix:** Added a small descendant-selector tokenizer that respects quotes, attribute brackets, and parentheses.
- **Files modified:** `tests/skopeo-shell-contract.test.js`
- **Verification:** The intended close-control pointer assertion executes and the complete production shell and accessibility suites pass.
- **Committed in:** `a4c137e9`

---

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** The correction made an existing blocking assertion executable without changing shell behavior, product scope, or public APIs.

## Issues Encountered

None after the harness correction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can wrap the shell in the explicit-only content runtime, use its prepared token after generation commit, and route its close/kill callbacks through abort-first teardown.
- Plan 04 retains command registration and dynamic content injection; the shell is intentionally absent from static and automation bundles.
- Plan 06 can reuse the resource, hostile-text, host-integrity, focus, and preference contracts as blocking release evidence.

## Self-Check: PASSED

- Confirmed all four implementation/test files and this summary exist.
- Confirmed task commits `30df2edb`, `a4c137e9`, and `de5e7d75` exist in git history.
- Re-ran all Plan 02 contracts and both overlay regressions successfully after the implementation commits.
- Confirmed syntax, whitespace, static-bundle isolation, and absence of accidental tracked-file deletion.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-14*
