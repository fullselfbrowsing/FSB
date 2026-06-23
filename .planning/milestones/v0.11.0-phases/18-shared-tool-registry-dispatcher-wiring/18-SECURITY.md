---
phase: 18-shared-tool-registry-dispatcher-wiring
phase_number: 18
phase_name: shared-tool-registry-dispatcher-wiring
status: verified
threats_open: 0
asvs_level: 1
security_enforcement: true
created: 2026-06-17
updated: 2026-06-17
verified: 2026-06-17
auditor: Codex inline security audit
---

# Phase 18 Security Verification

## Scope

This audit verifies only the threat mitigations declared in the Phase 18 plan threat models. It does not add a new broad threat model.

Artifacts loaded:

- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-01-PLAN.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-02-PLAN.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-03-PLAN.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-04-PLAN.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-01-SUMMARY.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-02-SUMMARY.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-03-SUMMARY.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-04-SUMMARY.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-REVIEW.md`
- `.planning/phases/18-shared-tool-registry-dispatcher-wiring/18-REVIEW-FIX.md`
- `extension/ai/tool-definitions.js`
- `mcp/ai/tool-definitions.cjs`
- `mcp/src/agent-bridge.ts`
- `mcp/src/tools/triggers.ts`
- `mcp/src/queue.ts`
- `extension/background.js`
- `extension/ws/mcp-tool-dispatcher.js`
- `extension/ws/mcp-bridge-client.js`
- `extension/ai/tool-executor.js`
- `extension/utils/trigger-manager.js`
- Phase 18 focused tests under `tests/`

## Trust Boundaries

| Boundary | Description | Verification Focus |
|----------|-------------|--------------------|
| Shared registry -> provider schemas | Trigger tools are advertised through `TOOL_REGISTRY` and mirrored into MCP. | One canonical definition, byte-identical extension/MCP copies, provider visibility without duplicate schemas. |
| MCP server -> extension bridge | Trigger tool calls cross from MCP into the extension with FSB-minted agent identity and ownership tokens. | `sendAgentScopedBridgeMessage` adds agent identity/token and tab-specific token selection. |
| Bridge message -> extension dispatcher | Trigger bridge messages select background trigger handlers. | Live bridge client routes all four trigger messages and dispatcher applies ownership gate before background dispatch. |
| Dispatcher/autopilot -> background trigger runtime | MCP and autopilot both delegate to background-owned handlers. | No watcher logic in dispatcher/executor; untrusted autopilot identity fields are stripped. |
| Background trigger handlers -> persisted snapshots | Trigger arm/status/list/stop handlers read and mutate persisted trigger state. | Ownership filtering, condition validation, cleanup ordering, storage-of-truth status/list. |
| Provider/autopilot route parity -> release confidence | Shared routes must not silently drift across providers, MCP, and autopilot. | Parity, route-contract, bridge-lifecycle, tool-smoke, and full test gates. |

## Threat Register

| Threat ID | Category | Component | Final Disposition | Status | Evidence |
|-----------|----------|-----------|-------------------|--------|----------|
| T-18-01 | Denial of Service | Companion scheduling and MCP trigger routes | mitigate | CLOSED | Companions are `_readOnly:true` in `extension/ai/tool-definitions.js:1296`, `1321`, and `1351`; `mcp/src/queue.ts:48` bypasses read-only tools; `mcp/src/tools/triggers.ts:69` sends trigger-family calls directly with bounded timeouts; `tests/trigger-tool-dispatcher.test.js:190` covers TaskQueue companion bypass; `tests/mcp-tool-smoke.test.js:410` asserts trigger-family calls do not enqueue. Stop cleanup remains bounded in `extension/background.js:4265`. |
| T-18-02 | Information Disclosure / Elevation of Privilege | Agent-scoped bridge payload and trigger status/list/stop/arm access | mitigate | CLOSED | `mcp/src/agent-bridge.ts:45` builds payloads from `agentScope.ensure`, adds ownership tokens, and captures refreshed tokens; `extension/ws/mcp-tool-dispatcher.js:1592` runs `checkOwnershipGate` for trigger message routes before background dispatch; `extension/background.js:4082` filters snapshots against persisted `agent_id`/`ownership_token`; status/list/stop reject cross-agent access at `extension/background.js:4171`, `4213`, and `4265`; autopilot derives or rejects ownership in `fsbTriggerOwnerContext` at `extension/background.js:4017`; review finding CR-01 is fixed by commit `300cdefb` and regression-tested at `tests/mcp-tool-routing-contract.test.js:448`. |
| T-18-03 | Tampering | Trigger condition schema and validation | mitigate | CLOSED | Shared schemas remain byte-identical per `tests/tool-definitions-parity.test.js:122`; trigger condition validation runs before reads/arm in `extension/background.js:4340` and `4435`; malformed conditions return `TRIGGER_CONDITION_INVALID`; `delta_percent` is normalized to canonical `percent_change` before persistence at `extension/background.js:4359` and `4389`; evaluator defensively accepts the alias in `extension/utils/trigger-manager.js:252`; regressions are covered at `tests/trigger-tool-dispatcher.test.js:492` and `tests/trigger-manager.test.js:177`. |
| T-18-04 | Denial of Service | Stop route to cleanup path | mitigate | CLOSED | Dispatcher routes stop to background dispatch without owning watcher cleanup at `extension/ws/mcp-tool-dispatcher.js:1570`; stop handler reads snapshot first, rejects cross-agent callers before side effects, then clears observe/watchdog/lifecycle in order at `extension/background.js:4265`; tests assert cross-agent stop performs no cleanup and active/terminal cleanup ordering at `tests/trigger-tool-dispatcher.test.js:374`, `411`, and `440`. |
| T-18-05 | Information Integrity | Status/list projection | mitigate | CLOSED | Status/list read `FsbTriggerStore` instead of active SW heap state at `extension/background.js:4171` and `4213`; projections expose bounded persisted fields via `fsbTriggerProjectTriggerStatus` and `fsbTriggerProjectTriggerSummary`; route/executor layers do not synthesize status/list data and delegate to `fsbTriggerDispatchToolRequest`; source-contract tests cover storage-of-truth status/list at `tests/trigger-tool-dispatcher.test.js:279`. |
| T-18-06 | Information Integrity | MCP registration surface, provider parity, and autopilot route parity | mitigate | CLOSED | Trigger tools are registered from `TOOL_REGISTRY` in `mcp/src/tools/triggers.ts:44`; `mcp/src/runtime.ts:37` registers trigger tools before manual tools; `mcp/src/tools/manual.ts` excludes trigger names from manual visual-action registration; provider visibility/parity is locked by `tests/tool-definitions-parity.test.js:136` and `tests/visual-session-schema-lock.test.js:130`; bridge client now routes all four trigger messages at `extension/ws/mcp-bridge-client.js:409`; autopilot strips caller-authored identity fields and delegates to background dispatch at `extension/ai/tool-executor.js:55` and `402`; review finding WR-01 is fixed by `8998c087`, and WR-02 by `b0d5cf42`. |

Threats closed: 6/6 unique Phase 18 threats.

## Plan Register Classification

| Plan | Threat ID | Plan Disposition | Classification | Closure |
|------|-----------|------------------|----------------|---------|
| 18-01 | T-18-03 | mitigate | CLOSED | Closed by shared schema plus background validation/normalization evidence. |
| 18-01 | T-18-06 | mitigate | CLOSED | Closed by byte-identical registry copies and provider visibility tests. |
| 18-01 | T-18-01 | mitigate | CLOSED | Closed by companion `_readOnly:true` metadata plus TaskQueue bypass coverage. |
| 18-02 | T-18-01 | mitigate | CLOSED | Closed by bounded dispatch/stop handlers and companion bypass/direct-path evidence. |
| 18-02 | T-18-02 | mitigate | CLOSED | Closed by persisted owner/token checks for status/list/stop/arm and autopilot foreign-owner rejection. |
| 18-02 | T-18-03 | mitigate | CLOSED | Closed by condition validation before read/arm and alias normalization fix. |
| 18-02 | T-18-04 | mitigate | CLOSED | Closed by stop cleanup ordering and cross-agent no-side-effect tests. |
| 18-02 | T-18-05 | mitigate | CLOSED | Closed by storage-backed status/list projections. |
| 18-03 | T-18-01 | mitigate | CLOSED | Closed by direct trigger registrar dispatch and bounded timeouts. |
| 18-03 | T-18-02 | mitigate | CLOSED | Closed by `sendAgentScopedBridgeMessage` ownership payloads and dispatcher ownership gate fix. |
| 18-03 | T-18-03 | mitigate | CLOSED | Closed by shared `TOOL_REGISTRY` schema source plus background validation. |
| 18-03 | T-18-06 | mitigate | CLOSED | Closed by MCP trigger registrar smoke coverage. |
| 18-04 | T-18-01 | mitigate | CLOSED | Closed by bounded route handlers and direct companion dispatch. |
| 18-04 | T-18-02 | mitigate | CLOSED | Closed by trigger message ownership gate and background ownership checks. |
| 18-04 | T-18-04 | mitigate | CLOSED | Closed by route delegation to background stop cleanup. |
| 18-04 | T-18-05 | mitigate | CLOSED | Closed by storage-backed status/list delegation. |
| 18-04 | T-18-06 | mitigate | CLOSED | Closed by route-contract, bridge-client, provider, and autopilot parity tests. |

## Code Review Security Evidence

| Review Finding | Maps To | Status | Evidence |
|----------------|---------|--------|----------|
| CR-01: Trigger message route bypassed ownership gate | T-18-02 | CLOSED | `extension/ws/mcp-tool-dispatcher.js:1592` normalizes tab aliases and calls `checkOwnershipGate` before `fsbTriggerDispatchToolRequest`; `tests/mcp-tool-routing-contract.test.js:448` proves foreign `target_tab_id` rejects with `TAB_NOT_OWNED` before dispatch; fix recorded in `18-REVIEW-FIX.md`. |
| WR-01: MCP trigger messages were not routed by bridge client | T-18-06 | CLOSED | `extension/ws/mcp-bridge-client.js:409` routes all four trigger message types through `dispatchMcpMessageRoute`; `tests/mcp-bridge-client-lifecycle.test.js:499` covers the VM switch path; fix recorded in `18-REVIEW-FIX.md`. |
| WR-02: Registry advertised `delta_percent`, runtime rejected it | T-18-03 | CLOSED | `extension/background.js:4359` accepts the alias and `4389` normalizes it before persistence; `extension/utils/trigger-manager.js:252` defensively evaluates alias-shaped snapshots; tests added in `tests/trigger-tool-dispatcher.test.js` and `tests/trigger-manager.test.js`; fix recorded in `18-REVIEW-FIX.md`. |

## Accepted Risks Log

| Risk ID | Threat ID | Status | Rationale |
|---------|-----------|--------|-----------|
| N/A | N/A | none | No Phase 18 threat was accepted as residual risk. |

## Transfers

No external transfers remain. All Phase 18 plan threat entries had `mitigate` disposition and are closed by implementation/test evidence above.

## Unregistered Flags

None. The Phase 18 summary artifacts contain no `## Threat Flags` entries.

## Verification Commands

Run during this audit/fix cycle:

```bash
node tests/mcp-tool-routing-contract.test.js --group=trigger
node tests/mcp-bridge-client-lifecycle.test.js
node tests/trigger-tool-dispatcher.test.js
node tests/trigger-manager.test.js
node --check extension/background.js && node --check extension/ws/mcp-tool-dispatcher.js && node --check extension/ws/mcp-bridge-client.js && node --check extension/utils/trigger-manager.js
node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js
npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js
```

Result:

| Check | Result |
|-------|--------|
| `node tests/mcp-tool-routing-contract.test.js --group=trigger` | PASS, 84 passed / 0 failed |
| `node tests/mcp-bridge-client-lifecycle.test.js` | PASS, 60 passed / 0 failed |
| `node tests/trigger-tool-dispatcher.test.js` | PASS, 27 passed / 0 failed |
| `node tests/trigger-manager.test.js` | PASS, 82 passed / 0 failed |
| `node --check ...` syntax checks | PASS |
| `node tests/tool-definitions-parity.test.js` | PASS, 240 passed / 0 failed |
| `node tests/visual-session-schema-lock.test.js` | PASS, 332 passed / 0 failed |
| `npm --prefix mcp run build && node tests/mcp-tool-smoke.test.js` | PASS, 109 passed / 0 failed |

## Audit Trail

| Date | Action | Result |
|------|--------|--------|
| 2026-06-17 | Loaded GSD secure-phase workflow and Phase 18 plan threat models. | Completed. |
| 2026-06-17 | Loaded Phase 18 summaries, code-review artifacts, and targeted implementation/test sources. | Completed. |
| 2026-06-17 | Extracted and classified 17 plan-register entries across 6 unique threats. | 17/17 classified, 6/6 unique threats closed. |
| 2026-06-17 | Checked Phase 18 summaries for `## Threat Flags`. | None found. |
| 2026-06-17 | Verified CR-01/WR-01/WR-02 fixes against implementation and regression tests. | All review security issues closed. |
| 2026-06-17 | Ran targeted Node, MCP build, smoke, parity, and syntax checks listed above. | All passed. |

## Sign-Off

| Role | Name | Status | Date |
|------|------|--------|------|
| Security auditor | Codex inline security audit | verified | 2026-06-17 |

Security result: `SECURED`. `threats_open: 0`.
