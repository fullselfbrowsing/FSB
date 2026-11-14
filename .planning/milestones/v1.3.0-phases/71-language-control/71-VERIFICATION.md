---
status: passed
score: 4/4
date: 2026-10-13
---

# Phase 71 Verification

1. `locale.NATIVE_LABELS` is English, Español, Deutsch, 日本語, 한국어, 简体中文, 繁體中文, in that order.
2. `saveOverride('de')` makes `current()` return `de` without a browser restart. Extension documents apply on `chrome.storage.onChanged`. Overlay refresh stays on registered shadow roots.
3. `saveOverride('')` clears the override and follows the browser tag again.
4. The control copy states that the name on `chrome://extensions` follows the browser language. Manifest `__MSG_` tokens were not changed.

`node tests/extension-ui-locale.test.js` passed. The extension pages were not opened in Chrome.
