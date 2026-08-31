---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 05
subsystem: extension-ui
tags: [chrome-extension, side-panel, accessibility, explicit-tab, vm-dom, stale-response]

requires:
  - phase: 52-04
    provides: Explicit positive-tab Skopeo message protocol, persisted MV3 controller, and status broadcasts
provides:
  - Accessible Skopeo-for-this-tab switch pinned directly below the existing side-panel header
  - Exact local-only Off, Starting, Active, Unsupported, Error, and unsafe-layout copy with honest shortcut metadata
  - Captured-tab side-panel controller with pre/post-await guards, neutral tab-switch reset, and stale-event rejection
  - Real VM/DOM regression coverage for focus, accessibility state, text-only rendering, shortcuts, and wrong-tab races
affects: [52-06-release-evidence, side-panel, Skopeo-invocation, accessibility]

tech-stack:
  added: []
  patterns: [bounded classic-script VM hook, captured explicit-tab async guard, local enumerated UI copy, atomic live-copy coalescing]

key-files:
  created: []
  modified:
    - extension/ui/sidepanel.html
    - extension/ui/sidepanel.css
    - extension/ui/sidepanel.js
    - tests/skopeo-sidepanel-command.test.js

key-decisions:
  - "The side-panel row is the sole Off affordance and remains structurally between the existing header and chat area; it never creates or controls a dormant page launcher."
  - "Every Skopeo refresh or toggle captures the authoritative side-panel tab snapshot once, sends that positive id explicitly, and rejects a changed snapshot or mismatched positive response tab before any DOM write."
  - "All state and failure copy is selected from local enumerations and written only through textContent; background-provided message text is never displayed as markup or trusted copy."
  - "Active replaces shortcut metadata with non-actionable Esc-Esc kill guidance; Off, Starting, Unsupported, and Error retain honest Chrome-reported shortcut action semantics."

patterns-established:
  - "Neutral-before-await tab switch: assign the incoming tab id, synchronously clear the outgoing row to a disabled loading snapshot, then start independent guarded status and shortcut refreshes."
  - "Side-panel test seam: execute the bounded FSB_SKOPEO_SIDEPANEL_CONTROLLER region with real controller functions against DOM and Chrome mocks rather than relying on source-presence checks."
  - "Live-region idempotence: attribute and text helpers write only changed values, so equivalent selected-tab status events do not repeat atomic live copy."

requirements-completed: [HUD-01, HUD-02, HUD-04, HUD-05]

duration: 20min
completed: 2026-07-14
---

# Phase 52 Plan 05: Accessible Tab-Aware Side-Panel Control Summary

**A dedicated accessible Skopeo row now controls and reports only the selected tab, remains cancellable through startup, reflects Chrome's actual shortcut assignment, and rejects every tested stale success, event, and rejection race.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-14T21:19:15Z
- **Completed:** 2026-07-14T21:39:15Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added one responsive, theme-aware `role="switch"` row immediately below `.sidepanel-header`, with exact geometry, visible focus, forced-color, reduced-motion, narrow-width, and initial silent-Off semantics.
- Added the bounded `FSBSkopeoSidepanelController` production surface with explicit captured-tab status/toggle requests, local enumerated copy, cancellable Starting and Active states, actual/remapped/unassigned command hints, and deliberate shortcut-settings navigation.
- Integrated tab activation by making the incoming id authoritative before existing asynchronous owner-chip and conversation work, clearing outgoing presentation synchronously, and preserving all unrelated chat/history/running-state behavior.
- Exercised the real renderer and handlers in a VM/DOM harness, including out-of-order Tab A/Tab B successes, late Tab A status events, late Tab A rejection, response-tab mismatch, focus retention, live-copy coalescing, and the next toggle's exact Tab B payload.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin and implement the accessible side-panel row and switch contract** - `b19a249b` (feat)
2. **Task 2: Pin and implement explicit-tab state, toggle, status-event, and shortcut handling** - `91d8ade3` (feat)
3. **Task 3: Add behavioral side-panel DOM, focus, copy, and stale-tab race coverage** - `672f9453` (test)

**Plan metadata:** recorded in the final documentation commit.

## Files Created/Modified

- `extension/ui/sidepanel.html` - Adds the single semantic Skopeo row, exact declared IDs, atomic status ownership, switch name/state/descriptions, and initial Off copy.
- `extension/ui/sidepanel.css` - Adds bounded row/switch geometry, semantic state hooks, focus and theme treatment, narrow/forced-color/reduced-motion behavior, and honest disabled Active-hint affordance.
- `extension/ui/sidepanel.js` - Adds the extractable controller, exact state renderer, explicit-tab refresh/toggle guards, command lookup, status-event handler, and boot/tab-activation integration.
- `tests/skopeo-sidepanel-command.test.js` - Extends Plan 04 coverage with executable HTML/CSS assertions and a real VM/DOM side-panel controller/race harness.

## DOM and State Interface

The row uses exactly one owner and the seven planned IDs:

```text
skopeoControl      atomic row and data-state owner
skopeoTitle        visible Skopeo title
skopeoToggle       native button with role=switch
skopeoStatus       visible exact state heading
skopeoStatusBody   optional exact explanation
skopeoAction       state-appropriate action copy
skopeoHint         Chrome shortcut action or non-actionable Active kill hint
```

The switch is named `Skopeo for this tab`, references status/body/hint through `aria-describedby`, and stays enabled, checked, busy, and focused during Starting so the same toggle cancels startup. Active stays checked and immediately toggles off. Unsupported is unchecked and disabled with no active/retry presentation. Error and unsafe-layout are unchecked and retryable. Initial and terminal Off are unchecked, enabled, non-busy, and use `aria-live="off"`; Starting, Active, Unsupported, and Error use the same atomic row with polite live behavior.

## Exact Copy and Shortcut Evidence

The real renderer is invoked for and asserts these local strings:

| State | Status | Body | Action / hint |
|-------|--------|------|---------------|
| Off | `Off for this tab` | none | `Turn on Skopeo` plus actual shortcut metadata |
| Starting | `Starting on this tab…` | none | `Turn off Skopeo`; switch remains cancellable |
| Active | `On · Ambient` | none | `Turn off Skopeo`; `Esc Esc: turn off Skopeo in this tab` |
| Unsupported | `Skopeo can’t run on this page.` | `Open a standard web page, then try again.` | no active action |
| Error | `Skopeo didn’t start.` | `Nothing was added to the page. Try again.` | `Try again` |
| Unsafe layout | `Skopeo can’t open safely on this layout.` | `Zoom out or resize the page, then try again.` | `Try again` |

`chrome.commands.getAll()` is filtered only for `toggle-skopeo-current-tab`. `Alt+Space` displays `Shortcut: ⌥ Space · Change shortcut`, the fallback displays `Shortcut: Ctrl Shift Space · Change shortcut`, arbitrary remaps are normalized from Chrome's returned chord, and an empty assignment displays `Shortcut not assigned · Set in Chrome shortcuts`. The shortcuts page opens only from a deliberate enabled hint click. Active kill guidance is disabled, removed from tab order, given matching accessible text, guarded against programmatic click, and styled without a link cursor.

## Captured-Tab and Race Evidence

`refreshSkopeoControl`, `handleSkopeoToggle`, and `refreshSkopeoShortcut` capture `_activeTabIdSnapshot` once, require a positive exact id before dispatch, include it in the Plan 04 message, recheck it after every await, and reject any positive response `tabId` that differs. They never query the active tab themselves.

The controlled integration race proves:

1. Tab A starts a pending status request.
2. Tab B becomes authoritative before any await, and the row immediately becomes a neutral disabled loading snapshot.
3. Tab B resolves Active and owns the visible row.
4. A later Tab A Active response and Tab A error event perform zero DOM text writes.
5. The next toggle payload is exactly `{action:'skopeo:toggle-tab',tabId:22}`.
6. In a second run, a rejected Tab A request after Tab B Active returns silently and cannot paint Tab B Error.

Switch focus survives Starting, Active, cancellation, and terminal Off responses. Tab activation never calls focus; an unrelated side-panel input remains focused in the second race. Existing chat draft text, chat messages, contenteditable state, send-button state, owner chip, conversation swap, and per-tab running-state behavior remain unchanged.

## Accessibility and Preference Checks

- Native 44x40 switch target, 40x24 track, 16px thumb with 4px inset, and 2px orange `:focus-visible` outline with 2px offset.
- Initial Off is atomic but silent; meaningful states are polite, and equivalent status events are coalesced by changed-value-only text/attribute helpers.
- All variable display copy uses `textContent`; hostile background `message` strings cannot create markup or replace locally enumerated error text.
- Forced colors use `Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, and `Highlight`; reduced motion sets row transitions to 0ms.
- Narrow layout remains within 16px gutters without horizontal overflow, and only the approved Phase 52 type sizes/weights are used.

## Decisions Made

- Reused the existing boot-time `_activeTabIdSnapshot` instead of adding another active-tab query. This gives Skopeo the same selected-tab authority as existing conversation state without an async retargeting window.
- Exported only a frozen bounded controller integration surface. Production listeners and tests call the same functions, so the race proof cannot drift into a source-only oracle.
- Kept state text entirely local. Worker status/code selects an enumerated view; worker message text is ignored at the UI trust boundary.
- Made the Active kill hint non-actionable rather than leaving a shortcut-settings button whose visible and accessible meanings diverged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed shortcut action semantics from Active kill guidance**

- **Found during:** Task 3 (behavioral DOM and authority review)
- **Issue:** Replacing shortcut text with the exact Active `Esc Esc` hint left the same node as an enabled, focusable shortcut-settings button with an unrelated accessible label and pointer cursor.
- **Fix:** Disabled and removed the hint from tab order during Active, changed its accessible label to the exact kill guidance, rejected Active clicks in the handler, restored shortcut semantics outside Active, and added a disabled no-link cursor rule.
- **Files modified:** `extension/ui/sidepanel.css`, `extension/ui/sidepanel.js`, `tests/skopeo-sidepanel-command.test.js`
- **Verification:** Real DOM assertions prove Active click creates no tab and Off/Error restore the enabled shortcut action; the static CSS assertion pins the disabled cursor.
- **Committed in:** `672f9453`

---

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** The fix aligns the same planned hint node with its visible and accessible meaning; it adds no new surface or workflow.

## Issues Encountered

- Phase-local progress must ignore the two completed Phase 999.1 backlog summaries. Tracking was reconciled against the six `52-*-PLAN.md` files and five Phase 52 summaries only, yielding the required 5/6 (83%) rather than using a repository-wide summary count.

## Test Results

- Required red-first static contract failed on the absent row before production markup/styles were added; the green production run then passed.
- Required red-first controller self-test failed on the absent bounded side-panel controller marker before `sidepanel.js` implementation; self-test and production modes now pass.
- `node tests/skopeo-sidepanel-command.test.js` - PASS; static markup/CSS, real side-panel VM/DOM, Plan 04 background controller, failures, probes, navigation, and reinjection all green.
- `node tests/sidepanel-tab-aware-smoke.test.js` - PASS; 42 PASS / 0 FAIL.
- `node tests/skopeo-accessibility.test.js` - PASS.
- `git diff --check` and JavaScript syntax checks - PASS.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for `52-06-PLAN.md`, which owns the full automated regression evidence and blocking live Chrome Drive/Docs, command-remap, VoiceOver, zoom, preference, and zero-residue UAT.
- No implementation blocker remains. Real Chrome shortcut collision/remapping and live assistive-technology behavior remain deliberately assigned to Plan 06 rather than inferred from Node mocks.

## Self-Check: PASSED

- All four planned implementation/test files and this summary exist.
- Task commits `b19a249b`, `91d8ade3`, and `672f9453` are present in history.
- Every task acceptance criterion and the plan-level command/accessibility regression chain pass.
- Phase-local tracking is exactly 5/6 summaries (83%); `52-06-PLAN.md` remains open and Phase 999.1 has no diff.
- Worktree is clean after the documentation commit.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-14*
