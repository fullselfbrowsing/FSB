---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 07
subsystem: chrome-extension-hud
tags: [skopeo, shadow-dom, chrome, accessibility, collision-safety, resource-ledger]

requires:
  - phase: 52-02
    provides: One Shadow shell, six primitives, four attention levels, and the eleven-category resource ledger
  - phase: 52-03
    provides: Explicit runtime, Escape ladder, abort-first teardown, and focus restoration contracts
  - phase: 52-06
    provides: Automated verification ledger with live Chrome/Drive/Docs/VoiceOver UAT explicitly deferred
provides:
  - Browser-computed fixed/inset-zero/maximum-z/pointer-transparent host boundary in popover and fallback paths
  - Browser-faithful deep Shadow focus, Gate boundary-only trapping, and exact one-level restoration
  - Real-rectangle Focused/Gate collision rejection with exact prior-state rollback at normal and narrow widths
  - Attention-owned resource scopes with repeatable eleven-key plateaus and exact-zero repeated teardown
affects: [phase-52-review, phase-52-verification, phase-53-drive-router, milestone-audit]

tech-stack:
  added: []
  patterns: [zero-dependency local Chrome contract, staged measure-before-commit, attention-owned resource scopes, deep Shadow active element]

key-files:
  created:
    - tests/skopeo-browser-contract.test.js
    - .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-07-SUMMARY.md
  modified:
    - extension/content/skopeo-shell.js
    - tests/skopeo-shell-contract.test.js
    - tests/skopeo-accessibility.test.js

key-decisions:
  - "Cascade-critical host geometry is asserted from production getComputedStyle in local Chrome; inline host styles remain only a secondary defense."
  - "Focused and Interstitial nodes are built invisibly, measured under production Shadow CSS, and committed only after viewport and required-host-control clearance passes."
  - "Detached preceding attention surfaces retain their nodes and handles as one scope for exact one-level back; permanent replacement and destroy release those scopes once in reverse order."
  - "The halo remains a static visual primitive; its untracked CSS animation and keyframes were removed so the animations ledger remains truthful at zero."

patterns-established:
  - "Atomic richer transition: build hidden shell-owned nodes -> measure real rectangle -> resolve required host control -> reject with exact rollback or suspend-and-commit."
  - "Surface scope ownership: every render-owned listener, pointer surface, and focus hook lives and dies with its attention scope; only stable shell listeners and live-region cadence remain session-owned."

requirements-completed: [HUD-03, HUD-04, HUD-05, HUD-07, HUD-08]
verification-status: automated-pass-live-uat-deferred
live-approval: false

duration: 24 min
completed: 2026-07-15
---

# Phase 52 Plan 07: Browser-Faithful HUD Boundary and Atomic Surface Summary

**Real Chrome now proves the Skopeo host boundary, Shadow focus, and normal/narrow collision rollback, while scoped attention resources plateau across repeated grammar cycles and destroy to exact zero.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-15T10:26:04Z
- **Completed:** 2026-07-15T10:50:08Z
- **Tasks:** 3
- **Files modified:** 4 implementation/test files plus this summary and phase tracking

## Accomplishments

- Replaced the vulnerable one-line `:host` reset with cascade-critical `!important` geometry and proved the production computed result in supported-popover and forced-fallback Chrome paths.
- Corrected the shared DOM oracle and production shell for Shadow retargeting: `document.activeElement` is the host, `shadowRoot.activeElement` is the exact managed child, and focus success requires that exact postcondition.
- Restricted Gate trapping to the two boundaries: ordinary forward Tab from the first and middle actions remains unconsumed, while last-to-first and Shift+first-to-last wrap once.
- Added hidden stage/measure/commit mechanics for Focused and Interstitial surfaces. An intersection with the required page control at 8px clearance rejects synchronously, restores all eleven resource counts, preserves prior node identities/attention/primitives/deep focus, and announces exact unsafe-view copy.
- Replaced session-wide render-handle accumulation with active/suspended attention scopes. Two full Ambient -> Anchored -> Focused -> Interstitial -> Focused -> Anchored -> Ambient cycles return to the first per-state resource snapshots and exact-zero repeated destroy.

## Task Commits

Each task outcome was committed atomically after its browser-faithful red control failed and the corrected implementation passed:

1. **Task 1: Pin browser-computed host geometry, then repair the cascade**
   - `45fce619` — `fix(52-07): enforce browser-computed host boundary`
2. **Task 2: Model Shadow focus retargeting and fix Gate traversal/restoration**
   - `14532263` — `fix(52-07): honor Shadow focus retargeting`
3. **Task 3: Make richer transitions atomic and release attention-owned handles**
   - `9e77fc33` — `fix(52-07): make richer HUD transitions atomic`

**Plan metadata:** recorded in the final documentation commit.

## Browser-Computed Evidence

The standalone CommonJS runner used only Node built-ins and `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. It created a local fixture and isolated temporary profile, loaded the production classic script directly, parsed one escaped JSON result node, and removed its temporary files in `finally`.

Both supported and forced-fallback hosts computed exactly:

| Property | Supported popover | Forced fallback |
|----------|-------------------|-----------------|
| `position` | `fixed` | `fixed` |
| `top/right/bottom/left` | `0px / 0px / 0px / 0px` | `0px / 0px / 0px / 0px` |
| `pointer-events` | `none` | `none` |
| `z-index` | `2147483647` | `2147483647` |
| `popoverTopLayer` | `0 -> 1 -> 0` | `0 -> 0 -> 0` |

The source-level negative control also removes important `position` and `pointer-events` declarations while leaving defensive inline assignments present; the contract rejects that weakened source.

## Real Shadow Focus Results

- Focused entry: document active element was the Skopeo host; Shadow active element was `Focused Skopeo demo`.
- Gate entry: document active element remained the host; Shadow active element was `Return to focused demo`.
- Forward Tab from first/middle Gate actions was not prevented. Forward Tab from the last action wrapped once to the safe action; Shift+Tab from the safe action wrapped once to the last action.
- Gate back restored the exact `Open consequence preview` trigger. Focused back restored the exact `Open anchor mark demo` trigger.
- A deliberately nonthrowing no-op `focus()` failed the postcondition and selected the declared preceding-surface fallback without ever forcing `body` focus.

## Safe/Unsafe Rectangle Matrix

All candidates below are production `getBoundingClientRect()` results. Each safe attempt committed; moving the ordinary required host button into the same rectangle made the corresponding attempt return `false` with exact rollback and `Skopeo can’t open this view without covering the current page control.`

| Chrome context | Viewport | Focused candidate | Gate candidate | Safe | Collision |
|----------------|----------|-------------------|----------------|------|-----------|
| Normal top-level | `1024 x 681` | `x=352, y=64, 320 x 212` | `x=332, y=64, 360 x 192` | committed | rejected + exact Anchored/Focused rollback |
| Narrow iframe | `420 x 700` | `x=16, y=64, 388 x 258` | `x=16, y=64, 388 x 278` | committed | rejected + exact Anchored/Focused rollback |

The narrow fixture is below the `480` CSS-pixel breakpoint and therefore exercises the real left/right inset reflow rather than a mocked width.

## Per-State Resource Plateaus

These complete eleven-key snapshots were identical on the first and second stable visit to each state. Focused and Interstitial include the intentionally suspended preceding scopes required for identity-preserving one-level back.

| State | roots | listeners | observers | timeouts | intervals | animationFrames | animations | focusHooks | pointerSurfaces | pendingRenders | popoverTopLayer |
|-------|------:|----------:|----------:|---------:|----------:|----------------:|-----------:|-----------:|----------------:|---------------:|----------------:|
| Ambient | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| Anchored | 1 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 1 |
| Focused | 1 | 8 | 0 | 0 | 0 | 0 | 0 | 1 | 8 | 0 | 1 |
| Interstitial | 1 | 11 | 0 | 0 | 0 | 0 | 0 | 2 | 11 | 0 | 1 |
| Destroy / repeated destroy | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Ambient after cycles 1 and 2 deep-equaled the initial Ambient snapshot. Rejected Focused/Gate staging returned to the exact preceding resource snapshot. The prior `3/1 -> 13/13 -> 17/17` listener/pointer growth is gone, and no hidden-state handle remains after rollback.

## Automated Verification

The exact Plan 07 chain passed:

```text
node tests/helpers/skopeo-resource-ledger.js --self-test
node tests/skopeo-shell-contract.test.js
node tests/skopeo-accessibility.test.js
node tests/skopeo-browser-contract.test.js
node tests/overlay-stability-cadence.test.js
node tests/overlay-content-audit.test.js
```

Additional syntax checks passed for the production shell and all three modified tests. The forbidden automation-framework scan found no Puppeteer, Playwright, Selenium, or WebDriver use, and the exact halo-animation scan returned no match.

## Files Created/Modified

- `extension/content/skopeo-shell.js` — Adds important host CSS, deep focus semantics, staged collision gates, attention surface scopes, reverse scoped disposal, and static halo rendering.
- `tests/skopeo-shell-contract.test.js` — Adds cascade negative control, browser-shaped candidate geometry, exact rollback snapshots, normal/narrow collisions, two-cycle plateaus, and repeated-zero teardown.
- `tests/skopeo-accessibility.test.js` — Adds browser-retargeted focus/traversal/postcondition coverage and asserts the halo has no untracked CSS animation.
- `tests/skopeo-browser-contract.test.js` — Runs production host/focus/collision mechanics in local Chrome at normal and 420px iframe widths without a package, server, network call, or automation framework.
- `.planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-07-SUMMARY.md` — Records the browser and resource evidence without converting deferred live UAT into approval.

## Deviations from Plan

None. The requested UI UAT remained skipped/deferred; Plan 07 executed only its automated shell and local-Chrome mechanics gates.

## Issues Encountered

- Chrome 150 on macOS emitted the required `--dump-dom` result but did not reliably exit. The runner treats only an `ETIMEDOUT` carrying a valid dumped DOM as usable output, kills that isolated process, and still deletes the profile in `finally`; any missing/invalid DOM remains a hard failure.
- Headless Chrome enforces a minimum top-level window width above the 480px product breakpoint. A real same-origin `420 x 700` iframe browsing context was used for the narrow mechanics case, so CSS media queries and rectangle measurement still ran in Chrome at an actual 420 CSS-pixel viewport.

## User Setup Required

None. The test discovers existing local Chrome from `CHROME_BIN` or documented macOS/Linux paths and introduces no dependency or service.

## Next Phase Readiness

- Phase 52 is now 7/8 plans complete. Plan 52-08 remains next for monotonic tab authority, exact combined runtime cleanup certificates, and final automated gate registration.
- No Graphify runtime, server, daemon, AI provider, MCP surface, Drive/Docs recognition, semantic anchor, or later-phase functionality was added.
- `52-UAT.md` remains `status: partial`: L01-L15, Drive/Docs coexistence, VoiceOver, shortcut assignment, MV3 sleep/wake, and live eleven-category teardown evidence are still user-deferred and **not live-approved**.

## Self-Check: PASSED — Automated Gap Closure Only

- Task commits `45fce619`, `14532263`, and `9e77fc33` exist in history.
- Production Chrome computed styles, true Shadow active-element relations, normal/narrow real rectangles, exact collision rollback, resource plateaus, and repeated-zero teardown all passed.
- The full prescribed Plan 07 automated chain passed and the browser gate executed rather than skipped.
- Phase-local accounting after this summary is exactly 7/8, excluding Phase 999.1.
- No live Drive/Docs/VoiceOver claim was made; live UAT remains deferred.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-15 with live UAT deferred*
