# 0012. Technical text uses the platform monospace stack; Space Mono is retired

- Status: Accepted
- Date: 2026-11-24

Supersedes 0004. The parts of [0004](0004-type-system-font-poppins-wordmark-space-mono.md) that stay are restated below.

## Context and problem statement

[0004](0004-type-system-font-poppins-wordmark-space-mono.md) put Space Mono on code, selectors, tool names, version tags and eyebrows. In practice:

- **The showcase never loads Space Mono.** Its Content-Security-Policy blocks the Google Fonts imports, and nothing self-hosts the font, so every Space Mono label on the live site already falls back to another mono.
- **The control panel and the showcase's `code, .mono` rule already use a platform stack** that starts with `'SF Mono'`.
- **Space Mono is wide**, so long selectors and log lines clip sooner, and it has no ▽ glyph, so the version prefix always falls back.

The owner compared three versions in Chrome: Space Mono everywhere, the platform stack everywhere, and a split. That check also showed that Chrome on macOS cannot reach SF Mono by name and draws the stack in Monaco. Windows draws Cascadia Code or Consolas.

## Considered options

1. Space Mono everywhere, self-hosted on every surface.
2. The platform monospace stack everywhere, with no web font.
3. Split by job: Space Mono for short labels, platform mono for code and logs.

## Decision outcome

Chosen option 2, by the owner. Technical text uses the platform stack:

```css
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
```

This is the stack the control panel already ships. Kept from 0004:

- readable text uses the native system stack;
- Poppins (weights 100 and 900) appears only in the wordmark.

## Consequences

- **No web font for technical text.** Space Mono is no longer loaded or named in new CSS. Version tags, eyebrows, tool chips and code all use `--font-mono`, so labels look like the platform rather than like Space Mono.
- **Applied in shipped CSS on 2026-11-25.**
  - Every monospace `font-family` stack in the extension and showcase stylesheets reads the token: `--fsb-font-mono` on product pages and `--font-mono` on the site and onboarding. That replaced 16 spellings of the stack, including Space Mono.
  - Both Space Mono `@font-face` pairs and the two font files are gone.
  - Onboarding and the control panel now draw Monaco on macOS, where Space Mono drew before. Showcase labels that fell back to Menlo draw Monaco too.
  - The showcase's CJK code rule keeps a literal, because its CJK fallbacks sit between the platform stack and `monospace`.
- **The release-notes template too.** Its 533 inline styles read `--font-mono`. They also appear as placeholder text inside 38 i18n messages, so the source catalogue and the seven locale files were edited in place:
  - a fresh extraction matches the edited source byte for byte;
  - every message ID is unchanged;
  - `sync-xliff-targets.mjs` keeps every translation, with no unit marked for review.
- **The ratchet tracks the migration.** `scripts/check-style-literals.mjs` already counts literal `font-family` stacks, so each step lowers the baseline.
- **The pills.** The status pill sets its labels in the platform stack and loads no font. The vault pill in PR #172 still registers Space Mono on the document (`fsb-vault-mono`) and should switch the same way; shadow roots ignore `@font-face`, so no web font is needed.
- **Poppins on the showcase.** Since PR #173 the wordmark's F and S are one-glyph `data:` faces in `fsb-wordmark.css`, which `font-src 'self' data:` admits. Space Mono needs no hosting there.

## Evidence

- [extension/ui/options.css](../../extension/ui/options.css) `--font-mono` (the shipped platform stack)
- [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss) `code, .mono`
- [showcase/server/server.js](../../showcase/server/server.js), the Content-Security-Policy (`style-src`, `font-src`)
- [design-system/tokens/fonts.css](../tokens/fonts.css) `--font-mono`
- [foundations/typography.md](../foundations/typography.md)
