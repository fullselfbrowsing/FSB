---
phase: 63-native-messaging-host
review_kind: ui
reviewer: gsd-ui-auditor
prompt_version: phase63-ui-v1
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
output_path: .planning/phases/63-native-messaging-host/63-UI-REVIEW.md
live_uat: pending
findings_critical: 0
findings_high: 0
findings_medium: 0
findings_low: 0
findings_info: 0
unresolved_critical: 0
unresolved_high: 0
---

# Phase 63 UI Review

## Review Identity

- `implementation_base`: `27bddf00517738c87fcc6ca4b27940e8121f2124`
- `implementation_end`: `6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887`
- `compatibility_commit`: `6d868ee1348219f95fd0cc0e5f5f3f9cf9fc6887`
- `implementation_bytes`: `887858`
- `implementation_files`: `56`
- `implementation_manifest_sha256`: `5135dbf243f0f123f60217584cd2ae8ab6865c78c85fcdae20464a539b27dcc7`
- `implementation_sha256`: `24072007a6af1754e496804471c3b21e9afd01f20bcdec9bcfaa9c694e5e46d6`
- `implementation_index_sha256`: `ab66af77cbb8989a3d76425afa36cc10a75db80530f70800c3f443f047077c23`
- `implementation_worktree_index_sha256`: `3120d40b00f57e0a29cbd774baaaaac798147ab131b37114b8781a63d801ae47`
- Compatibility evidence is rooted in `tests/delegation-phase-contract.test.js`; this source-only reviewer did not recompute the frozen identity or execute that gate.

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
- `.planning/phases/63-native-messaging-host/63-UI-SPEC.md`
- `.planning/phases/63-native-messaging-host/63-PATTERNS.md`
- `.planning/phases/63-native-messaging-host/63-VALIDATION.md`
- `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-CONTEXT.md`

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

- `.planning/phases/63-native-messaging-host/63-UI-REVIEW.md`

## Six-Pillar Audit

| Pillar | Source-only result | Evidence |
|---|---|---|
| Visual hierarchy | PASS | The renderer reuses one existing state card, clears the existing feed/control region, and creates one semantic `h2` with visible heading/body copy rather than a second surface (`extension/ui/sidepanel.js:1501`, `extension/ui/sidepanel.js:1510`, `extension/ui/sidepanel.js:1520`, `tests/delegation-sidepanel-ui.test.js:720`). |
| Interaction | PASS | Duplicate Send is gated while preflight/continuation is pending, the composer stays editable, and exact intent plus raw-byte/revision checks fence every continuation (`extension/ui/sidepanel.js:656`, `extension/ui/sidepanel.js:663`, `extension/ui/sidepanel.js:3730`, `extension/ui/sidepanel.js:3740`). |
| Responsiveness | PASS for source contract; human rendering pending | The checking heading/body wrap at the 350 px breakpoint and reuse the full-width card; increased-zoom visual behavior remains explicitly human-owned (`extension/ui/sidepanel.css:1738`, `extension/ui/sidepanel.css:2111`, `extension/ui/sidepanel.css:2119`, `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:137`). |
| Accessibility | PASS for DOM/source contract; assistive-technology evidence pending | The run region becomes busy, the spinner is decorative, the card is not a live region, and the existing single polite announcer remains the only status region (`extension/ui/sidepanel.js:1509`, `extension/ui/sidepanel.js:1515`, `extension/ui/sidepanel.js:1529`, `tests/delegation-sidepanel-ui.test.js:409`). |
| Resilience | PASS | Wrong, extra-field, duplicate, late, boot-restored, edited, reverted, malformed, offline, and unpaired paths fail closed or converge through existing states without optimistic mutation (`tests/delegation-sidepanel-ui.test.js:695`, `tests/delegation-sidepanel-ui.test.js:741`, `tests/delegation-sidepanel-ui.test.js:745`, `tests/delegation-sidepanel-ui.test.js:1097`). |
| Design-system fidelity | PASS | Phase 63 uses the shared info, surface, text, space, typography, and focus-token system; no new component registry or dependency is introduced (`extension/ui/sidepanel.css:1771`, `extension/ui/sidepanel.css:1815`, `extension/ui/sidepanel.css:1856`, `.planning/phases/63-native-messaging-host/63-UI-SPEC.md:186`). |

## UI-SPEC Acceptance Criteria

| Criterion | Result | Source/DOM evidence |
|---|---|---|
| UIAC-01 | PASS | Boot composition is probe-only, emits no UI event, never calls actual wake, and a panel without a pending Send rejects a checking event (`tests/native-host-background-wake.test.js:627`, `tests/native-host-background-wake.test.js:637`, `tests/delegation-sidepanel-ui.test.js:751`). |
| UIAC-02 | PASS | The offline-triggered attempt renders one truthful information-state card with exact heading, body, header status, and announcement; it makes no start, pairing, provider, or submission claim (`extension/ui/sidepanel.js:1512`, `extension/ui/sidepanel.js:1532`, `extension/ui/sidepanel.js:1535`, `extension/ui/sidepanel.js:1544`). |
| UIAC-03 | PASS | The pending intent captures raw composer bytes and edit revision, keeps Send disabled without locking the composer, and creates no feed/action mutation before authority settles (`extension/ui/sidepanel.js:636`, `tests/delegation-sidepanel-ui.test.js:842`, `tests/delegation-sidepanel-ui.test.js:845`, `tests/delegation-sidepanel-ui.test.js:727`). |
| UIAC-04 | PASS | Offline, runtime-unavailable, malformed, timeout, and rerun failure converge through the existing offline renderer with the exact alert, doctor literal, and recovery actions (`extension/ui/sidepanel.js:1552`, `extension/ui/sidepanel.js:1600`, `extension/ui/sidepanel.js:1617`, `tests/delegation-sidepanel-ui.test.js:1097`). |
| UIAC-05 | PASS | Reachable-but-unpaired retains the exact existing pairing heading/body and setup action, with no native pairing transport or new state (`extension/ui/sidepanel.js:1568`, `tests/delegation-sidepanel-ui.test.js:945`, `tests/delegation-sidepanel-ui.test.js:955`, `tests/native-host-background-wake.test.js:792`). |
| UIAC-06 | PASS | Side-panel checking accepts only the closed attempt/intent event, parses no native detail, and owns no native, process, shell, platform, registry, manifest, binary, secret, or task authority (`extension/ui/sidepanel.js:2315`, `tests/delegation-sidepanel-ui.test.js:620`, `tests/delegation-sidepanel-ui.test.js:623`, `tests/native-host-background-wake.test.js:591`). |
| UIAC-07 | PASS for deterministic source/DOM contract; live evidence pending | Token-only theme styling, narrow wrapping, no focus move in the DOM harness, forced-colors cues, and reduced-motion suppression are pinned; real Chrome rendering, focus, zoom, and screen-reader behavior remain pending (`tests/delegation-sidepanel-ui.test.js:631`, `tests/delegation-sidepanel-ui.test.js:635`, `tests/delegation-sidepanel-ui.test.js:637`, `tests/delegation-sidepanel-ui.test.js:639`). |

## Locked Source Checks

| Marker | Result | Evidence |
|---|---|---|
| UI-CHECK-COPY | PASS | Exact fixed copy is present: `Checking local agent service`; `FSB is trying to make the local agent service available. Your message has not been sent.`; `Checking local agent service. Your message has not been sent.`; and `Checking agent service` (`tests/delegation-sidepanel-ui.test.js:599`, `extension/ui/sidepanel.js:1532`, `extension/ui/sidepanel.js:1538`, `extension/ui/sidepanel.js:1547`). |
| UI-CHECK-RAW-REVISION | PASS | The current intent carries raw text plus a monotonic edit revision and compares both before continuation (`extension/ui/sidepanel.js:548`, `extension/ui/sidepanel.js:650`, `extension/ui/sidepanel.js:663`, `extension/ui/sidepanel.js:3696`). |
| UI-CHECK-REVERT | PASS | An edit immediately clears pending state, and edit-then-revert cannot revive captured bytes (`tests/delegation-sidepanel-ui.test.js:849`, `tests/delegation-sidepanel-ui.test.js:853`, `tests/delegation-sidepanel-ui.test.js:855`, `tests/delegation-sidepanel-ui.test.js:872`). |
| UI-CHECK-FENCES | PASS | Exact intent and attempt identities gate the event, and the continuation remains fenced through asynchronous consent lookup (`extension/ui/sidepanel.js:1496`, `extension/ui/sidepanel.js:2315`, `tests/delegation-sidepanel-ui.test.js:1228`, `tests/delegation-sidepanel-ui.test.js:1240`). |
| UI-CHECK-STALE | PASS | Wrong-intent, extra-key, duplicate, post-settlement, boot/restored, and raw-byte-mismatch deliveries are inert (`tests/delegation-sidepanel-ui.test.js:695`, `tests/delegation-sidepanel-ui.test.js:700`, `tests/delegation-sidepanel-ui.test.js:741`, `tests/delegation-sidepanel-ui.test.js:876`). |
| UI-CHECK-SPINNER | PASS | Exactly one decorative spinner is created beside visible text and carries `aria-hidden="true"` (`extension/ui/sidepanel.js:1525`, `extension/ui/sidepanel.js:1529`, `tests/delegation-sidepanel-ui.test.js:721`). |
| UI-CHECK-NO-NEW-SURFACE | PASS | The renderer creates no action row, page, card, CTA, progress control, success toast, second live region, or focus move; it reuses the existing card and announcer (`tests/delegation-sidepanel-ui.test.js:626`, `tests/delegation-sidepanel-ui.test.js:727`, `tests/delegation-sidepanel-ui.test.js:729`, `tests/delegation-sidepanel-ui.test.js:734`). |
| UI-CHECK-TOKENS | PASS | Checking uses information `info semantics` through `var(--fsb-info)` for the existing card border and spinner, while typography and spacing reuse shared FSB tokens (`extension/ui/sidepanel.css:1777`, `extension/ui/sidepanel.css:1781`, `extension/ui/sidepanel.css:1816`, `extension/ui/sidepanel.css:1824`). |
| UI-CHECK-NARROW-ZOOM | PASS for source contract; live zoom pending | `max-width: 350px` wrapping and overflow protection are present; visual zoom behavior is reserved for human Chrome UAT (`extension/ui/sidepanel.css:2111`, `extension/ui/sidepanel.css:2119`, `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:146`, `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:147`). |
| UI-CHECK-FORCED-COLORS | PASS for source contract | Forced-colors maps the checking border, heading, body, and spinner to `CanvasText`, retaining a non-background cue (`extension/ui/sidepanel.css:2146`, `extension/ui/sidepanel.css:2152`, `extension/ui/sidepanel.css:2158`). |
| UI-CHECK-REDUCED-MOTION | PASS for source contract | Reduced-motion removes spinner animation, transition, and transform (`extension/ui/sidepanel.css:2170`, `extension/ui/sidepanel.css:2175`, `tests/delegation-sidepanel-ui.test.js:639`). |
| UI-CHECK-UNCHANGED-FLOWS | PASS | Ready/trusted continues once through the existing start path, consent uses the existing consent renderer, offline uses the exact alert fallback, and unpaired retains its existing state (`tests/delegation-sidepanel-ui.test.js:1057`, `tests/delegation-sidepanel-ui.test.js:1082`, `tests/delegation-sidepanel-ui.test.js:924`, `tests/delegation-sidepanel-ui.test.js:945`). |

The accessibility lock is explicit: the containing run region uses `aria-busy`, the spinner uses `aria-hidden`, and the sole existing announcer retains `role="status"`; the checking card itself receives neither alert nor live-region semantics (`extension/ui/sidepanel.js:1509`, `extension/ui/sidepanel.js:1515`, `tests/delegation-sidepanel-ui.test.js:411`, `tests/delegation-sidepanel-ui.test.js:728`).

## Precomputed Plan 10 Evidence

This is a source-only review of precomputed Plan 10 evidence and precomputed remediation evidence; the reviewer ran no commands. The frozen evidence names `scripts/run-phase63-focused-tests.mjs` as the orchestrated matrix and keeps all genuine OS/browser results outside automated proof (`.planning/phases/63-native-messaging-host/63-10-SUMMARY.md:63`, `.planning/phases/63-native-messaging-host/63-10-SUMMARY.md:97`).

- Plan 10 records `87/87`, `200/200`, `1015/1015`, and `142/142` (`.planning/phases/63-native-messaging-host/63-10-SUMMARY.md:114`, `.planning/phases/63-native-messaging-host/63-10-SUMMARY.md:115`, `.planning/phases/63-native-messaging-host/63-10-SUMMARY.md:117`).
- Precomputed remediation evidence records `101 platform/production CLI assertions`, `125 platform/registration assertions`, `229 install transaction assertions`, `152 CLI-routing assertions`, and `54 bounded-output assertions` (`.planning/phases/63-native-messaging-host/63-06-SUMMARY.md:187`, `.planning/phases/63-native-messaging-host/63-05-SUMMARY.md:196`).
- Precomputed remediation evidence also records `229 diagnostics assertions`, `229 daemon/entry assertions`, `111 background-wake assertions`, and the `1,014-assertion Phase 61–63 contract gate` (`.planning/phases/63-native-messaging-host/63-07-SUMMARY.md:150`, `.planning/phases/63-native-messaging-host/63-04-SUMMARY.md:211`).
- The registry-helper remediation records a `15-assertion adversarial registry-helper suite` and `294 runtime transaction assertions` (`.planning/phases/63-native-messaging-host/63-06-SUMMARY.md:196`).
- The frozen compatibility evidence supplied to this review records a `1,016-assertion compatibility rerun` rooted in `tests/delegation-phase-contract.test.js`; it was not re-executed by this reviewer.
- Genuine Windows compilation remains CI-owned: `local MSVC execution not claimed` (`.planning/phases/63-native-messaging-host/63-01-SUMMARY.md:212`).

## Findings

| ID | Severity | Status | Resolution | Evidence |
|---|---|---|---|---|
| NONE | INFO | not-applicable | No source/DOM-contract deviation was found; live rendering and assistive-technology evidence remain pending and are not converted into a finding or a pass claim. | `extension/ui/sidepanel.js:1496`; `tests/delegation-sidepanel-ui.test.js:597` |

## Residual Human Evidence Boundary

The ledger `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` remains `pending` and human-owned. A person must still exercise the real OS and Chrome paths, visual rendering across light/dark/narrow/zoom/forced-colors/reduced-motion modes, keyboard focus behavior, and screen-reader announcement order. Source inspection and precomputed DOM tests do not satisfy those live checks (`.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:137`, `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:157`, `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md:177`).
