---
phase: 63
slug: native-messaging-host
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-16
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for the one-shot native protocol, safe daemon handoff, exact-owned cross-platform registration, read-only diagnostics, and background-authoritative wake UI.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native serial Node assertion scripts, strict TypeScript build, VM-loaded service-worker scripts, handcrafted side-panel DOM harness, and source/artifact contract scripts |
| **Config file** | Root `package.json`; `mcp/package.json`; `mcp/tsconfig.json` |
| **Quick run command** | `npm --prefix mcp run build && node tests/mcp-native-host-protocol.test.js && node tests/mcp-native-host-daemon.test.js` |
| **Full suite command** | `node scripts/run-phase60-full-tests.mjs` |
| **Estimated runtime** | Focused slices under 45 seconds; guarded full suite several minutes |

The guarded full-suite wrapper is mandatory because the workspace contains unrelated user-owned planning deletions and modified generated artifacts. It must preserve their exact bytes and staging state. Genuine Chrome/native-host/OS behavior is not part of the automated gate.

---

## Sampling Rate

- **After every task commit:** Run the task's focused Node test or source/artifact gate; every touched MCP TypeScript seam also runs `npm --prefix mcp run build`.
- **After every plan wave:** Run every Phase 63 focused suite accumulated through that wave plus `node scripts/verify-native-host-boundary.mjs` once it exists.
- **Before phase verification:** Require the focused matrix, package artifact checks, code/security/UI reviews, `node scripts/run-phase60-full-tests.mjs`, protected-hash checks, and clean Phase 63 index.
- **Max focused feedback latency:** 45 seconds.
- **No-watch/no-live rule:** Watch mode, a real Chrome profile, a live native registration, a real Windows registry, a real daemon wake, or human accessibility judgment never counts as automated evidence.

---

## Per-Task Verification Map

The rows below define the required validation slices. Final numeric task ids and plan/wave columns must be reconciled immediately after the planner writes the PLAN files; no implementation task may lack one of these automated slices.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-TBD-01 | TBD | 1 | NATIVE-01, NATIVE-03 | T63-01, T63-02 | Closed 4096-byte one-frame protocol validates exact origin/argv before all health or process side effects and writes only framed stdout | unit/protocol | `npm --prefix mcp run build && node tests/mcp-native-host-protocol.test.js` | ❌ W0 | ⬜ pending |
| 63-TBD-02 | TBD | 1 | NATIVE-03 | T63-03, T63-04 | Product-specific bounded readiness and post-bind auth preparation prevent wrong-port attachment and bind-loser secret rotation | unit/lifecycle | `npm --prefix mcp run build && node tests/mcp-native-host-daemon.test.js && node tests/mcp-bridge-topology.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 63-TBD-03 | TBD | 1 | NATIVE-03 | T63-02, T63-05 | Tokened wake coalescing launches one exact shell-free `serve` tuple, never kills an independent process, and exits after one response | unit/concurrency | `npm --prefix mcp run build && node tests/mcp-native-host-daemon.test.js && node scripts/verify-native-host-boundary.mjs` | ❌ W0 | ⬜ pending |
| 63-TBD-04 | TBD | 2 | NATIVE-01 | T63-06, T63-07 | Stable package-owned launchers and runtime materialization survive source/cache removal; package inspection proves POSIX and Windows artifacts | artifact/contract | `npm --prefix mcp run build && node tests/mcp-native-host-install.test.js && node tests/mcp-version-parity.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 63-TBD-05 | TBD | 2 | NATIVE-01, NATIVE-04 | T63-06, T63-08 | macOS/Linux/Windows adapters publish one exact-origin user registration atomically, refuse symlink/foreign/shadow state, and are idempotent | unit/platform | `npm --prefix mcp run build && node tests/mcp-native-host-install.test.js && node tests/mcp-install-platforms.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 63-TBD-06 | TBD | 2 | NATIVE-04 | T63-08 | Uninstall removes only an exact owned registration/runtime and preserves every adjacent or mismatched artifact | unit/platform | `npm --prefix mcp run build && node tests/mcp-native-host-install.test.js && node tests/mcp-install-platforms.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 63-TBD-07 | TBD | 2 | NATIVE-04 | T63-09 | One read-only doctor snapshot reports bounded local facts, preserves overall semantics, and omits raw local/secret data from browser-safe projections | CLI/security | `npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-version-parity.test.js` | ✅ extend | ⬜ pending |
| 63-TBD-08 | TBD | 3 | NATIVE-02 | T63-10, T63-11 | Boot probe sends no frame and renders nothing; authoritative offline preflight alone starts one timed/coalesced wake and reruns preflight once | VM/background | `node tests/native-host-background-wake.test.js && node tests/mcp-bridge-background-dispatch.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 63-TBD-09 | TBD | 3 | NATIVE-02, NATIVE-03 | T63-10, T63-12 | Native lifecycle facts never assert pairing/provider/task success and never replay messages, start requests, gestures, sessions, feeds, or tab state | VM/source contract | `node tests/native-host-background-wake.test.js && node tests/delegation-phase-contract.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 63-TBD-10 | TBD | 3 | NATIVE-02 | T63-11, T63-12 | One truthful checking card preserves composer/focus, invalidates edited intent, and converges on exact ready/unpaired/offline states with reduced-motion/forced-color rules | DOM/accessibility contract | `node tests/delegation-sidepanel-ui.test.js && node tests/native-host-background-wake.test.js` | ✅ extend/❌ W0 | ⬜ pending |
| 63-TBD-11 | TBD | 4 | NATIVE-01–04 | T63-01–T63-12 | Root/package/phase contracts include every focused gate once, preserve Phase 59–62 authority, and keep all genuine UAT pending | integration/artifact | `node tests/delegation-phase-contract.test.js && node tests/mcp-version-parity.test.js && node scripts/verify-native-host-boundary.mjs` | ✅ extend/❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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

- [ ] `tests/mcp-native-host-protocol.test.js` — framing, exact request/response/origin/argv, no-frame EOF, trailing/multiple input, stdout purity, and no-side-effect negative controls.
- [ ] `tests/mcp-native-host-daemon.test.js` — exact health/readiness, post-bind auth ordering, shell-free spawn, tokened locking, concurrency, stale recovery, and no-kill assertions.
- [ ] `tests/mcp-native-host-install.test.js` — platform paths/registry views, exact manifest/origin, stable runtime/artifacts, atomic/idempotent transaction, symlink/foreign refusal, and exact-owned uninstall.
- [ ] `tests/native-host-background-wake.test.js` — silent probe, offline-only wake, one-flight timeout/backoff, bridge wait, one preflight rerun, convergence, and no replay.
- [ ] `scripts/verify-native-host-boundary.mjs` — transitive import and exact spawn-authority gate.
- [ ] Extend diagnostics/install/background/UI/topology/version/phase contract harnesses before relying on new production behavior.
- [ ] `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` — genuine OS/native/Chrome/accessibility scenarios remain unchecked `human_needed` with empty evidence.

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

- [ ] Final PLAN task ids match the per-task map.
- [ ] All tasks have an automated verify command or explicit Wave 0 dependency.
- [ ] Sampling continuity has no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every missing focused fixture and boundary script.
- [ ] No watch-mode, real browser/native registration, live registry, live daemon, or retry-to-green command is used as automated evidence.
- [ ] Guarded full-suite execution preserves unrelated dirty/staged state and protected hashes.
- [ ] Manual checks remain pending at the milestone-end gate and are never fabricated.
- [ ] `nyquist_compliant: true` is set only after independent plan-checker approval.

**Approval:** pending plan generation and independent plan-checker review
