# Phase 66: Locale plumbing and CI gate - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning
**Mode:** Autonomous smart discuss. Recommended answers accepted because this runtime has no interactive question tool and the milestone brief already locked these choices.

<domain>
## Phase Boundary

The extension can resolve a locale, load a message, fall back to English, and fail CI when a catalog is structurally or prosaically wrong, before any screen is migrated.

</domain>

<decisions>
## Implementation Decisions

### Catalog shape
- Public codes stay `en`, `es`, `de`, `ja`, `ko`, `zh-CN`, `zh-TW`.
- Chrome folders are `en`, `es`, `de`, `ja`, `ko`, `zh_CN`, `zh_TW`. One function maps between them.
- Message keys use letters, numbers, and underscores. Chrome rejects dots in message names.
- The seed catalog has three keys: a translated greeting, a placeholder replay label, and an allowlisted brand token `FSB`.

### Resolver
- Classic script `extension/utils/ui-locale.js` publishes `globalThis.fsbUiLocale`.
- Storage key is `fsbUiLocale` in `chrome.storage.local`. It is not the website cookie.
- No saved choice means the browser UI language, passed through the showcase alias rules.
- A missing or empty message returns the English message. It never returns an empty string.
- `__MSG_` is not used in this phase. Manifest name and description stay for Phase 67. `default_locale` is `en`.

### Gate
- `scripts/verify-extension-i18n.mjs` fails on a missing key, an empty message, a changed placeholder, or copied English prose whose source hash is not on the allowlist.
- Protected literals that appear in the English message must appear unchanged in every other locale. The seed literal is `FSB`.
- The gate is wired into `npm test` and is green on the seed catalog.
- Adversarial fixtures prove each failure mode.

### Wire
- This phase does not edit MCP schemas, tool definitions, or bridge message types.
- A test pins the current SHA-256 of `mcp/src/types.ts` and `extension/ai/tool-definitions.js`.

### the agent's Discretion
- Catalog preload may be lazy. `t()` must work in Node tests with injected catalogs and a fake `chrome.i18n`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Alias rules in `showcase/server/src/middleware/accept-language.js`.
- Locale list in `showcase/angular/src/app/core/i18n/locale-constants.ts`.
- Showcase quality gate pattern in `showcase/angular/scripts/verify-translation-quality.mjs`.

### Established Patterns
- Extension helpers are classic scripts loaded with `importScripts`.
- `install-identity.js` is the first import in `extension/background.js`.
- Tests are zero-dependency Node scripts with `assert()` and a pass/fail count.

### Integration Points
- Insert `importScripts('utils/ui-locale.js')` immediately after `install-identity.js`.
- Add `default_locale` to `extension/manifest.json`.
- Append the new test and verifier to the root `npm test` chain.

</code_context>

<specifics>
## Specific Ideas

No screen copy moves in this phase. The seed strings exist so the gate has real translations to accept and real fixtures to reject.

</specifics>

<deferred>
## Deferred Ideas

- Manifest name and description, side panel, and popup copy (Phase 67).
- Options and control panel (Phase 68).
- Onboarding, unlock, microphone permission, and overlay chrome (Phase 69).
- Leftover-prose coverage audit (Phase 70).
- The language control UI (Phase 71).

</deferred>
