# 1Password vault

Status: pending, lands with PR #172

## What it is

With PR #172, FSB stops keeping passwords and cards of its own. Logins and credit cards stay in the user's 1Password, and FSB reads one item at fill time through the FSB local server. Everything on this page is built on the PR #172 branch (`…/onepassword-vault-replacement`) and lands with that PR; none of it exists on main. Main still has separate Passwords and Payments sections (`#passwords`, `#payments` in [`control_panel.html`](../../extension/ui/control_panel.html)) over FSB's own PIN-locked vault in [`secure-config.js`](../../extension/config/secure-config.js).

| Surface | Where on the PR branch | Palette | Shown |
|---|---|---|---|
| Vault page | `#vault` in `extension/ui/control_panel.html`; `.vx-*` in `options.css`; `VAULT_VIEWS` in `options.js` | product | in the control panel |
| Side panel prompts | `showLoginPrompt`, the card check sheet and `vaultRowSpec` in `extension/ui/sidepanel.js`; `.vp` in `sidepanel.css` | product | autopilot only |
| Vault pill | `extension/content/vault-pill.js` (`.op-*`) | overlay | 1Password work over MCP |
| Credential sheet | `extension/ui/credential-sheet.html`, `.css`, `.js` (`.os-*`, `.cx-*`) | overlay black | over MCP, when nothing is saved for the site |

### How secrets move

These rules outlast any layout. [Decision 0009](../decisions/0009-secret-input-in-extension-frame.md) records the input rule. File names below are on the PR branch.

1. **One path, one machine.** 1Password (the desktop app, or a service account set up in a terminal) to the FSB local server `fsb-mcp-server` on loopback, over the paired bridge, to the extension's service worker, to one page field. Nothing is asked before pairing (`ensurePaired` in `extension/utils/onepassword-client.js`).
2. **The agent gets metadata.** Ids, titles, usernames, saved sites, card brand and last 4; `list_payment_methods` also returns the cardholder name and expiry (`mcp/src/tools/vault.ts`). Never a password, a one-time code, a card number, a security code or the service-account token. Only the CLI writes that token, to `~/.fsb/onepassword.json` with owner-only permissions, and it never crosses the bridge (`mcp/src/onepassword/config.ts`).
3. **Vaults.** FSB reads every vault the sign-in can see except transfer vaults, unless the user limits it (`vaultScope` `all` or `listed`). New logins save to the Personal vault unless the user picks another vault or "Do not save" (`pickPersonalSaveVault`).
4. **The site comes from the tab.** `tabSite` reads `chrome.tabs.get`, never a tool argument or page text; `fill_credential` ignores its `domain` parameter. The label shown is the host, plus the scheme when the page is not https.
5. **The origin is checked three times:** before the 1Password call, after it (`sameOrigin`), and in the page, where `fillOriginRefusal` in `extension/content/actions.js` compares `location.origin` with `expectedOrigin`. A tab that moved gets nothing.
6. **https stays https.** A login saved for https is never released to an http page (`websiteMatch` in `mcp/src/onepassword/domain-match.ts`, error `credential_needs_https`). Cards are read and filled only on https (`card_requires_https`).
7. **Shared hosts are separate sites.** Each customer of github.io, vercel.app, pages.dev and the rest of `PUBLIC_SUFFIXES` is its own site. 1Password's own rules apply: `AnywhereOnWebsite`, `ExactDomain`, `Never`.
8. **No guessing.** Several matches return candidates (id, title, username) instead of a fill (`multiple_credentials`).
9. **Nothing is submitted for you.** `fillCredentialFields` and `fillPaymentFields` type the values and stop.
10. **Cards ask first.** Over MCP the agent asks in its own app before the call (`confirm: 'agent'` in `_handleUsePaymentMethod`). In autopilot the side panel asks (`requestPaymentConfirmation`): one prompt at a time, its request id echoed, two minutes at most. Without a `{ shown: true }` reply it settles at once as `sidepanel_unavailable`.
11. **Secret input only in an extension frame**, never in page DOM or a shadow root. In a Chromium test, keys typed into a closed shadow root reached page listeners; keys typed into an extension frame reached nothing.
12. **The nonce goes by postMessage.** On load, the pill posts `{ fsbCredentialSheet: 'hello', requestId, nonce }` to the frame's own origin. It never goes in the frame URL, which the page can read from its resource-timing entries.
13. **Typed values ride a dedicated port.** The sheet sends them once, on Sign in, over `chrome.runtime.connect({ name: 'fsb-credential-sheet' })`, then clears its fields. The worker accepts the port only from the sheet URL, in a subframe of the asking tab, with the nonce (`sheetSenderOk`); a forged hello gets `refused`.
14. **No secret value is ever shown.** Every surface shows titles, usernames, sites and last 4 only. The sheet's eye button reveals only what the person is typing.

## Palette and tokens

- **On the page, the overlay family** ([decision 0003](../decisions/0003-overlay-accent-ff8c00.md)). The pill body is `#000000` with `#f1f5f9` text, radius 18 (20 while asking), and a 1px ring whose colour gives the meaning:

| Tone class | Means | Ring (drawn) | `--c1` (declared) |
|---|---|---|---|
| `.op.vault` | working with 1Password | white at 26% | `#e4e4e7` |
| `.op.ask` | needs you | orange at 60% | `#ff8c00` |
| `.op.guard` | refused on purpose | amber at 65% | `#f5a524` |
| `.op.err` | broken | red at 55% | `#f87171` |
| `.op.done` | done | green at 55% | `#34d399` |
| no tone | cancelled | orange at 32% | `#ff8c00` |

- **Pill details.** Filled-field chips are green (`.op-chip.ok`, text `#6ee7b7`). The track sweeps `#ff8c00` to `#ff6600`, or white in the vault tone.
- **Credential sheet.** On the pill's black: fields white at 6%, a focused field's border orange at 60%, the primary `.os-btn.go` `#ff7a1a`, focus outlines `#ffb45c`, warnings and an http site in `#fbbf24`.
- **Vault page.** The product palette through the `options.css` aliases (`--primary-color`, `--bg-secondary`, `--border-color`, `--text-*`), which come from [`product-surface.css`](../tokens/product-surface.css). The status pill is the panel's `.sync-status-pill`, `data-state` `connected`, `connecting` or `disconnected`.
- **Side panel.** `.vp` declares its own palette. Light: `--orange: #ff6b35`, `--ok: #0b7a54`, `--warn: #9a5a00`, `--err: #c23a3a`. Dark: `#34d399`, `#f5a524`, `#f87171`, and `--vault: #e4e4e7`.
- **No tokens yet.** [`overlay.css`](../tokens/overlay.css) mirrors only `visual-feedback.js`; the pill and the sheet need `--fsb-ov-*` names when they merge.
- **Type.** The system stack, with Space Mono for the agent name, timer and chips, and a wordmark of Poppins F and S with a drawn B at 0.68em. `@font-face` inside a shadow root is ignored, so the pill fetches the font files and registers `fsb-vault-mono` and `fsb-vault-poppins` on the document from their bytes, which works under any page `font-src` policy (`loadFonts`). Under [0012](../decisions/0012-platform-mono-for-technical-text.md), `fsb-vault-mono` should become the platform stack before the PR merges.

## Anatomy

- **Vault pill.** Host `<fsb-vault-pill>`, `data-fsb-overlay="vault-pill"`, full-viewport, closed shadow root, top layer with a `z-index: 2147483647` fallback. Only the top frame draws it (the `vaultPill` case in `extension/content/messaging.js`). While it is up, `suppressProgress` sets `visibility: hidden` on `#fsb-progress-host`, which since PR #173 hosts the [status pill](overlays.md).
  - `.op` sits 16px from the top and right. Width by mode: seed 56, head 176, text 248, vault 272, wide 304 (more than three chips), ask 300. The height is measured from the content.
  - `.op-top`, 36px tall: wordmark, divider, the MCP client's name, a `M:SS` timer.
  - `.op-text`: the status, 12.5px on 17px.
  - `.op-meta`, 30px: a key icon and a "who" line (title · username, title · last 4, or "typed by you · not sent to $CLIENT$").
  - `.op-chips`: one per kind of field filled: Username, Password, Code, Number, Expiry, CVC, Name.
  - `.op-track`: a 2px sweep along the bottom.
  - `.op-frame`: the sheet's iframe, 300 wide; the frame reports its height, clamped to 80–640.
  - `.dim`: a page wash, `rgba(20, 18, 14, 0.18)`, while asking.
- **Credential sheet.** `#sheet` stays hidden until the worker sends `init`, so a page that embeds the frame itself sees nothing.
  - Type mode: "Sign in"; the site row (lock and host); two 38px fields, "Email or username" and "Password" with an eye button; the "Save to 1Password" switch, or "Not saved · no vault set for new logins"; Cancel and Sign in, 36px; "Use 1Password instead".
  - Add mode: "Add it in 1Password"; the site row; "Save a login for this site in 1Password, then continue."; Cancel and Continue; "Type it here instead".
- **Vault page** (`#vault`, in place of Passwords and Payments):
  - The two existing switches, Enable Auto-Login and Enable Saved Payment Methods.
  - The 1Password card, `#onePasswordPanel`: "Log in to 1Password", an account-name field when needed, and `.vx-path`, a drawing of 1Password, the local server and this browser.
  - "Move your old FSB vault to 1Password": the old PIN, then batches.
  - Access: "Vaults FSB may read", "Save new logins to", and under Advanced, "Limit FSB to these vaults".
  - Three rule cards: Sign-in rules, Card fills, What agents see.
  - Items: Logins and Cards tabs with counts, search, Refresh, read-only lists. The canvas's Activity log is not built.
- **Side panel** (autopilot): "Which account?" when several logins match, a typed "Sign in" form, the "Fill your card?" sheet, and one result row per outcome.

## States

**Vault pill** (`viewFor` in `vault-pill.js`; `onepassword-client.js` sends each phase)

| Phase | Shows | Tone | Leaves |
|---|---|---|---|
| `checking` | "Checking 1Password" and the site | vault | at the next phase |
| `approve` | "Approve FSB in 1Password", "waiting for you", the key breathing | vault | at the next phase; sent once 1Password has not answered in 2500ms (`APPROVAL_HINT_MS`) |
| `signing_1p`, then `filled_1p` | "Signing in with 1Password" and chips, then "Filled from 1Password" | vault, then done | 3000ms after done |
| `filled_code` | "Entering the code", then "Filled from 1Password" | vault, then done | 3000ms |
| `filling_card`, then `card_filled` | "Filling card" and chips, then "Card filled · review and pay" | vault, then done | 3000ms |
| `ask` | the credential sheet; the page dims | ask | on an answer, a closed frame, or after 120000ms (`LOGIN_ASK_TIMEOUT_MS`) |
| `signing_typed`, then `filled_saved` or `filled_not_saved` | "Signing in", "typed by you · not sent to $CLIENT$", then "Filled · saved to 1Password" or "Filled · not saved" | vault, then done | 3000ms |
| `several` | "$COUNT$ logins match · $CLIENT$ will ask you" | ask | 4000ms |
| `not_https`, `card_needs_https` | "Not filled · page isn't https", "Not filled · cards need https" | guard | 4000ms |
| `page_changed` | "Page changed · nothing filled" | guard | 4000ms |
| `locked` | "1Password is locked", "unlock it to continue", no track | guard | 4000ms |
| `unreachable` | "Can't reach 1Password" | err | 4000ms |
| `cancelled` | "Cancelled · nothing filled" | none | 2600ms |

- **Sheet.** Sign in stays off until both fields have text, and while the sheet is covered, paused or sending. When the page takes focus, "Paused · click to keep typing" covers the fields. "Partly covered by the page" shows while something overlaps the sheet. "Still nothing saved for this site." answers a Continue that finds nothing.
- **Vault page card** (`VAULT_VIEWS` in `options.js`). Connected: "Logged in", or "Connected" for a service account. Connecting: "Waiting for approval", "Waiting for you", "Locked", "Declined", "Not paired", "Rate limited". Disconnected: "Not connected", "Not available", "Not reachable", "Sign-in failed", "Update needed". Each state has its own line, body and action. Disconnect always asks first (`disconnectOnePassword`); for a service account the question adds that the saved token is deleted and reconnecting needs the terminal.
- **Side panel rows** (`vaultRowSpec`): "Signed in with 1Password", "Signed in on $DOMAIN$", "Skipped the sign-in", "Card filled on $DOMAIN$", "You declined the card fill", "The card fill timed out", "Not filled on $DOMAIN$", "Page changed, nothing filled", and "1Password isn't connected" with "Open Vault settings".

## Motion

- **Pill intro.** The seed shows at once, the head at 380ms, and the latest state lands at 900ms. A phase that arrives during the intro becomes the landing state.
- **Pill morph.** Width and height take 0.52s on `cubic-bezier(0.5, 0, 0.15, 1.22)`, the status pill's growing curve; the ring 0.4s; opacity 0.26s.
- **Follow-up view.** The green "Filled" line lands 1100ms after its chips.
- **Exit.** A fade with a 14px lift and scale 0.4; the host is removed 620ms later and the status pill shows again.
- **Loops.** The track sweeps every 1.2s; the approval key breathes every 2.4s; content rises in over 0.42s (`fvIn`).
- **Side panel.** Fill card arms after 700ms, and a 2:00 countdown drains over 120000ms (`VP_PAYMENT_LIMIT_MS`).
- **Vault page.** The path drawing pings and flows every 1.6s (`vxPing`, `vxFlow`); the move bar sweeps every 1.4s (`vxBusy`).
- **Reduced motion.** The pill drops its transitions and the rise-in; the sheet drops its rise-in and pause animation; the side panel drops `vpIn` and the sheet's slide; the Vault page stops the ping, flow and busy bar. Gaps are under Known issues.

## Copy and i18n

- **Helper.** The pill's lines go through `ov()` with the `entry_vault_*` keys: 42 of them, in all eight catalogs. The sheet uses `data-i18n` and `data-i18n-attr`.
- **Gates.** On the branch, [`verify-extension-copy.mjs`](../../scripts/verify-extension-copy.mjs) adds `vault-pill.js`, `credential-sheet.html` and `credential-sheet.js` to `SCOPE`. `verify-extension-i18n.mjs` adds `1Password` to `PROTECTED`, so the name stays English in every locale.
- **Identifiers.** Font families registered from a content script are kebab-case (`fsb-vault-mono`), so the gate does not read them as copy.
- **Names.** `$CLIENT$` is the MCP client's label from the tab's visual session (`_visualClientLabel` in `mcp-bridge-client.js`); with none, the copy says "your agent". The site row is `translate="no"`.
- **Voice.** One short line, then a middle dot and the reason: "Not filled · page isn't https". Say what did not happen: "nothing filled", "not saved". Paying stays with the person: "Card filled · review and pay".

## Accessibility

- **The pill is announced.** `role="status"` with `aria-live="polite"`, or `role="dialog"` while asking; named "FSB"; not `aria-hidden`, unlike the [in-page overlays](overlays.md).
- **The sheet.** Enter in the username moves to the password, and Enter there signs in. The save switch is a button with `aria-pressed`. The eye button is named "Show password" or "Hide password". Buttons, the eye, the switch and the links show a 2px `#ffb45c` focus outline; a focused field gets an orange border.
- **Covered or distracted.** Sign in stays off unless the sheet is fully visible (`IntersectionObserver` with `trackVisibility` and a 100ms delay), and typing pauses when the page takes focus (the window `blur` listener).
- **A real prompt is provable.** While the sheet asks, the toolbar icon shows its `ask` state, an orange inset ring and key dot (`drawAskBadge` in `extension/utils/action-icon.js`), which no page can draw. It outranks every other icon motion (`RANK` `ask: 5`). The PR adds it to the icon file as it was before PR #173 rewrote it; see Known issues.
- **Not colour alone.** Every tone also changes the text.
- **Side panel.** The card sheet is `role="dialog"` with `aria-modal="true"`, and Fill card ignores clicks for its first 700ms.

## Tests that pin it

Main has none of these. Main's [`secure-config-credential-vault.test.js`](../../tests/secure-config-credential-vault.test.js) and [`vault-list-state.test.js`](../../tests/vault-list-state.test.js) pin the old vault; the PR rewrites both. On the branch:

- `tests/onepassword-credential-sheet.test.js`: the sheet port is refused for a wrong nonce, the top frame, another tab, another extension page or another extension; a second frame cannot take a bound request; fills are origin-pinned and results carry no value; saving happens only with a save vault; cancel, a closed frame, the timeout, a replacement ask and "still missing" each end cleanly.
- `tests/onepassword-client.test.js`: only the origin is sent, fills land only on it, results carry no secret, cards need a trusted approval for the same merchant, autopilot never guesses between logins, the old vault moves in batches.
- `tests/onepassword-broker.test.js`: site matching, vault scope, secret projection, card gating, saving, sign-in failure reasons.
- `tests/onepassword-mcp-errors.test.js`: the guidance an agent reads for each 1Password error.
- `tests/vault-list-state.test.js`: metadata-only lists. `tests/secure-config-credential-vault.test.js`: the old vault still decrypts once for the move, then is erased.
- `tests/action-icon-behavior.test.js`: the icon's fifth state, `ask`.
- The copy and i18n gates above.

## Known issues

On the PR branch, not on main:

1. **The tone colour is never drawn.** Each tone sets `--c1`, but nothing reads it; only the ring shows the state.
2. **Reduced motion still moves.** The track keeps sweeping, slowed to 2.4s, and the approval key keeps breathing.
3. **The pill blocks clicks.** `.op` takes pointer events in every mode, so even a status line covers the page's top-right corner. The status pill is click-through except its Stop button (`.pl-stop`).
4. **A fourth orange.** The sheet's primary button is `#ff7a1a`, in neither the product nor the overlay family.
5. **The side panel's typed login uses `sendMessage`.** Its autopilot form sends the values with `chrome.runtime.sendMessage` (`loginFormSubmitted`), which every extension context receives. The port rule covers only the on-page sheet.
6. **The copy says less than the tool returns.** "What agents see" and `skills/fsb/references/vault-boundary.md` list titles, usernames, sites and last 4; `list_payment_methods` also returns the cardholder name and expiry.
7. **Names and labels.** The frame's title is "FSB". The sheet's fields have only an `aria-label` and a placeholder, no visible label.
8. **Page-local palettes.** `.vp` and the `.vx-tag` literals (`#047857`, `#b45309`) fork the product tokens; the style-literal ratchet counts them.
9. **Weight.** `fsb-vault-poppins` registers the Poppins 100 file as weight 200.
10. **Covering check.** Where `isVisible` is not supported, the check falls back to plain intersection.
11. **The `ask` state is built on the old icon.** The branch forks from main before PR #173 (merge base `f6c4c9441`), and PR #173 rewrote [`action-icon.js`](../../extension/utils/action-icon.js). The rewrite cuts the frames to the artwork's rounded corners and draws the ring along them (`tilePath`). An explicit Light theme puts every form on a white tile (`TILES`). `getMotion` hands each tab's form to the status pill from its `watch:`, `capability:` and `session:` claims only. The PR's `drawAskBadge` strokes a square ring (`ctx.rect`) in a file with no tiles and no corner cut. A three-way merge of the branch tip onto PR #173 conflicts in `action-icon.js` and `messaging.js`.

## Sources

- PR #172, read with `git show`: `extension/content/vault-pill.js`; `extension/ui/credential-sheet.html`, `.css` and `.js`; `extension/utils/onepassword-client.js`; `extension/content/actions.js` (`fillOriginRefusal`); `extension/content/messaging.js` (`vaultPill`); `extension/ws/mcp-bridge-client.js` (`_vaultPillHooks`); `extension/ui/control_panel.html` (`#vault`), `options.css` and `options.js`; `extension/ui/sidepanel.js` and `sidepanel.css`; `extension/utils/action-icon.js` (`ask`); `mcp/src/onepassword/domain-match.ts`, `broker.ts` and `config.ts`; `mcp/src/tools/vault.ts`; `skills/fsb/references/vault-boundary.md`.
- Read at the local branch tip `c3c162888`, ten commits ahead of the PR head `497072c67`. The all-vaults default and the one-button Vault page come from those commits.
- Main, for comparison: [`control_panel.html`](../../extension/ui/control_panel.html) `#passwords` and `#payments`, [`secure-config.js`](../../extension/config/secure-config.js), [`vault.ts`](../../mcp/src/tools/vault.ts).
- PR #173, the code PR #172 lands on: [`action-icon.js`](../../extension/utils/action-icon.js) (`TILES`, `tilePath`, `RANK`, `getMotion`) and [`visual-feedback.js`](../../extension/content/visual-feedback.js) (`#fsb-progress-host`, `.pl-stop`).
- The "FSB · 1Password vault" design canvas ([sources.md](../sources.md)): Main, VaultStates, SidePanel, Overlay, OverlayStates, CredInput, CredWhere and Security. The Notes board reviews the PR and is not a source of rules. The canvas's mock data is personal and is not copied here.
- Related: [In-page overlays](overlays.md), decisions [0003](../decisions/0003-overlay-accent-ff8c00.md), [0006](../decisions/0006-overlays-in-shadow-dom-top-layer.md) and [0009](../decisions/0009-secret-input-in-extension-frame.md).
