# Phase 269: Install Identity + Opt-Out Scaffold - Context

**Gathered:** 2026-05-14
**Status:** Plans created
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** IDENT-01, IDENT-02, IDENT-03, IDENT-04, IDENT-05, CONS-01, CONS-02

<domain>
## Phase Boundary

Every FSB install carries a stable, anonymous identity gated by a visible user-controlled kill switch.

**In scope:**
- New extension module that lazily mints and persists a UUIDv4 install identifier in `chrome.storage.local`.
- Lazy-mint integrated with both `chrome.runtime.onInstalled` and `chrome.runtime.onStartup` lifecycle hooks.
- New "Privacy & Telemetry" card in the extension Control Panel's Advanced Settings section, containing a kill-switch toggle.
- Tests covering mint-once, reuse-on-restart, storage-unavailable no-op, and opt-out write/read.

**Explicitly NOT in scope (downstream phases):**
- The telemetry collector itself (Phase 272).
- The MCP metrics recorder hooks (Phase 271).
- Any server-side route (Phase 273).
- First-run privacy banner (deferred per D-02; this phase ships kill-switch-only).
- "View what we send" panel, "Reset anonymous ID" button, "Wipe my data" button (deferred per D-02 / TELEMETRY-FUTURE-01..04).

</domain>

<decisions>
## Implementation Decisions

### Module organization
- Module path: `extension/utils/install-identity.js` -- matches existing `extension/utils/analytics.js` pattern.
- Export pattern: `globalThis.fsbInstallIdentity` function/prototype style (NOT ES module) -- `importScripts`-compatible with MV3 service worker chain; mirrors the `CostTracker` precedent at `extension/ai/cost-tracker.js`.
- Boot integration: top of `extension/background.js` `importScripts` chain, BEFORE `analytics.js` -- guarantees downstream modules can call `getOrCreateInstallUuid()` synchronously after boot.
- Error semantics on storage unavailable: `getOrCreateInstallUuid()` returns `null` (no throw, no session-only UUID fallback). Downstream telemetry collector (Phase 272) treats null as no-op per IDENT-03.

### Kill-switch UI placement
- Section location: new top-level **"Privacy & Telemetry"** card inside `#advanced` section grid -- peer to other Advanced Settings cards, NOT buried under Debug or Diagnostics.
- Toggle label: **"Send anonymous usage data"** -- direct, no marketing-speak, matches Plausible / Mozilla wording style.
- Helper text below toggle: one-line subtitle -- *"Tokens used, MCP client name, active agent count. No URLs, prompts, or DOM."* -- followed by *"Read full policy"* link to `/privacy#telemetry-disclosure`.
- Default state: ON (locked by D-02). Layout: label + subtitle on the left, toggle on the right, "Read full policy" link below the subtitle.

### Storage keys + test coverage
- UUID storage key: `fsbInstallUuid` -- camelCase matches existing FSB convention (`fsbUsageData`, `fsbCurrentModel`, `fsbSessionLogs`). **This deviates from REQUIREMENTS.md IDENT-01's verbatim `fsb_install_uuid` (snake_case); the deviation is intentional and user-confirmed during smart-discuss** -- existing codebase consistency wins over the doc's literal phrasing.
- Opt-out storage key: `fsbTelemetryOptOut` -- boolean, `true` = opted out. Matches BEAT-07 read pattern.
- Unit tests: new `tests/install-identity.test.js` covering: (a) mint-once on first call; (b) reuse-existing on second call; (c) `null` returned when `chrome.storage.local` mock unavailable; (d) opt-out toggle write/read round-trip.
- UUID validation on read: defensive re-mint if stored value fails `crypto.randomUUID()` v4 shape regex check; log one warning line and continue with the fresh UUID.

### Claude's Discretion
- Exact CSS / Tailwind / inline-style choices for the Privacy & Telemetry card -- match the visual treatment of sibling Advanced Settings cards.
- Specific `console.log` / debug-level wording for warnings.
- Exact order of properties in the JSDoc / function signatures (follow existing module conventions).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/utils/analytics.js` -- the canonical pattern for a function/prototype module attached to `globalThis`, sharing storage state with `background.js`. Mirror its file shape.
- `extension/ai/cost-tracker.js` -- the closest analogue for "storage-backed accumulator with broadcast on change". Mirror its `broadcastAnalyticsUpdate` pattern when CONS-01/02 require a UI re-render on toggle.
- `extension/manifest.json` -- already declares `chrome.storage` + `chrome.alarms` permissions and `unlimitedStorage`. No manifest change needed for Phase 269.
- `extension/ui/control_panel.html:333` -- `<section class="content-section" id="advanced">` is the Advanced Settings root; line 341's `<div class="advanced-settings-grid">` is where the new "Privacy & Telemetry" card mounts.
- `tests/` directory -- existing test harness (Node-based) already runs in `npm test` chain; add `tests/install-identity.test.js` to that pattern.

### Established Patterns
- All FSB extension storage keys use camelCase with `fsb` prefix: `fsbUsageData`, `fsbCurrentModel`, `fsbResearchData`, `fsbSessionLogs`, `fsbJobAccumulator`, `fsbResearchIndex`.
- Module bootstrap = `importScripts` chain in `background.js`; modules attach themselves to `globalThis` for cross-module access without ES imports.
- Control panel sections live under `extension/ui/control_panel.html` with content-section IDs and matching nav items at line 74-77 (`data-section="advanced"`).
- Test files at `tests/<feature>.test.js` register into the root `npm test` chain via `package.json` scripts.

### Integration Points
- `extension/background.js` `importScripts` chain (top): new line for `importScripts('utils/install-identity.js')` BEFORE the existing `analytics.js` import.
- `extension/background.js` `chrome.runtime.onInstalled` listener (~line 13015 per ARCHITECTURE research): call `getOrCreateInstallUuid()` to seed the UUID and emit a one-time `console.log('[FSB Telemetry] Install UUID seeded')` debug line.
- `extension/background.js` `chrome.runtime.onStartup` listener (~line 13051): same call, idempotent.
- `extension/ui/control_panel.html:341` `<div class="advanced-settings-grid">` end: append new `<div class="advanced-settings-card" id="card-privacy-telemetry">` block with toggle.
- `extension/ui/` JavaScript binding the toggle: a new small `extension/ui/install-identity-ui.js` (or extend `extension/ui/control_panel.js` if a single file already wires Advanced Settings) -- defer exact JS file pick to plan-phase based on existing UI wiring discovery.

</code_context>

<specifics>
## Specific Ideas

- The toggle's "Read full policy" link target `/privacy#telemetry-disclosure` will not exist until Phase 275. For Phase 269 the link is added but lands on the existing `/privacy` page (anchor falls back to page top). Phase 275 adds the anchor target. This is acceptable: link is forward-compatible.
- `crypto.randomUUID()` is available in MV3 service workers natively (no polyfill needed) per STACK research §3.2.
- The Phase 269 toggle ON/OFF state is read by the Phase 272 `TelemetryCollector` on every flush; this phase only writes the state. Phase 269 must NOT add any flush behavior.

</specifics>

<deferred>
## Deferred Ideas

- First-run privacy banner (TELEMETRY-FUTURE-01).
- "View what we send" live JSON preview panel (TELEMETRY-FUTURE-02).
- "Reset anonymous ID" button (TELEMETRY-FUTURE-03).
- "Wipe my telemetry data" in-extension button (TELEMETRY-FUTURE-04 -- backend ships in Phase 273 INGEST-12; the curl recipe is documented in privacy policy in Phase 275 per CONS-07).
- Region-gated opt-IN for EU/UK installs (TELEMETRY-FUTURE-05).
- Read-only UUID display in Advanced Settings for users wanting to issue the curl forget recipe -- deferred to Phase 275 / CONS-07 so the UUID display copy can be co-located with the curl recipe explanation.

</deferred>
