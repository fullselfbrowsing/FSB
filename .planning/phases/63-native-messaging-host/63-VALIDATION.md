---
phase: 63
slug: native-messaging-host
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
reviewed: 2026-07-16
plan_count: 12
validation_tasks: 30
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for the one-shot native protocol, safe daemon handoff, exact-owned cross-platform registration, read-only diagnostics, and background-authoritative wake UI.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native serial Node assertion scripts, strict TypeScript build, VM-loaded service-worker scripts, handcrafted side-panel DOM harness, and source/artifact contract scripts |
| **Config file** | Root `package.json`; `mcp/package.json`; `mcp/tsconfig.json` |
| **Quick run command** | `node scripts/run-phase63-focused-tests.mjs` |
| **Full suite command** | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` |
| **Estimated runtime** | Focused slices under 45 seconds; guarded full suite several minutes |

The guarded full-suite wrapper is mandatory because the workspace contains unrelated user-owned planning deletions and modified generated artifacts. It must preserve their exact bytes and staging state. Genuine Chrome/native-host/OS behavior is not part of the automated gate.

---

## Sampling Rate

- **After every task commit:** Run the task's focused Node test or source/artifact gate; every compiled MCP seam builds only through `scripts/run-mcp-build-preserving-workspace.mjs`.
- **After every plan wave:** Run every Phase 63 focused suite accumulated through that wave plus `node scripts/verify-native-host-boundary.mjs` once it exists.
- **Before phase verification:** Require the focused matrix, package artifact checks, code/security/UI reviews, `node scripts/run-phase60-full-tests.mjs`, protected-hash checks, and clean Phase 63 index.
- **Max focused feedback latency:** 45 seconds.
- **No-watch/no-live rule:** Watch mode, a real Chrome profile, a live native registration, a real Windows registry, a real daemon wake, or human accessibility judgment never counts as automated evidence.

---

## Per-Task Verification Map

Every planned implementation/review/gate task maps to one exact row and has a deterministic automated command. Plans 63-01 through 63-10 are green; the independent reviews and guarded full-suite rows remain honestly pending until Plans 63-11 and 63-12 execute.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | NATIVE-01, NATIVE-03 | T63-02, T63-07 | Reviewable C17 bootstrap uses exact `CreateProcessW` authority, inherited native stdio, bounded sibling config, and no command-interpreter fallback | Windows artifact/source | `node tests/mcp-native-host-packaging.test.js --section windows-bootstrap` | ✅ source/harness | ✅ green |
| 63-01-02 | 01 | 1 | NATIVE-01, NATIVE-03 | T63-06 | Exact-pinned bundled production closure, lock receipt, and stable-runtime contract reject registry/cache/worktree dependence while the build wrapper restores protected output/index state | unit/package | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-packaging.test.js","--section","runtime-layout"]]'` | ✅ present | ✅ green |
| 63-01-03 | 01 | 1 | NATIVE-01, NATIVE-03 | T63-06, T63-07 | Required Windows CI/publish dependency version-binds both PE artifacts and blocks unsafe/incomplete tarballs | workflow/artifact | `node tests/mcp-native-host-packaging.test.js --section workflow-and-pack` | ✅ present | ✅ green |
| 63-02-01 | 02 | 2 | NATIVE-03 | T63-03 | `/health` exposes exact product/protocol/version identity and false-by-default serve readiness on the existing loopback port | unit/lifecycle | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-daemon.test.js","--section","health"],["node","tests/mcp-bridge-topology.test.js"]]'` | ✅ present | ✅ green |
| 63-02-02 | 02 | 2 | NATIVE-03 | T63-04 | Auth rotates only after successful bind/recovery; a bind loser cannot rotate, connect, push inventory, or advertise ready | concurrency/regression | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-daemon.test.js","--section","bind-race"],["node","tests/mcp-bridge-topology.test.js"]]'` | ✅ present | ✅ green |
| 63-03-01 | 03 | 3 | NATIVE-01, NATIVE-03 | T63-01 | Exact native-endian 4096-byte one-frame protocol validates bytes/schema/origin/argv before all side effects | unit/protocol | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-protocol.test.js","--section","framing-and-schema"]]'` | ✅ present | ✅ green |
| 63-03-02 | 03 | 3 | NATIVE-01, NATIVE-03 | T63-01, T63-02 | One-shot entry treats no-frame EOF as a no-op, writes at most one framed response, and never widens host authority | stream/lifecycle | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-protocol.test.js","--section","entry-lifetime"]]'` | ✅ present | ✅ green |
| 63-03-03 | 03 | 3 | NATIVE-01, NATIVE-03 | T63-02 | Source/compiled transitive graph gates reject agent/task/shell/auth/install/doctor/router and historical-shim imports | source/package | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/verify-native-host-boundary.mjs","--all"],["node","tests/mcp-native-host-packaging.test.js","--section","import-boundary"]]'` | ✅ present | ✅ green |
| 63-04-01 | 04 | 4 | NATIVE-01, NATIVE-03 | T63-02, T63-03, T63-05 | Exact health classification, tokened lock, bounded stale recovery, and one shell-free `serve` spawn cannot kill unrelated work | unit/concurrency | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-daemon.test.js"]]'` | ✅ present | ✅ green |
| 63-04-02 | 04 | 4 | NATIVE-01, NATIVE-03 | T63-01, T63-02, T63-12 | Production host composes validated protocol and reachability only, responds once, and exits without delegation authority | integration/boundary | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-protocol.test.js"],["node","tests/mcp-native-host-daemon.test.js"],["node","scripts/verify-native-host-boundary.mjs","--all"]]'` | ✅ present | ✅ green |
| 63-05-01 | 05 | 5 | NATIVE-01, NATIVE-04 | T63-07, T63-08 | Pure macOS/Linux/Windows registration facts validate exact paths/origin and detect typed Windows view shadowing without HKLM | unit/platform | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-install.test.js","--section","platform-and-registration"]]'` | ✅ present | ✅ green |
| 63-05-02 | 05 | 5 | NATIVE-01, NATIVE-04 | T63-06, T63-07 | Tokened exact bundled-package materialization proves clean-cache offline/no-network closure and publishes a stable owned runtime atomically | unit/transaction | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-install.test.js","--section","runtime-transaction"]]'` | ✅ present | ✅ green |
| 63-05-03 | 05 | 5 | NATIVE-01, NATIVE-04 | T63-08 | Idempotent install and exact-owned uninstall refuse split/foreign/symlink state and preserve adjacent artifacts | unit/platform | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-install.test.js"]]'` | ✅ present | ✅ green |
| 63-06-01 | 06 | 6 | NATIVE-01, NATIVE-04 | T63-08 | Native CLI target routes before list/all/client expansion and rejects mixed/unknown flags with zero mutation | CLI/contract | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-install-platforms.test.js"],["node","tests/mcp-native-host-install.test.js","--section","cli-routing"]]'` | ✅ present | ✅ green |
| 63-06-02 | 06 | 6 | NATIVE-01, NATIVE-04 | T63-06, T63-07, T63-08, T63-09 | Help/result/refusal output is bounded and factual while ordinary install/uninstall remains byte-compatible | CLI/security | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-install-platforms.test.js"],["node","tests/mcp-native-host-install.test.js","--section","cli-output"]]'` | ✅ present | ✅ green |
| 63-07-01 | 07 | 7 | NATIVE-04 | T63-03, T63-09 | One read-only snapshot reports closed native facts; browser projection reconstructs only safe enums without local paths/reasons | diagnostics/security | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-diagnostics-status.test.js","--section","native-host-snapshot"]]'` | ✅ present | ✅ green |
| 63-07-02 | 07 | 7 | NATIVE-04 | T63-09 | Human and JSON doctor projections share one snapshot/section order and preserve historical layer/exit semantics | CLI/contract | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-diagnostics-status.test.js"],["node","tests/mcp-version-parity.test.js"]]'` | ✅ present | ✅ green |
| 63-08-01 | 08 | 8 | NATIVE-02, NATIVE-03 | T63-10, T63-11, T63-12 | Background-only controller performs silent no-message probe and one correlated/coalesced bounded wake with late-result fencing | VM/unit | `node tests/native-host-background-wake.test.js --section controller` | ✅ present | ✅ green |
| 63-08-02 | 08 | 8 | NATIVE-02, NATIVE-03 | T63-10, T63-11, T63-12 | Only exact offline preflight may wake; bridge readiness leads to one unchanged preflight rerun and no replay | VM/integration | `node tests/native-host-background-wake.test.js && node tests/mcp-bridge-background-dispatch.test.js` | ✅ present | ✅ green |
| 63-08-03 | 08 | 8 | NATIVE-02, NATIVE-03 | T63-10 | Manifest adds only `nativeMessaging`; native API/host-name authority stays in background/helper only | manifest/source | `node tests/native-host-background-wake.test.js --section manifest-and-authority && node tests/mcp-bridge-background-dispatch.test.js` | ✅ present | ✅ green |
| 63-09-01 | 09 | 9 | NATIVE-02 | T63-11, T63-12 | One attempt-scoped checking card preserves raw composer/focus and permanently invalidates an edited pending intent | DOM/accessibility | `node tests/delegation-sidepanel-ui.test.js --section native-wake-checking` | ✅ present | ✅ green |
| 63-09-02 | 09 | 9 | NATIVE-02 | T63-09, T63-11, T63-12 | UI converges through existing ready/unpaired/offline branches with exact copy/tokens/narrow/forced-color/reduced-motion rules | DOM/source | `node tests/delegation-sidepanel-ui.test.js && node tests/native-host-background-wake.test.js` | ✅ present | ✅ green |
| 63-10-01 | 10 | 10 | NATIVE-01–04 | T63-12 | One ledger keeps every genuine OS/Chrome/accessibility scenario unchecked, human_needed, pending, and evidence-empty | artifact/contract | `node tests/delegation-phase-contract.test.js --section phase63-uat-ledger` | ✅ present | ✅ green |
| 63-10-02 | 10 | 10 | NATIVE-01–04 | T63-01–T63-12 | Focused/root/CI/package/boundary gates run exactly once in protected serial order without dropping prior contracts | integration/source | `node scripts/run-phase63-focused-tests.mjs` | ✅ present | ✅ green |
| 63-10-03 | 10 | 10 | NATIVE-01–04 | T63-01–T63-12 | Mechanical contract maps all 30 tasks, four requirements, 25 decisions, 12 threats, ASVS themes, key links, and forbidden patterns against fresh compiled output while restoring the complete generated graph/index | artifact/contract | `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/delegation-phase-contract.test.js"],["node","tests/mcp-version-parity.test.js"]]'` | ✅ present | ✅ green |
| 63-11-01 | 11 | 11 | NATIVE-01–04 | T63-01–T63-12 | Independent code review covers final diff/regressions and cannot pass with unresolved HIGH/CRITICAL findings | code review/artifact | `node scripts/run-phase63-focused-tests.mjs && node scripts/verify-phase63-review-artifacts.mjs --kind code` | ✅ runner / ❌ review verifier/artifact | ⬜ pending |
| 63-11-02 | 11 | 11 | NATIVE-01–04 | T63-01–T63-12 | ASVS L1 security review dispositions every threat, then validates compiled boundary/protocol/install evidence inside one restoring build lifecycle | security review | `node scripts/verify-phase63-review-artifacts.mjs --kind security && node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/verify-native-host-boundary.mjs"],["node","tests/mcp-native-host-protocol.test.js"],["node","tests/mcp-native-host-install.test.js"]]'` | ❌ review verifier/artifact | ⬜ pending |
| 63-11-03 | 11 | 11 | NATIVE-01–04 | T63-09–T63-12 | Six-pillar UI review proves source/DOM contract while leaving rendered/accessibility UAT pending | UI review/artifact | `node tests/delegation-sidepanel-ui.test.js && node tests/native-host-background-wake.test.js && node scripts/verify-phase63-review-artifacts.mjs --kind ui` | ❌ review verifier/artifact | ⬜ pending |
| 63-12-01 | 12 | 12 | NATIVE-01–04 | T63-01–T63-12 | Final focused/package/boundary/review gates pass once against the exact reviewed diff with protected workspace/index unchanged | final integration | `node scripts/run-phase63-focused-tests.mjs && node scripts/verify-phase63-review-artifacts.mjs` | ✅ runner / ❌ review verifier | ⬜ pending |
| 63-12-02 | 12 | 12 | NATIVE-01–04 | T63-01–T63-12 | Wrapper negative fixtures pass, then the existing guarded repository suite runs inside complete `mcp/build/**` and raw-index snapshot/restore without promoting human evidence | full regression | `node tests/mcp-native-host-packaging.test.js --section workspace-preserving-build && node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` | ✅ harness/wrapper | ⬜ pending |

*Status: ✅ green only after the mapped command passed · ⬜ pending for unexecuted review/full-suite work*

---

## Threat References

| Ref | Threat | Required control |
|-----|--------|------------------|
| T63-01 | Malformed, oversized, multi-frame, or prototype-bearing native input causes work before rejection | Exact byte cap, one-frame settle, closed own-property schema, origin/argv validation before side effects |
| T63-02 | Native host gains agent/task or shell authority | Core-only transitive import allowlist and one exact absolute executable/`serve` argv tuple with `shell:false` |
| T63-03 | Wrong or partially initialized process occupies the serve port | Bounded `/health` service/protocol/readiness validation; never spawn over a wrong responder |
| T63-04 | Losing concurrent daemon rotates the active bridge secret | Rotate only after successful loopback bind/recovery and before bridge connect; bind loser never prepares auth |
| T63-05 | Concurrent/stale wake creates process storms or kills unrelated work | Tokened atomic lock, readiness polling, stale quarantine, exact-token release, no PID signaling |
| T63-06 | Registered launcher disappears with npm cache/worktree or is replaced | Stable owned runtime, absolute real paths, package/version/artifact validation, registration published last |
| T63-07 | Windows falls back to an unsafe command-interpreter launcher | Version-bound packaged `.exe`; no `.cmd`/`.bat` fallback; synthetic artifact/argv contract gate |
| T63-08 | Install/uninstall overwrites or deletes foreign/adjacent user state | Symlink/type/ownership/view checks, closed mismatch state, exact-owned idempotent mutation only |
| T63-09 | Doctor leaks paths/registry/raw exceptions/secrets to the browser or mutates state | One bounded read-only snapshot, CLI-only expected location, browser-safe omission, sentinel non-leak tests |
| T63-10 | Boot or non-offline paths wake the daemon | No-message boot probe and offline-preflight-only wake authority in background |
| T63-11 | Timeout, late response, or concurrent callers replay stale intent | One attempt token/promise, timeout/late-ignore/cooldown, one preflight rerun, captured-text invalidation |
| T63-12 | `started`/`already_running` becomes pairing/provider/delegation authority | Authenticated bridge readiness plus existing preflight remain authoritative; no optimistic state mutation |

---

## Wave 0 Requirements

- [x] `tests/mcp-native-host-protocol.test.js` — framing, exact request/response/origin/argv, no-frame EOF, trailing/multiple input, stdout purity, and no-side-effect negative controls.
- [x] `tests/mcp-native-host-daemon.test.js` — exact health/readiness, post-bind auth ordering, shell-free spawn, tokened locking, concurrency, stale recovery, and no-kill assertions.
- [x] `tests/mcp-native-host-install.test.js` — platform paths/registry views, exact manifest/origin, stable runtime/artifacts, atomic/idempotent transaction, symlink/foreign refusal, and exact-owned uninstall.
- [x] `tests/native-host-background-wake.test.js` — silent probe, offline-only wake, one-flight timeout/backoff, bridge wait, one preflight rerun, convergence, and no replay.
- [x] `scripts/verify-native-host-boundary.mjs` — transitive import and exact spawn-authority gate.
- [x] Diagnostics/install/background/UI/topology/version/phase contract harnesses are extended and blocking.
- [x] `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` — genuine OS/native/Chrome/accessibility scenarios remain unchecked `human_needed` with empty evidence.

No new JavaScript test runner, browser driver, live daemon, real registry, or third-party runtime package is required for deterministic validation. A Windows launcher build job/artifact may be added only as the release packaging proof required by NATIVE-01.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| macOS user-scope install plus published/unpacked Chrome boot probe, offline wake, already-running attach, doctor, and uninstall | NATIVE-01–04 | Requires a genuine Chrome profile, native registration, installed package, and daemon lifecycle | At milestone end, execute the committed UAT scenario and record sanitized install/doctor/wake/uninstall evidence without manifest contents, usernames, or secrets |
| Linux Google Chrome user-scope install/wake/attach/doctor/uninstall | NATIVE-01–04 | Requires a genuine Linux desktop/browser/native host | Run only in the milestone-end sweep and retain platform/version/result evidence |
| Windows HKCU registry-view behavior and packaged `.exe` wake/attach/doctor/uninstall | NATIVE-01, NATIVE-03, NATIVE-04 | Injected adapters cannot prove actual Chrome/registry/launcher behavior | Run only in the milestone-end sweep on supported Windows/Chrome and retain sanitized evidence |
| Rendered checking → ready/unpaired/offline transitions in light/dark/narrow/zoom/forced-colors/reduced-motion | NATIVE-02 | Pixel/layout/platform rendering needs live Chrome and human judgment | Run the approved `63-UI-SPEC.md` matrix at milestone end |
| Keyboard focus retention and screen-reader announcement order | NATIVE-02 | Assistive-technology behavior needs a live browser/AT session | Run at milestone end; preserve exact focus/announcement evidence |

Every row remains `human_needed`; automated/source evidence must not be represented as a live pass.

---

## Validation Sign-Off

- [x] Final PLAN task ids match the per-task map.
- [x] All tasks have an automated verify command or explicit Wave 0 dependency.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Wave 0 covers every missing focused fixture and boundary script.
- [x] No watch-mode, real browser/native registration, live registry, live daemon, or retry-to-green command is used as automated evidence.
- [x] Guarded full-suite execution preserves unrelated dirty/staged state and protected hashes.
- [x] Manual checks remain pending at the milestone-end gate and are never fabricated.
- [x] `nyquist_compliant: true` is set only after independent plan-checker approval.

**Approval:** approved 2026-07-16 after independent plan-checker PASS (12 plans, 30 tasks, 12 serialized waves, 0 blockers, 0 warnings)
