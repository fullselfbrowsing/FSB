---
phase: 58-cited-ask-decision-policy
reviewed: 2026-08-27T09:24:00Z
depth: standard
implementation_head: de53f00d9067fb1c82efa22eb5d36e51165d45b3
status: passed_after_fixes
findings_initial: 3
findings_remaining: 0
---

# Phase 58 — Code Review

## Result

**PASSED AFTER FIXES** — three critical fail-closed defects were found in the production joins, repaired atomically, and covered by regression tests. No unresolved code-review finding remains.

## Fixed Findings

### CR-01: A transient policy-store read could overwrite valid state

The mutation path treated an unavailable/malformed persisted envelope like an empty partition and could replace valid local policy state. Commit `09fbdb76` introduced a strict mutation read boundary: unavailable or malformed storage aborts without a write. Fault-injection tests assert that Document 10, classification, and acknowledgement state are preserved.

### CR-02: Configured Document 10 outside the answer scope could be misreported missing

The agreement-scoped query certificates did not authorize a separately configured policy document, even though policy identity is intentionally independent of the answer source set. Commit `018953dc` added an independent, exact, current `query` operation for the configured stable identity. Current, missing, inaccessible, and stale states are now re-derived without expanding answer evidence scope.

### CR-03: An unrelated memo could satisfy a complex-agreement safeguard

The initial live join accepted any memo record in the current source set. Commit `de53f00d` now requires a `references-memo` relation from a record version belonging to the exact current agreement to one scoped memo record. Cross-agreement, unrelated, and ambiguous multi-memo cases cannot clear the safeguard.

## Reviewed Boundaries

- Closed question, provider-candidate, answer, policy-input, and projection schemas.
- Exact-set ask preparation, bounded excerpts, configured-provider binding, local evidence adjudication, abort, and discard.
- Partitioned Document 10/classification persistence and read-before-mutate behavior.
- Background scope/action registries, independent policy-source authorization, one-shot navigation and policy effects, review acknowledgement, and revocation.
- Content composition, Focused lifecycle, cancellation, stale response withdrawal, and opaque action routing.
- Shadow rail semantics, text-only sinks, focus/live-region behavior, geometry/preferences, host coexistence, and teardown.
- Evaluation registration, storage boundary, extension validation, and full repository regressions.

## Residual Notes

The confirmation surface is structurally safe and complete. The design contract asks for exact current document/corpus labels when disclosure is authorized, while the automated fixture currently proves the generic current-document consequence. This is retained as a human visual/UAT observation in `58-UI-REVIEW.md`; it does not weaken identity or effect authorization because background re-derives both immediately before mutation.

## Approval

Code review approved at `de53f00d9067`; unresolved findings: **0**.
