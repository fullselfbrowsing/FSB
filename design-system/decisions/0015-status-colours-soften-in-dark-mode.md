# 0015. Status colours soften in dark mode

- Status: Accepted
- Date: 2026-11-25

## Context and problem statement

In dark mode, the control panel swapped in a softer status set: `#81c784`, `#e6b844`, `#e57373` and `#4dd0e1`. The side panel and popup kept the saturated core colours. On the near-black card (`#0d0d0d`), the saturated red is 4.02:1, while the softer set ranges from 6.5:1 to 10.6:1. The owner compared both directions on 2026-11-25.

## Considered options

1. Softer everywhere: the softer set moves into the core's dark block.
2. Saturated everywhere: the control panel drops its softer set.
3. Keep today's split.

## Decision outcome

Chosen option 1, by the owner. The core's `[data-theme="dark"]` block declares:

| Token | Light ([0014](0014-product-status-colours-one-per-role.md)) | Dark |
|---|---|---|
| `--fsb-success` | `#10b981` | `#81c784` |
| `--fsb-warning` | `#d97706` | `#e6b844` |
| `--fsb-danger` | `#dc2626` | `#e57373` |
| `--fsb-info` | `#0891b2` | `#4dd0e1` |

## Consequences

- **Everything that reads these tokens softens in dark mode:** side-panel status dots, delegated-run card borders, the mic error state, history pills, the popup and markdown error rules.
- **The control panel loses its own set.** Its dark block keeps only the stronger 14% washes (`--success-light` and the rest), now written as `color-mix` of each status colour.
- **Rule: a filled status control uses dark ink in dark mode.** White text on the softer fills would drop below contrast: the recording mic to 2.99:1 and the Beta badge to 1.86:1. Their dark rules use `--fsb-text-inverse` (`#141110`), which gives 6.3:1 and 10.1:1.
- **Light tints get a dark wash.** The mic's error state drew the softer red on its light-mode pink (`#fee2e2`) in dark mode too, at 2.44:1. Its dark rule now uses the 14% wash, giving 5.9:1.
- **Known exception.** The control panel's "Stop all" button keeps white text. Its resting fill was already the softer red (2.99:1, unchanged by this decision), and its hover is `#b91c1c`, on which only white passes. It is listed in [DESIGN.md](../../DESIGN.md), Known Gaps.
- **Message tones stay.** The side panel's and popup's own message tones (`--error-bg`, `--ai-bg` and the rest) are unchanged.

## Evidence

- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `[data-theme="dark"]`
- [extension/ui/options.css](../../extension/ui/options.css) `[data-theme="dark"]` and `.feature-badge.beta`
- [extension/ui/sidepanel.css](../../extension/ui/sidepanel.css) and [popup.css](../../extension/ui/popup.css) `[data-theme="dark"] .mic-btn.recording`
- [../tokens/product-surface.css](../tokens/product-surface.css), the dark block
