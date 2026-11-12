---
phase: 63-native-messaging-host
review_kind: security
reviewer: gsd-security-auditor
prompt_version: phase63-security-v1
status: pass
implementation_base: 27bddf00517738c87fcc6ca4b27940e8121f2124
implementation_end: 6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887
compatibility_commit: 6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887
implementation_bytes: 887858
implementation_files: 56
implementation_manifest_sha256: 5135dbf243f0f123f60217584cd2ae8ab6865c78c85fcdae20464a539b27dcc7
implementation_sha256: 24072007a6af1754e496804471c3b21e9afd01f20bcdec9bcfaa9c694e5e46d6
implementation_index_sha256: ab66af77cbb8989a3d76425afa36cc10a75db80530f70800c3f443f047077c23
implementation_worktree_index_sha256: 3120d40b00f57e0a29cbd774baaaaac798147ab131b37114b8781a63d801ae47
output_path: .planning/phases/63-native-messaging-host/63-SECURITY.md
live_uat: pending
findings_critical: 0
findings_high: 2
findings_medium: 0
findings_low: 0
findings_info: 0
unresolved_critical: 0
unresolved_high: 0
---

## Review Identity

This independent ASVS L1 source-only audit is bound to base `27bddf00517738c87fcc6ca4b27940e8121f2124`, implementation end and compatibility commit `6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887`, the ordered 56-file manifest with SHA-256 `5135dbf243f0f123f60217584cd2ae8ab6865c78c85fcdae20464a539b27dcc7`, and the canonical 887858-byte binary patch with SHA-256 `24072007a6af1754e496804471c3b21e9afd01f20bcdec9bcfaa9c694e5e46d6`. The implementation index fingerprint is `ab66af77cbb8989a3d76425afa36cc10a75db80530f70800c3f443f047077c23`; the implementation worktree/index fingerprint is `3120d40b00f57e0a29cbd774baaaaac798147ab131b37114b8781a63d801ae47`.

Patch bytes: `887858`.

The frozen 56-file implementation manifest includes `tests/delegation-phase-contract.test.js`.

The audit re-verifies the two previously reported HIGH findings against remediation RED `a91f3e29ad26d726d25487abce8799e237b2735a`, GREEN `409e638d`, remediation summaries `79db94f1`, and compatibility-only test fix `6d868ee1`. Source and precomputed evidence justify `status: pass`; no CRITICAL or HIGH finding remains unresolved.

## Allowed Inputs

- `phase63-implementation.patch@sha256:24072007a6af1754e496804471c3b21e9afd01f20bcdec9bcfaa9c694e5e46d6`
- `phase63-implementation-manifest@sha256:5135dbf243f0f123f60217584cd2ae8ab6865c78c85fcdae20464a539b27dcc7`
- `.planning/phases/63-native-messaging-host/63-01-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-02-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-03-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-04-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-05-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-06-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-07-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-08-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-09-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-10-SUMMARY.md`
- `.planning/phases/63-native-messaging-host/63-CONTEXT.md`
- `.planning/phases/63-native-messaging-host/63-RESEARCH.md`
- `.planning/phases/63-native-messaging-host/63-PATTERNS.md`
- `.planning/phases/63-native-messaging-host/63-VALIDATION.md`
- `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md`
- `.planning/phases/59-reverse-request-channel-security-foundation/59-CONTEXT.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-CONTEXT.md`
- `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md`

## Implementation Manifest

- `.github/workflows/ci.yml`
- `.github/workflows/npm-publish.yml`
- `extension/background.js`
- `extension/manifest.json`
- `extension/ui/sidepanel.css`
- `extension/ui/sidepanel.js`
- `extension/utils/native-host-wake.js`
- `mcp/native-host/posix/fsb-native-host-launcher.mjs.in`
- `mcp/native-host/runtime-integrity.json`
- `mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in`
- `mcp/native-host/windows/fsb-native-host-bootstrap.c`
- `mcp/native-host/windows/fsb-native-host-registry-version.rc.in`
- `mcp/native-host/windows/fsb-native-host-registry.c`
- `mcp/package-lock.json`
- `mcp/package.json`
- `mcp/src/agent-providers/serve-delegation.ts`
- `mcp/src/diagnostics.ts`
- `mcp/src/http.ts`
- `mcp/src/index.ts`
- `mcp/src/install.ts`
- `mcp/src/native-host-install/index.ts`
- `mcp/src/native-host-install/platform.ts`
- `mcp/src/native-host-install/runtime.ts`
- `mcp/src/native-host-install/types.ts`
- `mcp/src/native-host-production.ts`
- `mcp/src/native-host-registration.ts`
- `mcp/src/native-host-registry-helper.ts`
- `mcp/src/native-host/constants.ts`
- `mcp/src/native-host/daemon.ts`
- `mcp/src/native-host/entry.ts`
- `mcp/src/native-host/index.ts`
- `mcp/src/native-host/platform.ts`
- `mcp/src/native-host/protocol.ts`
- `mcp/src/native-host/runtime-layout.ts`
- `package.json`
- `scripts/build-native-host-windows.mjs`
- `scripts/run-mcp-build-preserving-workspace.mjs`
- `scripts/run-phase63-focused-tests.mjs`
- `scripts/verify-native-host-boundary.mjs`
- `tests/delegation-phase-contract.test.js`
- `tests/delegation-sidepanel-ui.test.js`
- `tests/lattice-provider-bridge-smoke.test.js`
- `tests/mcp-bridge-background-dispatch.test.js`
- `tests/mcp-bridge-topology.test.js`
- `tests/mcp-client-inventory.test.js`
- `tests/mcp-diagnostics-status.test.js`
- `tests/mcp-install-platforms.test.js`
- `tests/mcp-native-host-daemon.test.js`
- `tests/mcp-native-host-install.test.js`
- `tests/mcp-native-host-packaging.test.js`
- `tests/mcp-native-host-protocol.test.js`
- `tests/mcp-native-host-registry-helper.test.js`
- `tests/mcp-reverse-channel-contract.test.js`
- `tests/mcp-version-parity.test.js`
- `tests/native-host-background-wake.test.js`
- `tests/sidepanel-tab-aware-smoke.test.js`

## Review Infrastructure

- `scripts/verify-phase63-review-artifacts.mjs`
- `.planning/phases/63-native-messaging-host/63-REVIEW.md`
- `.planning/phases/63-native-messaging-host/63-SECURITY.md`
- `.planning/phases/63-native-messaging-host/63-UI-REVIEW.md`

## Output Scope

- `.planning/phases/63-native-messaging-host/63-SECURITY.md`

## Native Authority Trace

The traced authority chain covers packaged launcher, bundled/offline runtime, daemon readiness, bridge auth, agent authority, installer ownership, browser projection, production composer, and one-flight lease.

| Stage | Source-only disposition | Evidence |
|---|---|---|
| Chrome framing | Chrome grants the one native permission only to the service-worker path. The background helper sends the closed wake schema; the host parser enforces one bounded frame, exact own-data fields, origin/argv checks, fatal UTF-8, correlation, and one response before any wake handler can act. | `extension/manifest.json:21`; `extension/utils/native-host-wake.js:245`; `extension/background.js:1648`; `mcp/src/native-host/protocol.ts:208`; `mcp/src/native-host/entry.ts:175`; `mcp/src/native-host/index.ts:1`; `tests/mcp-native-host-protocol.test.js:268`; `tests/native-host-background-wake.test.js:591` |
| Packaged launcher | POSIX launches through an absolute-node shebang into the owned runtime entry. Windows bootstrap reads a bounded sibling config, refuses reparse paths, validates origin/parent-window argv, and calls only the configured absolute Node/entry tuple. Version resources distinguish bootstrap and registry-helper roles. | `mcp/native-host/posix/fsb-native-host-launcher.mjs.in:1`; `mcp/native-host/windows/fsb-native-host-bootstrap.c:313`; `mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in:22`; `mcp/native-host/windows/fsb-native-host-registry-version.rc.in:22`; `scripts/build-native-host-windows.mjs:169`; `tests/mcp-native-host-packaging.test.js:1476` |
| Bundled/offline runtime | The package pins and bundles the direct dependency set, records lock/package integrity, verifies exact schema-2 Windows artifact metadata, materializes with an offline sentinel, copies the selected bootstrap/helper, writes a receipt, and atomically publishes the owned runtime. CI and release publish the same four version-bound PE artifacts. | `mcp/native-host/runtime-integrity.json:40`; `mcp/package.json:63`; `mcp/package-lock.json:19`; `mcp/src/native-host-install/runtime.ts:286`; `mcp/src/native-host/runtime-layout.ts:355`; `package.json:17`; `.github/workflows/ci.yml:77`; `.github/workflows/npm-publish.yml:93` |
| Production composer | Production derives package/root executables internally, admits only absolute `shell:false` process calls, wires the registry helper rather than a text parser, routes the native CLI before ordinary client expansion, and preserves generated build/index state through the guarded lifecycle. | `mcp/src/native-host-production.ts:250`; `mcp/src/native-host-production.ts:734`; `mcp/src/index.ts:403`; `mcp/src/install.ts:937`; `scripts/run-mcp-build-preserving-workspace.mjs:474`; `scripts/run-phase63-focused-tests.mjs:27`; `scripts/verify-native-host-boundary.mjs:289` |
| One-flight lease | A loopback-only exclusive port lease precedes lock publication and stale takeover. Lock identity includes directory identity, bounded roster, exact owner metadata, and tokened claim/release; contenders do not spawn. | `mcp/src/native-host/constants.ts:25`; `mcp/src/native-host/platform.ts:358`; `mcp/src/native-host/daemon.ts:402`; `tests/mcp-native-host-daemon.test.js:1116` |
| Daemon readiness | Health is bounded and requires the exact product, version shape, native protocol, and readiness boolean. The serve lifecycle binds first, recovers the supervisor, prepares auth, connects the bridge, publishes inventory, and only then marks ready. | `mcp/src/native-host/daemon.ts:239`; `mcp/src/http.ts:96`; `mcp/src/agent-providers/serve-delegation.ts:260`; `tests/mcp-bridge-topology.test.js:440` |
| Bridge auth | Session-secret rotation is injected only through the post-bind lifecycle hook; failed bind/recovery cannot prepare auth. Existing CHAN framing, exact error unions, and secret-free projections remain the authority boundary. | `mcp/src/index.ts:403`; `mcp/src/agent-providers/serve-delegation.ts:270`; `tests/mcp-reverse-channel-contract.test.js:141`; `tests/mcp-bridge-topology.test.js:659` |
| Agent authority | Only the serve-owned supervisor receives exact authenticated extension requests. Native lifecycle success has no agent/provider/task/start schema and merely permits background bridge readiness plus a new authoritative preflight. Existing provider bridge, inventory, and ownership paths remain separate. | `mcp/src/agent-providers/serve-delegation.ts:238`; `tests/mcp-bridge-background-dispatch.test.js:2068`; `tests/lattice-provider-bridge-smoke.test.js:662`; `tests/mcp-client-inventory.test.js:231`; `tests/sidepanel-tab-aware-smoke.test.js:235` |
| Installer ownership | The typed adapter fixes the Windows canonical/shadow views, requires explicit shadow absence before each mutation, validates exact manifest/marker ownership, republishes registration last, and rechecks exact runtime/registration before deletion. The helper hard-codes the key and numeric API. | `mcp/src/native-host-install/types.ts:57`; `mcp/src/native-host-install/platform.ts:140`; `mcp/src/native-host-registration.ts:116`; `mcp/src/native-host-install/index.ts:426`; `mcp/src/native-host-registry-helper.ts:289`; `mcp/native-host/windows/fsb-native-host-registry.c:429`; `tests/mcp-native-host-install.test.js:1005`; `tests/mcp-native-host-registry-helper.test.js:118`; `tests/mcp-install-platforms.test.js:169` |
| Diagnostics | One read-only inspection normalizes closed enums and stable reasons. The browser projector reconstructs exactly five safe keys and omits expected paths, registry values, helper output, auth material, and raw exceptions. | `mcp/src/diagnostics.ts:446`; `mcp/src/native-host-production.ts:959`; `mcp/src/index.ts:332`; `tests/mcp-diagnostics-status.test.js:399`; `tests/mcp-client-inventory.test.js:236` |
| Browser projection | Background wakes only after exact offline preflight, waits for authenticated bridge readiness, then reruns preflight. Side-panel intent, raw-text, and revision fences keep lifecycle hints presentation-only; the style is an existing informational row. | `extension/background.js:1667`; `extension/ui/sidepanel.js:636`; `extension/ui/sidepanel.css:1777`; `tests/delegation-sidepanel-ui.test.js:834`; `tests/mcp-version-parity.test.js:622`; `tests/delegation-phase-contract.test.js:1581` |

## Threat Dispositions

| Threat | Severity | Disposition | Status | Exploit path | Mitigation | Evidence | Residual risk |
|---|---|---|---|---|---|---|---|
| T63-01 | HIGH | mitigate | closed | Malformed, oversized, prototype-bearing, truncated, or multi-frame native input attempts work before rejection. | Cap before allocation, fatal UTF-8, exact own-data schema, one-frame settlement, exact origin/argv, response correlation, and one-shot entry precede wake work. | `mcp/src/native-host/protocol.ts:72`; `mcp/src/native-host/protocol.ts:256`; `mcp/src/native-host/entry.ts:180`; `tests/mcp-native-host-protocol.test.js:268` | Genuine Chrome framing remains pending human evidence. |
| T63-02 | CRITICAL | mitigate | closed | A native request attempts to gain task, agent, shell, arbitrary executable, or process-control authority. | The leaf host imports only entry/platform, daemon spawn is one internally derived absolute Node plus fixed `serve` tuple with `shell:false`, and source/compiled boundary rules reject authority imports. | `mcp/src/native-host/index.ts:1`; `mcp/src/native-host/daemon.ts:549`; `scripts/verify-native-host-boundary.mjs:289`; `tests/delegation-phase-contract.test.js:1608` | Genuine child launch remains pending human evidence. |
| T63-03 | HIGH | mitigate | closed | A wrong or partially initialized loopback responder occupies the serve port and is mistaken for FSB. | Bounded health requires HTTP 200, ordinary JSON, exact product, bounded version, protocol equality, and `serveReady`; identity/protocol mismatches never spawn over the responder. | `mcp/src/native-host/daemon.ts:239`; `mcp/src/native-host/daemon.ts:268`; `mcp/src/http.ts:96`; `tests/mcp-native-host-daemon.test.js:1279` | Genuine port contention remains pending human evidence. |
| T63-04 | HIGH | mitigate | closed | A losing concurrent serve process rotates the active bridge secret before proving bind ownership. | HTTP bind and supervisor recovery precede the injected auth preparation; startup failure closes resources without reaching readiness. | `mcp/src/agent-providers/serve-delegation.ts:259`; `mcp/src/agent-providers/serve-delegation.ts:270`; `mcp/src/index.ts:403`; `tests/mcp-bridge-topology.test.js:440` | Genuine scheduler interleavings remain pending human evidence. |
| T63-05 | HIGH | mitigate | closed | Concurrent or stale wakes create process storms, replace a fresh owner, or kill unrelated work. | Exclusive loopback lease, tokened atomic lock publication, identity-bound quarantine, health recheck, bounded polling, exact release, and no PID/signal surface allow at most one spawn. | `mcp/src/native-host/platform.ts:320`; `mcp/src/native-host/daemon.ts:402`; `mcp/src/native-host/daemon.ts:605`; `tests/mcp-native-host-daemon.test.js:900` | Genuine scheduling and crash timing remain pending human evidence. |
| T63-06 | HIGH | mitigate | closed | Cache/worktree movement, online fallback, dependency drift, or receipt tampering replaces the registered runtime. | Stable owned layout, exact pins and lock receipt, complete bundle closure, offline-only install, artifact hashes, publication-last rename, and guarded build/index restoration fail closed. | `mcp/src/native-host/runtime-layout.ts:371`; `mcp/src/native-host-install/runtime.ts:156`; `mcp/native-host/runtime-integrity.json:3`; `scripts/run-mcp-build-preserving-workspace.mjs:474`; `tests/mcp-native-host-install.test.js:1090` | Installed interpreter relocation remains operator evidence. |
| T63-07 | CRITICAL | avoid | closed | Windows falls back to a command interpreter, batch relay, or generic single-file launcher. | Version-bound x64/arm64 PE bootstraps and helpers are the only Windows artifacts; the bootstrap invokes a validated absolute Node/entry tuple, and packaging/boundary gates reject historical relays. | `mcp/native-host/windows/fsb-native-host-bootstrap.c:304`; `scripts/build-native-host-windows.mjs:20`; `.github/workflows/npm-publish.yml:49`; `tests/mcp-version-parity.test.js:622` | Genuine Windows and Chrome execution remains pending human evidence. |
| T63-08 | HIGH | mitigate | closed | Install/uninstall overwrites foreign state, trusts ambiguous localized registry output, mutates user/64, or deletes adjacent values. | Exact manifest/marker/receipt ownership, fixed structured Win32 helper, user/64 query-only proof, user/32-only mutations, shadow rechecks, exact-key inspection, and registration/runtime transaction ordering preserve foreign state. | `mcp/src/native-host-install/platform.ts:140`; `mcp/src/native-host-install/index.ts:536`; `mcp/src/native-host-registry-helper.ts:281`; `mcp/native-host/windows/fsb-native-host-registry.c:436`; `tests/mcp-native-host-install.test.js:1535`; `tests/mcp-native-host-registry-helper.test.js:162` | Genuine registry/filesystem semantics remain pending human evidence. |
| T63-09 | HIGH | mitigate | closed | Doctor or browser projection leaks local paths, registry data, secrets, helper output, or raw exceptions. | Closed local normalization, bounded location/reason fields, content-free process failures, stable CLI-only location, and a five-enum browser reconstruction omit private values. | `mcp/src/diagnostics.ts:319`; `mcp/src/diagnostics.ts:446`; `mcp/src/native-host-registry-helper.ts:333`; `tests/mcp-diagnostics-status.test.js:399` | CLI expected location remains intentionally local-only. |
| T63-10 | HIGH | mitigate | closed | Service-worker boot or non-offline provider paths wake the daemon. | Boot performs only a no-message advisory native connection; the sole actual wake call is background-only and follows exact authoritative `agent_offline` preflight. | `extension/background.js:99`; `extension/background.js:1667`; `extension/utils/native-host-wake.js:125`; `tests/native-host-background-wake.test.js:627` | Genuine service-worker boot remains pending human evidence. |
| T63-11 | HIGH | mitigate | closed | Timeout, late response, concurrent callers, or edit-then-revert replays a stale delegation intent. | One helper promise/token, correlation validation, timeout/cooldown, late-result fencing, one bridge attempt, one preflight rerun, exact intent/raw bytes, and monotonic edit revision prevent replay. | `extension/utils/native-host-wake.js:200`; `extension/background.js:1701`; `extension/ui/sidepanel.js:636`; `tests/delegation-sidepanel-ui.test.js:847` | Genuine eviction and UI timing remain pending human evidence. |
| T63-12 | CRITICAL | mitigate | closed | `started` or `already_running` is treated as pairing, provider, task, consent, or delegation-start authority. | Native output is a closed lifecycle fact only; background requires authenticated bridge readiness and reruns the established preflight, while start remains behind existing consent/agent authority. | `mcp/src/native-host/protocol.ts:308`; `extension/background.js:1695`; `extension/background.js:1728`; `tests/mcp-bridge-background-dispatch.test.js:2068` | Genuine ready/unpaired convergence remains pending human evidence. |

## ASVS L1 Themes

| Theme | Disposition | Evidence |
|---|---|---|
| V2 Authentication | Bridge session-secret rotation happens only after bind/recovery ownership, and the native path does not carry or infer authentication. | `mcp/src/agent-providers/serve-delegation.ts:260`; `mcp/src/index.ts:403`; `tests/mcp-reverse-channel-contract.test.js:141` |
| V3 Session Management | Attempt/correlation IDs are bounded and single-flight; late responses, edit revisions, and bridge attempts cannot revive superseded intent. | `extension/utils/native-host-wake.js:200`; `extension/background.js:1701`; `extension/ui/sidepanel.js:656`; `tests/delegation-sidepanel-ui.test.js:853` |
| V4 Access Control | Native authority is lifecycle-only; agent spawning stays behind authenticated serve-owned supervisor routing, and registry mutations are fixed-key/user-scope operations. | `mcp/src/agent-providers/serve-delegation.ts:238`; `mcp/src/native-host-registry-helper.ts:281`; `mcp/native-host/windows/fsb-native-host-registry.c:429`; `scripts/verify-native-host-boundary.mjs:289` |
| V5 Validation, Sanitization, Encoding | Native frames, invocation argv, helper responses, registry values, manifests, receipts, and diagnostics use caps, fatal decoding, ordinary own-data records, exact fields, and closed enums. | `mcp/src/native-host/protocol.ts:72`; `mcp/src/native-host-registry-helper.ts:211`; `mcp/src/native-host-registration.ts:53`; `mcp/src/diagnostics.ts:278` |
| V7 Error Handling and Logging | Native/registry/process failures collapse to stable content-free identifiers or closed facts; browser projections omit paths, secrets, and raw reasons. | `mcp/src/native-host/entry.ts:139`; `mcp/src/native-host-registry-helper.ts:333`; `mcp/src/diagnostics.ts:446`; `tests/mcp-client-inventory.test.js:216` |
| V12 Files and Resources | No-follow/realpath/type checks, exact hashes and receipts, tokened staging/quarantine, registration-last publication, and ownership rechecks guard file and registry resources. | `mcp/src/native-host-production.ts:339`; `mcp/src/native-host-install/runtime.ts:631`; `mcp/src/native-host-install/index.ts:426`; `tests/mcp-native-host-install.test.js:1424` |
| V13 API and Web Service | Native and helper protocols use bounded exact schemas and correlation; daemon health is loopback, bounded, product/protocol-specific, and readiness-aware. | `mcp/src/native-host/protocol.ts:104`; `mcp/src/native-host-registry-helper.ts:211`; `mcp/src/native-host/daemon.ts:239`; `mcp/src/http.ts:96` |
| V14 Configuration | Exact package pins/bundle lists, schema-2 four-artifact metadata, version/role resources, hardened MSVC flags, and release hash metadata constrain configuration and deployment. | `mcp/package.json:55`; `mcp/package-lock.json:11`; `scripts/build-native-host-windows.mjs:169`; `.github/workflows/npm-publish.yml:119` |

## Security Remediation Verification

| Finding | Verification | Disposition |
|---|---|---|
| F63-SECURITY-01 | The remediation provides **no reg.exe authority**. A **locale-independent structured protocol** replaces text parsing: the TypeScript adapter accepts only one exact bounded JSON response, while the C helper exposes a **fixed key/operation/view C API**. Successful malformed, localized, truncated, trailing, or oversize output becomes `unavailable`, never `absent`; **user/64 read-only** is enforced by both the adapter and the C dispatch. | resolved — `mcp/src/native-host-registry-helper.ts:211`; `mcp/src/native-host-registry-helper.ts:281`; `mcp/native-host/windows/fsb-native-host-registry.c:9`; `mcp/native-host/windows/fsb-native-host-registry.c:429`; `tests/mcp-native-host-registry-helper.test.js:118`; `tests/mcp-native-host-registry-helper.test.js:249` |
| F63-SECURITY-02 | The remediation provides **no SystemRoot authority** and **no PATH executable authority**. Every launch revalidates **path/hash/role/PE-machine/version/reparse provenance**, consumes **schema-2 four-artifact metadata**, uses an absolute executable with `shell:false` and an empty isolated environment, and applies **input/output caps** with content-free failure. Package materialization performs **runtime copy/receipt/inspection** for the helper. The distinct helper preserves **no bootstrap authority expansion**. The **MSVC build/harness workflow source** uses `/MT`, CFG, ASLR/NX/high-entropy flags and read-only/malformed-write harness coverage. | resolved — `mcp/src/native-host-registry-helper.ts:83`; `mcp/src/native-host-registry-helper.ts:134`; `mcp/src/native-host-registry-helper.ts:296`; `mcp/src/native-host-production.ts:250`; `mcp/src/native-host-install/runtime.ts:798`; `mcp/src/native-host-install/types.ts:230`; `mcp/native-host/windows/fsb-native-host-registry.c:252`; `scripts/build-native-host-windows.mjs:169`; `.github/workflows/ci.yml:83`; `tests/mcp-native-host-registry-helper.test.js:308` |

The prior locale-dependent and inherited-root exploit paths are absent from production composition. Request fields cannot select an executable, key, view, operation family, shell, or environment. The bootstrap still reads only its owned sibling config and forwards the fixed Node/entry/origin/parent-window tuple; registry-helper functionality is a separate role-marked PE (`mcp/native-host/windows/fsb-native-host-bootstrap.c:151`; `mcp/native-host/windows/fsb-native-host-registry-version.rc.in:22`).

## Explicit Attack Checks

| Check | Disposition | Evidence |
|---|---|---|
| SEC-CHECK-FRAMING | closed — length, UTF-8, exact schema, one-frame settlement, trailing data, and response correlation fail before wake work. | `mcp/src/native-host/protocol.ts:208`; `mcp/src/native-host/protocol.ts:256`; `tests/mcp-native-host-protocol.test.js:268` |
| SEC-CHECK-HEALTH | closed — bounded exact product/protocol/readiness facts distinguish ready, wrong-product, protocol-mismatch, and offline states. | `mcp/src/native-host/daemon.ts:239`; `mcp/src/http.ts:96`; `tests/mcp-native-host-daemon.test.js:1279` |
| SEC-CHECK-BUNDLE | closed — exact pins, bundle roster, integrity receipt, offline install, and complete production closure are required. | `mcp/package.json:55`; `mcp/native-host/runtime-integrity.json:32`; `mcp/src/native-host-install/runtime.ts:156`; `tests/mcp-native-host-install.test.js:1090` |
| SEC-CHECK-NOFOLLOW | closed — regular-file, symlink, realpath, and no-follow checks protect package, helper, stage, and installed resources. | `mcp/src/native-host-registry-helper.ts:83`; `mcp/src/native-host-production.ts:339`; `mcp/src/native-host-install/types.ts:184`; `tests/mcp-native-host-install.test.js:1342` |
| SEC-CHECK-PROCESS-BOUNDS | closed — process calls require absolute executables and `shell:false`, combine bounded stdout/stderr accounting, and time out. | `mcp/src/native-host-production.ts:250`; `mcp/src/native-host-production.ts:274`; `mcp/src/native-host-install/types.ts:134` |
| SEC-CHECK-RECEIPT-TRUST | closed — exact package/lock production closure, tarball integrity, artifact hashes, schema-2 receipt fields, and rechecks precede mutation/removal. | `mcp/src/native-host-install/runtime.ts:156`; `mcp/src/native-host-install/index.ts:161`; `tests/mcp-native-host-install.test.js:1075` |
| SEC-CHECK-REG-EXE | closed — production composes the packaged Win32 helper and the boundary gate rejects locale-dependent executable registry authority. | `mcp/src/native-host-production.ts:734`; `mcp/src/native-host-registry-helper.ts:289`; `scripts/verify-native-host-boundary.mjs:295` |
| SEC-CHECK-PATH-REGISTRY | closed — no registry value, request, or environment field selects the helper executable or registry key. | `mcp/src/native-host-registry-helper.ts:105`; `mcp/src/native-host-registry-helper.ts:281`; `tests/mcp-native-host-registry-helper.test.js:238` |
| SEC-CHECK-SYMLINK-REPARSE | closed — helper and runtime paths refuse symlink/realpath divergence, while both Windows PEs reject reparse-controlled owned files. | `mcp/src/native-host-registry-helper.ts:83`; `mcp/native-host/windows/fsb-native-host-bootstrap.c:165`; `tests/mcp-native-host-registry-helper.test.js:327` |
| SEC-CHECK-FOREIGN-PRESERVATION | closed — split, foreign, shadowed, nonempty, or changed ownership states refuse mutation; quarantine cleanup requires exact roster/token proof. | `mcp/src/native-host-install/index.ts:375`; `mcp/src/native-host/daemon.ts:482`; `tests/mcp-native-host-install.test.js:1506`; `tests/mcp-native-host-daemon.test.js:968` |
| SEC-CHECK-STALE-LOCK | closed — stale recovery rechecks health, atomically claims the exact observed identity, and never uses PID signalling. | `mcp/src/native-host/daemon.ts:427`; `mcp/src/native-host/daemon.ts:443`; `tests/mcp-native-host-daemon.test.js:1000` |
| SEC-CHECK-PUBLICATION-QUARANTINE | closed — staged lock/runtime publication never replaces an existing destination; unproved quarantines remain isolated. | `mcp/src/native-host/daemon.ts:370`; `mcp/src/native-host-install/runtime.ts:894`; `tests/mcp-native-host-daemon.test.js:1145` |
| SEC-CHECK-INSPECTOR | closed — production inspection is read-only, normalizes unavailable/invalid states, and cannot repair, install, wake, or terminate. | `mcp/src/native-host-production.ts:959`; `mcp/src/diagnostics.ts:436`; `tests/mcp-diagnostics-status.test.js:238` |
| SEC-CHECK-REDACTION | closed — browser status has exactly five reconstructed enums; stable content-free failures omit path, registry, helper, secret, and exception material. | `mcp/src/diagnostics.ts:446`; `mcp/src/native-host-registry-helper.ts:333`; `tests/mcp-diagnostics-status.test.js:403`; `tests/mcp-client-inventory.test.js:236` |
| SEC-CHECK-WAKE-FLOOD | closed — one helper promise, cooldown, one native message, one bridge attempt, and the OS lease bound concurrent spawn pressure. | `extension/utils/native-host-wake.js:200`; `extension/background.js:1701`; `mcp/src/native-host/platform.ts:358`; `tests/native-host-background-wake.test.js:694` |
| SEC-CHECK-CORRELATION | closed — unpredictable bounded IDs and exact response correlation reject mismatched, late, or malformed native replies. | `extension/utils/native-host-wake.js:50`; `extension/utils/native-host-wake.js:99`; `mcp/src/native-host/protocol.ts:335` |
| SEC-CHECK-DIRECT-AGENT | closed — native code carries no agent/provider/task/start schema and only authenticated supervisor routing can reach agent process authority. | `mcp/src/native-host/protocol.ts:104`; `mcp/src/agent-providers/serve-delegation.ts:238`; `tests/delegation-phase-contract.test.js:1620` |
| SEC-CHECK-CHAN | closed — the Phase 59 exact frame/error/auth route remains unchanged and secret rotation stays post-bind. | `tests/mcp-reverse-channel-contract.test.js:23`; `tests/mcp-reverse-channel-contract.test.js:141`; `tests/mcp-bridge-topology.test.js:1028` |
| SEC-CHECK-WORKSPACE-INDEX | closed — guarded build snapshots and restores the raw index/build graph and rejects unrelated dirty-byte changes. | `scripts/run-mcp-build-preserving-workspace.mjs:474`; `scripts/run-mcp-build-preserving-workspace.mjs:485`; `tests/mcp-native-host-packaging.test.js:115` |
| SEC-CHECK-EXECUTABLE-PROVENANCE | closed — helper selection is fixed by architecture/role and every spawn rechecks real path, regular file, bytes, hash, role marker, PE machine, and version. | `mcp/src/native-host-registry-helper.ts:105`; `mcp/src/native-host-registry-helper.ts:134`; `tests/mcp-native-host-registry-helper.test.js:308` |
| SEC-CHECK-ENV-PATH-EXCLUSION | closed — helper invocation uses an absolute executable, empty environment, isolated mode, and `shell:false`; inherited executable-selection variables cannot affect it. | `mcp/src/native-host-registry-helper.ts:296`; `mcp/src/native-host-production.ts:232`; `tests/mcp-native-host-registry-helper.test.js:152` |
| SEC-CHECK-NPM-MANIFEST-TRUST | closed — package name/version, exact pinned direct dependencies, bundle roster, lock receipt, and full production package list are cross-validated. | `mcp/package-lock.json:7`; `mcp/src/native-host-install/runtime.ts:156`; `mcp/src/native-host-production.ts:372` |
| SEC-CHECK-RECEIPT-TRAVERSAL | closed — package records accept only bounded `node_modules` paths, resolved entries must remain inside the package root, and runtime receipt paths must equal the derived layout. | `mcp/src/native-host-install/runtime.ts:128`; `mcp/src/native-host-production.ts:386`; `mcp/src/native-host-install/index.ts:199` |
| SEC-CHECK-REG-SYSTEMROOT | closed — registry operations do not derive an executable from inherited `SystemRoot` or `SYSTEMROOT`; helper launch receives an empty isolated environment. | `mcp/src/native-host-registry-helper.ts:296`; `mcp/src/native-host-production.ts:250`; `tests/mcp-native-host-registry-helper.test.js:308` |
| SEC-CHECK-REG-LOCALIZED-OUTPUT | closed — fixed JSON fields and numeric status codes are locale-independent; label-shaped, malformed, truncated, trailing, or oversize success output maps to unavailable and cannot prove absence. | `mcp/src/native-host-registry-helper.ts:211`; `tests/mcp-native-host-registry-helper.test.js:118`; `tests/mcp-native-host-registry-helper.test.js:249` |
| SEC-CHECK-REG-VIEWS | closed — operation 2 is user/64 query-only; inspect/write/delete/empty-key operations are hard-coded to user/32 and arbitrary keys/views are absent. | `mcp/native-host/windows/fsb-native-host-registry.c:429`; `mcp/src/native-host-registry-helper.ts:281`; `tests/mcp-native-host-registry-helper.test.js:162` |
| SEC-CHECK-LEASE-BIND-SCOPE | closed — the lease listens only on loopback with `exclusive:true`, destroys accepted sockets, and exposes only release. | `mcp/src/native-host/platform.ts:358`; `mcp/src/native-host/platform.ts:369`; `tests/mcp-native-host-daemon.test.js:1133` |
| SEC-CHECK-LEASE-PORT-COLLISION | closed — a collision returns a contender fact and prevents lock takeover/spawn; health polling remains the only convergence path. | `mcp/src/native-host/platform.ts:362`; `mcp/src/native-host/daemon.ts:411`; `mcp/src/native-host/daemon.ts:639` |
| SEC-CHECK-LEASE-CONNECTIONS | closed — connection callbacks immediately destroy sockets and do not parse data, retain peers, or grant authority. | `mcp/src/native-host/platform.ts:360`; `tests/mcp-native-host-daemon.test.js:1116` |
| SEC-CHECK-LEASE-CRASH-RELEASE | closed — normal paths release in `finally`; OS listener ownership supplies crash release and the lease is reacquirable after close. | `mcp/src/native-host/daemon.ts:231`; `mcp/src/native-host/daemon.ts:655`; `tests/mcp-native-host-daemon.test.js:1138` |
| SEC-CHECK-CLAIM-IDENTITY | closed — stale and release claims compare directory identity, owner bytes, and complete bounded roster before and after atomic rename. | `mcp/src/native-host/platform.ts:279`; `mcp/src/native-host/platform.ts:306`; `mcp/src/native-host/platform.ts:320` |
| SEC-CHECK-CLAIM-CLEANUP | closed — cleanup accepts only exact tokened paths, owner-only rosters, and matching owner metadata; foreign entries remain untouched. | `mcp/src/native-host/platform.ts:400`; `mcp/src/native-host/platform.ts:453`; `tests/mcp-native-host-daemon.test.js:1164` |
| SEC-CHECK-AGENT-AUTHORITY | closed — readiness is not agent authority; only authenticated bridge requests routed to the serve-owned supervisor can invoke the fixed agent capability. | `mcp/src/agent-providers/serve-delegation.ts:253`; `extension/background.js:1728`; `tests/mcp-bridge-background-dispatch.test.js:2076` |
| SEC-CHECK-REG-HELPER-STRUCTURED | closed — exact schema, operation echo, numeric status/type, lowercase hex value, empty stderr, and bounded combined output are mandatory. | `mcp/src/native-host-registry-helper.ts:211`; `mcp/native-host/windows/fsb-native-host-registry.c:34`; `tests/mcp-native-host-registry-helper.test.js:118` |
| SEC-CHECK-REG-FIXED-API | closed — protocol name, numeric operations, root key, default value, and view constants are compiled into the helper; request data cannot widen them. | `mcp/src/native-host-registry-helper.ts:21`; `mcp/native-host/windows/fsb-native-host-registry.c:9`; `mcp/native-host/windows/fsb-native-host-registry.c:436` |
| SEC-CHECK-REG-USER64-READONLY | closed — the only 64-bit dispatch calls the query function; all mutation methods refuse the shadow view before spawn. | `mcp/native-host/windows/fsb-native-host-registry.c:438`; `mcp/src/native-host-registry-helper.ts:285`; `tests/mcp-native-host-registry-helper.test.js:181` |
| SEC-CHECK-REG-HELPER-PROVENANCE | closed — exact four-entry metadata order and helper path/hash/role/machine/version/file identity are checked immediately before each invocation. | `mcp/src/native-host-registry-helper.ts:134`; `mcp/src/native-host-registry-helper.ts:296`; `tests/mcp-native-host-registry-helper.test.js:314` |
| SEC-CHECK-REG-HELPER-CAPS | closed — writes use one capped framed stdin value, reads cap registry value conversion, and stdout/stderr overflow or nonempty stderr fails closed. | `mcp/src/native-host-registry-helper.ts:21`; `mcp/src/native-host-registry-helper.ts:265`; `mcp/native-host/windows/fsb-native-host-registry.c:252` |
| SEC-CHECK-SCHEMA2-FOUR-ARTIFACT | closed — metadata must contain exactly x64/arm64 bootstrap and registry-helper records with fixed paths, role markers, PE machines, sizes, hashes, and version. | `mcp/src/native-host-install/runtime.ts:286`; `scripts/build-native-host-windows.mjs:211`; `tests/mcp-native-host-packaging.test.js:1498` |
| SEC-CHECK-RUNTIME-HELPER-RECEIPT | closed — the selected helper is copied beside the bootstrap, hashed, persisted in the schema-2 receipt, and rehashed during installed-runtime inspection. | `mcp/src/native-host-install/runtime.ts:798`; `mcp/src/native-host-install/types.ts:230`; `mcp/src/native-host-production.ts:604`; `tests/mcp-native-host-install.test.js:1162` |
| SEC-CHECK-BOOTSTRAP-SEPARATION | closed — bootstrap reads only its owned sibling config and launches Node/entry; registry API calls exist only in the distinct role-marked helper. | `mcp/native-host/windows/fsb-native-host-bootstrap.c:151`; `mcp/native-host/windows/fsb-native-host-bootstrap.c:351`; `mcp/native-host/windows/fsb-native-host-registry.c:21` |
| SEC-CHECK-MSVC-HARNESS | closed — source builds both roles with `/MT`, CFG, ASLR, NX, and high-entropy flags; Windows CI/release harnesses verify both architectures and restrict registry exercise to safe reads plus malformed write refusal. | `scripts/build-native-host-windows.mjs:169`; `.github/workflows/ci.yml:65`; `.github/workflows/ci.yml:83`; `.github/workflows/npm-publish.yml:24` |

## Precomputed Plan 10 Evidence

The audit consumes only **precomputed Plan 10** and **precomputed remediation evidence**. The **reviewer ran no commands** that execute project behavior and did not perform tests, builds, browser use, registry access, or OS-native execution. The focused matrix source defines protected ordering and workspace preservation (`scripts/run-phase63-focused-tests.mjs:27`; `scripts/run-phase63-focused-tests.mjs:557`).

| Evidence class | Precomputed result |
|---|---|
| Plan 10 focused/package/workflow markers | `87/87`, `200/200`, `1015/1015`, `142/142` |
| Prior remediation markers | `101 platform/production CLI assertions`; `125 platform/registration assertions`; `229 install transaction assertions`; `152 CLI-routing assertions`; `54 bounded-output assertions`; `229 diagnostics assertions`; `229 daemon/entry assertions`; `111 background-wake assertions`; `1,014-assertion Phase 61–63 contract gate` |
| New remediation and compatibility evidence | `15-assertion adversarial registry-helper suite`; `294 runtime transaction assertions`; `1,016-assertion compatibility rerun` |
| Source anchors for the precomputed matrix | `scripts/run-phase63-focused-tests.mjs:35`; `tests/mcp-native-host-registry-helper.test.js:364`; `tests/mcp-native-host-install.test.js:1160`; `tests/delegation-phase-contract.test.js:1518`; `tests/mcp-version-parity.test.js:658` |
| Human/native boundary | `local MSVC execution not claimed` |

## Findings

| ID | Severity | Status | Resolution | Evidence |
|---|---|---|---|---|
| F63-SECURITY-01 | HIGH | resolved | Locale-dependent registry text parsing was removed. The fixed Win32 Registry API helper returns exact bounded structured facts; malformed/localized/truncated/trailing/oversize success output is unavailable, never absent, so shadow ambiguity cannot authorize mutation. | `mcp/src/native-host-registry-helper.ts:211`; `mcp/native-host/windows/fsb-native-host-registry.c:95`; `mcp/src/native-host-install/platform.ts:140`; `tests/mcp-native-host-registry-helper.test.js:118`; `tests/mcp-native-host-registry-helper.test.js:249` |
| F63-SECURITY-02 | HIGH | resolved | Registry executable selection no longer derives from inherited root or search-path state. Every fixed helper launch revalidates schema-2 metadata plus path/hash/role/PE-machine/version/file provenance and uses an absolute `shell:false` executable with an empty isolated environment. | `mcp/src/native-host-registry-helper.ts:134`; `mcp/src/native-host-registry-helper.ts:296`; `mcp/src/native-host-production.ts:250`; `scripts/build-native-host-windows.mjs:116`; `tests/mcp-native-host-registry-helper.test.js:308` |

## Residual Human Evidence Boundary

Evidence from a real OS remains pending and human-owned.

`.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` remains pending. Real OS installation and registry behavior, genuine Chrome native messaging, Windows PE execution, visual rendering, keyboard focus, zoom/themes, and screen-reader behavior are not claimed by this source-only audit. Source, synthetic protocol, DOM, adapter, packaging, and precomputed CI evidence do not promote any human-needed ledger entry.

Verdict: PASS

Findings: 2 HIGH resolved; 0 unresolved CRITICAL; 0 unresolved HIGH.

Artifact: `.planning/phases/63-native-messaging-host/63-SECURITY.md`
