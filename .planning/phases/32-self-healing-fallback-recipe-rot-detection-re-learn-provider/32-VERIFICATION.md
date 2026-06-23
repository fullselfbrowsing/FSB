---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
verified: 2026-06-23T10:05:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
milestone_gate: HEAL-05 (v0.9.99) — full npm test EXIT 0 confirmed in-process
human_verification:
  - test: "Live self-healing on a real broken/rotted recipe against a real authenticated origin (UAT-32-01)"
    expected: "A genuinely-rotted (or forced 4xx/empty/shape-mismatch) recipe is detected as a broken verdict (RECIPE_EXPIRED); the autopilot does NOT hard-fail but completes the SAME task via the existing DOM tools; the broken recipe is quarantined/demoted (skipped on next resolve); a consent-gated re-learn (runDiscovery) is offered/triggered (not silent auto-capture); a legitimate no-results and a logged-out (302->login) are surfaced as-is and NOT healed away"
    why_human: "Requires a live Chrome extension load + a real authenticated first-party origin + a genuinely-broken recipe + a real credential (forbidden in CI per GOV-06). Recorded debt (32-HUMAN-UAT.md UAT-32-01, result: pending), NOT a fabricated pass. Matches the Phase 27/28/29/30/31 live-UAT posture; does NOT block the HEAL-05 CI milestone gate (D-15)."
---

# Phase 32: Self-Healing Fallback + Recipe-Rot Detection + Re-Learn + Provider/Schema-Lock Verification Report

**Phase Goal:** Tie recipe-break detection to the existing DOM tools so a broken recipe still completes the task — the flagship differentiator and the catch-all for Wall-2's un-replayable auth classes — and prove parity across all 7 providers plus the schema-lock invariant.

**Verified:** 2026-06-23T10:05:00Z
**Status:** passed (CI milestone gate green; one live UAT recorded as human_needed debt, Phase 27-31 posture — does NOT block)
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal decomposes into the five HEAL requirements, which are exactly the ROADMAP Success Criteria. Every one is verified in the codebase (not from SUMMARY claims) by reading the production wiring AND running the targeted suites plus the full `npm test` milestone gate in this verifier's own process.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HEAL-01: a broken recipe falls back to the EXISTING DOM tools and still completes the task (model-driven, no parallel stack, iterator byte-untouched) | ✓ VERIFIED | Router `_runDeclarativeTier` (capability-router.js:484-502) + `_runHandlerTier` (:557-572) call `classifyRecipeBroken(out, recipe)` after `executeBoundSpec`; a `broken:true` verdict returns dual-field `_err('RECIPE_DOM_FALLBACK_PENDING', { slug, reason, recipeBrokenReason, fellBackToDom:true })`. `executeCapabilityToolForAutopilot` (tool-executor.js:709-715) surfaces it: `error = response.error \|\| response.errorCode` (errorCode = the typed code) and `result = response` verbatim; NO `executeTool`/`run_task` call inside (INV-02 holds). agent-loop.js:731 prompt hint strengthened to instruct DOM completion on RECIPE_DOM_FALLBACK_PENDING/RECIPE_EXPIRED. INV-04: exactly 4 `_nextIterationTimer = setTimeout` lines (2027/2726/2795/2805, 100/100/5000/2000) byte-identical. Tests in-process: capability-router 38/38, capability-autopilot-parity 13/13, agent-loop-iterator-guard EXIT 0. |
| 2 | HEAL-02: recipes stamped capturedAt + expectedShape; a rotted response -> RECIPE_EXPIRED; schema v1->v2 additive (persisted v1 still validates) | ✓ VERIFIED | `extension/utils/capability-rot-detector.js` (249 lines) exports `classifyRecipeBroken` + `validateExpectedShape`, reusing the same jmespath read-path engine (`FsbCapabilityInterpreter.getFSBJmespath`). Schema: `FSB_RECIPE_SCHEMA_VERSION = 2` (:68), `schemaVersion: { enum: [1, 2] }` (:103, NOT const), optional `capturedAt` (:149) + `expectedShape` (:155), `additionalProperties:false` preserved. Interpreter carries both into the bound spec (capability-interpreter.js:485-486). Synthesizer stamps `expectedShape:'@'` + `capturedAt` at schemaVersion 2 (recipe-synthesizer.js:290-306). Backward-compat proven empirically: live v1 fixture (schemaVersion=1) -> `validateRecipe.success = true`. WR-01 auth-wall sniff closes the masking-as-success edge for `'@'`. Tests in-process: rot-detector 28/28, capability-recipe-schema EXIT 0, recipe-synthesizer EXIT 0. |
| 3 | HEAL-04: the taxonomy NEVER masks a real outcome (no-results verbatim; logged-out surfaced not healed; RECIPE_* security passthrough) | ✓ VERIFIED | `classifyRecipeBroken` branch order (rot-detector.js:179-235): (0) non-object -> RECIPE_EXPIRED; (1) success:false + /^RECIPE_/ code -> NOT broken (typed-passthrough, runs BEFORE generic fetch-failed); (2) generic success:false -> RECIPE_EXPIRED; (3) redirected:true -> NOT broken RECIPE_LOGGED_OUT; (4) status>=400 -> broken; (5) expectedShape gate where a present-but-empty container PASSES (real 0-results never masked). Router returns non-broken verdicts verbatim (capability-router.js:504-512). In-process test output confirms: empty array/object under '@' -> NOT broken; RECIPE_ORIGIN_MISMATCH + RECIPE_CONSENT_REQUIRED passthrough -> NOT broken; login-HTML body -> RECIPE_EXPIRED. |
| 4 | HEAL-03: quarantine-on-rot (learned persisted; bundled session-only Set); resolve skips quarantined; consent-gated runDiscovery re-learn trigger wired | ✓ VERIFIED | `_quarantineAndRelearn` (capability-router.js:135-157): T2 -> `FsbLearnedRecipeStore.quarantine(slug, origin)`; bundled -> `catalog.quarantineBundled(slug)`; both fire-and-forget; then `FsbDiscoverySession.runDiscovery(origin, { tabId })` fire-and-forget (consent self-enforced inside startSession). Catalog: `var quarantinedBundledSlugs = Object.create(null)` (:100, null-proto Set), `quarantineBundled`/`clearBundledQuarantine` (:104-116), resolve-skip returns null AFTER the learned-first check and BEFORE any tier return (:310-312); REGISTRY never mutated, never persisted. Tests in-process: capability-router 38/38 (quarantine-fired + runDiscovery-wired assertions green). |
| 5 | HEAL-05 (MILESTONE GATE): 7-provider parity + schema-lock (frozen v2 RECIPE_SCHEMA hash + frozen tool hash) + FULL npm test green | ✓ VERIFIED | provider-parity.test.js iterates all 7 PROVIDER_KEYS (xai/openai/anthropic/gemini/openrouter/lmstudio/custom); the typed fallback reason is byte-equal across all 7 (router never branches on provider) — 31/31 in-process. recipe-schema-lock.test.js: `FROZEN_RECIPE_SCHEMA_V2_HASH = 'f35211f5...d622a37'` (real 64-hex, no TBD), re-asserts frozen tool hash `ad6efb8c...` — 3/3 in-process. **FULL `npm test` ran in this verifier's own process: EXIT 0, zero FAIL lines, chain ends on capability-rot-detector.test.js 28/0.** |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `extension/utils/capability-rot-detector.js` | classifyRecipeBroken + validateExpectedShape, eval-free, allowlisted | ✓ VERIFIED | 249 lines; dual-export IIFE; reuses jmespath read-path engine; WR-01 auth-wall sniff; ZERO eval/new Function/import( (recipe-path guard EXIT 0); imported by router (`_rotDetector()`) + importScripts'd in background.js:178 |
| `extension/utils/capability-router.js` | classify hook + RECIPE_DOM_FALLBACK_PENDING emit + quarantine + re-learn | ✓ VERIFIED | 695 lines; hook in both tiers (:485, :558); `_quarantineAndRelearn` (:135); 3 typeof-guarded accessors (rot-detector, learned-store, discovery); consent gate above dispatch unchanged |
| `extension/utils/capability-catalog.js` | quarantinedBundledSlugs Set + quarantineBundled + resolve-skip | ✓ VERIFIED | null-proto Set (:100); functions exported (:366-367); resolve-skip after learned-first, REGISTRY immutable (:310) |
| `extension/utils/capability-recipe-schema.js` | v2 schema, schemaVersion enum:[1,2], optional capturedAt+expectedShape, additionalProperties:false | ✓ VERIFIED | version 2 (:68); enum:[1,2] not const (:103); both optional fields present; v1 fixture validates success:true |
| `extension/utils/capability-interpreter.js` | expectedShape + capturedAt carry into bound spec | ✓ VERIFIED | :485-486 carry both, mirroring the extract carry |
| `extension/utils/recipe-synthesizer.js` | conservative expectedShape:'@' + capturedAt, schemaVersion 2 | ✓ VERIFIED | SCHEMA_VERSION=2 (:75); expectedShape:'@' (:302); capturedAt ISO (:306) |
| `extension/ai/tool-executor.js` | autopilot makeResult surfaces typed reason / fellBackToDom | ✓ VERIFIED | :709-715 surfaces errorCode + preserves result verbatim; no executeTool call (INV-02) |
| `extension/ai/agent-loop.js` | strengthened buildSystemPrompt DOM-fallback hint, iterator untouched | ✓ VERIFIED | :731 prompt string strengthened; iterator 4 lines byte-identical (INV-04) |
| `tests/capability-rot-detector.test.js` | taxonomy + expectedShape suite | ✓ VERIFIED | 308 lines; 28/0 green in-process |
| `tests/provider-parity.test.js` | 7-provider capability+fallback parity | ✓ VERIFIED | 220 lines; 31/0 green; all 7 PROVIDER_KEYS |
| `tests/recipe-schema-lock.test.js` | frozen v2 schema hash + frozen tool hash | ✓ VERIFIED | 152 lines; 3/0 green; real digest, no TBD |
| `tests/capability-router.test.js` | broken->fallback + quarantine + re-learn + no-mask assertions | ✓ VERIFIED | 579 lines; 38/0 green; pre-existing assertions preserved |
| `tests/capability-autopilot-parity.test.js` | typed reason / fellBackToDom in makeResult | ✓ VERIFIED | 311 lines; 13/0 green |
| `tests/capability-recipe-schema.test.js` | migrated regression gate (v1 valid, out-of-enum rejected, v2+optional valid) | ✓ VERIFIED | 220 lines; EXIT 0 in-process; in npm test chain |
| `catalog/recipes/_fixtures/valid-recipe-v2.json` | v2 accept fixture (schemaVersion:2 + capturedAt + expectedShape) | ✓ VERIFIED | 21 lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| capability-router.js (both tiers) | FsbCapabilityRotDetector.classifyRecipeBroken | post-executeBoundSpec verdict; broken -> _err('RECIPE_DOM_FALLBACK_PENDING') | ✓ WIRED | :486 + :562; emit :495 + :565 |
| capability-catalog.js resolve | quarantinedBundledSlugs | skip-quarantined check before REGISTRY return | ✓ WIRED | :310 returns null, after learned-first |
| capability-router.js (rot path) | FsbLearnedRecipeStore.quarantine + FsbDiscoverySession.runDiscovery | best-effort quarantine + wired re-learn | ✓ WIRED | :140 / :147 / :153 (all typeof-guarded, fire-and-forget) |
| tool-executor.js autopilot door | router response carrying RECIPE_DOM_FALLBACK_PENDING | makeResult error=errorCode, result=response verbatim | ✓ WIRED | :713-714 |
| agent-loop.js buildSystemPrompt | model DOM-completion behavior | strengthened hint string | ✓ WIRED | :731 |
| package.json scripts.test | 3 new test files | && chain append after learned cluster | ✓ WIRED | chain-wired = true (verified) |
| scripts/verify-recipe-path-guard.mjs | capability-rot-detector.js | RECIPE_PATH_ALLOWLIST | ✓ WIRED | guard EXIT 0 |
| mcp/src/errors.ts | RECIPE_EXPIRED / RECIPE_DOM_FALLBACK_PENDING | /^RECIPE_.+$/ passthrough (NO edit) | ✓ WIRED | :137 regex present; errors.ts last edited Phase 27, NOT this phase |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rot taxonomy + expectedShape | `node tests/capability-rot-detector.test.js` | 28 passed, 0 failed, EXIT 0 | ✓ PASS |
| 7-provider parity (INV-03) | `node tests/provider-parity.test.js` | 31 passed, 0 failed, EXIT 0 | ✓ PASS |
| Schema-lock (INV-01) | `node tests/recipe-schema-lock.test.js` | 3 passed, 0 failed, EXIT 0 | ✓ PASS |
| Router fallback + quarantine + re-learn + no-mask | `node tests/capability-router.test.js` | 38 passed, 0 failed, EXIT 0 | ✓ PASS |
| Autopilot door surfacing | `node tests/capability-autopilot-parity.test.js` | 13 passed, 0 failed, EXIT 0 | ✓ PASS |
| Migrated schema regression | `node tests/capability-recipe-schema.test.js` | EXIT 0 | ✓ PASS |
| Synthesizer stamp | `node tests/recipe-synthesizer.test.js` | EXIT 0 | ✓ PASS |
| INV-04 iterator byte-untouched | `node tests/agent-loop-iterator-guard.test.js` | EXIT 0 (4 schedules byte-identical) | ✓ PASS |
| Recipe-path eval-free + allowlist | `node scripts/verify-recipe-path-guard.mjs` | EXIT 0 | ✓ PASS |
| Live v1 fixture validates under enum[1,2] | node validateRecipe(valid-recipe.json) | success = true | ✓ PASS |
| **HEAL-05 MILESTONE GATE: full chain** | `npm test` | **EXIT 0, zero FAIL lines** (ran in verifier's own process) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Recipe-path CI guard (eval-free + allowlist disk-glob) | `bash`-equivalent `node scripts/verify-recipe-path-guard.mjs` | EXIT 0 (20 files clean) | PASS |

No `scripts/*/tests/probe-*.sh` probes are declared for this phase; the recipe-path guard + the zero-framework suites are the phase's runnable checks and were all executed in-process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HEAL-01 | 32-01, 32-03, 32-05 | Broken recipe -> DOM automation still completes the task | ✓ SATISFIED | Router emit + autopilot surfacing + prompt hint; CI half green (router/autopilot suites); live half = UAT-32-01 (human_needed debt) |
| HEAL-02 | 32-01, 32-02 | Recipes stamped capturedAt + expected-shape; rot -> RECIPE_EXPIRED | ✓ SATISFIED | capability-rot-detector.js + schema v2; rot-detector 28/0 |
| HEAL-03 | 32-01, 32-03, 32-05 | Broken recipe quarantined/demoted; re-learned where possible | ✓ SATISFIED | learned/bundled quarantine + resolve-skip + wired runDiscovery; router suite green; live re-learn = UAT-32-01 debt |
| HEAL-04 | 32-01, 32-02, 32-03 | Taxonomy distinguishes broken vs no-results; fallback never masks | ✓ SATISFIED | classifyRecipeBroken branch order; no-results/logged-out/passthrough asserted green |
| HEAL-05 | 32-01, 32-04 | Capability + fallback pass across 7 providers (INV-03) + schema-lock (INV-01) | ✓ SATISFIED | provider-parity 31/0 + schema-lock 3/0 + full npm test EXIT 0 (milestone gate) |

All 5 phase requirement IDs (HEAL-01..05) appear in PLAN frontmatter and are cross-referenced against REQUIREMENTS.md (lines 56-60). No ORPHANED requirements — REQUIREMENTS.md maps exactly HEAL-01..05 to Phase 32 and all are claimed by plans.

### Hard Invariants

| Invariant | Status | Evidence |
|-----------|--------|----------|
| INV-01 (frozen tool hash + schema-lock) | ✓ VERIFIED | Frozen tool registry hash `ad6efb8c...` unmoved (schema-lock + tool-definitions-parity green); frozen v2 RECIPE_SCHEMA hash `f35211f5...` real, no TBD |
| INV-02 (one engine, no parallel stack) | ✓ VERIFIED | Autopilot door surfaces typed reason only; NO executeTool/run_task call inside executeCapabilityToolForAutopilot; completion is model-driven |
| INV-03 (7-provider parity) | ✓ VERIFIED | provider-parity 31/0 across all 7 PROVIDER_KEYS; fallback reason byte-equal |
| INV-04 (iterator byte-untouched) | ✓ VERIFIED | Exactly 4 setTimeout schedule lines (100/100/5000/2000) byte-identical; agent-loop-iterator-guard EXIT 0; only buildSystemPrompt:731 changed |
| Eval-free + allowlisted rot-detector | ✓ VERIFIED | recipe-path guard EXIT 0; zero dynamic-code constructs (comments included) |
| RECIPE_EXPIRED rides /^RECIPE_.+$/ (no errors.ts edit) | ✓ VERIFIED | errors.ts:137 passthrough present; last errors.ts commit is Phase 27 (8d7a4dbd), not Phase 32 |
| Fallback inherits consent + origin-pin | ✓ VERIFIED | Consent gate sits above tier dispatch (unchanged); re-learn consent self-enforced in startSession; DOM fallback acts on the owned active tab (two-point pin) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | — | Zero debt markers in any Phase-32 modified production file (rot-detector, router, catalog, schema, interpreter, synthesizer, tool-executor, agent-loop) |
| capability-rot-detector.js | 40 | "console." | ℹ️ Info | Inside a comment only (the V7 no-body-log note); no actual console.* of any payload — V7 redaction posture holds |

No blocker anti-patterns. The rot-detector logs nothing; result.data is passed to the jmespath engine for shape evaluation only.

### Code-Review Cross-Check (32-REVIEW.md, status: resolved)

The deep code review found 0 blocker / 0 high / 2 medium / 3 low. Independently corroborated against the code:
- **WR-01 (resolved):** `_looksLikeHtmlDocument` structure-only auth-wall sniff wired into classifyRecipeBroken step 5a (rot-detector.js:99-104, 225-227); regression tests present and green (the in-process run shows the "200 login-HTML under '@' -> RECIPE_EXPIRED" + "never-mask empty JSON" assertions passing).
- **WR-02 (resolved):** T1a head-path contract comments corrected (router.js:539-556) — `entry.recipe` is always null on T1a by design; under-detect-never-mis-heal direction; no behavior change.
- **IN-01 (resolved):** belt-and-suspenders comment added at capability-fetch.js for the redirect:'manual' dead disjunct.
- **IN-02 / IN-03 (no change, intentional fail-safe):** confirmed correct credential-replay posture (sensitive-origin re-learn no-ops without confirmation).

### Human Verification Required

#### 1. Live self-healing end-to-end (UAT-32-01)

**Test:** Load the unpacked extension in Chrome; sign in to a target authenticated origin that has a capability recipe; make that recipe broken (rotted, or forced 4xx/empty/shape-mismatch); invoke the capability for a real task.
**Expected:** (a) the broken recipe is DETECTED as a broken verdict (RECIPE_EXPIRED), not silently returned wrong/empty; (b) the autopilot does NOT hard-fail — it falls back to the existing DOM tools (run_task/click/type_text/read_page/get_site_guide) and STILL completes the SAME task; (c) the broken recipe is quarantined/demoted (skipped on the next resolve); (d) a consent-gated re-learn (runDiscovery) is offered/triggered, never silent auto-capture; (e) a legitimate no-results and (f) a logged-out (302->login) are surfaced as-is and NOT healed away.
**Why human:** Requires a live Chrome extension + a real authenticated first-party origin + a genuinely-broken recipe + a real credential (forbidden in CI per GOV-06). This cannot run headlessly. It is recorded as `human_needed` debt in `32-HUMAN-UAT.md` (UAT-32-01, result: pending), NOT a fabricated pass, matching the Phase 27/28/29/30/31 live-UAT posture. It does NOT block the HEAL-05 CI milestone gate (D-15) — every FSB-owned property of this loop is proven headlessly (see truths 1-5).

### Gaps Summary

No gaps. All five must-have truths are VERIFIED against the codebase by reading the production wiring and running the targeted suites plus the full `npm test` milestone gate (HEAL-05) in this verifier's own process — EXIT 0, zero FAIL lines. All four hard invariants (INV-01..04) hold. The eval-free/allowlist, errors.ts-untouched, and consent/origin-pin-inherited constraints all hold. The 6 code-review findings (0 blocker/high) are resolved or confirmed intentional fail-safes.

The single outstanding item is the irreducibly-live self-healing UAT (UAT-32-01), recorded as `human_needed` debt per the established Phase 27-31 posture (D-15). It is NOT a gap — the CI half is fully green and the live end-to-end completion cannot run in CI without a real credential (GOV-06). Per the milestone-gate semantics, HEAL-05 (full npm test green) is the v0.9.99 milestone completion criterion, and it is met. This being the LAST phase of milestone v0.9.99, the milestone gate is closed.

---

_Verified: 2026-06-23T10:05:00Z_
_Verifier: Claude (gsd-verifier)_
