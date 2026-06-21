---
phase: 29
slug: catalog-tiered-router-bundled-head-declarative-tail-autopilo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `29-RESEARCH.md` §Validation Architecture. Per-task rows are filled by the planner once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Zero-framework FSB convention — `node tests/<name>.test.js`, module-level `passed/failed` counters, `check(cond,msg)`, `process.exit(failed>0?1:0)`. No jest/mocha/vitest. |
| **Config file** | none — tests are plain Node scripts appended to the root `package.json` `scripts.test` `&&` chain |
| **Quick run command** | `node tests/capability-router.test.js` |
| **Full suite command** | `npm test` (long `&&` chain; includes `npm --prefix mcp run build` mid-chain, required before the MCP-surface test) |
| **Estimated runtime** | quick ~1s · full suite ~minutes (mcp build dominates) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/capability-router.test.js`
- **After every plan wave:** Run `node tests/capability-router.test.js && node tests/capability-autopilot-parity.test.js && npm --prefix mcp run build && node tests/capability-mcp-surface.test.js && node scripts/verify-recipe-path-guard.mjs`
- **Before `/gsd:verify-work`:** Full `npm test` must be green
- **Max feedback latency:** ~1 second (quick core test, no build)

---

## Per-Task Verification Map

> Task IDs are `TBD` until the planner emits PLAN.md files; rows are keyed by requirement and carried into per-task rows during planning.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | CAT-01 | — | Router selects correct tier in T0→T1a→T1b→T2→T3 order, origin-biased | unit | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-01 | — | Origin bias: recipe matching owned-tab origin is selected over generic | unit | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-02 | T-credential-replay | Head slug routes to its `tier:'T1a'` handler; handler calls `executeBoundSpec` with correct origin | unit (mock `executeBoundSpec`) | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-02 | T-credential-replay | Origin-pin on T1a path: handler spec.origin ≠ active tab → `RECIPE_ORIGIN_MISMATCH`, no side effect | unit (mock `chrome.tabs.get`) | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-03 | — | T1b recipe routes through lifted `interpretRecipe`→`executeBoundSpec`; normalized shape with `tier:'T1b'` | unit (in-memory catalog + mock fetch) | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-04 | T-parallel-stack | One engine, two front doors: dispatcher handler AND autopilot branch both call `globalThis.FsbCapabilityRouter.invoke`; same slug+args → identical shape | unit (spy global) | `node tests/capability-autopilot-parity.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-04 | — | Capability tools NOT in `TOOL_REGISTRY`; `getPublicTools()` does not list them (Anti-Pattern 1) | unit | `node tests/capability-autopilot-parity.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-05 | — | Unknown slug → `RECIPE_NOT_FOUND`; T2 → `RECIPE_LEARN_PENDING`; T3 → `RECIPE_DOM_FALLBACK_PENDING`; all match `/^RECIPE_.+$/`, surface verbatim via `mapFSBError` | unit | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | CAT-05 | — | T3 seam returns a reason and does NOT call `executeTool()`/`chrome.scripting` (no DOM execution this phase) | unit (spy never-called) | `node tests/capability-router.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | INV-01 | — | Frozen non-trigger registry hash unchanged after the reroute; 2 tools on the wire | unit | `node tests/capability-mcp-surface.test.js` (EXISTS — stays green) | ✅ | ⬜ pending |
| TBD | — | 0 | INV-04 | — | `agent-loop.js` `setTimeout` iterator region bytes unchanged | guard | lightweight byte/region guard test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/capability-router.test.js` — covers CAT-01, CAT-02, CAT-03, CAT-05 (tier order, origin bias, origin-pin via the existing `capability-fetch.test.js` chrome-stub pattern, typed reasons, T3-no-exec). Highest-value new test.
- [ ] `tests/capability-autopilot-parity.test.js` — covers CAT-04 (both front doors call the same global; result-shape identity; registry absence).
- [ ] (lightweight) INV-04 iterator-byte guard — a few lines asserting the `setTimeout` region (`agent-loop.js:~2725/2794/2804`) is unchanged.
- [ ] Append both new test files to the root `package.json` `scripts.test` chain AFTER `capability-mcp-surface.test.js` (same place Phase 28 appended).
- Framework install: **none** — zero-framework convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real T1a head handler returns **logged-in** data (not logged-out) from a real HttpOnly site via the loaded extension | CAT-02 (live half) | Requires a live Chrome extension + a real authenticated first-party origin; cannot run in CI without shipping a real credential (forbidden). Recorded as `human_needed`, matching the Phase 27/28 live-UAT posture. | Load the unpacked extension, sign in to a head service's origin, keep that tab active, invoke the head slug via the autopilot or MCP front door, assert logged-in-shape (not a login redirect). Record in `29-HUMAN-UAT.md`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after per-task rows finalized)

**Approval:** pending
