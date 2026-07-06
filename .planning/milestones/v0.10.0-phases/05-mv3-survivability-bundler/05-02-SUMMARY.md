---
phase: 05-mv3-survivability-bundler
plan: 02
subsystem: lattice-mv3-survivability-contract
tags: [lattice, survivability, mv3, adapter-contract, noop-reference-impl, wave-1]
requirements_completed:
  - LSDK-19
  - LSDK-20
dependency_graph:
  requires:
    - "Phase 1-4 byte-frozen baseline (397 Lattice vitest PASS at HEAD f1c943bd)"
    - "Phase 2 receipts/types.ts v1.1 schema (step-marker fields)"
    - "Phase 3 contract/checkpoint.ts createCheckpointHook (composition target)"
    - "Phase 2 contract/bands.ts BAND.SAFETY (composition target)"
    - "receipts/sign.ts createInMemorySigner + generateEd25519KeyPairJwk"
    - "receipts/receipt.ts createReceipt"
    - "receipts/verify.ts verifyReceipt"
    - "receipts/keyset.ts createMemoryKeySet"
  provides:
    - "SurvivabilityAdapter<TState> interface (4 methods: serialize, deserialize, onEviction, resume)"
    - "SerializedSnapshot type (kind + version + payload + capturedAt envelope)"
    - "EvictionHook<TState> + UnsubscribeFn types"
    - "ResumePolicy literal-union (4 members; CD-E carries forward)"
    - "NoopSurvivabilityAdapterOptions factory options"
    - "createNoopSurvivabilityAdapter() reference implementation"
    - "17 vitest cases (factory identity + round-trip + onEviction lifecycle + resume policy + composition with Phase 3 receipts + strict-mode compile cleanliness)"
    - "Lattice-side surface ready for Plan 05-03 public-surface re-export (W2)"
    - "Lattice-side surface ready for Plan 05-05 FSB-side standalone adapter (W3)"
  affects:
    - "lattice/packages/lattice/src/runtime/ (new sibling module to create-ai.ts)"
    - "Lattice vitest tally: 397 baseline -> 414 (additive, no Phase 1-4 regression)"
tech_stack:
  added:
    - "TypeScript SurvivabilityAdapter<TState> interface (Lattice runtime module tree)"
  patterns:
    - "Sibling-of-create-ai.ts placement (D-07): primitive lives in Lattice per INV-06; FSB consumes via bare specifier in Plan 05-05"
    - "Noop reference impl pattern (D-11): analog to createFakeProvider; gives vitest a complete shape-conformance target before FSB ships the real adapter"
    - "Literal-union ResumePolicy (CD-E): SAFE | RECOVERY_AMBIGUOUS | ON_ERROR_SW_EVICTION_MID_REQUEST | ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH"
    - "Real-runtime tests (Tests 11-12): real createReceipt + real Ed25519 signer + real verifyReceipt; no mocks for Lattice's own primitives"
    - "Composition documented, NOT enforced (D-09 BAND.SAFETY + D-10 checkpoint envelope embedding)"
key_files:
  created:
    - "lattice/packages/lattice/src/runtime/survivability.ts (244 lines)"
    - "lattice/packages/lattice/src/runtime/survivability.test.ts (265 lines)"
    - ".planning/phases/05-mv3-survivability-bundler/05-02-LATTICE-SHA.txt"
    - ".planning/phases/05-mv3-survivability-bundler/05-02-SUMMARY.md"
  modified: []
decisions:
  - "D-07 survivability.ts placement: sibling of runtime/create-ai.ts (Lattice-side per INV-06)"
  - "D-08 SurvivabilityAdapter interface shape: 4 methods (serialize, deserialize, onEviction, resume)"
  - "D-09 BAND.SAFETY composition convention documented in JSDoc; not auto-registered"
  - "D-10 SerializedSnapshot.payload MAY embed v1.1 ReceiptEnvelope; verified end-to-end by Test 12 (DSSE+JCS round-trip)"
  - "D-11 createNoopSurvivabilityAdapter() ships in Lattice (not FSB); covers contract surface in Lattice's own vitest"
  - "D-12 17 vitest cases (target was 12-15; landed at 17 -- additional Tests 3b + 14b for id stability and structural consistency)"
  - "D-25 Lattice commit ceremony continues (Ref footer; no git push)"
  - "CD-E ResumePolicy literal-union with 4 members (carries forward from FSB v0.10.0-attempt-1 02-04-PLAN.md taxonomy)"
metrics:
  duration_seconds: 600
  duration_human: "approximately 10 minutes"
  completed_date: "2026-05-25T01:23:40Z"
  tasks_completed: 3
  files_touched: 4
  commits: 1
---

# Phase 5 Plan 02: Lattice MV3-Survivability Adapter Contract + Noop Reference Impl Summary

Shipped the Lattice-side MV3-survivability adapter contract as a new sibling module to `runtime/create-ai.ts`: the `SurvivabilityAdapter<TState>` interface plus 4 supporting types plus the `createNoopSurvivabilityAdapter()` reference factory, all covered by 17 vitest cases including end-to-end composition with Phase 3's signed v1.1 ReceiptEnvelope. This unblocks Plan 05-03 (public-surface re-export) + Plan 05-05 (FSB-side standalone adapter), closes the audit-doc MV3-survivability Blocker rows at the contract level, and advances Lattice's vitest tally from 397 (Phase 4 baseline) to 414 with zero Phase 1-4 source modifications.

## Lattice Commit

- **Branch:** `fsb-integration-experiments`
- **Short SHA:** `a4609bc`
- **Full SHA:** `a4609bc3af7fa44e25c3046e218f2e63f1a737ed`
- **Title:** `feat(runtime): add MV3-survivability adapter contract + noop reference impl`
- **Footer:** `Ref: FSB v0.10.0-attempt-2 Phase 5` (D-25 carryforward)
- **Push:** NOT pushed to Lattice's remote (D-19 carryforward verified: `git reflog | grep -c push` = 0)
- **Files changed:** 2 (both new)

## survivability.ts (244 lines)

Interface + types + factory:

| Export | Kind | Description |
|--------|------|-------------|
| `SerializedSnapshot` | interface | `kind: "survivability-snapshot"` + `version: "lattice-survivability/v1"` + `payload: string` + `capturedAt: string` |
| `EvictionHook<TState>` | type | `(state: TState) => void | Promise<void>` |
| `UnsubscribeFn` | type | `() => void` (idempotent) |
| `ResumePolicy` | literal-union | 4 members (see ResumePolicy section) |
| `SurvivabilityAdapter<TState>` | interface | 4 methods + `kind: "survivability-adapter"` + `id: string` |
| `NoopSurvivabilityAdapterOptions` | interface | `id?: string` + `policy?: ResumePolicy` |
| `createNoopSurvivabilityAdapter()` | function | Reference factory (TState defaults to `Record<string, unknown>`) |

## SurvivabilityAdapter Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `serialize(state)` | `(state: TState) => SerializedSnapshot` | Convert in-memory state to string-encodable snapshot |
| `deserialize(snapshot)` | `(snapshot: SerializedSnapshot) => TState` | Inverse of serialize |
| `onEviction(hook)` | `(hook: EvictionHook<TState>) => UnsubscribeFn` | Register best-effort pre-eviction callback |
| `resume(snapshot)` | `(snapshot: SerializedSnapshot) => Promise<ResumePolicy>` | Post-restore reconstruction verdict |

## ResumePolicy Literal Members (CD-E, 4 total)

| Member | When |
|--------|------|
| `SAFE` | Snapshot captured at safe boundary; deterministic replay possible |
| `RECOVERY_AMBIGUOUS` | Snapshot captured during tool dispatch; non-zero re-execution risk; escalate to user |
| `ON_ERROR_SW_EVICTION_MID_REQUEST` | Eviction during in-flight provider request; 6/7 FSB providers lack Idempotency-Key; treat as failed |
| `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH` | Eviction during browser-action tool dispatch; inspect page state before deciding |

## survivability.test.ts (265 lines, 17 cases)

Test cases enumerated:

| Test | Block | Assertion |
|------|-------|-----------|
| Test 1 | factory identity | `typeof createNoopSurvivabilityAdapter === "function"` |
| Test 2 | factory identity | `adapter.kind === "survivability-adapter"` |
| Test 3 | factory identity | 4 methods all `typeof === "function"` |
| Test 3b | factory identity | `adapter.id` defaults to `"noop-survivability"`; overridable via `{id}` option |
| Test 4 | round-trip | SerializedSnapshot has kind + version + payload + capturedAt (ISO-8601 sanity) |
| Test 5 | round-trip | `JSON.stringify(deserialize(serialize(state)))` equals `JSON.stringify(state)` |
| Test 9 | round-trip | `serialize()` twice with identical state -> identical payload (deterministic) |
| Test 6 | onEviction | onEviction returns UnsubscribeFn; idempotent under double-call |
| Test 10 | onEviction | EvictionHook<TState> signature compiles + registers; noop adapter records but does not invoke |
| Test 7 | resume | `resume(snapshot)` returns `Promise<ResumePolicy>`; default = `"SAFE"` |
| Test 8 | resume | ResumePolicy covers exactly 4 literal members |
| Test 13 | resume | ResumePolicy literal-union is discriminated by string (JSON round-trip stable) |
| Test 15 | resume | factory accepts `options.policy` to override default resume verdict |
| Test 11 | composition | SerializedSnapshot.payload carries v1.1 ReceiptEnvelope + session state; signature bytes preserved |
| Test 12 | composition | round-tripped envelope verifies under real verifyReceipt (DSSE + JCS preserved) |
| Test 14 | strict-mode | optional `{id?}` config compiles under `exactOptionalPropertyTypes` |
| Test 14b | strict-mode | SerializedSnapshot structurally consistent across serialize calls |

Tests 11-12 use **real** Lattice primitives end-to-end: `generateEd25519KeyPairJwk` -> `createInMemorySigner` -> `createReceipt` (with v1.1 step-marker fields) -> `adapter.serialize` -> `adapter.deserialize` -> `verifyReceipt`. No mocks for Lattice's own primitives (project rule "Real runtime tests, not static-text").

## Lattice Vitest Tally

| Stage | Test Files | Tests | Notes |
|-------|------------|-------|-------|
| Phase 4 baseline | 38 | 397 | Pre-Plan 05-02 |
| Plan 05-02 additive | +1 | +17 | survivability.test.ts |
| **Phase 5 W1 (Lattice)** | **39** | **414** | All PASS, 0 FAIL |

Plan target was >=409; landed at 414 (5 cases over target).

## Phase 1-4 Byte-Freeze Verification

Probe: `git diff --name-only HEAD~1 HEAD -- packages/lattice/src/receipts/types.ts packages/lattice/src/contract/bands.ts packages/lattice/src/contract/checkpoint.ts packages/lattice/src/tracing/tracing.ts packages/lattice/src/providers/anthropic.ts packages/lattice/src/providers/gemini.ts packages/lattice/src/providers/xai.ts packages/lattice/src/providers/openrouter.ts packages/lattice/src/providers/lm-studio.ts packages/lattice/src/index.ts`

Output: empty (no diff). Phase 1-4 Lattice source files are BYTE-FROZEN under the HEAD~1..HEAD diff. The two new files (`packages/lattice/src/runtime/survivability.ts` + `survivability.test.ts`) are the only additions.

`src/index.ts` re-export deferred to Plan 05-03 (W2 sequential dependency).

## Composition Conventions (Documented, Not Enforced)

- **D-09 (BAND.SAFETY):** JSDoc on SurvivabilityAdapter documents that onEviction hooks SHOULD register in BAND.SAFETY (Phase 2 bands.ts) so they run FIRST per priority ordering. The contract does NOT auto-register; FSB-side adapter (Plan 05-05) wires this when the feature flag is on.

- **D-10 (checkpoint envelope embedding):** JSDoc documents that SerializedSnapshot.payload MAY embed v1.1 ReceiptEnvelope from Phase 3 createCheckpointHook output. Test 12 proves the DSSE + JCS canonical bytes survive JSON.stringify -> JSON.parse round-trip (verifyReceipt returns `result.ok === true` post-restore).

## Threat Surface (Threat Model Carried Through)

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-05-02-01 PII via SerializedSnapshot.payload | mitigate | JSDoc requires callers persist only stable identifiers / consented state |
| T-05-02-02 Snapshot tampering | mitigate | JSDoc recommends embedded signed ReceiptEnvelope + verifyReceipt on deserialize; Test 12 proves round-trip integrity |
| T-05-02-05 Resume policy verdict spoofed | mitigate | resume() returns ResumePolicy literal-union; non-member injection rejected at TypeScript compile time |
| T-05-02-03 EvictionHook spoofing | accept | in-process registration; caller owns HookPipeline |
| T-05-02-04 Hook registry unbounded | accept | reference impl only; production adapters document bounding |
| T-05-02-06 EvictionHook EoP via mutation-by-reference | accept | deliberate per JSDoc; callers freeze if needed |

## Deviations from Plan

None substantive. One micro-adjustment for typecheck cleanliness:

**1. [Rule 1 - Bug] Removed unused `version` field from CreateReceiptInput in Tests 11-12**
- **Found during:** Task 2 typecheck pass.
- **Issue:** Plan action body included `version: "lattice-receipt/v1.1"` inside the createReceipt input object literal; CreateReceiptInput (receipt.ts line 32-56) does NOT declare a `version` field (version is auto-derived from presence of step-marker fields per receipts/receipt.ts internal logic).
- **Fix:** Removed the `version` line from both Test 11 and Test 12 createReceipt invocations. The step-marker fields (`stepName`, `stepIndex`, `sessionId`, `timestamp`) still cause the emitted body to be `lattice-receipt/v1.1` automatically.
- **Files modified:** `lattice/packages/lattice/src/runtime/survivability.test.ts` (Tests 11-12 input literals).
- **Commit:** `a4609bc` (included in the single atomic Lattice commit).

Otherwise the plan executed byte-for-byte (the survivability.ts file is byte-identical to the plan's action body).

## Self-Check: PASSED

Verified:
- `lattice/packages/lattice/src/runtime/survivability.ts` exists (244 lines)
- `lattice/packages/lattice/src/runtime/survivability.test.ts` exists (265 lines)
- `.planning/phases/05-mv3-survivability-bundler/05-02-LATTICE-SHA.txt` exists with `a4609bc3af7fa44e25c3046e218f2e63f1a737ed`
- Lattice commit `a4609bc3af7fa44e25c3046e218f2e63f1a737ed` exists on `fsb-integration-experiments`
- Commit body contains exactly 1 `Ref: FSB v0.10.0-attempt-2 Phase 5` footer
- `cd lattice && git reflog | grep -c push` = 0 (D-19 NO-push verified)
- `cd lattice && pnpm --filter lattice typecheck` exit code 0
- `cd lattice && pnpm --filter lattice test` reports 39 test files / 414 tests passing
- Phase 1-4 Lattice source files byte-frozen under HEAD~1..HEAD diff (empty diff)
- No FSB extension/* or tests/* modifications
- LSDK-19 (interface) + LSDK-20 (ref impl) requirements addressed
