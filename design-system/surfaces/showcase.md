# Showcase site

Status: shipped on main

The marketing, docs and research site: an Angular app under `showcase/angular`, dark first, one orange accent, and five depth pages whose sections are planes along the z axis.

## What it is

- **App.** [`app.routes.ts`](../../showcase/angular/src/app/app.routes.ts) `routes` lazy-loads one component per page, and [`app.component.html`](../../showcase/angular/src/app/app.component.html) wraps every route in `<app-showcase-shell>`.
- **Build.** Static output (`outputMode: "static"` in [`angular.json`](../../showcase/angular/angular.json)) for the eight locales of its `i18n` block. [`app.routes.server.ts`](../../showcase/angular/src/app/app.routes.server.ts) `serverRoutes` prerenders every page except `/dashboard`, `/stats` and `/legal` (`RenderMode.Client`).
- **Serving.** [`server.js`](../../showcase/server/server.js) serves `dist/showcase-angular/browser` through `express.static`, after a locale redirect that honours the `fsb-locale` cookie, and sends `SHOWCASE_CSP` on every response. It deploys as the Fly app in [`fly.toml`](../../fly.toml).
- **Three page families**, set by route data and read by [`showcase-shell.component.ts`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.ts) `DEPTH_PATHS` and `SHELLLESS_PATHS`:

| Family | Routes | Chrome |
|---|---|---|
| Depth (`data: { depth }`) | `/`, `/about`, `/agents`, `/privacy`, `/support` | Shell nav without links, the nav cue at the bottom edge, the plane rail, and a closing site-index plane instead of the footer |
| Flat | `/dashboard`, `/release-notes`, `/sitemaps`, `/legal` | Shell nav with wordmark, links and a menu button at 768px and below, and the shell footer |
| Shellless (`data: { shellless: true }`) | `/stats`, `/lattice`, `/concierge`, `/phantom-stream`, `/prometheus` | Their own chrome; the shell draws no nav and no footer |

## Palette and tokens

The site palette lives in [`styles.scss`](../../showcase/angular/src/styles.scss): `:root` is dark (`color-scheme: dark`) and `[data-theme="light"]` flips surfaces, text, borders and shadows (`color-scheme: light`). The accent never changes. [`colors.css`](../tokens/colors.css), [`effects.css`](../tokens/effects.css) and [`spacing.css`](../tokens/spacing.css) mirror those blocks; [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs) `MIRRORS` fails when they disagree. Rules: [color](../foundations/color.md), [decision 0002](../decisions/0002-three-palettes-one-brand-orange.md).

| Token | Dark (`:root`) | Light (`[data-theme="light"]`) |
|---|---|---|
| `--primary`, `--primary-hover` | `#ff6b35`, `#e55a2b` | unchanged |
| `--bg-body` / `--bg-card` / `--bg-elevated` | `#000000` / `#0a0a0a` / `#141414` | `#ffffff` / `#f8f9fa` / `#f1f5f9` |
| `--bg-nav` | `rgba(0, 0, 0, 0.5)` | `rgba(255, 255, 255, 0.5)` |
| `--text-primary` / `--text-secondary` / `--text-muted` | `#f1f5f9` / `#94a3b8` / `#64748b` | `#0f172a` / `#475569` / `#64748b` |
| `--border-color` / `--border-hover` | white at 8% / 15% | black at 8% / 15% |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | black at 40% / 50% / 60% | black at 8% / 10% / 12% |
| `--shadow-glow` | orange at 15% | orange at 10% |

- **Theme-free tokens.** `--primary-gradient` (135° to `#ff8c42`), `--primary-glow`, `--radius-sm` to `--radius-xl` (0.5, 0.75, 1, 1.5rem), `--transition-fast`, `--transition-base`, `--transition-slow` (150, 250, 400ms ease) and `--max-width` (1200px). The `@media (max-width: 768px)` `:root` block drops `--nav-height` from 64px to 56px and `--section-padding` from 80px to 48px. Layout rules: [spacing and layout](../foundations/spacing-layout.md).
- **Borrowed names.** `:root` re-declares `--fsb-primary-soft`, `--fsb-border-subtle`, `--fsb-border-accent` and `--fsb-focus-ring` with site values, and light flips the two borders. Only [`dashboard-page.component.scss`](../../showcase/angular/src/app/pages/dashboard/dashboard-page.component.scss) reads them, plus `--fsb-focus-ring` in [`stats-page.component.scss`](../../showcase/angular/src/app/pages/stats/stats-page.component.scss).
- **Proposed names** (marked `/* proposed */` in the token files, such as `--primary-wash`, `--danger`, `--space-4`, `--text-h1`, `--font-mono`) do not ship. The site writes those values as literals.
- **Theme switching.** [`theme.service.ts`](../../showcase/angular/src/app/core/theme.service.ts) `ThemeService` follows `prefers-color-scheme` and its `change` event: `applyDark()` removes `data-theme` for dark and sets `data-theme="light"` for light. The inline `initShowcaseTheme()` script in [`index.html`](../../showcase/angular/src/index.html) sets the light attribute before Angular boots. There is no manual toggle; `ShowcaseShellComponent` injects the service so it runs on every route.
- **`/dashboard`** uses the site palette (`--bg-card`, `--text-*`, `--border-color`), not the product `--fsb-surface-*` ramp.
- **Local palettes.** The research pages and release notes scope their own names:

| Page | Scope | What it sets |
|---|---|---|
| Lattice | `.lat-page` | `--navy`, `--node`, `--lat-line`, over `--bg-body` |
| Concierge | `:host`, `.con-page` | An orange field: `--field: #ff6b35`, dark ink `--ink: #140a06`, `--edge`, `--wash`, `--coal` |
| PhantomStream | `.ps-page` | `--primary` turns blue (`#3b82f6`), with matching `--primary-hover`, `--primary-gradient`, `--primary-glow` |
| Prometheus | `:host`, `.pr-page` | Warm dark literals: `--warm: #141110` (the extension's old warm dark surface) and `--text: #f6efe9` (its dark-mode text); plus `--text-dim: #9a9088` and `--accent` |
| Release notes | `.release-notes-page` | Short aliases of the site tokens (`--bg`, `--panel`, `--line`, `--ink`, `--dim`, `--ac`) for its ported inline styles |

- **Type.** `body` sets the system stack; `code, .mono` and the shell's `.version-tag` start at SF Mono; `body:lang(ja)` and its siblings for ko, zh-CN and zh-TW swap in CJK stacks (all in [`styles.scss`](../../showcase/angular/src/styles.scss)). Outside `styles/icons/`, nothing under `showcase/angular/src` declares `@font-face`. Rules: [typography](../foundations/typography.md), [decision 0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md).
- **Icons.** Self-hosted subsets of Font Awesome Free 6.6.0 (solid, regular, brands) and Phosphor 2.1.1, declared by [`icons.generated.css`](../../showcase/angular/src/styles/icons/icons.generated.css). [`build-icon-fonts.mjs`](../../showcase/angular/scripts/build-icon-fonts.mjs) generates them by hand (it needs fontTools), and [`icons.manifest.json`](../../showcase/angular/src/styles/icons/icons.manifest.json) records every source URL and sha256, plus home's run-time class `'fa-brands ' + browserIconClass` under `dynamic`. Rules: [iconography](../foundations/iconography.md), [decision 0005](../decisions/0005-font-awesome-icons-no-emoji.md).

## Anatomy

- **Global layers.** [`angular.json`](../../showcase/angular/angular.json) `styles` loads `icons.generated.css` first, then `styles.scss`, then [`depth.scss`](../../showcase/angular/src/styles/depth.scss). `styles.scss` holds tokens, reset, headings, `.container`, `.section`, `.section-header`, `.btn` variants, utilities and the footer layout (`.footer-inner`, `.footer-column`); page and shell stylesheets own their colours. `depth.scss` holds the rules that span shell and page.
- **Budgets.** `anyComponentStyle` warns at 48 kB and fails at 64 kB per component stylesheet; the initial bundle warns at 500 kB. [`verify-bundle-budgets.mjs`](../../showcase/angular/scripts/verify-bundle-budgets.mjs) holds each locale's gzipped `main-*.js` to 1 MB.
- **Shell** ([`showcase-shell.component.html`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html), [`showcase-shell.component.scss`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss)):

| Part | Selector | Behaviour |
|---|---|---|
| Bar | `.nav` | Fixed, `--nav-height` tall, `--bg-nav` behind a 16px backdrop blur, `z-index: 1000` |
| Wordmark | `.nav-brand .fsb-mark` | `.fsb-f` (Poppins 100) and `.fsb-s` (Poppins 900) print their letters with `::before`; `.fsb-b` is the inline SVG B at `height: 0.74em`; `.fsb-row` tracks -0.02em. 1.5rem in the nav, 1.32rem in the footer. Rules: [brand](../foundations/brand.md) |
| Links | `.nav-links a` | Secondary text; the active route gets a 2px `--primary` underline (`a.active::after`) |
| GitHub | `.nav-actions .btn-github` | Hidden at 768px and below |
| Menu | `.nav-toggle`, `.nav-mobile` | At 768px and below: three bars that turn into an X (`.nav-toggle.active`) and a panel under the bar |
| Footer | `.footer`, `.footer-column` | Columns Pages, Project, Research and Community, titles uppercase in `--text-muted` |
| Footer bottom | `.footer-version`, `app-language-picker` | `.version-tag` prints ▽ and `appVersion` in mono tracked 0.4em; the [picker](../../showcase/angular/src/app/layout/language-picker/language-picker.component.html) is a native `<select>` of the eight autonyms (`LOCALE_NATIVE_LABELS`) |

## Depth pages

[`depth-engine.ts`](../../showcase/angular/src/app/layout/depth/depth-engine.ts) `createDepthEngine()` moves a camera through the planes; [`depth-stage.directive.ts`](../../showcase/angular/src/app/layout/depth/depth-stage.directive.ts) `DepthStageDirective` starts it after the first render, outside Angular's zone. The phone rules are the owner's decisions in [0007](../decisions/0007-depth-pages-on-phones.md). The markup contract, from the header of `depth-engine.ts` and from depth.scss:

| Hook | Meaning |
|---|---|
| `.fsb-depth[data-depth-stage]` | The stage: `position: fixed`, and the page itself never scrolls (`html:has(.fsb-depth)` in depth.scss) |
| `.fsb-depth-layer` > `.fsb-depth-fit` | One plane and its only child, which is scaled to fit |
| `[data-full]`, `[data-scroll]` | Fills the window (home's hero, every closing plane); scrolls inside itself (privacy's policy) |
| `[data-di="0.35"]`, `[data-dfade]` | Travels with its plane, delayed by the value; travels by fading only |
| `[data-depth-ambient="a,b"]` | A backdrop shown while planes a to b are in view (home's dots) |
| `[data-depth-anchor]` | A section start inside a scrolling plane (privacy's `h2`s, which also become rail entries) |
| `[data-depth-own]`, `[data-depth-rigid]` | Gestures starting here belong to the element (about's `.sitemap-graph`); keeps its width when fitted (about's graph plane) |
| `[data-depth-grows]`, `[data-depth-ghost]` | Opens on demand (support's `.faq-answer`); drawn one plane back before the engine starts (about's second plane) |

- **Fitting** (`layout()`). A plane scales by `min(1, room / height)`; the room is the stage minus the nav, the 84px bottom padding and 24px.
- **Wide windows.** A plane that would scale below `MIN_SCALE_WIDE` (0.6) becomes `[data-scroll]` and scrolls inside itself.
- **Stage 600px wide or less** (`NARROW_MAX_WIDTH`). Every plane is fitted, and first laid out wider than the window (`widen()`) so it shrinks less. Only a window too short for `MIN_SCALE_NARROW` (0.45) still scrolls; `[data-full]`, `[data-scroll]` and `[data-depth-rigid]` planes keep their width.
- **Opened content never shrinks its plane.** `restHeight()` fits the plane without its `[data-depth-grows]` parts and `hold()` keeps that scale. While an answer does not fit, the layer carries `[data-depth-over]` and scrolls behind a fade mask; `keepInView()` glides an answer opened by a click into view.
- **Wheel and trackpad** (`onWheel()`). One plane per swipe: the camera sets off once a swipe has gone `COMMIT_PX` (50px) and eats the rest, momentum included. A shorter swipe leans the plane `LEAN` (8%) and springs back.
- **Keys** (`onKey()`). ArrowUp, ArrowDown, PageUp, PageDown, Space and Shift+Space move one plane, or scroll a scrolling plane first; Home and End go to the first and last plane. Keys in form fields or with modifiers are left alone.
- **Touch.** A vertical swipe drags the camera, half the stage height per plane, and `settle()` lands on the next plane past a tenth of the way. A sideways swipe stays with the page. `#fragment` links jump to the plane holding the target (`revealHash()`).
- **Rail** ([`depth-rail.component.html`](../../showcase/angular/src/app/layout/depth/depth-rail.component.html), [`depth-rail.component.scss`](../../showcase/angular/src/app/layout/depth/depth-rail.component.scss)). `nav.fsb-depth-rail` on the right edge holds one `.fsb-depth-go` per plane or section. Labels show on hover or focus, and the current tick grows and turns `--primary` (`.is-active`). More than 9 entries set `[data-dense]` (26px rows), more than 16 `[data-dense="xl"]` (22px). At 768px and below it reaches the screen edge, and a finger sliding along it runs through the planes with the name on a chip (`[data-sliding]`).
- **Nav cue** (`.fsb-navcue` in the shell). The current page's name over a short line at the bottom centre; the page list opens upward without the current page. Between planes the engine writes `--cue` (0 to 1) and the label warms toward orange. While open, `body:has(.fsb-navcue.is-open) .fsb-depth` in depth.scss blurs the stage and drops it to 30% opacity.
- **No top-left wordmark on phones.** At 768px and below `.nav--depth .nav-brand` is hidden; Home is in the cue.
- **Closing plane** ([`depth-end.component.html`](../../showcase/angular/src/app/layout/depth/depth-end.component.html), [`depth-end.component.scss`](../../showcase/angular/src/app/layout/depth/depth-end.component.scss)). `app-depth-end` replaces the footer: a wordmark as large as the window allows (`.fsb-end-mark`, 9% of the text colour) sinks into the bottom edge under four groups (Pages, Project, Research, Community, two columns at 900px and below) that reuse the footer's trans-units. `.fsb-end-meta` holds the version tag and the language picker.
- **Phones, at rest** ([0007](../decisions/0007-depth-pages-on-phones.md)). One 3D swipe per section on home, about, agents and support; privacy stays a scrolling document. No section scrolls inside itself or sideways: no carousels, scrolling chip lines or scrolling tab strips. Cards become short rows or two columns, chips wrap, and the plane shrinks instead.
- **Phones, opened content.** A Support answer keeps its plane at its resting size and scrolls inside it, and only one answer is open at a time (`openFaq`, `toggleFaq()` in [`support-page.component.ts`](../../showcase/angular/src/app/pages/support/support-page.component.ts)).
- **Compact rules.** The stylesheets of [home](../../showcase/angular/src/app/pages/home/home-page.component.scss), [about](../../showcase/angular/src/app/pages/about/about-page.component.scss), [agents](../../showcase/angular/src/app/pages/agents/agents-page.component.scss) and [support](../../showcase/angular/src/app/pages/support/support-page.component.scss) each end with a `@media (max-width: 600px)` block; depth.scss adds one for `.section-header`. Check new content at phone sizes and in the long locales (German, Russian).
- **Loading.** Until the engine sets `[data-depth-live]`, only the first plane shows, plus any `[data-depth-ghost]` plane, drawn as the engine leaves the plane behind (`scale(calc(1200 / 2100))`, 12px blur, 9% opacity). An inline `<style>` in [`index.html`](../../showcase/angular/src/index.html) hides the first plane until the next one has begun to arrive.
- **No JavaScript, print.** The `<noscript>` styles in `index.html` lay the planes out as one scrolling column; `@media print` in depth.scss does the same and hides the rail, cue, ambient backdrops and closing plane.

## Flat and shellless pages

- **Flat pages** keep the classic shell: wordmark, links, menu button and footer. [`release-notes-page.component.html`](../../showcase/angular/src/app/pages/release-notes/release-notes-page.component.html) ports a design handoff and styles nearly everything inline; its aliases follow the theme.
- **`/stats`** ([`stats-page.component.html`](../../showcase/angular/src/app/pages/stats/stats-page.component.html)) draws a round back link (`.stats-back-btn`), a fixed glow (`.stats-glow-bg`) and `footer.stats-footer`, which `styles.scss` keeps out of the shared footer layout (`.footer:not(.stats-footer)`).
- **Research pages.** Lattice and Concierge draw their own `footer.footer`; PhantomStream its own `nav.nav` and footer; Prometheus a `.pr-nav` with a `.pr-back` link and no footer.

## States

| State | Selector or trigger | Effect |
|---|---|---|
| Dark (default) | no `data-theme` on `<html>` | `:root` tokens |
| Light | `[data-theme="light"]` | Tokens flip; planes not in focus drop to 30% opacity (`[data-theme='light'] .fsb-depth-layer[inert]`); Concierge and Prometheus keep their fixed `:host` backgrounds |
| Nav scrolled | `.nav.scrolled`, set past 10px of scroll (`onScroll()`) | Adds `--shadow-sm` |
| Depth nav | `.nav.nav--depth` | Transparent, no blur, no shadow |
| Menu open | `.nav-toggle.active`, `.nav-mobile.active` | Closes on a link tap and on depth and shellless routes (`updateShellMode()`) |
| Footer pending | `initialNavigationComplete` false | No footer until the first page has activated |
| Pre-live | `.fsb-depth:not([data-depth-live])` | First plane (and ghost) only |
| Plane modes | `scale()` on `.fsb-depth-fit`, `[data-scroll]`, `[data-full]`, `[data-depth-over]` | Fitted; scrolling; full window; holding an open answer |
| Cue open | `.fsb-navcue.is-open`, `:has(:focus-visible)`, `:hover` under `(hover: hover)` | List shown, stage set back |
| Rail | `.is-active`, `[data-dense]`, `[data-sliding]` | Current entry; compact rows; name chip under a finger |
| FAQ | `.faq-item.active`, `aria-expanded`, `.faq-answer[inert]` | One answer open |
| Tilt | `[data-tilt]` | Home button leaning toward the pointer |

## Motion

- **Durations.** `--transition-fast`, `--transition-base` and `--transition-slow` in `styles.scss`. `.btn-primary:hover`, `.btn-outline:hover` and `.btn-github:hover` lift 2px under `transition: all var(--transition-base)`. Rules: [motion](../foundations/motion.md).
- **Camera** (`frame()`, `apply()` in depth-engine.ts). One frame loop eases every travelling element toward the target plane, higher `data-di` values more slowly. A plane ahead sits 900px back per plane, at 9% opacity one plane back and blurred up to 16px; a plane passed flies up to 650px toward the viewer, blurred up to 12px. The perspective is 1200px (`const P`) divided by the plane's scale. `strip()` drops opacity, filter and translate transitions from travelling elements; a refit eases with `FIT_EASE` (`.35s cubic-bezier(.16,1,.3,1)`).
- **Tilt** (home only, `TILT_SELECTOR` in [`home-page.component.ts`](../../showcase/angular/src/app/pages/home/home-page.component.ts)). [`depth-tilt.ts`](../../showcase/angular/src/app/layout/depth/depth-tilt.ts) writes `--tilt-*`, and `[data-tilt]` in depth.scss leans the button under `perspective(600px)`, lifts it 10px (`LIFT`) and moves a sheen with the pointer.
- **Closing plane.** Groups drift toward the pointer (`--px`, `--py`, eased over 1s by `.fsb-end-float`). On touch-first phones [`depth-sway.ts`](../../showcase/angular/src/app/layout/depth/depth-sway.ts) `createDepthSway()` takes the values from the phone's tilt, only where tilt arrives without a permission prompt, so iPhones stay still.
- **Nav cue.** Entries rise out of a 4px blur from the bottom, 38ms apart (`transition-delay` on `.fsb-navcue-list li`); the line widens over .4s.
- **Haptics.** `tick()` vibrates for 15ms (`TICK_MS`) when a touch lands the camera on another plane. Phones without `navigator.vibrate` but with switch controls get `labelEntries()`: a see-through `label[data-depth-tick]` holding a hidden `input[switch]` over each rail entry, so a tapped entry ticks; swipes stay silent there.
- **Reduced motion.** The engine crossfades planes without depth or blur and leaves `--cue` at 0 (`reduce` in depth-engine.ts). depth.scss drops the stage transition and the ghost plane; tilt, sway and the closing plane's float switch off (`.fsb-end-float`, `.fsb-end-groups`); the cue list stops transitioning. `styles.scss` gates only `scroll-behavior: smooth`, so each page handles its own loops (home `.hero-bg`, `.cap-track`; release notes `* { animation: none !important; }` with `.rn-cycle-first`, `.rn-enter` and `.rn-grow` resting frames).
- **Keyframes.** Prefix names per page (`psPktFly`, `dashWakePulse`, `capMarq`, `rnF16`). Angular scopes a component's `@keyframes` and rewrites `animation` only inside that stylesheet, so an `animation` in an inline `style` attribute names nothing and silently does nothing. [`release-notes-page.component.scss`](../../showcase/angular/src/app/pages/release-notes/release-notes-page.component.scss) lifts each inline declaration into a class (`.rn-a01` onward).
- **End state first.** Plan a motion toward what should be on screen at the end. When someone names the parts of a motion that feel wrong, remove every part they name ([0007](../decisions/0007-depth-pages-on-phones.md)).

## Copy and i18n

- **Locales.** Eight, from `LOCALES` in [`locale-constants.ts`](../../showcase/angular/src/app/core/i18n/locale-constants.ts) (source `en`), with targets in [`messages.xlf`](../../showcase/angular/src/locale/messages.xlf) siblings. The Express copy in [`locale-constants.js`](../../showcase/server/src/utils/locale-constants.js) must match ([`verify-locale-sync.mjs`](../../showcase/angular/scripts/verify-locale-sync.mjs)).
- **Markers.** Every visible string carries `i18n="@@id"`, and copy in attributes `i18n-aria-label` and the like. `lint:i18n` runs `@angular-eslint/template/i18n` with `checkId`, `checkText` and `checkAttributes` ([`eslint.config.js`](../../showcase/angular/eslint.config.js)); `ignoreAttributes` lists the machine tokens.
- **Hook attributes stay valueless or numeric.** `checkAttributes` reads a word value as copy, so the depth hooks are bare (`data-depth-ghost`) or numeric (`data-di="0.35"`), and `data-screen-label` carries `i18n-data-screen-label`.
- **TypeScript copy** uses `$localize`: rail labels are module-tail consts sharing `@@depth.rail.intro` and `@@depth.rail.index`, and [`depth-rail.component.ts`](../../showcase/angular/src/app/layout/depth/depth-rail.component.ts) `goTo()` builds the `@@depth.rail.goTo` button name.
- **Source lines are pinned.** `messages.xlf` records the line of every unit, and CI diffs a fresh `ng extract-i18n` against it, so new code goes below a module's last `$localize` (the module-tail comment in `home-page.component.ts`).
- **Terms that stay English** are listed in [`DO-NOT-TRANSLATE.md`](../../showcase/angular/src/locale/DO-NOT-TRANSLATE.md): `[attr.translate]="'no'"` on an element that also has an `i18n` marker, plain `translate="no"` on a wrapper span. In the shell, GitHub, the research names and the version tag carry it. Scope: [`I18N-BOUNDARIES.md`](../../showcase/angular/src/locale/I18N-BOUNDARIES.md).
- **Quality gate.** [`verify-translation-quality.mjs`](../../showcase/angular/scripts/verify-translation-quality.mjs) rejects a target that drops an `INVARIANT_TECHNICAL_LITERALS` term (FSB, PhantomStream, Lattice, Concierge, Prometheus, GitHub and more) or copies English; [`same-source-allowlist.json`](../../showcase/angular/src/locale/same-source-allowlist.json) exceptions are bound to the source hash.
- **Numbers come from their source.** Version tags bind `APP_VERSION` from [`version.ts`](../../showcase/angular/src/app/core/seo/version.ts), which [`build-crawler-files.mjs`](../../showcase/angular/scripts/build-crawler-files.mjs) generates from the extension manifest; the home leaderboard reads [`online-mind2web.json`](../../showcase/angular/src/app/core/seo/online-mind2web.json). Voice: [voice and copy](../foundations/voice-and-copy.md).

## Accessibility

- **Stage.** `.fsb-depth` is `tabindex="0"` and `role="region"`, with a localized `aria-label` naming scroll, swipe and the arrow keys (`@@home.depth.aria` and its siblings).
- **Hidden planes are out of reach.** `sync()` in depth-engine.ts marks every plane but the current one `inert` and `aria-hidden="true"`, with pointer events off.
- **Rail.** Buttons named "Go to" plus the label, `aria-current="step"` on the current one, a 2px `--primary` focus outline; after a rail click, focus returns to the stage (`onClick()`).
- **Nav cue.** A real `button` with `aria-expanded` and `aria-controls`. It opens on keyboard focus (`:has(:focus-visible)`), closes on Escape or a click elsewhere (`onEscape()`, `onDocumentClick()`), and opens on hover only under `(hover: hover)`. Current links get `aria-current="page"` (`ariaCurrentWhenActive`).
- **Site index.** `nav.fsb-end-groups` is labelled "Site index", each list is `aria-labelledby` its group title, the X link has an `aria-label`, and external-link arrows are `aria-hidden`.
- **FAQ.** Each question is a `button.faq-question` inside an `h3` with `aria-expanded` and `aria-controls`; closed answers are `inert`, so their links take no focus.
- **Language picker** ([`language-picker.component.scss`](../../showcase/angular/src/app/layout/language-picker/language-picker.component.scss)). A native `<select>` with a visually hidden label (`.lang-picker__sr`) and a localized `aria-label`; an opaque `--bg-card` and inherited `color-scheme` keep it readable in both themes.
- **Focus.** The cue, rail and site-index links draw a 2px `--primary` outline, the picker one in `currentColor`. `.nav-links a`, `.nav-mobile a` and `.btn` have no focus rule and show the browser default. `html` turns off the tap highlight (`-webkit-tap-highlight-color: transparent`). Rules: [accessibility](../foundations/accessibility.md).

## Tests that pin it

| Check | What it pins |
|---|---|
| [`showcase-depth-ghost-parity.test.js`](../../tests/showcase-depth-ghost-parity.test.js) | The `[data-depth-ghost]` block in depth.scss against `const P` and `apply()` in depth-engine.ts, and the `index.html` noscript rules that undo it |
| [`icon-fonts-parity.test.js`](../../tests/icon-fonts-parity.test.js) | **Hash pins:** every vendored and generated icon file against `icons.manifest.json`. Also: every icon class in use is in the subset, `icons.generated.css` is first in the build and test `styles`, and no stylesheet imports an icon library from a CDN |
| [`benchmark-assets-parity.test.js`](../../tests/benchmark-assets-parity.test.js) | The home leaderboard, structured data, social card and llms files against `online-mind2web.json` |
| [`showcase-capability-logos.test.js`](../../tests/showcase-capability-logos.test.js) | Every slug in [`capability-apps.ts`](../../showcase/angular/src/app/core/capabilities/capability-apps.ts) has its logo file |
| [`showcase-privacy-page.test.js`](../../tests/showcase-privacy-page.test.js), [`about-knowledge-categories-parity.test.js`](../../tests/about-knowledge-categories-parity.test.js) | Privacy template invariants; the About category legend |
| [`showcase-angular-foundation.test.js`](../../tests/showcase-angular-foundation.test.js) | `ThemeService` mapping, the `index.html` theme script, `color-scheme`, the reduced-motion `scroll-behavior` gate, no page selectors in `styles.scss`. Not in `npm test`; run it by hand |
| [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs) | The three `styles.scss` token blocks against [`../tokens`](../tokens/colors.css); the B path inlined in `showcase-shell.component.html` |
| [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs) | Raw colours, integer z-index values, literal font stacks and page-local colour tokens in every SCSS file under `showcase/angular/src`, held to the baseline |
| Karma specs (`test:ci`) | [Shell](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.spec.ts): footer readiness, the nav cue, no wordmark on phones, `depthPageForPath()`, `shelllessForPath()`. [Engine](../../showcase/angular/src/app/layout/depth/depth-engine.spec.ts): fitting, widening, touch, rail slides, haptics, wheel, opened content. [Support](../../showcase/angular/src/app/pages/support/support-page.component.spec.ts) and [marketing navigation](../../showcase/angular/src/app/core/seo/marketing-navigation.spec.ts) in every locale: one answer open |
| [`ci.yml`](../../.github/workflows/ci.yml) `website` job | Locale sync, `lint:i18n`, translation drift and quality, `test:ci`, the `ng extract-i18n` diff, the prerender build, hreflang, video SEO, marketing SEO, hydration markers, bundle budgets |

The root suites run in the `npm test` chain of [`package.json`](../../package.json), which also runs `test:design` (the two design checks; see the [README](../README.md#checks)).

## Known issues

1. **Web fonts never load on the live site.** `SHOWCASE_CSP` in `server.js` allows styles and fonts from the site only (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`), so the Google Fonts `@import` atop the lattice, concierge, phantom-stream and prometheus stylesheets is blocked. The wordmark's F and S render in `system-ui`; the site must self-host Poppins 100 and 900. Space Mono is retired ([0012](../decisions/0012-platform-mono-for-technical-text.md)), so its declarations here should move to `--font-mono`, not be hosted. The dev server in `angular.json` sends no such policy, so those pages can look right locally. See [DESIGN.md](../../DESIGN.md), Known Gaps.
2. **Wordmark copies drift.** Seven component stylesheets repeat `.fsb-row`, `.fsb-f`, `.fsb-s` and `.fsb-b`. Release notes draws inline copies with the B at 0.715em, and `.fsb-highlight-wordmark .fsb-row` on home and agents uses `letter-spacing: 0`.
3. **Stale version tag.** [`concierge-page.component.html`](../../showcase/angular/src/app/pages/concierge/concierge-page.component.html) types its `.footer-version` tag by hand instead of binding `APP_VERSION`.
4. **Dashboard loops ignore reduced motion.** `.dash-wake-btn` (`dashWakePulse`) and `.dash-preview-automating` (`dashPreviewAutomate`) pulse forever, and `dashboard-page.component.scss` has no `prefers-reduced-motion` block.
5. **Undeclared tokens.** The dashboard reads `--danger`, `--accent-color` and `--font-mono`, which no showcase stylesheet declares, so their literal fallbacks always apply.
6. **Dead and stale shell CSS.** `showcase-shell.component.scss` keeps a stats-only block (`.stats-back-btn`, `.stats-glow-bg`, `@keyframes statsGlow`, `.footer.stats-footer`) that emulated encapsulation keeps from matching; the stats page has its own. Its comments cite a removed `isStatsRoute` and say keyframes leak globally, its header names a theme toggle that no longer exists, and the header of `release-notes-page.component.scss` repeats the keyframe claim that the same file's "Inline animation declarations, lifted" comment corrects.
7. **Inert reveal utilities.** `.reveal`, `.reveal-left`, `.reveal-right`, `.reveal-scale` and `.delay-*` in `styles.scss` rest at their final state, yet the depth templates still carry `.reveal`.
8. **Raw values.** Literal sizes and durations are common ([motion](../foundations/motion.md), [typography](../foundations/typography.md)). `check-style-literals.mjs` counts colours, z-index, font stacks and page-local colour tokens, not sizes, durations or inline `style` attributes, and `release-notes-page.component.html` alone carries thousands of inline styles.
9. **Privacy rail.** Its 22 `h2[data-depth-anchor]` headings plus Overview and Index make 24 entries, so the rail runs `[data-dense="xl"]` at 22px per entry: about 574px tall, more than a phone held sideways shows, so its ends sit off screen or under the nav.
10. **Menu button state.** `.nav-toggle` has an `aria-label` but no `aria-expanded` or `aria-controls`.
11. **Orphan page.** [`reference-placeholder-page.component.ts`](../../showcase/angular/src/app/pages/reference-placeholder/reference-placeholder-page.component.ts) has no route in `app.routes.ts`.

## Sources

- Shell: [`showcase-shell.component.ts`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.ts), [`.html`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html), [`.scss`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss); [`language-picker.component.html`](../../showcase/angular/src/app/layout/language-picker/language-picker.component.html)
- Depth: [`depth-engine.ts`](../../showcase/angular/src/app/layout/depth/depth-engine.ts), [`depth-tilt.ts`](../../showcase/angular/src/app/layout/depth/depth-tilt.ts), [`depth-sway.ts`](../../showcase/angular/src/app/layout/depth/depth-sway.ts), [`depth-end.component.ts`](../../showcase/angular/src/app/layout/depth/depth-end.component.ts), [`depth-rail.component.ts`](../../showcase/angular/src/app/layout/depth/depth-rail.component.ts), [`depth.scss`](../../showcase/angular/src/styles/depth.scss), [`index.html`](../../showcase/angular/src/index.html)
- Foundation: [`styles.scss`](../../showcase/angular/src/styles.scss), [`angular.json`](../../showcase/angular/angular.json), [`theme.service.ts`](../../showcase/angular/src/app/core/theme.service.ts), [`app.routes.ts`](../../showcase/angular/src/app/app.routes.ts), [`server.js`](../../showcase/server/server.js)
- Pages: [`support-page.component.html`](../../showcase/angular/src/app/pages/support/support-page.component.html), [`privacy-page.component.ts`](../../showcase/angular/src/app/pages/privacy/privacy-page.component.ts), [`about-page.component.html`](../../showcase/angular/src/app/pages/about/about-page.component.html), [`home-page.component.html`](../../showcase/angular/src/app/pages/home/home-page.component.html), the research page stylesheets ([lattice](../../showcase/angular/src/app/pages/lattice/lattice-page.component.scss), [concierge](../../showcase/angular/src/app/pages/concierge/concierge-page.component.scss), [phantom-stream](../../showcase/angular/src/app/pages/phantom-stream/phantom-stream-page.component.scss), [prometheus](../../showcase/angular/src/app/pages/prometheus/prometheus-page.component.scss))
- Design system: [DESIGN.md](../../DESIGN.md), [README](../README.md), [brand](../foundations/brand.md), [elevation](../foundations/elevation.md), decisions [0002](../decisions/0002-three-palettes-one-brand-orange.md), [0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md), [0005](../decisions/0005-font-awesome-icons-no-emoji.md), [0007](../decisions/0007-depth-pages-on-phones.md)
