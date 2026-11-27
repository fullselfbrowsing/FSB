# Brand

The FSB wordmark, the app icon and the logo files.

## Rules

- **MUST** draw the wordmark as three parts: a hairline Poppins F (weight 100), a black Poppins S (weight 900) and the hand-drawn B, an SVG path with `viewBox="-3 -3 78 103"` filled with `currentColor`.
- **MUST** size the B at `height: 0.74em` with `margin-left: 0.01em`, baseline-aligned, and track the row at `-0.02em`. At 0.74em the B's ink top (0.718em) meets the top of the Poppins Black S (0.720em).
- **MUST** copy the markup from the header of [`fsb-wordmark.css`](../../showcase/angular/src/styles/fsb-wordmark.css) and give size and colour to its wrapper, never to the parts. On the site that sheet holds the only rules for `.fsb-row`, `.fsb-f`, `.fsb-s` and `.fsb-b`; `letter-spacing` on `.fsb-row` is the one override it allows.
- **MUST** let the whole mark inherit `currentColor`. Never colour the F, S and B separately, never equalise their weights, never stretch the lockup.
- **MUST** mark the wordmark `translate="no"`.
- **SHOULD** size it 1.5rem in the nav, 1.32rem in footers and `1em` inside a heading.
- **Fonts.** On the site the F and S come from two one-glyph faces named `'FSB Wordmark'` (Poppins Thin F, Poppins Black S), inlined as `data:` URIs because the CSP's `font-src` allows only `'self'` and `data:`. The separate family name keeps them out of other text set in Poppins. Onboarding uses the Poppins 100 and 900 files the extension bundles.
- **MUST** use the shipped app icon: the mark knocked out on a black tile whose corners are cut at a radius of 30/128 of its side (`RADIUS_128` in `scripts/build-icon-corners.mjs`), `icon48.png` and `icon128.png`. Under FSB's Light theme the toolbar draws the inverted pair, a white tile with the black mark (`icon16_light.png`, `icon128_light.png`).
- **Version tag.** Mono with `0.4em` tracking, prefixed with ▽ (U+25BD). The version comes from the extension manifest: `APP_VERSION` on the site, `chrome.runtime.getManifest()` in the extension. Never type it into a page or a doc.

## Tokens

| Name | Value | Where it ships |
|---|---|---|
| `--font-brand` (proposed) | `'Poppins', system-ui, sans-serif` | literal stacks: `fsb-wordmark.css` `.fsb-row`, after `'FSB Wordmark'`, and onboarding.css `.fsb-row` |
| `--weight-hairline` / `--weight-black` (proposed) | 100 / 900 | literals |
| `--tracking-tight` (proposed) | -0.02em | `fsb-wordmark.css` `.fsb-row` |
| `--tracking-version` (proposed) | 0.4em | `.version-tag` |

## Specimens

- [The mark](../guidelines/brand-mark.card.html), [construction](../guidelines/brand-construction.card.html), [on surfaces](../guidelines/brand-on-surfaces.card.html), [sizing and version tag](../guidelines/brand-sizing.card.html), [app icon](../guidelines/brand-app-icon.card.html)
- Components: [FsbMark](../components/brand/FsbMark.prompt.md), [VersionTag](../components/brand/VersionTag.prompt.md)
- The B on its own: [assets/logos/fsb-mark-b.svg](../assets/logos/fsb-mark-b.svg). `scripts/verify-design-system.mjs` checks that the shell and onboarding still inline the same path, and [`fsb-wordmark-parity.test.js`](../../tests/fsb-wordmark-parity.test.js) checks every copy.

## Known gaps

- **No shared component.** The rules are shared and the markup is not: eight showcase templates repeat it (21 copies), and onboarding keeps its own rules in onboarding.css, with real `F` and `S` text in the bundled Poppins. `fsb-wordmark-parity.test.js` fails when a copy drifts from `fsb-wordmark.css`. Its check that nothing restyles the parts reads stylesheets only, so it misses the two release-notes copies that set their size and colour inline on `.fsb-row` itself.
- **Highlight copies track at 0.** `.fsb-highlight-wordmark .fsb-row` on home and agents sets `letter-spacing: 0`, the override the sheet allows, so those copies match `wordmark()` in `scripts/build-benchmark-assets.mjs`, which draws the mark into the benchmark charts on raw advances. The rule above says `-0.02em`.
- **The status pill draws its own mark.** Fonts inside a shadow root are ignored, so `PILL_WORDMARK_SVG` in visual-feedback.js is outlines. Its F is Poppins 200, which ships as no font file. Its B is 660.2 of 1000 units tall, the height of a B at 0.68em, so its top sits below the S top (720). The parity test does not read it.

## Evidence

- [fsb-wordmark.css](../../showcase/angular/src/styles/fsb-wordmark.css) the `'FSB Wordmark'` faces, `.fsb-row`, `.fsb-f`, `.fsb-s`, `.fsb-b`
- [showcase-shell.component.scss](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss) `.fsb-mark`, `.nav-brand .fsb-mark`, `.footer-brand .fsb-mark`
- [showcase-shell.component.html](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html) the inline B path
- [server.js](../../showcase/server/server.js) `font-src`
- [onboarding.css](../../extension/ui/onboarding.css) the wordmark rules and `@font-face`
- [visual-feedback.js](../../extension/content/visual-feedback.js) `PILL_WORDMARK_SVG`
- [build-icon-corners.mjs](../../scripts/build-icon-corners.mjs) `RADIUS_128`, `LIGHT`
- [showcase/assets/icon128.png](../../showcase/assets/icon128.png), [showcase/assets/fsb_logo_dark_footer.png](../../showcase/assets/fsb_logo_dark_footer.png)
