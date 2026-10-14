---
phase: 58-cited-ask-decision-policy
plan: "03"
subsystem: background-controller
tags: [skopeo, cited-ask, hud, policy, one-shot-actions, security]

requires:
  - phase: 58-cited-ask-decision-policy
    plan: "01"
    provides: Closed Ask, policy store, and deterministic clearance schemas
  - phase: 58-cited-ask-decision-policy
    plan: "02"
    provides: Bounded provider sessions and locally adjudicated cited answers
  - phase: 57-folder-reading-hud
    provides: Current projection controller, opaque citation registry, and trusted HUD schema/projector
provides:
  - Explicit agreement, vendor, and corpus Ask scopes backed by private exact source sets
  - Abortable current Ask orchestration with minimized schema-reparsed answer projections
  - Deterministic Document 10 and complex-agreement policy evaluation joined separately from answer outcome
  - Projection-owned source review, acknowledgement, configuration, classification, and memo navigation actions
affects: [58-04-content-hud, 58-05-evals, 59-release-hardening]

tech-stack:
  added: []
  patterns:
    - Opaque scope tokens resolve to exact private source sets only inside the current background controller
    - Policy source effects reuse the citation authorization sandwich while local writes require a separate consequence confirmation
    - Policy refresh rebuilds and reparses the complete answer projection under a fresh projection and scope token

key-files:
  created: []
  modified:
    - extension/background.js
    - extension/utils/skopeo-hud-schema.js
    - extension/utils/skopeo-hud-projector.js
    - tests/skopeo-hud-runtime.test.js
    - tests/skopeo-hud-schema.test.js

key-decisions:
  - "Keep account, corpus, agreement, source, revision, truth, and decision identities only in private controller bindings; content receives labels and opaque tokens."
  - "Bind applicable policy decisions to scope/source/access/revision/question digests and keep review acknowledgement controller-local."
  - "Treat configuration and classification as local policy writes with bounded consequence confirmation; no action mutates Drive or authors a memo."

patterns-established:
  - "Ask replacement boundary: abort provider work and revoke every scope, citation, review, acknowledgement, and policy action before replacement."
  - "Review boundary: a current Document 10 source must open successfully before acknowledgement can exist for that decision/revision."
  - "Local-write boundary: exact current confirmation rederives partition and stable agreement identity before the store mutation, then rebuilds policy state."

requirements-completed: [VIEW-06, VIEW-07, POLICY-01, POLICY-02, POLICY-03]

duration: 33min
completed: 2026-08-27
---

# Phase 58 Plan 03: Current Ask and Policy Controller Summary

**Fresh exact-set asks now publish only minimized cited answers, while deterministic one-shot policy effects remain bound to the current background authority**

## Performance

- **Duration:** 33 min
- **Started:** 2026-08-27T07:29:24Z
- **Completed:** 2026-08-27T08:02:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Extended the Phase 57 HUD schema/projector with bounded `ask` and `answer` modes, explicit safe scopes, categorical answer state, governing/history evidence separation, deterministic policy state, and opaque policy actions.
- Added agreement/vendor/corpus scope registries that resolve only inside the current controller and authorize exactly one fresh `query` operation per Ask.
- Bound provider work to one AbortController/epoch and rechecked controller/source/access/revision authority around every await and before publication.
- Evaluated applicable Document 10 and complex-agreement memo safeguards locally from stable partitioned configuration, current source/truth proof, and controller-local acknowledgement.
- Added current one-shot citation, Document 10 review/open/acknowledge, configuration/replacement/clear, complex/routine classification, and existing memo navigation effects without Drive mutation or memo authoring.
- Proved exact message shapes, cross-tab/projection rejection, cancellation, late-completion withdrawal, review-before-acknowledge, confirmation-token enforcement, replay prevention, and projection privacy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the HUD runtime harness with a controlled RED controller contract** - `0f6af495` (test)
2. **Task 2: Implement current ask orchestration and minimized HUD projection** - `06db60c0` (feat)
3. **Task 3: Complete one-shot source and policy effects with deterministic clearance refresh** - `80107256` (feat)

## Files Created/Modified

- `extension/background.js` - Private scope/action registries, Ask orchestration, deterministic policy join, source review, acknowledgement, and confirmed local policy effects.
- `extension/utils/skopeo-hud-schema.js` - Exact bounded Ask/answer/policy projection grammar and invariants.
- `extension/utils/skopeo-hud-projector.js` - Pure minimized Ask/answer/policy projection construction and final schema reparse.
- `tests/skopeo-hud-runtime.test.js` - Exact scope, race, privacy, source-open, review, acknowledgement, consequence, confirmation, and replay oracle.
- `tests/skopeo-hud-schema.test.js` - Phase 58 projection mode surface update.

## Decisions Made

- Policy applies to explicit agreement-scoped decisions; corpus/vendor informational answers remain separately useful without inventing a singular agreement policy identity.
- Question and access drift participate in the private decision authority through digests even though they never cross the HUD projection.
- Missing or inaccessible safeguards block clearance without suppressing the cited informational answer; routine agreements structurally omit memo state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `rg` remains unavailable in the workspace; focused source audits used `grep -E` and passed.
- The runtime contract's private truth-helper call count was intentionally advanced for the new policy refresh path and retained a declaration-plus-explicit-callers assertion.

## User Setup Required

None - no external service configuration or new permission is required.

## Next Phase Readiness

- Plan 58-04 can render explicit Focused Ask and answer/policy models from the minimized projection and route only the four exact background message families.
- Structural/security evaluations pass 34/34; truth, HUD, policy, corpus, and storage-boundary regressions are green.
- Commercial-contract domain fidelity and representative authorized live Drive/Docs validation remain honestly `human_needed` for Plan 58-05.

---
*Phase: 58-cited-ask-decision-policy*
*Completed: 2026-08-27*
