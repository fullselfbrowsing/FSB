---
phase: 57
slug: agent-identity-capture
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-12
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Repository-native Node assertion scripts plus TypeScript compiler |
| **Config file** | Root `package.json`; `mcp/tsconfig.json` |
| **Quick run command** | Focused `node tests/<phase-contract>.test.js`; MCP changes prepend `npm --prefix mcp run build` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | Focused contracts: <30 s each; full suite: several minutes |

## Sampling Rate

- **After every task commit:** Run the task's focused contract test(s).
- **After every plan wave:** Run `npm --prefix mcp run build` plus all Phase 57 contract tests; run `npm test` when the wave touches extension source-pin files.
- **Before phase verification:** `npm test` must be green.
- **Max focused feedback latency:** 30 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | IDENT-02 | T57-01 | Optional handshake identity cannot change the legacy empty register payload when absent | unit/contract | `npm --prefix mcp run build && node tests/agent-scope.test.js && node tests/mcp-client-identity.test.js` | ❌ task creates | ⬜ pending |
| 57-01-02 | 01 | 1 | IDENT-04 | T57-02 | Binary detection uses fixed argv, timeout, and no shell | unit/contract | `npm --prefix mcp run build && node tests/mcp-client-inventory.test.js && node tests/mcp-install-platforms.test.js` | ❌ task creates | ⬜ pending |
| 57-02-01 | 02 | 1 | IDENT-01 | T57-03 | Durable click evidence does not block or alter clipboard feedback | VM/source contract | `node tests/onboarding-agent-provider-clicks.test.js` | ❌ task creates | ⬜ pending |
| 57-02-02 | 02 | 1 | IDENT-03 | T57-01 | Untrusted clientInfo is sanitized, length-capped, and used only as evidence | VM/unit | `node tests/mcp-agent-providers-storage.test.js && node tests/agent-registry.test.js` | ❌ task creates | ⬜ pending |
| 57-02-03 | 02 | 1 | IDENT-04 | T57-04 | Inventory ingestion preserves sibling evidence and stale timestamps | VM/contract | `node tests/mcp-bridge-background-dispatch.test.js && node tests/mcp-agent-providers-storage.test.js` | ❌ task creates | ⬜ pending |
| 57-03-01 | 03 | 2 | IDENT-05 | T57-05 | Explicit aliases merge; unknown client names remain visible and never gain authority | unit/VM | `node tests/mcp-client-merged-view.test.js` | ❌ task creates | ⬜ pending |
| 57-03-02 | 03 | 2 | IDENT-01..05 | T57-06 | Cross-stack flow is additive and source/wire freezes remain intact | integration/regression | `npm --prefix mcp run build && node tests/mcp-client-identity.test.js && node tests/mcp-client-inventory.test.js && node tests/mcp-agent-providers-storage.test.js && node tests/mcp-client-merged-view.test.js && node tests/onboarding-agent-provider-clicks.test.js && npm test` | ❌ task creates | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Threat References

| Ref | Threat | Required control |
|-----|--------|------------------|
| T57-01 | Spoofed or oversized MCP `clientInfo` influences trusted state | Treat identity as observability only; sanitize and cap fields; never authorize from it. |
| T57-02 | Command injection or Windows shell escalation during CLI detection | `execFile` with fixed binary/argv candidates, no shell, 3 s timeout. |
| T57-03 | Persistence failure breaks the user's clipboard action | Fire-and-forget storage; preserve existing copied state, toast, and navigation. |
| T57-04 | Concurrent storage writers erase unrelated evidence | Per-sub-map mutation that preserves sibling maps and unknown fields. |
| T57-05 | Heuristic aliasing misidentifies a client | Closed explicit alias table; retain unknown raw entries without merging authority. |
| T57-06 | Additive feature silently changes existing MCP or extension contracts | Exact legacy-payload/response assertions, bridge/source pins, and full regression suite. |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Each implementation task creates its focused test file before or with the corresponding production change; no framework installation or shared fixture bootstrap is needed.

## Manual-Only Verifications

All Phase 57 behaviors have automated verification. The phase adds no new rendered UI; unchanged onboarding feedback can be verified with the existing VM/source-contract style.

## Validation Sign-Off

- [x] Every planned behavior has a focused automated command or a same-task test-file creation requirement.
- [x] Sampling continuity prevents three consecutive tasks without automated verification.
- [x] Existing infrastructure covers Wave 0.
- [x] No watch-mode flags are used.
- [x] Focused feedback latency target is under 30 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-07-12

