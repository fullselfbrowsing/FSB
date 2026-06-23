---
phase: 29
slug: catalog-tiered-router-bundled-head-declarative-tail-autopilo
status: planned
nyquist_compliant: true
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

> Rows keyed to the PLAN.md task that proves each behavior. Test files are CREATED in 29-01 (Wave 0, RED); behaviors go GREEN in the implementing plan noted below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-T1 | 29-01 | 0 | CAT-01 | — | Router test authored (RED): tier order T0→T1a→T1b→T2→T3, origin bias | unit | `node tests/capability-router.test.js` | ❌ W0 (created) | ⬜ pending |
| 29-02-T2 | 29-02 | 1 | CAT-01 | T-29-05 | Router selects correct tier, origin-biased; T1b lifted path stamps tier:'T1b' | unit | `node tests/capability-router.test.js` | ✅ (29-01) | ⬜ pending |
| 29-02-T2 | 29-02 | 1 | CAT-03 | — | T1b recipe routes lifted interpretRecipe→executeBoundSpec; normalized shape | unit (mock fetch) | `node tests/capability-router.test.js` | ✅ (29-01) | ⬜ pending |
| 29-02-T2 | 29-02 | 1 | CAT-05 | T-29-06 | Unknown→RECIPE_NOT_FOUND; T2→RECIPE_LEARN_PENDING; T3→RECIPE_DOM_FALLBACK_PENDING; all /^RECIPE_.+$/, verbatim via mapFSBError | unit | `node tests/capability-router.test.js` | ✅ (29-01) | ⬜ pending |
| 29-02-T2 | 29-02 | 1 | CAT-05 | — | T3 seam returns a reason and does NOT call executeTool()/chrome.scripting | unit (spy never-called) | `node tests/capability-router.test.js` | ✅ (29-01) | ⬜ pending |
| 29-03-T1..3 | 29-03 | 2 | CAT-02 | T-29-07 | Head slug routes to its tier:'T1a' handler; handler calls executeBoundSpec with correct first-party origin | unit (mock executeBoundSpec) | `node tests/capability-router.test.js` | ✅ (29-01) | ⬜ pending |
| 29-03-T1..3 | 29-03 | 2 | CAT-02 | T-29-07 | Origin-pin on T1a path: handler spec.origin ≠ active tab → RECIPE_ORIGIN_MISMATCH, no side effect | unit (mock chrome.tabs.get) | `node tests/capability-router.test.js` | ✅ (29-01) | ⬜ pending |
| 29-03-T3 | 29-03 | 2 | CAT-03 | — | Reddit T1b recipe schema-valid (second same-origin recipe) | unit | `node tests/capability-recipe-schema.test.js` | ✅ | ⬜ pending |
| 29-03-T4 | 29-03 | 2 | CAT-02 | T-29-07 | LIVE: real T1a head handler returns logged-in data from a real HttpOnly site | manual / human_needed | 29-HUMAN-UAT.md (Phase 27/28 posture; not blocking) | n/a | ⬜ pending |
| 29-04-T1 | 29-04 | 2 | CAT-01 | T-29-11 | Reroute: invoke handler calls FsbCapabilityRouter.invoke; SW-side owned-origin resolution | unit | `node tests/capability-mcp-surface.test.js` | ✅ | ⬜ pending |
| 29-04-T1 | 29-04 | 2 | CAT-05 | T-29-12 | RECIPE_NOT_FOUND surfaces verbatim post-reroute; frozen hash unmoved; 2 tools on wire (INV-01) | unit | `npm --prefix mcp run build && node tests/capability-mcp-surface.test.js` | ✅ | ⬜ pending |
| 29-05-T1 | 29-05 | 3 | CAT-04 | T-29-14 | One engine, two front doors: dispatcher + autopilot branch both call globalThis.FsbCapabilityRouter.invoke; identical shape | unit (spy global) | `node tests/capability-autopilot-parity.test.js` | ✅ (29-01) | ⬜ pending |
| 29-05-T1 | 29-05 | 3 | CAT-04 | T-29-15 | Capability tools NOT in TOOL_REGISTRY; getPublicTools() does not list them (Anti-Pattern 1) | unit | `node tests/capability-autopilot-parity.test.js` | ✅ (29-01) | ⬜ pending |
| 29-05-T2 | 29-05 | 3 | INV-04 | T-29-16 | agent-loop.js setTimeout iterator region bytes unchanged; only additive prompt hint | guard | `node tests/agent-loop-iterator-guard.test.js` | ✅ (29-01) | ⬜ pending |
| 29-05-T3 | 29-05 | 3 | INV-01 | — | Full suite green: frozen non-trigger registry hash unchanged after the reroute | unit | `npm test` | ✅ | ⬜ pending |

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every code task has an automated verify; the one human_needed live smoke is non-blocking, Phase 27/28 posture)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (capability-router.test.js + capability-autopilot-parity.test.js + agent-loop-iterator-guard.test.js created in 29-01)
- [x] No watch-mode flags
- [x] Feedback latency < 1s (`node tests/capability-router.test.js` ~1s, no build)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved 2026-06-21
