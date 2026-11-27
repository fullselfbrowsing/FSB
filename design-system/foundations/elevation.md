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
- **Layering:** page overlays live in the top layer (`showPopover()`), with `z-index: 2147483647` as the fallback; see [0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md). Inside FSB's own pages:
  - **MUST** take a layer that sits above other parts of the page (nav, drawer, overlay, toast, modal) from the layer tokens below;
  - **SHOULD** keep any other z-index below 10, so it only orders siblings inside one component. The literal count ignores values below 10.

## Tokens

| Name | Site dark | Site light | Product light | Product dark |
|---|---|---|---|---|
| `--shadow-sm` | `0 2px 8px` black 40% | black 8% | `--fsb-shadow-xs` | (dark `--fsb-shadow-xs`) |
| `--shadow-md` | `0 4px 16px` black 50% | black 10% | `--fsb-shadow-sm` | |
| `--shadow-lg` | `0 8px 32px` black 60% | black 12% | `--fsb-shadow-md` | |
| `--shadow-glow` | orange 15% | orange 10% | `--fsb-shadow-accent` | |

Exact values are in [../tokens/effects.css](../tokens/effects.css) and [../tokens/product-surface.css](../tokens/product-surface.css).

Stacking layers, lowest first ([0013](../decisions/0013-name-values-before-changing-them.md)); each keeps the number it had as a literal:

| Product (`--fsb-z-*`) | Value | Used by | Site (`--z-*`) | Value | Used by |
|---|---|---|---|---|---|
| `dropdown` | 50 | model combobox listbox | `rail` | 30 | depth-page rail |
| `menu` | 60 | custom select menu | `nav-mobile` | 999 | phone menu |
| `sticky` | 100 | dashboard header, author footer, overflow dropdown | `nav` | 1000 | nav, stats back button |
| `drawer-scrim` | 150 | sidebar overlay | | | |
| `drawer` | 200 | dashboard sidebar | | | |
| `overlay` | 1000 | save bar, graph tooltips | | | |
| `toast` | 1100 | status toast | | | |
| `modal` | 2000 | credential modal | | | |
| `top` | 9999 | pairing QR overlay | | | |

## Specimens

[Elevation](../guidelines/spacing-elevation.card.html), [radius](../guidelines/spacing-radius.card.html).

## Known gaps

- **Some layers are still literal:** the dashboard's preview and modal layers, the home install fan and the about page's graph. A test pins the control panel's open-select card at a literal 20 (`tests/settings-card-select-clipping.test.js`).
- **The overflow dropdown shares the sticky layer** (100) with the header it opens from. Today's numbers were kept, not reordered.
- **No shadow value repeats** three times, so there are no new shadow tokens. Moving shadows onto `--fsb-shadow-*` and the site's `--shadow-*` is a visual decision still to make.
- **The `--shadow-sm` alias is inconsistent.** sidepanel.css and popup.css point it at `--fsb-shadow-sm`; the core and options.css point it at `--fsb-shadow-xs`.
- **Lift sizes disagree.** The design system lifts site cards 4px; the agents page lifts its cards 3px.

## Evidence

- [styles.scss](../../showcase/angular/src/styles.scss) `--shadow-*`, `--radius-*`
- [fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `--fsb-shadow-*`, `--fsb-radius-*`
- [showcase-shell.component.scss](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss) the nav's `backdrop-filter`
- [visual-feedback.js](../../extension/content/visual-feedback.js) `promoteToTopLayer`
