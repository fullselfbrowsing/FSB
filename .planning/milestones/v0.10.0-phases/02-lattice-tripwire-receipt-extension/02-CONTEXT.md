# Phase 2: Lattice tripwire + receipt primitives extension - Context

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Gathered:** 2026-05-24 (assumptions mode -- autonomous)
**Status:** Ready for planning

<domain>
## Phase Boundary

**This phase delivers two outcomes on Lattice's `fsb-integration-experiments` branch:**

1. **Capability Receipt body extension** -- New optional top-level fields (`stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp`) on `CapabilityReceiptBody` with the schema version literal bumped from `"lattice-receipt/v1"` to `"lattice-receipt/v1.1"`. Verifier accepts both versions (discriminated union); JCS canonicalization preserves round-trip; redaction policy unchanged.

2. **Tripwire band pipeline primitive** -- New Lattice module `lattice/packages/lattice/src/contract/bands.ts` shipping priority bands (`SAFETY` > `OBSERVABILITY` > `EXTENSION`), matcher regex (per-handler), race-with-log per-handler budget, frozen-context evaluation, mid-session registration freeze, and a typed `HookLifecycleEvent` union (`BEFORE_PROVIDER` / `AFTER_PROVIDER` / `BEFORE_TOOL` / `AFTER_TOOL`). Existing `evaluateTripwires` purity invariant is preserved -- the new primitive is a sibling.

**Both deliverables land per INV-06 in Lattice first; FSB consumes via the existing `file:./lattice/packages/lattice` path: dependency unchanged.**

**Explicitly NOT in this phase** (deferred to later phases):
- Observability / step-markers (STEP_TRANSITION event kind, checkpoint-hook factory, per-step receipt mint) -- Phase 3 dedicated.
- Provider adapter alignment (5 missing native adapters: Anthropic, Gemini, LM Studio, OpenRouter, xAI) -- Phase 4.
- MV3-survivability adapter contract -- Phase 5.
- Delegation primitive -- Phase 6 (contingent on Lattice multi-agent policy).
- Mainline PR back into Lattice -- v0.11.0+.
- ANY FSB `extension/*` file modification -- Option B reconciliation from Phase 1 still binding.

**The scope anchor:** Phase 2 closes the highest-severity Receipts and Tripwires/hooks audit-doc rows. If a task starts demanding observability (STEP_TRANSITION) or provider extensions, that's scope creep into Phase 3+.

</domain>

<decisions>
## Implementation Decisions

### Receipt-Shape Extensions

- **D-01 New fields land as optional top-level fields on `CapabilityReceiptBody`.** Add `stepName?: string`, `stepIndex?: number`, `parentStepName?: string`, `previousStepName?: string`, `sessionId?: string`, `timestamp?: string` (ISO-8601 RFC 3339) directly on the existing flat record at `lattice/packages/lattice/src/receipts/types.ts`. No nested `extensions` envelope.

- **D-02 Schema version bumped via literal-union narrowing.** `CapabilityReceiptBody.version` becomes `"lattice-receipt/v1" | "lattice-receipt/v1.1"`. `verify.ts` updates `asReceiptBody` to accept BOTH literals; the verifier's existing `version-mismatch` path now only fires when the body version is neither known literal. v1 receipts (Phase 1 smoke) continue to verify unchanged. v1.1 receipts (Phase 2 smoke + future FSB callers) verify with the new fields populated.

- **D-03 New fields round-trip through JCS canonicalization with no special case.** `canonicalize` at `lattice/packages/lattice/src/receipts/canonical.ts` already sorts keys lexicographically (RFC 8785); new optional top-level fields slot in automatically (existing `canonical.test.ts` proves alphabetical-sort behavior). No changes to `canonical.ts` source required.

- **D-04 New fields stay OUT of the redaction manifest.** `redactReceiptBody` at `lattice/packages/lattice/src/receipts/redact.ts` is NOT modified. Step-marker fields are observability metadata (stable identifiers), not user-content / PII. FSB-side contract on the smoke is: callers populate `stepName` etc. with stable identifiers, not free-form user input. This explicit contract is captured in the SUMMARY for future Lattice consumers.

- **D-05 v1 -> v1.1 type discriminated-union shape: literal union with optional fields (researcher confirms).** Lattice's `lattice/AGENTS.md` notes `exactOptionalPropertyTypes` is enabled. The first attempt is a flat optional-fields union: `version: "v1" | "v1.1"` plus `stepName?: string` etc., where v1 callers leave the optional fields `undefined`. If TS 6 + `exactOptionalPropertyTypes` rejects this pattern (e.g., the optional fields are not actually optional from v1's perspective), fall back to two separate body interfaces narrowed via `body.version` discriminant. Researcher confirms which shape compiles cleanly under Lattice's tsconfig.

### Tripwire Band Pipeline

- **D-06 Band pipeline ships as a NEW module: `lattice/packages/lattice/src/contract/bands.ts` + `bands.test.ts`.** Exports `createHookPipeline()` factory returning a typed `HookPipeline` instance with methods: `register(event, handler, opts)`, `freeze()`, `run(event, context)`. The pure `evaluateTripwires` at `tripwire.ts:53-86` is NOT modified -- it stays a pure side-effect-free function for the invariant evaluator role.

- **D-07 Priority bands are an enum: `SAFETY` (0) > `OBSERVABILITY` (1) > `EXTENSION` (2).** Handlers in lower-numbered bands run first; within the same band, registration order. Band ordering carries forward exactly from attempt-1's HookPipeline (preserved at `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/`).

- **D-08 Matcher regex is per-handler, opt-in.** Registration accepts `{ band, matcher?: RegExp }`; when `matcher` is present, the handler runs only when the firing event-kind string matches the regex. When absent, the handler runs on every event kind.

- **D-09 Race-with-log per-handler budget defaults to 100ms.** Each handler runs as `Promise.race([handlerInvocation, budgetTimer])`. If the budget timer wins, a `HOOK_TIMEOUT` event is logged via the tracer interface (existing `TracerLike` at `lattice/packages/lattice/src/tracing/tracing.ts`) with payload `{event, band, budgetMs, sessionId, handlerIndex, elapsedMs}`. Caller can override per-handler with `{ budgetMs: <ms> }`. Whether to use `AbortSignal.timeout()` for actual cancellation (vs let the handler continue running) is **researcher-resolved** -- preferred default is the no-abort pattern (matches attempt-1 + simpler test ergonomics; CPU-leak risk is acceptable at Node).

- **D-10 Frozen-context evaluation: handler receives a structured-clone snapshot of context at registration time -- mutations don't leak.** `Object.freeze` walks the surface; deep-freeze done via `structuredClone` if needed.

- **D-11 Mid-session registration freeze: `pipeline.freeze()` is irreversible -- subsequent `register()` throws.** Freezing typically happens at session-start; protects against late-binding hook injection. Tested with a vitest case asserting the throw.

- **D-12 Lifecycle event vocabulary is a SEPARATE typed union in `bands.ts`:** `type HookLifecycleEvent = "BEFORE_PROVIDER" | "AFTER_PROVIDER" | "BEFORE_TOOL" | "AFTER_TOOL"`. NOT merged into `RunEventKind` at `tracing.ts:11-27` (observability tracer events stay namespaced strings like `run.start`, `provider.attempt` -- a different vocabulary intentionally). Observability/step-marker events stay deferred to Phase 3.

### FSB-Side Smoke + Ceremony

- **D-13 Phase 2's FSB smoke is a NEW file: `tests/lattice-tripwire-smoke.test.js`.** NOT an edit to Phase 1's `tests/lattice-smoke.test.js` (which stays byte-identical, preserving 29-PASS audit trail). Appended to `package.json` `scripts.test` chain immediately after `tests/lattice-smoke.test.js`.

  Smoke covers (at minimum):
  - Mint a v1.1 receipt with `stepName`, `stepIndex`, `sessionId`, `timestamp` populated; verify round-trip via `verifyReceipt` (positive path: `result.ok === true` and all new fields appear in the verified body); ensure no `error.kind: 'version-mismatch'`.
  - Mint a v1 receipt (Phase 1 shape, no new fields); verify round-trip; assert backward compatibility.
  - Register a `HookPipeline`; install three handlers across all 3 bands; emit one `BEFORE_TOOL` event; observe handler invocation sequence asserts band ordering (SAFETY first, EXTENSION last).
  - Install a handler with a matcher regex; emit a non-matching event; assert the handler does NOT fire.
  - Call `pipeline.freeze()`; attempt subsequent `register()`; assert throws.
  - (Optional, if budget cancellation is researcher-confirmed): install a 50ms-budget handler that takes 200ms; assert `HOOK_TIMEOUT` is emitted within 100ms tolerance.

- **D-14 Lattice-side commit ceremony continues from Phase 1.** Each commit on `fsb-integration-experiments` uses conventional commits + body footer `Ref: FSB v0.10.0-attempt-2 Phase 2`. Suggested commit grouping (planner refines):
  - `feat(receipts): extend CapabilityReceiptBody with step-marker fields + bump to v1.1` (types + verify update + minimal test)
  - `feat(contract): add tripwire band pipeline primitive` (bands.ts + bands.test.ts)
  - `docs(fsb-integration): close Phase 2 audit rows (receipts + tripwires/hooks)` (audit-doc flips closed rows to `Covered` with backlink SHAs)
  - Re-export new public surface (`createHookPipeline`, `HookLifecycleEvent`) from `lattice/packages/lattice/src/index.ts` so FSB can bare-specifier import.

- **D-15 D-15 carryforward: NO `git push` to Lattice's remote.** All Lattice commits stay on `fsb-integration-experiments` locally; mainline PR is deferred to v0.11.0+.

- **D-16 LATTICE-PIN.md bumped ONCE at phase end.** `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` advances to the new Lattice HEAD after all Phase 2 Lattice commits land. ONE new row in the per-phase log table references all Phase 2 Lattice commits (concise -- multiple SHAs in the "Lattice work touched" column).

### REQ-ID Population

- **D-17 LSDK REQ-IDs populated at audit-doc row granularity.** Each Blocker row in the Receipts + Tripwires/hooks domains of `lattice/docs/fsb-integration-gaps.md` maps to one LSDK-NN REQ-ID. Sub-IDs (LSDK-XX.1, LSDK-XX.2) are used ONLY if a row has multiple distinct verifiable behaviors (e.g., LSDK-02 might cover all six new receipt-body fields collectively under one REQ; LSDK-03 covers version bump). Concrete REQ-IDs land in `.planning/REQUIREMENTS.md` Traceability section during Phase 2 plan execution (NOT in this CONTEXT.md). Estimated 7-10 REQs total for Phase 2 (down from the analyzer's higher estimate; consolidated where rows share behavior).

- **D-18 No FINT REQ-IDs land in Phase 2** unless the FSB smoke surfaces a new integration-layer requirement. The new smoke file is itself the FINT-02 deliverable (FINT-01 was the file: dep wiring from Phase 1).

### Claude's Discretion

The following are left to the planner / researcher to pick during plan-phase:

- **CD-01 Exact AbortSignal.timeout() vs Promise.race() pattern for race-with-log.** D-09 prefers no-abort; researcher confirms whether Lattice's TypeScript 6 + Node 24 surface or attempt-1's vanilla-JS pattern is best transposed. Either is acceptable.
- **CD-02 Exact typescript shape for `CapabilityReceiptBody` discriminated union.** D-05 prefers flat literal-union; researcher confirms compatibility with `exactOptionalPropertyTypes`.
- **CD-03 Whether to extend `lattice/packages/lattice/src/index.ts` re-exports with `createHookPipeline`, `HookLifecycleEvent`, and other new public surface in one consolidated commit or per-feature.** Either grouping is acceptable so long as D-14 ceremony holds.
- **CD-04 Whether to introduce `bands.ts` test fixtures.** Existing Lattice tests use inline fixtures; the planner may add a small fixture file if the band-ordering tests get repetitive.
- **CD-05 Exact REQ-ID count + numbering scheme (LSDK-02..N).** D-17 sets the rule; planner picks the concrete N during plan execution based on what actually lands.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### FSB-side milestone scope (carried forward from Phase 1)
- `.planning/ROADMAP.md` -- Phase 2 detail section (lines ~80-100); INV-01..INV-06 invariants
- `.planning/REQUIREMENTS.md` -- LSDK/FINT/MCP/PRV category scaffolds; Phase 2 populates LSDK-02..N
- `.planning/PROJECT.md` -- Current Milestone block (v0.10.0-attempt-2 status reflects Phase 1 complete + Phase 2 in progress)
- `.planning/STATE.md` -- Current position + risk register
- `.planning/LATTICE-PIN.md` -- Cross-repo audit trail; Phase 2 bumps `current_lattice_sha`

### Phase 1 audit artifacts (BINDING -- Phase 2 closes specific rows)
- `lattice/docs/fsb-integration-gaps.md` -- AUTHORITATIVE source of which gaps Phase 2 closes; each closed row gets `Covered` status + backlink SHA. **Read this in full before planning.**
- `.planning/phases/01-lattice-gap-survey-scaffold/01-CONTEXT.md` -- Phase 1 decisions D-01..D-16 + `<reconciliation>` block (binding amendments; some carry to Phase 2: D-14 ceremony, D-15 no-push, INV-06 in-Lattice-first)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-RESEARCH.md` -- Lattice surface inventory (lines 150-172 = current receipts/tripwires/policy file layout); FSB test convention pattern; common pitfalls (lines 386-444)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-VERIFICATION.md` -- Phase 1 verified baseline (the state Phase 2 must not regress)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SUMMARY.md`, `01-02-SUMMARY.md` -- Phase 1 outcomes; receipt-mint API contract; smoke test pattern Phase 2 mirrors

### Lattice surfaces being extended
- `lattice/AGENTS.md` -- Lattice contributor conventions (TypeScript-first, capability-first, deterministic routing, ESM-only, pnpm-10, tsdown bundler, `exactOptionalPropertyTypes` enabled)
- `lattice/packages/lattice/src/receipts/types.ts` -- Current `CapabilityReceiptBody` (Phase 2 adds optional fields)
- `lattice/packages/lattice/src/receipts/canonical.ts` -- JCS canonicalization (Phase 2 leverages existing alphabetical-sort behavior; no source change)
- `lattice/packages/lattice/src/receipts/receipt.ts` -- `createReceipt(input, signer)` signature (Phase 2 input now accepts new optional fields)
- `lattice/packages/lattice/src/receipts/verify.ts` -- `asReceiptBody` + `version-mismatch` path (Phase 2 updates to accept both v1 and v1.1)
- `lattice/packages/lattice/src/receipts/redact.ts` -- Redaction manifest (Phase 2 does NOT touch; new fields stay cleartext per D-04)
- `lattice/packages/lattice/src/receipts/sign.ts` -- Signer surface (no change needed; canonical body bytes flow through)
- `lattice/packages/lattice/src/receipts/keyset.ts` -- KeySet (no change)
- `lattice/packages/lattice/src/contract/tripwire.ts` -- Existing pure `evaluateTripwires` (Phase 2 leaves this untouched; new pipeline is sibling)
- `lattice/packages/lattice/src/contract/invariants.ts` -- Invariant kinds (no change)
- `lattice/packages/lattice/src/policy/policy.ts` -- Existing `PolicySpec` (no change; tripwire band pipeline is its own primitive)
- `lattice/packages/lattice/src/tracing/tracing.ts` -- `TracerLike` + `RunEventKind` (Phase 2 uses `TracerLike.emit` for HOOK_TIMEOUT events; does NOT add to `RunEventKind` union -- that's Phase 3)
- `lattice/packages/lattice/src/index.ts` -- Public surface (Phase 2 adds re-exports for `createHookPipeline` + `HookLifecycleEvent`)
- Existing `lattice/packages/lattice/src/receipts/*.test.ts` -- All must remain green (451 tests baseline)
- Existing `lattice/packages/lattice/src/contract/tripwire.test.ts` -- Existing 23 tests must remain green (priority bands primitive does not touch this file)

### Attempt-1 reference patterns (informational -- patterns being migrated INTO Lattice)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/01-01-SUMMARY.md` -- Priority bands + HookPipeline design (vanilla JS form; Lattice port translates to TypeScript factory)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/01-02-SUMMARY.md` through `01-06-SUMMARY.md` -- Matcher, race-with-log, freeze, lockBand patterns (informational)

### Hard invariants (every Phase 2 task gates against these)
- INV-01 MCP wire contracts UNTOUCHED (`tests/tool-definitions-parity.test.js` must remain 142/142 PASS post-Phase-2)
- INV-02 Tool surface parity (no parallel autopilot-only tool stack -- not relevant to Phase 2 unless smoke accidentally touches `TOOL_REGISTRY`)
- INV-03 Provider parity (not directly relevant to Phase 2 unless tripwire-band tests accidentally exercise a provider)
- INV-04 MV3-survivability preserved (`grep -c "setTimeout" extension/ai/agent-loop.js` must remain 8)
- INV-05 No resurrection of `extension/agents/agent-{executor,manager,scheduler}.js` (not touched by Phase 2 by construction)
- INV-06 Lattice SDK primitives live in Lattice's repo, not FSB's (BINDING: all Phase 2 primitive code lands in Lattice; FSB-side is only the new smoke + LATTICE-PIN.md bump + REQUIREMENTS.md REQ-ID population)
- Phase 1 Option B reconciliation continues: NO `extension/*` file modification, NO `manifest.json` change, NO in-extension `import 'lattice'` (Phase 2 inherits this constraint; bundler / SW migration is Phase 5's concern)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createReceipt` mint API:** Already verified by Phase 1 smoke. Phase 2's smoke reuses the same call shape (`lattice.createReceipt({...}, signer)`) but adds the new optional fields to the input.
- **`verifyReceipt` panic-free pattern:** Returns typed `VerifyResult` (never throws across the verification boundary). Phase 2's smoke checks `result.ok === true` for v1.1 receipts AND ensures the `error.kind: 'version-mismatch'` path is NOT triggered.
- **FSB test convention:** `'use strict'`, manual `pass()` / `fail()` counters, `process.exit(failed > 0 ? 1 : 0)` -- proven across Phase 1 + the existing ~100 FSB tests. New `tests/lattice-tripwire-smoke.test.js` mirrors this pattern exactly.
- **Lattice's existing vitest suite:** 451 tests across `src/**/*.test.ts`. Phase 2 adds new test files (e.g., `bands.test.ts`); existing suite must remain green.
- **JCS canonicalization stability:** Adding optional top-level keys to `CapabilityReceiptBody` is canonical-safe because `canonicalize` sorts keys lexicographically (RFC 8785). No `canonical.ts` source edit needed.
- **Lattice public-surface re-export pattern:** `src/index.ts` is a flat per-module export. Adding `createHookPipeline` and `HookLifecycleEvent` to the re-exports follows the existing pattern (one line each, similar to Phase 1's createReceipt re-export).

### Established Patterns
- **One commit per logical surface (D-14 carryforward).** Phase 1 used `feat(receipts):` + `docs(fsb-integration):` separation. Phase 2 mirrors: one commit per (1) receipt-body extension, (2) tripwire-band primitive, (3) audit-doc flip, (4) public-surface re-export bump. Each commit body ends with `Ref: FSB v0.10.0-attempt-2 Phase 2`.
- **Lattice tests are vitest; FSB tests are raw `node`.** Phase 2 adds vitest tests on Lattice's side (in `lattice/packages/lattice/src/contract/bands.test.ts` etc.) AND a raw `node` test on FSB's side (`tests/lattice-tripwire-smoke.test.js`).
- **No `git push` on Lattice (D-15 carryforward).** All Phase 2 Lattice commits stay local on `fsb-integration-experiments`.
- **Pure tripwire evaluator invariant.** `evaluateTripwires` at `tripwire.ts:53-86` is intentionally side-effect-free (no I/O, no Date.now, no random). Phase 2's pipeline (which has side effects: tracer emit, timing) lives in a SEPARATE file (`bands.ts`).

### Integration Points
- **`package.json` (FSB):** Append `&& node tests/lattice-tripwire-smoke.test.js` to `scripts.test` chain immediately after `tests/lattice-smoke.test.js`.
- **`tests/lattice-tripwire-smoke.test.js`:** New file. Phase 2's substantive FSB-side validation surface.
- **`.planning/LATTICE-PIN.md`:** Frontmatter `current_lattice_sha` bumps; per-phase row table gets one new row for Phase 2.
- **`.planning/REQUIREMENTS.md`:** LSDK section gets concrete REQ-IDs (LSDK-02..LSDK-NN per audit-doc-row granularity).
- **`lattice/packages/lattice/src/receipts/types.ts`:** Field additions + version literal union extension.
- **`lattice/packages/lattice/src/receipts/verify.ts`:** `asReceiptBody` updated to accept both v1 and v1.1 literals.
- **`lattice/packages/lattice/src/contract/bands.ts`:** NEW file -- pipeline factory + types.
- **`lattice/packages/lattice/src/contract/bands.test.ts`:** NEW file -- vitest cases for band ordering + matcher + race-with-log + freeze + lifecycle events.
- **`lattice/packages/lattice/src/index.ts`:** Re-export additions (`createHookPipeline`, `HookLifecycleEvent`, possibly `HookPipeline` type).
- **`lattice/docs/fsb-integration-gaps.md`:** Row updates -- closed rows flip to `Covered` with backlink SHA in Notes column. Audit-doc body grows minimally.

</code_context>

<specifics>
## Specific Ideas

- **Receipt v1.1 schema bump favors flat literal-union over `extensions` envelope.** Less surface change (one `types.ts` edit + one `verify.ts` literal-union expansion). Audit-doc gap row text already uses "on the receipt body" language -- matches D-01 + D-02 + D-04 (no redaction policy update needed).
- **Pure tripwire evaluator stays untouched.** New band pipeline is a SIBLING primitive in `bands.ts` -- not a modification of `evaluateTripwires`. The 23 existing tripwire tests survive Phase 2 unchanged.
- **Phase 1 smoke (`tests/lattice-smoke.test.js`) is byte-frozen.** Phase 2's smoke is a separate file. Phase 1's 29-PASS audit trail must remain 29-PASS post-Phase-2 (run as part of the test chain pre/post).
- **Lattice's 451-test vitest suite remains green.** Phase 2 adds new tests; does not modify existing tests. Verification gate: `cd lattice && pnpm test` exits 0 with `451 + N` PASS (where N is Phase 2's net new test count).
- **D-14/D-15/INV-06 carry from Phase 1.** Same `Ref:` footer pattern, no push, work in Lattice first.
- **HOOK_TIMEOUT event payload mirrors attempt-1's shape:** `{event, band, budgetMs, sessionId, handlerIndex, elapsedMs}`. Stable identifiers only -- no user content -- so D-04's redaction-policy-unchanged rule applies if HOOK_TIMEOUT ever ends up inside a receipt body.

</specifics>

<deferred>
## Deferred Ideas

These came up during scoping but belong outside Phase 2:

- **STEP_TRANSITION typed event kind** -- Phase 3 (observability/step-markers). Receipt extension fields in Phase 2 are the data shape; Phase 3 is the runtime that emits them.
- **Checkpoint-hook factory** -- Phase 3 (observability/step-markers). Builds on Phase 2's receipt extensions.
- **Per-step receipt mint** -- Phase 3 (observability/step-markers).
- **Provider adapter alignment for 5 missing providers** -- Phase 4.
- **MV3-survivability adapter contract** -- Phase 5.
- **Delegation primitive** -- Phase 6 (contingent on Lattice multi-agent policy change; otherwise FSB-only).
- **`AbortSignal.timeout()` actual handler cancellation** -- CD-01 researcher-resolved; attempt-1's no-abort pattern is the preferred default.
- **Discriminated-union-via-two-interfaces shape for `CapabilityReceiptBody`** -- CD-02 researcher-resolved; literal-union with optional fields is the preferred default.
- **Bundler / SW classic-to-module migration** -- Phase 5 (where in-extension Lattice import becomes legitimate).
- **Mainline PR back into Lattice** -- v0.11.0+.
- **REQUIREMENTS.md FINT REQ-ID further populated beyond FINT-01 + FINT-02** -- if Phase 2's smoke or subsequent phases surface integration-layer requirements, they get FINT-NN. Otherwise stays scaffold.
- **Skills primitive** -- v0.11.0+ (carryforward from PROJECT.md).
- **Lattice public benchmark** -- carryforward, out of milestone.

### Reviewed Todos (not folded)

(None reviewed for Phase 2 -- gsd-tools `todo match-phase` query not run in this autonomous session.)

</deferred>

---

*Phase: 02-lattice-tripwire-receipt-extension*
*Context gathered: 2026-05-24 via assumptions mode (autonomous; UAT deferred per user directive)*
