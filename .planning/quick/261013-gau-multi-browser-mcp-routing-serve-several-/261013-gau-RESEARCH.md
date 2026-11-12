# Quick Task 261013-gau: Multi-browser MCP routing - Research

**Researched:** 2026-10-13
**Domain:** MCP bridge hub topology (Node `ws`), bridge pairing state, MV3 extension identity, Safari App Sandbox file access
**Confidence:** HIGH for the codebase map and routing design; MEDIUM for browser self-identification; LOW for the Safari folder grant until it is tested on a device (see Critical Finding 1)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Default browser for a call**
- A call that names a tab, an agent/session, or a visual session goes to the
  browser that owns it. Ownership always wins.
- A call that names none of those, with several browsers connected, goes to the
  **most recently focused** browser: each extension reports when one of its
  windows gains focus. With one browser connected, behaviour is unchanged.
- Never broadcast a call to every browser.

**How tabs are addressed**
- `tabId` stays a **number**. `list_tabs` (and any tab listing) adds a
  `browser` field, and tab-taking tools accept an optional `browser` argument.
- With one browser connected, nothing changes for clients.
- A numeric tabId that exists in more than one connected browser is
  **refused** with a clear "ambiguous tab, pass browser" error unless
  `browser` disambiguates. Never guess.

**Safari pairing-code source**
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

**Settled earlier in this branch's discussion (carried forward)**
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

### Deferred Ideas (OUT OF SCOPE)
None listed in CONTEXT.md. Waking the daemon from Safari is out of scope unless it falls out naturally (see Discretion).
</user_constraints>

## Summary

These findings should change the plan:

1. **The locked Safari grant fails as written.** `GrantedRoots.addGrant` creates an app-scoped bookmark (`.withSecurityScope` with `relativeTo: nil`, `GrantedRoots.swift:77`) in the container app, and the extension resolves it. Apple's documentation says such a bookmark "fails to resolve if the caller does not have the same code signing identity as the caller that created the bookmark" [CITED: developer.apple.com NSURL bookmarkData docs]. In September 2025, Apple DTS said app-scoped bookmarks "can only be opened by the executable that created them, which means a bookmark created by your main app can't be resolved by your helper process" [CITED: developer.apple.com/forums/thread/798402]. A 2016 DTS reply says the same thing, and the extension in that thread got error 259 [CITED: forums/thread/66259]. The FSB app and its `.appex` are separate executables with different bundle ids. Copying the upload mechanism for pairing will therefore fail, and the same reasoning says the **upload_file folder grant on the branch (README V8) is probably broken too.** The decision's intent can still be kept (one grant in the app, stored in the App Group, read fresh on every bootstrap), but it needs one of two mechanisms Apple supports. Both must be tested on a device first (see Open Question 1).
2. **Routing has to be decided before agent registration, in the calling MCP process, not only in the hub.** Each MCP process mints one `agentId` through `agent:register` (`agent-scope.ts` `ensure()`), and that id lives in the agent registry of the one browser that answered. Suppose browser A answered, and the process later sends a call to browser B. B replies `AGENT_NOT_REGISTERED`. The retry path (`agent-bridge.ts` `sendAgentScopedBridgeMessage`) then re-registers through the hub's default route, which picks A again, so the retry loops. Agent identity and ownership tokens therefore have to be **per browser**, and the process must know the target browser before `ensure()`. The hub broadcasts a browser roster to every MCP process, and one pure resolver function is shared by the hub and the tool layer.
3. **Keep `bridge-auth.json` exactly as it is (v1) and put the extra pins in a sidecar file.** Three things already read the v1 file with exact-key validators: older hubs (0.11.1 via `npx @latest`), the installed native host, and the packed delegation daemon. The native host also caps the file at 2048 bytes (`bootstrap.ts:5`). If any of them meets a reshaped file, it either refuses it (`bridge_session_unavailable`), or, in an older `serve` (`index.ts:433-434`), overwrites it with a new secret, which breaks pairing for every browser. So the first Chromium pin stays in `allowedExtensionOrigin`. The Safari scheme pin and any extra Chromium origins go in `~/.fsb/bridge-pins.json`, which is bound to the v1 `sessionId` and ignored when that id differs. With this layout `bootstrap.ts` needs no change.

**Primary recommendation:** Turn the hub into a multi-slot hub. Each slot is keyed by `installInstanceId`, which the extension reports after connecting. The hub publishes a roster (browser label, `focusedAt`, tab ids) in `relay:state`. Each MCP process resolves the target browser itself (explicit `browser`, then ownership, then the tab index, then most recently focused) and sends the result in an additive top-level `browser` field. AgentScope gets a `forBrowser(key)` method that returns a separate scope per browser. Inject the `browser` tool argument in the MCP registration layer, not in the shared tool registry.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Hold N extension sockets, liveness, per-slot rejection | MCP hub (`bridge.ts`) | — | Only the hub owns sockets; relays forward raw frames (`_handleRelayClientMessage` 1391-1440) |
| Pins, secret, origin policy | `bridge-auth.ts` + sidecar | `bootstrap.ts` (unchanged) | The v1 file stays compatible with old readers |
| Browser label, focus time, tab-id set | Extension (`mcp-bridge-client.js`) | — | The user wants the extension to do the heavy lifting; only the browser knows its brand and focus |
| Target resolution (explicit, ownership, tab, focus) | Shared pure resolver (`mcp/src/browser-routing.ts`, new) | Hub (for legacy messages that carry no `browser`) | The process must know the target before `agentScope.ensure()` |
| Per-browser agent identity and ownership tokens | MCP process (`agent-scope.ts`, `agent-bridge.ts`) | Extension registry (unchanged, one per browser) | The extension mints ids per browser; the process caches them per browser |
| `browser` tool argument and `list_tabs.browser` | MCP tool layer (`manual.ts`, `read-only.ts`, `triggers.ts`, `screenshots.ts`, `autopilot.ts`) | — | Keeps the shared registry and its SHA-256 pin, and the in-extension autopilot, unchanged |
| Safari pairing code | Safari `.appex` (Swift) | Container app (one-time grant UI) | The sandboxed extension process reads the secret; JS only asks for it |

## Critical Finding 1: Safari folder grant

| Mechanism | Works across app and `.appex`? | Notes |
|---|---|---|
| App-scoped bookmark made by the app, resolved by the extension (current `GrantedRoots`) | **No** [CITED: Apple bookmarkData docs; DTS 2016 and 2025] | This is the literal locked decision, and upload V8 uses it today |
| **M1: Document-scoped bookmark.** The app picks the *file* `~/.fsb/bridge-auth.json`. The bookmark uses `[.withSecurityScope, .securityScopeAllowOnlyReadAccess]` and is anchored (`relativeTo:`) to a document file inside the App Group container. The extension resolves it with the same anchor. | Yes, by Apple's documentation: "any sandboxed app that has access to the bookmark data itself, and has access to the document that owns the bookmark, can obtain access" [CITED] | DTS (2025): needs the `com.apple.security.files.bookmarks.document-scope` entitlement added by hand to both targets, must point at a **file, not a folder**, and cannot target `/Library/`, `/private/` or `/.ssh/` [CITED: forums/thread/798402]. **Risk:** `writeBridgeAuthState` replaces the file with an atomic rename (`bridge-auth.ts:92-110`), which creates a new inode. Untested whether the bookmark then resolves to the new file with access. |
| **M2: Handoff.** The app picks the *folder* `~/.fsb` and writes a bookmark with no security options (`[]`, implicit scope) into the App Group. On its next run the extension resolves it, then creates **its own** app-scoped folder bookmark, stores it, and deletes the handoff. | Yes, by the documented process-to-process pattern [CITED: "Share file access between processes with URL bookmarks"] | Unknown whether the implicit grant survives the app quitting. To cover that, the app can call `SFSafariApplication.dispatchMessage` while it is still running so the extension adopts the grant immediately [ASSUMED]. A folder grant survives atomic renames. This matches "grant `~/.fsb`" most closely and would also fix upload V8. |

**Prescriptive:** Hide the mechanism behind one Swift entry point, `PairingSource.readPairingCode() -> Result`, and make the on-device spike the first task of Wave 4 (`checkpoint:human-verify`). Try M2 first because it keeps the folder grant, then M1. Either way:
- Keep the pairing grant in its own store, not in `granted-roots.plist`. Otherwise `~/.fsb` becomes an `upload_file` root, which would leave `bridge-auth.json` protected only by the JS `/.fsb/` denylist.
- Inside the sandbox, `FileManager.homeDirectoryForCurrentUser` returns the **container**. Set `NSOpenPanel.directoryURL` from `getpwuid(getuid()).pw_dir` + `/.fsb`, and set `showsHiddenFiles = true` [ASSUMED].
- `~/.fsb/bridge-auth.json` exists only after `fsb-mcp-server serve` has run (`index.ts:433-434`; stdio mode never creates it). The app should say so when the file is missing.

## Integration points (confirmed; corrected line numbers)

| Location | What it does now | Change |
|---|---|---|
| `mcp/src/bridge.ts:124` `extensionClient`, plus scalar `connected`, `lastExtensionHeartbeatAt`, `extensionHeartbeatCount`, `extensionCloseCause`, `extensionAttachment`, `extensionLivenessTimer` (107-154) | One slot | All become per-slot fields in `Map<WsWebSocket, Slot>`. Keep a read-only `extensionClient` getter (sole slot, or the default slot) because tests read `hub.extensionClient` and `hub.extensionHeartbeatCount` directly (`mcp-bridge-topology.test.js` 1515, 1571, 1657, 1665). |
| `bridge.ts:271-320` `sendAndWait` | Sends to `this.extensionClient!` | Pick the slot from `msg.browser`, falling back to the resolver default. Record the target socket per pending id. |
| `bridge.ts:618-685` `_classifyUpgrade` | 403 when the origin differs from the single pin (628). `bindAllowedExtensionOrigin` **throws for any `safari-web-extension:` origin** (pattern `bridge-auth.ts:26`), so a paired Safari gets a 403 today. | Apply the per-scheme pin policy below. |
| `bridge.ts:733-760` `_handleNewConnection` | Refuses a second candidate while a slot exists (741) | Pending-identity handling (see Pitfall 3) |
| `bridge.ts:830-880` close handler | Rejects **all** pending requests with `'Extension disconnected'` | Reject only the closing slot's requests; keep the message text identical (`BRIDGE_DISCONNECT_MESSAGES` 70) |
| `bridge.ts:1086-1097` `mcp:extension-state` | Accepted only from `extensionClient`. `extensionId` must match `/^[a-p]{32}$/`, so **Safari's frame is silently dropped**. | Make it per-slot, add optional `browser` and `focusedAt`, and relax `extensionId` for safari origins (bounded string) |
| `bridge.ts:1196-1203` `_isCurrentExtAuthority` | Exact `allowedExtensionOrigin === origin` | sessionId match plus `isOriginPinned(origin)` (exact for Chromium, scheme for Safari) |
| `bridge.ts:1391-1440` relay forward | `this.extensionClient.send(raw)` | Route on `parsed.browser`. A missing slot returns `mcp:error` `browser_not_connected`. |
| `bridge.ts:1038-1060`, `1446-1458`, `types.ts:121-142` | relay state | Additive `browsers?: BrowserRosterEntry[]`. Old relays read named fields only and ignore it. `tests/mcp-reverse-channel-contract.test.js:376-381` pins only its own fixture objects. |
| `bridge-auth.ts:143-193` | rotate / bind / reset | `bindExtensionOrigin(origin)`: a Chromium origin goes into the v1 slot if it is empty, otherwise into the sidecar; Safari adds a scheme pin to the sidecar. Reset deletes the sidecar; rotate carries it over with the new sessionId. |
| `mcp/src/index.ts:444-480` `runPair` | One pin | List the pins. `--reset` keeps today's all-browser semantics. **`mcp/build/index.js` is force-tracked**: rebuild and commit it with any `index.ts` edit. |
| `mcp/src/native-host/bootstrap.ts:5-110` | Exact v1 keys, 2048-byte cap, mismatch → `extension_origin_mismatch` | No change if the sidecar is used. Optional: relax the mismatch check so a second Chromium extension id can pair (Chrome already gates the host by `allowed_origins`, one origin per manifest, `native-host-registration.ts:112`). |
| `mcp/src/agent-bridge.ts:137-165` | Single chokepoint for almost every tool | Resolve the browser, call `agentScope.forBrowser(key).ensure()`, then `sendAndWait({…, browser: key})` |
| `mcp/src/agent-scope.ts` | One `agentId`, `ownershipTokens: Map<tabId, token>`, `connectionId` | Add `forBrowser(key)` returning a child AgentScope from a lazy map. The root acts as the legacy `''` key, so single-browser behaviour stays byte-identical. |
| `mcp/src/tools/autopilot.ts:160-180` | The `sw_evicted` path waits on `bridge.isConnected` and sends `mcp:get-task-snapshot` with no target | Wait on `isBrowserConnected(key)` and send the snapshot to the **same** key. Otherwise any other connected browser satisfies the wait and the snapshot is read from the wrong browser. |
| `mcp/src/tools/manual.ts:262-300` | Forwards the **whole** `params` into `payload.params` | Strip `browser` before forwarding. `read-only.ts:26-60` builds payloads from named params and is already safe. |
| `mcp/src/client-inventory.ts:174`, `index.ts:402` | Pushes the inventory once to "the" extension | Push to each browser when it is identified (internal system message, not a user call) |
| `mcp/src/diagnostics.ts:798, 873, 1091`; `http.ts:129` | Single `extensionAttachment` | Keep the field (default browser) and add `browsers[]` for status and doctor |
| `extension/ws/mcp-bridge-client.js:279-281, 1138-1148` | Chrome: `new WebSocket(url)` unpaired, `[fsb-ext-v1, code]` when paired. The native path drops protocols (1141-1142). | **Do not change the Chrome construction.** Tests pin the single-argument constructor and the bare URL (`mcp-bridge-client-lifecycle.test.js:1038-1060`). Pass `protocols` to `FsbNativeBridgeSocket` only. |
| `mcp-bridge-client.js:1561-1565` `_sendExtensionState`; `background.js:5872` `getMcpAttachmentMetadata` | Sends `extensionId/version/installInstanceId/normalWindowCount` | Add `browser` and `focusedAt` |
| `mcp-bridge-client.js:1603-1625` `_handleMessage` | Destructures `{id,type,payload}` | A top-level `browser` on inbound messages is harmless. No strip needed. |
| `mcp-bridge-client.js:591-605` `_ensurePairingLoaded` | Chrome pairs only on delegation preflight (`background.js` ~2196-2260 via `FsbNativeHostWake.ensureBootstrap`) | Safari-only branch (inert on Chrome): `runtime.sendNativeMessage({t:'pairing'})` before **every** connect |
| `extension/ws/mcp-native-transport.js:179-188` | The `open` frame has `url, clientId, linger, origin` | Add `protocols` (array) only when it is given |
| `safari/FSB/Shared/BridgeCoordinator.swift:96-133` | Adopts any open socket (104) | Adopt only when `origin` and `protocols` match. **Pin:** exactly 3 `self.socket === session` in the `handleOpen` slice up to `// MARK: - extension -> server` (`safari-source-parity.test.js:276-277`). |
| `safari/FSB/Shared/MCPSocketSession.swift:46-60` | Sets `Origin` at 54 | Also set `Sec-WebSocket-Protocol` to `protocols.joined(", ")`. Apple: the `protocols:` initializer "is just a convenience for setting the `Sec-WebSocket-Protocol` header field" [CITED: forums/thread/784461] |
| `safari/FSB/FSB Extension/SafariWebExtensionHandler.swift:60-105` | Dispatches on `t` | New `case "pairing"` returns `{t:'pairing', ok, pairingCode}` or a typed reason (`no_pairing_grant`, `grant_unresolvable`, `bridge_session_unavailable`). Never log the code. |

## Recommended design (prescriptive)

### Auth: per-scheme pin policy (hub, `_classifyUpgrade`)
| Origin | No pin for this scheme | Origin pinned | Not pinned, other pins of the same scheme exist |
|---|---|---|---|
| `chrome-extension://X` | accept (unpaired OK); a valid secret binds X | accept (unpaired OK) | valid secret: accept and bind X into the sidecar; otherwise **403** (today's behaviour) |
| `safari-web-extension://*` | accept unpaired **only if no pins exist at all** (today's behaviour); a valid secret binds the scheme pin | **secret required** (any Safari extension matches a scheme pin) | — |

Chromium and Safari pins are judged separately. If Safari pairs first, a Chrome with no native host keeps working unpaired. Sidecar: `{version:1, sessionId, pins:[{origin, kind:'exact'|'scheme', boundAt}]}`, mode 0600, written atomically with the same helper as the v1 file, at most 16 pins. It is ignored when its `sessionId` differs from the v1 `sessionId`. That rule also cleans up after a `pair --reset` run by an old version.

### Hub slots and identity (post-connect, because tests forbid identity in the URL or subprotocol)
- A browser-origin socket with **no** existing slot of the same origin is registered immediately as a provisional slot. Old extension builds therefore work at once.
- A socket whose origin matches an existing slot goes into **pending identity** (not routable, not counted by `_registerExtensionClient`) until `mcp:extension-state` arrives or `identityTimeoutMs` passes (default ~1500 ms; tests can inject it, like `handshakeTimeoutMs`).
  - Identity arrives with a different `installInstanceId`: open a new slot (Chrome and Brave from the Web Store).
  - Same `installInstanceId`: replace the old slot if `newcomer.extAuthorized || !incumbent.extAuthorized`, otherwise close with 1008.
  - Timeout (legacy socket): the same contest rule, applied only against **unidentified** slots of the same origin. This keeps `runUnprivilegedCannotDisplaceExtension` passing as it is today.
- Slot key: `browser` label, plus `-<first 4 hex of installInstanceId>` only while two connected slots share a label. The key is deterministic, so it survives a hub restart or relay promotion.
- Cap at 8 slots and at 5000 tab ids per slot. Drop and log anything over the cap.

### Resolver (`mcp/src/browser-routing.ts`, pure, shared by the hub and processes)
Input: roster plus `{explicitBrowser?, tabId?, ownedBy?: string[], home?: string[]}`. Order:
1. Explicit `browser`: use it, or return `browser_not_connected` with the list of connected keys.
2. `tabId`: if this process's agent holds an ownership token for the tab in exactly one browser, use that browser. Otherwise use the roster tab index: one hit → that browser; more than one → `AMBIGUOUS_TAB` error naming the browsers ("ambiguous tab, pass browser"); none → step 4, and the extension returns its own not-found error.
3. No tab: the agent's "home". If it owns tokens in one browser, use that one. If several, use the most recently focused of them. A delegated child is pinned to the browser that started it (optional: the daemon sets `FSB_BROWSER` in the child's environment from the ext request's slot).
4. The most recently focused connected browser. Order by the extension-reported `focusedAt`, clamped to the hub's `now`. **Never by connect time**: an SW-eviction reconnect would otherwise move the default to a background browser.
- With a roster of 0 or 1 entries, or no roster at all (old hub), send without `browser`. That is exactly today's behaviour.
- trigger and stop_trigger: record `trigger_id → browser` from `trigger` results. `stop_task` and `get_task_status`: send to the browser running this process's `run_task`.

### Extension frames (additive; old hubs drop unknown id-less frames harmlessly at `bridge.ts:1124-1160`)
- `mcp:extension-state` gains `browser` and `focusedAt`.
- New `mcp:browser-state` `{type, focusedAt?, tabIds?}`, sent debounced (~250 ms) from `windows.onFocusChanged` (ignore `WINDOW_ID_NONE`), `tabs.onCreated`, `onRemoved` and `onReplaced`. Register the listeners in the bridge-client constructor, which runs synchronously at SW start.
- Persist `focusedAt` in `chrome.storage.session` so a reconnect after eviction reports the true last focus.
- Label detection: `FsbPlatform && FsbPlatform.id === 'safari'` → `safari`. Otherwise read `navigator.userAgentData.brands` (available on `WorkerNavigator` [CITED: MDN]): `Microsoft Edge` → `edge`, `Opera` → `opera`, `Brave` or a defined `navigator.brave` → `brave`, `Google Chrome` → `chrome`, anything else → `chromium`. Guard for Node harnesses, where `navigator` is undefined.

### Tool surface
Add `browser: z.string().optional()` in the MCP registration layer (`jsonSchemaToZod` callers) for every tool that takes `tab_id` (52 registry tools), plus `list_tabs`, `open_tab`, `run_task`, `stop_task`, `get_task_status` and the vault fill tools. **Do not edit `tool-definitions.js/.cjs`.** That avoids the SHA-256 pin (`tool-definitions-parity.test.js:53`) and keeps `browser` out of the in-extension autopilot's tool list. This departs from the CONTEXT note ("must update both sides and the pin"); see Assumption A6. `list_tabs` adds `browser` to every tab and, when two or more browsers are connected, a `browsers` summary (key, focused, tab count) so clients can discover the others without a broadcast.

## Common Pitfalls

1. **AgentScope thrash across browsers.** Covered in Summary point 2. It is invisible with one browser, so test with two.
2. **Rejecting every pending request on any close.** One browser's SW eviction would fail another browser's `run_task` with `sw_evicted:true`. Reject per slot, and keep the message text exactly the same.
3. **A same-origin newcomer evicting the paired incumbent.** Chrome and Brave share the Web Store origin, so keying by origin either drops Brave or lets an unpaired socket displace the paired one. Use pending identity (above).
4. **Responses spoofed across slots.** `_handleExtensionMessage` settles any `resp.id` from any socket. Record `id → target socket` and ignore responses from any other socket.
5. **Liveness timers are a single field.** `_stopExtensionLiveness()` at the start of `_registerExtensionClient` would kill another browser's reaper. Use one timer per slot. The slot-latch history (memory note: 58k refusals) came from exactly this class of bug.
6. **Relay requests during a disconnect.** Today the hub only deletes `messageOrigin` entries for relays (`bridge.ts:870-876`), so relay callers wait for their full timeout (600 s for `run_task`) and never get `sw_evicted`. Multi-slot must not make this worse. Optionally send `mcp:error` `'Extension disconnected'` to affected relays (an existing gap, not required).
7. **Mixed versions in the field.** Whichever process holds 7225 is the hub. A 0.11.1 hub (clients on `npx @latest`) or the **packed delegation daemon** (`~/.fsb/native-host`, port 7226) makes everything single-browser again. For UAT, every client and the reinstalled native host must run the branch build. Check the hub's binary first.
8. **Old relays connected to a new hub** send no `browser`. The hub routes them to the focused default (no tab awareness). This is acceptable, but document it.
9. **Safari `runtime.id` is not `[a-p]{32}`.** Unless the validator is relaxed, Safari never identifies itself and stays a legacy slot forever.
10. **The Safari adoption check.** Adopting a lingering socket that opened with an old secret (after `pair --reset`) or an old origin (after a Safari relaunch) would keep stale authority. Compare both, and discard on mismatch.
11. **Source pins.** Add no new extension file that needs another script import in `background.js` (pinned at 334/330), and never write that word in `background.js` comments. Safari-only JS must live in `extension/` behind inert-on-Chrome guards. Emitted files must be byte-identical (`safari-source-parity`).
12. **Focus edge cases.** Windows and some Linux window managers send `WINDOW_ID_NONE` before every window switch [CITED: MDN]. Ignore NONE. Do not let connect or heartbeat refresh `focusedAt`. Rate-limit focus frames (about 10/s) and accept them only from identified slots.
13. **CI runs Node 20.** Do not use Node 22+ globals in `mcp/src` or in tests.

## Runtime state a source change will not update
| Category | Item | Action |
|---|---|---|
| Stored data | `~/.fsb/bridge-auth.json` v1, possibly pinned to `badgafnf…` | None. The sidecar is additive. `pair --reset` remains the recovery path. |
| Installed packages | `~/.fsb/native-host` packed copy, and serve daemon on 7226 | Reinstall and restart before UAT (packed-copy trap) |
| Live processes | 7 MCP clients on `npx fsb-mcp-server@latest` 0.11.1 | Point them at the local build for UAT, or stop them so the branch build becomes the hub |
| OS / app state | Safari App Group grants (`granted-roots.plist`) | The new pairing grant uses its own store. Existing upload grants are untouched (and probably unusable, per V8). |
| Secrets | None renamed | — |

## Validation Architecture

Framework: plain Node test scripts (`node tests/*.test.js`). Bridge tests import `mcp/build`, so run **`npm --prefix mcp run build` first**.

| Area | Command | Status |
|---|---|---|
| Auth sidecar, scheme pin, v1 byte compatibility, old validator still accepts the file | `node tests/mcp-bridge-auth.test.js`; `node tests/mcp-native-host-protocol.test.js` | Extend existing files |
| Multi-slot: two browsers, pending identity, per-slot rejection and liveness, routing by `browser`, focus default, ambiguous tab, Safari pin requires the secret | `node tests/mcp-bridge-topology.test.js` | Extend. Update `runAcceptsSafariExtensionOrigin`, `runPairingAuthorityMatrix`, the reaper cases, and `extensionClient` reads. |
| Resolver | `node tests/browser-routing.test.js` | ❌ new (Wave 0) |
| Per-browser AgentScope, `browser` stripped from params, snapshot pinned to its browser | `node tests/agent-scope.test.js`, `action-tool-agent-scoped.test.js`, `list-tabs-agent-scope.test.js`, `autopilot-agent-scope.test.js` | Extend |
| Extension identity, focus and tabs frames; Safari pairing branch; Chrome constructor unchanged | `node tests/mcp-bridge-client-lifecycle.test.js`; `node tests/mcp-native-transport.test.js` | Extend |
| Swift pins (handleOpen count, entitlements, pairing case) | `npm run test:safari` | Extend `safari-source-parity` |
| Registry unchanged | `node tests/tool-definitions-parity.test.js` | Must stay green untouched |
| Phase gate | `npm test` (with the 7225 hub up; see memory) | — |

Manual, on device: V11 pairing grant mechanism (M2, then M1) survives a Safari relaunch and `pair --reset`. V12 `Sec-WebSocket-Protocol` set by hand reaches `ws` and `didOpenWithProtocol` reports `fsb-ext-v1`. V13 `windows.onFocusChanged` fires in Safari and Chrome on app switch (macOS).

## Suggested plan waves (sequential)
1. **Hub and auth.** Sidecar pins and per-scheme policy (`bridge-auth.ts`). Multi-slot hub with pending identity, per-slot pending, liveness and attachment, routing on `msg.browser`, roster in relay state (`bridge.ts`, `types.ts`). Topology and auth tests. No extension change is needed to test this, because test sockets send `mcp:extension-state`.
2. **Process routing and tools.** `browser-routing.ts`, `AgentScope.forBrowser`, `agent-bridge` resolution, `browser` argument injection and stripping, `list_tabs.browser` and `browsers`, `AMBIGUOUS_TAB` / `browser_not_connected` in `errors.ts`, autopilot snapshot pinning, per-browser inventory push, status and doctor `browsers[]`, `runPair` pin listing. Rebuild the force-tracked `mcp/build/index.js` if `index.ts` changes.
3. **Extension identity.** Label detection, `focusedAt` persistence, `mcp:browser-state`, the extended `extension-state`. The native transport carries `protocols`. Safari `_ensurePairingLoaded` branch.
4. **Safari native pairing.** On-device spike checkpoint (M2, then M1). `PairingSource`, `case "pairing"`, `Sec-WebSocket-Protocol`, adoption only on matching protocols and origin, app UI "Connect FSB to the MCP server…" with its own store, entitlements if M1. README updates (remove "One browser at a time", add V11-V13, record the V8 finding).

## Security Domain
| ASVS | Applies | Control |
|---|---|---|
| V4 Access control | yes | Per-scheme pins. The Safari scheme pin always requires the secret. `_isCurrentExtAuthority` is checked per frame (existing). |
| V5 Input validation | yes | Exact-key validators on the new frames: label enum, bounded `tabIds` integers, `focusedAt` safe integer ≤ now, slot and tab caps |
| V6 Cryptography | yes | Existing `timingSafeEqual` secret comparison. No new crypto. The secret is never logged (Swift reader, JS, hub). |

| Threat | Mitigation |
|---|---|
| Rogue extension becomes the focused default and receives tool calls | Pin policy. Unpinned Chromium origins need the secret once any Chromium pin exists. |
| A browser answers another browser's request id | Bind each response to the socket it was sent to |
| Pairing secret readable through `upload_file` | Separate grant store, plus the existing `/.fsb/` denylist |
| Focus-report flooding or spoofing | Rate limit; identified slots only |

## Environment Availability
| Dependency | Needed by | Available | Version |
|---|---|---|---|
| Node | MCP build and tests | ✓ | v24.14.1 locally; CI uses Node 20 |
| Xcode | Wave 4 Swift build | ✓ | Xcode 27.0 |
| Safari with the unsigned-extension toggle, plus a second Chromium browser | UAT (V11-V13) | needs a human | — |

No new npm or Swift packages, so the package legitimacy audit does not apply.

## Assumptions Log
| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | The M2 implicit-bookmark handoff stays valid long enough, or the `dispatchMessage` nudge works for Safari **web** extensions | Critical Finding 1 | Fall back to M1. If both fail, the user must revisit the locked decision. |
| A2 | A document-scoped bookmark to `bridge-auth.json` survives the atomic-rename rewrite | Critical Finding 1 | Safari pairing breaks on every `pair --reset`. Mitigation: M2, or an in-place-written pairing file. |
| A3 | Chrome fires `windows.onFocusChanged(windowId)` when the macOS app is activated, and Safari does too | Extension frames | The focus default goes stale. Fallback: also report on `tabs.onActivated`. |
| A4 | Brave reports a `Brave` brand in `userAgentData.brands` (Vivaldi and Arc report as Chrome) | Label detection | The label is wrong, but routing still works by `installInstanceId` |
| A5 | Safari `runtime.id` is a bundle-id string (≤128 chars) | Pitfall 9 | Set the validator bound accordingly |
| A6 | The user accepts `browser` added in the MCP layer instead of in the shared registry | Tool surface | Otherwise edit both registry files and the SHA pin, and the in-extension autopilot sees `browser` |
| A7 | Inside the sandbox, `homeDirectoryForCurrentUser` returns the container path | Critical Finding 1 | The panel opens in the wrong folder (UX only) |

## Open Questions
1. **Safari grant mechanism (blocking for Wave 4).** The literal locked approach is documented not to work. Recommendation: keep the intent and use M2 or M1, chosen by the on-device spike. Confirm this with the user before Wave 4.
2. **`list_tabs` with no `browser` and several browsers connected.** It returns the focused browser's tabs plus a `browsers` summary (honours "never broadcast"). Aggregating across browsers would be friendlier but is a read broadcast. Recommendation: summary, not aggregation, unless the user says otherwise.
3. **`pair --reset` scope.** Recommendation: all browsers only (the shared secret rotates). Defer per-origin pin removal; it adds little security, because a valid secret re-pins automatically.
4. **Upload V8.** The same bookmark flaw almost certainly affects `upload_file` on Safari. Fix it here (if M2 is chosen, the fix is shared) or file it separately.

## Sources
- Apple, NSURL `bookmarkData(options:includingResourceValuesForKeys:relativeTo:)`: app-scoped vs document-scoped resolution rules. https://developer.apple.com/documentation/foundation/nsurl/bookmarkdata(options:includingresourcevaluesforkeys:relativeto:)
- Apple, CFURLCreateBookmarkData (same rule). https://developer.apple.com/documentation/corefoundation/cfurlcreatebookmarkdata(_:_:_:_:_:_:)
- Apple, Accessing files from the macOS App Sandbox: implicit-scope bookmarks passed between processes; document-relative bookmarks; App Group rules. https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox
- Apple Developer Forums 798402 (DTS, Aug-Sep 2025): app-scoped bookmarks bound to the creating executable; document-scope entitlement, file-only, blocked directories. https://developer.apple.com/forums/thread/798402
- Apple Developer Forums 66259 (DTS 2016): "ONLY valid within the app that created it", error 259 in an extension. https://developer.apple.com/forums/thread/66259
- Apple Developer Forums 784461 (Frameworks Engineer, May 2025): protocols are a convenience for the `Sec-WebSocket-Protocol` header. https://developer.apple.com/forums/thread/784461
- MDN, WorkerNavigator.userAgentData; windows.onFocusChanged (`WINDOW_ID_NONE` caveat). https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/userAgentData, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/onFocusChanged
- Brave detection via brands / `navigator.brave` (LOW, community). https://ctrl.blog/entry/brave-user-agent-detection
- Codebase: every file:line above was verified on branch `safari-extension-port` at 5e4c7635.

## Metadata
- Codebase integration map: HIGH (read directly)
- Hub, auth and routing design: HIGH. It follows from the code's own constraints: tests forbid identity in the URL or subprotocol, the v1 readers are exact-key, and AgentScope holds a single id.
- Safari grant mechanism: LOW until tested on a device; the negative finding about the current approach is HIGH (Apple docs plus DTS)
- Valid until: about 30 days (bridge code changes quickly on this branch)
