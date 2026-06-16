---
phase: 14-trigger-survivability-foundation
plan: 01
subsystem: infra
tags: [chrome-storage-session, mv3-survivability, trigger, versioned-envelope, node-mock, tdd]

# Dependency graph
requires:
  - phase: (none - first plan of phase 14; clones a shipped v0.9.60 module)
    provides: extension/utils/mcp-task-store.js (versioned-envelope chrome.storage.session store pattern)
provides:
  - "extension/utils/trigger-store.js: survivable chrome.storage.session store for trigger snapshots (single versioned envelope key fsbTriggerRegistry, shape {v:1, records:{[trigger_id]: snapshot}})"
  - "FsbTriggerStore public API: writeSnapshot / readSnapshot / deleteSnapshot / listArmedSnapshots / hydrate + FSB_TRIGGER_REGISTRY_STORAGE_KEY + FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION"
  - "tests/trigger-store.test.js: 10-case Node-mock envelope-discipline suite, wired into the npm test chain"
affects: [14-02-trigger-lifecycle, 15-fire-condition-engine, 18-shared-tool-registry]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Versioned-envelope chrome.storage.session store (clone of mcp-task-store.js): empty-records-removes-key, canonical-empty-on-anything-wrong read, best-effort no-throw, V5 !string/!object silent no-op"
    - "Lazy _getChrome() Node-mock seam + freshRequireStore() cache-bust (resolve globalThis.chrome at call time so tests inject a mock after require())"
    - "Dual-export IIFE: global.FsbTriggerStore = exportsObj (SW importScripts) + module.exports = exportsObj (Node test)"

key-files:
  created:
    - extension/utils/trigger-store.js
    - tests/trigger-store.test.js
    - .planning/phases/14-trigger-survivability-foundation/deferred-items.md
  modified:
    - package.json

key-decisions:
  - "trigger-store.js is a verbatim clone of mcp-task-store.js with exactly the 6 enumerated changes (constants, param rename taskId->triggerId, list-filter rename listInFlightSnapshots->listArmedSnapshots with status==='armed', export/global names, doc-comment schema). Proven by structural diff: code bodies byte-identical after inverse-rename."
  - "Per D-12, chrome.storage.session is used directly (NOT the Lattice SurvivabilityAdapter); survival is session-only (SURV-FUTURE-01)."
  - "agent_id stored faithfully (V4); condition/selector/baseline/last_value persisted verbatim but reserved (Phase 15+ interprets them)."
  - "Followed TDD for Task 1: RED (failing test, module absent) -> GREEN (clone lands, 10/10 pass)."

patterns-established:
  - "Single-envelope trigger registry under fsbTriggerRegistry (NOT the per-entity-key pattern of the visual lifecycle); reconcile reads the whole envelope via one-shot hydrate()."
  - "npm test chain append discipline: a new test file is silently never run unless appended to the && chain; verified with grep -c returning 1."

requirements-completed: [SURV-01]

# Metrics
duration: 5min
completed: 2026-06-16
---

# Phase 14 Plan 01: Trigger Survivability Foundation (trigger-store) Summary

**Survivable `chrome.storage.session` trigger store `extension/utils/trigger-store.js` — a verbatim clone of `mcp-task-store.js` (single versioned envelope `fsbTriggerRegistry`, empty-removes-key + canonical-empty + no-throw discipline), with a 10-case Node-mock test wired into the npm test chain.**

## Performance

- **Duration:** ~5 min (285s)
- **Started:** 2026-06-16T04:22:10Z
- **Completed:** 2026-06-16T04:26:55Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Created `extension/utils/trigger-store.js` (200 lines): the SURV-01 storage substrate that lives OUTSIDE the MV3 service-worker heap. `readSnapshot` always re-reads from `chrome.storage.session`, so an armed trigger's snapshot survives SW eviction (deterministically proven by the Node-mock tests, where there is no SW heap).
- Cloned `tests/mcp-task-store.test.js` to `tests/trigger-store.test.js` (10 trigger-adapted cases), all green: module_exports, write_envelope_v1, read_unknown_returns_null, read_round_trip, list_armed, delete_snapshot_removes_key_when_empty, delete_snapshot_keeps_key_when_others_exist, hydrate_returns_records, version_mismatch_returns_empty, chrome_unavailable_no_throw.
- Wired `tests/trigger-store.test.js` into the `package.json` `"test"` `&&` chain (now index 131; chain grew 130 -> 131 with no entry reordered/removed), leaving the tail slot open for `trigger-lifecycle.test.js` (Plan 14-02).
- Verified envelope discipline byte-for-byte against the clone target: structural diff shows the code body is identical to `mcp-task-store.js` after inverse-renaming the 6 enumerated changes.

## Task Commits

Each task was committed atomically (Task 1 followed TDD: test -> feat):

1. **Task 1 (RED): failing trigger-store test** - `9cc5e7a6` (test)
2. **Task 1 (GREEN): implement trigger-store.js** - `d2192297` (feat)
3. **Task 2: wire trigger-store.test.js into npm test chain** - `b536c339` (chore)

**Plan metadata:** (final docs commit — this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md + deferred-items.md)

## Files Created/Modified
- `extension/utils/trigger-store.js` (created) - Versioned-envelope `chrome.storage.session` store for trigger snapshots; `FsbTriggerStore` dual-export; clone of `mcp-task-store.js` with the 6 enumerated changes.
- `tests/trigger-store.test.js` (created) - 10-case Node-mock envelope-discipline suite (`freshRequireStore` cache-bust + trigger-schema `makeSnapshot`).
- `package.json` (modified) - Appended `&& node tests/trigger-store.test.js` to the `"test"` chain.
- `.planning/phases/14-trigger-survivability-foundation/deferred-items.md` (created) - Logs the pre-existing, out-of-scope `npm test` chain failure (see Issues Encountered).

## Decisions Made
- **Verbatim clone, 6 changes only:** `trigger-store.js` copies `mcp-task-store.js` exactly, changing only (1) the two constants -> `FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry'` / `FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION = 1`, (2) param `taskId` -> `triggerId`, (3) `listInFlightSnapshots` -> `listArmedSnapshots` filtering `status === 'armed'` (the only behavioral change), (4) `hydrate()` copied verbatim, (5) export/global names -> `FsbTriggerStore` + the two new constants, (6) the header doc-comment -> the D-01 flat-scalar trigger schema. Confirmed via an inverse-rename structural diff (code bodies identical).
- **chrome.storage.session directly (D-12):** no Lattice `SurvivabilityAdapter`; survival is session-only; cross-Chrome-restart resume deferred (SURV-FUTURE-01).
- **agent_id faithful (V4):** stored as-is, never normalized; Phase 18 enforces ownership. `condition`/`selector`/`baseline`/`last_value` persisted verbatim but reserved for Phase 15+.
- **TDD for the store:** RED test committed first (failed with "Cannot find module" — correct reason), then the GREEN implementation.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations were needed; the clone matched the target and all enumerated acceptance criteria passed.

## Issues Encountered

**Pre-existing, out-of-scope `npm test` chain failure (NOT caused by this plan).**
- Task 2's automated verify is `npm test`. The full chain exits 1 because of a single pre-existing failure: `tests/mcp-philosophy-parity-smoke.test.js` -> `Part 9.6 -- REQUIREMENTS.md INV-02 wording extension landed (Phase 10 ceremony Plan 10-03 Task 1)` (`36 PASS / 1 FAIL`).
- This test is at chain index 122; the newly-appended `tests/trigger-store.test.js` is at index 130. The `&&` chain short-circuits at index 122, so the trigger-store test is never reached during the full `npm test` run.
- **Confirmed pre-existing and unrelated:** the test asserts `.planning/REQUIREMENTS.md` INV-02 wording from a v0.10.0 Phase 10 Lattice ceremony — nothing to do with the Phase 14 trigger family. Neither that test nor `REQUIREMENTS.md` was modified by this plan (clean `git status`). It fails identically in isolation with none of this plan's changes in play, and it is the only FAIL in the entire chain.
- **Plan 14-01's wiring is correct despite the short-circuit:** running every chain entry from index 122 to the end (continuing past the pre-existing failure) shows all of them PASS — including `tests/trigger-store.test.js` (10/10, exit 0). No prior test regressed.
- **Disposition:** per the executor SCOPE BOUNDARY rule, this out-of-scope failure was NOT fixed; it is logged in `deferred-items.md` and flagged for the milestone owner / a Phase 10 follow-up. The substantive intent of the Task 2 acceptance criterion ("the newly-wired trigger-store test is included and green, and no prior test regressed") is satisfied.

## Verification Results
- `node tests/trigger-store.test.js` — 10/10 PASS, exit 0 (Task 1 `<automated>`).
- SOURCE greps (Task 1): `fsbTriggerRegistry` count 2 (>=1); const declaration matches; `global.FsbTriggerStore = exportsObj` matches; `listArmedSnapshots` present; `listInFlightSnapshots` count 0 (rename complete); `setInterval` non-comment count 0 (no keepalive — SURV-01/Pitfall #3); `agent_id` count 1 (V4). No `taskId`/`FSB_RUN_TASK`/`FsbMcpTaskStore` leftovers.
- Structural-diff: `trigger-store.js` code body byte-identical to `mcp-task-store.js` after inverse-renaming the 6 changes (clone fidelity proven).
- SOURCE (Task 2): `grep -c "tests/trigger-store.test.js" package.json` returns 1; package.json valid JSON; new entry coexists with prior tail `sidepanel-multi-document-fanout`; chain count 130 -> 131 (no entry dropped).
- BEHAVIOR (Task 2): `npm test` exits 1 ONLY due to the pre-existing out-of-scope Part 9.6 failure (see Issues Encountered); the trigger-store entry and every entry after the pre-existing failure pass when run.
- INV-04 guard: `extension/ai/agent-loop.js` NOT modified (clean `git status`).

## User Setup Required
None - no external service configuration required (`user_setup: []`). This plan installs ZERO packages (clone of an in-tree module; `node` + built-in `assert` only).

## Next Phase Readiness
- `FsbTriggerStore.readSnapshot / writeSnapshot / deleteSnapshot / hydrate / listArmedSnapshots` are ready for Plan 14-02 (`trigger-lifecycle.js`), which arms/clears alarms and calls `restoreTriggersFromStorage` against this store.
- Scope honored: storage substrate only — NO fire-condition operators, NO alarms (14-02), NO concurrency cap, NO MCP/tool surface.
- Concern (carried, not blocking this plan): the pre-existing `mcp-philosophy-parity-smoke.test.js` Part 9.6 failure will short-circuit `npm test` for every subsequent Phase 14 plan until the v0.10.0/Phase 10 REQUIREMENTS.md surface is reconciled. Per-test or chain-tail runs remain a reliable green-signal for trigger work in the meantime.

## Self-Check: PASSED

- Created files verified on disk: `extension/utils/trigger-store.js`, `tests/trigger-store.test.js`, `.planning/phases/14-trigger-survivability-foundation/14-01-SUMMARY.md`, `.planning/phases/14-trigger-survivability-foundation/deferred-items.md`.
- Task commits verified in git log: `9cc5e7a6` (test), `d2192297` (feat), `b536c339` (chore).

---
*Phase: 14-trigger-survivability-foundation*
*Completed: 2026-06-16*
