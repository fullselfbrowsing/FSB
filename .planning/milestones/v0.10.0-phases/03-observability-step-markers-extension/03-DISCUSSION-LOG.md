# Phase 3: Observability + step-markers extension - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-24
**Phase:** 03-observability-step-markers-extension
**Mode:** assumptions (autonomous -- user directive)
**Areas analyzed:** step.transition event placement, createCheckpointHook factory shape, per-step receipt mint semantics, FSB-side smoke shape

## Assumptions Presented

### step.transition event placement
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `"step.transition"` lands in `RunEventKind` literal union at `tracing.ts:11-27`; `HookLifecycleEvent` at `bands.ts:33-37` untouched | Confident | Dotted-namespace convention pattern (`run.start`, `stage.start`, `provider.attempt`, `tool.call`); Phase 2 D-12 rationale ("two separate vocabularies"); audit doc row 80-83 framing the gap as a missing tracer event kind |

### createCheckpointHook factory shape + location
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New sibling module `lattice/packages/lattice/src/contract/checkpoint.ts`; factory returns a handler (no auto-register; no global mutation) | Confident | Phase 2 sibling-module pattern (`bands.ts` next to `tripwire.ts`); factory-returns-handler matches Phase 2's `createHookPipeline()`; attempt-1 reference at `02-state-inspectability-carve-out/02-02-PLAN.md:242-326` |

### Per-step receipt mint semantics
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Best-effort mint per step transition + always emit tracer event; receipts thread via `previousStepName` + `parentStepName` linked-list fields (Phase 2 v1.1 schema); ride in receipt body NOT external array | Confident | Phase 2's `hasStepMarker` heuristic at `receipt.ts:88-94` auto-bumps to v1.1; audit doc row 82 "envelope IS the receipt"; `maybeIssueReceipt` graceful-degradation pattern at `create-ai.ts:956-992`; tests/lattice-tripwire-smoke.test.js:101-108 already proves field round-trip |

### FSB-side smoke shape
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New file `tests/lattice-checkpoint-smoke.test.js` (NOT extending tripwire smoke; preserves Phase 2 byte-frozen baseline); 3-step fake sequence exercising previous + parent threading | Likely | Phase 2 D-13 byte-frozen-prior convention; 3 steps = minimum count for both linkage types; append-to-test-chain pattern proven by Phases 1+2 at `package.json:16` |

## Corrections Made

No human corrections -- autonomous mode per user directive.

## Auto-Resolved

No Unclear items surfaced; all 4 assumptions are Confident or Likely. No auto-resolution needed.

## External Research Flagged

None. Codebase + Phase 2 outputs supply sufficient evidence for every assumption.

## Phase Boundary Anchor

Observability tracer event + checkpoint hook factory + per-step receipt mint only. Sidepanel UI consumption, `runtime/create-ai.ts` auto-wiring, and MV3-survivable encoding are explicit deferrals (Phase 4-5+).

## Question/Answer Statistics

- Areas analyzed: 4
- Assumptions surfaced: 4
- Confident: 3
- Likely: 1
- Unclear: 0
- Human interactions: 0 (autonomous)
- External research items flagged: 0
- Scope creep redirects: 0
