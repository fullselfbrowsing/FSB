---
phase: 32
slug: self-healing-fallback-recipe-rot-detection-re-learn-provider
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 32 — Validation Strategy

> Per-phase validation contract. Seeded from `32-RESEARCH.md` §Validation Architecture. Per-task rows finalized by the planner once PLAN.md task IDs exist. HEAL-05 = the v0.9.99 milestone gate (full `npm test` green).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Zero-framework FSB convention — `node tests/<name>.test.js`, `passed/failed` counters, `check(cond,msg)`, `process.exit(failed>0?1:0)`. No jest/mocha/vitest. |
| **Config file** | none — standalone Node scripts wired into the `package.json` `scripts.test` `&&` chain |
| **Stubs** | chrome-stub recorder (`capability-fetch.test.js`); call `classifyRecipeBroken` directly with synthetic `executeBoundSpec` result objects; `globalThis.FsbCapabilityRouter.invoke` spy + `formatToolsForProvider`/`getPublicTools` for provider parity; `registryHash`/`stable` clone for schema-lock |
| **Quick run command** | `node tests/capability-rot-detector.test.js` |
| **Full suite command** | `npm test` (the milestone gate, D-15) |
| **Estimated runtime** | quick ~1s each · full suite ~minutes (mcp build dominates) |

---

## Sampling Rate

- **After every task commit:** `node tests/capability-rot-detector.test.js` + `node tests/agent-loop-iterator-guard.test.js` (the INV-04 guard, cheap)
- **After every plan wave:** `capability-router`, `capability-autopilot-parity`, `capability-recipe-schema`, `recipe-schema-lock`, `provider-parity`, `learned-recipe-store` + `scripts/verify-recipe-path-guard.mjs`
- **Before `/gsd:verify-work`:** full `npm test` green (HEAL-05 = the v0.9.99 milestone completion criterion)
- **Max feedback latency:** ~1 second (the focused taxonomy suite)

---

## Per-Task Verification Map

> Task IDs are `TBD` until the planner emits PLAN.md files; rows are keyed by requirement.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | HEAL-04 | T-mask-real-outcome | `classifyRecipeBroken` distinguishes broken (4xx/5xx, empty-when-extract-expects, shape-mismatch, RECIPE_EXPIRED) vs legitimate no-results (200+valid+empty) vs logged-out (302→login) — each asserted; no-results returned verbatim | unit | `node tests/capability-rot-detector.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | HEAL-02 | — | RECIPE_EXPIRED on a stamped recipe whose response fails expectedShape; a fresh response passes (jmespath-evaluated) | unit | `node tests/capability-rot-detector.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | HEAL-01 | T-pin/consent-bypass | the router/T3 routes a broken recipe to RECIPE_DOM_FALLBACK_PENDING + the autopilot door surfaces the typed reason / fellBackToDom; consent+origin-pin inherited (no parallel stack, iterator untouched) | unit | `node tests/capability-router.test.js` (extend) + `node tests/capability-autopilot-parity.test.js` (extend) | ⚠️ extend | ⬜ pending |
| TBD | — | 0 | HEAL-03 | — | quarantine-on-rot demotes the recipe from resolve (learned via getLearnedSync==null; bundled via quarantinedBundledSlugs Set); the post-fallback runDiscovery re-learn trigger is wired | unit | `node tests/capability-router.test.js` (extend) + `node tests/learned-recipe-store.test.js` | ⚠️ extend | ⬜ pending |
| TBD | — | 0 | HEAL-05/INV-03 | — | the 7-provider parity: capability + fallback decision equivalent across all 7 PROVIDER_KEYS | unit | `node tests/provider-parity.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | HEAL-05/INV-01 | — | the schema-lock test: frozen v2 RECIPE_SCHEMA hash + the frozen tool registry hash unchanged | unit | `node tests/recipe-schema-lock.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | INV-04 | — | the agent-loop setTimeout iterator stays byte-untouched | guard | `node tests/agent-loop-iterator-guard.test.js` | ✓ exists | ⬜ pending |
| TBD | — | 0 | HEAL-02 (additive) | — | v1 recipes still validate after the v1→v2 schema bump (additive optional fields) | regression | `node tests/capability-recipe-schema.test.js` | ✓ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/capability-rot-detector.test.js` — the taxonomy (broken/no-results/logged-out each asserted) + expectedShape pass/fail (HEAL-02/04); call `classifyRecipeBroken` directly with synthetic result objects.
- [ ] `tests/provider-parity.test.js` — capability + fallback decision equivalent across the 7 PROVIDER_KEYS (HEAL-05/INV-03); reuse formatToolsForProvider/getPublicTools + a router invoke spy.
- [ ] `tests/recipe-schema-lock.test.js` — frozen v2 RECIPE_SCHEMA hash (clone registryHash/stable) + re-assert the frozen tool registry hash (HEAL-05/INV-01).
- [ ] Extend `tests/capability-router.test.js` — the T3-realization routes a broken recipe to RECIPE_DOM_FALLBACK_PENDING; quarantine fires on the rot path; the runDiscovery re-learn trigger is wired.
- [ ] Extend `tests/capability-autopilot-parity.test.js` — the autopilot door surfaces the typed reason / fellBackToDom in makeResult.
- [ ] `package.json` test-chain wiring: append the 3 new test files after the existing `learned-*.test.js` entries.
- [ ] `scripts/verify-recipe-path-guard.mjs`: add `extension/utils/capability-rot-detector.js` to RECIPE_PATH_ALLOWLIST (Check 4 auto-globs it; keep eval-free).
- Framework install: **none** — zero-framework convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live self-healing: a real recipe that has rotted (or is forced to 4xx/empty) on a real authenticated site is detected (RECIPE_EXPIRED), the autopilot falls back to the DOM tools and STILL completes the task, the recipe is quarantined, and a re-learn is offered/triggered | HEAL-01/03 (live half) | Requires a live Chrome extension + a real authenticated origin + a genuinely-broken recipe; cannot run in CI. Recorded as `human_needed`, matching the Phase 27/28/29/30/31 live-UAT posture. | Load the unpacked extension, sign in, invoke a capability whose recipe is broken, confirm the autopilot completes the task via DOM (not an error), the recipe is quarantined, and a re-learn is offered. Record in `32-HUMAN-UAT.md`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after per-task rows finalized)

**Approval:** pending
