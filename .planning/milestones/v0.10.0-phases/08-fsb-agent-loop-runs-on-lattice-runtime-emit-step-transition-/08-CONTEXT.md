# Phase 8: FSB agent brain on Lattice runtime (step.transition + per-step receipt mint) - Context

**Gathered:** 2026-05-31 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

**In scope (Phase 8):** Wire FSB's autopilot agent loop to emit `step.transition` events into Lattice's tracer and mint per-step Capability Receipts via `createCheckpointHook` in the production code path. Close audit gap G1 (SW-side `lattice-step-transition` sender missing). Flip Flow 4 from partial-by-design to complete.

**Out of scope for Phase 8 (split into sibling phases per D-06):**
- SurvivabilityAdapter activation + `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` flag flip + persist/restore wiring → **Phase 9** (closes audit gap G2).
- MCP-philosophy parity for autopilot driver: visual-session lifecycle wiring + metrics recorder + driving-model attribution + storage schema unification → **Phase 10**.
- Lattice-side primitive extensions: explicitly not undertaken in Phase 8 unless planner research reveals the existing `createCheckpointHook` cannot accept FSB's tool-result envelope shape without an extension. If extension is required, INV-06 carve-out applies + LATTICE-PIN.md SHA bump per established pattern.
- Phase 6+7 provider bridge architecture: BYTE-FROZEN, additive consumption only.

**Phase boundary anchor (ROADMAP.md lines 360-388):** "FSB agent brain on Lattice runtime + MCP-philosophy parity for autopilot driver" — Phase 8 covers axis 1 (Lattice runtime wiring); axes 2 + 3 split into Phases 9 + 10.
</domain>

<decisions>
## Implementation Decisions

### Step.transition emission (cadence + boundary)

- **D-01:** `step.transition` events fire at TWO distinct boundaries per `runAgentIteration` invocation:
  1. **LLM_TURN boundary** — emitted just after `_formatAssistantMessage` push at `extension/ai/agent-loop.js:~1853` (one event per provider API round-trip).
  2. **TOOL_DISPATCH boundary** — emitted inside the `for (var ci = 0; ci < toolCalls.length; ci++)` loop at `extension/ai/agent-loop.js:~1906` (one event per tool call).

  Distinguished via `metadata.stepName: 'LLM_TURN' | 'TOOL_DISPATCH'`, NOT via new `RunEventKind` literals (no Lattice-side extension needed; existing `step.transition` literal in `lattice/packages/lattice/src/tracing/tracing.ts:11-28` accepts both via metadata).

  The setTimeout iterator callsites at `agent-loop.js:~1864 / ~2462 / ~2531 / ~2541` (INV-04 byte-frozen pattern) are NOT step boundaries — they are scheduling artifacts. Tracer calls go inside the iteration body, NEVER inside the setTimeout lambdas, to preserve the INV-04 pattern character-for-character.

- **D-02:** Receipt-mint cadence is **per `step.transition`** (1 receipt per event), gated by `signer !== undefined` per `lattice/packages/lattice/src/contract/checkpoint.ts:201`. Signer source: the ephemeral Ed25519 key already minted at offscreen boot per `extension/offscreen/lattice-host.js:269-274`. Aggregation, sidecar, and configurable-cadence flags are REJECTED for this phase — they invite Lattice-side extension and break the offscreen handler's existing per-event `lattice-receipt-minted` bus contract.

### SW-side `lattice-step-transition` sender (closes G1)

- **D-03:** `extension/background.js` gains a new function `sendLatticeStepTransition(envelope)` that posts `{type: 'lattice-step-transition', envelope}` to the offscreen host via `chrome.runtime.sendMessage`. The function is idempotent and fire-and-forget (no `await`). The agent-loop calls this function from each step-boundary site identified in D-01.

  Wiring follows the Phase 6 `ensureLatticeOffscreen()` pattern — the offscreen host is already opened at SW startup per Phase 6 FINT-07b; Phase 8 only adds the message producer, not document creation.

  The offscreen handler at `extension/offscreen/lattice-host.js:~295-371` already listens for `lattice-step-transition` and routes it through `createCheckpointHook` — no offscreen-side changes required in Phase 8.

### Lattice-side extension boundary (INV-06 carve-out probability)

- **D-04:** Default position: NO Lattice-side commits in Phase 8. `current_lattice_sha` stays frozen at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`.

  **Carve-out trigger (the only condition that bumps the SHA):** if planner research determines that `createCheckpointHook` (`lattice/packages/lattice/src/contract/checkpoint.ts:122-130`) cannot accept FSB's tool-result envelope shape (specifically: if `CreateReceiptInput` in `receipts/receipt.ts` requires extension to carry FSB's tool dispatch metadata in the receipt body, not just tracer metadata), THEN a Lattice-side extension lands on `fsb-integration-experiments` FIRST, LATTICE-PIN.md gets a new Phase 8 row with the new SHA, and the FSB-side wiring consumes the extended hook.

  Planner is explicitly directed to read `lattice/packages/lattice/src/receipts/receipt.ts` + `receipts/types.ts` during research-phase. The answer to "is the SHA frozen?" is the binary output of that read.

### Phase split + UAT shape

- **D-05:** Phase 8 stays narrowly scoped to **Lattice runtime wiring axis only** (step.transition + receipt mint + SW-side sender). The two other axes split as follows:
  - **Phase 9** — SurvivabilityAdapter activation (`FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` flag flip + `serialize`/`deserialize`/`resume` wiring at `agent-loop.js:1840 + 2438 + 1215`). Closes audit gap G2.
  - **Phase 10** — MCP-philosophy parity (visual-session lifecycle driver discriminator + metrics recorder per tool call + driving-model attribution + storage schema unification).

  Rationale: three axes have different rollback risk profiles. Phase 8 is medium-risk (additive to agent-loop). Phase 9 is highest-risk (touches persist callsites adjacent to INV-04). Phase 10 is lowest-risk (purely additive UI/telemetry sidecar). Phase 5 surfaced 2 latent bugs at first Chrome reload (260531-63l + 260531-6n5) — bundling all three multiplies rollback blast radius. Splitting respects user's 2026-05-31 directive ("as many phases as it requires, as many validations as required").

- **D-06:** Each phase carries an independent UAT — **per-axis UAT, not consolidated**.

  Phase 8 UAT (target ~3-5 min Chrome MV3 reload session):
  1. Reload extension at `chrome://extensions`.
  2. Open SW console + offscreen console.
  3. Run one autopilot session with a simple prompt.
  4. Assert: SW console shows `lattice-step-transition` envelope sent per step boundary; offscreen console shows `lattice-receipt-minted` per event (or `lattice-receipt-mint-failed` with `reason: 'no-signer'` if signer absent — both acceptable; failure modes must be visible).
  5. Assert: receipts mint at BOTH step kinds (`LLM_TURN` + `TOOL_DISPATCH`) — verify via offscreen console envelope payload `metadata.stepName`.
  6. Assert: zero `RunEventKind` unknowns (`tracer` doesn't choke on an unrecognized event kind).
  7. Assert: existing autopilot iteration completes successfully — no INV-04 iterator regression.

  Failure handling pattern follows v0.10.0-MILESTONE-AUDIT.md line 275: file-touch diff identifies offending plan; per-axis scope makes attribution decisive.

### Invariants preserved + verification

- **D-07:** Hard invariants this phase explicitly preserves:
  - **INV-01 MCP wire contracts** — UNTOUCHED. Phase 8 is internal autopilot wiring; no MCP tool-definitions surface change.
  - **INV-02 Tool surface parity** — UNTOUCHED. Phase 8 doesn't change which tools the autopilot or MCP can call.
  - **INV-03 Provider parity** — UNTOUCHED. All 7 providers continue to route via the offscreen bridge unconditionally per Phase 7.
  - **INV-04 MV3-survivability iterator BYTE-FROZEN** — additive only. Tracer/hook calls go INSIDE iteration body, never inside `setTimeout(...)` lambdas. Iterator absolute line positions may shift due to added function calls but the structural pattern (`session._nextIterationTimer = setTimeout(...)`) stays character-identical at all 4 callsites. Plan verification asserts `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 post-phase.
  - **INV-05 No deprecated module resurrection** — UNTOUCHED.
  - **INV-06 Lattice primitives live in Lattice's repo** — DEFAULT FROZEN per D-04; conditional carve-out only on planner-determined extension trigger.

### Claude's Discretion

- Naming for the new `lattice-step-transition` SW-side function (`sendLatticeStepTransition` is the working name but the planner may choose a different identifier per FSB's snake_case-leaning convention in `extension/utils/*`).
- Exact ordering of the two `step.transition` emissions inside `runAgentIteration` — the planner determines whether LLM_TURN fires before or after the local `_currentStepName` marker update.
- Whether the SW-side sender code lives as a top-level function in `background.js` (likely follows Phase 6's `ensureLatticeOffscreen()` pattern at ~13129) or as a sibling module file under `extension/ai/` (likely follows the Phase 6 bridge-shim pattern in `lattice-provider-bridge.js`). Planner chooses based on which keeps the SW load order intact (153 importScripts → 154 max).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

**Phase 8 source-of-truth files:**
- `.planning/ROADMAP.md` (lines 360-388 = Phase 8 entry; lines 80-92 = INV-01..06 statements)
- `.planning/PROJECT.md` (Lattice integration model + hard invariants + deferred ideas)
- `.planning/REQUIREMENTS.md` (existing FINT-01..09 + LSDK-01..22 + INV-01..06; Phase 8 may introduce FINT-10..N for step.transition + receipt mint)
- `.planning/v0.10.0-MILESTONE-AUDIT.md` (audit gap G1 definition at line 51-55; Flow 4 definition at line 59-62; UAT failure-handling pattern at line 275)
- `.planning/LATTICE-PIN.md` (current SHA `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`; Phase 6 row for `ensureLatticeOffscreen` integration pattern reference)

**Prior phase CONTEXT.md files (locked decisions):**
- `.planning/phases/05-mv3-survivability-bundler/05-CONTEXT.md` (D-22 documented carryforward gaps + offscreen bridge architecture lock)
- `.planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-CONTEXT.md` (Strategy A: autopilot does own fetch via bridge; INV-03 wording strengthening)
- `.planning/phases/07-archive-fsb-custom-provider-stack/07-CONTEXT.md` (Strategy B: flag-strip only; physical archive deferred)

**FSB-side source files (Phase 8 implementation surface):**
- `extension/ai/agent-loop.js` (the iterator + tool dispatch loop; step boundary callsites; ~2700 lines)
- `extension/ai/lattice-provider-bridge.js` (Phase 6 shim — REFERENCE for Phase 8's SW-side sender pattern)
- `extension/background.js` (SW; specifically `ensureLatticeOffscreen()` at ~13129 + the `chrome.offscreen.createDocument` call at ~13134)
- `extension/offscreen/lattice-host.js` (offscreen host; existing `lattice-step-transition` listener at ~295-371; `lattice-receipt-minted` reply at ~324-345)

**Lattice-side source files (read-only reference unless D-04 carve-out triggered):**
- `lattice/packages/lattice/src/tracing/tracing.ts` (lines 11-28 = `RunEventKind` union; confirms `step.transition` already a literal)
- `lattice/packages/lattice/src/contract/checkpoint.ts` (createCheckpointHook factory; lines 122-130 = options shape; line 201 = signer gate)
- `lattice/packages/lattice/src/runtime/survivability.ts` (lines 60-68 = ResumePolicy — informational for Phase 8; activated in Phase 9)
- `lattice/packages/lattice/src/receipts/receipt.ts` (PLANNER must read at research-phase to determine D-04 carve-out trigger)
- `lattice/packages/lattice/src/receipts/types.ts` (companion to receipt.ts for D-04 analysis)

**Test files (Phase 8 will extend or add siblings):**
- `tests/lattice-checkpoint-smoke.test.js` (existing Lattice-side checkpoint round-trip; Phase 8 may add an FSB-side smoke that exercises the SW-side sender)
- `tests/lattice-provider-bridge-smoke.test.js` (Phase 6 baseline; Phase 8 must not regress)

**Lattice version pin:**
- Lattice branch: `fsb-integration-experiments` HEAD `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (FROZEN unless D-04 carve-out)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 6 SW-side bridge shim pattern** at `extension/ai/lattice-provider-bridge.js` (146 lines) is the architectural template for Phase 8's SW-side `lattice-step-transition` sender. Same `chrome.runtime.sendMessage` mechanism, same dual-export (`globalThis` + `module.exports`) idiom, same `crypto.randomUUID()` request ID pattern (adapted: Phase 8 doesn't need a request-response cycle; fire-and-forget).
- **Phase 6 offscreen host listener** at `extension/offscreen/lattice-host.js:~295-371` already implements the `lattice-step-transition` consumer wired through `createCheckpointHook`. Phase 8 is producer-only — zero offscreen-side changes.
- **Ephemeral Ed25519 signer** at `extension/offscreen/lattice-host.js:~269-274` provides the signer instance for receipt minting; no key management or persistence required for Phase 8.
- **Phase 6 `ensureLatticeOffscreen()` pattern** at `extension/background.js:~13129` is the integration template: idempotent helper called once at startup; Phase 8 piggybacks on the existing offscreen lifecycle.

### Established Patterns

- **INV-04 setTimeout iterator pattern** at `extension/ai/agent-loop.js:~1864 / ~2462 / ~2531 / ~2541`: `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId); }, delayMs);`. Phase 8 MUST add tracer calls before the setTimeout schedule, never inside the lambda. Plan verification asserts `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 post-phase (unchanged from Phase 7 baseline).
- **Strategy A (Phase 6 CONTEXT.md)** — autopilot path does own fetch in offscreen; bridge returns rawResponse. Phase 8 inherits this: the step.transition envelope FSB sends to offscreen carries semantic step metadata, not provider HTTP details.
- **Dual-export idiom** (`globalThis.X = X; if (typeof module !== 'undefined') module.exports = X;`) — required for SW classic-script + Node test environments. Phase 8's SW-side sender follows this.
- **`recordVisualSessionTick` callsite pattern** from `extension/ws/mcp-bridge-client.js:734, 759, 782` — REFERENCE for Phase 10's autopilot wiring (informational only in Phase 8).

### Integration Points

- **SW → offscreen message bus** (`chrome.runtime.sendMessage` with `type: 'lattice-step-transition'`) — Phase 5 D-16 contract; Phase 6 reused for `lattice-provider-execute`; Phase 8 adds the third message type on the same channel.
- **Offscreen → SW reply bus** (`chrome.runtime.sendMessage` with `type: 'lattice-receipt-minted'` or `'lattice-receipt-mint-failed'`) — already implemented at `lattice-host.js:~324-345`. SW-side listener for these replies may or may not be needed in Phase 8 — planner decides based on whether agent-loop wants synchronous receipt visibility (probably not; fire-and-forget is preferable for INV-04 cadence preservation).
- **Lattice `tracer.event?.()` surface** — checkpoint hook accepts the tracer-event-shaped envelope; FSB constructs it inside the offscreen host before calling the hook (already implemented in Phase 5).

</code_context>

<specifics>
## Specific Ideas

- "FSB autopilot becomes an MCP client in spirit, a Lattice consumer in substance" (user framing, 2026-05-31).
- Per-axis UAT echoes the user's "as many validations as required" directive.
- The two latent Phase 5 bugs surfaced during UAT-1 (260531-63l + 260531-6n5) demonstrate that the Lattice-MV3 offscreen surface is bug-prone at first Chrome reload — Phase 8 plans MUST include `npm run build` + `chrome://extensions` reload verification step (not just `npm test` real-runtime smokes).

</specifics>

<deferred>
## Deferred Ideas

- **Phase 9** — SurvivabilityAdapter activation (G2 closure + `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` flag flip + persist/restore wiring at the three `persist()` callsites). Depends on Phase 8 (step.transition events are the survivability boundary markers).
- **Phase 10** — MCP-philosophy parity for autopilot (visual-session lifecycle driver discriminator + metrics recorder + driving-model attribution + storage schema unification). Independent of Phase 8 + 9 — can run in parallel after Phase 8 ships.
- **Config-flag-gated receipt-cadence variants** (`per-step` vs `per-turn` vs `off`) — defer to a follow-on observability phase if receipt volume becomes a measured problem.
- **Lattice-side `createCheckpointHook` extension** to accept FSB tool-result envelope shape — only undertaken if D-04 carve-out trigger fires during planner research; in that case, lands on `fsb-integration-experiments` FIRST, LATTICE-PIN.md SHA bumps, FSB-side code consumes the extended hook.
- **Distinguishing tool-dispatch vs LLM-turn at the `RunEventKind` literal level** (instead of via `metadata.stepName`) — rejected for Phase 8 per D-01; would require a Lattice-side tracing extension + INV-06 carve-out. Reconsidered only if FSB-side metadata-based discrimination proves operationally insufficient.

### Reviewed Todos (not folded)

- None.

</deferred>
