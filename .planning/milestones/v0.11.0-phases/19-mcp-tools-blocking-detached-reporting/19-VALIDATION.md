---
phase: 19
slug: mcp-tools-blocking-detached-reporting
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain Node.js scripts plus TypeScript MCP build |
| **Config file** | `package.json`, `mcp/tsconfig.json` |
| **Quick run command** | `node tests/trigger-blocking-reporting.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-manager.test.js` |
| **Full suite command** | `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools` |
| **Estimated runtime** | ~90-180 seconds for full suite |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific focused command from `<verify>`.
- **After every plan wave:** Run `npm --prefix mcp run build` plus all touched focused tests.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 5 minutes.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | REPORT-01, REPORT-02, REPORT-03 | T-19-01 / T-19-02 | Blocking trigger keeps companions cancellable and does not hold transport indefinitely | VM/unit | `node tests/trigger-blocking-reporting.test.js && node tests/mcp-tool-smoke.test.js` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | REPORT-01, REPORT-02, REPORT-03 | T-19-01 / T-19-03 | Heartbeats and SW-eviction recovery expose no cross-agent state | VM/unit | `node tests/trigger-blocking-reporting.test.js && npm --prefix mcp run build` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | REPORT-04, REPORT-05, REPORT-06 | T-19-04 / T-19-05 | Fire/timeout events are persisted atomically and timeout cleanup frees cap slots | unit | `node tests/trigger-lifecycle.test.js && node tests/trigger-tool-dispatcher.test.js` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 2 | REPORT-04, REPORT-06 | T-19-04 / T-19-05 | Status/list projection distinguishes fire vs timed_out without leaking other agents' snapshots | unit/source | `node tests/trigger-tool-dispatcher.test.js && node tests/tool-definitions-parity.test.js` | ✅ | ⬜ pending |
| 19-03-01 | 03 | 3 | REPORT-07 | T-19-06 | Re-arm-on-fire cannot repeatedly fire on the same crossing | unit | `node tests/trigger-manager.test.js && node tests/trigger-lifecycle.test.js` | ✅ | ⬜ pending |
| 19-03-02 | 03 | 3 | REPORT-02, REPORT-03, REPORT-07 | T-19-07 | Detached triggers are reaped on owner release after reconnect grace | unit | `node tests/agent-grace.test.js && node tests/trigger-lifecycle.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/trigger-blocking-reporting.test.js` — new VM/source harness for REPORT-01, REPORT-02, REPORT-03, REPORT-06.
- [ ] Extend `tests/mcp-tool-smoke.test.js` for additive trigger reporting schema fields and detached/blocking bridge options.
- [ ] Extend `tests/trigger-lifecycle.test.js` for persisted fire event, `timed_out`, `rearm_on_fire`, owner release.
- [ ] Extend `tests/trigger-manager.test.js` for hysteresis/de-dup reset semantics.
- [ ] Extend `tests/agent-grace.test.js` for owner-release trigger reap.

Existing infrastructure covers test running and Chrome mocks; no framework install required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | REPORT-01..07 | Deterministic Node/VM tests can cover the MCP/bridge/storage contracts. | N/A |

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags.
- [x] Feedback latency < 5 minutes.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-06-17

