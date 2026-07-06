# Phase 8: FSB agent brain on Lattice runtime - Research

**Researched:** 2026-05-31
**Domain:** FSB autopilot iterator wiring into Lattice tracer/checkpoint surfaces (in-extension production code path)
**Confidence:** HIGH (all Lattice + FSB source files for D-01..D-07 read in-session; line numbers verified)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from 08-CONTEXT.md)

- **D-01:** `step.transition` events fire at TWO distinct boundaries per `runAgentIteration`:
  1. **LLM_TURN boundary** - emitted just after `_formatAssistantMessage` push at `extension/ai/agent-loop.js:~1853` (one event per provider API round-trip).
  2. **TOOL_DISPATCH boundary** - emitted inside the `for (var ci = 0; ci < toolCalls.length; ci++)` loop at `extension/ai/agent-loop.js:~1906` (one event per tool call).
  Distinguished via `metadata.stepName: 'LLM_TURN' | 'TOOL_DISPATCH'`, NOT via new `RunEventKind` literals. SetTimeout iterator callsites at agent-loop.js:~1864 / ~2462 / ~2531 / ~2541 (INV-04 byte-frozen) are NOT step boundaries.

- **D-02:** Receipt-mint cadence is per `step.transition` (1 receipt per event), gated by `signer !== undefined`. Signer source: ephemeral Ed25519 key at offscreen boot per `extension/offscreen/lattice-host.js:269-274`. Aggregation, sidecar, and configurable-cadence flags REJECTED.

- **D-03:** New SW-side `sendLatticeStepTransition(envelope)` function posts `{type: 'lattice-step-transition', envelope}` via `chrome.runtime.sendMessage`. Idempotent, fire-and-forget. Offscreen handler at `lattice-host.js:~295-371` already implemented.

- **D-04:** Default: NO Lattice-side commits. `current_lattice_sha` stays frozen at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`. Carve-out trigger = if `CreateReceiptInput` cannot accept FSB's tool-result envelope shape. **PLANNER MUST DETERMINE.** (See Section 2 below.)

- **D-05:** Phase 8 = Lattice runtime wiring only. Phase 9 = SurvivabilityAdapter activation. Phase 10 = MCP-philosophy parity.

- **D-06:** Per-axis UAT (3 separate Chrome MV3 reload sessions, ~3-5 min each). Phase 8 UAT asserts: SW console shows envelope per step; offscreen console shows `lattice-receipt-minted` per event; receipts mint at BOTH `LLM_TURN` + `TOOL_DISPATCH`; zero unknown `RunEventKind`; iterator completes successfully.

- **D-07:** INV-04 strictly additive. Tracer/hook calls go INSIDE iteration body, never inside `setTimeout(...)` lambdas. `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 post-phase.

### Claude's Discretion

- Naming of SW-side function (`sendLatticeStepTransition` is the working name).
- Exact ordering of two emissions inside `runAgentIteration` (e.g., before vs after `_currentStepName` marker update).
- Whether SW-side sender lives as top-level function in `background.js` OR as sibling module under `extension/ai/`.

### Deferred Ideas (OUT OF SCOPE)

- Phase 9 SurvivabilityAdapter activation (`FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` flag + persist/restore wiring).
- Phase 10 MCP-philosophy parity (visual-session lifecycle + metrics + driving-model attribution).
- Lattice-side `createCheckpointHook` extension to carry tool-result envelopes (only if D-04 carve-out fires).
- Distinguishing tool-dispatch vs LLM-turn at `RunEventKind` literal level (rejected per D-01).
- Config-flag-gated receipt-cadence variants (`per-step` vs `per-turn` vs `off`).
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 8 anticipates **3 new FINT IDs**. Research-recommended assignments (planner finalizes in REQUIREMENTS.md):

| ID | Description | Research Support |
|----|-------------|------------------|
| **FINT-10** | SW-side `sendLatticeStepTransition(envelope)` producer wired into `extension/background.js` (or sibling module under `extension/ai/`). Closes audit gap G1. | Section 5 - architectural template + recommendation. Existing Phase 6 `executeViaBridge` shim (`lattice-provider-bridge.js`, 171 lines) provides the exact dual-export idiom + `chrome.runtime.sendMessage` discipline to mirror. |
| **FINT-11** | `runAgentIteration` emits `step.transition` envelopes at TWO boundaries: `LLM_TURN` (after `_formatAssistantMessage` push at line 1853) and `TOOL_DISPATCH` (per call inside the `for (var ci ...)` loop starting line 1906). Closes the half-step of Flow 4. | Section 3 - line numbers verified, surrounding code documented. D-01 emission policy. |
| **FINT-12** | Per-step receipt mint via `createCheckpointHook` runs in production code path (offscreen handler at lattice-host.js:269-371 already integrated; Phase 8 only adds the upstream producer). Flow 4 = COMPLETE on phase end. | Section 4 - envelope shape verified against `CheckpointHookOptions` + `CreateReceiptInput`; offscreen contract mapping already conformant. |

REQ-ID rationale: continues the FINT-NN..M placeholder series in REQUIREMENTS.md line 78 ("Adapt FSB's runAgentLoop to emit step transitions through Lattice's receipt API"). FINT-10/11/12 explicitly close that TBD entry. The Phase 8 SUMMARY will flip line 78 from `[ ]` to `[x]` with three concrete IDs.
</phase_requirements>

---

## 1. Executive Summary

Phase 8 wires FSB's `runAgentIteration` body to emit `step.transition` events at two boundaries (`LLM_TURN` at line 1853, `TOOL_DISPATCH` per call at line 1906) and routes them through the existing Phase 5 offscreen receipt-mint pipeline. **D-04 carve-out NOT triggered:** the existing `CreateReceiptInput` (receipt.ts:32-56) + `CheckpointHookContext` + `CheckpointHookOptions` (checkpoint.ts:95-130) already accept step-marker metadata as flat optional fields; FSB's "tool-result envelope shape" only needs to be passed as `metadata` on the SW-to-offscreen message (which is opaque key/value carried into `tracer.event(name, metadata)`), not embedded in the signed receipt body. INV-06 stays frozen at SHA `e95067bf`. INV-04 is preserved by inserting both tracer calls INSIDE the iteration body (never inside the four `setTimeout(...)` lambdas at 1864/2462/2531/2541). Recommended structure: 3 plans across 1-2 waves (Wave 0 smoke scaffold + Wave 1 producer + iterator emission). Primary risk: Phase 5/6 surfaced two latent bugs at first Chrome reload (260531-63l + 260531-6n5); Phase 8 plan MUST include `npm run build` + `chrome://extensions` reload step, not just `npm test`.

**Primary recommendation:** Add a new sibling module `extension/ai/lattice-step-emitter.js` (~80 lines, dual-export Phase 5/6 idiom), importScript it from background.js between `ai/lattice-provider-bridge.js` (line 12) and `ai/ai-integration.js` (line 13), and call its top-level function `sendLatticeStepTransition(envelope)` from agent-loop.js at exactly the two boundaries D-01 specifies. INV-06 frozen.

---

## 2. D-04 Carve-Out Determination (CRITICAL)

### Verdict: **NO CARVE-OUT REQUIRED. INV-06 STAYS FROZEN.**

`current_lattice_sha` remains `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (Phase 5/6/7 baseline per LATTICE-PIN.md). Phase 8 ships ZERO Lattice-side commits.

### Evidence (HIGH confidence; read in-session 2026-05-31)

**`CreateReceiptInput` accepts FSB's needs without extension** [VERIFIED: `lattice/packages/lattice/src/receipts/receipt.ts:32-56`]:

```typescript
export interface CreateReceiptInput {
  readonly runId: string;                // FSB supplies sessionId-derived runId
  readonly issuedAt?: string;            // defaults to new Date().toISOString()
  readonly receiptId?: string;           // defaults to crypto.randomUUID()
  readonly model: ReceiptModel;          // FSB has provider/model at line 1170-1171
  readonly route: ReceiptRoute;          // synthesizable from providerKey
  readonly usage: Usage;                 // {promptTokens, completionTokens, costUsd}
  readonly contractVerdict: ContractVerdict;     // "success" default per checkpoint.ts:178
  readonly contractHash: string | null;          // null acceptable
  readonly inputHashes: readonly string[];       // [] acceptable
  readonly outputHash: string | null;            // null acceptable
  // ... step-marker fields v1.1 (FSB uses these):
  readonly stepName?: string;            // FSB sets 'LLM_TURN' or 'TOOL_DISPATCH'
  readonly stepIndex?: number;           // FSB uses iterNum (line 1551)
  readonly parentStepName?: string;      // FSB optional
  readonly previousStepName?: string;    // FSB optional (linked-list threading)
  readonly sessionId?: string;           // FSB sessionId (already in agent-loop scope)
  readonly timestamp?: string;           // ISO-8601
}
```

**`CheckpointHookOptions` accepts FSB's needs without extension** [VERIFIED: `lattice/packages/lattice/src/contract/checkpoint.ts:122-130`]:

```typescript
export interface CheckpointHookOptions {
  readonly runId: string;                                  // required
  readonly tracer?: TracerLike;                            // FSB supplies inline
  readonly signer?: ReceiptSigner;                         // FSB ephemeral Ed25519 at boot
  readonly sessionId?: string;                             // FSB sessionId
  readonly model?: ReceiptModel;                           // optional with default
  readonly route?: ReceiptRoute;                           // optional with default
  readonly contractVerdict?: CreateReceiptInput["contractVerdict"];  // defaults "success"
}
```

**`CheckpointHookContext` is the per-step shape** [VERIFIED: `checkpoint.ts:95-101`]:

```typescript
export interface CheckpointHookContext {
  readonly stepName: string;             // 'LLM_TURN' | 'TOOL_DISPATCH'
  readonly stepIndex: number;            // iterNum
  readonly parentStepName?: string;      // optional
  readonly previousStepName?: string;    // optional
  readonly timestamp: string;            // ISO-8601 RFC 3339
}
```

**`step.transition` literal already in `RunEventKind`** [VERIFIED: `lattice/packages/lattice/src/tracing/tracing.ts:11-28`, position 17, last entry]. No new literal required; D-01's "distinguish via `metadata.stepName`" approach works because `tracer.event?.(name, metadata)` accepts an arbitrary `Record<string, unknown>` per `TracerLike.event` signature at `tracing.ts:8`.

### Why FSB's "tool-result envelope shape" does NOT trigger carve-out

D-04's trigger language was: "if `CreateReceiptInput` requires extension to carry FSB's tool dispatch metadata in the receipt body, not just tracer metadata." The answer is: FSB's tool-result data (tool name, arguments, success, error, navigationTriggered, etc.) does NOT need to land in the SIGNED receipt body. It can ride entirely in `tracer.event(name, metadata)` as opaque arbitrary keys.

The Phase 5 offscreen handler already proves this works in production [VERIFIED: `extension/offscreen/lattice-host.js:316-348`]:
- SW posts `{type: 'lattice-step-transition', payload: {runId, stepName, stepIndex, timestamp, sessionId?, parentStepName?, previousStepName?}}`
- Offscreen handler builds `CheckpointHookContext` from `payload`, registers `createCheckpointHook` on the pipeline, runs the pipeline
- Inside the hook, `createReceipt(input, signer)` is called with the v1.1 step-marker fields populated (receipt.ts:78-153)
- The signed envelope rides back via `tracer.event(STEP_TRANSITION_EVENT_NAME, {..., envelope})` → SW reply bus

FSB's tool-call name/args/result are **not** in the signed body. They can be added to the SW→offscreen payload as additional keys, surface in `metadata`, and flow to subscribers without ever touching `CapabilityReceiptBody`. The signed receipt remains a small, well-defined attestation of "step occurred at this time, owned by this runId/sessionId."

**If a future phase wants signed tool-call metadata** (e.g., for forensic replay), THAT phase triggers an INV-06 carve-out and a Lattice-side extension to `CapabilityReceiptBody` (new `toolCall?: {name, argsHash}` field, version literal bumped to `lattice-receipt/v1.2`). Phase 8 does not need this.

### Result

- **`current_lattice_sha`:** UNCHANGED at `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3`.
- **LATTICE-PIN.md Phase 8 row:** New row appended with SHA UNCHANGED (mirrors Phase 6/7 pattern; "Lattice work touched" = "none -- Phase 8 is FSB-side wiring; Lattice's Phase 3 createCheckpointHook + Phase 2 createHookPipeline are the inputs").
- **Lattice repo commits this phase:** 0.
- **`cd lattice && git reflog | grep -c push`:** 0 carryforward holds.

---

## 3. Step.transition Emission Sites (callsite verification)

### LLM_TURN boundary (line 1853)

[VERIFIED 2026-05-31: `extension/ai/agent-loop.js:1852-1866` read in-session]

```javascript
1852    // j. Push assistant message to history (BEFORE tool results, per Pitfall 5)
1853    var assistantMsg = _formatAssistantMessage(response, providerKey);
1854    session.messages.push(assistantMsg);
1855
1856    // k. Parse tool calls
1857    var toolCalls = _parseToolCalls(response, providerKey);
1858
1859    if (toolCalls.length === 0) {
1860      // No tool calls parsed but isToolCallResponse was true -- defensive fallback
1861      console.warn('[AgentLoop] isToolCallResponse=true but no tool calls parsed', { sessionId: sessionId, iteration: iterNum });
1862      session.messages.push({ role: 'user', content: 'No tool calls were detected. Please either call a tool or provide your final answer.' });
1863      await persist(sessionId, session);
1864      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);
1865      return;
1866    }
```

**Recommended emission position:** Between line 1854 (`session.messages.push(assistantMsg)`) and line 1856 (parse tool calls). Rationale: assistant message is appended (state mutation complete), but tool dispatch has not yet started. This is the canonical "one provider round-trip just completed" boundary.

**Available identity at this site:**
- `providerKey` (in scope at 1853 via 1661: `var providerKey = session.providerConfig.providerKey;`)
- `model` (in scope at 1853 via 1662: `var model = session.providerConfig.model;`)
- `sessionId` (function argument)
- `iterNum` (in scope from 1551: `var iterNum = session.agentState.iterationCount;`)
- `response` (the provider response object - contains usage if available)

### TOOL_DISPATCH boundary (line 1906)

[VERIFIED 2026-05-31: `extension/ai/agent-loop.js:1903-1929` read in-session]

```javascript
1903    // l. Execute each tool call SEQUENTIALLY (browser actions must be serial)
1904    var toolResults = [];
1905    var lastNonProgressToolCall = null;
1906    for (var ci = 0; ci < toolCalls.length; ci++) {
1907      var call = toolCalls[ci];
1908      var result;
1909
1910      if (call.name !== 'report_progress' && call.name !== 'complete_task' && ...) {
1911        lastNonProgressToolCall = call;
1912      }
1913
1914      // l2. Emit beforeToolExecution hook (permission check)
1915      if (hooks) { ... BEFORE_TOOL_EXECUTION hook emit ... }
```

**Recommended emission position:** Either (a) just inside the loop body at line 1907 (BEFORE permission check) marking "dispatch starting" semantics, OR (b) AFTER permission check + result computation as "dispatch complete." Per D-01 ("one event per tool call") and Phase 8 CONTEXT.md Claude's Discretion clause ("ordering ... before or after the local `_currentStepName` marker update"), the planner picks the timing. **Recommendation:** AFTER permission check fires (so denied tools still emit a `step.transition` with `metadata.denied: true`); place it just after the existing `BEFORE_TOOL_EXECUTION` hook block but BEFORE the actual tool execution. This makes a `step.transition` an "intent to dispatch" marker, not a "completed dispatch" one — preserves invariant that the hook fires even when the tool throws asynchronously.

**Available identity at this site:**
- `call.name`, `call.args` (the tool call envelope)
- `ci` (the per-iteration call index)
- All LLM_TURN identity (providerKey, model, sessionId, iterNum)

### Other boundary candidates (rejected per D-01)

The planner should NOT emit at:
- The four setTimeout callsites (1864, 2462, 2531, 2541) — these are scheduling artifacts per D-01, NOT step boundaries.
- The 100-line iteration prologue (1462-1550) — pre-conditions, not step events.
- The finalize/terminal-outcome blocks (1840, 2298, 2459 post-actions) — these are session lifecycle, distinct from step.transition.
- Inside `_parseToolCalls` or `_formatAssistantMessage` — these are pure helpers, not loop iteration steps.

### setTimeout grep assertion (INV-04)

```bash
grep -c "setTimeout" extension/ai/agent-loop.js
# Expected: 8 (4 iterator pattern + 4 elsewhere — verified 2026-05-31)
```

Confirmed in-session: current count is **8**. Phase 8 MUST keep it at 8.

---

## 4. Receipt Envelope Construction

### SW → Offscreen wire shape (Phase 5 D-16 contract)

The Phase 5 offscreen handler [VERIFIED: `extension/offscreen/lattice-host.js:288-371`] expects:

```javascript
chrome.runtime.sendMessage({
  type: 'lattice-step-transition',
  payload: {
    runId: string,          // REQUIRED
    sessionId?: string,
    stepName: string,       // REQUIRED — 'LLM_TURN' | 'TOOL_DISPATCH' per D-01
    stepIndex: number,      // REQUIRED — finite number; FSB uses iterNum
    parentStepName?: string,
    previousStepName?: string,
    timestamp: string       // ISO-8601 — FSB uses new Date().toISOString()
  }
})
```

The handler rejects with `console.warn` and silent drop if:
- `signer || pipeline` boot init not complete (line 297-300) — Phase 8 producer should not assume the receipt minted; the FSB SW-side just emits and forgets.
- `!runId || !stepName || !Number.isFinite(stepIndex)` (line 308-311).
- `sender.id !== chrome.runtime.id` (line 291-293) — never an issue for in-extension SW sends.

### FSB-side envelope construction

At each emission site, the SW-side code constructs (recommendation):

```javascript
// At LLM_TURN site (after line 1854)
sendLatticeStepTransition({
  runId: sessionId,                            // sessionId IS the run; no separate runId needed
  sessionId: sessionId,
  stepName: 'LLM_TURN',
  stepIndex: iterNum,
  timestamp: new Date().toISOString(),
  // OPTIONAL extras for observability (NOT part of signed receipt body —
  // flow into metadata-only via tracer.event):
  providerKey: providerKey,
  model: model
});

// At TOOL_DISPATCH site (per iteration of the for ci... loop)
sendLatticeStepTransition({
  runId: sessionId,
  sessionId: sessionId,
  stepName: 'TOOL_DISPATCH',
  stepIndex: iterNum,
  previousStepName: 'LLM_TURN',                // linked-list threading
  timestamp: new Date().toISOString(),
  // OPTIONAL extras:
  toolName: call.name,
  toolCallIndex: ci
});
```

**Planner choice (Claude's Discretion clause D-01):** Whether to use `sessionId` as `runId`, or generate a per-session UUID at agent-loop start and stash on `session._latticeRunId`. **Recommendation:** Use `sessionId` directly. Rationale: FSB already has a stable sessionId (line 1551 scope); Lattice's `runId` semantic is "stable identifier for this execution," which sessionId satisfies. Avoids new state to persist across SW eviction (Phase 9 concern).

### Shape mismatch check (Phase 8 should NOT introduce any)

The offscreen handler builds `CheckpointHookContext` at lines 355-361 by spreading the payload:

```javascript
const ctx = {
  stepName,
  stepIndex,
  timestamp,
  ...(payload.parentStepName !== undefined ? { parentStepName: payload.parentStepName } : {}),
  ...(payload.previousStepName !== undefined ? { previousStepName: payload.previousStepName } : {}),
};
```

Extra keys FSB adds (`providerKey`, `model`, `toolName`, `toolCallIndex`) are IGNORED by `createCheckpointHook` (it only reads the typed fields) — they don't pollute the signed receipt. If the planner wants them visible to subscribers, they need to land via a separate path (out of scope for Phase 8; this is a Phase 10 metrics concern). **For Phase 8, do not add extra keys to the payload** — keep the wire surface byte-frozen with Phase 5 contract for forward compatibility.

### Receipt body mapping (downstream of FSB)

Inside the offscreen handler, `createCheckpointHook(options)` invokes `createReceipt(input, signer)` at `checkpoint.ts:219`. The resulting v1.1 receipt body carries:
- `stepName: 'LLM_TURN'` or `'TOOL_DISPATCH'`
- `stepIndex: iterNum`
- `sessionId: sessionId`
- `timestamp: ISO-8601`
- `parentStepName` / `previousStepName` if provided
- `version: 'lattice-receipt/v1.1'` (auto-bumped per receipt.ts:88-97 because step-marker fields are set)
- `model: { requested: 'lattice-checkpoint/observability', observed: null }` (default per checkpoint.ts:132-135)
- `route: { providerId: 'lattice-checkpoint', capabilityId: 'lattice-checkpoint/step-transition', attemptNumber: 1 }` (default)

**Planner consideration:** Default model/route descriptors are generic. If the planner wants the FSB provider/model in the receipt body, the offscreen handler at lattice-host.js:316 could be extended to read `payload.providerKey + payload.model` and pass `model: { requested: payload.model, observed: payload.model }`. This is an **optional refinement**, not required by D-01 or audit gap G1 closure.

---

## 5. SW-Side Sender Module (Architectural Template)

### Two valid patterns per Claude's Discretion clause D-01

**Option A — Top-level function in `background.js`** (mirrors Phase 6 `ensureLatticeOffscreen()` at line 13121-13138). One function, called from agent-loop.js via a globalThis ref.

**Option B — Sibling module under `extension/ai/`** (mirrors Phase 6 `lattice-provider-bridge.js` at line 1-171). Dual-export idiom, importScripts in background.js between lines 12 (existing `ai/lattice-provider-bridge.js`) and 13 (`ai/ai-integration.js`).

### Recommendation: **Option B (sibling module).** Rationale:

1. **Symmetry with Phase 6.** The provider bridge shim is the established pattern for SW-to-offscreen-via-chrome.runtime.sendMessage discipline. A reader who understands `lattice-provider-bridge.js` understands `lattice-step-emitter.js` immediately. Cognitive load minimized.

2. **Testability.** Sibling modules under `extension/ai/` get covered by Node smoke tests (the FSB pattern from Phase 5/6 — `tests/lattice-*-smoke.test.js`). A top-level function in `background.js` is harder to smoke-test because the entire 13325-line file would need to load.

3. **Import order locality.** Phase 6 already established the `importScripts('ai/lattice-provider-bridge.js')` at line 12. Adding `importScripts('ai/lattice-step-emitter.js')` at line 13 (alphabetical: lattice-p < lattice-s) keeps the SW load order intact (153 → 154 → 155, monotonic increase of 1 per phase).

4. **Boot log uniformity.** The Phase 6 bridge emits a boot log at module evaluation; Phase 8's sender does the same. SW console shows `[FSB lattice-provider-bridge] boot: ...` AND `[FSB lattice-step-emitter] boot: ...` on every reload — visible UAT signal.

### Proposed module skeleton (Phase 8 plan should generate this)

```javascript
// extension/ai/lattice-step-emitter.js (~80 lines)
'use strict';
(function (globalScope) {
  const EMITTER_TAG = '[FSB lattice-step-emitter]';

  /**
   * sendLatticeStepTransition - fire-and-forget post to offscreen Lattice host.
   *
   * Mirrors the Phase 5 D-16 wire contract:
   *   chrome.runtime.sendMessage({type: 'lattice-step-transition', payload: {...}})
   *
   * Idempotent (no internal state). Errors swallowed - offscreen host may be
   * evicted; receipt mint failure is non-fatal per D-07 best-effort policy.
   *
   * @param {Object} payload - {runId, sessionId?, stepName, stepIndex, timestamp,
   *                            parentStepName?, previousStepName?}
   */
  function sendLatticeStepTransition(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') return;
    try {
      chrome.runtime.sendMessage({
        type: 'lattice-step-transition',
        payload: payload
      });
      // Intentionally NOT awaited - fire-and-forget per D-03.
      // chrome.runtime.sendMessage returns a Promise in MV3; we let it dangle
      // because we never want to block runAgentIteration on receipt mint.
    } catch (_e) {
      /* swallow - offscreen may have evicted or boot not complete */
    }
  }

  // Dual export (Phase 5 Plan 05-05 idiom)
  globalScope.sendLatticeStepTransition = sendLatticeStepTransition;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sendLatticeStepTransition: sendLatticeStepTransition };
  }

  try {
    console.log(EMITTER_TAG, 'boot: Phase 8 step emitter registered');
  } catch (_e) { /* swallow */ }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
```

**background.js change (single line insertion at line 13):**
```javascript
// Line 11: importScripts('ai/cli-parser.js');
// Line 12: importScripts('ai/lattice-provider-bridge.js');
// Line 13 NEW: importScripts('ai/lattice-step-emitter.js');
// Line 14 (was 13): importScripts('ai/ai-integration.js');
```

Total background.js delta: 1 line added. ZERO other background.js modifications. INV-04/INV-05 untouched.

**agent-loop.js delta:** ~10 lines inserted (two `sendLatticeStepTransition({...})` calls + surrounding comments). ZERO setTimeout callsite shifts at the structural level (line numbers shift but pattern intact). Plan verification: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8.

---

## 6. INV-04 Preservation Strategy

### Three concrete assertions the plan MUST verify

**Assertion 1 — Total setTimeout count unchanged:**
```bash
[ "$(grep -c "setTimeout" extension/ai/agent-loop.js)" -eq 8 ]
```
Pre-phase: 8 (verified 2026-05-31). Post-phase: must remain 8.

**Assertion 2 — Iterator pattern structurally intact at 4 callsites:**
```bash
grep -c "session\._nextIterationTimer = setTimeout" extension/ai/agent-loop.js
# Expected: 4
```
The four iterator setTimeout callsites at 1864/2462/2531/2541 all carry the pattern `session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, <delayMs>)`. Phase 8 MUST NOT modify any of them. Absolute line numbers WILL shift (the LLM_TURN insertion at line 1853 area adds ~5 lines; the TOOL_DISPATCH insertion at line 1906 area adds ~5 lines; expected post-phase iterator positions: ~1869, ~2472, ~2541, ~2551 — these are estimates, the smoke test should use content-based discovery via regex per Phase 6 Plan 06-05 precedent).

**Assertion 3 — No tracer call inside any setTimeout lambda:**

Phase 8 plan verifies that `sendLatticeStepTransition` is NEVER called inside a `setTimeout(function() {...}, ...)` lambda body. A correctness check:
```bash
# Heuristic: look for sendLatticeStepTransition inside an obvious lambda body
awk '/setTimeout\(function/,/}, [0-9]+\)/ { if ($0 ~ /sendLatticeStepTransition/) print NR": "$0 }' extension/ai/agent-loop.js
# Expected output: (empty)
```

Or more robustly, the plan verification script reads the four iterator lambdas character-by-character and confirms each is byte-identical to the pre-phase baseline (extract baseline lambda text, store in test fixture, compare). The Phase 6 Plan 06-05 INV byte-freeze smoke (`tests/lattice-provider-bridge-smoke.test.js` Part 6) is the architectural template.

### Why this is non-negotiable

Each setTimeout iterator callsite is load-bearing for Chrome MV3's "30s silence + 5min idle" SW eviction. The lambda is the LITERAL `runAgentIteration(sessionId, options)` call that re-enters the iterator. If tracer code is added inside the lambda, the lambda becomes async-fragile: any unawaited Promise rejection in the tracer cascades into Chrome's unhandled-promise SW eviction path. **Cardinal rule: tracer calls live in the iteration body BEFORE the setTimeout schedule, never INSIDE the lambda.**

---

## 7. Failure Modes + Degradation

### Failure Mode A: Signer absent at offscreen boot

[VERIFIED: `extension/offscreen/lattice-host.js:269-277`]

The IIFE at boot-time can fail (Web Crypto unavailable, ESM module resolution error, etc.). If `signer === null` when a `lattice-step-transition` arrives, the handler at lines 297-300 emits:
```
console.warn(HOST_TAG, "boot init not complete; dropping step-transition message");
```
and silently drops the message. No upstream impact on FSB autopilot.

**Phase 8 producer behavior:** Continue posting envelopes. They are no-ops in degraded state. FSB iteration proceeds.

### Failure Mode B: Offscreen page evicted

Chrome may evict the offscreen page if it has been idle (rare for the FSB host because it owns the provider bridge which runs constantly during autopilot). If evicted, `chrome.runtime.sendMessage` rejects asynchronously.

**Phase 8 producer behavior:** The recommended `sendLatticeStepTransition` does NOT await the message — the unawaited Promise rejection is harmless. The Phase 6 `executeViaBridge` shim handles this via a different path (`host_unreachable` error code), but Phase 8 doesn't have that need because step.transition is fire-and-forget by D-03.

**Subtle issue:** Phase 6's `ensureLatticeOffscreen()` is called from `onInstalled` and `onStartup` (lines 13149, 13225). If the SW evicts while autopilot is running, the offscreen page may also evict. The next iteration cycle's tracer calls will fail silently. Phase 9 (SurvivabilityAdapter activation) is the systematic fix — Phase 8 plan should NOTE this limitation in 08-VERIFICATION.md but not address it.

### Failure Mode C: tracer.event undefined

[VERIFIED: `lattice/packages/lattice/src/contract/checkpoint.ts:239`]

The hook handler does `tracer?.event?.(...)` — both the `tracer` and the `event` method are optional-chained. If the offscreen handler somehow passes a malformed tracer, the call no-ops. Receipt mint still happens (if signer is present). No upstream throw per D-07.

### Failure Mode D: Receipt mint failure (signer throws)

[VERIFIED: `checkpoint.ts:201-228`]

Wrapped in try/catch at line 202. On failure, `metadata.mintError` is set; tracer event fires with mintError instead of envelope; SW receives `lattice-receipt-mint-failed` instead of `lattice-receipt-minted`. Both are acceptable per D-06 UAT step 4 ("`lattice-receipt-minted` per event ... OR `lattice-receipt-mint-failed` with `reason: 'no-signer'` if signer absent — both acceptable; failure modes must be visible").

### Degradation philosophy mirroring Phase 6

The Phase 6 bridge boot log [VERIFIED: `lattice-provider-bridge.js:169`] declares "Phase 7 bridge shim registered (unconditional; legacy fallback removed)" — uniform always-on style. Phase 8's emitter mirrors this: ALWAYS attempts to send; failures are silent. No conditional branches based on feature flags or environment detection. Plan should reject any "if offscreen ready" gating logic on the SW side — that's an offscreen concern.

---

## 8. Smoke Test Design

### File: `tests/lattice-step-emitter-smoke.test.js` (new, ~250 lines)

Real-runtime, no Lattice mocks (Phase 5/6 convention; mirrors `tests/lattice-checkpoint-smoke.test.js` + `tests/lattice-provider-bridge-smoke.test.js`).

### Mocks required

- `chrome.runtime.sendMessage` — capture calls into an array; assert envelope shape.
- `chrome.runtime.id` — set to a stable string for origin-check parity.
- `globalThis.sendLatticeStepTransition` — required for the agent-loop.js consumption path.

### NOT mocked (real-runtime per FSB convention)

- The `lattice-step-emitter.js` module itself — load via `require()` from Node.
- The offscreen handler — NOT loaded in this smoke; that path is covered by `lattice-checkpoint-smoke.test.js` end-to-end.
- Lattice's `createCheckpointHook` / `createReceipt` — exercised by `lattice-checkpoint-smoke.test.js` which is already in the test chain.

### Suggested Parts (Phase 5/6 conventional structure)

**Part 1: Module presence + dual export (5 PASSes)**
- `require('extension/ai/lattice-step-emitter.js')` succeeds.
- Module exports `sendLatticeStepTransition` function.
- `globalThis.sendLatticeStepTransition` is the same function reference (dual-export verification).
- Boot log emitted exactly once.
- Function is idempotent (calling twice in succession does not throw).

**Part 2: Envelope construction (8 PASSes)**
- Calling `sendLatticeStepTransition({runId, sessionId, stepName: 'LLM_TURN', stepIndex: 1, timestamp})` invokes `chrome.runtime.sendMessage` exactly once.
- The first argument to sendMessage has `type === 'lattice-step-transition'`.
- The payload object round-trips byte-identically (no key reordering, no value mutation).
- Calling with `stepName: 'TOOL_DISPATCH'` produces the analogous envelope.
- Calling with `previousStepName` populated includes it in payload.
- Calling with `payload === null` or `undefined` is a silent no-op (no sendMessage call).
- Calling with `payload === "string"` is a silent no-op (defensive).
- When `chrome.runtime.sendMessage` throws synchronously, no upstream throw.

**Part 3: agent-loop.js integration (6 PASSes)**
- Load `extension/ai/agent-loop.js` with `chrome.runtime.sendMessage` mocked.
- Stub a minimal session with iterations + tool calls.
- Run one iteration to completion.
- Assert: `chrome.runtime.sendMessage` was called with `type: 'lattice-step-transition'` at least twice (LLM_TURN + TOOL_DISPATCH).
- Assert: the LLM_TURN envelope has `stepName: 'LLM_TURN'` + `stepIndex: <iterNum>`.
- Assert: the TOOL_DISPATCH envelope has `stepName: 'TOOL_DISPATCH'`.

**Part 4: INV byte-freeze regression (6 PASSes)** — mirrors Phase 6 Plan 06-05 Part 6
- `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8.
- Iterator pattern `session._nextIterationTimer = setTimeout` appears 4 times.
- `lattice-step-emitter.js` does NOT contain `setTimeout` anywhere.
- LATTICE-PIN.md `current_lattice_sha` is `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (INV-06 frozen).
- Tool-definitions parity (existing test) chained `&&` and green (INV-01).
- background.js contains exactly ONE `importScripts('ai/lattice-step-emitter.js')` (alphabetically positioned at line 13).

**Estimated total PASS count target: 25+ PASS / 0 FAIL.** (Plan 08-XX should specify `min_pass` ≥ 20 per FSB convention.)

### Chaining into npm test

Append to `package.json` `scripts.test` chain as the FINAL entry (after `lattice-survivability-smoke.test.js` which is currently last):
```
... && node tests/lattice-step-emitter-smoke.test.js
```

Existing chain entries BYTE-FROZEN per Phase 1+2+3+4+5+6+7 cumulative carryforward.

---

## 9. Wave Structure Recommendation

**3 plans, 2 waves.**

### Wave 0: Smoke scaffold + sender module

- **Plan 08-01: SW-side `sendLatticeStepTransition` sender + Wave 0 smoke scaffold** (FINT-10)
  - Wave: 0
  - Touches: NEW `extension/ai/lattice-step-emitter.js` (~80 lines), `extension/background.js` (+1 line importScripts), NEW `tests/lattice-step-emitter-smoke.test.js` (Wave 0 scaffold with Parts 1+2 populated; Parts 3+4 placeholders), `package.json` (append to scripts.test chain).
  - Verification gates: `npm test` exits 0; new smoke ≥ 10 PASS (Parts 1+2 only); INV-04 grep count = 8 (unchanged); background.js importScripts chain monotonic 154 → 155.
  - Closes audit gap G1 (SW-side sender exists in extension/* code paths).

### Wave 1: Iterator emission + integration smoke + ceremony

- **Plan 08-02: agent-loop.js step.transition emission at LLM_TURN + TOOL_DISPATCH boundaries** (FINT-11 + FINT-12)
  - Wave: 1 (depends on Plan 08-01 sender existing)
  - Touches: `extension/ai/agent-loop.js` (~10 lines added at 1853 + 1906 area; ZERO modifications to setTimeout callsites or iterator pattern), `tests/lattice-step-emitter-smoke.test.js` Parts 3+4 fill (~80 lines added).
  - Verification gates: `npm test` exits 0; smoke ≥ 25 PASS; INV-04 grep count = 8; iterator pattern preserved (regex match 4 occurrences); existing `tests/lattice-checkpoint-smoke.test.js` still 72+ PASS; existing `tests/lattice-provider-bridge-smoke.test.js` still 85 PASS.
  - Closes audit gap Flow 4 (now end-to-end SW → offscreen → receipt mint in production).

- **Plan 08-03: Ceremony — REQUIREMENTS + LATTICE-PIN + audit closure** (documentation)
  - Wave: 1 (parallel to Plan 08-02 OR sequential — planner choice; recommend sequential to keep diffs decisive)
  - Touches: `.planning/REQUIREMENTS.md` (FINT-10/11/12 added in narrative + traceability; FINT-NN..M placeholder flipped to `[x]`), `.planning/LATTICE-PIN.md` (Phase 8 row appended; SHA UNCHANGED at `e95067bf...`), `.planning/v0.10.0-MILESTONE-AUDIT.md` (G1 row marked `closed`; Flow 4 row marked `complete`; FINT-04 promoted partial → complete; status frontmatter awaits Phase 8 UAT verdict).
  - ZERO production code touched.
  - Verification gates: `git diff --stat extension/` empty for this plan; LATTICE-PIN SHA byte-frozen.

### Dependencies + serialization

- **Serialize anything touching agent-loop.js.** Plan 08-02 is the only plan touching agent-loop.js. Plans 08-01 + 08-03 do not. → No serialization conflict on agent-loop.js.
- Plan 08-01 must complete before Plan 08-02 (Plan 08-02 imports the function 08-01 creates).
- Plan 08-03 should run last (verification + documentation; planner has the option to interleave 08-03 fragments into 08-01 and 08-02 SUMMARY ceremonies, but a dedicated ceremony plan is cleaner per the Phase 6 Plan 06-06 / Phase 7 Plan 07-02 precedent).

### Why not 4 plans?

The Phase 5/6/7 pattern would suggest splitting the emitter and the smoke scaffold into separate plans. For Phase 8, the emitter is ~80 lines and trivial — bundling it with the smoke scaffold in Plan 08-01 reduces ceremony overhead without compromising review clarity. If the planner disagrees, splitting into 4 plans (08-01 emitter only / 08-02 smoke scaffold / 08-03 agent-loop emission / 08-04 ceremony) is also acceptable per the granularity:fine setting in config.json.

### UAT (per D-06 per-axis directive)

UAT runs after Plan 08-02 ships (production code complete) but BEFORE Plan 08-03 (so the audit ceremony reflects UAT verdict). Plan 08-03 conditionally flips milestone status based on UAT outcome — same pattern as Phase 7 Plan 07-04.

---

## 10. Validation Architecture (Dimension 8 — Nyquist coverage)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node's built-in `node:assert/strict` + plain functions (NOT vitest, NOT jest); follows FSB pattern from Phase 1-7 |
| Config file | None — test files are self-contained Node scripts |
| Quick run command | `node tests/lattice-step-emitter-smoke.test.js` |
| Full suite command | `npm test` (runs the full chain including 8 existing smokes + new step-emitter smoke) |

### Phase Requirements → Test Map

| REQ ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FINT-10 | SW-side `sendLatticeStepTransition` module exists + dual export + boot log | unit | `node tests/lattice-step-emitter-smoke.test.js` Part 1 | Wave 0 (new file) |
| FINT-10 | Envelope shape conforms to Phase 5 D-16 contract | unit | `node tests/lattice-step-emitter-smoke.test.js` Part 2 | Wave 0 |
| FINT-11 | agent-loop emits at LLM_TURN boundary | integration | `node tests/lattice-step-emitter-smoke.test.js` Part 3 | Wave 1 (new file extended) |
| FINT-11 | agent-loop emits at TOOL_DISPATCH boundary | integration | `node tests/lattice-step-emitter-smoke.test.js` Part 3 | Wave 1 |
| FINT-12 | Receipt mint round-trip end-to-end (offscreen → checkpoint hook → signed envelope) | smoke | `node tests/lattice-checkpoint-smoke.test.js` (EXISTING — already 72 PASS) | Existing |
| INV-04 | setTimeout count = 8 + iterator pattern preserved | regression | `node tests/lattice-step-emitter-smoke.test.js` Part 4 | Wave 1 |
| INV-06 | Lattice SHA byte-frozen at e95067bf... | regression | `node tests/lattice-step-emitter-smoke.test.js` Part 4 | Wave 1 |
| INV-01 | tool-definitions parity | regression | `node tests/tool-definitions-parity.test.js` (EXISTING — 142 PASS) | Existing |
| UAT-08 | Real Chrome MV3 reload session shows envelopes + receipts | manual | Chrome DevTools console observation per D-06 procedure | Manual (08-VERIFICATION.md) |

### Sampling Rate

- **Per task commit:** `node tests/lattice-step-emitter-smoke.test.js` (~2-5 seconds)
- **Per wave merge:** `npm test` (full chain ~30-45 seconds based on Phase 7 timing)
- **Phase gate:** Full suite green + per-axis UAT-08 PASS in Chrome MV3 reload session before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/lattice-step-emitter-smoke.test.js` — covers FINT-10/11 + INV-04/INV-06 regression
- [ ] `extension/ai/lattice-step-emitter.js` — the sender module itself
- [ ] `package.json` scripts.test chain extension (append step-emitter-smoke as final entry; existing 8-smoke chain BYTE-FROZEN per cumulative carryforward)

No framework install required — Node built-in `assert/strict` is sufficient.

### Nyquist receipt count expectation

For a typical autopilot iteration (1 LLM round-trip + 2 tool calls), Phase 8 produces:
- 1 LLM_TURN step.transition → 1 v1.1 Capability Receipt minted
- 2 TOOL_DISPATCH step.transitions → 2 v1.1 Capability Receipts minted
- Total: 3 receipts per iteration

For a 5-iteration autopilot session: ~15 receipts minted in ~30 seconds. The signer is in-process ephemeral Ed25519 (no network call), so receipt cost is negligible (<1ms per mint per Phase 3 timing data). No throughput concern.

---

## 11. Project Constraints (from CLAUDE.md)

The user's CLAUDE.md (~/.claude/CLAUDE.md) imposes:

- **No emojis** in terminal logs, README files, markdown files — anywhere unless explicitly requested. Phase 8 plans, SUMMARYs, VERIFICATION.md, and boot log strings MUST be emoji-free.
- **No automatic application runs.** The phase verification gates use `npm test` and `npm run build`, both of which are explicit test/build commands (acceptable). Chrome reload is user-driven per D-06 UAT procedure (acceptable). The plan MUST NOT include any "start the extension" or "launch Chrome" automation step.
- **No hyphens between sentences** in user-facing prose (issue replies, READMEs, docs). The Phase 8 documentation should prefer dashes/em-dashes only inside parenthetical clauses or list items, not as sentence connectors.

The FSB project also enforces (from MEMORY.md feedback `real_runtime_tests_not_static_text`):
- Tests must EXERCISE functions with mocked chrome.tabs / storage fixtures; do NOT grep source files for identifier presence. Phase 278 was caught by gsd-debug (commit 9a458184) for this anti-pattern. The smoke test in Section 8 MUST load and invoke the modules, not grep them.

---

## 12. Standard Stack

### Core (no new dependencies — additive only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lattice` | file:./lattice/packages/lattice @ `e95067bf` | step.transition tracer literal + createCheckpointHook + ReceiptSigner + createHookPipeline | Already in `package.json` line 81 since Phase 1. INV-06 anchor. [VERIFIED: package.json + node_modules/lattice symlink] |
| Node built-in `node:assert/strict` | bundled | smoke test assertions | FSB convention from Phase 1-7; no jest/vitest dependency required |
| Chrome `chrome.runtime.sendMessage` | MV3 native | SW ↔ offscreen IPC | Phase 5 D-16 message bus contract; Phase 6 reused for provider bridge; Phase 8 third type on the same channel |
| Chrome `chrome.offscreen` API | MV3 native | offscreen document lifecycle (already opened by Phase 6 `ensureLatticeOffscreen()`) | No Phase 8 modifications |

### Supporting (existing modules consumed)

| Module | Purpose | Phase 8 Touch |
|--------|---------|---------------|
| `extension/offscreen/lattice-host.js` | offscreen handler for `lattice-step-transition` | ZERO modifications (already implemented Phase 5) |
| `extension/ai/lattice-provider-bridge.js` | reference pattern for sibling module | READ-ONLY (architectural template) |
| `extension/background.js` | SW load order | +1 line (importScripts) ONLY |
| `extension/ai/agent-loop.js` | iterator + tool dispatch | +~10 lines (two function calls at 1853 + 1906 area) |

### Alternatives Considered (rejected)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| New sibling module `lattice-step-emitter.js` | Inline function in background.js | Loses Phase 5/6 symmetry; harder to smoke-test; mixes SW boot concerns with tracer producer concerns |
| Per-iteration receipt aggregation | Single bulk receipt per iteration | Rejected by D-02 ("per step.transition; gated by signer presence"). Aggregation introduces new state on the SW side that survives MV3 eviction — Phase 9 concern, not Phase 8 |
| New `RunEventKind` literal for step kind | Extend tracing.ts with `step.llm-turn` + `step.tool-dispatch` literals | Rejected by D-01 (distinguish via `metadata.stepName`); would trigger INV-06 carve-out |

**Installation:** No new npm packages.

---

## 13. Architecture Patterns

### Recommended File Structure (post-Phase-8)

```
extension/
├── background.js                       (+1 line importScripts)
├── ai/
│   ├── agent-loop.js                   (+~10 lines at 1853, 1906)
│   ├── lattice-provider-bridge.js      (BYTE-FROZEN; Phase 6/7 reference)
│   ├── lattice-runtime-adapter.js      (BYTE-FROZEN; Phase 5; activated in Phase 9)
│   └── lattice-step-emitter.js         (NEW ~80 lines; Phase 8)
└── offscreen/
    ├── lattice-host.html               (BYTE-FROZEN)
    └── lattice-host.js                 (BYTE-FROZEN; consumes Phase 8 messages already)

tests/
├── lattice-checkpoint-smoke.test.js          (BYTE-FROZEN; 72 PASS reference)
├── lattice-provider-bridge-smoke.test.js     (BYTE-FROZEN; 85 PASS reference)
├── lattice-step-emitter-smoke.test.js        (NEW ~250 lines; Phase 8)
└── ... (8 existing smokes all BYTE-FROZEN)
```

### Pattern 1: Fire-and-forget SW-to-offscreen message

**What:** SW posts a tracer event via `chrome.runtime.sendMessage` without awaiting the receipt mint result.
**When to use:** Observability events whose loss is acceptable (Phase 8 step.transition emissions).
**Example:** (See Section 5 module skeleton — `sendLatticeStepTransition`.)
**Anti-pattern:** Awaiting the sendMessage Promise. This blocks the iteration loop and re-introduces sync coupling between SW and offscreen lifecycles — the exact thing Phase 5 D-16 was designed to avoid.

### Pattern 2: Insertion BEFORE setTimeout schedule

**What:** Tracer calls go INSIDE the iteration body, immediately BEFORE the setTimeout schedule call.
**When to use:** Any per-iteration observability addition to agent-loop.js (Phase 8 and any future tracer phase).
**Anti-pattern:** Wrapping the iteration body in a tracer call. The setTimeout lambda is load-bearing; mutations inside it break INV-04.

### Pattern 3: Dual-export idiom for SW + Node test environments

**What:** `globalScope.X = X; if (typeof module !== 'undefined') module.exports = X;`
**Source:** Phase 5 Plan 05-05 `lattice-runtime-adapter.js`; Phase 6 Plan 06-03 `lattice-provider-bridge.js`.
**Why:** Classic SW uses globalThis namespace; Node CJS tests use require/module.exports. One file serves both.

---

## 14. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step transition tracer event | New custom `_emitStepMarker` in agent-loop | `tracer.event(STEP_TRANSITION_EVENT_NAME, metadata)` via offscreen handler + chrome.runtime.sendMessage | Phase 5/6 already shipped the bus; reinvention violates INV-06 + Phase 5 D-16 |
| Capability Receipt signing | Custom Ed25519 over JCS canonicalization in SW | `createCheckpointHook` + `createReceipt` in offscreen | Lattice's Phase 1-3 surface (451 vitest + 72 FSB smoke PASS); SW lacks Web Crypto Ed25519 reliability across Chrome MV3 lifecycle |
| Step-marker linked-list threading | Custom `previousStepName` chain in session state | Already supported by `CheckpointHookContext.previousStepName` (checkpoint.ts:91); FSB just sets it on the payload | Lattice's existing linked-list pattern, [VERIFIED at receipt.ts:53] |
| Per-iteration UUID for runId | crypto.randomUUID per iteration | Use existing `sessionId` as runId | sessionId IS stable per run; runId is just a stable identifier — exact match for FSB's semantic. Avoids state to persist across SW eviction |
| Aggregation of multiple step events into one receipt | Buffer step events in SW, mint bulk receipt | Per-event mint; let receipts pile up at ~3/iteration; trim later if cost becomes a problem | Rejected by D-02; aggregation introduces new state |

**Key insight:** All four major primitives Phase 8 needs (tracer event literal, checkpoint hook factory, signer, message bus) are already shipped and battle-tested via 312+ FSB smoke PASS + 414/414 Lattice vitest. Phase 8 is **pure wiring** — adding the missing SW-side producer and the two emission callsites.

---

## 15. Common Pitfalls

### Pitfall 1: Inserting tracer call inside setTimeout lambda

**What goes wrong:** Phase 8 iterator regression at first Chrome MV3 reload; SW evicts mid-iteration; FSB autopilot loses state.
**Why it happens:** Programmer mistakes "schedule next iteration" with "step boundary" — visually they're adjacent in the source. Easy to write `setTimeout(function() { sendLatticeStepTransition(...); runAgentIteration(...); }, 100)` instead of placing the tracer call BEFORE the setTimeout call.
**How to avoid:** Add the smoke regex assertion in Section 6 ("no sendLatticeStepTransition inside any setTimeout lambda body"). Make it Part 4 of the smoke test.
**Warning signs:** `grep "setTimeout" agent-loop.js | grep -A 3 lattice` returns non-empty lines.

### Pitfall 2: Awaiting the sendMessage Promise

**What goes wrong:** Iteration loop blocks on offscreen receipt mint; if offscreen has been evicted, the Promise rejects asynchronously and the agent-loop catch block treats it as a fatal error, terminating the session.
**Why it happens:** Programmer wants visibility into mint outcome — adds `await`.
**How to avoid:** D-03 says "fire-and-forget (no await)." Code review checklist: no `await` on `chrome.runtime.sendMessage` for `lattice-step-transition`.
**Warning signs:** Try/catch wrapping the sendMessage in the producer — there's nothing async to catch if you don't await.

### Pitfall 3: Adding new state to session that Phase 9 will need to serialize

**What goes wrong:** Phase 8 adds `session._latticeRunId` or `session._stepCounter`; Phase 9 SurvivabilityAdapter then has to know about these fields to serialize/deserialize correctly. Adds Phase 8↔Phase 9 coupling.
**Why it happens:** Programmer thinks "stable runId across SW eviction" requires session-level state.
**How to avoid:** Use `sessionId` as runId; use `iterNum` (already in session) as stepIndex. ZERO new session fields. Phase 9 inherits zero Phase 8 coupling.
**Warning signs:** Code review finds new `session._lattice*` fields.

### Pitfall 4: First-Chrome-reload latent bugs (Phase 5 precedent)

**What goes wrong:** UAT-1 at 2026-05-31 surfaced two latent Phase 5 bugs (260531-63l offscreen HTML script src + 260531-6n5 esbuild node:* externals). Both passed `npm test` but failed at first real Chrome reload due to CSP / bundler / MV3-specific behaviors that Node testing cannot simulate.
**Why it happens:** Node tests don't exercise Chrome's CSP, MV3 SW classic-script loader, or esbuild bundler edge cases.
**How to avoid:** Phase 8 plan MUST include `npm run build` as a verification step (so esbuild bundles refresh) and the per-axis UAT MUST physically reload the extension at `chrome://extensions`. Per the user's CLAUDE.md, the plan should NOT auto-launch Chrome — the UAT step is user-driven.
**Warning signs:** Plan ships without a `npm run build` + Chrome reload verification step.

### Pitfall 5: Forgetting Phase 6's existing importScripts order

**What goes wrong:** Adding `importScripts('ai/lattice-step-emitter.js')` at the wrong position breaks the SW load order. Phase 6 established alphabetical positioning at line 12 between `cli-parser.js` (11) and `ai-integration.js` (13).
**How to avoid:** Alphabetical: `lattice-p` < `lattice-s` < `mcp-`. New line goes at position 13 (between provider-bridge and ai-integration). Phase 6 also documented the line-12 byte-frozen relative order.
**Warning signs:** SW console boot log order differs from Phase 6 baseline.

---

## 16. Code Examples

Verified patterns from in-session reads:

### Existing offscreen receipt mint contract (Phase 5)

```javascript
// extension/offscreen/lattice-host.js:316-348 — DO NOT MODIFY
const handler = createCheckpointHook({
  runId,
  signer,
  sessionId: payload.sessionId,
  tracer: {
    event: (kind, metadata) => {
      if (kind !== STEP_TRANSITION_EVENT_NAME) return;
      if (metadata && metadata.envelope) {
        chrome.runtime.sendMessage({
          type: "lattice-receipt-minted",
          payload: { envelope: metadata.envelope, runId, stepIndex }
        }).catch(...);
      } else if (metadata && metadata.mintError) {
        chrome.runtime.sendMessage({
          type: "lattice-receipt-mint-failed",
          payload: { runId, stepIndex, mintError: String(metadata.mintError) }
        }).catch(...);
      }
    },
  },
});

pipeline.register("AFTER_TOOL", handler, { band: DEFAULT_CHECKPOINT_BAND });
const ctx = { stepName, stepIndex, timestamp, ... };
pipeline.run("AFTER_TOOL", ctx).catch(...);
```

### Phase 6 sibling module reference (architectural template)

[VERIFIED: `extension/ai/lattice-provider-bridge.js:42-171`]
```javascript
'use strict';
(function (globalScope) {
  const BRIDGE_TAG = '[FSB lattice-provider-bridge]';
  async function executeViaBridge(providerKey, config, requestBody, opts) {
    // ... 100 lines of producer logic
  }
  globalScope.executeViaBridge = executeViaBridge;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { executeViaBridge: executeViaBridge };
  }
  try { console.log(BRIDGE_TAG, 'boot: ...'); } catch (_e) { /* swallow */ }
})(typeof globalThis !== 'undefined' ? globalThis : ...);
```

### agent-loop emission call (Phase 8 to add)

```javascript
// extension/ai/agent-loop.js — INSERT after line 1854
// Phase 8 FINT-11: emit step.transition at LLM_TURN boundary.
// Fire-and-forget per D-03; failures silent. Tracer call goes BEFORE any
// setTimeout schedule per INV-04 + D-07.
if (typeof sendLatticeStepTransition === 'function') {
  sendLatticeStepTransition({
    runId: sessionId,
    sessionId: sessionId,
    stepName: 'LLM_TURN',
    stepIndex: iterNum,
    timestamp: new Date().toISOString()
  });
}
// (existing line 1856 follows: "var toolCalls = _parseToolCalls(...)")
```

```javascript
// extension/ai/agent-loop.js — INSERT inside for(var ci...) loop after line 1907
// Phase 8 FINT-11: emit step.transition at TOOL_DISPATCH boundary.
// One event per tool call per D-01.
if (typeof sendLatticeStepTransition === 'function') {
  sendLatticeStepTransition({
    runId: sessionId,
    sessionId: sessionId,
    stepName: 'TOOL_DISPATCH',
    stepIndex: iterNum,
    previousStepName: 'LLM_TURN',
    timestamp: new Date().toISOString()
  });
}
// (existing logic continues: tool execution, hooks, etc.)
```

The `typeof sendLatticeStepTransition === 'function'` guard is **defensive only**: in production the global is always defined because background.js imports the emitter at line 13. The guard allows agent-loop.js to be loaded in test environments without the emitter (no smoke failure cascade).

---

## 17. State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v0.10.0-attempt-1 FSB-side `_emitStepMarker` helper at agent-loop.js + 12 step markers in runAgentIteration | Phase 8 FSB-side `sendLatticeStepTransition` + 2 boundaries per D-01 | 2026-05-31 (this phase) | Step marker count reduced 12 → 2 (per-iteration boundary semantics, not per-action); signed receipts replace local-only markers |
| FSB-only LIFECYCLE_EVENTS.STEP_TRANSITION (attempt-1 Phase 2) | Lattice's RunEventKind step.transition literal (Phase 3 LSDK-09) | 2026-05-24 (Phase 3) | Per INV-06, Lattice owns the literal; FSB consumes |
| Custom FSB checkpoint-hook.js (attempt-1) | Lattice's createCheckpointHook factory (Phase 3 LSDK-10) | 2026-05-24 (Phase 3) | Per INV-06, factory lives in Lattice |
| Unsigned step markers (attempt-1) | DSSE v1.0 + JCS canonical signed Capability Receipts (v1.1 schema with step-marker fields) | 2026-05-24 (Phase 2 LSDK-02/03 + Phase 3 LSDK-10) | Forensic-quality audit trail; ephemeral Ed25519 signer per offscreen boot |

**Deprecated/outdated patterns this phase MUST NOT resurrect:**
- `setStepMarker(name)` helper — DELETED in pivot to attempt-2; do not add back.
- `LIFECYCLE_EVENTS.STEP_TRANSITION` constant — Lattice's `STEP_TRANSITION_EVENT_NAME` is the source of truth; do not duplicate FSB-side.
- 12-marker per-iteration coverage from attempt-1 Phase 2 — D-01 explicitly locks 2-marker coverage; expanding triggers a re-discussion.

---

## 18. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | sessionId is sufficient as `runId` (stable per autopilot run; no separate UUID needed) | 4 | Receipt traceability across multiple SW boots may be ambiguous if SW evicts mid-run and reloads with same sessionId. Phase 9 SurvivabilityAdapter is the systematic fix. |
| A2 | Smoke test target ≥ 25 PASS is achievable for the proposed Parts 1-4 structure | 8 | If achievable PASS count is lower (e.g., 15-20), planner adjusts min_pass floor without redesigning parts. |
| A3 | `chrome.runtime.sendMessage` in MV3 SW is fire-and-forget compatible (rejected Promise does not crash SW) | 7 | If MV3 enforces stricter unhandled-rejection semantics, the producer needs a `.catch(() => {})`. Trivially fixable. |
| A4 | Adding extra keys to payload (providerKey, model, toolName) is ignored by offscreen handler with no smoke regression | 4 | If offscreen handler validates strict payload shape, extra keys could trigger warning or rejection. Mitigation: do NOT add extras in Phase 8; defer to Phase 10. |
| A5 | Phase 8 plan can run autonomously to completion without user UAT before ceremony — UAT is a checkpoint between code-ship and audit closure | 9 | If user UAT verdict is FAIL, Plan 08-03 audit closure logic conditionally records FAIL verdict; precedent set by Phase 7 Plan 07-04. |

All other claims in this research are tagged `[VERIFIED:]` against in-session file reads.

---

## 19. Open Questions for Planner (RESOLVED)

All 5 questions were operationalized in the Phase 8 plans (08-01/02/03). Resolutions are codified as inline RESOLVED prefixes; the substantive answers are unchanged from the original recommendations.

1. **Where exactly to insert LLM_TURN emission (line 1853 vs 1855)?**
   - What we know: D-01 says "after `_formatAssistantMessage` push." Line 1854 is `session.messages.push(assistantMsg)`. Both line 1854 immediate-after and line 1855 (blank) are valid.
   - RESOLVED: insert AFTER line 1854 (post-push). Keeps the assistant message state mutation atomic and the tracer event observes the post-mutation state. Operationalized in Plan 08-02 Task 1.

2. **Where exactly to insert TOOL_DISPATCH emission (line 1907 vs after permission check at ~1929)?**
   - What we know: D-01 says "inside the `for (var ci = 0; ci < toolCalls.length; ci++)` loop." Both immediately-inside (line 1907) and after-permission-check (~1929+) work.
   - RESOLVED: insert AFTER permission check, BEFORE actual tool execution. Rationale: a denied tool still gets a `step.transition` event with the denial visible in observability (Phase 10 metrics consumer). If inserted before permission check, denied tools emit identically to allowed ones — observability noise. Operationalized in Plan 08-02 Task 2.

3. **Should Plan 08-02 include the `providerKey` + `model` payload extras for Phase 10 forward compat?**
   - What we know: Phase 10 will need driving-model attribution per FINT-18.
   - RESOLVED: NO. Keep Phase 8 payload BYTE-FROZEN with Phase 5 D-16 contract. Phase 10 can extend the payload independently; coupling Phase 8 to Phase 10 wire shape adds risk for no Phase 8 benefit. Operationalized in Plan 08-02 envelope keys (5/6 keys; no providerKey/model fields).

4. **Should the audit closure in Plan 08-03 also update REQUIREMENTS.md "Last updated" footer + Total v1 count?**
   - What we know: Phase 7 Plan 07-02 set this precedent (commit `a96a8dc9`).
   - RESOLVED: YES — mirror Phase 7 ceremony exactly. New REQ count = 32 (post-Phase-7) + 3 (FINT-10/11/12) = 35. Last updated bumped to 2026-05-31. Operationalized in Plan 08-03 Task 1 (Edit 1 + Edit 8).

5. **Should Plan 08-03 mark G3 as already closed (Phase 6) and not re-touch it?**
   - What we know: G3 was closed in Phase 6 Plan 06-02 (`ensureLatticeOffscreen` SW startup call). Audit-doc may not reflect.
   - RESOLVED: Plan 08-03 ceremony reads audit-doc, confirms G3 status, then closes G1 + flips Flow 4. Avoids double-edit. Operationalized in Plan 08-03 Task 3 (G3 untouched; G1 + Flow 4 only).

---

## 20. Sources

### Primary (HIGH confidence — files read in-session 2026-05-31)

- `lattice/packages/lattice/src/receipts/receipt.ts` (lines 1-153) — CreateReceiptInput shape + createReceipt function body
- `lattice/packages/lattice/src/receipts/types.ts` (lines 1-125) — CapabilityReceiptBody schema with v1.1 step-marker fields
- `lattice/packages/lattice/src/contract/checkpoint.ts` (lines 1-262) — createCheckpointHook factory + CheckpointHookContext + CheckpointHookOptions + STEP_TRANSITION_EVENT_NAME constant
- `lattice/packages/lattice/src/tracing/tracing.ts` (lines 1-40) — RunEventKind union confirming "step.transition" literal at position 17
- `extension/ai/agent-loop.js` (lines 1175-1230, 1840-1929, 2455-2553) — runAgentIteration boundaries, setTimeout callsites, providerKey/model/iterNum identity scope
- `extension/ai/lattice-provider-bridge.js` (lines 1-171) — Phase 6 sibling module architectural template
- `extension/offscreen/lattice-host.js` (lines 1-546) — offscreen handler for lattice-step-transition + receipt mint pipeline
- `extension/background.js` (lines 13115-13230) — Phase 6 ensureLatticeOffscreen + importScripts pattern
- `.planning/phases/08-fsb-agent-loop-runs-on-lattice-runtime-emit-step-transition-/08-CONTEXT.md` — locked decisions D-01..D-07
- `.planning/LATTICE-PIN.md` — current SHA `e95067bf`, Phase 6/7 zero-Lattice-commit precedent
- `.planning/v0.10.0-MILESTONE-AUDIT.md` — G1 definition, Flow 4 partial status, UAT-1 PASS verdict at 2026-05-31

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` (FINT-09 entry; FINT-NN..M TBD line 78) — REQ-ID assignment basis
- `.planning/ROADMAP.md` (lines 339-394) — Phase 8/9/10 split rationale
- `tests/lattice-checkpoint-smoke.test.js` (file structure scanned, 280 lines) — smoke template reference for Phase 8

### Tertiary (LOW confidence — not directly relevant to Phase 8 wiring)

- None.

---

## 21. Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries exist; versions verified via in-session file reads.
- Architecture: HIGH — Phase 5/6 patterns are battle-tested precedents.
- Pitfalls: HIGH — Phase 5 UAT-1 (260531-63l + 260531-6n5) provides concrete prior-art for Pitfall 4.
- D-04 verdict: HIGH — `CreateReceiptInput` + `CheckpointHookContext` + `CheckpointHookOptions` directly inspected; no extension needed.
- Wave structure: MEDIUM — 3-plan recommendation is sound but granularity:fine config could support 4 plans; planner's call.

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (30 days — stable surfaces; Lattice SHA frozen; Phase 9 work may invalidate Section 7 degradation pattern but Phase 8 is independent).
