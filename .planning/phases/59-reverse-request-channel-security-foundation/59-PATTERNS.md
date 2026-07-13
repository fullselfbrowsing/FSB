# Phase 59: Reverse-Request Channel & Security Foundation — Pattern Map

**Mapped:** 2026-07-12
**Inputs:** `59-CONTEXT.md`, `59-RESEARCH.md`, current repository source and tests

## Data Flow

```text
Providers pairing control
  -> chrome.storage.session bridge credential
  -> MCPBridgeClient reconnects with [fsb-ext-v1, fsb-auth.<secret>]
  -> HTTP upgrade gate validates bind + Host + Origin + credential
  -> authorized extension socket sends ext:request
  -> hub local handler OR first relay with capability agent-spawn
  -> ext:event* / ext:response follows reverse-route map
  -> extension pending map emits events then settles exactly once
```

The credential never enters the JSON flow. The authorization classification is fixed during HTTP upgrade and attached privately to the accepted socket/request.

## File-to-Pattern Map

| Target file | Role | Closest analog | Pattern to preserve |
|-------------|------|----------------|---------------------|
| `mcp/src/types.ts` | additive ext and capability types | existing `MCPMessageType`, `RelayHello`, `RelayWelcome`, `RelayState` | keep ext family separate; optional fields omitted when absent |
| `mcp/src/bridge-auth.ts` (new) | versioned auth state, rotation, compare, pairing output data | `scripts/cws-bootstrap-refresh-token.mjs` for `0o600`; `mcp/src/install.ts` for home/config path resolution | Node built-ins only; injectable path for tests; atomic temp write + rename; no logging |
| `mcp/src/bridge.ts` | HTTP upgrade gate and reverse router | existing `_startAsHub`, `_registerRelayClient`, `_handleExtensionMessage`, `messageOrigin`, disconnect cleanup | preserve EADDRINUSE relay fallback and promotion; add separate ext maps |
| `mcp/src/index.ts` | `pair` CLI and `serve` rotation | existing `parseArgs`, `printHelp`, `runHttpMode`, main switch | one command function + one switch case; status/doctor never include secret |
| `extension/ws/mcp-bridge-client.js` | session credential, protocol list, ext pending map | existing reconnect state, `pending`-style bridge server semantics, `_send`, `_handleMessage` | storage/session only; reconnect to elevate; settle pending on close/timeout |
| `extension/utils/redactForLog.js` | centralized token scrubber | existing shape-only `redactForLog` IIFE/CommonJS dual export | preserve public exports; scrub Error message before returning |
| `extension/utils/diagnostics-ring-buffer.js` | defense-in-depth sink sanitization | existing field-whitelist `safe` object | sanitize after whitelist and before memory/storage append |
| `extension/ui/control_panel.html` | compact pairing form/status | existing `agentProviderDetails`, provider announcement, password fields | accessible label, password input, immediate Pair action, no main Save coupling |
| `extension/ui/options.js` | pairing storage/action/status | existing provider evidence announcement and `chrome.storage.session` reads | trusted session storage, clear DOM input, reconnect through bridge API |
| `scripts/verify-agent-provider-flags.mjs` (new) | permanent recursive negative gate | existing `scripts/verify-*.mjs` gates | deterministic relative-path diagnostics; fail closed; no exemption syntax |
| `mcp/package.json` | prebuild gate wiring | existing `build` / `prepublishOnly` scripts | add `prebuild`; leave build output contract unchanged |
| bridge/auth/redaction/provider tests | automated proof | current dependency-free Node/VM/real-socket harnesses | extend current harnesses; no new framework/dependency |

## Concrete Existing Patterns

### 1. Additive wire types

`mcp/src/types.ts` already isolates relay topology from MCP tool messages:

```ts
export interface RelayHello {
  type: 'relay:hello';
  instanceId: string;
}

export type RelayMessage = RelayHello | RelayWelcome | RelayState;
```

Follow this with a separate `BridgeCapability` and `ExtMessage` family. The default hello construction currently emits exactly:

```ts
const hello: RelayHello = { type: 'relay:hello', instanceId: this.instanceId };
```

When no capabilities are configured, keep that exact object construction/result. Use conditional spread or an explicit branch; do not serialize `capabilities: []`.

### 2. Map correlation and deterministic cleanup

`WebSocketBridge` already uses maps for request state:

```ts
private pendingRequests = new Map<string, PendingRequest>();
private progressListeners = new Map<string, (progress: MCPResponse) => void>();
private messageOrigin = new Map<string, string>();
```

And every terminal path clears timeout/state before resolving:

```ts
clearTimeout(pending.timeout);
this.pendingRequests.delete(resp.id);
this.progressListeners.delete(resp.id);
this.messageOrigin.delete(resp.id);
pending.resolve(resp);
```

Clone the discipline, not the same map. Reverse requests need `activeExtRequests`/`extRouteOrigin` so direction and authorization are impossible to confuse. Relay close already iterates `messageOrigin` by owner; reverse-route cleanup should use the same owner-filter pattern and additionally emit one typed terminal response.

### 3. EADDRINUSE hub/relay fallback

Current `connect()` treats only address-in-use as relay fallback:

```ts
try {
  await this._startAsHub();
} catch (err: unknown) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    await this._startAsRelay();
  } else {
    throw err;
  }
}
```

Moving to explicit `node:http` + `WebSocketServer({ noServer: true })` must preserve this rejection contract. The HTTP server's `error` event must reject `_startAsHub()` with the original error code; close both HTTP and WebSocket server references on failure/disconnect; promotion must call the same startup path.

### 4. Upgrade-before-handler

Current security occurs too late:

```ts
this.wss.on('connection', (ws, req) => {
  if (!this.isAllowedWebSocketOrigin(req)) {
    ws.close(1008, 'Forbidden origin');
    return;
  }
  this._handleNewConnection(ws);
});
```

Replace the ordering with an HTTP `upgrade` gate and invoke `handleUpgrade` only after validation. The `connection` callback receives an already-classified request/socket and must not re-parse mutable headers to decide authority.

### 5. CLI command routing

`mcp/src/index.ts` uses one function per command and a compact switch:

```ts
switch (command) {
  case 'serve':
  case 'http':
    await runHttpMode(flags);
    return;
  case 'doctor':
    await runDoctor(flags);
    return;
}
```

Add `runPair(flags)` and `case 'pair'`. Put secret generation/storage in `bridge-auth.ts`, not in `index.ts`; the CLI layer only formats explicit stdout. Keep secret output away from shared diagnostics formatters.

### 6. User-private file mode

`scripts/cws-bootstrap-refresh-token.mjs` provides the repository's concrete sensitive-write precedent:

```js
writeFileSync(path, value, { mode: 0o600 });
```

For Phase 59, strengthen this into temp write -> `chmod(0o600)` -> rename, and re-assert mode on an existing file. Make the auth path injectable in tests so fixtures use `mkdtempSync(os.tmpdir())`, matching `tests/mcp-install-platforms.test.js`.

### 7. Extension connection/session state

`MCPBridgeClient` centralizes connection construction and session persistence:

```js
this._ws = new WebSocket(MCP_BRIDGE_URL);
```

```js
const result = chrome.storage.session.set({ [MCP_BRIDGE_STATE_KEY]: state });
```

Add a credential storage key separate from `mcpBridgeState`; do not add the secret to `getState()`. Because storage reads are async and `connect()` is currently sync, use a guarded async preload/cache or make the pairing action set an in-memory credential before reconnect. Keep repeated `connect()` idempotent and retain existing reconnect alarms/timers.

### 8. Extension pending-map behavior

The server-side bridge demonstrates the required lifecycle: generate ID, create timeout, insert pending state before send, settle once, and reject all on close. Apply the same sequence to `sendExtRequest(method, payload, { timeout, onEvent })`. `_handleMessage` must detect `ext:event`/`ext:response` before the existing daemon-request dispatcher so reverse responses are never treated as inbound MCP commands.

### 9. Pairing UI/accessibility

The Providers panel already has:

```html
<p id="providerEvidenceAnnouncement"
   role="status" aria-live="polite" hidden></p>
<div id="agentProviderDetails" hidden aria-live="polite">
```

And `options.js` already switches announcements to assertive for errors:

```js
announcement.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
```

Place pairing inside `agentProviderDetails`, use `type="password"`, a visible label, and an immediate button. Pair success is polite; malformed/expired failure is assertive. Pairing is transport state, not a provider selection setting, so it must not enter `defaultSettings`, `saveSettings()`, or the Save bar.

### 10. Redaction dual boundary

`redactForLog.js` has both global and CommonJS exports, which tests and the extension depend on. Preserve both while adding a pure scrubber export. The dangerous existing branch is:

```js
if (value instanceof Error) {
  return { kind: 'error', name: value.name, message: value.message || '' };
}
```

Scrub `message`. Then sanitize the diagnostics sink's whitelisted `safe` object before both `_inMemoryRing.push(safe)` and `chrome.storage.local.set`. This gives caller-level and sink-level protection.

### 11. Test harness patterns

- `tests/mcp-bridge-topology.test.js`: allocate a real port with `net.createServer()`, use the installed `mcp/node_modules/ws`, import compiled `mcp/build/bridge.js`, and cleanup sockets/bridges in `finally`.
- `tests/mcp-bridge-client-lifecycle.test.js`: VM-load the real extension file, fake `chrome.storage.session`, fake timers, and fake WebSocket. Extend the fake constructor signature to `(url, protocols)` and record both.
- `tests/mcp-version-parity.test.js`: keep all current hash/order assertions unchanged. Add new ext/relay byte tests in a separate file so a Phase 59 addition cannot weaken the historical freeze.
- `tests/providers-panel-ui.test.js`: it already source-checks ARIA markup and runs DOM harness interactions; extend rather than duplicating a UI test framework.
- New filesystem/scanner tests should use `mkdtempSync`, clean in `finally`, and execute the real script/build artifact.

## Source-Pin Tripwires to Re-run

Before editing each extension file, search all tests for that path/name. At minimum rerun:

- `mcp-bridge-client.js`: lifecycle, background-dispatch, client-identity integration, agent grace, run-task heartbeat, dispatcher label, recovery/bootstrap, and smoke source-contract tests returned by `rg`.
- `options.js` / `control_panel.html`: `providers-panel-logic.test.js`, `providers-panel-ui.test.js`, agent-provider storage tests, and extension file completeness tests.
- `redactForLog.js` / diagnostic ring: their direct tests plus audit/no-secret tests.

The executor should use `rg -n "<filename>" tests` before the edit and include every returned source-pin test in the focused verify command when practical.

## Anti-Patterns

- Do not add `secret` to an ext JSON interface.
- Do not use `verifyClient` or post-connection close as the primary upgrade security gate.
- Do not cache auth state for the whole hub lifetime; another process may rotate the current session file.
- Do not advertise `agent-spawn` in production before Phase 60 supplies a real supervisor handler.
- Do not reuse `messageOrigin` for reverse traffic.
- Do not auto-replay after relay loss.
- Do not persist the credential in provider settings/local/sync storage or expose it through bridge status.
- Do not put a forbidden-flag exemption inside the scanned adapter directory.
- Do not change existing MCP type/hash tests to accept drift.

## PATTERN MAPPING COMPLETE
