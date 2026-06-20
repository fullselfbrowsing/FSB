# Phase 14: Trigger Survivability Foundation - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in `14-CONTEXT.md` -- this log preserves the analysis.

**Date:** 2026-06-15
**Phase:** 14-trigger-survivability-foundation
**Mode:** assumptions
**Calibration:** standard
**Areas analyzed:** Storage schema & registry, Alarm topology, Module decomposition, SW-wake reconcile, Default TTL & reap

## Assumptions Presented

### Storage schema + storage area / key namespace
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Single versioned-envelope key `fsbTriggerRegistry` in `chrome.storage.session` (`{v:1,records:{[id]:snapshot}}`), cloning `mcp-task-store.js`; flat-scalar snapshot fields | Confident | `extension/utils/mcp-task-store.js:51-194` (envelope, empty-removes-key `:97-120`, `hydrate()` `:173-175`, dual-export `:179-194`); `agent-registry.js:47-48,852` (cap-area split precedent); `manifest.json:10` (`storage.session` permissioned) |

### Alarm topology: one-per-trigger vs shared sweep
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| One `chrome.alarms` alarm per trigger, name `fsbTrigger:<id>`, dispatched by `startsWith` -- mirroring `mcpVisualDeath:<tabId>`; no shared sweep | Confident | `mcp-visual-session-lifecycle.js:97-101,399` (per-entity alarm name + create); `background.js:13284-13301` (multi-alarm `onAlarm` fan-out); 30s floor `mcp-visual-session-lifecycle.js:64-67` |

### Module decomposition
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Two new modules only (`trigger-store.js` + `trigger-lifecycle.js`); `trigger-manager.js` + cap deferred to Phase 15; `background.js` gets 3 glue points; INV-04 iterator untouched | Confident | `ARCHITECTURE.md` Build Sequence step 1 vs 2; `SUMMARY.md` Phase 1 vs 2; `ROADMAP.md:41-51` (cap = Phase 15 criterion 5); dual-export pattern `mcp-task-store.js:179-194`, `mcp-visual-session-lifecycle.js:632-648` |

### SW-wake reconcile algorithm
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `restoreTriggersFromStorage()`: hydrate + two-way reconcile vs `chrome.alarms.getAll()` (re-arm non-elapsed armed with original schedule, drop fired/expired, clear orphan alarms); `handleTriggerAlarm` re-reads storage + no-ops if missing/fired | Likely | `mcp-visual-session-lifecycle.js:564-628` (restore/re-arm-original-deadline), `:494-539` (idempotent handler `noop_no_entry`); `chrome.alarms.getAll` used nowhere in SW today (grep empty -> orphan sweep is new); `background.js:2492-2498`, `:13291-13301`, `:13169-13176` (insertion points) |

### Default TTL + reap
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Absolute `deadline_at = armed_at + TTL`; reaped on alarm tick / wake-elapsed / `tabs.onRemoved`; TTL mechanism ships now, default value a flagged constant `FSB_TRIGGER_DEFAULT_TTL_MS` (~6h recommended) | Unclear (mechanism Confident; value unsettled) | tab-close clone `mcp-visual-session-lifecycle.js:464-466`; tick/wake reap `:528-531`, `:613-617`; TTL value deferred per `SUMMARY.md:169`, `PITFALLS.md:263`; visual 60s TTL `:79` is a sliding window (wrong semantics for a standing watch) |

## Corrections Made

No corrections -- all five assumptions confirmed as-is (user selected "Yes, proceed"). The two items with genuine alternatives were accepted at their recommended option: SW-wake reconcile = explicit `chrome.alarms.getAll()` orphan sweep (D-08); TTL = build mechanism now with a flagged `~6h` default constant for planning to finalize (D-11).

## External Research

None performed -- the analyzer flagged no codebase-insufficient topics. The milestone-level research (Chrome MV3 SW lifecycle, 30s alarm floor, `chrome.alarms` eviction survival, `chrome.storage.session` semantics) already covers the externals, and every Phase-14 pattern is grounded in shipping in-tree code.

**Internal note surfaced for planning:** the Lattice `SurvivabilityAdapter` is explicitly NOT used for triggers (`ARCHITECTURE.md`) -- Phase 14 uses `chrome.storage.session` directly.
