---
phase: 58-providers-panel
plan: "02"
subsystem: ui
tags: [chrome-mv3, vanilla-js, provider-selection, accessibility, settings-migration]

requires:
  - phase: 58-providers-panel
    provides: Closed provider domains, normalization, and advisory recommendation contract from Plan 01
provides:
  - Canonical Providers route with ten accessible API and agent radio rows
  - Kind-aware in-form selection that preserves inactive API and agent settings
  - Fail-closed load, save, discard, and legacy migration through the existing Save boundary
  - Permanent static and VM regression coverage in the root test suite
affects: [58-03, providers-panel, options-page, provider-evidence]

tech-stack:
  added: []
  patterns: [hidden compatibility select, delegated native-radio events, VM handcrafted-DOM regression harness]

key-files:
  created:
    - tests/providers-panel-ui.test.js
  modified:
    - extension/ui/control_panel.html
    - extension/ui/options.css
    - extension/ui/options.js
    - tests/providers-panel-logic.test.js
    - tests/lattice-provider-bridge-smoke.test.js
    - package.json

key-decisions:
  - "Keep the hidden seven-value modelProvider select as the API-only compatibility source while the visible roster mirrors in-form intent."
  - "Stage the saved API model locally when agent kind is active so no discovery or connection work is needed to preserve inactive BYOK state."
  - "Treat recommendation as independent page state; selection rendering never reads or applies it."

patterns-established:
  - "Kind isolation: agent selection changes only providerKind and agentProviderId; API selection alone runs model/key paths."
  - "Save-boundary persistence: radio changes dirty the existing form, and only Save writes provider intent."

requirements-completed: []

duration: 32 min
completed: 2026-07-12
---

# Phase 58 Plan 02: Providers Chooser and Kind-Aware Settings Summary

**Accessible Providers routing and roster with explicit API/agent intent, fail-closed migration, and BYOK-preserving Save/Discard behavior**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-12T20:50:53Z
- **Completed:** 2026-07-12T21:22:50Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced the visible API Configuration route with a canonical Providers section while normalizing legacy `#api-config` bookmarks to `#providers`.
- Added ten native radio rows in fixed Agent CLI then API order, with accessible selection, responsive token-based styling, separate recommendation/status slots, and distinct API/agent detail containers.
- Kept `modelProvider` closed to the original seven API ids and stored agent intent separately through validated load, save, discard, and legacy migration paths.
- Preserved latent models, keys, endpoints, and agent choice across kind switching; agent selection performs no model discovery, key visibility, or API connection work.
- Added a VM/handcrafted-DOM regression harness for migration, fail-closed inputs, user selection, no-write-before-Save, inactive-field preservation, Save/Discard round trips, and recommendation isolation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the canonical Providers route and accessible static roster** - `a438ef37` (feat)
2. **Task 2: Wire kind-aware selection, migration, load/save/discard, and BYOK preservation** - `b47b7733` (feat)

## Files Created/Modified

- `extension/ui/control_panel.html` - Canonical Providers route, grouped native radios, compatibility select, and stable API/agent detail shells.
- `extension/ui/options.css` - Theme-token roster, badge, detail, responsive, dark-mode, and reduced-motion styles.
- `extension/ui/options.js` - Hash aliasing, kind-aware form state, delegated selection, visibility, migration, persistence, and discard restoration.
- `tests/providers-panel-ui.test.js` - Static markup/CSS/source contracts plus runtime VM/DOM settings tests.
- `tests/providers-panel-logic.test.js` - Updated the root-suite ordering pin to include the new UI contract immediately after provider logic.
- `tests/lattice-provider-bridge-smoke.test.js` - Retained trim and load-order pins while requiring the new API-kind connection guard.
- `package.json` - Permanently runs the provider UI test immediately after the provider logic test.

## Decisions Made

- The visible roster is a projection of in-form state, not a replacement storage domain: API ids continue through `modelProvider`, and agent ids continue through `agentProviderId`.
- A saved model is staged as a hidden option before kind application. This preserves the inactive API model without invoking discovery when an agent is selected and supplies sticky selection when the user returns to API kind.
- `renderProviderSelection()` derives checked and selected state only from form intent. Recommendation changes remain behaviorally inert for Plan 03 evidence refreshes.

## Deviations from Plan

### Auto-fixed Issues

**1. Updated the existing provider-logic root-order pin**
- **Found during:** Task 2 focused verification
- **Issue:** The Plan 01 test required `turn-result.test.js` to immediately follow provider logic, conflicting with Plan 02's requirement to insert `providers-panel-ui.test.js` immediately after provider logic.
- **Fix:** Extended the narrow order assertion to require logic → UI → turn-result, without broadening or dropping any root command.
- **Files modified:** `tests/providers-panel-logic.test.js`
- **Verification:** Provider logic and the complete root suite pass.

---

**Total deviations:** 1 auto-fixed test-pin conflict
**Impact on plan:** Required compatibility maintenance only; no scope expansion or runtime behavior change.

## Issues Encountered

- The pre-existing deletion of `.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md` caused the first raw Task 1 root-suite run to stop at `coverage-report.test.js`. Required full-suite gates temporarily used the identical archived v1.0.0 milestone copy via a symlink; the link and temporary directory were removed after each run, preserving the deletion.

## Verification

- `node tests/providers-panel-ui.test.js` - PASS (static and VM runtime contracts)
- `node tests/providers-panel-logic.test.js` - PASS
- `node tests/agent-sunset-control-panel.test.js` - PASS
- `node tests/model-discovery-ui.test.js` - PASS (79/79)
- `node tests/model-combobox-ui.test.js` - PASS (30/30)
- `node tests/lattice-provider-bridge-smoke.test.js` - PASS (110/110)
- `node tests/universal-provider-lmstudio.test.js` - PASS (13/13)
- Task 1 `npm test` - PASS, exit 0
- Task 2 `npm test` with both Phase 58 provider tests in the root command - PASS, exit 0
- `node --check extension/ui/options.js` and package JSON parse - PASS
- `git diff --check` across plan files - PASS

## Requirement Tracking

- PROV-01 through PROV-04 are exercised by this plan, but all Phase 58 PROV requirements remain Pending until Plan 03 completes evidence rendering and phase-level verification.
- `.planning/REQUIREMENTS.md` was intentionally left unchanged.

## Known Stubs

None. The static evidence/status slots are intentional Plan 02 structure; Plan 03 owns their Phase 57-backed rendering and recommendation refresh behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 58-03 to render Phase 57 evidence, one advisory recommendation, usage/billing detail, manual refresh, and phase-close verification.
- `extension/ai/universal-provider.js` and retired `extension/agents/*` remain untouched, preserving INV-03 and INV-05.

## Self-Check: PASSED

- Summary and all declared deliverables exist on disk.
- Task commits `a438ef37` and `b47b7733` exist in git history.
- Focused and root-suite claims above were rechecked against successful command results.
- The temporary Phase 39 fixture is absent, and unrelated dirty files remain unstaged.

---
*Phase: 58-providers-panel*
*Completed: 2026-07-12*
