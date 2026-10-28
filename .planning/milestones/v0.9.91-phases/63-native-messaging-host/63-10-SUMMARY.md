---
phase: 63-native-messaging-host
plan: "10"
subsystem: native-host-verification
tags: [native-messaging, validation, ci, packaging, security, uat-ledger]

requires:
  - phase: 63-native-messaging-host
    provides: Complete native protocol, daemon, installer, diagnostics, background wake, and intent-fenced side-panel implementation from Plans 01-09
  - phase: 61-delegation-ux-sw-eviction-persistence
    provides: Honest offline/unpaired fallback and the milestone-end human-UAT ledger pattern
provides:
  - One eight-scenario Phase 63 human-UAT ledger that remains unchecked, pending, and evidence-empty
  - One workspace-preserving focused runner for all Phase 63 native and extended regression seams
  - Exact root and CI ordering around the sole MCP build and source/compiled authority gates
  - A 30-task Nyquist map and mechanical requirement, decision, threat, ASVS, architecture, UI, and forbidden-scope contract
affects: [63-11, 63-12, native-host-review, milestone-end-uat]

tech-stack:
  added: []
  patterns:
    - Derive validation task identity and commands directly from every PLAN task, then require a bijection with the Nyquist table
    - Execute source and compiled assertions in one fresh build lifecycle while restoring the complete prior build graph and raw Git index
    - Keep synthetic, source, adapter, and packed-artifact evidence mechanically separate from genuine human UAT

key-files:
  created:
    - .planning/phases/63-native-messaging-host/63-HUMAN-UAT.md
    - scripts/run-phase63-focused-tests.mjs
  modified:
    - .planning/phases/63-native-messaging-host/63-VALIDATION.md
    - package.json
    - .github/workflows/ci.yml
    - tests/delegation-phase-contract.test.js
    - tests/mcp-version-parity.test.js

key-decisions:
  - "Keep all eight genuine OS, Chrome, visual, keyboard, and screen-reader scenarios in one v0.9.91 milestone-end ledger; automated evidence may validate ledger integrity but cannot populate it."
  - "Run every compiled Phase 63 seam through one inner workspace-preserving build lifecycle, with the outer focused runner independently proving complete build-tree, dirty-byte, and raw-index identity."
  - "Derive all 30 task rows mechanically from the twelve PLAN files and keep Plans 11-12 pending until their independent reviews and guarded full-suite work actually execute."

requirements-completed: [NATIVE-01, NATIVE-02, NATIVE-03, NATIVE-04]

duration: 25 min
completed: 2026-07-18
---

# Phase 63 Plan 10: Deterministic Native-Host Contract and Honest UAT Ledger Summary

**Phase 63 now has one workspace-safe focused matrix, an exact 30-task mechanical audit, and a complete eight-scenario human ledger that automation cannot falsely promote.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-18T14:27:00Z
- **Completed:** 2026-07-18T14:51:36Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Created eight ordered UAT scenarios covering macOS published/unpacked ids, Linux Chrome, Windows x64 registry views, Windows arm64 bootstrap behavior, Chrome lifecycle outcomes, rendered visual modes, and keyboard/screen-reader behavior. Every scenario is unchecked, `human_needed`, `pending`, and evidence-empty.
- Added a focused Phase 63 runner that snapshots the entire pre-existing `mcp/build/**` graph, unrelated dirty files, untracked state, and raw Git index; delegates one closed compiled command sequence to the inner build preserver; and verifies exact restoration after completion.
- Inserted the five Phase 63 root gates exactly once after the sole MCP build and before dependent MCP seams, while CI retains one Linux `npm test` invocation plus its separate Windows/runtime artifact jobs.
- Reconciled all 30 PLAN tasks to one exact validation row and added mechanical coverage for NATIVE-01..04, derived D63-01..25, T63-01..12, eight ASVS themes, source/compiled topology, package/install/doctor/wake/UI boundaries, deferred scope, future reviews, full-suite work, and UAT honesty.
- Extended version parity to require the exact seven-file source/compiled host graph, four-file source/compiled installer graph, integration outputs, closed boundary modes, and a single non-shell build-preserving lifecycle.

## Task Commits

Each task was committed atomically:

1. **Task 63-10-01: Add the deferred native-host UAT ledger and honesty parser** — `a53a1819` (test)
2. **Task 63-10-02: Wire the guarded focused, root, and CI native-host matrix** — `34cbae46` (test)
3. **Task 63-10-03: Reconcile validation and the final mechanical phase contract** — `894bbea4` (test)

## Files Created/Modified

- `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` — Holds the single pending eight-scenario milestone-end live-evidence queue.
- `scripts/run-phase63-focused-tests.mjs` — Runs the complete source/package/compiled/extension matrix while proving workspace and index identity.
- `.planning/phases/63-native-messaging-host/63-VALIDATION.md` — Maps every task and exact automated command, marks Plans 01-10 green, and leaves review/full-suite work pending.
- `package.json` — Places five Phase 63 gates in one ordered slot after the sole MCP build.
- `.github/workflows/ci.yml` — Names the sole Linux Phase 63 root invocation without duplicating the focused runner.
- `tests/delegation-phase-contract.test.js` — Enforces UAT honesty plus the complete Phase 63 task/requirement/decision/threat/ASVS/authority/UI/deferred contract.
- `tests/mcp-version-parity.test.js` — Pins package identities and the fresh source/compiled graph and wrapper lifecycle.

## Decisions Made

- Kept UAT ledger validation as a narrow section so ordinary task verification can prove deferral integrity without invoking the full cross-phase contract.
- Made the focused runner the only outer orchestrator and the existing Plan 01 build preserver the only MCP builder. Source and compiled boundary checks therefore occur exactly once in their natural prebuild/build positions.
- Compared validation rows to commands parsed from every PLAN file instead of maintaining a second hardcoded 30-command list. Removing, duplicating, or altering either side now fails the contract.
- Allowed future Plan 11-12 validation states to advance from pending to green only as their verifier/evidence appears, so this permanent root contract does not freeze the phase in its Plan 10 intermediate state.

## Security and Evidence Boundary

- The mechanical contract covers all twelve threat owners and V2/V3/V4/V5/V7/V12/V13/V14, including serve-only authority, product/protocol health, lock coalescing, bundled runtime integrity, Windows PE requirements, exact ownership, diagnostics redaction, boot/offline gating, intent replay, and lifecycle-to-delegation separation.
- Source and compiled native graphs are exact positive rosters. Historical shims, batch/command/SEA fallbacks, direct agent authority, side-panel native authority, path/secret browser projection, additional CTA/live-region UI, and deferred pairing/remote/broker/multi-browser scope fail the contract.
- All real OS, Chrome, rendering, focus, and assistive-technology results remain human evidence. No mock, adapter, DOM, source, or pack result is represented as a live pass.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first final-contract calibration used wording patterns that did not exactly match four existing focused-runner declarations and two fixture labels. The implementation evidence was already correct; the assertions were narrowed to the actual command block and repository wording before the required gate ran green.
- The shared worktree retained extensive unrelated planning deletions and unrelated generated/build modifications. Every commit used exact-path staging, and both focused wrappers proved those bytes and the raw index unchanged.

## User Setup Required

None - no external service configuration was performed during automated execution.

## Verification

- `node tests/delegation-phase-contract.test.js --section phase63-uat-ledger` — PASS: 87/87.
- `node tests/delegation-phase-contract.test.js --section phase63-final-contract` through the build preserver — PASS: 200/200.
- `node scripts/run-phase63-focused-tests.mjs` — PASS: all wrapper negative fixtures, package/runtime checks, four focused native suites, extended background/diagnostics/install/UI/topology/version/phase seams, and complete workspace identity.
- Required paired command through `scripts/run-mcp-build-preserving-workspace.mjs` — PASS: Phase 61-63 contract 1015/1015 and version/build parity 142/142 in one fresh compiled lifecycle.
- Source and compiled native-host boundaries — PASS.
- Final build graph, unrelated dirty bytes, untracked listing, and raw Git index — exact pre-run identity restored.

## Known Pending Evidence

- All eight `63-HUMAN-UAT.md` scenarios remain pending for the single user-directed v0.9.91 milestone-end sweep.
- Independent code, security, and UI source reviews remain Plan 63-11 work.
- The reviewed focused gate and workspace-preserving repository-wide regression remain Plan 63-12 work.

## Next Phase Readiness

- Plan 63-11 can freeze the implementation diff and run its independent code, ASVS security, and six-pillar UI source reviews against the complete deterministic evidence set.
- No automated blocker remains. Review artifacts and the guarded full-suite rows are intentionally still pending.

## Self-Check: PASSED

- All three task commits are present and contain only their intended exact-path scope.
- Both created files and all five modified contract/config files exist and are committed.
- The plan-level paired verification passed inside one build-preserving lifecycle with protected workspace and index identity restored.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-18*
