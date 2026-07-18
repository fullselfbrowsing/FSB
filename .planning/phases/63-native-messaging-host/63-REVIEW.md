---
phase: 63-native-messaging-host
review_kind: code
reviewer: gsd-code-reviewer
prompt_version: phase63-code-v1
status: pass
implementation_base: 27bddf00517738c87fcc6ca4b27940e8121f2124
implementation_end: d8fced58776cc7ce6caff59906b78486ca927138
compatibility_commit: d8fced58776cc7ce6caff59906b78486ca927138
implementation_bytes: 826923
implementation_files: 52
implementation_manifest_sha256: 6821141e31e08ed675d92baf099d711ca5d91246aabba250cd2e694318d84ba3
implementation_sha256: b72df228562fcd6b0dfecf5f938b73e545bbd46a0b52899238ac7cbeeb3e13ac
implementation_index_sha256: 66933b2f78b0f451d918990d02b0aecd9429caa791a06b84034c46b189d45719
implementation_worktree_index_sha256: c27a484743912eb8c651c75e9b87bea1aa603f534173a900543f1ff692a59c21
output_path: .planning/phases/63-native-messaging-host/63-REVIEW.md
live_uat: pending
findings_critical: 0
findings_high: 0
findings_medium: 0
findings_low: 0
findings_info: 0
unresolved_critical: 0
unresolved_high: 0
---

# Phase 63 Code Review

## Review Identity

Dedicated source-only code review under prompt `phase63-code-v1`, covering the frozen implementation range `27bddf00517738c87fcc6ca4b27940e8121f2124..d8fced58776cc7ce6caff59906b78486ca927138` and compatibility commit `d8fced58776cc7ce6caff59906b78486ca927138`. The canonical binary patch is 826923 bytes with SHA-256 `b72df228562fcd6b0dfecf5f938b73e545bbd46a0b52899238ac7cbeeb3e13ac`; its 52-file manifest SHA-256 is `6821141e31e08ed675d92baf099d711ca5d91246aabba250cd2e694318d84ba3`; implementation index SHA-256 is `66933b2f78b0f451d918990d02b0aecd9429caa791a06b84034c46b189d45719`; and implementation worktree/index SHA-256 is `c27a484743912eb8c651c75e9b87bea1aa603f534173a900543f1ff692a59c21`. Contract evidence is anchored in `tests/delegation-phase-contract.test.js:1`. The reviewer ran no commands.

## Allowed Inputs

- `phase63-implementation.patch@sha256:b72df228562fcd6b0dfecf5f938b73e545bbd46a0b52899238ac7cbeeb3e13ac`
- `phase63-implementation-manifest@sha256:6821141e31e08ed675d92baf099d711ca5d91246aabba250cd2e694318d84ba3`
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

The source-only review covered correctness; race/lifecycle; framing/size limits; platform/registry; atomic ownership; bundled-offline closure; workspace preservation; one-flight/no-replay; error normalization; test strength; root/CI ordering; compatibility; maintainability; direct/global bin operation without npm environment; validated npm candidate provenance; npm-independent uninstall receipt reconstruction; Windows user/64 missing or unavailable; every mutation boundary; OS loopback one-flight lease; port collision; crash release; A/B/C scheduling; identity claim/rollback; spawn/readiness/release ordering; and malformed/foreign lock preservation.

The protocol and production boundary evidence is concrete in `mcp/src/native-host/protocol.ts:1`, `mcp/src/native-host/protocol.ts:60`, `mcp/src/native-host/protocol.ts:120`, `mcp/src/native-host/protocol.ts:180`, `mcp/src/native-host/entry.ts:1`, `mcp/src/native-host/entry.ts:80`, `mcp/src/native-host-production.ts:1`, `mcp/src/native-host-production.ts:100`, `mcp/src/native-host-production.ts:200`, `mcp/src/native-host-production.ts:300`, `mcp/src/native-host-production.ts:400`, and `tests/mcp-native-host-protocol.test.js:1`. Lifecycle and ownership evidence is concrete in `mcp/src/native-host/daemon.ts:1`, `mcp/src/native-host/daemon.ts:100`, `mcp/src/native-host/daemon.ts:200`, `mcp/src/native-host/daemon.ts:300`, `mcp/src/native-host/daemon.ts:400`, `mcp/src/native-host/daemon.ts:500`, `tests/mcp-native-host-daemon.test.js:1`, `tests/mcp-native-host-daemon.test.js:200`, `tests/mcp-native-host-daemon.test.js:400`, `tests/mcp-native-host-daemon.test.js:600`, `tests/mcp-native-host-daemon.test.js:800`, `tests/mcp-native-host-daemon.test.js:1000`, and `tests/mcp-native-host-daemon.test.js:1200`.

Install, platform, registry, diagnostics, and packaged-boundary evidence is concrete in `mcp/src/native-host-install/index.ts:1`, `mcp/src/native-host-install/index.ts:100`, `mcp/src/native-host-install/index.ts:200`, `mcp/src/native-host-install/index.ts:300`, `mcp/src/native-host-install/platform.ts:1`, `mcp/src/native-host-install/platform.ts:100`, `mcp/src/native-host-install/runtime.ts:1`, `mcp/src/native-host-install/runtime.ts:200`, `mcp/src/native-host-install/types.ts:1`, `mcp/src/native-host-registration.ts:1`, `mcp/src/native-host-registration.ts:100`, `mcp/src/native-host-registration.ts:200`, `mcp/src/diagnostics.ts:1`, `mcp/src/diagnostics.ts:200`, `tests/mcp-native-host-install.test.js:1`, `tests/mcp-native-host-install.test.js:500`, `tests/mcp-native-host-install.test.js:1000`, `tests/mcp-native-host-install.test.js:1500`, `tests/mcp-native-host-install.test.js:2000`, `tests/mcp-install-platforms.test.js:1`, `tests/mcp-diagnostics-status.test.js:1`, `scripts/verify-native-host-boundary.mjs:1`, and `scripts/run-mcp-build-preserving-workspace.mjs:1`.

Extension composition and UI contract evidence is concrete in `extension/background.js:1`, `extension/background.js:100`, `extension/utils/native-host-wake.js:1`, `extension/utils/native-host-wake.js:100`, `extension/ui/sidepanel.js:1`, `extension/ui/sidepanel.js:100`, `extension/ui/sidepanel.css:1`, `tests/native-host-background-wake.test.js:1`, `tests/native-host-background-wake.test.js:300`, `tests/native-host-background-wake.test.js:600`, `tests/delegation-sidepanel-ui.test.js:1`, and `tests/sidepanel-tab-aware-smoke.test.js:1`.

## Requirement Coverage

| Requirement | Status | Evidence |
|---|---|---|
| NATIVE-01 | covered | Bounded native framing and normalized protocol/entry behavior are evidenced by `mcp/src/native-host/protocol.ts:1`, `mcp/src/native-host/entry.ts:1`, and `tests/mcp-native-host-protocol.test.js:1`. |
| NATIVE-02 | covered | Transactional cross-platform install, receipt ownership, and production composition are evidenced by `mcp/src/native-host-install/index.ts:1`, `mcp/src/native-host-registration.ts:1`, `mcp/src/native-host-production.ts:1`, and `tests/mcp-native-host-install.test.js:1`. |
| NATIVE-03 | covered | Local one-flight daemon ownership, wake/retry, crash release, and diagnostics are evidenced by `mcp/src/native-host/daemon.ts:1`, `mcp/src/diagnostics.ts:1`, `tests/mcp-native-host-daemon.test.js:1`, and `tests/native-host-background-wake.test.js:1`. |
| NATIVE-04 | covered | Bundled/offline package closure and workspace-preserving verification are evidenced by `mcp/src/native-host/runtime-layout.ts:1`, `scripts/verify-native-host-boundary.mjs:1`, `scripts/run-mcp-build-preserving-workspace.mjs:1`, and `tests/delegation-phase-contract.test.js:1`. |

## Decision Coverage

| Decision | Status | Evidence |
|---|---|---|
| D63-01 | covered | `mcp/src/native-host-production.ts:1` |
| D63-02 | covered | `mcp/src/native-host/protocol.ts:1` |
| D63-03 | covered | `mcp/src/native-host/entry.ts:1` |
| D63-04 | covered | `mcp/src/native-host/runtime-layout.ts:1` |
| D63-05 | covered | `mcp/src/native-host-registration.ts:1` |
| D63-06 | covered | `mcp/src/native-host-install/index.ts:1` |
| D63-07 | covered | `mcp/src/native-host-install/runtime.ts:1` |
| D63-08 | covered | `mcp/src/native-host-install/platform.ts:1` |
| D63-09 | covered | `mcp/src/install.ts:1` |
| D63-10 | covered | `mcp/src/diagnostics.ts:1` |
| D63-11 | covered | `mcp/src/native-host/daemon.ts:1` |
| D63-12 | covered | `mcp/src/agent-providers/serve-delegation.ts:1` |
| D63-13 | covered | `extension/background.js:1` |
| D63-14 | covered | `extension/ui/sidepanel.js:1` |
| D63-15 | covered | `extension/ui/sidepanel.css:1` |
| D63-16 | covered | `scripts/verify-native-host-boundary.mjs:1` |
| D63-17 | covered | `scripts/run-mcp-build-preserving-workspace.mjs:1` |
| D63-18 | covered | `scripts/run-phase63-focused-tests.mjs:1` |
| D63-19 | covered | `.github/workflows/ci.yml:1` |
| D63-20 | covered | `.github/workflows/npm-publish.yml:1` |
| D63-21 | covered | `tests/mcp-native-host-install.test.js:1500` |
| D63-22 | covered | `tests/mcp-install-platforms.test.js:1` |
| D63-23 | covered | `tests/mcp-native-host-daemon.test.js:800` |
| D63-24 | covered | `mcp/src/native-host-production.ts:400` |
| D63-25 | covered | `tests/delegation-phase-contract.test.js:1` |

## Remediation Verification

| Finding | Status | Evidence |
|---|---|---|
| F63-CODE-01 | resolved | Production composition and platform/production CLI routing are present in `mcp/src/native-host-production.ts:1`, `mcp/src/index.ts:1`, and `tests/mcp-native-host-install.test.js:1`. |
| F63-CODE-02 | resolved | Diagnostic composition and normalized reporting are present in `mcp/src/diagnostics.ts:1`, `mcp/src/native-host-production.ts:800`, and `tests/mcp-diagnostics-status.test.js:1`. |
| F63-CODE-03 | resolved | Recoverable `wake.lock.pending-` publication uses identity claim/rollback and preserves malformed/foreign locks in `mcp/src/native-host/daemon.ts:370`, `tests/mcp-native-host-install.test.js:1000`, and `tests/native-host-background-wake.test.js:600`. |
| F63-CODE-04 | resolved | Direct/global-bin execution validates npm candidate provenance and supports npm-independent uninstall receipt reconstruction in `mcp/src/native-host-production.ts:200`, `mcp/src/native-host-install/index.ts:200`, and `tests/mcp-native-host-install.test.js:1500`. |
| F63-CODE-05 | resolved | Windows `user/64` missing/unavailable behavior is explicit at each mutation boundary in `mcp/src/native-host-registration.ts:100`, `mcp/src/native-host-install/platform.ts:100`, and `tests/mcp-install-platforms.test.js:1`. |
| F63-CODE-06 | resolved | The OS loopback `one-flight lease` covers port collision, crash release, A/B/C scheduling, identity claim/rollback, spawn/readiness/release ordering, and malformed/foreign lock preservation in `mcp/src/native-host/daemon.ts:200`, `mcp/src/native-host-production.ts:500`, and `tests/mcp-native-host-daemon.test.js:800`. |

## Precomputed Plan 10 Evidence

This is precomputed Plan 10 evidence and precomputed remediation evidence; the reviewer ran no commands. The source-only input reports the runner `scripts/run-phase63-focused-tests.mjs`, historical `87/87`, `200/200`, `1015/1015`, and `142/142`, plus final `101 platform/production CLI assertions`, `125 platform/registration assertions`, `229 install transaction assertions`, `152 CLI-routing assertions`, `54 bounded-output assertions`, `229 diagnostics assertions`, `229 daemon/entry assertions`, `111 background-wake assertions`, and the `1,014-assertion Phase 61–63 contract gate`. These frozen counts are not represented as commands run by this reviewer.

## Findings

| ID | Severity | Status | Resolution | Evidence |
|---|---|---|---|---|
| NONE | INFO | not-applicable | No source-actionable defect remains in the frozen implementation. | The reviewed production boundary and contract coverage are represented by `mcp/src/native-host-production.ts:1` and `tests/delegation-phase-contract.test.js:1`. |

## Residual Human Evidence Boundary

`.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` remains pending. This source-only verdict does not claim real OS installation/registry/launch behavior, Chrome service-worker wake behavior, visual rendering, keyboard focus, or screen-reader behavior. Those residual observations remain reserved for the authorized human/live workflow.
