# Phase 10: MCP-philosophy parity for autopilot driver — visual session + metrics + driving-model attribution - Context

**Gathered:** 2026-05-31 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

**In scope (Phase 10):** Extend the existing tool-parity (INV-02) from tool DEFINITIONS to tool LIFECYCLE + TELEMETRY + DRIVING-MODEL ATTRIBUTION. Make FSB autopilot behave as an "MCP client in spirit" so the visual session panel + metrics dashboard show autopilot activity the same way they show MCP activity today. Phase 10 is the third of three sibling phases (8 + 9 + 10) splitting the v0.10.0 half-step closure work per Phase 8 CONTEXT.md D-06.

**Out of scope for Phase 10:**
- MCP wire shape (INV-01) — UNTOUCHED. Tool-definitions parity stays byte-frozen.
- Phase 8 step.transition / receipt mint path — independent layer; Phase 10 emissions are sibling defensive calls at the SAME `agent-loop.js` sites (1861, 1974).
- Phase 9 SurvivabilityAdapter — independent layer.
- Lattice-side changes — Phase 10 is purely FSB-side wiring; no Lattice dependencies; INV-06 frozen.
- Storage migration of legacy `fsbMcpVisualSessions` key — Phase 256 sliding-window lifecycle is the authoritative layer; legacy key stays byte-frozen.

**Phase boundary anchor (ROADMAP.md Phase 10 entry):** "MCP-philosophy parity for autopilot driver — visual session + metrics + driving-model attribution"; locked decisions D-01..D-07 below.
</domain>

<decisions>
## Implementation Decisions

### Visual-session storage schema unification

- **D-01:** Extend the per-tab lifecycle entry shape at `extension/utils/mcp-visual-session-lifecycle.js:355-382` (in-flight `nextEntry` shape written under storage key prefix `mcpVisualSession:<tabId>`) with a single optional `driver: 'autopilot' | 'mcp'` discriminator field. Default to `'mcp'` when absent (backward-compat with restored entries from prior versions in `restoreVisualSessionLifecyclesFromStorage` at lines 557-621).

  The legacy `fsbMcpVisualSessions` key at `extension/background.js:2119` (v0.9.36 single-key map shape) STAYS BYTE-FROZEN — that is the explicit-session record layer, not the per-tab lifecycle layer Phase 10 piggybacks on. The brief's conflation of these two stores is corrected here: the architecturally correct extension is at the v0.9.62 lifecycle layer because that is the layer `recordVisualSessionTick` mutates (lines 385-403) and the layer SW-restore on wake reads (lines 557-621).

  Rationale: adding a field rather than a prefix preserves the existing replay logic. UI dashboard consumers reading the per-tab entries get the discriminator transparently without forking.

### Allowlist label for autopilot

- **D-02:** Add a single new entry `'FSB Autopilot'` to the `MCP_VISUAL_CLIENT_LABELS` allowlist array at `extension/utils/mcp-visual-session.js:4-18`. Placement at the end of the array keeps `CLIENT_LABEL_MAP` regeneration order-stable (the map is rebuilt from the array at lines 20-23).

  Verified key non-collision: `toClientLabelKey('FSB Autopilot')` at line 29 produces `'fsbautopilot'` — no existing entry collides.

  FSB-internal UI state — NOT an INV-01 wire change. The allowlist controls overlay rendering and content-script delivery, not MCP tool-definitions. INV-01 stays untouched.

  Without this label, `recordVisualSessionTick` at `mcp-visual-session-lifecycle.js:324-333` rejects autopilot calls with `client_not_allowed` and the overlay silently no-ops. This is the silent-failure risk Phase 8 08-CONTEXT.md D-04 flagged for the cross-allowlist case.

### Autopilot `recordVisualSessionTick` + `recordDispatch` call sites

- **D-03:** Both new emitter calls are inserted in `extension/ai/agent-loop.js` adjacent to the existing Phase 8 `sendLatticeStepTransition` emissions:
  - **visual-session tick** fires at the TOOL_DISPATCH boundary, immediately after the Phase 8 emission block at lines 1974-1985. Calls `recordVisualSessionTick(session.tabId, session.agentId, { client: 'FSB Autopilot', visualReason, isFinal })` where `visualReason` reflects the tool name + dispatch intent.
  - **`recordDispatch` call** fires AFTER the tool execution completes — after the existing tool result push but BEFORE the next `ci` iteration. Calls `fsbMcpMetricsRecorder.recordDispatch({...})` with the full attribution payload (see D-04).

  Both wrapped in the same defensive `if (typeof X === 'function')` guard pattern as Phase 8 emissions, with try/catch fire-and-forget swallowing.

  NEITHER call goes inside the offscreen bridge (bridge has no tool-name knowledge per Phase 8 D-05) nor inside any `setTimeout(...)` lambda (preserves INV-04; matches Phase 8 D-07 + D-01 patterns).

### Metrics attribution depth + driving-model identity capture

- **D-04:** Autopilot calls `fsbMcpMetricsRecorder.recordDispatch({...})` ONCE per tool call from the agent-loop tool-dispatch boundary with payload:

  ```js
  {
    client: 'FSB Autopilot',
    tool: call.name,
    requestPayload: call.args,
    success: result.success,
    dispatcher_route: 'autopilot',  // NEW route literal; requires extending the route allowlist at mcp-metrics-recorder.js:275-277 (one-line change)
    drivingModel: {
      provider: session.providerConfig.providerKey,
      model_id: session.providerConfig.modelName,
      reasoning_tokens: provider === 'xai' ? rawResponse?.usage?.completion_tokens_details?.reasoning_tokens : undefined
    }
  }
  ```

  **Driving-model identity source:** `session.providerConfig` set at `agent-loop.js:1191-1196` is the SOLE source of truth for what provider+model the current session uses. The refresh check at lines 1180-1186 supports mid-session provider switches, which is why per-tool-call cadence (not per-session) is correct.

  **`reasoning_tokens` capture:** xAI-specific per LSDK-16 / FINT-08 nuance. Extract from `executeViaBridge`'s returned `rawResponse.usage.completion_tokens_details.reasoning_tokens` when `provider === 'xai'`; undefined otherwise. Bridge returns `rawResponse` byte-identically per FINT-08 narrative.

  **`recordDispatch` row schema extension:** New top-level `drivingModel` field on the row written at `mcp-metrics-recorder.js:327-347`. Recorder code change is minimal — pass-through of the new optional field.

### Phase split + UAT shape

- **D-05:** Phase 10 stays as a single phase (no further sub-split). Three plans:
  - **Plan 10-01:** Visual-session schema extension — `mcp-visual-session.js` allowlist + `mcp-visual-session-lifecycle.js` `driver` field + autopilot `recordVisualSessionTick` call at `agent-loop.js:~1985` + Wave 0 smoke scaffold.
  - **Plan 10-02:** Metrics recorder integration — `mcp-metrics-recorder.js` route allowlist + `drivingModel` field + autopilot `recordDispatch` call at `agent-loop.js` post-tool-execution + smoke fill covering xAI reasoning_tokens edge case.
  - **Plan 10-03:** Documentation ceremony — REQUIREMENTS.md FINT-16/17/18 + INV-02 wording extension + LATTICE-PIN.md Phase 10 row (SHA unchanged) + audit doc closure of MCP-philosophy parity row.

- **D-06:** Per-axis UAT-10 (~3-5 min Chrome MV3 reload session) — but per user directive 2026-05-31 ("skip UAT to last"), Phase 10 UAT is DEFERRED to consolidated end-of-milestone UAT alongside UAT-08 + UAT-09. Verifier emits `human_needed`; user runs all three UATs in a single Chrome session after Phase 10 ships.

  UAT-10 sub-assertions:
  1. Visual-session overlay lights up during one autopilot iteration.
  2. SW console shows allowlist accept (no `client_not_allowed` rejection).
  3. Dashboard shows autopilot rows with `client: 'FSB Autopilot'` + `driver: 'autopilot'`.
  4. xAI run captures `drivingModel.reasoning_tokens` non-zero in at least one row (use xAI model that generates reasoning).
  5. No INV-01/02 regression — tool-definitions parity 142 PASS holds.

### Invariants preserved + verification

- **D-07:** Hard invariants this phase explicitly preserves:
  - **INV-01 MCP wire UNTOUCHED.** Phase 10 is FSB-side autopilot wiring; allowlist + lifecycle + recorder changes are all FSB-internal UI/telemetry state.
  - **INV-02 Tool surface parity EXTENDED.** Phase 10 promotes INV-02 wording from "tool DEFINITIONS parity" to "tool DEFINITIONS + LIFECYCLE + TELEMETRY + DRIVING-MODEL ATTRIBUTION parity". REQUIREMENTS.md INV-02 row updated as part of Plan 10-03 ceremony.
  - **INV-03 Provider parity** — UNTOUCHED.
  - **INV-04 setTimeout iterator BYTE-FROZEN** — additive only. Phase 10 emissions go INSIDE iteration body, never inside setTimeout lambdas. Plan verification asserts `grep -c "setTimeout" extension/ai/agent-loop.js == 8` post-phase.
  - **INV-05 No deprecated module resurrection** — UNTOUCHED.
  - **INV-06 Lattice SHA frozen** — Phase 10 has zero Lattice dependencies.

### Claude's Discretion

- Exact `visualReason` string semantic for autopilot ticks (e.g., `'autopilot-tool-dispatch:' + call.name` vs `'fsb-autopilot:tool:' + call.name`). Planner chooses based on MCP-bridge precedent at `mcp-bridge-client.js:734, 759, 782`.
- Whether `recordDispatch` autopilot rows should also carry the `step.transition` envelope's `runId` for cross-reference with Phase 8 receipts (forward-compat for v0.11.0+ unified observability). Planner decides; not blocking.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

**Phase 10 source-of-truth files:**
- `.planning/ROADMAP.md` (Phase 10 entry)
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md` (INV-02 at line 26; FINT-10/11/12 from Phase 8 at lines 78-81; Phase 10 adds FINT-16/17/18 siblings + updates INV-02 row)
- `.planning/v0.10.0-MILESTONE-AUDIT.md` (MCP-philosophy parity row in audit; UAT-10 deferred to consolidated UAT per user 2026-05-31)
- `.planning/LATTICE-PIN.md` (Phase 10 row gets SHA UNCHANGED; zero Lattice commits)

**Prior phase CONTEXT.md files (locked decisions):**
- `.planning/phases/08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-/08-CONTEXT.md` (D-05 attribution rationale; D-07 invariants; emission site precedents)
- `.planning/phases/09-fsb-survivabilityadapter-activated-for-mv3-sw-eviction-resum/09-CONTEXT.md` (Phase 9 patterns — to be written separately; Phase 10 is independent of 9)

**FSB-side source files (Phase 10 implementation surface):**
- `extension/utils/mcp-visual-session.js` (allowlist lines 4-18; toClientLabelKey line 29)
- `extension/utils/mcp-visual-session-lifecycle.js` (recordVisualSessionTick lines 306-403; restore path 557-621; storage prefix `mcpVisualSession:` line 58)
- `extension/utils/mcp-metrics-recorder.js` (recordDispatch lines 261-391; route allowlist 275-277; row schema 327-347)
- `extension/ws/mcp-bridge-client.js` (MCP precedent — `_recordVisualSessionTickIfPresent` at lines 616-635; call sites 734, 759, 782)
- `extension/ai/agent-loop.js` (Phase 8 emission sites at 1861 + 1974; `session.providerConfig` set at 1191-1196; bridge call at line 1061)
- `extension/background.js` (line 13 importScripts of Phase 8 emitter; legacy `fsbMcpVisualSessions` key at 2119; storage read/write 604-623 — BYTE-FROZEN)

**Test files (Phase 10 will extend or add siblings):**
- `tests/lattice-step-emitter-smoke.test.js` (Phase 8 baseline 38 PASS — Phase 10 must not regress)
- Phase 10 adds: `tests/mcp-philosophy-parity-smoke.test.js` (autopilot visual-session + metrics integration; estimate 20+ PASS)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`recordVisualSessionTick`** at `mcp-visual-session-lifecycle.js:306-403` is driver-agnostic — accepts `client` via `normalizeMcpVisualClientLabel` validation. Reusable verbatim once allowlist accepts the new label.
- **`recordDispatch`** at `mcp-metrics-recorder.js:261-391` is dispatcher-attributed — accepts `client + tool + payload + success`. Reusable with the one-line route allowlist extension at line 275-277.
- **MCP-bridge call-site pattern** at `mcp-bridge-client.js:734, 759, 782` is the architectural template for the autopilot integration — same `recordVisualSessionTick` + `recordDispatch` pairing in the dispatcher try/finally.
- **Phase 8 defensive guard pattern** at `agent-loop.js:1861, 1974` — `if (typeof X === 'function')` + try/catch + fire-and-forget. Phase 10 emissions reuse this verbatim.

### Established Patterns

- **Allowlist gate at `mcp-visual-session-lifecycle.js:324-333`** rejects unknown clients with `client_not_allowed`. Phase 10 MUST add the allowlist entry before the call site to avoid silent no-op.
- **Per-tab lifecycle storage** at storage prefix `mcpVisualSession:<tabId>` is the Phase 256 sliding-window owner. Phase 10 extends the entry shape; restore-on-wake reads transparently.
- **`session.providerConfig` is THE source of truth for driving-model identity** — set at session bootstrap at `agent-loop.js:1191-1196` with mid-session refresh at 1180-1186.
- **xAI `reasoning_tokens` extraction** from `rawResponse.usage.completion_tokens_details.reasoning_tokens` per FINT-08 + LSDK-16. Bridge returns rawResponse byte-identically.

### Integration Points

- **agent-loop tool-dispatch boundary** at lines 1974-1985 — Phase 8 step.transition emission + Phase 10 visual-session tick + Phase 10 recordDispatch all converge here.
- **mcp-visual-session-lifecycle alarm** — already running; Phase 10 ticks join the existing per-tab alarm cadence transparently.
- **dashboard reads from per-tab lifecycle entries** — Phase 10 driver field surfaces transparently as a new column or filter.

</code_context>

<specifics>
## Specific Ideas

- "FSB autopilot behaves as an MCP client in spirit" (user framing 2026-05-31).
- Per-axis UAT-10 DEFERRED to consolidated end-of-milestone UAT per user 2026-05-31 ("skip UAT to last").
- xAI `grok-build-0.1` (the model the user used for UAT-1) generates `reasoning_tokens` — perfect for UAT-10 driving-model attribution verification.

</specifics>

<deferred>
## Deferred Ideas

- **Unified `fsbVisualSessions` envelope key** rewrite — out of scope; would touch every existing reader. Defer to a v0.11.0+ migration phase if dashboard fragmentation becomes a measured problem.
- **Cross-reference Phase 8 `runId` in autopilot dispatch rows** for unified observability — planner's discretion; not blocking; forward-compat for v0.11.0+.
- **Migrating MCP bridge to use the same `driver` discriminator** so existing MCP rows get `driver: 'mcp'` explicitly — out of scope; current `'mcp'` default-when-absent handles it transparently.

### Reviewed Todos (not folded)

- None.

</deferred>
