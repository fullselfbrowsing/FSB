---
version: alpha
name: FSB
description: "Design system for FSB (Full Self-Browsing), a browser agent. One brand orange over three palettes: the showcase site (cool, dark first), the extension's own pages (warm, light first) and the overlays FSB draws on web pages."
colors:
  primary: "#ff6b35"
  primary-hover: "#e55a2b"
  site:
    dark:
      surface: "#000000"
      surface-card: "#0a0a0a"
      surface-elevated: "#141414"
      on-surface: "#f1f5f9"
      on-surface-variant: "#94a3b8"
      on-surface-muted: "#64748b"
    light:
      surface: "#ffffff"
      surface-card: "#f8f9fa"
      surface-elevated: "#f1f5f9"
      on-surface: "#0f172a"
      on-surface-variant: "#475569"
      on-surface-muted: "#64748b"
  product:
    light:
      surface: "#fffdfb"
      surface-card: "#ffffff"
      surface-muted: "#f8f4ef"
      on-surface: "#1f1a17"
      on-surface-variant: "#6a584d"
      on-surface-muted: "#8d7a6e"
    dark:
      surface: "#050505"
      surface-card: "#0d0d0d"
      surface-muted: "#121212"
      on-surface: "#f6efe9"
      on-surface-variant: "#d2c1b4"
      on-surface-muted: "#a99283"
    success: "#10b981"
    warning: "#f59e0b"
    error: "#dc2626"
    info: "#0891b2"
  overlay:
    thinking: "#ff8c00"
    acting: "#ff6600"
    calling: "#8b5cf6"
    done: "#34d399"
    guarded: "#f5a524"
    crawl: "#38bdf8"
typography:
  wordmark:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontWeight: 100
  body-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: 1rem
    lineHeight: 1.6
  paragraph:
    lineHeight: 1.7
  label-mono:
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace"
    letterSpacing: 0.22em
  headline:
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  sm:
    headline-lg:
      fontSize: 2rem
    headline-md:
      fontSize: 1.5rem
    headline-sm:
      fontSize: 1.125rem
  lg:
    headline-lg:
      fontSize: 3.5rem
    headline-md:
      fontSize: 2.5rem
    headline-sm:
      fontSize: 1.5rem
rounded:
  site:
    sm: 0.5rem
    md: 0.75rem
    lg: 1rem
    xl: 1.5rem
  product:
    sm: 8px
    md: 12px
    lg: 18px
    xl: 24px
  full: 999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "6": 24px
  "8": 32px
  "12": 48px
  container-max: 1200px
  nav-height: 64px
  sm:
    nav-height: 56px
motion:
  state-change:
    duration: 150ms
    timingFunction: ease
  surface-change:
    duration: 250ms
    timingFunction: ease
  surface-enter:
    duration: 400ms
    timingFunction: ease
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.site.md}"
    padding: 12px 28px
  card:
    backgroundColor: "{colors.site.dark.surface-card}"
    rounded: "{rounded.site.md}"
    padding: 28px 26px
  product-card:
    backgroundColor: "{colors.product.light.surface-card}"
    rounded: "{rounded.product.md}"
---

# FSB design

This file is the contract. Read it before changing anything people see:
- the showcase site under `showcase/angular`;
- the extension's pages under `extension/ui`;
- the overlays `extension/content/visual-feedback.js` draws on web pages.

The detail behind every rule is in [design-system/](design-system/README.md). The front matter above holds the key values in the [design.md](https://github.com/google-labs-code/design.md) format. `scripts/verify-design-system.mjs` fails when any of them drifts from the token files.

## Overview

FSB reads web pages and acts on them for the user. Its look is quiet, technical and confident:
- flat near-black or warm-white surfaces;
- hairline borders;
- one orange accent.

Motion is quick and eased. Copy makes a claim and backs it.

There are three palettes, each tied to where it ships ([decision 0002](design-system/decisions/0002-three-palettes-one-brand-orange.md)):

| Palette | Ships on | Default | Theme switch |
|---|---|---|---|
| Site | the showcase (every route, including `/dashboard`) and extension onboarding | dark | `[data-theme="light"]` |
| Product | side panel, popup, control panel | light | `[data-theme="dark"]` |
| Overlay | everything drawn on web pages | dark cards | none |

## Colors

- **Brand accent.** The site and the extension pages use `#ff6b35` (`--primary`, `--fsb-primary`), hovering to `#e55a2b`. The overlays use `#ff8c00` and its neighbours ([decision 0003](design-system/decisions/0003-overlay-accent-ff8c00.md)).
- **The orange appears four ways and no others:**
  - flat;
  - the 135° gradient to `#ff8c42`;
  - a 10–12% wash;
  - a glow.
- **Semantic colours carry meaning only.** On product pages: success, warning, danger and info (`--fsb-success` etc.). On the site, red marks competitor and warning states.
- **Tokens:** `@design-system/tokens/colors.css` (site), `@design-system/tokens/product-surface.css` (product), `@design-system/tokens/overlay.css` (overlays). Rules: `@design-system/foundations/color.md`.

## Typography

- **System stack** for every readable word.
- **Poppins 100 and 900** only in the wordmark.
- **The platform monospace stack** (`--font-mono`: SF Mono, Monaco, Cascadia Code and on) for code, selectors, tool names, version tags and eyebrows, marked `translate="no"`. No web font; Chrome on a Mac draws it in Monaco ([decision 0012](design-system/decisions/0012-platform-mono-for-technical-text.md)).
- **Site headings** are 700 and fluid; pages that track them use -0.02em (home, about and support do not):

  | Heading | Phones | Desktop |
  |---|---|---|
  | h1 | 2rem | 3.5rem |
  | h2 | 1.5rem | 2.5rem |
  | h3 | 1.125rem | 1.5rem |

- **Body** is 1rem at 1.6, and paragraphs at 1.7.
- **Product pages** keep to the sizes they already use.

Rules: `@design-system/foundations/typography.md`.

## Layout

- **Container.** 1200px with 24px gutters; 16px gutters on phones.
- **Sections.** 80px apart; 48px on phones.
- **Nav.** 64px tall; 56px on phones.
- **Spacing.** A 4px grid: 4, 8, 12, 16, 20, 24, 32, 48.
- **Side panel.** It holds at 350px and 500px wide.
- **Depth pages** (home, about, agents, privacy, support) are fixed 3D stages. On phones:
  - on home, about, agents and support, every plane fits one screen (privacy stays a scrolling document);
  - nothing scrolls sideways;
  - content that opens inside a plane scrolls there rather than shrinking it.

  See [decision 0007](design-system/decisions/0007-depth-pages-on-phones.md).

Rules: `@design-system/foundations/spacing-layout.md`.

## Elevation & Depth

- **Cards** are flat at rest: a hairline border, no shadow. On hover they gain a shadow and lift.
- **Site shadows** are deep and soft on dark and shallow on light. **Product shadows** are warm and tight.
- **The orange glow** marks emphasis, never height.
- **Blur** is only for fixed chrome (the nav, at 16px).
- **Page overlays** live in the top layer ([decision 0006](design-system/decisions/0006-overlays-in-shadow-dom-top-layer.md)).

Rules: `@design-system/foundations/elevation.md`.

## Shapes

- **Site radii:** 8 / 12 / 16 / 24px (`--radius-*`, written in rem).
- **Product radii:** 8 / 12 / 18 / 24px (`--fsb-radius-*`).
- **Pills** are 999px; **square tags** 10px.

## Motion & Micro-interaction

- **Durations:** 150ms for colour, 250ms for transform and state, 400ms for slow reveals, all eased.
- **Hover:** cards lift 4px, buttons 2px. No bounce, spring or scale-in.
- **Reduced motion:** honour `prefers-reduced-motion` everywhere.
- **Plan motion toward the end state.** When someone names the parts of a motion that feel wrong, every part they name goes.
- **Showcase keyframes:** prefix the names per page. Never put an `animation` in an Angular inline style; it silently does nothing.

Rules: `@design-system/foundations/motion.md`.

## Iconography

Font Awesome 6.6 Free; showcase glyphs go through the self-hosted subset (`node scripts/build-icon-fonts.mjs` in `showcase/angular`). Provider marks are the shipped SVGs. No emoji, anywhere. Icon-only controls carry an `aria-label`. Rules: `@design-system/foundations/iconography.md`.

## Voice & Content Strategy

- **Tone:** confident, technical, specific. A claim, then a mechanism or a number from its source of truth.
- **Casing:** sentence case everywhere. Uppercase only for eyebrows, footer column titles and the `recommended` flag.
- **Feedback:** a toast confirms an action with no visible trace. Errors appear inline, next to their control.
- **Numbers:** never type a version, a tool count or a benchmark figure into a page by hand.
- **Extension copy** goes through `extension/_locales` (checked by `scripts/verify-extension-copy.mjs`).
- **Showcase copy** carries Angular i18n markers (checked by `lint:i18n`). Terms that stay English are listed in `showcase/angular/src/locale/DO-NOT-TRANSLATE.md`.

Rules: `@design-system/foundations/voice-and-copy.md`.

## Components

FSB has no component library. The design tool's prototyping kit lives in `design-system/components/` for canvases only. `@design-system/components/README.md` maps each prototype to the shipped CSS class or Angular template and lists where they differ. The surfaces are documented one page each:

- [showcase](design-system/surfaces/showcase.md)
- [side panel](design-system/surfaces/side-panel.md)
- [popup](design-system/surfaces/popup.md)
- [control panel](design-system/surfaces/control-panel.md)
- [onboarding](design-system/surfaces/onboarding.md)
- [overlays](design-system/surfaces/overlays.md)
- [1Password vault](design-system/surfaces/vault.md), pending

## Overlays

- **Hosting.** Each overlay is a shadow-root host promoted to the top layer. Hosts are click-through except where the user must click.
- **Fonts** inside a shadow root are ignored, so overlays use the system stack or draw outlines. The status pill registers Space Mono on the document instead (`fsb-pill-mono`, `ensurePillFont`).
- **Silence:** after 60s without an update the page's overlays show a waiting state, and the page removes them 120s after that, 180s after the last update (the overlay watchdog in `extension/content/messaging.js`). The service worker keeps its own 60s and 120s clocks (`MCP_VISUAL_SESSION_DEGRADE_AFTER_MS`, `MCP_VISUAL_SESSION_ORPHAN_CLEAR_AFTER_MS` in `extension/utils/mcp-visual-session.js`).
- **What raises an overlay:** action tools, which carry a visual reason and the calling client. Reads such as `read_page` stay silent.
- **The status pill** replaced the progress card ([decision 0008](design-system/decisions/0008-status-pill-replaces-progress-card.md)). It grows from a seed in the top-right corner and plays the toolbar icon's motions on one clock.

Detail: `@design-system/surfaces/overlays.md`.

## Accessibility

- **Focus:** visible on every interactive element (`--fsb-focus-ring` on product pages).
- **Targets:** new controls are at least 44×44px. The side panel's delegated-run actions already are; its older header and composer buttons are smaller.
- **Contrast:** WCAG AA in both themes of each palette.
- **Colour** is never the only signal.
- **Keyboard:** every action is reachable.
- **Secrets:** never show a secret value. Never collect secret input in page DOM or a shadow root ([decision 0009](design-system/decisions/0009-secret-input-in-extension-frame.md)).

Rules: `@design-system/foundations/accessibility.md`.

## Do's and Don'ts

- **Do** take every colour, radius, shadow and duration from a token of the surface's own palette. **Don't** copy raw values between palettes:

  ```css
  /* Don't: a product page borrowing the site's black */
  .panel-card { background: #0a0a0a; }
  /* Do */
  .panel-card { background: var(--fsb-surface-elevated); }
  ```

- **Do** use one primary button per view. **Don't** stack two gradient buttons side by side.
- **Do** keep cards flat at rest and lift them on hover. **Don't** add shadows to resting cards or translucency to content.
- **Do** write `prefers-reduced-motion` handling with every new animation. **Don't** animate layout to make room for opened content.
- **Do** put new showcase copy behind i18n markers and new extension copy into the locale catalogs. **Don't** hard-code English, versions or counts.
- **Do** add a decision record when a rule that several surfaces follow changes. **Don't** let a phase spec quietly fork the theme.
- **Don't** use emoji, new icon sets, or `#ff6b35` inside page overlays.

## Known Gaps

These are open, or decided and not yet applied. Each has a home in a foundation or surface page.

1. **Product pages keep their own dark blocks.** The control panel's dark surfaces now equal the core ([decision 0011](design-system/decisions/0011-product-dark-is-near-black.md)) and can be removed with no visible change. The side panel's and popup's cannot: in dark mode they set `--bg-primary` to the page base `#050505` (the core's alias gives `#0d0d0d`), `--bg-tertiary` to `#121212` (core `#141414`) and `--border-color` to white at 6% (core 8%). Removing them lifts the chat's surfaces, so keeping that flatter look is a design decision, not a cleanup. `sidepanel.css` is hash-pinned.
2. **Google Fonts never load on the showcase.** Its Content-Security-Policy refuses them, so Outfit, Space Mono and `'Poppins'` outside the wordmark render in their fallbacks. The wordmark's F and S are one-glyph `data:` faces in `fsb-wordmark.css`.
3. **The status pill draws its own wordmark.** Its outlined B is a 0.68em B, short of the 0.74em every other copy uses, and its F is Poppins 200. `fsb-wordmark-parity.test.js` does not read it.
4. **Space Mono is still in shipped CSS** until the migration in [decision 0012](design-system/decisions/0012-platform-mono-for-technical-text.md) lands: onboarding, the control panel's version tag, six showcase pages and the release-notes template's inline styles.
5. **Control panel timings differ.** options.css uses 150/200/300ms ease-in-out under the site's token names.
6. **The control panel's `.status-toast` carries errors**, and the side panel's checkboxes use `#f97316`.
7. **No z-index, type-size or motion tokens ship yet.** The site re-declares four `--fsb-*` names with its own values.
8. **Raw values are common.** `design-system/style-literals.baseline.json` records them per file, and the counts may only fall. HTML inline styles are not counted yet.
9. **Overlay gaps against these rules:**
    - The viewport glow's bead keeps travelling under `prefers-reduced-motion`, and the crawl card and the element highlight ignore it.
    - The status pill overshoots as it pops in and grows, and scales new text in, against the motion rules. Its labels use Space Mono, against [decision 0012](design-system/decisions/0012-platform-mono-for-technical-text.md).

    See `@design-system/surfaces/overlays.md#known-issues`.

## How to check, and how to make an exception

- **Run** `npm run test:design`, which `npm test` also runs. It does two things:
  - `scripts/verify-design-system.mjs` compares the token files with the shipped token blocks, this front matter with the tokens, the specimen cards, assets, links and page templates;
  - `scripts/check-style-literals.mjs` holds raw colours, integer z-index values, literal font stacks and page-local colour tokens to the baseline.
- **Changing a token** means changing the shipped file and its twin in `design-system/tokens/` together.
- **A literal that must stay** gets a comment on the declaration that starts with `design-literal-ok:` and gives the reason.
- **A lower count** is locked in with `node scripts/check-style-literals.mjs --write`. Raising a count is a hand edit to the baseline, visible in review.
- **Hash-pinned files:** several shipped files are pinned by tests, either by hash or by exact substrings. Each surface page lists its pins.
