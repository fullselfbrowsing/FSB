# Phase 2: Lattice tripwire + receipt primitives extension - Research

**Researched:** 2026-05-24
**Domain:** Lattice TypeScript SDK extension (`lattice/packages/lattice` workspace) -- receipt-body schema bump + new tripwire band pipeline primitive, plus FSB-side real-runtime smoke test that exercises both primitives via the existing `file:` dep
**Confidence:** HIGH (every API, file path, type signature, command, and diff in this document was verified against the on-disk Lattice tree at SHA `22bf986` and the FSB tree at HEAD `2d584876`. Both Claude's Discretion items CD-01 and CD-02 were resolved via empirical probes -- see Summary -> CD Resolutions.)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Receipt-Shape Extensions**

- **D-01 New fields land as optional top-level fields on `CapabilityReceiptBody`.** Add `stepName?: string`, `stepIndex?: number`, `parentStepName?: string`, `previousStepName?: string`, `sessionId?: string`, `timestamp?: string` (ISO-8601 RFC 3339) directly on the existing flat record at `lattice/packages/lattice/src/receipts/types.ts`. No nested `extensions` envelope.

- **D-02 Schema version bumped via literal-union narrowing.** `CapabilityReceiptBody.version` becomes `"lattice-receipt/v1" | "lattice-receipt/v1.1"`. `verify.ts` updates `asReceiptBody` to accept BOTH literals; the verifier's existing `version-mismatch` path now only fires when the body version is neither known literal. v1 receipts (Phase 1 smoke) continue to verify unchanged. v1.1 receipts (Phase 2 smoke + future FSB callers) verify with the new fields populated.

- **D-03 New fields round-trip through JCS canonicalization with no special case.** `canonicalize` at `lattice/packages/lattice/src/receipts/canonical.ts` already sorts keys lexicographically (RFC 8785); new optional top-level fields slot in automatically (existing `canonical.test.ts` proves alphabetical-sort behavior). No changes to `canonical.ts` source required.

- **D-04 New fields stay OUT of the redaction manifest.** `redactReceiptBody` at `lattice/packages/lattice/src/receipts/redact.ts` is NOT modified. Step-marker fields are observability metadata (stable identifiers), not user-content / PII. FSB-side contract on the smoke is: callers populate `stepName` etc. with stable identifiers, not free-form user input. This explicit contract is captured in the SUMMARY for future Lattice consumers.

- **D-05 v1 -> v1.1 type discriminated-union shape: literal union with optional fields (researcher confirms).** Lattice's `lattice/AGENTS.md` notes `exactOptionalPropertyTypes` is enabled. The first attempt is a flat optional-fields union: `version: "v1" | "v1.1"` plus `stepName?: string` etc., where v1 callers leave the optional fields `undefined`. If TS 6 + `exactOptionalPropertyTypes` rejects this pattern, fall back to two separate body interfaces narrowed via `body.version` discriminant. **[RESEARCHER RESOLVED: flat literal-union compiles cleanly -- see CD-02 Resolution below.]**

**Tripwire Band Pipeline**

- **D-06 Band pipeline ships as a NEW module: `lattice/packages/lattice/src/contract/bands.ts` + `bands.test.ts`.** Exports `createHookPipeline()` factory returning a typed `HookPipeline` instance with methods: `register(event, handler, opts)`, `freeze()`, `run(event, context)`. The pure `evaluateTripwires` at `tripwire.ts:53-86` is NOT modified -- it stays a pure side-effect-free function for the invariant evaluator role.

- **D-07 Priority bands are an enum: `SAFETY` (0) > `OBSERVABILITY` (1) > `EXTENSION` (2).** Handlers in lower-numbered bands run first; within the same band, registration order. Band ordering carries forward exactly from attempt-1's HookPipeline.

- **D-08 Matcher regex is per-handler, opt-in.** Registration accepts `{ band, matcher?: RegExp }`; when `matcher` is present, the handler runs only when the firing event-kind string matches the regex. When absent, the handler runs on every event kind.

- **D-09 Race-with-log per-handler budget defaults to 100ms.** Each handler runs as `Promise.race([handlerInvocation, budgetTimer])`. If the budget timer wins, a `HOOK_TIMEOUT` event is logged via the tracer interface with payload `{event, band, budgetMs, sessionId, handlerIndex, elapsedMs}`. Caller can override per-handler with `{ budgetMs: <ms> }`. **[RESEARCHER RESOLVED: no-abort `Promise.race` is correct -- see CD-01 Resolution below.]**

- **D-10 Frozen-context evaluation: handler receives a structured-clone snapshot of context at registration time -- mutations don't leak.** `Object.freeze` walks the surface; deep-freeze done via `structuredClone` if needed.

- **D-11 Mid-session registration freeze: `pipeline.freeze()` is irreversible -- subsequent `register()` throws.** Freezing typically happens at session-start; protects against late-binding hook injection.

- **D-12 Lifecycle event vocabulary is a SEPARATE typed union in `bands.ts`:** `type HookLifecycleEvent = "BEFORE_PROVIDER" | "AFTER_PROVIDER" | "BEFORE_TOOL" | "AFTER_TOOL"`. NOT merged into `RunEventKind` at `tracing.ts:11-27`.

**FSB-Side Smoke + Ceremony**

- **D-13 Phase 2's FSB smoke is a NEW file: `tests/lattice-tripwire-smoke.test.js`.** NOT an edit to Phase 1's `tests/lattice-smoke.test.js`. Appended to `package.json` `scripts.test` chain immediately after `tests/lattice-smoke.test.js`.

- **D-14 Lattice-side commit ceremony continues from Phase 1.** Each commit on `fsb-integration-experiments` uses conventional commits + body footer `Ref: FSB v0.10.0-attempt-2 Phase 2`. Suggested commit grouping: (1) `feat(receipts):` extending body + version bump, (2) `feat(contract):` adding bands.ts pipeline, (3) `docs(fsb-integration):` flipping audit rows, (4) re-export bump.

- **D-15 NO `git push` to Lattice's remote.** All Lattice commits stay on `fsb-integration-experiments` locally; mainline PR deferred to v0.11.0+.

- **D-16 LATTICE-PIN.md bumped ONCE at phase end.** `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` advances; ONE new row in the per-phase log table references all Phase 2 Lattice commits.

**REQ-ID Population**

- **D-17 LSDK REQ-IDs populated at audit-doc row granularity.** Each closed Blocker row in Receipts + Tripwires/hooks domains of `lattice/docs/fsb-integration-gaps.md` maps to one LSDK-NN REQ-ID. Sub-IDs only when a row has multiple distinct verifiable behaviors. Concrete REQ-IDs land in `REQUIREMENTS.md` Traceability section during Phase 2 plan execution (NOT in this CONTEXT.md). Estimated 7-10 REQs total.

- **D-18 No FINT REQ-IDs land in Phase 2** unless the FSB smoke surfaces a new integration-layer requirement. The new smoke file is itself the FINT-02 deliverable.

### Claude's Discretion (researcher resolutions inline below)

- **CD-01 Exact AbortSignal.timeout() vs Promise.race() pattern for race-with-log.** D-09 prefers no-abort; researcher confirms whether Lattice's TS 6 + Node 24 surface or attempt-1's vanilla-JS pattern is best transposed. **[RESOLVED -- see CD-01 Resolution]**
- **CD-02 Exact typescript shape for `CapabilityReceiptBody` discriminated union.** D-05 prefers flat literal-union; researcher confirms compatibility with `exactOptionalPropertyTypes`. **[RESOLVED -- see CD-02 Resolution]**
- **CD-03 Re-export grouping in `lattice/packages/lattice/src/index.ts`.** Either consolidated or per-feature commit is acceptable so long as D-14 ceremony holds. **[Recommendation: one consolidated re-export commit at end of plan, mirroring Phase 1's pattern]**
- **CD-04 Whether to introduce `bands.ts` test fixtures.** Existing Lattice tests use inline fixtures; the planner may add a small fixture file if the band-ordering tests get repetitive. **[Recommendation: inline; see "Lattice test pattern" below]**
- **CD-05 Exact REQ-ID count + numbering scheme (LSDK-02..N).** D-17 sets the rule; planner picks N during plan execution. **[Recommendation: 7 REQ-IDs covering 2 receipts + 5 tripwires-hooks rows; see "Audit-Doc Row Closure Map" below]**

### Deferred Ideas (OUT OF SCOPE)

- **STEP_TRANSITION typed event kind** -- Phase 3 (observability/step-markers). Phase 2 ships the receipt FIELDS; Phase 3 ships the RUNTIME that emits them.
- **Checkpoint-hook factory** -- Phase 3.
- **Per-step receipt mint** -- Phase 3.
- **Provider adapter alignment for 5 missing providers** -- Phase 4.
- **MV3-survivability adapter contract** -- Phase 5.
- **Delegation primitive** -- Phase 6 (contingent on Lattice multi-agent policy).
- **`AbortSignal.timeout()` actual handler cancellation** -- CD-01 researcher-resolved (no-abort preferred); revisit if attempt-1 CPU-leak concerns materialize.
- **Discriminated-union-via-two-interfaces shape** -- CD-02 researcher-resolved (flat-union preferred); fallback only if a future field forces the issue.
- **Bundler / SW classic-to-module migration** -- Phase 5.
- **Mainline PR back into Lattice** -- v0.11.0+.
- **FINT REQ-IDs beyond FINT-02** -- only if smoke surfaces new integration-layer work.

</user_constraints>

<phase_requirements>
## Phase Requirements

No specific REQ-IDs were supplied to the researcher at this phase. Phase 2's planning task itself populates LSDK-02..N at audit-doc-row granularity (D-17). The "Audit-Doc Row Closure Map" section below enumerates the concrete rows Phase 2 closes; planner converts these to REQ-IDs during plan execution.

The planner references requirements by **category** plus the row-closure map:

| Category | Phase 2 Coverage | Research Support |
|----------|------------------|------------------|
| LSDK | Phase 2 populates LSDK-02..LSDK-08 (estimated 7 REQs covering Receipts rows 2-3 + Tripwires/hooks rows 2-5). | See "Audit-Doc Row Closure Map" + "Standard Stack -> Lattice surfaces touched" |
| FINT | FINT-02 = new `tests/lattice-tripwire-smoke.test.js` real-runtime smoke. Concrete REQ-ID may land if planner deems the smoke a distinct integration-layer deliverable. | See "Code Examples -> FSB tripwire smoke test skeleton" |
| MCP | INV-01 (MCP wire contracts untouched) verified by existing `tests/tool-definitions-parity.test.js` continuing to pass. Phase 2 adds NEW files only; touches zero MCP surface. | See "Validation Architecture" |
| PRV | No provider work in Phase 2. | n/a |

**Pass criteria (from Phase 2 ROADMAP entry + 02-CONTEXT.md):**

| # | Check | Research-derived test |
|---|-------|----------------------|
| 1 | Lattice's vitest suite still passes (existing tests + new bands tests + new receipt-v1.1 tests). No regressions. | `cd lattice && pnpm test` exits 0 -- see "Validation Architecture -> Lattice test framework" |
| 2 | FSB's `npm test` chain (with new smoke) exits 0 and exercises the newly-shipped primitives end-to-end. | `npm test` exits 0; new smoke runs after `tests/lattice-smoke.test.js` |
| 3 | `lattice/docs/fsb-integration-gaps.md` rows that Phase 2 closes flip to `Covered` with commit SHAs. | See "Audit-Doc Row Closure Map" for the exact rows + diff |
| 4 | `.planning/LATTICE-PIN.md` reflects the new Lattice HEAD with a Phase 2 entry referencing the new commits. | One row append + frontmatter `current_lattice_sha` bump -- see "Code Examples -> LATTICE-PIN.md update diff" |
| 5 | `.planning/REQUIREMENTS.md` LSDK category lines for tripwire + receipt extensions are populated with concrete REQ-IDs. | See "Audit-Doc Row Closure Map" for the proposed 7-REQ mapping |

</phase_requirements>

## Summary

Phase 2 ships **two atomic primitives** into Lattice's `fsb-integration-experiments` branch and **one real-runtime smoke** on the FSB side, all consumable via the existing `file:./lattice/packages/lattice` dependency wired in Phase 1.

**Primitive 1 -- Capability Receipt body v1.1 extension.** Six optional top-level fields land on `CapabilityReceiptBody` (`stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp`); the `version` literal becomes `"lattice-receipt/v1" | "lattice-receipt/v1.1"`; `verify.ts:asReceiptBody` accepts both. JCS canonicalization is byte-stable (the existing alphabetical sort handles new keys automatically -- verified by reading `canonical.test.ts:104-137`). Redaction policy is byte-frozen (D-04 contract: step-marker fields are stable identifiers, not user content). Phase 1's `tests/lattice-smoke.test.js` mints a v1 receipt and continues to verify unchanged (regression gate).

**Primitive 2 -- Tripwire band pipeline.** A NEW module `lattice/packages/lattice/src/contract/bands.ts` exports `createHookPipeline()`, returning a `HookPipeline` instance with `register(event, handler, opts?)`, `freeze()`, `run(event, context)`. Priority bands (`SAFETY=0` > `OBSERVABILITY=1` > `EXTENSION=2`), per-handler regex matcher, per-handler `Promise.race` budget (default 100ms; HOOK_TIMEOUT emitted via the existing `TracerLike.event` interface, NOT added to `RunEventKind`), `structuredClone`-then-`Object.freeze` context per handler, and irreversible `freeze()`. The pure evaluator in `tripwire.ts:53-86` is untouched (sibling, not modification). Lifecycle events `BEFORE_PROVIDER | AFTER_PROVIDER | BEFORE_TOOL | AFTER_TOOL` form a SEPARATE typed union -- intentionally not merged with the run-event-kind namespace (`run.start` / `provider.attempt` / etc.).

**Smoke -- `tests/lattice-tripwire-smoke.test.js`.** Real-runtime exercise (mirrors Phase 1 convention: `'use strict'` CJS + manual counters + `await import('lattice')` dynamic ESM). Mints one v1.1 receipt with step-marker fields populated, asserts the verifier round-trips (positive path); mints one v1 receipt, asserts backward compatibility; constructs a pipeline, installs three handlers in three bands, fires `BEFORE_TOOL`, asserts SAFETY-first ordering; installs a matcher-gated handler, fires a non-matching event, asserts no invocation; calls `freeze()`, asserts subsequent `register()` throws; (optional) installs a slow handler with a 50ms budget, asserts HOOK_TIMEOUT event observed.

**Primary recommendation:** Plan Phase 2 in three Lattice-side waves and one FSB-side wave -- (W0) Lattice receipt v1.1 type extension + verify.ts update + minimal receipt test; (W1) Lattice `bands.ts` factory + `bands.test.ts`; (W2) Lattice `src/index.ts` re-export + `lattice/docs/fsb-integration-gaps.md` audit-row flip; (W3) FSB `tests/lattice-tripwire-smoke.test.js` + `package.json scripts.test` chain append + `.planning/LATTICE-PIN.md` bump + `REQUIREMENTS.md` LSDK-02..LSDK-08 populate. All Lattice-side waves stay local on `fsb-integration-experiments` per D-15.

### CD-01 Resolution: No-abort `Promise.race` is correct.

**Probe:** Grepped Lattice's entire `src/` for `Promise.race`, `setTimeout`, `AbortController`, `clearTimeout` -- found ZERO matches. `AbortSignal` is only referenced as a passthrough field on `RunIntent.signal` / `ProviderRunRequest.signal` / `ToolDefinition.signal` (forwarded to provider adapters; nothing in Lattice's internal pipeline RACES against it). The only `structuredClone` site is `sessions/session.ts:200` and `storage/memory.ts:84`. The only `Object.freeze` sites are in `contract/invariants.ts` (frozen invariant declarations) and `contract/contract.ts` (frozen contract values). **There is no existing async-timeout pattern in Lattice to imitate.**

**Decision:** Use the simpler no-abort `Promise.race([handlerInvocation, budgetTimer])` pattern. The handler keeps running in the background after a timeout (CPU-leak risk is acceptable -- D-09 explicit); the pipeline continues to the next handler. This matches attempt-1's HookPipeline pattern (see `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/01-01-SUMMARY.md` lines 24, 33: "Promise.race([handlerPromise, budgetPromise])"). It is also strictly simpler to test under vitest (no fake-timer choreography needed). The `bands.test.ts` slow-handler test sets `budgetMs: 50` and the handler does `await new Promise(r => setTimeout(r, 200))`; the test asserts `HOOK_TIMEOUT` event was emitted within ~100ms tolerance using real timers.

**Pattern (pseudo-TypeScript):**

```typescript
async function runHandlerWithBudget(
  handler: (ctx: FrozenContext) => Promise<HandlerResult>,
  ctx: FrozenContext,
  budgetMs: number,
  emit: (kind: string, payload: Record<string, unknown>) => void,
  event: HookLifecycleEvent,
  band: Band,
  handlerIndex: number,
  sessionId: string | undefined,
): Promise<HandlerResult | undefined> {
  const startedAt = performance.now();
  let timeoutFired = false;
  const budgetPromise = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      timeoutFired = true;
      resolve(undefined);
    }, budgetMs);
  });
  const handlerPromise = (async () => {
    try {
      return await handler(ctx);
    } catch {
      return undefined;
    }
  })();
  const result = await Promise.race([handlerPromise, budgetPromise]);
  if (timeoutFired && result === undefined) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    emit("HOOK_TIMEOUT", {
      event,
      band,
      budgetMs,
      ...(sessionId !== undefined ? { sessionId } : {}),
      handlerIndex,
      elapsedMs,
    });
    return undefined;
  }
  return result;
}
```

### CD-02 Resolution: Flat literal-union compiles cleanly under `exactOptionalPropertyTypes: true`.

**Probe:** Compiled the proposed shape at `/tmp/tsprobe/test.ts` with `typescript@6.0.3` and the exact compiler flags Lattice uses (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `target: ES2024`, `module: ESNext`, `moduleResolution: Bundler`):

```typescript
interface CapabilityReceiptBody {
  readonly version: "lattice-receipt/v1" | "lattice-receipt/v1.1";
  // ... existing fields ...
  readonly stepName?: string;
  readonly stepIndex?: number;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
}
```

**Compilation results:**
- ✓ A v1 body with NO step-marker fields type-checks cleanly.
- ✓ A v1.1 body with step-marker fields type-checks cleanly.
- ✓ Discriminated narrowing via `if (b.version === "lattice-receipt/v1.1") { ... }` works inside the if-block (TypeScript narrows the literal but keeps step-marker fields optional, which is exactly the desired behavior -- a v1.1 receipt MAY have step markers but isn't REQUIRED to).
- ✗ Explicit `stepName: undefined` is rejected: "Type 'undefined' is not assignable to type 'string'" -- this is the standard `exactOptionalPropertyTypes` enforcement.

**Why the third bullet doesn't matter:** Lattice's `receipt.ts:93-98` already uses the conditional-spread idiom `...(input.X !== undefined ? { X: input.X } : {})` precisely to avoid emitting `X: undefined`. The new step-marker fields use the SAME idiom in `createReceipt` body assembly. v1 callers (Phase 1 smoke) omit the fields entirely; v1.1 callers (Phase 2 smoke) include them. No `: undefined` literal ever appears.

**Decision:** Use the **flat literal-union** shape (D-05 preferred default). Strictly less surface change than the two-interface fallback (one type definition modified instead of two new interfaces + one union type). Tests reuse the existing `makeBody()` helper in `canonical.test.ts:11-39` with a single `version` override; v1.1 callers add the optional step-marker fields via the same overrides pattern.

**Fallback NOT needed.** The two-interface shape (`V1Body | V11Body`) was tested as a probe and also compiled cleanly, but offers no benefit -- it would force v1 callers to use a wider union and impose stricter type discipline that doesn't reflect the runtime contract (a v1 receipt happens to have no step-marker fields populated; the runtime doesn't reject them at parse-time). Stick with the flat union.

## Project Constraints (from CLAUDE.md)

**FSB project CLAUDE.md (./CLAUDE.md):** Not present at FSB root (verified via `Read`). All FSB conventions inherit from the user-global `~/.claude/CLAUDE.md` directives surfaced via system reminders:

- **NO emojis** in terminal logs, READMEs, markdown, or any user-facing text. The bands.ts source code, bands.test.ts test names, FSB smoke `console.log` lines, and audit-doc row updates MUST stay emoji-free. Planner's verification step greps for high-bytes characters in modified files.
- **Real-runtime tests, not static-text greps.** The FSB tripwire smoke MUST actually exercise the band pipeline with handlers being invoked and asserts on real call sequences -- NOT a grep of bands.ts for "createHookPipeline" identifier presence. (This was the Phase 278 anti-pattern caught by gsd-debug in commit 9a458184.)
- **Never run applications automatically.** Planner's verification commands run tests only; no `npm start`, no extension load. Manual MV3 reload checks (if any) stay deferred-pending-UAT per Phase 1's precedent.

**Lattice project CLAUDE.md (`lattice/AGENTS.md`):** Read in full. Binding constraints relevant to Phase 2:

- **TypeScript 6 + `exactOptionalPropertyTypes`** (verified at `lattice/tsconfig.base.json:8`). Already addressed by CD-02 Resolution.
- **ESM-only** (`"type": "module"` in `lattice/packages/lattice/package.json:5`). New `bands.ts` is ESM; imports use `.js` extension suffix per moduleResolution: Bundler convention (verified in `index.ts:17`: `from "./receipts/receipt.js"`).
- **One umbrella package with modular internals** -- new `bands.ts` lives under `src/contract/` (sibling to `tripwire.ts`), tree-shakable per `sideEffects: false`.
- **Capability-first, small public API** -- only `createHookPipeline`, `HookPipeline` type, `HookLifecycleEvent` type, and (optionally) the `BAND` enum get re-exported from `src/index.ts`. Internal helpers stay non-exported.
- **MCP-native where tools/context integration is needed** -- not applicable to Phase 2 (no MCP work).
- **Transparency: every run must be inspectable** -- HOOK_TIMEOUT events emitted via `TracerLike.event` are inspectable through the existing tracer surface.
- **Vitest for all package tests** -- new `bands.test.ts` uses vitest exactly like `tripwire.test.ts` (see "Lattice test pattern" below).
- **`pnpm@10.33.1` + `tsdown` build** -- no toolchain change in Phase 2. `tsdown.config.ts` entry stays `src/index.ts`; the new `bands.ts` reaches the bundle through the re-export in `src/index.ts`.
- **GSD workflow enforcement.** Lattice's AGENTS.md GSD section says "Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it." Phase 2 plans run UNDER `/gsd-plan-phase` / `/gsd-execute-phase`, so this constraint is honored by construction.

## Standard Stack

### Lattice surfaces touched (precise file inventory)

| File | Action | Reason |
|------|--------|--------|
| `lattice/packages/lattice/src/receipts/types.ts` | MODIFY: bump `CapabilityReceiptBody.version` literal-union; add 6 optional fields | D-01, D-02 |
| `lattice/packages/lattice/src/receipts/verify.ts` | MODIFY: `asReceiptBody` accepts both literals | D-02 |
| `lattice/packages/lattice/src/receipts/receipt.ts` | MODIFY: `CreateReceiptInput` adds 6 optional fields; `createReceipt` body assembly uses conditional-spread for each | D-01 (mint path must accept the new fields) |
| `lattice/packages/lattice/src/receipts/canonical.ts` | UNCHANGED | D-03 -- JCS sort is alphabetical, new optional fields slot in automatically |
| `lattice/packages/lattice/src/receipts/redact.ts` | UNCHANGED | D-04 -- step-marker fields stay out of redaction manifest |
| `lattice/packages/lattice/src/receipts/sign.ts` | UNCHANGED | Phase 2 doesn't touch signer surface |
| `lattice/packages/lattice/src/receipts/keyset.ts` | UNCHANGED | Phase 2 doesn't touch keyset surface |
| `lattice/packages/lattice/src/receipts/envelope.ts` | UNCHANGED | DSSE envelope shape is byte-frozen |
| `lattice/packages/lattice/src/receipts/canonical.test.ts` | MAYBE-EXTEND: add a vector showing new optional field alphabetical placement | D-03 stability proof; planner's discretion |
| `lattice/packages/lattice/src/receipts/receipt.test.ts` | EXTEND: add "v1.1 mint with step markers" + "v1 mint backward-compat" cases | D-02, D-13 |
| `lattice/packages/lattice/src/receipts/verify.test.ts` | EXTEND: add "verify v1.1 receipt" + "verify v1 receipt unchanged" cases | D-02 |
| `lattice/packages/lattice/src/receipts/redact.test.ts` | UNCHANGED | D-04 -- redaction policy unchanged |
| `lattice/packages/lattice/src/contract/bands.ts` | CREATE | D-06 -- new band pipeline primitive |
| `lattice/packages/lattice/src/contract/bands.test.ts` | CREATE | D-06 -- vitest coverage |
| `lattice/packages/lattice/src/contract/tripwire.ts` | UNCHANGED | D-06 -- bands.ts is a SIBLING, not a modification |
| `lattice/packages/lattice/src/contract/invariants.ts` | UNCHANGED | Phase 2 doesn't touch invariant schema |
| `lattice/packages/lattice/src/policy/policy.ts` | UNCHANGED | Phase 2 doesn't touch PolicySpec |
| `lattice/packages/lattice/src/tracing/tracing.ts` | UNCHANGED | D-12 -- HOOK_TIMEOUT goes through `TracerLike.event` (untyped string), NOT added to `RunEventKind` |
| `lattice/packages/lattice/src/index.ts` | MODIFY: add re-exports `createHookPipeline`, `HookLifecycleEvent`, `HookPipeline` | D-06 -- bands API public surface |
| `lattice/packages/lattice/src/runtime/public-types.ts` | MODIFY: re-export `HookLifecycleEvent`, `HookPipeline` type (if planner consolidates types here) | CD-03 planner discretion -- types currently live in two places (`index.ts` + `runtime/public-types.ts`); follow existing convention |
| `lattice/packages/lattice/tsdown.config.ts` | UNCHANGED | Entry stays `src/index.ts`; new bands.ts bundled via re-export |
| `lattice/packages/lattice/vitest.config.ts` | UNCHANGED | Glob `**/*.test.ts` picks up bands.test.ts automatically |
| `lattice/packages/lattice/package.json` | UNCHANGED | No new dependencies; vitest, tsdown, canonicalize all already present |
| `lattice/docs/fsb-integration-gaps.md` | MODIFY: flip closed rows to `Covered` with SHA backlinks | D-17 |

### FSB surfaces touched (precise file inventory)

| File | Action | Reason |
|------|--------|--------|
| `tests/lattice-tripwire-smoke.test.js` | CREATE | D-13, FINT-02 |
| `tests/lattice-smoke.test.js` | UNCHANGED -- byte-frozen | D-13 (Phase 1 audit trail preserved) |
| `package.json` (`scripts.test`) | MODIFY: append `&& node tests/lattice-tripwire-smoke.test.js` immediately after `node tests/lattice-smoke.test.js` | D-13 |
| `.planning/LATTICE-PIN.md` | MODIFY: bump frontmatter `current_lattice_sha`; append Phase 2 row to per-phase table | D-16 |
| `.planning/REQUIREMENTS.md` | MODIFY: populate LSDK-02..LSDK-08 (or planner-chosen count) | D-17 |
| ANY `extension/*` file | UNCHANGED | Phase 1 Option B reconciliation: no in-extension Lattice import in Phase 2 |
| `manifest.json` | UNCHANGED | Same reason |
| `mcp/*` | UNCHANGED | INV-01 hard gate |

### Lattice baseline versions (verified)

| Tool | Version | Source |
|------|---------|--------|
| Node | `25.9.0` (developer machine; Lattice requires `>=24`) | `node --version` + `lattice/packages/lattice/package.json:7-9` |
| npm | `11.12.1` | `npm --version` |
| pnpm | `10.33.1` (matches Lattice's `packageManager` exactly) | `pnpm --version` |
| TypeScript | `6.0.3` (per `lattice/AGENTS.md` STACK row) | `lattice/AGENTS.md:32` |
| vitest | `4.1.5` | `lattice/AGENTS.md:106` |
| tsdown | `0.21.9` | `lattice/AGENTS.md:41` |
| canonicalize (RFC 8785 JCS) | `3.0.0` | `lattice/packages/lattice/package.json:43-46` |
| Lattice HEAD SHA at research time | `22bf98627ae86b1576db5d34cf447ab2b321b3e1` | `cd lattice && git rev-parse fsb-integration-experiments` |
| Lattice test count at research time | "451 tests" per ROADMAP (researcher did NOT execute `pnpm test` -- count is doc-authoritative, not live-verified for this research session) | `.planning/STATE.md:55` |

**Version verification:** No new package versions added in Phase 2. All required tooling already resolved by `lattice/pnpm-lock.yaml` per Phase 1's catalog-fix commit (`22bf986`). FSB's `package.json` adds nothing -- the smoke uses `await import('lattice')` against the existing symlink.

### Phase 1 carryforward facts (BINDING)

These are the empirical realities Phase 2 inherits from Phase 1 (verified at research time):

- `lattice/packages/lattice/src/index.ts:17` already re-exports `createReceipt` + `type CreateReceiptInput` (Phase 1 Plan 01-01).
- `lattice/packages/lattice/src/index.ts:11-16` already re-exports `createMemoryKeySet`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `verifyReceipt`.
- `lattice/packages/lattice/dist/` exists (rebuilt during Phase 1; `dist/index.js` is `107246 bytes`, `dist/index.d.ts` is `52786 bytes`).
- `package.json:81` already declares `"lattice": "file:./lattice/packages/lattice"`.
- `package.json:16` `scripts.test` chain ends with `node tests/agent-loop-empty-contents.test.js && node tests/lattice-smoke.test.js`.
- `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha: 22bf98627ae86b1576db5d34cf447ab2b321b3e1`; one Phase 1 row in the per-phase table.
- `lattice/docs/fsb-integration-gaps.md` has 91 lines; 6 domain headers; 21 severity-tagged rows; tail "How this doc gets used" paragraph names Phase 2 explicitly.
- `tests/lattice-smoke.test.js` is 175 lines; mints + verifies one v1 receipt (29 PASS / 0 FAIL).

### Lattice public surface state (full receipts inventory)

| Symbol | Exported from `lattice` | Source file | Phase 2 touches? |
|--------|------------------------|------------|-----------------|
| `createReceipt` | YES (Phase 1 added) | `receipts/receipt.ts:68` | YES -- adds 6 optional input fields |
| `CreateReceiptInput` (type) | YES (Phase 1 added) | `receipts/receipt.ts:32` | YES -- adds 6 optional fields |
| `verifyReceipt` | YES | `receipts/verify.ts:72` | YES -- updates `asReceiptBody` literal check |
| `createMemoryKeySet` | YES | `receipts/keyset.ts:18` | NO |
| `createInMemorySigner` | YES | `receipts/sign.ts:92` | NO |
| `generateEd25519KeyPairJwk` | YES | `receipts/sign.ts:56` | NO |
| `CapabilityReceiptBody` (type) | YES (re-exported via runtime/public-types.ts) | `receipts/types.ts:42` | YES -- adds version literal + 6 fields |
| `ReceiptEnvelope` (type) | YES | `receipts/types.ts:66` | NO |
| `ReceiptSigner` (type) | YES | `receipts/types.ts:72` | NO |
| `VerifyResult` (type) | YES | `receipts/types.ts:114` | NO -- shape unchanged |
| `VerifyError` (type) | YES | `receipts/types.ts:98` | NO |
| `VerifyErrorKind` (type) | YES | `receipts/types.ts:90` | NO -- `version-mismatch` still listed; semantics shift to "neither v1 nor v1.1" |
| `evaluateTripwires` | YES | `contract/tripwire.ts:53` | NO (D-06 sibling) |
| `TripwireEvidence` (type) | YES | `contract/tripwire.ts:25` | NO |
| `TripwireResult` (type) | YES | `contract/tripwire.ts:33` | NO |
| `TracerLike` (type) | YES | `tracing/tracing.ts:1` | NO -- HOOK_TIMEOUT uses `event(name, attrs)` slot |
| `RunEventKind` (type) | NOT exported (internal) | `tracing/tracing.ts:11` | NO (D-12) |
| `createHookPipeline` | NO (will be added by Phase 2) | `contract/bands.ts` (NEW) | YES |
| `HookLifecycleEvent` (type) | NO (will be added by Phase 2) | `contract/bands.ts` (NEW) | YES |
| `HookPipeline` (type) | NO (will be added by Phase 2) | `contract/bands.ts` (NEW) | YES |

## Architecture Patterns

### Receipt-body extension (exact diff for `types.ts`)

**Current state** (verified at `lattice/packages/lattice/src/receipts/types.ts:42-59`):

```typescript
export interface CapabilityReceiptBody {
  readonly version: "lattice-receipt/v1";
  readonly receiptId: string;
  readonly runId: string;
  readonly issuedAt: string;
  readonly kid: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: ReceiptUsageCanonical;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId: string;
  readonly redactions: readonly ReceiptRedaction[];
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
}
```

**Phase 2 target state:**

```typescript
export interface CapabilityReceiptBody {
  readonly version: "lattice-receipt/v1" | "lattice-receipt/v1.1";
  readonly receiptId: string;
  readonly runId: string;
  readonly issuedAt: string;
  readonly kid: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: ReceiptUsageCanonical;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId: string;
  readonly redactions: readonly ReceiptRedaction[];
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
  // Phase 2 v1.1 step-marker fields. All optional; populated by callers when
  // a step-transition emits a receipt. v1 receipts omit these entirely.
  // Step-marker fields are stable identifiers, not user content -- the
  // redaction manifest (redact.ts) intentionally does NOT touch them.
  readonly stepName?: string;
  readonly stepIndex?: number;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
}
```

**Diff scope:** One literal-union expansion on line 43; six new lines (62-67) with a documentation block. No reordering of existing fields. Total LOC delta: +8 lines (6 fields + 2 comment lines).

### Verifier extension (exact diff for `verify.ts`)

**Current state** (verified at `lattice/packages/lattice/src/receipts/verify.ts:36-52`):

```typescript
function asReceiptBody(value: unknown): CapabilityReceiptBody | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v.version !== "lattice-receipt/v1") return undefined;
  if (typeof v.receiptId !== "string") return undefined;
  // ... remaining field checks unchanged ...
  return v as unknown as CapabilityReceiptBody;
}
```

**Phase 2 target state:**

```typescript
function asReceiptBody(value: unknown): CapabilityReceiptBody | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  // v1.1 bump (Phase 2): accept BOTH v1 and v1.1 literals. Receipts whose
  // version is neither still fall through to the `version-mismatch` path
  // via the existing return-undefined contract (see verify.ts decision tree).
  if (v.version !== "lattice-receipt/v1" && v.version !== "lattice-receipt/v1.1") {
    return undefined;
  }
  if (typeof v.receiptId !== "string") return undefined;
  // ... remaining field checks unchanged ...
  return v as unknown as CapabilityReceiptBody;
}
```

**Diff scope:** One conditional becomes a two-literal disjunction. New step-marker fields are NOT structurally validated by `asReceiptBody` -- they are optional per the type definition, so a v1.1 body that happens to omit them is still well-formed. (If a future phase wants stricter v1.1 validation -- e.g., "v1.1 MUST have stepName" -- that's a downstream concern; v1.1 by Phase 2 contract is "optional fields present.") Total LOC delta: ~3 lines (one if-statement expansion + comment).

### `createReceipt` input + body assembly extension (exact diff for `receipt.ts`)

**Current `CreateReceiptInput`** (verified at `receipt.ts:32-46`):

```typescript
export interface CreateReceiptInput {
  readonly runId: string;
  readonly issuedAt?: string;
  readonly receiptId?: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: Usage;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId?: string;
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
}
```

**Phase 2 target state:**

```typescript
export interface CreateReceiptInput {
  readonly runId: string;
  readonly issuedAt?: string;
  readonly receiptId?: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: Usage;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId?: string;
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
  // Phase 2 v1.1 step-marker fields. When ANY of these is provided, the
  // emitted receipt body's `version` is bumped to "lattice-receipt/v1.1";
  // when ALL are absent, the body's `version` stays "lattice-receipt/v1"
  // for backward compatibility with v1 verifiers.
  readonly stepName?: string;
  readonly stepIndex?: number;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
}
```

**Current `createReceipt` body assembly** (verified at `receipt.ts:78-99`):

```typescript
const body0: CapabilityReceiptBody = {
  version: "lattice-receipt/v1",
  receiptId,
  runId: input.runId,
  // ... other fields ...
  ...(input.noRouteReasons !== undefined
    ? { noRouteReasons: input.noRouteReasons }
    : {}),
  ...(input.tripwireEvidence !== undefined
    ? { tripwireEvidence: input.tripwireEvidence }
    : {}),
};
```

**Phase 2 target state:**

```typescript
// Determine version literal: v1.1 if ANY step-marker field is provided,
// otherwise v1 (backward compat with Phase 1 callers).
const hasStepMarker =
  input.stepName !== undefined ||
  input.stepIndex !== undefined ||
  input.parentStepName !== undefined ||
  input.previousStepName !== undefined ||
  input.sessionId !== undefined ||
  input.timestamp !== undefined;
const version: "lattice-receipt/v1" | "lattice-receipt/v1.1" = hasStepMarker
  ? "lattice-receipt/v1.1"
  : "lattice-receipt/v1";

const body0: CapabilityReceiptBody = {
  version,
  receiptId,
  runId: input.runId,
  // ... other fields unchanged ...
  ...(input.noRouteReasons !== undefined
    ? { noRouteReasons: input.noRouteReasons }
    : {}),
  ...(input.tripwireEvidence !== undefined
    ? { tripwireEvidence: input.tripwireEvidence }
    : {}),
  // v1.1 step-marker fields (conditional-spread to honor exactOptionalPropertyTypes)
  ...(input.stepName !== undefined ? { stepName: input.stepName } : {}),
  ...(input.stepIndex !== undefined ? { stepIndex: input.stepIndex } : {}),
  ...(input.parentStepName !== undefined ? { parentStepName: input.parentStepName } : {}),
  ...(input.previousStepName !== undefined ? { previousStepName: input.previousStepName } : {}),
  ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
  ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
};
```

**Diff scope:** ~10 LOC added (hasStepMarker boolean derivation + version literal + 6 conditional-spread lines). The version-bump heuristic ("any step-marker field -> v1.1") is the CRITICAL choice -- it gives v1 callers backward-compatibility without forcing them to pick a version explicitly. Phase 1's smoke (which omits all step-marker fields) continues to emit `"lattice-receipt/v1"` receipts unchanged. Phase 2's smoke (which populates step-marker fields) emits `"lattice-receipt/v1.1"`. The verifier accepts both.

**Alternative considered:** Force callers to explicitly pass `version: "v1" | "v1.1"`. **Rejected.** Existing callers (Phase 1 smoke) would all need to add a `version: "v1"` line -- breaking change. The heuristic approach is additive-only.

### Bands pipeline (exact public API surface for `bands.ts`)

**Proposed signatures:**

```typescript
// lattice/packages/lattice/src/contract/bands.ts

import type { TracerLike } from "../tracing/tracing.js";

/**
 * Hook lifecycle event vocabulary -- separate from RunEventKind.
 *
 * Per Phase 2 CONTEXT.md D-12: this union is intentionally NOT merged into
 * tracing's RunEventKind. Run events ("run.start", "provider.attempt", ...)
 * describe Lattice's runtime stages; lifecycle events describe pluggable
 * hook attach-points around provider + tool boundaries. They are different
 * vocabularies on purpose.
 *
 * Phase 3 will likely add observability event kinds (e.g., "STEP_TRANSITION")
 * either to this union or to a sibling, depending on how that phase scopes
 * the boundary. Phase 2 ships only these four.
 */
export type HookLifecycleEvent =
  | "BEFORE_PROVIDER"
  | "AFTER_PROVIDER"
  | "BEFORE_TOOL"
  | "AFTER_TOOL";

/**
 * Priority bands for hook ordering. Lower number = higher priority (runs first).
 *
 * SAFETY (0)        -- safety / breaker hooks; cannot be overridden by lower bands
 * OBSERVABILITY (1) -- logging, metrics, audit; runs after safety, before extension
 * EXTENSION (2)     -- user-supplied hooks; runs last
 *
 * Within a band, handlers run in registration order.
 */
export const BAND = {
  SAFETY: 0,
  OBSERVABILITY: 1,
  EXTENSION: 2,
} as const;

export type Band = typeof BAND[keyof typeof BAND];

/**
 * Handler input -- frozen snapshot of the caller's context.
 *
 * structuredClone-then-Object.freeze: handlers receive a deep-cloned,
 * surface-frozen view. Mutations on the handler side do NOT leak back to
 * the calling site (D-10).
 *
 * The handler's return value is currently ignored; future revisions may
 * add a typed return that downstream bands consume (matches attempt-1's
 * {updatedInput, updatedToolOutput} shape -- deferred).
 */
export interface HookHandler<TContext = unknown> {
  (context: Readonly<TContext>): void | Promise<void>;
}

export interface RegisterOptions {
  readonly band: Band;
  readonly matcher?: RegExp;
  readonly budgetMs?: number;
}

/**
 * The HookPipeline interface returned by createHookPipeline().
 *
 * IMMUTABILITY: once freeze() is called, register() throws an Error whose
 * .name === "PIPELINE_FROZEN". freeze() is irreversible by design --
 * protects against late-binding hook injection mid-session.
 */
export interface HookPipeline {
  readonly kind: "hook-pipeline";
  /**
   * Register a handler on a lifecycle event.
   *
   * @throws Error (name === "PIPELINE_FROZEN") when called after freeze().
   */
  register<TContext = unknown>(
    event: HookLifecycleEvent,
    handler: HookHandler<TContext>,
    options: RegisterOptions,
  ): void;
  /**
   * Freeze the pipeline against further registration. Idempotent.
   * Subsequent register() calls throw PIPELINE_FROZEN.
   */
  freeze(): void;
  /**
   * Check whether freeze() has been called.
   */
  readonly isFrozen: () => boolean;
  /**
   * Fire all registered handlers for the given event with the given context.
   *
   * Ordering: by band (SAFETY -> OBSERVABILITY -> EXTENSION), then by
   * registration order within band. Each handler receives a frozen
   * structuredClone of `context`. Handlers run sequentially per band;
   * within a band, sequentially per registration order.
   *
   * Race-with-log: each handler is wrapped in a Promise.race against a
   * budget timer (default 100ms, overridable via RegisterOptions.budgetMs).
   * If the budget timer wins, a HOOK_TIMEOUT event is emitted via the
   * tracer interface (if provided to createHookPipeline) with payload
   * {event, band, budgetMs, sessionId, handlerIndex, elapsedMs}. The handler
   * keeps running in the background; the pipeline continues to the next
   * handler.
   *
   * Handler throws: caught silently (matches attempt-1 default).
   *
   * The promise resolves once all handlers have completed (or their budget
   * timers fired). The promise NEVER rejects -- handler errors are absorbed.
   */
  run<TContext = unknown>(
    event: HookLifecycleEvent,
    context: TContext,
  ): Promise<void>;
}

export interface CreateHookPipelineOptions {
  /**
   * Tracer for emitting HOOK_TIMEOUT events. When undefined, timeout
   * events are silently discarded (handler still doesn't block).
   */
  readonly tracer?: TracerLike;
  /**
   * Session identifier, included in HOOK_TIMEOUT event payload. Optional.
   */
  readonly sessionId?: string;
  /**
   * Override the default 100ms per-handler budget. Per-handler budgetMs
   * still wins over this default.
   */
  readonly defaultBudgetMs?: number;
}

export const HOOK_DEFAULT_BUDGET_MS = 100;
export const PIPELINE_FROZEN_ERROR_NAME = "PIPELINE_FROZEN";
export const HOOK_TIMEOUT_EVENT_NAME = "HOOK_TIMEOUT";

/**
 * Factory: build a fresh hook pipeline.
 *
 * Internally, handlers are stored band-partitioned: a Map<HookLifecycleEvent,
 * { [band: number]: HandlerRecord[] }>. Registration places into the right
 * (event, band) slot. run() iterates BAND_ORDER, then the band's array.
 */
export function createHookPipeline(
  options?: CreateHookPipelineOptions,
): HookPipeline {
  // ... implementation ...
}
```

**Implementation hints (not API but planner-relevant):**

- **Internal handler record shape:** `interface HandlerRecord { readonly handler: HookHandler; readonly matcher?: RegExp; readonly budgetMs: number; readonly bandIndex: number; }`
- **Frozen-context helper:** `function freezeContext<T>(ctx: T): Readonly<T> { return Object.freeze(structuredClone(ctx)); }` (matches `sessions/session.ts:200` pattern; falls back to value-as-is if structuredClone throws).
- **HOOK_TIMEOUT emission:** `tracer.event?.(HOOK_TIMEOUT_EVENT_NAME, { event, band, budgetMs, ...(sessionId !== undefined ? { sessionId } : {}), handlerIndex, elapsedMs })` -- conditional-spread for sessionId to honor `exactOptionalPropertyTypes`.
- **Matcher application:** Per-handler regex tested against `event` string. When `matcher` is `undefined`, handler always runs. When `matcher.test(event) === false`, handler is SKIPPED (no invocation, no budget, no timeout event).

### Public-surface re-export (exact diff for `index.ts`)

**Current state** (verified at `lattice/packages/lattice/src/index.ts:1-39`):

```typescript
export { artifact } from "./artifacts/artifact.js";
export { contract } from "./contract/contract.js";
export { inv } from "./contract/invariants.js";
export { defaultPiiDetectors } from "./contract/pii-detectors.js";
export {
  estimateRouteCost,
  evaluateContractAgainstRoute,
} from "./contract/preflight.js";
export { evaluateTripwires } from "./contract/tripwire.js";
// ... rest unchanged ...
```

**Phase 2 target state:**

```typescript
export { artifact } from "./artifacts/artifact.js";
export { createHookPipeline, type HookPipeline, type HookLifecycleEvent } from "./contract/bands.js";
export { contract } from "./contract/contract.js";
export { inv } from "./contract/invariants.js";
export { defaultPiiDetectors } from "./contract/pii-detectors.js";
export {
  estimateRouteCost,
  evaluateContractAgainstRoute,
} from "./contract/preflight.js";
export { evaluateTripwires } from "./contract/tripwire.js";
// ... rest unchanged ...
```

**Diff scope:** ONE new line inserted alphabetically between `artifact` and `contract` exports. Type re-exports use TypeScript 6's `type` modifier inside the export-list (consistent with line 17's `export { createReceipt, type CreateReceiptInput }` pattern).

**Alternative location:** The planner MAY consolidate the type re-exports into `runtime/public-types.ts` instead of `index.ts` (which is where `CapabilityReceiptBody` and other types currently live -- `index.ts:42-116` block). Either is acceptable per CD-03. Recommendation: put `createHookPipeline` (value) in `index.ts`; put `HookPipeline` (type) and `HookLifecycleEvent` (type) wherever the bulk type re-exports live (matches existing convention: `CapabilityReceiptBody` is in the `runtime/public-types.ts` re-export aggregate).

### Lattice test pattern (vitest convention for `bands.test.ts`)

**Verified against:** `lattice/packages/lattice/src/contract/tripwire.test.ts` (full read), `lattice/packages/lattice/src/receipts/redact.test.ts` (full read), `lattice/packages/lattice/src/receipts/canonical.test.ts` (full read), `lattice/packages/lattice/src/receipts/receipt.test.ts` (full read).

**Pattern:**

```typescript
import { describe, expect, it, beforeEach } from "vitest";

import {
  createHookPipeline,
  BAND,
  HOOK_DEFAULT_BUDGET_MS,
  PIPELINE_FROZEN_ERROR_NAME,
  HOOK_TIMEOUT_EVENT_NAME,
  type HookLifecycleEvent,
} from "./bands.js";
import type { TracerLike } from "../tracing/tracing.js";

function recordingTracer(): {
  readonly tracer: TracerLike;
  readonly events: Array<{ name: string; attributes?: Record<string, unknown> }>;
} {
  const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
  const tracer: TracerLike = {
    kind: "tracer",
    event(name, attributes) {
      events.push({ name, ...(attributes !== undefined ? { attributes } : {}) });
    },
  };
  return { tracer, events };
}

describe("createHookPipeline -- factory + identity", () => {
  it("returns a HookPipeline with kind === 'hook-pipeline'", () => {
    const pipe = createHookPipeline();
    expect(pipe.kind).toBe("hook-pipeline");
  });

  it("starts unfrozen", () => {
    const pipe = createHookPipeline();
    expect(pipe.isFrozen()).toBe(false);
  });
});

describe("HookPipeline -- band ordering", () => {
  it("invokes SAFETY before OBSERVABILITY before EXTENSION", async () => {
    const pipe = createHookPipeline();
    const order: string[] = [];
    pipe.register("BEFORE_TOOL", () => { order.push("extension"); }, { band: BAND.EXTENSION });
    pipe.register("BEFORE_TOOL", () => { order.push("safety"); }, { band: BAND.SAFETY });
    pipe.register("BEFORE_TOOL", () => { order.push("observability"); }, { band: BAND.OBSERVABILITY });
    await pipe.run("BEFORE_TOOL", { tool: "stub" });
    expect(order).toEqual(["safety", "observability", "extension"]);
  });

  it("preserves registration order within a band", async () => {
    const pipe = createHookPipeline();
    const order: number[] = [];
    pipe.register("BEFORE_TOOL", () => { order.push(1); }, { band: BAND.EXTENSION });
    pipe.register("BEFORE_TOOL", () => { order.push(2); }, { band: BAND.EXTENSION });
    pipe.register("BEFORE_TOOL", () => { order.push(3); }, { band: BAND.EXTENSION });
    await pipe.run("BEFORE_TOOL", {});
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("HookPipeline -- matcher regex", () => {
  it("invokes handler when matcher regex matches event name", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("BEFORE_TOOL", () => { calls++; }, {
      band: BAND.EXTENSION,
      matcher: /^BEFORE_/,
    });
    await pipe.run("BEFORE_TOOL", {});
    expect(calls).toBe(1);
  });

  it("does NOT invoke handler when matcher rejects event name", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("AFTER_TOOL", () => { calls++; }, {
      band: BAND.EXTENSION,
      matcher: /^BEFORE_/,
    });
    await pipe.run("AFTER_TOOL", {});
    expect(calls).toBe(0);
  });

  it("invokes handler unconditionally when no matcher provided", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("AFTER_PROVIDER", () => { calls++; }, { band: BAND.EXTENSION });
    await pipe.run("AFTER_PROVIDER", {});
    expect(calls).toBe(1);
  });
});

describe("HookPipeline -- race-with-log budget", () => {
  it("emits HOOK_TIMEOUT when handler exceeds budget", async () => {
    const { tracer, events } = recordingTracer();
    const pipe = createHookPipeline({ tracer, sessionId: "sess-1" });
    pipe.register(
      "BEFORE_TOOL",
      async () => {
        await new Promise((r) => setTimeout(r, 200));
      },
      { band: BAND.EXTENSION, budgetMs: 50 },
    );
    await pipe.run("BEFORE_TOOL", {});
    const timeoutEvents = events.filter((e) => e.name === HOOK_TIMEOUT_EVENT_NAME);
    expect(timeoutEvents.length).toBe(1);
    const attrs = timeoutEvents[0]?.attributes ?? {};
    expect(attrs.event).toBe("BEFORE_TOOL");
    expect(attrs.band).toBe(BAND.EXTENSION);
    expect(attrs.budgetMs).toBe(50);
    expect(attrs.sessionId).toBe("sess-1");
    expect(typeof attrs.handlerIndex).toBe("number");
    expect(typeof attrs.elapsedMs).toBe("number");
  });

  it("does NOT emit HOOK_TIMEOUT when handler completes within budget", async () => {
    const { tracer, events } = recordingTracer();
    const pipe = createHookPipeline({ tracer });
    pipe.register("BEFORE_TOOL", () => { /* sync, fast */ }, {
      band: BAND.EXTENSION,
      budgetMs: 100,
    });
    await pipe.run("BEFORE_TOOL", {});
    expect(events.filter((e) => e.name === HOOK_TIMEOUT_EVENT_NAME).length).toBe(0);
  });

  it("default budget is HOOK_DEFAULT_BUDGET_MS (100ms)", () => {
    expect(HOOK_DEFAULT_BUDGET_MS).toBe(100);
  });

  it("continues to next handler after a timeout (no rejection)", async () => {
    const { tracer } = recordingTracer();
    const pipe = createHookPipeline({ tracer });
    let secondHandlerCalled = false;
    pipe.register("BEFORE_TOOL", async () => {
      await new Promise((r) => setTimeout(r, 200));
    }, { band: BAND.EXTENSION, budgetMs: 50 });
    pipe.register("BEFORE_TOOL", () => { secondHandlerCalled = true; }, { band: BAND.EXTENSION });
    await expect(pipe.run("BEFORE_TOOL", {})).resolves.toBeUndefined();
    expect(secondHandlerCalled).toBe(true);
  });
});

describe("HookPipeline -- frozen context", () => {
  it("freezes the context passed to handlers", async () => {
    const pipe = createHookPipeline();
    let observed: unknown;
    pipe.register("BEFORE_TOOL", (ctx) => { observed = ctx; }, { band: BAND.EXTENSION });
    const original = { tool: "click", payload: { selector: "#btn" } };
    await pipe.run("BEFORE_TOOL", original);
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it("handler mutation does NOT leak to the caller's context", async () => {
    const pipe = createHookPipeline();
    pipe.register("BEFORE_TOOL", (ctx: Readonly<{ counter: number }>) => {
      // The frozen surface means assignment silently fails (sloppy) or
      // throws (strict). bands.ts handlers run in module-strict mode.
      try { (ctx as { counter: number }).counter = 99; } catch { /* expected */ }
    }, { band: BAND.EXTENSION });
    const original = { counter: 0 };
    await pipe.run("BEFORE_TOOL", original);
    expect(original.counter).toBe(0);
  });
});

describe("HookPipeline -- freeze() semantics", () => {
  it("freeze() flips isFrozen() to true", () => {
    const pipe = createHookPipeline();
    pipe.freeze();
    expect(pipe.isFrozen()).toBe(true);
  });

  it("freeze() is idempotent", () => {
    const pipe = createHookPipeline();
    pipe.freeze();
    expect(() => pipe.freeze()).not.toThrow();
  });

  it("register() throws PIPELINE_FROZEN after freeze()", () => {
    const pipe = createHookPipeline();
    pipe.freeze();
    expect(() => pipe.register("BEFORE_TOOL", () => {}, { band: BAND.EXTENSION })).toThrowError();
    try {
      pipe.register("BEFORE_TOOL", () => {}, { band: BAND.EXTENSION });
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      if (error instanceof Error) {
        expect(error.name).toBe(PIPELINE_FROZEN_ERROR_NAME);
      }
    }
  });

  it("run() still works after freeze() (only register is blocked)", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("BEFORE_TOOL", () => { calls++; }, { band: BAND.EXTENSION });
    pipe.freeze();
    await pipe.run("BEFORE_TOOL", {});
    expect(calls).toBe(1);
  });
});

describe("HookPipeline -- lifecycle event union", () => {
  it("accepts all four lifecycle events", async () => {
    const pipe = createHookPipeline();
    const events: HookLifecycleEvent[] = ["BEFORE_PROVIDER", "AFTER_PROVIDER", "BEFORE_TOOL", "AFTER_TOOL"];
    for (const ev of events) {
      pipe.register(ev, () => {}, { band: BAND.EXTENSION });
      await expect(pipe.run(ev, {})).resolves.toBeUndefined();
    }
  });
});
```

**Coverage target:** ~20 test cases (factory identity 2 + band ordering 2 + matcher 3 + race-with-log 4 + frozen context 2 + freeze 4 + lifecycle events 1 + edge cases 2). Roughly 250-300 LOC of test code -- matches the granularity of `tripwire.test.ts` (309 LOC) and `redact.test.ts` (160 LOC).

### FSB tripwire smoke pattern (mirrors `tests/lattice-smoke.test.js`)

**Verified against:** `tests/lattice-smoke.test.js` (full read, 175 lines). Uses `'use strict'` CJS + manual `passed/failed` counters + `await import('lattice')` + `process.exit(failed > 0 ? 1 : 0)`.

See "Code Examples -> FSB tripwire smoke test skeleton" below for the full file content.

### Anti-Patterns to Avoid

- **Modifying `lattice/packages/lattice/src/contract/tripwire.ts`.** D-06 mandates `bands.ts` is a SIBLING. `evaluateTripwires` stays pure. The 23 existing tripwire tests must remain green untouched.
- **Adding HOOK_TIMEOUT to `RunEventKind` in `tracing.ts`.** D-12 mandates the separate vocabulary. HOOK_TIMEOUT travels through `TracerLike.event(name, attributes)` as a free-form string event, not a typed RunEvent.
- **Bundling Lattice into the FSB extension during Phase 2.** Phase 1 Option B reconciliation is BINDING. No `extension/*` modification, no `manifest.json` change, no in-extension Lattice import. The smoke runs Node-side only.
- **Forcing v1 callers to pick a `version` explicitly.** The version-bump heuristic ("any step-marker field set -> v1.1") preserves Phase 1's smoke output byte-equivalently.
- **Touching the redaction manifest.** D-04 is explicit. The new fields are observability metadata, not user content. If a future caller wants to redact `stepName`, that's a downstream policy concern.
- **`AbortSignal.timeout()` for race-with-log.** CD-01 resolved: no-abort `Promise.race` is correct. The handler keeps running after timeout; vitest tests use real timers.
- **Two-interface discriminated-union shape.** CD-02 resolved: flat literal-union compiles cleanly. Two interfaces is the fallback; planner only switches if a future field forces it.
- **Pushing to Lattice's remote.** D-15 BINDING -- `git push` is FORBIDDEN. All Lattice commits stay local on `fsb-integration-experiments`.
- **`emit` / observability events from inside `evaluateTripwires`.** That function is pure (no I/O, no Date.now, no random per its docstring at `tripwire.ts:38-50`). Any I/O lives in `bands.ts` -- the side-effect-ful sibling.
- **Static-text greps as smoke proofs.** The FSB smoke MUST actually invoke the pipeline and assert call sequences. Phase 278 (commit 9a458184) demonstrated the failure mode: grepping source for "createHookPipeline" passes even if the pipeline never executes. (Memory: `feedback_real_runtime_tests_not_static_text.md`.)

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Capability Receipt minting | Custom FSB-side mint helper | `lattice.createReceipt` (Phase 1 already re-exported) | INV-06 + Lattice's 451-test mature surface |
| Ed25519 signer | Custom WebCrypto wrapper | `lattice.createInMemorySigner` + `lattice.generateEd25519KeyPairJwk` | Same |
| Receipt verifier | Custom verify routine | `lattice.verifyReceipt` | Typed `VerifyResult`, never throws across the verification boundary |
| In-memory keyset | Custom map | `lattice.createMemoryKeySet` | Already in Lattice's public surface |
| Receipt v1.1 backward-compat strategy | New top-level `extensions` envelope | Optional top-level fields + literal-union version bump (D-01, D-02) | One `types.ts` edit + one `verify.ts` literal expansion; no `canonical.ts` change; no `redact.ts` change |
| Hook pipeline with priority bands | Re-import attempt-1's `extension/ai/hook-pipeline.js` | NEW `lattice/packages/lattice/src/contract/bands.ts` | INV-06 -- primitives live in Lattice |
| Race-with-log timeout | `AbortSignal.timeout()` actual cancellation | `Promise.race([handler, budgetTimer])` no-abort (CD-01 resolved) | Matches attempt-1 pattern; simpler test ergonomics; CPU-leak risk explicitly accepted per D-09 |
| Frozen context | Reference-passing + caller-mutation policy | `structuredClone` + `Object.freeze` (D-10) | `structuredClone` is the documented pattern (`sessions/session.ts:200`); `Object.freeze` is in widespread use across `contract/invariants.ts` + `contract/contract.ts` |
| Mid-session-registration safety | Mutex / promise-based lock | Boolean flag set by `freeze()`; subsequent `register()` throws (D-11) | Trivial; idempotent; matches attempt-1 |
| Lifecycle event vocabulary | Merge into `RunEventKind` | Separate `HookLifecycleEvent` union (D-12) | Different vocabularies on purpose; Phase 3 can extend either independently |

**Key insight:** Phase 2 is a **primitive-extension** phase. Every piece of receipt + tripwire infrastructure already exists in Lattice; Phase 2 grows the surface. NOTHING hand-rolled FSB-side. The smoke is the substantive validation; the smoke USES Lattice's primitives.

## Common Pitfalls

### Pitfall 1: Verifier rejects Phase 1 v1 receipts after Phase 2 lands

**What goes wrong:** The Phase 1 `tests/lattice-smoke.test.js` mints a v1 receipt and asserts `result.body.version === "lattice-receipt/v1"`. If the planner accidentally CHANGES `createReceipt`'s default to always emit v1.1, Phase 1's smoke fails with a string-equality mismatch.

**Why it happens:** Misreading D-01 + D-02 as "all new receipts are v1.1." They are not -- D-02 explicitly says "v1 receipts continue to verify unchanged." The version-bump heuristic must be conditional ("any step-marker field set -> v1.1; else v1").

**How to avoid:** Implement the `hasStepMarker` boolean derivation in `createReceipt` before the body assembly (see "Architecture Patterns -> `createReceipt` input + body assembly extension"). Add a vitest case in `receipt.test.ts`: "v1 mint without step markers emits version === 'lattice-receipt/v1'".

**Warning signs:** `node tests/lattice-smoke.test.js` fails after Phase 2 lands with FAIL on the `verified body.version is lattice-receipt/v1` line.

### Pitfall 2: JCS canonicalization drifts when step-marker fields are added

**What goes wrong:** The planner assumes new fields require a `canonical.ts` change to keep the byte output stable.

**Why it happens:** `canonicalize@3.0.0` (RFC 8785) sorts top-level keys alphabetically. Adding optional fields between existing alphabetized fields is canonical-stable BY CONSTRUCTION -- the existing `canonical.test.ts:104-137` "sorts top-level keys alphabetically" test proves this. The bytes change only when the optional field is PRESENT; absent fields don't appear in the canonical form at all (canonicalize omits `undefined` values, NOT `null` -- verified at `canonical.test.ts:139-148`).

**How to avoid:** Do NOT modify `canonical.ts`. Add a vitest vector in `canonical.test.ts` (optional, planner discretion): canonicalize a v1.1 body with a single `stepName: "click"` field and assert the bytes contain `"stepName":"click"` in alphabetically-correct position (between `signatures` and `tripwireEvidence`).

**Warning signs:** `canonical.test.ts`'s 100-call byte-determinism test fails on the v1.1 body. (It will NOT fail if `canonical.ts` is untouched.)

### Pitfall 3: HOOK_TIMEOUT payload contains PII

**What goes wrong:** The handler timeout event's payload includes a `context` field that captures the full frozen context -- which could contain user-supplied tool arguments.

**Why it happens:** Misreading D-04 + D-09. The HOOK_TIMEOUT payload shape is fixed at `{event, band, budgetMs, sessionId, handlerIndex, elapsedMs}` -- ALL stable identifiers, NO user content. The context that was passed to the handler does NOT travel into the timeout event.

**How to avoid:** The `runHandlerWithBudget` implementation builds the payload from local variables only -- never serializes the context. Add a vitest case in `bands.test.ts`: "HOOK_TIMEOUT payload contains only stable identifiers" -- assert no key beyond the documented 6 appears.

**Warning signs:** A future caller observes user-supplied data in their tracer's HOOK_TIMEOUT event. (If `bands.ts` is implemented per the spec, this cannot happen.)

### Pitfall 4: `structuredClone` overhead on hot paths

**What goes wrong:** Every handler invocation does `structuredClone(ctx)` + `Object.freeze(...)`. For large contexts (e.g., a screenshot artifact), this is non-trivial CPU.

**Why it happens:** D-10 mandates frozen contexts. There's no escape hatch in Phase 2.

**How to avoid:** Acknowledge the cost; document it in the bands.ts header docstring; add a vitest benchmark case (optional, planner discretion) that clones a representative context shape and asserts the operation completes under ~5ms. Phase 2 does NOT need to optimize -- the 100ms budget swallows the clone cost for any reasonable context. A future phase can add a `{ skipClone: true }` opt-out if profiling demands it. (Out of scope for Phase 2.)

**Warning signs:** A user reports HOOK_TIMEOUT firing on handlers that complete promptly. Diagnosis: structuredClone of a 10MB context takes longer than 100ms.

**Mitigation in plan:** Phase 2 ships the documented contract. Optimization is deferred.

### Pitfall 5: `exactOptionalPropertyTypes` rejection of `field: undefined` literal

**What goes wrong:** Some test or callsite writes `stepName: undefined` explicitly. TS 6 rejects: "Type 'undefined' is not assignable to type 'string'" (verified empirically -- see CD-02 Resolution).

**Why it happens:** TS callers reaching for "set the field to undefined to be explicit." The pattern that's allowed is OMITTING the field entirely, not setting it to undefined.

**How to avoid:** Mirror `receipt.ts:93-98` exactly: `...(input.X !== undefined ? { X: input.X } : {})`. Every conditional-spread in the body assembly + every test fixture that conditionally populates fields uses this idiom. NEVER `{ stepName: someValueOrUndefined }` -- always conditional spread.

**Warning signs:** `cd lattice && pnpm typecheck` (which runs `tsc -p tsconfig.json --noEmit`) fails with TS2375 errors after Phase 2 changes land.

### Pitfall 6: Lifecycle event union vs `RunEventKind` collision

**What goes wrong:** Planner accidentally adds `BEFORE_PROVIDER` etc. to `tracing.ts:RunEventKind` instead of -- or in addition to -- `bands.ts:HookLifecycleEvent`.

**Why it happens:** Both are "event kinds." Easy confusion.

**How to avoid:** D-12 is BINDING: `HookLifecycleEvent` is a SEPARATE union in `bands.ts`. `RunEventKind` stays at its 16-value count (verified at `tracing.ts:11-27`). Phase 3 -- not Phase 2 -- decides whether step-transition events extend `RunEventKind` or `HookLifecycleEvent`.

**Warning signs:** `git diff lattice/packages/lattice/src/tracing/tracing.ts` is non-empty after Phase 2.

### Pitfall 7: Re-export order matters for tree-shaking

**What goes wrong:** Planner adds `createHookPipeline` re-export to the END of `index.ts` instead of alphabetically. Tree-shaking still works (tsdown is alphabetical-safe), but the diff is noisier and the convention is broken.

**How to avoid:** Insert the new export between `artifact` and `contract` alphabetically (`bands` sorts after `artifacts` and before `contract`). Match the convention at `index.ts:1-9`.

**Warning signs:** Code review nit; no functional impact.

### Pitfall 8: pnpm catalog drift between Phase 1 and Phase 2

**What goes wrong:** Developer re-runs `pnpm install` in `lattice/` and the catalog-fixed package.json + pnpm-lock.yaml regenerate with different concrete versions, breaking `file:` install from FSB's side.

**Why it happens:** Phase 1's commit `22bf986` resolved `catalog:` specifiers to concrete versions for npm consumers. If a developer later does something like `pnpm install --refresh-lockfile`, the lockfile might regenerate.

**How to avoid:** Phase 2 plan's setup task verifies `lattice/packages/lattice/package.json` still has concrete version literals (no `catalog:` strings) before running `pnpm test`. If catalog drift detected, the planner reapplies the Phase 1 fix or aborts.

**Warning signs:** `npm install` in FSB fails with `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "catalog:"`.

### Pitfall 9: vitest fake-timer ambiguity in race-with-log tests

**What goes wrong:** Planner uses `vi.useFakeTimers()` to "speed up" the 200ms wait in the timeout test. Promise.race + setTimeout + fake timers combine in surprising ways: the budgetTimer's setTimeout is captured, but the handler's setTimeout-based wait is also captured, and the race never resolves.

**How to avoid:** Use REAL timers for the race-with-log tests. The slow handler does `await new Promise(r => setTimeout(r, 200))`; the budget is `budgetMs: 50`; the test takes ~50ms wall-clock. No fake timers needed. (Verified by grepping Lattice src -- there are ZERO `vi.useFakeTimers` calls in the existing test suite.)

**Warning signs:** A `bands.test.ts` slow-handler test hangs forever or times out at vitest's default 5-second test timeout.

### Pitfall 10: TypeScript strictness on the `HookHandler` generic

**What goes wrong:** Planner writes `register("BEFORE_TOOL", (ctx) => { ... }, ...)` and TypeScript complains that `ctx`'s type is `unknown`.

**Why it happens:** The `HookHandler<TContext = unknown>` generic defaults to `unknown` -- handlers are responsible for narrowing.

**How to avoid:** Either explicitly parameterize (`pipe.register<{ tool: string }>("BEFORE_TOOL", (ctx) => { ctx.tool }, ...)`) or use the in-handler narrowing pattern (`(ctx: Readonly<{ tool: string }>) => { ... }`). The bands.test.ts test cases use the second pattern. Document in the JSDoc.

**Warning signs:** `pnpm typecheck` fails with "Property 'tool' does not exist on type 'unknown'" in test files.

## Code Examples

### FSB tripwire smoke test skeleton (`tests/lattice-tripwire-smoke.test.js`)

Verified pattern (mirrors `tests/lattice-smoke.test.js:1-175` exactly):

```javascript
'use strict';

/**
 * Phase 2 (v0.10.0-attempt-2) -- Lattice tripwire + receipt v1.1 smoke.
 *
 * Purpose: prove FSB consumes Phase 2's newly-shipped Lattice primitives
 * end-to-end via the existing file: dependency. Exercises:
 *   (1) Capability Receipt v1.1 mint with step-marker fields populated
 *   (2) Capability Receipt v1 mint without step markers (backward compat)
 *   (3) Tripwire band pipeline: 3-band ordering for one BEFORE_TOOL fire
 *   (4) Matcher regex: non-matching event does NOT invoke handler
 *   (5) pipeline.freeze() blocks subsequent register() with thrown error
 *   (6) Race-with-log: 50ms-budget handler that takes 200ms emits HOOK_TIMEOUT
 *
 * Coverage:
 *   - Phase 2 CONTEXT.md D-01 .. D-13 (all decisions exercised)
 *   - INV-06 (the primitives live in Lattice; FSB just consumes)
 *   - The FSB-side FINT-02 deliverable (D-18)
 *
 * Run: node tests/lattice-tripwire-smoke.test.js
 */

const assert = require('node:assert/strict');

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

(async () => {
  console.log('\n--- Lattice v1.1 + tripwire bands smoke ---');

  let lattice;
  try {
    lattice = await import('lattice');
  } catch (err) {
    console.error('  FAIL: dynamic import("lattice") threw:', err && err.message ? err.message : err);
    console.error('         Did you run `cd lattice && pnpm install && pnpm build` after Phase 2 commits?');
    process.exit(1);
  }

  // Surface presence checks for the NEW Phase 2 primitives.
  passAssertEqual(typeof lattice.createHookPipeline, 'function', 'lattice.createHookPipeline is a function (NEW in Phase 2)');
  // Re-confirm Phase 1 carryforward presence.
  passAssertEqual(typeof lattice.createReceipt, 'function', 'lattice.createReceipt still present (Phase 1 carryforward)');
  passAssertEqual(typeof lattice.verifyReceipt, 'function', 'lattice.verifyReceipt still present');

  if (failed > 0) {
    console.log('\nLattice tripwire smoke: surface presence check failed; aborting.');
    process.exit(1);
  }

  // ---- Part 1: v1.1 receipt round-trip with step-marker fields populated ----
  console.log('\n--- Part 1: v1.1 receipt mint + verify ---');

  const { privateKeyJwk: pk1, publicKeyJwk: vk1 } = await lattice.generateEd25519KeyPairJwk();
  const signer1 = lattice.createInMemorySigner(pk1, { kid: 'fsb-phase-2-smoke-key', publicKeyJwk: vk1 });

  const envelopeV11 = await lattice.createReceipt(
    {
      runId: 'fsb-phase-2-smoke-run-v11',
      model: { requested: 'fsb-smoke-stub-model', observed: null },
      route: { providerId: 'fsb-smoke', capabilityId: 'fsb-smoke/v11-round-trip', attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      contractVerdict: 'success',
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      // v1.1 step-marker fields -- presence triggers the version bump
      stepName: 'click-link',
      stepIndex: 3,
      sessionId: 'fsb-smoke-session-1',
      timestamp: '2026-05-24T18:00:00.000Z',
    },
    signer1
  );

  const keySet1 = lattice.createMemoryKeySet([
    { kid: 'fsb-phase-2-smoke-key', publicKeyJwk: vk1, state: 'active' }
  ]);
  const verifyV11 = await lattice.verifyReceipt(envelopeV11, keySet1);
  passAssertEqual(verifyV11.ok, true, 'v1.1 receipt verifies (ok=true)');
  if (verifyV11.ok === true) {
    passAssertEqual(verifyV11.body.version, 'lattice-receipt/v1.1', 'v1.1 body.version is "lattice-receipt/v1.1"');
    passAssertEqual(verifyV11.body.stepName, 'click-link', 'v1.1 body.stepName round-trips');
    passAssertEqual(verifyV11.body.stepIndex, 3, 'v1.1 body.stepIndex round-trips');
    passAssertEqual(verifyV11.body.sessionId, 'fsb-smoke-session-1', 'v1.1 body.sessionId round-trips');
    passAssertEqual(verifyV11.body.timestamp, '2026-05-24T18:00:00.000Z', 'v1.1 body.timestamp round-trips');
  }

  // ---- Part 2: v1 receipt round-trip (backward compat) ----
  console.log('\n--- Part 2: v1 receipt backward compat ---');

  const envelopeV1 = await lattice.createReceipt(
    {
      runId: 'fsb-phase-2-smoke-run-v1',
      model: { requested: 'fsb-smoke-stub-model', observed: null },
      route: { providerId: 'fsb-smoke', capabilityId: 'fsb-smoke/v1-round-trip', attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      contractVerdict: 'success',
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      // NO step-marker fields -- emits version === "lattice-receipt/v1"
    },
    signer1
  );
  const verifyV1 = await lattice.verifyReceipt(envelopeV1, keySet1);
  passAssertEqual(verifyV1.ok, true, 'v1 receipt still verifies (backward compat)');
  if (verifyV1.ok === true) {
    passAssertEqual(verifyV1.body.version, 'lattice-receipt/v1', 'v1 body.version stays "lattice-receipt/v1" when no step markers');
    passAssertEqual(verifyV1.body.stepName, undefined, 'v1 body has no stepName field');
  }

  // ---- Part 3: band pipeline ordering ----
  console.log('\n--- Part 3: band pipeline ordering ---');

  const pipe = lattice.createHookPipeline();
  const callOrder = [];
  pipe.register('BEFORE_TOOL', () => { callOrder.push('extension'); }, { band: 2 });    // EXTENSION
  pipe.register('BEFORE_TOOL', () => { callOrder.push('safety'); }, { band: 0 });        // SAFETY
  pipe.register('BEFORE_TOOL', () => { callOrder.push('observability'); }, { band: 1 }); // OBSERVABILITY
  await pipe.run('BEFORE_TOOL', { tool: 'click' });
  passAssertEqual(callOrder.length, 3, 'all 3 handlers invoked');
  passAssertEqual(callOrder[0], 'safety', 'SAFETY runs first');
  passAssertEqual(callOrder[1], 'observability', 'OBSERVABILITY runs second');
  passAssertEqual(callOrder[2], 'extension', 'EXTENSION runs last');

  // ---- Part 4: matcher regex ----
  console.log('\n--- Part 4: matcher regex ---');

  const pipe2 = lattice.createHookPipeline();
  let matchedCalls = 0;
  let unmatchedCalls = 0;
  pipe2.register('BEFORE_TOOL', () => { matchedCalls++; }, { band: 2, matcher: /^BEFORE_/ });
  pipe2.register('AFTER_TOOL', () => { unmatchedCalls++; }, { band: 2, matcher: /^BEFORE_/ });
  await pipe2.run('BEFORE_TOOL', {});
  await pipe2.run('AFTER_TOOL', {});
  passAssertEqual(matchedCalls, 1, 'matcher-matched handler invoked on BEFORE_TOOL');
  passAssertEqual(unmatchedCalls, 0, 'matcher-non-matched handler NOT invoked on AFTER_TOOL');

  // ---- Part 5: freeze() blocks register() ----
  console.log('\n--- Part 5: freeze() semantics ---');

  const pipe3 = lattice.createHookPipeline();
  pipe3.register('BEFORE_TOOL', () => {}, { band: 0 });
  pipe3.freeze();
  let threw = false;
  let threwName = null;
  try {
    pipe3.register('BEFORE_TOOL', () => {}, { band: 0 });
  } catch (err) {
    threw = true;
    threwName = err && err.name ? err.name : null;
  }
  passAssertEqual(threw, true, 'register() throws after freeze()');
  passAssertEqual(threwName, 'PIPELINE_FROZEN', 'thrown error.name === "PIPELINE_FROZEN"');

  // ---- Part 6: race-with-log (OPTIONAL; uses real timers) ----
  console.log('\n--- Part 6: race-with-log HOOK_TIMEOUT ---');

  const traceEvents = [];
  const tracer = {
    kind: 'tracer',
    event(name, attributes) { traceEvents.push({ name: name, attributes: attributes }); }
  };
  const pipe4 = lattice.createHookPipeline({ tracer: tracer, sessionId: 'fsb-smoke-budget' });
  pipe4.register('BEFORE_TOOL', async () => {
    await new Promise((r) => setTimeout(r, 200));
  }, { band: 2, budgetMs: 50 });
  await pipe4.run('BEFORE_TOOL', {});
  const timeoutEvents = traceEvents.filter((e) => e.name === 'HOOK_TIMEOUT');
  passAssertEqual(timeoutEvents.length, 1, 'HOOK_TIMEOUT emitted exactly once');
  if (timeoutEvents.length === 1) {
    const attrs = timeoutEvents[0].attributes;
    passAssertEqual(attrs && attrs.event, 'BEFORE_TOOL', 'HOOK_TIMEOUT payload.event === "BEFORE_TOOL"');
    passAssertEqual(attrs && attrs.budgetMs, 50, 'HOOK_TIMEOUT payload.budgetMs === 50');
    passAssertEqual(attrs && attrs.sessionId, 'fsb-smoke-budget', 'HOOK_TIMEOUT payload.sessionId round-trips');
  }

  console.log('\n--- Summary ---');
  console.log('passed:', passed);
  console.log('failed:', failed);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Tripwire smoke harness uncaught error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
```

**Approximate LOC:** ~160 lines (matches Phase 1 smoke's 175-line size). 6 part-sections (v1.1 mint + verify, v1 backward compat, band ordering, matcher, freeze, race-with-log). ~25-30 assertions total. Real-runtime: no static-text greps; every Phase 2 primitive is actually invoked.

### `package.json` `scripts.test` chain extension

**Current (verified at `package.json:16`):**

```json
"test": "node tests/test-overlay-state.js && ... && node tests/agent-loop-empty-contents.test.js && node tests/lattice-smoke.test.js"
```

**Target:**

```json
"test": "node tests/test-overlay-state.js && ... && node tests/agent-loop-empty-contents.test.js && node tests/lattice-smoke.test.js && node tests/lattice-tripwire-smoke.test.js"
```

**Diff scope:** ONE token appended after the existing terminal `&&`. The Phase 1 smoke (`tests/lattice-smoke.test.js`) stays byte-frozen at its original position.

### LATTICE-PIN.md update diff

**Current frontmatter:**

```yaml
---
current_lattice_sha: 22bf98627ae86b1576db5d34cf447ab2b321b3e1
current_branch: fsb-integration-experiments
last_updated: 2026-05-24
schema_version: 1
---
```

**Target (post-Phase-2):**

```yaml
---
current_lattice_sha: <NEW_SHA after all Phase 2 Lattice commits land>
current_branch: fsb-integration-experiments
last_updated: <Phase 2 completion date>
schema_version: 1
---
```

**Body table -- append ONE row after Phase 1:**

```markdown
| Phase 2   | <date>     | `<NEW_SHA>`                                  | `fsb-integration-experiments`   | (1) `packages/lattice/src/receipts/types.ts` -- bump CapabilityReceiptBody.version literal-union to "lattice-receipt/v1" | "lattice-receipt/v1.1"; add 6 optional step-marker fields. (2) `packages/lattice/src/receipts/verify.ts` -- asReceiptBody accepts both literals. (3) `packages/lattice/src/receipts/receipt.ts` -- CreateReceiptInput + body assembly extended with conditional spreads. (4) `packages/lattice/src/contract/bands.ts` (NEW) -- createHookPipeline + HookPipeline + HookLifecycleEvent. (5) `packages/lattice/src/contract/bands.test.ts` (NEW). (6) `packages/lattice/src/index.ts` -- re-exports for createHookPipeline / HookPipeline type / HookLifecycleEvent type. (7) `docs/fsb-integration-gaps.md` -- closed rows flipped to `Covered` with backlink SHAs. | Phase 2 = receipt v1.1 extension + tripwire band pipeline primitive. Lattice's 451-test vitest suite remains green plus ~25 new tests across receipts (~3) and bands (~22). FSB consumes via the existing file: dep. |
```

### `lattice/docs/fsb-integration-gaps.md` row-flip diff

**Current Receipts section (verified at `lattice/docs/fsb-integration-gaps.md:19-25`):**

```markdown
| Receipts | Capability Receipt mint + verify round-trip via Ed25519 (DSSE v1.0 envelope + JCS canonical form) | Covered | n/a | v1.1 ships this surface end-to-end; FSB's Phase 1 smoke proves the round-trip from a Node-side consumer. |
| Receipts | Step-transition fields on the receipt body (stepName, stepIndex, parentStepName, previousStepName, timestamp per FSB attempt-1 inspector envelope) | Needs extension | Blocker | FSB autopilot emits 12 step markers per iteration (attempt-1 02-state-inspectability-carve-out). Without these fields on the receipt body, every step-marker emission must carry the metadata out-of-band, defeating the "Lattice receipt is the inspector envelope" thesis (INV-06). Phase 2 candidate. |
| Receipts | sessionId field on the receipt body (FSB ties step markers to a persistent session across SW eviction) | Needs extension | Blocker | Phase 2 candidate. |
| Receipts | createReceipt is reachable via the public `lattice` bare specifier | Covered | n/a | Resolved in Phase 1 by re-exporting from `src/index.ts` (D-13 narrowed). |
```

**Phase 2 target -- flip 2 Blocker rows to Covered, append SHA backlink:**

```markdown
| Receipts | Step-transition fields on the receipt body (stepName, stepIndex, parentStepName, previousStepName, timestamp per FSB attempt-1 inspector envelope) | Covered | n/a | Phase 2 (FSB v0.10.0-attempt-2) added stepName, stepIndex, parentStepName, previousStepName, timestamp as optional top-level fields on CapabilityReceiptBody; version bumped via literal-union `"lattice-receipt/v1" | "lattice-receipt/v1.1"`. JCS round-trip unchanged. Redaction policy unchanged (step-marker fields are stable identifiers, not user content). Lattice commit `<SHA_FOR_RECEIPTS_COMMIT>`. |
| Receipts | sessionId field on the receipt body (FSB ties step markers to a persistent session across SW eviction) | Covered | n/a | Phase 2 (FSB v0.10.0-attempt-2) added sessionId as optional top-level field on CapabilityReceiptBody, same commit. Lattice commit `<SHA_FOR_RECEIPTS_COMMIT>`. |
```

**Current Tripwires/hooks section (verified at `lattice/docs/fsb-integration-gaps.md:30-36`):**

```markdown
| Tripwires/hooks | Pure tripwire evaluator over invariant set | Covered | n/a | v1.1 ships `evaluateTripwires` -- typed result, never throws. |
| Tripwires/hooks | Priority bands (SAFETY > OBSERVABILITY > EXTENSION) for hook ordering | Needs addition | Blocker | FSB attempt-1 Phase 1 (hooks-foundation) built this inside FSB. Per INV-06 this lives in Lattice. Phase 3 candidate. |
| Tripwires/hooks | Per-handler matcher regex + race-with-log budget so a slow handler cannot stall the safety band | Needs addition | Blocker | FSB attempt-1 pattern; required for autopilot reliability. Phase 3 candidate. |
| Tripwires/hooks | Frozen contexts (handler cannot mutate the band-set after registration window closes) | Needs addition | Important | Closes attempt-1 duplication. Phase 3 candidate. |
| Tripwires/hooks | Mid-session registration freeze | Needs addition | Important | Phase 3 candidate. |
```

(Note: the existing doc says "Phase 3 candidate" because at the time of Phase 1's audit-doc authoring the planner labeled tripwires as Phase 3. Phase 2 CONTEXT.md re-pulled this work forward into Phase 2 -- the doc-text "Phase 3 candidate" is now stale and gets overwritten on the row-flip.)

**Phase 2 target -- flip 4 Tripwires/hooks rows to Covered:**

```markdown
| Tripwires/hooks | Priority bands (SAFETY > OBSERVABILITY > EXTENSION) for hook ordering | Covered | n/a | Phase 2 (FSB v0.10.0-attempt-2) added `lattice/packages/lattice/src/contract/bands.ts` exporting createHookPipeline factory. Bands: SAFETY=0, OBSERVABILITY=1, EXTENSION=2. Lower number runs first; within-band registration order preserved. Lattice commit `<SHA_FOR_BANDS_COMMIT>`. |
| Tripwires/hooks | Per-handler matcher regex + race-with-log budget so a slow handler cannot stall the safety band | Covered | n/a | Phase 2 -- bands.ts RegisterOptions.matcher (optional per-handler regex) + RegisterOptions.budgetMs (default 100ms). Timeout emits HOOK_TIMEOUT event via TracerLike (no-abort `Promise.race`; CPU-leak risk explicitly accepted per CONTEXT.md D-09). Lattice commit `<SHA_FOR_BANDS_COMMIT>`. |
| Tripwires/hooks | Frozen contexts (handler cannot mutate the band-set after registration window closes) | Covered | n/a | Phase 2 -- bands.ts pipeline.run() wraps each handler's context in structuredClone + Object.freeze. Handler mutations do not leak. Lattice commit `<SHA_FOR_BANDS_COMMIT>`. |
| Tripwires/hooks | Mid-session registration freeze | Covered | n/a | Phase 2 -- bands.ts pipeline.freeze() is irreversible; subsequent register() throws Error(name === "PIPELINE_FROZEN"). Lattice commit `<SHA_FOR_BANDS_COMMIT>`. |
```

**Plus one NEW Tripwires/hooks row (lifecycle event union -- not in current audit-doc explicitly but shipping in bands.ts; planner adds):**

```markdown
| Tripwires/hooks | Typed lifecycle event union (BEFORE_PROVIDER, AFTER_PROVIDER, BEFORE_TOOL, AFTER_TOOL) separate from RunEventKind | Covered | n/a | Phase 2 -- bands.ts HookLifecycleEvent union. Separate vocabulary from tracing.ts RunEventKind by design (CONTEXT.md D-12). Phase 3 (observability) can extend either independently. Lattice commit `<SHA_FOR_BANDS_COMMIT>`. |
```

**Total audit-doc row updates:** 2 Receipts flips + 4 Tripwires/hooks flips + 1 Tripwires/hooks ADD = 7 row-level operations. Doc grows ~10-15 lines.

### `REQUIREMENTS.md` LSDK-02..LSDK-08 population (planner draft)

The REQUIREMENTS.md LSDK section currently has only LSDK-01 (audit) marked done. Phase 2 populates LSDK-02..LSDK-08 based on the audit-doc row-closure map:

```markdown
- [ ] **LSDK-02 (Receipt v1.1 step-marker fields):** `CapabilityReceiptBody` extended with optional `stepName?: string`, `stepIndex?: number`, `parentStepName?: string`, `previousStepName?: string`, `timestamp?: string`. Schema version literal becomes `"lattice-receipt/v1" | "lattice-receipt/v1.1"`. v1 receipts continue to verify unchanged.
- [ ] **LSDK-03 (Receipt v1.1 sessionId field):** `CapabilityReceiptBody.sessionId?: string` added.
- [ ] **LSDK-04 (Tripwire band pipeline -- priority bands):** `lattice/packages/lattice/src/contract/bands.ts` ships SAFETY > OBSERVABILITY > EXTENSION priority bands.
- [ ] **LSDK-05 (Tripwire band pipeline -- matcher + race-with-log):** RegisterOptions.matcher (per-handler regex) + RegisterOptions.budgetMs (default 100ms; HOOK_TIMEOUT event via TracerLike on timeout).
- [ ] **LSDK-06 (Tripwire band pipeline -- frozen context):** structuredClone + Object.freeze per handler.
- [ ] **LSDK-07 (Tripwire band pipeline -- mid-session registration freeze):** pipeline.freeze() irreversible; register() throws PIPELINE_FROZEN.
- [ ] **LSDK-08 (HookLifecycleEvent typed union):** BEFORE_PROVIDER | AFTER_PROVIDER | BEFORE_TOOL | AFTER_TOOL separate from RunEventKind.
```

Marked `[ ]` (pending). Planner flips each to `[x]` after the corresponding commit lands.

### Audit-Doc Row Closure Map (planner reference)

| Audit-doc row | Phase 2 REQ-ID | Phase 2 closure mechanism |
|---|---|---|
| Receipts row 2 (step-transition fields) | LSDK-02 | `types.ts` field additions + `receipt.ts` body assembly + `verify.ts` literal expansion |
| Receipts row 3 (sessionId) | LSDK-03 | Same commit as LSDK-02 (rolled into the Receipts commit) |
| Tripwires/hooks row 2 (priority bands) | LSDK-04 | `bands.ts` + `bands.test.ts` |
| Tripwires/hooks row 3 (matcher + race-with-log) | LSDK-05 | Same commit as LSDK-04 |
| Tripwires/hooks row 4 (frozen contexts) | LSDK-06 | Same commit as LSDK-04 |
| Tripwires/hooks row 5 (mid-session registration freeze) | LSDK-07 | Same commit as LSDK-04 |
| Tripwires/hooks NEW row (lifecycle event union) | LSDK-08 | Same commit as LSDK-04 |

**Commit count:** ~4-5 logical Lattice commits + ~3 FSB commits. Suggested grouping (planner refines):

| # | Repo | Type | Description | Commit footer |
|---|------|------|-------------|---------------|
| 1 | Lattice | feat(receipts) | extend CapabilityReceiptBody with step-marker fields + bump to v1.1 (types.ts + verify.ts + receipt.ts + receipt.test.ts) | `Ref: FSB v0.10.0-attempt-2 Phase 2` |
| 2 | Lattice | feat(contract) | add tripwire band pipeline primitive (bands.ts + bands.test.ts) | `Ref: FSB v0.10.0-attempt-2 Phase 2` |
| 3 | Lattice | feat(index) | re-export createHookPipeline + HookPipeline + HookLifecycleEvent from package surface (index.ts only; runtime/public-types.ts if applicable) | `Ref: FSB v0.10.0-attempt-2 Phase 2` |
| 4 | Lattice | docs(fsb-integration) | close Phase 2 audit rows (receipts + tripwires/hooks) | `Ref: FSB v0.10.0-attempt-2 Phase 2` |
| 5 | FSB | test(02) | add Lattice v1.1 + tripwire band real-runtime smoke (tests/lattice-tripwire-smoke.test.js + package.json scripts.test append) |  |
| 6 | FSB | docs(02) | bump .planning/LATTICE-PIN.md to new Lattice HEAD + populate REQUIREMENTS.md LSDK-02..LSDK-08 |  |
| 7 | FSB | docs(02) | (optional) phase completion artifacts |  |

## State of the Art

| Old approach (Phase 1 baseline) | Current approach (Phase 2 target) | When changed | Impact |
|--------------|------------------|--------------|--------|
| `CapabilityReceiptBody.version: "lattice-receipt/v1"` (single literal) | `CapabilityReceiptBody.version: "lattice-receipt/v1" | "lattice-receipt/v1.1"` (discriminated literal union) | Phase 2 land date | Verifier accepts both; v1 receipts continue to verify unchanged; v1.1 carries optional step-marker fields |
| No tripwire band pipeline; FSB-side attempt-1 `extension/ai/hook-pipeline.js` carried priority bands inside FSB | NEW Lattice module `bands.ts` exports `createHookPipeline()` factory; INV-06 satisfied | Phase 2 land date | FSB's attempt-1 HookPipeline can be retired in a future phase (Phase 3+) once FSB's autopilot loop adopts the Lattice band pipeline |
| HOOK_TIMEOUT events emitted via attempt-1's `automationLogger.warn(...)` | HOOK_TIMEOUT events emitted via Lattice's `TracerLike.event(...)` | Phase 2 | Lattice consumers see HOOK_TIMEOUT through their tracer; FSB's existing logger remains separate (no cross-coupling) |
| Receipt extensibility was an open question (extensions envelope vs version bump vs nested keys) | Resolved: literal-union version bump + optional top-level fields (D-01, D-02; researcher confirmed CD-02) | Phase 2 | Sets the precedent for future schema bumps; future v1.2 extends the same union if needed |
| Race-with-log was an open question (AbortSignal vs Promise.race) | Resolved: no-abort Promise.race (CD-01) | Phase 2 | Simpler test ergonomics; CPU-leak risk accepted; documented in D-09 + bands.ts header |

**Deprecated/outdated:**
- **FSB-side hook pipeline** (attempt-1 `extension/ai/hook-pipeline.js`) -- pre-pivot artifact preserved in the tree (verified: file present, 201 LOC at HEAD). NOT modified in Phase 2. May be retired in Phase 5+ once FSB's autopilot adopts the Lattice band pipeline. For now, both pipelines exist in parallel; only the Lattice pipeline is exercised by Phase 2's smoke.
- **D-06 / D-12 / D-13 / D-14 / D-15 / INV-06 -- unchanged** from Phase 1. Phase 2 inherits the same ceremony.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Lattice's 451-test count from STATE.md is current. (Researcher did not run `cd lattice && pnpm test` -- count is doc-authoritative.) | Lattice baseline versions | Low risk -- the absolute count doesn't matter for Phase 2 success; the contract is "no regressions" + "additive new tests." Planner verifies live count pre/post Phase 2 work. |
| A2 | `canonicalize@3.0.0` continues to alphabetically sort top-level keys in the way `canonical.test.ts:104-137` expects | Pitfall 2 + D-03 | Low risk -- the test would fail loudly if `canonicalize` regressed, and the v1.1 vector if added would also catch this. |
| A3 | Lattice's vitest `**/*.test.ts` glob picks up new `bands.test.ts` automatically without `vitest.config.ts` change | Lattice surfaces touched | Verified by reading `vitest.config.ts` -- the `exclude` block excludes `node_modules/`, `dist/`, `test-d/` only. New `src/contract/bands.test.ts` is included by default. |
| A4 | `structuredClone` is available in Node 24+ runtime without import (used directly by `sessions/session.ts:200` -- proven). | Pitfall 4 + D-10 | Low risk -- structuredClone is in the global namespace on Node 17+. |
| A5 | npm 11.12.1 + `file:` symlink resolves to Lattice's `dist/` after Phase 2's rebuild. Phase 1 verified this; assumes no clean re-clone between phases. | FSB tripwire smoke skeleton | Low risk -- mitigation is the `cd lattice && pnpm install && pnpm build` ceremony documented in PLAN's Setup task (carryforward from Phase 1). |
| A6 | TypeScript 6.0.3 (Lattice's pinned TS version) treats `if (v.version !== "lattice-receipt/v1" && v.version !== "lattice-receipt/v1.1") return undefined;` as a correct narrow into the literal-union -- verified by reading `verify.ts:39` and applying TS 6's narrowing rules. | Verifier extension diff | Low risk -- this is standard discriminated-union narrowing. |
| A7 | The audit-doc row-flip text I propose accurately reflects what Phase 2 ships. Planner refines wording during execute-phase if Phase 2 ships marginally differently. | Audit-doc row-flip diff | Low risk -- the row text is a doc artifact, not a runtime contract. |
| A8 | The 7-REQ-ID count for LSDK-02..LSDK-08 is reasonable; D-17 + CD-05 leave this to the planner. If the planner consolidates further (e.g., LSDK-04 covers ALL of priority bands + matcher + budget + freeze under one REQ), the count drops to ~4-5. If the planner sub-divides (LSDK-04.1, LSDK-04.2, ...), the count rises. | LSDK-02..LSDK-08 population | Low risk -- REQ-ID granularity is a doc artifact, not a runtime contract. |

**If this table looks short:** It is -- most claims in this research are `[VERIFIED]` against real Lattice source files read in this session. The `[ASSUMED]` set is small because the question "what's in Lattice today + what's the exact shape we add" is empirically answerable by file inspection.

## Open Questions

1. **Whether to consolidate the type re-export in `index.ts` or `runtime/public-types.ts`.**
   - What we know: `CapabilityReceiptBody` and other types are re-exported via `index.ts:42-116` block which imports from `./runtime/public-types.js`. `runtime/public-types.ts:104` already re-exports `CapabilityReceiptBody` from `../receipts/types.js`.
   - What's unclear: Does Lattice's convention put NEW types in `index.ts` directly or in `runtime/public-types.ts`?
   - Recommendation: Match the existing pattern -- put the VALUE re-export (`createHookPipeline`) alphabetically in `index.ts`'s value-export block; put TYPE re-exports (`HookPipeline`, `HookLifecycleEvent`) in `runtime/public-types.ts` if the planner sees that as the convention, OR keep them inline in `index.ts` with a `type` modifier. Either works. Planner picks during execute-phase.

2. **Whether to extend `redactReceiptBody` for v1.1 redactions[] array path-prefix awareness.**
   - What we know: D-04 is BINDING -- step-marker fields stay out of the redaction manifest. `redact.ts:51-56` only adds an entry for `tripwireEvidence.observed`.
   - What's unclear: Future v1.2 callers may want to redact `stepName` if it ends up containing PII (e.g., a user's email leaked into a step name). Phase 2 doesn't have to address this; just document the assumption.
   - Recommendation: Phase 2 ships with the documented contract: "callers populate step-marker fields with stable identifiers, NOT free-form user input." Document in `bands.ts` header + Phase 2 SUMMARY. If a future caller violates the contract, that's a downstream policy fix.

3. **Whether to provide a typed `HOOK_TIMEOUT` event kind in addition to the string literal.**
   - What we know: HOOK_TIMEOUT travels through `TracerLike.event(name: string, attributes?: Record<string, unknown>)` -- name is a plain string.
   - What's unclear: Phase 3 (observability) may introduce a typed `HookTracerEvent` union including `HOOK_TIMEOUT`. Phase 2 prefigures this by exporting `HOOK_TIMEOUT_EVENT_NAME` as a constant.
   - Recommendation: Export the string constant; defer the typed union to Phase 3. The constant gives callers a documented identifier without forcing a new union type into Phase 2.

4. **Whether `bands.run()` should return a typed result.**
   - What we know: Current proposed signature returns `Promise<void>`. Handlers cannot mutate the caller's context (frozen), so there's no "updated context" to return.
   - What's unclear: Attempt-1's `emit()` returned `{stopped, results, stoppedBy, updatedContext}` -- richer signal.
   - Recommendation: Phase 2 ships `Promise<void>`. If a future phase (Phase 3? Phase 5?) needs to surface handler results (e.g., a SAFETY handler vetoing the operation), it adds a typed return. Phase 2 keeps the API minimal.

5. **Whether Phase 2 smoke should exercise all 4 lifecycle events or just BEFORE_TOOL.**
   - What we know: All four event names are part of the union; bands.test.ts exercises all four (see test pattern above).
   - What's unclear: Phase 2's FSB-side smoke focuses on BEFORE_TOOL for compactness. Is one event enough as proof?
   - Recommendation: One event is sufficient for the FSB-side smoke -- the goal is "FSB consumes the primitive end-to-end," not "FSB stress-tests every event kind." Lattice's bands.test.ts covers the four-event matrix internally. Phase 2 smoke stays compact.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | FSB smoke + Lattice runtime | yes | 25.9.0 (floor: `>=24` per Lattice's `engines.node`) | -- |
| npm | FSB dep wiring (already wired in Phase 1) | yes | 11.12.1 | -- |
| pnpm | Lattice build / test | yes | 10.33.1 (matches Lattice's `packageManager` exactly) | `corepack enable && corepack prepare pnpm@10.33.1 --activate` |
| Chrome (browser) | NOT REQUIRED for Phase 2 -- no in-extension load | n/a | -- | -- |
| tsdown | Lattice build | yes (via Lattice devDependencies; resolved by `pnpm install`) | 0.21.9 | -- |
| vitest | Lattice tests | yes (via Lattice devDependencies) | 4.1.5 | -- |
| Lattice's `dist/` build output | FSB `import 'lattice'` resolution | yes (Phase 1 already built it) | regenerated per Phase 2 commit | Run `pnpm install && pnpm build` in `lattice/` after Phase 2's source changes land |
| Git access to `lattice/` on `fsb-integration-experiments` branch | Lattice-side commits | yes -- branch HEAD `22bf986` ready for new commits | `[VERIFIED]` | -- |
| `canonicalize@3.0.0` | JCS canonical form for v1.1 receipts | yes (Lattice prod dep) | 3.0.0 (locked via concrete version after Phase 1 catalog-fix) | -- |
| `@noble/ed25519@3.1.0` | Lattice's Ed25519 parity oracle (used in `sign.test.ts`) | yes (Lattice devDep) | 3.1.0 | -- |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None blocking.

**Phase 2 environment setup ceremony:**

```bash
# Pre-flight (idempotent; same as Phase 1):
cd lattice
pnpm install      # resolves lattice/packages/lattice/node_modules + workspace catalogs
pnpm build        # tsdown produces dist/index.js + dist/index.d.ts
                  # Build MUST be re-run after each Phase 2 Lattice source change
                  # so FSB's symlinked node_modules/lattice picks up the changes
cd ..

# FSB smoke after Lattice rebuild:
node tests/lattice-tripwire-smoke.test.js
# OR full chain:
npm test
```

## Validation Architecture

> `.planning/config.json` does NOT set `workflow.nyquist_validation`. Per the spec, absence = enabled. Including this section.

### Test Framework

**Lattice side (TypeScript / vitest):**

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (per `lattice/AGENTS.md:106` + `package.json:23` `"test": "vitest run"`) |
| Config file | `lattice/packages/lattice/vitest.config.ts` (verified: glob `**/*.test.ts`, excludes `node_modules/`, `dist/`, `test-d/`, environment `node`) |
| Quick run command (single file) | `cd lattice && pnpm exec vitest run packages/lattice/src/contract/bands.test.ts` |
| Quick run command (single dir) | `cd lattice && pnpm exec vitest run packages/lattice/src/contract` |
| Full suite command | `cd lattice && pnpm test` (runs `pnpm -r vitest run` across all workspace packages) |
| Type-check command | `cd lattice && pnpm --filter lattice typecheck` (runs `tsc -p tsconfig.json --noEmit`) |

**FSB side (vanilla Node):**

| Property | Value |
|----------|-------|
| Framework | Raw `node tests/file.test.js` (no test runner; manual counters) |
| Config file | none -- each test is self-contained |
| Quick run command (single file) | `node tests/lattice-tripwire-smoke.test.js` |
| Full suite command | `npm test` (long `&&` chain -- Phase 2 appends `&& node tests/lattice-tripwire-smoke.test.js` after the Phase 1 smoke) |

### Phase Requirements → Test Map

| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|-------------|
| LSDK-02 (step-marker fields on CapabilityReceiptBody + v1.1 version) | v1.1 receipt mints with stepName/stepIndex/parentStepName/previousStepName/timestamp; v1 receipts unchanged | unit (Lattice vitest) | `cd lattice && pnpm exec vitest run packages/lattice/src/receipts/receipt.test.ts packages/lattice/src/receipts/verify.test.ts` | Partial -- existing receipt.test.ts + verify.test.ts present; Phase 2 EXTENDS them. Wave 0: extend |
| LSDK-02 (FSB-side proof) | FSB consumes v1.1 round-trip via dynamic import | smoke (FSB node) | `node tests/lattice-tripwire-smoke.test.js` (Part 1) | Wave 0 (new file) |
| LSDK-03 (sessionId field) | sessionId round-trips through v1.1 receipt | unit + smoke | Same as LSDK-02 -- single-test-coverage for both fields | Same as LSDK-02 |
| LSDK-04..LSDK-08 (band pipeline primitives) | createHookPipeline factory + band ordering + matcher + race-with-log + freeze + lifecycle events | unit (Lattice vitest) | `cd lattice && pnpm exec vitest run packages/lattice/src/contract/bands.test.ts` | Wave 0 (new file) |
| LSDK-04..LSDK-08 (FSB-side proof) | FSB consumes pipeline end-to-end (band ordering, matcher, freeze, race-with-log) | smoke (FSB node) | `node tests/lattice-tripwire-smoke.test.js` (Parts 3-6) | Wave 0 (new file) |
| FINT-02 (FSB tripwire smoke -- if planner assigns a REQ-ID) | Real-runtime invocation of all Phase 2 primitives | smoke | `node tests/lattice-tripwire-smoke.test.js` | Wave 0 |
| MCP-03 (INV-01 hold) | `tests/tool-definitions-parity.test.js` continues to pass | regression | `node tests/tool-definitions-parity.test.js` | yes (existing) |
| INV-04 (setTimeout iterator preserved) | `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 | grep gate | `grep -c "setTimeout" extension/ai/agent-loop.js` | yes (baseline) |
| INV-06 (primitives in Lattice) | All new primitive code lives under `lattice/packages/lattice/src/`; FSB has only the smoke + .planning artifacts | grep gate | `git diff <baseline_SHA> HEAD --name-only | grep -E "^(extension|mcp)/" | wc -l` returns 0 | yes (baseline) |
| Phase 1 carryforward | `tests/lattice-smoke.test.js` byte-frozen + still passes | regression | `git diff <baseline_SHA> HEAD -- tests/lattice-smoke.test.js` empty + `node tests/lattice-smoke.test.js` exits 0 | yes (existing) |

### Sampling Rate

- **Per task commit:** `cd lattice && pnpm exec vitest run packages/lattice/src/<changed_dir>` for Lattice-side changes; `node tests/lattice-tripwire-smoke.test.js` for FSB-side changes (quick local feedback, < 5 seconds combined)
- **Per wave merge:** Lattice waves -- `cd lattice && pnpm test` (full vitest suite); FSB wave -- `npm test` (full chain including the new tripwire smoke at the end)
- **Phase gate (before `/gsd-verify-work`):** ALL of the following exit 0:
  - `cd lattice && pnpm test` (Lattice full vitest suite green, existing 451 tests + new ~25 tests = ~476 tests)
  - `cd lattice && pnpm --filter lattice typecheck` (TypeScript type-check clean -- guards against `exactOptionalPropertyTypes` violations)
  - `npm test` (FSB full chain including new tripwire smoke at the end)
  - `node tests/tool-definitions-parity.test.js` (MCP wire untouched; INV-01 hold)
  - `grep -c "setTimeout" extension/ai/agent-loop.js` returns `8` (INV-04 hold)
  - `git diff 51bdbb36 HEAD --name-only | grep -E "^(extension|mcp)/"` is empty (no FSB runtime touched; Option B + INV-01)
  - `cd lattice && git status --porcelain` is empty (working tree clean)
  - `cd lattice && git rev-parse fsb-integration-experiments` matches `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` (no drift)
  - `cd lattice && git reflog -50 | grep -c push` returns `0` (D-15 hold)
  - All audit-doc rows scheduled for closure (see "Audit-Doc Row Closure Map") flipped to `Covered` with backlink SHAs

### Wave 0 Gaps

- [ ] `lattice/packages/lattice/src/contract/bands.ts` -- NEW (LSDK-04..LSDK-08; the Lattice-side band pipeline primitive)
- [ ] `lattice/packages/lattice/src/contract/bands.test.ts` -- NEW (~20-25 vitest cases per "Lattice test pattern" above)
- [ ] `tests/lattice-tripwire-smoke.test.js` -- NEW (FSB-side real-runtime smoke; FINT-02 + cross-coverage of LSDK-02..LSDK-08)
- [ ] `lattice/packages/lattice/src/receipts/receipt.test.ts` -- EXTEND (add ~3 v1.1-specific cases: "mints v1.1 when any step-marker field set", "mints v1 when all step-marker fields absent", "v1.1 body round-trips all 6 fields through canonical bytes")
- [ ] `lattice/packages/lattice/src/receipts/verify.test.ts` -- EXTEND (add ~2 cases: "verifies v1.1 receipt", "version-mismatch on neither-v1-nor-v1.1 literal")
- [ ] (OPTIONAL) `lattice/packages/lattice/src/receipts/canonical.test.ts` -- EXTEND (add 1 case: "v1.1 body with stepName field canonicalizes with alphabetically-correct key placement")
- [ ] (OPTIONAL) `lattice/packages/lattice/src/receipts/redact.test.ts` -- EXTEND (add 1 case: "v1.1 body with stepName field passes through redact.ts unchanged" -- proves D-04)

**Framework install:** None. Both vitest and Node test convention are already in place. Phase 2 adds only test FILES, not test infrastructure.

### Reading the validation gate

A Phase 2 plan SUCCEEDS when:
- All Wave 0 gaps closed (files created or extended).
- All Lattice-side commits land on `fsb-integration-experiments` with `Ref: FSB v0.10.0-attempt-2 Phase 2` footer.
- All FSB-side commits land on `automation`.
- All 9 phase-gate checks above exit 0.
- `.planning/LATTICE-PIN.md` frontmatter SHA matches Lattice HEAD.

A Phase 2 plan FAILS when any single phase-gate check returns non-zero. The Wave 0 gaps include extending existing tests; failing to extend (i.e., leaving the new behavior uncovered by Lattice vitest) is itself a Wave 0 gap, not just a phase-gate failure.

## Security Domain

**Trigger check:** `.planning/config.json` does NOT set `security_enforcement` (absent => default policy applies). Phase 2 touches the receipt signing pipeline (canonical form + redaction) and a new tripwire pipeline. Security domain is INCLUDED.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | NO | Phase 2 does not introduce auth surface |
| V3 Session Management | NO (Lattice sessions are in-memory test fixtures; not user-facing) | -- |
| V4 Access Control | NO | -- |
| V5 Input Validation | YES (verifier accepts arbitrary `unknown` payloads via `asReceiptBody`) | Existing `verify.ts` does type-safe structural validation before trusting body fields. v1.1 extension preserves this: the new literal check guards the v1.1 path; new optional fields are NOT structurally checked (consistent with the existing approach for `noRouteReasons`, `tripwireEvidence`). |
| V6 Cryptography | YES (Ed25519 signing + JCS canonical form) | Phase 2 makes NO crypto changes -- canonical.ts, sign.ts, envelope.ts, verify.ts (signature path) all unchanged. Adding optional fields to the body increases the signed digest's input surface, but the redact-then-sign ordering invariant is preserved by construction (createReceipt:103 still calls `redactReceiptBody` before canonicalize). |
| V7 Error Handling | YES (verifier never throws across the verification boundary -- see `verify.ts:30-34` panic-free contract) | Phase 2 preserves the contract: `asReceiptBody` returns `undefined` (-> `version-mismatch`) for unknown literals; never throws. |
| V8 Data Protection | YES (redaction policy is part of the threat model) | D-04 BINDING: step-marker fields stay OUT of the redaction manifest. The contract on FSB-side callers is "step-marker fields = stable identifiers, NOT user content / PII." This contract is documented in the SUMMARY and the bands.ts header. Future Lattice consumers honor the same contract. |
| V9 Communication | NO | -- |
| V10 Malicious Code | NO | -- |
| V11 Business Logic | YES (mid-session registration freeze is a safety contract) | D-11 BINDING: `pipeline.freeze()` is irreversible. Late-binding hook injection is the threat; the freeze blocks it. Tested in bands.test.ts. |
| V12 Files and Resources | NO | -- |
| V13 API and Web Services | NO | -- |
| V14 Configuration | NO | -- |

### Known Threat Patterns for Phase 2

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Crafted receipt body with unknown version field** (DoS via malformed input) | T (Tampering) | `asReceiptBody` returns undefined for non-recognized literals; `verifyReceipt` returns typed `version-mismatch` error; never throws (existing contract preserved) |
| **Crafted body field collision** -- caller submits `stepName: "..."` in a v1 receipt | I (Information disclosure -- via shape confusion) | The version-bump heuristic in `createReceipt` ensures any step-marker field's presence emits v1.1, not v1. A caller cannot smuggle step-marker data into a v1-typed receipt. |
| **PII in step-marker fields** (data leak into the unredacted-by-policy surface) | I (Information disclosure) | Documented contract: callers populate step-marker fields with STABLE IDENTIFIERS, not user content. Violation is a downstream policy issue; D-04 explicit. |
| **HOOK_TIMEOUT payload leaks context** (Information disclosure via observability channel) | I (Information disclosure) | bands.ts builds the payload from local variables only -- `{event, band, budgetMs, sessionId, handlerIndex, elapsedMs}`. The handler's frozen context never travels into the timeout event payload. Tested in bands.test.ts: "HOOK_TIMEOUT payload contains only stable identifiers." |
| **Slow handler stalls the safety band** (DoS via long-running handler) | D (Denial of service) | Race-with-log per-handler budget (default 100ms; HOOK_TIMEOUT emitted; pipeline continues). The handler keeps running in background (CPU-leak risk explicitly accepted per D-09). |
| **Late-binding hook injection mid-session** (privilege escalation via post-session-start handler attach) | E (Elevation of privilege) | `pipeline.freeze()` is irreversible; subsequent `register()` throws `PIPELINE_FROZEN`. Tested. |
| **Handler mutates context, leaks side effects to other handlers** | T (Tampering) | structuredClone + Object.freeze per handler; mutations don't leak. Tested. |
| **Bypass of pure tripwire evaluator via bands pipeline** -- can a bands handler short-circuit `evaluateTripwires`? | T (Tampering) | NO -- `evaluateTripwires` is invoked by `runtime/create-ai.ts:372-444` directly. Bands pipeline is a SIBLING with no callsite in `evaluateTripwires`. The two systems do not interact in Phase 2. |
| **`exactOptionalPropertyTypes` evasion** -- can a caller smuggle `stepName: undefined` to bypass the optional contract? | Compile-time safety | TS 6 + `exactOptionalPropertyTypes` rejects this pattern at compile time (verified empirically -- CD-02 Resolution). |
| **Crafted regex matcher DoS** (ReDoS via expensive matcher regex) | D (Denial of service) | Matcher regex is supplied by the registering hook author, not by untrusted input. Phase 2 trusts hook authors. If a future phase opens hook registration to untrusted callers, ReDoS becomes in-scope; Phase 2 acknowledges and defers. |

**Receipt signing path security invariant (UNRETROFITTABLE -- carried from `09-CONTEXT.md` per `receipt.ts:51-66` docstring):**

> Ordering: redact -> canonicalize -> PAE -> sign -> encode. The signed digest commits to `canonicalize(redact(body))`. The function structure makes any other ordering impossible to write by accident.

Phase 2 preserves this invariant by construction: the new step-marker fields are added to `body0` BEFORE `redactReceiptBody` is called (line 103). The redactor returns a new body with redactions[] populated; `canonicalizeReceiptBody` runs on that output; PAE+sign+encode follow. No reordering possible.

## Sources

### Primary (HIGH confidence -- local file or live-tool verification)

- `lattice/packages/lattice/src/receipts/types.ts` -- full file (115 lines, all 4 exported interfaces verified)
- `lattice/packages/lattice/src/receipts/canonical.ts` -- full file (60 lines, JCS canonicalization confirmed)
- `lattice/packages/lattice/src/receipts/canonical.test.ts` -- full file (190 lines; alphabetical-sort behavior empirically established at lines 104-137)
- `lattice/packages/lattice/src/receipts/receipt.ts` -- full file (123 lines, `CreateReceiptInput` + body assembly + conditional-spread idiom)
- `lattice/packages/lattice/src/receipts/receipt.test.ts` -- full file (312 lines, vitest assertion patterns)
- `lattice/packages/lattice/src/receipts/verify.ts` -- full file (152 lines, `asReceiptBody` shape + 8-step decision tree)
- `lattice/packages/lattice/src/receipts/verify.test.ts` -- read first 100 lines (vitest patterns + `verify` happy/error paths)
- `lattice/packages/lattice/src/receipts/sign.ts` -- full file (114 lines, signer surface unchanged)
- `lattice/packages/lattice/src/receipts/keyset.ts` -- full file (28 lines, KeySet surface unchanged)
- `lattice/packages/lattice/src/receipts/redact.ts` -- full file (72 lines, redaction manifest unchanged)
- `lattice/packages/lattice/src/receipts/redact.test.ts` -- full file (160 lines, vitest patterns + frozen-body tolerance)
- `lattice/packages/lattice/src/contract/tripwire.ts` -- full file (309 lines, pure evaluator pattern)
- `lattice/packages/lattice/src/contract/tripwire.test.ts` -- full file (260 lines, vitest pattern source-of-truth for bands.test.ts)
- `lattice/packages/lattice/src/contract/invariants.ts` -- full file (122 lines, `inv` fluent builder pattern; `Object.freeze` usage)
- `lattice/packages/lattice/src/contract/contract.ts` -- full file (99 lines, `Object.freeze` + conditional-spread pattern)
- `lattice/packages/lattice/src/tracing/tracing.ts` -- full file (53 lines, `TracerLike` + `RunEventKind` + 16-event union confirmed)
- `lattice/packages/lattice/src/policy/policy.ts` -- full file (25 lines, PolicySpec unchanged)
- `lattice/packages/lattice/src/runtime/create-ai.ts` -- full file (993 lines, AbortSignal passthrough pattern + maybeIssueReceipt callsite)
- `lattice/packages/lattice/src/runtime/public-types.ts` -- read first 100 lines (type re-export convention)
- `lattice/packages/lattice/src/index.ts` -- full file (117 lines, public surface)
- `lattice/packages/lattice/package.json` -- full file (52 lines, scripts + deps + tsd compilerOptions confirming `exactOptionalPropertyTypes`)
- `lattice/packages/lattice/tsconfig.json` -- full file (8 lines)
- `lattice/tsconfig.base.json` -- full file (16 lines; `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`, `target: ES2024`)
- `lattice/packages/lattice/tsdown.config.ts` -- full file (12 lines, entry: src/index.ts)
- `lattice/packages/lattice/vitest.config.ts` -- full file (14 lines, glob behavior confirmed)
- `lattice/packages/lattice/src/sessions/session.ts:180-204` -- structuredClone pattern (`clone<T>` helper)
- `lattice/AGENTS.md` -- full file (~210 lines, Lattice contributor conventions verified)
- `lattice/docs/fsb-integration-gaps.md` -- full file (91 lines, all 6 domain headers + 21 severity rows)
- Live `node --version` = `v25.9.0`
- Live `npm --version` = `11.12.1`
- Live `cd lattice && pnpm --version` = `10.33.1`
- Live `cd lattice && git rev-parse fsb-integration-experiments` = `22bf98627ae86b1576db5d34cf447ab2b321b3e1`
- Live `cd lattice && git log -3 --oneline fsb-integration-experiments` confirms commits `22bf986`, `195e5ae`, `ab6c1f6`
- Live TypeScript compilation probe at `/tmp/tsprobe/test.ts` with TypeScript 6.0.3 -- confirms CD-02 (flat literal-union compiles cleanly under `exactOptionalPropertyTypes`; explicit `field: undefined` correctly rejected)
- Live grep for `Promise.race | AbortSignal | AbortController | setTimeout | clearTimeout` in `lattice/packages/lattice/src/` -- confirms CD-01 (no existing async-timeout pattern in Lattice; AbortSignal is passthrough-only)
- Live grep for `structuredClone | Object.freeze` in `lattice/packages/lattice/src/` -- confirms D-10 patterns already in use (sessions/session.ts, storage/memory.ts, contract/invariants.ts, contract/contract.ts, contract/pii-detectors.ts)
- `.planning/phases/02-lattice-tripwire-receipt-extension/02-CONTEXT.md` -- full file (read in full at research time)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-CONTEXT.md` -- full file (read in full)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-VERIFICATION.md` -- full file (read in full)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-RESEARCH.md` -- partial read (first 450 lines + 450-end)
- `.planning/PROJECT.md` -- read at research time
- `.planning/REQUIREMENTS.md` -- full file (110 lines)
- `.planning/STATE.md` -- full file (114 lines)
- `.planning/ROADMAP.md` -- full file (158 lines, Phase 2 detail block at lines 84-114)
- `.planning/LATTICE-PIN.md` -- full file (37 lines)
- `.planning/config.json` -- full file (verified `workflow.nyquist_validation` is absent => enabled)
- `tests/lattice-smoke.test.js` -- full file (175 lines, Phase 1 smoke pattern)
- `tests/install-identity.test.js` -- read first 60 lines (FSB test convention)
- `tests/agent-loop-empty-contents.test.js` -- read first 60 lines (FSB test convention)
- `package.json` -- full file (172 lines, scripts.test chain + file: dep verified)
- `extension/ai/hook-pipeline.js` -- head read (201 LOC; attempt-1 baseline preserved; not modified in Phase 2)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/01-01-SUMMARY.md` -- read first 200 lines (informational, race-with-log pattern reference)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/01-03-SUMMARY.md` -- read first 100 lines (informational, hook-factory pattern reference)

### Secondary (MEDIUM confidence -- official docs)

- TypeScript 6 `exactOptionalPropertyTypes` semantics: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html#exact-optional-property-types--exactoptionalpropertytypes (note: feature shipped in TS 4.4; confirmed still active in TS 6)
- RFC 8785 JSON Canonicalization Scheme (JCS): https://www.rfc-editor.org/rfc/rfc8785.html (alphabetical-sort behavior verified by Lattice's `canonical.test.ts` against vectors at lines 151-189)
- DSSE v1.0 envelope spec: https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md (referenced by Lattice's `envelope.ts:1-31`; not modified in Phase 2)
- RFC 8032 Ed25519: https://www.rfc-editor.org/rfc/rfc8032 (referenced by Lattice's `sign.ts`; not modified in Phase 2)
- vitest documentation: https://v4.vitest.dev/ (per Lattice's AGENTS.md:106; assertion patterns confirmed by reading existing test files)
- pnpm catalogs: https://pnpm.io/catalogs (Phase 1's `22bf986` resolved catalog: literals for npm consumers; Phase 2 inherits the fix)

### Tertiary (LOW confidence -- training data)

- TypeScript discriminated-union narrowing rules under `strictNullChecks` + `exactOptionalPropertyTypes`: training-knowledge; verified empirically via `/tmp/tsprobe/` compilation probe (so PROMOTED to HIGH for this specific claim)
- Chrome MV3 module/classic SW mutual exclusion: training-knowledge; not relevant to Phase 2 (FSB Option B reconciliation -- no in-extension load)

## Metadata

**Confidence breakdown:**
- Lattice surface inventory: HIGH -- read every file in `lattice/packages/lattice/src/receipts/`, `lattice/packages/lattice/src/contract/`, `lattice/packages/lattice/src/tracing/`, `lattice/packages/lattice/src/policy/`, plus runtime/create-ai.ts in this session.
- Receipt v1.1 type extension: HIGH -- empirical TS 6 compile probe confirmed CD-02; conditional-spread idiom matches existing `receipt.ts:93-98` pattern.
- Verifier `asReceiptBody` extension: HIGH -- direct read of `verify.ts:36-52`; the new conditional follows from D-02's literal-union expansion.
- bands.ts API surface design: HIGH -- mirrors attempt-1's HookPipeline patterns (verified via SUMMARY reads) translated to TypeScript factory + matching Lattice's TS conventions (interface + factory function + frozen returns).
- CD-01 resolution (no-abort Promise.race): HIGH -- empirical grep proved Lattice has no existing Promise.race/setTimeout/AbortController internal pattern to imitate; the no-abort choice matches attempt-1 and D-09's stated preference.
- CD-02 resolution (flat literal-union): HIGH -- empirical TypeScript 6.0.3 compile probe under exact-same compiler flags.
- JCS canonicalization stability: HIGH -- read `canonical.test.ts` confirms alphabetical key sort; the new optional fields fall into place without `canonical.ts` source change.
- D-04 redaction policy unchanged: HIGH -- read `redact.ts` confirms `redactReceiptBody` only emits manifest entries for `tripwireEvidence.kind === "no-pii"`; new fields don't match.
- Lattice test pattern (vitest): HIGH -- read `tripwire.test.ts`, `redact.test.ts`, `canonical.test.ts`, `receipt.test.ts` for assertion idioms.
- FSB smoke pattern: HIGH -- mirrors `tests/lattice-smoke.test.js` exactly.
- Audit-doc row closure: MEDIUM-HIGH -- the proposed row-flip wording is researcher's judgment; planner refines during execute-phase.
- LSDK REQ-ID granularity: MEDIUM -- D-17 + CD-05 leave the count to the planner; the 7-REQ proposal is researcher's recommended granularity.

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days; Lattice v1.1 surface is stable post-Phase-1 shipping. Verify `cd lattice && git rev-parse fsb-integration-experiments` against `.planning/LATTICE-PIN.md` frontmatter at Phase 2 plan-execution-time to ensure no drift.)

## RESEARCH COMPLETE
