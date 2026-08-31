---
phase: 63-native-messaging-host
review_kind: code
reviewer: gsd-code-reviewer
prompt_version: phase63-code-v1
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
output_path: .planning/phases/63-native-messaging-host/63-REVIEW.md
live_uat: pending
findings_critical: 0
findings_high: 6
findings_medium: 1
findings_low: 0
findings_info: 0
unresolved_critical: 0
unresolved_high: 0
---

# Phase 63 Pass-4 Blocking Code Review

## Review Identity

This independent source-only review is bound to base `27bddf00517738c87fcc6ca4b27940e8121f2124`, end and compatibility commit `6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887`, the ordered 56-file manifest hash `5135dbf243f0f123f60217584cd2ae8ab6865c78c85fcdae20464a539b27dcc7`, and the canonical patch (887858 bytes) with hash `24072007a6af1754e496804471c3b21e9afd01f20bcdec9bcfaa9c694e5e46d6`. The implementation index hash is `ab66af77cbb8989a3d76425afa36cc10a75db80530f70800c3f443f047077c23`; the implementation worktree/index hash is `3120d40b00f57e0a29cbd774baaaaac798147ab131b37114b8781a63d801ae47`. Remediation identity is RED `a91f3e29ad26d726d25487abce8799e237b2735a`, GREEN `409e638d`, documentation `79db94f1`, and compatibility `6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887`.

The compatibility contract anchor is `tests/delegation-phase-contract.test.js:175`.

The compatibility delta is confined to the Phase 63 root-gate roster and its ordered-slot label at `tests/delegation-phase-contract.test.js:39`, `tests/delegation-phase-contract.test.js:43`, `tests/delegation-phase-contract.test.js:1522`, and `tests/delegation-phase-contract.test.js:1532`.

The verdict is source-only. The reviewer ran no commands, tests, builds, browser sessions, registry operations, or OS-native execution. Precomputed evidence is used only where explicitly labeled.

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

- `.planning/phases/63-native-messaging-host/63-REVIEW.md`

## Review Scope

The pass traced correctness, error collapse, races and lifecycle settlement, framing and caps, platform and registry semantics, atomic ownership, bundled-offline closure, workspace preservation, one-flight/no-replay behavior, normalization, root/CI ordering, compatibility, maintainability, and test strength. The deepest remediation inspection covered the separate registry helper C/TS boundary (`mcp/native-host/windows/fsb-native-host-registry.c:95`, `mcp/src/native-host-registry-helper.ts:134`), schema-2 four-artifact role metadata (`mcp/src/native-host-install/runtime.ts:286`, `scripts/build-native-host-windows.mjs:206`), runtime helper copy/receipt/inspection (`mcp/src/native-host-install/runtime.ts:797`, `mcp/src/native-host-production.ts:553`), isolated process execution (`mcp/src/native-host-registry-helper.ts:289`, `mcp/src/native-host-production.ts:250`), registry-helper CI/publish flow (`.github/workflows/ci.yml:55`, `.github/workflows/npm-publish.yml:12`), and registry-helper test strength (`tests/mcp-native-host-registry-helper.test.js:118`, `tests/mcp-native-host-packaging.test.js:1501`).

The contracted checklist includes `race/lifecycle`; `framing/size limits`; `platform/registry`; `error normalization`; `direct/global bin operation without npm environment`; `validated npm candidate provenance`; `npm-independent uninstall receipt reconstruction`; `Windows user/64 missing or unavailable`; `mutation boundary`; `OS loopback one-flight lease`; `port collision`; `crash release`; `A/B/C scheduling`; `identity claim/rollback`; `spawn/readiness/release ordering`; and `malformed/foreign lock preservation`.

The host protocol rejects malformed shapes and bounds input before authority (`mcp/src/native-host/protocol.ts:104`, `mcp/src/native-host/protocol.ts:208`); the one-shot entry validates invocation before wake (`mcp/src/native-host/entry.ts:175`, `mcp/src/native-host/entry.ts:202`); the direct daemon spawn remains an absolute executable plus fixed argv with `shell:false` (`mcp/src/native-host/daemon.ts:549`, `mcp/src/native-host/daemon.ts:561`); and the import graph denies installer, adapter, task, secret, and historical IPC authority (`scripts/verify-native-host-boundary.mjs:15`, `scripts/verify-native-host-boundary.mjs:68`).

## Requirement Coverage

| Requirement | Disposition | Concrete evidence |
| --- | --- | --- |
| NATIVE-01 | covered | User-scope platform layouts and exact launcher/registration locations are closed in `mcp/src/native-host-install/platform.ts:53` and `mcp/src/native-host-install/platform.ts:90`; the stable runtime is transactionally materialized and published in `mcp/src/native-host-install/runtime.ts:631`; Windows selects and copies the architecture-matched bootstrap and helper in `mcp/src/native-host-install/runtime.ts:797`; production operations are composed at `mcp/src/native-host-production.ts:814`. |
| NATIVE-02 | covered | The sole additive permission is visible at `extension/manifest.json:8` and pinned byte-for-byte by `tests/native-host-background-wake.test.js:552`; boot performs only an advisory no-message probe at `extension/background.js:99`; actual wake is restricted to the authoritative offline preflight at `extension/background.js:1648`; the controller coalesces and fences settlement at `extension/utils/native-host-wake.js:200`. |
| NATIVE-03 | covered | Closed request/response framing is enforced at `mcp/src/native-host/protocol.ts:72`, `mcp/src/native-host/protocol.ts:263`, and `mcp/src/native-host/protocol.ts:308`; the only child tuple is the existing `serve` entrypoint at `mcp/src/native-host/daemon.ts:549`; source/compiled graphs and forbidden authority are pinned at `scripts/verify-native-host-boundary.mjs:16` and `scripts/verify-native-host-boundary.mjs:68`. |
| NATIVE-04 | covered | Exact-owned uninstall rechecks registration and runtime before removal at `mcp/src/native-host-install/index.ts:477`, `mcp/src/native-host-install/index.ts:554`, and `mcp/src/native-host-install/index.ts:589`; production doctor composes read-only platform/runtime/daemon facts at `mcp/src/native-host-production.ts:959`; closed local and browser projections are normalized at `mcp/src/diagnostics.ts:319` and `mcp/src/diagnostics.ts:446`, with zero-mutation evidence at `tests/mcp-diagnostics-status.test.js:325`. |

## Decision Coverage

| Decision | Disposition | Concrete evidence |
| --- | --- | --- |
| D63-01 | covered | One closed versioned wake request and factual response vocabulary: `mcp/src/native-host/protocol.ts:13`, `mcp/src/native-host/protocol.ts:104`, `mcp/src/native-host/protocol.ts:308`. |
| D63-02 | covered | One length-prefixed request, one response, then settlement: `mcp/src/native-host/protocol.ts:208`, `mcp/src/native-host/entry.ts:175`, `mcp/src/native-host/entry.ts:217`. |
| D63-03 | covered | Core entry imports only native-host modules and the graph rejects broader authority: `mcp/src/native-host/entry.ts:1`, `scripts/verify-native-host-boundary.mjs:28`, `scripts/verify-native-host-boundary.mjs:68`. |
| D63-04 | covered | The child command is the absolute Node executable plus a fixed `serve --host 127.0.0.1 --port 7226` argv and `shell:false`: `mcp/src/native-host/daemon.ts:549`, `mcp/src/native-host/daemon.ts:561`, `mcp/src/native-host/platform.ts:491`. |
| D63-05 | covered | Tokened pending publication, OS lease, identity-bound stale claim, factual polling, and exact release: `mcp/src/native-host/daemon.ts:370`, `mcp/src/native-host/daemon.ts:402`, `mcp/src/native-host/daemon.ts:482`, `mcp/src/native-host/platform.ts:358`. |
| D63-06 | covered | Native success stays a daemon reachability fact and is followed by bridge readiness plus a fresh preflight: `mcp/src/native-host/daemon.ts:596`, `extension/background.js:1695`, `extension/background.js:1701`, `extension/background.js:1728`. |
| D63-07 | covered | Native install/uninstall remains an explicit CLI target, separate from client expansion: `mcp/src/install.ts:51`, `mcp/src/install.ts:53`, `mcp/src/index.ts:85`, `tests/mcp-install-platforms.test.js:303`. |
| D63-08 | covered | Exact macOS/Linux/Windows user layouts, stable root, manifest path, and HKCU views are resolved centrally: `mcp/src/native-host-install/platform.ts:53`, `mcp/src/native-host-install/platform.ts:61`, `mcp/src/native-host-install/platform.ts:90`. |
| D63-09 | covered | Manifest creation and validation admit exactly one canonical Chrome origin: `mcp/src/native-host-registration.ts:101`, `mcp/src/native-host-registration.ts:116`, `mcp/src/native-host-registration.ts:133`. |
| D63-10 | covered | Private no-follow staging, exact absent-boundary checks, receipt publication, and non-overwriting registration are enforced at `mcp/src/native-host-production.ts:194`, `mcp/src/native-host-install/runtime.ts:653`, `mcp/src/native-host-install/runtime.ts:870`, `mcp/src/native-host-install/index.ts:426`. |
| D63-11 | covered | Uninstall requires exact runtime, exact registration, exact key shape, repeated boundary checks, and exact tombstoned removal: `mcp/src/native-host-install/index.ts:511`, `mcp/src/native-host-install/index.ts:536`, `mcp/src/native-host-install/index.ts:570`, `mcp/src/native-host-production.ts:628`. |
| D63-12 | covered | Platform mutation is isolated behind injected file/registry adapters: `mcp/src/native-host-install/platform.ts:132`, `mcp/src/native-host-install/platform.ts:150`, `tests/mcp-native-host-install.test.js:134`. |
| D63-13 | covered | Exactly one `nativeMessaging` permission is added and pinned against every other manifest byte: `extension/manifest.json:8`, `extension/manifest.json:21`, `tests/native-host-background-wake.test.js:552`, `tests/native-host-background-wake.test.js:580`. |
| D63-14 | covered | Background alone loads and invokes native messaging; UI has no native/process surface: `extension/background.js:34`, `extension/background.js:99`, `extension/background.js:1671`, `tests/delegation-sidepanel-ui.test.js:615`. |
| D63-15 | covered | The boot probe sends no message and actual wake occurs only after `agent_offline`: `extension/utils/native-host-wake.js:125`, `extension/background.js:99`, `extension/background.js:1666`, `extension/background.js:1671`. |
| D63-16 | covered | Shared wake, 12-second timeout, late-result fence, bridge wait, and exactly one new preflight are explicit: `extension/utils/native-host-wake.js:200`, `extension/utils/native-host-wake.js:226`, `extension/utils/native-host-wake.js:276`, `extension/background.js:1701`, `extension/background.js:1728`. |
| D63-17 | covered | Missing, malformed, timed-out, or failed native results return the original offline fact without optimistic continuation: `extension/utils/native-host-wake.js:99`, `extension/utils/native-host-wake.js:233`, `extension/background.js:1689`, `extension/background.js:1695`. |
| D63-18 | covered | Wake success does not imply pairing; the authoritative rerun decides the next paired/unpaired/offline state: `extension/background.js:1600`, `extension/background.js:1722`, `extension/background.js:1728`. |
| D63-19 | covered | Attempt-scoped checking copy says the message was not sent, preserves intent fencing, and uses no action surface: `extension/ui/sidepanel.js:1512`, `extension/ui/sidepanel.js:1531`, `extension/ui/sidepanel.js:1545`, `extension/ui/sidepanel.js:2315`, `tests/delegation-sidepanel-ui.test.js:597`. |
| D63-20 | covered | One existing diagnostic snapshot gains closed native-host facts through the production inspector: `mcp/src/native-host-production.ts:857`, `mcp/src/native-host-production.ts:959`, `mcp/src/diagnostics.ts:436`, `mcp/src/diagnostics.ts:960`. |
| D63-21 | covered | Doctor remains read-only; local output may retain the bounded expected location while the browser projection is five keys with no path/reason: `mcp/src/diagnostics.ts:282`, `mcp/src/diagnostics.ts:425`, `mcp/src/diagnostics.ts:446`, `tests/mcp-diagnostics-status.test.js:386`. |
| D63-22 | covered | Own-data normalization, bounded paths/output, content-free failures, and fixed structured registry facts prevent secret or raw-output propagation: `mcp/src/diagnostics.ts:319`, `mcp/src/native-host-registry-helper.ts:57`, `mcp/src/native-host-registry-helper.ts:211`, `tests/mcp-native-host-registry-helper.test.js:290`. |
| D63-23 | covered | Focused tests exercise framing, locks, transactions, doctor, wake, UI, packaging, and workspace preservation in protected order: `scripts/run-phase63-focused-tests.mjs:26`, `scripts/run-phase63-focused-tests.mjs:35`, `scripts/run-phase63-focused-tests.mjs:388`, `package.json:17`. |
| D63-24 | covered | Source and compiled boundary checks deny adapter/spawn/task/secret/installer authority and pin one wake call: `scripts/verify-native-host-boundary.mjs:56`, `scripts/verify-native-host-boundary.mjs:61`, `scripts/verify-native-host-boundary.mjs:68`, `scripts/verify-native-host-boundary.mjs:129`. |
| D63-25 | covered with human evidence pending | Automated contracts preserve the untouched live ledger instead of promoting it: `tests/delegation-phase-contract.test.js:175`, `tests/delegation-phase-contract.test.js:181`, `tests/delegation-phase-contract.test.js:228`, `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:177`. |

## Remediation Verification

| Finding | Current disposition | Source and test evidence |
| --- | --- | --- |
| F63-CODE-01 | resolved | Production install/uninstall now use concrete operations, stable platform/runtime composition, and bounded failure collapse at `mcp/src/native-host-production.ts:734`, `mcp/src/native-host-production.ts:762`, `mcp/src/native-host-production.ts:814`, and `mcp/src/native-host-production.ts:1035`; direct CLI coverage begins at `tests/mcp-install-platforms.test.js:303`. |
| F63-CODE-02 | resolved | Production doctor composes real registration, owned-runtime, launcher, and daemon facts at `mcp/src/native-host-production.ts:959`, then the single normalizer and safe projector close them at `mcp/src/diagnostics.ts:319` and `mcp/src/diagnostics.ts:446`; mutation spies remain zero at `tests/mcp-diagnostics-status.test.js:325`. |
| F63-CODE-03 | resolved | Owner metadata is written inside the tokened `wake.lock.pending-` directory namespace before canonical publication, while cleanup is exact-path/exact-roster only: `mcp/src/native-host/daemon.ts:338`, `mcp/src/native-host/daemon.ts:370`, `mcp/src/native-host/platform.ts:400`, `mcp/src/native-host/platform.ts:453`; real-filesystem assertions cover preexisting and foreign entries at `tests/mcp-native-host-daemon.test.js:1143`. |
| F63-CODE-04 | resolved | npm is selected only from validated real-prefix candidates, not inherited `npm_execpath` or a path search, while uninstall has no npm dependency: `mcp/src/native-host-production.ts:677`, `mcp/src/native-host-production.ts:712`, `mcp/src/native-host-production.ts:814`, `mcp/src/native-host-production.ts:848`; hostile inherited state is removed from the fixture at `tests/mcp-install-platforms.test.js:38`. |
| F63-CODE-05 | resolved | Absence/exact classification requires explicit user/64 shadow absence and every publish/remove/key-cleanup boundary rechecks it: `mcp/src/native-host-install/index.ts:265`, `mcp/src/native-host-install/platform.ts:140`, `mcp/src/native-host-install/platform.ts:172`, `mcp/src/native-host-install/platform.ts:190`, `mcp/src/native-host-install/platform.ts:209`; concrete assertions begin at `tests/mcp-native-host-install.test.js:968`. |
| F63-CODE-06 | resolved | One exclusive loopback one-flight lease encloses publication, spawn, readiness, identity-bound release, and stale recovery; claims compare directory identity, bounded roster, and owner bytes: `mcp/src/native-host/daemon.ts:402`, `mcp/src/native-host/daemon.ts:427`, `mcp/src/native-host/daemon.ts:646`, `mcp/src/native-host/platform.ts:279`, `mcp/src/native-host/platform.ts:320`, `mcp/src/native-host/platform.ts:358`. |
| F63-CODE-07 | resolved | The direct registry-helper command is now present in `PHASE63_NEW_TEST_COMMANDS` at `tests/delegation-phase-contract.test.js:39` and `tests/delegation-phase-contract.test.js:43`; the ordered-chain loop and assertion now cover `six Phase 63 root gates` at `tests/delegation-phase-contract.test.js:1522` and `tests/delegation-phase-contract.test.js:1532`. |

The seven remediations close their original failure modes without widening native authority. F63-CODE-07 is a resolved MEDIUM compatibility-gate defect; no new CRITICAL or HIGH defect was established by the frozen source.

## Registry Helper Review

The separate registry helper C/TS design is closed and role-specific. The C boundary fixes the protocol, registry key, status vocabulary, maximum input, and operation dispatch in `mcp/native-host/windows/fsb-native-host-registry.c:9`, `mcp/native-host/windows/fsb-native-host-registry.c:95`, `mcp/native-host/windows/fsb-native-host-registry.c:252`, and `mcp/native-host/windows/fsb-native-host-registry.c:429`. It exposes read-only user/64 query and only fixed user/32 inspect/write/delete/empty-key operations; no caller-controlled key or view crosses argv. The TS boundary validates schema-2 metadata with exactly four artifacts and the ordered two-role roster at `mcp/src/native-host-registry-helper.ts:134` and `mcp/src/native-host-registry-helper.ts:163`, then revalidates absolute path, SHA-256, role, PE machine, package version, and reparse provenance before each spawn at `mcp/src/native-host-registry-helper.ts:197` and `mcp/src/native-host-registry-helper.ts:289`. Every invocation has an empty environment, absolute executable, fixed numeric protocol/operation argv, bounded output, and `shell:false` at `mcp/src/native-host-registry-helper.ts:296`.

The schema-2 four artifacts are the bootstrap and registry-helper roles for x64 and arm64. Publication performs the architecture-matched runtime copy, persists its path/hash in the receipt, and installed-state inspection rehashes it at `mcp/src/native-host-install/runtime.ts:286`, `mcp/src/native-host-install/runtime.ts:797`, `mcp/src/native-host-install/runtime.ts:826`, `mcp/src/native-host-install/runtime.ts:852`, and `mcp/src/native-host-production.ts:553`. Thus runtime copy, receipt, and installed-state inspection are all explicit rather than inferred. Version-resource identity is pinned in `mcp/native-host/windows/fsb-native-host-registry-version.rc.in:20` and `mcp/native-host/windows/fsb-native-host-registry-version.rc.in:22`.

The registry-helper CI/publish flow builds both roles for both architectures, verifies metadata, executes the safe x64 harness, and carries all four artifacts into the release package at `.github/workflows/ci.yml:55`, `.github/workflows/ci.yml:77`, `.github/workflows/ci.yml:83`, `.github/workflows/ci.yml:93`, `.github/workflows/npm-publish.yml:12`, `.github/workflows/npm-publish.yml:24`, `.github/workflows/npm-publish.yml:42`, and `.github/workflows/npm-publish.yml:78`. Adversarial TS tests cover localized/truncated/oversized output, closed mutation authority, framed stdin, content-free errors, hostile environment, and provenance tamper at `tests/mcp-native-host-registry-helper.test.js:118`, `tests/mcp-native-host-registry-helper.test.js:162`, `tests/mcp-native-host-registry-helper.test.js:204`, `tests/mcp-native-host-registry-helper.test.js:249`, `tests/mcp-native-host-registry-helper.test.js:290`, and `tests/mcp-native-host-registry-helper.test.js:308`; genuine Windows harness coverage performs safe read-only user/32 and user/64 queries plus a malformed write refusal at `tests/mcp-native-host-packaging.test.js:1501`, `tests/mcp-native-host-packaging.test.js:1511`, and `tests/mcp-native-host-packaging.test.js:1536`.

## Precomputed Plan 10 Evidence

This review did not rerun evidence. The following is precomputed Plan 10 evidence, retained without upgrading it to live proof: `87/87`, `200/200`, `1015/1015`, and `142/142`.

The compatibility delta additionally reports the precomputed `1,016-assertion compatibility rerun` as `1016/1016`.

The precomputed remediation evidence is: `101 platform/production CLI assertions`, `125 platform/registration assertions`, `229 install transaction assertions`, `152 CLI-routing assertions`, `54 bounded-output assertions`, `229 diagnostics assertions`, `229 daemon/entry assertions`, `111 background-wake assertions`, and the `1,014-assertion Phase 61–63 contract gate`. New remediation evidence is the `15-assertion adversarial registry-helper suite` and `294 runtime transaction assertions`. The protected sequence is represented in `scripts/run-phase63-focused-tests.mjs:26`, `scripts/run-phase63-focused-tests.mjs:35`, `scripts/run-phase63-focused-tests.mjs:296`, and `scripts/run-phase63-focused-tests.mjs:388`.

The reviewer ran no commands. `local MSVC execution not claimed`; the Windows workflow evidence is precomputed, and genuine Windows/Chrome execution remains outside this source verdict.

## Findings

| ID | Severity | Status | Resolution | Evidence |
| --- | --- | --- | --- | --- |
| F63-CODE-01 | HIGH | resolved | Concrete production native-host CLI operations replace the former unavailable composition, with bounded refusal on composition failure. | `mcp/src/native-host-production.ts:734`, `mcp/src/native-host-production.ts:814`, `mcp/src/native-host-production.ts:1035`, `tests/mcp-install-platforms.test.js:303` |
| F63-CODE-02 | HIGH | resolved | Production doctor now consumes real read-only registration/runtime/launcher/daemon facts through the existing closed normalizer and safe projection. | `mcp/src/native-host-production.ts:959`, `mcp/src/diagnostics.ts:319`, `mcp/src/diagnostics.ts:446`, `tests/mcp-diagnostics-status.test.js:325` |
| F63-CODE-03 | HIGH | resolved | Wake ownership is staged with metadata before publication; cleanup and release require exact tokened paths and owner-only rosters. | `mcp/src/native-host/daemon.ts:370`, `mcp/src/native-host/platform.ts:400`, `mcp/src/native-host/platform.ts:453`, `tests/mcp-native-host-daemon.test.js:1143` |
| F63-CODE-04 | HIGH | resolved | Production npm resolution uses only validated real-prefix candidates and uninstall no longer depends on npm/materialization state. | `mcp/src/native-host-production.ts:677`, `mcp/src/native-host-production.ts:712`, `mcp/src/native-host-production.ts:848`, `tests/mcp-install-platforms.test.js:38` |
| F63-CODE-05 | HIGH | resolved | Windows classification and every mutation boundary require explicit user/64 shadow absence; only user/32 mutates. | `mcp/src/native-host-install/platform.ts:140`, `mcp/src/native-host-install/platform.ts:172`, `mcp/src/native-host-install/platform.ts:190`, `mcp/src/native-host-install/platform.ts:209` |
| F63-CODE-06 | HIGH | resolved | An OS-backed exclusive lease plus identity/roster/owner-byte claims prevents stale contenders from replacing fresh canonical ownership. | `mcp/src/native-host/daemon.ts:402`, `mcp/src/native-host/daemon.ts:427`, `mcp/src/native-host/platform.ts:279`, `mcp/src/native-host/platform.ts:358` |
| F63-CODE-07 | MEDIUM | resolved | The historical-chain contract now includes the direct registry-helper test in `PHASE63_NEW_TEST_COMMANDS` and accurately labels the ordered slot as `six Phase 63 root gates`. | `tests/delegation-phase-contract.test.js:39`, `tests/delegation-phase-contract.test.js:43`, `tests/delegation-phase-contract.test.js:1522`, `tests/delegation-phase-contract.test.js:1532` |

## Residual Human Evidence Boundary

`.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` remains pending. The real OS behavior, genuine registry views, installed native-host launch, Chrome integration, visual rendering, keyboard focus, and screen-reader evidence are not claimed; the ledger contract keeps all eight cases human-needed and empty at `tests/delegation-phase-contract.test.js:175`, `tests/delegation-phase-contract.test.js:228`, and `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:179`.

Verdict: PASS with zero unresolved CRITICAL or HIGH findings. Artifact: `.planning/phases/63-native-messaging-host/63-REVIEW.md`.
