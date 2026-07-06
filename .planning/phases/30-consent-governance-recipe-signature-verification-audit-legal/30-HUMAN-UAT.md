---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
plan: 04
status: human_needed
created: 2026-06-21
---

# Phase 30 Plan 04 Human UAT: Consent & Audit Control-Panel Live Smoke

This is the live render/interaction half of the GOV-07 "Consent & Audit" control-panel section (30-04). It was NOT executed in the autonomous, no-live-browser run and must not be treated as passed until a human records the observed result. It is recorded here as `human_needed` live-UAT, matching the Phase 27/28/29 posture (the live half is documented debt, not a fabricated pass; it does NOT block the headless CI gate).

## Why this is human_needed (not CI-provable)

The Consent & Audit section is a vanilla MV3 control-panel surface (`extension/ui/control_panel.html` + `extension/ui/options.js`) that renders the per-origin consent list, the pending-Ask queue, and the redacted audit-log table from the Plan-02/03 stores (`consent-policy-store.js`, `audit-log.js`, `service-denylist.js`).

The CI suite proves every FSB-owned property of this surface headlessly through source-text assertions and the gate's own unit tests:

- `tests/consent-audit-settings-ui.test.js` (52/0) reads `control_panel.html` + `options.js` as TEXT and proves the full 30-UI-SPEC Acceptance-Criteria surface: the `data-section="consent-audit"` nav + `<section id="consent-audit">` shell, `#consentOriginList` with the Off/Ask/Auto `data-mode` segmented control inside a `role="radiogroup"` + the `Allow mutating (write) calls` toggle + the Sensitive/Blocked badges, `#pendingRequestList` with Grant/Deny (`.control-btn.danger`), `#auditLogTable` as a real `<table>`+`<thead>` with the SEVEN redacted column headers, `auditExportBtn`/`auditClearBtn` with their click handlers, the `cacheElements` wiring of all five ids, the `chrome.storage.onChanged` re-render subscription, the `Legal & Service Policy` card linking `LEGAL.md` + the denylist + `privacy.html`, the string-absence of every auth artifact (`args`/`body`/`cookie`/`token`/`csrf`/`authorization`/`bearer`) from the audit table (GOV-06 at the UI layer), and no emoji anywhere in the section.
- `tests/showcase-privacy-page.test.js` (53/0) proves the public privacy page still carries its full telemetry disclosure after the new Legal Posture cross-link (D-15) was added — no regression.
- The gate-side SECURITY BOUNDARY is automated, not deferred: `tests/consent-gate.test.js` proves the sensitive-origin + Auto downgrade (`classify().sensitive` AND mode `auto` -> NON-allow `RECIPE_CONSENT_REQUIRED` / `consentDecision:'sensitive'`, no `executeBoundSpec`) and the denylist-checked-first block. The UI's amber Sensitive badge + disabled Auto segment merely REFLECT that gate decision by reading the SAME `FsbServiceDenylist.classify` source of truth (D-14); the UI is a consistent visual surface, never the enforcement boundary.

The ONE class of property the CI suite CANNOT prove is the irreducibly-live one: that the section actually RENDERS in a real browser control panel (Font Awesome icons, the segmented control + toggle layout, the badge colors), that clicking Off/Ask/Auto + the mutating toggle persists to the consent store and re-paints, that Grant/Deny mutate the queue and the `chrome.action` badge, and that a sensitive/denylisted origin shows the correct friction in the live DOM. Rendering the MV3 options page and driving its clicks requires loading the unpacked extension in a real Chrome — which cannot run in the headless CI gate.

## Setup

1. Load `extension/` as an unpacked Chrome extension (per the project FSB browser-automation policy, drive these via the FSB MCP browser tools).
2. Open the FSB Control Panel (the extension options page).
3. Navigate to the new "Consent & Audit" nav entry.
4. To populate the per-origin list + audit table with data, invoke a capability against a few origins first (the gate appends an audit entry on every outcome and a policy record is written when you set a mode), including at least one sensitive origin (e.g. `https://mail.google.com`) and one denylisted origin (e.g. `https://www.chase.com`) from `extension/config/service-denylist.json`.
5. NEVER record or paste a real token/cookie/credential value into this file — record only the observed UI shape, redacted.

## Required Scenarios

| ID | Procedure | Expected Outcome | Status |
|----|-----------|------------------|--------|
| UAT-30-01 | Open the control panel, go to Consent & Audit. (a) Confirm the per-origin list, the pending-requests queue, and the audit-log table all render (empty states when there is no data). (b) Toggle an ordinary origin through Off / Ask / Auto and confirm the active segment + the `Allow mutating (write) calls` toggle enable state update and persist (re-open the section / reload). (c) On a SENSITIVE origin (`https://mail.google.com`), confirm the amber `Sensitive` badge shows and the `Auto` segment is disabled. (d) On a DENYLISTED origin (`https://www.chase.com`), confirm the row is greyed, the red `Blocked` badge shows, and all controls are disabled. (e) Grant a pending request and confirm the row clears, the `N pending` count updates, and the `chrome.action` toolbar badge clears when the queue empties; Deny a request and confirm it clears WITHOUT granting. (f) Click `Export Log` and confirm a redacted `fsb-audit-log-*.json` downloads with NO args/tokens/cookies/bodies; click `Clear Log`, confirm the destructive confirm, and confirm the table returns to the empty state. | The section renders with the existing control-panel visual language; mode/mutating changes persist to the consent store; the Sensitive (amber, Auto-disabled) and Blocked (red, non-enableable) friction matches `classify`; Grant/Deny mutate the queue + badge; Export/Clear behave like the diagnostics export/clear; the exported JSON and the table carry only the seven redacted columns. | human_needed |

## Recording Results

When executed, replace the `human_needed` status with `pass`, `fail`, or `partial`, and add the date, Chrome version, extension commit, and a short observed-outcome note (what rendered, whether the persisted mode survived a reload, whether the sensitive/denylisted friction matched, and that the export/table carried no secret field — redacted to shape, never a literal token/cookie/credential). Before recording, re-verify the section's behavior at run time. Do NOT mark the 30-04 live smoke complete until UAT-30-01 has a recorded outcome (or a documented deferral). The headless CI gate (`consent-audit-settings-ui` 52/0, `showcase-privacy-page` 53/0, and the gate-side `consent-gate` enforcement) does NOT depend on this step.
