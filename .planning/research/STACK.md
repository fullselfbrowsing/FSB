# Stack Research

**Domain:** Chrome MV3 extension internationalization, brownfield, added onto an existing classic-script extension
**Researched:** 2026-10-11
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `chrome.i18n` + `_locales/<folder>/messages.json` | Built into Chrome, already available at `minimum_chrome_version` 116 | Source catalogs and browser-locale fallback | This is the MV3 mechanism. No new dependency. The Chrome Web Store and `chrome://extensions` read these files. |
| One classic-script resolver on `globalThis` | Repo pattern (`importScripts`, extension pages use `<script src>`) | Runtime override, alias mapping, English fallback | `chrome.i18n.getMessage` cannot switch locale after load. Extension pages and the service worker are not ESM. |
| Node verifier script | Node `>=24`, `node:fs` only | CI key parity, placeholders, empty messages, copied English | Matches `showcase/angular/scripts/verify-translation-quality.mjs` and `verify-locale-sync.mjs`. |

### Supporting Libraries

None. Do not add `i18next`, `@angular/localize`, a message-format compiler, or a translation SaaS. The showcase already proved this repo's scale is served by plain catalogs plus a zero-dependency gate.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `messages.json` in Chrome's documented shape | Catalog format | `message`, `description`, `placeholders`. Placeholders use `$1` / `$NAME$`. |
| Hash-bound allowlist JSON | Exact-copy exceptions | Same idea as `showcase/angular/src/locale/same-source-allowlist.json`. A wording change invalidates the hash. |
| `showcase/angular/src/locale/DO-NOT-TRANSLATE.md` | Protected literals | Reuse the list. Do not fork a second brand list. |

## Installation

No packages to install. New files live under `extension/_locales/` and one helper under `extension/utils/`. The verifier lives next to the other root or `showcase/angular/scripts` verifiers and is wired into the existing `npm test` chain and the website/extension CI job that already runs i18n gates.

## What not to add

- Angular `$localize` or XLIFF inside the extension. The extension is not an Angular app.
- A second locale list. Public codes stay `en`, `es`, `de`, `ja`, `ko`, `zh-CN`, `zh-TW` from `locale-constants.ts`.
- Chrome folders named `zh-CN` or `zh-TW`. Chrome's `_locales` directory names for Chinese are `zh_CN` and `zh_TW`.
- Reading the website `fsb-locale` cookie. The extension and `full-selfbrowsing.com` are different origins.

## Alternatives Considered

| Proposed | Why not |
|----------|---------|
| `__MSG_key__` only, no runtime resolver | Substituted from the browser UI language when the page loads. An in-extension override would not apply. |
| Fetch Angular XLIFF at runtime | Different format, different pipeline, and the extension cannot depend on the showcase build. |
| One agent per language editing shared JS | Collides on key names and the English catalog. Locales are parallel files only after keys are frozen. |

## Sources

- Chrome extension manifest in `extension/manifest.json` (`manifest_version` 3, no `default_locale` today).
- Chrome i18n message format and locale folder rules: [chrome.i18n](https://developer.chrome.com/docs/extensions/reference/api/i18n) and [locale codes](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales). `getMessage` returns `""` for an unknown key.
- Showcase locale registry: `showcase/angular/src/app/core/i18n/locale-constants.ts` and `showcase/server/src/utils/locale-constants.js`.
- Showcase alias rules: `showcase/server/src/middleware/accept-language.js`.
