# 0017. The side panel and popup use the core's dark surfaces

- Status: Accepted
- Date: 2026-11-25

## Context and problem statement

[0011](0011-product-dark-is-near-black.md) moved the core's dark ramp to near-black. The side panel and popup kept a flatter dark block of their own: `#050505` primary, `#121212` raised areas and 6% hairlines. A page rule forces the large surfaces to the page base either way: the panel, header, messages area, composer, history view and footer. So the difference shows only in smaller parts: the input field, status pill, history rows and action groups. The owner compared both on 2026-11-25.

## Considered options

1. The core's dark surfaces: `#0d0d0d` primary, `#141414` raised and 8% hairlines, as in the control panel.
2. Keep the flatter block.

## Decision outcome

Chosen option 1, by the owner.

## Consequences

- **The page-specific dark lines go.** Both dark blocks lose their five surface and hairline lines, plus four lines that repeated the page's own `:root`.
- **Smaller parts lift slightly.** The input field, status pill, history rows and action groups move from `#050505` and `#121212` to `#0d0d0d` and `#141414`, with 8% hairlines. Mixes built from these tokens follow, such as the pill and the pinned button.
- **What stays page-owned.** The side panel and popup keep only their message tones in the dark block: system, AI, error, action and the status background.
- **Resolves** the flatter-dark note in [0011](0011-product-dark-is-near-black.md).

## Evidence

- [extension/ui/sidepanel.css](../../extension/ui/sidepanel.css) and [popup.css](../../extension/ui/popup.css) `[data-theme="dark"]`
- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `[data-theme="dark"]`
