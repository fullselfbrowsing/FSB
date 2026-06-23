---
phase: 15-fire-condition-engine-value-extraction
plan: 03
subsystem: trigger-engine
tags: [fire-condition-seam, trigger-lifecycle, chrome-mv3, importscripts, atomic-write-back, edge-trigger, zero-dependency, tdd]

# Dependency graph
requires:
  - phase: 15-fire-condition-engine-value-extraction
    plan: 02
    provides: "FsbTriggerManager.evaluate(snapshot, reportedValue, now?) -> { outcome:'fired'|'no_fire'|'parse_error'|'pattern_error', matched_condition?, old_value, new_value, next_state } (pure, DOM-free); next_state = { last_value, was_satisfied, last_evaluated_at } patch the SEAM merges"
  - phase: 15-fire-condition-engine-value-extraction
    plan: 01
    provides: "FsbValueExtractor (parseLocaleNumber + extractValue over { text?, attributes? }) consumed internally by the manager; loaded first in the importScripts chain"
  - phase: 14-trigger-survivability-foundation
    provides: "trigger-lifecycle.js handleTriggerAlarm re-read/reap scaffold + the evaluated_noop SEAM + the noop_terminal terminal-dedupe guard + clearAlarm(); FsbTriggerStore.readSnapshot/writeSnapshot; the importScripts trigger glue region in background.js"
provides:
  - "The Phase-15 SEAM is LIVE: trigger-lifecycle.js handleTriggerAlarm now calls FsbTriggerManager.evaluate() and owns ALL fire-path storage I/O -- on 'fired' it sets status:'fired' + fired_at, folds next_state, writes atomically in one writeSnapshot, then clears the alarm (disarm); on no_fire/parse_error/pattern_error it merges next_state and STAYS armed"
  - "Exactly-one-fire across SW eviction is closed: the atomic terminal write-back + the existing noop_terminal guard (status fired/stopped) both live on the storage-of-truth side, so a duplicate/replayed alarm tick after a fire no-ops"
  - "EXTRACT-04 holds at the integration level: a parse_error/pattern_error outcome NEVER writes status:'fired' -- the snapshot stays armed for the next tick"
  - "background.js loads value-extractor.js + trigger-manager.js in the load-bearing order (value-extractor -> trigger-store -> trigger-manager -> trigger-lifecycle) so the SEAM can reach the manager in the running service worker"
  - "The reportedValue consumer contract the SEAM expects: { text, attributes? }, sourced from snap.reported_value ?? snap.last_value until the Phase 16/17 watch layer supplies a live scraped value"
affects: [16-live-observe-watch, 17-refresh-poll-watch, 18-shared-tool-registry, 19-mcp-blocking-detached]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SEAM-owns-storage: the pure evaluate() returns a next_state patch + a 'fired' outcome but performs no write; trigger-lifecycle.js does the atomic status:'fired' write-back + disarm (and the next_state merge on non-fire). The terminal write + the noop_terminal guard living together on the storage-of-truth side are the exactly-once-across-eviction guarantee (D-02/D-07)"
    - "Defensive lazy manager resolver: _getManager() returns the manager only when evaluate() is a function; a missing manager at boot OR a null/malformed outcome degrades to the Phase-14 evaluated_noop no-op rather than throwing out of the SW glue (T-15-13)"
    - "importScripts load order is load-bearing: value-extractor (pure) before the store; manager after the store (its cap resolves FsbTriggerStore) and before the lifecycle (whose SEAM calls FsbTriggerManager.evaluate)"
    - "End-to-end + scripted SEAM test harness: setupSeamHarness() fresh-requires the real FsbValueExtractor + FsbTriggerStore + FsbTriggerLifecycle + FsbTriggerManager under one chrome mock; withManagerStub() swaps a scripted evaluate() outcome for exact next_state/outcome control then restores the real module"

key-files:
  created: []
  modified:
    - extension/utils/trigger-lifecycle.js
    - extension/background.js
    - tests/trigger-lifecycle.test.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "reportedValue contract for the Phase-15 SEAM locked: { text: snap.reported_value != null ? snap.reported_value : snap.last_value }. Phase 15 has no live scrape, so the seam constructs it from what the snapshot carries; the Phase 16/17 watch layer supplies the live { text, attributes? } value. The seam exercises the wiring and the contract is concrete now."
  - "The SEAM is the SOLE owner of fire-path storage I/O (D-02): evaluate() stays pure; trigger-lifecycle.js does the single atomic writeSnapshot(status:'fired') + clearAlarm on a fire, and the next_state merge + writeSnapshot (stay armed) on a non-fire. No comparison operators were added to trigger-lifecycle.js."
  - "Manager absence / malformed outcome degrades to evaluated_noop (not a throw), mirroring the typeof guards already in background.js -- so the SW glue never throws even during the transient boot window the load-order fix already removes (T-15-13)."
  - "noop_terminal guard (status fired/stopped, trigger-lifecycle.js:267-269) PRESERVED above the seam as the storage-backed dedupe; a duplicate alarm tick after the fired write-back no-ops there before reaching the evaluate call."

patterns-established:
  - "SEAM integration test pattern: drive handleTriggerAlarm(alarm) through the real evaluate() via setupSeamHarness (end-to-end through Plan-01/Plan-02 modules) for the canonical fired/parse_error paths, and via withManagerStub for exact next_state-merge assertions; assert against the re-read snapshot + the alarm mock's _cleared() history"
  - "Per-phase importScripts baseline-count guard (lattice-provider-bridge-smoke.test.js) is advanced +2 each time the trigger family adds modules to background.js (Phase 14 +2 -> Phase 15 +2); the guard's hardcoded token/call-site counts are the bookkeeping the glue edit must keep in sync"

requirements-completed: [TRIG-02, TRIG-03, TRIG-04, TRIG-05, TRIG-06, TRIG-07, EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04, LIFE-04]

# Metrics
duration: 9min
completed: 2026-06-16
---

# Phase 15 Plan 03: Fire-Condition Engine SEAM Wiring Summary

**The Phase-14 evaluated_noop SEAM in trigger-lifecycle.js is replaced with a live FsbTriggerManager.evaluate() call plus the atomic status:'fired' + fired_at write-back and alarm disarm on a fire (or the next_state merge + stay-armed on no_fire/parse_error/pattern_error); background.js now loads value-extractor.js + trigger-manager.js in the load-bearing value-extractor -> store -> manager -> lifecycle order, so TRIG-02..07 / EXTRACT-* are live in the running service worker. parse_error never writes status:'fired' (EXTRACT-04) and the noop_terminal guard gives exactly-one-fire across SW eviction -- all 87 lifecycle assertions plus the full npm test suite are green and INV-01/INV-04 hold.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-16T06:40Z
- **Completed:** 2026-06-16T06:49Z (approx)
- **Tasks:** 3 (Task 1+2 TDD: RED then GREEN; Task 3 glue + one Rule-3 baseline fix)
- **Files modified:** 4

## Accomplishments

- **The SEAM is live (Task 2):** `handleTriggerAlarm` resolves `FsbTriggerManager` defensively (`_getManager()` returns it only when `evaluate()` exists), constructs `reportedValue = { text: snap.reported_value ?? snap.last_value }`, calls `FsbTriggerManager.evaluate(snap, reportedValue, now)`, and then owns the storage write. On `outcome === 'fired'`: sets `status:'fired'` + `fired_at`, folds `next_state` (last_value/was_satisfied/last_evaluated_at), writes the snapshot atomically in one `writeSnapshot`, then `clearAlarm(alarm.name)` (disarm). On any non-fire (`no_fire`/`parse_error`/`pattern_error`): merges `next_state` and writes, staying armed. A null/malformed outcome OR an absent manager degrades to the Phase-14 `evaluated_noop` (no throw out of the SW glue).
- **EXTRACT-04 holds at the integration level:** a `parse_error`/`pattern_error` outcome NEVER writes `status:'fired'` -- it merges `next_state` and stays armed. Proven both with a scripted `parse_error` stub AND end-to-end through the real manager (a `threshold` condition against an unparseable reported value -> `parse_error`, snapshot stays armed).
- **Exactly-one-fire across SW eviction is closed:** the single atomic terminal `writeSnapshot(status:'fired')` plus the existing `noop_terminal` guard (`status === 'fired' || 'stopped'`, preserved above the seam) both live on the storage-of-truth side. The Case-R dedupe test fires on the first tick (1 clear) and, on a duplicate/replayed tick, hits `noop_terminal` (no second `_cleared`, snapshot still terminal) -- no double fire across an eviction-style re-read.
- **The glue is wired (Task 3):** `background.js` adds exactly two additive `importScripts` lines in the Phase-14 trigger region, in the load-bearing order `value-extractor.js` (pure) -> `trigger-store.js` -> `trigger-manager.js` (its cap resolves `FsbTriggerStore`) -> `trigger-lifecycle.js` (the SEAM calls `FsbTriggerManager.evaluate`). No other `background.js` change: the `onAlarm` fan-out already calls `handleTriggerAlarm` (the SEAM lives inside that helper), so the listener needs no edit.
- **Test coverage extended (Task 1):** four new SEAM integration cases (O fired/atomic write-back/disarm, P no_fire/next_state-merge/stay-armed, Q parse_error-never-fires scripted + end-to-end, R dedupe/idempotent-disarm) appended to `tests/trigger-lifecycle.test.js`; all 14 Phase-14 cases A-N preserved and green (87 assertions total).
- **Full gate green:** all five trigger test files (value-extractor 22, trigger-manager 60, trigger-cap 16, trigger-store 10, trigger-lifecycle 87) plus `npm test` (exit 0). INV-04 (`agent-loop.js` byte-untouched) and INV-01 (`validate-extension` OK; no `mcp/`/`tool-definitions` in the diff) both hold. Zero packages installed (zero-dep mandate D-03 / T-15-SC).

## Task Commits

Each task committed atomically (TDD: test -> feat; Task 3 feat + a bundled Rule-3 fix):

1. **Task 1: extend trigger-lifecycle.test.js with SEAM integration cases (fired/no-fire/parse_error/dedupe), RED** - `630a57c6` (test)
2. **Task 2: replace the evaluated_noop SEAM with evaluate() + atomic fired write-back + edge-state persist, GREEN** - `bfd5a7e9` (feat)
3. **Task 3: add the two importScripts lines in background.js (value-extractor + trigger-manager) in load-bearing order + Rule-3 baseline-count fix** - `5a0576d1` (feat)

**Plan metadata:** _(this docs commit)_

_TDD note: REFACTOR was not needed -- the SEAM (Task 2) passed all 87 assertions on the first GREEN. The replacement transcribes the 15-RESEARCH:156-164 system-diagram spec and the 15-PATTERNS swap shape verbatim._

## Files Created/Modified

- `extension/utils/trigger-lifecycle.js` (modified) - Added the `_getManager()` lazy resolver (mirrors `_getStore()`; returns the manager only when `evaluate()` is a function). Replaced ONLY the comment-marked `evaluated_noop` return (the seam region) with: defensive manager resolve, `reportedValue` construction, `manager.evaluate(snap, reportedValue, now)`, the `fired` branch (atomic `status:'fired'` + `fired_at` + `next_state` fold + single `writeSnapshot` + `clearAlarm` disarm), and the non-fire branch (`next_state` merge + `writeSnapshot`, stay armed). The `noop_terminal` guard, the TTL reap, and the storage re-read above the seam are UNCHANGED. Updated the `handleTriggerAlarm` outcomes docblock for the new fired/no_fire/parse_error/pattern_error/evaluated_noop outcomes.
- `extension/background.js` (modified) - Two additive `importScripts` lines (`value-extractor.js`, `trigger-manager.js`) inserted into the Phase-14 trigger glue region in the load-bearing order. No existing importScripts reordered; no other change.
- `tests/trigger-lifecycle.test.js` (modified) - Added `setupSeamHarness()` (fresh-requires the real extractor + store + lifecycle + manager under one chrome mock) and `withManagerStub()` (scripts an `evaluate()` outcome then restores the real module), the four SEAM cases O/P/Q/R, the driver wiring, and the header docblock entries. Phase-14 cases preserved.
- `tests/lattice-provider-bridge-smoke.test.js` (modified, Rule-3) - Advanced the `background.js` importScripts baseline-count guard for Phase 15's +2 (token mentions 157 -> 159, call sites 154 -> 156), mirroring the Phase-14 +2 bookkeeping.

## reportedValue Consumer Contract (for Phases 16/17)

The SEAM now expects `reportedValue = { text, attributes? }` and builds it as `{ text: snap.reported_value != null ? snap.reported_value : snap.last_value }`. In Phase 15 there is no live DOM scrape, so the value is sourced from the snapshot itself (the wiring is exercised, the contract is concrete). **The Phase 16/17 watch layer must supply the live scraped value in this exact shape** (`reportedValue.text` for text/number/changed/contains/threshold, `reportedValue.attributes[name]` for `extract:'attribute'`). `evaluate()` consumes this INPUT and stays pure; the SEAM (here) is the sole owner of the fire-path storage write.

## Decisions Made

- **reportedValue source in Phase 15:** `snap.reported_value ?? snap.last_value`, wrapped as `{ text }`. This is the documented best-effort until the watch layer (Phase 16/17) reports a live value; it makes the SEAM end-to-end-testable now.
- **Defensive degrade, not throw:** a missing `FsbTriggerManager` at boot or a null/malformed `evaluate()` outcome returns `evaluated_noop` (the Phase-14 behavior) rather than throwing out of the SW glue (T-15-13). The load-order fix removes even the transient boot window.
- **Atomic terminal write-back placement (D-02/D-07):** `status:'fired'` is set ONLY when `outcome.outcome === 'fired'`, in a single `writeSnapshot`, followed by `clearAlarm`. The `noop_terminal` guard stays above the seam as the dedupe backstop. parse_error/pattern_error never touch status.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Advanced the background.js importScripts baseline-count guard for Phase 15's +2**
- **Found during:** Task 3 (background.js importScripts glue)
- **Issue:** `tests/lattice-provider-bridge-smoke.test.js` asserts the literal `importScripts` token count (157) and call-site count (154) in `background.js` against hardcoded per-phase baselines. Adding the two plan-mandated importScripts lines (value-extractor.js + trigger-manager.js) advanced the counts to 159 / 156, failing the guard. `npm test` exited 1 with exactly these two assertions failing.
- **Fix:** Updated both baselines (157 -> 159 token mentions, 154 -> 156 call sites) and extended the per-phase accounting comments with the Phase-15 +2, mirroring how Phase 14 advanced the same guard for its +2. This is the guard's own bookkeeping, not a code bug -- the count delta is exactly +2, matching the two new call-site lines (my reworded glue comment contains no `importScripts` token, so neither baseline over-counted).
- **Files modified:** `tests/lattice-provider-bridge-smoke.test.js`
- **Verification:** `npm test` exits 0; the two assertions now read `expected: 159, got: 159` and `expected: 156, got: 156`.
- **Committed in:** `5a0576d1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix is a per-phase baseline bookkeeping update required by the plan's own importScripts edit (the same maintenance Phase 14 performed). No scope creep; no production-code change beyond the two mandated importScripts lines.

## Issues Encountered

- **importScripts load-order verifier false-negative (resolved during Task 3):** the plan's `<automated>` load-order one-liner uses `indexOf('value-extractor.js')` / `indexOf('trigger-manager.js')` (first occurrence). My initial glue comment named those `.js` files in prose, so `indexOf` matched the comment text out of order (manager mentioned before the store's `utils/trigger-store.js` token), reporting a false mis-order even though the actual `importScripts` lines were correctly ordered and all five test files passed. Resolved by rewording the comment to reference the modules without the `.js` extension, so only the real `importScripts('utils/X.js')` lines match. The exact verify one-liner then exits 0 (`ve < ts < tm < tl`). No production behavior was ever wrong; the modules were always in the correct load order.

## User Setup Required

None - no external service configuration required. Phase 15 is pure SW-side comparison/extraction logic; zero packages installed.

## Next Phase Readiness

- **Phase 15 is closed with full automated coverage and NO live-Chrome UAT.** Per `15-VALIDATION.md` (the "Manual-Only Verifications" table is empty), every Phase-15 behavior is deterministically covered browser-free because the element value is injected as a test input. Real-fire MV3-survival UAT (the running SW actually firing a watch across an eviction) is milestone-end Chrome MV3 UAT scope -- the same deferral Phase 14 used (14-03 / v0.10.0 UAT-debt pattern). No live-Chrome checkpoint was added.
- **For Phase 16/17 (watch layers):** conform to the `reportedValue = { text, attributes? }` contract above; supply the live scraped value into the snapshot (or directly to a future reporting path) so the SEAM's `evaluate()` consumes a real DOM value instead of `snap.last_value`. The SEAM already owns the atomic fired write-back + disarm + dedupe -- the watch layer only needs to produce the value and tick the alarm.
- **For Phase 18 (tool registry):** `FsbTriggerManager.armTrigger` (cap-gated + serialized via `_withArmLock`) and the live SEAM are both ready; tool registration is explicitly Phase 18, not done here (INV-01 held).
- No blockers.

## Self-Check: PASSED

- `extension/utils/trigger-lifecycle.js` - FOUND (SEAM replaced; `FsbTriggerManager.evaluate` + `status = 'fired'` + `clearAlarm(alarm.name)` present; `noop_terminal` preserved)
- `extension/background.js` - FOUND (two additive importScripts; load order ve < ts < tm < tl verified)
- `tests/trigger-lifecycle.test.js` - FOUND (cases O/P/Q/R added; Phase-14 A-N preserved; ASCII CLEAN)
- `tests/lattice-provider-bridge-smoke.test.js` - FOUND (baseline counts 159/156)
- `.planning/phases/15-fire-condition-engine-value-extraction/15-03-SUMMARY.md` - FOUND
- Commit `630a57c6` (test RED) - FOUND
- Commit `bfd5a7e9` (feat seam GREEN) - FOUND
- Commit `5a0576d1` (feat glue + Rule-3 fix) - FOUND
- `node tests/trigger-lifecycle.test.js` exits 0 (87/87: Phase-14 A-N + Phase-15 O/P/Q/R)
- Five-file Phase-15 gate green (value-extractor 22, trigger-manager 60, trigger-cap 16, trigger-store 10, trigger-lifecycle 87); `npm test` exits 0
- INV-04: `git diff --quiet extension/ai/agent-loop.js` UNTOUCHED; INV-01: `validate-extension` OK, no `mcp/`/`tool-definitions` in diff

---
*Phase: 15-fire-condition-engine-value-extraction*
*Completed: 2026-06-16*
