---
phase: 35-denylist-expansion-import-time-classification-gate-lands-fir
plan: 03
subsystem: consent
tags: [consent-gate, capability-router, posture-b, denylist, mutating, RECIPE_CONSENT_MUTATING_REQUIRED, INV-03, DENY-04]

# Dependency graph
requires:
  - phase: 35-01
    provides: "sensitiveOrigins seed in service-denylist.json (classify().sensitive returns true for stripe/coinbase/twilio/ynab/IG/FB/TikTok/X) — the data the re-gate keys off"
  - phase: 34 (v0.9.99 substrate)
    provides: "_evaluateConsent chokepoint, the dual-field _err helper, the opt-out Auto posture committed in 68ceea90"
provides:
  - "Posture-B step-(3.5) mutating-elevation branch in capability-router._evaluateConsent, scoped to classify(origin).sensitive===true"
  - "A sensitive-origin WRITE without the per-origin mutating flag returns the byte-exact dual-field RECIPE_CONSENT_MUTATING_REQUIRED"
  - "consent-mutation-gate.test.js extended with the posture-B sensitive cases + the non-sensitive github.com regression canary kept verbatim"
affects: [36-codegen-pipeline, 37-breadth-a, 38-breadth-b, 39-breadth-c, 40-depth-1, 41-depth-2, any phase emitting a sensitive-origin descriptor reachable under Auto]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped consent re-gate: re-introduce a removed gate branch narrowed by classify().sensitive instead of reverting the whole opt-out posture"
    - "Byte-exact typed-reason recovery from git history (68ceea90^) re-emitted via the dual-field _err helper to hold INV-03 across the 7 universal-provider targets"
    - "Live-global stub swap mid-test (_denylist() reads global.FsbServiceDenylist at call time) to exercise both a non-sensitive and a sensitive classification without a module re-require"

key-files:
  created: []
  modified:
    - extension/utils/capability-router.js
    - tests/consent-mutation-gate.test.js

key-decisions:
  - "Used the distinct decision label 'mutating_required' (not the old 'mutating', not reusing 'ask') so the audit trail names the posture-B re-gate explicitly; the invoke caller only checks decision !== 'allow', so it flows through and blocks correctly"
  - "Recovered the typed reason RECIPE_CONSENT_MUTATING_REQUIRED byte-for-byte from 68ceea90^ rather than retyping it, satisfying INV-03 (drift like RECIPE_MUTATING_CONSENT_REQUIRED would break the /^RECIPE_.+$/ passthrough)"
  - "Refreshed the now-stale auto-allow comment block (it claimed mutating/mutatingAllowed are 'no longer consulted') to name the step-(3.5) sensitive-write re-gate — a correctness fix to the in-code documentation, no behavior change"

patterns-established:
  - "Scope a re-gate strictly to classify().sensitive===true: reads pass under Auto everywhere, non-sensitive writes pass, only the sensitive write without the per-origin flag is re-gated — narrows the opt-out base, never reverts it"
  - "Posture-B test discipline: keep the pre-existing non-sensitive (github.com) cases verbatim as the regression canary, add the sensitive cases in a second block"

requirements-completed: [DENY-04]

# Metrics
duration: 2min
completed: 2026-06-24
---

# Phase 35 Plan 03: Posture-B Sensitive-Write Re-Gate (DENY-04) Summary

**Re-introduced a single mutating-elevation branch (step 3.5) into `capability-router._evaluateConsent`, scoped to `classify(origin).sensitive===true`, so a WRITE to a sensitive origin without the per-origin mutating flag returns the byte-exact dual-field `RECIPE_CONSENT_MUTATING_REQUIRED` — narrowing the 68ceea90 opt-out base to sensitive origins only while reads and non-sensitive writes stay fully open.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-24T15:26:54Z
- **Completed:** 2026-06-24T15:28:56Z
- **Tasks:** 3 (1 TDD: RED test → GREEN impl; 1 cross-suite verification)
- **Files modified:** 2

## Accomplishments
- **Posture B is live** (the headline security control of the milestone): a sensitive-origin WRITE under Auto without the per-origin mutating flag is now impossible — it returns `RECIPE_CONSENT_MUTATING_REQUIRED`.
- **INV-03 held:** the typed reason was recovered byte-exact from `68ceea90^` and re-emitted via the dual-field `_err` helper, so `error.code`, `error.errorCode`, and `error.error` all carry the same string (proven in the test) and survive the `/^RECIPE_.+$/` MCP passthrough across all 7 universal-provider targets.
- **Narrowed, not reverted:** reads pass under Auto everywhere; non-sensitive writes pass (the github.com regression canary stays green); denied origins are still hard-blocked at step (1). Only the sensitive-but-not-denied WRITE without the flag is re-gated; the per-origin mutating flag elevates it back to allow.
- **No regression across the consent/denylist neighbors** (5 suites) and the Wall-1 recipe-path guard stays green.

## Task Commits

1. **Task 1: Add sensitive-origin posture-B cases (RED)** — `78c2b73b` (test) — TDD RED: the sensitive POST/write cases fail because step (3.5) does not exist yet (FAIL=5).
2. **Task 2: Insert the scoped step-(3.5) branch** — `395611ce` (feat) — TDD GREEN: the branch makes all 17 consent-mutation-gate assertions pass (FAIL=0).
3. **Task 3: Cross-suite regression confirmation** — no commit (verification-only task; adds no files). All five consent/denylist suites + the recipe-path guard exit 0.

**Plan metadata:** committed separately with this SUMMARY + STATE.md + ROADMAP.md.

## Files Created/Modified
- `extension/utils/capability-router.js` — Added step (3.5) in `_evaluateConsent` after the `mode === 'ask'` block and before the final `decision: 'allow'` return. Fires only when `mutating && !mutatingAllowed` AND `denylist.classify(origin).sensitive === true` (classify guarded with the step-1 `isDenied` try/catch pattern); returns `{ decision: 'mutating_required', ..., error: _err('RECIPE_CONSENT_MUTATING_REQUIRED', { origin, slug }) }`. Reuses the already-computed in-scope `mutating` / `mutatingAllowed` / `denylist` values (no recomputation). Refreshed the stale auto-allow comment to name the re-gate.
- `tests/consent-mutation-gate.test.js` — Kept the existing non-sensitive `github.com` block verbatim (the regression canary). Added a `DENY-04 (posture B)` block: swaps the live global `FsbServiceDenylist` stub to `{sensitive:true, denied:false}`, resets the store, sets `dashboard.stripe.com` to Auto, and asserts sensitive GET → allow; sensitive POST (no flag) → `RECIPE_CONSENT_MUTATING_REQUIRED` on `code`/`errorCode`/`error`; a T1a write-descriptor → same; then `setOriginMutating(origin, true)` and asserts sensitive POST → allow.

## Decisions Made
- **`decision: 'mutating_required'` label** (per the plan's Q4 recommendation) over reusing `'ask'` or the old `'mutating'` — clearer for the audit trail; the invoke caller only checks `!== 'allow'`, so it flows through and blocks identically.
- **Byte-exact recovery from git** (`git show 68ceea90^:...`) rather than retyping the constant — required to satisfy INV-03.
- **Refreshed the in-code auto-allow comment** that wrongly claimed `mutating`/`mutatingAllowed` are no longer consulted — a documentation-correctness fix; no behavior change.

## Deviations from Plan

None - plan executed exactly as written. (The comment refresh in the auto-allow block was an in-scope correctness fix to the code I was editing — it keeps the file's own documentation accurate to the new step (3.5); no extra files touched, no behavior beyond the planned branch.)

## Issues Encountered
None. The TDD RED was precise (only the sensitive-write-without-flag assertions failed; the non-sensitive canary and the sensitive GET stayed green), and the GREEN was achieved by the single planned branch. The sensitive-POST-with-flag case passed in both RED and GREEN (it was already `allow` under opt-out, and stays `allow` because `mutatingAllowed` short-circuits the step-(3.5) guard) — the intended behavior.

## Verification

- `node tests/consent-mutation-gate.test.js` → PASS=17 FAIL=0 (EXIT 0)
- `node tests/capability-router.test.js` → passed: 41 failed: 0 (EXIT 0)
- `node tests/consent-gate.test.js` → PASS=10 FAIL=0 (EXIT 0)
- `node tests/consent-chokepoint.test.js` → PASS=7 FAIL=0 (EXIT 0)
- `node tests/consent-policy-store.test.js` → PASS=40 FAIL=0 (EXIT 0)
- `node tests/service-denylist.test.js` → PASS=50 FAIL=0 (EXIT 0)
- `node scripts/verify-recipe-path-guard.mjs` → PASS (20 recipe-path files clean) (EXIT 0)
- `git diff` for this plan touches only `capability-router.js` + `consent-mutation-gate.test.js` — no neighbor assertion modified.

## Threat Model Coverage
The branch is the planned `mitigate` for the plan's threat register — no new surface introduced:
- **T-35-09 (EoP, sensitive WRITE under Auto):** mitigated — the step-(3.5) branch returns `RECIPE_CONSENT_MUTATING_REQUIRED`.
- **T-35-10 (Tampering, re-gate reverts the whole posture):** mitigated — fires only inside `cls.sensitive === true`; the non-sensitive github.com canary stays green; Task 3 confirmed the consent neighbors stay green.
- **T-35-11 (Repudiation/Tampering, typed-reason drift):** mitigated — string recovered byte-exact from `68ceea90^`, emitted via the dual-field `_err`; the test asserts `code` AND `errorCode` AND `error`.
- **T-35-12 (Tampering, dynamic-code construct on the recipe path):** mitigated — `verify-recipe-path-guard.mjs` exits 0; the branch added no eval/new Function/import.

## Next Phase Readiness
- DENY-04 is complete; posture B is enforced. The remaining Phase 35 plans (denylist data 35-01/02, the classification gate 35-02, provenance scaffold 35-04) are all complete per STATE.md. The phase's security floor is now in place for Phase 36's codegen pipeline: when 2,523 descriptors land, a sensitive-origin WRITE still requires the per-origin mutating flag, and the import-time gate (DENY-03) makes an unclassified sensitive origin a build failure.
- No blockers. No external setup required.

## Self-Check: PASSED
- FOUND: `.planning/phases/35-.../35-03-SUMMARY.md`, `extension/utils/capability-router.js`, `tests/consent-mutation-gate.test.js`
- FOUND commits: `78c2b73b` (test RED), `395611ce` (feat GREEN)
- Re-verified at HEAD: `consent-mutation-gate` EXIT 0, `capability-router` EXIT 0

---
*Phase: 35-denylist-expansion-import-time-classification-gate-lands-fir*
*Completed: 2026-06-24*
