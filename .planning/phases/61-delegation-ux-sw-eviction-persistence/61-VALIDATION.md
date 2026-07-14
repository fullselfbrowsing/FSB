---
phase: 61
slug: delegation-ux-sw-eviction-persistence
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-14
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Exact task ids remain synchronized with the approved plans.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Dependency-free Node assertions, VM-loaded extension scripts, fake `chrome` APIs/storage/tabs/runtime, compiled TypeScript MCP modules, and injected child/process/clock dependencies |
| **Config file** | `package.json`, `mcp/package.json`, `mcp/tsconfig.json` |
| **Quick run command** | `node tests/delegation-consent.test.js && node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js` |
| **Full suite command** | Phase 60's fail-safe root-suite harness, which creates/removes the temporary Phase 39 compatibility link and verifies dirty/staged-state preservation |
| **Estimated runtime** | Focused slices under 30 seconds; full root suite several minutes |

The workspace contains user-owned deletions of historical Phase 39 artifacts. Full-suite runs must use the committed fail-safe harness from Phase 60, must remove its temporary link in `finally`, and must never stage or commit that link. The existing modified `.planning/config.json`, historical planning deletions, `mcp/build/index.js`, and generated showcase files are out of scope and must remain untouched.

## Sampling Rate

- **After every task commit:** Run that task's focused command from the map below.
- **After every plan wave:** Run every Phase 61 focused test accumulated through that wave.
- **Full-suite gates:** Run the fail-safe complete root suite after the first Wave-1 extension change (proving green from the first implementation commit) and once after the final Wave-5 focused gates before verification/review. Waves 2–4 use accumulated focused gates and do not add redundant several-minute full-suite runs.
- **Max feedback latency:** 30 seconds for a focused slice; the two explicitly separated full-suite gates are not task-feedback commands.
- **No-watch/no-retry rule:** Watch modes, retry-to-green, live model calls, real process authority, and automatically replayed tasks do not count as verification.

## Per-Task Verification Map

The planner may refine plan boundaries, but every final task must map to one row and retain an automated command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | UX-01, LIFE-03 | T61-02, T61-11 | Agent/API routing is exact, API empty-string storage remains compatible, delegated mode has no iteration cap, and preflight is a pure read-only contract; Plan 06 owns background mutation ordering | contract/source | `node tests/delegation-routing.test.js && node tests/provider-parity.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-01-02 | 01 | 1 | UX-03 | T61-01 | Provider-bound one-use consent challenges reject forgery, replay, mismatch, expiry, and concurrent consume | unit/concurrency | `node tests/delegation-consent.test.js` | ❌ W0 | ⬜ pending |
| 61-01-03 | 01 | 1 | UX-03, LIFE-03 | T61-01, T61-11 | Trust defaults false and is provider-local; offline/unpaired/unsupported returns a read-only disposition | integration/source | `node tests/delegation-consent.test.js && node tests/delegation-routing.test.js` | ❌ W0 | ⬜ pending |
| 61-02-01 | 02 | 1 | UX-02, UX-06, LIFE-01 | T61-03, T61-04 | Every normalized event projects to one bounded redacted sequence entry with exact typed init/tool-status/retry/metrics fields and closed terminal codes | unit/boundary | `node tests/delegation-event-store.test.js` | ❌ W0 | ⬜ pending |
| 61-02-02 | 02 | 1 | LIFE-01 | T61-03, T61-13 | Storage resolves before fanout; rejection/over-quota fails closed; reload hydrates exact sequence without replay | ordering/reload | `node tests/delegation-event-store.test.js && node tests/delegation-controller.test.js` | ❌ W0 | ⬜ pending |
| 61-02-03 | 02 | 1 | UX-02, UX-04, UX-05, LIFE-01 | T61-03, T61-08, T61-13 | One controller state machine coalesces lifecycle races and owns watchdog/terminal state | state-machine | `node tests/delegation-controller.test.js` | ❌ W0 | ⬜ pending |
| 61-03-01 | 03 | 1 | LIFE-01 | T61-03 | Async event observers serialize and final response cannot overtake earlier writes or hide observer failure | bridge lifecycle | `node tests/mcp-bridge-client-lifecycle.test.js` | ✅ extend | ⬜ pending |
| 61-03-02 | 03 | 1 | LIFE-02 | T61-10 | One ref-counted 20-second loop requires an exact nonce echoed by the daemon; stale pongs do not reset three consecutive misses | fake-clock/bridge protocol | `npm --prefix mcp run build && node tests/mcp-bridge-client-lifecycle.test.js && node tests/agent-grace.test.js && node tests/mcp-reverse-channel-contract.test.js` | ✅ extend | ⬜ pending |
| 61-03-03 | 03 | 1 | LIFE-02, LIFE-03 | T61-10, T61-12 | Chrome minimum is 116, `nativeMessaging` remains absent, and no extension doctor/setup path executes or restarts anything | manifest/source | `node tests/mcp-version-parity.test.js && node tests/agent-grace.test.js` | ✅ extend | ⬜ pending |
| 61-04-01 | 04 | 2 | UX-04, UX-05 | T61-05 | Daemon delegation id crosses only the optional registration sidecar and maps once only after the controller authorizes its currently expected live id | protocol/contract | `npm --prefix mcp run build && node tests/agent-scope.test.js && node tests/agent-registry.test.js && node tests/agent-bridge-routes.test.js` | ✅ extend | ⬜ pending |
| 61-04-02 | 04 | 2 | UX-05 | T61-06, T61-07 | Controller proves active-tab eligibility, then confirmed hold converts every exact mapped tab/token into one unclaimable sealed lease | registry/fake-clock | `node tests/agent-registry.test.js` | ✅ extend | ⬜ pending |
| 61-04-03 | 04 | 2 | UX-04, UX-05 | T61-06, T61-07 | Resume atomically restores the complete unchanged lease and cleanup never releases a second agent's tabs | adversarial registry | `node tests/agent-registry.test.js && node tests/agent-bridge-routes.test.js && node tests/open-tab-background-default.test.js` | ✅ extend | ⬜ pending |
| 61-05-01 | 05 | 2 | UX-05 | T61-07, T61-08 | Strict hold/resume/status schemas apply only to the live server-minted run; unsupported platforms fail closed | supervisor unit | `npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-reverse-channel-contract.test.js` | ✅ extend | ⬜ pending |
| 61-05-02 | 05 | 2 | UX-04, UX-05 | T61-07, T61-08 | POSIX hold/resume/expiry and cancel/result races settle once; kill confirms tree absence before success | supervisor race | `npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js` | ✅ extend | ⬜ pending |
| 61-05-03 | 05 | 2 | LIFE-04 | T61-09 | Generation plus bounded recovery disposition proves restart loss; disconnect alone never does; no run re-adopts | recovery matrix | `npm --prefix mcp run build && node tests/mcp-agent-orphan-recovery.test.js && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-reverse-channel-contract.test.js` | ✅ extend | ⬜ pending |
| 61-06-01 | 06 | 3 | UX-01, UX-03, LIFE-03 | T61-01, T61-02, T61-11 | Background preflight/consent/trust branch before legacy allocation, challenge-bound trust enable works, and Providers restores confirmation through the exact authority-reducing clear path | background/provider integration | `node tests/delegation-routing.test.js && node tests/delegation-controller.test.js && node tests/provider-parity.test.js && node tests/mcp-bridge-background-dispatch.test.js && node tests/providers-panel-logic.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-06-02 | 06 | 3 | UX-04, UX-05 | T61-06, T61-07, T61-08 | Take Control, Resume, and Stop use exact controller/supervisor/registry ordering and exact release counts | lifecycle integration | `node tests/delegation-controller.test.js && node tests/agent-registry.test.js && node tests/mcp-spawn-supervisor.test.js && node tests/mcp-bridge-background-dispatch.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-06-03 | 06 | 3 | LIFE-01, LIFE-02, LIFE-04 | T61-03, T61-09, T61-10, T61-13 | Worker wake hydrates before subscribe, reconciles status/generation, and never replays/re-adopts execution | eviction/recovery | `node tests/delegation-controller.test.js && node tests/mcp-bridge-client-lifecycle.test.js && node tests/mcp-agent-orphan-recovery.test.js && node tests/mcp-bridge-background-dispatch.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-07-01 | 07 | 4 | UX-02, UX-06 | T61-04, T61-14 | One renderer consumes typed init/tool-status/retry/result/summary fields without parsing presentation strings, plus every paired side-panel/owner source pin | DOM/source | `node tests/delegation-sidepanel-ui.test.js && node tests/sidepanel-tab-aware-smoke.test.js && node tests/owner-chip.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-07-02 | 07 | 4 | UX-03, UX-05 | T61-01, T61-07, T61-11 | Approved consent, trust, Take Control, Resume, and failure states have exact copy, focus, visible controls, and no optimism | accessibility/source | `node tests/delegation-sidepanel-ui.test.js && node tests/sidepanel-tab-aware-smoke.test.js && node tests/owner-chip.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-07-03 | 07 | 4 | UX-04, LIFE-01, LIFE-02, LIFE-03, LIFE-04 | T61-08, T61-12, T61-13 | Stop/offline/disconnected/restart UI consumes canonical snapshots, suppresses hydrate announcements, and retains composer correctly | UI integration | `node tests/delegation-sidepanel-ui.test.js && node tests/delegation-controller.test.js` | ❌ W0 | ⬜ pending |
| 61-08-01 | 08 | 5 | UX-01–06, LIFE-01–04 | T61-01–T61-14 | The milestone-end UAT ledger exists first, validation maps all 23 tasks, every live item is pending, and the root chain includes each focused gate once | contract/artifact | `node tests/delegation-phase-contract.test.js` | ❌ W0 / ✅ extend | ⬜ pending |
| 61-08-02 | 08 | 5 | UX-01–06, LIFE-01–04 | T61-01–T61-14 | Focused source/security/compatibility gates are green; the complete fail-safe root suite runs separately as the required Wave-5 regression gate | system/regression | `node tests/delegation-phase-contract.test.js && node tests/mcp-version-parity.test.js && node tests/provider-parity.test.js && node tests/agent-provider-forbidden-flags.test.js` | ❌ W0 / ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/delegation-routing.test.js` — fifth mode, provider matrix, early background branch, preflight dispositions, no optimistic mutation, Chrome 116/no-native/source pins.
- [ ] `tests/delegation-consent.test.js` — provider-local trust and exact one-use session challenge with replay/mismatch/expiry/concurrency cases.
- [ ] `tests/delegation-event-store.test.js` — typed init/client/profile/model/session/allowed-tools, tool status, retry, closed terminal codes, no presentation-string parsing, projection/redaction, exact boundaries/quota, serialized writes, rejection, hydration, and corruption on every persisted duplicate/conflicting sequence.
- [ ] `tests/delegation-controller.test.js` — state/watchdog/lifecycle races, exact mapping cleanup, forced module reload, generation reconciliation, no replay/adopt.
- [ ] `tests/delegation-sidepanel-ui.test.js` — approved state/copy/action/focus/live-region/responsive/reduced-motion/source contract and hostile metadata.
- [ ] `tests/delegation-phase-contract.test.js` — final requirement/source/key-link coverage plus exact deferred-UAT artifact and no fabricated live-pass assertions.
- [ ] Extend `tests/mcp-bridge-client-lifecycle.test.js` for async observer ordering/failure/final barrier and acknowledged active-delegation heartbeat.
- [ ] Extend `tests/providers-panel-logic.test.js` for canonical provider-scoped restore-confirmation UI, exact clear command, next-run consent, and no direct trust storage mutation.
- [ ] Extend `tests/agent-scope.test.js`, dispatcher tests, and `tests/agent-registry.test.js` for delegation sidecar/mapping and sealed hold leases.
- [ ] Extend `tests/mcp-spawn-supervisor.test.js` and orphan-recovery coverage for strict lifecycle status, POSIX hold/resume/expiry, daemon generation, and restart dispositions.
- [ ] Add all new focused commands once to the root serial `package.json` test chain without dropping or duplicating existing coverage.

No test framework, browser driver, AI framework, LLM judge, native host, or hosted collector is required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real side-panel consent/focus/keyboard/theme/responsive/reduced-motion and exact Take Control visibility | UX-02, UX-03, UX-05 | Requires unpacked Chrome and human visual/accessibility judgment | At milestone end, test light/dark, narrow/wide, keyboard-only, reduced-motion, owned/non-owned active tabs, consent decline/allow/trust, hold/resume focus |
| Genuine Claude stream through daemon into feed and summary | UX-02, UX-06 | Requires authenticated installed CLI and live browser state | Run a benign multi-tool task at the final gate; compare normalized events, feed ordering, tokens/turns/duration/tool breakdown, and subscription wording |
| Forced live worker eviction and 45-minute endurance | LIFE-01, LIFE-02 | Deterministic reload/quota fixtures do not prove Chrome's real worker/lifetime behavior | Force worker eviction during a live run, reopen panel, compare exact rows/sequences, then run a 45-minute bounded task and inspect storage use |
| Real POSIX hold/resume/expiry and Stop settlement | UX-04, UX-05 | Kernel process-group suspension/termination requires controlled real processes | Hold a benign delegated run, interact with exact tab, resume, test expiry, then Stop and verify zero descendants plus exact tab-release count |
| Real daemon crash/restart classification | LIFE-04 | Requires cross-process crash, orphan recovery, and reconnect | Crash serve mid-run, restart it, verify surviving CLI is killed/not adopted and exact restart-lost UI appears; separately prove ordinary disconnect is not mislabeled |

All manual checks remain `human_needed` and deferred to the single milestone-end UAT gate. Automated/source verification remains blocking now.

## Security Blocking Matrix

| Threats | Blocking automated evidence |
|---------|-----------------------------|
| T61-01–02 consent/provider authority | Challenge/trust concurrency matrix plus API/agent routing and parity pins |
| T61-03–04 event ordering/redaction/quota | Deferred storage/final-response races, canaries, serialized bounds and fail-closed tests |
| T61-05–07 delegation mapping/ownership/hold | Registration-sidecar exactness, two-agent cleanup isolation, lease conflict/expiry/restore matrix |
| T61-08–10 settlement/restart/heartbeat | Exact-once supervisor/controller races, generation dispositions, nonce/refcount fake timers |
| T61-11–14 no optimism/authority creep/eviction/XSS | Offline/consent DOM harness, no-native/source gate, reload fixture, hostile text-only renderer tests |

No Critical/High automated threat evidence may be deferred. Only the real-environment corroboration above is deferred.

## Validation Sign-Off

- [x] Final plans and task ids match the per-task map.
- [x] Every task has an `<automated>` command or an exact Wave-0 dependency.
- [x] Sampling continuity has no three consecutive implementation tasks without automated verification.
- [x] Wave 0 covers every missing focused fixture.
- [x] No watch-mode, live-provider, real-process, or retry-to-green command is used as automated evidence.
- [x] The full-suite harness removes its temporary Phase 39 compatibility link and preserves unrelated dirty/staged state.
- [x] Manual checks are preserved at the milestone-end gate and never fabricated.
- [x] `nyquist_compliant: true` is set only after plan-checker approval.

**Approval:** approved 2026-07-14 after independent plan-checker PASS
