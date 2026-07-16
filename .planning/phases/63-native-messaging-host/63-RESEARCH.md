# Phase 63: Native-Messaging Host — Research

**Researched:** 2026-07-16 [VERIFIED: local environment date and Phase 63 context metadata]  
**Overall confidence:** HIGH for repository architecture and Chrome protocol; MEDIUM for release packaging until a Windows launcher artifact is designed and exercised. [VERIFIED: repository inspection] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc]  
**Scope:** Planning research and deterministic validation design only; genuine OS, Chrome, native-host, and accessibility UAT is deferred. [VERIFIED: `.planning/phases/63-native-messaging-host/63-CONTEXT.md`]

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

[VERIFIED: `.planning/phases/63-native-messaging-host/63-CONTEXT.md`] The following decision text is reproduced verbatim.

#### Native Host Protocol and Lifetime

- Use one closed, versioned native-message request/response protocol for a single operation: wake or attach to `fsb-mcp-server serve`. Requests include only a bounded protocol version, action, and correlation id; responses expose only bounded lifecycle facts such as already running, started, unavailable, or failed.
- Implement the host as a one-shot process using Chrome's length-prefixed stdin/stdout framing. It accepts one valid request, probes the existing loopback daemon, starts only the existing `serve` entrypoint when needed, waits for bounded readiness, returns one response, and exits after handoff.
- The host must never import or instantiate the adapter registry, spawn supervisor, adapter CLIs, delegation task/prompt types, browser-tab state, or pairing/session-secret state. Unknown actions/fields, malformed frames, multiple messages, trailing data, and oversized input fail closed.
- Launch the daemon with an explicit executable and argv array, never a shell or interpolated command. Keep loopback-only binding and every Phase 59 Origin, Host, shared-secret, flag-allowlist, and pairing requirement unchanged.
- Coalesce concurrent wake attempts with a bounded lock/readiness strategy so multiple native-host invocations cannot create a daemon-start storm. A stale lock must recover safely; readiness timeout returns failure without killing an independently running daemon.
- A successful host response means only that the daemon is already reachable or became reachable. It never means the extension is paired, a provider is available, or a delegation started.

#### Install, Uninstall, and Platform Identity

- Extend the current CLI router with explicit `install --native-host` and `uninstall --native-host` targets. They are separate from MCP-client configuration installs and are never triggered by ordinary `install`, `serve`, package startup, or extension load.
- Write the Chrome user-scope manifest at the requirement-defined macOS and Linux paths and the requirement-defined Windows HKCU registry location. Use one stable reverse-DNS host name and an absolute package-owned launcher path.
- Allow exactly one `chrome-extension://<id>/` origin. Defaulting to the published FSB Web Store id is acceptable, but development/unpacked installs require an explicit validated extension id; wildcards, multiple origins, non-Chrome origins, malformed ids, and silent discovery from browser profile data are prohibited.
- Validate real paths, ownership/type, symlinks, and existing contents before mutation. Create parent directories/files atomically with restrictive user permissions where supported. Repeated installs with the same exact configuration are idempotent; a foreign or mismatched manifest/registry value fails closed with repair guidance rather than being silently overwritten.
- Uninstall removes only the exact FSB-owned manifest/registry entry and launcher artifact whose ownership marker and expected path match. It must not delete adjacent native hosts, Chrome directories, broad registry keys, or foreign/mismatched files.
- Platform-specific path, launcher, registry, permission, and detached-process behavior must be isolated behind injectable adapters so macOS/Linux/Windows contracts are deterministically testable on one CI platform.

#### Extension Wake Orchestration and Honest Fallback

- Add exactly one new extension permission, `nativeMessaging`; preserve every other permission and host permission byte-for-byte.
- Background remains the sole authority for native messaging, bridge state, retries, and persistence. Side-panel/UI code never calls `connectNative`, `sendNativeMessage`, process APIs, or shell/native commands directly.
- Detect host availability at service-worker boot with a bounded, side-effect-free probe. Do not start the daemon merely because the browser or service worker started. Make the actual wake attempt only when the existing authoritative delegation preflight reports the daemon offline or the user invokes the existing retry path.
- Share one in-flight wake across concurrent callers and use a short bounded timeout/backoff. After an already-running/started response, wait for the authenticated bridge to become ready and rerun the existing preflight exactly once. Never replay `delegate.start`, a chat message, or a user gesture after reconnect.
- Missing host, `runtime.lastError`, timeout, malformed response, unavailable daemon, or failed readiness returns to the exact Phase 61 offline card, doctor command, and Providers setup path without optimistic session/feed/tab/composer mutation.
- If the daemon is reachable but the extension is unpaired, show the existing honest pairing/unpaired state. Native messaging never transports, reads, repairs, or derives the shared secret or pairing code.
- Reuse the existing offline-card status/live-region, focus behavior, tokens, compact layout, dark theme, and reduced-motion behavior. Any added wake copy or progress indicator must be truthful, text-readable without color, and must not trap or move focus.

#### Doctor, Security, and Verification

- Extend the existing `collectBridgeDiagnostics` snapshot and its text/JSON projections with a closed native-host section. Report install state, expected manifest path, bounded manifest/parse/allowlist/binary/reachability status, and stable reason codes; do not create a second doctor command.
- Doctor stays read-only, offline-capable, and side-effect free: it never installs, repairs, starts, wakes, pairs, or uninstalls the host. Human output may include the local expected path required by NATIVE-04; browser-safe projections must not receive that local path or registry details.
- Never emit manifest contents, usernames, environment variables, secrets, pairing/session values, task content, raw registry values, or child-process output in doctor, native responses, diagnostics, or logs. Bound all paths/strings and reject prototype keys.
- Automated gates cover macOS/Linux/Windows manifest/registry paths, exact allowlist, atomic/idempotent install/uninstall, foreign-file and symlink refusal, permissions, native framing (partial/oversized/malformed/multiple frames), shell-free serve-only launch, concurrent wake coalescing, timeout recovery, bridge readiness, no replay, fallback preservation, and exact manifest-permission delta.
- Source-contract gates prove the host cannot reach adapter/spawn/task authority and that no Phase 59 CHAN invariant changes. Run focused tests, full repository tests, code/security/UI reviews, and artifact/key-link checks before marking automated work complete.
- Genuine installed-host behavior on each operating system, unpacked/published Chrome integration, real daemon wake/attach/uninstall, and rendered accessibility behavior remain `human_needed`. They are accumulated in the single milestone-end UAT ledger and are not run or claimed passed during autonomous phase execution.

### the agent's Discretion

[VERIFIED: `.planning/phases/63-native-messaging-host/63-CONTEXT.md`] The following discretion text is reproduced verbatim.

- Exact source filenames, reverse-DNS host name, protocol field/reason labels, timeout values, lock implementation, and whether the extension uses one-shot or connected native APIs may follow existing repository conventions while satisfying the closed one-purpose contract.
- The planner may choose the safest packaging-owned launcher shape per platform and the precise CLI syntax for an explicit development extension id.
- The offline card may show a brief wake-attempt state or remain visually unchanged during the bounded attempt, provided it is accessible, never optimistic, and always returns to the existing actionable fallback on failure.

### Deferred Ideas

[VERIFIED: `.planning/phases/63-native-messaging-host/63-CONTEXT.md`] The following deferred text is reproduced verbatim.

- Automatic/system-wide host installation, background auto-update/repair, browser-profile discovery, and multi-browser (Edge/Brave/Chromium) manifests.
- Pairing-secret transport, auto-pairing, session restoration through native messaging, remote/LAN wake, a persistent broker, and host-direct agent spawning.
- OpenCode and Codex adapters remain Phases 64 and 65; chat continuation/resumption remains Phase 66.
- All real OS/native-host/browser/accessibility UAT remains in the milestone-end sweep under the user's standing deferral instruction.

</user_constraints>

<phase_requirements>

## Phase Requirements

| Requirement | Exact requirement | Research support |
|---|---|---|
| NATIVE-01 | `fsb-mcp-server install --native-host` writes the platform-appropriate native-messaging host manifest (macOS `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`, Linux `~/.config/google-chrome/NativeMessagingHosts/`, Windows registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\`), allowing the FSB extension id as the sole caller, and installs a host binary that wakes the daemon on demand. | Use a stable package-owned runtime root, exact one-origin manifest, platform adapter, atomic ownership marker, and shell-free one-shot launcher. The Windows executable artifact is explicit Wave 0 work. [VERIFIED: `.planning/REQUIREMENTS.md`] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] |
| NATIVE-02 | The extension's manifest gains a `nativeMessaging` permission entry (additive, no other permission changes), and the extension detects native-host presence at boot; when present, an "Agent offline" state auto-attempts a wake before showing the doctor deep-link. | Add only the permission, use a silent no-message `connectNative` presence probe, and allow `sendNativeMessage` only inside the background-owned authoritative offline-preflight path. [VERIFIED: `extension/manifest.json` and `extension/background.js`] [CITED: https://developer.chrome.com/docs/extensions/reference/api/runtime/] |
| NATIVE-03 | The native host itself does not spawn agents; it only starts `fsb-mcp-server serve` (or attaches to a running one) and exits after handoff. All spawn authority remains inside the `serve` daemon behind the CHAN gates. | Enforce a core-only import graph, a single exact spawn tuple for `serve`, no adapter/task/secret imports, one response, and process exit. [VERIFIED: `.planning/REQUIREMENTS.md` and current `mcp/src/agent-providers/` authority boundary] |
| NATIVE-04 | `fsb-mcp-server uninstall --native-host` removes the manifest, and `doctor` reports native-host install state including manifest path and any Chrome allowlist mismatch. | Extend the existing diagnostic snapshot and formatter, preserve CLI-only path visibility, and delete only an exact owned registration/runtime match. [VERIFIED: `mcp/src/diagnostics.ts`, `mcp/src/index.ts`, and `63-UI-SPEC.md`] |

</phase_requirements>

## Summary

[VERIFIED: `mcp/src/index.ts`, `mcp/src/http.ts`, `mcp/src/agent-providers/serve-delegation.ts`, `extension/background.js`, and `extension/ui/sidepanel.js`] Phase 63 is best planned as five narrow seams: a protocol-only host, an owned cross-platform installer, a daemon readiness/start primitive, background-only wake orchestration, and an additive doctor/UI projection. The existing authenticated bridge and delegation preflight remain the authority after native wake; the native response is only a local reachability fact.

[CITED: https://developer.chrome.com/docs/extensions/reference/api/runtime/] Chrome's documented extension surface provides `connectNative()` and `sendNativeMessage()` but no installed-host enumeration call. Boot “detection” therefore cannot be an authoritative inventory lookup. It should be a bounded, advisory, no-message connection probe that never starts the daemon; the actual wake path must revalidate by sending the closed request.

[VERIFIED: `mcp/src/index.ts:runHttpMode` and `mcp/src/agent-providers/serve-delegation.ts:startServeDelegation`] The repository has a critical ordering seam to fix before native wake: `runHttpMode` rotates the bridge session secret before the HTTP listener bind is known to have succeeded. A losing concurrent `serve` process can therefore rotate the live daemon's secret and then fail with an address-in-use error. Planning must move rotation behind successful bind/recovery and before bridge connection, with a test proving a bind loser never rotates.

[VERIFIED: npm execution semantics and the current package layout] [CITED: https://nodejs.org/api/child_process.html] An `npx`-invoked installer must not register a launcher inside its transient npm cache. The installation contract needs a durable package-owned runtime root and an absolute launcher path. The recommended implementation materializes the exact current production package into a staged stable root, validates its package/version and launcher artifacts, then atomically publishes the registration last.

[VERIFIED: `.github/workflows/*.yml` and local environment inspection] [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] Windows is the largest planning uncertainty. Chromium directly starts `.exe` hosts and routes non-executable launchers through legacy `cmd.exe` behavior; the repository currently has no Windows build/test job. A minimal release-built Windows launcher executable and its artifact verification must therefore be Wave 0, with no silent `.cmd`/`.bat` fallback.

## Architectural Responsibility Map

[VERIFIED: current repository ownership patterns and `63-CONTEXT.md`]

```text
Chrome side panel
  renders checking / existing preflight result only
          |
          | FSB_DELEGATION_PREFLIGHT (existing command)
          v
MV3 background service worker
  authoritative preflight -> offline only -> one shared wake attempt
          |                                  |
          | chrome.runtime.sendNativeMessage | boot: connectNative, no message
          v                                  v
One-shot native host                    advisory presence cache
  exact frame -> exact request
  read-only health probe
  lock -> direct spawn of stable build/index.js serve
  bounded readiness -> exact response -> exit
          |
          | loopback GET /health
          v
Existing fsb-mcp-server serve daemon
  HTTP bind -> safe secret rotation -> authenticated bridge connect
          |
          v
Existing background bridge readiness -> exactly one preflight rerun
          |
          +-- ready: existing consent/start path
          +-- unpaired: existing honest pairing state
          +-- otherwise: exact Phase 61 offline fallback

CLI install/uninstall ---- platform adapter ---- stable runtime + Chrome registration
CLI doctor ------------ read-only adapter ----- closed snapshot/text/JSON section
```

| Owner | New authority | Explicit non-authority | Evidence |
|---|---|---|---|
| `mcp/src/native-host/*` | Frame parsing, exact wake protocol, health probe, lock, exact daemon spawn, bounded response. | No adapter registry, task/prompt, browser state, pairing/session secret, agent spawn, shell, or repair. | [VERIFIED: locked Phase 63 boundary] |
| `mcp/src/native-host-install/*` or equivalent | Resolve user-scope registration, stage owned runtime, validate exact existing state, install/uninstall exact artifacts. | No implicit install, profile discovery, system-wide keys, adjacent deletion, or overwrite of foreign state. | [VERIFIED: NATIVE-01/NATIVE-04 and locked decisions] |
| `mcp/src/index.ts` / serve lifecycle | Route explicit CLI targets and expose a post-bind/pre-bridge auth preparation hook. | No native request parsing or UI policy. | [VERIFIED: current router and lifecycle] |
| `mcp/src/diagnostics.ts` | Collect closed local host facts through injected read-only dependencies. | No install, wake, repair, secret or raw registry projection. | [VERIFIED: existing snapshot architecture and UI contract] |
| `extension/background.js` or background helper | Presence probe, one-flight wake, timeout/backoff, bridge wait, one preflight rerun, closed checking event. | No message/start replay and no local success inference. | [VERIFIED: existing background authority and locked decisions] |
| `extension/ui/sidepanel.js` | Render the exact checking presentation only for a current pending intent. | No native API, platform data, daemon command, retry loop, or optimistic mutation. | [VERIFIED: `63-UI-SPEC.md`] |

## Standard Stack

### Core

| Concern | Use | Why | Confidence |
|---|---|---|---|
| Runtime | Existing Node.js ESM/TypeScript target and Node core APIs. | The MCP package already targets ES2022 and supports Node >=18.20; framing, files, HTTP, locks, and spawning are available in core. [VERIFIED: `mcp/package.json` and `mcp/tsconfig.json`] | HIGH |
| Native protocol | Chrome native-messaging 4-byte native-endian length prefix plus one UTF-8 JSON object each direction. | This is Chrome's required wire contract. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] | HIGH |
| Process launch | `node:child_process.spawn(executable, argv, { shell: false, detached: true, stdio: 'ignore', windowsHide: true })` followed by `unref()`. | It preserves an explicit executable/argv boundary and allows the daemon to outlive the one-shot host. [CITED: https://nodejs.org/api/child_process.html] | HIGH |
| Filesystem safety | `node:fs/promises` with `lstat`, `realpath`, exclusive creation, restrictive mode, staged rename, and directory/file sync where supported. | These are the core primitives needed for symlink refusal and atomic publication. [CITED: https://nodejs.org/api/fs.html] | HIGH |
| Extension API | `chrome.runtime.connectNative` for silent advisory boot probing; `chrome.runtime.sendNativeMessage` for the one-shot wake. | `sendNativeMessage` starts a host for one message and uses the first response; `connectNative` holds a host until the port closes. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] | HIGH |
| Validation | Existing `node:test` source/VM/DOM harnesses and guarded serial full suite. | The repository already uses these harnesses for platform installers, diagnostics, service-worker dispatch, UI, and source contracts. [VERIFIED: listed tests and `scripts/run-phase60-full-tests.mjs`] | HIGH |

### Supporting Repository Contracts

| Contract | Reuse |
|---|---|
| Existing `fsbDelegationPreflightCommand` | It remains the only wake trigger after an authoritative offline result and the authority for the one rerun. [VERIFIED: `extension/background.js`] |
| Existing exact preflight validator | Keep its response shape unchanged; native lifecycle facts must not leak into that contract. [VERIFIED: `extension/utils/delegation-preflight.js`] |
| Existing `collectBridgeDiagnostics` | Add one closed native-host object and derive both text and JSON from it. [VERIFIED: `mcp/src/diagnostics.ts` and `mcp/src/index.ts`] |
| Existing offline/unpaired card | Reuse exact Phase 61 copy/actions and pairing state after the checking state resolves. [VERIFIED: `63-UI-SPEC.md` and `extension/ui/sidepanel.js`] |
| Existing version constants | Reuse product/version/loopback defaults in a minimal constants leaf rather than duplicating them. [VERIFIED: `mcp/src/version.ts`] |

### Installation Recommendation

[VERIFIED: current package is `fsb-mcp-server` and the CLI can be run from transient package-manager locations] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] Use a stable per-user runtime root rather than the current executable/package path:

- macOS/Linux: `~/.fsb/native-host/`. [VERIFIED: recommended project-owned location; Chrome's registration location remains the requirement-defined Chrome directory]
- Windows: `%LOCALAPPDATA%\FSB\NativeMessagingHost\`. [VERIFIED: recommended project-owned user location; Chrome's registration remains HKCU]
- Stable host name: `io.github.fullselfbrowsing.fsb_native_host`. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging]
- Default origin: `chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/`; development override must match `^[a-p]{32}$`. [VERIFIED: `63-CONTEXT.md`] [CITED: https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/common/extension_id.h]
- Runtime staging: invoke an absolute npm executable with an argv array and `shell:false` to materialize the exact current `fsb-mcp-server@<version>` production package into a temporary owned root, with lifecycle scripts disabled; validate the installed package name/version and expected artifacts before rename. [VERIFIED: recommended durable packaging contract] [CITED: https://nodejs.org/api/child_process.html]
- Registration publication: create the Chrome manifest/registry value only after the runtime and ownership marker are complete; on failure, remove only the current attempt's tokened staging directory. [VERIFIED: recommended atomic ownership contract]

[VERIFIED: no additional third-party runtime package is needed for the proposed protocol, lock, health, filesystem, or spawn implementation] No dependency installation is recommended for implementation itself. The stable runtime materialization above installs the existing product package, not a new library; package-legitimacy research is therefore not applicable.

### Launcher Choice

| Platform | Recommended shape | Planning consequence |
|---|---|---|
| macOS/Linux | An executable, package-owned JavaScript launcher with an installer-written absolute Node shebang, core-only imports, and mode `0700`. Refuse installation if the interpreter path cannot be represented safely by the platform shebang contract. [VERIFIED: recommended shell-free design] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] | Tests must pin the absolute path, executable mode, no shell wrapper, and an import-graph allowlist. |
| Windows | A minimal release-built `.exe` bootstrap that reads only its exact sibling owned configuration, starts the absolute installed Node executable with the stable host script, forwards only Chrome's origin and optional parent-window argv slots for authoritative validation by the Node host, inherits native stdin/stdout/stderr handles, waits for the child, and returns its exit code. [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] | Wave 0 must define source, cross-build/release artifact, checksum/version embedding, package inclusion, owned-config validation, handle inheritance, exit propagation, and synthetic argument tests before feature implementation. |

[CITED: https://nodejs.org/api/single-executable-applications.html] Do not make Node Single Executable Applications the Phase 63 dependency. SEA is still marked active development, and the convenient built-in `--build-sea` workflow was added in Node 25.5 while this package supports Node 18.20 and CI uses Node 20. The older injection workflow would introduce additional artifact tooling and signing/release work not needed for the one-purpose host.

## Architecture Patterns

### Pattern 1: Closed Protocol Before Side Effects

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [VERIFIED: locked decisions] Read bytes into bounded `Buffer` chunks, reject a declared payload over 4096 bytes before allocation, decode exactly one UTF-8 JSON object with a fatal decoder, validate exact own keys and scalar bounds, then allow any health probe or spawn side effect.

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] Chrome's transport maxima are much larger—64 MiB from Chrome to the host and 1 MiB from the host to Chrome—so the 4096-byte FSB limit is an intentional tighter application boundary, not a browser limitation.

Recommended request:

```json
{
  "v": 1,
  "action": "wake",
  "correlationId": "bounded-safe-id"
}
```

Recommended response:

```json
{
  "v": 1,
  "correlationId": "same-bounded-safe-id",
  "outcome": "started",
  "reason": "closed_reason_code"
}
```

[VERIFIED: recommended exact protocol] Use only own plain-object properties; require `v === 1`, `action === 'wake'`, and a 16–64 character correlation id drawn from a small ASCII alphabet. Reject unknown/prototype keys, extra frames, trailing bytes, invalid UTF-8/JSON, non-integers, empty input, and output over the same 4096-byte local cap.

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] Chrome passes the calling extension origin as the first native-host argument and, on Windows, may include a parent-window argument. Validate the exact expected origin independently of the JSON payload. Permit only the exact optional bounded Windows `--parent-window=<digits>` form; ignore its value and reject every other argument.

[VERIFIED: one-shot lifecycle recommendation] A no-frame EOF from the boot probe exits successfully without probing or starting the daemon. For a framed request, wait a short bounded settle window after the complete first frame so already-buffered/fragmented trailing input can be rejected before acting. Write exactly one framed response to stdout and route any bounded development diagnostics to stderr only.

### Pattern 2: Product-Specific Readiness, Not “Port Open”

[VERIFIED: `mcp/src/http.ts` currently returns generic `ok` and topology facts at `/health`] Extend the response with an exact product marker, a bounded product version, and a serve-readiness boolean. The host and doctor must cap response bytes and time, require HTTP 200, require the exact marker/version compatibility policy, and accept success only when readiness is true.

Recommended closed health addition:

```json
{
  "ok": true,
  "service": "fsb-mcp-server",
  "version": "<bounded product version>",
  "serveReady": true
}
```

[VERIFIED: `startServeDelegation` binds HTTP before connecting the bridge] Model readiness as a lifecycle state: listener bound, stale runtime recovery complete, bridge secret safely prepared, bridge connected, and initial inventory push complete. Until those steps succeed, `serveReady` must remain false even if the HTTP port accepts connections.

### Pattern 3: Post-Bind Secret Rotation Hook

[VERIFIED: current `runHttpMode` rotates before `startServeDelegation`, while `startServeDelegation` binds HTTP then recovers then connects/pushes] Add an injected lifecycle hook such as `prepareBridgeAuth` that runs once after HTTP bind and recovery, but before bridge connection. Move `rotateBridgeSessionSecret()` into that hook.

Required ordering:

```text
bind loopback HTTP
  -> recover stale serve state
  -> rotate bridge session secret
  -> connect authenticated bridge
  -> push inventory
  -> mark serveReady
```

[VERIFIED: required concurrency regression] A test must start two lifecycle attempts against one port and assert the bind loser never calls `prepareBridgeAuth`, never changes auth state, never connects the bridge, and closes only its own resources.

### Pattern 4: Tokened Lock Directory and Readiness Polling

[CITED: https://nodejs.org/api/fs.html] [VERIFIED: recommended coalescing design] Use atomic directory creation for `wake.lock` under the owned runtime root. Store a bounded owner token and creation time in a closed metadata file. A contender does not spawn; it polls product-specific readiness until the shared timeout.

[VERIFIED: recommended stale recovery] Set stale TTL greater than the maximum readiness window. A contender that sees an expired lock first rechecks daemon health, atomically renames the lock directory to a tokened quarantine name, then removes only that quarantine. Release requires an exact owner-token match. Never signal or kill a process based on lock contents.

[VERIFIED: recommended wake algorithm]

```text
probe exact /health
  reachable+ready -> already_running
  offline:
    acquire lock -> spawn serve -> poll exact /health -> started|failed
    lock busy    -> poll exact /health -> already_running|failed
  wrong product / malformed / incompatible -> unavailable (never spawn over it)
```

### Pattern 5: Direct, Sanitized Serve Spawn

[CITED: https://nodejs.org/api/child_process.html] [VERIFIED: locked daemon boundary] Spawn the installed absolute Node executable with the absolute stable `build/index.js` and exact argv `['serve', '--host', '127.0.0.1', '--port', '7226']`. Use `shell:false`, `detached:true`, `stdio:'ignore'`, `windowsHide:true`, the stable runtime root as `cwd`, await the child `spawn` or `error` event, and call `unref()` only after a successful spawn. Readiness still comes only from the exact health poll.

[VERIFIED: recommended environment boundary] Preserve the existing `serve` environment contract through a dedicated sanitizer: remove `NODE_OPTIONS` and `NODE_PATH`, never derive environment entries from native request/origin/task fields, and never log or serialize inherited values. Do not silently drop variables the existing daemon or later adapter processes require; pin the sanitizer with tests. The spawned daemon still performs all existing authenticated bridge/pairing checks.

### Pattern 6: Advisory Boot Probe, Authoritative Wake

[CITED: https://developer.chrome.com/docs/extensions/reference/api/runtime/] At service-worker boot, call `connectNative(hostName)`, attach disconnect/error listeners immediately, send no message, and close the port after a small timeout. A missing registration normally surfaces through disconnect/`runtime.lastError`; an open port means only “probe could connect.” Cache only `present | absent | unknown` for bounded advisory use.

[VERIFIED: locked no-boot-wake rule] The one-shot host must treat no-message disconnect/EOF as a clean no-op. Boot probe state never renders UI and never suppresses the later authoritative wake: offline preflight still calls `sendNativeMessage` and trusts only its validated result.

### Pattern 7: One In-Flight Wake and Attempt-Scoped UI

[VERIFIED: existing background preflight ownership and UI contract] Put a module-scoped native-wake controller in background code. Concurrent offline preflight callers join one promise; each caller receives or is associated with an attempt id so its side-panel intent can show one checking presentation even if it joined after the shared attempt began.

[VERIFIED: recommended controller behavior] Race `sendNativeMessage` against a bounded timer, validate the exact response/correlation id, ignore late settlement by attempt token, and apply a short session-only cooldown after timeout/failure. Do not persist an optimistic “installed” or “started” flag.

[VERIFIED: `63-UI-SPEC.md`] While a current preflight is pending, background may broadcast the exact checking presentation:

- Heading: `Checking local agent service`. [VERIFIED: UI contract]
- Body: `FSB is trying to make the local agent service available. Your message has not been sent.` [VERIFIED: UI contract]
- Polite announcement: `Checking local agent service. Your message has not been sent.` [VERIFIED: UI contract]
- Header: `Checking agent service`. [VERIFIED: UI contract]

[VERIFIED: UI contract and current side-panel pending-preflight gate] Keep the original preflight response promise open while checking. The panel renders the event only for its current pending intent, disables duplicate Send through the existing gate, leaves the composer editable and byte-preserved, and compares current text with the captured text before any continuation. An edit invalidates continuation and requires a fresh Send.

[VERIFIED: locked orchestration] On `already_running` or `started`, wait for authenticated bridge readiness, rerun the existing preflight once, and return that existing exact result. Never replay `delegate.start`, submit a message, synthesize a gesture, create feed/session/tab state, or infer pairing/provider availability.

### Pattern 8: Owned, Transactional Install/Uninstall

[VERIFIED: recommended installation transaction]

1. Parse only explicit `install --native-host [--extension-id <id>]` or `uninstall --native-host`. [VERIFIED: locked CLI scope]
2. Validate platform, exact extension id, absolute interpreter, package version, stable root, parent types, real paths, and symlink absence before mutation. [VERIFIED: locked safety requirements]
3. Inspect both the owned runtime marker and Chrome registration; classify exact, absent, foreign, mismatched, invalid, or unavailable. [VERIFIED: recommended closed-state model]
4. Treat an exact installed configuration as an idempotent no-op; refuse every foreign/mismatched state with a stable reason and doctor guidance. [VERIFIED: locked behavior]
5. Build the runtime and manifest in a tokened staging root with user-only permissions, sync, rename into place, and publish registration last. [CITED: https://nodejs.org/api/fs.html] [VERIFIED: recommended atomic sequence]
6. Uninstall only after marker, manifest/registry, origin, launcher path, package identity, and stable root all match; remove registration first and only then exact owned runtime artifacts. [VERIFIED: locked ownership boundary]

[VERIFIED: recommended marker contract] Keep ownership metadata in a separate closed marker because Chrome's manifest schema should remain exact. Suggested fields are schema version, owner id, host name, origin, platform, runtime version, launcher relative path, and install token. Never place secrets, usernames, arbitrary paths, timestamps used as authority, or raw registry data in the marker.

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] The Chrome manifest should contain exactly:

```json
{
  "name": "io.github.fullselfbrowsing.fsb_native_host",
  "description": "FSB local agent service wake host",
  "path": "<absolute package-owned launcher path>",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/"
  ]
}
```

[VERIFIED: locked permissions requirement] On POSIX, target owned runtime directories/launcher at `0700` and marker/manifest files at `0600` where supported. Do not recursively chmod pre-existing Chrome directories. Tests should use injected permission operations because host filesystems and Windows ACL behavior differ.

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [CITED: https://learn.microsoft.com/en-us/windows/win32/sysinfo/32-bit-and-64-bit-application-data-in-the-registry] On Windows, inspect user-scope registrations in both registry views to detect a shadow/mismatch, never write HKLM, and write only the exact host-name value whose default `REG_SZ` data is the full manifest path. Isolate registry operations behind an adapter so exact 32/64-bit view behavior and error codes are contract-tested without parsing localized human output.

### Pattern 9: One Diagnostic Snapshot, Two Projections

[VERIFIED: current `collectBridgeDiagnostics` pattern and `63-UI-SPEC.md`] Add one closed `nativeHost` object to the existing diagnostics snapshot with internal lowercase enums and bounded fields. Format the human section after `Bridge auth:` and before `Install paths:`:

```text
Native messaging host:
  Install state: {Installed|Not installed|Invalid|Unavailable}
  Expected location: {bounded platform path or HKCU registry location}
  Manifest/registry: {Valid|Missing|Invalid|Unavailable}
  Chrome allowlist: {Matches|Mismatch|Not reported}
  Launcher: {Reachable|Missing|Invalid|Unavailable}
  Daemon: {Reachable|Offline|Unavailable}
  Reason: {stable_reason_code}
```

[VERIFIED: locked projection boundary] Local CLI JSON may carry the bounded expected location required by NATIVE-04, but any browser-safe projection must omit it and all registry detail. Preserve the current overall diagnostic layer/exit semantics; native-host absence is an optional-component fact, not an automatic global failure.

## Recommended Project Structure

[VERIFIED: recommended layout following existing `mcp/src` and test conventions]

```text
mcp/src/
  native-host/
    protocol.ts              exact frame and object validation
    daemon.ts                exact health probe, lock, spawn, readiness
    entry.ts                 one-shot stdin/stdout orchestration
    constants.ts             leaf-only host/protocol/product constants
    platform.ts              injected platform contracts
  native-host-install.ts     explicit transaction and ownership checks
  diagnostics.ts             additive closed nativeHost snapshot
  index.ts                   CLI routes + safe serve auth hook

extension/
  background.js              command integration only
  utils/native-host-wake.js  background-only controller (if extraction helps)
  ui/sidepanel.js            closed checking presentation
  ui/sidepanel.css           spinner + reduced-motion/forced-colors
  manifest.json              only nativeMessaging permission added

scripts/
  verify-native-host-boundary.mjs

tests/
  mcp-native-host-protocol.test.js
  mcp-native-host-daemon.test.js
  mcp-native-host-install.test.js
  native-host-background-wake.test.js
  existing diagnostics/background/UI/version/contract tests extended
```

[VERIFIED: locked source authority] If a helper is shared with installer/doctor, keep it a data-only leaf. The host entry's transitive import graph must never include `agent-providers` adapters, supervisors, task/prompt schemas, browser state, bridge auth, installer, diagnostics, or the CLI router.

## Do Not Hand-Roll

| Concern | Use instead | Evidence |
|---|---|---|
| Native frame I/O | Node `Buffer` and stream events with a small explicit state machine. | Chrome's framing is binary and byte-counted; JavaScript string length is not a byte length. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [CITED: https://nodejs.org/api/buffer.html] |
| Shell quoting | `spawn` with absolute executable and argv and `shell:false`. | Shell wrappers reintroduce interpolation and platform quoting ambiguity. [CITED: https://nodejs.org/api/child_process.html] |
| Recursive dependency copying from an npm cache | Exact package-manager materialization into a staged prefix, then validate. | npm dependency layouts may contain nested and linked paths; the registration must remain valid after the invoking cache disappears. [VERIFIED: recommended packaging boundary based on current package execution model] |
| Windows batch host | Release-built minimal `.exe` launcher. | Chromium uses legacy `cmd.exe` handling for non-`.exe` host paths. [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] |
| PID killing for stale locks | Tokened atomic lock replacement plus health polling. | A stale PID can refer to another process, and the phase forbids killing an independently running daemon. [VERIFIED: locked readiness behavior] |
| “Port open means FSB” | Exact bounded `/health` product/version/readiness validation. | The current port could be occupied by an unrelated or partially initialized service. [VERIFIED: current generic health response and recommended hardening] |
| Host discovery by scanning Chrome profiles | Explicit configured host name and advisory native connection probe. | Profile discovery is deferred and Chrome exposes the native connection APIs needed for the probe. [VERIFIED: deferred ideas] [CITED: https://developer.chrome.com/docs/extensions/reference/api/runtime/] |
| A second doctor data model | Extend `collectBridgeDiagnostics` and its existing projections. | The context explicitly forbids a second doctor command. [VERIFIED: locked decision] |
| New UI state system | Existing delegation state card, announcer, pending gate, and tokens. | The approved UI contract requires reuse of these surfaces. [VERIFIED: `63-UI-SPEC.md`] |
| Node SEA in this phase | Existing Node runtime plus a minimal launcher artifact. | Built-in SEA creation is newer than the project's runtime/CI baseline and SEA is still active development. [CITED: https://nodejs.org/api/single-executable-applications.html] [VERIFIED: package/CI baselines] |

## Common Pitfalls

### 1. Secret rotation by a losing daemon

[VERIFIED: `mcp/src/index.ts:317-318`] Current ordering rotates before bind. Under simultaneous native wakes, one process may lose the port race after rotating shared auth. Move rotation behind successful bind and prove it with a concurrency test.

### 2. Treating boot detection as wake

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [VERIFIED: locked boot behavior] `connectNative` starts a host process. Therefore “side-effect-free” means the host process itself must no-op on no-message EOF; it does not mean Chrome can inspect registration without launching anything. Never send the wake frame during boot.

### 3. Registering an ephemeral launcher

[VERIFIED: recommended packaging boundary] `npx` and package-manager cache paths are not a durable install contract. Register only the stable owned root and test that the invoking source tree/cache can disappear without changing the manifest target.

### 4. Accepting a generic health response

[VERIFIED: `mcp/src/http.ts` current health fields] `ok: true` alone is insufficient to distinguish a correct, compatible, fully initialized daemon. Pin service, version compatibility, readiness, body size, content type, loopback host, and timeout.

### 5. Parsing after spawning

[VERIFIED: locked fail-closed protocol] If the host acts immediately on the first complete frame, already-buffered trailing bytes or a second message can be detected too late. Finish the bounded one-frame/trailing-data decision before any health/spawn side effect.

### 6. Logging to stdout

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] Chrome reserves stdout for framed protocol data. One debug line corrupts the stream. Tests must capture raw stdout and assert it contains exactly one frame or nothing on fail-closed input.

### 7. Optimistic continuation after a native success fact

[VERIFIED: locked lifecycle and UI contract] `started` and `already_running` do not prove pairing, bridge readiness, provider availability, or task acceptance. Wait for authenticated bridge readiness and use one existing preflight rerun; never create a user message/run/feed entry early.

### 8. Stale captured composer text

[VERIFIED: `63-UI-SPEC.md`] The composer remains editable while checking. If text changes, the preflight continuation for the captured text is stale. Require a new explicit Send and never auto-submit either version.

### 9. One-flight background work but missed caller UI

[VERIFIED: recommended concurrency handling] A caller that joins after the checking event was broadcast can miss it. Associate each preflight caller with the shared attempt id and emit/return the closed checking state per current intent while keeping the native work coalesced.

### 10. Windows registration shadowing

[CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] [CITED: https://learn.microsoft.com/en-us/windows/win32/sysinfo/32-bit-and-64-bit-application-data-in-the-registry] Chrome checks user registration and registry views in a defined platform path. Inspect both relevant views and classify disagreement; do not silently overwrite one while another shadows it.

### 11. Broad uninstall

[VERIFIED: locked uninstall boundary] A matching host name alone is not ownership proof. Require exact marker, stable root, origin, registration path, launcher identity, and schema/version compatibility before deletion; otherwise report mismatch and change nothing.

### 12. Exposing local diagnostic detail to the browser

[VERIFIED: locked doctor and UI boundary] Paths, registry locations/values, raw exception strings, child output, usernames, and environment values belong nowhere in extension messages, storage, DOM, or announcements. Keep the side-panel state to the exact approved copy.

## Code Examples

### Bounded native frame decoder

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [CITED: https://nodejs.org/api/buffer.html] [CITED: https://nodejs.org/api/stream.html] Recommended shape; exact types/names may follow repository conventions.

```ts
const MAX_FRAME_BYTES = 4096;
const HEADER_BYTES = 4;

function readNativeLength(header: Buffer): number {
  return os.endianness() === 'LE'
    ? header.readUInt32LE(0)
    : header.readUInt32BE(0);
}

function decodeOneFrame(input: Buffer): unknown {
  if (input.length < HEADER_BYTES) throw new ProtocolError('truncated_header');
  const length = readNativeLength(input.subarray(0, HEADER_BYTES));
  if (length === 0 || length > MAX_FRAME_BYTES) {
    throw new ProtocolError('invalid_length');
  }
  if (input.length !== HEADER_BYTES + length) {
    throw new ProtocolError(
      input.length < HEADER_BYTES + length ? 'truncated_frame' : 'trailing_data'
    );
  }
  return parseExactWakeRequest(input.subarray(HEADER_BYTES));
}
```

### Exact direct daemon spawn

[CITED: https://nodejs.org/api/child_process.html] [VERIFIED: locked serve-only boundary] Recommended shape.

```ts
const child = spawn(
  absoluteNode,
  [
    absoluteServerEntry,
    'serve',
    '--host',
    '127.0.0.1',
    '--port',
    String(DEFAULT_HTTP_PORT),
  ],
  {
    cwd: stableRuntimeRoot,
    env: buildDaemonEnvironment(process.env),
    shell: false,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  },
);
child.unref();
```

### Safe serve lifecycle hook

[VERIFIED: recommended correction to current lifecycle ordering]

```ts
const readyHttpServer = await dependencies.startHttpServer(...);
try {
  await dependencies.recover();
  await dependencies.prepareBridgeAuth();
  await bridge.connect();
  await dependencies.pushInventory(bridge);
  readyHttpServer.markServeReady();
} catch (error) {
  await closeOwnedResources();
  throw error;
}
```

### Background one-flight wake

[VERIFIED: recommended background-only pattern] [CITED: https://developer.chrome.com/docs/extensions/reference/api/runtime/]

```js
let wakeAttempt = null;

function ensureNativeWake() {
  if (wakeAttempt) return wakeAttempt.promise;

  const token = createAttemptToken();
  const promise = raceNativeMessageWithTimeout(token)
    .then((response) => validateWakeResponse(response, token.correlationId))
    .finally(() => {
      if (wakeAttempt?.token === token) wakeAttempt = null;
    });

  wakeAttempt = { token, promise };
  return promise;
}
```

### Read-only doctor projection

[VERIFIED: approved UI text contract] Recommended closed internal shape.

```ts
type NativeHostDoctor = Readonly<{
  installState: 'installed' | 'not_installed' | 'invalid' | 'unavailable';
  expectedLocation: string;
  registration: 'valid' | 'missing' | 'invalid' | 'unavailable';
  allowlist: 'matches' | 'mismatch' | 'not_reported';
  launcher: 'reachable' | 'missing' | 'invalid' | 'unavailable';
  daemon: 'reachable' | 'offline' | 'unavailable';
  reason: NativeHostDoctorReason;
}>;
```

## State of the Art in This Repository

| Existing state | Planning implication | Confidence |
|---|---|---|
| `runHttpMode` calls `rotateBridgeSessionSecret()` before `startServeDelegation()`. [VERIFIED: `mcp/src/index.ts`] | First plan must correct ordering and add a bind-loser regression before enabling concurrent native starts. | HIGH |
| `startServeDelegation` owns HTTP start, stale recovery, bridge connect, and inventory push in sequence. [VERIFIED: `mcp/src/agent-providers/serve-delegation.ts`] | Add an injected auth-preparation hook and readiness transition here instead of duplicating serve startup in the native host. | HIGH |
| `/health` already exists at the serve HTTP endpoint and exposes topology. [VERIFIED: `mcp/src/http.ts`] | Extend it minimally with product/version/readiness; do not add a new port. | HIGH |
| HTTP defaults to `127.0.0.1:7226` and the bridge uses `7225`. [VERIFIED: `mcp/src/version.ts` and serve routing] | Native health/spawn must reuse the HTTP default and must not probe or mutate the bridge secret. | HIGH |
| `mcp/src/install.ts` already has platform-aware install/uninstall parsing and injectable filesystem seams. [VERIFIED: local source inspection] | Add a dedicated explicit native-host branch before broad/legacy target handling; do not include it in ordinary or `--all` install. | HIGH |
| Legacy installer code uses shell-oriented `execSync` patterns for some existing client integrations. [VERIFIED: `mcp/src/install.ts`] | Native-host registry/materialization must use a dedicated injected argv/process adapter, not interpolate into those helpers. | HIGH |
| `collectBridgeDiagnostics` already produces one snapshot consumed by text and JSON. [VERIFIED: `mcp/src/diagnostics.ts` and `mcp/src/index.ts`] | Add the native section to this model and preserve current layer/exit-code semantics. | HIGH |
| The current manifest has no `nativeMessaging` permission. [VERIFIED: `extension/manifest.json`] | Byte-pin all existing permissions and host permissions; the only allowed delta is one permission string. | HIGH |
| Background owns `FSB_DELEGATION_PREFLIGHT`; the side panel waits on it with a pending gate. [VERIFIED: `extension/background.js` and `extension/ui/sidepanel.js`] | Put wake inside this command path and keep the original Promise pending so no new UI authority is introduced. | HIGH |
| The pure preflight validator has an established exact shape. [VERIFIED: `extension/utils/delegation-preflight.js`] | Do not add native lifecycle fields to it; use a separate closed presentation event if checking UI is shown. | HIGH |
| The bridge client already distinguishes offline/unpaired and reconnect behavior. [VERIFIED: `extension/ws/mcp-bridge-client.js`] | After wake, rely on authenticated bridge readiness and existing unpaired projection. | HIGH |
| Existing tests cover install platforms, diagnostics, background dispatch, side-panel UI, topology, version parity, and delegation contracts. [VERIFIED: `tests/` named harnesses] | Extend those seams plus four focused new suites; do not replace source-contract coverage with live Chrome claims. | HIGH |
| Root tests are serial and the guarded wrapper protects unrelated/generated artifacts. [VERIFIED: root scripts and prior phase contracts] | Focused tests should run first; the final automated gate remains `node scripts/run-phase60-full-tests.mjs`. | HIGH |
| Git history contains a removed native host named `com.fsb.mcp` that acted as an IPC relay/echo and used shell/batch launchers. [VERIFIED: repository history at `bde5c0ea`] | Do not resurrect it: its protocol, lifetime, launcher ownership, and authority do not satisfy Phase 63. | HIGH |
| Root/MCP engines and CI span Node 24 locally, Node >=18.20 package support, and Node 20 CI. [VERIFIED: local environment, `mcp/package.json`, and `.github/workflows/*.yml`] | Avoid features/tooling that require Node 25 and execute focused tests at the supported CI baseline. | HIGH |

## Plan Decomposition Recommendation

[VERIFIED: dependency analysis above] The phase should be planned in four implementation waves, with the Windows/package artifact decision blocking later registration work.

### Wave 0 — Contract and Packaging Proof

- Freeze host name, request/response schemas, reason vocabulary, 4096-byte cap, timeouts, stable roots, origin/id validator, ownership marker, and diagnostic enums. [VERIFIED: planning recommendation grounded in locked exact-shape requirements]
- Define and build the Windows `.exe` bootstrap artifact pipeline, package inclusion, version/checksum validation, and a synthetic argv harness; define the POSIX absolute-shebang refusal rules. [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] [VERIFIED: current CI gap]
- Define stable exact-package materialization and prove a registration never points into the invoking cache/worktree. [VERIFIED: packaging requirement]
- Add failing protocol/install/daemon/source-boundary test skeletons and `scripts/verify-native-host-boundary.mjs`. [VERIFIED: Nyquist requirement and test architecture below]

### Wave 1 — Daemon and Host Core

- Add exact product/version/readiness health fields and the post-bind auth hook; cover bind-loss and readiness transitions. [VERIFIED: repository seam]
- Implement bounded framing, argv-origin validation, core-only host entry, exact health probe, tokened lock, direct spawn, and one-shot response. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [CITED: https://nodejs.org/api/child_process.html]
- Enforce the transitive import boundary and exact spawn tuple. [VERIFIED: NATIVE-03]

### Wave 2 — Install, Uninstall, and Doctor

- Add explicit CLI routing and injectable macOS/Linux/Windows registration/runtime adapters. [VERIFIED: NATIVE-01/NATIVE-04]
- Implement transactional exact-owned install/uninstall with symlink/foreign/mismatch refusal and idempotence. [VERIFIED: locked decisions]
- Extend the diagnostic snapshot, CLI text order, JSON schema, browser-safe redaction, and stable reason tests. [VERIFIED: UI and doctor contracts]

### Wave 3 — Extension and Integrated Gates

- Add only `nativeMessaging`, silent advisory boot probe, offline-only one-flight wake, timeout/backoff, authenticated bridge wait, and exactly one preflight rerun. [VERIFIED: NATIVE-02 and locked orchestration]
- Add the exact checking UI, attempt-scoped announcement, spinner/reduced-motion/forced-color rules, edit invalidation, and exact fallback/unpaired convergence. [VERIFIED: `63-UI-SPEC.md`]
- Run focused matrices, source/security/UI review, guarded full suite, and artifact/key-link checks; record all genuine UAT as pending `human_needed`. [VERIFIED: locked deferral]

## Assumptions Log

[VERIFIED: research found no design assumption that should silently become a locked behavior] The following are explicit planning assumptions that require either a Wave 0 contract or a fail-closed implementation:

| Assumption | Risk | Required resolution |
|---|---|---|
| [ASSUMED] The released npm package can include or retrieve a version-matched Windows launcher artifact. | A missing artifact makes NATIVE-01 incomplete on Windows. | Wave 0 must prove package contents and release generation; otherwise planning is blocked, not downgraded to batch. |
| [ASSUMED] The current Node executable is suitable as the durable interpreter stored in the owned installation. | A version manager may later remove or relocate it. | Installer validates absolute real path at install; doctor reports missing/invalid; repair/auto-update remains deferred. Document this lifecycle honestly. |
| [ASSUMED] Exact current-package materialization may use npm availability during explicit installation. | Offline install could fail even though the invoking package exists in cache. | Prefer a package-owned artifact/runtime strategy if release packaging can make it deterministic; otherwise return a stable unavailable/install failure and never publish registration. Do not claim offline install. |
| [ASSUMED] `7226` remains the canonical local serve port for this milestone. | A user-selected serve port would not be discoverable without new configuration authority. | Pin the existing default for Phase 63 and document that profile/port discovery is deferred unless existing code exposes an authoritative configured value. |

## Open Questions for Planning

1. [VERIFIED: unresolved repository packaging seam] Where will the Windows launcher source and cross-build job live, and how is the artifact bound to the npm package version? This must be answered in Wave 0 before NATIVE-01 can be planned as complete.
2. [VERIFIED: unresolved release/runtime seam] Can the release package provide a self-contained stable runtime payload, or must explicit install run exact npm materialization? The plan must select one durable method and test cache/worktree removal.
3. [VERIFIED: Microsoft documentation and current non-Windows environment do not prove the final adapter details] Which exact Windows registry view is canonical for writes/deletes, while still inspecting both views for shadowing? Lock this behind an adapter contract and keep real Windows confirmation in milestone-end UAT.
4. [VERIFIED: current health response has no product compatibility policy] Should host readiness require exact package version equality or a protocol/major compatibility field? Prefer a dedicated bounded native-host/health protocol version so a patch release does not create false mismatch.
5. [VERIFIED: UI contract permits exact checking state and existing background dispatch has no attempt id yet] Should the checking presentation be a separate background event or a progress callback encoded in the existing command exchange? Use the smallest closed mechanism that guarantees late joiners and restored panels cannot display stale attempts.

## Environment Availability

| Capability | Observed state | Planning effect |
|---|---|---|
| Local OS | macOS arm64. [VERIFIED: local environment inspection] | Local automated filesystem/process tests can cover POSIX behavior only. |
| Node/npm | Node 24.14.1 and npm 11.11.0. [VERIFIED: local command output captured during research] | Also run against CI's Node 20 contract; do not infer Node 18/20 compatibility only from local success. |
| Package baseline | MCP engine Node >=18.20; TypeScript 5.9/ES2022. [VERIFIED: `mcp/package.json` and TypeScript config] | Production code must avoid Node 25-only APIs. |
| CI | Existing GitHub jobs are Ubuntu-based and use Node 20 where configured. [VERIFIED: `.github/workflows/*.yml`] | macOS/Windows behavior needs injected deterministic adapters; Windows artifact generation is an explicit CI/release addition. |
| Compilers | Local Apple clang/Xcode tools are available; no Windows runtime/compiler was observed. [VERIFIED: local environment inspection] | A local mac build cannot constitute Windows evidence. |
| Browser binaries | No Google Chrome/Chromium CLI was available in the inspected shell path. [VERIFIED: local environment inspection] | No browser/native integration is attempted or claimed in Phase 63 automated research. |
| Windows registry | `reg.exe` and real HKCU views are unavailable on macOS. [VERIFIED: platform fact] | Registry tests use injected adapters; genuine Windows install/uninstall stays `human_needed`. |
| User deferral | All real OS/browser/native/accessibility UAT is deferred to milestone end. [VERIFIED: `63-CONTEXT.md`] | Do not pause Phase 63 for live UAT and do not mark deferred evidence passed. |

## Validation Architecture

### Nyquist Status

[VERIFIED: `nyquist_validation` is absent from `.planning/config.json`] Nyquist validation is enabled by default. Every implementation task must have a deterministic automated verification command, and Wave 0 must create missing harnesses before production logic that depends on them.

### Focused Test Matrix

| Test file | Blocking coverage |
|---|---|
| New `tests/mcp-native-host-protocol.test.js` | Native-endian header, partial header/body, UTF-8 byte length, zero/oversize, invalid JSON, arrays/null/prototype/extra keys, wrong version/action/origin/argv, multiple/trailing frames, no-frame EOF, exact single response, stdout purity. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [VERIFIED: locked matrix] |
| New `tests/mcp-native-host-daemon.test.js` | Exact health marker/version/readiness/body cap/timeout, wrong process on port, exact shell-free spawn tuple/env/cwd, already-running/started/failure, one-flight lock, contender polling, stale quarantine, token release, no kill, bind-loser no secret rotation. [VERIFIED: architecture above] |
| New `tests/mcp-native-host-install.test.js` | macOS/Linux paths, Windows HKCU views, exact host/origin/manifest, stable runtime not cache, stage/rollback/publish order, modes, symlink/foreign/mismatch refusal, idempotence, exact-owned uninstall, adjacent preservation, Windows launcher artifact presence. [VERIFIED: NATIVE-01/NATIVE-04] |
| New `tests/native-host-background-wake.test.js` | Silent boot probe/no message/no UI, absent/unknown handling, offline-only wake, one shared attempt, timeout/backoff/late response, malformed/correlation mismatch, bridge wait, one preflight rerun, no replay, ready/unpaired/offline convergence, attempt-scoped checking event. [VERIFIED: NATIVE-02 and UI contract] |
| Extend `tests/mcp-diagnostics-status.test.js` | Closed native snapshot/enums, exact human section placement/copy, JSON projection, expected path local-only, browser-safe redaction, read-only/offline behavior, unchanged global layer/exit semantics. [VERIFIED: doctor contract] |
| Extend `tests/mcp-install-platforms.test.js` | Router parsing, native target excluded from ordinary/`--all` paths, injected OS adapters, stable CLI errors. [VERIFIED: existing harness and locked scope] |
| Extend `tests/mcp-bridge-background-dispatch.test.js` | Native API authority only in background, no start/message replay, existing preflight exact shape preserved. [VERIFIED: existing harness] |
| Extend `tests/delegation-sidepanel-ui.test.js` | Exact checking copy, one info card/spinner/announcer, `aria-busy`, no focus move/actions, composer preservation/edit invalidation, exact fallback/unpaired copy, narrow/forced-color/reduced-motion source pins. [VERIFIED: `63-UI-SPEC.md`] |
| Extend `tests/mcp-bridge-topology.test.js` | Safe post-bind auth preparation and product-specific readiness without CHAN changes. [VERIFIED: lifecycle seam] |
| Extend `tests/mcp-version-parity.test.js` | Host/health protocol and package launcher artifact/version constants remain aligned. [VERIFIED: existing parity harness] |
| Extend `tests/delegation-phase-contract.test.js` | Exact manifest permission delta, no side-panel native calls, host import/spawn boundary, no Phase 59 invariant changes. [VERIFIED: locked source contracts] |

### Source and Artifact Gates

- Add `scripts/verify-native-host-boundary.mjs` that builds the host entry's transitive local import graph and rejects adapter registry, supervisor/spawn authority, task/prompt, browser state, bridge-auth/session-secret, installer, doctor, and CLI-router modules. [VERIFIED: NATIVE-03 and locked source contract]
- Pin exactly one manifest permission addition and byte-stable remaining permission/host-permission arrays. [VERIFIED: NATIVE-02]
- Inspect the packed npm artifact, not only the worktree, for POSIX launcher, Windows `.exe`, native-host entry/build files, and exact version metadata. [VERIFIED: packaging gap]
- Prove generated `mcp/build` output corresponds to source and no historical IPC relay/echo shim is packaged. [VERIFIED: repository history and build contract]
- Run focused tests before `node scripts/run-phase60-full-tests.mjs`; preserve the guarded wrapper's dirty/generated artifact protections. [VERIFIED: repository test policy]

### Test Cadence

| Cadence | Command class | Expected duration/role |
|---|---|---|
| Per task | One focused `node --test tests/<target>.test.js` plus TypeScript/build check for touched MCP sources. [VERIFIED: existing node:test workflow] | Fast regression signal; required before task completion. |
| Per wave | All Phase 63 focused suites plus affected existing harnesses and boundary verifier. [VERIFIED: recommended cadence] | Cross-seam contract verification. |
| Phase automated gate | Build/pack artifact inspection, focused matrix, code/security/UI source review, then `node scripts/run-phase60-full-tests.mjs`. [VERIFIED: locked verification and current guarded suite] | Blocking automated completion evidence. |
| Milestone end only | Real macOS/Linux/Windows Chrome installs, unpacked/published ids, wake/attach/uninstall, and rendered accessibility. [VERIFIED: user deferral] | `human_needed`; never run or claim during autonomous Phase 63. |

### Deferred UAT Ledger Entries

| Evidence | Status |
|---|---|
| macOS user-scope install, published/unpacked Chrome origin, boot probe, daemon offline wake, already-running attach, doctor, uninstall. | `human_needed` [VERIFIED: locked deferral] |
| Linux Google Chrome user-scope install/wake/attach/doctor/uninstall. | `human_needed` [VERIFIED: locked deferral] |
| Windows HKCU registration/view behavior, packaged `.exe` launcher, wake/attach/doctor/uninstall. | `human_needed` [VERIFIED: locked deferral] |
| Rendered checking → ready/unpaired/offline flows in light/dark/narrow/zoom/forced-colors/reduced-motion. | `human_needed` [VERIFIED: UI contract] |
| Keyboard focus retention and screen-reader announcement order in Chrome. | `human_needed` [VERIFIED: UI contract] |

## Security Domain

### Assets and Trust Boundaries

| Asset/boundary | Security property |
|---|---|
| Chrome native registration | Only the exact FSB host name, absolute owned launcher, and one exact extension origin may be accepted. [VERIFIED: locked allowlist] |
| Native stdin/stdout | Untrusted framed input; exact bounded parse before side effects; stdout protocol-only. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] |
| Stable runtime root | User-owned, restrictive, non-symlink, exact marker/package/version/artifact; foreign state is never overwritten. [VERIFIED: locked filesystem boundary] |
| Host → daemon launch | One exact `serve` executable/argv tuple, no shell, no agent/task authority, sanitized environment. [VERIFIED: NATIVE-03] |
| Loopback health | Untrusted local network response until exact product/version/readiness validation succeeds. [VERIFIED: recommended health boundary] |
| Background native API | Sole extension authority; only authoritative offline preflight can wake; no boot wake or UI calls. [VERIFIED: locked background authority] |
| Native result → delegation | Lifecycle fact only; authenticated bridge and preflight remain the security boundary. [VERIFIED: locked success meaning] |
| Doctor projection | Local bounded facts only; browser-safe data excludes paths/registry/raw values/secrets. [VERIFIED: locked diagnostic boundary] |

### Threats and Mitigations

| Threat | Required mitigation | Verification |
|---|---|---|
| Foreign extension invokes host | Exact `allowed_origins` array of length one plus independent argv origin equality. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [VERIFIED: locked allowlist] | Manifest and argv matrix. |
| Manifest/launcher replacement or symlink traversal | `lstat`/`realpath` parent chain, exact owner marker, restrictive files, foreign mismatch refusal, registration published last. [CITED: https://nodejs.org/api/fs.html] [VERIFIED: locked safety] | Synthetic symlink/foreign/TOCTOU-oriented adapter tests. |
| Host gains agent-spawn authority | Core-only transitive import allowlist and exact only-`serve` spawn tuple. [VERIFIED: NATIVE-03] | Boundary verifier and spawn spy. |
| Daemon-start storm | Atomic tokened lock, contender health polling, stale quarantine, bounded cooldown. [VERIFIED: locked coalescing] | Concurrent deterministic clock/filesystem tests. |
| Command injection | Absolute executable and argv, `shell:false`, bounded constant args, no request fields in command/env. [CITED: https://nodejs.org/api/child_process.html] | Exact spawn snapshot and hostile input matrix. |
| Protocol memory/CPU abuse | 4096-byte cap before allocation, one frame, bounded UTF-8/JSON/keys/strings, timeout, exit. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [VERIFIED: recommended tighter cap] | Partial/oversize/multiple/fuzz table. |
| Stdout data leak/corruption | Exactly one framed bounded response; diagnostics only to bounded stderr; no child output inherited. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] | Raw byte capture. |
| Pairing/session-secret leak | Host has no auth imports/data; native schema contains only version/action/correlation/lifecycle reason. [VERIFIED: locked boundary] | Import graph and forbidden-string/schema tests. |
| Active daemon secret invalidated by losing process | Rotate only after successful bind/recovery and before bridge connect. [VERIFIED: current race and recommended hook] | Two-process/bind-loser regression. |
| Stale async wake replays intent | Attempt token, timeout cancellation/late-ignore, current composer/intention check, one preflight rerun, no start/message replay. [VERIFIED: UI/orchestration contract] | Background VM + side-panel state snapshots. |
| Local fake service occupies port | Exact bounded service/version/readiness marker; never spawn over wrong/malformed responder. [VERIFIED: health recommendation] | Fake server matrix. |
| Windows view shadow/foreign key | Inspect relevant HKCU views, classify mismatch, canonical exact write, no HKLM, exact-owned delete only. [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] [CITED: https://learn.microsoft.com/en-us/windows/win32/sysinfo/32-bit-and-64-bit-application-data-in-the-registry] | Injected registry-view matrix and deferred real UAT. |
| Doctor leaks local data | Closed enums/reasons, bounded CLI path only, browser-safe omission, no raw errors/manifest/registry/env/child output. [VERIFIED: locked doctor boundary] | Snapshot/redaction tests with sentinel secrets. |

### ASVS-Oriented Controls

[CITED: https://owasp.org/www-project-application-security-verification-standard/] The applicable control themes are:

- V2 authentication/session: native messaging never reads, rotates, transports, or asserts pairing/session secrets; safe daemon lifecycle ordering prevents unintended session invalidation. [VERIFIED: locked boundary and race mitigation]
- V3 session management: native lifecycle success never becomes paired/ready authority. [VERIFIED: locked success semantics]
- V4 access control: exact extension origin, background-only native API, serve-only host authority, and source import boundary. [VERIFIED: locked authority model]
- V5 validation/encoding: exact plain-object schemas, bounded bytes/strings, closed enums, rejected prototype/unknown keys, safe JSON/framing. [VERIFIED: protocol design]
- V7 error/logging: stable reason codes, stdout purity, bounded stderr, no raw exceptions or sensitive data. [VERIFIED: locked logging boundary]
- V12 file/resource handling: real-path/type/symlink checks, atomic staging, restrictive permissions, exact-owned uninstall. [VERIFIED: locked installer safety]
- V13 API/web service: exact loopback health response, body/time caps, product/version/readiness validation. [VERIFIED: health design]
- V14 configuration: one permission delta, stable host identity, one origin, user-scope paths, no implicit install or system-wide registration. [VERIFIED: NATIVE-01/NATIVE-02 and locked scope]

## Sources

### Primary External Sources

1. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] Chrome for Developers, “Native messaging,” accessed 2026-07-16. Supports manifest fields and paths, one-origin allowlist, native framing and size limits, extension-origin argv, process lifetime, stdout/stderr rules, permission, and common error behavior.
2. [CITED: https://developer.chrome.com/docs/extensions/reference/api/runtime/] Chrome Runtime API reference, accessed 2026-07-16. Supports the documented `connectNative`/`sendNativeMessage` surface and error/port behavior; no installed-host enumeration API is documented.
3. [CITED: https://nodejs.org/api/child_process.html] Node.js Child Process API, accessed 2026-07-16. Supports explicit executable/argv spawning, default `shell:false`, detached processes, ignored stdio, `windowsHide`, and `unref`.
4. [CITED: https://nodejs.org/api/stream.html] Node.js Stream API, accessed 2026-07-16. Supports chunked binary stdin/stdout handling and backpressure-aware writes.
5. [CITED: https://nodejs.org/api/buffer.html] Node.js Buffer API, accessed 2026-07-16. Supports byte-accurate framing and endian-aware 32-bit header operations.
6. [CITED: https://nodejs.org/api/fs.html] Node.js File System API, accessed 2026-07-16. Supports `lstat`, `realpath`, exclusive operations, rename, permissions, and sync primitives.
7. [CITED: https://nodejs.org/docs/latest-v20.x/api/fs.html] Node.js 20 File System API, accessed 2026-07-16. Used to keep filesystem recommendations within the CI baseline.
8. [CITED: https://nodejs.org/api/single-executable-applications.html] Node.js Single Executable Applications, accessed 2026-07-16. Supports SEA stability/status and version history, including built-in `--build-sea` availability.
9. [CITED: https://chromium.googlesource.com/chromium/src/+/57c3662e332095c8e7d98255d86e29d3a86c530c/chrome/browser/extensions/api/messaging/native_process_launcher_win.cc] Chromium Windows native process launcher source, accessed 2026-07-16. Supports direct `.exe` launch, legacy command-interpreter handling for non-executables, and registry lookup behavior.
10. [CITED: https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/common/extension_id.h] Chromium extension id constants, accessed 2026-07-16. Supports the 32-character `a`–`p` extension-id validation rule.
11. [CITED: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-add] Microsoft `reg add` documentation, accessed 2026-07-16. Supports default values, `REG_SZ`, exit status, and alternate registry-view flags.
12. [CITED: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-query] Microsoft `reg query` documentation, accessed 2026-07-16. Supports read-only registry inspection and alternate views.
13. [CITED: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-delete] Microsoft `reg delete` documentation, accessed 2026-07-16. Supports exact value/key deletion semantics; real view behavior remains deferred evidence.
14. [CITED: https://learn.microsoft.com/en-us/windows/win32/sysinfo/32-bit-and-64-bit-application-data-in-the-registry] Microsoft WOW64 registry data documentation, accessed 2026-07-16. Supports treating registry views explicitly.
15. [CITED: https://owasp.org/www-project-application-security-verification-standard/] OWASP ASVS project, accessed 2026-07-16. Supports the security-domain control mapping.

### Repository Sources

- [VERIFIED: `.planning/phases/63-native-messaging-host/63-CONTEXT.md`] Locked boundary, decisions, discretion, verification, and human-UAT deferral.
- [VERIFIED: `.planning/phases/63-native-messaging-host/63-UI-SPEC.md`] Exact checking/fallback/doctor copy, visual state matrix, accessibility, ownership, and deterministic UI gates.
- [VERIFIED: `.planning/REQUIREMENTS.md`] NATIVE-01 through NATIVE-04.
- [VERIFIED: `.planning/ROADMAP.md` and `.planning/STATE.md`] Phase dependency and milestone status.
- [VERIFIED: `mcp/src/index.ts`, `mcp/src/http.ts`, `mcp/src/version.ts`, `mcp/src/bridge-auth.ts`] CLI/doctor/serve routing, health endpoint, ports/version, and secret rotation.
- [VERIFIED: `mcp/src/agent-providers/serve-delegation.ts`] Serve lifecycle and bridge/inventory order.
- [VERIFIED: `mcp/src/install.ts` and `mcp/src/diagnostics.ts`] Existing platform installation and diagnostic snapshot seams.
- [VERIFIED: `extension/manifest.json`, `extension/background.js`, `extension/utils/delegation-preflight.js`, `extension/ws/mcp-bridge-client.js`, `extension/ui/sidepanel.js`, `extension/ui/sidepanel.css`] Manifest, background authority, exact preflight, bridge state, UI pending/fallback, and token/semantic patterns.
- [VERIFIED: `tests/mcp-install-platforms.test.js`, `tests/mcp-diagnostics-status.test.js`, `tests/mcp-bridge-background-dispatch.test.js`, `tests/delegation-sidepanel-ui.test.js`, `tests/mcp-bridge-topology.test.js`, `tests/mcp-version-parity.test.js`, `tests/delegation-phase-contract.test.js`] Closest deterministic harnesses.
- [VERIFIED: `scripts/run-phase60-full-tests.mjs`, `package.json`, `mcp/package.json`, `.github/workflows/*.yml`] Full-suite guard, runtime/package baseline, and CI environment.
- [VERIFIED: git history at `bde5c0ea`] Historical removed native host/shim reviewed only as an anti-pattern; it is not a Phase 63 implementation base.

## Metadata

| Field | Value |
|---|---|
| Research mode | Ecosystem plus repository architecture. [VERIFIED: task scope] |
| Nyquist validation | Enabled because no explicit disable flag exists. [VERIFIED: `.planning/config.json`] |
| Security domain | Required and included. [VERIFIED: phase handles process launch, filesystem/registry mutation, cross-process protocol, and extension authority] |
| New third-party packages | None recommended. [VERIFIED: standard stack analysis] |
| Highest-confidence findings | Chrome framing/manifest contract, repository ownership seams, exact UI/doctor constraints, secret-rotation race. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging] [VERIFIED: repository source] |
| Medium-confidence finding | Final Windows launcher/release packaging shape. [VERIFIED: no current Windows build/runtime evidence] |
| Human evidence | Entirely deferred and recorded as `human_needed`. [VERIFIED: standing user instruction] |
| Planning blocker | Wave 0 must resolve/package the Windows executable and durable runtime materialization before NATIVE-01 can be claimed complete. [VERIFIED: requirement-to-environment gap] |

## Research Resolution

[VERIFIED: requirements-to-architecture trace above] Phase 63 is ready for planning if the plan begins with the packaging/Windows launcher proof and the serve secret-rotation/readiness correction. No live UAT is required during the phase; automated completion must stay honest about the milestone-end `human_needed` ledger.

## RESEARCH COMPLETE
