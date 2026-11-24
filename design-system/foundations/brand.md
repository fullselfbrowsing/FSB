# Brand

The FSB wordmark, the app icon and the logo files.

## Rules

- **MUST** draw the wordmark as three parts: a hairline Poppins F (weight 100), a black Poppins S (weight 900) and the hand-drawn B, an SVG path with `viewBox="-3 -3 78 103"` filled with `currentColor`.
- **MUST** size the B at `height: 0.74em` with `margin-left: 0.01em`, baseline-aligned, and track the row at `-0.02em`. At 0.74em the B's ink top meets the top of the Poppins Black S.
- **MUST** let the whole mark inherit `currentColor`. Never colour the F, S and B separately, never equalise their weights, never stretch the lockup.
- **MUST** mark the wordmark `translate="no"`.
- **SHOULD** size it 1.5rem in the nav, 1.32rem in footers and `1em` inside a heading.
- **MUST** use the shipped app icon: the mark knocked out on pure black, `icon48.png` and `icon128.png`.
- The version tag sits beside the mark in mono with `0.4em` tracking, prefixed with ▽ (U+25BD). Read the version from `package.json`; never type it into a page or a doc.

## Tokens

| Name | Value | Where it ships |
|---|---|---|
| `--font-brand` (proposed) | `'Poppins', system-ui, sans-serif` | literal stacks in the shell and onboarding |
| `--weight-hairline` / `--weight-black` (proposed) | 100 / 900 | literals |
| `--tracking-tight` (proposed) | -0.02em | `showcase-shell.component.scss` `.fsb-row` |
| `--tracking-version` (proposed) | 0.4em | `.version-tag` |

## Specimens

- [The mark](../guidelines/brand-mark.card.html), [construction](../guidelines/brand-construction.card.html), [on surfaces](../guidelines/brand-on-surfaces.card.html), [sizing and version tag](../guidelines/brand-sizing.card.html), [app icon](../guidelines/brand-app-icon.card.html)
- Components: [FsbMark](../components/brand/FsbMark.prompt.md), [VersionTag](../components/brand/VersionTag.prompt.md)
- The B on its own: [assets/logos/fsb-mark-b.svg](../assets/logos/fsb-mark-b.svg). `scripts/verify-design-system.mjs` checks that shipped pages still inline the same path.

## Known gaps

- **Poppins never loads on the showcase.** Its Content-Security-Policy blocks Google Fonts and no page self-hosts Poppins, so the F and S render in the system font on every live page. The extension bundles Poppins 100 and 900 and shows the real mark. Fix font delivery before tuning wordmark geometry. See [0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md).
- **Drifted copies:**
  - onboarding draws the B at 0.68em, so it sits short;
  - release notes has inline copies at 0.715em with a 0.02em gap;
  - the home and agents `.fsb-highlight-wordmark` copies use letter-spacing 0.
- **No shared component.** The showcase draws F and S with `::before` content in each copy, so every page that shows the mark repeats it.
- The status pill on PR #173 draws its F at Poppins 200 as outlines (fonts inside a shadow root are ignored). 200 is not shipped as a font file.

## Evidence

- [showcase-shell.component.scss](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss) `.fsb-mark`, `.fsb-row`, `.fsb-f`, `.fsb-s`, `.fsb-b`
- [showcase-shell.component.html](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html) the inline B path
- [onboarding.css](../../extension/ui/onboarding.css) the wordmark rules and `@font-face`
- [showcase/assets/icon128.png](../../showcase/assets/icon128.png), [showcase/assets/fsb_logo_dark_footer.png](../../showcase/assets/fsb_logo_dark_footer.png)
