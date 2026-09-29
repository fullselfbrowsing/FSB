---
phase: 65-codex-adapter
reviewed: 2026-07-22
status: all_fixed
findings_in_scope: 2
fixed: 2
skipped: 0
commits:
  UI65-W01: 4bf359a5
  UI65-W02: 7fde3f2f
test_evidence:
  focused: passed
  phase65_full: passed
human_uat:
  scenarios: 3
  status: pending
---

# Phase 65 UI Review Fixes

Both source-actionable warnings from `65-UI-REVIEW.md` are fixed. This ledger records automated evidence only; it does not promote the three deferred human UAT scenarios.

## UI65-W01 — Closed Codex auth recovery reasons

**Status:** Fixed in `4bf359a5` (`fix(ui): preserve closed Codex auth recovery reasons`).

The background now derives a closed auth state from the safe merged provider row and passes only that repository-owned enum into preflight. Preflight distinguishes missing accepted identity caused by `unauthenticated` from `unknown`, while malformed or unsupported values retain the generic provider-status fallback. The side panel validates only the closed recovery-code vocabulary and renders the approved shared recovery card:

- `Codex cannot start this task`
- `Sign in to Codex first. Open provider setup, refresh status, then try this message again.`
- `Codex sign-in status could not be verified. Open provider setup, refresh status, then try this message again.`
- `Open provider setup` and `Back to message`

No native auth bytes, provider-specific renderer, or client-supplied authority enters this path. Focus remains on the recovery heading and the run does not start optimistically.

Focused evidence passed:

- Codex preflight/routing coverage
- background-owned auth-authority coverage: 35 passed, 0 failed
- shared side-panel DOM recovery coverage
- providers logic and Providers UI suites
- background dispatch: 355 passed, 0 failed
- provider parity: 109 passed, 0 failed

## UI65-W02 — Tool payload exclusion from presentation

**Status:** Fixed in `7fde3f2f` (`fix(ui): exclude tool payloads from delegation presentation`).

The canonical persisted and feed-facing tool shape now contains only approved metadata: call id, tool name, reported tab, status, and duration. Tool arguments and results are ignored at projection, omitted from validation and persistence, and never rendered. The visible `Arguments` definition row was removed.

Hydration accepts legacy own-data rows containing `argsSummary` without inspecting, stringifying, cloning, or exposing that value. It reconstructs the canonical tool row and rewrites sanitized storage. Hostile argument/result extras are rejected at the feed boundary, leaving no text, attributes, live-region content, or presentation snapshot containing the payload.

Focused evidence passed:

- delegation event store: 35 passed, 0 failed
- delegation controller: 41 passed, 0 failed
- delegated provider parity: 36 passed, 0 failed
- shared side-panel hostile-payload DOM coverage
- Phase 65 validation: 41 passed, 0 failed

## Full verification

The exact required command passed with exit code 0:

```text
node tests/phase65-full-tests-harness.test.js && node scripts/run-phase65-full-tests.mjs
```

The runner concluded:

```text
[phase65-full-tests] PASS: focused, extension, and root matrices passed with workspace identity preserved
```

The Phase 65 harness also reported all assertions passed. The MCP build preserver confirmed that generated workspace identity remained preserved.

## Human evidence boundary

`65-HUMAN-UAT.md` remains authoritative and unchanged. UAT65-01, UAT65-02, and UAT65-03 remain exactly `human_needed`, `pending`, and evidence-empty for the user-directed milestone-end sweep.
