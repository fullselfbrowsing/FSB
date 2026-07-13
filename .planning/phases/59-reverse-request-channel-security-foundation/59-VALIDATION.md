---
phase: 59
slug: reverse-request-channel-security-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Dependency-free Node assertion harnesses, real `ws` sockets, VM-loaded extension client, TypeScript `tsc` build |
| **Config file** | `package.json`, `mcp/package.json`, `mcp/tsconfig.json` |
| **Quick run command** | `npm --prefix mcp run build && node tests/mcp-reverse-channel-contract.test.js && node tests/mcp-bridge-topology.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | focused slices < 20 seconds; full suite several minutes |

The current workspace has user-owned deletions of historical phase artifacts. For the full suite only, create a temporary untracked symlink from `.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md` to `.planning/milestones/v1.0.0-phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md`, remove it with a shell trap, and never stage it.

---

## Sampling Rate

- **After every task commit:** Run the task's focused command from the map below.
- **After every plan wave:** Run `npm test` with the temporary Phase 39 fixture and remove the fixture afterward.
- **Before phase verification:** Full suite must be green, the fixture must be absent, and no unrelated dirty path may be staged.
- **Max feedback latency:** 20 seconds for focused tests; one full-suite run per wave.
- **No-watch rule:** No watch-mode or long-running server command counts as verification.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | CHAN-01 | T59-06 | Separate ext union; legacy MCP and relay bytes frozen | contract | `npm --prefix mcp run build && node tests/mcp-version-parity.test.js && node tests/mcp-reverse-channel-contract.test.js` | ❌ W0 | ⬜ pending |
| 59-01-02 | 01 | 1 | CHAN-05 | T59-04 | Error and diagnostic strings contain no raw token substring | unit | `node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js` | ✅ extend | ⬜ pending |
| 59-01-03 | 01 | 1 | CHAN-07 | T59-07 | Forbidden-flag scanner fails positive fixture and runs before MCP build | gate | `node tests/agent-provider-forbidden-flags.test.js && npm --prefix mcp run build` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 2 | CHAN-04 | T59-03, T59-04 | 32-byte secret, `0600`, rotation, safe compare, no status leak | unit | `npm --prefix mcp run build && node tests/mcp-bridge-auth.test.js` | ❌ W0 | ⬜ pending |
| 59-02-02 | 02 | 2 | CHAN-03 | T59-01, T59-02, T59-08 | Origin/Host/bind rejection occurs before connection handler | integration | `npm --prefix mcp run build && node tests/mcp-bridge-topology.test.js` | ✅ extend | ⬜ pending |
| 59-02-03 | 02 | 2 | CHAN-04 | T59-03, T59-04 | CLI pair/serve rotation emits only explicit credential output | CLI contract | `npm --prefix mcp run build && node tests/mcp-bridge-auth.test.js && node tests/mcp-version-parity.test.js` | ❌ W0 | ⬜ pending |
| 59-03-01 | 03 | 3 | CHAN-02 | T59-05 | Local handler wins; otherwise first capable relay; offline typed error | integration | `npm --prefix mcp run build && node tests/mcp-reverse-channel-contract.test.js && node tests/mcp-bridge-topology.test.js` | ❌/extend W0 | ⬜ pending |
| 59-03-02 | 03 | 3 | CHAN-06 | T59-05 | Relay/hub loss settles once, clears state, never replays | integration | `npm --prefix mcp run build && node tests/mcp-bridge-topology.test.js` | ✅ extend | ⬜ pending |
| 59-04-01 | 04 | 4 | CHAN-01, CHAN-04 | T59-03, T59-05 | Client protocols, pending map, event/final/timeout/close behavior | VM integration | `node tests/mcp-bridge-client-lifecycle.test.js && node tests/mcp-reverse-channel-contract.test.js` | ✅ extend/❌ W0 | ⬜ pending |
| 59-04-02 | 04 | 4 | CHAN-04, CHAN-05 | T59-03, T59-04 | Pairing control uses session storage only and never persists/logs raw code | UI/source contract | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js && node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js` | ✅ extend | ⬜ pending |
| 59-04-03 | 04 | 4 | CHAN-01–07 | T59-01–T59-08 | All focused gates and full suite green; no spawn implementation | system | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/mcp-reverse-channel-contract.test.js` — frame validator, separate-union, legacy relay serialization, and capability omission fixtures for CHAN-01/02.
- [ ] `tests/mcp-bridge-auth.test.js` — auth-store, mode, rotation, token grammar, comparison, and CLI output fixtures for CHAN-03/04.
- [ ] `tests/agent-provider-forbidden-flags.test.js` — missing/clean/positive scanner fixtures for CHAN-07.
- [ ] Extend `tests/mcp-bridge-topology.test.js` with pre-handler upgrade counters and ext route churn fixtures for CHAN-02/03/06.
- [ ] Extend `tests/mcp-bridge-client-lifecycle.test.js` so the fake WebSocket records protocols and can deliver ext frames for CHAN-01/04.
- [ ] Extend redaction and Providers tests for CHAN-04/05.

No new test framework or runtime dependency is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pair live unpacked extension to running `serve` | CHAN-04 | Requires real Chrome extension Origin and user paste | Run `serve`, run `pair`, paste in Agent CLI details, confirm paired/reconnected without exposing the credential |
| Observe daemon restart invalidation | CHAN-04 | Cross-process/browser lifecycle UX | Restart `serve`; confirm old credential becomes expired/unpaired and a new pair is required |
| Observe browser restart clearing | CHAN-04 | Real Chrome `storage.session` lifetime | Restart Chrome; confirm credential/pair state is cleared honestly |
| Pair control accessibility/theme smoke | CHAN-04 | Live rendering and assistive interaction | Keyboard through input/action/status in light/dark themes and confirm screen-reader announcements |

All manual checks are preserved as `human_needed` and deferred to the milestone-end UAT gate. Automated/source verification remains blocking for phase completion.

---

## Security Blocking Matrix

| Threat | Severity | Blocking automated evidence |
|--------|----------|-----------------------------|
| T59-01 CSWSH | Critical | evil Origin rejected before handler |
| T59-02 DNS rebinding | Critical | evil Host rejected at real upgrade |
| T59-03 stale/malicious credential | High | absent/wrong/rotated token and wrong Origin fail ext routing |
| T59-04 secret disclosure | High | raw and interior token substrings absent from all fixtures/sinks/state |
| T59-05 topology replay/confused deputy | High | single settlement, cleanup, no automatic replay |
| T59-06 byte drift | High | MCP/tool hashes and legacy relay serialization unchanged |
| T59-07 forbidden future flags | Critical | prebuild scanner positive fixture fails |
| T59-08 remote bind | Critical | non-loopback host rejected before listen |

No Critical/High threat may be deferred to Phase 60.

---

## Validation Sign-Off

- [ ] All tasks have an automated verify command or explicit Wave 0 dependency.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every currently missing fixture.
- [ ] Existing hub-exit-promotion and version-parity tests remain green.
- [ ] Full suite runs with the temporary historical fixture and removes it afterward.
- [ ] Manual checks are captured in `59-HUMAN-UAT.md` and marked milestone-end deferred, never fabricated.
- [ ] No `child_process`, SpawnSupervisor, adapter implementation, or production spawn capability enters Phase 59.
- [ ] `nyquist_compliant: true` is set after plan checker approval.

**Approval:** pending plan checker
