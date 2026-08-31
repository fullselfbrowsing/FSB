---
phase: 65-codex-adapter
plan: "07"
subsystem: durable-delegation-presentation
tags: [codex, accepted-identity, billing, hydration, accessibility, responsive-ui]

requires:
  - phase: 65-codex-adapter
    plan: "01"
    provides: Immutable accepted identity in controller snapshots and durable ledgers
  - phase: 65-codex-adapter
    plan: "06"
    provides: Canonical Codex ChatGPT/API-key identity and shared Providers UI authority
provides:
  - Accepted-identity-driven shared feed validation and exact Codex billing captions
  - Provider-neutral init presentation with real internal profiles and no visible Profile row
  - Minimum 44px shared delegated actions and a 44px-square delegated fixed Stop
affects: [65-08, phase65-runner, delegated-agent-ui, human-uat]

tech-stack:
  added: []
  patterns:
    - Cross-check every visible snapshot field against one persisted accepted identity before rendering
    - Select billing copy by accepted auth/billing pair while keeping dollar formatting outside controller snapshots
    - Scope target-size overrides to delegated controls so legacy composer behavior remains unchanged

key-files:
  created: []
  modified:
    - extension/ui/delegation-feed.js
    - extension/ui/sidepanel.js
    - extension/ui/sidepanel.css
    - tests/delegation-controller.test.js
    - tests/delegation-event-store.test.js
    - tests/delegation-sidepanel-ui.test.js
    - tests/provider-parity.test.js
    - tests/providers-panel-ui.test.js

key-decisions:
  - "Require the exact five-field accepted identity at the feed snapshot boundary and reject provider, profile, auth, billing, or USD drift before DOM mutation."
  - "Keep the shared standalone summary API compatible, but make every controller snapshot render pass accepted identity so Codex API-key runs cannot reach the generic dollar formatter."
  - "Treat immediate start rejection as stale consent: clear the local challenge and show provider-neutral refresh/review recovery copy."
  - "Raise only shared delegated actions and the data-attributed delegated fixed Stop; retain the 36px legacy composer control rule."

patterns-established:
  - "Durable presentation authority: acceptedIdentity validates the provider projection, init profile, result metrics, and summary billing as one unit."
  - "Internal-only compatibility profile: real profileVersion remains non-null through controller and hydration while the init definition list omits both Profile term and value."

requirements-completed: [MULTI-04, MULTI-05, MULTI-06]

duration: 21m
completed: 2026-07-22
---

# Phase 65 Plan 07: Durable Delegated Presentation Summary

**Claude Code, OpenCode, and Codex now share one durable accepted-identity feed: real profiles stay internal, Codex billing remains exact and dollar-free, and every delegated action meets the 44px target contract.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-22T14:10:58Z
- **Completed:** 2026-07-22T14:32:24Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Required and canonically validated `acceptedIdentity` in every renderable controller snapshot, then cross-checked provider, init client/profile, result billing, summary billing, and `usd:null` before any DOM update.
- Removed the shared visible Profile definition while retaining real non-null Claude Code 2.1.177, OpenCode 1.14.25, and Codex 0.142.5 profiles through start and silent hydration.
- Rendered exact accepted ChatGPT and API-key billing captions through the generic summary path; Codex controller snapshots cannot invoke the legacy dollar formatter.
- Preserved the authoritative-terminal barrier so result and Run summary remain absent for candidate, drift, nonzero/signal, and other failed settlement paths.
- Cleared stale local consent after immediate start rejection and reused the provider-neutral setup/refresh/review recovery surface.
- Raised all `.delegation-action` targets to at least 44px, made only the delegated fixed Stop 44px square, and kept narrow full-width stacking, focus, disabled state, themes, forced colors, reduced motion, provider wrapping, and legacy composer dimensions intact.

## Task Commits

Each task was committed atomically:

1. **Render durable Codex identity and honest summaries without a visible Profile row** — `382f2d81` (feat)
2. **Raise every shared delegated action target to 44px and preserve responsive accessibility contracts** — `0ec12c23` (fix)

## Files Created/Modified

- `extension/ui/delegation-feed.js` — Validates persisted accepted identity, rejects cross-field drift/USD, removes Profile presentation, and selects exact accepted billing copy.
- `extension/ui/sidepanel.js` — Clears stale consent and renders refresh/review recovery after immediate start rejection.
- `extension/ui/sidepanel.css` — Supplies 44px shared actions, a delegated-only 44px fixed Stop, and explicit 44px narrow targets.
- `tests/delegation-controller.test.js` — Covers both Codex identities through start, streaming result, authoritative terminal, hydration, and drift rejection.
- `tests/delegation-event-store.test.js` — Covers durable Codex auth/billing/profile round trips, terminal exclusion, hostile identity records, and event USD rejection.
- `tests/delegation-sidepanel-ui.test.js` — Uses real controller snapshots for all three adapters and protects DOM parity, hidden profiles, exact captions, terminal gating, hydration silence, recovery, action semantics, responsive targets, focus, theme, and motion contracts.
- `tests/provider-parity.test.js` — Updates the exact three-agent roster and proves shared accepted-identity/feed behavior without a Codex renderer branch.
- `tests/providers-panel-ui.test.js` — Cross-pins the existing <=640px provider wrapping with delegated target, focus, narrow-layout, and reduced-motion contracts.

## Decisions Made

- Controller and event-store production code required no migration in this plan: Plan 01 already made the exact five-field identity mandatory and deliberately rejects pre-identity ledgers rather than reconstructing auth or billing.
- Feed validation may consult the canonical validator to reject malformed persisted identity, but visible captions are selected from the validated persisted `authState` and `billingKind`, never current provider selection or streamed metadata.
- The standalone `renderSummary(summary)` compatibility path remains available to existing direct callers. The controller-snapshot path always calls `renderSummary(summary, acceptedIdentity)` and requires `usd:null`, which structurally excludes Codex from dollar formatting.
- The fixed Stop override keys on `data-delegation-action="stop"`; removing that attribute on terminal/API restoration immediately returns the control to its unchanged legacy dimensions and behavior.

## Verification

- Exact Task 01 command — **PASS**: controller **2 passed, 0 failed**; event store **2 passed, 0 failed**; side-panel UI **PASS**; delegated provider parity **36 passed, 0 failed**.
- Exact Task 02 command — **PASS**: side-panel UI **PASS** and complete Providers panel static/runtime UI **PASS**.
- Unsectioned controller regression — **41 passed, 0 failed**.
- Preservation-wrapped unsectioned event-store regression — **34 passed, 0 failed** with `[mcp-build-preserver] PASS`.
- Unsectioned provider-parity regression — **109 passed, 0 failed**.
- JavaScript syntax, scoped whitespace, source-branch, visible-Profile, exact-caption, terminal-barrier, target-size, focus, responsive, theme, motion, and hostile-data checks passed.
- No live browser, Codex account, model-backed task, screenshot, credential read, or assistive-technology claim was made; the three Phase 65 human UAT rows remain pending.
- The inherited planning deletions and unrelated dirty artifacts stayed unstaged. Preservation hashes remained:
  - `mcp/build/index.js`: `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`
  - `showcase/angular/public/llms-full.txt`: `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`
  - `showcase/angular/public/llms.txt`: `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`
  - `showcase/angular/public/sitemap.xml`: `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`

## Deviations from Plan

### Existing durable producer authority required no production rewrite

- The plan allowed a controller/store schema migration if needed. The pre-edit audit and focused tests confirmed Plans 01-06 already persist, stream, terminalize, and hydrate the exact five-field Codex identity with null USD.
- Accordingly, this plan added Codex closure tests to those modules and changed only the feed/side-panel consumers. Rewriting the settled producer authority would have duplicated logic without changing the contract.

**Total deviations:** one no-op production migration after verification; no scope, authority, or acceptance-criteria reduction.

## Issues Encountered

- The broad provider-parity suite still constructed agent preflight inputs without the accepted identity that Plan 06 made mandatory. Its shared fixture was updated for all three shipped agents; the complete suite then passed 109/0.
- The event-store broad suite consumes compiled OpenCode parser output, so it was run through the required workspace-preservation wrapper. The wrapper restored the pre-existing generated build byte-for-byte.

## User Setup Required

None - no dependency, account, login, credential, daemon, browser, or external service action is required for this implementation boundary.

## Next Phase Readiness

- Plan 65-08 can run the full source/security/runner closure against the final shared feed and target-size contract.
- Genuine account-state, Codex-to-browser, rendered accessibility, and assistive-technology evidence remain deliberately pending in the milestone-end human UAT ledger.
- No Plan 07 blocker remains.

## Self-Check: PASSED

- Both task commits exist and contain only their declared implementation/test scope.
- Both exact plan commands pass on the final tree, with broad controller/store/provider regressions green.
- Real profiles remain internal, accepted billing survives hydration, Codex USD remains null, premature success is absent, and no Codex-specific feed branch or markup exists.
- Every shared delegated rectangular action is at least 44px high, fixed delegated Stop is 44px square, and legacy composer controls remain unchanged.
- Inherited deletions and unrelated dirty artifacts remain untouched and unstaged.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
