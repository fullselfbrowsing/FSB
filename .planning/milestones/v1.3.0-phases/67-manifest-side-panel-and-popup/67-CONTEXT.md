# Phase 67: Manifest, side panel, and popup - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning
**Mode:** Autonomous smart discuss. Recommended answers accepted because this runtime has no interactive question tool and the milestone brief already locked these choices.

<domain>
## Phase Boundary

The store identity, side panel, and popup show package-owned chrome in the active locale. User-typed text, model output, and protocol identifiers stay raw.

</domain>

<decisions>
## Implementation Decisions

### Manifest
- `name` is `__MSG_ext_name__` and `description` is `__MSG_ext_description__`.
- `ext_name` is the allowlisted brand `FSB` in every locale.
- The manifest `version` field stays the version. Version sync writes the message tokens, not `FSB v${version}`.
- `chrome://extensions` follows the browser language only. The in-extension override cannot change `__MSG_` strings.

### Runtime chrome
- Resting HTML uses `data-i18n` and `data-i18n-attr`.
- Exact package-owned strings go through `fsbUiLocale.markExact`, which tags the node and refreshes it after catalogs load.
- Dynamic popup errors use `text(key, english, subs)`. The English sentence stays in the source as the fallback.
- User, AI, and action messages are not passed through `markExact`.
- Node tests that do not load catalogs still see the English fallback.

### the agent's Discretion
- Message keys use the `shell_` prefix. No dots.
- A short English flash before `boot()` resolves is acceptable. `apply()` then replaces tagged nodes.

</decisions>

<code_context>
## Existing Code Insights

- `extension/utils/ui-locale.js` already resolves locales and loads the seven catalogs.
- Side panel and popup scripts are classic scripts. Extracted-function tests cannot see a sibling helper, so call sites guard on `globalThis.fsbUiLocale`.
- Source-pin tests require the English sentence to remain in the file.

</code_context>

<specifics>
## Specific Ideas

Opening the side panel in Spanish and the popup in Korean must show translated package-owned chrome, including Ready, Working, button titles, and the primary status lines.

</specifics>

<deferred>
## Deferred Ideas

- Options and the control panel (Phase 68).
- Onboarding, unlock, microphone permission, and overlay chrome (Phase 69).
- Concatenated provider-specific sentences that are not exact catalog matches (Phase 70 coverage).
- The language control (Phase 71).

</deferred>
