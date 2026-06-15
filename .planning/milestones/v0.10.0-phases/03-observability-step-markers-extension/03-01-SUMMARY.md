---
phase: 03-observability-step-markers-extension
plan: 01
subsystem: lattice-observability

tags: [lattice, tracing, run-event-kind, checkpoint-hook, capability-receipts-v1.1, hook-pipeline, observability-band, vitest, tdd]

requires:
  - phase: 02-lattice-tripwire-receipt-extension
    provides: "Lattice clone at fsb-integration-experiments branch HEAD 97836f2c (Phase 2 final); HookPipeline + BAND.OBSERVABILITY + HookHandler from bands.ts; CapabilityReceiptBody v1.1 step-marker fields + createReceipt hasStepMarker heuristic from receipts/{types,receipt}.ts; verifyReceipt v1+v1.1 acceptance from receipts/verify.ts"
provides:
  - "RunEventKind literal union extended with 'step.transition' (17th literal); RunEvent interface unchanged (step fields ride in metadata per D-03)"
  - "createCheckpointHook(options) factory at lattice/packages/lattice/src/contract/checkpoint.ts returning HookHandler<CheckpointHookContext>"
  - "STEP_TRANSITION_EVENT_NAME = 'step.transition' constant (matches the tracing.ts literal)"
  - "DEFAULT_CHECKPOINT_BAND = BAND.OBSERVABILITY constant for caller-clarity at the registration site"
  - "CheckpointHookContext + CheckpointHookOptions interfaces (caller-supplied per-step context + factory options)"
  - "Best-effort mint (D-07): signer failures absorbed via try/catch, surfaced via metadata.mintError; tracer event always emits when tracer present"
  - "Receipt envelope returned in tracer event metadata so subscribers can persist without re-minting"
  - "extractReceiptId helper: defensive base64+JSON.parse of envelope payload to correlate tracer event -> receipt"
  - "Two Lattice commits on fsb-integration-experiments (not pushed -- D-15/D-17): fd254c4 (tracing.ts) + a67f476 (checkpoint.ts/test.ts)"
  - ".planning/phases/03-observability-step-markers-extension/03-01-LATTICE-SHA.txt capturing the new Lattice HEAD a67f476"
affects: [03-02, 03-03, phase-04-provider-adapters, phase-05-mv3-survivability, sidepanel-ui-inspector-future-phase]

tech-stack:
  added: []
  patterns:
    - "Sibling-module composition: contract/checkpoint.ts composes bands.ts (HookPipeline) + receipts/receipt.ts (mint) without modifying either"
    - "Vocabulary separation (D-02): HookLifecycleEvent (bands.ts) describes registration attach-points; RunEventKind (tracing.ts) describes observability events; checkpoint hook is the bridge that subscribes to the former and emits the latter"
    - "Best-effort mint mirroring create-ai.ts:956-992 maybeIssueReceipt -- try/catch absorbs signer errors; failure reported via tracer-event metadata, never thrown upstream"
    - "Factory-returns-handler shape (mirrors Phase 2's createHookPipeline()): factory returns a value the caller registers; no global mutation; no auto-registration"
    - "Conditional-spread idiom for exactOptionalPropertyTypes-clean optional-field assembly in both event metadata and CreateReceiptInput body"
    - "TDD RED-GREEN cycle on a brand-new module: write the vitest cases first (failing at import resolution -- 'Cannot find module ./checkpoint.js'), then write the implementation until 15/15 green"

key-files:
  created:
    - "lattice/packages/lattice/src/contract/checkpoint.ts (260 lines; factory + types + constants + extractReceiptId helper)"
    - "lattice/packages/lattice/src/contract/checkpoint.test.ts (240 lines; 15 vitest cases across 7 describe blocks)"
    - ".planning/phases/03-observability-step-markers-extension/03-01-LATTICE-SHA.txt"
  modified:
    - "lattice/packages/lattice/src/tracing/tracing.ts (one-line addition: `| \"step.transition\"` to RunEventKind union)"

key-decisions:
  - "D-01 step.transition lands as the 17th and final literal of RunEventKind in tracing.ts (dotted-namespace sibling of run.* / stage.* / provider.* / tool.* / replay.*)"
  - "D-02 HookLifecycleEvent (bands.ts) BYTE-UNCHANGED; only RunEventKind (tracing.ts) extended -- vocabulary separation from Phase 2 D-12 preserved"
  - "D-03 Step fields ride in RunEvent.metadata (catch-all Record<string, unknown>); no new top-level fields on RunEvent"
  - "D-04 / D-05 Factory createCheckpointHook(options) returns a HookHandler; caller owns registration; no global mutation"
  - "D-06 DEFAULT_CHECKPOINT_BAND = BAND.OBSERVABILITY documented as the registration convention; caller is free to register in a different band"
  - "D-07 Best-effort mint: try/catch absorbs signer.sign() failures; tracer event emits with metadata.mintError; handler never throws upstream"
  - "D-10 Tracer event emission is exactly one per invocation independent of mint outcome; receiptId present on success, mintError present on failure"
  - "D-11 Receipt body content uses sensible step-transition defaults (model: lattice-checkpoint/observability, route.providerId: lattice-checkpoint, contractVerdict: success, usage: 0/0/null) overridable via CheckpointHookOptions"
  - "D-16 Two Lattice commits (rather than one combined) -- one per logical surface: tracing.ts edit and checkpoint.ts+test together. Both carry Ref: FSB v0.10.0-attempt-2 Phase 3 footer."
  - "D-17 / D-15 No git push to Lattice's remote. Verified: git reflog -20 | grep -c push = 0."
  - "CD-01 Flat metadata keys (not nested under metadata.step) -- matches existing emitEvent flat-keys pattern at create-ai.ts:862-868"
  - "CD-02 Step descriptors inline in vitest cases (no separate fixtures file) -- matches Phase 2 bands.test.ts convention"
  - "CD-03 No band? option exposed on CheckpointHookOptions -- the factory documents OBSERVABILITY as convention; caller registers explicitly with BAND.OBSERVABILITY anyway (D-06)"
  - "CD-04 No mint-refusal logic on missing runResolver -- the factory provides sensible step-transition defaults so mint always succeeds when signer is healthy (per D-07 best-effort, signer failures still get absorbed)"

patterns-established:
  - "Two-vocabulary bridge: a module that subscribes to HookLifecycleEvent (registration) and emits RunEventKind (observability) -- the checkpoint hook is the canonical example; future composed primitives can follow"
  - "Defensive envelope-payload introspection (extractReceiptId): base64+JSON.parse wrapped in try/catch returns undefined on malformed payload rather than throwing -- mirrors verify.ts asReceiptBody structural acceptance semantics"
  - "TDD RED-GREEN on a sibling module: vitest filter on the single new test file confirms import-resolution failure (Cannot find module) before implementation; then full suite confirms 332 baseline + N new cases"
  - "Caller-owns-context per-step shape (CheckpointHookContext): caller threads stepName/stepIndex/parentStepName/previousStepName via the HookContext payload; the handler reads them off and copies onto event metadata + receipt body without auto-incrementing or auto-threading"

requirements-completed: [LSDK-09, LSDK-10, LSDK-11, LSDK-12, LSDK-13]

duration: 4min
completed: 2026-05-24
---

# Phase 3 Plan 03-01: Lattice tracing.transition + createCheckpointHook factory Summary

**Extended Lattice's RunEventKind union with the step.transition observability literal and shipped a new contract/checkpoint.ts sibling module exposing createCheckpointHook(options) -- a factory that returns a HookHandler the caller registers on Phase 2's HookPipeline (OBSERVABILITY band by convention); the handler emits exactly one step.transition tracer event per invocation and (when a signer is configured) mints exactly one v1.1 Capability Receipt with step-marker fields populated, with signer failures absorbed via try/catch and surfaced as metadata.mintError -- all under TDD with 15/15 new vitest cases green and Lattice's full suite advancing from 332 to 347 PASS.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-24T20:14:24Z
- **Completed:** 2026-05-24T20:18:36Z
- **Tasks:** 2 (Task 1 tracing.ts one-line edit; Task 2 TDD checkpoint.ts + checkpoint.test.ts)
- **Files modified (Lattice):** 1 (tracing.ts) + 2 created (checkpoint.ts, checkpoint.test.ts)
- **Files created (FSB):** 1 (.planning/.../03-01-LATTICE-SHA.txt, .planning gitignored)
- **Lattice commits:** 2 on fsb-integration-experiments (fd254c4 + a67f476; not pushed)
- **Vitest delta:** 332 PASS -> 347 PASS (+15 new checkpoint.test.ts cases; 1 new test file)

## Accomplishments

- **tracing.ts:** RunEventKind union now contains 17 literals (was 16); `| "step.transition"` appended as the final literal in the union. RunEvent interface, RunEventSink type, and createRunEvent factory all byte-unchanged. The dotted-namespace convention is preserved.
- **checkpoint.ts:** NEW 260-line sibling module exporting createCheckpointHook(options) -> HookHandler<CheckpointHookContext>; STEP_TRANSITION_EVENT_NAME constant; DEFAULT_CHECKPOINT_BAND = BAND.OBSERVABILITY; CheckpointHookContext + CheckpointHookOptions interfaces; defensive extractReceiptId helper for envelope payload introspection. Per-invocation behavior: assemble event metadata, attempt mint inside try/catch (signer.sign failures absorbed), emit exactly one tracer event with receiptId or mintError, return void.
- **checkpoint.test.ts:** NEW 240-line test file with 15 vitest cases across 7 describe blocks: factory identity (3), tracer-only mode (4), signer mode mint+verify round-trip (2), best-effort mint signer-throws (2), 3-call linked-list threading (1), HookPipeline integration (2), tracer-absent mint-still-works (1). All cases use real signer (`createInMemorySigner` over `generateEd25519KeyPairJwk` ephemeral keypair) and real verifier (`verifyReceipt` + `createMemoryKeySet`) -- no static-text grep, no mock-only signatures.
- **Phase 2 byte-frozen surface fully preserved:** `git diff --stat 97836f2..HEAD --` against bands.ts, tripwire.ts, canonical.ts, redact.ts, receipts/{types,receipt,verify,sign,keyset,envelope}.ts, runtime/create-ai.ts, and index.ts returns EMPTY (zero modifications across all 12 byte-frozen files).
- **D-16 ceremony observed:** Both Phase 3 Lattice commits carry the `Ref: FSB v0.10.0-attempt-2 Phase 3` footer; verified via `git log 97836f2..HEAD --format="%B" | grep -c "Ref: ..."` returning 2.
- **D-17 / D-15 no-push held:** `git reflog -20 | grep -c push` returns 0 on Lattice.
- **FSB side untouched:** `git status --porcelain` shows no modifications to extension/, mcp/, tests/, or package.json. INV-01 142 PASS, INV-04 setTimeout count = 8, Phase 1 smoke 29 PASS, Phase 2 smoke 39 PASS -- all baselines preserved end-to-end.

## Task Commits

Lattice-side, on `fsb-integration-experiments` branch (not pushed; D-15/D-17):

1. **Task 1: Extend RunEventKind with "step.transition" literal (LSDK-09)** -- `fd254c4` (feat)
   - Subject: `feat(tracing): add step.transition event kind to RunEventKind`
   - Files: `packages/lattice/src/tracing/tracing.ts` (+2 / -1; one-line addition)

2. **Task 2: Create createCheckpointHook factory + tests (LSDK-10/11/12/13)** -- `a67f476` (feat)
   - Subject: `feat(contract): add createCheckpointHook factory + per-step receipt mint`
   - Files: `packages/lattice/src/contract/checkpoint.ts` (created, 260 lines) + `packages/lattice/src/contract/checkpoint.test.ts` (created, 240 lines)
   - Insertions: +500 / -0

FSB-side: no per-task commits during execution. The SUMMARY metadata commit (this file + STATE.md + ROADMAP.md updates + LATTICE-SHA.txt) lands after self-check.

## Files Created/Modified

### Lattice (committed as fd254c4 + a67f476 on fsb-integration-experiments)

- `lattice/packages/lattice/src/tracing/tracing.ts` -- RunEventKind union appended with `| "step.transition"` literal (line 28). RunEvent interface (line 30-40), RunEventSink type (line 42), and createRunEvent factory (line 44-53) all byte-unchanged.
- `lattice/packages/lattice/src/contract/checkpoint.ts` -- NEW. Exports: `createCheckpointHook(options)`, `STEP_TRANSITION_EVENT_NAME`, `DEFAULT_CHECKPOINT_BAND`, `type CheckpointHookContext`, `type CheckpointHookOptions`. Internal: `DEFAULT_MODEL`, `DEFAULT_ROUTE`, `DEFAULT_USAGE` constants, `extractReceiptId(envelope)` helper. Module JSDoc documents D-06 (band convention), D-07 (best-effort mint), D-04 step-marker stable-identifier contract, D-01 tracer-event vocabulary, D-02 vocabulary separation.
- `lattice/packages/lattice/src/contract/checkpoint.test.ts` -- NEW. 15 vitest cases across 7 describes; uses real `createInMemorySigner` + `generateEd25519KeyPairJwk` for the mint-and-verify round-trip; uses `verifyReceipt` + `createMemoryKeySet` for verification; uses a `rejectingSigner()` helper to exercise the D-07 try/catch branch.

### FSB (.planning gitignored; metadata commit lands separately)

- `.planning/phases/03-observability-step-markers-extension/03-01-LATTICE-SHA.txt` -- contains `a67f476b433704eabd75eb657af25b89dc79afda` (the new Lattice HEAD for Plan 03-02 / 03-03 reference).

## Decisions Made

All decisions match the plan's D-01..D-19 + CD-01..CD-04 verbatim. Notable execution-time choices:

- **Two Lattice commits, not one** -- D-16 suggested "feat(tracing) + feat(contract)" as separate commits ("one commit per logical surface"). Plan 03-01 says "TWO Lattice commits OR ONE combined commit -- planner's choice; both styles acceptable." Selected the two-commit form because: (a) the tracing.ts change is observable to all RunEventKind consumers and warrants its own line in `git log`, and (b) splitting respects the "minimum vertical edit" principle on tracing.ts (one literal addition, isolated).
- **TDD with vitest --run filter for the RED step** -- ran `npx vitest run src/contract/checkpoint.test.ts` directly against the package (not via the pnpm workspace filter) because the workspace filter looks at the path from repo root, not from the package. The failure mode confirmed (`Cannot find module './checkpoint.js'`) is the canonical TDD RED for a new sibling module.
- **15 vitest cases, not 12** -- the plan's behavior section enumerated 7 case groups (~12-14 individual `it()` cases). My implementation broke factory identity into 3 separate `it()` blocks (one per export) and tracer-only-mode into 4 cases (one per metadata-shape concern), landing at 15 total. Exceeds the >=12 acceptance criterion; the test count target was "342-348 total Lattice suite," and 332 + 15 = 347 falls inside that range.
- **`type CheckpointHookOptions` import dropped from test file** -- the import included `type CheckpointHookOptions` originally per the plan's literal verbatim, but it wasn't referenced anywhere in the test body. TypeScript's `noUnusedLocals` would have flagged it. Dropped the import; the type is still exported from `checkpoint.ts` and verified at compile-time via `createCheckpointHook({...})` calls in the tests (which use structural typing against the options shape).

## Deviations from Plan

None - plan executed exactly as written.

The minor adjustments noted above (two commits vs one, 15 cases vs 12, unused import drop) were all explicitly permitted by the plan's "planner's choice / both styles acceptable" or "~12-14 individual cases" language. They are not deviations from plan intent.

## Issues Encountered

- **First full-suite test attempt via `pnpm --filter lattice test packages/lattice/src/contract/checkpoint.test.ts` failed with `No test files found`.** Root cause: the workspace filter's positional path argument is relative to the package directory, not the repo root. Resolution: ran `cd packages/lattice && npx vitest run src/contract/checkpoint.test.ts` for the standalone RED-step run, and the unfiltered `pnpm --filter lattice test` for the full-suite GREEN-step run. Both worked as expected.
- **Initial verification chain (`echo "=== ... ==="` with `&&` between checks)** exited 1 because `grep -c push` on an empty match returns exit 1 (count = 0 satisfies the truth condition, but grep itself errors). Resolution: re-ran the remaining checks individually. All criteria verified.

## User Setup Required

None - no external service configuration required. Plan 03-01 is purely Lattice-internal (tracing.ts + new sibling module + tests). No FSB-side files changed; no MV3 reload needed; no environment variables to add.

## Next Phase Readiness

**Ready for Plan 03-02.** Plan 03-02 will add Lattice-side index.ts re-exports for `createCheckpointHook` + `STEP_TRANSITION_EVENT_NAME` + `DEFAULT_CHECKPOINT_BAND` + the type exports, and flip the audit-doc rows in `lattice/docs/fsb-integration-gaps.md`. Inputs Plan 03-02 needs:

- **Lattice HEAD to base on:** `a67f476b433704eabd75eb657af25b89dc79afda` (recorded in `03-01-LATTICE-SHA.txt`)
- **Surface available:** `createCheckpointHook`, `STEP_TRANSITION_EVENT_NAME`, `DEFAULT_CHECKPOINT_BAND`, `type CheckpointHookContext`, `type CheckpointHookOptions` all exported from `./contract/checkpoint.js`; ready for one-line additions in `./index.ts`
- **Lattice test baseline:** 347 PASS / 0 FAIL (must hold through Plan 03-02; index.ts re-export adds 0 new tests)

**Ready for Plan 03-03.** Plan 03-03 will land the FSB-side smoke `tests/lattice-checkpoint-smoke.test.js` (3-step sequence, parent/previous linkage, real-runtime mint + verify) and bump `.planning/LATTICE-PIN.md` for all Phase 3 Lattice commits. Inputs Plan 03-03 needs:

- **Lattice HEAD after Plan 03-02:** will be captured in `03-02-LATTICE-SHA.txt`
- **Bare-specifier import via FSB's existing `file:` dep:** ready to consume once Plan 03-02 re-exports + dist rebuild land

## Self-Check: PASSED

Files verified present:
- FOUND: lattice/packages/lattice/src/tracing/tracing.ts (step.transition literal grep count = 1)
- FOUND: lattice/packages/lattice/src/contract/checkpoint.ts (createCheckpointHook export)
- FOUND: lattice/packages/lattice/src/contract/checkpoint.test.ts (15 vitest cases)
- FOUND: .planning/phases/03-observability-step-markers-extension/03-01-LATTICE-SHA.txt (a67f476)

Commits verified present (in Lattice repo, fsb-integration-experiments):
- FOUND: fd254c4 feat(tracing): add step.transition event kind to RunEventKind
- FOUND: a67f476 feat(contract): add createCheckpointHook factory + per-step receipt mint

Byte-frozen surface verified:
- EMPTY DIFF: bands.ts, tripwire.ts, canonical.ts, redact.ts, types.ts, receipt.ts, verify.ts, sign.ts, keyset.ts, envelope.ts, create-ai.ts, index.ts (12 files vs 97836f2 baseline)

Tests verified green:
- Lattice full suite: 347 PASS / 0 FAIL (332 baseline + 15 new)
- Lattice typecheck: exit 0
- INV-01 tool-definitions-parity: 142 PASS / 0 FAIL
- INV-04 setTimeout count: 8
- Phase 1 smoke: 29 PASS / 0 FAIL
- Phase 2 smoke: 39 PASS / 0 FAIL

Ceremony verified:
- Ref footer count: 2 (both Phase 3 commits)
- Reflog push count: 0

---
*Phase: 03-observability-step-markers-extension*
*Completed: 2026-05-24*
*Lattice HEAD after Plan 03-01: a67f476b433704eabd75eb657af25b89dc79afda*
*Phase 2 baseline HEAD (byte-frozen reference): 97836f2c7759470389294b0a03a122ec89780157*
