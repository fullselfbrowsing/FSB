---
phase: 58-cited-ask-decision-policy
plan: "04"
subsystem: content-hud
tags: [skopeo, cited-ask, composer, content-runtime, cancellation, opaque-actions]

requires:
  - phase: 58-cited-ask-decision-policy
    plan: "03"
    provides: Current background Ask projections and one-shot source/policy effects
  - phase: 57-folder-reading-hud
    provides: Existing contract composer, runtime owner, shared Shadow rail, and projection action epoch
provides:
  - Certified agreement, vendor, and corpus Ask entries on current Phase 57 contract models
  - Closed Focused ask/checking/error and cited answer/policy presentation models
  - Fresh content Ask epochs with cancel-before-replace and exact late-response withdrawal
  - Opaque answer action and consequence-confirmation routing through the current background controller
affects: [58-05-shell-evals, 59-release-hardening]

tech-stack:
  added: []
  patterns:
    - A separate versioned Ask model extends the contract rail without widening the Phase 57 view-model version
    - One contract owner and action epoch also own editing, checking, result, error, and confirmation state
    - Local controls emit only closed intent payloads while background effects retain opaque action and confirmation authority

key-files:
  created: []
  modified:
    - extension/content/skopeo-adaptive-composer.js
    - extension/content/skopeo-runtime.js
    - tests/skopeo-adaptive-composer.test.js
    - tests/skopeo-hud-runtime.test.js

key-decisions:
  - "Keep `skopeo-contract-view/1` stable and introduce `skopeo-contract-ask/1` for Focused ask and answer models."
  - "Render local editing/checking/error state from a schema-valid minimized projection; never read Drive, storage, provider, truth, or policy data in content."
  - "Treat scope change, cancel, back, Ask another, navigation, teardown, and every dispatch as synchronous authority-revocation boundaries."

patterns-established:
  - "Certified entry boundary: only background-projected `askScopes` become explicit local Ask controls; absent scopes produce no inferred or disabled entry."
  - "Ask currentness boundary: complete tuple, projection token, content Ask epoch, visibility, and shared contract epoch must remain current around every await and repaint."
  - "Answer action boundary: content sends only the current opaque action/confirmation token and consumes it locally before interpreting the background result."

requirements-completed: [VIEW-06, VIEW-07, POLICY-01, POLICY-02, POLICY-03]

duration: 15min
completed: 2026-08-27
---

# Phase 58 Plan 04: Focused Ask Content Contract Summary

**The existing contract rail now has closed Focused Ask and cited-answer models plus one fresh, cancelable, stale-safe content lifecycle**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-27T08:09:07Z
- **Completed:** 2026-08-27T08:24:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added certified agreement/vendor/corpus entry models with exact UI-SPEC labels and no fallback inference from filenames, visible page text, or context labels.
- Introduced recursively frozen `skopeo-contract-ask/1` editing, checking, error, answer, evidence, policy, source, and local-action models with exact validators.
- Preserved the fixed answer hierarchy, categorical trust, governing/history separation, explicit conflicts/gaps, separate answer/clearance states, and informational evidence under blocked policy.
- Structurally omitted routine memo state and exposed complex memo status only when the background projection contains the explicit memo policy member.
- Extended the existing content contract owner with `idle|editing|checking|result|error`, a fresh Ask epoch, one bounded question, current scope, cancel-before-replace, and stale/ABA response rejection.
- Routed Ask, cancel, answer action, and confirmation through exact message allowlists carrying only the current tuple plus opaque scope/action/confirmation tokens.
- Proved cancellation, scope replacement, Ask another, back, navigation, late completion, action replay, confirmation, and generic-shell coexistence behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write controlled RED composer and content-runtime contracts** - `c7451290` (test)
2. **Task 2: Implement closed ask/result/policy composition** - `c03f8492` (feat)
3. **Task 3: Implement explicit ask state, cancellation, and opaque action routing** - `b8991eaf` (feat)

## Files Created/Modified

- `extension/content/skopeo-adaptive-composer.js` - Certified Ask entries plus exact Focused ask and cited answer/policy models and validators.
- `extension/content/skopeo-runtime.js` - Shared content Ask state, fresh epochs, cancellation, exact projection admission, and opaque action/confirmation routing.
- `tests/skopeo-adaptive-composer.test.js` - Controlled RED, exact copy/order, hostile value, policy mapping, routine omission, mutation, and freeze oracles.
- `tests/skopeo-hud-runtime.test.js` - Controlled RED plus dispatch, cancel, ABA, late response, scope, back, navigation, action, confirmation, replay, and privacy oracles.

## Decisions Made

- Kept the Phase 57 renderer contract stable and additive: Plan 5 receives new typed Ask/confirmation models without a second root or runtime.
- Kept exact Google origins only as admission allowlists; no source URL, file/account identity, provider handle, policy key, or memo content reaches content messages or models.
- Used a best-effort background cancel before synchronous local epoch invalidation, so a delayed cancel acknowledgement can never retain repaint authority.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `rg` remains unavailable; focused source audits used `grep -E` and `awk`.
- The general session harness exposed that a shell without a contract withdrawal method could be destroyed even when it never owned a contract surface. The shared withdrawal helper now invokes terminal fallback only for an actually owned contract surface; production and lifecycle tests pass.

## User Setup Required

None - no external service configuration or new permission is required.

## Next Phase Readiness

- Plan 58-05 can implement the new `renderContractAsk` and `renderContractConfirmation` shell contracts in the sole existing Shadow rail.
- Composer, content runtime, HUD schema/projector/evals, session lifecycle, and shell regressions are green.
- Structural/security evaluation passes 34/34; commercial-contract domain fidelity and representative authorized live Drive/Docs behavior remain honestly `human_needed` for final closure.

---
*Phase: 58-cited-ask-decision-policy*
*Completed: 2026-08-27*
