# Side panel

Status: shipped on main

## What it is

The side panel is FSB's main extension surface: chat with the in-browser agent, delegated agent runs, session history and replay.

- **How it opens.** Clicking the toolbar icon opens it. [`background.js`](../../extension/background.js) calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. When `chrome.sidePanel.open` fails, its `chrome.action.onClicked` listener opens the [popup](popup.md) in a 400×600 window instead. [`manifest.json`](../../extension/manifest.json) `side_panel.default_path` names the page.
- **Files.** [`sidepanel.html`](../../extension/ui/sidepanel.html) holds the markup, [`sidepanel.css`](../../extension/ui/sidepanel.css) the styles and [`sidepanel.js`](../../extension/ui/sidepanel.js) the behaviour. [`delegation-feed.js`](../../extension/ui/delegation-feed.js) renders delegated-run entries, and [`markdown-renderer.js`](../../extension/ui/markdown-renderer.js) with [`markdown.css`](../../extension/ui/markdown.css) renders agent answers.
- **Width.** Chrome sets the panel's width and the user can drag it. The CSS adapts at `@media (max-width: 350px)` and `@media (min-width: 500px)` instead of designing for one size.

## Palette and tokens

The side panel uses the product palette ([0002](../decisions/0002-three-palettes-one-brand-orange.md), [color.md](../foundations/color.md)).

- **Core tokens.** It links [`fsb-ui-core.css`](../../extension/shared/fsb-ui-core.css) first. Its `:root` holds the `--fsb-*` tokens and the compatibility aliases (`--primary`, `--bg-card`), and `[data-theme="dark"]` flips them. [`product-surface.css`](../tokens/product-surface.css) mirrors both blocks.
- **Local tokens.** sidepanel.css declares 23 tokens on `:root` and overrides only its 12 message tones under `[data-theme="dark"]`. Dark surfaces and hairlines come from the core ([0017](../decisions/0017-side-panel-uses-core-dark-surfaces.md)):

| Group | Tokens | Light | Dark |
|---|---|---|---|
| Surfaces | `--bg-primary`, `--bg-secondary`, `--bg-tertiary` | `--fsb-surface-elevated`, `--fsb-surface-base`, `--fsb-surface-muted-2` | the same tokens: `#0d0d0d`, `#050505`, `#141414` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` | `--fsb-text-*` | the same tokens |
| Borders | `--border-color`, `--border-hover` | `--fsb-border-subtle`, `--fsb-border-strong` | the same tokens: white at 8% and 14% |
| Accent | `--primary-color`, `--primary-hover` | `--fsb-primary`, `--fsb-primary-hover` | not overridden |
| Shadow | `--shadow-sm` | `--fsb-shadow-sm` (the core alias points at `--fsb-shadow-xs`) | same |
| Message tones | `--system-*`, `--ai-*`, `--error-*`, `--action-*` | tinted washes; AI, error and action text `#0f5c6a`, `#991b1b`, `#166534` | text `#8ed9e7`, `#f4aaaa`, `#b8e4ba` |
| Status | `--status-bg` | `--fsb-primary-soft` mixed into `--bg-secondary` | same mix, slightly stronger |

- **Forced near-black.** A `[data-theme="dark"] body, .sidepanel-container, .sidepanel-header, ...` rule paints seven regions `#050505 !important`. The core's dark ramp now holds the same near-black (`#050505` base, `#0d0d0d` elevated; [0011](../decisions/0011-product-dark-is-near-black.md)), so this rule repeats it.
- **Delegated-run cards read core tokens directly.** `.delegation-state-card`, `.delegation-entry` and `.delegation-summary` use `--fsb-surface-elevated`, `--fsb-border-subtle`, `--fsb-shadow-xs` and `--fsb-space-*`, not the local aliases.
- **Specificity.** The core's `:is()` rule that lists `.sidepanel-container .icon-btn` outranks sidepanel.css `.icon-btn`, so icon buttons take their border, fill and shadow from the core. The header background and `.input-wrapper` tie on specificity and resolve to sidepanel.css, which loads later.
- **Type** ([typography.md](../foundations/typography.md)):
  - `body` uses the system stack;
  - `.brand-row h1` is plain 16px/700 text, not the wordmark;
  - `.status-text` is 11px uppercase, `.message` 14px (15px at 500px and wider), `.message.action` 12px in an SF Mono stack;
  - no Poppins or Space Mono.
- **Icons.** Font Awesome loads from cdnjs through the `<link>` in the sidepanel.html head ([iconography.md](../foundations/iconography.md), [0005](../decisions/0005-font-awesome-icons-no-emoji.md)).

## Anatomy

| Region | Selector | Contents |
|---|---|---|
| Header | `.sidepanel-header` | `.brand-row` (`ext_name`, `.surface-subtitle`), `.status-indicator` pill (`.status-dot`, `.status-text`), and three 32px `.icon-btn`: `#historyBtn`, `#newChatBtn`, `#settingsBtn` |
| History | `#historyView.history-view` | `#clearAllHistoryBtn`; `#historyList` of `.history-item` rows with `.history-status`, `.history-cost`, `.history-replay-btn`, `.history-delete-btn`; `.history-empty-state` |
| Messages | `#chatMessages.chat-messages` | bubbles, inline cards, and `#delegationRun` with `#delegationStateCard` and `#delegationFeed` |
| Runner | `#automationRunner` | `.pixel-loader`: three 3×5 `.pixel-letter` grids (F, S, B) beside `#automationTimer` |
| Composer | `.chat-input-area .input-wrapper` | contenteditable `#chatInput.chat-input` (`role="textbox"`, `aria-multiline`), then 36px `#stopBtn`, `#micBtn`, `#sendBtn` |
| Footer | `.author-footer` | `#footerVersion`, which no script fills |
| Payment confirm | `#paymentFillConfirmOverlay` | scrim and `.payment-fill-confirm-card` with `#pfcAllow` and `#pfcDeny` |

`addMessage()` in sidepanel.js gives each bubble the class `message <type> new`:

| Class | Used for | Look |
|---|---|---|
| `.message.user` | the user's text | right-aligned; 135° gradient from `--primary-color` to `#ff8c42`; flat `#e55a2b` in dark |
| `.message.system` | notices, the welcome line, restored assistant text | `--system-bg` |
| `.message.error` | failures | `--error-*` and a `.message-dismiss` button; becomes `.auto-collapsed` after 30 s |
| `.message.action` | executed tool calls, restored progress | full width, 12px monospace, `--action-*` |
| `.message.ai-completion` | the final answer from `addCompletionMessage()`; `.partial-result` when partial | markdown.css `.md-rendered` |
| `.message.status-message` | `addStatusMessage()` creates it only as a hidden `.status-anchor`; progress shows in the header and the runner | `--status-bg` (never painted) |
| `.message.ai` | no side panel code path renders it; `renderPersistedMessage()` maps restored messages to the classes above | `--ai-*` |

Inline cards in the list: `.message.login-prompt`, `.message.payment-prompt`, `.replay-preview-card`, `.replay-decision-card`, `.action-summary-group` and `.recon-suggestion`.

## States

- **Header status.** `_setHeaderStatus(label, tone)` shows Ready, Working (`.status-dot.running`) or Error (`.status-dot.error`). `setIdleState`, `setRunningState` and `setErrorState` call it.
- **Running.** `setRunningState` disables `#sendBtn`, reveals `#stopBtn` and calls `showAutomationRunner()`, which ticks the timer every 100ms.
- **Tab owned by another agent.** `applyInputLockout(true)` adds `.fsb-foreign-owned-disabled` (opacity 0.45, no pointer events) to the composer controls. It also sets `aria-disabled`, sets `aria-describedby="fsb-lockout-aria-description"` and makes `#chatInput` non-editable.
- **History.** `showHistoryView()` hides the messages and composer, shows `#historyView` and marks `#historyBtn` `.active`. `.history-status` has six variants: `completed`, `partial`, `stopped`, `error`, `stuck` and `idle-closed`.
- **Microphone.** `.mic-btn.recording` is solid `#dc2626`, distinct from the pale stop button. `.transcribing` and `.error` are the other two states.
- **Theme.** `applyTheme()` reads `localStorage` key `fsb-theme` (`system`, `dark` or `light`; anything else counts as `system`). It resolves `system` with `resolveEffectiveTheme()` and writes `data-theme` on `<html>`. It re-runs on `storage` events and on `prefers-color-scheme` changes.
- **Toolbar icon tile.** Each `applyTheme()` run also calls `mirrorThemePreference()`, which copies the preference to `chrome.storage.local` as `fsbThemePreference`. The service worker draws the toolbar icon and cannot read `localStorage`. Only an explicit `light` puts the icon on its white tile; `system` keeps the black tile ([`action-icon.js`](../../extension/utils/action-icon.js) `tileFor`).
- **Delegated run.** `_applyDelegationSnapshotTone()` writes `data-delegation-state` and `data-delegation-tone`, and each tone draws a 4px left rule:

| Tone | When | Rule colour | Icon (`_delegationSemanticIcon`) |
|---|---|---|---|
| `active` | starting, running, holding | `--fsb-primary` | `fa-circle-play` |
| `warning` | held, resuming | `--fsb-warning` | `fa-hand` |
| `success` | completed | `--fsb-success` | `fa-circle-check` |
| `danger` | failed, restart_lost, stopping, or the connection is offline or disconnected | `--fsb-danger` | `fa-circle-exclamation` |
| `info` | set directly on the preparing and native-wake-checking cards | `--fsb-info` | `fa-circle-info` |
| `neutral` | anything else | `--fsb-text-muted` | `fa-circle-info` |

`_delegationToneForSnapshot()` maps snapshot states to tones. Failure cards also get `role="alert"`.

## Motion

| Motion | Selector | Timing | With reduced motion |
|---|---|---|---|
| New message | `.message.new` (`newMessage`) | 0.4s `cubic-bezier(0.34, 1.56, 0.64, 1)`, which overshoots | keeps running |
| Working dot | `.status-dot.running` (`pulse`) | 2s loop | stopped |
| Runner letters | `.pixel-letter` (`fsb-letter-cycle`); S and B wait 0.9s and 1.8s; JS lights pixels (`AUTOMATION_PIXEL_CYCLE_MS`) | 2.7s loop | stopped; `.pixel-letter-f` stays and `renderStaticAutomationPixelLetter()` lights it |
| Wake spinner | `.delegation-native-wake-spinner` | 900ms loop | stopped |
| New feed entry | `.delegation-entry-new` (`delegation-entry-tint`) | 200ms | stopped |
| Recording | `.mic-btn.recording` (`mic-pulse`) | 1.5s loop | keeps running |
| Hover lift | `.icon-btn:hover`, `.send-btn:hover`, `.mic-btn:hover` | `all 0.2s ease` | keeps running |
| Composer growth | `.chat-input.height-animating` | 140ms | keeps running |
| Scrolling | `.chat-messages` `scroll-behavior: smooth` | — | `auto` |

- **Literal timings.** Every duration is a literal; sidepanel.css uses no `--transition-*` token. See [motion.md](../foundations/motion.md).
- **Mid-run change.** `automationPixelMotionQuery` swaps a running loader onto the right path when the OS setting changes during a task.

## Copy and i18n

See [voice-and-copy.md](../foundations/voice-and-copy.md).

- **Static text** carries `data-i18n` keys (`shell_*`, `ext_name`). Tooltips use `data-i18n-attr`, for example `title:shell_history`.
- **Script-built text** goes through `spLine()`, `spHtml()`, `spAttr()` or `fsbUiLocale.markExact()`. Each English template must be registered in an exact map:
  - `EXACT` in [`ui-locale.js`](../../extension/utils/ui-locale.js), with `shell_*` keys;
  - `extra` in [`copy-exact.js`](../../extension/utils/copy-exact.js), whose keys are mostly `copy_` plus the first ten hex digits of the English text's sha256.
- **Catalogs.** Every key needs its message in [`en/messages.json`](../../extension/_locales/en/messages.json) and in every other locale folder.
- **Templates, not filled strings.** Pass the template with its `$NAME$` placeholders and subs. A pre-filled string has no key and stays English.
- **Gates.**
  - [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists sidepanel.html and sidepanel.js in `SCOPE`. A JS string that starts with a capital and has three or more words must be a catalog message. Static text must sit in a `data-i18n` or `translate="no"` element.
  - [`verify-extension-i18n.mjs`](../../scripts/verify-extension-i18n.mjs) checks keys, placeholders and the `PROTECTED` names in every locale.
- **Language.** The side panel has no language picker. It follows the control panel's choice through `fsbUiLocale.boot()` and `onChange`.

## Accessibility

See [accessibility.md](../foundations/accessibility.md).

- **Focus.**
  - `.input-wrapper:focus-within` shows `--fsb-focus-ring`.
  - Delegated controls (`.delegation-action:focus-visible` and the summaries) add a 2px `--fsb-primary` outline to the ring.
  - The header and composer buttons use `:focus` with a literal `outline: 2px solid #ff6b35`.
- **Targets.** `.delegation-action` has `min-height: 44px` and `.stop-btn[data-delegation-action="stop"]` is 44px square. At 350px and narrower, delegated actions stack full width. The 32px `.icon-btn` and the 36px composer buttons are smaller.
- **Live regions.** `#delegationAnnouncer` is `role="status"` and `aria-live="polite"`, and `#delegationRun` toggles `aria-busy`. `showAutomationRunner()` flips `#automationRunner` to `aria-hidden="false"`, which exposes its `.sr-only` label; the runner itself is `aria-live="off"`.
- **Names.** Icon-only buttons are named by their `title`.
- **Forced colours.** `@media (forced-colors: active)` maps the wake card and spinner to `CanvasText`.

## Tests that pin it

Editing a hashed file means recomputing its pinned hash in the same change. The hashes cover comments and whitespace.

| Test | What it pins | In `npm test` |
|---|---|---|
| [delegation-sidepanel-ui.test.js](../../tests/delegation-sidepanel-ui.test.js) | sha256 of sidepanel.html without the `delegation-providers.js` and `native-host-install-command.js` script lines; sha256 of sidepanel.css minus the replay block (from `.history-status.idle-closed {` to the `.sr-only` comment); `border-left: 4px solid var(--fsb-success)` and its warning and danger twins; 44px delegated actions; `.send-btn, .stop-btn` at 36px; delegation spacing limited to `0` or `var(--fsb-space-1/2/4/6/8/12)`; the reduced-motion block; exact delegated-run strings | yes |
| [delegation-phase-contract.test.js](../../tests/delegation-phase-contract.test.js) | the 350px and 500px breakpoints, `forced-colors`, reduced motion, `[data-theme="dark"] .delegation` and `--fsb-*` token use | yes |
| [sidepanel-automation-runner.test.js](../../tests/sidepanel-automation-runner.test.js) | `.pixel-loader` 8.5×11.5px, `fsb-letter-cycle 2.7s` with 12%/28%/40% stops, the letter masks in sidepanel.html, `AUTOMATION_PIXEL_CYCLE_MS` | yes |
| [sidepanel-tab-aware-smoke.test.js](../../tests/sidepanel-tab-aware-smoke.test.js) | `.fsb-foreign-owned-disabled` and the `fsb-lockout-aria-description` span | yes |
| [agent-provider-forbidden-flags.test.js](../../tests/agent-provider-forbidden-flags.test.js) | the 44px delegated action and Stop | yes |
| [extension-ui-locale.test.js](../../tests/extension-ui-locale.test.js) | static text matches the English catalog; no inline `<script>`; no language picker | yes |
| [agent-sunset-control-panel.test.js](../../tests/agent-sunset-control-panel.test.js) | no supplementary-plane characters (emoji) in sidepanel.js | yes |
| [action-icon-behavior.test.js](../../tests/action-icon-behavior.test.js) | the body of `function mirrorThemePreference(` includes `chrome.storage.local.set({ fsbThemePreference: preference })`, and `function applyTheme()` calls `mirrorThemePreference(preference);` | yes |
| [owner-chip.test.js](../../tests/owner-chip.test.js) | no `.status-dot.owned` in sidepanel.css | no |

The design checks also hold this surface. [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs) counts raw colours, z-index values, font stacks and page-local colour tokens in sidepanel.css and markdown.css.

## Known issues

- **Dark mode follows the core.** Since [0017](../decisions/0017-side-panel-uses-core-dark-surfaces.md) the input field, status pill and history rows sit at `#0d0d0d` and `#141414` with 8% hairlines, while the forced near-black rule keeps the large regions at `#050505`. Status colours soften in dark mode ([0015](../decisions/0015-status-colours-soften-in-dark-mode.md)), so the recording mic uses dark ink there. sidepanel.css is hash-pinned, so any edit recomputes the pin.
- **markdown.css uses no tokens.** Its `[data-theme="dark"] .message.system`, `.message.ai`, `.message.error` and `.message.action` rules load after sidepanel.css with equal specificity. In dark mode they replace the page's tones with literals: `.message.system` becomes `#303030`, `.message.error` `#451a1a` and `.message.action` `#1a2e1a`. Its links are blue (`#1a73e8`) and its inline code pink (`#e83e8c`).
- **44px only for delegated controls.** The header and composer buttons stay under 44px, and a test pins the composer at 36px.
- **Off-brand colours.**
  - `.login-prompt-save-label input[type="checkbox"]` sets `accent-color: #f97316`, not `#ff6b35`.
  - `--accent-color` is never declared, so `.payment-fill-confirm-btn.allow` and the confirm icon fall back to purple `#7c5cff`.
  - `--text-tertiary` is undeclared and falls back to `#666`.
  - The login and payment prompts bring their own tonal ramps: amber (`#fff7ed`, `#fb923c`, and the `--fsb-amber-400` / `--fsb-amber-800` text pair) and blue (`#eff6ff`, `#1d4ed8`, `#2563eb`). Their light-blue accents now read `--fsb-info` ([0016](../decisions/0016-indigo-folds-into-brand-orange.md)).
  - The recon button uses the brand orange, not indigo ([0016](../decisions/0016-indigo-folds-into-brand-orange.md)). Card-network labels (Amex, Discover) are fixed literals.
- **Dead selectors.** `body[data-ui-state="running"]`, `body[data-ui-state="error"]` and `body[data-sidepanel-view="history"]` style states that no script sets. `.message.ai`, the visible `.message.status-message` and `.message.completed` have no caller in sidepanel.js, so the `--ai-*` and `--status-bg` tokens paint nothing.
- **Restricted-page notice.** `showChromepageError()` appends to `#messages`, which does not exist (the list is `#chatMessages`). The notice throws instead of rendering, and its styles are inline.
- **Accessibility gaps.**
  - `#chatInput` has no accessible name and an empty `data-placeholder`.
  - `#chatMessages` is not a live region.
  - `#paymentFillConfirmOverlay` has no dialog role and does not move focus.
  - The composer and header `:focus` outlines also show on mouse click.
- **Translucent content.** `.message` carries `backdrop-filter: blur(10px)` and a resting shadow, against [elevation.md](../foundations/elevation.md).
- **Motion.** `.message.new` overshoots, against the no-bounce rule. The recording pulse and the hover lifts ignore reduced motion.

## Sources

- [`sidepanel.html`](../../extension/ui/sidepanel.html): `.sidepanel-header`, `#historyView`, `#delegationRun`, `#automationRunner`, `#chatInput`, `#paymentFillConfirmOverlay`
- [`sidepanel.css`](../../extension/ui/sidepanel.css): `:root`, `[data-theme="dark"]`, `.message.*`, `.delegation-*`, `.pixel-letter`, the `prefers-reduced-motion` block
- [`sidepanel.js`](../../extension/ui/sidepanel.js): `applyTheme`, `mirrorThemePreference`, `_setHeaderStatus`, `setRunningState`, `applyInputLockout`, `_delegationToneForSnapshot`, `addMessage`, `spLine`, `showChromepageError`
- [`fsb-ui-core.css`](../../extension/shared/fsb-ui-core.css): `:root`, `[data-theme="dark"]`, `:is(.chat-header, .sidepanel-header)`
- [`markdown.css`](../../extension/ui/markdown.css): `.md-rendered`, the dark message overrides
- [`background.js`](../../extension/background.js): `chrome.action.onClicked`, `setPanelBehavior`
- [`action-icon.js`](../../extension/utils/action-icon.js): `THEME_KEY`, `tileFor`, `TILES`
- [`ui-locale.js`](../../extension/utils/ui-locale.js): `EXACT`, `markExact`, `apply`; [`copy-exact.js`](../../extension/utils/copy-exact.js): `registerExact`
