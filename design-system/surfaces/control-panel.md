# Control panel

Status: shipped on main

## What it is

The control panel is the extension's options page: provider setup, settings, the 1Password vault, memory, logs, help and a usage dashboard.

- **Entry.** [`manifest.json`](../../extension/manifest.json) `options_page` points at [`control_panel.html`](../../extension/ui/control_panel.html).
  - The settings buttons in the [side panel](side-panel.md) and [popup](popup.md) call `chrome.runtime.openOptionsPage()`.
  - [`sidepanel.js`](../../extension/ui/sidepanel.js) `openControlPanelSection()` opens one section by hash.
  - [`options.js`](../../extension/ui/options.js) `initializeSections()` reads `location.hash`, and `switchSection()` writes it back.
- **Files.** The stylesheet is [`options.css`](../../extension/ui/options.css); there is no control_panel.css. Behaviour is in options.js, plus helpers such as [`providers-panel.js`](../../extension/ui/providers-panel.js).
- **Sections,** in rail order: `#dashboard`, `#api-config`, `#sync`, `#vault`, `#advanced`, `#memory`, `#logs` and `#help`.
  - Sync and Vault carry a `.feature-badge.beta`. Old `#passwords` and `#payments` links land on `#vault`.
  - Entering `#advanced` also shows `#consent-audit` (`switchSection`).

## Palette and tokens

The control panel uses the product palette ([0002](../decisions/0002-three-palettes-one-brand-orange.md), [color.md](../foundations/color.md)).

- **Core tokens.** It links [`fsb-ui-core.css`](../../extension/shared/fsb-ui-core.css), mirrored by [`product-surface.css`](../tokens/product-surface.css).
- **Local tokens.** options.css declares 72 local names: 57 on `:root`, 25 overrides under `[data-theme="dark"]`, and 21 on `.dashboard-container`.

| Group | Tokens | Light (`:root`) | Dark |
|---|---|---|---|
| Accent | `--primary-color`, `--primary-hover`, `--primary-light`, `--primary-color-dark` | `--fsb-primary`, `--fsb-primary-hover`, `--fsb-primary-soft`, `#ff8c42` | not overridden |
| Semantic | `--success-color`, `--warning-color`, `--error-color`, `--info-color`, their `-light` washes, `--danger` | `--fsb-success`, `--fsb-warning`, `--fsb-danger`, `--fsb-info`; washes are `color-mix` at 10% (error 8%) | the same tokens, softer in dark mode ([0015](../decisions/0015-status-colours-soften-in-dark-mode.md)): `#81c784`, `#e6b844`, `#e57373`, `#4dd0e1`; washes 14% |
| Neutrals | `--gray-50` to `--gray-900`, `--secondary-color` | `--fsb-gray-*` | not overridden |
| Surfaces | `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--card-bg`, `--hover-bg` | core surfaces | `#0d0d0d`, `#050505`, `#141414` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` | `--gray-900`, `--gray-600`, `--gray-500` | `--fsb-text-*` |
| Borders | `--border-color`, `--border-hover` | `--fsb-border-subtle`, `--fsb-border-strong` | white at 8% and 14% |
| Spacing | `--space-xs` to `--space-2xl` | 0.25rem to 3rem | not overridden |
| Motion | `--transition-fast`, `--transition-base`, `--transition-slow` | 150, 200 and 300ms `ease-in-out` | not overridden |
| Fonts | `--font-system`, `--font-mono` | the system stack; `'SF Mono', Monaco, ...` with no Space Mono | not overridden |

- **Density scale.** `.dashboard-container` sets a 14px base and re-declares `--space-*` smaller (0.2rem to 1.85rem). It adds `--dashboard-heading-xl/lg/md/sm` (1.5, 1.15, 1 and 0.88rem), `--dashboard-body-lg/md/sm` (0.92, 0.8 and 0.72rem), `--dashboard-sidebar-width` (80px) and `--dashboard-content-max-width` (1120px).
- **Dark surfaces.** A `[data-theme="dark"] body, .dashboard-container, ...` rule paints six regions `#050505`.
- **Fonts.** options.css self-hosts Poppins (100, 900) with `@font-face`, from `../assets/onboarding/fonts/`. `.version-tag`, logs and code read `--fsb-font-mono`, the platform stack ([typography.md](../foundations/typography.md), [0012](../decisions/0012-platform-mono-for-technical-text.md)).
- **Icons.** Font Awesome loads from cdnjs through the `<link>` in the control_panel.html head ([iconography.md](../foundations/iconography.md)).

## Anatomy

| Region | Selector | Contents |
|---|---|---|
| Shell | `.dashboard-container` | a column bound to the viewport |
| Header | `.dashboard-header` | `#menuToggle` (hidden), an empty `.header-center`, and the `#connectionStatus` dot |
| Rail | `aside.dashboard-sidebar` | a fixed 80px icon rail of 56×46 `li.nav-item[data-section]`; each icon has a label pill (`.nav-item > span`) that widens to 232px on hover |
| Content | `main.dashboard-content` | the only vertical scroller; one `section.content-section` per rail item, then the `#branding` version footer |
| Settings card | `.settings-card`, `.settings-card.full-width` | `.settings-card-header` (32px orange `.settings-card-icon` with a white glyph, `.settings-card-title`) above `.settings-card-content` |
| Form card | `.form-card` | the API configuration form, in `.form-section` blocks |
| Toggle | `label.modern-toggle` | a hidden checkbox, a 44×24 `.toggle-track` and an 18px `.toggle-thumb`, then `.toggle-label` and `.toggle-desc` |
| Select | `.fsb-select` | `initFsbSelects()` wraps every `.form-select` and `.chart-select` (except `.model-combobox__native`): a `.fsb-select__btn` (`aria-haspopup="listbox"`) and a `ul.fsb-select__menu` (`role="listbox"`) of `li.fsb-select__opt` (`role="option"`). The hidden native `<select>` stays the source of truth |
| Segmented control | `.detail-btn` groups | for example `#themeModeToggle` |
| Dashboard hero | `.analytics-hero` | a 135° orange gradient card with `.hero-metric` values and `--shadow-glow`, above `.chart-section` (Chart.js `#usageChart`) |
| Save bar | `#saveBar.save-bar` | fixed to the bottom: `.save-message` with `#discardBtn` and `#saveBtn` |
| Toast | `#statusToast.status-toast` | fixed top right: `.toast-text` and a `.toast-dismiss` button |

## States

- **Section.** `switchSection()` sets `.nav-item.active` (orange icon) and `.content-section.active` (`display: block`).
- **Rail hover.** CSS opens one pill. `initSidebarProximity()` then widens the neighbours too, with a Gaussian falloff (`COMPACT` 56, `FULL` 232, `SIGMA` 42). It writes inline `!important` widths and clears them on `mouseleave`.
- **Toggle on.** `.modern-toggle input:checked + .toggle-track` turns `--primary-color` and the thumb moves 20px.
- **Select open.**
  - `.fsb-select__btn.is-open` takes an orange border and `--fsb-focus-ring`, and the chevron flips.
  - `setFsbSelectCardOpen()` adds `.settings-card--select-open` (`overflow: visible`, `z-index: 20`) so the menu is not clipped.
  - Outside clicks call `closeFsbSelect()`.
- **Unsaved changes.** `markUnsavedChanges()` calls `showSaveBar()`, which slides `.save-bar.show` up. `handleKeyboardShortcuts()` maps Cmd or Ctrl+S to save, Escape to discard and Cmd or Ctrl+T to the provider test.
- **Toast.** `showToast(message, type)` sets `.status-toast` plus `success`, `info`, `warning` or `error`. The toast stays 2, 3, 4 or 6 seconds by type; success, error and warning tint the border, fill and text.
- **Connection.** `updateConnectionStatus()` sets `.status-dot.connected` (`--fsb-success`), `.disconnected` (`--fsb-danger`) or `.checking` (`--fsb-warning`, pulsing).
- **Theme.** `#themeModeToggle` is a `role="radiogroup"` of `.detail-btn[data-theme-mode]` radios: System, Dark and Light.
  - `setThemePreference()` stores the `fsb-theme` key in `localStorage`. `setupTheme()` calls it on load with the stored value.
  - It also calls `mirrorThemePreference()`, which copies the choice to `chrome.storage.local` as `fsbThemePreference`, where the service worker reads it for the toolbar icon. Only Light puts the icon on its white tile ([`action-icon.js`](../../extension/utils/action-icon.js) `tileFor`).
  - `applyTheme()` writes `data-theme` on `<html>`, and `renderThemeModeToggle()` updates `.active` and `aria-checked`.
  - `updateSystemThemeListener()` follows the OS only in System mode.
- **Narrow and print.**
  - At 1024px and below, `.dashboard-sidebar` moves to `translateX(-100%)` and `.menu-toggle` shows.
  - At 768px and below, the header wraps and the toast spans the width.
  - `@media print` hides the header, rail, save bar and toast.

## Motion

| Motion | Selector | Timing | With reduced motion |
|---|---|---|---|
| Rail pill | `.nav-item > span` | width 160ms `cubic-bezier(.2,.72,.35,1.06)`, opacity 140ms | keeps running |
| Neighbour widening | `initSidebarProximity()`, on `requestAnimationFrame` | follows the pointer | keeps running |
| Save bar, toast | `.save-bar`, `.status-toast` transform | `--transition-base` | keeps running |
| Toggle | `.toggle-track`, `.toggle-thumb` | `--transition-fast` | keeps running |
| Card hover | `.settings-card` | `all var(--transition-base)` | keeps running |
| Panel reveal | `slideDown`, `detailSlideDown` (max-height) | 200ms | keeps running |
| Checking dot | `.status-dot.checking` (`pulse`) | 2s loop | keeps running |
| Sync pill dot | `.sync-status-pill[data-state="connecting"] .dot` | 2s pulse | runs only under `no-preference` |
| Model discovery | `.discovery-status.loading::before` (`discovery-spin`) | 0.8s loop | stopped |
| Pairing countdown | `.pairing-countdown-urgent` (`pairingPulse`) | 1s scale loop | keeps running |
| Scrolling | `html` `scroll-behavior: smooth` | — | keeps running |

- **Different timings.** The `--transition-*` names are the site's, but the values (150, 200 and 300ms `ease-in-out`) are not. See [motion.md](../foundations/motion.md).

## Copy and i18n

See [voice-and-copy.md](../foundations/voice-and-copy.md).

- **Static text.** control_panel.html keys static text as `data-i18n="panel_<hash>"`, where the hash is the first ten hex digits of the English text's sha256. Dashboard, for example, is `panel_67b6964686`. A few keys are readable, such as `lang_choose`.
- **Script-built text.**
  - [`panel-exact.js`](../../extension/utils/panel-exact.js) (`panel_*`) and [`copy-exact.js`](../../extension/utils/copy-exact.js) (`copy_*`) map English to keys.
  - `showToast()` passes its message to `fsbUiLocale.markExact()`.
  - `refreshFsbSelectOptions()`, registered with `fsbUiLocale.onChange`, re-copies translated option text into the custom menus.
- **Language picker.** `#fsbUiLocaleSelect` in `#advanced`, right after the Theme card, is the extension's only language picker. [`ui-locale-page.js`](../../extension/ui/ui-locale-page.js) boots the locale, calls `mountSelect()` and then `refresh()`.
- **Gate.** [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) lists control_panel.html and options.js in `SCOPE`.

## Accessibility

See [accessibility.md](../foundations/accessibility.md).

- **Focus.**
  - `.form-input:focus` and `.form-select:focus` swap the outline for an orange border and `--fsb-focus-ring`.
  - `.fsb-refresh-icon:focus-visible` and `.fsb-stepper:focus-within` show the ring too.
- **Theme switch.** It is a radio group with `aria-checked`, and `renderThemeModeToggle()` keeps it current.
- **Model list.** The searchable `.model-combobox` is the keyboard-complete widget: arrow keys move the selection and set `aria-activedescendant`.
- **Hidden headings.** `.visually-hidden` keeps H2 landmarks where the visible heading lives in a decorated row.
- **Gaps.** Most other controls fail keyboard use; see Known issues.

## Tests that pin it

No test hashes these files. They pin rule bodies, markup and function bodies instead.

| Test | What it pins | In `npm test` |
|---|---|---|
| [control-panel-scroll-containment.test.js](../../tests/control-panel-scroll-containment.test.js) | `getCssRule()` bodies for `html`, `body`, `.dashboard-container`, `.dashboard-main` and `.dashboard-content` (`height: 100vh`, `overflow: hidden`, `min-height: 0`, `overflow-y: auto`, `overscroll-behavior: contain`); memory and explorer rows; the print block; the `#branding` `.fsb-foot-ver` placeholder and `versionLabel.textContent` | yes |
| [settings-card-select-clipping.test.js](../../tests/settings-card-select-clipping.test.js) | `.settings-card` `overflow: hidden`; `.settings-card.settings-card--select-open` `overflow: visible`, `position: relative` and a positive `z-index`; `setFsbSelectCardOpen`, `closeFsbSelect`, `setOpen(willOpen)` | yes |
| [model-discovery-ui.test.js](../../tests/model-discovery-ui.test.js) | the `.discovery-status` variants, `.model-combobox`, and `.fsb-refresh-icon` (`appearance: none`, `:focus-visible` with `--fsb-focus-ring`, disabled) | yes |
| [providers-panel-ui.test.js](../../tests/providers-panel-ui.test.js) | no `.provider-roster` or `.compatibility-badge`; `[hidden]` rules for `.agent-conn-actions` and `.test-btn` | yes |
| [remote-control-rebrand.test.js](../../tests/remote-control-rebrand.test.js) | `.feature-badge.beta` reused, at most four `.feature-badge.*` variants | yes |
| [agent-sunset-control-panel.test.js](../../tests/agent-sunset-control-panel.test.js) | no supplementary-plane characters (emoji) in control_panel.html, options.css or options.js | yes |
| [extension-ui-locale.test.js](../../tests/extension-ui-locale.test.js) | one `#fsbUiLocaleSelect` (`form-select`, `translate="no"`) inside `#advanced` after `#themeModeToggle`; static text matches the catalog; no inline `<script>` | yes |
| [action-icon-behavior.test.js](../../tests/action-icon-behavior.test.js) | the body of `function mirrorThemePreference(` in options.js includes `chrome.storage.local.set({ fsbThemePreference: preference })`, and `function setThemePreference(` calls `mirrorThemePreference(preference);` | yes |

- **First match wins.** `getCssRule()` matches the first `<selector> {` text in options.css, with no anchor. Any rule placed earlier whose text ends that way would be read instead: `.modal-body {` for `body`, or a new `.settings-card {` or `.dashboard-content {` block. Keep new rules after the pinned ones.
- **Style ratchet.** [`check-style-literals.mjs`](../../scripts/check-style-literals.mjs) counts options.css's raw values.

## Known issues

- **Filled status controls.** In dark mode the Beta badge uses dark ink on the softer amber ([0015](../decisions/0015-status-colours-soften-in-dark-mode.md)). The "Stop all" button still has white text on the softer red (2.99:1); its `#b91c1c` hover needs the white. In light mode the Beta badge's white label is 3.0:1 at 0.6rem, below AA.
- **Light text differs from the core.** `--text-primary` is `--gray-900` (`#171312`), not `--fsb-text-primary` (`#1f1a17`); secondary and muted are darker too.
- **Off-grid spacing.** The `.dashboard-container` scale breaks the 4px grid: 0.2rem is 3.2px and 0.6rem is 9.6px ([spacing-layout.md](../foundations/spacing-layout.md)).
- **Fonts.** The Poppins `@font-face` rules load for nothing: no control-panel rule uses Poppins.
- **Toasts carry errors.** `.status-toast.error` exists and options.js raises dozens of error toasts; failures belong inline, next to the control. The toast also:
  - has no live region;
  - dismisses with a bare "X";
  - shows the theme switch as the untranslated text `${mode} theme`.
- **Keyboard gaps.**
  - Rail items are `li` elements with click handlers only.
  - `.modern-toggle input { display: none; }` drops every toggle's checkbox from the tab order and the accessibility tree.
  - `.fsb-select` opens from the keyboard, but its options cannot be reached or picked, and it sets no `aria-expanded`. That leaves the language picker mouse-only.
- **No navigation below 1025px.** At 1024px and below the rail slides off-screen and `#menuToggle` appears, but no script references `menuToggle` or `dashboardSidebar`. A headless capture at 1000px shows the hamburger and no rail. The comment above `.menu-toggle, .sidebar-overlay` says the rail stays docked at every width.
- **Stale comment.** options.css calls `.fsb-select` unused, but `initFsbSelects()` builds one for every select.
- **Research pagination** uses the brand orange since [0016](../decisions/0016-indigo-folds-into-brand-orange.md); before that, an undeclared `--accent-color` fell back to indigo.
- **Colour-only status.** The header dot shows connection by colour alone; `updateConnectionStatus(status, text)` ignores `text`.
- **Untranslated titles.** "Toggle Menu", "Toggle visibility" and "More actions" have no keys; two-word attributes slip past the copy gate.

## Sources

- [`control_panel.html`](../../extension/ui/control_panel.html): `.dashboard-header`, `#dashboardSidebar`, `.nav-item`, `.content-section`, `.modern-toggle`, `#themeModeToggle`, `#fsbUiLocaleSelect`, `#saveBar`, `#statusToast`, `#branding`
- [`options.css`](../../extension/ui/options.css): `:root`, `[data-theme="dark"]`, `.dashboard-container`, `.dashboard-sidebar`, `.nav-item > span`, `.settings-card`, `.toggle-track`, `.fsb-select`, `.status-toast`, `.menu-toggle, .sidebar-overlay`, `@media (max-width: 1024px)`
- [`options.js`](../../extension/ui/options.js): `switchSection`, `initializeSections`, `initSidebarProximity`, `initFsbSelects`, `refreshFsbSelectOptions`, `showToast`, `handleKeyboardShortcuts`, `setThemePreference`, `mirrorThemePreference`, `setupTheme`, `updateConnectionStatus`
- [`ui-locale-page.js`](../../extension/ui/ui-locale-page.js), [`panel-exact.js`](../../extension/utils/panel-exact.js)
