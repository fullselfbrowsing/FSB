---
phase: 14
slug: trigger-survivability-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `14-RESEARCH.md` ## Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — plain `node tests/<name>.test.js` scripts (hand-rolled `assert` + pass/fail counters + `process.exit(failed>0?1:0)`). No Jest/Mocha/Vitest. |
| **Config file** | none — tests are self-contained scripts |
| **Quick run command** | `node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js` |
| **Full suite command** | `npm test` (full `&&` chain, ~150 files) / `npm run ci` (full gate) |
| **Estimated runtime** | quick: sub-second (pure Node-mock) · full suite: existing chain runtime |

---

## Sampling Rate

- **After every task commit:** Run `node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js`
- **After every plan wave:** Run `npm test` (confirms no regression AND that the new files are wired into the chain)
- **Before `/gsd:verify-work`:** `npm run ci` must be green
- **Max feedback latency:** ~5 seconds (quick run is sub-second)

---

## Per-Task Verification Map

> Task IDs (`14-NN-MM`) assigned by the planner; rows below map each phase requirement to its automated proof. The planner/executor refines Plan/Wave/Task columns.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| SURV-01 | Snapshot persists in `chrome.storage.session`; handler re-reads from storage (not heap) after simulated eviction | unit | `node tests/trigger-store.test.js && node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| SURV-01 | No keepalive present (only `chrome.alarms`, no `setInterval`) | unit (static assert) | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| SURV-02 | `handleTriggerAlarm` re-reads snapshot every tick; no-op if missing/fired | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| SURV-02 | Eviction between read and decision drops/duplicates nothing (idempotent re-read/write-back) | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| SURV-03 | Reconcile re-arms non-elapsed `armed` with ORIGINAL deadline | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| SURV-03 | Reconcile drops `fired`/`stopped`/expired (delete entry + clear alarm) | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| SURV-03 | Reconcile clears orphan `fsbTrigger:*` alarm with no backing snapshot (`getAll()` sweep) | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| LIFE-05 | TTL reap via alarm tick (`now >= deadline_at`) | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| LIFE-05 | TTL reap via restore (drop elapsed on boot) | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| LIFE-05 | Tab-close reap via `handleTriggerTabRemoved` (only triggers on that tab) | unit | `node tests/trigger-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| (store) | Envelope `{v:1,records}`; empty-removes-key; version-mismatch-empty; round-trip; hydrate; chrome-unavailable-no-throw | unit | `node tests/trigger-store.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Deterministic MV3 simulation (Node-mock, no browser):** SW eviction = no SW heap in the Node test (write snapshot, discard refs, call `handleTriggerAlarm`, assert state read from mock storage; mutate storage between two handler calls to prove no stale-heap read). Alarm-wake + reconcile via `createChromeMock()` (storage `records` + alarms Map) asserting `_created()`/`_cleared()`/`getAll()`. Duplicate-fire = seed `fired` snapshot, call handler twice, assert second is `noop_terminal`. TTL = seed `deadline_at = now - 1`, assert `reaped_ttl` / restore drop. Tab-close = seed mixed `target_tab_id`, call `handleTriggerTabRemoved(42)`, assert only the matching tab's triggers reaped.

---

## Wave 0 Requirements

- [ ] `tests/trigger-store.test.js` — envelope discipline (clone the 10-case structure of `tests/mcp-task-store.test.js`; swap key/fns/snapshot). Covers store-side SURV-01.
- [ ] `tests/trigger-lifecycle.test.js` — `handleTriggerAlarm` (SURV-02, duplicate-fire guard, TTL tick), `restoreTriggersFromStorage` (SURV-03 re-arm/drop/orphan-sweep, TTL restore-reap), `handleTriggerTabRemoved` (LIFE-05). Clone `createChromeMock()` (storage + alarms `create`/`clear`/`getAll`/`_created`/`_createHistory`/`_cleared`) from `tests/mcp-visual-tick-lifecycle.test.js`.
- [ ] **Wire both new test files into `package.json` `"test"` `&&` chain** — a new file not appended is silently never run by CI (real gap-trap given the ~150-entry chain).
- [ ] Framework install: **none needed** — `node` + built-in `assert` only.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live-Chrome SW-eviction survival of an armed trigger | SURV-01/02/03 | The Node-mock proves the logic deterministically, but a real MV3 service-worker eviction + alarm-wake in an unpacked extension can only be observed in Chrome | Load unpacked extension; arm a trigger; in `chrome://serviceworker-internals` (or DevTools) stop the SW / wait >30s idle; confirm the alarm wakes the SW, the registry re-hydrates, and the trigger remains `armed` with no duplicate fire. (Consistent with FSB's milestone-end Chrome MV3 UAT pattern.) |

*All trigger logic (persist, evict-survive, reconcile, reap) has automated Node-mock verification; only the live-Chrome confirmation is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (both new test files + package.json wiring)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
