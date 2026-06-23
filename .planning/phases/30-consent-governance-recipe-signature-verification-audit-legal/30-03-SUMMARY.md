---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
plan: 03
subsystem: security
tags: [ed25519, web-crypto, jcs, rfc8785, signature-verification, service-denylist, consent, legal, capability-recipe]

# Dependency graph
requires:
  - phase: 30-01
    provides: "Wave-0 RED tests (recipe-signature, interpreter-hook, service-denylist), Ed25519 fixture keypair + signed/tampered fixtures + sign-fixtures.mjs (the JCS byte-source), RECIPE_PATH_ALLOWLIST pre-arm for capability-signature.js + service-denylist.js, background.js denylist-load wiring"
  - phase: 29
    provides: "interpretRecipe (schema-validate -> bind) + _runDeclarativeTier caller; the bundled-head catalog/router this plan must not break"
provides:
  - "Native-first Ed25519/JCS recipe-signature verifier (extension/utils/capability-signature.js): verifyEd25519 (fail-closed feature-detect), jcsCanonicalize (RFC-8785 closed-shape), verifyRecipeEnvelope (provenance-aware)"
  - "Signature-verify hook inside interpretRecipe AFTER schema-validate, BEFORE bind: non-bundled -> RECIPE_SIGNATURE_INVALID on failure; bundled/no-meta EXEMPT (D-07)"
  - "Service denylist + sensitive-origin classifier (extension/utils/service-denylist.js + extension/config/service-denylist.json): isDenied + classify, the single source of truth for origin sensitivity (D-14)"
  - "docs/LEGAL.md: automation posture + consent model + audit retention + service-denylist rationale + recipe-integrity posture (GOV-08)"
affects: [30-02, 31]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native-first Ed25519 via crypto.subtle with a one-time tri-state feature-detect that FAILS CLOSED (no silent assume-valid)"
    - "In-house RFC-8785 JCS serializer for a closed JSON vocabulary (UTF-16 key sort + integer-only number tripwire), byte-identical to the offline fixture signer"
    - "Provenance-envelope wrapping shape {recipe, provenance, signature, capturedAt, schemaHash} so integrity metadata lives OUTSIDE an additionalProperties:false recipe core"
    - "Sync-dispatcher / Promise-on-verify-branch: interpretRecipe stays synchronous on the bundled/no-meta path (backward-compatible) and returns a Promise only on the async verify branch"
    - "Single source of truth for origin sensitivity (denylist + heuristic together) consulted by the gate, not a UI-only flag"

key-files:
  created:
    - extension/utils/capability-signature.js
    - extension/utils/service-denylist.js
    - extension/config/service-denylist.json
    - docs/LEGAL.md
  modified:
    - extension/utils/capability-interpreter.js
    - extension/utils/capability-router.js

key-decisions:
  - "Signed payload = JCS of { recipe:<core>, capturedAt, schemaHash } minus signature -- byte-verified against the fixture signature (proved before implementing)"
  - "interpretRecipe is NOT declared async; it is a sync dispatcher returning a Promise only on the non-bundled verify branch, so the existing sync callers + capability-interpreter.test.js stay green"
  - "Envelope detected by {recipe:object + provenance:string}; a Phase-29 bare core has neither, so the head is never misread as an envelope (no provenance field invented on the core)"
  - "noble pure-JS fallback DEFERRED to Phase 31 (per RESEARCH Open Question 2); absent-native posture is fail-closed, which only ever blocks non-bundled recipes (bundled are exempt)"
  - "Denylist host-pattern form: 'https://*.<domain>' subdomain-wildcard (apex + any subdomain) OR an exact origin; scheme must match"

patterns-established:
  - "Fail-closed cryptographic verification: missing verifier/key/signature -> RECIPE_SIGNATURE_INVALID, never assume-valid"
  - "Closed-vocabulary JCS canonicalization with a throw-on-out-of-vocab tripwire"
  - "Dual-export IIFE (globalThis.* + module.exports) for SW-global + Node-require, eval-free, on RECIPE_PATH_ALLOWLIST"

requirements-completed: [SIGN-01, SIGN-02, GOV-08]

# Metrics
duration: 38min
completed: 2026-06-21
---

# Phase 30 Plan 03: Recipe Signature Verification + Service Denylist + Legal Posture Summary

**Native-first Ed25519/JCS recipe-signature verifier hooked into interpretRecipe (after schema-validate, before bind) for non-bundled recipes, plus a conservative service denylist + sensitive-origin classifier (single source of truth) and a documented legal/retention/consent posture.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-06-21T18:05:00Z
- **Completed:** 2026-06-21T18:43:00Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- `capability-signature.js`: in-house RFC-8785 JCS serializer proven byte-for-byte identical to the offline fixture signer, native-first Ed25519 verify with a fail-closed feature-detect, and a provenance-aware `verifyRecipeEnvelope` that exempts bundled provenance (D-07) and fails closed on missing signature/key/verifier.
- Signature-verify hook wired inside `interpretRecipe` AFTER schema-validate and BEFORE bind: a non-bundled tampered/unsigned envelope is rejected with the typed dual-field `RECIPE_SIGNATURE_INVALID` (no errors.ts edit); the bundled/no-meta default path stays exempt and synchronous so the Phase-29 head and all existing sync callers are untouched.
- `service-denylist.js` + `service-denylist.json`: the single source of truth for origin sensitivity (D-14) -- `isDenied` (checked-first deny, non-enableable) + `classify` (denied-implies-sensitive plus a seeded sensitive match that feeds the Plan-02 gate's sensitive+Auto downgrade), over a conservative banking/government/primary-email/`*.gov` seed.
- `docs/LEGAL.md`: automation posture, consent model (Off/Ask/Auto + mutation + sensitive friction), audit-log retention (bounded ring + export/clear, secret-free), service-denylist rationale, and recipe-integrity posture.

## Task Commits

Each task was committed atomically:

1. **Task 1: capability-signature.js (native-first Ed25519 + in-house JCS + verifyRecipeEnvelope)** - `2d48cae9` (feat)
2. **Task 2: Hook signature verify into interpretRecipe (after schema-validate, before bind)** - `a8995f1d` (feat)
3. **Task 3: service-denylist.json + service-denylist.js (isDenied + classify) + docs/LEGAL.md** - `3dd3d10f` (feat)

_Note: the Wave-0 RED tests were authored by Plan 01; this plan supplied the GREEN implementations (the per-task commits above turn each RED test GREEN)._

## Files Created/Modified
- `extension/utils/capability-signature.js` (created) - native-first Ed25519 verify + in-house RFC-8785 JCS serializer + provenance-aware verifyRecipeEnvelope; dual-export IIFE, eval-free, on RECIPE_PATH_ALLOWLIST.
- `extension/utils/capability-interpreter.js` (modified) - envelope detection/unwrap + signature-verify hook (step 1b) after schema-validate and before bind; factored steps 2-6 into a synchronous `bindRecipeCore`; sync-dispatcher/Promise-on-verify-branch design preserves the sync contract.
- `extension/utils/capability-router.js` (modified) - `_runDeclarativeTier` now `await`s `interpretRecipe` (async only on the verify branch); the Phase-29 head passes no envelope, so it stays exempt.
- `extension/utils/service-denylist.js` (created) - isDenied + classify (single source of truth, D-14) + load() (chrome.runtime.getURL or Node require; degrades to empty, never throws); dual-export IIFE, eval-free, on RECIPE_PATH_ALLOWLIST.
- `extension/config/service-denylist.json` (created) - { v:1, deniedOrigins, sensitiveOrigins, deniedReason } conservative, user-extensible category seed.
- `docs/LEGAL.md` (created) - legal/ToS posture + consent model + audit retention + service-denylist + recipe-integrity posture.

## Decisions Made
- **Signed-payload scope proved before coding.** Reconstructed `{recipe, capturedAt, schemaHash}`, JCS-canonicalized it, and Ed25519-verified it against the fixture signature + fixture public key BEFORE writing the module, so the runtime serializer is provably byte-identical to `sign-fixtures.mjs` (RESEARCH Pitfall 3 / Assumption A3 closed).
- **Async only where required.** `interpretRecipe` is a synchronous dispatcher: it schema-validates synchronously, returns the bound result synchronously on the bundled/no-meta path, and returns a Promise only on the non-bundled verify branch. An `async function` would have forced a Promise on every path and broken the existing synchronous callers + `capability-interpreter.test.js`. The router (the one runtime caller that can pass an envelope) awaits it; `await` on the synchronously-returned plain object is a harmless no-op.
- **Envelope vs bare core.** Detected by a `recipe` object property PLUS a string `provenance` property. A Phase-29 recipe core has neither, so the bundled head is never misread as an envelope and no `provenance` field is invented on the core (D-07 exemption preserved exactly).
- **noble fallback deferred.** The pure-JS Ed25519 fallback is left as a one-line seam (deferred to Phase 31, RESEARCH Open Question 2). The absent-native posture is fail-closed, which only ever affects non-bundled recipes (bundled are exempt), so deferring it cannot weaken the gate.

## Deviations from Plan

None of the Rule 1-4 deviation classes were triggered. One wave-ordering dependency surfaced (documented below under Issues Encountered, not as an auto-fix): the Plan-01 `service-denylist.test.js` reaches into Plan-02 modules for its final gate-integration assertions, which are not in this plan's scope.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Plan executed as written. All Plan-03-owned acceptance criteria are GREEN.

## Issues Encountered

- **`service-denylist.test.js` has a Plan-02 dependency (wave ordering).** This plan (`depends_on: ["30-01"]`, wave 2) was executed before Plan 02 (the consent gate). The Wave-0 RED `service-denylist.test.js` (authored by Plan 01) verifies BOTH the denylist module (this plan) AND the gate's checked-first BLOCKED path (`FsbConsentGate` + `RECIPE_CONSENT_BLOCKED` from Plan 02). All 11 assertions this plan owns PASS (JSON shape + non-empty seeds + isDenied/classify behavior + github.com neither denied nor sensitive); the test then `require`s `extension/utils/consent-policy-store.js` (Plan 02, not yet on disk) and the remaining 5 gate-integration assertions cannot evaluate until Plan 02 lands. The test file itself documents this ("FsbConsentGate.evaluate exists (Plan 02; RED until then)"). This is expected cross-plan ordering, not a defect in Plan 03; the denylist module already exposes `classify(origin).sensitive`/`isDenied(origin)` exactly as the Plan-02 gate will consume them, so `node tests/service-denylist.test.js` flips fully GREEN once Plan 02 ships the gate. No action needed in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- **Plan 02 (consent gate):** can now consume `FsbServiceDenylist.isDenied(origin)` (checked-first deny) and `FsbServiceDenylist.classify(origin).sensitive` (sensitive+Auto downgrade) -- the single source of truth is in place. Wiring those calls into the gate turns the remaining `service-denylist.test.js` assertions GREEN.
- **Plan 04 (UI/showcase):** can link `docs/LEGAL.md` from the control panel + the showcase privacy page (the link-target edit is Plan 04's scope).
- **Phase 31 (server/learned recipe signing):** the verify path is shipped and proven on a fixture keypair; Phase 31 supplies the real publish key (into `TRUSTED_PUBLIC_KEYS`) + the offline signer, and may land the deferred noble fallback at the marked seam.

## Self-Check: PASSED

- Created files verified on disk: capability-signature.js, service-denylist.js, service-denylist.json, docs/LEGAL.md (all FOUND).
- Task commits verified in git log: 2d48cae9, a8995f1d, 3dd3d10f (all FOUND).
- Plan-03-owned tests GREEN: recipe-signature.test.js (13/13), recipe-signature-interpreter-hook.test.js (8/8), service-denylist.test.js denylist+JSON+LEGAL portions (11/11). Backward-compat GREEN: capability-interpreter (51/51), capability-router (27/27), capability-head-handlers (54/54), capability-mcp-surface (19/19), capability-fetch (26/26), capability-recipe-schema. Guard GREEN: verify-recipe-path-guard.
- Known cross-plan gap (not a defect): service-denylist.test.js gate-integration assertions (5) pending Plan 02 (consent-policy-store.js + FsbConsentGate).

---
*Phase: 30-consent-governance-recipe-signature-verification-audit-legal*
*Completed: 2026-06-21*
