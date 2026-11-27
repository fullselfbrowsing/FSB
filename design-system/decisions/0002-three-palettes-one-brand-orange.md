# 0002. Three palettes share one brand orange

- Status: Accepted
- Date: 2026-11-24

This records existing practice. The palettes were in place before this record was written.

## Context and problem statement

FSB ships three kinds of surface:

- the showcase site;
- the extension's own pages (side panel, popup, control panel);
- the overlays it draws on other people's web pages.

They do not share one neutral ramp. The site is cool slate on near-black and dark first. The extension pages are a warm ramp and light first. The overlays sit on arbitrary pages and use their own dark cards and glows. The question was whether to reconcile them into one palette or keep them apart and say so.

## Considered options

1. Keep three palettes. All of them use `#ff6b35` as the brand orange, except the overlays, which use their own accent (see [0003](0003-overlay-accent-ff8c00.md)). Each palette is documented with its own tokens.
2. Merge the site and product palettes into one ramp, then theme the overlays from it.
3. Move everything to the site palette.

## Decision outcome

Chosen option 1. The design system export states it plainly: the two ramps "are kept separate rather than reconciled". Shipped code follows that:

| Palette | Where it ships | Default theme | Neutral ramp |
|---|---|---|---|
| Site | showcase (every route, including `/dashboard`), extension onboarding | dark; `[data-theme="light"]` flips it | slate on near-black |
| Product | side panel, popup, control panel, legacy `showcase/dashboard.html` | light; `[data-theme="dark"]` flips it | warm grays |
| Overlay | in-page overlays from `visual-feedback.js` | dark cards on any page | none: black card, glows |

## Consequences

- Shared names such as `--primary`, `--bg-card` and `--radius-lg` mean different things in each palette. The design-system copies keep the product names under `[data-surface="product"]` so one specimen page can show both. See [../tokens/product-surface.css](../tokens/product-surface.css).
- New product UI reads `--fsb-*` tokens. New site UI reads the site tokens. Neither borrows the other's raw values.
- Product dark mode is near-black everywhere: see [0011](0011-product-dark-is-near-black.md).

## Evidence

- [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss) `:root`, `[data-theme="light"]`
- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `:root`, `[data-theme="dark"]`
- [extension/ui/onboarding.css](../../extension/ui/onboarding.css) `:root` (a copy of the site palette)
- [extension/content/visual-feedback.js](../../extension/content/visual-feedback.js) the shadow-root stylesheets
- The design system export's readme, section "Caveats" (see [../sources.md](../sources.md))
