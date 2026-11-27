# Feature Research

**Domain:** Extension UI internationalization for an already-shipped MV3 assistant
**Researched:** 2026-10-11
**Confidence:** HIGH

## Feature Landscape

The showcase site already ships seven locales. The extension ships none. `extension/manifest.json` has no `default_locale`. A search of `extension/` finds no `chrome.i18n`, no `_locales`, and no `__MSG_` markers. User-facing copy is hardcoded English in HTML and classic scripts.

### Table stakes

| Feature | Why it is expected | Complexity | Depends on |
|---------|--------------------|------------|------------|
| Seven locales, English source | Same product languages as the website | Low | Existing locale registry |
| Browser UI language by default | Chrome users expect the extension to follow Chrome | Low | `chrome.i18n.getUILanguage()` plus the alias map |
| Explicit in-extension choice that persists | The showcase has a picker. The extension needs its own, because it cannot read the site cookie | Medium | Runtime resolver + `chrome.storage.local` |
| English fallback, never a blank label | `chrome.i18n.getMessage` returns `""` for a missing key | Low | Resolver wrapper |
| Store listing and toolbar identity localized | Manifest `name` and `description` are the strings Chrome shows outside the extension UI | Low | `__MSG_` in the manifest only |
| Side panel, popup, options, onboarding, unlock, microphone permission | These are the package-owned screens | High | Catalog + applicator |
| Overlay chrome the extension draws on the page | `extension/content/visual-feedback.js` (3,580 lines) hardcodes labels such as Stop, Done, and replay-speed | Medium | Same resolver, loaded into the content script |
| CI fails on a broken catalog | The showcase already learned that "the file exists" is not a translation | Medium | Node verifier |

### Differentiators

| Feature | Why it matters here | Complexity |
|---------|---------------------|------------|
| Hash-bound allowlist for true invariants | Brands, commands, and version tokens must stay in English without letting real prose slip through | Medium |
| Transcreation of the shortest, highest-visibility labels | Stop, Allow, Deny, Ready, and the manifest description fail when translated word for word | Medium |
| One alias module shared with the showcase rules | `zh-Hans` → `zh-CN`, `zh-Hant` → `zh-TW`, `es-MX` → `es` | Low |

### Anti-features

| Feature | Why excluded |
|---------|--------------|
| Translating captured page DOM, user prompts, model output, vault secrets, logs, or site-map content | That text is producer-owned. Rewriting it corrupts the product. |
| Translating MCP tool names, JSON-RPC methods, error codes, storage keys, or message types | The MCP wire stays byte-stable. |
| Translating MCP tool descriptions in the schema | Those strings travel on the wire. Changing them is a protocol change. |
| Reading the website `fsb-locale` cookie | Different origin. Out of scope. |
| New locales beyond the seven | The registry is fixed. |
| Localizing the Angular showcase again | Already shipped. Policy is `I18N-BOUNDARIES.md`. |
| `chrome.contextMenus` and `chrome.notifications` catalogs | The extension does not call those APIs today. Do not invent menus or notifications in order to translate them. |
| RTL layout work | Not requested. Arabic and Hebrew are not in the locale list. |

## Surfaces and size

Measured 2026-10-11. These are line counts, not string counts. The string extraction is the work of later phases.

| Surface | Files | Lines |
|---------|-------|------:|
| Options and control panel | `extension/ui/options.js`, `extension/ui/control_panel.html` | 9,330 + 2,086 |
| Side panel | `extension/ui/sidepanel.js`, `extension/ui/sidepanel.html`, plus `delegation-feed.js`, `providers-panel.js`, `speech-to-text.js` | 7,022 + 175 + supporting modules |
| Popup | `extension/ui/popup.js`, `extension/ui/popup.html` | 1,218 + popup HTML |
| Onboarding | `extension/ui/onboarding.js`, `extension/ui/onboarding.html` | 1,134 + 45 |
| Unlock and microphone permission | `unlock.html` / `unlock.js`, `microphone-permission.html` / `.js` | Hundreds |
| Page overlay | `extension/content/visual-feedback.js` | 3,580 |

HTML already contains user-facing English (`Fast task launch`, `Ready`, `Pin Window`, `Allow`, `Deny`, `Session History`). JS sets more of it at runtime, including `title` and `aria-label`.

## Dependencies

The language control is last. It needs the resolver and a catalog that is already translated, so switching language does not reveal a half-English UI.

Extraction of a surface and the six translations of that surface's keys land together. Otherwise the copied-English gate is either off during the middle of the milestone or red the moment a key is added.

## Sources

- `extension/manifest.json`
- `extension/ui/sidepanel.html`, `extension/ui/popup.html`
- `extension/content/visual-feedback.js` (`aria-label="Stop"`, `textContent = 'Done'`, `Actions:`)
- `showcase/angular/src/locale/I18N-BOUNDARIES.md` and `DO-NOT-TRANSLATE.md`
