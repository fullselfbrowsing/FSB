---
phase: 58-cited-ask-decision-policy
plan: "05"
subsystem: content-shell-evals
tags: [skopeo, cited-ask, shadow-dom, accessibility, policy, evals]

requires:
  - phase: 58-cited-ask-decision-policy
    plan: "04"
    provides: Closed Focused ask/result/policy models and current cancelable content lifecycle
provides:
  - Accessible Focused ask, checking, error, cited answer, policy, and confirmation surfaces in the existing Shadow rail
  - Native keyboard, focus, live-region, narrow/zoom, contrast, reduced-motion, collision, and teardown behavior
  - Versioned Phase 58 requirement/threat aggregate registered exactly once in the repository test chain
affects: [58-verification, 59-release-hardening]

tech-stack:
  added: []
  patterns:
    - One existing 384px Shadow rail renders every Ask state with native nodes and text-only sinks
    - Shell actions carry only bounded local intent while background-owned opaque tokens retain effect authority
    - Deterministic structural/security evidence is reported separately from human legal-domain and authorized live-host evidence

key-files:
  created:
    - tests/skopeo-ask-evals.test.js
    - tests/fixtures/skopeo-ask-evals/manifest.json
    - tests/fixtures/skopeo-ask-evals/cases.json
  modified:
    - extension/content/skopeo-shell.js
    - tests/skopeo-browser-contract.test.js
    - package.json
    - tests/skopeo-truth-evals.test.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "Keep the answer hierarchy fixed: outcome, conclusion, governing evidence, relevant history, conflicts/gaps, policy safeguards, then sources."
  - "Use native textarea, radio, button, fieldset, heading, list, and focusable-region semantics with literal text insertion only."
  - "Do not infer approval from automated tests: legal/domain fidelity and authorized live Drive/Docs remain human_needed."

patterns-established:
  - "Ask shell boundary: validate a closed model, build an inert candidate tree, recheck authority, then replace the sole rail scope."
  - "Announcement boundary: only a current committed answer receives focus and one deduplicated polite announcement."
  - "Evaluation ownership: the normal suite runs graph -> truth -> HUD -> Ask exactly once before dependent profile/content tests."

requirements-completed: [VIEW-06, VIEW-07, POLICY-01, POLICY-02, POLICY-03]

duration: 29min
completed: 2026-08-27
---

# Phase 58 Plan 05: Focused Ask Shell and Evaluation Closure Summary

**The existing Skopeo rail now renders the complete accessible cited-answer and decision-policy experience, with all deterministic Phase 58 and repository gates green**

## Performance

- **Duration:** 29 min
- **Started:** 2026-08-27T08:29:32Z
- **Completed:** 2026-08-27T08:58:02Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Rendered explicit agreement, vendor, and enrolled-corpus Ask entries plus editing, checking, retryable error, answered, review-required, and abstained states in the one existing Shadow rail.
- Added the fixed semantic answer hierarchy with governing evidence and relevant history kept separate, categorical trust, conflicts, gaps, current source navigation, policy safeguards, and consequence confirmation.
- Added native focus and keyboard behavior, IME-safe shortcuts, one deduplicated live announcement, 40px controls, narrow stacking, 200% zoom support, forced-colors/reduced-motion behavior, collision safety, and exact teardown.
- Kept hostile source/question strings literal through `textContent`; no raw URL, revision, policy identity, provider handle, HTML, Markdown, remote asset, or memo-authoring action enters the shell.
- Added a versioned requirement/threat matrix covering complete, partial, inaccessible, hostile, stale, fake-citation, policy, memo, cap, race, accessibility, and teardown states.
- Registered `test:skopeo-ask-evals` exactly once after its truth/HUD prerequisites and repaired the dependent ownership and import-order regression contracts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write controlled RED browser and requirement-eval contracts** — `16e9dc3b` (test)
2. **Task 2: Implement the accessible Focused ask and cited-result rail** — `bed0d18f` (feat)
3. **Task 3: Register evals and close focused plus full regressions honestly** — `49473365` (test)

## Verification Results

- `npm run test:skopeo-ask-evals` — green; 24/24 deterministic structural/security cases, with domain and authorized-live dimensions reported independently as `human_needed`.
- `npm run test:skopeo-truth-evals` — green.
- `npm run test:skopeo-hud-evals` — green.
- `node scripts/verify-skopeo-storage-boundary.mjs` — green.
- `npm run validate:extension` — green.
- `npm test` — green across the full repository suite.
- `git diff --check` — green.

## Deviations from Plan

- The full suite exposed two stale regression contracts: the truth aggregate expected the pre-Ask package order, and the Lattice bridge expected the pre-Ask background import counts/order. Both were updated to assert the shipped Phase 58 chain; no production behavior changed.
- The full suite regenerated showcase crawler dates. Those unrelated mechanical changes were removed from the worktree and are not part of this plan.

## Human Evidence Still Required

- Legal/domain review of answer conclusions, governing/history roles, policy applicability, and complex-agreement memo qualification.
- Authorized live Drive/Docs exercises for stable Document 10 identity, citation navigation, account/access/revision drift, revocation, and vendor/corpus scope behavior.
- Human usefulness, VoiceOver, density, zoom, and host-coexistence observation.

These remain `human_needed`; deterministic or synthetic evidence does not approve them.

## Next Phase Readiness

- All five Phase 58 plans are implemented and their deterministic gates pass.
- Phase 59 can build current-user deadline alerts and release-hardening checks on the current truth, HUD, Ask, stable policy identity, and exact teardown contracts.

---
*Phase: 58-cited-ask-decision-policy*
*Completed: 2026-08-27*
