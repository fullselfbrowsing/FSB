---
phase: 58-cited-ask-decision-policy
plan: "02"
subsystem: ask-engine
tags: [skopeo, cited-answers, provider, exact-set, citations, security]

requires:
  - phase: 58-cited-ask-decision-policy
    plan: "01"
    provides: Closed ask schema and deterministic answer publication vocabulary
  - phase: 56-governing-lineage-evidence-deadline-engine
    provides: Current exact-set governing/history proof, categorical trust, and opaque citation actions
provides:
  - Bounded abortable single-use configured-provider ask sessions
  - Private issued-handle registry that exposes no source or policy authority to the provider
  - Deterministic local governing/history, citation, trust, conflict, gap, and abstention adjudication
  - Adversarial provider, cancellation, cap, drift, hostile-shape, and permutation regression oracle
affects: [58-03-background-controller, 58-04-content-hud, 58-05-evals]

tech-stack:
  added: []
  patterns:
    - Provider synthesis receives inert bounded excerpts and opaque one-shot handles only
    - Every final answer is rebuilt from immutable local proof and reparsed through the closed schema
    - Evidence-blocking gaps override claimed completeness while policy-only gaps remain separate from informational evidence

key-files:
  created:
    - extension/utils/skopeo-ask-engine.js
    - tests/skopeo-ask-engine.test.js
  modified: []

key-decisions:
  - "Keep raw excerpts and evidence-handle bindings inside a WeakMap-backed nonserializable session capability."
  - "Treat over-cap exact sets as abstained without invoking the provider or publishing a usable prefix."
  - "Canonicalize local proof, conflicts, gaps, sources, and citations before publication so input permutations are byte-identical."

patterns-established:
  - "Fresh ask boundary: each prepared question captures one explicit scope and current provider/account/corpus/source/revision authority."
  - "Local publication boundary: provider output can select issued handles but cannot assign role, citation, trust, conflict, gap, completeness, or policy state."
  - "Failure boundary: cancellation, drift, malformed output, cap failure, missing no-storage acknowledgement, and discard expose no partial candidate."

requirements-completed: [VIEW-06, VIEW-07]

duration: 13min
completed: 2026-08-27
---

# Phase 58 Plan 02: Scoped Cited Ask Engine Summary

**A bounded configured-provider session that can word an answer while deterministic local proof retains every publication authority**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-27T07:08:00Z
- **Completed:** 2026-08-27T07:21:35Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added an exact injected ask-engine factory with private single-use sessions, fresh configured-provider binding, bounded prompt/response sizes, abort checks around every await, and one closed repair attempt.
- Restricted provider input to the safe question, explicit scope kind, inert bounded excerpts, and engine-issued opaque handles; no source identity, URL, citation action, policy field, storage key, tool, or follow-up history crosses the boundary.
- Rebound admitted handles to immutable local proof so governing/history role, categorical trust, current citation/action, conflicts, gaps, and completeness cannot be supplied by provider prose.
- Forced incomplete, inaccessible, over-cap, stale, fake-handle, duplicate-handle, history-only, and insufficient-support cases to abstain without a material conclusion.
- Proved byte-identical publication under evidence, candidate-claim, conflict, gap, and citation permutations and kept policy-only gaps from becoming model authority.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the controlled RED ask-engine contract** - `17b4e0f4` (test)
2. **Task 2: Implement bounded provider sessions and inert evidence handles** - `9fc1aba7` (feat)
3. **Task 3: Complete deterministic claim, citation, and abstention adjudication** - `b61be1da` (feat)

## Files Created/Modified

- `extension/utils/skopeo-ask-engine.js` - Private configured-provider session and deterministic cited-answer adjudicator.
- `tests/skopeo-ask-engine.test.js` - Controlled RED plus provider isolation, cap, drift, cancellation, stale/fake proof, abstention, and permutation coverage.

## Decisions Made

- A provider candidate may nominate only engine-issued handles; any unknown or duplicate handle is dropped and makes a material conclusion incomplete.
- Evidence-blocking truth gaps override a caller-provided complete flag, while Document 10 and memo gaps remain available for the separate deterministic policy layer.
- Over-cap input is still shape- and authority-validated, but no handles or excerpts are issued and no provider call occurs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `rg` remains unavailable in the workspace environment; the prohibited-surface audit used `grep -E` and passed.

## User Setup Required

None - no external provider or account setup is required for the network-free test harness.

## Next Phase Readiness

- Plan 58-03 can inject already-authorized current proof into the engine and expose only minimized cited-answer and policy projections through the background boundary.
- The engine has no Chrome, storage, DOM, direct network, durable conversation, policy, clearance, or citation-effect authority.
- Focused ask tests, truth extractor/graph regressions, and the full Phase 56 truth evaluation suite pass.

---
*Phase: 58-cited-ask-decision-policy*
*Completed: 2026-08-27*
