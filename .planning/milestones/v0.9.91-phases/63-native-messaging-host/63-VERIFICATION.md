---
phase: 63-native-messaging-host
verified: 2026-07-20T12:14:39Z
status: human_needed
score: 4/4 roadmap success criteria verified (49 plan-level must-have truths accounted via direct checks and re-executed gates)
overrides_applied: 0
human_verification:
  - test: "UAT63-01 — macOS published-id install, wake, attach, doctor, and uninstall (see 63-HUMAN-UAT.md)"
    expected: "User-scope registration accepts only the published origin; boot stays probe-only; one authorized offline intent wakes or attaches; doctor reports bounded state; uninstall preserves unrelated files"
    why_human: "Requires a genuine Chrome profile, live native registration, installed package, and daemon lifecycle; deferred by user to the v0.9.91 milestone-end sweep"
  - test: "UAT63-02 — macOS unpacked explicit id and allowlist refusal (see 63-HUMAN-UAT.md)"
    expected: "Explicit unpacked id works only on exact match; allowlist mismatch is reported and refused without wildcarding, repair, wake, or delegation"
    why_human: "Live Chrome allowlist enforcement cannot be exercised by injected adapters; deferred by user to milestone-end"
  - test: "UAT63-03 — Linux Google Chrome install, wake, attach, doctor, and uninstall (see 63-HUMAN-UAT.md)"
    expected: "Linux registration, shell-free launcher execution, offline wake, attach, doctor, and exact-owned uninstall behave as specified without system-scope mutation"
    why_human: "Requires a genuine Linux desktop/browser/native host; deferred by user to milestone-end"
  - test: "UAT63-04 — Windows x64 HKCU views and packaged executable lifecycle (see 63-HUMAN-UAT.md)"
    expected: "Canonical HKCU 32-bit view mutated only; 64-bit shadow reported as mismatch; packaged .exe forwards the native lifecycle safely"
    why_human: "Injected registry adapters cannot prove actual Chrome/registry/launcher behavior; deferred by user to milestone-end"
  - test: "UAT63-05 — Windows arm64 packaged artifact and bootstrap behavior (see 63-HUMAN-UAT.md)"
    expected: "Version-matched arm64 PE bootstrap launches only its owned Node host tuple and fails closed for invalid state"
    why_human: "Requires supported Windows arm64 hardware and a release-built executable; deferred by user to milestone-end"
  - test: "UAT63-06 — Published and unpacked Chrome outcome and no-replay matrix (see 63-HUMAN-UAT.md)"
    expected: "Each genuine host/daemon outcome converges on the specified fallback/ready/unpaired state; stale, edited, canceled, or superseded attempts never replay"
    why_human: "Genuine Chrome native-messaging outcomes (host missing, malformed reply, timeout) cannot be produced by the VM harness; deferred by user to milestone-end"
  - test: "UAT63-07 — Rendered themes, narrow layout, zoom, contrast, and motion (see 63-HUMAN-UAT.md)"
    expected: "Single inline lifecycle row remains readable and semantically stable across themes, <=350px, zoom, forced colors, and reduced motion"
    why_human: "Pixel/layout/platform rendering needs live Chrome and human judgment; deferred by user to milestone-end"
  - test: "UAT63-08 — Keyboard focus and screen-reader announcement order (see 63-HUMAN-UAT.md)"
    expected: "Focus retention coherent; one shared live region announces lifecycle changes once, in causal order, without stale or authority-misleading output"
    why_human: "Assistive-technology behavior needs a live browser/AT session; deferred by user to milestone-end"
---

# Phase 63: Native-Messaging Host Verification Report

**Phase Goal:** When the user has installed the optional native-messaging host, the "Agent offline" state auto-attempts to wake `fsb-mcp-server serve` before falling back to the Phase 61 doctor deep-link — closing the UX cliff introduced by the extension having no `nativeMessaging` permission through Phases 57-62. All spawn authority stays inside the serve daemon behind Phase 59's CHAN gates; the native host itself never spawns agent CLIs.
**Verified:** 2026-07-20T12:14:39Z (worktree HEAD `a944a0f6`; frozen implementation identity sha256 `24072007…`, 887858 bytes, re-confirmed by verifier run)
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `install --native-host` writes the platform-appropriate manifest (macOS/Linux file paths, Windows HKCU registry), allows the FSB extension id as sole caller, and installs a host binary that can wake the daemon | ✓ VERIFIED | `mcp/src/install.ts:937-944` routes `--native-host` to `installNativeHost`; CLI passes production ops (`mcp/src/index.ts:36,562`), closing the Plan 06/07 composition deviation via `createProductionNativeHostCliOperations` (`mcp/src/native-host-production.ts:1035-1054`, real fs/registry deps, catch-only unavailable fallback). Paths: macOS `Library/Application Support/Google/Chrome/NativeMessagingHosts/<name>.json`, Linux `.config/google-chrome/NativeMessagingHosts/<name>.json` (`mcp/src/native-host-install/platform.ts:60-100`); Windows `Software\Google\Chrome\NativeMessagingHosts\<name>` under `HKEY_CURRENT_USER` with `KEY_WOW64_32KEY` canonical view (`mcp/src/native-host/constants.ts:37`, `mcp/native-host/windows/fsb-native-host-registry.c:106,221,424`). Sole caller: `allowed_origins` is a frozen single-element tuple of the exact extension origin; length !== 1 or wrong origin rejected (`mcp/src/native-host-registration.ts:112,133-135`). Host binary chain: POSIX launcher template → `build/native-host/index.js` → `runProductionNativeHostEntry` → `wakeServeDaemon` (`mcp/src/native-host/index.ts`, `entry.ts:259`); Windows `.exe` built/verified/version-bound in CI and gating publish (`.github/workflows/npm-publish.yml:52-58`). |
| 2 | Extension manifest gains a single additive `nativeMessaging` permission (no other permission changes); boot detects native-host presence; "Agent offline" auto-attempts a wake before showing the doctor deep-link | ✓ VERIFIED | `git diff 27bddf00..HEAD -- extension/manifest.json` shows exactly one added line: `"nativeMessaging",` — no other manifest change. Boot probe: `extension/background.js:103-105` calls `FsbNativeHostWake.probePresence()` silently. Wake gating: only `agent_offline` preflight result reaches `ensureWake()` (`background.js:1669-1675`); success (`already_running`/`started`) → authenticated bridge wait → exactly one preflight rerun; every failure path returns the original `agent_offline`, which renders the unchanged Phase 61 doctor card (`extension/ui/sidepanel.js:1552-1618` — "Copy doctor command" / `fsb-mcp-server doctor`). Live spot-check: `node tests/native-host-background-wake.test.js` → 111 passed, 0 failed, exit 0. |
| 3 | Native host never spawns agents; it only starts `fsb-mcp-server serve` (or attaches) and exits after handoff; all spawn authority stays behind Phase 59 CHAN gates with no requirement relaxed | ✓ VERIFIED | Spawn tuple is a frozen exact argv `[absoluteStableBuildIndex, 'serve', '--host', '127.0.0.1', '--port', '7226']` with `shell:false`, detached, sanitized env (`mcp/src/native-host/daemon.ts:549-570`); ready health → `already_running` attach without spawning (`daemon.ts:622-647`). Boundary: closed 7-module transitive graph with `node:child_process` allowed only in `platform.ts`; forbidden-token and dynamic-import/require gates (`scripts/verify-native-host-boundary.mjs:16-60,240-251`); live run: `node scripts/verify-native-host-boundary.mjs` → `PASS (source+compiled)`, exit 0, wired as blocking prebuild/build/prepublishOnly gates (`mcp/package.json:44,46,53`). CHAN gates untouched: `git diff 27bddf00..HEAD` is EMPTY for `mcp/src/bridge-auth.ts`, `bridge.ts`, `agent-providers/spawn-supervisor.ts`, `adapter.ts`, `registry.ts` — Origin allowlist (`allowedExtensionOrigin`), session secret, and `shell:false` argv-only spawn are byte-identical to the phase base. Plan 02 strengthened ordering: secret rotation only post-bind via `prepareBridgeAuth` (`mcp/src/index.ts:407-408`, `serve-delegation.ts:272`), `markServeReady` only after `pushInventory` (`serve-delegation.ts:274-275`). Wake success grants no delegation authority — only a pure preflight rerun (`background.js:1729-1734`). |
| 4 | `uninstall --native-host` cleanly removes the manifest; `doctor` reports native-host install state (manifest path, allowlist mismatches, host-binary reachability) | ✓ VERIFIED | `mcp/src/install.ts:1064-1072` routes `uninstall --native-host` to `uninstallNativeHost` (registration-first, marker-proved exact-owned removal, `native-host-install/index.ts:477`). Doctor: `collectBridgeDiagnostics` includes a `nativeHost` snapshot (`mcp/src/diagnostics.ts:143,984,1008`) fed by the real production inspector (`mcp/src/index.ts:38` injects `inspectProductionNativeHost`, which resolves platform layout, reads registration facts, checks launcher reachability, and probes daemon health — `native-host-production.ts:959-1021`). Text section prints Install state, Expected location (manifest path), Manifest/registry, Chrome allowlist, Launcher, Daemon, Reason (`mcp/src/index.ts:334-341`). |

**Score:** 4/4 roadmap success criteria verified

### Plan-Level Must-Haves Rollup (12 plans, 49 truths)

| Plan | Truths | Status | Evidence |
| ---- | ------ | ------ | -------- |
| 63-01 packaging/build guard | 5 | ✓ | All 6 artifacts exist and are substantive (`fsb-native-host-bootstrap.c` 386 lines w/ `CreateProcessW`; `runtime-layout.ts` 658; `run-mcp-build-preserving-workspace.mjs` 573; `runtime-integrity.json` 612; workflows wired). `bundleDependencies` present (`mcp/package.json:63`); publish depends on version-keyed win32-x64/arm64 `.exe` artifacts. |
| 63-02 serve readiness/rotation | 3 | ✓ | `prepareBridgeAuth` → `rotateBridgeSessionSecret` injected from `runHttpMode` (`index.ts:407-408`); barrier order `prepareBridgeAuth` (`serve-delegation.ts:272`) → `pushInventory` → `markServeReady` (`:274-275`); `startHttpServer` exports `markServeReady`/`serveReady` (`http.ts:33`). |
| 63-03 protocol/one-shot entry | 3 | ✓ | `protocol.ts` (351) + `entry.ts` (267, `wakeServeDaemon` invoked only after validation, `entry.ts:1,259`); boundary script blocking in prebuild/build/prepublishOnly; live boundary PASS. |
| 63-04 daemon wake/lock | 4 | ✓ | Exact FSB v1 health URL `http://127.0.0.1:7226/health` (`daemon.ts:65`); tokened lock/quarantine (`daemon.ts:408-428`); exact spawn tuple (`:549-570`); no-kill polling paths (`:622-647`). |
| 63-05 cross-platform install | 5 | ✓ | All 5 artifacts exist (types 408, platform 219, runtime 910, index 647, tests 2335); `publishRuntime` before registration publish (`native-host-install/index.ts:387`); `user/32` canonical + `user/64` shadow views (`platform.ts:92-97`). |
| 63-06 explicit CLI routes | 3 | ✓ | Exact-flag native branch precedes broad expansion (`install.ts:124-175,937,1066`); default `unavailableNativeHostCliOperations` overridden by production ops at the sole CLI entry (`index.ts:562,565`). |
| 63-07 doctor diagnostics | 3 | ✓ | Closed `nativeHost` snapshot + browser-safe projection reconstructing only enums (`diagnostics.ts:447-455`, omits location/reason); "Native messaging host:" section order (`index.ts:334-341`). |
| 63-08 background wake | 5 | ✓ | `FsbNativeHostWake` frozen exports `probePresence`/`ensureWake` (`native-host-wake.js:285-288`); attempt-tagged shared work promise (`:67-69,280`); `agent_offline`-only gating; single additive manifest line (git diff). Live: 111/111 pass. |
| 63-09 sidepanel checking UI | 5 | ✓ | "Checking local agent service" card + polite announcement (`sidepanel.js:1532,1547`); `FSB_NATIVE_WAKE_CHECKING` intent/attempt gate (`:2317`); fallback reuses `_renderDelegationPreflightFailure` (`:1552`). Live: `node tests/delegation-sidepanel-ui.test.js` → PASS, exit 0. |
| 63-10 validation harness | 4 | ✓ | HUMAN-UAT ledger exists with 8 pending scenarios; `run-phase63-focused-tests.mjs` (577); contract test parses the UAT ledger (`delegation-phase-contract.test.js:18`); root `npm test` chain includes every native-host suite after `npm --prefix mcp run build`; CI step "Phase 63 native-host contract (sole Linux root invocation)". |
| 63-11 reviews | 5 | ✓ | 63-REVIEW/SECURITY/UI-REVIEW all `status: pass`; live run `node scripts/verify-phase63-review-artifacts.mjs` → code/security/ui PASS + negative fixtures PASS + implementation identity PASS (887858 bytes, `24072007…`), exit 0. |
| 63-12 final gates | 4 | ✓ | 63-VALIDATION.md records 30/30 rows green; focused runner exit 0 (1016 passed, 0 failed contract) at `1b789c3d`; guarded full suite exit 0 — 132 suites, 0 failures — with workspace/index preservation proofs (commits `da2ce3b5`); HUMAN-UAT hash unchanged, never promoted. |

### Required Artifacts

All 48 declared artifacts exist and are substantive (Level 1 + Level 2). Representative:

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `mcp/src/native-host/daemon.ts` | Bounded health, tokened lock, exact serve launch | ✓ VERIFIED | 662 lines; exports `wakeServeDaemon` (:605) |
| `mcp/src/native-host-install/index.ts` | Closed install/uninstall transaction | ✓ VERIFIED | 647 lines; exports `installNativeHost` (:316), `uninstallNativeHost` (:477) |
| `mcp/src/native-host-production.ts` | Production OS composition (Plan 11 deviation closure) | ✓ VERIFIED | 1063 lines; wired at `mcp/src/index.ts:36,38,562,565` |
| `mcp/src/native-host/index.ts` | Production host entry | ✓ VERIFIED | 9 lines — intentional composition (production environment + entry), not a stub |
| `mcp/native-host/posix/fsb-native-host-launcher.mjs.in` | POSIX launcher template | ✓ VERIFIED | 2 lines — intentional template (`#!__FSB_ABSOLUTE_NODE__` + packaged entry import) |
| `extension/utils/native-host-wake.js` | Background-only probe + one-flight wake controller | ✓ VERIFIED | 290 lines; frozen `globalThis.FsbNativeHostWake` |
| `extension/manifest.json` | Single additive `nativeMessaging` | ✓ VERIFIED | One-line diff vs phase base `27bddf00` |
| `scripts/verify-native-host-boundary.mjs` | Transitive forbidden-authority gate | ✓ VERIFIED | 346 lines; live PASS (source+compiled) |
| `tests/*` (10 phase suites) | Focused matrices | ✓ VERIFIED | 707-2615 lines each; two re-executed live (wake 111/111, sidepanel PASS); rest green in VALIDATION at HEAD fingerprint |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `mcp/src/index.ts` CLI | `install.ts` native branch | production `NativeHostCliOperations` | ✓ WIRED | `index.ts:36,562,565` |
| `install.ts` | `native-host-install/index.ts` | early exact native-host branch | ✓ WIRED | `install.ts:12-13,119-120,937,1066` |
| `native-host-install/index.ts` | `runtime.ts` | runtime validated before registration publish | ✓ WIRED | `publishRuntime` at `:387` |
| `native-host-install/platform.ts` | `HKCU\Software\Google\Chrome\NativeMessagingHosts` | typed user/32 canonical + user/64 shadow | ✓ WIRED | `constants.ts:37`; registry helper C uses `HKEY_CURRENT_USER` + `KEY_WOW64_32KEY` |
| `entry.ts` | `daemon.ts` | validated request → `wakeServeDaemon` once | ✓ WIRED | `entry.ts:1,259` |
| `daemon.ts` | `mcp/build/index.js` | constant-owned exact Node argv | ✓ WIRED | `serve --host 127.0.0.1 --port 7226`, `shell:false` (`:553-570`) |
| `index.ts` (serve) | `serve-delegation.ts` | injected `prepareBridgeAuth` → `rotateBridgeSessionSecret` | ✓ WIRED | `index.ts:407-408`; invoked at `serve-delegation.ts:272` |
| `serve-delegation.ts` | `http.ts` | `markServeReady` only after `pushInventory` | ✓ WIRED | `:274-275` |
| `background.js` | `native-host-wake.js` | `agent_offline`-only `ensureWake` | ✓ WIRED | `background.js:1669-1675` |
| `background.js` | `fsbDelegationPreflightResult` | one initial call + at most one post-bridge rerun | ✓ WIRED | `:1662,1730-1734` |
| `sidepanel.js` | `FSB_NATIVE_WAKE_CHECKING` | intentId/attemptId event gate | ✓ WIRED | emitter `background.js:1614`; gate `sidepanel.js:2317` |
| `sidepanel.js` | `_renderDelegationPreflightFailure` | exact Phase 61 offline/unpaired fallback | ✓ WIRED | `:1552,3816` (doctor copy command `:1483-1618`) |
| `mcp/package.json` | boundary verifier | blocking prebuild/build/prepublishOnly | ✓ WIRED | `:44,46,53` |
| `npm-publish.yml` | `win32-{x64,arm64}/fsb-native-host*.exe` | downloaded version-keyed artifacts before pack/publish | ✓ WIRED | `:52-58,81` |
| `package.json` (root) | phase 63 test suites | serial chain after MCP build; CI sole root invocation | ✓ WIRED | root `test` script; `ci.yml:33-34` |
| `delegation-phase-contract.test.js` | `63-HUMAN-UAT.md` | UAT-honesty parser | ✓ WIRED | `:18` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| doctor text/JSON (`index.ts:334-341`) | `diagnostics.nativeHost` | `inspectProductionNativeHost` → platform layout + real fs/registry adapters + launcher stat + live health probe | Yes (unavailable envelope only on catch) | ✓ FLOWING |
| CLI install/uninstall results | `nativeHostOperations` | `createProductionNativeHostCliOperations` → `productionInstallDependencies` | Yes | ✓ FLOWING |
| Sidepanel checking card | `FSB_NATIVE_WAKE_CHECKING` events | background broadcast with attempt/intent correlation | Yes | ✓ FLOWING |
| Wake outcome | `wakeResult` | native host response over Chrome native messaging → `already_running`/`started` | Yes in code path; live Chrome transport is UAT-pending | ✓ FLOWING (automated); live deferred to UAT |

### Behavioral Spot-Checks (executed by this verifier)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Authority boundary holds (source + compiled) | `node scripts/verify-native-host-boundary.mjs` | `verify-native-host-boundary: PASS (source+compiled)`, exit 0 | ✓ PASS |
| Review artifacts complete/honest and bound to frozen identity | `node scripts/verify-phase63-review-artifacts.mjs` | code/security/ui PASS; negatives PASS; identity PASS (887858 bytes, `24072007…`), exit 0 | ✓ PASS |
| Background wake contract | `node tests/native-host-background-wake.test.js` | `111 passed, 0 failed`, exit 0 | ✓ PASS |
| Sidepanel checking-card contract | `node tests/delegation-sidepanel-ui.test.js` | `delegation-sidepanel-ui: PASS`, exit 0 | ✓ PASS |

Full-suite evidence (not re-run per workspace-protection cautions): 63-VALIDATION.md records focused runner exit 0 (1016 passed, 0 failed) and guarded repository-wide suite exit 0 (132 suites, 0 failures) at the frozen fingerprint, with workspace/index preservation hashes.

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No `scripts/*/tests/probe-*.sh` convention exists in this repository and no plan declares probes; the phase's runnable gates are the verifier scripts and suites executed above (all exit 0) | N/A |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| NATIVE-01 | 01,03,04,05,06,10,11,12 | `install --native-host` writes platform manifest, sole-caller allowlist, wake-capable host binary | ✓ SATISFIED | Truth 1 evidence |
| NATIVE-02 | 08,09,10,11,12 | Additive `nativeMessaging` permission; boot presence detection; offline auto-wake before doctor deep-link | ✓ SATISFIED | Truth 2 evidence |
| NATIVE-03 | 01,02,03,04,08,10,11,12 | Host never spawns agents; serve-only handoff; CHAN gates intact | ✓ SATISFIED | Truth 3 evidence |
| NATIVE-04 | 05,06,07,10,11,12 | `uninstall --native-host` removes manifest; doctor reports install state | ✓ SATISFIED | Truth 4 evidence |

No orphaned requirements: REQUIREMENTS.md maps exactly NATIVE-01..04 to Phase 63 (traceability rows 174-177), and every ID is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None. Zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers across all phase-modified source, script, template, and C files (the single grep hit is the review verifier's own marker-detection regex at `scripts/verify-phase63-review-artifacts.mjs:558`) | — | — |

### Human Verification Required

Eight scenarios, all owned by the existing user-mandated milestone-end ledger `.planning/phases/63-native-messaging-host/63-HUMAN-UAT.md` (status `human_needed`, `deferred_by: user`, `deferred_until: milestone-end`, all pending, evidence-empty, SHA-256-pinned by the contract test so automation cannot promote them):

1. **UAT63-01** macOS published-id install/wake/attach/doctor/uninstall
2. **UAT63-02** macOS unpacked explicit id and allowlist refusal
3. **UAT63-03** Linux Chrome install/wake/attach/doctor/uninstall
4. **UAT63-04** Windows x64 HKCU registry views and packaged `.exe` lifecycle
5. **UAT63-05** Windows arm64 packaged artifact and bootstrap behavior
6. **UAT63-06** Published/unpacked Chrome outcome and no-replay matrix
7. **UAT63-07** Rendered themes, narrow layout, zoom, forced colors, reduced motion
8. **UAT63-08** Keyboard focus and screen-reader announcement order

Per the phase's gate policy these pending items are NOT automated-verification gaps; they are the deliberate live-evidence boundary for the v0.9.91 milestone-end sweep. No new UAT file was created.

### Gaps Summary

No gaps. All four roadmap success criteria are observably true in the codebase, verified goal-backward through existence, substance, wiring, and data-flow levels, with four gates re-executed live by this verifier (all exit 0). The two mid-phase scope deviations (Plans 06/07 leaving production OS composition unavailable) were confirmed closed by Plan 11's `native-host-production.ts` and its wiring at the CLI entry — the exact seam a stub would have hidden in. CHAN gate files are byte-identical to the phase base commit, so no Phase 59 security requirement was relaxed for the wake path. Remaining evidence is exclusively live-environment (real Chrome/OS/AT) and is tracked in the pre-existing 63-HUMAN-UAT.md ledger, hence status `human_needed` rather than `passed`.

---

_Verified: 2026-07-20T12:14:39Z_
_Verifier: Claude (gsd-verifier)_
