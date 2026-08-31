---
phase: 58-cited-ask-decision-policy
plan: "01"
subsystem: policy
tags: [skopeo, cited-answers, policy, chrome-storage, sha256, security]

requires:
  - phase: 57-folder-reading-hud
    provides: Closed HUD projection vocabulary, categorical trust, opaque citation actions, and reserved policy seams
  - phase: 56-governing-lineage-evidence-deadline-engine
    provides: Current governing/history evidence, stable source identity, and complete-set authority
provides:
  - Closed immutable question, provider-candidate, cited-answer, and policy schemas
  - Versioned partitioned persistence for stable Document 10 and agreement classification
  - Deterministic applicability, current review acknowledgement, memo, and clearance evaluation
  - Hostile-shape, cap, byte-boundary, partition, concurrency, and drift regression oracles
affects: [58-02-ask-engine, 58-03-background-controller, 58-04-content-hud, 58-05-evals]

tech-stack:
  added: []
  patterns:
    - Provider output references issued evidence handles and never supplies citation or policy authority
    - Review acknowledgement is ephemeral and bound to a canonical SHA-256 decision-authority digest
    - Routine agreements structurally omit memo state while explicit complex agreements require complete proof

key-files:
  created:
    - extension/utils/skopeo-ask-schema.js
    - extension/utils/skopeo-decision-policy-store.js
    - extension/utils/skopeo-decision-policy.js
    - tests/skopeo-ask-schema.test.js
    - tests/skopeo-decision-policy.test.js
  modified: []

key-decisions:
  - "Use a closed issued-handle candidate record so provider output cannot name citations, evidence roles, trust, or policy state."
  - "Encode account/corpus partitions with collision-safe length-prefixed keys and keep all durable maps on null prototypes."
  - "Compute the review binding with bundled synchronous SHA-256 so the pure policy engine has no runtime or package dependency."

patterns-established:
  - "Closed answer boundary: incomplete evidence can expose verified facts and gaps only under abstained with no conclusion."
  - "Separate authority boundary: answer outcome never implies policy clearance."
  - "Current review boundary: any account, corpus, agreement, source-set, revision, or Document 10 drift revokes acknowledgement."

requirements-completed: [VIEW-06, VIEW-07, POLICY-01, POLICY-02, POLICY-03]

duration: 15min
completed: 2026-08-27
---

# Phase 58 Plan 01: Ask and Decision Policy Foundation Summary

**Closed cited-answer contracts plus stable partitioned policy configuration and deterministic current-review clearance safeguards**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-27T06:52:54Z
- **Completed:** 2026-08-27T07:07:12Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Locked provider candidates to bounded issued evidence handles and rejected model-owned citations, trust scores, evidence roles, policy fields, and unsafe descriptors.
- Made conclusions impossible under incomplete evidence while keeping governing evidence, relevant history, conflicts, gaps, and categorical trust structurally distinct.
- Persisted only stable Document 10 identity and explicit routine/complex classification inside the current account/corpus partition.
- Required current Document 10 open-before-acknowledgement and revoked review on every tested authority or revision drift.
- Kept routine agreements free of memo state and blocked complex decisions on proven-missing, inaccessible, or incomplete memo evidence without adding any memo-writing path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write controlled RED contracts for ask schemas and decision policy** - `5f74aa70` (test)
2. **Task 2: Implement the exact immutable ask schema** - `a3ae37c1` (feat)
3. **Task 3: Implement stable policy persistence and deterministic clearance** - `8be90544` (feat)

## Files Created/Modified

- `extension/utils/skopeo-ask-schema.js` - Closed hostile-shape-safe ask, candidate, cited-answer, and policy parsers.
- `extension/utils/skopeo-decision-policy-store.js` - Serialized versioned background-only stable policy persistence.
- `extension/utils/skopeo-decision-policy.js` - Pure applicability, review, digest, memo, and clearance engine.
- `tests/skopeo-ask-schema.test.js` - Controlled RED plus exact shape, cap, citation, immutability, and byte-boundary coverage.
- `tests/skopeo-decision-policy.test.js` - Controlled RED plus partition, storage, current-review, drift, and safeguard coverage.

## Decisions Made

- Provider synthesis remains inert candidate data; only local current evidence records can create citation/action bindings and evidence roles.
- The decision digest includes all current authority, Document 10, classification, memo-proof, and conflict inputs, intentionally revoking acknowledgement whenever the decision record changes.
- Malformed durable policy data reads as empty without being silently deleted; a later explicit configuration action may establish a valid replacement envelope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The installed GSD SDK does not expose `state.set-plan-index`; `state.begin-phase` already set the supported Plan 1 position, so execution continued through the supported state API.
- `rg` is unavailable in this workspace environment; the final prohibited-surface audit used `grep -E` and passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 58-02 can consume the immutable ask schema and policy inputs without defining new authority vocabulary.
- Provider integration remains intentionally absent; the next plan adds bounded exact-set extraction and local citation adjudication.
- No package, lockfile, manifest, permission, DOM, MCP, provider, or network boundary changed.

---
*Phase: 58-cited-ask-decision-policy*
*Completed: 2026-08-27*
