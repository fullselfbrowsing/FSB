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
pin counts: `background.js` is pinned to 334 script-import mentions / 330 call
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

Safari tints any toolbar icon it detects as grayscale: it keeps only the alpha
channel and paints it gray, or the accent color while the extension is active
on the page. `icon*.png` are pure black and white, so the tile showed as a solid
square (and a letters-only template came out as tinted lettering). An icon with
some real color is shown as it is, so the Safari manifest's `action.default_icon`
points at `extension/assets/safari-toolbar-{16,19,32,38,48,64}.png`: the same
tile with a faint warm tint on every pixel (warm black plate, warm white
lettering), made by `scripts/generate-safari-toolbar-icons.py`. 16/32 and 19/38
are the toolbar's 1x and 2x, depending on the macOS version. `icons` keeps the
original tile: Safari Settings shows it untinted.

`utils/action-icon.js` animates the toolbar with `setIcon` frames. On a platform
whose adapter sets `caps.tintsGrayscaleToolbarIcon` it draws them from the
tinted 16 and 32, and dims without its grayscale filter, so every frame,
resting and dimmed included, stays in color. The orbit, sweep, ring and glow
are coloured already.

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
  that says to `switch_tab` first.
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
