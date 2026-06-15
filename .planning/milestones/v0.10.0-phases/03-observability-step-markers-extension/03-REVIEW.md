---
phase: 03-observability-step-markers-extension
reviewed: 2026-05-24T20:49:20Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - tests/lattice-checkpoint-smoke.test.js
  - package.json
  - lattice/packages/lattice/src/tracing/tracing.ts
  - lattice/packages/lattice/src/contract/checkpoint.ts
  - lattice/packages/lattice/src/index.ts
  - .planning/LATTICE-PIN.md
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-24T20:49:20Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

Phase 3 (observability / step-markers extension) ships a tight, narrowly-scoped change: a one-line `"step.transition"` literal added to `RunEventKind` in `tracing.ts`, a NEW Lattice sibling module `checkpoint.ts` shipping the `createCheckpointHook(...)` factory + two constants + two types, the matching public-surface re-exports in `index.ts`, an FSB-side end-to-end smoke (`tests/lattice-checkpoint-smoke.test.js`, 72 PASS), and a LATTICE-PIN.md row recording the new pinned Lattice HEAD.

The implementation is correct against the documented Phase 3 contract (CONTEXT.md D-01 .. D-15). All explicit block-on-high checks pass:

- No emojis present in any reviewed file (CLAUDE.md global rule honored).
- No hardcoded private keys; smoke generates an ephemeral keypair via `lattice.generateEd25519KeyPairJwk()` (smoke line 87) and threads it through `createInMemorySigner` + `createMemoryKeySet`.
- Best-effort mint try/catch is present in `checkpoint.ts:202-228`; signer failures populate `metadata.mintError` (string) and the handler emits the tracer event without throwing upstream. Both `Error` (`err.message`) and non-Error throws (`String(err)`) are covered.
- Threading in the smoke matches CONTEXT.md D-13 exactly: step-1 has neither previous nor parent; step-2 has `previousStepName="step-1"` with no parent; step-3 has `previousStepName="step-2"` and `parentStepName="step-1"`. Round-trip assertions at smoke lines 251-253 prove the linked-list survives canonical + sign + verify.
- Phase 2 byte-frozen baseline preserved: `git diff 97836f2..7afd62f` on the Lattice repo shows only `tracing.ts` (one-line union add), `checkpoint.ts` (NEW), `checkpoint.test.ts` (NEW), `index.ts`, and `docs/fsb-integration-gaps.md` touched. `bands.ts`, `tripwire.ts`, `receipts/types.ts`, `receipts/receipt.ts`, `receipts/verify.ts`, `receipts/sign.ts`, `receipts/keyset.ts`, `receipts/envelope.ts`, `receipts/canonical.ts`, and `receipts/redact.ts` are byte-identical to Phase 2 HEAD.
- Phase 1+2 FSB smokes byte-frozen: `git log -- tests/lattice-smoke.test.js tests/lattice-tripwire-smoke.test.js` shows last touch at SHA 7c26685c (Phase 2 commit); no Phase 3 commit modifies either file.
- INV-04 preserved: `grep -c "setTimeout" extension/ai/agent-loop.js` returns `8` (unchanged).
- INV-01 preserved: `node tests/tool-definitions-parity.test.js` outputs `=== Results: 142 passed, 0 failed ===`.
- `HOOK_TIMEOUT` and `step.transition` are distinct event names emitted at distinct sites (`bands.ts:159` vs `checkpoint.ts:239`) with non-overlapping documented payload shapes; no payload-contract collision. Both honor the same "stable identifiers only -- no user content" guarantee inherited from Phase 2 D-04.
- Tracer event metadata format is FLAT (CD-01 resolution): `checkpoint.ts:186-194` builds the metadata object as a single-level `Record<string, unknown>`, and the smoke asserts `traceEvents[i].attributes.stepName` (flat key access) at lines 170-182, never `traceEvents[i].attributes.metadata.stepName`. Matches the documented `create-ai.ts:862` pattern.

End-to-end behaviour was verified by executing `node tests/lattice-checkpoint-smoke.test.js`: 72 / 72 PASS, 0 FAIL. The smoke exercises surface presence, pipeline registration, 3-step fake sequence, exactly-3 tracer events, monotonic `stepIndex`, full receipt round-trip via `verifyReceipt`, all 6 step-marker fields preserved through canonical + sign + verify, and Phase 2 freeze() carry-forward.

No Critical or Warning findings. Two Info items below are phase-cohesion observations, not defects.

## Info

### IN-01: `extractReceiptId` re-decodes the canonical payload to recover a value `createReceipt` already knew

**File:** `lattice/packages/lattice/src/contract/checkpoint.ts:252-261`
**Issue:** `createReceipt(...)` (receipts/receipt.ts:83) generates `receiptId` via `crypto.randomUUID()` and bakes it into the body before signing, but its public signature returns only `Promise<ReceiptEnvelope>`. `createCheckpointHook` therefore base64-decodes the envelope payload and `JSON.parse`s the canonical body just to pluck `receiptId` back out for the tracer event metadata. The handler defensively returns `undefined` on decode failure -- so if the envelope wire format ever changes, the FSB smoke's "receiptId is a non-empty string" assertion (smoke lines 192-195) would silently flip from PASS to FAIL via the receipt-id absence rather than via a clearer signal.

This is an architectural seam, not a defect: the round-trip works, the smoke proves it, and the defensive `try/catch` is the right behaviour for the public surface as it stands today. The cleaner fix lives on the Lattice side (have `createReceipt` return `{ envelope, receiptId, issuedAt }` so callers do not need to re-parse). Calling out here for phase-cohesion visibility -- not action-required for Phase 3.

**Fix (deferred, Lattice-side, future phase):**
```ts
// receipts/receipt.ts (illustrative -- NOT a Phase 3 change)
export interface CreateReceiptResult {
  readonly envelope: ReceiptEnvelope;
  readonly receiptId: string;
  readonly issuedAt: string;
}
// Then checkpoint.ts can drop extractReceiptId() entirely.
```

### IN-02: FSB-side smoke covers only the happy path; degraded modes rely on Lattice's vitest suite

**File:** `tests/lattice-checkpoint-smoke.test.js:107-153`
**Issue:** The smoke exercises exactly one configuration: signer-present + tracer-present + signer-succeeds. It does not cover (a) tracer-absent + signer-present (silent mint), (b) signer-absent + tracer-present (tracer-only, no envelope/receiptId in metadata), or (c) signer-throws (mintError fallback per D-07). All three modes ARE covered in Lattice's own `checkpoint.test.ts` (15 vitest cases per LATTICE-PIN.md row), so this is by-design under INV-06 (FSB consumes; Lattice owns contract coverage).

Flagging because a future Lattice surface change that breaks one of the degraded modes (e.g., a regression in the `signer === undefined` branch at checkpoint.ts:201) would not be caught by FSB's smoke -- it would surface only when Lattice's vitest suite runs. Acceptable for Phase 3 given the `>=20 floor / 72 actual` budget and the explicit "FSB consumes the surface end-to-end, real-runtime" framing. No action required.

**Fix (optional, future hardening):** Add 3 short stand-alone smoke blocks (one per degraded mode) if FSB ever wants standalone confidence without delegating to Lattice's vitest. Not in Phase 3 scope.

---

_Reviewed: 2026-05-24T20:49:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
