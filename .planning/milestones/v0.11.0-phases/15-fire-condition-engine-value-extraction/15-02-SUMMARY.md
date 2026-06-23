---
phase: 15-fire-condition-engine-value-extraction
plan: 02
subsystem: trigger-engine
tags: [fire-condition-engine, edge-trigger, redos-guard, concurrency-cap, chrome-mv3, zero-dependency, tdd]

# Dependency graph
requires:
  - phase: 15-fire-condition-engine-value-extraction
    plan: 01
    provides: "FsbValueExtractor.parseLocaleNumber(raw, opts) -> { value, isPercent } | { error:'parse_error', isPercent } and extractValue(reportedValue, descriptor) over { text?, attributes? } -- consumed internally per numeric/text condition kind"
  - phase: 14-trigger-survivability-foundation
    provides: "FsbTriggerStore.listArmedSnapshots() (cap active-count source); FsbTriggerLifecycle.armTrigger(snapshot) + FSB_TRIGGER_DEFAULT_TTL_MS (the pure persist+alarm seam armTrigger delegates to); the dual-export IIFE + lazy resolver shell"
provides:
  - "extension/utils/trigger-manager.js: pure DOM-free evaluate(snapshot, reportedValue, now?) implementing all 6 condition kinds + compound AND/OR + edge-trigger/fire-once/hysteresis + ReDoS-guarded regex"
  - "Inline concurrency cap (LIFE-04/D-09): armTrigger(spec)/getCap/setCap/loadCapFromStorage mirroring agent-registry.js with the storage-first active-count divergence and the _withArmLock concurrent-arm mutex"
  - "Typed outcome contract { outcome:'fired'|'no_fire'|'parse_error'|'pattern_error', matched_condition?, old_value, new_value, next_state } the Phase-14 SEAM (Plan 03) merges and write-backs"
affects: [15-03-trigger-lifecycle-seam, 16-live-observe-watch, 17-refresh-poll-watch, 18-shared-tool-registry, 19-mcp-blocking-detached]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure evaluate() with brace-matched source-grep purity proof (no chrome.storage / no _getChrome inside the evaluate() body even after the storage.local cap is added to the same file)"
    - "Edge-trigger: fire only on was_satisfied false->true read from the PERSISTED snapshot; next_state patch persists satisfiedNow so a post-eviction oscillation does not re-fire"
    - "ReDoS guard = pattern-length cap (1000) + candidate-text-length cap (10000 element / 100000 page) + EVIL_SHAPES static heuristic + compile-once _regexCache + default-flags-only compile; invalid/rejected -> pattern_error"
    - "Compound short-circuit: ANY sub-condition error folds the WHOLE compound to that error outcome (never a partial fire)"
    - "_withArmLock module-scope promise-chain mutex (port of agent-registry withRegistryLock) serializing the listArmedSnapshots() read + cap compare + delegated persist into one atomic turn"
    - "Storage-first cap active-count via listArmedSnapshots().length (survives SW eviction), NOT an in-heap set"

key-files:
  created:
    - extension/utils/trigger-manager.js
    - tests/trigger-manager.test.js
    - tests/trigger-cap.test.js
  modified:
    - package.json

key-decisions:
  - "Compound schema shape locked: { combinator:'AND'|'OR', conditions:[...] } (combinator compared case-insensitively; default to OR when not exactly AND); matched_condition reports the first satisfying leg"
  - "Edge-state field name locked: was_satisfied (boolean, persisted in the snapshot, NEVER the SW heap)"
  - "Regex flag policy locked: default-flags-only compile (caller /g and /y flags are NOT honored -- removes the cross-call lastIndex footgun; contains already covers case-insensitive substring needs)"
  - "Regex caps locked: PATTERN_MAX_LEN=1000, TEXT_MAX_LEN_ELEMENT=10000, TEXT_MAX_LEN_PAGE=100000 (the length caps are the hard CPU bound; the EVIL_SHAPES heuristic is best-effort defense-in-depth)"
  - "Concurrent-arm race resolved with a module-scope _withArmLock mutex (Plan 03 / Phase 18 inherit a serialized arm path; evaluate() is lock-free and pure)"
  - "armTrigger builds the flat-scalar snapshot (status:'armed', was_satisfied:false, baseline+last_value from spec.baseline, deadline_at = now + FSB_TRIGGER_DEFAULT_TTL_MS) and delegates the write+alarm to FsbTriggerLifecycle.armTrigger; on cap exhaustion returns the typed TRIGGER_CAP_REACHED reject without delegating"

patterns-established:
  - "Source-level purity proof: a test reads the module via fs.readFileSync, brace-matches the evaluate() body, and asserts it contains neither chrome.storage nor the chrome resolver -- so purity holds even after a later task adds storage access elsewhere in the same file"
  - "Mock store+lifecycle pair for the cap test: listArmedSnapshots() returns a live backing array that the mock lifecycle.armTrigger pushes into, so the active count grows as concurrent arms succeed (exercises the _withArmLock serialization deterministically)"

requirements-completed: [TRIG-02, TRIG-03, TRIG-04, TRIG-05, TRIG-06, TRIG-07, LIFE-04]

# Metrics
duration: 9min
completed: 2026-06-16
---

# Phase 15 Plan 02: Fire-Condition Engine & Concurrency Cap Summary

**Pure DOM-free `trigger-manager.js`: `evaluate()` implements all six condition kinds (changed / threshold / contains / percent_change / equals / regex) + compound AND/OR with error short-circuit + edge-trigger/fire-once, a ReDoS-guarded regex path (length caps + evil-shape heuristic + compile-once cache, default-flags-only), and an inline concurrency cap mirroring agent-registry with the D-09 storage-first active-count divergence and a `_withArmLock` concurrent-arm mutex - 60 engine assertions + 16 cap assertions all green, evaluate() proven pure by a brace-matched source-grep.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-16T06:26 (approx, immediately after 15-01 close)
- **Completed:** 2026-06-16T06:35Z
- **Tasks:** 3 (all TDD-typed: RED then two GREEN steps)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- **`evaluate(snapshot, reportedValue, now?)` is structurally PURE (D-02):** a test reads the source via `fs.readFileSync`, brace-matches the `evaluate()` body, and asserts it contains neither `chrome.storage` nor the chrome resolver - so purity holds even after Task 3 added the `storage.local` cap to the same file. `evaluate()` returns a typed outcome + a `next_state` patch and never sets `status:'fired'` (the SEAM owns that).
- **All six condition kinds (TRIG-02..06, D-06):** `changed` (raw text vs baseline), `contains` (case-insensitive default, `case_sensitive` flip), `threshold` (`>=`/`<=`/`>`/`<` with BOTH sides parsed to Number - `"1,050"` parses to 1050 then compares, never a string-vs-number JS coercion), `percent_change` (`(cur-baseline)/baseline*100`, baseline 0/NaN -> `parse_error` BEFORE the division), `equals` (numeric-with-tolerance / exact text), `regex` (guarded). Each kind has a fires, a no-fire, an edge exactly-one-fire, and (where numeric) a `parse_error` case.
- **Compound AND/OR fold (TRIG-07) with error short-circuit (Pitfall 5):** `{ combinator, conditions[] }` folds per-condition booleans on one element; ANY sub-condition `parse_error`/`pattern_error` short-circuits the WHOLE compound to that error outcome - never a partial fire (proven for both an OR-with-a-true-leg + a parse_error leg, and an AND with a pattern_error leg).
- **Edge-trigger / fire-once (D-07):** fire only on the `was_satisfied: false -> true` transition read from the PERSISTED snapshot; `next_state.was_satisfied` records `satisfiedNow` so re-evaluating the SAME satisfying value with `was_satisfied:true` yields `no_fire` (the unit-level proof that an oscillation across SW eviction does not re-fire). The `condition.hysteresis` margin field is read for re-arm parity.
- **ReDoS guard (TRIG-04 / D-08):** `guardAndCompile` rejects empty/non-string/`>1000`-char/evil-shape/invalid-syntax patterns to a distinct `pattern_error`; `(a+)+`, `(a|a)*`, `.*.*`, a 1001-char pattern, and `(` are all rejected. Compiling the same pattern twice returns the cached `RegExp` (compile-once identity asserted). `regexMatches` slices the candidate text to the element cap BEFORE `.test()` - an over-cap 50k-char input with the needle past the cap returns promptly as `no_fire` (proves the truncation is the hard CPU bound; no synchronous time-boxing).
- **Inline concurrency cap (LIFE-04 / D-09):** constants cloned from `agent-registry.js` renamed `Agent`->`Trigger` (`fsbTriggerCap` in the durable local area, DEFAULT 8 / MIN 1 / MAX 64, `_clampCap` copied exactly); `getCap` clamps on the read path (poisoned-cache defense); `setCap` clamps + writes best-effort + grandfathers-on-lower; `loadCapFromStorage` hydrates at wake. `armTrigger(spec)` runs entirely inside `_withArmLock` so the active-count read + cap compare + delegated persist are one atomic turn; the active count is `listArmedSnapshots().length` (storage-of-truth, **not** a heap set), so the cap keeps enforcing across SW eviction.
- **The D-09 divergence test passes:** with 8 seeded `status:'armed'` snapshots in the mock store and an EMPTY module heap (fresh require), `armTrigger` STILL returns `{ code:'TRIGGER_CAP_REACHED', cap:8, active:8 }` - locking the deliberate divergence (a heap counter would read `active=0` and wrongly allow the arm). The 20-concurrent-under-cap-8 test yields exactly 8 successes + 12 typed rejects, exercising the `_withArmLock` serialization.
- **Wired into `npm test` after `value-extractor.test.js` with no reorder;** Plan 01 + Phase 14 remain green (no regression from installing `FsbTriggerManager` on the global).

## Task Commits

Each task committed atomically (TDD: test -> feat -> feat):

1. **Task 1: trigger-manager + cap tests (6-kind matrix + compound + edge + regex guard + cap + D-09 divergence), RED + package.json wiring** - `11e946d389364d3d2c23edcb0e95b1e69e75080b` (test)
2. **Task 2: implement pure evaluate() engine (6 kinds + compound + edge + regex guard), GREEN** - `a9efd1eecfc087cb78edc0ada057269350b1b0dd` (feat)
3. **Task 3: add inline cap + _withArmLock (armTrigger/getCap/setCap), GREEN** - `41033e64d3af846895d9402c416c7792db44941f` (feat)

**Plan metadata:** _(this docs commit)_

_TDD note: REFACTOR was not needed. The engine (Task 2) and the cap (Task 3) each passed all assertions on first GREEN; the dispatch transcribes the verified 15-RESEARCH skeleton and the cap clones agent-registry. No post-GREEN edits were required - the LANDMINE comments were written without the verbatim anti-pattern tokens (`AbortController`, `chrome.storage.session`, `_agents`) so no acceptance grep tripped on documentation prose._

## Files Created/Modified

- `extension/utils/trigger-manager.js` (created, 560 lines) - Dual-export IIFE (`FsbTriggerManager` + `module.exports`) with lazy `_getChrome`/`_getStore`/`_getExtractor`/`_getLifecycle` resolvers; the pure `evaluate`/`evaluateOne`/`evaluateCompound`; the regex guard (`guardAndCompile`/`regexMatches`/`EVIL_SHAPES`/`_regexCache`); and the inline cap (`armTrigger`/`getCap`/`setCap`/`loadCapFromStorage`/`_withArmLock`/`_clampCap`). The cap is the only storage caller and is confined to the cap functions.
- `tests/trigger-manager.test.js` (created, 369 lines) - 60-assertion Node script (built-in `assert` + a local `check()` counter + `process.exit`); injects fake snapshot + reportedValue directly (no chrome); covers the full 6-kind matrix + compound + edge + regex internals; includes the brace-matched `evaluate()` purity source-grep.
- `tests/trigger-cap.test.js` (created, 224 lines) - 16-assertion Node script; uses `installChromeMock({ storage:{ local:{} } })` + a stateful mock `FsbTriggerStore`/`FsbTriggerLifecycle` pair (listArmedSnapshots returns the live backing array the mock lifecycle pushes into); covers default-8, clamping, 20-concurrent-under-cap-8, and the D-09 storage-first divergence test.
- `package.json` (modified) - appended ` && node tests/trigger-manager.test.js && node tests/trigger-cap.test.js` to `scripts.test` after `value-extractor.test.js` (no existing entry reordered).

## Consumer Contract (for Plan 03 / Phases 16-19)

`FsbTriggerManager.evaluate(snapshot, reportedValue, now?)`:

- **snapshot READS:** `snapshot.condition` (single condition OR `{ combinator, conditions[] }`), `snapshot.baseline`, `snapshot.last_value`, `snapshot.was_satisfied` (the persisted edge flag). The condition may carry `locale` / `decimal_separator` (passed through to `parseLocaleNumber`), `case_sensitive` (contains), `numeric`/`tolerance` (equals), `operator`/`target` (threshold), `percent` (percent_change), `pattern` (regex), and `hysteresis` (re-arm margin, read for parity).
- **reportedValue shape:** `{ text:'<raw>', attributes?:{ 'data-price':'...' } }` (the Plan 01 contract; the Phase 16/17 watch layer must conform).
- **Returns:** `{ outcome:'fired'|'no_fire'|'parse_error'|'pattern_error', matched_condition?, old_value, new_value, next_state }` where `next_state = { last_value, was_satisfied, last_evaluated_at }` is a PATCH. **The SEAM (Plan 03) merges `next_state` and, on `outcome==='fired'`, sets `status:'fired'` + `fired_at` and write-backs atomically + clears the alarm; on a non-fire it merges `next_state` and stays armed.** `evaluate()` itself does NO storage write.

`FsbTriggerManager.armTrigger(spec)` (cap-gated, serialized): `spec = { trigger_id, condition, baseline?, selector?, target_tab_id?, agent_id?, now? }`. Builds the `status:'armed'` snapshot and delegates to `FsbTriggerLifecycle.armTrigger`. Over cap returns `{ error:'TRIGGER_CAP_REACHED', code:'TRIGGER_CAP_REACHED', cap, active }`. `getCap()`/`setCap(value)`/`loadCapFromStorage()` manage the `fsbTriggerCap` value in the durable local area.

## Decisions Made

- **Compound schema:** `{ combinator:'AND'|'OR', conditions:[...] }` finalized (D-06 discretion). `combinator` is compared case-insensitively; anything not exactly `AND` folds as OR. `matched_condition` reports the first satisfying leg (or the condition itself for a single condition).
- **Edge-state field:** `was_satisfied` (D-07 discretion) - persisted in the snapshot, never the SW heap.
- **Regex flag policy:** default-flags-only compile (A3/Open-Q2 resolution) - the caller `/g`/`/y` flags are not honored, removing the cross-call `lastIndex` correctness footgun.
- **Regex caps:** `PATTERN_MAX_LEN=1000`, `TEXT_MAX_LEN_ELEMENT=10000`, `TEXT_MAX_LEN_PAGE=100000` (A5/D-08 discretion). The length caps are the load-bearing CPU guarantee; the `EVIL_SHAPES` heuristic is best-effort defense-in-depth.
- **Concurrent-arm race:** resolved with a module-scope `_withArmLock` promise-chain mutex (the design_resolution). The read+compare+delegated-write run inside one lock turn so concurrent arms cannot all slip past the cap. The lock guards ONLY `armTrigger` (arm is not the hot path); `evaluate()` is lock-free and pure. **Plan 03 / Phase 18 inherit a serialized arm path.**
- **Snapshot builder:** `armTrigger` captures `baseline` (and seeds `last_value`) from `spec.baseline`, sets `was_satisfied:false`, and `deadline_at = now + FsbTriggerLifecycle.FSB_TRIGGER_DEFAULT_TTL_MS` (6h), then delegates the storage write + one-shot alarm to the Phase-14 lifecycle seam.

## Deviations from Plan

None - plan executed exactly as written. No deviation rules (1-4) were triggered: no bugs, no missing critical functionality, no blocking issues, no architectural changes. Zero packages installed (zero-dep mandate D-03 / T-15-SC honored; INV-06 untouched).

## Issues Encountered

None blocking. The Wave-1 friction (the Write path folding `\uNNNN` escapes into multibyte chars, and acceptance greps tripping on verbatim anti-pattern tokens in comments) was pre-empted: the test inputs use plain ASCII (no NBSP/crypto code points are needed in the engine/cap tests), and the LANDMINE comments describe the forbidden patterns without naming `AbortController` / `chrome.storage.session` / `_agents` verbatim, so every acceptance grep returned the expected count on the first run.

## Threat Surface

All Plan-02 threat-register mitigations (T-15-05 ReDoS-via-pattern, T-15-06 ReDoS-via-text, T-15-07 compound partial-fire, T-15-08 cap-exhaustion-TOCTOU, T-15-09 percent_change divide-by-zero, T-15-10 regex `/g` lastIndex, T-15-SC zero-dep) are implemented and tested. No new security-relevant surface was introduced beyond the plan's `<threat_model>` (the module is pure comparison + a storage-backed cap; no network, no auth, no new schema at a trust boundary).

## Known Stubs

None - `trigger-manager.js` is fully implemented and exercised by 60 engine + 16 cap passing assertions. No placeholder values, no empty-data paths, no TODO/FIXME markers. (The Phase 16/17 watch layer that produces the `reportedValue`, and the Plan 03 SEAM that calls `evaluate()` + write-backs, are out of scope by design - `evaluate()` consumes a reported INPUT and returns a patch; the storage write is the SEAM's job per CONTEXT D-02.)

## Self-Check: PASSED

- `extension/utils/trigger-manager.js` - FOUND (560 lines, >= 200 min_lines)
- `tests/trigger-manager.test.js` - FOUND
- `tests/trigger-cap.test.js` - FOUND
- Commit `11e946d3` (test RED) - FOUND
- Commit `a9efd1ee` (feat engine GREEN) - FOUND
- Commit `41033e64` (feat cap GREEN) - FOUND
- `node tests/trigger-manager.test.js` exits 0 (60/60); `node tests/trigger-cap.test.js` exits 0 (16/16)
- Plan 01 + Phase 14 regression green (value-extractor, trigger-store, trigger-lifecycle all PASS)
- Acceptance guards: `function evaluate`/`function evaluateOne`/`function guardAndCompile`/`EVIL_SHAPES`/`_regexCache`/`FsbTriggerManager` present; `FSB_TRIGGER_CAP_STORAGE_KEY='fsbTriggerCap'` + `function armTrigger` + `_withArmLock` present; `listArmedSnapshots`>=1; `_agents`=0; `storage.local`>=1; `chrome.storage.session`=0; `AbortController`=0; source ASCII-CLEAN

## Next Phase Readiness

- The genuinely-new comparison engine Plan 03's SEAM consumes is built, tested, and on the global as `FsbTriggerManager` (plus `module.exports` for the Node tests).
- Plan 03 (`trigger-lifecycle.js` SEAM + `background.js` `importScripts` glue) can now: (1) replace the `evaluated_noop` return with `FsbTriggerManager.evaluate(snap, reportedValue, now)` + the atomic `fired` write-back / `next_state` merge; (2) add `value-extractor.js` + `trigger-manager.js` to the `importScripts` region in the load order value-extractor -> trigger-store -> trigger-manager -> trigger-lifecycle. Phase 18 wires the `trigger()` MCP tool to `armTrigger` (already cap-gated + serialized).
- No blockers.

---
*Phase: 15-fire-condition-engine-value-extraction*
*Completed: 2026-06-16*
