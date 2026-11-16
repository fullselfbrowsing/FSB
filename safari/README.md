# FSB for Safari

Safari build of the FSB extension. **`extension/` is the only source tree** —
this directory holds the Xcode project and the native host, and the browser
payload is generated into `build/safari/` by `npm run build:safari`.

```
npm run build:safari      # esbuild -> build/safari/ -> Version.xcconfig
npm run validate:safari   # manifest + JS syntax + Safari negative invariants
npm run test:safari       # 716 assertions across 16 suites (one needs macOS + swiftc)
```

## Why there is no fork

15 test files read `extension/` source and assert on its exact contents. Two
pin counts: `background.js` is pinned to 330 script-import mentions / 326 call
sites, and the tool registry is pinned by SHA-256 (cross-checked against
`mcp/ai/tool-definitions.cjs`). So Safari behaviour is delivered by, in order
of preference:

1. **Runtime shim** — `extension/utils/platform-adapter.js` installs stand-ins
   for `chrome.debugger` / `sidePanel` / `offscreen` / `system.memory`. It is a
   hard no-op on Chrome.
2. **Inert-on-Chrome guards** — gated on `globalThis.FsbPlatform`, which is
   `undefined` on Chrome and in every Node harness.
3. **Build-output transform** — `scripts/build-safari.mjs`, never on `extension/`.

`tests/safari-source-parity.test.js` enforces this: every emitted file must be
byte-identical to its `extension/` counterpart except `manifest.json` and
`background.js`.

## Layout

```
safari/
  Config/
    Version.xcconfig               GENERATED from extension/manifest.json
    ExportOptions-DeveloperID.plist
    ExportOptions-AppStore.plist
  FSB/
    FSB.xcodeproj
    FSB/                           container app  (+ FSB.entitlements)
    FSB Extension/                 web extension  (+ FSB_Extension.entitlements)
      SafariWebExtensionHandler.swift
      Resources/                   <- point this at ../../../build/safari
    Shared/                        member of BOTH targets
      NativeFraming.swift          wire codec + chunking
      MCPSocketSession.swift       one real WebSocket (per channel)
      BridgeCoordinator.swift      one per channel: relay + linger/adoption
      GrantedRoots.swift           security-scoped folder grants
      FileReadService.swift        sandbox-scoped chunked file reads
  Tests/
    BridgeChannels/main.swift      command-line harness over Shared/*.swift,
                                   run by tests/safari-native-bridge-channels.test.js
```

## MCP on the same port

The MCP server, the port (**7225**) and the wire protocol are identical to
Chrome. Only the pipe differs, and the extension picks it at runtime:

| transport | how | server changes |
|---|---|---|
| `ws` | `new WebSocket('ws://localhost:7225')` from the service worker | `safari-web-extension://` added to the origin allowlist |
| `native` | the container app holds the socket; frames relayed over `runtime.connectNative` | the same allowlist entry: the app sends the extension's `Origin` |

On Safari 26.5 the direct pipe is not an option at all, and not because of
CSP. Safari runs the extension's service worker on its WebContent process's
main thread, and a worker `new WebSocket()` hands its setup to the main thread
and blocks on a semaphore until it finishes: the worker waits on itself and the
whole process deadlocks. Every later fetch, extension resource load and
extension page in that process hangs with it, and Safari abandons the
background after about two minutes (`WKWebExtensionContextErrorDomain`
Code=6). Seen on-device by sampling the stuck process.

So `extension/utils/platform-adapter.js` makes `WebSocket` throw `SecurityError`
inside the Safari worker. The extension still **probes** (direct first, pin to
native after two failures, remembered in `chrome.storage.local` for 7 days),
but it reads a construct-time `SecurityError` as final and pins native on the
first attempt.

Both transports present the extension's own `Origin`. `URLSessionWebSocketTask`
sends none by default, so `MCPSocketSession` sets it from the `open` frame: the
server treats an Origin-less socket as an MCP relay that must say
`relay:hello`, never as the extension. The `safari-web-extension://` allowlist
entry exists only on this branch. Published `fsb-mcp-server` (0.11.1 at the
time of writing) refuses that origin on both transports, so Safari needs an MCP
release cut from here.

**One browser at a time, and Safari stays unpaired.** The server holds one
extension socket and pins one extension origin in `~/.fsb/bridge-auth.json`.
While Chrome is paired, every other browser origin is refused at the upgrade,
paired or not; `fsb-mcp-server pair --reset` clears the pin. Safari cannot pair
yet either:

- Chrome gets its pairing code from the Node native host, which reads `~/.fsb`.
  Safari's native messages go to the sandboxed app, which cannot.
- Safari gives the extension a new `safari-web-extension://<UUID>` on every
  browser launch ([WebKit bug 244330](https://bugs.webkit.org/show_bug.cgi?id=244330)),
  so an exact-origin pin would not survive a relaunch.

Unpaired, the MCP tools work. Delegated agent runs, which need pairing and the
Node native host, do not. Pairing per browser and routing MCP calls to a chosen
browser are planned as a separate change.

**Socket lifetime is slaved to port lifetime, deliberately.** If the app kept
:7225 open across a service-worker eviction, the hub would never see a close,
`sendAndWait` would sit until its 30 s timeout, and that timeout string is not
in `BRIDGE_DISCONNECT_MESSAGES` — so the server's `sw_evicted` recovery would
never arm. A 3 s linger (under the extension's 10 s staged-release grace) makes
the common evict-and-revive case adopt the live socket instead of redialling.

**The dashboard relay rides the same pipe, on its own channel.**
`ws/ws-client.js` cannot open its socket to the FSB server either, for the same
deadlock, so `createFSBRelaySocket` hands it an `FsbNativeBridgeSocket` on the
`relay` channel wherever the worker `WebSocket` is guarded. Every native message
names its channel (`ch`, `mcp` when absent), and the host keeps one
`BridgeCoordinator` per channel: separate socket, poll, linger and watchdog, so
the two never see each other's frames. The relay server authenticates by key and
role only, so the app's socket needs no server change.
`tests/safari-native-bridge-channels.test.js` builds the shipped `Shared/*.swift`
into a command-line harness and drives both channels against two local
WebSocket servers.

## Toolbar icon

Safari decides whether to tint a toolbar icon with `-[NSImage
safari_isGrayscale]` (SafariShared). Calling it directly on test images gives
the rule:

- A pixel counts as colored when its premultiplied channel spread (max minus
  min of R, G, B, after multiplying by alpha) is at least 25/255.
- The icon keeps its own colors only when at least 3% of its non-transparent
  pixels are colored.

Any other icon is tinted: Safari keeps only the alpha and paints it gray, or the
accent color while the extension is active on the page. `icon*.png` are black
and white, so the tile showed as a solid square, and a letters-only template
came out as tinted lettering. An earlier faint warm tint did not help either:
it was too weak, and only 1 to 2% of its pixels cleared the spread. A white tile
with black lettering has no color at all, so it is tinted like the original.

So on Safari, `action.default_icon` points at
`extension/assets/safari-toolbar-{16,19,32,38,48,64}.png`, generated by
`scripts/generate-safari-toolbar-icons.py`. These are the same artwork as a
white tile with black lettering and no border. The white itself carries the
color Safari needs: it is mixed with 16% of FSB orange (`#ffedd6`), which reads
as white in a toolbar and gives about 97% of the pixels a spread of 41. Probed
on real files, Safari accepts a 10% mix (spread 25) and tints anything weaker.
16% is the margin: the same color measures about 14% less on a wide-gamut
display. 16/32 and 19/38 are the toolbar's 1x and 2x, depending on the macOS
version. `icons` keeps the original tile, which Safari Settings shows untinted.
Chrome keeps the black tile everywhere.

`utils/action-icon.js` animates the toolbar with `setIcon` frames. On a platform
whose adapter sets `caps.tintsGrayscaleToolbarIcon`:

- It draws the frames from the warm-white 16 and 32, and repaints that plate
  under the breathe.
- Every animation keeps its own color, exactly as on Chrome: the orbit bead and
  the sweep in orange, the capability ring in violet. Only the sweep's track
  differs, a faint dark band where Chrome has a faint light one.
- It still cuts the glow from the black-and-white tile, but nothing can be
  added to a near-white plate. So it inverts the mask, lifts the mark to orange
  and multiplies the result onto the tile.
- It dims to half alpha without the grayscale filter, then lays a 20% wash of
  FSB orange over what is left (`source-atop`, so the alpha is kept). Half
  alpha alone would halve the plate's spread to 20, under Safari's 25; the wash
  leaves 42.

`tests/safari-toolbar-icons.test.js` checks the assets against this rule. On
macOS it also runs Safari's own classifier on them, at full and half alpha.

## The panel (in place of the side panel)

Safari has no side panel API for extensions (checked in Safari 26 and 27), so
the adapter polyfills `chrome.sidePanel`. `ui/sidepanel.html` is shown in one of
two places, and `chrome.sidePanel.open()` picks: the panel inside the page
wherever the page can hold one, the workspace window otherwise.

### Inside the page

`content/panel-host.js` puts the panel's page in an iframe on the left edge of
the web page: 420 px wide, full height, in the top layer, inside a closed shadow
root. The page's own content gets a matching `margin-left`, and the glow that
frames the page while an agent works reads `--fsb-panel-inset` to start after
the panel. FSB's other overlays sit in the right-hand corners and stay where
they are. This is the only form that works
while Safari is in full screen, where no second window can sit beside it.

- **Placing it.** Only the worker places panels. A toolbar click shows it in the
  window's active tab, and a second click closes it, as Chrome's own side panel
  toggles. An automation that opens the panel names a tab and never closes it.
  The window is recorded in `storage.session` under `fsbSafariPanel`.
- **Keeping it.** The panel lives in its page, so it is gone after every
  navigation and absent from every other tab. The worker puts it back when a
  page finishes loading or a tab is switched to, in windows that have it on.
  Each time the panel's page loads afresh and restores its state.
- **What the page inside may call.** An extension page embedded in a web page
  has the whole extension API on Safari, but a `tabs.*` or `windows.*` lookup
  made from it takes the host page down (WebKit bug 327823; seen on Safari 26.5
  with `tabs.query`, `tabs.getCurrent`, `windows.getCurrent`, `getAll` and
  `getLastFocused`). Events, runtime messaging, storage and i18n work there. So
  when the adapter loads in an embedded page it replaces the global
  `chrome` / `browser` with a copy whose `tabs` and `windows` ask the worker,
  over a port named `fsb-frame-rpc`, to make the call. Events and constants stay
  the browser's own. "Current" tab and window mean the ones the panel sits in.
  If the global cannot be replaced, the page is stopped before its scripts run.
- **Framing.** A page can only be framed in a web page if it is web accessible,
  so the Safari manifest lists `ui/sidepanel.html` (and nothing else under
  `ui/`). Safari hides extension URLs from page scripts (they read
  `webkit-masked-url://hidden/`), so a site cannot frame it on its own, and a
  host page's `frame-src` does not block a frame the content script adds.
- **Limits.** A site can still cover, restyle or hide the host element, since
  it sits in the site's own document, so a decision made in this panel deserves
  more care than one made in a window of its own. `position: fixed` headers and
  left-hand sidebars keep running under the panel. And the page pays for
  loading the panel's scripts on every navigation.

### The workspace window

Pages that cannot hold a panel (Safari's own pages, extension pages, sites FSB
has no access to) get a popup-type window instead, docked so that it reads as a
side panel:

- **Open.** It takes the left-hand 460 px of the browser window it was opened
  from (the toolbar click's window, the window of the tab an automation started
  on, or the last focused one). That window moves over and narrows by the same
  amount, so the pair fills its original footprint and no screen size is needed.
- **Follow.** The workspace page polls its browser window every 400 ms
  (`windows.onBoundsChanged` is used where it exists) and moves itself to that
  window's left edge when it moves or resizes. The page does this, not the
  worker: it lives exactly as long as the window, and an alarm cannot fire often
  enough. It only moves the workspace, and only in answer to the browser window
  changing, so it cannot chase its own updates.
- **Detach.** A workspace the user drags away stays where they put it. The next
  toolbar click docks it again. A click in another browser window moves the dock
  there and gives the first window its width back.
- **Close.** The worker gives the browser window its 460 px strip back, unless
  the user has resized it since. The dock record names the workspace window itself,
  because a page that closes its own window clears the window id first.

It does not dock, and opens wherever Safari puts it, when the browser window is
fullscreen or minimized, when it would be left narrower than 700 px (so under
1160 px wide), or when Safari does not apply the requested size and position
(the adapter reads them back). The record lives in `storage.session` under
`fsbSafariWorkspace.dock`, so it survives a worker recycle. Opening the in-page
panel closes an open workspace window: one surface at a time.

## Remaining manual Xcode steps

The converter cannot do these, and they need the Xcode UI (target membership
and build settings live in `project.pbxproj`):

1. ~~Add `Shared/` to BOTH targets~~ — **already done.** Every Swift file in
   `safari/FSB/Shared` belongs to both the *FSB* and *FSB Extension* source
   phases.
2. ~~Wire the entitlements~~ — **already done.** `CODE_SIGN_ENTITLEMENTS` points
   at `FSB/FSB.entitlements` for the app target and
   `FSB Extension/FSB_Extension.entitlements` for the extension target.
3. **Enable the App Group capability** on both targets and confirm the group id
   matches `$(TeamIdentifierPrefix)com.fullselfbrowsing.fsb`. Do this by hand in the
   two `.entitlements` files, not through the Signing & Capabilities UI — the
   sandbox keys live there and Xcode rewrites the file when you toggle a
   capability. In particular `com.apple.security.files.bookmarks.app-scope` has no
   build-setting equivalent and is what `GrantedRoots` needs to persist and
   resolve folder grants; drop it and `upload_file` silently reports
   `no_granted_folders` forever. `tests/safari-source-parity.test.js` asserts both
   files still declare it.
4. ~~Replace the static Resources copy~~ — **already done.**
   `FSB Extension/Resources` is a symlink to `../../../build/safari`, so the
   existing pbxproj path resolves to the generated payload with no Xcode
   surgery. The converter's `--copy-resources` had duplicated all 518 files
   (30 MB) into the tracked project; that copy is gone and
   `tests/safari-source-parity.test.js` now fails if it comes back. Run
   `npm run build:safari` before building, or the link dangles.
5. ~~Apply `Config/Version.xcconfig`~~ — **already done.** Project-level Debug
   and Release configurations feed both targets' `MARKETING_VERSION` /
   `CURRENT_PROJECT_VERSION` values.
6. ~~Set the deployment target to macOS 14.0~~ — **already done** at the
   project level for both targets.
7. For local dev: *Signing → Sign to Run Locally*, then in Safari enable
   *Develop ▸ Allow Unsigned Extensions*. No Developer Program needed until you
   distribute.

Do **not** re-run the converter with `--force`: it clobbers the Swift above AND
reintroduces the 30 MB duplicate payload.
`npm run build:safari` refreshes the payload in place.

## Distribution

Both channels come from the same archive:

```
node scripts/release-safari.mjs --archive
node scripts/release-safari.mjs --export=developer-id --notarize --profile=<notarytool-profile>
node scripts/release-safari.mjs --export=app-store
```

**Ship Developer ID first.** App Review is a real risk for FSB — `<all_urls>`
host permissions, `nativeMessaging`, a localhost socket to an out-of-band
server, and browser automation as the core function. Treat App Store approval
as upside, not a dependency.

## Known gaps

- **`upload_file`** — implemented, but **requires a folder grant**. See
  "File uploads" below. (`drop_file` is unaffected: it is a `_route:'content'`
  DOM tool that synthesizes dropzone content and never used CDP.)
- **`network_capture`** — unavailable. Capture returns
  `RECIPE_CAPTURE_UNAVAILABLE`, after the consent gate has run. Safari 18's
  `webRequest` is non-blocking and exposes no response bodies, so there is no
  CDP `Network` domain to replace it, and the build does not request
  `webRequest` at all. The consent gate, redactor and bounds port unchanged;
  only the transport is missing.
- **Device memory**: `chrome.system.memory` is Chrome-only, so the agent-cap
  recommendation (`utils/agent-cap-recommendation.js`) falls back to its
  default. `get_memory_stats` is unaffected: it reports FSB's memory store.
- **`capture_screenshot`**: the visible viewport only. Without CDP,
  `utils/screenshot-capture.js` captures through `tabs.captureVisibleTab`:
  `viewport` is that image, `region` and `element` are cropped out of it at
  device pixels, and FSB's overlays are hidden for the capture as on Chrome.
  `full_page`, device emulation and targets that are not on screen return
  `INVALID_SCREENSHOT_ARGUMENTS` or `SCREENSHOT_REGION_OUT_OF_BOUNDS`, and a tab
  that is not the active one returns a retryable `SCREENSHOT_CAPTURE_FAILED`
  that says to `switch_tab` first. Safari paints nothing while its window is
  covered or minimized, so the wait for the page's next frame is cut short after
  2 s there: the capture still succeeds, with `SCREENSHOT_SETTLE_INCOMPLETE`
  (2.4 s on a covered window, where it used to hang until the caller's 45 s
  timeout). A browser that returns no frame within 5 s gives a retryable
  `SCREENSHOT_CAPTURE_FAILED`, and a page that answers nothing hits the same
  15 s deadline as the CDP path, as `PAGE_UNRESPONSIVE`.
- **Trusted input** — `press_key`, the drag family and `scroll_at` dispatch
  untrusted DOM events. They report `trusted:false, degraded:true` rather than
  claiming success, and will not work on sites gating on `event.isTrusted` or
  inside cross-origin iframes.
- **Dashboard remote control** — the relay now runs through the container app
  (see "MCP on the same port"); not yet verified on device. Clicks, typing and
  scrolling from the dashboard run the same untrusted DOM fallbacks. A click
  moves focus the way a real one does. Backspace, Delete, Enter and Tab are
  performed when the page leaves the keydown alone; arrow keys are not, and
  nothing reaches into iframes. A miss on the page is logged and the session
  stays up.
- **Telemetry** — Safari installs send the same anonymous payload as Chrome and
  are counted, but nothing in it names the browser, so the two cannot be told
  apart.
- **MCP pairing and delegated agent runs** — unavailable; see "MCP on the same
  port".
- **Pre-existing, not Safari-specific:** `ui/speech-to-text.js` sends
  `stt-start` / `stt-stop`, but no `background.js` handler relays them to
  `content/stt-recognition.js`. The content-script STT path is dead on Chrome
  today; the Safari port neither fixes nor worsens it.

## File uploads

Chrome sets a file input with CDP `DOM.setFileInputFiles`, handing the browser
process an absolute path. Safari has no CDP, and page JavaScript cannot read the
filesystem, so the bytes must come from native code — and **App Sandbox forbids
the extension from reading arbitrary absolute paths.** That is true for the
direct-download build too, not just the App Store one: the extension target is
sandboxed either way.

So the user grants folders once, in the FSB app ("Grant Folder Access…"). The
grant is stored as a security-scoped bookmark in the shared App Group and
resolved by the extension process.

**Two independent constraints apply, in this order (the first one twice):**

1. `background.js executeUploadFile()` runs the sensitive-path denylist + audit
   chokepoint, in the service worker, before any native message is sent. This is
   unchanged from Chrome. A denied path never reaches the native host.
2. `FileReadService` serves the file only if it is contained by a granted root.
   Containment is checked on symlink-resolved paths at a path-component
   boundary, so neither `…/Downloads-old` nor a symlink planted inside a granted
   folder can escape the grant. The path is resolved only after the root's
   security-scoped access starts: before that the sandbox hides the link, and
   `resolvingSymlinksInPath` quietly returns it unresolved.
3. The host reports the resolved path back, and the denylist runs again on it
   before any chunk is fetched. A link inside a broad grant (say `~`) can be
   named `notes.txt` and point at `~/.ssh/id_rsa`, and step 1 only ever saw
   the name.

The read is a handshake plus N chunk fetches (`readFile` → `readChunk`) because
Safari caps a single native message near 1 MB; files are bounded at 32 MB. The
content script then builds a real `File`, puts it in a `DataTransfer`, and
assigns `input.files` — the one in-page route that works.

Result shape is honest: `method: 'dom_set_file_input'`, `trusted: false`,
`degraded: true`. A site gating on `event.isTrusted` will still refuse the
upload even though `input.files` is genuinely populated. Refusals are typed
(`no_granted_folders`, `outside_granted_folders`, `file_too_large`, …) so the
agent gets something actionable rather than a generic failure.

One cosmetic wart: the `upload_file` tool DESCRIPTION in
`extension/ai/tool-definitions.js` still says it works "via the browser DevTools
protocol (DOM.setFileInputFiles)", which is only true on Chrome. It is left
alone on purpose — `tests/tool-definitions-parity.test.js` pins a SHA-256 over
the whole registry, cross-checked against `mcp/ai/tool-definitions.cjs`, so
editing the prose would break two files. The model learns the truth from the
result anyway (`method: 'dom_set_file_input'`, `trusted: false`). The same stale
prose appears in `extension/site-guides/utilities/file-upload.js`.

Granted folder paths are deliberately **not** sent back over the wire or written
to any log or audit record — `executeUploadFile` keeps filesystem structure out
of its results by design, and the app already lists the roots in its own UI.

## Must be verified on-device

| # | Question | Fallback if it fails |
|---|---|---|
| V1 | Does `connect-src ws://localhost:7225` unblock the direct WebSocket on Safari 26? | probe pins to native |
| V2 | Does Safari keep ONE host process alive per `connectNative` port? | move the socket to the app over XPC |
| V3 | Real single-message ceiling, and the failure mode (silent drop?) | lower `maxFrameBytes` via the `opened` frame |
| V4 | Does sandboxed `URLSession` reach `localhost:7225`, and which process does the Local Network prompt name? | — |
| V5 | Does the `Origin` the host sets on its `URLRequest` reach the server unchanged? | none: without it the server treats the socket as a relay and refuses it as the extension |
| V6 | Does `content_scripts.world:"MAIN"` work on Safari 26? The converter warns it does not, but MDN records support from Safari 18. | register the MAIN-world script via `scripting.registerContentScripts` (Safari 16.4+) |
| V7 | Does `port.onDisconnect` fire on SW eviction, or only explicit disconnect? | app-side inactivity timer closes :7225 |
| V8 | Can the **extension** process resolve a security-scoped bookmark the **app** created, via the App Group? This is the documented pattern, but it is the one part of upload_file that cannot be unit-tested. | fall back to `NSOpenPanel` per upload (worse UX, still functional) |
| V9 | After Safari evicts the background worker, does the dashboard relay come back within about a minute (reconnect alarm, then the arm on worker start)? | the 5-minute telemetry alarm also wakes the worker, and that start arms the relay |
| V10 | Does `resolveTargetTab` return the last content tab, and does `tabs.query` report the workspace window's `safari-web-extension://` URL? | the adapter rules out the workspace's tab by its window id as well as its URL, and a tab with no URL is never streamed |
| V11 | Does Safari apply `left` / `top` / `width` / `height` from `windows.create` for a popup-type window and from `windows.update` for a normal one, and report them back from `windows.get`? | the adapter reads the bounds back and leaves the workspace floating, as before |
| V12 | Does `ui/sidepanel.html` run inside a web page as the in-page panel, with its tab and window lookups routed through the worker? | the workspace window |

### Results (Safari 26.5, macOS 26.6, ad-hoc signed Debug build)

Driven through MCP against a local test page, with this branch's server as the
hub on :7225.

| # | Result |
|---|---|
| V1 | No. The direct WebSocket deadlocks the worker's process (see "MCP on the same port"); with the worker guard the bridge pins native on its first attempt. |
| V2 | Yes. One `FSB Extension` process (same PID for 6+ hours) served every native port. When the worker recycled, the host saw its port torn down and the same process took the next one. |
| V3 | Results of 0.5, 1.5 and 3 MB crossed the native transport intact in 350 to 430 ms, so chunking works past the ~1 MB single-message ceiling. The raw ceiling itself was not probed. |
| V4 | Yes. The sandboxed host reached `localhost:7225`; loopback is exempt from the Local Network prompt. |
| V5 | Yes. The hub registered the host's socket as the extension, not as an Origin-less relay. |
| V6 | Yes. `canvas-interceptor.js` ran in the page's main world (`window.__canvasInterceptorInstalled === true`). |
| V7 | Partly. On a worker recycle the host saw the port close and :7225 was re-dialled; the extension reconnected and re-armed (`lastWakeReason: delegation-authority-ready`). After a hub restart it reconnected in about 12 s. |
| V8 | Not verified: needs "Grant Folder Access" in the app. Without a grant, `upload_file` returns the typed `no_granted_folders` refusal. |
| V9 | Not verified yet. The relay could not run in the Safari worker at all; it now runs through the app on the `relay` channel. The host side is covered by tests/safari-native-bridge-channels.test.js, the Safari side still needs a device run. |
| V10 | Not verified: needs the workspace window. |
| V11 | Not verified yet: needs a toolbar click on a device, in a window that is not full screen. |
| V12 | Yes for the page itself: `ui/sidepanel.html` loads in a frame the content script adds, on a plain page, under `frame-src 'none'` and under Trusted Types, and its own non-web-accessible scripts load. The panel rendered and reported READY inside a full-screen window, with the host page intact. The toolbar toggle and the put-back after navigation are covered by tests and still need a click on a device. |
