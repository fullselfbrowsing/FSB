# FSB design system

FSB (Full Self-Browsing) is a browser agent. It reads the actual DOM and calls a site's own APIs through the user's session, with DOM automation as the fallback. This folder is the single written home of how FSB looks, moves and speaks.

Start with [DESIGN.md](../DESIGN.md) at the repository root: the short contract, written for people and coding agents. This folder holds the detail behind it.

## Surfaces and palettes

| Surface | What it is | Palette | Page |
|---|---|---|---|
| Showcase site | Marketing and research pages, every route including `/dashboard` | Site: dark first, slate on near-black | [surfaces/showcase.md](surfaces/showcase.md) |
| Side panel | The extension's chat and task surface | Product: warm, light first | [surfaces/side-panel.md](surfaces/side-panel.md) |
| Popup | A 400×600 chat window, opened when the side panel cannot open or when pinned (not a toolbar popup) | Product | [surfaces/popup.md](surfaces/popup.md) |
| Control panel | Settings and dashboard (`control_panel.html` with `options.css`) | Product | [surfaces/control-panel.md](surfaces/control-panel.md) |
| Onboarding | First-run setup inside the extension | Site (its own copy) | [surfaces/onboarding.md](surfaces/onboarding.md) |
| In-page overlays | What FSB draws on web pages: glows, progress card, replay, crawl card, inspector | Overlay: `#ff8c00` family | [surfaces/overlays.md](surfaces/overlays.md) |
| 1Password vault | Vault settings, prompts and the on-page sheet (pending, PR #172) | Product and overlay | [surfaces/vault.md](surfaces/vault.md) |

One brand orange, `#ff6b35`, runs through the site and the extension pages. The overlays use `#ff8c00`. See [decisions/0002](decisions/0002-three-palettes-one-brand-orange.md) and [decisions/0003](decisions/0003-overlay-accent-ff8c00.md).

## Visual foundations in brief

- **Color.** One accent and almost nothing else. The site is dark first on a pure-black body, with `#0a0a0a` cards and `#141414` raised surfaces, and slate text. `[data-theme="light"]` flips it and leaves the accent alone. The extension pages run a warm ramp from `#fffdfb` with `#1f1a17` ink and an eleven-step `--fsb-gray-*` scale, and `[data-theme="dark"]` flips them to near-black (`#050505` page, `#0d0d0d` cards) under warm light text. Two background colours per screen at most. Details: [foundations/color.md](foundations/color.md).
- **Accent behaviour.** The orange appears four ways only: flat, as the 135° gradient to `#ff8c42`, as a 10–12% wash behind icon tiles and eyebrow pills, and as a glow (`0 0 20px` orange at 15%).
- **Type.** The system stack carries all readable text. Poppins is only for the wordmark, at weights 100 and 900. The platform monospace stack (`--font-mono`) carries code, tokens, version tags and eyebrows, with no web font. Headings are 700, tracked `-0.02em`, and fluid. Details: [foundations/typography.md](foundations/typography.md).
- **Backgrounds.** Flat: no photography, illustration or repeating pattern. The only decoration is the home page's hero glow, soft orange radial light that breathes on a 12–14s loop. Gradients belong to the accent, never to a surface.
- **Cards.** A quiet surface with a hairline border (white at 8% on dark), 12px radius, generous padding and no shadow at rest. On hover the shadow arrives with a lift and a border step to 15%. A recommended card swaps its border to solid orange and gains the glow instead of lifting. Details: [foundations/elevation.md](foundations/elevation.md).
- **Motion.** Three eased durations: 150, 250 and 400ms. Cards lift 4px and buttons 2px. No bounce, spring or scale-in. Every animation honours `prefers-reduced-motion`. Opened content never shrinks the section around it. Details: [foundations/motion.md](foundations/motion.md).
- **Transparency and blur.** Only for fixed chrome: the nav bar sits behind a 16px backdrop blur. Nothing in the content flow is translucent.
- **Layout.** A 1200px container with 24px gutters (16px on phones), 80px between sections (48px on phones), a 64px nav (56px on phones) and a 4px spacing grid. Details: [foundations/spacing-layout.md](foundations/spacing-layout.md).
- **Voice.** Confident, technical, specific: a claim, then a mechanism or a number from its source of truth. Sentence case, no emoji. Details: [foundations/voice-and-copy.md](foundations/voice-and-copy.md).
- **The mark.** A hairline Poppins F, a black Poppins S and a hand-drawn B, inheriting `currentColor`. Details: [foundations/brand.md](foundations/brand.md).
- **Icons.** Font Awesome 6.6 Free, provider marks as SVG, no emoji. Details: [foundations/iconography.md](foundations/iconography.md).
- **Accessibility.** Visible focus, reduced motion, 44px targets for new controls, WCAG AA contrast. Details: [foundations/accessibility.md](foundations/accessibility.md).

## What is in this folder

| Path | What it holds |
|---|---|
| [tokens/](tokens/colors.css) | The token values. Site layer: `colors.css`, `effects.css`, `spacing.css`, `typography.css`, `fonts.css`. Product layer: `product-surface.css`. In-page overlays: `overlay.css`. Plus `reset.css` for specimen pages. Each file mirrors a shipped block; see "Checks" below |
| [styles.css](styles.css) | The one stylesheet specimen pages link |
| [index.html](index.html) | The living style guide: every foundation specimen on one page. Open it from disk |
| [guidelines/](guidelines/color-accent.card.html) | The specimen cards (brand, color, type, spacing, motion, iconography) |
| [foundations/](foundations/color.md) | The rules per foundation, each with Rules, Tokens, Specimens, Known gaps and Evidence |
| [surfaces/](surfaces/showcase.md) | One page per shipped surface: anatomy, states, motion, copy, accessibility and the tests that pin it |
| [components/](components/README.md) | The design tool's React prototyping kit and the inventory mapping each component to shipped code |
| [ui_kits/showcase/](ui_kits/showcase/README.md) | A click-through prototype of the older, flat home and agents pages. Stale against the depth pages; needs the design tool's bundle |
| [assets/](assets/providers/claude.svg) | Logos, provider marks and icons. Each matches its shipped twin under `showcase/assets/` |
| [decisions/](decisions/0000-decision-record-template.md) | Numbered design decision records |
| [sources.md](sources.md) | Where this came from: the design tool export, the four design canvases, and every correction made on import |
| [style-literals.baseline.json](style-literals.baseline.json) | Raw style values per shipped file, held by the ratchet |

Names in the token files marked `/* proposed */` are the system's vocabulary for values that ship as literals today. `data-surface="product"` and `data-surface="overlay"` exist only in this folder. They let one specimen page show palettes whose names collide; shipped product pages get the product values on `:root` by loading `extension/shared/fsb-ui-core.css`.

## Checks

`npm test` runs both checks; `npm run test:design` runs only them.

- **`node scripts/verify-design-system.mjs`** fails when:
  - a token here differs from the shipped block it mirrors, or exists on only one side;
  - an overlay token no longer matches its source selector in `visual-feedback.js`;
  - DESIGN.md's front matter disagrees with the tokens;
  - a specimen card prints a stale value;
  - an asset differs from its shipped twin;
  - a link in these docs is broken;
  - a page lacks its required sections;
  - decision numbers repeat or skip.
- **`node scripts/check-style-literals.mjs`** holds the number of raw colours, integer z-index values, literal font stacks and page-local colour tokens in every shipped stylesheet, plus the CSS strings in `visual-feedback.js`. The counts must equal [style-literals.baseline.json](style-literals.baseline.json):
  - **Count rose:** use a token, or put a comment starting with `design-literal-ok:` and a reason on the declaration.
  - **Count fell:** run `node scripts/check-style-literals.mjs --write` to lock the improvement in.

| Source | Mirrored by |
|---|---|
| `showcase/angular/src/styles.scss` `:root`, `[data-theme="light"]`, the 768px block | site layer |
| `extension/shared/fsb-ui-core.css` `:root`, `[data-theme="dark"]` | `product-surface.css` |
| `extension/ui/onboarding.css` `:root`, `[data-theme="light"]` | site layer (subset) |
| shadow-root stylesheets in `extension/content/visual-feedback.js` | `overlay.css` |

## Changing the design system

- **Change a token** in the shipped file and in its twin here, in the same change. Shipped extension pages cannot load files from this folder, and the showcase image is built without it, so both copies exist until a generator replaces one; see [decisions/0010](decisions/0010-mirror-tokens-until-generated.md).
- **Change a rule** that more than one surface follows: update the foundation or surface page and DESIGN.md, and add a decision record.
- **Add a component or pattern:** add it to [components/README.md](components/README.md) or to its surface page. Add a specimen card only if it can render from `styles.css` alone, and list the card in [index.html](index.html).
- **Work on a hash-pinned file:** several shipped files are pinned by tests (sha256 hashes and exact substrings). Each surface page lists them under "Tests that pin it". Editing a hashed file means recomputing its pin in the same change.

## Updating from the design tool

The files here started as an export from the design tool, and this folder keeps that layout so a later export can be compared file by file. A new export is a proposal, not an overwrite:

1. Diff it against this folder.
2. Keep the corrections listed in [sources.md](sources.md).
3. Re-run `npm run test:design`.
4. Record the export in `sources.md`.

## Intentional additions in the kit

The kit defines its components itself; the shipped code has CSS classes, not components. Three boundaries were drawn by the design tool:

- **Field** wraps a label and a control.
- **StatBlock** is the stat row from the highlight cards.
- **SectionHeader** merges the site's centred section header with a numbered style.

Nothing else was invented. The product has no Avatar, Tabs, Dialog, Tooltip or Accordion.
