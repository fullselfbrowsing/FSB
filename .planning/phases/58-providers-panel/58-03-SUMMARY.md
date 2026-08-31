---
phase: 58-providers-panel
plan: "03"
subsystem: ui
tags: [chrome-mv3, provider-evidence, accessibility, billing-integrity, regression-testing]

requires:
  - phase: 57-agent-identity-capture
    provides: Canonical merged clicked, installed, connected, and live MCP-client evidence
  - phase: 58-providers-panel
    provides: Closed provider definitions and the kind-aware Providers chooser from Plans 01-02
provides:
  - Defensive coalesced Phase 57 evidence refresh with deterministic advisory recommendation
  - Honest selected-agent installation, connection, account, setup, usage, and billing detail
  - Polite background status plus one explicit alert for manual refresh failure
  - Focused and clean-worktree regression evidence with an explicit human-needed visual checklist
affects: [phase-59, phase-61, phase-62, phase-64, phase-65, providers-panel]

tech-stack:
  added: []
  patterns: [snapshot-preserving advisory refresh, frozen provider billing definitions, dedicated status live region, clean-worktree verification]

key-files:
  created:
    - .planning/phases/58-providers-panel/58-VISUAL-QA.md
  modified:
    - extension/ui/providers-panel.js
    - extension/ui/control_panel.html
    - extension/ui/options.css
    - extension/ui/options.js
    - tests/providers-panel-logic.test.js
    - tests/providers-panel-ui.test.js

key-decisions:
  - "Treat Phase 57 evidence as advisory state only: refresh can change evidence and one recommendation badge, never selection or saved settings."
  - "Keep auth independent from observed client evidence; absent Phase 57 auth renders Billing not reported and only explicit future modes can claim subscription or provider billing."
  - "Use a dedicated live region so background failures remain polite status while an explicit manual refresh failure becomes one assertive alert."

patterns-established:
  - "Snapshot-safe refresh: retain the last successful clients/recommendation on transport failure and mark it stale."
  - "Evidence/auth separation: clicked, installed, connected, and live records cannot imply account type or billing mode."
  - "Visual honesty: unavailable browser judgments are recorded per item as human_needed rather than inferred from source or DOM tests."

requirements-completed: [PROV-03, PROV-05, PROV-06]

duration: 30 min
completed: 2026-07-12
---

# Phase 58 Plan 03: Provider Evidence and Honest Agent Details Summary

**Live Phase 57 evidence now drives one failure-safe advisory recommendation and provider details that never fabricate auth, subscription inclusion, usage, or cost**

## Performance

- **Duration:** 30 min
- **Started:** 2026-07-12T21:22:50Z
- **Completed:** 2026-07-12T21:52:43Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added a bounded `{ action: 'getMcpClients' }` refresh path with in-flight coalescing, load/section/storage/manual triggers, retained snapshots on failure, stale/unavailable states, and no polling or disk-scan path.
- Rendered exactly one allowlisted advisory recommendation through the fixed live > installed > clicked > xAI cascade without changing the checked provider, API values, Save state, or storage.
- Rendered supported-client evidence, a safely text-populated unsupported-client disclosure, and the exact no-agent empty state while distinguishing live connection from durable historical evidence.
- Completed selected-agent details with unknown-account disclosure, setup guidance, three unknown usage metrics, provider-specific frozen billing copy/links, and conditional billing derivation that refuses to infer auth from evidence.
- Passed the full focused compatibility cluster and a clean-worktree root suite at the committed source HEAD; recorded every unavailable live-browser judgment as `human_needed` with exact steps.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refresh Phase 57 evidence defensively and render exactly one independent recommendation** - `63de5138` (feat)
2. **Task 2: Render honest agent account, setup, usage, and provider-specific billing states** - `1f919d84` (feat)
3. **Task 3: Run focused/full regressions and record honest browser visual QA** - `595fd414` (docs)

## Files Created/Modified

- `.planning/phases/58-providers-panel/58-VISUAL-QA.md` - Exact focused/clean-suite evidence and per-item `human_needed` browser procedures.
- `extension/ui/providers-panel.js` - Pure conditional billing-label contract alongside the closed provider definitions and evidence helpers.
- `extension/ui/control_panel.html` - Provider refresh live region and explicit unknown-account helper text.
- `extension/ui/options.css` - Token-based status/alert and helper styles with dark, compact, and reduced-motion coverage.
- `extension/ui/options.js` - Runtime/storage refresh, recommendation/evidence/detail rendering, status announcements, and existing-onboarding setup action.
- `tests/providers-panel-logic.test.js` - Closed billing-mode, unknown-auth, non-inference, and immutable-definition assertions.
- `tests/providers-panel-ui.test.js` - Static and VM coverage for evidence refresh, non-mutation, agent details, official links, setup destination, accessibility, and responsive/theme/motion contracts.
- `tests/mcp-client-merged-view.test.js` - Revalidated unchanged Phase 57 seven-field response compatibility; no source edit was needed.

## Decisions Made

- Phase 57 exposes no auth field, so the current renderer deliberately calls `getBillingLabel(undefined)` and shows `Billing not reported`. Future explicit `subscription`, `api`, `credits`, `zen`, or `provider` modes are covered without being displayed as present fact.
- A dedicated `#providerEvidenceAnnouncement` region owns refresh semantics. Normal/background updates use `role="status"`; only an explicit user-triggered failure uses `role="alert"`, leaving the full details region polite.
- The setup action resolves the shipped `ui/onboarding.html` extension URL and opens it through `chrome.tabs.create`, with a window fallback; it never embeds or runs a shell command.
- The unavailable in-app Browser was treated as an evidence limitation, not a product failure and not permission to infer visual acceptance.

## Deviations from Plan

None - plan behavior and test scope were implemented as specified.

## Issues Encountered

- The shared Conductor worktree intentionally lacks the old Phase 39 coverage manifest. Full-suite gates temporarily linked the identical archived v1.0.0 milestone copy and removed the link afterward, preserving the user's deletions.
- The first clean-worktree dependency provisioning used symlink paths with one extra parent segment, so the environment stopped at `tsc: command not found` with exit `127`. Corrected ignored dependency links restored `tsc`/Angular executables; a clean pre-test status was reconfirmed and the complete suite then exited `0`.
- The in-app Browser runtime initialized, but browser discovery returned `[]` after its troubleshooting flow. No live visual item or screenshot was claimed; `58-VISUAL-QA.md` records exact human reproduction for each item.

## Verification

- `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js` - PASS.
- Focused eight-command provider/model/Lattice/MCP/sunset/LM Studio compatibility cluster - PASS, exit `0`.
- Shared-worktree `npm test` with the temporary archived Phase 39 manifest link - PASS, exit `0`.
- Clean detached worktree `npm test` at `1f919d842fd2b793434c4b5432ba397c41cb3d4b` - PASS, exit `0`.
- `git diff --check` - PASS.
- Live browser visual QA - `human_needed`; no Browser backend was available.

## Requirement Tracking

- This plan's declared requirements are PROV-03, PROV-05, and PROV-06 and are recorded in summary frontmatter as required by the execution contract.
- `.planning/REQUIREMENTS.md` remains unchanged and all Phase 58 requirements remain Pending until independent phase verification resolves the roadmap success criteria.

## Known Stubs

- Tokens, Turns, and Duration intentionally remain em dashes with `No delegated runs yet` until Phase 61 supplies real delegated-run data.
- Account and billing auth intentionally remain `Not reported` until a later adapter provides explicit auth metadata.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three Phase 58 plans are executed and automated acceptance is green; the phase is ready for independent verification without pre-marking PROV requirements complete.
- Live visual checks remain `human_needed` with exact procedures in `58-VISUAL-QA.md`.
- After verification, Phase 59 can plan the security-critical reverse-request channel while preserving the completed Providers surface and BYOK isolation.

## Self-Check: PASSED

- Summary and all declared deliverables exist on disk.
- Task commits `63de5138`, `1f919d84`, and `595fd414` exist in git history.
- Focused and clean-worktree root-suite claims match successful command results.
- The temporary Phase 39 fixture and clean verification worktree are absent.
- `.planning/REQUIREMENTS.md` was not changed, and unrelated dirty files remain unstaged.

---
*Phase: 58-providers-panel*
*Completed: 2026-07-12*
