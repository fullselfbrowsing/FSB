---
phase: 43-catalog-scale-milestone-gate
verified: 2026-06-26
status: passed
score: 3/3 success criteria verified (+ milestone gate green in the real tree)
overrides_applied: 0
milestone_gate:
  command: "npm test"
  tree: "real working tree (/Users/lakshman/conductor/workspaces/fsb/louisville)"
  exit: 0
  authoritative: true
  suites_failed: 0
  node_invocations: 223
  note: "Run DIRECTLY in the real tree (NOT a throwaway worktree). The showcase-server suites ran WITH their deps present; the only stack trace (PayloadTooLargeError, server-telemetry-body-cap) is an INTENTIONAL 413-rejection test that PASSED (3 passed, 0 failed). No missing-dep failure materialized."
high_findings_reverified:
  HI-01:
    claim: "SCALE-02 self-heal scheduler wired into the live rot path (was DEAD/unwired)"
    verdict: GENUINELY FIXED
    evidence: "capability-router.js _quarantineAndRelearn (lines 246-274) calls store.recordRot(origin,slug) on every broken verdict AND routes the re-learn through scheduler.scheduleRelearn(origin, boundRunDiscovery) (lines 263-266), degrading to legacy fire-and-forget only when the scheduler module is absent. relearn-router-wiring.test.js (9 passed, 0 failed) drives the REAL router on a forced-404 broken verdict and proves N->1 coalescing + recurrence-to-systemic + degraded surfacing END-TO-END. NON-VACUOUS confirmed by sabotage: disabling the scheduler branch in a /tmp sandbox copy reds the test (6 passed, 3 failed -- 'got 5' runDiscovery calls). Registered in npm test (the milestone gate runs it)."
  HI-02:
    claim: "wrong-invoke=0 was partially overfit + overclaimed; generalize + correct to honest framing"
    verdict: GENUINELY FIXED
    evidence: "Eval assertion is a genuine HARD === 0 (capability-search-eval.test.js:149 `check(wrongRate === 0,...)`) but is now FRAMED honestly as a 190-fixture HARD REGRESSION PIN, NOT proof of general precision; the corpus-tier (0.526 = 20/38) is RECORDED as the open frontier. The two named brittle cases were generalized to real noun/verb CLASSES via importer DATA-MAP only (CREATE_NOUN_VERBS + CREATE_FAVORING_NOUN_ALIASES + APP_ALIASES; importer CORE byte-untouched) and PROMOTED to the curated HARD tier as held-out paraphrases: 'report a bug in linear' -> linear.create_issue and 'publish a post to my bluesky feed' -> bsky.create_post both pass HARD in breadth-search-return.test.js (55 passed). MED-01 guard confirms 0 verbatim collision queries (every probe is held-out, so 0 is genuine retrieval). Corpus misses improved 22->20."
gaps: []
deferred: []
human_verification:
  - test: "Guarded-write [ASSUMED-ENDPOINT] live mutation-body capture (41-HUMAN-UAT.md, phase 41 plans 02/04)"
    expected: "With a signed-in session on a guarded-write origin, ONE guarded mutation captures a request shape matching the [ASSUMED-ENDPOINT] recipe"
    why_human: "Requires a live authenticated browser mutation. CARRIED-FORWARD NON-BLOCKING milestone debt -- the write path ships FAIL-CLOSED (returns RECIPE_DOM_FALLBACK_PENDING, never calls executeBoundSpec until confirmed); the fail-closed contract is proven HEADLESSLY (guarded-write-failclosed.test.js, head-handler-upgrade.test.js). Does NOT gate Phase 43."
  - test: "Discovery first-authenticated-visit capture (42-HUMAN-UAT.md, phase 42 plan 05)"
    expected: "Visiting a seeded origin while signed in learns the capability on the first authenticated visit"
    why_human: "Requires a live signed-in visit per seeded origin. CARRIED-FORWARD NON-BLOCKING milestone debt -- the seeded T2 path surfaces an inert RECIPE_LEARN_PENDING affordance until learned (a hint never executes); the seed->T2 resolve + promote-after-replay + redaction are proven HEADLESSLY (seed-resolve-t2.test.js, learned-promote-after-replay.test.js, network-capture-redaction.test.js). Does NOT gate Phase 43."
---

# Phase 43: Catalog-Scale + Milestone Gate (SCALE-01/02) Verification Report

**Phase Goal:** Close the v1.0.0 milestone by proving full-corpus performance, driving full-corpus search PRECISION to the hard bar (DEF-39.5-04-A), hardening recipe-rot self-heal for the 119-app surface, and gating on the full test suite. `npm test` EXIT 0 IS the milestone gate.
**Verified:** 2026-06-26
**Status:** passed
**Re-verification:** No -- initial verification (the phase went through 43-REVIEW + a full fix pass; this is the first goal-backward verification).
**Mode:** Standard goal-backward (no MVP mode; ROADMAP `mode: null`). All gates run READ-ONLY in the REAL working tree; no code modified.

## Verification Posture

This is the FINAL v1.0.0 phase. The starting hypothesis was adversarial: the 43-REVIEW found 2 material HIGH findings (HI-01 the scheduler was DEAD/unwired; HI-02 wrong-invoke=0 was partially overfit + overclaimed). Both were claimed RESOLVED. SUMMARY/MILESTONE-GATE claims were NOT trusted -- every assertion was re-run against the actual code in the real tree, the HI-01 wiring was traced line-by-line in `capability-router.js`, and the wiring test's non-vacuousness was PROVEN by a sandbox sabotage. The authoritative milestone signal -- `npm test` EXIT 0 -- was run HERE in the real tree (not a throwaway worktree).

## Goal Achievement -- Per-Success-Criterion

| #   | Success Criterion | Status | Evidence (real-tree, re-run) |
| --- | ----------------- | ------ | ---------------------------- |
| SC1 | Full-corpus scale within budget + wrong-invoke at the HARD bar | PASSED | `full-corpus-scale.test.js` 8/0: index 1.372MB (< 2MB), cold-start 11.07-11.38ms (< 100ms), 621.7 B/desc (< 700, flat), 2314 descriptors (> 2000). `capability-search-eval.test.js` 16/0: wrong-invoke `=== 0` HARD (line 149), recall@5=1.000 HARD. `breadth-search-return.test.js` 55/0: curated wrong-invoke=0.000 HARD over 42 probes; corpus-tier 0.526 honestly RECORDED. INV-01: catalog IIFE header + djb2/dual-export tail BYTE-IDENTICAL to phase base (only DATA re-emitted); 621.7 B/desc flat = no params-leak. |
| SC1-honesty (HI-02) | wrong-invoke=0 framed HONESTLY (regression pin, not general precision); enrichment is importer DATA-MAP only; named brittle cases generalized | PASSED | Eval assertion message + inline comment explicitly state "HARD REGRESSION PIN over this fixture set (NOT proof of fully-general precision; the breadth corpus-tier is a RECORDED open frontier, NOT claimed closed)". Importer CORE byte-untouched (classifyGate/inferSideEffect/extractDescriptors/runImport/feedSeedDescriptors/crosscheck/displayServiceStem unchanged in `git diff`); only data-map consts (NOUN_SYNONYMS, CREATE_NOUN_VERBS, CREATE_FAVORING_NOUN_ALIASES, APP_ALIASES, OVER_CLAIM_GUARD) + isOverClaim helper added. Held-out paraphrases route correctly: "report a bug in linear" -> linear.create_issue and "publish a post to my bluesky feed" -> bsky.create_post both PASS HARD in breadth (and are promoted to the curated tier). MED-01 guard: 0 verbatim collision queries (every probe is a held-out paraphrase -> 0 is genuine retrieval, not exact-match tautology). |
| SC2 | Recipe-rot self-heal hardened AND ACTUALLY WIRED (HI-01) | PASSED (1 WARNING) | `capability-router.js _quarantineAndRelearn` (the LIVE rot path, called at :658 and :735) routes the re-learn THROUGH `scheduler.scheduleRelearn(origin, boundRunDiscovery)` (:263-266) + calls `store.recordRot(origin, slug)` on every broken verdict (:248-254) -- coalescing + recurrence run IN PRODUCTION, degrading to legacy fire-and-forget only when the scheduler module is absent. `relearn-router-wiring.test.js` 9/0 proves the LIVE path N->1 coalesces, records recurrence to systemic, and surfaces degraded END-TO-END; PROVEN NON-VACUOUS by sandbox sabotage (disabling the scheduler branch -> 6/3 RED, "got 5" runDiscovery). `relearn-coalescing` 17/0 (MED-01 non-vacuous: captures+invokes callbacks, asserts exactly 1 timer armed), `rot-recurrence-classify` 19/0, `app-degraded-surfacing` 14/0. ADDITIVE confirmed: network-capture.js / capability-fetch.js / capability-rot-detector.js / consent-* UNCHANGED in phase diff; consent gate, executeBoundSpec, tier dispatch, classifyRecipeBroken taxonomy, per-origin cap/LRU/quarantine all untouched. `relearn-scheduler.js` off the recipe-path allowlist (recipe-path-guard PASS, Wall-1). WARNING: `getOriginHealth` has no production READER (see Warnings). |
| SC3 | The milestone gate | PASSED | INV-03 `provider-parity.test.js` 31/0: distinct = ["RECIPE_DOM_FALLBACK_PENDING"], length 1 across 7 providers. MIT provenance `provenance-scaffold.test.js` PASS: catalog _provenance.json 127 apps, license MIT, SHA-pinned; PIN.md verbatim MIT grant + "AS IS" disclaimer; Wall-1 no-runtime-js. `npm run validate:extension` EXIT 0: recipe-path-guard / classification-gate (129+23 origins) / catalog-crosscheck (2306 descriptors) / no-duplicate-stem (127 distinct) / origin-classification (4 heads SAME-ORIGIN, Wall-2) / no-orphan-descriptor (2306==2306) all PASS. **`npm test` EXIT 0 in the REAL working tree** -- 223 node invocations, 142 suite-result lines all "0 failed", chain completed through `no-orphan-descriptor: 10 passed, 0 failed`. THE MILESTONE GATE is met. |

**Score:** 3/3 success criteria verified; milestone gate green in the authoritative real tree.

## THE MILESTONE GATE (authoritative -- real tree)

| Property | Result |
| -------- | ------ |
| Command | `npm test` |
| Tree | REAL working tree (`/Users/lakshman/conductor/workspaces/fsb/louisville`), NOT a throwaway worktree |
| Exit code | **0** |
| node invocations in chain | 223 (full chain registered) |
| Suite-result lines reporting 0 failed | 142 / 142 |
| Suites with failed > 0 | NONE (the only "failed N" text matches are a section header "5 failed POSTs" and PASS lines asserting `isError: true`) |
| Chain completion | Ran to the last test `no-orphan-descriptor: 10 passed, 0 failed` (the &&-chain did not short-circuit) |
| Showcase-infra dep concern | DID NOT materialize -- the showcase-server suites ran WITH deps present. The single stack trace (`PayloadTooLargeError`, server-telemetry-body-cap INGEST-07a) is an INTENTIONAL 413-rejection test that PASSED (3 passed, 0 failed); the express log line is the server logging the deliberately-rejected 33 KB body, not a test failure. |

The whole-suite pass over breadth + depth + discovery + scale + self-heal + provider parity + provenance + every INV/Wall guard IS the v1.0.0 milestone gate. **The v1.0.0 milestone is genuinely met.**

### Every Sub-Gate (each re-run directly, read-only)

| Sub-Gate | Command | Bar | Measured | Result |
| -------- | ------- | --- | -------- | ------ |
| INV-03 provider parity | `node tests/provider-parity.test.js` | distinct.length===1 / 7 providers | distinct=["RECIPE_DOM_FALLBACK_PENDING"], len 1 (31 passed) | PASS |
| MIT provenance | `node tests/provenance-scaffold.test.js` | all apps MIT+SHA, PIN.md grant+disclaimer, no-runtime-js | 127 apps MIT+SHA; PIN.md verbatim grant + "AS IS"; Wall-1 holds | PASS |
| SCALE-01 scale | `node tests/full-corpus-scale.test.js` | <2MB / <100ms / <700B / >2000 | 1.372MB / 11.07-11.38ms / 621.7B / 2314 (8 passed) | PASS |
| SCALE-01 precision (eval) | `node tests/capability-search-eval.test.js` | wrong-invoke HARD===0 + recall@5>=0.9 | wrong-invoke=0.000 (`=== 0`), recall@5=1.000 (16 passed) | PASS |
| SCALE-01 precision (breadth) | `node tests/breadth-search-return.test.js` | curated wrong-invoke=0 HARD; corpus RECORDED honestly | curated=0.000 over 42 HARD; corpus 0.526 (20/38) RECORDED (55 passed) | PASS |
| SCALE-02 coalescing | `node tests/relearn-coalescing.test.js` | N->1 + exp back-off + bounded + consent, non-vacuous (MED-01) | 17 passed (1 timer armed for 5 calls; back-off; cap 64; consent) | PASS |
| SCALE-02 recurrence | `node tests/rot-recurrence-classify.test.js` | transient/systemic threshold + reset + bounded + T-32-PASS | 19 passed | PASS |
| SCALE-02 degraded | `node tests/app-degraded-surfacing.test.js` | healthy vs degraded/needs-re-port, visible, additive | 14 passed | PASS |
| SCALE-02 live wiring (HI-01) | `node tests/relearn-router-wiring.test.js` | live router N->1 + recordRot->systemic + getOriginHealth degraded | 9 passed; sabotage->3 failed (non-vacuous) | PASS |
| Wall-1 recipe-path-guard | `node scripts/verify-recipe-path-guard.mjs` | 9 capability modules on allowlist; relearn-scheduler OFF it | PASS (21 recipe-path files clean; scheduler off allowlist) | PASS |
| INV-01..04 + Walls 1/2 | `npm run validate:extension` | all structural guards green | EXIT 0 (validate-extension 287 JS clean + 6 verify-* gates) | PASS |
| **THE MILESTONE GATE** | **`npm test`** | **EXIT 0 over the whole suite (real tree)** | **EXIT 0** | **PASS** |

## Honesty Section

### HI-02 -- the wrong-invoke=0 regression-pin framing (re-verified GENUINE)

- The eval HARD assertion is a **real** `check(wrongRate === 0, ...)` (capability-search-eval.test.js:149) -- it would FAIL on any wrong-invoke > 0. It is NOT a softened RECORDED `>= 0`.
- It is FRAMED HONESTLY: both the assertion message and the preceding inline comment state the 190-fixture 0 is "a HARD REGRESSION PIN over this fixture set (NOT proof of fully-general precision)" and that "the broader breadth corpus-tier is a RECORDED open frontier, NOT claimed closed." The breadth test independently records corpus wrong-invoke=0.526 (20/38) as a "TRACKED, DOCUMENTED phase boundary (DEF-39.5-04-A)".
- The enrichment is **importer DATA-MAP only**: `git diff` over the phase range shows the importer CORE functions (classifyGate, inferSideEffect, extractDescriptors, runImport, feedSeedDescriptors, crosscheck, displayServiceStem) are byte-untouched; only data-map consts + the `isOverClaim` helper were added. The seed was RE-EMITTED (not hand-edited).
- The named brittle cases were GENERALIZED to real classes and re-verified on HELD-OUT paraphrases: "report a bug in linear" -> linear.create_issue and "publish a post to my bluesky feed" -> bsky.create_post both pass HARD in breadth-search-return (and are pinned in the curated tier). The MED-01 guard pins that 0 collision query is a verbatim synonym member -> the 0 is genuine retrieval, not an exact-match tautology. Corpus absolute misses improved 22->20.

**Verdict: the wrong-invoke=0 claim is honestly framed -- a 190-fixture HARD regression pin, with the corpus-tier explicitly recorded as the still-open frontier. No overclaim remains.**

### HI-01 -- the self-heal-is-actually-wired confirmation (re-verified GENUINE + NON-VACUOUS)

- `capability-router.js _quarantineAndRelearn` (the live rot path, invoked at :658 / :735 on every broken classifyRecipeBroken verdict) now: (1) calls `store.recordRot(origin, slug)` on the broken verdict (:248-254) so the recurrence counter ACCUMULATES in production; (2) routes the consent-gated re-learn THROUGH `scheduler.scheduleRelearn(origin, boundRunDiscovery)` (:263-266) so N broken verdicts on one origin COLLAPSE to one re-learn (no thundering-herd); (3) DEGRADES to the legacy direct fire-and-forget only when the scheduler module is absent (:267-271). This is real wired code, not comments.
- `relearn-router-wiring.test.js` (9/0) loads the REAL router + REAL store + REAL scheduler + REAL rot detector + REAL interpreter, drives `ROUTER.invoke()` on a forced-404 verdict, and asserts: 0 runDiscovery calls BEFORE the window flushes (scheduled, not fired), exactly 1 AFTER flush (N->1 through the live router), recurrence accumulates to systemic via live recordRot, and getOriginHealth reports degraded:true post-rot. It is registered in `npm test`.
- **NON-VACUOUSNESS PROVEN by sabotage:** copying the modules to a `/tmp` sandbox and disabling the scheduler route-through (simulating the pre-HI-01 direct fire-and-forget) reds the test -- 6 passed / **3 failed**, "got 5" runDiscovery calls instead of the coalesced 1. The real tree was never modified.
- ADDITIVE confirmed: the consent gate (`_runGate`/`_evaluateConsent`), `executeBoundSpec`, tier dispatch, the `classifyRecipeBroken` taxonomy, and the per-origin cap/LRU/quarantine are all UNCHANGED in the phase diff (network-capture.js / capability-fetch.js / capability-rot-detector.js / consent-* files do not appear in the change set). The coalesced re-learn still passes `_runGate` (it INVOKES the supplied consent-gated runDiscovery, which self-enforces the Phase-30 gate). `relearn-scheduler.js` is off the recipe-path allowlist (Wall-1; recipe-path-guard PASS).

**Verdict: the SCALE-02 self-heal scheduler is GENUINELY wired into the live rot path. The previously-DEAD subsystem is now live in production, proven end-to-end by a non-vacuous test.**

## Security Section

| Property | Result | Evidence |
| -------- | ------ | -------- |
| Additive-only (no consent/exec/taxonomy change) | HELD | `git diff` over the phase range: network-capture.js, capability-fetch.js, capability-rot-detector.js, consent-*.js are NOT in the change set. The router diff adds only the self-heal wiring + accessors. |
| Re-learn stays consent-gated | HELD | The scheduler INVOKES the supplied `boundRunDiscovery` (consent-gated runDiscovery bound to the origin); it never re-implements capture/consent. Coalescing/back-off is a debounce LAYER on the existing gated re-learn. `relearn-coalescing` asserts an `ok:false` (RECIPE_CONSENT_*) result is a failed attempt (no retry-storm). |
| Wall-1 (recipe-path allowlist) | HELD | `relearn-scheduler.js` is NOT a capability-*.js name and binds/executes no recipe; recipe-path-guard PASS (9 capability modules on the allowlist, scheduler off it by construction). Scheduler is dynamic-code-FREE (no eval/new Function/run-string). |
| Wall-2 (origin-pin) | HELD | verify-origin-classification PASS: 4 heads all SAME-ORIGIN with their vendored API base-URL; 0 silent cross-origin ports. |
| T-32-PASS (security verdict never escalated) | HELD | recordRot is broken-only; a typed RECIPE_* security passthrough is broken:false and is NEVER counted -> the recurrence layer can never escalate a security rejection into a systemic quarantine (rot-recurrence-classify asserts this). |
| INV-03 byte-equal fallback reason | HELD | provider-parity distinct=["RECIPE_DOM_FALLBACK_PENDING"], length 1 across all 7 providers (the router never branches on provider). |
| INV-01 catalog shape stability | HELD | recipe-index.generated.js IIFE header + djb2/dual-export tail BYTE-IDENTICAL to the phase base; 621.7 B/descriptor flat < 700 (no params leaked into the index). |
| No manifest/permission change | HELD | background.js diff is one additive try/catch'd importScripts; the lattice byte-freeze counter was correctly updated 187->188 for the legitimate +1 module (not the milestone gate gamed). |

## Three-Level + Live Artifact Verification

| Artifact | Exists | Substantive | Wired | Data Flows | Status |
| -------- | ------ | ----------- | ----- | ---------- | ------ |
| `extension/utils/relearn-scheduler.js` | Yes (305 lines) | Yes (scheduleRelearn/flush/_reset/back-off/LRU/cap; dynamic-code-free) | Yes (background.js importScripts + capability-router.js `_relearnScheduler()` route-through) | Yes (live router calls scheduleRelearn on broken verdicts; wiring test proves N->1) | VERIFIED |
| `extension/utils/learned-recipe-store.js` (recurrence + getOriginHealth) | Yes (+158 lines) | Yes (recordRot/recordOk/dispositionFor/getOriginHealth; LO-01 dead branch removed; bounded null-proto) | recordRot: WIRED (router :252). getOriginHealth: exported + test-consumed; NO production reader (see WARNING) | recordRot: FLOWING (live router). getOriginHealth: live-data-backed, computed correctly | VERIFIED (recurrence) / WARNING (getOriginHealth surfacing) |
| `extension/utils/capability-router.js` (HI-01 wiring) | Yes (+82 lines) | Yes (recordRot + scheduleRelearn route-through + degrade fallback) | Yes (called at :658/:735 on every broken verdict) | Yes (proven non-vacuous by sabotage) | VERIFIED |
| `scripts/import-opentabs-catalog.mjs` (data-map) | Yes (+442 lines, data only) | Yes (8 data-map consts + isOverClaim; CORE byte-untouched) | Yes (re-import re-emitted the corpus + seed) | Yes (descriptors carry the enriched synonyms; eval/breadth pass) | VERIFIED |
| `extension/catalog/recipe-index.generated.js` (re-emit) | Yes | Yes (INV-01 header/tail byte-stable) | Yes (the runtime-indexed array) | Yes (full-corpus-scale builds over it: 2314 desc) | VERIFIED |
| `tests/capability-search-eval.test.js` (HARD flip) | Yes | Yes (`check(wrongRate === 0,...)` + honest framing) | Yes (in npm test chain) | Yes (16/0) | VERIFIED |
| `tests/relearn-router-wiring.test.js` (HI-01 proof) | Yes (247 lines) | Yes (real router/store/scheduler; non-vacuous) | Yes (registered in npm test) | Yes (9/0; sabotage reds it) | VERIFIED |
| `.planning/.../43-MILESTONE-GATE.md` | Yes | Yes (gate table + npm-test-EXIT-0 + carried-forward UAT) | Yes (records each sub-gate + the two HUMAN-UAT pointers) | n/a (doc) | VERIFIED |

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| SCALE-01 | 43-01, 43-02, 43-04 | Full-corpus scale within budget + precision wrong-invoke at the HARD bar | SATISFIED | full-corpus-scale 8/0 (within budget); eval wrong-invoke `=== 0` HARD + recall@5=1.000; breadth curated HARD=0; INV-01 byte-stable; importer CORE untouched. |
| SCALE-02 | 43-01, 43-03, 43-04 | Recipe-rot self-heal hardened for 119-app scale: per-origin coalescing/back-off, recurrence-based systemic-vs-transient, app-level degraded surfacing -- WIRED into the live path | SATISFIED (1 WARNING) | scheduler + recurrence wired into capability-router.js live rot path (HI-01); 4 self-heal tests green incl the non-vacuous live-wiring proof; additive/bounded/consent-gated/Wall-1-safe. WARNING: degraded accessor delivered + live-data-backed but no production UI/search consumer yet. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Live router coalesces N broken verdicts -> 1 re-learn | `node tests/relearn-router-wiring.test.js` | 9 passed, 0 failed | PASS |
| Wiring test is non-vacuous (sabotage reds it) | sandbox: disable scheduler branch, re-run wiring test | 6 passed, 3 failed ("got 5" runDiscovery) | PASS |
| Eval wrong-invoke HARD === 0 + recall@5 = 1.000 | `node tests/capability-search-eval.test.js` | 16 passed, 0 failed | PASS |
| Held-out paraphrases route correctly (generalization) | `node tests/breadth-search-return.test.js` | "report a bug in linear"->create_issue, "publish a post...bluesky"->create_post both PASS HARD (55 passed) | PASS |
| Full-corpus scale within budget | `node tests/full-corpus-scale.test.js` | 1.372MB / 11ms / 621.7B / 2314 (8 passed) | PASS |
| INV-03 7-provider byte-equality | `node tests/provider-parity.test.js` | distinct len 1 (31 passed) | PASS |
| INV-01 catalog header/tail byte-stability | `diff` base vs HEAD (head -2 / tail -4) | BYTE-IDENTICAL | PASS |

## Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Wall-1 recipe-path guard | `node scripts/verify-recipe-path-guard.mjs` | PASS (scheduler off allowlist) | PASS |
| Full guard battery | `npm run validate:extension` | EXIT 0 (6 verify-* gates + validate-extension) | PASS |
| THE MILESTONE GATE | `npm test` (real tree) | EXIT 0 (142 suites 0-failed) | PASS |

(No `scripts/*/tests/probe-*.sh` convention probes exist in this repo; the phase's runnable checks are the node test files + the validate:extension chain, all executed above.)

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | -- | No TBD/FIXME/XXX, no unreferenced debt markers, no placeholder/stub returns in the phase-modified source | -- | The self-heal modules, the router wiring, and the importer data-map are all substantive; `return null`/`return {}` patterns in learned-recipe-store.js are defined healthy-default fall-throughs (getOriginHealth), not stubs. |

Scanned the phase-modified files (relearn-scheduler.js, capability-router.js, learned-recipe-store.js, background.js, import-opentabs-catalog.mjs, the 5 self-heal/eval test files). No blocker anti-patterns. The `getOriginHealth` no-production-reader observation is a wiring WARNING (below), not a code-smell anti-pattern.

## Warnings (must-have satisfied with a noted follow-up)

### W-1: `getOriginHealth` (degraded/needs-re-port surfacing) has no production consumer

- **Observation:** `FsbLearnedRecipeStore.getOriginHealth(origin)` is defined, exported (learned-recipe-store.js:667), substantive (LO-01 dead branch removed), and -- after the HI-01 wiring made `recordRot` live -- is now backed by accurate production data. It is consumed by `tests/app-degraded-surfacing.test.js` and `tests/relearn-router-wiring.test.js`, but NO production code path (search hit, status query, sidepanel/UI) calls it. In `extension/` it appears outside its own module only in a COMMENT in capability-router.js:212.
- **Why this is a WARNING, not a BLOCKER:** The ROADMAP SC2 names "an app-level degraded/needs-re-port surfacing"; the 43-CONTEXT (lines 80-81) explicitly defines the deliverable as exposing degraded state "(via the catalog/search result **OR a status accessor**)"; and the 43-03 PLAN must_have contracts specifically "an app-level degraded/needs-re-port **status accessor** (`getOriginHealth`)." The contracted deliverable is the ACCESSOR -- which exists, is correct, is bounded, and is now fed live data via the HI-01 router wiring (the chain recordRot -> dispositionFor 'systemic' -> getOriginHealth degraded:true is proven END-TO-END through the live router in relearn-router-wiring.test.js 9/0). The CONTEXT's "or a status accessor" wording makes the accessor a valid delivery form, and the HI-01 fix's own claim is precise ("the getOriginHealth degraded surfacing is no longer INERT" -- i.e. the state is live -- not "a UI displays it").
- **What is NOT yet delivered:** a production READER that turns the accessor into a user/agent-VISIBLE "this app needs re-learning" cue. No 43-03/43-04 PLAN task scoped a search-hit/UI consumer, so this is a follow-up to complete the user-visible loop, not an unmet phase task.
- **Recommendation (human decision):** Accept as the contracted-accessor form for v1.0.0 (the milestone gate is green and the state is live + proven), and track "wire a degraded cue into a search hit / status surface" as a post-milestone follow-up alongside the carried-forward UAT debt. This does NOT block the milestone.

## Human Verification Required (carried-forward, NON-blocking milestone debt)

Per the phase instruction and 43-MILESTONE-GATE.md, these two `human_needed` live-UAT items are carried-forward post-milestone debt and do NOT gate Phase 43 -- every shipped surface is fail-closed/inert and every mechanism + security property is proven HEADLESS. Phase 43 itself introduces NO new human_needed item (43-04 PLAN: "no NEW human_needed item; carried-forward UAT is non-blocking debt").

### 1. Guarded-write [ASSUMED-ENDPOINT] live mutation-body capture (41-HUMAN-UAT.md, phase 41 plans 02/04)

**Test:** With a signed-in session on a guarded-write origin, trigger ONE guarded mutation and confirm the captured request shape matches the `[ASSUMED-ENDPOINT]` recipe.
**Expected:** The captured request shape matches the recipe; the write path remains FAIL-CLOSED until confirmed.
**Why human:** Requires a live authenticated browser mutation. NON-BLOCKING: the write path ships FAIL-CLOSED (returns `RECIPE_DOM_FALLBACK_PENDING`, never calls `executeBoundSpec`); the fail-closed contract is proven HEADLESSLY (`guarded-write-failclosed.test.js`, `head-handler-upgrade.test.js`, both green in `npm test`).

### 2. Discovery first-authenticated-visit capture (42-HUMAN-UAT.md, phase 42 plan 05)

**Test:** Visit a seeded origin while signed in and confirm the first-authenticated-visit capture learns the capability.
**Expected:** The capability is learned on the first authenticated visit; until then the T2 path surfaces the inert `RECIPE_LEARN_PENDING` affordance.
**Why human:** Requires a live signed-in visit per seeded origin. NON-BLOCKING: a hint biases recognition only, never executes; the seed->T2 resolve + promote-after-replay + redaction are proven HEADLESSLY (`seed-resolve-t2.test.js`, `learned-promote-after-replay.test.js`, `network-capture-redaction.test.js`, all green in `npm test`).

## Gaps Summary

**No blocking gaps.** All 3 success criteria are VERIFIED, and THE MILESTONE GATE (`npm test` EXIT 0) is met in the AUTHORITATIVE real working tree.

The two HIGH findings the 43-REVIEW raised were re-verified as GENUINELY fixed, not merely claimed:
- **HI-01 (self-heal was DEAD/unwired):** the scheduler is now actually called from `capability-router.js _quarantineAndRelearn` (recordRot + scheduleRelearn route-through), proven END-TO-END and NON-VACUOUSLY (a sandbox sabotage to direct fire-and-forget reds the wiring test 3/9). The previously-inert coalescing + recurrence run in production.
- **HI-02 (wrong-invoke=0 overfit + overclaimed):** the eval `=== 0` is a genuine HARD pin framed HONESTLY as a 190-fixture regression pin (NOT general precision), the corpus-tier 0.526 is openly RECORDED as the frontier, the named brittle cases were generalized via the importer DATA-MAP (CORE untouched) and held-out paraphrases route correctly + are pinned in the curated HARD tier.

One WARNING (W-1): the `getOriginHealth` degraded accessor -- the contracted SC2 status-accessor form -- exists and is now live-data-backed, but has no production UI/search consumer yet; this is a post-milestone follow-up to complete the user-visible loop, explicitly allowed by the CONTEXT's "or a status accessor" wording, and does NOT block the milestone.

The two carried-forward live-UAT items (41/42 HUMAN-UAT.md) are recorded NON-blocking milestone debt (fail-closed/inert surfaces, all mechanisms proven headlessly) per the phase instruction.

---

_Verified: 2026-06-26_
_Verifier: Claude (gsd-verifier)_
_Methodology: goal-backward; all gates run read-only in the REAL working tree; no code modified; HI-01 wiring proven non-vacuous by sandbox sabotage._
