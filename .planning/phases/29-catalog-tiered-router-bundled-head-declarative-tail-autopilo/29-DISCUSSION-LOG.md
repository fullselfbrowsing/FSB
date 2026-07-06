# Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-06-21
**Phase:** 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
**Mode:** assumptions
**Calibration:** standard (no USER-PROFILE.md, no vendor_philosophy set)
**Areas analyzed:** Router & Catalog Modules; Tier Scope (ship-vs-seam); Bundled Head; Autopilot Parity

## Assumptions Presented

### Router & Catalog Modules (CAT-01, CAT-05)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Two NEW SW modules `capability-router.js` + `capability-catalog.js`, dual-export IIFE, both join `RECIPE_PATH_ALLOWLIST`, eval-free; router returns `{success,…,tier}` or dual-field typed-error fall-through reason | Confident | `research/ARCHITECTURE.md:92-93,195-207`; `SUMMARY.md:108`; IIFE+allowlist pattern `capability-search.js:236`, CI guard `verify-recipe-path-guard.mjs:269-302`; typed passthrough `mcp/src/errors.ts:137` |
| The routerless invoke handler (`mcp-tool-dispatcher.js:2198-2221`) is rewired so its body becomes the router's T1b tier; handler calls the router. Additive (route table + wire names unchanged → INV-01 hash frozen) | Confident | dispatcher `:2198-2221`, route table `:84-112`; `tests/tool-definitions-parity.test.js`, `tests/capability-mcp-surface.test.js` stay green |

### Tier Scope — ship REAL vs typed seam (CAT-01, CAT-05)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| T1a + T1b ship REAL; T0 = thin declarative special-case; T2 (learned) + T3 (DOM fallback) are typed-fall-through seams (no executeTool, no learning yet) | Likely (T1a/T1b Confident; T0/T2/T3 line was the decision) | learned=Phase 31 `ROADMAP.md:105-114`; self-healing=Phase 32 `:116-124`; CAT-05 needs only a typed reason `:87`; "don't over-engineer the router in v1" `SUMMARY.md:170` |

### Bundled Head (CAT-02)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| 5–10 imperative handler modules under NEW `catalog/handlers/*.js`; handler = reviewed code in bundle, recipe = pure JSON; handlers still call `executeBoundSpec` | Likely (location/split research-backed; service list + dir was the decision) | `research/ARCHITECTURE.md:179,207,221`, `SUMMARY.md:108`, `FEATURES.md:190`; `catalog/` today = recipes/ + descriptors/ only |

### Autopilot Parity (CAT-04, INV-02, INV-04)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| NEW `tool-executor.js` branch mirroring the `trigger` branch (`:402-423`) hitting the SAME `FsbCapabilityRouter` SW-global; NOT via `TOOL_REGISTRY`; `agent-loop.js` iterator untouched (INV-04) | Likely (shared-router + iterator-untouched Confident; exact hook point was the decision) | trigger precedent `tool-executor.js:402-423,55-82`; Anti-Pattern 1 `ARCHITECTURE.md:338-341`; `getPublicTools` bloat `agent-loop.js:673-678`; iterator `:2725/2794/2804` |

## Corrections Made

No corrections — all four recommended defaults confirmed by the user.

## Decisions Confirmed (4 questions)

1. **Tier scope** → Recommended: T1a + T1b real; T0 = thin declarative special-case; T2 + T3 = typed-fall-through seams only (real learning=Phase 31, self-healing=Phase 32).
2. **Bundled-head handler location** → Recommended: `catalog/handlers/*.js` (research-backed code/data split, separate review + packaging path).
3. **Autopilot parity hook point** → Recommended: a new branch in `tool-executor.js`, mirroring the existing `trigger` branch (`:402-423`), hitting the shared router SW-global.
4. **Bundled-head service selection** → Let the planner/research pick the 5–10 against selection criteria (high-value, auth-bearing, stable API, clean single-origin, GitHub seeds it); capture criteria, not a fixed list.

## External Research

None performed — the analyzer flagged zero external-research gaps. The Phase-29 tiered-router / catalog / bundled-head / autopilot-parity design is fully specified in `.planning/research/ARCHITECTURE.md` (Decision C tier table :152-179, routing pseudocode :164-177, Pattern 2 two-front-doors :249-253, structure :185-216, Anti-Pattern 1 :338-341) and `.planning/research/SUMMARY.md:106-111`; every integration seam is verified in on-disk source on `automation-worktree`.
