---
phase: 62
slug: ci-drift-smoke-gate-doctor-extensions
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-15
reviewed: 2026-07-16
plan_count: 6
validation_tasks: 17
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for adapter compatibility, offline drift replay, local doctor diagnostics, the authenticated browser projection, and Providers badges.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native serial Node assertion scripts, strict TypeScript build, VM-loaded extension scripts, and the existing handcrafted DOM harness |
| **Config file** | Root `package.json`; `mcp/package.json`; `mcp/tsconfig.json` |
| **Quick run command** | `npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-diagnostics-status.test.js` |
| **Full suite command** | `node scripts/run-phase60-full-tests.mjs` |
| **Estimated runtime** | Focused slices under 30 seconds; guarded full suite several minutes |

The guarded full-suite wrapper is mandatory because the workspace contains unrelated user-owned planning deletions and modified generated artifacts. It must preserve their exact pre-run bytes and staged state, remove its temporary compatibility link, and fail closed if the suite mutates any unprotected path.

## Sampling Rate

- **After every task commit:** Run that task's focused command from the map below; every MCP TypeScript edit prepends `npm --prefix mcp run build`.
- **After every plan wave:** Run every Phase 62 focused test accumulated through that wave.
- **Before phase verification:** Run `node scripts/run-phase60-full-tests.mjs`, recheck protected hashes and an empty phase index, then require clean code, security, and UI reviews.
- **Max focused feedback latency:** 30 seconds.
- **No-watch/no-live rule:** Watch mode, a live CLI/account/browser, network access, retries-to-green, or a real daemon process do not count as automated verification.

## Per-Task Verification Map

Every approved task maps to one row and retains an automated command. The final plan set uses six bounded slices and 17 task IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | DRIFT-01, DRIFT-04 | T62-01, T62-02 | One exact, deeply frozen daemon matrix owns all version/profile/fixture policy; malformed, missing, wrong-major, below-minimum, and unshipped evidence fails closed | unit/contract | `npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js` | ❌ W0 | ⬜ pending |
| 62-01-02 | 01 | 1 | DRIFT-01, DRIFT-04 | T62-01 | Claude detection imports matrix policy, retains safe diagnostics, and does not create a second version authority | unit/regression | `npm --prefix mcp run build && node tests/mcp-claude-code-adapter.test.js && node tests/mcp-adapter-compatibility.test.js` | ✅ extend/❌ W0 | ⬜ pending |
| 62-01-03 | 01 | 1 | DRIFT-01 | T62-02 | Registry/matrix/fixture bijection drives production-parser replay, raw required-field checks, one terminal result, and every deterministic negative control | integration/CI gate | `npm --prefix mcp run build && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-agent-stream-fixture.test.js` | ❌ W0/✅ retain | ⬜ pending |
| 62-02-01 | 02 | 2 | DRIFT-02, DRIFT-04 | T62-03, T62-04 | Local adapter rows use production detect/classification and immediately project bridge auth to presence/rotation metadata only | unit/security | `npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-bridge-auth.test.js` | ✅ extend | ⬜ pending |
| 62-02-02 | 02 | 2 | DRIFT-02, DRIFT-04 | T62-03, T62-04 | Human and JSON doctor output share one bounded snapshot, work while the extension is offline, omit sentinel secrets/session ids, and preserve historical layer/exit semantics | CLI/contract | `npm --prefix mcp run build && node tests/mcp-diagnostics-status.test.js && node tests/mcp-version-parity.test.js` | ✅ extend | ⬜ pending |
| 62-03-01 | 03 | 2 | DRIFT-04 | T62-05 | A separate authenticated read-only compatibility method accepts an exact empty payload and returns only the safe bounded projection | protocol/contract | `npm --prefix mcp run build && node tests/mcp-reverse-channel-contract.test.js && node tests/mcp-bridge-topology.test.js` | ✅ extend | ⬜ pending |
| 62-03-02 | 03 | 2 | DRIFT-04 | T62-05, T62-06 | Background alone validates, freshness-downgrades, durably stores, and fans out compatibility while preserving sibling maps, unknown keys, and unsaved settings | VM/storage | `node tests/mcp-agent-providers-storage.test.js && node tests/mcp-bridge-background-dispatch.test.js` | ✅ extend | ⬜ pending |
| 62-03-03 | 03 | 2 | DRIFT-04 | T62-05, T62-06 | Cold/manual refresh share the authenticated request, reject malformed/prototype data, never assert support on write failure, and do not overload `delegate.status` | bridge lifecycle | `node tests/mcp-bridge-client-lifecycle.test.js && node tests/mcp-bridge-background-dispatch.test.js && node tests/mcp-agent-providers-storage.test.js` | ✅ extend | ⬜ pending |
| 62-04-01 | 04 | 3 | DRIFT-03 | T62-07 | Parser drift projects only closed bounded adapter/expected/observed labels into the existing exact-once domain terminal without expanding transport errors | daemon boundary | `npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-reverse-channel-contract.test.js` | ✅ extend | ⬜ pending |
| 62-04-02 | 04 | 3 | DRIFT-03 | T62-07, T62-08 | An injected-clock adapter bucket pre-throttles before `rateLimitedWarn`, so duplicate/reconnect delivery contributes at most one scrubbed FIFO row per 10 seconds | unit/fake-clock | `node tests/agent-protocol-drift-diagnostics.test.js && node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js` | ❌ W0/✅ retain | ⬜ pending |
| 62-04-03 | 04 | 3 | DRIFT-03 | T62-07, T62-08 | Missing reporting helpers cannot break settlement; raw provider/task/path/secret data is unrepresentable and duplicate terminals remain idempotent | integration/security | `node tests/agent-protocol-drift-diagnostics.test.js && node tests/mcp-bridge-background-dispatch.test.js && npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js` | ❌ W0/✅ extend | ⬜ pending |
| 62-05-01 | 05 | 3 | DRIFT-04 | T62-06 | Pure display mapping yields exactly Supported/Degraded/Unsupported, stale support only downgrades, and arbitrary version strings cannot influence UI status | unit/source | `node tests/providers-panel-logic.test.js` | ✅ extend | ⬜ pending |
| 62-05-02 | 05 | 3 | DRIFT-04 | T62-06 | Agent rows render a separate accessible compatibility fact/badge while API rows do not; refresh preserves order, focus, selection, recommendation, auth, billing, dirty state, and persisted settings | DOM/accessibility contract | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js` | ✅ extend | ⬜ pending |
| 62-05-03 | 05 | 3 | DRIFT-04 | T62-06 | Token-only compatibility badges, responsive dividers/wrapping, forced-colors, focus, and reduced-motion rules remain separate from existing row/radio/evidence styling | CSS/DOM source contract | `node tests/providers-panel-ui.test.js` | ✅ extend | ⬜ pending |
| 62-06-01 | 06 | 4 | DRIFT-01–04 | T62-02 | Root serial tests add each new focused script exactly once, and root plus CI invoke the identical generalized drift command | package/source contract | `node -e "const p=require('./package.json');const s=p.scripts&&p.scripts.test||'';for(const x of ['node tests/mcp-adapter-compatibility.test.js','node tests/mcp-agent-drift-smoke.test.js','node tests/agent-protocol-drift-diagnostics.test.js'])if(s.split(x).length-1!==1)process.exit(1)"` | ✅ extend | ⬜ pending |
| 62-06-02 | 06 | 4 | DRIFT-01–04 | T62-01–T62-08 | One final source contract pins all 17 task IDs, four requirements, trust schemas/key links, forbidden capabilities, and preserved Phase 59–61 interfaces | phase/security contract | `node tests/delegation-phase-contract.test.js && node tests/mcp-adapter-compatibility.test.js && node tests/mcp-reverse-channel-contract.test.js && node tests/providers-panel-logic.test.js` | ✅ extend | ⬜ pending |
| 62-06-03 | 06 | 4 | DRIFT-02, DRIFT-04 | T62-01–T62-08 | Exactly three live/rendered/accessibility scenarios remain unchecked human_needed with pending results and empty evidence; the guarded full suite stays a separate final integration gate | artifact/contract | `node tests/delegation-phase-contract.test.js` | ❌ task creates/✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Threat References

| Ref | Threat | Required control |
|-----|--------|------------------|
| T62-01 | A copied or malformed policy table asserts unsupported CLI compatibility | One exact daemon matrix, exhaustive comparator boundaries, deep freeze, and no extension-local constants |
| T62-02 | Registry, matrix, and fixture drift independently | Bijection check before production-parser replay in both named CI and root-suite entries |
| T62-03 | Doctor leaks the session secret/id or provider-native/private runtime data | Immediate allowlisted metadata projection plus sentinel serialization tests |
| T62-04 | Adapter collection changes historical doctor availability or exit behavior | Local injected collection, one validated snapshot, and unchanged diagnostic-layer ordering |
| T62-05 | Forged or malformed compatibility data reaches browser storage | Existing authenticated route, exact bounded response, background-only validation/persistence, fail-closed rejection |
| T62-06 | Compatibility refresh gains selection/recommendation/spawn authority | Observational projection, distinct UI field, no form/settings mutations, exhaustive identity snapshots |
| T62-07 | Raw provider drift payload leaks across the terminal/log boundary | Closed adapter/expected/observed labels only; no raw line, message, task, path, environment, or provider object |
| T62-08 | Repeated drift exhausts diagnostics storage or crashes settlement | Per-adapter injected-clock pre-throttle, existing 100-entry scrubbed FIFO, best-effort reporter |

## Wave 0 Requirements

- [ ] `tests/mcp-adapter-compatibility.test.js` — matrix exactness/deep freeze, safe projection, semantic-version boundaries, closed reasons, and invalid/unshipped failure modes.
- [ ] `tests/mcp-agent-drift-smoke.test.js` — registry-driven generalized replay, fixture/profile agreement, raw init/result fields, normalized sequence, one terminal result, and every locked negative control.
- [ ] `tests/agent-protocol-drift-diagnostics.test.js` — bounded detail projection, per-adapter fake-clock throttle, duplicate/reconnect suppression, missing-helper safety, and redaction canaries.
- [ ] Extend `tests/mcp-diagnostics-status.test.js` for injected registry/auth/clock inputs, offline rows, human/JSON parity, sentinel non-leak, and unchanged diagnostic-layer semantics.
- [ ] Extend existing bridge/storage/UI tests for the authenticated safe projection, durable-write failure, prototype/unknown-key handling, staleness, exact badges, accessibility, and zero authority mutation.
- [ ] Extend the existing phase/source contract so DRIFT-01–04, the named CI/root gate, invariant schemas, forbidden capabilities, and deferred UAT rows are mechanically pinned.
- [ ] `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-HUMAN-UAT.md` — exactly three unchecked `human_needed` milestone-end scenarios with pending results and empty evidence.

No new test runner, browser driver, process supervisor, network service, native host, or external dependency is required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real installed Claude path/version and doctor text/JSON corroboration | DRIFT-02, DRIFT-04 | Requires an installed authenticated CLI and local daemon environment | At the milestone-end sweep, run human and JSON doctor modes, compare path/version/status/profile/auth/secret-age projections, and record sanitized evidence without the secret |
| Rendered badge hierarchy in light/dark, desktop/compact/narrow, reduced-motion, and forced-color modes | DRIFT-04 | Pixel hierarchy and platform rendering require live Chrome and human visual judgment | At milestone end, render all three closed states and verify separation from availability/recommendation/auth/billing/selection with no overflow or color-only meaning |
| Keyboard, screen-reader, focus retention, and live-region behavior during cold/manual refresh | DRIFT-04 | Native radio/focus/assistive announcements require live interaction | At milestone end, navigate and refresh with keyboard/screen reader, verify silent hydration and one announcement without selection, focus, order, or dirty-state changes |

Every row remains `human_needed` and deferred to the single milestone-end UAT sweep. Automated/source evidence must not be presented as a live pass.

## Validation Sign-Off

- [x] Final PLAN task ids match the per-task map.
- [x] Every task has an `<automated>` command or exact Wave 0 dependency.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Wave 0 covers every missing focused fixture.
- [x] No watch-mode, live provider, real process, browser, or retry-to-green command is used as automated evidence.
- [x] Guarded full-suite execution preserves unrelated dirty/staged state and protected hashes.
- [x] Manual checks remain pending at the milestone-end gate and are never fabricated.
- [x] `nyquist_compliant: true` is set only after plan-checker approval.

**Approval:** approved 2026-07-16 after independent plan-checker PASS (6 plans, 17 tasks, 0 blockers, 0 warnings)
