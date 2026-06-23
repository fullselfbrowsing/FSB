---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
plan: 01
subsystem: testing
tags: [chrome-debugger, cdp, network-capture, recipe-synthesis, learned-recipes, redaction, minisearch, ed25519, recipe-path-guard, zero-framework]

# Dependency graph
requires:
  - phase: 30-consent-governance-recipe-signature-verification-audit-legal
    provides: "consent gate (consent-policy-store + service-denylist isDenied/classify), the Ed25519 verifyRecipeEnvelope provenance model + the HI-01 trusted-provenance rule, redactForLog shape-only discipline, the recipe-path CI guard + RECIPE_PATH_ALLOWLIST"
  - phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
    provides: "the T2 router stub (RECIPE_LEARN_PENDING), catalog resolve + biasByOwnedOrigin, the interpretRecipe -> executeBoundSpec replay path"
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    provides: "the MiniSearch capability index (INDEX_OPTIONS, buildOrRestore, getRecipeBySlug, the fsbCapabilityIndex snapshot)"
provides:
  - "Nine zero-framework RED test suites (the executable contract Waves 1-3 implement against) covering DISC-02/03/04 + LEARN-01..04 + D-09/D-10/D-13/D-15/D-16"
  - "A NEW shared chrome.debugger event-driver stub fixture (tests/_helpers/cdp-event-driver.js): canned onEvent feeder + sendCommand recorder + canned request/response factories + the verbatim installChromeStorageStub"
  - "RECIPE_PATH_ALLOWLIST extended with recipe-synthesizer.js + learned-recipe-store.js (the two recipe-path-adjacent net-new modules); guard still PASS"
  - "All nine suites wired into the package.json scripts.test chain tail"
  - "A finalized 31-VALIDATION.md per-task verification map (real 31-NN task ids, nyquist_compliant:true, wave_0_complete:true)"
affects: [31-02, 31-03, 31-04, 31-05, 31-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared chrome.debugger event-driver stub: a canned onEvent(source,method,params) feeder + a sendCommand recorder so SW-side CDP capture is testable in Node without a live browser (DISC-02)"
    - "Security RED contract by serialized-artifact grep: the redaction suite stringifies the WHOLE redacted output and asserts no auth/body/query/PII substring survives (the audit-log-no-secret discipline applied to capture)"
    - "Registered-ahead-of-creation allowlisting for non-capability-* recipe-path modules (the Phase-30 consent-store precedent): Check 1 existsSync-skips the absent path, Check 4 is not in play for a non-glob name"

key-files:
  created:
    - "tests/_helpers/cdp-event-driver.js"
    - "tests/network-capture.test.js"
    - "tests/network-capture-consent.test.js"
    - "tests/network-capture-redaction.test.js"
    - "tests/recipe-synthesizer.test.js"
    - "tests/learned-recipe-store.test.js"
    - "tests/learned-promote-after-replay.test.js"
    - "tests/learned-search-add.test.js"
    - "tests/learned-t2-outranking.test.js"
    - "tests/learned-local-provenance-exempt.test.js"
  modified:
    - "scripts/verify-recipe-path-guard.mjs"
    - "package.json"
    - ".planning/phases/31-network-capture-discovery-recipe-synthesis-learned-recipes/31-VALIDATION.md"

key-decisions:
  - "Authored a single shared CDP event-driver helper (installChromeStorageStub lifted verbatim from consent-policy-store.test.js + a makeCdpDriver onEvent/sendCommand stub + canned request/response factories) so all capture suites share ONE storage + ONE event idiom"
  - "Encoded the from:'response' synthesis cap (D-11/Pitfall 4) directly in the synthesizer RED suite: a response-minted-CSRF capture must yield same-origin-cookie + flaggedForPhase32, NEVER csrf.from:'response' (which the declarative replay path cannot execute)"
  - "Encoded the promote-after-replay {trustedProvenance:'local'} threading as an injected-stub assertion (the stub records the opts interpretRecipe received) so HI-01 is proven before the Wave-3 wiring lands"
  - "Allowlisted ONLY recipe-synthesizer.js + learned-recipe-store.js (the recipe-path-adjacent modules); did NOT add network-capture/redactor (they never bind/execute a recipe), exactly as the plan specified"
  - "Converted the VALIDATION.md status glyphs to ASCII (no emojis) per the project CLAUDE.md no-emoji directive"

patterns-established:
  - "CDP event-driver stub: makeCdpDriver() returns { listeners, addListener, fire(source,method,params), sendCommand recorder, sendCommandCount } modeling chrome.debugger.onEvent + sendCommand for Node-side capture testing"
  - "Mixed-disposition RED suite: a suite may carry RED-now assertions (the missing behavior) alongside already-green guardrails (e.g. the HI-01 payload-cannot-self-declare rule, already enforced today) -- the suite exits non-zero on the RED assertions while locking the security invariant green from the start"

requirements-completed: [DISC-02, DISC-03, DISC-04, LEARN-01, LEARN-02, LEARN-03, LEARN-04]

# Metrics
duration: 13min
completed: 2026-06-23
---

# Phase 31 Plan 01: Wave-0 Validation Contract Summary

**Nine zero-framework RED suites + a shared chrome.debugger event-driver stub + the RECIPE_PATH_ALLOWLIST extension + the package.json test-chain wiring + a finalized 31-VALIDATION.md -- the executable Nyquist contract that fails loud until Waves 1-3 land network capture, redaction, synthesis, and the learned-recipe store.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-23T01:35:33Z
- **Completed:** 2026-06-23T01:48:43Z
- **Tasks:** 3
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments
- Authored the NEW shared CDP event-driver stub (`tests/_helpers/cdp-event-driver.js`): a canned `onEvent(source,method,params)` feeder + a `sendCommand` recorder (so a test can assert ZERO `Network.getResponseBody` calls, D-08) + `cannedRequestEvent`/`cannedResponseEvent` factories + the verbatim `installChromeStorageStub`.
- Authored nine RED suites encoding the full Phase-31 contract: capture dispatch/filter (DISC-02/04), the consent gate (DISC-04/D-03), THE redaction security test (DISC-03/LEARN-02, no auth/body/query/PII survives a serialized-artifact grep), synthesis (LEARN-01 incl. the from:'response' cap, D-11), promote-after-replay (D-10), the per-origin store (D-13/D-16 round-trip+LRU+quarantine), search-add (LEARN-03), T2 outranking (LEARN-04/D-15), and the 'local' provenance exemption (D-09/HI-01).
- Extended `RECIPE_PATH_ALLOWLIST` with `recipe-synthesizer.js` + `learned-recipe-store.js` (the two recipe-path-adjacent net-new modules) and kept `node scripts/verify-recipe-path-guard.mjs` GREEN (19 files clean).
- Wired all nine suites into the `package.json` `scripts.test` chain tail; finalized `31-VALIDATION.md` with real `31-NN` task ids, `nyquist_compliant: true`, and `wave_0_complete: true`.
- Verified the RED state is uniform and well-targeted: all nine suites exit non-zero; the t2-outranking + provenance suites' PASS lines confirm the test harness is sound (catalog/router/interpreter load; the origin-scoped negative case and the HI-01 self-declare guardrails are already green) while isolating exactly the Wave 1-3 behavior gaps.

## Task Commits

Each task was committed atomically:

1. **Task 1: CDP event-driver stub + 4 capture/synth RED suites** - `cb503149` (test)
2. **Task 2: 5 learned-recipe RED suites (store/promote/search/T2/local)** - `1ebdffe5` (test)
3. **Task 3: allowlist synth+store, wire 9 suites, finalize VALIDATION** - `3d46ff6c` (chore)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP/REQUIREMENTS) committed separately.

## Files Created/Modified
- `tests/_helpers/cdp-event-driver.js` - The NEW shared fixture: chrome.debugger onEvent feeder + sendCommand recorder + canned event factories + installChromeStorageStub (verbatim).
- `tests/network-capture.test.js` - DISC-02 method-dispatch + DISC-04 XHR/Fetch+same-origin filter; subresource/cross-origin/other-tab dropped; responseShape off the event; zero getResponseBody; non-Network method is a no-op.
- `tests/network-capture-consent.test.js` - DISC-04/D-03 gate: off/denied REJECTED (before attach), ask/auto ALLOWED, sensitive needs confirmedSensitive.
- `tests/network-capture-redaction.test.js` - THE security test: redactRequest/redactResponse shape-only; the serialized whole artifact contains no auth/body/query/PII substring (LEARN-02).
- `tests/recipe-synthesizer.test.js` - LEARN-01 validateRecipe-green recipe + descriptor; the from:'response' -> same-origin-cookie + flaggedForPhase32 cap (D-11/Pitfall 4); null on unsynthesizable.
- `tests/learned-recipe-store.test.js` - D-13/D-16 per-origin round-trip + versioned envelope shape + LRU evict-oldest-lastSuccessAt + quarantine flags-not-deletes.
- `tests/learned-promote-after-replay.test.js` - D-10 store-on-clean-replay / discard-on-failed-replay (injected interpret/execute stubs) + asserts the {trustedProvenance:'local'} threading (HI-01).
- `tests/learned-search-add.test.js` - LEARN-03/D-14 addLearnedRecipe findable + getRecipeBySlug + bumped snapshot survives loadJSON(INDEX_OPTIONS) (Pitfall 5).
- `tests/learned-t2-outranking.test.js` - LEARN-04/D-15 resolve learned-T2 over generic T1b (origin-scoped) + router T2 dispatch-vs-RECIPE_LEARN_PENDING-stub.
- `tests/learned-local-provenance-exempt.test.js` - D-09 'local'-vouched binds with zero verifyEd25519 calls + HI-01 payload-cannot-self-declare-'local'.
- `scripts/verify-recipe-path-guard.mjs` - RECIPE_PATH_ALLOWLIST extended with the two recipe-path-adjacent net-new modules (explicit non-glob entries; registered ahead of creation).
- `package.json` - The nine suites appended to the scripts.test chain tail (leaf suites before wiring suites; no existing entry reordered).
- `.planning/phases/31-.../31-VALIDATION.md` - Real 31-NN task ids, nyquist_compliant:true, wave_0_complete:true, Wave-0 checklist + sign-off checked, ASCII-only status glyphs.

## Decisions Made
- Shared CDP event-driver helper over per-suite duplication (one storage idiom, one event idiom).
- The from:'response' synthesis cap is encoded in the RED suite NOW so the Wave-3 synthesizer cannot emit a recipe the declarative replay path would discard at replay (the GATING pitfall).
- The promote-after-replay {trustedProvenance:'local'} threading is proven via an injected-stub opts-recorder, keeping the suite framework-free and threading-agnostic.
- Allowlisted only the two recipe-path-adjacent modules (synth + store), not the redactor/network-capture, per the plan and the "never bind/execute a recipe" boundary.
- VALIDATION.md status glyphs converted to ASCII to honor the project CLAUDE.md no-emoji rule.

## Deviations from Plan

None - plan executed exactly as written. All three tasks landed their specified files, the acceptance criteria passed, and the RED state is the intended Wave-0 contract (the nine suites fail loud because their target modules/edits are absent, which is by design -- Waves 1-3 turn them GREEN).

One minor non-deviation worth noting: the plan's Task-3 acceptance used `grep -c` expecting 4 for the four named suites; this repo stores `scripts.test` as a SINGLE line, so `grep -c` (which counts matching lines) returns 1. The substantive check -- `grep -o ... | wc -l` -- returns 4 (one occurrence of each named suite), so the acceptance intent (all four wired) is satisfied. No change was needed.

## Issues Encountered
- A linter touched 31-VALIDATION.md between a Read and an Edit during the status-glyph ASCII conversion; re-read and re-applied the edit cleanly. No content impact.

## Known Stubs

None that block the plan's goal. The nine suites reference SW modules/edits that do NOT exist yet (`extension/utils/network-capture.js`, `network-capture-redactor.js`, `recipe-synthesizer.js`, `learned-recipe-store.js`, plus the `addLearnedRecipe` export, the catalog `_getLearned` prepend, the router T2 dispatch, and the interpreter/signature `'local'` exemption). These absent references are the INTENDED Wave-0 RED contract -- the plan's explicit goal is to author the RED suites BEFORE their modules so Waves 1-3 turn them RED -> GREEN. They are tracked in `31-VALIDATION.md` (each row marked RED with the plan that resolves it) and are not stubs that mask incomplete behavior.

## User Setup Required
None - no external service configuration required. Zero new packages (RESEARCH Package Legitimacy Audit: no installs).

## Next Phase Readiness
- Wave 0 is COMPLETE: the Nyquist sampling is armed. Every downstream task (31-02 capture/redaction, 31-03 synthesis/store, 31-04 'local' provenance, 31-05 search/T2 wiring) now has an `<automated>` command that fails loud until its behavior lands.
- The CI gating constraint is satisfied ahead of time: the two recipe-path-adjacent modules are allowlisted, so the moment Wave 3 creates them, Check 1 scans them eval-free and Check 4 stays green.
- Caution for Waves 1-3: keep `recipe-synthesizer.js` + `learned-recipe-store.js` free of eval/new Function/import (even in comments) or the guard fails closed; and reuse the SAME INDEX_OPTIONS instance in addLearnedRecipe (Pitfall 5) or the loadJSON round-trip suite stays red.

## Self-Check: PASSED

- All 10 created test/helper files + the SUMMARY exist on disk.
- All three task commits exist in the git log (`cb503149`, `1ebdffe5`, `3d46ff6c`).
- The allowlist extension + package.json wiring are present.
- `node scripts/verify-recipe-path-guard.mjs` -> PASS (19 files clean).
- All nine Phase-31 suites exit non-zero (the intended Wave-0 RED).
- No emojis in any created/modified file.

---
*Phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes*
*Completed: 2026-06-23*
