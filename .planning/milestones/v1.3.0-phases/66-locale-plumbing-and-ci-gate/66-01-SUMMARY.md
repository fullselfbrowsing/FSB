---
phase: 66-locale-plumbing-and-ci-gate
plan: "01"
subsystem: extension-i18n
tags: [i18n, chrome.i18n, locale, ci]

requires: []
provides:
  - Runtime locale resolver with browser-language default and fsbUiLocale override
  - Seven seed catalogs and a fail-closed catalog gate
affects: [67-manifest-side-panel-popup]

tech-stack:
  added: []
  patterns:
    - Public locale codes stay hyphenated; Chrome folders use zh_CN and zh_TW
    - t() falls back to English and never returns an empty string

key-files:
  created:
    - extension/utils/ui-locale.js
    - extension/_locales/en/messages.json
    - extension/_locales/es/messages.json
    - extension/_locales/de/messages.json
    - extension/_locales/ja/messages.json
    - extension/_locales/ko/messages.json
    - extension/_locales/zh_CN/messages.json
    - extension/_locales/zh_TW/messages.json
    - scripts/verify-extension-i18n.mjs
    - tests/extension-ui-locale.test.js
  modified:
    - extension/manifest.json
    - extension/background.js
    - package.json

key-decisions:
  - "Store the override as fsbUiLocale and do not read the website cookie."
  - "Keep the catalog gate hard on the seed catalog so later phases cannot land copied English."

patterns-established:
  - "Message names use underscores. Chrome rejects dots."

requirements-completed: [LOC-01, LOC-02, LOC-03, LOC-04, LOC-05, WIRE-01, QUAL-01, QUAL-02, QUAL-03]

duration: 1 session
completed: 2026-10-11
---

# Phase 66 Plan 01: Locale resolver, seed catalogs, and CI gate Summary

The extension can resolve the seven showcase locales, prefer a stored override over the browser language, and fall back to English. CI rejects a missing key, an empty message, a placeholder change, copied English, and a dropped `FSB` literal.

## Self-Check: PASSED

`node tests/extension-ui-locale.test.js` — 34 passed.
