# 0005. Font Awesome 6.6 is the icon set; no emoji

- Status: Accepted
- Date: 2026-11-24

## Context and problem statement

Icons appear on every FSB surface. Several icon sources were in use: Font Awesome from a CDN, a vendored Font Awesome build, Phosphor on a few showcase pages, provider logos, and the occasional emoji in early UI.

## Considered options

1. Font Awesome Free 6.6 (solid, regular, brands) as the working set. Phosphor is allowed only where the showcase already uses it. Provider and client marks are SVG with `currentColor` where possible. No emoji.
2. A custom icon font or sprite.
3. Phosphor everywhere.

## Decision outcome

Chosen option 1. It is what the code already uses most, and the showcase ships only the glyphs it uses. The icon subset is built by `showcase/angular/scripts/build-icon-fonts.mjs` and checked by `tests/icon-fonts-parity.test.js`. Emoji render differently on every platform and cannot be themed. Several tests already ban them from the control panel and side panel sources.

## Consequences

- A new glyph on the showcase means rebuilding the subset (`node scripts/build-icon-fonts.mjs` in `showcase/angular`). The parity test fails until that is done.
- The side panel, popup and control panel still load Font Awesome from cdnjs. Onboarding uses a vendored copy. The difference is listed in [DESIGN.md](../../DESIGN.md), Known gaps.
- The only non-letter glyph in the brand vocabulary is ▽, the version prefix.

## Evidence

- [showcase/angular/src/styles/icons/icons.manifest.json](../../showcase/angular/src/styles/icons/icons.manifest.json)
- [tests/icon-fonts-parity.test.js](../../tests/icon-fonts-parity.test.js)
- [tests/agent-sunset-control-panel.test.js](../../tests/agent-sunset-control-panel.test.js) (no emoji)
- [design-system/foundations/iconography.md](../foundations/iconography.md)
