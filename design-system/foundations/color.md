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
  - a transparency behind icon tiles, pills and selected rows, at one of four steps: faint 8%, soft 12%, glow 24%, glow-strong 40% ([0018](../decisions/0018-brand-orange-transparencies-four-steps.md));
  - a glow for emphasis.
- **SHOULD** use at most two background colours per screen. Gradients belong to the accent, never to a surface.
- **MUST** keep both themes:
  - the site is dark by default, and `[data-theme="light"]` flips surfaces and text;
  - product pages are light by default, and `[data-theme="dark"]` flips them to near-black under warm light text ([0011](../decisions/0011-product-dark-is-near-black.md));
  - the accent never changes with the theme.
- **Semantic colour.**
  - **MUST** use semantic colours for meaning only: product success `--fsb-success`, warning `--fsb-warning`, danger `--fsb-danger`, info `--fsb-info`. There is one hue per role ([0014](../decisions/0014-product-status-colours-one-per-role.md)), softer in dark mode ([0015](../decisions/0015-status-colours-soften-in-dark-mode.md)).
  - **MUST** write a status wash as `color-mix(in srgb, var(--fsb-danger) 10%, transparent)` (any alpha), so it follows the token in both themes.
  - **MUST** give a filled status control dark ink (`--fsb-text-inverse`) in dark mode; white fails on the softer fills.
  - On the site, red marks competitor and warning states.
  - **MUST NOT** use colour as the only signal; pair it with text or an icon.
- **MUST** keep text contrast at WCAG AA (4.5:1 for body text, 3:1 for large text and UI parts) in both themes.

## Tokens

| Palette | Files | Default and flip |
|---|---|---|
| Site | [../tokens/colors.css](../tokens/colors.css), [../tokens/effects.css](../tokens/effects.css) | `:root` is dark; `[data-theme="light"]` |
| Product | [../tokens/product-surface.css](../tokens/product-surface.css) | `[data-surface="product"]` is light; dark under `[data-theme="dark"]` |
| Overlay | [../tokens/overlay.css](../tokens/overlay.css) | dark surfaces, no theme switch; a colour pair per glow state |

Key values:

| Role | Site (dark / light) | Product (light / dark) |
|---|---|---|
| Page | `#000000` / `#ffffff` | `#fffdfb` / `#050505` |
| Card | `#0a0a0a` / `#f8f9fa` | `#ffffff` / `#0d0d0d` |
| Text | `#f1f5f9` / `#0f172a` | `#1f1a17` / `#f6efe9` |
| Secondary text | `#94a3b8` / `#475569` | `#6a584d` / `#d2c1b4` |
| Hairline | white 8% / black 8% | warm 10% / white 8% |

Accent and status tokens ([0013](../decisions/0013-name-values-before-changing-them.md) named them; [0014](../decisions/0014-product-status-colours-one-per-role.md) to [0018](../decisions/0018-brand-orange-transparencies-four-steps.md) settled them):

| Role | Site | Product (light / dark) |
|---|---|---|
| Gradient end | `--primary-tint` `#ff8c42` | `--fsb-primary-tint` |
| Text on the orange (both themes) | `--on-primary` `#ffffff` | `--fsb-on-primary` |
| Orange transparencies | `--primary-faint` 8%, `--primary-soft` 12%, `--primary-glow` 24%, `--primary-glow-strong` 40% | `--fsb-primary-faint`, `-soft`, `-glow`, `-glow-strong` at the same steps |
| Status | `--danger` `#ef4444`, `--danger-wash`, `--success` `#22c55e`, `--warning` `#eab308` | `--fsb-success` `#10b981` / `#81c784`, `--fsb-warning` `#d97706` / `#e6b844`, `--fsb-danger` `#dc2626` / `#e57373`, `--fsb-info` `#0891b2` / `#4dd0e1` |

`--fsb-amber-400` and `--fsb-amber-800` remain for the control panel's AI memory badge and site-graph form pills. **MUST NOT** use them in new code.

## Specimens

[Accent](../guidelines/color-accent.card.html), [site surfaces, dark](../guidelines/color-surfaces-dark.card.html), [site surfaces, light](../guidelines/color-surfaces-light.card.html), [text and borders](../guidelines/color-text.card.html), [product surfaces](../guidelines/color-product-surface.card.html), [product dark](../guidelines/color-product-dark.card.html), [warm gray ramp](../guidelines/color-product-gray.card.html), [overlay palette](../guidelines/color-overlay.card.html).

## Known gaps

- **Page-only dark tones.** Every product page takes its dark surfaces and status colours from the core ([0011](../decisions/0011-product-dark-is-near-black.md), [0015](../decisions/0015-status-colours-soften-in-dark-mode.md), [0017](../decisions/0017-side-panel-uses-core-dark-surfaces.md)). The side panel and popup still declare their message tones, and the control panel its 14% status washes.
- **The site re-declares four product names:** `--fsb-primary-soft`, `--fsb-border-subtle`, `--fsb-border-accent`, `--fsb-focus-ring`. The first now reads the site's own `--primary-soft`; the other three still carry their own values and should become site names.
- **The danger red differs between palettes:** `#ef4444` on the site; `#dc2626` on product pages, or `#e57373` in their dark mode. The site's status colours were not part of [0014](../decisions/0014-product-status-colours-one-per-role.md).
- **Small status text.** Green and amber fail AA as small text on white (2.5:1 and 3.2:1); text in these roles needs a darker shade.
- **Orange text on light surfaces.** `#ff6b35` is 2.84:1 on white and 2.47:1 on its soft wash, so small orange text on a light product page fails AA (the transcribing mic, the recon button, the AI memory badge). A darker text orange is an open decision.
- **Tonal shades stay literal:** alert text on tints (`#991b1b` on `#fee2e2`) and the Visa, Amex and Discover labels (fixed card colours).
- **Off-palette colours:**
  - the 1Password surfaces declare their own palettes (`.vp` in the side panel, the credential sheet's literals; [vault.md](../surfaces/vault.md) known issue 8);
  - `markdown.css` (message rendering) uses no tokens at all.
- **Research pages keep their own palettes.** phantom-stream sets `--primary` to blue inside `.ps-page`; prometheus has its own `--text`.
- Raw colours outside token blocks are counted by `scripts/check-style-literals.mjs`, and that count may only fall.

## Evidence

- [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss) `:root`, `[data-theme="light"]`
- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `:root`, `[data-theme="dark"]`
- [extension/ui/sidepanel.css](../../extension/ui/sidepanel.css) and [extension/ui/popup.css](../../extension/ui/popup.css) local `:root` and `[data-theme="dark"]` blocks; [extension/ui/options.css](../../extension/ui/options.css) its dark block
- [extension/content/visual-feedback.js](../../extension/content/visual-feedback.js) shadow-root stylesheets
