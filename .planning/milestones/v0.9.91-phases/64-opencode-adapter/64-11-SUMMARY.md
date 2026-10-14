---
phase: 64-opencode-adapter
plan: "11"
subsystem: providers-ui
tags: [opencode, providers, compatibility, accessibility, browser-extension]

requires:
  - phase: 64-opencode-adapter
    plan: "06"
    provides: Safe background-validated compatibility projection and durable freshness
  - phase: 64-opencode-adapter
    plan: "09"
    provides: Canonical closed delegation-provider roster and metadata helper
provides:
  - Safe Supported, Degraded, and Unsupported projection through the existing OpenCode Providers row
  - Exact Not reported OpenCode auth and billing copy with fixed provider and Zen destinations
  - Canonical shipped-roster refresh, expiry, and trust coordination without selection or persistence authority
  - Byte-locked visible Providers DOM and CSS with one ordered local helper dependency
affects: [64-12, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Derive shipped UI compatibility membership from the canonical delegation-provider helper
    - Treat missing shipped-row freshness as unknown and use the earliest validated timestamp
    - Snapshot visible UI bytes while allowing only an explicitly stripped nonvisual script dependency

key-files:
  created: []
  modified:
    - extension/ui/control_panel.html
    - extension/ui/providers-panel.js
    - extension/ui/options.js
    - tests/providers-panel-logic.test.js
    - tests/providers-panel-ui.test.js
    - tests/mcp-agent-providers-storage.test.js

key-decisions:
  - "Use the canonical delegation-provider roster for exactly Claude Code and OpenCode compatibility instead of adding an OpenCode renderer branch or widening all agent rows."
  - "Compute UI expiry from the earliest valid shipped-row timestamp and fail closed when either shipped row is absent or malformed."
  - "Keep the visible Providers section and its CSS byte-identical; the only HTML change is the canonical helper script immediately before providers-panel.js and options.js."

patterns-established:
  - "Observational compatibility: refresh and expiry may update only closed compatibility projections, never recommendation, selection, focus, API inputs, dirty state, or storage."
  - "Provider-neutral trust controls: canonical metadata supplies the provider id and label while response handling stays bound to the initiating selection."

requirements-completed: [MULTI-01, MULTI-02, MULTI-03]

duration: 13 min
completed: 2026-07-21
---

# Phase 64 Plan 11: OpenCode Providers Projection Summary

**OpenCode now renders safe compatibility and exact honest account/billing details through its unchanged second Providers row, with canonical roster coordination and no visible layout or CSS change.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-21T10:32:16Z
- **Completed:** 2026-07-21T10:45:20Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 6 implementation/test paths

## Accomplishments

- Promoted only canonical shipped OpenCode evidence to the existing closed `Supported`, `Degraded`, or `Unsupported` display model while Codex remains fail-closed `Unsupported` and all seven API providers retain their exact order and behavior.
- Generalized stale projection, earliest-expiry calculation, degraded summaries, and delegation-trust reset over exactly the canonical Claude Code/OpenCode roster without introducing provider-specific rendering, version parsing, native inspection, or save/selection authority.
- Preserved exact OpenCode Account/Auth `Not reported`, help, `Billing not reported`, approved billing body, and fixed provider/Zen destinations without subscription, price, free, unlimited, account, or provider inference.
- Added the canonical helper before both Providers consumers as the sole HTML delta; cryptographic snapshots prove the visible Providers section and Providers CSS block remain byte-equivalent.
- Expanded static and VM tests across OpenCode success, newer, stale, invalid, failure, timeout, storage fanout, focus, selection, API-value, dirty-state, accessibility, responsive, forced-colors, and reduced-motion contracts.

## Task Commits

Both tasks landed as explicit RED/GREEN pairs:

1. **Providers logic/storage RED** — `eb0dc400` (test; OpenCode safe-state matrix, refresh/expiry/trust invariants, exact copy, and Codex negative)
2. **Providers logic/storage GREEN** — `1dd56da8` (feat; canonical shipped compatibility membership and provider-neutral coordination)
3. **Providers DOM/UI RED** — `1837519e` (test; script dependency, byte snapshots, exact second row, rendering, copy, accessibility, and failure invariants)
4. **Providers DOM/UI GREEN** — `c8d3de8d` (feat; one ordered canonical-helper script dependency)

## Files Created/Modified

- `extension/ui/providers-panel.js` — Accepts closed safe compatibility for exactly the canonical shipped roster while retaining the existing provider definitions and renderer-neutral view models.
- `extension/ui/options.js` — Coordinates trust reset, stale projection, earliest expiry, and degraded summaries over exactly the canonical shipped rows.
- `extension/ui/control_panel.html` — Loads `delegation-providers.js` immediately before the two Providers consumers; no visible markup changed.
- `tests/providers-panel-logic.test.js` — Covers the OpenCode compatibility matrix, exact auth/billing data, canonical roster use, expiry fail-closed behavior, stale projection, trust reset, and forbidden boundaries.
- `tests/mcp-agent-providers-storage.test.js` — Proves stored safe OpenCode evidence reaches the supported view while Codex remains unsupported.
- `tests/providers-panel-ui.test.js` — Locks script order, row structure, HTML/CSS bytes, existing semantics, dynamic OpenCode states/copy, observational refresh behavior, and accessibility/theme/responsive contracts.

## Decisions Made

- Validated shipped compatibility membership through `FsbDelegationProviders.ids()` rather than adding a second provider literal to the compatibility mapper.
- Required both canonical shipped rows to supply valid compatibility timestamps before scheduling expiry; the earliest timestamp wins so no row can remain supported beyond its safe window.
- Reused the existing details `<dl>`, compatibility badges/descriptions, evidence nodes, radio, refresh action, and live region. No OpenCode node, class, CSS rule, logo, version badge, or renderer branch was added.
- Retained the existing single primary billing anchor in the detail DOM and kept the approved optional Zen destination in the canonical OpenCode definition without adding visible structure.

## Security and Verification

- **T64-05 (HIGH, compatibility tampering): mitigated.** Only exact background-projected status/reason/timestamp combinations enter the closed view model; malformed, missing, unshipped, or Codex evidence fails closed.
- **T64-10 (CRITICAL, Providers disclosure): mitigated.** UI and storage tests reject accessors/prototype tricks and forbid version, range, path, topology, port, secret, native model/provider, prompt, and task data from the presentation boundary.
- Refresh success, failure, timeout, expiry, and storage fanout preserve selected radio, focus, row order, recommendation, provider kind/id, all API values, dirty state, auth/billing, and storage-write count.
- No HIGH or CRITICAL finding was accepted.

Final verification receipts:

- `node tests/providers-panel-logic.test.js` — **PASS**.
- `node tests/mcp-agent-providers-storage.test.js` — **PASS**.
- `node tests/providers-panel-ui.test.js` — **PASS**.
- Combined production syntax plus all three required suites — **PASS**.
- `node tests/mcp-client-merged-view.test.js` — **PASS**.
- Scoped `git diff --check`, stub scan, exact six-path change audit, HTML-only-one-line assertion, visible-section hash, and Providers-CSS hash — **PASS**.

## Deviations from Plan

None. The implementation stayed within the six declared paths, used the prescribed RED/GREEN sequence, and added no visible structure, CSS, native field, version policy, or provider-specific rendering branch.

## Issues Encountered

- The optional legacy `node tests/delegation-phase-contract.test.js` audit reports 1,043 passes and four stale/baseline source-pin failures. Two drift-diagnostics exact-string failures already existed at the starting revision because that source uses a multiline `REQUIRED_KEYS` declaration. Two Providers pins still expect the prior Claude-only trust literal and assume nothing appears between `AGENT_PROVIDER_IDS` and `COMPATIBILITY_UNSUPPORTED_REASONS`; this plan intentionally generalized trust and inserted canonical-helper bootstrap code. The required Plan 64-11 suites and merged-view regression remain green. Plan 64-13 should update those integration source pins in its owned audit work.

## User Setup Required

None - no dependency, credential, account, browser, executable, or external-service configuration was added.

## Next Phase Readiness

- Plan 64-12 can consume the same canonical OpenCode label and honest unknown billing through provider-neutral delegated-run UI.
- Plan 64-13 has deterministic Providers logic/storage/UI coverage plus the exact legacy audit pins that need reconciliation before the milestone full-suite gate.
- Genuine installed OpenCode rendering and keyboard/screen-reader behavior remain honestly deferred to the milestone-end human UAT ledger.
- No Plan 64-11 blocker remains.

## Self-Check: PASSED

- All six declared implementation/test paths exist and are clean after four atomic RED/GREEN commits.
- Exact task commands, combined syntax/focused tests, merged-view regression, byte snapshots, source-security scans, and HIGH/CRITICAL threat mitigations pass.
- Shared planning/state files and all unrelated dirty workspace paths remained untouched and unstaged.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-21*
