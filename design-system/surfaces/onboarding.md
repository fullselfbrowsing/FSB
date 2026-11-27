# Onboarding

Status: current. Since PR #173 the wizard flies through depth planes.

## What it is

Onboarding is the extension's first-run setup page. It helps the user choose between the MCP path and the in-browser key (BYOK) path, then sends them to pin FSB and open it. Every step is a plane on the z axis, and moving between steps flies the camera from one plane to the next.

- **Entry.**
  - On install, [`init-config.js`](../../extension/config/init-config.js) `openOnboardingPage()` opens it in a new tab and records `fsbOnboardingAutoOpenedAt`.
  - The [control panel](control-panel.md)'s help section links back to it as Restart Setup.
- **Files.**
  - [`onboarding.html`](../../extension/ui/onboarding.html) is the static shell.
  - [`onboarding.js`](../../extension/ui/onboarding.js) holds the state and renders each step into its own plane in `#obStage`.
  - [`onboarding-depth.js`](../../extension/ui/onboarding-depth.js) is the depth engine, `FSBOnboardingDepth.create()`. It moves the planes by writing inline `translate`, `opacity`, `filter` and `visibility` on the elements onboarding.js renders.
  - [`onboarding.css`](../../extension/ui/onboarding.css) styles it.
  - [`model-discovery.js`](../../extension/ai/model-discovery.js) finds LM Studio models.
- **Steps.** `STEPS` lists seven planes: welcome, path, mcp, provider, apikey, pin, done. `route()` returns the steps for the chosen path: welcome, path, mcp, pin, done for MCP; welcome, path, provider, apikey, pin, done for BYOK. Before a path is chosen it holds a `setup` placeholder, which has no plane.
- **Finish.** `finishOnboarding()` stores `fsbOnboardingCompleted`, `fsbOnboardingPath`, `fsbOnboardingSkipped` and `fsbOnboardingCompletedAt`. Reaching done by Continue or by the rail finishes; `#obWelcomeSkip` finishes as a skip.

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
- **One unused token.** No rule reads `--transition-slow`.
- **Literal colours outside the tokens:**
  - success `#22c55e` and its 8% tint (`.ob-status .ok`, `.ob-status-msg.ok`, `.ob-btn.done`, `.vok`);
  - error `#ef4444` (`.ob-status .bad`, `.ob-status-msg.bad`);
  - `#fff` text on orange fills, such as `.ob-btn-primary`, `.ob-badge` and `.ob-done-badge`;
  - the brand orange as `rgba(255, 107, 53, …)` at many alphas: the glows, `.ob3-bloom`, tints, and the cue's warm colour.
- **Fonts** ([typography.md](../foundations/typography.md), [0004](../decisions/0004-type-system-font-poppins-wordmark-space-mono.md)):
  - Four `@font-face` rules self-host Poppins 100 and 900 and Space Mono 400 and 700 from `../assets/onboarding/fonts/*.ttf`. The control panel's options.css loads the same four files, and the status pill loads `space-mono-400.ttf` as a web-accessible resource (`PILL_MONO_URL` in [`visual-feedback.js`](../../extension/content/visual-feedback.js)).
  - Poppins draws the wordmark's `.fsb-f` and `.fsb-s`, in the top bar and in the done plane's `.ob3-end-mark`.
  - Space Mono sets `.ob-top-tag`, `.ob-ver`, `.ob-eyebrow`, `.version-tag`, `.ob-mcp-step .n`, `.mono` and the rail's `.fsb-depth-go`.
  - Body text uses the system stack; inputs and commands use `"SF Mono", Monaco, "Roboto Mono"` (`.ob-input`, `.install-cmd`, `.install-fan-flag`).
- **Icons.** onboarding.html links a vendored Font Awesome from `extension/assets/onboarding/fontawesome`, the same release the other pages fetch from cdnjs ([iconography.md](../foundations/iconography.md), [0005](../decisions/0005-font-awesome-icons-no-emoji.md)).
- **Client and provider marks.** Client and agent marks are CSS masks: `.install-glyph` with one of thirteen `.ob-lg-*` classes. Provider logos are `<img>` files from `assets/onboarding/providers`; LM Studio uses Font Awesome's `fa-cube`.

## Anatomy

| Region | Selector | Contents |
|---|---|---|
| Page | `main.ob.ob3` | carries `data-theme` and `--prog`. `.ob3` makes it a `100vh` room with `overflow: hidden`, so the page never scrolls. Behind everything sit `.ob-glow`, a radial orange light, and `.ob3-bloom`, a light at the vanishing point |
| Top bar | `header.ob-top` | over the room: the inline wordmark `.fsb-mark` (`.fsb-f`, `.fsb-s`, `svg.fsb-b`), `.ob-top-tag` (`entry_onboarding_tag`) and `#obStepLabel` |
| Stage | `#obStage.ob3-stage` | `data-depth-stage`, `tabindex="0"`, `role="region"`. `buildPlanes()` adds one `section.ob3-layer[data-step]` per step, each holding `.ob3-fit` and an `.ob3-col`; the done plane has `data-end`. A layer pads 62px 72px 84px, clear of the top bar, the rail's lane and the cue |
| Step rail | `nav#obNodes.fsb-depth-rail` | on the right edge, 28px in: one `button.fsb-depth-go` per step on the route, with a `.fsb-depth-lbl` name that shows on hover or focus, and a `.fsb-depth-tick` |
| Cue | `#obCue.ob3-cue` | bottom centre: `#obCueText` over an 84px line whose `#obTrackFill` (`.ob3-cue-fill`) shows progress |
| Nav | `.ob-nav` (`navHtml()`) | `.ob-back` (`data-nav="back"`), an optional `.ob-skip`, and Continue (`.ob-btn-primary`, `data-nav="next"`) |
| Toast | `#obToast.ob-toast` | a bottom-centre pill, 86px up, with an orange border and a check icon |

| Screen | Renderer | Parts |
|---|---|---|
| welcome | `welcomeHtml()` | `.ob3-welcome`: a headline with a `.highlight` word, `.ob-feat-row` of three `.ob-feat`, `#obGetStarted` (`.ob-btn-wide`), `#obWelcomeSkip`, `.version-tag` |
| path | `pathHtml()` | `.ob3-path`: two `.ob-path` cards side by side, `#obPickMcp` with `.ob-badge` and `#obPickByok` with `.ob-badge-soft`; Continue stays disabled until one is picked |
| mcp | `mcpHtml()` | `.install-widget` (`#obInstallWidget`): `.install-mark` glyph, `#obCopyCurrent` (`.install-base` plus `.install-flag`), and `#obCopyWrap` with `#obCopyIcon` and two `.install-fan` menus; `.ob-mcp-steps`; an `.ob-claw` link to the Agents page with five `.ob3-agents-mark` glyphs (`AGENT_MARKS`); an `.ob3-skill` note linking the ClawHub skill |
| provider | `providerHtml()` | `.ob-hint` pointing back to MCP; a two-column grid of `.ob-prov` buttons (`providerButtonHtml()`) with icon, `.ob-prov-name`, an optional `.ob-prov-tag` (`.ob-tag-rec`, `.ob-tag-free`, `.ob-tag-local`) and `.ob-prov-radio` |
| apikey | `apiKeyHtml()` | `.ob-optional-card`, then `.ob3-field`. `apiKeyFieldHtml()` fills it with the password `#obKeyInput`, `#obRevealKey`, `.ob-status`, `.ob-status-msg` and `.ob-help` with `#obPasteKey`. For LM Studio, `localFieldHtml()` fills it with `#obLocalUrlInput` and `#obLocalModelSelect` |
| pin | `pinHtml()` | `.ob-toolbar`, a browser mock with `.ob3-tb-fsb` (the pinned icon), `.ob-tb-puzzle` and `.ob-pin-pop`; the `#obPinned` `.ob-confirm` toggle |
| done | `doneHtml()` | `.ob3-end`: `.ob-done-badge`; `.ob3-end-groups`, one `.ob3-end-group` per `getSummary()` row; `#obOpenFsb` in `.ob3-end-cta`; `.ob-done-more`, with `#obOpenPanel` off the MCP path. Behind it sits `.ob3-end-mark`, a large faded wordmark; below it `.ob3-end-meta` holds `.version-tag` and `.ob-done-links` |

- **Rendering.** `render()` builds every plane's markup, and `morph()` patches it into the plane in place. It keeps each node whose tag is unchanged and never writes that node's `style` attribute, which belongs to the depth engine. Handlers are bound once on `.ob` (`bind()`, `listen()`).
- **Depth hooks** in the markup:
  - `data-di`, 0 to 1, orders an element in a flight. Going forward, lower values leave first and arrive first; going back the order reverses.
  - `data-door` marks what a flight dives through: `always` on the path cards, `next` on the provider buttons, `primary` on Continue and Get started.
  - `data-depth-own` keeps the wheel and touch for `#obCopyWrap` and `#obLocalModelSelect`.

## States

- **Progress.** `renderStepper()` writes `entry_step` into `#obStepLabel`, sizes `#obTrackFill` by percentage, writes the cue text and redraws the rail. The cue reads `entry_cue_begin` (Begin) on welcome, the step's name elsewhere, or a nudge. Past ticks are `.is-done`; the current one is `.is-active`, a 32px orange tick with `aria-current="step"`.
- **Rail reach.** `railMove()` reads the live state. A tick goes back to any earlier step, or forward as far as Continue would go, stopping at the first step that still needs an answer (`reachableAhead()`, `stepNeedsAnswer()`). Other ticks are `disabled`. A press asks `railMove()` again, so a stale tick cannot skip an edited key.
- **Moving.**
  - Continue, Back and the rail call `goNext()`, `goBack()` and `goTo()`. `render()` then calls `syncDepth()`, which passes every plane's distance from the current step (`targets()`) to the engine.
  - Arrow Down, Page Down and Space go forward; Arrow Up, Page Up and Shift+Space go back (`onKey()`). A vertical swipe on the stage drags the camera. The wheel never changes steps.
  - Switching tracks between mcp, provider and apikey (`TRACK_STEPS`) is a sidestep: MCP lies to the left, BYOK to the right.
- **Blocked.** `canStep()` stops forward moves on the path step until a path is chosen, and on the key step until the key is valid. A forward key or swipe there calls `nudge()`: the cue turns orange (`.ob3-cue.is-nudge`) and shows `entry_nudge_path`, `entry_nudge_key` or `entry_nudge_local` for 2200ms (`NUDGE_MS`). A blocked swipe gives at most 0.15 of a step and springs back.
- **Choice.** `.ob-path.sel` takes an orange border and `--shadow-glow`. Once a path is chosen (`.ob-paths.has-sel`), its card scales to 1.035, the other to 0.955, and the other's contents fade to 0.45 until it is hovered or focused. `.ob-prov.sel` takes an orange border, a 6% orange fill and a 1.02 scale.
- **Key check.**
  - While `state.validating`, `.ob-status` spins and Continue reads `entry_checking`, disabled.
  - The result is an `.ok` check or a `.bad` cross, with `.ob-status-msg.ok` or `.bad` text. `.ob3-field` takes `.is-ok` or `.is-bad`.
  - `validateAndContinue()` sends `lattice-test-connection` and stores the provider only after it succeeds. `continueFromKey()` then waits 520ms (`KEY_ACCEPT_MS`) before moving on.
  - Only the latest check answers, and only while the provider and key, or the LM Studio URL and model, are still the ones it checked (`keyCheckTarget()`, `keyCheckLapsed()`). A stale answer only ends the busy state.
  - Typing in `#obKeyInput` or `#obLocalUrlInput` resets the status in place (`resetKeyStatusIdle()`) without a render, so the caret stays. It redraws the rail, so the ticks past the key close.
- **LM Studio.** `lmstudioDiscoveryStatus` moves from `idle` through `loading` to `ready` or `error`. Arriving on the step starts discovery, and a URL edit restarts it after 500ms. `#obLocalModelSelect` is disabled while discovering or empty. One model is chosen automatically; several need an explicit choice. Choosing another model clears the old check in place and sets Continue's `disabled` directly.
- **Copied.** `copyCommand()` marks `.install-copy.copied` or `.install-fan-item.copied` for 1600ms and shows the toast.
- **Done.**
  - `#obPinned` toggles `.ob-confirm.done`. The icon lands in the toolbar mock (`.ob3-tb-fsb.on`) and the puzzle stops pulsing.
  - On the MCP path, `#obOpenFsb` reads `entry_explore` and opens the control panel (`exploreFsb()`). On the others it reads `entry_open` and opens the side panel (`openFsb()`). Once used, it turns green (`.done`), reads `entry_panel_opened` or `entry_running`, and lights the wordmark (`.ob3-end-mark.is-live`).
  - If the side panel will not open, `openPopupFallback()` opens the [popup](popup.md).
- **Toast.** `showToast()` adds `.ob-toast.show` for 2600ms. It only confirms success: copied, opening the side panel, opened, opening the control panel, or the popup fallback. Errors stay inline in `.ob-status-msg.bad`.
- **Theme.** `setupTheme()` reads `prefers-color-scheme: dark` and follows its `change` event. `render()` writes the theme to `.ob` with `els.root.dataset.theme`. In light theme, planes out of focus also drop to 30% opacity (`[data-theme="light"] .ob3-layer[inert]`).
- **Fit.** `layout()` scales each plane's `.ob3-fit` down until it fits its plane, then to 95% of that (`ZOOM`).
- **Narrow.**
  - `@media (max-width: 1100px)` sets a showing rail name on a `--bg-card` chip.
  - `@media (max-width: 760px)` narrows the layer padding to 18px left and 36px right, sets `.ob3 .ob-h` to 1.7rem, puts the path cards and providers in one column and the summary in two, moves the rail 6px from the edge, hides its names and shortens its ticks to 10px (18px active).
  - `@media (max-width: 640px)` stacks `.ob-feat-row` and `.ob-nav`, hides `.install-base` and narrows the top bar's padding.

## Motion

| Motion | Selector | Timing | With reduced motion |
|---|---|---|---|
| Step flight | every `[data-di]` element on the planes (`fly()`) | 594ms forward (`T_FWD`) and 522ms back (`T_BACK`), plus 109ms for each extra step up to three; cubic ease-in-out; set off one after another across 188ms (`SPREAD`). A swipe already under way finishes in 406ms, cubic ease-out, across 80ms | a crossfade in place, easing 30% of the gap per frame |
| Track sidestep | the plane in focus and the arriving one | 623ms (`T_SIDE`), cubic ease-in-out | opacity only |
| Vanishing point | `perspective-origin` on each element's parent, and `.ob3-bloom`'s position | closes 26.5% of the gap per 60fps frame | stays centred |
| Settle | every element between flights and under a swipe (`frame()`) | closes 12% of the gap per 60fps frame, 6.3% for the last elements (`BASE / (1 + 0.9k)`) | 30% per frame (`BASE` 0.3) |
| Arrival light | `.ob3-bloom` opacity and scale (0.3 to 1.2); `.ob3-cue` `--cue`, which lifts the text 2px and the line 6px and warms the colour to orange | rises and falls as `sin(π·d)` of the arriving plane's lead element | bloom `display: none`; `--cue` stays 0 |
| Progress line | `.ob3-cue-fill` width | 0.7s `cubic-bezier(.16,1,.3,1)` | no transition |
| Glow drift | `.ob3 .ob-glow` `translate`, ±8% with `--prog` | 1.6s `cubic-bezier(.16,1,.3,1)` | keeps running |
| Background glow | `.ob-glow` (`obGlow`) | 16s loop, ease-in-out | stopped |
| Choice scale | `.ob-paths.has-sel .ob-path`, `.ob-prov.sel` | 0.6s `cubic-bezier(0.16, 1, 0.3, 1)`, added inline by `strip()` | keeps running |
| Unchosen path | `.ob3-path .ob-path > *` opacity | 0.35s ease | keeps running |
| Key recoil | `.ob3-field.is-bad .ob-field` (`ob3Recoil`) | 0.55s `cubic-bezier(.3,.6,.3,1)`: 64px back, with a −9, +7, −3px shake | stopped |
| Key accept | `.ob3-field.is-ok .ob-field` (`ob3Accept`) | 0.5s on the same curve: 30px toward the camera | stopped; the 520ms wait stays |
| Pinned icon | `.ob3-tb-fsb.on` | from `scale: 2.4`, `translate: 14px 44px` and a 5px blur: scale and translate 0.7s, width and margin 0.5s, all `cubic-bezier(.16,1,.3,1)`; opacity 0.35s and filter 0.5s ease | a 0.2s fade in place |
| Wordmark light | `.ob3-end-mark .fsb-mark` colour, `.ob3-end-mark::before` opacity | 1.4s ease | keeps running |
| Light-theme planes | `[data-theme="light"] .ob3-layer` opacity | 0.35s ease | keeps running |
| Rail | `.fsb-depth-lbl` (fade, 6px slide), `.fsb-depth-tick` (width, colour, opacity) | 0.25s and 0.3s ease | keeps running |
| Hover lift | `.ob-btn-primary:hover`, `.ob-path:hover`, `.ob-claw:hover` (2px) | `--transition-base`; `.ob-claw` `--transition-fast` | keeps running |
| Colour and border | `.ob-back`, `.ob-skip`, `.ob-prov`, `.ob-path-check`, `.ob-input`, `.install-copy`, `.ob-confirm`, `.ob-claw-go`, `.install-bar` | `--transition-fast`; `.install-bar` `--transition-base` | keeps running |
| Client glyph | `.install-mark.is-morphing .install-glyph` (`installGlitch`) | 560ms, `steps(12, end)` | stopped |
| Flag scramble | `scrambleInstallFlag()` on `requestAnimationFrame`, started by `advanceInstallClient()` every `ROTATE_MS` (1800ms) | 560ms | keeps running |
| Install fan | `.install-fan.open` | opens after 420ms of hover: 200ms opacity, 360ms `cubic-bezier(0.34, 1.56, 0.64, 1)` from `scale(0.94)` and 8px. Closes 260ms after the pointer leaves: 180ms opacity, 240ms `cubic-bezier(0.16, 1, 0.3, 1)` | keeps running |
| Fan items | `.install-fan-item`, `scale(1.07)` on hover | transform 200ms `cubic-bezier(0.34, 1.56, 0.64, 1)` | keeps running |
| Spinner | `.ob-status .spin` (`obSpin`) | 1s linear loop | stopped |
| Pin hint | `.ob-tb-puzzle.pulse` (`obPulse`) | 1.9s loop | stopped |
| Toast | `.ob-toast`, a 16px rise | `--transition-base` | keeps running |

- **Flight geometry** (`zOf()`, `apply()`, a 1200px perspective `P`):
  - Planes ahead sit 900px back per step. The next one shows at 9% opacity, blurred 12px and 30% saturated; planes two or more ahead are hidden.
  - Planes flown past come up to 760px toward the camera (820px per step), fading out by 0.65 of a step and blurring to 12px.
  - The door, the element a flight dives through, comes up to 1000px (1500px per step). It keeps full opacity for a quarter step, is gone by three quarters, and blurs to 8px.
  - A sidestep slides a plane half the room's width and 320px back, blurring it up to 12px and fading it out by 0.83 of the way.
- **The door.** Going forward, `doorEl()` picks the chosen path card, then the chosen provider when moving on, then the button or link pressed in the last 1600ms. The vanishing point moves to it, held within 42% of the room's width and height from the centre. Going back reverses through the door the earlier step was left by. A sidestep has no door. When the flight lands, the vanishing point returns to the centre.
- **Order.** Going forward, leaving elements set off within `0.55 × SPREAD`, the door at `0.55 × SPREAD`, and arriving elements from `0.4` to `1.2 × SPREAD`, so a one-step press ends within 820ms. Going back, the door leaves at `0.4 × SPREAD`.
- **Pausing.** `advanceInstallClient()` skips while the widget is hovered (`state.paused`), while a fan is open, mid-scramble, or off the MCP screen.
- **Reduced motion.** Two `prefers-reduced-motion` blocks stop six animations (`obGlow`, `installGlitch`, `obPulse`, `obSpin`, `ob3Recoil`, `ob3Accept`), hide `.ob3-bloom`, drop the progress line's transition, cut the pinned icon to a 0.2s fade and set `scroll-behavior: auto`. `obDepth()` reads the setting once, when the engine starts, and replaces every flight with a crossfade: no depth, blur or sidestep, and opacity `1 − 1.6 × distance`. Every row marked "keeps running" still moves.
- **Overshoot.** `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoots (y 1.56) on `.install-fan.open` and `.install-fan-item`. No other curve does: `cubic-bezier(.16,1,.3,1)` and `cubic-bezier(.3,.6,.3,1)` stay within 1, and the engine's cubic eases and per-frame approach never pass their target. The key recoil's shake comes from its keyframes, not its curve.
- **Glow timing.** The 16s glow is slower than the home page's 12s `heroGlow` in [`home-page.component.scss`](../../showcase/angular/src/app/pages/home/home-page.component.scss) ([motion.md](../foundations/motion.md)).

## Copy and i18n

See [voice-and-copy.md](../foundations/voice-and-copy.md).

- **Helpers.**
  - `ob(key, english, subs)` calls `fsbUiLocale.text()` with `entry_*` keys from [`en/messages.json`](../../extension/_locales/en/messages.json).
  - `obExact(english, subs)` calls `fsbUiLocale.line()` for strings registered in [`copy-exact.js`](../../extension/utils/copy-exact.js), such as `Connection test failed`.
- **Static text.**
  - The static tag uses `data-i18n="entry_onboarding_tag"` and the title `copy_34c70e4722`.
  - The stage and the rail take their `aria-label`s through `data-i18n-attr` (`entry_stage_aria`, `entry_rail_aria`).
  - `#obStepLabel` starts as fixed English with `translate="no"`, and `renderStepper()` rewrites it.
- **Language changes.** `init()` boots `fsbUiLocale`, applies it, and registers `onChange(() => render())` to redraw every plane and the rail.
- **Untranslated names.** Brand, product and command text is marked `translate="no"`: `.fsb-mark`, `.install-base`, `.install-flag`, `.install-fan-name`, `.install-fan-flag`, `.ob-prov-name`, `.version-tag` and the pin menu's `FSB`.
- **Gate.** [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists onboarding.html and onboarding.js in `SCOPE`. onboarding-depth.js holds no copy and is not listed.

## Accessibility

See [accessibility.md](../foundations/accessibility.md).

- **Toast.** `#obToast` is `role="status"` with `aria-live="polite"`.
- **Stage and planes.**
  - `#obStage` is a focusable `role="region"` named by `entry_stage_aria`.
  - Only the plane in focus is live: `sync()` marks the others `inert` and `aria-hidden="true"` and turns off their pointer events. `planeLabel()` names each plane.
  - After a step change, `syncDepth()` moves focus to the stage if it was left on the old plane or on the body.
- **Rail.** The `nav` is named by `entry_rail_aria`. Each tick is a button whose `aria-label` says where it goes (`entry_rail_back`, `entry_rail_go`, `entry_rail_current`, `entry_rail_ahead`). The current one has `aria-current="step"`, and unreachable ones are `disabled`.
- **Names.**
  - Client glyph spans carry `role="img"` and an `aria-label`; provider logos are `<img>` with `alt`.
  - `#obCopyIcon` (`entry_copy_install`) and `#obRevealKey` (`entry_toggle_key`) have translated `aria-label`s.
  - `#obKeyInput` (`entry_key_aria`) and `#obLocalUrlInput` (`entry_lm_url_aria`) are named by `aria-label`; `#obLocalModelSelect` has a `<label for>`.
- **Pressed state.** `.ob-path`, `.ob-prov` and `#obPinned` carry `aria-pressed`.
- **Keyboard.** The arrow keys, Page Up, Page Down and Space move between steps as far as the wizard allows, except in a field or with Alt, Ctrl or Meta held.
- **Focus.**
  - The rail has the page's only focus style: `.fsb-depth-go:focus-visible` draws a 2px `--primary` outline with a 2px offset.
  - Other buttons keep the browser's default outline. An unchosen path card returns to full opacity on `:focus-visible`.
  - `.ob-input:focus` removes the outline and only recolours the border. `.ob3-stage` sets `outline: none`.

## Tests that pin it

Editing a hashed file means recomputing its pinned hash in the same change. Both hashes cover the whole file, whitespace included.

| Test | What it pins | In `npm test` |
|---|---|---|
| [onboarding-agent-provider-clicks.test.js](../../tests/onboarding-agent-provider-clicks.test.js) | sha256 of onboarding.html and of onboarding.css; `copyCommand()` with its 1600ms timer and the exact `showToast(ob('entry_toast_copied', 'Install command copied'))`; `showToast()` at 2600ms; rail ticks that follow the live key state, so a key edit or a new LM Studio model closes the ticks past the key and a stale Done tick neither finishes nor writes; a connection test that counts only for the provider and key it checked | yes |
| [onboarding-depth-adopt.test.js](../../tests/onboarding-depth-adopt.test.js) | the real engine on a fake DOM: rows a render adds to a far plane are hidden before the next paint, and a destroyed engine ignores late changes | yes |
| [onboarding-lmstudio.test.js](../../tests/onboarding-lmstudio.test.js) | the LM Studio states: one model chosen, several need a choice, storage only after validation, late discovery replies ignored, an answer for a model no longer chosen ignored, and an older failure never undoing a newer success | yes |
| [extension-ui-locale.test.js](../../tests/extension-ui-locale.test.js) | static text and `data-i18n-attr` values match the English catalog; no inline `<script>` | yes |
| [fsb-wordmark-parity.test.js](../../tests/fsb-wordmark-parity.test.js) | every inline B in onboarding.html and onboarding.js is the canonical `svg.fsb-b`; onboarding.css keeps `.fsb-b` at 0.74em after a 0.01em gap, `.fsb-f` at 100, `.fsb-s` at 900, `.fsb-row` in Poppins at -0.02em, no other rule restyling them, and both bundled Poppins files | yes |
| [fsb-icon-corners.test.js](../../tests/fsb-icon-corners.test.js) | `assets/onboarding/icon48.png` stays byte-identical to the extension's icon; `.ob3-tb-fsb img` and `.ob-pin-row .pi` round it at 22–25% of its size | yes |
| [mcp-version-parity.test.js](../../tests/mcp-version-parity.test.js) | every tool count in onboarding.js equals the built server's registered tools | yes |
| [mcp-client-identity-integration.test.js](../../tests/mcp-client-identity-integration.test.js) | onboarding.js still calls `persistCopyClick(clientId, source)` | yes |
| [onboarding-first-run.test.js](../../tests/onboarding-first-run.test.js) | no `cdnjs`, `fonts.googleapis`, remote `<link>` or remote `@import`; model-discovery.js loads before onboarding.js; the provider key fields and install clients; the popup fallback; `resetKeyStatusIdle()` keeps input focus | no |

The design checks hold it too.

- **[`verify-design-system.mjs`](../../scripts/verify-design-system.mjs)** keeps the token blocks equal to the site. Its `MARK_B_PAGES` check makes onboarding.html inline the same B path as [`fsb-mark-b.svg`](../assets/logos/fsb-mark-b.svg).
- **[`check-style-literals.mjs`](../../scripts/check-style-literals.mjs)** counts the raw values outside those blocks.
- **`npm run version:check`**, which CI runs, requires onboarding.js to read its version from `chrome.runtime.getManifest().version`.

## Known issues

- **Space Mono.** Onboarding self-hosts Space Mono and sets seven rules in it: the top tag, the step counter, the eyebrows, the version tags, the MCP step numbers, `.mono` values and the rail's `.fsb-depth-go`, though [typography.md](../foundations/typography.md) forbids Space Mono in new CSS. Under [0012](../decisions/0012-platform-mono-for-technical-text.md) these move to the platform stack (`--font-mono`) and the two Space Mono `@font-face` rules go; the font files stay while options.css and the status pill load them. onboarding.css is hash-pinned, so that change recomputes the pin.
- **Ignores the theme setting.** `setupTheme()` follows the OS only. A user who picked Dark or Light in the control panel (`fsb-theme` in `localStorage`, `fsbThemePreference` in storage) still gets the OS theme here.
- **Theme scope.** The theme attribute sits on `.ob`, not `<html>`, so `body` keeps the dark `--bg-body` in light theme.
- **Literal status colours.** Success `#22c55e` and error `#ef4444` are literals. The product's success colour is `#10b981` (`--fsb-success`).
- **Counts in copy.** `entry_feat_tools`, `entry_feat_guides`, `entry_feat_guides_sub`, `entry_mcp_2b` and the Tools row of `getSummary()` (`entry_sum_68`, whose key and English already disagree on the count) hard-code counts. [`mcp-version-parity.test.js`](../../tests/mcp-version-parity.test.js) holds the tool counts in onboarding.js's English to the built server. Nothing checks the eight catalogs, which are what the page shows, or the guide and category counts.
- **English outside the catalog.**
  - `discoverLmStudioModels()` builds `'Loaded model: '` and `' chat models found — choose one'`.
  - `getSummary()` writes `'Local endpoint'`.
  - The copy gate misses these because none is a capitalised string of three or more words.
- **Keyboard and screen-reader gaps.**
  - The install fan opens only on hover (420ms on `#obCopyWrap`) and is `visibility: hidden` otherwise, so the per-client commands are mouse-only.
  - When a step change leaves focus on the old plane, `syncDepth()` moves it to `#obStage`, whose `outline: none` shows nothing.
  - Nudges are silent: `nudge()` writes into `#obCueText`, inside the `aria-hidden` `#obCue`.
  - `#obKeyInput` and `#obLocalUrlInput` have only an `aria-label`, where accessibility.md asks for a `<label>` or `aria-labelledby`.
- **Small rail targets.** A `.fsb-depth-go` is 40px tall (`min-height: 40px`) and as wide as its tick plus 12px: 26px, or 44px when active, and 22px under 760px. New controls must be 44px square.
- **Steps shrink instead of scrolling.** The room never scrolls: `.ob3` is `overflow: hidden` and `onWheel()` swallows the wheel. `layout()` scales a step until it fits its plane, so on a short window a step that grows, such as one showing a long key error, shrinks as a whole. [motion.md](../foundations/motion.md) says to keep the size and scroll inside.
- **Motion against the rules.**
  - `.install-fan.open` and `.install-fan-item` overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
  - The fan scales in from 0.94 and the pinned icon from 2.4, against the no scale-in rule.
  - Reduced motion leaves the flag scramble, the client rotation, the fan, the choice scale and fade, the glow drift, the rail, the wordmark light, the light-theme plane fade, the toast and every hover transition running.
- **Unused styles.** `.ob-btn-ghost`, `.ob-perms` and `.ob-prov-models` have rules but no markup. The 640px block's `.ob-h` size never applies, because `.ob3 .ob-h` is more specific.

## Sources

- [`onboarding.html`](../../extension/ui/onboarding.html): `main.ob.ob3`, `.fsb-mark`, `#obStepLabel`, `#obStage`, `#obNodes`, `#obCue`, `#obToast`
- [`onboarding.css`](../../extension/ui/onboarding.css): `@font-face`, `:root`, `[data-theme="light"]`, `.fsb-b`, the `.ob3-*` room rules, `.fsb-depth-*`, `.install-fan`, `.ob-toast`, both `prefers-reduced-motion` blocks, and the 640px, 760px and 1100px blocks
- [`onboarding-depth.js`](../../extension/ui/onboarding-depth.js): `obDepth`, `P`, `BASE`, `ZOOM`, `T_FWD`, `T_BACK`, `T_SIDE`, `SPREAD`, `strip`, `layout`, `zOf`, `apply`, `sync`, `cue`, `doorEl`, `fly`, `set`, `onWheel`, `onKey`
- [`onboarding.js`](../../extension/ui/onboarding.js): `STEPS`, `route`, `targets`, `syncDepth`, `canStep`, `railMove`, `nudge`, `render`, `renderStepper`, `morph`, `setupTheme`, `continueFromKey`, `validateAndContinue`, `keyCheckLapsed`, `resetKeyStatusIdle`, `discoverLmStudioModels`, `scrambleInstallFlag`, `copyCommand`, `showToast`, `getSummary`, `finishOnboarding`, `ob`, `obExact`
- [`init-config.js`](../../extension/config/init-config.js): `openOnboardingPage`
- The depth planes came in PR #173, commits `722713488` ("fly the onboarding wizard through depth planes") and `12e4c7efd`, with fixes in `cb2e5f732`, `6059d0382` and `6be36a30d`. `aa8bffa8c` set the B to 0.74em.
