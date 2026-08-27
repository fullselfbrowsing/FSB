---
phase: 57-folder-reading-hud
plan: "05"
subsystem: ui-testing
tags: [skopeo, shadow-dom, accessibility, drive, docs, hud, adversarial-evals]

requires:
  - phase: 57-04
    provides: Closed folder/reading view models, exact context admission, and opaque citation dispatch
  - phase: 57-01
    provides: Bounded HUD schema and deterministic folder/reading projector
provides:
  - Accessible 384px Folder and Reading contract rail in the existing Shadow shell
  - Closed blocker and fail-quiet rendering aligned to the three-row authority matrix
  - Thirty-four deterministic structural, security, runtime, and provisional HUD eval cases
  - Sanitized human UAT ledger that keeps domain, live Drive/Docs, and accessibility evidence human-owned
affects: [phase-58-cited-ask, phase-59-action-workflows, live-drive-docs-validation, accessibility]

tech-stack:
  added: []
  patterns:
    - One lifecycle-owned Shadow rail with synchronous state withdrawal before replacement
    - Text-only rendering and opaque per-action citation dispatch
    - Four-dimension eval reporting that separates deterministic, provisional, domain, and live evidence

key-files:
  created:
    - .planning/phases/57-folder-reading-hud/57-05-SUMMARY.md
    - .planning/phases/57-folder-reading-hud/57-HUMAN-UAT.md
    - tests/skopeo-hud-evals.test.js
    - tests/fixtures/skopeo-hud-evals/manifest.json
    - tests/fixtures/skopeo-hud-evals/cases.json
  modified:
    - extension/content/skopeo-shell.js
    - tests/skopeo-browser-contract.test.js
    - tests/skopeo-hud-runtime.test.js
    - tests/skopeo-truth-evals.test.js
    - package.json
    - .planning/phases/57-folder-reading-hud/57-VALIDATION.md

key-decisions:
  - "Render folder, reading, and admitted contract-closed states in the existing shell corpus region; no second root, portal, or host-page mutation is permitted."
  - "Treat an over-cap source graph as partial authority and close the projection rather than presenting a usable prefix as complete."
  - "Report synthetic regression as explicitly non-gold and retain domain fidelity and authorized live Drive/Docs results as human_needed."
  - "Allow 15 seconds for a real Chrome DevTools endpoint under concurrent suite load while retaining the existing readiness and failure checks."

patterns-established:
  - "Rail admission: render only schema-valid current models with a current safe geometry certificate; otherwise synchronously withdraw Phase 57 state."
  - "Citation controls: each eligible source gets a distinct real button carrying only its opaque current action ID."
  - "Evidence honesty: deterministic checks may pass automatically, but synthetic fixtures never promote private-domain or live approval."

requirements-completed: [VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05]

duration: 1h 2m
completed: 2026-08-12
---

# Phase 57 Plan 05: Folder and Reading HUD Summary

**One accessible Shadow DOM contract rail now renders bounded folder and reading intelligence, enforces fail-closed authority and teardown semantics, and is gated by 34 adversarial evals without fabricating live evidence.**

## Performance

- **Duration:** 1h 2m
- **Started:** 2026-08-12T19:41:37Z
- **Completed:** 2026-08-12T20:42:57Z
- **Tasks:** 3
- **Files modified:** 10 implementation, test, and validation files

## Accomplishments

- Implemented `renderContractView(model, onAction)` inside the existing Skopeo Shadow shell with exact desktop/narrow geometry, fixed section ordering, bounded paging, accessible status and focus behavior, and zero-residue teardown.
- Enforced all three authority outcomes: usable admitted projections render, admitted closed projections withdraw stale state before the exact blocker, and unsupported or unsafe no-authority contexts remain fail-quiet with no Phase 57 rail.
- Rendered primary and per-fact citations as distinct real buttons that dispatch only current opaque action IDs, with independent busy, error, retry, and replay-safe lifecycle state.
- Added a 34-case adversarial evaluator across actual schema, projector, composer, runtime, shell, and background security surfaces, with deterministic/provisional results separated from human-owned domain and live evidence.
- Added a sanitized four-scenario UAT ledger and recorded the phase as automated-green while all private live and manual accessibility checks remain explicitly `human_needed`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the exact shell, accessibility, host-coexistence, and teardown contract** - `d9f9063e` (test)
2. **Task 2: Render the accessible composite rail in the existing Shadow shell** - `2e1d6666` (feat)
3. **Task 3: Add the adversarial eval corpus, package gate, and honest UAT ledger** - `e82194dc` (test)

## Files Created/Modified

- `extension/content/skopeo-shell.js` - Validates and renders the bounded folder, reading, and admitted blocker states in the existing lifecycle-owned Shadow rail.
- `tests/skopeo-browser-contract.test.js` - Pins real-browser geometry, host coexistence, keyboard/a11y behavior, hostile text handling, state replacement, and teardown.
- `tests/skopeo-hud-runtime.test.js` - Covers the complete admission matrix and exports the actual content-runtime harness for deterministic eval reuse.
- `tests/skopeo-hud-evals.test.js` - Runs the 34-case structural, runtime, shell, background security, and provisional regression evaluator.
- `tests/fixtures/skopeo-hud-evals/manifest.json` - Declares exact caps, case inventory, evidence boundaries, and the pinned provisional oracle hash.
- `tests/fixtures/skopeo-hud-evals/cases.json` - Defines adversarial folder, reading, security, authority, stale-race, accessibility, and teardown cases.
- `tests/skopeo-truth-evals.test.js` - Pins the HUD aggregate as the truth aggregate's single immediate successor in the normal test chain.
- `package.json` - Adds `test:skopeo-hud-evals` exactly once after the truth aggregate without dependency changes.
- `.planning/phases/57-folder-reading-hud/57-HUMAN-UAT.md` - Records four sanitized manual checks as unapproved and human-needed.
- `.planning/phases/57-folder-reading-hud/57-VALIDATION.md` - Records Wave 0 completion, automated results, and the remaining human evidence boundary.

## Decisions Made

- Reused the current shell's corpus region, atoms, listeners, and teardown lifecycle so the contract view cannot create a detached dashboard or competing runtime.
- Closed over-cap source graphs as `partial-authority`; a bounded UI cap must not turn an incomplete authority set into a misleading usable prefix.
- Reused the actual content runtime harness in the evaluator and combined its output with projector, shell, and background boundary assertions rather than creating a parallel simulated runtime.
- Kept the exact four-line evaluator report stable: deterministic structural/security and synthetic non-gold regression pass, while domain fidelity and authorized live Drive/Docs remain `human_needed`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported the existing runtime test harness for evaluator reuse**
- **Found during:** Task 3 (adversarial evaluator)
- **Issue:** The runtime contract file executed only as a top-level script, so the new evaluator could not exercise the actual VM-backed content runtime without duplicating it or spawning a nested process.
- **Fix:** Exported the existing projection, deferred, flush, and runtime harness helpers while retaining the same direct-execution entrypoint.
- **Files modified:** `tests/skopeo-hud-runtime.test.js`, `tests/skopeo-hud-evals.test.js`
- **Verification:** Direct HUD runtime tests and the aggregate evaluator both pass through the same harness.
- **Committed in:** `e82194dc`

**2. [Rule 3 - Blocking] Updated truth-eval package-chain ownership for the new aggregate**
- **Found during:** Task 3 (normal package gate)
- **Issue:** The existing truth-eval ownership assertion expected its previous successor and would reject the required immediate HUD aggregate even though package wiring was correct.
- **Fix:** Pinned exactly one HUD aggregate invocation as the immediate successor to the truth aggregate.
- **Files modified:** `tests/skopeo-truth-evals.test.js`, `package.json`
- **Verification:** Both focused aggregates and the full `npm test` chain pass; dependency sets and lockfile are unchanged.
- **Committed in:** `e82194dc`

**3. [Rule 1 - Test Reliability] Hardened real-Chrome startup under concurrent suite load**
- **Found during:** Task 3 full verification
- **Issue:** Chrome's DevTools endpoint twice exceeded the five-second harness startup deadline during the concurrent full suite, then passed immediately when rerun alone.
- **Fix:** Increased only the browser harness readiness allowance to 15 seconds; browser behavior, assertions, and failure handling are unchanged.
- **Files modified:** `tests/skopeo-browser-contract.test.js`
- **Verification:** The real-Chrome contract and full repository suite pass with all expected lifecycle observations.
- **Committed in:** `e82194dc`

---

**Total deviations:** 3 auto-fixed (2 blocking integration issues, 1 flaky test-harness bug)
**Impact on plan:** The changes make the planned production and package gates executable and reliable without adding dependencies, privileges, runtime surfaces, or feature scope.

## Issues Encountered

- The isolated worktree did not contain dependency installations. Verification reused already-installed local dependency trees through ignored worktree-only links; no package install, manifest dependency, or lockfile change occurred.
- The worktree does not provide `rg`; the final narrow stub scan used `grep` without changing repository tooling.

## Verification

- `npm run test:skopeo-truth-evals` - PASS
- `npm run test:skopeo-hud-evals` - PASS (`deterministic_structural_security: pass (34/34)`; `provisional_regression: pass (34/34; synthetic_non_gold)`; both human dimensions remain `human_needed`)
- `node tests/skopeo-session-lifecycle.test.js` - PASS
- `node tests/skopeo-browser-contract.test.js` - PASS in local Google Chrome with node reuse, ABA, reorder, detach, reverse-route, scroll, zoom, and narrow-resize observations
- `node scripts/verify-skopeo-storage-boundary.mjs` - PASS (33 files)
- `npm run validate:extension` - PASS
- `npm test` - PASS
- Dependency sections and `package-lock.json` - unchanged
- `git diff --check` - PASS

## Known Stubs

None. `Not available` is a deliberate neutral notification value, and the UAT ledger's `human_needed` records are intentional evidence boundaries rather than implementation placeholders.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The production Folder and Reading rail and its deterministic regression gate are complete for VIEW-01 through VIEW-05.
- Phase 58/59 controls remain intentionally excluded from this rail and can build on its closed citation/action seams without weakening the existing authority boundary.
- No implementation blocker remains. Authorized private Drive/Docs validation and manual keyboard, VoiceOver, forced-colors, reduced-motion, narrow-screen, and 200% zoom evidence remain honestly pending in `57-HUMAN-UAT.md`.

## Self-Check: PASSED

- All ten implementation, test, and validation files plus this summary exist in the worktree.
- Task commits `d9f9063e`, `2e1d6666`, and `e82194dc` are present in history.
- Summary requirement metadata exactly lists VIEW-01 through VIEW-05 from the plan frontmatter.
- No new endpoint, authentication path, file-access boundary, schema change, dependency, or lockfile change was introduced.

---
*Phase: 57-folder-reading-hud*
*Completed: 2026-08-12*
