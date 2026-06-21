---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
plan: 04
subsystem: ui
tags: [consent, audit-log, governance, mv3-options, control-panel, vanilla-js, denylist, angular]

# Dependency graph
requires:
  - phase: 30-02
    provides: FsbConsentPolicyStore (readPolicies/setOriginMode/setOriginMutating) + FsbAuditLog (getEntries) + the consent gate
  - phase: 30-03
    provides: FsbServiceDenylist (isDenied/classify) — the gate's sensitive/denied source of truth (D-14)
  - phase: 245
    provides: the change-report toggle UI lifecycle pattern (defaultSettings -> cacheElements -> setupEventListeners -> render)
provides:
  - "A 'Consent & Audit' control-panel section managing per-origin Off/Ask/Auto consent + the separate elevated mutating opt-in, writing straight to FsbConsentPolicyStore (no Save-bar coupling)"
  - "A pending-requests queue (Grant/Deny) and a read-only redacted audit-log viewer (Export/Clear) rendering only the seven whitelisted columns (GOV-06 at the UI layer)"
  - "Sensitive-origin friction (amber badge + disabled Auto) and denylisted non-enableable rows driven by FsbServiceDenylist.classify — the UI reflects the gate's authoritative downgrade (D-14)"
  - "A Legal & Service Policy card + a showcase privacy-page cross-link to the LEGAL.md posture (GOV-08, D-15)"
affects: [phase-31, phase-32, consent-governance, control-panel-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stores-not-defaultSettings UI: a control-panel section that persists immediately to dedicated stores and re-renders on chrome.storage.onChanged, deliberately excluded from the global Save-bar formInputs array"
    - "Row <template> clone-render: hidden <template> rows in the static markup carry the canonical structure (segmented control + toggle / Grant+Deny) so the source-text test sees the contract and options.js render() clones per item"
    - "UI-reflects-gate: the Sensitive/Blocked friction reads the SAME FsbServiceDenylist.classify the gate enforces, so the visual surface can never disagree with the security boundary"

key-files:
  created:
    - .planning/phases/30-consent-governance-recipe-signature-verification-audit-legal/30-HUMAN-UAT.md
  modified:
    - extension/ui/control_panel.html
    - extension/ui/options.js
    - showcase/angular/src/app/pages/privacy/privacy-page.component.html

key-decisions:
  - "Per-origin + pending rows ship as hidden <template> elements in the static HTML (cloned by render()) so the locked source-text strings/ids the RED test asserts live in the markup, not only in JS"
  - "Audit table renders via textContent over a strict 7-field whitelist (never innerHTML, never reading args/tokens/bodies) — defense-in-depth atop the already-redacted ring (GOV-06)"
  - "Sensitive/Blocked friction is computed from FsbServiceDenylist.classify (the gate's source of truth), so the UI is a consistent reflection of the gate, never an independent boundary (D-14)"
  - "Privacy-page cross-link added as a NEW section with fresh @@PRIVACY_LEGAL_POSTURE_* i18n markers to avoid any regression to the existing telemetry-disclosure assertions"

patterns-established:
  - "Stores-not-defaultSettings: consent/audit controls persist straight to their stores + re-render on storage.onChanged, never touching the Save bar"
  - "Row-template clone-render for dynamic control-panel lists"
  - "UI-reflects-gate friction via the shared classify source of truth"

requirements-completed: [GOV-07, GOV-08]

# Metrics
duration: 24min
completed: 2026-06-21
---

# Phase 30 Plan 04: Consent & Audit Control-Panel Section Summary

**A vanilla-MV3 "Consent & Audit" control-panel section that manages per-origin Off/Ask/Auto consent + the elevated mutating opt-in, surfaces a pending-Ask queue (Grant/Deny) and a redacted audit-log viewer (Export/Clear), reflects the gate's sensitive/denylisted friction via the shared classify source of truth, and cross-links the legal posture from the showcase privacy page — turning the consent-audit RED contract GREEN with no new design token and no emoji.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-06-21T18:30:00Z
- **Completed:** 2026-06-21T18:54:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- New "Consent & Audit" nav + `<section id="consent-audit">` cloning the existing settings-card / session-list / logs-display / segmented-control language verbatim — `tests/consent-audit-settings-ui.test.js` 14/52 -> 52/52 GREEN.
- Per-origin list with an Off/Ask/Auto segmented control (`role="radiogroup"`) + a separate `Allow mutating (write) calls` toggle, a pending-requests queue (Grant writes consent for the exact origin/scope only, T-30-16; Deny removes; clearing the queue clears the `chrome.action` badge), and a read-only audit table rendering only the seven redacted columns.
- Sensitive origins get an amber `Sensitive` badge + a disabled `Auto` segment; denylisted origins are greyed with a red `Blocked` badge + all controls disabled — both driven by `FsbServiceDenylist.classify`, reflecting the gate's step-4 downgrade (D-14).
- Legal & Service Policy card + a new showcase privacy-page "Legal Posture and Consent Model" section linking LEGAL.md (D-15), with `tests/showcase-privacy-page.test.js` still 53/53 (no regression).
- Live render/interaction smoke recorded as `human_needed` UAT debt (`30-HUMAN-UAT.md` UAT-30-01), matching the Phase-27/28/29 posture — not a fabricated pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the Consent & Audit section markup to control_panel.html** - `45d24d95` (feat)
2. **Task 2: Wire the section in options.js + cross-link the privacy page** - `6e6f6219` (feat)
3. **Task 3: Record the live control-panel smoke as human_needed UAT debt** - `63e60e6c` (docs)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `extension/ui/control_panel.html` - New nav entry + `#consent-audit` section (per-origin list with a row `<template>`, pending queue with a row `<template>`, the seven-column audit `<table>`, the legal card); loads consent-policy-store / audit-log / service-denylist before options.js. (+205)
- `extension/ui/options.js` - cacheElements (5 locked ids + templates/body/count), delegated listeners (segmented mode, mutating toggle, Grant/Deny, Export/Clear), `chrome.storage.onChanged` re-render subscription (debounced 100ms), and the `renderConsentAudit` / `renderConsentOriginList` / `renderAuditTable` / `exportAuditLog` / `clearAuditLog` / `grantPendingRequest` / `denyPendingRequest` / `updatePendingCount` functions. (+392)
- `showcase/angular/src/app/pages/privacy/privacy-page.component.html` - New "Legal Posture and Consent Model" section linking LEGAL.md, with fresh i18n markers (D-15). (+9)
- `.planning/phases/30-.../30-HUMAN-UAT.md` - Recorded `human_needed` live smoke (UAT-30-01).

## Decisions Made
- **Row templates in static HTML:** the RED test reads `control_panel.html` as text and asserts the Off/Ask/Auto `data-mode` buttons, `role="radiogroup"`, the mutating-toggle label, and Grant/Deny strings. Shipping these as hidden `<template>` rows keeps the locked contract in the markup AND gives `render()` a clean clone source — the standard MV3 pattern.
- **Whitelist-render the audit table:** rows are built via `textContent` over exactly `{ts, origin, slug, method, sideEffectClass, consentDecision, outcome}`, never `innerHTML`, never reading any auth field — defense-in-depth atop the already-redacted ring (T-30-14 / GOV-06).
- **Reflect, don't re-implement, the gate:** the Sensitive/Blocked friction reads `FsbServiceDenylist.classify` (the gate's source of truth), so the visual surface can never disagree with the security boundary (D-14); the gate re-checks classify on every invoke regardless.
- **Fresh i18n markers for the privacy cross-link:** added a new section with `@@PRIVACY_LEGAL_POSTURE_*` markers rather than editing existing copy, so the 53 telemetry-disclosure assertions stay green and the i18n build does not see a duplicate/missing marker.

## Deviations from Plan

None - plan executed exactly as written.

The plan anticipated that consent/pending rows are render-generated; the only implementation detail worth noting (not a deviation) is that the canonical row structures are shipped as hidden `<template>` elements so the source-text contract is satisfied in the markup, which the plan's own Component-Inventory reuse map and the RED test's static-HTML assertions both require. No bugs, missing-critical, or blocking issues were encountered; the stores (Plan 02/03) exposed exactly the APIs the wiring needed.

## Issues Encountered
- The Task-1 automated check initially failed on `Allow mutating (write) calls` because that string (and the Off/Ask/Auto `data-mode` buttons + `role="radiogroup"`) is asserted against the STATIC `control_panel.html` by the RED test, while per-origin rows are otherwise render-generated. Resolved by adding the canonical per-origin and pending row `<template>` blocks to the section markup (the documented MV3 clone-render pattern), which satisfies the contract and serves as the render clone source. No store/gate code was touched.

## User Setup Required
None - no external service configuration required. The live render/Grant/badge smoke is recorded as `human_needed` UAT debt (`30-HUMAN-UAT.md` UAT-30-01) and joins the milestone live-browser UAT ledger; the CI/source-text half and the gate-side sensitive+Auto enforcement are automated.

## Next Phase Readiness
- GOV-07 and GOV-08 UI surfacing complete; the consent spine (Plans 02/03) now has its user control surface and the legal posture is reachable from the public privacy page.
- The headless gate is green: `consent-audit-settings-ui` 52/0, `showcase-privacy-page` 53/0, and the gate-side `consent-gate` / `consent-policy-store` / `audit-log` / `service-denylist` suites all pass.
- Carried-forward debt: the live control-panel render/interaction smoke (UAT-30-01) is the only deferred item, consistent with the Phase-27/28/29 posture.

## Self-Check: PASSED

- Created files exist: `30-HUMAN-UAT.md`, `30-04-SUMMARY.md` — FOUND.
- Task commits exist: `45d24d95` (control_panel.html), `6e6f6219` (options.js + privacy page), `63e60e6c` (UAT doc) — FOUND.
- Verification: `consent-audit-settings-ui` 52/0, `showcase-privacy-page` 53/0, gate suites (consent-gate / consent-policy-store / audit-log / service-denylist) all PASS; no new CSS custom property in the section; no emoji in any changed file.

---
*Phase: 30-consent-governance-recipe-signature-verification-audit-legal*
*Completed: 2026-06-21*
