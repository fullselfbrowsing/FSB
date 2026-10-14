---
phase: 64-opencode-adapter
plan: "12"
subsystem: delegation-ui
tags: [opencode, sidepanel, feed, consent, terminal-barrier, accessibility]

requires:
  - phase: 64-opencode-adapter
    plan: "08"
    provides: Authoritative result-candidate and clean-exit terminal barrier
  - phase: 64-opencode-adapter
    plan: "09"
    provides: Canonical two-provider metadata, preflight, consent, trust, and provider-free start routing
  - phase: 64-opencode-adapter
    plan: "10"
    provides: Canonical OpenCode controller snapshots and unknown-billing persistence
  - phase: 64-opencode-adapter
    plan: "11"
    provides: Provider-neutral selected-provider trust coordination
provides:
  - Canonical label-driven consent, preflight, control, lifecycle, failure, and trust presentation
  - Structurally identical Claude Code and OpenCode feed rendering through the existing components
  - Exact Billing not reported summary copy for unknown billing without inferred plan or price
  - Result and summary presentation gated by controller-authoritative completed terminal truth
affects: [64-13, 65-codex-adapter, delegated-run-ui]

tech-stack:
  added: []
  patterns:
    - Validate presentation identities through the canonical delegation-provider helper
    - Treat persisted result rows as candidates and derive successful presentation only from completed controller terminal truth
    - Keep provider labels as validated data while preserving one provider-neutral renderer and DOM structure

key-files:
  created: []
  modified:
    - extension/ui/sidepanel.html
    - extension/ui/options.js
    - extension/ui/sidepanel.js
    - extension/ui/delegation-feed.js
    - tests/providers-panel-ui.test.js
    - tests/delegation-sidepanel-ui.test.js
    - tests/delegation-event-store.test.js

key-decisions:
  - "Load the canonical provider helper before both side-panel consumers as the only sidepanel HTML change; add no visible markup or CSS."
  - "Bind consent and trust to an exact canonical provider identity, but keep FSB_DELEGATION_START free of provider authority."
  - "Hide result and summary rows for every non-completed outcome; when the controller supplies completed terminal truth, present the still-running persisted result candidate as completed without mutating it."

patterns-established:
  - "Provider-neutral lifecycle copy: canonical id/label validation precedes label substitution in existing nodes and actions."
  - "Terminal-truth presentation: snapshot state, terminal code, summary state, and a result candidate must all exist before success is visible."

requirements-completed: [MULTI-01, MULTI-02, MULTI-03]

duration: 14 min
completed: 2026-07-21
---

# Phase 64 Plan 12: OpenCode Delegated UI Summary

**OpenCode now uses the existing consent, lifecycle, control, feed, and summary UI with canonical labels, honest unknown billing, and success withheld until authoritative completed terminal truth.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-21T10:54:39Z
- **Completed:** 2026-07-21T11:08:46Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 7 implementation/test paths

## Accomplishments

- Replaced Claude-only response validation and visible lifecycle copy with exact canonical Claude Code/OpenCode identity validation and label-driven text through the existing consent, preflight, control, run-header, failure, and trust paths.
- Kept trust writes bound to the consent provider while retaining the exact provider-free `{ type, challengeId, task }` start command and one explicit user-triggered retry-as-new-intent path.
- Added the canonical provider helper before `delegation-feed.js` and `sidepanel.js` as the sole sidepanel HTML delta; cryptographic checks pin unchanged visible HTML and all existing CSS.
- Generalized feed client/snapshot validation over the canonical shipped roster, rejected identity mismatches/accessors/native extras, and proved Claude/OpenCode inputs produce identical DOM structure and semantics.
- Mapped unknown billing exactly to `Billing not reported` without subscription, dollar, free, unlimited, account, or provider inference.
- Suppressed candidate Result and Run summary rows for running and every failed terminal shape; completed presentation now requires a completed snapshot, completed terminal code, completed summary, and persisted result candidate.

## Task Commits

Both tasks landed as explicit RED/GREEN pairs:

1. **Delegated lifecycle RED** — `36243385` (test; helper order, canonical validators, OpenCode copy, provider-bound trust, focus, and no-structure locks)
2. **Delegated lifecycle GREEN** — `6174b8b3` (feat; canonical label-driven consent/lifecycle and provider-bound trust)
3. **Feed/terminal RED** — `fea07bcb` (test; provider parity, unknown billing, candidate/failure negatives, persistence barrier, and native-data rejection)
4. **Feed/terminal GREEN** — `394d919f` (feat; canonical feed identity, exact unknown billing, and authoritative success gate)

## Files Created/Modified

- `extension/ui/sidepanel.html` — Loads the canonical provider helper before both delegated UI consumers without visible markup changes.
- `extension/ui/options.js` — Uses a provider-neutral hidden trust-control placeholder before canonical selected-provider rendering.
- `extension/ui/sidepanel.js` — Validates canonical response identities and substitutes trusted labels through existing consent, preflight, controls, lifecycle, failure, and trust flows.
- `extension/ui/delegation-feed.js` — Accepts canonical Claude Code/OpenCode identities, renders exact unknown billing, and gates successful result/summary presentation on completed terminal truth.
- `tests/providers-panel-ui.test.js` — Locks provider-neutral trust mount/render/clear source boundaries.
- `tests/delegation-sidepanel-ui.test.js` — Covers helper order and byte locks, exact OpenCode lifecycle copy, identity/accessor failures, DOM parity, billing, hydration, sequence, and terminal negatives.
- `tests/delegation-event-store.test.js` — Proves persisted OpenCode result candidates contain no completed truth and failed settlement cannot retain transient completion.

## Decisions Made

- Used `FsbDelegationProviders` as the sole presentation identity authority instead of embedding either shipped provider id or label in sidepanel/feed rendering logic.
- Preserved the existing result-entry schema. A durable result row remains `running`; only the controller's exact completed terminal tuple allows the feed to present its outcome as completed.
- Suppressed summaries for stopped and failed snapshots as well as running candidates, because those states may contain metrics but cannot make a successful-result claim.
- Retained all existing controls, classes, semantic articles/definition lists, focus behavior, live-region ownership, responsive breakpoints, forced-colors, themes, and reduced-motion CSS.

## Security and Verification

- **T64-04 (HIGH, UI replay): mitigated.** Start remains provider-free, pre-task convergence uses one consent/start path, provider identity changes fail closed, and post-accept failure exposes no automatic replay.
- **T64-08 (CRITICAL, premature success): mitigated.** Running candidates and protocol-drift/nonzero/signal/missing/duplicate-style failures render zero Result and zero Run summary; only completed controller terminal truth unlocks success.
- **T64-10 (CRITICAL, presentation disclosure): mitigated.** Canonical identity accessors, mismatches, unknown providers, and raw native extra fields fail closed; dynamic UI construction remains text-only with no URL/style/handler sink.
- No HIGH or CRITICAL finding was accepted.

Final verification receipts:

- `node tests/delegation-sidepanel-ui.test.js --section opencode-lifecycle && node tests/providers-panel-ui.test.js --section delegation-trust` — **PASS**.
- `node tests/delegation-sidepanel-ui.test.js && node tests/delegation-event-store.test.js` — **PASS** (event store: 33/33).
- `node tests/delegation-controller.test.js` — **PASS** (41/41).
- `node tests/sidepanel-tab-aware-smoke.test.js && node tests/provider-parity.test.js && node tests/delegation-routing.test.js` — **PASS**.
- Scoped `git diff --check`, exact seven-path audit, sidepanel HTML-only-one-line hash, unchanged CSS hash, provider-branch scans, hostile-field scans, and provider-free start assertions — **PASS**.

No live browser, authenticated OpenCode run, screenshot, or assistive-technology evidence was fabricated; those remain in Plan 64-13's milestone-end human ledger.

## Deviations from Plan

None. The implementation stayed within the seven declared paths, followed the prescribed RED/GREEN sequence, and added no visible structure, CSS, provider picker, topology state, continuation control, or provider-specific renderer branch.

## Issues Encountered

- The optional legacy `node tests/delegation-phase-contract.test.js` audit still reports 1,043 passes and the same four stale source-pin failures documented by Plan 64-11: a Claude-only clear-trust regex, two pre-Plan-10 drift-diagnostics shape pins, and a Providers roster parser that includes the canonical-helper bootstrap block. These failures predate Plan 64-12, are outside its owned paths, and are assigned to Plan 64-13's integration-audit reconciliation. Required commands and adjacent controller/routing/smoke regressions are green.

## User Setup Required

None - no dependency, credential, account, browser, executable, or external-service configuration was added.

## Next Phase Readiness

- Plan 64-13 can exercise the complete OpenCode surface with deterministic provider-neutral lifecycle/feed coverage and reconcile the four documented legacy source pins.
- Genuine authenticated OpenCode delegation, cold/owned-attach visual parity, keyboard/screen-reader behavior, and live browser responsiveness remain honestly deferred to the milestone-end human UAT ledger.
- No Plan 64-12 blocker remains.

## Self-Check: PASSED

- All seven declared implementation/test paths exist and are clean after four atomic RED/GREEN commits.
- Exact task commands, adjacent regression suites, byte/source/security locks, and HIGH/CRITICAL threat mitigations pass.
- Shared planning state and all unrelated dirty workspace paths remained untouched and unstaged.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-21*
