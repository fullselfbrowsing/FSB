---
phase: 68-options-and-control-panel
plan: "01"
subsystem: extension-i18n
tags: [i18n, options, control-panel]

requires: [67-01]
provides:
  - Control-panel package-owned chrome from the seven catalogs
  - Runtime status text that refreshes after the catalog loads
affects: [69-onboarding-entry-pages-and-overlay-chrome]

tech-stack:
  added: []
  patterns:
    - data-i18n on leaf control-panel nodes
    - registerExact for the control-panel map
    - fsbUiSet keeps the English literal and calls markExact

key-files:
  created:
    - extension/utils/panel-exact.js
  modified:
    - extension/utils/ui-locale.js
    - extension/ui/control_panel.html
    - extension/ui/options.js
    - extension/_locales/en/messages.json

key-decisions:
  - "Provider names that are the entire text node stay in English and unmarked."
  - "Beta badges stay sibling spans so apply() does not wipe them."

requirements-completed: [SET-01]

duration: 1 session
completed: 2026-10-11
status: passed
---

# Phase 68 Plan 01 Summary

**Resting control-panel chrome and exact options status text resolve through the seven catalogs.**

## Accomplishments

- 336 unique control-panel keys are in every locale. A German override returns a distinct German string for each of them, including Dashboard as Übersicht and Save Changes as Änderungen speichern.
- Provider-name text nodes stay unmarked.
- `fsbUiSet` tags exact vault, payment, pairing, and log status strings so boot refreshes them.

## Files Created/Modified

- `extension/utils/panel-exact.js` — English-to-key map registered at load.
- `extension/ui/control_panel.html` — `data-i18n` markers and locale scripts.
- `extension/ui/options.js` — `fsbUiSet` for exact status assignments.
- `extension/_locales/*/messages.json` — panel messages.
