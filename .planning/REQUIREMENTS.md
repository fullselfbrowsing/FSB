# Requirements: FSB Extension multilingual UI

**Defined:** 2026-10-11
**Core Value:** Reliable single-attempt execution. This milestone does not change automation. It makes package-owned extension chrome render in the seven locales the showcase already ships.

## v1 Requirements

### Locale catalog

- [x] **LOC-01**: The packaged extension declares `default_locale` `en` and loads messages for `en`, `es`, `de`, `ja`, `ko`, `zh-CN`, and `zh-TW`. Chrome reads Chinese from `_locales/zh_CN` and `_locales/zh_TW`.
- [x] **LOC-02**: One module maps those public codes to Chrome folders and applies the showcase alias rules: `zh`, `zh-Hans`, `zh-CN`, and `zh-SG` resolve to `zh-CN`; `zh-Hant`, `zh-TW`, `zh-HK`, and `zh-MO` resolve to `zh-TW`; any other tag falls back to its primary subtag when that subtag is supported.
- [x] **LOC-03**: A missing or empty message shows the English message, never a blank control.
- [x] **LOC-04**: A locale saved in `chrome.storage.local` under `fsbUiLocale` overrides the browser UI language. With no saved choice, the browser UI language is used.
- [x] **LOC-05**: The resolver does not read the website `fsb-locale` cookie.

### Wire stability

- [x] **WIRE-01**: MCP tool names, tool descriptions, JSON-RPC methods, error codes, storage keys, and bridge message types stay byte-stable. Localization does not change them.

### Shell chrome

- [x] **SHELL-01**: Chrome shows a localized extension name and description for each of the seven locales. `FSB` stays untranslated. The manifest `version` field stays the version.
- [x] **SHELL-02**: Side-panel package-owned labels, buttons, empty states, and status text render in the active locale.
- [x] **SHELL-03**: Popup package-owned labels, buttons, and status text render in the active locale.

### Settings

- [x] **SET-01**: Options and control-panel package-owned labels, buttons, hints, and status text render in the active locale.

### Entry and overlay

- [x] **ENTRY-01**: Onboarding package-owned copy renders in the active locale.
- [x] **ENTRY-02**: Unlock and microphone-permission package-owned copy renders in the active locale.
- [x] **ENTRY-03**: Page-overlay labels that FSB authors (`Stop`, `Done`, elapsed captions, replay speed, and the same class of chrome) render in the active locale. Task titles, model summaries, and page content stay raw.

### Catalog quality

- [x] **QUAL-01**: CI fails when any locale is missing a key that English has, has an empty message, or adds or drops a placeholder.
- [x] **QUAL-02**: CI fails when a non-English message copies English prose that is not on the hash-bound allowlist.
- [x] **QUAL-03**: Protected literals from `showcase/angular/src/locale/DO-NOT-TRANSLATE.md` are unchanged inside every translated message.

### Coverage

- [x] **COPY-01**: CI fails when an in-scope UI file still contains package-owned user-facing English prose outside the catalog and outside the producer-owned exceptions.

### Language control

- [x] **LANG-01**: The user can choose one of the seven locales from a control that shows `English`, `Español`, `Deutsch`, `日本語`, `한국어`, `简体中文`, and `繁體中文`. Those autonyms are not translated.
- [x] **LANG-02**: The choice persists in `chrome.storage.local` and applies to the side panel, popup, options, onboarding, unlock, microphone permission, and overlay chrome without a Chrome restart.
- [x] **LANG-03**: The user can clear the choice and return to the browser UI language.

## v2 Requirements

Deferred. Not in this roadmap.

### Locale reach

- **FUT-01**: The extension follows the website `fsb-locale` cookie.
- **FUT-02**: Locales beyond the seven showcase codes.
- **FUT-03**: Right-to-left layout.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Showcase Angular i18n | Already shipped. Policy is `I18N-BOUNDARIES.md`. |
| Captured page DOM, user prompts, model output, vault secrets, logs, site-map content | Producer-owned. Translating it corrupts the product. |
| MCP tool names, descriptions, methods, error codes, storage keys, message types | Wire stays byte-stable (WIRE-01). |
| New context menus or `chrome.notifications` | The extension does not use those APIs. Do not add them in order to translate them. |
| Marking v0.9.91 shipped | Human UAT is still pending. That milestone is paused. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOC-01 | Phase 66 | Complete |
| LOC-02 | Phase 66 | Complete |
| LOC-03 | Phase 66 | Complete |
| LOC-04 | Phase 66 | Complete |
| LOC-05 | Phase 66 | Complete |
| WIRE-01 | Phase 66 | Complete |
| QUAL-01 | Phase 66 | Complete |
| QUAL-02 | Phase 66 | Complete |
| QUAL-03 | Phase 66 | Complete |
| SHELL-01 | Phase 67 | Complete |
| SHELL-02 | Phase 67 | Complete |
| SHELL-03 | Phase 67 | Complete |
| SET-01 | Phase 68 | Complete |
| ENTRY-01 | Phase 69 | Complete |
| ENTRY-02 | Phase 69 | Complete |
| ENTRY-03 | Phase 69 | Complete |
| COPY-01 | Phase 70 | Pending |
| LANG-01 | Phase 71 | Pending |
| LANG-02 | Phase 71 | Pending |
| LANG-03 | Phase 71 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-10-11*
*Last updated: 2026-10-11 after roadmap creation*
