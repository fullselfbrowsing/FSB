# 0011. Product dark mode is near-black everywhere

- Status: Accepted
- Date: 2026-11-24

## Context and problem statement

The extension's dark mode had two answers at once:

- The shared core (`fsb-ui-core.css`) defined a warm brown-black ramp: `#141110` page, `#1a1513` cards.
- The side panel, popup and control panel overrode it in their own stylesheets with near-black: `#050505`, `#0d0d0d`, `#121212`, `#141414`.

Users saw near-black panels with warm brown cards on them: the delegated-run card in the side panel, and the core-styled cards in the control panel. The owner compared three previews of the side panel, each rendered from the shipped CSS with only the surface colours changed:

- today's mix;
- warm everywhere;
- near-black everywhere.

## Considered options

1. Warm dark everywhere: let the core's warm ramp win on every product page.
2. Near-black everywhere: move the core's dark ramp to the near-black the pages already use.
3. Keep today's mix.

## Decision outcome

Chosen option 2, by the owner. It is the dark mode users already know from the panels themselves, the smallest visible change, and it puts the extension's dark mode in the same family as the showcase's black dark mode. Text and accents do not change: light text stays warm (`#f6efe9`, `#d2c1b4`, `#a99283`) and the orange is untouched.

## Consequences

- **New core dark surfaces:** `--fsb-surface-base` `#050505`, `--fsb-surface-elevated` `#0d0d0d`, `--fsb-surface-muted` `#121212`, `--fsb-surface-muted-2` `#141414`, `--fsb-surface-ink` `#000000`.
- **Borders and chrome:** borders become white at 8% (`--fsb-border-subtle`) and 14% (`--fsb-border-strong`). `--bg-nav` becomes `rgba(5, 5, 5, 0.72)`, and the core's dark header gradient moved to near-black too.
- **Cards** that read core tokens turn from brown to near-black and now match the panel around them. That covers the side panel's delegated-run cards and the control panel's shared primitives.
- **Redundant overrides.** The per-page near-black blocks in `sidepanel.css`, `popup.css` and `options.css` now repeat the core and can be removed in a cleanup. `sidepanel.css` is pinned by a sha256 test, so that cleanup recomputes the pin.
- **Light mode** is unchanged.

## Evidence

- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `[data-theme="dark"]` and the dark `:is(.chat-header, .sidepanel-header)` rule
- [design-system/tokens/product-surface.css](../tokens/product-surface.css), the dark block that mirrors it
- [design-system/guidelines/color-product-dark.card.html](../guidelines/color-product-dark.card.html)
- The sides it reconciles: [extension/ui/sidepanel.css](../../extension/ui/sidepanel.css), [extension/ui/popup.css](../../extension/ui/popup.css) and [extension/ui/options.css](../../extension/ui/options.css), each in its `[data-theme="dark"]` block
