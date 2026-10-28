# Phase 70 Context

The coverage gate scans the side panel, popup, options, control panel, onboarding, unlock, microphone permission, and overlay chrome. A package-owned English sentence fails the gate unless it is an English catalog message or a producer exception (logs, provider names, or the untranslated payment token `CVV / CVC`).

Dynamic sentences use `line()` / `fsbUiLine()` / `obExact()` with the English template kept in source. Exact sentences are registered from `extension/utils/copy-exact.js` and refreshed through `markExact`.
