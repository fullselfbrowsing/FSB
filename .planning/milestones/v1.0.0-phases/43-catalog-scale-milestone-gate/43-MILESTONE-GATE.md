# Phase 43 / v1.0.0 Milestone Gate -- Sign-Off

**Date:** 2026-06-26
**Milestone:** v1.0.0 (Full App Catalog -- OpenTabs Parity)
**Phase:** 43 (Catalog-Scale + Milestone Gate, SCALE-01/02) -- the FINAL phase
**Result:** PASS -- full `npm test` EXIT 0 over the whole catalog + all guards.

The whole-suite pass over breadth + depth + discovery + scale + self-heal + provider parity +
provenance + every INV/Wall guard IS the v1.0.0 milestone gate (the v0.9.99 Phase-32
milestone-gate posture). Every sub-gate below was run DIRECTLY first (fast, attributable) and
then confirmed inside the whole-suite run.

## Gate Results

| Gate | Command | Bar | Measured Result | PASS/FAIL |
|------|---------|-----|-----------------|-----------|
| INV-03 provider parity | `node tests/provider-parity.test.js` | distinct.length === 1 across 7 providers | distinct = ["RECIPE_DOM_FALLBACK_PENDING"], length 1 (31 passed) | PASS |
| MIT provenance | `node tests/provenance-scaffold.test.js` | _provenance.json MIT + SHA-pinned, PIN.md verbatim grant+disclaimer, Wall-1 no-runtime-js | 127 apps MIT + SHA-pinned; PIN.md grant+"AS IS" disclaimer present; vendor no-runtime-js (20 passed) | PASS |
| SCALE-01 scale | `node tests/full-corpus-scale.test.js` | < 2MB / < 100ms / < 700B / > 2000 descriptors | 1.372MB / 11.7ms / 621.7 B/descriptor / 2314 descriptors (8 passed) | PASS |
| SCALE-01 precision (eval) | `node tests/capability-search-eval.test.js` | full-corpus wrong-invoke HARD === 0 + recall@5 >= 0.9 HARD | wrong-invoke = 0.000 (HARD === 0), recall@5 = 1.000 (16 passed) | PASS |
| SCALE-01 precision (breadth) | `node tests/breadth-search-return.test.js` | curated collision wrong-invoke = 0 HARD | curated wrong-invoke = 0.000 HARD over 39 probes; corpus-tier 0.537 RECORDED (52 passed) | PASS |
| SCALE-02 coalescing | `node tests/relearn-coalescing.test.js` | N->1 coalescing + exponential back-off + bounded + consent-preserved | 16 passed (5-on-1 -> 1 fn; back-off base/2x/4x; cap 64; consent fn invoked) | PASS |
| SCALE-02 recurrence | `node tests/rot-recurrence-classify.test.js` | transient/systemic threshold + reset-on-success + bounded + T-32-PASS | 19 passed (threshold 3; reset; cap; security passthrough never counted) | PASS |
| SCALE-02 degraded | `node tests/app-degraded-surfacing.test.js` | healthy vs degraded/needs-re-port, visible-not-silent, additive | 14 passed (getOriginHealth degraded:true on all-quarantined; additive) | PASS |
| INV-01 MCP surface | `node tests/capability-mcp-surface.test.js` | MCP surface invariant | PASS | PASS |
| INV-02 autopilot parity | `node tests/capability-autopilot-parity.test.js` | autopilot parity invariant | PASS | PASS |
| INV-01..04 + Walls 1/2 | `npm run validate:extension` | recipe-path-guard / classification-gate / catalog-crosscheck / no-duplicate-stem / origin-classification / no-orphan-descriptor all green | exit 0 (validate-extension 287 JS files clean; recipe-path-guard 9 capability modules on allowlist + relearn-scheduler correctly off it; classification-gate 129+23 origins; crosscheck 2306 descriptors; no-dup-stem 127 distinct; origin-class 4 heads SAME-ORIGIN; no-orphan 2306==2306) | PASS |
| **THE MILESTONE GATE** | **`npm test`** | **EXIT 0 over the WHOLE suite** | **EXIT 0** (0 suites failed; 24 suites reported failed:0; chain completed through no-orphan-descriptor 10/0) | **PASS** |

## THE MILESTONE GATE

**Full `npm test` EXIT 0** -- the authoritative v1.0.0 milestone signal. The whole suite over
breadth + depth + discovery + scale + self-heal + provider parity + provenance + every INV/Wall
guard passes. The v1.0.0 milestone is met.

## Carried-Forward NON-Blocking UAT Debt (recorded for the milestone audit)

These two `human_needed` live-UAT items are carried-forward v2/post-milestone debt. They do NOT
gate Phase 43 -- every shipped surface is fail-closed/inert and every mechanism + security
property is proven HEADLESS. They are recorded here for the milestone audit (the post-milestone
audit -> complete -> cleanup lifecycle), consistent with the v0.9.99 Phase-26..34 live-UAT
carry-forward posture.

1. **Guarded-write mutation bodies** -- source: `.planning/phases/41-depth-2-remaining-hand-ports-guarded-writes/41-HUMAN-UAT.md`
   (Phase 41, plans 02/04, status: human_needed). The guarded-write bodies need a live
   authenticated mutation to confirm the captured request shape for the `[ASSUMED-ENDPOINT]`
   recipe. **NON-blocking rationale:** every guarded WRITE ships FAIL-CLOSED -- `handle()`
   returns the dual-field `RECIPE_DOM_FALLBACK_PENDING` and NEVER calls `ctx.executeBoundSpec`,
   so NO mutation fires until confirmed. CI proves the fail-closed contract headlessly
   (`tests/guarded-write-failclosed.test.js`, `tests/head-handler-upgrade.test.js`).

2. **Discovery first-visit capture** -- source: `.planning/phases/42-discovery-seeding-tail-learn/42-HUMAN-UAT.md`
   (Phase 42, plan 05, status: human_needed). The discovery seed's first-visit capture needs a
   live signed-in visit per seeded origin. **NON-blocking rationale:** the seeded T2 path
   surfaces an actionable, INERT `RECIPE_LEARN_PENDING` affordance until learned; a hint biases
   recognition only, never executes. CI proves the seed->T2 resolve + promote-after-replay +
   redaction headlessly (`tests/seed-resolve-t2.test.js`, `tests/learned-promote-after-replay.test.js`,
   `tests/network-capture-redaction.test.js`).

### Optional Live-Confirmation Steps (to retire the debt early WITHOUT blocking this phase)

Skipping these is the DEFAULT for the autonomous run -- the milestone stands green and the two
items remain recorded debt.

1. **Guarded-write mutation bodies (41-HUMAN-UAT.md):** with a signed-in session on a
   guarded-write origin, trigger ONE guarded mutation and confirm the captured request shape
   matches the `[ASSUMED-ENDPOINT]` recipe. The write path is FAIL-CLOSED until confirmed --
   confirming it does NOT change the milestone result.
2. **Discovery first-visit (42-HUMAN-UAT.md):** visit a seeded origin while signed in and
   confirm the first-authenticated-visit capture learns the capability. Until then the T2 path
   surfaces the inert `RECIPE_LEARN_PENDING` affordance.

## Attestation

- INV-01..04 + Walls 1/2 all green (`npm run validate:extension` exit 0; the in-suite INV-01/INV-02
  surface tests pass; the structural guards pass).
- SCALE-02 self-heal was ADDITIVE: NO change to the consent gate (`_runGate`/`_evaluateConsent`),
  `executeBoundSpec`, tier dispatch, the `classifyRecipeBroken` taxonomy, or the per-origin
  cap/LRU/quarantine. `relearn-scheduler.js` is NOT a capability-* module (off the recipe-path
  allowlist by construction -- Wall-1 holds).
- SCALE-01 precision re-tune touched ONLY the importer synonym DATA-MAP (no importer-core/logic
  edit, no seed hand-edit -- re-imported via the frozen machinery); INV-01 catalog IIFE/djb2
  byte-stable; no index-shape/params-leak regression (621.7 B/descriptor flat < 700).
- No manifest/permission change.
