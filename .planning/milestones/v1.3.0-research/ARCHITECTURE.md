# Architecture Research

**Domain:** How extension i18n attaches to the existing MV3 classic-script tree
**Researched:** 2026-10-11
**Confidence:** HIGH

## Existing architecture

The extension is a Manifest V3 service worker (`extension/background.js`) that loads helpers with `importScripts` in a fixed order. Extension pages (`sidepanel.html`, `popup.html`, `control_panel.html`, `onboarding.html`, `unlock.html`, `microphone-permission.html`) are classic scripts, not modules. Content-script overlay chrome lives in `extension/content/visual-feedback.js` and writes its own DOM.

The showcase locale system is a separate build. Angular compiles one prerendered site per locale. Express redirects `GET /` from the `fsb-locale` cookie and `Accept-Language`. None of that runs inside the extension.

## Recommended integration

```
extension/_locales/en/messages.json          English source
extension/_locales/{es,de,ja,ko,zh_CN,zh_TW}/messages.json
extension/utils/ui-locale.js                 classic script, globalThis.fsbUiLocale
        |-- resolveLocale(tag)               public code
        |-- t(key, substitutions)            override catalog, else chrome.i18n, else English
        |-- apply(root)                      [data-i18n] and [data-i18n-attr]
chrome.storage.local key: fsbUiLocale        public code, or absent for browser default
```

`ui-locale.js` is the only place that maps `zh-CN` ↔ `zh_CN` and `zh-TW` ↔ `zh_TW`, and the only place that applies the alias rules from `accept-language.js`.

### Locale choice

1. If `chrome.storage.local['fsbUiLocale']` is one of the seven public codes, use it.
2. Otherwise map `chrome.i18n.getUILanguage()` through the alias rules.
3. Unknown tags fall back to `en`.

Do not name the storage key `fsb-locale`. That name is the website cookie.

### Two delivery paths

| Path | Used for | Follows the override? |
|------|----------|------------------------|
| `__MSG_key__` in `manifest.json` | `name`, `description` | No. Chrome resolves these from the browser UI language. |
| `t()` / `apply()` | Extension pages and overlay chrome | Yes. |

Manifest strings still need all seven catalogs, because Chrome uses them for the store listing and `chrome://extensions`. The language control must not promise to change that name at runtime. `chrome.action.setTitle` can follow the override for the toolbar tooltip, because the manifest has no `default_title` today.

`__MSG_key__` inside HTML is the wrong tool for this milestone. Chrome substitutes it once from the browser locale, before the storage override is known.

### Loading

- Service worker: `importScripts('utils/ui-locale.js')` after `install-identity.js`, before any helper that shows user-facing text. Do not reorder the existing chain except to insert this one script.
- Extension pages: a `<script src="../utils/ui-locale.js">` before the page script, then `fsbUiLocale.apply(document)`.
- Content overlay: load the same classic script into the isolated world the overlay already uses. Page DOM and page JS stay untouched.

### Fallback

`t()` never returns `""`. Order: active locale message, English message, then the key name in development only if English is also missing. Production UI must show the English message. `chrome.i18n.getMessage` on its own is not enough, because a missing key becomes a blank control.

### What stays raw

A string is translated only when FSB authored it as chrome. These stay raw:

- Text the user typed, the model returned, or a page contained
- Vault secrets and logs
- Site-map and capability payload fields that name a third-party product operation
- Protocol identifiers

Overlay task titles and AI summaries passed into `visual-feedback.js` stay raw. Labels FSB itself paints (`Stop`, `Done`, `Actions:`, replay-speed) go through `t()`.

## Build order

1. Resolver, catalogs seed, manifest `default_locale`, and the CI gate. No mass extraction.
2. Manifest name and description, side panel, and popup. Each new key lands in all seven files in the same change.
3. Options and control panel, the largest surface.
4. Onboarding, unlock, microphone permission, and overlay chrome.
5. Coverage audit: in-scope files no longer contain package-owned English prose outside the catalog.
6. Language control on the already-localized shell. Autonyms are data, not translated messages.

Phases 2 through 4 can share the helper from phase 1. They should not run in parallel. They edit the same English catalog and the same pages.

## New vs modified

| Piece | Change |
|-------|--------|
| `extension/manifest.json` | Add `default_locale: "en"`. Move `name` and `description` to `__MSG_` keys. Leave permissions, host permissions, and the version token alone. |
| `extension/_locales/**` | New |
| `extension/utils/ui-locale.js` | New |
| UI HTML/JS and `visual-feedback.js` | Replace package-owned literals with catalog lookups |
| `package.json` test chain and CI | Add the verifier |
| Showcase locale files, MCP schemas, bridge message types | Unchanged |

## Sources

- `extension/background.js` lines 1-10 (`importScripts` order)
- `extension/ui/sidepanel.html` script tags (classic scripts)
- `extension/manifest.json` (`name` is currently `FSB v0.9.92`, which mixes a brand and a version)
- `showcase/server/src/middleware/accept-language.js` (alias sets)
