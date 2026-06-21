---
phase: 28-lean-mcp-surface-capability-search-eval-harness
plan: 04
subsystem: testing
tags: [inv-01, registry-hash-lock, mcp-surface, queue-split, recipe-not-found, eval-gate, zero-framework, ci-chain]

# Dependency graph
requires:
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    plan: 02
    provides: the built MCP module that registers search_capabilities + invoke_capability via server.tool() OUTSIDE TOOL_REGISTRY, and search_capabilities in queue.ts readOnlyTools -- the wire surface + queue split this test asserts
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    plan: 03
    provides: the dispatcher invoke handler that returns the RECIPE_NOT_FOUND dual-field shape for an unknown slug -- the code this test proves surfaces verbatim
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    plan: 01
    provides: the shared package.json test &&-chain (capability-search-eval.test.js already appended) -- this plan appends the surface test after it
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: the /^RECIPE_.+$/ verbatim errors.ts passthrough (RECIPE_NOT_FOUND surfaces for free, no errors.ts edit)
provides:
  - tests/capability-mcp-surface.test.js -- the single-file INV-01 proof: both tools on the wire + the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH unchanged + the queue split (search bypasses / invoke serializes) + RECIPE_NOT_FOUND verbatim
  - both new phase tests (capability-search-eval + capability-mcp-surface) gated in the npm test chain; ci (npm test) runs them
  - the green phase milestone gate -- the FULL npm test chain exits 0 with both new phase tests included
affects: [Phase 29, Phase 32]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-file INV-01 proof: the two out-of-registry tools are asserted on the wire (built runtime server._registeredTools enumeration, the Plan 02 runtime probe) ADJACENT to a re-assert that registryHash(nonTriggerTools) === the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH -- on-the-wire AND registry-unmoved in one file (D-15)"
    - "Wire-presence proof via the built runtime: createRuntime() then enumerate server._registeredTools (keyed by tool name) -- the true wire proof, not a source grep; backed by a defensive capabilities.ts/runtime.ts source check"
    - "Queue split proven two ways: a direct TaskQueue.readOnlyTools Set probe (has search_capabilities / not invoke_capability) AND a behavioral proof that a read-only search bypasses a slow in-flight invoke mutation (completes first)"
    - "Typed-error verbatim proof: mapFSBError on the dual-field RECIPE_NOT_FOUND shape surfaces the code verbatim and is NOT collapsed to action_rejected (the /^RECIPE_.+$/ passthrough), against the BUILT mcp/build/errors.js (mcp-recovery-messaging dynamic-import precedent)"

key-files:
  created:
    - tests/capability-mcp-surface.test.js
  modified:
    - package.json
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "Wire-presence uses the live built runtime (createRuntime() -> server._registeredTools enumeration, 65 tools = 63 + the 2 new) -- the same runtime probe Plan 02 used to prove 65 on the wire, not a source-level grep; a source backstop on capabilities.ts/runtime.ts guards build divergence (D-15)"
  - "The INV-01 hash is re-asserted IN this file (recompute registryHash over the built tool-definitions.cjs == the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH) so a single file is the phase's INV-01 proof -- both tools on the wire AND the registry unmoved, adjacent; tool-definitions-parity.test.js still proves it independently in the chain"
  - "The queue split is asserted by a direct readOnlyTools Set probe (the field is private in TS but a plain instance field on the compiled JS) PLUS a behavioral bypass-before-mutation proof, so a future move of invoke_capability into readOnlyTools reds the gate two ways (T-28-05)"
  - "RECIPE_NOT_FOUND is proven verbatim against the BUILT errors module (dynamic import, mcp-recovery-messaging precedent): the mapped text contains the code AND does NOT contain action_rejected -- the exact /^RECIPE_.+$/ passthrough proof, no errors.ts edit"
  - "The surface test is appended AFTER capability-search-eval.test.js in the package.json test chain (no reorder/removal); ci -> npm test gates both new phase tests; the FULL chain exits 0 as the phase-close milestone gate"

patterns-established:
  - "Pattern: an out-of-registry MCP tool surface is proven by enumerating the built runtime's server._registeredTools (wire truth) adjacent to a recompute of the frozen registry hash -- the canonical INV-01 single-file proof shape"
  - "Pattern: a private TS Set used for a runtime split (readOnlyTools) is asserted both structurally (instance-field probe on the compiled module) and behaviorally (ordering under a slow in-flight op), so the invariant cannot silently regress"

requirements-completed: [SURF-03, SURF-05, SURF-02]

# Metrics
duration: 9min
completed: 2026-06-21
---

# Phase 28 Plan 04: INV-01 Surface Proof + Eval-Gate Chain Wiring Summary

**A single tests/capability-mcp-surface.test.js that proves, adjacent to one another, the four facts that gate the lean two-tool surface -- both tools on the wire (built-runtime server._registeredTools enumeration, 65 = 63 + 2), the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH unchanged (out-of-registry, INV-01), the queue split (search_capabilities bypasses / invoke_capability serializes, probed structurally AND behaviorally), and RECIPE_NOT_FOUND surfacing verbatim via the /^RECIPE_.+$/ passthrough -- plus both new phase tests wired into the npm test chain so the FULL milestone gate (recall@5=1.0, wrong-invoke=0, two tools on wire, hash unmoved) runs green in CI.**

## Performance

- **Duration:** ~9 min
- **Completed:** 2026-06-21
- **Tasks:** 2 (+1 deviation fix)
- **Files changed:** 3 (1 created, 2 modified)

## Accomplishments

- Created `tests/capability-mcp-surface.test.js` (285 lines, 19 assertions, all PASS) -- the phase's single-file INV-01 proof asserting four things adjacent (D-15):
  - **(a) SURF-03 both tools on the wire:** dynamic-imports the built `mcp/build/runtime.js`, calls `createRuntime()`, enumerates `server._registeredTools` (keyed by tool name) and asserts `search_capabilities` + `invoke_capability` are present (65 tools on the wire = 63 + 2 -- exactly the Plan 02 runtime probe), backed by a defensive source-level check on `capabilities.ts` (`server.tool()`) and `runtime.ts` (`registerCapabilityTools`).
  - **(b) SURF-03 / INV-01 registry hash unchanged:** recomputes `registryHash(nonTriggerTools)` over the built `mcp/ai/tool-definitions.cjs` with the same `stable()` recursive key-sort stringify from `tool-definitions-parity.test.js` and asserts it equals the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` (`ad6efb8cc...`); also asserts neither new tool name is in `TOOL_REGISTRY`.
  - **(c) SURF-05 queue split:** probes the built `TaskQueue.readOnlyTools` Set directly (`has('search_capabilities')` true / `has('invoke_capability')` false), a source-level backstop on `queue.ts`, AND a behavioral proof that a read-only `search_capabilities` enqueued behind a slow in-flight `invoke_capability` mutation completes FIRST (bypass before mutation).
  - **(d) SURF-02 RECIPE_NOT_FOUND verbatim:** asserts `mapFSBError` on the dual-field `RECIPE_NOT_FOUND` shape surfaces the code verbatim AND is NOT collapsed to `action_rejected` (the `/^RECIPE_.+$/` passthrough), plus a sibling `RECIPE_SCHEMA_INVALID` interpret-failure passes through the same arm -- against the BUILT `mcp/build/errors.js` (the `mcp-recovery-messaging.test.js` dynamic-import precedent).
- Appended ` && node tests/capability-mcp-surface.test.js` to the `package.json` `test` script AFTER the existing trailing `capability-search-eval.test.js` (Plan 01). The chain tail now ends: `... && capability-fetch && capability-search-eval && capability-mcp-surface`; `ci` (`scripts.ci -> npm test`) gates both new phase tests automatically. No existing chain entry was reordered or removed.
- Confirmed the tail-of-chain milestone gate green: `node tests/capability-search-eval.test.js && node tests/capability-mcp-surface.test.js && node tests/tool-definitions-parity.test.js` exits 0 (eval recall@5=1.000 / wrong-invoke=0.000; surface 19/0; parity 256/0).
- Ran the FULL `npm test` chain to exit 0 (the phase-close gate -- this is the LAST plan of the phase), after fixing one pre-existing stale-baseline failure left by Plan 28-01 (see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: capability-mcp-surface.test.js (two tools on wire + registry hash unchanged + queue split + RECIPE_NOT_FOUND)** - `bf33c2f2` (test)
2. **Task 2: gate capability-mcp-surface.test.js in the npm test chain** - `23b03570` (test)
3. **Deviation fix: update lattice-provider-bridge-smoke importScripts baselines for Phase 28 Plan 01 (+2)** - `18cf9539` (fix)

## Files Created/Modified

- `tests/capability-mcp-surface.test.js` (created) - the single-file INV-01 proof: built-runtime wire enumeration (both tools), frozen-hash recompute over the built tool-definitions.cjs, readOnlyTools structural + behavioral split probe, and the RECIPE_NOT_FOUND verbatim passthrough proof. Zero-framework (passed/failed counters, `check(cond,msg)`, `process.exit(failed>0?1:0)`), async `run()` for the built-ESM dynamic imports.
- `package.json` (modified) - single line: ` && node tests/capability-mcp-surface.test.js` appended to the `test` script after `capability-search-eval.test.js`. `ci` runs `npm test`.
- `tests/lattice-provider-bridge-smoke.test.js` (modified) - stale `importScripts` baseline counts bumped 168->170 and 164->166 with Phase 28 attribution (see Deviations -- Rule 1; the drift was introduced by Plan 28-01's two new `background.js` importScripts lines, not by this plan).

## Decisions Made

- **Wire-presence via the live built runtime (D-15):** the true on-the-wire proof is enumerating `server._registeredTools` from a real `createRuntime()` instance (the Plan 02 runtime probe; the McpServer SDK keys registered tools by name there), not a source grep. A source-level backstop on `capabilities.ts`/`runtime.ts` guards against a future build divergence. 65 tools = the 63 baseline + the 2 new, both present.
- **Re-assert the INV-01 hash in this file (D-15):** recompute `registryHash(nonTriggerTools)` over the built `tool-definitions.cjs` == the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH`, adjacent to the wire-presence check, so a single file is the phase's INV-01 proof (both tools on the wire AND the registry unmoved). `tool-definitions-parity.test.js` still proves the hash independently in the same chain (256/0), so this is belt-and-braces, not a replacement.
- **Queue split proven structurally AND behaviorally (T-28-05):** `readOnlyTools` is `private` in TS but a plain instance field on the compiled JS, so a direct `has(...)` probe is the single point of truth; the behavioral bypass-before-mutation proof (a read-only search completes before a slow in-flight invoke) catches a regression even if the Set probe were ever bypassed. A future accidental move of `invoke_capability` into `readOnlyTools` reds the gate two ways.
- **RECIPE_NOT_FOUND verbatim against the built errors module (D-07):** the mapped text contains `RECIPE_NOT_FOUND` AND does NOT contain `action_rejected` -- the exact `/^RECIPE_.+$/` passthrough proof. No `errors.ts` edit (the passthrough already exists from Phase 26). Tested against `mcp/build/errors.js` via dynamic import (the `mcp-recovery-messaging.test.js` precedent), so it reflects the shipped runtime.
- **Chain order preserved:** the surface entry is appended strictly AFTER the eval entry; no existing entry reordered or removed. The FULL `npm test` is the phase-close milestone gate and now exits 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale importScripts baseline in lattice-provider-bridge-smoke.test.js (left by Plan 28-01)**
- **Found during:** Task 2 (running the FULL `npm test` chain to confirm the phase-close gate, as the plan's critical constraint requires)
- **Issue:** The full chain red on two assertions in `tests/lattice-provider-bridge-smoke.test.js`: `importScripts count` expected 168 but got 170, and `importScripts() call sites` expected 164 but got 166. Plan 28-01 added two `importScripts` lines to `background.js` (`catalog/recipe-index.generated.js` + `utils/capability-search.js`, lines 154-155 -- the build-time catalog IIFE + the minisearch index/slug-map module) but did NOT update this smoke test's running baseline-count assertions. The drift predates this plan (confirmed: my Task 1/Task 2 commits touched only `tests/capability-mcp-surface.test.js` + `package.json`; this test and `background.js` are byte-untouched by my commits). It surfaced now because this plan owns the "FULL `npm test` exits 0" phase-close gate.
- **Fix:** Bumped the two baselines 168->170 and 164->166 and extended the running comment trail with a Phase 28 Plan 01 attribution line (`+2 for catalog/recipe-index.generated.js + utils/capability-search.js`). The new counts are the real, intended counts -- the additions are independently verified by `node scripts/verify-recipe-path-guard.mjs` (PASS) and by this same smoke test's own load-order PASS lines (the 3 importScripts entries present + order assertions). No `background.js` change: the assertion baseline was stale, not the code.
- **Files modified:** tests/lattice-provider-bridge-smoke.test.js
- **Verification:** `node tests/lattice-provider-bridge-smoke.test.js` -> 101 passed, 0 failed (was 99 passed, 2 failed); the FULL `npm test` chain then exits 0.
- **Committed in:** `18cf9539` (separate atomic fix commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug -- a stale test baseline left by a prior wave plan).
**Impact on plan:** Necessary to satisfy this plan's explicit phase-close gate (full `npm test` exits 0). No scope creep -- a two-number baseline correction with attribution; no source/runtime behavior changed, no `background.js` touched. Logged here (not deferred) because the failure directly blocked this plan's own success criteria.

## Issues Encountered

None beyond the Rule 1 deviation above. All four assertion families were runtime-confirmed before the test was authored (built-runtime tool enumeration = 65 with both names; `readOnlyTools` Set probe = has search / not invoke; behavioral bypass-before-mutation; `mapFSBError` RECIPE_NOT_FOUND verbatim, not action_rejected), so the test was green on first run.

## Threat Model Coverage

The plan's `<threat_model>` `mitigate` dispositions are all realized by this plan:

- **T-28-03 (Tampering -- schema-lock regression on the registry hash):** `capability-mcp-surface.test.js` re-asserts `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unchanged AND both tools on the wire, and is now in the `npm test` chain -- any future `TOOL_REGISTRY` drift (e.g. a capability tool leaking into the registry) reds CI. Mitigated.
- **T-28-05 (DoS -- queue regression):** the surface test asserts `search_capabilities` bypasses and `invoke_capability` serializes (structurally + behaviorally); a future accidental move of `invoke_capability` into `readOnlyTools` reds the gate. Mitigated.
- **T-28-08 (Tampering -- context bloat / progressive-disclosure cap):** the eval test (Plan 01) caps hits at <=5; Task 2 keeps that test in the gating chain (it runs immediately before the surface test), so the anti-bloat invariant cannot silently regress. Mitigated.
- **T-28-SC (npm/pip/cargo installs):** ACCEPT -- this plan introduces ZERO new external packages and has no install task; no per-install legitimacy checkpoint required.

## Authentication Gates

None - this plan is pure test authoring + a one-line package.json chain append + a two-number test-baseline correction; no auth, login, or external service interaction occurred. The RECIPE_NOT_FOUND assertion is a pure in-process `mapFSBError` call against the built errors module (no network, no credentials).

## Known Stubs

None. The surface test exercises real artifacts end-to-end: the real built runtime (`createRuntime()` -> `server._registeredTools`), the real built `TaskQueue` (structural Set probe + a real `enqueue` ordering run), the real built `tool-definitions.cjs` (recomputed hash), and the real built `mcp/build/errors.js` (`mapFSBError`). No mocked/placeholder data sources; the RECIPE_NOT_FOUND input is the exact dual-field shape Plan 03's dispatcher returns for an unknown slug.

## User Setup Required

None.

## Next Phase Readiness

- Phase 28 is execution-complete: all four plans done (SURF-01..06). The lean two-tool surface is proven end-to-end -- both tools on the wire, the INV-01 registry hash unmoved, the read-only/queued split correct, the eval gate green (recall@5=1.0, wrong-invoke=0), and the full `npm test` milestone gate exits 0.
- **Phase 29** (Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity) builds on this surface: the `invoke_capability` front door proven here is the single front door the autopilot `tool-executor` branch must reach the SAME `capability-router` through (INV-02 at the runtime layer). The out-of-registry registration pattern (kept the hash frozen) and the queue split established here remain invariants Phase 29 must preserve.
- **Phase 32** (provider/schema-lock parity gate) inherits the INV-01 proof: `capability-mcp-surface.test.js` is now the standing single-file assertion that the registry hash stays frozen while the two capability tools live on the wire -- the schema-lock test green is the Phase 32 gate (INV-01).

## Self-Check: PASSED

- Created file exists on disk: `tests/capability-mcp-surface.test.js` (FOUND).
- All three commits exist in git history: `bf33c2f2` (Task 1, FOUND), `23b03570` (Task 2, FOUND), `18cf9539` (Rule 1 fix, FOUND).
- Acceptance greps (Task 1): `grep -c "search_capabilities"` = 15 (>=1), `grep -c "invoke_capability"` = 15 (>=1), `grep -c "EXPECTED_NON_TRIGGER_REGISTRY_HASH"` = 6 (>=1), `grep -c "RECIPE_NOT_FOUND"` = 13 (>=1); the test asserts `search_capabilities` in `readOnlyTools` / `invoke_capability` not in it. No emojis; `verify-recipe-path-guard` PASS (the test is outside the guard's `extension/utils/capability-*.js` scope).
- Acceptance greps (Task 2): `grep -c "capability-search-eval.test.js" package.json` = 1, `grep -c "capability-mcp-surface.test.js" package.json` = 1; the surface entry comes AFTER the eval entry; no entry reordered/removed.
- Gates green: `node tests/capability-mcp-surface.test.js` exits 0 (19/0); the tail-of-chain gate `eval && surface && parity` exits 0; the FULL `npm test` chain exits 0 (the phase-close milestone gate).

---
*Phase: 28-lean-mcp-surface-capability-search-eval-harness*
*Completed: 2026-06-21*
