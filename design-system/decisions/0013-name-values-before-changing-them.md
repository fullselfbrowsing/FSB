# 0013. Name today's values before changing them

- Status: Accepted
- Date: 2026-11-25

## Context and problem statement

When the design system landed, shipped CSS held 1,243 raw colours, 92 raw z-indexes and 186 literal font stacks. Most do not match a token. The product pages alone use 196 distinct colours in 416 places, many of them Tailwind status hues sitting beside the core's own status tokens. Two traps make a one-pass replacement unsafe:

- **A literal that equals a token can mean something else.** White text on the orange button equals the core's light card surface, but that token turns near-black in dark mode.
- **Most remaining values conflict.** For example, `#ef4444` (37 uses) and `--fsb-danger` `#dc2626` are two reds for one role. Choosing between them is a visual decision, not a refactor.

The owner approved a four-step migration:
1. swap literals that already equal a token;
2. name the values in use today;
3. settle the conflicts from screenshots;
4. move off Space Mono ([0012](0012-platform-mono-for-technical-text.md)).

This record covers step 2.

## Considered options

1. Replace each literal with the nearest existing token in one pass.
2. Add tokens that hold the values in use today and point only exact matches at them. Then settle each conflict later as a one-line token edit, chosen from before and after screenshots.
3. Leave the literals in place and only stop new ones (the literal count already does that).

## Decision outcome

Chosen option 2. Nothing visible changes. The new tokens are:

| Family | Product (`fsb-ui-core.css`) | Site (`styles.scss`; onboarding copies what it uses) |
|---|---|---|
| Brand | `--fsb-primary-tint` `#ff8c42`; `--fsb-on-primary` `#ffffff` (text on the orange, both themes) | `--primary-tint`, `--on-primary` |
| Brand transparencies | `--fsb-primary-faint` 8% and `--fsb-primary-glow-strong` 40%, beside soft 12%, soft-strong 18% and glow 24% | `--primary-faint` 8%, `--primary-wash` 10%, `--primary-soft` 12%, `--primary-soft-strong` 18%, `--primary-glow-strong` 40%, beside glow 30% |
| Status | Migration-only hues: `--fsb-red-500`, `--fsb-green-500`, `--fsb-yellow-500`, `--fsb-amber-400/600/800`, `--fsb-indigo-500`, `--fsb-blue-400` | `--danger`, `--danger-wash`, `--success`, `--warning` |
| Stacking layers | `--fsb-z-dropdown` 50, `-menu` 60, `-sticky` 100, `-drawer-scrim` 150, `-drawer` 200, `-overlay` 1000, `-toast` 1100, `-modal` 2000, `-top` 9999 | `--z-rail` 30, `--z-nav-mobile` 999, `--z-nav` 1000 |
| Monospace | `--fsb-font-mono` (the 0012 stack), with the `--font-mono` alias that the control panel already reads | none yet, see Consequences |

Rules that come with them:

- **Hue names are for migration only.** New code uses `--fsb-success`, `--fsb-warning`, `--fsb-danger` and `--fsb-info`. Step 3 folds each hue into a semantic token or renames it to its role.
- **Layers are named by role and keep today's numbers.** z-index values below 10 order siblings inside one component; they stay literal, and the literal count no longer counts them.
- **Only exact matches move.** A literal moves to a token only when the token resolves to the same value on every page that loads the file, in every theme its rule applies in.
- **Dead fallbacks go.** In `var(--x, #literal)` where `--x` is always defined on that page, only the literal is dropped.

## Consequences

- **No visible change.** Computed styles were compared before and after on:
  - every element (and `::before`/`::after`) of the side panel, popup, control panel and onboarding;
  - all 14 showcase routes at 1280 and 390px;
  - in both themes.

  Rules the static pages do not render were run on synthesized elements, and `:hover` and `:focus` rules were forced. A separate static check confirmed that every pre-existing custom property still resolves to its old value.
- **Counts fall.** Across both steps, raw colours went from 1,243 to 972 and counted z-indexes from 92 to 31.
- **The site's `--font-mono` waits for step 4.** The dashboard and stats pages already read `var(--font-mono, …)` with a Menlo fallback, so defining it would change those pages.
- **No shadow tokens.** No whole shadow value repeats three times, so naming them would only make single-use tokens. Shadows join the step-3 decisions.
- **Adding a name needs a check.** An existing `var(--x)` that named a missing `x` changes when `x` is defined. The new names were checked against every older reference: the only ones, the dashboard's `var(--danger, #ef4444)`, already rendered the new value.
- **Step 3 decides each conflict as one token value:**
  - the product's reds;
  - greens and ambers;
  - indigo and blue;
  - the control panel's softer dark status colours;
  - the side panel's flatter dark;
  - the brand transparencies, collapsed to four steps;
  - shadows.

## Evidence

- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `:root`
- [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss) `:root`
- [extension/ui/onboarding.css](../../extension/ui/onboarding.css) `:root`
- [../tokens/product-surface.css](../tokens/product-surface.css), [../tokens/colors.css](../tokens/colors.css), [../tokens/effects.css](../tokens/effects.css)
- [scripts/check-style-literals.mjs](../../scripts/check-style-literals.mjs) `LAYER_MIN`
- [0010](0010-mirror-tokens-until-generated.md) (why tokens are mirrored) and [0012](0012-platform-mono-for-technical-text.md) (the mono stack)
