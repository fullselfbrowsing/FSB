# Phase 3: Observability + step-markers extension - Context

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Gathered:** 2026-05-24 (assumptions mode -- autonomous)
**Status:** Ready for planning

<domain>
## Phase Boundary

**This phase delivers two outcomes on Lattice's `fsb-integration-experiments` branch + one FSB-side smoke:**

1. **Tracer event extension** -- Add `"step.transition"` literal to Lattice's `RunEventKind` union (`lattice/packages/lattice/src/tracing/tracing.ts`). Existing `RunEvent` interface unchanged (step fields ride in `metadata?: Record<string, unknown>` per the established pattern at `create-ai.ts:862-868`).

2. **`createCheckpointHook` factory** -- New module `lattice/packages/lattice/src/contract/checkpoint.ts` (+ `checkpoint.test.ts`) exporting a factory that produces a hook handler. The handler (registered by the caller via Phase 2's `HookPipeline.register('AFTER_TOOL'/'BEFORE_TOOL', handler, { band: BAND.OBSERVABILITY })`) does two things per step transition: (a) emits a `step.transition` tracer event via `tracer.event?.()`, (b) mints a v1.1 Capability Receipt via `createReceipt(...)` with step-marker fields populated (when a signer is provided). Best-effort mint -- signer failures degrade gracefully to tracer-only emission.

3. **FSB-side smoke** -- New file `tests/lattice-checkpoint-smoke.test.js`. Real-runtime exercise of: register checkpoint hook in OBSERVABILITY band, run a 3-step fake sequence with parent/previous linkage, assert 3 tracer events emitted with monotonically increasing `stepIndex`, assert 3 signed v1.1 receipts verifiable + step-marker fields round-trip + receipts thread via `previousStepName`. Phase 2's smokes (`lattice-smoke.test.js` 29 PASS + `lattice-tripwire-smoke.test.js` 39 PASS) BYTE-FROZEN.

**This phase closes 3 audit-doc Blocker rows** in the Observability/step-markers domain (per `lattice/docs/fsb-integration-gaps.md:80-83`).

**Explicitly NOT in this phase** (deferred):
- Provider adapter alignment (5 missing native adapters) -- Phase 4.
- MV3-survivability adapter contract -- Phase 5.
- Delegation primitive -- Phase 6 (CONTINGENT).
- FSB extension/* file modifications -- Option B reconciliation continues to hold.
- Mainline PR back into Lattice -- v0.11.0+.
- Sidepanel UI consumption (Inspector view) -- separate UI-consumption phase later.
- `runtime/create-ai.ts` modifications. Phase 3's checkpoint hook is opt-in, caller-controlled; it does NOT auto-wire into `runWithConfig`.
- `tripwire.ts`, `bands.ts`, `canonical.ts`, `redact.ts`, `tracing.ts` (beyond the single `RunEventKind` literal addition) modifications. All byte-frozen except `RunEventKind`.

**The scope anchor:** Phase 3 ships the runtime that EMITS per-step receipts. If a task starts demanding sidepanel UI to CONSUME the receipts, or `runAgentLoop` integration, that's scope creep into a later phase.

</domain>

<decisions>
## Implementation Decisions

### step.transition event placement

- **D-01 `step.transition` lands in `RunEventKind` literal union.** At `lattice/packages/lattice/src/tracing/tracing.ts:11-27`, add `| "step.transition"` to the union. The dotted-namespace convention (`run.start`, `stage.start`, `provider.attempt`, `tool.call`) is the existing pattern -- `step.transition` slots in naturally as an observability sibling.

- **D-02 Phase 2's `HookLifecycleEvent` union stays untouched.** `bands.ts:33-37` (BEFORE_PROVIDER / AFTER_PROVIDER / BEFORE_TOOL / AFTER_TOOL) is unchanged. Phase 3 ADDS to `RunEventKind` (observability) WITHOUT modifying `HookLifecycleEvent` (runtime hook attach-points). D-12 from Phase 2 ("separate vocabularies") is preserved.

- **D-03 Step fields ride in `RunEvent.metadata`.** No new top-level fields on `RunEvent`. Established pattern at `tracing.ts:29-39`: `metadata?: Record<string, unknown>` is the catch-all. The metadata shape for `step.transition` events: `{stepName, stepIndex, parentStepName?, previousStepName?, sessionId?, timestamp, runId, receiptId?}`. Stable identifiers only -- no user content (carries forward Phase 2's D-04 contract).

### createCheckpointHook factory shape

- **D-04 Factory lives at NEW module `lattice/packages/lattice/src/contract/checkpoint.ts`.** Sibling-module separation matches Phase 2's pattern (`bands.ts` next to `tripwire.ts` without coupling). Phase 3's checkpoint hook is a sibling to both `bands.ts` (consumes via `HookPipeline.register`) and `receipt.ts` (consumes via `createReceipt`).

- **D-05 Factory signature: `createCheckpointHook(options) -> handler`.** The factory returns a value (the handler) the caller passes to `pipeline.register(...)`. Does NOT auto-register; caller owns registration band + event. Mirrors Phase 2's `createHookPipeline()` pattern (returns a value, doesn't mutate globals).

  Options shape:
  ```typescript
  interface CheckpointHookOptions {
    signer?: ReceiptSigner;       // if absent, hook emits tracer event only (no mint)
    tracer?: TracerLike;           // if absent, hook mints but does not emit
    sessionId?: string;            // optional session identifier
    runId: string;                 // required -- threaded into every receipt body + tracer event
    capability?: Capability;       // optional capability descriptor for receipt body
    runResolver?: () => { model: ModelDescriptor; route: RouteResolution; usage: ReceiptUsage; contractVerdict: ContractVerdict };
                                   // optional resolver for per-step receipt body content (caller may supply per-step state)
  }
  ```

- **D-06 Handler runs in OBSERVABILITY band by default convention.** The caller is responsible for registering with `{ band: BAND.OBSERVABILITY }`. Documented in the factory's JSDoc.

- **D-07 Best-effort mint -- signer failures degrade gracefully.** Inside the handler: try/catch around `createReceipt(...)`. On failure, log via `tracer.event?.("step.transition", { ...metadata, mintError: <message> })` and return; do NOT throw. Mirrors `maybeIssueReceipt` at `create-ai.ts:956-992`.

### Per-step receipt mint semantics

- **D-08 One receipt per step transition (when signer present).** Each invocation of the checkpoint hook mints exactly one signed v1.1 Capability Receipt. Receipt body uses Phase 2's v1.1 schema with step-marker fields populated.

- **D-09 Receipts thread via `previousStepName` + `parentStepName` linked-list fields.** No external array. The caller supplies these fields via the context provided to the hook (the `HookContext` from `bands.ts`). The linked-list threading is the inspector-envelope shape ("envelope IS the receipt" per audit doc line 82). `stepIndex` provides ordinal fallback.

- **D-10 Tracer event emission is exactly one per step, independent of mint outcome.** The hook ALWAYS emits exactly one `step.transition` tracer event per invocation (when a tracer is provided). The event's metadata includes `receiptId` (the signed receipt's envelope ID) when mint succeeded, OR `mintError` when mint failed. Subscribers can route on this.

- **D-11 Receipt body content per step.** Required fields from Phase 2 v1.1: `runId`, `version` (auto v1.1 via hasStepMarker heuristic), `capability` (from options), `action` (from context or fallback "step"). Step-marker fields: `stepName` (from context), `stepIndex` (from context), `parentStepName` (from context), `previousStepName` (from context), `sessionId` (from options), `timestamp` (`new Date().toISOString()`). Other Capability Receipt body fields (model, route, usage, contractVerdict) come from `runResolver()` if supplied, OR from sensible per-step defaults (caller-controlled).

### FSB-side smoke

- **D-12 New file `tests/lattice-checkpoint-smoke.test.js`.** Appended to `package.json` `scripts.test` chain immediately after `tests/lattice-tripwire-smoke.test.js`. Phase 1 smoke + Phase 2 smoke stay BYTE-FROZEN.

- **D-13 Smoke exercises 3-step fake sequence.**
  - step-1 (initial step): `parentStepName=undefined`, `previousStepName=undefined`, `stepIndex=0`
  - step-2: `parentStepName=undefined` (not nested), `previousStepName="step-1"`, `stepIndex=1`
  - step-3: `parentStepName="step-1"` (nested child of step-1), `previousStepName="step-2"`, `stepIndex=2`

  3 steps is the minimum that exercises BOTH `previousStepName` linkage (>=2 transitions) AND `parentStepName` non-null behavior (>=1 nested child).

- **D-14 Smoke asserts:**
  - `pipeline.register('AFTER_TOOL', handler, { band: BAND.OBSERVABILITY })` succeeds.
  - Calling `pipeline.run('AFTER_TOOL', context)` 3 times invokes the hook 3 times.
  - Tracer captures exactly 3 `step.transition` events with monotonically increasing `stepIndex` (0, 1, 2).
  - 3 signed v1.1 envelopes are minted; all 3 verify via `verifyReceipt(envelope, keySet)` returning `ok: true`.
  - All step-marker fields round-trip in each verified body.
  - Threading: `step-2.previousStepName === step-1.stepName`, `step-3.parentStepName === step-1.stepName`, `step-3.previousStepName === step-2.stepName`.
  - >=20 assertions total.

- **D-15 Smoke uses ephemeral keypair via `generateEd25519KeyPairJwk()`.** No hardcoded private key (carries forward Phase 1 + Phase 2 D-04 contract for the smoke specifically).

### Ceremony + audit-doc + REQ-IDs

- **D-16 Lattice commit ceremony continues from Phase 2.** Conventional commits + body footer `Ref: FSB v0.10.0-attempt-2 Phase 3`. Suggested commit grouping (planner refines):
  - `feat(tracing): add step.transition event kind to RunEventKind` (tracing.ts diff)
  - `feat(contract): add createCheckpointHook factory + per-step receipt mint` (checkpoint.ts + checkpoint.test.ts)
  - `feat(api): re-export createCheckpointHook + CheckpointHookOptions from public surface` (index.ts re-export)
  - `docs(fsb-integration): close Phase 3 audit rows (observability/step-markers)` (audit-doc row flips)

- **D-17 No `git push` to Lattice's remote.** D-15 carryforward.

- **D-18 LATTICE-PIN.md bumped ONCE at phase end.** Add a Phase 3 row referencing all Phase 3 Lattice commits.

- **D-19 LSDK REQ-IDs populated at audit-doc row granularity.** Expected ~3-5 LSDK IDs (LSDK-09..LSDK-13 nominal range; planner picks final count based on actual rows closed).

### Claude's Discretion

- **CD-01 RunEvent.metadata key naming.** Whether `stepName` / `stepIndex` etc. go directly on metadata or nested under `metadata.step = {stepName, stepIndex, ...}`. Planner picks based on the existing metadata patterns in `tracing.ts` / `create-ai.ts`.
- **CD-02 Whether to add a small inline test fixture file for the 3-step sequence** (e.g., `tests/fixtures/lattice-checkpoint-steps.js`) or keep the step descriptors inline. Default to inline (matches Phase 2 smoke convention; `tests/fixtures/` contains data fixtures, not test stubs).
- **CD-03 Whether the checkpoint factory accepts a `band?: HookPipelineBand` option** to let callers register in a different band. D-06 says OBSERVABILITY by default; whether to expose band as an option is a planner decision.
- **CD-04 Whether the checkpoint hook should refuse to mint when `runResolver` is absent AND no minimum receipt fields can be constructed.** Default behavior per D-07 is best-effort with try/catch.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### FSB-side milestone scope (carried forward from Phases 1+2)
- `.planning/ROADMAP.md` -- Phase 3 detail
- `.planning/REQUIREMENTS.md` -- LSDK category; Phase 3 populates LSDK-09..N
- `.planning/PROJECT.md` -- Current Milestone block
- `.planning/STATE.md` -- Current position
- `.planning/LATTICE-PIN.md` -- Cross-repo audit trail; Phase 3 bumps `current_lattice_sha`

### Phase 2 outputs (BINDING -- Phase 3 builds on this)
- `.planning/phases/02-lattice-tripwire-receipt-extension/02-CONTEXT.md` -- Phase 2 decisions D-01..D-18, especially D-12 (HookLifecycleEvent separate from RunEventKind)
- `.planning/phases/02-lattice-tripwire-receipt-extension/02-VERIFICATION.md` -- Phase 2 baseline (Lattice 332/332 PASS; FSB 29+39 PASS)
- `lattice/packages/lattice/src/contract/bands.ts` -- Phase 2's HookPipeline. Phase 3 consumes via `pipeline.register()`.
- `lattice/packages/lattice/src/receipts/types.ts` + `receipt.ts` -- Phase 2's v1.1 + `hasStepMarker` heuristic. Phase 3 consumes via `createReceipt(...)`.

### Phase 1 audit doc (rows being closed)
- `lattice/docs/fsb-integration-gaps.md` -- Observability/step-markers domain rows. Phase 3 closes the remaining Blocker rows (step.transition event kind, inspector envelope, etc.).

### Lattice surfaces being extended
- `lattice/AGENTS.md` -- Lattice contributor conventions
- `lattice/packages/lattice/src/tracing/tracing.ts` -- `RunEventKind` union + `RunEvent` interface + `TracerLike` (Phase 3 extends `RunEventKind`)
- `lattice/packages/lattice/src/contract/bands.ts` -- Phase 2's hook pipeline (Phase 3's checkpoint hook registers into this)
- `lattice/packages/lattice/src/contract/tripwire.ts` -- byte-frozen
- `lattice/packages/lattice/src/receipts/{types,receipt,verify,sign,keyset,canonical,redact,envelope}.ts` -- byte-frozen except as already modified in Phase 2
- `lattice/packages/lattice/src/runtime/create-ai.ts` -- byte-frozen (informational reference for tracer event emission patterns: `tracer.event?.(...)` calls at lines 862-868, 956-992)
- `lattice/packages/lattice/src/index.ts` -- Phase 3 adds re-exports for `createCheckpointHook` + `CheckpointHookOptions`

### Attempt-1 reference patterns (informational -- patterns being migrated INTO Lattice)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/02-state-inspectability-carve-out/02-02-PLAN.md` -- attempt-1's `createCheckpointHook(opts)` factory at lines 242-326 (conceptual model being translated to Lattice TypeScript)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/02-state-inspectability-carve-out/02-CONTEXT.md` -- attempt-1 step-marker design history

### Hard invariants (every Phase 3 task gates against these)
- INV-01 MCP wire UNTOUCHED (`node tests/tool-definitions-parity.test.js` 142/142 PASS)
- INV-04 setTimeout iterator preserved (`grep -c "setTimeout" extension/ai/agent-loop.js` returns 8)
- INV-06 Lattice primitives in Lattice (Phase 3 checkpoint hook lives in Lattice; FSB consumes via bare specifier import)
- Phase 2 byte-frozen baseline: `tests/lattice-smoke.test.js` (29 PASS) + `tests/lattice-tripwire-smoke.test.js` (39 PASS); both unchanged
- Phase 2 Lattice files byte-frozen except `tracing.ts` (this single line: adding `"step.transition"` literal) and `index.ts` (re-export additions)
- Phase 1 Option B reconciliation: NO `extension/*` modifications

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phases 1+2)
- **Phase 2's `HookPipeline` from `bands.ts`** -- Phase 3 registers via `pipeline.register(event, handler, { band: BAND.OBSERVABILITY })`.
- **Phase 2's v1.1 `createReceipt` from `receipts/receipt.ts`** -- Phase 3 calls with step-marker fields populated; auto-bumps to v1.1 via `hasStepMarker` heuristic.
- **Phase 2's `verifyReceipt`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `createMemoryKeySet`** -- Phase 3's smoke uses for the round-trip proof.
- **Existing `TracerLike.event?.()` pattern at `create-ai.ts:862-868`** -- Phase 3's checkpoint hook emits via this established pattern.
- **FSB test convention** -- raw `node tests/foo.test.js`; manual counters; `process.exit(failed > 0 ? 1 : 0)`. Phase 3 smoke mirrors Phases 1+2.

### Established Patterns
- **One commit per logical surface (D-16 + D-14 from Phase 2).** Phase 3: tracing.ts edit + checkpoint.ts new + index.ts re-export + audit-doc flip = 4 commits.
- **NO `git push` on Lattice (D-17 + D-15 from Phase 2).**
- **Sibling-module separation.** Phase 3's `checkpoint.ts` is a sibling to `bands.ts` and `tripwire.ts`; consumes both surfaces but doesn't modify either.
- **Best-effort mint** mirrors `maybeIssueReceipt` at `create-ai.ts:956-992` (try/catch absorbs signer failures).

### Integration Points
- **`package.json` (FSB):** Append `&& node tests/lattice-checkpoint-smoke.test.js` to `scripts.test` chain.
- **`tests/lattice-checkpoint-smoke.test.js`:** New file.
- **`lattice/packages/lattice/src/tracing/tracing.ts`:** Add `"step.transition"` to `RunEventKind` literal union.
- **`lattice/packages/lattice/src/contract/checkpoint.ts`:** NEW file (factory + types).
- **`lattice/packages/lattice/src/contract/checkpoint.test.ts`:** NEW file (vitest cases).
- **`lattice/packages/lattice/src/index.ts`:** Re-export `createCheckpointHook` + `CheckpointHookOptions` type.
- **`lattice/docs/fsb-integration-gaps.md`:** Row flips for the 3 Observability/step-markers Blocker rows.
- **`.planning/LATTICE-PIN.md`:** Bump frontmatter SHA + add Phase 3 row.
- **`.planning/REQUIREMENTS.md`:** LSDK-09..N entries.

</code_context>

<specifics>
## Specific Ideas

- **step.transition is in `RunEventKind` (observability), NOT `HookLifecycleEvent` (runtime hook attach-points).** D-12 from Phase 2 said the two vocabularies stay separate -- Phase 3 preserves this and ADDS to the observability vocabulary.
- **`createCheckpointHook` returns a handler the caller registers.** Mirrors Phase 2's `createHookPipeline()` shape: factory returns a value, caller owns registration. Avoids global mutation.
- **3-step smoke** exercises both `previousStepName` (linear linkage) AND `parentStepName` (nested child) semantics. Minimum viable smoke size.
- **`tracing.ts` modification is ONE LINE** (adding `"step.transition"` literal to the union). `RunEvent` interface unchanged; step fields ride in `metadata`.
- **Best-effort mint** = tracer event ALWAYS emits; receipt mint is opt-in (when signer present) and try/catch-wrapped.
- **Phase 2 byte-frozen baseline:** every Phase 2 file untouched except the one tracing.ts line and index.ts re-export additions.

</specifics>

<deferred>
## Deferred Ideas

These came up during scoping but belong outside Phase 3:

- **Sidepanel UI consumption (Inspector view) of per-step receipts** -- separate UI-consumption phase.
- **`runtime/create-ai.ts` auto-wiring** -- Phase 3 keeps the checkpoint hook caller-controlled; future phase may explore opt-in `createAI({ checkpointHook: ... })` integration.
- **MV3-survivable encoding of the per-step receipt stream** -- Phase 5 (MV3-survivability adapter contract).
- **Provider adapter alignment** -- Phase 4.
- **Delegation primitive** -- Phase 6 (contingent).
- **`HookContext` extension fields** for step-marker propagation. Phase 3 reads from existing context; if a future phase needs typed step context, that's a Phase 4+ decision.
- **Mainline PR back into Lattice** -- v0.11.0+.

### Reviewed Todos (not folded)

(None reviewed for Phase 3 -- gsd-tools `todo match-phase` query not run in this autonomous session.)

</deferred>

---

*Phase: 03-observability-step-markers-extension*
*Context gathered: 2026-05-24 via assumptions mode (autonomous; UAT deferred per user directive)*
