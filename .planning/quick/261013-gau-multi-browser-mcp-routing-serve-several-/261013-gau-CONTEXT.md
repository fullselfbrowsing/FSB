# Quick Task 261013-gau: Multi-browser MCP routing - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Task Boundary

Serve several browsers (Chrome, other Chromium-family browsers, Safari) from one
MCP server at the same time, pair each one, and route every MCP call to the
right browser, including Safari pairing.

Today the MCP bridge hub (`mcp/src/bridge.ts`) holds exactly one extension
socket (`extensionClient`), and `~/.fsb/bridge-auth.json` pins exactly one
`allowedExtensionOrigin`; any other browser Origin gets a 403 at the upgrade,
paired or not. Safari cannot pair at all: its native messages reach the
sandboxed FSB app, which cannot read `~/.fsb`, and Safari regenerates the
extension's `safari-web-extension://<UUID>` on every browser launch.

</domain>

<decisions>
## Implementation Decisions

### Default browser for a call
- A call that names a tab, an agent/session, or a visual session goes to the
  browser that owns it. Ownership always wins.
- A call that names none of those, with several browsers connected, goes to the
  **most recently focused** browser: each extension reports when one of its
  windows gains focus. With one browser connected, behaviour is unchanged.
- Never broadcast a call to every browser.

### How tabs are addressed
- `tabId` stays a **number**. `list_tabs` (and any tab listing) adds a
  `browser` field, and tab-taking tools accept an optional `browser` argument.
- With one browser connected, nothing changes for clients.
- A numeric tabId that exists in more than one connected browser is
  **refused** with a clear "ambiguous tab, pass browser" error unless
  `browser` disambiguates. Never guess.

### Safari pairing-code source
- **One-time folder grant in the FSB app**: the user grants `~/.fsb` once in
  the container app (NSOpenPanel with hidden files shown), stored as a
  security-scoped bookmark in the App Group, reusing the `GrantedRoots`
  mechanism uploads already use.
- The Safari extension's native handler resolves that bookmark and reads the
  current pairing code itself on each bootstrap. The secret is created when no
  `bridge-auth.json` exists (`prepareBridgeAuth` in `mcp/src/index.ts`) and
  changes on `fsb-mcp-server pair --reset`; reading it fresh each time means
  Safari follows a reset without the user doing anything.
- Must work for both the App Store and Developer ID builds (no sandbox
  temporary-exception entitlement).

### Settled earlier in this branch's discussion (carried forward)
- Bridge auth keeps one pin **per browser** instead of one global pin.
  Safari's pin is scheme-level (`safari-web-extension://`), because its UUID
  changes per launch; the 256-bit pairing secret is the real check there.
  Chromium-family pins stay exact-origin.
- Chrome, Brave, Edge and Chromium share one origin when installed from the
  Chrome Web Store (`chrome-extension://badgafnf…`), so each extension must
  identify its browser itself on connect (e.g. `navigator.brave`,
  `navigator.userAgentData.brands`, `FsbPlatform.id`).
- The native transport must carry the pairing subprotocols
  (`[fsb-ext-v1, fsb-auth.<secret>]`) in its `open` frame;
  `MCPSocketSession` sets `Sec-WebSocket-Protocol`, and a lingering native
  socket is adopted only when its protocols match the new port's.

### Claude's Discretion
- Wire format for browser identity and focus reports (extension → server).
- How `pair --reset` addresses one browser versus all, and the
  `bridge-auth.json` schema migration (existing single-pin files must keep
  working; `native-host/bootstrap.ts` validates the same file and must accept
  the new shape).
- Where routing lives in `mcp/src` (hub versus tool layer), keeping the
  `mcp/src` diff as small as the schema change allows (user preference:
  the extension does the heavy lifting).
- Delegated agent runs on Safari: pairing will let a paired Safari send
  `agent-spawn` requests to an already-running delegation daemon, but waking
  the daemon from Safari (the Node native host's job on Chrome) is out of
  scope unless it falls out naturally.
- Status/doctor output for several connected browsers.

</decisions>

<specifics>
## Specific Ideas

- The user's framing: "choose which browser to call smartly without blindly
  firing things". Ownership first, then most recently focused, never all.
- Published `fsb-mcp-server` 0.11.1 still rejects `safari-web-extension://`
  origins. The allowlist exists only on this branch, so this work ships with
  an MCP release.
- Tool-definition changes are pinned by a SHA-256 over the whole registry,
  cross-checked between `extension/ai/tool-definitions.js` and
  `mcp/ai/tool-definitions.cjs` (`tests/tool-definitions-parity.test.js`);
  adding a `browser` argument must update both sides and the pin.

</specifics>

<update date="2026-11-16">
## What was built, and what changed from the above

Built on `safari-extension-port` for Chrome and Safari. Chrome profiles and
other Chromium browsers are left for later, and Safari pairing is a separate
change.

- **Browser identity comes from the Origin scheme**, not from a frame the
  extension sends after connecting. The slot key is the browser kind
  (`chrome`, `safari`), so there is no pending-identity state and the Chrome
  extension that is already installed works unchanged. Chrome, Brave and Edge
  therefore still share one slot. The roster carries each install id, which is
  the key for profiles later.
- **The `browser` argument is on three tools only**: `open_tab`, `list_tabs`
  and `run_task`. Every other tool follows its tab or the session's current
  browser. This replaces "tab-taking tools accept an optional `browser`
  argument": about 55 tool descriptions would have grown in every client's
  context. It is added in the MCP layer, so the registry and its pin are
  untouched.
- **A session's current browser is the one its last call used**, and it is kept
  on the `AgentScope`, because one HTTP process serves many sessions. Added
  ahead of "most recently focused": `FSB_BROWSER` from the client's config.
- **"Most recently focused" applies only when every attached browser reports
  focus.** Until then the default is Chrome. Found on a device: with Safari
  reporting and the installed Chrome extension not, a client on the published
  server was given Safari. Agents that have always driven Chrome must not move
  the day Safari attaches.
- **A decided browser that is away is an error**, never a fallback. The browser
  is chosen once per call and reused for the registration, the send and the
  `AGENT_NOT_REGISTERED` retry.
- **Tabs are matched from what the session has seen**, not from a hub-wide list
  of tab ids, so the extension reports no tab ids. The ambiguous case has its
  own code, `AMBIGUOUS_TAB_BROWSER`: `AMBIGUOUS_TAB` already means something
  else.
- **Focus is sampled, not listened for.** The extension reads
  `windows.getLastFocused()` when it sends its state frame (on connect and on
  every keepalive). A focus listener would wake the service worker on every
  window switch, and Safari does not deliver one reliably (WebKit 263170).
- **`bridge-auth.json` is untouched and there is no sidecar yet.** With no pin,
  each browser attaches unpaired. With a pin, only the pinned browser attaches,
  and binding a pin closes any other attached browser.
- **Safari pairing: not the folder grant.** The research found that a
  security-scoped bookmark made by the app cannot be resolved by the extension
  process. Planned instead: a short code the server prints and the user types
  into FSB in Safari.

Tests: `tests/mcp-bridge-topology.test.js` (nine multi-browser cases),
`tests/browser-routing.test.js`, `tests/mcp-bridge-client-lifecycle.test.js`
(focus report).
</update>

<canonical_refs>
## Canonical References

- `safari/README.md`: "MCP on the same port", the known gaps, and the
  on-device verification table (V1–V10).
- WebKit bug 244330: Safari resets the extension UUID on every launch
  (https://bugs.webkit.org/show_bug.cgi?id=244330).
- Apple Developer Forums thread 670165: Safari web extension URL and UUID
  behaviour (https://developer.apple.com/forums/thread/670165).

</canonical_refs>
