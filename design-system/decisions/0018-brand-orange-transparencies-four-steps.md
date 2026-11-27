# 0018. Brand-orange transparencies use four steps

- Status: Accepted
- Date: 2026-11-25

## Context and problem statement

After [0013](0013-name-values-before-changing-them.md), the brand orange `#ff6b35` still appeared at more than 20 alphas, and onboarding alone used 14 of them (6% to 45%). The product core named 8, 12, 18, 24 and 40%; the site named 8, 10, 12, 18, 30 and 40%. The owner compared onboarding with the alphas snapped to each option on 2026-11-25.

## Considered options

1. 8, 12, 24 and 40%: the product core's faint, soft, glow and glow-strong.
2. 10, 18, 30 and 45%.
3. Keep today's alphas.

## Decision outcome

Chosen option 1, by the owner. The steps are the same on every surface:

| Step | Product | Site and onboarding | Alpha |
|---|---|---|---|
| faint | `--fsb-primary-faint` | `--primary-faint` | 8% |
| soft | `--fsb-primary-soft` | `--primary-soft` | 12% |
| glow | `--fsb-primary-glow` | `--primary-glow` | 24% |
| glow-strong | `--fsb-primary-glow-strong` | `--primary-glow-strong` | 40% |

## Consequences

- **Removed steps.** `--fsb-primary-soft-strong` (18%), `--primary-wash` (10%) and `--primary-soft-strong` (18%) are gone. Their uses read the soft step (12%), as in the previews.
- **The site's glow drops.** `--primary-glow` moves from 30% to 24%, so button and card glows on the site soften slightly and match the product's glow.
- **Literal alphas snap to a step.** Literal orange alphas up to 45%, in fills, borders, outlines, text and gradients, move to the nearest step:

  | Literal alpha | Step |
  |---|---|
  | up to 9% | 8% |
  | 10–18% | 12% |
  | 20–32% | 24% |
  | 34–45% | 40% |

  Higher alphas (strong glows) and 0 stay. The text selection highlight moves from 18% to 12%.
- **Not changed yet:**
  - shadows and focus rings keep their literal alphas until a shadow scale exists;
  - research pages and the release-notes visuals keep their art-directed values.
- **Washes from other hues use the steps.** Indigo washes folded by [0016](0016-indigo-folds-into-brand-orange.md) take these steps too.

## Evidence

- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css), [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss) and [extension/ui/onboarding.css](../../extension/ui/onboarding.css) `:root`
- [../tokens/colors.css](../tokens/colors.css), [../tokens/product-surface.css](../tokens/product-surface.css)
- [../guidelines/color-accent.card.html](../guidelines/color-accent.card.html)
