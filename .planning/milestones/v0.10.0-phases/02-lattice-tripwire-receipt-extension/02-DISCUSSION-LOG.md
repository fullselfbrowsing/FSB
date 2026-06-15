# Phase 2: Lattice tripwire + receipt primitives extension - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-05-24
**Phase:** 02-lattice-tripwire-receipt-extension
**Mode:** assumptions (autonomous -- user directive: "continue all phases with GSD autonomous; UAT will be at the end")
**Areas analyzed:** Receipt-shape extensions, Tripwire band primitive + lifecycle event placement, FSB smoke + cross-cutting integration, REQ-ID population + traceability

## Assumptions Presented

### Receipt-shape extensions (schema versioning + canonical/redact compatibility)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New fields land as optional top-level fields on `CapabilityReceiptBody`; bump version literal `lattice-receipt/v1` -> `lattice-receipt/v1.1` (NOT `extensions` envelope) | Likely | `types.ts:42-59` flat record; `verify.ts:36-52,99-103` per-field shape check with `version-mismatch` literal; `canonical.ts:49-59` RFC 8785 alphabetical key sort proven by `canonical.test.ts:104-137`; audit doc `lattice/docs/fsb-integration-gaps.md:22-23` "on the receipt body" language; ROADMAP Phase 2 scope says "decision in discuss-phase" |
| New step-marker fields stay OUT of the redaction manifest -- they're observability metadata, not PII | Confident | `redact.ts:38-72` only redacts `tripwireEvidence.kind === "no-pii"`; attempt-1 HOOK_TIMEOUT shape `{event, band, budgetMs, sessionId, handlerIndex, elapsedMs}` enumerates "no user data"; audit doc treats step markers as inspector envelope content |

### Tripwire band primitive + lifecycle event placement
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Band pipeline ships as NEW module `lattice/packages/lattice/src/contract/bands.ts`; existing `evaluateTripwires` NOT modified | Likely | `tripwire.ts:39-42,53-86` purity invariant (no I/O, no Date.now, no random) -- band ordering + Promise.race + freeze state machine would break this; audit doc lists items as `Needs addition` not `Needs extension`; Lattice's flat per-module export pattern accommodates new file |
| Lifecycle event vocabulary is a SEPARATE typed union (`HookLifecycleEvent`) co-located in `bands.ts`; NOT merged into `RunEventKind` at `tracing.ts:11-27` | Likely | Phase 2 prompt explicitly distinguishes lifecycle events from observability/step-markers (Phase 3 OUT OF SCOPE); audit doc separates `step.transition event kind` from band system rows; attempt-1 separated LIFECYCLE_EVENTS (hook pipeline) from STEP_TRANSITION (carve-out phase); naming convention split would force `createRunEvent` to handle polymorphism |

### FSB smoke shape + Phase 2 cross-cutting integration
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Phase 2 smoke is NEW file `tests/lattice-tripwire-smoke.test.js`, NOT a mod of Phase 1's smoke; appended to `scripts.test` chain | Confident | Phase 1's smoke locked-in 29 PASS state (`01-VERIFICATION.md:33`); Truth #6 anchors "mints AND verifies one Capability Receipt round-trip" on existing smoke; ROADMAP Phase 2 lists this file name first |
| Audit-doc row flips bundled IN the Lattice commit that ships the corresponding code; one commit per logical surface; `Ref: FSB v0.10.0-attempt-2 Phase 2` footer; no push | Confident | D-14 verified at `01-VERIFICATION.md:36`; D-15 verified at `01-VERIFICATION.md:37` (reflog grep returns 0); all 3 Phase 1 Lattice commits followed this; audit doc `lattice/docs/fsb-integration-gaps.md:89-91` requires atomic doc-flip-with-code |

### REQ-ID population + LSDK traceability
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Phase 2 populates LSDK REQ-IDs at audit-doc row granularity; ~15 estimated (7 receipt + 8 tripwire); sub-IDs only when one row has multiple verifiable behaviors | Unclear | `REQUIREMENTS.md:43-47` LSDK-NN..M slots reserved TBD; `01-CONTEXT.md:167` deferred LSDK/FINT REQ-ID population to Phase 2 setup; granularity rule comes from audit-doc row count |

## Corrections Made

No human corrections -- autonomous mode per user directive ("continue all phases with GSD autonomous; UAT will be at the end").

## Auto-Resolved

- **REQ-ID granularity (Unclear)** -- auto-resolved with audit-doc row granularity rule + sub-IDs only when a row has multiple distinct verifiable behaviors. Estimated count consolidated DOWN to 7-10 (from analyzer's 15 estimate) to avoid over-granularity. Concrete REQ-ID count + numbering is left to the planner during plan-phase (CD-05).

## External Research Flagged (deferred to plan-phase researcher)

- **TS discriminated-union pattern for receipt version bump.** Flat literal-union with optional fields (preferred default per D-05) vs two separate body interfaces narrowed by `body.version`. Researcher confirms compatibility with Lattice's `exactOptionalPropertyTypes` (per `lattice/AGENTS.md:32`). If flat union doesn't compile cleanly, fallback to two interfaces.
- **Race-with-log budget cancellation semantics.** No-abort `Promise.race` (preferred default per D-09 + matches attempt-1) vs `AbortSignal.timeout()` actual cancellation. Researcher resolves; preference is no-abort for simpler test ergonomics.

## Phase Boundary Anchor

Receipt extensions (D-01..D-05) + tripwire band primitive (D-06..D-12) only. Observability/step-markers (STEP_TRANSITION event, checkpoint-hook factory, per-step receipt mint) is **Phase 3**. Any task that drifts toward emitting STEP_TRANSITION events or shipping a `checkpoint-hook.js` factory is scope creep -- redirect to Phase 3 backlog.

## Question/Answer Statistics

- Areas analyzed: 4
- Assumptions surfaced: 7
- Confident: 4
- Likely: 2
- Unclear: 1 (auto-resolved with recommended default)
- Human interactions: 0 (autonomous mode)
- External research items flagged for plan-phase: 2 (CD-01 race-with-log abort, CD-02 TS discriminated-union)
- Scope creep redirects: 0 (analyzer kept rigorously to Receipts + Tripwires/Hooks)
