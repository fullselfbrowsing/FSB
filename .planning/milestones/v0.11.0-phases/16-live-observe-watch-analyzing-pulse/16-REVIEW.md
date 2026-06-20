---
phase: 16-live-observe-watch-analyzing-pulse
reviewed: 2026-06-16T16:52:14Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - extension/content/trigger-observe.js
  - tests/trigger-observe.test.js
  - extension/content/visual-feedback.js
  - extension/utils/overlay-state.js
  - tests/trigger-observe-pulse.test.js
  - tests/test-overlay-state.js
  - extension/content/messaging.js
  - extension/background.js
  - extension/utils/trigger-lifecycle.js
  - tests/trigger-lifecycle.test.js
  - tests/trigger-store.test.js
  - tests/value-extractor.test.js
  - tests/trigger-manager.test.js
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: resolved
resolution: stale-marker re-arm warning fixed in commit 87403c77 with regression coverage
---

# Phase 16: Code Review Report

**Reviewed:** 2026-06-16
**Depth:** standard
**Files Reviewed:** 13
**Status:** resolved

## Resolution

One actionable warning was found and fixed during the review gate:

- **WR-01** -- `trigger-observe.start()` treated `leaf.dataset.fsbTriggerArmed === triggerId` as proof that a live observer already existed. That DOM marker can survive into a fresh content-script context where the in-memory registry is empty, causing SW re-arm/watchdog starts to return `{ ok:true, already:true }` without installing a `MutationObserver`. Commit `87403c77` removed the stale-marker early return and added `tests/trigger-observe.test.js` coverage for fresh-context re-arm with a retained marker.

No unresolved findings remain.

## Summary

Reviewed the Phase 16 live-observe path end to end:

- Content observer: single-element `MutationObserver`, value report shape, debounce, BF-cache/pagehide handling, stale selector re-query, and registry cleanup.
- Pulse UI: `ActionGlowOverlay.showPulse()/clearPulse()`, reduced-motion behavior, overlay-state mode passthrough, and action-glow ownership gate.
- Message routing: `triggerObserveStart/Stop`, `triggerRead`, `triggerPulseStart/Stop`.
- Service worker glue: content script registration order, value-report ingress, owned-tab re-arm, watchdog alarm dispatch, lifecycle seam delegation, attribute preservation, and test-only arm helper.

The important invariants held after the fix: background value reports do not write `status:'fired'`; firing remains owned by `FsbTriggerLifecycle.handleTriggerAlarm`; `trigger-observe.js` loads before `messaging.js`; the watchdog uses a separate `fsbTriggerObserveWatchdog:<id>` alarm name; and the trigger pulse reuses the existing action glow overlay without nesting a second overlay surface.

## Warnings

### WR-01: Stale DOM armed marker can block fresh-context re-arm without installing an observer

**File:** `extension/content/trigger-observe.js`
**Severity:** warning
**Status:** resolved in `87403c77`

**Issue:**
`start()` disconnected any existing registry entry, resolved the leaf, then returned `{ ok:true, already:true }` when `leaf.dataset.fsbTriggerArmed` already matched the trigger id. The DOM marker is not a reliable source of truth for an active observer because it can survive page/context transitions where the in-memory `registry` is empty. In that state, the service worker or watchdog can believe re-arm succeeded while no `MutationObserver` is actually registered.

**Fix:**
Removed the stale-marker early return. The in-memory `registry` is now the authority for idempotent restarts; the DOM marker remains cleanup metadata only. Added a regression proving a fresh context with `dataset.fsbTriggerArmed` still installs a new observer.

**Verification:**
`node tests/trigger-observe.test.js` now includes `stale armed dataset marker does not block a fresh observer start` and passes with 10 assertions.

## Verification

- `node --check extension/content/trigger-observe.js`
- `node --check tests/trigger-observe.test.js`
- `node tests/trigger-observe.test.js`
- `node tests/trigger-lifecycle.test.js`
- `node tests/trigger-store.test.js`
- `node tests/value-extractor.test.js`
- `node tests/trigger-manager.test.js`
- `node tests/trigger-cap.test.js`
- `node tests/trigger-observe-pulse.test.js`

## Residual Risk

Live Chrome MV3 behavior for BF-cache, service-worker eviction, and full page reload still needs the milestone-end manual/browser UAT already tracked in the validation artifacts. The Node harness covers the deterministic contracts but does not prove browser lifecycle timing.
