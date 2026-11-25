# Typography

System font for reading, Poppins for the wordmark, the platform monospace stack for literal text. See [0012](../decisions/0012-platform-mono-for-technical-text.md), which superseded [0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md).

## Rules

- **MUST** set readable text in the native system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`). No web font for body copy.
- **MUST** reserve Poppins for the wordmark (weights 100 and 900). On the site its F and S come from two one-glyph `'FSB Wordmark'` faces inlined in [`fsb-wordmark.css`](../../showcase/angular/src/styles/fsb-wordmark.css); the extension bundles both weights. See [brand.md](brand.md).
- **MUST** set code, selectors, tool names, version tags, eyebrows and technical chips in `--font-mono`, the platform stack (`'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace`), and mark them `translate="no"`. No web font. Chrome on a Mac draws this stack in Monaco, because it cannot reach SF Mono by name; Windows draws Cascadia Code or Consolas.
- **MUST NOT** add Space Mono to new CSS.
- **Site headings** are weight 700 and line height 1.2 (`h1` to `h6` in styles.scss), and fluid:
  - h1 `clamp(2rem, 5vw, 3.5rem)`;
  - h2 `clamp(1.5rem, 3.5vw, 2.5rem)`;
  - h3 `clamp(1.125rem, 2.5vw, 1.5rem)`.
- **Heading tracking** is set page by page; styles.scss sets no `letter-spacing`. The agents, privacy, legal and release-notes headings (`.agents-hero h1`, `.privacy-header h1`, `.privacy-content h2`, `.legal-header h1`, `.legal-content h2`, `.rn-hero h1`) use `-0.02em`. Lattice, Concierge and PhantomStream track `h1` to `h4` at `-0.02em`, with the Lattice and Concierge `h1` at `-0.035em`. Home, about and support headings are not tracked.
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
| `--font-sans`, `--font-brand`, `--font-mono` | system stack / Poppins (the site's wordmark stack puts `'FSB Wordmark'` first) / platform mono stack (the one options.css ships) |

The control panel has its own scale: `--dashboard-heading-*` and `--dashboard-body-*` inside `.dashboard-container` in options.css.

The product core ships `--fsb-font-mono` (the 0012 stack), with a `--font-mono` alias that the control panel reads ([0013](../decisions/0013-name-values-before-changing-them.md)). The site's `--font-mono` stays proposed for now. The dashboard and stats pages already read `var(--font-mono, …)` with a Menlo fallback, so defining it would change them; it ships with the Space Mono migration.

## Specimens

[Families](../guidelines/type-families.card.html), [scale](../guidelines/type-scale.card.html), [mono and version tag](../guidelines/type-mono.card.html), [gradient text](../guidelines/type-gradient.card.html).

## Known gaps

- **Poppins outside the wordmark never loads on the showcase.** No face named `'Poppins'` exists on the site (the wordmark's two glyphs are their own family), and the Content-Security-Policy blocks the Google Fonts imports. Text set in `'Poppins'` elsewhere, against the rule above, draws in its fallback: Concierge's `.con-mark`, all of Prometheus through `.pr-page`, and the `.ps-mini-*` mocks on PhantomStream and release notes. Outfit, imported by lattice, concierge and phantom-stream, falls back the same way.
- **Space Mono is still in shipped CSS** until the migration in [0012](../decisions/0012-platform-mono-for-technical-text.md) lands: onboarding.css, the control panel's `.version-tag`, the status pill's `PILL_MONO` stack, six showcase page stylesheets and the release-notes template's inline styles. The showcase's own Space Mono declarations already fall back, because the font never loads there.
- **The showcase's mono stack is not `--font-mono`.** `code, .mono` in styles.scss and the shell's `.version-tag` use `'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace`, which names no Cascadia Code, Consolas or Courier New.
- **Many literal sizes:** 85 distinct literal font sizes in the extension's `ui/` and `shared/` CSS and 83 in the showcase SCSS, not counting `clamp()`, `var()` and other functions. `scripts/check-style-literals.mjs` counts literal `font-family` stacks; it does not yet count sizes.
- Phase design specs disagree on the product scale (a 24px heading in one, a 14px/600 label in another). The rule above is the common ground, not a contract.

## Evidence

- [styles.scss](../../showcase/angular/src/styles.scss) `body`, `h1`, `h2`, `h3`, `p`, `code, .mono` and the `:lang()` overrides
- [fsb-wordmark.css](../../showcase/angular/src/styles/fsb-wordmark.css) the `'FSB Wordmark'` faces and `.fsb-row`
- [options.css](../../extension/ui/options.css) `.dashboard-container`, `--font-system`, `--font-mono`
- [61-UI-SPEC.md](../../.planning/milestones/v0.9.91-phases/61-delegation-ux-sw-eviction-persistence/61-UI-SPEC.md), section "Typography"
