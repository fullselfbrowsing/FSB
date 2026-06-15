# Phase 5: MV3-survivability + bundler + hybrid offscreen - Discussion Log (Assumptions Mode)

> Audit trail only.

**Date:** 2026-05-24
**Phase:** 05-mv3-survivability-bundler
**Mode:** assumptions (autonomous + user-confirmed path choice)

## User Decision Point

After Phase 4 closure, user was presented with 3 options for Phase 5:
1. Hybrid offscreen (analyzer-recommended) -- chosen
2. Full Option A as originally framed (SW migration)
3. Lattice-side contract only; defer FSB integration

User selected **Option 1 (Hybrid offscreen)**.

## Assumptions Presented

### Bundler choice + integration
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| esbuild + per-entrypoint bundles + extension/dist/ output | Likely | FSB has no current bundler; Lattice uses tsdown family; esbuild single-binary + npm-resolvable + MV3-friendly; per-entrypoint mandated by Chrome MV3 manifest (5+ entrypoints) |
| External sourcemaps for SW/sidepanel/offscreen; inline disabled for content scripts | Likely | DevTools honors external; content script injection payload size matters |

### SW migration strategy
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Hybrid offscreen path; SW stays classic; offscreen page hosts Lattice; SW <-> offscreen message bus | Unclear (analyzer's primary recommendation; user confirmed) | 153 importScripts load-order-sensitive; existing offscreen permission + stt.html infrastructure; matches Phase 1 Option B reconciliation but adds bundler |
| Feature flag FSB_LATTICE_RUNTIME_ADAPTER_ENABLED default-off | Confident | INV-01/03/04 protection requires byte-frozen prod paths during milestone |

### MV3-survivability adapter contract design
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New Lattice module `runtime/survivability.ts`; interface + thin noop ref impl | Likely | Audit-doc Blocker rows 65 + 72 declare interface need; sibling-module pattern matches Phases 2-4; INV-06 mandates contract lives in Lattice |
| Public re-exports + audit-doc closure + LATTICE-PIN bump | Confident | Pattern parity with Phases 2-4 closure |

### FSB-side adapter scope
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Standalone adapter; does NOT modify agent-loop.js; CONSERVATIVE recovery deferred | Unclear (analyzer flagged Phase 5 carryforward decision) | INV-04 protection paramount; attempt-1 archive shows recovery is its own 300-500 LOC scope |
| In-extension consumption via offscreen-doc; SW posts messages | Unclear (offscreen lifecycle vs SW lifecycle interplay) | Existing offscreen stt.html proof; web-platform supports <script type="module"> in offscreen pages |

### Plan decomposition
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| 6 plans across 4 waves with parallel-safe W1 | Likely | Mirrors Phase 2-4 cadence; atomic decomposition for reversibility |
| Phase 1-4 baseline byte-frozen | Confident | Pattern verified at every prior phase verification |

## Corrections Made

User confirmed analyzer's recommended Hybrid Offscreen path explicitly. The CONTEXT.md reflects this as the locked decision. Original Option A "full SW migration" is now DEFERRED (was previously Phase 1 Option B reconciliation; Phase 5 carries the same deferral forward).

## Auto-Resolved

5 external research items deferred to plan-phase researcher:
1. esbuild MV3 / SW idioms
2. importScripts ESM-migration tooling (for the deferred SW migration, not Phase 5)
3. Chrome offscreen-document lifecycle vs SW lifecycle
4. Chrome MV3 module-SW manifest semantics in 2026
5. Lattice's SurvivabilityAdapter contract precedent

## Phase Boundary Anchor

4 deliverables ship in Phase 5:
1. Lattice MV3-survivability adapter CONTRACT
2. Bundler infrastructure (behavior-free)
3. Hybrid offscreen Lattice host
4. FSB-side standalone runtime adapter (feature-flag gated)

CONSERVATIVE recovery wiring + SW classic-to-module migration + autopilot integration are EXPLICIT carryforwards / out-of-scope.

## Question/Answer Statistics

- Areas analyzed: 5
- Assumptions surfaced: 9
- Confident: 3
- Likely: 4
- Unclear: 2 (user confirmed Hybrid Offscreen via AskUserQuestion)
- Human interactions: 1 (path choice AskUserQuestion -- Hybrid Offscreen confirmed)
- External research items flagged for plan-phase: 5
- Scope creep redirects: 1 (CONSERVATIVE recovery wiring explicitly deferred)
