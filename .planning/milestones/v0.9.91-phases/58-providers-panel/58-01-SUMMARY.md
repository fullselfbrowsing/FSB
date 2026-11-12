---
phase: 58-providers-panel
plan: "01"
subsystem: ui
tags: [chrome-mv3, vanilla-js, provider-selection, recommendation, regression-tests]

requires:
  - phase: 57-agent-identity-capture
    provides: Durable clicked, installed, connected, and live MCP-client evidence
provides:
  - Closed API and agent provider domains with fail-closed settings normalization
  - Deterministic live, installed, clicked, then xAI recommendation contract
  - Honest agent status and frozen official billing definitions
  - CSP-safe provider helper load order and permanent root-suite coverage
affects: [58-02, 58-03, providers-panel, options-page, delegated-providers]

tech-stack:
  added: []
  patterns: [pure classic-script IIFE, frozen closed allowlists, advisory evidence isolation]

key-files:
  created:
    - extension/ui/providers-panel.js
    - tests/providers-panel-logic.test.js
  modified:
    - extension/ui/control_panel.html
    - package.json

key-decisions:
  - "Keep modelProvider closed to the existing seven API ids while storing agent intent separately."
  - "Scan recommendation evidence only in fixed Claude Code, OpenCode, Codex order and ignore historical connected evidence."
  - "Treat subscription inclusion as conditional future metadata and freeze provider-specific billing guidance instead."

patterns-established:
  - "Provider-domain purity: deterministic settings, recommendation, status, and definitions remain free of DOM and Chrome APIs."
  - "Evidence isolation: recommendation returns fresh advisory objects and never accepts or mutates settings."

requirements-completed: [PROV-02, PROV-04, PROV-05, PROV-06]

duration: 14 min
completed: 2026-07-12
---

# Phase 58 Plan 01: Pure Provider Domain Contract Summary

**Frozen API/agent provider domains with deterministic evidence-based recommendation, honest billing metadata, and permanent MV3 load-order regression coverage**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-12T20:27:45Z
- **Completed:** 2026-07-12T20:42:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added a frozen classic-script/CommonJS provider helper that keeps seven BYOK API ids and three agent ids structurally separate.
- Locked recommendation priority to live, installed, clicked, then xAI with fixed agent tie order, prototype-safe reads, fresh results, and no selection mutation path.
- Added status derivation that distinguishes current connection from historical evidence and exposes only finite installed check times.
- Frozen four approved HTTPS billing destinations and qualified provider-specific copy without unconditional subscription, zero-cost, or unlimited claims.
- Loaded the helper immediately before `options.js` and made its exhaustive Node contract a permanent serial root-suite gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the closed provider settings, recommendation, status, and billing contracts** - `67bd8d30` (feat)
2. **Task 2: Load and permanently gate the provider helper without changing runtime behavior** - `00c6ab70` (chore)

## Files Created/Modified

- `extension/ui/providers-panel.js` - Pure frozen provider definitions, normalization, recommendation, and status API.
- `tests/providers-panel-logic.test.js` - Table-driven contract, source-purity, script-order, legacy-markup, and root-suite assertions.
- `extension/ui/control_panel.html` - Loads the helper exactly once immediately before options boot.
- `package.json` - Runs the provider contract after MCP client identity integration without changing any other command order.

## Decisions Made

- Valid latent agent selection is preserved while API kind is active, but an invalid active agent fails closed to API kind.
- Only a non-null `live` record means connected now; durable `connected` evidence remains display-only as Seen before.
- Agent definitions describe the account/provider that may incur usage and charges; they do not assert a subscription billing mode before adapter metadata exists.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The pre-existing deletion of `.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md` caused the first raw root-suite run to stop in `coverage-report.test.js`. Each required root-suite gate used a temporary symlink to the identical archived v1.0.0 milestone copy; the link and temporary directory were removed after each run, preserving the user's deletion exactly.

## Verification

- `node tests/providers-panel-logic.test.js` - PASS
- `node tests/model-discovery-ui.test.js` - PASS (79/79)
- `node tests/model-combobox-ui.test.js` - PASS (30/30)
- `node tests/agent-sunset-control-panel.test.js` - PASS
- Task 1 `npm test` - PASS, exit 0
- Task 2 `npm test` with the provider contract in the root command - PASS, exit 0
- `git diff --check 67bd8d30^..00c6ab70` - PASS
- Declared-file audit - PASS; only `control_panel.html`, `providers-panel.js`, `package.json`, and `providers-panel-logic.test.js` changed across task commits.

## Known Stubs

None. Phase 58-01 intentionally ships pure domain contracts and load order; visible provider rows and wiring remain owned by Plan 58-02.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 58-02 to build the accessible provider roster and kind-aware settings UI on the closed helper contract.
- `extension/ai/universal-provider.js` and retired `extension/agents/*` remain untouched.

## Self-Check: PASSED

- Created files exist on disk.
- Task commits `67bd8d30` and `00c6ab70` exist in git history.
- Focused and full-suite claims above were rechecked against command results.
- The temporary Phase 39 test fixture is absent, preserving the pre-existing deletion.

---
*Phase: 58-providers-panel*
*Completed: 2026-07-12*
