---
phase: 67-manifest-side-panel-and-popup
plan: "01"
subsystem: extension-i18n
tags: [i18n, sidepanel, popup, manifest]

requires: [66-01]
provides:
  - Localized extension name and description
  - Side panel and popup package-owned chrome from the seven catalogs
affects: [68-options-and-control-panel]

tech-stack:
  added: []
  patterns:
    - data-i18n for resting HTML
    - markExact for exact runtime chrome, refreshed after boot
    - text(key, english, subs) for dynamic popup status

key-files:
  created: []
  modified:
    - extension/manifest.json
    - extension/utils/ui-locale.js
    - extension/ui/popup.html
    - extension/ui/popup.js
    - extension/ui/sidepanel.html
    - extension/ui/sidepanel.js
    - extension/ui/owner-chip.js
    - extension/_locales/en/messages.json

key-decisions:
  - "Manifest __MSG_ strings follow the browser language. The in-extension override applies through the runtime catalog."
  - "User, AI, and action messages are not translated."

requirements-completed: [SHELL-01, SHELL-02, SHELL-03]

duration: 1 session
completed: 2026-10-11
status: passed
---

# Phase 67 Plan 01 Summary

The store name is `FSB` in every locale, and the description is translated. Side panel and popup chrome that is visible at rest, plus the primary runtime status lines, come from the catalogs. A saved locale replaces those strings after the catalogs load. Tests that do not load a catalog still see the English fallback.

Concatenated provider-specific sentences that are not an exact catalog match stay for the Phase 70 coverage check.
