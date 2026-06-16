---
phase: 14-trigger-survivability-foundation
plan: 03
subsystem: infra
tags: [mv3-survivability, trigger, background-glue, chrome-alarms, chrome-tabs, service-worker, importscripts, node-mock]

# Dependency graph
requires:
  - phase: 14-01-trigger-survivability-foundation
    provides: "extension/utils/trigger-store.js (global FsbTriggerStore -- versioned-envelope chrome.storage.session store)"
  - phase: 14-02-trigger-survivability-foundation
    provides: "extension/utils/trigger-lifecycle.js (global FsbTriggerLifecycle -- TRIGGER_ALARM_PREFIX / handleTriggerAlarm / restoreTriggersFromStorage / handleTriggerTabRemoved)"
provides:
  - "extension/background.js: four ADDITIVE trigger glue points wiring the two trigger modules into the running service worker -- (0) importScripts trigger-store.js THEN trigger-lifecycle.js; (1) bootstrap restoreTriggersFromStorage() call; (2) onAlarm fsbTrigger: prefix branch -> handleTriggerAlarm (early return); (3) new tabs.onRemoved sibling listener -> handleTriggerTabRemoved."
  - "SURV-01 / SURV-03 / LIFE-05 are now LIVE in the SW: alarm ticks route to the trigger lifecycle, cold-boot runs the reconcile + orphan sweep, tab-close reaps bound triggers."
affects: [15-fire-condition-engine, 16-live-observe-watch, 17-refresh-poll-watch, 18-shared-tool-registry, 19-mcp-tools-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive SW glue mirroring a verified visual-lifecycle sibling: each trigger glue point is byte-shaped to the proven MCPVisualSessionLifecycleUtils template (importScripts try/catch, guard-then-call-then-non-blocking-catch bootstrap, startsWith-prefix onAlarm branch with early return, independent per-concern tabs.onRemoved listener)."
    - "typeof-guard at every SW call site (typeof FsbTriggerLifecycle !== 'undefined') so a module-load failure makes the glue inert rather than crashing SW startup (T-14-12 mitigation)."
    - "No-throw SW listener discipline: onAlarm branch in try/catch + console.warn; onRemoved in Promise.resolve(...).catch (T-14-11 mitigation)."

key-files:
  created:
    - .planning/phases/14-trigger-survivability-foundation/14-03-SUMMARY.md
  modified:
    - extension/background.js
    - tests/lattice-provider-bridge-smoke.test.js
    - .planning/phases/14-trigger-survivability-foundation/deferred-items.md

key-decisions:
  - "All four edits are ADDITIVE and anchored on the adjacent visual-lifecycle SIBLING TEXT (re-confirmed with grep before each edit; the file had shifted vs. the plan's ~line numbers). No existing branch, listener, or importScripts line was modified, reordered, or wrapped -- the three visual siblings remain present exactly once each."
  - "trigger-store.js is imported BEFORE trigger-lifecycle.js (verified by byte-offset: store idx < lifecycle idx) because the lifecycle module resolves FsbTriggerStore at load/runtime (D-07 glue point 0)."
  - "Task 2 (live-Chrome MV3 SW-eviction survival, a checkpoint:human-verify) is DEFERRED to milestone-end Chrome MV3 UAT per 14-VALIDATION.md 'Manual-Only Verifications' and the established v0.10.0 UAT-debt deferral pattern. The autonomous code work is 100% complete and committed; only the live-browser observation is outstanding. Recorded in STATE.md Deferred Items and deferred-items.md."

patterns-established:
  - "When a plan legitimately adds importScripts lines, the background.js importScripts count-guard in tests/lattice-provider-bridge-smoke.test.js must be extended with a per-phase comment entry and a new authorized total (the guard tracks an exact baseline to catch accidental additions)."

requirements-completed: [SURV-01, SURV-03, LIFE-05]

# Metrics
duration: 5min
completed: 2026-06-16
---

# Phase 14 Plan 03: Trigger Survivability Foundation (background glue) Summary

**Wired the two trigger modules into the MV3 service worker at exactly four ADDITIVE glue points in `extension/background.js` -- importScripts (store before lifecycle), bootstrap `restoreTriggersFromStorage()`, an `onAlarm` `fsbTrigger:` prefix branch routing to `handleTriggerAlarm`, and a new `tabs.onRemoved` sibling routing to `handleTriggerTabRemoved` -- each mirroring its verified visual-lifecycle sibling; SURV-01 / SURV-03 / LIFE-05 are now live in the SW, INV-04 held (agent-loop.js byte-untouched, `setTimeout` count 8), and the full `npm test` chain is green.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-16T04:49:52Z
- **Completed:** 2026-06-16T04:55:04Z
- **Tasks:** 2 (Task 1 executed + committed; Task 2 deferred per checkpoint_handling)
- **Files modified:** 3 (1 created, 2 modified) for Task 1 + 1 deferred-log update

## Accomplishments
- **Glue point 0 (importScripts, D-07):** added `try { importScripts('utils/trigger-store.js'); } ...` THEN `try { importScripts('utils/trigger-lifecycle.js'); } ...` directly after the `mcp-task-store.js` import, in the verified try/catch form. Store is imported BEFORE lifecycle (verified by byte-offset: store idx 2766 < lifecycle idx 2897), because the lifecycle resolves `FsbTriggerStore` at load/runtime.
- **Glue point 1 (bootstrap restore, SURV-03):** added the guarded `FsbTriggerLifecycle.restoreTriggersFromStorage().catch(...)` block directly after the visual `restoreVisualSessionLifecyclesFromStorage` block inside the bootstrap async fn -- same guard-then-call-then-non-blocking-catch shape. On cold boot this runs the reconcile (re-arm survivors with original `deadline_at`, drop terminal/expired) + the `getAll()` orphan sweep.
- **Glue point 2 (onAlarm branch, SURV-01):** added a NEW additive branch inside the single `chrome.alarms.onAlarm.addListener` -- `if (... alarm.name.startsWith(FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX)) { try { await FsbTriggerLifecycle.handleTriggerAlarm(alarm); } catch ... return; }` -- placed beside the `MCP_VISUAL_LIFECYCLE_ALARM_PREFIX` branch. The early `return` scopes the trigger concern so the fan-out stops at the matched branch (mirrors the visual branch); existing branches are byte-identical.
- **Glue point 3 (new tabs.onRemoved listener, LIFE-05):** registered a NEW independent `chrome.tabs.onRemoved.addListener((tabId) => { ... })` sibling beside the visual one (FSB already registers multiple per-concern onRemoved listeners at :2691/:2753/:13152/:13169). It guards on `typeof FsbTriggerLifecycle` + the method, then `Promise.resolve(FsbTriggerLifecycle.handleTriggerTabRemoved(tabId)).catch(...)`. Not folded into any existing listener.
- Updated the `tests/lattice-provider-bridge-smoke.test.js` importScripts count-guard to the new authorized baseline (155->157 mentions, 152->154 call sites) with a Phase 14 comment entry -- the only way to keep `npm test` green after a legitimate +2 importScripts addition (see Deviations).

## Task Commits

1. **Task 1: wire the four additive trigger glue points + update the importScripts count-guard baseline** - `06a241e3` (feat)
2. **Task 2 (checkpoint:human-verify): DEFERRED** - no code change; recorded in STATE.md Deferred Items + deferred-items.md (per <checkpoint_handling> / 14-VALIDATION.md Manual-Only Verifications).

**Plan metadata:** (final docs commit -- this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md + deferred-items.md)

## Files Created/Modified
- `extension/background.js` (modified) - Four additive trigger glue points (importScripts store+lifecycle, bootstrap restore call, onAlarm fsbTrigger: branch, tabs.onRemoved trigger listener). No existing branch/listener altered.
- `tests/lattice-provider-bridge-smoke.test.js` (modified) - Extended the background.js importScripts count-guard baseline to 157 mentions / 154 call sites with a Phase 14 comment entry (Rule 3 -- the guard was stale relative to the authorized +2 importScripts addition).
- `.planning/phases/14-trigger-survivability-foundation/deferred-items.md` (modified, appended) - Logged the deferred Task 2 live-Chrome MV3 SW-eviction survival UAT (append only; the pre-existing Plan 14-01 entry was preserved).
- `.planning/phases/14-trigger-survivability-foundation/14-03-SUMMARY.md` (created) - This summary.

## Decisions Made
- **Anchored on sibling TEXT, not stale line numbers:** the plan's `<interfaces>` line estimates (~:22-34, ~:2485-2498, ~:13284-13301, ~:13169-13176) had shifted; each insertion was re-confirmed by grepping the adjacent visual-lifecycle symbol (`mcp-task-store.js`, `restoreVisualSessionLifecyclesFromStorage`, `MCP_VISUAL_LIFECYCLE_ALARM_PREFIX`, `handleVisualSessionLifecycleTabRemoved`) and inserting directly beside it.
- **Store before lifecycle (D-07 glue 0):** ordering verified programmatically (`indexOf('trigger-store.js') < indexOf('trigger-lifecycle.js')` -> true).
- **Guard-then-call shape preserved (matches the verified template + T-14-12):** the bootstrap and tabs.onRemoved glue use the same two-line guard-then-call shape as their proven visual siblings, so `grep -c` of the lifecycle method returns 2 (guard line + call line) for those two points, exactly as the visual template does. The onAlarm branch and TRIGGER_ALARM_PREFIX return 1 (call only; the guard checks `typeof FsbTriggerLifecycle`). See Deviations for the reconciliation of the plan's literal "returns 1" acceptance wording.
- **Task 2 deferred (not blocked):** per the executor's <checkpoint_handling> directive and 14-VALIDATION.md, the live-Chrome MV3 eviction observation is the one behavior the Node-mock cannot reproduce; it is deferred to milestone-end Chrome MV3 UAT (matching the v0.10.0 close, which acknowledged 11 human-gated UAT items as deferred debt). All trigger logic has deterministic Node-mock coverage (Plans 14-01: 10/10, 14-02: 62/62).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Updated the background.js importScripts count-guard baseline**
- **Found during:** Task 1 (`npm test` no-regression gate).
- **Issue:** `tests/lattice-provider-bridge-smoke.test.js` asserts an EXACT background.js importScripts count (a guard to catch accidental additions): `importScripts count = 155` and `call sites = 152`. My two plan-mandated importScripts lines (trigger-store.js + trigger-lifecycle.js, D-07 glue 0) bumped these to 157 / 154, failing both assertions and blocking the plan's `npm test` acceptance criterion.
- **Fix:** extended the authorized baseline to 157 / 154 with a Phase 14 comment entry, exactly as Phase 6 (+1) and Phase 8 (+1) previously extended it. The new totals were verified against the actual file (`grep -c importScripts` = 157; `importScripts\(` = 154). This is the documented pattern for legitimately adding importScripts lines.
- **Files modified:** `tests/lattice-provider-bridge-smoke.test.js`
- **Commit:** `06a241e3`

### Acceptance-wording reconciliation (not a behavior deviation)

The plan's literal SOURCE bullets say `grep -c "FsbTriggerLifecycle.restoreTriggersFromStorage"` and `grep -c "FsbTriggerLifecycle.handleTriggerTabRemoved"` each "returns 1". My glue returns **2** for each, because -- per the plan's own `<interfaces>` ADD blocks and the verified visual sibling it mandates mirroring -- those two glue points use a two-line guard-then-call shape (`typeof FsbTriggerLifecycle.X === 'function'` guard line + `FsbTriggerLifecycle.X(...)` call line). The proven visual template produces the identical count (visual restore = 2, visual tabRemoved = 2). The literal "returns 1" assumed guard+call on one line; the spelled-out blocks and the security-guard requirement (T-14-12: "guards at every call site") put them on separate lines. The substantive criterion -- exactly ONE additive runtime wiring per glue point, guarded and non-blocking, mirroring the verified sibling -- is satisfied. `handleTriggerAlarm` and `TRIGGER_ALARM_PREFIX` return 1 as the bullets state (the onAlarm guard checks `typeof FsbTriggerLifecycle`, not the method).

## Issues Encountered

None blocking. The two `npm test` failures seen on the first run were both the stale importScripts count-guard (157 vs expected 155, 154 vs expected 152) -- a direct, expected consequence of the authorized +2 importScripts addition, resolved by the Rule 3 baseline update. After the update the full chain exits 0 with zero `FAIL:` lines.

## Verification Results
- **Glue 0 (presence + ordering):** `importScripts('utils/trigger-store.js')` at :41, `importScripts('utils/trigger-lifecycle.js')` at :42; byte-offset check confirms store (2766) < lifecycle (2897) -> ordered, exit 0.
- **Glue 1/2/3 wiring:** `FsbTriggerLifecycle.restoreTriggersFromStorage` = 2 (guard+call, mirrors visual restore = 2); `FsbTriggerLifecycle.handleTriggerAlarm` = 1; `FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX` = 1; `FsbTriggerLifecycle.handleTriggerTabRemoved` = 2 (guard+call, mirrors visual tabRemoved = 2).
- **Additive (no existing branch broken):** visual restore = 2, visual alarm = 1, visual tabRemoved = 2 -- each visual sibling intact exactly as before.
- **INV-04 HARD gate:** `grep -c setTimeout extension/ai/agent-loop.js` = 8; `git diff --name-only` does NOT list `extension/ai/agent-loop.js` (asserted pre-commit and re-asserted against the committed diff `HEAD~1..HEAD`).
- **Syntax:** `node --check extension/background.js` exit 0.
- **No regression:** `npm test` exit 0, zero `FAIL:` lines (chain tail = trigger-lifecycle suite 62/62; trigger-store 10/10 also in-chain).
- **Post-commit:** no file deletions in the commit (`git diff --diff-filter=D HEAD~1 HEAD` empty).

## User Setup Required
None - no external service configuration required (`user_setup: []`). Zero packages installed (additive glue to an existing file). The ONE remaining human action is the DEFERRED live-Chrome MV3 SW-eviction survival UAT (see Deferred / Known Stubs), scheduled for milestone-end Chrome MV3 UAT.

## Deferred Verifications
- **Live-Chrome MV3 SW-eviction survival (Task 2, checkpoint:human-verify):** DEFERRED to milestone-end Chrome MV3 UAT per 14-VALIDATION.md "Manual-Only Verifications" and the v0.10.0 UAT-debt pattern. Recorded in STATE.md Deferred Items and `deferred-items.md` (with the full how-to-verify steps). The autonomous code is complete and committed; all trigger logic has deterministic Node-mock coverage. This is the single behavior a browser-less test cannot reproduce (a real MV3 eviction + `chrome.alarms` wake).

## Next Phase Readiness
- The trigger family is now LIVE in the SW: SURV-01 (alarm-wake -> `handleTriggerAlarm`), SURV-03 (cold-boot `restoreTriggersFromStorage` reconcile + orphan sweep), LIFE-05 (tab-close -> `handleTriggerTabRemoved`).
- Phase 15 (Fire-Condition Engine) can now arm triggers through the lifecycle's fire-free `armTrigger`/`clearTrigger` seam and plug evaluate-and-fire into the `evaluated_noop` seam in `handleTriggerAlarm`; the SW glue routes alarm/tab-close events to the lifecycle without any further background.js wiring for those concerns.
- Scope honored: pure additive glue -- NO fire-condition logic, NO overlay/visual code (Phase 16), NO MCP/tool surface (Phase 18/19), NO refresh-poll clock (Phase 17). INV-04 preserved; the trigger machinery is a parallel registry never grafted onto run_task / activeSessions / agent-loop.js.

## Known Stubs

None. The glue routes to fully-implemented, Node-mock-tested lifecycle functions (Plans 14-01/14-02). No placeholder data, no empty returns flowing to UI, no TODO/FIXME introduced. The deferred live-Chrome UAT is a verification observation, not a code stub.

## Self-Check: PASSED

- Created file verified on disk: `.planning/phases/14-trigger-survivability-foundation/14-03-SUMMARY.md`.
- Modified files verified on disk: `extension/background.js`, `tests/lattice-provider-bridge-smoke.test.js`, `.planning/phases/14-trigger-survivability-foundation/deferred-items.md`.
- Task 1 commit verified in git log: `06a241e3` (feat).

---
*Phase: 14-trigger-survivability-foundation*
*Completed: 2026-06-16*
