---
phase: 63-native-messaging-host
plan: "09"
subsystem: extension-delegation-ui
tags: [native-messaging, delegation, sidepanel, accessibility, intent-fence, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Background-owned offline wake, safe attempt/intent checking events, and unchanged preflight convergence from Plan 08
  - phase: 61-delegation-ux-sw-eviction-persistence
    provides: One delegation state card, one polite announcer, exact consent/offline/unpaired states, and token-backed responsive styling
provides:
  - Intent-scoped checking presentation in the existing delegation card with exact fixed copy and one polite announcement
  - Byte-exact composer and monotonic edit-revision fences across preflight and consent continuation
  - Info-token spinner styling with narrow, forced-colors, and reduced-motion behavior
affects: [63-10, delegation-offline-ux, sidepanel-accessibility, native-wake-verification]

tech-stack:
  added: []
  patterns:
    - Correlate transient runtime presentation to one safe explicit-Send intent and reject every late, duplicate, or foreign event
    - Preserve mutable user input with both byte equality and a monotonic edit revision rather than text equality alone
    - Treat native success as reachability only and converge through the pre-existing preflight, consent, start, unpaired, and offline branches

key-files:
  created: []
  modified:
    - extension/ui/sidepanel.js
    - extension/ui/sidepanel.css
    - tests/delegation-sidepanel-ui.test.js

key-decisions:
  - "A Send intent retains its safe id, trimmed task, exact raw composer bytes, and edit revision through preflight and consent lookup; any input event clears it immediately, and every stale settlement becomes a no-op."
  - "The checking event may change only the existing delegation card, header, busy flag, and existing announcer; it creates no action, alert, focus move, feed row, message, session, challenge, tab, or native authority."
  - "Ready, unpaired, offline, runtime-unavailable, and malformed outcomes re-enter only the existing consent/start or preflight-failure renderers, so native reachability never creates a success state of its own."

requirements-completed: [NATIVE-02]

duration: 17 min
completed: 2026-07-18
---

# Phase 63 Plan 09: Intent-Fenced Native Wake Checking UI Summary

**An offline delegated Send now shows one truthful, intent-scoped checking state while exact composer bytes, edits, accessibility semantics, and existing consent/offline authority remain fenced.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-18T13:55:17Z
- **Completed:** 2026-07-18T14:12:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a safe browser-local Send intent id and captured the trimmed task, byte-exact `textContent`, and a monotonic composer edit revision before preflight.
- Accepted only the exact `{type, attemptId, intentId}` checking event for the current pending intent, rendering the approved heading/body/spinner in the one existing info-tone state card and announcing it once through the existing polite live region.
- Kept the composer editable and byte-identical while checking, gated duplicate Send, and made every input event permanently invalidate the pending continuation even when the original bytes are restored.
- Extended the same stale-intent fence through the asynchronous consent lookup so edited input cannot enter trusted start or render stale consent.
- Converged ready, unpaired, offline, runtime-unavailable, and malformed results through the Phase 61 branches without a success toast, native detail, new action, new card, or new live region.
- Added token-backed spinner motion, 350 px wrapping, forced-colors cues, and complete reduced-motion suppression.

## Task Commits

Both behavior tasks preserve separate RED and GREEN evidence:

1. **Task 63-09-01 RED: Attempt-scoped checking and edit-fence contract** — `36265d24` (test)
2. **Task 63-09-01 GREEN: Intent/revision continuation fence and checking renderer** — `f4b91360` (feat)
3. **Task 63-09-02 RED: Convergence, authority, responsive, and accessibility contract** — `f18bf5c2` (test)
4. **Task 63-09-02 GREEN: Info spinner and adaptive accessibility styling** — `2e684ac0` (feat)

## Files Created/Modified

- `extension/ui/sidepanel.js` — Generates and tracks safe Send intents, snapshots raw bytes/revisions, filters exact checking events, renders the existing checking card, and fences preflight/consent settlement.
- `extension/ui/sidepanel.css` — Adds the info-token spinner, narrow wrapping, forced-colors treatment, and reduced-motion overrides.
- `tests/delegation-sidepanel-ui.test.js` — Exercises exact copy/DOM/focus/mutation behavior, event races, edit and edit-revert invalidation, consent continuation, convergence tables, native-authority sentinels, and adaptive CSS pins.

## Decisions Made

- Kept the intent fence alive through consent lookup as a distinct continuation phase. This prevents an edit after a ready preflight but before a trusted consent response from starting captured text.
- Cleared a checking presentation back to the existing ready card as soon as its intent is edited. The old asynchronous response retains no ability to clear or advance a newer explicit Send.
- Reused the existing transition-deduplication map for the one checking announcement, keyed by intent id, instead of adding another announcer or persisted delivery ledger.
- Used fixed UI copy only. The side panel consumes attempt and intent identities but never parses or displays native reason, path, platform, registry, manifest, binary, secret, or task-response detail.

## TDD Evidence

- **Task 1 RED:** the focused side-panel suite stopped at the first missing approved checking-copy assertion.
- **Task 1 GREEN:** the focused suite passed exact event-shape, one-card/one-spinner/one-announcement, no-action/no-alert/no-focus, byte preservation, duplicate/late/wrong-intent fences, edit-revert invalidation, and raw-mismatch settlement checks.
- **Task 2 RED:** the complete side-panel suite stopped at the first missing checking-specific info-token CSS contract.
- **Task 2 GREEN:** the side-panel suite passed the ready/trusted, ready/consent, unpaired, offline, runtime-unavailable, and malformed convergence table plus narrow, forced-colors, and reduced-motion pins; the background wake suite remained 111/111 green.

## Security and Privacy

- T63-09 remains closed: the checking DOM contains only approved fixed text and one decorative spinner; it never renders native response detail or receives a URL/HTML/style sink.
- T63-11 is mitigated by a safe intent id, exact pending identity, byte equality, monotonic edit revision, immediate edit invalidation, and local-closure checks that cannot clear or advance a newer intent.
- T63-12 is mitigated across both preflight and consent settlement. Only an unchanged current intent reaches existing consent/trusted start, while every failure reuses the existing offline/unpaired authority and actions.
- The side panel contains no native API, host name, process, shell, platform, filesystem, manifest, registry, binary, or wake authority.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- The focused VM harness needed an event-loop turn rather than a single microtask flush before observing the async foreign-owner check and preflight dispatch. The test now uses `setImmediate` at that deterministic boundary.
- The shared worktree retained extensive unrelated planning deletions plus unrelated generated/build modifications. Every plan commit used exact-path staging and left those user-owned changes untouched.
- No live Chrome, forced-colors, reduced-motion, screen-reader, zoom, native-host, or paired/unpaired daemon UAT was run.

## Known Pending Evidence

- Actual narrow layout, light/dark theme rendering, 200% zoom, keyboard focus order, polite announcement phrasing, forced-colors, and reduced-motion behavior in Chrome remain `human_needed`.
- Real service-worker/panel restoration timing and live paired/unpaired wake convergence remain pending the milestone-end UAT sweep.

## User Setup Required

None during autonomous implementation.

## Verification

- `node tests/delegation-sidepanel-ui.test.js --section native-wake-checking` — PASS.
- `node tests/delegation-sidepanel-ui.test.js` — PASS.
- `node tests/native-host-background-wake.test.js` — PASS: 111 assertions.
- `node --check extension/ui/sidepanel.js` — PASS.
- `extension/ui/sidepanel.html` is unchanged from the pre-plan commit.
- Key-link scans find the exact `FSB_NATIVE_WAKE_CHECKING` gate and continued use of `_renderDelegationPreflightFailure`.
- `git diff 36265d24^..2e684ac0 --check` — clean.

## Next Phase Readiness

- Plan 63-10 can wire the focused/root/CI contract around the now-complete background wake and intent-fenced side-panel presentation.
- The UI remains a presentation-only consumer, so the next verification wave can pin native authority to the existing background helper without UI exceptions.
- All genuine browser/native/accessibility evidence remains pending for the single milestone-end sweep; no live pass was inferred here.

## Self-Check: PASSED

- Four task-level RED/GREEN commits are present.
- All three planned source/test files exist and are committed; `sidepanel.html` remains unchanged.
- The focused and convergence suites, syntax check, source-authority scans, key-link scan, and whitespace check pass.
