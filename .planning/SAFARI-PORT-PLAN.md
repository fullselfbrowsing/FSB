# Safari Web Extension Port — Research & Plan

**Branch:** `safari-extension-port` (forked from `origin/main` @ `09d95a61`)
**Date:** 2026-08-21
**Source:** `extension/` — MV3, 513 files, 30 MB, `background.js` = 16,279 lines
**Local toolchain (verified):** macOS 26.6.1 · Safari 26.6 · Xcode converter present at
`/Applications/Xcode.app/Contents/Developer/usr/bin/safari-web-extension-converter`

---

## 1. Verdict

**A literal 1:1 port is not achievable.** Three Chrome-proprietary APIs that FSB depends on
have no Safari equivalent and no polyfill: `chrome.debugger` (115 references),
`chrome.sidePanel` (22 references), and `chrome.offscreen` (6 references). These are not
"not yet implemented" — `debugger` and `offscreen` are not part of the WebExtensions
standard at all (MDN's browser-compat-data has no entry for either), and `sidePanel` /
`sidebarAction` are recorded as `safari: NO` on **every single member**.

**However, a high-fidelity port is very achievable**, because of one architectural fact
discovered in the source: FSB's action layer is already **DOM-first with CDP as an
escalation tier**, not CDP-primary.

`extension/content/actions.js:135-164`:

```js
element.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
element.dispatchEvent(new MouseEvent('mouseup',   mouseEventInit));
element.dispatchEvent(new MouseEvent('click',     mouseEventInit));
if (typeof element.click === 'function') element.click();
await waitForStability('click');
// Check if DOM click had effect; if not, try CDP mouse as final fallback
let clickMethod = 'dom_coordinate';
const cdpResult = await chrome.runtime.sendMessage({ action: 'cdpMouseClick', ... });
```

`actions.js` is 5,881 lines of synthetic-DOM automation that runs **first** on every click.
CDP is the reliability backstop for the tail of hostile sites. So the Safari build does not
need a new input engine — it needs the escalation tier to degrade cleanly instead of throw.

**Realistic outcome: ~85% of tool surface at full fidelity, ~10% degraded, ~5% unavailable
on macOS.** Detail in §4.

---

## 2. Compatibility baseline (hard data)

Sourced from MDN `browser-compat-data/webextensions` (raw JSON) and Apple's
*Assessing your Safari web extension's browser compatibility* (fetched via the
`developer.apple.com/tutorials/data` JSON API — the HTML pages are JS-rendered and return
only titles to a plain fetch).

### 2.1 Blocked — no Safari support, no polyfill

| API | Refs | Safari status |
|---|---|---|
| `chrome.debugger` | **115** | Chrome-proprietary. Absent from BCD entirely. |
| `chrome.sidePanel` | **22** | `safari: NO` on all 16 members |
| `sidebar_action` (Firefox alt) | — | `safari: NO` on all 6 members |
| `chrome.offscreen` | **6** | Chrome-proprietary. Absent from BCD. |
| `chrome.system.memory` | 1 | Chrome-proprietary |
| `webRequest` **blocking** | 4 | `webRequest` returned in Safari 18, but `BlockingResponse: NO`, `ResourceType: NO` |
| `runtime.getContexts` | 1 | `safari: NO` (already `?.`-guarded at `background.js:3611`) |
| `runtime.onSuspend` | 2 | `safari: NO` |
| `tabs.discard` | — | `safari: NO` |

CDP surface actually used — narrower than the 115 refs suggest:

| CDP command | Count | Purpose |
|---|---|---|
| `Input.dispatchMouseEvent` | 26 | click / click-and-hold / drag |
| `Input.dispatchKeyEvent` | 6 | trusted key events |
| `Input.insertText` | 2 | trusted text insertion |
| `DOM.setFileInputFiles` | 1 | **file upload** |
| `DOM.querySelector` / `getDocument` / `describeNode` | 4 | node resolution for the above |
| `Network.enable` + `requestWillBeSent` / `responseReceived` | — | consent-gated network capture |

### 2.2 Version-gated — **all satisfied at Safari 26.6**

| Feature | Min Safari | Used by |
|---|---|---|
| `background.service_worker` | 15.4 | `background.js` |
| `scripting.ExecutionWorld.MAIN` | 15.4 | programmatic MAIN-world injection |
| `web_accessible_resources.matches` / `.resources` | 15.4 | manifest |
| `storage.session` | 16.4 | **127 refs** |
| `scripting.registerContentScripts` | 16.4 | dynamic registration |
| **`content_scripts.world: "MAIN"`** | **18** | `canvas-interceptor.js` @ `document_start` |
| `dom.openOrClosedShadowRoot` | 26 | shadow-DOM traversal |

→ **Baseline the port at Safari 18.0**, target 26. Do not attempt Safari 15–17.

### 2.3 Supported but behaviourally different

- **Content scripts do not run until the user grants per-site permission.** `<all_urls>`
  host permission is *not* an auto-grant in Safari — the user must click the extension's
  toolbar popover and choose "Always Allow on Every Website". This is the single biggest
  *UX* delta and needs first-run onboarding copy. (BCD note on `manifest.content_scripts`.)
- `storage.local`: 5 MB default; `unlimitedStorage` grants genuinely unlimited on Safari 16+.
- `scripting.executeScript`: `injectImmediately` **not supported** (36 refs use `executeScript`).
- `scripting.insertCSS`/`removeCSS`: `origin`, `allFrames`, `frameIds` not supported.
- `runtime.lastError` (**74 refs**): only populated on the **callback** form; promise-form
  failures reject instead. FSB mixes both — audit needed.
- `runtime.OnInstalledReason`: only `install` and `update`.
- `webNavigation.onCommitted`: supported; `transitionType` / `transitionQualifiers` **not**.
- `action.getBadgeBackgroundColor` always returns red (setters work — FSB only sets).
- `windows.create`: `popup` and `normal` fine; `panel` / `detached_panel` unsupported.
  FSB uses `type: 'popup'` in all 5 call sites → **compatible**.
- `web_accessible_resources`: base URL is *always* dynamic in Safari.
- `update_url` unsupported — updates ship through the App Store.
- Safari ignores `file://` URL schemes in manifest permissions.

### 2.4 Confirmed working (no action needed)

All `tabs.*` FSB uses: `get`, `query`, `create`, `update`, `remove`, `reload`, `goBack`,
`goForward`, `sendMessage`, `onUpdated`, `onRemoved`, `onActivated`, `onCreated` — Safari 14+.
`tabs.captureVisibleTab` **is supported** (Safari 14+, defaults to JPEG, doesn't require
`<all_urls>`). `alarms` (14+), `storage.local/session/onChanged`, `action.setBadgeText`,
`runtime.sendMessage`/`onMessage`/`connect`/`getURL`/`getManifest`/`openOptionsPage`,
`clipboardWrite`, `webNavigation.onCommitted`.

**`runtime.connectNative` / `sendNativeMessage`: Safari 14+.** This is the escape hatch that
makes §3 possible.

---

## 3. Replacement designs for the four blockers

### 3.1 `sidePanel` → the primary UI has no home

The side panel is FSB's main surface: `sidepanel.js` (3,733 lines) + `sidepanel.html` +
`sidepanel.css` (1,726 lines). Apple treats browser chrome as OS surface; no extension can
dock a panel. Four options, in fidelity order:

| Option | Persistent | Docked | Effort | Notes |
|---|---|---|---|---|
| **A. Native SwiftUI window hosting `WKWebView`** | ✅ | side-by-side, not docked | High | Loads `sidepanel.html` verbatim; bridges to the extension over native messaging. Highest fidelity, feels like a Mac app. |
| **B. Dedicated extension tab** (`tabs.create('ui/sidepanel.html')`) | ✅ | ❌ | **Low** | Zero UI rewrite. Ship this first. |
| C. In-page content-script overlay | ❌ per-tab | ✅ | Medium | FSB already has overlay infra (`utils/overlay-state.js`, `content/visual-feedback.js`) but it dies on navigation. |
| D. `action.default_popup` | ❌ closes on blur | ✅ | Low | Unusable for a long-running agent loop. |

**Recommendation: B for MVP, A as the shipped experience.** Both reuse `sidepanel.html`
unmodified; only the *opener* changes. Introduce `openAgentSurface()` and replace the 22
`chrome.sidePanel.*` call sites with it.

### 3.2 `debugger` → tiered degradation, not removal

| Capability | Chrome path | Safari path | Fidelity |
|---|---|---|---|
| `click` | DOM → CDP fallback | **DOM only** | High — DOM path is already primary |
| `type_text` / `insert_text` | `Input.insertText` | DOM + `execCommand('insertText')` (fallback already exists at `background.js:10456-10460`) | High |
| `press_key` | `Input.dispatchKeyEvent` | `KeyboardEvent` dispatch | Medium — untrusted; breaks on handlers checking `isTrusted` |
| `click_and_hold`, `drag`, `drag_variable_speed`, `drop_file` | CDP mouse | Pointer Events sequence | Medium — HTML5 DnD needs trusted events on some sites |
| `upload_file` | `DOM.setFileInputFiles` | **Native messaging** (see below) | High, via new code |
| `network_capture` | `Network.enable` | `webRequest` (Safari 18+, non-blocking) | **Partial — no response bodies** |

**`upload_file` via native messaging.** In-repo comments call `DOM.setFileInputFiles` "the
only mechanism that" works (`background.js:14796`, `site-guides/utilities/file-upload.js:64`).
That's true *within Chrome's extension sandbox*. Safari has a different, legitimate route:

1. Extension SW → `runtime.sendNativeMessage({ readFile: path })`
2. `SafariWebExtensionHandler` (Swift, in the container app) reads bytes → base64
3. SW → content script; content script builds
   `const dt = new DataTransfer(); dt.items.add(new File([bytes], name)); input.files = dt.files;`
   then dispatches `change`.

Sites that read `input.files` see a real `File`. Sites gating on `event.isTrusted` will not.
This is a genuine capability, not a stub — and it's *only* possible because of the container
app, which is a Safari advantage worth noting.

**`network_capture` is the one real loss.** Safari 18's `webRequest` is non-blocking and
exposes no response bodies, so the consent-gated capture in `utils/network-capture.js`
degrades to URL + request-header metadata only. The existing consent gate
(`utils/consent-policy-store.js`) and redactor still apply unchanged.

### 3.3 `offscreen` → two different fixes

| Consumer | Chrome reason | Safari replacement |
|---|---|---|
| `offscreen/lattice-host.js` | `WORKERS` — hosts Lattice provider bus, `fetch()` to AI APIs | Run in the SW directly (Safari SWs may `fetch` freely), **or** a hidden extension tab if module-loading forces it. Verify against `tests/lattice-host-step-transition-smoke.test.js`. |
| `offscreen/stt.js` | speech recognition off the SW | FSB **already has** `content/stt-recognition.js`. Route through it; or use native `SFSpeechRecognizer` via the container app for a better result. |

### 3.4 MCP bridge (`ws://localhost:7225`) → prefer native messaging

`ws/mcp-bridge-client.js:12` opens a WebSocket to localhost. Two Safari-specific hazards:

1. **SW lifetime.** Safari terminates idle background service workers aggressively; there
   are documented reports of permanent SW kill on iOS 17.4–17.6 after 30–45 s. A dropped SW
   drops the socket.
2. **Local Network privacy.** macOS 15+ gates localhost access; the container app needs the
   `com.apple.security.network.client` entitlement, and the user sees a prompt.

**Recommendation:** route the MCP bridge through `connectNative` to the container app, and
let the *app* hold the localhost socket. This sidesteps both hazards and is the idiomatic
Safari design. Keep the existing `ws-client.js` remote-control socket
(`wss://…/ws?key=…&role=extension`) as-is, plus a `getPlatformInfo()`-style keep-alive ping
inside Safari's activity window.

---

## 4. Capability degradation map (user-visible)

| Tier | Tools |
|---|---|
| **Full fidelity** | `navigate`, `back`/`forward`, `refresh`, `open_tab`, `close_tab`, `switch_tab`, `list_tabs`, `read_page`, `get_page_snapshot`, `get_dom_snapshot`, `get_text`, `get_attribute`, `set_attribute`, `scroll*`, `focus`, `select_option`, `check_box`, `clear_input`, `execute_js`, `capture_screenshot`, `search`, all capability/recipe/trigger/memory/session tooling, cost tracking, telemetry |
| **High (DOM path, untrusted events)** | `click`, `click_at`, `double_click`, `right_click`, `hover`, `type_text`, `insert_text`, `fill_credential`, `press_enter` |
| **Degraded** | `press_key`, `drag`, `drag_drop`, `drag_variable_speed`, `click_and_hold`, `select_text_range` — untrusted; fail on `isTrusted`-gated handlers |
| **Reduced** | `network_capture` — metadata only, no response bodies |
| **Requires new native code** | `upload_file`, `drop_file` |
| **Unavailable** | `get_memory_stats` (`system.memory`) |

The port should surface this honestly: extend `utils/capability-router.js` /
`capability-catalog.js` so an unsupported tool returns a structured
`capability_unavailable` result with the reason — never a raw throw.

---

## 5. Build & packaging architecture

**Do not fork `extension/`.** 513 files × 30 MB duplicated would diverge within one release.

**Single source of truth + build-time transform**, fitting the existing `esbuild.config.js`
pipeline (which already emits to `extension/dist/` and `extension/content/`):

```
extension/                       ← unchanged source of truth
  utils/platform-adapter.js      ← NEW: platform detect + capability gates
scripts/build-safari.mjs         ← NEW: emits build/safari/ from extension/
  ├─ strips  side_panel, offscreen, debugger, system.memory from permissions
  ├─ adds    nativeMessaging
  ├─ rewrites background.service_worker (drops offscreen bootstrap)
  └─ copies  all assets
safari/                          ← NEW: Xcode project (container app + extension target)
  FSB/                           ← SwiftUI container app (+ agent window, option A)
  FSB Extension/
    SafariWebExtensionHandler.swift
```

`utils/platform-adapter.js` exposes:

```js
FSB.platform            // 'chrome' | 'safari'
FSB.caps                // { trustedInput, networkBodies, sidePanel, offscreen, nativeFS, systemMemory }
FSB.debugger            // no-op shim returning { ok:false, reason:'capability_unavailable' }
FSB.openAgentSurface()  // sidePanel.open() on Chrome; tab/native window on Safari
```

Chrome build is byte-identical to today — the adapter is additive and `FSB.platform`
short-circuits to the existing path.

Xcode conversion (verified present locally):

```bash
xcrun safari-web-extension-converter build/safari \
  --project-location safari \
  --app-name "FSB" \
  --bundle-identifier com.fullselfbrowsing.fsb \
  --swift --macos-only --copy-resources --no-open --force
```

Run the converter **once** to scaffold; commit the Xcode project; thereafter
`build-safari.mjs` refreshes resources in place. Re-running the converter clobbers Swift edits.

### ⚠️ Test-suite constraint — read before touching `extension/`

**15 test files read extension source and assert on its exact contents.**
`tests/capability-fetch.test.js:171` maintains a forbidden-substring list —
`['jmespath','getFSB','require','importScripts','FsbMcpTaskStore','FsbCapabilityInterpreter']` —
that fails if any appears in a serialized function body. Others pin occurrence counts
(`tests/agent-cap-ui.test.js:283`, `tests/cap-counter-live.test.js:137`). The suite is 626
files; `npm test` chains ~250 of them serially.

Practical consequence: **even a comment containing the wrong word can break the build.**
Every edit to `extension/` must be followed by `npm run validate:extension && npm test`.
Tests already coupled to the blocked APIs: `network-capture.test.js`,
`network-capture-consent.test.js`, `keyboard-attach-robustness.test.js`,
`_helpers/cdp-event-driver.js`, 3 × `sidepanel-*`, 6 × offscreen/lattice.

Also note (existing repo constraint): in-SW `chrome.runtime.sendMessage` never loops back —
same-context dispatch must go through `globalThis.fsbDispatchInternalMessage`. The Safari
adapter must preserve this, since more logic moves *into* the SW when offscreen goes away.

---

## 6. Phased plan

| Phase | Scope | Exit criterion |
|---|---|---|
| **S0 — Scaffold** | `build-safari.mjs`, Safari manifest transform, run converter, Xcode project committed, `Sign to Run Locally` + *Develop ▸ Allow Unsigned Extensions* | Extension loads in Safari 26; popup opens |
| **S1 — Platform adapter** | `utils/platform-adapter.js`; replace 115 `chrome.debugger` + 6 `offscreen` + 1 `system.memory` refs with gated calls; `capability_unavailable` results wired into `capability-router.js` | `npm test` green on Chrome build; Safari build boots with no unhandled rejections |
| **S2 — Agent surface** | `openAgentSurface()`; 22 `sidePanel` refs → tab-based surface (option B) | Full agent loop runs in Safari via extension tab |
| **S3 — Input parity** | DOM-only click/type verified; Pointer-Events path for drag/hold; untrusted-event telemetry | Existing action tests pass against the DOM path |
| **S4 — Native bridge** | `SafariWebExtensionHandler.swift`; `upload_file` via native file read + `DataTransfer`; MCP bridge over `connectNative` | `upload_file` + MCP tool round-trip working in Safari |
| **S5 — Lattice + STT** | Lattice off offscreen; STT via `content/stt-recognition.js` or `SFSpeechRecognizer` | `test:lattice` green; voice input works |
| **S6 — Onboarding & polish** | Per-site permission onboarding ("Always Allow on Every Website"), degradation notices in UI, native agent window (option A) | First-run flow verified on a clean profile |
| **S7 — Distribution** | Apple Developer Program, signing, notarization, App Store or Developer ID | Notarized build installs on a second Mac |

---

## 7. Distribution notes

- Safari web extensions ship **inside a container app** (macOS / iOS / visionOS / Mac Catalyst).
- Requires **Apple Developer Program** membership for any distribution.
- macOS: App Store, **or** Developer ID + notarization outside the Mac App Store — the latter
  fits FSB's current direct-download model better and avoids App Store review friction for an
  automation tool with `<all_urls>`.
- Beta: "Copy App" distribution (unsigned) + tester enables *Develop ▸ Allow Unsigned Extensions*.
- `update_url` is unsupported — updates flow through the App Store or your own app updater.
- **Recommend macOS-only initially.** iOS additionally loses `contextMenus`,
  `windows.create/remove/update`, and has a harsher SW lifetime.

---

## 8. Open questions

1. **Agent surface**: ship tab-based (S2) and stop, or invest in the native SwiftUI window?
2. **Trusted input**: is degraded `press_key`/`drag` acceptable, or should S3 explore
   a native `CGEvent`-based path from the container app? (Would need Accessibility
   permission — powerful, but a significant trust ask and a likely App Store blocker.)
3. **MCP bridge**: native messaging (recommended) vs. keeping the localhost WebSocket?
4. **Distribution channel**: Developer ID + notarization, or App Store?
5. **Version/branding**: separate Safari version line, or lockstep with the Chrome build?

---

## Sources

- [Assessing your Safari web extension's browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
- [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [Distributing your Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
- [Messaging a Web Extension's Native App](https://developer.apple.com/documentation/SafariServices/messaging-a-web-extension-s-native-app)
- [MDN browser-compat-data — webextensions](https://github.com/mdn/browser-compat-data/tree/main/webextensions)
- [Chrome incompatibilities — MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities)
- [How to quickly convert Chrome extensions to Safari — Evil Martians](https://evilmartians.com/chronicles/how-to-quickly-and-weightlessly-convert-chrome-extensions-to-safari)
- [Safari Extension Service Worker Permanently Killed on iOS 17.4.x–17.6](https://developer.apple.com/forums/thread/758346)
- [Use WebSockets in service workers — Chrome for Developers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)
