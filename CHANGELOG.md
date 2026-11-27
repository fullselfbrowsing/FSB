# Changelog

All notable changes to the FSB product (Chrome extension + showcase site) are documented in this file. Entries are organized by FSB milestone. The extension version is `0.9.99`; milestone versions such as `v0.11.0` and `v0.12.0` are the meaningful release units.

The independently published `fsb-mcp-server` npm package keeps its own semver changelog in [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).

## v0.9.99 — While We Were Here — 2026-11-26

The extension, showcase, skill, documentation, and store metadata align at `0.9.99`. The independently versioned `fsb-mcp-server` advances to `0.95.0` with the native-host installer and the 1Password broker; see [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md#v0.95.0). The jump from 0.11.5 is a numbering choice: 0.95.0 still sorts above every 0.11.x release, so existing helpers are refreshed. `fill_credential` gains an optional `credential_id`, `use_payment_method` caps `payment_method_id` at 140 characters, and a new `settings` tool reads and changes the Control Panel's settings; the other MCP tool schemas are unchanged. The extension's new `onepassword.*` bridge requests are answered by the hub and never reach a relay, and the extension asks for no new permissions.

### Added

- **One MCP tool for every Control Panel setting.** The new `settings` tool lists every setting with no arguments, shows one with its type and allowed values given a `key`, and changes it given a `key` and a `value`. It covers the 35 settings the Control Panel stores, from the provider and model to limits, toggles and the interface language, and writes them under the same storage keys and rules as the panel, so autopilot, `run_task` and an open Control Panel use the new value at once. An open Control Panel shows an MCP change in place, and its next Save keeps it unless you edited that field yourself. API keys read only as set or empty and endpoints only as their origin, and neither can be changed over MCP. Five safety switches move one way only: auto sign-in and saved payments can be turned off but not on, session recording can be turned on but not off, the session retention can only be raised, and telemetry can only be opted out of. Delegated autopilot runs can read settings but not change them, and every change goes into FSB's logs with the client that made it.
- **The progress card is now a status pill.** The in-page card becomes a compact pill: the FSB wordmark, the agent name and a timer on top, the status underneath, never wider than 248px. It spawns from a seed, folds to its top line 2.6 seconds after an action ends, and opens a third row for a capability call, a blocked site, or the agent ID on hover. Done fills the track green, holds for 3 seconds and plays the spawn backwards; a new call during the exit brings it back. The pill plays the toolbar icon's motion (sweep, orbit, ring, breathe) from the icon's own clock, also when an MCP host leaves out `tab_id` for the one tab it owns; with reduced motion on, the motion holds still. The viewport glow fades in and out with the pill and stays up between calls while a session runs.
- **Onboarding flies through depth planes.** Each wizard step is a plane on the z axis. Choosing a card or button flies the camera through it, and a step rail replaces the stepper. Rail ticks go forward as well as back, as far as Next would, and stop at a step that still needs an answer. Swipes, the arrow and Page keys, Space, the buttons and the rail move between steps; the mouse wheel no longer does. The welcome cue reads "Begin", and every step rests at 95% of its fitted size. The agent path names Grok Bot, Muse, Dots, OpenClaw and Hermes with their marks, and the MCP client list shows Gemini CLI in place of OpenClaw. New copy is in all eight extension languages.
- **The toolbar icon matches the rest of FSB.** Its corners are rounded like the showcase tiles (a radius of 30/128 of its side) in every state and animation, cut with the static icon's own alpha. Choosing Light in FSB's settings moves the icon onto a white tile with a hairline edge, so it still shows on a white toolbar; System and Dark keep the black icon. The Store listing and manifest icons are unchanged.
- **Five showcase pages are 3D depth pages.** Home, about, agents, privacy and support place their sections on planes along the z axis, and scrolling moves the camera through them. A plane taller than the window scrolls inside itself first, a desktop swipe moves exactly one plane, and on an iPhone tapping a rail entry gives a haptic tick.
- **A hosted Jev decision gateway on the FSB server, off by default.** `POST /api/jev/decide` answers a typed 503 "disabled" before reading any body unless `JEV_ENABLED` is true and its upstream, model and credential are valid, so current installs see no change.
- **One-time codes.** `fill_credential` fills two-factor code fields (including split one-digit boxes) with the current TOTP code from the matching 1Password item.
- **Typing a login when 1Password has none.** With nothing saved for the site, `fill_credential` asks the user on the page to type a login once, in an FSB frame the page cannot read, and optionally save it to 1Password. The call waits up to 2 minutes; a success reports `by: "you"` and `savedTo1Password`, never the values, and a decline returns `credential_not_provided`. Autopilot offers the same through the side panel.
- **A status pill for 1Password work over MCP.** The page shows when FSB is checking 1Password, waiting for an approval, filling fields or a one-time code, filling a card, or was refused, and the toolbar icon shows a key badge while the page asks the user for something.
- **`fsb-mcp-server onepassword`** configures the connection from a terminal: `--desktop <account>`, `--service-account` (token read hidden or from `OP_SERVICE_ACCOUNT_TOKEN`), `--vaults`, `--allow <ids>`, `--all-vaults` (back to every vault, the default), `--save-vault <id>`, and `--reset`. Service accounts are for headless use and are set up only here, not on the Vault page, which shows a configured one as connected with Disconnect. They cannot read Personal vaults, so they need `--save-vault` for "Save to 1Password". Settings live in `~/.fsb/onepassword.json` with owner-only permissions; tokens are never accepted from the extension.
- **Moving the old FSB vault.** Existing users see how many logins and cards are left in the old vault and can move them into the 1Password save vault with their old PIN. The move goes in batches of 10, and each batch is erased from FSB as soon as 1Password confirms it; "Delete old vault" erases the rest. If 1Password stops partway (a rate limit, an expired session, or a slow connection), the move keeps what was saved and leaves the rest for the next attempt, so a retry does not create those entries again. One click moves for up to two minutes; a larger vault finishes on the next click. Old logins for IP addresses and single-label hosts such as `localhost` are saved with `http://`, all others with `https://`.

### Changed

- **Installing FSB into an MCP client also sets up the local helper.** `fsb-mcp-server install` for any client whose config file FSB writes now registers the native messaging host the extension uses to start its local agent service, in each browser where FSB is installed, and FSB's server keeps that helper current when it starts. `--no-native-host` skips it, uninstalling the last client removes a helper that `install` set up unless the extension has run delegated agents through it, and `uninstall --native-host` removes it outright. The extension's repair command, `install --native-host` with the extension ID, is unchanged. See [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md#v0.95.0) for the installer details. It ships in `fsb-mcp-server` 0.95.0.
- The Grok Bot plugin launches `fsb-mcp-server@0.95.0`; it previously pinned 0.11.5.
- The published MCP tool count is 70 with `settings`.
- **The privacy policy says how the helper gets registered.** The Local Agent Service section now says the messaging host is registered only when you run `fsb-mcp-server install`, either for an MCP client or with `--native-host`. Adding a client registers it in each browser where FSB is installed, or in Chrome when none is found; `--native-host` registers Chrome unless you pass `--browser`. Each registration names one permitted extension origin. It also says that FSB's local server only refreshes a host that is already registered and never registers one, that the extension cannot install it, and how to skip or remove it.
- **The privacy policy describes 1Password.** A new Connecting 1Password section says what `~/.fsb/onepassword.json` holds, including a service-account token stored unencrypted if you set one up, what Disconnect deletes, and that old vault entries stay until you move or delete them. Logins from 1Password and Payment Cards from 1Password replace the PIN vault's sections: the AI sees titles, sites, usernames, card brand, last four digits, cardholder and expiry, never passwords, one-time codes, card numbers or CVVs, and over MCP FSB shows no card prompt of its own.
- **The privacy policy dates the retirement.** The Remote Dashboard and PhantomStream disclosure now applies to v0.9.95 and earlier. The Background Agents section no longer says builds up to v0.9.95 reached the relay only after pairing: from v0.9.31 they registered a key and connected at every browser start.
- These privacy changes are one update, dated November 27, 2026, in all eight site languages. The September 29, 2026 policy is archived under Policy History.
- The consent note on a blocked site reads "Blocked. This site needs your approval before FSB can act here."
- The manifest gains three web-accessible resources: the two Poppins faces of the 1Password pill's wordmark, and the 1Password login sheet page.
- **1Password replaces FSB's own password and card vault.** FSB no longer stores logins or cards. `fill_credential`, `use_payment_method`, their list tools, and autopilot's auto-login read the user's 1Password. The `fsb-mcp-server` local server signs in with the 1Password JavaScript SDK (`@1password/sdk` 0.5.0, now a pinned production dependency) and passes values to the extension over the paired loopback bridge. Passwords, one-time codes, card numbers, and CVVs are never returned to MCP clients or the model.
- **One Vault page with a "Log in to 1Password" button.** The control panel's Passwords and Payments pages are now one Vault page, and old `#passwords` and `#payments` links land on it. Its single **Log in to 1Password** button connects the 1Password desktop app. It does not remove the steps 1Password requires; it walks through them. When the app is missing, the page links to the download. When 1Password's **Settings > Developer > Integrate with 1Password SDKs** setting is off, FSB opens that pane (`onepassword://settings/developers`) and continues once the setting is on; on a managed device an administrator may have to allow it. FSB may ask for the account name shown at the top of the 1Password sidebar, and the user approves FSB in the 1Password app. 1Password asks for that approval again after 10 idle minutes, after the app locks, and after the local server restarts, and the Vault page says so. Once approved, the page lists the logins and cards FSB can use, read-only: adding, editing, and deleting happen in 1Password.
- **All vaults by default, with an optional limit.** FSB reads every vault the 1Password account can see, except transfer vaults and vault types the SDK does not support. A vault limit under Advanced on the Vault page, or `fsb-mcp-server onepassword --allow <ids>`, narrows that to the chosen vaults; **Use all vaults** or `--all-vaults` goes back to every vault. "Save to 1Password" writes new logins to the Personal vault unless another save vault is chosen; when 1Password reports no Personal vault, the Vault page asks for one. The login prompt offers "Save to 1Password" only while FSB has a save vault it can read. The list tools cover every vault in scope, so `list_payment_methods` also returns cards kept in shared vaults, each with its cardholder name and expiry.
- **Logins follow 1Password's own site rules.** A login is filled only on a site one of its saved websites matches, honoring the item's "Anywhere on website", "Only exact domain", and "Never" autofill setting. A login saved for an `https://` website is never filled on a plain-`http://` page, and the result says so (`credential_needs_https`). The site always comes from the agent's tab URL; the `domain` argument some agents still send is ignored. When several logins match, `fill_credential` fails with the candidates (id, title, username, and the vault that holds each) and accepts a new optional `credential_id` to choose one. The in-extension autopilot never guesses either: when several logins match, the side panel asks the user to choose an account, naming each one's vault. A login is not typed if the tab navigates to another origin while 1Password is answering, and logins saved for one customer of a shared host (`github.io`, `vercel.app`, `netlify.app`, `pages.dev`, and similar) are not offered on another.
- **Card fills.** `use_payment_method` reads only card metadata until it is about to fill, fills only `https` pages (`card_requires_https` otherwise), and refuses if the tab's origin (scheme, host, or port) changes at any point before the fill. Over MCP, FSB shows no prompt of its own: the agent asks the user in its own app before calling the tool. In autopilot, the side panel asks, one card prompt at a time, and a closed side panel refuses the fill at once instead of waiting 2 minutes. Billing addresses stored on the 1Password card now reach checkout forms.
- **Every 1Password error has its own agent guidance.** Each 1Password error code has its own text and keeps its code in the result, instead of falling back to a generic "page navigation, retry" message. After the user declines a login or a card, the agent is told not to retry and to ask the user how to continue.
- **Dark mode is near-black on every product page.** The control panel, side panel and popup share one set of dark surfaces (`#050505` to `#141414`) with white hairlines at 8% and 14%; text stays warm.
- **One red, one green and one amber.** Product pages use `#dc2626`, `#10b981` and `#d97706` for status, softened in dark mode to `#e57373`, `#81c784` and `#e6b844` (info `#4dd0e1`). The indigo accents (the recon button, research pagination, the AI memory badge) become the brand orange, and brand-orange washes use four steps: 8, 12, 24 and 40%.
- **Technical text uses the platform monospace fonts.** Labels, timers, versions and code in the extension and on the showcase draw in the system's own monospace font (Monaco on macOS). The Space Mono web font is removed from both, along with the showcase's Google Fonts request for it.
- **The design system lives in the repo.** `DESIGN.md` and `design-system/` hold FSB's tokens, palettes, type, motion, surface pages and design decisions. `npm run test:design`, also part of `npm test`, keeps the shipped tokens and their documented twins equal and holds raw colours, z-indexes and font stacks to a per-file baseline that may only fall.
- **fsb-server keeps old installs quiet instead of refusing them.** Installs still on v0.9.95 or earlier keep dialing the relay and would dim their toolbar icon if it disappeared. `/ws` now holds their sockets open: it answers their keepalive ping and discards everything else without reading or storing it. Every other upgrade gets `410 Gone`, as do `/api/auth/*` and `/api/pair/*`, except that `POST /api/auth/register` hands a keyless old install a random throwaway key, which is never stored, so it opens a quiet socket instead of retrying every 30 seconds. The sink logs one aggregate count an hour and goes away once that count nears zero. The pairing and hash-key tables keep their existing rows; nothing new is written to them.
- The showcase CSP no longer allows scripts from unpkg.com, the camera permission policy is off, and CORS no longer exposes `X-FSB-Hash-Key`; only the dashboard used them.

### Fixed

- **One click on a toggle counts as its effect.** Click verification now reads a toggle's own state: `aria-checked`, `aria-pressed`, `aria-selected`, `data-state`, `open`, `checked`, a clicked label's control, a summary's details, the nearest toggle-like ancestor, and the target's text. A correct single click on a switch no longer reads as an unconfirmed outcome that invites a second click and flips it back, including a click on a label with no control inside a switch row. The synthetic mouse events are composed, so listeners outside a shadow root see them.
- **Onboarding key checks can't be overtaken.** Only the newest connection check may change the step, so an answer for a provider or key that has since changed is ignored. A rail tick can no longer skip an API key, LM Studio URL or model that was edited after it validated, and choosing another LM Studio model clears the previous model's check in place. The step rail no longer covers a step's controls between 360 and 1050px.
- The toolbar icon's 30-second watchdog no longer restarts a running animation, so the icon and the status pill stop jumping back to their first frame.
- The viewport glow fades out when a session ends instead of vanishing while the pill still holds Done, and an action that finishes after the session ended no longer brings it back.
- The status pill finishes its exit when a trigger pulse arrives, and ordinary mouse moves across the page no longer close its hover row.
- The showcase's FSB wordmark renders in Poppins. The site's content security policy refused Google Fonts, so the F and S drew in the system font.
- The showcase concierge footer shows the current extension version instead of 0.9.90.

### Removed

- The PIN vault, its unlock page, and the saved-payment unlock in the extension. `secure-config.js` keeps only a read-once reader for moving old entries to 1Password.
- **The Live Dashboard is retired.** The showcase `/dashboard` page is gone, along with pairing a browser to it (hash key and QR code), the live DOM preview, remote control from the web, and starting tasks from the dashboard. v0.9.95 is the last version that has them. `/dashboard`, `/dashboard/`, `/dashboard.html` and their localized forms now redirect permanently to the matching home page, and the support FAQ's remote-control answer is gone.
- **The extension no longer keeps a connection to full-selfbrowsing.com.** It no longer registers a hash key, opens the `wss://…/ws` relay at install and startup, streams pages, or accepts remote input. The control panel's Sync tab is gone, and the toolbar icon no longer dims when that relay is unreachable; its animations are unchanged. The relay's 20-second keepalive also kept the service worker awake on every install, so the worker now goes idle like any other MV3 worker when no session, MCP bridge, or trigger needs it.
- **An update cleans up what older versions left behind.** On update the extension deletes `serverHashKey`, `serverUrl`, `serverSyncEnabled` and `fsbActionIconRelaySeen` from storage and clears the `fsb-domstream-watchdog` alarm, the same way v0.9.95 cleaned up after background agents.
- **The background-agents retirement note is gone.** It used to sit in the Sync tab, and background agents left in v0.9.45rc1, so the note left the control panel along with the tab.
- **The FSB dependency on `@full-self-browsing/phantom-stream` is gone.** PhantomStream continues as a standalone open-source library, and its showcase page stays.

## v0.9.95 — Multilingual Extension Interface and Official Cline Support — 2026-10-18

The extension, showcase, skill, documentation, and store metadata align at `0.9.95`. The independently versioned `fsb-mcp-server` advances to `0.11.5` with the accompanying Cline and Antigravity installer fixes, Grok Build capability checks, and the removal of three dead tools; see [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md) for its package-specific release notes and compatibility requirements. The language work leaves MCP tool schemas and bridge messages unchanged.

### Added

- **The extension interface reads in eight languages.** The side panel, popup, control panel, onboarding, unlock, and microphone-permission pages render in English, Spanish, German, Russian, Japanese, Korean, Simplified Chinese, and Traditional Chinese, and so do the in-page overlay's own controls, status pill, and replay-speed caption. Each language ships a catalog of 1,285 keys in `extension/_locales/`; a message missing from a catalog falls back to English instead of leaving a blank label.
- **The interface language follows Chrome's language list.** Without a saved choice, FSB goes down Chrome's preferred languages (Settings › Languages) in order and uses the first one it supports. English counts, so English-first users stay in English. Regional variants map to the nearest catalog: `es-MX` opens in Spanish, `ru-RU` in Russian, `zh-TW`, `zh-HK`, and `zh-MO` in Traditional Chinese, and `zh-CN` and `zh-SG` in Simplified Chinese. A plain `zh` entry follows the computer's time zone, opening in Traditional Chinese in Taipei, Hong Kong, and Macau and in Simplified Chinese everywhere else. Ukrainian, Belarusian, and Kazakh are not mapped to Russian. When nothing in the list is supported, FSB uses Chrome's UI language, then English.
- **A language picker in Advanced Settings switches without restarting Chrome.** The control panel's Advanced Settings › Appearance group carries a Language card next to Theme that lists every language by its own name. The choice is saved in `chrome.storage.local` under `fsbUiLocale`, and open FSB pages and in-page overlays re-render as soon as it changes. Choosing Automatic clears the saved choice, so FSB follows Chrome's language list again.
- **The extension's name and description follow the browser language.** The manifest declares `default_locale` and reads its name and description through `__MSG_ext_name__` and `__MSG_ext_description__`. Chrome resolves them in the browser's UI language, so the picker inside FSB does not change them, and the control panel says so beside the picker. The name on `chrome://extensions` is now `FSB`, without a version suffix.
- **Catalog gaps fail CI.** `scripts/verify-extension-i18n.mjs` fails on a missing key, an empty message, mismatched placeholders between languages, unreviewed copied English, or a dropped protected term such as FSB; `scripts/verify-extension-copy.mjs` fails when one of the 13 in-scope UI files keeps package-owned English outside the catalogs. Both run at the start of `npm test`, so a new key has to land in all eight catalogs in the same change.
- **The showcase adds Russian.** Every page is served in Russian under `/ru/`, the header language picker lists Русский, the sitemap and `hreflang` sets carry the Russian variant of each marketing route, and an `Accept-Language` of `ru` (any region) or a saved `fsb-locale=ru` cookie opens the Russian site.
- **Release notes for 0.9.95 on the showcase.** The release-notes page documents this release in all eight site languages.
- **Cline is an officially supported MCP client.** The onboarding and showcase install pickers offer `install --cline` with the Cline logo, and the READMEs document Cline's shared settings file. A Cline session is labeled Cline on the owner chip and in the client inventory whether it connects from the VS Code extension or the SDK-based Cline CLI, and anonymous usage stats count it as Cline instead of `unknown`, with the same conservative cost fallback as other bring-your-own-model clients. The companion installer fix ships in `fsb-mcp-server` 0.11.5.
- **Antigravity replaces Windsurf as an install target.** Onboarding and the showcase install pickers offer `install --antigravity` with the Antigravity logo in Windsurf's place, and an Antigravity session is labeled Antigravity on the owner chip and in the client inventory.
- **Muse, Grok Bot, and Dots are allowed client labels.** Always-on agents can send `client: "Muse"`, `"Grok Bot"`, or `"Dots"` on action tools, and anonymous usage stats count them under those names instead of `unknown`. The MCP server accepts them from 0.11.5.
- Sanitized Grok Build 1.0.62 inspection and initialization fixtures, future-version regression coverage, and a weekly/manual macOS/Linux compatibility check against the official stable CLI without credentials or inference.

### Changed

- The Grok Bot plugin launches `fsb-mcp-server@0.11.5` and sends `client: "Grok Bot"`; it previously pinned 0.11.0 and sent `client: "Grok"`.
- The extension's own autopilot uses the client label `Autopilot` instead of `FSB Autopilot`, so its page overlay badge reads "Autopilot".
- Windsurf is no longer an install target or an allowed `client` label, and its default-model cost row is gone. The telemetry server still accepts Windsurf from extensions older than 0.9.95.
- Every published MCP tool count now says 69 and is checked against the built server, so the README, onboarding, showcase and `llms` figures can no longer disagree.

### Fixed

- **drag_drop finds its elements and follows a real drag.** It called a lookup that does not exist and read only `sourceRef`/`targetRef`, so CSS selectors, snapshot refs, and Autopilot's `sourceSelector`/`targetSelector` all failed. Elements now resolve through `FSB.resolveRef` and the shadow-aware selector lookup, either parameter name works, and a stale ref is refused. The HTML5 method follows what Chrome does: a drop comes only after a dragover the page cancelled, a refused drag gets dragleave and dragend, events carry coordinates and cross shadow boundaries, links and images carry the data a browser sends, and pointer events set `isPrimary` for dnd-kit. A move counts only when the source crosses the target or closes half the gap; a page that reacted without moving the element returns success with a warning, and a delivered drop with no visible result returns `outcome: 'unknown'` with `mayHaveExecuted`. The pointer and mouse methods no longer run after a drop that worked.
- **Hung pages recover on Chrome 156.** Chrome 156 refuses `Runtime.terminateExecution` to extensions, so `navigate` could no longer stop a runaway script and ran into its `PAGE_UNRESPONSIVE` deadline. When termination is refused, recovery now crashes the hung renderer with `Page.crash` before requesting the navigation; the destination commits in a fresh renderer and the tab keeps its id. A long task gets one more second first, because a crash also takes down any tab sharing the renderer, and the responsiveness probe no longer mistakes an idle page that is still parsing for a hung one. Once a navigation is pending, nothing an extension can do frees the tab on Chrome 156, so that case still ends at the deadline. Recovery logs whether Chrome refused the crash request.
- **Leaving a page that is still loading no longer fails the navigation.** The outgoing page's own aborted load was reported as `navigation_failed` / `net::ERR_ABORTED` with `mayHaveExecuted: false` even though the destination had loaded. Errors reported under the outgoing document are now ignored; a real failure still fails at once.
- Grok Build compatibility is verified through its ACP capabilities and isolated runtime instead of an exact CLI version pin. Compatible future releases can run without an FSB update; sandbox, isolation, and protocol refusals now retain their actual cause in provider status and connection tests.
- Grok's provider badge reports **Verified** after runtime checks and drops stale version-only success evidence. Updating the integration preserves the private OAuth profile and owned-session journal.

### Removed

- **What background agents left behind.** Background agents were retired in v0.9.45rc1, but their saved definitions stayed in `chrome.storage.local['bgAgents']` and several thousand lines of commented-out agent code stayed in the extension and both dashboards. When the extension updates, it now deletes `bgAgents`, the `fsb_sync_queue` sync queue and any scheduled `fsb_agent_*` alarms. The control-panel list of old agent names, the commented-out code, and the unused `executeAutomationTask` entry point are gone.
- **Agent sync endpoints on the server.** `/api/agents` and the agent-only `/api/stats` route are removed from `showcase/server`, and the agents, stats and SSE routers from `server-py`. The `agents` and `agent_runs` tables are kept, so previously synced rows are untouched.
- **Three MCP tools.** `start_visual_session`, `end_visual_session` and `back` are no longer registered, leaving 69 tools; see [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).

### Unchanged

- Only FSB's own words are translated. Prompts, model output, task titles, page content, secrets, logs, and provider names appear exactly as written.

## v0.9.92 — Bridge Reliability and Editing Fixes — 2026-10-07

The extension, showcase, skill, documentation, and store metadata align at `0.9.92`. The independently versioned `fsb-mcp-server` advances to `0.11.1` with the accompanying patch; see [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md) for its package-specific release notes and compatibility requirements.

MCP-only update (2026-10-14): the package advances to `0.11.2` to advertise the FSB dark logo. The extension remains at `0.9.92`.

### Fixed

- **The bridge no longer dies until you restart Chrome.** The local bridge keeps a single extension socket, and it was freed only when that socket closed itself. An extension whose service worker died without the socket closing therefore held the slot indefinitely, and every legitimate reconnect was refused — one episode in the field ran 13,328 refusals over roughly 25 hours, ending only when the browser quit. The extension could not learn from any of it: its `onclose` handler discarded the close code, and because the WebSocket upgrade *succeeded* before the refusal arrived, `onopen` reset the reconnect backoff on every cycle, so it retried at a flat two seconds forever. The bridge now reaps a socket that stops answering both protocol pings and its own heartbeat; the extension reads the close code, escalates its backoff toward the 30-second ceiling instead of flattening it, and drops a pairing credential the bridge has explicitly rejected rather than replaying it until the browser exits.
- **Keepalive actually detects a dead peer now.** The extension sent a ping every 25 seconds and never looked at the reply; the reply itself was discarded by a handler that only accepted the delegation heartbeat's three-key form. Neither end could notice a half-open socket. Unanswered pings are now counted and close the socket, which hands it to the existing reconnect path.
- **Servers exit when their host does.** `fsb-mcp-server` listened only for SIGTERM and SIGINT, so a host that exits by closing the pipe left a fully working server running forever. Because the bridge port is claimed once by a bind race and never re-attempted, the bridge owner drifted into being the oldest surviving orphan rather than a process anyone was still talking to. The server now shuts down when its stdio pipe closes.
- **A pairing mismatch says so.** An extension id that does not match the pinned pairing was refused with a bare HTTP 403 — no WebSocket, no close code, no reason — which is why the failure so often ended in a reinstall that could not fix it. The refusal now names both origins and the `pair --reset` cure, and `doctor` reports an authorization layer instead of blaming the browser.
- **The bridge keeps a journal.** Refusals, revocations, replacements, reaps, and closes are recorded in `~/.fsb/agent-runtime/bridge-events.jsonl`, coalesced so a retry loop leaves one line a minute rather than tens of thousands. Previously every bridge diagnostic went to the stderr of whichever server won the port race, which was frequently a session that had already exited.
- **`sw_evicted` no longer hides the real cause.** Authorization failures were reported to callers as a service-worker eviction, sending everyone to restart the browser. The recovery is unchanged — the task really was interrupted — but the response now carries a `disconnect_reason` that distinguishes a revoked credential from an evicted worker.
- **The dashboard relay stops replacing itself every two seconds.** `connect()` closed the socket it already had, but that socket's `onclose` still scheduled a reconnect, which closed the new socket in turn — so a single extra `connect()` while connected (a Sync-tab key save triggers one) left two sockets swapping places for as long as the browser ran. Every installation connected to the production relay was in this loop, and the toolbar icon dimmed on every swap, which read as a gray pulse. Socket handlers now act only while they still own the connection, and a socket that is already open or opening to the same room is kept.
- **Every action runs at most once.** A click is dispatched once and never repeated by a retry layer, and a mutation whose delivery is uncertain is reported as uncertain instead of being sent again. The opposite mistake is fixed too: an action that provably never reached the page — including one aimed at a tab that no longer exists — was labelled as possibly executed, so agents were told to inspect the page before retrying a click that never happened. It is now reported as not executed and retryable. Text insertion targets an explicit position and lands at most once.
- **Typing into code editors lands where you asked.** Appending to Monaco, Ace, or CodeMirror (`clear_first: false`) inserted the text at the editor's old cursor, usually before the existing code, because those editors ignore the page's text selection. FSB now moves the editor's own cursor with its end-of-document shortcut, and replacing text also works in editors such as Monaco 0.57 that take input through EditContext and expose no text field.
- **Fields inside web components are reachable.** Typing finds the field inside a component a selector names, sees focus inside open and closed shadow roots, and no longer treats a shadow-root target as covered by its own host.
- **A hung page receives nothing after its deadline.** Once a CDP text insertion or a screenshot has given up on an unresponsive page, no further keystrokes, text, or scripts are sent to it, so the page cannot receive input after the caller has been told the outcome. Page probes and content-script reinjection on an unresponsive tab are bounded too, and an edit that times out on a hung page now points the agent at `navigate` or `close_tab` instead of `read_page`, which would wait on the same page for another 12 seconds.
- **Long debugger holds keep their lease.** The lease watchdog released every holder after 20 seconds, so long typing (about 45 ms a character), network capture, and long click-and-hold or drag calls could be handed to the next CDP caller mid-action. Each holder now asks for the time its work needs; the 20-second default still frees a tab from a holder that hangs.
- **Nested editors and Google Docs pastes are safer.** Appends move the caret to the end of an editor focused inside a frame, and a Docs paste is compared by its text, not its length, before plain text is inserted again. A formatted paste that inserted nothing — the clipboard write failed, or the document text never changed — now falls back to plain insertion instead of leaving a cleared document empty, and a replace with no selector reaches canvas editors such as Docs, releasing the debugger if the insertion is refused.
- **The HTTP transport stays on loopback.** The MCP server's HTTP transport refuses to bind a non-loopback `--host`, and answers any request whose Host header is not a loopback address, or that carries an Origin header, with a 403. Binding to `::1` works now: request paths were parsed against a base URL that is invalid for IPv6, so every request answered 500.
- **Diagnostics show which browser is attached.** Local health reports whether an extension is attached, and diagnostics name the attached Chrome profile and its window state, so a bridge talking to the wrong profile is visible without guesswork.
- **Dashboard QR pairing failures are visible again.** Scanning a pairing code that was expired, already used, or otherwise rejected reported nothing at all: the "Connecting..." state replaced the scan panel markup, so the error was written into a node that had already been removed from the DOM, and the dashboard then switched to the Paste Key tab. Every failure now renders its localized reason, keeps the user on the Scan tab, and restarts the camera so a regenerated code can be scanned directly.
- **Smaller fixes.** Credential and payment vault lists tell an unconfigured vault, a locked one, and an empty one apart, reporting `vault_not_configured` or `vault_locked` before they read anything; selectors keep their CSS conditions and recheck cached matches before reusing them; and the X site guide applies only on genuine X hosts, not on lookalike hosts that a task merely associates with X.

## v0.9.91 — Version Metadata Alignment — 2026-07-14

The extension, showcase, skill, documentation, and store metadata align at `0.9.91`. The independently versioned `fsb-mcp-server` advances to `0.11.0` for the `mcp:task-status` terminal task-outcome contract; see [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md) for its package-specific release notes and compatibility requirements.

## v0.9.90 — Native Capability Catalog, Trigger Watchers, Control Panel Redesign & Onboarding — 2026-07-06

FSB v0.9.90 is the first stable release since v0.9.72. It turns FSB from a browser-driving extension into a **native capability platform**: a verified first-party API catalog that agents can invoke directly, reactive DOM **trigger watchers**, real **file uploads**, a fully **redesigned control panel**, and a **first-run onboarding** flow. Under the hood it folds in three milestone units shipped on the automation branch: v0.10.0 (Autopilot via Lattice), v0.11.0 (Trigger Watchers), and v0.12.0 (PhantomStream package migration), plus the v1.1.0 T1 execution milestone. MCP server moves to v0.10.0.

Versions: **Extension 0.9.90** · **fsb-mcp-server 0.10.0** · compared against **v0.9.72**.

<img width="1480" height="698" alt="Screenshot 2026-07-04 at 16 28 33" src="https://github.com/user-attachments/assets/b49e3ec3-eb96-4ebc-adf4-2749e511c90a" />

### Native Capability Catalog (direct first-party API execution)

FSB can now call verified first-party APIs directly instead of only driving the page, exposed through two MCP tools that keep the surface tiny:

- **`search_capabilities`** ranks up to 5 matching capabilities with a readiness label, and **`invoke_capability`** runs one. Both live on the MCP runtime surface but stay out of the per-app tool registry, so there is no tool proliferation.
- **~150 new first-party service handlers** across the catalog: AWS, Azure, Stripe, Coinbase, Notion, Slack, ClickUp, Asana, Retool, Confluence, GitLab, Bitbucket, Netlify, Vercel, Jira, Linear, Twitch, Shopify, and many more.
- Of **2,314 catalog descriptors**, **1,874 are T1-ready** (directly invocable, handler- or recipe-backed) and **564 remain guarded fail-closed** pending live write-UAT. A CI gate (`validate:extension`) fails the build if any descriptor is marked T1-ready without handler/recipe proof and passing tests.
- **Readiness honesty:** unverified first-party writes (e.g. GitHub issue creation, Slack without a token) fail closed with `RECIPE_DOM_FALLBACK_PENDING` so agents continue through DOM automation instead of falsely reporting success.

### Trigger Watchers (reactive DOM monitoring)

A new MCP tool family lets an agent watch one element and be notified when a condition is met, with no server-side polling:

- **`trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`.** Arm a selector plus a condition (`changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, or compound AND/OR).
- **Two modes:** `live-observe` (in-page mutation observer, no reload) and `refresh-poll` (background reload, coalesced per tab).
- **Blocking or detached:** blocks up to 120s with 30s progress heartbeats, or returns a `trigger_id` immediately with `detached: true`; a 240s safety ceiling auto-detaches.
- Watches survive MV3 service-worker eviction and persist across navigation; a configurable `fsbTriggerCap` (default 8, range 1 to 64) bounds concurrency. Local and notify-only, with no server monitoring or external push.

### upload_file

- **`upload_file(selector, file_path, tab_id?)`** drives real `<input type=file>` elements and styled dropzones, with absolute-path validation and a sensitive-path denylist. It joins the action-tool contract (carries the `visual_reason` / `client` field bundle).

### Control Panel redesign

The control panel was restyled end to end for a more compact, modern feel:

- **Icon-rail sidebar** (80px) with hover-reveal pill labels, permanently docked, replacing the old 252px text sidebar and mobile hamburger.
- **Stepper controls** (+/− with inline validation) replace sliders/number inputs for Max Iterations, element limits, and the concurrency caps.
- **Agent Concurrency Cap** and a new **Trigger Concurrency Cap** (each 1 to 64, "Reset to recommended," live "N of 8 active" counter).
- **Theme** segmented control (System / Dark / Light) replaces the header moon toggle.
- **Searchable model picker** (type-to-filter combobox) replaces the plain `<select>`.
- **Consolidated Memory** section (formerly "FSB Intelligence"): the 3D knowledge-graph viewer gained a broader category set and a link to the community **Site Maps** page.
- Settings are grouped under labeled subsections (Appearance, Execution & Limits, Automation Behavior, Privacy & Developer); new Poppins / Space Mono typography.

<img width="1488" height="877" alt="Screenshot 2026-07-04 at 16 30 48" src="https://github.com/user-attachments/assets/35ce56cb-9109-45fb-82e7-48dd34c69113" />
<img width="1489" height="876" alt="Screenshot 2026-07-04 at 16 31 32" src="https://github.com/user-attachments/assets/e5bfa087-c4ca-4c2c-98e7-99883e074d9c" />

### Consent & Audit

- New **Consent & Audit** section: a global **Default for New Sites** posture (Off / Ask / Auto) plus **Per-Origin Consent** overrides listing every site FSB has acted on, each with its own Off/Ask/Auto control and sensitivity/blocked badges.

### First-run onboarding

A brand-new guided setup on first install:

- **Welcome → Pick your path → path-specific setup → Pin FSB → Done.**
- **Agent (MCP) path:** copyable install command with a client picker (Claude Code, Cursor, VS Code, Windsurf, and more) and a link to set up OpenClaw.
- **In-browser (BYOK) path:** provider picker (xAI Grok, Anthropic, OpenAI, Google Gemini, OpenRouter, LM Studio) and API-key entry with format validation.
- Dark/light-aware design with a step-progress bar; every step is skippable.

<img width="1488" height="880" alt="Screenshot 2026-07-04 at 16 32 27" src="https://github.com/user-attachments/assets/b6a022ee-9cdb-48ae-bf3b-2f5d8ca6256e" />
<img width="1492" height="884" alt="Screenshot 2026-07-04 at 16 32 40" src="https://github.com/user-attachments/assets/b2bbca77-c12b-4827-90f0-35e83b886506" />
<img width="1490" height="879" alt="Screenshot 2026-07-04 at 16 32 53" src="https://github.com/user-attachments/assets/43f3d905-f837-4409-95b0-9d327e604cb0" />

### Autopilot (Lattice) & PhantomStream

- **Autopilot on the Lattice SDK (v0.10.0):** the agent runtime, providers, and MV3 survivability run on the public Lattice SDK, loaded in the service worker with secret redaction in serialization.
- **PhantomStream package migration (v0.12.0):** dashboard DOM live-preview delegates generic capture/renderer/protocol/relay/compression/sanitizer to the pinned `@full-self-browsing/phantom-stream` package, with 0.2.1 reference-mode media mirroring for progressive video/audio. No user-facing dashboard change.

### Showcase website

- **New pages**: Lattice, PhantomStream, Prometheus, and Sitemaps, plus an interactive **knowledge-graph viewer**.
- **Redesigned /stats page** with a 3D globe region visualization, and a new **/legal** governance page documenting the consent model and audit-log posture (routes split into prerender vs client render-modes).
- **/privacy region disclosure**, IP-geo aggregation with no-IP-leak hardening, and full i18n (en/es/de/ja/zh-CN/zh-TW) with the SEO/hreflang and bundle-budget CI gates.

<img width="1488" height="885" alt="Screenshot 2026-07-04 at 16 34 10" src="https://github.com/user-attachments/assets/106b1a8c-de47-4eaf-a36a-8297f6b51d85" />

### Repo / infrastructure

- Large `graphify-out` knowledge-graph outputs (`graph.json`, `manifest.json`) are now tracked via **Git LFS** to stay under GitHub's file-size limits.

### Platform & reliability

- **MCP restricted-tab fix:** read tools gate on the caller's resolved target tab, not Chrome's OS-active tab, preventing cross-tab false blocks.
- **Service-worker eviction recovery** matches all bridge-disconnect strings.
- **KeyboardEmulator self-healing** debugger attach; six cross-subsystem runtime correctness fixes (catalog / trigger / audit / MCP).
- **CI on Node 20:** browser-oriented plugin slices no longer crash the importer/gate under CI's Node 20 (`WebSocket` stub); large graphify outputs moved to Git LFS; i18n catalog regenerated to match templates. All four CI jobs (extension, mcp, showcase, all-green) pass.

### Upgrade notes

- **MCP reverse-DNS rename.** The server's reverse-DNS name changed from `io.github.lakshmanturlapati/fsb-mcp-server` to `io.github.fullselfbrowsing/fsb-mcp-server` (GitHub org transfer). The **npm package name `fsb-mcp-server` is unchanged**, so `npx -y fsb-mcp-server` keeps working. Clients that pin the reverse-DNS key in their MCP config must update it.
- **No other breaking changes.** All new handlers and MCP tools are additive.

### Install

- **Extension:** load the packaged `fsb-extension-v0.9.90.zip` unpacked via `chrome://extensions` (Developer mode → Load unpacked), or update from the Chrome Web Store once it rolls.
- **MCP server:**
  ```bash
  npx -y fsb-mcp-server@0.10.0
  # or
  npm i -g fsb-mcp-server@0.10.0
  ```

### Verification

- CI green on `automation` (extension · mcp · showcase · all-green).
- `npm run validate:extension`, full `npm test`, and the Angular showcase build all pass locally, including under a simulated Node 20 runtime.

### Fixed

- **`list_triggers` status filter accepts the full persisted set.** The optional `status` enum now allows `armed`, `needs_attention`, `blocked`, `fired`, `timed_out`, and `stopped`; `needs_attention` and `timed_out` were previously rejected at the schema gate. Kept in parity between the extension and MCP tool definitions. (`1d23c56c`)
- **Background-tab automation errors route to their owning tab only.** A session failing in a background tab now clears that tab's per-tab running state without disturbing the active tab's UI, matching the `automationComplete` routing contract. (`ace4528b`)

## Engineering milestone 0.12.0 — PhantomStream Package Migration — 2026-06-17

Migrates FSB's dashboard DOM live-preview from FSB-owned generic stream engines to the pinned, published `@full-self-browsing/phantom-stream@0.1.0` package.

### Added / Changed

- **PhantomStream powers generic DOM mirroring.** The extension, server relay, and the static and Angular dashboards delegate generic capture (snapshot/mutation/session/scroll), renderer assembly, protocol envelopes, relay classification, compression, stale-frame detection, and sanitizer behavior to PhantomStream-backed seams. The package is pinned by exact version and `package-lock` integrity.
- **FSB keeps its product-specific adapters.** Capture maps to FSB background actions with overlay/dialog/scroll side channels and readiness pings (`content/dom-stream.js`); a shared `window.FSBPhantomStreamViewer` wrapper serves both dashboards; the WebSocket bridge preserves FSB task/status traffic, hash-key rooms, tab ownership, and debugger-contention reporting while accepting PhantomStream stream/control and remote-control frames.
- **No user-facing change.** MCP tool schemas, dashboard task/status WebSocket traffic, pairing, auth, model/provider behavior, and the dashboard's visual design are unchanged. The migration is internal.
- **Deterministic parity coverage.** Legacy `data-fsb-nid` stamping was removed in favor of differential parity tests; PhantomStream package, protocol, capture, renderer, relay, security, dashboard, and recovery paths are gated by the root `npm test` suite.

### Deferred (user-gated)

- Live-browser UAT for dashboard preview fidelity, navigation/reconnect recovery, restricted tabs, large pages, security masking, and remote-control usability remains `human_needed` (automated protocol and source-contract tests pass).

## Engineering milestone 0.11.0 — Trigger Tool (Reactive DOM Monitoring) — 2026-06-17

Adds reactive DOM monitoring: an agent arms a watch on one element and is notified when a condition is met, without server-side polling.

### Added

- **Trigger tool family.** `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` arm and manage one-element watches in the caller's owned tab. Watches survive MV3 service-worker eviction and persist across tab navigation.
- **Two watch modes.** `live-observe` uses an in-page mutation observer with pulse feedback and no reload; `refresh-poll` reloads the owned tab in the background and coalesces same-tab due watches into a single reload.
- **Rich conditions.** `changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, and compound AND/OR; numeric and percent conditions use hysteresis to avoid repeated fires on the same edge. Text, number, and attribute extraction is supported.
- **Blocking or detached.** `trigger` blocks up to 120s by default with 30s progress heartbeats; `detached:true` returns immediately with a `trigger_id` to poll later. A 240s safety ceiling auto-detaches.
- **Concurrency cap.** A configurable `fsbTriggerCap` (default 8, range 1–64) limits active watches; armed and attention states (`needs_attention`, `blocked`) count toward the cap, terminal states (`fired`, `timed_out`, `stopped`) do not.
- **Local, session-bound, notify-only.** Triggers run in the open browser with no server-side monitoring and no desktop/email/SMS/Slack push or auto-act workflows; the caller decides any follow-up.

### Deferred (user-gated)

- Live-browser composed trigger UAT (multiple interacting watches on real pages) and publish/tag/release actions.

## Engineering milestone 0.10.0 — Autopilot via Lattice SDK — 2026-06-15

Shipped 2026-06-15: FSB's agent runtime, providers, and MV3 survivability moved onto the public Lattice SDK. See the `v0.10.0` git tag for detail; MCP-specific history is in [`mcp/CHANGELOG.md`](./mcp/CHANGELOG.md).
