---
phase: 18
slug: shared-tool-registry-dispatcher-wiring
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-16
---

# Phase 18 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain Node.js test scripts plus MCP TypeScript build |
| **Config file** | none - tests run directly from `tests/*.test.js` |
| **Quick run command** | `node tests/tool-definitions-parity.test.js && node tests/mcp-tool-routing-contract.test.js` |
| **Full suite command** | `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools` |
| **Estimated runtime** | quick: <30s; full: several minutes |

---

## Sampling Rate

- **After every task commit:** Run the most relevant focused command from the per-task map.
- **After every plan wave:** Run `npm test && npm --prefix mcp run build && npm run test:mcp-smoke:tools`.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** <30s for focused checks; one full-suite pass per wave.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | REG-01, REG-03 | T-18-06 | Trigger tools are added once to the shared registry and MCP mirror without changing existing schemas. | unit/source | `node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js` | Yes | pending |
| 18-01-02 | 01 | 1 | REG-04 | T-18-06 | Provider-specific tool formats all expose the same trigger tools from the shared registry. | unit/source | `node tests/tool-definitions-parity.test.js` | Yes - extend | pending |
| 18-02-01 | 02 | 1 | TRIG-01, LIFE-01, LIFE-02, LIFE-03 | T-18-01, T-18-04, T-18-05 | Trigger arm, stop, status, and list behavior routes through background-owned trigger lifecycle and persisted snapshots. | unit/source | `node tests/trigger-tool-dispatcher.test.js` | No - Wave 0 | pending |
| 18-02-02 | 02 | 1 | REG-02, LIFE-01 | T-18-01, T-18-04 | `stop_trigger`, `get_trigger_status`, and `list_triggers` bypass the mutation queue and cannot be starved behind a pending visual action. | unit/source | `node tests/trigger-tool-dispatcher.test.js && node tests/mcp-tool-smoke.test.js` | Partial - extend | pending |
| 18-03-01 | 03 | 2 | REG-01, REG-02, REG-03, REG-04 | T-18-01, T-18-06 | MCP registration, schema conversion, and direct route contracts match extension dispatcher expectations. | contract/build | `node tests/mcp-tool-routing-contract.test.js && npm --prefix mcp run build && npm run test:mcp-smoke:tools` | Yes - extend | pending |

*Status: pending, green, red, flaky.*

---

## Threat References

| Ref | Threat | Required Mitigation |
|-----|--------|---------------------|
| T-18-01 | Queue starvation prevents cancellation. | Companions use queue-bypass registration and are tested while a mutation is pending. |
| T-18-02 | Cross-agent stop/status/list leak. | Background routes compare trigger snapshot ownership fields with route context before returning or mutating state. |
| T-18-03 | Malformed condition object passes MCP registration. | Background/manager validation rejects malformed trigger input before arming. |
| T-18-04 | Observer, pulse, watchdog, or alarm leak after stop. | Stop orchestration tears down content observer/pulse state, watchdogs, alarms, and persisted snapshots. |
| T-18-05 | Status synthesized from stale service-worker heap. | Status/list read persisted snapshots through `FsbTriggerStore`. |
| T-18-06 | Provider-specific schema drift. | Provider tools are generated from the shared registry and parity tests cover all provider format paths. |

---

## Wave 0 Requirements

- [ ] `tests/trigger-tool-dispatcher.test.js` or equivalent - covers bounded arm, stop, status, list, route ownership, and cleanup for TRIG-01 and LIFE-01/LIFE-02/LIFE-03.
- [ ] Extend `tests/tool-definitions-parity.test.js` - covers trigger registry addition, MCP mirror identity, and provider visibility for REG-01/REG-03/REG-04.
- [ ] Extend `tests/visual-session-schema-lock.test.js` - covers companion read-only classification/no visual-session fields and any `trigger` special registration decision.
- [ ] Extend `tests/mcp-tool-routing-contract.test.js` - covers all four direct route contracts and background route availability.
- [ ] Extend `tests/mcp-tool-smoke.test.js` - covers MCP registration/message routing and bypass-visible behavior.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Feedback latency <30s for focused checks.
- [ ] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
