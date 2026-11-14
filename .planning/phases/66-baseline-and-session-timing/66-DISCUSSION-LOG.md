# Phase 66: Baseline and Session Timing - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are recorded in CONTEXT.md; this log preserves the analysis behind them.

**Date:** 2026-09-29
**Phase:** 66-baseline-and-session-timing
**Mode:** assumptions
**Areas analyzed:** Timing capture and storage; Session detail and operator surface; Tokens and cost; Benchmark suite, outcome proof, and run identity

## Assumptions Presented

### Timing capture and storage
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| MCP timing is captured where calls enter the extension and stored as `tool.call` metadata, never in responses | Likely | `mcp-bridge-client.js` 1144-1199; `mcp-lattice-journal.js` 1169, 1385; `tests/mcp-session-recorder-journal.test.js:92` |
| No server-side timestamps in Phase 66; queue wait is labelled "not measured" | Unclear | `mcp/src/queue.ts` 64-77; `mcp/src/agent-bridge.ts` 71-104; `tests/mcp-tool-smoke.test.js:58` |
| Autopilot records model and tool time per iteration; missing values are null, not 0 | Likely | `agent-loop.js` 1936, 2260, 2816; `action-history.js:51`; `automation-logger.js` 909-915 |
| Wall time per completed task comes from the runner's clock; `idle_timeout` runs are flagged | Confident | `mcp-lattice-journal.js` 1530-1537; `automation-logger.js` 874, 931 |

### Session detail and operator surface
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `get_session_detail` checks the journal first, guarded when the journal is absent | Confident | dispatcher 2904-2957; `background.js` 12496-12536; `tests/mcp-in-flight-session-lookup.test.js` |
| Same response envelope, with a sanitized `actionHistory` projection and no new parameters | Likely | REQUIREMENTS MCP-04; `options.js` 3444-3476; journal 1620-1647 |
| Operators see timing in MCP session detail, the text export and the bench report; no UI change | Unclear | journal text export 2019-2045; `options.js` 4225-4255 |

### Tokens and cost
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Autopilot tokens and cost are labelled by source; no more invented zeros or Grok prices | Likely | `agent-loop.js` 2007-2008; `cost-tracker.js` 85-88; `automation-logger.js` 884-886; `pricing.ts` 68-74 |
| FSB marks the host's model time, tokens and cost as unavailable; host metrics come only from the bench driver | Likely | `mcp-metrics-recorder.js` 70-84; `claude-stream.ts` 115-120; `delegation-event-store.js` 569-570 |

### Benchmark suite, outcome proof, and run identity
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Plain Node scripts in `scripts/bench/`, run on request only, with no dependencies | Confident | `tests/screenshot-uat.test.js`; `mcp/package.json:57` |
| The autopilot arm runs `run_task` over an SDK stdio client; the MCP arm scripts headless Claude Code | Unclear | `background.js` 13639-13647; `mcp-session-recorder.js:2226`; `claude-profile.ts` 179-207 |
| Success is checked in code; agent claims are stored as "claimed" | Likely | `agent-loop.js` 2091-2095; `agent-bridge.ts` 123-134; `mcp-bridge-client.js` 2534-2540 |
| Each run records its identity; `fsb://config` returns the real config keys plus the manifest version | Likely | `mcp-bridge-client.js` 2702-2707; `config.js` 18-21; `ws-client.js:1547` |
| Each run is saved immediately; the 40 recorded sessions are exported first | Likely | `automation-logger.js` 20-28; journal 28-29 |

## Corrections Made

### MCP arm and change footprint (question 1)
- **Original assumption:** Scripted headless Claude Code drives the MCP arm, with an optional scripted Cursor arm.
- **User correction:** "minimal diff (as minimal changes to MCP as possible) (extension does most of the heavy lifting)".
- **Recorded as:** D-01: no `mcp/` source changes in Phase 66; the extension does the work. The scripted Claude Code driver stays, because it lives in `scripts/bench/` and touches nothing under `mcp/` (D-14).

### Task source (question 2)
- **User choice:** Recommended. A core set of local fixture tasks stays unchanged through Phase 71; a small live-site set is reported separately.

### Suite size (question 3)
- **User choice:** Recommended. About 12 tasks × 10 alternating runs × 2 baseline arms.

### Autopilot baseline model (question 4)
- **User choice:** Recommended. Pin an explicit current xAI model ID, record the model string xAI returns, and fix the Grok rows of the price table.

### Operator surface (question 5)
- **User choice:** 5a. Timing appears in `get_session_detail`, its text export and the bench report; the control panel is unchanged.

### Added by the user
- **Settings MCP tool:** a new tool to view all FSB control-panel settings and set a single one efficiently, including the Jev toggle.
  - **Placement:** a new phase right after 66 (recommended option chosen).
  - **Write scope:** "everything except secrets". The user chose this over the recommended allowlist that also excluded safety settings.
- **Backwards compatibility:** with Jev disabled, all of FSB must stay backwards compatible (D-02).

## External Research

- **Claude Code 2.1.283 `result` event.** It carries `duration_ms`, `duration_api_ms`, `total_cost_usd`, `usage`, `modelUsage`, `num_turns` and `ttft_ms`.
  - On a subscription login `costBasis` is `list`, so the cost is a list-price estimate, not a bill.
  - Whether tool search is on shows in `init.tools`: it lists `ToolSearch` when on and `WaitForMcpServers` when off.
  - Sources: a local run; https://code.claude.com/docs/en/costs; https://code.claude.com/docs/en/mcp
- **xAI pricing and model.** `grok-4-1-fast` was retired on 2026-08-15 and is now served by grok-4.3.
  - grok-4.3 costs $1.25 / $2.50 per million tokens; FSB's price table still says $0.20 / $0.50.
  - Responses carry `usage.cost_in_usd_ticks`.
  - Reasoning tokens are reported separately from `completion_tokens`.
  - Sources: https://docs.x.ai/developers/migration/may-15-retirement; https://docs.x.ai/developers/cost-tracking; https://docs.x.ai/developers/pricing
- **Cursor.** `cursor-agent` 2026.09.08 runs headless (`-p --output-format stream-json`), but its result reports only duration: no tokens, cost or model. Source: https://cursor.com/docs/cli/reference/output-format
- **Runs per arm.** A simulated bootstrap power check shows 5 runs per task is only a smoke test. The practical minimum is 10 alternating runs, combined across tasks with a hierarchical bootstrap. A confidence interval that crosses 1.0 counts as "inconclusive".
