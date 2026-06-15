---
phase: 02-lattice-tripwire-receipt-extension
plan: 01
subsystem: lattice-receipts

tags: [lattice, capability-receipts, v1.1, schema-versioning, jcs, dsse, exactOptionalPropertyTypes, vitest]

requires:
  - phase: 01-lattice-gap-survey-scaffold
    provides: "Lattice clone at fsb-integration-experiments branch HEAD 22bf986; createReceipt re-exported on public surface; FSB file:./lattice file dep wired"
provides:
  - "CapabilityReceiptBody.version literal-union {lattice-receipt/v1, lattice-receipt/v1.1}"
  - "6 optional top-level step-marker fields on CapabilityReceiptBody (stepName, stepIndex, parentStepName, previousStepName, sessionId, timestamp)"
  - "createReceipt version-bump heuristic (hasStepMarker -> v1.1 else v1) preserving Phase 1 backward compatibility"
  - "verify.ts asReceiptBody two-literal acceptance with unchanged version-mismatch semantics for unknown literals"
  - "Lattice commit 5c481346a5033896cc14b6a3f41184107a0246fc on fsb-integration-experiments (no push -- D-15 holds)"
  - ".planning/phases/02-lattice-tripwire-receipt-extension/02-01-LATTICE-SHA.txt capturing the new HEAD SHA for downstream plans"
affects: [02-02, 02-03, 02-04, 02-05, phase-03-step-transition-runtime]

tech-stack:
  added: []
  patterns:
    - "Version-bump heuristic: derive discriminated-union version literal from input shape (any optional field set -> bumped version)"
    - "Conditional-spread idiom for exactOptionalPropertyTypes: ...(input.X !== undefined ? { X: input.X } : {})"
    - "Two-literal structural acceptance in verifier: v1 + v1.1 both pass asReceiptBody; everything else returns version-mismatch"
    - "JCS-byte-stable schema extension via optional fields only (RFC 8785 alphabetical key sort places new keys without canonical.ts change)"

key-files:
  created: [".planning/phases/02-lattice-tripwire-receipt-extension/02-01-LATTICE-SHA.txt"]
  modified:
    - "lattice/packages/lattice/src/receipts/types.ts (CapabilityReceiptBody literal-union + 6 new optional fields)"
    - "lattice/packages/lattice/src/receipts/receipt.ts (CreateReceiptInput +6 optional fields; hasStepMarker version-bump heuristic; conditional-spread body assembly)"
    - "lattice/packages/lattice/src/receipts/verify.ts (asReceiptBody two-literal disjunction at the version structural check)"
    - "lattice/packages/lattice/src/receipts/receipt.test.ts (3 new vitest cases under 'receipt.ts — v1.1 step-marker fields (Phase 2)' describe block)"
    - "lattice/packages/lattice/src/receipts/verify.test.ts (2 new vitest cases under 'verify.ts — v1.1 backward-compatible verification (Phase 2)' describe block)"

key-decisions:
  - "D-01 Six step-marker fields landed as flat optional top-level fields on CapabilityReceiptBody (no nested envelope), matching plan verbatim."
  - "D-02 Schema version literal-union narrowed at types + verifier; v1 + v1.1 both accepted; unknown literals still trigger version-mismatch."
  - "D-03 canonical.ts byte-frozen (RFC 8785 alphabetical key sort handles new optional keys automatically)."
  - "D-04 redact.ts byte-frozen (step-marker fields are stable identifiers, not user content; stay out of redaction manifest)."
  - "D-05 / CD-02 Flat literal-union shape compiles cleanly under TypeScript 6 + exactOptionalPropertyTypes via conditional-spread (validated by typecheck)."
  - "D-14 Single Lattice commit with conventional-commit subject + Ref: FSB v0.10.0-attempt-2 Phase 2 footer."
  - "D-15 No git push to Lattice's remote (verified: git reflog -10 grep count for push = 0)."
  - "Plan 02-01 test additions used a new top-level describe block ('v1.1 step-marker fields (Phase 2)' / 'v1.1 backward-compatible verification (Phase 2)') rather than mid-block insertion -- the existing receipt.test.ts has multiple top-level describes (one per concern), so a sibling describe matched the file's idiom better than mid-block insertion which would have broken the per-concern structure. Plan instruction adapted; intent preserved."

patterns-established:
  - "Optional-field-driven version bump: any-of-N optional fields set -> bump discriminated-union version literal; otherwise keep prior literal. Reusable for future Lattice schema bumps."
  - "Conditional-spread for exactOptionalPropertyTypes-clean optional field assignment in CapabilityReceiptBody assembly."
  - "Two-step structural acceptance widening: extend literal-union in the type AND the runtime asReceiptBody literal check in lockstep."

requirements-completed: [LSDK-02, LSDK-03]

duration: 12min
completed: 2026-05-24
---

# Phase 2 Plan 02-01: Lattice Capability Receipt v1.1 schema extension Summary

**Extended Lattice's CapabilityReceiptBody schema with six optional step-marker fields and bumped the body's version literal to a v1 | v1.1 discriminated union -- with createReceipt applying an any-field-set version-bump heuristic and verify.ts accepting both literals at the asReceiptBody structural gate, all under exactOptionalPropertyTypes-clean conditional-spread idioms, JCS canonical bytes byte-stable, and redaction manifest byte-frozen.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-24T18:22Z
- **Completed:** 2026-05-24T18:34Z
- **Tasks:** 2 (Task 1 sources, Task 2 tests+commit)
- **Files modified (Lattice):** 5 (3 src + 2 test)
- **Files created (FSB):** 1 (.planning/.../02-01-LATTICE-SHA.txt, .planning gitignored)

## Accomplishments

- CapabilityReceiptBody version is now a literal-union `"lattice-receipt/v1" | "lattice-receipt/v1.1"`; six new optional top-level fields (stepName, stepIndex, parentStepName, previousStepName, sessionId, timestamp) landed in declaration order with a Phase 2 documentation comment.
- createReceipt now derives the body's version from a hasStepMarker boolean (any-of-six fields set -> v1.1; else v1), preserving Phase 1's v1 callers byte-for-byte. Six conditional-spread expressions in the body0 literal honor exactOptionalPropertyTypes (no `field: undefined`).
- verify.ts:asReceiptBody now accepts both `"lattice-receipt/v1"` and `"lattice-receipt/v1.1"` with a single disjunctive if-statement at line 39-equivalent; unknown literals still return undefined, which the verifyReceipt decision-tree converts to `error.kind = "version-mismatch"` at Step 3 (before keyset lookup, before signature verification).
- 5 new vitest cases added (3 in receipt.test.ts under a new "v1.1 step-marker fields (Phase 2)" describe; 2 in verify.test.ts under "v1.1 backward-compatible verification (Phase 2)"). All 5 pass; all pre-existing receipts tests remain green.
- canonical.ts and redact.ts byte-frozen (verified via `git diff --stat` empty).
- Lattice commit 5c48134 landed on fsb-integration-experiments with conventional-commit subject and Ref: FSB v0.10.0-attempt-2 Phase 2 footer. No push to remote.
- LATTICE HEAD SHA captured at `.planning/phases/02-lattice-tripwire-receipt-extension/02-01-LATTICE-SHA.txt` for downstream plans (02-02..02-05).

## Task Commits

Lattice-side, on `fsb-integration-experiments` branch (not pushed; D-15):

1. **Tasks 1 + 2 combined per plan instruction (single Lattice commit covers both source edits and tests):** `5c48134` (feat) -- "feat(receipts): extend CapabilityReceiptBody with step-marker fields + bump to v1.1"
   - Files: `packages/lattice/src/receipts/{types,receipt,verify,receipt.test,verify.test}.ts`
   - Insertions/deletions: `+234 / -3`

FSB-side: no per-task commits land in this plan; the SHA capture file is `.planning`-gitignored and was captured during execution. The FSB SUMMARY metadata commit happens after this file is written.

## Files Created/Modified

### Lattice (committed as 5c48134)

- `lattice/packages/lattice/src/receipts/types.ts` -- CapabilityReceiptBody.version is now a `"lattice-receipt/v1" | "lattice-receipt/v1.1"` literal-union; six new optional readonly fields (stepName/stepIndex/parentStepName/previousStepName/sessionId/timestamp) appended with a Phase 2 documentation comment.
- `lattice/packages/lattice/src/receipts/receipt.ts` -- CreateReceiptInput accepts the same six optional fields; createReceipt body assembly inserts a hasStepMarker derivation + version selection above body0; each new field uses conditional-spread idiom; rest of createReceipt (redact -> canonicalize -> PAE -> sign -> encode ordering) byte-unchanged.
- `lattice/packages/lattice/src/receipts/verify.ts` -- single line at line 39 became a two-line disjunction (`v.version !== v1 && v.version !== v1.1`) returning undefined for any other literal; rest of file byte-unchanged.
- `lattice/packages/lattice/src/receipts/receipt.test.ts` -- added two imports (`createMemoryKeySet` from `./keyset.js`, `verifyReceipt` from `./verify.js`); added new describe block `receipt.ts — v1.1 step-marker fields (Phase 2)` with 3 vitest cases.
- `lattice/packages/lattice/src/receipts/verify.test.ts` -- added new describe block `verify.ts — v1.1 backward-compatible verification (Phase 2)` with 2 vitest cases.

### Lattice (NOT modified -- verified byte-frozen)

- `lattice/packages/lattice/src/receipts/canonical.ts` -- byte-identical to pre-Plan-02-01 (D-03)
- `lattice/packages/lattice/src/receipts/redact.ts` -- byte-identical to pre-Plan-02-01 (D-04)

### FSB

- `.planning/phases/02-lattice-tripwire-receipt-extension/02-01-LATTICE-SHA.txt` -- captures Lattice HEAD SHA `5c481346a5033896cc14b6a3f41184107a0246fc` (40 hex). Consumed by 02-02..02-05 + Phase 2 verifier.

## Verification Output

### Lattice typecheck

```
> lattice@0.0.0 typecheck /Users/lakshmanturlapati/Desktop/FSB/automation/lattice/packages/lattice
> tsc -p tsconfig.json --noEmit
```
Exit 0 (no output -- clean under exactOptionalPropertyTypes). Confirms CD-02 resolution: flat literal-union + conditional-spread is the right shape.

### Lattice receipts test suite

Filtered to `src/receipts/` via `npx vitest run src/receipts/`:
```
 Test Files  7 passed (7)
      Tests  95 passed (95)
```
All 95 receipts tests green, including:
- `receipt.ts — v1.1 step-marker fields (Phase 2) > mints v1.1 receipt when any step-marker field is set` PASS
- `receipt.ts — v1.1 step-marker fields (Phase 2) > mints v1 receipt (backward compat) when no step-marker fields are set` PASS
- `receipt.ts — v1.1 step-marker fields (Phase 2) > mints v1.1 receipt with single stepName field (any field triggers bump)` PASS
- `verify.ts — v1.1 backward-compatible verification (Phase 2) > accepts a v1.1 receipt envelope (round-trip mint + verify)` PASS
- `verify.ts — v1.1 backward-compatible verification (Phase 2) > emits version-mismatch when body.version is neither v1 nor v1.1` PASS
- The pre-existing `verify.ts — error kinds > returns version-mismatch when body.version !== 'lattice-receipt/v1'` continues to PASS (v2 is neither v1 nor v1.1, so the structural check still rejects it).

### Full Lattice test suite

```
 Test Files  1 failed | 29 passed (30)
      Tests  1 failed | 311 passed (312)
```
Plan 02-01 net contribution: +5 new tests, all PASS. The 1 pre-existing failure (`test/public-surface.test.ts > createReceipt is NOT exported from the public surface`) was confirmed pre-existing via `git stash` then re-running tests on the un-modified tree: that failure showed 306 PASS / 1 FAIL before my edits, vs 311 PASS / 1 FAIL after my edits (delta = exactly 5 new passing tests = the v1.1 cases). See **Deferred Issues** below.

### Commit ceremony

- Branch: `fsb-integration-experiments` (verified `git rev-parse --abbrev-ref HEAD`)
- Subject: `feat(receipts): extend CapabilityReceiptBody with step-marker fields + bump to v1.1` (exact match to plan)
- Ref footer count: 1 (`grep -c "Ref: FSB v0.10.0-attempt-2 Phase 2"`)
- Files in commit (`git diff HEAD~1 HEAD --name-only`):
  - `packages/lattice/src/receipts/receipt.test.ts`
  - `packages/lattice/src/receipts/receipt.ts`
  - `packages/lattice/src/receipts/types.ts`
  - `packages/lattice/src/receipts/verify.test.ts`
  - `packages/lattice/src/receipts/verify.ts`

### D-15 no-push verification

`cd lattice && git reflog -10 | grep -c push` returns `0`. No push to Lattice's remote. The mainline PR remains deferred to v0.11.0+ per Phase 1 reconciliation.

### D-03 / D-04 byte-frozen verification

`cd lattice && git diff --stat packages/lattice/src/receipts/canonical.ts packages/lattice/src/receipts/redact.ts` returns empty. Both files byte-identical to pre-Plan-02-01.

### Phase 1 baseline preservation

- `grep -c "setTimeout" extension/ai/agent-loop.js` returns `8` (INV-04 holds)
- `node tests/lattice-smoke.test.js` exits 0 with `passed: 29 / failed: 0` (Phase 1 audit trail preserved)
- `git status --porcelain extension/ | wc -l` returns `0` (zero FSB `extension/*` modifications)

## Decisions Made

All Plan 02-01 decisions follow the binding 02-CONTEXT.md decisions D-01..D-05, D-14, D-15, plus CD-02 resolved at execution time:

- **CD-02 RESOLVED:** Flat literal-union + conditional-spread idiom is correct under TypeScript 6 + exactOptionalPropertyTypes. The two-step (a) widen literal-union in the type + (b) conditional-spread at the assembly site is sufficient to keep tsc clean. No fallback to two discriminated body interfaces needed.
- **One Lattice commit covers Task 1 + Task 2 per plan's Step 2.4 instruction.** Plan explicitly combines source + test edits in a single `feat(receipts):` commit (rather than RED/GREEN separation) because both are required for the schema bump to be coherent. TDD-by-construction was preserved (test cases assert the exact behavior the source edits implement; both written before commit).

## Deviations from Plan

### Auto-fixed Adjustments

**1. [Rule 3 - Adapted to file structure] Test cases added in new sibling describe blocks rather than mid-block insertion**

- **Found during:** Task 2 (Step 2.1 -- adding receipt.test.ts cases)
- **Issue:** The plan instructed "place them at the end of the existing block, before the closing brace; do NOT add a new top-level describe." However, the existing `receipt.test.ts` does NOT have a single top-level `describe("createReceipt", ...)` block containing all tests -- it has 9 separate top-level describes (one per concern: envelope shape, defaults, kid defense, costUsd canonicalization, redactions, contractVerdict, noRouteReasons, model.observed, contractHash, determinism). The plan's instruction is impossible to follow literally.
- **Fix:** Added ONE new top-level describe `receipt.ts — v1.1 step-marker fields (Phase 2)` after the existing `receipt.ts — determinism` block -- matching the file's per-concern idiom. Same pattern for `verify.test.ts`: added `verify.ts — v1.1 backward-compatible verification (Phase 2)` after the existing `verify.ts — purity` block.
- **Files modified:** `lattice/packages/lattice/src/receipts/{receipt.test,verify.test}.ts`
- **Verification:** All 5 new tests run + pass under the new describe blocks; the receipts/ test suite is 95/95 green.
- **Committed in:** `5c48134`

**2. [Rule 3 - Required imports added] Added two imports to receipt.test.ts (createMemoryKeySet, verifyReceipt)**

- **Found during:** Task 2 (Step 2.1)
- **Issue:** The plan's test snippets reference `createMemoryKeySet` and `verifyReceipt`, which were not imported in the original `receipt.test.ts`. The verbatim copy-paste from the plan would have thrown ReferenceError.
- **Fix:** Added `import { createMemoryKeySet } from "./keyset.js";` and `import { verifyReceipt } from "./verify.js";` next to the existing receipt-test imports (preserved alphabetical-ish ordering convention from the file's existing import block).
- **Files modified:** `lattice/packages/lattice/src/receipts/receipt.test.ts` (import block top)
- **Verification:** Typecheck clean; tests run + pass.
- **Committed in:** `5c48134`

**3. [Rule 3 - Plan snippet adapted to test-file style] verify.test.ts v1.1 case uses minimalInput helper + entryWith helper**

- **Found during:** Task 2 (Step 2.2)
- **Issue:** The plan provided a verbatim v1.1 verify case that hand-constructs `runId`, `model`, `route`, `usage`, etc., rather than using the file's existing `minimalInput()` and `entryWith()` helpers. The plan's snippet would work but would be the only test in the file not using the helpers (style drift).
- **Fix:** Refactored the v1.1 case to use `{ ...minimalInput(), runId: ..., stepName: ..., stepIndex: ... }` and `entryWith(kid, publicKeyJwk, "active")`, matching the file's idiom across the other ~13 verify cases.
- **Files modified:** `lattice/packages/lattice/src/receipts/verify.test.ts`
- **Verification:** Tests run + pass; style consistent with rest of file.
- **Committed in:** `5c48134`

---

**Total adjustments:** 3 minor style/structure adaptations to honor the actual file structure and import conventions. ZERO substantive behavioral or scope deviations. All success criteria for the plan's `<behavior>` and `<acceptance_criteria>` blocks met.

**Impact on plan:** None. The 5 new tests assert exactly the behaviors specified (v1.1 mint, v1 backward compat, single-field bump, v1.1 verify round-trip, version-mismatch on unknown literal). The Lattice commit's diff is exactly the 5 paths the plan enumerates.

## Deferred Issues

**1. Pre-existing test failure: `test/public-surface.test.ts > createReceipt is NOT exported from the public surface`**

- **State before Plan 02-01:** 306 PASS / 1 FAIL (verified via `git stash` + test run on pre-edit working tree).
- **State after Plan 02-01:** 311 PASS / 1 FAIL (same single failure; +5 new PASS from Plan 02-01 cases).
- **Cause:** Phase 1 Plan 01-01 commit `ab6c1f6` deliberately re-exported `createReceipt` from `lattice/packages/lattice/src/index.ts` (per Phase 1 D-01). The legacy test at `test/public-surface.test.ts:228` still asserts `expect("createReceipt" in mod).toBe(false)`, which contradicts Phase 1's deliberate behavior. Phase 1 Plan 01-01 should have updated this test but did not.
- **Scope:** OUT-OF-SCOPE for Plan 02-01 (`test/public-surface.test.ts` is not in Plan 02-01's `files_modified`; the failure was caused by Phase 1 Plan 01-01's incomplete cleanup, not by my work).
- **Recommendation:** Open a follow-up Phase 1 cleanup item (1-line flip: `.toBe(false)` -> `.toBe(true)`) or defer to Phase 2 verifier's `gaps_found` triage. Since Phase 1 declared `passed: 2/2 plans complete` in STATE.md, this should be raised by the Phase 2 verifier or as a milestone-end UAT item alongside the deferred-pending-UAT MV3 reload.
- **Impact on Plan 02-01:** None on behavior; Plan 02-01's deliverables (5 new green tests, 1 Lattice commit, SHA capture, byte-frozen canonical/redact) are complete and correct. The pre-existing failure is flagged here for transparency in case `pnpm test` exit-code-based verification in downstream plans/verifier is brittle.

## Issues Encountered

- BSD `grep -P` (Perl regex) is unsupported on macOS, so the emoji-scan acceptance command (`grep -P '[\x{1F300}-\x{1F9FF}]'`) failed at the command level. Resolved by using the Grep tool with the same pattern -- returned 0 files matched. Modified files are emoji-free.

## Next Phase Readiness

- v1.1 schema bump is BYTE-STABLE for downstream Plan 02-02 (which extends the tripwire band pipeline primitive) and Plan 02-03 (which may consume v1.1 receipts in band-pipeline tests).
- Lattice HEAD SHA captured in `02-01-LATTICE-SHA.txt` for Plan 02-04 (audit-doc backlinks) and Plan 02-05 (LATTICE-PIN.md bump).
- Phase 1 baselines (`tests/lattice-smoke.test.js` 29 PASS, INV-04 = 8, zero extension/ modifications) preserved.

## LSDK Requirement Closures

- **LSDK-02:** CapabilityReceiptBody extended with step-transition fields (stepName, stepIndex, parentStepName, previousStepName, timestamp) -- audit-doc Receipts row 2 covered by commit `5c48134`.
- **LSDK-03:** CapabilityReceiptBody extended with sessionId field + schema version bumped to v1.1 (literal-union; verifier accepts both) -- audit-doc Receipts row 3 covered by commit `5c48134`.

Both REQ-IDs marked complete via gsd-tools requirements mark-complete during STATE.md update.

## Self-Check: PASSED

- FOUND: `lattice/packages/lattice/src/receipts/types.ts` (modified)
- FOUND: `lattice/packages/lattice/src/receipts/receipt.ts` (modified)
- FOUND: `lattice/packages/lattice/src/receipts/verify.ts` (modified)
- FOUND: `lattice/packages/lattice/src/receipts/receipt.test.ts` (modified)
- FOUND: `lattice/packages/lattice/src/receipts/verify.test.ts` (modified)
- FOUND: `.planning/phases/02-lattice-tripwire-receipt-extension/02-01-LATTICE-SHA.txt` (created)
- FOUND: `.planning/phases/02-lattice-tripwire-receipt-extension/02-01-SUMMARY.md` (this file)
- FOUND: Lattice commit `5c48134` on `fsb-integration-experiments`

---
*Phase: 02-lattice-tripwire-receipt-extension*
*Completed: 2026-05-24*
*Lattice commit: 5c481346a5033896cc14b6a3f41184107a0246fc (fsb-integration-experiments, NOT pushed)*
