# Spacing and layout

A 4px grid, a 1200px container, and fixed rules for the depth pages.

## Rules

- **MUST** snap gaps, padding and margins to the 4px scale (4, 8, 12, 16, 20, 24, 32, 48). On product pages use `--fsb-space-*`. On the site the same steps are proposed as `--space-*`.
- **Site layout:**
  - the container is 1200px (`--max-width`) with 24px gutters, 16px below 768px;
  - sections are 80px apart (`--section-padding`), 48px on phones;
  - the nav is 64px tall (`--nav-height`), 56px below 768px;
  - grids collapse 4 → 2 → 1.
- **Product layout:** the side panel is narrow and must hold at 350px and 500px. Tests pin both breakpoints. New controls get a 44px minimum height and width, as the delegated-run actions already have.
- **Depth pages:** on phones each plane of home, about, agents and support fits one screen (privacy stays a scrolling document), and nothing scrolls sideways. Opened content scrolls inside its plane rather than shrinking it. The engine's phone rules apply to stages 600px wide or less; the shell and rail switch at 768px. See [0007](../decisions/0007-depth-pages-on-phones.md) and [../surfaces/showcase.md](../surfaces/showcase.md).
- **SHOULD** use one card padding per kind: 28×26px for site feature cards, and the existing `.form-card` padding on product pages.

## Tokens

| Name | Value | Where it ships |
|---|---|---|
| `--fsb-space-1` … `--fsb-space-12` | 4 … 48px | fsb-ui-core.css |
| `--space-xs` … `--space-2xl` | aliases of `--fsb-space-*` | fsb-ui-core.css (compatibility) |
| `--space-1` … `--space-12` (proposed) | 4 … 48px | site literals |
| `--max-width` | 1200px | styles.scss |
| `--nav-height` | 64px, 56px ≤768px | styles.scss |
| `--section-padding` | 80px 0, 48px 0 ≤768px | styles.scss |
| `--gutter` (proposed) | 24px, 16px ≤768px | `.container` padding literals |

There are no z-index tokens. See [elevation.md](elevation.md).

## Specimens

[Spacing rhythm](../guidelines/spacing-rhythm.card.html), [layout constants](../guidelines/spacing-layout.card.html), [radius](../guidelines/spacing-radius.card.html).

## Known gaps

- **Three spacing scales coexist:**
  - `--fsb-space-N` in pixels;
  - `--space-xs…2xl` as pixel aliases in the core;
  - options.css redefines `--space-*` in rem and again, tighter, inside `.dashboard-container`.

  options.css also reads an undeclared `--space-2` with a fallback.
- The site's `.nav-inner` keeps 24px padding on phones, while the container drops to 16px.
- Literal px values are common in every stylesheet. The ratchet does not count them yet.

## Evidence

- [fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `--fsb-space-*`, `--space-*`
- [styles.scss](../../showcase/angular/src/styles.scss) `:root`, `.container`, `@media (max-width: 768px)`
- [options.css](../../extension/ui/options.css) `--space-*`, `.dashboard-container`
- [tests/delegation-phase-contract.test.js](../../tests/delegation-phase-contract.test.js) (side-panel breakpoints)
