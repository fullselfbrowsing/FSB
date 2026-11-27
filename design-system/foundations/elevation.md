# Elevation

Shadows, radius and layering.

## Rules

- **SHOULD** keep cards flat at rest: a hairline border and no shadow. The shadow arrives on hover, with the lift (see [motion.md](motion.md)). A recommended or highlighted card swaps its border to solid orange and gains the glow instead of lifting.
- **MUST** use the shadow tokens of the palette. Site shadows are deep and soft on dark and shallow on light. Product shadows are warm and tight.
- **MUST** use one orange glow (`--shadow-glow`) for emphasis, never for height.
- **Blur and transparency** are for fixed chrome only: the nav bar sits behind a 16px backdrop blur. Nothing in the content flow is translucent.
- **Radius:**
  - site: 8 / 12 / 16 / 24px as `--radius-sm` … `--radius-xl`;
  - product: 8 / 12 / 18 / 24px as `--fsb-radius-*`;
  - pills: 999px; square tags: 10px.
- **Layering:** page overlays live in the top layer (`showPopover()`), with `z-index: 2147483647` as the fallback; see [0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md). Inside FSB's own pages, **SHOULD** keep z-index values small and local to a component.

## Tokens

| Name | Site dark | Site light | Product light | Product dark |
|---|---|---|---|---|
| `--shadow-sm` | `0 2px 8px` black 40% | black 8% | `--fsb-shadow-xs` | (dark `--fsb-shadow-xs`) |
| `--shadow-md` | `0 4px 16px` black 50% | black 10% | `--fsb-shadow-sm` | |
| `--shadow-lg` | `0 8px 32px` black 60% | black 12% | `--fsb-shadow-md` | |
| `--shadow-glow` | orange 15% | orange 10% | `--fsb-shadow-accent` | |

Exact values are in [../tokens/effects.css](../tokens/effects.css) and [../tokens/product-surface.css](../tokens/product-surface.css).

## Specimens

[Elevation](../guidelines/spacing-elevation.card.html), [radius](../guidelines/spacing-radius.card.html).

## Known gaps

- **No z-index tokens.** About 30 z-index values in extension CSS and 62 in the showcase are literal. The ratchet counts integer z-index values.
- **The `--shadow-sm` alias is inconsistent.** sidepanel.css and popup.css point it at `--fsb-shadow-sm`; the core and options.css point it at `--fsb-shadow-xs`.
- **Lift sizes disagree.** The design system lifts site cards 4px; the agents page lifts its cards 3px.

## Evidence

- [styles.scss](../../showcase/angular/src/styles.scss) `--shadow-*`, `--radius-*`
- [fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `--fsb-shadow-*`, `--fsb-radius-*`
- [showcase-shell.component.scss](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss) the nav's `backdrop-filter`
- [visual-feedback.js](../../extension/content/visual-feedback.js) `promoteToTopLayer`
