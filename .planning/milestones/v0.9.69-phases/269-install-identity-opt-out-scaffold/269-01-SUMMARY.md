---
phase: 269
plan: 01
subsystem: telemetry-foundation
tags: [telemetry, install-identity, opt-out, kill-switch, chrome.storage.local, uuidv4]
requires:
  - chrome.storage permission (manifest.json line 9 -- already present)
provides:
  - globalThis.fsbInstallIdentity.getOrCreateInstallUuid
  - globalThis.fsbInstallIdentity.isTelemetryOptedOut
  - globalThis.fsbInstallIdentity.setTelemetryOptOut
  - globalThis.fsbInstallIdentity.FSB_INSTALL_UUID_KEY
  - globalThis.fsbInstallIdentity.FSB_TELEMETRY_OPT_OUT_KEY
  - chrome.storage.local.fsbInstallUuid (string, v4 UUID)
  - chrome.storage.local.fsbTelemetryOptOut (boolean, true = opted out)
  - control_panel.html Privacy & Telemetry settings-card with toggle
affects:
  - downstream Phase 271 MCPMetricsRecorder (will read globalThis.fsbInstallIdentity)
  - downstream Phase 272 TelemetryCollector (will read UUID + opt-out on every flush)
tech-stack:
  added:
    - crypto.randomUUID (native MV3 SW since Chrome 92 -- no polyfill)
  patterns:
    - function/prototype module on globalThis (mirrors extension/ai/cost-tracker.js)
    - importScripts chain hook at TOP of background.js (before analytics.js)
    - CommonJS module.exports for Node test harness (mirrors cost-tracker.js)
key-files:
  created:
    - extension/utils/install-identity.js
    - tests/install-identity.test.js
  modified:
    - extension/background.js (importScripts + onInstalled + onStartup hooks)
    - extension/ui/control_panel.html (Privacy & Telemetry card + inline script)
    - package.json (test chain insertion after cost-tracker)
decisions:
  - D-01 (UUID v4 via crypto.randomUUID -- no polyfill) -- implemented
  - D-02 (kill-switch only, ON by default, no banner) -- implemented
  - D-11 / IDENT-04 (chrome.storage.local only, no .sync) -- grep-gated
  - CONTEXT D-decision (camelCase storage keys -- fsbInstallUuid, fsbTelemetryOptOut)
metrics:
  duration: 5m 20s
  tasks_completed: 3
  files_created: 2
  files_modified: 3
  commits: 3
  test_assertions_added: 23
  completed_date: 2026-05-14
status: complete
---

# Phase 269 Plan 01: Install Identity + Opt-Out Scaffold Summary

Anonymous v4 install UUID + telemetry kill-switch toggle landed as the foundation
block of v0.9.69's telemetry pipeline; no outbound HTTP, no event collection, no
server contract -- those are Phases 272 / 273.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create install-identity.js module + boot-time integration | `f3c265d` | `extension/utils/install-identity.js`, `extension/background.js` |
| 2 | Add Privacy & Telemetry settings-card with toggle wiring | `2949a7d` | `extension/ui/control_panel.html` |
| 3 | Add tests/install-identity.test.js + wire into npm test chain | `be60b60` | `tests/install-identity.test.js`, `package.json` |

## Requirements Satisfied (7/7)

| REQ-ID | Requirement | Evidence |
|--------|-------------|----------|
| IDENT-01 | Stable v4 UUID minted on first run, stored in chrome.storage.local | `extension/utils/install-identity.js:54-72`; tested at `tests/install-identity.test.js:170-192` |
| IDENT-02 | UUID survives extension reload via onInstalled + onStartup | `extension/background.js:13022-13031` (onInstalled) + `extension/background.js:13063-13072` (onStartup); tested at `tests/install-identity.test.js:196-211` |
| IDENT-03 | getOrCreateInstallUuid returns null on storage unavailable | `extension/utils/install-identity.js:75-79`; tested at `tests/install-identity.test.js:215-231` |
| IDENT-04 | Cross-device linkability is impossible (chrome.storage.local only) | Grep-gated in module source AND test source; tested at `tests/install-identity.test.js:269-282` |
| IDENT-05 | Module export surface is identity-only | Exports limited to 5 functions/constants + 1 regex; no URL/DOM/prompt/clipboard fields |
| CONS-01 | Kill-switch toggle in Control Panel Advanced Settings (ON by default) | `extension/ui/control_panel.html:632-665` (card + toggle); tested at `tests/install-identity.test.js:235-265` |
| CONS-02 | Toggle write reflects within 100ms (sync visual flip + async storage write) | `extension/ui/control_panel.html` inline `<script>` at end -- browser-native checkbox visual flip is synchronous; chrome.storage.local.set fires-and-forgets |

## Files Created

### `extension/utils/install-identity.js` (146 lines)

Function/prototype module attached to `globalThis.fsbInstallIdentity`. Public surface:

- **`getOrCreateInstallUuid()`** -- async, lazy-mints v4 UUID; persists under
  `chrome.storage.local.fsbInstallUuid`. Defensive v4 regex re-validation on
  every read; corruption path emits ONE warn log and re-mints. Returns `null`
  on any storage error (no throw, no session-only fallback).
- **`isTelemetryOptedOut()`** -- async, returns `true` ONLY when
  `chrome.storage.local.fsbTelemetryOptOut === true`. Default and storage-error
  path: `false` (telemetry ON).
- **`setTelemetryOptOut(value)`** -- async, writes `Boolean(value)` under
  `fsbTelemetryOptOut`. Used by control-panel toggle wiring AND Node tests.
- **`FSB_INSTALL_UUID_KEY = 'fsbInstallUuid'`**
- **`FSB_TELEMETRY_OPT_OUT_KEY = 'fsbTelemetryOptOut'`**
- **`module.exports`** -- mirrors `globalThis.fsbInstallIdentity` plus
  `UUID_V4_REGEX` for the Node test harness.

### `tests/install-identity.test.js` (270 lines, 23 assertions, 7 sections)

Sections:
1. Mint-once on first call (IDENT-01) -- 6 assertions
2. Reuse-on-restart (IDENT-02) -- 2 assertions
3. Null on storage unavailable (IDENT-03) -- 2 assertions
4. Opt-out round-trip (CONS-01, CONS-02) -- 6 assertions
5. Defensive re-mint on corruption -- 4 assertions
6. IDENT-04 grep gate -- 1 assertion
7. Storage-key string locks (camelCase per CONTEXT D-decision) -- 2 assertions

All 23 assertions pass on a fresh `node tests/install-identity.test.js` invocation.

## Files Modified

### `extension/background.js`

1. **Line 7** (top of importScripts chain, BEFORE analytics.js at line 35):
   ```javascript
   importScripts('utils/install-identity.js');
   ```

2. **`chrome.runtime.onInstalled` (line 13022-13031)**: try/catch wrapper that
   calls `globalThis.fsbInstallIdentity.getOrCreateInstallUuid()` between
   `initializeAnalytics()` and `await loadDebugMode()`. Single `console.log` on
   success; defensive `console.error` if module regresses to throwing.

3. **`chrome.runtime.onStartup` (line 13063-13072)**: Same try/catch block --
   idempotent get-or-create on every service-worker wake.

### `extension/ui/control_panel.html`

1. **Lines 632-665**: New `<div class="settings-card" id="card-privacy-telemetry">`
   inserted as the LAST child of `.advanced-settings-grid` (after the
   Developer Card, before the grid's closing `</div>`). Reuses existing
   `.settings-card`, `.modern-toggle`, `.toggle-track`, `.toggle-thumb`,
   `.toggle-content`, `.setting-hint` classes verbatim. Icon: `fa-shield-alt`
   (already in the bundle, used at line 1397+ for sibling cards).

2. **Inline `<script>` before `</body>` (lines 1577-1622)**: DOMContentLoaded
   handler reads `chrome.storage.local.fsbTelemetryOptOut`, sets
   `checkbox.checked = !optedOut` (inverse semantics: checked = ON), wires
   change-event to write `!checked` back to storage, dynamically updates
   aria-label between the two CONS-02 announced states.

### `package.json`

`scripts.test`: Inserted `node tests/install-identity.test.js` immediately
after `node tests/cost-tracker.test.js` (groups with related cost / analytics
tests as the plan instructed).

## Decisions Implemented

| Decision | Source | File:Line |
|----------|--------|-----------|
| D-01: UUID v4 via crypto.randomUUID() (no polyfill) | User Q1 + PITFALLS 10.1 | `extension/utils/install-identity.js:71` |
| D-02: Kill-switch only, ON by default, NO first-run banner | User Q2 + Q3 | `extension/ui/control_panel.html:649` (`checked` attribute) |
| D-11 / IDENT-04: chrome.storage.local exclusively, NEVER .sync | PITFALLS 3.4 | Grep-gated in `tests/install-identity.test.js:269-282` |
| CONTEXT D-decision: camelCase storage keys (fsbInstallUuid, fsbTelemetryOptOut) | CONTEXT.md line 44 | `extension/utils/install-identity.js:34-35` |

## Patterns to Follow Downstream

Phase 271 (MCPMetricsRecorder) and Phase 272 (TelemetryCollector) should:

1. **Lazy-fetch the UUID on first use**, not on module-load:
   ```javascript
   const installUuid = await globalThis.fsbInstallIdentity.getOrCreateInstallUuid();
   if (!installUuid) return; // no-op when storage is unavailable
   ```

2. **Re-check opt-out on every flush** (BEAT-07 -- "read live, not cached"):
   ```javascript
   if (await globalThis.fsbInstallIdentity.isTelemetryOptedOut()) {
     // Clear queue, do NOT POST
     return;
   }
   ```

3. **Never bypass the kill switch**: even on local persistence paths (Phase 271's
   per-call analytics log can still record locally, but ANY outbound write must
   gate on `isTelemetryOptedOut()` per CONS-01).

4. **Never add chrome.storage.sync for ANY telemetry-related key** -- the IDENT-04
   grep gate in `tests/install-identity.test.js:269-282` only scans
   `extension/utils/install-identity.js`. New telemetry modules should add their
   own grep-gate test section OR extend this one.

## Deviations from Plan

**None** -- plan executed exactly as written. Decisions, file paths, line
references, class names, and verification commands all matched the plan.

The one architecturally documented deviation is between the plan and
REQUIREMENTS.md IDENT-01 verbatim text: the storage key is `fsbInstallUuid`
(camelCase) NOT `fsb_install_uuid` (snake_case). This was already locked in
CONTEXT.md as the project-convention decision (sibling keys: `fsbUsageData`,
`fsbCurrentModel`, `fsbSessionLogs`) and is reflected in IDENT-04 grep gate
tests (`tests/install-identity.test.js:269-282`).

## Test Commands

- **Unit tests:** `node tests/install-identity.test.js`
  -- prints 23 PASS lines across 7 sections, exits 0.
- **Module shape:** `node -e "const m = require('./extension/utils/install-identity.js'); console.log(Object.keys(m));"`
  -- prints the 6 exported identifiers.
- **IDENT-04 grep gate (CI-callable):**
  `grep -v '^//\|^[[:space:]]*\*\|^[[:space:]]*//' extension/utils/install-identity.js | grep -c 'chrome\.storage\.sync'`
  -- prints `0`.
- **Full suite:** `npm test` (chain failure at `mcp` build step in this worktree is
  pre-existing environmental: `mcp/node_modules` not installed, `tsc: command not
  found`. NOT caused by this phase.)

## Manual Test Plan (Chrome-Required)

Since the agent cannot drive Chrome directly, the following manual steps are
required by the developer / reviewer to fully verify CONS-02 and IDENT-02 in a
real MV3 service-worker environment:

1. **Load unpacked** -- chrome://extensions -> Developer Mode ON -> Load unpacked
   -> select `extension/` directory.

2. **Verify boot-time UUID mint** -- Open chrome://extensions, click "Inspect
   views: service worker" for FSB. In DevTools console, expect:
   ```
   [FSB Telemetry] Install UUID seeded
   ```
   In DevTools -> Application -> Storage -> Local Storage -> the extension's
   origin -> expect a row: `fsbInstallUuid` with a v4 UUID string value.

3. **Verify card render (CONS-01)** -- Open Control Panel (extension popup or
   side panel) -> Advanced Settings tab. Scroll to the bottom of the cards
   grid. Expect:
   - Card titled "Privacy & Telemetry" with a shield icon.
   - Subtitle "Anonymous usage data".
   - Toggle labeled "Send anonymous usage data" (CHECKED by default = ON).
   - Subtitle: "Tokens used, MCP client name, active agent count. No URLs, prompts, or DOM."
   - "Read full policy ->" link.

4. **Verify toggle response (CONS-02 -- 100ms target)** -- Click the toggle.
   The visible track/thumb animation completes well under 100ms (browser-native
   checkbox visual flip is synchronous). Refresh the panel; toggle stays OFF.

5. **Verify storage write** -- Re-open the SW inspector DevTools. Application
   -> Storage -> Local Storage. Expect `fsbTelemetryOptOut` = `true` when
   toggle is OFF, value missing OR `false` when toggle is ON.

6. **Verify UUID survives reload** -- chrome://extensions -> click reload
   button. Re-open SW DevTools; the storage row `fsbInstallUuid` value is
   UNCHANGED (same UUID as step 2). Console log shows:
   `[FSB Telemetry] Install UUID seeded` again (from `onStartup`).

7. **Verify UUID survives service-worker eviction** -- Close DevTools, wait
   ~30s for SW eviction, perform any action that wakes the SW (e.g., open the
   side panel). Re-inspect storage -- UUID still unchanged.

8. **Verify incognito profile no-throw** -- Right-click the extension icon ->
   Manage Extension -> "Allow in Incognito". Open an Incognito window, open
   the Control Panel. Expect no errors in console; toggle defaults to ON
   (chrome.storage.local may be unavailable in some incognito SW contexts --
   per IDENT-03, the module returns null silently and the UI defaults to ON).

## Self-Check: PASSED

- `extension/utils/install-identity.js` exists -- FOUND
- `tests/install-identity.test.js` exists -- FOUND
- `extension/background.js` modified (importScripts + 2 lifecycle hooks) -- FOUND
- `extension/ui/control_panel.html` modified (card + inline script) -- FOUND
- `package.json` test chain updated -- FOUND
- Commit `f3c265d` -- FOUND in `git log`
- Commit `2949a7d` -- FOUND in `git log`
- Commit `be60b60` -- FOUND in `git log`
- All 7 plan-level verification gates PASS (Gate 1-7 automated; Gate 8 manual)
- All 23 unit test assertions PASS
- IDENT-04 grep gate: 0 chrome.storage.sync references in module source
