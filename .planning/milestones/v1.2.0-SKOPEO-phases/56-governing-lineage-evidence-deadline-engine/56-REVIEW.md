---
status: changes_requested
phase: "56"
depth: standard
files_reviewed: 27
severity_counts:
  critical: 0
  warning: 1
  info: 0
  total: 1
---

# Phase 56 Code Review — Iteration 3

CR-07 and the original WR-05 failure modes are fixed: same-day order-dependent lineage is withheld, generation authority is validated during recovery, and the authority pointer is durable before retirement/garbage collection. One bounded-recovery liveness defect remains, so Phase 56 is not ready to ship.

## Fix validation

| Finding | Result | Direct evidence |
| --- | --- | --- |
| CR-07 | Verified | Events are grouped by civil-date ordinal; partials targeting either the prior governing document or that day's replacement are marked order-dependent, excluded from the accepted path, and force `review-required` (`skopeo-lineage-adjudicator.js:1715-1789`). Base-target and replacement-target permutations plus distinct-day chronology pass (`skopeo-lineage-adjudicator.test.js:1399-1495`). |
| WR-05 | Verified for the reported corruption/fault cases | Recovery reparses exact generation/control keys and hashes, validates active family/snapshot/dependency membership, withholds unmatched published controls, and rechecks remaining pointers (`skopeo-truth-store.js:2579-2765`). Generation authority is switched before family retirement and generation GC (`skopeo-truth-store.js:1991-2023`); corrupt/missing authority and before/after pointer-switch tests pass. |
| CR-01–CR-06 | No regression found | `sgx1:` handoff, non-null issued clause membership, issued calendar ID/version binding, generation-gated reads, explicit amendment-clause containment, and distinct-date governing-path selection remain closed and pass their focused tests. |
| WR-01–WR-04 | No regression found | Code-unit ordering, mutation-terminal suppression, exact original UTF-8 offsets, and schema-first deadline evaluation remain in place and pass their focused regressions. |

The 27-file count is the original Phase 56 scope. I also inspected the fix-touched `package.json` wiring and `tests/skopeo-truth-real-handoff.test.js`.

## Warning findings

### WR-06 — Bounded recovery can repeat the same valid prefix forever

**Locations:** `extension/utils/skopeo-truth-store.js:45-46`, `extension/utils/skopeo-truth-store.js:2477-2494`, `extension/utils/skopeo-truth-store.js:2584-2609`, `extension/utils/skopeo-truth-store.js:2659-2667`, `extension/background.js:759-779`, `tests/skopeo-truth-store.test.js:947-966`

`recover()` charges every valid published family control against the shared 128-step budget, but a healthy control is left unchanged. Valid generation records are likewise retained only in an in-memory map and are not classified or removed until the complete generation scan finishes. If the cap is reached, the pass returns `recovery-pending` without a durable cursor or any mutation that advances the next sorted pass, so every restart processes the same prefix.

Two read-only production-module reproductions confirmed non-convergence:

```text
healthy active generation: 127 families, publication status published
recover passes 1..3: recovery-pending, recovery-pending, recovery-pending

valid orphan generations: 129 before, 129 after
recover passes 1..3: recovery-pending, recovery-pending, recovery-pending
```

The store allows 1,024 families per source, and production publishes family snapshots before the final partition generation, so both a healthy high-cardinality generation and a crash-before-pointer family prefix are reachable. Background boot requires `recover().ok === true`; repeated `recovery-pending` prevents the truth facade from ever becoming available. Reads remain fail-closed, so this is a warning rather than a critical authority defect.

The added bounded test uses 129 malformed `{ hostile: true }` generation records. Those are deleted while scanning, so the next pass progresses and the test misses valid-record starvation.

**Suggested fix:** Make each capped pass durably monotonic for valid as well as invalid records (for example, a validated recovery cursor/checkpoint tied to the storage generation), or enforce an admitted authority size that the complete family-control/generation/pointer validation can finish within one bounded pass. Add a 127-family healthy active generation and more than 128 valid orphan generations; repeated bounded passes must reach `complete`/`repaired` with byte-idempotent final state.

## Verification

The following read-only checks passed:

- `npm run test:skopeo-truth-evals`
- `node scripts/verify-skopeo-storage-boundary.mjs`
- Drive authority, graph query/runtime/store, corpus runtime, and provider-bridge focused suites
- `node --check` for all scoped JavaScript
- JSON parsing for both truth-eval fixtures
- `git diff --check`

The deterministic truth-eval gate reports `domain_fidelity: human_needed`, as designed. Custom reproductions loaded the checked-in production modules in memory and did not modify repository files.

## REVIEW COMPLETE

- Critical: 0
- Warning: 1
- Info: 0
- Report: `.planning/milestones/v1.2.0-SKOPEO-phases/56-governing-lineage-evidence-deadline-engine/56-REVIEW.md`
