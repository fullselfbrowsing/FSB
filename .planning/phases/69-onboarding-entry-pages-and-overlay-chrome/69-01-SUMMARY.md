---
phase: 69-onboarding-entry-pages-and-overlay-chrome
plan: "01"
subsystem: extension-i18n
tags: [i18n, onboarding, overlay]

requires: [68-01]
provides:
  - Localized onboarding, unlock, and microphone pages
  - Localized FSB-authored overlay chrome
affects: [70-coverage-audit]

tech-stack:
  added: []
  patterns:
    - ob() and ov() keep the English sentence and call text()
    - boot refresh replaces only chrome that is still the English default

key-files:
  created: []
  modified:
    - extension/ui/onboarding.js
    - extension/content/visual-feedback.js
    - extension/_locales/en/messages.json

key-decisions:
  - "Task titles and model summaries stay on the raw payload fields."
  - "The locale module loads before visual-feedback.js in both injection lists."

requirements-completed: [ENTRY-01, ENTRY-02, ENTRY-03]

duration: 1 session
completed: 2026-10-11
status: passed
---

# Phase 69 Plan 01 Summary

**First-run pages and overlay controls resolve through the catalogs. The task title and model summary stay raw.**

## Accomplishments

- Simplified Chinese onboarding uses `entry_get_started` → 开始使用.
- Traditional Chinese unlock and microphone pages use 解除保險庫鎖定 and 啟用你的麥克風.
- Japanese overlay chrome uses 停止, 完了, and the replay-speed sentence. `p.title` and `p.subtitle` are still assigned directly.

## Files Created/Modified

- `extension/ui/onboarding.js` and `onboarding.html`
- `extension/ui/unlock.html`, `unlock.js`
- `extension/ui/microphone-permission.html`, `microphone-permission.js`
- `extension/content/visual-feedback.js`
- `extension/background.js` and `extension/ws/ws-client.js`
- `extension/_locales/*/messages.json`
