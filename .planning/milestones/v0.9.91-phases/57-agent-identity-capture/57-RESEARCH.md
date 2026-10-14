---
phase: 57
slug: agent-identity-capture
status: complete
researched: 2026-07-12
confidence: high
---

# Phase 57 — Agent Identity Capture Research

## Research Question

What must be known to plan Phase 57 well while preserving INV-01, MV3 service-worker survivability, and the existing onboarding interaction?

## Executive Summary

Phase 57 is a brownfield identity-data extension, not a new transport or UI. The safe implementation is four additive slices built on existing seams:

1. Capture MCP `initialize.clientInfo` lazily from the pinned SDK and add it as an optional `agent:register.payload.clientInfo` field.
2. Persist copy-click and connection evidence in one durable `chrome.storage.local` envelope keyed by canonical client id.
3. Detect installed clients in the daemon by reusing the platform registry and a shell-free Claude Code version probe.
4. Expose one extension-side `getMcpClients` read model that preserves the individual evidence sources instead of collapsing them into a recommendation.

No new runtime dependency is needed. The highest risks are accidental wire-shape changes, trusting spoofable `clientInfo`, storage lost to service-worker eviction, unsafe Windows command probing, and source-pin tripwire breakage. All can be covered by focused contract tests before the full repository suite.

## Locked Inputs

Planning must preserve all decisions in `57-CONTEXT.md`, especially D-01 through D-19. The UI contract in `57-UI-SPEC.md` adds a strict boundary: Phase 57 creates no new visible inventory or provider UI, and copy-click persistence cannot delay or alter the existing checkmark/toast behavior.

Required coverage:

- `IDENT-01`: durable, deduplicated copy-click intent.
- `IDENT-02`: MCP handshake identity captured and threaded additively.
- `IDENT-03`: registry stamp plus durable connected-client rollup.
- `IDENT-04`: daemon-side installed-client detection.
- `IDENT-05`: one merged extension runtime view.

## Standard Stack

| Concern | Use | Evidence / constraint |
|---|---|---|
| MCP client identity | Existing `@modelcontextprotocol/sdk` `McpServer.server.getClientVersion()` | Verified in the repository's pinned SDK line; no protocol parser is needed. |
| Installed file-mode clients | Existing `PLATFORMS`, `getPlatformTargetCandidates`, and `resolvePlatformTarget` | These already encode per-OS client config paths and detection rules. |
| Claude Code binary probe | `node:child_process.execFile` with argv array, 3 s timeout, no shell | Avoids `.cmd` shell escalation and command injection; returns defensive unknown-version results. |
| Durable extension evidence | `chrome.storage.local` | Survives service-worker eviction and browser restart; `storage.session` is not sufficient. |
| Live registry identity | Existing `AgentRegistry` mutation/persist pattern | `stampConnectionId` is the closest analogue for `stampClientInfo`. |
| Runtime query | Existing `fsbHandleRuntimeMessage` / `globalThis.fsbDispatchInternalMessage` route | Same-context service-worker callers must not use `chrome.runtime.sendMessage`. |
| Tests | Existing Node contract tests plus `npm --prefix mcp run build` | No new test framework or dependency is warranted. |

## Architecture and Data Flow

### 1. Initialize identity to `agent:register`

`createRuntime()` constructs both the SDK server and `AgentScope`. Inject a nullable lazy supplier after construction. `AgentScope.ensure()` reads it immediately before its single lazy register round-trip:

```text
MCP initialize
  -> SDK stores request.params.clientInfo
  -> first tool call
  -> AgentScope.ensure()
  -> supplier reads server.server.getClientVersion()
  -> agent:register payload gains optional clientInfo
```

When identity is unavailable, the exact existing `{ type: 'agent:register', payload: {} }` shape remains. The `ensure(bridge)` signature and every tool-registration call site remain unchanged.

The same runtime wiring covers stdio and streamable HTTP because each transport already constructs a runtime through the common factory. Tests must exercise both a present supplier and the legacy-null path.

### 2. Extension registration and durable rollup

`handleAgentRegisterRoute` should sanitize `payload.clientInfo` before use:

- value must be an object;
- `name` and `version` must be strings if present;
- each accepted field is capped at 200 characters;
- unknown fields are discarded;
- client identity is observability evidence only, never an authorization input.

The handler stamps the sanitized object on the new live `AgentRecord` via a registry method shaped like `stampConnectionId`. It then best-effort updates the durable connected map. The existing registration response remains byte-identical.

### 3. Durable storage model

Use one versionless additive envelope for this phase:

```js
{
  clicked: {
    '<canonical-id>': { count, firstClickedAt, lastClickedAt, source }
  },
  connected: {
    '<canonical-id-or-raw-key>': { name, version, lastSeenAt }
  },
  installed: {
    '<canonical-id>': { detected, configPath, version, checkedAt }
  }
}
```

Mutation helpers must preserve unknown top-level and sibling sub-map data. A single-key read/modify/write race is accepted by D-07; do not expand this phase into a locking or migration system. Tests should prove sibling preservation and last-write semantics, while documenting that a concurrent page/SW write may briefly lose one event and self-heal on the next event.

### 4. Copy-click capture

The existing `copyCommand(text, key)` remains the only activation path. Persistence is fire-and-forget and must not gate clipboard feedback, render, or timers.

- `key === 'current'` resolves `ROLL_CLIENTS[state.iconIndex].id` at click time and records `source: 'base'`.
- Fan items use their canonical id and record `source: 'fan'`.
- `all` expands to exactly the seven flag-backed clients and records `source: 'all'`; `openclaw` is excluded.
- Repeats increment `count`, retain `firstClickedAt`, and refresh `lastClickedAt`.

No Phase 57 code renders these records.

### 5. Installed-client inventory

File/instructions clients reuse platform-path resolution. `claude-code` is the only Phase 57 binary probe because its registry entry is CLI-mode with no config path. Probe candidates are fixed by OS:

- POSIX: `claude`;
- Windows: `claude.cmd`, `claude.exe`, then `claude`.

Each attempt uses `execFile(binary, ['--version'], { timeout: 3000 })` with no shell. Parse the version defensively; a successful unparseable output still means installed with an omitted/unknown version. Memoize for the daemon process lifetime.

The inventory-delivery judgment call is resolved by D-14: send a tolerant daemon-to-extension inventory frame after bridge readiness/refresh and also piggyback the snapshot on `agent:register`. Both paths update the same durable installed map, so late registration and reconnect recovery converge.

### 6. Merged read model

`getMcpClients` assembles one map keyed by canonical id and preserves source records:

```js
{
  '<canonical-id>': {
    clicked: object | null,
    installed: object | null,
    connected: object | null,
    live: object | null
  }
}
```

Normalization is case/whitespace-insensitive with an explicit alias table. Unknown `clientInfo.name` values remain visible as raw, display-only entries rather than being silently dropped or guessed. Phase 58, not Phase 57, derives recommendation priority.

## Concrete Integration Seams

| File | Planned responsibility | Closest existing pattern |
|---|---|---|
| `mcp/src/agent-scope.ts` | Nullable lazy identity supplier and additive register payload | Current single-flight `ensure()` registration |
| `mcp/src/runtime.ts` | Inject `server.server.getClientVersion()` supplier | Common runtime construction |
| `mcp/src/platforms.ts` or a small adjacent detector module | Installed-client inventory plus Claude probe | `resolvePlatformTarget()` |
| bridge/server send path selected by planner | Emit tolerant inventory snapshot | Existing daemon-to-extension system frames |
| `extension/utils/agent-registry.js` | `stampClientInfo()` live mutation | `stampConnectionId()` |
| `extension/ws/mcp-tool-dispatcher.js` | Sanitize identity, stamp registry, persist connected/platform evidence | `handleAgentRegisterRoute` plus active-agent count RMW |
| `extension/ws/mcp-bridge-client.js` | Accept inventory frame and dispatch/cache it | Existing `_routeMessage` cases |
| `extension/ui/onboarding.js` | Fire-and-forget copy-click persistence | `persistProviderSelection()` and `copyCommand()` |
| `extension/utils/mcp-client-aliases.js` | Canonical alias normalization | New pure module, closed vocabulary |
| `extension/background.js` | `getMcpClients` read model | Existing `fsbHandleRuntimeMessage` cases |

The planner should keep the pure storage/alias helpers testable outside a full Chrome runtime, either through exported CommonJS test hooks consistent with existing extension utilities or a VM harness. Do not create a new framework.

## Pitfalls and Preventive Tests

| Pitfall | Prevention |
|---|---|
| Treating `clientInfo.name` as trusted | Explicit tests show it only affects observability records, never permission/ownership decisions. |
| Breaking old register callers | Freeze the legacy null-supplier payload and current response object. |
| Transport-specific identity capture | Construct identity through the common runtime factory and cover stdio/HTTP runtime creation. |
| Losing evidence on MV3 eviction | Persist all three evidence maps in `storage.local`; rehydrate every query from storage. |
| Unsafe Windows probe | Assert no `shell: true`, fixed binary candidates, timeout, and graceful ENOENT/EINVAL handling. |
| Guessing unknown client aliases | Preserve raw entries; only explicit aliases merge. |
| UI regression from awaited storage | Test that check state/toast/render happen without awaiting persistence and that rejection is non-blocking. |
| `all` overcount or wrong membership | Exact seven-id assertion and explicit `openclaw` exclusion. |
| Source-pin tests fail after extension edits | Update paired exact-count/substr pins in the same task as each source change. |
| Scope creep into Providers UI | UI-SPEC asserts no rendered inventory, badge, empty state, or provider recommendation. |

## Validation Architecture

### Test Layers

1. **Pure/unit contracts (fast):** alias normalization, storage merge/mutation, copy-click aggregation, inventory normalization, identity sanitizer, version parsing.
2. **MCP/runtime contracts (fast after build):** `AgentScope` supplier behavior, single-flight registration, optional payload freeze, common runtime wiring, platform detection and Claude probe injection.
3. **Extension VM contracts (fast):** dispatcher registration, registry stamp/persistence, bridge inventory route, background `getMcpClients`, onboarding timing/failure behavior.
4. **Focused integration:** daemon inventory frame through bridge to durable extension state and the merged query result.
5. **Regression boundary:** MCP build, relevant existing contract tests, then the full root suite once per execution wave/final verification.

### Recommended Commands

Focused quick loop (planner may split by task):

```bash
npm --prefix mcp run build && node tests/agent-scope.test.js
node tests/agent-registry.test.js
node tests/mcp-install-platforms.test.js
node tests/mcp-bridge-background-dispatch.test.js
node tests/runtime-contracts.test.js
```

New Phase 57 tests should have dedicated files so each task can run only its affected contract. A suitable naming split is:

- `tests/mcp-client-identity.test.js`
- `tests/mcp-client-inventory.test.js`
- `tests/mcp-agent-providers-storage.test.js`
- `tests/mcp-client-merged-view.test.js`
- `tests/onboarding-agent-provider-clicks.test.js`

Wave/final gates:

```bash
npm --prefix mcp run build
npm test
```

### Requirement-to-Test Map

| Requirement | Automated evidence |
|---|---|
| IDENT-01 | Copy ids/source membership, repeat counters/timestamps, rejection is non-blocking, storage survives fresh harness load. |
| IDENT-02 | SDK supplier present/null, exact optional register payload, stdio/HTTP common wiring, one register per scope. |
| IDENT-03 | Sanitization, 200-char caps, registry stamp, reconnect update-not-duplicate, unchanged register response. |
| IDENT-04 | File-mode registry sweep, fixed candidate order, timeout/ENOENT/unparseable versions, no shell. |
| IDENT-05 | Union of clicked/installed/connected/live, alias joins, raw unknown names, stale installed timestamps, same-context dispatch. |

### Nyquist Guidance

- Every implementation task must have a focused automated command.
- No three consecutive tasks may rely only on the final full suite.
- Tests should be written in the same task as the behavior they freeze; a separate late “add tests” plan is insufficient.
- Full `npm test` is too slow for every small edit but is mandatory after each plan wave and before verification.
- No manual-only acceptance criterion is required for this data-only phase; the visible onboarding behavior is VM/source-contract testable.

## Planning Recommendations

Use three plans with dependency order rather than one large cross-stack plan:

1. MCP identity capture and installed inventory, including focused tests.
2. Extension durable storage, registry/bridge ingestion, and copy-click capture, including focused tests.
3. Canonical merge query, cross-stack integration, INV-01/source-pin freeze, and full regression.

Plans 1 and the pure extension helper/test scaffolding in Plan 2 may share Wave 1 only if their file lists do not overlap; the bridge inventory contract must have a single owner. Final integration depends on both.

## Sources Consulted

- `.planning/phases/57-agent-identity-capture/57-CONTEXT.md`
- `.planning/phases/57-agent-identity-capture/57-UI-SPEC.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/research/STACK.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/SUMMARY.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/INTEGRATIONS.md`
- Current source/test files named in the integration table above.

