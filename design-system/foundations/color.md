# Color

One brand orange, three palettes. See [0002](../decisions/0002-three-palettes-one-brand-orange.md) and [0003](../decisions/0003-overlay-accent-ff8c00.md).

## Rules

- **MUST** take every colour from a token in the palette of the surface you are working on:
  - site tokens on the showcase and onboarding;
  - `--fsb-*` on the side panel, popup and control panel;
  - the overlay family inside page overlays.

  Never copy a raw value from another palette.
- **MUST** use `#ff6b35` (`--primary`, `--fsb-primary`) as the brand accent on the site and in the extension pages. The overlays use `#ff8c00` instead.
- **The accent appears in four ways only:**
  - flat;
  - the 135° gradient to `#ff8c42` (buttons, toggle tracks, gradient text);
  - a 10–12% wash behind icon tiles and eyebrow pills;
  - a glow for emphasis.
- **SHOULD** use at most two background colours per screen. Gradients belong to the accent, never to a surface.
- **MUST** keep both themes:
  - the site is dark by default, and `[data-theme="light"]` flips surfaces and text;
  - product pages are light by default, and `[data-theme="dark"]` flips them to near-black under warm light text ([0011](../decisions/0011-product-dark-is-near-black.md));
  - the accent never changes with the theme.
- **Semantic colour.**
  - **MUST** use semantic colours for meaning only: product success `--fsb-success`, warning `--fsb-warning`, danger `--fsb-danger`, info `--fsb-info`.
  - On the site, red marks competitor and warning states.
  - **MUST NOT** use colour as the only signal; pair it with text or an icon.
- **MUST** keep text contrast at WCAG AA (4.5:1 for body text, 3:1 for large text and UI parts) in both themes.

## Tokens

| Palette | Files | Default and flip |
|---|---|---|
| Site | [../tokens/colors.css](../tokens/colors.css), [../tokens/effects.css](../tokens/effects.css) | `:root` is dark; `[data-theme="light"]` |
| Product | [../tokens/product-surface.css](../tokens/product-surface.css) | `[data-surface="product"]` is light; dark under `[data-theme="dark"]` |
| Overlay | [../tokens/overlay.css](../tokens/overlay.css) | dark cards; one token per state |

Key values:

| Role | Site (dark / light) | Product (light / dark) |
|---|---|---|
| Page | `#000000` / `#ffffff` | `#fffdfb` / `#050505` |
| Card | `#0a0a0a` / `#f8f9fa` | `#ffffff` / `#0d0d0d` |
| Text | `#f1f5f9` / `#0f172a` | `#1f1a17` / `#f6efe9` |
| Secondary text | `#94a3b8` / `#475569` | `#6a584d` / `#d2c1b4` |
| Hairline | white 8% / black 8% | warm 10% / white 8% |

## Specimens

[Accent](../guidelines/color-accent.card.html), [site surfaces, dark](../guidelines/color-surfaces-dark.card.html), [site surfaces, light](../guidelines/color-surfaces-light.card.html), [text and borders](../guidelines/color-text.card.html), [product surfaces](../guidelines/color-product-surface.card.html), [product dark](../guidelines/color-product-dark.card.html), [warm gray ramp](../guidelines/color-product-gray.card.html), [overlay palette](../guidelines/color-overlay.card.html).

## Known gaps

- **Product pages repeat the dark values.** The side panel, popup and control panel still declare near-black surfaces in their own stylesheets. The core now carries the same near-black ramp ([0011](../decisions/0011-product-dark-is-near-black.md)), so those blocks can be removed; `sidepanel.css` is hash-pinned.
- **The site re-declares four product names** with its own values: `--fsb-primary-soft`, `--fsb-border-subtle`, `--fsb-border-accent`, `--fsb-focus-ring`. They should become site names.
- **The danger red differs** between palettes: `#ef4444` on the site, `#dc2626` in the product core, `#e57373` in the control panel's dark mode.
- **Off-palette colours:**
  - the side panel's checkboxes use `accent-color: #f97316`, which is not the brand orange;
  - `markdown.css` (message rendering) uses no tokens at all.
- **Research pages keep their own palettes.** phantom-stream sets `--primary` to blue inside `.ps-page`; prometheus has its own `--text`.
- Raw colours outside token blocks are counted by `scripts/check-style-literals.mjs`, and that count may only fall.

## Evidence

- [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss) `:root`, `[data-theme="light"]`
- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `:root`, `[data-theme="dark"]`
- [extension/ui/sidepanel.css](../../extension/ui/sidepanel.css) and [extension/ui/popup.css](../../extension/ui/popup.css) local `:root` and `[data-theme="dark"]` blocks; [extension/ui/options.css](../../extension/ui/options.css) its dark block
- [extension/content/visual-feedback.js](../../extension/content/visual-feedback.js) shadow-root stylesheets
