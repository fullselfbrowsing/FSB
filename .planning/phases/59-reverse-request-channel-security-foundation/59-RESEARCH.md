# Phase 59: Reverse-Request Channel & Security Foundation — Research

**Researched:** 2026-07-12
**Scope:** CHAN-01 through CHAN-07
**Confidence:** HIGH for repository architecture and WebSocket/Chrome mechanics; MEDIUM-HIGH for the explicit pairing UX because the no-`nativeMessaging` constraint necessarily creates a manual provisioning step

## Executive Summary

Phase 59 should be implemented as four separable layers: (1) a byte-additive reverse-frame contract, (2) deterministic capability routing with independent correlation state, (3) an upgrade-time authorization envelope backed by an explicit manual pairing command, and (4) redaction/CI regression gates. No process-spawn code belongs in this phase.

The main implementation correction to the current bridge is architectural. `mcp/src/bridge.ts` currently creates `WebSocketServer({ port, host })`, then evaluates Origin inside the post-handshake `connection` event. The `ws` project explicitly recommends authenticating in the underlying HTTP server's `upgrade` event instead of relying on `verifyClient`; `WebSocketServer({ noServer: true })` plus `handleUpgrade()` makes it possible to reject Host, Origin, and subprotocol credentials before a WebSocket object, relay timer, extension registration, or message handler exists. This is the right shape for CHAN-03/04.

The second correction is semantic. CHAN-04 combines a durable per-install pairing identity with a credential that rotates on every daemon restart. Those cannot be the same datum. Implement a durable allowed extension Origin (`chrome-extension://<id>`) and a per-`serve` 32-byte session credential. The explicit `pair` command reveals/provisions the current session credential once to the user; the extension retains it in `chrome.storage.session` for reconnects during that browser/daemon session. This is one provisioning event, not a single-use token: consuming it after one handshake would make reconnect impossible without sending a replacement secret in a payload, which CHAN-04 forbids.

## Current Repository Findings

### Bridge and wire

- `mcp/src/types.ts` has a closed `MCPMessageType` union plus separate relay interfaces. The safest INV-01 implementation is a new, separate `ExtRequest | ExtResponse | ExtEvent` union; do not append reverse frames to `MCPMessageType`.
- `tests/mcp-version-parity.test.js` already freezes the pre-Phase-57 MCP type order, the only current tail addition (`system:client-inventory`), the MCP response union, both tool-definition hashes, and the `agent:register` response envelope. It should remain green unchanged, with an additional reverse-channel contract test proving optional capability omission serializes legacy relay frames identically.
- `mcp/src/bridge.ts` already has the necessary topology primitives: relay registration order in `Map`, `relay:hello`, `relay:welcome`, `relay:state`, hub promotion, `messageOrigin`, local pending requests, and disconnect cleanup. Reverse routes must use a separate map so an extension-originated `ext:*` correlation ID can never collide with or be interpreted as a daemon-originated MCP request.
- `extension/ws/mcp-bridge-client.js` owns the only browser WebSocket, reconnect state, heartbeat, `chrome.storage.session` bridge state, and request dispatch. It is the correct owner of `sendExtRequest`, the reverse pending map, pairing credential load/store, and auth-expiry status.

### Pairing and CLI

- `mcp/src/index.ts` has a small command router and separate `serve` startup. Add `pair` without introducing a dependency. The `serve` path rotates the session credential; `pair` prints the current credential and instructions, failing honestly if no current daemon-session state exists.
- A practical user-private state file is `~/.fsb/bridge-auth.json`, created through a temp-file-plus-rename write and forced to mode `0600`. Suggested versioned shape:

  ```json
  {
    "version": 1,
    "allowedExtensionOrigin": "chrome-extension://<id>",
    "sessionSecret": "<43-char-base64url>",
    "sessionId": "<non-secret-random-id>",
    "rotatedAt": 0
  }
  ```

  The raw file must never be returned by status/doctor. All MCP instances may read current auth state at upgrade time so the process holding port 7225 need not be the `serve` process. Only `serve` startup and the explicit pairing/reset operation may rotate or mutate it.
- Generate the credential with `randomBytes(32).toString('base64url')`. Compare the decoded/normalized candidate with `timingSafeEqual` only after an equal-length check, because Node throws for unequal input lengths. Use a recognizable header token such as `fsb-auth.<base64url>` and select only the stable offered protocol `fsb-ext-v1` in the 101 response.
- Chrome documents `storage.session` as in-memory, service-worker-compatible, cleared on browser restart/update/reload, not exposed to content scripts by default, and preferable to sync for sensitive data. Keep access at `TRUSTED_CONTEXTS`; never call `setAccessLevel(TRUSTED_AND_UNTRUSTED_CONTEXTS)` for the credential.

### Redaction

- `extension/utils/redactForLog.js` already shape-redacts ordinary strings, but its `Error` branch preserves `error.message` verbatim. A credential embedded in an Error therefore leaks today.
- `extension/utils/diagnostics-ring-buffer.js` copies `message`, `category`, `prefix`, and `redactedContext` without re-sanitizing strings. Callers are expected to redact first, which is insufficient for CHAN-05's sink-level guarantee.
- Add one reusable token scrubber (for example `redactBridgeSecretsInString`) that recognizes `fsb-auth.` plus the fixed base64url credential length and common header/query wrappers. `redactForLog` must apply it to Error messages; the ring-buffer sink must recursively sanitize its own whitelisted string values with a bounded depth/key count. The replacement must be a constant marker such as `[REDACTED_FSB_BRIDGE_SECRET]`, never a prefix/suffix of the token.

### Existing test seams

- `tests/mcp-bridge-topology.test.js` has free-port allocation, actual `ws` clients, evil-Origin rejection, relay state, and hub-exit promotion. Extend this harness for HTTP-upgrade status, evil Host, exact extension Origin, authenticated/unprivileged extension sockets, capability routing, relay loss, and hub promotion.
- `tests/mcp-bridge-client-lifecycle.test.js` VM-loads the actual extension client with fake WebSocket, storage, timers, `chrome.runtime.id`, and deterministic randomness. Extend the fake constructor to capture the protocols array and add cases for credential storage, reconnect, pending resolution/event delivery, timeout cleanup, auth-expiry, and no secret in persisted bridge status.
- `tests/redact-for-log.test.js` and `tests/diagnostics-ring-buffer.test.js` are direct homes for raw-substring absence assertions.
- Root `npm test` already builds `mcp` first. Put the forbidden-flag scan in an `mcp` `prebuild` script or an equivalent root test invoked before the build so CI and every local full suite enforce CHAN-07 from the first adapter commit.

## Recommended Architecture

### 1. Separate additive frame contract (CHAN-01)

Add interfaces similar to:

```ts
export interface ExtRequest {
  id: string;
  type: 'ext:request';
  method: string;
  payload: Record<string, unknown>;
}

export interface ExtError {
  code: 'agent_provider_offline' | 'bridge_topology_changed' |
    'ext_unauthorized' | 'invalid_ext_request' | 'ext_request_timeout';
  message: string;
  retryable: boolean;
}

export interface ExtResponse {
  id: string;
  type: 'ext:response';
  payload?: Record<string, unknown>;
  error?: ExtError;
}

export interface ExtEvent {
  id: string;
  type: 'ext:event';
  event: string;
  payload: Record<string, unknown>;
}
```

Require exactly one of `payload` or `error` on a response in runtime validation even if TypeScript uses a union. Phase 59 needs a reserved no-spawn test method (for example `bridge.ping`) or an injected handler seam; it must not introduce `delegate.start`, adapters, `child_process`, or a production `agent-spawn` advertisement.

Keep existing JSON byte shapes stable by making relay capabilities optional and omitting absent fields entirely:

```ts
interface RelayHello {
  type: 'relay:hello';
  instanceId: string;
  capabilities?: BridgeCapability[];
}
```

Do not emit `capabilities: []` from legacy/default bridge instances; that changes bytes. Apply the same omission rule to any optional availability field added to `relay:welcome`/`relay:state`.

### 2. Deterministic capability router (CHAN-02/06)

Recommended bridge options/API:

```ts
interface BridgeOptions {
  capabilities?: BridgeCapability[];
  handleExtRequest?: (request: ExtRequest, emit: (event: ExtEvent) => void) =>
    Promise<Record<string, unknown>>;
}
```

Maintain:

- `relayCapabilities: Map<instanceId, Set<BridgeCapability>>`
- `extRouteOrigin: Map<requestId, { kind: 'extension'; socket: WsWebSocket }>` on the hub for forwarded responses/events
- `activeExtRequests: Map<requestId, { target: 'local' | relayId; socket; settled: boolean }>` for duplicate rejection and cleanup
- an extension-client-side pending map independent from the existing daemon-side `pendingRequests`

Routing order is local capable handler first, otherwise the first currently connected relay whose advertised set contains `agent-spawn`, otherwise `agent_provider_offline`. `Map` insertion order gives the roadmap's deterministic “first relay” rule. A relay disconnect settles only requests routed to that relay with `bridge_topology_changed`, deletes every corresponding map entry, and never selects a replacement/replays. A hub disconnect causes the extension socket to close; the client pending map rejects on close. Promotion/reconnect can establish new requests with new IDs after the caller decides to retry.

An `ext:event` never settles a request. Only the first final `ext:response` settles; later events/responses for that ID are dropped and may produce a redacted diagnostic. Duplicate active request IDs are rejected before forwarding.

### 3. Pre-handler upgrade authorization (CHAN-03/04)

Refactor hub startup to an explicit `node:http` server plus `WebSocketServer({ noServer: true, handleProtocols })`:

1. Validate configured bind host before calling `listen`; allow only `127.0.0.1`, `::1`, or `localhost` and default to `127.0.0.1`.
2. On `server.on('upgrade')`, parse a single Host header and require hostname/port equality with loopback and the active bridge port. Reject `evil.com:7225`, ambiguous/multiple headers, malformed IPv6, missing host, wrong port, `0.0.0.0`, and LAN values with an HTTP 403 before `handleUpgrade`.
3. If Origin is present, parse it and require a `chrome-extension:` URL with no credentials/query/fragment. Reject every `http(s)` origin, `null`, malformed value, or wrong persisted extension origin before `handleUpgrade`.
4. Read current auth state for this upgrade. Parse the offered subprotocol set, require `fsb-ext-v1`, and constant-time compare the `fsb-auth.*` candidate when present. Record an immutable authorization classification on the request using a private symbol or pass a closure result into the `connection` callback.
5. Call `handleUpgrade` only after trust checks. `handleProtocols` returns `fsb-ext-v1`, never the secret-bearing token.

To preserve additive legacy behavior, an exact/syntactically valid extension Origin may connect without the credential as an unprivileged legacy MCP connection, but its immutable classification is `extAuthorized: false`; `_handleExtensionMessage` rejects every `ext:*` frame. Once a durable allowed Origin exists, any different extension Origin is rejected for all behavior. Origin-less Node relays remain possible but can become extension clients only through the existing relay handshake rules; they never acquire reverse-request authority.

This distinction is necessary: accepting an unauthenticated socket and later elevating it through an in-band “pair” frame would violate the upgrade-only credential rule. Pairing storage changes must close the old socket and build a new `WebSocket(MCP_BRIDGE_URL, ['fsb-ext-v1', 'fsb-auth.<secret>'])`.

### 4. Explicit pairing without native messaging (CHAN-04)

The minimal end-to-end flow is:

1. `serve` rotates `sessionSecret` before connecting its bridge and writes auth state atomically with mode `0600`; it retains an already-bound `allowedExtensionOrigin`.
2. `fsb-mcp-server pair` reads the live session state and prints only the credential plus concise paste instructions. `--json` may output `{ protocol, pairingCode, rotatedAt }` but must not be called by status/doctor or logged to stderr.
3. The existing Agent CLI details surface accepts the pasted code as an immediate pairing action, validates the exact token grammar, writes only to `chrome.storage.session`, clears the input value, and reconnects. It must not join the main Save Settings payload or `defaultSettings`.
4. If no allowed Origin is bound, the first authenticated extension upgrade binds the exact Origin atomically. A different Origin never rebinds. Provide an explicit CLI reset/re-pair flag if needed; do not infer reset from failed handshakes.
5. Wrong/expired credentials leave legacy bridge status available but mark reverse capability `unpaired`/`expired`. Do not distinguish “wrong extension ID” from “wrong credential” in remotely observable error text.

The manual paste is unavoidable in this milestone: the extension cannot read `~/.fsb/bridge-auth.json`, and no `nativeMessaging` permission/host exists until Phase 63. QR/deep-link delivery would either place the secret in a URL or introduce another transport and is out of scope.

### 5. Permanent gates (CHAN-05/07)

Create `scripts/verify-agent-provider-flags.mjs` outside `mcp/src/agent-providers/**`. It should recurse regular source files, fail closed on read errors, print relative paths/line numbers, and treat a missing directory as an empty clean directory until Phase 60 creates it. Wire it through `mcp/package.json` `prebuild`, which root `npm test`, MCP publishing, and CI already execute.

Keep the three forbidden literals only in the external scanner/test and requirements/planning artifacts. The scanner must have no inline exemption pragma and must scan all extensions, not only `.ts`, because future adapters may add templates/configs.

Add a log-drift fixture containing a full 43-character base64url credential with the `fsb-auth.` prefix. Pass it through string, Error, object/nested context, console-capture helpers, and diagnostic storage; assert the full credential and a distinctive interior substring are absent from every serialized output.

## Threat Model

| ID | Threat | Severity | Trust-boundary control | Automated proof |
|----|--------|----------|------------------------|-----------------|
| T59-01 | Attacker page opens localhost WebSocket (CSWSH) | Critical | exact extension Origin before upgrade; ext authorization immutable | evil HTTPS Origin receives HTTP/close rejection before handler counter changes |
| T59-02 | DNS rebinding sends `Host: evil.com:7225` to loopback | Critical | exact loopback Host + port check before upgrade | evil Host rejected even with correct IP target and plausible Origin |
| T59-03 | Malicious extension or stale credential initiates reverse request | High | durable exact Origin + rotating 32-byte session credential + explicit pairing | wrong Origin, absent token, wrong token, old rotated token all fail ext routing |
| T59-04 | Credential leaks through URL, payload, error, console, or diagnostic ring | High | subprotocol-only transport, session storage, centralized scrubber, sink re-sanitization | raw/interior substring absent from all fixtures and bridge state |
| T59-05 | Hub/relay churn replays or misroutes a future spawn request | High | separate route map, capability target pinning, deterministic terminal errors, no auto replay | relay-mid-frame and hub-exit tests settle once and clear maps |
| T59-06 | New frames mutate legacy MCP/tool/relay bytes | High | separate union, optional omitted fields, byte/hash freeze | existing version parity plus legacy relay serialization fixture |
| T59-07 | Future adapter introduces an auto-approval CLI flag | Critical | external recursive prebuild scanner with no local exemptions | positive fixture fails scanner; clean/missing directory passes |
| T59-08 | Operator binds bridge to LAN/all interfaces | Critical | constructor/startup bind-host allowlist | `0.0.0.0` and LAN host tests fail before listening |

All Critical/High threats are blocking. No plan may defer one to Phase 60, because Phase 60 will introduce the process-spawn capability that makes these controls load-bearing.

## Validation Architecture

### Test infrastructure

| Property | Value |
|----------|-------|
| Framework | Existing dependency-free Node assertion harnesses plus real `ws` sockets; TypeScript compile via `tsc` |
| Quick channel command | `npm --prefix mcp run build && node tests/mcp-reverse-channel-contract.test.js && node tests/mcp-bridge-topology.test.js` |
| Quick extension/security command | `node tests/mcp-bridge-client-lifecycle.test.js && node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js && node tests/agent-provider-forbidden-flags.test.js` |
| Byte-freeze command | `npm --prefix mcp run build && node tests/mcp-version-parity.test.js && node tests/mcp-reverse-channel-contract.test.js` |
| Full suite | `npm test` |
| Expected feedback | focused tests under ~20 seconds; full suite several minutes |

The current workspace has user-owned deletions of old phase artifacts, while one legacy test expects `.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md`. For full-suite verification only, create a temporary symlink to `.planning/milestones/v1.0.0-phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md`, remove it in a shell trap, and never stage it. This is workspace hygiene, not Phase 59 product work.

### Per-requirement verification map

| Requirement | Primary automated evidence | Secondary evidence |
|-------------|----------------------------|--------------------|
| CHAN-01 | `tests/mcp-reverse-channel-contract.test.js`; unchanged `tests/mcp-version-parity.test.js` | source review confirms no ext member in `MCPMessageType` and no tool hash drift |
| CHAN-02 | topology cases for local handler precedence, first capable relay, non-capable relay skip, and offline error | route-map source audit and topology snapshots |
| CHAN-03 | raw upgrade fixtures for evil/missing/duplicate Origin and Host, wrong port, non-loopback bind; handler invocation count remains zero | source audit of upgrade ordering |
| CHAN-04 | 32-byte generation, 0600 file, rotate/replay rejection, subprotocol capture, session-only extension storage | grep gate proving no secret in URL/payload/status |
| CHAN-05 | redaction + diagnostic sink fixtures with full and interior token assertions | repository scan of tracked log fixtures |
| CHAN-06 | hub exit mid-request, capable relay exit after request/before response, existing promotion case unchanged | single-settlement and map-count assertions |
| CHAN-07 | scanner unit fixture and prebuild wiring; intentionally forbidden temp fixture exits nonzero | clean `mcp/src/agent-providers/**` scan in full suite |

### Sampling and task ordering

- Wave 0 must add or extend failing contract fixtures before behavior code for every security boundary.
- After each server-side task: build MCP and run contract/topology/version-parity tests.
- After each extension-side task: run client lifecycle plus all known source-pin tests that grep `mcp-bridge-client.js`, `options.js`, or `control_panel.html`.
- After redaction work: run both redaction harnesses and the dedicated secret-drift test.
- After every plan wave and before verification: run the full root suite with the temporary Phase 39 fixture, then remove the fixture and confirm `git status` contains no new unrelated path.
- No three consecutive implementation tasks may occur without an automated test command. No watch-mode commands.

### Suggested test files

- `tests/mcp-reverse-channel-contract.test.js` — frame/runtime validation, byte freeze, capability omission serialization
- extend `tests/mcp-bridge-topology.test.js` — real upgrade and routing/churn fixtures
- extend `tests/mcp-bridge-client-lifecycle.test.js` — pairing protocols/storage/pending behavior
- `tests/mcp-bridge-auth.test.js` — auth-store permissions, rotation, token grammar, constant-time helper behavior
- extend `tests/redact-for-log.test.js` and `tests/diagnostics-ring-buffer.test.js`
- `tests/agent-provider-forbidden-flags.test.js` — scanner positive/negative/missing-dir cases
- extend `tests/providers-panel-ui.test.js` / `tests/providers-panel-logic.test.js` only for the minimal pairing control and session-only behavior

### Manual-only verification

Automated VM and real-socket tests can cover every CHAN acceptance criterion. Preserve, but defer to the user-directed milestone-end gate, these live checks:

1. Run `fsb-mcp-server serve`, run `fsb-mcp-server pair`, paste into the unpacked extension, and observe paired status plus reconnect.
2. Restart `serve` and observe the old credential becomes expired/unpaired without exposing its value.
3. Reload/restart Chrome and confirm the session credential is cleared and pairing status is honest.
4. Confirm the compact pairing control is keyboard/screen-reader usable in light/dark themes.

These checks are `human_needed`; they must not be marked passed during autonomous execution.

## Plan Decomposition Recommendation

Use four dependency-ordered plans rather than one large bridge rewrite:

1. **Contract and permanent gates:** ext types/validators, byte-freeze tests, redaction scrubber/sink tests, forbidden-flag scanner/prebuild.
2. **Auth state and pre-upgrade boundary:** auth store, CLI pair/serve rotation, loopback bind/Host/Origin/subprotocol upgrade logic, security fixtures.
3. **Hub/relay reverse router:** capabilities, local/relay routing, typed offline/topology errors, route cleanup, topology churn tests.
4. **Extension client and pairing surface:** session credential, protocols/reconnect, pending map/events/timeouts, compact Providers pairing control, source-pin updates, full suite, deferred HUMAN-UAT artifact.

Plan 2 depends on Plan 1. Plan 3 depends on Plans 1 and 2 because reverse authority must exist before frames route. Plan 4 depends on Plans 1-3. This phase is security-critical and should execute sequentially even if individual test work can be parallelized.

## Primary Sources

- [`ws` WebSocketServer documentation](https://github.com/websockets/ws/blob/master/doc/ws.md) — `verifyClient` is discouraged; authenticate in the HTTP `upgrade` event; `noServer`, `handleUpgrade`, `handleProtocols`, and `maxPayload` semantics.
- [Node.js Crypto documentation](https://nodejs.org/api/crypto.html) — `randomBytes()` and `timingSafeEqual()` behavior, including the equal-length requirement and surrounding-code caveat.
- [Node.js File System documentation](https://nodejs.org/api/fs.html) — numeric file modes used to enforce `0600` on the auth-state file.
- [Chrome `storage` API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage/) — session storage lifetime, trusted-context default, service-worker suitability, and guidance to prefer session over sync for sensitive data.
- [Official MCP TypeScript SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md#dns-rebinding-protection) — localhost servers must validate Host; Origin validation rejects present untrusted/malformed origins while allowing origin-less non-browser clients.

## Research Resolution

The locked Phase 59 context is implementable with one clarification: “one-time pairing code” means one explicit provisioning event for a reconnect-capable daemon-session credential, not a token consumed after a single WebSocket. The durable per-install property is the bound extension Origin; the raw secret is per-daemon and session-stored. The earlier project research example that included `secret` in an `ext:request` payload is superseded by CHAN-04 and the locked context—no reverse frame contains authentication material.

## RESEARCH COMPLETE
