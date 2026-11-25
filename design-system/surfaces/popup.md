# Popup

Status: shipped on main

## What it is

The popup is a compact chat launcher: the [side panel](side-panel.md)'s chat without history, delegated runs or the pixel runner.

- **Not a toolbar popup.** [`manifest.json`](../../extension/manifest.json) declares no `action.default_popup`; the toolbar icon opens the side panel. The page opens as a 400×600 window (`chrome.windows.create` with `type: 'popup'`) from three places:
  - [`background.js`](../../extension/background.js) `chrome.action.onClicked`, when `chrome.sidePanel.open` fails;
  - [`onboarding.js`](../../extension/ui/onboarding.js) `openPopupFallback()`, when Open FSB cannot open the side panel;
  - [`popup.js`](../../extension/ui/popup.js) `togglePinWindow()`, which reopens the popup as a persistent window.
- **Fixed size.** [`popup.css`](../../extension/ui/popup.css) fixes `body` at `width: 400px; height: 600px`.
- **Files.** [`popup.html`](../../extension/ui/popup.html), popup.css, popup.js, [`markdown.css`](../../extension/ui/markdown.css) for answers, and [`owner-chip.js`](../../extension/ui/owner-chip.js) for ownership labels.

## Palette and tokens

The popup uses the product palette ([0002](../decisions/0002-three-palettes-one-brand-orange.md), [color.md](../foundations/color.md)).

- **Core tokens.** It links [`fsb-ui-core.css`](../../extension/shared/fsb-ui-core.css), mirrored by [`product-surface.css`](../tokens/product-surface.css).
- **Local tokens.** popup.css repeats sidepanel.css's token block: the same 23 names on `:root` and the same 21 overrides under `[data-theme="dark"]`, value for value. The table is on the [side panel page](side-panel.md). Dark surfaces are `#050505` and `#121212`, in line with the core's near-black ramp ([0011](../decisions/0011-product-dark-is-near-black.md)).
- **Forced near-black.** A `[data-theme="dark"] body, .chat-container, .chat-header, .chat-messages-area, .chat-input-area, .author-footer` rule sets `#050505 !important`.
- **Popup-only colours:**
  - `.status-dot.owned` is `#f59e0b` and does not animate;
  - `#pinBtn.pinned` mixes `--fsb-primary` into its border and `--fsb-primary-soft` into its fill;
  - `.message.partial-result` is `#fffbeb` with a `#f59e0b` rule;
  - `.retry-btn` is a literal `#ff6b35`.
- **Type** matches the side panel: the system stack on `body`, a 16px/700 `.brand-row h1`, an 11px uppercase `.status-text` and 14px `.message` ([typography.md](../foundations/typography.md)).
- **Icons.** Font Awesome loads from cdnjs through the `<link>` in the popup.html head ([iconography.md](../foundations/iconography.md)).

## Anatomy

| Region | Selector | Contents |
|---|---|---|
| Header | `.chat-header` | `.brand-row` (`ext_name`, `.surface-subtitle` with `shell_fast_task`), `.status-indicator`, and three 32px `.icon-btn` |
| Header actions | `#pinBtn`, `#testBtn`, `#settingsBtn` | thumbtack runs `togglePinWindow()`; wrench runs `testAPI()`; cog runs `openSettings()`, which calls `chrome.runtime.openOptionsPage()` |
| Messages | `.chat-messages-area > #chatMessages` | the side panel's bubble classes (`.message.user`, `.ai`, `.system`, `.error`, `.action`, `.status-message`, `.ai-completion`) |
| Progress line | `.message.status-message .typing-dots` | three 6px `--primary-color` dots beside the status text |
| Action log | `.message.action-compact`, `.action-summary-group` | `addActionMessage()` adds compact rows; past `MAX_VISIBLE_ACTIONS` (2), `collapseOldActions()` folds older rows into a group with `.collapsed-action` items |
| Composer | `.chat-input-area .input-wrapper` | contenteditable `#chatInput` (placeholder `shell_ask` through `data-i18n-attr`), then 36px `#stopBtn`, `#micBtn`, `#sendBtn` |
| Footer | `.author-footer > .footer-meta` | the pin hint, `shell_pin_hint` |

## States

- **Header status.** `_setHeaderStatus(label, tone)` shows Ready, Working (`.status-dot.running`) or Error (`.status-dot.error`). `setIdleState`, `setRunningState` and `setErrorState` call it.
- **Running.** `setRunningState` disables `#sendBtn` and reveals `#stopBtn`. `addStatusMessage()` posts a visible `message ai status-message` line with `.typing-dots`.
- **Finished.** `completeStatusMessage()` drops the dots and relabels the line (Task completed, Error occurred). It becomes `.message.ai.completed` (an `--action-*` wash) or `.message.error.completed`, and the full answer follows in a `.message.ai-completion` bubble. Unlike the side panel, the popup has no automation runner.
- **Tab owned by an agent.** `refreshOwnerChip()` calls `_setHeaderOwner(label)`.
  - The status text becomes `FSBOwnerChip.buildChipText()` ("Owned by $LABEL$", `shell_owned_by`) and the dot turns `.owned`.
  - `#chatInput` becomes non-editable, with a title from `_ownerLockTitle()` (`shell_owned_title`).
  - `updateSendButtonState()` keeps Send disabled while `_chatLockedByOwnerChip` is set.
  - Only the popup replaces its header this way.
- **Pinned.** `togglePinWindow()` flips the `windowMode` storage key between `popup` and `pinned`. Pinning opens a new 400×600 window and closes the current one; unpinning posts `shell_switched_popup`. On load in pinned mode, `checkWindowMode()` adds `#pinBtn.pinned`, which rotates the thumbtack 45°, and posts `shell_persistent`.
- **Short windows.** `@media (max-height: 500px)` tightens the header, message and composer padding.
- **Theme.** `applyTheme()` is the side panel's: `localStorage` key `fsb-theme` (`system`, `dark` or `light`) resolved by `resolveEffectiveTheme()` into `data-theme` on `<html>`. It follows `storage` events and `prefers-color-scheme` changes.

## Motion

| Motion | Selector | Timing |
|---|---|---|
| Message entry | `.message` (`messageSlide`) | 0.3s ease-out |
| New message | `.message.new` (`newMessage`) | 0.4s `cubic-bezier(0.34, 1.56, 0.64, 1)`, which overshoots |
| Typing dots | `.typing-dots span` (`typing`) | 1.4s loop, 10px hop, 0.2s stagger |
| Working dot | `.status-dot.running` (`pulse`) | 2s loop |
| Recording | `.mic-btn.recording` (`mic-pulse`) | 1.5s loop |
| Hover lift | `.icon-btn:hover`, `.send-btn:hover` | `all 0.2s ease` |
| Scrolling | `.chat-messages` | `scroll-behavior: smooth` |

- **No reduced-motion handling.** popup.css has no `prefers-reduced-motion` query, and popup.js never checks it. Every row above runs for users who asked for less motion. See [motion.md](../foundations/motion.md).
- **Literal timings.** Durations are literals; no `--transition-*` token is used.

## Copy and i18n

See [voice-and-copy.md](../foundations/voice-and-copy.md).

- **Static text** uses `data-i18n` and `data-i18n-attr` with `shell_*` keys, like the side panel. The `<title>` is the bare brand `FSB`, with no key.
- **Script-built text.** popup.js passes English templates to `fsbUiLocale.markExact()` and `fsbUiLocale.fill()`. The templates live in `EXACT` in [`ui-locale.js`](../../extension/utils/ui-locale.js) (for example `shell_switched_popup`, `shell_testing_api`) or in [`copy-exact.js`](../../extension/utils/copy-exact.js), with messages in [`en/messages.json`](../../extension/_locales/en/messages.json).
- **Gates.** [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists popup.html and popup.js in `SCOPE`. A capitalised JS string of three or more words must be a catalog message, and static text must sit in a keyed or `translate="no"` element.
- **Owner names** are shown as sent; `_refreshOwnerCopy()` redraws them after a language change.

## Accessibility

See [accessibility.md](../foundations/accessibility.md).

- **Focus.**
  - `.input-wrapper:focus-within` shows `--fsb-focus-ring`.
  - `.icon-btn:focus`, `.send-btn:focus`, `.stop-btn:focus` and `.mic-btn:focus` draw a literal `outline: 2px solid #ff6b35` on any focus, mouse included.
- **Targets.** The header buttons are 32px and the composer buttons 36px. The popup has no 44px controls.
- **Names.** Icon-only buttons are named by their `title`.
- **No ARIA beyond the composer.** popup.html sets `role="textbox"` and `aria-multiline` on `#chatInput` and nothing else.
  - No live region.
  - No `aria-label` on the composer.
  - The ownership lock sets no `aria-disabled`, unlike the side panel's `applyInputLockout()`.

## Tests that pin it

No test hashes popup.html or popup.css. Edits are cheap, but the token block must be kept equal to sidepanel.css by hand.

| Test | What it pins | In `npm test` |
|---|---|---|
| [owner-chip.test.js](../../tests/owner-chip.test.js) | `.status-dot.owned` with `color: #f59e0b` and `animation: none`; popup.html loads owner-chip.js and has one `.status-text`; only popup.js calls `_setHeaderOwner` | no |
| [extension-ui-locale.test.js](../../tests/extension-ui-locale.test.js) | popup.html static text matches the English catalog; no inline `<script>` | yes |
| [agent-sunset-control-panel.test.js](../../tests/agent-sunset-control-panel.test.js) | no supplementary-plane characters (emoji) and no `/agent` command code in popup.js | yes |
| [onboarding-first-run.test.js](../../tests/onboarding-first-run.test.js) | onboarding keeps the `ui/popup.html` fallback URL | no |

[`check-style-literals.mjs`](../../scripts/check-style-literals.mjs) also counts popup.css's raw colours and its page-local dark tokens.

## Known issues

- **The name misleads.** This is a fallback and pinned window, not the toolbar popup.
- **Every bubble animates twice.** `.message.new` runs `newMessage`. When popup.js removes `new` after 400ms, the base `.message` rule starts `messageSlide` from opacity 0. A headless Chrome check shows `messageSlide` running after the class drops.
- **No reduced motion** anywhere on the page, and `.message.new` overshoots, against the no-bounce rule.
- **Copied tokens.** The 23-token block is a copy of sidepanel.css; nothing checks that the two stay equal.
- **Shared problems with the side panel:**
  - a dark block that differs from the core's ramp ([0011](../decisions/0011-product-dark-is-near-black.md)): `#050505` primary, `#121212` tertiary and 6% hairlines, the same values as the side panel;
  - markdown.css replacing the dark message tones with literals;
  - `showChromepageError()` appending to a `#messages` element that does not exist, so the restricted-page notice throws.

## Sources

- [`popup.html`](../../extension/ui/popup.html): `.chat-header`, `#pinBtn`, `#testBtn`, `#chatInput`, `.footer-meta`
- [`popup.css`](../../extension/ui/popup.css): `:root`, `[data-theme="dark"]`, `body`, `.status-dot.owned`, `#pinBtn.pinned`, `.typing-dots`, `@keyframes messageSlide`, `@media (max-height: 500px)`
- [`popup.js`](../../extension/ui/popup.js): `applyTheme`, `_setHeaderOwner`, `refreshOwnerChip`, `togglePinWindow`, `checkWindowMode`, `collapseOldActions`, `addMessage`, `showChromepageError`
- [`background.js`](../../extension/background.js): `chrome.action.onClicked`; [`onboarding.js`](../../extension/ui/onboarding.js): `openPopupFallback`
- [`owner-chip.js`](../../extension/ui/owner-chip.js): `buildChipText`
