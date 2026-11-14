# Project Research Summary

**Project:** FSB (Full Self-Browsing)
**Milestone:** v1.3.0 Extension multilingual UI
**Domain:** Brownfield MV3 `chrome.i18n` plus a runtime locale override
**Researched:** 2026-10-11
**Confidence:** HIGH

## Executive Summary

The extension is English-only. The showcase already ships `en`, `es`, `de`, `ja`, `ko`, `zh-CN`, and `zh-TW`. This milestone reuses that list and does not reuse the Angular toolchain. The extension is a classic-script Manifest V3 package: `chrome.i18n` message catalogs are the source of truth, and a small `globalThis` helper applies an explicit `chrome.storage.local` override because `chrome.i18n.getMessage` cannot switch locale at runtime.

No new dependency is required. The CI gate follows the showcase verifier style: same keys, non-empty messages, identical placeholders, and no copied English prose unless the English source hash is on an allowlist. Brand rules stay in `DO-NOT-TRANSLATE.md`.

The work is large because the copy is inline. Options alone is 9,330 lines, the side panel script is 7,022, and the page overlay is 3,580. The safe order is plumbing and the gate first, then one surface at a time with all six translations in the same change, then a leftover-prose audit, then the language control.

v0.9.91 is paused with human UAT still pending. It was archived and was not marked shipped. This milestone does not change the MCP wire.

## Key Findings

### Recommended stack

`chrome.i18n` messages in `extension/_locales/`, a classic-script resolver at `extension/utils/ui-locale.js`, and a zero-dependency Node verifier. Public codes keep the hyphen (`zh-CN`). Chrome folders use the underscore (`zh_CN`). Storage key is `fsbUiLocale`, not the website cookie.

**Core technologies:**
- `chrome.i18n` messages — catalogs and browser-locale manifest strings
- `ui-locale.js` — alias map, override, English fallback, DOM applicator
- Node verifier — the permanent gate

### Expected features

**Must have:**
- Seven locales, browser language by default, stored override on top
- English fallback instead of blank UI
- Manifest name and description, side panel, popup, options, onboarding, unlock, microphone permission, and FSB-authored overlay labels
- CI gate for missing keys, empty messages, placeholder drift, and copied English
- Language control using native autonyms

**Should have:**
- Transcreation pass on the shortest labels and the manifest description
- Toolbar tooltip via `chrome.action.setTitle` following the override

**Explicitly out:**
- Showcase re-translation, page DOM, prompts, model output, secrets, logs, site maps
- MCP names, methods, error codes, storage keys, message types, and tool descriptions
- The website cookie, extra locales, RTL, and new context menus or notifications

### Architecture

Manifest fields use `__MSG_`. Everything the user sees inside the extension uses `t()` so the override works. The helper loads through `importScripts` immediately after `install-identity.js`, and through a script tag on extension pages. Content overlay chrome uses the same helper. Payload text passed into the overlay does not.

### Watch out for

- `__MSG_` will not follow the picker.
- `zh-CN` as a folder name will silently fail.
- A missing key becomes an empty string if it goes through raw `getMessage`.
- Adding English keys before the six translations makes the gate red, or trains people to skip it.
- Source-pin tests will fail when UI literals move. Update them in the same commit.
- Do not translate protocol strings while extracting UI strings.
- Do not clear or ship the paused v0.9.91 phase directories.

## Implications for Roadmap

Continue numbering at Phase 66.

1. **Phase 66 — Locale plumbing and CI gate.** Resolver, seed catalogs, manifest `default_locale`, alias map, English fallback, structural and prose gates proven on fixtures. No surface extraction.
2. **Phase 67 — Manifest, side panel, and popup.** Those keys ship in all seven catalogs together.
3. **Phase 68 — Options and control panel.** Largest surface, same rule.
4. **Phase 69 — Onboarding, unlock, microphone permission, overlay chrome.** Payload text stays raw.
5. **Phase 70 — Coverage audit.** In-scope files no longer contain leftover package-owned English prose.
6. **Phase 71 — Language control.** Native autonyms, persistence, live switch across the surfaces above.

Phases 67 through 71 depend on 66. They are sequential because they share the English catalog. Translation agents, if used, start only after a phase freezes its keys, and each agent may touch only one locale file.

## Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Confirmed against `manifest.json`, Chrome's i18n contract, and the showcase registry |
| Features | HIGH | Surfaces confirmed by file reads and line counts on 2026-10-11 |
| Architecture | HIGH | `importScripts` order and classic script tags confirmed in source |
| Pitfalls | HIGH | Missing-key behavior is Chrome-documented. The gate-order pitfall already happened on the showcase |

Research was written in this session from the repository and Chrome's i18n contract. The host could not spawn the four `gsd-project-researcher` subagents, so the four research files and this summary were produced inline.

## Sources

- `extension/manifest.json`, `extension/background.js`, `extension/ui/sidepanel.html`, `extension/ui/popup.html`, `extension/content/visual-feedback.js`
- `showcase/angular/src/app/core/i18n/locale-constants.ts`
- `showcase/server/src/middleware/accept-language.js`
- `showcase/angular/src/locale/DO-NOT-TRANSLATE.md`
- [chrome.i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n)
