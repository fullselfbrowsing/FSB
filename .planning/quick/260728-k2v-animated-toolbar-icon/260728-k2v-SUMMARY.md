---
quick: 260728-k2v
plan: 01
subsystem: extension-ui
tags: [chrome-action, toolbar-icon, offscreen-canvas, overlay-parity, badge-removal]
requires:
  - extension/utils/overlay-state.js (buildOverlayState -> highlight.animated + phase)
  - extension/assets/icon128.png (base glyph)
  - chrome permissions already present: alarms, storage
provides:
  - globalThis.fsbActionIcon (init / applyOverlayState / setWatching / setConnected / repair)
  - fsb-action-icon-watchdog alarm (30s)
  - chrome.storage.session key fsbActionIconIntent
affects:
  - extension/background.js (single wiring surface)
  - extension/ws/ws-client.js (connection strength hook replaces badge)
  - extension/ui/options.js (dead badge bookkeeping removed)
  - extension/lib/memory/memory-extractor.js (stranded error badge removed)
tech-stack:
  added: []
  patterns:
    - OffscreenCanvas + ImageData frame precompute in the MV3 service worker
    - wall-clock-derived frame index (self-correcting setInterval loop)
    - progress-fraction retime ported from ViewportGlow.setState
    - chrome.storage.session intent persistence for SW-eviction recovery
key-files:
  created:
    - extension/utils/action-icon.js
  modified:
    - extension/background.js
    - extension/ws/ws-client.js
    - extension/ui/options.js
    - extension/lib/memory/memory-extractor.js
    - tests/lattice-provider-bridge-smoke.test.js
decisions:
  - Watching is a static frame, never a loop (a perpetual setIcon loop is a keepalive pattern Chrome restricts).
  - Transparent background; no opaque fill, because a worker cannot read the toolbar theme.
  - setIcon is always global and always carries both 16 and 32; never surface-scoped.
  - Four static frames (idle/watching x connected/disconnected) rather than dimming at emit time.
metrics:
  tasks: 3 planned + 1 deviation
  commits: 4
  completed: 2026-07-28
---

# Quick 260728-k2v: Animated toolbar action icon Summary

Replaced the green/red `chrome.action` badge dot with a state-driven toolbar icon that
precomputes 217 frames from `assets/icon128.png` and mirrors ViewportGlow's periods,
palettes, phase map and retime behaviour exactly.

## What shipped

`extension/utils/action-icon.js` owns 100% of the canvas, timer and persistence logic and
exposes a frozen five-method API on `globalThis.fsbActionIcon`. It precomputes 213 animated
frames (thinking 91 / acting 61 / calling 61) plus 4 static frames (idle and watching, each
at connected and disconnected strength), every one rendered at both 16 and 32, then never
renders again inside the tick.

`background.js` is the only wiring surface, exactly as the plan specified: one module load,
one `sendSessionStatus` tee, two trigger hooks, one bootstrap, one alarm-registration pair,
one alarm branch.

`ws-client.js` lost both badge methods and all five `chrome.action` references and gained
exactly three guarded one-liners. It references no timer, canvas or fetch API, so it still
executes cleanly in the bare VM sandbox that `stream-candidate-resolution.test.js` uses.

## Must-have truths — verified

| Truth | Evidence |
|---|---|
| Badge gone; nothing calls `setBadgeText` / `setBadgeBackgroundColor` | repo-wide grep over `extension/` returns zero hits |
| Animated orbit bead matches ViewportGlow period + palette | periods and hex values read directly from `visual-feedback.js:1216-1221` and `:1372-1403` |
| Session end / clear / disabled snaps to static and stops the loop | stubbed-worker smoke: emit count frozen across 250ms after disarm |
| Arming a watch paints one static frame; no loop ever runs | stubbed-worker smoke: exactly 1 emit on arm, 0 further emits across 250ms |
| Idle frame full-strength connected, dimmed disconnected | four static frames keyed `idle:on` / `idle:off` / `watching:on` / `watching:off` |
| SW restart mid-session re-derives and restarts from frame 0 | stubbed-worker smoke: persisted `animating` intent + live probe restarts the loop; probe false snaps to static and corrects the record |

The runtime behaviour above was exercised against a stubbed `OffscreenCanvas` /
`createImageBitmap` / `chrome.storage.session` worker sandbox, including the
degraded-environment path (missing `OffscreenCanvas` or `chrome.action` makes every method a
silent no-op) and both eviction-recovery branches.

## Tripwires handled

- `tests/lattice-provider-bridge-smoke.test.js` count pins refreshed 323 -> **324** and
  319 -> **320** in the same commit as the module load, with a ledger comment appended to
  each block. The token `importScripts` appears in no new comment in `background.js`, so the
  count moved by exactly one.
- `chrome.action.onClicked` listener body untouched — the bootstrap sits after its closing
  `});`. Confirmed safe by reading `extractAfterAnchor`, which is brace-matched and therefore
  stops before the insertion.
- `ws.onopen` block shape preserved: each replacement is a single 6-space-indented line and
  introduces no earlier 4-space-indented `};`.
- No manifest edit, no new permission, `minimum_chrome_version` untouched.
- `source: 'contentScriptReady'` and the surrounding `replayMcpVisualSessionForTab` call left
  byte-identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed the stranded memory-extractor error badge**
- **Found during:** Task 3 final verification sweep
- **Issue:** `extension/lib/memory/memory-extractor.js` had a fourth badge site
  (`_setBadgeError()`, 3 call sites) that was not in the plan's or CONTEXT.md's removal
  tables. Task 3 deleted every badge-*clear* path in the product, so a memory-extraction
  failure would have painted a red `!` on the toolbar that nothing could ever clear —
  permanently, and now as the only badge in the product. It also directly violated the
  plan's must-have truth that no code path calls the badge API anymore.
- **Fix:** Deleted `_setBadgeError()` and its three call sites. All three already
  `console.error` the failure, so no diagnostic signal was lost.
- **Files modified:** `extension/lib/memory/memory-extractor.js`
- **Commit:** `45aa40e1`

## Commit hygiene note (important for whoever lands this)

This workspace was **already carrying 68 modified tracked files plus 5 untracked files** of
unrelated in-flight work (a native-host bootstrap / agent-bridge-readiness /
`testAgentProviderConnection` feature) when execution started. Three of those files —
`extension/background.js`, `extension/ui/options.js` and
`tests/lattice-provider-bridge-smoke.test.js` — overlap with this task.

Rather than sweep that work into these commits, each commit stages **only this task's own
hunks**, verified by marker-filtered patch splitting and by grepping the staged diff for
foreign identifiers (zero hits). The pre-existing WIP was left unstaged and byte-intact.

One consequence to be aware of: the `importScripts` pin value of **324/320 is correct for the
working tree**, which is what every gate actually reads and what passes. It is *not* correct
for `HEAD` in isolation, because HEAD lacks the pre-existing (still-uncommitted)
`utils/native-host-install-command.js` load that accounts for 323/319. These commits are
therefore meant to land together with the surrounding WIP, not to be checked out standalone.
Isolated-commit greenness was already unattainable in this workspace before this task began.

## Verification

| Gate | Result |
|---|---|
| `node --check` + structural gate on `action-icon.js` | PASS |
| Stubbed-worker runtime smoke (24 assertions, 2 scripts) | PASS |
| 15 targeted tripwire tests | PASS |
| `npm run validate:extension` | exit 0 (426 JS files parsed clean) |
| `npm test` (full serial chain) | exit 0, zero failures |
| `git diff --check` | clean |
| `extension/manifest.json` | unmodified |

`npm test` was run twice — once after Task 3 and again after the deviation fix — both exit 0.

## Commits

| Commit | Scope |
|---|---|
| `9e272003` | Task 1 — action-icon module |
| `f9d923bb` | Task 2 — background wiring + paired count pins |
| `aad427af` | Task 3 — badge removal + connection hook |
| `45aa40e1` | Deviation — stranded memory-extractor badge |

## Known Stubs

None. Every surface the plan describes is wired to real data: the icon reads the same
normalized `overlayState` the in-page overlay consumes, the watching frame reads the existing
trigger `counts`, and connection strength reads the real WebSocket transitions.

## Self-Check: PASSED

All 5 touched files present on disk; all 4 commit hashes resolve in `git log`.
