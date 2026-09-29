# FSB for Safari

Safari build of the FSB extension. **`extension/` is the only source tree** —
this directory holds the Xcode project and the native host, and the browser
payload is generated into `build/safari/` by `npm run build:safari`.

```
npm run build:safari      # esbuild -> build/safari/ -> Version.xcconfig
npm run validate:safari   # manifest + JS syntax + Safari negative invariants
npm run test:safari       # 291 assertions across 8 suites
```

## Why there is no fork

15 test files read `extension/` source and assert on its exact contents. Two
pin counts: `background.js` is pinned to 309 script-import mentions / 305 call
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
      MCPSocketSession.swift       the real socket to ws://localhost:7225
      BridgeCoordinator.swift      relay + linger/adoption
      GrantedRoots.swift           security-scoped folder grants
      FileReadService.swift        sandbox-scoped chunked file reads
```

## MCP on the same port

The MCP server, the port (**7225**) and the wire protocol are identical to
Chrome. Only the pipe differs, and the extension picks it at runtime:

| transport | how | server changes |
|---|---|---|
| `ws` | `new WebSocket('ws://localhost:7225')` from the service worker | one line: `safari-web-extension://` added to the origin allowlist |
| `native` | the container app holds the socket; frames relayed over `runtime.connectNative` | **none** |

Safari's ability to open `ws://localhost` from an extension page is genuinely
undetermined — Apple forum reports of CSP refusals run from Safari 14 through
2025, but none tried an explicit MV3 `extension_pages` `connect-src` (which the
build now emits). So the extension **probes**: direct first, pin to native
after two failures, remember the decision in `chrome.storage.local` for 7 days.
Worst case is ~7 s once per install.

The native path needs no server change because `URLSessionWebSocketTask` sends
no `Origin` header, and the server accepts origin-less clients. That branch in
`mcp/src/bridge.ts` is marked load-bearing — do not "harden" it away.

**Socket lifetime is slaved to port lifetime, deliberately.** If the app kept
:7225 open across a service-worker eviction, the hub would never see a close,
`sendAndWait` would sit until its 30 s timeout, and that timeout string is not
in `BRIDGE_DISCONNECT_MESSAGES` — so the server's `sw_evicted` recovery would
never arm. A 3 s linger (under the extension's 10 s staged-release grace) makes
the common evict-and-revive case adopt the live socket instead of redialling.

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
- **`network_capture`** — degraded to metadata. Safari 18's `webRequest` is
  non-blocking and exposes no response bodies. The existing consent gate,
  redactor and bounds all port unchanged; only the transport is missing.
- **`get_memory_stats`** — `chrome.system.memory` is Chrome-only. Returns
  `capability_unavailable`.
- **Trusted input** — `press_key`, the drag family and `scroll_at` dispatch
  untrusted DOM events. They report `trusted:false, degraded:true` rather than
  claiming success, and will not work on sites gating on `event.isTrusted` or
  inside cross-origin iframes.
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

**Two independent constraints apply, in this order:**

1. `background.js executeUploadFile()` runs the sensitive-path denylist + audit
   chokepoint, in the service worker, before any native message is sent. This is
   unchanged from Chrome. A denied path never reaches the native host.
2. `FileReadService` serves the file only if it is contained by a granted root.
   Containment is checked on symlink-resolved paths at a path-component
   boundary, so neither `…/Downloads-old` nor a symlink planted inside a granted
   folder can escape the grant.

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
| V5 | Does `URLSessionWebSocketTask` send an `Origin` header? | allowlist entry already shipped |
| V6 | Does `content_scripts.world:"MAIN"` work on Safari 26? The converter warns it does not, but MDN records support from Safari 18. | register the MAIN-world script via `scripting.registerContentScripts` (Safari 16.4+) |
| V7 | Does `port.onDisconnect` fire on SW eviction, or only explicit disconnect? | app-side inactivity timer closes :7225 |
| V8 | Can the **extension** process resolve a security-scoped bookmark the **app** created, via the App Group? This is the documented pattern, but it is the one part of upload_file that cannot be unit-tested. | fall back to `NSOpenPanel` per upload (worse UX, still functional) |
