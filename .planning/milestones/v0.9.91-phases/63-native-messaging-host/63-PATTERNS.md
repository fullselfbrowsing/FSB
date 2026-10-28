# Phase 63: Native-Messaging Host — Pattern Map

**Mapped:** 2026-07-16  
**Inputs:** `63-CONTEXT.md`, `63-RESEARCH.md`, `63-UI-SPEC.md`, and current repository source/tests  
**Evidence boundary:** repository inspection only; all genuine OS/browser/native/accessibility UAT remains pending `human_needed` for the milestone-end sweep

## Planning Verdict

The repository has strong current analogs for every Phase 63 seam except the release-built Windows native-host bootstrap. Exact parsing, bounded UTF-8 decoding, atomic owner-only files, injected process/filesystem dependencies, one-snapshot diagnostics, background one-flight work, source-pinned UI, and deterministic VM/platform tests can all be adapted from current code.

The Windows `.exe` source location, build job, version/checksum binding, npm-package destination, and synthetic argv/handle harness have no safe current analog. Wave 0 must lock and prove that artifact before any plan may claim cross-platform installation complete. A `.bat`, `.cmd`, Node SEA, historical shim, or cache/worktree launcher is not a fallback.

## Data Flow

```text
side-panel Send intent
  -> existing FSB_DELEGATION_PREFLIGHT command in background
  -> existing authoritative preflight result
       ready/unpaired/unsupported -> existing Phase 61 path, no native wake
       offline -> one shared background-owned native wake attempt
                    |
                    | sendNativeMessage(exact request)
                    v
              one-shot native host
                validate Chrome origin/argv
                read exactly one <=4096-byte framed request
                validate exact own-object schema before side effects
                probe exact 127.0.0.1:7226/health identity/readiness
                  ready -> already_running
                  offline -> tokened lock -> exact shell-free `serve` spawn
                  wrong product/malformed/incompatible -> unavailable, no spawn
                bounded readiness poll -> exact one framed response -> exit
                    |
                    v
              existing serve lifecycle
                HTTP bind -> stale recovery -> rotate bridge secret
                -> authenticated bridge connect -> inventory -> serveReady
                    |
                    v
background waits for authenticated bridge readiness
  -> reruns existing preflight exactly once
  -> current unchanged Send intent only:
       ready -> existing consent/trusted-start path
       unpaired -> existing pairing card
       otherwise -> exact existing offline/doctor/setup fallback

service-worker boot -> connectNative presence probe -> no message -> silent close

explicit CLI install/uninstall
  -> injected platform adapter
  -> staged stable owned runtime + exact marker/launcher/manifest
  -> Chrome registration published last / removed first

existing doctor command
  -> one read-only collected snapshot
  -> local text/JSON nativeHost projection
  -> browser-safe projection omits local path/registry detail
```

Native messaging is only a bounded local reachability primitive. It never owns pairing, provider eligibility, task content, browser state, delegation start, or authenticated bridge authority.

## File Classification

### MCP and native-host source

| Target file | Role | Closest current analog | Assignment |
|---|---|---|---|
| `mcp/src/native-host/constants.ts` (new) | leaf-only host name, protocol/version, size/time limits, health identity, exact outcome/reason vocabularies | `mcp/src/version.ts:1-7`, `mcp/src/ext-protocol.ts:3-33` | freeze all cross-file literals here; import no installer, diagnostics, bridge-auth, CLI, or agent-provider module |
| `mcp/src/native-host/protocol.ts` (new) | native-endian framing, fatal UTF-8, exact request/response and origin/argv validation | `mcp/src/ext-protocol.ts:35-101`, `mcp/src/agent-providers/claude-stream.ts:312-341`, `mcp/src/diagnostics.ts:141-153` | strengthen the analog to one exact own `Object.prototype` record, exact key equality, one frame/trailing-byte refusal, and the 4096-byte cap before allocation/JSON |
| `mcp/src/native-host/platform.ts` (new) | injected leaf contracts for host clock, filesystem, health, spawn, argv/platform facts | `mcp/src/agent-providers/runtime-files.ts:205-242`, `mcp/src/agent-providers/spawn-supervisor.ts:211-224` | keep this data/dependency-only; if installer shares anything, it may share only leaf constants/types—not registry or mutation authority |
| `mcp/src/native-host/daemon.ts` (new) | exact health probe, tokened lock, direct serve spawn, bounded readiness, closed outcome | `mcp/src/http.ts:88-101`, `mcp/src/agent-providers/runtime-files.ts:706-803`, structural spawn shape at `mcp/src/agent-providers/spawn-supervisor.ts:966-975` | adapt patterns locally; never import `agent-providers/*`; spawn only absolute Node + absolute stable `build/index.js` + exact serve argv |
| `mcp/src/native-host/entry.ts` (new) | one-shot stdin/stdout orchestration and clean no-frame EOF | no exact current host; bounded stream pieces in `claude-stream.ts:312-355` | parse/validate origin, argv, and entire single frame before probing; stdout is protocol-only; write at most one response; boot-probe EOF performs no daemon work |
| `mcp/src/native-host-install.ts` (new; a directory split is equivalent) | exact platform paths, stable runtime staging, marker/registration ownership, install/uninstall transaction | filesystem safety in `runtime-files.ts:490-529,741-803`; result vocabulary style in `config-writer.ts:10-15` | use injected fs/registry/process adapters, restrictive modes, publish registration last, remove it first, and refuse foreign/mismatched/symlink state |
| `mcp/src/install.ts` | explicit `--native-host` install/uninstall routing and help | `runInstall` / `runUninstall` at `mcp/src/install.ts:660-868` | branch before platform-registry/`--all` expansion; validate only `--extension-id`; do not add native host to `PLATFORMS` or ordinary install counts |
| `mcp/src/http.ts` | exact product health identity and mutable lifecycle readiness | current `/health` at `mcp/src/http.ts:88-101`; listener bind at `:163-190` | add closed `service`, compatible `version`, and `serveReady`; false until lifecycle explicitly marks ready; preserve the existing port and Phase 59 HTTP/channel behavior |
| `mcp/src/agent-providers/serve-delegation.ts` | post-bind auth hook and final readiness transition | injected lifecycle at `serve-delegation.ts:50-77,225-274` | add injected `prepareBridgeAuth` and HTTP readiness setter; required order is bind, recover, auth, bridge, inventory, ready; bind loser calls none of the latter |
| `mcp/src/index.ts` | CLI routing/help, doctor formatter, and composition of safe auth hook | command router `index.ts:439-477`, doctor `:216-263,399-413`, current unsafe order `:314-318` | move rotation into the lifecycle hook, add explicit native install/uninstall output, and insert the doctor section after Bridge auth and before Install paths; host entry must never import this router |
| `mcp/src/diagnostics.ts` | one additive closed `nativeHost` snapshot collected through read-only adapters | dependency and projection discipline at `diagnostics.ts:122-175,669-773` | collect once, bound every field, use stable enums/reasons, project no raw errors/manifest/registry/secrets, preserve overall diagnostic layer and exit semantics |
| `mcp/src/version.ts` (canonical source pin; modify only if required) | canonical product/version/port values consumed by health/native constants | current leaf constants at `version.ts:1-7` | do not duplicate `0.10.0`, `127.0.0.1`, or `7226`; if native protocol constants live separately, parity tests must bind them to this leaf |

### Extension source

| Target file | Role | Closest current analog | Assignment |
|---|---|---|---|
| `extension/manifest.json` | one additive permission | ordered permission roster at `manifest.json:8-25` | add exactly `nativeMessaging`; preserve order/content of every other permission, host permission, background declaration, and content-script entry |
| `extension/utils/native-host-wake.js` (optional new helper) | background-owned presence/wake controller if extraction improves testability | classic-script module shape in `extension/utils/delegation-preflight.js:1-116`; one-flight body in `background.js:244-276` | expose a closed controller only to background; no UI, task, provider, pairing-secret, install, or doctor authority; omit this file if a small local background block is clearer |
| `extension/background.js` | sole native API owner, silent boot probe, offline-only one-flight wake, bridge wait, one preflight rerun | exact preflight `background.js:1559-1617`; one-flight `:244-276`; attempt/epoch fencing `:2077-2130`; bridge facts in `mcp-bridge-client.js:106-124,881-913` | keep the original preflight promise pending; correlate and time-bound native response; ignore late settlement; never replay Send/START/gesture; return only an existing exact preflight result |
| `extension/ui/sidepanel.js` | attempt-scoped checking presentation and edit-invalidated continuation | pending gate/send flow `sidepanel.js:3552-3651`; existing fallback `:1394-1477`; one-shot announcer `:2056-2063` | render only for the panel's current pending intent; keep composer editable and byte-preserved; compare current text with captured text; no native API or local success inference |
| `extension/ui/sidepanel.css` | info-tone spinner and forced-colors/reduced-motion behavior | card/tone/type tokens at `sidepanel.css:1714-1851`; responsive/reduced motion `:2097-2148`; `--fsb-info` at `shared/fsb-ui-core.css:17` | use existing tokens and card geometry; add one inline decorative spinner, suppress its motion under reduced motion, and add visible non-color border/icon behavior for forced colors |

### Packaging, artifact, and guard source

| Target file/artifact | Role | Closest current analog | Assignment |
|---|---|---|---|
| `scripts/verify-native-host-boundary.mjs` (new) | transitive local import-graph and forbidden-authority gate | fail-closed deterministic scan in `scripts/verify-agent-provider-flags.mjs:25-162` | resolve the actual `entry.ts` import graph; reject agent providers/supervisor, tasks/prompts, browser state, bridge auth/secrets, installer, diagnostics, CLI router, shell helpers, and historical shim names |
| `mcp/package.json` | packed native entry/launcher artifacts and build/prepublish guard | current `files`, build, and prepublish fields at `mcp/package.json:26-52` | include only version-bound production artifacts; run boundary verification in build/prepublish; keep Node `>=18.20.0`; prove `npm pack --dry-run` contents |
| root `package.json` | focused Phase 63 tests in the serial root chain | existing single serial `test` script | add each new/extended test once without dropping/reordering unrelated gates; final guarded suite remains separate from focused task checks |
| Windows bootstrap source (new; path must be named in Wave 0) | minimal `.exe` that launches the installed Node host while inheriting native stdio | **no safe analog** | lock language/toolchain/source path, exact sibling config, argv forwarding, handle inheritance, exit propagation, version/checksum metadata, and synthetic tests before feature work |
| Windows artifact build/release workflow (new or explicit extension of `.github/workflows/*`) | build and bind `.exe` to npm release/version | Ubuntu Node jobs at `.github/workflows/ci.yml:14-53`; Ubuntu-only publish at `npm-publish.yml:13-35` | add a genuine Windows/cross-build artifact job and package verification; current Ubuntu jobs are evidence of the gap, not Windows proof |
| POSIX installed launcher (runtime artifact; template/source path must be locked in Wave 0 if repository-backed) | executable JS launcher with installer-written absolute Node shebang | no current launcher artifact | mode `0700`, core-only target, stable owned root, no shell wrapper; reject unsafe/unrepresentable interpreter paths |

### Test files

| Target test | Closest current harness | Assignment |
|---|---|---|
| `tests/mcp-native-host-protocol.test.js` (new) | exact parser assertions in `mcp-version-parity.test.js`; fatal/chunked parser behavior in `claude-stream.ts`; compiled-module import style in MCP tests | table-test native endian, fragmented header/body, fatal UTF-8, JSON/root/prototype/extra-key failures, origin/argv, zero/oversize/trailing/multiple frames, EOF no-op, exact one response, stdout purity, and zero side effects on every invalid input |
| `tests/mcp-native-host-daemon.test.js` (new) | lifecycle fakes in `mcp-bridge-topology.test.js:266-437`; injected spawn capture in `mcp-spawn-supervisor.test.js:423-437,1190-1220` | fake clock/fs/health/spawn; assert exact identity/body cap/timeouts, direct tuple/env/cwd, lock coalescing/stale quarantine/token release, no kill, and closed outcomes |
| `tests/mcp-native-host-install.test.js` (new) | owner-only atomic traces and symlink cases in `mcp-agent-orphan-recovery.test.js:384-540`; temp homes in `mcp-install-platforms.test.js:25-59` | adapter-table all three OS contracts, both Windows views, stable-root staging/rollback/publish order, modes, exact id/manifest/marker, idempotence, mismatch refusal, exact-owned uninstall, adjacent preservation, and packaged Windows artifact presence |
| `tests/native-host-background-wake.test.js` (new) | VM source extraction and deferred gates in `mcp-bridge-background-dispatch.test.js:408-680,1445-1555` | fake native port/runtime timers/bridge observers; assert silent boot, no boot message/UI, offline-only wake, shared attempt, cooldown, timeout/late-ignore, correlation/shape validation, one bridge wait/rerun, and no replay |
| `tests/mcp-install-platforms.test.js` | its existing subprocess/temp-home matrix at `:25-153` | prove explicit CLI syntax and stable errors; ordinary install/uninstall and `--all` never touch native artifacts or registration |
| `tests/mcp-diagnostics-status.test.js` | snapshot factory/order/sentinel checks at `:32-140,258-405` | add exact native snapshot enums, one collector call, text/JSON fact parity, section order, local-only expected location, browser-safe omission, read-only/offline operation, and unchanged global diagnostic layer/exit |
| `tests/mcp-bridge-background-dispatch.test.js` | actual-background VM composition and authority readiness gates | source-pin native API authority to background/helper only, existing preflight shape unchanged, and no delegate.start/message replay across reconnect |
| `tests/delegation-sidepanel-ui.test.js` | `TestNode`, function extraction, copy/source/a11y gates at `:8-89,196-213,389-568` | exercise checking card DOM: exact copy, one info card/spinner/announcer, busy true, no role alert/actions/focus, composer preservation/edit invalidation, exact fallback/unpaired convergence, forced colors, and reduced motion |
| `tests/mcp-bridge-topology.test.js` | lifecycle dependency/order harness at `:266-437` | add auth and readiness counters; assert bind→recover→auth→connect→inventory→ready; bind loser and every failure remain not-ready and cannot rotate/connect/advertise |
| `tests/mcp-version-parity.test.js` | source/hash/package/manifest pins at `:65-140,293-357` | replace the old “native absent” assertion with exact one-permission delta; bind host/health/protocol/version constants; inspect packed POSIX/Windows/entry artifacts and exclude historical relay/echo shim |
| `tests/delegation-phase-contract.test.js` | source-contract helpers and honest UAT ledger checks at `:82-149,621-640,731-737,1306-1349` | keep sidepanel/preflight/bridge client native-free, permit only background/helper, pin host import/spawn boundary and unchanged Phase 59 gates, and keep all real UAT unchecked/pending with empty evidence |

## Expected Unchanged and Generated Files

- `extension/ui/sidepanel.html` should remain unchanged: it already has the one `#delegationRun` region with `aria-busy` and the one polite `#delegationAnnouncer` at `sidepanel.html:58-76`. Add no second card or live region.
- `extension/utils/delegation-preflight.js` should remain shape-stable. Its `check` function at `:69-106` remains the sole pure ready/offline/unpaired/provider classifier; do not add native lifecycle fields.
- `extension/ws/mcp-bridge-client.js` should remain native-free. Background consumes its current authenticated/pairing/delegation facts; the native host never modifies bridge-client authority.
- `mcp/src/bridge-auth.ts`, Phase 59 transport/auth sources, and adapter registry/supervisor source should remain behaviorally unchanged except for composition through the injected post-bind hook.
- `mcp/build/**` is generated by TypeScript/build. Never hand-edit it. Tests may import it only after the source build; artifact gates must prove it matches source and contains no historical IPC relay.
- `mcp/server.json` and package/version metadata remain canonical parity inputs; change them only for an independently intended package-version update, never to paper over native artifact drift.

## Concrete Existing Patterns

### 1. Exact own-data objects before authority

`mcp/src/ext-protocol.ts:35-43,71-100` already rejects non-record roots, unknown control-plane keys, and wrong closed message types:

```ts
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseExtFrame(raw: unknown): ExtMessage | null {
  if (!isPlainRecord(raw) || hasControlPlaneKey(raw)) return null;
  // closed type/key validation follows
}
```

For the native boundary, use the stricter doctor helper at `mcp/src/diagnostics.ts:141-153`: prototype must be exactly `Object.prototype`, every property must be an own enumerable data descriptor, and symbol/accessor/prototype-bearing inputs fail. Require exact key equality—not only “all keys are allowed”—for request `{v, action, correlationId}` and response `{v, correlationId, outcome, reason}`.

All framing, UTF-8, JSON, root shape, scalar bounds, origin, and argv checks settle before health or spawn. Correlation id is 16–64 safe ASCII characters; extension id is exactly `/^[a-p]{32}$/`; origin is exactly the configured `chrome-extension://<id>/`; the only optional Windows argv is bounded `--parent-window=<digits>`. Response outcome is exactly one of `already_running | started | unavailable | failed`; `reason` comes from one frozen content-free vocabulary and never carries exception text.

### 2. Fatal decoding and bounded accumulation

`mcp/src/agent-providers/claude-stream.ts:312-341` supplies the safe decoding shape:

```ts
text = new TextDecoder('utf-8', { fatal: true }).decode(line);
// ...
if (combinedLength > CLAUDE_STREAM_LINE_LIMIT_BYTES) throw ...;
return Buffer.concat([pending, addition], pending.length + addition.length);
```

Do not import this agent-provider module. Reimplement the small leaf pattern in `protocol.ts` with the 4-byte native-endian header and 4096-byte application cap. Reject a declared oversize before allocating its body; after one complete frame, use the bounded settle window to reject already-buffered or fragmented trailing/multiple-frame input before any side effect.

### 3. Injected, owner-only atomic filesystem work

`mcp/src/agent-providers/runtime-files.ts:205-242` defines a complete injected fs adapter. Its read path at `:490-529` fails closed on symlink, wrong type/mode, oversize, corruption, or I/O. Its write path at `:766-803` uses the required exclusive temporary-file sequence:

```ts
descriptor = this.fs.openSync(
  tempPath,
  O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW,
  FILE_MODE,
);
this.fs.writeFileSync(descriptor, value, 'utf8');
this.fs.fsyncSync(descriptor);
this.fs.closeSync(descriptor);
this.assertWritableFileTarget(path, allowExisting);
this.fs.renameSync(tempPath, path);
```

Adapt this discipline into the native installer and lock without importing `agent-providers/runtime-files.ts`. The Phase 63 transaction adds an exact closed ownership marker, tokened staging root, package/artifact verification, directory/launcher mode `0700`, marker/manifest mode `0600`, stable-root rename, and Chrome registration publish last. Uninstall reverses exposure: registration first, then only exact proved-owned artifacts.

Freeze the platform paths rather than deriving them from browser-profile discovery:

- macOS registration: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json`;
- Linux registration: `~/.config/google-chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json`;
- Windows registration: exact HKCU `Software\Google\Chrome\NativeMessagingHosts\io.github.fullselfbrowsing.fsb_native_host` default `REG_SZ` manifest path, while inspecting both relevant registry views for shadow/mismatch;
- owned runtime: `~/.fsb/native-host/` on POSIX and `%LOCALAPPDATA%\FSB\NativeMessagingHost\` on Windows;
- sole default caller: `chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/`, replaced only by an explicit validated development id.

`mcp/src/config-writer.ts:162-223,235-307` is only a result/idempotence analog. Its direct `writeFile`, broad entry removal, and raw exception messages are not safe enough for native registration ownership.

### 4. Explicit CLI branch before broad target expansion

Current `mcp/src/install.ts:667-677` expands `--all` into the entire MCP-client `PLATFORMS` registry, and `:703-708` falls back to ordinary usage when nothing matches. Phase 63 must route native host before both:

```text
runInstall(flags)
  if native-host -> validate its closed flags -> native installer -> return
  otherwise -> current list/all/platform behavior unchanged

runUninstall(flags)
  if native-host -> validate its closed flags -> native uninstaller -> return
  otherwise -> current all/platform behavior unchanged
```

Do not reuse interpolated `execSync` at `install.ts:624-643,787-807`. Runtime materialization and registry helpers use explicit executable/argv adapters with `shell:false`; the Windows registry adapter returns typed facts rather than parsing localized `reg.exe` text.

### 5. Readiness is a lifecycle fact, not a listening port

Current `mcp/src/http.ts:88-101` reports generic `ok` plus topology, while `mcp/src/agent-providers/serve-delegation.ts:256-270` binds before recovery/connect/inventory. That is the correct seam but not yet the correct readiness contract.

Current `mcp/src/index.ts:314-318` rotates too early:

```ts
rotateBridgeSessionSecret();
const lifecycle = await startServeDelegation({ host, port });
```

The adapted order is exact:

```text
HTTP bind (serveReady=false)
  -> supervisor recovery
  -> prepareBridgeAuth / rotate once
  -> authenticated bridge connect
  -> initial inventory push
  -> markServeReady(true)
```

The lifecycle dependency seam at `serve-delegation.ts:50-71` is the analog for injecting `prepareBridgeAuth` and readiness. The bind loser never reaches either. Cleanup leaves readiness false. Health success requires HTTP 200, bounded body, exact `service: 'fsb-mcp-server'`, compatible canonical version, `ok: true`, and `serveReady: true`; a different process answering on port 7226 is `unavailable` and must never be spawned over.

### 6. Shell-free spawn shape without agent-spawn authority

`mcp/src/agent-providers/spawn-supervisor.ts:211-224,966-975` proves the repository's injected executable/argv/options shape:

```ts
export type AgentSpawnDependency = (
  command: string,
  argv: readonly string[],
  options: SpawnInvocationOptions,
) => ChildProcessWithoutNullStreams;

const options = Object.freeze({ shell: false, detached: true, windowsHide: true, ... });
const child = this.spawnChild(spec.command, spec.argv, options);
```

Copy only the dependency shape. The native host must not import or instantiate this supervisor. Its tuple is fixed to the installed absolute Node executable and:

```text
[absoluteStableBuildIndex, 'serve', '--host', '127.0.0.1', '--port', '7226']
```

Use stable runtime root as `cwd`, sanitized inherited environment with `NODE_OPTIONS`/`NODE_PATH` removed, `shell:false`, `detached:true`, `stdio:'ignore'`, and `windowsHide:true`. Await `spawn`/`error`, then `unref` only after successful spawn. Never accept command/argv/cwd/env from the native frame, never launch an adapter/agent CLI, and never kill a daemon after readiness timeout.

### 7. Tokened serialization and stale recovery

The in-process serialization tail at `runtime-files.ts:706-709` is the conceptual same-process analog. Phase 63 needs a cross-process atomic directory lock under the owned runtime root:

1. Probe exact health first.
2. Atomically create `wake.lock`; write exact bounded token/time metadata.
3. Winner spawns once and polls readiness; contender never spawns and polls the same readiness.
4. Stale TTL exceeds the maximum readiness window. Before quarantine, re-probe health.
5. Rename only the exact stale lock to a tokened quarantine name, then remove that quarantine.
6. Release only when metadata token matches the owner token.
7. Never trust a PID or signal/kill from lock contents.

All file, clock, health, and wait operations are injected so concurrency and stale paths are deterministic on one CI platform.

### 8. One read-only diagnostic snapshot, two projections

`mcp/src/diagnostics.ts:669-773` selects sanitized injected dependencies, captures one time, collects facts, probes, disconnects in `finally`, classifies, and returns one snapshot. `mcp/src/index.ts:399-413` then formats JSON or text from that same object and preserves historical exit semantics.

Add `nativeHost` to this one snapshot. Do not create a second doctor command or a formatter-side probe. Use the strict own-data helper and bounded lowercase enums. The human block is exactly after Bridge auth and before Install paths:

```text
Native messaging host:
  Install state: {Installed|Not installed|Invalid|Unavailable}
  Expected location: {bounded local path or HKCU location}
  Manifest/registry: {Valid|Missing|Invalid|Unavailable}
  Chrome allowlist: {Matches|Mismatch|Not reported}
  Launcher: {Reachable|Missing|Invalid|Unavailable}
  Daemon: {Reachable|Offline|Unavailable}
  Reason: {stable_reason_code}
```

Native absence is an optional-component fact, not a new global failure layer. Local CLI JSON may contain bounded `expectedLocation`; browser-safe projection must omit it and registry detail. The native collector may read/probe only: never install, repair, wake, rotate, pair, start, or uninstall. Do not reuse the raw-error note behavior at `diagnostics.ts:757-769` for native facts.

### 9. Background owns one-flight work and authoritative rerun

`extension/background.js:244-276` is the closest one-flight pattern:

```js
if (fsbMcpCompatibilityRefreshPromise) return fsbMcpCompatibilityRefreshPromise;
let tracked;
tracked = run().finally(() => {
  if (fsbMcpCompatibilityRefreshPromise === tracked) {
    fsbMcpCompatibilityRefreshPromise = null;
  }
});
fsbMcpCompatibilityRefreshPromise = tracked;
return tracked;
```

The Phase 63 controller additionally needs an attempt token/correlation id, timeout race, session-only cooldown, and late-settlement fence. Each joining panel intent must still receive its own attempt-scoped checking fact once; shared work does not mean shared UI identity.

`fsbDelegationPreflightResult` at `background.js:1573-1582` remains authoritative. Only an exact existing `agent_offline` result may enter wake. After native `already_running`/`started`, wait for existing authenticated bridge/pairing/delegation facts and rerun this same function exactly once. Return that existing exact result. Do not add native fields to the preflight response and do not call `delegate.start` from wake code.

Boot detection is separate: `connectNative` with listeners installed immediately, no `postMessage`, bounded disconnect, and advisory `present|absent|unknown` cache only. Host EOF is a clean no-op. Boot probe has no UI and cannot suppress a later authoritative `sendNativeMessage` attempt.

### 10. Attempt-scoped UI reuses the existing card and pending gate

The HTML already supplies one run region and one polite announcer at `extension/ui/sidepanel.html:58-76`. The side panel's existing send gate at `sidepanel.js:3552-3571` suppresses duplicate Send while `pendingPreflight` is true, and `:3581-3616` keeps the preflight promise pending before choosing exact fallback.

Add one checking renderer that reuses `_ensureDelegationMount` (`:906-940`) and text-only `_delegationElement` (`:947-954`):

- heading `Checking local agent service`;
- body `FSB is trying to make the local agent service available. Your message has not been sent.`;
- announcer `Checking local agent service. Your message has not been sent.`;
- header `Checking agent service`;
- info tone and one `fa-spinner` with `aria-hidden="true"`;
- run `aria-busy="true"`, empty feed, no card role, no alert, no action row, no focus call.

Preserve `chatInput.textContent` byte-for-byte. The current code captures a trimmed `message` at `sidepanel.js:3563-3565`; Phase 63 must also capture/compare the visible raw text or an exact edit token before any continuation. If the composer changes while pending, clear pending on settlement and require a fresh explicit Send. Native success cannot create a user bubble, challenge, delegation id, feed/session/tab state, or success toast.

On failure, converge to the existing `_renderDelegationPreflightFailure` at `:1394-1477`, including its exact offline copy/actions/alert/focus. On unpaired, use the existing pairing branch. Do not weaken those terminal behaviors to match the transient no-focus state.

### 11. Token-only CSS and accessibility source pins

The existing card already uses shared surface/border/shadow tokens (`sidepanel.css:1728-1745`), info left border (`:1771-1775`), 16/600/1.25 heading (`:1801-1808`), and 14/400/1.5 body (`:1842-1851`). Extend this block rather than creating a native-host visual system.

Add spinner animation only for ordinary motion. Extend `@media (prefers-reduced-motion: reduce)` at `:2126-2148` to remove its animation/transform/transition. Add a `forced-colors: active` rule with a visible border and semantic icon/text; do not depend on tinted background or color alone. Preserve narrow wrapping at `max-width: 350px`. Do not spend primary orange or success green on a reachability attempt.

### 12. Harness composition and source-pin discipline

The current deterministic harnesses are designed for these seams:

- `mcp-bridge-topology.test.js:266-414` injects every lifecycle dependency and records exact call order/counters.
- `mcp-agent-orphan-recovery.test.js:409-540` traces exclusive/fsync/rename operations and proves outside symlink targets remain unchanged.
- `mcp-bridge-background-dispatch.test.js:408-445` extracts actual background source into a VM; `:1445-1555` uses deferred gates to prove readiness order.
- `delegation-sidepanel-ui.test.js:8-89` has focus-counting DOM nodes; `:389-568` pins one announcer, copy, tokens, reduced motion, and exact source authority.
- `mcp-diagnostics-status.test.js:258-405` proves formatter order, text/JSON fact parity, exact keys, and sentinel non-disclosure.
- `mcp-version-parity.test.js:65-140` already reads/hashes package/source/manifest data and can inspect packed artifacts.

Use real modules/source where practical, with injected fakes and temp cleanup in `finally`. Never convert current “native absent” pins into broad allowances: replace them with exact background-only authority and the exact one-permission delta.

### 13. Packaging is part of the security boundary

`mcp/package.json:26-52` publishes `build/` and runs TypeScript during prepublish, while current CI/publish jobs are Ubuntu/Node 20 only (`.github/workflows/ci.yml:14-53`, `npm-publish.yml:13-35`). Therefore:

- the installer may not register a path under `npx` cache or the current worktree;
- an explicit install stages a stable exact package/runtime, validates name/version/entry/launchers, then publishes registration;
- the pack test inspects the tarball listing, not merely files in the checkout;
- the package must contain the POSIX launcher material, Windows `.exe`, native host entry/build output, and bound version metadata;
- build/prepublish must run the transitive boundary gate;
- Node 25-only APIs and SEA tooling are outside the Node 18.20/Node 20 baseline.

The guarded final suite remains `node scripts/run-phase60-full-tests.mjs`; its workspace fingerprint/snapshot discipline at `scripts/run-phase60-full-tests.mjs:21-125` is why generated or unrelated dirty artifacts must not be casually normalized during Phase 63.

### 14. Historical native host is an explicit anti-analog

Git history at `bde5c0ea` contains a removed host named `com.fsb.mcp`. It is useful only as a regression blacklist:

- `bde5c0ea:mcp-server/native-host-manifest/com.fsb.mcp.json:1-9` used the stale name, placeholder path, and caller placeholder.
- `bde5c0ea:mcp-server/scripts/install-host.js:57-99` wrote launchers in the package build directory and used an incorrect Windows manifest-file directory model.
- `:110-145` deleted files/registry broadly by name, without an ownership marker.
- `:161-197` generated `.sh`/`.bat` wrappers, direct-wrote the manifest, and interpolated `execSync` registry commands.
- `c41eb204:mcp-server/src/native-host-shim.ts:92-124` was a persistent bidirectional IPC relay/standalone echo and forwarded broad MCP/browser commands.
- `c41eb204:background.js:12174-12425` auto-connected a native bridge at boot and routed start/stop/action/DOM/tabs/config authority through it.

None of its host name, protocol, lifetime, authority, launcher, registration, uninstall, logging, or packaging structure may be copied. Artifact/source tests should explicitly reject `com.fsb.mcp`, `native-host-shim`, `mcp-to-ext`, `ext-to-mcp`, IPC relay, echo mode, and `.bat`/`.cmd` host launchers.

## Implementation Assignments by Wave

### Wave 0 — freeze contracts and prove packaging

1. `native-host/constants.ts`, protocol test skeleton, and version-parity assertions freeze host name `io.github.fullselfbrowsing.fsb_native_host`, protocol v1, 4096-byte cap, schemas/vocabularies, default Web Store id, id/origin validator, health identity, stable roots, marker schema, timeouts, and modes.
2. Name and implement the Windows bootstrap source/build/test/package paths. Add the Windows artifact workflow and prove version/checksum, argv forwarding, stdio handle inheritance, child exit propagation, and package inclusion.
3. Lock the POSIX launcher materialization/template and absolute-shebang refusal rules; prove no shell wrapper and stable runtime destination.
4. Add `verify-native-host-boundary.mjs`, wire it into MCP build/prepublish, and add failing package/import/source tests before production host logic.
5. Do not proceed to a “cross-platform complete” installer plan if the `.exe` proof is missing. Record a real blocker; do not substitute a batch file.

### Wave 1 — serve readiness and one-shot host core

1. One lifecycle-owning task modifies `http.ts`, `serve-delegation.ts`, and the serve composition in `index.ts`; its paired harness is `mcp-bridge-topology.test.js`.
2. Independent protocol work creates `protocol.ts` and its test after Wave 0 constants are frozen.
3. `daemon.ts` and `platform.ts` implement injected exact health/lock/spawn/readiness behavior with `mcp-native-host-daemon.test.js`.
4. `entry.ts` composes protocol then daemon, owns stdin/stdout purity and EOF no-op, and is immediately checked by the boundary verifier.
5. The host core task must not touch installer, doctor, extension UI, agent providers, bridge auth internals, or Phase 59 channel gates.

### Wave 2 — owned install/uninstall and doctor

1. `native-host-install.ts` and `mcp-native-host-install.test.js` own all stable runtime, marker, path, registry-view, staging, rollback, permissions, and exact deletion behavior.
2. A sequential CLI integration task modifies `install.ts` and `index.ts` only after the installer interface is stable; it extends `mcp-install-platforms.test.js` and help/source pins.
3. A diagnostic task modifies `diagnostics.ts` and the doctor formatter in `index.ts`, extending `mcp-diagnostics-status.test.js`; it receives only read-only inspector dependencies.
4. `mcp/package.json`, pack/version tests, and release artifact checks are updated in the same packaging-owning sequence as installer artifact consumption.

### Wave 3 — background orchestration and checking UI

1. Add only the manifest permission and background/helper controller first; prove silent boot, one-flight wake, exact response, bridge wait, one rerun, and no replay in the dedicated VM test.
2. Extend background-dispatch and version/phase-contract tests in the same change that moves native authority into background; preserve preflight response shape and bridge-client native-free pins.
3. After the background checking-event contract is stable, modify `sidepanel.js`/`.css` and extend the existing DOM/source test. `sidepanel.html` remains unchanged unless a deterministic test proves an existing node is insufficient; current inspection says it is sufficient.
4. Finish with packed artifact checks, focused Phase 63 matrix, guarded full suite, and source/security/UI reviews. Record genuine platform/browser/accessibility checks only as pending milestone-end `human_needed` items.

## Shared Patterns

### Closed vocabulary and bounded data

- Freeze exact keys and enum/reason sets before implementation.
- Accept only own enumerable data properties with the ordinary object prototype.
- Bound bytes before allocation, then bound decoded strings and arrays/keys independently.
- Collapse exceptions and external errors into stable content-free reasons; never serialize raw errors, environment, registry values, child output, usernames, task text, secrets, session ids, or manifest contents.

### Authority isolation

- Host: framing, product health, lock, exact serve spawn only.
- Installer: owned runtime and Chrome registration mutation only.
- Doctor: read-only inspection only.
- Background: native API, retry, bridge observation, authoritative preflight rerun.
- Side panel: presentation of a current background-owned attempt only.
- Existing bridge/preflight/controller/supervisor remain the authorities for pairing, provider readiness, delegation, browser ownership, and agent processes.

### Validate before side effects

- Native bytes/root/origin/argv before health or lock.
- Exact health identity before deciding already-running, spawn, or unavailable.
- Exact marker/registration/runtime/real paths before install overwrite or uninstall delete.
- Exact response/correlation and authenticated bridge readiness before one preflight rerun.
- Exact current composer text/intent before continuing to consent/start.

### One-flight, attempt-scoped settlement

- Insert shared pending state before the external native call.
- Give every caller an attempt identity even when work is shared.
- Clear only if the settling token still owns the slot.
- Ignore late native/timer/observer settlement after token invalidation.
- Apply bounded session-only cooldown; never persist optimistic presence/started state.
- Wake success never replays a task, command, message, or gesture.

### Transactional ownership

- Lstat/realpath/type/mode checks fail closed.
- Stage in unique owned paths with exclusive creation, fsync, and rename.
- Registration is the last install publication and first uninstall removal.
- Matching host name alone is never ownership proof.
- Stale lock recovery quarantines one exact tokened lock; it never follows a path or kills a PID.

### One snapshot, honest projections

- Collect native facts once with injected read-only dependencies.
- Human and JSON output derive from the same snapshot.
- Browser-safe projections omit local location/registry data.
- Optional host absence does not rewrite the overall diagnostic failure layer.

### Source and artifact pins

- Keep host entry's transitive local graph core-only.
- Keep sidepanel, preflight, and bridge client free of native/process/shell authority.
- Keep all Phase 59 Origin/Host/secret/flag/pairing rules and the existing loopback ports unchanged.
- Pin exact manifest delta, health/version constants, packed artifacts, and historical shim absence.
- Never hand-edit `mcp/build/**` or treat a worktree-only file as package evidence.

### Verification and deferred UAT

- Focused automated tests use fakes, synthetic streams, temp roots, VM Chrome APIs, and packed-artifact inspection.
- Synthetic OS adapters prove contracts, not genuine OS/Chrome integration.
- Do not run or claim real installed-host, browser wake/attach, Windows registry, rendered focus/screen-reader, forced-colors, or reduced-motion UAT during Phase 63.
- The milestone ledger remains `status: human_needed`, results pending, evidence empty, and headings unchecked until the user-directed sweep.

## Same-Wave Conflict Map

| Shared file | Single-owner/order rule |
|---|---|
| `mcp/src/index.ts` | serve lifecycle change first; CLI/doctor integration tasks follow sequentially—never parallel-edit this router |
| `mcp/src/http.ts` + `mcp/src/agent-providers/serve-delegation.ts` | one lifecycle/readiness task owns both and the topology harness |
| `mcp/src/native-host/constants.ts` | Wave 0 contract owner; later tasks consume, not redefine, its literals/vocabularies |
| `mcp/src/native-host/platform.ts` | host-core owner; installer shares only explicitly leaf-safe contracts or defines a separate installer adapter |
| `mcp/src/install.ts` + `mcp/src/native-host-install.ts` | installer core stabilizes first; CLI routing follows sequentially |
| `mcp/src/diagnostics.ts` | one doctor task only; never let installer/host core add side effects here |
| `extension/background.js` | one background integration task after native controller contract exists |
| `extension/ui/sidepanel.js` + `.css` | one UI task after background checking-event contract; HTML stays source-pinned |
| `extension/manifest.json` | background/manifest authority task owns exact permission delta; version/phase tests update with it |
| `mcp/package.json` + Windows workflow/artifact paths | Wave 0 packaging owner; install task consumes only the proved layout |
| root `package.json` | final integration owner adds every new test once |
| version/parity/phase-contract tests | update in the same task as the contract they pin; do not relax unrelated historical assertions |

## No Analog Found

- No current release-built Windows native-host `.exe`, Windows build job, handle/argv harness, or package-binding convention exists. Wave 0 must define it from the researched Chromium contract.
- No current native-messaging one-frame decoder exists. Compose the exact-object, fatal-decoder, bounded-stream, and native-endian research contracts; do not revive the historical shim.
- No current cross-process tokened wake lock exists. Adapt atomic owner-only filesystem principles, but define an exact new lock state machine and test it independently.
- No current safe Windows registry-view adapter exists. Define typed 32/64-view facts and mutation outcomes; do not parse localized shell output or assume the historical file-directory behavior.
- No current background sequence combines silent presence probe, one shared wake, authenticated bridge wait, and exactly one preflight rerun. Compose the existing one-flight/preflight/attempt-fence patterns without creating a fourth terminal preflight state.
- No current packaging path proves an `npx` invocation can durably materialize the exact released runtime offline. Plans must state the chosen package-owned strategy and its online/offline failure behavior honestly.

Each no-analog interface must be frozen in Wave 0 or in its owning plan with exact inputs, outputs, states, time/byte caps, error vocabulary, and deterministic verification command.

## Anti-Patterns

- Do not resurrect `com.fsb.mcp`, `native-host-shim`, IPC relay/echo, broad native MCP commands, or boot-time native command routing from history.
- Do not use `.bat`, `.cmd`, a shell script invoking `node`, interpolated `execSync`, `shell:true`, Node SEA, or a launcher under npm cache/worktree.
- Do not accept more than `{v, action, correlationId}`, more than one frame, null-prototype/accessor/symbol objects, unknown argv, or payload-selected executable/argv/env/cwd.
- Do not log to stdout; it is reserved exclusively for the one framed native response.
- Do not probe/spawn on no-frame EOF, malformed/trailing/oversized input, wrong origin, wrong product health, incompatible version, or foreign lock/registration state.
- Do not treat port-open, `{ok:true}`, child spawn, `already_running`, or `started` as authenticated bridge/pairing/provider/delegation success.
- Do not rotate the bridge secret before binding; a bind loser must have zero auth/bridge/inventory/readiness side effects.
- Do not import agent providers, supervisor, task/prompt types, browser state, bridge auth, installer, diagnostics, or CLI router from the host graph.
- Do not kill a daemon on timeout or based on a lock PID; readiness failure is factual and bounded.
- Do not include native host in ordinary install/uninstall/`--all`, install implicitly, scan Chrome profiles, write HKLM, overwrite foreign registration, recursively chmod Chrome directories, or delete adjacent hosts.
- Do not put ownership metadata into Chrome's exact manifest; keep a separate closed marker.
- Do not let doctor install, repair, wake, rotate, pair, or expose raw local/private data; do not create a second doctor command.
- Do not let sidepanel, preflight utility, or bridge client call native APIs, inspect paths/platforms/reason codes, or infer native success.
- Do not clear/normalize the composer, create a message/feed/session/tab/challenge, move focus, or announce during boot/checking before authoritative continuation.
- Do not add Retry/Install/Repair/Wake/Restart UI, a success toast, a second card/live region, a countdown, or primary/success coloring.
- Do not replay `delegate.start`, the captured/edited message, or a user gesture after reconnect; edited text requires a fresh Send.
- Do not mark real macOS/Linux/Windows/Chrome/native/accessibility UAT passed from source, mocks, synthetic adapters, or packed-artifact tests.

## PATTERN MAPPING COMPLETE

Every proposed Phase 63 production, packaging, UI, and test file now has a concrete current analog or an explicit no-analog contract. Planning should begin with the Windows/package proof and serve readiness/secret-order correction, then proceed through host core, owned install/doctor, and background/UI integration while preserving the milestone-end `human_needed` evidence boundary.
