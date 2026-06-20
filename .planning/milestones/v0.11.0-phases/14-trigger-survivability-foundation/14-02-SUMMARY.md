---
phase: 14-trigger-survivability-foundation
plan: 02
subsystem: infra
tags: [chrome-alarms, mv3-survivability, trigger, lifecycle, reconcile, orphan-sweep, ttl-reap, node-mock, tdd]

# Dependency graph
requires:
  - phase: 14-01-trigger-survivability-foundation
    provides: "extension/utils/trigger-store.js (FsbTriggerStore.readSnapshot / deleteSnapshot / hydrate / writeSnapshot -- single versioned envelope fsbTriggerRegistry)"
provides:
  - "extension/utils/trigger-lifecycle.js: per-trigger chrome.alarms lifecycle (FsbTriggerLifecycle). Idempotent handleTriggerAlarm (re-read storage every tick; noop_no_entry / noop_terminal / reaped_ttl / evaluated_noop), restoreTriggersFromStorage (re-arm survivors with ORIGINAL deadline, drop terminal/expired, getAll() orphan sweep), handleTriggerTabRemoved (scan-by-target_tab_id reap), armTrigger/clearTrigger fire-free plumbing seam."
  - "Exported contracts for Plan 14-03 glue: TRIGGER_ALARM_PREFIX ('fsbTrigger:'), FSB_TRIGGER_DEFAULT_TTL_MS (21600000), TRIGGER_ALARM_MIN_PERIOD_MS/_MINUTES (30s floor), alarmNameForTrigger, handleTriggerAlarm, restoreTriggersFromStorage, handleTriggerTabRemoved."
  - "tests/trigger-lifecycle.test.js: 62-assert Node-mock suite (clone of mcp-visual-tick-lifecycle.test.js chrome mock), wired into the npm test chain."
affects: [14-03-background-glue, 15-fire-condition-engine, 16-live-observe-watch, 17-refresh-poll-watch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-trigger chrome.alarms lifecycle cloned from mcp-visual-session-lifecycle.js with ALL overlay/visual-broadcast coupling stripped (visual feedback is Phase 16)."
    - "Storage-is-truth, re-read-every-tick handler (SURV-02): handleTriggerAlarm reads FsbTriggerStore.readSnapshot on every tick and decides against persisted state, never the SW heap."
    - "Two-way SW-wake reconcile with chrome.alarms.getAll() orphan sweep (D-08): re-arm survivors with ORIGINAL deadline_at, drop terminal/expired, clear orphan fsbTrigger:* alarms with no backing snapshot."
    - "Lazy _getChrome() + _getStore() resolvers (resolve chrome + FsbTriggerStore at call time) so Node-mock tests inject mocks after require()."
    - "Dual-export IIFE: global.FsbTriggerLifecycle = exportsObj (SW importScripts, loaded AFTER trigger-store.js) + module.exports (Node test)."

key-files:
  created:
    - extension/utils/trigger-lifecycle.js
    - tests/trigger-lifecycle.test.js
  modified:
    - package.json

key-decisions:
  - "handleTriggerAlarm adds a terminal-status guard the visual template lacks (noop_terminal on status fired/stopped) -- the idempotent fire-guard (D-09 / Pitfall #16). A terminal no-op does NOT delete the entry or clear the alarm; the terminal transition's own clear path owns that."
  - "restoreTriggersFromStorage uses FsbTriggerStore.hydrate() (one round-trip) instead of chrome.storage.session.get(null)+prefix-filter, and adds the getAll() orphan sweep scoped strictly to TRIGGER_ALARM_PREFIX so foreign alarms (mcpVisualDeath:*, telemetry, reconnect, watchdog) are never swept. Orphan sweep uses an ordered for-loop (not forEach-with-await) per the template style."
  - "FSB_TRIGGER_DEFAULT_TTL_MS = 21600000 (6h) is a single named constant (D-11) so Phase 19's detached-TTL / blocking-ceiling reconciliation is a one-line change. A 30s alarm-floor constant is exported (TRIGGER_ALARM_MIN_PERIOD_MS=30000 + _MINUTES=0.5) for Phase 17 to ENFORCE -- declared only, not enforced here (D-03)."
  - "Exposed fire-free armTrigger(snapshot)=writeSnapshot+createAlarm({when:deadline_at}) and clearTrigger(triggerId)=deleteSnapshot+clearAlarm per RESEARCH Open Q1 -- pure plumbing, ZERO fire logic, gives Phase 15 a clean seam (alarm-name composition + arm shape encapsulated in the lifecycle, not duplicated in the manager)."
  - "Followed TDD for Task 1: RED (failing test, MODULE_NOT_FOUND) -> GREEN (clone lands, 62/62 pass)."

patterns-established:
  - "_getStore() resolves globalThis.FsbTriggerStore at call time, mirroring how the SW importScripts the store BEFORE the lifecycle -- the lifecycle never duplicates the envelope discipline."
  - "Phase 15 SEAM: handleTriggerAlarm returns evaluated_noop for armed-not-elapsed snapshots with an explicit comment marking where the evaluate-and-fire step plugs in; Phase 14 ships zero comparison operators."

requirements-completed: [SURV-02, SURV-03, LIFE-05]

# Metrics
duration: 7min
completed: 2026-06-16
---

# Phase 14 Plan 02: Trigger Survivability Foundation (trigger-lifecycle) Summary

**Per-trigger `chrome.alarms` lifecycle `extension/utils/trigger-lifecycle.js` -- an overlay-stripped clone of `mcp-visual-session-lifecycle.js` over `FsbTriggerStore`: idempotent storage-is-truth `handleTriggerAlarm` (SURV-02), cold-boot `restoreTriggersFromStorage` reconcile with a `chrome.alarms.getAll()` orphan sweep (SURV-03), and absolute-`deadline_at` TTL with three reap paths (LIFE-05), proven by a 62-assert Node-mock suite wired into `npm test`.**

## Performance

- **Duration:** ~7 min (443s)
- **Started:** 2026-06-16T04:35:27Z
- **Completed:** 2026-06-16T04:42:50Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Created `extension/utils/trigger-lifecycle.js` (449 lines): the SURV-02/03 + LIFE-05 survivable alarm scaffold. It clones the alarm/restore/reap/handler SHAPE of `mcp-visual-session-lifecycle.js` while (a) stripping every overlay/visual-broadcast coupling (visual feedback is Phase 16), (b) swapping the per-tab storage key for `FsbTriggerStore` calls, and (c) adding the one genuinely-new piece -- the `chrome.alarms.getAll()` orphan-alarm sweep in reconcile (D-08).
- `handleTriggerAlarm` is the survivable-evaluation harness (D-02): it re-reads the snapshot from `chrome.storage.session` via `FsbTriggerStore.readSnapshot` on EVERY tick, no-ops on missing (`noop_no_entry`) or terminal (`noop_terminal`) snapshots, reaps on elapsed `deadline_at` (`reaped_ttl`), and returns `evaluated_noop` at the marked Phase 15 evaluate-and-fire seam -- with zero comparison operators.
- `restoreTriggersFromStorage` re-arms each non-elapsed `armed` snapshot with its ORIGINAL `deadline_at`, drops `fired`/`stopped`/expired (delete entry + clear alarm), drops malformed (non-finite `deadline_at`), and sweeps orphan `fsbTrigger:*` alarms returned by `getAll()` that have no backing snapshot -- scoped strictly to `TRIGGER_ALARM_PREFIX` so foreign alarms are never touched.
- `handleTriggerTabRemoved(tabId)` hydrates the envelope and SCANS `records` for every snapshot whose `target_tab_id` matches the closed tab (the KEY divergence from the visual template, which clears one per-tab key), reaping exactly those and only those.
- Exposed fire-free `armTrigger`/`clearTrigger` plumbing (RESEARCH Open Q1) giving Phase 15 a clean seam without leaking any fire-condition logic.
- Created `tests/trigger-lifecycle.test.js` (499 lines, 62 asserts across 14 cases A-N): cloned `createStorageArea()` + `createChromeMock()` verbatim from `mcp-visual-tick-lifecycle.test.js` (dropping the fake `sendSessionStatus` global), covering SURV-02 (idempotent re-read + eviction-between-read-and-decision), SURV-03 (re-arm/drop/orphan-sweep/malformed-drop), LIFE-05 (TTL tick / TTL restore / tab-close reap), the no-`setInterval` static assert, and the module surface shape.
- Wired `tests/trigger-lifecycle.test.js` into the `package.json` `"test"` `&&` chain (now the tail, after `trigger-store.test.js`); both Phase 14 trigger test files are now in the chain (Wave 0 gap-trap closed).

## Task Commits

Each task was committed atomically (Task 1 followed TDD: test -> feat):

1. **Task 1 (RED): failing trigger-lifecycle test** - `d207601d` (test)
2. **Task 1 (GREEN): implement trigger-lifecycle.js** - `ea6bac65` (feat)
3. **Task 2: wire trigger-lifecycle.test.js into npm test chain** - `0dd3ac8a` (chore)

**Plan metadata:** (final docs commit -- this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified
- `extension/utils/trigger-lifecycle.js` (created) - Per-trigger `chrome.alarms` lifecycle; `FsbTriggerLifecycle` dual-export; overlay-stripped clone of `mcp-visual-session-lifecycle.js` over `FsbTriggerStore` with the `getAll()` orphan sweep.
- `tests/trigger-lifecycle.test.js` (created) - 62-assert Node-mock suite (cloned chrome mock; `freshRequire` cache-bust for both store + lifecycle).
- `package.json` (modified) - Appended `&& node tests/trigger-lifecycle.test.js` to the `"test"` chain (single targeted line edit; no entry reordered/removed).

## Decisions Made
- **Idempotent fire-guard added beyond the template:** `handleTriggerAlarm` no-ops on `status` `fired`/`stopped` (`noop_terminal`) without deleting the entry or clearing the alarm -- the duplicate-fire/double-clear guard (D-09 / Pitfall #16). The visual template only has `noop_no_entry`; the terminal guard is the trigger-specific addition the fire engine (Phase 15) depends on.
- **`hydrate()` + scoped `getAll()` orphan sweep:** reconcile uses one-shot `FsbTriggerStore.hydrate()` (no N round-trips) and an ordered `for`-loop orphan sweep scoped to `TRIGGER_ALARM_PREFIX`, so `mcpVisualDeath:*` / telemetry / reconnect / watchdog alarms are never swept (verified by Case I asserting a seeded `mcpVisualDeath:55` survives).
- **6h TTL as a single named constant (D-11):** `FSB_TRIGGER_DEFAULT_TTL_MS = 21600000`, plus a 30s alarm-floor (`TRIGGER_ALARM_MIN_PERIOD_MS = 30000` / `_MINUTES = 0.5`) declared for Phase 17 to enforce. Phase 14 arms only one-shot `{ when: deadline_at }` alarms and does not enforce the floor.
- **Fire-free `armTrigger`/`clearTrigger` exposed (RESEARCH Open Q1):** pure plumbing (writeSnapshot+createAlarm / deleteSnapshot+clearAlarm) with zero fire logic -- a clean Phase 15 seam that keeps alarm-name composition and the arm shape encapsulated in the lifecycle.
- **`_getChrome()`/`_getStore()` lazy resolvers:** match the store's `_getChrome()` idiom for cross-module consistency and make both modules Node-mock-testable (resolve `chrome` + `FsbTriggerStore` at call time).
- **TDD for the lifecycle:** RED test committed first (failed with `MODULE_NOT_FOUND` -- correct reason), then the GREEN implementation (62/62).

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations were needed.

One in-task self-correction (not a plan deviation): the first draft of the module's header doc-comment named the stripped overlay symbols (`sendSessionStatus` / `composeSessionShapeFromEntry`) in prose to document what was removed. Task 1's SOURCE acceptance criterion `grep -c "sendSessionStatus\|...|recordVisualSessionTick"` must return 0 and does not exclude comments, so the comment was reworded to "overlay status-broadcast or session-shape-composition code" before the GREEN commit. The module never contained any actual overlay code; only the explanatory prose was adjusted to satisfy the literal grep gate.

## Issues Encountered

None blocking. The full `npm test` chain now runs to completion and exits 0: the pre-existing out-of-scope `mcp-philosophy-parity-smoke.test.js` Part 9.6 failure that short-circuited the chain in Plan 14-01 was resolved by commit `029c809f` ("repoint Phase 10 ceremony smoke to archived v0.10.0 REQUIREMENTS") between plans, so Plan 14-02's Task 2 `npm test` BEHAVIOR criterion is now satisfied end-to-end with no short-circuit. Both trigger tests were confirmed to run inside the chain (store 10/10, lifecycle 62/62) and `trigger-lifecycle` is the chain tail.

## Verification Results
- `node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js` -- store 10/10 + lifecycle 62/62, exit 0 (Task 1 `<automated>`).
- SOURCE greps (Task 1, all pass): `FSB_TRIGGER_DEFAULT_TTL_MS = 21600000` count 1; `TRIGGER_ALARM_PREFIX = 'fsbTrigger:'` count 1; `getAll` count 4 (>=1, D-08); `orphans_cleared` count 4 (>=1); `noop_terminal` count 2 (>=1, D-09); `noop_no_entry` count 3 (>=1); `FsbTriggerStore` references count 10 (storage-is-truth via `_getStore()`); non-comment `setInterval` count 0 (no keepalive, SURV-01/Pitfall #3); overlay-symbol count 0 (overlay stripped, Phase 16 boundary held); `global.FsbTriggerLifecycle = exportsObj` count 2; `restoreTriggersFromStorage|handleTriggerAlarm|handleTriggerTabRemoved` count 11 (>=3).
- BEHAVIOR (SURV-02): Case C calls `handleTriggerAlarm` twice on a `fired` snapshot -> both `noop_terminal`, snapshot NOT deleted, alarm NOT cleared (no double-fire). Case F mutates mock storage between two handler calls (armed -> fired) and asserts the second observes the mutation (`evaluated_noop` -> `noop_terminal`), proving no stale-heap read.
- BEHAVIOR (SURV-03): Case G re-arms a non-elapsed armed snapshot with the ORIGINAL `when` (asserted via `_created()`); Case H drops fired/stopped/expired (delete + `_cleared()`); Case I seeds an `fsbTrigger:<id>` alarm with NO snapshot and asserts it appears in `_cleared()` while a foreign `mcpVisualDeath:55` and the live survivor are NOT swept; Case J drops a malformed (non-finite `deadline_at`) snapshot.
- BEHAVIOR (LIFE-05): Case D ticks past `deadline_at` -> `reaped_ttl` (entry + alarm gone); Case H restore drops an expired-armed snapshot; Case K `handleTriggerTabRemoved(42)` reaps exactly the two tab-42 triggers and leaves tab-99; Case L non-finite tabId -> `{ ok:true, reaped:0 }`.
- SOURCE (Task 2, all pass): `grep -c "tests/trigger-lifecycle.test.js" package.json` returns 1; package.json valid JSON; both `node tests/trigger-store.test.js` and `node tests/trigger-lifecycle.test.js` present (store before lifecycle; lifecycle is the chain tail).
- BEHAVIOR (Task 2): `npm test` exits 0 (full chain green); both trigger tests confirmed run in-chain (store 10/10, lifecycle 62/62). The "17 FAIL" substring matches in the run log are descriptive prose inside PASS lines (e.g. "would have FAILED against pre-Task-1 sidepanel.js"), not real failures -- zero `FAIL:` / `✗` / `failed: [1-9]`.
- INV-04 guard: `extension/ai/agent-loop.js` NOT in this plan's files and NOT touched (verified `git diff --name-only` across the whole plan lists only the three declared files). No fire-condition operators, no concurrency cap, no MCP surface, no `background.js` edits (those are Plan 14-03 / Phase 15+).

## User Setup Required
None - no external service configuration required (`user_setup: []`). This plan installs ZERO packages (clone of in-tree modules; `node` + built-in `assert` only).

## Next Phase Readiness
- `FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX / .handleTriggerAlarm / .restoreTriggersFromStorage / .handleTriggerTabRemoved` are ready for Plan 14-03's three `background.js` glue points (importScripts store-then-lifecycle, onAlarm `startsWith('fsbTrigger:')` branch, bootstrap `restoreTriggersFromStorage()` call, and the `chrome.tabs.onRemoved` listener).
- The `evaluated_noop` seam in `handleTriggerAlarm` and the fire-free `armTrigger`/`clearTrigger` helpers are the clean entry points for Phase 15's trigger-manager (arm/evaluate/fire + concurrency cap).
- Scope honored: alarm lifecycle only -- NO fire-condition operators (Phase 15), NO background.js glue (Plan 14-03), NO MCP surface, NO overlay/visual code (Phase 16), NO refresh-poll periodic clock (Phase 17, which will enforce the exported 30s floor).
- Live-Chrome SW-eviction survival of an armed trigger (14-VALIDATION.md "Manual-Only Verifications") remains a milestone-end Chrome MV3 UAT item; all trigger logic has deterministic Node-mock coverage.

## Known Stubs

None. The `// Phase 15 SEAM` comment in `handleTriggerAlarm` is an intentional, plan-mandated extension point (the plan explicitly directs "leave an explicit comment that Phase 15 plugs the evaluate-and-fire step in HERE"), NOT a stub -- the `evaluated_noop` branch is fully functional behavior for Phase 14's survivable-scaffold scope. `armTrigger`/`clearTrigger` are complete, tested plumbing, not placeholders.

## Self-Check: PASSED

- Created files verified on disk: `extension/utils/trigger-lifecycle.js`, `tests/trigger-lifecycle.test.js`, `.planning/phases/14-trigger-survivability-foundation/14-02-SUMMARY.md`.
- Task commits verified in git log: `d207601d` (test), `ea6bac65` (feat), `0dd3ac8a` (chore).

---
*Phase: 14-trigger-survivability-foundation*
*Completed: 2026-06-16*
