# 0014. Product status colours: one red, one green, one amber

- Status: Accepted
- Date: 2026-11-25

## Context and problem statement

After [0013](0013-name-values-before-changing-them.md) named the values in use, the product pages (side panel, popup, control panel) still had two or three hues for each status role:

| Role | Hues in use | Contrast on white |
|---|---|---|
| Danger | `#ef4444` (error dots, failed runs, danger buttons) and the core's `--fsb-danger` `#dc2626` (recording mic, delegated cards) | 3.76:1 and 4.83:1 |
| Success | `#22c55e` (connected, succeeded, saved) and the core's `--fsb-success` `#10b981` (status dots, delegated cards) | 2.28:1 and 2.54:1 |
| Warning | the core's `--fsb-warning` `#f59e0b`, `#d97706` (partial results, Beta badge) and `#eab308` (fallback) | 2.15:1, 3.19:1 and 1.92:1 |

On 2026-11-25 the owner compared screenshots of the side panel and control panel. Each was rendered from the shipped stylesheets with one token changed per option, in light and dark.

## Considered options

For each role:

1. Keep today's hues.
2. Fold every hue into the core's current value.
3. Move the core to the other hue and fold the rest into it.

## Decision outcome

Chosen by the owner:

- **Danger:** fold into the core's `#dc2626`. It is the only red that passes AA as text on white.
- **Success:** fold into the core's `#10b981`, so delegated cards and status dots stay as they are.
- **Warning:** move the core's `--fsb-warning` to `#d97706` and fold `#f59e0b` and `#eab308` into it. It is the only amber that clears 3:1 for UI parts on white.

The dark-mode values of the same three tokens are set by [0015](0015-status-colours-soften-in-dark-mode.md).

## Consequences

- **Removed tokens.** `--fsb-red-500`, `--fsb-green-500`, `--fsb-yellow-500` and `--fsb-amber-600` are gone. Their uses read `--fsb-danger`, `--fsb-success` and `--fsb-warning`.
- **Washes keep their alpha.** Transparent washes of these hues are written as `color-mix(in srgb, var(--fsb-danger) 10%, transparent)`, so they follow the token in both themes.
- **Warning darkens a little everywhere.** Every use of `--fsb-warning` and `--warning-color` moves from `#f59e0b` to `#d97706`: the running status dot, partial-result rules, the provider notice, the control panel's warnings and the popup's owned dot.
- **Kept:**
  - `--fsb-amber-400` and `--fsb-amber-800`, the login prompt's amber text pair, which stayed the same in every option. They are not for new code.
  - Tonal alert shades such as `#991b1b` on `#fee2e2`. They are separate roles this decision did not cover.
  - The site's own status colours (`--danger` `#ef4444`, `--success` `#22c55e`, `--warning` `#eab308`). They belong to the site palette.
- **Card-network labels are fixed again.** The Amex and Discover labels had picked up `--fsb-info` and `--fsb-amber-600` only because their values matched. They are literals again, marked `design-literal-ok:`, so they do not change with status colours or themes.
- **Follow-up.** Green and amber still fail AA as small text on white (2.5:1 and 3.2:1), and so does the Beta badge's white label. Text in these roles needs a darker shade.

## Evidence

- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `:root`
- [extension/ui/options.css](../../extension/ui/options.css), [sidepanel.css](../../extension/ui/sidepanel.css), [popup.css](../../extension/ui/popup.css), [markdown.css](../../extension/ui/markdown.css)
- [../tokens/product-surface.css](../tokens/product-surface.css)
