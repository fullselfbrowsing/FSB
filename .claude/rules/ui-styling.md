---
paths:
  - "extension/ui/**"
  - "extension/shared/**"
  - "extension/content/visual-feedback.js"
  - "showcase/angular/src/**/*.scss"
  - "showcase/angular/src/**/*.html"
  - "showcase/angular/src/**/*.ts"
  - "design-system/**"
---

# UI styling rules

These rules apply to every edit of FSB's UI. The full contract is in [DESIGN.md](../../DESIGN.md).

## Pick the right palette

- **Showcase site and onboarding:** use the site tokens (`--primary`, `--bg-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--transition-*`). Dark is the default; `[data-theme="light"]` flips it.
- **Side panel, popup and control panel:** use the product tokens `--fsb-*` from `extension/shared/fsb-ui-core.css`. Light is the default; `[data-theme="dark"]` flips it.
- **Overlays on web pages:** use the `#ff8c00` family listed in `design-system/tokens/overlay.css`. Never use `#ff6b35` there.

## Must

- Take colours, radii, shadows and durations from a token of that palette. Never copy raw values from another palette.
- When you change a token, change its twin in `design-system/tokens/` in the same edit.
- Snap spacing to the 4px scale.
- Give every interactive element a visible focus state. Honour `prefers-reduced-motion`.
- Put extension copy in `extension/_locales` and showcase copy behind i18n markers. Never hard-code a version, a tool count or a benchmark figure.
- Mark product names, selectors, tool names and versions `translate="no"`.

## Must not

- No emoji. No icon set other than Font Awesome 6.6. New showcase glyphs go through the self-hosted subset.
- In the showcase, no `animation` in an inline `style` attribute, and no unprefixed keyframe names.
- No sideways scrolling on the depth pages home, about, agents and support, and no shrinking a plane to make room for content that opens inside it.
- No secret input in page DOM or in a shadow root.

## Before you finish

- Run `npm run test:design`.
- A raised raw-value count needs a token. If a literal must stay, add a comment starting with `design-literal-ok:` and a reason.
- If the change makes a count fall, run `node scripts/check-style-literals.mjs --write`.
- Several shipped stylesheets are pinned by tests, by sha256 or by exact substrings; the surface pages in `design-system/surfaces/` list them. Recompute a pin in the same change when you edit a pinned file.
