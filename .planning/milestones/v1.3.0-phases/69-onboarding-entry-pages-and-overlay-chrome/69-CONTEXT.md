# Phase 69: Onboarding, entry pages, and overlay chrome - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning
**Mode:** Autonomous smart discuss. Recommended answers accepted because this runtime has no interactive question tool and the milestone brief already locked these choices.

<domain>
## Phase Boundary

Onboarding, the unlock page, the microphone-permission page, and FSB-authored overlay chrome use the active locale. Task titles, model summaries, and the host page stay raw.

</domain>

<decisions>
## Implementation Decisions

- Onboarding copy goes through `ob(key, english)`, which keeps the English sentence in source and calls `text()`.
- Unlock and microphone pages use `data-i18n` plus `text()` for status that JavaScript writes later.
- `utils/ui-locale.js` is injected immediately before `content/visual-feedback.js` in both content-script lists.
- Overlay chrome uses `ov(key, english)`. Refresh after boot only replaces a node that still shows the English default, so a later task title or summary is not rewritten.
- Provider names, install commands, and model ids stay unchanged.

</decisions>
