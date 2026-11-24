# Onboarding

Status: shipped on main

## What it is

Onboarding is the extension's first-run setup page. It helps the user choose between the MCP path and the in-browser key (BYOK) path, then sends them to pin FSB and open it.

- **Entry.**
  - On install, [`init-config.js`](../../extension/config/init-config.js) `openOnboardingPage()` opens it in a new tab and records `fsbOnboardingAutoOpenedAt`.
  - The [control panel](control-panel.md)'s help section links back to it as Restart Setup.
- **Files.**
  - [`onboarding.html`](../../extension/ui/onboarding.html) is the static shell.
  - [`onboarding.js`](../../extension/ui/onboarding.js) renders each screen into `#obScreen`.
  - [`onboarding.css`](../../extension/ui/onboarding.css) styles it.
  - [`model-discovery.js`](../../extension/ai/model-discovery.js) finds LM Studio models.
- **Steps.** `route()` returns the steps for the chosen path: welcome, path, mcp, pin, done for MCP; welcome, path, provider, apikey, pin, done for BYOK.
- **Finish.** `finishOnboarding()` stores `fsbOnboardingCompleted`, `fsbOnboardingPath`, `fsbOnboardingSkipped` and `fsbOnboardingCompletedAt`.

## Palette and tokens

Onboarding uses the site palette, not the product palette ([0002](../decisions/0002-three-palettes-one-brand-orange.md), [color.md](../foundations/color.md)). It never loads fsb-ui-core.css.

- **Its own copy of the site tokens.** onboarding.css declares 22 tokens on `:root`, dark first. `[data-theme="light"]` overrides 12 of them.

| Group | Tokens | Dark (`:root`) | Light |
|---|---|---|---|
| Accent | `--primary`, `--primary-hover`, `--primary-gradient`, `--primary-glow` | `#ff6b35`, `#e55a2b`, 135° to `#ff8c42`, orange at 30% | not overridden |
| Surfaces | `--bg-body`, `--bg-card`, `--bg-elevated` | `#000000`, `#0a0a0a`, `#141414` | `#ffffff`, `#f8f9fa`, `#f1f5f9` |
| Text (slate) | `--text-primary`, `--text-secondary`, `--text-muted` | `#f1f5f9`, `#94a3b8`, `#64748b` | `#0f172a`, `#475569`, `#64748b` |
| Borders | `--border-color`, `--border-hover` | white at 8% and 15% | black at 8% and 15% |
| Radius | `--radius-md`, `--radius-lg`, `--radius-xl` | 0.75rem, 1rem, 1.5rem | not overridden |
| Motion | `--transition-fast`, `--transition-base`, `--transition-slow` | 150, 250 and 400ms `ease` | not overridden |
| Shadow | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-glow` | black at 40–60%, orange glow at 15% | softer |

- **Checked against the site.** [`verify-design-system.mjs`](../../scripts/verify-design-system.mjs) compares both blocks with the site tokens in [`colors.css`](../tokens/colors.css) and its siblings, in `subset` mode: every name onboarding copies must keep the site's value.
- **Literal colours outside the tokens:**
  - success `#22c55e` (`.ob-status .ok`, `.ob-btn.done`);
  - error `#ef4444` (`.ob-status .bad`);
  - `#111827` text on `.ob-node.active`.
- **Fonts** ([typography.md](../foundations/typography.md), [0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md)):
  - Four `@font-face` rules self-host Poppins 100 and 900 and Space Mono 400 and 700 from `../assets/onboarding/fonts/*.ttf`.
  - Poppins draws the wordmark's `.fsb-f` and `.fsb-s`.
  - Space Mono sets `.ob-eyebrow`, `.ob-top-tag`, `.ob-ver`, `.ob-node` and the welcome `.version-tag`.
  - Body text uses the system stack; inputs and commands use `"SF Mono", Monaco, "Roboto Mono"`.
- **Icons.** onboarding.html links a vendored Font Awesome from `extension/assets/onboarding/fontawesome`, the same release the other pages fetch from cdnjs ([iconography.md](../foundations/iconography.md), [0005](../decisions/0005-font-awesome-icons-no-emoji.md)).
- **Provider marks** are CSS masks (`maskStyle()`, `.install-glyph`) or `<img>` files from `assets/onboarding/providers`.

## Anatomy

| Region | Selector | Contents |
|---|---|---|
| Page | `main.ob` | carries `data-theme`; `.ob-glow` paints a fixed radial orange light behind everything |
| Top bar | `header.ob-top` | the inline wordmark `.fsb-mark` (`.fsb-f`, `.fsb-s`, `svg.fsb-b`), `.ob-top-tag` (`entry_onboarding_tag`) and `#obStepLabel` |
| Card | `#obCard.ob-card` | up to 600px wide, `--radius-xl`, `--shadow-lg` plus a faint orange glow |
| Stepper | `.ob-stepper` | `.ob-track` with a gradient `#obTrackFill`, and `#obNodes` of 30px `button.ob-node` with `.ob-node-lab` captions |
| Nav | `.ob-nav` (`navHtml()`) | `#obBack`, an optional `.ob-skip`, and `#obNext` (`.ob-btn-primary`) |
| Toast | `#obToast.ob-toast` | a bottom-centre pill with an orange border and a check icon |

| Screen | Renderer | Parts |
|---|---|---|
| welcome | `renderWelcome()` | headline with a `.highlight` word, `.ob-feat-row` of three `.ob-feat`, `#obGetStarted` (`.ob-btn-wide`), `#obWelcomeSkip`, `.version-tag` |
| path | `renderPath()` | two `.ob-path` cards: `#obPickMcp` with `.ob-badge` and `#obPickByok` with `.ob-badge-soft`; Continue stays disabled until one is picked |
| mcp | `renderMcp()` | `.install-widget`: `.install-mark` glyph, `#obCopyCurrent` (`.install-base` plus `.install-flag`), `#obCopyIcon` and two `.install-fan` menus; `.ob-mcp-steps`; `#obOpenClaw` to the control panel's `#sync` |
| provider | `renderProvider()` | `.ob-hint` pointing back to MCP; `.ob-prov` buttons with icon, `.ob-prov-name`, an optional `.ob-prov-tag` (`.ob-tag-rec`, `.ob-tag-free`, `.ob-tag-local`) and `.ob-prov-radio` |
| apikey | `renderApiKey()` | `.ob-optional-card`. `apiKeyFieldHtml()` adds the password `#obKeyInput`, `#obRevealKey`, `.ob-status`, `.ob-status-msg` and `.ob-help` with `#obPasteKey`. For LM Studio, `localFieldHtml()` adds `#obLocalUrlInput` and `#obLocalModelSelect` |
| pin | `renderPin()` | `.ob-toolbar`, a browser mock with `.ob-tb-puzzle` and `.ob-pin-pop`; the `#obPinned` `.ob-confirm` toggle |
| done | `renderDone()` | `.ob-done-badge`, `.ob-summary` rows from `getSummary()`, the block `#obOpenFsb`, `#obOpenPanel`, `.ob-done-links` |

## States

- **Progress.** `renderStepper()` sizes `#obTrackFill` by percentage. Past nodes become `.done.click` (a check you can click to go back), the current node `.active` (solid orange) and later nodes `disabled`. `#obStepLabel` shows `entry_step`.
- **Choice.** `.ob-path.sel` takes an orange border and `--shadow-glow`. `.ob-prov.sel` takes an orange border and a 6% orange fill.
- **Key check.**
  - While `state.validating`, `.ob-status` spins and Continue reads `entry_checking`, disabled.
  - The result is an `.ok` check or a `.bad` cross, with `.ob-status-msg.ok` or `.bad` text.
  - `validateAndContinue()` sends `lattice-test-connection` and stores the provider only after it succeeds.
- **LM Studio.** `lmstudioDiscoveryStatus` moves through `loading`, `ready` and `error`. `#obLocalModelSelect` is disabled while discovering or empty. One model is chosen automatically; several need an explicit choice.
- **Copied.** `copyCommand()` marks `.install-copy.copied` or `.install-fan-item.copied` for 1600ms and shows the toast.
- **Done.** `.ob-confirm.done` marks the pin step. `#obOpenFsb.done` turns green and reads `entry_running`. If the side panel will not open, `openPopupFallback()` opens the [popup](popup.md).
- **Toast.** `showToast()` adds `.ob-toast.show` for 2600ms. It only confirms success: copied, opening, opened, or the popup fallback. Errors stay inline in `.ob-status-msg.bad`.
- **Theme.** `setupTheme()` reads `prefers-color-scheme` only (`state.theme` starts as `dark`). `render()` writes it to `.ob` with `els.root.dataset.theme`.
- **Narrow.** `@media (max-width: 640px)`:
  - hides `.ob-node-lab` and `.install-base`;
  - stacks `.ob-feat-row` and `.ob-nav`;
  - shrinks the headings and the card padding.

## Motion

| Motion | Selector | Timing | With reduced motion |
|---|---|---|---|
| Background glow | `.ob-glow` (`obGlow`) | 16s loop | stopped |
| Step fill | `.ob-track-fill` width | `--transition-slow` | keeps running |
| Hover lift | `.ob-btn-primary:hover`, `.ob-path:hover` (2px) | `--transition-base` | keeps running |
| Client glyph | `.install-mark.is-morphing .install-glyph` (`installGlitch`) | 560ms, `steps(12, end)` | stopped |
| Flag scramble | `scrambleInstallFlag()` on `requestAnimationFrame`, started by `advanceInstallClient()` every `ROTATE_MS` (1800ms) | 560ms | keeps running |
| Install fan | `.install-fan.open` | 200ms opacity, 360ms `cubic-bezier(0.34, 1.56, 0.64, 1)` | keeps running |
| Spinner | `.ob-status .spin` (`obSpin`) | 1s loop | stopped |
| Pin hint | `.ob-tb-puzzle.pulse` (`obPulse`) | 1.9s loop | stopped |
| Toast | `.ob-toast` | `--transition-base` | keeps running |

- **Pausing.** `advanceInstallClient()` skips while the widget is hovered (`state.paused`), while a fan is open, or off the MCP screen.
- **Reduced motion.** The `prefers-reduced-motion` block stops four animations and sets `scroll-behavior: auto`, nothing else.
- **Glow timing.** The 16s glow is slower than the home page's 12s `heroGlow` in [`home-page.component.scss`](../../showcase/angular/src/app/pages/home/home-page.component.scss) ([motion.md](../foundations/motion.md)).

## Copy and i18n

See [voice-and-copy.md](../foundations/voice-and-copy.md).

- **Helpers.**
  - `ob(key, english, subs)` calls `fsbUiLocale.text()` with `entry_*` keys from [`en/messages.json`](../../extension/_locales/en/messages.json).
  - `obExact(english, subs)` calls `fsbUiLocale.line()` for strings registered in [`copy-exact.js`](../../extension/utils/copy-exact.js), such as `Connection test failed`.
- **Static text.**
  - The static tag uses `data-i18n="entry_onboarding_tag"` and the title `copy_34c70e4722`.
  - `#obStepLabel` starts as fixed English with `translate="no"`, and `renderStepper()` rewrites it.
- **Language changes.** `init()` boots `fsbUiLocale`, applies it, and registers `onChange(() => render())` to redraw the current screen.
- **Untranslated names.** Brand, product and command text is marked `translate="no"`: `.fsb-mark`, `.install-base`, `.install-flag`, `.ob-prov-name`, `.version-tag`.
- **Gate.** [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists onboarding.html and onboarding.js in `SCOPE`.

## Accessibility

See [accessibility.md](../foundations/accessibility.md).

- **Toast.** `#obToast` is `role="status"` with `aria-live="polite"`.
- **Stepper.** The nodes are real buttons, and later steps are `disabled`.
- **Names.**
  - Provider glyph spans carry `role="img"` and an `aria-label`.
  - `#obCopyIcon` (`entry_copy_install`) and `#obRevealKey` (`entry_toggle_key`) have translated `aria-label`s.
  - `#obLocalModelSelect` has a `<label for>`.
- **Focus.** onboarding.css has no `:focus-visible` rule. Buttons keep the browser's default outline. `.ob-input:focus` removes the outline and only recolours the border.

## Tests that pin it

Editing a hashed file means recomputing its pinned hash in the same change. Both hashes cover the whole file, whitespace included.

| Test | What it pins | In `npm test` |
|---|---|---|
| [onboarding-agent-provider-clicks.test.js](../../tests/onboarding-agent-provider-clicks.test.js) | sha256 of onboarding.html and of onboarding.css; `copyCommand()` with its 1600ms timer and the exact `showToast(ob('entry_toast_copied', 'Install command copied'))`; `showToast()` at 2600ms | yes |
| [onboarding-lmstudio.test.js](../../tests/onboarding-lmstudio.test.js) | the LM Studio states: one model chosen, several need a choice, storage only after validation, late discovery replies ignored | yes |
| [extension-ui-locale.test.js](../../tests/extension-ui-locale.test.js) | static text matches the English catalog; no inline `<script>` | yes |
| [onboarding-first-run.test.js](../../tests/onboarding-first-run.test.js) | no `cdnjs`, `fonts.googleapis`, remote `<link>` or remote `@import`; model-discovery.js loads before onboarding.js; the provider key fields and install clients; the popup fallback; `resetKeyStatusIdle()` keeps input focus | no |

The design checks hold it too.

- **[`verify-design-system.mjs`](../../scripts/verify-design-system.mjs)** keeps the token blocks equal to the site. Its `MARK_B_PAGES` check makes onboarding.html inline the same B path as [`fsb-mark-b.svg`](../assets/logos/fsb-mark-b.svg).
- **[`check-style-literals.mjs`](../../scripts/check-style-literals.mjs)** counts the raw values outside those blocks.

## Known issues

- **Space Mono.** Onboarding self-hosts Space Mono and sets its eyebrows, tags, nodes and version tag in it. Under [0012](../decisions/0012-platform-mono-for-technical-text.md) these move to the platform stack (`--font-mono`) and the two Space Mono `@font-face` rules go. onboarding.css is hash-pinned, so that change recomputes the pin.
- **Wordmark B height.** `.fsb-b` is 0.68em here. The canonical height is 0.74em, as in [`showcase-shell.component.scss`](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss) `.fsb-b` ([brand.md](../foundations/brand.md)).
- **Ignores the theme setting.** `setupTheme()` follows the OS only. A user who picked Dark or Light in the control panel (`fsb-theme`) still gets the OS theme here.
- **Theme scope.** The theme attribute sits on `.ob`, not `<html>`, so `body` keeps the dark `--bg-body` in light theme.
- **Literal status colours.** Success `#22c55e` and error `#ef4444` are literals. The product's success colour is `#10b981` (`--fsb-success`).
- **Counts in copy.** `entry_feat_tools`, `entry_feat_guides`, `entry_agent_desc`, `entry_mcp_2b` and the Tools row of `getSummary()` hard-code counts. They go stale whenever the roster changes.
- **English outside the catalog.**
  - `discoverLmStudioModels()` builds `'Loaded model: '` and `' chat models found — choose one'`.
  - `getSummary()` writes `'Local endpoint'`.
  - `.ob-stepper` has an unkeyed `aria-label="Onboarding progress"`.
  - The copy gate misses these because none is a capitalised string of three or more words.
- **Keyboard and screen-reader gaps.**
  - The install fan opens only on hover (420ms on `#obCopyWrap`) and is `visibility: hidden` otherwise, so the per-client commands are mouse-only.
  - `.ob-path` and `.ob-prov` show selection only with `.sel`, with no `aria-pressed` or `aria-checked`.
  - `#obKeyInput` has only a placeholder, and `#obLocalUrlInput` has no label.
- **Motion against the rules.** `.install-fan.open` and `.install-fan-item` overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`). Reduced motion leaves the flag scramble, the client rotation, the fan and every transition running.

## Sources

- [`onboarding.html`](../../extension/ui/onboarding.html): `main.ob`, `.fsb-mark`, `#obStepLabel`, `.ob-stepper`, `#obToast`
- [`onboarding.css`](../../extension/ui/onboarding.css): `@font-face`, `:root`, `[data-theme="light"]`, `.fsb-b`, `.ob-card`, `.ob-node`, `.install-fan`, `.ob-toast`, the `prefers-reduced-motion` and 640px blocks
- [`onboarding.js`](../../extension/ui/onboarding.js): `route`, `render`, `renderStepper`, `setupTheme`, `validateAndContinue`, `discoverLmStudioModels`, `scrambleInstallFlag`, `copyCommand`, `showToast`, `getSummary`, `finishOnboarding`, `ob`, `obExact`
- [`init-config.js`](../../extension/config/init-config.js): `openOnboardingPage`
