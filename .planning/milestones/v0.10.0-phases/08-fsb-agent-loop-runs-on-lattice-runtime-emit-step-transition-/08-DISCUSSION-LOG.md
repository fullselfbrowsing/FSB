# Phase 8: FSB agent brain on Lattice runtime - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in 08-CONTEXT.md — this log preserves the analysis.

**Date:** 2026-05-31
**Phase:** 08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-
**Mode:** assumptions
**Areas analyzed:** Lattice runtime wiring (step.transition + receipt cadence); MV3 SW-eviction survivability; MCP-philosophy parity (visual session + metrics attribution); Phase split + UAT shape

## Assumptions Presented

### Lattice runtime wiring (step.transition cadence + receipt mint)

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `step.transition` fires at TWO boundaries per iteration — LLM_TURN (after API round-trip at agent-loop.js:~1853) AND TOOL_DISPATCH (per tool call at agent-loop.js:~1906); distinguished via metadata.stepName not new RunEventKind | Likely | lattice/packages/lattice/src/tracing/tracing.ts:11-28 (step.transition already in union); lattice/packages/lattice/src/contract/checkpoint.ts:32-42 + 73 (STEP_TRANSITION_EVENT_NAME single literal); extension/offscreen/lattice-host.js:295-371 (single-kind listener) |
| Receipt-mint cadence is per step.transition (1 receipt per event), gated by signer !== undefined; uses ephemeral Ed25519 signer already minted at offscreen boot | Confident | lattice/packages/lattice/src/contract/checkpoint.ts:201 (signer gate); extension/offscreen/lattice-host.js:269-274 (ephemeral signer); extension/offscreen/lattice-host.js:316-348 (per-event mint contract; 324-345 reply bus) |

### MV3 SW-eviction survivability activation

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| FSB_LATTICE_RUNTIME_ADAPTER_ENABLED flips ON at SW boot; serialize() runs as additive sidecar at existing persist() callsites (agent-loop.js:1840, 2438); deserialize/resume at runAgentLoop entry (agent-loop.js:1215); INV-04 iterator strictly additive | Likely | agent-loop.js:1840, 2438 (existing persist call sites); extension/ai/lattice-runtime-adapter.js:75, 127-129 (flag short-circuit + storage prefix); lattice/packages/lattice/src/runtime/survivability.ts:60-68 (ResumePolicy depends on per-step marker) |

### MCP-philosophy parity for autopilot

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Visual-session unification uses unified fsbMcpVisualSessions store with `driver: 'autopilot' \| 'mcp'` discriminator; autopilot calls recordVisualSessionTick mirroring mcp-bridge-client.js pattern; allowlist gets new label 'FSB Autopilot' | Likely | extension/utils/mcp-visual-session-lifecycle.js:325-333, 355-382 (driver-agnostic recordVisualSessionTick + allowlist check); extension/ws/mcp-bridge-client.js:734, 759, 782 (reference call-site pattern); extension/background.js:2118 (fsbMcpVisualSessions key) |
| Metrics attribution on autopilot caller side (agent-loop calls recordDispatch with client: 'FSB Autopilot' + driver: 'autopilot' + driving-model identity); offscreen bridge stays neutral | Confident | extension/utils/mcp-metrics-recorder.js:7-8, 264-302 (recorder takes client+tool+payload; dispatcher-attributed pattern); extension/offscreen/lattice-host.js:485-516 (bridge has no tool-name knowledge); agent-loop.js:1853 (providerKey + _formatAssistantMessage already knows provider/model) |

### Phase split + UAT shape

| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Split into THREE phases — 8 = Lattice runtime wiring; 9 = SurvivabilityAdapter activation; 10 = MCP-philosophy parity. Different rollback risk profiles; Phase 5 latent-bug surface argues against bundling | Likely | v0.10.0-MILESTONE-AUDIT.md:51-62 (G1 + G2 + Flow 4 each on different surfaces); quick tasks 260531-63l (65b00d75) + 260531-6n5 (f29b4292) demonstrate Lattice-MV3 surface is bug-prone at first Chrome reload; user 2026-05-31 message ("as many phases as required, as many validations as required") |
| Per-axis UAT (3 separate Chrome MV3 sessions ~3-5 min each) rather than consolidated milestone-end | Likely | UAT-1 (2026-05-31 PASS) consolidated 4 phases but uncovered 2 latent bugs that required inline-fix detours; v0.10.0-MILESTONE-AUDIT.md:275 failure-handling pattern is decisive when scoped to single phase |

## Corrections Made

No corrections — all assumptions confirmed by user 2026-05-31 ("Yes, proceed").

## External Research

Not performed — `Needs External Research` content from the analyzer was a single planner-time directive (assess Lattice-side `CreateReceiptInput` extension risk at research-phase by reading `lattice/packages/lattice/src/receipts/receipt.ts` + `receipts/types.ts`), captured as D-04 carve-out trigger in CONTEXT.md.

## Analyzer Provenance

Spawned gsd-assumptions-analyzer agent (agentId ad939cb387bf4db2e) which read:
- ROADMAP.md lines 360-388 + invariants block
- PROJECT.md (Lattice integration model + INV-01..06)
- v0.10.0-MILESTONE-AUDIT.md (G1/G2/G3 + Flow 4)
- Prior phase CONTEXT.md files (05, 06, 07)
- extension/ai/agent-loop.js (iterator boundaries)
- extension/ai/lattice-provider-bridge.js + lattice-runtime-adapter.js
- extension/offscreen/lattice-host.js (existing listener)
- extension/utils/mcp-visual-session-lifecycle.js + mcp-visual-session.js + mcp-metrics-recorder.js
- extension/ws/mcp-bridge-client.js (MCP integration reference)
- extension/background.js (SW load order + ensureLatticeOffscreen)
- lattice/packages/lattice/src/contract/checkpoint.ts + tracing/tracing.ts + runtime/survivability.ts
- tests/lattice-survivability-smoke.test.js + lattice-checkpoint-smoke.test.js
- .planning/codebase/* (STRUCTURE, ARCHITECTURE, CONVENTIONS, INTEGRATIONS, STACK, TESTING, CONCERNS)
