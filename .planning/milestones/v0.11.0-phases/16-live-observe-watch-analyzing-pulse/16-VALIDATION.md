---
phase: 16
slug: live-observe-watch-analyzing-pulse
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-16
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `16-RESEARCH.md` § Validation Architecture. Live-Chrome UAT deferred to Phase 20 per CONTEXT D-12.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in (`node tests/<name>.test.js`), plain assertions + `vm.createContext` sandbox for content modules. No jest/mocha. |
| **Config file** | none — each test is a standalone Node script appended to the `npm test` chain in `package.json` |
| **Quick run command** | `node tests/trigger-observe.test.js && node tests/trigger-observe-pulse.test.js` |
| **Full suite command** | `npm test` (new files appended beside `trigger-cap.test.js`) |
| **Estimated runtime** | ~2 seconds (the two new files); full suite per existing chain |

---

## Sampling Rate

- **After every task commit:** Run `node tests/trigger-observe.test.js && node tests/trigger-observe-pulse.test.js` (< 2s)
- **After every plan wave:** Run `npm test` (full chain with the two new files appended)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds (quick); full suite per chain

---

## Per-Task Verification Map

> Task IDs are assigned when plans are authored (next step). Rows are keyed by requirement + behavior from the research test map; `Plan`/`Wave`/`Task ID` fill in at plan time.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01 | 16-01 | 1 | WATCH-01 | — | `optsFor(extract)` → `{childList,characterData,subtree}` (text/number) / `{attributes,attributeFilter:[attr]}` (attribute) | unit (Node-mock) | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-01 | 16-01 | 1 | WATCH-01 | — | mutation → debounced single `sendMessage({action:'triggerValueChanged', value:{text}})`; N mutations coalesce to 1 | unit (mock MutationObserver+setTimeout+sendMessage) | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-01 | 16-01 | 1 | WATCH-01 | — | value report shape is exactly `{text, attributes?}` (evaluate() contract) | unit | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-04 | 16-04 | 2 | WATCH-01 | T-16-V5 | SW value-report case validates `typeof value.text==='string'`, keeps `sender.id===chrome.runtime.id` guard, writes `reported_value`, SEAM fires on edge-true | unit (extend trigger-lifecycle harness) | `node tests/trigger-lifecycle.test.js` | ✅ exists | ✅ green |
| 16-01 | 16-01 | 1 | WATCH-05 | — | idempotent start: second `start(same_id)` disconnects the prior observer (no stacking) | unit (observe/disconnect counts) | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-01 | 16-01 | 1 | WATCH-05 | — | **leak test:** every observer created is disconnected after stop/disconnectAll (disconnect count === observe count, registry empty) | unit | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-01 | 16-01 | 1 | WATCH-05 | — | `pagehide(persisted)` does NOT disconnect; non-persisted DOES (BF-cache survival, D-04) | unit (fire fake events, assert disconnect count) | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-01 | 16-01 | 1 | WATCH-05 | — | per-batch re-resolve calls `querySelectorWithShadow`; stale (`!isConnected`) cache hit busted (Pitfall 6) | unit (mock selectors + swapped node) | `node tests/trigger-observe.test.js` | ✅ exists | ✅ green |
| 16-04 | 16-04 | 2 | WATCH-05 | — | SOURCE: full-reload re-arm wired off `webNavigation.onCommitted`/`ensureContentScriptInjected`; google-gated SPA hooks NOT relied on | static-grep (source assertions) | `node tests/trigger-lifecycle.test.js` | ✅ exists | ✅ green |
| 16-02 | 16-02 | 1 | VIS-01 | — | SOURCE: `@keyframes fsb-trigger-pulse` present, animates opacity/transform only (no box-shadow/top/left); distinct `.box-overlay.trigger-pulse` | static-grep on visual-feedback.js | `node tests/trigger-observe-pulse.test.js` | ✅ exists | ✅ green |
| 16-02 | 16-02 | 1 | VIS-01 | — | `ActionGlowOverlay.showPulse(el)` adds `trigger-pulse` class to boxOverlay | unit (vm sandbox) | `node tests/trigger-observe-pulse.test.js` | ✅ exists | ✅ green |
| 16-02 | 16-02 | 1 | VIS-02 | — | `buildOverlayState({mode:'trigger-watch'})` includes `mode:'trigger-watch'`; no existing field changed | unit | `node tests/test-overlay-state.js` | ✅ exists | ✅ green |
| 16-02 | 16-02 | 1 | VIS-03 | — | `clearPulse()` removes class + destroys overlay; `beforeunload`/non-persisted `pagehide` clears it | unit (vm sandbox) | `node tests/trigger-observe-pulse.test.js` | ✅ exists | ✅ green |
| 16-04 | 16-04 | 2 | VIS-03 | — | SOURCE: fire SEAM path + `deadline_at` reap delete the snapshot so nothing re-asserts the pulse (already covered) | covered | `node tests/trigger-lifecycle.test.js` | ✅ exists | ✅ green |
| 16-02 | 16-02 | 1 | VIS-04 | — | SOURCE: `@media (prefers-reduced-motion: reduce)` sets `animation:none` on `.box-overlay.trigger-pulse` + keeps a static cue | static-grep | `node tests/trigger-observe-pulse.test.js` | ✅ exists | ✅ green |
| 16-04 | 16-04 | 2 | INV-04 | — | SOURCE: `extension/ai/agent-loop.js` byte-unchanged (setTimeout count guard) | static (diff/grep) | `node tests/agent-loop-empty-contents.test.js` | ✅ exists | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/trigger-observe.test.js` — WATCH-01 + WATCH-05 (observe-options, debounce-coalesce, report shape, idempotent start, **leak test**, BF-cache `pagehide` nuance, per-batch re-resolve + stale-cache bust, stale marker re-arm regression). Harness: `vm.createContext` content sandbox + stub `MutationObserver` recording observe/disconnect pairs, fake `document`/`setTimeout`/`chrome.runtime.sendMessage`.
- [x] `tests/trigger-observe-pulse.test.js` — VIS-01 + VIS-03 + VIS-04 (showPulse/clearPulse class toggle via the vm-sandbox `ActionGlowOverlay`; source-grep keyframe / opacity-only / reduced-motion invariants).
- [x] Extend `tests/trigger-lifecycle.test.js` — add: SW writes `reported_value`, on-report path fires on edge-true and disarms; attribute reports pass through the SEAM; background source invariants cover full-reload re-arm.
- [x] Extend `tests/test-overlay-state.js` — assert `mode:'trigger-watch'` additive field; no existing field regressed.
- [x] Append both new files to the `package.json` `test` chain (beside `trigger-cap.test.js`).
- [x] Framework install: none — Node built-in test pattern already in place.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live React/Vue/Angular ticker fires with no reload | WATCH-01 | Node mocks can't exercise real framework re-render + layout | Phase 20 UAT: arm a live-observe trigger on a real SPA ticker (e.g. a crypto price), confirm fire with no reload |
| BF-cache re-arm timing (observer survives, no double-fire) | WATCH-05 | Real BF-cache freeze/restore unavailable in Node | Phase 20 UAT: navigate away + Back; confirm the surviving observer fires once, no duplicate |
| Busy-ticker frame budget (no jank) | WATCH-01 | Real layout/paint required | Phase 20 UAT: observe a high-frequency ticker; confirm no dropped frames while armed |
| Pulse reads "gentle + distinct from run_task glow", reduced-motion static cue | VIS-01, VIS-04 | Visual confirmation needs a real browser | Phase 20 UAT: arm a trigger, visually confirm the pulse vs a concurrent run_task glow; toggle OS reduced-motion and confirm static cue |

> Deferred per CONTEXT D-12 (Phase-14/15 / v0.10.0 deferred-closeout pattern). Autonomous code 100% covered by Node-mock tests above.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (the two new test files + extensions)
- [x] No watch-mode flags
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

> `wave_0_complete` is true after execution: `tests/trigger-observe.test.js`, `tests/trigger-observe-pulse.test.js`, the lifecycle extension, and the overlay-state extension are all present and green in `npm test`.

**Approval:** approved 2026-06-16 (plan-checker verified — Dimension 8 passes against plan content)
