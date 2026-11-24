# Typography

System font for reading, Poppins for the wordmark, the platform monospace stack for literal text. See [0012](../decisions/0012-platform-mono-for-technical-text.md), which superseded [0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md).

## Rules

- **MUST** set readable text in the native system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`). No web font for body copy.
- **MUST** reserve Poppins for the wordmark (weights 100 and 900). See [brand.md](brand.md).
- **MUST** set code, selectors, tool names, version tags, eyebrows and technical chips in `--font-mono`, the platform stack (`'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace`), and mark them `translate="no"`. No web font. Chrome on a Mac draws this stack in Monaco, because it cannot reach SF Mono by name; Windows draws Cascadia Code or Consolas.
- **MUST NOT** add Space Mono to new CSS.
- **Site headings** are weight 700, line height 1.2, tracked `-0.02em`, and fluid:
  - h1 `clamp(2rem, 5vw, 3.5rem)`;
  - h2 `clamp(1.5rem, 3.5vw, 2.5rem)`;
  - h3 `clamp(1.125rem, 2.5vw, 1.5rem)`.
- **Site body** is 1rem at line height 1.6, and paragraphs at 1.7 in the secondary text colour.
- **SHOULD** use sentence case everywhere. Uppercase is only for eyebrows (tracked `0.22em`), footer column titles and the `recommended` flag.
- **Product pages** use a small set of sizes and two weights. Recent product work stayed within 11, 12, 14 and 16px at weights 400 and 600, and its reviews checked against that set. Pick from the sizes the surface already uses before adding one.
- **Locales:** the showcase sets per-locale font overrides for Japanese, Korean and Chinese with `:lang()`. Check new text in German and Russian, which run longer than English.

## Tokens

[../tokens/typography.css](../tokens/typography.css) and [../tokens/fonts.css](../tokens/fonts.css). Every name there is proposed: the values ship as literals today.

| Name | Value |
|---|---|
| `--text-h1`, `--text-h2`, `--text-h3` | the clamp sizes above |
| `--text-body` / `--text-sm` / `--text-xs` / `--text-micro` | 1rem / 0.9rem / 0.8rem / 0.72rem |
| `--leading-tight` / `--leading-body` / `--leading-relaxed` | 1.2 / 1.6 / 1.7 |
| `--tracking-tight` / `--tracking-label` / `--tracking-eyebrow` / `--tracking-version` | -0.02em / 0.05em / 0.22em / 0.4em |
| `--font-sans`, `--font-brand`, `--font-mono` | system stack / Poppins / platform mono stack (the one options.css ships) |

The control panel has its own scale: `--dashboard-heading-*` and `--dashboard-body-*` inside `.dashboard-container` in options.css.

## Specimens

[Families](../guidelines/type-families.card.html), [scale](../guidelines/type-scale.card.html), [mono and version tag](../guidelines/type-mono.card.html), [gradient text](../guidelines/type-gradient.card.html).

## Known gaps

- **Poppins never loads on the showcase.** The Content-Security-Policy blocks the only Google Fonts imports, and nothing is self-hosted, so the wordmark falls back to the system font. The site must self-host Poppins 100 and 900.
- **Space Mono is still in shipped CSS** until the migration in [0012](../decisions/0012-platform-mono-for-technical-text.md) lands: onboarding.css, the control panel's `.version-tag`, six showcase page stylesheets and the release-notes template's inline styles. The showcase's own Space Mono declarations already fall back, because the font never loads there.
- **Many literal sizes:** about 76 distinct font sizes in extension CSS and 90 in the showcase SCSS. `scripts/check-style-literals.mjs` counts literal `font-family` stacks; it does not yet count sizes.
- Phase design specs disagree on the product scale (a 24px heading in one, a 14px/600 label in another). The rule above is the common ground, not a contract.

## Evidence

- [styles.scss](../../showcase/angular/src/styles.scss) `body`, `h1`, `h2`, `h3`, `p`, `code, .mono` and the `:lang()` overrides
- [options.css](../../extension/ui/options.css) `.dashboard-container`, `--font-system`, `--font-mono`
- [61-UI-SPEC.md](../../.planning/milestones/v0.9.91-phases/61-delegation-ux-sw-eviction-persistence/61-UI-SPEC.md), section "Typography"
