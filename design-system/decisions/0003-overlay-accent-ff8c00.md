# 0003. The in-page overlays use #ff8c00 as their accent

- Status: Accepted
- Date: 2026-11-24

This records existing practice. It was in place before this record was written.

## Context and problem statement

FSB highlights what it is about to act on with an orange glow, because the owner asked to see what is being targeted. The Key Decisions table in `.planning/PROJECT.md` records that request. The glow, the action box, the progress card's accent and the replay player all use `#ff8c00`, with `#ff6600` and `#ffa500` beside it. The extension's own pages and the site use `#ff6b35`. Nothing records why the overlays use the brighter hue, so the difference reads like drift.

## Considered options

1. Keep `#ff8c00` as a separate overlay accent and document it as a token family.
2. Move the overlays to the brand `#ff6b35`.

## Decision outcome

Chosen option 1. It matches every overlay in production and the overlay design boards, which are "1:1 with the extension". The reason for the brighter hue was never written down. A plausible one is that it has to read on arbitrary page backgrounds, but nobody has confirmed that. Moving to `#ff6b35` would be a visible redesign and needs its own record.

## Consequences

- Overlay colours are listed in [../tokens/overlay.css](../tokens/overlay.css). Each token names the selector and property it comes from, and the drift check holds them equal.
- New overlay UI, such as the status pill in PR #173 and the vault pill in PR #172, uses this family, not `#ff6b35`.
- The crawl card is blue (`#38bdf8`). Calling an app's capability is violet (`#8b5cf6`, `#a78bfa`). A blocked site is amber (`#f5a524`), and done is green (`#34d399`).

## Evidence

- [.planning/PROJECT.md](../../.planning/PROJECT.md), Key Decisions: "Visual feedback with orange glow"
- [extension/content/visual-feedback.js](../../extension/content/visual-feedback.js) `.viewport-glow-root.state-thinking`, `.fsb-step-number`, `.box-overlay`
- [design-system/surfaces/overlays.md](../surfaces/overlays.md)
