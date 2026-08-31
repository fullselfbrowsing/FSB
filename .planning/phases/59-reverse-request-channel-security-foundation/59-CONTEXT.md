# Phase 59: Reverse-Request Channel & Security Foundation - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a security-first extension-to-daemon reverse-request channel to the existing `ws://localhost:7225` bridge before any process-spawn implementation exists. This phase delivers additive `ext:request` / `ext:response` / `ext:event` contracts, capability-based hub/relay routing, explicit pairing and session-secret rotation, strict WebSocket Origin/Host/loopback enforcement, log redaction, topology failure behavior, byte-freeze regression proof, and a permanent forbidden-flag CI gate. Agent adapters, child-process spawning, delegation UX/lifecycle, and native messaging remain downstream work.

</domain>

<decisions>
## Implementation Decisions

### Pairing and Secret Lifecycle
- Use explicit, user-mediated pairing; never silently trust the first browser connection. `fsb-mcp-server pair` generates a cryptographically random 32-byte credential encoded as base64url, and the Providers surface accepts the copied credential and reconnects the bridge. Pairing instructions must name the local-only trust boundary and never place the credential in a URL.
- Treat the credential as a daemon-session secret: `serve` rotates it on every startup, a successful pairing provisions it once for that daemon lifetime, and the extension stores only the current credential in `chrome.storage.session` rather than `chrome.storage.sync` or durable provider settings. Rotation invalidates prior credentials and returns the extension to an explicit unpaired state.
- Bind the first successful explicit pairing to the exact `chrome-extension://<chrome.runtime.id>` Origin observed on the authenticated upgrade. Persist only that allowed extension origin in a user-private daemon auth file with mode `0600`; a different extension ID requires an explicit reset/re-pair and can never replace the allowlist implicitly.
- Carry authentication only as an offered `Sec-WebSocket-Protocol` value alongside a stable protocol name such as `fsb-ext-v1`. The server selects the stable protocol, compares the credential in constant time, and never copies the credential into an `ext:*` payload, URL, status response, diagnostic snapshot, or console message.

### WebSocket Trust Boundary
- Bind the bridge only to loopback. The default becomes `127.0.0.1`, `localhost` remains a supported client address, and any configured bind host outside `127.0.0.1`, `::1`, or `localhost` fails before server startup. `0.0.0.0`, LAN addresses, and remote delegation are prohibited.
- Reject browser upgrades before connection registration or message handlers run unless `Origin` exactly equals the persisted `chrome-extension://<fsb-id>` allowlist entry and `Host` is exactly `127.0.0.1:<port>`, `localhost:<port>`, or the bracketed IPv6 loopback equivalent when IPv6 is supported. Case-fold hostnames, validate the configured port, and reject missing, duplicated, malformed, or attacker-controlled browser headers.
- Preserve internal Node relay compatibility: origin-less connections may proceed only through the existing short relay-handshake classification and gain no extension reverse-request authority. A browser-origin connection is always treated as an extension candidate and must pass Origin, Host, and session-secret checks before it can carry `ext:*` frames.
- Keep legacy daemon-to-extension MCP behavior compatible when the extension is unpaired, but fail every `ext:*` operation closed with a typed authentication/offline error. Pairing triggers a fresh socket so authority is fixed at upgrade time and cannot be elevated by an in-band message.

### Wire Contract and Topology Routing
- Define `ExtRequest`, `ExtResponse`, and `ExtEvent` as a separate additive bridge family rather than adding them to the frozen `MCPMessageType` union. Existing `MCPMessageType` values, `MCPResponse`, every tool schema, the `agent:register` response envelope, and existing serialized relay frames remain byte-identical.
- Use correlation IDs and typed method/event fields: `ext:request` carries `{ id, type, method, payload }`; `ext:response` carries the same `id` plus either a payload or a stable error object; `ext:event` carries the same request/session correlation plus an event name and payload. Unknown methods, malformed frames, duplicate active IDs, and oversize/non-object payloads are rejected before routing.
- Add only optional `capabilities` fields to relay topology messages. A process that will own the Phase 60 supervisor advertises `agent-spawn`; the hub handles locally when it owns that capability, otherwise forwards to the first currently connected capable relay in deterministic registration order, otherwise replies with `agent_provider_offline`. Phase 59 supplies a test-only/local handler seam but no spawn supervisor or child-process code.
- Track reverse routes separately from existing MCP `messageOrigin` state. Relay or hub loss deterministically settles affected requests with `bridge_topology_changed`/offline errors, removes route state, and does not silently replay a request that could become a duplicate future spawn. The extension pending map applies a bounded timeout and retries only when a downstream caller explicitly creates a new request ID.

### Redaction, Gates, and Verification
- Extend `redactForLog` with an explicit FSB bridge-secret token pattern and make every tracked diagnostic ring-buffer append sanitize its whitelisted string fields again at the sink. Server-side bridge/auth diagnostics log only state, token length, or a non-secret fingerprint when strictly needed; raw credentials never appear in thrown errors.
- Add drift tests that seed raw credential-shaped substrings through console/error contexts and every tracked diagnostics sink, serialize the result, and prove the substring is absent. Include URL-query, `token=`, authorization-like, and `Sec-WebSocket-Protocol: fsb-auth.*` fixtures even though the production design never uses URL or payload credentials.
- Add a permanent repository test/CI gate that recursively scans `mcp/src/agent-providers/**` and fails on the exact forbidden agent auto-approval flags named by CHAN-07. Keep the literals in the gate/test outside the scanned directory so future adapter code cannot suppress or whitelist them locally.
- Every bridge or extension change lands with its focused test and source-pin updates in the same atomic commit. Required automated evidence includes the full root test suite, an additive byte-freeze fixture, evil-Origin and evil-Host upgrade fixtures, unauthenticated/replayed/rotated-secret rejection, authenticated success, hub-exit and relay-exit reverse-route settlement, redaction drift, and forbidden-flag scanning. Any live Chrome/manual pairing checks are recorded without fabricated passes and deferred to the milestone-end UAT gate per the user's standing instruction.

### the agent's Discretion
- Exact module boundaries and exported helper names for the auth-state store, frame validators, and reverse-route table, provided secrets remain centralized and no spawn implementation enters this phase.
- Exact accessible styling and placement of the compact pairing control within the existing Agent CLI details surface, reusing Phase 58 components and the existing Save/status conventions rather than introducing a separate page.
- Concrete timeout and maximum payload values, provided they are bounded, covered by tests, and do not change existing MCP request timeouts.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp/src/bridge.ts` already owns hub/relay promotion, extension classification, request correlation, relay-state broadcasts, and the browser-Origin gate. Its `_handleExtensionMessage`, `_handleRelayClientMessage`, and promotion cleanup paths are the central integration seams.
- `mcp/src/types.ts` keeps the frozen `MCPMessageType` and additive relay interfaces in one place. `tests/mcp-version-parity.test.js` already freezes the pre-Phase-57 message order, tool-definition hashes, MCP response union, and `agent:register` response envelope.
- `extension/ws/mcp-bridge-client.js` already owns connection construction, reconnect/heartbeat state, message dispatch, and per-connect IDs. It is the natural owner of the pairing-aware WebSocket protocols, reverse-request pending map, timeout settlement, and `sendExtRequest` API.
- `extension/utils/redactForLog.js` and `extension/utils/diagnostics-ring-buffer.js` provide shape-only redaction and a 100-entry whitelisted sink; `tests/redact-for-log.test.js` and `tests/diagnostics-ring-buffer.test.js` are the direct drift-test homes.
- The Phase 58 Providers panel already has an Agent CLI details surface, refresh/status announcements, accessible form patterns, and independent provider configuration, so pairing can be a compact addition without changing API-provider behavior.

### Established Patterns
- Wire evolution is additive and guarded by source/hash freezes; optional relay fields and a separate frame family are preferred over modifying existing unions or envelopes.
- Hub identity is unstable but relay capability advertisement is re-sent after promotion/reconnect. Long-lived authority belongs to the explicitly started `serve` daemon, while the hub is only a router.
- Extension connection state lives in `chrome.storage.session`; durable non-secret provider evidence lives in `chrome.storage.local`. Credentials do not join provider settings or sync storage.
- Extension-source edits have source-pin tripwires, so paired test updates and a green full suite are required from the first commit.

### Integration Points
- `mcp/src/index.ts` is the CLI command router and `serve` startup seam for secret rotation; a dedicated auth-state module can also be read by whichever MCP instance currently holds the hub port.
- `WebSocketServer` upgrade validation must move authorization ahead of the current `connection` handler, while relay classification and hub-exit promotion remain intact.
- `tests/mcp-bridge-topology.test.js` already has free-port helpers, evil-Origin coverage, relay state assertions, and hub-exit promotion; extend it rather than creating an unrelated topology harness.
- `tests/mcp-bridge-client-lifecycle.test.js` VM-loads the real extension client with fake WebSockets, storage, timers, and runtime ID, making it suitable for protocol-list, pairing storage, pending-map, timeout, reconnect, and secret-rotation tests.

</code_context>

<specifics>
## Specific Ideas

- The stable selected WebSocket protocol should be human-readable (`fsb-ext-v1`); the high-entropy credential should be a separate offered protocol token with a recognizable `fsb-auth.` prefix so redaction and drift gates can identify it without logging its value.
- Pairing is explicit but intentionally lightweight: run `fsb-mcp-server pair`, paste the code into the Agent CLI details surface, confirm, and observe paired/unpaired/expired status. No QR code, deep link, native host, or secret-bearing URL is introduced.
- Security fixtures must prove rejection happens before any extension/relay registration callback or reverse-request handler increments its invocation counter, not merely that the socket eventually closes.

</specifics>

<deferred>
## Deferred Ideas

- Agent adapter interfaces, `SpawnSupervisor`, argv construction, child-process execution, kill semantics, and CLI output parsing — Phase 60.
- Side-panel delegation composer, consent UX, progress feed, stop button, live-session persistence, and offline doctor handoff — Phase 61 and later lifecycle phases.
- Native-messaging daemon wake-up or secret delivery — Phase 63; this phase must work without the `nativeMessaging` permission.
- Remote/LAN/tunnel delegation, automatic pairing, QR/deep-link pairing, OS keychain integration, and multiple simultaneously allowed extension IDs — outside this milestone unless separately planned.

</deferred>

---

*Phase: 59-reverse-request-channel-security-foundation*
*Context gathered: 2026-07-12 via autonomous smart discuss defaults*
