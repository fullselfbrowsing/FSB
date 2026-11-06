# Roadmap: FSB (Full Self-Browsing)

## Milestones

- 🚧 **v1.3.0 Extension multilingual UI** — Phases 66-71. Package-owned extension chrome renders in the seven showcase locales. The MCP wire stays byte-stable. v0.9.91 stays paused.
- ⏸ **v0.9.91 MCP Clients as Providers** — Phases 57-65, paused 2026-10-11, not shipped. Automated work is complete. Human UAT is still pending. Archive: `.planning/milestones/v0.9.91-ROADMAP.md`.
- ✅ **v1.2.0 Showcase i18n Completeness** — Phases 52-56, shipped 2026-07-09. Archive: `.planning/milestones/v1.2.0-ROADMAP.md`.
- ✅ **v1.1.0 T1 App Execution Expansion** — Phases 44-51, shipped 2026-06-30. Archive: `.planning/milestones/v1.1.0-ROADMAP.md`.
- ✅ **v1.0.0 Full App Catalog (OpenTabs Parity)** — Phases 35-43, shipped 2026-06-29. Archive: `.planning/milestones/v1.0.0-ROADMAP.md`.

## Current Milestone: v1.3.0 Extension multilingual UI

**Milestone Goal:** Every package-owned user-facing string in the Chrome extension can render in `en`, `es`, `de`, `ja`, `ko`, `zh-CN`, and `zh-TW`.

**Key context (non-negotiable):**

- Public locale codes come from `showcase/angular/src/app/core/i18n/locale-constants.ts`. Korean stays. Chinese public codes keep the hyphen. Chrome folders are `zh_CN` and `zh_TW`.
- `chrome.i18n.getMessage` and `__MSG_` follow the browser UI language only. Extension UI uses `extension/utils/ui-locale.js`. The storage key is `fsbUiLocale`. The website cookie is not read.
- A new catalog key ships in all seven `messages.json` files in the same change. The CI gate is hard from Phase 66.
- Protected literals follow `showcase/angular/src/locale/DO-NOT-TRANSLATE.md`.
- MCP tool names, descriptions, methods, error codes, storage keys, and message types stay byte-stable.
- v0.9.91 human UAT is not marked passed by this milestone.
- Phases 67-71 are sequential. They edit the same English catalog.

**Phase ordering rationale:** The resolver and the gate exist before any surface is extracted, so later phases cannot land a blank label or an English copy. Smaller shell surfaces land before the 9,330-line options page. The coverage audit runs after extraction. The language control is last, so switching locale shows a translated UI.

## Phases

**Phase Numbering:**
- Integer phases (66, 67, 68, 69, 70, 71): Planned milestone work, continuing from v0.9.91's Phase 65
- Decimal phases (66.1, 66.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 66: Locale plumbing and CI gate** - Seed catalogs, the runtime resolver, manifest `default_locale`, and a CI gate that fails on a missing key, an empty message, a placeholder change, or copied English (completed 2026-10-11)
- [x] **Phase 67: Manifest, side panel, and popup** - Localized store identity plus side-panel and popup chrome, with all six translations in the same change
- [x] **Phase 68: Options and control panel** - Localized options and control-panel chrome, the largest surface
- [x] **Phase 69: Onboarding, entry pages, and overlay chrome** - Localized onboarding, unlock, microphone permission, and FSB-authored overlay labels
- [x] **Phase 70: Coverage audit** - CI fails if in-scope files still contain package-owned English prose outside the catalog
- [x] **Phase 71: Language control** - A persistent seven-locale control that applies without restarting Chrome

## Phase Details

### Phase 66: Locale plumbing and CI gate
**Goal**: The extension can resolve a locale, load a message, fall back to English, and fail CI when a catalog is structurally or prosaically wrong, before any screen is migrated.
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: LOC-01, LOC-02, LOC-03, LOC-04, LOC-05, WIRE-01, QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):
  1. A packaged build with the browser UI language set to German loads the German seed message, and a build with an unknown language loads the English seed message.
  2. Saving `fsbUiLocale` as `ja` makes `t()` return the Japanese message even when the browser language is English. Clearing the key returns to the browser language. The resolver never reads a cookie.
  3. A missing Japanese key still shows the English message, not an empty string. `zh-Hans` resolves to `zh-CN` and the file on disk is `_locales/zh_CN/messages.json`.
  4. The CI script exits non-zero on a fixture with a missing key, an empty message, a dropped placeholder, or copied English prose that is not on the hash-bound allowlist, and it exits zero on the seed catalog.
  5. A byte comparison of MCP tool schemas and bridge message types against the phase base shows no change.
**Plans**: 1/1 complete
- [x] 66-01: Locale resolver, seed catalogs, and CI gate.

### Phase 67: Manifest, side panel, and popup
**Goal**: The store identity, side panel, and popup show package-owned chrome in the active locale.
**Depends on**: Phase 66
**Requirements**: SHELL-01, SHELL-02, SHELL-03
**Success Criteria** (what must be TRUE):
  1. Chrome displays the localized extension name and description for each of the seven locales. The visible name still contains the untranslated brand `FSB`, and the manifest `version` field is still the version.
  2. Opening the side panel in Spanish shows Spanish labels, buttons, empty states, and status text for package-owned chrome. User-typed text and model output stay as they were.
  3. Opening the popup in Korean shows Korean package-owned chrome, including button titles and status text.
  4. Every key added in this phase exists in all seven catalogs with matching placeholders, and the Phase 66 gate stays green.
**Plans**: 1/1 complete
- [x] 67-01: Manifest tokens, resting chrome, and runtime status text.
**UI hint**: yes

### Phase 68: Options and control panel
**Goal**: The options page and control panel show package-owned chrome in the active locale.
**Depends on**: Phase 67
**Requirements**: SET-01
**Success Criteria** (what must be TRUE):
  1. Opening the control panel in German shows German labels, buttons, hints, and status text for package-owned chrome.
  2. Provider names, model ids, storage keys, and error codes that are protocol identifiers remain unchanged.
  3. Every key added in this phase exists in all seven catalogs, and the Phase 66 gate stays green.
**Plans**: 1/1 complete
- [x] 68-01: Control-panel catalogs and runtime status text.
**UI hint**: yes

### Phase 69: Onboarding, entry pages, and overlay chrome
**Goal**: First-run pages and the on-page overlay show FSB-authored chrome in the active locale, without translating the page or the task.
**Depends on**: Phase 68
**Requirements**: ENTRY-01, ENTRY-02, ENTRY-03
**Success Criteria** (what must be TRUE):
  1. Onboarding in Simplified Chinese shows Simplified Chinese package-owned copy.
  2. The unlock page and the microphone-permission page in Traditional Chinese show Traditional Chinese package-owned copy.
  3. The on-page overlay in Japanese shows Japanese text for FSB-authored controls such as Stop, Done, and replay speed. The task title and model summary remain the original strings.
  4. Every key added in this phase exists in all seven catalogs, and the Phase 66 gate stays green.
**Plans**: 1/1 complete
- [x] 69-01: Entry pages and overlay chrome.
**UI hint**: yes

### Phase 70: Coverage audit
**Goal**: No in-scope surface still contains leftover package-owned English prose.
**Depends on**: Phase 69
**Requirements**: COPY-01
**Success Criteria** (what must be TRUE):
  1. The coverage check fails when a fixture UI file contains a package-owned English sentence that is not in the catalog and not on the producer-owned exception list.
  2. The same check passes on the side panel, popup, options, control panel, onboarding, unlock, microphone permission, and overlay chrome.
  3. Producer-owned exceptions still cover user text, model output, page DOM, secrets, and logs, and the check does not flag them.
**Plans**: 1/1 plans complete
- [x] 70-01: Coverage gate and leftover package chrome.

### Phase 71: Language control
**Goal**: The user can choose a locale inside the extension, keep that choice, and clear it.
**Depends on**: Phase 70
**Requirements**: LANG-01, LANG-02, LANG-03
**Success Criteria** (what must be TRUE):
  1. The control lists `English`, `Español`, `Deutsch`, `日本語`, `한국어`, `简体中文`, and `繁體中文`, and those seven strings are the same in every locale.
  2. Choosing `de` and reopening the side panel, popup, and control panel shows German chrome. The on-page overlay chrome is German too. Chrome does not need a restart.
  3. Clearing the choice makes the UI follow the browser UI language again.
  4. The name shown in `chrome://extensions` still follows the browser UI language, because manifest `__MSG_` strings cannot follow the override.
**Plans**: 1/1 plans complete
- [x] 71-01: Persistent language control.
**UI hint**: yes

## Coverage

- v1 requirements: 20
- Mapped: 20
- Unmapped: 0

---
*Roadmap created: 2026-10-11*
*Phase 67 passed: 2026-10-11*
*Phase 69 passed: 2026-10-11*
*Phase 70 passed: 2026-10-13*
*Phase 71 passed: 2026-10-13*
