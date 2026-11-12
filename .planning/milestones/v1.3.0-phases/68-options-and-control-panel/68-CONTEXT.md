# Phase 68: Options and control panel - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning
**Mode:** Autonomous smart discuss. Recommended answers accepted because this runtime has no interactive question tool and the milestone brief already locked these choices.

<domain>
## Phase Boundary

The options page and control panel show package-owned labels, buttons, hints, and status text in the active locale. Provider names, model ids, storage keys, and protocol error codes stay unchanged.

</domain>

<decisions>
## Implementation Decisions

### Resting chrome
- Visible control-panel copy is marked with `data-i18n` on leaf nodes. Mixed labels such as Sync plus the Beta badge wrap only the text node, so `apply()` does not wipe the badge.
- Catalog keys are `panel_` plus the first 10 hex characters of the SHA-256 of the English string.
- Product names that are the whole text node stay unmarked: xAI (Grok), Google Gemini, OpenAI, Anthropic (Claude), OpenRouter, LM Studio, Claude Code, Grok Build, OpenClaw, Discord, Google AI Studio, Claude Routines, and bare FSB.
- `FSB`, `Chrome`, `OpenAI`, `CAPTCHA`, `MCP`, and `PIN` stay as literals inside longer sentences.

### Runtime status
- `registerExact` merges the control-panel English-to-key map from `extension/utils/panel-exact.js` without editing the shell exact map.
- `options.js` calls `fsbUiSet`, which uses `markExact` when the locale module is present and otherwise writes the English literal. Extracted tests that do not load catalogs still see English.
- Scripts load `ui-locale.js` and `panel-exact.js` before `config.js`. Boot applies the catalog to the control-panel document.

### Out of scope
- Onboarding, unlock, microphone permission, and overlay chrome (Phase 69).
- The language picker (Phase 71).
- Showcase Angular i18n.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` Phase 68 success criteria
- `extension/utils/ui-locale.js`
- `extension/ui/control_panel.html`
- `extension/ui/options.js`
</canonical_refs>
