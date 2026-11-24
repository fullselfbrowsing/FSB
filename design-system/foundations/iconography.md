# Iconography

Font Awesome 6.6 Free, provider marks as SVG, no emoji. See [0005](../decisions/0005-font-awesome-icons-no-emoji.md).

## Rules

- **MUST** use Font Awesome 6.6 Free (solid, regular, brands) for interface icons. Phosphor is allowed only where the showcase already uses it.
- **Showcase:** **MUST** add a new glyph through the icon subset. Run `node scripts/build-icon-fonts.mjs` in `showcase/angular`; `tests/icon-fonts-parity.test.js` fails until the subset covers every icon class used.
- **MUST NOT** use emoji in any interface or copy. The only non-letter glyph in the brand vocabulary is ▽, the version prefix.
- **SHOULD** draw a feature icon as a tile: a 34px square at `--radius-sm`, an orange glyph on a 10% orange wash. Provider and competitor cards use larger bare glyphs in the secondary text colour.
- **Provider and client marks** are the shipped SVG and PNG files. **SHOULD** use `fill="currentColor"` where the mark allows it, so it follows the theme. Brand marks belong to their owners; do not redraw them.
- **MUST** give icon-only buttons an accessible name (`aria-label`).

## Tokens

None. Icons take the text colour or the accent.

## Specimens

[Common icons](../guidelines/icons-common.card.html), [provider marks](../guidelines/icons-providers.card.html). The provider files are in [../assets/providers/](../assets/providers/claude.svg) and match `showcase/assets/providers/`.

## Known gaps

- **Delivery differs between surfaces.**
  - The side panel, popup and control panel load Font Awesome from cdnjs.
  - Onboarding uses a vendored copy (`extension/assets/onboarding/fontawesome`).
  - The showcase self-hosts subsets.
- **Not every provider mark is `currentColor`.** `openrouter.svg` uses a fixed white fill and `openclaw.svg` keeps its own colours.
- **`windsurf.svg` is in the design system only.** No shipped surface uses it yet.
- **Emoji in the overlays.** On web pages, the progress card draws its capability lock and its blocked-note warning as emoji entities (`.fsb-chip-lock`, `.fsb-note-icon` in `visual-feedback.js`), against the no-emoji rule.

## Evidence

- [showcase/angular/src/styles/icons/icons.manifest.json](../../showcase/angular/src/styles/icons/icons.manifest.json), [build-icon-fonts.mjs](../../showcase/angular/scripts/build-icon-fonts.mjs)
- [tests/icon-fonts-parity.test.js](../../tests/icon-fonts-parity.test.js)
- [extension/ui/sidepanel.html](../../extension/ui/sidepanel.html) the Font Awesome `<link>`
- [showcase/assets/providers/](../../showcase/assets/providers/claude.svg)
