# Phase 63: Native-Messaging Host - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Mode:** Recommended defaults selected under the standing autonomous instruction

<domain>
## Phase Boundary

Phase 63 adds an optional, one-purpose Chrome native-messaging host that can start or attach to the existing `fsb-mcp-server serve` daemon. The extension may make one bounded wake attempt when delegation preflight finds the daemon offline, then returns to Phase 61's honest doctor/setup fallback if the host is missing or wake-up fails. Install, uninstall, and local doctor diagnostics cover the Chrome user-scope locations named by NATIVE-01 through NATIVE-04 on macOS, Linux, and Windows.

This phase does not install the host implicitly, add a persistent native broker, start an agent CLI, carry pairing secrets, weaken Phase 59 channel gates, add a new loopback port, support LAN/remote wake, implement OpenCode/Codex, or replace the existing doctor fallback. Chrome is the Phase 63 browser target; additional Chromium browser manifests are deferred.

</domain>

<decisions>
## Implementation Decisions

### Native Host Protocol and Lifetime

- Use one closed, versioned native-message request/response protocol for a single operation: wake or attach to `fsb-mcp-server serve`. Requests include only a bounded protocol version, action, and correlation id; responses expose only bounded lifecycle facts such as already running, started, unavailable, or failed.
- Implement the host as a one-shot process using Chrome's length-prefixed stdin/stdout framing. It accepts one valid request, probes the existing loopback daemon, starts only the existing `serve` entrypoint when needed, waits for bounded readiness, returns one response, and exits after handoff.
- The host must never import or instantiate the adapter registry, spawn supervisor, adapter CLIs, delegation task/prompt types, browser-tab state, or pairing/session-secret state. Unknown actions/fields, malformed frames, multiple messages, trailing data, and oversized input fail closed.
- Launch the daemon with an explicit executable and argv array, never a shell or interpolated command. Keep loopback-only binding and every Phase 59 Origin, Host, shared-secret, flag-allowlist, and pairing requirement unchanged.
- Coalesce concurrent wake attempts with a bounded lock/readiness strategy so multiple native-host invocations cannot create a daemon-start storm. A stale lock must recover safely; readiness timeout returns failure without killing an independently running daemon.
- A successful host response means only that the daemon is already reachable or became reachable. It never means the extension is paired, a provider is available, or a delegation started.

### Install, Uninstall, and Platform Identity

- Extend the current CLI router with explicit `install --native-host` and `uninstall --native-host` targets. They are separate from MCP-client configuration installs and are never triggered by ordinary `install`, `serve`, package startup, or extension load.
- Write the Chrome user-scope manifest at the requirement-defined macOS and Linux paths and the requirement-defined Windows HKCU registry location. Use one stable reverse-DNS host name and an absolute package-owned launcher path.
- Allow exactly one `chrome-extension://<id>/` origin. Defaulting to the published FSB Web Store id is acceptable, but development/unpacked installs require an explicit validated extension id; wildcards, multiple origins, non-Chrome origins, malformed ids, and silent discovery from browser profile data are prohibited.
- Validate real paths, ownership/type, symlinks, and existing contents before mutation. Create parent directories/files atomically with restrictive user permissions where supported. Repeated installs with the same exact configuration are idempotent; a foreign or mismatched manifest/registry value fails closed with repair guidance rather than being silently overwritten.
- Uninstall removes only the exact FSB-owned manifest/registry entry and launcher artifact whose ownership marker and expected path match. It must not delete adjacent native hosts, Chrome directories, broad registry keys, or foreign/mismatched files.
- Platform-specific path, launcher, registry, permission, and detached-process behavior must be isolated behind injectable adapters so macOS/Linux/Windows contracts are deterministically testable on one CI platform.

### Extension Wake Orchestration and Honest Fallback

- Add exactly one new extension permission, `nativeMessaging`; preserve every other permission and host permission byte-for-byte.
- Background remains the sole authority for native messaging, bridge state, retries, and persistence. Side-panel/UI code never calls `connectNative`, `sendNativeMessage`, process APIs, or shell/native commands directly.
- Detect host availability at service-worker boot with a bounded, side-effect-free probe. Do not start the daemon merely because the browser or service worker started. Make the actual wake attempt only when the existing authoritative delegation preflight reports the daemon offline or the user invokes the existing retry path.
- Share one in-flight wake across concurrent callers and use a short bounded timeout/backoff. After an already-running/started response, wait for the authenticated bridge to become ready and rerun the existing preflight exactly once. Never replay `delegate.start`, a chat message, or a user gesture after reconnect.
- Missing host, `runtime.lastError`, timeout, malformed response, unavailable daemon, or failed readiness returns to the exact Phase 61 offline card, doctor command, and Providers setup path without optimistic session/feed/tab/composer mutation.
- If the daemon is reachable but the extension is unpaired, show the existing honest pairing/unpaired state. Native messaging never transports, reads, repairs, or derives the shared secret or pairing code.
- Reuse the existing offline-card status/live-region, focus behavior, tokens, compact layout, dark theme, and reduced-motion behavior. Any added wake copy or progress indicator must be truthful, text-readable without color, and must not trap or move focus.

### Doctor, Security, and Verification

- Extend the existing `collectBridgeDiagnostics` snapshot and its text/JSON projections with a closed native-host section. Report install state, expected manifest path, bounded manifest/parse/allowlist/binary/reachability status, and stable reason codes; do not create a second doctor command.
- Doctor stays read-only, offline-capable, and side-effect free: it never installs, repairs, starts, wakes, pairs, or uninstalls the host. Human output may include the local expected path required by NATIVE-04; browser-safe projections must not receive that local path or registry details.
- Never emit manifest contents, usernames, environment variables, secrets, pairing/session values, task content, raw registry values, or child-process output in doctor, native responses, diagnostics, or logs. Bound all paths/strings and reject prototype keys.
- Automated gates cover macOS/Linux/Windows manifest/registry paths, exact allowlist, atomic/idempotent install/uninstall, foreign-file and symlink refusal, permissions, native framing (partial/oversized/malformed/multiple frames), shell-free serve-only launch, concurrent wake coalescing, timeout recovery, bridge readiness, no replay, fallback preservation, and exact manifest-permission delta.
- Source-contract gates prove the host cannot reach adapter/spawn/task authority and that no Phase 59 CHAN invariant changes. Run focused tests, full repository tests, code/security/UI reviews, and artifact/key-link checks before marking automated work complete.
- Genuine installed-host behavior on each operating system, unpacked/published Chrome integration, real daemon wake/attach/uninstall, and rendered accessibility behavior remain `human_needed`. They are accumulated in the single milestone-end UAT ledger and are not run or claimed passed during autonomous phase execution.

### the agent's Discretion

- Exact source filenames, reverse-DNS host name, protocol field/reason labels, timeout values, lock implementation, and whether the extension uses one-shot or connected native APIs may follow existing repository conventions while satisfying the closed one-purpose contract.
- The planner may choose the safest packaging-owned launcher shape per platform and the precise CLI syntax for an explicit development extension id.
- The offline card may show a brief wake-attempt state or remain visually unchanged during the bounded attempt, provided it is accessible, never optimistic, and always returns to the existing actionable fallback on failure.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `mcp/src/index.ts` already owns CLI command routing, help, `serve`, and `doctor`; `mcp/src/install.ts` already owns platform-aware install/uninstall parsing and filesystem abstractions.
- `mcp/src/diagnostics.ts` already builds one validated bridge/adapter/native-independent snapshot used by both text and JSON doctor output.
- `extension/background.js` already owns authoritative delegation preflight and lifecycle; `extension/ws/mcp-bridge-client.js` already owns paired/offline bridge state and reconnect behavior.
- `extension/ui/sidepanel.js` already renders the exact offline doctor/Providers fallback and protects composer/session/feed state from optimistic mutation.
- `tests/mcp-install-platforms.test.js`, `tests/mcp-diagnostics-status.test.js`, `tests/mcp-bridge-background-dispatch.test.js`, `tests/delegation-sidepanel-ui.test.js`, `tests/mcp-version-parity.test.js`, and `tests/delegation-phase-contract.test.js` provide the closest platform, doctor, service-worker VM, UI source/DOM, packaging, and cross-phase contract harnesses.

### Established Patterns

- Daemon/background sources own authoritative lifecycle; UI consumes bounded facts and never infers process, pairing, provider, or task success.
- CLI installers are explicit, platform adapters are injectable, writes are scoped, and diagnostics have stable text/JSON projections from one snapshot.
- Extension-to-daemon messages use exact-shape validation, closed vocabularies, bounded strings, authenticated routes, and no replay after topology changes.
- Missing/corrupt evidence fails closed, and an unavailable external dependency preserves actionable fallback rather than becoming optimistic success.
- Root tests are serial and source-pin heavy; the guarded full-suite wrapper must preserve unrelated dirty user artifacts and generated bundles.

### Integration Points

- Add native-host protocol, framing, daemon readiness, process launch, and one-shot entrypoint modules under `mcp/src/`, reusing the existing `serve` entrypoint without importing delegation spawn authority.
- Extend `mcp/src/install.ts` and `mcp/src/index.ts` for explicit native-host install/uninstall routing, platform adapters, help, and errors.
- Extend `mcp/src/diagnostics.ts` for read-only native-host inspection and the current doctor text/JSON formatter for the new bounded section.
- Add `nativeMessaging` to `extension/manifest.json`; place all presence/wake orchestration in `extension/background.js` and/or a small background-owned helper, then reuse the existing bridge preflight and offline fallback paths.
- Add focused platform/protocol/security/background/UI tests, plus version/build import pins and delegation phase-contract checks, before the guarded full suite.

</code_context>

<specifics>
## Specific Ideas

- Keep the host deliberately boring: one framed wake request, one framed factual response, then exit.
- Treat `already running` and `started` as daemon reachability facts only; paired bridge readiness and delegation preflight remain separate authoritative gates.
- Preserve the exact doctor command and Providers setup fallback even after native wake ships, because the host is optional and may be broken or absent.
- Use the published Web Store id `badgafnfchcihdfnjneklogedcdkmjfk` only as an explicit canonical default; require an exact id override for unpacked development builds instead of broadening the allowlist.

</specifics>

<deferred>
## Deferred Ideas

- Automatic/system-wide host installation, background auto-update/repair, browser-profile discovery, and multi-browser (Edge/Brave/Chromium) manifests.
- Pairing-secret transport, auto-pairing, session restoration through native messaging, remote/LAN wake, a persistent broker, and host-direct agent spawning.
- OpenCode and Codex adapters remain Phases 64 and 65; chat continuation/resumption remains Phase 66.
- All real OS/native-host/browser/accessibility UAT remains in the milestone-end sweep under the user's standing deferral instruction.

</deferred>
