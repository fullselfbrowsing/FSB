---
phase: 59
status: issues_found
depth: deep
files_reviewed: 12
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
---

# Phase 59 Code Review

## Verdict

Phase 59 is not ready to close. The reverse-frame correlation and per-frame session revalidation are generally fail-closed, but connection classification still lets an unprivileged socket take over the legacy extension slot. A second reconnect race can let a late close from an old socket tear down the state of its replacement.

## Findings

### Critical: An unauthenticated or Origin-less socket can displace the active extension

- **File:** `mcp/src/bridge.ts:543`
- **Evidence:** `_classifyUpgrade` deliberately accepts Origin-less Node sockets and exact-Origin browser sockets without a valid credential as unprivileged. In `_handleNewConnection`, any first frame other than `relay:hello` immediately calls `_registerExtensionClient` (lines 543-565). `_registerExtensionClient` then unconditionally closes the existing extension and assigns the unprivileged socket to `extensionClient` (lines 606-617). The timeout path has an active-extension guard (lines 580-585), but the first-message path does not. Consequently, a local Origin-less client can connect and send `{}` (or an unauthenticated exact-Origin socket can send any non-relay frame), close the authenticated extension, receive subsequent legacy MCP requests, and send spoofed MCP responses. This contradicts the Phase 59 decision that Origin-less connections may proceed only through the short relay-handshake classification and gain no extension authority, and it violates the trust guarantee that socket creation does not imply trust.
- **Fix:** Make classification authoritative before registering the extension role. Origin-less sockets must successfully send a strictly validated `relay:hello` within the relay timeout or close; they must never fall through to `_registerExtensionClient`. For browser sockets, prevent an unprivileged socket from replacing an authorized/current extension (or require current authorization for replacement). Add real-socket regressions for both immediate-message and timeout paths, asserting that no-Origin and wrong/absent-token sockets cannot change `extensionClient`, `connected`, registration counters, or the incumbent socket, and cannot receive/settle a legacy MCP request.

### Warning: A late close from a replaced client socket corrupts the new connection state

- **File:** `extension/ws/mcp-bridge-client.js:213`
- **Evidence:** The close handler only guards the `_ws = null` assignment with `if (this._ws === socket)`, then unconditionally marks the client disconnected, rejects every entry in `_extPending`, downgrades pairing state, stops the shared ping timer, and notifies waiters (lines 213-248). `_closeSocketForPairingReload` can time out after one second, clear the old `_ws`, and open a replacement while the old socket remains in CLOSING; when that old socket eventually emits `close`, it tears down the replacement's status and pending auth probe even though `this._ws !== socket`. This breaks the Phase 59 exact-once/reconnect contract and can leave a live paired socket reported as disconnected or expired.
- **Fix:** After removing the socket from `_replacementSockets`, return early for stale close events (`this._ws !== socket`) after only socket-local waiter cleanup. Only the current socket may mutate shared connectivity/pairing state, stop ping, or reject pending requests; alternatively reject only pending entries whose `pending.socket === socket`. Add a lifecycle test where pairing-close times out, the replacement opens and starts an auth probe, then the old socket closes; assert the replacement stays connected/paired and its pending request settles once.

## Reviewed Scope

Reviewed the Phase 59 implementation diff from `9ddc4c37`, concentrating on `mcp/src/bridge-auth.ts`, `mcp/src/bridge.ts`, `mcp/src/ext-protocol.ts`, `extension/ws/mcp-bridge-client.js`, the background/UI pairing path, and directly related topology, lifecycle, auth, and contract tests. Rotation/reset checks correctly compare accepted socket session and Origin against current auth state on each inbound `ext:*` frame, and reverse responses are removed from the pending map before settlement, but the findings above block the security foundation.
